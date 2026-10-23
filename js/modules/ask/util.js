// Small helpers for the ask module. Allocation-light so the membrane and the tiny jelly can run every frame.
export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const outCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const inCubic = (t) => { t = clamp(t); return t * t * t; };
export const outBack = (t, s = 1.5) => { t = clamp(t) - 1; return 1 + (s + 1) * t * t * t + s * t * t; };
export const ease = (dt, tau) => 1 - Math.exp(-dt / tau);   // frame-rate independent smoothing factor
export const rand = (a, b) => a + Math.random() * (b - a);
export const r1 = (v) => Math.round(v * 10) / 10;
export const pick = (list) => list[Math.floor(Math.random() * list.length)];

export const SVGNS = "http://www.w3.org/2000/svg";
export function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
export function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

// seeded random, so a hand-drawn outline is the same drawing every time it is rebuilt
export function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const parsePts = (d) => Float32Array.from(d.match(/-?\d*\.?\d+/g).map(Number));

// Filled tapered outline around an open centre line (flat [x,y,...], m points); hw[i] = half width.
// Round caps at both ends. Same idea as ink.brush() without resampling, cheap enough for every frame.
let NX = new Float32Array(256), NY = new Float32Array(256);
function ensure(m) { if (NX.length < m) { NX = new Float32Array(m * 2); NY = new Float32Array(m * 2); } }
const CAP = 6;
export function ribbon(c, m, hw) {
  if (m < 2) return "";
  ensure(m);
  for (let i = 0; i < m; i++) {
    const a = i > 1 ? i - 2 : 0, b = i < m - 2 ? i + 2 : m - 1;
    const tx = c[2 * b] - c[2 * a], ty = c[2 * b + 1] - c[2 * a + 1];
    const l = Math.hypot(tx, ty) || 1;
    NX[i] = -ty / l; NY[i] = tx / l;
  }
  let s = "M" + r1(c[0] + NX[0] * hw[0]) + " " + r1(c[1] + NY[0] * hw[0]);
  for (let i = 1; i < m; i++) s += "L" + r1(c[2 * i] + NX[i] * hw[i]) + " " + r1(c[2 * i + 1] + NY[i] * hw[i]);
  const e = m - 1, we = hw[e], ex = c[2 * e], ey = c[2 * e + 1], tx = NY[e], ty = -NX[e];
  for (let k = 1; k < CAP; k++) {
    const a = (Math.PI * k) / CAP, co = Math.cos(a), si = Math.sin(a);
    s += "L" + r1(ex + (NX[e] * co + tx * si) * we) + " " + r1(ey + (NY[e] * co + ty * si) * we);
  }
  for (let i = m - 1; i >= 0; i--) s += "L" + r1(c[2 * i] - NX[i] * hw[i]) + " " + r1(c[2 * i + 1] - NY[i] * hw[i]);
  const w0 = hw[0], sx = c[0], sy = c[1], t0x = NY[0], t0y = -NX[0];
  for (let k = 1; k < CAP; k++) {
    const a = (Math.PI * k) / CAP, co = Math.cos(a), si = Math.sin(a);
    s += "L" + r1(sx + (-NX[0] * co - t0x * si) * w0) + " " + r1(sy + (-NY[0] * co - t0y * si) * w0);
  }
  return s + "Z";
}

// A wobbly closed ring (a bubble) as path data: two blob outlines, filled with evenodd. Thicker at the bottom.
export function ringPath(cx, cy, r, w, seed, n = 20) {
  const ring = (rad, k0) => {
    let s = "";
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, k = 1 + 0.07 * Math.sin(a * 3 + seed) + 0.045 * Math.sin(a * 5 + seed * 2.3);
      const rr = rad * k + k0 * Math.max(0, Math.sin(a));
      s += (i ? "L" : "M") + r1(cx + Math.cos(a) * rr) + " " + r1(cy + Math.sin(a) * rr);
    }
    return s + "Z";
  };
  return ring(r, 0) + ring(Math.max(0.4, r - w), -w * 0.45);
}

// A filled organic blob (droplets, the send drop): one wobbly closed outline.
export function blobPath(cx, cy, r, seed, n = 18, sq = 1) {
  let s = "";
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU, k = 1 + 0.06 * Math.sin(a * 3 + seed) + 0.04 * Math.sin(a * 5 + seed * 1.7);
    s += (i ? "L" : "M") + r1(cx + Math.cos(a) * r * k) + " " + r1(cy + Math.sin(a) * r * k * sq);
  }
  return s + "Z";
}
