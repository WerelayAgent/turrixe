// Boot: build the shared context, start every module, then start the live feed.
// URL flags: ?skipLoader  ?only=hero-jelly,thoughts (init only these)  ?section=thinking  ?demo (brain every 90 s)
import { bus } from "./core/bus.js";
import { loop } from "./core/loop.js";
import { pointer } from "./core/pointer.js";
import { scroll, initScroll } from "./core/scroll.js";
import * as ink from "./core/ink.js";
import { config } from "./data/config.js";
import * as content from "./data/content.js";
import { state, createSim } from "./data/live.js"; // the live feed when config.api answers, else the simulator
import { initBoil } from "./core/boil.js";

const params = new URLSearchParams(location.search);

// ?debug prints every error onto the page so headless screenshots show them
if (params.has("debug")) {
  const box = document.createElement("pre");
  box.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9999;max-width:60vw;max-height:40vh;overflow:auto;margin:0;padding:8px 10px;background:#000;color:#ff7a7a;font:12px/1.4 monospace;white-space:pre-wrap;display:none";
  document.documentElement.appendChild(box);
  const show = (msg) => { box.style.display = "block"; box.textContent += `${msg}\n`; };
  addEventListener("error", (e) => {
    if (/ResizeObserver loop/.test(e.message)) return; // benign browser notice, not a bug
    show(`error: ${e.message} @ ${e.filename?.split("/").pop()}:${e.lineno}`);
  });
  addEventListener("unhandledrejection", (e) => show(`rejection: ${e.reason?.stack || e.reason}`));
  const warn = console.warn.bind(console), err = console.error.bind(console);
  console.warn = (...a) => { show(`warn: ${a.map(String).join(" ")}`); warn(...a); };
  console.error = (...a) => { show(`error: ${a.map((x) => x?.stack || String(x)).join(" ")}`); err(...a); };
}

// Order matters: the loader covers the page first; background layers next; the rest after.
// The live feed page (live.html, live.turri.xyz: <body data-page="live">) runs the same Turri in a smaller set.
const PAGE = document.body.dataset.page || "home";
const MODULES = PAGE === "live"
  ? ["water", "crowd", "cursor", "hero-jelly", "countdown", "swap", "eggs", "feed-page"]
  : [
    "loader", "water", "crowd", "cursor", "depth", "reveal",
    "hero-jelly", "hero-copy", "countdown",
    "thoughts", "brain-closeup", "hooks", "journal", "crowd-play", "how", "vault",
    "swap", "eggs", "ask", "live-window",
  ];

function bindConfig() {
  const get = (path) => path.split(".").reduce((o, k) => o?.[k], config);
  document.querySelectorAll("[data-bind]").forEach((el) => { el.textContent = get(el.dataset.bind) ?? ""; });
  document.querySelectorAll("[data-bind-href]").forEach((el) => { el.href = get(el.dataset.bindHref) ?? "#"; });
}

let loaderDone = false;
bus.on("loader:done", () => { loaderDone = true; document.body.classList.add("is-loaded"); });
// the live page has no loader: it is loaded the moment it starts
if (params.has("skipLoader") || PAGE === "live") document.body.classList.add("is-loaded");

async function boot() {
  bindConfig();
  const assets = { jelly: await fetch("assets/jelly.json").then((r) => r.json()) };
  const sim = createSim({ bus, config, params });
  const ctx = {
    bus, loop, pointer, scroll, ink, config, content, state, sim, assets, params,
    reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    mobile: matchMedia("(max-width: 720px)").matches,
  };
  window.__turrixe = ctx;
  window.__turri = ctx; // backward compatibility
  if (params.has("boil")) initBoil(ctx); // the shiver filter costs raster time on big SVGs; opt-in only

  const only = params.get("only")?.split(",");
  const without = params.get("without")?.split(","); // dev: ?without=cursor,water finds who costs the frames
  const names = MODULES.filter((name) => (!only || only.includes(name) || name === "loader") && !without?.includes(name));
  // Start every download at once (they used to load one after another and ate the loader's time),
  // but let the loader cover the page first, then init the rest in their fixed order.
  const loads = names.map((name) => import(`./modules/${name}.js`).catch((err) => { console.warn(`[module ${name}]`, err); return null; }));
  for (let i = 0; i < names.length; i++) {
    try {
      const mod = await loads[i];
      // each module gets the shared ctx (writes go to it, e.g. ctx.heroJelly), with a loop that tags its frames for ?perf
      const tagged = loop.for(names[i]);
      await mod?.init?.(new Proxy(ctx, { get: (o, k) => (k === "loop" ? tagged : o[k]) }));
    } catch (err) {
      console.warn(`[module ${names[i]}]`, err);
    }
  }
  initScroll();
  pauseRule();
  // pause CSS loops in sections that are well off screen
  const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("is-off", !e.isIntersecting)), { rootMargin: "150px 0px" });
  document.querySelectorAll("main > .sec").forEach((sec) => io.observe(sec));
  sim.start();
  bus.emit("ready", ctx);
  // With ?skipLoader (or if the loader module never reports), make sure "loader:done" fires exactly once
  if ((params.has("skipLoader") || PAGE === "live") && !loaderDone) bus.emit("loader:done");
  setTimeout(() => { if (!loaderDone) bus.emit("loader:done"); }, 6000);
  const section = params.get("section");
  if (section) requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ behavior: "instant" }));
}

// Sections well off screen pause their CSS animations. ".sec.is-off *" did that by matching every element, so each
// toggle restyled a whole section (1,500 to 3,000 elements, 5 to 7 ms, a dropped frame while scrolling). Only elements
// with a CSS animation care about animation-play-state, so the rule lists exactly the selectors that declare one.
function pauseRule() {
  const sels = [];
  const split = (text) => { // top-level commas only
    const out = [];
    let depth = 0, cur = "", q = "";
    for (const ch of text) {
      if (q) { if (ch === q) q = ""; cur += ch; continue; }
      if (ch === '"' || ch === "'") q = ch;
      else if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth--;
      else if (ch === "," && !depth) { out.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const walk = (rules) => {
    for (const r of rules) {
      if (r instanceof CSSKeyframesRule) continue;
      // by text: a shorthand with var() in it stays unexpanded, so r.style.animationName reads "" for those
      if (r instanceof CSSStyleRule && /(^|[;\s])animation(-name)?\s*:\s*(?!none\s*(;|$))/.test(r.style.cssText)) sels.push(...split(r.selectorText));
      if (r.cssRules) walk(r.cssRules);
    }
  };
  for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch {} }
  // A selector whose subject has no class, id or tag (".jr-e.is-born > *") makes the browser invalidate the whole section
  // again, so for those the parent carries the state in a custom property and the children read it.
  const plain = [], viaParent = [];
  for (const x of new Set(sels)) {
    const m = x.match(/^(.*\S)\s*>\s*\*$/) || x.match(/^(.*[^\s>+~])\s+\*$/);
    if (m && /[.#\w\]]$/.test(m[1])) viaParent.push([m[1], x]); else plain.push(x);
  }
  let css = plain.length ? `${plain.map((x) => `.sec.is-off ${x}`).join(",\n")} { animation-play-state: paused !important; }\n` : "";
  for (const [parent, x] of viaParent) {
    css += `.sec.is-off ${parent} { --off-play: paused; }\n${x} { animation-play-state: var(--off-play, running) !important; }\n`;
  }
  const st = document.createElement("style");
  st.dataset.pause = "";
  st.textContent = css;
  document.head.appendChild(st);
}

boot();
