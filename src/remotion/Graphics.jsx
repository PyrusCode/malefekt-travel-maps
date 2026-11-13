import React, { useMemo } from "react";
import { rng } from "./textures.js";

// ---------- Rough red brush-stroke X ----------
function brushStroke(r, x0, y0, x1, y1, width, rough) {
  const N = 26;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  const left = [], right = [];
  const bend = (r() - 0.5) * 6;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const prof = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.04)), 0.45) * (1 - t * 0.25);
    const w = width * (0.25 + 0.75 * prof);
    const cx = x0 + dx * t + nx * Math.sin(Math.PI * t) * bend;
    const cy = y0 + dy * t + ny * Math.sin(Math.PI * t) * bend;
    const jl = (r() - 0.5) * width * 0.35 * rough;
    const jr = (r() - 0.5) * width * 0.35 * rough;
    left.push([cx + nx * (w / 2 + jl), cy + ny * (w / 2 + jl)]);
    right.push([cx - nx * (w / 2 + jr), cy - ny * (w / 2 + jr)]);
  }
  const pts = left.concat(right.reverse());
  return "M" + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join("L") + "Z";
}

export function BrushX({ seed, color, rough, strokeW }) {
  const paths = useMemo(() => {
    const r = rng(seed);
    const w = 17 * strokeW;
    const out = [
      brushStroke(r, 16 + r() * 4, 14 + r() * 4, 84 - r() * 4, 86 - r() * 3, w, rough),
      brushStroke(r, 83 - r() * 4, 13 + r() * 5, 15 + r() * 4, 85 - r() * 4, w * 0.95, rough),
    ];
    // dry-brush streaks + splatter
    const extra = [];
    for (let i = 0; i < 6; i++) {
      const a = r() * Math.PI * 2, d = 38 + r() * 14;
      extra.push({ cx: 50 + Math.cos(a) * d, cy: 50 + Math.sin(a) * d, r: 0.8 + r() * 2.2 * rough });
    }
    return { out, extra };
  }, [seed, rough, strokeW]);
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ overflow: "visible" }}>
      <g fill={color}>
        {paths.out.map((d, i) => <path key={i} d={d} opacity={0.93} />)}
        {paths.extra.map((c, i) => <circle key={i} {...c} opacity={0.85} />)}
      </g>
    </svg>
  );
}

// ---------- Compass rose ----------
export function CompassRose({ color, font }) {
  const paper = "#e8d6ae";
  const point = (ang, len, wdt, key) => {
    const a = (ang * Math.PI) / 180;
    const tip = [Math.sin(a) * len, -Math.cos(a) * len];
    const l = [Math.sin(a - Math.PI / 2) * wdt, -Math.cos(a - Math.PI / 2) * wdt];
    const rr = [Math.sin(a + Math.PI / 2) * wdt, -Math.cos(a + Math.PI / 2) * wdt];
    return (
      <g key={key}>
        <path d={`M0 0L${l[0]} ${l[1]}L${tip[0]} ${tip[1]}Z`} fill={color} />
        <path d={`M0 0L${rr[0]} ${rr[1]}L${tip[0]} ${tip[1]}Z`} fill={paper} stroke={color} strokeWidth={1.2} />
      </g>
    );
  };
  const ticks = [];
  for (let i = 0; i < 72; i++) {
    const a = (i * 5 * Math.PI) / 180;
    const r1 = 80, r2 = i % 2 ? 76 : 72;
    ticks.push(<line key={i} x1={Math.sin(a) * r1} y1={-Math.cos(a) * r1} x2={Math.sin(a) * r2} y2={-Math.cos(a) * r2} stroke={color} strokeWidth={i % 2 ? 0.8 : 1.4} />);
  }
  return (
    <svg viewBox="-110 -110 220 220" width="100%" height="100%">
      <circle r={88} fill="#e4d1a6" fillOpacity={0.82} stroke="none" />
      <circle r={86} fill="none" stroke={color} strokeWidth={2.2} />
      <circle r={80} fill="none" stroke={color} strokeWidth={0.9} />
      <circle r={58} fill="none" stroke={color} strokeWidth={0.9} strokeDasharray="2 3" />
      {ticks}
      {[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((a, i) => point(a, 46, 6, "m" + i))}
      {[45, 135, 225, 315].map((a, i) => point(a, 60, 9, "i" + i))}
      {[0, 90, 180, 270].map((a, i) => point(a, 92, 13, "c" + i))}
      <circle r={6} fill={paper} stroke={color} strokeWidth={1.6} />
      <circle r={2} fill={color} />
      <g fontFamily={font} fill={color} textAnchor="middle" dominantBaseline="central">
        <text x={0} y={-101} fontSize={22}>N</text>
        <text x={101} y={1} fontSize={17}>E</text>
        <text x={0} y={103} fontSize={17}>S</text>
        <text x={-101} y={1} fontSize={17}>W</text>
      </g>
    </svg>
  );
}

// ---------- Cartoon car (side view, facing right) ----------
function Wheel({ cx, cy, spin, navy, cream }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <circle r={10.5} fill="#0e1424" stroke={cream} strokeWidth={2} />
      <circle r={5.2} fill={cream} />
      <g transform={`rotate(${spin})`} stroke={navy} strokeWidth={1.6} strokeLinecap="round">
        <line x1={-4.6} y1={0} x2={4.6} y2={0} />
        <line x1={0} y1={-4.6} x2={0} y2={4.6} />
        <line x1={-3.2} y1={-3.2} x2={3.2} y2={3.2} />
      </g>
      <circle r={1.6} fill={navy} />
    </g>
  );
}

export function Car({ navy, cream, spin }) {
  return (
    <svg viewBox="0 0 124 64" width="100%" height="100%" style={{ overflow: "visible" }}>
      <g strokeLinejoin="round">
        <path
          d="M8 44 C6 36 9 30 18 28 L34 26 C40 14 46 10 58 10 L76 10 C86 10 92 16 98 26 L110 28 C117 29 120 35 119 42 L118 46 C118 48 116 49 114 49 L10 49 C8.5 49 8 47 8 44 Z"
          fill={navy} stroke={cream} strokeWidth={2.2}
        />
        <path d="M40 26 C44 17 48 14 57 14 L63 14 L63 26 Z" fill="#9fb4d6" stroke={cream} strokeWidth={1.4} />
        <path d="M67 14 L76 14 C83 14 87 18 92 26 L67 26 Z" fill="#9fb4d6" stroke={cream} strokeWidth={1.4} />
        <path d="M44 18 L48 15" stroke="#fff" strokeOpacity={0.6} strokeWidth={1.6} strokeLinecap="round" />
        <line x1={64.5} y1={28} x2={64.5} y2={46} stroke={cream} strokeOpacity={0.5} strokeWidth={1.2} />
        <rect x={52} y={31} width={7} height={2} rx={1} fill={cream} opacity={0.8} />
        <rect x={70} y={31} width={7} height={2} rx={1} fill={cream} opacity={0.8} />
        <ellipse cx={115} cy={34} rx={3} ry={2.6} fill="#ffe9a8" stroke={cream} strokeWidth={1} />
        <rect x={7} y={32} width={4} height={5} rx={1.2} fill="#c0392b" />
        <path d="M14 40 L112 40" stroke={cream} strokeOpacity={0.35} strokeWidth={1} />
      </g>
      <Wheel cx={33} cy={48} spin={spin} navy={navy} cream={cream} />
      <Wheel cx={95} cy={48} spin={spin} navy={navy} cream={cream} />
    </svg>
  );
}

// ---------- Cartoon boat (side view, facing right) ----------
export function Boat({ navy, cream, frame }) {
  const wk = Math.sin(frame * 0.5) * 2;
  return (
    <svg viewBox="0 0 120 72" width="100%" height="100%" style={{ overflow: "visible" }}>
      <g strokeLinejoin="round" strokeLinecap="round">
        <path d="M44 20 L44 8 L54 8 L54 20" fill={navy} stroke={cream} strokeWidth={2} />
        <rect x={44} y={11} width={10} height={3} fill={cream} opacity={0.8} />
        <path d="M30 40 L32 22 L84 22 L88 40 Z" fill={navy} stroke={cream} strokeWidth={2} />
        <circle cx={44} cy={31} r={3.2} fill="#9fb4d6" stroke={cream} strokeWidth={1.2} />
        <circle cx={58} cy={31} r={3.2} fill="#9fb4d6" stroke={cream} strokeWidth={1.2} />
        <circle cx={72} cy={31} r={3.2} fill="#9fb4d6" stroke={cream} strokeWidth={1.2} />
        <path d="M6 40 L114 40 L102 58 C100 61 97 62 94 62 L24 62 C20 62 18 61 16 58 Z" fill={navy} stroke={cream} strokeWidth={2.2} />
        <path d="M16 47 L108 47" stroke={cream} strokeWidth={1.4} opacity={0.6} />
        <path d={`M2 ${66 + wk} q8 -5 16 0 t16 0`} fill="none" stroke={cream} strokeWidth={2} opacity={0.8} />
        <path d={`M86 ${66 - wk} q8 -5 16 0 t16 0`} fill="none" stroke={cream} strokeWidth={2} opacity={0.8} />
      </g>
    </svg>
  );
}

// ---------- Old propeller plane (top view, nose up) ----------
const PLANE_BODY =
  "M60 10 C66 10 68 18 68 28 L68 40 L112 44 C116 44.5 117 47 116 50 L114 55 L68 57 L66 88 L84 92 C87 92.5 87 97 84 98 L62 101 L60 108 L58 101 L36 98 C33 97 33 92.5 36 92 L54 88 L52 57 L6 55 L4 50 C3 47 4 44.5 8 44 L52 40 L52 28 C52 18 54 10 60 10 Z";

export function Plane({ navy, cream, frame, shadow }) {
  const prop = Math.abs(Math.cos(frame * 2.1));
  if (shadow) {
    return (
      <svg viewBox="0 0 120 120" width="100%" height="100%" style={{ overflow: "visible" }}>
        <path d={PLANE_BODY} fill="#1a0f05" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 120 120" width="100%" height="100%" style={{ overflow: "visible" }}>
      <g strokeLinejoin="round" strokeLinecap="round">
        <path d={PLANE_BODY} fill={navy} stroke={cream} strokeWidth={2} />
        <path d="M14 49 L52 47 M68 47 L106 49" stroke={cream} strokeOpacity={0.4} strokeWidth={1.2} fill="none" />
        <path d="M40 95 L54 93 M66 93 L80 95" stroke={cream} strokeOpacity={0.4} strokeWidth={1} fill="none" />
        <ellipse cx={60} cy={44} rx={5} ry={8} fill="#9fb4d6" stroke={cream} strokeWidth={1.3} />
        <line x1={60} y1={60} x2={60} y2={100} stroke={cream} strokeOpacity={0.55} strokeWidth={1.4} />
        <circle cx={60} cy={15} r={6.5} fill={navy} stroke={cream} strokeWidth={1.6} />
        <circle cx={60} cy={15} r={2.4} fill={cream} />
        <circle cx={22} cy={50} r={2} fill="#c0392b" />
        <circle cx={98} cy={50} r={2} fill="#2e8b57" />
      </g>
      <ellipse cx={60} cy={8.5} rx={21} ry={2.2} fill={cream} opacity={0.18} />
      <g transform={`translate(60 8.5) scale(${0.15 + prop * 0.85} 1)`}>
        <rect x={-20} y={-1.6} width={40} height={3.2} rx={1.6} fill="#2a1d12" stroke={cream} strokeWidth={0.8} />
      </g>
    </svg>
  );
}
