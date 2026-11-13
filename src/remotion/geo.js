// Pure math: distances, route sampling, camera path, typing schedule.
// Everything here is deterministic per frame (Remotion renders frames in any order).

const R = 6371008.8;
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function haversine(a, b) {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Web Mercator normalised 0..1
export const mercX = (lon) => (lon + 180) / 360;
export const mercY = (lat) => {
  const s = Math.sin(toRad(clamp(lat, -85, 85)));
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
};
export const unmercY = (y) => toDeg(Math.atan(Math.sinh(Math.PI * (1 - 2 * y))));

// Great circle with longitudes unwrapped (continuous across the antimeridian)
export function greatCircle(a, b, n = 220) {
  const [l1, p1, l2, p2] = [toRad(a[0]), toRad(a[1]), toRad(b[0]), toRad(b[1])];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    if (d < 1e-9) { out.push([a[0], a[1]]); continue; }
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    out.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return unwrap(out);
}

export function unwrap(coords) {
  const out = [coords[0].slice()];
  for (let i = 1; i < coords.length; i++) {
    let lon = coords[i][0];
    const prev = out[i - 1][0];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, coords[i][1]]);
  }
  return out;
}

// Build a single measured path out of segments [{kind, coords}]
export function buildPath(segments) {
  const pts = [];
  const cum = [];
  const kinds = []; // kind of the piece starting at index i
  const segRanges = [];
  let total = 0;
  segments.forEach((seg) => {
    const c = seg.coords;
    if (!c || c.length < 2) return;
    const startIdx = pts.length;
    c.forEach((p, j) => {
      if (pts.length && j === 0) {
        const last = pts[pts.length - 1];
        if (last[0] === p[0] && last[1] === p[1]) { kinds[pts.length - 1] = seg.kind; return; }
      }
      if (pts.length) total += haversine(pts[pts.length - 1], p);
      pts.push(p);
      cum.push(total);
      kinds.push(seg.kind);
    });
    segRanges.push({ kind: seg.kind, from: cum[Math.max(0, startIdx - 1)] ?? 0, to: total });
  });
  return { pts: unwrap(pts), cum, kinds, total, segRanges };
}

// Position at distance d along the path → {pos, kind, idx}
export function pointAt(path, d) {
  const { pts, cum, kinds } = path;
  if (d <= 0) return { pos: pts[0], kind: kinds[0], idx: 0 };
  if (d >= path.total) return { pos: pts[pts.length - 1], kind: kinds[pts.length - 2] ?? kinds[0], idx: pts.length - 1 };
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid; else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (d - cum[lo]) / seg;
  return {
    pos: [lerp(pts[lo][0], pts[hi][0], t), lerp(pts[lo][1], pts[hi][1], t)],
    kind: kinds[lo],
    idx: lo,
  };
}

// GeoJSON of the path drawn up to distance d, split by kind
export function partialRoute(path, d) {
  const features = [];
  if (d <= 0) return { type: "FeatureCollection", features };
  const end = pointAt(path, d);
  let cur = null;
  for (let i = 0; i <= end.idx; i++) {
    const k = path.kinds[i];
    if (!cur || cur.kind !== k) {
      if (cur) cur.coords.push(path.pts[i]);
      cur = { kind: k, coords: [path.pts[i]] };
      features.push(cur);
    } else cur.coords.push(path.pts[i]);
  }
  cur.coords.push(end.pos);
  return {
    type: "FeatureCollection",
    features: features
      .filter((f) => f.coords.length >= 2)
      .map((f) => ({ type: "Feature", properties: { kind: f.kind }, geometry: { type: "LineString", coordinates: f.coords } })),
  };
}

// ---------- camera fitting ----------
const TILE = 512;

function fitMercator(points, W, H, pad) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  points.forEach(([lon, lat]) => {
    const x = mercX(lon), y = mercY(lat);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  });
  const dx = Math.max(maxX - minX, 1e-6), dy = Math.max(maxY - minY, 1e-6);
  const zoom = Math.log2(Math.min((W * (1 - pad.x)) / (dx * TILE), (H * (1 - pad.y)) / (dy * TILE)));
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return { center: [cx * 360 - 180, unmercY(cy)], zoom };
}

// Orthographic fit for the globe projection
function fitGlobe(points, center, W, H, pad) {
  const [lc, pc] = [toRad(center[0]), toRad(center[1])];
  let mx = 1e-6, my = 1e-6;
  points.forEach(([lon, lat]) => {
    const l = toRad(lon), p = toRad(lat);
    const x = Math.cos(p) * Math.sin(l - lc);
    const y = Math.cos(pc) * Math.sin(p) - Math.sin(pc) * Math.cos(p) * Math.cos(l - lc);
    mx = Math.max(mx, Math.abs(x)); my = Math.max(my, Math.abs(y));
  });
  const radius = Math.min((W / 2) * (1 - pad.x) / mx, (H / 2) * (1 - pad.y) / my);
  // MapLibre globe: radius = worldSize / (2π) / cos(lat)  (matches mercator scale at center)
  const worldSize = radius * 2 * Math.PI * Math.cos(pc);
  return { center, zoom: Math.log2(worldSize / TILE) };
}

function midpointOnPath(path) {
  return pointAt(path, path.total / 2).pos;
}

// ---------- full timeline ----------
export function makeTimeline({ props, cfg, W0, H0, fps, durationInFrames }) {
  const path = buildPath(props.segments);
  const N = durationInFrames;
  const hold = Math.round(cfg.camera.holdSeconds * fps);
  const intro = Math.round(clamp(cfg.camera.introSeconds * fps, 8, N * 0.2));
  const travelStart = intro;
  const travelEnd = Math.max(travelStart + 6, N - hold);
  const travelFrames = travelEnd - travelStart;

  const straightKm = haversine(path.pts[0], path.pts[path.pts.length - 1]) / 1000;
  const globe = straightKm > cfg.camera.globeAboveKm;
  const isPlane = props.mode === "plane";

  const pad = W0 > H0 ? { x: 0.38, y: 0.42 } : { x: 0.32, y: 0.5 };
  const samplePts = path.pts.filter((_, i) => i % Math.max(1, Math.floor(path.pts.length / 400)) === 0).concat([path.pts[path.pts.length - 1]]);
  let overview;
  if (globe) overview = fitGlobe(samplePts, midpointOnPath(path), W0, H0, pad);
  else overview = fitMercator(samplePts, W0, H0, pad);
  overview.zoom = clamp(overview.zoom, 0.6, cfg.camera.maxZoom - 0.6);

  const followZoom = clamp(overview.zoom + Math.log2(1 / clamp(cfg.camera.followDistance, 0.05, 1)), 0.6, cfg.camera.maxZoom);
  const boost = isPlane ? cfg.camera.planeZoomBoost : 0;

  // vehicle distance per frame (constant speed)
  const progressAt = (f) => clamp((f - travelStart) / travelFrames, 0, 1);
  const distAt = (f) => progressAt(f) * path.total;

  // smoothed camera target (moving average of vehicle positions)
  const w = Math.max(2, Math.round(fps * 0.45));
  const camTarget = (f) => {
    let sx = 0, sy = 0, n = 0;
    for (let k = -w; k <= w; k++) {
      const p = pointAt(path, distAt(f + k)).pos;
      sx += mercX(p[0]); sy += mercY(p[1]); n++;
    }
    return [ (sx / n) * 360 - 180, unmercY(sy / n) ];
  };

  const transFrames = Math.max(4, Math.round(Math.min(fps * 0.75, travelFrames * 0.35)));
  const planeBump = (p) => smoothstep(0, 0.3, p) * (1 - smoothstep(0.7, 1, p)); // 0 at ends, 1 mid-flight

  const camera = [];
  const offsets = [];
  let prev = null;
  let tx = 0, ty = 0;
  for (let f = 0; f < N; f++) {
    const p = progressAt(f);
    const zFollow = followZoom + boost * (1 - planeBump(p)) - (isPlane ? 0 : 0);
    const target = camTarget(f);
    let center, zoom;
    if (f < travelStart) {
      center = overview.center; zoom = overview.zoom;
    } else {
      const e = easeInOut(clamp((f - travelStart) / transFrames, 0, 1));
      let oc = overview.center.slice();
      while (oc[0] - target[0] > 180) oc[0] -= 360;
      while (oc[0] - target[0] < -180) oc[0] += 360;
      center = [
        lerp(mercX(oc[0]), mercX(target[0]), e) * 360 - 180,
        unmercY(lerp(mercY(oc[1]), mercY(target[1]), e)),
      ];
      zoom = lerp(overview.zoom, Math.min(cfg.camera.maxZoom, zFollow), e);
    }
    const cam = { center, zoom, pitch: cfg.camera.pitch, bearing: 0 };
    camera.push(cam);

    // paper texture offset that moves with the map (integrated screen motion)
    const texScale = Math.pow(2, (zoom - overview.zoom) * 0.22);
    if (prev) {
      const ws = TILE * Math.pow(2, zoom);
      let dlon = center[0] - prev.center[0];
      if (dlon > 180) dlon -= 360; if (dlon < -180) dlon += 360;
      tx += (dlon / 360) * ws / texScale;
      ty += (mercY(center[1]) - mercY(prev.center[1])) * ws / texScale;
    }
    offsets.push({ tx, ty, texScale });
    prev = cam;
  }

  return {
    path, N, hold, intro, travelStart, travelEnd, travelFrames, globe, isPlane,
    camera, offsets, distAt, progressAt, planeBump, straightKm,
  };
}

// ---------- typewriter schedule ----------
export function typingSchedule(text, start, maxFrames, fps, cps) {
  const chars = [...text];
  let interval = fps / cps;
  if (chars.length * interval > maxFrames) interval = Math.max(0.5, maxFrames / Math.max(1, chars.length));
  return chars.map((c, i) => ({ c, at: Math.round(start + i * interval) }));
}
