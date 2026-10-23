// Headless test hooks for the eggs (only loaded with ?eggtest=...). Not part of the page.
const KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };
const KONAMI = ["up", "up", "down", "down", "left", "right", "left", "right", "b", "a"];

export function runTests(ctx, { tests, delay, stage, fav }) {
  const press = (tok) => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: KEYS[tok] || tok, bubbles: true }));
  const typeAll = (toks, gap = 140) => toks.forEach((t, i) => setTimeout(() => press(t), i * gap));
  setTimeout(() => {
    for (const t of tests) {
      if (t === "konami") typeAll(KONAMI);
      if (t === "partial") typeAll(KONAMI.slice(0, 7));
      if (t === "brain") typeAll(["b", "r", "a", "i", "n"]);
      if (t === "word") typeAll(["b", "r", "a"]);
      if (t === "say") stage.whisper("You were gone 4 minutes. I had 6 thoughts without you.", { hold: 60000 });
      if (t === "tide") stage.whisper("Fine. Everyone gets a brain for ten seconds.", { timer: 10 });
      if (t === "sheet") sheet(ctx, fav);
      if (t === "swap") ctx.sim.swapNow();
      if (t.startsWith("to-")) { const el = document.getElementById(t.slice(3)); if (el) scrollTo({ top: el.offsetTop, behavior: "instant" }); }
      if (t === "measure") setTimeout(() => {
        const r = (el) => { const b = el.getBoundingClientRect(); return `${Math.round(b.left)}..${Math.round(b.right)} w${Math.round(b.width)}`; };
        const out = document.createElement("pre");
        out.style.cssText = "position:fixed;left:4px;top:60px;z-index:9999;background:#fff;color:#000;font:11px monospace;margin:0;padding:4px";
        const sy = stage.root.querySelector(".egg__say"), w0 = sy.querySelector(".egg__w"), bl = sy.querySelector(".egg__blot");
        out.textContent = `say ${sy.className} | ${sy.textContent.slice(0, 40)} | w0 ${w0 && getComputedStyle(w0).opacity} | blot ${getComputedStyle(bl).opacity} ${getComputedStyle(bl).transform} ${bl.getAttribute("viewBox")} | rm ${matchMedia("(prefers-reduced-motion: reduce)").matches}\niw ${innerWidth} cw ${document.documentElement.clientWidth} sw ${document.documentElement.scrollWidth}\nroot ${r(stage.root)}\nrow ${r(stage.root.querySelector(".egg__row"))}\nsay ${r(stage.root.querySelector(".egg__say"))}\ntf ${getComputedStyle(stage.root).transform}`;
        document.body.append(out);
      }, Number(ctx.params.get("mt") || 2000));
    }
  }, delay);
}

function sheet(ctx, fav) {
  const { painter } = fav;
  const states = [
    ["idle", { f: 0.72, lids: [0, 0], look: { x: 0.08, y: 0.55 } }],
    ["blink", { f: 0.72, lids: [0.6, 0.6], look: { x: 0.08, y: 0.55 } }],
    ["shut", { f: 0.72, lids: [1, 1] }],
    ["last min", { f: 0.03, pulse: 1, look: { x: -0.2, y: -0.95 } }],
    ["lonely", { f: 0.5, lids: [0.42, 0.46], look: { x: 0.92, y: 0.25 } }],
    ["swap lift", { f: 0, lids: [1, 1], brainDy: -16, brainA: 1 }],
    ["swap empty", { f: 0, lids: [1, 1], brainDy: -46, brainA: 0 }],
    ["new brain", { f: 1, wide: 1.12, look: { x: 0, y: 0.15 } }],
    ["flip", { f: 0.6, rot: 150, squash: 0.6 }],
  ];
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:8px;top:8px;z-index:9998;display:grid;grid-template-columns:repeat(9,auto);gap:10px 14px;padding:12px;background:#dee1e6;font:11px monospace;color:#222";
  const dark = document.createElement("div");
  dark.style.cssText = "grid-column:1/-1;display:flex;gap:14px;align-items:center;background:#202124;padding:8px;color:#ccc";
  for (const [name, st] of states) {
    const frame = painter.paint({ lids: [0, 0], look: { x: 0, y: 0.5 }, wide: 1, brainDy: 0, brainA: 1, rot: 0, squash: 0, pulse: 0, ...st });
    const url = frame.toDataURL();
    const cell = document.createElement("div");
    cell.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:6px";
    cell.innerHTML = `<img src="${url}" width="128" height="128" style="image-rendering:pixelated"><div style="display:flex;gap:8px;align-items:end"><img src="${url}" width="32" height="32"><img src="${url}" width="16" height="16"></div><span>${name}</span>`;
    box.append(cell);
    const d = document.createElement("span");
    d.innerHTML = `<img src="${url}" width="16" height="16"> <img src="${url}" width="32" height="32">`;
    dark.append(d);
  }
  box.append(dark);
  import("./devconsole.js").then((m) => {
    const img = document.createElement("img");
    img.src = m.paintPortrait(ctx, ctx.state.version).toDataURL();
    img.width = 280; img.height = 170;
    img.style.cssText = "grid-column:1/4";
    box.append(img);
  });
  document.body.append(box);
}
