// The ink diff, row by row. Code is wrapped to the column so nothing runs off a phone: the font is monospace, so a
// column count is exact. A wrapped line keeps its + or − in the sign column and hangs its continuation two columns
// deeper than its own indent. Removed rows are blotted out with a black brush, one stroke per row (lift the ink to
// read what I deleted); added rows are written character by character behind a wet nib.
import { rng, seedOf, bar, drop } from "./geo.js";

export const CH = 22; // ms per written character
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const NIB = `<svg class="jr-ln__nib" viewBox="-10 -14 20 24" aria-hidden="true" focusable="false"><path d="M0 -13 C3 -6 7 -2 7 3 C7 7 4 9.5 0 9.5 C-4 9.5 -7 7 -7 3 C-7 -2 -3 -6 0 -13Z"/></svg>`;

// Where to break s so the row holds at most `room` characters: after a space if one sits in the back half of the
// row, else before a "." / "::" / "->", else after "(" "," "[" "{"; the latest such place wins, a hard cut is last.
function breakAt(s, room, from) {
  const half = Math.ceil(room * 0.45);
  let best = -1, bestP = 0, any = -1;
  for (let k = Math.max(1, from + 1); k <= room && k < s.length; k++) {
    const a = s[k - 1], b = s[k];
    let p = 0;
    if (a === " " && b !== " ") p = 3;
    else if (a !== " " && ((b === "." && a !== ".") || (b === ":" && s[k + 1] === ":" && a !== ":") || (b === "-" && s[k + 1] === ">"))) p = 2;
    else if (a === "(" || a === "," || a === "[" || a === "{") p = 1;
    if (!p) continue;
    any = k;
    if (k >= half && p >= bestP) { best = k; bestP = p; }
  }
  return best > 0 ? best : any > 0 ? any : room;
}

// One line of code as rows of at most `cols` characters
export function wrapLine(text, cols) {
  text = text.replace(/\t/g, "    ");
  cols = Math.max(10, cols | 0);
  if (text.length <= cols) return [text];
  const lead = text.length - text.trimStart().length;
  const hang = Math.min(lead + 2, Math.max(0, cols - 16));
  const pad = " ".repeat(hang), rows = [];
  let rest = text, first = true;
  while (rest.length) {
    const room = first ? cols : cols - hang;
    if (rest.length <= room) { rows.push(first ? rest : pad + rest); break; }
    const k = breakAt(rest, room, first ? lead : 0);
    rows.push((first ? "" : pad) + rest.slice(0, k).trimEnd());
    rest = rest.slice(k).trimStart();
    first = false;
  }
  return rows;
}

// The blot over one removed row, in 0.1em units: one character is 6 wide and the row box is 17 tall
function blotSVG(ink, row) {
  const n = row.length, lead = n - row.trimStart().length, seed = seedOf(row), r = rng(seed);
  const x0 = lead * 6 - 3, x1 = n * 6 + 3, L = x1 - x0;
  let d = bar(ink, x0, x1, 9.3, 9.4, seed);
  // dry bristles dragging off the end of the stroke, and a few flicked drops
  d += bar(ink, x1 - L * 0.22, x1 + 4.5, 5.6, 1.5, seed + 2) + bar(ink, x1 - L * 0.3, x1 + 3, 13.2, 1.3, seed + 3);
  for (let k = 0; k < 3; k++) d += drop(n * 6 + 7 + r() * 6, 9.3 + (r() - 0.5) * 10, 0.6 + r() * 0.9, seed + k);
  return `<svg class="jr-ln__blot" viewBox="-8 0 ${n * 6 + 22} 17" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}

// The whole diff for a column of `cols` characters (the sign column not counted). Returns the markup and how long
// the blot-then-write animation runs, in seconds.
export function codeHTML(ink, diff, cols) {
  // a removed row needs room on its right for the dry end of the stroke and its drops
  const colsDel = Math.max(10, cols - 3);
  const groups = (diff || []).map((line) => {
    const kind = line[0] === "-" ? "del" : line[0] === "+" ? "add" : "ctx";
    const text = line.slice(line[1] === " " ? 2 : 1);
    return { kind, rows: wrapLine(text, kind === "del" ? colsDel : cols) };
  });
  const delRows = groups.reduce((s, g) => s + (g.kind === "del" ? g.rows.length : 0), 0);
  let delAt = 0.25, addAt = 0.25 + delRows * 0.34 + (delRows ? 0.3 : 0), end = 0;
  const html = groups.map((g) => {
    const rows = g.rows.map((row, ri) => {
      const n = row.length, lead = n - row.trimStart().length, last = ri === g.rows.length - 1;
      const sign = ri ? "" : g.kind === "del" ? "−" : g.kind === "add" ? "+" : " ";
      const cont = ri ? " jr-ln--cont" : "";
      if (g.kind === "del") {
        const s = `<span class="jr-ln jr-ln--del${cont}" style="--at:${delAt.toFixed(2)}"><b class="jr-ln__sign">${sign}</b><span class="jr-ln__txt" style="--n:${n}">${esc(row)}${blotSVG(ink, row)}</span></span>`;
        end = Math.max(end, delAt + 0.95);
        delAt += last ? 0.36 : 0.26;
        return s;
      }
      if (g.kind === "add") {
        let chars = row.slice(0, lead);
        for (let k = lead; k < n; k++) chars += row[k] === " " ? " " : `<i style="--k:${k - lead}">${esc(row[k])}</i>`;
        const s = `<span class="jr-ln jr-ln--add${cont}" style="--at:${addAt.toFixed(2)}"><b class="jr-ln__sign">${sign}</b><span class="jr-ln__txt" style="--n:${n};--l:${lead}">${chars}${NIB}</span></span>`;
        const w = ((n - lead) * CH) / 1000;
        end = Math.max(end, addAt + w + 0.6);
        addAt += w + (last ? 0.14 : 0.06);
        return s;
      }
      return `<span class="jr-ln${cont}"><b class="jr-ln__sign">${sign}</b><span class="jr-ln__txt">${esc(row)}</span></span>`;
    }).join("");
    return `<span class="jr-lg jr-lg--${g.kind}">${rows}</span>`;
  }).join("");
  return { html, dur: end };
}
