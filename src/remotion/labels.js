// Decides, once per video, where every map label goes and when it shows.
// Remotion renders frames in any order and across several tabs, so the whole timeline is planned
// up front: each country gets ONE fixed spot, and labels fade instead of popping.
import { haversine } from "./geo.js";

const FADE = 7; // frames
const MAX_GAP = 8; // a label hidden for this few frames stays up instead of blinking
const MIN_RUN = { country: 12, landmark: 22, city: 14 };
const OPEN_LAND_DEG = 0.5; // a spot with this much land either side counts as fully inland

export const boxOf = (cx, cy, w, h) => ({ x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 });
const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

// clean up a frame-by-frame yes/no into steady stretches
function steady(ok, minRun) {
  const N = ok.length;
  const on = Uint8Array.from(ok);
  let last = -1;
  for (let f = 0; f < N; f++) {
    if (!on[f]) continue;
    if (last >= 0 && f - last > 1 && f - last - 1 <= MAX_GAP) on.fill(1, last + 1, f);
    last = f;
  }
  for (let f = 0; f < N;) {
    if (!on[f]) { f++; continue; }
    let e = f;
    while (e + 1 < N && on[e + 1]) e++;
    if (e - f + 1 < minRun) on.fill(0, f, e + 1);
    f = e + 1;
  }
  return on;
}

function fades(on) {
  const N = on.length;
  const alpha = new Float32Array(N);
  for (let f = 0; f < N;) {
    if (!on[f]) { f++; continue; }
    let e = f;
    while (e + 1 < N && on[e + 1]) e++;
    for (let i = f; i <= e; i++) {
      const fadeIn = f === 0 ? 1 : (i - f + 1) / FADE;
      const fadeOut = e === N - 1 ? 1 : (e - i + 1) / FADE;
      alpha[i] = Math.min(1, fadeIn, fadeOut);
    }
    f = e + 1;
  }
  return alpha;
}

export function planLabels({ map, tl, zoff, cfg, props, W, H, u, edgeT, reservedAt }) {
  const N = tl.camera.length;
  const margin = edgeT + 18 * u;
  const cl = cfg.countryLabels, ct = cfg.cityLabels, lm = cfg.landmarks;

  // every geographic point we'll need on screen
  const points = [];
  const addPoint = (ll) => points.push(ll) - 1;

  const countries = !cl.enabled ? [] : (props.countries || []).map((c) => {
    const text = cl.uppercase ? c.name.toUpperCase() : c.name;
    const fs = cl.size * u;
    return {
      text, w: text.length * fs * (0.62 + cl.letterSpacing), h: fs * 1.3,
      spots: c.spots.map(([lon, lat, west, east]) => ({
        ll: [lon, lat], c: addPoint([lon, lat]), l: addPoint([lon - west, lat]), r: addPoint([lon + east, lat]),
        inland: Math.min(1, Math.min(west, east) / OPEN_LAND_DEG),
      })),
    };
  });

  const sideOf = (p) => (p.east >= p.west ? 1 : -1);
  const pinned = (p, kind, w, h, extra) => {
    const side = sideOf(p);
    return { kind, side, w, h, ll: [p.lon, p.lat], pt: addPoint([p.lon, p.lat]), ...extra };
  };
  const landmarks = !lm.enabled ? [] : (props.landmarks || []).map((p) => {
    const w = Math.max(p.name.length * lm.nameSize * u * 0.6, p.note.length * lm.noteSize * u * 0.6) + (lm.marker + 30) * u;
    return pinned(p, "landmark", w, (lm.nameSize + lm.noteSize) * u * 1.3 + 8 * u, { name: p.name, note: p.note });
  });
  const cities = !ct.enabled ? [] : (props.cities || []).map((p) =>
    pinned(p, "city", p.name.length * ct.size * u * 0.6 + 26 * u, ct.size * u * 1.25, { name: p.name }));

  // walk the camera through the whole video
  const xy = new Float32Array(points.length * N * 2);
  const occupied = [];
  for (let f = 0; f < N; f++) {
    const cam = tl.camera[f];
    map.jumpTo({ center: cam.center, zoom: cam.zoom + zoff, pitch: cam.pitch, bearing: cam.bearing });
    const project = (ll) => map.project(ll);
    occupied.push(reservedAt(project));
    points.forEach((ll, i) => {
      const k = (f * points.length + i) * 2;
      if (tl.globe && haversine(cam.center, ll) > 7500000) { xy[k] = xy[k + 1] = NaN; return; }
      const q = project(ll);
      xy[k] = q.x; xy[k + 1] = q.y;
    });
  }
  const X = (f, i) => xy[(f * points.length + i) * 2];
  const Y = (f, i) => xy[(f * points.length + i) * 2 + 1];

  const inFrame = (b) => b.x0 >= margin && b.x1 <= W - margin && b.y0 >= margin && b.y1 <= H - margin;
  const free = (f, b) => !occupied[f].some((t) => hit(t, b));
  const counts = { country: new Uint8Array(N), landmark: new Uint8Array(N), city: new Uint8Array(N) };

  const commit = (kind, boxAt, ok) => {
    const on = steady(ok, MIN_RUN[kind]);
    let any = false;
    for (let f = 0; f < N; f++) {
      if (!on[f]) continue;
      const b = boxAt(f);
      if (!b) { on[f] = 0; continue; }
      occupied[f].push(b);
      counts[kind][f]++;
      any = true;
    }
    return any ? fades(on) : null;
  };

  const items = [];

  // ---------- countries: pick the single best spot, then stay there ----------
  for (const c of countries) {
    let best = null, bestScore = 0;
    c.spots.forEach((s, idx) => {
      const ok = new Uint8Array(N);
      let n = 0;
      for (let f = 0; f < N; f++) {
        if (counts.country[f] >= cl.max) continue;
        const x = X(f, s.c), y = Y(f, s.c);
        if (Number.isNaN(x)) continue;
        const b = boxOf(x, y, c.w, c.h);
        if (!inFrame(b) || !free(f, b)) continue;
        if (X(f, s.l) > b.x0 || X(f, s.r) < b.x1) continue; // whole name must sit on land
        ok[f] = 1; n++;
      }
      const score = n * (idx === 0 ? 1.15 : 1) * (1 + 0.4 * s.inland); // on screen longest, on open land
      if (score > bestScore) { bestScore = score; best = { s, ok }; }
    });
    if (!best) continue;
    const { s, ok } = best;
    const alpha = commit("country", (f) => {
      const x = X(f, s.c);
      return Number.isNaN(x) ? null : boxOf(x, Y(f, s.c), c.w, c.h);
    }, ok);
    if (alpha) items.push({ kind: "country", text: c.text, ll: points[s.c], alpha });
  }

  // ---------- landmarks first (they're the interesting bit), then towns, biggest first ----------
  const place = (p, max, pad) => {
    const boxAt = (f) => {
      const x = X(f, p.pt);
      if (Number.isNaN(x)) return null;
      return boxOf(x + (p.side * p.w) / 2, Y(f, p.pt), p.w + pad, p.h + pad);
    };
    const ok = new Uint8Array(N);
    for (let f = 0; f < N; f++) {
      if (counts[p.kind][f] >= max) continue;
      const b = boxAt(f);
      if (b && inFrame(b) && free(f, b)) ok[f] = 1;
    }
    const alpha = commit(p.kind, boxAt, ok);
    if (alpha) items.push({ kind: p.kind, name: p.name, note: p.note, side: p.side, ll: p.ll, alpha });
  };
  landmarks.forEach((p) => place(p, lm.max, 16 * u));
  cities.forEach((p) => place(p, ct.max, 22 * u));

  return items;
}
