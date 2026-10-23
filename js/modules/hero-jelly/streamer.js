// One tentacle = one live hook. A verlet chain pinned to the hem, drawn as a tapered ink ribbon.
// Units are bell units (the jelly.json space); the jelly scales the whole world group to the screen.
import { clamp, smoothstep, easeOutCubic, hash01, catmull, ribbon, arcLen, slice } from "./util.js";

export const GROW = 1.9;   // s, a new tentacle unfurls from the hem
export const DIE = 2.9;    // s, a dropped tentacle curls up, sinks and fades
const SUB = 6;             // spline points per chain segment

const BUF = new Float32Array(1024), TB = new Float32Array(512), HB = new Float32Array(512);

export class Streamer {
  constructor(hook, { nodes = 14, length = 520, w0 = 24, w1 = 6, grown = true, x = 0, y = 140 } = {}) {
    this.id = hook.id;
    this.hook = hook;
    const h = hash01(hook.id), h2 = hash01(hook.id + "~");
    this.n = nodes;
    this.L = length * (0.8 + 0.34 * h);
    this.seg = this.L / (nodes - 1);
    this.w0 = w0 * (0.9 + 0.22 * h2);
    this.w1 = w1 * (0.85 + 0.3 * h);
    this.seed = h * 40;
    this.phase = h2 * Math.PI * 2;
    this.omega = 1.25 + 0.55 * h;
    this.curlDir = h2 > 0.5 ? 1 : -1;
    const n = nodes;
    this.x = new Float32Array(n); this.y = new Float32Array(n);
    this.px = new Float32Array(n); this.py = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const yy = y + i * this.seg * (grown ? 1 : 0.02);
      const xx = x + (grown ? Math.sin(i * 0.7 + this.phase) * 6 * (i / n) : 0);
      this.x[i] = this.px[i] = xx; this.y[i] = this.py[i] = yy;
    }
    this.grow = grown ? 1 : 0;
    this.age = grown ? 99 : 0;
    this.attached = true;
    this.deadT = 0;
    this.alpha = 1;
    this.gone = false;
    this.ax = x;            // current anchor x on the hem (bell space), eased toward axTo
    this.axTo = x;
    this.hl = 0; this.hlTo = 0;           // cream highlight (hover / highlight())
    this.wet = grown ? 0 : 1;             // a new tentacle is drawn in wet cream that dries
    this.pulses = [];                     // cream pulses running root -> tip when the hook fires
    this.curl = grown ? 0 : 2.7;
    const M = (n - 1) * SUB + 1;
    this.c = new Float32Array(M * 2);
    this.cum = new Float32Array(M);
    this.hw = new Float32Array(M);
    this.m = 0;
    this.el = null; this.core = null;
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    this.deadT = 0;
    this.hlTo = 0;
  }

  pulse(t) { if (this.pulses.length < 3) this.pulses.push(t); }

  // half width (bell units) at normalised arc position t
  halfW(t) {
    const base = this.w0 + (this.w1 - this.w0) * Math.pow(t, 0.78);
    const g = this.attached ? 0.42 + 0.58 * easeOutCubic(this.grow) : 1;
    return 0.5 * base * g * (1 + 0.1 * Math.sin(t * 13 + this.seed) + 0.05 * Math.sin(t * 31 + this.seed * 2));
  }

  step(dt, t, env) {
    const { x, y, px, py, n } = this;
    this.age += dt;
    if (this.grow < 1) this.grow = clamp(this.age / GROW);
    const g = easeOutCubic(this.grow);
    if (this.attached) {
      this.curl = 2.7 * Math.pow(1 - g, 1.5);
      if (this.wet > 0 && this.grow >= 1) this.wet = Math.max(0, this.wet - dt / 2.6);
    } else {
      this.deadT += dt;
      this.curl = Math.min(1.5, this.curl + dt * 0.75);
      this.alpha = 1 - smoothstep(this.deadT / DIE);
      if (this.deadT > DIE) this.gone = true;
    }
    this.hl += (this.hlTo - this.hl) * (1 - Math.exp(-dt / (this.hlTo > this.hl ? 0.16 : 0.28)));
    const segLen = this.seg * (0.04 + 0.96 * g);
    const drag = Math.pow(env.drag, dt * 60), dt2 = dt * dt;
    const s0 = this.attached ? 1 : 0;
    if (this.attached) { x[0] = px[0] = env.rx; y[0] = py[0] = env.ry; }
    const wig = this.age < GROW + 0.9 ? 1 - smoothstep(this.age / (GROW + 0.9)) : 0;
    const wave = env.wave * (this.attached ? 1 : 0.4);
    for (let i = s0; i < n; i++) {
      const f = i / (n - 1);
      const vx = (x[i] - px[i]) * drag, vy = (y[i] - py[i]) * drag;
      px[i] = x[i]; py[i] = y[i];
      let fx = wave * Math.sin(t * this.omega - i * 0.8 + this.phase) * (0.3 + 0.7 * f) + env.flow(x[i], y[i], t) * (0.35 + f);
      const fy = this.attached ? env.gravity : env.gravity * 0.8 + 260;
      if (wig > 0) fx += Math.sin(t * 10.5 + i * 0.95) * 1500 * wig * f;
      x[i] += vx + fx * dt2;
      y[i] += vy + fy * dt2;
    }
    // shape memory: each node is drawn softly toward a slow S-curve that travels down from the root,
    // like the hand-drawn streamers. Physics (lag, current, the pointer) plays on top of it.
    if (this.attached && env.shape > 0) {
      const dX = env.dx, dY = env.dy, kk = env.shape * 0.045 * (0.3 + 0.7 * easeOutCubic(this.grow));
      for (let i = 2; i < n; i++) {
        const f = i / (n - 1), along = i * segLen;
        const lat = (4 + 30 * f) * Math.sin(i * 0.72 - t * this.omega * 0.85 + this.phase) * env.sway;
        const tx = x[0] + dX * along - dY * lat, ty = y[0] + dY * along + dX * lat;
        x[i] += (tx - x[i]) * kk * (0.5 + f); y[i] += (ty - y[i]) * kk * (0.5 + f);
      }
    }
    // mild bending stiffness so no joint ever kinks
    for (let i = s0 + 1; i < n - 1; i++) {
      x[i] += ((x[i - 1] + x[i + 1]) * 0.5 - x[i]) * 0.04;
      y[i] += ((y[i - 1] + y[i + 1]) * 0.5 - y[i]) * 0.04;
    }
    // the pointer moves the water: nodes near it are carried along and nudged aside
    const P = env.pointer;
    if (P && P.on) {
      for (let i = s0 + 1; i < n; i++) {
        const dx = x[i] - P.x, dy = y[i] - P.y, d2 = dx * dx + dy * dy;
        if (d2 < P.r2) {
          const d = Math.sqrt(d2) || 1, fall = 1 - d / P.r, ff = fall * fall * (i / n);
          x[i] += (P.vx * 0.5 + (dx / d) * P.push) * ff * dt;
          y[i] += (P.vy * 0.5 + (dy / d) * P.push) * ff * dt;
        }
      }
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < n; i++) {
        const dx = x[i] - x[i - 1], dy = y[i] - y[i - 1], d = Math.hypot(dx, dy) || 1e-6, k = (d - segLen) / d;
        if (i === 1 && this.attached) { x[i] -= dx * k; y[i] -= dy * k; }
        else { const hx = dx * k * 0.5, hy = dy * k * 0.5; x[i - 1] += hx; y[i - 1] += hy; x[i] -= hx; y[i] -= hy; }
      }
      if (this.attached) {
        // stiff root: the first segments leave the hem along the bell's own "down", splayed a little
        let tx = x[0] + env.dx * segLen, ty = y[0] + env.dy * segLen;
        x[1] += (tx - x[1]) * 0.6; y[1] += (ty - y[1]) * 0.6;
        tx = x[1] + env.dx * segLen; ty = y[1] + env.dy * segLen;
        x[2] += (tx - x[2]) * 0.2; y[2] += (ty - y[2]) * 0.2;
      }
      if (this.curl > 0.02) {
        for (let i = 2; i < n; i++) {
          const ax = x[i - 1] - x[i - 2], ay = y[i - 1] - y[i - 2], l = Math.hypot(ax, ay) || 1;
          const ang = this.curl * this.curlDir * Math.pow(i / (n - 1), 1.3) * 0.9;
          const co = Math.cos(ang), si = Math.sin(ang);
          const tx = x[i - 1] + ((ax * co - ay * si) / l) * segLen, ty = y[i - 1] + ((ax * si + ay * co) / l) * segLen;
          x[i] += (tx - x[i]) * 0.35; y[i] += (ty - y[i]) * 0.35;
        }
      }
    }
  }

  // builds the ink outline (this.d) and the cream core (this.coreD)
  render(t) {
    const m = (this.m = catmull(this.x, this.y, this.n, SUB, this.c));
    arcLen(this.c, m, this.cum);
    for (let i = 0; i < m; i++) this.hw[i] = this.halfW(this.cum[i]);
    this.d = ribbon(this.c, m, this.hw, !this.attached);
    let core = "";
    // light flows down from the bell: highlight on hover, or the wet cream of a fresh tentacle
    const lit = Math.max(this.hl, this.wet * 0.9);
    if (lit > 0.01) core += this.part(0, Math.min(1, lit * 1.08), 0.52, true);
    // a hook firing: a short cream pulse travels root -> tip
    for (let k = this.pulses.length - 1; k >= 0; k--) {
      const p = (t - this.pulses[k]) / 1.15;
      if (p > 1.2) { this.pulses.splice(k, 1); continue; }
      if (p > 0) core += this.part(Math.max(0.07, p - 0.14), p, 0.42, false);
    }
    this.coreD = core;
  }

  // a cream ribbon inside the ink one, between t0 and t1; width tapers at the leading edge
  part(t0, t1, k, fromRoot) {
    const cnt = slice(this.c, this.m, this.cum, t0, t1, BUF, TB);
    if (cnt < 2) return "";
    const span = Math.max(1e-3, t1 - Math.max(0, t0));
    for (let i = 0; i < cnt; i++) {
      const u = (TB[i] - Math.max(0, t0)) / span;   // 0 at the start of the part, 1 at the front
      const shape = fromRoot ? 1 - smoothstep((u - 0.8) / 0.2) * 0.75 : Math.sin(Math.PI * clamp(u * 0.92 + 0.04));
      HB[i] = Math.max(0.35, this.halfW(TB[i]) * k * shape);
    }
    return ribbon(BUF, cnt, HB, true);
  }

  // distance from a point (bell units) to the tentacle's skin, using the chain nodes
  dist(qx, qy) {
    let best = 1e9, bi = 0;
    const { x, y, n } = this;
    for (let i = 1; i < n; i++) {
      const ax = x[i - 1], ay = y[i - 1], bx = x[i] - ax, by = y[i] - ay;
      const l2 = bx * bx + by * by || 1;
      const u = clamp(((qx - ax) * bx + (qy - ay) * by) / l2);
      const d = Math.hypot(qx - (ax + bx * u), qy - (ay + by * u)) - this.halfW((i - 1 + u) / (n - 1));
      if (d < best) { best = d; bi = i - 1 + u; }
    }
    this.hitAt = bi;
    return best;
  }

  // a point on the chain at fractional node index fi
  pointAt(fi) {
    const i = Math.min(this.n - 2, Math.floor(fi)), f = fi - i;
    return { x: this.x[i] + (this.x[i + 1] - this.x[i]) * f, y: this.y[i] + (this.y[i + 1] - this.y[i]) * f };
  }
}
