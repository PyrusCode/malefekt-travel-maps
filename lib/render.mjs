// Bundles the Remotion project (cached) and renders MP4s / stills.
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition, ensureBrowser } from "@remotion/renderer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RENDERS_DIR = path.join(os.homedir(), "Desktop", "Renders");

async function loadCfg() {
  const p = path.join(ROOT, "config.js");
  return (await import(`${p}?t=${fs.statSync(p).mtimeMs}`)).default;
}

function srcStamp() {
  const files = [path.join(ROOT, "config.js")];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else files.push(p);
  });
  walk(path.join(ROOT, "src", "remotion"));
  walk(path.join(ROOT, "public", "sfx"));
  walk(path.join(ROOT, "public", "fonts"));
  return files.map((f) => f + fs.statSync(f).mtimeMs).join("|");
}

let bundled = null; // {stamp, url}
let bundling = null;
export async function getBundle(onProgress) {
  const stamp = srcStamp();
  if (bundled && bundled.stamp === stamp) return bundled.url;
  if (bundling && bundling.stamp === stamp) return bundling.promise;
  const promise = bundle({
    entryPoint: path.join(ROOT, "src", "remotion", "index.jsx"),
    publicDir: path.join(ROOT, "public"),
    onProgress: (p) => onProgress?.(p / 100),
  }).then((url) => { bundled = { stamp, url }; bundling = null; return url; });
  bundling = { stamp, promise };
  return promise;
}

export async function prepare() {
  await ensureBrowser();
  return getBundle();
}

export function outputPath(props) {
  const { slug } = props.__slug;
  fs.mkdirSync(RENDERS_DIR, { recursive: true });
  let name = `${slug}.mp4`, i = 2;
  while (fs.existsSync(path.join(RENDERS_DIR, name))) name = `${slug}-${i++}.mp4`;
  return path.join(RENDERS_DIR, name);
}

export async function renderVideo(inputProps, output, onProgress, gl) {
  const cfg = await loadCfg();
  onProgress?.({ stage: "Preparing", progress: 0 });
  const serveUrl = await getBundle((p) => onProgress?.({ stage: "Preparing", progress: p * 0.1 }));
  const chromiumOptions = { gl: gl || cfg.render.chromiumGl };
  const composition = await selectComposition({ serveUrl, id: "TravelMap", inputProps, chromiumOptions, timeoutInMilliseconds: 120000 });
  await renderMedia({
    composition, serveUrl, codec: "h264", outputLocation: output, inputProps, chromiumOptions,
    crf: cfg.render.quality, pixelFormat: "yuv420p", concurrency: cfg.render.concurrency,
    timeoutInMilliseconds: 120000, audioCodec: "aac",
    onProgress: ({ progress }) => onProgress?.({ stage: "Rendering", progress: 0.1 + progress * 0.9 }),
  });
  return output;
}

export async function renderFrames(inputProps, frames, outDir, gl) {
  const cfg = await loadCfg();
  const serveUrl = await getBundle();
  const chromiumOptions = { gl: gl || cfg.render.chromiumGl };
  const composition = await selectComposition({ serveUrl, id: "TravelMap", inputProps, chromiumOptions, timeoutInMilliseconds: 120000 });
  fs.mkdirSync(outDir, { recursive: true });
  const out = [];
  for (const frame of frames) {
    const f = Math.min(frame, composition.durationInFrames - 1);
    const p = path.join(outDir, `frame-${String(f).padStart(3, "0")}.png`);
    await renderStill({ composition, serveUrl, output: p, frame: f, inputProps, chromiumOptions, timeoutInMilliseconds: 120000 });
    out.push(p);
  }
  return out;
}
