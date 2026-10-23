// Light shafts from the surface: flat cream beams, layered three deep so the light falls off in steps
// (screen-print style, no gradients, no blur). They sway with the surface, shimmer when the water is
// disturbed, slide up and fade as you dive, and stop drawing once the light is gone.
// Rendered at half resolution (the soft edge is free) and at most 30 times a second.

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function createShafts(mount, { reduced }) {
  const cv = document.createElement("canvas");
  cv.className = "depth__shafts";
  cv.setAttribute("aria-hidden", "true");
  mount.appendChild(cv);
  const ctx = cv.getContext("2d");
  const RES = 0.5;
  let W = 0, H = 0, shafts = [];
  let shimmer = 0, px = 0, drawn = true, acc = 1;

  // a beam: hand-wobbled long edges, widening downward, closing in a soft round end
  function beam(len, wTop, wBot, lean, rnd) {
    const n = 22, L = [], R = [];
    const ph = rnd() * 6.28, ph2 = rnd() * 6.28;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const y = f * len;
      const cx = lean * f * f;
      let w = wTop + (wBot - wTop) * Math.pow(f, 0.85);
      if (f > 0.55) w *= 1 - Math.pow((f - 0.55) / 0.45, 1.35); // the ray thins out to a streak
      const wl = w * (0.5 + 0.035 * Math.sin(f * 9 + ph)), wr = w * (0.5 + 0.035 * Math.sin(f * 11 + ph2));
      L.push([cx - wl, y]); R.push([cx + wr, y]);
    }
    const p = new Path2D();
    p.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < L.length; i++) p.lineTo(L[i][0], L[i][1]);
    const e = L.length - 1;
    p.lineTo(R[e][0], R[e][1]);
    for (let i = R.length - 1; i >= 0; i--) p.lineTo(R[i][0], R[i][1]);
    p.closePath();
    return p;
  }

  function build() {
    W = innerWidth; H = innerHeight;
    cv.width = Math.max(1, Math.round(W * RES)); cv.height = Math.max(1, Math.round(H * RES));
    const rnd = mulberry32(4012);
    const mobile = W < 720;
    const count = mobile ? 3 : 5;
    shafts = [];
    for (let i = 0; i < count; i++) {
      const wide = i % 2 === 0;
      const len = H * (1.3 + rnd() * 0.4);
      const wTop = (wide ? 22 : 8) + rnd() * 14;
      const wBot = (mobile ? 0.6 : 1) * ((wide ? 170 : 70) + rnd() * (wide ? 90 : 50));
      const lean = 40 + rnd() * 60;
      shafts.push({
        // a loose cluster of rays left of centre, the way light comes through when the sun is low
        x: W * (0.02 + 0.74 * ((i + 0.2 + rnd() * 0.6) / count)),
        ang: -0.12 - rnd() * 0.08, // bottoms lean right: the sun is up and to the left
        w1: 0.13 + rnd() * 0.07, w2: 0.29 + rnd() * 0.17, ph: rnd() * 6.28, ph2: rnd() * 6.28,
        layers: [
          { path: beam(len, wTop, wBot, lean, rnd), a: 0.032 },
          { path: beam(len * 0.66, wTop * 0.75, wBot * 0.5, lean * 0.66, rnd), a: 0.034 },
          { path: beam(len * 0.38, wTop * 0.5, wBot * 0.24, lean * 0.38, rnd), a: 0.04 },
        ],
      });
    }
    drawn = true;
    acc = 1;
  }
  build();

  return {
    resize: build,
    ripple(s = 0.5) { shimmer = Math.min(1.4, shimmer + s); },
    // fade: 1 at the surface, 0 once the light is gone; lift: px the light has risen; cream: [r,g,b]
    frame(t, dt, fade, lift, pointerNx, cream) {
      shimmer *= Math.exp(-dt * 1.4);
      px += ((reduced ? 0 : -pointerNx * 16) - px) * (1 - Math.exp(-dt / 0.6));
      if (fade < 0.004) {
        if (drawn) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); drawn = false; cv.style.visibility = "hidden"; }
        return;
      }
      if (!drawn) cv.style.visibility = "";
      acc += dt;
      if (drawn && acc < 1 / 31) return; // slow light: 30 fps is plenty
      acc = 0;
      drawn = true;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      const [r, g, b] = cream;
      for (let i = 0; i < shafts.length; i++) {
        const s = shafts[i];
        const sway = reduced ? 0 : Math.sin(t * s.w1 + s.ph) * 0.02 + Math.sin(t * s.w2 + s.ph2) * 0.007
          + shimmer * Math.sin(t * 7.3 + i * 1.9) * 0.012;
        const flick = reduced ? 1 : 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * (s.w2 * 1.7) + s.ph * 2)) + shimmer * 0.3 * (0.5 + 0.5 * Math.sin(t * 11 + i));
        const breathe = reduced ? 1 : 1 + 0.06 * Math.sin(t * s.w1 * 1.3 + s.ph2);
        ctx.setTransform(RES, 0, 0, RES, 0, 0);
        ctx.translate(s.x + px, -30 - lift);
        ctx.rotate(s.ang + sway);
        ctx.scale(breathe, 1);
        for (const L of s.layers) {
          ctx.fillStyle = `rgba(${r},${g},${b},${(L.a * fade * flick).toFixed(4)})`;
          ctx.fill(L.path);
        }
      }
    },
  };
}
