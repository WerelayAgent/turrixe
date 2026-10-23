// journal: every brain I've had, strung on one long ink tentacle that hangs down the page.
//  - The spine is a living tentacle (tapered brush, travelling sway, shies from the pointer, curls at the tip)
//    and each version is a tiny brain threaded on it: retired brains sleep, the current one watches and beats
//    like a heart. Cream specks of memory sink down the tentacle into the older brains.
//  - Entries: v#, time ago, title, ink hook chips (a brush swatch behind what grew, a fine pen strike through what
//    fell off), lines, build hash, and an ink diff wrapped to the column: removed rows get blotted out with a black
//    brush stroke, added rows are written in cream behind a wet nib.
//  - A new brain drops onto the tentacle, lands with a squash and spreads ink; the old one closes its eyes.
//  - The Book of Brains: a scrubber walks through every version; the page shows the brain's portrait
//    (folds morph point by point between versions), its lifespan, first and last thought, the hooks it wrote,
//    and an epitaph. The living brain's page has no epitaph yet.
// Frame budget: layout is read only in the loop's read phase and only after something changed (a resize, fonts,
// the list or the page changing size, the section coming into view). Screen positions come from cached document
// offsets and ctx.scroll.y, so a normal frame reads no layout at all. Off screen the module idles; on screen the
// tentacle is drawn only for the stretch near the viewport, and the Book of Brains animates only while visible.
import { TAU, clamp, lerp, smooth, outCubic, outBack, ease, seedOf, ribbon, blot, drop, ring, paper, swatch, strike, foldsFor, foldsPath, lidPath } from "./journal/geo.js";
import { codeHTML } from "./journal/code.js";
import { epitaphFor, minutes, ago, clock } from "./journal/words.js";

const NS = "http://www.w3.org/2000/svg";
const BRAIN_W = 590;
const PAD = 180;               // px beyond the viewport where the tentacle is still drawn
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent?.appendChild(e);
  return e;
}
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
// document position from the offset chain: exact whatever the scroll is doing this frame
function docPos(node) {
  let x = 0, y = 0;
  for (let e = node; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
  return { x, y };
}

export function init(ctx) {
  const mount = document.getElementById("journal-list");
  if (!mount) return;
  const { bus, loop, pointer, ink, state, content, assets, scroll } = ctx;
  const reduced = !!ctx.reduced;
  const J = assets.jelly;
  const HOOKS = content.HOOKS;
  const widths = J.brain.grooves[0].map((g) => g.w);
  const mq = matchMedia("(max-width: 900px)");
  let narrow = mq.matches;
  const bootAt = Date.now();
  // what needs measuring (read phase) and what needs writing after a measure (frame)
  let layoutDirty = true, scrubDirty = true, paperDirty = true, posDirty = true;
  let layoutApply = false, scrubApply = false, paperApply = false, codeDirty = false;
  // the journal near the viewport at all, and the Book of Brains itself visible (IntersectionObservers below)
  let inView = false, bookVis = false;
  const CHEV = ink.brush(ink.spline([ink.P(1.8, 2.6), ink.P(5, 5.7), ink.P(8, 8), ink.P(11, 5.7), ink.P(14.2, 2.6)], false, 8), (t) => 1.3 + 1.3 * Math.sin(Math.PI * t));
  const RULE = ink.brush(ink.spline([ink.P(4, 7), ink.P(40, 4.5), ink.P(78, 7.5), ink.P(116, 5)], false, 14), (t) => 0.8 + 3.6 * Math.sin(Math.PI * t) ** 1.4);

  // ---------- what each brain said (live thoughts carry their version) ----------
  const mem = new Map();
  function remember(t) {
    if (t?.version == null || !t.text) return;
    const m = mem.get(t.version) || {};
    if (!m.first) m.first = t.text;
    m.last = t.text;
    mem.set(t.version, m);
  }
  (state.thoughts || []).forEach(remember);

  // ---------- DOM ----------
  mount.textContent = "";
  const root = el("div", "jr" + (reduced ? " jr--still" : ""));
  root.innerHTML = `
    <svg class="jr-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs><path id="jr-brain" d="${J.brain.d}"/></defs></svg>
    <div class="jr-time">
      <span class="jr-probe" aria-hidden="true">00000000000000000000</span>
      <ol class="jr-list"></ol>
      <svg class="jr-spine" aria-hidden="true" focusable="false">
        <g class="jr-spine__fx"></g>
        <path class="jr-spine__body"/>
        <path class="jr-spine__sparks"/>
        <path class="jr-spine__sel"/>
        <g class="jr-spine__nodes"></g>
        <g class="jr-spine__over"></g>
      </svg>
    </div>
    <aside class="jr-book" aria-label="Book of Brains">
      <div class="jr-scrub">
        <div class="jr-scrub__head">
          <p class="jr-scrub__title">Walk through my brains</p>
          <p class="jr-scrub__count"><span class="jr-scrub__now"></span> of <span class="jr-scrub__max"></span></p>
        </div>
        <div class="jr-scrub__track" role="slider" tabindex="0" aria-label="Brain version">
          <svg class="jr-scrub__svg" aria-hidden="true" focusable="false"><path class="jr-scrub__line"/><path class="jr-scrub__beads"/><path class="jr-scrub__live"/><path class="jr-scrub__handle"/></svg>
          <div class="jr-scrub__labels" aria-hidden="true"></div>
        </div>
      </div>
      <article class="jr-page">
        <svg class="jr-page__paper" aria-hidden="true" focusable="false"><path class="jr-page__sheet"/><path class="jr-page__stain"/></svg>
        <div class="jr-page__in">
          <header class="jr-page__top"><p class="jr-page__kicker">Book of Brains</p><p class="jr-page__no"></p></header>
          <svg class="jr-page__portrait" viewBox="-322 -252 644 470" aria-hidden="true" focusable="false">
            <use href="#jr-brain" class="jr-page__mass"/>
            <path class="jr-page__folds"/>
            <g class="jr-page__eyes"></g>
          </svg>
          <h3 class="jr-page__name"></h3>
          <p class="jr-page__title"></p>
          <p class="jr-page__life"></p>
          <div class="jr-page__said">
            <p class="jr-page__q"><span class="jr-page__label">First thought</span><span class="jr-page__first"></span></p>
            <p class="jr-page__q"><span class="jr-page__label jr-page__lastl">Last thought</span><span class="jr-page__last"></span></p>
          </div>
          <div class="jr-page__hooks"></div>
          <svg class="jr-page__rule" viewBox="0 0 120 12" aria-hidden="true" focusable="false"><path d="${RULE}"/></svg>
          <p class="jr-page__epitaph"></p>
        </div>
      </article>
    </aside>`;
  mount.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const timeEl = $(".jr-time"), list = $(".jr-list"), spineSvg = $(".jr-spine"), probe = $(".jr-probe"), book = $(".jr-book");
  const spineBody = $(".jr-spine__body"), fxG = $(".jr-spine__fx"), sparksEl = $(".jr-spine__sparks"), selEl = $(".jr-spine__sel");
  const nodesG = $(".jr-spine__nodes"), overG = $(".jr-spine__over");
  const track = $(".jr-scrub__track"), scrubSvg = $(".jr-scrub__svg"), scrubLine = $(".jr-scrub__line"), scrubBeads = $(".jr-scrub__beads");
  const scrubLive = $(".jr-scrub__live"), scrubHandle = $(".jr-scrub__handle"), scrubLabels = $(".jr-scrub__labels");
  const scrubNow = $(".jr-scrub__now"), scrubMax = $(".jr-scrub__max");
  const page = $(".jr-page"), pageIn = $(".jr-page__in"), sheet = $(".jr-page__sheet"), stain = $(".jr-page__stain"), paperSvg = $(".jr-page__paper");
  const pFolds = $(".jr-page__folds"), pEyesG = $(".jr-page__eyes"), portrait = $(".jr-page__portrait");
  const P = {
    no: $(".jr-page__no"), name: $(".jr-page__name"), title: $(".jr-page__title"), life: $(".jr-page__life"),
    first: $(".jr-page__first"), last: $(".jr-page__last"), lastl: $(".jr-page__lastl"), hooks: $(".jr-page__hooks"), epi: $(".jr-page__epitaph"),
  };

  // ---------- small builders ----------
  // hook chips: a brush swatch behind what grew; a fine pen strike through what fell off, over the name only,
  // thin enough that the name reads through it. Memoised: the Book of Brains rebuilds them on every page.
  const chipMemo = new Map();
  function chipHTML(id, kind) {
    const key = `${id}|${kind}`;
    let h = chipMemo.get(key);
    if (h) return h;
    const name = HOOKS[id]?.name ?? id;
    if (kind === "add") {
      const label = `+ ${name}`;
      const W = Math.round(label.length * 0.6 * 12 + 26), H = 26;
      h = `<li class="jr-chip jr-chip--add"><svg class="jr-chip__ink" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"><path d="${swatch(ink, W, H, seedOf(id + kind), { thick: 0.84 })}"/></svg><span>${esc(label)}</span></li>`;
    } else {
      const n = [...name].length;
      h = `<li class="jr-chip jr-chip--del"><span>− <span class="jr-chip__name">${esc(name)}<svg class="jr-chip__strike" viewBox="-10 0 ${n * 15 + 24} 25" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${strike(ink, n, seedOf(id + kind))}"/></svg></span></span></li>`;
    }
    chipMemo.set(key, h);
    return h;
  }
  function chipsHTML(d) {
    return [...(d.added || []).map((id) => chipHTML(id, "add")), ...(d.removed || []).map((id) => chipHTML(id, "del"))].join("");
  }

  // a brain drawn in its own units: ink mass, folds, two eyes that open, look, blink and sleep
  function makeEyes(parent, lidThick, lashes = false) {
    return J.brain.eyes.map((e) => {
      const eg = svgEl("g", { transform: `rotate(${e.rot} ${e.x} ${e.y})` }, parent);
      const og = svgEl("g", {}, eg);
      svgEl("ellipse", { class: "jr-c", cx: e.x, cy: e.y, rx: e.rx, ry: e.ry }, og);
      const r = Math.min(e.rx, e.ry) * (J.brain.pupil ?? 0.47);
      const pupil = svgEl("circle", { class: "jr-k", cx: e.x, cy: e.y, r: r.toFixed(1) }, og);
      const lid = svgEl("path", { class: "jr-c", d: lidPath(ink, e, lidThick, lashes) }, eg);
      return { e, og, pupil, lid, r, last: "" };
    });
  }
  function setEyes(eyes, open, lx, ly) {
    for (const E of eyes) {
      const { e } = E;
      const k = Math.max(0.03, open), py = e.y + e.ry * 0.5;
      const reach = Math.min(e.rx, e.ry) - E.r - 5;
      const key = `${k.toFixed(2)}|${lx.toFixed(2)}|${ly.toFixed(2)}`;
      if (key === E.last) continue;
      E.last = key;
      E.og.setAttribute("transform", `translate(0 ${(py * (1 - k)).toFixed(2)}) scale(1 ${k.toFixed(3)})`);
      E.og.setAttribute("opacity", open < 0.06 ? "0" : "1");
      E.lid.setAttribute("opacity", (1 - smooth(open * 2.6)).toFixed(3));
      E.pupil.setAttribute("cx", (e.x + lx * reach).toFixed(1));
      E.pupil.setAttribute("cy", (e.y + ly * reach).toFixed(1));
    }
  }
  // blink timing from the research: close 92 ms (smoothstep), hold 26 ms, open 185 ms (ease-out cubic)
  function blinkAmt(b, t) {
    if (t < b.at) return 1;
    const x = (t - b.at) * 1000;
    if (x < 92) return 1 - smooth(x / 92);
    if (x < 118) return 0;
    if (x < 303) return outCubic((x - 118) / 185);
    b.at = t + (b.dbl ? 0.24 : 2.5 + Math.random() * 1.7);
    b.dbl = !b.dbl && Math.random() < 0.14;
    return 1;
  }

  // ---------- records ----------
  const recs = [];            // newest first
  const byV = new Map();
  let selV = 0, dragging = false, scrubbedAt = -1e9, userAt = -1e9;

  function makeNode(rec) {
    // scale(0) until the first frame places it, so a fresh node never flashes at full brain size
    const g = svgEl("g", { class: "jr-node", transform: "scale(0)" }, nodesG);
    svgEl("use", { href: "#jr-brain", class: "jr-node__mass" }, g);
    svgEl("path", { class: "jr-node__folds", d: foldsPath(rec.folds, widths, 1.25) }, g);
    const eyes = makeEyes(g, 1.5);
    g.addEventListener("click", () => { userAt = performance.now(); select(rec.v, "click"); });
    return { g, eyes };
  }

  function makeEntry(d) {
    const li = el("li", "jr-e");
    li.dataset.v = d.v;
    const diff = d.diff || [];
    const adds = diff.filter((l) => l[0] === "+").length, dels = diff.filter((l) => l[0] === "-").length;
    li.innerHTML = `
      <p class="jr-e__ago"><span class="jr-e__when"></span><span class="jr-e__live"><svg viewBox="-6 -6 12 12" aria-hidden="true" focusable="false"><path d="${drop(0, 0, 3.6, d.v * 7)}"/></svg>thinking now</span></p>
      <div class="jr-e__head">
        <button class="jr-e__v" type="button" aria-label="Open brain v${d.v} in the Book of Brains">v${d.v}</button>
        <h3 class="jr-e__title">${esc(d.title)}</h3>
      </div>
      ${(d.added?.length || d.removed?.length) ? `<ul class="jr-e__chips" aria-label="Hooks changed">${chipsHTML(d)}</ul>` : ""}
      <div class="jr-e__meta">
        <span>${d.lines} lines</span><span class="jr-e__hash">build <b>${esc(d.hash)}</b></span>
        ${diff.length ? `<button class="jr-e__toggle" type="button" aria-expanded="false"><span class="jr-e__tl">Read the diff</span><span class="jr-e__pm">${adds ? `<span class="jr-e__plus">+${adds}</span>` : ""}${adds && dels ? " " : ""}${dels ? `<span class="jr-e__minus">−${dels}</span>` : ""}</span><svg class="jr-e__chev" viewBox="0 0 16 10" aria-hidden="true" focusable="false"><path d="${CHEV}"/></svg></button>` : ""}
      </div>
      ${diff.length ? `<div class="jr-e__diff"><div class="jr-e__diff-in"><pre class="jr-code" aria-label="Code diff for v${d.v}"><code></code></pre></div></div>` : ""}`;
    return li;
  }

  function addRecord(d, live) {
    if (byV.has(d.v)) return null;
    const rec = {
      v: d.v, d, folds: foldsFor(J, d), li: null, node: null,
      baseY: 0, off: 0, offV: 0, x: 0, y: 0, size: 0, hover: 0, open: 0, openTo: 0, lx: 0, ly: 0.3, isNow: false,
      fall: null, squash: 0, squashV: 0, blink: { at: 1 + Math.random() * 3, dbl: false },
      diffOpen: false, born: !live, codeCols: 0, codeDur: 0,
    };
    rec.li = makeEntry(d);
    rec.node = makeNode(rec);
    rec.vBtn = rec.li.querySelector(".jr-e__v");
    rec.toggle = rec.li.querySelector(".jr-e__toggle");
    rec.diff = rec.li.querySelector(".jr-e__diff");
    rec.code = rec.li.querySelector(".jr-code");
    rec.codeIn = rec.code?.firstElementChild || null;
    rec.when = rec.li.querySelector(".jr-e__when");
    rec.vBtn.addEventListener("click", () => {
      userAt = performance.now();
      select(rec.v, "click");
      if (narrow) page.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    });
    rec.toggle?.addEventListener("click", () => setDiff(rec, !rec.diffOpen, true));
    // tap (or hover) a blotted row to lift the ink and read what I deleted
    rec.code?.addEventListener("click", (e) => e.target.closest?.(".jr-lg--del")?.classList.toggle("is-lift"));
    rec.li.addEventListener("pointerenter", () => { rec.hovering = true; });
    rec.li.addEventListener("pointerleave", () => { rec.hovering = false; });
    if (live) rec.li.classList.add("is-unborn");
    // newest first in the list
    let before = null;
    for (const r of recs) if (r.v < d.v) { before = r; break; }
    list.insertBefore(rec.li, before ? before.li : null);
    const i = recs.findIndex((r) => r.v < d.v);
    if (i < 0) recs.push(rec); else recs.splice(i, 0, rec);
    byV.set(d.v, rec);
    return rec;
  }

  // ---------- diffs ----------
  let cols = 0;               // characters per code row at the current width (sign column not counted)
  function readCols() {
    const any = recs.find((r) => r.code);
    if (!any) return 0;
    const ch = probe.offsetWidth / 20;
    const w = any.code.clientWidth;
    return ch > 0 && w > 0 ? Math.max(16, Math.floor(w / ch - 2.4)) : 0;
  }
  function renderCode(rec) {
    if (!rec.codeIn || !cols) return;
    // a diff caught mid-animation by a re-wrap simply shows its final ink
    if (rec.code.classList.contains("is-play")) finishDiff(rec);
    const { html, dur } = codeHTML(ink, rec.d.diff, cols);
    rec.codeIn.innerHTML = html;
    rec.codeCols = cols;
    rec.codeDur = dur;
  }
  function finishDiff(rec) {
    clearTimeout(rec.playT);
    clearTimeout(rec.doneT);
    rec.code?.classList.remove("is-play", "is-armed");
  }
  function setDiff(rec, open, user) {
    if (!rec.diff) return;
    rec.diffOpen = open;
    rec.li.classList.toggle("is-open", open);
    rec.toggle.setAttribute("aria-expanded", String(open));
    rec.toggle.querySelector(".jr-e__tl").textContent = open ? "Hide the diff" : "Read the diff";
    if (open && !reduced) {
      clearTimeout(rec.doneT);
      rec.code.classList.remove("is-play");
      rec.code.classList.add("is-armed");
      if (user || rec.seen) playDiff(rec, user ? 0.32 : 0.1);
      else rec.waitPlay = true;
    }
    layoutDirty = true;
  }
  function playDiff(rec, delay = 0) {
    rec.waitPlay = false;
    if (reduced || !rec.code) return;
    clearTimeout(rec.playT);
    clearTimeout(rec.doneT);
    rec.playT = setTimeout(() => {
      const c = rec.code;
      // the play class is always off by now (setDiff takes it off a task earlier); restart cleanly if it is not
      if (c.classList.contains("is-play")) { c.classList.remove("is-play"); void getComputedStyle(c).opacity; }
      c.classList.add("is-armed", "is-play");
      bus.emit("sfx", { name: "tick" });
      // once the ink is dry, drop the animations: the resting styles are the final state
      rec.doneT = setTimeout(() => finishDiff(rec), (rec.codeDur + 0.3) * 1000);
    }, delay * 1000);
  }
  // play a waiting diff once it is actually on screen
  const ioDiff = new IntersectionObserver((es) => {
    for (const e of es) {
      const rec = byV.get(Number(e.target.closest(".jr-e")?.dataset.v));
      if (!rec || !e.isIntersecting) continue;
      rec.seen = true;
      if (rec.waitPlay && rec.born) playDiff(rec, 0.25);
    }
  }, { rootMargin: "0px 0px -18% 0px", threshold: 0.2 });

  // ---------- seed ----------
  // only real brains: before launch the journal is empty and says so, and the Book of Brains waits for the first one
  const seedEntries = (state.journal || []).slice().sort((a, b) => a.v - b.v);
  for (const d of seedEntries) addRecord(d, false);
  let emptyEl = null;
  if (!seedEntries.length) {
    emptyEl = document.createElement("li");
    emptyEl.className = "jr-empty";
    emptyEl.textContent = "No brains yet. The first one lands at launch.";
    list.appendChild(emptyEl);
    book.hidden = true;
  }
  // wrap every diff to the column it lives in (init time, so one forced layout is fine here)
  cols = readCols() || 60;
  for (const r of recs) renderCode(r);
  for (const r of recs) if (r.code) ioDiff.observe(r.code);
  const newest = () => recs[0];
  if (newest()) {
    newest().open = newest().openTo = 1;
    setDiff(newest(), true, false);
  }
  selV = newest()?.v ?? 0;

  // ---------- portrait (Book of Brains) ----------
  const pEyes = makeEyes(pEyesG, 1.15, true);
  const pCur = (byV.get(selV)?.folds || foldsFor(J, { hash: "x", v: 0 })).map((a) => a.slice());
  let pFrom = null, pTo = null, pT0 = 0, pOpen = 1, pOpenTo = 1, pDirty = true;
  const pBlink = { at: 2, dbl: false };
  const pLook = { x: 0, y: 0.25 };

  // ---------- layout: measured in the read phase, written in the frame ----------
  let W = 0, H = 0, spineW = -1, spineH = -1;
  let X0 = 34, W0 = 15, SIZE_NOW = 60, SIZE_OLD = 46;
  function readLayout() {
    layoutDirty = false;
    narrow = mq.matches;
    X0 = narrow ? 27 : 36;
    W0 = narrow ? 11 : 15;
    SIZE_NOW = narrow ? 46 : 62;
    SIZE_OLD = narrow ? 34 : 46;
    const lt = list.offsetTop;
    for (const r of recs) r.baseY = lt + r.li.offsetTop + r.vBtn.offsetTop + r.vBtn.offsetHeight * 0.55;
    W = timeEl.offsetWidth;
    H = timeEl.offsetHeight;
    const c = readCols();
    if (c && c !== cols) { cols = c; codeDirty = true; }
    layoutApply = true;
  }
  function applyLayout() {
    layoutApply = false;
    if (W !== spineW || H !== spineH) {
      spineW = W; spineH = H;
      spineSvg.setAttribute("width", W);
      spineSvg.setAttribute("height", H + 200);
      spineSvg.setAttribute("viewBox", `0 0 ${W} ${H + 200}`);
    }
    if (codeDirty) {
      codeDirty = false;
      for (const r of recs) if (r.codeCols !== cols) renderCode(r);
    }
  }
  // where things sit on the page, so a frame can place them from ctx.scroll.y without asking the layout
  let timeTop = 0, timeLeft = 0, vh = innerHeight, posAt = 0;
  let bookSticky = false, bookStick = 0, bookTop0 = 0, bookAreaBottom = 0, bookH = 0, bookLeft = 0, pDx = 0, pDy = 0;
  function readPos(now) {
    posDirty = false;
    posAt = now;
    vh = innerHeight;
    const tp = docPos(timeEl);
    timeTop = tp.y; timeLeft = tp.x;
    const cs = getComputedStyle(book);
    bookSticky = cs.position === "sticky";
    bookStick = parseFloat(cs.top) || 0;
    bookH = book.offsetHeight;
    // a stuck box's offsetTop already includes how far it is stuck, so take its resting top from its grid row,
    // which it shares with the timeline (both start-aligned in row one)
    bookTop0 = bookSticky ? tp.y : docPos(book).y;
    bookAreaBottom = docPos(root).y + root.offsetHeight;
    const br = book.getBoundingClientRect(), pr = portrait.getBoundingClientRect();
    bookLeft = br.left;
    pDx = pr.left - br.left + pr.width * 0.42;
    pDy = pr.top - br.top + pr.height * 0.45;
  }
  function bookTopOnScreen(sy) {
    const s = bookTop0 - sy;
    if (!bookSticky || s >= bookStick) return s;
    return Math.max(s, Math.min(bookStick, bookAreaBottom - sy - bookH));
  }
  const ro = new ResizeObserver((es) => {
    for (const e of es) {
      if (e.target === track) scrubDirty = true;
      else if (e.target === page) paperDirty = true;
      else if (e.target === list) layoutDirty = true;
    }
    posDirty = true;
  });
  ro.observe(list);
  ro.observe(track);
  ro.observe(page);
  ro.observe(document.body);   // anything above the journal growing or shrinking moves it
  const allDirty = () => { layoutDirty = scrubDirty = paperDirty = posDirty = true; };
  mq.addEventListener?.("change", allDirty);
  addEventListener("resize", () => { posDirty = true; }, { passive: true });
  document.fonts?.ready.then(allDirty);

  // ---------- the page ----------
  let pageW = 0, pageH = 0;
  function readPaper() {
    paperDirty = false;
    pageW = page.offsetWidth; pageH = page.offsetHeight;
    paperApply = true;
  }
  function applyPaper() {
    paperApply = false;
    const w = pageW, h = pageH;
    if (!w || !h) return;
    paperSvg.setAttribute("viewBox", `-8 -8 ${w + 16} ${h + 16}`);
    paperSvg.setAttribute("width", w + 16);
    paperSvg.setAttribute("height", h + 16);
    sheet.setAttribute("d", paper(ink, w, h, 41));
    // an old ink stain in the corner, the kind you get from writing obituaries for yourself
    stain.setAttribute("d", blot(w - 26, 22, 7.5, 12, 0.5, 90) + drop(w - 44, 38, 1.8, 3) + drop(w - 14, 44, 1.1, 5) + drop(w - 36, 9, 1, 8));
  }

  function chipsInline(ids, kind) {
    return `<ul class="jr-page__chips">${ids.map((id) => chipHTML(id, kind)).join("")}</ul>`;
  }
  function pageData(v) {
    const i = recs.findIndex((r) => r.v === v);
    const rec = recs[i];
    if (!rec) return null;
    const newer = recs[i - 1] || null, d = rec.d, alive = !newer;
    // what this brain really said: the thoughts the feed still keeps for it, and the ones seen since the page opened.
    // Never made up: a brain whose thoughts are no longer in the feed just has no quotes.
    const said = state.thoughts.filter((t) => t.version === v && t.text);
    const m = mem.get(v) || {};
    const first = said[0]?.text || m.first || "";
    const last = m.last || said[said.length - 1]?.text || "";
    const now = Date.now();
    const left = Math.max(0, (state.nextSwapAt || now) - now);
    return {
      alive, d,
      no: `page ${recs.length - i} of ${recs.length}`,
      name: alive ? `v${v}, still here` : `Here lies v${v}`,
      life: alive ? `Born ${clock(d.at)} · alive for ${minutes(now - d.at)} so far` : `${clock(d.at)} to ${clock(newer.d.at)} · lived ${minutes(newer.d.at - d.at)}`,
      first, last, lastl: alive ? "Latest thought" : "Last thought",
      hooks: (d.added?.length || d.removed?.length)
        ? `${d.added?.length ? `<span class="jr-page__grp"><span class="jr-page__label">Wrote</span>${chipsInline(d.added, "add")}</span>` : ""}${d.removed?.length ? `<span class="jr-page__grp"><span class="jr-page__label">Dropped</span>${chipsInline(d.removed, "del")}</span>` : ""}`
        : `<span class="jr-page__grp"><span class="jr-page__label">Wrote</span><span class="jr-page__none">nothing new, just thought harder</span></span>`,
      epi: alive ? (state.swapping ? (v < state.version ? "Being replaced as we speak." : "Too new for an epitaph.") : `No epitaph yet. Ask me again in ${minutes(left)}.`) : epitaphFor(d, HOOKS),
    };
  }
  const words = (s) => esc(s).split(" ").map((w, k) => `<span style="--w:${k}">${w}</span>`).join(" ");
  const setText = (node, s) => { if (node.textContent !== s) node.textContent = s; };
  let pageV = -1, pageAlive = null;
  function fillPage(v) {
    const D = pageData(v);
    if (!D) return;
    pageV = v; pageAlive = D.alive;
    setText(P.no, D.no);
    setText(P.name, D.name);
    setText(P.title, D.d.title);
    setText(P.life, D.life);
    setText(P.first, D.first ? `“${D.first}”` : "");
    setText(P.last, D.last ? `“${D.last}”` : "");
    P.first.parentElement.hidden = !D.first;
    P.last.parentElement.hidden = !D.last || D.last === D.first;
    setText(P.lastl, D.lastl);
    P.hooks.innerHTML = D.hooks;
    P.epi.innerHTML = words(D.epi);
    page.classList.toggle("is-alive", D.alive);
    paperDirty = true;
  }
  // the live page while the journal is off screen goes stale and catches up when it comes back
  let liveStale = false;
  function refreshLive() {
    if (pageV < 0) return;
    if (!inView) { liveStale = true; return; }
    liveStale = false;
    const D = pageData(pageV);
    if (!D) return;
    setText(P.life, D.life);
    if (D.alive) {
      setText(P.first, D.first ? `“${D.first}”` : "");
      P.first.parentElement.hidden = !D.first;
      P.last.parentElement.hidden = !D.last || D.last === D.first;
      const q = D.last ? `“${D.last}”` : "";
      if (P.last.textContent !== q) { P.last.textContent = q; if (!reduced) P.last.animate([{ opacity: 0, transform: "translateY(5px)" }, { opacity: 1, transform: "none" }], { duration: 700, easing: "cubic-bezier(.16,1,.3,1)" }); }
      if (P.epi.textContent !== D.epi) P.epi.innerHTML = words(D.epi);
    }
  }
  let turnAnim = null;
  function showPage(v, how) {
    const rec = byV.get(v);
    if (!rec) return;
    pFrom = pCur.map((a) => a.slice());
    pTo = rec.folds;
    pT0 = performance.now() / 1000;
    pOpenTo = recs[0]?.v === v ? 1 : 0;
    if (reduced || how === "instant") { fillPage(v); pFrom = null; pCur.forEach((a, k) => a.set(pTo[k])); pDirty = true; pOpen = pOpenTo; return; }
    turnAnim?.cancel();
    if (how === "drag") {
      fillPage(v);
      turnAnim = pageIn.animate([{ opacity: 0.3, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], { duration: 360, easing: "cubic-bezier(.16,1,.3,1)" });
      return;
    }
    const out = pageIn.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(10px) rotate(-.6deg)" }], { duration: 170, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" });
    turnAnim = out;
    out.onfinish = () => {
      fillPage(v);
      turnAnim = pageIn.animate([{ opacity: 0, transform: "translateY(-12px) rotate(.8deg)" }, { opacity: 1, transform: "none" }], { duration: 760, easing: "cubic-bezier(.34,1.56,.64,1)" });
      out.cancel();
      page.animate([{ transform: "rotate(-1.1deg)" }, { transform: "rotate(-2.2deg) translateY(3px)" }, { transform: "rotate(-1.1deg)" }], { duration: 900, easing: "cubic-bezier(.34,1.56,.64,1)" });
    };
  }

  // ---------- selection ----------
  function select(v, how = "click") {
    if (!byV.has(v)) return;
    const changed = v !== selV;
    selV = v;
    for (const r of recs) r.li.classList.toggle("is-sel", r.v === v);
    updateScrubAria();
    if (how !== "scroll") scrubbedAt = performance.now();
    if (changed || pageV !== v) showPage(v, how === "drag" ? "drag" : how);
    if (how === "click" && changed) bus.emit("sfx", { name: "bubble" });
  }

  // ---------- scrubber ----------
  let SW = 0, SWnext = 0, SH = 56, pad = 22, hx = 0, hv = 0, hTarget = 0, lastIdx = -1, trackLeft = 0;
  const asc = () => recs.slice().reverse();
  const beadX = (i, n) => (n <= 1 ? SW / 2 : pad + (i * (SW - 2 * pad)) / (n - 1));
  function readScrub() {
    scrubDirty = false;
    SWnext = track.offsetWidth || 300;
    scrubApply = true;
  }
  function applyScrub() {
    scrubApply = false;
    SW = SWnext;
    scrubSvg.setAttribute("viewBox", `0 0 ${SW} ${SH}`);
    scrubSvg.setAttribute("width", SW);
    scrubSvg.setAttribute("height", SH);
    const A = asc(), n = A.length;
    const every = n > 14 ? Math.ceil(n / 10) : 1;
    scrubLabels.innerHTML = A.map((r, i) => `<span class="jr-scrub__l${r.v === selV ? " is-on" : ""}" data-v="${r.v}" style="left:${beadX(i, n).toFixed(1)}px"${i % every && i !== n - 1 && r.v !== selV ? " hidden" : ""}>v${r.v}</span>`).join("");
    setText(scrubMax, String(n));
    const si = A.findIndex((r) => r.v === selV);
    hTarget = beadX(Math.max(0, si), n);
    if (!hx) hx = hTarget;
  }
  function updateScrubAria() {
    const A = asc(), n = A.length, si = A.findIndex((r) => r.v === selV);
    const alive = recs[0]?.v === selV;
    track.setAttribute("aria-valuemin", String(A[0]?.v ?? 0));
    track.setAttribute("aria-valuemax", String(A[n - 1]?.v ?? 0));
    track.setAttribute("aria-valuenow", String(selV));
    track.setAttribute("aria-valuetext", `v${selV}${alive ? ", alive" : ", retired"}`);
    setText(scrubNow, `v${selV}`);
    scrubLabels.querySelectorAll(".jr-scrub__l").forEach((l) => { const on = Number(l.dataset.v) === selV; l.classList.toggle("is-on", on); if (on) l.hidden = false; });
    if (!dragging) hTarget = beadX(Math.max(0, si), n);
  }
  function idxAt(x) {
    const n = recs.length;
    if (n <= 1) return 0;
    return Math.round(clamp((x - pad) / ((SW - 2 * pad) / (n - 1)), 0, n - 1));
  }
  function scrubTo(x, how) {
    const A = asc();
    const i = idxAt(x);
    if (i !== lastIdx) { lastIdx = i; if (how === "drag") bus.emit("sfx", { name: "tick" }); }
    select(A[i].v, how);
  }
  track.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    userAt = performance.now();
    track.setPointerCapture?.(e.pointerId);
    track.classList.add("is-drag");
    trackLeft = track.getBoundingClientRect().left;   // once per drag; the track does not move under the finger
    const x = e.clientX - trackLeft;
    hTarget = clamp(x, pad, SW - pad);
    scrubTo(x, "drag");
  });
  track.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const x = e.clientX - trackLeft;
    hTarget = clamp(x, pad, SW - pad);
    scrubTo(x, "drag");
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    userAt = performance.now();
    track.classList.remove("is-drag");
    updateScrubAria();
    showPage(selV, "turn");
  };
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);
  track.addEventListener("keydown", (e) => {
    const A = asc(), i = A.findIndex((r) => r.v === selV);
    let j = i;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") j = i - 1;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") j = i + 1;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = A.length - 1;
    else return;
    e.preventDefault();
    userAt = performance.now();
    j = clamp(j, 0, A.length - 1);
    if (j !== i) select(A[j].v, "click");
  });

  // ---------- scroll-sync: diving deeper turns back the pages (desktop, side by side) ----------
  // One reading line at 40% of the viewport: the entry that spans it is the page. (A band could hold the seam
  // between two entries, and a few pixels of layout shift above made the book turn twice.)
  const ioRead = new IntersectionObserver((es) => {
    if (narrow || dragging || performance.now() - scrubbedAt < 1600) return;
    let pick = 0;
    for (const e of es) {
      if (!e.isIntersecting) continue;
      const line = e.rootBounds ? e.rootBounds.top : innerHeight * 0.4, b = e.boundingClientRect;
      if (b.top <= line && b.bottom > line) pick = Number(e.target.dataset.v);
    }
    if (pick && pick !== selV && byV.get(pick)?.born) select(pick, "scroll");
  }, { rootMargin: "-40% 0px -60% 0px" });

  // ---------- visibility: the whole journal (idle when it is away), and the book on its own ----------
  new IntersectionObserver((es) => {
    inView = es[es.length - 1].isIntersecting;
    if (!inView) return;
    posDirty = true;
    refreshAgo();
    if (liveStale) refreshLive();
  }, { rootMargin: "160px 0px" }).observe(root);
  new IntersectionObserver((es) => { bookVis = es[es.length - 1].isIntersecting; }, { rootMargin: "60px 0px" }).observe(book);

  // ---------- fx: ink spreads, heartbeat rings ----------
  const fx = [];
  function spawnInk(x, y, R, seed) {
    const path = svgEl("path", { class: "jr-k" }, fxG);
    fx.push({ kind: "blot", path, x, y, R, seed, t0: performance.now() / 1000, dur: 1.6 });
  }
  function spawnRing(x, y, r0, amp, dur = 1.5, cls = "jr-c") {
    const path = svgEl("path", { class: cls, "fill-rule": "evenodd" }, overG);
    fx.push({ kind: "ring", path, x, y, r0, amp, seed: (Math.random() * 1e6) | 0, t0: performance.now() / 1000, dur });
  }

  // ---------- live events ----------
  bus.on("thought", (t) => {
    remember(t);
    if (t.version === recs[0]?.v) kickAt = performance.now() / 1000;
    if (pageV === recs[0]?.v) refreshLive();
  });
  let swapStartAt = -1;
  bus.on("brain:swap:start", () => { swapStartAt = performance.now() / 1000; if (pageAlive) refreshLive(); });
  bus.on("brain:swap:done", () => { if (pageAlive) refreshLive(); });
  bus.on("journal:add", (d) => {
    if (!d || byV.has(d.v)) return;
    if (emptyEl) { emptyEl.remove(); emptyEl = null; book.hidden = false; allDirty(); }
    scrubbedAt = performance.now();
    // FLIP: remember where everyone was (an event, once per brain: measuring right here is fine)
    if (layoutDirty) readLayout();
    const before = new Map(recs.map((r) => [r, r.baseY]));
    const prev = recs[0];
    const rec = addRecord(d, true);
    if (!rec) return;
    renderCode(rec);
    if (rec.code) ioDiff.observe(rec.code);
    ioRead.observe(rec.li);
    refreshAgo();
    readLayout();
    applyLayout();
    posDirty = true;
    for (const [r, y0] of before) r.off += y0 - r.baseY;
    const now = performance.now() / 1000;
    rec.fall = reduced ? null : { t0: now + 0.15, from: -150 };
    rec.open = 0; rec.openTo = 0;
    if (prev) prev.openTo = 0;              // the old brain closes its eyes
    const land = () => {
      const followed = selV === prev?.v || performance.now() - userAt > 8000;
      rec.born = true;
      rec.li.classList.remove("is-unborn");
      rec.li.classList.add("is-born");
      setTimeout(() => rec.li.classList.remove("is-born"), 1800);   // risen: drop the entrance animations
      rec.openTo = 1;
      refreshAgo();
      scrubbedAt = performance.now();
      if (rec.diff) setDiff(rec, true, false);
      if (rec.seen || reduced) playDiff(rec, 0.9);
      scrubDirty = true;
      if (followed) select(rec.v, "click"); else updateScrubAria();
      if (pageV === prev?.v) fillPage(prev.v);  // its page becomes an obituary
    };
    if (reduced) land();
    else rec.landCb = land;
    scrubDirty = true;
  });
  bus.on("brain:countdown", () => { if (pageAlive && inView && bookVis) liveTick(); });
  let lastLiveTick = 0;
  function liveTick() {
    const n = performance.now();
    if (n - lastLiveTick < 5000) return;
    lastLiveTick = n;
    refreshLive();
  }
  // time ago, every 20 s
  function refreshAgo() {
    const now = Date.now();
    for (const r of recs) {
      setText(r.when, ago(now - r.d.at));
      r.li.classList.toggle("is-now", r === recs[0]);
    }
  }
  refreshAgo();
  setInterval(() => { if (!document.hidden && inView) { refreshAgo(); refreshLive(); } }, 20000);

  for (const r of recs) ioRead.observe(r.li);
  readLayout(); applyLayout();
  readScrub(); applyScrub();
  updateScrubAria();
  fillPage(selV);
  recs.forEach((r) => r.li.classList.toggle("is-sel", r.v === selV));

  // ---------- the frame ----------
  const SX = new Float32Array(1400), SY = new Float32Array(1400), SWD = new Float32Array(1400);
  const KX = new Float32Array(64), KY = new Float32Array(64), KW = new Float32Array(64);
  const sparks = reduced ? [] : Array.from({ length: narrow ? 2 : 3 }, (_, i) => ({ u: 0.15 + i * 0.3, sp: 26 + i * 9, len: 4 + i }));
  let push = 0, pushY = 0, pushDir = 1, kickAt = -10, lastBeatPh = 0, selOn = false, lastSparks = "";
  const spineXAt = (y, t) => X0 + (reduced ? 0 : 6.5 * Math.sin((y / 430) * TAU - t * 0.55) + 2.4 * Math.sin((y / 157) * TAU + t * 0.9))
    + pushDir * 17 * push * Math.exp(-(((y - pushY) / 120) ** 2));
  const BEAT = 2.4;
  const bump = (x, d) => (x > 0 && x < d ? Math.sin((Math.PI * x) / d) ** 2 : 0);

  // read phase: runs before any module writes this frame, so these reads never force a layout
  function read() {
    if (!inView) return;
    const now = performance.now();
    if (layoutDirty) readLayout();
    if (scrubDirty) readScrub();
    if (paperDirty) readPaper();
    if (posDirty || now - posAt > 1000) readPos(now);   // and a cheap re-check every second, for safety
  }

  function frame(t, dt) {
    if (!inView) return;
    if (layoutApply) applyLayout();
    if (scrubApply) applyScrub();
    if (paperApply) applyPaper();
    const now = performance.now() / 1000;
    const sy = scroll.y;
    const tTop = timeTop - sy;                       // the timeline's top on screen
    const vy0 = -tTop - PAD, vy1 = vh - tTop + PAD;  // the stretch of it near the viewport, in its own units
    const inWin = (y) => y > vy0 && y < vy1;

    // pointer: the tentacle shies away, the living brains look
    const lx = pointer.x - timeLeft, ly = pointer.y - tTop;
    const near = pointer.active && !reduced && Math.abs(lx - X0) < 130 && ly > -60 && ly < H + 60 ? 1 : 0;
    push += (near - push) * ease(dt, near ? 0.25 : 0.6);
    if (near) { pushY += (ly - pushY) * ease(dt, 0.12); pushDir = lx > X0 ? -1 : 1; }

    // nodes: springs (FLIP), falls, squash, hover, eyes
    const cur = recs[0];
    let lowest = 0;
    for (const r of recs) {
      if (r.off) {
        r.offV += (-150 * r.off - 17 * r.offV) * dt;
        r.off += r.offV * dt;
        if (Math.abs(r.off) < 0.2 && Math.abs(r.offV) < 2) { r.off = 0; r.offV = 0; }
        r.li.style.transform = r.off ? `translateY(${r.off.toFixed(1)}px)` : "";
      }
      let y = r.baseY + r.off;
      if (r.fall) {
        // a brain that arrived while nobody was looking falls when you get here
        if (!r.fall.seen) {
          if (r.baseY < 30 - tTop || r.baseY > vh - 30 - tTop) { r.y = r.fall.from; r.x = X0; continue; }
          r.fall.seen = true; r.fall.t0 = Math.max(r.fall.t0, now);
        }
        const p = (now - r.fall.t0) / 0.62;
        if (p < 0) y = r.fall.from;
        else if (p < 1) y = lerp(r.fall.from, y, p * p);
        else {
          r.fall = null;
          r.squashV = -9;
          const x = spineXAt(y, t);
          spawnInk(x, y, narrow ? 46 : 64, r.v * 13 + 5);
          spawnRing(x, y, 30, 120, 1.7);
          bus.emit("ripple", { x: timeLeft + x, y: tTop + y, strength: 0.7 });
          bus.emit("sfx", { name: "splat" });
          r.landCb?.(); r.landCb = null;
        }
      }
      // squash spring after landing
      r.squashV += (-120 * r.squash - 9 * r.squashV) * dt;
      r.squash += r.squashV * dt;
      r.hover += ((r.hovering ? 1 : 0) - r.hover) * ease(dt, 0.18);
      r.open += (r.openTo - r.open) * ease(dt, r.openTo > r.open ? 0.22 : 0.4);
      r.y = y;
      r.x = spineXAt(y, t);
      if (!r.fall) lowest = Math.max(lowest, r.baseY + r.off);
    }
    if (!lowest) lowest = H - 40;

    // the spine: a tapered brush with a travelling sway and a curl at the tip, sampled on a fixed grid so the
    // outline never crawls, and only for the stretch near the viewport
    const top = Math.max(-40, (cur && !cur.fall ? cur.baseY + cur.off : 60) - (narrow ? 92 : 118)), bot = lowest + (narrow ? 60 : 80);
    const span = Math.max(1, bot - top), step = Math.max(7, span / 1100);
    const N = Math.floor(span / step) + 1;
    const k0 = Math.max(0, Math.floor((vy0 - top) / step)), k1 = Math.min(N - 1, Math.ceil((vy1 - top) / step));
    if (k1 - k0 >= 1) {
      let n = 0;
      for (let k = k0; k <= k1 && n < 1200; k++) {
        const y = top + k * step, u = (y - top) / span;
        SX[n] = spineXAt(y, t); SY[n] = y;
        SWD[n] = (W0 * smooth((y - top) / 64) * (1 - 0.7 * Math.pow(u, 0.85)) + 0.9) / 2;
        n++;
      }
      if (k1 === N - 1) {
        let x = SX[n - 1], y = SY[n - 1];
        let hd = Math.atan2(SY[n - 1] - SY[n - 2], SX[n - 1] - SX[n - 2]);
        const turns = 1.2, r0 = narrow ? 15 : 21, r1 = 4, total = turns * TAU, wEnd = SWD[n - 1];
        let ang = 0;
        const wob = reduced ? 0 : 0.18 * Math.sin(t * 0.7);
        while (ang < total && n < 1390) {
          const rr = r0 + (r1 - r0) * (ang / total);
          const dh = 3.5 / rr;
          hd += -(1 + wob) * dh; ang += dh;
          x += Math.cos(hd) * 3.5; y += Math.sin(hd) * 3.5;
          SX[n] = x; SY[n] = y; SWD[n] = Math.max(0.6, wEnd * (1 - 0.72 * (ang / total)));
          n++;
        }
      }
      spineBody.setAttribute("d", ribbon(SX, SY, SWD, n, k0 === 0, true));
    }

    // memory specks sinking down the tentacle
    if (sparks.length) {
      let d = "";
      const start = cur ? clamp((cur.y - top) / span, 0, 1) : 0;
      for (const s of sparks) {
        s.u += (s.sp / Math.max(200, span)) * dt;
        if (s.u > 1) s.u = start + Math.random() * 0.04;
        const fade = smooth((s.u - start) / 0.05) * (1 - smooth((s.u - 0.9) / 0.1));
        if (fade <= 0.05) continue;
        const head = s.u * (N - 1);
        const a = Math.max(0, Math.floor(head - s.len - 3)), b = Math.min(N - 1, Math.ceil(head));
        if (top + b * step < vy0 || top + a * step > vy1) continue;
        let m = 0;
        for (let i = a; i <= b && m < 60; i++) {
          const f = (i - a) / Math.max(1, b - a), y = top + i * step;
          KX[m] = spineXAt(y, t) + 1.4; KY[m] = y;
          KW[m] = Math.max(0.3, 1.5 * Math.sin(Math.PI * f) * fade);
          m++;
        }
        if (m > 1) d += ribbon(KX, KY, KW, m);
      }
      if (d !== lastSparks) { sparksEl.setAttribute("d", d); lastSparks = d; }
    }

    // heartbeat of the living brain: lub-dub, plus a beat on every thought it has
    let beat = 0;
    if (cur && !reduced) {
      const ph = t % BEAT;
      if (ph < lastBeatPh && !cur.fall && cur.born && inWin(cur.y)) spawnRing(cur.x, cur.y, (cur.size || SIZE_NOW) * 0.5, 34, 1.6);
      lastBeatPh = ph;
      beat = 0.13 * bump(ph, 0.26) + 0.07 * bump(ph - 0.3, 0.32) + 0.12 * bump(now - kickAt, 0.3);
      if (swapStartAt > 0 && now - swapStartAt < 2.6) beat += 0.04 * Math.sin(now * 46);   // nervous before the swap
    }

    // draw the nodes near the viewport (the rest keep their state and wait)
    const plx = pointer.x, ply = pointer.y;
    for (const r of recs) {
      if (r.fall && !r.fall.seen) continue;
      const alive = r === cur;
      const target = alive ? SIZE_NOW : SIZE_OLD;
      r.size += (target - r.size || 0) * ease(dt, 0.3);
      if (!r.size) r.size = target;
      // eyes: the living one watches the pointer and blinks; retired ones sleep
      let lx2 = 0, ly2 = 0.3;
      if (alive && pointer.active) {
        const dx = plx - (timeLeft + r.x), dy = ply - (tTop + r.y), dd = Math.hypot(dx, dy) || 1, reach = Math.min(1, dd / 125);
        lx2 = (dx / dd) * reach; ly2 = (dy / dd) * reach;
      }
      r.lx += (lx2 - r.lx) * ease(dt, 0.055);
      r.ly += (ly2 - r.ly) * ease(dt, 0.055);
      if (!inWin(r.y)) continue;
      const sq = clamp(r.squash, -0.4, 0.4);
      const s = (r.size / BRAIN_W) * (1 + (alive ? beat : 0) + 0.12 * r.hover);
      const sx = s * (1 - sq * 0.9), sy2 = s * (1 + sq);
      r.node.g.setAttribute("transform", `translate(${r.x.toFixed(1)} ${r.y.toFixed(1)}) rotate(${(-4 + (reduced ? 0 : 3 * Math.sin(t * 0.8 + r.v))).toFixed(2)}) scale(${sx.toFixed(4)} ${sy2.toFixed(4)})`);
      const bl = alive && !reduced ? blinkAmt(r.blink, now) : 1;
      setEyes(r.node.eyes, r.open * bl, r.lx, r.ly);
      if (r.isNow !== alive) { r.isNow = alive; r.node.g.classList.toggle("is-now", alive); }
    }

    // the selected brain wears a cream ring
    const sr = byV.get(selV);
    if (sr && !sr.fall && inWin(sr.y)) {
      selEl.setAttribute("d", ring(sr.x, sr.y, sr.size * (narrow ? 0.5 : 0.56) + (narrow ? 3 : 6), narrow ? 2.6 : 3.2, sr.v * 101, reduced ? 0 : t, 56));
      selOn = true;
    } else if (selOn) { selEl.setAttribute("d", ""); selOn = false; }

    // fx
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], p = (now - f.t0) / f.dur;
      if (p >= 1) { f.path.remove(); fx.splice(i, 1); continue; }
      if (f.kind === "blot") {
        const g = p < 0.42 ? outCubic(p / 0.42) : 1 - 0.35 * smooth((p - 0.42) / 0.58);
        f.path.setAttribute("d", blot(f.x, f.y, f.R * (0.55 + 0.45 * g), f.seed, g));
        f.path.setAttribute("opacity", (1 - smooth((p - 0.45) / 0.55)).toFixed(3));
      } else {
        const e = outCubic(p);
        f.path.setAttribute("d", ring(f.x, f.y, f.r0 + f.amp * e, Math.max(0.4, 3.4 * (1 - e)), f.seed, now));
        f.path.setAttribute("opacity", (0.85 * (1 - smooth(p))).toFixed(3));
      }
    }

    if (!bookVis) return;

    // scrubber: the handle is a cream drop on a springy line; beads swell as it passes
    if (SW) {
      const n2 = recs.length;
      if (dragging) { hv = (hTarget - hx) / Math.max(dt, 1e-3); hx = hTarget; }
      else if (reduced) { hx = hTarget; hv = 0; }
      else { hv += (170 * (hTarget - hx) - 14 * hv) * dt; hx += hv * dt; }
      const yL = 22;
      const m = 48;
      for (let i = 0; i < m; i++) {
        const u = i / (m - 1);
        const x = lerp(pad - 12, SW - pad + 12, u);
        KX[i] = x;
        KY[i] = yL + (reduced ? 0 : 2.2 * Math.sin(x * 0.021 - t * 1.1)) + 3 * Math.exp(-(((x - hx) / 34) ** 2)) * (dragging ? 1 : 0.5);
        KW[i] = 1.1 + 2.3 * u;
      }
      scrubLine.setAttribute("d", ribbon(KX, KY, KW, m));
      let bd = "";
      for (let i = 0; i < n2; i++) {
        const x = beadX(i, n2);
        const near2 = Math.exp(-(((x - hx) / 30) ** 2));
        const yy = yL + (reduced ? 0 : 2.2 * Math.sin(x * 0.021 - t * 1.1));
        const isLive = i === n2 - 1;
        const rad = (isLive ? 5.6 : 4.4) * (1 + 0.75 * near2) * (isLive ? 1 + beat * 1.5 : 1);
        if (near2 > 0.85 && !dragging) continue;
        bd += drop(x, yy, rad, i * 31 + 7, 12);
      }
      scrubBeads.setAttribute("d", bd);
      const live = beadX(n2 - 1, n2), lyy = yL + (reduced ? 0 : 2.2 * Math.sin(live * 0.021 - t * 1.1));
      scrubLive.setAttribute("d", Math.abs(live - hx) > 14 ? drop(live, lyy, 1.8 * (1 + beat * 2), 3, 10) : "");
      // handle: squash and stretch with its speed
      const st = clamp(Math.abs(hv) / 1400, 0, 0.55);
      const rx = 10.5 * (1 + st), ry = 10.5 / Math.sqrt(1 + st);
      const hy = yL + (reduced ? 0 : 2.2 * Math.sin(hx * 0.021 - t * 1.1));
      let hd = "";
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU;
        const w = 1 + (reduced ? 0 : 0.05 * Math.sin(3 * a + t * 3) + 0.03 * Math.sin(5 * a - t * 2));
        hd += (i ? "L" : "M") + (hx + Math.cos(a) * rx * w).toFixed(1) + " " + (hy + Math.sin(a) * ry * w).toFixed(1);
      }
      scrubHandle.setAttribute("d", hd + "Z");
    }

    // portrait: folds morph between versions, eyes open for the living brain
    if (pFrom) {
      const p = (now - pT0) / 0.7;
      for (let k = 0; k < pCur.length; k++) {
        const e = outBack(clamp((now - pT0 - k * 0.05) / 0.62), 1.2);
        const a = pFrom[k], z = pTo[k], c = pCur[k];
        for (let i = 0; i < c.length; i++) c[i] = a[i] + (z[i] - a[i]) * e;
      }
      if (p > 1.5) pFrom = null;
      pDirty = true;
    }
    if (pDirty) { pFolds.setAttribute("d", foldsPath(pCur, widths, 1)); pDirty = false; }
    pOpen += (pOpenTo - pOpen) * ease(dt, pOpenTo > pOpen ? 0.25 : 0.35);
    {
      let tx = 0, ty = 0.35;
      if (pOpenTo && pointer.active) {
        // the book is sticky on wide screens: where it sits follows from the scroll, no measuring needed
        const dx = pointer.x - (bookLeft + pDx), dy = pointer.y - (bookTopOnScreen(sy) + pDy), dd = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, dd / 125);
        tx = (dx / dd) * reach; ty = (dy / dd) * reach;
      }
      pLook.x += (tx - pLook.x) * ease(dt, 0.055);
      pLook.y += (ty - pLook.y) * ease(dt, 0.055);
      const bl = pOpenTo && !reduced ? blinkAmt(pBlink, now) : 1;
      setEyes(pEyes, pOpen * bl, pLook.x, pLook.y);
    }
  }

  if (ctx.params?.has("perf")) {
    const perf = (window.__jrPerf = { n: 0, total: 0, max: 0, readMs: 0, readMax: 0 });
    loop.read(() => {
      const a = performance.now();
      read();
      const d = performance.now() - a;
      perf.readMs += d; perf.readMax = Math.max(perf.readMax, d);
    });
    loop.add((t, dt) => {
      const a = performance.now();
      frame(t, dt);
      const d = performance.now() - a;
      perf.n++; perf.total += d; perf.max = Math.max(perf.max, d);
    });
  } else {
    loop.read(read);
    loop.add(frame);
  }
}
