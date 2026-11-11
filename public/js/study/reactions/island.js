// Island's two stories, a time-lapse of the surf's: wave after wave moves the island's loose sand. Happy: it takes sand off the right end and lays it
// down along the front shore, building a hooked spit out from the front left that curls round a little lagoon of shallow water. Sad: the washes run
// across the low sand between the two palms' feet instead, scouring a groove, deeper each time, until the sea runs through: two islets, a palm on each.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky, the sea, three swells, the island's wet rim, its sand and the
// shade on its right end, the short palm (trunk shade and trunk, six fronds and their crown), the tall palm (the same). The sand is an ellipse about
// (86, 158), 55 by 18 (seen from low down, a third as deep as it's wide). The light doesn't change: only the sand moves.
import { blob, n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"127\" width=\"200\" height=\"73\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M5 138.5C16 137 24 134.5 34 134.5C42 134.5 48 135.5 50 136C42 135.8 36 136 28 137C20 138.2 12 139.3 5 138.5Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M122 136.5C134 135.8 144 133.5 156 133.2C168 133 177 134 184 134.6C175 134.4 166 134.6 156 135.6C144 136.8 132 137.4 122 136.5Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M148 145.3C158 144.8 166 142.6 176 142.4C184 142.3 190 142.9 194 143.4C187 143.3 181 143.5 174 144.5C166 145.6 156 146.2 148 145.3Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><ellipse cx=\"87\" cy=\"160.2\" rx=\"55.3\" ry=\"18.2\" fill=\"var(--art-sky-deep,#3488C9)\"/><ellipse cx=\"86\" cy=\"158\" rx=\"55\" ry=\"18\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M100 140.6A55 18 0 0 1 76 175.7C100 173 120 166 120 157C120 150 111 144 100 140.6Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M122 97C110 104 100 120 94 149Q101 151 109 150C106 135 109 118 127 99Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M125 98C111 112 100 130 101 150Q105 151 109 150C106 135 109 118 127 99Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M122 98C122 86 118 76 108 70C118 66 128 70 130 80C131 86 129 92 126 98Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M124 98C118 88 110 82 102 82C96 82 91 89 89 96C98 90 110 90 122 100Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M124 97C114 94 106 96 102 100C99 103 98 107 99 110C104 103 112 99 124 100Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M123 98C128 88 136 80 144 80C150 80 154 85 156 91C146 86 136 88 125 100Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M124 98C134 92 144 94 148 100C151 105 151 112 149 117C146 108 138 100 125 100Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M125 98C132 102 136 108 135 114C134 118 132 120 129 122C130 112 128 104 123 100Z\" fill=\"var(--art-teal-deep,#25907B)\"/><ellipse cx=\"124.5\" cy=\"98.5\" rx=\"3\" ry=\"2.5\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M66 68C58 78 48 92 48 108C48 126 58 140 63 153Q73 155 84 151C78 138 63 124 60 108C58 92 64 80 73 69Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M71 70C63 81 54 94 55 108C56 124 67 138 74 153Q79 152 84 151C78 138 63 124 60 108C58 92 64 80 73 69Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M68 68C70 52 68 36 46 24C60 20 76 26 79 42C80 52 76 60 74 68Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M72 68C66 52 54 42 42 40C32 39 23 47 18 58C30 50 46 50 70 70Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M70 66C58 58 44 56 34 64C24 72 22 84 24 93C30 80 46 70 70 71Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M68 68C76 54 86 42 98 41C108 40 115 48 118 56C106 50 90 52 70 70Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M70 66C80 60 94 60 100 66C104 70 105 74 104 79C96 72 84 68 70 70Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M70 68C80 70 86 80 86 88C86 92 83 95 79 97C80 86 76 76 69 70Z\" fill=\"var(--art-teal-deep,#25907B)\"/><ellipse cx=\"70.5\" cy=\"68.5\" rx=\"4\" ry=\"3\" fill=\"var(--art-teal-deep,#25907B)\"/></svg>\n";
export const STILL_HASH = "740444d34d";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 26 || !EL[6].includes('cx="86" cy="158" rx="55" ry="18"')) throw new Error("island: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const SEA = EL.slice(0, 5).join(""), SAND = EL[5] + EL[6] + EL[7], PALMS = EL.slice(8).join("");
const P = (p) => `${n2(p[0])} ${n2(p[1])}`;
// the time-lapse both run on: slow to start, steady, slowing to the end
const years = (t) => track([[0.2, 0], [2.0, 1, "io"]], t);

// ---- happy: a spit and a lagoon
const HAPPY_DUR = 2.4;
// the island with its right end worn back: rim, sand and shade drawn narrower about the middle (x 86), the left half as it was laid over it
// (overlapping the middle by a unit, so no seam shows)
const worn = (sx) => (sx > 0.9995 ? SAND : `<g transform="translate(86 0) scale(${n4(sx)} 1) translate(-86 0)">${SAND}</g><clipPath id="lh"><path d="M0 120H87V200H0Z"/></clipPath><g clip-path="url(#lh)">${SAND}</g>`);
// the spit's middle line, from where it leaves the front shore round to its tip; its width along it
const SPIT = [[48, 170.5], [39, 176], [36.5, 182.5], [42.5, 187.8], [57, 190.5], [74, 190.2], [90, 187.5], [102, 183.5]];
const WIDE = [12, 11, 9.5, 8.5, 7.5, 6.5, 5.5, 3];
// the part of the spit laid down so far (k of it): its far (inner) and near (outer) edges
function spit(k) {
  const n = SPIT.length, L = [0]; for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(SPIT[i][0] - SPIT[i - 1][0], SPIT[i][1] - SPIT[i - 1][1]));
  const end = L[n - 1] * k, pts = [], ws = [];
  for (let i = 0; i < n; i++) { if (L[i] <= end) { pts.push(SPIT[i]); ws.push(WIDE[i]); } else { const f = (end - L[i - 1]) / (L[i] - L[i - 1]); pts.push([SPIT[i - 1][0] + (SPIT[i][0] - SPIT[i - 1][0]) * f, SPIT[i - 1][1] + (SPIT[i][1] - SPIT[i - 1][1]) * f]); ws.push(WIDE[i - 1] + (WIDE[i] - WIDE[i - 1]) * f); break; } }
  if (pts.length < 2) return null;
  const near = [], far = [];
  // (it builds out from the shore: at first thin, filling out as it lengthens)
  const fat = Math.min(1, 0.35 + k);
  pts.forEach((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d, w = (ws[i] * fat) / 2; far.push([p[0] + nx * w, p[1] + ny * w]); near.push([p[0] - nx * w, p[1] - ny * w]); });
  return { near, far };
}
// the island's own front edge, between two xs (the sand ellipse's lower arc)
const shore = (x0, x1) => { const out = []; for (let i = 0; i <= 6; i++) { const x = x0 + ((x1 - x0) * i) / 6; out.push([x, 158 + 18 * Math.sqrt(Math.max(0, 1 - ((x - 86) / 55) ** 2))]); } return out; };
function happy(t) {
  if (t <= 0) return STILL;
  const k = years(t);
  if (k < 0.002) return STILL;
  const s = spit(k);
  let laid = "";
  if (s) {
    // (the spit: its wet rim, its sand, the shade along its near edge; inside its curl the trapped water goes shallow and pale)
    const ring = [...s.far, ...s.near.slice().reverse()];
    const down = (dy) => ring.map((p) => [p[0], p[1] + dy]);
    let lagoon = "";
    if (k > 0.45) { const tip = s.far[s.far.length - 1]; lagoon = `<path d="${blob([...shore(50, Math.min(104, tip[0] + 2)), ...s.far.slice(1).reverse()])}" ${fill("sky-lit")} opacity="${n2(Math.min(1, (k - 0.45) / 0.35))}"/>`; }
    laid = `${lagoon}<path d="${blob(down(1.6))}" ${fill("sky-deep")}/><path d="${blob(ring)}" ${fill("sun-lit")}/><path d="${blob([...s.near, ...s.near.slice().reverse().map((p) => [p[0] + 0.3, p[1] - 1.6])])}" ${fill("sun-deep")}/>`;
  }
  return `${OPEN}${SEA}${laid}${worn(1 - 0.17 * k)}${PALMS}</svg>`;
}

// ---- sad: cut in two
const SAD_DUR = 2.4;
// the groove's line across the island, front to back, between the two palms' feet (the tall one's ends at x 84, the short one's starts at 94, at
// y 150); it opens wider at the front, where the washes come in
const CUT = [[89.4, 178], [89.3, 151], [90.6, 138.5]], CW = [17, 8.8, 13];
function sad(t) {
  if (t <= 0) return STILL;
  const k = years(t);
  if (k < 0.002) return STILL;
  // first a wet dark groove in the sand, then the sea in it
  const wet = Math.min(1, k / 0.3), sea = Math.max(0, Math.min(1, (k - 0.3) / 0.35)), g = Math.min(1, k / 0.8);
  const band = (extra, dy) => `M${CUT.map(([x, y], i) => P([x - (CW[i] * g + extra) / 2, y + (i ? 0 : dy)])).join("L")}L${CUT.slice().reverse().map(([x, y], j) => P([x + (CW[2 - j] * g + extra) / 2, y + (j === 2 ? dy : 0)])).join("L")}Z`;
  const groove = `<path d="${band(2.4, 0.8)}" ${fill("sun-deep")} opacity="${n2(wet)}"/>` + (sea > 0 ? `<path d="${band(0, 1.6)}" ${fill("sky")} opacity="${n2(sea)}"/>` : "");
  return `${OPEN}${SEA}${SAND}${groove}${PALMS}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
