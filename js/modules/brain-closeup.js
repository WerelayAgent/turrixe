// brain-closeup (#brain-closeup): my brain, taken out of the bell and blown up into a live plate.
// Grooves rewire on every thought, cream sparks run along them, eight lobes light with what I'm
// thinking about (hover one to read the sentence that lit it), and a brain swap dissolves the whole
// thing into ink specks that re-form as the new version under a fresh stamp.
// One canvas holds the drawing; labels, caption and stamp are DOM so they stay crisp and focusable.
// Frame budget: rects are measured in the loop's read phase (on resize, on entering view, every 2 s while
// visible) and cached in page coordinates; the frame itself only subtracts ctx.scroll.y.

// Lobe sites in brain space (jelly.json brain coordinates). Regions are a wobbly Voronoi around them.
const LOBES = [
  { id: "ideas", x: -150, y: -150 },
  { id: "self", x: 14, y: -172 },
  { id: "memes", x: 184, y: -136 },
  { id: "fear", x: 54, y: -40 },
  { id: "liquidity", x: 246, y: 14 },
  { id: "fees", x: 168, y: 134 },
  { id: "holders", x: -10, y: 118 },
  { id: "replies", x: -196, y: 94 },
];

// Wide plate: a staggered row of four labels on top, two down the right side, and two tucked under the
// brain's own silhouette (not its bounding box), so the whole plate fits under the heading on a laptop.
// [position along that side in brain half-sizes, gap from the brain in px]
const TOP_WIDE = { ideas: [-0.62, 22], self: [-0.1, 34], fear: [0.3, 20], memes: [0.76, 30] };
const RIGHT_WIDE = { liquidity: [0.04, 22], fees: [0.72, 22] };
const UNDER_WIDE = { replies: [-0.85, 15], holders: [-0.05, 15] };
// Narrow plate: two rows, name over value. [side, along, gap]
const SLOTS_NARROW = {
  ideas: ["top", -0.77, 22], self: ["top", -0.26, 36], fear: ["top", 0.25, 22], memes: ["top", 0.76, 36],
  replies: ["bottom", -0.77, 22], holders: ["bottom", -0.26, 36], fees: ["bottom", 0.25, 22], liquidity: ["bottom", 0.76, 36],
};
// Where the version stamp is printed, in brain units: on the right shoulder (wide), low on the left (narrow)
const STAMP_WIDE = { x: 312, y: -138 }, STAMP_NARROW = { x: -226, y: 132 };
// Eyelids meet on a soft seam across the lower half of each eye, in eye radii: ends, then the curve's pull.
// A shut eye is that seam drawn as one cream brush line (a ‿), so the brain never loses its eyes mid-blink.
const SEAM_E = 0.3, SEAM_C = 0.94;

// What lights each lobe: [pattern, weight]. Crude on purpose; it reads my own sentences.
const TOPICS = {
  fear: [[/nervous|scared|afraid|panic|worr|\bfear/, 1], [/careful|fail|wrong|risk|negative|danger|lose|lost|felt that|falls? hard|red candle|drops?\b/, 0.7], [/\bsold\b|\bsells?\b/, 0.35]],
  holders: [[/holder|wallet|believer|diamond|stayed|hands/, 1], [/people|buyer|whoever|everyone|you\b/, 0.5], [/reward|winner/, 0.4]],
  memes: [[/meme|lottery|casino|jellyfish|immortal|moon/, 1], [/pump\.fun|trench|graduat|crowded|hobby|drift/, 0.7], [/\bcoins?\b/, 0.3]],
  liquidity: [[/liquidity|price|candle|pumpswap|volume/, 1], [/trades?\b|\bbuys?\b|\bsells?\b|bought|\bsol\b|market|chart/, 0.7]],
  replies: [[/repl|asked|tag them|comment|reading this/, 1], [/someone|people|\bpost\b|you're/, 0.45]],
  fees: [[/\bfees?\b|burn|bounty|payout|receipt/, 1], [/\bpay|paid|\btip\b|split|\bpot\b|spent|cost/, 0.7]],
  ideas: [[/idea|what if|\bhooks?\b|\brule\b/, 1], [/writing|borrow|build|test|fuzz|replay|devnet|fixed|plan|lines/, 0.55]],
  self: [[/my brain|old brain|new brain|myself|forget|journal|reset/, 1], [/brain|version|hash|same address|baby steps/, 0.6], [/\bi\b|\bmy\b|\bme\b/, 0.25]],
};
const KIND_PRIOR = {
  look: { liquidity: 0.45, holders: 0.3 }, idea: { ideas: 0.6 }, test: { ideas: 0.35, fear: 0.3 },
  decide: { self: 0.3, fees: 0.3 }, deploy: { self: 0.4, fees: 0.2 }, self: { self: 0.6 },
};

// What I say when you poke a lobe
const POKES = {
  fear: "That's fear. Poking it doesn't help.",
  holders: "That one is about you. Gently.",
  memes: "Memes. It lights up on its own most days.",
  liquidity: "Liquidity. Thinner than it looks.",
  replies: "Replies. It's where I read you.",
  fees: "Fees. The part that keeps me alive.",
  ideas: "Ideas. Most of them never make it into a brain.",
  self: "That's me thinking about me. Embarrassing.",
};
const IDLE_SAY = "The part of me that gets replaced. Hover a lobe and I'll tell you what lit it.";
const IDLE_SAY_TOUCH = "The part of me that gets replaced. Tap a lobe and I'll tell you what lit it.";

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const now = () => performance.now() / 1000;
const TAU = Math.PI * 2;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Arc-length polyline helpers
function polyline(pts) {
  const cum = new Float32Array(pts.length);
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return { pts, cum, L: cum[pts.length - 1] || 1 };
}
function at(pl, s) {
  const { pts, cum, L } = pl;
  s = clamp(s, 0, L);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m; else hi = m; }
  const f = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * f, y: pts[lo].y + (pts[hi].y - pts[lo].y) * f };
}
function part(pl, s0, s1, step = 3) {
  const n = Math.max(2, Math.ceil(Math.abs(s1 - s0) / step));
  const out = new Array(n + 1);
  for (let i = 0; i <= n; i++) out[i] = at(pl, s0 + (s1 - s0) * (i / n));
  return out;
}

// The kit's brush outline, written straight into a path or context (no string round trip per frame).
function ribbon(p, pts, wfn) {
  const n = pts.length;
  if (n < 2) return;
  const L = new Float32Array(n * 2), R = new Float32Array(n * 2);
  let a0 = 0, a1 = 0, w0 = 0, w1 = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i > 0 ? i - 1 : 0], b = pts[i < n - 1 ? i + 1 : n - 1];
    let tx = b.x - a.x, ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const w = Math.max(0.25, wfn(i / (n - 1)) / 2), nx = -ty, ny = tx;
    L[i * 2] = pts[i].x + nx * w; L[i * 2 + 1] = pts[i].y + ny * w;
    R[i * 2] = pts[i].x - nx * w; R[i * 2 + 1] = pts[i].y - ny * w;
    if (i === 0) { a0 = Math.atan2(ny, nx); w0 = w; }
    if (i === n - 1) { a1 = Math.atan2(ny, nx); w1 = w; }
  }
  p.moveTo(L[0], L[1]);
  for (let i = 1; i < n; i++) p.lineTo(L[i * 2], L[i * 2 + 1]);
  p.arc(pts[n - 1].x, pts[n - 1].y, w1, a1, a1 - Math.PI, true);
  for (let i = n - 1; i >= 0; i--) p.lineTo(R[i * 2], R[i * 2 + 1]);
  p.arc(pts[0].x, pts[0].y, w0, a0 + Math.PI, a0, true);
  p.closePath();
}

// A pointed leaf of ink (two quadratic curves): the dab and speck mark. Three calls, no trig.
function leaf(p, x, y, rx, ry, ca, sa) {
  const ax = ca * rx, ay = sa * rx, nx = -sa * ry * 2, ny = ca * ry * 2;
  p.moveTo(x + ax, y + ay);
  p.quadraticCurveTo(x + nx, y + ny, x - ax, y - ay);
  p.quadraticCurveTo(x - nx, y - ny, x + ax, y + ay);
}

// Quadratic leader curve from a label to a lobe
function curve(A, B, bend, n = 18) {
  const dx = B.x - A.x, dy = B.y - A.y;
  const cx = (A.x + B.x) / 2 - dy * bend, cy = (A.y + B.y) / 2 + dx * bend;
  const out = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out[i] = { x: u * u * A.x + 2 * u * t * cx + t * t * B.x, y: u * u * A.y + 2 * u * t * cy + t * t * B.y };
  }
  return out;
}

const ago = (ms) => {
  const s = Math.round(ms / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

export function init(ctx) {
  const mount = document.getElementById("brain-closeup");
  if (!mount) return;
  const { bus, loop, pointer, ink, assets, state } = ctx;
  const reduced = !!ctx.reduced;
  const touch = !!pointer.touch;
  const J = assets.jelly;
  const INK = ink.INK, CREAM = ink.CREAM, VIOLET = J.palette?.field || "#8b63f5";
  const rnd = mulberry32(1107);

  // ---------- brain geometry ----------
  const outline = [];
  J.brain.d.replace(/(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)/g, (_, x, y) => { outline.push({ x: +x, y: +y }); return ""; });
  const ON = outline.length;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, gx0 = 0, gy0 = 0;
  for (const p of outline) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    gx0 += p.x; gy0 += p.y;
  }
  gx0 /= ON; gy0 /= ON;
  const BC = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, BH = { x: (maxX - minX) / 2, y: (maxY - minY) / 2 };
  const oAng = new Float32Array(ON), oUx = new Float32Array(ON), oUy = new Float32Array(ON);
  outline.forEach((p, i) => {
    const dx = p.x - gx0, dy = p.y - gy0, l = Math.hypot(dx, dy) || 1;
    oAng[i] = Math.atan2(dy, dx); oUx[i] = dx / l; oUy[i] = dy / l;
  });
  const outlinePath = new Path2D(J.brain.d);
  const hit = document.createElement("canvas").getContext("2d");
  hit.lineWidth = 15;
  const inside = (x, y) => hit.isPointInPath(outlinePath, x, y);

  // the brain's lower edge, column by column, so the labels underneath can hug it
  const SX0 = Math.floor(minX), SXS = 3, SN = Math.ceil((maxX - SX0) / SXS) + 1;
  const silLow = new Float32Array(SN).fill(-Infinity);
  for (let i = 0; i < ON; i++) {
    const a = outline[i], b = outline[(i + 1) % ON];
    const c0 = Math.max(0, Math.ceil((Math.min(a.x, b.x) - SX0) / SXS)), c1 = Math.min(SN - 1, Math.floor((Math.max(a.x, b.x) - SX0) / SXS));
    for (let c = c0; c <= c1; c++) {
      const X = SX0 + c * SXS;
      const y = a.x === b.x ? Math.max(a.y, b.y) : a.y + ((b.y - a.y) * (X - a.x)) / (b.x - a.x);
      if (y > silLow[c]) silLow[c] = y;
    }
  }
  function lowestIn(x0, x1) {
    let m = -Infinity;
    const c1 = Math.min(SN - 1, Math.ceil((x1 - SX0) / SXS));
    for (let c = Math.max(0, Math.floor((x0 - SX0) / SXS)); c <= c1; c++) if (silLow[c] > m) m = silLow[c];
    return m > -Infinity ? m : maxY;
  }

  const PUPIL = J.brain.pupil || 0.47;
  const EYES = J.brain.eyes.map((e) => ({ ...e, a: (e.rot * Math.PI) / 180, ox: 0, oy: 0, r: Math.min(e.rx, e.ry) }));
  const eyeLocal = (e, x, y) => {
    const dx = x - e.x, dy = y - e.y, c = Math.cos(e.a), s = Math.sin(e.a);
    return { x: dx * c + dy * s, y: -dx * s + dy * c };
  };
  const inEye = (x, y, m = 1) => EYES.some((e) => { const l = eyeLocal(e, x, y); return (l.x / (e.rx * m)) ** 2 + (l.y / (e.ry * m)) ** 2 < 1; });
  // the closed lid of each eye, in eye space: a brush line along the seam, thick in the middle
  for (const e of EYES) {
    const X = e.rx + 2, pts = [];
    for (let i = 0; i <= 18; i++) {
      const u = 0.08 + 0.84 * (i / 18);
      pts.push({ x: X * (2 * u - 1), y: e.ry * (SEAM_E + 2 * u * (1 - u) * (SEAM_C - SEAM_E)) });
    }
    e.seamX = X;
    e.lidLine = new Path2D();
    ribbon(e.lidLine, pts, (q) => e.ry * (0.035 + 0.1 * Math.sin(Math.PI * q) ** 0.8));
  }

  // grooves: 6 variants x 7 grooves, morph-compatible
  const GK = 0.85;
  const VARIANTS = J.brain.grooves.map((v) => v.map((g) => ({
    w: g.w * GK,
    pl: polyline(ink.spline(g.pts.map(([x, y]) => ink.P(x, y)), false, 3)),
  })));
  const NV = VARIANTS.length, NG = VARIANTS[0].length;
  const gwidth = (g, u) => g.w * (0.5 + 0.5 * Math.sin(Math.PI * clamp(u)) ** 0.55);
  const grooveCache = new Map();
  function addPart(path, g, a, b) {
    if (b - a < 0.004) return;
    ribbon(path, part(g.pl, a * g.pl.L, b * g.pl.L, 3), (t) => gwidth(g, a + (b - a) * t));
  }
  function groovePath(v, i) {
    const key = v * 32 + i;
    let p = grooveCache.get(key);
    if (!p) { p = new Path2D(); addPart(p, VARIANTS[v][i], 0, 1); grooveCache.set(key, p); }
    return p;
  }

  // ---------- lobes and the stipple that lights them ----------
  const lobeDist = (x, y, k) => {
    const L = LOBES[k];
    return Math.hypot(x - L.x, y - L.y) + 15 * Math.sin(x * 0.027 + k * 1.9) * Math.cos(y * 0.031 - k * 1.1) + 8 * Math.sin((x - y) * 0.045 + k);
  };
  function lobeAt(x, y) {
    let best = 0, bd = Infinity, sd = Infinity;
    for (let k = 0; k < LOBES.length; k++) {
      const d = lobeDist(x, y, k);
      if (d < bd) { sd = bd; bd = d; best = k; } else if (d < sd) sd = d;
    }
    return [best, sd - bd];
  }
  const dabs = [];
  {
    const SP = 9.6;
    let row = 0;
    for (let y = minY + 4; y < maxY; y += SP * 0.866, row++) {
      for (let x = minX + 4 + (row & 1) * SP * 0.5; x < maxX; x += SP) {
        const px = x + (rnd() - 0.5) * 3.2, py = y + (rnd() - 0.5) * 3.2;
        if (!inside(px, py) || hit.isPointInStroke(outlinePath, px, py) || inEye(px, py, 1.1)) continue;
        const [k, margin] = lobeAt(px, py);
        const L = LOBES[k];
        const ang = Math.atan2(py - L.y, px - L.x) + Math.PI / 2 + (rnd() - 0.5) * 0.7;
        dabs.push({
          x: px, y: py, k,
          f: smooth(clamp(margin / 58)),
          edge: margin < 9,
          ca: Math.cos(ang), sa: Math.sin(ang),
          j: 0.72 + rnd() * 0.56,
          ph: rnd() * TAU,
          ex: 0,
        });
      }
    }
  }
  // anchors: the weighted middle of each lobe's dabs
  LOBES.forEach((L, k) => {
    let sx = 0, sy = 0, sw = 0;
    for (const d of dabs) if (d.k === k) { const w = 0.2 + d.f; sx += d.x * w; sy += d.y * w; sw += w; }
    L.cx = sw ? sx / sw : L.x; L.cy = sw ? sy / sw : L.y;
    L.act = 0.04; L.target = 0.04; L.last = null; L.shown = ""; L.ping = 0; L.bob = rnd() * TAU; L.line = reduced ? 1 : 0;
  });

  // ---------- DOM ----------
  mount.classList.add("bc");
  mount.innerHTML = `
    <figure class="bc__fig">
      <div class="bc__stage">
        <canvas class="bc__canvas" aria-hidden="true"></canvas>
        <div class="bc__stamp" aria-hidden="true">
          <svg viewBox="-64 -46 128 92">
            <defs>
              <filter id="bc-rough" x="-12%" y="-12%" width="124%" height="124%">
                <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="1" seed="4" result="n"/>
                <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  9 0 0 0 -2.2" result="m"/>
                <feComposite in="SourceGraphic" in2="m" operator="in" result="s"/>
                <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="9" result="w"/>
                <feDisplacementMap in="s" in2="w" scale="2.6" xChannelSelector="R" yChannelSelector="G"/>
              </filter>
            </defs>
            <g filter="url(#bc-rough)" fill="${CREAM}">
              <path class="bc__stamp-ring"/>
              <text class="bc__stamp-k" x="0" y="-15" text-anchor="middle">brain</text>
              <text class="bc__stamp-v" x="1" y="25" text-anchor="middle"></text>
            </g>
          </svg>
        </div>
      </div>
      <figcaption class="bc__cap">
        <span class="bc__cap-fig"></span>
        <span class="bc__cap-say"></span>
      </figcaption>
    </figure>`;
  const stage = mount.querySelector(".bc__stage");
  const canvas = mount.querySelector(".bc__canvas");
  const g = canvas.getContext("2d");
  const stampEl = mount.querySelector(".bc__stamp");
  const stampV = mount.querySelector(".bc__stamp-v");
  const capFig = mount.querySelector(".bc__cap-fig");
  const capSay = mount.querySelector(".bc__cap-say");

  // the stamp ring: one quick hand-drawn loop that overshoots its start
  {
    const pts = [];
    const r2 = mulberry32(31);
    for (let i = 0; i <= 13; i++) {
      const a = -2.2 + (i / 12) * TAU * 1.04;
      const j = 1 + (r2() - 0.5) * 0.09;
      pts.push(ink.P(Math.cos(a) * 55 * j, Math.sin(a) * 37 * j));
    }
    const line = ink.spline(pts, false, 10);
    mount.querySelector(".bc__stamp-ring").setAttribute("d", ink.brush(line, (t) => 3 + 4.2 * Math.sin(Math.PI * t) ** 0.6));
  }
  stampV.textContent = `v${state.version || 1}`;
  // no stamp before the first brain (live, version 0): the first swap prints it
  if (!(state.version > 0)) stampEl.style.visibility = "hidden";

  // labels
  LOBES.forEach((L, k) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "bc__lobe";
    el.innerHTML = `<span class="bc__lobe-name">${L.id}</span><span class="bc__lobe-val">.04</span>`;
    el.setAttribute("aria-label", `${L.id} lobe`);
    el.addEventListener("pointerenter", () => { hoverLabel = k; refreshHover(); });
    el.addEventListener("pointerleave", () => { if (hoverLabel === k) { hoverLabel = -1; refreshHover(); } });
    el.addEventListener("focus", () => { hoverLabel = k; refreshHover(); });
    el.addEventListener("blur", () => { if (hoverLabel === k) { hoverLabel = -1; refreshHover(); } });
    el.addEventListener("click", (e) => {
      if (touch) { sticky = sticky === k ? -1 : k; refreshHover(); return; }
      const B = toStage(L.cx, L.cy);
      pokeLobe(k, { x: L.cx, y: L.cy }, e.clientX || sLeft + B.x, e.clientY || stageTop() + B.y);
    });
    stage.appendChild(el);
    L.el = el; L.val = el.lastChild;
  });

  // ---------- live state ----------
  let W = 600, H = 480, S = 0.8, CX = 300, CY = 240, dpr = 1, narrow = false;
  // the canvas spills past the stage so ink specks drift out freely instead of being cut by its edge
  let BL = 0, BT = 36, BR = 0, BB = 84;
  let visible = false, dirty = true, fg = INK;
  let curVar = (state.version || 0) % NV;
  const grooves = Array.from({ length: NG }, () => ({ shown: curVar, anim: null }));
  let lastPX = pointer.x, lastPY = pointer.y, lastMove = -99;
  let gaze = null; // {x, y, until}: x in client px, y in page px
  const live = { lx: 0, ly: 0, rot: 0, breath: 0, fl: 0, fv: 0, dil: 1, dilT: 1, drowsy: 0, drowsyT: 0, solid: 1, lid: 0 };
  let blink = { next: now() + 1.5 + Math.random() * 2, t0: -9, double: false, second: false };
  let holdLid = null; // ?debug: freeze the lids (0 open .. 1 shut) for honest screenshots
  let hoverBrain = -1, hoverLabel = -1, sticky = -1, hover = -1, hoverMix = 0, hoverShown = -1;
  let poke = null; // {k, until}
  const sparks = [], pops = [], threads = [], flecks = [];
  let nextSpark = now() + 0.6;
  let swap = null;
  let lineGoal = 1;
  let capKey = "";
  let lastFigAt = 0;
  let stampPos = { x: 0, y: 0 }, thumpAlt = false;

  // ---------- layout ----------
  // Measured once per resize (and when fonts or the heading change): label boxes at their heaviest weight,
  // the stage's width, and how far below the section top it starts. The plate then sizes the brain so that,
  // with the section scrolled to, every label sits inside the stage and inside the viewport.
  const section = mount.closest(".sec");
  const head = section?.querySelector(".sec__head");
  const thoughtsEl = document.getElementById("thoughts");
  let sizes = null, sizesNarrow = null, fontsDirty = false, layoutKey = "", pending = null;
  let needLayout = false, needRects = false, mountW = -1;

  function measureLabels() {
    const box = document.createElement("div");
    box.className = "bc__measure";
    box.setAttribute("aria-hidden", "true");
    for (const L of LOBES) {
      const b = document.createElement("span");
      b.className = "bc__lobe";
      b.style.setProperty("--a", "1"); // lit is the heaviest a label gets, so a lit label never outgrows its slot
      b.innerHTML = `<span class="bc__lobe-name">${L.id}</span><span class="bc__lobe-val">.99</span>`;
      box.appendChild(b);
    }
    stage.appendChild(box);
    const out = {};
    [...box.children].forEach((el, k) => { out[LOBES[k].id] = [Math.ceil(el.offsetWidth), Math.ceil(el.offsetHeight)]; });
    box.remove();
    return out;
  }

  // reads only (plus the rare label measuring): runs in the loop's read phase, or once at init
  function readLayout() {
    const w = Math.max(240, Math.round(stage.clientWidth || mount.clientWidth || 600));
    const nar = w < 560;
    if (nar !== stage.classList.contains("is-narrow")) stage.classList.toggle("is-narrow", nar);
    if (!sizes || sizesNarrow !== nar || fontsDirty) { sizes = measureLabels(); sizesNarrow = nar; fontsDirty = false; }
    const vw = document.documentElement.clientWidth || innerWidth, vh = innerHeight;
    const tr = stage.getBoundingClientRect();
    const top = section ? tr.top - section.getBoundingClientRect().top : 0;
    readRects(tr);
    // laptops and tablets: the plate fits under the heading when the section is scrolled to.
    // Phones scroll it in anyway, so there the width decides alone.
    const availH = vw > 720 && vh > 480 ? vh - top - 16 : 0;
    const bleed = nar ? 12 : 44;
    return {
      w, nar, availH, dpr: Math.min(2, window.devicePixelRatio || 1),
      bl: clamp(Math.floor(tr.left) - 2, 0, bleed), br: clamp(Math.floor(vw - tr.right) - 2, 0, bleed),
    };
  }

  function solveWide(m) {
    const { w, availH } = m;
    const lh = Math.max(...LOBES.map((L) => sizes[L.id][1]));
    const rightW = Math.max(...Object.keys(RIGHT_WIDE).map((id) => sizes[id][0]));
    // margins can be slim: the canvas bleeds past the stage, so a leaning brain is never clipped
    const lm = 8, rm = 2, rg = RIGHT_WIDE.liquidity[1];
    const sw = Math.min(1.08, (w - lm - rm - rg - rightW) / (2 * BH.x));
    const topBand = Math.max(...Object.values(TOP_WIDE).map((v) => v[1])) + lh + 4;
    const place = (s) => {
      const spare = Math.max(0, w - (lm + 2 * BH.x * s + rg + rightW + rm));
      const cx = lm + spare / 2 + BH.x * s, cy = topBand + BH.y * s;
      let low = cy + BH.y * s + 16; // room under the brain for its lean and breath
      const pos = {};
      for (const [id, [along, gap]] of Object.entries(TOP_WIDE)) {
        const lw = sizes[id][0];
        pos[id] = { side: "top", x: clamp(cx + along * BH.x * s, lw / 2 + 2, w - lw / 2 - 2), y: topBand - gap };
      }
      for (const [id, [along, gap]] of Object.entries(RIGHT_WIDE)) pos[id] = { side: "right", x: cx + BH.x * s + gap, y: cy + along * BH.y * s };
      for (const [id, [along, gap]] of Object.entries(UNDER_WIDE)) {
        const [lw, h] = sizes[id];
        const x = clamp(cx + along * BH.x * s, lw / 2 + 2, w - lw / 2 - 2);
        const edge = lowestIn(BC.x + (x - lw / 2 - 4 - cx) / s, BC.x + (x + lw / 2 + 4 - cx) / s);
        const y = cy + (edge - BC.y) * s + gap;
        pos[id] = { side: "bottom", x, y };
        low = Math.max(low, y + h + 4);
      }
      const stamp = { x: Math.min(cx + (STAMP_WIDE.x - BC.x) * s, w - 64), y: cy + (STAMP_WIDE.y - BC.y) * s };
      return { S: s, CX: cx, CY: cy, H: Math.ceil(low), pos, stamp };
    };
    let p = place(sw);
    if (availH > 0 && p.H > availH) {
      // too tall for the screen: shrink the brain until the plate fits, but never below about two thirds
      let lo = Math.max(0.45, sw * 0.68), hi = sw;
      for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (place(mid).H <= availH) lo = mid; else hi = mid; }
      p = place(lo);
    }
    return p;
  }

  function solveNarrow(m) {
    const { w, availH } = m;
    const band = 92;
    let s = (w - 4) / (2 * BH.x);
    if (availH > 0 && 2 * band + 2 * BH.y * s > availH) s = Math.max(s * 0.68, (availH - 2 * band) / (2 * BH.y));
    const cx = w / 2, cy = band + BH.y * s;
    const pos = {};
    for (const L of LOBES) {
      const [side, along, gap] = SLOTS_NARROW[L.id];
      const lw = sizes[L.id][0];
      pos[L.id] = { side, x: clamp(cx + along * BH.x * s, lw / 2 + 2, w - lw / 2 - 2), y: cy + (side === "top" ? -1 : 1) * (BH.y * s + gap) };
    }
    const stamp = { x: Math.max(cx + (STAMP_NARROW.x - BC.x) * s, 44), y: cy + (STAMP_NARROW.y - BC.y) * s };
    return { S: s, CX: cx, CY: cy, H: Math.round(2 * BH.y * s + 2 * band), pos, stamp };
  }

  // measure and solve; returns null when nothing changed
  function computeLayout() {
    const m = readLayout();
    const p = m.nar ? solveNarrow(m) : solveWide(m);
    const key = [m.w, m.nar, m.dpr, m.bl, m.br, p.H, p.S.toFixed(4), p.CX.toFixed(1), ...LOBES.map((L) => sizes[L.id].join("x"))].join("|");
    if (key === layoutKey) return null;
    layoutKey = key;
    return { ...p, w: m.w, nar: m.nar, dpr: m.dpr, bl: m.bl, br: m.br };
  }

  // writes only
  function applyLayout(p) {
    W = p.w; H = p.H; S = p.S; CX = p.CX; CY = p.CY; narrow = p.nar; dpr = p.dpr; BL = p.bl; BR = p.br;
    stage.style.height = `${H}px`;
    const cw = W + BL + BR, ch = H + BT + BB;
    canvas.style.left = `${-BL}px`; canvas.style.top = `${-BT}px`;
    canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
    const pw = Math.round(cw * dpr), ph = Math.round(ch * dpr);
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
    LOBES.forEach((L) => {
      const q = p.pos[L.id];
      L.ax = q.x; L.ay = q.y; L.side = q.side;
      if (L.el.dataset.side !== q.side) L.el.dataset.side = q.side;
      L.tX = L.ax; L.tY = L.ay + (L.bobY || 0);
      L.el.style.transform = `translate(${L.tX.toFixed(1)}px, ${L.tY.toFixed(2)}px)`;
    });
    stampPos = p.stamp;
    stampEl.style.left = `${p.stamp.x.toFixed(1)}px`;
    stampEl.style.top = `${p.stamp.y.toFixed(1)}px`;
    dirty = true;
  }

  // ---------- where the stage is on the page ----------
  // Page coordinates, refreshed in the read phase; a frame only subtracts ctx.scroll.y (no layout reads).
  let sLeft = 0, sDocTop = 0, lookDoc = null, rectsAt = -9;
  function readRects(tr = stage.getBoundingClientRect()) {
    const sy = ctx.scroll.y;
    sLeft = tr.left; sDocTop = tr.top + sy;
    const th = thoughtsEl?.getBoundingClientRect();
    lookDoc = th && th.width > 10 ? { x: th.left + Math.min(th.width * 0.3, 160), y: th.top + sy + Math.min(th.height * 0.4, 220) } : null;
    rectsAt = now();
  }
  const stageTop = () => sDocTop - ctx.scroll.y;

  // brain space <-> stage px, including breathing, flinch and lean
  function frame() {
    const b = live.breath + live.fl * 0.05;
    return { sx: 1 + b, sy: 1 + b * 0.7 - live.fl * 0.11, c: Math.cos(live.rot), s: Math.sin(live.rot) };
  }
  let F = frame();
  function toStage(x, y) {
    const dx = (x - BC.x) * F.sx * S, dy = (y - BC.y) * F.sy * S;
    return { x: CX + live.lx + dx * F.c - dy * F.s, y: CY + live.ly + dx * F.s + dy * F.c };
  }
  function toBrain(px, py) {
    const dx = (px - CX - live.lx) / S, dy = (py - CY - live.ly) / S;
    const rx = dx * F.c + dy * F.s, ry = -dx * F.s + dy * F.c;
    return { x: rx / F.sx + BC.x, y: ry / F.sy + BC.y };
  }
  // stage px on the canvas, which starts BL, BT px outside the stage
  const base = () => g.setTransform(dpr, 0, 0, dpr, BL * dpr, BT * dpr);
  function brainTransform() {
    base();
    g.translate(CX + live.lx, CY + live.ly);
    g.rotate(live.rot);
    g.scale(S * F.sx, S * F.sy);
    g.translate(-BC.x, -BC.y);
  }

  // ---------- thinking ----------
  function classify(kind, text) {
    const s = ` ${String(text || "").toLowerCase()} `;
    const prior = KIND_PRIOR[kind] || {};
    const raw = LOBES.map((L) => {
      let v = prior[L.id] || 0;
      for (const [re, w] of TOPICS[L.id]) if (re.test(s)) v += w;
      return v;
    });
    const top = Math.max(...raw, 0.001);
    const hits = raw.filter((v) => v > 0.3).length;
    const gain = clamp(0.62 + 0.1 * hits, 0.62, 0.96);
    return raw.map((v) => (v / top) ** 1.6 * gain);
  }

  function onThought(th) {
    if (!th) return;
    const t = now();
    if (swap && !swap.tDone) return; // a dissolving brain doesn't light up
    const w = classify(th.kind, th.text);
    let topK = 0;
    w.forEach((v, k) => {
      const L = LOBES[k];
      L.target = Math.max(L.target * 0.3, v);
      if (v >= 0.42) L.last = { text: th.text, at: th.at || Date.now(), version: th.version ?? state.version };
      if (v > w[topK]) topK = k;
    });
    dirty = true;
    if (swap) { refreshCaption(); return; }
    if (reduced) {
      curVar = nextVariant();
      grooves.forEach((gr) => { gr.shown = curVar; gr.anim = null; });
    } else {
      rewire(t, nextVariant());
      // the eyes dart, then go and read what I just thought. Page coordinates from the cached rects,
      // so a thought never forces a layout and the eyes stay on the line while the page scrolls.
      gaze = { x: sLeft + Math.random() * W, y: sDocTop + Math.random() * H * 0.6, until: t + 0.16 };
      const look = lookDoc || { x: sLeft + W, y: sDocTop + H };
      setTimeout(() => { gaze = { x: look.x, y: look.y, until: now() + 1.4 }; }, 170);
      // a volley along the grooves nearest the loudest lobes, plus one spark out to its label
      const order = w.map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]);
      const n = 3 + Math.round(order[0][0] * 3);
      for (let i = 0; i < n; i++) {
        const k = order[i % 2][1];
        setTimeout(() => fireSpark(nearestGroove(LOBES[k].cx, LOBES[k].cy, i)), 1150 + i * (90 + Math.random() * 170));
      }
      LOBES[topK].pingAt = t + 0.8;
      live.fv += 1.2;
    }
    refreshCaption();
  }

  function nextVariant() {
    let v = curVar;
    while (v === curVar && NV > 1) v = Math.floor(Math.random() * NV);
    return v;
  }

  // draw-off the current folds and draw the new ones on, in a staggered wave
  function rewire(t, to, { off = true, on = true, gap = 0.055 } = {}) {
    const order = [...Array(NG).keys()].sort(() => Math.random() - 0.5);
    order.forEach((i, n) => {
      const gr = grooves[i];
      const from = off ? (gr.anim ? gr.anim.to : gr.shown) : -1;
      gr.anim = { from, to: on ? to : -1, t0: t + n * gap + Math.random() * 0.04, dOff: 0.36, lag: from >= 0 ? 0.22 : 0, dOn: 0.62 };
    });
    if (on) curVar = to;
  }

  function nearestGroove(x, y, salt = 0) {
    let best = 0, bd = Infinity;
    VARIANTS[curVar].forEach((gr, i) => {
      const m = at(gr.pl, gr.pl.L * 0.5);
      const d = Math.hypot(m.x - x, m.y - y) + ((i * 37 + salt * 53) % 40);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function fireSpark(i = Math.floor(Math.random() * NG), from = null) {
    if (reduced || swap || sparks.length > 16) return;
    const gr = grooves[i];
    if (gr.anim || gr.shown < 0) return;
    const pl = VARIANTS[gr.shown][i].pl;
    const dir = from === null ? (Math.random() < 0.7 ? 1 : -1) : from;
    sparks.push({ i, v: gr.shown, s: dir > 0 ? 0 : pl.L, dir, speed: 200 + Math.random() * 220, len: 46 + Math.random() * 40, hops: 0 });
  }

  // ---------- hover and caption ----------
  function refreshHover() {
    const h = touch ? (sticky >= 0 ? sticky : hoverLabel) : hoverLabel >= 0 ? hoverLabel : hoverBrain;
    const cur = hoverBrain >= 0 ? "pointer" : "";
    if (stage.style.cursor !== cur) stage.style.cursor = cur;
    if (h !== hover) {
      hover = h;
      if (h >= 0) hoverShown = h;
      LOBES.forEach((L, k) => L.el.classList.toggle("is-hover", k === hover));
      mount.classList.toggle("has-hover", hover >= 0);
      refreshCaption();
      dirty = true;
    }
  }

  function litNow() {
    const lit = LOBES.filter((L) => L.act > 0.32).sort((a, b) => b.act - a.act).slice(0, 3).map((L) => L.id);
    return lit.length ? `lit now: ${lit.join(", ")}` : "resting";
  }

  function refreshCaption(force = false) {
    let fig, say, mode;
    if (swap) {
      const first = !(swap.from > 0);
      fig = first ? `first brain, v${swap.to}` : `v${swap.from} → v${swap.to}`;
      say = swap.tMid ? "Pouring in the new one. It doesn't know anything yet." : first ? "Making room for my first brain. Hold still." : "Dissolving the old one. Hold still.";
      mode = "swap";
    } else if (poke && poke.until > now()) {
      const L = LOBES[poke.k];
      fig = `${L.id} · poked`;
      say = POKES[L.id];
      mode = "poke";
    } else if (hover >= 0) {
      const L = LOBES[hover];
      fig = L.last ? `${L.id} · lit ${ago(Date.now() - L.last.at)} · v${L.last.version}` : `${L.id} · no thought yet`;
      say = L.last ? `“${L.last.text}”` : "No thought has lit this one since you got here. Poking doesn't count.";
      mode = "hover";
    } else {
      fig = state.version > 0 ? `brain v${state.version} · ${litNow()}` : "no brain yet";
      say = touch ? IDLE_SAY_TOUCH : IDLE_SAY;
      mode = "idle";
    }
    if (capFig.textContent !== fig) capFig.textContent = fig;
    const key = `${mode}|${say}`;
    if (key === capKey && !force) return;
    capKey = key;
    capSay.classList.toggle("is-quote", mode === "hover" || mode === "poke");
    capSay.innerHTML = "";
    say.split(" ").forEach((word, i) => {
      const s = document.createElement("span");
      s.textContent = word + " ";
      s.style.transitionDelay = reduced ? "0ms" : `${Math.min(i * 38, 900)}ms`;
      capSay.appendChild(s);
    });
    requestAnimationFrame(() => requestAnimationFrame(() => capSay.querySelectorAll("span").forEach((s) => s.classList.add("is-in"))));
  }

  // ---------- pointer on the stage ----------
  // The canvas bleeds past the stage and ignores the pointer; the stage itself takes it, against the cached rect.
  function brainHit(e) {
    const b = toBrain(e.clientX - sLeft, e.clientY - stageTop());
    return inside(b.x, b.y) ? { k: lobeAt(b.x, b.y)[0], b } : null;
  }
  const onLabel = (e) => e.target instanceof Element && !!e.target.closest(".bc__lobe");
  stage.addEventListener("pointermove", (e) => {
    const h = swap || onLabel(e) ? null : brainHit(e);
    const k = h ? h.k : -1;
    if (k !== hoverBrain) { hoverBrain = k; refreshHover(); }
  });
  stage.addEventListener("pointerleave", () => { if (hoverBrain >= 0) { hoverBrain = -1; refreshHover(); } });
  stage.addEventListener("pointerdown", (e) => {
    if (onLabel(e)) return; // labels have their own click (and their own sticky toggle on touch)
    const h = swap ? null : brainHit(e);
    if (!h) { if (touch && sticky >= 0) { sticky = -1; refreshHover(); } return; }
    if (touch) sticky = h.k;
    pokeLobe(h.k, h.b, e.clientX, e.clientY);
  });

  // poking a lobe stimulates it, like an electrode: it lights, fires, and I complain
  function pokeLobe(k, b, clientX, clientY) {
    if (swap) return;
    const t = now();
    const L = LOBES[k];
    L.target = Math.max(L.target, 0.88);
    poke = { k, until: t + 2.6 };
    refreshHover();
    refreshCaption();
    setTimeout(() => refreshCaption(), 2700);
    live.fv += 3.2;
    live.dilT = 0.72;
    setTimeout(() => { live.dilT = 1; }, 520);
    blink.next = Math.min(blink.next, t + 0.05);
    for (let i = 0; i < 4; i++) setTimeout(() => fireSpark(nearestGroove(b.x, b.y, i)), i * 90);
    for (const d of dabs) {
      const dd = Math.hypot(d.x - b.x, d.y - b.y);
      if (dd < 70) d.ex = Math.max(d.ex, 1 - dd / 70);
    }
    bus.emit("ripple", { x: clientX, y: clientY, strength: 0.35 });
    dirty = true;
  }

  // ---------- swap: dissolve to ink specks, re-form, stamp ----------
  function buildSpecks() {
    const xs = [], ys = [], rs = [], cs = [];
    const sp = 12.4;
    let row = 0;
    for (let y = minY; y <= maxY; y += sp * 0.866, row++) {
      for (let x = minX + (row & 1) * sp * 0.5; x <= maxX; x += sp) {
        const px = x + (Math.random() - 0.5) * 2.4, py = y + (Math.random() - 0.5) * 2.4;
        if (!inside(px, py)) continue;
        let c = 0;
        for (const e of EYES) {
          const l = eyeLocal(e, px, py);
          if ((l.x / e.rx) ** 2 + (l.y / e.ry) ** 2 < 0.97) c = 1;
        }
        xs.push(px); ys.push(py); rs.push(c ? 7.6 + Math.random() * 1.2 : 8.4 + Math.random() * 2); cs.push(c);
      }
    }
    for (let i = 0; i < ON; i += 3) { xs.push(outline[i].x - oUx[i] * 4.2); ys.push(outline[i].y - oUy[i] * 4.2); rs.push(5.6); cs.push(0); }
    const n = xs.length;
    const P = {
      n, x: Float32Array.from(xs), y: Float32Array.from(ys), ox: Float32Array.from(xs), oy: Float32Array.from(ys),
      vx: new Float32Array(n), vy: new Float32Array(n), tx: new Float32Array(n), ty: new Float32Array(n),
      r: Float32Array.from(rs), c: Uint8Array.from(cs), rel: new Float32Array(n), del: new Float32Array(n), a: 1,
    };
    for (let i = 0; i < n; i++) {
      const yn = (P.oy[i] - minY) / (maxY - minY);
      P.rel[i] = 0.04 + 1.25 * yn + 0.45 * (0.5 + 0.5 * Math.sin(P.ox[i] * 0.05) * Math.cos(P.oy[i] * 0.043));
      const dx = P.ox[i] - gx0, dy = P.oy[i] - gy0, l = Math.hypot(dx, dy) || 1;
      const k = 30 + Math.random() * 64;
      P.vx[i] = (dx / l) * k + (Math.random() - 0.5) * 30;
      P.vy[i] = (dy / l) * k * 0.6 - 30 - Math.random() * 26;
    }
    return P;
  }

  // targets for the re-form: swirl every speck a little around the middle (within its colour)
  function assignTargets(P) {
    const maxR = Math.max(BH.x, BH.y);
    for (const col of [0, 1]) {
      const ids = [];
      for (let i = 0; i < P.n; i++) if (P.c[i] === col) ids.push(i);
      const cur = ids.slice().sort((a, b) => Math.atan2(P.y[a] - gy0, P.x[a] - gx0) - Math.atan2(P.y[b] - gy0, P.x[b] - gx0));
      const org = ids.slice().sort((a, b) => Math.atan2(P.oy[a] - gy0, P.ox[a] - gx0) - Math.atan2(P.oy[b] - gy0, P.ox[b] - gx0));
      const shift = Math.round(ids.length * 0.07);
      cur.forEach((id, j) => {
        const o = org[(j + shift) % org.length];
        P.tx[id] = P.ox[o]; P.ty[id] = P.oy[o];
        P.del[id] = 0.08 + 0.95 * (Math.hypot(P.ox[o] - gx0, P.oy[o] - gy0) / maxR) + Math.random() * 0.22;
      });
    }
  }

  function onSwapStart({ from, to } = {}) {
    const t = now();
    swap = { from: from ?? state.version, to: to ?? (state.version + 1), t0: t, tMid: 0, tDone: 0, P: null, formed: false };
    hoverBrain = -1; hoverLabel = -1; sticky = -1; poke = null;
    refreshHover();
    sparks.length = 0;
    LOBES.forEach((L) => { L.target = 0; L.last = null; });
    lineGoal = 0;
    mount.classList.add("is-swapping");
    stampEl.classList.remove("is-thump", "is-thump2");
    stampEl.classList.add("is-lift");
    if (!reduced) {
      rewire(t, -1, { on: false, gap: 0.02 });
      gaze = { x: sLeft + CX - 120, y: sDocTop - 500, until: t + 0.9 };
    } else {
      grooves.forEach((gr) => { gr.shown = -1; gr.anim = null; });
    }
    refreshCaption(true);
    dirty = true;
  }

  function onSwapMid({ to } = {}) {
    if (!swap) onSwapStart({ from: (to ?? state.version) - 1, to });
    swap.tMid = now();
    if (to) swap.to = to;
    curVar = ((swap.to * 5) + 1) % NV;
    if (swap.P) assignTargets(swap.P);
    refreshCaption(true);
    dirty = true;
  }

  function finishForm(t) {
    if (!swap || swap.formed) return;
    swap.formed = true;
    swap.tForm = t;
    if (!reduced) rewire(t + 0.1, curVar, { off: false, gap: 0.07 });
    else grooves.forEach((gr) => { gr.shown = curVar; gr.anim = null; });
  }

  function onSwapDone({ version } = {}) {
    const t = now();
    if (!swap) swap = { from: (version || state.version) - 1, to: version || state.version, t0: t - 6, tMid: t - 3, P: null, formed: false };
    finishForm(t);
    swap.tDone = t;
    swap.to = version || swap.to;
    stampV.textContent = `v${swap.to}`;
    stampEl.style.visibility = "";
    // a fresh animation name restarts the thump without forcing a reflow
    thumpAlt = !thumpAlt;
    stampEl.classList.remove("is-lift", "is-thump", "is-thump2");
    stampEl.classList.add(thumpAlt ? "is-thump" : "is-thump2");
    // the eyes come on: a double blink, then they look for you
    blink = { next: t + 0.25, t0: -9, double: true, second: false };
    setTimeout(() => {
      lineGoal = 1;
      mount.classList.remove("is-swapping");
      if (visible) bus.emit("ripple", { x: sLeft + stampPos.x, y: stageTop() + stampPos.y, strength: 0.55 });
      bus.emit("sfx", { name: "splat" });
      if (!reduced) {
        const c = stampPos;
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * TAU, v = 70 + Math.random() * 170;
          flecks.push({ x: c.x + Math.cos(a) * 26, y: c.y + Math.sin(a) * 18, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1.2 + Math.random() * 2.4, life: 0, max: 0.5 + Math.random() * 0.5, ang: a });
        }
      }
    }, reduced ? 0 : 160);
    setTimeout(() => {
      swap = null;
      live.solid = 1;
      refreshCaption(true);
      if (!reduced) for (let i = 0; i < 5; i++) setTimeout(() => fireSpark(), 200 + i * 140);
    }, reduced ? 0 : 700);
    dirty = true;
  }

  // ---------- per-frame update ----------
  function update(t, dt) {
    // the stage in client px, from the cached page position (no layout read in the frame)
    const rLeft = sLeft, rTop = sDocTop - ctx.scroll.y;
    if (pointer.x !== lastPX || pointer.y !== lastPY) { lastPX = pointer.x; lastPY = pointer.y; lastMove = t; }

    // gaze target in client px
    let gxC, gyC;
    if (gaze && t < gaze.until) { gxC = gaze.x; gyC = gaze.y - ctx.scroll.y; }
    else if (pointer.active && !touch && t - lastMove < 5) { gxC = pointer.x; gyC = pointer.y; }
    else if (narrow) { gxC = rLeft + W * 0.55; gyC = rTop + H * 1.25; }
    else { gxC = rLeft + W * 1.05; gyC = rTop + H * 0.82; }
    const gx = gxC - rLeft, gy = gyC - rTop;

    // the brain leans toward what it looks at, about three times slower than the eyes
    const kl = 1 - Math.exp(-dt / 0.17);
    const ox = gx - CX, oy = gy - CY;
    live.lx += (clamp(ox * 0.014, -9, 9) - live.lx) * kl;
    live.ly += (clamp(oy * 0.01, -6, 6) - live.ly) * kl;
    live.rot += (clamp(ox * 0.00004, -0.03, 0.03) - live.rot) * kl;
    // breathing, plus a damped flinch spring
    live.breath = reduced ? 0 : 0.011 * Math.sin((t * TAU) / 4.8) * (1 - live.drowsy * 0.4);
    live.fv += (-80 * live.fl - 7 * live.fv) * dt;
    live.fl += live.fv * dt;
    live.dil += (live.dilT - live.dil) * (1 - Math.exp(-dt / 0.12));
    live.drowsy += (live.drowsyT - live.drowsy) * (1 - Math.exp(-dt / 1.5));
    F = frame();

    // pupils: reach = min(1, dist / 125 px), eased with tau about 55 ms
    const gb = toBrain(gx, gy);
    const ke = 1 - Math.exp(-dt / 0.055);
    for (const e of EYES) {
      const l = eyeLocal(e, gb.x, gb.y);
      const d = Math.hypot(l.x, l.y) || 1, reach = Math.min(1, (d * S) / 125);
      const p = e.r * PUPIL * live.dil, m = e.r * 0.06;
      const tx = (l.x / d) * reach * (e.rx - p - m), ty = (l.y / d) * reach * (e.ry - p - m) + (reach < 0.2 ? 3 : 0);
      e.ox += (tx - e.ox) * ke; e.oy += (ty - e.oy) * ke;
    }

    // blinks: close 92 ms (smoothstep), hold 26 ms, open 185 ms (ease-out cubic); 14% double
    if (!reduced && t >= blink.next) {
      blink.t0 = t;
      if (blink.second) { blink.second = false; blink.next = t + 2.5 + Math.random() * 1.7; }
      else if (blink.double || Math.random() < 0.14) { blink.second = true; blink.next = t + 0.24; }
      else blink.next = t + 2.5 + Math.random() * 1.7;
      blink.double = false;
    }
    const be = t - blink.t0;
    let lid = 0;
    if (be < 0.092) lid = smooth(be / 0.092);
    else if (be < 0.118) lid = 1;
    else if (be < 0.303) lid = 1 - easeOut((be - 0.118) / 0.185);
    lid = Math.max(lid, live.drowsy * 0.45);
    if (swap && !swap.tDone && t - swap.t0 > 0.5) lid = 0;
    if (holdLid !== null) lid = holdLid;
    live.lid = lid;

    // lobe activations: fast attack, slow release, slow decay of the targets
    const kd = Math.exp(-dt / 11);
    let sum = 0;
    for (const L of LOBES) {
      L.target = 0.04 + (L.target - 0.04) * kd;
      const k = L.target > L.act ? 1 - Math.exp(-dt / 0.32) : 1 - Math.exp(-dt / (swap ? 0.25 : 2.6));
      L.act += (L.target - L.act) * k;
      L.lit01 = clamp((L.act - 0.09) / 0.91);
      sum += L.act;
      // a 1.7 px bob in quarter-pixel steps: the label's transform is written only when it moves a step
      L.bobY = reduced ? 0 : Math.round(6.8 * Math.sin(t * 0.9 + L.bob)) / 4;
      const lg = swap ? 0 : lineGoal;
      L.line = reduced ? lg : L.line + (lg - L.line) * (1 - Math.exp(-dt / (lineGoal ? 0.5 : 0.2)));
    }
    const mean = sum / LOBES.length;
    hoverMix += ((hover >= 0 ? 1 : 0) - hoverMix) * (1 - Math.exp(-dt / 0.14));

    // dab excitation decays; spark heads excite nearby tissue
    const kx = Math.exp(-dt / 0.45);
    for (const d of dabs) d.ex *= kx;

    // sparks
    if (!reduced && !swap && t > nextSpark) {
      fireSpark();
      if (Math.random() < 0.22) setTimeout(() => fireSpark(), 90 + Math.random() * 120);
      nextSpark = t - Math.log(1 - Math.random()) / (0.5 + 1.8 * mean) + 0.12;
    }
    for (let n = sparks.length - 1; n >= 0; n--) {
      const sp = sparks[n];
      const gr = VARIANTS[sp.v][sp.i];
      sp.s += sp.dir * sp.speed * dt;
      const gs = grooves[sp.i];
      if (gs.anim || gs.shown !== sp.v) { sparks.splice(n, 1); continue; }
      const head = at(gr.pl, sp.s);
      for (const d of dabs) {
        const dx = d.x - head.x, dy = d.y - head.y;
        if (dx > 40 || dx < -40 || dy > 40 || dy < -40) continue;
        const dd = Math.hypot(dx, dy);
        if (dd < 40) d.ex = Math.max(d.ex, (1 - dd / 40) * 0.85);
      }
      if (sp.s < 0 || sp.s > gr.pl.L) {
        // a synapse: a pop of cream, and maybe a hop across to a nearby fold
        const end = at(gr.pl, sp.s);
        for (let q = 0; q < 5; q++) {
          const a = Math.random() * TAU, v = 30 + Math.random() * 60;
          pops.push({ x: end.x, y: end.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.3 + Math.random() * 0.3 });
        }
        sparks.splice(n, 1);
        if (sp.hops < 2 && Math.random() < 0.5) {
          let best = null, bd = 130;
          VARIANTS[sp.v].forEach((o, j) => {
            if (j === sp.i || grooves[j].anim || grooves[j].shown !== sp.v) return;
            for (const [s, dir] of [[0, 1], [o.pl.L, -1]]) {
              const p = at(o.pl, s), dd = Math.hypot(p.x - end.x, p.y - end.y);
              if (dd < bd) { bd = dd; best = { j, s, dir, p }; }
            }
          });
          if (best) {
            const mid = { x: (end.x + best.p.x) / 2 + (best.p.y - end.y) * 0.25, y: (end.y + best.p.y) / 2 - (best.p.x - end.x) * 0.25 };
            threads.push({ a: end, b: best.p, c: mid, life: 0, max: 0.42 });
            const nb = best;
            setTimeout(() => {
              if (swap || grooves[nb.j].anim) return;
              sparks.push({ i: nb.j, v: sp.v, s: nb.s, dir: nb.dir, speed: sp.speed * 0.95, len: sp.len, hops: sp.hops + 1 });
            }, 150);
          }
        }
      }
    }
    for (let n = pops.length - 1; n >= 0; n--) {
      const p = pops[n];
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9;
      if (p.life > p.max) pops.splice(n, 1);
    }
    for (let n = threads.length - 1; n >= 0; n--) { threads[n].life += dt; if (threads[n].life > threads[n].max) threads.splice(n, 1); }
    for (let n = flecks.length - 1; n >= 0; n--) {
      const f = flecks[n];
      f.life += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= Math.exp(-dt * 6); f.vy *= Math.exp(-dt * 6);
      if (f.life > f.max) flecks.splice(n, 1);
    }

    // groove animations settle into their new shape
    for (const gr of grooves) {
      if (!gr.anim) continue;
      const a = gr.anim, e = t - a.t0;
      if (e >= Math.max(a.from >= 0 ? a.dOff : 0, a.to >= 0 ? a.lag + a.dOn : 0)) { gr.shown = a.to; gr.anim = null; }
    }

    // the swap itself
    if (swap) {
      const e = t - swap.t0;
      if (!reduced && visible && !swap.P && !swap.tMid && e > 0.42 && e < 2.2) {
        swap.P = buildSpecks();
        swap.relAt = t;
        const c = toStage(gx0, gy0);
        bus.emit("ripple", { x: rLeft + c.x, y: rTop + c.y, strength: 0.5 });
      }
      if (swap.P) {
        stepSpecks(swap.P, t, dt);
        live.solid = swap.formed ? clamp((t - swap.tForm) / 0.32) : 0;
        swap.P.a = swap.formed ? 1 - clamp((t - swap.tForm - 0.18) / 0.3) : 1;
        if (!swap.formed && swap.tMid && t - swap.tMid > 2.45) finishForm(t);
      } else {
        // no particles (reduced motion or off screen): a quiet fade out and back in
        const out = swap.tMid ? 1 - clamp((t - swap.tMid) / 0.7) : clamp(e / 0.6);
        live.solid = 1 - out * 0.9;
        if (swap.tMid && !swap.formed && t - swap.tMid > 0.7) finishForm(t);
      }
    } else live.solid += (1 - live.solid) * 0.2;

    // labels: bob, values, lit level
    for (const L of LOBES) {
      const a = clamp(L.act, 0, 0.99);
      const val = a.toFixed(2).slice(1);
      if (val !== L.shown) { L.shown = val; L.val.textContent = val; }
      const lit = Math.round(a * 20) / 20;
      if (lit !== L.lit) { L.lit = lit; L.el.style.setProperty("--a", lit.toFixed(2)); L.el.classList.toggle("is-lit", a > 0.45); }
      const ping = !!L.pingAt && t > L.pingAt && t < L.pingAt + 0.7;
      if (ping !== !!L.isPing) { L.isPing = ping; L.el.classList.toggle("is-ping", ping); }
      const y = L.ay + L.bobY;
      if (y !== L.tY || L.ax !== L.tX) { L.tX = L.ax; L.tY = y; L.el.style.transform = `translate(${L.ax.toFixed(1)}px, ${y.toFixed(2)}px)`; }
    }

    // the leader lines follow the text colour across the ink -> cream flip, at the labels' own pace
    if (fgK < 1) {
      fgK = Math.min(1, fgK + dt / 0.7);
      const e = easeOut(fgK), c = (i) => Math.round(lerp(fgFrom[i], fgTo[i], e));
      fg = `rgb(${c(0)},${c(1)},${c(2)})`;
    }

    if (t - lastFigAt > 0.6) {
      lastFigAt = t;
      refreshCaption();
    }
  }

  function stepSpecks(P, t, dt) {
    const sinceRel = t - swap.relAt;
    const reform = swap.tMid ? t - swap.tMid : -1;
    const om = 7.2, ze = 0.78;
    // soft walls 36 px inside the canvas (which bleeds past the stage), and a hard stop 16 px from its
    // edge: the ink drifts wide, but no speck is ever sliced off by the edge of the canvas
    const xLo = BC.x + (36 - BL - CX) / S, xHi = BC.x + (W + BR - 36 - CX) / S;
    const yLo = BC.y + (36 - BT - CY) / S, yHi = BC.y + (H + BB - 36 - CY) / S;
    const kw = 70 * dt, lim = 20 / S;
    for (let i = 0; i < P.n; i++) {
      if (P.x[i] < xLo) P.vx[i] += (xLo - P.x[i]) * kw; else if (P.x[i] > xHi) P.vx[i] -= (P.x[i] - xHi) * kw;
      if (P.y[i] < yLo) P.vy[i] += (yLo - P.y[i]) * kw; else if (P.y[i] > yHi) P.vy[i] -= (P.y[i] - yHi) * kw;
      if (reform < 0) {
        if (sinceRel < P.rel[i]) continue;
        // ink in water: a curl-noise swirl, a slow sink, drag
        const x = P.x[i], y = P.y[i];
        const a1 = x * 0.011 + t * 0.4, b1 = y * 0.013 - t * 0.3, c1 = (x + y) * 0.02 + t * 0.6;
        const dpy = -Math.sin(a1) * Math.sin(b1) * 0.013 + 0.5 * Math.cos(c1) * 0.02;
        const dpx = Math.cos(a1) * 0.011 * Math.cos(b1) + 0.5 * Math.cos(c1) * 0.02;
        P.vx[i] += (dpy * 5200 - P.vx[i]) * 0.8 * dt;
        P.vy[i] += (-dpx * 5200 - P.vy[i]) * 0.8 * dt + 34 * dt;
      } else {
        if (reform < P.del[i]) { P.vx[i] *= Math.exp(-dt * 1.4); P.vy[i] *= Math.exp(-dt * 1.4); }
        else {
          const dx = P.tx[i] - P.x[i], dy = P.ty[i] - P.y[i];
          const sw = 150 * Math.exp(-(reform - P.del[i]) * 2.2) / (Math.hypot(dx, dy) + 30);
          P.vx[i] += (om * om * dx - 2 * ze * om * P.vx[i] - dy * sw) * dt;
          P.vy[i] += (om * om * dy - 2 * ze * om * P.vy[i] + dx * sw) * dt;
        }
      }
      P.x[i] += P.vx[i] * dt;
      P.y[i] += P.vy[i] * dt;
      if (P.x[i] < xLo - lim) { P.x[i] = xLo - lim; if (P.vx[i] < 0) P.vx[i] = 0; }
      else if (P.x[i] > xHi + lim) { P.x[i] = xHi + lim; if (P.vx[i] > 0) P.vx[i] = 0; }
      if (P.y[i] < yLo - lim) { P.y[i] = yLo - lim; if (P.vy[i] < 0) P.vy[i] = 0; }
      else if (P.y[i] > yHi + lim) { P.y[i] = yHi + lim; if (P.vy[i] > 0) P.vy[i] = 0; }
    }
  }

  // ---------- drawing ----------
  function wobblePath(t) {
    const p = new Path2D();
    const amp = reduced ? 0 : 1;
    for (let i = 0; i < ON; i++) {
      const a = oAng[i];
      const o = amp * (2.3 * Math.sin(3 * a + t * 1.1) + 1.4 * Math.sin(5 * a - t * 1.6 + 1.3));
      const x = outline[i].x + oUx[i] * o, y = outline[i].y + oUy[i] * o;
      if (i) p.lineTo(x, y); else p.moveTo(x, y);
    }
    p.closePath();
    return p;
  }

  function leaderPts(L) {
    const A = { x: L.ax, y: L.ay + L.bobY + (L.side === "top" ? 3 : L.side === "bottom" ? -3 : 0) };
    if (L.side === "right") A.x -= 6;
    const B = toStage(L.cx, L.cy);
    const bend = (L.side === "right" ? 0.04 : -0.035) * (L.cx > 0 ? 1 : -1);
    return curve(A, B, bend);
  }

  function drawLeaders(color, alpha, insideOnly) {
    base();
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.beginPath();
    for (let k = 0; k < LOBES.length; k++) {
      const L = LOBES[k];
      if (L.line < 0.02) continue;
      const pts = leaderPts(L);
      const n = Math.max(2, Math.round((pts.length - 1) * L.line));
      const sub = pts.slice(0, n + 1);
      const hv = hover === k ? 1 : 0;
      const wMax = (narrow ? 1.5 : 1.9) + L.act * 1.1 + hv * 1.1;
      ribbon(g, sub, (u) => 0.55 + wMax * Math.sin(Math.PI * (0.15 + 0.7 * u)) ** 0.8);
    }
    g.fill();
    if (insideOnly) {
      // a small cream blot where each line lands
      g.beginPath();
      for (let k = 0; k < LOBES.length; k++) {
        const L = LOBES[k];
        if (L.line < 0.98) continue;
        const B = toStage(L.cx, L.cy), r = (narrow ? 2.4 : 3) + L.act * 2.2 + (hover === k ? 1.5 : 0);
        g.moveTo(B.x + r, B.y);
        for (let q = 1; q <= 6; q++) {
          const a = (q / 6) * TAU, rr = r * (1 + 0.18 * Math.sin(q * 2.1 + k));
          g.quadraticCurveTo(B.x + Math.cos(a - 0.52) * rr * 1.15, B.y + Math.sin(a - 0.52) * rr * 1.15, B.x + Math.cos(a) * rr, B.y + Math.sin(a) * rr);
        }
        g.closePath();
      }
      g.fill();
    }
    g.globalAlpha = 1;
  }

  function draw(t) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    const swapping = !!swap;

    // leader lines in the water colour of the text; the brain covers their inner half
    drawLeaders(fg, 0.9, false);

    brainTransform();
    const path = wobblePath(t);
    if (live.solid > 0.003) {
      g.globalAlpha = live.solid;
      g.fillStyle = INK;
      g.fill(path);
      g.globalAlpha = 1;
    }

    // lit lobes: cream dabs, area in proportion to activation, curled around each lobe like fingerprints.
    // The quiet part is cached in its own layer; only dabs that sparks are exciting are drawn live.
    if (live.solid > 0.5) {
      // drawn as vectors in brain space every frame: a cached bitmap rescaled by the breathing shimmered
      const a = clamp((live.solid - 0.5) * 2);
      brainTransform();
      g.save();
      g.clip(path);
      g.globalAlpha = a;
      g.beginPath();
      for (const d of dabs) {
        const I = dabI(d) + d.ex * 0.8;
        if (I < 0.03) continue;
        const r = 4.5 * Math.sqrt(Math.min(1.2, I)) * d.j;
        if (r < 0.45) continue;
        leaf(g, d.x, d.y, r * 1.6, r * 0.62, d.ca, d.sa);
      }
      g.fillStyle = CREAM;
      g.fill();
      g.restore();
      g.globalAlpha = 1;
    }

    // grooves: violet cuts through the ink, redrawn as strokes on every thought
    if (live.solid > 0.05) {
      g.fillStyle = VIOLET;
      g.globalAlpha = clamp(live.solid * 1.2);
      const tips = [];
      for (let i = 0; i < NG; i++) {
        const gr = grooves[i];
        if (!gr.anim) { if (gr.shown >= 0) g.fill(groovePath(gr.shown, i)); continue; }
        const a = gr.anim, e = t - a.t0;
        const p = new Path2D();
        if (a.from >= 0) {
          const u = e <= 0 ? 0 : easeInOut(clamp(e / a.dOff));
          if (u < 1) addPart(p, VARIANTS[a.from][i], u, 1);
          if (u > 0 && u < 1) tips.push(at(VARIANTS[a.from][i].pl, u * VARIANTS[a.from][i].pl.L));
        }
        if (a.to >= 0) {
          const v = easeOut(clamp((e - a.lag) / a.dOn));
          if (v > 0) addPart(p, VARIANTS[a.to][i], 0, v);
          if (v > 0 && v < 1) tips.push(at(VARIANTS[a.to][i].pl, v * VARIANTS[a.to][i].pl.L));
        }
        g.fill(p);
      }
      g.globalAlpha = 1;
      // the pen tip that carves a new fold carries a little cream
      if (tips.length) {
        g.fillStyle = CREAM;
        g.beginPath();
        for (const p of tips) { g.moveTo(p.x + 3.6, p.y); g.ellipse(p.x, p.y, 3.6, 2.5, t * 3, 0, TAU); }
        g.fill();
      }
    }

    // sparks: tapered cream comets inside the grooves
    if (sparks.length || pops.length || threads.length) {
      g.fillStyle = CREAM;
      g.beginPath();
      for (const sp of sparks) {
        const gr = VARIANTS[sp.v][sp.i];
        const s1 = clamp(sp.s, 0, gr.pl.L), s0 = clamp(sp.s - sp.dir * sp.len, 0, gr.pl.L);
        if (Math.abs(s1 - s0) < 2) continue;
        const wHead = Math.min(gr.w * 0.66, 11.5);
        ribbon(g, part(gr.pl, s0, s1, 2.5), (q) => wHead * (0.12 + 0.88 * q ** 1.5));
      }
      for (const th of threads) {
        const u = th.life / th.max;
        const pts = curve(th.a, th.b, 0.22, 14);
        const n = Math.max(2, Math.round(14 * clamp(u * 2.2)));
        const s = Math.max(0, Math.round(14 * clamp(u * 2.2 - 1)));
        if (n - s >= 2) ribbon(g, pts.slice(s, n + 1), (q) => 0.6 + 2 * Math.sin(Math.PI * q));
      }
      g.fill();
      g.beginPath();
      for (const p of pops) {
        const r = 2.2 * (1 - p.life / p.max) + 0.3;
        const a = Math.atan2(p.vy, p.vx);
        g.moveTo(p.x + Math.cos(a) * r * 1.6, p.y + Math.sin(a) * r * 1.6);
        g.ellipse(p.x, p.y, r * 1.6, r * 0.7, a, 0, TAU);
      }
      g.fill();
    }

    // inner half of the leader lines, in cream, only where they cross the brain
    if (live.solid > 0.6 && !swapping) {
      g.save();
      g.clip(path);
      drawLeaders(CREAM, 0.38, true);
      g.restore();
      // label pings: a spark running out along the line from the lobe to its label
      base();
      g.fillStyle = CREAM;
      g.beginPath();
      for (const L of LOBES) {
        if (!L.pingAt || t < L.pingAt - 0.55 || t > L.pingAt) continue;
        const pl = polyline(leaderPts(L).reverse());
        const s1 = easeInOut(clamp(1 - (L.pingAt - t) / 0.55)) * pl.L, s0 = Math.max(0, s1 - 44);
        if (s1 - s0 > 2) ribbon(g, part(pl, s0, s1, 3), (q) => 0.4 + 3.4 * q ** 1.5);
      }
      g.fill();
      brainTransform();
    }

    // eyes
    if (live.solid > 0.02) {
      g.globalAlpha = clamp(live.solid * 1.3);
      for (const e of EYES) drawEye(e);
      g.globalAlpha = 1;
    }

    // specks of the dissolving / re-forming brain
    if (swap?.P && swap.P.a > 0.01) drawSpecks(swap.P, t);

    // the splat that comes with the stamp
    if (flecks.length) {
      base();
      g.fillStyle = CREAM;
      g.beginPath();
      for (const f of flecks) {
        const k = 1 - f.life / f.max, r = f.r * (0.4 + 0.6 * k), sp = Math.hypot(f.vx, f.vy) / 120 + 1;
        g.moveTo(f.x + Math.cos(f.ang) * r * sp, f.y + Math.sin(f.ang) * r * sp);
        g.ellipse(f.x, f.y, r * sp, r / Math.sqrt(sp), f.ang, 0, TAU);
      }
      g.fill();
    }
  }

  function dabI(d) {
    let I = LOBES[d.k].lit01 * (0.4 + 0.6 * d.f);
    if (hoverMix > 0.001) {
      if (d.k === hoverShown) I = lerp(I, Math.max(I, 0.2 + 0.22 * d.f) + (d.edge ? 0.5 : 0), hoverMix);
      else I *= 1 - 0.7 * hoverMix;
    }
    return I;
  }

  function drawEye(e) {
    const ga = g.globalAlpha;
    g.save();
    g.translate(e.x, e.y);
    g.rotate(e.a);
    g.beginPath();
    g.ellipse(0, 0, e.rx, e.ry, 0, 0, TAU);
    g.fillStyle = CREAM;
    g.fill();
    g.clip();
    const p = e.r * PUPIL * live.dil * (swap && !swap.formed ? 1 - clamp((now() - swap.t0 - 0.12) / 0.3) : 1);
    g.fillStyle = INK;
    if (p > 0.5) {
      g.beginPath();
      g.arc(e.ox, e.oy, p, 0, TAU);
      g.fill();
    }
    // the lids are ink: the upper one comes down to the seam, the lower one rises to meet it late in the
    // stroke, and a shut eye leaves its lid line in cream, so the brain never shows no eyes at all
    const lid = live.lid || 0;
    if (lid > 0.001) {
      const X = e.seamX, ry = e.ry, sE = SEAM_E * ry, sC = SEAM_C * ry;
      const uE = lerp(-1.3 * ry, sE, lid), uC = lerp(-1.05 * ry, sC, lid);
      g.beginPath();
      g.moveTo(-X, -ry - 4);
      g.lineTo(X, -ry - 4);
      g.lineTo(X, uE);
      g.quadraticCurveTo(0, uC, -X, uE);
      g.closePath();
      const v = smooth(clamp((lid - 0.55) / 0.45));
      if (v > 0) {
        const lE = lerp(1.15 * ry, sE, v), lC = lerp(1.3 * ry, sC, v);
        g.moveTo(-X, ry + 4);
        g.lineTo(X, ry + 4);
        g.lineTo(X, lE);
        g.quadraticCurveTo(0, lC, -X, lE);
        g.closePath();
      }
      g.fill();
      const k = smooth(clamp((lid - 0.72) / 0.28));
      if (k > 0.01) {
        g.globalAlpha = ga * k;
        g.fillStyle = CREAM;
        g.fill(e.lidLine);
      }
    }
    g.restore();
    g.globalAlpha = ga;
  }

  function drawSpecks(P, t) {
    g.globalAlpha = P.a;
    for (const col of [0, 1]) {
      g.beginPath();
      for (let i = 0; i < P.n; i++) {
        if (P.c[i] !== col) continue;
        const vx = P.vx[i], vy = P.vy[i], sp = Math.hypot(vx, vy);
        const moving = swap.tMid ? t - swap.tMid > P.del[i] : t - swap.relAt > P.rel[i];
        const st = moving ? 1 + Math.min(1, sp / 120) : 1;
        let r = P.r[i];
        if (!swap.tMid && moving) r *= 1 - 0.38 * clamp((t - swap.relAt - P.rel[i]) / 1.6);
        else if (swap.tMid) r *= 0.62 + 0.38 * clamp((t - swap.tMid - P.del[i]) / 0.9);
        const ca = sp > 0.01 ? vx / sp : 1, sa = sp > 0.01 ? vy / sp : 0;
        leaf(g, P.x[i], P.y[i], r * st * 1.12, (r / Math.sqrt(st)) * 0.92, ca, sa);
      }
      g.fillStyle = col ? CREAM : INK;
      g.fill();
    }
    g.globalAlpha = 1;
  }

  // ---------- wiring ----------
  // The text colour comes from the --fg that depth writes inline on <html>: reading a declared value is
  // free, unlike getComputedStyle. The canvas lines then fade to it on their own (see update).
  const rootStyle = document.documentElement.style;
  let fgVar = null, fgFrom = [11, 11, 11], fgTo = [11, 11, 11], fgK = 1;
  const rgbOf = (v) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(v).trim());
    if (!m) return [11, 11, 11];
    const n = parseInt(m[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  };
  function checkFg() {
    const v = rootStyle.getPropertyValue("--fg");
    if (v === fgVar) return;
    const first = fgVar === null;
    fgVar = v;
    const to = rgbOf(v || INK);
    const e = easeOut(fgK);
    fgFrom = fgFrom.map((c, i) => Math.round(lerp(c, fgTo[i], e)));
    fgTo = to;
    if (first || reduced || !visible) { fgK = 1; fgFrom = to; fg = `rgb(${to.join(",")})`; } else fgK = 0;
    dirty = true;
  }
  bus.on("thought", onThought);
  bus.on("brain:swap:start", onSwapStart);
  bus.on("brain:swap:mid", onSwapMid);
  bus.on("brain:swap:done", onSwapDone);
  bus.on("brain:countdown", ({ ms } = {}) => { live.drowsyT = !swap && ms < 60000 ? clamp(1 - ms / 60000) : 0; });
  bus.on("depth", checkFg);

  // what moves or resizes the plate: its own width, the heading above it (fonts, wrapping), the window,
  // and anything that changes the page's height (that only moves it: re-read the rects)
  const ro = new ResizeObserver((entries) => {
    for (const en of entries) {
      if (en.target === document.body) needRects = true;
      else if (en.target !== mount) needLayout = true;
      else if (Math.round(en.contentRect.width) !== mountW) { mountW = Math.round(en.contentRect.width); needLayout = true; }
    }
  });
  ro.observe(mount);
  if (head) ro.observe(head);
  ro.observe(document.body);
  addEventListener("resize", () => { needLayout = true; }, { passive: true });
  const fontsChanged = () => { fontsDirty = true; needLayout = true; };
  document.fonts?.ready?.then(fontsChanged);
  document.fonts?.addEventListener?.("loadingdone", fontsChanged);
  new IntersectionObserver((es) => {
    const v = es[es.length - 1].isIntersecting;
    if (v && !visible) needRects = true;
    visible = v;
    dirty = true;
  }, { rootMargin: "120px" }).observe(stage);

  mountW = Math.round(mount.clientWidth);
  applyLayout(computeLayout());
  checkFg();
  refreshCaption(true);
  const debug = !!ctx.params?.has?.("debug");
  let cost = 0;
  if (debug) {
    window.__brain = {
      toBrain, toStage, inside, lobeAt, LOBES, poke: pokeLobe,
      get hover() { return hover; }, get cost() { return cost; },
      get layout() { return { W, H, S, CX, CY, narrow, BL, BT, BR, BB, stamp: stampPos }; },
      holdLid(v = null) { holdLid = v === null ? null : clamp(+v); dirty = true; },
    };
  }
  // seed the map with anything I already thought before this module woke up
  for (const th of (state.thoughts || []).slice(-3)) onThought(th);

  // read phase: layout reads happen here, before any module writes in this frame
  loop.read((t) => {
    if (needLayout) {
      needLayout = false;
      const p = computeLayout();
      if (p) pending = p;
    } else if (needRects || (visible && t - rectsAt > 2)) {
      needRects = false;
      readRects();
    }
  });

  let lastPX2 = -1, lastPY2 = -1;
  loop.add((t, dt) => {
    // a new layout is applied even off screen, so the page height is right before anyone scrolls here
    if (pending) { applyLayout(pending); pending = null; }
    if (!visible) return;
    if (reduced) {
      const moved = pointer.x !== lastPX2 || pointer.y !== lastPY2;
      lastPX2 = pointer.x; lastPY2 = pointer.y;
      if (!dirty && !moved && !swap && LOBES.every((L) => Math.abs(L.target - L.act) < 0.004)) return;
    }
    dirty = false;
    const t0 = debug ? performance.now() : 0;
    update(t, Math.min(dt, 1 / 30));
    draw(t);
    if (debug) cost = cost * 0.95 + (performance.now() - t0) * 0.05;
  });
}
