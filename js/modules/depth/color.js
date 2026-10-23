// Water colour for the dive: field -> deep -> abyss, mixed in OKLab so the darkening stays even and never muddy.
// Also decides when text should flip from ink to cream (by real contrast, with hysteresis).

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const l2s = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToRgb(hex) {
  const h = String(hex || "").trim().replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
}

export function rgbToLab([R, G, B]) {
  const r = s2l(R / 255), g = s2l(G / 255), b = s2l(B / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function labToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.round(Math.max(0, Math.min(1, l2s(c))) * 255));
}

const mixLab = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];

export const relLum = ([R, G, B]) => 0.2126 * s2l(R / 255) + 0.7152 * s2l(G / 255) + 0.0722 * s2l(B / 255);
export const contrast = (a, b) => {
  const x = relLum(a), y = relLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// Depth (m) -> position on the palette ramp: 0 = field, 1 = deep, 2 = abyss.
// The light holds through "thinking", then drops off (a light-cline) as the tentacles arrive.
const STOPS = [
  [0, 0], [400, 0.08], [900, 0.3], [1100, 0.58], [1800, 1], [2500, 1.4], [3200, 1.75], [4000, 2],
];

export function rampAt(depth) {
  if (depth <= STOPS[0][0]) return STOPS[0][1];
  for (let i = 1; i < STOPS.length; i++) {
    const [d1, u1] = STOPS[i];
    if (depth <= d1) {
      const [d0, u0] = STOPS[i - 1];
      return u0 + (u1 - u0) * ((depth - d0) / (d1 - d0));
    }
  }
  return STOPS[STOPS.length - 1][1];
}

export function createWaterColor(palette) {
  const F = rgbToLab(palette.field), D = rgbToLab(palette.deep), A = rgbToLab(palette.abyss);
  const inkLab = rgbToLab(palette.ink), creamLab = rgbToLab(palette.cream);
  return {
    // water colour at a ramp position u (0..2)
    water(u) {
      return labToRgb(u <= 1 ? mixLab(F, D, Math.max(0, u)) : mixLab(D, A, Math.min(1, u - 1)));
    },
    // text colour for a dark amount k (0 = ink, 1 = cream)
    text(k) { return labToRgb(mixLab(inkLab, creamLab, k)); },
    // a little toward the field: the glass of a bell seen in this water
    glass(u, k = 0.45) {
      const w = u <= 1 ? mixLab(F, D, Math.max(0, u)) : mixLab(D, A, Math.min(1, u - 1));
      return labToRgb(mixLab(w, F, k));
    },
  };
}

export const css = ([r, g, b], a = 1) => (a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a.toFixed(3)})`);
export const hex = ([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
