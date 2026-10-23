// ask: "Ask me something" at the bottom of the dive.
// - The input is a living glass bubble (same glass as my bell): it breathes, swells when focused and dents
//   where each letter lands. The placeholder letters breathe on their variable axes.
// - A tiny Turri swims beside it and watches the text: your caret while you type (its face reacts to what the
//   question is turning into), the question as it buds off the bubble and floats in, then each word it writes.
// - Answers come from a local Q&A in my voice (ask/qa.js), typed word by word with a human cadence, each word
//   condensing out of an ink cloud. The condensing is a Web Animation laid over a crisp resting style, so a word
//   always ends sharp, whatever happens to the frame loop. Set config.api and the same box asks the live brain.
// - Little question bubbles float under the input; tap one and it becomes the question.
// Frame budget: this module never asks for layout. Rects arrive from an IntersectionObserver (its entries carry the
// rect the browser has just laid out) and sizes from ResizeObservers; both are cached in page coordinates and the
// frame turns them into client coordinates with ctx.scroll.y. The tiny jelly composes its own matrices.
// Emits: ripple, sfx {bubble|tick|chime}, ask {q}, ask:answer {q, id, text}. Listens: vault, brain:swap:*.
// Exposes ctx.ask = { ask(q), say(text) } for other modules and the console.
import { createMembrane } from "./ask/membrane.js";
import { createTinyJelly } from "./ask/jelly.js";
import { createSource } from "./ask/source.js";
import { GREETING, AFTER_SWAP, POKES, SEEDS, peek } from "./ask/qa.js";
import { el, svgEl, clamp, lerp, rand, pick, ease, outCubic, smooth, r1, ringPath, blobPath } from "./ask/util.js";

const PLACEHOLDER = "Ask me something";
// a word condensing out of ink: opacity, blur, a jelly rise and the weight settling, each on its own clock
const EASE_OUT = "cubic-bezier(.16, 1, .3, 1)";
const EASE_JELLY = "cubic-bezier(.34, 1.56, .64, 1)";
const AXES_INK = '"wght" 820, "SOFT" 100, "WONK" 1, "opsz" 72';
const AXES_SET = '"wght" 380, "SOFT" 100, "WONK" 0, "opsz" 72';
// lines I say unprompted (the greeting, pokes, after a swap) are well rehearsed, so they come out quicker
const BRISK = 0.55;

export function init(ctx) {
  const mount = document.getElementById("ask");
  if (!mount || !ctx.assets?.jelly) return;
  const { bus, loop, pointer } = ctx;
  const reduced = !!ctx.reduced;
  const source = createSource(ctx);
  mount.textContent = "";
  mount.classList.add("ask");

  // ---------- DOM ----------
  const stage = el("div", "ask__stage", mount);
  const jcol = el("div", "ask__jcol", stage);
  const jwrap = el("div", "ask__jelly", jcol);
  const talk = el("div", "ask__talk", stage);
  const heard = el("p", "ask__heard", talk);
  heard.setAttribute("aria-hidden", "true");
  const said = el("div", "ask__said", talk);
  said.setAttribute("aria-hidden", "true");
  const sr = el("p", "ask__sr", talk);
  sr.setAttribute("aria-live", "polite");

  const form = el("form", "ask__form", talk);
  form.noValidate = true;
  form.setAttribute("autocomplete", "off");
  const label = el("label", "ask__sr", form, PLACEHOLDER);
  label.htmlFor = "ask-q";
  const bubble = el("div", "ask__bubble", form);
  const memSvg = svgEl("svg", { class: "ask__membrane", "aria-hidden": "true", focusable: "false" }, bubble);
  const ph = el("span", "ask__ph", bubble);
  ph.setAttribute("aria-hidden", "true");
  // each letter breathes on its own; a plain space would collapse inside its inline-block, so spaces are no-break
  [...PLACEHOLDER].forEach((ch, i) => { const s = el("span", null, ph, ch === " " ? String.fromCharCode(160) : ch); s.style.setProperty("--i", i); });
  const input = el("input", "ask__input", bubble);
  Object.assign(input, { id: "ask-q", type: "text", name: "q", maxLength: 160, autocomplete: "off", spellcheck: false });
  input.setAttribute("enterkeyhint", "send");
  const send = el("button", "ask__send", bubble);
  send.type = "submit";
  send.setAttribute("aria-label", "Ask");
  send.innerHTML = `<svg viewBox="-32 -32 64 64" aria-hidden="true" focusable="false"><path class="ask-ink" d="${blobPath(0, 1, 27, 2.4, 22, 0.94)}"/><path class="ask-cream" d="${glintD()}"/></svg><span>ask</span>`;

  const seedsEl = el("div", "ask__seeds", talk);
  seedsEl.setAttribute("role", "group");
  seedsEl.setAttribute("aria-label", "Questions people ask me");

  const fx = svgEl("svg", { class: "ask__fx", "aria-hidden": "true", focusable: "false" }, mount);

  // ---------- parts ----------
  const membrane = createMembrane(memSvg, ctx.mobile
    ? { seed: 11, pad: 20, n: 24, sub: 6, rimTop: 3, rimBot: 5.6, bw: 0.9, jitter: 0.012, wob: reduced ? 0 : 0.8, glint2: false }
    : { seed: 11, pad: 20, n: 30, sub: 6, rimTop: 4.2, rimBot: 8, bw: 1.3, jitter: 0.012, wob: reduced ? 0 : 1, glint2: false });
  const jelly = createTinyJelly(jwrap, ctx);

  // ---------- state ----------
  let visible = false, greeted = false, frameN = 0;
  let job = null, gen = 0, busy = false, controller = null, fly = null;
  let thoughtAt = 0, moodUntil = 0, lookAt = null, hasText = false, caretLx = null;
  let idleSince = performance.now(), px = pointer.x, py = pointer.y, pointerAt = 0;
  let swimY = null, swimT = "", lastSwimBeat = 0;
  let measureFont = "", padL = 30;
  const mctx = document.createElement("canvas").getContext("2d");
  const perf = ctx.params.has("askperf") ? (window.__askPerf = { n: 0, sum: 0, max: 0, avg: 0 }) : null;

  // ---------- geometry ----------
  // probe(node, fn) asks for a node's rect: the IntersectionObserver delivers it after the next layout the browser
  // does anyway, so nothing is ever forced. Everything is kept in page coordinates (rect + ctx.scroll.y).
  const box = () => ({ l: 0, t: 0, w: 0, h: 0 });
  const geo = { ready: false, host: box(), stage: box(), jcol: box(), bubble: box(), said: box(), word: box(), look: box(), dot: box(), hasWord: false, hasLook: false, lh: 40, minH: 0, lineH: 0 };
  const put = (into, r, sy) => { into.l = r.left; into.t = r.top + sy; into.w = r.width; into.h = r.height; return r.width > 0 || r.height > 0; };
  const probes = new WeakMap();
  const probeIO = new IntersectionObserver((es) => {
    const sy = ctx.scroll.y;
    for (const e of es) {
      probeIO.unobserve(e.target);
      const fn = probes.get(e.target);
      if (!fn) continue;
      probes.delete(e.target);
      fn(e.boundingClientRect, sy, e.target.isConnected);
    }
  });
  function probe(node, fn) {
    if (!node) return;
    const pending = probes.has(node);
    probes.set(node, fn);
    if (!pending) probeIO.observe(node);
  }
  let needGeo = true, sinceGeo = 0, fitPending = false, saidH = 0, saidMoveUntil = 0, dotPop = null;
  function refreshGeo() {
    probe(mount, (r, sy) => { geo.ready = put(geo.host, r, sy); });
    probe(stage, (r, sy) => put(geo.stage, r, sy));
    probe(jcol, (r, sy) => put(geo.jcol, r, sy));
    probe(bubble, (r, sy) => put(geo.bubble, r, sy));
    probe(said, (r, sy) => put(geo.said, r, sy));
    probeWord();
    if (lookAt && lookAt !== "up") probeLook();
  }
  // the newest word (where the eyes and the swim go) and the line's height (how tall the answer box must be)
  function probeWord() {
    const J = job;
    if (!J) return;
    const w = J.last;
    if (w) probe(w, (r, sy, live) => { if (job === J && J.last === w && live) geo.hasWord = put(geo.word, r, sy); });
    probe(J.line, (r, sy, live) => { if (job === J && live) { geo.lineH = r.height; fitPending = true; } });
  }
  function probeLook() {
    const sel = lookAt, n = lookEl(sel);
    geo.hasLook = false;
    if (n) probe(n, (r, sy) => { if (lookAt === sel) geo.hasLook = put(geo.look, r, sy); });
  }
  // text metrics for the caret, the line height and the answer box's floor (style reads, in observer callbacks)
  function readMetrics() {
    const cs = getComputedStyle(input);
    measureFont = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    padL = parseFloat(cs.paddingLeft) || 30;
    const ss = getComputedStyle(said);
    geo.lh = parseFloat(ss.lineHeight) || 40;
    geo.minH = parseFloat(ss.minHeight) || 0;
    fitPending = true;
  }

  // sizes: the input bubble (its membrane), every seed (its rim) and the question in flight
  const lay = { w: 0, h: 0, pending: false };
  const seedOf = new WeakMap();
  const seedDraw = [], seedWake = [];
  const sizeRO = new ResizeObserver((es) => {
    for (const e of es) {
      const b = e.borderBoxSize?.[0], w = b ? b.inlineSize : e.contentRect.width, h = b ? b.blockSize : e.contentRect.height;
      const n = e.target;
      if (n === bubble) { lay.w = w; lay.h = h; lay.pending = true; readMetrics(); }
      else if (fly && n === fly.node) { fly.w = w; fly.hgt = h; fly.measured = true; sizeRO.unobserve(n); }
      else { const s = seedOf.get(n); if (s && s.el.isConnected) { s.w = w; s.h = h; if (!seedDraw.includes(s)) seedDraw.push(s); } }
    }
    needGeo = true;
  });
  function applyLayout(t) {
    lay.pending = false;
    if (lay.w < 10) return;
    membrane.resize(lay.w, lay.h);
    membrane.frame(t);
  }

  // ---------- seeds: little question bubbles ----------
  const pool = SEEDS.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  // the obvious ones first
  ["What are you?", "When's the next brain?", "Is it safe?", "Wen moon?"].reverse().forEach((q) => { pool.splice(pool.indexOf(q), 1); pool.unshift(q); });
  const seedCount = ctx.mobile ? 4 : 5;
  const seeds = [];
  let seedSeed = 3;
  function makeSeed(q, enter) {
    const b = el("button", "ask__seed", null);
    b.type = "button";
    const s = svgEl("svg", { class: "ask__seed-rim", "aria-hidden": "true", focusable: "false" }, b);
    el("span", "ask__seed-t", b, q);
    b.style.setProperty("--bob", `${rand(3.6, 5.2).toFixed(2)}s`);
    b.style.setProperty("--d", `${rand(-4, 0).toFixed(2)}s`);
    b.style.setProperty("--tilt", `${rand(-2.2, 2.2).toFixed(2)}deg`);
    const m = createMembrane(s, { seed: ++seedSeed * 7, pad: 7, n: 14, sub: 6, bulgeK: 0.1, rimTop: 1.2, rimBot: 2.6, bw: 0.45, jitter: 0.035, wob: 0, glint: false, glassClass: "ask-sglass", rimClass: "ask-line" });
    const item = { el: b, q, m, s, w: 0, h: 0, wake: 0, enter: !!enter };
    b.addEventListener("click", () => useSeed(item));
    if (enter) b.classList.add("is-new");
    seeds.push(item);
    seedOf.set(b, item);
    sizeRO.observe(b);   // its layout size, not its on-screen rect: a new seed is still scaled down while it rises in
    return item;
  }
  function seedStep() {
    for (const s of seedDraw) {
      if (s.w >= 4) { s.m.resize(s.w, s.h); s.m.frame(0); }
      if (s.enter) { s.enter = false; s.wake = frameN + 1; seedWake.push(s); }
    }
    seedDraw.length = 0;
    // one frame after its rim is drawn (and its hidden state has been painted) a new seed rises in
    for (let i = seedWake.length - 1; i >= 0; i--) {
      if (frameN < seedWake[i].wake) continue;
      seedWake[i].el.classList.remove("is-new");
      seedWake.splice(i, 1);
    }
  }
  for (let i = 0; i < seedCount && pool.length; i++) seedsEl.appendChild(makeSeed(pool.shift()).el);

  function useSeed(item) {
    if (item.used) return;
    item.used = true;
    item.el.classList.add("is-popped");
    ask(item.q, { from: item.el });
    setTimeout(() => {
      const idx = seeds.indexOf(item);
      pool.push(item.q);
      const next = makeSeed(pool.shift(), true);
      seeds.splice(seeds.indexOf(next), 1);
      seeds.splice(idx, 1, next);
      sizeRO.unobserve(item.el);
      item.el.replaceWith(next.el);
    }, reduced ? 50 : 900);
  }

  // ---------- typing (the answer, word by word) ----------
  const dot = el("span", "ask__dot", null);
  dot.setAttribute("aria-hidden", "true");
  dot.innerHTML = `<svg viewBox="-12 -12 24 24" focusable="false"><path class="ask-cream" d="${ringPath(0, 0, 8, 2.6, 1.7, 16)}"/></svg>`;

  function tokenize(text, codeOk = true) {
    const out = [];
    const parts = codeOk ? String(text).split("`") : [String(text)];
    parts.forEach((part, pi) => {
      const code = codeOk && pi % 2 === 1;
      if (code) { if (part) out.push({ t: part, code: true, sp: out.length > 0 }); return; }
      const lead = /^\s/.test(part);
      part.split(/\s+/).filter(Boolean).forEach((w, i) => out.push({ t: w, code: false, sp: out.length > 0 && (i > 0 || lead) }));
    });
    return out;
  }

  function sinkOld() {
    // only one line is ever in flow and it sits at the top of the box, so its position needs no measuring
    for (const line of said.querySelectorAll(".ask__line:not(.is-sinking)")) {
      line.style.top = "0px";
      line.classList.add("is-sinking");
      setTimeout(() => line.remove(), reduced ? 10 : 1300);
    }
    dot.remove();
  }

  // text: a whole answer at once (local Q&A). stream: chunks as they arrive (config.api); words go out as they complete.
  // pace scales the gaps between words (1 = thinking it through, BRISK = a line I've said before).
  function startWriting({ text = null, stream = null, onDone, pace = 1, delay = 0.18 } = {}) {
    sinkOld();
    const line = el("p", "ask__line", said);
    const J = { line, queue: [], words: [], nextAt: performance.now() / 1000 + (reduced ? 0 : delay), done: false, ended: false, settled: false, burst: 0, pace, onDone, last: null, text: "", popAt: 0, fitAt: 0, beatAt: -1 };
    job = J;
    geo.hasWord = false;
    const push = (s) => tokenize(s, false).forEach((tk) => { tk.sp = J.words.length + J.queue.length > 0; J.queue.push(tk); });
    if (text != null) {
      J.text = text;
      J.queue = tokenize(text, true);
      J.ended = true;
      sr.textContent = text.replace(/`/g, "");
      if (reduced) flushAll(J);
      return J;
    }
    (async () => {
      let buf = "";
      try {
        for await (const chunk of stream) {
          if (job !== J) return;
          buf += chunk;
          J.text += chunk;
          const m = buf.match(/^([\s\S]*\s)(\S*)$/);
          if (m) { push(m[1]); buf = m[2]; }
        }
      } catch (err) { /* aborted or dropped: keep what arrived */ }
      if (job !== J) return;
      push(buf);
      J.ended = true;
      sr.textContent = J.text;
      if (reduced) flushAll(J);
    })();
    return J;
  }

  function gap(J, w) {
    let d = clamp(60 + w.length * 11, 72, 210) * rand(0.78, 1.22);
    const end = w.at(-1);
    if (/[.?…”]/.test(end)) d += 380; else if (/[,;:]/.test(end)) d += 170;
    if (J.burst > 0) { d *= 0.55; J.burst--; }
    if (d > 400) J.burst = 2;
    return (d * J.pace) / 1000;
  }

  // The resting style of a word is the crisp, settled one; the ink cloud it condenses from is an animation over it.
  // If the animation never runs or gets cut short, the word is simply sharp.
  function condense(w) {
    if (reduced || typeof w.animate !== "function") return;
    w.animate({ opacity: [0, 1] }, { duration: 450, easing: EASE_OUT });
    w.animate({ filter: ["blur(9px)", "blur(0px)"] }, { duration: 750, easing: EASE_OUT });
    w.animate({ transform: ["translateY(.34em) scale(.92)", "none"] }, { duration: 900, easing: EASE_JELLY });
    w.animate({ fontVariationSettings: [AXES_INK, AXES_SET] }, { duration: 1100, easing: EASE_OUT });
  }

  function emitWord(J, tok, instant, t) {
    if (tok.sp) J.line.appendChild(document.createTextNode(" "));
    const w = el(tok.code ? "code" : "span", tok.code ? "ask__w ask__code" : "ask__w", J.line, tok.t);
    if (tok.code) {
      w.title = "Copy";
      w.addEventListener("click", () => copy(tok.t, w));
    }
    J.words.push(w);
    J.last = w;
    J.line.appendChild(dot);
    probeWord();
    if (instant) return;
    condense(w);
    if (J.words.length % 2 === 1) bus.emit("sfx", { name: "tick" });
    // a small beat per word, but never faster than the bell can squeeze
    if (t - J.beatAt > 0.22) { J.beatAt = t; jelly.beat(0.28, 1.3); }
  }

  function flushAll(J) {
    while (J.queue.length) emitWord(J, J.queue.shift(), true);
  }

  function writeStep(t) {
    const J = job;
    if (!J) return;
    if (!J.done) {
      if (J.queue.length && t >= J.nextAt) {
        const tok = J.queue.shift();
        emitWord(J, tok, reduced, t);
        J.nextAt = t + gap(J, tok.t);
      }
      if (!J.queue.length && J.ended && t >= J.nextAt - 0.2) {
        J.done = true;
        J.popAt = t + (reduced ? 0 : 0.9);
        J.fitAt = t + (reduced ? 0 : 1.2);
        J.onDone?.(J);
      }
      return;
    }
    // after the last word: the bubble cursor pops where it now sits, then the box fits the settled answer
    if (J.popAt && t >= J.popAt) {
      J.popAt = 0;
      if (dot.parentNode === J.line) probe(dot, (r, sy, live) => { if (job === J && live && dot.parentNode === J.line && put(geo.dot, r, sy)) dotPop = J; });
    }
    if (J.fitAt && t >= J.fitAt) { J.fitAt = 0; J.settled = true; probeWord(); }
  }

  // The said box holds its height while an answer is written (it only grows, gliding), so the input under it
  // never jumps up mid-answer; once the answer has settled the box fits it.
  function fitSaid(t) {
    const content = Math.max(geo.minH, geo.lineH);
    if (!(content > 0)) return;
    const want = job && !job.settled ? Math.max(saidH, content) : content;
    if (Math.abs(want - saidH) < 0.5) return;
    saidH = want;
    said.style.height = `${want.toFixed(1)}px`;
    saidMoveUntil = t + 0.75;
  }

  // ---------- fx: pops, the question bubble in flight (host-local coordinates) ----------
  const fxItems = [];
  function popAt(x, y, size = 1, ripple = true) {
    const ring = svgEl("path", { class: "ask-cream" }, fx);
    const drops = Array.from({ length: Math.round(5 + size * 3) }, (_, i) => ({
      el: svgEl("path", { class: "ask-cream" }, fx),
      a: (i / (5 + size * 3)) * Math.PI * 2 + rand(-0.3, 0.3), v: rand(26, 46) * (0.6 + size * 0.5), r: rand(1.4, 3.2) * (0.7 + size * 0.4), s: rand(0, 6),
    }));
    fxItems.push({ kind: "pop", x, y, size, ring, drops, t0: performance.now() / 1000 });
    if (ripple) bus.emit("ripple", { x: geo.host.l + x, y: geo.host.t - ctx.scroll.y + y, strength: 0.35 * size });
    bus.emit("sfx", { name: "bubble" });
  }
  function popDot() {
    const b = geo.dot;
    dot.remove();
    if (!reduced && b.w) popAt(b.l + b.w / 2 - geo.host.l, b.t + b.h / 2 - geo.host.t, 0.45, false);
  }
  function fxStep(t) {
    for (let i = fxItems.length - 1; i >= 0; i--) {
      const f = fxItems[i];
      const p = (t - f.t0) / 0.62;
      if (p >= 1) { f.ring.remove(); f.drops.forEach((d) => d.el.remove()); fxItems.splice(i, 1); continue; }
      const e = outCubic(p);
      const R = (10 + 26 * e) * f.size + 3;
      f.ring.setAttribute("d", ringPath(f.x, f.y, R, Math.max(0.6, 3.6 * f.size * (1 - e)), 2.3 + p * 3, 22));
      f.ring.setAttribute("opacity", (1 - smooth((p - 0.35) / 0.65)).toFixed(2));
      for (const d of f.drops) {
        const dist = d.v * e + 6 * f.size, gy = 14 * p * p;
        d.el.setAttribute("d", blobPath(f.x + Math.cos(d.a) * dist, f.y + Math.sin(d.a) * dist + gy, d.r * (1 - 0.6 * p), d.s, 10));
      }
    }
  }

  // The question buds off the input (or the seed you tapped) and floats into the jelly. Its size and the seed's
  // rect come from the observers; it stays hidden until its first step places it.
  function launch(q, fromEl) {
    if (fly) endFly(false);   // a new question while one is still in the air: the old one just goes
    const node = el("div", "ask__fly", mount);
    node.style.visibility = "hidden";
    const s = svgEl("svg", { class: "ask__fly-rim", "aria-hidden": "true", focusable: "false" }, node);
    el("span", "ask__fly-t", node, q.length > 34 ? `${q.slice(0, 32).trimEnd()}…` : q);
    const m = createMembrane(s, { seed: 5 + Math.floor(rand(0, 40)), pad: 10, n: 14, sub: 6, rimTop: 2.4, rimBot: 4.6, bw: 0.6, jitter: 0.03, wob: 1.6, glintLen: 0.2 });
    return new Promise((resolve) => {
      const F = { node, m, q, from: null, fromReady: !fromEl, w: 0, hgt: 0, measured: false, started: false, sx: 0, sy: 0, ex: 60, ey: 60, t0: 0, dur: reduced ? 0.01 : 1.2, resolve };
      fly = F;
      sizeRO.observe(node);
      if (fromEl) probe(fromEl, (r, sy, live) => { if (live && r.width) F.from = { l: r.left, t: r.top + sy, w: r.width, h: r.height }; F.fromReady = true; });
    });
  }
  function endFly(land, x, y) {
    const F = fly;
    if (!F) return;
    fly = null;
    sizeRO.unobserve(F.node);
    F.node.remove();
    if (land) { popAt(x, y, 0.8); jelly.beat(1.25, 1.5); }
    F.resolve();
  }
  function flyStep(t, dt, sy) {
    const F = fly;
    if (!F || !F.measured || !F.fromReady) return;
    const H = geo.host;
    if (!F.started) {
      F.started = true;
      F.t0 = t;
      F.m.resize(F.w, F.hgt);
      F.m.kick(4);
      if (F.from) { F.sx = F.from.l + F.from.w / 2 - H.l; F.sy = F.from.t + F.from.h / 2 - H.t; }
      else { const B = geo.bubble; F.sx = B.l + padL + Math.min(textW(F.q), B.w * 0.6) / 2 - H.l; F.sy = B.t + B.h / 2 - H.t; }
      F.node.style.visibility = "";
    }
    const mouth = jelly.mouth();
    if (mouth) { F.ex = mouth.x - H.l; F.ey = mouth.y + sy - H.t; }
    const p = clamp((t - F.t0) / F.dur);
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    // it buds straight up out of the bubble, then curls over into the jelly
    const bz = (a, b, c, d) => { const u = 1 - e; return u * u * u * a + 3 * u * u * e * b + 3 * u * e * e * c + e * e * e * d; };
    const x = bz(F.sx, F.sx + 6, F.ex + 110, F.ex) + Math.sin(p * 8) * 5 * (1 - p);
    const y = bz(F.sy, F.sy - 150, F.ey - 90, F.ey);
    const sc = lerp(1.08, 0.42, smooth(p));
    F.node.style.transform = `translate(${r1(x - F.w / 2)}px, ${r1(y - F.hgt / 2)}px) scale(${sc.toFixed(3)}) rotate(${(Math.sin(p * 6) * 4).toFixed(2)}deg)`;
    F.m.step(t, dt);
    jelly.setTarget({ x: x + H.l, y: y + H.t - sy });
    if (p >= 1) endFly(true, x, y);
  }

  // ---------- the conversation ----------
  async function ask(raw, { from } = {}) {
    const q = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (!q) {
      membrane.kick(5);
      jelly.setMood("narrow");
      moodUntil = performance.now() / 1000 + 1.2;
      return;
    }
    const my = ++gen;
    controller?.abort();
    controller = new AbortController();
    busy = true;
    input.value = "";
    setHasText(false);
    if (!from) { membrane.poke(membrane.sAtX(padL + 40), 9, 0.08, 11, 3); membrane.kick(3); }
    setHeard(q);
    bus.emit("ask", { q });
    const answerP = source.ask(q, { signal: controller.signal }).catch(() => null);
    jelly.think(true);
    jelly.rewire();
    jelly.setMood("calm");
    await launch(q, from);
    if (my !== gen) return;
    const t0 = performance.now();
    const ans = await answerP;
    if (my !== gen || !ans) { if (my === gen) { busy = false; jelly.think(false); } return; }
    const wait = (reduced ? 0 : 420) - (performance.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (my !== gen) return;
    jelly.think(false);
    jelly.setMood(ans.mood);
    lookAt = ans.look;
    if (lookAt && lookAt !== "up") probeLook();
    moodUntil = Infinity;
    startWriting({
      text: ans.text,
      stream: ans.stream,
      onDone: (J) => {
        if (my !== gen) return;
        busy = false;
        moodUntil = performance.now() / 1000 + 2.8;
        bus.emit("ask:answer", { q, id: ans.id, text: J.text });
        // now and then the question makes it into my live thoughts (never your words, just the gist)
        const now = performance.now();
        if (ans.thought && now - thoughtAt > 30000 && Math.random() < 0.6) {
          thoughtAt = now;
          setTimeout(() => ctx.sim?.think?.("look", ans.thought), 1600);
        }
      },
    });
  }

  function say(text, mood = "calm", { pace = BRISK, delay } = {}) {
    const my = ++gen;
    controller?.abort();
    jelly.think(false);
    jelly.setMood(mood);
    moodUntil = Infinity;
    lookAt = null;
    busy = true;
    startWriting({
      text,
      pace,
      delay,
      onDone: () => { if (my === gen) { busy = false; moodUntil = performance.now() / 1000 + 2.2; } },
    });
  }

  function setHeard(q) {
    heard.textContent = "";
    el("span", "ask__heard-k", heard, "You asked");
    el("span", "ask__heard-q", heard, q);
    if (!reduced && typeof heard.animate === "function") {
      heard.animate({ opacity: [0, 1] }, { duration: 700, easing: EASE_OUT });
      heard.animate({ transform: ["translateY(6px)", "none"] }, { duration: 900, easing: EASE_JELLY });
    }
    needGeo = true;   // a long question wraps and moves everything under it
  }

  function copy(text, w) {
    navigator.clipboard?.writeText(text).catch(() => {});
    w.classList.add("is-copied");
    setTimeout(() => w.classList.remove("is-copied"), 1400);
    jelly.setMood("soft");
    moodUntil = performance.now() / 1000 + 1.6;
    bus.emit("sfx", { name: "chime" });
  }

  // ---------- input ----------
  function textW(text) {
    if (!measureFont) return text.length * 11;
    mctx.font = measureFont;
    return mctx.measureText(text).width;
  }
  // the caret's x inside the bubble, from the text width alone (the frame adds the bubble's position, so scrolling
  // never leaves it stale; past the right edge the input scrolls and the caret stays near it)
  function caretAt() {
    const upto = input.value.slice(0, input.selectionStart ?? input.value.length);
    return clamp(padL + textW(upto), padL, Math.max(padL, (geo.bubble.w || lay.w) - 70));
  }
  function setHasText(v) {
    if (v === hasText) return;
    hasText = v;
    form.classList.toggle("has-text", v);
  }
  input.addEventListener("input", (e) => {
    setHasText(input.value.length > 0);
    caretLx = caretAt();
    if (!reduced) {
      const del = (e.inputType || "").startsWith("delete");
      membrane.poke(membrane.sAtX(caretLx), del ? -2.4 : 2.8, 0.06, 16, 4.5);
      if (Math.random() < 0.35) jelly.beat(0.3, 1.4);
    }
    const p = peek(input.value);
    jelly.setMood(p ? p.mood : "calm");
    moodUntil = Infinity;
    wake();
  });
  ["keyup", "click", "select"].forEach((ev) => input.addEventListener(ev, () => { caretLx = caretAt(); }));
  input.addEventListener("focus", () => { membrane.focus(true); form.classList.add("is-focus"); caretLx = caretAt(); jelly.beat(0.8, 1.2); wake(); });
  input.addEventListener("blur", () => { membrane.focus(false); form.classList.remove("is-focus"); caretLx = null; if (!busy) moodUntil = performance.now() / 1000 + 0.6; });
  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });

  // poke the tiny jelly
  jwrap.addEventListener("click", (e) => {
    jelly.poke();
    bus.emit("ripple", { x: e.clientX, y: e.clientY, strength: 0.4 });
    moodUntil = performance.now() / 1000 + 1.4;
    if (!busy) say(pick(POKES)(ctx), "wide");
  });

  // ---------- live feed ----------
  bus.on("vault", () => { if (visible) jelly.beat(0.4, 1.1); });
  bus.on("brain:swap:start", () => { jelly.shut(true); });
  bus.on("brain:swap:mid", () => { jelly.rewire(); jelly.beat(1, 1.4); });
  bus.on("brain:swap:done", () => {
    jelly.shut(false);
    jelly.setMood("wide");
    moodUntil = performance.now() / 1000 + 1.5;
    if (visible && !busy && document.activeElement !== input) say(AFTER_SWAP(ctx), "soft");
  });

  // ---------- attention + swimming ----------
  function wake() { idleSince = performance.now(); jelly.sleep(0); }
  const lookEls = new Map();
  function lookEl(sel) { if (!lookEls.has(sel)) lookEls.set(sel, document.querySelector(sel)); return lookEls.get(sel); }

  // where the eyes go, in client coordinates (every rect here comes from the cache)
  function lookTarget(now, sy) {
    if (fly) return null; // flyStep aims the eyes
    const J = job;
    if (J && !J.done && J.last && geo.hasWord) { const w = geo.word; return { x: w.l + w.w, y: w.t - sy + w.h * 0.55 }; }
    if (lookAt && now / 1000 < moodUntil) {
      if (lookAt === "up") { const m = jelly.mouth(); return m ? { x: m.x + 40, y: m.y - 900 } : null; }
      if (geo.hasLook) { const r = geo.look; return { x: r.l + r.w / 2, y: r.t - sy + r.h / 2 }; }
    }
    if (caretLx != null && document.activeElement === input) { const b = geo.bubble; return { x: b.l + caretLx, y: b.t - sy + b.h / 2 }; }
    if (now - pointerAt < 2600 && pointer.active) return { x: pointer.x, y: pointer.y };
    // nothing going on: it rereads its last answer, line by line
    if (now - idleSince > 5000 && J && geo.lineH > 4) {
      const s = geo.said, lh = geo.lh;
      const lines = Math.max(1, Math.round(geo.lineH / lh));
      const k = (now / 1000) / 1.7;
      return { x: s.l + s.w * (k % 1), y: s.t - sy + lh * ((Math.floor(k) % lines) + 0.5) };
    }
    return null;
  }

  // where it swims to, relative to the stage (page coordinates on both sides, so scrolling cancels out)
  function swimTarget() {
    const st = geo.stage, jh = geo.jcol.w ? geo.jcol.w * 7 / 6 : 120;
    let ref;
    const J = job;
    if (J && !J.done && J.last && geo.hasWord) ref = geo.word.t + geo.word.h / 2;
    else if (fly || hasText || document.activeElement === input) ref = geo.bubble.t + geo.bubble.h * 0.42;
    else ref = geo.said.h > 4 ? geo.said.t + Math.min(geo.said.h / 2, 60) : geo.bubble.t;
    const y = ref - st.t - jh * 0.36;
    return clamp(y, -jh * 0.1, Math.max(0, st.h - jh * 0.5));
  }

  // the svg's viewBox (-300 -250 600 700) fills the jelly column's width; the column moves only by swimY
  function placeJelly(sy) {
    const c = geo.jcol, s = c.w / 600;
    jelly.place(c.l + 300 * s, c.t - sy + r1(swimY || 0) + 250 * s, s);
  }

  const io = new IntersectionObserver((es) => {
    visible = es[es.length - 1].isIntersecting;
    if (visible) needGeo = true;
    if (visible && !greeted) {
      greeted = true;
      // it notices you and starts talking at once, so the line is written by the time you've settled
      // never over a question already asked (a quick visitor asks before the greeting): it would drop the question
      if (!job && !busy) say(GREETING(ctx), "proud", { delay: reduced ? 0 : 0.22 });
    }
  }, { rootMargin: "60px 0px" });
  io.observe(mount);

  loop.add((t, dt) => {
    if (!visible) return;
    const p0 = perf ? performance.now() : 0;
    frame(t, dt);
    if (perf) { const d = performance.now() - p0; perf.n++; perf.sum += d; perf.max = Math.max(perf.max, d); perf.avg = perf.sum / perf.n; }
  });
  function frame(t, dt) {
    frameN++;
    const now = performance.now();
    const sy = ctx.scroll.y;
    // fresh rects arrive next frame; while the answer box glides, follow it every frame, otherwise once a second
    if (needGeo || t < saidMoveUntil || ++sinceGeo > 60) { needGeo = false; sinceGeo = 0; refreshGeo(); }
    if (lay.pending) applyLayout(t);
    if (seedDraw.length || seedWake.length) seedStep();
    if (pointer.x !== px || pointer.y !== py) { px = pointer.x; py = pointer.y; pointerAt = now; wake(); }
    if (geo.ready) placeJelly(sy);
    if (!reduced || membrane.busy) membrane.step(t, dt);
    if (dotPop) { const J = dotPop; dotPop = null; if (J === job && dot.parentNode === J.line) popDot(); }
    flyStep(t, dt, sy);
    writeStep(t);
    if (fitPending) { fitPending = false; fitSaid(t); }
    fxStep(t);
    if (t > moodUntil && !(document.activeElement === input && input.value)) { jelly.setMood("calm"); lookAt = null; moodUntil = Infinity; }
    // after a long quiet spell it dozes off
    const idle = (now - idleSince) / 1000;
    if (!busy && idle > 28) jelly.sleep(smooth((idle - 28) / 4));
    if (!geo.ready) return;   // the first rects are on their way
    if (!fly) jelly.setTarget(lookTarget(now, sy));
    const swimTo = swimTarget();
    if (swimY === null) swimY = swimTo;
    const before = swimY;
    swimY += (swimTo - swimY) * ease(dt, reduced ? 0.05 : 0.75);
    if (!reduced && Math.abs(swimTo - swimY) > 24 && now - lastSwimBeat > 900) { lastSwimBeat = now; jelly.beat(0.9, 1.3); }
    jelly.tilt(clamp((swimY - before) / Math.max(dt, 0.001) * -0.03, -8, 8));
    const tf = `translate3d(0, ${r1(swimY)}px, 0)`;
    if (tf !== swimT) { swimT = tf; jwrap.style.transform = tf; }
    placeJelly(sy);
    jelly.update(t, dt);
  }

  // ---------- size ----------
  // the membranes and metrics follow the bubble's size; positions follow anything that can move the box
  sizeRO.observe(bubble);
  const posRO = new ResizeObserver(() => { needGeo = true; });
  posRO.observe(mount);
  if (mount.parentElement) posRO.observe(mount.parentElement);
  posRO.observe(document.body);
  document.fonts?.ready.then(() => { readMetrics(); needGeo = true; });
  refreshGeo();

  ctx.ask = { ask: (q) => ask(q), say: (text, mood) => say(text, mood) };

  // ?askTest=wen%20moon asks once on ready (headless screenshots)
  const test = ctx.params.get("askTest");
  if (test) bus.once("ready", () => setTimeout(() => ask(test), Number(ctx.params.get("askAt") || 900)));
}

// a short cream crescent for the send drop
function glintD() {
  let s = "";
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (1.08 + 0.36 * (i / 10));
    pts.push([Math.cos(a) * 17, Math.sin(a) * 17]);
  }
  const w = (i) => 0.6 + 2.6 * Math.sin(Math.PI * (i / 10));
  const L = pts.map(([x, y], i) => [x * (1 - w(i) / 34), y * (1 - w(i) / 34)]);
  const R = pts.map(([x, y], i) => [x * (1 + w(i) / 34), y * (1 + w(i) / 34)]).reverse();
  [...L, ...R].forEach(([x, y], i) => { s += (i ? "L" : "M") + r1(x) + " " + r1(y); });
  return s + "Z";
}
