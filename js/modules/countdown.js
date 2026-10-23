// countdown (brief 9): the ink clepsydra.
// A brushed glass ring holds an ink tide that drains as the brain gets older. Every second one drop
// leaves through a hole in the rim and blooms in the water like a tiny jellyfish. The digits roll like
// an odometer, and every word on the glass turns cream where the ink covers it. At the swap the drops
// that fell flow back up and refill the ring, the way Turritopsis resets itself.
// Listens: brain:countdown, brain:swap:start|mid|done, loader:done, ready.
// Emits: ripple, jelly:look, sfx {tick|bubble}.
// Dev flags for screenshots: ?cdAt=<seconds left>  ?cdSwap=<seconds after start, calls sim.swapNow()>

import { setAttr } from "../core/dom.js";

const NS = "http://www.w3.org/2000/svg";
const RIM = 90;                       // centre radius of the brushed rim; the view box is -100..100
const A0 = -1.02;                     // where the brush lands (upper right)
const SWEEP = Math.PI * 2 + 0.52;     // a little past a full turn, like an enso
const DIGIT = 46;                     // big digit size in view box units
const ROLL = DIGIT * 0.95;            // how far a digit travels when it rolls: clears the 38-unit window
const ADV = DIGIT * 0.6;              // slot width of one digit
const COLON_ADV = DIGIT * 0.28;
const VER = 13, VER_ADV = VER * 0.6;  // JetBrains Mono is 600 units wide
const COLS = 40, X0 = -90, X1 = 90;   // water columns across the glass
const HOLE_A = 1.5;                   // the drip hole, just right of the bottom of the rim
const MARKS = 5;                      // tide marks at every sixth of a brain's life

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOut3 = (t) => 1 - (1 - t) ** 3;
const mod = (n, m) => ((n % m) + m) % m;
const f1 = (n) => n.toFixed(1);

function rng(seed) {
  let a = seed >>> 0;
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

const pathOf = (pts, closed = true) => {
  let s = `M${f1(pts[0].x)} ${f1(pts[0].y)}`;
  for (let i = 1; i < pts.length; i++) s += `L${f1(pts[i].x)} ${f1(pts[i].y)}`;
  return closed ? `${s}Z` : s;
};

// rim geometry, shared by the brush stroke, the glass clip and the drip hole
const rimR = (a) => RIM + 1.1 * Math.sin(3 * a + 1.1) + 0.6 * Math.sin(5 * a - 0.4);
const rimW = (a) => 7.4 + 3.4 * Math.cos(a - 2.36); // heavy at the lower left, like Turri's bell
const levelY = (lv) => 88 - lv * 184;               // tide level 0..1 to a y on the glass

const VOICE = {
  calm: "I like this brain. I'll replace it anyway.",
  fresh: "Fresh brain. Still finding where things are.",
  new: "New brain. Same coin.",
  drowsy: "Getting sleepy. Dreaming the next one.",
  final: "Last thoughts. Hold still.",
  last: "Here it comes.",
  out: "Out with the old one.",
  unborn: "No brain yet. The first one lands with the coin.",
};
const LABEL = {
  calm: "Next brain in", fresh: "Next brain in", new: "Next brain in", drowsy: "Next brain in",
  final: "Brain swap in", last: "Brain swap in", out: "Swapping brains", in: "Swapping brains",
  unborn: "First brain",
};
const QUIPS = ["Don't shake the jar.", "That's my time you're sloshing.", "You can't make it go faster. I checked."];

export function init(ctx) {
  const { bus, loop, state, config, params, ink } = ctx;
  const mount = document.getElementById("countdown");
  if (!mount) return;
  const reduced = !!ctx.reduced;
  const demo = params.has("demo");
  const id = `cd${Math.random().toString(36).slice(2, 8)}`;
  let period = (demo ? config.demoBrainSeconds : config.brainMinutes * 60) * 1000;

  // ---------- DOM ----------
  const root = document.createElement("div");
  root.className = "cd is-pre";
  root.setAttribute("role", "timer");
  root.innerHTML =
    `<div class="cd__jar"><svg class="cd__svg" viewBox="-100 -100 200 200" aria-hidden="true" focusable="false"></svg></div>` +
    `<div class="cd__side"><p class="cd__say" aria-live="polite"></p>` +
    (demo ? `<button class="cd__swap" type="button"><span>swap now</span><svg viewBox="0 0 80 8" aria-hidden="true"><path/></svg></button>` : "") +
    `</div>`;
  mount.appendChild(root);
  const jar = root.querySelector(".cd__jar");
  const svgEl = root.querySelector(".cd__svg");
  const sayEl = root.querySelector(".cd__say");
  const swapBtn = root.querySelector(".cd__swap");

  // static ink: rim, glass, glint, draw-on mask
  const rimPts = [];
  for (let i = 0; i <= 160; i++) {
    const a = A0 + (i / 160) * SWEEP;
    const over = smooth(A0 + Math.PI * 2 - 0.5, A0 + Math.PI * 2 + 0.2, a); // the tail rides outside the start
    const r = rimR(a) + 2.6 * over;
    rimPts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  const rimD = ink.brush(rimPts, (t) => rimW(A0 + t * SWEEP) * (0.72 + 0.28 * smooth(0, 0.035, t)) * (1 - 0.8 * smooth(0.9, 1, t)));
  const glassPts = [];
  for (let i = 0; i < 120; i++) {
    const a = (i / 120) * Math.PI * 2;
    const r = rimR(a) - rimW(a) / 2 + 1.6;
    glassPts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  const glassR = (a) => rimR(a) - rimW(a) / 2;
  const glintCtrl = [];
  for (let i = 0; i <= 6; i++) {
    const a = 3.56 + (i / 6) * 0.78;
    const r = glassR(a) - 4.6 - 1.2 * Math.sin((i / 6) * Math.PI);
    glintCtrl.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  const glintD = ink.brush(ink.spline(glintCtrl, false, 10), (t) => 1.1 + 4.4 * Math.sin(Math.PI * t) ** 0.8);
  let maskD = "";
  for (let i = 0; i <= 96; i++) {
    const a = A0 - 0.06 + (i / 96) * (SWEEP + 0.12);
    maskD += `${i ? "L" : "M"}${f1(Math.cos(a) * (RIM + 1))} ${f1(Math.sin(a) * (RIM + 1))}`;
  }
  // the hole: outer edge of the rim at HOLE_A
  const HX = Math.cos(HOLE_A) * (rimR(HOLE_A) + rimW(HOLE_A) / 2);
  const HY = Math.sin(HOLE_A) * (rimR(HOLE_A) + rimW(HOLE_A) / 2);

  const defs = el("defs", null, svgEl);
  const glassClip = el("clipPath", { id: `${id}g` }, defs);
  el("path", { d: pathOf(glassPts) }, glassClip);
  const winClip = el("clipPath", { id: `${id}w` }, defs);
  el("rect", { x: -90, y: -19, width: 180, height: 38 }, winClip); // one glyph tall, so neighbours never peek in
  const verClip = el("clipPath", { id: `${id}v` }, defs);
  el("rect", { x: -200, y: 32, width: 400, height: 14.5 }, verClip); // the version number's own window
  const liqClip = el("clipPath", { id: `${id}l` }, defs);
  const liqClipPath = el("path", { d: "M0 0" }, liqClip);
  const mask = el("mask", { id: `${id}m`, maskUnits: "userSpaceOnUse", x: -112, y: -112, width: 224, height: 224 }, defs);
  const maskPath = el("path", { d: maskD, fill: "none", stroke: "#fff", "stroke-width": 24, "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": "1 1", "stroke-dashoffset": 1 }, mask);

  const plumeG = el("g", { class: "cd__plumes" }, svgEl);
  const floatG = el("g", null, svgEl);
  const beatG = el("g", null, floatG);
  const inGlass = el("g", { "clip-path": `url(#${id}g)` }, beatG);
  const marksG = el("g", { class: "cd__marks" }, inGlass);
  const faceInkG = el("g", { class: "cd__face cd__face--ink" }, inGlass);
  const liquid = el("path", { class: "cd__liquid", d: "M0 0" }, inGlass);
  const inLiquid = el("g", { "clip-path": `url(#${id}l)` }, inGlass);
  const bubblesG = el("g", { class: "cd__bubbles" }, inLiquid);
  const faceCreamG = el("g", { class: "cd__face cd__face--cream" }, inLiquid);
  el("path", { class: "cd__rim", d: rimD, mask: `url(#${id}m)` }, beatG);
  const rimEl = beatG.lastChild;
  const glint = el("path", { class: "cd__glint", d: glintD }, beatG);
  const hang = el("path", { class: "cd__hang", d: "M0 0" }, beatG);

  // the face is built twice: ink on the glass, cream inside the ink
  function buildFace(g) {
    const label = el("text", { class: "cd__label", x: 0, y: -39, "text-anchor": "middle" }, g);
    label.textContent = LABEL.calm;
    const slots = [];
    const win = el("g", { "clip-path": `url(#${id}w)` }, g);
    for (let i = 0; i < 5; i++) {
      const sg = el("g", { class: "cd__slot" }, win);
      if (i === 2) {
        const c = el("text", { class: "cd__colon", y: 12, "text-anchor": "middle" }, sg);
        c.textContent = ":";
        slots.push({ g: sg, a: c });
        continue;
      }
      const a = el("text", { class: "cd__dg", y: 16, "text-anchor": "middle" }, sg);
      const b = el("text", { class: "cd__dg", y: 16, "text-anchor": "middle" }, sg);
      slots.push({ g: sg, a, b });
    }
    const verG = el("g", { class: "cd__ver" }, g);
    const pre = el("text", { y: 44 }, verG);
    pre.textContent = "brain v";
    const numG = el("g", { "clip-path": `url(#${id}v)` }, verG);
    const na = el("text", { y: 44 }, numG);
    const nb = el("text", { y: 44 }, numG);
    // before the first brain there is nothing to count down to: the glass just says when it comes
    const soon = el("text", { class: "cd__soon", y: 9, "text-anchor": "middle", style: "display:none" }, g);
    soon.textContent = "at launch";
    return { g, label, slots, win, verG, pre, numG, na, nb, soon };
  }
  const faces = [buildFace(faceInkG), buildFace(faceCreamG)];
  const both = (fn) => { fn(faces[0]); fn(faces[1]); };

  // Before the first brain (live feed, version 0) the ring stays full and still: no digits, no version, no drops
  const unborn = () => !(state.version > 0);
  let unbornShown = false;
  function showUnborn(on) {
    if (on === unbornShown) return;
    unbornShown = on;
    both((f) => {
      f.win.style.display = on ? "none" : "";
      f.verG.style.display = on ? "none" : "";
      f.soon.style.display = on ? "" : "none";
    });
  }

  // tide marks: faint residue the ink leaves on the glass as it drains past each sixth
  const marks = [];
  for (let k = 1; k <= MARKS; k++) {
    const y = levelY(k / 6);
    const c = Math.sqrt(Math.max(0, 86 * 86 - y * y));
    const r = rng(k * 31 + 5);
    const lenL = [0, 22, 9, 17, 26][k - 1], lenR = [14, 0, 19, 8, 0][k - 1];
    let d = "";
    if (lenL) d += ink.brush(ink.spline([{ x: -c + 0.5, y: y - 1.4 }, { x: -c + lenL * 0.5, y: y + 0.5 + r() * 0.8 }, { x: -c + lenL, y: y + 0.2 }], false, 10), (t) => 0.4 + 2.2 * Math.sin(Math.PI * t) ** 1.2);
    if (lenR) d += ink.brush(ink.spline([{ x: c - lenR, y: y + 0.3 }, { x: c - lenR * 0.5, y: y + 0.6 + r() * 0.6 }, { x: c - 0.5, y: y - 1.2 }], false, 10), (t) => 0.4 + 2 * Math.sin(Math.PI * t) ** 1.2);
    if (k === 2 || k === 4) { const dx = -c + lenL * 0.55; d += ink.brush([{ x: dx, y: y + 0.4 }, { x: dx + 0.3, y: y + 4 }, { x: dx + 0.1, y: y + 7 + r() * 4 }], (t) => 1.5 - 0.7 * t + 1.2 * smooth(0.75, 1, t)); }
    const p = el("path", { d, opacity: 0 }, marksG);
    marks.push({ k, el: p, o: 0, shown: -1 });
  }

  // bubbles: little cream blobs that rise through the ink (never perfect circles)
  const blobShapes = [11, 23, 47].map((seed) => {
    const r = rng(seed), pts = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const rr = 1 + (r() - 0.5) * 0.3; pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr }); }
    return pathOf(ink.spline(pts, true, 6));
  });
  const bubbles = [];
  for (let i = 0; i < 9; i++) bubbles.push({ on: false, el: el("path", { class: "cd__bubble", d: blobShapes[i % 3], opacity: 0 }, bubblesG) });

  // plumes: each second's drop sinking and blooming into a vortex ring, a tiny ink jellyfish
  const plumes = [];
  for (let i = 0; i < 14; i++) {
    const g = el("g", { opacity: 0 }, plumeG);
    plumes.push({ on: false, g, stem: el("path", { d: "M0 0" }, g), body: el("path", { d: "M0 0" }, g) });
  }

  // swap-now link for ?demo
  if (swapBtn) {
    swapBtn.querySelector("path").setAttribute("d", ink.brush(ink.spline([{ x: 2, y: 4.6 }, { x: 22, y: 3.2 }, { x: 44, y: 5.2 }, { x: 64, y: 3.4 }, { x: 78, y: 4.4 }], false, 12), (t) => 0.6 + 2.2 * Math.sin(Math.PI * t) ** 0.7));
    swapBtn.addEventListener("click", () => {
      if (state.swapping || phase === "out" || phase === "in") return;
      const r = swapBtn.getBoundingClientRect();
      bus.emit("ripple", { x: r.left + r.width / 2, y: r.top + r.height / 2, strength: 0.4 });
      ctx.sim.swapNow();
    });
  }

  // ---------- state ----------
  let phase = "pre";            // pre | intro | live | out | in
  let visible = true;
  let shift = 0;                // dev: ?cdAt
  if (params.has("cdAt")) shift = Number(params.get("cdAt")) * 1000 - (state.nextSwapAt - Date.now());
  const msLeft = (now) => (phase === "out" || phase === "in" || state.swapping ? 0 : Math.max(0, state.nextSwapAt - now + shift));

  const dig = [0, 1, 3, 4].map((fi, k) => ({ fi, N: k === 2 ? 6 : 10, pos: 0, vel: 0, target: 0, w: 11, z: 0.6, pend: null, at: 0, k0: null, drawn: NaN, ta: ["", ""], tb: ["", ""], fvs: "" }));
  let m10Show = 0, m10Drawn = -1, lastSecs = null, colonGlow = 1;
  const ver = { pos: state.version, vel: 0, target: state.version, drawn: NaN, len: 0 };
  let verDim = 1, verDimDrawn = -1;

  let lv = 0, lvV = 0, lvTarget = 0, fillTo = 0;
  const h = new Float32Array(COLS), v = new Float32Array(COLS), lD = new Float32Array(COLS), rD = new Float32Array(COLS);
  const xs = Array.from({ length: COLS }, (_, i) => X0 + (i * (X1 - X0)) / (COLS - 1));
  const ys = new Float32Array(COLS);
  let tilt = 0, tiltV = 0, acc = 0, agitate = 1;
  let hover = false, hoverX = 0, hoverY = 0;
  let lastScroll = ctx.scroll.y;
  let beatT = 9, beatAmp = 0;
  let bubbleTimer = 1.2;
  let introT = 0, introSpawned = false, introSpun = false;
  let mood = "", voiceText = "", voiceTimer = 0, quipUntil = 0, quipIdx = 0, freshUntil = 0;
  let labelText = LABEL.calm, labelTimer = 0;
  let swapTo = state.version + 1;
  let lastAria = 0;
  let tNow = 0, preCheck = 0;

  // ---------- helpers ----------
  // the loader overlay is gone (or never came): nothing left to wait for
  const loaderGone = () => {
    const l = document.getElementById("loader");
    if (!l || !l.childElementCount) return true;
    const cs = getComputedStyle(l);
    return cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05;
  };

  function toClient(x, y) {
    const m = svgEl.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    return new DOMPoint(x, y).matrixTransform(m);
  }
  function toLocal(cx, cy) {
    const m = svgEl.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    return new DOMPoint(cx, cy).matrixTransform(m.inverse());
  }

  function setLabel(text) {
    if (text === labelText) return;
    labelText = text;
    clearTimeout(labelTimer);
    if (reduced) { both((f) => { f.label.textContent = text; }); return; }
    both((f) => f.label.classList.add("is-out"));
    labelTimer = setTimeout(() => both((f) => { f.label.textContent = text; f.label.classList.remove("is-out"); }), 320);
  }

  function setVoice(text, instant) {
    if (text === voiceText) return;
    voiceText = text;
    clearTimeout(voiceTimer);
    const build = () => {
      sayEl.classList.remove("is-in", "is-leaving");
      sayEl.textContent = "";
      text.split(" ").forEach((w, i) => {
        const s = document.createElement("span");
        s.className = "cd__w";
        s.style.setProperty("--i", i);
        s.textContent = w;
        sayEl.append(s, " ");
      });
      void sayEl.offsetWidth;
      sayEl.classList.add("is-in");
    };
    if (reduced || instant || !sayEl.firstChild) { build(); return; }
    sayEl.classList.add("is-leaving");
    voiceTimer = setTimeout(build, 360);
  }

  function moodOf(ms, now) {
    if (phase === "out") return "out";
    if (phase === "in") return "in";
    if (unborn()) return "unborn";
    const last = Math.min(10000, period / 9), fin = Math.min(60000, period / 6), drowsy = Math.min(300000, period / 5);
    if (ms <= last) return "last";
    if (ms <= fin) return "final";
    if (ms <= drowsy) return "drowsy";
    if (now < freshUntil) return "new";
    if (period - ms < period * 0.12) return "fresh";
    return "calm";
  }

  function applyMood(m, now) {
    if (now < quipUntil) return;
    // the very first brain (at launch) has no old one to swap out
    const first = swapTo === 1 && (m === "out" || m === "in");
    setLabel(first ? "First brain" : LABEL[m]);
    setVoice(m === "in" ? (first ? "In it goes. My first brain." : `In with v${swapTo}. Feels roomy.`) : first ? "Here comes my first brain." : VOICE[m]);
  }

  // damping per roll: a spring overshoots a share of its travel, so a long roll would sink the glyph
  // half out of the one-glyph window. This keeps every settle at about 4 units past the slot.
  const settleZ = (steps) => {
    const k = Math.log(Math.max(1, steps) * ROLL / 4) / Math.PI;
    return Math.max(0.6, k / Math.sqrt(1 + k * k));
  };

  // digits: unbounded counters so 0 rolls on to 9 and 5 the way a real odometer does
  function setTime(secs, mode) {
    const mins = Math.floor(secs / 60), s = secs % 60;
    const vals = [Math.floor(mins / 10) % 10, mins % 10, Math.floor(s / 10), s % 10];
    const now = performance.now();
    for (let i = 0; i < 4; i++) {
      const d = dig[i];
      const base = d.pend ?? d.target;
      const cur = mod(base, d.N), nv = vals[i];
      if (mode === "spin") {
        // refill: every wheel winds forward once to its new value, never more than one turn
        const steps = mod(nv - cur, d.N);
        d.pend = base + steps;
        d.at = now + i * 110;
        d.w = 6.2; d.z = settleZ(steps);
      } else if (cur !== nv) {
        const steps = mode === "up" ? mod(nv - cur, d.N) : mod(cur - nv, d.N);
        d.pend = null;
        d.target = mode === "up" ? base + steps : base - steps;
        d.w = 11; d.z = settleZ(steps);
      }
      if (mode === "snap" || reduced) { if (d.pend !== null) { d.target = d.pend; d.pend = null; } d.pos = d.target; d.vel = 0; }
    }
  }

  function spawnPlume(x, y, o) {
    const p = plumes.find((q) => !q.on);
    if (!p) return null;
    Object.assign(p, {
      on: true, age: 0, life: o.life ?? 2.8, x0: x, y0: y, rev: !!o.rev, size: o.size ?? 1,
      drift: o.drift ?? 3 + Math.random() * 6, depth: o.depth ?? 58 + Math.random() * 12,
      seed: Math.random() * 10, delay: o.delay ?? 0, onDone: o.onDone || null,
      off: Array.from({ length: 8 }, () => (Math.random() - 0.5) * 0.55),
      fing: [-0.5, -0.05, 0.42].map((x) => ({ x: x + (Math.random() - 0.5) * 0.2, len: 1 + Math.random() * 0.9, curl: (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.45), ph: Math.random() * 6 })),
    });
    p.g.setAttribute("opacity", 0);
    return p;
  }

  // the drops that fell come back up into the ring: a reset, not a refill
  function rewind(to, n, spread) {
    fillTo = 0;
    lvTarget = lv;
    const hole = holeNow();
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1;
      spawnPlume(hole.x, hole.y, {
        rev: true, life: 1.15 + Math.random() * 0.35, delay: i * (spread / n) + Math.random() * 0.08,
        drift: side * (16 + Math.random() * 46), depth: 66 + Math.random() * 44, size: 1 + Math.random() * 0.5,
        onDone: () => {
          fillTo = Math.min(to, fillTo + to / n);
          lvTarget = fillTo;
          if (Math.random() < 0.4) spawnBubble((Math.random() < 0.5 ? -1 : 1) * (34 + Math.random() * 20), 62 + Math.random() * 8, 1.8 + Math.random() * 1.6);
          poke(HX + (Math.random() - 0.5) * 50, 1.1);
        },
      });
    }
  }

  function holeNow() {
    return { x: HX * beatS + bobX, y: HY * beatS + bobY };
  }

  function spawnBubble(x, y, r) {
    const b = bubbles.find((q) => !q.on);
    if (!b) return;
    Object.assign(b, { on: true, x, y, r, vy: -(9 + r * 5), ph: Math.random() * 6 });
  }

  const KERN = [0.3, 0.65, 1, 0.65, 0.3];
  function poke(x, amt) {
    const c = colAt(x);
    for (let k = -2; k <= 2; k++) { const i = c + k; if (i >= 0 && i < COLS) v[i] += amt * KERN[k + 2]; }
  }
  const colAt = (x) => clamp(Math.round(((x - X0) / (X1 - X0)) * (COLS - 1)), 0, COLS - 1);
  function surfAt(x) {
    const f = clamp(((x - X0) / (X1 - X0)) * (COLS - 1), 0, COLS - 1);
    const i = Math.floor(f), j = Math.min(COLS - 1, i + 1);
    return lerp(ys[i], ys[j], f - i);
  }

  function splash(cx, cy) {
    if (phase === "pre") return; // not on screen yet; the intro reads the live state when it starts
    const p = toLocal(cx, cy);
    poke(p.x, 3);
    tiltV += (p.x > 0 ? -1 : 1) * 0.5;
    if (lv > 0.05) for (let b = 0; b < 2; b++) spawnBubble(clamp(p.x + (Math.random() - 0.5) * 16, -70, 70), Math.min(76, surfAt(p.x) + 14 + Math.random() * 20), 1.6 + Math.random() * 1.6);
    bus.emit("ripple", { x: cx, y: cy, strength: 0.35 });
    bus.emit("sfx", { name: "bubble" });
    const ctr = toClient(0, 0);
    bus.emit("jelly:look", { x: ctr.x, y: ctr.y });
    const m = mood;
    quipUntil = performance.now() + 3600;
    setVoice(m === "final" || m === "last" ? "Careful. That's the last of this brain." : QUIPS[quipIdx++ % QUIPS.length]);
  }

  // ---------- intro ----------
  let introStarted = false, introDone = false;
  function startIntro() {
    if (introStarted) return;
    introStarted = true;
    root.classList.remove("is-pre");
    const now = Date.now();
    const ms = msLeft(now);
    if (reduced) {
      introDone = true;
      phase = state.swapping ? "out" : "live";
      maskPath.setAttribute("stroke-dashoffset", 0);
      rimEl.removeAttribute("mask");
      faceInkG.removeAttribute("opacity");
      faceCreamG.removeAttribute("opacity");
      glint.removeAttribute("opacity");
      lv = lvTarget = phase === "live" ? (unborn() ? 1 : ms / period) : 0;
      setTime(Math.ceil(ms / 1000), "snap");
      lastSecs = Math.ceil(ms / 1000);
      return;
    }
    phase = "intro";
    introT = 0;
    lastSecs = 0;
  }

  // ---------- events ----------
  bus.on("brain:countdown", (e) => {
    if (e.period) period = e.period;
    if ((phase === "live" || phase === "intro") && e.version !== ver.target && !state.swapping) ver.target = e.version;
  });
  bus.on("brain:swap:start", (e) => {
    shift = 0;
    swapTo = e.to;
    if (unborn()) both((f) => { f.soon.textContent = "landing"; });
    if (phase === "pre") return; // not on screen yet; the intro reads the live state when it starts
    phase = "out";
    verDim = 0.38;
    if (!reduced && lv > 0.04) {
      // dump what is left of this brain's time
      const hole = holeNow();
      for (let i = 0; i < 4; i++) spawnPlume(hole.x, hole.y, { delay: i * 0.16, size: 1.35, life: 2.4, depth: 70 });
    }
    lvTarget = 0;
    applyMood("out", performance.now());
    mood = "out";
  });
  bus.on("brain:swap:mid", (e) => {
    swapTo = e.to;
    if (phase === "pre") return; // not on screen yet; the intro reads the live state when it starts
    phase = "in";
    verDim = 1;
    ver.target = e.to;
    if (reduced) { lv = lvTarget = 1; } else rewind(1, 9, 0.9);
    applyMood("in", performance.now());
    mood = "in";
  });
  bus.on("brain:swap:done", (e) => {
    ver.target = e.version;
    if (phase === "pre") return; // not on screen yet; the intro reads the live state when it starts
    phase = "live";
    verDim = 1;
    freshUntil = performance.now() + 12000;
    quipUntil = 0;
  });
  const go = () => startIntro();
  bus.on("loader:done", go);
  bus.on("ready", () => { if (params.has("skipLoader") || !document.querySelector("#loader")?.childElementCount) setTimeout(go, 60); });
  setTimeout(go, 6000);
  if (params.has("cdSwap")) bus.on("ready", () => setTimeout(() => ctx.sim.swapNow(), Number(params.get("cdSwap")) * 1000 || 0));

  // pointer: the ink leans toward a hovering cursor and splashes when poked
  jar.addEventListener("pointerenter", () => { hover = true; });
  jar.addEventListener("pointerleave", () => { hover = false; });
  jar.addEventListener("pointermove", (e) => { const p = toLocal(e.clientX, e.clientY); hoverX = p.x; hoverY = p.y; }, { passive: true });
  jar.addEventListener("pointerdown", (e) => splash(e.clientX, e.clientY));

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { rootMargin: "160px 0px" }).observe(root);
  }

  // ---------- per frame ----------
  let beatS = 1, bobX = 0, bobY = 0;
  const pulse = (x) => (x < 0 ? 0 : x < 0.08 ? smooth(0, 0.08, x) : Math.exp(-(x - 0.08) / 0.17));

  function waveStep() {
    for (let i = 0; i < COLS; i++) { v[i] += -0.028 * h[i] - 0.03 * v[i]; h[i] += v[i]; }
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < COLS; i++) {
        if (i > 0) { lD[i] = 0.2 * (h[i] - h[i - 1]); v[i - 1] += lD[i]; }
        if (i < COLS - 1) { rD[i] = 0.2 * (h[i] - h[i + 1]); v[i + 1] += rD[i]; }
      }
      for (let i = 0; i < COLS; i++) {
        if (i > 0) h[i - 1] += lD[i];
        if (i < COLS - 1) h[i + 1] += rD[i];
      }
    }
    for (let i = 0; i < COLS; i++) h[i] = clamp(h[i], -14, 14);
  }

  // a sinking drop opens into a small ink cloud with fingers hanging from it, drawn at 4x for smoothness.
  // Every outline winds the same way so the overlaps stay filled.
  function plumeShape(p, W, tau, t) {
    const n = p.off.length, ry = 0.56, pts = [];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 - (i / n) * Math.PI * 2;
      const k = 1 + p.off[i] * (0.3 + tau) + 0.07 * Math.sin(t * 1.4 + i * 1.7 + p.seed) + 0.04 * Math.sin(t * 2.3 - i * 2.9);
      let y = Math.sin(a) * W * ry * k;
      if (i === 0) y += W * 0.25 * tau; // the thread pulls a dent into the top
      pts.push({ x: Math.cos(a) * W * k, y });
    }
    let d = pathOf(ink.spline(pts, true, 8));
    const grow = smooth(0.1, 0.8, tau);
    if (grow > 0.03) {
      for (const f of p.fing) {
        const x0 = f.x * W, y0 = W * ry * 0.5;
        const L = W * f.len * grow * 1.15;
        const sw = Math.sin(t * 1.1 + f.ph) * W * 0.07;
        const cu = f.curl * W * 0.5 * grow;
        const c = [{ x: x0, y: y0 - W * 0.14 }, { x: x0 + sw * 0.4 - cu * 0.2, y: y0 + L * 0.4 }, { x: x0 + sw + cu * 0.5, y: y0 + L * 0.78 }, { x: x0 + sw + cu, y: y0 + L * 0.92 }];
        d += ink.brush(ink.spline(c, false, 8), (tt) => W * (0.24 - 0.2 * tt) * (0.6 + 0.4 * grow));
      }
    }
    return d;
  }

  function drawPlumes(dt) {
    const hole = holeNow();
    for (const p of plumes) {
      if (!p.on) continue;
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.age += dt;
      let tau = p.age / p.life;
      if (tau >= 1) {
        p.on = false;
        setAttr(p.g, "opacity", 0);
        if (p.onDone) p.onDone();
        continue;
      }
      if (p.rev) tau = 1 - tau;
      const e = 1 - (1 - tau) ** 2.2;
      const cx = p.x0 + p.drift * e + 1.4 * Math.sin(p.age * 1.6 + p.seed) * tau;
      const cy = p.y0 + 3 + p.depth * e;
      const W = (2.6 + 9.5 * easeOut3(tau)) * p.size;
      const op = smooth(0, 0.05, tau) * (1 - tau) ** 1.5 * 0.92;
      setAttr(p.body, "d", plumeShape(p, W * 4, tau, tNow));
      setAttr(p.body, "transform", `translate(${f1(cx)} ${f1(cy)}) scale(.25)`);
      const stemO = p.rev ? 0 : (1 - smooth(0.1, 0.5, tau)) * 0.6;
      if (stemO > 0.02) {
        const sx = p.rev ? hole.x : p.x0, sy = p.rev ? hole.y : p.y0;
        const mid = { x: (sx + cx) / 2 + 2.2 * Math.sin(p.seed + p.age * 1.3), y: (sy + cy) / 2 };
        const top = { x: sx, y: sy - 1 };
        const bot = { x: cx, y: cy + W * 0.1 };
        if (bot.y - top.y > 3) {
          setAttr(p.stem, "d", ink.brush(ink.spline([top, mid, bot], false, 8), (t) => 0.35 + 0.75 * t));
          setAttr(p.stem, "opacity", f1(stemO));
        } else setAttr(p.stem, "d", "M0 0");
      } else setAttr(p.stem, "d", "M0 0");
      setAttr(p.g, "opacity", op.toFixed(3));
    }
  }

  function drawDigits(t) {
    const total = ADV * m10Show + ADV * 3 + COLON_ADV;
    let x = -total / 2;
    const sx = [];
    sx[0] = x + (ADV * m10Show) / 2; x += ADV * m10Show;
    sx[1] = x + ADV / 2; x += ADV;
    sx[2] = x + COLON_ADV / 2; x += COLON_ADV;
    sx[3] = x + ADV / 2; x += ADV;
    sx[4] = x + ADV / 2;
    if (Math.abs(m10Show - m10Drawn) > 0.001) {
      m10Drawn = m10Show;
      for (let i = 0; i < 5; i++) both((f) => setAttr(f.slots[i].g, "transform", `translate(${sx[i].toFixed(2)} 0)`));
    }
    const kick = pulse(beatT) + 0.5 * pulse(beatT - 0.22);
    for (let k = 0; k < 4; k++) {
      const d = dig[k];
      const vis = d.fi === 0 ? m10Show : 1;
      // breathing axes, a slow wave across the digits
      const w = Math.round((548 + 46 * Math.sin(t * 0.7 + k * 1.1) + 110 * kick * beatAmp * 20 + clamp(Math.abs(d.vel) * 9, 0, 120)) / 4) * 4;
      const soft = Math.round((50 + 50 * Math.sin(t * 0.43 + k * 0.8)) / 5) * 5;
      const fvs = `"opsz" 144, "wght" ${w}, "SOFT" ${soft}, "WONK" 1`;
      if (fvs !== d.fvs) { d.fvs = fvs; both((f) => { f.slots[d.fi].g.style.fontVariationSettings = fvs; }); }
      const key = d.pos * 1000 + vis;
      if (key === d.drawn) continue;
      d.drawn = key;
      const k0 = Math.floor(d.pos), fr = d.pos - k0;
      const ta = String(mod(k0, d.N)), tb = String(mod(k0 + 1, d.N));
      const ya = -fr * ROLL, yb = (1 - fr) * ROLL;
      // glyphs roll through a one-glyph window and cross-fade through the middle of the roll,
      // so a fast spin reads as ink ghosting rather than a stack of stray numbers
      const oa = (1 - smooth(0.2, 0.7, fr)) * vis, ob = smooth(0.3, 0.8, fr) * vis;
      const st = 1 + clamp(Math.abs(d.vel) * 0.03, 0, 0.2);
      const sq = (1 / Math.sqrt(st)).toFixed(3);
      for (let fi = 0; fi < 2; fi++) {
        const s = faces[fi].slots[d.fi];
        if (d.ta[fi] !== ta) { s.a.textContent = ta; d.ta[fi] = ta; }
        if (d.tb[fi] !== tb) { s.b.textContent = tb; d.tb[fi] = tb; }
        setAttr(s.a, "transform", `translate(0 ${ya.toFixed(2)}) scale(${sq} ${st.toFixed(3)})`);
        setAttr(s.b, "transform", `translate(0 ${yb.toFixed(2)}) scale(${sq} ${st.toFixed(3)})`);
        setAttr(s.a, "opacity", oa.toFixed(3));
        setAttr(s.b, "opacity", ob.toFixed(3));
      }
    }
    const co = (0.8 + 0.2 * colonGlow).toFixed(2);
    both((f) => setAttr(f.slots[2].a, "opacity", co));
  }

  function drawVersion() {
    const len = String(Math.max(Math.round(ver.target), Math.floor(ver.pos))).length;
    if (len !== ver.len) {
      ver.len = len;
      const x0 = -((7 + len) * VER_ADV) / 2;
      both((f) => { setAttr(f.pre, "x", f1(x0)); setAttr(f.numG, "transform", `translate(${(x0 + 7 * VER_ADV).toFixed(2)} 0)`); });
    }
    if (verDim !== verDimDrawn) { verDimDrawn = verDim; both((f) => { f.verG.style.opacity = verDim; }); }
    if (ver.pos === ver.drawn) return;
    ver.drawn = ver.pos;
    const k0 = Math.floor(ver.pos), fr = ver.pos - k0;
    const oa = 1 - smooth(0.2, 0.7, fr), ob = smooth(0.3, 0.8, fr); // same roll as the big digits
    both((f) => {
      f.na.textContent = String(k0);
      f.nb.textContent = String(k0 + 1);
      setAttr(f.na, "transform", `translate(0 ${(-fr * 15).toFixed(2)})`);
      setAttr(f.nb, "transform", `translate(0 ${((1 - fr) * 15).toFixed(2)})`);
      setAttr(f.na, "opacity", oa.toFixed(3));
      setAttr(f.nb, "opacity", ob.toFixed(3));
    });
  }

  let liquidDrawn = "";
  function drawLiquid(t) {
    const base = levelY(lv);
    for (let i = 0; i < COLS; i++) {
      const x = xs[i];
      const amb = reduced ? 0 : (1.3 * Math.sin(x * 0.065 + t * 1.25) + 0.7 * Math.sin(x * 0.15 - t * 0.85 + 1.7)) * agitate;
      ys[i] = base + tilt * x + h[i] + amb;
    }
    let d = `M${X0 - 10} 100L${X0 - 10} ${f1(ys[0])}`;
    for (let i = 0; i < COLS; i++) d += `L${f1(xs[i])} ${f1(ys[i])}`;
    d += `L${X1 + 10} ${f1(ys[COLS - 1])}L${X1 + 10} 100Z`;
    if (d !== liquidDrawn) {
      liquidDrawn = d;
      setAttr(liquid, "d", d);
      setAttr(liqClipPath, "d", d);
    }
  }

  function drawHang(ms) {
    if (reduced || phase !== "live" || ms <= 0 || lv < 0.004) { setAttr(hang, "d", "M0 0"); return; }
    const p = 1 - (ms % 1000) / 1000;
    const L = 1.5 + 8.8 * p ** 1.5;
    const bulb = 2.6 + 5.4 * p ** 1.3, neck = 2.8 - 1.1 * p;
    const sway = 0.6 * Math.sin(tNow * 2.1);
    const pts = [{ x: HX, y: HY - 3.5 }, { x: HX + sway * 0.4, y: HY + L * 0.5 }, { x: HX + sway, y: HY + L }];
    setAttr(hang, "d", ink.brush(ink.spline(pts, false, 6), (t) => (t < 0.5 ? lerp(4, neck, smooth(0, 0.5, t)) : lerp(neck, bulb, smooth(0.5, 0.95, t)))));
  }

  function drawBubbles(dt) {
    // bubbles slip behind the numbers: they fade while crossing the digit row, so they never sit on the
    // type as stray dots (with four digits the row spans almost the whole glass)
    const rowHalf = (ADV * (3 + m10Show) + COLON_ADV) / 2 + 3;
    for (const b of bubbles) {
      if (!b.on) continue;
      b.y += b.vy * dt;
      b.x += Math.sin(tNow * 3 + b.ph) * 0.12;
      const s = surfAt(b.x);
      if (b.y - b.r <= s + 0.6 || lv < 0.02) {
        b.on = false;
        setAttr(b.el, "opacity", 0);
        poke(b.x, -0.3);
        continue;
      }
      const wob = 1 + 0.1 * Math.sin(tNow * 9 + b.ph);
      setAttr(b.el, "transform", `translate(${f1(b.x)} ${f1(b.y)}) scale(${(b.r * wob).toFixed(2)} ${(b.r / wob).toFixed(2)})`);
      const veil = Math.abs(b.x) < rowHalf ? smooth(17, 27, Math.abs(b.y + 0.5)) : 1;
      setAttr(b.el, "opacity", (0.9 * veil).toFixed(2));
    }
  }

  function drawMarks(dt) {
    for (const m of marks) {
      const fk = m.k / 6;
      const want = (phase === "live" || phase === "out") && lv < fk - 0.02 ? 1 : 0;
      m.o += (want - m.o) * (1 - Math.exp(-dt * (want ? 0.8 : 4)));
      const o = Math.round(m.o * 50) / 50;
      if (o !== m.shown) { m.shown = o; setAttr(m.el, "opacity", (o * 0.24).toFixed(3)); }
    }
  }

  function frame(t, dt) {
    if (!root.isConnected) {
      const m = document.getElementById("countdown");
      if (m) m.appendChild(root);
    }
    tNow = t;
    const nowMs = performance.now();
    const now = Date.now();
    let ms = msLeft(now);
    if (shift && ms <= 0 && !state.swapping && phase === "live") { shift = 0; ctx.sim.swapNow(); }
    const secs = Math.ceil(ms / 1000);

    if (phase === "pre") {
      // loader:done may have fired before this module started; check the overlay itself
      if ((preCheck += dt) > 0.3) { preCheck = 0; if (loaderGone() && !introStarted) startIntro(); }
      return;
    }

    // ---- clock ----
    // the reveal always runs to the end, even when a swap lands in the middle of it and takes the phase
    if (introStarted && !introDone) {
      introT += dt;
      const draw = smooth(0, 1.05, introT);
      setAttr(maskPath, "stroke-dashoffset", (1 - draw).toFixed(4));
      const faceO = smooth(0.35, 1.1, introT).toFixed(3);
      setAttr(faceInkG, "opacity", faceO);
      setAttr(faceCreamG, "opacity", faceO);
      setAttr(glint, "opacity", smooth(0.8, 1.4, introT).toFixed(3));
      if (phase === "intro") {
        if (!introSpawned && introT > 0.5) { introSpawned = true; rewind(unborn() ? 1 : ms / period, 9, 0.85); }
        if (!introSpun && introT > 0.95) { introSpun = true; setTime(secs, "spin"); lastSecs = secs; }
      }
      if (introT > 2.9) {
        introDone = true;
        rimEl.removeAttribute("mask");
        faceInkG.removeAttribute("opacity");
        faceCreamG.removeAttribute("opacity");
        glint.removeAttribute("opacity");
        if (phase === "intro") { phase = "live"; lvTarget = unborn() ? 1 : ms / period; }
      }
    }
    if (phase === "live" || phase === "out" || phase === "in") {
      if (lastSecs === null) lastSecs = secs;
      if (secs !== lastSecs) {
        if (secs > lastSecs + 2) setTime(secs, reduced ? "snap" : "spin");
        else if (secs > lastSecs) setTime(secs, "up");
        else setTime(secs, visible ? "down" : "snap");
        if (secs === lastSecs - 1 && phase === "live" && !reduced && !unborn()) {
          // one drop lets go every second
          const m0 = moodOf(ms, nowMs);
          const fin = m0 === "final" || m0 === "last";
          colonGlow = 1;
          if (visible && lv > 0.004) {
            const hole = holeNow();
            const L = 10.3;
            spawnPlume(hole.x, hole.y + L - 4, { size: fin ? 1.25 : 1, life: fin ? 2.4 : 2.8 });
          }
          if (fin) { beatT = 0; beatAmp = m0 === "last" ? 0.05 : 0.032; }
          if (m0 === "last" && visible) {
            const c = toClient(HX, HY + 30);
            bus.emit("sfx", { name: "tick" });
            bus.emit("ripple", { x: c.x, y: c.y, strength: 0.1 + 0.03 * (10 - secs) });
          }
          if (m0 === "last" && secs === 9) { const c = toClient(0, 0); bus.emit("jelly:look", { x: c.x, y: c.y }); }
        }
        if (secs === 0 && lastSecs > 0 && visible && !unborn()) {
          const c = toClient(0, 40);
          bus.emit("ripple", { x: c.x, y: c.y, strength: 0.55 });
        }
        lastSecs = secs;
      }
      if (phase === "live") lvTarget = unborn() ? 1 : ms / period;
    }
    showUnborn(unborn() && phase !== "in");
    m10Show += ((Math.floor(secs / 60) >= 10 ? 1 : 0) - m10Show) * (reduced ? 1 : 1 - Math.exp(-dt * 7));
    if (Math.abs(m10Show - Math.round(m10Show)) < 0.002) m10Show = Math.round(m10Show);

    // mood, copy and the accessible label
    const md = moodOf(ms, nowMs);
    if (md !== mood || (quipUntil && nowMs > quipUntil)) {
      if (quipUntil && nowMs > quipUntil) quipUntil = 0;
      mood = md;
      applyMood(md, nowMs);
    }
    if (nowMs - lastAria > 15000) {
      lastAria = nowMs;
      const mm = Math.floor(secs / 60), ss = secs % 60;
      setAttr(root, "aria-label", phase === "out" || phase === "in" ? `Swapping brains, v${swapTo} going in` : unborn() ? "No brain yet. The first one lands at launch." : `Next brain in ${mm} minutes ${ss} seconds. Running brain v${Math.round(ver.target)}.`);
    }
    if (swapBtn) swapBtn.disabled = phase === "out" || phase === "in" || state.swapping;

    // springs that must run even off screen so nothing jumps on return
    for (const d of dig) {
      if (d.pend !== null && nowMs >= d.at) { d.target = d.pend; d.pend = null; }
      if (reduced || !visible) { if (d.pend === null) { d.pos = d.target; d.vel = 0; } continue; }
      const a = d.w * d.w * (d.target - d.pos) - 2 * d.z * d.w * d.vel;
      d.vel += a * dt; d.pos += d.vel * dt;
      if (Math.abs(d.target - d.pos) < 0.0004 && Math.abs(d.vel) < 0.003) { d.pos = d.target; d.vel = 0; }
    }
    if (reduced || !visible) { ver.pos = ver.target; ver.vel = 0; }
    else {
      const a = 64 * (ver.target - ver.pos) - 2 * 0.55 * 8 * ver.vel;
      ver.vel += a * dt; ver.pos += ver.vel * dt;
      if (Math.abs(ver.target - ver.pos) < 0.0005 && Math.abs(ver.vel) < 0.003) { ver.pos = ver.target; ver.vel = 0; }
    }
    if (reduced) lv = lvTarget;
    else {
      const refill = phase === "in" || phase === "intro";
      const w = refill ? 5.5 : phase === "out" ? 3.2 : 4, z = refill ? 0.45 : 1;
      lvV += (w * w * (lvTarget - lv) - 2 * z * w * lvV) * dt;
      lv += lvV * dt;
    }
    lv = clamp(lv, -0.02, 1.06);

    if (!visible) return;

    // ---- motion ----
    if (!reduced) {
      // shared scroll state, no layout read here. vy is the last scroll event's delta and is not reset
      // when scrolling stops, so it only counts on frames where y actually moved.
      const sy = ctx.scroll.y, dyS = sy !== lastScroll ? clamp(ctx.scroll.vy, -80, 80) : 0;
      lastScroll = sy;
      tiltV += dyS * 0.0035;
      const target = hover ? clamp(hoverX / 520, -0.13, 0.13) : 0;
      tiltV += (-(tilt - target) * 30 - tiltV * 3.0) * dt;
      tilt = clamp(tilt + tiltV * dt, -0.32, 0.32);
      if (hover) {
        const s = levelY(lv);
        if (Math.abs(hoverY - s) < 16) poke(hoverX, clamp((Math.hypot(ctx.pointer.vx, ctx.pointer.vy) - 40) * 0.0003, 0, 0.4));
      }
      if (phase === "in") poke(HX + Math.sin(t * 7) * 30, 0.22);
      acc = Math.min(acc + dt, 0.05);
      while (acc >= 1 / 60) { waveStep(); acc -= 1 / 60; }
      const md2 = mood;
      const agTarget = md2 === "last" ? 2 : md2 === "final" ? 1.5 : phase === "in" ? 2.2 : 1;
      agitate += (agTarget - agitate) * (1 - Math.exp(-dt * 1.5));
      beatT += dt;
      colonGlow *= Math.exp(-dt * 2.2);
      beatS = 1 + beatAmp * (pulse(beatT) + 0.5 * pulse(beatT - 0.22));
      bobX = 0.7 * Math.sin(t * 0.5 + 1);
      bobY = 1.8 * Math.sin(t * 0.85);
      setAttr(floatG, "transform", `translate(${bobX.toFixed(2)} ${bobY.toFixed(2)})`);
      setAttr(beatG, "transform", beatS !== 1 ? `scale(${beatS.toFixed(4)})` : "");
      // bubbles now and then; a fizz in the last minute
      bubbleTimer -= dt;
      if (bubbleTimer <= 0 && lv > 0.1) {
        const r = 1.7 + Math.random() * 1.5;
        const x = (Math.random() < 0.5 ? -1 : 1) * (36 + Math.random() * 24); // near the walls, clear of the type
        spawnBubble(x, Math.min(82, Math.sqrt(Math.max(0, 80 * 80 - x * x)) - 4), r);
        bubbleTimer = md2 === "final" || md2 === "last" ? 0.5 + Math.random() * 0.8 : 2.4 + Math.random() * 3.5;
      }
    }

    drawLiquid(t);
    drawDigits(t);
    drawVersion();
    drawMarks(dt);
    drawHang(ms);
    if (!reduced) { drawBubbles(dt); drawPlumes(dt); }
  }

  // first paint before the intro, so the layout is right under the loader
  setTime(0, "snap");
  drawLiquid(0);
  drawDigits(0);
  drawVersion();
  setAttr(faceInkG, "opacity", 0);
  setAttr(faceCreamG, "opacity", 0);
  setAttr(glint, "opacity", 0);
  setVoice(VOICE.calm, true);
  loop.add(frame);
}
