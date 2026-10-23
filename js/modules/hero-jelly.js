// hero-jelly: Turri himself. A living ink jellyfish with a glass bell, a brain that rewires on every thought,
// eyes that watch you, and one verlet tentacle per live hook. createJelly() is reused by hooks, swap and friends.
import { Streamer } from "./hero-jelly/streamer.js";
import { createBrain } from "./hero-jelly/brain.js";
import {
  clamp, lerp, smoothstep, easeOutCubic, easeInCubic, easeInOutCubic, easeOutBack, ease, r1, rand, hash01,
  parsePts, svgEl, ringPath,
} from "./hero-jelly/util.js";
import { setAttr } from "../core/dom.js";

const BELL_TOP = -181, BELL_HEM = 172, PIVOT_Y = -40, CY = -10, ANCHOR_Y = 140, CRACK_Y = -112;
let UID = 0;

// Calm rhythm 2.8 s; contraction ~300 ms, elastic relaxation ~900 ms with an overshoot.
function envelope(t, fast) {
  const tc = 0.3 / fast, tr = 0.9 / Math.sqrt(fast);
  if (t < tc) return easeOutCubic(t / tc);
  const u = (t - tc) / tr;
  if (u >= 1) return 0;
  return Math.cos(Math.PI * 1.5 * u) * Math.exp(-2.6 * u);
}

export function createJelly(mount, { ctx, hooks = ctx.state.hooks, follow = true, labels = false, scale = 1, sleepy = true, read = null, reach = 1 } = {}) {
  const J = ctx.assets.jelly, ink = ctx.ink, bus = ctx.bus, pointer = ctx.pointer;
  const reduced = !!ctx.reduced;
  const uid = `hj${++UID}`;
  const nodes = ctx.mobile ? 12 : 14;
  const OUT = parsePts(J.bell.d), IN = parsePts(J.bell.inner), GL = parsePts(J.bell.glint);
  const [HEM_X0, HEM_X1] = J.bell.hemX;

  // ---------- DOM ----------
  if (getComputedStyle(mount).position === "static") mount.style.position = "relative";
  const root = document.createElement("div");
  root.className = "hj";
  const svg = svgEl("svg", { class: "hj-svg", "aria-hidden": "true", focusable: "false" });
  root.appendChild(svg);
  const defs = svgEl("defs", {}, svg);
  const world = svgEl("g", { class: "hj-world" }, svg);
  const tentG = svgEl("g", { class: "hj-tents" }, world);
  const body = svgEl("g", { class: "hj-body" }, world);
  const glassLo = svgEl("path", { class: "hj-glass" }, body);
  const capG = svgEl("g", { class: "hj-cap", display: "none" }, body);
  const capGlass = svgEl("path", { class: "hj-glass" }, capG);
  const capRim = svgEl("path", { class: "hj-ink", "fill-rule": "evenodd" }, capG);
  const capGlint = svgEl("path", { class: "hj-cream" }, capG);
  const brainsG = svgEl("g", { class: "hj-brains" }, body);
  const rimLo = svgEl("path", { class: "hj-ink", "fill-rule": "evenodd" }, body);
  const glintLo = svgEl("path", { class: "hj-cream" }, body);
  const crackEl = svgEl("path", { class: "hj-cream", opacity: "0" }, body);
  const fxG = svgEl("g", { class: "hj-fx" }, world);
  const overG = svgEl("g", { class: "hj-over" }, svg);

  // the crack the glass opens along during a brain swap
  const crack = [];
  for (let x = -330; x <= 330; x += 15) crack.push(ink.P(x, CRACK_Y + 7 * Math.sin(x * 0.031 + 0.6) + 4 * Math.sin(x * 0.093 + 2.1) + ((x / 15) % 2 ? 2.5 : -2.5)));
  const crackLine = crack.map((p) => `${p.x} ${p.y.toFixed(1)}`).join(" L ");
  const cutLo = svgEl("clipPath", { id: `${uid}-lo`, clipPathUnits: "userSpaceOnUse" }, defs);
  svgEl("path", { d: `M ${crackLine} L 330 700 L -330 700 Z` }, cutLo);
  const cutHi = svgEl("clipPath", { id: `${uid}-hi`, clipPathUnits: "userSpaceOnUse" }, defs);
  svgEl("path", { d: `M ${crackLine} L 330 -700 L -330 -700 Z` }, cutHi);
  capG.setAttribute("clip-path", `url(#${uid}-hi)`);
  let cx0 = 0, cx1 = 0;
  for (let i = 0; i < OUT.length; i += 2) {
    const j = (i + 2) % OUT.length, y0 = OUT[i + 1], y1 = OUT[j + 1];
    if ((y0 - CRACK_Y) * (y1 - CRACK_Y) <= 0 && y0 !== y1) {
      const x = OUT[i] + ((CRACK_Y - y0) / (y1 - y0)) * (OUT[j] - OUT[i]);
      cx0 = Math.min(cx0, x); cx1 = Math.max(cx1, x);
    }
  }
  const crackVis = crack.filter((p) => p.x > cx0 + 2 && p.x < cx1 - 2);
  const crackD = ink.brush(ink.spline(crackVis, false, 4), (t) => 2.5 + 6 * Math.sin(Math.PI * t));
  crackEl.setAttribute("d", crackD);

  // hover label (an ink blot with cream mono text), tied to the tentacle by a tapered ink line
  let label = null;
  if (labels) {
    label = document.createElement("div");
    label.className = "hj-label";
    label.setAttribute("aria-hidden", "true");
    label.innerHTML = '<svg class="hj-label__blot" aria-hidden="true"><path class="hj-ink"/></svg><div class="hj-label__txt"><span class="hj-label__name"></span><span class="hj-label__rule"></span></div>';
    root.appendChild(label);
  }
  const tie = svgEl("path", { class: "hj-ink" }, overG);
  mount.appendChild(root);

  // ---------- state ----------
  let W = 0, H = 0, k = 1, ox = 0, oy = 0, visible = true, destroyed = false;
  let T = 0;
  let C = 0, beatT = 9, beatS = 0, beatFast = 1, carry = 0, nextCalm = 0.6 + Math.random();
  let swimY = 0, swimV = 0, prevSwimV = 0, bodyX = 0, bodyVX = 0, tilt = 0, flipT = -1, sinkY = 0;
  let bx = 0, by = 0, rot = 0;
  let wave = 1, waveTo = 1;
  let lastPX = pointer.x, lastPY = pointer.y, lastMoveT = -99;
  let glance = null, dart = null, surprise = 0, surpriseHold = 0, dilate = 0;
  let blinkT = -1, nextBlink = 0.5, blinkAgain = -1;
  let lastActive = performance.now(), asleep = false, forceSleep = false, sleepAmt = 0, wakeBlink = false, nextBubble = 0;
  const bubbles = [];
  let lean = { x: 0, y: 0, r: 0 }, lag = { y: 0, v: 0 }, bc = { x: 0, v: 0 };
  let sw = null;
  let hovered = null, hoverLock = 0, highlighted = null, hoverSeen = 0;
  let readCache = null, readStep = 0, readNext = 0;
  let linkCache = { el: null, x: 0, y: 0, sy: -1 };
  let scrollPrev = scrollY, scrollV = 0;
  let worldInv = null, worldM = null;
  // Layout reads happen in the loop's read phase, before any module writes in the frame, so they never force a
  // layout of their own. The frame then uses these values; the eyes rebuild their matrices from known transforms.
  const scrollState = ctx.scroll;
  let readFrame = 0, frameNo = 0, readRect = null, readRectFrame = -1, rootRect = null, rootRectFrame = -1;
  let bodyT = { x: 0, y: 0, r: 0 }, bodyM = null, worldDM = null;

  let brain = createBrain(J, ink, brainsG, defs, uid, (ctx.state.version || 0) % J.brain.grooves.length);

  // ---------- tentacles ----------
  const streamers = [];
  const conf = J.streamers;
  function makeStreamer(hook, grown) {
    const s = new Streamer(hook, { nodes, length: conf.length * reach, w0: conf.w0, w1: conf.w1, grown, x: 0, y: ANCHOR_Y });
    const g = svgEl("g", { class: "hj-tent" });
    s.el = svgEl("path", { class: "hj-ink" }, g);
    s.core = svgEl("path", { class: "hj-cream" }, g);
    s.g = g;
    return s;
  }
  function layoutAnchors(snap) {
    const live = streamers.filter((s) => s.attached);
    const n = live.length;
    live.forEach((s, i) => {
      const f = n === 1 ? 0.5 : (i + 0.5) / n;
      s.axTo = lerp(HEM_X0, HEM_X1, f) + (hash01(s.id + "x") - 0.5) * (n > 6 ? 8 : 16);
      if (snap) s.ax = s.axTo;
    });
    // paint order: centre tentacles in front of outer ones
    [...streamers].sort((a, b) => Math.abs(b.ax) - Math.abs(a.ax)).forEach((s) => tentG.appendChild(s.g));
  }
  function addHook(hook, { grown = false } = {}) {
    if (!hook?.id || streamers.some((s) => s.id === hook.id && s.attached)) return;
    const s = makeStreamer(hook, grown || reduced);
    const live = streamers.filter((x) => x.attached);
    const at = grown ? live.length : Math.floor(live.length / 2);
    const idx = at < live.length ? streamers.indexOf(live[at]) : streamers.length;
    streamers.splice(idx, 0, s);
    layoutAnchors(grown);
    if (!grown) {
      // start the new one at its slot so it unfurls from the hem
      const p = anchorWorld(s.axTo);
      s.ax = s.axTo;
      for (let i = 0; i < s.n; i++) { s.x[i] = s.px[i] = p.x; s.y[i] = s.py[i] = p.y + i * 0.5; }
    }
    if (!grown) beat(1.05, 1.1, true);
  }
  function removeHook(id) {
    const s = streamers.find((x) => x.id === id && x.attached);
    if (!s) return;
    if (hovered === s) setHover(null);
    s.detach();
    // a little kick so it lets go with some life
    for (let i = 0; i < s.n; i++) { s.px[i] -= (i / s.n) * (s.ax > 0 ? 2.5 : -2.5); s.py[i] -= 2.2; }
    if (reduced) s.gone = true;
    layoutAnchors(false);
    beat(1, 1.1, true);
  }
  function setHooks(list = []) {
    const ids = new Set(list.map((h) => h.id));
    streamers.filter((s) => s.attached && !ids.has(s.id)).forEach((s) => removeHook(s.id));
    const first = streamers.length === 0;
    list.forEach((h) => { if (!streamers.some((s) => s.id === h.id && s.attached)) addHook(h, { grown: first }); });
  }

  // ---------- geometry: the bell deforms as it beats ----------
  const DO = [0, 0];
  let wob = 0, hemAmp = 0;
  function deform(x, y, o) {
    const u = clamp((y - BELL_TOP) / (BELL_HEM - BELL_TOP));
    const c = C;
    let X = x * (1 + c * (0.035 + 0.085 * u * u));
    let Y = PIVOT_Y + (y - PIVOT_Y) * (1 - 0.1 * c) - c * 9 * u * u * u * u;
    if (wob) {
      const a = Math.atan2(y - CY, x);
      const r = 1 + wob * (0.6 * Math.sin(3 * a + T * 1.3) + 0.4 * Math.sin(5 * a - T * 1.9));
      X *= r; Y = CY + (Y - CY) * r;
    }
    if (u > 0.75 && hemAmp) Y += hemAmp * Math.sin(x * 0.045 - T * 2.3) * (u - 0.75) * 4;
    o[0] = X; o[1] = Y;
  }
  // per-point constants of the undeformed outline, so the per-frame deform is pure arithmetic
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
        const r = 1 + wob * (0.6 * (A[j + 1] * c13 + A[j + 2] * s13) + 0.4 * (A[j + 3] * c19 - A[j + 4] * s19));
        X *= r; Y = CY + (Y - CY) * r;
      }
      if (u > 0.75 && hemAmp) Y += hemAmp * (A[j + 5] * c23 - A[j + 6] * s23) * (u - 0.75) * 4;
      s += (i ? "L" : "M") + r1(X) + " " + r1(Y);
    }
    return s + "Z";
  }
  // body space -> world space
  function toWorld(x, y) {
    const a = (rot * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
    const dx = x, dy = y - CY;
    return { x: dx * co - dy * si + bx, y: dx * si + dy * co + CY + by };
  }
  function toBody(x, y) {
    const a = (-rot * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
    const dx = x - bx, dy = y - by - CY;
    return { x: dx * co - dy * si, y: dx * si + dy * co + CY };
  }
  function anchorWorld(ax) { deform(ax, ANCHOR_Y, DO); return toWorld(DO[0], DO[1]); }
  function clientToWorld(x, y) {
    if (!worldInv) return null;
    const m = worldInv;
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
  }
  function worldToClient(x, y) {
    const m = worldM;
    if (!m) return { x: 0, y: 0 };
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
  }

  // ---------- layout ----------
  function layout() {
    const r = mount.getBoundingClientRect();
    W = r.width; H = r.height;
    if (W < 4 || H < 4) return;
    svg.setAttribute("viewBox", `0 0 ${r1(W)} ${r1(H)}`);
    const contentH = 190 + 150 + 470;
    k = Math.min((W * 0.66) / 556, (H * 0.92) / contentH) * scale;
    ox = W / 2;
    oy = Math.max(H * 0.06, (H - contentH * k) / 2) + 190 * k;
    world.setAttribute("transform", `translate(${r1(ox)} ${r1(oy)}) scale(${k.toFixed(4)})`);
  }
  const ro = new ResizeObserver(layout);
  ro.observe(mount);
  layout();
  const io = new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; }, { rootMargin: "120px" });
  io.observe(mount);

  // ---------- heartbeat ----------
  function beat(s = 1, fast = 1, force = false) {
    if (reduced || destroyed) return;
    if (sw && sw.d == null && !force) return; // no heartbeat while the bell is brainless
    const tc = 0.3 / beatFast;
    if (beatT < tc * 0.8) { beatS = Math.max(beatS, s); return; }
    carry = C;
    beatT = 0; beatS = s; beatFast = fast;
    nextCalm = T + calmGap();
  }
  const calmGap = () => (asleep ? rand(4.6, 5.6) : rand(2.5, 3.1));

  // ---------- eyes ----------
  function blinkOpen() {
    if (blinkT < 0) return 1;
    const t = T - blinkT;
    if (t < 0.092) return 1 - smoothstep(t / 0.092);
    if (t < 0.118) return 0;
    if (t < 0.303) return easeOutCubic((t - 0.118) / 0.185);
    blinkT = -1;
    return 1;
  }
  function blink(double = Math.random() < 0.14) {
    if (blinkT >= 0) return;
    blinkT = T;
    if (double) blinkAgain = T + 0.24;
  }

  function refreshLink(a) {
    const r = a.getBoundingClientRect();
    linkCache = { el: a, x: r.left + r.width / 2, y: r.top + r.height / 2, sy: scrollState ? scrollState.y : scrollY };
  }
  // An eye's screen matrix = world (read this frame) x body (written this frame) x brain (its last write) x eye.
  // These are exactly the transforms the browser would compose for getScreenCTM, without asking it to lay out.
  function eyeCTM(b, eye) {
    if (!worldDM || !b.m || readFrame !== frameNo) return eye.eg.getScreenCTM();
    bodyM ||= new DOMMatrix().translateSelf(bodyT.x, bodyT.y).translateSelf(0, CY).rotateSelf(bodyT.r).translateSelf(0, -CY);
    eye.egM ||= new DOMMatrix().translateSelf(eye.e.x, eye.e.y).rotateSelf(eye.e.rot).translateSelf(-eye.e.x, -eye.e.y);
    return worldDM.multiply(bodyM).multiply(b.m).multiply(eye.egM);
  }

  // where the eyes want to look, in client px (null = rest, looking a little down at the text)
  function gazeTarget() {
    let interest = 0;
    if (glance && T < glance.until) return { x: glance.x, y: glance.y, interest: 0.5 };
    if (follow) {
      if (T - lastMoveT < 6) {
        const tgt = pointer.target;
        const a = tgt && tgt.closest ? tgt.closest("a, button, [role=button], input, textarea") : null;
        if (a && !root.contains(a)) {
          if (linkCache.el !== a || linkCache.sy !== scrollState.y) refreshLink(a);
          return { x: linkCache.x, y: linkCache.y, interest: 1 };
        }
        return { x: pointer.x, y: pointer.y, interest };
      }
      if (pointer.touch && (pointer.tx || pointer.ty) && worldM) {
        const c = worldToClient(bx, by);
        return { x: c.x + pointer.tx * 700, y: c.y + pointer.ty * 600, interest: 0 };
      }
    }
    if (read && T - lastMoveT > 3) {
      if (!readCache || T > readCache.until) {
        const r = readRectFrame === frameNo ? readRect : read.getBoundingClientRect();
        readCache = { r, lines: Math.max(1, Math.min(4, Math.round(r.height / 30))), until: T + 2 };
      }
      const { r, lines } = readCache;
      if (r.width && r.bottom > 0 && r.top < innerHeight) {
        if (T > readNext) {
          readStep++;
          const end = readStep % (lines * 4 + 3) >= lines * 4;
          readNext = T + (end ? 0.9 : rand(0.26, 0.48));
        }
        const s = readStep % (lines * 4 + 3);
        if (s < lines * 4) {
          const line = Math.floor(s / 4), step = s % 4;
          return { x: r.left + r.width * (0.06 + 0.29 * step), y: r.top + (r.height / lines) * (line + 0.5), interest: 0.2 };
        }
      }
    }
    return null;
  }

  let dbg = null;
  function updateEyes(dt, b, openMul) {
    const g = visible ? gazeTarget() : null;
    dbg = { T: +T.toFixed(2), g, dart: dart && T < dart.until, lastMoveT };
    const bo = blinkOpen();
    let sumX = 0, sumY = 0;
    const microX = Math.sin(T * 7.3) * Math.sin(T * 3.1) * 0.05, microY = Math.sin(T * 5.9 + 1) * 0.04;
    for (const eye of b.eyes) {
      const { e } = eye;
      let tx = 0, ty = 0.42;
      if (dart && T < dart.until) { tx = dart.x; ty = dart.y; }
      else if (g && follow) {
        const m = eyeCTM(b, eye);
        if (m) {
          const inv = m.inverse();
          const lx = inv.a * g.x + inv.c * g.y + inv.e, ly = inv.b * g.x + inv.d * g.y + inv.f;
          const dx = lx - e.x, dy = ly - e.y, dist = Math.hypot(dx, dy) || 1;
          const reach = Math.min(1, dist / 125);
          tx = (dx / dist) * reach; ty = (dy / dist) * reach;
        }
      }
      if (sleepAmt > 0.01) { tx *= 1 - sleepAmt; ty = lerp(ty, 0.6, sleepAmt); }
      tx += microX; ty += microY;
      sumX += tx; sumY += ty;
      const sw2 = 1 + 0.15 * surprise, sh2 = 1 + 0.17 * surprise;
      const pr = eye.r * (1 + 0.12 * (g ? g.interest : 0) + 0.18 * dilate - 0.42 * surprise);
      const mx = (e.rx * sw2 - pr) * 0.94, my = (e.ry * sh2 - pr) * 0.94;
      const len = Math.hypot(tx, ty);
      if (len > 1) { tx /= len; ty /= len; }
      const f = ease(dt, dart && T < dart.until ? 0.03 : 0.055);
      eye.ox += (tx * mx - eye.ox) * f;
      eye.oy += (ty * my - eye.oy) * f;
      eye.pr += (pr - eye.pr) * ease(dt, 0.09);
      setAttr(eye.pupil, "cx", r1(e.x + eye.ox));
      setAttr(eye.pupil, "cy", r1(e.y + eye.oy));
      setAttr(eye.pupil, "r", r1(eye.pr));
      setAttr(eye.white, "rx", r1(e.rx * sw2));
      setAttr(eye.white, "ry", r1(e.ry * sh2));
      const open = Math.min(bo, openMul, b.open, 1 - sleepAmt);
      setAttr(eye.ap, "cy", r1(e.y + e.ry * 0.55 * (1 - open)));
      setAttr(eye.ap, "ry", r1(Math.max(0, e.ry * sh2 * 1.12 * open)));
      setAttr(eye.ap, "rx", r1(e.rx * sw2 * 1.12));
      const shut = Math.max(sleepAmt, 1 - Math.min(b.open, openMul));
      const lidOn = smoothstep((shut - 0.55) / 0.4);
      if (Math.abs(lidOn - eye.lidOn) > 0.004) { eye.lidOn = lidOn; setAttr(eye.lid, "opacity", lidOn.toFixed(3)); }
    }
    return { x: sumX / b.eyes.length, y: sumY / b.eyes.length };
  }

  // ---------- hover + labels ----------
  function setHover(s, lockFor = 0) {
    if (s === hovered) { if (lockFor) hoverLock = T + lockFor; return; }
    if (hovered) { hovered.hlTo = hovered.id === highlighted ? 1 : 0; bus.emit("hook:hover:end", { id: hovered.id }); }
    hovered = s;
    hoverLock = lockFor ? T + lockFor : 0;
    if (s) {
      s.hlTo = 1;
      bus.emit("hook:hover", { id: s.id });
      if (label) showLabel(s);
    } else if (label) {
      label.classList.remove("is-on");
      setAttr(tie, "d", "");
    }
  }
  function showLabel(s) {
    const h = s.hook || {};
    label.querySelector(".hj-label__name").textContent = h.name || s.id;
    label.querySelector(".hj-label__rule").textContent = h.rule || "";
    const txt = label.querySelector(".hj-label__txt");
    const w = txt.offsetWidth, hh = txt.offsetHeight;
    // an ink blot around the text: a squarish blob with a hand-cut wobble and one drip hanging off the bottom
    const pts = [];
    const n = 26, seed = hash01(s.id) * 9, dripA = Math.PI * (0.38 + 0.3 * hash01(s.id + "d"));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, c = Math.cos(a), si = Math.sin(a);
      const px = Math.sign(c) * Math.pow(Math.abs(c), 0.42), py = Math.sign(si) * Math.pow(Math.abs(si), 0.5);
      const j = 1 + 0.035 * Math.sin(a * 3 + seed) + 0.025 * Math.sin(a * 7 + seed * 2);
      let x = w / 2 + px * (w / 2 + 13) * j, y = hh / 2 + py * (hh / 2 + 12) * j;
      const da = Math.atan2(Math.sin(a - dripA), Math.cos(a - dripA));
      y += 13 * Math.exp(-((da / 0.075) ** 2));
      pts.push(ink.P(x, y));
    }
    const d = "M " + ink.spline(pts, true, 6).map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ") + " Z";
    const blot = label.querySelector(".hj-label__blot");
    setAttr(blot, "width", w); setAttr(blot, "height", hh);
    setAttr(blot.firstChild, "d", d);
    label.style.setProperty("--lw", `${w}px`);
    label.classList.add("is-on");
    label._w = w; label._h = hh;
  }
  function placeLabel() {
    if (!label || !hovered) return;
    const p = hovered.pointAt(Math.min(hovered.n - 1.2, Math.max(1.5, hovered.hitAt ?? hovered.n * 0.5)));
    const ax = ox + p.x * k, ay = oy + p.y * k;
    const w = label._w || 200, h = label._h || 60;
    const mr = rootRectFrame === frameNo ? rootRect : root.getBoundingClientRect();
    const fitsR = mr.left + ax + 44 + w < innerWidth - 10, fitsL = mr.left + ax - 44 - w > 10;
    const right = ax > ox + bx * k ? fitsR || !fitsL : !fitsL && fitsR;
    const lx = right ? ax + 44 : ax - 44 - w, ly = clamp(ay - h * 0.42, -40, H - h + 60);
    label.style.transform = `translate(${r1(lx)}px, ${r1(ly)}px)`;
    label.classList.toggle("is-left", !right);
    const ex = right ? lx - 8 : lx + w + 8, ey = ly + h * 0.5;
    const mxp = (ax + ex) / 2, myp = Math.max(ay, ey) + 10;
    const line = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, u = 1 - t;
      line.push(ink.P(u * u * ax + 2 * u * t * mxp + t * t * ex, u * u * ay + 2 * u * t * myp + t * t * ey));
    }
    setAttr(tie, "d", ink.brush(line, (t) => 1.2 + 3.2 * t * t));
  }

  // ---------- swap ceremony ----------
  function swap(phase, info = {}) {
    if (phase === "start") {
      if (sw && sw.m == null) return;
      if (sw) finishSwap();
      sw = { s: T, m: null, d: null, old: brain, info, sealed: 0, lift: 0 };
      brain = null;
      setAttr(glassLo, "clip-path", `url(#${uid}-lo)`);
      setAttr(rimLo, "clip-path", `url(#${uid}-lo)`);
      setAttr(glintLo, "clip-path", `url(#${uid}-lo)`);
      capG.removeAttribute("display");
      waveTo = 0.35;
      if (hovered) setHover(null);
    } else if (phase === "mid") {
      if (!sw) swap("start", info);
      if (sw.m != null) return;
      sw.m = T;
      const n = J.brain.grooves.length;
      let v = info.to != null ? info.to % n : Math.floor(Math.random() * n);
      if (sw.old && v === sw.old.variant) v = (v + 1) % n;
      brain = createBrain(J, ink, brainsG, defs, uid, v);
      brain.draw = brain.draw.map(() => 0);
      brain.dirty = true;
      brain.wet = 1;
      brain.open = 0;
      brain.y = -560;
      if (reduced) { brain.y = 0; brain.draw = brain.draw.map(() => 1); }
      brain.setTransform();
    } else if (phase === "done") {
      if (!sw) return;
      if (sw.m == null) { swap("mid", info); sw.m = T - 3; }
      if (sw.d == null) sw.d = T;
      if (asleep && !forceSleep) wake();
    }
  }
  function finishSwap() {
    if (!sw) return;
    if (sw.old) { sw.old.remove(); sw.old = null; }
    if (brain) { brain.y = 0; brain.rot = 0; brain.draw = brain.draw.map(() => 1); brain.dirty = true; brain.open = 1; brain.wet = 0; brain.setTransform(); }
    glassLo.removeAttribute("clip-path"); rimLo.removeAttribute("clip-path"); glintLo.removeAttribute("clip-path");
    capG.setAttribute("display", "none");
    crackEl.setAttribute("opacity", "0");
    sinkY = 0;
    waveTo = 1;
    sw = null;
  }
  function updateSwap() {
    if (!sw) return 1;
    const ts = T - sw.s;
    const R = reduced;
    let lift = R ? 0 : easeOutBack((ts - 0.5) / 0.9, 1.1);
    let crackOp = R ? 0 : smoothstep((ts - 0.1) / 0.3) * (1 - smoothstep((ts - 0.55) / 0.25));
    if (sw.m != null) {
      const tm = T - sw.m;
      lift *= 1 - easeInCubic((tm - 1.75) / 0.55);
      if (tm >= 2.3 && !sw.sealed) { sw.sealed = T; beat(1.15, 1.3, true); bus.emit("ripple", rippleAt(0, -60, 0.35)); }
      if (brain) {
        const u = clamp(tm / 2.05);
        if (!R) {
          brain.y = -560 * (1 - easeOutCubic(u)) + Math.sin(tm * 5.5) * 6 * (1 - u) * u * 4;
          brain.rot = 9 * Math.sin(tm * 2.3) * (1 - u);
          brain.x = 18 * Math.sin(tm * 1.7) * (1 - u);
          for (let i = 0; i < brain.draw.length; i++) brain.draw[i] = easeInOutCubic((tm - 0.35 - i * 0.17) / 0.85);
          brain.dirty = true;
        }
      }
      if (sw.old) sw.old.alpha = Math.min(sw.old.alpha, 1 - clamp(tm / 0.35));
      if (sw.d == null && tm > 6) sw.d = T;   // never get stuck without a brain
    }
    if (sw.sealed) crackOp = Math.max(crackOp, 1 - clamp((T - sw.sealed) / 0.9));
    sw.lift = clamp(lift, 0, 1.25);
    setAttr(crackEl, "opacity", crackOp.toFixed(3));
    const L = sw.lift;
    setAttr(capG, "transform", L > 0.001
      ? `translate(${r1(46 * L)} ${r1(-118 * L + Math.sin(T * 2) * 5 * L)}) rotate(${(-15 * L + Math.sin(T * 1.5) * 2.2 * L).toFixed(2)} 0 -150)`
      : "");
    // the old brain floats up and out, asleep
    const old = sw.old;
    if (old) {
      const u = R ? 1 : clamp((ts - 0.75) / 1.85);
      const e = easeInOutCubic(u);
      old.open = 1 - smoothstep(ts / 0.25);
      old.y = -360 * e;
      old.x = -120 * e * e + 14 * Math.sin(ts * 2.2) * clamp(u * 3);
      old.rot = -22 * e + 4 * Math.sin(ts * 1.7) * u;
      old.sx = old.sy = 1 - 0.18 * e;
      old.alpha = Math.min(old.alpha, R ? 1 - clamp(ts / 0.4) : 1 - smoothstep((ts - 1.45) / 0.95));
      old.setTransform();
      setAttr(old.g, "opacity", old.alpha.toFixed(3));
      updateEyes(0.016, old, old.open);
      if (old.alpha <= 0.001) { old.remove(); sw.old = null; }
    }
    sinkY = sw.d == null ? 16 * smoothstep(ts / 1.5) : 16 * (1 - smoothstep((T - sw.d) / 0.6));
    let open = 1;
    if (sw.d != null) {
      const td = T - sw.d;
      open = R ? 1 : smoothstep(td / 0.45);
      if (brain) { brain.open = open; brain.wet = 1 - smoothstep((td - 0.15) / 0.9); }
      if (!sw.opened && td > 0.05) { sw.opened = true; waveTo = 1; beat(1.2, 1); dilate = 1; }
      if (!sw.blinked && td > 0.85) { sw.blinked = true; blink(true); }
      if (td > 1.4 && (!sw.old)) finishSwap();
    } else if (brain) brain.open = 0;
    return open;
  }
  function rippleAt(x, y, strength) {
    const w = toWorld(x, y), c = worldToClient(w.x, w.y);
    return { x: c.x, y: c.y, strength };
  }

  // ---------- poke, look, sleep, flip ----------
  function poke(cx, cy) {
    const c = rippleAt(0, CY, 0.8);
    if (cx == null) { cx = c.x; cy = c.y; }
    if (asleep && !forceSleep) wake();
    surprise = 1; surpriseHold = T + 0.6;
    beat(1.45, 1.6, true);
    if (!reduced) {
      const dx = c.x - cx, dy = c.y - cy, d = Math.hypot(dx, dy) || 1;
      bodyVX += (dx / d) * 110; swimV += (dy / d) * 80 - 40;
      for (const s of streamers) for (let i = 2; i < s.n; i++) { s.px[i] -= (s.x[i] - bx) * 0.035; s.py[i] += 2.5; }
    }
    blinkAgain = T + 1.0;
    bus.emit("ripple", { x: cx, y: cy, strength: 0.8 });
    bus.emit("sfx", { name: "bubble" });
  }
  function lookAt(x, y, dur = 1.4) { glance = { x, y, until: T + dur }; }
  function wake() {
    if (!asleep) return;
    asleep = false;
    wakeBlink = true;
    beat(0.8, 1.2);
  }
  function sleep(on = true) {
    forceSleep = !!on;
    if (on) asleep = true; else { lastActive = performance.now(); wake(); }
  }
  function flip() { if (!reduced && flipT < 0) flipT = 0; }
  function think(th) {
    if (!brain || sw) return;
    brain.rewire(T);
    const kind = th?.kind;
    const a = kind === "look" ? (Math.random() < 0.5 ? Math.PI * 0.95 : 0.1) : rand(0, Math.PI * 2);
    dart = { x: Math.cos(a) * 0.95, y: Math.sin(a) * 0.75, until: T + (kind === "look" ? 0.55 : 0.36) };
    if (kind === "idea" || kind === "self") dilate = 1;
    if (kind === "decide") lean.r += 3;
  }
  function pulse(id) {
    const live = streamers.filter((s) => s.attached && s.grow > 0.9);
    if (!live.length || reduced) return;
    const s = (id && live.find((x) => x.id === id)) || live[Math.floor(Math.random() * live.length)];
    s.pulse(T);
  }
  function highlight(id) {
    highlighted = id || null;
    for (const s of streamers) s.hlTo = s.id === highlighted || s === hovered ? 1 : 0;
  }

  // ---------- input ----------
  const onActivity = () => {
    lastActive = performance.now();
    if (asleep && !forceSleep) wake();
  };
  const actEvents = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"];
  actEvents.forEach((e) => addEventListener(e, onActivity, { passive: true }));

  function overBell(q) {
    const b = toBody(q.x, q.y);
    const ex = b.x / 285, ey = (b.y + 5) / 185;
    return ex * ex + ey * ey < 1;
  }
  function onDown(e) {
    if (!worldInv) return;
    const q = clientToWorld(e.clientX, e.clientY);
    if (!q) return;
    const touch = e.pointerType !== "mouse";
    let best = null, bd = (touch ? 22 : 12) / k;
    for (const s of streamers) if (s.attached && s.grow > 0.6) { const d = s.dist(q.x, q.y); if (d < bd) { bd = d; best = s; } }
    // a tentacle tap shows its label (only where this jelly has labels: without them nothing would ever clear it)
    if (best && !overBell(q) && labels) { setHover(best, touch ? 3.5 : 0); return; }
    if (overBell(q)) poke(e.clientX, e.clientY);
  }
  root.addEventListener("pointerdown", onDown);

  // ---------- the frame ----------
  let cost = 0, lastLoopT = 0;
  function frame(t, dt) {
    if (destroyed) return;
    // timelines (beats, blinks, the swap) run on real elapsed time so they stay in step with the feed,
    // even off screen or on slow frames; physics below uses the loop's clamped dt
    T += lastLoopT ? clamp(t - lastLoopT, 0, 1) : dt;
    lastLoopT = t;
    if (!visible || W < 4) return;
    const t0 = performance.now();
    frameBody(dt);
    cost += (performance.now() - t0 - cost) * 0.05;
  }
  function frameBody(dt) {
    const now = performance.now();

    // reads were taken in the read phase (readPhase below)
    if (pointer.x !== lastPX || pointer.y !== lastPY) { lastMoveT = T; lastPX = pointer.x; lastPY = pointer.y; }
    const sy = scrollState ? scrollState.y : scrollY;
    scrollV += ((sy - scrollPrev) / Math.max(dt, 1e-3) - scrollV) * ease(dt, 0.08);
    scrollPrev = sy;

    // sleep
    if (sleepy && !asleep && !sw && now - lastActive > 25000) asleep = true;
    sleepAmt += ((asleep ? 1 : 0) - sleepAmt) * ease(dt, asleep ? 0.55 : 0.12);
    if (wakeBlink && sleepAmt < 0.3) { wakeBlink = false; blink(true); }

    // heartbeat
    if (!reduced) {
      if (!sw && T > nextCalm) beat(asleep ? 0.42 : rand(0.72, 0.9), asleep ? 0.7 : 1);
      beatT += dt;
      C = envelope(beatT, beatFast) * beatS + carry * Math.exp(-beatT / 0.12);
      if (beatT < 0.3 / beatFast) swimV -= beatS * 470 * dt;
      wob = 0.008; hemAmp = 2.4;
    } else { C = 0; wob = 0; hemAmp = 0; }

    // body: swim bob, drift, tilt, flip
    prevSwimV = swimV;
    swimV += (-swimY * 7 - swimV * 2.6) * dt;
    swimY += swimV * dt;
    bodyVX += (-bodyX * 6 - bodyVX * 3) * dt;
    bodyX += bodyVX * dt;
    const dx = reduced ? 0 : 13 * Math.sin(T * 0.21) + 6 * Math.sin(T * 0.53 + 1.2);
    const dy = reduced ? 0 : 7 * Math.sin(T * 0.29 + 2.1);
    bx = dx + bodyX;
    by = dy + swimY + sinkY + 9 * sleepAmt;
    const dvx = 13 * 0.21 * Math.cos(T * 0.21) + 6 * 0.53 * Math.cos(T * 0.53 + 1.2);
    const tiltTo = reduced ? 0 : dvx * 0.55 + bodyVX * 0.03 + lean.x * 0.25;
    tilt += (tiltTo - tilt) * ease(dt, 0.7);
    let flipRot = 0;
    if (flipT >= 0) {
      flipT += dt;
      const u = flipT / 1.6;
      flipRot = u < 0.16 ? -16 * smoothstep(u / 0.16) : -16 + 376 * easeInOutCubic((u - 0.16) / 0.84);
      if (u >= 1) { flipT = -1; flipRot = 0; beat(1.1, 1.2); }
    }
    rot = tilt + flipRot;
    const rotS = rot.toFixed(2);
    setAttr(body, "transform", `translate(${r1(bx)} ${r1(by)}) rotate(${rotS} 0 ${CY})`);
    if (bodyT.x !== r1(bx) || bodyT.y !== r1(by) || bodyT.r !== +rotS) { bodyT = { x: r1(bx), y: r1(by), r: +rotS }; bodyM = null; }

    // bell
    const outer = bellD(OUT, OUT_A), inner = bellD(IN, IN_A), glint = bellD(GL, GL_A);
    setAttr(rimLo, "d", outer + inner);
    setAttr(glassLo, "d", inner);
    setAttr(glintLo, "d", glint);
    const swapOpen = updateSwap();
    if (sw) { setAttr(capRim, "d", outer + inner); setAttr(capGlass, "d", inner); setAttr(capGlint, "d", glint); }

    // surprise / dilation decay
    if (T > surpriseHold) surprise += (0 - surprise) * ease(dt, 0.35);
    dilate += (0 - dilate) * ease(dt, 0.9);
    if (blinkAgain > 0 && T > blinkAgain) { blinkAgain = -1; blinkT = -1; blink(false); }
    if (!sw && !asleep && T > nextBlink) { blink(); nextBlink = T + rand(2.5, 4.2); }

    // brain: eyes, lean, inertia, squash
    if (brain) {
      const look = updateEyes(dt, brain, swapOpen);
      const lt = sw ? 0 : 1;
      lean.x += (look.x * 7 * lt - lean.x) * ease(dt, 0.15);
      lean.y += ((look.y - 0.3) * 5 * lt + 7 * sleepAmt - lean.y) * ease(dt, 0.15);
      lean.r += (look.x * 2.6 * lt + 5 * sleepAmt - lean.r) * ease(dt, 0.18);
      lag.v -= (swimV - prevSwimV) * 0.5;
      lag.v += (-lag.y * 90 - lag.v * 9) * dt;
      lag.y += lag.v * dt;
      bc.v += ((C - bc.x) * 160 - bc.v * 10) * dt;
      bc.x += bc.v * dt;
      if (!sw || sw.d != null) { brain.x = lean.x; brain.y = lean.y + clamp(lag.y, -14, 14); brain.rot = lean.r; }
      brain.sx = 1 + 0.035 * bc.x; brain.sy = 1 - 0.05 * bc.x;
      brain.setTransform();
      brain.update(T);
    }
    if (sw && sw.old) sw.old.update(T);

    // tentacles
    const pin = clientToWorld(pointer.x, pointer.y);
    const pon = !reduced && pin && T - lastMoveT < 0.4;
    const P = pon ? { on: true, x: pin.x, y: pin.y, vx: pointer.vx / k, vy: pointer.vy / k, r: 120, r2: 14400, push: 40 } : null;
    wave += (waveTo * (1 - 0.55 * sleepAmt) - wave) * ease(dt, 0.8);
    const sv = clamp((scrollV / k) * 0.55, -420, 900);
    const env = {
      drag: 0.955, gravity: 520 + sv, wave: reduced ? 0 : 90 * wave, shape: 1, sway: reduced ? 0.5 : wave, pointer: P, rx: 0, ry: 0, dx: 0, dy: 1,
      flow: reduced ? () => 0 : (x, y, t) => (90 * Math.sin(0.23 * t + y * 0.004 + 1.3) + 55 * Math.sin(0.57 * t - x * 0.006)) * wave,
    };
    const ar = (rot * Math.PI) / 180;
    const steps = dt > 1 / 45 ? 2 : 1, h = dt / steps;
    for (let i = streamers.length - 1; i >= 0; i--) {
      const s = streamers[i];
      if (s.gone) { s.g.remove(); streamers.splice(i, 1); if (s === hovered) setHover(null); continue; }
      if (s.attached) {
        s.ax += (s.axTo - s.ax) * ease(dt, 0.45);
        const p = anchorWorld(s.ax);
        const sp = (s.ax / 215) * (0.16 + 0.25 * Math.max(0, C));
        env.rx = p.x; env.ry = p.y;
        env.dx = Math.sin(sp + ar); env.dy = Math.cos(sp + ar);
      }
      for (let j = 0; j < steps; j++) s.step(h, T, env);
      s.render(T);
      setAttr(s.el, "d", s.d);
      setAttr(s.core, "d", s.coreD);
      if (!s.attached) setAttr(s.g, "opacity", s.alpha.toFixed(3));
    }

    // hover detection (labels or highlight feedback)
    if (labels && follow && pin && !pointer.touch && T > hoverLock) {
      let best = null;
      if (T - lastMoveT < 8 && !sw && !overBell(pin)) {
        // hysteresis: a hovered tentacle stays hovered within a wider band, since it keeps swaying
        if (hovered && hovered.attached && hovered.dist(pin.x, pin.y) < 34 / k) best = hovered;
        else {
          let bd = 12 / k;
          for (const s of streamers) if (s.attached && s.grow > 0.6) { const d = s.dist(pin.x, pin.y); if (d < bd) { bd = d; best = s; } }
        }
      }
      if (best) hoverSeen = T;
      if (best !== hovered && (best || T - hoverSeen > 0.4)) setHover(best);
      root.classList.toggle("is-over", !!pin && overBell(pin));
    } else if (hovered && hoverLock && T > hoverLock) setHover(null);
    if (hovered) placeLabel();

    // sleep bubbles
    if (sleepAmt > 0.8 && !reduced && T > nextBubble) {
      nextBubble = T + rand(2.2, 3.6);
      const p = toWorld(rand(-50, 70), -190);
      const el = svgEl("path", { class: "hj-cream", "fill-rule": "evenodd" }, fxG);
      bubbles.push({ el, x: p.x, y: p.y, r: rand(5, 10), seed: rand(0, 9), t0: T });
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i], a = T - b.t0;
      if (a > 3.4) { b.el.remove(); bubbles.splice(i, 1); continue; }
      const x = b.x + Math.sin(a * 2.1 + b.seed) * 7, y = b.y - a * 34 - a * a * 4;
      setAttr(b.el, "d", ringPath(x, y, b.r * (0.6 + 0.4 * smoothstep(a / 0.5)), 2.6, b.seed + a * 2));
      setAttr(b.el, "opacity", (1 - smoothstep((a - 2.2) / 1.2)).toFixed(3));
    }
  }
  const removeLoop = ctx.loop.add(frame);
  function readPhase() {
    frameNo++;
    if (destroyed || !visible || W < 4) return;
    readFrame = frameNo;
    worldM = world.getScreenCTM();
    worldInv = worldM ? worldM.inverse() : null;
    worldDM = worldM ? new DOMMatrix([worldM.a, worldM.b, worldM.c, worldM.d, worldM.e, worldM.f]) : null; // SVGMatrix -> DOMMatrix
    if (follow) {
      const tgt = pointer.target;
      const a = tgt && tgt.closest ? tgt.closest("a, button, [role=button], input, textarea") : null;
      if (a && !root.contains(a) && (linkCache.el !== a || linkCache.sy !== scrollState.y)) refreshLink(a);
    }
    if (read && (!readCache || T + 1 > readCache.until)) { readRect = read.getBoundingClientRect(); readRectFrame = frameNo; }
    if (hovered && label) { rootRect = root.getBoundingClientRect(); rootRectFrame = frameNo; }
  }
  const removeRead = ctx.loop.read ? ctx.loop.read(readPhase) : () => {};

  // initial tentacles, settled before the first paint
  setHooks(hooks || []);
  for (const s of streamers) s.ax = s.axTo;
  {
    const env = { drag: 0.94, gravity: 520, wave: 0, shape: 1, sway: reduced ? 0.5 : 1, pointer: null, rx: 0, ry: 0, dx: 0, dy: 1, flow: () => 0 };
    for (let it = 0; it < 90; it++) {
      for (const s of streamers) {
        const p = anchorWorld(s.ax);
        const sp = (s.ax / 215) * 0.16;
        env.rx = p.x; env.ry = p.y; env.dx = Math.sin(sp); env.dy = Math.cos(sp);
        s.step(1 / 60, it / 60, env);
      }
    }
  }

  const api = {
    root, svg,
    setHooks, addHook: (h) => addHook(h), removeHook,
    tipPositions() {
      const m = world.getScreenCTM();
      if (!m) return [];
      return streamers.filter((s) => s.attached).map((s) => {
        const i = s.n - 1;
        return { id: s.id, x: m.a * s.x[i] + m.c * s.y[i] + m.e, y: m.b * s.x[i] + m.d * s.y[i] + m.f };
      });
    },
    swap, lookAt, poke: (x, y) => poke(x, y), sleep, highlight,
    // extras
    think, beat, flip, pulse,
    bellRect() {
      const m = world.getScreenCTM();
      if (!m) return null;
      const a = { x: m.a * (bx - 278) + m.c * (by - 181) + m.e, y: m.b * (bx - 278) + m.d * (by - 181) + m.f };
      const b = { x: m.a * (bx + 276) + m.c * (by + 172) + m.e, y: m.b * (bx + 276) + m.d * (by + 172) + m.f };
      return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
    },
    get hooks() { return streamers.filter((s) => s.attached).map((s) => s.id); },
    _debug() { return { ...dbg, ms: +cost.toFixed(3), eyes: brain?.eyes.map((e) => [+e.ox.toFixed(1), +e.oy.toFixed(1)]) }; },
    _hover(id) { const s = streamers.find((x) => x.id === id && x.attached); setHover(s || null, 60); },
    destroy() {
      destroyed = true;
      removeLoop();
      removeRead();
      ro.disconnect(); io.disconnect();
      actEvents.forEach((e) => removeEventListener(e, onActivity));
      root.removeEventListener("pointerdown", onDown);
      if (hovered) bus.emit("hook:hover:end", { id: hovered.id });
      root.remove();
    },
  };
  return api;
}

// Subscribe a jelly to the live feed. hero: also answer jelly:look / jelly:poke / the flip egg.
export function wireJelly(jelly, ctx, { hero = false } = {}) {
  const { bus, state } = ctx;
  let lastBurned = state.vault?.burnedTokens ?? 0, lastPulse = 0;
  const offs = [
    bus.on("thought", (t) => jelly.think(t)),
    bus.on("hooks:set", (list) => jelly.setHooks(list)),
    bus.on("hook:add", ({ hook }) => { jelly.addHook(hook); }),
    bus.on("hook:remove", ({ id }) => { jelly.removeHook(id); }),
    bus.on("brain:swap:start", (p) => jelly.swap("start", p || {})),
    bus.on("brain:swap:mid", (p) => jelly.swap("mid", p || {})),
    bus.on("brain:swap:done", (p) => jelly.swap("done", p || {})),
    bus.on("vault", (v) => {
      // the heart answers every fee; a cream pulse runs down the hook that fired
      const fee = v?.lastFee ?? 0.01;
      jelly.beat(0.55 + Math.min(0.4, fee * 12), 1.05);
      const now = performance.now();
      if (now - lastPulse > 1600) {
        lastPulse = now;
        const burned = v?.burnedTokens ?? 0;
        jelly.pulse(burned > lastBurned ? "burn" : null);
        lastBurned = burned;
      }
    }),
  ];
  if (hero) {
    offs.push(
      bus.on("jelly:look", (p) => p && jelly.lookAt(p.x, p.y)),
      bus.on("jelly:poke", () => jelly.poke()),
      bus.on("egg", (e) => { if (e?.type === "flip") jelly.flip(); }),
    );
  }
  return () => offs.forEach((off) => off());
}

// A tiny jelly mark (topbar, toggles, pips): it watches the cursor and blinks on its own timer.
export function createMark(el, ctx, { tentacles = true } = {}) {
  const J = ctx.assets.jelly, ink = ctx.ink, pointer = ctx.pointer;
  const svg = svgEl("svg", { class: "hj-mark", viewBox: tentacles ? "-292 -196 584 470" : "-292 -196 584 380", "aria-hidden": "true" });
  const g = svgEl("g", { class: "hj-mark__body" }, svg);
  if (tentacles) {
    [-150, -50, 50, 150].forEach((x, i) => {
      const s = i % 2 ? 1 : -1;
      const d = ink.tentacle([ink.P(x, 120), ink.P(x + 10 * s, 180), ink.P(x - 8 * s, 230), ink.P(x + 4 * s, 268)], { w0: 30, w1: 14 }).match(/d="([^"]+)"/)[1];
      svgEl("path", { class: "hj-ink", d }, g);
    });
  }
  svgEl("path", { class: "hj-ink", "fill-rule": "evenodd", d: J.bell.d + J.bell.inner }, g);
  svgEl("path", { class: "hj-glass", d: J.bell.inner }, g);
  const bg = svgEl("g", { transform: "translate(-4 4) scale(0.56) rotate(-4)" }, g);
  svgEl("path", { class: "hj-ink", d: J.brain.d }, bg);
  const uid = `hjm${++UID}`;
  const defs = svgEl("defs", {}, svg);
  const eyes = J.brain.eyes.map((e, i) => {
    const clip = svgEl("clipPath", { id: `${uid}-${i}` }, defs);
    const ap = svgEl("ellipse", { cx: e.x, cy: e.y, rx: e.rx * 1.15, ry: e.ry * 1.15 }, clip);
    const eg = svgEl("g", { transform: `rotate(${e.rot} ${e.x} ${e.y})` }, bg);
    const inner = svgEl("g", { "clip-path": `url(#${uid}-${i})` }, eg);
    svgEl("ellipse", { class: "hj-cream", cx: e.x, cy: e.y, rx: e.rx * 1.12, ry: e.ry * 1.12 }, inner);
    const pupil = svgEl("circle", { class: "hj-ink", cx: e.x, cy: e.y + 10, r: Math.min(e.rx, e.ry) * 0.56 }, inner);
    return { e, eg, ap, pupil, ox: 0, oy: 10 };
  });
  svgEl("path", { class: "hj-cream", d: J.bell.glint }, g);
  el.prepend(svg);
  let blinkAt = performance.now() + rand(1500, 4000), dbl = false, visible = true, lx = -1, ly = -1, settled = 0;
  const io = new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; });
  io.observe(svg);
  // the eye matrices are read before any module writes in the frame, so the read never forces a layout
  let ctmFrame = 0, frameN = 0;
  const offRead = ctx.loop.read ? ctx.loop.read(() => {
    frameN++;
    if (!visible || ctx.reduced) return;
    // the eyes follow the pointer only while it moves and for 40 frames after: past that, this frame won't use the
    // matrices, and reading them anyway forced a style and layout pass every frame (WebKit: the first read pays for it)
    if (settled >= 39 && pointer.x === lx && pointer.y === ly) return;
    for (const eye of eyes) eye.m = eye.eg.getScreenCTM();
    ctmFrame = frameN;
  }) : () => {};
  const off = ctx.loop.add((t, dt) => {
    if (!visible) return;
    const now = performance.now();
    let open = 1;
    const bt = (now - blinkAt) / 1000;
    if (bt >= 0) {
      if (bt < 0.092) open = 1 - smoothstep(bt / 0.092);
      else if (bt < 0.118) open = 0;
      else if (bt < 0.303) open = easeOutCubic((bt - 0.118) / 0.185);
      else if (!dbl && Math.random() < 0.14) { dbl = true; blinkAt = now + 120; }
      else { dbl = false; blinkAt = now + rand(2900, 5200); }
    }
    const moved = pointer.x !== lx || pointer.y !== ly;
    lx = pointer.x; ly = pointer.y;
    if (moved) settled = 0; else settled++;
    for (const eye of eyes) {
      const { e } = eye;
      if (settled < 40 && !ctx.reduced) {
        const m = ctmFrame === frameN ? eye.m : eye.eg.getScreenCTM();
        if (m) {
          const inv = m.inverse();
          const qx = inv.a * pointer.x + inv.c * pointer.y + inv.e, qy = inv.b * pointer.x + inv.d * pointer.y + inv.f;
          const dx = qx - e.x, dy = qy - e.y, d = Math.hypot(dx, dy) || 1, reach = Math.min(1, d / 125);
          const mx = (e.rx * 1.12 - Math.min(e.rx, e.ry) * 0.56) * 0.9, my = (e.ry * 1.12 - Math.min(e.rx, e.ry) * 0.56) * 0.9;
          const f = ease(dt, 0.055);
          eye.ox += ((dx / d) * reach * mx - eye.ox) * f;
          eye.oy += ((pointer.active ? (dy / d) * reach : 0.4) * my - eye.oy) * f;
          eye.pupil.setAttribute("cx", r1(e.x + eye.ox));
          eye.pupil.setAttribute("cy", r1(e.y + eye.oy));
        }
      }
      if (open !== eye.open) {
        eye.open = open;
        eye.ap.setAttribute("cy", r1(e.y + e.ry * 0.6 * (1 - open)));
        eye.ap.setAttribute("ry", r1(e.ry * 1.15 * open));
      }
    }
  });
  return { svg, destroy() { off(); offRead(); io.disconnect(); svg.remove(); } };
}

export function init(ctx) {
  const mount = document.getElementById("hero-jelly");
  if (!mount || !ctx.assets?.jelly) return;
  if (mount.hasAttribute("aria-label") && !mount.hasAttribute("role")) mount.setAttribute("role", "img");
  // no hover labels on the tentacles (owner, 20 Oct 2026): a click or a sway moved the tentacle out from under the cursor,
  // so the label blinked on and off, and the tentacles section says it all with cards
  const jelly = createJelly(mount, { ctx, labels: false, reach: ctx.mobile ? 1 : 1.2, read: document.querySelector(".hero-copy__lead") });
  ctx.heroJelly = jelly;
  wireJelly(jelly, ctx, { hero: true });

  // while the loader's own jelly is flying into our rect, stay invisible; appear the moment it lands
  const loader = document.getElementById("loader");
  const loaderOn = !ctx.params.has("skipLoader") && loader && loader.childElementCount > 0 && getComputedStyle(loader).display !== "none";
  if (loaderOn) {
    jelly.root.classList.add("is-waiting");
    let shown = false;
    const reveal = () => { if (shown) return; shown = true; jelly.root.classList.remove("is-waiting"); jelly.beat(1.1, 1); };
    ctx.bus.once("loader:done", reveal);
    setTimeout(reveal, 6000);
  }

  // the topbar mark is a small Turri that watches too
  const mark = document.querySelector(".topbar__mark");
  if (mark && !mark.querySelector(".hj-mark")) { createMark(mark, ctx); mark.classList.add("has-hj-mark"); }

  // temporary test flags for headless screenshots: ?jellytest=swap,grow,drop,sleep,hover,poke,think,flip,hl&jt=ms
  const tests = (ctx.params.get("jellytest") || "").split(",").filter(Boolean);
  if (tests.length) {
    const delay = Number(ctx.params.get("jt") || 300);
    const { HOOKS } = ctx.content;
    ctx.bus.once("ready", () => {
      setTimeout(() => {
        for (const t of tests) {
          if (t === "swap") ctx.sim.swapNow();
          if (t === "grow") {
            const id = Object.keys(HOOKS).find((h) => !jelly.hooks.includes(h));
            if (id) ctx.bus.emit("hook:add", { hook: { id, ...HOOKS[id], since: Date.now() }, version: ctx.state.version });
          }
          if (t === "drop") { const id = jelly.hooks[1]; if (id) ctx.bus.emit("hook:remove", { id, version: ctx.state.version }); }
          if (t === "sleep") jelly.sleep(true);
          if (t === "hover") jelly._hover(jelly.hooks[jelly.hooks.length - 1]);
          if (t === "hl") jelly.highlight(jelly.hooks[0]);
          if (t === "poke") ctx.bus.emit("jelly:poke");
          if (t === "flip") ctx.bus.emit("egg", { type: "flip" });
          if (t === "think") ctx.sim.think("idea", "Testing a thought for the screenshot.");
          if (t === "debug") setInterval(() => { jelly.root.dataset.debug = JSON.stringify(jelly._debug()); }, 250);
        }
      }, delay);
    });
  }
}
