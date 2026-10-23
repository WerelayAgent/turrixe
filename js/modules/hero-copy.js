// hero-copy: the living name (and its little twin in the topbar), the lead written with a thinking
// cadence, the CA pill with its ink splat, and buttons made of ink. See SPEC.md, brief 8.
import { createLivingName } from "./hero-copy/name.js";
import { createLead } from "./hero-copy/lead.js";
import { createCA } from "./hero-copy/ca.js";
import { inkButtons } from "./hero-copy/buttons.js";
import { rand } from "./hero-copy/util.js";

export function init(ctx) {
  const { bus, loop, params, scroll } = ctx;
  const reduced = !!ctx.reduced;
  const root = document.getElementById("hero-copy");
  if (!root) return;
  root.setAttribute("data-reveal-skip", "");   // hero text runs its own entrance
  root.classList.add("hc-root");

  // The right edge the big name (brain included) may reach: its own column when the jelly hangs
  // above it; beside the jelly, the gap and a sliver of the jelly's empty margin. Never the gutter.
  const jellyEl = document.getElementById("hero-jelly");
  const fitLimit = () => {
    const col = root.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const gutter = parseFloat(getComputedStyle(root.parentElement).paddingRight) || 16;
    let limit = col.right;
    const jr = jellyEl?.getBoundingClientRect();
    if (jr && jr.width && jr.left >= col.right - 1) limit = jr.left + jr.width * 0.1;
    return Math.min(limit, vw - gutter);
  };

  const h1 = root.querySelector(".hero-copy__name");
  const name = h1 ? createLivingName(h1, ctx, { drips: true, entrance: !reduced, fit: fitLimit }) : null;
  const lead = createLead(root.querySelector(".hero-copy__lead"), root.querySelector(".hero-copy__sub"), ctx);

  const look = (x, y, ms = 1000) => {
    name?.look(x, y, ms);
    top?.look(x, y, ms);
    bus.emit("jelly:look", { x, y });
  };
  const onCopy = (x, y, real) => {
    look(x, y, 1400);
    setTimeout(() => (real ? name?.wink() : name?.blink(true)), 380);
    setTimeout(() => (real ? top?.wink() : top?.blink()), 520);
  };
  const pillMount = document.getElementById("ca-pill");
  const footMount = document.getElementById("ca-foot");
  const pill = pillMount ? createCA(pillMount, ctx, { onCopy, onHover: (x, y) => look(x, y) }) : null;
  const foot = footMount ? createCA(footMount, ctx, { onCopy: (x, y, real) => { top?.look(x, y, 1200); setTimeout(() => (real ? top?.wink() : top?.blink()), 400); } }) : null;
  const btns = inkButtons(root.querySelectorAll(".hero-copy__links .btn"), ctx, { onHover: (x, y) => look(x, y) });

  // The small name in the topbar, beside hero-jelly's mini jelly (which it prepends into the same
  // link): same creature, smaller voice. It is always there once the page has entered; when the big
  // name dives under the bar the small one catches it, with a ripple through its letters and a hop.
  const tbName = document.querySelector(".topbar__name");
  const top = tbName ? createLivingName(tbName, ctx, {
    period: 6.8, lag: 0.1, w0: 620, wA: 110, wHover: 180, lift: 0.02, stretch: 0.03,
    every: 3, step: { wght: 10, SOFT: 20, opsz: 8 },
    drips: false, poke: true, brainGrooves: false, entrance: true, fixed: true,
  }) : null;

  // ---------- visibility ----------
  let heroOn = true, footOn = false, h1Out = false;
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => {
      for (const e of es) {
        heroOn = e.isIntersecting;
        if (name) name.visible = heroOn;
      }
    }, { rootMargin: "120px 0px" }).observe(root);
    if (h1 && top) {
      // the bar (plus its waterline) is the line the big name dives under
      const bar = document.querySelector(".topbar");
      const barH = Math.round((bar?.offsetHeight || 60) + 8);
      new IntersectionObserver((es) => {
        for (const e of es) {
          const out = !e.isIntersecting;
          if (out === h1Out) continue;
          h1Out = out;
          if (entered && top.shown && !reduced) { top.pulse(out ? 0.9 : 0.45); top.hop(out ? 1 : 0.45); }
        }
      }, { threshold: 0, rootMargin: `-${barH}px 0px 0px 0px` }).observe(h1);
    }
    if (footMount) new IntersectionObserver((es) => { for (const e of es) footOn = e.isIntersecting; }).observe(footMount);
  }

  // ---------- measuring ----------
  // Font- and size-dependent geometry (the name's fit, its feet, every box) is redone on resize and
  // whenever a font finishes loading: Fraunces often lands seconds after the first paint, and the
  // fallback has different widths. Those run outside the frame loop.
  const layoutAll = () => {
    const sy = scroll.y || scrollY;
    name?.layout(sy); top?.layout(0);
    lead.measure(); pill?.measure(); foot?.measure(); btns.measure();
  };
  layoutAll();
  document.fonts?.ready.then(layoutAll);
  document.fonts?.addEventListener?.("loadingdone", layoutAll);
  let rz = 0;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(layoutAll, 120); });
  // Positions drift a little as the axes breathe and other modules settle: refresh the boxes now and
  // then, in the read phase (before anything is written this frame), and only for a name on screen.
  let nextMeasure = 0;
  loop.read((t) => {
    if (t < nextMeasure) return;
    nextMeasure = t + 1.5;
    if (heroOn) name?.measure(scroll.y);
    top?.measure(0);
  });

  // ---------- entrance ----------
  let entered = false;
  function enter() {
    if (entered) return;
    entered = true;
    if (name) {
      name.shown = true;
      // the brain lands on the i after the letters have dropped in, then opens its eyes
      if (!reduced) {
        setTimeout(() => name.swapMid(), 700);
        setTimeout(() => name.swapDone(), 1500);
      }
    }
    if (top) {
      top.shown = true;
      if (!reduced) { setTimeout(() => top.swapMid(), 500); setTimeout(() => top.swapDone(), 1100); }
    }
    lead.start();
    layoutAll();
  }
  if (reduced) { enter(); }
  else if (params.has("skipLoader")) bus.once("ready", () => setTimeout(enter, 60));
  bus.once("loader:done", enter);
  setTimeout(enter, 5200);                       // the loader never blocks longer than this
  // keep the brains off their i's until the entrance drops them in
  if (!reduced) for (const n of [name, top]) n?.letters.forEach((L) => { if (L.dot) { L.dot.state = "gone"; L.dot.brain.hold(true); } });

  // ---------- story events ----------
  bus.on("thought", () => {
    name?.rewire();
    // a quick saccade, as if the thought came from somewhere off to the side
    const a = rand(-Math.PI * 0.9, -Math.PI * 0.1);
    const x = innerWidth * 0.3 + Math.cos(a) * 400, y = innerHeight * 0.3 + Math.sin(a) * 300;
    name?.look(x, y, 520);
    top?.look(x, y, 520);
  });
  bus.on("jelly:look", ({ x, y } = {}) => { if (x != null) { name?.look(x, y, 900); top?.look(x, y, 900); } });
  bus.on("brain:swap:start", () => { name?.swapStart(); top?.swapStart(); });
  bus.on("brain:swap:mid", () => { name?.swapMid(); top?.swapMid(); });
  bus.on("brain:swap:done", () => { name?.swapDone(); top?.swapDone(); });
  bus.on("hook:add", () => name?.pulse(0.9));
  bus.on("hook:remove", () => name?.pulse(0.6));
  bus.on("egg", (e) => {
    if (e?.type !== "flip" || !name || reduced) return;
    name.letters.forEach((L, i) => setTimeout(() => { L.rot.v += (i % 2 ? -1 : 1) * 260; L.sq.v -= 3; }, i * 60));
  });

  // ---------- one frame for everything ----------
  loop.add((t, dt) => {
    if (heroOn) {
      name?.frame(t, dt);
      lead.frame(t, dt);
      btns.frame(t, dt);
      pill?.frame(t, dt);
    }
    if (footOn) foot?.frame(t, dt);
    // the topbar name is always on screen once it has entered; before that it idles
    if (top && (top.shown || top.busy)) top.frame(t, dt);
  });

  if (params.has("debug")) window.__heroCopy = { name, top, lead, pill, foot, btns, enter, layout: layoutAll };
}
