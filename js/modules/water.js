// water: the underwater atmosphere on the fixed #water canvas (SPEC brief 2).
// One 2D canvas, redrawn back to front from the shared loop:
//  1. caustics: a Voronoi of drifting seeds. Every cell is inset by a breathing gap and rounded, and the
//     gaps are filled with cream at a few percent alpha, so light gathers in knots where cells meet and
//     thins along the filaments. Ripple fronts bend the web as they pass. It fades out as we dive.
//  2. marine snow: irregular flakes on a continuous range of depths, sinking slowly, with scroll parallax.
//     A fast dive stretches them into streaks; the pointer leaves a wake in them.
//  3. plankton: sparse specks that only live in deep water. They twinkle now and then and light up cream
//     when the pointer, a ripple or a brain swap disturbs them. No glow: only size, alpha and colour.
//  4. ripples: ink ensō rings (open brush strokes, a heavy start and a dry tail) with a cream glint on the
//     upper left like the bell's. Two or three rings per ripple; they break up as they fade; cream in dark water.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const hash = (n) => { const s = Math.sin(n) * 43758.5453; return s - Math.floor(s); };

const INK = "#0b0b0b";
const CREAM = "#fdf1d8";
const DEEP = [93, 63, 201];
const CRM = [253, 241, 216];
const tint = (k) => `rgb(${DEEP.map((c, i) => Math.round(c + (CRM[i] - c) * k)).join(",")})`;

export function init(ctx) {
  const canvas = document.getElementById("water");
  const g = canvas?.getContext?.("2d");
  if (!g) return;
  const { bus, loop, pointer, scroll } = ctx;
  const reduced = !!ctx.reduced;
  const debug = !!ctx.params?.has?.("debug");
  const rnd = Math.random;

  let W = 0, H = 0, DPR = 1, VS = 1, now = 0;

  /* ------------------------------------------------------------------ caustics */
  let seeds = [], nbrs = [], period = 1, cell = 150, margin = 300, GAP = 3.4, WA = 8;
  const bufA = new Float64Array(160), bufB = new Float64Array(160);
  const hA = new Float64Array(80), hB = new Float64Array(80);
  const F = 0.26;            // how far into each edge a corner is rounded
  let wt = 0, WX = 0, WY = 0;
  const fronts = Array.from({ length: 10 }, () => ({ x: 0, y: 0, r: 0, a: 0, band: 1 }));
  let nFronts = 0;

  function layoutCaustics() {
    cell = clamp(Math.min(W, H) * 0.2, 96, 184);
    margin = cell * 2.1;      // seeds wrap far off screen, so no visible cell ever loses a neighbour
    const rowH = cell * 0.866;
    let rows = Math.ceil((H + 2 * margin) / rowH);
    if (rows % 2) rows++;
    const cols = Math.ceil((W + 2 * margin) / cell) + 1;
    period = rows * rowH;
    GAP = clamp(cell / 46, 2.1, 3.9);
    WA = cell * 0.055;
    seeds = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        seeds.push({
          bx: -margin + c * cell + (r % 2 ? cell / 2 : 0) + (rnd() - 0.5) * 0.86 * cell,
          by: r * rowH + (rnd() - 0.5) * 0.86 * rowH,
          ax: cell * (0.1 + rnd() * 0.12), ay: cell * (0.1 + rnd() * 0.12),
          fx: 0.16 + rnd() * 0.24, fy: 0.13 + rnd() * 0.24,
          px: rnd() * TAU, py: rnd() * TAU,
          x: 0, y: 0,
        });
      }
    }
    const lim = (cell * 2.1) ** 2;
    nbrs = seeds.map((a, i) => {
      const out = [];
      for (let j = 0; j < seeds.length; j++) {
        if (j === i) continue;
        const b = seeds[j];
        let dy = b.by - a.by;
        dy -= Math.round(dy / period) * period;
        const dx = b.bx - a.bx;
        if (dx * dx + dy * dy < lim) out.push(j);
      }
      return out;
    });
  }

  function placeSeeds(t) {
    const off = reduced ? 0 : -scroll.y * 0.05;   // the light drifts up a little as we dive
    for (const s of seeds) {
      let yy = (s.by + off) % period;
      if (yy < 0) yy += period;
      s.x = s.bx + s.ax * Math.sin(t * s.fx + s.px) + s.ax * 0.35 * Math.sin(t * s.fy * 1.9 + s.py);
      s.y = yy - margin + s.ay * Math.sin(t * s.fy + s.py) + s.ay * 0.35 * Math.sin(t * s.fx * 1.7 + s.px);
    }
  }

  // Sutherland-Hodgman against one half plane: keep nx*x + ny*y <= c.
  // sh/dh carry, for every vertex, the half gap of the edge that leaves it (0 for the bounding square),
  // so each filament can later be pinched in proportion to its own width.
  function clip(src, sh, n, dst, dh, nx, ny, c, h) {
    let m = 0;
    let px = src[2 * n - 2], py = src[2 * n - 1], ph = sh[n - 1];
    let pd = nx * px + ny * py - c;
    for (let i = 0; i < n; i++) {
      const x = src[2 * i], y = src[2 * i + 1];
      const d = nx * x + ny * y - c;
      if ((pd <= 0) !== (d <= 0)) {
        const k = pd / (pd - d);
        dst[2 * m] = px + (x - px) * k; dst[2 * m + 1] = py + (y - py) * k;
        dh[m] = pd <= 0 ? h : ph;   // leaving: the new edge runs along this plane
        m++;
      }
      if (d <= 0) { dst[2 * m] = x; dst[2 * m + 1] = y; dh[m] = sh[i]; m++; }
      px = x; py = y; pd = d; ph = sh[i];
    }
    return m;
  }

  // Half the width of the light filament between seeds i and j. Symmetric in i, j so both cells agree.
  function halfGap(i, j, mx, my, t) {
    const lo = i < j ? i : j, hi = i < j ? j : i;
    const h1 = hash(lo * 157.13 + hi * 3.71), h2 = hash(lo * 11.31 + hi * 91.77);
    const breath = 0.5 + 0.5 * Math.sin(t * (0.45 + h2 * 1.1) + h1 * TAU);
    const patch = 0.5 + 0.5 * Math.sin(mx * 0.0034 + t * 0.07 + 0.5) * Math.sin(my * 0.0047 - t * 0.05 + 1.7);
    const sky = 1.15 - 0.45 * clamp(my / H, 0, 1);  // light comes from above
    return 0.35 + GAP * (0.2 + 0.8 * breath) * (0.15 + 0.85 * patch) * sky;
  }

  // A smooth field that makes the cell edges wavy, plus the push of every live ripple front.
  function warp(x, y) {
    WX = WA * (Math.sin(y * 0.017 + wt * 0.53) + 0.55 * Math.sin(x * 0.021 - wt * 0.41 + 1.3) + 0.3 * Math.sin((x + y) * 0.043 + wt * 0.9));
    WY = WA * (Math.sin(x * 0.015 - wt * 0.47 + 2.1) + 0.55 * Math.sin(y * 0.023 + wt * 0.37 + 0.4) + 0.3 * Math.sin((x - y) * 0.039 - wt * 0.8));
    for (let k = 0; k < nFronts; k++) {
      const f = fronts[k];
      const dx = x - f.x, dy = y - f.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const q = (d - f.r) / f.band;
      if (q > 2.6 || q < -2.6) continue;
      const amp = 13 * f.a * Math.exp(-q * q) / d;
      WX += dx * amp; WY += dy * amp;
    }
  }

  // Rounded, warped outline of one inset cell around seed (sx, sy). Each edge bulges outward by about
  // its own half gap, so neighbouring cells nearly touch mid-filament: thin threads, bright knots.
  function cellPath(p, hs, n, sx, sy) {
    for (let i = 0; i <= n; i++) {
      const ii = i % n, ip = (ii - 1 + n) % n;
      const i0 = ip * 2, i1 = ii * 2, i2 = ((ii + 1) % n) * 2;
      const vx = p[i1], vy = p[i1 + 1];
      const ax = vx + (p[i0] - vx) * F, ay = vy + (p[i0 + 1] - vy) * F;
      if (i === 0) {
        warp(ax, ay); g.moveTo(ax + WX, ay + WY);
      } else {
        let mx = (p[i0] + vx) * 0.5, my = (p[i0 + 1] + vy) * 0.5;
        const ex = vx - p[i0], ey = vy - p[i0 + 1], el = Math.sqrt(ex * ex + ey * ey) + 1e-6;
        let nx = ey / el, ny = -ex / el;
        if (nx * (mx - sx) + ny * (my - sy) < 0) { nx = -nx; ny = -ny; }
        const b = hs[ip] * 1.5 * clamp(el / (cell * 0.45), 0.35, 1);
        mx += nx * b; my += ny * b;
        warp(mx, my); const cx = mx + WX, cy = my + WY;
        warp(ax, ay); g.quadraticCurveTo(cx, cy, ax + WX, ay + WY);
      }
      if (i === n) break;
      const bx = vx + (p[i2] - vx) * F, by = vy + (p[i2 + 1] - vy) * F;
      warp(vx, vy); const kx = vx + WX, ky = vy + WY;
      warp(bx, by); g.quadraticCurveTo(kx, ky, bx + WX, by + WY);
    }
    g.closePath();
  }

  // Light thins away from the surface: 6% at the top of the first screen, 3% at its foot, even below ~450 m
  let grad = null, gradK = -1, gradH = 0;
  function lightFill(depth) {
    const fall = 0.5 + 0.5 * smooth(0, 450, depth);
    if (!grad || Math.abs(fall - gradK) > 0.01 || gradH !== H) {
      grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, CREAM);
      grad.addColorStop(1, `rgba(253,241,216,${fall.toFixed(3)})`);
      gradK = fall; gradH = H;
    }
    return grad;
  }

  function drawCaustics(t, alpha, depth) {
    placeSeeds(t);
    wt = t;
    g.beginPath();
    g.rect(0, 0, W, H);
    const lim = (cell * 2.2) ** 2, half = cell * 1.3;
    for (let i = 0; i < seeds.length; i++) {
      const a = seeds[i];
      if (a.x < -cell || a.x > W + cell || a.y < -cell || a.y > H + cell) continue;
      let src = bufA, dst = bufB, sh = hA, dh = hB, n = 4;
      src[0] = a.x - half; src[1] = a.y - half; src[2] = a.x + half; src[3] = a.y - half;
      src[4] = a.x + half; src[5] = a.y + half; src[6] = a.x - half; src[7] = a.y + half;
      sh[0] = sh[1] = sh[2] = sh[3] = 0;
      const nb = nbrs[i];
      for (let k = 0; k < nb.length && n >= 3; k++) {
        const j = nb[k], b = seeds[j];
        const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 > lim || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        const mx = a.x + dx * 0.5, my = a.y + dy * 0.5;
        const h = halfGap(i, j, mx, my, t);
        n = clip(src, sh, n, dst, dh, nx, ny, nx * mx + ny * my - h, h);
        let tmp = src; src = dst; dst = tmp;
        tmp = sh; sh = dh; dh = tmp;
      }
      if (n >= 3) cellPath(src, sh, n, a.x, a.y);
    }
    g.fillStyle = lightFill(depth);
    g.globalAlpha = alpha;
    g.fill("evenodd");
    g.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ snow and plankton */
  // irregular flake outlines (unit radius); perfect circles are reserved for eyes
  const SHAPES = [];
  for (let k = 0; k < 14; k++) {
    const m = 5 + (k % 4), el = 1 + rnd() * 0.7, pts = [];
    for (let v = 0; v < m; v++) {
      const a = (v / m) * TAU + (rnd() - 0.5) * 0.7, r = 0.5 + rnd() * 0.5;
      pts.push(Math.cos(a) * r * el, Math.sin(a) * r);
    }
    SHAPES.push(pts);
  }

  const flakes = [], plank = [];
  const makeFlake = (anywhere) => {
    const z = Math.pow(rnd(), 1.5);
    return {
      x: rnd() * W, y: anywhere ? rnd() * H : -8, z,
      r: (0.5 + 2.3 * z * z + rnd() * 0.45) * (W < 720 ? 0.9 : 1),
      a: (0.1 + 0.34 * Math.pow(z, 1.3)) * (0.7 + rnd() * 0.6),
      sink: 2.5 + 9 * z + rnd() * 2, vx: 0, vy: 0,
      rot: rnd() * TAU, vr: (rnd() - 0.5) * 0.8, sh: (rnd() * SHAPES.length) | 0,
      ph: rnd() * TAU, lit: 0, st: 1,
    };
  };
  const makePlank = () => ({
    x: rnd() * W, y: rnd() * H, z: rnd(),
    r: 0.75 + rnd() * 0.8, ph: rnd() * TAU, sh: (rnd() * SHAPES.length) | 0, rot: rnd() * TAU,
    vx: 0, vy: 0, lit: 0, b: 0,
    fs: now + rnd() * 4 - 1, fd: 0.7 + rnd() * 1.5, fp: 0.35 + rnd() * 0.6,
  });

  let quality = 1;
  function populate() {
    const area = W * H;
    const nS = Math.round(clamp(area * 0.000118, 44, 200) * quality);
    const nP = Math.round(clamp(area * 0.000092, 26, 140) * quality);
    while (flakes.length < nS) flakes.push(makeFlake(true));
    flakes.length = nS;
    while (plank.length < nP) plank.push(makePlank());
    plank.length = nP;
    const fit = (p) => {
      p.x = Number.isFinite(p.x) ? ((p.x % W) + W) % W : rnd() * W;
      p.y = Number.isFinite(p.y) ? ((p.y % H) + H) % H : rnd() * H;
    };
    flakes.forEach(fit);
    plank.forEach(fit);
  }

  function flakePath(f, r, st) {
    const pts = SHAPES[f.sh], c = Math.cos(f.rot) * r, s = Math.sin(f.rot) * r;
    for (let i = 0; i < pts.length; i += 2) {
      const ux = pts[i], uy = pts[i + 1];
      const x = f.x + ux * c - uy * s, y = f.y + (ux * s + uy * c) * st;
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  }

  // the swap wave: a front of light that runs through the whole sea when a new brain lands
  const waves = [];
  let ppx = pointer.x, ppy = pointer.y;

  function disturb(p, isPlank, dt, wake) {
    // pointer wake: push along the stroke, light plankton
    if (wake) {
      const { sx, sy, mdx, mdy, l2, R, k } = wake;
      const u = clamp(((p.x - sx) * mdx + (p.y - sy) * mdy) / l2, 0, 1);
      const qx = sx + mdx * u - p.x, qy = sy + mdy * u - p.y, d2 = qx * qx + qy * qy;
      if (d2 < R * R) {
        const fall = 1 - Math.sqrt(d2) / R, f2 = fall * fall;
        const push = 2.4 * f2 * (0.35 + p.z);
        p.vx += mdx * push; p.vy += mdy * push;
        if (isPlank) p.lit = Math.min(1, p.lit + f2 * k);
      }
    }
    // ripple fronts: a radial shove and a flash where the ring passes
    for (let i = 0; i < nFronts; i++) {
      const f = fronts[i];
      const dx = p.x - f.x, dy = p.y - f.y, d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const q = Math.abs(d - f.r) / f.band;
      if (q >= 1) continue;
      const e = (1 - q) * f.a;
      p.vx += (dx / d) * 950 * e * dt; p.vy += (dy / d) * 950 * e * dt;
      p.lit = Math.min(1, p.lit + e * (isPlank ? 0.22 : 0.06));
    }
    for (const w of waves) {
      const dx = p.x - w.x, dy = p.y - w.y, d = Math.sqrt(dx * dx + dy * dy);
      const q = Math.abs(d - w.r) / 110;
      if (q < 1) p.lit = Math.max(p.lit, (1 - q) * (isPlank ? 1 : 0.75));
    }
  }

  function stepParticles(t, dt, dS) {
    const drag = Math.exp(-dt * 1.7), litDecay = Math.exp(-dt / 1.1);
    const mdx = pointer.x - ppx, mdy = pointer.y - ppy;
    const sx = ppx, sy = ppy;
    ppx = pointer.x; ppy = pointer.y;
    const speed = dt > 0 ? Math.hypot(mdx, mdy) / dt : 0;
    const wake = pointer.active && speed > 40 && speed < 9000
      ? { sx, sy, mdx, mdy, l2: mdx * mdx + mdy * mdy || 1, R: 115 * Math.max(0.75, VS), k: Math.min(1, speed / 700) * 0.9 }
      : null;
    const vS = dt > 0 ? Math.abs(dS) / dt : 0;

    for (const f of flakes) {
      disturb(f, false, dt, wake);
      const par = 0.12 + 0.55 * f.z;
      f.vx *= drag; f.vy *= drag;
      const cur = Math.sin(f.y * 0.0043 + t * 0.21 + f.ph) * (3 + 8 * f.z);
      f.x += (cur + f.vx) * dt;
      f.y += (f.sink + f.vy) * dt - dS * par;
      f.rot += f.vr * dt;
      f.lit *= litDecay;
      f.st = 1 + Math.min(5, vS * par * 0.012 * (0.4 + f.z));
      if (f.y > H + 14) { f.y -= H + 28; f.x = rnd() * W; }
      else if (f.y < -14) { f.y += H + 28; f.x = rnd() * W; }
      if (f.x < -14) f.x += W + 28; else if (f.x > W + 14) f.x -= W + 28;
    }
    for (const p of plank) {
      disturb(p, true, dt, wake);
      const par = 0.18 + 0.4 * p.z;
      p.vx *= drag; p.vy *= drag;
      // divergence-free swirl so plankton circles instead of streaming
      const sx2 = Math.cos(p.y * 0.008 + t * 0.29 + p.ph) * 5, sy2 = Math.sin(p.x * 0.007 - t * 0.23 + p.ph) * 4;
      p.x += (sx2 + p.vx) * dt;
      p.y += (sy2 + p.vy - 1.2) * dt - dS * par;
      p.rot += dt * 0.3;
      p.lit *= litDecay;
      if (p.y > H + 10) { p.y -= H + 20; p.x = rnd() * W; }
      else if (p.y < -10) { p.y += H + 20; p.x = rnd() * W; }
      if (p.x < -10) p.x += W + 20; else if (p.x > W + 10) p.x -= W + 20;
    }
  }

  const SB = Array.from({ length: 14 }, () => []);
  function drawSnow(depth) {
    const k = 1 - 0.3 * smooth(2600, 4000, depth);
    for (const b of SB) b.length = 0;
    for (const f of flakes) {
      const a = (f.a * k + f.lit * 0.45) / Math.sqrt(f.st);
      const li = Math.min(13, Math.round(a / 0.055));
      if (li > 0) SB[li].push(f);
    }
    g.fillStyle = CREAM;
    for (let li = 1; li < SB.length; li++) {
      const list = SB[li];
      if (!list.length) continue;
      g.beginPath();
      for (const f of list) flakePath(f, f.r * (1 + f.lit * 0.5), f.st);
      g.globalAlpha = li * 0.055;
      g.fill();
    }
    g.globalAlpha = 1;
  }

  const PB = Array.from({ length: 5 }, () => []);
  const PCOL = [0.25, 0.5, 0.72, 0.9, 1].map(tint);
  const PALPHA = [0.4, 0.56, 0.72, 0.88, 1];
  const PSIZE = [0.85, 1, 1.2, 1.5, 1.85];
  function drawPlankton(t, kP) {
    for (const b of PB) b.length = 0;
    for (const p of plank) {
      // idle twinkle: a quick flash on, a slower fade, then a random rest
      let fl = 0;
      const u = (t - p.fs) / p.fd;
      if (reduced) fl = hash(p.ph * 97.1) > 0.85 ? 0.55 + 0.45 * hash(p.ph * 7.3) : 0;   // a still sky: some stay lit
      else if (u >= 1) { p.fs = t + 2 + rnd() * 9; p.fd = 0.7 + rnd() * 1.5; p.fp = 0.35 + rnd() * 0.6; }
      else if (u >= 0) fl = p.fp * (u < 0.18 ? smooth(0, 0.18, u) : 1 - smooth(0.18, 1, u));
      const b = Math.max(0.06 + 0.06 * Math.sin(t * 0.9 + p.ph), fl, p.lit);
      p.b = b;
      PB[Math.min(4, Math.floor(b * 5))].push(p);
    }
    for (let l = 0; l < 5; l++) {
      const list = PB[l];
      if (!list.length) continue;
      g.beginPath();
      for (const p of list) flakePath(p, p.r * PSIZE[l] * (1 + p.lit * 0.35), 1);
      g.fillStyle = PCOL[l];
      g.globalAlpha = PALPHA[l] * kP;
      g.fill();
    }
    g.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ ripples */
  const ripples = [];
  const RC = new Float64Array(140), RS = new Float64Array(140), RR = new Float64Array(140), RW = new Float64Array(140);
  const ringMax = (s, q) => (56 + 240 * s) * VS * (1 - 0.2 * q);

  function spawnRipple(x, y, s = 0.6) {
    if (reduced || !W) return;
    s = clamp(+s || 0.6, 0.08, 1);
    for (const r of ripples) {
      if (now - r.t0 < 0.25 && Math.hypot(r.x - x, r.y - y) < 48) { r.s = Math.max(r.s, s); return; }
    }
    if (ripples.length >= 9) ripples.shift();
    const rings = s > 0.55 ? 3 : 2;
    const life = 1.45 + 0.9 * s;
    ripples.push({
      x, y, s, t0: now, life, rings, end: life + (rings - 1) * 0.17 + 0.05,
      th0: rnd() * TAU, sweep: TAU * (0.84 + rnd() * 0.08),
      ph: [rnd() * TAU, rnd() * TAU, rnd() * TAU, rnd() * TAU, rnd() * TAU],
      k: smooth(1300, 2400, scroll.depth || 0),
    });
  }

  // An open brush ring: heavy start, a little grain, a dry tail; `glint` draws a short cream arc inside instead
  function brushRing(rp, R, Wd, age, brk, q, glint) {
    const ph = rp.ph;
    let th0, sweep;
    if (glint) { sweep = 1.15; th0 = -2.3 - sweep / 2; }
    else { th0 = rp.th0 + q * 2.1; sweep = rp.sweep - q * 0.4; }
    const N = clamp(Math.round(R * sweep * 0.05), 14, 128);
    for (let j = 0; j <= N; j++) {
      const u = j / N, th = th0 + u * sweep;
      const c = Math.cos(th), s = Math.sin(th);
      const wob = 1 + 0.04 * Math.sin(2 * th + ph[0] + q + age * 0.9)
        + 0.024 * Math.sin(3 * th + ph[1] - age * 1.4) + 0.011 * Math.sin(5 * th + ph[2] + age * 2.3);
      let w, r = R * wob;
      if (glint) {
        w = Wd * 0.62 * Math.pow(Math.sin(Math.PI * u), 0.8);
        r -= Wd * 1.25;
      } else {
        const press = Math.pow(Math.min(1, u / 0.05), 0.35) * (1.4 - 0.85 * u) * Math.pow(1 - smooth(0.62, 1, u), 0.9);
        const grain = 0.66 + 0.34 * Math.sin(3 * th + ph[3]) * Math.sin(th * 1.7 + ph[1]);
        const broken = 1 - brk * Math.pow(Math.max(0, Math.sin(2 * th + ph[4])), 3);
        w = Wd * press * grain * broken;
      }
      RC[j] = c; RS[j] = s; RR[j] = r; RW[j] = w * 0.5;
    }
    const cx = rp.x, cy = rp.y;
    g.moveTo(cx + RC[0] * (RR[0] + RW[0]), cy + RS[0] * (RR[0] + RW[0]));
    for (let j = 1; j <= N; j++) g.lineTo(cx + RC[j] * (RR[j] + RW[j]), cy + RS[j] * (RR[j] + RW[j]));
    for (let j = N; j >= 0; j--) g.lineTo(cx + RC[j] * (RR[j] - RW[j]), cy + RS[j] * (RR[j] - RW[j]));
    g.closePath();
  }

  function gatherFronts(t) {
    nFronts = 0;
    for (let i = ripples.length - 1; i >= 0; i--) if (t - ripples[i].t0 > ripples[i].end) ripples.splice(i, 1);
    for (const rp of ripples) {
      const p = (t - rp.t0) / rp.life;
      if (p <= 0 || p >= 1 || nFronts >= fronts.length) continue;
      const f = fronts[nFronts++];
      f.x = rp.x; f.y = rp.y;
      f.r = 3 + ringMax(rp.s, 0) * (1 - (1 - p) ** 3);
      f.a = rp.s * (1 - p) ** 1.2;
      f.band = 24 + 34 * p;
    }
    const diag = Math.hypot(W, H) + 160;
    for (let i = waves.length - 1; i >= 0; i--) {
      waves[i].r = (t - waves[i].t0) * 640;
      if (waves[i].r > diag) waves.splice(i, 1);
    }
  }

  function drawRipples(t) {
    for (const rp of ripples) {
      const age = t - rp.t0;
      for (let q = rp.rings - 1; q >= 0; q--) {
        const life = rp.life * (1 - 0.12 * q);
        const p = (age - q * 0.17) / life;
        if (p <= 0 || p >= 1) continue;
        const s = rp.s;
        const R = 3 + ringMax(s, q) * (1 - (1 - p) ** 3);
        const Wd = (2 + 8.5 * s) * (1 - 0.62 * p) * (1 - 0.22 * q) * Math.sqrt(VS);
        const A = s * (1 - p) ** 1.5 * Math.min(1, p / 0.05) * (1 - 0.28 * q);
        const brk = smooth(0.3, 0.95, p);
        g.beginPath();
        brushRing(rp, R, Wd, age, brk, q, false);
        if (rp.k < 0.98) { g.fillStyle = INK; g.globalAlpha = A * 0.5 * (1 - rp.k); g.fill(); }
        if (rp.k > 0.02) { g.fillStyle = CREAM; g.globalAlpha = A * 0.62 * rp.k; g.fill(); }
        if (q === 0) {
          g.beginPath();
          brushRing(rp, R, Wd, age, 0, 0, true);
          g.fillStyle = CREAM;
          g.globalAlpha = A * 0.85 * (1 - 0.4 * rp.k);
          g.fill();
        }
      }
    }
    g.globalAlpha = 1;
  }

  /* ------------------------------------------------------------------ frame */
  function render(t, dt, depth, dS) {
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, W, H);
    gatherFronts(t);
    const cA = 0.06 * (1 - smooth(120, 1500, depth));
    if (cA > 0.003) drawCaustics(t, cA, depth);
    stepParticles(t, dt, dS);
    drawSnow(depth);
    const kP = smooth(1500, 3400, depth);
    if (kP > 0.01) drawPlankton(t, kP);
    if (ripples.length) drawRipples(t);
  }

  let dirty = true;
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    const d = Math.min(2, window.devicePixelRatio || 1);
    if (!w || !h) return;                      // hidden or prerendered at 0x0: wait for a real size
    if (w === W && h === H && d === DPR) return;
    const rebuild = !seeds.length || Math.abs(w - W) > 40 || h + 2 * cell * 2.1 > period;
    W = w; H = h; DPR = d;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    VS = clamp(Math.min(W, H) / 820, 0.55, 1.25);
    if (rebuild) layoutCaustics();
    populate();
    dirty = true;
  }
  resize();
  addEventListener("resize", resize);
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);

  /* ------------------------------------------------------------------ input */
  let lastType = "mouse";
  addEventListener("pointerdown", (e) => {
    lastType = e.pointerType;
    if (e.pointerType === "touch" || e.button > 0) return;   // touch ripples wait for a real tap (click)
    spawnRipple(e.clientX, e.clientY, 0.7);
  }, { passive: true });
  addEventListener("click", (e) => {
    if (lastType === "touch" && e.isTrusted) spawnRipple(e.clientX, e.clientY, 0.6);
  }, { passive: true });

  bus.on("ripple", (e) => { if (e && Number.isFinite(e.x) && Number.isFinite(e.y)) spawnRipple(e.x, e.y, e.strength ?? e.s ?? 0.6); });

  // A new brain lands: a ring from the bell and a wave of light through every speck in the sea
  bus.on("brain:swap:mid", () => {
    if (reduced) return;
    const el = document.getElementById("hero-jelly");
    const r = el?.getBoundingClientRect?.();
    const on = r && r.width > 0 && r.bottom > 0 && r.top < H;
    const x = on ? r.left + r.width / 2 : W / 2, y = on ? r.top + r.height * 0.3 : H * 0.36;
    waves.push({ x, y, t0: now, r: 0 });
    spawnRipple(x, y, 0.95);
  });

  /* ------------------------------------------------------------------ loop */
  let lastY = null, lastDepth = -1, avg = 0, frames = 0, slowFor = 0;
  loop.add((t, dt) => {
    now = t;
    if (!W) return;
    const depth = scroll.depth || 0;
    if (reduced) {
      // final state only: one still frame, redrawn when the depth or size changes
      if (dirty || Math.abs(depth - lastDepth) > 20) {
        dirty = false; lastDepth = depth;
        render(17.3, 0, depth, 0);
        canvas.classList.add("is-on");
      }
      return;
    }
    const t0 = performance.now();
    const y = scroll.y || 0;
    if (lastY === null) lastY = y;
    let dS = y - lastY;
    lastY = y;
    if (Math.abs(dS) > H * 0.6) dS = 0;   // a jump, not a dive
    render(t, dt, depth, dS);
    if (dirty) { dirty = false; canvas.classList.add("is-on"); }
    const ms = performance.now() - t0;
    avg = avg ? avg * 0.95 + ms * 0.05 : ms;
    // a slow machine gets fewer specks rather than a dropped frame
    if (avg > 3 && quality > 0.5) {
      if (++slowFor > 120) { quality = Math.max(0.5, quality - 0.25); populate(); slowFor = 0; }
    } else slowFor = 0;
    if (debug && ++frames % 30 === 0) canvas.dataset.ms = avg.toFixed(3);
  });
}
