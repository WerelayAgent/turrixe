// A living bubble membrane drawn in ink: a glass inside, a hand-drawn rim that pools thicker at the bottom,
// and a cream glint on the upper left, like my bell. It breathes, swells on focus, and dents where you type.
// Control points sit on a soft superellipse (spaced by arc length); each frame they are pushed along their
// normals by a slow wobble plus damped local "pokes", then splined (Catmull-Rom) into the outline.
import { TAU, clamp, smooth, r1, rng, svgEl, ribbon } from "./util.js";

export function createMembrane(svg, {
  seed = 7, pad = 18, n = 16, sub = 8, bulgeK = 0.14, glintLen = 0.26,
  rimTop = 3.2, rimBot = 9, bw = 1, jitter = 0.022, wob = 1,
  glass = true, glint = true, glint2 = true, rimClass = "ask-ink", glassClass = "ask-glass",
} = {}) {
  const glassEl = glass ? svgEl("path", { class: glassClass }, svg) : null;
  const rimEl = svgEl("path", { class: rimClass, "fill-rule": "evenodd" }, svg);
  const glintEl = glint ? svgEl("path", { class: "ask-cream" }, svg) : null;
  const glint2El = glint && glint2 ? svgEl("path", { class: "ask-cream" }, svg) : null;

  const R = rng(seed);
  const jit = Float32Array.from({ length: n }, () => R() - 0.5);
  const ph = Float32Array.from({ length: n }, () => R() * TAU);
  const wj = Float32Array.from({ length: n }, () => 0.85 + R() * 0.3);
  const M = n * sub;
  const BX = new Float32Array(n), BY = new Float32Array(n), BNX = new Float32Array(n), BNY = new Float32Array(n), BS = new Float32Array(n);
  const CX = new Float32Array(n), CY = new Float32Array(n);
  const PX = new Float32Array(M), PY = new Float32Array(M), NX = new Float32Array(M), NY = new Float32Array(M), WD = new Float32Array(M);
  const GL = new Float32Array(M * 2), GW = new Float32Array(M);
  const pokes = [];
  let W = 0, H = 0, a = 0, b = 0, cx = 0, cy = 0;
  let inflate = 0, inflateV = 0, inflateTo = 0, kickAmp = 0, kickT = -9;

  function resize(w, h) {
    W = w + pad * 2; H = h + pad * 2; a = w / 2; b = h / 2; cx = W / 2; cy = H / 2;
    svg.setAttribute("viewBox", `0 0 ${r1(W)} ${r1(H)}`);
    // dense capsule (round caps, sides bulging a little like a stretched soap film), then n control points
    // spaced evenly by arc length so the long sides get as many as the caps
    const D = 600, xs = new Float32Array(D + 1), ys = new Float32Array(D + 1), cum = new Float32Array(D + 1);
    const rc = Math.min(b, a), straight = Math.max(0, 2 * (a - rc)), cap = Math.PI * rc, per = 2 * straight + 2 * cap;
    const bulge = rc * bulgeK;
    for (let i = 0; i <= D; i++) {
      let u = (i / D) * per, x, y;
      if (u < cap / 2) { const t = u / rc; x = cx + a - rc + Math.cos(t) * rc; y = cy + Math.sin(t) * rc; }
      else if ((u -= cap / 2) < straight) { const f = u / Math.max(1e-6, straight); x = cx + a - rc - f * straight; y = cy + rc + bulge * Math.sin(Math.PI * f); }
      else if ((u -= straight) < cap) { const t = Math.PI / 2 + u / rc; x = cx - a + rc + Math.cos(t) * rc; y = cy + Math.sin(t) * rc; }
      else if ((u -= cap) < straight) { const f = u / Math.max(1e-6, straight); x = cx - a + rc + f * straight; y = cy - rc - bulge * Math.sin(Math.PI * f); }
      else { u -= straight; const t = Math.PI * 1.5 + u / rc; x = cx + a - rc + Math.cos(t) * rc; y = cy + Math.sin(t) * rc; }
      xs[i] = x; ys[i] = y;
      if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    }
    const L = cum[D];
    let k = 0;
    for (let j = 0; j < n; j++) {
      const target = (j / n) * L;
      while (k < D && cum[k + 1] < target) k++;
      const f = (target - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]);
      BX[j] = xs[k] + (xs[k + 1] - xs[k]) * f;
      BY[j] = ys[k] + (ys[k + 1] - ys[k]) * f;
      BS[j] = j / n;
    }
    for (let j = 0; j < n; j++) {
      const j0 = (j + n - 1) % n, j1 = (j + 1) % n;
      const tx = BX[j1] - BX[j0], ty = BY[j1] - BY[j0], l = Math.hypot(tx, ty) || 1;
      BNX[j] = ty / l; BNY[j] = -tx / l;          // outward for this winding
      // a hand-drawn shape is never quite symmetric
      BX[j] += BNX[j] * jit[j] * jitter * (a + b);
      BY[j] += BNY[j] * jit[j] * jitter * (a + b);
    }
  }

  // nearest control point on the upper edge to a local x (px inside the bubble box)
  function sAtX(x, top = true) {
    let best = 0, bd = 1e9;
    for (let j = 0; j < n; j++) {
      if (top ? BY[j] > cy : BY[j] < cy) continue;
      const d = Math.abs(BX[j] - (x + pad));
      if (d < bd) { bd = d; best = j; }
    }
    return BS[best];
  }

  function poke(s, amp = 3, spread = 0.07, freq = 15, life = 4) {
    pokes.push({ s, amp, spread, freq, life, t0: performance.now() / 1000 });
    if (pokes.length > 10) pokes.shift();
  }

  function frame(t) {
    // control points pushed along their normals
    const kAge = t - kickT;
    const kick = kAge < 2.5 ? kickAmp * Math.exp(-kAge * 3.2) * Math.sin(kAge * 13) : 0;
    for (let j = 0; j < n; j++) {
      let d = wob * (1.1 * Math.sin(t * 0.9 + ph[j]) + 0.6 * Math.sin(t * 1.7 + 2.1 * ph[j])) * wj[j];
      d += inflate * 2.6 + kick * (0.6 + 0.4 * Math.sin(ph[j]));
      for (let q = 0; q < pokes.length; q++) {
        const P = pokes[q], age = t - P.t0;
        if (age < 0) continue;
        let ds = Math.abs(BS[j] - P.s); ds = Math.min(ds, 1 - ds);
        d += P.amp * Math.exp(-((ds / P.spread) ** 2)) * Math.exp(-age * P.life) * Math.cos(age * P.freq);
      }
      CX[j] = BX[j] + BNX[j] * d;
      CY[j] = BY[j] + BNY[j] * d;
    }
    for (let q = pokes.length - 1; q >= 0; q--) if (t - pokes[q].t0 > 3) pokes.splice(q, 1);
    // closed Catmull-Rom
    let m = 0;
    for (let j = 0; j < n; j++) {
      const i0 = (j + n - 1) % n, i2 = (j + 1) % n, i3 = (j + 2) % n;
      const x0 = CX[i0], x1 = CX[j], x2 = CX[i2], x3 = CX[i3], y0 = CY[i0], y1 = CY[j], y2 = CY[i2], y3 = CY[i3];
      for (let k = 0; k < sub; k++) {
        const u = k / sub, u2 = u * u, u3 = u2 * u;
        PX[m] = 0.5 * (2 * x1 + (-x0 + x2) * u + (2 * x0 - 5 * x1 + 4 * x2 - x3) * u2 + (-x0 + 3 * x1 - 3 * x2 + x3) * u3);
        PY[m] = 0.5 * (2 * y1 + (-y0 + y2) * u + (2 * y0 - 5 * y1 + 4 * y2 - y3) * u2 + (-y0 + 3 * y1 - 3 * y2 + y3) * u3);
        m++;
      }
    }
    const extra = inflate * 0.9;
    for (let i = 0; i < M; i++) {
      const i0 = (i + M - 1) % M, i1 = (i + 1) % M;
      const tx = PX[i1] - PX[i0], ty = PY[i1] - PY[i0], l = Math.hypot(tx, ty) || 1;
      NX[i] = ty / l; NY[i] = -tx / l;
      const g = smooth((NY[i] + 1) / 2);                       // 0 at the top, 1 at the bottom
      const sm = i / M;
      WD[i] = Math.max(0.8, rimTop + (rimBot - rimTop) * Math.pow(g, 1.6) + extra + bw * (Math.sin(sm * TAU * 3 + 0.7) * 0.65 + Math.sin(sm * TAU * 7 + 2.1) * 0.35));
    }
    let out = "", inn = "";
    for (let i = 0; i < M; i++) {
      const h = WD[i] * 0.5;
      out += (i ? "L" : "M") + r1(PX[i] + NX[i] * h) + " " + r1(PY[i] + NY[i] * h);
      inn += (i ? "L" : "M") + r1(PX[i] - NX[i] * h) + " " + r1(PY[i] - NY[i] * h);
    }
    rimEl.setAttribute("d", out + "Z" + inn + "Z");
    if (glassEl) glassEl.setAttribute("d", inn + "Z");
    if (glintEl) {
      // the long glint follows the inner wall round the upper-left shoulder and on along the top;
      // a short second one sits low on the right, the way light sits in a bubble
      glintRun(glintEl, -2.72, -1.35, Math.PI * 0.4 * Math.min(a, b) + glintLen * 2 * a, 1);
      if (glint2El) glintRun(glint2El, 0.32, 1.2, Math.min(a, b) * 0.62, 0.55);
    }
  }

  function glintRun(node, a0, a1, maxRun, wk) {
    let start = -1;
    for (let i = 0; i < M; i++) {
      const ang = Math.atan2(NY[i], NX[i]);
      if (ang > a0 && ang < a1) { const pv = (i + M - 1) % M, pa = Math.atan2(NY[pv], NX[pv]); if (!(pa > a0 && pa < a1)) { start = i; break; } }
    }
    let g = 0, run = 0;
    if (start >= 0) {
      for (let k = 0; k < M; k++) {
        const i = (start + k) % M, ang = Math.atan2(NY[i], NX[i]);
        if (!(ang > a0 && ang < a1) || run > maxRun) break;
        const off = WD[i] + Math.min(9, b * 0.2);
        GL[2 * g] = PX[i] - NX[i] * off; GL[2 * g + 1] = PY[i] - NY[i] * off;
        if (g) run += Math.hypot(GL[2 * g] - GL[2 * g - 2], GL[2 * g + 1] - GL[2 * g - 1]);
        g++;
      }
    }
    if (g > 3) {
      const gw = Math.max(1.6, Math.min(4.2, b * 0.09)) * wk;
      for (let i = 0; i < g; i++) GW[i] = 0.5 + gw * Math.sin(Math.PI * (i / (g - 1))) ** 0.8;
      node.setAttribute("d", ribbon(GL, g, GW));
    } else node.setAttribute("d", "");
  }

  return {
    resize, poke, sAtX, frame,
    get size() { return { W, H, pad }; },
    focus(on) { inflateTo = on ? 1 : 0; },
    kick(amp = 6) { kickAmp = amp; kickT = performance.now() / 1000; },
    step(t, dt) {
      // springy inflate (jelly overshoot when it fills)
      const k = 120, c = 14;
      inflateV += (k * (inflateTo - inflate) - c * inflateV) * dt;
      inflate += inflateV * dt;
      frame(t);
    },
    get busy() { return pokes.length > 0 || Math.abs(inflateV) > 0.01 || performance.now() / 1000 - kickT < 2.5; },
  };
}
