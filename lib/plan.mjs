// Place search (Photon, with Open-Meteo + Nominatim as backups) + route planning (OSRM / great circle)
import { greatCircle, haversine } from "../src/remotion/geo.js";
import { countryLabels } from "./countries.mjs";
import { mapExtras } from "./places.mjs";

const UA = "MalefektTravelMaps/1.0 (personal local app)";
const cache = new Map();

async function getJSON(url, timeoutMs = 20000) {
  if (cache.has(url)) return cache.get(url);
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok && r.status !== 400) throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  const j = await r.json();
  cache.set(url, j);
  return j;
}

export function shortName(p) {
  return p.name || p.city || p.town || p.village || (p.street ? `${p.street}${p.housenumber ? " " + p.housenumber : ""}` : "") || p.county || p.state || p.country || "Unknown";
}

const SEARCH_TIMEOUT = 5000;
const PHOTON_COOLDOWN = 60000; // after a failure, leave Photon alone for a minute
const NOMINATIM_GAP = 1100; // Nominatim's usage policy: max 1 request per second
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unique = (parts, label) => parts.filter(Boolean).filter((v, i, a) => a.indexOf(v) === i && v !== label);

async function photon(q) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en`;
  const j = await getJSON(url, SEARCH_TIMEOUT);
  return (j.features || []).map((f) => {
    const p = f.properties;
    const label = shortName(p);
    const detail = unique([p.osm_value && p.osm_value !== "yes" ? p.osm_value.replace(/_/g, " ") : null, p.city !== label ? p.city : null, p.state, p.country], label);
    return { id: `${p.osm_type}${p.osm_id}`, name: label, label, country: p.country, detail: detail.join(", "), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
  });
}

// Backup for towns and cities. Allows search-as-you-type, but has no addresses or venues.
async function openMeteo(q) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`;
  const j = await getJSON(url, SEARCH_TIMEOUT);
  return (j.results || []).map((r) => ({
    id: `M${r.id}`, name: r.name, label: r.name, country: r.country,
    detail: unique([r.admin1, r.country], r.name).join(", "), lon: r.longitude, lat: r.latitude,
  }));
}

// Backup for addresses and venues. Only used while Photon is down, and throttled so a burst of
// typing sends just the newest query.
let nominatimFree = 0;
let nominatimLatest = 0;
async function nominatim(q) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1&limit=8&accept-language=en`;
  if (!cache.has(url)) {
    const mine = ++nominatimLatest;
    const wait = nominatimFree - Date.now();
    if (wait > 0) await sleep(wait);
    if (mine !== nominatimLatest) return [];
    nominatimFree = Date.now() + NOMINATIM_GAP;
  }
  const j = await getJSON(url, SEARCH_TIMEOUT);
  return j.map((r) => {
    const a = r.address || {};
    const label = r.name || [a.road, a.house_number].filter(Boolean).join(" ") || r.display_name.split(",")[0];
    const detail = unique([r.type && r.type !== "yes" ? r.type.replace(/_/g, " ") : null, a.city || a.town || a.village, a.state, a.country], label);
    return { id: `${r.osm_type[0].toUpperCase()}${r.osm_id}`, name: label, label, country: a.country, detail: detail.join(", "), lon: +r.lon, lat: +r.lat };
  });
}

let photonDownUntil = 0;

export async function search(q) {
  q = (q || "").trim();
  if (q.length < 2) return [];
  if (Date.now() >= photonDownUntil) {
    try { return await photon(q); }
    catch (e) {
      console.warn(`Place search: Photon failed (${e.message}), using backups for a minute.`);
      photonDownUntil = Date.now() + PHOTON_COOLDOWN;
    }
  }
  const results = await Promise.allSettled([nominatim(q), openMeteo(q)]);
  if (results.every((r) => r.status === "rejected")) {
    throw new Error("Place search is down right now. Try again in a minute.");
  }
  const seen = [];
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])).filter((p) => {
    const dupe = seen.some((o) => o.name === p.name && haversine([o.lon, o.lat], [p.lon, p.lat]) < 25000);
    if (!dupe) seen.push(p);
    return !dupe;
  }).slice(0, 8);
}

// Douglas–Peucker simplification (planar, fine for display)
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0, idx = -1;
    const [x1, y1] = pts[s], [x2, y2] = pts[e];
    const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy || 1e-12;
    for (let i = s + 1; i < e; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - x1) * dx + (pts[i][1] - y1) * dy) / L));
      const d = (pts[i][0] - x1 - t * dx) ** 2 + (pts[i][1] - y1 - t * dy) ** 2;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol * tol && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export async function plan(a, b, mode) {
  const r = await planRoute(a, b, mode);
  const pts = r.segments.flatMap((s) => s.coords);
  r.countries = countryLabels(pts);
  Object.assign(r, mapExtras(pts, a, b));
  return r;
}

async function planRoute(a, b, mode) {
  const A = [a.lon, a.lat], B = [b.lon, b.lat];
  const straightKm = haversine(A, B) / 1000;
  if (mode === "plane") {
    return { segments: [{ kind: "plane", coords: greatCircle(A, B, 240) }], distanceKm: Math.round(straightKm), note: null };
  }
  const url = `https://router.project-osrm.org/route/v1/driving/${A[0]},${A[1]};${B[0]},${B[1]}?overview=false&steps=true&geometries=geojson`;
  let j;
  try { j = await getJSON(url); } catch (e) { j = { code: "Error", message: e.message }; }
  if (j.code !== "Ok" || !j.routes?.length) {
    return {
      segments: [{ kind: "ferry", coords: [A, B] }],
      distanceKm: Math.round(straightKm),
      note: "No driving route found between these places, so it's shown as a straight boat crossing.",
    };
  }
  const route = j.routes[0];
  const raw = [];
  for (const leg of route.legs) for (const st of leg.steps) {
    const kind = st.mode === "ferry" ? "ferry" : "car";
    const c = st.geometry.coordinates;
    if (c.length < 2) continue;
    const last = raw[raw.length - 1];
    if (last && last.kind === kind) last.coords.push(...c.slice(1));
    else raw.push({ kind, coords: last ? [last.coords[last.coords.length - 1], ...c.slice(1)] : c.slice() });
  }
  // connect real A/B to the snapped road ends
  if (raw.length) {
    raw[0].coords.unshift(A);
    raw[raw.length - 1].coords.push(B);
  }
  const totalDeg = route.distance / 111000;
  const tol = Math.max(0.00005, totalDeg / 4000);
  const segments = raw.map((s) => ({ kind: s.kind, coords: simplify(s.coords, tol).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]) }));
  const ferryKm = route.legs.flatMap((l) => l.steps).filter((s) => s.mode === "ferry").reduce((t, s) => t + s.distance, 0) / 1000;
  return {
    segments,
    distanceKm: Math.round(route.distance / 1000),
    ferryKm: Math.round(ferryKm),
    note: ferryKm > 0.5 ? `Route includes ${Math.round(ferryKm)} km by ferry (shown as a boat on a dotted line).` : null,
  };
}

export function slug(s) {
  const map = { ø: "o", Ø: "o", æ: "ae", Æ: "ae", ß: "ss", ł: "l", Ł: "l", đ: "d", þ: "th", ð: "d", œ: "oe" };
  const t = s.replace(/[øØæÆßłŁđþðœ]/g, (c) => map[c]).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return t || "place";
}
