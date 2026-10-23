// Small math + geometry helpers for the hero jelly. Everything here is allocation-light so it can run every frame.
export const TAU = Math.PI * 2;
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = (t) => { t = clamp(t); return t * t * t; };
export const easeInOutCubic = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOutBack = (t, s = 1.4) => { t = clamp(t) - 1; return 1 + (s + 1) * t * t * t + s * t * t; };
export const ease = (dt, tau) => 1 - Math.exp(-dt / tau); // frame-rate independent smoothing factor
export const r1 = (v) => Math.round(v * 10) / 10;
export const rand = (a, b) => a + Math.random() * (b - a);

// stable 0..1 number from a string (hook ids -> per-tentacle personality)
export function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100003) / 100003;
}

export const parsePts = (d) => Float32Array.from(d.match(/-?\d*\.?\d+/g).map(Number));

// ---- scratch buffers, grown on demand -------------------------------------------------
let NX = new Float32Array(512), NY = new Float32Array(512);
function ensure(m) {
  if (NX.length < m) { NX = new Float32Array(m * 2); NY = new Float32Array(m * 2); }
}

// Filled tapered outline around a centre line (flat [x0,y0,x1,y1..], m points).
// hw[i] is the half width at point i. Round cap at the tip, optional round cap at the start.
// Same idea as ink.brush(), without the resampling, so it is cheap enough for every frame.
const CAP = 7;
export function ribbon(c, m, hw, capStart = false) {
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
  if (capStart) {
    const w0 = hw[0], sx = c[0], sy = c[1], t0x = NY[0], t0y = -NX[0];
    for (let k = 1; k < CAP; k++) {
      const a = (Math.PI * k) / CAP, co = Math.cos(a), si = Math.sin(a);
      s += "L" + r1(sx + (-NX[0] * co - t0x * si) * w0) + " " + r1(sy + (-NY[0] * co - t0y * si) * w0);
    }
  }
  return s + "Z";
}

// cumulative arc length, normalised to 0..1, into out (length m). Returns total length.
export function arcLen(c, m, out) {
  out[0] = 0;
  let L = 0;
  for (let i = 1; i < m; i++) { L += Math.hypot(c[2 * i] - c[2 * i - 2], c[2 * i + 1] - c[2 * i - 1]); out[i] = L; }
  const inv = L > 0 ? 1 / L : 0;
  for (let i = 1; i < m; i++) out[i] *= inv;
  return L;
}

// Copy the part of a polyline between normalised arc positions t0..t1 into out (flat). Returns the point count.
// tOut receives the normalised arc position of every copied point (so widths can follow the parent line).
export function slice(c, m, cum, t0, t1, out, tOut) {
  t0 = clamp(t0); t1 = clamp(t1);
  if (t1 - t0 < 1e-4) return 0;
  let k = 0;
  const at = (t) => {
    let i = 1;
    while (i < m - 1 && cum[i] < t) i++;
    const a = cum[i - 1], b = cum[i], f = b > a ? (t - a) / (b - a) : 0;
    out[2 * k] = c[2 * i - 2] + (c[2 * i] - c[2 * i - 2]) * f;
    out[2 * k + 1] = c[2 * i - 1] + (c[2 * i + 1] - c[2 * i - 1]) * f;
    tOut[k] = t; k++;
  };
  at(t0);
  for (let i = 0; i < m; i++) if (cum[i] > t0 && cum[i] < t1) { out[2 * k] = c[2 * i]; out[2 * k + 1] = c[2 * i + 1]; tOut[k] = cum[i]; k++; }
  at(t1);
  return k;
}

// Catmull-Rom through chain nodes (separate x/y arrays, n nodes) into out (flat). Returns the point count.
export function catmull(xs, ys, n, sub, out) {
  let m = 0;
  for (let i = 0; i < n - 1; i++) {
    const i0 = i > 0 ? i - 1 : 0, i2 = i + 1, i3 = i + 2 < n ? i + 2 : n - 1;
    const x0 = xs[i0], x1 = xs[i], x2 = xs[i2], x3 = xs[i3];
    const y0 = ys[i0], y1 = ys[i], y2 = ys[i2], y3 = ys[i3];
    for (let k = 0; k < sub; k++) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      out[2 * m] = 0.5 * (2 * x1 + (-x0 + x2) * t + (2 * x0 - 5 * x1 + 4 * x2 - x3) * t2 + (-x0 + 3 * x1 - 3 * x2 + x3) * t3);
      out[2 * m + 1] = 0.5 * (2 * y1 + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3);
      m++;
    }
  }
  out[2 * m] = xs[n - 1]; out[2 * m + 1] = ys[n - 1];
  return m + 1;
}

// Wobbly closed ring (a bubble) as path data: two blob outlines, filled with evenodd.
export function ringPath(cx, cy, r, w, seed) {
  const ring = (rad) => {
    let s = "";
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * TAU, k = 1 + 0.07 * Math.sin(a * 3 + seed) + 0.04 * Math.sin(a * 5 + seed * 2);
      s += (i ? "L" : "M") + r1(cx + Math.cos(a) * rad * k) + " " + r1(cy + Math.sin(a) * rad * k);
    }
    return s + "Z";
  };
  return ring(r) + ring(Math.max(0.5, r - w));
}

export const SVGNS = "http://www.w3.org/2000/svg";
export function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
