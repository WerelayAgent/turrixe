// The diver: a tiny Turri riding the sounding line on the depth gauge.
// It sinks when you dive (streamers trail up), swims with quick beats when you climb,
// watches the cursor, blinks on its own timer and rewires its little brain on every thought.
// Drawn into the gauge canvas; geometry comes straight from assets/jelly.json.

const TAU = Math.PI * 2;
const smooth = (x) => x * x * (3 - 2 * x);
const outCubic = (x) => 1 - (1 - x) ** 3;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// variable-width ribbon straight onto a canvas (same idea as ink.brush, without the string round trip)
export function ribbon(ctx, pts, wfn) {
  const n = pts.length;
  if (n < 2) return;
  const L = new Array(n), R = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    const w = Math.max(0.35, wfn(i / (n - 1)) / 2);
    L[i] = [pts[i].x - ty * w, pts[i].y + tx * w];
    R[i] = [pts[i].x + ty * w, pts[i].y - tx * w];
  }
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
  ctx.closePath();
  ctx.fill();
}

export function createDiver({ jelly, ink, reduced }) {
  const bell = new Path2D(jelly.bell.d);
  const inner = new Path2D(jelly.bell.inner);
  const rim = new Path2D();
  rim.addPath(bell);
  rim.addPath(inner);
  const glint = new Path2D(jelly.bell.glint);
  const brain = new Path2D(jelly.brain.d);
  const B = jelly.brainInBell;
  const EYE_K = 1.32; // eyes read bigger at icon size
  const eyes = jelly.brain.eyes.map((e) => ({ ...e, rx: e.rx * EYE_K, ry: e.ry * EYE_K }));
  const pupilK = jelly.brain.pupil ?? 0.47;
  // one Path2D per groove variant, drawn as swelling ink strokes
  const grooves = jelly.brain.grooves.map((variant) => {
    const p = new Path2D();
    for (const g of variant) {
      const pts = g.pts.map(([x, y]) => ink.P(x, y));
      p.addPath(new Path2D(ink.brush(pts, (t) => 8 + (g.w * 1.35 - 8) * Math.sin(Math.PI * t))));
    }
    return p;
  });
  const hemY = jelly.bell.hemY ?? 150;
  const [hx0, hx1] = jelly.bell.hemX ?? [-215, 215];
  const nStreamers = 5;
  const NODES = 9;

  const S = {
    scale: 0.08,
    x: 0, y: 0, lastY: null, vy: 0,
    bob: 0, bobV: 0,
    c: 0, beatT: -1, nextBeat: 1.2 + Math.random(),
    sink: 0,
    look: { x: 0, y: 0.4 }, dart: null,
    blinkT: -1, nextBlink: 2.5 + Math.random() * 1.7, doubleAt: -1, open: 1,
    variant: 0, prevVariant: 0, morph: 1,
    brainA: 1, brainDY: 0, eyesShut: 0,
    chains: null,
    startle: 0,
  };

  const bellLen = (jelly.streamers?.length ?? 520) * 0.82;

  function anchors() {
    const sx = 1 + 0.07 * S.c - 0.03 * S.sink, sy = 1 - 0.1 * S.c + 0.05 * S.sink;
    const out = [];
    for (let i = 0; i < nStreamers; i++) {
      const f = i / (nStreamers - 1);
      const flare = 1 + 0.1 * S.c * Math.abs(f - 0.5) * 2;
      const hx = (hx0 + (hx1 - hx0) * f) * 0.86 * flare;
      out.push({ x: S.x + hx * S.scale * sx, y: S.y + S.bob + (hemY - 6) * S.scale * sy });
    }
    return out;
  }

  function initChains() {
    const an = anchors();
    const seg = (bellLen * S.scale) / (NODES - 1);
    S.chains = an.map((a, k) => ({
      seg: seg * (0.82 + 0.36 * ((k * 7) % 5) / 4),
      k: k * 1.7,
      n: Array.from({ length: NODES }, (_, i) => ({ x: a.x, y: a.y + i * seg, px: a.x, py: a.y + i * seg })),
    }));
  }

  function beat() { S.beatT = 0; }

  function stepBlink(dt) {
    if (S.blinkT < 0) {
      S.nextBlink -= dt;
      if (S.doubleAt >= 0) {
        S.doubleAt -= dt;
        if (S.doubleAt < 0) { S.blinkT = 0; S.doubleAt = -1; S.nextBlink = 2.5 + Math.random() * 1.7; }
      }
      if (S.nextBlink <= 0) {
        S.blinkT = 0;
        S.nextBlink = 2.5 + Math.random() * 1.7;
        if (Math.random() < 0.14) S.doubleAt = 0.303 + 0.24;
      }
      S.open = 1;
    } else {
      S.blinkT += dt;
      const t = S.blinkT;
      if (t < 0.092) S.open = 1 - smooth(t / 0.092);
      else if (t < 0.118) S.open = 0;
      else if (t < 0.303) S.open = outCubic((t - 0.118) / 0.185);
      else { S.open = 1; S.blinkT = -1; }
    }
  }

  return {
    get x() { return S.x; },
    get y() { return S.y + S.bob; },
    get radius() { return 290 * S.scale; },
    setScale(s) { S.scale = s; S.chains = null; },
    beat,
    poke() { S.startle = 1; beat(); S.dart = { x: (Math.random() - 0.5) * 1.6, y: -0.7, t: 0.5 }; },
    think() {
      S.prevVariant = S.variant;
      S.variant = (S.variant + 1 + Math.floor(Math.random() * (grooves.length - 1))) % grooves.length;
      S.morph = 0;
      const a = Math.random() * TAU;
      S.dart = { x: Math.cos(a), y: Math.sin(a) * 0.7, t: 0.42 };
    },
    glance(x, y, dur = 0.6) { S.dart = { x, y, t: dur }; },
    squint() { S.blinkT = 0; S.doubleAt = 0.3; },
    swapStart() { S.swap = "out"; },
    swapMid() { S.swap = "in"; S.brainDY = -120; S.prevVariant = S.variant = (S.variant + 3) % grooves.length; S.morph = 1; },
    swapDone() { S.swap = null; S.blinkT = 0.118; beat(); },

    // x, y: where the bell should be (canvas px); ptr: pointer in canvas px or null
    update(t, dt, x, y, ptr) {
      S.x = x;
      if (S.lastY == null) S.lastY = y;
      const vyRaw = (y - S.lastY) / Math.max(dt, 1e-3);
      S.lastY = y;
      S.vy += (vyRaw - S.vy) * (1 - Math.exp(-dt / 0.12));
      S.y = y;
      if (!S.chains) initChains();

      // sinking pose vs swimming
      const sinkTarget = clamp(S.vy / 420, 0, 1);
      S.sink += (sinkTarget - S.sink) * (1 - Math.exp(-dt / 0.25));
      const climbing = S.vy < -60;
      if (!reduced) {
        S.nextBeat -= dt;
        if (S.nextBeat <= 0) {
          if (S.sink < 0.5) beat();
          S.nextBeat = climbing ? 0.62 + Math.random() * 0.15 : 2.5 + Math.random() * 0.7;
        }
      }
      // contraction: ~300 ms squeeze, ~900 ms elastic recoil with a small overshoot
      let prevC = S.c;
      if (S.beatT >= 0) {
        S.beatT += dt;
        const b = S.beatT;
        if (b < 0.3) S.c = outCubic(b / 0.3);
        else if (b < 1.2) { const u = (b - 0.3) / 0.9; S.c = Math.exp(-5 * u) * Math.cos(1.2 * Math.PI * u); }
        else { S.c = 0; S.beatT = -1; }
      } else S.c += (0 - S.c) * (1 - Math.exp(-dt / 0.2));
      if (reduced) S.c = 0;
      const dc = S.c - prevC;
      if (dc > 0) S.bobV -= dc * 70;
      S.bobV += (-S.bob * 34 - S.bobV * 7) * dt;
      S.bob += S.bobV * dt;
      S.startle = Math.max(0, S.startle - dt * 1.6);

      // brain swap choreography: the old brain floats up and out, the new one drops in
      if (S.swap === "out") { S.brainA += (0 - S.brainA) * (1 - Math.exp(-dt / 0.35)); S.eyesShut += (1 - S.eyesShut) * (1 - Math.exp(-dt / 0.12)); S.brainDY -= dt * 60; }
      else {
        S.brainA += (1 - S.brainA) * (1 - Math.exp(-dt / 0.3));
        S.brainDY += (0 - S.brainDY) * (1 - Math.exp(-dt / 0.28));
        if (!S.swap) S.eyesShut += (0 - S.eyesShut) * (1 - Math.exp(-dt / 0.1));
      }
      if (S.morph < 1) S.morph = Math.min(1, S.morph + dt / 0.6);

      stepBlink(dt);

      // gaze: pointer in eye space, reach = min(1, dist / 125), smoothed with tau ~55 ms; rests a little low
      let tx = 0, ty = 0.42;
      if (ptr) {
        const dx = ptr.x - S.x, dy = ptr.y - (S.y + S.bob);
        const d = Math.hypot(dx, dy) || 1;
        const reach = Math.min(1, d / 125);
        tx = (dx / d) * reach; ty = (dy / d) * reach;
      }
      if (S.dart) {
        S.dart.t -= dt;
        tx = S.dart.x; ty = S.dart.y;
        if (S.dart.t <= 0) S.dart = null;
      }
      const k = 1 - Math.exp(-dt / 0.055);
      S.look.x += (tx - S.look.x) * k;
      S.look.y += (ty - S.look.y) * k;

      // streamers: verlet chains pinned to the hem; they lag when the diver drops, so they stream upward
      const an = anchors();
      const g = 420, damp = Math.exp(-dt * 3.2), dt2 = dt * dt;
      const mid = (S.chains.length - 1) / 2;
      for (let c = 0; c < S.chains.length; c++) {
        const ch = S.chains[c], N = ch.n;
        N[0].x = an[c].x; N[0].y = an[c].y; N[0].px = an[c].x; N[0].py = an[c].y;
        for (let i = 1; i < N.length; i++) {
          const p = N[i];
          const vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
          p.px = p.x; p.py = p.y;
          const sway = reduced ? 0 : Math.sin(t * 1.5 - i * 0.55 + ch.k) * 70 + Math.sin(t * 0.37 + ch.k) * 25;
          const flare = i < 4 ? ((c - mid) / mid) * Math.max(0, S.c) * 220 : 0;
          // a soft pull back to the hanging pose keeps them from tangling after a hard dive
          const rx = N[0].x + (c - mid) * 0.6 * i - p.x, ry = N[0].y + ch.seg * i - p.y;
          p.x += vx + (sway + flare + rx * 9) * dt2;
          p.y += vy + (g + ry * 3) * dt2;
        }
        for (let it = 0; it < 4; it++) {
          for (let i = 1; i < N.length; i++) {
            const a = N[i - 1], b = N[i];
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 1e-6;
            const f = (d - ch.seg) / d;
            if (i === 1) { b.x -= dx * f; b.y -= dy * f; }
            else { a.x += dx * f * 0.5; a.y += dy * f * 0.5; b.x -= dx * f * 0.5; b.y -= dy * f * 0.5; }
          }
        }
      }
    },

    // alpha: the whole diver fades as one (phones hide it while the page rests)
    draw(ctx, col, ink, alpha = 1) {
      const sc = S.scale, A = alpha;
      // streamers behind the bell
      ctx.globalAlpha = A;
      ctx.fillStyle = col.ink;
      const w0 = Math.max(1.3, 26 * sc), w1 = Math.max(0.7, 7 * sc);
      for (const ch of S.chains) {
        const pts = ink.spline(ch.n, false, 4);
        ribbon(ctx, pts, (u) => w0 + (w1 - w0) * Math.pow(u, 0.75));
      }

      const sx = 1 + 0.07 * S.c - 0.03 * S.sink + 0.04 * S.startle * Math.sin(S.startle * 30);
      const sy = 1 - 0.1 * S.c + 0.05 * S.sink;
      ctx.save();
      ctx.translate(S.x, S.y + S.bob);
      ctx.scale(sc * sx, sc * sy);
      // glass first, a touch lighter than the water so the line behind it softens
      ctx.fillStyle = col.glass;
      ctx.globalAlpha = 0.9 * A;
      ctx.fill(inner);
      ctx.globalAlpha = A;
      ctx.fillStyle = col.ink;
      ctx.fill(rim, "evenodd");

      // brain
      ctx.save();
      ctx.translate(B.tx, B.ty + S.brainDY);
      ctx.scale(B.s, B.s);
      ctx.rotate((B.rot * Math.PI) / 180);
      ctx.globalAlpha = S.brainA * A;
      ctx.fillStyle = col.ink;
      ctx.fill(brain);
      ctx.fillStyle = col.glass;
      if (S.morph < 1) {
        ctx.globalAlpha = S.brainA * (1 - S.morph) * A;
        ctx.fill(grooves[S.prevVariant]);
        ctx.globalAlpha = S.brainA * S.morph * A;
      }
      ctx.fill(grooves[S.variant]);
      ctx.globalAlpha = S.brainA * A;

      // eyes with a clipped eyelid
      // eyelid as a clip: nothing cream is ever drawn above the lid line, so a closed eye is just brain
      const open = Math.min(S.open, 1 - S.eyesShut);
      if (open > 0.04) for (const e of eyes) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate((e.rot * Math.PI) / 180);
        if (open < 0.999) {
          const lid = -e.ry + e.ry * 2 * (1 - open);
          ctx.beginPath();
          ctx.rect(-e.rx - 2, lid, e.rx * 2 + 4, e.ry * 2 + 4);
          ctx.clip();
        }
        ctx.beginPath();
        ctx.ellipse(0, 0, e.rx, e.ry, 0, 0, TAU);
        ctx.fillStyle = col.cream;
        ctx.fill();
        ctx.clip();
        const r = Math.min(e.rx, e.ry), p = r * pupilK * (1 + 0.12 * S.startle);
        const reach = r - p - r * 0.06;
        ctx.beginPath();
        ctx.arc(S.look.x * reach, S.look.y * reach, p, 0, TAU);
        ctx.fillStyle = col.ink;
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();

      ctx.fillStyle = col.cream;
      ctx.globalAlpha = 0.95 * A;
      ctx.fill(glint);
      ctx.restore();
      ctx.globalAlpha = 1;
    },
  };
}
