// The depth readout as an odometer: "0 m", "−400 m", "−1,240 m". No zero padding, ever.
// Depth is shown in tens of metres, so the units digit is a fixed 0 and three reels roll (tens, hundreds,
// thousands). A column exists only while it carries a digit: it opens while its first digit rolls in
// (990 -> 1,000 m opens the thousands and the comma) and closes the same way, so a leading zero is never
// on screen. Writes happen only when a value actually moved.
const MINUS = "−";
const CELL = 1.25; // em per digit cell (matches .depth__reel i in depth.css)
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const odometerHTML = () =>
  `<span class="depth__num"><span class="depth__sign">${MINUS}</span><span class="depth__col" data-k="2"></span><span class="depth__comma">,</span><span class="depth__col" data-k="1"></span><span class="depth__col" data-k="0"></span><span class="depth__fixed">0</span><span class="depth__unit">m</span></span>`;

export function createOdometer(root) {
  const num = root.querySelector(".depth__num");
  const cols = [...num.querySelectorAll(".depth__col")].sort((a, b) => a.dataset.k - b.dataset.k);
  const reels = cols.map((c) => {
    const reel = document.createElement("span");
    reel.className = "depth__reel";
    reel.innerHTML = "01234567890".split("").map((d) => `<i>${d}</i>`).join("");
    c.appendChild(reel);
    return reel;
  });
  // tens, hundreds, thousands, comma, sign
  const presEls = [cols[0], cols[1], cols[2], num.querySelector(".depth__comma"), num.querySelector(".depth__sign")];
  const pres = [-1, -1, -1, -1, -1];
  const rolls = [-1, -1, -1];

  function presence(i, p) {
    p = p < 0.01 ? 0 : p > 0.99 ? 1 : Math.round(p * 50) / 50;
    if (p === pres[i]) return;
    pres[i] = p;
    const el = presEls[i];
    el.style.width = p === 1 ? "" : `${p}ch`;
    el.style.opacity = p === 1 ? "" : String(p);
    el.style.visibility = p === 0 ? "hidden" : "";
  }
  function roll(i, r) {
    if (Math.abs(r - rolls[i]) <= 0.002) return;
    rolls[i] = r;
    reels[i].style.transform = `translate3d(0, ${(-r * CELL).toFixed(3)}em, 0)`;
  }

  return {
    // d: depth in metres (any real number; springs may overshoot a little)
    set(d) {
      const s = Math.max(0, d) / 10; // tens of metres
      roll(0, s % 10);
      roll(1, (Math.floor(s / 10) % 10) + Math.max(0, (s % 10) - 9));
      roll(2, (Math.floor(s / 100) % 10) + Math.max(0, (s % 100) - 99));
      const p0 = clamp01(s), p2 = clamp01(s - 99);
      presence(0, p0); presence(1, clamp01(s - 9)); presence(2, p2); presence(3, p2); presence(4, p0);
    },
  };
}
