// Procedural, seeded (deterministic) textures drawn on canvases.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Tileable value noise with integer period
function makeNoise(seed, period) {
  const r = rng(seed);
  const g = new Float32Array(period * period);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const m = (n) => ((n % period) + period) % period;
    const x0 = m(xi), x1 = m(xi + 1), y0 = m(yi), y1 = m(yi + 1);
    const a = g[y0 * period + x0], b = g[y0 * period + x1], c = g[y1 * period + x0], d = g[y1 * period + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbm(seed, basePeriod, octaves) {
  const ns = [];
  for (let o = 0; o < octaves; o++) ns.push({ n: makeNoise(seed + o * 101, basePeriod << o), f: basePeriod << o });
  return (u, v) => { // u,v in 0..1 (tileable)
    let s = 0, amp = 1, tot = 0;
    for (const { n, f } of ns) { s += n(u * f, v * f) * amp; tot += amp; amp *= 0.5; }
    return s / tot;
  };
}

const canvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
};

const toURL = (c) => new Promise((res) => c.toBlob((b) => res(URL.createObjectURL(b)), "image/png"));

// ---------- Paper (moves with the map) ----------
// Returns two tiles: "dark" (multiply: stains, fibres, crease shadows) and "light" (screen: crease highlights)
export async function makePaper(cfg) {
  const S = 768;
  const dark = canvas(S, S), light = canvas(S, S);
  const dctx = dark.getContext("2d"), lctx = light.getContext("2d");
  const D = dctx.createImageData(S, S), L = lctx.createImageData(S, S);
  const big = fbm(11, 3, 4), mid = fbm(29, 12, 3), fine = fbm(53, 96, 2), wob = fbm(77, 4, 2);
  const strength = cfg.paper.textureStrength;
  const fold = cfg.paper.foldLines ? cfg.paper.foldStrength : 0;
  const c = S / 2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      const b = big(u, v), m = mid(u, v), f = fine(u, v);
      let d = 0;
      d += Math.max(0, (b - 0.5) * 2.2) * 46; // big stains
      d += (m - 0.5) * 22 + 6; // mottling
      d += (f - 0.5) * 16; // fibres
      const ring = Math.abs(Math.sin(b * 28)) < 0.06 && b > 0.62 ? 10 : 0; // faint coffee rings
      d = Math.max(0, d * strength + ring * strength);

      let hi = 0;
      if (fold > 0) {
        const wx = (wob(v, 0.3) - 0.5) * 6, wy = (wob(0.7, u) - 0.5) * 6;
        const dx = x - c - wx, dy = y - c - wy;
        // crease: thin dark line + soft shadow on one side + highlight on the other
        d += fold * (36 * Math.exp(-(dx * dx) / 3) + 16 * Math.exp(-Math.max(0, dx) / 34) * (dx > 0 ? 1 : 0));
        d += fold * (36 * Math.exp(-(dy * dy) / 3) + 16 * Math.exp(-Math.max(0, dy) / 34) * (dy > 0 ? 1 : 0));
        hi += fold * (60 * Math.exp(-((dx + 3) * (dx + 3)) / 4) * (dx < 0 ? 1 : 0.3));
        hi += fold * (60 * Math.exp(-((dy + 3) * (dy + 3)) / 4) * (dy < 0 ? 1 : 0.3));
        // wear where folds cross
        const r2 = dx * dx + dy * dy;
        d += fold * 26 * Math.exp(-r2 / 900) * (0.6 + f);
      }
      const i = (y * S + x) * 4;
      D.data[i] = 255 - d * 0.75; D.data[i + 1] = 255 - d * 0.95; D.data[i + 2] = 255 - d * 1.3; D.data[i + 3] = 255;
      const h = Math.min(255, hi);
      L.data[i] = h; L.data[i + 1] = h * 0.95; L.data[i + 2] = h * 0.82; L.data[i + 3] = 255;
    }
  }
  dctx.putImageData(D, 0, 0);
  lctx.putImageData(L, 0, 0);
  return { dark: await toURL(dark), light: await toURL(light), size: S };
}

// ---------- Burnt edges (fixed to the frame) ----------
export async function makeBurntEdges(W, H, thickness) {
  const c = canvas(W, H);
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, H);
  const t = thickness;
  const n1 = fbm(5, 6, 5), n2 = fbm(17, 40, 2);
  const band = t * 2.2;
  const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  for (let y = 0; y < H; y++) {
    const dyEdge = Math.min(y, H - 1 - y);
    for (let x = 0; x < W; x++) {
      const d0 = Math.min(x, W - 1 - x, dyEdge);
      if (d0 > band) { x = Math.max(x, W - 1 - Math.ceil(band) - 1); continue; }
      const u = x / W, v = y / H;
      const n = n1(u, v) - 0.5, m = n2(u, v) - 0.5;
      const d = d0 + n * t * 1.5 + m * t * 0.35;
      const i = (y * W + x) * 4;
      let r, g, b, a;
      if (d < t * 0.32) { r = 16; g = 10; b = 6; a = 255; } // table / hole
      else if (d < t * 0.5) { // charred rim
        const k = sm(t * 0.32, t * 0.5, d);
        r = 18 + k * 30; g = 11 + k * 14; b = 6 + k * 4; a = 255;
      } else if (d < t * 0.95) { // scorched
        const k = sm(t * 0.5, t * 0.95, d);
        r = 48 + k * 70; g = 25 + k * 38; b = 10 + k * 12; a = 255 * (1 - k * 0.75);
      } else { // toasted paper
        const k = sm(t * 0.95, band, d);
        r = 118; g = 66; b = 24; a = 64 * (1 - k);
      }
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toURL(c);
}

// ---------- Film grain (a few tiles cycled per frame) ----------
export async function makeGrain(count = 6, S = 256) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const c = canvas(S, S);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(S, S);
    const r = rng(900 + k);
    for (let i = 0; i < S * S; i++) {
      const v = 128 + (r() + r() + r() - 1.5) * 120;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    out.push(await toURL(c));
  }
  return out;
}

// ---------- Hand-drawn wave marks (MapLibre fill-pattern image) ----------
export function makeWavesImage(cfg) {
  const S = 512; // drawn at pixelRatio 2 → 256 css px tile
  const c = canvas(S, S);
  const ctx = c.getContext("2d");
  const r = rng(4242);
  ctx.strokeStyle = cfg.waves.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const n = cfg.waves.density;
  const sz = cfg.waves.size;
  // jittered grid placement so marks are spread evenly but organically
  const cells = Math.ceil(Math.sqrt(n));
  let placed = 0;
  for (let gy = 0; gy < cells && placed < n; gy++) {
    for (let gx = 0; gx < cells && placed < n; gx++) {
      placed++;
      const cx = ((gx + 0.2 + r() * 0.6) / cells) * S;
      const cy = ((gy + 0.2 + r() * 0.6) / cells) * S;
      const humps = 2 + Math.floor(r() * 2);
      const hw = (13 + r() * 6) * sz, hh = (7 + r() * 3) * sz;
      const rows = r() < 0.55 ? 2 : 1;
      for (let row = 0; row < rows; row++) {
        ctx.lineWidth = (2.8 - row * 0.6) * sz;
        ctx.globalAlpha = 1 - row * 0.25;
        const x0 = cx - (humps * hw) / 2 + row * hw * 0.5;
        const y0 = cy + row * hh * 1.6;
        const hp = row ? humps - 1 : humps;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        for (let h = 0; h < hp; h++) {
          const xs = x0 + h * hw;
          const j = (r() - 0.5) * 2.5 * sz;
          ctx.bezierCurveTo(xs + hw * 0.25, y0 - hh + j, xs + hw * 0.6, y0 - hh * 1.05 + j, xs + hw, y0);
        }
        ctx.stroke();
      }
    }
  }
  return ctx.getImageData(0, 0, S, S);
}

// ---------- Logo → dark ink stamp ----------
export function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

export async function makeInkLogo(src, cfg) {
  const im = await loadImage(src);
  const w = im.naturalWidth, h = im.naturalHeight;
  const c = canvas(w, h);
  const ctx = c.getContext("2d");
  ctx.drawImage(im, 0, 0);
  const d = ctx.getImageData(0, 0, w, h);
  const hex = cfg.logo.inkColor.replace("#", "");
  const ir = parseInt(hex.slice(0, 2), 16), ig = parseInt(hex.slice(2, 4), 16), ib = parseInt(hex.slice(4, 6), 16);
  const th = cfg.logo.threshold;
  const ph = (cfg.logo.paperColor || "#e6d3a8").replace("#", "");
  const pr = parseInt(ph.slice(0, 2), 16), pg = parseInt(ph.slice(2, 4), 16), pb = parseInt(ph.slice(4, 6), 16);
  let transparent = 0;
  for (let i = 3; i < d.data.length; i += 16) if (d.data[i] < 20) transparent++;
  const mode = cfg.logo.mode === "auto" ? (transparent / (d.data.length / 16) > 0.08 ? "lines" : "light") : cfg.logo.mode;
  for (let i = 0; i < d.data.length; i += 4) {
    const lum = (0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]) / 255;
    const a = d.data[i + 3] / 255;
    const v = mode === "lines" ? 1 - lum : lum;
    const ink = Math.min(1, Math.max(0, (v - th) / (0.9 - th)));
    if (mode === "lines") {
      // engraving: dark lines = ink, white parts = cream paper (readable on land and sea)
      const po = cfg.logo.paperOpacity;
      const alpha = (po * (1 - ink) + ink) * a;
      const k = alpha > 0 ? ink * a / alpha : 0;
      d.data[i] = pr + (ir - pr) * k; d.data[i + 1] = pg + (ig - pg) * k; d.data[i + 2] = pb + (ib - pb) * k; d.data[i + 3] = alpha * 255;
    } else {
      d.data[i] = ir; d.data[i + 1] = ig; d.data[i + 2] = ib; d.data[i + 3] = ink * a * 255;
    }
  }
  ctx.putImageData(d, 0, 0);
  return { url: await toURL(c), aspect: h / w };
}
