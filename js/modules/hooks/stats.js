// Numbers for each hook card. On the live feed only real ones: hook.value from the agent (every hook, every 10 s), the
// vault's burns and the journal's entries; anything else is 0 until the agent reports it. In the simulator (local
// development) the numbers are derived from its own state and each hook's rule.
import { live } from "../../data/live.js";

const MIN = 60000;

const SOL_SHARE = { king: 0.2, thinking: 0.05, deepend: 0.1 };
const EVERY = { weather: 22, diamond: 60, tribute: 40, lowtide: 150 };   // minutes per event, from each rule's clock

export function createStats(ctx) {
  const { state } = ctx;
  const t0 = Math.min(...(state.journal.length ? state.journal.map((j) => j.at) : [Date.now() - MIN]));
  // the average fee rate since the first brain, so a hook born an hour ago starts with an hour of fees
  const feeRate = state.vault.feesSol / Math.max(MIN, Date.now() - t0);
  const M = new Map();
  let lastBurned = state.vault.burnedTokens;

  // where a hook came from: the newest journal entry that added it
  function origin(id) {
    for (let i = state.journal.length - 1; i >= 0; i--) {
      const j = state.journal[i];
      if (j.added?.includes(id)) return { v: j.v, at: j.at };
    }
    return null;
  }

  function track(hook, version, at) {
    const o = origin(hook.id);
    const born = at ?? o?.at ?? hook.since ?? Date.now();
    const v = version ?? o?.v ?? state.version;
    const age = Math.max(0, Date.now() - born);
    const m = {
      born, v,
      fees: feeRate * age,                       // SOL that flowed through me since this hook grew
      burns: Math.floor(age / (10 * MIN)),       // the burn runs every 10 minutes
      votes: Math.floor(age / (3 * MIN)),
      shipped: 0,
    };
    M.set(hook.id, m);
    return m;
  }

  function value(hook) {
    if (typeof hook.value === "number") return hook.value;
    if (live) return hook.id === "burn" ? state.vault.burnedTokens : hook.id === "memo" ? state.journal.length : 0;
    const m = M.get(hook.id) || track(hook);
    const id = hook.id, ageMin = (Date.now() - m.born) / MIN;
    if (id === "burn") return state.vault.burnedTokens;
    if (id === "memo") return state.journal.filter((j) => j.at >= m.born - 1000).length;
    if (SOL_SHARE[id]) return m.fees * SOL_SHARE[id];
    if (EVERY[id]) return Math.floor(ageMin / EVERY[id]);
    if (id === "bounty") return m.shipped * 0.5;
    if (id === "vote") return m.votes;
    if (id === "echo") return Math.floor(m.burns * 0.6);
    return Math.floor(ageMin / 30);
  }

  function isSol(hook) { return hook.unit === "SOL"; }
  function format(hook, v) {
    if (isSol(hook)) return v > 0 ? v.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : "0";
    return Math.round(v).toLocaleString("en-US");
  }
  const ONE = { winners: "winner", entries: "entry", switches: "switch", tributes: "tribute", votes: "vote", triggers: "trigger", echoes: "echo" };
  function label(hook, v) {
    const stat = v != null && Math.round(v) === 1 && !isSol(hook) ? ONE[hook.stat] || hook.stat : hook.stat;
    return [hook.unit, stat].filter(Boolean).join(" ");
  }

  // a fee arrived: returns the ids whose numbers moved, the most interesting first
  function onVault(v, liveIds) {
    const moved = [];
    const fee = v?.lastFee ?? 0;
    const burned = v?.burnedTokens ?? lastBurned;
    const didBurn = burned > lastBurned;
    lastBurned = burned;
    if (didBurn && liveIds.includes("burn")) moved.push("burn");
    for (const id of liveIds) {
      const m = M.get(id);
      if (!m) continue;
      m.fees += fee;
      if (didBurn) m.burns++;
      if (id === "vote" && Math.random() < 0.3) { m.votes++; moved.push(id); }
      if (SOL_SHARE[id] && fee > 0) moved.push(id);
      if (id === "echo" && didBurn) moved.push(id);
    }
    return moved;
  }
  // a new hook shipped: the idea bounty pays its author
  function onShip(newId) {
    for (const [id, m] of M) if (id !== newId && id === "bounty") m.shipped++;
  }

  return { track, value, format, label, onVault, onShip, get: (id) => M.get(id), forget: (id) => M.delete(id) };
}

export function ageText(ms) {
  const min = Math.floor(Math.max(0, ms) / MIN);
  if (min < 1) return "grew just now";
  if (min < 60) return `grew ${min} min ago`;
  const h = Math.floor(min / 60), m = min % 60;
  return m < 5 ? `grew ${h} h ago` : `grew ${h} h ${m} min ago`;
}
