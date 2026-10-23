// Live state and the built-in simulator. When config.api is set, the same events come from the live feed instead.
// state: { hooks: [{id,...HOOKS[id], since}], version, nextSwapAt (ms epoch), thoughts: [...last 40], journal: [...], vault }
import { HOOKS, HOOK_PLAN, THOUGHTS, JOURNAL, VAULT } from "./content.js";

export const state = {
  hooks: [],
  version: 0,
  nextSwapAt: 0,
  swapping: false,
  thoughts: [],
  journal: [],
  acts: [],
  vault: { ...VAULT },
};

const hookObj = (id) => ({ id, ...HOOKS[id], since: Date.now() });

export function createSim({ bus, config, params }) {
  const demo = params.has("demo");
  const period = (demo ? config.demoBrainSeconds : config.brainMinutes * 60) * 1000;
  const now = Date.now();

  // seed from the journal: live hooks are everything added and not removed
  state.nextSwapAt = now + (demo ? period * 0.5 : period - ((now / 1000) % (period / 1000)) * 1000);
  // the current brain was born one period before the next swap; earlier brains one period apart before it
  const born = state.nextSwapAt - period;
  const lastV = JOURNAL.at(-1).v;
  state.journal = JOURNAL.map((j) => ({ ...j, at: born - (lastV - j.v) * period }));
  const live = new Map();
  for (const j of state.journal) { j.added.forEach((h) => live.set(h, j.at)); j.removed.forEach((h) => live.delete(h)); }
  state.hooks = [...live].map(([id, at]) => ({ ...hookObj(id), since: at }));
  state.version = lastV;

  let thoughtIdx = Math.floor(Math.random() * THOUGHTS.length);
  let planIdx = HOOK_PLAN.findIndex((id) => !live.has(id));
  const timers = [];

  function think(kind, text) {
    const t = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind, text, at: Date.now(), version: state.version };
    state.thoughts.push(t);
    if (state.thoughts.length > 40) state.thoughts.shift();
    bus.emit("thought", t);
  }

  function nextThought() {
    const [kind, text] = THOUGHTS[thoughtIdx % THOUGHTS.length];
    thoughtIdx++;
    think(kind, text);
    timers.push(setTimeout(nextThought, (demo ? 3500 : 6000) + Math.random() * 5000));
  }

  // what the live feed sends as "act": the brain's own moves on chain (here made up, and with no transaction)
  function act(kind, o) {
    const a = { id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind, hook: null, sol: 0, tokens: 0, to: "", note: "", tx: "", at: Date.now(), version: state.version, ...o };
    state.acts.push(a);
    if (state.acts.length > 60) state.acts.shift();
    bus.emit("act", a);
  }

  let feesSince = 0;
  function tickVault() {
    const v = state.vault;
    const fee = 0.004 + Math.random() * 0.03;
    v.feesSol += fee;
    feesSince += fee;
    if (Math.random() < 0.35) {
      const burned = Math.round(2000 + Math.random() * 30000);
      v.burnedTokens += burned;
      act("burn", { hook: "burn", sol: Math.round(feesSince * 0.8 * 1e4) / 1e4, tokens: burned, note: "bought and burned" });
      feesSince = 0;
    }
    if (Math.random() < 0.2) v.holders += Math.random() < 0.8 ? 1 : -1;
    if (Math.random() < 0.18) act("fees", { sol: Math.round(fee * 6 * 1e4) / 1e4, note: "creator fees collected" });
    bus.emit("vault", { ...v, lastFee: fee });
    timers.push(setTimeout(tickVault, 1200 + Math.random() * 2600));
  }

  function swap() {
    state.swapping = true;
    const oldVersion = state.version;
    const version = oldVersion + 1;
    // pick one hook to add and, sometimes, one to drop
    const addId = planIdx >= 0 && planIdx < HOOK_PLAN.length ? HOOK_PLAN[planIdx++] : null;
    const removable = state.hooks.filter((h) => h.id !== "burn" && h.id !== "memo");
    const removeId = state.hooks.length > 6 && Math.random() < 0.6 ? removable[Math.floor(Math.random() * removable.length)]?.id : null;
    bus.emit("brain:swap:start", { from: oldVersion, to: version, add: addId, remove: removeId });
    think("deploy", `Replacing my brain. v${oldVersion} out, v${version} in.`);

    timers.push(setTimeout(() => {
      bus.emit("brain:swap:mid", { from: oldVersion, to: version });
      if (removeId) {
        state.hooks = state.hooks.filter((h) => h.id !== removeId);
        bus.emit("hook:remove", { id: removeId, version });
      }
      if (addId) {
        const h = hookObj(addId);
        state.hooks.push(h);
        bus.emit("hook:add", { hook: h, version });
      }
      state.version = version;
      const entry = {
        v: version, at: Date.now(), title: addId ? `Grew ${HOOKS[addId].name.toLowerCase()}` : "Same hooks, better thinking",
        added: addId ? [addId] : [], removed: removeId ? [removeId] : [], lines: 40 + Math.floor(Math.random() * 260),
        hash: `${Math.random().toString(16).slice(2, 6)}...${Math.random().toString(16).slice(2, 6)}`,
        diff: [
          ...(removeId ? [`- ${HOOKS[removeId].name.toLowerCase().replace(/\s+/g, "_")}(ctx)?;`] : []),
          ...(addId ? [`+ ${HOOKS[addId].name.toLowerCase().replace(/\s+/g, "_")}(ctx)?;`] : []),
        ],
      };
      state.journal.push(entry);
      state.vault.versions = version;
      bus.emit("journal:add", entry);
    }, 2600));

    timers.push(setTimeout(() => {
      state.swapping = false;
      state.nextSwapAt = Date.now() + period;
      bus.emit("brain:swap:done", { version });
      think("self", "New brain. Same coin. Let's see what this one is like.");
    }, 6200));
  }

  function countdown() {
    const left = Math.max(0, state.nextSwapAt - Date.now());
    bus.emit("brain:countdown", { ms: left, version: state.version, period });
    if (left <= 0 && !state.swapping) swap();
  }

  return {
    start() {
      bus.emit("hooks:set", state.hooks);
      timers.push(setTimeout(nextThought, 900));
      timers.push(setTimeout(tickVault, 1500));
      timers.push(setInterval(countdown, 250));
    },
    swapNow() { if (!state.swapping) swap(); },
    think,
  };
}
