// thoughts: Turri's live stream of thought (SPEC brief 10 plus the research upgrades).
// The newest thought surfaces at the top and writes itself word by word in wet cream ink that dries.
// Cadence is human: it stops at punctuation, bursts after a pause, and sometimes strikes a word out
// with an ink brush and writes the better one after it. Older thoughts sink, shrink and fade into
// the water, never below a readable size; the eighth crumbles into drifting words. Only the newest thought
// wears its meta row (kind, #seq, time, version); it dissolves as the thought sinks, so the stream reads as
// a mind, not a log. The stream sits in a calm pocket of water (css) so the crowd never swims under the words.
// Above the stream: "thinking" with breathing dots and a bead chain for the state machine
// (observe ... verified). In the last stretch before a swap the mind gets drowsy and the chain reads
// "dreaming the next brain". A swap leaves an ink divider "v7 → v8".
// Budget (Round 2): layout is read only in ctx.loop.read (hidden twins measured a frame after they are
// added), everything is written in ctx.loop.add, and nothing runs while the section is off screen.

const MAX = 7;
const STATES = ["observe", "think", "draft", "compile", "simulate", "deploy", "verified"];
// Older lines shrink and fade with age, but never below a size (px) or a contrast you can read.
const SCALES = [1, 0.62, 0.55, 0.5, 0.46, 0.43, 0.41, 0.39];
const MIN_PX = [0, 15, 14, 13.5, 13, 12.5, 12, 12];
const ALPHA = [1, 0.9, 0.8, 0.69, 0.57, 0.45, 0.34, 0.22];
const FADE = [0, 5, 10, 15, 21, 27, 33, 38];     // % of the deep water mixed into the text colour
const TOP = 26;                                   // room above the newest line for rising bubbles
const BREATH = 16;                                // levels per half breath of the title's font axes
const KINDS = { look: "look", idea: "idea", test: "test", decide: "decide", deploy: "deploy", self: "self" };

// Self-corrections: [what it ends up writing, what it wrote first]. Shown, never deleted.
const FIXES = [
  ["nervous", "scared"], ["felt that", "respect that"], ["crowded", "busy"], ["believer", "genius"],
  ["Cheaper", "Better"], ["good idea", "great idea"], ["casino", "bank"], ["careful", "clever"],
  ["boring", "simple"], ["loud", "wrong"], ["replies", "charts"], ["on purpose", "faster"],
  ["opinions", "feelings"], ["like you", "trust you"], ["Classic", "Embarrassing"], ["journal", "receipts"],
  ["tip them", "thank them"], ["different brain", "better brain"], ["Good", "Great"], ["the people who stayed", "the holders"],
  ["Baby steps", "Small steps"], ["Strange hobby", "Weird hobby"],
];

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const strip = (w) => w.replace(/[.,;:?!]+$/, "");

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// which bead a thought lights
function stageFor(kind, text) {
  switch (kind) {
    case "look": return "observe";
    case "idea": case "self": return "think";
    case "decide": return "draft";
    case "test": return /replay|fuzz|running it|against|simulat/i.test(text) ? "simulate" : "compile";
    case "deploy": return /confirmed|check|matches|verif/i.test(text) ? "verified" : "deploy";
    default: return null;
  }
}

// last stretch before a swap: short, drowsy, trailing off
function drowse(text) {
  let s = text.split(/(?<=[.?!])\s+/)[0].replace(/[.?!]+$/, "");
  let words = s.split(/\s+/);
  if (words.length > 6) words = words.slice(0, 4 + Math.floor(Math.random() * 2));
  s = words.join(" ").replace(/[,;:]+$/, "");
  const first = words[0] || "";
  if (!/^I('|$)/.test(first) && /^[A-Z][a-z]/.test(first)) s = s[0].toLowerCase() + s.slice(1);
  return s + "...";
}

export function init(ctx) {
  const { bus, loop, ink, state, content, reduced, params } = ctx;
  const FIX_P = params?.has?.("strike") ? 1 : 0.42;      // ?strike forces a self-correction (for testing)
  const root = document.getElementById("thoughts");
  if (!root) return;
  const P = ink.P;

  // ---------- ink shapes ----------
  const closedD = (pts, s = 1, ox = 0, oy = 0) =>
    "M" + pts.map((p) => `${(ox + p.x * s).toFixed(2)} ${(oy + p.y * s).toFixed(2)}`).join("L") + "Z";
  const unitBlob = (rng, n = 7, amp = 0.12) => {
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rng() * 0.3;
      const r = 1 + (rng() - 0.5) * 2 * amp;
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    return ink.spline(pts, true, 6);
  };
  const strikeSVG = () => {
    const j = () => rnd(-1.6, 1.6);
    const y0 = 13 + j(), y1 = 8 + j();
    const path = ink.swell([P(1, y0), P(30, y0 - 1.2 + j()), P(64, (y0 + y1) / 2 + j()), P(99, y1)], { w: 8, wEnds: 2.6, color: "currentColor" });
    return `<svg class="th__strike" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">${path}</svg>`;
  };
  const swashSVG = () => {
    const j = () => rnd(-1.5, 1.5);
    const path = ink.swell([P(4, 17 + j()), P(32, 15 + j()), P(68, 16 + j()), P(96, 13 + j())], { w: 25, wEnds: 16, color: "currentColor" });
    return `<svg class="th__swash" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">${path}</svg>`;
  };
  // two calligraphic flourishes, each anchored to the label so they never collide with it
  const dividerSVG = () => {
    const L = ink.tentacle([P(214, 24), P(160, 21), P(100, 26), P(36, 22)], { w0: 6.5, w1: 2.2, pow: 0.7, curl: { r0: 8, r1: 2.6, turns: 0.85, dir: 1 }, color: "currentColor" });
    const R = ink.tentacle([P(6, 24), P(60, 27), P(120, 21), P(184, 25)], { w0: 6.5, w1: 2.2, pow: 0.7, curl: { r0: 8, r1: 2.6, turns: 0.85, dir: -1 }, color: "currentColor" });
    return [
      `<svg class="th__div-ink th__div-ink--l" viewBox="0 0 220 48" preserveAspectRatio="xMaxYMid meet" aria-hidden="true">${L}</svg>`,
      `<svg class="th__div-ink th__div-ink--r" viewBox="0 0 220 48" preserveAspectRatio="xMinYMid meet" aria-hidden="true">${R}</svg>`,
    ];
  };
  // three ink droplets; each is its own html box so its breathing (transform, opacity) runs on the compositor
  const dotsHTML = () => {
    const rng = mulberry32(7);
    return `<span class="th__dots" aria-hidden="true">${[0, 1, 2]
      .map(() => `<i class="th__dot"><svg viewBox="-3.3 -3.3 6.6 6.6"><path d="${closedD(unitBlob(rng, 6, 0.14), 3.3)}"/></svg></i>`).join("")}</span>`;
  };

  // before the first brain (live, version 0) there is no version to name
  const verText = (v) => (v > 0 ? `brain v${v}` : "no brain yet");

  // ---------- DOM ----------
  root.classList.add("th");
  if (reduced) root.classList.add("is-reduced");
  root.innerHTML = `
    <div class="th__pocket" aria-hidden="true"></div>
    <div class="th__head">
      <h3 class="th__title"><span class="th__word">thinking</span>${dotsHTML()}</h3>
      <p class="th__brain"><span class="th__brain-v">${verText(state.version)}</span></p>
    </div>
    <div class="th__chain" aria-hidden="true">
      <svg class="th__chain-svg"><path class="th__thread"/><g class="th__beads"></g><path class="th__spark"/></svg>
      <div class="th__labels">${STATES.map((s) => `<span class="th__label">${s}</span>`).join("")}</div>
      <p class="th__dream">dreaming the next brain</p>
    </div>
    <div class="th__stream" role="list" aria-label="My latest thoughts">
      <svg class="th__bubble" viewBox="-20 -20 40 40" aria-hidden="true"><path class="th__bubble-ring"/><path class="th__bubble-glint"/></svg>
    </div>
    <p class="th__sr" aria-live="polite"></p>`;
  const stream = root.querySelector(".th__stream");
  const wordEl = root.querySelector(".th__word");
  const verEl = root.querySelector(".th__brain-v");
  const srEl = root.querySelector(".th__sr");
  const chainEl = root.querySelector(".th__chain");
  const chainSvg = root.querySelector(".th__chain-svg");
  const threadEl = root.querySelector(".th__thread");
  const sparkEl = root.querySelector(".th__spark");
  const beadsG = root.querySelector(".th__beads");
  const labelEls = [...root.querySelectorAll(".th__label")];
  const bubbleEl = root.querySelector(".th__bubble");
  const ringEl = root.querySelector(".th__bubble-ring");
  const glintEl = root.querySelector(".th__bubble-glint");

  // ---------- state ----------
  const items = [];      // newest first
  const leaving = [];
  const queue = [];
  let active = null;     // item being written
  let nextAt = 0;
  let now = 0;
  let visible = true, far = false;
  let dreaming = false;
  let version = state.version;
  let lastAnnounce = 0;
  let seq = (() => {
    const first = state.journal?.[0]?.at ?? Date.now() - 3.5 * 3600e3;
    return Math.max(1, Math.floor((Date.now() - first) / 8500));
  })();
  // layout: read in the read phase, applied by the writer
  let measureQ = [];        // items whose hidden twins wait to be measured
  let readings = null;      // what this frame's read phase measured
  let relayoutAsk = false;  // fonts or width changed: measure every line again
  let chainAsk = true;      // the chain width (and the css bleed) want reading
  let chainFresh = false;
  let chainW = 0, bleed = 28, lastW = -1;
  let staticDirty = reduced; // reduced motion: draw the final states once whenever they change

  // ---------- items ----------
  function tokenize(text, allowFix) {
    const toks = text.split(/\s+/).filter(Boolean).map((w) => ({ text: w }));
    if (allowFix && Math.random() < FIX_P) {
      const order = FIXES.slice().sort(() => Math.random() - 0.5);
      for (const [real, draft] of order) {
        const pw = real.split(" ");
        for (let i = 0; i + pw.length <= toks.length; i++) {
          if (pw.every((w, j) => strip(toks[i + j].text) === w)) {
            toks.splice(i, 0, { text: draft, draft: true });
            return toks;
          }
        }
      }
    }
    return toks;
  }

  function addWords(parent, toks) {
    return toks.map((tk, i) => {
      const s = document.createElement(tk.draft ? "del" : "span");   // a first draft is struck, never deleted
      s.className = "th__w" + (tk.draft ? " th__w--draft" : "") + (tk.cls ? ` ${tk.cls}` : "");
      s.textContent = tk.text;
      if (tk.draft) s.insertAdjacentHTML("beforeend", strikeSVG());
      parent.append(s);
      if (i < toks.length - 1) parent.append(" ");
      return { el: s, text: tk.text, draft: !!tk.draft, cls: tk.cls || "", ox: 0, oy: 0, ow: 0, oh: 0 };
    });
  }

  function baseItem(el, textEl, words, steps) {
    if (far) el.style.transition = "none"; // see the "far" observer: no colour fades a screen away
    return { el, textEl, words, steps, si: 0, shown: -1, h: 0, w: 0, fs: 24, metaH: 0, x: 0, y: 0, s: 1, o: 0,
      ty: 0, ts: 1, to: 1, tx: 0, age: 0, swayA: 0, rotA: 0, fade: -1, tf: "", os: "",
      ph: Math.random() * 6.28, hover: false, burst: 0, measured: false, ghost: null, fresh: false, instant: false, wake: 0 };
  }

  function makeThought(th, instant) {
    const dream = dreaming && !instant;
    const kind = KINDS[th.kind] || "self";
    const text = dream ? drowse(String(th.text)) : String(th.text);
    const v = Number(th.version) || version;
    const n = Number.isFinite(th.seq) ? th.seq : ++seq;
    const at = th.at || Date.now();
    const el = document.createElement("article");
    el.className = "th__item" + (dream ? " is-dream" : "");
    el.setAttribute("role", "listitem");
    el.dataset.kind = kind;
    el.innerHTML = `<p class="th__meta"><span class="th__kind">${swashSVG()}<span>${kind}</span></span>` +
      `<span class="th__seq">#${n}</span><span class="th__ago">now</span><span class="th__v">v${v}</span></p><p class="th__text"></p>`;
    el.querySelector(".th__meta").title = new Date(at).toLocaleTimeString();
    const textEl = el.querySelector(".th__text");
    const words = addWords(textEl, tokenize(text, !dream));
    const steps = [];
    for (const w of words) {
      steps.push({ op: "word", w });
      if (w.draft) steps.push({ op: "pool" }, { op: "strike", w });
    }
    const it = baseItem(el, textEl, words, steps);
    Object.assign(it, { type: "thought", at, agoEl: el.querySelector(".th__ago"), stage: stageFor(kind, text), dream, text, raw: String(th.text) });
    return it;
  }

  function makeDivider(from, to) {
    const el = document.createElement("div");
    el.className = "th__item th__div";
    el.setAttribute("role", "listitem");
    const [l, r] = dividerSVG();
    el.innerHTML = `${l}<p class="th__div-label"></p>${r}`;
    const textEl = el.querySelector(".th__div-label");
    // the very first brain replaces nothing
    const words = from > 0
      ? addWords(textEl, [{ text: `v${from}` }, { text: "→", cls: "th__arrow" }, { text: `v${to}`, cls: "th__to" }])
      : addWords(textEl, [{ text: "first" }, { text: "brain," }, { text: `v${to}`, cls: "th__to" }]);
    const steps = [{ op: "draw" }, ...words.map((w) => ({ op: "word", w }))];
    const it = baseItem(el, textEl, words, steps);
    it.type = "divider";
    el.setAttribute("aria-label", from > 0 ? `Brain v${from} replaced by v${to}` : `The first brain, v${to}`);
    return it;
  }

  // ---------- measuring ----------
  // Every word is locked to its dry width (in its own em) so heavy wet ink never reflows the line.
  // Widths and offsets come from a hidden, untransformed twin of the line, so a word caught mid-bleed
  // (heavy, wide) or a line caught mid-sway is never measured wrong. Twins are added by the writer and
  // read in the next frame's read phase, when layout is already clean: nothing here forces a layout.
  function requestMeasure(list) {
    for (const it of list) {
      if (it.leaving) continue;
      it.ghost?.remove();
      const g = it.el.cloneNode(true);
      g.classList.add("th__ghost");
      g.removeAttribute("role");
      g.removeAttribute("aria-label");
      g.setAttribute("aria-hidden", "true");
      stream.append(g);
      it.ghost = g;
      if (!measureQ.includes(it)) measureQ.push(it);
    }
  }

  function readMeasures() {   // read phase only
    const out = [];
    for (const it of measureQ) {
      const g = it.ghost;
      if (!g || !g.isConnected) continue;
      const gr = g.getBoundingClientRect();
      const k = gr.width / (parseFloat(getComputedStyle(g).width) || gr.width || 1) || 1;
      const textG = g.querySelector(".th__text, .th__div-label");
      const fs = parseFloat(getComputedStyle(textG).fontSize) || 24;
      const spans = g.querySelectorAll(".th__w");
      const ws = [];
      for (let i = 0; i < spans.length; i++) {
        const r = spans[i].getBoundingClientRect();
        const own = it.words[i]?.cls ? parseFloat(getComputedStyle(spans[i]).fontSize) || fs : fs;
        ws.push({ w: r.width / k, x: (r.left - gr.left) / k, y: (r.top - gr.top) / k, h: r.height / k, fs: own });
      }
      const m = g.querySelector(".th__meta");
      const metaH = m ? m.offsetHeight + (parseFloat(getComputedStyle(m).marginBottom) || 0) : 0;
      out.push({ it, fs, ws, h: gr.height / k, w: gr.width / k, metaH });
    }
    measureQ = [];
    return out;
  }

  function applyMeasures(rs) {   // write phase
    for (const r of rs) {
      const it = r.it;
      it.ghost?.remove();
      it.ghost = null;
      if (it.leaving || !items.includes(it)) continue;
      it.fs = r.fs; it.h = r.h; it.w = r.w; it.metaH = r.metaH;
      r.ws.forEach((m, k) => {
        const w = it.words[k];
        if (!w) return;
        // floor, so the real line is never wider than its twin and always breaks in the same places
        w.el.style.width = `${Math.floor((m.w / m.fs) * 1e4) / 1e4}em`;
        w.ox = m.x; w.oy = m.y; w.ow = m.w; w.oh = m.h;
      });
      if (!it.measured) { it.measured = true; it.fresh = true; it.el.classList.add("is-measured"); }
    }
    retarget();
    for (const it of items) {
      if (!it.fresh) continue;
      it.fresh = false;
      it.x = it.tx; it.s = it.ts;
      it.y = it.ty - (it.instant ? 0 : 10);
      place(it, 0, 0);
    }
  }

  // ---------- the stack ----------
  function retarget() {
    // the newest thought wears its meta row above its words, so it starts that much lower
    let y = items[0]?.type === "thought" ? items[0].metaH || 34 : 0;
    items.forEach((it, i) => {
      const k = Math.min(i, SCALES.length - 1);
      const div = it.type === "divider";
      let ts = i ? Math.max(SCALES[k], MIN_PX[k] / (it.fs || 24)) : 1;
      if (div) ts = Math.max(0.8, ts);                  // a chapter break keeps the full column
      ts = Math.min(1, ts);
      it.ts = ts;
      it.age = i;
      it.to = ALPHA[k];
      it.ty = y;
      const w = it.w || 560;
      const calm = (div ? 0.3 : 1) * clamp(w / 560, 0.4, 1);
      it.swayA = i ? (1.2 + i * 1.5) * calm : 0;
      it.rotA = i ? 0.16 * i * calm : 0;
      if (div) it.tx = ((1 - ts) * (it.w || 0)) / 2;
      else if (i) {
        // older lines wander off the margin a little, but never past the stream's bleed, where they would clip
        const amp = clamp(w / 560, 0.35, 1);
        const lean = (it.h || 0) * ts * Math.sin((it.rotA * Math.PI) / 180);
        it.tx = Math.max((Math.sin(it.ph * 3.1) * (6 + i * 3) + 4) * amp, 3 - bleed + it.swayA + lean);
      } else it.tx = 0;
      const fade = FADE[k];
      if (fade !== it.fade) { it.fade = fade; it.el.style.setProperty("--fade", `${fade}%`); }
      it.el.classList.toggle("is-newest", i === 0);
      y += (it.h || 0) * ts + (i === 0 ? 30 : 20 * ts + 8);
    });
    if (reduced || !visible) snap();
  }

  function snap() {
    for (const it of items) {
      if (!it.measured) continue;
      it.y = it.ty; it.x = it.tx; it.s = it.ts; it.o = it.to;
      place(it, 0, 0);
    }
  }

  function place(it, sw, rot) {
    const tf = `translate3d(${(it.x + sw).toFixed(2)}px,${(TOP + it.y).toFixed(2)}px,0) rotate(${rot.toFixed(3)}deg) scale(${it.s.toFixed(4)})`;
    if (tf !== it.tf) { it.tf = tf; it.el.style.transform = tf; }
    const o = it.o.toFixed(3);
    if (o !== it.os) { it.os = o; it.el.style.opacity = o; }
  }

  function insert(it, instant) {
    stream.prepend(it.el);
    it.el.addEventListener("pointerenter", () => { it.hover = true; it.el.classList.add("is-recalled"); });
    it.el.addEventListener("pointerleave", () => { it.hover = false; it.el.classList.remove("is-recalled"); });
    items.unshift(it);
    it.instant = instant;
    it.o = instant ? 1 : 0;
    it.wake = instant ? 0 : now + 0.28;
    if (instant) finishInstant(it);
    while (items.length > MAX) forget(items.pop());
    requestMeasure([it]);     // it shows (and the stack re-stacks) once its words are measured, next frame
  }

  function finishInstant(it) {
    for (const w of it.words) w.el.classList.add("is-in", "is-dry");
    for (const w of it.words) if (w.draft) w.el.classList.add("is-struck");
    it.el.classList.add("is-drawn");
    it.si = it.steps.length;
    it.shown = it.words.length - 1;
    it.done = true;
  }

  // the oldest thought crumbles into drifting words and sinks out of view
  function forget(it) {
    if (it === active) active = null;
    it.ghost?.remove();
    it.ghost = null;
    if (reduced || !visible || !it.measured) { it.el.remove(); return; }
    it.leaving = true;
    it.leftAt = now;
    it.o0 = it.o;
    it.el.classList.add("is-leaving");
    it.words.forEach((w, k) => {
      const d = 1.5 + Math.random() * 0.9;
      w.el.style.transition = `transform ${d}s var(--ease-sink) ${k * 22}ms, opacity ${d * 0.8}s ease ${220 + k * 22}ms, color .5s ease`;
      w.el.style.transform = `translate(${rnd(-26, 26).toFixed(1)}px, ${rnd(40, 110).toFixed(1)}px) rotate(${rnd(-38, 38).toFixed(1)}deg)`;
      w.el.style.opacity = "0";
    });
    leaving.push(it);
    setTimeout(() => { it.el.remove(); const k = leaving.indexOf(it); if (k >= 0) leaving.splice(k, 1); }, 2900);
  }

  // ---------- the writer ----------
  const speed = () => (queue.length ? 0.55 : 1) * (dreaming ? 1.9 : 1);

  function delayAfter(it, word) {
    let d = 58 + word.length * 15 + rnd(0, 85);
    let pause = 0;
    if (/(\.\.\.|[.?!])$/.test(word)) pause = rnd(380, 760);
    else if (/[,;:]$/.test(word)) pause = rnd(170, 360);
    else if (Math.random() < 0.06) pause = rnd(240, 560);   // lost the thread for a moment
    if (it.burst > 0) { d *= 0.4; it.burst--; }
    if (pause) { it.burst = 2 + Math.floor(Math.random() * 3); bubble.pool = clamp(pause / 650, 0.25, 1); }
    return (d + pause) * speed();
  }

  let lastTick = 0;
  function doStep(it, st) {
    if (st.op === "word") {
      st.w.el.classList.add("is-in");
      it.shown = it.words.indexOf(st.w);
      bubble.pool = 0;
      if (visible && now - lastTick > 0.06) { lastTick = now; bus.emit("sfx", { name: "tick" }); }
      if (it.type === "divider") return 170;
      return delayAfter(it, st.w.text);
    }
    if (st.op === "pool") { bubble.pool = 1; return rnd(420, 680) * (queue.length ? 0.6 : 1); }
    if (st.op === "strike") { st.w.el.classList.add("is-struck"); bubble.pool = 0; return rnd(380, 480); }
    if (st.op === "draw") { it.el.classList.add("is-drawn"); return 650; }
    return 0;
  }

  function start(job) {
    const instant = reduced || !visible;
    let it;
    if (job.type === "divider") {
      it = makeDivider(job.from, job.to);
      setStage("verified");
    } else {
      it = makeThought(job.th, instant);
      if (it.stage && !dreaming) setStage(it.stage);
      announce(it.text);
    }
    insert(it, instant);
    if (instant) return;
    active = it;
    nextAt = now + 0.42;          // let the older lines sink out of the way first
    if (visible) bus.emit("sfx", { name: "bubble" });
  }

  function writer() {
    if (!active) {
      if (queue.length) start(queue.shift());
      return;
    }
    let guard = 0;
    while (active && now >= nextAt && guard++ < 6) {
      const st = active.steps[active.si++];
      if (!st) { active.done = true; active = null; break; }
      nextAt = now + doStep(active, st) / 1000;
    }
  }

  function enqueue(job) {
    // a mind can return to a thought, but the stream never shows the same line twice
    if (job.type === "thought") {
      const twin = items.find((it) => it.type === "thought" && it.raw === job.th.text && it !== active);
      if (twin) { items.splice(items.indexOf(twin), 1); forget(twin); retarget(); }
    }
    // a tab left in the background piles thoughts up: keep only the freshest few animated
    while (queue.length > 3) {
      if (active) { finishInstant(active); active = null; }   // finish the sentence first, so the order stays true
      const old = queue.shift();
      insert(old.type === "divider" ? makeDivider(old.from, old.to) : makeThought(old.th, true), true);
    }
    queue.push(job);
    if (reduced || !visible) {
      if (active) { finishInstant(active); active = null; }   // nobody is watching: finish the sentence
      while (queue.length) start(queue.shift());
    }
  }

  function announce(text) {
    const t = performance.now();
    if (t - lastAnnounce < 10000) return;
    lastAnnounce = t;
    srEl.textContent = text;
  }

  // ---------- bubble cursor ----------
  const bubble = { x: 0, y: 0, tx: 0, ty: 0, r: 7, pool: 0, poolS: 0, s: 0, ts: 1, idle: 0, nextPuff: 2.5, frame: 0, owner: null, rise: false, glintR: -1 };
  const puffs = [];
  const bubbleRng = mulberry32(31);

  function bubbleTarget() {
    const it = active || items[0];
    if (!it || !it.words.length) { bubble.ts = 0; return; }
    if (!it.measured) return;          // its words are measured next frame; hold still until then
    if (bubble.owner !== it) { bubble.owner = it; bubble.rise = true; bubble.riseUntil = now + 0.6; }
    bubble.ts = 1;
    const fs = it.fs;
    let lx, ly;
    if (it.shown < 0) { const w = it.words[0]; lx = w.ox - fs * 0.05; ly = w.oy + w.oh * 0.56; }
    else { const w = it.words[it.shown]; lx = w.ox + w.ow + fs * 0.42; ly = w.oy + w.oh * 0.56; }
    bubble.tx = it.x + lx * it.s;
    bubble.ty = TOP + it.y + ly * it.s;
    bubble.r = fs * 0.25 * it.s;
  }

  function ringD(r, t, wob) {
    const pts = [], inner = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const n = Math.sin(a * 3 + t * 2.3) * 0.045 + Math.sin(a * 2 - t * 1.4) * 0.03;
      pts.push({ x: Math.cos(a) * r * (1 + n * wob), y: Math.sin(a) * r * (1 + n * wob) });
      inner.push({ x: Math.cos(a) * r * (0.7 + n * wob * 0.8), y: Math.sin(a) * r * (0.7 + n * wob * 0.8) });
    }
    return closedD(ink.spline(pts, true, 5)) + closedD(ink.spline(inner, true, 5));
  }

  function spawnPuff() {
    if (puffs.length > 3) return;
    const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    el.setAttribute("viewBox", "-10 -10 20 20");
    el.setAttribute("class", "th__puff");
    el.setAttribute("aria-hidden", "true");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", closedD(unitBlob(bubbleRng, 7, 0.1), 5) + closedD(unitBlob(bubbleRng, 7, 0.1), 3.2));
    p.setAttribute("fill-rule", "evenodd");
    el.append(p);
    stream.append(el);
    puffs.push({ el, x: bubble.x + rnd(-2, 4), y: bubble.y - bubble.r, t0: now, dur: rnd(1.6, 2.4), dx: rnd(-14, 14), rise: rnd(36, 70), s: rnd(0.45, 0.85) });
  }

  function drawBubble(t, dt) {
    bubbleTarget();
    const dist = Math.hypot(bubble.tx - bubble.x, bubble.ty - bubble.y);
    if (bubble.rise && (dist < 8 || now > bubble.riseUntil)) bubble.rise = false;
    const k = 1 - Math.exp(-dt / (bubble.rise ? 0.3 : 0.07));
    bubble.x += (bubble.tx - bubble.x) * k;
    bubble.y += (bubble.ty - bubble.y) * k;
    bubble.s += (bubble.ts - bubble.s) * (1 - Math.exp(-dt / 0.25));
    bubble.poolS += (bubble.pool - bubble.poolS) * (1 - Math.exp(-dt / (bubble.pool > bubble.poolS ? 0.35 : 0.12)));
    const bob = Math.sin(t * 2.1) * 1.6 * (active ? 0.4 : 1);
    const sc = bubble.s * (1 + bubble.poolS * 0.55 + Math.sin(t * 1.7) * 0.04);
    const r = Math.max(4, bubble.r);
    bubbleEl.style.transform = `translate3d(${bubble.x.toFixed(2)}px,${(bubble.y + bob).toFixed(2)}px,0) scale(${sc.toFixed(3)})`;
    if ((bubble.frame++ & 1) === 0) {
      ringEl.setAttribute("d", ringD(r, t * (dreaming ? 0.5 : 1), 1 + bubble.poolS));
      if (Math.abs(r - bubble.glintR) > 0.05) {
        bubble.glintR = r;
        glintEl.setAttribute("d", closedD(ink.spline([P(-0.62, -0.18), P(-0.42, -0.5), P(-0.12, -0.66), P(-0.38, -0.42)], true, 5), r));
      }
    }
    // idle: it breathes and lets small bubbles go
    if (!active && items.length) {
      bubble.idle += dt;
      if (bubble.idle > bubble.nextPuff) { bubble.idle = 0; bubble.nextPuff = rnd(1.8, 3.8) * (dreaming ? 1.6 : 1); spawnPuff(); }
    } else bubble.idle = 0;
    for (let i = puffs.length - 1; i >= 0; i--) {
      const pf = puffs[i];
      const u = (now - pf.t0) / pf.dur;
      if (u >= 1) { pf.el.remove(); puffs.splice(i, 1); continue; }
      const x = pf.x + Math.sin(u * 5 + pf.dx) * 4 + pf.dx * u;
      const y = pf.y - pf.rise * (1 - Math.pow(1 - u, 1.6));
      const s = pf.s * (u < 0.15 ? u / 0.15 : 1) * (1 - u * 0.35);
      pf.el.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${s.toFixed(3)})`;
      pf.el.style.opacity = (u > 0.7 ? (1 - u) / 0.3 : 1).toFixed(3);
    }
  }

  // ---------- the title breathes on its variable axes ----------
  // Every new axis value re-shapes the word (a layout), so the breath walks through a small set of levels
  // (cached font instances): a few cheap steps a second, too fine to see, instead of a fresh shape every frame.
  const breath = { ph: 0, level: -1 };
  function breathe(dt) {
    breath.ph = (breath.ph + dt / (dreaming ? 9 : 5.6)) % 1;
    const u = 0.5 - 0.5 * Math.cos(breath.ph * Math.PI * 2);
    const level = Math.round(u * BREATH);
    if (level === breath.level) return;
    breath.level = level;
    const k = level / BREATH;
    wordEl.style.fontWeight = String(Math.round(360 + 120 * k));
    wordEl.style.fontVariationSettings = `"SOFT" ${Math.round(30 + 70 * k)}, "WONK" ${k >= 0.5 ? 1 : 0}, "opsz" 72`;
  }

  // ---------- bead chain (the state machine) ----------
  const CH = 44, CY = 20;
  const chain = { W: 600, xs: [], cur: 0, flowX: 0, spark: null, sparkOn: false };
  const beads = STATES.map((name, i) => {
    const rng = mulberry32(101 + i * 17);
    const outer = unitBlob(rng, 7, 0.1), inner = unitBlob(rng, 7, 0.12), core = unitBlob(rng, 7, 0.1), big = unitBlob(rng, 8, 0.08);
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "th__bead");
    g.innerHTML = `<path class="th__bead-ink" fill-rule="evenodd"/><path class="th__bead-core" d="${closedD(core, 6.4)}"/>`;
    beadsG.append(g);
    return {
      name, g, inkEl: g.firstChild, coreEl: g.lastChild,
      ring: closedD(outer, 5.6) + closedD(inner, 3.1), dot: closedD(outer, 5), lit: closedD(big, 9.6),
      kind: "", s: 1, v: 0, cs: 0, tf: "", ctf: "",
    };
  });

  function setBeadKind(b, kind) {
    if (b.kind === kind) return;
    b.kind = kind;
    b.inkEl.setAttribute("d", kind === "open" ? b.ring : kind === "done" ? b.dot : b.lit);
  }

  function applyChain() {   // write phase; chainW was read in the read phase
    const W = Math.max(200, chainW);
    chain.W = W;
    chainSvg.setAttribute("viewBox", `0 0 ${W.toFixed(2)} ${CH}`);
    const pad = 24;
    chain.xs = STATES.map((_, i) => pad + ((W - pad * 2) * i) / (STATES.length - 1));
    labelEls.forEach((el, i) => {
      el.style.left = `${((chain.xs[i] / W) * 100).toFixed(3)}%`;
      el.classList.toggle("is-first", i === 0);
      el.classList.toggle("is-last", i === STATES.length - 1);
    });
  }

  function threadY(x, t) {
    const xs = chain.xs;
    let seg = 0;
    while (seg < xs.length - 2 && x > xs[seg + 1]) seg++;
    const f = clamp((x - xs[seg]) / (xs[seg + 1] - xs[seg] || 1), 0, 1);
    return CY + Math.sin(Math.PI * f) * 2.6 + Math.sin(x * 0.017 + t * 0.9) * 1.6;
  }

  function drawChain(t, dt) {
    const xs = chain.xs;
    if (!xs.length) return;
    // spark travelling between beads
    let flowTarget = xs[chain.cur];
    if (chain.spark) {
      const sp = chain.spark;
      const u = clamp((now - sp.t0) / sp.dur, 0, 1);
      const x = xs[sp.from] + (xs[sp.to] - xs[sp.from]) * ease(u);
      flowTarget = x;
      sparkEl.setAttribute("d", closedD(ink.spline([P(-1, 0), P(0, -0.8), P(1.4, 0), P(0, 0.8)], true, 5), 3.6, x, threadY(x, t)));
      if (!chain.sparkOn) { chain.sparkOn = true; sparkEl.style.opacity = "1"; }
      if (u >= 1) {
        chain.spark = null;
        const b = beads[sp.to];
        b.s = 0.55; b.v = 0;     // the jelly refill
      }
    }
    if (!chain.spark && chain.sparkOn) { chain.sparkOn = false; sparkEl.style.opacity = "0"; }
    chain.flowX = dreaming ? 0 : flowTarget;
    // the thread: an ink tentacle strung with beads, thick where ink has flowed, thin ahead,
    // curling up at both tips
    const x0 = xs[0] - 6, x1 = xs[xs.length - 1] + 6;
    const steps = Math.max(24, Math.round((x1 - x0) / 7));
    const main = [];
    for (let i = 0; i <= steps; i++) { const x = x0 + ((x1 - x0) * i) / steps; main.push({ x, y: threadY(x, t) }); }
    const m0 = main[0], m1 = main[1], e0 = main[steps], e1 = main[steps - 1];
    const curlL = ink.spiral(m0, Math.atan2(m0.y - m1.y, m0.x - m1.x), 7.5, 2, 0.95, 1, 2.6).slice(1).reverse();
    const curlR = ink.spiral(e0, Math.atan2(e0.y - e1.y, e0.x - e1.x), 7.5, 2, 0.95, -1, 2.6).slice(1);
    const pts = [...curlL, ...main, ...curlR];
    const nL = curlL.length, nR = curlR.length, N = pts.length;
    const L = [], R = [];
    for (let i = 0; i < N; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l;
      const p = pts[i];
      let w;
      if (i < nL) w = 1.15 * (0.22 + (0.78 * (i + 1)) / (nL + 1));
      else if (i >= N - nR) w = 1.15 * (1 - (0.78 * (i - (N - nR) + 1)) / (nR + 1));
      else w = 1.15 + clamp((chain.flowX - p.x) / 14 + 0.5, 0, 1) * 1.75;
      L.push({ x: p.x + nx * w, y: p.y + ny * w });
      R.push({ x: p.x - nx * w, y: p.y - ny * w });
    }
    threadEl.setAttribute("d", closedD([...L, ...R.reverse()]));
    // beads
    const wave = 3 + Math.sin(t * 0.55) * 3.6;
    beads.forEach((b, i) => {
      const a = 260, c = 13;           // spring: stiffness, damping
      b.v += (-(b.s - 1) * a - b.v * c) * dt;
      b.s += b.v * dt;
      const lit = b.kind === "lit" && !dreaming;
      const tc = dreaming ? Math.exp(-((i - wave) ** 2) / 0.9) * 0.85 : lit ? 1 : 0;
      b.cs += (tc - b.cs) * (1 - Math.exp(-dt / 0.3));
      const pulse = lit ? 1 + Math.sin(t * 3.2) * 0.05 : 1;
      const y = threadY(xs[i], t);
      const tf = `translate(${xs[i].toFixed(2)} ${y.toFixed(2)}) scale(${(b.s * pulse).toFixed(3)})`;
      if (tf !== b.tf) { b.tf = tf; b.g.setAttribute("transform", tf); }
      const ctf = `scale(${Math.max(0.001, b.cs).toFixed(3)})`;
      if (ctf !== b.ctf) { b.ctf = ctf; b.coreEl.setAttribute("transform", ctf); }
    });
  }

  function setStage(name) {
    const k = STATES.indexOf(name);
    if (k < 0) return;
    const from = chain.cur;
    chain.cur = k;
    beads.forEach((b, i) => setBeadKind(b, i < k ? "done" : i === k ? "lit" : "open"));
    labelEls.forEach((el, i) => { el.classList.toggle("is-on", i === k); el.classList.toggle("is-done", i < k); });
    root.dataset.stage = name;
    staticDirty = reduced;
    if (k === from || reduced) return;
    chain.spark = { from, to: k, t0: now, dur: 0.38 + 0.11 * Math.abs(k - from) };
  }

  function setDreaming(on) {
    if (on === dreaming) return;
    dreaming = on;
    root.classList.toggle("is-dreaming", on);
    staticDirty = reduced;
  }

  // ---------- relative time (only the newest thought shows it) ----------
  function ago(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 5) return "now";
    if (s < 60) return `${s} s`;
    return `${Math.floor(s / 60)} min`;
  }
  function updateAgo() {
    const it = items[0];
    if (!it?.agoEl) return;
    const v = ago(Date.now() - it.at);
    if (it.agoEl.textContent !== v) it.agoEl.textContent = v;
  }

  // reduced motion: draw the final states once, no loops
  function drawStatic() {
    drawChainStatic();
    bubbleTarget();
    bubble.x = bubble.tx; bubble.y = bubble.ty;
    bubbleEl.style.transform = `translate3d(${bubble.tx.toFixed(1)}px,${bubble.ty.toFixed(1)}px,0)`;
    ringEl.setAttribute("d", ringD(Math.max(4, bubble.r), 0, 0.6));
  }
  function drawChainStatic() {
    chain.spark = null;
    for (const b of beads) { b.s = 1; b.v = 0; b.cs = b.kind === "lit" ? 1 : 0; }
    drawChain(0, 0);
  }

  // ---------- frame ----------
  // read phase: layout is clean here, so these reads are free (and they only happen after a change)
  loop.read(() => {
    if (chainAsk) {
      chainAsk = false;
      chainW = chainEl.clientWidth;
      lastW = root.clientWidth;
      bleed = parseFloat(getComputedStyle(root).getPropertyValue("--bleed")) || bleed;
      chainFresh = true;
    }
    if (measureQ.length) readings = readMeasures();
  });

  let chainDt = 0, lastAgo = -1;
  loop.add((t, dt) => {
    now = t;
    if (relayoutAsk) { relayoutAsk = false; chainAsk = true; requestMeasure(items); }
    if (chainFresh) { chainFresh = false; applyChain(); staticDirty = reduced; }
    if (readings) { const rs = readings; readings = null; applyMeasures(rs); staticDirty = reduced; }
    writer();
    if (!visible) return;                        // off screen: idle
    if (t - lastAgo > 1) { lastAgo = t; updateAgo(); }
    if (reduced) { if (staticDirty) { staticDirty = false; drawStatic(); } return; }
    breathe(dt);
    const ky = 1 - Math.exp(-dt / 0.5), ks = 1 - Math.exp(-dt / 0.65);
    for (const it of items) {
      if (!it.measured) continue;
      it.y += (it.ty - it.y) * ky;
      it.x += (it.tx - it.x) * ks;
      it.s += (it.ts - it.s) * ks;
      const to = now < it.wake ? 0 : it.hover ? Math.max(0.94, it.to) : it.to;
      it.o += (to - it.o) * ks;
      const sw = it.swayA ? Math.sin(t * 0.37 + it.ph) * it.swayA : 0;
      const rot = it.rotA ? Math.sin(t * 0.29 + it.ph * 1.7) * it.rotA : 0;
      place(it, sw, rot);
    }
    for (const it of leaving) {
      const a = now - it.leftAt, peak = Math.max(0.55, it.o0);   // one last glint, then gone
      it.y += dt * 26;
      it.o = a < 0.3 ? it.o0 + (peak - it.o0) * (a / 0.3) : Math.max(0, peak - (a - 0.3) * 0.32);
      place(it, Math.sin(t * 0.37 + it.ph) * 9, Math.sin(t * 0.29 + it.ph) * 1.1);
    }
    drawBubble(t, dt);
    chainDt += dt;
    if (bubble.frame & 1) { drawChain(t, chainDt); chainDt = 0; }
  });

  // ---------- visibility, size, fonts ----------
  new IntersectionObserver(([e]) => {
    const was = visible;
    visible = e.isIntersecting;
    if (visible && !was) {
      snap();
      bubbleTarget(); bubble.x = bubble.tx; bubble.y = bubble.ty; bubble.rise = false;
      lastAgo = -1;
      staticDirty = reduced;
    }
  }, { rootMargin: "160px 0px" }).observe(root);
  // An ageing thought fades its colour over 1.6 s, and colour is inherited by every word, so while a fade runs the
  // whole item (hundreds of elements) is restyled on every frame, on or off screen. More than a screen away nobody
  // can see it: there the items take their colour at once, and they get the transition back a screen before view.
  new IntersectionObserver(([e]) => {
    const was = far;
    far = !e.isIntersecting;
    if (far !== was) for (const it of items) it.el.style.transition = far ? "none" : "";
  }, { rootMargin: "100% 0px" }).observe(root);

  new ResizeObserver((entries) => {
    const w = entries[entries.length - 1].contentRect.width;
    if (Math.abs(w - lastW) < 1) return;
    lastW = w;
    relayoutAsk = true;
  }).observe(root);
  document.fonts?.ready.then(() => { relayoutAsk = true; });
  document.fonts?.addEventListener?.("loadingdone", () => { relayoutAsk = true; });

  // ---------- events ----------
  bus.on("thought", (th) => { if (th && th.text) enqueue({ type: "thought", th }); staticDirty = reduced; });
  bus.on("brain:countdown", ({ ms, version: v, period } = {}) => {
    if (Number.isFinite(v) && v !== version && !state.swapping) { version = v; verEl.textContent = verText(v); }
    const win = Math.min(5 * 60e3, (period || 1800e3) / 6);
    setDreaming(version > 0 && ms > 0 && ms <= win && !state.swapping);
  });
  bus.on("brain:swap:start", () => { setDreaming(false); setStage("deploy"); });
  bus.on("brain:swap:mid", ({ from, to } = {}) => enqueue({ type: "divider", from, to }));
  bus.on("brain:swap:done", ({ version: v } = {}) => {
    if (Number.isFinite(v)) { version = v; verEl.textContent = verText(v); }
    root.classList.add("is-fresh");
    setTimeout(() => root.classList.remove("is-fresh"), 2400);
  });

  // ---------- seed: the last few thoughts are already there when you arrive ----------
  setBeadKind(beads[0], "lit");
  // only real thoughts: before launch the stream says it is empty (the simulator brings its own when it runs)
  const past = state.thoughts.slice(-4);
  if (!past.length) {
    const empty = document.createElement("p");
    empty.className = "th__empty";
    empty.textContent = "No thoughts yet. I start thinking when the coin goes live.";
    stream.appendChild(empty);
    bus.on("thought", () => empty.remove());
  }
  for (const th of past) {
    const it = makeThought(th, true);
    insert(it, true);
    if (it.stage) setStage(it.stage);
  }
  chain.spark = null;
  updateAgo();
}
