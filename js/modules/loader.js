// loader: the brain boot story, about 4 s, click or any key to skip.
// A drop of ink falls through the violet void, rings the surface and plunges. Under water it blooms like ink does,
// its trailing filaments pull back in and the cloud settles into the bell; the glass clears from the middle.
// Tentacles grow from the hem, the glass top lifts and a brain is lowered in. The eyes open and the glint lights
// only once the page and the feed have really arrived (a real percentage, not a timer). The ripple of that first
// look washes the void away, and the jelly swims into the hero's rect, matching the hero's own tentacles node for
// node and its brain groove for groove, so the hand-off at loader:done is invisible.
// Emits: loader:done (once), ripple, sfx. Listens: ready, brain:countdown, thought, loader:done.
import { Streamer } from "./hero-jelly/streamer.js";
import { createBrain } from "./hero-jelly/brain.js";
import {
  clamp, lerp, smoothstep, easeOutCubic, easeInCubic, easeInOutCubic, easeOutBack, ease, r1, rand, hash01,
  parsePts, svgEl, ribbon,
} from "./hero-jelly/util.js";
import { createVoid } from "./loader/void.js";
import { polarSample, polarPath, dropPath, ringPath, dropletPath, blotPath } from "./loader/geo.js";

// hero-jelly's body constants, so this jelly is drawn and moves exactly like the hero
const BELL_TOP = -181, BELL_HEM = 172, PIVOT_Y = -40, CY = -10, ANCHOR_Y = 140, CRACK_Y = -112;
const SUB = 6, CAPN = 6;          // streamer ribbons: spline points per chain segment, points in the tip cap
const NB = 180;                   // rays in the bloom outline
const YS = -300;                  // the water surface, in bell units above the bell's middle
const RD = 15;                    // the drop's radius
const BCX = 0, BCY = -5;          // where the ink gathers: the middle of the bell
const TAU = Math.PI * 2;

// story beats, in seconds
const TL = {
  hit: 0.4, bloom0: 0.58, bloom1: 1.32, cam0: 0.42, cam1: 1.42,
  clear0: 1.32, clear1: 1.7, beat1: 1.44, grow: 1.36,
  cap0: 1.64, brain0: 1.7, brainDur: 0.78, close0: 2.3, seal: 2.54, eyes: 2.6,
  wash: 0.16, fly: 0.58, flyDur: 0.8,
};

export function init(ctx) {
  const el = document.getElementById("loader");
  const { bus, params } = ctx;
  let done = false;
  const emitDone = () => { if (done) return; done = true; bus.emit("loader:done"); };
  const clearOverlay = () => { if (!el) return; el.replaceChildren(); el.className = ""; el.hidden = true; };
  if (!el) { emitDone(); return; }
  if (params.has("skipLoader") || !ctx.assets?.jelly) { clearOverlay(); emitDone(); return; }
  // someone else called it (main.js's 6 s safety net): get out of the way at once
  const debug = params.has("loaderHold") || params.has("loaderFly");   // frozen frames for screenshots
  bus.on("loader:done", () => { if (!done) { done = true; if (!debug) clearOverlay(); } });
  if (ctx.reduced) quiet(ctx, el, emitDone, clearOverlay);
  else story(ctx, el, emitDone, clearOverlay, () => done);
}

// prefers-reduced-motion: no story. The void and one line, gone as soon as the page is ready (0.6 s at most).
function quiet(ctx, el, emitDone, clearOverlay) {
  el.classList.add("ld", "ld--quiet");
  el.innerHTML = `<div class="ld-status is-on"><span class="ld-status__label">installing brain v${ctx.state.version || 0}</span></div>`;
  let ended = false;
  const end = () => { if (ended) return; ended = true; clearOverlay(); emitDone(); };
  ctx.bus.once("ready", () => requestAnimationFrame(end));
  setTimeout(end, 600);
}

function story(ctx, el, emitDone, clearOverlay, isDone) {
  const { bus, pointer, params } = ctx;
  const J = ctx.assets.jelly, ink = ctx.ink, mobile = !!ctx.mobile;
  const version = ctx.state.version || 0;
  const css = getComputedStyle(document.documentElement);
  const tok = (n, f) => css.getPropertyValue(n).trim() || f;

  // ---------- DOM ----------
  el.classList.add("ld");
  const canvas = document.createElement("canvas");
  canvas.className = "ld-void";
  const svg = svgEl("svg", { class: "ld-svg", "aria-hidden": "true", focusable: "false" });
  const status = document.createElement("div");
  status.className = "ld-status";
  status.innerHTML = '<span class="ld-status__label"></span><span class="ld-status__pct">0%</span>';
  const labelEl = status.firstChild, pctEl = status.lastChild;
  const hint = document.createElement("div");
  hint.className = "ld-skip";
  hint.textContent = pointer.touch ? "tap to skip" : "click to skip";
  el.append(canvas, svg, status, hint);
  const voidL = createVoid(canvas, { field: tok("--field", "#8b63f5"), cream: tok("--cream", "#fdf1d8"), ink: tok("--ink", "#0b0b0b") });

  const defs = svgEl("defs", {}, svg);
  // ink in water: fractal noise pushes the bloom's edge around and calms down as the bell takes shape
  const bleed = (id, seed, freq) => {
    const f = svgEl("filter", { id, x: "-35%", y: "-35%", width: "170%", height: "170%" }, defs);
    svgEl("feTurbulence", { type: "fractalNoise", baseFrequency: freq, numOctaves: "2", seed, result: "n" }, f);
    return svgEl("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: "0", xChannelSelector: "R", yChannelSelector: "G" }, f);
  };
  const bloomDisp = bleed("ld-bleed", "7", "0.016");
  const clearDisp = bleed("ld-clear", "3", "0.028");

  // the surface story lives in `scene`; the jelly lives in `world`, which later swims to the hero
  const scene = svgEl("g", {}, svg);
  const surfEl = svgEl("path", { class: "ld-cream" }, scene);
  const ringEls = [0, 1, 2].map(() => svgEl("path", { class: "ld-ink", "fill-rule": "evenodd" }, scene));
  const glintRingEl = svgEl("path", { class: "ld-cream" }, scene);
  const miniEl = svgEl("path", { class: "ld-ink", "fill-rule": "evenodd" }, scene);
  const splashEl = svgEl("path", { class: "ld-ink" }, scene);
  const bloomG = svgEl("g", { filter: "url(#ld-bleed)" }, scene);
  const stemEl = svgEl("path", { class: "ld-ink" }, bloomG);
  const blotEl = svgEl("path", { class: "ld-ink" }, bloomG);
  const satEl = svgEl("path", { class: "ld-ink" }, bloomG);
  const dropEl = svgEl("path", { class: "ld-ink" }, scene);

  const world = svgEl("g", {}, svg);
  const tentG = svgEl("g", {}, world);
  const body = svgEl("g", { display: "none" }, world);
  const glassLo = svgEl("path", { class: "ld-glass" }, body);
  const capG = svgEl("g", { display: "none", "clip-path": "url(#ld-hi)" }, body);
  const capGlass = svgEl("path", { class: "ld-glass" }, capG);
  const capRim = svgEl("path", { class: "ld-ink", "fill-rule": "evenodd" }, capG);
  const brainsG = svgEl("g", {}, body);
  const rimLo = svgEl("path", { class: "ld-ink", "fill-rule": "evenodd" }, body);
  const clearEl = svgEl("path", { class: "ld-glass", filter: "url(#ld-clear)" }, body);
  const glintClip = svgEl("clipPath", { id: "ld-glint", clipPathUnits: "userSpaceOnUse" }, defs);
  const glintRect = svgEl("rect", { x: -320, y: -4, width: 320, height: 0 }, glintClip);
  const glintLo = svgEl("path", { class: "ld-cream", "clip-path": "url(#ld-glint)", display: "none" }, body);
  const crackEl = svgEl("path", { class: "ld-cream", opacity: "0" }, body);

  // ---------- the bell, deformed by the heartbeat exactly like hero-jelly's ----------
  const OUT = parsePts(J.bell.d), IN = parsePts(J.bell.inner), GL = parsePts(J.bell.glint);
  const [HEM_X0, HEM_X1] = J.bell.hemX;
  const RB = polarSample(OUT, BCX, BCY, NB);
  const R = new Float32Array(NB);
  let T = 0, C = 0, wob = 0, hemAmp = 0;
  function precompute(P) {
    const n = P.length / 2, A = new Float32Array(n * 7);
    for (let i = 0; i < n; i++) {
      const x = P[2 * i], y = P[2 * i + 1], a = Math.atan2(y - CY, x);
      A.set([clamp((y - BELL_TOP) / (BELL_HEM - BELL_TOP)), Math.sin(3 * a), Math.cos(3 * a), Math.sin(5 * a), Math.cos(5 * a), Math.sin(x * 0.045), Math.cos(x * 0.045)], i * 7);
    }
    return A;
  }
  const OUT_A = precompute(OUT), IN_A = precompute(IN), GL_A = precompute(GL);
  function bellD(P, A) {
    const c = C, sy = 1 - 0.1 * c;
    const s13 = Math.sin(T * 1.3), c13 = Math.cos(T * 1.3), s19 = Math.sin(T * 1.9), c19 = Math.cos(T * 1.9);
    const s23 = Math.sin(T * 2.3), c23 = Math.cos(T * 2.3);
    let s = "";
    for (let i = 0, j = 0; i < P.length; i += 2, j += 7) {
      const x = P[i], y = P[i + 1], u = A[j], u2 = u * u;
      let X = x * (1 + c * (0.035 + 0.085 * u2));
      let Y = PIVOT_Y + (y - PIVOT_Y) * sy - c * 9 * u2 * u2;
      if (wob) {
        const rr = 1 + wob * (0.6 * (A[j + 1] * c13 + A[j + 2] * s13) + 0.4 * (A[j + 3] * c19 - A[j + 4] * s19));
        X *= rr; Y = CY + (Y - CY) * rr;
      }
      if (u > 0.75 && hemAmp) Y += hemAmp * (A[j + 5] * c23 - A[j + 6] * s23) * (u - 0.75) * 4;
      s += (i ? "L" : "M") + r1(X) + " " + r1(Y);
    }
    return s + "Z";
  }
  const DO = [0, 0];
  function deform(x, y, o) {
    const u = clamp((y - BELL_TOP) / (BELL_HEM - BELL_TOP));
    let X = x * (1 + C * (0.035 + 0.085 * u * u));
    let Y = PIVOT_Y + (y - PIVOT_Y) * (1 - 0.1 * C) - C * 9 * u * u * u * u;
    if (wob) {
      const a = Math.atan2(y - CY, x);
      const rr = 1 + wob * (0.6 * Math.sin(3 * a + T * 1.3) + 0.4 * Math.sin(5 * a - T * 1.9));
      X *= rr; Y = CY + (Y - CY) * rr;
    }
    if (u > 0.75 && hemAmp) Y += hemAmp * Math.sin(x * 0.045 - T * 2.3) * (u - 0.75) * 4;
    o[0] = X; o[1] = Y;
  }
  let bx = 0, by = 0, rot = 0;
  function toWorld(x, y) {
    const a = (rot * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a), dy = y - CY;
    return { x: x * co - dy * si + bx, y: x * si + dy * co + CY + by };
  }
  function anchorWorld(ax) { deform(ax, ANCHOR_Y, DO); return toWorld(DO[0], DO[1]); }

  // the crack the glass opens along (same cut as the hero's swap ceremony)
  const crack = [];
  for (let x = -330; x <= 330; x += 15) crack.push(ink.P(x, CRACK_Y + 7 * Math.sin(x * 0.031 + 0.6) + 4 * Math.sin(x * 0.093 + 2.1) + ((x / 15) % 2 ? 2.5 : -2.5)));
  const crackLine = crack.map((p) => `${p.x} ${p.y.toFixed(1)}`).join(" L ");
  svgEl("path", { d: `M ${crackLine} L 330 700 L -330 700 Z` }, svgEl("clipPath", { id: "ld-lo", clipPathUnits: "userSpaceOnUse" }, defs));
  svgEl("path", { d: `M ${crackLine} L 330 -700 L -330 -700 Z` }, svgEl("clipPath", { id: "ld-hi", clipPathUnits: "userSpaceOnUse" }, defs));
  {
    let cx0 = 0, cx1 = 0;
    for (let i = 0; i < OUT.length; i += 2) {
      const j = (i + 2) % OUT.length, y0 = OUT[i + 1], y1 = OUT[j + 1];
      if ((y0 - CRACK_Y) * (y1 - CRACK_Y) <= 0 && y0 !== y1) {
        const x = OUT[i] + ((CRACK_Y - y0) / (y1 - y0)) * (OUT[j] - OUT[i]);
        cx0 = Math.min(cx0, x); cx1 = Math.max(cx1, x);
      }
    }
    const vis = crack.filter((p) => p.x > cx0 + 2 && p.x < cx1 - 2);
    crackEl.setAttribute("d", ink.brush(ink.spline(vis, false, 4), (t) => 2.5 + 6 * Math.sin(Math.PI * t)));
  }

  // ---------- layout ----------
  let W = 0, H = 0, kL = 1, oxL = 0, oyL = 0, camD = 0, brainY0 = -560;
  function layout() {
    W = innerWidth; H = innerHeight;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    kL = Math.min((W * (mobile ? 0.7 : 0.6)) / 556, (H * 0.84) / 950, 0.95);
    oxL = W / 2;
    oyL = H * (mobile ? 0.44 : 0.5);
    camD = Math.max(0, H * 0.4 - (oyL + YS * kL));          // the camera starts above, at the surface
    brainY0 = Math.min(-420, (-30 - oyL) / kL + 120);         // the brain starts just above the screen
    voidL.resize();
  }
  layout();
  addEventListener("resize", layout);

  // ---------- tentacles: one per live hook, same anchors and personalities as the hero's ----------
  const conf = J.streamers, nodes = mobile ? 12 : 14, reach = mobile ? 1 : 1.2;
  const hooks = (ctx.state.hooks || []).filter((h) => h && h.id);
  const plan = hooks.map((hook, i) => {
    const f = hooks.length === 1 ? 0.5 : (i + 0.5) / hooks.length;
    return { hook, ax: lerp(HEM_X0, HEM_X1, f) + (hash01(hook.id + "x") - 0.5) * (hooks.length > 6 ? 8 : 16), at: 0, on: false };
  });
  plan.slice().sort((a, b) => Math.abs(a.ax) - Math.abs(b.ax)).forEach((p, i) => { p.at = TL.grow + i * 0.07; });
  const streamers = [];
  function growTentacle(p) {
    p.on = true;
    const s = new Streamer(p.hook, { nodes, length: conf.length * reach, w0: conf.w0, w1: conf.w1, grown: false, x: 0, y: ANCHOR_Y });
    const g = svgEl("g", {});
    s.el = svgEl("path", { class: "ld-ink" }, g);
    s.core = svgEl("path", { class: "ld-cream" }, g);
    s.g = g;
    s.ax = s.axTo = p.ax;
    const q = anchorWorld(s.ax);
    for (let i = 0; i < s.n; i++) { s.x[i] = s.px[i] = q.x; s.y[i] = s.py[i] = q.y + i * 0.5; }
    streamers.push(s);
    // paint order like the hero: the middle tentacles in front
    [...streamers].sort((a, b) => Math.abs(b.ax) - Math.abs(a.ax)).forEach((x) => tentG.appendChild(x.g));
  }

  // ---------- the hero, read (never written) so the landing matches it ----------
  const heroSvg = () => { const h = ctx.heroJelly; return h && h.svg && h.svg.isConnected ? h.svg : null; };
  function heroTarget() {
    const hs = heroSvg();
    if (hs) {
      const w = hs.querySelector(".hj-world"), b = hs.querySelector(".hj-body");
      const m = w && w.getScreenCTM();
      if (m && m.a > 0.01) {
        const mm = (b && b.getAttribute("transform") || "").match(/translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)\s*rotate\(([-\d.e]+)/);
        return { k: m.a, x: m.e, y: m.f, bx: mm ? +mm[1] : 0, by: mm ? +mm[2] : 0, rot: mm ? +mm[3] : 0, live: true };
      }
    }
    // no hero instance (?only=...): the same layout maths hero-jelly uses, from its mount
    const r = document.getElementById("hero-jelly")?.getBoundingClientRect();
    if (!r || r.width < 4) return { k: kL, x: oxL, y: -420, bx: 0, by: 0, rot: 0, live: false };
    const k = Math.min((r.width * 0.66) / 556, (r.height * 0.92) / 810);
    return { k, x: r.left + r.width / 2, y: r.top + Math.max(r.height * 0.06, (r.height - 810 * k) / 2) + 190 * k, bx: 0, by: 0, rot: 0, live: false };
  }
  // the hero's tentacle chains, recovered from its ribbon outlines (left edge + right edge, halved = centre line)
  function heroChains() {
    const hs = heroSvg();
    if (!hs) return null;
    const out = [];
    for (const p of hs.querySelectorAll(".hj-tents > .hj-tent > .hj-ink")) {
      const v = (p.getAttribute("d") || "").match(/-?\d*\.?\d+/g);
      if (!v) continue;
      const m = (v.length / 2 - CAPN) / 2, n = (m - 1) / SUB + 1;
      if (!(m > 2) || n !== Math.floor(n) || n !== nodes) continue;   // a falling-off tentacle has another shape
      const xs = new Float32Array(n), ys = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const j = i * SUB, q = m + CAPN + (m - 1 - j);
        xs[i] = (+v[2 * j] + +v[2 * q]) / 2; ys[i] = (+v[2 * j + 1] + +v[2 * q + 1]) / 2;
      }
      out.push({ xs, ys, d: p.getAttribute("d"), core: p.nextElementSibling?.getAttribute("d") || "" });
    }
    return out.sort((a, b) => a.xs[0] - b.xs[0]);
  }
  // which groove variant the hero's brain shows right now (-1 while it is between two)
  function heroVariant() {
    const hs = heroSvg();
    if (!hs) return -1;
    const gs = hs.querySelectorAll(".hj-brains .hj-glassc");
    const v = (gs[gs.length - 1]?.getAttribute("d") || "").match(/-?\d*\.?\d+/g);
    const V = J.brain.grooves, m = V[0][0].pts.length, q = 2 * m + 5;
    if (!v || v.length < 2 * q + 2) return -1;
    const x = (+v[0] + +v[2 * q]) / 2, y = (+v[1] + +v[2 * q + 1]) / 2;
    let best = -1, bd = 2.5;
    V.forEach((g, i) => { const d = Math.hypot(g[0].pts[0][0] - x, g[0].pts[0][1] - y); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  // Blend two path strings of the same structure number by number (k = 0 mine, 1 theirs)
  const NUM = /-?\d*\.?\d+/g;
  function mixD(a, b, k) {
    if (!b || k <= 0) return a;
    if (k >= 1 || !a) return b;
    const B = b.match(NUM);
    if (!B) return a;
    let i = 0;
    const out = a.replace(NUM, (v) => (i < B.length ? r1(+v + (+B[i++] - +v) * k) : v));
    return i === B.length && out.match(NUM).length === B.length ? out : k > 0.5 ? b : a;
  }
  // everything the hero is drawing right now that the landing has to match
  function heroLook() {
    const hs = heroSvg(), hb = hs?.querySelector(".hj-body");
    if (!hb) return null;
    const brains = hb.querySelectorAll(".hj-brains > .hj-brain"), br = brains[brains.length - 1];
    return {
      rim: hb.querySelector(":scope > path.hj-ink")?.getAttribute("d"),
      glass: hb.querySelector(":scope > path.hj-glass")?.getAttribute("d"),
      glint: hb.querySelector(":scope > path.hj-cream")?.getAttribute("d"),
      brainT: br?.getAttribute("transform"),
      grooves: br?.querySelector(".hj-glassc")?.getAttribute("d"),
      eyes: br ? [...br.querySelectorAll(":scope > g")].map((eg) => {
        const pu = eg.querySelector("circle"), id = (eg.querySelector("g[clip-path]")?.getAttribute("clip-path") || "").match(/#([^)]+)/);
        const ap = id && document.getElementById(id[1])?.firstElementChild;
        return pu && ap ? { cx: +pu.getAttribute("cx"), cy: +pu.getAttribute("cy"), r: +pu.getAttribute("r"), acy: +ap.getAttribute("cy"), ary: +ap.getAttribute("ry") } : null;
      }) : [],
    };
  }

  // ---------- the brain ----------
  let brain = null, brainV = version % J.brain.grooves.length;
  function makeBrain() {
    const hv = heroVariant();
    if (hv >= 0) brainV = hv;
    brain = createBrain(J, ink, brainsG, defs, "ld", brainV);
    brain.draw = brain.draw.map(() => 0);
    brain.wet = 1; brain.open = 0; brain.dirty = true;
    brain.y = brainY0;
    for (const e of brain.eyes) e.pr = e.r;
    brain.setTransform();
  }

  // ---------- honest progress: every number is something that really happened ----------
  const prog = { jelly: 1, fonts: 0, modules: 0, frame: 0, feed: 0, thought: 0 };
  const WT = { jelly: 14, fonts: 16, modules: 40, frame: 10, feed: 10, thought: 10 };
  if (document.fonts) {
    Promise.all([document.fonts.load('600 40px "Fraunces"'), document.fonts.load('400 13px "JetBrains Mono"')])
      .catch(() => {}).then(() => document.fonts.ready).then(() => { prog.fonts = 1; });
  } else prog.fonts = 1;
  setTimeout(() => { prog.fonts = 1; }, 2600);          // a font CDN that never answers will not hold the brain hostage
  const MOUNTS = {
    "hero-jelly": "#hero-jelly", "hero-copy": "#ca-pill", countdown: "#countdown", thoughts: "#thoughts", "brain-closeup": "#brain-closeup",
    hooks: "#hooks", journal: "#journal-list", "crowd-play": "#crowd-play", how: "#how-diagram", vault: "#vault",
    swap: "#swap-overlay", sound: "#sound-toggle", ask: "#ask", depth: "#depth",
  };
  const only = params.get("only")?.split(",");
  const mounts = Object.entries(MOUNTS).filter(([m]) => !only || only.includes(m)).map(([, s]) => document.querySelector(s)).filter(Boolean);
  const debugHold = params.has("loaderHold") || params.has("loaderFly");
  const offs = [
    bus.on("ready", () => { booted = true; prog.modules = 1; requestAnimationFrame(() => requestAnimationFrame(() => { prog.frame = 1; })); }),
    bus.on("brain:countdown", () => { prog.feed = 1; }),
    bus.on("thought", () => { prog.thought = 1; }),
    // someone else ended it (main.js's safety net): stop at once
    bus.on("loader:done", () => { if (phase !== "skip" && phase !== "gone" && !debugHold) { phase = "gone"; teardown(); } }),
  ];
  let pollAt = 0, shown = 0, booted = false;
  function progress(dt) {
    if (T > pollAt && prog.modules < 1 && mounts.length) {
      pollAt = T + 0.12;
      let c = 0;
      for (const m of mounts) if (m.childElementCount) c++;
      prog.modules = Math.max(prog.modules, (0.9 * c) / mounts.length);
    }
    let target = 0;
    for (const k in WT) target += WT[k] * prog[k];
    shown = Math.min(target, shown + (target - shown) * ease(dt, 0.2) + dt * 6);
    const n = target >= 100 && shown > 99.4 ? 100 : Math.floor(shown);
    if (n !== progress.n) { progress.n = n; pctEl.textContent = `${n}%`; }
    return target >= 100;
  }

  // ---------- heartbeat (same envelope as the hero: 300 ms squeeze, 900 ms elastic release) ----------
  let beatT = 9, beatS = 0, beatFast = 1, carry = 0, nextCalm = 99;
  let swimY = 0, swimV = 0, prevSwimV = 0;
  function envelope(t, fast) {
    const tc = 0.3 / fast, tr = 0.9 / Math.sqrt(fast);
    if (t < tc) return easeOutCubic(t / tc);
    const u = (t - tc) / tr;
    if (u >= 1) return 0;
    return Math.cos(Math.PI * 1.5 * u) * Math.exp(-2.6 * u);
  }
  function beat(s = 1, fast = 1) {
    const tc = 0.3 / beatFast;
    if (beatT < tc * 0.8) { beatS = Math.max(beatS, s); return; }
    carry = C; beatT = 0; beatS = s; beatFast = fast;
    nextCalm = T + rand(2.5, 3.1);
  }

  // ---------- eyes ----------
  let blinkT = -1, blinkAgain = -1, dilate = 0, lastMoveT = -99, lpx = pointer.x, lpy = pointer.y;
  const lean = { x: 0, y: 0, r: 0 }, lag = { y: 0, v: 0 }, bc = { x: 0, v: 0 };
  function blinkOpen() {
    if (blinkT < 0) return 1;
    const t = T - blinkT;
    if (t < 0.092) return 1 - smoothstep(t / 0.092);
    if (t < 0.118) return 0;
    if (t < 0.303) return easeOutCubic((t - 0.118) / 0.185);
    blinkT = -1;
    return 1;
  }
  function blink(double) { if (blinkT >= 0) return; blinkT = T; if (double) blinkAgain = T + 0.24; }
  function eyes(dt) {
    const bo = blinkOpen();
    const meet = tw >= 0 && T - tw < 0.75;          // just woke up: look straight at the visitor first
    const follow = !meet && T - lastMoveT < 6 && pointer.active;
    let sx = 0, sy = 0;
    for (const eye of brain.eyes) {
      const { e } = eye;
      let tx = 0, ty = meet ? 0.06 : 0.42;
      if (follow) {
        const m = eye.eg.getScreenCTM();
        if (m) {
          const inv = m.inverse();
          const lx = inv.a * pointer.x + inv.c * pointer.y + inv.e, ly = inv.b * pointer.x + inv.d * pointer.y + inv.f;
          const dx = lx - e.x, dy = ly - e.y, dist = Math.hypot(dx, dy) || 1, reach = Math.min(1, dist / 125);
          tx = (dx / dist) * reach; ty = (dy / dist) * reach;
        }
      }
      tx += Math.sin(T * 7.3) * Math.sin(T * 3.1) * 0.05; ty += Math.sin(T * 5.9 + 1) * 0.04;
      sx += tx; sy += ty;
      const pr = eye.r * (1 + 0.18 * dilate);
      const mx = (e.rx - pr) * 0.94, my = (e.ry - pr) * 0.94, len = Math.hypot(tx, ty);
      if (len > 1) { tx /= len; ty /= len; }
      const f = ease(dt, 0.055);
      eye.ox += (tx * mx - eye.ox) * f; eye.oy += (ty * my - eye.oy) * f;
      eye.pr += (pr - eye.pr) * ease(dt, 0.09);
      eye.pupil.setAttribute("cx", r1(e.x + eye.ox));
      eye.pupil.setAttribute("cy", r1(e.y + eye.oy));
      eye.pupil.setAttribute("r", r1(eye.pr));
      const open = Math.min(bo, brain.open);
      eye.ap.setAttribute("cy", r1(e.y + e.ry * 0.55 * (1 - open)));
      eye.ap.setAttribute("ry", r1(Math.max(0, e.ry * 1.12 * open)));
      const lidOn = smoothstep((1 - brain.open - 0.55) / 0.4);
      if (Math.abs(lidOn - eye.lidOn) > 0.004) { eye.lidOn = lidOn; eye.lid.setAttribute("opacity", lidOn.toFixed(3)); }
    }
    return { x: sx / brain.eyes.length, y: sy / brain.eyes.length };
  }

  // ---------- the surface story: drop, rings, splash, plunge, bloom ----------
  const TEND = Array.from({ length: 7 }, (_, i) => {
    const side = i % 2 ? 1 : -1, k = Math.floor((i + 1) / 2);
    return { a: Math.PI / 2 + side * (0.18 + 0.26 * k) + rand(-0.06, 0.06), len: rand(0.42, 0.95) * (1 - 0.12 * k), w: rand(0.05, 0.085), ph: rand(0, TAU) };
  });
  const SATS = Array.from({ length: 9 }, (_, i) => ({ a: (i / 9) * TAU + rand(-0.3, 0.3), d: rand(1.3, 1.95), r: rand(3.5, 8.5), seed: rand(0, 9) }));
  const splash = [], minis = [];
  const SC = new Float32Array(160), SH = new Float32Array(80);
  let hitDone = false;

  function surfaceStory(cam) {
    const fade = 1 - smoothstep((T - 0.86) / 0.5);          // the surface recedes as the camera dives
    const tp = T - TL.hit;
    // the surface: a cream hairline that draws out from the middle, dips where the drop lands and rings out
    if (fade > 0.002) {
      const half = ((W * 0.47) / kL) * easeOutCubic(clamp(T / 0.5));
      const n = 72;
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1), x = -half + 2 * half * f, ax = Math.abs(x);
        let y = YS + Math.sin(x * 0.018 + T * 2.2) * 1.1;
        if (tp > 0) {
          y += 15 * Math.exp(-(x * x) / 2400) * Math.cos(tp * 15) * Math.exp(-tp / 0.3);
          y += 3.4 * Math.sin(ax * 0.05 - tp * 12) * Math.exp(-ax / 340) * Math.exp(-tp / 0.75) * smoothstep((300 * tp - ax) / 50);
        }
        SC[2 * i] = x; SC[2 * i + 1] = y;
        SH[i] = ((0.25 + 0.75 * Math.pow(1 - Math.abs(2 * f - 1), 0.55)) * 0.8) / kL;
      }
      surfEl.setAttribute("d", ribbon(SC, n, SH, true));
      surfEl.setAttribute("opacity", (0.7 * fade).toFixed(3));
    } else surfEl.setAttribute("d", "");

    // the drop: falls with gravity, stretching as it speeds up
    if (tp < 0) {
      const u = clamp(T / TL.hit), st = 1 + 0.6 * u * u;
      const yTop = (-50 - (oyL + cam)) / kL;
      const y = lerp(yTop, YS - RD * st, u * u);
      dropEl.setAttribute("d", dropPath(0, y, RD, 1 / Math.sqrt(st), st));
    } else dropEl.setAttribute("d", "");

    if (tp >= 0 && !hitDone) {
      hitDone = true;
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.32 + rand(-0.1, 0.1), sp = rand(230, 470) * (1 - Math.abs(i - 3) * 0.08);
        splash.push({ x: rand(-6, 6), y: YS - 3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: rand(2.6, 6), alive: true });
      }
      const sx = oxL, sy = oyL + cam + YS * kL;
      voidL.shock(sx, sy, 1);
      bus.emit("sfx", { name: "splat" });
    }
    if (tp < 0) return;

    // rings on the surface, front heavier than back, plus a light catching the first crest
    const delays = [0, 0.1, 0.22], maxR = [330, 235, 150], durs = [1.3, 1.15, 1.0], ws = [7, 5.5, 4];
    for (let i = 0; i < 3; i++) {
      const tau = tp - delays[i], u = clamp(tau / durs[i]);
      if (tau <= 0 || u >= 1 || fade <= 0.002) { ringEls[i].setAttribute("d", ""); continue; }
      const rx = 6 + maxR[i] * easeOutCubic(u), w = ws[i] * Math.pow(1 - u, 0.8) + 0.9;
      ringEls[i].setAttribute("d", ringPath(0, YS + 2, rx, rx * 0.16, w, w * 0.25, i * 2.1));
      ringEls[i].setAttribute("opacity", ((1 - smoothstep((u - 0.3) / 0.7)) * 0.92 * fade).toFixed(3));
    }
    {
      const u = clamp(tp / 1.1);
      if (u < 1 && fade > 0.002) {
        const rx = 6 + 330 * easeOutCubic(clamp((tp - 0.02) / 1.3)), ry = rx * 0.16;
        const n = 18;
        for (let i = 0; i < n; i++) {
          const a = Math.PI * (0.32 + 0.36 * (i / (n - 1)));
          SC[2 * i] = Math.cos(a) * rx * 0.94; SC[2 * i + 1] = YS + 2 + Math.sin(a) * ry * 0.82;
          SH[i] = 1.6 * Math.sin(Math.PI * (i / (n - 1))) * (1 - u) + 0.2;
        }
        glintRingEl.setAttribute("d", ribbon(SC, n, SH, true));
        glintRingEl.setAttribute("opacity", (0.85 * (1 - u) * fade).toFixed(3));
      } else glintRingEl.setAttribute("d", "");
    }

    // splash crown: droplets fly up, fall back and leave a little ring where they land
    let sd = "";
    for (const d of splash) {
      if (!d.alive) continue;
      d.vy += 1500 * DT; d.x += d.vx * DT; d.y += d.vy * DT;
      if (d.vy > 0 && d.y > YS) { d.alive = false; minis.push({ x: d.x, t0: T, r: 14 + d.r * 4 }); continue; }
      sd += dropletPath(d.x, d.y, d.r, d.vx, d.vy);
    }
    splashEl.setAttribute("d", sd);
    let md = "";
    for (const m of minis) {
      const u = clamp((T - m.t0) / 0.5);
      if (u >= 1) continue;
      const rx = 3 + m.r * easeOutCubic(u);
      md += ringPath(m.x, YS + 2, rx, rx * 0.17, 2.6 * (1 - u) + 0.5, 0.4, m.x);
    }
    miniEl.setAttribute("d", md);
    miniEl.setAttribute("opacity", fade.toFixed(3));

    // below the surface: the bead sinks, trailing a filament, and blooms into the bell
    if (T > TL.bloom1) { bloomG.setAttribute("display", "none"); return; }
    const sink = easeOutCubic(clamp(tp / 0.42));
    const beadY = lerp(YS + RD * 0.8, BCY + 14, sink);
    const rb = lerp(RD * 1.05, 80, easeOutCubic(clamp(tp / 0.6)));
    const mm = easeInOutCubic(clamp((T - TL.bloom0) / (TL.bloom1 - TL.bloom0)));
    const vort = smoothstep(tp / 0.3) * (1 - mm);
    const tg = smoothstep((tp - 0.08) / 0.4);
    const sx = 1 + 0.42 * vort, sy = 1 - 0.24 * vort;
    const cx = BCX * mm, cy = lerp(beadY, BCY, mm);
    for (let k = 0; k < NB; k++) {
      const a = (k / NB) * TAU, co = Math.cos(a), si = Math.sin(a);
      let r = rb / Math.sqrt((co / sx) ** 2 + (si / sy) ** 2);           // the bead flattens into a cap
      r -= rb * 0.34 * vort * Math.pow(Math.max(0, si), 6);               // its underside curls in, a vortex ring
      r += rb * (0.05 * Math.sin(3 * a + T * 2.1) + 0.035 * Math.sin(7 * a - T * 3.3));
      let td = 0;
      for (const f of TEND) {
        const d = Math.atan2(Math.sin(a - f.a - 0.06 * Math.sin(T * 3 + f.ph)), Math.cos(a - f.a - 0.06 * Math.sin(T * 3 + f.ph)));
        td += f.len * Math.exp(-(d * d) / (2 * f.w * f.w));
      }
      r += rb * td * tg;
      R[k] = lerp(r, RB[k], mm);
    }
    bloomG.removeAttribute("display");
    blotEl.setAttribute("d", polarPath(cx, cy, R, NB));
    bloomDisp.setAttribute("scale", (26 * smoothstep(tp / 0.22) * (1 - smoothstep((mm - 0.3) / 0.7))).toFixed(2));
    // the filament back up to the surface thins and lets go
    const sw = 1 - smoothstep((tp - 0.18) / 0.42);
    if (sw > 0.01) {
      const top = YS, bot = cy - rb * sy * 0.8, n = 10;
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1);
        SC[2 * i] = Math.sin(f * 5 + T * 6) * 5 * f * (1 - f); SC[2 * i + 1] = lerp(top, bot, f);
        SH[i] = (0.8 + 4.5 * f * f) * sw;
      }
      stemEl.setAttribute("d", ribbon(SC, n, SH, true));
    } else stemEl.setAttribute("d", "");
    // satellite specks flung off by the impact, then drawn back into the bell
    const ab = easeInCubic(clamp((mm - 0.25) / 0.75));
    let s = "";
    for (const q of SATS) {
      const out = easeOutCubic(clamp((tp - 0.04) / 0.5));
      if (out <= 0) break;
      let x = Math.cos(q.a) * rb * lerp(0.5, q.d, out) * sx, y = beadY + Math.sin(q.a) * rb * lerp(0.5, q.d, out) * sy;
      x = lerp(x, BCX + Math.cos(q.a) * 80, ab); y = lerp(y, BCY + Math.sin(q.a) * 50, ab);
      const r = q.r * (1 - ab) * smoothstep(out * 4);
      if (r > 0.4) s += blotPath(x, y, r, q.seed);
    }
    satEl.setAttribute("d", s);
  }

  // ---------- story state ----------
  let S = -1, DT = 0.016, phase = "story", tw = -1, formed = false, washed = false, seated = false, lit = false;
  let fly = null, lastLabel = "", typed = -1;
  let drift = 0, bodyX = 0, bodyVX = 0, tilt = 0;
  let wx = 0, wy = 0, wk = 1, pvx = 0, pvy = 0, acx = 0, acy = 0, steer = 0, chains = null, chainsAt = 0, variantAt = 0;
  let worldInv = null;
  const env = {
    drag: 0.955, gravity: 520, wave: 90, shape: 1, sway: 1, pointer: null, rx: 0, ry: 0, dx: 0, dy: 1,
    flow: (x, y, t) => 90 * Math.sin(0.23 * t + y * 0.004 + 1.3) + 55 * Math.sin(0.57 * t - x * 0.006) - acx * 0.32,
  };
  const label = (txt) => {
    if (txt === lastLabel) return;
    lastLabel = txt;
    labelEl.textContent = txt;
    labelEl.classList.remove("is-new"); void labelEl.offsetWidth; labelEl.classList.add("is-new");
  };
  const LBL = version > 0 ? `installing brain v${version}` : "waking up";
  // ?debug: when each beat really happened, in ms since navigation (window.__loader)
  const marks = params.has("debug") ? (window.__loader = { init: Math.round(performance.now()) }) : null;
  const mark = (k) => { if (marks && marks[k] == null) marks[k] = Math.round(performance.now()); };
  if (marks) bus.once("ready", () => mark("ready"));

  function wake() {
    mark("wake");
    phase = "awake"; tw = T; lit = true;
    beat(1.2, 1.1);
    dilate = 1;
    brain.spark = { k: 0, t0: T + 0.1, dur: 0.75 };
    glintLo.removeAttribute("display");
    label(`brain v${version} installed`);
    status.classList.add("is-done");
    hint.classList.remove("is-on");
    blinkAgain = T + 0.95;
    bus.emit("sfx", { name: "chime" });
  }
  function startFly(dur = TL.flyDur) {
    if (phase === "fly" || phase === "gone" || phase === "skip") return;
    if (!washed) { washed = true; voidL.wash(wx + bx * wk, wy + (by + BCY) * wk, T + S); }
    phase = "fly";
    mark("fly");
    fly = { t0: T, dur, k: wk, x: wx, y: wy };
    beat(1.4, 1.25);
    status.classList.add("is-out");
    hint.classList.remove("is-on");
  }
  // Modules that are still booting must find the overlay already gone, or they would wait for an event
  // that has passed; so before "ready" the overlay is removed first and the event comes second.
  function land(tg) {
    mark("land");
    phase = "gone";
    svg.style.visibility = "hidden";
    if (!booted) teardown();
    emitDone();                                   // the hero shows itself in this same frame, where we just landed
    if (tg) bus.emit("ripple", { x: tg.x + tg.bx * tg.k, y: tg.y + (tg.by + BCY) * tg.k, strength: 0.5 });
    requestAnimationFrame(teardown);
  }
  function skip() {
    if (phase === "fly" || phase === "gone" || phase === "skip") return;
    phase = "skip";
    mark("skip");
    if (!booted) { teardown(); emitDone(); return; }
    el.classList.add("is-skipping");
    emitDone();
    setTimeout(teardown, 480);
  }
  let torn = false;
  function teardown() {
    if (torn) return;
    torn = true;
    removeLoop();
    offs.forEach((off) => off());
    removeEventListener("resize", layout);
    removeEventListener("keydown", onKey);
    clearOverlay();
  }
  // ?loaderHold=2.1 freezes the story at that second (for screenshots); the safety timers stand down
  const hold = params.has("loaderHold") ? Number(params.get("loaderHold")) || 0 : -1;
  // ?loaderFly=0.6 pins the swim at that progress, right after the eyes open
  const flyHold = params.has("loaderFly") ? clamp(Number(params.get("loaderFly")) || 0) : -1;
  const onKey = (e) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") skip(); };
  el.addEventListener("pointerdown", () => skip());
  addEventListener("keydown", onKey);
  // never block for more than 5 s, whatever happens
  // The 5 s promise counts from navigation, not from this script: when the page arrived late, the story plays
  // brisker (up to 2x), and when there is not enough time left for it at all, the void just steps aside.
  const nav0 = performance.now() / 1000, left = 4.85 - nav0, LEN = TL.eyes + TL.fly + TL.flyDur;
  const speed = hold >= 0 || flyHold >= 0 || left >= LEN + 0.1 ? 1 : Math.min(2, LEN / Math.max(0.1, left - 0.1));
  if (hold < 0 && flyHold < 0) {
    if (left < 2) bus.once("ready", () => skip());
    setTimeout(() => { if (phase === "story" || phase === "awake") { if (seated) startFly(0.42); else skip(); } }, Math.max(0, (4.45 - nav0) * 1000));
    setTimeout(() => { if (isDone()) return; if (phase === "fly") land(heroTarget()); else skip(); }, Math.max(0, (4.95 - nav0) * 1000));
  }

  // ---------- the frame ----------
  function frame(t, dt) {
    if (phase === "gone" || torn) return;
    if (S < 0) { S = t; mark("start"); }
    if (hold >= 0 || flyHold >= 0) {
      // debug clock for screenshots: a fixed 1/30 s per frame, so frames are the same on any machine
      dt = 1 / 30;
      T = hold >= 0 ? Math.min(hold, T + dt) : T + dt;
      t = S + T;
    } else T = (t - S) * speed;   // wall-clock story time: a stalled frame skips ahead instead of slowing down
    DT = dt;
    if (marks) { marks.T = +T.toFixed(2); marks.phase = phase; marks.frames = (marks.frames || 0) + 1; el.dataset.debug = JSON.stringify(marks); }
    if (phase === "skip") { voidL.draw(t, dt); return; }
    if (pointer.x !== lpx || pointer.y !== lpy) { lastMoveT = T; lpx = pointer.x; lpy = pointer.y; }
    const ready = progress(dt);

    // status line: types itself, then tells the truth about what it is waiting for
    if (!lit) {
      const nch = Math.floor(LBL.length * clamp((T - 0.12) / 0.5));
      if (nch !== typed) { typed = nch; labelEl.textContent = LBL.slice(0, nch); lastLabel = labelEl.textContent; }
      if (T > TL.eyes + 0.35 && !ready && nch >= LBL.length) label(prog.thought || !(prog.modules >= 1 && prog.frame) ? "still installing" : "waiting for my first thought");
      if (T > 0.1) status.classList.add("is-on");
      if (T > 1.1 && phase === "story") hint.classList.add("is-on");
    }

    // camera, then where the jelly is: the story frame, or the swim to the hero
    const cam = camD * (1 - easeInOutCubic((T - TL.cam0) / (TL.cam1 - TL.cam0)));
    scene.setAttribute("transform", `translate(${r1(oxL)} ${r1(oyL + cam)}) scale(${kL.toFixed(4)})`);
    let w = 0, tg = null, bw = 0, look = null;
    if (phase === "fly") {
      tg = heroTarget();
      const p = flyHold >= 0 ? flyHold : clamp((T - fly.t0) / fly.dur);
      const e = easeInOutCubic(p);
      const ddx = tg.x - fly.x, ddy = tg.y - fly.y, dist = Math.hypot(ddx, ddy) || 1;
      const arc = Math.sin(Math.PI * p) ** 2 * Math.min(90, dist * 0.16);   // a swimmer's curve, bowed upward
      const sgn = ddx >= 0 ? 1 : -1;
      const nx = lerp(fly.x, tg.x, e) + (ddy / dist) * arc * sgn, ny = lerp(fly.y, tg.y, e) - (Math.abs(ddx) / dist) * arc;
      wk = lerp(fly.k, tg.k, e);
      const vx = (nx - wx) / Math.max(dt, 1e-3), vy = (ny - wy) / Math.max(dt, 1e-3);
      acx += (clamp((vx - pvx) / Math.max(dt, 1e-3) / wk, -4000, 4000) - acx) * ease(dt, 0.05);
      acy += (clamp((vy - pvy) / Math.max(dt, 1e-3) / wk, -4000, 4000) - acy) * ease(dt, 0.05);
      pvx = vx; pvy = vy; wx = nx; wy = ny;
      w = smoothstep((p - 0.42) / 0.58);
      steer = w;
      bw = smoothstep((p - 0.55) / 0.45);
      look = bw > 0 ? heroLook() : null;
      if (p > 0.5 && !fly.second) { fly.second = true; beat(0.95, 1.2); }
      if (p >= 1) {
        wx = tg.x; wy = tg.y; wk = tg.k;
        bx = tg.bx; by = tg.by; rot = tg.rot;
      }
    } else {
      wx = oxL; wy = oyL + cam; wk = kL;
    }
    world.setAttribute("transform", `translate(${r1(wx)} ${r1(wy)}) scale(${wk.toFixed(4)})`);
    const wm = world.getScreenCTM();
    worldInv = wm ? wm.inverse() : null;

    if (T < TL.bloom1 + 0.05 || T < 1.6) surfaceStory(cam);

    // ---------- the bell ----------
    if (!formed && T >= TL.bloom1) { formed = true; body.removeAttribute("display"); bloomG.setAttribute("display", "none"); bloomG.removeAttribute("filter"); }
    if (formed) {
      drift += (1 - drift) * ease(dt, 0.9);
      if (T >= TL.beat1 && beatT > 5 && nextCalm > 90) beat(1, 1);
      const capOn = T >= TL.cap0 - 0.2 && T < TL.seal + 0.1;
      if (T > nextCalm && !capOn && phase === "story") beat(rand(0.72, 0.9), 1);
      beatT += dt;
      C = envelope(beatT, beatFast) * beatS + carry * Math.exp(-beatT / 0.12);
      if (beatT < 0.3 / beatFast) swimV -= beatS * 470 * dt;
      wob = 0.008 * drift; hemAmp = 2.4 * drift;
      prevSwimV = swimV;
      swimV += (-swimY * 7 - swimV * 2.6) * dt;
      swimY += swimV * dt;
      bodyVX += (-bodyX * 6 - bodyVX * 3) * dt;
      bodyX += bodyVX * dt;
      const ddx = (13 * Math.sin(T * 0.21) + 6 * Math.sin(T * 0.53 + 1.2) - 9.4) * drift, ddy = (7 * Math.sin(T * 0.29 + 2.1) - 3.9) * drift;
      const dvx = (13 * 0.21 * Math.cos(T * 0.21) + 6 * 0.53 * Math.cos(T * 0.53 + 1.2)) * drift;
      tilt += (dvx * 0.55 + bodyVX * 0.03 + lean.x * 0.25 - tilt) * ease(dt, 0.7);
      let mbx = ddx + bodyX, mby = ddy + swimY, mrot = tilt;
      if (phase === "fly" && tg) {
        const lean2 = clamp((pvx / wk) * 0.009, -10, 10) * (1 - w);
        mbx = lerp(mbx, tg.bx, w); mby = lerp(mby, tg.by, w); mrot = lerp(mrot + lean2, tg.rot, w);
      }
      bx = mbx; by = mby; rot = mrot;
      body.setAttribute("transform", `translate(${r1(bx)} ${r1(by)}) rotate(${rot.toFixed(2)} 0 ${CY})`);

      // the glass clears from the middle with a turbulent edge, leaving the ink rim
      const cu = clamp((T - TL.clear0) / (TL.clear1 - TL.clear0));
      const outer = bellD(OUT, OUT_A), inner = bellD(IN, IN_A);
      if (cu < 1) {
        rimLo.setAttribute("d", outer);
        const sg = 0.03 + 0.97 * easeOutCubic(cu);
        clearEl.setAttribute("d", inner);
        clearEl.setAttribute("transform", `translate(12 -22) scale(${sg.toFixed(4)}) translate(-12 22)`);
        clearDisp.setAttribute("scale", (18 * (1 - smoothstep(cu))).toFixed(2));
      } else {
        if (clearEl.isConnected) clearEl.remove();
        // on the last stretch of the swim the outline melts into the hero's own, beat for beat
        glassLo.setAttribute("d", look ? mixD(inner, look.glass, bw) : inner);
        rimLo.setAttribute("d", look ? mixD(outer + inner, look.rim, bw) : outer + inner);
      }
      if (lit) {
        glintLo.setAttribute("d", look ? mixD(bellD(GL, GL_A), look.glint, bw) : bellD(GL, GL_A));
        const h = 200 * easeOutCubic(clamp((T - tw - 0.05) / 0.55));
        glintRect.setAttribute("y", r1(-4 - h)); glintRect.setAttribute("height", r1(h));
      }

      // the glass top lifts, the brain is lowered in, the glass closes and the seam glows once
      const L = T < TL.cap0 ? 0 : easeOutBack(clamp((T - TL.cap0) / 0.42), 1.1) * (1 - easeInCubic(clamp((T - TL.close0) / 0.24)));
      if (L > 0.002) {
        if (capG.getAttribute("display")) {
          capG.removeAttribute("display");
          glassLo.setAttribute("clip-path", "url(#ld-lo)"); rimLo.setAttribute("clip-path", "url(#ld-lo)");
        }
        capRim.setAttribute("d", outer + inner); capGlass.setAttribute("d", inner);
        capG.setAttribute("transform", `translate(${r1(46 * L)} ${r1(-118 * L + Math.sin(T * 2) * 5 * L)}) rotate(${(-15 * L + Math.sin(T * 1.5) * 2.2 * L).toFixed(2)} 0 -150)`);
      } else if (!capG.getAttribute("display")) {
        capG.setAttribute("display", "none");
        glassLo.removeAttribute("clip-path"); rimLo.removeAttribute("clip-path");
      }
      let crackOp = smoothstep((T - TL.cap0 + 0.12) / 0.2) * (1 - smoothstep((T - TL.cap0 - 0.2) / 0.2));
      if (T >= TL.seal) crackOp = Math.max(crackOp, 1 - clamp((T - TL.seal) / 0.9));
      crackEl.setAttribute("opacity", crackOp.toFixed(3));
      if (T >= TL.seal && !seated) { seated = true; beat(1.15, 1.3); bus.emit("sfx", { name: "bubble" }); }

      if (!brain && T >= TL.brain0) makeBrain();
      if (brain) {
        const tb = T - TL.brain0, u = clamp(tb / TL.brainDur);
        let draw = false;
        for (let i = 0; i < brain.draw.length; i++) {
          const d = easeInOutCubic((tb - 0.18 - i * 0.075) / 0.5);
          if (d !== brain.draw[i]) { brain.draw[i] = d; draw = true; }
        }
        if (draw) brain.dirty = true;
        brain.wet = T < TL.seal ? 1 : 1 - smoothstep((T - TL.seal - 0.1) / 0.8);
        if (!lit && ready && seated && T >= TL.eyes && phase === "story") wake();
        if (lit) brain.open = smoothstep((T - tw) / 0.45);
        if (blinkAgain > 0 && T > blinkAgain) { blinkAgain = -1; blink(true); }
        dilate += (0 - dilate) * ease(dt, 0.9);
        const gaze = eyes(dt);
        if (u < 1) {
          brain.y = brainY0 * (1 - easeOutCubic(u)) + Math.sin(tb * 5.5) * 6 * (1 - u) * u * 4;
          brain.rot = 9 * Math.sin(tb * 2.3) * (1 - u);
          brain.x = 18 * Math.sin(tb * 1.7) * (1 - u);
        } else {
          const on = lit ? 1 : 0;
          lean.x += (gaze.x * 7 * on - lean.x) * ease(dt, 0.15);
          lean.y += ((gaze.y - 0.3) * 5 * on - lean.y) * ease(dt, 0.15);
          lean.r += (gaze.x * 2.6 * on - lean.r) * ease(dt, 0.18);
          lag.v -= (swimV - prevSwimV) * 0.5;
          lag.v += (-lag.y * 90 - lag.v * 9) * dt;
          lag.y += lag.v * dt;
          brain.x = lean.x; brain.y = lean.y + clamp(lag.y, -14, 14); brain.rot = lean.r;
        }
        bc.v += ((C - bc.x) * 160 - bc.v * 10) * dt;
        bc.x += bc.v * dt;
        brain.sx = 1 + 0.035 * bc.x; brain.sy = 1 - 0.05 * bc.x;
        brain.setTransform();
        // think in step with the hero: when its brain rewires, this one follows to the same grooves
        if (T > variantAt) {
          variantAt = T + 0.25;
          const hv = heroVariant();
          if (hv >= 0 && hv !== brain.variant && !brain.morph && u >= 1) brain.rewire(T, hv);
        }
        brain.update(T);
        if (look) {
          // and the brain settles into the hero's pose, grooves and gaze
          brain.g.setAttribute("transform", mixD(brain.g.getAttribute("transform"), look.brainT, bw));
          const gv = brain.g.querySelector(".hj-glassc");
          gv.setAttribute("d", mixD(gv.getAttribute("d"), look.grooves, bw));
          brain.eyes.forEach((eye, i) => {
            const h = look.eyes[i];
            if (!h) return;
            const m = (el, a, v) => el.setAttribute(a, r1(lerp(+el.getAttribute(a), v, bw)));
            m(eye.pupil, "cx", h.cx); m(eye.pupil, "cy", h.cy); m(eye.pupil, "r", h.r);
            m(eye.ap, "cy", h.acy); m(eye.ap, "ry", h.ary);
          });
        }
      }
    }

    // ---------- tentacles ----------
    for (const p of plan) if (!p.on && T >= p.at) growTentacle(p);
    if (streamers.length) {
      const pin = worldInv ? { x: worldInv.a * pointer.x + worldInv.c * pointer.y + worldInv.e, y: worldInv.b * pointer.x + worldInv.d * pointer.y + worldInv.f } : null;
      env.pointer = pin && T - lastMoveT < 0.4 ? { on: true, x: pin.x, y: pin.y, vx: pointer.vx / wk, vy: pointer.vy / wk, r: 120, r2: 14400, push: 40 } : null;
      env.gravity = 520 - clamp(acy * 0.32, -900, 900);
      if (phase !== "fly") { acx *= Math.exp(-dt * 6); acy *= Math.exp(-dt * 6); }
      if (steer > 0 && (T > chainsAt || bw > 0)) { chainsAt = T + 1 / 30; chains = heroChains(); }
      const ok = steer > 0 && chains && chains.length === streamers.length;
      const order = ok ? [...streamers].sort((a, b) => a.x[0] - b.x[0]) : null;
      const ar = (rot * Math.PI) / 180, steps = dt > 1 / 45 ? 2 : 1, h = dt / steps;
      for (const s of streamers) {
        const q = anchorWorld(s.ax);
        const sp = (s.ax / 215) * (0.16 + 0.25 * Math.max(0, C));
        env.rx = q.x; env.ry = q.y; env.dx = Math.sin(sp + ar); env.dy = Math.cos(sp + ar);
        for (let j = 0; j < steps; j++) s.step(h, T, env);
        if (s.grow > 0.3) s.wet = Math.max(0, s.wet - dt / 0.8);           // the fresh cream dries before the swim
      }
      if (ok) {
        // ease each chain onto the hero's, keeping its velocity, so both are the same drawing on landing
        const f = steer >= 0.999 ? 1 : ease(dt, lerp(0.45, 0.04, steer)) * steer;
        let dev = 0;
        order.forEach((s, qi) => {
          const c = chains[qi];
          for (let i = 1; i < s.n; i++) {
            if (marks) dev = Math.max(dev, Math.hypot(c.xs[i] - s.x[i], c.ys[i] - s.y[i]) * wk);
            const ddx = (c.xs[i] - s.x[i]) * f, ddy = (c.ys[i] - s.y[i]) * f;
            s.x[i] += ddx; s.y[i] += ddy; s.px[i] += ddx; s.py[i] += ddy;
          }
        });
        if (marks) { marks.devPx = +dev.toFixed(1); marks.drawnPx = +(dev * (1 - bw)).toFixed(2); }   // worst gap to the hero: physics, and as drawn
      }
      for (const s of streamers) {
        s.render(T);
        const c = ok && bw > 0 ? chains[order.indexOf(s)] : null;
        s.el.setAttribute("d", c ? mixD(s.d, c.d, bw) : s.d);
        s.core.setAttribute("d", c && bw > 0.5 ? c.core : s.coreD);
      }
    }

    // ---------- waking, washing, swimming ----------
    if (phase === "awake") {
      if (!washed && T >= tw + TL.wash) { washed = true; voidL.wash(wx + bx * wk, wy + (by + BCY) * wk, t); }
      if (T >= tw + TL.fly || flyHold >= 0) startFly();
    }
    voidL.draw(t, dt);
    if (phase === "fly" && (flyHold >= 0 ? flyHold >= 1 : T - fly.t0 >= fly.dur)) land(tg);
  }
  const removeLoop = ctx.loop.add(marks ? (t, dt) => {
    const a = performance.now();
    frame(t, dt);
    marks.ms = +((marks.ms || 0) * 0.9 + (performance.now() - a) * 0.1).toFixed(2);
  } : frame);
  // the CSS cover stays until the canvas has painted its first frame, so the page never flashes through
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("is-live")));
}
