// reveal: how text and section seams arrive.
//  - Headings: an ink drop falls, then every word condenses out of an ink cloud. Each word runs through its own
//    SVG filter (its own blurred copy, pooled by fibrous noise, then a steep alpha ramp), so the bleed is blurry in
//    shape but the edge stays crisp ink in the text's live colour and never glows. Meanwhile wght settles from 900
//    to the resting cut and the letters loosen apart. On the abyss line the full stops are the drops: each sentence
//    condenses, then its stop falls and lands as the period while the next sentence starts.
//  - Paragraphs: words rise out of the water line by line with a jelly overshoot.
//  - Seams: between sections one of my tentacles draws itself across (brush outline from ink.js, revealed by a mask
//    whose stroke-dashoffset runs root to tip). Then it stays alive: it sways, bows with scroll speed, shies away
//    from the pointer and keeps the few satellite drops the brush flicked off.
//  - Hover a heading and its letters breathe around the pointer (wght, SOFT, WONK). At rest they breathe slowly.
// Promises: an entrance starts once it is well in view, or after DWELL in view at all (parked at the bottom edge);
// it plans itself to end inside LIMIT of entering view; and a timer outside the frame loop settles anything still
// moving at LIMIT. So every heading, paragraph and seam ends crisp and readable, even if frames stall.
// Layout is read only when an entrance starts (IntersectionObserver callbacks, before any write), on resize and
// fonts, and for hover letters in loop.read. The frame loop never measures.
// Other modules can opt in: data-reveal="words" | "rise" (scanned on "ready"), or import { revealWords, revealRise }.

import { setAttr } from "../core/dom.js";

const NS = "http://www.w3.org/2000/svg";
const FALL = 0.4;        // s, a drop falling
const LAND = 0.34;       // s, a drop landing: squash and settle into a full stop, or splat
const BLEED = 0.95;      // s, one word condensing
const STAG = 0.1;        // s, between the words of a heading
const STAG_ALL = 0.42;   // s, the most a heading's words are spread over
const SEAM_WAIT = 0.3;   // s, a heading lets the seam above it start first when both start together
const P_AFTER = 0.45;    // s, a paragraph starts this long after its heading
const RISE = 0.9;        // s, one paragraph word rising
const P_LINE = 0.09, P_WORD = 0.018, P_ALL = 0.5; // s, paragraph stagger: per line, per word, the most in all
const LIMIT = 2.5;       // s, everything is final this long after it enters view
const DWELL = 0.5;       // s, in view this long without the trigger firing: start anyway
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const out3 = (t) => 1 - (1 - t) ** 3;
const inOut2 = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const back = (t) => { const c = 1.9; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; };
const clock = () => performance.now() / 1000;

function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const dOf = (pts, closed = false) => {
  let s = "";
  for (let i = 0; i < pts.length; i++) s += (i ? "L" : "M") + pts[i].x.toFixed(1) + " " + pts[i].y.toFixed(1);
  return closed ? s + "Z" : s;
};
const debounce = (fn, ms) => { let id = 0; return () => { clearTimeout(id); id = setTimeout(fn, ms); }; };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

let C = null;
let gateOpen = false, gateAt = 0;
const queue = [];
const heads = new Set();      // headings mid-entrance
const breathers = new Set();  // headings breathing under the pointer
const tides = [];
const recs = new WeakMap();   // observed element -> { run, settle, live, tide, ... }
let defs = null, fid = 0;
let ioTrig, ioTideTrig, ioSeen, ioLive, ioTideVis;
let lastY = 0, scrollV = 0;
let DROP_D = "", BLOB_D = "";
let range = null;

export function init(ctx) {
  C = ctx;
  const root = document.documentElement;
  root.classList.add("rv-on");
  if (ctx.reduced) root.classList.add("rv-still");

  const { spline } = ctx.ink;
  // an ink drop with a soft tail (round part centred on 0,0, radius 10) and a small wobbly blob (radius ~1)
  DROP_D = dOf(spline([{ x: 0, y: -17 }, { x: 5.6, y: -8 }, { x: 9.7, y: 0.6 }, { x: 7.1, y: 7.7 }, { x: 0, y: 10.3 }, { x: -7.2, y: 7.6 }, { x: -9.6, y: 0.4 }, { x: -5.4, y: -8 }], true, 10), true);
  const br = rng(77);
  BLOB_D = dOf(spline(Array.from({ length: 7 }, (_, i) => { const a = (i / 7) * Math.PI * 2, r = 1 + (br() - 0.5) * 0.28; return { x: Math.cos(a) * r, y: Math.sin(a) * r }; }), true, 8), true);

  defs = document.createElementNS(NS, "svg");
  defs.setAttribute("class", "rv-defs");
  defs.setAttribute("aria-hidden", "true");
  defs.setAttribute("width", "0");
  defs.setAttribute("height", "0");
  document.body.append(defs);

  // trigger: well inside the view; seen: any pixel in view (starts the LIMIT clock and the DWELL fallback)
  ioTrig = new IntersectionObserver(onTrigger, { rootMargin: "0px 0px -14% 0px" });
  ioTideTrig = new IntersectionObserver(onTrigger, { rootMargin: "0px 0px -18% 0px" });
  ioSeen = new IntersectionObserver(onSeen);
  ioLive = new IntersectionObserver((es) => es.forEach((e) => recs.get(e.target)?.live?.(e.isIntersecting)), { rootMargin: "80px 0px" });
  ioTideVis = new IntersectionObserver((es) => es.forEach((e) => {
    const T = recs.get(e.target)?.tide;
    if (T) T.visible = e.isIntersecting;
  }), { rootMargin: "80px 0px" });

  // section heads: the heading first, the paragraph rises after it
  for (const head of document.querySelectorAll("main .sec__head")) {
    guard(head, () => {
      const h = head.querySelector("h1, h2, h3");
      const H = h ? setupHeading(h, "head") : null;
      const ps = [...head.querySelectorAll("p")].map(setupRise).filter(Boolean);
      if (H || ps.length) watch(head, { H, ps, sec: head.closest(".sec") });
    });
  }
  // the last line of the page: each full stop is an ink drop
  for (const line of document.querySelectorAll(".abyss__line")) {
    guard(line, () => { const H = setupHeading(line, "line"); if (H) watch(line, { H, ps: [] }); });
  }
  // seams between sections: build them all, then measure once, then lay them out
  [...document.querySelectorAll("main > .sec")].forEach((sec, i) => {
    if (i === 0) return;
    try { tides.push(makeTide(sec, i)); } catch (err) { console.error("[reveal] seam", err); }
  });
  layoutTides();

  gateOpen = ctx.params.has("skipLoader") || ctx.reduced;
  if (gateOpen) gateAt = clock();
  ctx.bus.on("loader:done", openGate);
  ctx.bus.on("ready", () => {
    scan(document);
    const l = document.getElementById("loader");
    const cs = l && getComputedStyle(l);
    if (!l || !l.childElementCount || cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) openGate();
  });
  setTimeout(openGate, 5200);

  // the loop never asks layout: scroll comes from ctx.scroll (written in the scroll event, before the frame's
  // callbacks); drop targets are measured when an entrance starts; hover letters are measured in the read phase
  lastY = ctx.scroll.y;
  ctx.loop.read(measureFrame);
  ctx.loop.add(frame);
  addEventListener("resize", debounce(onResize, 160));
  new ResizeObserver(debounce(() => { for (const H of heads) measureHead(H); }, 220)).observe(document.body);
  // late webfonts move the glyphs: the drops follow
  document.fonts?.addEventListener?.("loadingdone", () => {
    for (const H of heads) measureHead(H);
    for (const H of breathers) H.needLetters = true;
  });
}

// Public helpers for other modules
export function revealWords(node) {
  if (!C) return null;
  const H = setupHeading(node, "head");
  if (H) watch(node, { H, ps: [] });
  return H;
}
export function revealRise(node) {
  if (!C) return null;
  const R = setupRise(node);
  if (R) watch(node, { H: null, ps: [R] });
  return R;
}

function scan(root) {
  root.querySelectorAll("[data-reveal]").forEach((n) => {
    if (n.dataset.rvDone) return;
    guard(n, () => (n.dataset.reveal === "rise" ? revealRise(n) : revealWords(n)));
  });
}

// a node that fails to set up shows its text as it is, never stays hidden
function guard(node, fn) {
  try { fn(); } catch (err) {
    console.error("[reveal]", err);
    node.classList.add("rv-fail");
  }
}

// ---------------------------------------------------------------- when things start, and the hard stop

function watch(node, B) {
  const rec = recs.get(node) || {};
  rec.node = node;
  rec.run = (deadline) => startBlock(B, deadline);
  rec.settle = () => settleBlock(B);
  recs.set(node, rec);
  if (C.reduced) { rec.started = true; rec.settle(); return; }
  ioTrig.observe(node);
  ioSeen.observe(node);
}

function onTrigger(entries) {
  for (const e of entries) if (e.isIntersecting) begin(recs.get(e.target));
}

function onSeen(entries) {
  for (const e of entries) {
    const rec = recs.get(e.target);
    if (!rec || rec.started) continue;
    clearTimeout(rec.dwell);
    if (e.isIntersecting) {
      rec.seenAt = e.time / 1000;
      rec.dwell = setTimeout(() => begin(rec), DWELL * 1000);
    } else rec.seenAt = 0;
  }
}

function begin(rec) {
  if (!rec || rec.started) return;
  if (!gateOpen) { if (!queue.includes(rec)) queue.push(rec); return; }
  // the clock runs from the moment it was in view (or the loader lifted, whichever is later)
  launch(rec, Math.max(rec.seenAt || clock(), gateAt) + LIMIT);
}

function launch(rec, deadline) {
  rec.started = true;
  clearTimeout(rec.dwell);
  ioTrig.unobserve(rec.node);
  ioTideTrig.unobserve(rec.node);
  ioSeen.unobserve(rec.node);
  const room = deadline - clock();
  if (room < 0.4) { rec.settle(); return; } // no time left to show anything: just be there
  try { rec.run(deadline); } catch (err) { console.error("[reveal]", err); rec.settle(); return; }
  // the hard stop lives outside the frame loop, so a stalled or broken frame can never leave blobs behind
  rec.hard = setTimeout(rec.settle, room * 1000);
}

function openGate() {
  if (!gateOpen) { gateOpen = true; gateAt = clock(); }
  queue.splice(0).forEach((rec, i) => setTimeout(() => begin(rec), 120 + i * 110));
}

function startBlock(B, deadline) {
  const now = clock();
  // measure first: the block just came into view and nothing has been written since the frame's layout
  if (B.H) measureHead(B.H);
  for (const R of B.ps) measureRise(R);
  // then write. The seam above draws first; if it hasn't started, start it now and let the heading wait a beat.
  let wait = 0;
  const T = B.sec ? tides.find((x) => x.sec === B.sec) : null;
  const tr = T && T.drawStart < 0 ? recs.get(T.wrap) : null;
  if (tr && !tr.started) { launch(tr, now + LIMIT); wait = SEAM_WAIT; }
  let end = B.H ? planHeading(B.H, wait) : 0;
  const pAt = B.H ? wait + P_AFTER : wait;
  B.ps.forEach((R, i) => { R.at = pAt + i * 0.16; end = Math.max(end, R.at + planRise(R) + RISE); });
  // a late start (parked at the edge, behind the loader) plays the same entrance a little faster, never past LIMIT
  const room = deadline - now - 0.12;
  const k = end > room ? Math.max(0.3, room / end) : 1;
  if (B.H) startHeading(B.H, now, k);
  for (const R of B.ps) startRise(R, k);
}

function settleBlock(B) {
  if (B.H) settleHeading(B.H);
  for (const R of B.ps) settleRise(R);
}

// ---------------------------------------------------------------- headings

function parseAxes(s) {
  const out = {};
  String(s).replace(/"(\w{4})"\s+(-?[\d.]+)/g, (_, k, v) => { out[k] = Number(v); });
  return out;
}

function setupHeading(node, kind) {
  if (node.dataset.rvDone) return null;
  const text = node.textContent.replace(/\s+/g, " ").trim();
  if (!text) return null;
  node.dataset.rvDone = "1";
  const cs = getComputedStyle(node);
  const ax = parseAxes(cs.fontVariationSettings);
  const fs = parseFloat(cs.fontSize) || 60;
  const rest = { w: parseFloat(cs.fontWeight) || 560, s: ax.SOFT ?? 50, k: ax.WONK ?? 0 };
  // tracking in em, so the ink copy keeps matching its ghost when the type scales with the window
  const lsEm = (parseFloat(cs.letterSpacing) || 0) / fs;
  node.classList.add("rv-h");
  node.style.setProperty("--rv-w", rest.w);
  node.style.setProperty("--rv-s", rest.s);
  node.style.setProperty("--rv-k", rest.k);
  node.style.setProperty("--rv-ls", `${lsEm.toFixed(4)}em`);
  node.textContent = "";
  // one plain copy for screen readers (aria-label is ignored on a paragraph); the drawn words are hidden from them
  node.append(el("span", "rv-sr", text));
  const words = text.split(" ").map((word, i, arr) => {
    const w = el("span", "rv-w");
    w.setAttribute("aria-hidden", "true");
    const ghost = el("span", "rv-ghost", word);
    // a zero-size mark on the baseline at the end of the resting word: drop targets are read from the ghost, which
    // never animates, so a measure taken mid-entrance still lands where the glyph will rest
    const probe = ghost.appendChild(el("span", "rv-probe"));
    const ink = el("span", "rv-ink");
    ink.style.setProperty("--i", i);
    const letters = [...word].map((ch) => ink.appendChild(el("span", "rv-l", ch)));
    w.append(ghost, ink);
    node.append(w);
    if (i < arr.length - 1) node.append(" ");
    return { i, w, ghost, probe, ink, letters, dot: /[.]$/.test(word) ? letters[letters.length - 1] : null, start: Infinity, rel: 0, on: false, done: false, f: null, dx: 0, dy: 0, dr: 0 };
  });
  const H = {
    el: node, kind, rest, words, drops: [], plan: [], done: false, fs, lsEm, k: 1, fall: fs * 1.4 + 36,
    boxX: 0, boxY: 0, amt: 0, pulse: 0, hoverOn: false, px: 0, letters: null, needLetters: false,
  };
  const rec = recs.get(node) || {};
  rec.live = (v) => node.classList.toggle("is-live", v);
  recs.set(node, rec);
  ioLive.observe(node);
  if (!C.reduced) bindBreath(H);
  return H;
}

const cut = (th) => `0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 24 ${(-24 * th).toFixed(2)}`;

function makeFilter(H, seed) {
  const id = `rv-bleed-${fid++}`;
  const f = document.createElementNS(NS, "filter");
  f.setAttribute("id", id);
  f.setAttribute("x", "-25%"); f.setAttribute("y", "-25%");
  f.setAttribute("width", "150%"); f.setAttribute("height", "150%");
  f.setAttribute("color-interpolation-filters", "sRGB");
  const prim = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); f.append(e); return e; };
  // the blurred word is the ink cloud; fibrous noise decides where it pools first; the steep ramp keeps a hard edge.
  // The colour comes from the word itself (the blur, made opaque), so it follows the water's text colour live and
  // nothing has to read styles while the words bleed.
  const blur = prim("feGaussianBlur", { in: "SourceGraphic", stdDeviation: (H.fs * 0.15).toFixed(2), result: "b" });
  prim("feTurbulence", { type: "fractalNoise", baseFrequency: (3.4 / H.fs).toFixed(4), numOctaves: "2", seed: String(seed), result: "n" });
  prim("feComposite", { in: "b", in2: "n", operator: "arithmetic", k1: "1.35", k2: "0.32", k3: "0", k4: "0", result: "m" });
  const cm = prim("feColorMatrix", { in: "m", type: "matrix", values: cut(0.78), result: "a" });
  prim("feColorMatrix", { in: "b", type: "matrix", values: "1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 0 1", result: "c" });
  prim("feComposite", { in: "c", in2: "a", operator: "in" });
  defs.append(f);
  return { id, f, blur, cm };
}

// Reads only. Called when the entrance starts (before any write), and again on resize or late fonts.
function measureHead(H) {
  if (!H.el.isConnected) return;
  const hr = H.el.getBoundingClientRect();
  const fs = parseFloat(getComputedStyle(H.el).fontSize);
  if (fs > 0) H.fs = fs;
  H.fall = H.fs * 1.4 + 36;
  // the page box, for the landing ripple (client space later from the shared scroll)
  H.boxX = hr.left;
  H.boxY = hr.top + C.scroll.y;
  for (const wd of H.words) {
    if (H.kind === "line" ? !wd.dot : wd !== H.words[0]) continue;
    const base = wd.probe.getBoundingClientRect().top - hr.top;
    if (wd.dot) {
      // the full stop of the resting copy
      const tn = wd.ghost.firstChild;
      range ||= document.createRange();
      range.setStart(tn, tn.length - 1);
      range.setEnd(tn, tn.length);
      const r = range.getBoundingClientRect();
      wd.dr = Math.max(2.5, H.fs * 0.07);
      wd.dx = (r.left + r.right) / 2 - hr.left;
      wd.dy = base - wd.dr * 1.02;
    } else {
      const r = wd.w.getBoundingClientRect();
      wd.dr = Math.max(3, H.fs * 0.085);
      wd.dx = r.left - hr.left + Math.min(r.width * 0.34, H.fs * 0.8);
      wd.dy = base - H.fs * 0.33;
    }
  }
}

// relative times in seconds; returns when the last thing settles
function planHeading(H, wait) {
  const plan = [];
  let end = 0;
  if (H.kind === "line") {
    // sentence by sentence; each full stop falls once its sentence is condensing, and the next sentence starts
    // just before it lands
    let at = wait;
    for (const wd of H.words) {
      wd.rel = at;
      at += STAG;
      end = Math.max(end, wd.rel + BLEED);
      if (wd.dot) {
        const rel = at + 0.24;
        plan.push({ wd, dot: wd.dot, rel });
        end = Math.max(end, rel + FALL + LAND);
        at = rel + FALL - 0.12;
      }
    }
  } else {
    plan.push({ wd: H.words[0], dot: null, rel: wait });
    end = wait + FALL + LAND;
    const n = H.words.length, stag = n > 1 ? Math.min(STAG, STAG_ALL / (n - 1)) : 0;
    H.words.forEach((wd, i) => { wd.rel = wait + FALL - 0.06 + i * stag; end = Math.max(end, wd.rel + BLEED); });
  }
  H.plan = plan;
  return end;
}

function startHeading(H, now, k) {
  if (H.done) return;
  H.el.classList.add("is-in");
  H.k = k;
  for (const wd of H.words) {
    wd.start = now + wd.rel * k;
    wd.f = makeFilter(H, 3 + wd.i * 7 + (fid % 5));
  }
  for (const p of H.plan) {
    if (p.dot) p.dot.classList.add("rv-wait");
    const node = el("span", "rv-drop");
    node.innerHTML = `<svg viewBox="-12 -24 24 36" aria-hidden="true"><path d="${DROP_D}"/></svg>`;
    H.el.append(node);
    H.drops.push({ el: node, wd: p.wd, dot: p.dot, start: now + p.rel * k, hit: false, done: false });
  }
  heads.add(H);
}

function finishWord(wd) {
  const st = wd.ink.style;
  st.filter = st.fontVariationSettings = st.letterSpacing = st.opacity = st.transform = "";
  wd.f?.f.remove();
  wd.f = null;
  wd.on = wd.done = true;
  wd.w.classList.add("is-on");
}

function finishHeading(H) {
  H.done = true;
  heads.delete(H);
  H.el.classList.add("is-done");
}

// the final state, from wherever the entrance is (or isn't): crisp resting words, full stops in place, no drops
function settleHeading(H) {
  if (!H || H.done) return;
  H.el.classList.add("is-in");
  for (const wd of H.words) {
    if (!wd.done) finishWord(wd);
    wd.dot?.classList.remove("rv-wait");
  }
  for (const d of H.drops) if (!d.done) { d.done = true; d.el.remove(); }
  finishHeading(H);
}

function stepHeading(H, t) {
  let busy = false;
  for (const d of H.drops) if (!d.done) { stepDrop(H, d, t); busy = true; }
  const dur = BLEED * H.k;
  for (const wd of H.words) {
    if (wd.done) continue;
    busy = true;
    const p = (t - wd.start) / dur;
    if (p < 0) continue;
    if (p >= 1) { finishWord(wd); continue; }
    const st = wd.ink.style;
    if (!wd.on) { wd.on = true; wd.w.classList.add("is-on"); st.filter = `url(#${wd.f.id})`; }
    const e = out3(p);
    // the cloud tightens (blur falls) while the cut-off relaxes, so letters grow out of the densest ink first
    setAttr(wd.f.blur, "stdDeviation", (H.fs * 0.15 * (1 - e) ** 1.3).toFixed(2));
    setAttr(wd.f.cm, "values", cut(lerp(0.78, 0.4, e)));
    // wght falls from 900 through the resting cut, overshoots light, and lands exactly on it
    const wg = H.rest.w + (900 - H.rest.w) * Math.exp(-3.1 * p) * Math.cos(p * 4.3) * (1 - p * p * p);
    // the WONK flip happens while the word is still a cloud, never on readable letters
    st.fontVariationSettings = `"wght" ${wg.toFixed(0)}, "SOFT" ${lerp(100, H.rest.s, e).toFixed(0)}, "WONK" ${p < 0.32 ? 1 - H.rest.k : H.rest.k}`;
    st.letterSpacing = `${(H.lsEm - 0.07 * (1 - e)).toFixed(4)}em`;
    st.opacity = clamp(p * 10).toFixed(3);
    st.transform = `translate(-50%, ${(0.07 * (1 - e)).toFixed(4)}em)`;
  }
  if (!busy) finishHeading(H);
}

function stepDrop(H, d, t) {
  if (t < d.start) return;
  const wd = d.wd, k = H.k, fall = FALL * k;
  const p = (t - d.start) / fall;
  let y = wd.dy, sx, sy, o = 1;
  if (p < 1) {
    const e = p * p;
    y = wd.dy - H.fall * (1 - e);
    sy = 1 + 0.55 * e;
    sx = 1 - 0.24 * e;
  } else {
    if (!d.hit) {
      d.hit = true;
      d.dot?.classList.remove("rv-wait");
      // client position from the measured page box and the shared scroll, so landing never forces layout
      if (wd.dr) C.bus.emit("ripple", { x: H.boxX + wd.dx, y: H.boxY - C.scroll.y + wd.dy, strength: d.dot ? 0.45 : 0.3 });
      C.bus.emit("sfx", { name: "bubble" });
    }
    const q = clamp((t - d.start - fall) / (LAND * k));
    if (q >= 1) { d.done = true; d.el.remove(); return; }
    if (d.dot) {
      // lands as the full stop: squash, settle, hand over to the real glyph
      sx = lerp(1.75, 1, back(q));
      sy = lerp(0.42, 1, back(q));
      o = q < 0.6 ? 1 : 1 - (q - 0.6) / 0.4;
    } else {
      sx = 1 + 1.4 * out3(q);
      sy = 1 - 0.82 * out3(q);
      o = 1 - q;
    }
  }
  if (!wd.dr) return; // never measured (detached): the timeline still runs, nothing to draw
  // the drop is a fixed 24 x 36 box (1 unit = 1 px); its size is part of the scale, so the loop writes transform only
  const s = wd.dr / 12;
  d.el.style.opacity = o.toFixed(3);
  d.el.style.transform = `translate(${(wd.dx - 12).toFixed(1)}px, ${(y - 24).toFixed(1)}px) scale(${(sx * s).toFixed(3)}, ${(sy * s).toFixed(3)})`;
}

// hover: letters breathe around the pointer; touch: one breath travels through
function bindBreath(H) {
  const n = H.el;
  const join = (x) => {
    H.px = x;
    if (!breathers.has(H)) { H.letters = null; H.needLetters = true; breathers.add(H); }
  };
  n.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "touch" || !H.done) return;
    H.hoverOn = true;
    if (!breathers.has(H)) join(e.clientX);
  });
  n.addEventListener("pointerleave", () => { H.hoverOn = false; });
  n.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || !H.done) return;
    H.pulse = 1;
    join(e.clientX);
  });
}

function cacheLetters(H) {
  H.letters = [];
  for (const wd of H.words) for (const l of wd.letters) { const r = l.getBoundingClientRect(); H.letters.push({ el: l, cx: r.left + r.width / 2 }); }
}

function stepBreath(H, t, dt) {
  if (!H.letters) return; // measured in the next read phase
  H.amt += ((H.hoverOn ? 1 : 0) - H.amt) * (1 - Math.exp(-dt * (H.hoverOn ? 3 : 1.7)));
  if (H.pulse > 0) H.pulse = Math.max(0, H.pulse - dt * 0.55);
  const a = Math.max(H.amt, H.pulse > 0 ? Math.sin(Math.PI * (1 - H.pulse)) : 0);
  if (!H.hoverOn && H.pulse <= 0 && a < 0.004) {
    for (const L of H.letters) { L.el.style.fontVariationSettings = L.el.style.letterSpacing = L.el.style.top = ""; }
    breathers.delete(H);
    return;
  }
  if (H.hoverOn) H.px += (C.pointer.x - H.px) * (1 - Math.exp(-dt * 6));
  const R = H.fs * 1.5, R2 = 2 * R * R;
  const soft = H.rest.s >= 50 ? 0 : 100;
  for (const L of H.letters) {
    const dx = L.cx - H.px;
    const g = Math.exp(-(dx * dx) / R2);
    const wave = 0.5 + 0.5 * Math.sin(t * 2.1 - L.cx * 0.016);
    const kg = a * g * (0.4 + 0.6 * wave);
    const dw = 170 * a * (0.1 + 0.9 * g) * (0.4 + 0.6 * wave);
    L.el.style.fontVariationSettings = `"wght" calc(var(--rv-w) + var(--rv-br) + ${dw.toFixed(0)}), "SOFT" ${lerp(H.rest.s, soft, kg).toFixed(0)}, "WONK" ${kg > 0.45 ? 1 - H.rest.k : H.rest.k}`;
    L.el.style.letterSpacing = `calc(var(--rv-ls) - ${(dw * 0.00026).toFixed(4)}em - var(--rv-br) * 0.00024em)`;
    L.el.style.top = `${(-0.045 * H.fs * kg).toFixed(1)}px`;
  }
}

// ---------------------------------------------------------------- paragraphs

function setupRise(node) {
  if (node.dataset.rvDone) return null;
  node.dataset.rvDone = "1";
  node.classList.add("rv-p");
  const words = [];
  const walk = (parent) => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === 1) { walk(child); continue; }
      if (child.nodeType !== 3) continue;
      const frag = document.createDocumentFragment();
      for (const part of child.textContent.split(/([ \t\n\r]+)/)) {
        if (!part) continue;
        if (/^[ \t\n\r]+$/.test(part)) frag.append(" ");
        else words.push(frag.appendChild(el("span", "rv-pw", part)));
      }
      child.replaceWith(frag);
    }
  };
  walk(node);
  return { el: node, words, lines: null, rel: [], at: 0, max: 0, left: 0, done: false, onEnd: null };
}

// reads only: which line each word sits on
function measureRise(R) {
  let line = -1, lastTop = -1e9;
  R.lines = R.words.map((w) => {
    const top = w.offsetTop;
    if (top > lastTop + 4) { line++; lastTop = top; }
    return line;
  });
}

// line by line, with a small ripple along each line; long paragraphs compress the stagger, never the rise
function planRise(R) {
  let prev = -1, inLine = 0;
  R.rel = R.words.map((w, i) => {
    const l = R.lines?.[i] ?? 0;
    if (l !== prev) { prev = l; inLine = 0; }
    return l * P_LINE + inLine++ * P_WORD;
  });
  const max = R.rel.reduce((m, v) => Math.max(m, v), 0);
  if (max > P_ALL) R.rel = R.rel.map((v) => (v * P_ALL) / max);
  R.max = Math.min(max, P_ALL);
  return R.max;
}

function startRise(R, k) {
  if (R.done) return;
  const r = rng(R.words.length * 7919 + 13);
  R.words.forEach((w, i) => {
    w.style.setProperty("--d", `${Math.round((R.at + R.rel[i]) * k * 1000)}ms`);
    w.style.setProperty("--rx", `${((r() - 0.5) * 12).toFixed(1)}px`);
    w.style.setProperty("--rr", `${((r() - 0.5) * 8).toFixed(1)}deg`);
  });
  R.el.style.setProperty("--dur", `${Math.round(RISE * k * 1000)}ms`);
  R.left = R.words.length;
  // when every word has landed, drop the finished animations: the paragraph is plain text again
  R.onEnd = (e) => { if (e.animationName === "rv-rise" && --R.left <= 0) settleRise(R); };
  R.el.addEventListener("animationend", R.onEnd);
  R.el.classList.add("is-in");
}

function settleRise(R) {
  if (R.done) return;
  R.done = true;
  if (R.onEnd) R.el.removeEventListener("animationend", R.onEnd);
  R.el.classList.add("is-in", "is-set");
}

// ---------------------------------------------------------------- seams (tentacles between sections)

function makeTide(sec, i) {
  const wrap = el("div", "rv-tide");
  wrap.setAttribute("aria-hidden", "true");
  const mid = `rv-tm${i}`;
  wrap.innerHTML =
    `<svg class="rv-tide__svg" preserveAspectRatio="none">` +
    `<defs><mask id="${mid}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse"><path class="rv-tm"/><path class="rv-tm"/></mask></defs>` +
    `<g class="rv-tide__ink" mask="url(#${mid})"><path class="rv-tide__body"/><path class="rv-tide__glint"/></g>` +
    `<g class="rv-tide__drops"></g><path class="rv-tide__head" d="${BLOB_D}" transform="scale(0)"/></svg>`;
  const tag = el("span", "rv-tag", `−${Number(sec.dataset.depth || 0).toLocaleString("en-US")} m`);
  wrap.append(tag);
  sec.prepend(wrap);
  const svg = wrap.firstChild;
  const [ma, mb] = svg.querySelectorAll(".rv-tm");
  const r = rng(0x5eed + i * 1013);
  const T = {
    i, si: i, sec, wrap, svg, tag, ma, mb,
    mask: svg.querySelector("mask"), g: svg.querySelector(".rv-tide__ink"),
    body: svg.querySelector(".rv-tide__body"), glint: svg.querySelector(".rv-tide__glint"),
    head: svg.querySelector(".rv-tide__head"), dropsG: svg.querySelector(".rv-tide__drops"),
    dir: i % 2 ? 1 : -1, phase: r() * 6.283, speed: 0.5 + r() * 0.3, curlDir: 0,
    shape: Array.from({ length: 12 }, () => r()), turnsR: r(), endR: r(), glintR: r(),
    drops: [], drawStart: -1, dur: 1.85, drawDur: 1.85, drawn: false, headOut: -1, visible: false, offTop: -86,
    bend: { x: 0, v: 0 }, push: { x: -1e4, y: -1e4, amt: 0 }, cost: 0, skip: false, tick: 0, acc: 0, broken: false,
  };
  T.curlDir = (r() < 0.62 ? 1 : -1) * T.dir; // mostly curls down, toward the section it opens
  const nd = 3 + Math.floor(r() * 3);
  for (let k = 0; k < nd; k++) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", BLOB_D);
    p.setAttribute("transform", "scale(0)");
    T.dropsG.append(p);
    T.drops.push({ el: p, u: 0.1 + r() * 0.78, side: r() < 0.5 ? -1 : 1, off: 5 + r() * 20, r: 2.3 + r() * 3, born: -1, x: 0, y: 0, vx: 0, vy: 0, init: false });
  }
  const rec = recs.get(wrap) || {};
  Object.assign(rec, { node: wrap, tide: T, run: (deadline) => startTide(T, deadline), settle: () => settleTide(T) });
  recs.set(wrap, rec);
  ioTideVis.observe(wrap);
  // a seam starts only once it is well in view (no DWELL start: one peeking in at the bottom edge would draw,
  // then sway every frame, for nobody); once started it is final within LIMIT like everything else
  if (C.reduced) rec.started = true;
  else ioTideTrig.observe(wrap);
  return T;
}

// all reads first, then all writes: one layout for every seam
function layoutTides() {
  const sizes = tides.map((T) => [T.wrap.clientWidth, T.wrap.clientHeight, T.wrap.offsetTop]);
  tides.forEach((T, i) => { try { layoutTide(T, sizes[i]); } catch (err) { console.error("[reveal] seam", err); T.broken = true; } });
}

function layoutTide(T, [cw, ch, top]) {
  const W = cw || innerWidth, H = ch || 170;
  const small = W < 720;
  if (Number.isFinite(top)) T.offTop = top;
  Object.assign(T, {
    W, H, small,
    n: Math.max(3, Math.round(W / 290)),
    amp: small ? 6 : 10,
    w0: small ? 11 : 19, w1: small ? 3.2 : 5, wEnd: small ? 2.2 : 3.4,
    r0: small ? 19 : 30, r1: small ? 4.5 : 6.5, turns: 1.1 + T.turnsR * 0.35,
    endU: (small ? 0.74 : 0.78) + T.endR * 0.06,
    pushR: small ? 60 : 95, pushA: small ? 16 : 26,
    gw: small ? 1.5 : 2.3, g0: 0.1 + T.glintR * 0.12,
    drawDur: small ? 1.35 : 1.85,
  });
  if (T.drawStart < 0) T.dur = T.drawDur;
  const A = small ? 11 : 19;
  T.base = Array.from({ length: T.n + 1 }, (_, i) => (i === 0 ? 0 : (i % 2 ? 1 : -1) * A * (0.45 + 0.55 * T.shape[i % 12])));
  T.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  for (const [k, v] of Object.entries({ x: -120, y: -120, width: W + 240, height: H + 240 })) T.mask.setAttribute(k, v);
  T.ma.setAttribute("stroke-width", T.w0 + T.pushA * 0.4 + 14);
  T.mb.setAttribute("stroke-width", T.w1 * 2 + 5);
  // the depth tag sits under the curl
  const geo = tideGeo(T, 0, false);
  let x0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let k = geo.nMain; k < geo.all.length; k++) { const p = geo.all[k]; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  T.tag.style.left = `${clamp((x0 + x1) / 2, 44, W - 44).toFixed(0)}px`;
  T.tagY = Math.min(H + 8, y1 + 16);
  T.tag.style.top = `${T.tagY.toFixed(0)}px`;
  if (C.reduced || T.drawn) { if (T.drawStart < 0) T.drawStart = 0; renderTide(T, clock(), 0, false); }
}

function startTide(T, deadline) {
  if (T.drawStart >= 0) return;
  const now = clock();
  T.dur = Math.max(0.6, Math.min(T.drawDur, deadline - now - 0.2));
  T.drawStart = now;
}

function settleTide(T) {
  if (T.drawn || T.broken) return;
  if (T.drawStart < 0) T.drawStart = 0;
  try { renderTide(T, clock(), 0, false); } catch (err) { console.error("[reveal] seam", err); T.broken = true; }
}

// the seam's top in client space: the section's top (kept fresh by core/scroll on resize) and the shared scroll.
// Neither getBoundingClientRect nor window.scrollY: both would force style and layout after other modules' writes.
function tideTop(T) {
  const secs = C.scroll.sections;
  let S = secs[T.si];
  if (!S || S.el !== T.sec) S = secs.find((s) => s.el === T.sec);
  return S ? S.top + T.offTop - C.scroll.y : null;
}

function tideGeo(T, t, live) {
  const { W, H, n, dir } = T;
  const { spline, spiral } = C.ink;
  const y0 = H * 0.5;
  const xa = dir > 0 ? -70 : W + 70;
  const xb = dir > 0 ? W * T.endU : W * (1 - T.endU);
  const ctrl = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    let x = lerp(xa, xb, u), y = y0 + T.base[i];
    if (live) {
      y += Math.sin(t * T.speed - i * 1.05 + T.phase) * T.amp * (0.3 + 0.7 * u);
      x += Math.sin(t * T.speed * 0.7 + i * 2.1) * 5 * u;
      y += T.bend.x * Math.sin(Math.PI * clamp(u * 1.08));
    }
    ctrl.push({ x, y });
  }
  const main = spline(ctrl, false, 20);
  const a = main[main.length - 2], b = main[main.length - 1];
  const h = Math.atan2(b.y - a.y, b.x - a.x);
  const turns = T.turns + (live ? 0.08 * Math.sin(t * 0.9 + T.phase) : 0);
  const all = main.concat(spiral(b, h, T.r0, T.r1, turns, T.curlDir, 2.4).slice(1));
  // the pointer pushes the water, the tentacle gives way and slides back
  if (live && T.push.amt > 0.003) {
    const R2 = 2 * T.pushR * T.pushR, px = T.push.x, py = T.push.y, A = T.push.amt * T.pushA, s2 = 14 * 14, ry = T.pushR * 1.5;
    for (const p of all) {
      const dx = p.x - px;
      if (dx * dx > 4.5 * R2) continue;
      const dy = p.y - py;
      const g = Math.exp(-(dx * dx) / R2) * clamp(1 - Math.abs(dy) / ry);
      p.y += (dy / Math.sqrt(dy * dy + s2)) * A * g;
    }
  }
  const cum = new Float32Array(all.length);
  for (let k = 1; k < all.length; k++) cum[k] = cum[k - 1] + Math.hypot(all[k].x - all[k - 1].x, all[k].y - all[k - 1].y);
  return { all, cum, nMain: main.length, mainLen: cum[main.length - 1], total: cum[all.length - 1] };
}

function pointAt(geo, L) {
  const { all, cum } = geo;
  let lo = 1, hi = all.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < L) lo = m + 1; else hi = m; }
  const a = all[lo - 1], b = all[lo];
  const seg = cum[lo] - cum[lo - 1] || 1;
  const f = clamp((L - cum[lo - 1]) / seg);
  const tx = (b.x - a.x) / seg, ty = (b.y - a.y) / seg;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, tx, ty };
}

function stepTide(T, t, dt) {
  // scroll drag bows the middle; an underdamped spring makes it wobble back
  const target = clamp(scrollV * 0.012, -32, 32);
  T.bend.v += ((target - T.bend.x) * 70 - T.bend.v * 6.5) * dt;
  T.bend.x += T.bend.v * dt;
  let lively = !T.drawn || t - T.headOut < 0.45 || Math.abs(T.bend.v) > 25 || Math.abs(T.bend.x) > 1.5;
  const top = tideTop(T);
  if (top != null) {
    // the pointer, mapped into the svg
    const py = C.pointer.y - top, px = C.pointer.x;
    const goal = C.pointer.active && py > -T.pushR && py < T.H + T.pushR ? 1 : 0;
    T.push.amt += (goal - T.push.amt) * (1 - Math.exp(-dt * (goal ? 5 : 2.4)));
    if (T.push.x < -9e3) { T.push.x = px; T.push.y = py; }
    const kk = 1 - Math.exp(-dt * 8);
    const mx = (px - T.push.x) * kk, my = (py - T.push.y) * kk;
    T.push.x += mx;
    T.push.y += my;
    if (Math.abs(goal - T.push.amt) > 0.01 || (T.push.amt > 0.01 && Math.abs(mx) + Math.abs(my) > 0.3)) lively = true;
    duckTag(T, top);
  }
  if (T.drawStart < 0) return;
  // a calm seam redraws every third frame: its sway moves well under a pixel between redraws at that rate.
  // Drawing, the pointer's push and the scroll bow keep every frame. Budget guard: a costly seam takes every other.
  const every = lively ? (T.skip ? 2 : 1) : 3;
  T.acc += dt;
  if (++T.tick < every) return;
  T.tick = 0;
  const step = Math.min(T.acc, 0.06);
  T.acc = 0;
  const t0 = performance.now();
  renderTide(T, t, step, true);
  T.cost = T.cost * 0.9 + (performance.now() - t0) * 0.1;
  T.skip = T.cost > 2.6;
}

// the depth tag ducks out while it passes under the fixed topbar (also with reduced motion: it's a state, not a loop)
function duckTag(T, top) {
  const under = top + T.tagY < 64;
  if (under !== T.under) { T.under = under; T.tag.classList.toggle("is-under", under); }
}

function renderTide(T, t, dt, live) {
  const geo = tideGeo(T, t, live);
  const { all, cum, nMain, mainLen, total } = geo;
  const split = mainLen / total;
  const { w0, w1, wEnd } = T;
  const wfn = (u) => (u <= split ? w0 + (w1 - w0) * Math.pow(u / split, 0.9) : w1 + (wEnd - w1) * ((u - split) / (1 - split || 1)));
  setAttr(T.body, "d", C.ink.brush(all, wfn));

  // a cream glint near the upper edge, like wet paint
  const ga = mainLen * T.g0, gb = mainLen * (T.g0 + 0.22), gp = [];
  for (let k = 1; k < nMain - 1; k++) {
    const L = cum[k];
    if (L < ga) continue;
    if (L > gb) break;
    const p0 = all[k - 1], p1 = all[k + 1];
    let tx = p1.x - p0.x, ty = p1.y - p0.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    let nx = -ty, ny = tx;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const w = wfn(L / total);
    gp.push({ x: all[k].x + nx * w * 0.22, y: all[k].y + ny * w * 0.22 });
  }
  setAttr(T.glint, "d", gp.length > 3 ? C.ink.brush(gp, (u) => 0.3 + T.gw * Math.sin(Math.PI * u)) : "");

  // drawing: the mask runs root to tip, a wet bead rides the front
  let P = total;
  if (!T.drawn) {
    const p = live ? clamp((t - T.drawStart) / T.dur) : 1;
    P = inOut2(p) * total;
    if (p >= 1) {
      T.drawn = true;
      T.g.removeAttribute("mask");
      T.ma.style.display = T.mb.style.display = "none";
      T.headOut = t;
      T.tag.classList.add("is-on");
    } else {
      const vm = Math.min(P, mainLen), vc = P - mainLen;
      T.ma.style.display = vm > 0.5 ? "" : "none";
      T.mb.style.display = vc > 0.5 ? "" : "none";
      if (vm > 0.5) {
        setAttr(T.ma, "d", dOf(all.slice(0, nMain)));
        setAttr(T.ma, "stroke-dasharray", `${mainLen.toFixed(1)} ${(mainLen + 400).toFixed(1)}`);
        setAttr(T.ma, "stroke-dashoffset", (mainLen - vm).toFixed(1));
      }
      if (vc > 0.5) {
        const cl = total - mainLen;
        setAttr(T.mb, "d", dOf(all.slice(nMain - 1)));
        setAttr(T.mb, "stroke-dasharray", `${cl.toFixed(1)} ${(cl + 400).toFixed(1)}`);
        setAttr(T.mb, "stroke-dashoffset", (cl - vc).toFixed(1));
      }
    }
  }
  if (live && (!T.drawn || t - T.headOut < 0.45)) {
    const q = T.drawn ? 1 - out3(clamp((t - T.headOut) / 0.45)) : 1;
    const Lh = Math.min(P, total - 0.5);
    const pt = pointAt(geo, Lh);
    const rb = (wfn(Lh / total) * 0.62 + 1.4) * q;
    const ang = (Math.atan2(pt.ty, pt.tx) * 180) / Math.PI;
    setAttr(T.head, "transform", `translate(${(pt.x + pt.tx * rb * 0.35).toFixed(1)} ${(pt.y + pt.ty * rb * 0.35).toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${(rb * 1.22).toFixed(2)} ${rb.toFixed(2)})`);
  } else if (T.drawn && T.head.getAttribute("transform") !== "scale(0)") {
    setAttr(T.head, "transform", "scale(0)");
  }

  // satellite drops flicked off the brush; they float on springs beside the line
  for (const d of T.drops) {
    if (d.born < 0 && P >= d.u * total) d.born = live ? t : -2;
    if (d.born === -1) continue;
    const L = d.u * total;
    const pt = pointAt(geo, L);
    const off = wfn(d.u) / 2 + d.off;
    const tx = pt.x - pt.ty * off * d.side, ty = pt.y + pt.tx * off * d.side;
    if (!d.init || !live) { d.x = tx; d.y = ty; d.init = true; }
    else {
      d.vx += ((tx - d.x) * 38 - d.vx * 7) * dt;
      d.vy += ((ty - d.y) * 38 - d.vy * 7) * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    const s = (live && d.born >= 0 ? back(clamp((t - d.born) / 0.55)) : 1) * d.r * (T.small ? 0.75 : 1);
    setAttr(d.el, "transform", `translate(${d.x.toFixed(1)} ${d.y.toFixed(1)}) scale(${s.toFixed(2)})`);
  }
}

// ---------------------------------------------------------------- the loop: reads, then writes

function measureFrame() {
  if (!breathers.size) return;
  for (const H of breathers) {
    if (!H.needLetters) continue;
    H.needLetters = false;
    try { cacheLetters(H); } catch { H.letters = []; }
  }
}

function frame(t, dt) {
  // ctx.scroll.y is set in the scroll event, which runs before this frame's callbacks, so it is current here.
  // Reading window.scrollY instead would force a full-document style recalc after the earlier modules' writes.
  const y = C.scroll.y, dy = y - lastY;
  lastY = y;
  // a jump (restored scroll, an instant anchor, the first measure) is a teleport, not a current: it must not whip the seams
  if (Math.abs(dy) < 600) scrollV += (dy / Math.max(dt, 1 / 120) - scrollV) * (1 - Math.exp(-dt * 10));
  // one broken item settles or stops on its own; it never takes the whole callback (and every entrance) down with it
  if (heads.size) {
    for (const H of heads) {
      try { stepHeading(H, t); } catch (err) { console.error("[reveal] heading", err); settleHeading(H); }
    }
  }
  if (breathers.size) {
    for (const H of breathers) {
      try { stepBreath(H, t, dt); } catch (err) { console.error("[reveal] breath", err); breathers.delete(H); }
    }
  }
  for (const T of tides) {
    if (!T.visible || T.broken) continue;
    try {
      if (C.reduced) { const top = tideTop(T); if (top != null) duckTag(T, top); }
      else stepTide(T, t, dt);
    } catch (err) { console.error("[reveal] seam", err); T.broken = true; }
  }
}

function onResize() {
  // measure everything, then write
  const sizes = tides.map((T) => [T.wrap.clientWidth, T.wrap.clientHeight, T.wrap.offsetTop]);
  for (const H of heads) measureHead(H);
  tides.forEach((T, i) => { if (!T.broken) layoutTide(T, sizes[i]); });
  for (const H of breathers) H.needLetters = true;
}
