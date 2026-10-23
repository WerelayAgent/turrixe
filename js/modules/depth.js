// depth: the dive. Scroll is depth.
// - Mixes the water (--bg) from field through deep to abyss in OKLab and flips --fg to cream once ink stops reading.
// - Desktop: a sounding line hangs down the right edge: an inked line with brush ticks, section knots and names
//   you can click. A tiny Turri rides it as the depth marker, beside an odometer readout ("−1,240 m").
// - Phones (the top bar's own breakpoint): no line over the text. A compact readout sits in the empty middle of
//   the top bar with a little plumb line, and a tap drops a chart of the dive (depth/mini.js).
// - Faint light shafts from the surface sway, shimmer on ripples and fade as you sink.
// Budget: the water is painted on its own fixed layer every frame; the shared vars on :root (--bg, --fg) restyle the
// whole page when written, so they change only in coarse steps or once the dive settles, and --fg flips once (CSS fades it).
// Nothing in the loop reads layout: scroll comes from ctx.scroll, page height and section tops are cached on resize.
import { createWaterColor, rampAt, hexToRgb, css, hex } from "./depth/color.js";
import { createDiver, ribbon } from "./depth/diver.js";
import { createShafts } from "./depth/shafts.js";
import { odometerHTML, createOdometer } from "./depth/odometer.js";
import { createHere } from "./depth/here.js";
import { createMini } from "./depth/mini.js";
import { live } from "../core/live.js";

const NAMES = { surface: "Surface", thinking: "Thinking", tentacles: "Tentacles", journal: "Journal", others: "Others", how: "How", abyss: "Abyss" };
const MINUS = "−";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fmt = (m) => Math.round(m).toLocaleString("en-US");
const mText = (m) => `${m ? MINUS + fmt(m) : "0"} m`;

export function init(ctx) {
  const { bus, loop, pointer, scroll, ink, assets, reduced, params } = ctx;
  const mount = document.getElementById("depth");
  if (!mount) return;
  mount.removeAttribute("aria-hidden");
  const root = document.documentElement;

  // ---------- palette from the tokens (fallback: jelly.json) ----------
  const cs = getComputedStyle(root);
  const tok = (name, fb) => hexToRgb(cs.getPropertyValue(name).trim() || fb);
  const pal = assets.jelly?.palette ?? {};
  const palette = {
    field: tok("--field", pal.field || "#8b63f5"),
    deep: tok("--deep", pal.deep || "#5d3fc9"),
    abyss: tok("--abyss", pal.abyss || "#1d1146"),
    ink: tok("--ink", pal.ink || "#0b0b0b"),
    cream: tok("--cream", pal.cream || "#fdf1d8"),
  };
  const water = createWaterColor(palette);
  const INK = css(palette.ink), CREAM = css(palette.cream);

  // ---------- DOM ----------
  const waterEl = document.createElement("div");
  waterEl.className = "depth__water";
  waterEl.setAttribute("aria-hidden", "true");
  mount.appendChild(waterEl);
  root.classList.add("depth-live");

  const shafts = createShafts(mount, { ink, reduced });

  const gauge = document.createElement("div");
  gauge.className = "depth__gauge";
  gauge.innerHTML = `
    <canvas class="depth__ink" aria-hidden="true"></canvas>
    <nav class="depth__nav" aria-label="Depth gauge"></nav>
    <div class="depth__readout" aria-hidden="true">
      ${odometerHTML()}
      <span class="depth__here"><span class="depth__here-t"></span></span>
    </div>
    <div class="depth__probe" aria-hidden="true"><span class="depth__probe-m"></span><span class="depth__probe-name"></span></div>
    <div class="depth__hit" aria-hidden="true"></div>`;
  mount.appendChild(gauge);
  const cv = gauge.querySelector(".depth__ink");
  const g = cv.getContext("2d");
  const nav = gauge.querySelector(".depth__nav");
  const readout = gauge.querySelector(".depth__readout");
  const odo = createOdometer(readout);
  const hereName = createHere(gauge.querySelector(".depth__here-t"), reduced);
  const probe = gauge.querySelector(".depth__probe");
  const probeM = gauge.querySelector(".depth__probe-m");
  const probeName = gauge.querySelector(".depth__probe-name");
  const hit = gauge.querySelector(".depth__hit");

  const diver = createDiver({ jelly: assets.jelly, ink, reduced });

  // phones: the compact readout in the top bar and its chart of the dive
  let miniOpenY = 0;
  const mini = createMini({
    mount, ink, reduced, cream: palette.cream,
    onPick: (i) => { if (secs[i]) jumpTo(secs[i]); },
    onToggle: (v) => { if (v) { miniOpenY = scrollTop(); bus.emit("sfx", { name: "bubble" }); } },
  });

  // ---------- sections and geometry ----------
  let secs = [];            // [{id, el, depth, top}]
  let labels = [];          // [{el, depth, y, near}]
  let maxDepth = 4000;
  let W = 0, H = 0, dpr = 1, gw = 200, edge = 28, top0 = 98, bottom0 = 750, lineX = 172, mobile = false, room = false, gaugeLeft = 0;
  let diverPx = 42, bowMax = 7, roPx = 58;
  let maxScroll = 0; // cached: reading scrollHeight in the loop would force a layout every frame
  // compact mode follows the top bar: once its section links fold away (base.css), the gauge moves into the bar
  const compactMQ = matchMedia("(max-width: 720px)");

  function readSections() {
    const els = [...document.querySelectorAll("main > .sec")];
    secs = els.map((el) => ({ id: el.id, el, depth: Number(el.dataset.depth || 0), top: 0 }));
    maxDepth = Math.max(1, ...secs.map((s) => s.depth));
    nav.innerHTML = "";
    labels = secs.map((s, i) => {
      const a = document.createElement("a");
      a.className = "depth__label";
      a.href = `#${s.id}`;
      a.style.setProperty("--i", i);
      a.innerHTML = `<span class="depth__name">${NAMES[s.id] ?? s.id}</span><span class="depth__m">${mText(s.depth)}</span>`;
      a.addEventListener("click", (e) => { e.preventDefault(); jumpTo(s); });
      nav.appendChild(a);
      return { el: a, depth: s.depth, y: 0, near: 1 };
    });
    mini.setSections(secs.map((s) => ({ id: s.id, name: NAMES[s.id] ?? s.id, m: mText(s.depth) })));
  }

  // section tops and the page height, read only on resize (never in the loop)
  function measureTops() {
    const y0 = scrollY;
    maxScroll = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    for (const s of secs) s.top = s.el.getBoundingClientRect().top + y0;
    // the last sections may never reach the top of the view: pull their marks back to the bottom of the page,
    // so the very end of the scroll reads the abyss exactly
    for (let i = secs.length - 1, cap = maxScroll; i >= 0; i--, cap -= 1) {
      if (secs[i].top > cap) secs[i].top = Math.max(0, cap);
      cap = Math.min(cap, secs[i].top);
    }
  }

  const yOf = (d) => top0 + (bottom0 - top0) * (d / maxDepth);
  const depthOfY = (y) => clamp(((y - top0) / Math.max(1, bottom0 - top0)) * maxDepth, 0, maxDepth);

  // the top bar, read on resize, once the fonts are in and when its tools change size: the compact readout
  // sits between its mark and its tools. (The mark is not observed: its little name breathes its weight
  // axis all the time, so its box changes every frame; a few px of margin covers that instead.)
  const topbar = document.querySelector(".topbar");
  const markEl = topbar?.querySelector(".topbar__mark");
  const toolsEl = topbar?.querySelector(".topbar__tools");
  function layoutMini() {
    const tb = topbar?.getBoundingClientRect();
    const mk = markEl?.getBoundingClientRect(), tl = toolsEl?.getBoundingClientRect();
    mini.layout({
      W, pixelRatio: devicePixelRatio || 1,
      bar: tb && tb.height ? tb.height : 63,
      markR: mk && mk.width ? mk.right + 6 : 0,
      toolsL: tl && tl.width ? tl.left : W,
    });
  }

  let lastW = -1, lastH = -1, lastMobile = null;
  function layout() {
    const w = innerWidth, h = innerHeight;
    const nextMobile = compactMQ.matches;
    // phones fire resize while the url bar slides; with nothing else changed, the cached tops are all that move
    if (w === lastW && nextMobile === lastMobile && Math.abs(h - lastH) < 160 && mobile) {
      H = h; lastH = h;
      measureTops();
      return;
    }
    lastW = W = w; lastH = H = h;
    mobile = nextMobile;
    dpr = Math.min(2, devicePixelRatio || 1);
    if (mobile !== lastMobile) {
      mount.classList.toggle("is-compact", mobile);
      mini.setActive(mobile);
      if (mobile) { setOpen(false); hoverY = null; gauge.classList.remove("is-hover"); }
      lastMobile = mobile;
    }
    if (mobile) {
      cv.width = cv.height = 1; // the line is not drawn on phones: free its pixels
      layoutMini();
    } else {
      gw = 200;
      edge = 28;
      diverPx = 42;
      bowMax = 7;
      top0 = 98;
      bottom0 = H - 150;
      lineX = gw - edge;
      gaugeLeft = W - gw;
      cv.width = Math.round(gw * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = `${gw}px`; cv.style.height = `${H}px`;
      gauge.style.width = `${gw}px`;
      const secW = Math.min(W, 1320);
      const gut = clamp(W * 0.04, 16, 56);
      room = (W - secW) / 2 + gut >= 112;
      gauge.classList.toggle("has-room", room);
      diver.setScale(diverPx / 554);
      gauge.style.setProperty("--edge", `${edge}px`);
      gauge.style.setProperty("--diver", `${diverPx / 2}px`);
      // the readout sits just left of the diver's bell
      roPx = Math.round(gw - lineX + diverPx / 2 + 9);
      gauge.style.setProperty("--ro", `${roPx}px`);
      for (const l of labels) {
        l.y = yOf(l.depth);
        l.el.style.transform = `translate3d(0, ${l.y.toFixed(1)}px, 0)`;
      }
      hit.style.top = `${top0 - 24}px`;
      hit.style.height = `${bottom0 - top0 + 70}px`;
    }
    measureTops();
    shafts.resize();
  }

  // depth measured at the top of the view: a section reads its own depth the moment it arrives
  function depthAt(y) {
    if (!secs.length) return 0;
    if (y <= secs[0].top) return secs[0].depth;
    for (let i = 1; i < secs.length; i++) {
      if (y < secs[i].top) {
        const a = secs[i - 1], b = secs[i];
        return a.depth + (b.depth - a.depth) * ((y - a.top) / Math.max(1, b.top - a.top));
      }
    }
    return secs[secs.length - 1].depth;
  }
  function yForDepth(d) {
    for (let i = 1; i < secs.length; i++) {
      if (d <= secs[i].depth) {
        const a = secs[i - 1], b = secs[i];
        return a.top + (b.top - a.top) * ((d - a.depth) / Math.max(1, b.depth - a.depth));
      }
    }
    return secs.length ? secs[secs.length - 1].top : 0;
  }
  // ctx.scroll.y is written by core/scroll.js on the scroll event, so the loop never touches window.scrollY.
  // (Until core/scroll.js starts, at "ready", the boot frames read it directly.)
  let scrollLive = false;
  const scrollTop = () => (scrollLive ? scroll.y : scrollY);
  const targetDepth = () => depthAt(scrollTop());
  function scrollToY(y) {
    window.scrollTo({ top: clamp(y, 0, maxScroll), behavior: reduced ? "auto" : "smooth" });
  }
  function jumpTo(s) {
    measureTops();
    scrollToY(s.top);
    bus.emit("sfx", { name: "bubble" });
    setOpen(false);
    mini.setOpen(false);
  }

  // ---------- open / hover (desktop gauge) ----------
  let hoverY = null, hoverAmt = 0, open = false, openAmt = 0, closeTimer = 0;
  function setOpen(v) {
    open = v;
    gauge.classList.toggle("is-open", v);
  }

  readSections();
  layout();
  addEventListener("resize", layout);
  // sections change height as other modules render; re-measure when the body does
  new ResizeObserver(() => measureTops()).observe(document.body);
  // the compact readout keeps clear of the top bar's tools, whatever they grow into, and of the mark once
  // its real font has loaded (layoutMini only writes when the result changes)
  if (topbar) {
    const ro = new ResizeObserver(() => { if (mobile) layoutMini(); });
    for (const el of [topbar, toolsEl]) if (el) ro.observe(el);
    document.fonts?.ready.then(() => { if (mobile) layoutMini(); });
    bus.on("loader:done", () => { if (mobile) layoutMini(); });
  }

  // ---------- state ----------
  const y0 = scrollY; // once, at boot: core/scroll.js has not started yet
  let dSmooth = depthAt(y0), dVel = 0;
  let rSmooth = Math.round(dSmooth / 10) * 10, rVel = 0;
  let here = -1;
  let dark = false;          // text colour on the page: ink or cream, flipped once per crossing
  let kInk = 0, kFrom = 0, kT = 1; // the gauge eases its own ink -> cream (no CSS involved)
  let lastRgb = "", lastVarsAt = -1e9, lastStep = null, lastTarget = dSmooth, settledAt = 0;
  let lastBgHex = "", lastFgHex = "", lastVarsKey = "";
  let rootBg = "", pocketEl = null, pocketBg = ""; // see pushBg and setPocket
  let intro = reduced ? 1 : 0, introOn = reduced, introStart = null;
  let movingUntil = 0, wasMoving = false, bow = 0, lastScrollY = y0, scrollV = 0;
  let diverA = 1, roA = 0, lastRo = "";
  let lastTickSfx = 0;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const STEPS = 24; // quantised water steps per palette stop for the shared vars

  // first paint: colours exactly right, no tween
  {
    const u = rampAt(dSmooth);
    dark = u > 0.44; kInk = kFrom = dark ? 1 : 0;
    lastStep = Math.round(u * STEPS);
    applyVars(water.water(u), 0);
  }

  // --bg. A write to :root restyles every element on the page (custom properties inherit): about 4,000 elements and
  // 10 ms, one or two dropped frames at 120 Hz each time the water steps during a dive. So the live value goes straight
  // to the few elements whose styles use var(--bg), at the same moments and with the same value. :root gets it only at
  // start and on an ink flip (which restyles everything anyway): writing it when a dive settled cost a 10 ms frame at
  // every stop. A consumer created later (a new journal node) gets the live value in the frame it appears. Users of
  // var(--bg), all of them:
  //   .topbar, .depth__chart (background), .th__pocket (the thoughts pocket: an inline colour, see setPocket),
  //   .sw-pip (--jelly-glass), .jr-node__mass (stroke),
  //   #vault --vlt-glass (.vlt-glyph fills), and in JS crowd.js and vault.js (they read live.bg).
  // A new rule that uses var(--bg) must be added to pushBg, or it will lag behind while diving.
  function one(sel) { return document.querySelector(sel); }
  function setBg(el, bg) { if (el && el.style.getPropertyValue("--bg") !== bg) el.style.setProperty("--bg", bg); }
  function pushBg(bg) {
    setBg(one(".topbar"), bg);
    setBg(one(".depth__chart"), bg);
    setBg(one(".sw-pip"), bg);
    for (const el of document.querySelectorAll(".jr-node__mass")) setBg(el, bg);
    const glass = `color-mix(in oklab, var(--field) 86%, ${bg})`;
    for (const el of document.querySelectorAll("#vault .vlt-glyph")) el.style.setProperty("--vlt-glass", glass);
    setPocket(bg);
  }
  // The thoughts pocket is .th__pocket, an empty element of its own: a plain inline colour restyles it alone.
  // (An inline --bg on .th restyled its ~1,400 elements. A live CSS rule for .th::before was cheap in Chrome, but WebKit
  // rebuilds the style of the whole page when any rule is edited: 40 to 60 ms, a dropped frame about three times a
  // second while diving. A custom property on .th that does not inherit left WebKit painting the pocket's old colour.)
  function setPocket(bg) {
    if (!pocketEl?.isConnected) { pocketEl = one(".th__pocket"); pocketBg = ""; }
    if (pocketEl && bg !== pocketBg) { pocketEl.style.backgroundColor = bg; pocketBg = bg; }
  }
  function setRootBg(bg) { if (bg !== rootBg) { root.style.setProperty("--bg", bg); rootBg = bg; } }
  // a journal node is born with :root's --bg: hand it the live water before its first paint (journal adds it in this task)
  bus.on("journal:add", () => requestAnimationFrame(() => { if (live.bg) pushBg(live.bg); }));

  function applyVars(rgb, now) {
    const s = root.style;
    const bg = hex(rgb);
    if (bg !== lastBgHex) {
      live.bg = bg;
      pushBg(bg);
      s.backgroundColor = bg; // overscroll shows the right water (a plain property: restyles :root alone)
      themeMeta?.setAttribute("content", bg);
      lastBgHex = bg;
    }
    if (!rootBg) setRootBg(bg);
    // --fg is set once to its target; base.css and depth.css fade the colour in CSS
    const fg = hex(water.text(dark ? 1 : 0));
    if (fg !== lastFgHex) {
      setRootBg(bg);
      s.setProperty("--fg", fg);
      s.setProperty("--dark", dark ? "1" : "0");
      root.classList.toggle("is-deep", dark);
      lastFgHex = fg;
    }
    lastVarsAt = now;
    lastVarsKey = rgb.join(",");
  }

  const touchy = pointer.touch || matchMedia("(pointer: coarse)").matches;
  hit.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    hoverY = e.clientY;
    clearTimeout(closeTimer);
    if (!room) setOpen(true);
    gauge.classList.add("is-hover");
  });
  const leave = () => {
    hoverY = null;
    gauge.classList.remove("is-hover");
    clearTimeout(closeTimer);
    if (!touchy) closeTimer = setTimeout(() => setOpen(false), 450);
  };
  hit.addEventListener("pointerleave", leave);
  nav.addEventListener("pointerenter", () => { clearTimeout(closeTimer); if (!touchy && !room) setOpen(true); });
  nav.addEventListener("pointerleave", () => { if (!touchy) closeTimer = setTimeout(() => setOpen(false), 450); });
  hit.addEventListener("click", (e) => {
    const r = cv.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY;
    if (Math.hypot(cx - diver.x, cy - diver.y) < diver.radius * 1.25) {
      diver.poke();
      bus.emit("ripple", { x: e.clientX, y: e.clientY, strength: 0.35 });
      bus.emit("sfx", { name: "bubble" });
      return;
    }
    if (e.pointerType === "touch" || (touchy && !open)) { setOpen(!open); return; }
    const d = depthOfY(cy);
    measureTops();
    scrollToY(yForDepth(d));
    bus.emit("sfx", { name: "bubble" });
  });
  nav.addEventListener("focusin", () => setOpen(true));
  nav.addEventListener("focusout", () => { closeTimer = setTimeout(() => setOpen(false), 200); });
  document.addEventListener("pointerdown", (e) => {
    if (open && !gauge.contains(e.target)) setOpen(false);
  }, { passive: true });

  // ---------- events ----------
  const startIntro = () => {
    if (introOn && gauge.classList.contains("is-in")) return;
    introOn = true;
    gauge.classList.add("is-in");
    mini.intro();
    if (!reduced) { gauge.classList.add("is-intro"); setTimeout(() => gauge.classList.remove("is-intro"), 2600); }
  };
  if (reduced || params.has("skipLoader")) startIntro();
  bus.on("loader:done", startIntro);
  bus.on("ready", () => { scrollLive = true; measureTops(); setTimeout(startIntro, 4800); });
  if (reduced) { gauge.classList.add("is-in"); mini.intro(); }
  bus.on("thought", () => diver.think());
  bus.on("brain:swap:start", () => diver.swapStart());
  bus.on("brain:swap:mid", () => diver.swapMid());
  bus.on("brain:swap:done", () => diver.swapDone());
  bus.on("hook:add", () => diver.beat());
  bus.on("hook:remove", () => diver.beat());
  bus.on("ripple", (r) => shafts.ripple(0.35 + 0.65 * (r?.strength ?? 0.5)));
  // the readout surfaces while you move and fades 1.4 s after the scroll stops (when there's no room for it)
  addEventListener("scroll", () => { movingUntil = performance.now() + 1400; }, { passive: true });

  // ---------- drawing helpers ----------
  const knots = secs.map((_, i) => Array.from({ length: 7 }, (_, j) => 0.78 + 0.32 * Math.abs(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453 % 1)));
  let T = 0;
  function ropeX(y) {
    const env = Math.min(1, Math.max(0, y) / 240);
    const sway = reduced ? 0 : env * (1.5 * Math.sin(y * 0.0062 + T * 0.52) + 0.7 * Math.sin(y * 0.019 - T * 0.83 + 1.3));
    return lineX + sway + bow * Math.sin(Math.PI * clamp(y / H, 0, 1));
  }
  function lens(x0, y0, x1, y1, w) {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * w, ny = (dx / l) * w;
    g.moveTo(x0, y0);
    g.quadraticCurveTo(mx + nx, my + ny, x1, y1);
    g.quadraticCurveTo(mx - nx, my - ny, x0, y0);
  }

  function drawGauge(fgRgb, rgb) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fg = css(fgRgb);

    // a patch of clear water behind the names when they open over the page
    if (openAmt > 0.01 && !room) {
      const vw = 150 * openAmt;
      g.beginPath();
      g.moveTo(gw + 2, top0 - 60);
      for (let y = top0 - 60; y <= bottom0 + 60; y += 16) {
        const wob = Math.sin(y * 0.021 + T * 0.9) * 5 + Math.sin(y * 0.057 - T * 1.3) * 2.5;
        g.lineTo(gw - vw + wob * openAmt, y);
      }
      g.lineTo(gw + 2, bottom0 + 60);
      g.closePath();
      g.fillStyle = css(rgb, 0.97 * Math.min(1, openAmt * 1.4));
      g.fill();
    }

    // no room beside the page: while the readout shows, it rides on a small lens of clear water,
    // so the numbers read cleanly over the text instead of tangling with it
    if (!room && roA > 0.01) {
      const cx = gw - roPx - 36, cy = diver.y + 9;
      const rx = 52, ry = 28;
      const kp = [];
      for (let j = 0; j < 10; j++) {
        const a = (j / 10) * Math.PI * 2;
        const r = 1 + 0.06 * Math.sin(3 * a + T * 0.9) + 0.035 * Math.sin(5 * a - T * 1.4 + 1.1);
        kp.push(ink.P(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r));
      }
      const sp = ink.spline(kp, true, 5);
      g.beginPath();
      g.moveTo(sp[0].x, sp[0].y);
      for (let j = 1; j < sp.length; j++) g.lineTo(sp[j].x, sp[j].y);
      g.closePath();
      g.fillStyle = css(rgb, 0.94 * roA);
      g.fill();
    }

    const reach = top0 - 40 + (bottom0 + 110 - (top0 - 40)) * (reduced ? 1 : 1 - (1 - intro) ** 3);
    g.save();
    g.beginPath();
    g.rect(0, -10, gw, reach + 10);
    g.clip();

    // the line, hanging from the surface, ending in a small curl
    const pts = [];
    const yEnd = bottom0 + 66;
    for (let y = -8; y < yEnd; y += 7) pts.push({ x: ropeX(y), y });
    pts.push({ x: ropeX(yEnd), y: yEnd });
    const end = pts[pts.length - 1];
    const curl = ink.spiral(end, Math.PI / 2 + 0.15, 6.5, 1.6, 0.9, 1, 1.5);
    const nMain = pts.length;
    const all = pts.concat(curl.slice(1));
    g.fillStyle = css(fgRgb, 0.92);
    ribbon(g, all, (u) => {
      const i = Math.round(u * (all.length - 1));
      if (i >= nMain) return 1.5 - 0.9 * ((i - nMain) / Math.max(1, all.length - nMain));
      const y = all[i].y;
      return 1.45 + 0.4 * Math.sin(y * 0.031 + 1.7) + 0.25 * Math.sin(y * 0.087 + 0.4);
    });

    // ticks: every 100 m a short nib mark, every 500 m a longer one, magnified near the probe and the diver
    const dy = diver.y;
    g.beginPath();
    const step = 100;
    for (let d = 0; d <= maxDepth; d += step) {
      const y = yOf(d);
      const isSec = secs.some((s) => s.depth === d);
      if (isSec) continue;
      const major = d % 500 === 0;
      let len = 5 * (major ? 1.8 : 1);
      let mag = 1 + 0.55 * Math.exp(-(((y - dy) / 20) ** 2));
      if (hoverY != null) mag += 1.6 * hoverAmt * Math.exp(-(((y - hoverY) / 26) ** 2));
      len *= mag;
      const x0 = ropeX(y) - 0.7;
      lens(x0, y, x0 - len, y + 0.6, (major ? 1.7 : 1.25) * Math.min(1.5, mag));
    }
    g.fill();

    // section marks: longer strokes and a knot on the line; the one you're in is wet cream
    for (let i = 0; i < secs.length; i++) {
      const y = yOf(secs[i].depth);
      const x = ropeX(y);
      let mag = 1 + 0.5 * Math.exp(-(((y - dy) / 20) ** 2));
      if (hoverY != null) mag += 1.2 * hoverAmt * Math.exp(-(((y - hoverY) / 26) ** 2));
      const len = 12 * mag;
      g.beginPath();
      lens(x - 1, y, x - 1 - len, y + 0.8, 2.3);
      g.fillStyle = fg;
      g.fill();
      const kr = 3.1 * (i === here ? 1.25 : 1);
      const ks = knots[i] || knots[0];
      const kp = ks.map((m, j) => {
        const a = (j / ks.length) * Math.PI * 2 + T * 0.3 * (reduced ? 0 : 1);
        return ink.P(x + Math.cos(a) * kr * m, y + Math.sin(a) * kr * m * 0.92);
      });
      const sp = ink.spline(kp, true, 4);
      g.beginPath();
      g.moveTo(sp[0].x, sp[0].y);
      for (let j = 1; j < sp.length; j++) g.lineTo(sp[j].x, sp[j].y);
      g.closePath();
      g.fillStyle = i === here ? CREAM : fg;
      g.fill();
      if (i === here) { g.strokeStyle = INK; g.lineWidth = 0.9; g.stroke(); }
    }

    // probe: a cream nib under the pointer
    if (hoverY != null && hoverAmt > 0.02) {
      const y = clamp(hoverY, top0, bottom0);
      const x = ropeX(y);
      g.beginPath();
      lens(x - 1, y, x - 1 - 26 * hoverAmt, y + 0.5, 2.6);
      g.fillStyle = css(palette.cream, 0.95 * hoverAmt);
      g.fill();
    }
    g.restore();

    // the diver rides on top of everything
    if (intro > 0.35 && diverA > 0.01) diver.draw(g, diverCols(rgb), ink, diverA);
  }

  function diverCols(rgb) {
    const u = rampAt(dSmooth);
    return { ink: INK, cream: CREAM, glass: css(water.glass(u, 0.4)) };
  }

  // ---------- the loop ----------
  let lastProbe = "";
  loop.add((t, dt) => {
    T = t;
    const now = t;
    if (introOn && intro < 1) {
      if (introStart == null) introStart = t;
      intro = Math.min(1, (t - introStart) / 1.9);
    }

    // depth: raw for the water, sprung for the marker and digits
    const target = targetDepth();
    if (reduced) { dSmooth = target; dVel = 0; }
    else {
      const w = 8.5;
      const a = w * w * (target - dSmooth) - 2 * w * dVel;
      dVel += a * dt; dSmooth += dVel * dt;
      if (Math.abs(target - dSmooth) < 0.05 && Math.abs(dVel) < 0.05) { dSmooth = target; dVel = 0; }
    }
    const sy = scrollTop();
    scrollV += ((sy - lastScrollY) / Math.max(dt, 1e-3) - scrollV) * (1 - Math.exp(-dt / 0.15));
    lastScrollY = sy;
    bow += ((reduced ? 0 : -clamp(scrollV * 0.0035, -bowMax, bowMax)) - bow) * (1 - Math.exp(-dt / 0.35));

    // water colour: painted every frame, but only on the water layer (one element, no inheritance)
    const u = rampAt(target);
    const rgb = water.water(u);
    const key = rgb.join(",");
    if (key !== lastRgb) { waterEl.style.backgroundColor = `rgb(${key})`; lastRgb = key; }
    if (Math.abs(target - lastTarget) > 0.5) { lastTarget = target; settledAt = now + 0.15; }

    // the ink -> cream flip (by contrast, with hysteresis): --fg is written once, CSS fades the text
    let flip = false;
    if (!dark && u > 0.44) { dark = true; flip = true; diver.glance(-0.25, -1, 1.1); }
    else if (dark && u < 0.34) { dark = false; flip = true; diver.squint(); }
    if (flip) { kFrom = kInk; kT = reduced ? 1 : 0; }
    if (kT < 1) {
      kT = Math.min(1, kT + dt / 0.75);
      const e = 1 - (1 - kT) ** 3; // matches --ease-out closely enough for a canvas line
      kInk = kFrom + ((dark ? 1 : 0) - kFrom) * e;
    } else kInk = dark ? 1 : 0;

    // the shared vars on :root: on a flip, on a new quantised step (at most ~3 times a second while
    // diving), and exactly once the dive has settled for 150 ms. Never every frame.
    const qStep = Math.round(u * STEPS);
    if (flip) { applyVars(rgb, now); lastStep = qStep; }
    else if (qStep !== lastStep && now - lastVarsAt > 0.35) { applyVars(rgb, now); lastStep = qStep; }
    else if (now > settledAt && key !== lastVarsKey) { applyVars(rgb, now); lastStep = qStep; }
    const fgRgb = water.text(kInk);

    // which section the diver is in
    let h = 0;
    for (let i = 0; i < secs.length; i++) if (dSmooth >= secs[i].depth - 8) h = i;
    // hysteresis: landing exactly on a mark counts as arriving; leaving upward needs a few metres,
    // so layout jitter from other modules never makes the name flicker
    if (here >= 0 && h < here && dSmooth > secs[here].depth - 14) h = here;
    if (h !== here) {
      if (here !== -1 && now - lastTickSfx > 0.3) { bus.emit("sfx", { name: "tick" }); lastTickSfx = now; }
      labels[here]?.el.classList.remove("is-here");
      labels[h]?.el.classList.add("is-here");
      here = h;
      const nm = NAMES[secs[h]?.id] ?? "";
      hereName.show(nm);
      mini.setHere(h, nm, `Depth gauge: ${nm}, ${mText(secs[h]?.depth ?? 0)}. Open the chart of the dive`);
    }

    // light from the surface
    const fade = 1 - sstep(80, 1150, target);
    shafts.frame(t, dt, fade, (1 - fade) * H * 0.32, pointer.nx, palette.cream);

    // the digits: sprung, so they roll rather than flick
    const rTarget = Math.round(target / 10) * 10;
    if (reduced) rSmooth = rTarget;
    else {
      const w = 8.5;
      rVel += (w * w * (rTarget - rSmooth) - 2 * w * rVel) * dt;
      rSmooth += rVel * dt;
      if (Math.abs(rTarget - rSmooth) < 0.02 && Math.abs(rVel) < 0.05) { rSmooth = rTarget; rVel = 0; }
    }

    // phones: the compact readout in the top bar; the chart folds away once you scroll on
    if (mobile) {
      mini.frame(t, dt, rSmooth, dSmooth / maxDepth, fgRgb, kInk);
      if (mini.open && Math.abs(sy - miniOpenY) > 48) mini.setOpen(false);
      return;
    }

    // hover / open easing
    hoverAmt += ((hoverY != null ? 1 : 0) - hoverAmt) * (1 - Math.exp(-dt / 0.12));
    openAmt += ((open ? 1 : 0) - openAmt) * (1 - Math.exp(-dt / (open ? 0.22 : 0.16)));

    // the diver
    const yTarget = yOf(dSmooth);
    const dropIn = intro < 1 ? (1 - Math.min(1, Math.max(0, (intro - 0.35) / 0.65))) : 0;
    const dyv = yTarget - dropIn * dropIn * (yTarget + 80);
    const ptr = pointer.active ? { x: pointer.x - gaugeLeft, y: pointer.y } : null;
    diver.update(t, dt, ropeX(dyv), dyv, ptr);

    // labels fade where the readout passes
    for (const l of labels) {
      let near = sstep(15, 36, Math.abs(l.y - diver.y));
      if (hoverY != null) near = Math.min(near, 1 - hoverAmt * (1 - sstep(10, 26, Math.abs(l.y - clamp(hoverY, top0, bottom0)))));
      if (near < 0.03) near = 0;
      if (near !== l.near && (Math.abs(near - l.near) > 0.02 || near === 0 || near === 1)) { l.el.style.setProperty("--near", near.toFixed(2)); l.near = near; }
    }

    // readout follows the diver
    const ro = diver.y.toFixed(1);
    if (ro !== lastRo) { readout.style.transform = `translate3d(0, ${ro}px, 0)`; lastRo = ro; }
    odo.set(rSmooth);
    const moving = performance.now() < movingUntil || hoverY != null || open;
    if (moving !== wasMoving) { gauge.classList.toggle("is-moving", moving); wasMoving = moving; }
    diverA = 1;
    const rTo = !room && moving && hoverY == null && intro > 0.5 ? 1 : 0; // follows the readout's own CSS fade
    roA = reduced ? rTo : roA + (rTo - roA) * (1 - Math.exp(-dt / (rTo ? 0.1 : 0.22)));

    // probe text
    if (hoverY != null) {
      const y = clamp(hoverY, top0, bottom0);
      const d = depthOfY(y);
      const m = Math.round(d / 10) * 10;
      let zi = 0;
      for (let i = 0; i < secs.length; i++) if (m >= secs[i].depth) zi = i;
      const txt = `${m ? MINUS : ""}${fmt(m)} m|${NAMES[secs[zi]?.id] ?? ""}`;
      if (txt !== lastProbe) {
        const [a, b] = txt.split("|");
        probeM.textContent = a; probeName.textContent = b; lastProbe = txt;
      }
      probe.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    }

    drawGauge(fgRgb, rgb);
  });

}
