// Odometer digits for the live stat on each capsule. Every digit is a reel of 0-9 twice over, so a digit always
// rolls forward (9 -> 0 keeps going up), the low digits first, with a little jelly overshoot as it settles.
// Separators are plain glyphs. Columns are matched from the right, so 999 -> 1,000 grows a new reel on the left.
// The rolls are Web Animations: the reel's resting transform is always the plain digit (first lap), and each roll
// runs from the digit it was showing to the same digit on the second lap. No reflow, no extra frame callback.
const REEL = "01234567890123456789".split("").map((d) => `<i>${d}</i>`).join("");
const ROLL_EASE = "cubic-bezier(.3, 1.32, .5, 1)";
const FADE_EASE = "cubic-bezier(.16, 1, .3, 1)";
// The window (.hk-d) is 1em tall; reel cells are 1.25em apart (hooks.css), so a neighbour's descender or ascender
// never shows at the window's edge, whatever the font (old-style fallback figures descend a long way). The extra
// .125em is the cell's own half-leading, which keeps the digit exactly where a 1em line would put it.
const at = (i) => `translateY(${-(i * 1.25 + 0.125).toFixed(3)}em)`;

export function createOdometer(el, { reduced = false } = {}) {
  let cols = [];     // right to left: { el, reel?, pos, ch, anim }
  let text = "";
  const moving = !reduced && typeof el.animate === "function";

  function makeDigit(d) {
    const col = document.createElement("span");
    col.className = "hk-d";
    const reel = document.createElement("span");
    reel.className = "hk-reel";
    reel.innerHTML = REEL;
    col.appendChild(reel);
    reel.style.transform = at(d);
    return { el: col, reel, pos: d, ch: String(d), digit: true, anim: null };
  }
  function makeGlyph(ch) {
    const g = document.createElement("span");
    g.className = "hk-g";
    g.textContent = ch;
    return { el: g, ch, digit: false };
  }
  // roll column c forward from the digit it shows (or is heading to) to d
  function rollTo(c, d, delay, animate) {
    const from = c.pos;
    const steps = (d - from + 10) % 10;
    c.ch = String(d);
    if (!steps) return;
    c.pos = d;
    c.reel.style.transform = at(d);
    if (!animate || !moving) { c.anim?.cancel(); c.anim = null; return; }
    // a roll still in flight hands over at its target digit, which is where the new one starts
    c.anim?.cancel();
    c.anim = c.reel.animate(
      [{ transform: at(from) }, { transform: at(from + steps) }],
      { duration: 750 + steps * 45, delay, easing: ROLL_EASE, fill: "backwards" },
    );
  }

  function set(str, animate = true) {
    if (str === text) return false;
    const prev = text;
    text = str;
    const roll = animate && moving && prev !== "";
    const chars = str.split("").reverse();
    const next = [];
    let k = 0;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i], isD = ch >= "0" && ch <= "9";
      const old = cols[i];
      if (old && old.digit && isD) {
        rollTo(old, +ch, k * 55, roll);
        next.push(old);
      } else if (old && !old.digit && !isD && old.ch === ch) next.push(old);
      else {
        // a new reel arrives at 0 and rolls up to its digit as it fades in
        const c = isD ? makeDigit(roll ? 0 : +ch) : makeGlyph(ch);
        if (old) old.el.replaceWith(c.el); else el.prepend(c.el);
        if (isD && roll) {
          rollTo(c, +ch, k * 55, true);
          c.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: k * 55, easing: FADE_EASE, fill: "backwards" });
        }
        next.push(c);
      }
      if (isD) k++;
    }
    for (let i = chars.length; i < cols.length; i++) cols[i].el.remove();
    cols = next;
    return true;
  }
  return { set, get text() { return text; } };
}
