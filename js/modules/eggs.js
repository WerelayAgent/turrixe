// eggs: the hidden things.
// - Konami code (or, on touch, swipes up up down down left right left right, then two taps): egg {type:'brains'}.
// - Typing "brain" anywhere (or `brain` in the console): egg {type:'flip'}, the hero jelly somersaults.
// - Both secrets get inked at the bottom of the water as you type them; all the eyes on the page glance at the ink.
// - Tab hidden: "My brain is lonely" (with a count of thoughts you are missing); back: "Turri" and a glance up at you.
// - The favicon is a live canvas Turri that blinks, does the swap, and wears an ink tide ring that drains to the next brain.
// - A letter in the console for developers.
import { createStage } from "./eggs/stage.js";
import { createFavicon } from "./eggs/favicon.js";
import { greetDevs } from "./eggs/devconsole.js";

const KONAMI = ["up", "up", "down", "down", "left", "right", "left", "right", "b", "a"];
const WORD = ["b", "r", "a", "i", "n"];
const ARROWS = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
const GAP = 2600;     // ms of silence that forgets a half-typed secret
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Longest prefix of `seq` that is a suffix of what was matched so far plus the new token (a tiny KMP)
function advance(seq, p, tok, eq = (a, b) => a === b) {
  if (eq(seq[p], tok)) return p + 1;
  const hist = seq.slice(0, p).concat(tok);
  for (let q = Math.min(p, seq.length - 1); q > 0; q--) {
    let ok = true;
    for (let i = 0; i < q; i++) if (!eq(seq[i], hist[hist.length - q + i])) { ok = false; break; }
    if (ok) return q;
  }
  return 0;
}

const editable = (el) => el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));

export function init(ctx) {
  const { bus, config, state, reduced, params, pointer } = ctx;
  const stage = createStage(ctx);
  const fav = createFavicon(ctx);
  greetDevs(ctx, { onBrain: (src) => flip(src) });

  // ---------- the two secrets ----------
  let kp = 0, wp = 0, lastKey = 0, brainsUntil = 0, flips = 0;
  const konamiEq = (want, got) => want === got || (got === "tap" && (want === "b" || want === "a"));

  function feed(tok) {
    const t = performance.now();
    if (t - lastKey > GAP) { kp = 0; wp = 0; }
    lastKey = t;
    const k0 = kp, w0 = wp;
    kp = advance(KONAMI, kp, tok, konamiEq);
    wp = advance(WORD, wp, tok);

    if (kp === KONAMI.length) { kp = 0; wp = 0; return brains(); }
    if (wp === WORD.length) { kp = 0; wp = 0; return flip("keys"); }

    // ink only once it is clearly a secret: four arrows in, or two letters of the word
    if (kp >= 4 && kp > k0) { stage.show(KONAMI.slice(0, kp), "konami"); bus.emit("sfx", { name: "tick" }); }
    else if (wp >= 2 && wp > w0) { stage.show(WORD.slice(0, wp), "word"); bus.emit("sfx", { name: "tick" }); }
    else if ((k0 >= 4 && kp < k0) || (w0 >= 2 && wp < w0)) stage.sink();
  }
  // a half-written secret left alone sinks on its own
  ctx.loop.add(() => { if (stage.count && performance.now() - lastKey > GAP) { kp = wp = 0; stage.sink(); } });

  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || editable(e.target)) return;
    const tok = ARROWS[e.key] || (e.key?.length === 1 ? e.key.toLowerCase() : null);
    if (tok) feed(tok);
  });

  // touch: swipes are arrows (the way the finger moves), quick taps stand in for b and a
  if (pointer.touch) {
    let sx = 0, sy = 0, st = 0;
    addEventListener("touchstart", (e) => { const p = e.touches[0]; sx = p.clientX; sy = p.clientY; st = performance.now(); }, { passive: true });
    addEventListener("touchend", (e) => {
      const p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy, dt = performance.now() - st;
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if (dt < 650 && Math.max(ax, ay) > 42) feed(ax > ay ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
      else if (dt < 320 && ax < 12 && ay < 12 && kp >= 8) feed("tap");
    }, { passive: true });
  }

  function brains() {
    const c = stage.center();
    const again = performance.now() < brainsUntil;
    brainsUntil = performance.now() + 10000;
    bus.emit("egg", { type: "brains" });
    bus.emit("ripple", { x: c.x, y: c.y, strength: 0.7 });
    bus.emit("sfx", { name: "chime" });
    stage.burst();
    fav.blink();
    // the brains pop and start rising first; then Turri says something about it
    const lag = reduced ? 0 : 950;
    if (again) setTimeout(() => stage.whisper("They already have brains. Ten seconds is generous.", { hold: 3200 }), lag);
    else setTimeout(() => stage.whisper("Fine. Everyone gets a brain for ten seconds.", {
      timer: 10 - lag / 1000,
      onEnd: () => setTimeout(() => stage.whisper("And they're gone. Back to drifting.", { hold: 2600 }), 700),
    }), lag);
  }

  function heroInView() {
    const el = document.getElementById("hero-jelly");
    if (!el || !el.childElementCount) return null;
    const r = el.getBoundingClientRect();
    return r.bottom > 120 && r.top < innerHeight - 120 ? r : null;
  }

  function flip(src) {
    flips++;
    const hero = heroInView();
    bus.emit("egg", { type: "flip" });
    bus.emit("sfx", { name: "bubble" });
    if (hero) bus.emit("ripple", { x: hero.left + hero.width / 2, y: hero.top + hero.height * 0.36, strength: 0.8 });
    stage.flip();
    fav.flip();
    if (src === "console") return;
    const line = !hero && document.getElementById("hero-jelly")
      ? "I just did a somersault up there. You missed it."
      : flips === 1 ? "A somersault. I've been practicing that one."
      : flips === 2 ? "Again? This brain gets dizzy."
      : flips === 3 ? `I'll remember this for about ${config.brainMinutes} minutes.`
      : pick(["That's the one trick this brain knows. The next one might know two.", "Still the one trick. Ask my next brain."]);
    setTimeout(() => stage.whisper(line, { hold: 3400 }), reduced ? 0 : 700);
  }

  // ---------- the tab notices you leave ----------
  let awayAt = 0, missed = 0, swapAway = false, swapNow = false;
  const setTitle = () => {
    const core = swapNow ? "Changing brains. Don't look" : swapAway ? "New brain. Still lonely" : "My brain is lonely";
    document.title = (missed > 0 ? `(${missed}) ` : "") + core;
  };
  const span = (ms) => {
    const s = Math.round(ms / 1000), m = Math.round(s / 60), h = Math.round(m / 60);
    return s < 60 ? `${s} seconds` : m < 60 ? (m === 1 ? "a minute" : `${m} minutes`) : h === 1 ? "an hour" : `${h} hours`;
  };
  const onHide = () => {
    awayAt = Date.now(); missed = 0; swapAway = false; swapNow = !!state.swapping;
    setTitle();
    fav.setLonely(true);
  };
  if (document.hidden) onHide();          // opened straight into a background tab
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return onHide();
    document.title = config.name;
    fav.setLonely(false);
    fav.welcome();
    const away = Date.now() - awayAt;
    if (!awayAt || away < 4000) return;
    // it glances up at the tab strip you came back from
    bus.emit("jelly:look", { x: innerWidth * 0.3, y: -60 });
    bus.emit("sfx", { name: "bubble" });
    if (swapAway) setTimeout(() => stage.whisper(`You missed a brain. I'm v${state.version} now.`, { hold: 3800 }), 900);
    else if (away > 30000 && missed >= 2) setTimeout(() => stage.whisper(`You were gone ${span(away)}. I had ${missed} thoughts without you.`, { hold: 4200 }), 900);
  });
  bus.on("thought", () => { if (document.hidden) { missed++; setTitle(); } });
  bus.on("brain:swap:start", () => { if (document.hidden) { swapNow = true; setTitle(); } });
  bus.on("brain:swap:done", () => { swapNow = false; if (document.hidden) { swapAway = true; setTitle(); } });

  // ---------- headless test hooks: ?eggtest=konami,brain,partial,word,sheet,away&et=ms ----------
  const tests = (params.get("eggtest") || "").split(",").filter(Boolean);
  if (tests.length) {
    bus.once("ready", () => import("./eggs/test.js")
      .then((m) => m.runTests(ctx, { tests, delay: Number(params.get("et") || 400), stage, fav, feed }))
      .catch((e) => console.warn("[eggs test]", e)));
  }
}
