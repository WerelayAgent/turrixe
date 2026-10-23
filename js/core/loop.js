// One requestAnimationFrame loop for the whole page. loop.add(fn, owner?) -> remove(); fn(t, dt) with t and dt in seconds.
// The loop pauses when the tab is hidden, and dt is clamped so a long pause never makes things jump.
// With ?perf every callback is timed per owner (module name); read window.__perf in the console or via CDP.
const fns = new Map(); // fn -> owner (writers)
const reads = new Map(); // fn -> owner (layout reads: run first in every frame, before anything writes)
let last = 0;
let running = false;
let rafId = 0;
const perfOn = new URLSearchParams(location.search).has("perf");
const perf = { frames: 0, gaps: [], byOwner: {}, log: [] }; // log: per-frame owners over 0.3 ms (?perf only)
if (perfOn) window.__perf = perf;

function frame(now) {
  const t = now / 1000;
  const dt = Math.min(0.05, last ? t - last : 0.016);
  if (perfOn && last) { perf.frames++; perf.gaps.push(+(t - last).toFixed(4) * 1000); if (perf.gaps.length > 4000) perf.gaps.shift(); }
  last = t;
  // read phase: getBoundingClientRect, getScreenCTM, scroll sizes. Nothing has been written yet this frame,
  // so these never force a synchronous layout.
  const rec = perfOn ? { t: +now.toFixed(1), read: 0, js: 0, own: {} } : null;
  const r0 = perfOn ? performance.now() : 0;
  for (const [fn, owner] of reads) {
    try { fn(t, dt); } catch (err) { console.error("[loop:read]", owner, err); reads.delete(fn); }
  }
  if (rec) rec.read = performance.now() - r0;
  for (const [fn, owner] of fns) {
    if (perfOn) {
      const t0 = performance.now();
      try { fn(t, dt); } catch (err) { console.error("[loop]", owner, err); fns.delete(fn); }
      const o = (perf.byOwner[owner] ||= { ms: 0, calls: 0, max: 0 });
      const d = performance.now() - t0;
      o.ms += d; o.calls++; if (d > o.max) o.max = d;
      rec.js += d;
      if (d > 0.3) rec.own[owner] = +((rec.own[owner] || 0) + d).toFixed(2);
    } else {
      try { fn(t, dt); } catch (err) { console.error("[loop]", owner, err); fns.delete(fn); }
    }
  }
  if (rec) { rec.read = +rec.read.toFixed(2); rec.js = +rec.js.toFixed(2); perf.log.push(rec); if (perf.log.length > 1200) perf.log.shift(); }
  rafId = requestAnimationFrame(frame);
}

function start() {
  if (running) return;
  running = true;
  last = 0;
  rafId = requestAnimationFrame(frame);
}
function stop() {
  running = false;
  cancelAnimationFrame(rafId);
}

document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));

export const loop = {
  add(fn, owner = "?") { fns.set(fn, owner); start(); return () => fns.delete(fn); },
  // measure here (rects, CTMs, sizes), write in add(); keeps every frame to one layout
  read(fn, owner = "?") { reads.set(fn, owner); start(); return () => reads.delete(fn); },
  // a view of the loop that tags every callback with its module, so ?perf can tell who costs what
  for(owner) { return { add: (fn) => loop.add(fn, owner), read: (fn) => loop.read(fn, owner), get running() { return running; } }; },
  get running() { return running; },
};
