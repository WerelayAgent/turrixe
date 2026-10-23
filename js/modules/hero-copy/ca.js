// The contract address pill. A hand-drawn brush loop around a mono address (or "CA drops at launch").
// Clicking copies it, throws an ink splat over the pill and writes the answer on the wet ink in cream.
import { el, svgEl, clamp, lerp, smooth, easeOut, rand, spring, blot, closedPath, capsuleLoop, mulberry32 } from "./util.js";

const MSG_OK = "Copied. Don't tell the other jellyfish.";
const MSG_EMPTY = "Nothing to copy yet. It lands here at launch.";
const MSG_FAIL = "A tentacle slipped. Select it by hand.";

async function writeClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  } catch { return false; }
}

export function createCA(mount, ctx, { onCopy, onHover } = {}) {
  const { ink, bus } = ctx;
  const reduced = !!ctx.reduced;
  mount.textContent = "";
  mount.classList.add("hc-ca-mount");
  const btn = el("button", "hc-ca", mount);
  btn.type = "button";
  const ring = svgEl("svg", { class: "hc-ca__ring", "aria-hidden": "true" }, btn);
  const ringPath = svgEl("path", {}, ring);
  const label = el("span", "hc-ca__text", btn);
  const icon = svgEl("svg", { class: "hc-ca__icon", viewBox: "0 0 24 24", "aria-hidden": "true" }, btn);
  // two overlapping ink sheets, drawn as soft blobs (the copy glyph)
  const blobD = (cx, cy, w, h, seed) => {
    const rnd = mulberry32(seed); const pts = [];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const sq = (v) => Math.sign(v) * Math.pow(Math.abs(v), 0.55);
      pts.push(ink.P(cx + sq(c) * w * (1 + (rnd() - 0.5) * 0.08), cy + sq(s) * h * (1 + (rnd() - 0.5) * 0.08)));
    }
    return closedPath(ink.spline(pts, true, 6));
  };
  svgEl("path", { d: blobD(14.5, 9.5, 5.6, 6.4, 3), class: "hc-ca__icon-back" }, icon);
  svgEl("path", { d: blobD(9.5, 14.5, 5.6, 6.4, 7), class: "hc-ca__icon-front" }, icon);
  const splat = svgEl("svg", { class: "hc-ca__splat", "aria-hidden": "true" }, btn);
  const splatPath = svgEl("path", {}, splat);
  const msg = el("span", "hc-ca__msg", btn);
  msg.setAttribute("aria-hidden", "true");
  const live = el("span", "hc-sr", mount);
  live.setAttribute("aria-live", "polite");

  let ca = null;
  function render() {
    ca = (ctx.config.ca || "").trim();
    label.textContent = "";
    if (ca) {
      el("span", "hc-ca__k", label).textContent = "CA";
      el("span", "hc-ca__v hc-ca__full", label).textContent = ca;
      el("span", "hc-ca__v hc-ca__short", label).textContent = ca.length > 14 ? `${ca.slice(0, 6)}…${ca.slice(-5)}` : ca;
      btn.setAttribute("aria-label", `Copy contract address ${ca}`);
      btn.classList.remove("is-empty");
    } else {
      el("span", "hc-ca__v", label).textContent = "CA drops at launch";
      btn.setAttribute("aria-label", "Contract address drops at launch");
      btn.classList.add("is-empty");
    }
    measure();
  }

  // ring geometry
  let W = 0, H = 0;
  const seed = 11 + Math.floor(Math.random() * 50);
  function measure() {
    W = btn.offsetWidth; H = btn.offsetHeight;
    const pad = 10;
    ring.setAttribute("viewBox", `${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`);
    ring.style.cssText = `left:${-pad}px;top:${-pad}px;width:${W + pad * 2}px;height:${H + pad * 2}px`;
    drawRing(0, 1);
  }
  function drawRing(t, wob) {
    if (!W) return;
    const pts = capsuleLoop(W, H, { seed, wob, t, overshoot: 0.08, pad: -1 });
    ringPath.setAttribute("d", ink.brush(pts, (u) => {
      // pressure: heavy where the brush lands, light on the far side, a flick at the end
      const k = 1.3 + 1.5 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.6) * (0.75 + 0.25 * Math.cos(u * 9 + seed));
      return u > 0.9 ? k * (1 - (u - 0.9) / 0.1 * 0.7) : k;
    }));
  }

  // springs for the jelly feel
  const sx = { x: 1, v: 0 }, sy = { x: 1, v: 0 };
  let hover = false, wob = 1, lastRing = 0;
  btn.addEventListener("pointerenter", () => {
    hover = true; sx.v += 1.6; sy.v -= 1.2;
    const r = btn.getBoundingClientRect();
    onHover?.(r.left + r.width / 2, r.top + r.height / 2);
  });
  btn.addEventListener("pointerleave", () => { hover = false; });
  btn.addEventListener("pointerdown", () => { sx.v += 3.2; sy.v -= 4.2; });

  // splat state
  let sp = null;
  btn.addEventListener("click", async (e) => {
    const r = btn.getBoundingClientRect();
    const x = e.clientX || r.left + r.width / 2, y = e.clientY || r.top + r.height / 2;
    let text = MSG_EMPTY;
    if (ca) text = (await writeClipboard(ca)) ? MSG_OK : MSG_FAIL;
    showSplat(text, x - r.left, y - r.top);
    live.textContent = text;
    bus.emit("ripple", { x, y, strength: 0.75 });
    bus.emit("sfx", { name: "splat" });
    onCopy?.(x, y, !!ca);
  });

  function showSplat(text, ox, oy) {
    // two short lines read better on a round splat than one long one
    const cut = text.indexOf(". ");
    msg.textContent = "";
    if (cut > 0) {
      el("span", "hc-ca__line", msg).textContent = text.slice(0, cut + 1);
      msg.appendChild(document.createElement("br"));
      el("span", "hc-ca__line", msg).textContent = text.slice(cut + 2);
    } else msg.textContent = text;
    // colour: the splat is the text colour, the message the opposite
    const c = getComputedStyle(btn).color.match(/\d+/g)?.map(Number) || [11, 11, 11];
    const darkInk = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11 < 128;
    btn.style.setProperty("--hc-msg", darkInk ? "var(--cream)" : "var(--ink)");
    const mw = msg.offsetWidth, mh = msg.offsetHeight;
    const cx = mw / 2 + msg.offsetLeft, cy = mh / 2 + msg.offsetTop;
    const R = mh / 2 + 15;
    // a row of dabs along the message, each landing a little after the last, spreading from the finger
    const n = Math.max(1, Math.ceil((mw + 30) / (R * 1.5)));
    const x0 = msg.offsetLeft - 8, x1 = msg.offsetLeft + mw + 8;
    const dabs = Array.from({ length: n }, (_, i) => {
      const x = n === 1 ? cx : x0 + R * 0.6 + ((x1 - x0 - R * 1.2) * i) / (n - 1);
      return { x, y: cy + rand(-0.12, 0.12) * R, r: R * rand(0.92, 1.12), seed: Math.floor(rand(1, 999)), delay: Math.abs(x - ox) / 900 };
    });
    sp = { t0: performance.now() / 1000, cx, cy, R, ox, oy, dabs, seed: Math.floor(rand(1, 999)), text };
    const big = Math.max(mw, W) + 160;
    splat.setAttribute("viewBox", `${-80} ${-80} ${big} ${Math.max(mh, H) + 160}`);
    splat.style.cssText = `left:-80px;top:-80px;width:${big}px;height:${Math.max(mh, H) + 160}px`;
    btn.classList.add("is-splat");
    if (reduced) { drawSplat(5, 0); }
  }
  function drawSplat(u, dissolve) {
    const s = sp;
    let d = "";
    s.dabs.forEach((b, i) => {
      const g = clamp((u - b.delay) / 0.4, 0, 1);
      if (g <= 0) return;
      const rnd = mulberry32(b.seed + 3);
      // each dab is thrown from the finger toward its spot
      const k = easeOut(clamp(g * 1.8, 0, 1));
      const x = lerp(s.ox, b.x, k), y = lerp(s.oy, b.y, k) + dissolve * (6 + 8 * rnd());
      const bl = blot(x, y, b.r * (1 + dissolve * 0.2), b.seed, g * (i === 0 ? 1 : 0.85), { n: 72, sx: 1.12, sy: 1 });
      d += closedPath(bl.pts);
      for (const t of bl.tend) {
        if (rnd() < 0.6) continue;
        const dist = (1.2 + rnd() * 0.6) * b.r * Math.max(0, g * 1.3 - 0.3);
        const rr = (1.6 + rnd() * 3.4) * Math.min(1, g * 1.5) * (1 - dissolve * 0.6);
        if (rr < 0.6) continue;
        const px = x + Math.cos(t.a) * dist * 1.12, py = y + Math.sin(t.a) * dist + dissolve * 14 * rnd();
        const pts = [];
        for (let q = 0; q < 10; q++) { const a = (q / 10) * 6.283; pts.push(ink.P(px + Math.cos(a) * rr * (1 + 0.15 * Math.sin(3 * a + t.a)), py + Math.sin(a) * rr)); }
        d += closedPath(pts);
      }
    });
    splatPath.setAttribute("d", d);
    splat.style.opacity = (1 - smooth(dissolve)).toFixed(3);
  }

  function frame(t, dt) {
    // springs
    if (!reduced) {
      const tx = hover ? 1.045 : 1, ty = hover ? 1.045 : 1;
      spring(sx, tx, dt, 210, 8); spring(sy, ty, dt, 170, 7);
      const tf = `scale(${sx.x.toFixed(4)},${sy.x.toFixed(4)})`;
      if (tf !== btn._tf) { btn.style.transform = tf; btn._tf = tf; }
      wob += ((hover ? 2.2 : 1) - wob) * (1 - Math.exp(-dt / 0.3));
      if (t - lastRing > (hover ? 1 / 40 : 1 / 12)) { drawRing(t, wob); lastRing = t; }
    }
    if (sp) {
      const u = t - sp.t0;
      if (!reduced) {
        const dis = clamp((u - 2.5) / 1.0, 0, 1);
        if (u < 1.2 || dis > 0) drawSplat(u, dis);
        msg.style.opacity = u < 0.22 ? "0" : (smooth((u - 0.22) / 0.25) * (1 - smooth((u - 2.3) / 0.5))).toFixed(3);
      } else {
        msg.style.opacity = u < 2.6 ? "1" : "0";
      }
      if (u > 3.6) {
        sp = null; btn.classList.remove("is-splat"); splatPath.setAttribute("d", ""); msg.style.opacity = "0";
      }
    }
  }

  render();
  let lastCA = ctx.config.ca;
  const off = bus.on("brain:countdown", () => { if (ctx.config.ca !== lastCA) { lastCA = ctx.config.ca; render(); } });
  return { btn, frame, measure, render, destroy: off };
}
