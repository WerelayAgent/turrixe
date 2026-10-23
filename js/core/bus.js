// Event bus shared by every module. bus.on returns an unsubscribe function.
// Events (payloads in SPEC.md): ready, loader:done, thought, hook:add, hook:remove, hooks:set,
// brain:countdown, brain:swap:start, brain:swap:mid, brain:swap:done, journal:add, vault, section, depth,
// jelly:look, jelly:poke, ripple, egg, sound
const handlers = new Map();

export const bus = {
  on(event, fn) {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event).add(fn);
    return () => handlers.get(event)?.delete(fn);
  },
  once(event, fn) {
    const off = bus.on(event, (data) => { off(); fn(data); });
    return off;
  },
  emit(event, data) {
    for (const fn of handlers.get(event) ?? []) {
      try { fn(data); } catch (err) { console.error(`[bus] ${event}`, err); }
    }
    for (const fn of handlers.get("*") ?? []) {
      try { fn(event, data); } catch (err) { console.error("[bus] *", err); }
    }
  },
};
