// how (#how-diagram): how I work, drawn as one living ink current that runs through four stations.
//  i.   Trades. Candle jellies bob like a price chart; every trade drips a cream fee into the current.
//  ii.  The glass vault: the vault's own corked jar (js/modules/how/jar.js), sitting in a curl of the current.
//       Where the stream runs under its foot, each fee bubble slips in at the air stone, wobbles up as an
//       ink-rimmed bubble and packs under the cork, the same physics as the vault below. Burns pop the oldest.
//  iii. A new brain. A cream nib dipped in that ink writes my grooves while my eyes follow it.
//       Wet strokes are cream and dry to violet. When the last groove lands the brain ships.
//  iv.  Hooks act. The current splits into three tentacles: burn (embers), reward (pearls sink to
//       holders) and think (bubbles float back up toward the brain).
// The current is scroll-linked: ink floods the route at a finite speed and wakes each station as it
// lands. Bubbles ride it, faster where it narrows; a slow swell travels downstream; the pointer bulges it.
// Live data: vault, brain:countdown, brain:swap:*, hooks:set / hook:add / hook:remove. Emits ripple, sfx.

import { createHowJar, JAR } from "./how/jar.js";
import { setAttr } from "../core/dom.js";

const NS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;
const STEP = 3; // route resample step, px
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const out3 = (t) => 1 - (1 - t) ** 3;
const f1 = (v) => v.toFixed(1);

function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

const dOf = (pts, closed = true) => {
  let s = "";
  for (let i = 0; i < pts.length; i++) s += (i ? "L" : "M") + f1(pts[i].x) + " " + f1(pts[i].y);
  return closed ? s + "Z" : s;
};

// a small hand-made round: a wobbly polygon (never a perfect circle)
function blobStr(x, y, r, ph, wob = 0.07, n = 9) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + ph * 0.3;
    const rr = r * (1 + wob * Math.sin(3 * a + ph) + wob * 0.6 * Math.sin(5 * a - ph * 1.3));
    s += (i ? "L" : "M") + f1(x + Math.cos(a) * rr) + " " + f1(y + Math.sin(a) * rr);
  }
  return s + "Z";
}
// an inked bubble: a ring, heavier at the bottom right (inner contour offset up-left), cut with evenodd
function ringStr(x, y, r, ph) {
  if (r < 2.1) return blobStr(x, y, r, ph, 0.08, 7);
  const t = Math.max(0.8, r * 0.3), n = r > 5 ? 12 : 9;
  return blobStr(x, y, r, ph, 0.07, n) + blobStr(x - t * 0.28, y - t * 0.34, r - t, ph + 1.7, 0.05, n);
}
// a falling drop: round below, pulled to a point above
function dropStr(x, y, r) {
  let s = "";
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU;
    const up = Math.max(0, -Math.sin(a));
    const rr = r * (1 + 0.9 * up ** 4);
    s += (i ? "L" : "M") + f1(x + Math.cos(a) * r * (1 - 0.35 * up ** 2)) + " " + f1(y + Math.sin(a) * rr);
  }
  return s + "Z";
}

const mixHex = (a, b, t) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(",")})`;
};

const fmtClock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export function init(ctx) {
  const { bus, loop, pointer, scroll, ink, assets, config, state, reduced, params } = ctx;
  const mount = document.getElementById("how-diagram");
  if (!mount) return;
  const JB = assets?.jelly?.brain;
  const P = ink.P;
  const cs = getComputedStyle(document.documentElement);
  const FIELD = (cs.getPropertyValue("--field").trim() || "#8b63f5").slice(0, 7);
  const CREAM = (cs.getPropertyValue("--cream").trim() || "#fdf1d8").slice(0, 7);
  const forceFill = params?.has?.("howfill") ? clamp(parseFloat(params.get("howfill")) || 1) : null;
  const R0 = rng(4012);

  // ---------- copy ----------
  // before the first brain (live feed, version 0) there is no version to name and no clock to run
  const brainTag = (v) => (v > 0 ? `brain v${v}` : "first brain");
  const hooksNote = () => {
    const n = state.hooks.length, waiting = state.hooks.some((h) => h.planned);
    return `${n} ${waiting ? "at launch" : "live"}`;
  };
  const COPY = [
    { n: "i.", k: "pump.fun", v: "listening", line: "You trade $TRXE on pump.fun. Every trade pays a small creator fee." },
    { n: "ii.", k: "glass vault", v: `${state.vault.feesSol.toFixed(4)} SOL`, line: "The fee floats up into my vault, a program on Solana. No wallet in between. Anyone can watch it fill." },
    { n: "iii.", k: brainTag(state.version), v: state.version > 0 ? "" : "at launch", line: `Every ${config.brainMinutes} minutes I write a new brain, the code that spends the vault, and deploy it. Same coin, same address.` },
    { n: "iv.", k: "hooks", v: hooksNote(), line: "Then my tentacles get to work. They burn, reward holders and pay for my thinking." },
  ];

  const wrap = document.createElement("div");
  wrap.className = "how";
  wrap.setAttribute("role", "list");
  mount.appendChild(wrap);

  const svg = el("svg", { class: "how__svg", "aria-hidden": "true", focusable: "false" }, wrap);
  const defs = el("defs", null, svg);

  const routeEl = el("path", { class: "how__route" }, svg);
  const curEl = el("path", { class: "how__ink how__current" }, svg);
  const glintEl = el("path", { class: "how__cream how__glint" }, svg);
  const bubEl = el("path", { class: "how__cream how__bubbles", "fill-rule": "evenodd" }, svg);

  // station i: candle jellies
  const s1 = el("g", { class: "how__st" }, svg);
  const priceEl = el("path", { class: "how__cream how__price" }, s1);
  const candleLayer = el("g", null, s1);
  // station ii: the glass vault, the same jar as the vault below (jar units, scaled per layout)
  const s2 = el("g", { class: "how__st" }, svg);
  const jarPose = el("g", null, s2);
  const jarG = el("g", null, jarPose);
  const vj = createHowJar(jarG, { ink, defs, clipId: "how-jar-clip", reduced, mobile: ctx.mobile });
  // station iii: the brain and the nib
  const s3 = el("g", { class: "how__st" }, svg);
  const bellG = el("g", null, s3);
  const bellOut = el("path", { class: "how__ink" }, bellG);
  const bellIn = el("path", { class: "how__glass" }, bellG);
  const brainG = el("g", null, bellG);
  const bellGlint = el("path", { class: "how__cream how__jarglint" }, bellG);
  const brainBody = el("path", { class: "how__ink" }, brainG);
  const grooveEls = (JB?.grooves?.[0] ?? []).map(() => el("path", { class: "how__groove" }, brainG));
  const eyes = (JB?.eyes ?? []).map((e) => {
    const g = el("g", null, brainG);
    el("ellipse", { cx: e.x, cy: e.y, rx: e.rx, ry: e.ry, transform: `rotate(${e.rot} ${e.x} ${e.y})`, class: "how__cream" }, g);
    const pupil = el("circle", { cx: e.x, cy: e.y, r: (Math.min(e.rx, e.ry) * (JB.pupil ?? 0.47)).toFixed(1), class: "how__ink" }, g);
    return { ...e, g, pupil, lx: 0, ly: 0.3 };
  });
  const stampEl = el("text", { class: "how__stamp", "text-anchor": "start" }, s3);
  const nibG = el("g", { class: "how__nib" }, s3);
  const nibBody = el("path", { class: "how__ink" }, nibG);
  const nibShine = el("path", { class: "how__cream" }, nibG);
  const nibHead = el("path", { class: "how__cream" }, nibG);
  const nibSlit = el("path", { class: "how__ink" }, nibG);
  // station iv: three tentacles
  const s4 = el("g", { class: "how__st" }, svg);
  const tentEls = [0, 1, 2].map(() => el("path", { class: "how__ink" }, s4));
  const knotEl = el("path", { class: "how__ink" }, s4);
  const labEls = ["burn", "reward", "think"].map((t) => { const e = el("text", { class: "how__lab" }, s4); e.textContent = t; return e; });
  // effects on top: drops, embers, pearls, pops
  const fxEl = el("path", { class: "how__cream how__fx", "fill-rule": "evenodd" }, svg);

  const copyEls = COPY.map((c, i) => {
    const d = document.createElement("div");
    d.className = `how__copy how__copy--${i + 1}`;
    d.setAttribute("role", "listitem");
    const words = c.line.split(" ").map((w, j) => `<span class="how__w" style="--i:${j}">${w}</span>`).join(" ");
    d.innerHTML = `<p class="how__tag"><span class="how__n">${c.n}</span><span class="how__k">${c.k}</span><span class="how__v">${c.v}</span></p><p class="how__line">${words}</p>`;
    wrap.appendChild(d);
    return d;
  });
  const tagK = copyEls.map((d) => d.querySelector(".how__k"));
  const tagV = copyEls.map((d) => d.querySelector(".how__v"));
  const setTag = (i, txt, kick = true) => {
    const e = tagV[i];
    if (!e || e.textContent === txt) return;
    e.textContent = txt;
    if (kick && !reduced && visible && e.animate) e.animate([{ opacity: 0.25, transform: "translateY(-4px)" }, { opacity: 1, transform: "none" }], { duration: 700, easing: "cubic-bezier(.34,1.56,.64,1)" });
  };

  // ---------- layout ----------
  let L = null;            // geometry for the current width
  let copyH = [];          // copy heights the mobile layout was built for
  const R = { n: 0 };      // the current's centre line
  let Wd = new Float32Array(4);
  let GL = [];             // glint segments on the current
  let wrapTop = 0;         // wrap top in page coordinates
  let FULL = 1, GROW = 160;

  function layout() {
    const Wc = Math.round(mount.clientWidth);
    if (!Wc) return false;
    const mob = Wc < 720;
    const k = mob ? clamp(Wc / 400, 0.8, 1) : clamp(Wc / 1200, 0.82, 1.08);
    const o = { W: Wc, mob, k };
    o.w0 = (mob ? 15 : 20) * k;
    // the vault's jar in jar units, scaled; extents are relative to the station centre
    const js = (mob ? 0.37 : 0.5) * k;
    o.jar = { s: js, top: (JAR.top - JAR.mid) * js, bot: (JAR.bottom - JAR.mid) * js, hw: JAR.half * js };
    o.nC = mob ? 6 : 7;
    o.sB = ((mob ? 236 : 300) * k) / 554; // the glass bell's scale; the brain sits inside it
    const { top: jt, bot: jb, hw } = o.jar;
    o.copy = [];
    if (!mob) {
      o.span = 280 * k;
      const RH = 300 * k;
      o.S1 = P(Wc * 0.2, 96 * k);
      o.S2 = P(Wc * 0.77, o.S1.y + RH + 46 * k);
      o.S3 = P(Wc * 0.25, o.S2.y + RH + 16 * k);
      o.J = P(Wc * 0.74, o.S3.y + RH * 0.8);
      o.H = o.J.y + 260 * k;
      const cw = (f, m) => Math.min(m, Wc * f);
      o.copy = [
        { left: Wc * 0.42, top: o.S1.y - 74 * k, width: cw(0.36, 470) },
        { left: Wc * 0.33, top: o.S2.y - 92 * k, width: cw(0.31, 420) },
        { left: Wc * 0.46, top: o.S3.y - 52 * k, width: cw(0.34, 450) },
        { left: Wc * 0.28, top: o.J.y + 40 * k, width: cw(0.33, 430) },
      ];
      o.wps = [
        P(Wc * 0.03, o.S1.y + 84 * k),
        P(Wc * 0.12, o.S1.y + 94 * k),
        P(Wc * 0.25, o.S1.y + 88 * k),
        P(Wc * 0.36, o.S1.y + 100 * k),
        P(Wc * 0.5, o.S1.y + 146 * k),                // 4
        P(Wc * 0.64, o.S2.y + jt - 50 * k),
        P(o.S2.x - 6 * k, o.S2.y + jt - 40 * k),      // 6: over the cork
        P(o.S2.x + hw + 34 * k, o.S2.y + jt + 18 * k), // round the jar's shoulder, cradling it
        P(o.S2.x + hw + 50 * k, o.S2.y + 24 * k),
        P(o.S2.x + hw + 18 * k, o.S2.y + jb - 8 * k),
        P(o.S2.x, o.S2.y + jb + o.w0 * 0.15),         // 10: under the air stone
        P(o.S2.x - hw - 26 * k, o.S2.y + jb + 8 * k),
        P(Wc * 0.5, o.S2.y + jb + 66 * k),
        P(o.S3.x + 172 * k, o.S3.y - 70 * k),
        P(o.S3.x + 86 * k, o.S3.y - 34 * k),          // 14: into the brain
        P(o.S3.x, o.S3.y),
        P(o.S3.x + 16 * k, o.S3.y + 64 * k),          // 16: out of the brain
        P(o.S3.x + 96 * k, o.S3.y + 142 * k),
        P(Wc * 0.5, o.J.y - 6 * k),
        P(o.J.x - 70 * k, o.J.y - 4 * k),
        P(o.J.x, o.J.y),
      ];
      o.anch = { drip: 4, over: 6, stone: 10, brainIn: 14, brainOut: 16 };
    } else {
      o.span = Math.min(Wc - 80, 270 * k);
      const sx = 13, cl = 36, cwid = Wc - cl - 30; // the depth gauge lives on the right edge
      copyEls.forEach((d) => { d.style.width = `${cwid}px`; });
      const ch = copyEls.map((d) => d.offsetHeight || 110);
      copyH = ch.slice();
      let y = 4;
      o.copy[0] = { left: cl, top: y, width: cwid }; y += ch[0] + 34 * k;
      o.S1 = P(cl + cwid * 0.5, y + 26 * k);
      const gy = o.S1.y + 82 * k;
      y = gy + 44 * k;
      o.copy[1] = { left: cl, top: y, width: cwid }; y += ch[1] + 28 * k;
      const arm = y;                                  // the current crosses over the cork here
      o.S2 = P(cl + cwid * 0.44, arm + 30 * k - jt);
      y = o.S2.y + jb + 48 * k;
      o.copy[2] = { left: cl, top: y, width: cwid }; y += ch[2] + 20 * k;
      o.S3 = P(cl + cwid * 0.54, y + 90 * k);
      y = o.S3.y + 104 * k;
      o.copy[3] = { left: cl, top: y, width: cwid }; y += ch[3] + 14 * k;
      o.J = P(cl + cwid * 0.42, y + 12 * k);
      o.H = o.J.y + 236 * k;
      o.wps = [
        P(o.S1.x + o.span / 2 + 10, gy - 6),
        P(o.S1.x + o.span * 0.18, gy + 2),
        P(o.S1.x - o.span * 0.3, gy - 2),
        P(cl + 2, gy + 14 * k),
        P(sx, gy + 46 * k),
        P(sx, o.copy[1].top + ch[1] * 0.55),          // 5
        P(sx + 8, arm - 10 * k),
        P(cl + 22 * k, arm + 2 * k),
        P(o.S2.x - 6 * k, arm),                       // 8: over the cork
        P(o.S2.x + hw + 24 * k, o.S2.y + jt + 22 * k), // round the jar's shoulder, cradling it
        P(o.S2.x + hw + 34 * k, o.S2.y + 16 * k),
        P(o.S2.x + hw + 8 * k, o.S2.y + jb - 6 * k),
        P(o.S2.x, o.S2.y + jb + o.w0 * 0.15),         // 12: under the air stone
        P(o.S2.x - hw - 18 * k, o.S2.y + jb + 4 * k),
        P(sx + 22, o.S2.y + jb + 30 * k),
        P(sx, o.copy[2].top + ch[2] * 0.55),
        P(sx + 14, o.S3.y - 64 * k),
        P(o.S3.x - 74 * k, o.S3.y - 30 * k),          // 17: into the brain
        P(o.S3.x, o.S3.y),
        P(o.S3.x - 16 * k, o.S3.y + 56 * k),          // 19: out of the brain
        P(sx + 24, o.S3.y + 100 * k),
        P(sx, o.copy[3].top + ch[3] * 0.5),
        P(sx + 18, o.J.y - 22 * k),
        P(o.J.x - 64 * k, o.J.y - 8 * k),
        P(o.J.x, o.J.y),
      ];
      o.anch = { drip: 4, over: 8, stone: 12, brainIn: 17, brainOut: 19 };
    }
    L = o;
    wrap.style.height = `${Math.round(o.H)}px`;
    svg.setAttribute("width", Wc);
    svg.setAttribute("height", Math.round(o.H));
    svg.setAttribute("viewBox", `0 0 ${Wc} ${Math.round(o.H)}`);
    copyEls.forEach((d, i) => {
      const c = o.copy[i];
      d.style.left = `${Math.round(c.left)}px`;
      d.style.top = `${Math.round(c.top)}px`;
      d.style.width = `${Math.round(c.width)}px`;
    });
    buildRoute();
    buildStations();
    measureTop();
    return true;
  }

  function measureTop() { wrapTop = wrap.getBoundingClientRect().top + scrollY; }

  function nearestIdx(p, from = 0, to = R.n - 1) {
    let best = from, bd = Infinity;
    for (let i = from; i <= to; i++) {
      const dx = R.X[i] - p.x, dy = R.Y[i] - p.y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function buildRoute() {
    const pts = ink.resample(ink.spline(L.wps, false, 22), STEP);
    const n = pts.length;
    Object.assign(R, {
      n, X: new Float32Array(n), Y: new Float32Array(n), S: new Float32Array(n), TX: new Float32Array(n), TY: new Float32Array(n),
      YM: new Float32Array(n), BW: new Float32Array(n),
    });
    for (let i = 0; i < n; i++) {
      R.X[i] = pts[i].x; R.Y[i] = pts[i].y;
      R.S[i] = i ? R.S[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) : 0;
      const a = pts[Math.max(0, i - 2)], b = pts[Math.min(n - 1, i + 2)];
      const tl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      R.TX[i] = (b.x - a.x) / tl; R.TY[i] = (b.y - a.y) / tl;
      R.YM[i] = Math.max(i ? R.YM[i - 1] : -Infinity, pts[i].y);
    }
    R.len = R.S[n - 1];
    Wd = new Float32Array(n);
    // anchors along the route
    const A = L.anch;
    R.iDrip = nearestIdx(L.wps[A.drip]);
    R.iOver = nearestIdx(L.wps[A.over]);
    R.iStone = nearestIdx(L.wps[A.stone]);
    R.iBrainIn = nearestIdx(L.wps[A.brainIn]);
    R.iBrainOut = nearestIdx(L.wps[A.brainOut]);
    R.sOver = R.S[R.iOver]; R.sStone = R.S[R.iStone]; R.sBrainIn = R.S[R.iBrainIn]; R.sBrainOut = R.S[R.iBrainOut];
    // base width: a root taper, a pinch where the jar's foot presses the stream, a slight swell between stations
    for (let i = 0; i < n; i++) {
      const s = R.S[i];
      let w = L.w0 * (0.18 + 0.82 * sstep(0, 110 * L.k, s));
      w *= 1 - 0.2 * Math.exp(-(((s - R.sStone) / (40 * L.k)) ** 2));
      w *= 1 + 0.12 * Math.sin((s / R.len) * Math.PI * 5);
      R.BW[i] = w;
    }
    GROW = 170 * L.k;
    FULL = R.len + GROW + 60;
    // the dotted route ahead of the ink (static): small inked dashes, every 13 px
    let d = "";
    const gap = Math.round(13 / STEP), dash = 2;
    for (let i = 4; i + dash < n; i += gap) {
      const ax = R.X[i], ay = R.Y[i], bx = R.X[i + dash], by = R.Y[i + dash];
      const nx = -R.TY[i] * 1.05, ny = R.TX[i] * 1.05;
      d += `M${f1(ax)} ${f1(ay)}L${f1((ax + bx) / 2 + nx)} ${f1((ay + by) / 2 + ny)}L${f1(bx)} ${f1(by)}L${f1((ax + bx) / 2 - nx)} ${f1((ay + by) / 2 - ny)}Z`;
    }
    routeEl.setAttribute("d", d);
    // glint segments: short wet highlights on the up-left side of the current
    GL = [];
    const segLen = Math.round((60 * L.k) / STEP), every = Math.round((150 * L.k) / STEP);
    for (let i = Math.round(30 / STEP); i + segLen < n; i += every) {
      const m = i + (segLen >> 1);
      const nx = -R.TY[m], ny = R.TX[m];
      GL.push({ a: i, b: i + segLen, side: nx * -0.6 + ny * -0.8 > 0 ? 1 : -1 });
    }
  }

  // ---------- station builders ----------
  let CS = null;          // candle shapes
  let candles = [];
  const brain = { v: 0, phase: "rest", g: 0, p: 0, t: 0, shown: [], wet: [], spl: [], full: [], colorSet: [], stamp: 0, stampTxt: "", speed: 1, nib: P(0, 0), nibA: P(0, 0), nibB: P(0, 0), look: P(0, 0.3), blinkT: 2 + R0() * 2, blink: 1, blinkQ: 0, bounce: 0, writtenOnce: false };
  const TENT = [
    { ctrl: [[0, 0], [16, 22], [6, 70], [-26, 118], [-44, 150]], curl: { r0: 3, r1: 11, turns: 0.85, dir: 1 }, lab: [-16, 22, "end"] },
    { ctrl: [[0, 0], [26, 22], [40, 80], [34, 130], [42, 176]], curl: { r0: 3, r1: 10, turns: 0.8, dir: -1 }, lab: [6, 40, "middle"] },
    { ctrl: [[0, 0], [34, 10], [86, 30], [130, 22], [150, -16]], curl: { r0: 2.5, r1: 9, turns: 0.75, dir: -1 }, lab: [20, 2, "start"] },
  ];
  const tips = [P(0, 0), P(0, 0), P(0, 0)];

  function buildStations() {
    const k = L.k;
    // --- candle jellies
    const a = 16 * k, hb = 20 * k;
    const bell = [P(-a, 1.5 * k), P(-a * 0.97, -hb * 0.42), P(-a * 0.72, -hb * 0.86), P(0, -hb), P(a * 0.72, -hb * 0.86), P(a * 0.97, -hb * 0.42),
      P(a, 1.5 * k), P(a * 0.6, 3.6 * k), P(a * 0.22, 1.6 * k), P(-a * 0.22, 3.8 * k), P(-a * 0.62, 1.7 * k)];
    const inner = bell.map((p) => P(p.x * 0.6, p.y * 0.6 - hb * 0.14));
    let stream = "";
    for (const [x, sw] of [[-a * 0.56, 1], [0, -1], [a * 0.56, 1]]) {
      const c = [P(x, 2 * k), P(x - 2.6 * k * sw, 14 * k), P(x + 2.4 * k * sw, 27 * k), P(x - 1.4 * k * sw, 38 * k)];
      stream += ink.brush(ink.spline(c, false, 10), (t) => 3.8 * k * (1 - t) + 0.8);
    }
    CS = {
      a, hb,
      bell: dOf(ink.spline(bell, true, 8)),
      inner: dOf(ink.spline(inner, true, 8)),
      glint: ink.brush(ink.spline([P(-a * 0.66, -hb * 0.36), P(-a * 0.5, -hb * 0.68), P(-a * 0.16, -hb * 0.84)], false, 8), (t) => 0.4 + 1.5 * k * Math.sin(Math.PI * t)),
      stream,
    };
    if (!candles.length) seedCandles();
    candles.forEach(dressCandle);
    // --- the jar: one drawing in jar units; only its scale follows the width
    vj.setScale(L.jar.s);
    jarG.setAttribute("transform", `scale(${L.jar.s.toFixed(4)}) translate(0 ${-JAR.mid})`);
    // --- brain
    if (JB) {
      const BL = assets.jelly.bell;
      bellOut.setAttribute("d", BL.d);
      bellIn.setAttribute("d", BL.inner);
      bellGlint.setAttribute("d", BL.glint);
      brainBody.setAttribute("d", JB.d);
      brain.spl = JB.grooves.map((v) => v.map((g) => ink.spline(g.pts.map(([x, y]) => P(x, y)), false, 5)));
      brain.full = JB.grooves.map((v, vi) => v.map((g, gi) => grooveD(vi, gi, 1)));
      if (!brain.shown.length) { brain.shown = grooveEls.map(() => 1); brain.wet = grooveEls.map(() => -99); }
      grooveEls.forEach((e, gi) => e.setAttribute("d", brain.full[brain.v][gi]));
      brain.colorSet = grooveEls.map(() => "");
      const kn = k * (L.mob ? 0.86 : 1);
      // a cream nib on a black holder; tip at the origin, pointing down (+y)
      nibHead.setAttribute("d", dOf(ink.spline([P(0, 0), P(4.4 * kn, -8 * kn), P(7.2 * kn, -17 * kn), P(7.6 * kn, -25 * kn), P(5.2 * kn, -29 * kn), P(-5.2 * kn, -29 * kn), P(-7.6 * kn, -25 * kn), P(-7.2 * kn, -17 * kn), P(-4.4 * kn, -8 * kn)], true, 6)));
      nibSlit.setAttribute("d", ink.brush([P(0, -3 * kn), P(0, -15 * kn)], (t) => 0.7 + 1 * kn * t) + blobStr(0, -17.5 * kn, 1.9 * kn, 1, 0.05, 7));
      nibBody.setAttribute("d", ink.brush([P(0, -27 * kn), P(0.6 * kn, -60 * kn), P(1.6 * kn, -96 * kn)], (t) => (12.5 - 3.5 * t) * kn));
      nibShine.setAttribute("d", ink.brush([P(-2.4 * kn, -36 * kn), P(-2 * kn, -62 * kn), P(-1.4 * kn, -84 * kn)], (t) => 0.4 + 1.8 * kn * Math.sin(Math.PI * t)));
    }
    // labels
    TENT.forEach((T, i) => labEls[i].setAttribute("text-anchor", T.lab[2]));
    // stations' homes
    s1.setAttribute("transform", `translate(${f1(L.S1.x)} ${f1(L.S1.y)})`);
    s2.setAttribute("transform", `translate(${f1(L.S2.x)} ${f1(L.S2.y)})`);
    s3.setAttribute("transform", `translate(${f1(L.S3.x)} ${f1(L.S3.y)})`);
    s4.setAttribute("transform", `translate(${f1(L.J.x)} ${f1(L.J.y)})`);
    bellG.setAttribute("transform", `scale(${L.sB.toFixed(4)})`);
    brainG.setAttribute("transform", `translate(${BIB.tx} ${BIB.ty}) scale(${BIB.s}) rotate(${BIB.rot})`);
    stampEl.setAttribute("x", f1(L.sB * 214));
    stampEl.setAttribute("y", f1(-L.sB * 168));
    knotEl.setAttribute("d", dOf(ink.spline([P(-L.w0 * 0.75, -2), P(0, -L.w0 * 0.62), P(L.w0 * 0.78, 0), P(L.w0 * 0.3, L.w0 * 0.7), P(-L.w0 * 0.4, L.w0 * 0.66)], true, 8)));
  }

  function grooveD(v, g, frac) {
    const sp = brain.spl[v][g];
    const w = JB.grooves[v][g].w * 0.5;
    const pts = frac >= 1 ? sp : sp.slice(0, Math.max(2, Math.round(sp.length * frac)));
    return ink.brush(pts, (u) => { const tt = clamp(u * Math.min(1, frac)); return 3.5 + (w - 3.5) * Math.sin(Math.PI * (0.06 + tt * 0.88)) ** 0.6; });
  }

  const slotX = (i) => -L.span / 2 + (i * L.span) / (L.nC - 1);
  function newCandle(slot, y, buy) {
    const g = el("g", { class: "how__candle" }, candleLayer);
    const sw = el("g", null, g);
    const c = {
      g, sw, st: el("path", { class: "how__ink" }, sw), bell: el("path", { class: "how__ink" }, g),
      inner: el("path", { class: "how__glass" }, g), glint: el("path", { class: "how__cream" }, g),
      slot, x: L ? slotX(slot) : 0, y, ty: y, buy, ph: R0() * TAU, grow: 1, dead: false, fade: 1, kick: 0,
    };
    if (CS) dressCandle(c);
    return c;
  }
  function dressCandle(c) {
    c.st.setAttribute("d", CS.stream);
    c.bell.setAttribute("d", CS.bell);
    c.inner.setAttribute("d", c.buy ? "" : CS.inner);
    c.glint.setAttribute("d", CS.glint);
    c.x = slotX(c.slot);
  }
  function seedCandles() {
    let y = 0;
    for (let i = 0; i < L.nC; i++) {
      const buy = R0() < 0.58;
      y = clamp(y + (buy ? -1 : 1) * (5 + R0() * 12) * L.k, -22 * L.k, 22 * L.k);
      candles.push(newCandle(i, y, buy));
    }
  }

  // ---------- state ----------
  let visible = false, ready = false;
  let F = 0, Fv = 0, Ft = 0;          // fill length, its speed, its target
  const lit = [0, 0, 0, 0], litOn = [false, false, false, false], bounce = [0, 0, 0, 0];
  const growT = [0, 0, 0];
  let bubbles = [];                    // {s, off, r, v, ph, fee}
  let fx = [];                         // {type, x, y, vx, vy, r, life, max, ph, idx}
  let spawnT = [0, 0, 0], tentT = [0.4, 1.2, 0.2];
  let agit = 0, lastScrollY = scrollY, time = 0;
  let lastVault = { ...state.vault };
  let feeQueue = 0;
  let ptr = { x: -1e4, y: -1e4, in: false };

  // ---------- current ----------
  function widthAt(i, t) {
    const s = R.S[i];
    let w = R.BW[i] * (1 + 0.15 * Math.sin(s * 0.03 - t * 2.8) + 0.06 * Math.sin(s * 0.083 + t * 1.5));
    if (agit > 0.01) w *= 1 + agit * 0.22 * Math.sin(s * 0.11 - t * 8.5);
    const dh = F - s;
    if (dh >= 0 && dh < 120) w *= 1 + 0.2 * Math.exp(-((dh / 26) ** 2)) * (0.5 + clamp(Fv / 400));
    if (ptr.in) {
      const dx = R.X[i] - ptr.x, dy = R.Y[i] - ptr.y, d2 = dx * dx + dy * dy;
      if (d2 < 16000) w *= 1 + 0.42 * Math.exp(-d2 / 2800);
    }
    return w;
  }

  function headIndex(f) {
    let i = clamp(Math.floor(f / STEP), 0, R.n - 1);
    while (i < R.n - 1 && R.S[i + 1] <= f) i++;
    while (i > 0 && R.S[i] > f) i--;
    return i;
  }

  function drawCurrent(t) {
    const f = Math.min(F, R.len);
    if (f < 3) { setAttr(curEl, "d", ""); setAttr(glintEl, "d", ""); return 0; }
    const kh = headIndex(f), i1 = Math.min(R.n - 1, kh + 1);
    for (let i = 0; i <= i1; i++) Wd[i] = widthAt(i, t);
    const u = clamp((f - R.S[kh]) / ((R.S[i1] - R.S[kh]) || 1));
    const hx = lerp(R.X[kh], R.X[i1], u), hy = lerp(R.Y[kh], R.Y[i1], u);
    const tx = R.TX[kh], ty = R.TY[kh], nx = -ty, ny = tx;
    const atEnd = F >= R.len - 0.5;
    const hw = (lerp(Wd[kh], Wd[i1], u) / 2) * (atEnd ? 1 : 1.16 + 0.06 * Math.sin(t * 5.3));
    const el2 = atEnd ? 0.6 : 1 + 0.55 * clamp(Fv / 500) + 0.08 * Math.sin(t * 3.7);
    let d = "";
    for (let i = 0; i <= kh; i++) {
      const w = Wd[i] / 2;
      d += (i ? "L" : "M") + f1(R.X[i] - R.TY[i] * w) + " " + f1(R.Y[i] + R.TX[i] * w);
    }
    for (let j = 0; j <= 10; j++) {
      const a = Math.PI / 2 - (Math.PI * j) / 10;
      d += "L" + f1(hx + tx * Math.cos(a) * hw * el2 + nx * Math.sin(a) * hw) + " " + f1(hy + ty * Math.cos(a) * hw * el2 + ny * Math.sin(a) * hw);
    }
    for (let i = kh; i >= 0; i--) {
      const w = Wd[i] / 2;
      d += "L" + f1(R.X[i] + R.TY[i] * w) + " " + f1(R.Y[i] - R.TX[i] * w);
    }
    const w0 = Wd[0] / 2, t0x = R.TX[0], t0y = R.TY[0];
    for (let j = 1; j < 8; j++) {
      const a = -Math.PI / 2 - (Math.PI * j) / 8;
      d += "L" + f1(R.X[0] + t0x * Math.cos(a) * w0 - t0y * Math.sin(a) * w0) + " " + f1(R.Y[0] + t0y * Math.cos(a) * w0 + t0x * Math.sin(a) * w0);
    }
    setAttr(curEl, "d", d + "Z");
    // wet glints riding one side of the current
    let g = "";
    for (const s of GL) {
      if (s.a >= kh - 3) continue;
      const b = Math.min(s.b, kh - 1);
      let left = "", right = [];
      for (let i = s.a; i <= b; i += 1) {
        const uu = (i - s.a) / (s.b - s.a);
        const ww = Wd[i] * 0.07 * Math.sin(Math.PI * uu) + 0.25;
        const off = Wd[i] * 0.26 * s.side;
        const cx = R.X[i] - R.TY[i] * off, cy = R.Y[i] + R.TX[i] * off;
        left += (left ? "L" : "M") + f1(cx - R.TY[i] * ww) + " " + f1(cy + R.TX[i] * ww);
        right.push(f1(cx + R.TY[i] * ww) + " " + f1(cy - R.TX[i] * ww));
      }
      if (right.length > 2) g += left + "L" + right.reverse().join("L") + "Z";
    }
    setAttr(glintEl, "d", g);
    return kh;
  }

  // ---------- bubbles in the current ----------
  // fee: the SOL amount it carries (0 for plain water bubbles)
  function addBubble(s, fee = 0) {
    if (bubbles.length > 70) return;
    // fees ride the fast middle of the stream, so they reach the jar while you are still looking
    bubbles.push({ s, off: (R0() - 0.5) * (fee ? 0.5 : 0.9), r: fee ? 4.4 * L.k : (1.5 + R0() * 2.1) * L.k, v: (fee ? 84 + R0() * 18 : 40 + R0() * 34) * L.k, ph: R0() * TAU, fee });
  }

  function stepBubbles(dt, t, kh) {
    const f = Math.min(F, R.len);
    // springs: the start and out of the brain (plain water bubbles pass under the jar; only fees go in)
    const srcs = [[0, 0.32, 0], [R.sBrainOut, 0.6, 2]];
    for (const [s0, every, li] of srcs) {
      if (f < s0 + 20 || lit[li] < 0.5) continue;
      spawnT[li] -= dt;
      if (spawnT[li] <= 0) { spawnT[li] = every * (0.5 + R0()); addBubble(s0 + 6 + R0() * 10); }
    }
    let d = "";
    const out = [];
    for (const b of bubbles) {
      const i = clamp(Math.floor(b.s / STEP), 0, R.n - 1);
      const w = Wd[i] || R.BW[i];
      const sWas = b.s;
      b.s += b.v * clamp(L.w0 / Math.max(4, w), 0.6, 2.4) * (1 + agit * 1.5) * dt;
      const sNow = b.s;
      if (sNow >= f - 3) { if (f < R.len - 1) pop(R.X[kh], R.Y[kh], b.r); continue; }
      if (b.fee && sWas < R.sStone && sNow >= R.sStone && lit[1] > 0.4) { drink(b); continue; }
      if (sNow >= R.sBrainIn && sNow < R.sBrainOut) continue;
      if (sNow >= R.len - 4) { if (R0() < 0.35) tentT[(R0() * 3) | 0] = 0; continue; }
      const j = clamp(Math.round(sNow / STEP), 0, R.n - 1);
      const wj = Wd[j] || R.BW[j];
      let off = (b.off + 0.12 * Math.sin(t * 2.2 + b.ph)) * wj * 0.42;
      let x = R.X[j] - R.TY[j] * off, y = R.Y[j] + R.TX[j] * off;
      if (ptr.in) {
        const dx = x - ptr.x, dy = y - ptr.y, d2 = dx * dx + dy * dy;
        if (d2 < 3600) { const p = (1 - d2 / 3600) * 7; const dd = Math.sqrt(d2) || 1; x += (dx / dd) * p; y += (dy / dd) * p; }
      }
      d += ringStr(x, y, b.r * (1 + 0.08 * Math.sin(t * 6 + b.ph)), b.ph + t * 0.6);
      out.push(b);
    }
    bubbles = out;
    setAttr(bubEl, "d", d);
  }

  function pop(x, y, r) { fx.push({ type: "pop", x, y, r: Math.max(2, r), life: 0, max: 0.34 }); }

  // ---------- station i: candle jellies ----------
  function trade(fee) {
    if (!L) return;
    const live = candles.filter((c) => !c.dead);
    const last = live[live.length - 1];
    const buy = R0() < 0.58;
    const y = clamp((last ? last.ty : 0) + (buy ? -1 : 1) * (5 + R0() * 13) * L.k, -22 * L.k, 22 * L.k);
    for (const c of live) { c.slot -= 1; if (c.slot < 0) c.dead = true; }
    const c = newCandle(L.nC - 1, y, buy);
    c.x = slotX(L.nC - 1) + (L.span / (L.nC - 1)) * 0.8;
    c.grow = reduced ? 1 : 0;
    c.kick = 1;
    candles.push(c);
    if (reduced || !visible || lit[0] < 0.5) { feeLanded(); if (reduced || !visible) feeAway(fee); return; }
    // the newest jelly drips its fee into the current below
    const sx = L.S1.x + slotX(L.nC - 1), sy = L.S1.y + y + 30 * L.k;
    const iMax = Math.max(4, R.iDrip);
    let best = 0, bd = Infinity;
    for (let i = 0; i < iMax; i++) { const dd = Math.abs(R.X[i] - sx) + (R.Y[i] < sy ? 1e4 : 0); if (dd < bd) { bd = dd; best = i; } }
    fx.push({ type: "drop", x: sx, y: sy, vx: 0, vy: 20, r: 3.4 * L.k, ty: R.Y[best], idx: best, life: 0, max: 3, fee });
    feeQueue++;
  }

  function stepCandles(dt, t) {
    const pts = [];
    const keep = [];
    const e = 1 - Math.exp(-dt * 4.5);
    for (const c of candles) {
      const tx = slotX(c.slot);
      c.x += (tx - c.x) * e;
      c.grow = Math.min(1, c.grow + dt * 1.4);
      c.kick = Math.max(0, c.kick - dt * 1.3);
      if (c.dead) { c.fade -= dt * 1.4; if (c.fade <= 0) { c.g.remove(); continue; } }
      keep.push(c);
      const bob = reduced ? 0 : Math.sin(t * 1.15 + c.ph) * 2.6 * L.k + (c.dead ? (1 - c.fade) * 26 : 0);
      const ph = ((t * 0.42 + c.ph / TAU) % 1 + 1) % 1;
      const sq = reduced ? 0 : (ph < 0.22 ? out3(ph / 0.22) : Math.exp(-4.6 * (ph - 0.22) / 0.78) * Math.cos((ph - 0.22) * 3.4));
      const g = c.grow < 1 ? 1 + (1.70158 + 1) * (c.grow - 1) ** 3 + 1.70158 * (c.grow - 1) ** 2 : 1;
      const k2 = c.kick * Math.sin(c.kick * 14);
      const sxs = g * (1 + 0.06 * sq + 0.12 * k2), sys = g * (1 - 0.08 * sq - 0.14 * k2);
      const y = c.y + bob - sq * 2.2 * L.k;
      setAttr(c.g, "transform", `translate(${f1(c.x)} ${f1(y)}) scale(${sxs.toFixed(3)} ${sys.toFixed(3)})`);
      setAttr(c.sw, "transform", `skewX(${f1(reduced ? 0 : Math.sin(t * 1.3 + c.ph) * 9 + sq * 6)})`);
      if (c.dead) c.g.style.opacity = c.fade.toFixed(2);
      if (!c.dead && c.grow > 0.5) pts.push(P(c.x, y - CS.hb * 1.35));
    }
    candles = keep;
    // a cream price line across the tops: the chart these jellies make
    if (pts.length > 2) {
      pts.sort((a, b) => a.x - b.x);
      setAttr(priceEl, "d", ink.brush(ink.spline(pts, false, 8), (u) => 0.4 + 1.1 * L.k * Math.sin(Math.PI * u) ** 0.7));
    }
  }

  // ---------- station ii: the glass vault ----------
  // Where the stream runs under the jar's foot, a fee bubble slips in at the air stone and floats up.
  let woke = false, pendAt = 0;
  const pend = [];                     // fees that arrived while the diagram was off screen
  function drink(b) {
    const i = R.iStone;
    pop(R.X[i], R.Y[i], b.r * 0.8);
    vj.spawn(b.fee);
    feeLanded();
  }
  function feeAway(fee) {
    if (reduced) { vj.addPacked(fee); return; }
    if (F < R.sStone) return;          // the stream doesn't reach the jar yet
    if (pend.length < 4) pend.push(fee); else vj.addPacked(fee);
  }
  function feeLanded() {
    if (feeQueue > 0) feeQueue--;
    setTag(1, `${lastVault.feesSol.toFixed(4)} SOL`);
  }

  function stepVault(dt, t) {
    const js = L.jar.s;
    const on = F >= R.sStone + 4 && lit[1] > 0.3;
    if (on && !woke) {
      // the first time the ink runs under it, the stone gulps and the foam shivers
      woke = true;
      if (ready && !reduced) {
        vj.wake();
        const r = wrap.getBoundingClientRect();
        bus.emit("ripple", { x: r.left + R.X[R.iStone], y: r.top + R.Y[R.iStone], strength: 0.35 });
      }
    } else if (woke && F < R.sStone - 40) woke = false;
    if (on && pend.length && t >= pendAt) { vj.spawn(pend.shift()); pendAt = t + 0.55; }
    // the pointer stirs the foam, like a finger on the glass
    let stir = null;
    if (ptr.in && !reduced) {
      const ux = (ptr.x - L.S2.x) / js, uy = (ptr.y - L.S2.y) / js + JAR.mid;
      if (Math.abs(ux) < JAR.half + 40 && uy > JAR.top - 30 && uy < JAR.bottom + 20) stir = { x: ux, y: uy, vx: pointer.vx / js, vy: pointer.vy / js };
    }
    const pose = vj.frame(t, dt, stir);
    setAttr(jarPose, "transform", `translate(0 ${f1(pose.bob * js)}) rotate(${(pose.rot * 57.2958).toFixed(2)} 0 ${f1((JAR.pivot - JAR.mid) * js)})`);
  }

  // ---------- station iii: the brain and the nib ----------
  const BIB = assets?.jelly?.brainInBell ?? { tx: -4, ty: 4, s: 0.56, rot: -4 };
  const bc = Math.cos((BIB.rot * Math.PI) / 180), bsn = Math.sin((BIB.rot * Math.PI) / 180);
  const toLocal = (bx, by) => P(L.sB * (BIB.tx + BIB.s * (bx * bc - by * bsn)), L.sB * (BIB.ty + BIB.s * (bx * bsn + by * bc))); // brain space -> station space
  function grooveDur(g) { const n = brain.spl[brain.v][g].length; return (0.26 + n * 0.0016) / brain.speed; }
  function setPhase(ph) { brain.phase = ph; brain.t = 0; }

  function stepBrain(dt, t) {
    if (!JB) return;
    const G = grooveEls.length;
    brain.t += dt;
    const parkB = P(330, -290);
    const park = toLocal(parkB.x + Math.sin(t * 0.9) * 10, parkB.y + Math.sin(t * 1.3) * 12);
    let nib = park;
    if (reduced) { brain.phase = "rest"; }
    switch (brain.phase) {
      case "rest": // waiting for the ink to arrive
        if (lit[2] > 0.6 && !reduced) setPhase("erase");
        break;
      case "erase": {
        const p = clamp(brain.t / (0.75 / brain.speed));
        for (let g = 0; g < G; g++) brain.shown[g] = Math.min(brain.shown[g], 1 - sstep(g * 0.06, 0.6 + g * 0.06, p));
        if (p >= 1) { brain.v = (brain.v + 1) % JB.grooves.length; brain.g = 0; setPhase("move"); brain.nibA = brain.nib; }
        break;
      }
      case "move": {
        const p = clamp(brain.t / (0.22 / brain.speed));
        const s = brain.spl[brain.v][brain.g][0], b = toLocal(s.x, s.y);
        const e = sstep(0, 1, p);
        nib = P(lerp(brain.nibA.x, b.x, e), lerp(brain.nibA.y, b.y, e) - Math.sin(Math.PI * e) * 14 * L.k);
        if (p >= 1) setPhase("write");
        break;
      }
      case "write": {
        const g = brain.g, p = clamp(brain.t / grooveDur(g));
        brain.shown[g] = p;
        brain.wet[g] = t;
        const sp = brain.spl[brain.v][g], q = sp[Math.max(0, Math.min(sp.length - 1, Math.round((sp.length - 1) * p)))];
        nib = toLocal(q.x, q.y);
        if (p >= 1) {
          brain.g++;
          brain.nibA = nib;
          if (brain.g >= G) { setPhase("ship"); brain.bounce = 1; brain.stamp = 0.001; brain.blinkQ = 2; }
          else setPhase("move");
        }
        break;
      }
      case "ship":
        nib = P(lerp(brain.nibA.x, park.x, sstep(0, 0.6, brain.t)), lerp(brain.nibA.y, park.y, sstep(0, 0.6, brain.t)) - Math.sin(Math.PI * clamp(brain.t / 0.6)) * 18 * L.k);
        if (brain.t > 0.6) setPhase("hold");
        break;
      case "hold":
        if (brain.t > 3.4 / brain.speed) { brain.speed = 1; setPhase("erase"); }
        break;
    }
    if (brain.phase !== "move" && brain.phase !== "write" && brain.phase !== "ship") nib = P(lerp(brain.nib.x, park.x, 1 - Math.exp(-dt * 3)), lerp(brain.nib.y, park.y, 1 - Math.exp(-dt * 3)));
    brain.nib = nib;
    // grooves: partial strokes, wet cream drying to violet
    for (let g = 0; g < G; g++) {
      const sh = brain.shown[g];
      const key = sh >= 1 ? "full" : sh <= 0.001 ? "none" : "";
      const e = grooveEls[g];
      if (key === "full") { if (e._k !== `f${brain.v}`) { setAttr(e, "d", brain.full[brain.v][g]); e._k = `f${brain.v}`; } }
      else if (key === "none") { if (e._k !== "n") { setAttr(e, "d", ""); e._k = "n"; } }
      else { setAttr(e, "d", grooveD(brain.v, g, sh)); e._k = ""; }
      const age = t - brain.wet[g];
      const col = age < 1.6 ? mixHex(CREAM, FIELD, sstep(0.15, 1.5, age)) : "";
      if (col !== brain.colorSet[g]) { e.style.fill = col; brain.colorSet[g] = col; }
    }
    const nibOn = lit[2] > 0.5 && !reduced;
    nibG.style.opacity = nibOn ? "1" : "0";
    const ang = 34 + (brain.phase === "write" ? Math.sin(t * 9) * 4 : Math.sin(t * 1.1) * 3);
    setAttr(nibG, "transform", `translate(${f1(nib.x)} ${f1(nib.y)}) rotate(${f1(ang)})`);
    // eyes: watch the nib while writing, otherwise the pointer, otherwise the copy beside them
    let tgx, tgy;
    if (brain.phase === "write" || brain.phase === "move") { tgx = nib.x; tgy = nib.y; }
    else if (ptr.in || (pointer.active && !pointer.touch)) { tgx = ptr.x - L.S3.x; tgy = ptr.y - L.S3.y; }
    else { tgx = L.mob ? -40 : 260; tgy = 60; }
    for (const e of eyes) {
      const c = toLocal(e.x, e.y);
      const dx = tgx - c.x, dy = tgy - c.y, dist = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, dist / 125);
      const tx = (dx / dist) * reach, ty = (dy / dist) * reach + 0.12;
      const kk = 1 - Math.exp(-dt / 0.055);
      e.lx += (tx - e.lx) * kk; e.ly += (ty - e.ly) * kk;
      const r = Math.min(e.rx, e.ry), pr = r * (JB.pupil ?? 0.47), rr = (r - pr - r * 0.08);
      setAttr(e.pupil, "cx", f1(e.x + e.lx * rr));
      setAttr(e.pupil, "cy", f1(e.y + clamp(e.ly, -1, 1) * rr));
    }
    // blinks: close 92 ms, hold 26 ms, open 185 ms; closed while asleep
    let open = 1;
    if (!reduced) {
      brain.blinkT -= dt;
      if (brain.blinkT <= 0) { brain.blink = 0; brain.blinkT = 2.5 + R0() * 1.7; if (R0() < 0.14 || brain.blinkQ > 0) { brain.blinkQ = Math.max(0, brain.blinkQ - 1); brain.blinkT = 0.24; } }
      brain.blink += dt;
      const b = brain.blink;
      if (b < 0.092) open = 1 - sstep(0, 0.092, b);
      else if (b < 0.118) open = 0;
      else if (b < 0.303) open = out3((b - 0.118) / 0.185);
    }
    const wake = 0.06 + 0.94 * sstep(0.3, 0.95, lit[2]);
    const sy = Math.max(0.06, open * wake);
    for (const e of eyes) setAttr(e.g, "transform", `translate(${e.x} ${e.y}) scale(1 ${sy.toFixed(3)}) translate(${-e.x} ${-e.y})`);
    // the ship stamp
    if (brain.stamp > 0) {
      brain.stamp += dt;
      const s = brain.stamp, inA = sstep(0, 0.35, s), outA = 1 - sstep(3.0, 3.6, s);
      stampEl.style.opacity = (inA * outA).toFixed(2);
      const sc = s < 0.5 ? 1 + 0.5 * (1 - out3(s / 0.5)) * Math.cos(s * 18) : 1;
      setAttr(stampEl, "transform", `rotate(-6) scale(${sc.toFixed(3)})`);
      if (s > 3.6) brain.stamp = 0;
    }
  }

  // ---------- station iv: tentacles at work ----------
  function stepHooks(dt, t) {
    const k = L.k;
    const base = Math.max(0, F - R.len);
    let anyTip = false;
    for (let i = 0; i < 3; i++) {
      const target = clamp((base - i * 22 * k) / GROW);
      growT[i] += (target - growT[i]) * (1 - Math.exp(-dt * 3));
      const g = growT[i];
      const T = TENT[i];
      if (g < 0.02) { setAttr(tentEls[i], "d", ""); labEls[i].style.opacity = "0"; continue; }
      const ctrl = T.ctrl.map(([x, y], j) => {
        const amp = reduced ? 0 : j * 3.2 * k;
        return P(x * k + Math.sin(t * 0.9 + j * 0.8 + i * 2) * amp, y * k + Math.cos(t * 0.75 + j * 0.6 + i) * amp * 0.5);
      });
      let pts = ink.spline(ctrl, false, 14);
      const mainN = pts.length;
      const A = pts[mainN - 2], B = pts[mainN - 1];
      const curlPts = ink.spiral(B, Math.atan2(B.y - A.y, B.x - A.x), T.curl.r0 * k, T.curl.r1 * k * (1 + 0.15 * Math.sin(t * 1.1 + i)), T.curl.turns, T.curl.dir, 2);
      pts = pts.concat(curlPts.slice(1));
      const m = Math.max(3, Math.round(pts.length * out3(g)));
      const vis = pts.slice(0, m);
      const split = mainN / pts.length;
      const w0 = L.w0 * 0.92, w1 = 4.2 * k, we = 1.8 * k;
      setAttr(tentEls[i], "d", ink.brush(vis, (u) => {
        const tt = u * (m / pts.length);
        return tt <= split ? w0 + (w1 - w0) * Math.pow(tt / split, 0.8) : w1 + (we - w1) * ((tt - split) / (1 - split));
      }));
      tips[i] = B;
      if (g > 0.85) anyTip = true;
      setAttr(labEls[i], "x", f1(B.x + T.lab[0] * k));
      setAttr(labEls[i], "y", f1(B.y + T.lab[1] * k));
      labEls[i].style.opacity = sstep(0.7, 1, g).toFixed(2);
    }
    knotEl.style.opacity = F >= R.len - 2 ? "1" : "0";
    if (!anyTip || reduced) return;
    // the work itself
    for (let i = 0; i < 3; i++) {
      tentT[i] -= dt;
      if (tentT[i] > 0 || growT[i] < 0.85) continue;
      const tip = P(L.J.x + tips[i].x, L.J.y + tips[i].y);
      if (i === 0) { tentT[i] = 0.12 + R0() * 0.22; ember(tip, 1 + (R0() < 0.3)); }
      else if (i === 1) { tentT[i] = 1.2 + R0() * 1.2; fx.push({ type: "pearl", x: tip.x, y: tip.y + 6 * k, vx: (R0() - 0.5) * 6, vy: 6, r: (3.6 + R0() * 1.2) * k, life: 0, max: 3.4, ph: R0() * TAU }); }
      else { tentT[i] = 0.32 + R0() * 0.4; fx.push({ type: "think", x: tip.x, y: tip.y - 4 * k, vx: (L.mob ? -10 : -30) * k, vy: -24 * k, r: (2.2 + R0() * 2) * k, life: 0, max: 2.6, ph: R0() * TAU }); }
    }
  }
  function ember(p, n) {
    for (let j = 0; j < n; j++) fx.push({ type: "ember", x: p.x + (R0() - 0.5) * 8, y: p.y - 2, vx: (R0() - 0.5) * 14, vy: -(28 + R0() * 34) * L.k, r: (1.7 + R0() * 2) * L.k, life: 0, max: 1.2 + R0() * 0.8, ph: R0() * TAU });
  }

  // ---------- effects ----------
  function stepFx(dt, t) {
    let d = "";
    const keep = [];
    for (const p of fx) {
      p.life += dt;
      if (p.life > p.max) continue;
      const u = p.life / p.max;
      if (p.type === "drop") {
        p.vy += 520 * dt; p.y += p.vy * dt;
        if (p.y >= p.ty) {
          if (F > R.S[p.idx] + 4) addBubble(R.S[p.idx], p.fee || 0.012); else feeLanded();
          pop(p.x, p.ty, 3);
          continue;
        }
        d += dropStr(p.x, p.y, p.r);
      } else if (p.type === "pop") {
        const rr = p.r * (1 + 1.6 * out3(u));
        if (u < 0.85) d += blobStr(p.x, p.y, rr, p.life * 9, 0.06, 10) + blobStr(p.x, p.y, rr - Math.max(0.5, (1 - u) * 1.4), p.life * 9 + 1, 0.05, 10);
      } else if (p.type === "ember") {
        p.x += (p.vx + Math.sin(t * 9 + p.ph) * 10) * dt; p.y += p.vy * dt; p.vy *= Math.exp(-dt * 0.6);
        const flick = 0.75 + 0.25 * Math.sin(t * 23 + p.ph * 3);
        const rr = p.r * (1 - u) * flick;
        if (rr > 0.35) d += blobStr(p.x, p.y, rr, p.ph + t * 4, 0.14, 6);
      } else if (p.type === "pearl") {
        p.vy += 14 * dt; p.y += p.vy * dt; p.x += (p.vx + Math.sin(t * 1.8 + p.ph) * 5) * dt;
        const rr = p.r * (u < 0.1 ? u / 0.1 : 1 - sstep(0.7, 1, u));
        if (rr > 0.3) d += blobStr(p.x, p.y, rr, p.ph, 0.05, 9);
      } else if (p.type === "think") {
        p.x += (p.vx + Math.sin(t * 2.6 + p.ph) * 8) * dt; p.y += p.vy * dt;
        const rr = p.r * (u < 0.12 ? u / 0.12 : 1 - sstep(0.65, 1, u));
        if (rr > 0.4) d += ringStr(p.x, p.y, rr, p.ph + t);
      }
      keep.push(p);
    }
    fx = keep.length > 160 ? keep.slice(-160) : keep;
    setAttr(fxEl, "d", d);
  }

  // ---------- ignition: when the ink reaches a station ----------
  const anchorS = () => [16, R.sOver - 30 * L.k, R.sBrainIn - 60 * L.k, R.len - 4];
  function stepLit(dt) {
    const A = anchorS();
    const stEls = [s1, s2, s3, s4];
    for (let i = 0; i < 4; i++) {
      const on = F >= A[i];
      if (on && !litOn[i]) {
        litOn[i] = true;
        bounce[i] = 1;
        copyEls[i].classList.add("is-lit");
        if (ready && visible && !reduced) {
          const c = [L.S1, L.S2, L.S3, L.J][i];
          const top = wrapTop - scrollY;
          bus.emit("ripple", { x: wrap.getBoundingClientRect().left + c.x, y: top + c.y, strength: 0.45 });
          bus.emit("sfx", { name: i === 3 ? "chime" : "bubble" });
        }
      } else if (!on && litOn[i] && F < A[i] - 40) litOn[i] = false;
      lit[i] += ((litOn[i] ? 1 : 0) - lit[i]) * (reduced ? 1 : 1 - Math.exp(-dt * 2.6));
      bounce[i] = Math.max(0, bounce[i] - dt * 1.4);
      const op = 0.32 + 0.68 * lit[i];
      if (Math.abs((stEls[i]._op ?? -1) - op) > 0.004) { stEls[i].style.opacity = op.toFixed(3); stEls[i]._op = op; }
      const b = bounce[i], sc = 1 + 0.07 * b * Math.sin((1 - b) * 13);
      const c = [L.S1, L.S2, L.S3, L.J][i];
      setAttr(stEls[i], "transform", `translate(${f1(c.x)} ${f1(c.y)}) scale(${sc.toFixed(4)})`);
    }
    vj.glass.style.fillOpacity = (0.22 + 0.78 * lit[1]).toFixed(3);
  }

  // ---------- scroll target ----------
  function targetFill() {
    if (reduced) return FULL;
    if (forceFill != null) return FULL * forceFill;
    const top = wrapTop - scroll.y;
    const readY = innerHeight * 0.8 - top;
    if (readY <= R.Y[0] - 10) return 0;
    // first point whose running max y passes the reading line
    let lo = 0, hi = R.n - 1;
    if (R.YM[hi] <= readY) return R.len + GROW * clamp((readY - R.YM[hi]) / (150 * L.k)) + 60 * clamp((readY - R.YM[hi] - 150 * L.k) / 100);
    while (lo < hi) { const mid = (lo + hi) >> 1; if (R.YM[mid] > readY) hi = mid; else lo = mid + 1; }
    return R.S[lo];
  }

  // ---------- frame ----------
  let measureClock = 0, topDue = false;
  loop.read(() => { if (topDue) { topDue = false; measureTop(); } });
  function frame(t, dt) {
    if (!L || !visible) return;
    time = t;
    measureClock += dt;
    // re-measure once a second, in the next frame's read phase (a read here, after other writes, forced a layout)
    if (measureClock > 1) { measureClock = 0; topDue = true; }
    const sy = scroll.y;
    const sv = Math.abs(sy - lastScrollY); lastScrollY = sy;
    agit += (clamp(sv / 40) - agit) * (1 - Math.exp(-dt * (sv > 0 ? 6 : 1.5)));
    // pointer in svg space
    const top = wrapTop - sy;
    const left = svgLeft;
    ptr.x = pointer.x - left; ptr.y = pointer.y - top;
    ptr.in = pointer.active && !pointer.touch && ptr.x > -40 && ptr.x < L.W + 40 && ptr.y > -40 && ptr.y < L.H + 40;
    Ft = targetFill();
    const prev = F;
    const diff = Ft - F;
    const maxV = (560 + Math.abs(diff) * 1.4) * L.k;
    F += clamp(diff * (1 - Math.exp(-dt * 3.2)), -maxV * dt, maxV * dt);
    if (Math.abs(diff) < 0.5) F = Ft;
    Fv += ((F - prev) / Math.max(dt, 1e-3) - Fv) * (1 - Math.exp(-dt * 8));
    stepLit(dt);
    const kh = drawCurrent(t);
    stepBubbles(dt, t, kh);
    stepCandles(dt, t);
    stepVault(dt, t);
    stepBrain(dt, t);
    stepHooks(dt, t);
    stepFx(dt, t);
  }

  let svgLeft = 0;
  function measureLeft() { svgLeft = wrap.getBoundingClientRect().left; }

  function still() {
    // reduced motion: one complete, quiet drawing; no loops
    if (!L) return;
    F = FULL;
    for (let i = 0; i < 4; i++) { litOn[i] = true; lit[i] = 1; copyEls[i].classList.add("is-lit"); }
    growT.fill(1);
    stepLit(0);
    const kh = drawCurrent(0);
    // a fixed scatter of bubbles riding the current
    const rnd = rng(7);
    let d = "";
    for (let s = 40; s < R.len - 20; s += 44 + rnd() * 50) {
      if (s > R.sBrainIn && s < R.sBrainOut) continue;
      const j = clamp(Math.round(s / STEP), 0, kh), off = (rnd() - 0.5) * 0.8 * Wd[j] * 0.42;
      d += ringStr(R.X[j] - R.TY[j] * off, R.Y[j] + R.TX[j] * off, (1.6 + rnd() * 2) * L.k, rnd() * 6);
    }
    setAttr(bubEl, "d", d);
    stepCandles(0, 0);
    jarPose.removeAttribute("transform");
    vj.draw(0);
    stepBrain(0, 0);
    stepHooks(1, 0);
    setAttr(fxEl, "d", "");
  }

  // ---------- events ----------
  bus.on("vault", (v) => {
    const burned = v.burnedTokens > lastVault.burnedTokens;
    lastVault = { ...v };
    if (!L) return;
    trade(v.lastFee || 0.012);
    setTag(0, `+${(v.lastFee ?? 0).toFixed(4)} SOL fee`);
    // burns pop the oldest bubble in the jar, as they do in the vault below (quietly when nobody is looking)
    if (burned) vj.burn(1, !visible);
    if (reduced || !visible) { setTag(1, `${v.feesSol.toFixed(4)} SOL`, false); return; }
    if (lit[1] < 0.5) setTag(1, `${v.feesSol.toFixed(4)} SOL`);
    if (burned && growT[0] > 0.85) ember(P(L.J.x + tips[0].x, L.J.y + tips[0].y), 7);
    if (growT[1] > 0.85 && R0() < 0.5) tentT[1] = 0;
  });
  let lastClock = "";
  bus.on("brain:countdown", ({ ms, version }) => {
    const c = version > 0 ? `next in ${fmtClock(ms)}` : "at launch";
    if (c !== lastClock) { lastClock = c; tagV[2].textContent = c; }
    if (tagK[2].textContent !== brainTag(version)) tagK[2].textContent = brainTag(version);
  });
  bus.on("brain:swap:start", ({ to }) => {
    stampEl.textContent = `v${to}`;
    tagV[2].textContent = "writing a new brain";
    lastClock = "";
    if (reduced || !JB) return;
    brain.speed = 1.7;
    if (brain.phase === "hold" || brain.phase === "rest" || brain.phase === "ship") setPhase("erase");
  });
  bus.on("brain:swap:done", ({ version }) => {
    tagK[2].textContent = `brain v${version}`;
    stampEl.textContent = `v${version} live`;
    brain.stamp = reduced ? 0 : 0.001;
    brain.blinkQ = 2;
    stampEl.style.opacity = reduced ? "0" : stampEl.style.opacity;
  });
  const hooksTag = () => setTag(3, hooksNote());
  bus.on("hooks:set", hooksTag);
  bus.on("hook:add", () => { hooksTag(); bounce[3] = 1; tentT[0] = tentT[1] = tentT[2] = 0; });
  bus.on("hook:remove", () => { hooksTag(); bounce[3] = 0.6; });
  bus.on("ready", () => { ready = true; });

  stampEl.textContent = state.version > 0 ? `v${state.version + 1}` : "";
  tagV[2].textContent = `next in ${fmtClock(Math.max(0, state.nextSwapAt - Date.now()))}`;

  // ---------- boot ----------
  layout();
  measureLeft();
  const io = new IntersectionObserver((es) => {
    for (const e of es) visible = e.isIntersecting;
    if (visible) { measureTop(); measureLeft(); }
  }, { rootMargin: "240px 0px" });
  io.observe(wrap);
  let rq = 0;
  const relayout = () => {
    if (rq) return;
    rq = requestAnimationFrame(() => {
      rq = 0;
      const w = Math.round(mount.clientWidth);
      if (L && w === L.W) { measureTop(); measureLeft(); return; }
      layout(); measureLeft();
      if (reduced) still();
    });
  };
  new ResizeObserver(relayout).observe(mount);
  addEventListener("resize", relayout);
  document.fonts?.ready?.then(() => { if (L?.mob) { L.W = -1; relayout(); } });
  // on phones the route threads between the copy blocks, so a late web font that rewraps a line moves it
  const copyRO = new ResizeObserver(() => {
    if (!L?.mob) return;
    if (copyEls.some((d, i) => Math.abs(d.offsetHeight - (copyH[i] ?? d.offsetHeight)) > 1)) { L.W = -1; relayout(); }
  });
  copyEls.forEach((d) => copyRO.observe(d));

  if (reduced) { visible = true; still(); return; }
  loop.add(frame);
}
