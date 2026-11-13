// Picks one label spot (inside the country) for every country visible around a trip.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COUNTRIES = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "countries.json"), "utf8")).map((c) => {
  let minX = 180, maxX = -180, minY = 90, maxY = -90;
  c.polys.forEach((p) => p[0].forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }));
  return { ...c, bbox: [minX, minY, maxX, maxY] };
});

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inCountry(c, x, y) {
  if (x < c.bbox[0] || x > c.bbox[2] || y < c.bbox[1] || y > c.bbox[3]) return false;
  return c.polys.some((p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h)));
}
const norm = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;
const isLand = (x, y) => { const nx = norm(x); return COUNTRIES.some((c) => inCountry(c, nx, y)); };

// How far land continues west and east of a point, in degrees (stops at the first water).
const REACH_MAX = 8;
export function landReach(lon, lat) {
  const toward = (dir) => {
    let d = 0;
    while (d < REACH_MAX) {
      const next = d + Math.max(0.02, d * 0.08);
      if (![0, -0.06, 0.06].every((dy) => isLand(lon + dir * next, lat + dy))) break;
      d = next;
    }
    return +d.toFixed(3);
  };
  return [toward(-1), toward(1)];
}

// The area of the world a trip's camera can show.
export function routeBox(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
  const sx = Math.max(maxX - minX, 1.5), sy = Math.max(maxY - minY, 1);
  const ex = sx < 12 ? sx * 0.9 : Math.max(10, sx * 0.35), ey = sy < 8 ? sy * 0.9 : Math.max(8, sy * 0.45);
  return [minX - ex, Math.max(-75, minY - ey), maxX + ex, Math.min(80, maxY + ey)];
}

// pts: [[lon,lat]...] of the route (longitudes may be unwrapped)
export function countryLabels(pts) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); });
  const sx = Math.max(maxX - minX, 1.5), sy = Math.max(maxY - minY, 1);
  const box = routeBox(pts);
  const G = 70;
  const hits = new Map();
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
    const x = box[0] + ((i + 0.5) / G) * (box[2] - box[0]);
    const y = box[1] + ((j + 0.5) / G) * (box[3] - box[1]);
    const nx = norm(x);
    for (const c of COUNTRIES) {
      if (inCountry(c, nx, y)) {
        if (!hits.has(c)) hits.set(c, []);
        hits.get(c).push([x, y]);
        break;
      }
    }
  }
  const out = [];
  const minHits = G * G * 0.004;
  for (const [c, s] of hits) {
    if (s.length < minHits) continue;
    // shift official label point into the same longitude "copy" as the route
    let lx = c.lx;
    while (lx < box[0] - 1) lx += 360;
    while (lx > box[2] + 1) lx -= 360;
    let spot;
    const offInside = lx >= box[0] && lx <= box[2] && c.ly >= box[1] && c.ly <= box[3];
    if (offInside && s.length > G * G * 0.04) spot = [lx, c.ly];
    else {
      const mx = s.reduce((t, p) => t + p[0], 0) / s.length, my = s.reduce((t, p) => t + p[1], 0) / s.length;
      // the sample with the most same-country neighbours near the middle → well inside the visible part
      let best = s[0], bestScore = -Infinity;
      const cellX = (box[2] - box[0]) / G, cellY = (box[3] - box[1]) / G;
      const set = new Set(s.map((p) => Math.round((p[0] - box[0]) / cellX) + "," + Math.round((p[1] - box[1]) / cellY)));
      s.forEach((p) => {
        const gx = Math.round((p[0] - box[0]) / cellX), gy = Math.round((p[1] - box[1]) / cellY);
        let n = 0;
        for (let dx = -3; dx <= 3; dx++) for (let dy = -2; dy <= 2; dy++) if (set.has(gx + dx + "," + (gy + dy))) n++;
        const d = Math.hypot((p[0] - mx) / sx, (p[1] - my) / sy);
        const score = n - d * 12;
        if (score > bestScore) { bestScore = score; best = p; }
      });
      spot = best;
    }
    // candidate spots through the country; the video picks just one of them for its whole length
    const spots = [spot];
    const gW = (box[2] - box[0]) / G, gH = (box[3] - box[1]) / G;
    const allCells = new Set(s.map((p) => Math.round((p[0] - box[0]) / gW) + "," + Math.round((p[1] - box[1]) / gH)));
    const K = 13;
    const cellW = (box[2] - box[0]) / K, cellH = (box[3] - box[1]) / K;
    const byCell = new Map();
    s.forEach((p) => {
      const k = Math.floor((p[0] - box[0]) / cellW) + "," + Math.floor((p[1] - box[1]) / cellH);
      if (!byCell.has(k)) byCell.set(k, []);
      byCell.get(k).push(p);
    });
    for (const pts of byCell.values()) {
      if (pts.length < (G / K) * (G / K) * 0.12) continue; // enough of this country in the cell
      // most "inland" sample in the cell (most same-country neighbours)
      let best = pts[0], bd = -1;
      pts.forEach((p) => {
        const gx = Math.round((p[0] - box[0]) / ((box[2] - box[0]) / G)), gy = Math.round((p[1] - box[1]) / ((box[3] - box[1]) / G));
        let n = 0;
        for (let dx = -3; dx <= 3; dx++) for (let dy = -1; dy <= 1; dy++) if (allCells.has(gx + dx + "," + (gy + dy))) n++;
        if (n > bd) { bd = n; best = p; }
      });
      if (spots.every((q) => Math.hypot(q[0] - best[0], q[1] - best[1]) > Math.min(cellW, cellH) * 0.8)) spots.push(best);
    }
    out.push({ name: c.name, spots: spots.map((p) => [+p[0].toFixed(3), +p[1].toFixed(3), ...landReach(p[0], p[1])]), weight: s.length, rank: c.rank });
  }
  out.sort((a, b) => b.weight - a.weight);
  return out.slice(0, 45);
}
