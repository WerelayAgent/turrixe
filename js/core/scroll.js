// Scroll state: y, progress 0..1, depth in metres (from each section's data-depth), current section id.
// Emits "section" when the section in view changes and "depth" every scroll frame.
import { bus } from "./bus.js";
import { loop } from "./loop.js";

export const scroll = { y: 0, vy: 0, progress: 0, depth: 0, section: "surface", sections: [] };

function measure() {
  scroll.sections = [...document.querySelectorAll("main > .sec")].map((el) => ({
    id: el.id,
    el,
    top: el.offsetTop,
    height: el.offsetHeight,
    depth: Number(el.dataset.depth || 0),
  }));
}

let lastY = scrollY;
function update() {
  const y = scrollY;
  scroll.vy = y - lastY;
  lastY = y;
  scroll.y = y;
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  scroll.progress = Math.min(1, y / max);
  const mid = y + innerHeight * 0.45;
  const secs = scroll.sections;
  let i = 0;
  while (i < secs.length - 1 && secs[i + 1].top <= mid) i++;
  const cur = secs[i];
  if (cur) {
    const next = secs[i + 1];
    const f = next ? Math.min(1, Math.max(0, (mid - cur.top) / (next.top - cur.top))) : 0;
    scroll.depth = cur.depth + (next ? (next.depth - cur.depth) * f : 0);
    if (cur.id !== scroll.section) {
      scroll.section = cur.id;
      bus.emit("section", cur.id);
    }
  }
  bus.emit("depth", scroll.depth);
}

// A scroll event only marks the state stale. The first read callback of the next frame reads scrollY once,
// before any module writes, so the read never forces a layout (reading scrollY in the event handler did,
// whenever anything had written since the last frame). Registered at import, so it runs before every other reader.
let live = false, stale = false;
loop.read(() => { if (live && stale) { stale = false; update(); } }, "scroll");

export function initScroll() {
  measure();
  update();
  live = true;
  addEventListener("scroll", () => { stale = true; }, { passive: true });
  // re-measure at most once per frame, outside the observer callback (avoids ResizeObserver loops)
  let pending = false;
  const remeasure = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; measure(); update(); });
  };
  addEventListener("resize", remeasure);
  new ResizeObserver(remeasure).observe(document.body);
}
