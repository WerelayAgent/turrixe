// vault: my glass jar and the live numbers next to it.
// Every fee is a bubble that wobbles up from the air stone and packs under the cork; burns pop bubbles into ink.
// The numbers are serif odometers on wet reels, each with a tiny ink glyph in its own glass bubble.
// A small me sits on the cork and watches you. Tap the glass and I say something about it.
import { live as isLive } from "../data/live.js";
import { createJar } from "./vault/jar.js";
import { createOdometer } from "./vault/odometer.js";
import { createGlyph } from "./vault/glyphs.js";
import { live } from "../core/live.js";

const STATS = [
  { k: "fees", src: "feesSol", label: "Fees collected", unit: "SOL", dec: 3, note: "Everything the trades have dropped in my jar." },
  { k: "burned", src: "burnedTokens", label: "Burned", lunit: "TRXE", dec: 0, note: "Bought back and burned. I don't miss them." },
  { k: "holders", src: "holders", label: "Holders", lunit: "wallets", dec: 0, note: "I count them more often than I should." },
  { k: "paid", src: "paidSol", label: "Paid out", lunit: "SOL", dec: 2, note: "Handed back to the people who earned it." },
  { k: "versions", src: "versions", label: "Brains so far", unit: "", dec: 0, note: "This one included." },
];
const TAPS = [
  "Please don't tap the glass.",
  "Those are fees. They scare easily.",
  "It's sealed. I checked twice.",
  "Tapping won't make it fill faster. I tried.",
  "Every bubble is somebody's trade. Be gentle.",
];

const ago = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};
const fmtFee = (v) => v.toFixed(4);

export function init(ctx) {
  const { bus, loop, pointer, ink, state, reduced, mobile } = ctx;
  const mount = document.getElementById("vault");
  if (!mount) return;

  mount.innerHTML = `
    <div class="vlt">
      <header class="vlt__head">
        <p class="vlt__kicker">${!isLive ? "The glass vault, a preview: until launch these numbers come from a simulator" : state.version > 0 ? "The glass vault, live" : "The glass vault, empty until launch"}</p>
        <h3 class="vlt__title">Every fee is a bubble in my jar.</h3>
        <p class="vlt__sub">Burns pop them. I watch it more than I should.</p>
      </header>
      <div class="vlt__stage">
        <div class="vlt__jarwrap">
          <div class="vlt__jar" role="img" aria-label="A glass jar. Every fee rises into it as a bubble, every burn pops a few.">
            <div class="vlt__keeper" aria-hidden="true"></div>
            <div class="vlt__tags" aria-hidden="true"></div>
            <p class="vlt__say" aria-live="polite"></p>
            <p class="vlt__peek" aria-hidden="true"></p>
          </div>
        </div>
        <dl class="vlt__ledger">
          ${STATS.map((s) => `
          <div class="vlt__stat vlt__stat--${s.k}" data-k="${s.k}">
            <div class="vlt__glyph"></div>
            <dt class="vlt__label">${s.label}${s.lunit ? ` <span class="vlt__lunit">in ${s.lunit}</span>` : ""}</dt>
            <dd class="vlt__value"><span class="vo" aria-hidden="true"></span>${s.unit ? `<span class="vlt__unit">${s.unit}</span>` : ""}</dd>
            <dd class="vlt__note">${s.note}</dd>
            ${s.k === "fees" ? `<dd class="vlt__live"><span class="vlt__livedot" aria-hidden="true"></span><span class="vlt__livetxt">${state.version > 0 ? "Waiting for the next trade" : "Waiting for the first trade"}</span></dd>` : ""}
          </div>`).join("")}
        </dl>
      </div>
    </div>`;

  const root = mount.querySelector(".vlt");
  const jarEl = mount.querySelector(".vlt__jar");
  const tagsEl = mount.querySelector(".vlt__tags");
  const sayEl = mount.querySelector(".vlt__say");
  const peekEl = mount.querySelector(".vlt__peek");
  const keeperEl = mount.querySelector(".vlt__keeper");
  const liveTxt = mount.querySelector(".vlt__livetxt");
  // the first brain is here: the jar is live from now on
  if (isLive) bus.on("brain:swap:done", () => { const k = mount.querySelector(".vlt__kicker"); if (k) k.textContent = "The glass vault, live"; });
  if (reduced) root.classList.add("is-reduced");

  // ---------- the jar ----------
  let tapN = 0, sayTimer = 0;
  const jar = createJar(jarEl, {
    ink, reduced, mobile,
    onTap() {
      sayEl.textContent = TAPS[tapN++ % TAPS.length];
      sayEl.classList.remove("is-on");
      void sayEl.offsetWidth;
      sayEl.classList.add("is-on");
      clearTimeout(sayTimer);
      sayTimer = setTimeout(() => sayEl.classList.remove("is-on"), 2900);
    },
  });

  // the keeper: a small me on the cork who watches the cursor and blinks (shared mark from hero-jelly)
  let keeper = null;
  import("./hero-jelly.js").then((m) => {
    if (!m.createMark) return;
    keeper = m.createMark(keeperEl, ctx, { tentacles: false });
    placeKeeper();
  }).catch(() => {});
  function placeKeeper() {
    // bell is ~550 units wide in a 584 x 380 box; make it 150 jar units wide, hem resting on the cork top (y 14)
    const s = jar.scale, k = 150 / 550, o = jar.offset;
    const w = 584 * k * s, h = 380 * k * s;
    keeperEl.style.width = `${w}px`;
    keeperEl.style.height = `${h}px`;
    keeperEl.style.left = `${o.x - 292 * k * s}px`;
    keeperEl.style.top = `${o.y + (40 - 346 * k) * s}px`;
  }

  // ---------- numbers ----------
  const stats = {};
  for (const s of STATS) {
    const row = mount.querySelector(`.vlt__stat--${s.k}`);
    const valEl = row.querySelector(".vlt__value");
    const odo = createOdometer(row.querySelector(".vo"), { decimals: s.dec, group: true, reduced });
    const glyph = createGlyph(row.querySelector(".vlt__glyph"), s.k, ctx);
    stats[s.k] = { ...s, row, valEl, odo, glyph, bumpT: 0 };
  }
  const label = (st, v) => `${v.toLocaleString("en-US", { minimumFractionDigits: st.dec, maximumFractionDigits: st.dec })}${st.unit || st.lunit ? ` ${st.unit || st.lunit}` : ""}`;
  const vals = { fees: 0, burned: 0, holders: 0, paid: 0, versions: 0 };
  const read = (v) => ({ fees: v.feesSol, burned: v.burnedTokens, holders: v.holders, paid: v.paidSol, versions: v.versions });
  Object.assign(vals, read(state.vault));
  let introduced = reduced;
  for (const k in stats) {
    const st = stats[k];
    st.valEl.setAttribute("aria-label", label(st, vals[k]));
    if (reduced) st.odo.snap(vals[k]);
    else zeroes(st);
  }
  // before the first look, show zeroes in the final shape so the count up has somewhere to go
  function zeroes(st) {
    const shape = vals[st.k].toLocaleString("en-US", { minimumFractionDigits: st.dec, maximumFractionDigits: st.dec }).replace(/\d/g, "0");
    st.row.querySelector(".vo").innerHTML = shape.replace(/0/g, '<span class="vo-d"><span class="vo-reel"><i>0</i></span></span>').replace(/([,.])/g, '<span class="vo-s">$1</span>');
  }

  let now = 0;
  function bump(st, amount = 1) {
    st.glyph.kick(amount);
    st.row.classList.remove("is-bump");
    void st.row.offsetWidth;
    st.row.classList.add("is-bump");
  }
  function setStat(k, v) {
    const st = stats[k];
    if (v == null || !Number.isFinite(v)) return;
    const prev = vals[k];
    vals[k] = v;
    st.valEl.setAttribute("aria-label", label(st, v));
    if (!introduced) return;
    if (st.odo.set(v, now)) bump(st, v > prev ? 1 : 0.6);
  }

  // ---------- live feed ----------
  let lastFee = null, lastFeeAt = 0;
  const offs = [];
  offs.push(bus.on("vault", (v) => {
    if (!v) return;
    const next = read(v);
    const dBurn = next.burned - vals.burned;
    if (v.lastFee > 0 && next.fees > vals.fees) {
      lastFee = v.lastFee; lastFeeAt = Date.now();
      let tag = null;
      if (visible && !reduced) {
        tag = document.createElement("span");
        tag.className = "vlt__tag";
        tag.textContent = `+${fmtFee(v.lastFee)}`;
        tagsEl.appendChild(tag);
      }
      jar.addFee(v.lastFee, lastFeeAt, tag);
      updateLive();
    }
    if (dBurn > 0) {
      const popped = jar.burn(1 + (dBurn > 12000 ? 1 : 0) + (dBurn > 24000 ? 1 : 0));
      if (popped && visible) {
        const c = jar.toClient(0, 200);
        bus.emit("sfx", { name: "splat" });
        bus.emit("ripple", { x: c.x, y: c.y, strength: 0.25 });
      }
    }
    for (const k in next) setStat(k, next[k]);
  }));
  offs.push(bus.on("journal:add", (e) => { if (e?.v) setStat("versions", Math.max(vals.versions, e.v)); }));
  offs.push(bus.on("brain:swap:start", () => { if (visible) jar.quake(); }));

  function updateLive() {
    if (lastFee == null) return;
    liveTxt.innerHTML = `Last fee <b>+${fmtFee(lastFee)} SOL</b>, ${ago(Date.now() - lastFeeAt)}`;
  }

  // ---------- glass colour follows the water ----------
  const rootStyle = document.documentElement.style;
  const hex = (h) => { const n = parseInt(String(h).trim().replace("#", ""), 16); return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : null; };
  const FIELD = hex(getComputedStyle(document.documentElement).getPropertyValue("--field")) || [139, 99, 245];
  let lastBg = "";
  function syncGlass() {
    const bg = live.bg || rootStyle.getPropertyValue("--bg") || getComputedStyle(document.documentElement).getPropertyValue("--bg");
    if (bg === lastBg) return;
    lastBg = bg;
    const b = hex(bg) || FIELD;
    const m = FIELD.map((c, i) => Math.round(c * 0.86 + b[i] * 0.14));
    jar.setGlass(`rgb(${m.join(",")})`);
  }
  syncGlass();

  // ---------- pointer: stir, peek, tap ----------
  let over = false;
  jarEl.addEventListener("pointerenter", () => { over = true; });
  jarEl.addEventListener("pointerleave", () => { over = false; jar.setStir(null); peekEl.classList.remove("is-on"); });
  jarEl.addEventListener("pointerdown", (e) => {
    const p = jar.toJar(e.clientX, e.clientY);
    if (!jar.isInside(p.x, p.y) && !(p.y < 80 && Math.abs(p.x) < 90)) return;
    jar.tap(p.x, p.y);
    bus.emit("ripple", { x: e.clientX, y: e.clientY, strength: 0.5 });
    bus.emit("sfx", { name: "bubble" });
  });

  let peekId = 0;
  function peek() {
    if (!over || pointer.touch) return;
    const p = jar.toJar(pointer.x, pointer.y, jarBox || undefined);
    jar.setStir(reduced ? null : { x: p.x, y: p.y, vx: pointer.vx / jar.scale, vy: pointer.vy / jar.scale });
    const b = jar.hit(p.x, p.y);
    if (!b) { if (peekId) { peekEl.classList.remove("is-on"); peekId = 0; } return; }
    const txt = b.old ? "An older fee, already counted" : `${fmtFee(b.fee)} SOL, ${ago(Date.now() - b.at)}`;
    if (peekEl.textContent !== txt) peekEl.textContent = txt;
    const c = jar.toBox(b.x, b.y - b.r);
    peekEl.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y - 10)}px) translate(-50%, -100%)`;
    if (peekId !== b.id) { peekEl.classList.add("is-on"); peekId = b.id; }
  }

  // ---------- visibility, resize, first look ----------
  let visible = false;
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (e.target === root) {
        visible = e.isIntersecting;
        jar.setVisible(visible);
        root.classList.toggle("is-live", visible);
      }
      if (e.target === mount.querySelector(".vlt__ledger") && e.intersectionRatio >= 0.2 && !introduced) firstLook();
    }
  }, { threshold: [0, 0.2] });
  io.observe(root);
  io.observe(mount.querySelector(".vlt__ledger"));

  function firstLook() {
    if (introduced) return;
    introduced = true;
    for (const k in stats) {
      const st = stats[k];
      st.odo.intro(vals[k], now);
      setTimeout(() => bump(st, 0.8), 300 + 120 * STATS.findIndex((s) => s.k === k));
    }
  }
  if (reduced) { for (const k in stats) stats[k].odo.snap(vals[k]); }

  const ro = new ResizeObserver(() => requestAnimationFrame(() => { jar.resize(); placeKeeper(); if (reduced) jar.drawStatic(); }));
  ro.observe(jarEl);

  // ---------- the one loop ----------
  let tagT = 0, liveT = 0, glassT = 0;
  if (reduced) jar.drawStatic();
  // The fee tags and the peek label sit in the jar's own box, placed from jar space (jar.toBox): no layout read.
  // Only the stirring pointer needs the jar on screen, so its box is read here, before anything writes, and only
  // while the pointer is over it (read every frame, it forced a style and layout pass every frame).
  let jarBox = null;
  loop.read(() => {
    if (!visible) return;
    jarBox = over && !pointer.touch ? jarEl.getBoundingClientRect() : null;
    for (const k in stats) stats[k].glyph.readEyes?.(pointer, reduced);
  });
  loop.add((t, dt) => {
    now = t;
    if (!visible) return;
    if (t - glassT > 0.4) { glassT = t; syncGlass(); }
    for (const k in stats) { stats[k].odo.tick(t, dt); stats[k].glyph.tick(t, dt, pointer, reduced); }
    if (t - liveT > 1) { liveT = t; updateLive(); }
    if (reduced) return;
    peek();
    const pose = jar.frame(t, dt);
    if (keeper) keeperEl.style.transform = `translate3d(0, ${(pose.bob * jar.scale).toFixed(2)}px, 0) rotate(${(pose.rot * 57.3).toFixed(2)}deg)`;
    // fee tags ride their bubble, then fade once it docks
    if (t - tagT > 0.016) {
      tagT = t;
      for (const b of jar.bubbles) {
        if (!b.tag) continue;
        const c = jar.toBox(b.x + b.r + 6, b.y);
        const el = b.tag.el;
        let o = Math.min(1, b.age * 3);
        if (b.tag.fade) o *= Math.max(0, 1 - (t - b.tag.fade) / 0.7);
        el.style.opacity = o.toFixed(2);
        el.style.transform = `translate(${Math.round(c.x)}px, ${Math.round(c.y)}px) translateY(-50%)`;
        if (b.tag.fade && t - b.tag.fade > 0.7) { el.remove(); b.tag = null; }
      }
    }
  });
}
