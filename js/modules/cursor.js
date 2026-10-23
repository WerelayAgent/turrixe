// cursor (brief 4): Turri's ink on your pointer. Desktop only.
// - An ink droplet with a springy tail of four blobs, fused by a gooey SVG filter. Every blob squashes and
//   stretches with its own velocity, and the head swells with a jelly overshoot when the tail flows back in.
// - At rest it breathes; now and then a drip sags, necks and either snaps back or falls away into the water.
// - Over anything clickable it breathes out a cream bubble: an inked rim with a glint, like a tiny glass bell.
//   It flattens against its own motion like a real bubble and wobbles back. A click pops it into cream spray.
// - A click anywhere else splits the drop in three and leaves an ink splat that bleeds into the water and fades,
//   and emits `ripple`.
// - During a brain swap the droplet turns toward Turri. With the brains egg it grows eyes for 10 s.
// The system cursor is hidden only while the ink one is active. Touch and reduced motion keep the system cursor.
// Other modules can steer it with data-cursor="bubble" | "ink" | "none" | "native" on any element.
// Layout is only ever measured in measure(), never in the per-frame writes: in the loop's read phase when the runtime
// has one (loop.read), otherwise in a task queued from the frame, which runs once that frame is painted and layout
// is clean. Scroll comes from ctx.scroll; reading window.scrollY in the loop would force a layout every frame.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (t) => t * t * (3 - 2 * t);
const rnd = (a, b) => a + Math.random() * (b - a);
const n1 = (v) => (Math.round(v * 10) / 10).toString();
const S = (x = 0) => ({ x, v: 0 });
// damped spring on {x, v}: w is the angular frequency, z the damping ratio
const spring = (s, target, w, z, h) => { s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h; s.x += s.v * h; };
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const HEAD = 8.4;                  // head radius in CSS px
// The first blob stays close and pulls the head into a teardrop; the other three are beads flung behind it
// that neck, pinch off and flow back in.
const TAIL = [                     // radius, spring Hz, damping, longest link to the blob before it
  { r: 5.9, hz: 10, z: 0.5, link: 9 },
  { r: 4.5, hz: 6.9, z: 0.42, link: 17 },
  { r: 3.7, hz: 6.1, z: 0.45, link: 16 },
  { r: 3.1, hz: 5.4, z: 0.5, link: 15 },
];
const GOO = 2.9;                   // blur of the gooey filter
const SLOTS = 4;                   // splats alive at once

const CLICKABLE = [
  "a[href]", "button:not(:disabled)", "summary", "select", "label[for]", "[onclick]",
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="switch"]', '[role="checkbox"]', '[role="menuitem"]',
  'input[type="submit"]', 'input[type="button"]', 'input[type="reset"]', 'input[type="checkbox"]',
  'input[type="radio"]', 'input[type="range"]', 'input[type="color"]', 'input[type="file"]',
].join(",");
const TEXTY = 'input:not([type]),input[type="text"],input[type="search"],input[type="email"],input[type="url"],input[type="tel"],input[type="password"],input[type="number"],textarea,[contenteditable=""],[contenteditable="true"]';

// closed polygon: radius r, stretched sx along angle a and sy across it, with optional wobble modes
function blob(o, cx, cy, r, sx, sy, a, n, wob, t) {
  const ca = Math.cos(a), sa = Math.sin(a);
  for (let k = 0; k < n; k++) {
    const th = (k / n) * TAU;
    let rr = r;
    if (wob) {
      rr *= 1 + wob[0].x * Math.cos(2 * th) + wob[1].x * Math.sin(2 * th) + wob[2].x * Math.cos(3 * th) + wob[3].x * Math.sin(3 * th)
        + 0.03 * Math.sin(3 * th + t * 1.1) + 0.022 * Math.sin(5 * th - t * 0.83 + 1.3);
    }
    const lx = Math.cos(th) * rr * sx, ly = Math.sin(th) * rr * sy;
    o.push(k ? "L" : "M", n1(cx + lx * ca - ly * sa), " ", n1(cy + lx * sa + ly * ca));
  }
  o.push("Z");
}

// tapered brush arc along a wobbly circle: from th0 over span radians, width wfn(u) for u in 0..1, radius scale rk
function arc(o, cx, cy, R, wob, th0, span, M, wfn, rk = 1) {
  const L = [], Rt = [];
  for (let i = 0; i <= M; i++) {
    const u = i / M, th = th0 + span * u;
    let r = R * rk;
    if (wob) {
      r *= 1 + wob[0].x * Math.cos(2 * th) + wob[1].x * Math.sin(2 * th) + wob[2].x * Math.cos(3 * th)
        + wob[3].x * Math.sin(3 * th) + wob[4].x * Math.cos(4 * th) + wob[5].x * Math.sin(4 * th);
    }
    const w = wfn(u) / 2, c = Math.cos(th), s = Math.sin(th);
    L.push(n1(cx + c * (r + w)) + " " + n1(cy + s * (r + w)));
    Rt.push(n1(cx + c * (r - w)) + " " + n1(cy + s * (r - w)));
  }
  o.push("M", L.join(" L "), " L ", Rt.reverse().join(" L "), "Z");
}

export function init(ctx) {
  const { bus, loop, scroll } = ctx;
  const mount = document.getElementById("cursor");
  if (!mount) return;
  // phones and tablets keep their fingers; reduced motion keeps the system cursor
  if (ctx.reduced || !matchMedia("(any-pointer: fine)").matches) return;

  const root = document.documentElement;
  const range = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join("");
  mount.innerHTML = `<svg class="cur" aria-hidden="true" focusable="false">
  <defs>
    <filter id="cur-goo" x="-80%" y="-80%" width="260%" height="260%" color-interpolation-filters="sRGB">
      <feGaussianBlur stdDeviation="${GOO}"/>
      <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 21 -7"/>
    </filter>
    ${range(SLOTS, (i) => `<filter id="cur-bleed${i}" x="-45%" y="-45%" width="190%" height="190%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="${i * 11 + 3}"/>
      <feDisplacementMap in="SourceGraphic" scale="0" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`)}
  </defs>
  <g class="cur__splats">${range(SLOTS, (i) => `<g class="cur__splat" filter="url(#cur-bleed${i})" display="none"><path class="cur__halo"/><path class="cur__blot"/></g>`)}</g>
  <path class="cur__sink"/>
  <g filter="url(#cur-goo)"><path class="cur__ink"/></g>
  <g class="cur__eyes" display="none">${range(2, () => `<ellipse class="cur__eye"/>`)}${range(2, () => `<circle class="cur__pupil"/>`)}</g>
  <path class="cur__bubble"/>
  <path class="cur__spray"/>
</svg>`;
  const svg = mount.firstElementChild;
  const q = (s) => svg.querySelector(s);
  const qa = (s) => [...svg.querySelectorAll(s)];
  const inkPath = q(".cur__ink"), bubblePath = q(".cur__bubble"), sprayPath = q(".cur__spray"), sinkPath = q(".cur__sink");
  const eyesG = q(".cur__eyes"), eyeEls = qa(".cur__eye"), pupilEls = qa(".cur__pupil");
  const splatEls = qa(".cur__splat").map((g, i) => ({
    g, halo: g.firstElementChild, blot: g.lastElementChild,
    turb: svg.querySelector(`#cur-bleed${i} feTurbulence`), disp: svg.querySelector(`#cur-bleed${i} feDisplacementMap`),
  }));

  // ---------- state ----------
  const P = { x: innerWidth / 2, y: innerHeight / 2 };
  let active = false, down = false;
  let mode = "ink", want = "ink", leaveAt = 0;
  // hoverDirty: 1 = a pointer event named the target, classify it again; 2 = the page scrolled under a still pointer,
  // so measure() has to find the target first. hit is the clickable under the bubble, hitRect its rect, rectOf the
  // element hitRect was measured for.
  let hoverEl = null, hoverDirty = 1, hit = null, hitRect = null, rectOf = null, lastSY = scroll.y;
  let readAt = -1e4, measureQueued = false, broken = false;
  const head = { x: P.x, y: P.y, vx: 0, vy: 0, st: S(1), ang: 0 };
  const tail = TAIL.map((d) => ({ ...d, x: P.x, y: P.y, vx: 0, vy: 0, st: S(1), ang: 0 }));
  const inkS = S(0), press = S(1), full = S(1), bub = S(0), bR = S(20), turn = S(0);
  const wobH = [S(), S(), S(), S()];
  const wobB = [S(), S(), S(), S(), S(), S()];
  const bc = { x: P.x, y: P.y, vx: 0, vy: 0 };
  let idle = 0, nextDrip = 1.6, dripLoss = 0;
  const drip = { ph: 0, t: 0, d: 0, v: 0, fall: false };
  const sats = [], splats = [], spray = [];
  let sinker = null;                 // a drip that fell off and is sinking away
  let pop = 0, lastBubbleSfx = 0, inkSince = 0, wantSince = 0;
  let eyesUntil = 0, blinkAt = 0, eyesOn = false;
  let swapUntil = 0, swapCheck = 0, aim = null;
  let foreign = { x: -1e4, y: -1e4, at: -1e4 };
  const kicks = [];
  let pointerSel = "";
  const shown = { ink: false, bubble: false, spray: false };

  // ---------- what is under the pointer ----------
  // Clickable things are links and buttons, anything with data-cursor="bubble", and any element whose CSS
  // (any module's stylesheet) gives it cursor: pointer. The stylesheet scan keeps other modules hands-off.
  function scanPointerRules() {
    const sels = [];
    const visit = (rules) => {
      for (const r of rules) {
        const c = r.style?.cursor;
        if (r.selectorText && (c === "pointer" || c === "grab" || c === "zoom-in")) {
          const sel = r.selectorText.replace(/::?(before|after|marker|placeholder|selection|backdrop|first-line|first-letter|file-selector-button)\b/g, "").trim();
          try { if (sel) { document.createDocumentFragment().querySelector(sel); sels.push(sel); } } catch { /* nested or exotic selector */ }
        }
        if (r.cssRules) visit(r.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try { visit(sheet.cssRules); } catch { /* cross-origin font sheet */ }
    }
    pointerSel = sels.join(",");
  }
  scanPointerRules();
  addEventListener("load", scanPointerRules, { once: true });
  bus.on("ready", () => { scanPointerRules(); setTimeout(scanPointerRules, 2500); });

  function classify(el) {
    if (!el || el.nodeType !== 1) return { mode: "ink", el: null };
    for (let n = el; n && n !== root; n = n.parentElement) {
      const dc = n.dataset?.cursor;
      if (dc) return { mode: dc === "bubble" || dc === "none" || dc === "native" ? dc : "ink", el: n };
    }
    if (el.closest(TEXTY)) return { mode: "native", el: null };
    let h = el.closest(CLICKABLE);
    if (!h && pointerSel) { try { h = el.closest(pointerSel); } catch { pointerSel = ""; } }
    if (!h) for (let n = el; n && n !== root; n = n.parentElement) if (n.style?.cursor === "pointer") { h = n; break; }
    return h ? { mode: "bubble", el: h } : { mode: "ink", el: null };
  }

  // ---------- input ----------
  function teleport(x, y) {
    head.x = x; head.y = y; head.vx = head.vy = 0;
    for (const b of tail) { b.x = x; b.y = y; b.vx = b.vy = 0; }
    bc.x = x; bc.y = y; bc.vx = bc.vy = 0;
  }
  function activate() {
    active = true;
    root.classList.add("ink-cursor");
    teleport(P.x, P.y);
    sats.length = 0; drip.ph = 0; drip.d = 0;
    inkS.x = 0; inkS.v = 0; bub.x = 0; bub.v = 0;
    kickHead(0.14);
  }
  function deactivate() {
    active = false;
    root.classList.remove("ink-cursor");
    down = false;
    kicks.length = 0;
  }

  addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") { if (active) deactivate(); return; }
    P.x = e.clientX; P.y = e.clientY;
    if (!active) activate();
    if (e.target !== hoverEl || hoverDirty === 2) { hoverEl = e.target; hoverDirty = 1; }
  }, { passive: true });
  // the page (or a scroller in it) moved under a still pointer: flag it, and measure() finds the new target
  addEventListener("scroll", () => { if (active) hoverDirty = 2; }, { passive: true, capture: true });

  addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") { if (active) deactivate(); return; }
    P.x = e.clientX; P.y = e.clientY;
    if (!active) activate();
    if (e.button !== 0) return;
    down = true;
    hoverEl = e.target; hoverDirty = 1;
    const m = classify(e.target).mode;
    if (m === "bubble") { popBubble(); emitRipple(P.x, P.y, 0.35); }
    else if (m === "ink") { splash(); emitRipple(P.x, P.y, 0.55); }
  }, { passive: true });
  addEventListener("pointerup", () => { down = false; }, { passive: true });
  addEventListener("pointercancel", () => { down = false; }, { passive: true });
  root.addEventListener("mouseleave", deactivate);

  function emitRipple(x, y, strength) {
    // another module (the jelly's poke) may already have rippled this exact spot
    if (performance.now() - foreign.at < 140 && Math.hypot(foreign.x - x, foreign.y - y) < 48) return;
    bus.emit("ripple", { x, y, strength, source: "cursor" });
  }

  function kickHead(amt) { for (const m of wobH) m.v += rnd(-1, 1) * amt * 22; }
  function kickBubble(amt) { for (let i = 0; i < wobB.length; i++) wobB[i].v += rnd(-1, 1) * amt * (i < 2 ? 12 : 17); }

  // the drop splits in three for a moment and leaves a splat in the water
  function splash() {
    const a = rnd(0, TAU);
    for (const da of [0, rnd(2.1, 2.7)]) {
      const sp = rnd(300, 360);
      sats.push({ x: P.x, y: P.y, vx: Math.cos(a + da) * sp, vy: Math.sin(a + da) * sp, r: rnd(3.8, 4.5), age: 0 });
    }
    press.v -= 4;
    kickHead(0.12);
    addSplat(P.x, P.y);
  }

  function addSplat(x, y) {
    let slot = 0;
    while (slot < SLOTS && splats.some((s) => s.slot === slot)) slot++;
    if (slot === SLOTS) slot = splats.shift().slot;
    const seed = (Math.random() * 1e9) | 0;
    const r = mulberry32(seed);
    // rounded tendrils with bulbs at their tips, droplets thrown a little further out
    // the throw has a direction: tendrils cluster on one side and run longer there
    const K = 5 + ((r() * 4) | 0), lean = r() * TAU;
    const tend = Array.from({ length: K }, () => {
      const ta = lean + (r() - 0.5) * (r() < 0.6 ? 2.4 : TAU);
      const near = Math.cos(ta - lean) * 0.5 + 0.5;
      return { a: ta, len: 0.12 + r() * (0.25 + 0.45 * near), w: 0.09 + r() * 0.1 };
    });
    const drops = tend.filter(() => r() < 0.55).map((t) => ({
      a: t.a + (r() - 0.5) * 0.35, d: 1.32 + t.len + r() * 0.55, r: 0.06 + r() * 0.07, sx: 1.3 + r() * 0.6,
    }));
    splats.push({ slot, x, y, R: rnd(10, 12.5), ph: r() * 10, tend, drops, age: 0 });
    const el = splatEls[slot];
    el.turb.setAttribute("seed", String(seed % 997));
    el.g.removeAttribute("display");
  }

  function popBubble() {
    if (bub.x < 0.3) return;
    const R = bR.x * bub.x;
    for (let i = 0; i < 9; i++) {
      const th = (i / 9) * TAU + rnd(-0.25, 0.25), sp = rnd(80, 190);
      spray.push({ x: bc.x + Math.cos(th) * R, y: bc.y + Math.sin(th) * R, vx: Math.cos(th) * sp + bc.vx * 0.3, vy: Math.sin(th) * sp + bc.vy * 0.3, r: rnd(1.1, 2.3), life: rnd(0.35, 0.62), age: 0 });
    }
    pop = 0.001;
  }

  // ---------- bus ----------
  bus.on("ripple", (r) => {
    if (!r || r.source === "cursor") return;
    foreign = { x: r.x, y: r.y, at: performance.now() };
    // the ring of water reaches the droplet a moment later and shakes it
    const d = Math.hypot(r.x - head.x, r.y - head.y);
    if (active && d < 700) kicks.push({ at: performance.now() + (d / 300) * 1000, amt: 0.1 * (r.strength ?? 0.5) * (1 - d / 700) });
  });
  bus.on("egg", (e) => { if (e?.type === "brains") { eyesUntil = performance.now() + 10000; kickHead(0.1); } });
  bus.on("brain:swap:start", () => { swapUntil = performance.now() + 6400; swapCheck = 0; kickHead(0.08); });
  bus.on("brain:swap:done", () => { swapUntil = 0; });

  // ---------- layout reads ----------
  // classify() only walks the DOM; the rects and the hit test below are the module's only layout reads.
  function reclassify(now) {
    hoverDirty = 0;
    const c = classify(hoverEl);
    if (c.mode !== want) wantSince = now;
    want = c.mode;
    const h = want === "bubble" ? c.el : null;
    if (h !== hit) { hit = h; hitRect = null; if (!h) rectOf = null; }   // the old target's rect is no use
  }

  const needsMeasure = (now) => active && (hoverDirty === 2 || rectOf !== hit || (now < swapUntil && now > swapCheck));

  function measure() {
    if (broken || !active) return;
    const now = performance.now();
    if (hoverDirty === 2) {
      hoverEl = document.elementFromPoint(P.x, P.y);
      reclassify(now);
      rectOf = null;                 // whatever we hover moved with the page
    }
    if (rectOf !== hit) {
      rectOf = hit;
      hitRect = hit ? hit.getBoundingClientRect() : null;
      // bubble size follows the target's height; the bubble leans a little toward small targets
      if (hitRect) bR.target = clamp(10 + hitRect.height * 0.32, 17, 26);
    }
    if (now < swapUntil && now > swapCheck) {
      swapCheck = now + 400;
      const r = document.getElementById("hero-jelly")?.getBoundingClientRect();
      aim = r && r.width && r.bottom > 0 && r.top < innerHeight ? { x: r.left + r.width / 2, y: r.top + r.height * 0.36 } : null;
    }
  }
  const safeMeasure = () => { try { measure(); } catch (err) { fail(err); } };
  // the runtime's read phase, when it has one, runs before any module writes
  if (typeof loop.read === "function") loop.read(() => { readAt = performance.now(); safeMeasure(); });
  // otherwise: a task queued from the frame runs after the frame is painted, while layout is still clean
  const queuedMeasure = () => { measureQueued = false; safeMeasure(); };
  function measureSoon() {
    if (measureQueued) return;
    measureQueued = true;
    setTimeout(queuedMeasure, 0);
  }

  // ---------- per frame ----------
  function updateHover(now) {
    if (hoverDirty === 1) reclassify(now);     // 2 waits for measure() to find the target
    if (want === mode) { leaveAt = 0; return; }
    const sp = Math.hypot(head.vx, head.vy);
    if (want === "bubble" && sp > 1100 && now - wantSince < 120) return;   // just flying over it
    if (mode === "bubble" && sp < 700) {        // sliding between neighbouring links keeps one bubble
      if (!leaveAt) leaveAt = now + 70;
      if (now < leaveAt) return;
    }
    leaveAt = 0;
    if (want === "bubble") {
      kickBubble(0.1);
      if (now - lastBubbleSfx > 450 && now - inkSince > 900) bus.emit("sfx", { name: "bubble" });
      lastBubbleSfx = now;
      if (bub.x < 0.05) { bc.x = P.x; bc.y = P.y; bc.vx = bc.vy = 0; }
    }
    if (want === "ink") inkSince = now;
    mode = want;
  }

  function simulate(t, dt, now) {
    const hsp0 = Math.hypot(head.vx, head.vy);
    // the head sits exactly on the pointer; its velocity is smoothed for squash and stretch
    const k = 1 - Math.exp(-dt / 0.04);
    head.vx += ((P.x - head.x) / dt - head.vx) * k;
    head.vy += ((P.y - head.y) / dt - head.vy) * k;
    head.x = P.x; head.y = P.y;
    const hsp = Math.hypot(head.vx, head.vy);

    // resting: breathe, then drip now and then, then fall asleep
    idle = hsp < 14 && !down && mode === "ink" ? idle + dt : 0;
    if (idle === 0) nextDrip = Math.min(nextDrip, 1.6);
    if (!drip.ph && idle > nextDrip && idle < 24 && inkS.x > 0.9) {
      drip.ph = 1; drip.t = 0; drip.d = 0; drip.v = 0; drip.fall = Math.random() < 0.34;
      nextDrip = idle + rnd(6.5, 9.5);
    }
    if (drip.ph && idle === 0 && drip.ph !== 3) drip.ph = 2;       // moved: suck it back in

    // the brain swap: the droplet turns toward Turri (measure() finds where Turri is)
    let ax = 0, ay = 0;
    if (now >= swapUntil) aim = null;
    const turnT = aim ? 1 : 0;
    if (aim) {
      const dx = aim.x - head.x, dy = aim.y - head.y, d = Math.hypot(dx, dy) || 1;
      const f = clamp((d - 40) / 120, 0, 1);
      ax = (-dx / d) * f; ay = (-dy / d) * f;
    }

    // timed kicks from passing ripples
    for (let i = kicks.length - 1; i >= 0; i--) if (now >= kicks[i].at) { kickHead(kicks[i].amt); kicks.splice(i, 1); }

    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    const inkT = mode === "ink" ? 1 : 0;
    const spread = clamp(Math.hypot(tail[3].x - head.x, tail[3].y - head.y) / 55, 0, 1);
    dripLoss *= Math.exp(-dt / 1.6);
    const fullT = 1 + 0.13 * (1 - spread) - 0.06 * spread - dripLoss + (drip.ph === 1 ? -0.03 : 0);
    for (let s = 0; s < n; s++) {
      spring(turn, turnT, TAU * 1.2, 0.9, h);
      let prev = head;
      for (let i = 0; i < tail.length; i++) {
        const b = tail[i], w = b.hz * TAU, L = 5.2 * turn.x;
        const tx = prev.x + ax * L, ty = prev.y + ay * L;
        b.vx += (w * w * (tx - b.x) - 2 * b.z * w * b.vx) * h;
        b.vy += (w * w * (ty - b.y) - 2 * b.z * w * b.vy) * h;
        b.x += b.vx * h; b.y += b.vy * h;
        const dx = b.x - prev.x, dy = b.y - prev.y, d = Math.hypot(dx, dy);
        if (d > b.link) {                               // a rope: the tail never strings out too far
          const nx = dx / d, ny = dy / d;
          b.x = prev.x + nx * b.link; b.y = prev.y + ny * b.link;
          const rv = (b.vx - prev.vx) * nx + (b.vy - prev.vy) * ny;
          if (rv > 0) { b.vx -= rv * nx; b.vy -= rv * ny; }
        }
        prev = b;
      }
      spring(head.st, 1 + Math.min(0.42, Math.hypot(head.vx, head.vy) / 2000), TAU * 4.6, 0.3, h);
      for (const b of tail) spring(b.st, 1 + Math.min(0.7, Math.hypot(b.vx, b.vy) / 1400), TAU * 4.2, 0.32, h);
      spring(full, fullT, TAU * 3.1, 0.33, h);
      spring(press, down && mode === "ink" ? 0.8 : 1, TAU * 4.4, 0.36, h);
      if (inkT) spring(inkS, 1, TAU * 3.4, 0.4, h); else spring(inkS, 0, TAU * 7, 1, h);
      for (let i = 0; i < 4; i++) spring(wobH[i], 0, TAU * (i < 2 ? 3.9 : 5.6), 0.16, h);

      // bubble: size, centre and its wobble modes
      if (mode === "bubble" && !pop) spring(bub, 1, TAU * 3.1, 0.34, h); else if (!pop) spring(bub, 0, TAU * 6.5, 1, h);
      spring(bR, bR.target ?? 20, TAU * 3, 0.5, h);
      let gx = P.x, gy = P.y;
      if (hitRect && mode === "bubble" && hitRect.width < 260 && hitRect.height < 120) {
        const ox = hitRect.left + hitRect.width / 2 - P.x, oy = hitRect.top + hitRect.height / 2 - P.y;
        gx += clamp(ox * 0.22, -9, 9); gy += clamp(oy * 0.3, -7, 7);
      }
      if (mode === "bubble") {
        const bw = TAU * 9;
        bc.vx += (bw * bw * (gx - bc.x) - 2 * 0.8 * bw * bc.vx) * h;
        bc.vy += (bw * bw * (gy - bc.y) - 2 * 0.8 * bw * bc.vy) * h;
      } else { bc.vx *= 1 - 12 * h; bc.vy *= 1 - 12 * h; }
      bc.x += bc.vx * h; bc.y += bc.vy * h;
      const bsp = Math.hypot(bc.vx, bc.vy), e = clamp(bsp / 3000, 0, 0.08), phi = Math.atan2(bc.vy, bc.vx);
      // a moving bubble flattens against the water ahead of it
      spring(wobB[0], -e * Math.cos(2 * phi), TAU * 3, 0.17, h);
      spring(wobB[1], -e * Math.sin(2 * phi), TAU * 3, 0.17, h);
      for (let i = 2; i < 6; i++) spring(wobB[i], 0, TAU * (i < 4 ? 4.3 : 5.7), 0.15, h);

      for (const sat of sats) {
        const sw = TAU * 4.6;
        sat.vx += (sw * sw * (head.x - sat.x) - 2 * 0.42 * sw * sat.vx) * h;
        sat.vy += (sw * sw * (head.y - sat.y) - 2 * 0.42 * sw * sat.vy) * h;
        sat.x += sat.vx * h; sat.y += sat.vy * h;
      }
    }
    for (let i = sats.length - 1; i >= 0; i--) if ((sats[i].age += dt) > 0.9) sats.splice(i, 1);

    // stretch direction follows velocity; an ellipse is the same turned by half a turn, so take the short way
    for (const b of [head, ...tail]) {
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 25) {
        let d = Math.atan2(b.vy, b.vx) - b.ang;
        d -= Math.PI * Math.round(d / Math.PI);
        b.ang += d * (1 - Math.exp(-dt / 0.05));
      }
    }

    // a sudden stop throws a little wobble into the head
    if (hsp0 - hsp > 900 * dt * 6 && hsp0 > 600) kickHead(0.03);

    // drip: sag, hold, then snap back or fall
    if (drip.ph === 1) {
      drip.t += dt;
      drip.d = 12 * sstep(clamp(drip.t / 1.25, 0, 1));
      if (drip.t > 1.5) drip.ph = drip.fall ? 3 : 2;
    } else if (drip.ph === 2) {
      const s = { x: drip.d, v: drip.v };
      spring(s, -1.5, TAU * 2.6, 0.5, dt);
      drip.d = s.x; drip.v = s.v;
      if (drip.d < -0.6) { drip.ph = 0; drip.d = 0; drip.v = 0; wobH[0].v += 2.2; wobH[1].v += 0.6; }
    } else if (drip.ph === 3) {
      drip.v = Math.min(46, drip.v + 34 * dt);
      drip.d += drip.v * dt;
      if (drip.d > 24) {
        // it leaves the goo and sinks on its own, dissolving
        const hr = HEAD * full.x;
        sinker = { x: head.x, y: head.y + hr * 0.42 + drip.d, vy: drip.v, r: 3.3, age: 0, life: 1.7 };
        drip.ph = 0; drip.d = 0; drip.v = 0;
        dripLoss = 0.08; wobH[0].v += 1.6;
      }
    }

    // pop: the ring snaps outward and vanishes, then a fresh bubble grows if we're still on the link
    if (pop) {
      pop += dt;
      if (pop > 0.17) { pop = 0; bub.x = 0.18; bub.v = 0; kickBubble(0.12); }
    }
  }

  // ---------- drawing ----------
  function drawInk(t) {
    const s = Math.max(0, inkS.x);
    if (s < 0.02 && !sats.length) {
      if (shown.ink) { inkPath.setAttribute("d", ""); shown.ink = false; }
      return;
    }
    const o = [];
    const calm = sstep(clamp((idle - 0.6) / 1.5, 0, 1));
    const sleepy = sstep(clamp((idle - 20) / 6, 0, 1));
    const breathe = 1 + (0.04 - 0.02 * sleepy) * Math.sin((t * TAU) / (3.2 + 2 * sleepy)) * calm;
    const hr = HEAD * full.x * press.x * s * breathe;
    const hs = head.st.x;
    blob(o, head.x, head.y, hr, hs, 1 / Math.sqrt(hs), head.ang, 26, wobH, t);
    for (const b of tail) {
      const ts = b.st.x;
      blob(o, b.x, b.y, b.r * s * (0.86 + 0.14 * full.x), ts, 1 / Math.sqrt(ts), b.ang, 14, null, t);
    }
    if (drip.ph && s > 0.5) {
      const dd = Math.max(0, drip.d), dr = (3.6 + 1.4 * clamp(dd / 12, 0, 1)) * s;
      blob(o, head.x, head.y + hr * 0.42 + dd, dr, 1 + dd / 34, 1, Math.PI / 2, 12, null, t);
    }
    for (const q2 of sats) blob(o, q2.x, q2.y, q2.r * Math.max(s, 0.6) * (1 - q2.age * 0.3), 1, 1, 0, 12, null, t);
    inkPath.setAttribute("d", o.join(""));
    shown.ink = true;
  }

  function drawBubble(t) {
    const s = Math.max(0, bub.x);
    if (s < 0.015 && !pop) {
      if (shown.bubble) { bubblePath.setAttribute("d", ""); shown.bubble = false; }
      return;
    }
    const pk = pop ? clamp(pop / 0.17, 0, 1) : 0;
    const R = bR.x * s * (1 + 0.022 * Math.sin(t * 2.3)) * (1 + 0.4 * pk);
    const k = (R / 21) * (1 - pk * 0.6);
    const o = [];
    // the rim: a brush ring, heaviest at the lower right, open at the upper left where the light hits
    arc(o, bc.x, bc.y, R, wobB, -1.9, TAU - 0.7, 56, (u) => k * (0.55 + 3.4 * Math.pow(Math.sin(Math.PI * u), 1.25)));
    // the glint: a short crescent inside the opening, like the bell's
    arc(o, bc.x, bc.y, R, wobB, -2.72, 0.8, 14, (u) => k * (0.4 + 2.4 * Math.sin(Math.PI * u)), 0.66);
    bubblePath.setAttribute("d", o.join(""));
    bubblePath.setAttribute("opacity", pk ? n1(1 - pk) : "1");
    shown.bubble = true;
  }

  function drawFx(t, dt, dy) {
    // splats: grow fast, then bleed into the water and fade
    for (let i = splats.length - 1; i >= 0; i--) {
      const sp = splats[i];
      sp.age += dt;
      sp.y -= dy;
      const el = splatEls[sp.slot];
      if (sp.age > 1.6) { el.g.setAttribute("display", "none"); splats.splice(i, 1); continue; }
      const g = 1 - Math.pow(1 - clamp(sp.age / 0.3, 0, 1), 3);
      const k = clamp((sp.age - 0.32) / 1.28, 0, 1);
      const o = [];
      splatShape(o, sp, g, 1 + 0.1 * k, 6 * k);
      el.blot.setAttribute("d", o.join(""));
      // once it lands, the ink bleeds outward into the water around it
      const oh = [];
      if (k > 0) splatShape(oh, sp, 1, 1.1 + 0.6 * sstep(k), 6 * k, true);
      el.halo.setAttribute("d", oh.join(""));
      el.halo.setAttribute("fill-opacity", n1(0.24 * Math.sin(Math.PI * Math.min(1, k * 1.4))));
      el.g.setAttribute("opacity", (0.8 * (1 - Math.pow(k, 1.3))).toFixed(3));
      el.disp.setAttribute("scale", n1(1.4 + 9 * k));
    }

    // a fallen drip sinks, slows, swells a little and dissolves
    if (sinker) {
      const m = sinker;
      m.age += dt;
      m.vy = Math.max(12, m.vy * Math.exp(-dt * 0.9));
      m.y += m.vy * dt - dy;
      const k = m.age / m.life;
      if (k >= 1) { sinker = null; sinkPath.setAttribute("d", ""); }
      else {
        const o = [];
        const st = 1.35 - 0.3 * k;
        blob(o, m.x, m.y, m.r * (1 + 0.5 * k), 1 / st, st, 0, 12, null, t);
        sinkPath.setAttribute("d", o.join(""));
        sinkPath.setAttribute("opacity", (Math.pow(1 - k, 1.4) * 0.95).toFixed(3));
      }
    }

    // cream spray from a popped bubble
    if (spray.length || shown.spray) {
      const o = [];
      for (let i = spray.length - 1; i >= 0; i--) {
        const p = spray[i];
        p.age += dt;
        if (p.age > p.life) { spray.splice(i, 1); continue; }
        const drag = Math.exp(-dt * 7);
        p.vx *= drag; p.vy = p.vy * drag + 30 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt - dy;
        const k = p.age / p.life;
        blob(o, p.x, p.y, p.r * (1 - k * k), 1.3, 0.8, Math.atan2(p.vy, p.vx), 8, null, t);
      }
      sprayPath.setAttribute("d", o.join(""));
      shown.spray = spray.length > 0;
    }
  }

  // the splat outline: a blot with tendrils plus satellite droplets thrown past their tips
  function splatShape(o, sp, g, scale, sink, haloOnly) {
    const E = (0.22 + 0.78 * (1 - Math.pow(2, -8 * g))) * scale;   // blooms from the drop's own size
    const grow = Math.max(0, g * 1.4 - 0.4);
    const N = 88, R = sp.R, cy = sp.y + sink;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      let r = 1 + 0.07 * Math.sin(3 * a + sp.ph) + 0.05 * Math.sin(7 * a + 2 * sp.ph) + 0.025 * Math.sin(13 * a + 3 * sp.ph);
      for (const td of sp.tend) {
        let d = a - td.a;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        r += td.len * Math.exp(-(d * d) / (2 * td.w * td.w)) * grow * (haloOnly ? 0.6 : 1);
      }
      const rr = r * R * E;
      o.push(i ? "L" : "M", n1(sp.x + Math.cos(a) * rr), " ", n1(cy + Math.sin(a) * rr));
    }
    o.push("Z");
    if (haloOnly) return;
    // bulbs at the tendril tips
    for (const td of sp.tend) {
      if (td.len < 0.22) continue;
      const tip = (1 + td.len * grow * 0.9) * R * E, br = (0.07 + td.w * 0.55) * R * E * Math.min(1, grow * 1.5);
      if (br > 0.4) blob(o, sp.x + Math.cos(td.a) * tip, cy + Math.sin(td.a) * tip, br, 1.15, 1, td.a, 10, null, 0);
    }
    if (g < 0.45) return;
    const k = sstep(clamp((g - 0.45) / 0.55, 0, 1));
    for (const dr of sp.drops) {
      const dist = dr.d * R * E;
      blob(o, sp.x + Math.cos(dr.a) * dist, cy + Math.sin(dr.a) * dist, dr.r * R * k * scale, dr.sx, 1 / dr.sx, dr.a, 9, null, 0);
    }
  }

  function drawEyes(t, now) {
    const on = now < eyesUntil && inkS.x > 0.4;
    if (on !== eyesOn) { eyesOn = on; eyesG.setAttribute("display", on ? "inline" : "none"); }
    if (!on) return;
    if (now > blinkAt + 140) blinkAt = now + rnd(1800, 4200);
    const blink = now > blinkAt ? 0.12 : 1;
    const sp = Math.hypot(head.vx, head.vy);
    const lx = sp > 40 ? head.vx / sp : 0, ly = sp > 40 ? head.vy / sp : 1;
    const s = HEAD * full.x * press.x * inkS.x / HEAD;
    for (let i = 0; i < 2; i++) {
      const ex = head.x + (i ? 3.4 : -3.4) * s, ey = head.y - 1.2 * s;
      eyeEls[i].setAttribute("cx", n1(ex)); eyeEls[i].setAttribute("cy", n1(ey));
      eyeEls[i].setAttribute("rx", n1(2.5 * s)); eyeEls[i].setAttribute("ry", n1(2.8 * s * blink));
      pupilEls[i].setAttribute("cx", n1(ex + lx * 1.05 * s)); pupilEls[i].setAttribute("cy", n1(ey + ly * 1.1 * s * blink));
      pupilEls[i].setAttribute("r", n1(1.2 * s * (blink < 1 ? 0.5 : 1)));
    }
  }

  if (ctx.params.has("debug")) window.__cursor = { classify, get pointerSel() { return pointerSel; }, get mode() { return mode; } };

  function fail(err) {
    // never leave the visitor without a pointer
    broken = true;
    deactivate();
    console.warn("[cursor]", err);
  }

  loop.add((t, dt) => {
    if (broken) return;
    try {
      // scrolling moves the water past us: ink left in it rides along (kept current even while idle)
      const dy = scroll.y - lastSY;
      lastSY = scroll.y;
      if (!active && !splats.length && !spray.length && !sinker) return;
      const now = performance.now();
      dt = Math.max(dt, 1 / 240);
      if (active) { updateHover(now); simulate(t, dt, now); }
      drawInk(t);
      drawBubble(t);
      drawFx(t, dt, dy);
      drawEyes(t, now);
      // no read phase has run lately: measure once this frame is painted
      if (now - readAt > 100 && needsMeasure(now)) measureSoon();
    } catch (err) { fail(err); }
  });
}
