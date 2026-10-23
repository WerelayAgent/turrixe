// Odometer: serif digits on wet reels. Each column is a spring, so a roll overshoots a little and settles
// like something floating. Carries ripple right to left; big jumps spin the low columns an extra turn.
const K = 150, C = 15.5;                 // spring: slightly under-damped
const CELL = 1.12;                       // em per digit cell (matches .vo-d height in vault.css)

export function createOdometer(el, { decimals = 0, group = true, reduced = false } = {}) {
  const fmt = (v) => v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: group });
  let slots = [], value = 0, str = "", moving = false;

  function build(s, startDigits = null) {
    el.textContent = "";
    slots = [];
    const digits = [...s].filter((c) => /\d/.test(c)).length;
    let di = 0;
    for (const ch of s) {
      if (/\d/.test(ch)) {
        const d = document.createElement("span");
        d.className = "vo-d";
        const reel = document.createElement("span");
        reel.className = "vo-reel";
        reel.innerHTML = "<i>0</i><i>1</i><i>2</i><i>3</i><i>4</i><i>5</i><i>6</i><i>7</i><i>8</i><i>9</i><i>0</i>";
        d.appendChild(reel);
        d.style.setProperty("--i", di);
        el.appendChild(d);
        const start = startDigits ? startDigits[di] : +ch;
        slots.push({ el: d, reel, pos: start, vel: 0, target: start, digit: +ch, k: digits - 1 - di, q: [], st: -1, m: -1 });
        di++;
      } else {
        const sp = document.createElement("span");
        sp.className = ch === "." ? "vo-s vo-dot" : "vo-s";
        sp.textContent = ch;
        el.appendChild(sp);
      }
    }
    slots.forEach(render);
  }

  function render(sl) {
    const m = ((sl.pos % 10) + 10) % 10;
    const st = Math.min(0.24, Math.abs(sl.vel) * 0.018);
    if (Math.abs(m - sl.m) > 0.0005) { sl.reel.style.transform = `translate3d(0,${(-m * CELL).toFixed(4)}em,0)`; sl.m = m; }
    if (Math.abs(st - sl.st) > 0.004) { sl.el.style.setProperty("--st", (1 + st).toFixed(3)); sl.st = st; }
  }

  const digitsOf = (s) => [...s].filter((c) => /\d/.test(c)).map(Number);

  return {
    get value() { return value; },
    // jump without animation
    snap(v) { value = v; str = fmt(v); build(str); },
    // the first-look count up: every reel spins from zero, the low ones longest
    intro(v, now) {
      value = v; str = fmt(v);
      const ds = digitsOf(str);
      build(str, ds.map(() => 0));
      if (reduced) { slots.forEach((sl, i) => { sl.pos = sl.target = ds[i]; sl.vel = 0; render(sl); }); return; }
      slots.forEach((sl, i) => {
        const turns = Math.max(0, Math.min(2, 2 - Math.floor(sl.k / 3)));
        sl.q.push({ at: now + 0.12 * (slots.length - 1 - sl.k) * 0 + 0.07 * sl.k + 0.05 * Math.random(), steps: ds[i] + 10 * turns });
      });
      moving = true;
    },
    set(v, now) {
      if (v === value) return false;
      const dir = v > value ? 1 : -1;
      const delta = Math.abs(v - value);
      const old = str;
      value = v; str = fmt(v);
      const nd = digitsOf(str), od = digitsOf(old);
      const sameShape = old.replace(/\d/g, "0") === str.replace(/\d/g, "0");
      if (!sameShape) {
        // a column was added or dropped: rebuild, carrying the old digits over from the right
        const pad = nd.map((_, i) => { const j = i - (nd.length - od.length); return j >= 0 ? od[j] : nd[i]; });
        build(str, pad);
      }
      if (reduced) { slots.forEach((sl, i) => { sl.pos = sl.target = nd[i]; sl.vel = 0; sl.q.length = 0; render(sl); }); return true; }
      slots.forEach((sl, i) => {
        const from = ((Math.round(sl.target + sl.q.reduce((a, q) => a + q.steps, 0)) % 10) + 10) % 10;
        const to = nd[i];
        let steps = dir > 0 ? (to - from + 10) % 10 : -((from - to + 10) % 10);
        const unit = Math.pow(10, sl.k - decimals);
        if (delta / unit >= 10 && sl.k < 4) steps += 10 * dir;
        if (steps !== 0) sl.q.push({ at: now + 0.06 * sl.k, steps });
      });
      moving = true;
      return true;
    },
    // one spring step for every column; returns true while anything moves
    tick(now, dt) {
      if (!moving) return false;
      let any = false;
      for (const sl of slots) {
        for (let j = sl.q.length - 1; j >= 0; j--) if (now >= sl.q[j].at) { sl.target += sl.q[j].steps; sl.q.splice(j, 1); }
        if (sl.q.length) any = true;
        const x = sl.pos - sl.target;
        if (Math.abs(x) < 0.002 && Math.abs(sl.vel) < 0.01) {
          if (sl.pos !== sl.target) { sl.pos = sl.target; sl.vel = 0; render(sl); }
          continue;
        }
        any = true;
        const h = Math.min(dt, 1 / 30), n = dt > 1 / 50 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const a = -K * (sl.pos - sl.target) - C * sl.vel;
          sl.vel += a * (h / n); sl.pos += sl.vel * (h / n);
        }
        render(sl);
      }
      moving = any;
      return any;
    },
    get text() { return str; },
  };
}
