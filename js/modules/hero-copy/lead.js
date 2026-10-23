// The lead is written word by word with a thinking cadence (pauses at punctuation, bursts after).
// Each word condenses out of an ink cloud. In the sub line, "changing" never holds still.
// (The cream brush underline that ran under "15 minutes" as a brain timer is gone: the owner, 20 Oct 2026, called it
// AI slop. The countdown ring is the timer.)
import { el, svgEl, clamp, rand, spring, smooth } from "./util.js";

function splitWords(p) {
  const text = p.textContent.replace(/[ \t\n\r]+/g, " ").trim();   // keep the no-break space in "15 minutes"
  p.textContent = "";
  const words = [];
  text.split(" ").forEach((w, i, arr) => {
    const s = el("span", "hc-w", p);
    s.textContent = w;
    words.push(s);
    if (i < arr.length - 1) p.appendChild(document.createTextNode(" "));
  });
  return words;
}

export function createLead(leadEl, subEl, ctx) {
  const { ink, bus } = ctx;
  const reduced = !!ctx.reduced;
  const words = leadEl ? splitWords(leadEl) : [];
  // the thinking cadence
  let d = 0, burst = 0;
  words.forEach((w, i) => {
    w.style.setProperty("--d", `${d.toFixed(3)}s`);
    const txt = w.textContent;
    let step = burst > 0 ? 0.035 : 0.05 + Math.random() * 0.03;
    if (burst > 0) burst--;
    if (/[.]$/.test(txt)) { step += 0.32; burst = 2; }
    else if (/[,]$/.test(txt)) { step += 0.15; burst = 1; }
    d += step;
  });
  const leadDur = d + 0.45;

  // no underline under "15 minutes" any more (see the top): the code that drew it stays inert with `under` null
  const timerWord = null;
  const under = null;
  function measure() {
    if (morph) {
      // the widest the morphing word ever gets: heaviest weight at the smallest optical size
      const ghost = morph.el.cloneNode(true);
      ghost.style.cssText = 'position:absolute;visibility:hidden;transition:none;transform:none;font-variation-settings:"wght" 820, "opsz" 9, "SOFT" 0, "WONK" 1';
      morph.keep.appendChild(ghost);
      const w = ghost.offsetWidth + (morph.stop?.offsetWidth || 0);
      ghost.remove();
      if (w > 0) morph.keep.style.minWidth = `${Math.ceil(w)}px`;
    }
    if (!under) return;
    under.W = timerWord.offsetWidth;
    under.H = Math.max(8, timerWord.offsetHeight * 0.32);
    under.svg.setAttribute("viewBox", `0 0 ${under.W + 12} ${under.H}`);
    under.svg.style.width = `${under.W + 12}px`;
    under.svg.style.height = `${under.H}px`;
    under.last = "";
  }
  function drawUnder(t) {
    const U = under;
    const f = clamp(U.f.x, 0, 1.06);
    if (f < 0.004) { if (U.last !== "0") { U.path.setAttribute("d", ""); U.last = "0"; } return; }
    const W = U.W + 4, H = U.H;
    const n = 16, pts = [];
    const jit = U.tremble * Math.sin(t * 31) * 0.8;
    for (let k = 0; k <= n; k++) {
      const u = (k / n) * f;
      pts.push(ink.P(2 + u * W, H * 0.55 + Math.sin(u * 5.2 + U.seed) * H * 0.12 - u * H * 0.14 + jit * Math.sin(k * 1.7)));
    }
    const d = ink.brush(pts, (u) => H * (0.2 + 0.32 * Math.pow(Math.sin(Math.PI * (0.08 + u * 0.84)), 0.7)) * (u > 0.85 ? 1 - (u - 0.85) * 2.4 : 1));
    if (d !== U.last) { U.path.setAttribute("d", d); U.last = d; }
  }

  // "changing" keeps changing. The word and its full stop share one unbreakable box as wide as the
  // word ever gets, so the stop never wraps onto a line of its own and the morph never re-wraps the line.
  let morph = null;
  if (subEl) {
    const html = subEl.innerHTML;
    if (/changing/.test(html)) {
      subEl.innerHTML = html.replace(/changing([.,;:?]?)/, (_, stop) =>
        `<span class="hc-keep"><span class="hc-morph">changing</span>${stop ? `<span class="hc-stop">${stop}</span>` : ""}</span>`);
      morph = { el: subEl.querySelector(".hc-morph"), keep: subEl.querySelector(".hc-keep"), stop: subEl.querySelector(".hc-stop"), next: 0 };
    }
  }

  let started = false, t0 = 0;
  function start() {
    if (started) return;
    started = true;
    t0 = performance.now() / 1000;
    leadEl?.classList.add("is-in");
    subEl?.style.setProperty("--d", `${(leadDur * 0.55).toFixed(2)}s`);
    subEl?.classList.add("is-in");
    if (under) {
      under.shown = true;
      if (!reduced) { under.f.x = 0; under.f.v = 0; under.delay = leadDur + 0.15; }
      else { under.f.x = under.target; }
    }
    if (morph) morph.next = t0 + leadDur + 2.2;
  }

  // brain timer
  bus.on("brain:countdown", ({ ms, period }) => {
    if (!under || !period) return;
    if (!ctx.state.swapping) under.target = clamp(ms / period, 0, 1);
    under.tremble = ms < 60000 && !ctx.state.swapping ? 1 : 0;
  });
  bus.on("brain:swap:start", () => { if (under) { under.target = 0; under.tremble = 0; } });
  bus.on("brain:swap:done", () => { if (under) { under.target = 1; under.f.v += 0.4; } });

  function frame(t, dt) {
    if (!started) return;
    if (under && under.shown) {
      if (reduced) { under.f.x = under.target; }
      else if (t - t0 > (under.delay || 0)) {
        // slow tide: refills with an overshoot, drains calmly
        const k = under.target > under.f.x ? 70 : 30;
        spring(under.f, under.target, dt, k, under.target > under.f.x ? 9 : 11);
      }
      drawUnder(t);
    }
    if (morph && !reduced && t > morph.next) {
      const wght = Math.round(rand(300, 820));
      const soft = Math.round(rand(0, 100));
      const opsz = Math.round(rand(9, 144));
      const wonk = Math.random() < 0.5 ? 1 : 0;
      morph.el.style.fontVariationSettings = `"wght" ${wght}, "opsz" ${opsz}, "SOFT" ${soft}, "WONK" ${wonk}`;
      morph.el.style.setProperty("--tilt", `${rand(-7, 7).toFixed(1)}deg`);
      morph.next = t + rand(1.9, 3.1);
    }
  }
  return { start, frame, measure, duration: leadDur };
}
