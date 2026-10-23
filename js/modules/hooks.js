// hooks: "My tentacles are my functions." A big Turri (createJelly from hero-jelly) holds every live hook out
// in the water. Each tentacle tip spins a fine ink thread to a glass capsule, the same glass as my bell, holding
// the hook's name, its rule in my words, a live number on odometer reels, its age and the brain that wrote it.
// - Threads follow the moving tips every frame: they sag, lag behind and sway; the capsules are tugged along.
// - A fee arrives: a cream pulse runs down a tentacle, along its thread, into the capsule, and the number rolls.
// - Hover a capsule: light runs down its tentacle and thread, the glass catches it, and I look at it.
// - hook:add grows a tentacle, spins a thread and blows a new capsule: the glass comes out wet and pale and
//   dries to my water colour. The text is written in ink from its first word; nothing ever washes it out.
// - hook:remove snaps the thread, floods the glass with ink and lets the capsule sink into the dark.
// - During a brain swap the threads go slack and the glass goes dull and loses its glint (the text stays
//   ink); the new brain reconnects them one by one.
// - The names breathe on Fraunces' SOFT axis, a few quantised steps at a time, so the letters stay alive
//   without re-laying out every capsule on every frame.
// - I never move the page under a reader: growing or dropping a capsule while they are further down is paid
//   back with an instant scroll; while they watch my bottom edge, the height glides with the capsules.
// Frame phases: measure() runs in ctx.loop.read (stage rect, tentacle tips); frame() only writes.
// Events used: hooks:set, hook:add, hook:remove, vault, journal:add, thought, brain:swap:start|mid|done.
// Emits: hook:hover {id}, hook:hover:end {id}, ripple, sfx.
import { createJelly } from "./hero-jelly.js";
import {
  TAU, clamp, lerp, smoothstep, easeOutCubic, easeInCubic, easeInOutCubic, easeOutBack, ease, r1, hash01,
  svgEl, catmull, arcLen, ribbon, vesicle, sealPath,
} from "./hooks/geo.js";
import { createOdometer } from "./hooks/odometer.js";
import { createStats, ageText } from "./hooks/stats.js";
import { setAttr } from "../core/dom.js";

const MAXN = 44, SUB = 4, GAP = 24;
const RB = new Float32Array(1024), RC = new Float32Array(512);
const CB = new Float32Array(MAXN * SUB * 2 + 8), CC = new Float32Array(MAXN * SUB + 4);
const HW = new Float32Array(MAXN * SUB + 4), HL = new Float32Array(MAXN * SUB + 4);
const PX = new Float32Array(8), PY = new Float32Array(8);
// the name's breath: SOFT 0..100 in 16 steps (each step is one cached font instance and one small re-layout)
const SOFT_STEPS = 16;
const SOFT_V = Array.from({ length: SOFT_STEPS + 1 }, (_, i) => `"opsz" 72, "wght" 600, "SOFT" ${((100 * i) / SOFT_STEPS).toFixed(2)}, "WONK" 1`);
const FLASH_EASE = "cubic-bezier(.16, 1, .3, 1)";
let UID = 0;

const div = (cls, parent) => { const d = document.createElement("div"); d.className = cls; parent?.appendChild(d); return d; };
const idxAt = (u, m) => { let i = 0; while (i < m - 1 && CC[i] < u) i++; return i; };
// n points evenly spaced by arc length along a flat polyline (m points, cumulative table cum), in one pass
function sampleEven(c, m, cum, n, ox, oy) {
  let i = 1;
  for (let k = 0; k < n; k++) {
    const u = n > 1 ? k / (n - 1) : 0;
    while (i < m - 1 && cum[i] < u) i++;
    const a = cum[i - 1], b = cum[i], f = b > a ? clamp((u - a) / (b - a)) : 0;
    ox[k] = c[2 * i - 2] + (c[2 * i] - c[2 * i - 2]) * f;
    oy[k] = c[2 * i - 1] + (c[2 * i + 1] - c[2 * i - 1]) * f;
  }
}

export function init(ctx) {
  const mount = document.getElementById("hooks");
  if (!mount || !ctx.assets?.jelly) return;
  const { bus, loop, state } = ctx;
  const reduced = !!ctx.reduced;
  const stats = createStats(ctx);

  // ---------- DOM ----------
  mount.classList.add("hk");
  const stage = div("hk-stage", mount);
  if (reduced) stage.classList.add("is-still");
  const jMount = div("hk-jelly", stage);
  const tSvg = svgEl("svg", { class: "hk-threads", "aria-hidden": "true", focusable: "false" }, stage);
  const inkG = svgEl("g", {}, tSvg), litG = svgEl("g", {}, tSvg);
  const list = div("hk-cards", stage);
  list.setAttribute("role", "list");
  list.setAttribute("aria-label", "Hooks running on my coin right now");

  // ---------- state ----------
  // the mount bleeds into the section gutter (hooks.css); the stage is the text column inside it
  const sec = mount.closest("section") || mount;
  const firstW = stage.clientWidth || innerWidth;
  const REACH = firstW >= 940 ? 0.9 : 0.8;
  let mode = "", Ws = 0, Hs = 0, Wc = 300, J = { k: 0.7, cx: 0, bellTop: 0, anchorY: 300, tipY: 600, tipYmax: 680 };
  let jelly = null, visible = false, entered = reduced, needLayout = false, T = 0;
  let slack = 0, slackTo = 0, hovered = null, hoverLock = 0, lastPulse = -9, rr = 0;
  let shownH = 0, hY = 0, hV = 0, gliding = false, glideReq = false;
  const cards = new Map();

  // ---------- measured in the read phase, before anything on the page writes this frame ----------
  // box: the stage's client rect and the viewport height. tips: each tentacle tip in stage px. The jelly steps
  // its tentacles in the write phase, so a tip read here is one step old; frame() carries it forward by the
  // step it took last frame (scaled by dt), which lands it on the tip the jelly is about to draw.
  const box = { top: 0, left: 0, bottom: 0, vh: innerHeight, fresh: false };
  const tipsRead = new Map();     // id -> { x, y, dx, dy, n }
  let readN = 0, readDt = 1 / 60, stepK = 0;
  let breath = 0;                 // SOFT writes left this frame (one name re-lays out per frame at most)

  // ---------- capsules ----------
  function makeCard(hook, { version, at } = {}) {
    const m = stats.track(hook, version, at);
    const id = hook.id, seed = hash01(id), uid = `hk${++UID}`;
    const el = document.createElement("article");
    el.className = "hk-card";
    el.tabIndex = 0;
    el.setAttribute("role", "listitem");
    el.dataset.id = id;
    el.innerHTML = `
      <svg class="hk-card__glass" aria-hidden="true" focusable="false">
        <defs><clipPath id="${uid}-c" clipPathUnits="userSpaceOnUse"><path class="hk-clip"/></clipPath></defs>
        <path class="hk-glass"/>
        <g clip-path="url(#${uid}-c)"><path class="hk-flood"/></g>
        <path class="hk-shine"/>
        <path class="hk-rim" fill-rule="evenodd"/>
        <path class="hk-glint"/>
        <path class="hk-knot"/>
      </svg>
      <div class="hk-card__body">
        <p class="hk-card__age"></p>
        <h3 class="hk-card__name"></h3>
        <p class="hk-card__rule"></p>
        <p class="hk-card__stat"><span class="hk-odo" aria-hidden="true"></span><span class="hk-card__unit" aria-hidden="true"></span><span class="hk-sr"></span></p>
      </div>
      <span class="hk-seal"><svg aria-hidden="true" focusable="false" viewBox="0 0 44 40"><path/></svg><span class="hk-seal__v"></span></span>`;
    const q = (s) => el.querySelector(s);
    q(".hk-card__name").textContent = hook.name || id;
    q(".hk-card__rule").innerHTML = (hook.rule || "").split(/\s+/).filter(Boolean)
      .map((w, i) => `<span class="hk-w" style="--i:${i}">${w.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>`).join(" ");
    q(".hk-seal svg path").setAttribute("d", sealPath(18, seed + 0.31));
    const sealV = q(".hk-seal__v");
    sealV.textContent = `v${m.v}`;
    q(".hk-seal").setAttribute("title", `Grew in brain v${m.v}`);
    // a tentacle the first brain will grow (before launch): no seal yet, and it says when it starts
    if (hook.planned) { el.classList.add("is-planned"); q(".hk-seal").hidden = true; }
    const c = {
      id, hook, el, seed, m,
      glass: q(".hk-glass"), flood: q(".hk-flood"), clip: q(".hk-clip"), shine: q(".hk-shine"), rim: q(".hk-rim"),
      glint: q(".hk-glint"), knot: q(".hk-knot"), svg: q(".hk-card__glass"),
      nameEl: q(".hk-card__name"), ageEl: q(".hk-card__age"), srEl: q(".hk-sr"), unitEl: q(".hk-card__unit"),
      odo: createOdometer(q(".hk-odo"), { reduced }),
      w: 0, h: 0, ves: null, kx: 0, ky: 0, vkey: "",
      slot: null, slotV: { x: 0, y: 0 }, slotTo: { x: 0, y: 0 },
      off: { x: 0, y: 0 }, offV: { x: 0, y: 0 }, rot0: (hash01(id + "r") - 0.5) * 3.2, bw: 0.9 + hash01(id + "b") * 0.7,
      side: -1, rank: 0, laneX: 0, order: 0,
      tip: { x: 0, y: 0 }, hasTip: false, tipAvg: null,
      state: reduced ? "live" : "born", t0: null, wait: 0, shoot: reduced ? 1 : 0, inked: reduced,
      hl: 0, hlTo: 0, hlAt: 0, lit: false, squash: 0, stale: false, relight: false, dead: false, tr: "", wy: null, op: -1,
      softQ: SOFT_STEPS, flashA: null, ageTxt: "",
      th: makeThread(),
    };
    setStat(c, false);
    setAge(c);
    if (reduced) el.classList.add("is-in");
    else el.style.opacity = "0";

    el.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") setHover(c); });
    el.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && hovered === c) setHover(null); });
    el.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse") { setHover(c); hoverLock = T + 3.2; } });
    el.addEventListener("focus", () => setHover(c));
    el.addEventListener("blur", () => { if (hovered === c) setHover(null); });
    el.addEventListener("click", () => ping(c));
    cardRO.observe(el);
    list.appendChild(el);
    cards.set(id, c);
    return c;
  }

  function makeThread() {
    const F = () => new Float32Array(MAXN);
    const el = svgEl("path", { class: "hk-th" }, inkG);
    const lit = svgEl("path", { class: "hk-th-lit" }, litG);
    return { el, lit, n: 12, x: F(), y: F(), rx: F(), ry: F(), px: F(), py: F(), dx: F(), dy: F(), vx: F(), vy: F(), fresh: true, len: 300, dur: 0.6, litE: 0, pulses: [], shown: false, y0: 0, y1: 0 };
  }

  function setStat(c, animate = true) {
    const v = stats.value(c.hook);
    const txt = stats.format(c.hook, v), lab = stats.label(c.hook, v);
    c.odo.set(txt, animate && !reduced);
    if (c.unitEl.textContent !== lab) c.unitEl.textContent = lab;
    const sr = `${txt} ${lab}`;
    if (c.srEl.textContent !== sr) c.srEl.textContent = sr;
    c.stale = false;
  }
  function setAge(c) {
    const a = c.hook.planned ? "starts at launch" : ageText(Date.now() - c.m.born);
    if (a !== c.ageTxt) { c.ageTxt = a; c.ageEl.textContent = a; }
  }

  // ---------- layout ----------
  function order() { return jelly ? jelly.hooks : state.hooks.map((h) => h.id); }
  function ordered() {
    const ids = order();
    const live = [...cards.values()].filter((c) => c.state !== "dying");
    const at = (id) => { const i = ids.indexOf(id); return i < 0 ? 999 : i; };
    live.sort((a, b) => at(a.id) - at(b.id));
    live.forEach((c, i) => { c.order = i; });
    return live;
  }

  function placeJelly(B, bellTop, Wmax) {
    // mirrors createJelly's own fit, so the bell lands exactly where the composition wants it.
    // Never wider than the bleed (column plus both gutters): on a phone it reaches the screen edges and stops.
    const W = Math.min(B / 0.66, Wmax), H = W * 1.06;
    const k = Math.min((W * 0.66) / 556, (H * 0.92) / 810);
    const oy = Math.max(H * 0.06, (H - 810 * k) / 2) + 190 * k;
    const top = bellTop - (oy - 181 * k);
    Object.assign(jMount.style, { left: `${r1((Ws - W) / 2)}px`, top: `${r1(top)}px`, width: `${r1(W)}px`, height: `${r1(H)}px` });
    const anchorY = top + oy + 140 * k;
    J = { k, cx: Ws / 2, bellTop, anchorY, tipY: anchorY + 520 * REACH * k * 0.97, tipYmax: anchorY + 520 * REACH * k * 1.18 };
  }

  const lane = (k) => 6 + k * 4.6;     // room taken by k threads running down a margin

  function layout() {
    Ws = Math.round(stage.clientWidth);
    if (Ws < 60) return;
    const Wbleed = Math.max(Ws, Math.round(mount.clientWidth));
    const was = new Map();                  // where each capsule sat in the last layout
    for (const c of cards.values()) if (c.laid) was.set(c, c.slotTo.y);
    mode = Ws >= 940 ? "radial" : Ws >= 600 ? "two" : "one";
    const live = ordered(), n = live.length;
    const nL = Math.ceil(n / 2), nR = n - nL;
    let B;
    if (mode === "radial") { Wc = clamp(Math.round(Ws * 0.255), 262, 330); B = clamp((Ws - 2 * (Wc + 24)) * 0.8, 300, 430); }
    else if (mode === "two") { Wc = Math.floor((Ws - lane(nL) - lane(nR) - 16 - 12) / 2); B = clamp(Ws * 0.55, 300, 440); }
    else { Wc = Math.floor(Ws - lane(n) - 20); B = clamp(Ws * 0.74, 220, 330); }
    placeJelly(B, mode === "radial" ? 6 : 0, Wbleed);
    stage.dataset.mode = mode;

    for (const c of live) c.el.style.width = `${Wc}px`;
    for (const c of live) { c.w = c.el.offsetWidth; c.h = c.el.offsetHeight; }
    const tipX = (c) => J.cx + lerp(-215, 215, (c.order + 0.5) / Math.max(1, n)) * J.k * 1.12;

    let bottom = J.tipYmax + 40;
    const put = (c, x, y, dir, side, rank, laneX) => {
      c.slotTo = { x, y };
      c.laid = true;
      if (!c.slot) c.slot = { x, y };
      c.side = side; c.rank = rank; c.laneX = laneX;
      const key = `${c.w}|${c.h}|${dir.x.toFixed(2)}|${dir.y.toFixed(2)}`;
      if (key !== c.vkey) {
        c.vkey = key;
        const v = (c.ves = vesicle(c.w, c.h, c.seed, dir));
        c.svg.setAttribute("width", c.w); c.svg.setAttribute("height", c.h);
        c.glass.setAttribute("d", v.glass); c.clip.setAttribute("d", v.glass);
        c.rim.setAttribute("d", v.rim); c.glint.setAttribute("d", v.glint);
        c.shine.setAttribute("d", v.shine); c.knot.setAttribute("d", v.knot);
        c.kx = v.kx; c.ky = v.ky;
        c.el.style.transformOrigin = `${r1(v.kx)}px ${r1(v.ky)}px`;
      }
      bottom = Math.max(bottom, y + c.h);
      // a thread gets one node every ~30 px of its expected run
      const tx = tipX(c), ty = J.tipY;
      const run = mode === "radial" ? Math.hypot(x + c.kx - tx, y + c.ky - ty) * 1.2 : Math.abs(laneX - tx) + Math.abs(y + c.ky - ty) + 120;
      const nn = clamp(Math.round(run / 30), 8, MAXN);
      if (nn !== c.th.n) { c.th.n = nn; c.th.fresh = true; c.th.dx.fill(0); c.th.dy.fill(0); c.th.vx.fill(0); c.th.vy.fill(0); }
      c.th.len = run;
      c.th.dur = clamp(run / 560, 0.4, 1.4);
    };

    if (mode === "radial") {
      const L = live.slice(0, nL), R = live.slice(nL).reverse();
      const colH = (a) => a.reduce((s, c) => s + c.h, 0) + Math.max(0, a.length - 1) * GAP;
      const hMax = Math.max(colH(L), colH(R));
      const bellH = 353 * J.k;
      const top0 = Math.max(0, Math.min(J.bellTop + bellH * 0.34, J.tipY + 96 - hMax));
      const col = (arr, side, y0) => {
        let y = y0;
        arr.forEach((c, i) => {
          const f = Math.sin((Math.PI * (i + 0.5)) / arr.length);
          const jit = (hash01(c.id + "j") - 0.5) * 14;
          const inset = 24 - 22 * f + jit;
          const x = side < 0 ? inset : Ws - Wc - inset;
          const cx = x + c.w / 2, cy = y + c.h / 2;
          // the knot sits on the inner edge, a little toward the tip it hangs from
          const dy = clamp((J.tipY - cy) / 900, -0.3, 0.42);
          put(c, x, y, { x: -side, y: dy }, side, i, 0);
          y += c.h + GAP;
        });
      };
      col(L, -1, top0);
      col(R, 1, top0 + 44);
    } else {
      // narrow water: the threads gather into braids that run down a margin and peel off into each capsule.
      // A braid never crosses itself: the thread that peels off first runs innermost.
      const y0 = J.tipYmax + 84;
      if (mode === "two") {
        const Lg = live.slice(0, nL).reverse(), Rg = live.slice(nL).reverse();
        const xL = lane(nL) + 8, xR = Ws - Wc;
        const gut = xR - lane(nR) - 6;
        let y = y0;
        Lg.forEach((c, r) => { put(c, xL, y, { x: -1, y: -0.62 }, -1, r, 5 + (Lg.length - 1 - r) * 4.6); y += c.h + GAP; });
        y = y0 + 40;
        Rg.forEach((c, r) => { put(c, xR, y, { x: -1, y: -0.62 }, -1, r, gut + (Rg.length - 1 - r) * 4.6); y += c.h + GAP; });
      } else {
        const all = live.slice().reverse();
        const x0 = lane(n) + 6;
        let y = y0;
        all.forEach((c, r) => { put(c, x0, y, { x: -1, y: -0.6 }, -1, r, 4 + (all.length - 1 - r) * 4.6); y += c.h + GAP - 4; });
      }
    }
    Hs = Math.ceil(bottom + 28);

    // the highest point (stage px) this layout changes: a new slot, a capsule that moved, a removed one
    let yc = Infinity;
    for (const c of cards.values()) {
      const y0 = was.get(c);
      if (c.state === "dying") { if (y0 != null) { yc = Math.min(yc, y0); c.laid = false; } }
      else if (y0 == null) { if (c.laid) yc = Math.min(yc, c.slotTo.y); }
      else if (Math.abs(c.slotTo.y - y0) > 0.5) yc = Math.min(yc, y0, c.slotTo.y);
    }
    if (Hs !== shownH && shownH) yc = Math.min(yc, Math.min(Hs, shownH) - 28);
    const smooth = glideReq;
    glideReq = false;
    if (yc !== Infinity && stageBox().top + yc < 0) {
      // all of it happens above what the reader sees: pay the height back with the scroll and carry every
      // capsule below the change along, so nothing on screen moves (they still spring to any new offset)
      gliding = false; hV = 0; hY = Hs;
      const moved = applyHeight(Hs, true);
      if (moved) for (const c of cards.values()) {
        if (was.has(c) && c.state !== "dying" && c.slot && c.slotTo.y >= yc - 0.5) { c.slot.y += moved; c.th.fresh = true; }
      }
      return;
    }
    if (gliding) return;                     // already travelling: the spring just takes the new target
    if (smooth && !reduced && edgeSeen()) { gliding = true; hY = shownH; hV = 0; }
    else applyHeight(Hs);
  }

  // ---------- the stage height: the only thing here that moves the rest of the page ----------
  // Reader further down (my bottom edge above the viewport): pay every change back with an instant scroll
  // in the same frame, so what they are reading never moves. Cards animate transform, which suppresses the
  // browser's scroll anchoring, and Safari has none, so it is done by hand. Measuring the section's bottom
  // before and after also absorbs any adjustment the browser did make, so it is never paid twice.
  // Reader looking at my bottom edge: a hook growing or dropping glides the height on the capsules' spring,
  // so the water below travels with the last capsule instead of jumping.
  // returns how far the page was scrolled to pay for it (0 when nothing needed paying)
  // The paying branch is the one place that measures mid-frame, on purpose: it runs once per hook change while
  // the reader is below me, and only a fresh measurement can absorb whatever the browser itself adjusted.
  function applyHeight(h, pay = stageBox().bottom < 0) {
    const H = Math.round(h);
    if (H === shownH) return 0;
    const b0 = pay ? sec.getBoundingClientRect().bottom : 0;
    stage.style.height = `${H}px`;
    box.bottom += H - shownH;
    shownH = H;
    if (!pay) return 0;
    const d = sec.getBoundingClientRect().bottom - b0;
    if (Math.abs(d) < 0.5) return 0;
    const se = document.scrollingElement || document.documentElement;
    const y = se.scrollTop;
    scrollNow(d);
    const moved = se.scrollTop - y;
    box.top -= moved; box.bottom -= moved;
    return moved;
  }
  // the stage's client rect: this frame's read-phase measurement, or (off the per-frame path) a fresh one
  function stageBox() {
    if (box.fresh) return box;
    const r = stage.getBoundingClientRect();
    box.top = r.top; box.left = r.left; box.bottom = r.bottom; box.vh = innerHeight;
    return box;
  }
  function scrollNow(d) {
    // html has scroll-behavior: smooth; a smooth catch-up would show the very jump this hides
    try { window.scrollBy({ left: 0, top: d, behavior: "instant" }); }
    catch {
      const s = document.documentElement.style, was = s.scrollBehavior;
      s.scrollBehavior = "auto"; window.scrollBy(0, d); s.scrollBehavior = was;
    }
  }
  function edgeSeen() {
    // is the water just under my stage on screen, before or after the change?
    const r = stageBox();
    if (r.bottom < 0 || r.top > r.vh) return false;
    return Math.min(r.bottom, r.top + Hs) < r.vh;
  }
  function stepHeight(dt) {
    // the capsule slot spring (k 26, d 7.2), so my bottom edge and the last capsule land together
    hV += ((Hs - hY) * 26 - hV * 7.2) * dt;
    hY += hV * dt;
    if (Math.abs(Hs - hY) < 0.5 && Math.abs(hV) < 4) { hY = Hs; hV = 0; gliding = false; }
    applyHeight(hY);
  }

  // ---------- hover, pulses ----------
  function setHover(c) {
    if (c === hovered) return;
    if (hovered) {
      hovered.hlTo = 0; hovered.lit = false;
      hovered.el.classList.remove("is-hover", "is-lit");
      bus.emit("hook:hover:end", { id: hovered.id });
    }
    hovered = c && c.state !== "dying" ? c : null;
    if (hovered) {
      hovered.hlTo = 1; hovered.hlAt = T;
      hovered.el.classList.add("is-hover");
      jelly?.highlight(hovered.id);
      const r = hovered.el.getBoundingClientRect();
      jelly?.lookAt(r.left + r.width / 2, r.top + r.height * 0.4, 2.8);
      bus.emit("hook:hover", { id: hovered.id });
    } else jelly?.highlight(null);
  }

  function sendPulse(c) {
    if (!c || c.state !== "live") return false;
    // nobody is watching (or nothing moves): the number just becomes true, without a show. Queuing pulses
    // while off screen would pile them up and fire them all at once, ticking, when the reader came back.
    if (reduced || !visible) { deliver(c, false, visible); return true; }
    jelly?.pulse(c.id);
    if (c.th.pulses.length < 4) c.th.pulses.push({ t0: T + 0.98, u: -1, done: false });
    return true;
  }
  function deliver(c, show = true, tick = show) {
    setStat(c, show);
    if (c.relight) { c.relight = false; c.el.classList.remove("is-dim"); }
    if (tick) bus.emit("sfx", { name: "tick" });
    if (!show) return;
    c.squash = 1;
    c.offV.y += 26;
    // the glint flares; WAAPI restarts it without the forced reflow a class toggle needs
    if (c.glint.animate) {
      c.flashA?.cancel();
      const b = c === hovered ? 1.12 : 1;
      c.flashA = c.glint.animate(
        [{ transform: `scale(${b})` }, { transform: `scale(${(b * 1.35).toFixed(3)})`, offset: 0.22 }, { transform: `scale(${b})` }],
        { duration: 900, easing: FLASH_EASE });
    }
  }
  function ping(c) {
    if (c.state !== "live") return;
    jelly?.beat(0.8, 1.2);
    const r = c.el.getBoundingClientRect();
    bus.emit("ripple", { x: r.left + c.kx, y: r.top + c.ky, strength: 0.35 });
    sendPulse(c);
  }

  // ---------- add / remove ----------
  function grow(hook, info = {}) {
    let c = cards.get(hook.id);
    // the first brain landed and grew a tentacle that was waiting: the same card, now real
    if (c && c.state !== "dying" && c.hook.planned && !hook.planned) {
      c.hook = hook;
      c.m = stats.track(hook, info.version, info.at);
      c.el.classList.remove("is-planned");
      const seal = c.el.querySelector(".hk-seal");
      seal.hidden = false;
      seal.querySelector(".hk-seal__v").textContent = `v${c.m.v}`;
      seal.setAttribute("title", `Grew in brain v${c.m.v}`);
      setAge(c);
      setStat(c);
      return c;
    }
    if (c && c.state !== "dying") return c;
    if (c) bury(c);
    c = makeCard(hook, info);
    // after the first entrance a capsule is only blown once its slot is on screen (see frame): a reader who
    // was further down when it grew still gets to watch it arrive when they come back up
    if (!reduced) { c.state = "born"; c.t0 = null; c.late = entered; c.bornAt = T; c.wait = info.wait ?? 1.3; }
    needLayout = true; glideReq = true;
    return c;
  }
  function drop(id) {
    const c = cards.get(id);
    if (!c || c.state === "dying") return;
    if (hovered === c) setHover(null);
    glideReq = true;
    if (reduced || c.state === "born" && c.t0 == null) { bury(c); needLayout = true; return; }
    c.state = "dying"; c.t0 = T;
    c.el.classList.add("is-dying");
    c.el.setAttribute("aria-hidden", "true");
    c.el.tabIndex = -1;
    bus.emit("sfx", { name: "splat" });
    needLayout = true;
  }
  function bury(c) {
    cardRO.unobserve(c.el);
    c.el.remove(); c.th.el.remove(); c.th.lit.remove();
    if (cards.get(c.id) === c) cards.delete(c.id);
    stats.forget(c.id);
  }
  function sync(list) {
    const ids = new Set(list.map((h) => h.id));
    for (const c of [...cards.values()]) if (!ids.has(c.id) && c.state !== "dying") drop(c.id);
    for (const h of list) if (!cards.has(h.id) || cards.get(h.id).state === "dying") grow(h, { wait: 1.3 });
  }

  function startEntrance() {
    if (entered) return;
    entered = true;
    ordered().forEach((c, i) => { if (c.state === "born") { c.t0 = T; c.wait = 0.2 + i * 0.12; } });
  }

  // ---------- the frame ----------
  function spring(p, v, tx, ty, dt, k, d) {
    v.x += ((tx - p.x) * k - v.x * d) * dt; v.y += ((ty - p.y) * k - v.y * d) * dt;
    p.x += v.x * dt; p.y += v.y * dt;
  }

  // vTop / vBot: the viewport in stage px (from the read phase)
  function stepCard(c, dt, vTop, vBot) {
    const q = tipsRead.get(c.id);
    let tip = null;
    if (q) {
      // carried forward by the jelly's last step: the tip it is drawing this frame
      tip = c.tip;
      tip.x = q.x + q.dx * stepK; tip.y = q.y + q.dy * stepK;
      c.hasTip = true;
      if (!c.tipAvg) c.tipAvg = { x: tip.x, y: tip.y };
      else { const f = ease(dt, 1.8); c.tipAvg.x += (tip.x - c.tipAvg.x) * f; c.tipAvg.y += (tip.y - c.tipAvg.y) * f; }
    }
    if (!c.slot) return;
    if (reduced) { c.slot.x = c.slotTo.x; c.slot.y = c.slotTo.y; }
    else spring(c.slot, c.slotV, c.slotTo.x, c.slotTo.y, dt, 26, 7.2);

    // the tentacle tugs its capsule; the capsule bobs on its own slow breath
    let gx = 0, gy = 0, bob = 0;
    if (!reduced) {
      if (tip && c.tipAvg) { gx = (tip.x - c.tipAvg.x) * 0.16; gy = (tip.y - c.tipAvg.y) * 0.1; }
      bob = Math.sin(T * c.bw + c.seed * 9) * 2.8 + Math.sin(T * c.bw * 2.3 + c.seed * 4) * 0.8 - c.hl * 5 + slack * 7;
      spring(c.off, c.offV, gx, gy + bob, dt, 20, 6.2);
    }
    let rot = reduced ? c.rot0 : c.rot0 * (1 - 0.8 * c.hl) + clamp(c.offV.x * 0.05, -3, 3) + Math.sin(T * c.bw * 0.8 + c.seed * 5) * 0.5;
    c.squash += (0 - c.squash) * ease(dt, 0.22);
    let s = 1 + 0.028 * c.squash * Math.sin(T * 30) + 0.012 * c.hl, op = 1, sinkY = 0;

    if (c.state === "born") {
      if (c.t0 == null || T < c.t0 + c.wait) {
        if (c.op !== 0) { c.op = 0; c.el.style.opacity = "0"; }
        c.shoot = 0;
        hideThread(c);
        return;
      }
      const tb = T - c.t0 - c.wait;
      c.shoot = easeOutCubic(tb / 0.6);
      const ti = (tb - 0.4) / 0.85;
      s *= 0.16 + 0.84 * easeOutBack(ti, 1.9);
      op = smoothstep(ti * 3.2);
      if (ti > 0 && !c.inked) {
        c.inked = true;
        // the glass is blown wet and pale and dries to my water colour; the words write themselves in ink
        c.el.classList.add("is-in", "is-wet");
        setTimeout(() => c.el.classList.remove("is-wet"), 1300);
        bus.emit("ripple", { x: box.left + c.slot.x + c.kx, y: box.top + c.slot.y + c.ky, strength: 0.3 });
        bus.emit("sfx", { name: "bubble" });
      }
      if (ti >= 1.3) c.state = "live";
    } else if (c.state === "dying") {
      const td = T - c.t0;
      const lv = easeInOutCubic(td / 1.05);
      if (c.ves && td < 1.2) {
        const top = lerp(c.h + 12, (c.ves.top || 0) - 14, lv);
        let d = `M-20 ${c.h + 30}`;
        for (let x = -20; x <= c.w + 20; x += 12) d += `L${x} ${r1(top + 5 * Math.sin(x * 0.045 + T * 4.2) * (1 - lv * 0.6))}`;
        c.flood.setAttribute("d", `${d}L${c.w + 20} ${c.h + 30}Z`);
      }
      const u = clamp((td - 0.55) / 2.4);
      sinkY = 640 * easeInCubic(u);
      // it tips over as it sinks, about the knot. On narrow water a big tilt would swing the far corner past the
      // screen edge, so there it only leans a little, toward the braid it hung from.
      rot += c.side * (mode === "radial" ? 26 : 9) * easeInCubic(u);
      s *= 1 - 0.12 * u;
      op = 1 - smoothstep((td - 1.6) / 1.4);
      if (td > 3.1) { c.dead = true; return; }
    }

    const x = c.slot.x + c.off.x, y = c.slot.y + c.off.y + sinkY;
    // Only what can be seen is written. A capsule well off screen keeps its last transform, which is fine as long
    // as that one is off screen too: so it is written when it never was, or when either where it is going or
    // where it was last drawn is near the viewport.
    const near = (yy) => yy + c.h + 140 > vTop && yy - 140 < vBot;
    const onScreen = near(y);
    if (c.wy == null || onScreen || near(c.wy)) {
      const tr = `translate3d(${r1(x)}px,${r1(y)}px,0) rotate(${rot.toFixed(2)}deg) scale(${s.toFixed(3)})`;
      if (tr !== c.tr) { c.tr = tr; c.el.style.transform = tr; c.wy = y; }
    }
    const o = Math.round(op * 1000) / 1000;
    if (o !== c.op) { c.op = o; c.el.style.opacity = String(o); }

    // the name breathes on SOFT, in quantised steps, and at most one name per frame changes
    if (onScreen && breath > 0 && c.state === "live" && !reduced) {
      const sq = Math.round((0.5 + 0.5 * Math.cos((T / 7.4 + c.seed) * TAU)) * SOFT_STEPS);
      if (sq !== c.softQ) { breath--; c.softQ = sq; c.nameEl.style.fontVariationSettings = SOFT_V[sq]; }
    }

    // light flows down the tentacle (the jelly draws it), then along my thread into the glass
    c.hl += (c.hlTo - c.hl) * ease(dt, 0.2);
    const th = c.th;
    if (c.hlTo > 0) { if (T - c.hlAt > 0.3) th.litE = Math.min(1, th.litE + dt * (2.6 / Math.max(0.5, th.dur))); }
    else th.litE = Math.max(0, th.litE - dt * 3.5);
    if (th.litE >= 1 && c.hlTo > 0 && !c.lit) { c.lit = true; c.el.classList.add("is-lit"); }

    advancePulses(c);
    // transform-origin sits on the knot, so the knot never moves with rotation or scale
    const S = tip || (c.hasTip ? c.tip : null);
    if (!S) return hideThread(c);
    const Kx = x + c.kx, Ky = y + c.ky;
    const reach = 130 + 0.3 * Math.abs(Kx - S.x), th2 = c.th;
    const routeNear = Math.max(S.y, Ky) + reach > vTop && Math.min(S.y, Ky) - reach < vBot;
    const drawnNear = th2.shown && th2.y1 > vTop && th2.y0 < vBot;
    if (routeNear || drawnNear) drawThread(c, tip, S, Kx, Ky, dt);
    else { hideThread(c); th2.fresh = true; }   // off screen it is put away, and re-forms from its route on return
  }

  function hideThread(c) {
    if (c.th.shown !== false) { c.th.shown = false; setAttr(c.th.el, "d", ""); setAttr(c.th.lit, "d", ""); }
  }

  function advancePulses(c) {
    const th = c.th;
    for (let k = th.pulses.length - 1; k >= 0; k--) {
      const p = th.pulses[k];
      p.u = (T - p.t0) / th.dur;
      if (p.u >= 1 && !p.done) { p.done = true; deliver(c); }
      if (p.u > 1.25) th.pulses.splice(k, 1);
    }
  }
  // the section left the screen: whatever was still travelling arrives quietly
  function settlePulses() {
    for (const c of cards.values()) {
      const th = c.th;
      if (!th.pulses.length) continue;
      if (th.pulses.some((p) => !p.done)) deliver(c, false, false);
      th.pulses.length = 0;
    }
  }

  function drawThread(c, tip, S, Kx, Ky, dt) {
    const th = c.th;
    th.shown = true;
    // the rest route: leave the tip hanging down, sag on the way, arrive along the knot's normal
    let np = 0;
    const put = (x, y) => { PX[np] = x; PY[np] = y; np++; };
    const dx = Kx - S.x, dy = Ky - S.y, D = Math.hypot(dx, dy) || 1;
    const nx = c.ves?.nx ?? 0, ny = c.ves?.ny ?? -1;
    if (mode === "radial") {
      const sag = D * (0.08 + 0.18 * slack) + (c.state === "dying" ? 40 : 0);
      const app = Math.min(48, D * 0.18);
      put(S.x, S.y);
      put(S.x + dx * 0.04, S.y + Math.min(30, D * 0.1));
      put(S.x + dx * 0.5, S.y + dy * 0.5 + sag);
      put(Kx + nx * app, Ky + ny * app);
      put(Kx, Ky);
    } else {
      // hang straight down from the tip for a while, drift into the braid, run down it, peel off into the knot
      const sway = reduced ? 0 : Math.sin(T * 0.55 + c.seed * 7) * 2.2;
      const lx = c.laneX + sway * (1 + slack * 2);
      const drop = Math.max(60, Ky - S.y);
      const y1 = S.y + Math.min(70, drop * 0.3), y2 = S.y + Math.min(150 + c.rank * 6, drop * 0.58);
      put(S.x, S.y);
      put(S.x + (lx - S.x) * 0.06, y1);
      put(lerp(S.x, lx, 0.75), y2);
      if (Ky - 64 > y2 + 40) put(lx, Ky - 64);
      put(Kx + nx * 20, Ky + ny * 20);
      put(Kx, Ky);
    }
    const m = catmull(PX, PY, np, 10, RB);
    arcLen(RB, m, RC);
    const n = th.n;
    sampleEven(RB, m, RC, n, th.rx, th.ry);

    // lag + spring per node (secondary motion), and a slow wave travelling down the thread
    const wave = reduced ? 0 : 2.4 + 4 * slack;
    for (let i = 0; i < n; i++) {
      if (th.fresh) { th.px[i] = th.rx[i]; th.py[i] = th.ry[i]; }
      if (i === 0 || i === n - 1) { th.x[i] = th.rx[i]; th.y[i] = th.ry[i]; th.px[i] = th.rx[i]; th.py[i] = th.ry[i]; continue; }
      const u = i / (n - 1), lag = Math.sin(Math.PI * u);
      if (!reduced) {
        th.dx[i] -= (th.rx[i] - th.px[i]) * 0.82 * lag;
        th.dy[i] -= (th.ry[i] - th.py[i]) * 0.82 * lag;
        th.vx[i] += (-52 * th.dx[i] - 6.5 * th.vx[i]) * dt;
        th.vy[i] += (-52 * th.dy[i] - 6.5 * th.vy[i]) * dt;
        th.dx[i] = clamp(th.dx[i] + th.vx[i] * dt, -70, 70);
        th.dy[i] = clamp(th.dy[i] + th.vy[i] * dt, -70, 70);
      }
      th.px[i] = th.rx[i]; th.py[i] = th.ry[i];
      const ax = th.rx[i + 1] - th.rx[i - 1], ay = th.ry[i + 1] - th.ry[i - 1], al = Math.hypot(ax, ay) || 1;
      const w = wave * lag * Math.sin(T * 1.35 - u * 6.5 + c.seed * 11);
      th.x[i] = th.rx[i] + th.dx[i] - (ay / al) * w;
      th.y[i] = th.ry[i] + th.dy[i] + (ax / al) * w;
    }
    th.fresh = false;
    // the vertical extent of what is about to be drawn (so it can be put away once it is off screen)
    let ylo = Infinity, yhi = -Infinity;
    for (let i = 0; i < n; i++) { const yy = th.y[i]; if (yy < ylo) ylo = yy; if (yy > yhi) yhi = yy; }
    th.y0 = ylo - 14; th.y1 = yhi + 14;

    const mm = catmull(th.x, th.y, n, SUB, CB);
    arcLen(CB, mm, CC);
    const tipHW = Math.max(1.6, 2.9 * J.k);
    const thick = 1 + 0.85 * c.hl;
    for (let i = 0; i < mm; i++) {
      const u = CC[i];
      let w = lerp(tipHW, 1.05, smoothstep(u / 0.28)) + 0.75 * smoothstep((u - 0.8) / 0.2);
      w *= thick * (1 + 0.1 * Math.sin(u * 21 + c.seed * 9));
      for (const p of th.pulses) if (p.u > -0.1 && p.u < 1.15) w += 1.7 * Math.exp(-(((u - p.u) / 0.045) ** 2));
      HW[i] = w;
    }
    let d = "";
    if (c.state === "dying") {
      // snapped near the tip: the short end curls back, the long end falls with the glass
      const e = easeOutCubic((T - c.t0) / 0.7);
      const a1 = idxAt(0.3 * (1 - e), mm), b0 = idxAt(0.3 + 0.5 * e, mm);
      if (a1 > 1 && tip) d += ribbon(CB, mm, HW, 0, a1);
      if (b0 < mm - 2) d += ribbon(CB, mm, HW, b0, mm - 1);
    } else if (c.state === "born") {
      const i1 = Math.max(1, Math.round((mm - 1) * c.shoot));
      d = ribbon(CB, mm, HW, 0, i1);
    } else d = ribbon(CB, mm, HW);
    setAttr(th.el, "d", d);

    // cream: the light of a hover, and the bright head of each pulse
    let lit = "";
    if (th.litE > 0.01 && c.state !== "dying") {
      const i1 = idxAt(th.litE, mm);
      for (let i = 0; i <= i1; i++) HL[i] = Math.max(0.35, HW[i] * 0.56 * (1 - smoothstep((CC[i] - th.litE + 0.08) / 0.08) * 0.6));
      if (i1 > 1) lit += ribbon(CB, mm, HL, 0, i1);
    }
    for (const p of th.pulses) {
      if (p.u <= 0 || p.u > 1.12) continue;
      const head = Math.min(1, p.u), tail = Math.max(0, p.u - 0.2);
      const i0 = idxAt(tail, mm), i1 = idxAt(head, mm);
      if (i1 - i0 < 1) continue;
      for (let i = i0; i <= i1; i++) {
        const v = (CC[i] - tail) / Math.max(1e-3, head - tail);
        HL[i] = Math.max(0.3, HW[i] * 0.6 * Math.sin(Math.PI * clamp(v * 0.9 + 0.08)));
      }
      lit += ribbon(CB, mm, HL, i0, i1);
    }
    setAttr(th.lit, "d", lit);
  }

  // read phase: the only per-frame layout reads, taken before anything on the page has written this frame
  function measure(t, dt) {
    const n = ++readN;
    box.fresh = false;
    if (!visible && !gliding && !needLayout) return;      // off screen: idle
    const r = stage.getBoundingClientRect();
    box.top = r.top; box.left = r.left; box.bottom = r.bottom; box.vh = innerHeight; box.fresh = true;
    if (!visible || !jelly) return;
    for (const p of jelly.tipPositions()) {
      const x = p.x - r.left, y = p.y - r.top;
      const q = tipsRead.get(p.id);
      if (!q) { tipsRead.set(p.id, { x, y, dx: 0, dy: 0, n }); continue; }
      const dx = x - q.x, dy = y - q.y;
      // a step is only trusted from the frame right before, and never a jump (a re-layout, a re-anchor)
      const ok = q.n === n - 1 && dx * dx + dy * dy < 900;
      q.dx = ok ? dx : 0; q.dy = ok ? dy : 0;
      q.x = x; q.y = y; q.n = n;
    }
    for (const [id, q] of tipsRead) if (q.n !== n) tipsRead.delete(id);
    stepK = clamp(dt / readDt, 0, 2);       // this frame's step, against the one the tips last took
    readDt = dt;
  }

  // write phase
  function frame(t, dt) {
    T += dt;
    if (needLayout) { needLayout = false; layout(); }
    if (gliding) {
      if (visible) stepHeight(dt);
      else { gliding = false; hY = Hs; hV = 0; applyHeight(Hs); }
    }
    slack += (slackTo - slack) * ease(dt, slackTo > slack ? 0.8 : 0.5);
    if (!visible || !jelly || !box.fresh) return;
    if (hoverLock && T > hoverLock) { hoverLock = 0; if (hovered) setHover(null); }
    const vTop = -box.top, vBot = box.vh - box.top;      // the viewport, in stage px
    for (const c of cards.values()) {
      if (c.state !== "born" || c.t0 != null || !c.late || !c.slot) continue;
      const y = c.slotTo.y;
      if (y < vBot - 40 && y + c.h > vTop + 40) {
        c.t0 = T; c.late = false;
        if (T - c.bornAt > 2) c.wait = 0.35;   // its tentacle grew long ago; just blow the glass
      }
    }
    breath = 1;
    for (const c of cards.values()) stepCard(c, dt, vTop, vBot);
    for (const c of cards.values()) if (c.dead) bury(c);
  }

  // ---------- boot ----------
  const cardRO = new ResizeObserver((es) => {
    for (const e of es) {
      const c = cards.get(e.target.dataset.id);
      if (c && (Math.abs(e.target.offsetHeight - c.h) > 1 || Math.abs(e.target.offsetWidth - c.w) > 1)) needLayout = true;
    }
  });
  for (const h of state.hooks) makeCard(h);
  layout();
  jelly = createJelly(jMount, { ctx, hooks: state.hooks, follow: true, labels: false, sleepy: true, reach: REACH });
  jelly.root.classList.add("hk-jelly__body");
  needLayout = true;

  new ResizeObserver(() => { if (Math.round(stage.clientWidth) !== Ws) needLayout = true; }).observe(mount);
  new IntersectionObserver((es) => {
    visible = es[es.length - 1].isIntersecting;
    if (!visible) settlePulses();
  }, { rootMargin: "200px 0px" }).observe(stage);
  new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) startEntrance(); }, { threshold: 0.18 }).observe(stage);
  // registered after createJelly, so a read phase of the jelly's own (if it has one) has run when mine asks it
  // for its tips; and the jelly's write-phase step runs before frame(), which carries the tips forward to it
  (loop.read || loop.add)(measure);
  loop.add(frame);
  setInterval(() => {
    if (!visible) return;
    for (const c of cards.values()) setAge(c);
  }, 20000);

  // ---------- the live feed ----------
  bus.on("hooks:set", (l) => { if (!Array.isArray(l)) return; jelly.setHooks(l); sync(l); });
  bus.on("hook:add", (e) => {
    if (!e?.hook) return;
    stats.onShip(e.hook.id);
    jelly.addHook(e.hook);
    grow(e.hook, { version: e.version, at: e.hook.since, wait: 1.3 });
    const b = cards.get("bounty");
    if (b && b.state === "live") setTimeout(() => sendPulse(b), 3800);
  });
  bus.on("hook:remove", (e) => { if (!e?.id) return; jelly.removeHook(e.id); drop(e.id); });
  bus.on("thought", (t) => jelly.think(t));
  bus.on("journal:add", () => { const c = cards.get("memo"); if (c) setTimeout(() => sendPulse(c), 1600); });
  bus.on("brain:swap:start", (p) => {
    jelly.swap("start", p || {});
    slackTo = 1;
    if (hovered) setHover(null);
    for (const c of cards.values()) c.el.classList.add("is-dim");
  });
  bus.on("brain:swap:mid", (p) => jelly.swap("mid", p || {}));
  bus.on("brain:swap:done", (p) => {
    jelly.swap("done", p || {});
    slackTo = 0;
    // the new brain reaches into every function, one tentacle after another
    ordered().forEach((c, i) => setTimeout(() => {
      if (c.state === "live" && !reduced) { c.relight = true; sendPulse(c); } else c.el.classList.remove("is-dim");
    }, 700 + i * 150));
    setTimeout(() => { for (const c of cards.values()) c.el.classList.remove("is-dim"); }, 6000);
  });
  bus.on("vault", (v) => {
    jelly.beat(0.55 + Math.min(0.4, (v?.lastFee ?? 0.01) * 12), 1.05);
    const liveIds = [...cards.values()].filter((c) => c.state === "live").map((c) => c.id);
    const moved = stats.onVault(v, liveIds);
    for (const id of moved) { const c = cards.get(id); if (c) c.stale = true; }
    if (reduced) { for (const id of moved) { const c = cards.get(id); if (c) setStat(c, false); } return; }
    if (T - lastPulse < 1.3) return;
    let pick = moved.includes("burn") && cards.get("burn")?.stale ? cards.get("burn") : null;
    if (!pick) {
      const stale = [...cards.values()].filter((c) => c.stale && c.state === "live");
      if (stale.length) pick = stale[rr++ % stale.length];
    }
    if (pick && sendPulse(pick)) lastPulse = T;
  });

  // test flags for headless screenshots: ?hookstest=add,drop,hover,swap,ping&ht=ms
  const tests = (ctx.params.get("hookstest") || "").split(",").filter(Boolean);
  if (tests.length) {
    const delay = Number(ctx.params.get("ht") || 600);
    bus.once("ready", () => setTimeout(() => {
      const { HOOKS } = ctx.content;
      for (const t of tests) {
        if (t === "add") {
          const id = Object.keys(HOOKS).find((h) => !cards.has(h));
          if (id) { const h = { id, ...HOOKS[id], since: Date.now() }; state.hooks.push(h); bus.emit("hook:add", { hook: h, version: state.version + 1 }); }
        }
        if (t === "drop") { const id = ordered()[1]?.id; if (id) { state.hooks = state.hooks.filter((h) => h.id !== id); bus.emit("hook:remove", { id, version: state.version + 1 }); } }
        if (t === "hover") setHover(ordered()[0]);
        if (t === "swap") ctx.sim.swapNow();
        if (t === "ping") ordered().forEach((c, i) => setTimeout(() => ping(c), i * 220));
      }
    }, delay));
  }
}
