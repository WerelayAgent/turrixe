// The visible side of the eggs: while you type a secret, it gets inked at the bottom of the water one glyph at a time
// (hand-drawn arrows, Fraunces letters) and every eye on the page glances at it. A wrong key and the glyphs sink.
// When a secret lands, the glyphs turn into tiny brains and float off, or do a somersault, and Turri whispers a line
// beside a tiny watching jelly, with an ink tentacle under it that shortens as an egg runs out.
const ROT = { up: 0, right: 90, down: 180, left: -90 };
const rnd = (a, b) => a + Math.random() * (b - a);
const dOf = (s) => s.match(/d="([^"]+)"/)[1];

export function createStage(ctx) {
  const { ink, reduced, assets, bus } = ctx;
  const P = ink.P;
  const B = assets.jelly.brain;

  const root = document.createElement("div");
  root.className = "egg";
  root.id = "eggs";
  root.innerHTML =
    `<svg class="egg__defs" width="0" height="0" aria-hidden="true"><defs></defs></svg>` +
    `<div class="egg__row" aria-hidden="true"><svg class="egg__blot egg__blot--row"><path/></svg></div>` +
    `<div class="egg__say" role="status" aria-live="polite"><span class="egg__who" aria-hidden="true"></span><span class="egg__line"><svg class="egg__blot" aria-hidden="true"><path/></svg><span class="egg__text"></span><svg class="egg__tide" aria-hidden="true" width="0" height="0"><path/></svg></span></div>`;
  document.body.append(root);
  const row = root.querySelector(".egg__row");
  const say = root.querySelector(".egg__say");
  const who = root.querySelector(".egg__who");
  const text = root.querySelector(".egg__text");
  const tide = root.querySelector(".egg__tide");
  const tidePath = tide.querySelector("path");
  const line = root.querySelector(".egg__line");
  const blot = say.querySelector(".egg__blot");

  const rowBlot = row.querySelector(".egg__blot");

  // A hand-cut ink blot sized to a box: an irregular round-ended slab with a drip or two hanging off the bottom,
  // and optionally a soft tail on the left toward the little jelly that is talking.
  function cutBlot(svg, w, h, { px = 18, py = 12, tail = false } = {}) {
    if (!w || !h) return;
    const W = w + px * 2, H = h + py * 2;
    const cx = W / 2, cy = H / 2, a = W / 2, b = H / 2;
    const n = Math.max(14, Math.round(W / 24)), pts = [];
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2, c = Math.cos(th), si = Math.sin(th);
      const x = cx + Math.sign(c) * Math.pow(Math.abs(c), 0.4) * a * rnd(0.95, 1.04);
      const y = cy + Math.sign(si) * Math.pow(Math.abs(si), 0.7) * b * rnd(0.86, 1.1);
      pts.push(P(x, y));
    }
    // drips: one or two bottom points pulled down, as if the blot is still wet
    const bottom = pts.map((p, i) => i).filter((i) => { const th = (i / n) * Math.PI * 2; return th > 0.22 * Math.PI && th < 0.78 * Math.PI; });
    const d1 = bottom[Math.floor(rnd(0, bottom.length))];
    if (d1 != null) pts[d1] = P(pts[d1].x, pts[d1].y + rnd(7, 12));
    if (W > 220 && bottom.length > 3) { const d2 = bottom[(bottom.indexOf(d1) + 2 + Math.floor(rnd(0, bottom.length - 3))) % bottom.length]; pts[d2] = P(pts[d2].x, pts[d2].y + rnd(4, 8)); }
    if (tail) pts.splice(Math.round(n / 2), 1, P(-10, cy + H * 0.14));
    svg.setAttribute("viewBox", `0 0 ${W.toFixed(0)} ${(H + 12).toFixed(0)}`);
    svg.style.width = `${W.toFixed(0)}px`;
    svg.style.height = `${(H + 12).toFixed(0)}px`;
    svg.style.left = `${-px}px`;
    svg.style.top = `${-py}px`;
    svg.querySelector("path").setAttribute("d", dOf(ink.blob(pts)));
  }
  const cutSay = () => cutBlot(blot, line.offsetWidth, line.offsetHeight, { tail: true });
  // the row's blot spreads to the right as the secret gets longer
  const cutRow = () => {
    const gs = row.querySelectorAll(".egg__g:not(.is-sink)");
    if (!gs.length) return;
    const r0 = row.getBoundingClientRect(), a = gs[0].getBoundingClientRect(), z = gs[gs.length - 1].getBoundingClientRect();
    const left = a.left - r0.left, w = z.right - a.left;
    cutBlot(rowBlot, w, r0.height, { px: 20, py: 10 });
    rowBlot.style.left = `${left - 20}px`;
  };

  // one shared brain (outline + a groove variant in violet) for the little brains the konami glyphs become
  const groove = (B.grooves[1] || B.grooves[0]).map((gv) => {
    const pts = gv.pts.map(([x, y]) => P(x, y));
    const w = gv.w * 1.15;
    return ink.brush(pts, (t) => w * 0.3 + w * 0.7 * Math.sin(Math.PI * t));
  }).join(" ");
  root.querySelector(".egg__defs defs").innerHTML =
    `<g id="egg-brain"><path class="egg__ink" d="${B.d}"/><path class="egg__violet" d="${groove}"/></g>`;

  let glyphs = [];        // live glyph elements, in order
  let markReady = null;

  function arrowSVG(dir) {
    const j = () => rnd(-2.4, 2.4);
    const shaft = dOf(ink.swell([P(50 + j(), 90), P(48 + j(), 66), P(52 + j(), 42), P(50, 18)], { w: 16, wEnds: 6.5 }));
    const l = dOf(ink.tentacle([P(50, 13), P(39 + j(), 26), P(26 + j(), 39 + j())], { w0: 16, w1: 6.5 }));
    const r = dOf(ink.tentacle([P(50, 13), P(61 + j(), 26), P(74 + j(), 39 + j())], { w0: 16, w1: 6.5 }));
    return `<svg class="egg__arrow" viewBox="0 0 100 100" style="transform:rotate(${ROT[dir] + rnd(-7, 7)}deg)"><path d="${shaft} ${l} ${r}"/></svg>`;
  }

  function brainSVG() {
    const eyes = B.eyes.map((e) => {
      const r = Math.min(e.rx, e.ry);
      return `<ellipse class="egg__cream" cx="${e.x}" cy="${e.y}" rx="${e.rx * 1.3}" ry="${e.ry * 1.3}" transform="rotate(${e.rot} ${e.x} ${e.y})"/>` +
        `<circle class="egg__ink" cx="${(e.x + rnd(-14, 14)).toFixed(0)}" cy="${(e.y + rnd(4, 22)).toFixed(0)}" r="${(r * 0.62).toFixed(0)}"/>`;
    }).join("");
    return `<svg class="egg__brain" viewBox="-320 -250 640 480"><use href="#egg-brain"/>${eyes}</svg>`;
  }

  function makeGlyph(token, i, delay) {
    const g = document.createElement("span");
    const isArrow = token in ROT;
    g.className = `egg__g ${isArrow ? "egg__g--arrow" : "egg__g--ch"}`;
    g.style.setProperty("--i", i);
    g.style.setProperty("--d", `${delay}ms`);
    g.style.setProperty("--r0", `${rnd(-14, 14).toFixed(1)}deg`);
    g.innerHTML = `<span class="egg__gi">${isArrow ? arrowSVG(token) : `<span class="egg__ch">${token}</span>`}</span>`;
    return g;
  }

  // Show the secret typed so far. `tokens` is the whole matched prefix.
  function show(tokens, kind) {
    root.classList.add("is-on");
    // a different secret, or a shorter prefix than what we drew: the old glyphs sink first
    if (glyphs.length && (row.dataset.kind !== kind || glyphs.length > tokens.length || glyphs.some((g, i) => g.dataset.t !== tokens[i]))) sink();
    row.dataset.kind = kind;
    const fresh = [];
    for (let i = glyphs.length; i < tokens.length; i++) {
      const delay = (i - glyphs.length) * 75;
      const g = makeGlyph(tokens[i], i, delay);
      g.dataset.t = tokens[i];
      row.append(g);
      glyphs.push(g);
      fresh.push(g);
    }
    row.classList.add("is-inked");
    cutRow();
    // every eye on the page glances at the newest glyph
    const last = fresh[fresh.length - 1];
    if (last) requestAnimationFrame(() => {
      const r = last.getBoundingClientRect();
      bus.emit("jelly:look", { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    });
  }

  function retire(list, cls, life) {
    list.forEach((g, i) => {
      g.style.setProperty("--sd", `${i * 55}ms`);
      g.style.setProperty("--r1", `${rnd(-24, 24).toFixed(1)}deg`);
      g.style.setProperty("--dx", `${rnd(-60, 60).toFixed(0)}px`);
      g.classList.add(cls);
      setTimeout(() => g.remove(), life + i * 55);
    });
  }

  // a wrong key: what was written sinks away into the dark
  function sink() {
    if (!glyphs.length) return;
    retire(glyphs, "is-sink", 1000);
    glyphs = [];
    row.classList.remove("is-inked");
  }

  // the konami lands: each glyph pops into a tiny brain with eyes and floats up into the water
  function burst() {
    const list = glyphs; glyphs = [];
    row.classList.remove("is-inked");
    list.forEach((g, i) => {
      setTimeout(() => {
        const gi = g.querySelector(".egg__gi");
        if (gi) gi.innerHTML = brainSVG();
        g.classList.add("is-brainy");
      }, i * 70);
    });
    setTimeout(() => retire(list, "is-rise", 2400), 520 + list.length * 70);
  }

  // "brain" lands: the letters somersault with the jelly, then drift up like bubbles
  function flip() {
    const list = glyphs; glyphs = [];
    setTimeout(() => row.classList.remove("is-inked"), 700);
    list.forEach((g, i) => { g.style.setProperty("--fd", `${i * 70}ms`); g.classList.add("is-flip"); });
    setTimeout(() => retire(list, "is-rise", 2400), 1150 + list.length * 70);
  }

  function center() {
    const r = row.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  // ---- the whisper ----
  function ensureMark() {
    if (markReady) return markReady;
    markReady = import("../hero-jelly.js")
      .then((m) => { if (m.createMark) { m.createMark(who, ctx, { tentacles: true }); who.classList.add("has-mark"); } })
      .catch(() => {});
    return markReady;
  }

  let sayToken = 0, outTimer = 0;
  function whisper(line, { hold = 4200, timer = 0, onEnd } = {}) {
    const tok = ++sayToken;
    clearTimeout(outTimer);
    ensureMark();
    root.classList.add("is-on");
    say.classList.remove("is-out", "is-tide");
    say.classList.add("is-in");
    tide.style.transition = "none";
    tide.style.clipPath = "";
    text.textContent = "";
    // words bleed in with a pause after punctuation, like the thoughts do
    let delay = 0;
    for (const w of line.split(" ")) {
      const s = document.createElement("span");
      s.className = "egg__w";
      s.textContent = w;
      s.style.setProperty("--wd", `${reduced ? 0 : delay}ms`);
      text.append(s, " ");
      delay += 62 + w.length * 11 + (/[.,?]$/.test(w) ? 240 : 0);
    }
    const written = reduced ? 0 : delay + 500;
    say.classList.toggle("has-tide", timer > 0 && !reduced);
    cutSay();

    if (timer > 0 && !reduced) {
      // an ink tentacle under the line, as long as the line, that shortens until the egg is over
      requestAnimationFrame(() => {
        if (tok !== sayToken) return;
        const w = Math.max(80, text.offsetWidth);
        tide.setAttribute("viewBox", `0 0 ${w.toFixed(0)} 22`);
        tide.setAttribute("width", w.toFixed(0)); tide.setAttribute("height", "22");
        tide.style.width = `${w.toFixed(0)}px`;
        const pts = [];
        const n = 7, L = w - 16;
        for (let i = 0; i <= n; i++) pts.push(P(2 + (L * i) / n, 9 + Math.sin(i * 1.7 + 0.4) * 2.4));
        tidePath.setAttribute("d", dOf(ink.tentacle(pts, { w0: 6.5, w1: 2.6, curl: { r0: 4.2, r1: 1.4, turns: 0.85, dir: 1 } })));
        say.classList.add("is-tide");
        cutSay();
        tide.style.clipPath = "inset(-6px 0 -6px 0)";
        setTimeout(() => {
          if (tok !== sayToken) return;
          tide.style.transition = `clip-path ${Math.max(0.2, timer - written / 1000)}s linear`;
          tide.style.clipPath = "inset(-6px 100% -6px 0)";
        }, Math.min(written, timer * 1000 * 0.3));
      });
    }
    const life = timer > 0 ? timer * 1000 : written + hold;
    outTimer = setTimeout(() => {
      if (tok !== sayToken) return;
      say.classList.remove("is-in");
      say.classList.add("is-out");
      onEnd?.();
      outTimer = setTimeout(() => { if (tok === sayToken) { say.classList.remove("is-out", "is-tide"); text.textContent = ""; } }, 1100);
    }, life);
  }

  return { show, sink, burst, flip, whisper, center, get count() { return glyphs.length; }, root };
}
