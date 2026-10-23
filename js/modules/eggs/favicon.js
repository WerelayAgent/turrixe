// The tab icon is a live Turri, painted on a 64 px canvas from the real jelly geometry.
// It blinks, an ink tide ring around it drains toward the next brain, it does the swap ceremony,
// looks around for you while the tab is hidden, and does a somersault when the page does.
// Frames are only encoded when something visible changed (a dirty key), at most ~15 per second.
// The shared loop drives it while the page is visible; while hidden rAF stops, so a tiny worker ticks it.

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const backOut = (t, s = 1.9) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const dOf = (svg) => svg.match(/d="([^"]+)"/)[1];

// Lid closes in 92 ms (smoothstep), holds 26 ms, opens in 185 ms (ease-out cubic): returns 0 open .. 1 shut
function blinkLid(ms) {
  if (ms < 0) return 0;
  if (ms < 92) return smooth(ms / 92);
  if (ms < 118) return 1;
  if (ms < 303) return 1 - easeOut((ms - 118) / 185);
  return 0;
}

export function createPainter(ctx, S = 64) {
  const J = ctx.assets.jelly, ink = ctx.ink, P = ink.P;
  const pal = J.palette;
  const k = S / 64;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d");

  // bell space -> icon: the bell is ~46 px wide at 64, hung above centre to leave room for the tentacles
  const bs = (43.5 / 554) * k, cx = 32 * k, cy = 23.5 * k;
  const bellP = new Path2D(J.bell.d), innerP = new Path2D(J.bell.inner), glintP = new Path2D(J.bell.glint);
  const brainP = new Path2D(J.brain.d);
  const BI = J.brainInBell;
  const mBell = new DOMMatrix().translate(cx, cy).scale(bs);
  const mBrain = mBell.translate(BI.tx, BI.ty).scale(BI.s).rotate(BI.rot);
  const tp = (m, x, y) => { const p = m.transformPoint(new DOMPoint(x, y)); return { x: p.x, y: p.y }; };

  // eyes: the real ones are ~2.5 px at this size, so they are spread apart and enlarged until they read at 16 px
  const raw = J.brain.eyes.map((e) => ({ ...tp(mBrain, e.x, e.y), rx: e.rx * BI.s * bs, ry: e.ry * BI.s * bs }));
  const mid = { x: (raw[0].x + raw[1].x) / 2, y: (raw[0].y + raw[1].y) / 2 };
  const EYES = raw.map((e, i) => ({
    x: mid.x + (e.x - mid.x) * 1.3 + (i ? 1.9 : 2.5) * k,
    y: mid.y + (e.y - mid.y) * 1.2 + 0.9 * k,
    rx: e.rx * (i ? 1.72 : 1.62), ry: e.ry * (i ? 1.72 : 1.62),
  }));

  // grooves in field violet (one variant), drawn as swelling brush strokes in brain space
  const grooves = (J.brain.grooves[2] || J.brain.grooves[0]).slice(0, 5).map((gv) => {
    const pts = gv.pts.map(([x, y]) => P(x, y));
    const w = gv.w * 1.25;
    return new Path2D(ink.brush(pts, (t) => w * 0.35 + w * 0.65 * Math.sin(Math.PI * t)));
  });

  // four long tapered streamers from the hem, gathering a little toward the middle, in bell space
  const tipY = (55.5 * k - cy) / bs;
  const tents = [-158, -56, 52, 150].map((x, i) => {
    const s = i % 2 ? 1 : -1, ex = x * 0.5;
    return new Path2D(dOf(ink.tentacle(
      [P(x, 112), P(x + 10 * s, 112 + (tipY - 112) * 0.34), P(lerp(x, ex, 0.62) - 12 * s, 112 + (tipY - 112) * 0.68), P(ex + 6 * s, tipY)],
      { w0: 40, w1: 15 },
    )));
  });

  // the backing water drop: an almost-round blob, so the icon reads on light and dark tab strips
  const back = new Path2D();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * TAU;
    const r = (31.6 + 0.45 * Math.sin(a * 3 + 0.6) + 0.3 * Math.sin(a * 5 + 2.1)) * k;
    const x = 32 * k + Math.cos(a) * r, y = 32 * k + Math.sin(a) * r;
    i ? back.lineTo(x, y) : back.moveTo(x, y);
  }
  back.closePath();

  const RING = 28.7 * k;

  // The ink tide: the remaining time as a tapered ring, fat at the moving head, thin at the 12 o'clock end
  function tide(f, pulse) {
    if (f <= 0.002) return;
    const a1 = -Math.PI / 2 + TAU;                 // fixed end, 12 o'clock
    const a0 = -Math.PI / 2 + TAU * (1 - f);       // moving head, sweeps clockwise as time runs out
    const n = Math.max(6, Math.ceil(f * 90));
    const wHead = 4.4 * k, wTail = 2.1 * k;
    const out = [], inn = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = a0 + (a1 - a0) * u;
      const w = lerp(wHead, wTail, Math.pow(u, 0.7)) / 2;
      out.push([Math.cos(a) * (RING + w) + 32 * k, Math.sin(a) * (RING + w) + 32 * k]);
      inn.push([Math.cos(a) * (RING - w) + 32 * k, Math.sin(a) * (RING - w) + 32 * k]);
    }
    g.beginPath();
    out.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    for (let i = inn.length - 1; i >= 0; i--) g.lineTo(inn[i][0], inn[i][1]);
    g.closePath();
    g.fill();
    // round caps; the head is a drop that swells when the time is nearly up
    const hx = Math.cos(a0) * RING + 32 * k, hy = Math.sin(a0) * RING + 32 * k;
    g.beginPath(); g.arc(hx, hy, (wHead / 2) * (1 + pulse * 0.4), 0, TAU); g.fill();
    g.beginPath(); g.arc(Math.cos(a1) * RING + 32 * k, Math.sin(a1) * RING + 32 * k, wTail / 2, 0, TAU); g.fill();
  }

  function eye(e, lid, lx, ly, wide, dy) {
    const rx = e.rx * wide, ry = e.ry * wide, y = e.y + dy;
    g.save();
    g.beginPath(); g.ellipse(e.x, y, rx, ry, 0, 0, TAU);
    g.fillStyle = pal.cream; g.fill();
    g.clip();
    const pr = Math.min(rx, ry) * 0.5;
    const reach = Math.min(rx, ry) - pr - Math.min(rx, ry) * 0.08;
    const m = Math.hypot(lx, ly), q = m > 1 ? 1 / m : 1;
    g.fillStyle = pal.ink;
    g.beginPath(); g.arc(e.x + lx * q * reach, y + ly * q * reach, pr, 0, TAU); g.fill();
    if (lid > 0.01) {
      // the lid comes down from the top with a soft convex edge
      const top = y - ry - 1, edge = y - ry + 2 * ry * lid;
      g.beginPath();
      g.moveTo(e.x - rx - 1, top); g.lineTo(e.x + rx + 1, top);
      g.lineTo(e.x + rx + 1, edge - ry * 0.18 * (1 - lid));
      g.quadraticCurveTo(e.x, edge + ry * 0.32 * (1 - lid), e.x - rx - 1, edge - ry * 0.18 * (1 - lid));
      g.closePath(); g.fill();
    }
    g.restore();
    if (lid > 0.8) {
      // shut: a cream crescent where the lid meets the cheek, so a closed eye still reads as an eye
      const a = clamp((lid - 0.8) / 0.2);
      g.save();
      g.globalAlpha = a;
      g.fillStyle = pal.cream;
      g.beginPath();
      g.ellipse(e.x, y + ry * 0.12, rx * 0.86, ry * 0.5, 0, 0.08 * Math.PI, 0.92 * Math.PI);
      g.ellipse(e.x, y + ry * 0.02, rx * 0.8, ry * 0.3, 0, 0.9 * Math.PI, 0.1 * Math.PI, true);
      g.closePath(); g.fill();
      g.restore();
    }
  }

  // s: { f, pulse, lids:[a,b], look:{x,y}, wide, brainDy, brainA, rot, squash }
  function paint(s) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    g.fillStyle = pal.field; g.fill(back);
    // the track the tide drains along, in the crowd's violet
    g.strokeStyle = pal.deep; g.lineWidth = 1.5 * k;
    g.beginPath(); g.arc(32 * k, 32 * k, RING, 0, TAU); g.stroke();
    g.fillStyle = pal.ink;
    tide(s.f, s.pulse || 0);

    // the jelly, rotated about its middle for the somersault
    g.save();
    const pivotY = 33 * k;
    g.translate(32 * k, pivotY);
    g.rotate(((s.rot || 0) * Math.PI) / 180);
    const sq = s.squash || 0;
    g.scale(1 + sq * 0.08, 1 - sq * 0.1);
    g.translate(-32 * k, -pivotY);
    g.fillStyle = pal.ink;
    g.save(); g.setTransform(g.getTransform().multiply(mBell));
    tents.forEach((p) => g.fill(p));
    g.fill(bellP);
    g.fillStyle = pal.field; g.fill(innerP);
    g.restore();

    const dy = s.brainDy || 0, ba = s.brainA ?? 1;
    if (ba > 0.01) {
      g.save();
      g.globalAlpha = ba;
      g.translate(0, dy);
      g.save(); g.setTransform(g.getTransform().multiply(mBrain));
      g.fillStyle = pal.ink; g.fill(brainP);
      g.fillStyle = pal.field; grooves.forEach((p) => g.fill(p));
      g.restore();
      const lk = s.look || { x: 0, y: 0.5 };
      EYES.forEach((e, i) => eye(e, s.lids?.[i] ?? 0, lk.x, lk.y, s.wide || 1, 0));
      g.restore();
    }
    g.save(); g.setTransform(g.getTransform().multiply(mBell));
    g.fillStyle = pal.cream; g.fill(glintP);
    g.restore();
    g.restore();
    return cv;
  }

  return { canvas: cv, paint, size: S };
}

// The live favicon: state machine + scheduling. Returns hooks the eggs module calls.
export function createFavicon(ctx) {
  const { bus, state, reduced } = ctx;
  const painter = createPainter(ctx, 64);
  let link = document.querySelector('link[rel~="icon"]');
  if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.append(link); }

  const now = () => performance.now();
  let f = 1, fShown = 1, period = (ctx.config.brainMinutes || 30) * 60000;
  let refillAt = -1, refillFrom = 0;
  let blinkAt = now() + rand(1200, 2600), dbl = false;
  let lonely = false, lookSide = 1, lookSwitchAt = 0;
  let dart = null;                      // {x, y, until}
  let wideUntil = 0, flipAt = -1;
  let swapAt = -1, midAt = -1, doneAt = -1;
  let lastKey = "", lastPaint = 0, lastCheck = 0;

  bus.on("brain:countdown", (c) => {
    if (!c) return;
    period = c.period || period;
    f = clamp(c.ms / period);
    if (document.hidden) tick();
  });
  bus.on("thought", () => {
    if (lonely || reduced) return;
    const a = rand(0, TAU);
    dart = { x: Math.cos(a) * 0.9, y: Math.sin(a) * 0.7, until: now() + rand(700, 1100) };
  });
  bus.on("brain:swap:start", () => { swapAt = now(); midAt = doneAt = -1; });
  bus.on("brain:swap:mid", () => { midAt = now(); if (swapAt < 0) swapAt = midAt - 2600; });
  bus.on("brain:swap:done", () => {
    doneAt = now(); refillFrom = 0; refillAt = reduced ? -1 : doneAt;
    wideUntil = doneAt + 1400; blinkAt = doneAt + 350; dbl = true;
  });

  function swapPose(t) {
    // returns {brainDy, brainA, lidShut, fOverride}
    if (swapAt < 0) return null;
    const s = (t - swapAt) / 1000;
    if (doneAt > 0 && t - doneAt > 1600) { swapAt = midAt = doneAt = -1; return null; }
    const pose = { brainDy: 0, brainA: 1, lid: 1, f: 0 };
    if (midAt < 0) {
      // the old brain lifts up and out of the glass
      pose.lid = clamp(s / 0.35);
      const u = clamp((s - 0.35) / 1.6);
      pose.brainDy = -easeIn(u) * 46;
      pose.brainA = 1 - clamp((u - 0.7) / 0.3);
    } else {
      // a new one is lowered in and settles with a little bounce; eyes stay shut until done
      const u = clamp((t - midAt) / 1300);
      pose.brainDy = -46 * (1 - backOut(u, 1.4));
      pose.brainA = clamp(u * 3);
      if (doneAt > 0) pose.lid = 0;
    }
    return pose;
  }

  function compute(t) {
    const s = { f, pulse: 0, lids: [0, 0], look: { x: 0.08, y: 0.55 }, wide: 1, brainDy: 0, brainA: 1, rot: 0, squash: 0 };
    // the tide refills with an overshoot after a new brain lands
    if (refillAt > 0) {
      const u = clamp((t - refillAt) / 1200);
      s.f = lerp(refillFrom, f, backOut(u, 1.2));
      if (u >= 1) refillAt = -1;
    }
    fShown = s.f;
    if (reduced) { const sp = swapPose(t); if (sp) { s.brainDy = sp.brainDy < -20 ? -46 : 0; s.brainA = sp.brainA > 0.5 ? 1 : 0; s.f = sp.f; } return s; }

    // last minute: the head of the tide throbs and the eyes watch it
    const leftMs = f * period;
    if (leftMs < 60000 && swapAt < 0) {
      s.pulse = 0.5 + 0.5 * Math.sin(t / 1000 * TAU * 1.1);
      const a0 = -Math.PI / 2 + TAU * (1 - f);
      s.look = { x: Math.cos(a0) * 0.95, y: Math.sin(a0) * 0.95 };
    }
    if (dart && t < dart.until) s.look = { x: dart.x, y: dart.y };
    if (lonely) {
      // nobody is here: heavy lids, looking left and right along the tab strip for you
      if (t > lookSwitchAt) { lookSide = -lookSide; lookSwitchAt = t + rand(2200, 4200); }
      s.look = { x: 0.92 * lookSide, y: 0.25 };
      s.lids = [0.42, 0.46];
    }
    if (t < wideUntil) { s.wide = 1.12; s.look = { x: 0, y: 0.15 }; }

    // blinks on their own timer, with the occasional double
    const bt = t - blinkAt;
    const lid = blinkLid(bt);
    if (bt > 303) {
      if (dbl) { dbl = false; blinkAt = t + 120; }
      else { dbl = Math.random() < 0.14; blinkAt = t + (lonely ? rand(3800, 6800) : rand(2500, 4200)); }
    }
    s.lids = s.lids.map((l) => Math.max(l, lid));

    const sp = swapPose(t);
    if (sp) {
      s.brainDy = sp.brainDy * (64 / 64); s.brainA = sp.brainA; s.f = refillAt > 0 ? s.f : sp.f;
      s.lids = s.lids.map((l) => Math.max(l, sp.lid));
      s.pulse = 0;
    }
    if (flipAt > 0) {
      const u = clamp((t - flipAt) / 1050);
      s.rot = 360 * backOut(u, 1.25);
      s.squash = Math.sin(u * Math.PI) * 0.8;
      if (u >= 1) flipAt = -1;
    }
    return s;
  }

  const q = (v, step) => Math.round(v / step);
  function keyOf(s) {
    return [q(s.f * 360, 1), q(s.pulse, 0.12), q(s.lids[0], 0.08), q(s.lids[1], 0.08), q(s.look.x, 0.12), q(s.look.y, 0.12),
      q(s.wide, 0.04), q(s.brainDy, 0.5), q(s.brainA, 0.1), q(s.rot, 2), q(s.squash, 0.1)].join(",");
  }

  function tick() {
    const t = now();
    const s = compute(t);
    const key = keyOf(s);
    if (key === lastKey || t - lastPaint < 62) return;
    lastKey = key; lastPaint = t;
    painter.paint(s);
    try { link.type = "image/png"; link.removeAttribute("sizes"); link.href = painter.canvas.toDataURL("image/png"); } catch { /* tainted or detached: keep the static icon */ }
  }

  // visible: ride the shared loop, checking ~15 times a second
  ctx.loop.add(() => {
    const t = now();
    if (t - lastCheck < 66) return;
    lastCheck = t;
    tick();
  });

  // hidden: rAF stops, and main-thread timers get throttled to 1 Hz, so a two-line worker keeps the icon blinking
  let worker = null, fallback = 0;
  try {
    const src = "let i=0;onmessage=(e)=>{clearInterval(i);if(e.data>0)i=setInterval(()=>postMessage(1),e.data)}";
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    worker.onmessage = tick;
  } catch { worker = null; }
  const tickWhileHidden = (on) => {
    if (worker) worker.postMessage(on && !reduced ? 110 : 0);
    else { clearInterval(fallback); if (on) fallback = setInterval(tick, 500); }
  };

  tick();
  return {
    setLonely(on) {
      lonely = on;
      lookSwitchAt = 0;
      tickWhileHidden(on);
      tick();
    },
    welcome() { wideUntil = now() + 1300; blinkAt = now() + 420; dbl = true; tick(); },
    flip() { if (!reduced) flipAt = now(); },
    blink() { blinkAt = now(); dbl = Math.random() < 0.5; },
    get shown() { return fShown; },
    painter,
  };
}
