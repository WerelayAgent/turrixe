// Geometry for the loader story, as SVG path data: the bell outline sampled by angle (so an ink blot can morph
// into it point by point), the falling drop, flat ripple rings on the water surface and small splash droplets.
import { r1 } from "../hero-jelly/util.js";

const TAU = Math.PI * 2;

// Radius of a closed outline (flat [x0,y0,x1,y1..]) along N rays from (cx, cy). Ray k points at angle k/N*TAU,
// with y down, so k = N/4 looks straight down. The farthest crossing wins, so a scalloped hem stays whole.
export function polarSample(P, cx, cy, N) {
  const out = new Float32Array(N);
  const n = P.length / 2;
  for (let k = 0; k < N; k++) {
    const a = (k / N) * TAU, dx = Math.cos(a), dy = Math.sin(a);
    let best = 0;
    for (let i = 0; i < n; i++) {
      const j = i + 1 < n ? i + 1 : 0;
      const x1 = P[2 * i] - cx, y1 = P[2 * i + 1] - cy;
      const ex = P[2 * j] - cx - x1, ey = P[2 * j + 1] - cy - y1;
      const den = dx * ey - dy * ex;
      if (den > -1e-9 && den < 1e-9) continue;
      const t = (x1 * ey - y1 * ex) / den, u = (x1 * dy - y1 * dx) / den;
      if (t > best && u >= 0 && u <= 1) best = t;
    }
    out[k] = best;
  }
  return out;
}

// Closed path through N radii around (cx, cy)
export function polarPath(cx, cy, R, N) {
  let s = "";
  for (let k = 0; k < N; k++) {
    const a = (k / N) * TAU;
    s += (k ? "L" : "M") + r1(cx + Math.cos(a) * R[k]) + " " + r1(cy + Math.sin(a) * R[k]);
  }
  return s + "Z";
}

// A falling ink drop: round below, drawn up into a soft point above. (x, y) is the centre of the round part.
export function dropPath(x, y, R, sx, sy, n = 40) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    let px = Math.cos(a), py = Math.sin(a);
    if (py < 0) {
      const u = -py;
      py = -u * (1 + 1.15 * u * u * u);
      px *= 1 - 0.5 * u * u;
    }
    s += (i ? "L" : "M") + r1(x + px * R * sx) + " " + r1(y + py * R * sy);
  }
  return s + "Z";
}

// A ring lying flat on the water, seen from just above: a thin ellipse, heavier at the front than at the back,
// with a slight hand-drawn wobble. Two outlines, meant for fill-rule evenodd.
export function ringPath(cx, cy, rx, ry, w, wBack, seed = 0, n = 56) {
  let o = "", i2 = "";
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU, c = Math.cos(a), s = Math.sin(a);
    const front = 0.5 + 0.5 * s;
    const hw = (wBack + (w - wBack) * front * front) / 2;
    const wob = 1 + 0.025 * Math.sin(3 * a + seed) + 0.015 * Math.sin(7 * a - seed * 1.7);
    const px = cx + c * rx * wob, py = cy + s * ry * wob;
    const nx = c * ry, ny = s * rx, l = Math.hypot(nx, ny) || 1;
    o += (i ? "L" : "M") + r1(px + (nx / l) * hw) + " " + r1(py + (ny / l) * hw);
    i2 += (i ? "L" : "M") + r1(px - (nx / l) * hw) + " " + r1(py - (ny / l) * hw);
  }
  return o + "Z" + i2 + "Z";
}

// A small droplet stretched along its velocity
export function dropletPath(x, y, r, vx, vy, n = 10) {
  const sp = Math.hypot(vx, vy), st = 1 + Math.min(1.1, sp * 0.0016);
  const ux = sp ? vx / sp : 0, uy = sp ? vy / sp : 1;
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const lx = Math.cos(a) * r * st, ly = (Math.sin(a) * r) / Math.sqrt(st);
    s += (i ? "L" : "M") + r1(x + lx * ux - ly * uy) + " " + r1(y + lx * uy + ly * ux);
  }
  return s + "Z";
}

// A lumpy little blot (satellite ink), r with a fixed per-seed wobble
export function blotPath(x, y, r, seed, n = 12) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + 0.16 * Math.sin(2 * a + seed) + 0.09 * Math.sin(5 * a + seed * 2.3);
    s += (i ? "L" : "M") + r1(x + Math.cos(a) * r * k) + " " + r1(y + Math.sin(a) * r * k);
  }
  return s + "Z";
}
