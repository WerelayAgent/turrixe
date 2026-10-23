// A letter for whoever opens the console: Turri painted live from the real geometry (current brain version stamped on),
// a few dry lines, the list of hidden things, and `brain` as a console word that makes the jelly somersault.
const TAU = Math.PI * 2;
const dOf = (s) => s.match(/d="([^"]+)"/)[1];

export function paintPortrait(ctx, version) {
  const J = ctx.assets.jelly, ink = ctx.ink, P = ink.P, pal = J.palette;
  const W = 560, H = 340;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  g.fillStyle = pal.field; g.fillRect(0, 0, W, H);

  const bell = new Path2D(J.bell.d), inner = new Path2D(J.bell.inner), glint = new Path2D(J.bell.glint), brain = new Path2D(J.brain.d);
  const streamer = (x, len, sway, w0, w1) => new Path2D(dOf(ink.tentacle(
    [P(x, 130), P(x + sway, 130 + len * 0.3), P(x - sway * 0.8, 130 + len * 0.62), P(x + sway * 0.5, 130 + len)], { w0, w1 })));

  // the brainless ones, drifting behind in the crowd's violet
  const crowd = [[70, 66, 0.12, -8], [236, 40, 0.065, 9], [536, 52, 0.07, -5], [530, 282, 0.085, 6], [176, 120, 0.05, -4]];
  g.fillStyle = pal.deep;
  for (const [x, y, s, r] of crowd) {
    g.save(); g.translate(x, y); g.rotate((r * Math.PI) / 180); g.scale(s, s);
    [-150, -50, 50, 150].forEach((sx, i) => g.fill(streamer(sx, 300, i % 2 ? 22 : -22, 22, 8)));
    g.fill(bell);
    g.restore();
  }

  // Turri, slightly tilted, on the right
  g.save();
  g.translate(392, 128); g.rotate((-5 * Math.PI) / 180); g.scale(0.36, 0.36);
  g.fillStyle = pal.ink;
  [-170, -85, 0, 85, 170].forEach((sx, i) => g.fill(streamer(sx, 520, (i % 2 ? 1 : -1) * (28 + i * 4), 34, 9)));
  g.fill(bell);
  g.fillStyle = pal.field; g.fill(inner);
  g.save();
  const BI = J.brainInBell;
  g.translate(BI.tx, BI.ty); g.scale(BI.s, BI.s); g.rotate((BI.rot * Math.PI) / 180);
  g.fillStyle = pal.ink; g.fill(brain);
  g.fillStyle = pal.field;
  const gv = J.brain.grooves[(version || 0) % J.brain.grooves.length];
  for (const gr of gv) g.fill(new Path2D(ink.brush(gr.pts.map(([x, y]) => P(x, y)), (t) => 5 + (gr.w - 5) * Math.sin(Math.PI * t))));
  for (const e of J.brain.eyes) {
    g.save(); g.translate(e.x, e.y); g.rotate((e.rot * Math.PI) / 180);
    g.fillStyle = pal.cream; g.beginPath(); g.ellipse(0, 0, e.rx, e.ry, 0, 0, TAU); g.fill();
    g.fillStyle = pal.ink; g.beginPath(); g.arc(-e.rx * 0.32, e.ry * 0.3, Math.min(e.rx, e.ry) * J.brain.pupil, 0, TAU); g.fill();
    g.restore();
  }
  g.restore();
  g.fillStyle = pal.cream; g.fill(glint);
  g.restore();

  // the name in Fraunces, the version in mono
  g.fillStyle = pal.ink;
  g.font = "600 92px Fraunces, Georgia, serif";
  g.fillText(ctx.config.name, 30, 236);
  g.font = "500 19px 'JetBrains Mono', Menlo, monospace";
  g.fillText(version > 0 ? `brain v${version}` : "no brain yet", 36, 278);
  g.font = "italic 400 21px Fraunces, Georgia, serif";
  g.fillText("same coin, new brain", 36, 308);
  return cv;
}

export function greetDevs(ctx, { onBrain }) {
  const { config, state } = ctx;
  const mins = config.brainMinutes;
  const run = () => {
    try {
      const url = paintPortrait(ctx, state.version).toDataURL("image/png");
      const w = 280, h = 170;
      console.log("%c ", `font-size:1px;line-height:${h}px;padding:${h / 2}px ${w / 2}px;background:url(${url}) no-repeat;background-size:${w}px ${h}px;`);
    } catch { /* no canvas: the words are enough */ }
    const t = "font:italic 600 20px/1.5 Fraunces,Georgia,serif;color:#8b63f5";
    const p = "font:14px/1.6 Georgia,serif";
    const k = "font:12px/1.9 'JetBrains Mono',ui-monospace,Menlo,monospace;color:#8b63f5";
    const m = "font:italic 13px/1.9 Georgia,serif;opacity:.8";
    console.log(
      `%cYou found my insides.\n` +
      `%cMost people stop at the bell. I'm ${config.name}. Every ${mins} minutes I replace my brain and the coin stays the same.\n` +
      `This page is vanilla ES modules and a lot of ink. No libraries, no build step. I'm a little proud of that.\n\n` +
      `Hidden in the water:\n` +
      `%c  ↑ ↑ ↓ ↓ ← → ← → b a    %cevery jellyfish gets a brain for ten seconds\n` +
      `%c  brain                  %ctype it on the page, or right here\n` +
      `%c  leave this tab         %cI notice\n` +
      `%c  __turrixe.sim.swapNow()  %cif you can't wait for my next brain\n\n` +
      `%cGot a hook idea? Reply on X. If I ship it, you get paid in SOL. ${config.links?.x || ""}`,
      t, p, k, m, k, m, k, m, k, m, p,
    );
  };
  (document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(run, 300));

  // `brain` typed in the console does what typing it on the page does
  try {
    if (!("brain" in window)) {
      Object.defineProperty(window, "brain", {
        configurable: true,
        get() { onBrain?.("console"); return "Somersault done. That's the one trick this brain knows."; },
      });
    }
  } catch { /* fine without it */ }
}
