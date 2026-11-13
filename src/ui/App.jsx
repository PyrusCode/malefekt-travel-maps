import React, { useEffect, useMemo, useState } from "react";
import { Player } from "@remotion/player";
import { TravelMap } from "../remotion/TravelMap.jsx";
import { dims } from "../remotion/dims.js";
import cfg from "../../config.js";

function PlaceInput({ label, value, onPick }) {
  const [q, setQ] = useState(value?.name || "");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const [status, setStatus] = useState(null); // message shown when there are no suggestions
  useEffect(() => {
    if (!open || q.trim().length < 2) { setItems([]); setStatus(null); return; }
    setStatus("Searching…");
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setItems(j); setHi(0);
        setStatus(j.length ? null : "No places found. Try adding the city or country.");
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setItems([]);
        setStatus(e instanceof TypeError ? "Can't reach the app. Reopen Malefekt Travel Maps from your Desktop." : e.message);
      }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, open]);
  const pick = (it) => { setQ(it.name + (it.country && it.country !== it.name ? ", " + it.country : "")); setOpen(false); onPick(it); };
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="text" value={q} placeholder="City, address, bar, landmark…"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { setHi((h) => Math.min(items.length - 1, h + 1)); e.preventDefault(); }
          if (e.key === "ArrowUp") { setHi((h) => Math.max(0, h - 1)); e.preventDefault(); }
          if (e.key === "Enter" && items[hi]) pick(items[hi]);
        }}
      />
      {open && (items.length > 0 || status) && (
        <div className="suggest">
          {items.length > 0
            ? items.map((it, i) => (
                <div key={it.id + i} className={i === hi ? "on" : ""} onMouseDown={() => pick(it)}>
                  {it.name}<small>{it.detail}</small>
                </div>
              ))
            : <p className="suggest-status">{status}</p>}
        </div>
      )}
    </div>
  );
}

const Seg = ({ options, value, onChange }) => (
  <div className="seg">
    {options.map(([v, l]) => <button key={v} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}
  </div>
);

export default function App() {
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [labelA, setLabelA] = useState("");
  const [labelB, setLabelB] = useState("");
  const [mode, setMode] = useState("car");
  const [dur, setDur] = useState(5);
  const [format, setFormat] = useState("16:9");
  const [audio, setAudio] = useState(null); // {name, url}
  const [route, setRoute] = useState(null);
  const [planning, setPlanning] = useState(false);
  const [err, setErr] = useState(null);
  const [logoUrl, setLogoUrl] = useState(null);
  const [job, setJob] = useState(null);

  useEffect(() => { fetch("/api/logo").then((r) => r.json()).then((j) => setLogoUrl(j.url)).catch(() => {}); }, []);

  useEffect(() => {
    if (!a || !b) return;
    let alive = true;
    setPlanning(true); setErr(null);
    fetch("/api/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a, b, mode }) })
      .then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.error) throw new Error(j.error); setRoute(j); })
      .catch((e) => alive && setErr("Couldn't plan the route: " + e.message))
      .finally(() => alive && setPlanning(false));
    return () => { alive = false; };
  }, [a, b, mode]);

  const props = useMemo(() => {
    if (!a || !b || !route) return null;
    return {
      a: { ...a, label: labelA.trim() || a.label }, b: { ...b, label: labelB.trim() || b.label },
      mode, segments: route.segments, countries: route.countries, cities: route.cities, landmarks: route.landmarks, durationSec: dur, format, audioUrl: audio?.url || null, logoUrl,
    };
  }, [a, b, labelA, labelB, mode, route, dur, format, audio, logoUrl]);

  const uploadAudio = async (file) => {
    if (!file) return;
    setAudio({ name: file.name + " (uploading…)", url: null });
    const r = await fetch(`/api/audio?name=${encodeURIComponent(file.name)}`, { method: "POST", body: file });
    const j = await r.json();
    setAudio({ name: file.name, url: j.url });
  };

  const startRender = async () => {
    const r = await fetch("/api/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(props) });
    const j = await r.json();
    setJob({ id: j.id, file: j.file, progress: 0, stage: "Starting" });
  };
  useEffect(() => {
    if (!job || job.done || job.error) return;
    const t = setInterval(async () => {
      const j = await (await fetch(`/api/render/${job.id}`)).json();
      setJob((o) => ({ ...o, ...j }));
    }, 700);
    return () => clearInterval(t);
  }, [job?.id, job?.done, job?.error]);
  const rendering = job && !job.done && !job.error;

  const pv = dims(format, cfg.render.previewScale);
  const fileName = job?.file?.split("/").pop();

  return (
    <div className="app">
      <div>
        <header>
          <h1>MALEFEKT</h1>
          <p>Travel map animations</p>
        </header>
        <div className="panel">
          <PlaceInput label="From (A)" onPick={(it) => { setA(it); setLabelA(it.label); }} />
          {a && <div className="sub" style={{ marginTop: -10, marginBottom: 14 }}>Label <input type="text" value={labelA} onChange={(e) => setLabelA(e.target.value)} /></div>}
          <PlaceInput label="To (B)" onPick={(it) => { setB(it); setLabelB(it.label); }} />
          {b && <div className="sub" style={{ marginTop: -10, marginBottom: 14 }}>Label <input type="text" value={labelB} onChange={(e) => setLabelB(e.target.value)} /></div>}

          <div className="field"><label>Mode</label><Seg value={mode} onChange={setMode} options={[["car", "🚗 Car"], ["plane", "✈️ Plane"]]} /></div>
          <div className="field"><label>Duration</label><Seg value={dur} onChange={setDur} options={[[3, "3s"], [5, "5s"], [8, "8s"], [10, "10s"]]} /></div>
          <div className="field"><label>Format</label><Seg value={format} onChange={setFormat} options={[["16:9", "16:9 YouTube"], ["9:16", "9:16 Shorts"]]} /></div>
          <div className="field">
            <label>Music (optional)</label>
            <div className="audio">
              <label className="btn">Choose file<input type="file" accept="audio/*" hidden onChange={(e) => uploadAudio(e.target.files[0])} /></label>
              <span className="name">{audio ? audio.name : "No tune — clacks only"}</span>
              {audio && <button className="btn" onClick={() => setAudio(null)}>✕</button>}
            </div>
          </div>

          <button className="render" disabled={!props || rendering || planning || (audio && !audio.url)} onClick={startRender}>
            {rendering ? "Rendering…" : "Render MP4"}
          </button>
          {job && (
            <>
              <div className="bar"><div style={{ width: `${Math.round((job.progress || 0) * 100)}%` }} /></div>
              <div className="status">
                {job.error ? <span style={{ color: "#ff9f94" }}>Render failed: {job.error}</span>
                  : job.done ? <>Saved to Desktop/Renders/<b>{fileName}</b> · <a href="#" style={{ color: "#f0d9a0" }} onClick={(e) => { e.preventDefault(); fetch("/api/reveal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file: job.file }) }); }}>Show in Finder</a></>
                  : <>{job.stage} {Math.round((job.progress || 0) * 100)}%</>}
              </div>
            </>
          )}
          {route?.note && <div className="note">{route.note}</div>}
          {err && <div className="note err">{err}</div>}
          {!logoUrl && <div className="status" style={{ marginTop: 12 }}>Tip: put your crest at assets/logo.png to stamp it on the map.</div>}
        </div>
      </div>

      <div className="stage">
        {props ? (
          <div className="preview" style={{ aspectRatio: format === "9:16" ? "9/16" : "16/9", maxHeight: "82vh", margin: format === "9:16" ? "0 auto" : 0 }}>
            <Player
              key={format + mode + JSON.stringify(route.segments.length) + (a?.id) + (b?.id)}
              component={TravelMap}
              inputProps={{ ...props, scale: cfg.render.previewScale }}
              durationInFrames={dur * cfg.render.fps}
              fps={cfg.render.fps}
              compositionWidth={pv.width}
              compositionHeight={pv.height}
              style={{ width: "100%", height: "100%" }}
              controls loop autoPlay
              numberOfSharedAudioTags={10}
              acknowledgeRemotionLicense
            />
          </div>
        ) : (
          <div className="preview empty">{planning ? "Plotting the route…" : "Pick two places to see the preview"}</div>
        )}
        {route && <div className="meta">{mode === "car" ? "Driving" : "Flight"} distance ≈ {route.distanceKm.toLocaleString()} km · Preview is half resolution — Render makes the full-quality 24 fps MP4.</div>}
      </div>
    </div>
  );
}
