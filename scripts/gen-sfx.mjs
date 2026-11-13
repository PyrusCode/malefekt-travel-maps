// Generates soft typewriter "clack" sounds into public/sfx/ (run once).
import fs from "node:fs";
const SR = 44100;
function wav(samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36);
  b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => b.writeInt16LE(Math.max(-1, Math.min(1, s)) * 32767, 44 + i * 2));
  return b;
}
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
for (let v = 1; v <= 3; v++) {
  seed = v * 977;
  const n = Math.round(SR * 0.12), out = new Float32Array(n);
  let lp = 0, bp1 = 0, bp2 = 0;
  const f0 = 1700 + v * 380, q = 0.25;
  const w = 2 * Math.sin((Math.PI * f0) / SR);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const noise = rnd();
    // click transient
    const click = noise * Math.exp(-t / 0.0012) * 0.9;
    // resonant "clack" body (state-variable bandpass on noise)
    const hp = noise - bp2 * q - bp1;
    bp1 += w * hp; bp2 += w * bp1;
    const body = bp1 * Math.exp(-t / 0.018) * 0.35;
    // low thump of the typebar hitting the platen
    const thump = Math.sin(2 * Math.PI * (140 + v * 15) * t) * Math.exp(-t / 0.012) * 0.45;
    // second smaller hit
    const t2 = t - 0.022 - v * 0.003;
    const hit2 = t2 > 0 ? noise * Math.exp(-t2 / 0.004) * 0.18 : 0;
    lp += 0.55 * (click + body + thump + hit2 - lp);
    out[i] = lp * 0.8;
  }
  fs.writeFileSync(new URL(`../public/sfx/clack${v}.wav`, import.meta.url), wav(out));
}
console.log("clack sounds written");
