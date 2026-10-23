// Ink drawing kit (same as brand/ink.mjs): splines, tapered brush strokes, curls, blobs and eyes as SVG path data.
export const INK = "#0b0b0b";
export const CREAM = "#fdf1d8";

export const P = (x, y) => ({ x, y });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k });
const len = (a) => Math.hypot(a.x, a.y);
const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };

// Catmull-Rom point between p1 and p2
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

export function spline(pts, closed = false, n = 28) {
  const N = pts.length, out = [];
  const get = (i) => (closed ? pts[((i % N) + N) % N] : pts[Math.max(0, Math.min(N - 1, i))]);
  const segs = closed ? N : N - 1;
  for (let i = 0; i < segs; i++) for (let k = 0; k < n; k++) out.push(cr(get(i - 1), get(i), get(i + 1), get(i + 2), k / n));
  if (!closed) out.push(pts[N - 1]);
  return out;
}

export function resample(pts, step = 2) {
  const out = [pts[0]];
  let prev = pts[0], carry = 0;
  for (let i = 1; i < pts.length; i++) {
    let a = prev; const b = pts[i]; let d = len(sub(b, a));
    while (d > 0 && carry + d >= step) {
      const t = (step - carry) / d; const p = add(a, mul(sub(b, a), t));
      out.push(p); a = p; d = len(sub(b, a)); carry = 0;
    }
    carry += d; prev = b;
  }
  const last = pts[pts.length - 1];
  if (len(sub(last, out[out.length - 1])) > 0.5) out.push(last);
  return out;
}

const pathOf = (pts, closed = true) =>
  "M " + pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ") + (closed ? " Z" : "");

export const fill = (d, color = INK) => `<path d="${d}" fill="${color}"/>`;

// A filled outline around a centre line; wfn(t) gives the full width at 0..1 along it. Round caps.
export function brush(center, wfn) {
  const pts = resample(center, 2);
  const n = pts.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + len(sub(pts[i], pts[i - 1]));
  const T = cum[n - 1] || 1;
  const L = [], R = [], N = [], G = [], W = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(n - 1, i + 2)];
    const tg = norm(sub(b, a)); const nm = { x: -tg.y, y: tg.x };
    const w = Math.max(0.6, wfn(cum[i] / T) / 2);
    L.push(add(pts[i], mul(nm, w))); R.push(sub(pts[i], mul(nm, w)));
    N.push(nm); G.push(tg); W.push(w);
  }
  const cap = (p, nm, tg, w, fwd) => {
    const o = [];
    for (let k = 1; k < 16; k++) {
      const a = (Math.PI * k) / 16, c = Math.cos(a), s = Math.sin(a);
      o.push(fwd ? add(add(p, mul(nm, c * w)), mul(tg, s * w)) : add(sub(p, mul(nm, c * w)), mul(tg, -s * w)));
    }
    return o;
  };
  const outline = [...L, ...cap(pts[n - 1], N[n - 1], G[n - 1], W[n - 1], true), ...R.reverse(), ...cap(pts[0], N[0], G[0], W[0], false)];
  return pathOf(outline, true);
}

// Curl continuing from a heading; dir 1 turns clockwise on screen, -1 anticlockwise
export function spiral(start, heading, r0, r1, turns, dir, step = 2) {
  const out = [start];
  let x = start.x, y = start.y, h = heading, ang = 0;
  const total = turns * 2 * Math.PI;
  while (ang < total) {
    const r = r0 + (r1 - r0) * (ang / total);
    const dh = step / r;
    h += dir * dh; ang += dh;
    x += Math.cos(h) * step; y += Math.sin(h) * step;
    out.push({ x, y });
  }
  return out;
}

const plen = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += len(sub(pts[i], pts[i - 1])); return s; };

// Tapered tentacle through control points, optionally ending in a curl.
// w0 at the base, w1 where the curl starts (or at the tip), wEnd at the very end of the curl.
export function tentacle(ctrl, { w0 = 40, w1 = 16, wEnd = null, curl = null, pow = 0.85, color = INK } = {}) {
  let pts = spline(ctrl, false, 36);
  const mainLen = plen(pts);
  if (curl) {
    const a = pts[pts.length - 2], b = pts[pts.length - 1];
    const h = Math.atan2(b.y - a.y, b.x - a.x);
    pts = pts.concat(spiral(b, h, curl.r0, curl.r1, curl.turns, curl.dir).slice(1));
  }
  const total = plen(pts), split = mainLen / total;
  const we = wEnd ?? (curl ? w1 * 0.75 : w1);
  const wfn = (t) => (t <= split ? w0 + (w1 - w0) * Math.pow(t / split, pow) : w1 + (we - w1) * ((t - split) / (1 - split || 1)));
  return fill(brush(pts, wfn), color);
}

// A stroke whose width swells in the middle and thins at both ends (grooves, smiles)
export function swell(ctrl, { w = 14, wEnds = 4, color = INK } = {}) {
  const pts = spline(ctrl, false, 36);
  return fill(brush(pts, (t) => wEnds + (w - wEnds) * Math.sin(Math.PI * t)), color);
}

export const blob = (pts, color = INK) => fill(pathOf(spline(pts, true, 30), true), color);

// Cream eye with a pupil pushed toward `look` (a direction); rot in degrees
export function eye({ x, y, rx, ry = rx, rot = 0, look = { x: 0, y: 0 }, amt = 1, pr = 0.47 }) {
  const r = Math.min(rx, ry);
  const p = r * pr;
  const dir = norm(look.x === 0 && look.y === 0 ? { x: 0, y: 0.0001 } : look);
  const reach = (r - p - r * 0.06) * amt;
  const px = x + dir.x * reach, py = y + dir.y * reach;
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="${CREAM}"/>` +
    `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${p.toFixed(1)}" fill="${INK}"/>`;
}

// Apply translate / rotate (deg, around origin) / scale to a list of points
export function xf(pts, { tx = 0, ty = 0, rot = 0, s = 1, ox = 0, oy = 0 }) {
  const c = Math.cos((rot * Math.PI) / 180), si = Math.sin((rot * Math.PI) / 180);
  return pts.map((p) => {
    const x = (p.x - ox) * s, y = (p.y - oy) * s;
    return { x: x * c - y * si + tx, y: x * si + y * c + ty };
  });
}
