// Hero buttons drawn in ink: the solid one is a breathing ink blob, the line ones are brush loops
// that overshoot their own start. Springs give them a jelly squash on hover and press.
import { svgEl, spring, capsuleLoop, closedPath } from "./util.js";

export function inkButtons(list, ctx, { onHover } = {}) {
  const { ink } = ctx;
  const reduced = !!ctx.reduced;
  const items = [...list].map((a, i) => {
    a.classList.add("hc-btn");
    const solid = a.classList.contains("btn--ink");
    const svg = svgEl("svg", { class: "hc-btn__shape", "aria-hidden": "true" });
    const path = svgEl("path", {}, svg);
    a.prepend(svg);
    const label = document.createElement("span");
    label.className = "hc-btn__label";
    while (svg.nextSibling) label.appendChild(svg.nextSibling);
    a.appendChild(label);
    const B = { a, svg, path, solid, seed: 5 + i * 17, W: 0, H: 0, sx: { x: 1, v: 0 }, sy: { x: 1, v: 0 }, hover: false, wob: 1, last: 0, lastTf: "", phase: i * 1.7 };
    a.addEventListener("pointerenter", () => {
      B.hover = true; B.sx.v += 2.2; B.sy.v -= 1.6;
      const r = a.getBoundingClientRect();
      onHover?.(r.left + r.width / 2, r.top + r.height / 2);
    });
    a.addEventListener("pointerleave", () => { B.hover = false; B.sy.v += 1.2; });
    a.addEventListener("pointerdown", () => { B.sx.v += 3.6; B.sy.v -= 5; });
    a.addEventListener("pointerup", () => { B.sy.v += 2.5; });
    return B;
  });

  function measure() {
    for (const B of items) {
      B.W = B.a.offsetWidth; B.H = B.a.offsetHeight;
      const pad = 10;
      B.svg.setAttribute("viewBox", `${-pad} ${-pad} ${B.W + pad * 2} ${B.H + pad * 2}`);
      B.svg.style.cssText = `left:${-pad}px;top:${-pad}px;width:${B.W + pad * 2}px;height:${B.H + pad * 2}px`;
      draw(B, 0);
    }
  }
  function draw(B, t) {
    if (!B.W) return;
    if (B.solid) {
      const pts = capsuleLoop(B.W, B.H, { seed: B.seed, wob: B.wob * 1.2, t: t + B.phase, overshoot: 0, n: 90, pad: 0 });
      B.path.setAttribute("d", closedPath(pts));
    } else {
      const pts = capsuleLoop(B.W, B.H, { seed: B.seed, wob: B.wob, t: t + B.phase, overshoot: 0.09, n: 100, pad: -1 });
      B.path.setAttribute("d", ink.brush(pts, (u) => {
        const k = 1.4 + 1.6 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.04)), 0.5) * (0.7 + 0.3 * Math.cos(u * 7 + B.seed));
        return u > 0.88 ? k * (1 - ((u - 0.88) / 0.12) * 0.75) : k;
      }));
    }
  }

  function frame(t, dt) {
    if (reduced) return;
    for (const B of items) {
      spring(B.sx, B.hover ? 1.06 : 1, dt, 220, 8);
      spring(B.sy, B.hover ? 1.06 : 1, dt, 160, 6.5);
      const tf = `scale(${B.sx.x.toFixed(4)},${B.sy.x.toFixed(4)})`;
      if (tf !== B.lastTf) { B.a.style.transform = tf; B.lastTf = tf; }
      B.wob += ((B.hover ? 2.4 : 1) - B.wob) * (1 - Math.exp(-dt / 0.25));
      if (t - B.last > (B.hover ? 1 / 45 : 1 / 12)) { draw(B, t); B.last = t; }
    }
  }
  return { measure, frame, items };
}
