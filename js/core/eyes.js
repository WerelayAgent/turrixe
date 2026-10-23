// The little live eyes (the live window's light, the Live link in the top bar). They make the moves the endless CSS
// animations made: three glances on a 7.5 s round and a blink every 4.7 s. Timers now, because those animations restyled
// both eyes on every frame of the page for a change that happens a few times a round. Started once per page, by
// whichever module needs it first.
const LOOK = 7500, BLINK = 4700;
// where the pupil goes, and when in the round; each glance takes .45 s (css/live-window.css)
const GLANCES = [[0.18, -1.6, 0.2], [0.46, 1.2, -1], [0.74, 0, 0]];
const SHUT_MS = 118;   // the lid closes in .1175 s, then opens in .2115 s

let started = false;

export function startEyes({ reduced = false } = {}) {
  if (started || reduced) return;
  started = true;
  const eyes = () => document.querySelectorAll(".lw__eye, .topbar__eye");
  const look = (x, y) => eyes().forEach((e) => { e.style.setProperty("--lx", `${x}px`); e.style.setProperty("--ly", `${y}px`); });
  const round = () => GLANCES.forEach(([f, x, y]) => setTimeout(() => look(x, y), f * LOOK));
  const blink = () => {
    const all = eyes();
    all.forEach((e) => e.classList.add("is-blink"));
    setTimeout(() => all.forEach((e) => e.classList.remove("is-blink")), SHUT_MS);
  };
  round();
  setInterval(round, LOOK);
  setTimeout(() => { blink(); setInterval(blink, BLINK); }, 0.93 * BLINK);
}
