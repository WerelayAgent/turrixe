// crowd: everyone else. Brainless jellies drifting behind the whole page on one fixed canvas (#crowd).
// Each one is Turri's own bell outline (assets/jelly.json) filled flat in the crowd colour, no glass, no eyes.
// Three parallax layers (far, mid, near) move with scroll and pointer. Every jelly beats with a fast squeeze and a
// slow elastic recoil, glides and sinks between beats, and trails soft tapered streamers. They wander, keep apart,
// flee the cursor (beating faster), give Turri a little room, turn to watch him during a brain swap, and each
// retired brain sinks out of him as a new brainless jelly (or, when the swap pip plays the ceremony, floats back
// up from where the pip's husk sank). The brains egg lends them brains for ten seconds.
// They keep out of the reader's way: a jelly that drifts behind a paragraph or the thought stream sinks back into
// the water (it fades toward the water colour), and while the page is still the mid and near ones swim out of the
// text columns, sideways out of a tall column, up or down out of a short wide paragraph.
// Budget: the per-frame writes never touch layout. Turri's box, the text zones, the swap pip and the label checks
// are measured in the loop's read phase (ctx.loop.read), kept in document px and moved with ctx.scroll.y, so they
// are exact while scrolling and only re-read when something can have changed. The water colour comes from the
// inline --bg the depth module writes on :root (a string lookup, never getComputedStyle in the loop).

import { live } from "../core/live.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const mod = (a, n) => ((a % n) + n) % n;
const rand = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));
const easeOutBack = (t) => { const c = 1.8, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c) => `rgb(${Math.round(clamp(c[0], 0, 255))},${Math.round(clamp(c[1], 0, 255))},${Math.round(clamp(c[2], 0, 255))})`;
const lum = (c) => {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};

// Far to near. size is the bell width in px; mix is how far the layer colour goes from the water toward the crowd tone
// (aerial perspective); scroll and px/py are parallax; flee is the cursor radius; ring is the radius they circle at
// when they have brains; dim is how far a jelly fades when it sits wholly behind words (ink on --field keeps about
// 4.3:1 over a dimmed near jelly instead of 2.8:1), steer how keenly it swims out of them (the far specks only fade).
const LAYERS = [
  { share: 0.46, size: [24, 38], mix: 0.55, scroll: 0.05, px: 7, py: 5, speed: 0.8, tempo: 1.2, flee: 125, push: 0.5, ring: 150, drift: 0.6, nodes: 7, st: [3, 4], bellN: 44, dim: 0.45, steer: 0 },
  { share: 0.37, size: [46, 72], mix: 0.8, scroll: 0.12, px: 16, py: 10, speed: 1, tempo: 1, flee: 180, push: 0.8, ring: 220, drift: 0.85, nodes: 9, st: [4, 5], bellN: 60, dim: 0.72, steer: 0.8 },
  { share: 0.17, size: [96, 150], mix: 1, scroll: 0.24, px: 30, py: 18, speed: 1.1, tempo: 0.9, flee: 250, push: 1, ring: 300, drift: 1, nodes: 11, st: [5, 6], bellN: 76, dim: 0.8, steer: 1 },
];

// Bell beat: phase 0..1. A muscular squeeze that starts soft and ends hard, then a passive elastic recoil
// with a small overshoot (the margin flares) that settles back to rest.
const SQ = 0.3;
function squeeze(p) {
  if (p < SQ) { const t = Math.pow(p / SQ, 1.25); return 1 - (1 - t) * (1 - t) * (1 - t); }
  const t = (p - SQ) / (1 - SQ);
  return Math.exp(-5 * t) * Math.cos(t * Math.PI * 1.2);
}

// Eyelid for the borrowed brains: close 92 ms, hold 26 ms, open 185 ms (same rhythm as Turri)
function lidAt(e) {
  if (e < 0) return 1;
  if (e < 0.092) { const u = e / 0.092; return 1 - u * u * (3 - 2 * u); }
  if (e < 0.118) return 0;
  if (e < 0.303) { const u = (e - 0.118) / 0.185; return 1 - Math.pow(1 - u, 3); }
  return 1;
}

// ---------- geometry from assets/jelly.json ----------
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
const signedArea = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a.x * b.y - b.x * a.y; } return s / 2; };
const centroid = (P) => { let x = 0, y = 0; for (const p of P) { x += p.x; y += p.y; } return { x: x / P.length, y: y / P.length }; };
// Ribbons built left-side-forward wind with negative area (y down); every closed shape matches that so one
// nonzero fill per layer never punches holes where streamers tuck under a bell.
const orient = (P) => (signedArea(P) > 0 ? P.slice().reverse() : P);

function buildGeometry(J) {
  const bellRaw = parsePts(J.bell.d);
  let x0 = Infinity, x1 = -Infinity;
  for (const p of bellRaw) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); }
  const W0 = x1 - x0, CX = (x0 + x1) / 2;
  const unit = (p) => ({ x: (p.x - CX) / W0, y: p.y / W0 });
  const bellUnit = orient(bellRaw.map(unit));

  const tpl = LAYERS.map((L) => {
    const P = resampleClosed(bellUnit, L.bellN);
    let ymin = Infinity, ymax = -Infinity;
    for (const p of P) { ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y); }
    return {
      n: P.length,
      x: Float32Array.from(P, (p) => p.x),
      y: Float32Array.from(P, (p) => p.y),
      v: Float32Array.from(P, (p) => (p.y - ymin) / (ymax - ymin)),
      ang: Float32Array.from(P, (p) => Math.atan2(p.y, p.x)),
    };
  });

  // the brain as it sits in the bell (brainInBell), in unit-bell coordinates
  const bib = J.brainInBell || { tx: 0, ty: 0, s: 0.56, rot: 0 };
  const cr = Math.cos((bib.rot * Math.PI) / 180), sr = Math.sin((bib.rot * Math.PI) / 180);
  const inBell = (p) => { const x = p.x * bib.s, y = p.y * bib.s; return unit({ x: x * cr - y * sr + bib.tx + CX, y: x * sr + y * cr + bib.ty }); };
  const brainRaw = parsePts(J.brain.d);
  const brain = orient(resampleClosed(brainRaw.map(inBell), 40));
  const brainC = centroid(brain);
  const grooves = (J.brain.grooves || []).map((variant) => variant.map((gr) => {
    const pts = gr.pts.map(([x, y]) => inBell({ x, y }));
    const step = Math.max(1, Math.round(pts.length / 12));
    const thin = pts.filter((_, i) => i % step === 0);
    if (thin[thin.length - 1] !== pts[pts.length - 1]) thin.push(pts[pts.length - 1]);
    return { w: (gr.w * bib.s) / W0, pts: thin };
  }));
  const eyes = (J.brain.eyes || []).map((e) => {
    const c = inBell(e);
    return { x: c.x, y: c.y, rx: (e.rx * bib.s) / W0, ry: (e.ry * bib.s) / W0, rot: ((e.rot + bib.rot) * Math.PI) / 180 };
  });

  // the old brain's outline at bell scale, point-matched to the mid bell so the husk can morph brain -> bell
  let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
  for (const p of brainRaw) { bx0 = Math.min(bx0, p.x); bx1 = Math.max(bx1, p.x); by0 = Math.min(by0, p.y); by1 = Math.max(by1, p.y); }
  const bw = bx1 - bx0;
  let morph = orient(resampleClosed(brainRaw.map((p) => ({ x: (p.x - (bx0 + bx1) / 2) / bw * 0.9, y: (p.y - (by0 + by1) / 2) / bw * 0.9 })), LAYERS[1].bellN));
  const ref = tpl[1];
  const cB = centroid(morph);
  const a0 = Math.atan2(ref.y[0], ref.x[0]);
  let best = 0, bd = Infinity;
  morph.forEach((p, i) => { const d = Math.abs(wrapA(Math.atan2(p.y - cB.y, p.x - cB.x) - a0)); if (d < bd) { bd = d; best = i; } });
  morph = morph.slice(best).concat(morph.slice(0, best));

  const mf = (x, y) => ({ x: ((x - (bx0 + bx1) / 2) / bw) * 0.9, y: ((y - (by0 + by1) / 2) / bw) * 0.9 });
  const morphGrooves = ((J.brain.grooves || [])[0] || []).map((gr) => {
    const pts = gr.pts.map(([x, y]) => mf(x, y));
    const step = Math.max(1, Math.round(pts.length / 14));
    const thin = pts.filter((_, i) => i % step === 0);
    if (thin[thin.length - 1] !== pts[pts.length - 1]) thin.push(pts[pts.length - 1]);
    return { w: (gr.w / bw) * 0.9, pts: thin };
  });

  return {
    tpl, brain, brainC, grooves, eyes, pupil: J.brain.pupil || 0.47, morphGrooves,
    morphX: Float32Array.from(morph, (p) => p.x), morphY: Float32Array.from(morph, (p) => p.y),
  };
}

// ---------- module ----------
export function init(ctx) {
  const canvas = document.getElementById("crowd");
  const J = ctx.assets && ctx.assets.jelly;
  if (!canvas || !J || !canvas.getContext) return;
  const g = canvas.getContext("2d");
  if (!g) return;
  const { bus, pointer, scroll } = ctx;
  const params = ctx.params || new URLSearchParams(location.search);
  const reduced = !!ctx.reduced;
  const mobile = !!ctx.mobile;
  const sizeK = mobile ? 0.68 : 1;
  const nowS = () => performance.now() / 1000;
  const scrollTop = () => (scroll && scroll.y) || 0;
  const geo = buildGeometry(J);
  const TB = 0.8; // the borrowed brains are a size smaller than Turri's

  // ---- colour: read the tokens once at boot, then follow the live water colour ----
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const pg = probe.getContext("2d", { willReadFrequently: true });
  function rgbOf(str, fb) {
    if (!str || !pg) return fb;
    pg.clearRect(0, 0, 1, 1);
    pg.fillStyle = "rgba(0,0,0,0)";
    pg.fillStyle = str;
    pg.fillRect(0, 0, 1, 1);
    const d = pg.getImageData(0, 0, 1, 1).data;
    return d[3] < 10 ? fb : [d[0], d[1], d[2]];
  }
  // hex (what the tokens and the depth module use) parses directly; anything else goes through the 1 px probe
  function parseColor(str, fb) {
    const s = (str || "").trim();
    let m = /^#([0-9a-f]{6})$/i.exec(s);
    if (m) { const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
    if (m) return [parseInt(m[1] + m[1], 16), parseInt(m[2] + m[2], 16), parseInt(m[3] + m[3], 16)];
    return rgbOf(s, fb);
  }
  const root = getComputedStyle(document.documentElement); // boot only
  const tok = (name, fb) => parseColor(root.getPropertyValue(name), fb);
  const PAL = {
    field: tok("--field", [139, 99, 245]), deep: tok("--deep", [93, 63, 201]), abyss: tok("--abyss", [29, 17, 70]),
    ink: tok("--ink", [11, 11, 11]), cream: tok("--cream", [253, 241, 216]),
  };
  // at the surface the crowd is exactly --deep: deep = field * 0.62 + K
  const K = [PAL.deep[0] - PAL.field[0] * 0.62, PAL.deep[1] - PAL.field[1] * 0.62, PAL.deep[2] - PAL.field[2] * 0.62];
  const inkCss = css(PAL.ink), creamCss = css(PAL.cream);
  const col = { bg: PAL.field, layer: [PAL.deep, PAL.deep, PAL.deep], layerCss: ["", "", ""] };
  function recolor(bg) {
    col.bg = bg;
    const L = lum(bg);
    // light water: a darker, bluer shade (exactly --deep on --field); dark water: a lighter violet ghost
    const dark = [bg[0] * 0.62 + K[0], bg[1] * 0.62 + K[1], bg[2] * 0.62 + K[2]];
    const ghost = mix3(bg, PAL.deep, 0.42);
    const w = smooth(0.022, 0.07, L);
    const tone = mix3(ghost, dark, w);
    const bump = 1 - Math.abs(w - 0.5) * 2; // where light and dark cross, lean on hue so they never vanish
    tone[0] -= 8 * bump; tone[1] -= 7 * bump; tone[2] += 15 * bump;
    for (let i = 0; i < 3; i++) { col.layer[i] = mix3(bg, tone, LAYERS[i].mix); col.layerCss[i] = css(col.layer[i]); }
  }
  // The live water: the depth module writes it as an inline --bg on :root. Reading the inline declaration is a plain
  // string lookup (no style recalc, unlike getComputedStyle), so it is checked every frame and parsed only when it
  // changes. Without the depth module the water is whatever --bg was at boot.
  const rootStyle = document.documentElement.style;
  const bootBg = tok("--bg", PAL.field);
  let bgStr = null, bgKey = "";
  function trackBg(force) {
    const v = live.bg || rootStyle.getPropertyValue("--bg"); // live.bg: the depth module no longer steps :root while diving
    if (v === bgStr && !force) return false;
    bgStr = v;
    const c = (v && parseColor(v, null)) || bootBg;
    const key = c.join(",");
    if (key === bgKey && !force) return false;
    bgKey = key;
    recolor(c);
    return true;
  }

  // ---- canvas and layers ----
  let W = 1, H = 1, dpr = 1;
  const lay = LAYERS.map(() => ({ ox: 0, oy: 0, m: 0, ww: 1, wh: 1 }));
  const jellies = [];
  const byLayer = [[], [], []];
  const drops = []; // brains falling out after the egg
  // The backing store is only touched when the size or the pixel ratio really changed: assigning canvas.width (even
  // the same value) clears the canvas and resets the context, and phones fire resize every time the toolbar slides.
  function setSize(w, h) {
    const d = Math.min(devicePixelRatio || 1, 1.5);
    w = Math.max(1, w || innerWidth); h = Math.max(1, h || innerHeight);
    if (Math.abs(w - W) < 0.5 && Math.abs(h - H) < 0.5 && d === dpr) return false;
    W = w; H = h; dpr = d;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    LAYERS.forEach((L, i) => {
      const m = L.size[1] * sizeK * 1.85; // a whole jelly (bell plus streamers, any angle) leaves the view before it wraps
      lay[i].m = m; lay[i].ww = W + 2 * m; lay[i].wh = H + 2 * m;
    });
    return true;
  }

  function makeJelly(li, size) {
    const L = LAYERS[li];
    const nSt = irand(L.st[0], L.st[1]);
    const st = [];
    for (let k = 0; k < nSt; k++) {
      const f = nSt === 1 ? 0.5 : k / (nSt - 1);
      const ax = (f * 2 - 1) * 0.33 + rand(-0.03, 0.03);
      st.push({
        ax, ay: 0.232, n: L.nodes,
        len: rand(1.0, 1.5) * (1 - Math.abs(ax) * 0.4),
        wf: rand(0.85, 1.15),
        w: rand(1.5, 2.4), k: rand(0.75, 1.1), amp: rand(0.2, 0.34), ph: rand(0, TAU),
        bend: ax * 0.5 + rand(-0.08, 0.08),
        nodes: new Float32Array(L.nodes * 2), grow: 1,
      });
    }
    return {
      li, size, drawSize: size, x: 0, y: 0, vx: 0, vy: 0, sx: 0, sy: 0,
      a: rand(-0.3, 0.3), hs: rand(0.86, 1.08),
      T: rand(2.3, 3.5) * L.tempo, ph: Math.random(), s: 0, sp: 0, sh: 0, shv: 0, boost: 0,
      seed: rand(0, 100), ws: rand(0.6, 1.4), wb: rand(-0.2, 0.2),
      st, sepx: 0, sepy: 0, alx: 0, aly: 0,
      fear: 0, look: 0, lookAt: Infinity, lookEnd: Infinity, looked: false,
      bp: 0, smart: 0, brainAt: Infinity, brainEnd: Infinity, closing: 0, blinkAt: 0, blinkT: -9, groove: 0,
      alpha: 1, fadeAt: -1, fadeOut: false,
      // behind words: how dimmed (smoothed), the way out, the side it prefers when dead centre, and its drawn alpha
      dim: 0, ex: 0, ey: 0, side: Math.random() < 0.5 ? -1 : 1, va: 0,
      husk: null,
    };
  }
  function initStreamers(j) {
    const c = Math.cos(j.a), s = Math.sin(j.a);
    for (const st of j.st) {
      const lx = st.ax * j.drawSize, ly = st.ay * j.hs * j.drawSize;
      const rx = j.x + lx * c - ly * s, ry = j.y + lx * s + ly * c;
      const seg = (st.len * j.drawSize * Math.max(0.04, st.grow)) / (st.n - 1);
      for (let i = 0; i < st.n; i++) { st.nodes[i * 2] = rx - s * seg * i; st.nodes[i * 2 + 1] = ry + c * seg * i; }
    }
  }
  function place(j) {
    const s = lay[j.li];
    j.sx = mod(j.x + s.ox + s.m, s.ww) - s.m;
    j.sy = mod(j.y + s.oy + s.m, s.wh) - s.m;
  }
  function addJ(j) { jellies.push(j); byLayer[j.li].push(j); }
  function removeJ(j) {
    const i = jellies.indexOf(j); if (i >= 0) jellies.splice(i, 1);
    const b = byLayer[j.li], k = b.indexOf(j); if (k >= 0) b.splice(k, 1);
  }

  // best-candidate placement across the whole wrapped world, so no clumps and no empty bands when scrolling
  function spawn(li, fadeIn) {
    const L = LAYERS[li], s = lay[li];
    const j = makeJelly(li, rand(L.size[0], L.size[1]) * sizeK);
    let bx = 0, by = 0, bd = -1;
    for (let c = 0; c < 14; c++) {
      const x = rand(-s.m, W + s.m), y = rand(-s.m, H + s.m);
      let d = Infinity;
      for (const o of jellies) {
        const k = o.li === li ? 1 : 0.55; // other layers matter less
        let dx = x - o.sx, dy = y - o.sy;
        if (o.li === li) { dx -= s.ww * Math.round(dx / s.ww); dy -= s.wh * Math.round(dy / s.wh); }
        d = Math.min(d, Math.hypot(dx, dy) / k);
      }
      if (d > bd) { bd = d; bx = x; by = y; }
    }
    j.x = bx - s.ox; j.y = by - s.oy;
    place(j);
    initStreamers(j);
    if (fadeIn) { j.alpha = 0; j.fadeAt = fadeIn; }
    addJ(j);
    return j;
  }
  const targetCount = () => clamp(Math.round((W * H) / (mobile ? 23000 : 46000)), 14, 30);
  function populate(fadeIn) {
    const n = targetCount();
    const per = [Math.round(n * LAYERS[0].share), 0, Math.max(2, Math.round(n * LAYERS[2].share))];
    per[1] = n - per[0] - per[2];
    for (let li = 0; li < 3; li++) {
      const live = byLayer[li].filter((j) => !j.fadeOut);
      for (let k = live.length; k < per[li]; k++) spawn(li, fadeIn ? fadeIn + rand(0, 1.3) : 0);
      for (let k = live.length; k > per[li]; k--) live[k - 1].fadeOut = true;
    }
  }

  // ---- the hero: where Turri is on screen ----
  // hero: bell centre (x, y), bell width w, his box (left, right, top = as high as the glass cap lifts during a
  // swap, bottom = tentacle tips), and the bell bottom, in client px.
  // Layout is only read in the loop's read phase (measureHero): his mount and his bell are kept in document px and
  // moved by ctx.scroll.y every frame (heroNow), so the box is exact while scrolling. His swim only moves the bell
  // some 20 px, so near the view it is re-read once a second (four times during a swap ceremony, at once on each swap
  // event); far away nothing is read until the layout changes. The first rect of a frame pays for whatever style and
  // layout the page left pending, so every read saved here is a forced layout saved.
  const heroEl = document.getElementById("hero-jelly");
  const heroDoc = { have: false, l: 0, t: 0, r: 0, b: 0, w: 0, h: 0, bell: false, bx: 0, by: 0, bw: 0, bh: 0 };
  let heroDirty = true, heroReadAt = -9, swapUntil = -1;
  const hero = { x: 0, y: 0, w: 300, left: 0, right: 0, top: 0, bellBottom: 0, bottom: 0, visible: false };
  // the document origin in client px, from the same layout as the rects read beside it
  const docOrigin = () => document.documentElement.getBoundingClientRect();
  function measureHero() {
    heroDoc.have = true;
    heroDoc.w = heroDoc.h = 0;
    heroDoc.bell = false;
    const r = heroEl && heroEl.getBoundingClientRect();
    if (!r || !r.width) return;
    const o = docOrigin();
    heroDoc.l = r.left - o.left; heroDoc.r = r.right - o.left; heroDoc.t = r.top - o.top; heroDoc.b = r.bottom - o.top;
    heroDoc.w = r.width; heroDoc.h = r.height;
    const hj = ctx.heroJelly;
    let br = null;
    try { br = hj && typeof hj.bellRect === "function" ? hj.bellRect() : null; } catch { br = null; }
    if (br && br.width > 4) {
      heroDoc.bell = true;
      heroDoc.bx = br.x - o.left; heroDoc.by = br.y - o.top; heroDoc.bw = br.width; heroDoc.bh = br.height;
    }
  }
  const heroNear = (sy) => !heroDoc.have || (heroDoc.w > 0 && heroDoc.b - sy > -H * 0.5 && heroDoc.t - sy < H * 1.5);
  function heroNow() {
    const sy = scrollTop();
    if (!heroDoc.w) {
      hero.x = W * 0.7; hero.y = -H * 0.4; hero.w = Math.min(W, H) * 0.4; hero.left = W * 0.5; hero.right = W * 0.9;
      hero.top = -H * 0.6; hero.bellBottom = -H * 0.2; hero.bottom = -H * 0.1; hero.visible = false;
      return hero;
    }
    const top = heroDoc.t - sy, bottom = heroDoc.b - sy;
    hero.visible = bottom > 0 && top < H;
    if (heroDoc.bell) {
      const bx = heroDoc.bx, by = heroDoc.by - sy, bw = heroDoc.bw, bh = heroDoc.bh;
      hero.x = bx + bw * 0.5; hero.y = by + bh * 0.5; hero.w = bw;
      hero.left = bx - bw * 0.06; hero.right = bx + bw * 1.06; hero.top = by - bw * 0.25;
      hero.bellBottom = by + bh; hero.bottom = Math.max(bottom, by + bh * 1.5);
      return hero;
    }
    const w = heroDoc.w * 0.62, y = top + heroDoc.h * 0.3;
    hero.x = heroDoc.l + heroDoc.w * 0.5; hero.y = y; hero.w = w;
    hero.left = heroDoc.l + heroDoc.w * 0.16; hero.right = heroDoc.r - heroDoc.w * 0.16;
    hero.top = y - w * 0.57; hero.bellBottom = y + w * 0.3; hero.bottom = bottom;
    return hero;
  }

  // ---- the swap overlay: when Turri is off screen, its pip plays the ceremony and owns the old brain ----
  const swapEl = document.getElementById("swap-overlay");
  const overlayShown = () => !!swapEl && swapEl.classList.contains("is-on");
  const overlayLive = () => overlayShown() && !swapEl.classList.contains("is-leaving");
  function pipRect() { // read phase (or a reduced-motion event) only
    const p = swapEl && swapEl.querySelector(".sw-pip");
    const r = p && p.getBoundingClientRect();
    return r && r.width > 4 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
  }

  // ---- words: where the page has text the crowd should not muddy ----
  // Paragraph-like blocks and the live text columns (the thought stream, the how copy, the journal entries, the ask
  // talk), in document px, padded and merged into a few calm zones. Left out: cards and pages on their own opaque
  // paper (hook cards, the Book of Brains, the aquarium) and display type, which reads fine over anything.
  const ZONE_SEL = "main p, main li, main dd, main dt, main pre, main figcaption, main blockquote, #thoughts, .how__copy, .jr-scrub, .ask__said, .ask__seeds, .abyss__foot";
  const ZONE_SKIP = ".hk-card, .jr-page, .cp-tank, .vlt__peek, .vlt__say, .abyss__line";
  const ZPX = 14, ZPY = 10;
  let zones = [];
  let zonesDirty = true, zonesAt = -9;
  function measureZones() { // read phase (or a reduced-motion event) only
    const o = docOrigin();
    const box = [];
    for (const el of document.querySelectorAll(ZONE_SEL)) {
      if (el.closest(ZONE_SKIP)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      box.push([r.left - o.left - ZPX, r.top - o.top - ZPY, r.right - o.left + ZPX, r.bottom - o.top + ZPY]);
    }
    // overlapping boxes become one, so the paragraphs of a column read as one calm column
    for (let merged = true; merged;) {
      merged = false;
      for (let i = 0; i < box.length; i++) {
        const a = box[i];
        for (let k = box.length - 1; k > i; k--) {
          const b = box[k];
          if (a[0] > b[2] || b[0] > a[2] || a[1] > b[3] || b[1] > a[3]) continue;
          a[0] = Math.min(a[0], b[0]); a[1] = Math.min(a[1], b[1]); a[2] = Math.max(a[2], b[2]); a[3] = Math.max(a[3], b[3]);
          box.splice(k, 1);
          merged = true;
        }
      }
    }
    zones = box.sort((a, b) => a[1] - b[1]);
  }
  // the zones near the view this frame, in client px
  const VZ = new Float32Array(4 * 48);
  let vzN = 0;
  function viewZones(sy) {
    vzN = 0;
    for (const z of zones) {
      const y0 = z[1] - sy, y1 = z[3] - sy;
      if (y1 < -260 || y0 > H + 260) continue;
      const k = vzN * 4;
      VZ[k] = z[0]; VZ[k + 1] = y0; VZ[k + 2] = z[2]; VZ[k + 3] = y1;
      if (++vzN >= 48) break;
    }
  }
  // how much of a jelly (its bell and the top of its streamers) is behind words, and the way out of them:
  // the cheaper way wins, sideways out of a tall column, up (or, low in it, down) out of a short wide paragraph;
  // a column that spans most of the screen (phones) is only left up or down
  function words(j, dt) {
    let cover = 0, ex = 0, ey = 0;
    if (vzN && !j.husk) {
      const size = j.drawSize, hx = size * 0.5, hy = size * 0.6;
      const cx = j.sx, cy = j.sy + size * 0.25, area = 4 * hx * hy;
      for (let i = 0; i < vzN; i++) {
        const k = i * 4, zx0 = VZ[k], zy0 = VZ[k + 1], zx1 = VZ[k + 2], zy1 = VZ[k + 3];
        const ox = Math.min(cx + hx, zx1) - Math.max(cx - hx, zx0);
        if (ox <= 0) continue;
        const oy = Math.min(cy + hy, zy1) - Math.max(cy - hy, zy0);
        if (oy <= 0) continue;
        cover += (ox * oy) / area;
        const zw = zx1 - zx0, zh = zy1 - zy0, zcx = (zx0 + zx1) * 0.5, zcy = (zy0 + zy1) * 0.5;
        const dX = hx + zw * 0.5 - Math.abs(cx - zcx), dY = hy + zh * 0.5 - Math.abs(cy - zcy);
        const wide = zw > W * 0.7;
        const wx = wide ? 0 : 1 / (dX + 24), wy = 1 / (dY + 24);
        const f = smooth(0, size * 0.5 + 10, wide ? dY : Math.min(dX, dY)) / Math.hypot(wx, wy);
        ex += (cx - zcx + j.side * 8 >= 0 ? 1 : -1) * wx * f;
        ey += (cy - zcy > zh * 0.12 ? 1 : -1) * wy * f;
      }
    }
    j.ex = ex; j.ey = ey;
    // steep: a bell that only dips into the last line of a paragraph already fades most of the way
    const c = Math.min(1, cover * 2.4);
    j.dim += (c - j.dim) * (1 - Math.exp(-dt * (c > j.dim ? 4.5 : 2.2)));
  }

  // ---- pointer ----
  let pnx = 0, pny = 0, pLive = false, pOut = false, pMovedAt = -9, lpx = pointer.x, lpy = pointer.y, accl = 1;
  document.documentElement.addEventListener("pointerleave", () => { pOut = true; });
  document.documentElement.addEventListener("pointerenter", () => { pOut = false; });
  function trackPointer(t) {
    if (pointer.x !== lpx || pointer.y !== lpy) { lpx = pointer.x; lpy = pointer.y; pMovedAt = t; pOut = false; }
    pLive = pointer.active && !pOut && (pointer.touch ? pointer.down || t - pMovedAt < 0.8 : true);
    // they get used to a cursor that rests and drift back a little closer
    accl = pointer.touch ? 1 : 0.62 + 0.38 * (1 - smooth(1.5, 6, t - pMovedAt));
  }
  const focus = { x: 0, y: 0 };
  function updateFocus() {
    if (pLive || (pointer.active && !pOut)) { focus.x = pointer.x; focus.y = pointer.y; }
    else if (hero.visible) { focus.x = hero.x; focus.y = hero.y; }
    else { focus.x = W * 0.5; focus.y = H * 0.45; }
  }

  // ---- the chart current: every fee nudges the whole crowd the same way ----
  const cur = { x: 0, y: 0, tx: 0, ty: 0 };
  bus.on("vault", (v) => {
    if (Math.random() > 0.4) return;
    const mag = 4 + Math.min(14, ((v && v.lastFee) || 0.01) * 420);
    cur.tx = (Math.random() < 0.5 ? -1 : 1) * mag;
    cur.ty = rand(-2.5, 2.5);
  });

  // a startle beat: from rest it squeezes at once; mid-beat it hurries to the next one
  function kick(j) {
    if (j.ph > 0.55) { j.ph = 0; j.sp = j.s = squeeze(0); }
    else j.boost = 1;
  }

  // ---- events ----
  let selfRipple = false;
  function onRipple(r) {
    if (!r || selfRipple) return;
    const str = clamp(r.strength == null ? 0.5 : r.strength, 0, 1);
    const R = 140 + 260 * str;
    for (const j of jellies) {
      const dx = j.sx - r.x, dy = j.sy - r.y, d = Math.hypot(dx, dy) || 1;
      if (d > R || j.husk) continue;
      const f = (1 - d / R) * (1 - d / R) * (0.4 + str);
      const L = LAYERS[j.li];
      j.vx += (dx / d) * f * 170 * L.push * sizeK;
      j.vy += (dy / d) * f * 170 * L.push * sizeK;
      j.fear = Math.max(j.fear, Math.min(1, f * 1.4));
      kick(j);
    }
    if (reduced) renderStatic();
  }
  bus.on("ripple", onRipple);
  // touch has no cursor module, so a tap is its own small ripple
  if (pointer.touch) addEventListener("pointerdown", (e) => onRipple({ x: e.clientX, y: e.clientY, strength: 0.45 }), { passive: true });

  // swap: a wave of attention spreads out from Turri; every jelly turns to watch, then they all beat at once
  // (the events come from timers, outside any frame: they use the measured box and ask the read phase for a fresh one)
  bus.on("brain:swap:start", () => {
    const t = nowS();
    if (reduced) measureHero();
    heroNow();
    heroDirty = true;
    swapUntil = t + 14; // the ceremony plus the husk's swim
    for (const j of jellies) {
      if (j.husk) continue;
      const d = Math.hypot(j.sx - hero.x, j.sy - hero.y);
      j.lookAt = t + d / 1100 + rand(0, 0.18);
      j.lookEnd = j.lookAt + 8.5; // failsafe if done never comes
      j.looked = false;
    }
    if (reduced) { for (const j of jellies) { j.look = 1; j.a = lookAngle(j); } renderStatic(); }
  });
  // the old brain leaves Turri. On screen it sinks out of him through his tentacles. When he is off screen the
  // swap pip sinks its own husk out of view, so ours only floats back up from under the edge once that one is gone.
  // Anywhere else (no hero, no pip) nothing appears: a brain never drops into the middle of a section.
  // The pip and Turri are measured in the next read phase (midReq), and the husk set off in the frame after it.
  let riser = null, midReq = null;
  bus.on("brain:swap:mid", (e) => {
    const from = e && e.from != null ? e.from : (ctx.state && ctx.state.version) || 0;
    riser = null;
    if (reduced) { measureHero(); heroNow(); const live = overlayLive(); midNow(from, live, live ? pipRect() : null); return; }
    midReq = { from, at: nowS(), ready: false, live: false, pr: null };
  });
  function midNow(from, live, pr) {
    if (live) {
      if (!pr) return;
      if (reduced) spawnHusk(from, pipPlan(pr));
      else riser = { at: nowS() + 3, from, pr };
      return;
    }
    if (hero.visible && hero.y > -hero.w * 0.25 && hero.y < H * 0.85) spawnHusk(from, surfacePlan);
  }
  bus.on("brain:swap:done", () => {
    const t = nowS();
    if (reduced) measureHero();
    heroNow();
    heroDirty = true;
    zonesDirty = true; // the journal grows a new entry
    for (const j of jellies) {
      if (j.lookAt === Infinity) continue;
      const d = Math.hypot(j.sx - hero.x, j.sy - hero.y);
      j.lookEnd = Math.max(t, j.lookAt + 0.4) + 0.3 + d / 900 + rand(0, 0.12);
    }
    if (reduced) { for (const j of jellies) { j.look = 0; j.lookAt = j.lookEnd = Infinity; j.a = rand(-0.25, 0.25); } renderStatic(); }
  });

  // the brains egg: a wave of tiny brains from the cursor out; ten seconds later they fall out in a wave
  let spin = 1;
  bus.on("egg", (e) => {
    if (!e || e.type !== "brains") return;
    const t = nowS();
    updateFocus();
    spin = Math.random() < 0.5 ? -1 : 1;
    for (const j of jellies) {
      const d = Math.hypot(j.sx - focus.x, j.sy - focus.y);
      if (!(j.bp > 0)) { j.brainAt = t + d / 900 + rand(0, 0.15); j.bp = 0; }
      j.brainEnd = t + 10 + d / 1400 + rand(0, 0.3);
      j.groove = irand(0, Math.max(0, geo.grooves.length - 1));
      j.blinkAt = j.brainAt + rand(1.2, 3);
      j.closing = 0;
    }
    if (reduced) {
      for (const j of jellies) { j.bp = 1; j.brainAt = -Infinity; }
      renderStatic();
      setTimeout(() => { for (const j of jellies) { j.bp = 0; j.brainAt = j.brainEnd = Infinity; } renderStatic(); }, 10000);
    }
  });

  // ---- the husk: the retired brain leaves Turri, relaxes into a bell, loses its ink and joins us ----
  // A plan gives the husk's start (sx, sy) and size, the first leg (ax, ay) while it is still a brain, the second
  // leg (bx, by) it swims as a jelly, its tilt, and the tone it starts in.
  const labels = [];
  // at the surface: re-condense where Turri's old brain faded out, high above the bell, sink straight down behind
  // the bell and through the tentacles (turning crowd-violet inside his box, so it never merges with his ink),
  // then glide out to the open side
  function surfacePlan(size) {
    // the old brain is about half a bell wide; our brain outline spans 0.9 of drawSize
    const size0 = clamp(hero.w * 0.58, size * 1.4, 340 * sizeK);
    let sx = hero.x - hero.w * 0.09, sy = hero.y - hero.w * 0.85;
    sx = clamp(sx, size0 * 0.3, W - size0 * 0.3);
    sy = Math.max(sy, -Math.min(size0 * 0.45, lay[1].m * 0.9));
    let dx0 = hero.x - hero.w * 0.04, dy0 = hero.bellBottom + (hero.bottom - hero.bellBottom) * 0.42;
    if (dy0 < sy + H * 0.25) { dx0 = sx; dy0 = sy + H * 0.45; }
    dx0 = clamp(dx0, size0 * 0.3, W - size0 * 0.3);
    dy0 = clamp(dy0, H * 0.3, H * 0.82);
    const side = dx0 > W * 0.5 ? -1 : 1;
    const tx = clamp(dx0 + side * Math.max(W * 0.28, hero.w * 0.75), W * 0.1, W * 0.9);
    const ty = clamp(dy0 + H * 0.12, H * 0.2, H * 0.88);
    return { sx, sy, size0, ax: dx0 - sx, ay: dy0 - sy, bx: tx - dx0, by: ty - dy0, side, a0: -0.28, lean: side * 0.45, dur: mobile ? 7.5 : 8.5, tone: PAL.ink, inBox: true };
  }
  // the overlay case: the pip has sunk its husk (dimmed ink) out under the bottom edge. Ours floats back up from
  // there, still a dim brain, re-forms into a bell just clear of the edge, takes its first breath and swims in.
  const pipTone = mix3(PAL.deep, PAL.ink, 0.42);
  const pipPlan = (pr) => (size) => {
    const size0 = clamp(pr.width * 0.27, size * 0.85, size * 1.2);
    const side = pr.left + pr.width * 0.5 < W * 0.5 ? 1 : -1; // drifts a little inward as it rises
    const sx = clamp(pr.left + pr.width * (side > 0 ? 0.4 : 0.6), size0 * 0.55, W - size0 * 0.55);
    const sy = H + size0 * 0.62;
    const dx0 = sx + side * size * 0.12, dy0 = H - size * 1.25;
    const tx = dx0 + side * size * (mobile ? 0.45 : 0.5), ty = H * (mobile ? 0.7 : 0.64);
    return { sx, sy, size0, ax: dx0 - sx, ay: dy0 - sy, bx: tx - dx0, by: ty - dy0, side, a0: side * 0.22, lean: side * 0.16, dur: mobile ? 7 : 7.5, tone: pipTone, inBox: false };
  };
  function spawnHusk(from, plan) {
    if (!(from > 0)) return;   // the first brain (at launch) replaces nothing: no old brain joins the crowd
    const li = 1, L = LAYERS[li], s = lay[li];
    const size = rand(L.size[0], L.size[1]) * sizeK;
    const p = plan(size);
    const j = makeJelly(li, size);
    j.x = p.sx - s.ox; j.y = p.sy - s.oy;
    j.a = p.a0;
    j.ph = 0.75; j.s = j.sp = 0;
    j.alpha = 0;
    j.husk = {
      t: 0, dur: p.dur, size0: p.size0, from, side: p.side, a0: p.a0, lean: p.lean, tone: p.tone, inBox: p.inBox,
      ax: p.ax, ay: p.ay, bx: p.bx, by: p.by, ea: 0, eb: 0, m: 0, c: 0, deep: 0, deepT: 0, breathed: false,
    };
    j.drawSize = p.size0;
    for (const st of j.st) st.grow = 0.02;
    place(j);
    initStreamers(j);
    addJ(j);
    labels.push({ j, text: `was v${from}`, t: 0, a: 0, seen: 0, spent: false, side: 0, w: 0, x: -99, y: -99, ck: null, req: null });
    // keep the crowd the same size: the oldest far one sinks out of view
    const far = byLayer[0].filter((o) => !o.fadeOut);
    if (jellies.length > targetCount() + 2 && far.length) far[0].fadeOut = true;
    if (reduced) { j.husk = null; j.alpha = 1; j.drawSize = size; j.x += p.ax + p.bx; j.y += p.ay + p.by; place(j); initStreamers(j); labels.length = 0; renderStatic(); }
  }

  // ---- "was v7": the retired version's name, only where nothing else is ----
  // It waits until the husk is past Turri's tentacle tips (+40 px) and out in the outer fifth of the screen, and
  // never sits under text, drawings, the top bar, the depth gauge or the swap overlay (it lives on the canvas
  // behind the page, so anything there would cut through it). The frame asks (lb.req), the next read phase looks
  // (checkLabels) and the answer holds for 0.2 s or 10 px.
  const LABEL_FONT = `500 ${mobile ? 10 : 11}px "JetBrains Mono", ui-monospace, monospace`;
  const LH = 14;
  const OPEN = new Set(["HTML", "BODY", "MAIN", "SECTION"]);
  function clearAt(x, y) { // read phase only
    const el = document.elementFromPoint(x, y);
    if (!el || OPEN.has(el.tagName)) return true;
    if (el.tagName !== "DIV" && el.tagName !== "svg") return false; // words, links, buttons, drawn shapes, canvases
    for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return false;
    const bg = getComputedStyle(el).backgroundColor;
    return !bg || bg === "transparent" || /,\s*0\)$/.test(bg);
  }
  function clearBox(x, y, w, furniture) { // read phase only
    const x0 = x - 4, x1 = x + w + 4, y0 = y - LH / 2, y1 = y + LH / 2;
    // fixed furniture that ignores the pointer (so elementFromPoint cannot see it)
    for (const r of furniture) {
      if (r.width > 0 && r.right > x0 - 6 && r.left < x1 + 6 && r.bottom > y0 - 6 && r.top < y1 + 6) return false;
    }
    const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, y]];
    for (const [px, py] of pts) if (!clearAt(px, py)) return false;
    return true;
  }
  function checkLabels(t) {
    let furniture = null;
    for (const lb of labels) {
      const q = lb.req;
      if (!q) continue;
      lb.req = null;
      furniture = furniture || Array.from(document.querySelectorAll(".topbar > *, .depth__readout, .depth__label"), (el) => el.getBoundingClientRect());
      for (const side of [-1, 1]) {
        const s = q[side];
        if (s) (lb.ck || (lb.ck = {}))[side] = { t, x: s.x, y: s.y, ok: clearBox(s.x, s.y, lb.w, furniture) };
      }
    }
  }
  function labelSpot(lb, t) {
    const j = lb.j, size = j.drawSize;
    const y = j.sy - size * 0.3, gap = size * 0.55 + 6;
    const xAt = (side) => (side < 0 ? j.sx - gap - lb.w : j.sx + gap);
    const band = lb.a > 0.05 ? 0.23 : 0.2;
    const left = j.sx < W * band, right = j.sx > W * (1 - band);
    if (lb.side) { lb.x = xAt(lb.side); lb.y = y; } // a fading label still follows its jelly
    if (overlayShown() || (!left && !right)) return false;
    if (j.sy - size * 0.5 < hero.bottom + 40) return false; // not until it is clear of Turri's tentacles
    // outward into the page margin when there is room, else inward; the side only changes while it is invisible
    const out = left ? -1 : 1;
    for (const side of lb.a > 0.02 && lb.side ? [lb.side] : [out, -out]) {
      const x = xAt(side);
      if (x < 10 || x + lb.w > W - 44 || y - LH / 2 < 8 || y + LH / 2 > H - 10) continue;
      const ck = lb.ck && lb.ck[side];
      const near = !!ck && Math.abs(ck.x - x) + Math.abs(ck.y - y) <= 10;
      // stale or for another spot: the next read phase looks again; a near answer under half a second old stands
      if (!near || t - ck.t > 0.2) (lb.req || (lb.req = {}))[side] = { x, y };
      if (!near || t - ck.t > 0.5 || !ck.ok) continue;
      lb.side = side; lb.x = x; lb.y = y;
      return true;
    }
    return false;
  }
  function stepLabels(t, dt) {
    for (let i = labels.length - 1; i >= 0; i--) {
      const lb = labels[i];
      lb.t += dt;
      const j = lb.j, alive = jellies.includes(j);
      if (alive && !lb.w) { g.font = LABEL_FONT; lb.w = Math.ceil(g.measureText(lb.text).width); }
      const want = alive && !lb.spent && lb.t < 24 && lb.t > (j.husk ? j.husk.dur * 0.42 : 0) && labelSpot(lb, t);
      if (want && lb.a > 0.6) lb.seen += dt;
      if (lb.seen > 4.5 || (lb.seen > 1 && !want)) lb.spent = true; // shown once, then gone: never blinks on and off
      const on = want && !lb.spent;
      lb.a += ((on ? 1 : 0) - lb.a) * (1 - Math.exp(-dt * (on ? 2.4 : 3.5)));
      if (!alive || ((lb.spent || lb.t >= 24) && lb.a < 0.01)) labels.splice(i, 1);
    }
  }

  function dropBrain(j) {
    drops.push({ x: j.sx, y: j.sy, vx: j.vx * 0.4, vy: 14 + j.vy * 0.3, a: j.a, va: rand(-0.7, 0.7), size: j.drawSize, li: j.li, t: 0, life: 2.6 });
  }

  // ---- simulation ----
  function lookAngle(j) {
    return clamp(Math.atan2(hero.x - j.sx, -(hero.y - j.sy)), -1.2, 1.2);
  }

  function separation() {
    for (let li = 0; li < 3; li++) {
      const b = byLayer[li], s = lay[li];
      for (const j of b) { j.sepx = j.sepy = 0; j.alx = j.aly = 0; }
      for (let i = 0; i < b.length; i++) {
        const A = b[i];
        for (let k = i + 1; k < b.length; k++) {
          const B = b[k];
          let dx = B.x - A.x, dy = B.y - A.y;
          dx -= s.ww * Math.round(dx / s.ww); dy -= s.wh * Math.round(dy / s.wh);
          const d = Math.hypot(dx, dy) || 1;
          const r = (A.drawSize + B.drawSize) * 0.85;
          if (d < r && !A.husk && !B.husk) {
            const f = 1 - d / r;
            A.sepx -= (dx / d) * f; A.sepy -= (dy / d) * f;
            B.sepx += (dx / d) * f; B.sepy += (dy / d) * f;
          }
          if ((A.smart > 0.05 || B.smart > 0.05) && d < r * 3.2) {
            A.alx += Math.sin(B.a); A.aly -= Math.cos(B.a);
            B.alx += Math.sin(A.a); B.aly -= Math.cos(A.a);
          }
        }
      }
      for (const j of b) { const l = Math.hypot(j.alx, j.aly); if (l > 0) { j.alx /= l; j.aly /= l; } }
    }
  }

  // phase coupling while they have brains (Kuramoto mean field): borrowed brains fall into step
  let syncR = 0, syncPsi = 0;
  function syncField() {
    let x = 0, y = 0, w = 0;
    for (const j of jellies) if (j.smart > 0.02) { x += Math.cos(j.ph * TAU) * j.smart; y += Math.sin(j.ph * TAU) * j.smart; w += j.smart; }
    syncR = w > 0 ? Math.hypot(x, y) / w : 0;
    syncPsi = Math.atan2(y, x);
  }

  function stepStreamers(j, t, dt) {
    const c = Math.cos(j.a), s = Math.sin(j.a);
    // hang along the bell's down axis, pulled toward true down by their own weight (more when it hangs still)
    const sag = lerp(0.55, 0.22, smooth(0.08, 0.6, Math.hypot(j.vx, j.vy) / j.drawSize));
    let dx = -s * (1 - sag), dy = c * (1 - sag) + sag;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    const size = j.drawSize;
    const narrow = 1 - 0.17 * j.sh * 0.95;
    const tall = 1 + 0.075 * j.s;
    const waveSpeed = 1 + 1.2 * j.fear;
    for (const st of j.st) {
      const lx = st.ax * narrow * size, ly = st.ay * j.hs * tall * size;
      const N = st.nodes, n = st.n;
      N[0] = j.x + lx * c - ly * s;
      N[1] = j.y + lx * s + ly * c;
      const seg = (st.len * size * st.grow) / (n - 1);
      for (let i = 1; i < n; i++) {
        const u = i / (n - 1);
        const px = N[(i - 1) * 2], py = N[(i - 1) * 2 + 1];
        let vx = N[i * 2] - px, vy = N[i * 2 + 1] - py;
        const l = Math.hypot(vx, vy) || 1;
        vx /= l; vy /= l;
        const w = Math.sin(t * st.w * waveSpeed - i * st.k + st.ph) * st.amp * (0.3 + u) + st.bend * (1 - u * 0.5);
        const cw = Math.cos(w), sw = Math.sin(w);
        const tx = dx * cw - dy * sw, ty = dx * sw + dy * cw;
        const stiff = 1 - Math.exp(-dt * (7 - 4.5 * u)); // roots follow the bell, tips trail
        vx += (tx - vx) * stiff; vy += (ty - vy) * stiff;
        const l2 = Math.hypot(vx, vy) || 1;
        N[i * 2] = px + (vx / l2) * seg;
        N[i * 2 + 1] = py + (vy / l2) * seg;
      }
    }
  }

  function step(j, t, dt) {
    const L = LAYERS[j.li];
    const hk = j.husk;

    // fading in (emergence) and out (retired)
    if (j.fadeAt >= 0 && t >= j.fadeAt) { if (j.alpha === 0) kick(j); j.alpha = Math.min(1, j.alpha + dt / 1.6); if (j.alpha >= 1) j.fadeAt = -1; }
    if (j.fadeOut) { j.alpha -= dt / 2.2; if (j.alpha <= 0) { removeJ(j); return; } }

    // attention during a brain swap
    let lookT = 0;
    if (t >= j.lookAt) {
      if (t < j.lookEnd) { lookT = 1; if (!j.looked) { j.looked = true; kick(j); } }
      else { j.lookAt = j.lookEnd = Infinity; j.looked = false; kick(j); } // released: one beat, all together
    }
    j.look += (lookT - j.look) * (1 - Math.exp(-dt * (lookT > j.look ? 3.4 : 1.5)));

    // borrowed brains
    if (t >= j.brainAt && t < j.brainEnd) j.bp = Math.min(1, j.bp + dt / 0.7);
    else if (j.bp > 0 && t >= j.brainEnd) {
      if (!j.closing) j.closing = t;
      if (t - j.closing > 0.17) { dropBrain(j); j.bp = 0; j.closing = 0; j.brainAt = j.brainEnd = Infinity; }
    }
    j.smart += ((j.bp > 0 ? 1 : 0) - j.smart) * (1 - Math.exp(-dt * 1.8));
    if (j.bp > 0 && t >= j.blinkAt) { j.blinkT = t; j.blinkAt = t + (Math.random() < 0.14 ? 0.24 : rand(2.5, 4.2)); }

    // fear of the cursor
    let ft = 0, fx = 0, fy = 0;
    const calm = hk && hk.t < hk.dur * 0.6;
    if (pLive && !calm) {
      const dx = j.sx - pointer.x, dy = j.sy - pointer.y, d = Math.hypot(dx, dy) || 1;
      const R = L.flee * (mobile ? 0.8 : 1) * accl * (0.75 + j.drawSize / (L.size[1] * sizeK) * 0.25);
      if (d < R) {
        ft = smooth(R, R * 0.3, d);
        fx = dx / d; fy = dy / d;
        const f = (1 - d / R) * (1 - d / R) * L.push * 0.22;
        j.vx += clamp(pointer.vx, -3000, 3000) * f * dt;
        j.vy += clamp(pointer.vy, -3000, 3000) * f * dt;
      }
    }
    ft *= (1 - 0.75 * j.look) * (1 - 0.9 * j.smart);
    if (ft > 0.45 && j.fear < 0.3) kick(j);
    j.fear += (ft - j.fear) * (1 - Math.exp(-dt * (ft > j.fear ? 7 : 0.8)));

    // steering: a slow meander around "up", pushed by neighbours, the cursor, Turri, the brains
    const th = j.wb + 0.5 * Math.sin(t * 0.045 * j.ws + j.seed) + 0.22 * Math.sin(t * 0.11 * j.ws + j.seed * 1.7);
    let dx = Math.sin(th), dy = -Math.cos(th);
    dx += j.sepx * 2; dy += j.sepy * 2;
    if (hero.visible && !hk && j.li > 0) {
      const hx = j.sx - hero.x, hy = j.sy - (hero.y + hero.w * 0.1), hd = Math.hypot(hx, hy) || 1;
      const r = hero.w * 0.6 + j.drawSize * 0.6;
      if (hd < r) {
        const f = 1 - hd / r;
        dx += (hx / hd) * f * 2.5; dy += (hy / hd) * f * 2.5;
        j.vx += (hx / hd) * f * j.size * 0.5 * dt; j.vy += (hy / hd) * f * j.size * 0.5 * dt;
      }
    }
    // words: while the page is still (someone reading), the mid and near ones swim out from behind the text over a
    // few beats. Only an upward way out turns the bell; down is left to the push and its own sinking.
    const wk = L.steer * wordCalm * (1 - j.look) * (1 - j.smart);
    if (wk > 0.01 && !hk && (j.ex || j.ey)) {
      dx += j.ex * 1.5 * wk;
      if (j.ey < 0) dy += j.ey * 1.5 * wk;
      j.vx += j.ex * j.size * 0.45 * wk * dt;
      j.vy += j.ey * j.size * 0.45 * wk * dt;
    }
    if (j.fear > 0.01) { dx += fx * j.fear * 4; dy += fy * j.fear * 4; }
    if (j.smart > 0.01) {
      const ddx = focus.x - j.sx, ddy = focus.y - j.sy, d = Math.hypot(ddx, ddy) || 1;
      const rx = ddx / d, ry = ddy / d, R = L.ring * sizeK;
      const radial = clamp((d - R) / R, -1.2, 1.5);
      dx += (rx * radial * 1.8 - ry * spin * 1.2 + j.alx * 1.1) * j.smart;
      dy += (ry * radial * 1.8 + rx * spin * 1.2 + j.aly * 1.1) * j.smart;
    }
    let target = Math.atan2(dx, -dy);
    const lim = 0.8 + 1.9 * Math.max(j.fear, j.smart);
    target = clamp(target, -lim, lim);
    if (hk) {
      // sinking: settle from the old brain's tilt to upright; gliding away: lean bell-first into the swim
      const k = hk.t / hk.dur;
      target = lerp(hk.a0, 0, smooth(0.05, 0.4, k)) + hk.lean * smooth(0.42, 0.62, k) * (1 - smooth(0.8, 1, k)) + Math.sin(t * 0.9 + j.seed) * 0.06;
    }
    if (j.look > 0.001) target += wrapA(lookAngle(j) - target) * j.look;
    const turn = 0.9 + 3.5 * j.fear + 2.6 * j.look + 1.4 * j.smart;
    j.a += wrapA(target - j.a) * (1 - Math.exp(-dt * turn));

    // the beat
    let rate = (1 / j.T) * (1 + 1.4 * j.fear) * (1 - 0.35 * j.look);
    if (j.smart > 0.02) rate = lerp(rate, 1 / 2.2, j.smart) + (j.smart * 2.4 * syncR * Math.sin(syncPsi - j.ph * TAU)) / TAU;
    if (j.boost > 0) rate *= 1 + 4 * j.boost;
    rate = Math.max(rate, 0.12);
    if (hk && !hk.breathed) { rate = 0; j.ph = 0.75; }
    j.ph += rate * dt;
    if (j.ph >= 1) { j.ph -= 1; j.boost = 0; }
    j.sp = j.s;
    j.s = squeeze(j.ph);
    j.shv += (95 * (j.s - j.sh) - 8.5 * j.shv) * dt; // the margin lags behind the bell and flares
    j.sh += j.shv * dt;

    // thrust only while squeezing, along the bell's axis; a slow sink and drag between beats
    const ds = j.s - j.sp;
    if (ds > 0) {
      const thrust = j.drawSize * 0.55 * L.speed * (1 + 1.1 * j.fear) * (1 - 0.6 * j.look) * (hk ? 0.4 : 1);
      j.vx += Math.sin(j.a) * thrust * ds;
      j.vy -= Math.cos(j.a) * thrust * ds;
    }
    j.vy += j.drawSize * 0.09 * dt;
    j.vx += j.sepx * j.size * 0.7 * dt;
    j.vy += j.sepy * j.size * 0.7 * dt;
    const drag = Math.exp(-dt * 1.5);
    j.vx *= drag; j.vy *= drag;
    const vmax = j.size * 3.5, v = Math.hypot(j.vx, j.vy);
    if (v > vmax) { j.vx *= vmax / v; j.vy *= vmax / v; }
    j.x += (j.vx + cur.x * L.drift) * dt;
    j.y += (j.vy + cur.y * L.drift) * dt;

    // the husk's choreography: an eased path away from Turri while it morphs, shrinks and fades to violet
    if (hk) {
      hk.t += dt;
      const k = clamp(hk.t / hk.dur, 0, 1);
      j.alpha = smooth(0, 0.06, k); // re-condenses where Turri's old brain faded
      const ea = easeInOut(smooth(0, 0.56, k)), eb = easeInOut(smooth(0.44, 1, k));
      j.x += hk.ax * (ea - hk.ea) + hk.bx * (eb - hk.eb);
      j.y += hk.ay * (ea - hk.ea) + hk.by * (eb - hk.eb);
      hk.ea = ea; hk.eb = eb;
      hk.m = easeInOut(smooth(0.4, 0.68, k));
      hk.c = smooth(0.45, 0.92, k);
      // inside Turri's box it is crowd-violet, so it reads through his ink tentacles instead of merging with them;
      // once it has been in there it keeps that tone (no dark flash on the way out)
      if (hk.inBox && hero.visible) {
        const mg = Math.min(j.drawSize * 0.3, 48) + 6;
        const dIn = Math.min(j.sx - hero.left, hero.right - j.sx, j.sy - hero.top, hero.bottom - j.sy);
        if (dIn > -mg) hk.deepT = Math.max(hk.deepT, smooth(-mg, mg, dIn));
      }
      hk.deep += (hk.deepT - hk.deep) * (1 - Math.exp(-dt * 4));
      const sk = smooth(0.4, 0.95, k);
      j.drawSize = lerp(hk.size0, j.size, 1 - (1 - sk) * (1 - sk) * (1 - sk));
      const grow = smooth(0.48, 0.78, k);
      for (const st of j.st) st.grow = Math.max(0.02, grow);
      if (!hk.breathed && k > 0.62) {
        hk.breathed = true;
        j.ph = 0; j.s = j.sp = 0;
        selfRipple = true;
        bus.emit("ripple", { x: j.sx, y: j.sy, strength: 0.3 });
        selfRipple = false;
        bus.emit("sfx", { name: "bubble" });
      }
      if (k >= 1) { j.husk = null; j.drawSize = j.size; }
    }

    stepStreamers(j, t, dt);

    // keep the unwrapped world coordinates small
    const s = lay[j.li];
    const kx = Math.abs(j.x) > 6 * s.ww ? Math.round(j.x / s.ww) * s.ww : 0;
    const ky = Math.abs(j.y) > 6 * s.wh ? Math.round(j.y / s.wh) * s.wh : 0;
    if (kx || ky) {
      j.x -= kx; j.y -= ky;
      for (const st of j.st) for (let i = 0; i < st.n; i++) { st.nodes[i * 2] -= kx; st.nodes[i * 2 + 1] -= ky; }
    }
  }

  // ---- drawing ----
  const BP = new Float32Array(2 * 96);
  const RL = new Float32Array(2 * 64), RR = new Float32Array(2 * 64);

  function closedSmooth(path, P, n) {
    path.moveTo((P[0] + P[2]) * 0.5, (P[1] + P[3]) * 0.5);
    for (let i = 1; i <= n; i++) {
      const k = (i % n) * 2, k2 = ((i + 1) % n) * 2;
      path.quadraticCurveTo(P[k], P[k + 1], (P[k] + P[k2]) * 0.5, (P[k + 1] + P[k2 + 1]) * 0.5);
    }
    path.closePath();
  }

  function bellPath(path, j, t) {
    const tp = geo.tpl[j.li], n = tp.n;
    const size = j.drawSize, c = Math.cos(j.a), s = Math.sin(j.a);
    const sq = j.s, sh = j.sh, hs = j.hs;
    const m = j.husk ? j.husk.m : 1;
    for (let i = 0; i < n; i++) {
      let bx = tp.x[i], by = tp.y[i];
      if (m < 1) { bx = lerp(geo.morphX[i], bx, m); by = lerp(geo.morphY[i], by, m); }
      const v = tp.v[i];
      const narrow = 1 - 0.17 * (sq + (sh - sq) * v) * (0.2 + 0.8 * v);
      let x = bx * narrow + Math.sin(tp.ang[i] * 3 + t * 1.3 + j.seed) * 0.007 * m;
      let y = by * hs * (1 + 0.075 * sq) - 0.035 * sq * (1 - v);
      if (v > 0.72) y += Math.sin(bx * 19 + t * 2.1 + j.seed) * 0.011 * ((v - 0.72) / 0.28) * m;
      x *= size; y *= size;
      BP[i * 2] = j.sx + x * c - y * s;
      BP[i * 2 + 1] = j.sy + x * s + y * c;
    }
    closedSmooth(path, BP, n);
  }

  // a tapered filled ribbon through points; wfn(u) gives the full width along it
  function ribbon(path, N, n, offx, offy, wfn) {
    for (let i = 0; i < n; i++) {
      const i0 = i > 0 ? i - 1 : 0, i1 = i < n - 1 ? i + 1 : n - 1;
      let tx = N[i1 * 2] - N[i0 * 2], ty = N[i1 * 2 + 1] - N[i0 * 2 + 1];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      const hw = 0.5 * wfn(i / (n - 1));
      const x = N[i * 2] + offx, y = N[i * 2 + 1] + offy;
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

  let rw0 = 1, rw1 = 0.6;
  const streamerW = (u) => rw1 + (rw0 - rw1) * Math.pow(1 - u, 0.75);
  function jellyPath(path, j, t) {
    const offx = j.sx - j.x, offy = j.sy - j.y;
    for (const st of j.st) {
      if (st.grow < 0.06) continue;
      rw0 = Math.max(1.1, j.drawSize * 0.036 * st.wf) * (0.4 + 0.6 * st.grow);
      rw1 = 0.55;
      ribbon(path, st.nodes, st.n, offx, offy, streamerW);
    }
    bellPath(path, j, t);
  }

  const onScreen = (j) => { const r = j.drawSize * 1.9; return j.sx > -r && j.sx < W + r && j.sy > -r && j.sy < H + r; };

  // tiny borrowed brains: ink brain, grooves in the bell's own colour, cream eyes that watch the focus
  let gw = 1;
  const grooveW = (u) => gw * (0.3 + 0.7 * Math.sin(Math.PI * u));
  const GP = new Float32Array(2 * 64);
  function brainShapes(j, t, inkP, grooveP, whiteP, pupilP) {
    const sc = easeOutBack(Math.min(1, j.bp)) * TB;
    const size = j.drawSize, c = Math.cos(j.a), s = Math.sin(j.a);
    const bc = geo.brainC;
    const bob = (j.s - j.sh) * 0.02 + 0.012 * j.s;
    const tf = (ux, uy, out, k) => {
      const x = (bc.x + (ux - bc.x) * sc) * size, y = ((bc.y + (uy - bc.y) * sc) * j.hs + bob) * size;
      out[k] = j.sx + x * c - y * s;
      out[k + 1] = j.sy + x * s + y * c;
    };
    const B = geo.brain;
    for (let i = 0; i < B.length; i++) tf(B[i].x, B[i].y, BP, i * 2);
    closedSmooth(inkP, BP, B.length);
    const px = size * sc;
    if (px > 30 && geo.grooves.length) {
      for (const gr of geo.grooves[j.groove % geo.grooves.length]) {
        const n = Math.min(32, gr.pts.length);
        for (let i = 0; i < n; i++) tf(gr.pts[i].x, gr.pts[i].y, GP, i * 2);
        gw = Math.max(0.9, gr.w * px * 0.75);
        ribbon(grooveP, GP, n, 0, 0, grooveW);
      }
    }
    let lid = j.closing ? 1 - smooth(0, 0.15, t - j.closing) : lidAt(t - j.blinkT);
    lid = Math.max(lid, 0.14); // a closed eye keeps a thin cream sliver, like Turri asleep
    for (const e of geo.eyes) {
      tf(e.x, e.y, GP, 0);
      const ex = GP[0], ey = GP[1];
      const rx = Math.max(0.8, e.rx * sc * size), ry0 = Math.max(0.8, e.ry * sc * size);
      const ry = ry0 * lid, rot = e.rot + j.a;
      whiteP.moveTo(ex + rx * Math.cos(rot), ey + rx * Math.sin(rot));
      whiteP.ellipse(ex, ey, rx, ry, rot, 0, TAU);
      if (lid > 0.3) {
        const r = Math.min(rx, ry0), p = r * geo.pupil * Math.min(1, lid * 1.2);
        const fdx = focus.x - ex, fdy = focus.y - ey, fd = Math.hypot(fdx, fdy) || 1;
        const reach = (r - p - r * 0.06) * Math.min(1, fd / 125);
        const qx = ex + (fdx / fd) * reach, qy = ey + (fdy / fd) * reach;
        pupilP.moveTo(qx + p, qy);
        pupilP.arc(qx, qy, p, 0, TAU);
      }
    }
  }

  function fillBrains(li, inkP, grooveP, whiteP, pupilP) {
    g.fillStyle = inkCss; g.fill(inkP);
    g.fillStyle = col.layerCss[li]; g.fill(grooveP);
    g.fillStyle = creamCss; g.fill(whiteP);
    g.fillStyle = inkCss; g.fill(pupilP);
  }
  // (only while the egg lends brains: the paths are made only when a jelly in this layer has one)
  function drawBrains(li, t) {
    let P = null;
    for (const j of byLayer[li]) {
      if (!(j.bp > 0) || j.husk || !(j.va > 0.004)) continue; // va is 0 off screen (set by draw)
      if (j.va < 0.995) { // a dimmed jelly's brain dims with it
        const Q = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
        brainShapes(j, t, Q[0], Q[1], Q[2], Q[3]);
        g.globalAlpha = j.va;
        fillBrains(li, Q[0], Q[1], Q[2], Q[3]);
        g.globalAlpha = 1;
        continue;
      }
      P = P || [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      brainShapes(j, t, P[0], P[1], P[2], P[3]);
    }
    if (P) fillBrains(li, P[0], P[1], P[2], P[3]);
  }

  // Paths go straight into the context (beginPath ... fill), so a frame allocates nothing. Clear jellies of a layer
  // share one fill; the fading and the dimmed (behind words) get one each with their own alpha.
  function draw(t) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    for (let li = 0; li < 3; li++) {
      const dimK = LAYERS[li].dim;
      let any = false, solo = 0;
      g.beginPath();
      for (const j of byLayer[li]) {
        j.va = 0;
        if (j.husk || j.alpha <= 0 || !onScreen(j)) continue;
        j.va = j.alpha * j.alpha * (1 - j.dim * dimK);
        if (j.va < 0.995) { solo++; continue; }
        jellyPath(g, j, t);
        any = true;
      }
      g.fillStyle = col.layerCss[li];
      if (any) g.fill();
      if (solo) {
        for (const j of byLayer[li]) {
          if (!(j.va > 0.004) || j.va >= 0.995) continue;
          g.beginPath();
          jellyPath(g, j, t);
          g.globalAlpha = j.va;
          g.fill();
        }
        g.globalAlpha = 1;
      }
      drawBrains(li, t);
    }
    // husks sit in front while they are leaving Turri: their starting tone (ink, or the pip's dimmed ink),
    // crowd-violet once they have passed through him, the crowd's own colour as they join
    for (const j of jellies) {
      if (!j.husk) continue;
      const hk = j.husk;
      g.beginPath();
      jellyPath(g, j, t);
      g.globalAlpha = j.alpha;
      g.fillStyle = css(mix3(mix3(hk.tone, col.layer[2], hk.deep), col.layer[1], hk.c));
      g.fill();
      const fade = 1 - smooth(0.05, 0.55, j.husk.m);
      if (fade > 0.02) {
        const size = j.drawSize, c = Math.cos(j.a), s = Math.sin(j.a);
        g.beginPath();
        for (const gr of geo.morphGrooves) {
          const n = Math.min(32, gr.pts.length);
          for (let i = 0; i < n; i++) {
            const x = gr.pts[i].x * size, y = gr.pts[i].y * size;
            GP[i * 2] = j.sx + x * c - y * s; GP[i * 2 + 1] = j.sy + x * s + y * c;
          }
          gw = Math.max(0.8, gr.w * size * 0.85 * fade);
          ribbon(g, GP, n, 0, 0, grooveW);
        }
        g.fillStyle = css(mix3(col.bg, col.layer[1], 1 - fade));
        g.fill();
      }
      g.globalAlpha = 1;
    }
    // brains sinking out after the egg
    for (const d of drops) {
      const a = 1 - d.t / d.life;
      if (a <= 0) continue;
      const sc = TB * (1 - 0.25 * (d.t / d.life)), size = d.size, c = Math.cos(d.a), s = Math.sin(d.a);
      const bc = geo.brainC, B = geo.brain;
      for (let i = 0; i < B.length; i++) {
        const x = (B[i].x - bc.x) * sc * size, y = (B[i].y - bc.y) * sc * size;
        BP[i * 2] = d.x + x * c - y * s; BP[i * 2 + 1] = d.y + x * s + y * c;
      }
      g.beginPath();
      closedSmooth(g, BP, B.length);
      g.globalAlpha = a * a;
      g.fillStyle = inkCss;
      g.fill();
    }
    g.globalAlpha = 1;
    // "was v7": the retired version's name beside its jelly, where stepLabels found room for it
    if (labels.length) {
      g.font = LABEL_FONT;
      g.textBaseline = "middle";
      g.textAlign = "left";
      g.fillStyle = creamCss;
      for (const lb of labels) {
        if (lb.a < 0.01) continue;
        g.globalAlpha = lb.a * 0.92;
        g.fillText(lb.text, lb.x, lb.y);
      }
      g.globalAlpha = 1;
    }
  }

  function stepDrops(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.t += dt;
      d.vy += 70 * dt;
      d.vx *= Math.exp(-dt); d.vy *= Math.exp(-dt * 0.6);
      d.x += d.vx * dt; d.y += d.vy * dt; d.a += d.va * dt;
      if (d.t >= d.life) drops.splice(i, 1);
    }
  }

  // ---- loop ----
  // Read phase: every layout read this module makes happens here, before any module writes in the frame. In steady
  // state that is Turri's bell once a second while he is near the view, and nothing at all once he is far away.
  let cost = 0, slowFor = 0, trims = 0, readCost = 0;
  const readStat = { ms: 0, n: 0, max: 0 }; // (the ?perf table times writers only; this is the read phase's share)
  let lastSy = 0, scrollSpeed = 0, wordCalm = 1;
  let pendingSize = null;
  function readPhase(t) {
    const r0 = performance.now();
    const sy = scrollTop();
    if (midReq && !midReq.ready) {
      midReq.live = overlayLive();
      midReq.pr = midReq.live ? pipRect() : null;
      midReq.ready = true;
      heroDirty = true;
    }
    if (heroDirty || (t - heroReadAt > (t < swapUntil ? 0.25 : 1) && heroNear(sy))) { measureHero(); heroReadAt = t; heroDirty = false; }
    if (zonesDirty) { if (t - zonesAt > 0.3) { measureZones(); zonesAt = t; zonesDirty = false; } }
    else if (t - zonesAt > 4 && wordCalm > 0.95) zonesDirty = true; // a slow safety refresh while nobody scrolls
    if (labels.length) checkLabels(t);
    const d = performance.now() - r0;
    readCost += (d - readCost) * 0.05;
    readStat.ms += d; readStat.n++; if (d > readStat.max) readStat.max = d;
  }

  function applySize(w, h) {
    if (!setSize(w, h)) return false;
    populate(started && !reduced ? nowS() : 0);
    if (!started && !reduced) for (const j of jellies) { j.alpha = 0; j.fadeAt = Infinity; }
    return true;
  }

  function frame(t, dt) {
    const c0 = performance.now();
    if (pendingSize) { const p = pendingSize; pendingSize = null; applySize(p.w, p.h); }
    trackPointer(t);
    trackBg();
    const k = 1 - Math.exp(-dt * 2.2);
    const tnx = pointer.touch ? pointer.tx : pLive ? pointer.nx : 0;
    const tny = pointer.touch ? pointer.ty : pLive ? pointer.ny : 0;
    pnx += (tnx - pnx) * k;
    pny += (tny - pny) * k;
    const sy = scrollTop();
    // how fast the page is moving: the crowd only steers out of the text while it is (nearly) still
    const v = Math.abs(sy - lastSy) / Math.max(dt, 1 / 240);
    lastSy = sy;
    scrollSpeed += (v - scrollSpeed) * (1 - Math.exp(-dt * (v > scrollSpeed ? 12 : 3)));
    wordCalm = 1 - smooth(60, 420, scrollSpeed);
    for (let i = 0; i < 3; i++) { lay[i].ox = -pnx * LAYERS[i].px; lay[i].oy = -sy * LAYERS[i].scroll - pny * LAYERS[i].py; }
    heroNow();
    if (midReq && midReq.ready) { const m = midReq; midReq = null; if (nowS() - m.at < 1.2) midNow(m.from, m.live, m.pr); }
    updateFocus();
    cur.x += (cur.tx - cur.x) * (1 - Math.exp(-dt / 3));
    cur.y += (cur.ty - cur.y) * (1 - Math.exp(-dt / 3));
    cur.tx *= Math.exp(-dt / 9); cur.ty *= Math.exp(-dt / 9);

    // (if the reader has gone back up to Turri meanwhile, his own ceremony is the one on screen: skip it)
    if (riser && t >= riser.at) { const r = riser; riser = null; if (overlayShown() || !hero.visible) spawnHusk(r.from, pipPlan(r.pr)); }
    for (const j of jellies) place(j);
    viewZones(sy);
    for (const j of jellies) words(j, dt);
    separation();
    syncField();
    for (let i = jellies.length - 1; i >= 0; i--) step(jellies[i], t, dt);
    for (const j of jellies) place(j);
    stepDrops(dt);
    stepLabels(t, dt);
    draw(t);

    // if the crowd ever costs too much, thin the far layer (twice at most)
    cost = cost * 0.95 + (performance.now() - c0) * 0.05;
    slowFor = cost > 6 ? slowFor + dt : 0;
    if (slowFor > 3 && trims < 2) {
      trims++; slowFor = 0;
      byLayer[0].filter((j) => !j.fadeOut).slice(0, Math.ceil(byLayer[0].length * 0.3)).forEach((j) => (j.fadeOut = true));
    }
  }

  // reduced motion: one still composition, redrawn only when something changes. There is no loop to lend a read
  // phase, so the few rects are read here; it only ever runs on an event (resize, the scroll settling, a swap).
  function renderStatic() {
    const t = nowS();
    for (let i = 0; i < 3; i++) { lay[i].ox = 0; lay[i].oy = 0; }
    measureHero();
    if (zonesDirty) { measureZones(); zonesDirty = false; }
    heroNow();
    updateFocus();
    viewZones(scrollTop());
    for (const j of jellies) { j.alpha = 1; j.fadeAt = -1; j.s = j.sp = j.sh = j.shv = 0; place(j); words(j, 10); }
    for (let it = 0; it < 45; it++) for (const j of jellies) stepStreamers(j, t, 1 / 30);
    draw(t);
  }

  // ---- boot ----
  setSize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight); // (boot: the one read outside a read phase)
  trackBg(true);
  const t0 = nowS();
  let started = false;
  function start() {
    if (started) return;
    started = true;
    if (reduced) return renderStatic();
    // the crowd emerges from the water in a loose stagger as the loader lets go
    const t = nowS();
    for (const j of jellies) { j.alpha = 0; j.fadeAt = t + rand(0, 1.4); }
  }
  populate(0);
  // settle the streamers and scatter the beat phases before anyone sees them
  if (!reduced) {
    for (let i = 0; i < 3; i++) lay[i].oy = -scrollTop() * LAYERS[i].scroll;
    for (let f = 0; f < 90; f++) {
      const t = t0 - 1.5 + f / 60;
      separation();
      for (let i = jellies.length - 1; i >= 0; i--) step(jellies[i], t, 1 / 60);
      for (const j of jellies) place(j);
    }
    for (const j of jellies) { j.alpha = 0; j.fadeAt = Infinity; }
    lastSy = scrollTop();
    if (typeof ctx.loop.read === "function") ctx.loop.read(readPhase);
    else ctx.loop.add(readPhase); // (a loop without a read phase: still runs before our own writes)
    ctx.loop.add(frame);
  }

  if (params.has("debug") || params.has("perf")) {
    window.__crowd = {
      jellies, lay, col, labels, readStat,
      get zones() { return zones; }, get hero() { return hero; }, get riser() { return riser; },
      get cost() { return cost; }, get readCost() { return readCost; }, get calm() { return wordCalm; },
    };
  }
  if (params.has("skipLoader")) start();
  else {
    bus.once("loader:done", start);
    setTimeout(start, 5200);
  }

  // ---- when the page moves under us ----
  // Turri and the text are re-measured (next read phase) whenever the layout can have changed: a resize, content
  // arriving or growing (the main column changes size), the fonts landing, the journal gaining an entry.
  let staticQ = 0;
  const relayout = () => {
    heroDirty = true;
    zonesDirty = true;
    if (reduced && started && !staticQ) staticQ = requestAnimationFrame(() => { staticQ = 0; renderStatic(); });
  };
  const mainEl = document.querySelector("main");
  if (mainEl && window.ResizeObserver) new ResizeObserver(relayout).observe(mainEl);
  bus.on("ready", relayout);
  bus.on("loader:done", relayout);
  bus.on("journal:add", relayout);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout, () => {});

  // The canvas box comes from a ResizeObserver (its contentRect costs no layout) and is applied in the next frame;
  // a pixel-ratio change (another screen, zoom) arrives as a window resize with the same box.
  if (reduced) {
    let rz = 0;
    const onResize = () => {
      relayout();
      cancelAnimationFrame(rz);
      rz = requestAnimationFrame(() => {
        applySize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
        trackBg(true);
        renderStatic();
      });
    };
    addEventListener("resize", onResize);
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvas);
    let q = 0;
    bus.on("depth", () => {
      if (q) return;
      q = setTimeout(() => { q = 0; trackBg(true); renderStatic(); }, 150);
    });
  } else {
    const RO = window.ResizeObserver;
    addEventListener("resize", () => {
      relayout();
      if (!RO) pendingSize = { w: innerWidth, h: innerHeight };
      else if (Math.min(devicePixelRatio || 1, 1.5) !== dpr) pendingSize = pendingSize || { w: W, h: H };
    });
    if (RO) new RO((es) => { const r = es[es.length - 1].contentRect; pendingSize = { w: r.width, h: r.height }; }).observe(canvas);
  }
}
