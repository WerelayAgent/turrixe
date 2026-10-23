// Station ii's jar: the same glass jar as the vault below, drawn small in SVG.
// The outline, lip, cork, glints, ticks and air stone are the vault's own (copied from js/modules/vault/jar.js,
// in the same "jar units", about 400 x 520), and so is the physics: every fee leaves the air stone as an
// ink-rimmed bubble, wobbles up and packs under the cork. Burns pop the oldest into ink. Too many coalesce.
const NS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const out3 = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;
const rand = (a, b) => a + Math.random() * (b - a);
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const D = (svg) => svg.match(/d="([^"]+)"/)[1];

// right half of the glass wall's centre line, from under the lip down to the bottom centre (vault/jar.js)
const RIGHT = [[64, 74], [62, 100], [82, 126], [130, 152], [167, 196], [185, 258], [190, 352], [181, 450], [151, 510], [86, 537], [0, 543]];
const NOZ = { x: 0, y: 506 };
const WALL = 9;
const BUOY = 330, DRAG = 2.5, DRAG_PACK = 5.5, ZIG = 360;
// extents in jar units: cork top, outside of the base, half width, and the point that sits on the station centre
export const JAR = { top: 30, bottom: 553, half: 200, mid: 300, pivot: 320 };

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function qPath(xs, ys, n) {
  let s = `M${f1((xs[n - 1] + xs[0]) / 2)} ${f1((ys[n - 1] + ys[0]) / 2)}`;
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1;
    s += `Q${f1(xs[i])} ${f1(ys[i])} ${f1((xs[i] + xs[j]) / 2)} ${f1((ys[i] + ys[j]) / 2)}`;
  }
  return s + "Z";
}
// an ink blot that grows a few tendrils as it spreads (vault/jar.js), as point arrays
function blot(R, seed, g, n, cx, cy) {
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
    xs[i] = cx + Math.cos(an) * r * R; ys[i] = cy + Math.sin(an) * r * R;
  }
  return qPath(xs, ys, n);
}

// root: an SVG <g> in jar units. defs: where the clip path goes. weight: stroke boost for the small size.
export function createHowJar(root, { ink, defs, clipId, reduced, mobile, weight = 1.3 }) {
  const P = ink.P;
  // ---------- geometry (the vault's jar) ----------
  const wallCtrl = (side) => RIGHT.map(([x, y], i) => {
    const edge = i === RIGHT.length - 1;
    const asym = side < 0 ? 1 + 0.014 * Math.sin(i * 1.9 + 0.4) : 1;
    return P(edge ? 0 : side * x * asym, y);
  });
  const Ls = ink.spline(wallCtrl(-1), false, 14), Rs = ink.spline(wallCtrl(1), false, 14);
  const loop = [...Ls, ...Rs.slice().reverse()];
  const rs = ink.resample([...loop, loop[0]], 6);
  const poly = { n: rs.length, ax: Float32Array.from(rs, (p) => p.x), ay: Float32Array.from(rs, (p) => p.y) };
  const interiorD = "M" + loop.map((p) => `${f1(p.x)} ${f1(p.y)}`).join("L") + "Z";
  const wallWidth = (side) => (t) => weight * (side > 0 ? 10 + 9 * Math.pow(t, 0.8) : 7.5 + 7 * t) * (1 + 0.1 * Math.sin(t * 11 + side));
  const lip = D(ink.swell([P(-77, 83), P(-60, 76), P(-30, 73), P(0, 72.5), P(30, 73), P(60, 76), P(77, 83)], { w: 14 * weight, wEnds: 7 * weight }));
  const wallsD = ink.brush(ink.spline(wallCtrl(-1), false, 16), wallWidth(-1)) + ink.brush(ink.spline(wallCtrl(1), false, 16), wallWidth(1)) + lip;
  const glintsD = D(ink.swell([P(-148, 212), P(-164, 266), P(-166, 330), P(-157, 384)], { w: 12, wEnds: 2.5 })) +
    D(ink.swell([P(-100, 146), P(-121, 158), P(-136, 174)], { w: 8.5, wEnds: 2 }));
  const glintLowD = D(ink.swell([P(153, 446), P(143, 478), P(122, 500)], { w: 6.5, wEnds: 1.5 }));
  const corkD = D(ink.blob([P(-56, 80), P(-61, 60), P(-55, 40), P(0, 33), P(55, 39), P(61, 58), P(56, 80), P(0, 84)]));
  const corkGlintD = D(ink.swell([P(-43, 50), P(-46, 62), P(-42, 74)], { w: 6.5, wEnds: 2 }));
  let specks = "";
  [[20, 56, 3.4], [36, 68, 2.6], [-10, 70, 3], [6, 62, 2]].forEach(([x, y, r]) => {
    const xs = [], ys = [];
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU, rr = r * (1 + 0.25 * Math.sin(a * 2 + x)); xs.push(x + Math.cos(a) * rr); ys.push(y + Math.sin(a) * rr * 0.8); }
    specks += qPath(xs, ys, 7);
  });
  const stoneD = D(ink.blob([P(-21, 541), P(-17, 528), P(-6, 521), P(7, 522), P(17, 529), P(21, 541)]));
  let ticksD = "";
  for (let i = 0; i < 7; i++) {
    const y = 236 + i * 38, x1 = 168 - (i === 6 ? 6 : 0), long = i % 2 === 0;
    ticksD += D(ink.swell([P(x1, y), P(x1 - (long ? 26 : 14), y + 1.5)], { w: (long ? 4.6 : 3.4) * weight, wEnds: 1.6 }));
  }

  // ---------- elements, back to front (the vault's drawing order) ----------
  const clip = el("clipPath", { id: clipId }, defs);
  el("path", { d: interiorD }, clip);
  const glass = el("path", { class: "how__glass", d: interiorD }, root);
  const inside = el("g", { "clip-path": `url(#${clipId})` }, root);
  const stoneEl = el("path", { class: "how__ink", d: stoneD }, inside);
  const airEl = el("path", { class: "how__air" }, inside);
  const rimEl = el("path", { class: "how__ink", "fill-rule": "evenodd" }, inside);
  const shineEl = el("path", { class: "how__cream" }, inside);
  const puffEls = [0, 1, 2].map(() => el("path", { class: "how__ink" }, inside));
  el("path", { class: "how__ink how__ticks", d: ticksD }, root);
  el("path", { class: "how__cream how__jarglint", d: glintsD }, root);
  el("path", { class: "how__cream how__glintlow", d: glintLowD }, root);
  el("path", { class: "how__ink", d: wallsD }, root);
  el("path", { class: "how__ink", d: corkD }, root);
  el("path", { class: "how__cream how__corkglint", d: corkGlintD }, root);
  el("path", { class: "how__cream how__specks", d: specks }, root);

  // ---------- bubbles ----------
  const bubbles = [];
  const fx = [];
  const MAX = mobile ? 34 : 40, MIN = 12;
  const SIZE = 0.8;                  // smaller than the vault's, so a small jar still holds a crowd of fees
  const rOf = (fee) => clamp(SIZE * (8 + 16 * Math.sqrt(Math.max(0, fee) / 0.034)), 6, 19);
  let now = 0, seq = 0, scale = 0.42;
  let bob = 0, rot = 0, rotV = 0, lift = 0, liftV = 0, stoneK = 0;
  const near = { x: 0, y: 0, d: 0 };
  const make = (x, y, r, o = {}) => ({ id: ++seq, x, y, vx: 0, vy: 0, r, rT: r, state: "pack", born: now, age: 99, ph: rand(0, TAU), ph2: rand(0, TAU), wob: 0.02, old: true, ...o });

  function isIn(x, y) {
    let c = false;
    const { n, ax, ay } = poly;
    for (let i = 0, j = n - 1; i < n; j = i++) if ((ay[i] > y) !== (ay[j] > y) && x < ((ax[j] - ax[i]) * (y - ay[i])) / (ay[j] - ay[i]) + ax[i]) c = !c;
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

  function settle(b) {
    b.state = "pack";
    b.wob = 0.07;
    liftV -= 10 * (b.r / 18);           // a docked bubble makes the jar a touch more buoyant
  }
  function step(dt, t, stir) {
    const n = bubbles.length;
    for (let i = 0; i < n; i++) {
      const b = bubbles[i];
      if (b.state === "merge") continue;
      b.age += dt;
      b.r += (b.rT - b.r) * (1 - Math.exp(-dt / (b.state === "rise" && b.age < 0.5 ? 0.09 : 0.25)));
      let ax = 0, ay = -BUOY * (0.55 + 0.45 * Math.min(1, b.r / 14));
      if (b.state === "rise") ax += ZIG * Math.sin(t * 5.4 + b.ph) * Math.min(1, b.age * 2);
      if (stir) {
        const dx = b.x - stir.x, dy = b.y - stir.y, d = Math.hypot(dx, dy) || 1, R = 80 + b.r;
        if (d < R) {
          const f = (1 - d / R) * (900 + Math.min(2600, Math.hypot(stir.vx, stir.vy) * 6));
          ax += (dx / d) * f + stir.vx * 0.9 * (1 - d / R); ay += (dy / d) * f + stir.vy * 0.9 * (1 - d / R);
          b.wob = Math.max(b.wob, 0.05);
        }
      }
      b.vx += ax * dt; b.vy += ay * dt;
      const damp = Math.exp(-(b.state === "pack" ? DRAG_PACK : DRAG) * dt);
      b.vx *= damp; b.vy *= damp;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.wob += (0.014 - b.wob) * (1 - Math.exp(-dt / 0.9));
    }
    for (let it = 0; it < 2; it++) {
      for (let i = 0; i < n; i++) {
        const a = bubbles[i];
        if (a.state === "merge") continue;
        for (let j = i + 1; j < n; j++) {
          const b = bubbles[j];
          if (b.state === "merge") continue;
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
        if (b.state === "merge") continue;
        nearest(b.x, b.y);
        const want = b.r + WALL;
        const inn = isIn(b.x, b.y);
        if (inn && near.d >= want) continue;
        let nx, ny;
        if (inn) { nx = (b.x - near.x) / (near.d || 1); ny = (b.y - near.y) / (near.d || 1); }
        else { nx = (near.x - b.x) / (near.d || 1); ny = (near.y - b.y) / (near.d || 1); }
        b.x = near.x + nx * want; b.y = near.y + ny * want;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= nx * vn * 1.2; b.vy -= ny * vn * 1.2; }
        if (b.state === "rise" && b.age > 0.6 && b.y < 330) settle(b);
      }
    }
  }
  function coalesce() {
    let guard = 4;
    while (bubbles.filter((b) => b.state !== "merge").length > MAX && guard-- > 0) {
      let best = null, bestR = Infinity;
      for (const b of bubbles) if (b.state === "pack" && b.rT < bestR) { best = b; bestR = b.rT; }
      if (!best) return;
      let mate = null, md = Infinity;
      for (const o of bubbles) {
        if (o === best || o.state !== "pack" || o.rT > 24) continue;
        const d = Math.hypot(o.x - best.x, o.y - best.y) - o.r - best.r;
        if (d < md) { md = d; mate = o; }
      }
      if (!mate) return;
      Object.assign(best, { state: "merge", into: mate, m0: now, mx: best.x, my: best.y });
      mate.rT = Math.min(24, Math.sqrt(mate.rT * mate.rT + best.rT * best.rT));
      mate.wob = 0.08;
    }
  }
  function seed(n) {
    for (let i = 0; i < n; i++) bubbles.push(make(rand(-130, 130), rand(140, 380), SIZE * (8 + 15 * Math.sqrt(Math.random()))));
    for (let i = 0; i < 360; i++) step(1 / 60, i / 60, null);
    for (const b of bubbles) { b.vx = 0; b.vy = 0; }
  }
  function pop(b) {
    const i = bubbles.indexOf(b);
    if (i < 0) return;
    bubbles.splice(i, 1);
    fx.push({ x: b.x, y: b.y, r: b.r, t0: now, seed: Math.floor(rand(1, 999)), rays: Array.from({ length: 7 }, (_, k) => ({ a: (k / 7) * TAU + rand(-0.25, 0.25), l: rand(0.8, 1.3) })), drops: Array.from({ length: 4 }, () => ({ a: rand(0, TAU), l: rand(1.3, 2.1), s: rand(2.6, 4.4) })) });
    if (fx.length > puffEls.length) fx.shift();
    for (const o of bubbles) {                      // neighbours lean into the gap
      const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy) || 1;
      if (d < b.r * 3) { o.vx += (dx / d) * 40; o.vy += (dy / d) * 40; o.wob = 0.08; }
    }
    liftV += 14 * (b.r / 18);
  }

  // ---------- drawing ----------
  const BX = new Float32Array(16), BY = new Float32Array(16), IX = new Float32Array(16), IY = new Float32Array(16);
  function draw(t) {
    let rim = "", air = "", shine = "";
    for (const b of bubbles) {
      let sc = 1;
      if (b.state === "merge") {
        const e = out3((now - b.m0) / 0.42);
        b.x = b.mx + (b.into.x - b.mx) * e; b.y = b.my + (b.into.y - b.my) * e;
        sc = 1 - e;
      }
      const r = b.r * sc;
      if (r < 1.2) continue;
      const rPx = r * scale;
      const n = rPx > 5 ? 12 : 9;
      const sp = Math.hypot(b.vx, b.vy);
      const flat = b.state === "rise" ? 0.11 * Math.min(1, sp / 110) : 0;
      const w1 = reduced ? 0 : Math.sin(t * 8.5 + b.ph), w2 = reduced ? 0 : Math.sin(t * 11 + b.ph2);
      const th = clamp(rPx * 0.27 + 0.45, 1.3, 2.7) / scale, off = th * 0.45;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const k = 1 + flat * Math.cos(2 * a) + b.wob * (w1 * Math.cos(2 * a + b.ph) + 0.6 * w2 * Math.sin(3 * a + b.ph2)) + 0.012 * Math.sin(t * 1.3 + b.ph + a * 2);
        const ca = Math.cos(a), sa = Math.sin(a) * (1 - flat * 0.4);
        BX[i] = b.x + ca * r * k; BY[i] = b.y + sa * r * k;
        const ri = Math.max(0.6, r - th) * k;
        IX[i] = b.x - off + ca * ri; IY[i] = b.y - off + sa * ri;
      }
      const inner = qPath(IX, IY, n);
      rim += qPath(BX, BY, n) + inner;
      air += inner;
      if (rPx > 3.8) {                     // the glint crescent, top left
        const a0 = 3.45, a1 = 4.4, R0 = r * 0.6, T = Math.max(r * 0.2, 1.1 / scale);
        const cx = b.x - off * 0.5, cy = b.y - off * 0.5;
        let s = "";
        for (let i = 0; i <= 6; i++) { const a = a0 + ((a1 - a0) * i) / 6; s += `${i ? "L" : "M"}${f1(cx + Math.cos(a) * R0)} ${f1(cy + Math.sin(a) * R0)}`; }
        for (let i = 6; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / 6, tt = Math.sin((Math.PI * i) / 6); s += `L${f1(cx + Math.cos(a) * (R0 - T * tt))} ${f1(cy + Math.sin(a) * (R0 - T * tt))}`; }
        shine += s + "Z";
      }
    }
    // burns: an ink puff that blooms and thins out, a spray of dashes and a few cream droplets
    for (let i = 0; i < puffEls.length; i++) {
      const f = fx[i], e = puffEls[i];
      if (!f) { if (e._on) { e.setAttribute("d", ""); e._on = false; } continue; }
      const age = now - f.t0, pg = clamp(age / 1.25, 0, 1);
      let d = blot(f.r * (0.55 + 1.05 * out3(pg)), f.seed, pg, 30, f.x, f.y - pg * 10);
      const sg = clamp(age / 0.5, 0, 1);
      if (sg < 1) {
        const k = out3(sg);
        for (const ray of f.rays) {
          const r0 = f.r * (0.9 + 0.9 * k), r1 = f.r * (1.15 + 1.25 * k * ray.l), w = Math.max(0.6, 4.2 * (1 - sg));
          const c = Math.cos(ray.a), s2 = Math.sin(ray.a);
          d += `M${f1(f.x + c * r0 - s2 * w)} ${f1(f.y + s2 * r0 + c * w)}L${f1(f.x + c * r1)} ${f1(f.y + s2 * r1)}L${f1(f.x + c * r0 + s2 * w)} ${f1(f.y + s2 * r0 - c * w)}Z`;
        }
        for (const dr of f.drops) {
          const rr = f.r * dr.l * (0.7 + 0.5 * k), sz = dr.s * (1 - sg);
          if (sz < 0.5) continue;
          const xs = [], ys = [];
          for (let j = 0; j < 6; j++) { const a = (j / 6) * TAU; xs.push(f.x + Math.cos(dr.a) * rr + Math.cos(a) * sz); ys.push(f.y + Math.sin(dr.a) * rr + Math.sin(a) * sz * 0.8); }
          shine += qPath(xs, ys, 6);
        }
      }
      const fade = clamp((pg - 0.2) / 0.8, 0, 1);
      e.setAttribute("d", d);
      e.style.opacity = (0.94 * (1 - fade * fade * (3 - 2 * fade))).toFixed(3);
      e._on = true;
    }
    rimEl.setAttribute("d", rim);
    airEl.setAttribute("d", air);
    shineEl.setAttribute("d", shine);
    stoneEl.setAttribute("transform", stoneK > 0.01 ? `translate(0 540) scale(${(1 + 0.2 * stoneK).toFixed(3)} ${(1 - 0.26 * stoneK).toFixed(3)}) translate(0 -540)` : "");
  }

  // ---------- public ----------
  const api = {
    glass,
    get count() { return bubbles.filter((b) => b.state !== "merge").length; },
    setScale(s) { scale = s; },
    // a fee leaves the air stone and wobbles up
    spawn(fee) {
      if (reduced) { api.addPacked(fee); return; }
      bubbles.push(make(NOZ.x + rand(-3, 3), NOZ.y - 4, 0.5, { rT: rOf(fee), state: "rise", age: 0, old: false, vy: -40, wob: 0.09 }));
      stoneK = 1;
      coalesce();
    },
    // off screen or reduced motion: the fee joins the foam directly, no journey
    addPacked(fee) {
      bubbles.push(make(rand(-70, 70), rand(150, 230), rOf(fee), { old: false }));
      coalesce();
      if (reduced) { for (const b of bubbles) if (b.state === "merge") b.dead = true; for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].dead) bubbles.splice(i, 1); api.settle(60); draw(0); }
    },
    // burns pop the oldest packed bubbles; returns how many
    burn(count = 1, quiet = false) {
      const packed = bubbles.filter((b) => b.state === "pack");
      const n = Math.min(count, Math.max(0, packed.length - MIN));
      packed.sort((a, b) => (a.old === b.old ? a.born - b.born : a.old ? -1 : 1) + rand(-0.3, 0.3));
      for (let i = 0; i < n; i++) {
        if (quiet || reduced) bubbles.splice(bubbles.indexOf(packed[i]), 1);
        else pop(packed[i]);
      }
      if (reduced && n) { api.settle(60); draw(0); }
      return n;
    },
    // the stream arrives under the jar: the stone gulps and the foam shivers
    wake() {
      if (reduced) return;
      stoneK = 1;
      rotV += 0.03;
      liftV -= 18;
      for (const b of bubbles) { b.wob = 0.1; b.vy -= rand(10, 40); }
    },
    settle(steps) { for (let i = 0; i < steps; i++) step(1 / 60, now + i / 60, null); for (const b of bubbles) { b.vx *= 0.2; b.vy *= 0.2; } },
    frame(t, dt, stir) {
      now = t;
      for (let i = bubbles.length - 1; i >= 0; i--) { const b = bubbles[i]; if (b.state === "merge" && now - b.m0 > 0.42) bubbles.splice(i, 1); }
      for (let i = fx.length - 1; i >= 0; i--) if (now - fx[i].t0 > 1.3) fx.splice(i, 1);
      const sub = dt > 1 / 45 ? 2 : 1;
      for (let k = 0; k < sub; k++) step(Math.min(dt, 0.05) / sub, t, stir);
      stoneK *= Math.exp(-dt / 0.16);
      bob = Math.sin(t * 0.55) * 3 + Math.sin(t * 0.23 + 1) * 1.5;
      const ra = -38 * (rot - Math.sin(t * 0.41) * 0.006) - 4.2 * rotV;
      rotV += ra * dt; rot += rotV * dt;
      const la = -30 * lift - 6 * liftV;
      liftV += la * dt; lift += liftV * dt;
      draw(t);
      return { bob: bob + lift, rot };
    },
    draw,
  };
  seed(mobile ? 24 : 28);
  draw(0);
  return api;
}
