// crowd-play (brief 14 + attention threads): Turri's aquarium of everyone else.
// - A hand-inked glass tank of brainless jellies (flat crowd violet, Turri's own bell outline), each dragging a lazy
//   label on a leader line. A small Turri swims among them on purpose, one streamer per live hook.
// - An x-ray lens (an ink ensō loupe, slightly magnifying) follows the cursor, or wanders on its own: inside it every
//   bell turns to glass and shows what is in there (nothing), while Turri's brain lights up with firing neurons.
//   The rim reads how many brains are in view.
// - A `look` thought shoots an ink thread from Turri's brain to one jelly, which flashes cream. Turri remembers
//   the thought: click that jelly and it says something dumb, then Turri answers with "what I thought about you".
// - Clicking Turri gets a sharp line. Tapping the water is tapping the glass, which Turri has opinions about.
// - Brain swaps play in the tank too: the crowd turns to watch, the old brain floats out and the old body joins
//   the crowd as "v7, retired".

import { LABELS, INSIDE, DUMB, HUSK, SHARP, UNSEEN, GLASS } from "./crowd-play/words.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = (t) => { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOutBack = (t) => { t = clamp(t, 0, 1); const c = 1.9, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; } return a; };

// Bell beat: a fast muscular squeeze, then a slow elastic recoil with a small overshoot
const SQ = 0.3;
function squeeze(p) {
  if (p < SQ) { const t = Math.pow(p / SQ, 1.25); return 1 - (1 - t) * (1 - t) * (1 - t); }
  const t = (p - SQ) / (1 - SQ);
  return Math.exp(-5 * t) * Math.cos(t * Math.PI * 1.2);
}
// Eyelid: close 92 ms (smoothstep), hold 26 ms, open 185 ms (ease-out cubic)
function lidAt(e) {
  if (e < 0) return 1;
  if (e < 0.092) return 1 - sstep(e / 0.092);
  if (e < 0.118) return 0;
  if (e < 0.303) return 1 - Math.pow(1 - (e - 0.118) / 0.185, 3);
  return 1;
}

// ---------- geometry from assets/jelly.json (bell units: bell width = 1) ----------
function parsePts(d) {
  const n = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) || []).map(Number);
  const out = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] });
  return out;
}
function resampleClosed(pts, N) {
  const P = pts.concat([pts[0]]);
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
  const L = cum[cum.length - 1] || 1;
  const out = [];
  let j = 1;
  for (let k = 0; k < N; k++) {
    const s = (k / N) * L;
    while (j < cum.length - 1 && cum[j] < s) j++;
    const t = (s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    out.push({ x: lerp(P[j - 1].x, P[j].x, t), y: lerp(P[j - 1].y, P[j].y, t) });
  }
  return out;
}
function thin(pts, max) {
  const step = Math.max(1, Math.round(pts.length / max));
  const out = pts.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}
function buildGeo(J) {
  const raw = parsePts(J.bell.d);
  let x0 = Infinity, x1 = -Infinity;
  for (const p of raw) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); }
  const W0 = x1 - x0, CX = (x0 + x1) / 2;
  const unit = (p) => ({ x: (p.x - CX) / W0, y: p.y / W0 });
  const outer = resampleClosed(raw.map(unit), 60);
  const inner = resampleClosed(parsePts(J.bell.inner).map(unit), 52);
  const glint = resampleClosed(parsePts(J.bell.glint).map(unit), 24);
  let y0 = Infinity, y1 = -Infinity;
  for (const p of outer) { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const bib = J.brainInBell || { tx: 0, ty: 0, s: 0.56, rot: 0 };
  const cr = Math.cos((bib.rot * Math.PI) / 180), sr = Math.sin((bib.rot * Math.PI) / 180);
  const inBell = (p) => { const x = p.x * bib.s, y = p.y * bib.s; return unit({ x: x * cr - y * sr + bib.tx + CX, y: x * sr + y * cr + bib.ty }); };
  const brain = resampleClosed(parsePts(J.brain.d).map(inBell), 44);
  let bx = 0, by = 0;
  for (const p of brain) { bx += p.x; by += p.y; }
  const grooves = (J.brain.grooves || []).map((v) => v.map((gr) => ({ w: (gr.w * bib.s) / W0, pts: thin(gr.pts.map(([x, y]) => inBell({ x, y })), 12) })));
  const eyes = (J.brain.eyes || []).map((e) => {
    const c = inBell(e);
    return { x: c.x, y: c.y, rx: (e.rx * bib.s) / W0, ry: (e.ry * bib.s) / W0, rot: ((e.rot + bib.rot) * Math.PI) / 180 };
  });
  return { outer, inner, glint, y0, y1, brain, bc: { x: bx / brain.length, y: by / brain.length }, grooves, eyes, pupil: J.brain.pupil || 0.47 };
}

// far, mid, near: bell width range (px, desktop), how far the colour goes from the water toward --deep, share of the crowd
const LAY = [
  { size: [34, 50], mix: 0.42, share: 0.34, st: 3, nodes: 7, thrust: 0.8 },
  { size: [58, 84], mix: 0.74, share: 0.42, st: 4, nodes: 9, thrust: 1 },
  { size: [104, 138], mix: 1, share: 0.24, st: 5, nodes: 10, thrust: 1.1 },
];

export function init(ctx) {
  const mount = document.getElementById("crowd-play");
  const J = ctx.assets && ctx.assets.jelly;
  if (!mount || !J) return;
  const { bus, pointer, state, config } = ctx;
  const reduced = !!ctx.reduced;
  const mobile = !!ctx.mobile;
  const G = buildGeo(J);
  const nowS = () => performance.now() / 1000;

  // ---------- DOM ----------
  mount.innerHTML = `
    <div class="cp-tank">
      <canvas class="cp-canvas" data-cursor="ink" role="img" aria-label="An aquarium of brainless jellyfish with lazy name tags. A small black jellyfish with a brain swims among them. An x-ray lens shows their bells are empty."></canvas>
      <div class="cp-says" aria-live="polite"></div>
    </div>
    <div class="cp-foot">
      <p class="cp-foot__note">My aquarium. Tap one and it talks. Tap me and I answer. ${pointer.touch ? "The lens wanders on its own." : "The lens shows what's inside."}</p>
      <p class="cp-foot__count" aria-live="off"><span class="cp-n">0</span> jellies, <span class="cp-b">1</span> brain</p>
    </div>`;
  const tank = mount.querySelector(".cp-tank");
  const canvas = mount.querySelector(".cp-canvas");
  const says = mount.querySelector(".cp-says");
  const countN = mount.querySelector(".cp-n"), countB = mount.querySelector(".cp-b");
  const countWord = countB.nextSibling;
  const g = canvas.getContext("2d");
  if (!g) return;

  // ---------- colour ----------
  const root = getComputedStyle(document.documentElement);
  const hex = (name, fb) => {
    const s = root.getPropertyValue(name).trim();
    const m = /^#?([0-9a-f]{6})$/i.exec(s);
    if (!m) return fb;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const PAL = {
    field: hex("--field", [139, 99, 245]), deep: hex("--deep", [93, 63, 201]), abyss: hex("--abyss", [29, 17, 70]),
    ink: hex("--ink", [11, 11, 11]), cream: hex("--cream", [253, 241, 216]),
  };
  const WATER = PAL.field;
  const TINT = mix(PAL.field, PAL.cream, 0.14); // the lens: the same water, backlit
  const LAYC = LAY.map((L) => mix(PAL.field, PAL.deep, L.mix));
  const INK = css(PAL.ink), CREAM = css(PAL.cream), WATERC = css(WATER), TINTC = css(TINT);
  const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace';

  // ---------- size and the tank ----------
  let W = 1, H = 1, dpr = 1;
  let X0 = 0, X1 = 1, Y0 = 0, Y1 = 1, WY = 0; // interior left/right, rim top, floor, waterline
  let frameP = null, glintP = null, pebInk = null, pebDeep = null;
  let R = 110, M = 1.3;
  const K = mobile ? 0.72 : 1; // everything is a size smaller on phones

  function brushPath(pts, wfn) { // ink.js brush outline, as a canvas path
    return new Path2D(ctx.ink.brush(ctx.ink.spline(pts, false, 18), wfn));
  }
  function buildTank() {
    const m = mobile ? 7 : 10;
    X0 = m + 3; X1 = W - m - 3; Y0 = m + 4; Y1 = H - m - 6;
    WY = Y0 + (mobile ? 20 : 26);
    const P = ctx.ink.P;
    const wob = (a, b, k) => [a, P(lerp(a.x, b.x, 0.5) + rand(-k, k), lerp(a.y, b.y, 0.5) + rand(-k, k)), b];
    const sw = (w, e) => (t) => e + (w - e) * Math.pow(Math.sin(Math.PI * t), 0.55);
    const f = new Path2D();
    f.addPath(brushPath(wob(P(X0 - 1, Y0 - 9), P(X0 + 1.5, Y1 + 8), 2.5), sw(mobile ? 4.4 : 5.2, 1.6)));
    f.addPath(brushPath(wob(P(X1 + 1, Y0 - 7), P(X1 - 0.5, Y1 + 9), 2.5), sw(mobile ? 4 : 4.8, 1.4)));
    f.addPath(brushPath(wob(P(X0 - 11, Y1 + 1), P(X1 + 12, Y1 - 1.5), 2), sw(mobile ? 6 : 7.5, 2)));
    f.addPath(brushPath(wob(P(X0 - 8, Y0 + 0.5), P(X1 + 9, Y0 - 1), 1.5), sw(mobile ? 3 : 3.4, 1)));
    frameP = f;
    // glints on the glass, like the bell's
    const gl = new Path2D();
    const gh = Y1 - WY;
    gl.addPath(brushPath([P(X0 + 15, WY + 26), P(X0 + 12, WY + gh * 0.2), P(X0 + 11.5, WY + gh * 0.44)], (t) => 1.2 + 4 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.7)));
    gl.addPath(brushPath([P(X0 + 25, WY + 34), P(X0 + 23, WY + gh * 0.13)], (t) => 0.8 + 2 * Math.sin(Math.PI * t)));
    gl.addPath(brushPath([P(X1 - 16, Y1 - gh * 0.3), P(X1 - 13, Y1 - 22)], (t) => 0.8 + 2.6 * Math.sin(Math.PI * t)));
    glintP = gl;
    // gravel: ink pebbles and a few in crowd violet
    pebInk = new Path2D(); pebDeep = new Path2D();
    let x = X0 + 4;
    while (x < X1 - 4) {
      const r = rand(3, 10) * (mobile ? 0.8 : 1);
      const cx = x + r, cy = Y1 - r * rand(0.35, 0.6);
      const pts = [];
      const k = 7, ph = rand(0, TAU);
      for (let i = 0; i < k; i++) {
        const a = (i / k) * TAU + ph;
        const rr = r * rand(0.78, 1.12);
        pts.push(P(cx + Math.cos(a) * rr * 1.25, Math.min(Y1 + 2, cy + Math.sin(a) * rr * 0.8)));
      }
      const sp = ctx.ink.spline(pts, true, 6);
      const p = Math.random() < 0.72 ? pebInk : pebDeep;
      p.moveTo(sp[0].x, sp[0].y);
      for (let i = 1; i < sp.length; i++) p.lineTo(sp[i].x, sp[i].y);
      p.closePath();
      x += r * rand(1.4, 2.9);
    }
    R = clamp(Math.min(W, H) * 0.2, mobile ? 70 : 90, mobile ? 92 : 128);
  }

  function resize() {
    const r = tank.getBoundingClientRect();
    const w = Math.max(200, Math.round(r.width)), h = Math.max(200, Math.round(r.height));
    const nd = Math.min(devicePixelRatio || 1, 2);
    if (w === W && h === H && nd === dpr) return;
    const first = W === 1;
    W = w; H = h; dpr = nd;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    buildTank();
    if (first) populate();
    else for (const j of all()) keepIn(j, true);
    if (reduced) requestDraw();
  }

  // ---------- the jellies ----------
  const crowd = [];
  let turri = null;
  let labelPool = shuffle(LABELS);
  const nextLabel = () => { if (!labelPool.length) labelPool = shuffle(LABELS); return labelPool.pop(); };
  const all = () => (turri ? crowd.concat([turri]) : crowd);

  function makeStreamers(j, n, nodes) {
    j.st = [];
    for (let k = 0; k < n; k++) {
      const f = n === 1 ? 0.5 : k / (n - 1);
      const ax = (f * 2 - 1) * 0.31 + rand(-0.02, 0.02);
      j.st.push({ ax, n: nodes, len: rand(1.05, 1.5) * (1 - Math.abs(ax) * 0.5), w: rand(0.85, 1.15), k: rand(1.6, 2.4), amp: rand(0.12, 0.2), ph: rand(0, TAU), bend: ax * 0.25 + rand(-0.05, 0.05), g: 1 });
    }
  }
  function makeJelly(li, size) {
    const L = LAY[li];
    const j = {
      kind: "crowd", li, size, x: 0, y: 0, vx: 0, vy: 0, svx: 0, svy: 0, a: rand(-0.25, 0.25), c: 1, sn: 0,
      T: rand(2.6, 3.7), ph: Math.random(), s: 0, sh: 0, seed: rand(0, 100), ws: rand(0.6, 1.4), boost: 0,
      homeY: 0, homeA: rand(0, TAU), thrust: L.thrust, grow: 1, alpha: 1, flash: 0, ink: 0, hold: 0, dying: 0,
      label: nextLabel(), inside: pick(INSIDE), thought: null, lx: 0, ly: 0, side: 1, sideS: 1, oy: 0, flipAt: -99, dim: 0, dimT: 0, lw: 0, husk: false,
      note: null, lookUntil: 0, brainUntil: 0, brainAt: 0, lastLook: -99, st: [],
    };
    makeStreamers(j, L.st + (Math.random() < 0.4 ? 1 : 0), L.nodes);
    return j;
  }
  function freeSpot(size, tries = 16) {
    let bx = (X0 + X1) / 2, by = (WY + Y1) / 2, bd = -1;
    for (let c = 0; c < tries; c++) {
      const x = rand(X0 + size * 0.6, X1 - size * 0.6);
      const y = rand(WY + size * 0.45, Math.max(WY + size * 0.5, Y1 - size * 1.35));
      let d = Infinity;
      for (const o of all()) d = Math.min(d, Math.hypot(x - o.x, y - o.y) - (o.size + size) * 0.35);
      if (d > bd) { bd = d; bx = x; by = y; }
    }
    return { x: bx, y: by };
  }
  function placeLabel(j) {
    j.side = j.sideS = j.x > (X0 + X1) / 2 ? -1 : 1;
    j.lx = j.x + j.side * j.size * 0.6; j.ly = j.y - j.size * 0.25;
  }
  function addCrowd(li, size, opts = {}) {
    const j = makeJelly(li, size);
    Object.assign(j, opts);
    if (opts.x == null) { const p = freeSpot(size); j.x = p.x; j.y = p.y; }
    j.homeY = j.y;
    placeLabel(j);
    crowd.push(j);
    return j;
  }
  function populate() {
    const n = clamp(Math.round((W * H) / (mobile ? 30000 : 56000)), 6, 13);
    const per = [Math.round(n * LAY[0].share), 0, Math.max(1, Math.round(n * LAY[2].share))];
    per[1] = Math.max(2, n - per[0] - per[2]);
    // Turri first so the crowd spaces itself around him
    turri = makeTurri();
    for (let li = 2; li >= 0; li--) for (let k = 0; k < per[li]; k++) addCrowd(li, rand(LAY[li].size[0], LAY[li].size[1]) * K);
    // one of them used to be me
    const v = (state && state.version) || 0;
    if (v > 1) {
      const h = crowd.find((j) => j.li === 1) || crowd[0];
      if (h) { h.husk = true; h.label = `v${v - 1}, retired`; h.inside = `v${v - 1} was here`; }
    }
    updateCount();
  }

  function makeTurri() {
    const size = (mobile ? 64 : 88);
    const j = {
      kind: "turri", li: 1, size, x: lerp(X0, X1, 0.38), y: lerp(WY, Y1, 0.42), vx: 0, vy: 0, svx: 0, svy: 0,
      a: 0, c: 1, sn: 0, T: 2.2, ph: 0.4, s: 0, sh: 0, seed: rand(0, 100), boost: 0, grow: 1, alpha: 1, flash: 0, ink: 0,
      hold: 0, wx: 0, wy: 0, wpAt: 0, groove: 0, ex: 0, ey: 0.25, eyeTx: 0, eyeTy: 0.25,
      blinkAt: 2, blinkT: -9, wide: 0, bOff: 0, bA: 1, closed: 0, swap: null, inLens: false, caughtAt: -9,
      label: "me", side: 1, sideS: 1, oy: 0, flipAt: -99, dim: 0, dimT: 0, lx: 0, ly: 0, lw: 0, st: [], fall: [], sparks: [],
    };
    j.wx = j.x; j.wy = j.y;
    placeLabel(j);
    syncHooks(j, (state && state.hooks) || [], false);
    for (let k = 0; k < 4; k++) j.sparks.push({ gi: 0, u: 0, sp: 1, wait: rand(0, 1.2) });
    return j;
  }
  function turriStreamer(id) {
    return { id, ax: 0, tax: 0, n: 12, len: rand(1.3, 1.65), w: rand(0.9, 1.1), k: rand(1.4, 2), amp: rand(0.14, 0.22), ph: rand(0, TAU), bend: rand(-0.06, 0.06), g: 1, grow: 1 };
  }
  function spreadStreamers(j) {
    const n = j.st.length;
    j.st.forEach((s, k) => { s.tax = n === 1 ? 0 : ((k / (n - 1)) * 2 - 1) * 0.3; });
  }
  function syncHooks(j, hooks, animate) {
    const ids = hooks.map((h) => h.id);
    j.st = j.st.filter((s) => ids.includes(s.id));
    for (const id of ids) if (!j.st.find((s) => s.id === id)) { const s = turriStreamer(id); s.g = animate ? 0 : 1; j.st.push(s); }
    spreadStreamers(j);
    for (const s of j.st) if (!animate) s.ax = s.tax;
  }

  // ---------- placing points of a jelly on screen ----------
  const BUF = new Float32Array(2 * 72);
  function place(j, ux, uy, T, out, k) {
    const v = clamp((uy - G.y0) / (G.y1 - G.y0), 0, 1);
    const s = j.s, sh = j.sh;
    const narrow = 1 - 0.15 * (s + (sh - s) * v) * (0.2 + 0.8 * v);
    const x = ux * narrow * j.size * j.grow;
    let y = uy * (1 + 0.07 * s) - 0.03 * s * (1 - v);
    if (v > 0.74) y += Math.sin(ux * 19 + T * 2.1 + j.seed) * 0.01 * ((v - 0.74) / 0.26);
    y *= j.size * j.grow;
    out[k] = j.x + x * j.c - y * j.sn;
    out[k + 1] = j.y + x * j.sn + y * j.c;
  }
  function closedSmooth(path, P, n) {
    path.moveTo((P[0] + P[2]) * 0.5, (P[1] + P[3]) * 0.5);
    for (let i = 1; i <= n; i++) {
      const k = (i % n) * 2, k2 = ((i + 1) % n) * 2;
      path.quadraticCurveTo(P[k], P[k + 1], (P[k] + P[k2]) * 0.5, (P[k + 1] + P[k2 + 1]) * 0.5);
    }
    path.closePath();
  }
  function shape(path, j, pts, T, tf) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (tf) { const q = tf(p.x, p.y); place(j, q.x, q.y, T, BUF, i * 2); } else place(j, p.x, p.y, T, BUF, i * 2);
    }
    closedSmooth(path, BUF, pts.length);
  }

  // a tapered filled ribbon through points; wfn(u) gives the full width along it
  const RL = new Float32Array(2 * 140), RR = new Float32Array(2 * 140);
  function ribbon(path, N, n, wfn) {
    for (let i = 0; i < n; i++) {
      const i0 = i > 0 ? i - 1 : 0, i1 = i < n - 1 ? i + 1 : n - 1;
      let tx = N[i1 * 2] - N[i0 * 2], ty = N[i1 * 2 + 1] - N[i0 * 2 + 1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const hw = 0.5 * wfn(i / (n - 1));
      const x = N[i * 2], y = N[i * 2 + 1];
      RL[i * 2] = x - ty * hw; RL[i * 2 + 1] = y + tx * hw;
      RR[i * 2] = x + ty * hw; RR[i * 2 + 1] = y - tx * hw;
    }
    path.moveTo(RL[0], RL[1]);
    for (let i = 1; i < n - 1; i++) path.quadraticCurveTo(RL[i * 2], RL[i * 2 + 1], (RL[i * 2] + RL[i * 2 + 2]) * 0.5, (RL[i * 2 + 1] + RL[i * 2 + 3]) * 0.5);
    const e = (n - 1) * 2;
    path.lineTo(RL[e], RL[e + 1]);
    path.lineTo(RR[e], RR[e + 1]);
    for (let i = n - 2; i > 0; i--) path.quadraticCurveTo(RR[i * 2], RR[i * 2 + 1], (RR[i * 2] + RR[i * 2 - 2]) * 0.5, (RR[i * 2 + 1] + RR[i * 2 - 1]) * 0.5);
    path.lineTo(RR[0], RR[1]);
    path.closePath();
  }

  // streamers: a travelling wave plus a lag that trails behind the swim
  const SB = new Float32Array(2 * 16);
  function streamer(j, st, T) {
    place(j, st.ax, 0.235, T, SB, 0);
    const rx = SB[0], ry = SB[1];
    const dx = -j.sn, dy = j.c, px = j.c, py = j.sn;
    const L = st.len * j.size * j.grow * st.g;
    const sp = Math.hypot(j.svx, j.svy), lim = sp > 140 ? 140 / sp : 1;
    for (let i = 1; i < st.n; i++) {
      const u = i / (st.n - 1);
      const lat = Math.sin(T * st.k - u * 3.4 + st.ph) * st.amp * j.size * Math.pow(u, 1.15) + (st.ax * 0.2 + st.bend) * j.size * u * u;
      const tr = Math.pow(u, 1.4) * 0.34 * lim;
      SB[i * 2] = rx + dx * L * u + px * lat - j.svx * tr;
      SB[i * 2 + 1] = ry + dy * L * u + py * lat - j.svy * tr;
    }
    return st.n;
  }
  let w0 = 1, w1 = 0.5;
  const taper = (u) => w1 + (w0 - w1) * Math.pow(1 - u, 0.8);

  // ---------- state for the show ----------
  const threads = [];
  const ripples = [];
  const snow = [];
  const talk = { bubbles: [], until: 0, j: null };
  let lens = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, mode: "auto", focus: null, focusAt: 0, movedAt: -99, brains: 0, pop: -9 };
  let started = false, firstLook = false, visible = false, T = nowS(), glassTaps = [];

  for (let i = 0; i < (mobile ? 22 : 40); i++) snow.push({ x: Math.random(), y: Math.random(), z: Math.random(), ph: rand(0, TAU) });

  // ---------- physics ----------
  function kick(j) { if (j.ph > 0.55) { j.ph = 0; } else j.boost = 1; }
  function keepIn(j, hard) {
    const mx = j.size * 0.5, top = WY + j.size * 0.36 + 4, bot = Y1 - j.size * 0.25 - 14;
    if (hard) { j.x = clamp(j.x, X0 + mx, X1 - mx); j.y = clamp(j.y, top, Math.max(top, bot)); return; }
    if (j.x < X0 + mx) { j.x = X0 + mx; j.vx = Math.abs(j.vx) * 0.3; }
    if (j.x > X1 - mx) { j.x = X1 - mx; j.vx = -Math.abs(j.vx) * 0.3; }
    if (j.y < top) { j.y = top; j.vy = Math.abs(j.vy) * 0.2; }
    if (j.y > bot) { j.y = bot; j.vy = -Math.abs(j.vy) * 0.2; }
  }
  function pulse(j, dt, tempo) {
    j.ph += (dt / j.T) * tempo * (1 + j.boost * 1.5);
    if (j.ph >= 1) { j.ph -= 1; j.boost = 0; }
    const prev = j.s;
    j.s = squeeze(j.ph);
    j.sh += (j.s - j.sh) * (1 - Math.exp(-dt * 7));
    return (j.s - prev) / Math.max(dt, 1e-3);
  }
  function stepCrowd(j, t, dt) {
    const ds = pulse(j, dt, 1);
    // wander the tilt, steer off the walls, or turn to watch Turri
    let want = Math.sin(t * 0.13 * j.ws + j.seed) * 0.3 + Math.sin(t * 0.071 + j.seed * 2) * 0.16;
    const m = j.size * 1.1;
    if (j.x < X0 + m) want += 0.55 * (1 - (j.x - X0) / m);
    if (j.x > X1 - m) want -= 0.55 * (1 - (X1 - j.x) / m);
    if (j.lookUntil > t && turri) want = clamp(Math.atan2(turri.x - j.x, -(turri.y - j.y)), -0.9, 0.9) * 0.8;
    j.a += (clamp(want, -0.6, 0.6) - j.a) * (1 - Math.exp(-dt * (j.lookUntil > t ? 2.4 : 0.8)));
    // home depth drifts; pulse harder below it, rest above it
    j.homeA += dt * 0.05 * j.ws;
    const home = clamp(j.homeY + Math.sin(j.homeA) * j.size * 0.8, WY + j.size * 0.5, Y1 - j.size * 1.3);
    const gain = clamp(0.75 + (j.y - home) / (j.size * 1.2), 0.1, 1.8) * j.thrust;
    if (ds > 0 && j.hold < t) { const k = gain * ds * dt * j.size * 0.62; j.vx += Math.sin(j.a) * k; j.vy -= Math.cos(j.a) * k; }
    j.vy += j.size * 0.11 * dt;
    // keep a little apart
    for (const o of all()) {
      if (o === j) continue;
      const dx = j.x - o.x, dy = j.y - o.y, d = Math.hypot(dx, dy) || 1;
      const min = (j.size + o.size) * 0.4 * (o.li === j.li ? 1 : 0.55);
      if (d < min) { const f = ((min - d) / min) * 60 * dt; j.vx += (dx / d) * f; j.vy += (dy / d) * f * 0.6; }
    }
    const drag = Math.exp(-dt * (j.hold > t ? 5 : 1.25));
    j.vx *= drag; j.vy *= drag;
    j.x += j.vx * dt; j.y += j.vy * dt;
    keepIn(j, false);
    const k = 1 - Math.exp(-dt * 3);
    j.svx += (j.vx - j.svx) * k; j.svy += (j.vy - j.svy) * k;
    j.flash *= Math.exp(-dt / 0.9);
    if (j.ink > 0) j.ink = Math.max(0, j.ink - dt / 1.6);
    if (j.grow < 1) j.grow = Math.min(1, j.grow + dt / 1.2);
    if (j.dying) { j.alpha -= dt / 1.8; j.vy += 6 * dt; }
  }

  function chooseWaypoint(t) {
    const j = turri;
    const others = crowd.filter((o) => !o.dying);
    if (others.length && Math.random() < 0.55) {
      const o = pick(others);
      const side = o.x > j.x ? -1 : 1;
      j.wx = o.x + side * (o.size * 0.5 + j.size * 0.7); j.wy = o.y + rand(-0.2, 0.3) * o.size;
    } else { j.wx = rand(X0 + j.size, X1 - j.size); j.wy = rand(WY + j.size * 0.8, Y1 - j.size * 1.6); }
    j.wx = clamp(j.wx, X0 + j.size * 0.7, X1 - j.size * 0.7);
    j.wy = clamp(j.wy, WY + j.size * 0.6, Y1 - j.size * 1.4);
    j.wpAt = t + rand(5, 9);
  }
  function stepTurri(t, dt) {
    const j = turri;
    if (t > j.wpAt || Math.hypot(j.wx - j.x, j.wy - j.y) < j.size * 0.35) chooseWaypoint(t);
    const dx = j.wx - j.x, dy = j.wy - j.y, d = Math.hypot(dx, dy) || 1;
    const busy = j.hold > t || (j.swap && j.swap.phase !== "done");
    let want = busy ? 0 : clamp(Math.atan2(dx, -dy), -0.55, 0.55) * clamp(d / (j.size * 1.5), 0, 1);
    if (dy > 0 && Math.abs(dx) < d * 0.6) want *= 0.35; // going down: drift down upright
    j.a += (want - j.a) * (1 - Math.exp(-dt * 1.3));
    const ds = pulse(j, dt, busy ? 0.7 : 1 + clamp(d / (j.size * 4), 0, 0.5));
    const gain = busy ? 0.25 : clamp(0.5 - dy / (j.size * 1.4), 0.15, 1.5);
    if (ds > 0) { const k = gain * ds * dt * j.size * 0.75; j.vx += Math.sin(j.a) * k; j.vy -= Math.cos(j.a) * k; }
    j.vx += clamp(dx / (j.size * 3), -1, 1) * j.size * 0.16 * dt * (busy ? 0 : 1);
    j.vy += j.size * 0.1 * dt;
    const drag = Math.exp(-dt * (j.hold > t ? 4 : 1.2));
    j.vx *= drag; j.vy *= drag;
    j.x += j.vx * dt; j.y += j.vy * dt;
    keepIn(j, false);
    const k = 1 - Math.exp(-dt * 3);
    j.svx += (j.vx - j.svx) * k; j.svy += (j.vy - j.svy) * k;
    // streamers spread and grow
    for (const s of j.st) { s.ax += (s.tax - s.ax) * (1 - Math.exp(-dt * 2)); if (s.g < 1) s.g = Math.min(1, s.g + dt / 1.3); }
    for (const f of j.fall) { f.vy += 26 * dt; f.y += f.vy * dt; f.x += Math.sin(t * 1.3 + f.ph) * 8 * dt; f.alpha -= dt / 2.6; }
    j.fall = j.fall.filter((f) => f.alpha > 0);
    // swap ceremony
    const sw = j.swap;
    if (sw) {
      if (sw.phase === "start") {
        const e = t - sw.t0;
        j.closed = sstep(e / 0.35);
        j.bOff = -0.5 * easeInOut(e / 1.8); j.bA = 1 - sstep((e - 1.0) / 0.8);
        if (e > 9) j.swap = null;
      } else if (sw.phase === "mid") {
        const e = t - sw.t1;
        j.closed = 1;
        j.bOff = -0.55 * (1 - easeOutBack(e / 1.2)); j.bA = sstep(e / 0.4);
        if (e > 6) j.swap = null;
      } else {
        const e = t - sw.t2;
        j.bOff = 0; j.bA = 1;
        j.closed = 1 - easeOutCubic(e / 0.32);
        if (e > 0.4) { j.swap = null; j.closed = 0; }
      }
    } else { j.closed = Math.max(0, j.closed - dt * 3); j.bOff *= Math.exp(-dt * 4); j.bA = Math.min(1, j.bA + dt * 2); }
    // eyes: what Turri looks at
    let tx = j.wx, ty = j.wy, toViewer = false;
    const thr = threads.find((h) => h.state !== "back");
    if (talk.j && talk.until > t) { tx = talk.j.x; ty = talk.j.y; }
    else if (thr) { tx = thr.j.x; ty = thr.j.y; }
    else if (lens.mode === "pointer" && t - lens.movedAt < 3) {
      if (Math.hypot(lens.x - j.x, lens.y - j.y) < R / M) toViewer = true; else { tx = lens.x; ty = lens.y; }
    } else if (j.inLens) toViewer = true;
    if (j.hold > t && !talk.j) toViewer = true;
    if (toViewer) { j.eyeTx = 0; j.eyeTy = 0.12; }
    else { const ex = tx - j.x, ey = ty - j.y, ed = Math.hypot(ex, ey) || 1, reach = Math.min(1, ed / (j.size * 1.2)); j.eyeTx = (ex / ed) * reach; j.eyeTy = (ey / ed) * reach * 0.9 + 0.1; }
    const ke = 1 - Math.exp(-dt / 0.055);
    j.ex += (j.eyeTx - j.ex) * ke; j.ey += (j.eyeTy - j.ey) * ke;
    if (t > j.blinkAt) { j.blinkT = t; j.blinkAt = t + rand(2.5, 4.2); if (Math.random() < 0.14) j.blinkAt = t + 0.24; }
    j.wide *= Math.exp(-dt * 2.2);
    // neurons
    const gv = G.grooves[j.groove % G.grooves.length] || [];
    for (const s of j.sparks) {
      if (s.wait > 0) { s.wait -= dt; if (s.wait <= 0) { s.gi = Math.floor(Math.random() * gv.length); s.u = 0; s.sp = rand(1.3, 2.6); } continue; }
      s.u += dt * s.sp;
      if (s.u >= 1) s.wait = rand(0.1, 0.9);
    }
  }

  // ---------- the lens ----------
  function lensRadius(a, t) {
    const sp = Math.hypot(lens.vx, lens.vy), st = clamp(sp / 2600, 0, 0.1), va = Math.atan2(lens.vy, lens.vx);
    return R * (1 + 0.022 * Math.sin(3 * a + t * 0.9) + 0.013 * Math.sin(5 * a - t * 1.4) + st * Math.cos(2 * (a - va)) - st * 0.4);
  }
  function lensPath(t) {
    const p = new Path2D();
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, r = lensRadius(a, t);
      BUF[i * 2] = lens.x + Math.cos(a) * r; BUF[i * 2 + 1] = lens.y + Math.sin(a) * r;
    }
    closedSmooth(p, BUF, n);
    return p;
  }
  const LB = new Float32Array(2 * 140);
  function lensRim(t) {
    // an ensō: one loaded brush stroke, heavy on one side, lifting off past where it started
    const p = new Path2D();
    const n = 112, a0 = -2.25 + Math.sin(t * 0.21) * 0.22, span = TAU * 1.085;
    const Rw = mobile ? 6.5 : 9;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), a = a0 + span * u;
      const lift = u > 0.9 ? (u - 0.9) * R * 0.32 : 0;
      const r = lensRadius(a, t) + Rw * 0.22 + lift;
      LB[i * 2] = lens.x + Math.cos(a) * r; LB[i * 2 + 1] = lens.y + Math.sin(a) * r;
    }
    w0 = Rw;
    ribbon(p, LB, n, (u) => {
      const ends = Math.pow(Math.sin(Math.PI * clamp(u * 1.015, 0, 1)), 0.55);
      const press = 0.5 + 0.5 * Math.sin(u * TAU + 2.4);
      return Rw * (0.1 + 0.9 * ends * (0.32 + 0.68 * press)) * (0.9 + 0.1 * Math.sin(u * 31 + t));
    });
    return p;
  }
  function lensGlint(t) {
    const p = new Path2D();
    const n = 14;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), a = -2.75 + u * 0.95, r = lensRadius(a, t) * 0.8;
      LB[i * 2] = lens.x + Math.cos(a) * r; LB[i * 2 + 1] = lens.y + Math.sin(a) * r;
    }
    ribbon(p, LB, n, (u) => 0.8 + (mobile ? 3 : 4) * Math.pow(Math.sin(Math.PI * u), 0.7));
    return p;
  }
  // the reading runs along the bottom of the glass, inside; its arc is kept clear of everything else
  const RIMW = mobile ? 6.5 : 9;
  const RIM_FS = mobile ? 9.5 : 10.5;
  const rimArc = { text: "", ws: [], total: 0, r: 0, a: Math.PI * 0.5 - 0.18, span: 0, inner: 0 };
  let lensOuter = 0; // where the rim's ink ends, this frame
  function measureRim(text) {
    const A = rimArc;
    A.r = R - (mobile ? 13 : 16);
    if (A.text !== text) {
      g.font = `500 ${RIM_FS}px ${MONO}`;
      A.ws = [...text].map((ch) => g.measureText(ch).width);
      A.total = A.ws.reduce((a, b) => a + b, 0) + A.ws.length * 0.6;
      A.text = text;
    }
    A.span = A.total / A.r;
    A.inner = A.r - RIM_FS * 0.6 - 5; // nothing in the lens may reach past this under the reading
  }
  function textOnRim(t, color) {
    const A = rimArc, r = A.r;
    g.save();
    g.font = `500 ${RIM_FS}px ${MONO}`;
    g.fillStyle = color;
    g.textAlign = "center"; g.textBaseline = "middle";
    let a = A.a + A.span / 2;
    for (let i = 0; i < A.ws.length; i++) {
      const w = A.ws[i] + 0.6;
      a -= w / (2 * r);
      const x = lens.x + Math.cos(a) * r, y = lens.y + Math.sin(a) * r;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.translate(x, y); g.rotate(a - Math.PI / 2);
      g.fillText(A.text[i], 0, 0);
      a -= w / (2 * r);
    }
    g.restore();
  }
  // a swipe of clear glass under the reading, so magnified ink never runs through the words
  function rimBand() {
    const A = rimArc, p = new Path2D(), n = 26, a0 = A.a - A.span / 2 - 0.1, a1 = A.a + A.span / 2 + 0.1;
    for (let i = 0; i < n; i++) {
      const a = lerp(a0, a1, i / (n - 1));
      LB[i * 2] = lens.x + Math.cos(a) * (A.r + 1); LB[i * 2 + 1] = lens.y + Math.sin(a) * (A.r + 1);
    }
    ribbon(p, LB, n, (u) => (RIM_FS + 9) * Math.pow(Math.sin(Math.PI * u), 0.3));
    return p;
  }
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  // 0 when a screen box comes within 8 px of the lens rim's ink, rising to 1 over the next 24 px
  function lensClear(x0, y0, x1, y1) {
    const dx = Math.max(x0 - lens.x, 0, lens.x - x1), dy = Math.max(y0 - lens.y, 0, lens.y - y1);
    const d = Math.hypot(dx, dy) - lensOuter - 8;
    return d <= 0 ? 0 : sstep(d / 24);
  }
  // how comfortably a box (scene coords, centre cx,cy, turned by a) shows inside the magnifier: 0 once any part of it
  // comes within 12 px of the glass's edge (or reaches the reading's arc), 1 when it has 8 px more room than that
  function lensFit(cx, cy, w, h, a, t) {
    const c = Math.cos(a), s = Math.sin(a);
    let worst = Infinity;
    for (let k = 0; k < 8; k++) {
      const ux = (k < 4 ? (k & 1 ? 0.5 : -0.5) : k < 6 ? 0 : k === 6 ? -0.5 : 0.5) * w;
      const uy = (k < 4 ? (k & 2 ? 0.5 : -0.5) : k === 4 ? -0.5 : k === 5 ? 0.5 : 0) * h;
      const dx = (cx + ux * c - uy * s - lens.x) * M, dy = (cy + ux * s + uy * c - lens.y) * M;
      const ang = Math.atan2(dy, dx);
      let lim = lensRadius(ang, t) - 12;
      if (angDiff(ang, rimArc.a) < rimArc.span / 2 + 0.16) lim = Math.min(lim, rimArc.inner);
      worst = Math.min(worst, lim - Math.hypot(dx, dy));
    }
    return worst <= 0 ? 0 : sstep(worst / 8);
  }
  function stepLens(t, dt) {
    const pin = lens.mode === "pointer" || (lens.mode === "touch" && t - lens.movedAt < 4.5);
    if (lens.mode === "touch" && !pin) lens.mode = "auto";
    if (!pin) {
      if (!lens.focus || t > lens.focusAt || lens.focus.dying) {
        const pool = crowd.filter((o) => !o.dying);
        lens.focus = (Math.random() < 0.42 || !pool.length) ? turri : pick(pool);
        lens.focusAt = t + rand(3.6, 6.2);
      }
      const f = lens.focus;
      lens.tx = f.x + Math.sin(t * 0.7) * f.size * 0.15; lens.ty = f.y + f.size * 0.15;
    }
    lens.tx = clamp(lens.tx, X0 + R + 20, X1 - R - 22);
    lens.ty = clamp(lens.ty, WY + R + 6, Y1 - R - (mobile ? 22 : 30));
    const w = pin ? 13 : 3.2, z = pin ? 0.58 : 0.9;
    const h = Math.min(dt, 1 / 30);
    lens.vx += (w * w * (lens.tx - lens.x) - 2 * z * w * lens.vx) * h;
    lens.vy += (w * w * (lens.ty - lens.y) - 2 * z * w * lens.vy) * h;
    lens.x += lens.vx * h; lens.y += lens.vy * h;
    countBrains(t);
  }
  // how many brains are in view (and whether Turri just got caught in the glass)
  function countBrains(t) {
    let n = 0;
    const seen = R / M;
    if (turri && Math.hypot(turri.x - lens.x, turri.y - lens.y) < seen + turri.size * 0.15) n++;
    for (const j of crowd) if (j.brainUntil > t && j.brainAt < t && Math.hypot(j.x - lens.x, j.y - lens.y) < seen) n++;
    if (n !== lens.brains) { lens.brains = n; lens.pop = reduced ? -9 : t; }
    const inL = turri && Math.hypot(turri.x - lens.x, turri.y - lens.y) < seen;
    if (inL && !turri.inLens && t - turri.caughtAt > 6 && !reduced) { turri.wide = 1; turri.caughtAt = t; }
    if (turri) turri.inLens = inL;
  }

  // ---------- attention threads ----------
  function brainPoint(j, T) {
    place(j, G.bc.x, G.bc.y + j.bOff, T, SB, 0);
    return { x: SB[0], y: SB[1] };
  }
  function startThread(j, kind, t) {
    for (const h of threads) if (h.state !== "back") { h.state = "back"; h.tb = t; }
    threads.push({ j, kind, t0: t, ta: t, tb: 0, state: reduced ? "hold" : "out", dur: kind === "look" ? 3.6 : 5.6, seed: rand(0, 10) });
    j.lastLook = t;
  }
  const TB = new Float32Array(2 * 64);
  // the thread's centre line into TB; r is how much of it is out (`whole` asks for where it is going)
  function threadPts(h, t, whole = false) {
    const S = brainPoint(turri, t), E = { x: h.j.x, y: h.j.y - h.j.size * 0.05 };
    let r;
    if (h.state === "out") r = whole ? 1 : easeOutCubic((t - h.t0) / 0.6);
    else if (h.state === "hold") r = 1;
    else r = 1 - easeInOut((t - h.tb) / 0.7);
    const dx = E.x - S.x, dy = E.y - S.y, L = Math.hypot(dx, dy) || 1;
    const nx = -dy / L, ny = dx / L;
    const n = 30;
    const up = ny < 0 ? 1 : -1; // bow away from gravity, like a cast line
    const bow = L * 0.2 * (0.75 + 0.25 * Math.sin(t * 1.1 + h.seed));
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * r;
      const wave = Math.sin(u * TAU * 1.6 - t * 6 + h.seed) * Math.sin(Math.PI * u) * Math.min(10, L * 0.03);
      const arc = Math.sin(Math.PI * u) * bow * up;
      TB[i * 2] = S.x + dx * u + nx * (wave + arc);
      TB[i * 2 + 1] = S.y + dy * u + ny * (wave + arc);
    }
    return { r, n };
  }
  function threadPath(h, t) {
    const { r, n } = threadPts(h, t);
    const p = new Path2D();
    const th = mobile ? 2.2 : 2.8;
    w0 = th;
    ribbon(p, TB, n, (u) => 0.6 + (th - 0.6) * Math.pow(1 - u, 0.9));
    return { p, r, n };
  }
  function stepThreads(t) {
    for (const h of threads) {
      if (h.state === "out" && t - h.t0 > 0.6) {
        h.state = "hold"; h.ta = t;
        if (h.kind === "look") { h.j.flash = 1; kick(h.j); }
      }
      if (h.state === "hold" && h.kind === "look") h.j.flash = Math.max(h.j.flash, 0.32);
      if (h.state === "hold" && t - h.ta > h.dur) { h.state = "back"; h.tb = t; }
    }
    for (let i = threads.length - 1; i >= 0; i--) {
      const h = threads[i];
      if ((h.state === "back" && t - h.tb > 0.7) || h.j.dying || !crowd.includes(h.j)) threads.splice(i, 1);
    }
  }

  // ---------- name tags ----------
  // A tag hangs beside its bell on a leader line. sideS swings from 1 (hanging right) to -1 (hanging left), so a tag
  // that changes sides glides round the dome instead of jumping.
  const labelFs = (j) => (j.li === 0 ? (mobile ? 9 : 10) : (mobile ? 10 : 11));
  const labelReach = (j) => j.size * 0.6 + 16;
  const labelBaseY = (j) => j.y - j.size * 0.26 - 8;
  const labelLo = () => WY + 12, labelHi = () => Y1 - 24;
  function tagBox(j, lx = j.lx, ly = j.ly, sideS = j.sideS) {
    const tw = j.lw || 64, h = labelFs(j) * 0.62, x0 = lx + 4 * sideS - tw * (1 - sideS) * 0.5;
    return [x0, ly - h, x0 + tw, ly + h];
  }
  function measureLabel(j) {
    g.font = `500 ${labelFs(j)}px ${MONO}`;
    j.lw = g.measureText(j.label).width;
    return j.lw;
  }
  function drawLabel(j, t) {
    if (!j.label) return;
    if (j.li === 0 && j.kind !== "turri") return;
    const fs = labelFs(j), text = j.label;
    const tw = measureLabel(j);
    // the leader's root rides over the dome of the bell as the tag swings sides
    const sS = clamp(j.sideS, -1, 1);
    place(j, sS * 0.47, -0.02 + (G.y0 + 0.01) * Math.sqrt(Math.max(0, 1 - sS * sS)), t, SB, 0);
    const ax = SB[0], ay = SB[1];
    const ex = j.lx, ey = j.ly;
    const mx = (ax + ex) / 2, my = (ay + ey) / 2 + 6;
    const left = ex + 4 * sS - tw * (1 - sS) * 0.5;
    // the lens would slice through a tag near its rim: a tag within 8 px of the glass is not drawn, and one a little
    // further out fades as the glass comes closer
    const lk = lensClear(Math.min(ax, mx, left), Math.min(ay, my, ey - fs * 0.62), Math.max(ax, mx, left + tw), Math.max(ay, my, ey + fs * 0.62));
    const base = (j.dying ? Math.max(0, j.alpha) : 1) * Math.min(1, j.grow * 1.5) * (1 - j.dim);
    const alpha = lk * base * Math.min(1, 0.7 + j.flash * 0.3);
    if (alpha <= 0.02) return;
    const p = new Path2D();
    for (let i = 0; i < 8; i++) {
      const u = i / 7, a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
      SB[i * 2] = a * ax + b * mx + c * ex; SB[i * 2 + 1] = a * ay + b * my + c * ey;
    }
    w0 = 1.5; w1 = 0.35;
    ribbon(p, SB, 8, (u) => 0.35 + 1.15 * u);
    // only the bright first flash reaches the tag; the long glow while Turri stares stays on the bell, so the tag
    // never sits in a muddy half-tone
    const fl = sstep((j.flash - 0.4) / 0.6);
    g.fillStyle = fl > 0.01 ? css(mix(PAL.ink, PAL.cream, fl), alpha) : css(PAL.ink, alpha);
    g.fill(p);
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.fillText(text, left, ey);
  }
  function stepLabel(j, dt) {
    if (!j.label) return;
    const room = (j.lw || 80) + labelReach(j);
    if (j.side > 0 && j.x > X1 - room) j.side = -1;
    else if (j.side < 0 && j.x < X0 + room) j.side = 1;
    const tx = j.x + j.side * labelReach(j), ty = labelBaseY(j) + j.oy;
    const k = 1 - Math.exp(-dt * 1.6);
    j.lx += (tx - j.lx) * k; j.ly += (ty - j.ly) * k;
    j.ly = clamp(j.ly, labelLo(), labelHi());
    j.sideS += (j.side - j.sideS) * (1 - Math.exp(-dt * 2.6));
  }

  // Things a tag must never sit on: Turri (bell, and one box round all his tentacles) and the live attention thread,
  // as a chain of small boxes along its length.
  const OBS = [];
  function obstacles(t) {
    OBS.length = 0;
    const j = turri;
    if (j && j.alpha > 0.05) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const grow = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
      for (let i = 0; i < G.outer.length; i += 3) { place(j, G.outer[i].x, G.outer[i].y, t, SB, 0); grow(SB[0], SB[1]); }
      OBS.push({ x0: x0 - 6, y0: y0 - 6, x1: x1 + 6, y1: y1 + 4, owner: j });
      x0 = y0 = Infinity; x1 = y1 = -Infinity;
      for (const s of j.st) { const n = streamer(j, s, t); for (let i = 0; i < n; i++) grow(SB[i * 2], SB[i * 2 + 1]); }
      if (x1 > x0) OBS.push({ x0: x0 - 7, y0: y0 - 2, x1: x1 + 7, y1: y1 + 6, owner: j });
    }
    // the live thread, all of it from the moment it is cast (tags duck before the tip arrives), and one that is
    // reeling back in for as long as it is still out
    for (const h of turri ? threads : []) {
      if (h.state === "back" && t - h.tb > 0.7) continue;
      const { n } = threadPts(h, t, true);
      for (let i = 0; i < n - 1; i += 2) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let k = i; k <= Math.min(n - 1, i + 2); k++) {
          const x = TB[k * 2], y = TB[k * 2 + 1];
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        OBS.push({ x0: x0 - 7, y0: y0 - 7, x1: x1 + 7, y1: y1 + 7, owner: null });
      }
    }
  }
  const overlaps = (b, o) => b[0] < o.x1 && b[2] > o.x0 && b[1] < o.y1 && b[3] > o.y0;
  function blockedBy(j, b) { for (const o of OBS) if (o.owner !== j && overlaps(b, o)) return o; return null; }

  // the nearest height (to where the tag is now) at which it is clear of every obstacle, without straying more than
  // a short leash from its home height; null if there is none
  function clearY(j, B, lo, hi) {
    const h = (B[3] - B[1]) / 2, home = clamp(labelBaseY(j), lo, hi), leash = 26 + j.size * 0.4;
    let best = null, bd = Infinity;
    const test = (y) => {
      if (y < lo || y > hi || Math.abs(y - home) > leash) return;
      const d = Math.abs(y - j.ly);
      if (d >= bd || blockedBy(j, [B[0], y - h, B[2], y + h])) return;
      best = y; bd = d;
    };
    for (const o of OBS) {
      if (o.owner === j || B[0] >= o.x1 || B[2] <= o.x0) continue;
      test(o.y0 - h - 1); test(o.y1 + h + 1);
    }
    return best;
  }
  // Lazy tags keep out of the way of Turri and the thread: hop to the other side of their own bell when that side is
  // clear, otherwise slide up or down to a clear height. While a tag is on top of either it ducks out (fades), and it
  // stays out if there is nowhere clear to go. Then tags keep off each other. `instant` settles a still frame.
  function relaxLabels(t, dt, k = 0.3, instant = false) {
    const L = all().filter((j) => j.label && (j.li > 0 || j.kind === "turri") && !j.dying);
    obstacles(t);
    const lo = labelLo(), hi = labelHi();
    // off each other first, so the obstacle pass below always judges where a tag really ends up
    for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) {
      const A = L[a], B = L[b], ba = tagBox(A), bb = tagBox(B);
      if (ba[2] + 4 < bb[0] || bb[2] + 4 < ba[0]) continue;
      const dy = B.ly - A.ly, need = 15;
      if (Math.abs(dy) >= need) continue;
      const push = (need - Math.abs(dy)) * 0.25 * (dy >= 0 ? 1 : -1);
      A.ly -= push; B.ly += push;
    }
    for (const j of L) j.ly = clamp(j.ly, lo, hi);
    for (const j of L) {
      const B = tagBox(j);
      j.dimT = 0;
      if (!blockedBy(j, B)) { if (j.oy) j.oy *= Math.exp(-dt * 0.7); continue; }
      j.dimT = 1;
      if (t - j.flipAt > 2.4) {
        const ns = -j.side, room = (j.lw || 80) + labelReach(j);
        const fits = ns > 0 ? j.x < X1 - room : j.x > X0 + room;
        const nx = j.x + ns * labelReach(j), ny = clamp(labelBaseY(j), lo, hi), nb = tagBox(j, nx, ny, ns);
        if (fits && !blockedBy(j, nb) && lensClear(nb[0], nb[1], nb[2], nb[3]) > 0.5) {
          j.side = ns; j.flipAt = t; j.oy = 0;
          if (instant) { j.lx = nx; j.ly = ny; j.sideS = ns; }
          continue;
        }
      }
      if (!instant && t - j.flipAt < 1.1) continue; // still swinging round
      const y = clearY(j, B, lo, hi);
      if (y == null) { if (j.oy) j.oy *= Math.exp(-dt * 0.7); continue; }
      const mv = (y - j.ly) * k;
      j.ly += mv; j.oy += mv;
    }
    for (const j of L) j.dim += (j.dimT - j.dim) * (instant ? 1 : 1 - Math.exp(-dt * (j.dimT > j.dim ? 11 : 2.4)));
  }
  // reduced motion: put every tag straight where it ends up
  function settleLabels(t) {
    for (const j of all()) {
      if (!j.label) continue;
      if (!j.lw) measureLabel(j);
      j.oy = 0; j.flipAt = -99; j.sideS = j.side; j.dim = 0;
      j.lx = j.x + j.side * labelReach(j); j.ly = clamp(labelBaseY(j), labelLo(), labelHi());
    }
    for (let it = 0; it < 16; it++) relaxLabels(t, 0, 0.5, true);
  }

  // ---------- drawing ----------
  function drawCrowdFlat(t, li) {
    const bells = new Path2D(), tails = new Path2D();
    let any = false;
    for (const j of crowd) {
      if (j.li !== li) continue;
      if (j.flash > 0.03 || j.ink > 0 || j.alpha < 0.999) { drawOneFlat(j, t); continue; }
      tailsOf(tails, j, t);
      shape(bells, j, G.outer, t);
      any = true;
    }
    if (any) { g.fillStyle = css(LAYC[li]); g.fill(tails); g.fill(bells); }
    for (const j of crowd) if (j.li === li && j.brainUntil > t && j.brainAt < t) drawBrain(j, t, false, 0.78);
  }
  function tailsOf(path, j, t) {
    w0 = Math.max(1.2, j.size * 0.034); w1 = 0.5;
    for (const s of j.st) { const n = streamer(j, s, t); const ww = w0; w0 = ww * s.w; ribbon(path, SB, n, taper); w0 = ww; }
  }
  function drawOneFlat(j, t) {
    let c = LAYC[j.li];
    if (j.ink > 0) c = mix(c, PAL.ink, sstep(j.ink));
    if (j.flash > 0.03) c = mix(c, PAL.cream, Math.min(1, j.flash * 1.15));
    const bells = new Path2D(), tails = new Path2D();
    tailsOf(tails, j, t);
    shape(bells, j, G.outer, t);
    g.globalAlpha = clamp(j.alpha, 0, 1);
    g.fillStyle = css(c);
    g.fill(tails); g.fill(bells);
    g.globalAlpha = 1;
  }
  function drawCrowdGlass(j, t) {
    g.globalAlpha = clamp(j.alpha, 0, 1);
    const tails = new Path2D();
    tailsOf(tails, j, t);
    g.fillStyle = INK; g.fill(tails);
    const o = new Path2D(); shape(o, j, G.outer, t); g.fill(o);
    const i = new Path2D(); shape(i, j, G.inner, t);
    g.fillStyle = j.flash > 0.03 ? css(mix(TINT, PAL.cream, j.flash)) : TINTC; g.fill(i);
    const gl = new Path2D(); shape(gl, j, G.glint, t);
    g.fillStyle = CREAM; g.fill(gl);
    if (j.brainUntil > t && j.brainAt < t) drawBrain(j, t, true, 0.78);
    else if (j.size * j.grow > (mobile ? 40 : 46)) drawNote(j, t);
    g.globalAlpha = 1;
  }
  // What the x-ray finds in there, set to fit inside this bell's glass: one line, smaller, or broken in two.
  // A bell too small for it gets no note.
  function noteLayout(j) {
    const key = Math.round(j.size * j.grow);
    if (j.note && j.note.key === key && j.note.text === j.inside) return j.note.lay;
    const maxW = key * 0.7, big = j.size > 90 ? 10.5 : 9, min = mobile ? 7 : 7.5;
    let lay = null;
    for (let fs = big; fs >= min && !lay; fs -= 0.5) {
      g.font = `400 ${fs}px ${MONO}`;
      const w = g.measureText(j.inside).width;
      if (w <= maxW) lay = { lines: [j.inside], fs, w };
    }
    const words = j.inside.split(" ");
    if (!lay && words.length > 1) {
      let best = null;
      for (let b = 1; b < words.length; b++) {
        const a = words.slice(0, b).join(" "), c = words.slice(b).join(" "), m = Math.max(a.length, c.length);
        if (!best || m < best.m) best = { a, c, m };
      }
      for (let fs = big; fs >= min && !lay; fs -= 0.5) {
        g.font = `400 ${fs}px ${MONO}`;
        const w = Math.max(g.measureText(best.a).width, g.measureText(best.c).width);
        if (w <= maxW * 0.86) lay = { lines: [best.a, best.c], fs, w };
      }
    }
    j.note = { key, text: j.inside, lay };
    return lay;
  }
  function drawNote(j, t) {
    const lay = noteLayout(j);
    if (!lay) return;
    const n = lay.lines.length, lh = lay.fs * 1.16;
    place(j, 0.035, n > 1 ? -0.035 : 0.03, t, SB, 0);
    const cx = SB[0], cy = SB[1];
    const fit = lensFit(cx, cy, lay.w + 2, lh * n, j.a, t);
    if (fit <= 0.01) return;
    g.save();
    g.translate(cx, cy); g.rotate(j.a);
    g.font = `400 ${lay.fs}px ${MONO}`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.globalAlpha = clamp(j.alpha, 0, 1) * fit;
    g.fillStyle = css(PAL.ink, 0.55);
    for (let i = 0; i < n; i++) g.fillText(lay.lines[i], 0, (i - (n - 1) / 2) * lh);
    g.restore();
  }
  // the brain with its eyes: Turri's (sc 1) or a borrowed one from the egg (sc < 1)
  function drawBrain(j, t, lensMode, sc) {
    const off = j.kind === "turri" ? j.bOff : 0;
    const bA = j.kind === "turri" ? j.bA : 1;
    if (bA <= 0.01) return;
    const k = j.kind === "turri" ? sc : sc * easeOutBack((t - j.brainAt) / 0.6) * (1 - sstep((t - j.brainUntil + 0.4) / 0.4));
    if (k <= 0.01) return;
    const bc = G.bc;
    const tf = (x, y) => ({ x: bc.x + (x - bc.x) * k, y: bc.y + (y - bc.y) * k + off });
    g.globalAlpha = bA * clamp(j.alpha, 0, 1);
    const b = new Path2D(); shape(b, j, G.brain, t, tf);
    g.fillStyle = INK; g.fill(b);
    // grooves: the water's colour; lit cream under the x-ray
    const gv = G.grooves[(j.groove || 0) % G.grooves.length] || [];
    const gp = new Path2D();
    for (const gr of gv) {
      for (let i = 0; i < gr.pts.length; i++) { const q = tf(gr.pts[i].x, gr.pts[i].y); place(j, q.x, q.y, t, SB, i * 2); }
      const ww = Math.max(0.8, gr.w * j.size * k * (lensMode && j.kind === "turri" ? 1.05 : 0.8));
      ribbon(gp, SB, gr.pts.length, (u) => ww * (0.35 + 0.65 * Math.sin(Math.PI * u)));
    }
    g.fillStyle = lensMode && j.kind === "turri" ? CREAM : (lensMode ? TINTC : WATERC);
    g.fill(gp);
    // neurons firing (x-ray only)
    if (lensMode && j.kind === "turri") {
      g.fillStyle = CREAM;
      for (const s of j.sparks) {
        if (s.wait > 0) continue;
        const gr = gv[s.gi]; if (!gr) continue;
        for (let tail = 0; tail < 3; tail++) {
          const u = clamp(s.u - tail * 0.06, 0, 1), f = u * (gr.pts.length - 1), i0 = Math.floor(f), i1 = Math.min(gr.pts.length - 1, i0 + 1), fr = f - i0;
          const q = tf(lerp(gr.pts[i0].x, gr.pts[i1].x, fr), lerp(gr.pts[i0].y, gr.pts[i1].y, fr));
          place(j, q.x, q.y, t, SB, 0);
          g.globalAlpha = bA * (1 - tail * 0.3);
          const sz = Math.max(1.2, j.size * 0.03) * (1 - tail * 0.28);
          g.beginPath(); g.ellipse(SB[0], SB[1], sz, sz * 0.8, j.a, 0, TAU); g.fill();
        }
      }
      g.globalAlpha = bA;
    }
    // eyes
    const lid = j.kind === "turri" ? Math.max(0.07, Math.min(lidAt(t - j.blinkT), 1 - j.closed)) : lidAt(t - (j.blinkT || -9));
    const wide = j.kind === "turri" ? 1 + 0.16 * j.wide : 1;
    const whites = new Path2D(), pupils = new Path2D();
    for (const e of G.eyes) {
      const q = tf(e.x, e.y);
      place(j, q.x, q.y, t, SB, 0);
      const ex = SB[0], ey = SB[1];
      const rx = Math.max(0.9, e.rx * j.size * k * wide), ry0 = Math.max(0.9, e.ry * j.size * k * wide), ry = ry0 * lid, rot = e.rot + j.a;
      whites.moveTo(ex + rx * Math.cos(rot), ey + rx * Math.sin(rot));
      whites.ellipse(ex, ey, rx, ry, rot, 0, TAU);
      if (lid > 0.3) {
        const r = Math.min(rx, ry0), pr = r * G.pupil * (1 - 0.12 * (j.wide || 0));
        let lx = 0, ly = 0.3;
        if (j.kind === "turri") { lx = j.ex; ly = j.ey; }
        else if (turri) { const dx = turri.x - j.x, dy = turri.y - j.y, d = Math.hypot(dx, dy) || 1; lx = dx / d; ly = dy / d; }
        const reach = (r - pr - r * 0.06);
        pupils.moveTo(ex + lx * reach + pr, ey + ly * reach * lid);
        pupils.arc(ex + lx * reach, ey + ly * reach * lid, pr, 0, TAU);
      }
    }
    g.fillStyle = CREAM; g.fill(whites);
    g.fillStyle = INK; g.fill(pupils);
    g.globalAlpha = 1;
  }
  function drawTurri(t, lensMode) {
    const j = turri;
    const water = lensMode ? TINTC : WATERC;
    // falling streamers from dropped hooks
    for (const f of j.fall) {
      const p = new Path2D();
      for (let i = 0; i < f.n; i++) { SB[i * 2] = f.pts[i * 2] + (f.x - f.x0); SB[i * 2 + 1] = f.pts[i * 2 + 1] + (f.y - f.y0); }
      w0 = f.w; w1 = 0.6;
      ribbon(p, SB, f.n, taper);
      g.globalAlpha = clamp(f.alpha, 0, 1); g.fillStyle = INK; g.fill(p); g.globalAlpha = 1;
    }
    const tails = new Path2D();
    for (const s of j.st) {
      const n = streamer(j, s, t);
      w0 = j.size * 0.068 * s.w * (0.4 + 0.6 * s.g); w1 = 1.1;
      ribbon(tails, SB, n, taper);
    }
    g.fillStyle = INK; g.fill(tails);
    const o = new Path2D(); shape(o, j, G.outer, t); g.fill(o);
    const i = new Path2D(); shape(i, j, G.inner, t); g.fillStyle = water; g.fill(i);
    drawBrain(j, t, lensMode, 1);
    const gl = new Path2D(); shape(gl, j, G.glint, t); g.fillStyle = CREAM; g.fill(gl);
  }
  function drawThreads(t) {
    for (const h of threads) {
      const { p, r, n } = threadPath(h, t);
      g.fillStyle = INK; g.fill(p);
      if (h.state === "hold") {
        // a cream bead runs the length of the thread, twice a second-ish
        g.fillStyle = CREAM;
        for (let b = 0; b < 3; b++) {
          const u = (((t - h.ta) / 1.25 + b / 3) % 1);
          const f = u * (n - 1) * r, i0 = Math.floor(f), i1 = Math.min(n - 1, i0 + 1), fr = f - i0;
          const x = lerp(TB[i0 * 2], TB[i1 * 2], fr), y = lerp(TB[i0 * 2 + 1], TB[i1 * 2 + 1], fr);
          const k = Math.sin(Math.PI * u);
          g.beginPath(); g.ellipse(x, y, (mobile ? 2.6 : 3.3) * k + 0.5, (mobile ? 1.7 : 2.1) * k + 0.4, Math.atan2(TB[i1 * 2 + 1] - TB[i0 * 2 + 1], TB[i1 * 2] - TB[i0 * 2]), 0, TAU); g.fill();
        }
      }
    }
  }
  function drawScene(t, lensMode) {
    // far, mid, Turri, near
    for (let li = 0; li < 3; li++) {
      if (lensMode) { for (const j of crowd) if (j.li === li) drawCrowdGlass(j, t); }
      else drawCrowdFlat(t, li);
      if (li === 1 && turri) drawTurri(t, lensMode);
    }
    // name tags live outside the glass only; inside it the x-ray notes do the talking
    if (!lensMode) { for (const j of crowd) drawLabel(j, t); if (turri) drawLabel(turri, t); }
    drawThreads(t);
  }
  function waterline(t) {
    const n = 44;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1), x = lerp(X0 - 2, X1 + 2, u);
      let y = WY + Math.sin(u * 9 + t * 0.9) * 1.4 + Math.sin(u * 23 - t * 1.7) * 0.7;
      for (const r of ripples) { const age = t - r.t0; if (age < 2.2) y += Math.sin((x - r.x) * 0.05 - age * 9) * 3 * Math.exp(-Math.abs(x - r.x) / 220) * (1 - age / 2.2); }
      TB[i * 2] = x; TB[i * 2 + 1] = y;
    }
    return n;
  }
  function draw(t) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // the lens this frame: how far its ink reaches (tags keep 8 px off it) and the arc its reading takes
    const lst = clamp(Math.hypot(lens.vx, lens.vy) / 2600, 0, 0.1);
    lensOuter = R * (1.05 + 0.6 * lst) + RIMW * 0.75;
    measureRim(`x-ray, ${lens.brains === 1 ? "1 brain" : `${lens.brains} brains`} in view${turri && turri.inLens && state.version > 0 ? `: v${state.version}` : ""}`);
    // water up to the waterline
    const n = waterline(t);
    const water = new Path2D();
    water.moveTo(TB[0], TB[1]);
    for (let i = 1; i < n; i++) water.lineTo(TB[i * 2], TB[i * 2 + 1]);
    water.lineTo(X1 + 2, Y1 + 2); water.lineTo(X0 - 2, Y1 + 2); water.closePath();
    g.fillStyle = WATERC; g.fill(water);
    const wl = new Path2D(); w0 = mobile ? 2 : 2.4; w1 = 0.8;
    ribbon(wl, TB, n, (u) => 0.9 + (w0 - 0.9) * Math.pow(Math.sin(Math.PI * u), 0.4));
    g.save();
    g.clip(water);
    // marine snow
    g.fillStyle = css(PAL.cream, 0.32);
    for (const s of snow) { const x = X0 + s.x * (X1 - X0), y = WY + s.y * (Y1 - WY), z = 1 + s.z * 1.3; g.fillRect(x, y, z, z); }
    g.fillStyle = css(PAL.deep, 0.85); g.fill(pebDeep);
    g.fillStyle = INK; g.fill(pebInk);
    drawScene(t, false);
    // ripples where the glass was tapped: two wobbly ink rings
    for (const r of ripples) {
      const age = t - r.t0;
      for (let k = 0; k < 2; k++) {
        const e = clamp((age - k * 0.16) / 1.1, 0, 1); if (e <= 0 || e >= 1) continue;
        const rad = 8 + easeOutCubic(e) * (mobile ? 52 : 70);
        const p = new Path2D();
        const m = 40;
        for (let i = 0; i < m; i++) { const a = (i / (m - 1)) * TAU * 1.02 + r.seed; const rr = rad * (1 + 0.06 * Math.sin(a * 3 + r.seed + e * 4)); SB[0] = 0; LB[i * 2] = r.x + Math.cos(a) * rr; LB[i * 2 + 1] = r.y + Math.sin(a) * rr * 0.92; }
        ribbon(p, LB, m, (u) => (2.2 * (1 - e) + 0.4) * (0.5 + 0.5 * Math.sin(Math.PI * u)));
        g.fillStyle = css(PAL.ink, 0.55 * (1 - e)); g.fill(p);
      }
    }
    // the x-ray lens
    const lp = lensPath(t);
    g.save();
    g.clip(lp);
    g.fillStyle = TINTC; g.fill(lp);
    g.translate(lens.x, lens.y); g.scale(M, M); g.translate(-lens.x, -lens.y);
    g.fillStyle = INK; g.fill(pebInk);
    drawScene(t, true);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 0.84; g.fillStyle = TINTC; g.fill(rimBand()); g.globalAlpha = 1;
    g.restore();
    g.restore();
    g.fillStyle = INK; g.fill(wl);
    // lens rim, glint and its reading
    g.fillStyle = INK; g.fill(lensRim(t));
    g.fillStyle = css(PAL.cream, 0.85); g.fill(lensGlint(t));
    const pop = 1 + 0.25 * Math.max(0, 1 - (t - lens.pop) / 0.5) * Math.sin(clamp((t - lens.pop) / 0.5, 0, 1) * Math.PI);
    g.save();
    if (pop > 1.001) { const cx = lens.x + Math.cos(Math.PI * 0.5 - 0.18) * (R - 16), cy = lens.y + Math.sin(Math.PI * 0.5 - 0.18) * (R - 16); g.translate(cx, cy); g.scale(pop, pop); g.translate(-cx, -cy); }
    textOnRim(t, INK);
    g.restore();
    // the tank's glass, over everything
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = INK; g.fill(frameP);
    g.fillStyle = css(PAL.cream, 0.9); g.fill(glintP);
  }

  // ---------- speech ----------
  function wordsHTML(text, delay0) {
    let d = delay0;
    return text.split(/\s+/).map((w) => {
      const s = `<span class="cp-w" style="--d:${d.toFixed(2)}s">${w.replace(/[<&>]/g, (c) => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;" })[c])}</span>`;
      d += /[.,?]$/.test(w) ? 0.2 : 0.055 + Math.random() * 0.04;
      return s;
    }).join(" ");
  }
  function bubbleShape(w, h, tailX, down, inkFill) {
    // an organic blob around the text with a tail toward the speaker; ink rim around cream, or plain ink
    const pts = [], N = 18, P = ctx.ink.P;
    const cx = w / 2, cy = h / 2, p1 = rand(0, TAU), p2 = rand(0, TAU);
    for (let k = 0; k < N; k++) {
      const a = (k / N) * TAU, c = Math.cos(a), s = Math.sin(a);
      const ex = Math.sign(c) * Math.pow(Math.abs(c), 0.64), ey = Math.sign(s) * Math.pow(Math.abs(s), 0.64);
      const wob = 1 + 0.04 * Math.sin(2 * a + p1) + 0.028 * Math.sin(3 * a + p2);
      pts.push(P(cx + ex * (w / 2 + 10) * wob, cy + ey * (h / 2 + 7) * wob));
    }
    // tail: replace the point nearest the bottom (or top) with a pointed lobe
    const target = down ? Math.PI / 2 : -Math.PI / 2;
    let best = 0, bd = 9;
    for (let k = 0; k < N; k++) { const a = (k / N) * TAU; const d = Math.abs(Math.atan2(Math.sin(a - target), Math.cos(a - target))); if (d < bd) { bd = d; best = k; } }
    const ey = down ? h + 6 : -6, tx = clamp(tailX, 22, w - 22), dir = down ? 1 : -1;
    const lobe = down
      ? [P(tx + 10, ey), P(tx + 2, ey + 9 * dir), P(tx - 5, ey + 17 * dir), P(tx - 6, ey + 6 * dir), P(tx - 12, ey)]
      : [P(tx - 10, ey), P(tx - 2, ey + 9 * dir), P(tx + 5, ey + 17 * dir), P(tx + 6, ey + 6 * dir), P(tx + 12, ey)];
    pts.splice(best, 1, ...lobe);
    const outline = (ptsIn) => { const sp = ctx.ink.spline(ptsIn, true, 10); return "M " + sp.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ") + " Z"; };
    const outer = outline(pts);
    if (inkFill) return `<path d="${outer}" fill="var(--ink)"/>`;
    const inset = pts.map((p) => P(cx + (p.x - cx) * (1 - 6 / w) + 0.9, cy + (p.y - cy) * (1 - 5 / h) + 0.8));
    return `<path d="${outer}" fill="var(--ink)"/><path d="${outline(inset)}" fill="var(--cream)"/>`;
  }
  function closeTalk() {
    for (const b of talk.bubbles) { b.el.classList.add("is-out"); setTimeout(() => b.el.remove(), 900); }
    talk.bubbles = []; talk.j = null; talk.until = 0;
  }
  function say(j, { text, head = null, meta = null, ink = false, delay = 0, avoid = null }) {
    const el = document.createElement("div");
    el.className = `cp-say${ink ? " cp-say--ink" : ""}`;
    el.innerHTML = `<div class="cp-say__pop"><svg class="cp-say__shape" aria-hidden="true"></svg><div class="cp-say__body">${head ? `<span class="cp-say__head">${head}</span>` : ""}<span class="cp-say__text">${wordsHTML(text, delay + 0.12)}</span>${meta ? `<span class="cp-say__meta">${meta}</span>` : ""}</div></div>`;
    el.style.visibility = "hidden";
    says.appendChild(el);
    const body = el.querySelector(".cp-say__body");
    const bw = body.offsetWidth, bh = body.offsetHeight;
    const bellTop = j.y - j.size * 0.4 * j.grow, bellBot = j.y + j.size * 0.36;
    let down = true;
    let by = bellTop - bh - 26;
    if (by < WY + 4) { down = false; by = bellBot + 24; }
    let bx = clamp(j.x - bw * 0.5 + (j.x > (X0 + X1) / 2 ? -bw * 0.18 : bw * 0.18), X0 + 8, X1 - bw - 8);
    if (avoid) {
      const hit = (x, y) => x < avoid.x + avoid.w + 10 && x + bw + 10 > avoid.x && y < avoid.y + avoid.h + 10 && y + bh + 10 > avoid.y;
      if (hit(bx, by)) { const alt = down ? bellBot + 24 : bellTop - bh - 26; if (alt > WY + 4 && alt + bh < Y1 - 4 && !hit(bx, alt)) { by = alt; down = !down; } else { bx = avoid.x + avoid.w + 14 + bw < X1 ? avoid.x + avoid.w + 14 : Math.max(X0 + 8, avoid.x - bw - 14); } }
    }
    by = clamp(by, WY + 4, Y1 - bh - 30);
    const tailX = j.x - bx;
    const svg = el.querySelector(".cp-say__shape");
    const pad = 26;
    svg.setAttribute("viewBox", `${-pad} ${-pad} ${bw + pad * 2} ${bh + pad * 2}`);
    svg.style.cssText = `left:${-pad}px;top:${-pad}px;width:${bw + pad * 2}px;height:${bh + pad * 2}px`;
    svg.innerHTML = bubbleShape(bw, bh, tailX, down, ink);
    const pop = el.querySelector(".cp-say__pop");
    pop.style.setProperty("--ox", `${clamp(tailX, 10, bw - 10)}px`);
    pop.style.setProperty("--oy", down ? `${bh + 14}px` : "-14px");
    pop.style.animationDelay = `${delay}s`;
    const b = { el, j, ox: bx - j.x, oy: by - j.y, x: bx, y: by, w: bw, h: bh };
    el.style.transform = `translate3d(${bx.toFixed(1)}px, ${by.toFixed(1)}px, 0)`;
    el.style.visibility = "";
    talk.bubbles.push(b);
    return b;
  }
  function ago(at) {
    const s = Math.max(0, (Date.now() - at) / 1000);
    if (s < 60) return "just now";
    const m = Math.round(s / 60);
    return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
  }
  function brainAge() {
    const last = state.journal && state.journal[state.journal.length - 1];
    if (!last || !last.at) return null;
    const m = Math.max(0, Math.round((Date.now() - last.at) / 60000));
    return m < 1 ? "under a minute" : m === 1 ? "1 minute" : `${m} minutes`;
  }
  let lastLine = "";
  function fresh(list) { let s = pick(list); for (let k = 0; k < 4 && s === lastLine; k++) s = pick(list); lastLine = s; return s; }

  function jellyTalks(j, t) {
    closeTalk();
    j.hold = t + 6.5; kick(j); j.flash = Math.max(j.flash, 0.35);
    talk.j = j; talk.until = t + 6.5;
    const first = say(j, { text: fresh(j.husk ? HUSK : DUMB) });
    bus.emit("sfx", { name: "bubble" });
    const th = j.thought;
    const text = th ? th.text : j.husk ? `You were me for ${config.brainMinutes || 30} minutes. You did fine.` : fresh(UNSEEN);
    const meta = th ? `v${th.v}, ${ago(th.at)}` : null;
    setTimeout(() => {
      if (talk.j !== j) return;
      const tt = nowS();
      startThread(j, "talk", tt);
      turri.hold = Math.max(turri.hold, tt + 4.5);
      say(turri, { text, head: "What I thought about you", meta, ink: true, avoid: first });
      if (reduced) requestDraw();
    }, reduced ? 0 : 750);
    timers.add(setTimeout(() => { if (talk.j === j) closeTalk(); }, 7600));
  }
  function turriTalks(t, text) {
    closeTalk();
    turri.hold = t + 4.5; kick(turri); turri.wide = 1;
    talk.j = null; talk.until = t + 4.5;
    say(turri, { text, ink: true });
    bus.emit("sfx", { name: "bubble" });
    const b = talk.bubbles[talk.bubbles.length - 1];
    timers.add(setTimeout(() => { if (talk.bubbles.includes(b)) closeTalk(); }, 5200));
  }
  const timers = new Set();

  // ---------- input ----------
  let rect = { left: 0, top: 0 };
  function measure() { const r = canvas.getBoundingClientRect(); rect = { left: r.left, top: r.top + scrollY }; }
  const toScene = (cx, cy) => {
    let x = cx - rect.left, y = cy - (rect.top - scrollY);
    if (Math.hypot(x - lens.x, y - lens.y) < R) { x = lens.x + (x - lens.x) / M; y = lens.y + (y - lens.y) / M; }
    return { x, y };
  };
  function hits(j, x, y) {
    const dx = x - j.x, dy = y - j.y;
    const lx = dx * j.c + dy * j.sn, ly = -dx * j.sn + dy * j.c;
    const s = Math.max(j.size * j.grow, 44);
    return (lx / (s * 0.56)) ** 2 + (ly / (s * 0.42)) ** 2 < 1 || (Math.abs(lx) < s * 0.3 && ly > 0 && ly < s * 1.05);
  }
  function hitTest(x, y) {
    if (turri && hits(turri, x, y)) return turri;
    for (let li = 2; li >= 0; li--) for (let i = crowd.length - 1; i >= 0; i--) { const j = crowd[i]; if (j.li === li && !j.dying && hits(j, x, y)) return j; }
    return null;
  }
  let down = null;
  canvas.addEventListener("pointermove", (e) => {
    const p = toScene(e.clientX, e.clientY);
    canvas.dataset.cursor = hitTest(p.x, p.y) ? "bubble" : "ink";
    if (e.pointerType !== "touch") {
      lens.mode = "pointer"; lens.movedAt = nowS();
      lens.tx = e.clientX - rect.left; lens.ty = e.clientY - (rect.top - scrollY);
      if (reduced) { lens.x = clamp(lens.tx, X0 + R + 8, X1 - R - 8); lens.y = clamp(lens.ty, WY + R + 6, Y1 - R - 30); requestDraw(); }
    }
  }, { passive: true });
  canvas.addEventListener("pointerleave", () => { if (lens.mode === "pointer") lens.mode = "auto"; canvas.dataset.cursor = "ink"; });
  canvas.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (e.pointerType === "touch") {
      lens.mode = "touch"; lens.movedAt = nowS();
      lens.tx = e.clientX - rect.left; lens.ty = e.clientY - (rect.top - scrollY);
    }
  }, { passive: true });
  canvas.addEventListener("pointerup", (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dt = performance.now() - down.t;
    down = null;
    if (moved > 12 || dt > 700) return;
    tap(e.clientX, e.clientY);
  });
  canvas.addEventListener("pointercancel", () => { down = null; });
  // keyboard: Enter talks to a random jelly, M asks Turri
  canvas.tabIndex = 0;
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const pool = crowd.filter((j) => !j.dying); if (pool.length) jellyTalks(pick(pool), nowS()); }
    if (e.key === "m") turriTalks(nowS(), fresh(SHARP.map((f) => f({ version: state.version, age: brainAge(), minutes: config.brainMinutes || 30 }))));
  });

  function tap(cx, cy) {
    const t = nowS();
    const p = toScene(cx, cy);
    const j = hitTest(p.x, p.y);
    bus.emit("ripple", { x: cx, y: cy, strength: j ? 0.25 : 0.45 });
    if (j === turri) {
      turriTalks(t, fresh(SHARP.map((f) => f({ version: state.version, age: brainAge(), minutes: config.brainMinutes || 30 }))));
    } else if (j) {
      jellyTalks(j, t);
    } else {
      // tapping the glass
      ripples.push({ x: p.x, y: p.y, t0: t, seed: rand(0, TAU) });
      for (const o of crowd) {
        const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d < 220) { const f = (1 - d / 220) * 90; o.vx += (dx / d) * f; o.vy += (dy / d) * f; kick(o); }
      }
      glassTaps = glassTaps.filter((x) => t - x < 6).concat([t]);
      if (glassTaps.length >= 3 && !talk.bubbles.length) { turriTalks(t, GLASS[Math.min(GLASS.length - 1, Math.floor(glassTaps.length / 3) - 1)]); glassTaps = []; }
    }
    if (reduced) requestDraw();
  }

  // ---------- events ----------
  function chooseTarget(t) {
    const pool = crowd.filter((j) => !j.dying && j !== talk.j);
    if (!pool.length) return null;
    pool.sort((a, b) => (a.lastLook - b.lastLook) + (Math.random() - 0.5) * 20);
    return pool[0];
  }
  function lookAt(th, t) {
    const j = chooseTarget(t);
    if (!j) return;
    j.thought = { text: th.text, v: th.version ?? state.version, at: th.at || Date.now() };
    if (visible || reduced) startThread(j, "look", t);
    if (reduced) { j.flash = 0.6; requestDraw(); setTimeout(() => { threads.length = 0; j.flash = 0; requestDraw(); }, 4000); }
  }
  bus.on("thought", (th) => {
    if (!th || th.kind !== "look" || !turri) return;
    firstLook = true;
    lookAt(th, nowS());
  });
  bus.on("hooks:set", (hooks) => { if (turri) syncHooks(turri, hooks || [], false); });
  bus.on("hook:add", (e) => {
    if (!turri || !e || !e.hook) return;
    if (!turri.st.find((s) => s.id === e.hook.id)) { const s = turriStreamer(e.hook.id); s.g = reduced ? 1 : 0; s.ax = 0; turri.st.push(s); spreadStreamers(turri); }
  });
  bus.on("hook:remove", (e) => {
    if (!turri || !e) return;
    const k = turri.st.findIndex((s) => s.id === e.id);
    if (k < 0) return;
    const s = turri.st[k];
    const n = streamer(turri, s, T);
    turri.fall.push({ pts: Float32Array.from(SB.subarray(0, n * 2)), n, x: 0, y: 0, x0: 0, y0: 0, vy: 0, alpha: 1, ph: rand(0, TAU), w: turri.size * 0.05 });
    turri.st.splice(k, 1);
    spreadStreamers(turri);
  });
  bus.on("brain:swap:start", () => {
    if (!turri) return;
    const t = nowS();
    turri.swap = { phase: "start", t0: t };
    for (const j of crowd) j.lookUntil = t + 9;
  });
  bus.on("brain:swap:mid", (e) => {
    if (!turri) return;
    const t = nowS();
    turri.swap = { phase: "mid", t0: t, t1: t };
    turri.groove = (turri.groove + 1 + Math.floor(Math.random() * 4)) % Math.max(1, G.grooves.length);
    // the old body joins the crowd
    const from = e && e.from != null ? e.from : state.version - 1;
    const h = addCrowd(1, turri.size * 0.86, { x: turri.x, y: turri.y + 4, label: `v${from}, retired`, inside: `v${from} was here`, husk: true, grow: 0.25, ink: 1, vx: rand(-30, 30), vy: 22 });
    h.homeY = clamp(turri.y + 60, WY + 60, Y1 - 120);
    placeLabel(h);
    // someone else drifts out of view to keep the tank the same size
    const out = crowd.filter((j) => j !== h && !j.dying && (j.husk || j.li === 1));
    const old = out.find((j) => j.husk) || pick(out);
    if (old) { old.dying = 1; old.label = old.label; }
    updateCount();
  });
  bus.on("brain:swap:done", () => {
    if (!turri) return;
    const t = nowS();
    turri.swap = { phase: "done", t2: t };
    for (const j of crowd) j.lookUntil = Math.min(j.lookUntil, t + 1.5 + Math.random());
    if (visible && !talk.bubbles.length) setTimeout(() => turriTalks(nowS(), `v${state.version}. Same coin. Better brain, probably.`), 700);
  });
  bus.on("egg", (e) => {
    if (!e || e.type !== "brains" || !turri) return;
    const t = nowS();
    for (const j of crowd) { const d = Math.hypot(j.x - turri.x, j.y - turri.y); j.brainAt = t + d / 700; j.brainUntil = j.brainAt + 10; j.groove = Math.floor(Math.random() * 6); j.blinkT = -9; }
    updateCount();
    setTimeout(updateCount, 11500);
  });

  function updateCount() {
    const n = crowd.filter((j) => !j.dying).length;
    const t = nowS();
    const b = 1 + crowd.filter((j) => j.brainUntil > t).length;
    countN.textContent = String(n);
    countB.textContent = String(b);
    countWord.textContent = b === 1 ? " brain" : " brains";
  }

  // ---------- loop ----------
  let drawQueued = false;
  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => { drawQueued = false; T = nowS(); prepare(T); countBrains(T); settleLabels(T); draw(T); });
  }
  function prepare(t) { for (const j of all()) { j.c = Math.cos(j.a); j.sn = Math.sin(j.a); } }
  function step(t, dt) {
    for (const j of crowd) stepCrowd(j, t, dt);
    for (let i = crowd.length - 1; i >= 0; i--) if (crowd[i].dying && crowd[i].alpha <= 0) crowd.splice(i, 1);
    if (turri) stepTurri(t, dt);
    for (const j of all()) stepLabel(j, dt);
    relaxLabels(t, dt);
    stepThreads(t);
    stepLens(t, dt);
    for (const s of snow) { s.y += dt * (0.008 + s.z * 0.012); s.x += Math.sin(t * 0.4 + s.ph) * dt * 0.004; if (s.y > 1) { s.y = 0; s.x = Math.random(); } }
    for (let i = ripples.length - 1; i >= 0; i--) if (t - ripples[i].t0 > 2.4) ripples.splice(i, 1);
    // the conversation follows its speakers
    for (const b of talk.bubbles) {
      const x = clamp(b.j.x + b.ox, X0 + 6, X1 - b.w - 6), y = clamp(b.j.y + b.oy, WY + 2, Y1 - b.h - 24);
      b.x += (x - b.x) * 0.2; b.y += (y - b.y) * 0.2;
      b.el.style.transform = `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0)`;
    }
    prepare(t);
  }

  resize();
  measure();
  // a small handle for the console and for tests
  ctx.crowdPlay = {
    get turri() { return turri; }, crowd, lens,
    where(j = turri) { const r = canvas.getBoundingClientRect(); return j ? { x: r.left + j.x, y: r.top + j.y } : null; },
    talk(j) { jellyTalks(j || pick(crowd), nowS()); }, poke() { turriTalks(nowS(), fresh(SHARP.map((f) => f({ version: state.version, age: brainAge(), minutes: config.brainMinutes || 30 })))); },
    // tags that are visibly on top of Turri or the thread right now (should stay empty)
    audit() {
      obstacles(T);
      return all().filter((j) => j.label && (j.li > 0 || j.kind === "turri") && !j.dying).map((j) => {
        const b = tagBox(j), o = blockedBy(j, b);
        return { label: j.label, vis: +((1 - j.dim) * lensClear(b[0], b[1], b[2], b[3])).toFixed(2), on: o ? (o.owner ? "turri" : "thread") : null, dim: +j.dim.toFixed(2) };
      }).filter((r) => r.on && r.vis > 0.2);
    },
  };
  lens.x = lens.tx = turri ? turri.x + 30 : W / 2; lens.y = lens.ty = turri ? turri.y : H / 2;
  if (turri) chooseWaypoint(T);
  new ResizeObserver(() => { resize(); measure(); }).observe(tank);
  new ResizeObserver(() => measure()).observe(document.body);
  addEventListener("resize", measure);
  // before the tank starts, keep its rect fresh while scrolling; measured in the read phase of the next frame,
  // so it never forces a layout of its own (measuring inside the scroll event did, often)
  let measureDue = false;
  addEventListener("scroll", () => { if (!started) measureDue = true; }, { passive: true });
  ctx.loop.read(() => { if (measureDue) { measureDue = false; measure(); } });

  // the very first look plays as soon as the tank is seen, from the latest real look thought
  function firstThread() {
    if (firstLook || !turri) return;
    firstLook = true;
    const looks = (state.thoughts || []).filter((x) => x.kind === "look");
    // a real one only: before launch there is none, and the tank just waits for the first
    const th = looks[looks.length - 1];
    if (th) lookAt(th, nowS());
  }

  const io = new IntersectionObserver((ents) => {
    for (const e of ents) {
      visible = e.isIntersecting;
      if (visible) { measure(); if (!firstLook) timers.add(setTimeout(firstThread, reduced ? 0 : 1400)); if (reduced) requestDraw(); }
    }
  }, { rootMargin: "120px 0px" });
  io.observe(tank);

  if (reduced) {
    // still frame: the lens rests on Turri and a neighbour
    T = nowS();
    for (const j of all()) { j.s = 0; j.sh = 0; }
    if (turri) { lens.x = turri.x + R * 0.3; lens.y = turri.y + 10; }
    requestDraw();
    return;
  }
  ctx.loop.add((t, dt) => {
    if (!visible) return;
    started = true;
    T = t;
    step(t, Math.min(dt, 1 / 30));
    draw(t);
  });
}
