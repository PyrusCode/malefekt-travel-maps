import React, { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  AbsoluteFill, Audio, Sequence, continueRender, delayRender, getRemotionEnvironment,
  staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import cfg from "../../config.js";
import { makeTimeline, partialRoute, pointAt, typingSchedule, clamp } from "./geo.js";
import { makeStyle } from "./mapStyle.js";
import { boxOf, planLabels } from "./labels.js";
import { makeBurntEdges, makeGrain, makeInkLogo, makePaper, makeWavesImage, rng } from "./textures.js";
import { BrushX, Boat, Car, CompassRose, Plane } from "./Graphics.jsx";

const FONT = cfg.text.fontName;

// Loads an async asset once, holding the Remotion render until it's ready.
function useAsset(key, fn, deps) {
  const [val, setVal] = useState(null);
  const [handle] = useState(() => delayRender("asset " + key, { timeoutInMilliseconds: 120000 }));
  useEffect(() => {
    let alive = true;
    Promise.resolve()
      .then(fn)
      .catch((e) => { console.warn("asset failed", key, e); return false; })
      .then((v) => { if (alive) { setVal(v); continueRender(handle); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return val;
}

const cornerStyle = (corner, inset) => {
  const s = { position: "absolute" };
  if (corner.includes("top")) s.top = inset; else s.bottom = inset;
  if (corner.includes("left")) s.left = inset; else s.right = inset;
  return s;
};

// Printed labels that sit on the map: country names, towns and landmark notes.
const MapLabel = ({ label: l, u }) => {
  const halo = `0 0 ${4 * u}px rgba(236,220,182,0.95), 0 0 ${9 * u}px rgba(236,220,182,0.75)`;
  if (l.kind === "country") {
    const c = cfg.countryLabels;
    return (
      <div style={{
        position: "absolute", left: l.x, top: l.y, transform: "translate(-50%, -50%)", whiteSpace: "nowrap",
        fontFamily: FONT, fontSize: c.size * u, color: c.color, opacity: c.opacity * l.opacity,
        letterSpacing: `${c.letterSpacing}em`, textShadow: halo,
      }}>{l.text}</div>
    );
  }
  const isCity = l.kind === "city";
  const set = isCity ? cfg.cityLabels : cfg.landmarks;
  const markerSize = (isCity ? set.dot : set.marker) * u;
  const row = {
    position: "absolute", left: l.x, top: l.y, whiteSpace: "nowrap", fontFamily: FONT, display: "flex", alignItems: "center", gap: 7 * u,
    flexDirection: l.side > 0 ? "row" : "row-reverse",
    transform: `translate(${l.side > 0 ? -markerSize / 2 : `calc(-100% + ${markerSize / 2}px)`}, -50%)`,
    opacity: (isCity ? set.opacity : 1) * l.opacity,
  };
  if (isCity) {
    return (
      <div style={row}>
        <div style={{ width: markerSize, height: markerSize, borderRadius: "50%", background: set.color, boxShadow: `0 0 0 ${1.5 * u}px rgba(236,220,182,0.9)`, flexShrink: 0 }} />
        <div style={{ fontSize: set.size * u, color: set.color, textShadow: halo }}>{l.name}</div>
      </div>
    );
  }
  return (
    <div style={row}>
      <svg viewBox="-10 -10 20 20" width={markerSize} height={markerSize} style={{ flexShrink: 0, overflow: "visible" }}>
        <path d="M0 -10L2.6 -2.6L10 0L2.6 2.6L0 10L-2.6 2.6L-10 0L-2.6 -2.6Z" fill={set.color} stroke="rgba(236,220,182,0.95)" strokeWidth={1.6} paintOrder="stroke" />
      </svg>
      <div style={{
        textAlign: l.side > 0 ? "left" : "right", lineHeight: 1.15, padding: `${3 * u}px ${8 * u}px`,
        background: "rgba(232,214,172,0.9)", border: `${1 * u}px solid rgba(40,25,12,0.5)`,
      }}>
        <div style={{ fontSize: set.nameSize * u, color: set.color }}>{l.name}</div>
        <div style={{ fontSize: set.noteSize * u, color: set.noteColor }}>{l.note}</div>
      </div>
    </div>
  );
};

export const TravelMap = (props) => {
  const frame = useCurrentFrame();
  const { width: W, height: H, fps, durationInFrames } = useVideoConfig();
  const scale = props.scale || 1;
  const W0 = W / scale, H0 = H / scale;
  const u = Math.min(W, H) / 1080; // size unit
  const vertical = H > W;
  const isRendering = getRemotionEnvironment().isRendering;

  const tl = useMemo(
    () => makeTimeline({ props, cfg, W0, H0, fps, durationInFrames }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(props.segments), props.mode, W0, H0, fps, durationInFrames],
  );
  const zoff = Math.log2(scale);

  // ---------- assets ----------
  const fontOk = useAsset("font", async () => {
    const ff = new FontFace(FONT, `url(${staticFile(cfg.text.fontFile)})`);
    await ff.load();
    document.fonts.add(ff);
    return true;
  }, []);
  const paper = useAsset("paper", () => makePaper(cfg), []);
  const edgeT = cfg.paper.burntEdges ? (vertical ? W * cfg.paper.burntEdgeWidth916 : H * cfg.paper.burntEdgeWidth169) : 0;
  const xSizeU = cfg.x.size * u;
  const insetU = edgeT * 0.9 + 26 * u;
  const burnt = useAsset("burnt", () => (cfg.paper.burntEdges ? makeBurntEdges(W, H, edgeT) : null), [W, H]);
  const grain = useAsset("grain", () => (cfg.look.grain > 0 ? makeGrain() : []), []);
  const logo = useAsset("logo", () => (props.logoUrl && cfg.logo.enabled ? makeInkLogo(props.logoUrl, cfg) : null), [props.logoUrl]);

  // ---------- map ----------
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [ready, setReady] = useState(0); // counts map loads, so labels are re-planned for a new map
  const [mapHandle] = useState(() => delayRender("map load", { timeoutInMilliseconds: 120000 }));
  useEffect(() => {
    const c0 = tl.camera[0];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: makeStyle(cfg, { globe: tl.globe, s: u }),
      center: c0.center, zoom: c0.zoom + zoff, pitch: c0.pitch, bearing: 0,
      interactive: false, attributionControl: false, fadeDuration: 0,
      pixelRatio: 1, maxPitch: 80,
      canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
    });
    map.on("styleimagemissing", (e) => {
      if (e.id === "waves" && !map.hasImage("waves")) map.addImage("waves", makeWavesImage(cfg), { pixelRatio: 2 / u });
    });
    map.on("error", (e) => console.warn("map error", e?.error?.message));
    map.once("load", () => {
      mapRef.current = map;
      setReady((n) => n + 1);
      continueRender(mapHandle);
    });
    return () => { mapRef.current = null; map.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl.globe, W, H]);

  // keep the A/B name clear of both the X and the vehicle parked on it
  const labelPos = (pt) => {
    const vehH = tl.isPlane ? 70 * cfg.vehicle.planeSize : 64 * cfg.vehicle.carSize;
    const gap = Math.max(cfg.x.size * 0.62, vehH) * u + cfg.text.labelSize * u * 0.6;
    const above = { x: pt.x, y: pt.y - gap };
    if (above.y < edgeT + cfg.text.labelSize * u) return { x: pt.x, y: pt.y + cfg.x.size * u * 0.62 + cfg.text.labelSize * u * 0.6 };
    return above;
  };

  // one plan for the whole video: which labels show, where, and when
  const labelPlan = useMemo(() => {
    const map = mapRef.current;
    if (!ready || !map) return [];
    const lw = (len) => len * cfg.text.labelSize * u * 0.6 + 30 * u;
    const nameH = cfg.text.labelSize * u * 1.6;
    const cornerBox = (corner, size) => {
      const x = corner.includes("left") ? insetU + size / 2 : W - insetU - size / 2;
      const y = corner.includes("top") ? insetU + size / 2 : H - insetU - size / 2;
      return boxOf(x, y, size + 20 * u, size + 20 * u);
    };
    const fixed = [boxOf(W / 2, H - insetU - (vertical ? 140 * u : 4 * u) - cfg.text.titleSize * u * 0.8, W * 0.62, cfg.text.titleSize * u * 2.2)];
    if (cfg.compass.enabled) fixed.push(cornerBox(cfg.compass.corner, cfg.compass.size * u));
    if (props.logoUrl && cfg.logo.enabled) fixed.push(cornerBox(cfg.logo.corner, cfg.logo.size * u * 1.08));
    const reservedAt = (P) => {
      const A = P([props.a.lon, props.a.lat]), B = P([props.b.lon, props.b.lat]);
      const la = labelPos(A), lb = labelPos(B);
      return [
        ...fixed,
        boxOf(A.x, A.y, xSizeU * 1.4, xSizeU * 1.4), boxOf(B.x, B.y, xSizeU * 1.4, xSizeU * 1.4),
        boxOf(la.x, la.y, lw(props.a.label.length), nameH), boxOf(lb.x, lb.y, lw(props.b.label.length), nameH),
      ];
    };
    return planLabels({ map, tl, zoff, cfg, props, W, H, u, edgeT, reservedAt });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tl, props.countries, props.cities, props.landmarks, props.a.label, props.b.label, props.logoUrl]);

  const [ov, setOv] = useState(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const cam = tl.camera[Math.min(frame, tl.camera.length - 1)];
    map.jumpTo({ center: cam.center, zoom: cam.zoom + zoff, pitch: cam.pitch, bearing: cam.bearing });
    const dist = tl.distAt(frame);
    map.getSource("route").setData(partialRoute(tl.path, dist));

    const compute = () => {
      const P = (ll) => map.project(ll);
      const total = tl.path.total;
      const delta = total * (tl.isPlane ? 0.012 : 0.015) + (tl.isPlane ? 0 : 400);
      const at = pointAt(tl.path, dist);
      const vp = P(at.pos);
      const heading = (d) => {
        const p1 = P(pointAt(tl.path, clamp(d - delta, 0, total)).pos);
        const p2 = P(pointAt(tl.path, clamp(d + delta, 0, total)).pos);
        return Math.atan2(p2.y - p1.y, p2.x - p1.x);
      };
      const hd = heading(dist);
      const step = total / Math.max(1, tl.travelFrames);
      let turn = heading(dist + step * 2) - heading(dist - step * 2);
      while (turn > Math.PI) turn -= 2 * Math.PI;
      while (turn < -Math.PI) turn += 2 * Math.PI;
      const water = (pt, len) => {
        const fs = cfg.text.labelSize * u;
        const half = (len * fs * 0.55) / 2;
        let n = 0;
        [-half, 0, half].forEach((dx) => {
          const x = clamp(pt.x + dx, 1, W - 1), y = clamp(pt.y, 1, H - 1);
          if (map.queryRenderedFeatures([x, y], { layers: ["water"] }).length) n++;
        });
        return n >= 2;
      };
      const A = P([props.a.lon, props.a.lat]);
      const B = P([props.b.lon, props.b.lat]);
      const la = labelPos(A), lb = labelPos(B);

      const mapLabels = labelPlan.flatMap(({ alpha, ll, ...label }) => {
        const opacity = alpha[frame];
        if (!opacity) return [];
        const q = P(ll);
        return [{ ...label, opacity, x: q.x, y: q.y }];
      });

      return {
        mapLabels,
        A: { x: A.x, y: A.y }, B: { x: B.x, y: B.y }, la, lb,
        laSea: water(la, props.a.label.length), lbSea: water(lb, props.b.label.length),
        v: { x: vp.x, y: vp.y, kind: at.kind, hd, turn },
      };
    };

    if (!isRendering) { setOv(compute()); return; }
    const handle = delayRender("frame " + frame, { timeoutInMilliseconds: 120000 });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      flushSync(() => setOv(compute()));
      continueRender(handle);
    };
    map.once("idle", finish);
    map.triggerRepaint();
    const t = setTimeout(finish, 90000);
    return () => { clearTimeout(t); map.off("idle", finish); if (!done) { done = true; continueRender(handle); } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, ready, tl, labelPlan]);

  // ---------- typing ----------
  const cps = cfg.text.typingSpeed;
  const typing = useMemo(() => {
    const la = typingSchedule(props.a.label, 5, Math.max(10, tl.intro + tl.travelFrames * 0.25), fps, cps);
    const titleText = `${props.a.label} → ${props.b.label}`;
    const tStart = (la.length ? la[la.length - 1].at : 5) + 4;
    const title = typingSchedule(titleText, tStart, Math.max(8, tl.travelEnd - tStart - 4), fps, cps);
    const lb = typingSchedule(props.b.label, tl.travelEnd + 1, Math.max(6, tl.hold - 5), fps, cps);
    return { la, title, lb };
  }, [props.a.label, props.b.label, tl, fps, cps]);
  const clacks = useMemo(() => [...typing.la, ...typing.title, ...typing.lb].filter((c) => c.c.trim() && c.c !== "→"), [typing]);

  const Typed = ({ sched }) => (
    <>
      {sched.map((ch, i) => (
        <span key={i} style={{ opacity: frame >= ch.at ? 1 : 0 }}>{ch.c}</span>
      ))}
    </>
  );

  // ---------- render ----------
  const stamp = (start) => {
    const t = frame - start;
    if (t < 0) return { s: 1.7, o: 0.35 };
    const k = [1.7, 1.45, 1.15, 0.9, 0.96, 1.03, 1.0][Math.min(6, t)] ?? 1;
    return { s: k, o: Math.min(1, 0.35 + t * 0.22) };
  };
  const xSize = cfg.x.size * u;
  const XMark = ({ p, seed, start }) => {
    const st = stamp(start);
    return (
      <div style={{ position: "absolute", left: p.x - xSize / 2, top: p.y - xSize / 2, width: xSize, height: xSize, transform: `scale(${st.s})`, opacity: st.o, mixBlendMode: "multiply" }}>
        <BrushX seed={seed} color={cfg.x.color} rough={cfg.x.roughness} strokeW={cfg.x.strokeWidth} />
      </div>
    );
  };

  const Label = ({ p, sched, sea }) => (
    <div style={{
      position: "absolute", left: p.x, top: p.y, transform: "translate(-50%, -50%)", whiteSpace: "nowrap",
      fontFamily: FONT, fontSize: cfg.text.labelSize * u, color: sea ? cfg.text.labelOnSea : cfg.text.labelOnLand,
      textShadow: sea ? `0 0 ${6 * u}px rgba(8,16,32,0.75)` : `0 0 ${6 * u}px rgba(240,226,190,0.85)`,
      letterSpacing: 0.5 * u,
    }}>
      <Typed sched={sched} />
    </div>
  );

  const vehicle = () => {
    if (!ov) return null;
    const { v } = ov;
    const nav = cfg.vehicle.navy, cr = cfg.vehicle.outline;
    if (tl.isPlane) {
      const alt = tl.planeBump(tl.progressAt(frame));
      const sz = 120 * u * cfg.vehicle.planeSize * (1 + 0.22 * alt);
      const bank = clamp(-v.turn * 260, -28, 28);
      const bob = Math.sin(frame * 0.22) * 3 * u * (0.3 + alt);
      const rot = (v.hd * 180) / Math.PI + 90;
      const sh = (8 + 40 * alt) * u;
      return (
        <>
          <div style={{ position: "absolute", left: v.x - sz / 2 + sh * 0.6, top: v.y - sz / 2 + sh, width: sz, height: sz, transform: `rotate(${rot}deg) scale(${0.9 - alt * 0.1})`, opacity: 0.28, filter: `blur(${(2 + alt * 3) * u}px)` }}>
            <Plane shadow />
          </div>
          <div style={{ position: "absolute", left: v.x - sz / 2, top: v.y - sz / 2 + bob, width: sz, height: sz, transform: `perspective(${600 * u}px) rotate(${rot}deg) rotateY(${bank}deg)` }}>
            <Plane navy={nav} cream={cr} frame={frame} />
          </div>
        </>
      );
    }
    const deg = (v.hd * 180) / Math.PI;
    const flip = Math.cos(v.hd) < 0;
    let r = flip ? deg - 180 : deg;
    while (r > 180) r -= 360;
    while (r < -180) r += 360;
    r = clamp(r, -40, 40); // side-view car: tilt with the road but never stand on its nose
    const moving = frame >= tl.travelStart && frame < tl.travelEnd;
    if (v.kind === "ferry") {
      const w = 110 * u * cfg.vehicle.boatSize, h = w * (72 / 120);
      const rock = Math.sin(frame * 0.3) * 5;
      return (
        <div style={{ position: "absolute", left: v.x - w / 2, top: v.y - h * 0.8, width: w, height: h, transformOrigin: "50% 80%", transform: `rotate(${r * 0.35 + rock}deg) scaleX(${flip ? -1 : 1})` }}>
          <Boat navy={nav} cream={cr} frame={frame} />
        </div>
      );
    }
    const w = 118 * u * cfg.vehicle.carSize, h = w * (64 / 124);
    const bounce = moving ? -Math.abs(Math.sin(frame * 0.7)) * 3 * u : 0;
    return (
      <div style={{ position: "absolute", left: v.x - w / 2, top: v.y - h * 0.85 + bounce, width: w, height: h, transformOrigin: "50% 85%", transform: `rotate(${r}deg) scaleX(${flip ? -1 : 1})` }}>
        <Car navy={nav} cream={cr} spin={moving ? frame * 38 : 0} />
      </div>
    );
  };

  // paper moving with the map
  const off = tl.offsets[Math.min(frame, tl.offsets.length - 1)];
  const T = paper ? paper.size * cfg.paper.textureScale * u * off.texScale : 1;
  const mod = (a, m) => ((a % m) + m) % m;
  const bx = mod(W / 2 - off.tx * scale * off.texScale, T), by = mod(H / 2 - off.ty * scale * off.texScale, T);
  const paperLayer = (url, mode, op) => (
    <AbsoluteFill style={{ backgroundImage: `url(${url})`, backgroundSize: `${T}px ${T}px`, backgroundPosition: `${bx}px ${by}px`, mixBlendMode: mode, opacity: op, pointerEvents: "none" }} />
  );

  const inset = edgeT * 0.9 + 26 * u;
  const gr = rng(frame * 7919 + 13);
  const grainIdx = grain && grain.length ? Math.floor(gr() * grain.length) : 0;

  const musicFade = Math.round(cfg.sound.musicFadeOutSeconds * fps);
  const N = durationInFrames;

  return (
    <AbsoluteFill style={{ backgroundColor: cfg.colors.globeBackground, overflow: "hidden" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0, width: W, height: H }} />

      {cfg.compass.enabled && (
        <div style={{ ...cornerStyle(cfg.compass.corner, inset), width: cfg.compass.size * u, height: cfg.compass.size * u, opacity: cfg.compass.opacity }}>
          <CompassRose color={cfg.compass.color} font={FONT} />
        </div>
      )}

      {logo && logo.url && (
        <img src={logo.url} style={{ ...cornerStyle(cfg.logo.corner, inset), width: cfg.logo.size * u, height: cfg.logo.size * u * logo.aspect, opacity: cfg.logo.opacity }} />
      )}

      {paper && paperLayer(paper.dark, "multiply", 1)}
      {paper && cfg.paper.foldLines && paperLayer(paper.light, "screen", 0.55)}

      {ov && fontOk && ov.mapLabels.map((l) => <MapLabel key={l.kind + (l.text || l.name)} label={l} u={u} />)}

      {ov && fontOk && (
        <>
          <XMark p={ov.A} seed={7} start={0} />
          <XMark p={ov.B} seed={21} start={4} />
          <Label p={ov.la} sched={typing.la} sea={ov.laSea} />
          <Label p={ov.lb} sched={typing.lb} sea={ov.lbSea} />
          {vehicle()}
        </>
      )}

      {fontOk && typing.title.length > 0 && frame >= typing.title[0].at && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: inset + (vertical ? 140 * u : 4 * u), display: "flex", justifyContent: "center" }}>
          <div style={{
            fontFamily: FONT, fontSize: cfg.text.titleSize * u, color: cfg.text.titleColor, whiteSpace: "nowrap",
            padding: cfg.text.titleBanner ? `${10 * u}px ${34 * u}px` : 0,
            background: cfg.text.titleBanner ? "rgba(232,214,172,0.92)" : "transparent",
            border: cfg.text.titleBanner ? `${2 * u}px solid rgba(40,25,12,0.75)` : "none",
            outline: cfg.text.titleBanner ? `${1 * u}px solid rgba(40,25,12,0.45)` : "none",
            outlineOffset: -7 * u,
            boxShadow: cfg.text.titleBanner ? `0 ${3 * u}px ${12 * u}px rgba(30,15,5,0.35)` : "none",
            textShadow: cfg.text.titleBanner ? "none" : `0 0 ${8 * u}px rgba(240,226,190,0.9)`,
          }}>
            <Typed sched={typing.title} />
          </div>
        </div>
      )}

      {/* warm tint + vignette */}
      <AbsoluteFill style={{ backgroundColor: cfg.look.warmTint, mixBlendMode: "multiply", opacity: cfg.look.warmTintStrength }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 52%, rgba(55,28,8,${cfg.look.vignette}) 100%)`, mixBlendMode: "multiply" }} />

      {grain && grain.length > 0 && (
        <AbsoluteFill style={{ backgroundImage: `url(${grain[grainIdx]})`, backgroundSize: `${256 * u * 1.2}px`, backgroundPosition: `${Math.floor(gr() * 256)}px ${Math.floor(gr() * 256)}px`, mixBlendMode: "overlay", opacity: cfg.look.grain * 1.6 }} />
      )}

      {burnt && <img src={burnt} style={{ position: "absolute", inset: 0, width: W, height: H }} />}

      <div style={{ ...cornerStyle(cfg.attribution.corner, edgeT * 0.75 + 8 * u), fontFamily: "Helvetica, Arial, sans-serif", fontSize: cfg.attribution.size * u, color: "rgba(40,25,12,0.8)", background: "rgba(225,205,165,0.55)", padding: `${1 * u}px ${5 * u}px`, borderRadius: 2 * u }}>
        {cfg.attribution.text}
      </div>

      {/* sound */}
      {clacks.map((c, i) => (
        <Sequence key={i} from={c.at} durationInFrames={Math.round(fps * 0.25)} layout="none">
          <Audio src={staticFile(`sfx/clack${(i % 3) + 1}.wav`)} volume={cfg.sound.clackVolume} />
        </Sequence>
      ))}
      {props.audioUrl && (
        <Audio
          src={props.audioUrl}
          volume={(f) => cfg.sound.musicVolume * clamp((N - 1 - f) / Math.max(1, musicFade), 0, 1)}
        />
      )}
    </AbsoluteFill>
  );
};
