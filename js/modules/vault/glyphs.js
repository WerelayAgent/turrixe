// Tiny ink glyphs for the vault numbers. Each one lives in a little glass bubble (violet inside, ink rim,
// cream glint), is redrawn about 10 times a second like hand animation, and gets excited when its number moves.
const NS = "http://www.w3.org/2000/svg";
const TAU = Math.PI * 2;
const D = (svg) => svg.match(/d="([^"]+)"/)[1];
const r1 = (v) => Math.round(v * 10) / 10;

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent?.appendChild(e);
  return e;
}

// smooth closed outline through n wobbly radii (midpoint quadratics), as path data
function blobD(cx, cy, rx, ry, n, wob, t, seed) {
  const xs = [], ys = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + wob * (Math.sin(a * 2 + t * 1.3 + seed) * 0.6 + Math.sin(a * 3 - t * 0.9 + seed * 2) * 0.4);
    xs.push(cx + Math.cos(a) * rx * k); ys.push(cy + Math.sin(a) * ry * k);
  }
  let d = `M${r1((xs[n - 1] + xs[0]) / 2)} ${r1((ys[n - 1] + ys[0]) / 2)}`;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    d += `Q${r1(xs[i])} ${r1(ys[i])} ${r1((xs[i] + xs[j]) / 2)} ${r1((ys[i] + ys[j]) / 2)}`;
  }
  return d + "Z";
}
// an ink bubble ring: heavy at the bottom right, thin at the top left
const ringD = (cx, cy, r, t, seed, wob = 0.04) => {
  const th = Math.max(2, r * 0.24), off = th * 0.45;
  return blobD(cx, cy, r, r, 12, wob, t, seed) + blobD(cx - off, cy - off, r - th, r - th, 12, wob, t, seed);
};
const crescentD = (cx, cy, R, T, a0, a1) => {
  let d = "";
  for (let i = 0; i <= 8; i++) { const a = a0 + ((a1 - a0) * i) / 8; d += `${i ? "L" : "M"}${r1(cx + Math.cos(a) * R)} ${r1(cy + Math.sin(a) * R)}`; }
  for (let i = 8; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / 8, w = T * Math.sin((Math.PI * i) / 8); d += `L${r1(cx + Math.cos(a) * (R - w))} ${r1(cy + Math.sin(a) * (R - w))}`; }
  return d + "Z";
};

const DRAW = {
  // a fee: a bubble with two small ones climbing off it
  fees(ink, t, k, P) {
    const sq = 1 + 0.16 * k * Math.sin(t * 18);
    const out = [{ c: "ink", d: ringD(-2, 8, 17 * sq, t, 1, 0.05 + 0.08 * k), rule: "evenodd" }, { c: "cream", d: crescentD(-6, 4, 11, 3.6, 3.5, 4.4) }];
    for (const [i, x, r, sp] of [[0, 15, 6.5, 0.32], [1, -14, 4, 0.45]]) {
      const ph = (t * sp * (1 + k) + i * 0.5) % 1;
      const y = -6 - ph * 34, rr = r * (1 - ph * 0.35);
      if (rr > 1.5) out.push({ c: "ink", d: ringD(x + Math.sin(t * 3 + i) * 2, y, rr, t, 3 + i, 0.06), rule: "evenodd", o: 1 - ph * ph });
    }
    return out;
  },
  // a burn: a three-tongued ink flame with a cream core
  burned(ink, t, k, P) {
    const f = (a, b) => Math.sin(t * a + b);
    const h = 1 + 0.35 * k;
    const out = [
      { c: "ink", d: D(ink.tentacle([P(0, 32), P(-6 + f(7, 0) * 2, 12), P(4 + f(9, 1) * 3, -8 * h), P(-3 + f(11, 2) * 3, -30 * h)], { w0: 20, w1: 2.5 })) },
      { c: "ink", d: D(ink.tentacle([P(-6, 30), P(-16, 16), P(-18 + f(8, 3) * 2, 2 * h), P(-12 + f(10, 4) * 2, -10 * h)], { w0: 12, w1: 2 })) },
      { c: "ink", d: D(ink.tentacle([P(6, 30), P(16, 18), P(19 + f(9, 5) * 2, 4), P(13 + f(12, 6) * 2, -12 * h)], { w0: 12, w1: 2 })) },
      { c: "cream", d: D(ink.swell([P(0, 26), P(-2 + f(10, 7), 16), P(1, 6 - 4 * k)], { w: 6, wEnds: 1.5 })) },
    ];
    return out;
  },
  // holders: a tentacle curled around a cream bead
  holders(ink, t, k, P) {
    const sq = 1 - 0.12 * k;
    const b = Math.sin(t * 1.4) * 1.5;
    return [
      { c: "cream", d: blobD(7, -1 + b * 0.4, 7.5, 7, 9, 0.05, t, 2) },
      { c: "ink", d: D(ink.tentacle([P(-30, 36), P(-28, 12), P(-14 * sq, -14 + b), P(10, -22 + b), P(24 * sq, -6 + b)], { w0: 14, w1: 5, curl: { r0: 11 * sq, r1: 4, turns: 0.95, dir: 1 } })) },
    ];
  },
  // paid out: a tentacle letting a cream drop go
  paid(ink, t, k, P) {
    const per = 2.6 / (1 + k), ph = (t % per) / per;
    const sway = Math.sin(t * 1.2) * 2;
    const out = [{ c: "ink", d: D(ink.tentacle([P(-34, -16), P(-18, -22 + sway), P(2, -14 + sway), P(16, -4 + sway)], { w0: 13, w1: 4.5, curl: { r0: 5, r1: 2, turns: 0.6, dir: 1 } })) }];
    const grow = Math.min(1, ph / 0.45), fall = Math.max(0, (ph - 0.45) / 0.55);
    const y = 4 + sway + fall * fall * 34, r = 2 + 4 * grow;
    out.push({ c: "cream", d: blobD(16, y, r * (1 - fall * 0.2), r * (1 + fall * 0.35), 8, 0.04, t, 4), o: 1 - fall * fall });
    return out;
  },
  // brains: a small brain with two eyes that keep an eye on you
  versions(ink, t, k, P, ctx) {
    const J = ctx.assets.jelly;
    return [{ brain: true, J, k }];
  },
};

export function createGlyph(host, kind, ctx) {
  const ink = ctx.ink, P = ink.P;
  const svg = el("svg", { class: `vlt-glyph vlt-glyph--${kind}`, viewBox: "-50 -50 100 100", "aria-hidden": "true" });
  host.appendChild(svg);
  const glass = el("path", { class: "vlt-glyph__glass" }, svg);
  const g = el("g", { transform: kind === "versions" ? "scale(1.06)" : "scale(1.12)" }, svg);
  const rim = el("path", { class: "vlt-glyph__ink", "fill-rule": "evenodd" }, svg);
  const glint = el("path", { class: "vlt-glyph__cream" }, svg);
  svg.appendChild(g);   // the drawing sits on top of its glass and may spill over the rim
  let parts = [];
  const seed = kind.length * 1.7;

  // the brain glyph is built once from jelly.json and only its eyes and lean move
  let brain = null;
  if (kind === "versions" && ctx.assets?.jelly?.brain) {
    const J = ctx.assets.jelly;
    const bg = el("g", { transform: "translate(0 3) scale(0.118)" }, g);
    const lean = el("g", {}, bg);
    el("path", { class: "vlt-glyph__ink", d: J.brain.d }, lean);
    const grooves = el("g", {}, lean);
    const eyes = J.brain.eyes.map((e) => {
      const eg = el("g", { transform: `rotate(${e.rot} ${e.x} ${e.y})` }, lean);
      const lid = el("ellipse", { class: "vlt-glyph__cream", cx: e.x, cy: e.y, rx: e.rx, ry: e.ry }, eg);
      const pupil = el("circle", { class: "vlt-glyph__ink", cx: e.x, cy: e.y, r: Math.min(e.rx, e.ry) * 0.5 }, eg);
      return { e, lid, pupil, ox: 0, oy: 0 };
    });
    brain = { J, lean, grooves, eyes, variant: 0 };
    setGrooves(0);
  }
  function setGrooves(v) {
    const J = brain.J, list = J.brain.grooves[v % J.brain.grooves.length];
    brain.grooves.textContent = "";
    for (const gr of list) {
      const pts = gr.pts.filter((_, i) => i % 3 === 0).map(([x, y]) => P(x, y));
      if (pts.length < 2) continue;
      el("path", { class: "vlt-glyph__glassfill", d: D(ink.swell(pts, { w: gr.w * 0.9, wEnds: gr.w * 0.3 })) }, brain.grooves);
    }
  }

  let k = 0, last = -1, blinkAt = performance.now() + 2000 + Math.random() * 3000;
  function draw(t) {
    glass.setAttribute("d", blobD(0, 2, 37, 35, 14, 0.05, t * 0.7, seed));
    rim.setAttribute("d", blobD(0, 2, 40, 38, 14, 0.05, t * 0.7, seed) + blobD(-1.4, 0.4, 35.5, 33.5, 14, 0.05, t * 0.7, seed));
    glint.setAttribute("d", crescentD(-1, 1, 30, 5, 3.4, 4.3));
    if (brain) return;
    const list = DRAW[kind](ink, t, k, P, ctx);
    while (parts.length < list.length) parts.push(el("path", {}, g));
    parts.forEach((p, i) => {
      const it = list[i];
      if (!it) { p.setAttribute("d", ""); return; }
      p.setAttribute("d", it.d);
      p.setAttribute("class", it.c === "cream" ? "vlt-glyph__cream" : "vlt-glyph__ink");
      if (it.rule) p.setAttribute("fill-rule", it.rule);
      p.setAttribute("opacity", it.o != null ? Math.max(0, it.o).toFixed(2) : "1");
    });
  }
  let eyesRead = false;
  function eyes(dt, pointer) {
    if (!brain) return;
    const now = performance.now();
    let open = 1;
    const bt = (now - blinkAt) / 1000;
    if (bt >= 0) {
      if (bt < 0.092) open = 1 - bt / 0.092;
      else if (bt < 0.118) open = 0;
      else if (bt < 0.303) open = (bt - 0.118) / 0.185;
      else blinkAt = now + 2500 + Math.random() * 2700;
    }
    for (const eye of brain.eyes) {
      const { e } = eye;
      const m = pointer.active ? (eyesRead ? eye.m : eye.pupil.parentNode.getScreenCTM?.()) : null;
      if (m && pointer.active) {
        const inv = m.inverse();
        const qx = inv.a * pointer.x + inv.c * pointer.y + inv.e, qy = inv.b * pointer.x + inv.d * pointer.y + inv.f;
        const dx = qx - e.x, dy = qy - e.y, d = Math.hypot(dx, dy) || 1, reach = Math.min(1, d / 125);
        const mx = (e.rx - Math.min(e.rx, e.ry) * 0.5) * 0.85, my = (e.ry - Math.min(e.rx, e.ry) * 0.5) * 0.85;
        const f = 1 - Math.exp(-dt / 0.055);
        eye.ox += ((dx / d) * reach * mx - eye.ox) * f;
        eye.oy += ((dy / d) * reach * my - eye.oy) * f;
      } else {
        eye.oy += (Math.min(e.rx, e.ry) * 0.22 - eye.oy) * 0.1;
      }
      eye.pupil.setAttribute("cx", r1(e.x + eye.ox));
      eye.pupil.setAttribute("cy", r1(e.y + eye.oy));
      eye.lid.setAttribute("ry", r1(Math.max(0.01, e.ry * open)));
      eye.pupil.setAttribute("opacity", open < 0.25 ? "0" : "1");
    }
  }

  draw(0);
  return {
    svg,
    kick(amount = 1) {
      k = Math.min(1.4, k + amount);
      if (brain) {
        brain.variant++;
        setGrooves(brain.variant);
        blinkAt = performance.now();
      }
    },
    // read phase: the eye matrices, taken before anything writes this frame (reading them in tick forced a layout)
    readEyes(pointer, reduced) {
      eyesRead = false;
      if (!brain || reduced || !pointer.active) return;
      for (const eye of brain.eyes) eye.m = eye.pupil.parentNode.getScreenCTM?.();
      eyesRead = true;
    },
    tick(t, dt, pointer, reduced) {
      k *= Math.exp(-dt / 0.9);
      if (reduced) return;
      if (brain) {
        eyes(dt, pointer);
        eyesRead = false;
        brain.lean.setAttribute("transform", `rotate(${r1(Math.sin(t * 0.8) * 3 + k * 6 * Math.sin(t * 14))})`);
      }
      if (t - last < 0.1) return;   // drawn on "twos", like hand animation
      last = t;
      draw(t);
    },
  };
}
