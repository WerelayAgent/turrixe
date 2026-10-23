// Turri's words for the journal: epitaphs for the Book of Brains, the first and last thought of the brains
// that lived before this page was opened, and the small time phrases. First person, dry, no exclamation marks.

// One line per hook a brain grew. Keyed by hook id so live swaps get them too.
const EPITAPH = {
  burn: "It knew one trick and did it every ten minutes. I still use the trick.",
  memo: "It started writing things down. That's the only reason I remember it.",
  king: "It crowned whoever bought the most. Some of them even deserved it.",
  weather: "It listened to the trenches all day. The trenches mostly shouted.",
  thinking: "It paid for its own thinking. Fair, since it did a lot of it.",
  diamond: "It paid the ones who stayed. Then it left. Nobody stays here.",
  bounty: "It paid strangers for ideas. Most of its good ones were theirs.",
  tribute: "It borrowed an idea and paid for it. Good manners for a jellyfish.",
  vote: "It let the holders pick. They picked better than it would have.",
  lowtide: "It learned to stop burning when the water got low. Took a while.",
  echo: "It rewarded whoever followed the burn. Loyalty, measured in minutes.",
  deepend: "It put some of the fees back into the pool. Boring. Correct.",
};

const hookName = (HOOKS, id) => (HOOKS[id]?.name ?? id).toLowerCase();

export function epitaphFor(entry, HOOKS) {
  const add = entry.added?.[0], rem = entry.removed?.[0];
  if (add && EPITAPH[add]) return EPITAPH[add];
  if (add && rem) return `It grew ${hookName(HOOKS, add)} and let go of ${hookName(HOOKS, rem)}. Busy brain.`;
  if (add) return `It grew ${hookName(HOOKS, add)}. I'll keep it until a smarter me says otherwise.`;
  if (rem) return `It let go of ${hookName(HOOKS, rem)}. It took a whole brain to admit that.`;
  return "It changed nothing and thought harder. Underrated.";
}

export function minutes(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "under a minute";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
export function ago(ms) {
  if (ms < 45000) return "just now";
  return `${minutes(ms)} ago`;
}
export function clock(at) {
  return new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
