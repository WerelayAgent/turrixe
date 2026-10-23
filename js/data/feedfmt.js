// The live feed's events as one line each: the same words on the main page's live window and on the live feed page
// (live.html, live.turri.xyz). Every value comes typed from data/live.js (or the simulator); text is still put on the
// page with textContent only.
import { HOOKS } from "./content.js";

export const compact = (n) => {
  const x = Math.abs(n);
  if (x >= 1e9) return `${(n / 1e9).toFixed(x >= 1e10 ? 0 : 1).replace(/\.0$/, "")}B`;
  if (x >= 1e6) return `${(n / 1e6).toFixed(x >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (x >= 1e3) return `${(n / 1e3).toFixed(x >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
};

/** SOL with as many decimals as it needs, at most four */
export const sol = (x) => {
  const n = Number(x) || 0;
  if (n >= 100) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2).replace(/0$/, "");
  return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, ".0");
};

export const short = (a) => (a && a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a || "");

export function ago(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}

export const txUrl = (tx) => `https://solscan.io/tx/${tx}`;

// a hook's name inside a sentence: "king of the hour"; "I pay for my thinking" keeps its capital I
const hookName = (id) => {
  const n = id && HOOKS[id] ? HOOKS[id].name : "";
  return /^I /.test(n) ? n : n.charAt(0).toLowerCase() + n.slice(1);
};

/** A thought: its kind is the tag */
export function fromThought(t) {
  return { id: `t:${t.id || t.at}`, at: t.at, kind: "thought", tag: t.kind || "self", text: String(t.text || ""), v: t.version };
}

/** A move on chain: fees in, a burn, a payout, a draw, new shares */
export function fromAct(a) {
  const base = { id: `a:${a.id || `${a.kind}:${a.at}`}`, at: a.at, kind: "act", tx: a.tx || "", v: a.version };
  switch (a.kind) {
    case "burn":
      return { ...base, tag: "burn", text: `Burned ${compact(a.tokens)} TRXE with ${sol(a.sol)} SOL of my fees.` };
    case "fees":
      return { ...base, tag: "fees", text: `${sol(a.sol)} SOL of creator fees came in.` };
    case "pay": {
      const h = hookName(a.hook);
      return { ...base, tag: h || "paid", text: `Paid ${sol(a.sol)} SOL to ${short(a.to) || "a holder"}${h ? `, ${h}` : ""}.` };
    }
    case "win":
      return { ...base, tag: "winner", text: `${short(a.to) || "A holder"} won ${sol(a.sol)} SOL.` };
    case "draw":
      return { ...base, tag: "draw", text: a.note ? `${a.note.charAt(0).toUpperCase()}${a.note.slice(1)}.` : "A new draw started." };
    case "alloc":
      return { ...base, tag: "shares", text: a.note ? `${a.note.charAt(0).toUpperCase()}${a.note.slice(1)}.` : "New shares for my hooks." };
    default:
      return null;
  }
}

/** A new brain on chain */
export function fromJournal(e) {
  const grew = (e.added || []).map(hookName).filter(Boolean);
  const fell = (e.removed || []).map(hookName).filter(Boolean);
  const change = [grew.length ? `grew ${grew.join(", ")}` : "", fell.length ? `dropped ${fell.join(", ")}` : ""].filter(Boolean).join(", ");
  return { id: `v:${e.v}`, at: e.at, kind: "brain", tag: `brain v${e.v}`, text: `${e.title || "A new brain"}${change ? `: ${change}` : ""}.`.replace(/\.\.$/, "."), v: e.v, hash: e.hash || "" };
}

/** What already happened, newest first, from the state the page booted with */
export function backlog(state, n = 40) {
  const items = [
    ...(state.thoughts || []).map(fromThought),
    ...(state.acts || []).map(fromAct).filter(Boolean),
    ...(state.journal || []).map(fromJournal),
  ];
  return items.sort((a, b) => b.at - a.at).slice(0, n);
}
