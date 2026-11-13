// Usage: node scripts/test-render.mjs "Aarhus" "Copenhagen" car 5 16:9 [stills|video] [gl] [outDir]
import { search, plan, slug } from "../lib/plan.mjs";
import { renderFrames, renderVideo, outputPath } from "../lib/render.mjs";

const [qa, qb, mode = "car", dur = "5", format = "16:9", what = "stills", gl, outDir = "./test-out"] = process.argv.slice(2);
const a = (await search(qa))[0], b = (await search(qb))[0];
console.log("A:", a.label, a.detail, "| B:", b.label, b.detail);
const p = await plan(a, b, mode);
console.log("route:", p.distanceKm, "km", p.note || "", p.segments.map((s) => `${s.kind}:${s.coords.length}`).join(" "));
const props = { a, b, mode, segments: p.segments, countries: p.countries, cities: p.cities, landmarks: p.landmarks, durationSec: +dur, format, scale: 1, audioUrl: null, logoUrl: process.env.LOGO_URL || null };
const t0 = Date.now();
if (what === "video") {
  props.__slug = { slug: `${slug(a.label)}-${slug(b.label)}_${mode}_${dur}s${format === "9:16" ? "_9x16" : ""}` };
  const out = outputPath(props);
  delete props.__slug;
  await renderVideo(props, out, ({ stage, progress }) => process.stdout.write(`\r${stage} ${(progress * 100).toFixed(0)}%   `), gl);
  console.log("\nvideo:", out);
} else {
  const N = +dur * 24;
  const frames = [0, 8, Math.round(N * 0.3), Math.round(N * 0.5), Math.round(N * 0.7), N - 1];
  console.log((await renderFrames(props, frames, outDir, gl)).join("\n"));
}
console.log("took", ((Date.now() - t0) / 1000).toFixed(1), "s");
