// The living name. Each letter is its own span: a slow heartbeat wave runs through the
// Fraunces axes (wght, opsz, SOFT), letters wobble like jelly on coupled springs when the
// pointer runs over them, and ink gathers under the feet, lets go and swims off as a tiny jellyfish.
// The dot of every "i" is Turri's brain with two eyes. On a swap it floats off and a new one lands.
import { el, svgEl, clamp, lerp, smooth, easeOut, rand, squeeze, spring, closedPath } from "./util.js";
import { createBrainDot } from "./brain-dot.js";

// Every new axis value re-shapes a glyph and costs a layout, so the axes move in small fixed steps
// (well under what the eye can tell apart at this size) and are written only every few frames.
const qz = (v, s) => Math.round(v / s) * s;

export function createLivingName(host, ctx, o = {}) {
  const { ink, assets, pointer, bus } = ctx;
  const scroll = ctx.scroll || { y: 0 };
  const reduced = !!ctx.reduced;
  const opt = {
    period: 5.6, lag: 0.12,          // heartbeat seconds, phase lag per letter
    w0: 560, wA: 150, wHover: 240,    // weight at rest, pulse amount, pointer swell
    soft0: 100, opsz0: 144,
    lift: 0.016, stretch: 0.035,      // the pulse lifts and stretches each letter (fraction of font size)
    every: 2,                         // the slow sway and the axes are written on every n-th frame
    step: { wght: 6, SOFT: 10, opsz: 4 },
    drips: false, poke: true, brainGrooves: true, entrance: false,
    fit: null,                        // () => the right edge (client px) the word and its brain may reach
    ...o,
  };
  const text = (o.text || ctx.config?.name || host.textContent || "Turri").trim();
  host.textContent = "";
  host.setAttribute("aria-label", text);
  host.classList.add("hc-name");
  const word = el("span", "hc-name__word", host);
  word.setAttribute("aria-hidden", "true");

  const letters = [];
  [...text].forEach((ch, i) => {
    const isI = ch === "i";
    const span = el("span", "hc-l" + (isI ? " hc-l--i" : ""), word);
    span.textContent = isI ? "ı" : ch;
    const L = {
      i, ch: isI ? "ı" : ch, span, dot: null,
      sq: { x: 0, v: 0 }, ty: { x: 0, v: 0 }, sk: { x: 0, v: 0 }, rot: { x: 0, v: 0 },
      boost: 0, enter: opt.entrance ? 0 : 1, enterV: 0,
      lastT: "", lastF: "", lastO: "",
      box: { x: 0, y: 0, w: 0, h: 0, ox: 0, ow: 0 },
    };
    // a name that enters starts hidden in the markup, so it stays hidden even while its frame is idle
    if (opt.entrance) { span.style.opacity = "0"; L.lastO = "0.000"; }
    if (isI) {
      const holder = el("span", "hc-dot", span);
      const lift = el("span", "hc-dot__lift", holder);
      L.dot = {
        holder, lift, brain: createBrainDot(lift, assets.jelly, ink, { grooves: opt.brainGrooves, fixed: !!opt.fixed, scroll }),
        y: { x: 0, v: 0 }, state: "on", t0: 0, a: 1, ry: 0, rr: 0, landed: true, lastS: "",
      };
    }
    letters.push(L);
  });
  const probe = el("span", "hc-base", word);   // zero-height box that sits on the baseline

  // ink drips overlay
  const dripSvg = opt.drips ? svgEl("svg", { class: "hc-drips", "aria-hidden": "true" }, word) : null;
  const drips = [];

  // ---------- geometry ----------
  // Layout px relative to the word (drips) and page coords (pointer maths), refreshed on resize, when
  // a font arrives and now and then from the owner's read phase. `sy` is the scroll offset the rects
  // were read at (the owner passes ctx.scroll.y; a name in the fixed topbar ignores it).
  let fs = 100, baseY = 0;
  function measure(sy = 0) {
    fs = parseFloat(getComputedStyle(host).fontSize) || 100;
    const oy = opt.fixed ? 0 : sy;
    baseY = probe.offsetTop;
    for (const L of letters) {
      L.box.ox = L.span.offsetLeft; L.box.ow = L.span.offsetWidth;
      const r = L.span.getBoundingClientRect();
      L.box.x = r.left; L.box.y = r.top + oy; L.box.w = r.width; L.box.h = r.height;
      if (L.dot) L.dot.brain.measure(sy);
    }
    if (dripSvg) {
      dripSvg.setAttribute("width", word.offsetWidth);
      dripSvg.setAttribute("height", word.offsetHeight + fs * 0.5);
    }
  }

  // Fit: the whole word and the brain on its i stay left of opt.fit(), at the widest the heartbeat
  // gets and in whatever font actually rendered (the Georgia fallback is ~13% wider than Fraunces,
  // and Fraunces often lands seconds late). Writes --hc-fit, a factor on the CSS size (never above 1).
  // Runs on init, on resize and when a font arrives, outside the frame loop.
  let kFit = 1;
  function fit() {
    if (!opt.fit) return;
    const limit = opt.fit();
    if (!limit) return;
    const peak = `"wght" ${opt.w0 + opt.wA}, "opsz" ${opt.opsz0 - 34}, "SOFT" ${opt.soft0 - 45}, "WONK" 1`;
    for (const L of letters) L.span.style.fontVariationSettings = peak;
    const f = parseFloat(getComputedStyle(host).fontSize) || 100;
    const left = host.parentElement.getBoundingClientRect().left;
    const wl = word.getBoundingClientRect().left;     // the word box itself is never transformed
    let right = wl + word.offsetWidth;
    // the brain is centred on its i and is wider than the stem; leave room for its sway and tilt
    for (const L of letters) if (L.dot) right = Math.max(right, wl + L.span.offsetLeft + L.span.offsetWidth / 2 + L.dot.holder.offsetWidth / 2 + f * 0.035);
    for (const L of letters) L.span.style.fontVariationSettings = L.lastF;
    const need = (right - left) / f;                   // in em of the current size, from the column's edge
    const k = clamp(((limit - left) / need / f) * kFit, 0.5, 1);
    if (Math.abs(k - kFit) > 0.004) { kFit = k; host.style.setProperty("--hc-fit", k.toFixed(4)); }
  }

  // Where each glyph's feet are: one pixel row through the serifs of the font that is actually in use,
  // as runs of the advance. Drips hang from these, so they always hang from ink.
  const feet = new Map();
  function scanFeet() {
    feet.clear();
    if (!dripSvg) return;
    try {
      const W = 240, X = 40, Y = 150;
      const c = document.createElement("canvas");
      c.width = W; c.height = 200;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.font = `${opt.w0} 100px ${getComputedStyle(host).fontFamily}`;
      for (const L of letters) {
        if (feet.has(L.ch)) continue;
        g.clearRect(0, 0, W, 200);
        g.fillText(L.ch, X, Y);
        const adv = g.measureText(L.ch).width || 50;
        const row = g.getImageData(0, Y - 2, W, 1).data;
        const runs = [];
        for (let x = 0, a = -1; x <= W; x++) {
          const on = x < W && row[x * 4 + 3] > 140;
          if (on && a < 0) a = x;
          else if (!on && a >= 0) { if (x - a > 3) runs.push([(a - X) / adv, (x - X) / adv]); a = -1; }
        }
        feet.set(L.ch, runs);
      }
    } catch { /* no canvas: drips hang from the middle of a letter */ }
  }

  // everything that depends on the font and the column: fit first, then read the boxes
  function layout(sy) { fit(); scanFeet(); measure(sy); }

  // ---------- interaction ----------
  let hovered = -1;
  const letterAt = (px, py) => {
    for (const L of letters) {
      const b = L.box;
      if (px >= b.x && px <= b.x + b.w && py >= b.y - fs * 0.1 && py <= b.y + b.h) return L.i;
    }
    return -1;
  };
  function poke(i, strength = 1) {
    const L = letters[i];
    if (!L || reduced) return;
    L.sq.v += 7.5 * strength;
    L.ty.v += fs * 1.2 * strength;
    if (letters[i - 1]) letters[i - 1].sq.v += 2.6 * strength;
    if (letters[i + 1]) letters[i + 1].sq.v += 2.6 * strength;
    if (L.dot) L.dot.y.v -= fs * 2.2 * strength;     // the brain hops when its stem is squeezed
    if (opt.drips) setTimeout(() => spawnDrip(i, true), 120);
  }
  if (opt.poke) {
    host.addEventListener("pointerdown", (e) => {
      const i = letterAt(e.clientX, e.clientY + (opt.fixed ? 0 : scroll.y));
      if (i < 0) return;
      poke(i);
      bus.emit("ripple", { x: e.clientX, y: e.clientY, strength: 0.55 });
      bus.emit("sfx", { name: "bubble" });
    });
  }

  // ---------- gaze ----------
  let lookAt = null;                // {x, y, until} in client coords
  let lastMove = -10;
  let lastPX = pointer.x, lastPY = pointer.y;

  // ---------- drips ----------
  // Ink gathers under a foot into a fat pear; while it still hangs, the pear opens into a tiny bell
  // and grows threads; then the little brainless jellyfish lets go, sinks and fades to crowd violet
  // while the stub snaps back into the serif. The neck never thins to a line and nothing round ever
  // hangs or falls under a stroke, so a still never reads as "!".
  let nextDrip = performance.now() / 1000 + rand(2.5, 4.5);
  function spawnDrip(i, squeezed = false) {
    if (!dripSvg || drips.length > 2) return;
    const L = letters[i ?? Math.floor(Math.random() * letters.length)];
    if (!L.box.ow) return;
    const size = squeezed ? 1.1 : rand(0.8, 1.04);
    const R0 = fs * size * 0.04;
    // a spot on one of the feet, with room for the drop's shoulders, and off the middle of the foot
    // (the middle is under the stem, where a drop would read as the stem carrying on)
    let f = 0.5;
    const runs = feet.get(L.ch);
    if (runs?.length) {
      const [a, b] = runs[Math.floor(Math.random() * runs.length)];
      const half = (R0 * 1.3) / L.box.ow;
      const lo = a + half, hi = b - half;
      f = hi > lo ? lerp(lo, hi, Math.random() < 0.5 ? rand(0, 0.3) : rand(0.7, 1)) : (a + b) / 2;
    }
    const g = svgEl("g", { class: "hc-drip" }, dripSvg);
    const parts = [0, 1, 2, 3, 4].map(() => svgEl("path", {}, g));
    const side = f < 0.5 ? -1 : 1;   // it leans away from the stem
    drips.push({
      L, f, g, parts, t0: performance.now() / 1000, seed: Math.random() * 100, size,
      speed: squeezed ? 1.8 : 1, lean: side * rand(0.12, 0.35), lastFill: "", lastD: ["", "", "", "", ""], lastOp: "",
    });
  }

  const P = ink.P;
  // An attached drop: a flat top tucked under the foot, concave shoulders, a waist, then a belly
  // that is round (hem = 0) or opens into a bell with a flat, scalloped hem (hem = 1).
  function pendant(x0, y0, lean, hang, R, ry, neck, flare, hem = 0, ph = 0) {
    const N = 10, left = [], right = [];
    const fil = Math.min(0.45, (R * 0.75) / Math.max(hang, 0.01));   // the part of the length the shoulders take
    for (let k = 0; k <= N; k++) {
      const v = k / N;
      const y = y0 + hang * v - (k === 0 ? 1.5 : 0);
      const xc = x0 + lean * v * v;
      // below the waist: a pear (s-curve) for a drop, a convex dome for a bell
      const u = (v - fil) / (1 - fil);
      const hw = v < fil ? neck + flare * (1 - v / fil) ** 2 : lerp(neck, R, lerp(smooth(u), 1 - (1 - u) ** 2.2, hem));
      left.push(P(xc - hw, y)); right.push(P(xc + hw, y));
    }
    const bx = x0 + lean, by = y0 + hang, bottom = [];
    for (let k = 1; k < 16; k++) {
      const a = Math.PI - (k / 16) * Math.PI, cs = Math.cos(a);
      const flat = 0.16 + 0.1 * Math.sin(cs * Math.PI * 3 + ph);
      bottom.push(P(bx + cs * R, by + Math.sin(a) * ry * (1 - hem * (1 - flat))));
    }
    return closedPath([...left, ...bottom, ...right.reverse()]);
  }
  // three tapered threads hanging from a hem centred at (cx, hy) that is 2 * rx wide
  function threads(out, cx, hy, rx, rb, s, grow, tt, seed) {
    [-0.6, 0, 0.6].forEach((f, j) => {
      const hx = cx + f * rx * 0.85;
      const len = s * (j === 1 ? 0.095 : 0.07) * grow;
      if (len < 1) return;
      const sway = (k) => Math.sin(tt * 2.4 - k * 2.2 + j * 1.3 + seed) * s * 0.012 * k;
      const c = [P(hx, hy), P(hx + sway(0.35) + f * s * 0.008, hy + len * 0.35), P(hx + sway(0.7) + f * s * 0.014, hy + len * 0.7), P(hx + sway(1) + f * s * 0.016, hy + len)];
      out[j + 2] = ink.brush(ink.spline(c, false, 6), (u) => Math.max(0.7, rb * 0.3 * Math.pow(1 - u, 1.1)));
    });
  }

  function drawDrip(d, t) {
    const s = fs * d.size, tau = (t - d.t0) * d.speed;
    const R0 = s * 0.04;
    const x0 = d.L.box.ox + d.L.box.ow * d.f, y0 = baseY + d.L.ty.x;
    const T1 = 1.0, T2 = 1.65;         // gathering; then it opens into a bell while it hangs; lets go at T2
    const out = ["", "", "", "", ""];
    let alpha = 1, mix = 0;
    const lean = d.lean * R0;
    if (tau < T2) {
      const g = easeOut(tau / T1);
      const b = tau > T1 ? smooth((tau - T1) / (T2 - T1)) : 0;
      const R = R0 * (0.4 + 0.6 * g) * (1 + 0.28 * b);
      const hang = R0 * (0.25 + 1.35 * g + 0.65 * b);
      const wob = Math.sin(tau * 7 + d.seed) * 0.04 * (1 - b);   // the drop trembles while it fills
      const neck = Math.min(R0 * lerp(0.82, 0.58, b), R * 0.9);
      const ph = tau * 3 + d.seed;
      // the drop leans as it fills; the bell straightens up under its stalk
      const ln = lean * g * (1 - 0.6 * b);
      out[0] = pendant(x0, y0, ln, hang, R * (1 + wob), R * (1 - wob), neck, R0 * 0.5 * (0.5 + 0.5 * g), b, ph);
      if (b > 0.15) threads(out, x0 + ln, y0 + hang + R * 0.16 * b, R, R0, s, smooth((b - 0.15) / 0.85), tau, d.seed);
    } else {
      const tt = tau - T2;
      // the stub snaps back up into the foot with a small bounce; it is short and wide all the way
      const neck = R0 * 0.58;
      const hS = R0 * 0.9 * Math.max(0, Math.exp(-tt * 16) * Math.cos(tt * 13));
      const shrink = 1 - smooth((tt - 0.04) / 0.2);
      if (shrink > 0.02) out[0] = pendant(x0, y0, lean * 0.4, hS, neck * shrink, neck * 0.8 * shrink, neck * shrink, R0 * 0.5 * shrink);
      // the little jellyfish sinks, eases into a slow drift and sways off sideways, beating now and then
      const bx = x0 + lean * 0.4, by = y0 + R0 * 2.25;
      const fall = s * 0.09 * (1 - Math.exp(-tt * 2.4)) + s * 0.016 * tt;
      const beat = Math.max(0, Math.sin(tt * 5.2 - 2.2)) ** 3;
      const cx = bx + d.lean * s * 0.012 * tt + Math.sin(tt * 1.3 + d.seed) * s * 0.008 * tt;
      const cy = by + fall - beat * s * 0.008;
      const rx = R0 * 1.28 * (1 - 0.14 * beat), ry = R0 * 1.05 * (1 + 0.12 * beat);
      out[1] = bell(cx, cy, rx, ry, 1, d.seed, tau);
      threads(out, cx, cy + ry * 0.12, rx, R0, s, 1, tau, d.seed);
      alpha = 1 - smooth((tt - 0.9) / 1.5);
      mix = smooth((tt - 0.1) / 1.1);
      if (tt > 2.45) return false;
    }
    // ink to crowd violet (--deep) as it turns into one of the brainless ones
    const fill = mix > 0 ? `rgb(${Math.round(11 + 82 * mix)},${Math.round(11 + 52 * mix)},${Math.round(11 + 190 * mix)})` : "";
    if (fill !== d.lastFill) { if (fill) d.g.setAttribute("fill", fill); else d.g.removeAttribute("fill"); d.lastFill = fill; }
    for (let k = 0; k < 5; k++) if (out[k] !== d.lastD[k]) { d.parts[k].setAttribute("d", out[k]); d.lastD[k] = out[k]; }
    const op = alpha.toFixed(3);
    if (op !== d.lastOp) { d.g.setAttribute("opacity", op); d.lastOp = op; }
    return true;
  }
  // a little bell: domed on top, scalloped hem underneath (a round drop first, opening as e goes to 1)
  function bell(cx, cy, rx, ry, e, seed, tt) {
    const pts = [];
    for (let k = 0; k < 30; k++) {
      const a = Math.PI + (k / 30) * Math.PI * 2;      // start at the left, go over the top
      const sn = Math.sin(a), cs = Math.cos(a);
      const x = cx + cs * rx;
      let y;
      if (sn <= 0) y = cy + sn * ry * 1.05;               // dome
      else {
        // underside: from a round drop (e = 0) to a flat hem with three soft scallops (e = 1)
        const flat = 0.16 + 0.1 * Math.sin(cs * Math.PI * 3 + tt * 3 + seed) * e;
        y = cy + sn * ry * (1 - e * (1 - flat));
      }
      pts.push(P(x, y));
    }
    return closedPath(ink.spline(pts, true, 2));
  }

  // ---------- swap ceremony on the dot ----------
  function swapStart() {
    for (const L of letters) if (L.dot) { L.dot.brain.hold(true); L.dot.state = "lift"; L.dot.t0 = performance.now() / 1000 + 0.35; }
    pulseAll(1.4);
  }
  function swapMid() {
    for (const L of letters) if (L.dot) {
      L.dot.brain.rewire();
      L.dot.state = "drop"; L.dot.t0 = performance.now() / 1000; L.dot.landed = false;
      L.dot.y.x = -fs * 0.75; L.dot.y.v = 0;
    }
  }
  function swapDone() {
    const t = performance.now() / 1000;
    for (const L of letters) if (L.dot) {
      // a name that sat out the drop (hidden, so no frames) gets its brain put straight back,
      // without saving up the landing bounce for the moment it reappears
      if (L.dot.state !== "on") { L.dot.state = "on"; L.dot.y.x = 0; L.dot.y.v = 0; L.dot.a = 1; L.dot.landed = true; }
      L.dot.brain.hold(false);
      L.dot.brain.blink(t + 0.5, true);
    }
    pulseAll(1);
  }
  function pulseAll(k = 1) {
    if (reduced) return;
    letters.forEach((L, i) => setTimeout(() => { L.sq.v -= 3.2 * k; L.ty.v -= fs * 0.5 * k; }, i * 70));
  }
  // the brain on the i jumps (the hand-off in the topbar)
  function hop(k = 1) {
    if (reduced) return;
    for (const L of letters) if (L.dot && L.dot.state === "on") L.dot.y.v -= fs * 2.6 * k;
  }

  // ---------- frame ----------
  let visible = true;
  let entering = opt.entrance ? 0 : 1;   // 1 = shown
  let fc = 0;                            // frame count: the slow parts are written every opt.every frames
  // is any letter still dropping in or out?
  const moving = () => { for (const L of letters) if (L.enter !== entering) return true; return false; };
  function frame(t, dt) {
    if (!visible) return;
    const slow = ++fc % opt.every === 0;
    // ctx.scroll.y is cached by the scroll handler; reading window.scrollY here would force a layout
    const px = pointer.x, py = pointer.y + (opt.fixed ? 0 : scroll.y);
    if (pointer.x !== lastPX || pointer.y !== lastPY) { lastMove = t; lastPX = pointer.x; lastPY = pointer.y; }
    // a finger leaves no hover behind: on touch screens the pointer stays where the last tap was
    const hovering = pointer.active && !pointer.touch && !reduced;

    // hover: entering a letter pushes it like a hand through jelly
    const h = hovering && opt.poke ? letterAt(px, py) : -1;
    if (h !== hovered) {
      if (h >= 0 && t - lastMove < 0.25) {
        const L = letters[h];
        const sp = Math.hypot(pointer.vx, pointer.vy);
        const k = clamp(sp / 1400, 0.3, 1.5);
        L.sq.v += 3.6 * k;
        L.sk.v += clamp(-pointer.vx * 0.03, -90, 90);
        L.ty.v += clamp(pointer.vy * 0.06, -fs * 2, fs * 2);
        L.rot.v += clamp(pointer.vx * 0.006, -30, 30);
        if (L.dot) L.dot.y.v -= fs * 0.9 * k;
      }
      hovered = h;
    }

    // gaze target for the brain dots
    let gaze = null;
    if (lookAt && t < lookAt.until) gaze = lookAt;
    else if (pointer.active && t - lastMove < 6) gaze = { x: pointer.x, y: pointer.y };
    else if (pointer.touch && (pointer.tx || pointer.ty)) {
      const r = letters.find((L) => L.dot)?.dot.brain.rect;
      if (r) gaze = { x: r.left + r.width / 2 + pointer.tx * 300, y: r.top + r.height / 2 + pointer.ty * 300 };
    }

    for (let i = 0; i < letters.length; i++) {
      const L = letters[i];
      // proximity swell
      const cx = L.box.x + L.box.w / 2, cy = L.box.y + L.box.h * 0.55;
      const dd = Math.hypot(px - cx, py - cy) / (fs * 0.85);
      const target = hovering && opt.wHover ? Math.exp(-dd * dd) : 0;
      L.boost += (target - L.boost) * (1 - Math.exp(-dt / 0.18));

      const ph = (((t / opt.period - i * opt.lag) % 1) + 1) % 1;
      const p = reduced ? 0 : squeeze(ph);
      // the axes: quantised, and only on slow frames, so the text re-shapes (and the name lays out)
      // a few times a second, and only when a step is actually crossed
      if (slow || !L.lastF) {
        const wght = clamp(qz(opt.w0 + opt.wA * p + opt.wHover * L.boost, opt.step.wght), 100, 900);
        const soft = clamp(qz(opt.soft0 - 45 * p, opt.step.SOFT), 0, 100);
        const opsz = clamp(qz(opt.opsz0 - 34 * p, opt.step.opsz), 9, 144);
        const fv = `"wght" ${wght}, "opsz" ${opsz}, "SOFT" ${soft}, "WONK" 1`;
        if (fv !== L.lastF) { L.span.style.fontVariationSettings = fv; L.lastF = fv; }
      }

      if (!reduced) {
        // springs follow the heartbeat; neighbours pull on each other so a poke travels
        const left = letters[i - 1]?.sq.x ?? 0, right = letters[i + 1]?.sq.x ?? 0;
        L.sq.v += 26 * (left + right - 2 * L.sq.x) * dt;
        spring(L.sq, -opt.stretch * p, dt, 260, 9);
        spring(L.ty, -opt.lift * fs * p, dt, 200, 10);
        spring(L.sk, 0, dt, 180, 9);
        spring(L.rot, 0, dt, 160, 9);
        L.sq.x = clamp(L.sq.x, -0.35, 0.4);
      }
      // entrance: letters drop in one by one
      const want = entering;
      if (L.enter !== want) {
        if (reduced) L.enter = want;
        else {
          const delay = want ? i * 0.06 : (letters.length - 1 - i) * 0.04;
          L.enterT = L.enterT ?? t;
          if (t - L.enterT > delay) {
            L.enterV += (-170 * (L.enter - want) - 15 * L.enterV) * dt;
            L.enter += L.enterV * dt;
            if (Math.abs(L.enter - want) < 0.002 && Math.abs(L.enterV) < 0.01) { L.enter = want; L.enterV = 0; L.enterT = null; }
          }
        }
      }
      // transforms are compositor-only, but they still cost a style pass: the slow heartbeat sway
      // is written on slow frames with the axes; a letter that has just been hit, poked or is
      // dropping in moves fast and gets every frame
      const hot = L.enter !== entering || Math.abs(L.sq.v) > 0.12 || Math.abs(L.ty.v) > fs * 0.05 || Math.abs(L.sk.v) > 8 || Math.abs(L.rot.v) > 6;
      if (slow || hot) {
        const sq = L.sq.x;
        const ty = L.ty.x - (1 - L.enter) * fs * 0.9;
        const tf = `translate3d(0,${ty.toFixed(1)}px,0) rotate(${L.rot.x.toFixed(2)}deg) skewX(${L.sk.x.toFixed(2)}deg) scale(${(1 + sq * 0.55).toFixed(3)},${(1 - sq).toFixed(3)})`;
        if (tf !== L.lastT) { L.span.style.transform = tf; L.lastT = tf; }
        const op = clamp(L.enter * 1.4, 0, 1).toFixed(3);
        if (op !== L.lastO) { L.span.style.opacity = op; L.lastO = op; }
      }

      if (L.dot) frameDot(L, t, dt, gaze, p, slow);
    }

    // drips
    if (dripSvg && !reduced) {
      if (t > nextDrip) { spawnDrip(); nextDrip = t + rand(4.5, 9); }
      for (let k = drips.length - 1; k >= 0; k--) {
        if (!drawDrip(drips[k], t)) { drips[k].g.remove(); drips.splice(k, 1); }
      }
    }
  }

  function frameDot(L, t, dt, gaze, p, slow = true) {
    const D = L.dot;
    let y = 0, r = 0, a = 1, sc = 1;
    if (!reduced) {
      // secondary motion: the brain lags behind its stem, sinking when the i squashes
      spring(D.y, L.sq.x * fs * 0.55, dt, 120, 7);
      y = D.y.x + Math.sin(t * 1.25) * fs * 0.012 - p * fs * 0.012;
      r = Math.sin(t * 0.83 + 1) * 4 + D.y.v * 0.002;
      if (D.state === "lift") {
        const u = Math.max(0, t - D.t0) / 2.1;
        y += -Math.pow(Math.min(1, u), 3) * fs * 0.95;
        r += -28 * Math.pow(Math.min(1, u), 3);
        sc = 1 - 0.25 * smooth(u);
        a = 1 - smooth((u - 0.45) / 0.55);
        if (u > 2.2) D.state = "gone";
      } else if (D.state === "gone") {
        a = 0;
      } else if (D.state === "drop") {
        const u = t - D.t0;
        a = smooth(u / 0.35);
        if (!D.landed && D.y.x > -fs * 0.02) {
          D.landed = true;
          L.sq.v += 5.5; L.ty.v += fs * 0.8;
          if (letters[L.i - 1]) letters[L.i - 1].sq.v += 1.5;
        }
        if (u > 1.4) D.state = "on";
      }
    } else if (D.state === "lift" || D.state === "gone") {
      a = 0;
    }
    // the idle bob is slow enough for slow frames; hops, lifts and drops get every frame
    if (slow || D.state !== "on" || Math.abs(D.y.v) > fs * 0.04) {
      const s = `translate3d(0,${y.toFixed(1)}px,0) rotate(${r.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
      const key = s + a.toFixed(2);
      if (key !== D.lastS) { D.lift.style.transform = s; D.lift.style.opacity = a.toFixed(3); D.lastS = key; }
    }
    D.brain.update(t, dt, gaze, { reduced });
  }

  return {
    letters, measure, layout, frame, poke, spawnDrip,
    swapStart, swapMid, swapDone, pulse: pulseAll, hop,
    look(x, y, ms = 900) { lookAt = { x, y, until: performance.now() / 1000 + ms / 1000 }; },
    rewire() { for (const L of letters) if (L.dot) L.dot.brain.rewire(); },
    blink(double = false) { const t = performance.now() / 1000; for (const L of letters) if (L.dot) L.dot.brain.blink(t, double); },
    wink() { const t = performance.now() / 1000; for (const L of letters) if (L.dot) L.dot.brain.wink(t); },
    set visible(v) { visible = v; },
    get shown() { return entering === 1; },
    set shown(v) { entering = v ? 1 : 0; },
    // true while the letters are still dropping in or out: the owner keeps calling frame() until
    // the hand-off has finished, then a hidden name costs nothing
    get busy() { return moving(); },
    get fontSize() { return fs; },
    get fitScale() { return kFit; },
  };
}
