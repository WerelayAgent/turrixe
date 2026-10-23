// Pointer state for the whole page: client x/y, normalised nx/ny in -1..1, smoothed velocity,
// whether it is down, the element under it, and device tilt (tx, ty in -1..1) on phones.
export const pointer = {
  x: innerWidth / 2, y: innerHeight / 2,
  nx: 0, ny: 0,
  vx: 0, vy: 0,
  down: false,
  active: false,      // has the visitor moved yet
  touch: matchMedia("(pointer: coarse)").matches,
  target: null,
  tx: 0, ty: 0,
};

let lastT = performance.now();
function move(x, y, target) {
  const now = performance.now();
  const dt = Math.max(1, now - lastT) / 1000;
  lastT = now;
  const vx = (x - pointer.x) / dt, vy = (y - pointer.y) / dt;
  pointer.vx = pointer.vx * 0.7 + vx * 0.3;
  pointer.vy = pointer.vy * 0.7 + vy * 0.3;
  pointer.x = x; pointer.y = y;
  pointer.nx = (x / innerWidth) * 2 - 1;
  pointer.ny = (y / innerHeight) * 2 - 1;
  pointer.target = target;
  pointer.active = true;
}

addEventListener("pointermove", (e) => move(e.clientX, e.clientY, e.target), { passive: true });
addEventListener("pointerdown", (e) => { pointer.down = true; move(e.clientX, e.clientY, e.target); }, { passive: true });
addEventListener("pointerup", () => { pointer.down = false; }, { passive: true });
addEventListener("pointerleave", () => { pointer.down = false; }, { passive: true });

// velocity decays when the pointer rests
setInterval(() => { pointer.vx *= 0.8; pointer.vy *= 0.8; }, 50);

addEventListener("deviceorientation", (e) => {
  if (e.gamma == null) return;
  pointer.tx = Math.max(-1, Math.min(1, e.gamma / 35));
  pointer.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 35));
}, { passive: true });
