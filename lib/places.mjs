// Picks the towns and landmarks worth offering around a trip.
// The video decides which of them actually fit (src/remotion/labels.js).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { haversine } from "../src/remotion/geo.js";
import { landReach, routeBox } from "./countries.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, "data", f), "utf8"));
const CITIES = read("cities.json").map(([name, lon, lat, pop]) => ({ name, lon, lat, pop }));
const LANDMARKS = read("landmarks.json");

const MAX_CITIES = 220;
const MAX_LANDMARKS = 14;
const CITY_CORRIDOR_M = 60000;
const GRID = 14;
const PER_CELL = 3;

// shift a longitude onto the same "copy" of the world as the (unwrapped) route
function inBox(lon, lat, box) {
  if (lat < box[1] || lat > box[3]) return null;
  for (const l of [lon, lon - 360, lon + 360]) if (l >= box[0] && l <= box[2]) return l;
  return null;
}

export function mapExtras(pts, a, b) {
  const box = routeBox(pts);
  const ends = [[a.lon, a.lat], [b.lon, b.lat]];
  const endNames = new Set([a.label, a.name, b.label, b.name].filter(Boolean).map((s) => s.toLowerCase()));
  const step = Math.max(1, Math.ceil(pts.length / 80));
  const samples = pts.filter((_, i) => i % step === 0).concat([pts[pts.length - 1]]);
  const routeDist = (ll) => samples.reduce((m, p) => Math.min(m, haversine(p, ll)), Infinity);
  const nearEnd = (ll, m) => ends.some((e) => haversine(e, ll) < m);

  // spread of towns across the whole view, plus the ones right along the road
  const local = [];
  for (const c of CITIES) {
    const lon = inBox(c.lon, c.lat, box);
    if (lon === null || endNames.has(c.name.toLowerCase()) || nearEnd([lon, c.lat], 6000)) continue;
    local.push({ ...c, lon });
  }
  const cells = new Map();
  const chosen = new Set();
  for (const c of local) { // already biggest first
    const k = Math.floor(((c.lon - box[0]) / (box[2] - box[0])) * GRID) + "," + Math.floor(((c.lat - box[1]) / (box[3] - box[1])) * GRID);
    const n = cells.get(k) || 0;
    if (n < PER_CELL) { cells.set(k, n + 1); chosen.add(c); }
  }
  let corridor = 0;
  for (const c of local) {
    if (corridor >= 60) break;
    if (routeDist([c.lon, c.lat]) < CITY_CORRIDOR_M) { chosen.add(c); corridor++; }
  }
  const cities = [...chosen].sort((p, q) => q.pop - p.pop).slice(0, MAX_CITIES).map((c) => {
    const [west, east] = landReach(c.lon, c.lat);
    return { name: c.name, lon: c.lon, lat: c.lat, pop: c.pop, west, east };
  });

  const landmarks = LANDMARKS.flatMap((l) => {
    const lon = inBox(l.lon, l.lat, box);
    if (lon === null || nearEnd([lon, l.lat], 1500)) return [];
    return [{ ...l, lon, d: routeDist([lon, l.lat]) }];
  }).sort((p, q) => p.d - q.d).slice(0, MAX_LANDMARKS).map(({ d, ...l }) => {
    const [west, east] = landReach(l.lon, l.lat);
    return { ...l, west, east };
  });

  // a town that's also a landmark (Odense, Ribe…) gets just the landmark label
  const landmarkNames = new Set(landmarks.map((l) => l.name));
  return { cities: cities.filter((c) => !landmarkNames.has(c.name)), landmarks };
}
