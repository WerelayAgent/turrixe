// The jar: a hand-inked glass jar on one 2D canvas. Every fee is a bubble that wobbles up from the air stone
// and packs into the foam under the cork. Burns pop bubbles into ink puffs. Too many bubbles coalesce.
// Physics and drawing run in "jar space" (about 470 x 690 units) and are scaled to the canvas.
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const easeOutBack = (t, s = 1.7) => { t = clamp(t, 0, 1) - 1; return 1 + (s + 1) * t * t * t + s * t * t; };
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const D = (svg) => svg.match(/d="([^"]+)"/)[1];

export const VIEW = { x0: -236, y0: -96, w: 472, h: 690 };
// right half of the glass wall's centre line, from under the lip down to the bottom centre
const RIGHT = [[64, 74], [62, 100], [82, 126], [130, 152], [167, 196], [185, 258], [190, 352], [181, 450], [151, 510], [86, 537], [0, 543]];
const NOZ = { x: 0, y: 506 };
const WALL = 9;          // half the glass thickness plus a hair: bubbles keep this far from the centre line
const BUOY = 330, DRAG = 2.5, DRAG_PACK = 5.5, ZIG = 360;

function closedPath(xs, ys, n) {
  const p = new Path2D();
  p.moveTo((xs[n - 1] + xs[0]) / 2, (ys[n - 1] + ys[0]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    p.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[j]) / 2, (ys[i] + ys[j]) / 2);
  }
  p.closePath();
  return p;
}
function addClosed(p, xs, ys, n) {
  p.moveTo((xs[n - 1] + xs[0]) / 2, (ys[n - 1] + ys[0]) / 2);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    p.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[j]) / 2, (ys[i] + ys[j]) / 2);
  }
  p.closePath();
}

// procedural ink blot (seeded): a wobbly disc with a few tendrils that grow late
function blotPts(R, seed, g, n = 40) {
  let a = seed * 9301 + 49297;
  const rnd = () => ((a = (a * 233280 + 49297) % 233280) / 233280);
  const K = 4 + Math.floor(rnd() * 3);
  const tend = Array.from({ length: K }, () => ({ a: rnd() * TAU, len: 0.15 + rnd() * 0.3, w: 0.14 + rnd() * 0.12 }));
  const xs = new Float32Array(n), ys = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const an = (i / n) * TAU;
    let r = 1 + 0.07 * Math.sin(3 * an + seed) + 0.05 * Math.sin(7 * an + 2 * seed);
    for (const t of tend) {
      const d = Math.atan2(Math.sin(an - t.a), Math.cos(an - t.a));
      r += t.len * Math.exp((-d * d) / (2 * t.w * t.w)) * Math.max(0, g * 1.3 - 0.3);
    }
    xs[i] = Math.cos(an) * r * R; ys[i] = Math.sin(an) * r * R;
  }
  return { xs, ys, n };
}

export function createJar(host, { ink, reduced, mobile, onTap }) {
  const cv = document.createElement("canvas");
  cv.className = "vlt__cv";
  cv.setAttribute("aria-hidden", "true");
  host.prepend(cv);
  const g = cv.getContext("2d");
  const INK = ink.INK, CREAM = ink.CREAM;
  let glass = "#8b63f5";

  // ---------- geometry ----------
  const wallCtrl = (side, jit) => RIGHT.map(([x, y], i) => {
    const edge = i === RIGHT.length - 1;
    const asym = side < 0 ? 1 + 0.014 * Math.sin(i * 1.9 + 0.4) : 1;
    return ink.P(edge ? 0 : side * x * asym + (jit ? rand(-jit, jit) : 0), y + (jit && !edge && i > 0 ? rand(-jit, jit) : 0));
  });
  const L0 = ink.spline(wallCtrl(-1, 0), false, 14), R0 = ink.spline(wallCtrl(1, 0), false, 14);
  const loop = [...L0, ...R0.slice().reverse()];
  const poly = { n: 0, ax: null, ay: null };
  {
    const rs = ink.resample([...loop, loop[0]], 6);
    poly.n = rs.length; poly.ax = Float32Array.from(rs.map((p) => p.x)); poly.ay = Float32Array.from(rs.map((p) => p.y));
  }
  const interior = new Path2D();
  interior.moveTo(loop[0].x, loop[0].y);
  for (const p of loop) interior.lineTo(p.x, p.y);
  interior.closePath();

  // the wall, inked three times with a little jitter so it boils like hand animation
  const wallWidth = (side) => (t) => {
    const base = side > 0 ? 10 + 9 * Math.pow(t, 0.8) : 7.5 + 7 * t;
    return base * (1 + 0.1 * Math.sin(t * 11 + side));
  };
  const walls = [0, 1, 2].map((k) => {
    const p = new Path2D();
    const jit = k === 0 ? 0 : 1.1;
    p.addPath(new Path2D(ink.brush(ink.spline(wallCtrl(-1, jit), false, 16), wallWidth(-1))));
    p.addPath(new Path2D(ink.brush(ink.spline(wallCtrl(1, jit), false, 16), wallWidth(1))));
    p.addPath(new Path2D(D(ink.swell([ink.P(-77 + rand(-1, 1) * (k ? 1 : 0), 83), ink.P(-60, 76), ink.P(-30, 73), ink.P(0, 72.5), ink.P(30, 73), ink.P(60, 76), ink.P(77, 83)], { w: 14, wEnds: 7 }))));
    return p;
  });
  const glints = new Path2D();
  glints.addPath(new Path2D(D(ink.swell([ink.P(-148, 212), ink.P(-164, 266), ink.P(-166, 330), ink.P(-157, 384)], { w: 10, wEnds: 2.5 }))));
  glints.addPath(new Path2D(D(ink.swell([ink.P(-100, 146), ink.P(-121, 158), ink.P(-136, 174)], { w: 7, wEnds: 2 }))));
  const glintLow = new Path2D(D(ink.swell([ink.P(153, 446), ink.P(143, 478), ink.P(122, 500)], { w: 5, wEnds: 1.5 })));
  const cork = new Path2D(D(ink.blob([ink.P(-56, 80), ink.P(-61, 60), ink.P(-55, 40), ink.P(0, 33), ink.P(55, 39), ink.P(61, 58), ink.P(56, 80), ink.P(0, 84)])));
  const corkGlint = new Path2D(D(ink.swell([ink.P(-43, 50), ink.P(-46, 62), ink.P(-42, 74)], { w: 5, wEnds: 1.8 })));
  const corkSpecks = new Path2D();
  [[20, 56, 3], [36, 68, 2.2], [-10, 70, 2.6], [6, 62, 1.7]].forEach(([x, y, r]) => {
    const xs = [], ys = [];
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; const rr = r * (1 + 0.25 * Math.sin(a * 2 + x)); xs.push(x + Math.cos(a) * rr); ys.push(y + Math.sin(a) * rr * 0.8); }
    addClosed(corkSpecks, xs, ys, 7);
  });
  const stone = new Path2D(D(ink.blob([ink.P(-21, 541), ink.P(-17, 528), ink.P(-6, 521), ink.P(7, 522), ink.P(17, 529), ink.P(21, 541)])));
  // measuring ticks inked on the glass, like a lab jar
  const ticks = new Path2D();
  for (let i = 0; i < 7; i++) {
    const y = 236 + i * 38, x1 = 168 - (i === 6 ? 6 : 0), long = i % 2 === 0;
    ticks.addPath(new Path2D(D(ink.swell([ink.P(x1, y), ink.P(x1 - (long ? 26 : 14), y + 1.5)], { w: long ? 4.6 : 3.4, wEnds: 1.4 }))));
  }

  // the keeper's tentacles: four short arms from the cork top, gripping the neck
  const ARMS = [
    { c: [[-48, 40], [-60, 66], [-70, 104], [-92, 146], [-112, 170]], w0: 15, w1: 5.5, curl: { r0: 9, r1: 2.8, turns: 1.1, dir: 1 }, k: 0 },
    { c: [[-20, 42], [-26, 70], [-22, 100], [-36, 128]], w0: 11, w1: 4, curl: { r0: 6, r1: 2, turns: 0.95, dir: 1 }, k: 1.7 },
    { c: [[20, 42], [27, 72], [22, 102], [37, 130]], w0: 11, w1: 4, curl: { r0: 6, r1: 2, turns: 0.95, dir: -1 }, k: 3.1 },
    { c: [[48, 40], [61, 68], [72, 106], [94, 148], [113, 172]], w0: 15, w1: 5.5, curl: { r0: 9, r1: 2.8, turns: 1.1, dir: -1 }, k: 4.4 },
  ];
  let arms = null, armsAt = -1;
  function buildArms(t) {
    const p = new Path2D();
    for (const a of ARMS) {
      const pts = a.c.map(([x, y], i) => ink.P(x + (i > 1 ? Math.sin(t * 0.9 + a.k + i) * 1.6 * i : 0), y + (i > 1 ? Math.cos(t * 0.7 + a.k) * 1.2 : 0)));
      p.addPath(new Path2D(D(ink.tentacle(pts, { w0: a.w0, w1: a.w1, curl: a.curl }))));
    }
    return p;
  }

  // ---------- canvas sizing ----------
  let cw = 1, ch = 1, dpr = 1, s = 1, ox = 0, oy = 0;
  function resize() {
    const r = host.getBoundingClientRect();
    cw = Math.max(1, r.width); ch = Math.max(1, r.height);
    dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    s = Math.min(cw / VIEW.w, ch / VIEW.h);
    ox = (cw - VIEW.w * s) / 2 - VIEW.x0 * s;
    oy = (ch - VIEW.h * s) / 2 - VIEW.y0 * s;
  }

  // ---------- bubbles ----------
  const bubbles = [];
  const fx = [];             // pops: spray, droplets, ink puff
  const MAX = mobile ? 40 : 52, MIN = 10;
  let now = 0, seq = 0, nextSpawn = 0;
  const queue = [];          // fees waiting for the air stone
  const popQueue = [];       // [{at, b}]
  let bob = 0, rot = 0, rotV = 0, lift = 0, liftV = 0, stoneK = 0, quake = 0;
  const near = { x: 0, y: 0, d: 0 };

  function make(x, y, r, o = {}) {
    return { id: ++seq, x, y, vx: 0, vy: 0, r, rT: r, state: "pack", born: now, age: 99, ph: rand(0, TAU), ph2: rand(0, TAU), wob: 0.02, fee: 0, at: 0, old: true, tag: null, ...o };
  }
  function seed(n) {
    for (let i = 0; i < n; i++) {
      const r = 8 + 15 * Math.sqrt(Math.random());
      bubbles.push(make(rand(-130, 130), rand(150, 380), r));
    }
    for (let i = 0; i < 420; i++) step(1 / 60, i / 60);
    for (const b of bubbles) { b.vx = 0; b.vy = 0; }
  }

  function inside(x, y) {
    let c = false;
    const { n, ax, ay } = poly;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      if ((ay[i] > y) !== (ay[j] > y) && x < ((ax[j] - ax[i]) * (y - ay[i])) / (ay[j] - ay[i]) + ax[i]) c = !c;
    }
    return c;
  }
  function nearest(x, y) {
    let best = Infinity, bx = 0, by = 0;
    const { n, ax, ay } = poly;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const x1 = ax[j], y1 = ay[j], dx = ax[i] - x1, dy = ay[i] - y1;
      const l2 = dx * dx + dy * dy || 1;
      let t = ((x - x1) * dx + (y - y1) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = x1 + dx * t, py = y1 + dy * t, d = (x - px) * (x - px) + (y - py) * (y - py);
      if (d < best) { best = d; bx = px; by = py; }
    }
    near.x = bx; near.y = by; near.d = Math.sqrt(best);
  }

  let stir = null;           // {x, y, vx, vy} in jar space while the pointer is over the jar
  function step(dt, t) {
    const n = bubbles.length;
    for (let i = 0; i < n; i++) {
      const b = bubbles[i];
      b.age += dt;
      b.r += (b.rT - b.r) * (1 - Math.exp(-dt / (b.state === "rise" && b.age < 0.5 ? 0.09 : 0.25)));
      let ax = 0, ay = -BUOY * (0.55 + 0.45 * Math.min(1, b.r / 14));
      if (b.state === "rise") ax += ZIG * Math.sin(t * 5.4 + b.ph) * Math.min(1, b.age * 2);
      if (stir) {
        const dx = b.x - stir.x, dy = b.y - stir.y, d = Math.hypot(dx, dy) || 1, R = 70 + b.r;
        if (d < R) {
          const f = (1 - d / R) * (900 + Math.min(2600, Math.hypot(stir.vx, stir.vy) * 6));
          ax += (dx / d) * f + stir.vx * 0.9 * (1 - d / R); ay += (dy / d) * f + stir.vy * 0.9 * (1 - d / R);
          b.wob = Math.max(b.wob, 0.05);
        }
      }
      if (quake > 0) { ax += rand(-1, 1) * 2400 * quake; ay += rand(-1, 1) * 2400 * quake; }
      b.vx += ax * dt; b.vy += ay * dt;
      const damp = Math.exp(-(b.state === "pack" ? DRAG_PACK : DRAG) * dt);
      b.vx *= damp; b.vy *= damp;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.wob += (0.014 - b.wob) * (1 - Math.exp(-dt / 0.9));
    }
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < n; i++) {
        const a = bubbles[i];
        for (let j = i + 1; j < n; j++) {
          const b = bubbles[j];
          const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r + 1.4;
          if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.01, nx = dx / d, ny = dy / d, over = min - d;
          const ma = a.r * a.r, mb = b.r * b.r, wa = mb / (ma + mb), wb = ma / (ma + mb);
          a.x -= nx * over * wa; a.y -= ny * over * wa;
          b.x += nx * over * wb; b.y += ny * over * wb;
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) { const k = rv * 0.6; a.vx += nx * k * wa; a.vy += ny * k * wa; b.vx -= nx * k * wb; b.vy -= ny * k * wb; }
          if (a.state === "rise" && b.state === "pack" && a.age > 0.4) settle(a);
          if (b.state === "rise" && a.state === "pack" && b.age > 0.4) settle(b);
        }
      }
      for (let i = 0; i < n; i++) {
        const b = bubbles[i];
        nearest(b.x, b.y);
        const want = b.r + WALL;
        const isIn = inside(b.x, b.y);
        if (isIn && near.d >= want) continue;
        let nx, ny;
        if (isIn) { nx = (b.x - near.x) / (near.d || 1); ny = (b.y - near.y) / (near.d || 1); }
        else { nx = (near.x - b.x) / (near.d || 1); ny = (near.y - b.y) / (near.d || 1); }
        b.x = near.x + nx * want; b.y = near.y + ny * want;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= nx * vn * 1.2; b.vy -= ny * vn * 1.2; }
        if (b.state === "rise" && b.age > 0.6 && b.y < 330) settle(b);
      }
    }
  }
  function settle(b) {
    b.state = "pack";
    b.wob = 0.07;
    liftV -= 10 * (b.r / 18);           // a docked bubble makes the jar a touch more buoyant
    if (b.tag) b.tag.fade = now;
  }

  function spawn(fee, at, tagEl) {
    const rT = clamp(8 + 16 * Math.sqrt(fee / 0.034), 7, 26);
    const b = make(NOZ.x + rand(-3, 3), NOZ.y - 4, 0.5, { rT, state: "rise", age: 0, old: false, fee, at, vy: -40, wob: 0.09 });
    b.tag = tagEl ? { el: tagEl, fade: 0 } : null;
    bubbles.push(b);
    stoneK = 1;
    coalesce();
  }
  function coalesce() {
    let guard = 4;
    while (bubbles.filter((b) => b.state !== "merge").length > MAX && guard-- > 0) {
      let best = null, bestR = Infinity;
      for (const b of bubbles) if (b.state === "pack" && b.rT < bestR) { best = b; bestR = b.rT; }
      if (!best) return;
      let mate = null, md = Infinity;
      for (const o of bubbles) {
        if (o === best || o.state !== "pack" || o.rT > 30) continue;
        const d = Math.hypot(o.x - best.x, o.y - best.y) - o.r - best.r;
        if (d < md) { md = d; mate = o; }
      }
      if (!mate) return;
      best.state = "merge"; best.into = mate; best.m0 = now; best.mx = best.x; best.my = best.y; best.mr = best.r;
      mate.rT = Math.min(32, Math.sqrt(mate.rT * mate.rT + best.rT * best.rT));
      mate.wob = 0.08;
    }
  }

  function popNow(b) {
    const i = bubbles.indexOf(b);
    if (i < 0) return;
    bubbles.splice(i, 1);
    if (b.tag) { b.tag.el.remove(); b.tag = null; }
    fx.push({ x: b.x, y: b.y, r: b.r, t0: now, seed: Math.floor(rand(1, 999)), rays: Array.from({ length: 7 }, (_, k) => ({ a: (k / 7) * TAU + rand(-0.25, 0.25), l: rand(0.8, 1.3) })), drops: Array.from({ length: 4 }, () => ({ a: rand(0, TAU), l: rand(1.3, 2.1), s: rand(2, 3.6) })) });
    // neighbours lean into the gap
    for (const o of bubbles) {
      const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy) || 1;
      if (d < b.r * 3) { o.vx += (dx / d) * 40; o.vy += (dy / d) * 40; o.wob = 0.08; }
    }
    liftV += 14 * (b.r / 18);
  }

  // ---------- drawing ----------
  const BX = new Float32Array(20), BY = new Float32Array(20), IX = new Float32Array(20), IY = new Float32Array(20);
  function drawBubble(b, t, scale = 1) {
    const n = b.r > 14 ? 18 : 14;
    const sp = Math.hypot(b.vx, b.vy);
    const flat = b.state === "rise" ? 0.11 * Math.min(1, sp / 110) : 0;
    const r = b.r * scale;
    if (r < 0.6) return;
    const w1 = Math.sin(t * 8.5 + b.ph), w2 = Math.sin(t * 11 + b.ph2);
    const th = clamp(r * 0.2, 2.1, 5.6), off = th * 0.45;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, c2 = Math.cos(2 * a), s3 = Math.sin(3 * a + b.ph2);
      const k = 1 + flat * c2 + b.wob * (w1 * Math.cos(2 * a + b.ph) + 0.6 * w2 * s3) + 0.012 * Math.sin(t * 1.3 + b.ph + a * 2);
      const ca = Math.cos(a), sa = Math.sin(a);
      BX[i] = b.x + ca * r * k; BY[i] = b.y + sa * r * k * (1 - flat * 0.4);
      const ri = (r - th) * k;
      IX[i] = b.x - off + ca * ri; IY[i] = b.y - off + sa * ri * (1 - flat * 0.4);
    }
    const p = new Path2D();
    addClosed(p, BX, BY, n);
    const air = closedPath(IX, IY, n);
    g.fillStyle = "rgba(253,241,216,0.085)";
    g.fill(air);
    addClosed(p, IX, IY, n);
    g.fillStyle = INK;
    g.fill(p, "evenodd");
    if (r > 6.5) {
      // glint crescent, top left
      const a0 = 3.45, a1 = 4.35, R0 = r * 0.62, T = r * 0.17;
      g.beginPath();
      for (let i = 0; i <= 8; i++) { const a = a0 + ((a1 - a0) * i) / 8; g.lineTo(b.x - off * 0.5 + Math.cos(a) * R0, b.y - off * 0.5 + Math.sin(a) * R0); }
      for (let i = 8; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / 8, tt = Math.sin((Math.PI * i) / 8); g.lineTo(b.x - off * 0.5 + Math.cos(a) * (R0 - T * tt), b.y - off * 0.5 + Math.sin(a) * (R0 - T * tt)); }
      g.closePath();
      g.fillStyle = CREAM;
      g.fill();
    }
  }
  function drawFx(f, t) {
    const age = now - f.t0;
    // ink puff: a blot that blooms and thins out, like ink let go in water
    const pg = clamp(age / 1.25, 0, 1);
    if (pg < 1) {
      const bl = blotPts(f.r * (0.55 + 1.05 * easeOutCubic(pg)), f.seed, pg, 48);
      for (let i = 0; i < bl.n; i++) { bl.xs[i] += f.x + Math.sin(t * 2 + i) * 0.6; bl.ys[i] += f.y - pg * 10; }
      const fade = clamp((pg - 0.2) / 0.8, 0, 1);
      g.globalAlpha = 0.94 * (1 - fade * fade * (3 - 2 * fade));
      g.fillStyle = INK;
      g.fill(closedPath(bl.xs, bl.ys, bl.n));
      g.globalAlpha = 1;
    }
    // spray: tapered ink dashes thrown off the burst
    const sg = clamp(age / 0.5, 0, 1);
    if (sg < 1) {
      const e = easeOutCubic(sg);
      g.fillStyle = INK;
      for (const ray of f.rays) {
        const r0 = f.r * (0.9 + 0.9 * e), r1 = f.r * (1.15 + 1.25 * e * ray.l), w = Math.max(0.4, 3.4 * (1 - sg));
        const c = Math.cos(ray.a), s2 = Math.sin(ray.a);
        g.beginPath();
        g.moveTo(f.x + c * r0 - s2 * w, f.y + s2 * r0 + c * w);
        g.lineTo(f.x + c * r1, f.y + s2 * r1);
        g.lineTo(f.x + c * r0 + s2 * w, f.y + s2 * r0 - c * w);
        g.closePath();
        g.fill();
      }
      g.fillStyle = CREAM;
      for (const d of f.drops) {
        const rr = f.r * d.l * (0.7 + 0.5 * e), sz = d.s * (1 - sg);
        if (sz < 0.3) continue;
        g.beginPath();
        g.ellipse(f.x + Math.cos(d.a) * rr, f.y + Math.sin(d.a) * rr, sz, sz * 0.8, d.a, 0, TAU);
        g.fill();
      }
    }
    return age < 1.3;
  }

  function draw(t) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    g.save();
    g.translate(ox, oy);
    g.scale(s, s);
    g.translate(0, bob + lift);
    g.translate(0, 320); g.rotate(rot); g.translate(0, -320);
    g.fillStyle = glass;
    g.fill(interior);
    g.save();
    g.clip(interior);
    // air stone squashes when it lets a bubble go
    g.save();
    g.translate(0, 540); g.scale(1 + 0.18 * stoneK, 1 - 0.22 * stoneK); g.translate(0, -540);
    g.fillStyle = INK;
    g.fill(stone);
    g.restore();
    for (const b of bubbles) {
      if (b.state === "merge") {
        const k = clamp((now - b.m0) / 0.42, 0, 1), e = easeOutCubic(k);
        b.x = b.mx + (b.into.x - b.mx) * e; b.y = b.my + (b.into.y - b.my) * e;
        drawBubble(b, t, 1 - e);
        continue;
      }
      drawBubble(b, t);
    }
    for (let i = fx.length - 1; i >= 0; i--) if (!drawFx(fx[i], t)) fx.splice(i, 1);
    g.restore();
    g.fillStyle = INK;
    g.globalAlpha = 0.8;
    g.fill(ticks);
    g.globalAlpha = 1;
    g.fillStyle = CREAM;
    g.fill(glints);
    g.globalAlpha = 0.7;
    g.fill(glintLow);
    g.globalAlpha = 1;
    g.fillStyle = INK;
    g.fill(walls[reduced ? 0 : boilIdx]);
    g.fill(cork);
    g.fillStyle = CREAM;
    g.globalAlpha = 0.85;
    g.fill(corkGlint);
    g.globalAlpha = 0.5;
    g.fill(corkSpecks);
    g.globalAlpha = 1;
    if (!arms || (!reduced && t - armsAt > 0.083)) { arms = buildArms(reduced ? 0 : t); armsAt = t; }
    g.fillStyle = INK;
    g.fill(arms);
    g.restore();
  }

  // ---------- public ----------
  let boilIdx = 0, boilAt = 0, visible = false;
  function frame(t, dt) {
    now = t;
    // fees waiting at the air stone leave one at a time
    if (queue.length && t >= nextSpawn) { const q = queue.shift(); spawn(q.fee, q.at, q.tag); nextSpawn = t + 0.42; }
    for (let i = popQueue.length - 1; i >= 0; i--) if (t >= popQueue[i].at) { const p = popQueue.splice(i, 1)[0]; popNow(p.b); }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (b.state === "merge" && now - b.m0 > 0.42) { if (b.tag) b.tag.el.remove(); bubbles.splice(i, 1); }
    }
    const sub = dt > 1 / 45 ? 2 : 1;
    for (let k = 0; k < sub; k++) step(dt / sub, t);
    quake *= Math.exp(-dt / 0.35);
    if (quake < 0.01) quake = 0;
    stoneK *= Math.exp(-dt / 0.16);
    bob = reduced ? 0 : Math.sin(t * 0.55) * 4 + Math.sin(t * 0.23 + 1) * 2;
    const ra = -38 * (rot - Math.sin(t * 0.41) * 0.008) - 4.2 * rotV;
    rotV += ra * dt; rot += rotV * dt;
    const la = -30 * lift - 6 * liftV;
    liftV += la * dt; lift += liftV * dt;
    if (t - boilAt > 0.125) { boilAt = t; boilIdx = (boilIdx + 1) % walls.length; }
    draw(t);
    return { bob: bob + lift, rot };
  }

  // client px -> jar space; r: the jar's box when the caller already read it this frame (else it is read here)
  function toJar(cx, cy, r = cv.getBoundingClientRect()) {
    return { x: (cx - r.left - ox) / s, y: (cy - r.top - oy) / s - bob - lift };
  }
  function toClient(x, y) {
    const r = cv.getBoundingClientRect();
    return { x: r.left + ox + x * s, y: r.top + oy + (y + bob + lift) * s };
  }
  // jar space -> px from the jar box's top left (the canvas fills the box): no layout read
  function toBox(x, y) {
    return { x: ox + x * s, y: oy + (y + bob + lift) * s };
  }

  resize();
  seed(mobile ? 30 : 36);

  return {
    resize,
    frame,
    setGlass(c) { glass = c; },
    setVisible(v) { visible = v; },
    setStir(p) { stir = p; },
    toJar, toClient, toBox,
    get scale() { return s; },
    get offset() { return { x: ox, y: oy }; },
    bubbles,
    isInside: (x, y) => inside(x, y),
    addFee(fee, at, tagEl) {
      if (!visible || reduced) {
        // off screen (or reduced motion): the fee joins the foam directly, no journey
        const rT = clamp(8 + 16 * Math.sqrt(fee / 0.034), 7, 26);
        bubbles.push(make(rand(-80, 80), rand(160, 240), rT, { old: false, fee, at }));
        coalesce();
        if (reduced) { for (let i = 0; i < 120; i++) step(1 / 60, now + i / 60); draw(now); }
        tagEl?.remove();
        return;
      }
      if (queue.length > 4) { const q = queue.shift(); q.tag?.remove(); }
      queue.push({ fee, at, tag: tagEl });
    },
    burn(count) {
      const packed = bubbles.filter((b) => b.state === "pack" && !popQueue.some((p) => p.b === b));
      const n = Math.min(count, Math.max(0, packed.length - MIN));
      // oldest first, with a little luck in the order
      packed.sort((a, b) => (a.old === b.old ? a.born - b.born : a.old ? -1 : 1) + rand(-0.3, 0.3));
      for (let i = 0; i < n; i++) {
        const b = packed[i];
        if (!visible || reduced) { const k = bubbles.indexOf(b); if (k >= 0) bubbles.splice(k, 1); continue; }
        b.wob = 0.16;
        popQueue.push({ at: now + 0.14 + i * 0.17, b });
      }
      if (reduced) { for (let i = 0; i < 120; i++) step(1 / 60, now + i / 60); draw(now); }
      return n;
    },
    quake() { if (reduced) return; quake = 1; rotV += 0.05; for (const b of bubbles) b.wob = 0.1; },
    tap(x, y) {
      rotV += (x > 0 ? 1 : -1) * 0.06;
      for (const b of bubbles) {
        const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy) || 1;
        const f = Math.max(0, 1 - d / 260) * 260;
        b.vx += (dx / d) * f + rand(-30, 30); b.vy += (dy / d) * f + rand(-30, 30);
        b.wob = 0.12;
      }
      onTap?.();
    },
    hit(x, y) {
      for (const b of bubbles) if (b.state !== "merge" && Math.hypot(b.x - x, b.y - y) < b.r + 3) return b;
      return null;
    },
    drawStatic() { draw(0); },
  };
}
