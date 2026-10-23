// live-window (#live-window): what I'm doing right now, in a small ink window in the corner, on every screen.
// On the surface (and on phones) it is a pill: one of my eyes, "live" and the newest line. Below the surface it opens
// into a window with the last three lines (thoughts, burns, fees, new brains) and a way into the whole live feed
// (config.feedPage, live.turri.xyz). It steps aside for the swap ceremony's pip and for the ask box at the bottom.
// Before launch (the simulator is running) it says the numbers are a preview.
// Budget: sizes come from a ResizeObserver, the ink outline is rebuilt only while it is on screen and only when it
// changed (setAttr), and nothing runs per frame for the list itself.
import { live } from "../data/live.js";
import { ago, backlog, fromAct, fromJournal, fromThought, txUrl } from "../data/feedfmt.js";
import { setAttr } from "../core/dom.js";
import { startEyes } from "../core/eyes.js";

const SHOW = 3;
const GAP_MS = 1400;       // at most one new line this often: a busy minute queues instead of flickering
const FOLD_KEY = "turri.lw.fold";

export function init(ctx) {
  const { bus, ink, config, state, loop, scroll } = ctx;
  const mount = document.getElementById("live-window");
  if (!mount) return;
  const reduced = !!ctx.reduced;
  const phone = () => matchMedia("(max-width: 720px)").matches;
  let folded = false;
  try { folded = localStorage.getItem(FOLD_KEY) === "1"; } catch {}

  const el = (tag, cls, parent, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    parent?.appendChild(n);
    return n;
  };
  const svgNS = "http://www.w3.org/2000/svg";
  const inkBack = (parent) => {
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "lw__ink");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(svgNS, "path");
    svg.appendChild(path);
    parent.prepend(svg);
    return { svg, path, w: 0, h: 0, seed: Math.random() * 10 };
  };
  // one of my eyes: it blinks now and then, and it is the "live" light
  const eye = (parent) => {
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "lw__eye");
    svg.setAttribute("viewBox", "-7 -7 14 14");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = '<g class="lw__lid"><circle r="6" class="lw__white"/><circle r="2.9" cx=".8" cy="1" class="lw__pupil"/></g>';
    parent.appendChild(svg);
    return svg;
  };

  mount.className = "lw";
  mount.setAttribute("aria-label", "Live feed");
  const feedHref = config.feedPage || "live.html";

  // ---------- the pill ----------
  const pill = el("a", "lw__pill", mount);
  pill.href = feedHref;
  const pillInk = inkBack(pill);
  eye(pill);
  el("span", "lw__live", pill, "live");
  const pillText = el("span", "lw__pill-text", pill, "");
  const pillNote = el("span", "lw__pill-note", pill, live ? "" : "preview");

  // ---------- the window ----------
  const win = el("div", "lw__win", mount);
  const winInk = inkBack(win);
  const head = el("a", "lw__head", win);
  head.href = feedHref;
  eye(head);
  el("span", "lw__live", head, "live");
  const brainEl = el("span", "lw__brain", head, "");
  const fold = el("button", "lw__fold", win, "");
  fold.type = "button";
  fold.setAttribute("aria-label", "Fold the live window");
  const list = el("ol", "lw__list", win);
  const foot = el("div", "lw__foot", win);
  const open = el("a", "lw__open", foot, "Open the live feed");
  open.href = feedHref;
  if (!live) el("p", "lw__note", foot, "Preview. Until launch the numbers come from a simulator.");

  fold.addEventListener("click", (e) => {
    e.preventDefault();
    folded = true;
    try { localStorage.setItem(FOLD_KEY, "1"); } catch {}
    apply(true);
  });
  pill.addEventListener("click", (e) => {
    // a folded window opens again on the first click; after that the pill goes to the feed
    if (folded && !phone() && wantsWindow()) {
      e.preventDefault();
      folded = false;
      try { localStorage.removeItem(FOLD_KEY); } catch {}
      apply(true);
    }
  });

  // ---------- the lines ----------
  const shown = [];        // newest first: { item, li, agoEl }
  const queue = [];
  let lastShown = 0;

  function lineOf(item, fresh) {
    const li = el("li", `lw__item lw__item--${item.kind}${fresh && !reduced ? " is-new" : ""}`);
    const meta = el("span", "lw__meta", li);
    el("span", "lw__tag", meta, item.tag);
    const agoEl = el("time", "lw__ago", meta, ago(Date.now() - item.at));
    const text = el("span", "lw__text", li, item.text);
    if (item.tx) {
      const a = el("a", "lw__tx", li, "tx");
      a.href = txUrl(item.tx);
      a.target = "_blank";
      a.rel = "noopener";
    }
    void text;
    return { item, li, agoEl };
  }

  function put(item, fresh) {
    if (shown.some((s) => s.item.id === item.id)) return;
    const s = lineOf(item, fresh);
    list.prepend(s.li);
    shown.unshift(s);
    while (shown.length > SHOW) shown.pop().li.remove();
    pillText.textContent = item.text;
    if (fresh) { requestAnimationFrame(() => s.li.classList.remove("is-new")); apply(); }
  }

  for (const item of backlog(state, SHOW).reverse()) put(item, false);

  function offer(item) {
    if (!item || !item.text) return;
    if (queue.some((q) => q.id === item.id) || shown.some((s) => s.item.id === item.id)) return;
    queue.push(item);
    if (queue.length > 8) queue.shift();
  }
  bus.on("thought", (t) => offer(fromThought(t)));
  bus.on("act", (a) => offer(fromAct(a)));
  bus.on("journal:add", (e) => offer(fromJournal(e)));

  setInterval(() => {
    const now = Date.now();
    for (const s of shown) {
      const txt = ago(now - s.item.at);
      if (s.agoEl.textContent !== txt) s.agoEl.textContent = txt;
    }
  }, 5000);

  bus.on("brain:countdown", ({ ms, version }) => {
    const m = Math.floor(ms / 60000), sec = Math.floor((ms % 60000) / 1000);
    const txt = !(version > 0) ? "first brain at launch" : state.swapping ? `v${version}, swapping brains` : `brain v${version} · next ${m}:${String(sec).padStart(2, "0")}`;
    if (brainEl.textContent !== txt) brainEl.textContent = txt;
  });

  // ---------- where it is ----------
  // the loader may have finished before this module started (it inits last): main.js marks the body then
  let ready = document.body.classList.contains("is-loaded"), swapUntil = 0, mode = "";
  bus.on("loader:done", () => { ready = true; apply(); });
  bus.on("brain:swap:start", () => { swapUntil = performance.now() + 6800; apply(); });
  bus.on("brain:swap:done", () => setTimeout(() => apply(), 800));
  // open below the surface; a pill again where the page already shows my thoughts (#thinking) and at the very bottom
  const wantsWindow = () => scroll.y > innerHeight * 0.55 && scroll.section !== "thinking";

  function apply(force = false) {
    // nothing has happened yet (before launch): no window with nothing in it
    const hidden = !ready || !shown.length || performance.now() < swapUntil || scroll.section === "abyss";
    const next = hidden ? "hidden" : phone() || folded || !wantsWindow() ? "pill" : "window";
    if (next === mode && !force) return;
    mode = next;
    mount.dataset.mode = mode;
    if (mode === "window") { winInk.dirty = true; }
    if (mode === "pill") { pillInk.dirty = true; }
  }

  // ---------- the ink around it ----------
  // A loose closed brush shape around the box, its edge breathing a little: ink, not a rounded rectangle.
  function outline(b, t) {
    const { w, h } = b;
    if (w < 8 || h < 8) return "";
    const r = Math.min(22, h / 2.2);
    const pts = [];
    const step = 26;
    const edge = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.round(len / step));
      for (let i = 0; i < n; i++) {
        const u = i / n;
        pts.push({ x: x0 + (x1 - x0) * u, y: y0 + (y1 - y0) * u });
      }
    };
    const corner = (cx, cy, a0) => {
      for (let i = 0; i < 4; i++) {
        const a = a0 + (i / 4) * (Math.PI / 2);
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
    };
    edge(r, 0, w - r, 0); corner(w - r, r, -Math.PI / 2);
    edge(w, r, w, h - r); corner(w - r, h - r, 0);
    edge(w - r, h, r, h); corner(r, h - r, Math.PI / 2);
    edge(0, h - r, 0, r); corner(r, r, Math.PI);
    const amp = reduced ? 0 : 1.3;
    const moved = pts.map((p, i) => {
      const k = i * 0.9 + b.seed;
      const wob = Math.sin(k + t * 0.9) * amp + Math.sin(k * 2.3 - t * 0.6) * amp * 0.5;
      // push each point outward a little: the ink bleeds past the box
      const dx = p.x - w / 2, dy = p.y - h / 2, d = Math.hypot(dx, dy) || 1;
      return { x: p.x + (dx / d) * wob, y: p.y + (dy / d) * wob };
    });
    const m = ink.blob(moved).match(/ d="([^"]+)"/);
    return m ? m[1] : "";
  }

  const ro = new ResizeObserver((es) => {
    for (const e of es) {
      const b = e.target === pill ? pillInk : winInk;
      const box = e.borderBoxSize?.[0];
      b.w = Math.round(box ? box.inlineSize : e.contentRect.width);
      b.h = Math.round(box ? box.blockSize : e.contentRect.height);
      b.svg.setAttribute("viewBox", `-4 -4 ${b.w + 8} ${b.h + 8}`);
      b.dirty = true;
    }
  });
  ro.observe(pill);
  ro.observe(win);

  // On the surface the countdown ring may hang low enough to touch the pill: then the pill moves right of it.
  // Read in the read phase (no forced layout), written with the other writes; phones keep the corner.
  // the ring itself (.cd__jar), not the whole countdown: Turri's line beside it leaves room under it
  const cdBox = document.getElementById("countdown");
  let cd = null;
  let shift = 0, shiftShown = -1;
  loop.read(() => {
    cd = cd || cdBox?.querySelector(".cd__jar") || null;
    if (!cd || mode !== "pill" || phone() || scroll.y > innerHeight) { shift = 0; return; }
    const r = cd.getBoundingClientRect();
    const h = pill.offsetHeight || 40;
    // the corner the pill hangs from, as css/live-window.css places it (not its rect: that moves while it slides)
    const left = Math.min(24, Math.max(12, innerWidth * 0.016));
    const pillTop = innerHeight - h - Math.min(22, Math.max(12, innerHeight * 0.018)) - 6;
    shift = r.bottom > pillTop && r.top < innerHeight && r.left < left + (pill.offsetWidth || 300) ? Math.max(0, Math.round(r.right + 18 - left)) : 0;
  });

  let acc = 0;
  loop.add((t, dt) => {
    apply();
    if (shift !== shiftShown) {
      shiftShown = shift;
      mount.style.transform = shift ? `translateX(${shift}px)` : "";
    }
    const now = Date.now();
    if (queue.length && now - lastShown > GAP_MS) {
      lastShown = now;
      put(queue.shift(), true);
    }
    if (mode === "hidden") return;
    const b = mode === "window" ? winInk : pillInk;
    acc += dt;
    // the edge breathes at about 15 frames a second: enough for ink, cheap for the frame
    if (!b.dirty && (reduced || acc < 1 / 15)) return;
    acc = 0;
    b.dirty = false;
    setAttr(b.path, "d", outline(b, t));
  });

  apply(true);
  startEyes({ reduced });
}
