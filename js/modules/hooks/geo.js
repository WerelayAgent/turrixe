// Geometry for the hooks section: easing, seeded noise, cheap per-frame ribbons for the threads,
// and the glass vesicle each function lives in (an organic capsule whose ink rim pools at the bottom).
export const TAU = Math.PI * 2;
export const SVGNS = "http://www.w3.org/2000/svg";
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = (t) => { t = clamp(t); return t * t * t; };
export const easeInOutCubic = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOutBack = (t, s = 1.7) => { t = clamp(t) - 1; return 1 + (s + 1) * t * t * t + s * t * t; };
export const ease = (dt, tau) => 1 - Math.exp(-dt / tau);
export const r1 = (v) => Math.round(v * 10) / 10;

export function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

// stable 0..1 from a string: every hook keeps its own tilt, wobble and rhythm
export function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100003) / 100003;
}
export function rng(seed) {
  let a = Math.floor(seed * 4294967296) >>> 0 || 7;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Catmull-Rom through points given as separate x / y arrays (n points) into a flat buffer. Returns the count.
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

// cumulative arc length normalised to 0..1 into out; returns the total length
export function arcLen(c, m, out) {
  out[0] = 0;
  let L = 0;
  for (let i = 1; i < m; i++) { L += Math.hypot(c[2 * i] - c[2 * i - 2], c[2 * i + 1] - c[2 * i - 1]); out[i] = L; }
  const inv = L > 0 ? 1 / L : 0;
  for (let i = 1; i < m; i++) out[i] *= inv;
  return L;
}

// point at normalised arc position u on a flat polyline with cumulative table cum
export function pointAt(c, m, cum, u, o) {
  let i = 1;
  while (i < m - 1 && cum[i] < u) i++;
  const a = cum[i - 1], b = cum[i], f = b > a ? clamp((u - a) / (b - a)) : 0;
  o.x = c[2 * i - 2] + (c[2 * i] - c[2 * i - 2]) * f;
  o.y = c[2 * i - 1] + (c[2 * i + 1] - c[2 * i - 1]) * f;
  return o;
}

let NX = new Float32Array(1024), NY = new Float32Array(1024);
// Filled tapered outline around a centre line (flat, m points), half widths hw[i]; round caps.
export function ribbon(c, m, hw, from = 0, to = m - 1) {
  const cnt = to - from + 1;
  if (cnt < 2) return "";
  if (NX.length < m) { NX = new Float32Array(m * 2); NY = new Float32Array(m * 2); }
  for (let i = from; i <= to; i++) {
    const a = Math.max(from, i - 2), b = Math.min(to, i + 2);
    const tx = c[2 * b] - c[2 * a], ty = c[2 * b + 1] - c[2 * a + 1];
    const l = Math.hypot(tx, ty) || 1;
    NX[i] = -ty / l; NY[i] = tx / l;
  }
  let s = "M" + r1(c[2 * from] + NX[from] * hw[from]) + " " + r1(c[2 * from + 1] + NY[from] * hw[from]);
  for (let i = from + 1; i <= to; i++) s += "L" + r1(c[2 * i] + NX[i] * hw[i]) + " " + r1(c[2 * i + 1] + NY[i] * hw[i]);
  const cap = (i, dir) => {
    const w = hw[i], x = c[2 * i], y = c[2 * i + 1], tx = NY[i] * dir, ty = -NX[i] * dir;
    for (let k = 1; k < 6; k++) {
      const a = (Math.PI * k) / 6, co = Math.cos(a), si = Math.sin(a);
      s += "L" + r1(x + (NX[i] * co * dir + tx * si) * w) + " " + r1(y + (NY[i] * co * dir + ty * si) * w);
    }
  };
  cap(to, 1);
  for (let i = to; i >= from; i--) s += "L" + r1(c[2 * i] - NX[i] * hw[i]) + " " + r1(c[2 * i + 1] - NY[i] * hw[i]);
  cap(from, -1);
  return s + "Z";
}

const pathOf = (pts) => "M" + pts.map((p) => `${r1(p.x)} ${r1(p.y)}`).join("L") + "Z";

// closed Catmull-Rom then resampled to an even step, so rim widths and normals stay smooth
function smoothClosed(pts, step) {
  const N = pts.length, dense = [];
  for (let i = 0; i < N; i++) {
    const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
    for (let k = 0; k < 4; k++) {
      const t = k / 4, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  dense.push(dense[0]);
  const out = [dense[0]];
  let carry = 0;
  for (let i = 1; i < dense.length; i++) {
    let a = dense[i - 1]; const b = dense[i];
    let d = Math.hypot(b.x - a.x, b.y - a.y);
    while (d > 0 && carry + d >= step) {
      const t = (step - carry) / d;
      a = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(a); d = Math.hypot(b.x - a.x, b.y - a.y); carry = 0;
    }
    carry += d;
  }
  if (Math.hypot(out[out.length - 1].x - out[0].x, out[out.length - 1].y - out[0].y) < step * 0.5) out.pop();
  return out;
}
function normals(P) {
  const n = P.length;
  return P.map((p, i) => {
    const a = P[(i - 2 + n) % n], b = P[(i + 2) % n];
    const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1;
    return { x: ty / l, y: -tx / l };   // outward for a clockwise (screen) outline
  });
}

// The glass capsule a function lives in. w x h is the card box; dir points from the card toward its tentacle.
// Returns path data for the glass, the ink rim (evenodd), the cream glint, the knot, plus the knot point.
export function vesicle(w, h, seed, dir = { x: 0, y: -1 }) {
  const R = rng(seed);
  const cx = w / 2, cy = h / 2;
  const e = 0.34 + R() * 0.06, ph1 = R() * TAU, ph2 = R() * TAU, ph3 = R() * TAU, ph4 = R() * TAU;
  const lean = (R() - 0.5) * 0.05;
  const raw = [];
  const N = 120;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU, c = Math.cos(a), s = Math.sin(a);
    const j = 1 + 0.026 * Math.sin(2 * a + ph1) + 0.012 * Math.sin(5 * a + ph2);
    // a little bell: the top is domed and rounder, the bottom flatter and a touch wider where it hangs heavy
    const top = s < 0;
    const x = Math.sign(c) * Math.pow(Math.abs(c), top ? e + 0.12 : e) * (1 + 0.03 * s);
    const y = Math.sign(s) * Math.pow(Math.abs(s), top ? e - 0.06 : e + 0.1);
    const dome = top ? -7 * Math.pow(Math.max(0, -s), 3) * Math.pow(Math.abs(c) < 1 ? 1 - Math.abs(c) : 0, 0.5) : 0;
    raw.push({ x: cx + x * (w / 2 - 1) * j + lean * y * h, y: cy + y * (h / 2 - 1) * j + dome });
  }
  const O = smoothClosed(raw, 5);
  const NO = normals(O);
  let minY = 1e9, maxY = -1e9;
  for (const p of O) { minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  // the rim thickens toward the bottom and its inner edge ripples there, like the hem of my bell
  const I = O.map((p, i) => {
    const v = (p.y - minY) / (maxY - minY || 1);
    const a = Math.atan2(p.y - cy, p.x - cx);
    const hem = smoothstep((v - 0.72) / 0.22);
    const wr = (2.6 + 3.2 * Math.pow(v, 2.4)) * (1 + 0.14 * Math.sin(3 * a + ph3)) + hem * 2.3 * (1 + Math.sin(p.x * 0.085 + ph4));
    return { x: p.x - NO[i].x * wr, y: p.y - NO[i].y * wr, a };
  });
  const NI = normals(I);
  const glass = pathOf(I);
  const rim = pathOf(O) + pathOf(I);

  // glint: a cream crescent inside the upper-left corner, plus a short second dash
  const arc = (a0, a1, inset, wmax) => {
    const pts = [];
    I.forEach((p, i) => { if (p.a >= a0 && p.a <= a1) pts.push({ x: p.x - NI[i].x * inset, y: p.y - NI[i].y * inset, a: p.a }); });
    pts.sort((p, q) => p.a - q.a);
    if (pts.length < 3) return "";
    const c = new Float32Array(pts.length * 2), hw = new Float32Array(pts.length);
    pts.forEach((p, i) => { c[2 * i] = p.x; c[2 * i + 1] = p.y; const u = i / (pts.length - 1); hw[i] = 0.35 + wmax * Math.pow(Math.sin(Math.PI * u), 0.8); });
    return ribbon(c, pts.length, hw);
  };
  const glint = arc(-2.78, -2.02, 5.5, 1.9) + arc(-1.86, -1.62, 5.5, 1.2);
  // shine: when light reaches the capsule it catches the top of the ink pooled in the bottom
  const shine = arc(0.5, 2.64, 1.4, 1.05);

  // knot: the outline point that faces the tentacle, with an ink teardrop pointing out along the thread
  const dl = Math.hypot(dir.x, dir.y) || 1, dx = dir.x / dl, dy = dir.y / dl;
  let best = 0, bd = -2;
  O.forEach((p, i) => {
    const qx = p.x - cx, qy = p.y - cy, ql = Math.hypot(qx, qy) || 1;
    const d = (qx / ql) * dx + (qy / ql) * dy;
    if (d > bd) { bd = d; best = i; }
  });
  const kp = O[best], kn = NO[best];
  const tx = -kn.y, ty = kn.x;
  const kpts = [];
  for (let i = 0; i < 18; i++) {
    const b = (i / 18) * TAU, cb = Math.cos(b), sb = Math.sin(b);
    const r = 5 * (1 + 1.1 * Math.pow(Math.max(0, cb), 5));
    kpts.push({ x: kp.x + kn.x * 1.5 + (kn.x * cb + tx * sb) * r, y: kp.y + kn.y * 1.5 + (kn.y * cb + ty * sb) * r });
  }
  const knot = pathOf(smoothClosed(kpts, 1.5));
  return { glass, rim, glint, shine, knot, kx: kp.x + kn.x * 9.5, ky: kp.y + kn.y * 9.5, nx: kn.x, ny: kn.y, top: minY, bottom: maxY };
}

// a small ink seal (no perfect circles): the version stamp in the corner of each capsule
export function sealPath(r, seed) {
  const R = rng(seed), pts = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + R() * 0.2;
    const rr = r * (0.9 + R() * 0.16);
    pts.push({ x: r + 2 + Math.cos(a) * rr * 1.08, y: r + 2 + Math.sin(a) * rr * 0.92 });
  }
  return pathOf(smoothClosed(pts, 2));
}
