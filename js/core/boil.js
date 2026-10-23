// "Boil": hand-drawn line shiver, like stop-motion ink. Adds an SVG filter #ink-boil whose noise seed
// steps about 8 times a second. Any element can opt in with `filter: url(#ink-boil)` (see .boil in base.css).
// Off for reduced motion and on small screens.
export function initBoil({ reduced, mobile }) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.innerHTML = `
    <filter id="ink-boil" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="2" seed="1" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="${reduced || mobile ? 0 : 3.2}" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`;
  document.body.prepend(svg);
  if (reduced || mobile) return;
  const turb = svg.querySelector("feTurbulence");
  let seed = 1;
  setInterval(() => {
    if (document.hidden) return;
    seed = (seed % 4) + 1;  // a short cycle of drawings, like animation on twos
    turb.setAttribute("seed", String(seed));
  }, 125);
}
