// The live feed for the site: a drop-in for ./sim.js with the same exports (`state`, `createSim`) and the same bus events,
// fed by Turri's backend (backend/feed) instead of the simulator.
//
// Install: copy this file to site/js/data/live.js, set `api` in site/js/data/config.js to the feed's base URL, and in
// site/js/main.js import { state, createSim } from "./data/live.js" instead of "./data/sim.js".
//
// How it works: before any module starts (top-level await), it reads GET {api}/state, so every module boots on the real
// hooks, journal, thoughts and vault, never on the demo content. start() then follows GET {api}/stream (SSE) and puts each
// event on the bus after changing `state` exactly the way sim.js does before it emits. brain:countdown is emitted here
// four times a second from the server's clock (the server sends it once a second, which only corrects the clock). The
// ceremony (brain:swap:start/mid/done) comes from the server when a new brain is really on chain.
// Before the first brain (version 0) the feed is empty, and so is the page: no numbers, thoughts or versions are made
// up. The first brain's tentacles show as waiting (`planned`) and turn real with the first release. If the feed does not
// answer at boot, the page starts on that same empty state and reloads once the feed is back. The simulator runs only
// where config.api is null (local development without ?api); there `live` is false and the page says it is a preview.
import { config } from "./config.js";
import { HOOKS, FIRST_HOOKS } from "./content.js";
import * as sim from "./sim.js";

const api = config.api && config.live ? String(config.api).replace(/\/+$/, "") : null;
const BOOT_TIMEOUT = 2500; // the whole page waits for this at boot: one try, short, then the simulator
const MAX_THOUGHTS = 40;

async function getJson(url, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const t0 = Date.now();
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`${url} ${r.status}`);
    const j = await r.json();
    return { j, rtt: Date.now() - t0 };
  } finally {
    clearTimeout(t);
  }
}

async function boot() {
  if (!api) return null;
  try {
    return await getJson(`${api}/state`, BOOT_TIMEOUT);
  } catch (err) {
    console.warn("[live] the feed did not answer, running the simulator", err);
    return null;
  }
}

const booted = await boot();

// When the feed is down at page load the simulator runs, and its numbers are made up. Keep asking quietly; once the feed
// answers, reload so the page boots on the real state (never while someone is typing, never in a background tab).
if (api && !booted) {
  const typing = () => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || "");
  const reload = () => (typing() || document.hidden ? setTimeout(reload, 3000) : location.reload());
  const retry = () => getJson(`${api}/state`, BOOT_TIMEOUT).then(reload, () => setTimeout(retry, 8000));
  setTimeout(retry, 8000);
}
// server time minus this browser's time (half the round trip is the request's age)
let offset = booted ? (Number.isFinite(+booted.j.serverNow) ? +booted.j.serverNow : Date.now()) + booted.rtt / 2 - Date.now() : 0;
const local = (serverMs) => serverMs - offset;

// ---------- what the feed may say ----------
// The feed is a server on the internet, so everything it sends is checked and typed here, once, before any module sees
// it: numbers are numbers, hooks are the catalogue's (their words come from content.js, never from the feed), text is a
// plain string, and the coin address is shown only if it is the one this site was built for (see acceptCa). Modules put
// some of these values into HTML, so a string where a number belongs must never reach them.
const num = (x, d = 0) => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : d;
};
const int = (x, d = 0) => Math.trunc(num(x, d));
const str = (x, max = 600) => (x == null ? "" : String(x)).slice(0, max);
const isHook = (id) => typeof id === "string" && Object.prototype.hasOwnProperty.call(HOOKS, id);
const hookIds = (a) => (Array.isArray(a) ? a.filter(isHook) : []);
const hookOrNull = (id) => (isHook(id) ? id : null);
const KINDS = new Set(["look", "idea", "test", "decide", "deploy", "self"]);
const ACT_KINDS = new Set(["fees", "burn", "pay", "draw", "win", "alloc"]);
const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const LOCAL = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

// a hook card: the words are the site's own, the feed only says which hook, since when, and its live number
function card(h) {
  if (!h || !isHook(h.id)) return null;
  const c = { ...HOOKS[h.id], id: h.id, since: local(num(h.since, Date.now() + offset)) };
  if (h.version != null) c.version = int(h.version);
  if (typeof h.value === "number" && Number.isFinite(h.value)) c.value = h.value;
  return c;
}
const cards = (list) => (Array.isArray(list) ? list.map(card).filter(Boolean) : []);
// the first brain's tentacles, before it exists: drawn, but marked as starting at launch
const planned = () => FIRST_HOOKS.filter(isHook).map((id) => ({ ...HOOKS[id], id, planned: true }));
function entry(j) {
  const at = num(j?.at, Date.now() + offset);
  return {
    v: int(j?.v),
    at: local(at),
    minutesAgo: Math.max(0, Math.round((Date.now() + offset - at) / 60000)),
    title: str(j?.title, 160),
    added: hookIds(j?.added),
    removed: hookIds(j?.removed),
    lines: Math.max(0, int(j?.lines)),
    hash: str(j?.hash, 24).replace(/[^0-9a-fA-F.…]/g, ""),
    diff: Array.isArray(j?.diff) ? j.diff.slice(0, 400).map((l) => str(l, 400)) : [],
  };
}
function thoughtOf(t) {
  const x = {
    id: str(t?.id, 80),
    kind: KINDS.has(t?.kind) ? t.kind : "self",
    text: str(t?.text, 600),
    at: local(num(t?.at, Date.now() + offset)),
    version: int(t?.version),
  };
  if (t?.seq != null) x.seq = int(t.seq);
  if (t?.topic != null) x.topic = str(t.topic, 40);
  return x;
}
// what the brain did on chain: fees in, a burn, a payout, a draw. The transaction is a signature or nothing, the
// wallet an address or nothing, so a link built from them can only ever point at the explorer's page for them.
function actOf(a) {
  if (!a || !ACT_KINDS.has(a.kind)) return null;
  return {
    id: str(a.id, 120),
    kind: a.kind,
    hook: hookOrNull(a.hook),
    sol: Math.max(0, num(a.sol)),
    tokens: Math.max(0, num(a.tokens)),
    to: B58.test(str(a.to, 64)) ? str(a.to, 64) : "",
    note: str(a.note, 200),
    tx: SIG.test(str(a.tx, 100)) ? str(a.tx, 100) : "",
    at: local(num(a.at, Date.now() + offset)),
    version: int(a.version),
  };
}
const MAX_ACTS = 60;
const VAULT_KEYS = ["feesSol", "burnedTokens", "holders", "paidSol", "versions", "lastFee"];
function vaultOf(v) {
  const out = {};
  for (const k of VAULT_KEYS) if (v && v[k] != null) out[k] = num(v[k]);
  const hooks = {};
  if (v && v.hooks && typeof v.hooks === "object") for (const [k, x] of Object.entries(v.hooks)) if (isHook(k) && typeof x === "number" && Number.isFinite(x)) hooks[k] = x;
  return { out, hooks };
}
const swapOf = (p) => ({ from: int(p?.from), to: int(p?.to), add: hookOrNull(p?.add?.id ?? p?.add), remove: hookOrNull(p?.remove) });

// The coin address the feed sends is shown only if it is this site's coin: config.ca itself, or before launch (when
// the address must stay secret) config.caHash, the SHA-256 hex of it. Anything else is ignored, so a broken or hijacked
// feed can never put a fake address on the page. On localhost, for testing, the feed's address is shown.
async function acceptCa(ca) {
  ca = str(ca, 64);
  if (!B58.test(ca)) return false;
  if (config.ca) return ca === config.ca;
  if (LOCAL) return true;
  if (!config.caHash || !globalThis.crypto?.subtle) return false;
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ca));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("") === String(config.caHash).trim().toLowerCase();
}

function fromBoot(b) {
  // the vault's per-hook numbers belong on the cards (hook.value), not in state.vault
  const { out: vault, hooks: values } = vaultOf(b.vault);
  const hooks = cards(b.hooks);
  for (const h of hooks) if (typeof values[h.id] === "number") h.value = values[h.id];
  const version = Math.max(0, int(b.version));
  return {
    hooks: hooks.length || version > 0 ? hooks : planned(),
    version,
    nextSwapAt: local(num(b.nextSwapAt, Date.now() + offset + config.brainMinutes * 60000)),
    swapping: b.swapping === true,
    thoughts: (Array.isArray(b.thoughts) ? b.thoughts : []).slice(-MAX_THOUGHTS).map(thoughtOf),
    journal: (Array.isArray(b.journal) ? b.journal : []).map(entry),
    acts: (Array.isArray(b.acts) ? b.acts : []).map(actOf).filter(Boolean).slice(-MAX_ACTS),
    vault: { feesSol: 0, burnedTokens: 0, holders: 0, paidSol: 0, versions: 0, ...vault },
  };
}

if (booted?.j.ca && await acceptCa(booted.j.ca)) config.ca = str(booted.j.ca, 64);

// no answer at boot: the empty state, never the simulator's made-up numbers (the page reloads once the feed answers)
const EMPTY = { version: 0, hooks: [], thoughts: [], journal: [], acts: [], vault: {} };
export const state = booted ? fromBoot(booted.j) : api ? fromBoot(EMPTY) : sim.state;
export const live = !!api;

export function createSim(args) {
  return api ? createLive(args, booted ? booted.j : EMPTY) : sim.createSim(args);
}

function createLive({ bus }, b) {
  let period = num(b.period, config.brainMinutes * 60000) || config.brainMinutes * 60000;
  let seq = Math.max(0, int(b.seq));
  let es = null;
  let ticker = null;

  const setHookValues = (values) => {
    for (const h of state.hooks) if (typeof values[h.id] === "number") h.value = values[h.id];
  };

  // each handler changes `state` first, then emits, in sim.js's order
  const on = {
    thought(t) {
      const x = thoughtOf(t);
      state.thoughts.push(x);
      if (state.thoughts.length > MAX_THOUGHTS) state.thoughts.shift();
      bus.emit("thought", x);
    },
    "hooks:set"(list) {
      if (!Array.isArray(list)) return;
      state.hooks = cards(list);
      bus.emit("hooks:set", state.hooks);
    },
    "hook:add"({ hook, version }) {
      const h = card(hook);
      if (!h) return;
      state.hooks = state.hooks.filter((x) => x.id !== h.id);
      state.hooks.push(h);
      bus.emit("hook:add", { hook: h, version: int(version) });
    },
    "hook:remove"({ id, version }) {
      if (!isHook(id)) return;
      state.hooks = state.hooks.filter((h) => h.id !== id);
      bus.emit("hook:remove", { id, version: int(version) });
    },
    "brain:swap:start"(p) {
      state.swapping = true;
      bus.emit("brain:swap:start", swapOf(p));
    },
    "brain:swap:mid"(p) {
      bus.emit("brain:swap:mid", swapOf(p));
    },
    "journal:add"(j) {
      const e = entry(j);
      if (state.journal.some((x) => x.v === e.v)) return;
      state.version = Math.max(state.version, e.v);
      state.journal.push(e);
      state.vault.versions = state.version;
      bus.emit("journal:add", e);
    },
    "brain:swap:done"(p) {
      const version = int(p?.version, state.version);
      state.swapping = false;
      state.version = Math.max(state.version, version);
      state.nextSwapAt = p?.nextSwapAt != null ? local(num(p.nextSwapAt, Date.now() + offset + period)) : Date.now() + period;
      // the first brain is here: a waiting tentacle it did not grow drops off
      if (state.version > 0) for (const h of state.hooks.filter((x) => x.planned)) on["hook:remove"]({ id: h.id, version: state.version });
      bus.emit("brain:swap:done", { version });
    },
    act(a) {
      const x = actOf(a);
      if (!x || state.acts.some((y) => y.id && y.id === x.id)) return;
      state.acts.push(x);
      if (state.acts.length > MAX_ACTS) state.acts.shift();
      bus.emit("act", x);
    },
    vault(v) {
      const { out, hooks } = vaultOf(v);
      Object.assign(state.vault, out);
      setHookValues(hooks);
      bus.emit("vault", { ...state.vault, lastFee: out.lastFee ?? 0 });
    },
    // the server's countdown only corrects the clock and the period; the bus gets it from the ticker below
    "brain:countdown"(c) {
      if (num(c?.period) > 0) period = num(c.period);
      if (!state.swapping && num(c?.ms) > 0) state.nextSwapAt = Date.now() + num(c.ms);
      const v = int(c?.version, -1);
      if (!state.swapping && v > state.version) state.version = v;
    },
    ca({ ca }) {
      acceptCa(ca).then((ok) => {
        if (!ok) { console.warn("[live] the feed sent a coin address that is not this site's; ignored"); return; }
        config.ca = str(ca, 64);
        document.querySelectorAll('[data-bind="ca"]').forEach((el) => { el.textContent = config.ca; });
        // Buy and Chart now point at the coin (config.links follows config.ca)
        document.querySelectorAll('[data-bind-href="links.pump"]').forEach((el) => { el.href = config.links.pump; });
        document.querySelectorAll('[data-bind-href="links.chart"]').forEach((el) => { el.href = config.links.chart; });
      });
    },
    // too far behind for a replay: read the whole state again and say what changed
    async resync() {
      try {
        const { j, rtt } = await getJson(`${api}/state`, 8000);
        offset = num(j.serverNow, Date.now()) + rtt / 2 - Date.now();
        seq = Math.max(seq, int(j.seq));
        const next = fromBoot(j);
        for (const e of next.journal) if (!state.journal.some((x) => x.v === e.v)) { state.journal.push(e); bus.emit("journal:add", e); }
        state.version = next.version;
        state.nextSwapAt = next.nextSwapAt;
        state.swapping = next.swapping;
        state.hooks = next.hooks;
        bus.emit("hooks:set", state.hooks);
        Object.assign(state.vault, next.vault);
        bus.emit("vault", { ...state.vault, lastFee: 0 });
      } catch (err) {
        console.warn("[live] resync failed", err);
      }
    },
  };

  function connect() {
    if (typeof EventSource === "undefined") return;
    es = new EventSource(`${api}/stream?since=${seq}`);
    for (const name of Object.keys(on)) {
      es.addEventListener(name, (ev) => {
        const id = Number(ev.lastEventId);
        if (ev.lastEventId && Number.isFinite(id)) {
          if (id <= seq && name !== "brain:countdown") return; // already seen (a replay overlap)
          seq = Math.max(seq, id);
        }
        let data;
        try { data = JSON.parse(ev.data); } catch { return; }
        try { on[name](data); } catch (err) { console.warn(`[live] ${name}`, err); }
      });
    }
    // EventSource reconnects by itself and sends Last-Event-ID; the feed replays what was missed
  }

  function tick() {
    const ms = state.swapping ? 0 : Math.max(0, state.nextSwapAt - Date.now());
    bus.emit("brain:countdown", { ms, version: state.version, period });
  }

  return {
    start() {
      bus.emit("hooks:set", state.hooks);
      connect();
      tick();
      ticker = setInterval(tick, 250);
    },
    // the brain changes when the chain says so, not on a click
    swapNow() {
      console.info("[live] the next brain comes from the chain; swapNow does nothing in live mode");
    },
    // a local thought (the ask box hands one in): shown here only, never sent anywhere
    think(kind, text) {
      on.thought({ id: `local-${Date.now()}`, kind, text, at: Date.now() + offset, version: state.version });
    },
    stop() {
      es?.close();
      clearInterval(ticker);
    },
  };
}
