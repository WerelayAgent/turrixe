// Small helpers shared by the hero-copy parts: maths, springs, seeded noise, ink outlines.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeIn = (t) => Math.pow(clamp(t, 0, 1), 3);
export const expOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t, 0, 1)));
export const rand = (a, b) => a + Math.random() * (b - a);
export const SVGNS = "http://www.w3.org/2000/svg";

export function el(tag, cls, parent) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (parent) parent.appendChild(n);
  return n;
}
export function svgEl(tag, attrs = {}, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

// Fast muscular squeeze, slow elastic recoil (the jellyfish heartbeat), phase 0..1 -> 0..1
export function squeeze(p, c = 0.22) {
  if (p < c) { const t = p / c; return 1 - Math.pow(1 - t, 3); }
  const t = (p - c) / (1 - c);
  return Math.exp(-4.2 * t) * Math.cos(t * Math.PI * 1.15);
}

// Damped spring, semi-implicit Euler with two sub-steps so a long frame never explodes it
export function spring(s, target, dt, k = 220, c = 11) {
  const h = dt / 2;
  for (let i = 0; i < 2; i++) {
    s.v += (-k * (s.x - target) - c * s.v) * h;
    s.x += s.v * h;
  }
  return s.x;
}
export const settled = (s, target, eps = 0.0015) => Math.abs(s.x - target) < eps && Math.abs(s.v) < eps * 10;

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Closed polygon to path data
export const closedPath = (pts) =>
  "M" + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L") + "Z";

// Procedural ink blot: wobbly disc whose tendrils grow late. g = growth 0..1. Returns points.
export function blot(cx, cy, R, seed, g, { n = 140, sx = 1, sy = 1 } = {}) {
  const rnd = mulberry32(seed);
  const K = 7 + ((rnd() * 5) | 0);
  const E = expOut(g);
  const tend = Array.from({ length: K }, () => ({ a: rnd() * 6.283, len: 0.18 + rnd() * 0.5, w: 0.04 + rnd() * 0.06 }));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283;
    let r = 1 + 0.07 * Math.sin(3 * a + seed) + 0.045 * Math.sin(7 * a + 2 * seed) + 0.02 * Math.sin(13 * a - seed);
    for (const t of tend) {
      const d = Math.atan2(Math.sin(a - t.a), Math.cos(a - t.a));
      r += t.len * Math.exp((-d * d) / (2 * t.w * t.w)) * Math.max(0, g * 1.4 - 0.4);
    }
    out.push({ x: cx + Math.cos(a) * r * R * E * sx, y: cy + Math.sin(a) * r * R * E * sy });
  }
  return { pts: out, tend };
}

// A hand-drawn capsule loop around a w x h box: a centre line that starts at the lower left,
// runs round once and overshoots its own start a little, like a brush that didn't lift in time.
export function capsuleLoop(w, h, { seed = 1, wob = 1, t = 0, overshoot = 0.1, n = 110, pad = 0, start = null } = {}) {
  const rnd = mulberry32(seed);
  const ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
  const r = h / 2 + pad, cx = w / 2, cy = h / 2, half = Math.max(0, w / 2 - h / 2);
  const L = 2 * half, P = 2 * L + 2 * Math.PI * r;
  const s0 = start ?? 0.6 + rnd() * 0.1;        // fraction round the loop where the brush lands (lower left)
  const at = (s) => {
    s = ((s % P) + P) % P;
    if (s < L) return { x: cx - half + s, y: cy - r, nx: 0, ny: -1 };
    s -= L;
    if (s < Math.PI * r) { const a = -Math.PI / 2 + s / r; return { x: cx + half + Math.cos(a) * r, y: cy + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) }; }
    s -= Math.PI * r;
    if (s < L) return { x: cx + half - s, y: cy + r, nx: 0, ny: 1 };
    s -= L;
    const a = Math.PI / 2 + s / r;
    return { x: cx - half + Math.cos(a) * r, y: cy + Math.sin(a) * r, nx: Math.cos(a), ny: Math.sin(a) };
  };
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const u = (i / n) * (1 + overshoot);
    const q = at((s0 + u) * P);
    const a = (s0 + u) * 6.283;
    const over = overshoot > 0 ? Math.max(0, u - 1) / overshoot : 0;   // the second pass drifts outward
    const dn = r * (wob * (0.07 * Math.sin(2 * a + ph[0] + t * 1.3) + 0.045 * Math.sin(5 * a + ph[1] - t * 0.9) + 0.02 * Math.sin(9 * a + ph[2] + t * 2.1)) + over * 0.09);
    pts.push({ x: q.x + q.nx * dn, y: q.y + q.ny * dn });
  }
  return pts;
}
