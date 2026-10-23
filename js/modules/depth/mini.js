// Phones: the sounding line leaves the page, so it can never run over the words. What stays is compact and
// lives in the empty middle of the top bar (the surface: nothing ever scrolls under it): the odometer, the
// name of the water under it, and a short plumb line beside them whose lead pays out as you sink and bobs on
// the line when you stop. Tap it and the line is cast: a chart of the dive drops from the surface, every
// section a knot on the line; tap one to dive there.
// Budget: one tiny canvas, redrawn only while the lead moves (about 30 fps while it just sways); the chart is
// a static ink drawing built on resize. Nothing here reads layout outside layout().
import { odometerHTML, createOdometer } from "./odometer.js";
import { createHere } from "./here.js";
import { ribbon } from "./diver.js";

const ROW = 42;       // px per section in the chart: a comfortable tap
const BTN_W = 98;     // the readout's box (depth.css keeps it fixed, so it never jiggles as digits open)
const LINE_W = 18;    // the plumb line's canvas, at the right of the box (matches depth.css)
const LINE_R = 6;     // its distance from the box's right edge (matches depth.css)
const TIGHT_W = 74;   // the box without the plumb line, for very narrow bars
const GAP = 10;       // clearance to the mark and the tools in the top bar
const READ_H = 33;    // the number (15px) + 2px + the name (16px), centred on a whole pixel (matches depth.css)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createMini({ mount, ink, reduced, cream, onPick, onToggle }) {
  const box = document.createElement("div");
  box.className = "depth__mini";
  box.innerHTML = `
    <button class="depth__mini-btn" type="button" aria-expanded="false" aria-controls="depth-chart" aria-label="Depth gauge">
      <span class="depth__mini-read" aria-hidden="true">${odometerHTML()}<span class="depth__here"><span class="depth__here-t"></span></span></span>
      <canvas class="depth__mini-line" aria-hidden="true"></canvas>
    </button>`;
  const chart = document.createElement("nav");
  chart.className = "depth__chart";
  chart.id = "depth-chart";
  chart.setAttribute("aria-label", "Dive to a section");
  chart.inert = true;
  chart.innerHTML = `<svg class="depth__chart-ink" aria-hidden="true" focusable="false"><path class="depth__chart-line"/><g class="depth__chart-knots"></g></svg><ol class="depth__chart-list"></ol>`;
  mount.append(box, chart);

  const btn = box.querySelector(".depth__mini-btn");
  const odo = createOdometer(box);
  const here = createHere(box.querySelector(".depth__here-t"), reduced);
  const cv = box.querySelector(".depth__mini-line");
  const g = cv.getContext("2d");
  const svg = chart.querySelector(".depth__chart-ink");
  const lineEl = chart.querySelector(".depth__chart-line");
  const knotsEl = chart.querySelector(".depth__chart-knots");
  const list = chart.querySelector(".depth__chart-list");
  const CREAM = `rgb(${cream.join(",")})`;

  // the lead: a small sinker hanging from its eye at (0, 0), and a wet glint on its shoulder
  const LEAD = (() => {
    const c = [[0, -0.7], [1.8, 1.5], [3.05, 4.6], [2.75, 7.5], [1.2, 9.2], [-1.25, 9.15], [-2.8, 7.4], [-3.05, 4.5], [-1.75, 1.45]];
    const sp = ink.spline(c.map(([x, y]) => ink.P(x, y)), true, 5);
    const p = new Path2D();
    p.moveTo(sp[0].x, sp[0].y);
    for (let i = 1; i < sp.length; i++) p.lineTo(sp[i].x, sp[i].y);
    p.closePath();
    return p;
  })();
  const GLINT = (() => {
    const p = new Path2D();
    p.moveTo(-1.55, 3.1);
    p.quadraticCurveTo(-2.45, 5.2, -1.75, 7.3);
    p.quadraticCurveTo(-1.5, 5.3, -1.55, 3.1);
    p.closePath();
    return p;
  })();

  let rows = [], knots = [], hereI = -1;
  let active = false, open = false, tight = false;
  let barH = 63, dpr = 1, chartKey = "", layoutKey = "";
  let L = null, Lv = 0, acc = 1, drawnL = -1, dirty = true, lastK = -1, fgCss = "", y0 = 14, y1 = 49;

  // ---------- the chart: one knot per section on a hand-inked line ----------
  function setSections(secs) {
    list.innerHTML = secs.map((s, i) =>
      `<li><a class="depth__chart-row" href="#${s.id}" data-i="${i}"><span class="depth__chart-m">${s.m}</span><span class="depth__chart-name">${s.name}</span></a></li>`).join("");
    rows = [...list.querySelectorAll(".depth__chart-row")];
    chartKey = "";
    hereI = -1;
    drawChart();
  }
  list.addEventListener("click", (e) => {
    const a = e.target.closest(".depth__chart-row");
    if (!a) return;
    e.preventDefault();
    onPick?.(Number(a.dataset.i));
  });

  function drawChart() {
    const n = rows.length;
    const key = `${n}|${barH}`;
    if (!n || key === chartKey) return;
    chartKey = key;
    const top = barH + 18;                   // the first knot sits clear of the top bar's waterline
    const height = top + n * ROW + 40;
    chart.style.height = `${height}px`;
    chart.style.setProperty("--top", `${top}px`);
    svg.setAttribute("width", "28");
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 28 ${height}`);
    const X = 14;
    const wob = (y) => 0.9 * Math.sin(y * 0.043 + 0.7) + 0.45 * Math.sin(y * 0.131 + 2.1);
    const ky = rows.map((_, i) => top + ROW * (i + 0.5));
    const end = ky[n - 1] + 20;
    const pts = [];
    for (let y = -8; y < end; y += 6) pts.push(ink.P(X + wob(y), y));
    pts.push(ink.P(X + wob(end), end));
    const curl = ink.spiral(pts[pts.length - 1], Math.PI / 2 + 0.15, 6, 1.6, 0.9, 1, 1.5);
    const all = pts.concat(curl.slice(1));
    const mainLen = end + 8;
    const split = mainLen / (mainLen + 22);
    lineEl.setAttribute("d", ink.brush(all, (u) => (u <= split
      ? 1.7 + 0.35 * Math.sin(u * 31 + 1.7) + 0.2 * Math.sin(u * 83 + 0.4)
      : 1.55 - 0.9 * ((u - split) / (1 - split)))));
    knotsEl.innerHTML = ky.map((y, i) => {
      const x = X + wob(y), r = 3.3;
      const kp = Array.from({ length: 7 }, (_, j) => {
        const m = 0.8 + 0.3 * Math.abs((Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1);
        const a = (j / 7) * Math.PI * 2;
        return ink.P(x + Math.cos(a) * r * m, y + Math.sin(a) * r * m * 0.92);
      });
      const sp = ink.spline(kp, true, 4);
      return `<path class="depth__chart-knot" d="M${sp.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join("L")}Z"/>`;
    }).join("");
    knots = [...knotsEl.children];
    if (hereI >= 0) knots[hereI]?.classList.add("is-here");
  }

  // ---------- open / close ----------
  function setOpen(v) {
    v = Boolean(v) && active;
    if (v === open) return;
    open = v;
    chart.classList.toggle("is-open", v);
    box.classList.toggle("is-open", v);
    btn.setAttribute("aria-expanded", String(v));
    chart.inert = !v;
    onToggle?.(v);
  }
  btn.addEventListener("click", () => setOpen(!open));
  document.addEventListener("pointerdown", (e) => {
    if (open && !box.contains(e.target) && !chart.contains(e.target)) setOpen(false);
  }, { passive: true });
  document.addEventListener("keydown", (e) => {
    if (open && e.key === "Escape") { setOpen(false); btn.focus(); }
  });

  // ---------- the plumb line ----------
  function drawLine(len, a, fg, light) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const x0 = LINE_W / 2, top = -2;
    const wx = x0 + Math.sin(a) * len, wy = top + Math.cos(a) * len;
    const bow = -a * len * 0.2; // the line bellies a little against the swing
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      pts.push({ x: x0 + (wx - x0) * u + Math.sin(Math.PI * u) * bow, y: top + (wy - top) * u });
    }
    g.fillStyle = fg;
    ribbon(g, pts, (u) => 1.45 - 0.4 * u);
    g.translate(wx, wy);
    g.rotate(-a * 0.8);
    g.fill(LEAD);
    if (light) { g.fillStyle = CREAM; g.fill(GLINT); }
  }

  return {
    get open() { return open; },
    setOpen,
    setSections,

    // compact mode on or off (depth.js decides with the top bar's own breakpoint)
    setActive(v) {
      if (v === active) return;
      active = v;
      if (!v) setOpen(false);
      dirty = true;
    },

    // bar: the top bar's height; markR / toolsL: where its mark ends and its tools begin (viewport px)
    layout({ W, bar, markR, toolsL, pixelRatio }) {
      const nb = Math.max(44, Math.round(bar || 63));
      const nd = Math.min(3, pixelRatio || 1);
      // centred on the screen when it fits between the mark and the tools; otherwise centred in the gap;
      // without the plumb line when even that is too tight; hidden rather than ever touching them
      const fit = (w) => {
        const lo = markR + GAP + w / 2, hi = toolsL - GAP - w / 2;
        return lo <= hi ? clamp(W / 2, lo, hi) : null;
      };
      let cx = fit(BTN_W), w = BTN_W;
      const nt = cx == null;
      if (nt) { cx = fit(TIGHT_W); w = TIGHT_W; }
      const hidden = cx == null;
      const left = Math.round((cx ?? W / 2) - w / 2);
      // the chart's line hangs straight under the plumb line (or under the readout when there is none)
      const lx = nt ? left + w - 8 : left + BTN_W - LINE_R - LINE_W / 2;
      const key = `${nb}|${nd}|${left}|${nt}|${hidden}`;
      if (key === layoutKey) return; // called on every top-bar change: write only when something moved
      layoutKey = key;
      barH = nb; dpr = nd; tight = nt;
      y0 = Math.round(barH * 0.22);
      y1 = barH - Math.round(barH * 0.22);
      box.classList.toggle("is-tight", tight);
      box.style.visibility = hidden ? "hidden" : "";
      box.style.height = `${barH}px`;
      box.style.setProperty("--rt", `${Math.round((barH - READ_H) / 2)}px`);
      box.style.transform = `translate3d(${left}px, 0, 0)`;
      chart.style.setProperty("--lx", `${lx}px`);
      svg.style.left = `${lx - 14}px`;
      const cw = Math.round(LINE_W * dpr), ch = Math.round(barH * dpr);
      if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; } // (resizing clears it)
      dirty = true;
      drawChart();
    },

    // the section you're in: its name under the number, its knot wet cream on the chart
    setHere(i, name, label) {
      here.show(name);
      if (i === hereI) return;
      knots[hereI]?.classList.remove("is-here");
      rows[hereI]?.classList.remove("is-here");
      rows[hereI]?.removeAttribute("aria-current");
      hereI = i;
      knots[i]?.classList.add("is-here");
      rows[i]?.classList.add("is-here");
      rows[i]?.setAttribute("aria-current", "location");
      btn.setAttribute("aria-label", label);
    },

    intro() { box.classList.add("is-in"); },

    // r: the sprung readout depth (m); frac: 0 at the surface .. 1 at the bottom;
    // fgRgb: the gauge's ink colour; k: how far it has turned cream (0 = ink, 1 = cream)
    frame(t, dt, r, frac, fgRgb, k) {
      if (!active) return;
      odo.set(r);
      if (tight) return;
      const Lt = y0 + (y1 - y0) * clamp(frac, 0, 1);
      if (L == null || reduced) { L = Lt; Lv = 0; }
      else {
        // a stretchy line: the lead follows the dive and bobs once or twice when it stops
        Lv += (120 * (Lt - L) - 8 * Lv) * dt;
        L += Lv * dt;
      }
      // the colour string is rebuilt only when the ink actually turns
      if (k !== lastK || fgCss === "") { lastK = k; fgCss = `rgb(${fgRgb[0]},${fgRgb[1]},${fgRgb[2]})`; dirty = true; }
      const moved = Math.abs(L - drawnL) > 0.04;
      acc += dt;
      // every frame while the lead moves; about 30 times a second while it only sways; never when still
      if (!dirty && !moved && (reduced || acc < 1 / 30)) return;
      const a = reduced ? 0 : 0.06 * Math.sin(t * 0.83) + 0.025 * Math.sin(t * 1.93 + 1.3) - clamp(Lv * 0.0016, -0.12, 0.12);
      acc = 0;
      dirty = false;
      drawnL = L;
      drawLine(L, a, fgCss, k < 0.5);
    },
  };
}
