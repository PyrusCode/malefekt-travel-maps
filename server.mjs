// Malefekt Travel Maps — local server: UI (Vite), place search, routing, rendering.
import express from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createServer as createVite } from "vite";
import react from "@vitejs/plugin-react";
import { search, plan, slug } from "./lib/plan.mjs";
import { prepare, renderVideo, outputPath, RENDERS_DIR } from "./lib/render.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3123;
const BASE = `http://localhost:${PORT}`;
const UPLOADS = path.join(ROOT, "public", "uploads");
fs.mkdirSync(UPLOADS, { recursive: true });

const app = express();
app.use((req, res, next) => { res.setHeader("Access-Control-Allow-Origin", "*"); next(); });

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.get("/api/search", async (req, res) => {
  try { res.json(await search(String(req.query.q || ""))); }
  catch (e) { res.status(502).json({ error: e.message }); }
});

app.post("/api/plan", express.json(), async (req, res) => {
  try {
    const { a, b, mode } = req.body;
    res.json(await plan(a, b, mode));
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// logo from assets/logo.png (served with CORS so the renderer can turn it into ink)
app.get("/logo.png", (req, res) => {
  const p = path.join(ROOT, "assets", "logo.png");
  if (!fs.existsSync(p)) return res.status(404).end();
  res.sendFile(p);
});
app.get("/api/logo", (req, res) => {
  const p = path.join(ROOT, "assets", "logo.png");
  res.json({ url: fs.existsSync(p) ? `${BASE}/logo.png?v=${Math.round(fs.statSync(p).mtimeMs)}` : null });
});

// audio upload (raw body)
app.post("/api/audio", express.raw({ type: "*/*", limit: "200mb" }), (req, res) => {
  const ext = (path.extname(String(req.query.name || "")).toLowerCase() || ".mp3").replace(/[^.a-z0-9]/g, "");
  const hash = crypto.createHash("sha1").update(req.body).digest("hex").slice(0, 12);
  const file = `tune-${hash}${ext}`;
  fs.writeFileSync(path.join(UPLOADS, file), req.body);
  res.json({ url: `${BASE}/uploads/${file}` });
});
app.use("/uploads", express.static(UPLOADS));

// rendering jobs
const jobs = new Map();
let queue = Promise.resolve();
app.post("/api/render", express.json({ limit: "20mb" }), (req, res) => {
  const props = req.body;
  const fmt = props.format === "9:16" ? "_9x16" : "";
  const name = `${slug(props.a.label)}-${slug(props.b.label)}_${props.mode}_${props.durationSec}s${fmt}`;
  const out = outputPath({ __slug: { slug: name } });
  const id = crypto.randomUUID();
  const job = { id, stage: "Waiting", progress: 0, done: false, error: null, file: out };
  jobs.set(id, job);
  fs.writeFileSync(out, ""); // reserve the name
  queue = queue.then(() =>
    renderVideo({ ...props, scale: 1 }, out, (p) => Object.assign(job, p))
      .then(() => Object.assign(job, { done: true, progress: 1, stage: "Done" }))
      .catch((e) => { console.error(e); try { fs.unlinkSync(out); } catch {} Object.assign(job, { error: String(e.message || e), stage: "Failed" }); }),
  );
  res.json({ id, file: out });
});
app.get("/api/render/:id", (req, res) => res.json(jobs.get(req.params.id) || { error: "unknown job" }));
app.post("/api/reveal", express.json(), (req, res) => {
  const f = String(req.body.file || "");
  if (f.startsWith(RENDERS_DIR)) exec(`open -R ${JSON.stringify(f)}`);
  res.json({ ok: true });
});

const vite = await createVite({
  configFile: false,
  root: path.join(ROOT, "src", "ui"),
  publicDir: path.join(ROOT, "public"),
  plugins: [react()],
  server: { middlewareMode: true, fs: { allow: [ROOT] } },
  appType: "spa",
  logLevel: "warn",
});
app.use(vite.middlewares);

app.listen(PORT, () => {
  console.log(`\n  Malefekt Travel Maps is running at ${BASE}\n  (keep this window open while you use the app — close it to stop)\n`);
  if (process.env.NO_OPEN !== "1") exec(`open ${BASE}`);
  prepare().then(() => console.log("  Renderer ready.")).catch((e) => console.error("Renderer prep failed:", e.message));
});
