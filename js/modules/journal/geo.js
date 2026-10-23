// Geometry for the journal: cheap ribbons for the living spine, ink blots, wobbly rings, deckled paper,
// brush swatches for chips and strikes, and per-version brain folds. Everything returns SVG path data.
export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const outCubic = (t) => 1 - (1 - clamp(t)) ** 3;
export const inCubic = (t) => clamp(t) ** 3;
export const outBack = (t, s = 1.7) => { t = clamp(t) - 1; return 1 + (s + 1) * t * t * t + s * t * t; };
export const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
const r1 = (v) => Math.round(v * 10) / 10;

export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seedOf(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Filled outline around a centre line given as flat arrays (X, Y) with half widths HW, n points. Round caps.
let NX = new Float32Array(256), NY = new Float32Array(256);
export function ribbon(X, Y, HW, n, capStart = true, capEnd = true) {
  if (n < 2) return "";
  if (NX.length < n) { NX = new Float32Array(n * 2); NY = new Float32Array(n * 2); }
  for (let i = 0; i < n; i++) {
    const a = i > 0 ? i - 1 : 0, b = i < n - 1 ? i + 1 : n - 1;
    const tx = X[b] - X[a], ty = Y[b] - Y[a];
    const l = Math.hypot(tx, ty) || 1;
    NX[i] = -ty / l; NY[i] = tx / l;
  }
  let s = "M" + r1(X[0] + NX[0] * HW[0]) + " " + r1(Y[0] + NY[0] * HW[0]);
  for (let i = 1; i < n; i++) s += "L" + r1(X[i] + NX[i] * HW[i]) + " " + r1(Y[i] + NY[i] * HW[i]);
  const C = 8, e = n - 1;
  if (capEnd) {
    const w = HW[e];
    for (let k = 1; k < C; k++) {
      const a = (Math.PI * k) / C, c = Math.cos(a), si = Math.sin(a);
      s += "L" + r1(X[e] + (NX[e] * c + NY[e] * si) * w) + " " + r1(Y[e] + (NY[e] * c - NX[e] * si) * w);
    }
  }
  for (let i = e; i >= 0; i--) s += "L" + r1(X[i] - NX[i] * HW[i]) + " " + r1(Y[i] - NY[i] * HW[i]);
  if (capStart) {
    const w = HW[0];
    for (let k = 1; k < C; k++) {
      const a = (Math.PI * k) / C, c = Math.cos(a), si = Math.sin(a);
      s += "L" + r1(X[0] + (-NX[0] * c - NY[0] * si) * w) + " " + r1(Y[0] + (-NY[0] * c + NX[0] * si) * w);
    }
  }
  return s + "Z";
}

// Ink blot with tendrils that grow late (g = growth 0..1). Closed path.
export function blot(cx, cy, R, seed, g, N = 150) {
  const r = rng(seed);
  const K = 6 + ((r() * 5) | 0), E = 1 - 2 ** (-10 * clamp(g));
  const tend = Array.from({ length: K }, () => ({ a: r() * TAU, len: 0.16 + r() * 0.42, w: 0.07 + r() * 0.08 }));
  const p1 = r() * TAU, p2 = r() * TAU, grow = Math.max(0, g * 1.4 - 0.4);
  let s = "";
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    let rr = 1 + 0.07 * Math.sin(3 * a + p1) + 0.045 * Math.sin(7 * a + p2);
    for (const t of tend) {
      const d = Math.atan2(Math.sin(a - t.a), Math.cos(a - t.a));
      rr += t.len * Math.exp(-(d * d) / (2 * t.w * t.w)) * grow;
    }
    s += (i ? "L" : "M") + r1(cx + Math.cos(a) * rr * R * E) + " " + r1(cy + Math.sin(a) * rr * R * E);
  }
  return s + "Z";
}

// A small wobbly droplet (never a perfect circle)
export function drop(cx, cy, rad, seed, N = 14) {
  const r = rng(seed), ph = r() * TAU, k = 0.1 + r() * 0.12;
  let s = "";
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    const rr = rad * (1 + k * Math.sin(2 * a + ph) + 0.06 * Math.sin(3 * a - ph));
    s += (i ? "L" : "M") + r1(cx + Math.cos(a) * rr) + " " + r1(cy + Math.sin(a) * rr);
  }
  return s + "Z";
}

// A wobbly ring whose width swells and thins around it (fill-rule evenodd)
export function ring(cx, cy, rad, w, seed, t, N = 72) {
  const ph = (seed % 1000) / 159;
  let o = "", n = "";
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    const rr = rad * (1 + 0.035 * Math.sin(3 * a + ph + t * 0.9) + 0.02 * Math.sin(5 * a - t * 1.3));
    const ww = w * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(a * 2 + ph * 2 + t * 0.5))) / 2;
    o += (i ? "L" : "M") + r1(cx + Math.cos(a) * (rr + ww)) + " " + r1(cy + Math.sin(a) * (rr + ww));
  }
  for (let i = N; i >= 0; i--) {
    const a = (i / N) * TAU;
    const rr = rad * (1 + 0.035 * Math.sin(3 * a + ph + t * 0.9) + 0.02 * Math.sin(5 * a - t * 1.3));
    const ww = w * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(a * 2 + ph * 2 + t * 0.5))) / 2;
    n += (i === N ? "M" : "L") + r1(cx + Math.cos(a) * (rr - ww)) + " " + r1(cy + Math.sin(a) * (rr - ww));
  }
  return o + "Z" + n + "Z";
}

// Deckled paper: a page with soft, torn-looking edges and slightly dog-eared corners
export function paper(ink, W, H, seed) {
  const r = rng(seed), pts = [];
  const step = 26;
  const edge = (x0, y0, x1, y1, nx, ny) => {
    const L = Math.hypot(x1 - x0, y1 - y0), m = Math.max(2, Math.round(L / step));
    for (let i = 0; i < m; i++) {
      const t = i / m;
      const j = (r() - 0.5) * 3.4 + Math.sin(t * 7 + seed) * 1.1 - (i === 0 ? 1.8 : 0);
      pts.push(ink.P(x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j));
    }
  };
  edge(0, 0, W, 0, 0, -1); edge(W, 0, W, H, 1, 0); edge(W, H, 0, H, 0, 1); edge(0, H, 0, 0, -1, 0);
  const sp = ink.spline(pts, true, 5);
  return "M" + sp.map((p) => r1(p.x) + " " + r1(p.y)).join("L") + "Z";
}

// A horizontal brush bar from x0 to x1 around y, full width w: loaded at the start, dry at the end
export function bar(ink, x0, x1, y, w, seed) {
  const r = rng(seed), L = x1 - x0;
  const c = [ink.P(x0, y + (r() - 0.5) * w * 0.3), ink.P(x0 + L * 0.35, y + (r() - 0.5) * w * 0.22), ink.P(x0 + L * 0.7, y + (r() - 0.5) * w * 0.22), ink.P(x1, y + (r() - 0.5) * w * 0.34)];
  const pts = ink.spline(c, false, 12);
  const ph = r() * TAU;
  return ink.brush(pts, (t) => w * (0.88 + 0.1 * Math.sin(Math.PI * t) + 0.06 * Math.sin(t * 17 + ph)) * (t > 0.9 ? 1 - (t - 0.9) * 4.5 : 1));
}

// Horizontal brush swatch behind a chip, in a box W x H
export function swatch(ink, W, H, seed, { thick = 0.82, lift = 0 } = {}) {
  return bar(ink, H * 0.42, W - H * 0.38, H / 2 + lift, H * thick, seed);
}

// A quick pen strike through a word of n monospace characters, in units of 0.04em: one character is 15 wide and
// the box is one em (25 tall), whose x-height middle sits near 14.6 for a line-height of 1. The pen lands with a
// small bead, runs fine (about a pixel at 12px), rises a hair and flicks off dry, so the word reads through it.
export function strike(ink, n, seed) {
  const r = rng(seed), x0 = -6.5, x1 = n * 15 + 6;
  const ya = 15.6 + (r() - 0.5) * 0.8, yb = 13.5 + (r() - 0.5) * 0.8;
  const K = Math.max(2, Math.min(6, Math.round(n / 3))), c = [];
  for (let i = 0; i <= K; i++) {
    const u = i / K;
    c.push(ink.P(x0 + (x1 - x0) * u, ya + (yb - ya) * u + (i && i < K ? (r() - 0.5) * 1.1 : 0)));
  }
  c.push(ink.P(x1 + 4.5, yb - 3.2));
  return ink.brush(ink.spline(c, false, 8), (t) =>
    3.8 * (0.62 + 0.38 * Math.exp(-(((t - 0.03) / 0.045) ** 2))) * (1 - 0.78 * smooth((t - 0.74) / 0.26)));
}

// Each brain version gets its own folds: one of the six groove variants plus a gentle seeded warp.
export function foldsFor(J, entry) {
  const V = J.brain.grooves;
  const s = seedOf(`${entry.hash}|${entry.v}`);
  const r = rng(s);
  const variant = s % V.length;
  return V[variant].map((g) => {
    const ph = r() * TAU, amp = 3 + r() * 6, fr = 0.16 + r() * 0.22;
    const n = g.pts.length, out = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const env = Math.sin((Math.PI * i) / Math.max(1, n - 1));
      out[2 * i] = g.pts[i][0] + Math.sin(i * fr + ph) * amp * env;
      out[2 * i + 1] = g.pts[i][1] + Math.cos(i * fr * 1.3 + ph) * amp * env;
    }
    return out;
  });
}

// Groove ribbons for a set of folds (flat arrays) with the variant widths; k scales the width
const GX = new Float32Array(64), GY = new Float32Array(64), GW = new Float32Array(64);
export function foldsPath(folds, widths, k = 1) {
  let d = "";
  for (let g = 0; g < folds.length; g++) {
    const a = folds[g], n = a.length / 2, w = widths[g];
    for (let i = 0; i < n; i++) {
      GX[i] = a[2 * i]; GY[i] = a[2 * i + 1];
      GW[i] = w * 0.33 * k * (0.58 + 0.42 * Math.sin((Math.PI * i) / (n - 1)));
    }
    d += ribbon(GX, GY, GW, n);
  }
  return d;
}

// Closed-eye lid: a cream swell along the lower half of the eye; lashes for the big portrait
export function lidPath(ink, e, thick = 1, lashes = false) {
  const c = [
    ink.P(e.x - e.rx * 0.8, e.y + e.ry * 0.22), ink.P(e.x - e.rx * 0.38, e.y + e.ry * 0.5),
    ink.P(e.x + e.rx * 0.04, e.y + e.ry * 0.58), ink.P(e.x + e.rx * 0.46, e.y + e.ry * 0.47), ink.P(e.x + e.rx * 0.82, e.y + e.ry * 0.2),
  ];
  let d = ink.brush(ink.spline(c, false, 10), (t) => (5 + 12 * Math.sin(Math.PI * t)) * thick);
  if (lashes) {
    for (const [i, lean] of [[1, -0.45], [2, 0.05], [3, 0.5]]) {
      const p = c[i], L = e.ry * 0.36;
      const q = ink.P(p.x + lean * L * 0.7, p.y + L);
      d += ink.brush([p, ink.P((p.x + q.x) / 2, (p.y + q.y) / 2 + 2), q], (t) => (11 - 8 * t) * thick);
    }
  }
  return d;
}
