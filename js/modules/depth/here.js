// The name of the water you're in, under the depth readout. The old name sinks out in 160 ms, and only then
// the new one drops in with a little jelly overshoot, so two names never sit on top of each other.
// Animations run on the compositor (opacity, transform) and nothing here reads layout.
export function createHere(el, reduced) {
  let name = "", out = null, drop = null, dropAt = -1e9;

  function dropIn() {
    el.textContent = name;
    dropAt = performance.now();
    drop = el.animate([{ opacity: 0, transform: "translateY(-7px)" }, { opacity: 1, transform: "none" }],
      { duration: 760, easing: "cubic-bezier(.34,1.56,.64,1)", fill: "forwards" });
  }

  return {
    show(next) {
      if (next === name) return;
      name = next;
      if (reduced || !el.animate) { el.textContent = next; el.style.opacity = "1"; return; }
      if (out) return; // a fade-out is already running; it drops in the latest name when it ends
      if (!el.textContent) { dropIn(); return; }
      // how far the last drop-in got (its opacity is ~1 after 260 ms), so the fade-out starts where it is
      const shown = Math.min(1, (performance.now() - dropAt) / 260);
      drop?.cancel(); // (getAnimations() would flush style and layout mid-frame)
      out = el.animate([{ opacity: shown, transform: "none" }, { opacity: 0, transform: "translateY(6px)" }],
        { duration: 160, easing: "cubic-bezier(.5,0,.75,0)", fill: "forwards" });
      out.finished.then(() => { out = null; dropIn(); }, () => { out = null; });
    },
  };
}
