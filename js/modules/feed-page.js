// feed-page (live.html, live.turri.xyz): the whole live feed. Everything I think and everything I do on chain, newest
// first, with an ink divider wherever one brain handed over to the next. Beside it: me, the countdown to the next brain,
// the vault's numbers and the tentacles that are live. Before launch (the simulator runs) it says so at the top.
// Feed text goes on the page with textContent only; a link is built only from a checked signature (data/live.js).
import { live } from "../data/live.js";
import { HOOKS } from "../data/content.js";
import { ago, backlog, compact, fromAct, fromJournal, fromThought, sol, txUrl } from "../data/feedfmt.js";
import { startEyes } from "../core/eyes.js";

const KEEP = 300;

const clock = (ms) => {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((x) => String(x).padStart(2, "0")).join(":");
};

export function init(ctx) {
  const { bus, ink, state, config } = ctx;
  const list = document.getElementById("feed");
  if (!list) return;
  const reduced = !!ctx.reduced;
  if (!live) document.getElementById("fp-preview")?.removeAttribute("hidden");

  const el = (tag, cls, parent, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    parent?.appendChild(n);
    return n;
  };
  const svgNS = "http://www.w3.org/2000/svg";

  // ---------- the stream ----------
  const items = [];   // newest first: { item, li }
  const agos = [];

  // a hand-drawn ink line across the column, never the same twice
  function divider(text) {
    const li = el("li", "fp-div");
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "fp-div__ink");
    svg.setAttribute("viewBox", "0 0 400 10");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");
    const pts = [];
    const s = Math.random() * 10;
    for (let i = 0; i <= 12; i++) pts.push(ink.P(4 + (i / 12) * 392, 5 + Math.sin(i * 0.9 + s) * 1.6));
    const path = document.createElementNS(svgNS, "path");
    path.setAttribute("d", ink.brush(ink.spline(pts, false, 10), (t) => 0.5 + 2.4 * Math.sin(Math.PI * t) ** 0.7));
    svg.appendChild(path);
    li.appendChild(svg);
    el("span", "fp-div__t", li, text);
    return li;
  }

  function row(item) {
    const li = el("li", `fp-i fp-i--${item.kind}`);
    li.dataset.kind = item.kind;
    const time = el("time", "fp-i__time", li, clock(item.at));
    time.dateTime = new Date(item.at).toISOString();
    el("span", "fp-i__tag", li, item.tag);
    const body = el("p", "fp-i__text", li, item.text);
    const meta = el("span", "fp-i__meta", li);
    const agoEl = el("span", "fp-i__ago", meta, ago(Date.now() - item.at));
    if (item.tx) {
      const a = el("a", "fp-i__tx", meta, "transaction");
      a.href = txUrl(item.tx);
      a.target = "_blank";
      a.rel = "noopener";
    }
    if (item.hash) el("span", "fp-i__hash", meta, item.hash);
    agos.push({ el: agoEl, at: item.at });
    void body;
    return li;
  }

  // the version a line belongs to: a brain line is its own version, anything else the brain that was live
  const verOf = (item) => (item.kind === "brain" ? item.v : item.v || 0);

  function add(item, fresh) {
    if (!item || !item.text || items.some((x) => x.item.id === item.id)) return;
    const top = items[0];
    // a new brain above the lines of the last one: the hand-over gets its divider
    if (fresh && top && verOf(item) && verOf(top.item) && verOf(item) !== verOf(top.item)) list.prepend(divider(`brain v${verOf(top.item)} → v${verOf(item)}, ${clock(item.at).slice(0, 5)}`));
    const li = row(item);
    if (fresh && !reduced) li.classList.add("is-new");
    list.prepend(li);
    items.unshift({ item, li });
    if (fresh && !reduced) requestAnimationFrame(() => requestAnimationFrame(() => li.classList.remove("is-new")));
    while (items.length > KEEP) items.pop().li.remove();
  }

  // the backlog, oldest first so the dividers fall where the brains changed
  const past = backlog(state, 120).reverse();
  let prevV = null;
  for (const item of past) {
    const v = verOf(item);
    if (prevV !== null && v && v !== prevV) list.prepend(divider(`brain v${prevV} → v${v}, ${clock(item.at).slice(0, 5)}`));
    if (v) prevV = v;
    add(item, false);
  }

  // before launch nothing has happened yet: one quiet line instead of an empty column
  let emptyEl = null;
  if (!items.length && live) {
    emptyEl = el("li", "fp-empty", list, "Nothing yet. I start thinking and moving the moment the coin goes live.");
  }
  const added = () => { if (emptyEl) { emptyEl.remove(); emptyEl = null; } };
  bus.on("thought", (t) => { added(); add(fromThought(t), true); });
  bus.on("act", (a) => { added(); add(fromAct(a), true); });
  bus.on("journal:add", (e) => { added(); add(fromJournal(e), true); });

  setInterval(() => {
    const now = Date.now();
    for (const a of agos) {
      if (!a.el.isConnected) continue;
      const t = ago(now - a.at);
      if (a.el.textContent !== t) a.el.textContent = t;
    }
    for (let i = agos.length - 1; i >= 0; i--) if (!agos[i].el.isConnected) agos.splice(i, 1);
  }, 5000);

  // ---------- filters ----------
  const filters = document.querySelectorAll(".fp__f");
  filters.forEach((b) => b.addEventListener("click", () => {
    filters.forEach((x) => x.classList.toggle("is-on", x === b));
    list.dataset.f = b.dataset.f;
  }));
  list.dataset.f = "all";

  // ---------- the vault ----------
  const vaultEl = document.getElementById("fp-vault");
  const STATS = [
    ["feesSol", "Fees collected", (v) => `${sol(v)} SOL`],
    ["burnedTokens", "Burned", (v) => `${compact(v)} TRXE`],
    ["holders", "Holders", (v) => compact(v)],
    ["paidSol", "Paid out", (v) => `${sol(v)} SOL`],
    ["versions", "Brains so far", (v) => String(Math.round(v))],
  ];
  const cells = {};
  if (vaultEl) {
    for (const [k, label] of STATS) {
      const wrap = el("div", "fp__stat", vaultEl);
      el("dt", "fp__k", wrap, label);
      cells[k] = el("dd", "fp__v", wrap, "");
    }
  }
  function paintVault(v) {
    for (const [k, , f] of STATS) {
      const c = cells[k];
      if (!c) continue;
      const txt = f(Number(v[k]) || 0);
      if (c.textContent !== txt) c.textContent = txt;
    }
  }
  paintVault(state.vault);
  bus.on("vault", paintVault);

  // ---------- the tentacles ----------
  const hooksEl = document.getElementById("fp-hooks");
  const hooksK = document.querySelector(".fp__hooks .fp__k");
  function paintHooks() {
    if (!hooksEl) return;
    hooksEl.textContent = "";
    if (hooksK) hooksK.textContent = state.hooks.some((h) => h.planned) ? "Tentacles at launch" : "Tentacles live now";
    for (const h of state.hooks) {
      const li = el("li", "fp__chip", hooksEl, HOOKS[h.id]?.name || h.id);
      li.title = h.planned ? "Starts at launch" : HOOKS[h.id]?.rule || "";
      if (h.planned) li.classList.add("is-planned");
    }
  }
  paintHooks();
  bus.on("hooks:set", paintHooks);
  bus.on("hook:add", paintHooks);
  bus.on("hook:remove", paintHooks);

  startEyes({ reduced });
  void config;
}
