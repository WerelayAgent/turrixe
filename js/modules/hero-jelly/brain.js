// The brain that lives in the glass bell: ink mass, glass-coloured grooves that morph between the 6 variants,
// a cream "wet ink" layer, a cream spark for thoughts, and two eyes with clipPath eyelids.
import { svgEl, ribbon, arcLen, slice, clamp, easeOutBack, smoothstep } from "./util.js";

const HW = new Float32Array(64), CUM = new Float32Array(64), SB = new Float32Array(160), ST = new Float32Array(80), SH = new Float32Array(80);

let BID = 0;

export function createBrain(J, ink, parent, defs, uid, variant) {
  const id = `${uid}-b${++BID}`;
  const V = J.brain.grooves;
  const g = svgEl("g", { class: "hj-brain" }, parent);
  svgEl("path", { class: "hj-ink", d: J.brain.d }, g);
  const groovesEl = svgEl("path", { class: "hj-glassc" }, g);
  const wetEl = svgEl("path", { class: "hj-cream", opacity: "0" }, g);
  const sparkEl = svgEl("path", { class: "hj-cream" }, g);
  const pr0 = J.brain.pupil ?? 0.47;
  const clips = [];
  const eyes = J.brain.eyes.map((e, i) => {
    const clip = svgEl("clipPath", { id: `${id}-lid${i}`, clipPathUnits: "userSpaceOnUse" }, defs);
    clips.push(clip);
    const ap = svgEl("ellipse", { cx: e.x, cy: e.y, rx: e.rx * 1.12, ry: e.ry * 1.12 }, clip);
    const eg = svgEl("g", { transform: `rotate(${e.rot} ${e.x} ${e.y})` }, g);
    const inner = svgEl("g", { "clip-path": `url(#${id}-lid${i})` }, eg);
    const white = svgEl("ellipse", { class: "hj-cream", cx: e.x, cy: e.y, rx: e.rx, ry: e.ry }, inner);
    const r = Math.min(e.rx, e.ry) * pr0;
    const pupil = svgEl("circle", { class: "hj-ink", cx: e.x, cy: e.y + 8, r: r.toFixed(1) }, inner);
    // closed-eye lid line, a cream swell like a sleeping smile turned upside down
    const ctrl = [
      ink.P(e.x - e.rx * 0.8, e.y + e.ry * 0.36), ink.P(e.x - e.rx * 0.38, e.y + e.ry * 0.6),
      ink.P(e.x + e.rx * 0.05, e.y + e.ry * 0.66), ink.P(e.x + e.rx * 0.45, e.y + e.ry * 0.57), ink.P(e.x + e.rx * 0.8, e.y + e.ry * 0.34),
    ];
    const lidD = ink.brush(ink.spline(ctrl, false, 10), (t) => 4 + 9 * Math.sin(Math.PI * t));
    const lid = svgEl("path", { class: "hj-cream", d: lidD, opacity: "0" }, eg);
    return { e, eg, ap, white, pupil, lid, r, ox: 0, oy: e.ry * 0.2, pr: 1, sx: 1, lidOn: 0 };
  });

  const cur = V[variant].map((gr) => Float32Array.from(gr.pts.flat()));
  const widths = V[variant].map((gr) => gr.w);

  const b = {
    g, eyes, variant, cur, widths,
    draw: cur.map(() => 1),      // draw-on progress per groove (a new brain writes its grooves)
    wet: 0,                      // cream wet-ink layer opacity
    open: 1,                     // eyelid factor owned by this brain (swap closes it)
    morph: null, spark: null, dirty: true,
    x: 0, y: 0, rot: 0, sx: 1, sy: 1, alpha: 1,
    setTransform() {
      const s = 0.56;
      const tx = (-4 + b.x).toFixed(2), ty = (4 + b.y).toFixed(2), r = (-4 + b.rot).toFixed(2), sx = (s * b.sx).toFixed(4), sy = (s * b.sy).toFixed(4);
      g.setAttribute("transform", `translate(${tx} ${ty}) rotate(${r}) scale(${sx} ${sy})`);
      // the same transform as a matrix, so the eyes can map the pointer without asking the browser for a CTM
      // (getScreenCTM in the middle of a frame forces a full layout)
      b.m = new DOMMatrix().translateSelf(+tx, +ty).rotateSelf(+r).scaleSelf(+sx, +sy);
    },
    rewire(T, to) {
      if (to == null) { to = (b.variant + 1 + Math.floor(Math.random() * (V.length - 1))) % V.length; }
      if (to === b.variant && !b.morph) return;
      b.morph = { from: b.cur.map((a) => a.slice()), to: V[to].map((gr) => gr.pts.flat()), t0: T };
      b.variant = to;
      const k = Math.floor(Math.random() * 3);
      b.spark = { k, t0: T + 0.08, dur: 0.75 };
    },
    update(T) {
      if (b.morph) {
        const { from, to, t0 } = b.morph;
        let done = true;
        for (let k = 0; k < b.cur.length; k++) {
          const p = (T - t0 - k * 0.065) / 0.62;
          if (p < 1) done = false;
          const e = easeOutBack(clamp(p), 0.9);
          const a = from[k], z = to[k], c = b.cur[k];
          for (let i = 0; i < c.length; i++) c[i] = a[i] + (z[i] - a[i]) * e;
        }
        if (done) b.morph = null;
        b.dirty = true;
      }
      if (b.spark && T - b.spark.t0 > b.spark.dur + 0.3) { b.spark = null; sparkEl.setAttribute("d", ""); }
      if (b.dirty) { b.dirty = false; renderGrooves(); }
      if (b.spark) renderSpark(T);
      wetEl.setAttribute("opacity", b.wet.toFixed(3));
    },
    remove() { g.remove(); clips.forEach((c) => c.remove()); },
  };

  function grooveD(k, upto) {
    const c = b.cur[k], m = c.length / 2, w = b.widths[k];
    if (upto >= 0.999) {
      for (let i = 0; i < m; i++) HW[i] = w * 0.33 * (0.62 + 0.38 * Math.sin((Math.PI * i) / (m - 1)));
      return ribbon(c, m, HW, true);
    }
    if (upto <= 0.01) return "";
    arcLen(c, m, CUM);
    const cnt = slice(c, m, CUM, 0, upto, SB, ST);
    for (let i = 0; i < cnt; i++) SH[i] = w * 0.33 * (0.62 + 0.38 * Math.sin(Math.PI * ST[i])) * (0.55 + 0.45 * smoothstep((upto - ST[i]) / 0.08 + 0.2));
    return ribbon(SB, cnt, SH, true);
  }
  function renderGrooves() {
    let d = "";
    for (let k = 0; k < b.cur.length; k++) d += grooveD(k, b.draw[k]);
    groovesEl.setAttribute("d", d);
    wetEl.setAttribute("d", d);
  }
  function renderSpark(T) {
    const s = b.spark, p = (T - s.t0) / s.dur;
    if (p <= 0) return;
    const c = b.cur[s.k], m = c.length / 2;
    arcLen(c, m, CUM);
    const head = clamp(p * 1.3), tail = clamp(head - 0.42);
    const cnt = slice(c, m, CUM, tail, head, SB, ST);
    if (cnt < 2) { sparkEl.setAttribute("d", ""); return; }
    const w = b.widths[s.k] * 0.3 * (1 - smoothstep((p - 0.85) / 0.3));
    for (let i = 0; i < cnt; i++) SH[i] = Math.max(0.4, w * smoothstep((ST[i] - tail) / Math.max(0.01, head - tail)));
    sparkEl.setAttribute("d", ribbon(SB, cnt, SH, true));
  }

  b.setTransform();
  return b;
}
