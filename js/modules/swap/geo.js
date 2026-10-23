// Geometry for the swap ceremony: one big hand-pulled ink stroke (the wipe), its dry-brush streaks,
// splatter, ink wisps that bleed off into the water, and small blob shapes for the diff chips.
// The stroke is built once per layout as a dense centre line with per-point widths; every frame only
// slices it between two arc positions and offsets it vertically, so drawing stays pure arithmetic.

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const easeOut3 = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeOut4 = (t) => 1 - Math.pow(1 - clamp(t), 4);
export const easeIn3 = (t) => { t = clamp(t); return t * t * t; };
export const easeInOut3 = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOutBack = (t, s = 1.7) => { t = clamp(t) - 1; return 1 + (s + 1) * t * t * t + s * t * t; };
const r1 = (v) => Math.round(v * 10) / 10;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// smooth 1D value noise in -1..1
function noise1(seed) {
  const r = rng(seed), T = new Float32Array(256);
  for (let i = 0; i < 256; i++) T[i] = r() * 2 - 1;
  return (x) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    const a = T[i & 255], b = T[(i + 1) & 255];
    return a + (b - a) * u;
  };
}

export const NS = "http://www.w3.org/2000/svg";
export function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

// ---------------------------------------------------------------------------------------------
// The stroke. o: { W, H, fs, T, textLeft, TW, yText, slope, tail, rightLimit, mobile, seed }
export function buildBand(ink, o) {
  const { T, fs } = o;
  const R = rng(o.seed);
  const xc = o.textLeft + o.TW / 2;
  const yAt = (x) => o.yText + o.slope * (x - xc);
  const x0 = -T * 0.95;                                   // the brush lands just off screen
  const x1 = o.textLeft - fs * 0.5;                       // the body starts before the text
  const x3 = o.textLeft + o.TW + fs * 0.42;               // and runs past it
  const curlR = T * (o.mobile ? 0.18 : 0.2);
  const x4 = o.mobile ? o.W + T * 0.7 : Math.max(x3 + fs * 0.6, Math.min(x3 + o.tail, o.rightLimit - curlR * 1.6));

  // evenly spaced control points so the spline stays calm; the tail lifts like a tentacle tip
  const N = 12, ctrl = [];
  for (let i = 0; i < N; i++) {
    const x = lerp(x0, x4, i / (N - 1));
    const droop = T * 0.13 * (1 - smooth((x - x0) / Math.max(1, x1 - x0)));
    const lift = -T * 0.3 * Math.pow(smooth((x - x3 + fs * 0.2) / Math.max(1, x4 - x3 + fs * 0.2)), 1.6);
    const sway = T * 0.035 * Math.sin((x / o.W) * 5.1 + 0.8) * smooth((x - x1) / Math.max(1, x3 - x1));
    ctrl.push(ink.P(x, yAt(x) + droop + lift + sway));
  }
  let pts = ink.spline(ctrl, false, 18);
  const main = ink.resample(pts, 3);
  const a = main[main.length - 3], b = main[main.length - 1];
  const head = Math.atan2(b.y - a.y, b.x - a.x);
  const curl = ink.spiral(b, head, curlR, curlR * 0.3, 0.95, -1, 2);
  pts = ink.resample(main.concat(curl.slice(1)), o.mobile ? 3.5 : 4.5);

  const n = pts.length;
  const x = new Float32Array(n), y = new Float32Array(n), s = new Float32Array(n);
  const nx = new Float32Array(n), ny = new Float32Array(n), ht = new Float32Array(n), hb = new Float32Array(n);
  for (let i = 0; i < n; i++) { x[i] = pts[i].x; y[i] = pts[i].y; if (i) s[i] = s[i - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1]); }
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 2), i1 = Math.min(n - 1, i + 2);
    const tx = x[i1] - x[i0], ty = y[i1] - y[i0], l = Math.hypot(tx, ty) || 1;
    nx[i] = -ty / l; ny[i] = tx / l;     // points "down" for a stroke running left to right
  }
  const L = s[n - 1];
  // arc positions of the landmarks
  const sOfX = (X, lim = n - 1) => { let i = 0; while (i < lim && x[i + 1] < X) i++; return s[i] + (X - x[i]); };
  let iCurl = 0; while (iCurl < n - 1 && x[iCurl] < x4 - 0.5) iCurl++;
  const sCurl = s[iCurl], sB0 = clamp(sOfX(x1, iCurl), 1, sCurl), sBody = clamp(sOfX(x3, iCurl), sB0 + 1, sCurl - 1);

  const nT = noise1(o.seed + 11), nB = noise1(o.seed + 23);
  const END = 0.085;                                      // half width (in T) where the tip starts to curl
  const hwAt = (sv) => {
    if (sv < sB0) return 0.5 * T * lerp(0.8, 1, smooth(sv / sB0));
    if (sv < sBody) return 0.5 * T * (1 + 0.028 * Math.sin(sv / (T * 1.15) + 1.7));
    if (sv < sCurl) { const u = (sv - sBody) / (sCurl - sBody); return T * lerp(0.5, END, Math.pow(smooth(u), 0.8)); }
    return T * lerp(END, 0.012, Math.pow((sv - sCurl) / Math.max(1, L - sCurl), 0.75));
  };
  for (let i = 0; i < n; i++) {
    const sv = s[i], base = hwAt(sv);
    const dry = smooth((sv - sBody) / Math.max(1, (sCurl - sBody) * 0.7));
    const amp = T * (1 + 1.2 * dry) * Math.min(1, base / (0.16 * T));
    ht[i] = Math.max(0.6, base + amp * (0.02 * nT(sv / (T * 0.24)) + 0.008 * nT(sv / (T * 0.045) + 40)));
    hb[i] = Math.max(0.6, base + amp * (0.02 * nB(sv / (T * 0.24)) + 0.008 * nB(sv / (T * 0.045) + 40)));
  }

  // dry-brush streaks: a few hairline gaps in the tail, where the bristles start to run out of ink
  const slivers = [];
  const tl = sCurl - sBody;
  const offs = [-0.5, -0.08, 0.28, 0.6];
  for (let k = 0; k < offs.length; k++) {
    const sa = sBody + tl * (0.02 + R() * 0.22);
    const sb = sBody + tl * (0.5 + R() * 0.32);
    slivers.push({ off: offs[k] + (R() - 0.5) * 0.1, sa, sb, w: T * (0.0035 + R() * 0.004) });
  }

  // splatter: where the brush hit the paper, and a few flicked off the tail
  const drops = [];
  const nd = o.mobile ? 6 : 9;
  for (let k = 0; k < nd; k++) {
    const tailOne = k >= nd - 3;
    const sv = tailOne ? lerp(sBody, sCurl, 0.3 + R() * 0.75) : lerp(T * 0.2, sB0 + fs * 0.9, R());
    const side = tailOne ? (R() < 0.75 ? -1 : 1) : (R() < 0.5 ? -1 : 1);
    const r = T * (tailOne ? 0.01 + R() * 0.012 : 0.012 + R() * 0.026);
    const pts2 = [];
    const m = 7;
    for (let j = 0; j < m; j++) { const an = (j / m) * Math.PI * 2; const rr = r * (0.72 + R() * 0.5); pts2.push([Math.cos(an) * rr, Math.sin(an) * rr * (0.8 + R() * 0.3)]); }
    drops.push({ s: sv, side, dist: T * (0.05 + R() * (tailOne ? 0.16 : 0.32)), along: (R() - 0.5) * T * 0.2, r, pts: pts2, t: null });
  }

  // ink wisps that slowly bleed off the edges into the water
  const wisps = [];
  const wspots = o.mobile
    ? [[sOfX(xc - o.TW * 0.22, iCurl), 1, 0.8], [sOfX(xc + o.TW * 0.3, iCurl), 1, 1]]
    : [[sOfX(xc - o.TW * 0.12, iCurl), 1, 0.75], [sOfX(xc + o.TW * 0.3, iCurl), 1, 1], [lerp(sBody, sCurl, 0.42), 1, 0.85], [sB0 * 0.5, -1, 0.6]];
  for (const [sv, side, k] of wspots) {
    const len = T * (0.2 + R() * 0.1) * k;
    const dir = R() < 0.5 ? -1 : 1;
    const c = [ink.P(0, 0), ink.P(len * 0.08 * dir, len * 0.34), ink.P(-len * 0.05 * dir, len * 0.66), ink.P(len * 0.06 * dir, len * 0.88)];
    let wp = ink.spline(c, false, 10);
    const pa = wp[wp.length - 2], pb = wp[wp.length - 1];
    wp = wp.concat(ink.spiral(pb, Math.atan2(pb.y - pa.y, pb.x - pa.x), len * 0.14, len * 0.05, 0.9, dir, 1.2).slice(1));
    wp = ink.resample(wp, 1.6);
    wisps.push({ s: sv, side, pts: wp, w0: T * 0.034 * Math.sqrt(k), seed: R() * 9, t: null });
  }

  return { n, x, y, s, nx, ny, ht, hb, L, sB0, sBody, sCurl, curlR, slivers, drops, wisps, xc, x1, x3, x4, sOfX: (X) => sOfX(X, iCurl) };
}

// index i with s[i] <= v < s[i+1] (binary search) and the fraction between them
function locate(G, v) {
  const s = G.s;
  let lo = 0, hi = G.n - 1;
  if (v <= 0) return [0, 0];
  if (v >= s[hi]) return [hi - 1, 1];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= v) lo = m; else hi = m; }
  return [lo, (v - s[lo]) / (s[lo + 1] - s[lo] || 1)];
}

// a point of the stroke at arc position v: centre, normal, half widths (offset: per-point vertical shift)
export function pointAt(G, v, off, out = {}) {
  const [i, f] = locate(G, v), j = Math.min(G.n - 1, i + 1);
  out.x = G.x[i] + (G.x[j] - G.x[i]) * f;
  out.y = G.y[i] + (G.y[j] - G.y[i]) * f + (off ? off[i] + (off[j] - off[i]) * f : 0);
  out.nx = G.nx[i] + (G.nx[j] - G.nx[i]) * f;
  out.ny = G.ny[i] + (G.ny[j] - G.ny[i]) * f;
  out.ht = G.ht[i] + (G.ht[j] - G.ht[i]) * f;
  out.hb = G.hb[i] + (G.hb[j] - G.hb[i]) * f;
  out.a = Math.atan2(G.nx[i] * -1, G.ny[i]);   // tangent angle from the normal
  return out;
}

const PA = {}, PB = {};
const CAPN = 9;
// Outline of the stroke between arc positions sa..sb with round ends, plus dry streak holes (evenodd).
export function bandPath(G, sa, sb, off, k = 1) {
  if (sb - sa < 1) return "";
  const { x, y, nx, ny, ht, hb } = G;
  pointAt(G, sa, off, PA);
  pointAt(G, sb, off, PB);
  const [ia] = locate(G, sa), [ib] = locate(G, sb);
  // bottom side forward
  let d = "M" + r1(PA.x + PA.nx * PA.hb * k) + " " + r1(PA.y + PA.ny * PA.hb * k);
  for (let i = ia + 1; i <= ib; i++) {
    const o = off ? off[i] : 0;
    d += "L" + r1(x[i] + nx[i] * hb[i] * k) + " " + r1(y[i] + o + ny[i] * hb[i] * k);
  }
  // round head
  const tx = PB.ny, ty = -PB.nx, rf = ((PB.ht + PB.hb) / 2) * k;
  for (let c = 0; c <= CAPN; c++) {
    const an = (Math.PI * c) / CAPN, co = Math.cos(an), si = Math.sin(an);
    const w = (co > 0 ? PB.hb : PB.ht) * k;
    d += "L" + r1(PB.x + PB.nx * co * w + tx * si * rf) + " " + r1(PB.y + PB.ny * co * w + ty * si * rf);
  }
  // top side back
  for (let i = ib; i > ia; i--) {
    const o = off ? off[i] : 0;
    d += "L" + r1(x[i] - nx[i] * ht[i] * k) + " " + r1(y[i] + o - ny[i] * ht[i] * k);
  }
  // round tail
  const ux = PA.ny, uy = -PA.nx, rt = ((PA.ht + PA.hb) / 2) * k;
  for (let c = 0; c <= CAPN; c++) {
    const an = (Math.PI * c) / CAPN, co = Math.cos(an), si = Math.sin(an);
    const w = (co > 0 ? PA.ht : PA.hb) * k;
    d += "L" + r1(PA.x - PA.nx * co * w - ux * si * rt) + " " + r1(PA.y - PA.ny * co * w - uy * si * rt);
  }
  d += "Z";
  // dry streaks, only where the stroke already exists in full
  for (const sl of G.slivers) {
    if (sl.sa < sa + 6 || sl.sb > sb - 6) continue;
    const [i0] = locate(G, sl.sa), [i1] = locate(G, sl.sb);
    if (i1 - i0 < 3) continue;
    let up = "", dn = "";
    for (let i = i0 + 1; i <= i1; i++) {
      const u = (G.s[i] - sl.sa) / (sl.sb - sl.sa);
      const lw = sl.w * Math.pow(Math.sin(Math.PI * clamp(u)), 0.6) * k;
      const hw = (sl.off < 0 ? ht[i] : hb[i]) * k;
      const cx = x[i] + nx[i] * sl.off * hw, cy = y[i] + (off ? off[i] : 0) + ny[i] * sl.off * hw;
      up += (up ? "L" : "M") + r1(cx + nx[i] * lw) + " " + r1(cy + ny[i] * lw);
      dn = "L" + r1(cx - nx[i] * lw) + " " + r1(cy - ny[i] * lw) + dn;
    }
    d += up + dn + "Z";
  }
  return d;
}

// a closed wobbly blob filling a w x h box (chips): squarish, hand cut, never a rounded rectangle
export function blobPath(ink, w, h, seed) {
  const R = rng(seed);
  const n = 22, pts = [];
  const ph = R() * 9;
  for (let i = 0; i < n; i++) {
    const an = (i / n) * Math.PI * 2, c = Math.cos(an), si = Math.sin(an);
    const px = Math.sign(c) * Math.pow(Math.abs(c), 0.34), py = Math.sign(si) * Math.pow(Math.abs(si), 0.5);
    const j = 0.965 + 0.035 * Math.sin(an * 3 + ph) + 0.02 * Math.sin(an * 7 + ph * 2) + (R() - 0.5) * 0.025;
    pts.push(ink.P(w / 2 + px * (w / 2) * j, h / 2 + py * (h / 2) * j));
  }
  return "M " + ink.spline(pts, true, 5).map((p) => `${r1(p.x)} ${r1(p.y)}`).join(" L ") + " Z";
}

// wobbly closed ring (a bubble) as evenodd path data
export function ringPath(cx, cy, r, w, seed) {
  const ring = (rad) => {
    let s = "";
    for (let i = 0; i <= 20; i++) {
      const an = (i / 20) * Math.PI * 2, k = 1 + 0.07 * Math.sin(an * 3 + seed) + 0.04 * Math.sin(an * 5 + seed * 2);
      s += (i ? "L" : "M") + r1(cx + Math.cos(an) * rad * k) + " " + r1(cy + Math.sin(an) * rad * k);
    }
    return s + "Z";
  };
  return ring(r) + ring(Math.max(0.5, r - w));
}

// variable-width outline around a flat centre line (allocation light; caps at both ends)
const NX = new Float32Array(1024), NY = new Float32Array(1024);
export function ribbon(c, m, wfn) {
  if (m < 2) return "";
  for (let i = 0; i < m; i++) {
    const a = Math.max(0, i - 1), b = Math.min(m - 1, i + 1);
    const tx = c[2 * b] - c[2 * a], ty = c[2 * b + 1] - c[2 * a + 1], l = Math.hypot(tx, ty) || 1;
    NX[i] = -ty / l; NY[i] = tx / l;
  }
  let d = "";
  for (let i = 0; i < m; i++) { const w = wfn(i / (m - 1)) / 2; d += (i ? "L" : "M") + r1(c[2 * i] + NX[i] * w) + " " + r1(c[2 * i + 1] + NY[i] * w); }
  const e = m - 1, we = wfn(1) / 2;
  for (let k = 1; k < 6; k++) {
    const an = (Math.PI * k) / 6, co = Math.cos(an), si = Math.sin(an);
    d += "L" + r1(c[2 * e] + NX[e] * co * we + NY[e] * si * we) + " " + r1(c[2 * e + 1] + NY[e] * co * we - NX[e] * si * we);
  }
  for (let i = m - 1; i >= 0; i--) { const w = wfn(i / (m - 1)) / 2; d += "L" + r1(c[2 * i] - NX[i] * w) + " " + r1(c[2 * i + 1] - NY[i] * w); }
  const w0 = wfn(0) / 2;
  for (let k = 1; k < 6; k++) {
    const an = (Math.PI * k) / 6, co = Math.cos(an), si = Math.sin(an);
    d += "L" + r1(c[0] - NX[0] * co * w0 - NY[0] * si * w0) + " " + r1(c[1] - NY[0] * co * w0 + NX[0] * si * w0);
  }
  return d + "Z";
}
