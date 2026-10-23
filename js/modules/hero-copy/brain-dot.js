// The dot of the "i": Turri's brain with two cream eyes, drawn from assets/jelly.json.
// Eyes follow a screen point, blink with a clipPath lid (Claus timing), wink on demand,
// and the grooves morph between the six variants when a thought arrives.
import { svgEl, clamp, smooth, easeOut, rand, lerp } from "./util.js";

let uid = 0;
const VB = { x: -318, y: -255, w: 636, h: 482 };

// `scroll` is ctx.scroll: the frame reads its cached y instead of window.scrollY, which would
// force a layout in the middle of the shared loop.
export function createBrainDot(parent, jelly, ink, { grooves = true, cls = "", fixed = false, scroll = null } = {}) {
  const id = `hcb${++uid}`;
  const B = jelly.brain;
  const svg = svgEl("svg", { viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, class: `hc-brain ${cls}`, "aria-hidden": "true", focusable: "false" }, parent);
  const defs = svgEl("defs", {}, svg);
  svgEl("path", { d: B.d, class: "hc-brain__mass" }, svg);

  // grooves: one path per groove, morphable point by point
  const gPaths = grooves ? B.grooves[0].map(() => svgEl("path", { class: "hc-brain__groove" }, svg)) : [];
  let variant = Math.floor(Math.random() * B.grooves.length);
  let from = variant, to = variant, morphT = 1;
  const drawGrooves = (k) => {
    const A = B.grooves[from], Z = B.grooves[to];
    for (let g = 0; g < gPaths.length; g++) {
      const a = A[g], z = Z[g];
      const pts = a.pts.map((p, i) => ink.P(lerp(p[0], z.pts[i][0], k), lerp(p[1], z.pts[i][1], k)));
      const w = lerp(a.w, z.w, k);
      gPaths[g].setAttribute("d", ink.brush(ink.spline(pts, false, 3), (t) => w * (0.42 + 0.58 * Math.sin(Math.PI * t))));
    }
  };
  if (grooves) drawGrooves(1);

  // eyes with eyelid clip paths
  const eyes = B.eyes.map((e, i) => {
    const clip = svgEl("clipPath", { id: `${id}l${i}` }, defs);
    const lid = svgEl("ellipse", { cx: e.x, cy: e.y, rx: e.rx + 3, ry: e.ry + 3, transform: `rotate(${e.rot} ${e.x} ${e.y})` }, clip);
    const g = svgEl("g", { "clip-path": `url(#${id}l${i})` }, svg);
    svgEl("ellipse", { cx: e.x, cy: e.y, rx: e.rx, ry: e.ry, transform: `rotate(${e.rot} ${e.x} ${e.y})`, class: "hc-brain__eye" }, g);
    const r = Math.min(e.rx, e.ry), pr = r * B.pupil;
    const pupil = svgEl("circle", { cx: e.x, cy: e.y, r: pr.toFixed(1), class: "hc-brain__pupil" }, g);
    return { e, lid, pupil, mx: (r - pr) * 0.94, ox: 0, oy: 0.4 * (r - pr), close: 0, lastLid: -1, lastP: "" };
  });

  // blink state machine: each eye can run its own (a wink is eye 0 alone)
  const blinks = [];
  let nextBlink = performance.now() / 1000 + rand(1.2, 3);
  let held = false;          // eyes kept closed (brain being replaced)
  let heldK = 0;
  const lidCurve = (s) => {  // s seconds since the blink began -> closure 0..1
    if (s < 0.092) return smooth(s / 0.092);
    if (s < 0.118) return 1;
    if (s < 0.303) return 1 - easeOut((s - 0.118) / 0.185);
    return 0;
  };
  function blink(t, which = [0, 1], delay = 0) { blinks.push({ t0: t + delay, which }); }

  let rect = null;          // cached screen rect of the svg, plus the scroll it was read at
  let rectScroll = 0;
  // `sy` is the scroll offset the rect is read at (the owner passes ctx.scroll.y); the frame then
  // shifts the cached rect by how far the page has scrolled since, without reading layout again
  function measure(sy = 0) { rect = svg.getBoundingClientRect(); rectScroll = fixed ? 0 : sy; }

  const api = {
    svg,
    measure,
    get rect() { return rect; },
    rewire() {
      if (!grooves) return;
      from = to; let v = to;
      while (v === to) v = Math.floor(Math.random() * B.grooves.length);
      to = v; morphT = 0;
    },
    blink(t, double = false) { blink(t); if (double) blink(t, [0, 1], 0.24); },
    wink(t) { blink(t, [0], 0); blinks.push({ t0: t, which: [0], slow: true }); },
    hold(on) { held = on; },
    get closed() { return heldK > 0.5; },
    // gaze: a screen point {x, y} or null for resting; jitter adds micro-saccades
    update(t, dt, gaze, { reduced = false } = {}) {
      // grooves morph
      if (morphT < 1) {
        morphT = Math.min(1, morphT + dt / 0.9);
        drawGrooves(smooth(morphT));
      }
      // blinks
      if (!reduced && t > nextBlink) {
        blink(t);
        if (Math.random() < 0.14) blink(t, [0, 1], 0.24);
        nextBlink = t + rand(2.5, 4.2);
      }
      heldK += ((held ? 1 : 0) - heldK) * (1 - Math.exp(-dt / (held ? 0.07 : 0.16)));
      const scrolled = fixed ? 0 : (scroll ? scroll.y : rectScroll) - rectScroll;
      for (let i = 0; i < eyes.length; i++) {
        const E = eyes[i];
        let c = heldK;
        for (let b = blinks.length - 1; b >= 0; b--) {
          const bl = blinks[b];
          if (!bl.which.includes(i)) continue;
          const s = t - bl.t0;
          if (s < 0) continue;
          const span = bl.slow ? 0.62 : 0.303;
          if (s > span) { if (i === eyes.length - 1 || bl.which.length === 1) bl.done = true; continue; }
          c = Math.max(c, bl.slow ? (s < 0.12 ? smooth(s / 0.12) : s < 0.36 ? 1 : 1 - easeOut((s - 0.36) / 0.26)) : lidCurve(s));
        }
        // pupils
        let tx = 0, ty = 0.42 * E.mx;
        if (gaze && rect && rect.width) {
          const sc = rect.width / VB.w;
          const top = rect.top - scrolled;
          const ex = rect.left + (E.e.x - VB.x) * sc, ey = top + (E.e.y - VB.y) * sc;
          const dx = gaze.x - ex, dy = gaze.y - ey, d = Math.hypot(dx, dy) || 1;
          const reach = Math.min(1, d / 125);
          tx = (dx / d) * E.mx * reach; ty = (dy / d) * E.mx * reach;
        }
        const k = reduced ? 1 : 1 - Math.exp(-(dt * 1000) / 55);
        E.ox += (tx - E.ox) * k; E.oy += (ty - E.oy) * k;
        const pk = `${(E.e.x + E.ox).toFixed(1)},${(E.e.y + E.oy).toFixed(1)}`;
        if (pk !== E.lastP) {
          E.pupil.setAttribute("cx", (E.e.x + E.ox).toFixed(1));
          E.pupil.setAttribute("cy", (E.e.y + E.oy).toFixed(1));
          E.lastP = pk;
        }
        const ck = Math.round(c * 200) / 200;
        if (ck !== E.lastLid) {
          E.lid.setAttribute("ry", Math.max(0.01, (E.e.ry + 3) * (1 - ck)).toFixed(2));
          E.lid.setAttribute("cy", (E.e.y + E.e.ry * 0.12 * ck).toFixed(2));
          E.lastLid = ck;
        }
      }
      for (let b = blinks.length - 1; b >= 0; b--) if (t - blinks[b].t0 > 0.7) blinks.splice(b, 1);
    },
  };
  return api;
}
export const BRAIN_VB = VB;
