// swap: the brain-swap ceremony for anyone who is not at the surface. A small Turri rises in the corner and
// plays the transplant itself; one hand-pulled ink stroke wipes across the water carrying "v7 → v8" in cream;
// the hook diff falls onto the stroke as chips. Non-blocking (pointer-events none), with a close link.
// The hero plays its own ceremony, so this only takes over when the hero is out of view.
import { createJelly } from "./hero-jelly.js";
import {
  clamp, lerp, smooth, easeOut3, easeOut4, easeInOut3, easeOutBack, rng, buildBand, pointAt, bandPath, blobPath, ringPath, ribbon,
} from "./swap/geo.js";

const LINES = {
  start: "Hold still. I'm changing brains.",
  mid: "Out goes the old one. It meant well.",
  done: "Same coin. New brain.",
};
// the very first brain (at launch) replaces nothing
const FIRST = {
  start: "Hold still. My first brain is going in.",
  mid: "No old one to throw out. That was quick.",
  done: "Same coin. First brain.",
};
const r1 = (v) => Math.round(v * 10) / 10;

export function init(ctx) {
  const mount = document.getElementById("swap-overlay");
  if (!mount || !ctx.assets?.jelly) return;
  const { bus, state, ink } = ctx;
  const HOOKS = ctx.content?.HOOKS || {};
  const reduced = !!ctx.reduced;
  const debug = !!ctx.params?.has?.("debug");
  const cost = { n: 0, sum: 0, max: 0 };
  if (debug) window.__swapCost = cost;     // ?debug: per-frame cost of the ceremony, for perf checks

  // ---------- DOM (built once, reused by every ceremony) ----------
  mount.classList.add("sw");
  mount.innerHTML = `
    <p class="sw-sr"></p>
    <div class="sw-chips" aria-hidden="true"></div>
    <svg class="sw-ink" aria-hidden="true" focusable="false">
      <path class="sw-husk" opacity="0"/><path class="sw-wisps"/><path class="sw-band" fill-rule="evenodd"/><path class="sw-drops"/><path class="sw-glint"/>
    </svg>
    <div class="sw-type">
      <p class="sw-kicker" aria-hidden="true"><span class="sw-kicker__t"></span></p>
      <span class="sw-ver sw-ver--old" aria-hidden="true"></span>
      <span class="sw-arrow" aria-hidden="true"><svg viewBox="0 0 120 60" focusable="false"><path/></svg></span>
      <span class="sw-ver sw-ver--new" aria-hidden="true"></span>
      <p class="sw-meta" aria-hidden="true"></p>
      <button class="sw-close" type="button" aria-label="Close the brain swap">Close<svg viewBox="0 0 60 8" aria-hidden="true" focusable="false"><path/></svg></button>
    </div>
    <div class="sw-pip" aria-hidden="true"></div>`;
  const $ = (q) => mount.querySelector(q);
  const srEl = $(".sw-sr"), svg = $(".sw-ink"), bandEl = $(".sw-band"), dropsEl = $(".sw-drops"), glintEl = $(".sw-glint"), wispsEl = $(".sw-wisps");
  const huskEl = $(".sw-husk");
  huskEl.setAttribute("d", ctx.assets.jelly.brain.d);
  const typeEl = $(".sw-type"), oldEl = $(".sw-ver--old"), newEl = $(".sw-ver--new"), arrowWrap = $(".sw-arrow"), arrowP = $(".sw-arrow path");
  const chipsEl = $(".sw-chips"), kickEl = $(".sw-kicker"), kickT = $(".sw-kicker__t"), closeBtn = $(".sw-close"), metaEl = $(".sw-meta"), pipEl = $(".sw-pip");
  closeBtn.querySelector("path").setAttribute("d", ink.brush(ink.spline([ink.P(2, 4.6), ink.P(20, 3.2), ink.P(40, 4.4), ink.P(58, 3.4)], false, 10), (t) => 0.9 + 2.2 * Math.sin(Math.PI * t)));

  // ---------- live state ----------
  let phase = "idle", info = null, dismissed = false;
  let S = null;            // the ceremony on screen, or null
  let G = null;            // stroke geometry for the current layout
  let off = new Float32Array(1024);
  let removeLoop = null;
  let W = innerWidth, H = innerHeight;

  const heroEl = document.getElementById("hero-jelly"), surfaceEl = document.getElementById("surface");
  function heroInView() {
    const el = heroEl && heroEl.offsetHeight ? heroEl : surfaceEl;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const h = Math.min(r.height, innerHeight);
    if (h < 4) return false;
    return Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) > h * 0.35;
  }

  function glyphs(el, text, cls = "") {
    return [...String(text)].map((ch, i) => {
      const g = document.createElement("span");
      g.className = `sw-g ${cls}`.trim();
      g.textContent = ch;
      g.style.setProperty("--i", i);
      el.appendChild(g);
      return g;
    });
  }

  const metaText = (e) => (G?.mobile ? `build ${e.hash}` : `build ${e.hash}, ${e.lines} lines`);

  let kTimer = 0;
  function setKicker(text) {
    clearTimeout(kTimer);
    if (kickT.textContent === text) return;
    const swapIn = () => { kickT.textContent = text; void kickT.offsetWidth; kickT.classList.add("is-in"); };
    if (kickT.textContent && !reduced) { kickT.classList.remove("is-in"); kTimer = setTimeout(swapIn, 280); } else swapIn();
  }

  // ---------- open / layout ----------
  function open(late) {
    if (S) teardown();
    dismissed = false;
    const from = info?.from ?? Math.max(0, (state.version || 1) - 1), to = info?.to ?? from + 1;
    const now = performance.now();
    S = {
      t0: now, from, to, late, did: {}, seed: (to * 7919 + 13) >>> 0,
      tMid: 0, tDone: 0, tExit: 0, exitAt: 0, arrowT: 0, meta: null, chips: [], gl: [], pip: null,
    };
    // the words
    oldEl.textContent = ""; newEl.textContent = "";
    S.gOld = glyphs(oldEl, from > 0 ? `v${from}` : "");
    S.gNewV = glyphs(newEl, "v");
    const num = document.createElement("span");
    num.className = "sw-num";
    newEl.appendChild(num);
    S.gNum = glyphs(num, String(to), "sw-g--pop");
    const bub = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    bub.setAttribute("class", "sw-bubble");
    bub.setAttribute("viewBox", "0 0 100 100");
    bub.setAttribute("aria-hidden", "true");
    bub.innerHTML = `<path d="${ringPath(44, 58, 30, 7.5, (to % 7) + 1)}${ringPath(80, 22, 12, 4.5, (to % 5) + 3)}" fill-rule="evenodd"/>`;
    num.appendChild(bub);
    S.bubble = bub;
    S.gNewV.forEach((g) => g.style.setProperty("--i", 0));
    S.gNum.forEach((g, i) => g.style.setProperty("--i", i + 1));
    arrowWrap.classList.remove("is-out");
    arrowP.setAttribute("d", "");
    typeEl.classList.remove("is-live", "is-beat");
    kickT.textContent = ""; kickT.classList.remove("is-in");
    metaEl.textContent = "";
    // the diff chips
    chipsEl.textContent = "";
    const list = [];
    if (info?.remove) list.push({ kind: "del", text: `− ${HOOKS[info.remove]?.name ?? info.remove}` });
    if (info?.add) list.push({ kind: "add", text: `+ ${HOOKS[info.add]?.name ?? info.add}` });
    if (!list.length) list.push({ kind: "same", text: "Same hooks" });
    const R = rng(S.seed);
    S.chips = list.map((c, i) => {
      const el = document.createElement("div");
      el.className = `sw-chip sw-chip--${c.kind}`;
      el.innerHTML = `<svg class="sw-chip__ink" aria-hidden="true" focusable="false"><path/></svg><span class="sw-chip__t"></span>${c.kind === "del" ? '<svg class="sw-chip__strike" aria-hidden="true" focusable="false"><path/></svg>' : ""}`;
      el.querySelector(".sw-chip__t").textContent = c.text;
      chipsEl.appendChild(el);
      return { ...c, el, i, x: 0, y: -999, vy: 0, vx: 0, rot: (R() - 0.5) * 22, vrot: (R() - 0.5) * 90, tilt: (R() - 0.5) * 1.2, squash: 0, state: "wait", tDrop: 0, landed: false, tStrike: 0, tOff: 0 };
    });

    mount.classList.remove("is-leaving");
    mount.classList.add("is-on");
    srEl.textContent = from > 0 ? `Changing brains: v${from} to v${to}.` : `The first brain, v${to}.`;
    layout();

    // the pip: a small Turri that plays the transplant in the corner
    pipEl.classList.remove("is-in", "is-out");
    try {
      S.pip = createJelly(pipEl, { ctx, hooks: state.hooks.slice(), follow: true, labels: false, sleepy: false, scale: 1 });
      S.pip.swap("start", info || {});
      if (phase === "mid" || phase === "done") S.pip.swap("mid", info || {});
      if (phase === "done") S.pip.swap("done", info || {});
    } catch (err) {
      console.warn("[swap] pip", err);
    }
    void pipEl.offsetWidth;
    pipEl.classList.add("is-in");

    if (phase === "mid" || phase === "done") onMid(true);
    if (phase === "done") onDone();
    if (reduced) {
      render(performance.now(), 0);
      const me = S;
      setTimeout(() => { if (S === me && !S.tDone) exit("auto"); }, 10000);   // never hang around if done never comes
    }
    else if (!removeLoop) {
      removeLoop = ctx.loop.add((t, dt) => {
        if (!S) return;
        const a = performance.now();
        render(a, dt);
        if (debug) { const c = performance.now() - a; cost.n++; cost.sum += c; cost.max = Math.max(cost.max, c); }
      });
    }
  }

  function layout() {
    if (!S) return;
    W = innerWidth; H = innerHeight;
    const mobile = W < 720;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    typeEl.classList.add("is-measure");
    typeEl.style.fontSize = "100px";
    const em = typeEl.offsetWidth / 100;
    const left0 = mobile ? Math.max(16, W * 0.055) : Math.max(56, W * 0.115);
    const rightLimit = mobile ? W : W - Math.max(150, W * 0.105);
    const tailEm = mobile ? 0 : 1.7;
    let fs = (rightLimit - left0 * (mobile ? 2 : 1)) / (em + (mobile ? 0.2 : 0.45) + tailEm);
    fs = clamp(fs, mobile ? 40 : 60, mobile ? 70 : 136);
    fs = Math.min(fs, H * (mobile ? 0.09 : 0.15));
    typeEl.style.fontSize = `${fs.toFixed(1)}px`;
    const TW = typeEl.offsetWidth;
    // on wide screens the leftover width is shared: the words drift right, the tail grows longer
    const extra = mobile ? 0 : Math.max(0, rightLimit - left0 - fs * (em + 0.45 + tailEm));
    const textLeft = mobile ? Math.round((W - TW) / 2) : left0 + extra * 0.4;
    const tail = fs * tailEm + extra * 0.6;
    // the stroke is thick enough to carry the kicker above the numbers and the build line below them
    const lineH = Math.max(kickEl.offsetHeight, metaEl.offsetHeight, mobile ? 17 : 23);
    const T = fs * 1.2 + lineH * 2 + (mobile ? 4 : 6);
    const yText = H * (mobile ? 0.55 : 0.5);
    G = buildBand(ink, { W, H, fs, T, textLeft, TW, yText, slope: mobile ? -0.06 : -0.045, tail, rightLimit, mobile, seed: S.seed });
    G.T = T; G.fs = fs; G.mobile = mobile;
    if (off.length < G.n) off = new Float32Array(G.n * 2);
    off.fill(0);
    // where each glyph sits along the stroke (the wipe erases them in reading order)
    S.sText = G.sOfX(textLeft + TW / 2);
    const local = (el) => { let x = el.offsetLeft + el.offsetWidth / 2, p = el.offsetParent; while (p && p !== typeEl) { x += p.offsetLeft; p = p.offsetParent; } return x; };
    S.gl = [...S.gOld, ...S.gNewV, ...S.gNum].map((el) => ({ el, s: S.sText + local(el) - TW / 2 }));
    S.sArrow = S.sText + local(arrowWrap) - TW / 2;
    typeEl.classList.remove("is-measure");

    // glint: wet ink along the upper edge of the tail
    const g0 = lerp(G.sBody, G.sCurl, 0.04), g1 = lerp(G.sBody, G.sCurl, 0.42);
    const gp = [];
    for (let v = g0; v <= g1; v += 5) gp.push(v);
    S.glint = gp;

    // chips rest on the top edge of the stroke, over the new version
    const sizes = S.chips.map((c) => {
      const t = c.el.querySelector(".sw-chip__t");
      return { w: t.offsetWidth, h: t.offsetHeight };
    });
    const pad = mobile ? 8 : 10, gap = mobile ? 14 : 18;
    let total = 0;
    sizes.forEach((z, i) => { total += z.w + pad * 2 + (i ? gap : 0); });
    const limit = mobile ? W - 12 : G.x3 + fs * 0.6;
    let x0 = textLeft + TW * (mobile ? 0.3 : 0.55);
    if (x0 + total > limit) x0 = Math.max(textLeft, limit - total);
    S.chips.forEach((c, i) => {
      const z = sizes[i];
      const cw = z.w + pad * 2, ch = z.h + (mobile ? 9 : 11);
      c.w = cw; c.h = ch;
      c.x = x0 + cw / 2;
      x0 += cw + gap;
      c.el.style.width = `${cw}px`; c.el.style.height = `${ch}px`;
      const ink2 = c.el.querySelector(".sw-chip__ink");
      ink2.setAttribute("viewBox", `0 0 ${r1(cw)} ${r1(ch)}`);
      ink2.firstChild.setAttribute("d", blobPath(ink, cw, ch, S.seed + i * 31));
      const st = c.el.querySelector(".sw-chip__strike");
      if (st) st.setAttribute("viewBox", `0 0 ${r1(cw)} ${r1(ch)}`);
    });
    if (reduced) render(performance.now(), 0);
  }

  // ---------- stages ----------
  function onMid(instant) {
    if (!S || S.tMid) return;
    S.tMid = performance.now() - (instant ? 400 : 0);
  }
  function onDone() {
    if (!S || S.tDone) return;
    if (!S.tMid) onMid(true);
    S.tDone = performance.now();
    srEl.textContent = `v${S.to} is live.`;
    if (reduced) { const me = S; setTimeout(() => { if (S === me) exit("auto"); }, 2600); }
  }

  function exit(why) {
    if (!S || S.tExit) return;
    S.tExit = performance.now();
    // the words dissolve first, in reading order; the wipe follows
    S.gl.forEach((g, i) => { g.el.style.setProperty("--d", `${i * 45}ms`); g.el.classList.add("is-out"); });
    arrowWrap.classList.add("is-out");
    S.bubble?.classList.remove("is-on");
    mount.classList.add("is-leaving");
    pipEl.classList.add("is-out");
    if (why === "close") dismissed = true;
    if (reduced) teardown();
  }

  function teardown() {
    if (!S) return;
    try { S.pip?.destroy(); } catch (err) { console.warn("[swap] pip", err); }
    S = null;
    clearTimeout(kTimer);
    if (removeLoop) { removeLoop(); removeLoop = null; }
    mount.classList.remove("is-on", "is-leaving");
    pipEl.classList.remove("is-in", "is-out");
    huskEl.setAttribute("opacity", "0");
    bandEl.setAttribute("d", ""); dropsEl.setAttribute("d", ""); glintEl.setAttribute("d", ""); wispsEl.setAttribute("d", "");
    chipsEl.textContent = "";
    srEl.textContent = "";
  }

  // ---------- the frame ----------
  const P1 = {}, P2 = {};
  const FLAT = new Float32Array(2048);
  function smoothClosed(pts, cx, cy, k, a) {
    // quadratic curves through the midpoints of a small polygon: a soft blob
    const n = pts.length, c = Math.cos(a), s = Math.sin(a);
    const X = (p) => cx + (p[0] * c - p[1] * s) * k, Y = (p) => cy + (p[0] * s + p[1] * c) * k;
    let d = "";
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n], q = pts[(i + 1) % n];
      const mx = (X(p) + X(q)) / 2, my = (Y(p) + Y(q)) / 2;
      d += i === 0 ? `M${r1(mx)} ${r1(my)}` : `Q${r1(X(p))} ${r1(Y(p))} ${r1(mx)} ${r1(my)}`;
    }
    return d + "Z";
  }

  function once(key, cond, fn) { if (cond && !S.did[key]) { S.did[key] = true; fn(); } }

  function render(now, dt) {
    if (!S || !G) return;
    const t = now - S.t0, R = reduced;
    const fs = G.fs, T = G.T;

    // --- the timeline ---
    once("splat", t > 120, () => {
      if (R) return;
      const p = pointAt(G, T * 0.9, null);
      bus.emit("ripple", { x: Math.max(8, p.x), y: p.y, strength: 0.55 });
      bus.emit("sfx", { name: "splat" });
    });
    once("kick", t > 460 || R, () => setKicker((S.from > 0 ? LINES : FIRST).start));
    once("old", t > 520 || R, () => S.gOld.forEach((g, i) => { g.style.setProperty("--d", `${i * 110}ms`); g.classList.add("is-in"); }));
    once("arrow", t > 1100 || R || S.tMid, () => { S.arrowT = now; });
    once("newv", t > 1500 || R || S.tMid, () => S.gNewV.forEach((g) => { g.style.setProperty("--d", "0ms"); g.classList.add("is-in"); }));
    once("bubble", t > 1760 && !S.tMid && !R, () => S.bubble.classList.add("is-on"));
    once("live", t > 2300 && !R, () => typeEl.classList.add("is-live"));
    if (S.tMid) {
      once("mid", true, () => {
        S.bubble.classList.remove("is-on");
        if (S.did.bubble) S.bubble.classList.add("is-pop");
        S.gNum.forEach((g, i) => { g.style.setProperty("--d", `${R ? 0 : 90 + i * 90}ms`); g.classList.add("is-in"); });
        S.gOld.forEach((g) => g.classList.add("is-dim"));
        setKicker((S.from > 0 ? LINES : FIRST).mid);
        S.chips.forEach((c, i) => { c.tDrop = now + (R ? 0 : 260 + i * 300); });
        if (!R && S.did.bubble) bus.emit("sfx", { name: "bubble" });
      });
      if (!S.meta) {
        const e = state.journal?.at?.(-1);
        if (e && e.v === S.to) S.meta = { text: metaText(e), t0: Math.max(now, S.tMid + 900) };
      }
    }
    if (S.tDone) {
      once("done", true, () => {
        setKicker((S.from > 0 ? LINES : FIRST).done);
        if (!R) { typeEl.classList.remove("is-beat"); void typeEl.offsetWidth; typeEl.classList.add("is-beat"); }
        S.exitAt = S.tDone + (R ? 2600 : 1050);
        for (const c of S.chips) if (c.kind === "del") c.offAt = now + (R ? 0 : 260);
      });
    }
    if (!S.tExit && !S.exitAt && t > 9800) S.exitAt = now;           // never hang around if done never comes
    if (!S.tExit && S.exitAt && now >= S.exitAt) { exit("auto"); if (!S) return; }

    // --- the stroke: painted in from the left, wiped out to the right ---
    const hp = R ? 1 : easeOut4((t - 90) / 1080);
    const headS = hp * G.L;
    const tailS = S.tExit && !R ? easeInOut3((now - S.tExit - 220) / 900) * G.L : 0;
    const A = R ? 0 : T * 0.016, ph = (now / 1000) * ((Math.PI * 2) / 3.4), lam = 1 / (T * 1.9);
    for (let i = 0; i < G.n; i++) off[i] = A * Math.sin(ph - G.s[i] * lam) * Math.min(1, G.s[i] / (T * 1.4));
    const breath = R ? 1 : 1 + 0.012 * Math.sin(ph * 0.9 + 1.1);
    breathK = breath;
    bandEl.setAttribute("d", tailS < G.L - 1 && headS > 1 ? bandPath(G, tailS, headS, off, breath) : "");

    // splatter
    let dd = "";
    for (const dp of G.drops) {
      if (headS < dp.s) continue;
      if (dp.t == null || dp.t > now) dp.t = now;
      let k = R ? 1 : easeOutBack((now - dp.t) / 320, 2.4);
      if (tailS > dp.s - T * 0.3) { dp.out ??= now; k *= 1 - smooth((now - dp.out) / 260); } else dp.out = undefined;
      if (k <= 0.01) continue;
      pointAt(G, dp.s, off, P1);
      const hw = dp.side > 0 ? P1.hb : P1.ht;
      const tx = P1.ny, ty = -P1.nx;
      const x = P1.x + P1.nx * dp.side * (hw + dp.dist) + tx * dp.along, y = P1.y + P1.ny * dp.side * (hw + dp.dist) + ty * dp.along;
      dd += smoothClosed(dp.pts, x, y, k, 0);
    }
    dropsEl.setAttribute("d", dd);

    // glint: wet ink, drawn on once the head has passed it, lifted off by the wipe
    let gd = "";
    if (S.glint.length > 2 && headS > S.glint[S.glint.length - 1]) {
      S.tGlint ??= now;
      const gpro = R ? 1 : easeOut3((now - S.tGlint) / 520);
      let m = 0;
      const last = Math.max(2, Math.floor(S.glint.length * gpro));
      for (let i = 0; i < last; i++) {
        const v = S.glint[i];
        if (v < tailS + 8) continue;
        pointAt(G, v, off, P1);
        const u = i / (S.glint.length - 1);
        const o = -P1.ht * (0.56 - 0.1 * u);
        FLAT[2 * m] = P1.x + P1.nx * o; FLAT[2 * m + 1] = P1.y + P1.ny * o; m++;
      }
      const wmax = T * 0.038;
      if (m > 2) gd = ribbon(FLAT, m, (u) => 0.8 + wmax * Math.pow(Math.sin(Math.PI * clamp(u * 0.92 + 0.04)), 0.9));
    }
    glintEl.setAttribute("d", gd);

    // wisps: ink bleeding off the edges into the water
    let wd = "";
    if (hp > 0.98 || R) {
      S.tWisp ??= now;
      G.wisps.forEach((w, k) => {
        let g = R ? 1 : easeOut3((now - S.tWisp - k * 320) / 2600);
        if (S.tExit) g *= 1 - smooth((now - S.tExit) / 280);
        if (g <= 0.02) return;
        pointAt(G, w.s, off, P1);
        const hw = w.side > 0 ? P1.hb : P1.ht;
        const ox = P1.nx * w.side, oy = P1.ny * w.side;            // outward
        const tx = P1.ny, ty = -P1.nx;                              // along the stroke
        const ax = P1.x + ox * (hw - 1.5), ay = P1.y + oy * (hw - 1.5);
        const sway = R ? 0 : Math.sin(now / 1000 * 0.9 + w.seed) * 0.16;
        const cs = Math.cos(sway), sn = Math.sin(sway);
        const mTot = w.pts.length, m = Math.max(2, Math.floor(mTot * g));
        for (let i = 0; i < m; i++) {
          const p = w.pts[i];
          const u = i / mTot;
          const bend = R ? 0 : Math.sin(now / 1000 * 1.3 + w.seed + u * 3) * 5 * u * u;
          const lx = p.x * cs - p.y * sn + bend, ly = p.x * sn + p.y * cs;
          FLAT[2 * i] = ax + tx * lx + ox * ly; FLAT[2 * i + 1] = ay + ty * lx + oy * ly;
        }
        const span = m / mTot;
        wd += ribbon(FLAT, m, (u) => 0.7 + w.w0 * Math.pow(1 - u * span, 1.6));
      });
    }
    wispsEl.setAttribute("d", wd);

    // the husk: the old brain, out of ink now, sinks back down behind the pip and through its tentacles
    if (S.tMid && !R && S.pip?.bellRect && !S.husk) {
      const br = S.pip.bellRect();
      S.husk = br && br.width > 4
        ? { t0: S.tMid + 650, x0: br.x + br.width * 0.04, y0: br.y - br.width * 0.16, k: (br.width / 556) * 0.56 * 0.86, bw: br.width }
        : { dead: true };
    }
    if (S.husk && !S.husk.dead) {
      const h = S.husk, u = clamp((now - h.t0) / 3000);
      if (now >= h.t0) {
        const e = u * u * (1.7 - 0.7 * u);
        const y = h.y0 + (H + h.bw * 0.75 - h.y0) * e;
        const x = h.x0 + Math.sin(u * 3.2) * h.bw * 0.08 + u * h.bw * 0.3;
        const pulse = Math.sin(now / 1000 * 3.1) * 0.04;
        const k = h.k * (1 - 0.14 * u);
        huskEl.setAttribute("transform", `translate(${r1(x)} ${r1(y)}) rotate(${(-22 + 34 * u).toFixed(1)}) scale(${(k * (1 + pulse)).toFixed(4)} ${(k * (1 - pulse)).toFixed(4)}) translate(-1.6 14)`);
        huskEl.setAttribute("opacity", (smooth((now - h.t0) / 520) * (1 - smooth((u - 0.82) / 0.18))).toFixed(3));
        if (u >= 1) { h.dead = true; huskEl.setAttribute("opacity", "0"); }
      }
    }

    // the words ride the stroke
    pointAt(G, S.sText, off, P2);
    typeEl.style.transform = `translate(${r1(P2.x)}px, ${r1(P2.y)}px) rotate(${P2.a.toFixed(4)}rad) translate(-50%, -52%)`;

    // the arrow: a little cream tentacle that writes itself toward the empty slot
    if (S.arrowT) {
      const ap = R ? 1 : clamp((now - S.arrowT) / 620);
      drawArrow(ap, now, R);
    }

    // chips fall onto the stroke, bounce, settle on its slope; dropped hooks slide off into the dark
    for (const c of S.chips) {
      if (c.state === "wait") {
        if (!c.tDrop || now < c.tDrop) continue;
        c.state = "fall";
        c.el.classList.add("is-on");
        const rest0 = restAt(c.x, c.w, headS, tailS);
        c.y = (rest0 ? rest0.y : G.y[0]) - (R ? 0 : fs * (G.mobile ? 1.6 : 1.9) + c.i * 26);
        if (R && rest0) { c.state = "rest"; c.y = rest0.y; c.rot = rest0.a * 57.2958 + c.tilt; }
      }
      const rest = restAt(c.x, c.w, headS, tailS);
      const step = Math.min(dt || 0.016, 0.034);
      if (c.state === "fall") {
        c.vy += 2700 * step; c.y += c.vy * step;
        c.vrot += (-(c.rot - (rest ? rest.a * 57.2958 + c.tilt : c.rot)) * 30 - c.vrot * 2) * step;
        c.rot += c.vrot * step;
        if (rest && c.y >= rest.y) {
          c.y = rest.y;
          if (!c.landed) {
            c.landed = true;
            if (!R) { bus.emit("ripple", { x: c.x, y: rest.y, strength: 0.16 }); bus.emit("sfx", { name: "tick" }); }
            if (c.kind === "del") c.tStrike = now + (R ? 0 : 420);
          }
          if (c.vy > 240 && !R) { c.vy = -c.vy * 0.3; c.squash = 1; c.vrot += (Math.random() - 0.5) * 60; }
          else { c.state = "rest"; c.vy = 0; c.squash = Math.max(c.squash, 0.6); }
        }
      } else if (c.state === "rest") {
        if (!rest || (c.offAt && now >= c.offAt)) {
          c.state = "off"; c.tOff = now; c.vy = R ? 0 : -190; c.vx = R ? 0 : -22; c.vrot = -38;
        } else {
          c.y = rest.y;
          const target = rest.a * 57.2958 + c.tilt;
          c.vrot += (-(c.rot - target) * 170 - c.vrot * 13) * step;
          c.rot += c.vrot * step;
        }
      } else if (c.state === "off") {
        c.vy = Math.min(c.vy + 1250 * step, 520); c.y += c.vy * step; c.x += c.vx * step; c.rot += c.vrot * step; c.vrot *= Math.exp(-step / 0.8);
        const fade = S.tExit ? 1 - smooth((now - Math.max(c.tOff, S.tExit) - 120) / 420) : 1 - smooth((now - c.tOff - 700) / 900);
        c.el.style.opacity = fade.toFixed(3);
        if (fade <= 0 || R) { c.state = "gone"; c.el.style.opacity = "0"; }
      }
      if (c.state === "gone") continue;
      c.squash *= Math.exp(-(dt || 0.016) / 0.09);
      const sq = R ? 0 : c.squash;
      c.el.style.transform = `translate(${r1(c.x - c.w / 2)}px, ${r1(c.y - c.h)}px) rotate(${c.rot.toFixed(2)}deg) scale(${(1 + 0.12 * sq).toFixed(3)}, ${(1 - 0.16 * sq).toFixed(3)})`;
      if (c.tStrike && now >= c.tStrike) {
        const sp = R ? 1 : clamp((now - c.tStrike) / 380);
        if (sp < 1 || !c.struck) {
          if (sp >= 1) c.struck = true;
          const n = 12, y0 = c.h * 0.56, x0 = 4, x1 = c.w - 4;
          const m = Math.max(2, Math.round(n * easeOut3(sp)));
          for (let i = 0; i < m; i++) { const u = i / (n - 1); FLAT[2 * i] = lerp(x0, x1, u); FLAT[2 * i + 1] = y0 + Math.sin(u * 5.5 + c.i) * 1.3 - u * 1.6; }
          c.el.querySelector(".sw-chip__strike path").setAttribute("d", ribbon(FLAT, m, (u) => 1.2 + 2.6 * Math.sin(Math.PI * clamp(u * 0.9 + 0.05))));
        }
      }
    }

    // build hash, typed in mono
    if (S.meta && now >= S.meta.t0) {
      const n = R ? S.meta.text.length : Math.floor((now - S.meta.t0) / 22);
      if (n !== S.meta.n) { S.meta.n = n; metaEl.textContent = S.meta.text.slice(0, n); }
    }

    if (S.tExit && now - S.tExit > 1250) teardown();
  }

  // where a chip of width w centred on x rests on the stroke's top edge: a rigid card on two contact points
  let breathK = 1;
  function topAt(v) { pointAt(G, v, off, P1); return P1.y - P1.ny * P1.ht * breathK; }
  function restAt(x, w, headS, tailS) {
    const xl = x - w * 0.4, xr = x + w * 0.4;
    if (xl < 0 || xr > G.x4) return null;
    const vl = G.sOfX(xl), vr = G.sOfX(xr);
    if (vr > headS - 6 || vl < tailS + G.fs * 0.2) return null;
    const yl = topAt(vl), yr = topAt(vr), yc = topAt(G.sOfX(x));
    return { y: Math.min((yl + yr) / 2, yc) + 1.5, a: Math.atan2(yr - yl, xr - xl) };
  }

  // the arrow in its own 120 x 60 box
  const AR = [[6, 35], [30, 27], [56, 35], [80, 27], [103, 30]];
  function drawArrow(p, now, R) {
    const ctrl = AR.map(([x, y], i) => ink.P(x, y + (R ? 0 : Math.sin(now / 1000 * 2.1 + i * 1.3) * 1.6 * (i > 0 && i < 4 ? 1 : 0.4))));
    const pts = ink.spline(ctrl, false, 10);
    const m = Math.max(2, Math.round(pts.length * easeOut3(p)));
    for (let i = 0; i < m; i++) { FLAT[2 * i] = pts[i].x; FLAT[2 * i + 1] = pts[i].y; }
    const span = m / pts.length;
    let d = ribbon(FLAT, m, (u) => 2.6 + 6.2 * Math.pow(u * span, 0.55));
    // the head: two quick flicks back from the tip once the shaft arrives
    const hpro = R ? 1 : clamp((p - 0.82) / 0.18);
    if (hpro > 0) {
      const a = pts[pts.length - 3], b = pts[pts.length - 1];
      const h = Math.atan2(b.y - a.y, b.x - a.x);
      for (const sgn of [-1, 1]) {
        const ang = h + Math.PI + sgn * 0.62, len = 21 * easeOut3(hpro);
        const n = 8;
        for (let i = 0; i < n; i++) {
          const u = i / (n - 1);
          FLAT[2 * i] = b.x + Math.cos(ang) * len * u + Math.cos(ang + sgn * 1.4) * 2 * Math.sin(Math.PI * u);
          FLAT[2 * i + 1] = b.y + Math.sin(ang) * len * u + Math.sin(ang + sgn * 1.4) * 2 * Math.sin(Math.PI * u);
        }
        d += ribbon(FLAT, n, (u) => 7.6 * Math.pow(1 - u, 0.75) + 1.3);
      }
    }
    arrowP.setAttribute("d", d);
  }

  // ---------- the feed ----------
  bus.on("brain:swap:start", (p) => {
    phase = "start"; info = p || {};
    if (S) teardown();
    dismissed = false;
    if (!heroInView()) open(false);
  });
  bus.on("brain:swap:mid", (p) => {
    phase = "mid"; if (p) info = { ...info, ...p };
    if (S) { onMid(false); if (S.pip) S.pip.swap("mid", info); if (reduced) render(performance.now(), 0); }
  });
  bus.on("brain:swap:done", (p) => {
    phase = "done";
    if (S) { onDone(); if (S.pip) S.pip.swap("done", p || {}); if (reduced) render(performance.now(), 0); }
  });
  bus.on("hook:add", (e) => { if (S?.pip && e?.hook) S.pip.addHook(e.hook); });
  bus.on("hook:remove", (e) => { if (S?.pip && e?.id) S.pip.removeHook(e.id); });
  bus.on("journal:add", (e) => {
    if (!S || !e || e.v !== S.to) return;
    S.meta = { text: metaText(e), t0: Math.max(performance.now(), (S.tMid || performance.now()) + 900) };
    if (reduced) render(performance.now(), 0);
  });
  bus.on("vault", (v) => { if (S?.pip && S.tDone && !reduced) S.pip.beat?.(0.5 + Math.min(0.35, (v?.lastFee ?? 0.01) * 10), 1.05); });
  bus.on("thought", (th) => { if (S?.pip) S.pip.think?.(th); });

  // scrolled away from (or back to) the hero while a swap is under way
  let watch = 0;
  addEventListener("scroll", () => {
    if (watch || phase === "idle" || phase === "done" && !S) return;
    watch = requestAnimationFrame(() => {
      watch = 0;
      const on = heroInView();
      if (S && !S.tExit && on) exit("hero");
      else if (!S && !on && !dismissed && (phase === "start" || phase === "mid")) open(true);
    });
  }, { passive: true });
  addEventListener("resize", () => { if (S) layout(); });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && S && !S.tExit) exit("close"); });
  closeBtn.addEventListener("click", () => exit("close"));

  // test hook for headless screenshots: ?swaptest=<ms> runs a swap that long after boot
  const st = ctx.params?.get?.("swaptest");
  if (st != null) bus.once("ready", () => setTimeout(() => ctx.sim.swapNow(), Number(st) || 300));
}
