// The violet void behind the loader story, on one 2D canvas: the flat field, a few drifting specks that the drop's
// impact shoves aside, and at the end a ripple whose wobbly ring washes the void away to show the page beneath.
import { clamp, smoothstep, easeOutCubic, rand } from "../hero-jelly/util.js";

const TAU = Math.PI * 2;

export function createVoid(canvas, { field, cream, ink }) {
  const g = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  const specks = [];
  let hole = null;      // { x, y, t0, dur, rmax }
  let clear = false;    // the ripple has passed the far corner: nothing left to draw

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    if (!specks.length) {
      const n = Math.round(clamp((W * H) / 42000, 12, 30));
      for (let i = 0; i < n; i++) {
        specks.push({
          x: Math.random() * W, y: Math.random() * H, z: rand(0.35, 1), r: rand(0.8, 2.1),
          rot: rand(0, Math.PI), ph: rand(0, TAU), cream: Math.random() < 0.7, vx: 0, vy: 0,
        });
      }
    }
  }

  // the drop hits the surface: every speck near it is pushed outward, harder the closer it is
  function shock(x, y, strength = 1) {
    for (const s of specks) {
      const dx = s.x - x, dy = s.y - y, d = Math.hypot(dx, dy) || 1;
      const f = strength * 150 * Math.exp(-d / 260) * s.z;
      s.vx += (dx / d) * f; s.vy += (dy / d) * f * 0.6;
    }
  }

  function wash(x, y, t0, dur = 1.15) {
    const far = Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y));
    hole = { x, y, t0, dur, rmax: far + 60 };
  }

  function circle(x, y, R, t, ph) {
    const n = 140;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU;
      const k = 1 + 0.028 * Math.sin(5 * a + ph + t * 2.2) + 0.016 * Math.sin(11 * a - t * 3.1 + ph * 2);
      const px = x + Math.cos(a) * R * k, py = y + Math.sin(a) * R * k;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath();
  }

  function draw(t, dt) {
    if (clear) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.fillStyle = field;
    g.fillRect(0, 0, W, H);

    // marine snow: a few specks sinking slowly, swaying, twinkling a little
    const damp = Math.exp(-dt * 2.4);
    for (const s of specks) {
      s.vx *= damp; s.vy *= damp;
      s.x += (s.vx + Math.sin(t * 0.37 + s.ph) * 4 * s.z) * dt;
      s.y += (s.vy + 6 * s.z) * dt;
      if (s.y > H + 6) { s.y = -6; s.x = Math.random() * W; }
      if (s.x < -6) s.x = W + 6; else if (s.x > W + 6) s.x = -6;
      g.globalAlpha = (s.cream ? 0.5 : 0.32) * s.z * (0.72 + 0.28 * Math.sin(t * 1.3 + s.ph));
      g.fillStyle = s.cream ? cream : ink;
      g.beginPath();
      g.ellipse(s.x, s.y, s.r * s.z * 1.35, s.r * s.z, s.rot + t * 0.15, 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;

    if (!hole) return;
    const u = clamp((t - hole.t0) / hole.dur);
    if (u <= 0) return;
    const R = hole.rmax * (0.62 * easeOutCubic(u) + 0.38 * u * u);
    g.globalCompositeOperation = "destination-out";
    g.beginPath();
    circle(hole.x, hole.y, R, t, 0);
    g.fill();
    g.globalCompositeOperation = "source-over";
    // the crest of the ripple: a cream band that thins and fades as it spreads
    const fade = 1 - smoothstep((u - 0.2) / 0.8);
    if (fade > 0.01) {
      const w = 1.2 + 3.2 * (1 - u);
      g.globalAlpha = 0.55 * fade;
      g.fillStyle = cream;
      g.beginPath();
      circle(hole.x, hole.y, R + w, t, 0);
      circle(hole.x, hole.y, R, t, 0);
      g.fill("evenodd");
      g.globalAlpha = 1;
    }
    if (u >= 1) { clear = true; g.clearRect(0, 0, W, H); }
  }

  return { resize, shock, wash, draw, get clear() { return clear; } };
}
