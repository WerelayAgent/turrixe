// The tiny Turri beside the ask box. Same glass, brain and eyes as the big one (assets/jelly.json), at pocket size.
// It watches whatever matters: your caret while you type, the question bubble on its way in, each word as it
// writes the answer, and you when nothing else is going on. Faces (moods) only move the eyelids; gaze is separate.
// Heartbeat: contract ~300 ms, relax ~900 ms with an overshoot; blinks follow the house timing (92/26/185 ms).
// Gaze never asks layout. The host places the svg once per frame (client position of the viewBox origin and its
// scale, from rects it caches), and the jelly composes its own group transforms into matrices, so mapping a client
// point into the brain or an eye is a few multiplications instead of a getScreenCTM per eye per frame.
import { clamp, smooth, outCubic, outBack, ease, rand, r1, svgEl, ribbon, ringPath } from "./util.js";

const MOODS = {
  calm: { open: 1, soft: 0, size: 1, pupil: 1 },
  proud: { open: 0.66, soft: 0.18, size: 1, pupil: 1 },
  up: { open: 1, soft: 0, size: 1.04, pupil: 1 },
  down: { open: 0.82, soft: 0, size: 1, pupil: 1 },
  soft: { open: 0.9, soft: 0.62, size: 1, pupil: 1.05 },
  narrow: { open: 0.5, soft: 0.28, size: 0.97, pupil: 0.9 },
  wide: { open: 1, soft: 0, size: 1.13, pupil: 0.78 },
  sleepy: { open: 0.32, soft: 0.1, size: 1, pupil: 1 },
};
const PIVOT_Y = -40, HEM_Y = 138;
const TENTS = [
  { x: -176, len: 250, ph: 0.0, w: 21 },
  { x: -88, len: 300, ph: 1.7, w: 23 },
  { x: 2, len: 330, ph: 3.1, w: 24 },
  { x: 92, len: 290, ph: 4.4, w: 23 },
  { x: 178, len: 240, ph: 5.6, w: 21 },
];
const NODES = 12;
const DEG = Math.PI / 180;
const BRAIN_ROT = -4, BRAIN_S = 0.56;

function envelope(t, fast) {
  const tc = 0.3 / fast, tr = 0.9 / Math.sqrt(fast);
  if (t < tc) return outCubic(t / tc);
  const u = (t - tc) / tr;
  if (u >= 1) return 0;
  return Math.cos(Math.PI * 1.5 * u) * Math.exp(-2.6 * u);
}

// 2D affine matrices as [a, b, c, d, e, f], the SVG order: x' = a x + c y + e, y' = b x + d y + f.
// mul() computes everything before writing, so out may alias either input.
function mul(A, B, o) {
  const a = A[0] * B[0] + A[2] * B[1], b = A[1] * B[0] + A[3] * B[1];
  const c = A[0] * B[2] + A[2] * B[3], d = A[1] * B[2] + A[3] * B[3];
  const e = A[0] * B[4] + A[2] * B[5] + A[4], f = A[1] * B[4] + A[3] * B[5] + A[5];
  o[0] = a; o[1] = b; o[2] = c; o[3] = d; o[4] = e; o[5] = f;
  return o;
}
// translate(tx ty) rotate(deg) scale(s)
function trs(o, tx, ty, deg, s = 1) {
  const r = deg * DEG, co = Math.cos(r) * s, si = Math.sin(r) * s;
  o[0] = co; o[1] = si; o[2] = -si; o[3] = co; o[4] = tx; o[5] = ty;
  return o;
}
// a client point in the local space of M; false when M has squashed everything flat (zero-size svg)
function unmap(M, x, y, out) {
  const det = M[0] * M[3] - M[1] * M[2];
  if (!(Math.abs(det) > 1e-9)) return false;
  const dx = x - M[4], dy = y - M[5];
  out.x = (M[3] * dx - M[2] * dy) / det;
  out.y = (M[0] * dy - M[1] * dx) / det;
  return true;
}
// setAttribute only when the value really changed (unchanged writes still dirty the svg's style)
function setA(node, name, v) {
  const k = "_" + name;
  if (node[k] === v) return;
  node[k] = v;
  node.setAttribute(name, v);
}

export function createTinyJelly(mount, ctx) {
  const J = ctx.assets.jelly;
  const reduced = !!ctx.reduced;
  const svg = svgEl("svg", { class: "ask-jelly", viewBox: "-300 -250 600 700", "aria-hidden": "true", focusable: "false" });
  const defs = svgEl("defs", {}, svg);
  const world = svgEl("g", {}, svg);
  const tentG = svgEl("g", {}, world);
  const body = svgEl("g", {}, world);
  svgEl("path", { class: "ask-ink", "fill-rule": "evenodd", d: J.bell.d + J.bell.inner }, body);
  svgEl("path", { class: "ask-glass", d: J.bell.inner }, body);
  const brainG = svgEl("g", {}, body);
  svgEl("path", { class: "ask-ink", d: J.brain.d }, brainG);
  const groovesEl = svgEl("path", { class: "ask-glass" }, brainG);
  const sparkEl = svgEl("path", { class: "ask-cream" }, brainG);
  svgEl("path", { class: "ask-cream", d: J.bell.glint }, body);
  const fxG = svgEl("g", {}, svg);
  mount.appendChild(svg);

  // ---------- eyes with clipPath lids ----------
  const uid = `askj${Math.random().toString(36).slice(2, 7)}`;
  const pr0 = J.brain.pupil ?? 0.47;
  const eyes = J.brain.eyes.map((e, i) => {
    const clip = svgEl("clipPath", { id: `${uid}-${i}`, clipPathUnits: "userSpaceOnUse" }, defs);
    const ap = svgEl("ellipse", { cx: e.x, cy: e.y, rx: e.rx * 1.14, ry: e.ry * 1.14 }, clip);
    const eg = svgEl("g", { transform: `rotate(${e.rot} ${e.x} ${e.y})` }, brainG);
    const inner = svgEl("g", { "clip-path": `url(#${uid}-${i})` }, eg);
    const white = svgEl("ellipse", { class: "ask-cream", cx: e.x, cy: e.y, rx: e.rx, ry: e.ry }, inner);
    const r = Math.min(e.rx, e.ry) * pr0;
    const pupil = svgEl("circle", { class: "ask-ink", cx: e.x, cy: e.y, r: r1(r) }, inner);
    // the eye group's own rotate(rot x y), fixed for life
    const rr = (e.rot || 0) * DEG, co = Math.cos(rr), si = Math.sin(rr);
    const E = [co, si, -si, co, e.x - co * e.x + si * e.y, e.y - si * e.x - co * e.y];
    return { e, eg, ap, white, pupil, r, E, ox: 0, oy: (e.ry - r) * 0.35 };
  });

  // ---------- matrices (client <- viewBox <- world <- body <- brain <- eye) ----------
  const Mroot = [1, 0, 0, 1, 0, 0];        // set by place(): viewBox units to client px
  const Mwb = [1, 0, 0, 1, 0, 0];          // world · body, from the last update
  const Mw = [1, 0, 0, 1, 0, 0], Mb = [1, 0, 0, 1, 0, 0], Mg = [1, 0, 0, 1, 0, 0];
  const Mbody = [1, 0, 0, 1, 0, 0], Mbrain = [1, 0, 0, 1, 0, 0], Meye = [1, 0, 0, 1, 0, 0];
  const q = { x: 0, y: 0 };
  let placed = false;

  // ---------- brain grooves (morph point by point between the 6 variants) ----------
  const V = J.brain.grooves;
  let variant = (ctx.state.version || 0) % V.length;
  const cur = V[variant].map((g) => Float32Array.from(g.pts.flat()));
  const widths = V[variant].map((g) => g.w);
  let morph = null, spark = null, groovesDirty = true;
  const HW = new Float32Array(64);
  function renderGrooves() {
    let d = "";
    for (let k = 0; k < cur.length; k++) {
      const c = cur[k], m = c.length / 2, w = widths[k];
      for (let i = 0; i < m; i++) HW[i] = w * 0.33 * (0.62 + 0.38 * Math.sin((Math.PI * i) / (m - 1)));
      d += ribbon(c, m, HW);
    }
    groovesEl.setAttribute("d", d);
  }
  const SP = new Float32Array(128), SW = new Float32Array(64);
  function renderSpark(T) {
    if (!spark) return;
    const p = (T - spark.t0) / spark.dur;
    if (p > 1.15) { spark = null; sparkEl.setAttribute("d", ""); return; }
    if (p <= 0) return;
    const c = cur[spark.k], m = c.length / 2;
    const head = clamp(p * 1.3) * (m - 1), tail = Math.max(0, head - m * 0.4);
    let n = 0;
    for (let i = Math.floor(tail); i <= Math.ceil(head) && i < m; i++) { SP[2 * n] = c[2 * i]; SP[2 * n + 1] = c[2 * i + 1]; n++; }
    if (n < 2) { sparkEl.setAttribute("d", ""); return; }
    const fade = 1 - smooth((p - 0.8) / 0.35);
    for (let i = 0; i < n; i++) SW[i] = Math.max(0.5, widths[spark.k] * 0.2 * fade * (0.35 + 0.65 * (i / (n - 1))));
    sparkEl.setAttribute("d", ribbon(SP, n, SW));
  }

  // ---------- tentacles ----------
  const TB = new Float32Array(NODES * 2), TW = new Float32Array(NODES);
  const tentEls = TENTS.map(() => svgEl("path", { class: "ask-ink" }, tentG));

  // ---------- state ----------
  let last = 0;
  let beatT = 9, beatFast = 1, beatAmp = 1, nextCalm = rand(0.4, 1.6), carry = 0, cNow = 0;
  let rise = 0, riseV = 0, squish = 0, squishV = 0, tilt = 0, tiltTo = 0;
  let mood = MOODS.calm, moodName = "calm", openM = 1, softM = 0, sizeM = 1, pupilM = 1;
  let target = null;
  const lean = { x: 0, y: 0 };
  let blinkAt = rand(1.2, 3), dbl = false, lidsShut = false, shut = 0, sleep = 0;
  let thinking = false, nextBubble = 0;
  const bubbles = [];

  // a new beat starts from wherever the bell is (the old contraction is carried and decays), so quick beats
  // stack into a bigger squeeze instead of snapping the bell back to rest
  function beat(amp = 1, fast = 1) { carry = cNow; beatT = 0; beatAmp = clamp(amp, 0.2, 1.4); beatFast = fast; }
  function rewire(to) {
    if (to == null) to = (variant + 1 + Math.floor(Math.random() * (V.length - 1))) % V.length;
    morph = { from: cur.map((a) => a.slice()), to: V[to].map((g) => g.pts.flat()), t0: last };
    variant = to;
    spark = { k: Math.floor(Math.random() * 3), t0: last + 0.06, dur: 0.7 };
  }

  function update(t, dt) {
    last = t;
    // heartbeat: calm rhythm, quicker while thinking
    beatT += dt;
    nextCalm -= dt;
    if (nextCalm <= 0 && !reduced) { beat(thinking ? 0.75 : 0.55, thinking ? 1.5 : 1); nextCalm = thinking ? rand(0.9, 1.2) : rand(2.5, 3.1); }
    carry *= Math.exp(-dt / 0.12);
    const c = reduced ? 0 : envelope(beatT, beatFast) * beatAmp + carry;
    cNow = c;
    // body: rises on each stroke, sinks back slowly
    riseV += (-c * 60 - rise * 5) * dt * 6;
    riseV *= Math.exp(-dt * 5);
    rise += riseV * dt;
    squishV += (-squish * 140 - squishV * 9) * dt;
    squish += squishV * dt;
    tilt += (tiltTo - tilt) * ease(dt, 0.5);
    const riseR = r1(rise), tiltR = r1(tilt);
    setA(world, "transform", `translate(0 ${riseR}) rotate(${tiltR} 0 0)`);
    const sx = +(1 + 0.07 * c + 0.12 * squish).toFixed(4), sy = +(1 - 0.1 * c - 0.12 * squish).toFixed(4);
    setA(body, "transform", `translate(0 ${PIVOT_Y}) scale(${sx} ${sy}) translate(0 ${-PIVOT_Y})`);
    // the same two transforms as numbers, for the gaze
    trs(Mw, 0, riseR, tiltR);
    Mb[0] = sx; Mb[1] = 0; Mb[2] = 0; Mb[3] = sy; Mb[4] = 0; Mb[5] = PIVOT_Y - sy * PIVOT_Y;
    mul(Mw, Mb, Mwb);

    // tentacles hang from the hem and trail the strokes
    const hemY = PIVOT_Y + (HEM_Y - PIVOT_Y) * sy;
    for (let k = 0; k < TENTS.length; k++) {
      const tn = TENTS[k], ax = tn.x * sx;
      for (let i = 0; i < NODES; i++) {
        const f = i / (NODES - 1);
        const sway = reduced ? 0 : Math.sin(t * 1.35 - f * 3.4 + tn.ph) * 26 * Math.pow(f, 1.25) + Math.sin(t * 0.6 + tn.ph * 2) * 10 * f;
        const pull = (tn.x * 0.12 + tilt * -3) * f * f;
        TB[2 * i] = ax + sway + pull + c * tn.x * 0.18 * f;
        TB[2 * i + 1] = hemY - 6 + tn.len * f * (1 - 0.1 * c) + (reduced ? 0 : rise * 0.25 * f);
        TW[i] = Math.max(2.4, (tn.w * Math.pow(1 - f, 0.85) + 4.6 * f) * 0.5);
      }
      setA(tentEls[k], "d", ribbon(TB, NODES, TW));
    }

    // brain morph + lean toward what it watches (2-3x slower than the eyes)
    if (morph) {
      let done = true;
      for (let k = 0; k < cur.length; k++) {
        const p = (t - morph.t0 - k * 0.06) / 0.6;
        if (p < 1) done = false;
        const e = outBack(clamp(p), 0.9), a = morph.from[k], z = morph.to[k], cc = cur[k];
        for (let i = 0; i < cc.length; i++) cc[i] = a[i] + (z[i] - a[i]) * e;
      }
      if (done) morph = null;
      groovesDirty = true;
    }
    if (groovesDirty) { groovesDirty = false; renderGrooves(); }
    renderSpark(t);

    // mood eases in over ~400 ms
    const fm = ease(dt, 0.14);
    openM += (mood.open - openM) * fm; softM += (mood.soft - softM) * fm;
    sizeM += (mood.size - sizeM) * fm; pupilM += (mood.pupil - pupilM) * fm;

    // blink: close 92 ms smoothstep, hold 26 ms, open 185 ms ease-out cubic, every 2.5-4.2 s, 14% double
    let open = 1;
    blinkAt -= dt;
    if (blinkAt <= 0) {
      const bt = -blinkAt;
      if (bt < 0.092) open = 1 - smooth(bt / 0.092);
      else if (bt < 0.118) open = 0;
      else if (bt < 0.303) open = outCubic((bt - 0.118) / 0.185);
      else if (!dbl && Math.random() < 0.14) { dbl = true; blinkAt = 0.24 - 0.303; }
      else { dbl = false; blinkAt = rand(2.5, 4.2); }
    }
    shut += ((lidsShut ? 1 : 0) - shut) * ease(dt, 0.12);
    open = Math.min(open, openM) * (1 - shut) * (1 - sleep * 0.92);

    // the brain group as drawn this frame (it trails the lean by a frame, as before)
    const gx = r1(-4 + lean.x), gy = r1(4 + lean.y);
    setA(brainG, "transform", `translate(${gx} ${gy}) rotate(${BRAIN_ROT}) scale(${BRAIN_S})`);
    const aim = target && placed;
    if (aim) {
      mul(Mroot, Mwb, Mbody);
      mul(Mbody, trs(Mg, gx, gy, BRAIN_ROT, BRAIN_S), Mbrain);
    }
    const fl = ease(dt, 0.15);
    if (aim && unmap(Mbrain, target.x, target.y, q)) {
      lean.x += (clamp((q.x + 120) * 0.02, -9, 9) - lean.x) * fl;
      lean.y += (clamp((q.y + 20) * 0.02, -7, 7) - lean.y) * fl;
    } else if (!target) {
      lean.x += (0 - lean.x) * fl; lean.y += (2 - lean.y) * fl;
    }

    const f = ease(dt, 0.055);
    for (const eye of eyes) {
      const { e, r } = eye;
      const pr = r * pupilM;
      const mx = (e.rx - pr) * 0.94, my = (e.ry - pr) * 0.94;
      let tx = 0, ty = my * 0.35;   // at rest it looks a little down, at the text
      if (aim && unmap(mul(Mbrain, eye.E, Meye), target.x, target.y, q)) {
        const dx = q.x - e.x, dy = q.y - e.y, d = Math.hypot(dx, dy) || 1, reach = Math.min(1, d / 125);
        tx = (dx / d) * reach * mx; ty = (dy / d) * reach * my;
      }
      eye.ox += (tx - eye.ox) * f; eye.oy += (ty - eye.oy) * f;
      setA(eye.pupil, "cx", r1(e.x + eye.ox));
      setA(eye.pupil, "cy", r1(e.y + eye.oy));
      setA(eye.pupil, "r", r1(pr));
      const s = sizeM;
      setA(eye.white, "rx", r1(e.rx * s)); setA(eye.white, "ry", r1(e.ry * s));
      // lids: the upper one closes downward, the lower one rises for a soft (smiling) face
      const top0 = e.y - e.ry * 1.14 * s, bot0 = e.y + e.ry * 1.14 * s;
      const bot = bot0 - (bot0 - top0) * 0.42 * softM;
      const top = top0 + (bot - top0) * (1 - open);
      setA(eye.ap, "cy", r1((top + bot) / 2));
      setA(eye.ap, "ry", r1(Math.max(0, (bot - top) / 2)));
      setA(eye.ap, "rx", r1(e.rx * 1.14 * s));
    }

    // thinking bubbles rise out of the bell
    if (thinking && !reduced && t > nextBubble) {
      nextBubble = t + rand(0.2, 0.34);
      bubbles.push({ el: svgEl("path", { class: "ask-cream" }, fxG), x: rand(-120, 110), r: rand(9, 17), t0: t, life: rand(0.9, 1.3), seed: rand(0, 6) });
    }
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i], p = (t - b.t0) / b.life;
      if (p >= 1) { b.el.remove(); bubbles.splice(i, 1); continue; }
      const y = -150 - 170 * outCubic(p) + rise, x = b.x + Math.sin(p * 7 + b.seed) * 12;
      b.el.setAttribute("d", ringPath(x, y, b.r * (0.6 + 0.4 * p), Math.max(2, b.r * 0.32), b.seed + p * 2, 14));
      b.el.setAttribute("opacity", (1 - smooth((p - 0.6) / 0.4)).toFixed(2));
    }
  }

  return {
    svg,
    update,
    beat,
    rewire,
    // where the svg sits this frame: client position of the viewBox origin (0, 0) and px per viewBox unit
    place(x0, y0, s) {
      placed = s > 1e-4 && Number.isFinite(x0) && Number.isFinite(y0);
      Mroot[0] = s; Mroot[1] = 0; Mroot[2] = 0; Mroot[3] = s; Mroot[4] = x0; Mroot[5] = y0;
    },
    setTarget(p) { target = p; },
    setMood(name) { moodName = MOODS[name] ? name : "calm"; mood = MOODS[moodName]; },
    get mood() { return moodName; },
    think(on) { thinking = on; if (on) { beat(1, 1.4); nextCalm = 0.5; } },
    shut(on) { lidsShut = on; },
    sleep(v) { sleep = clamp(v); },
    poke() { squishV += 9; beat(1.2, 1.6); this.setMood("wide"); tiltTo = rand(-6, 6); setTimeout(() => { tiltTo = 0; }, 700); },
    tilt(v) { tiltTo = v; },
    // client-space point at the centre of the glass (where questions are swallowed)
    mouth() {
      if (!placed) return null;
      const M = mul(Mroot, Mwb, Mbody), x = 10, y = -40;
      return { x: M[0] * x + M[2] * y + M[4], y: M[1] * x + M[3] * y + M[5] };
    },
  };
}
