// setAttribute that skips a write when the value is already there. The browser invalidates an SVG element on every
// setAttribute, even one that changes nothing (measured: ~80% of the cost of a real change), and per-frame code
// re-writes many unchanged values.
export function setAttr(el, name, value) {
  const v = String(value);
  if (el.getAttribute(name) !== v) el.setAttribute(name, v);
}
