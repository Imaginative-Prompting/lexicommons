// Plan's two stories, the paper's own: the blueprint was rolled, and two of its corners still curl up off the table. Happy: the curls let go;
// each corner comes down flat (its curled-over back folding away onto its crease, the plan's margin opening out to the sheet's square
// corner), and the plan lies open and square, every room clear. Sad: the roll wins. The sheet rolls up from its top edge into a tube that
// eats the plan row by row; it shoves the pencil at its butt, which swings and rolls down ahead of it until it fetches up against the ruler
// (it can't roll off: its point meets the ruler as its butt reaches the sheet's edge), and the roll stops against it. Only the plan's foot is
// left, under the ruler.
// Every frame is a pure function of t, in seconds. The still's own lines: the sheet's top edge runs from (146.2, 47.4) left through (29.2,
// 66.9), its left edge up from (26, 186.4) through (7.1, 89): flat, they meet at (3.6, 71.2); the right and bottom edges meet at (168.6,
// 162.6); its thickness shows 5 right and 6 down along those two edges.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M146.2 47.4L151.2 53.4L170.6 153.3C171.7 155.7 172.6 159 172.4 162.9C172 169.4 164.9 170.1 157 171.4L31 192.4L26 186.4Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M29.2 66.9L146.2 47.4L166.3 151Q164 162 152 165.4L26 186.4L7.1 89Q10.7 72.1 29.2 66.9Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M7.6 92C12 92.5 15 89 18 83C21 76 24 69 29.2 66.9C27 71 25 79 22 86C19 93 14 96.5 8.6 97Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M29.2 66.9C17 68.9 6 70 5.5 80C5.2 86 6.5 91 8.2 94.8C13 94 16 90 19 84C22 77 24 69 29.2 66.9Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M152 165.4C159.9 164.1 167 163.4 167.4 156.9C167.6 153 166.7 149.7 165.6 147.3C162.5 147.8 160.5 150.4 158.6 154.3C156.6 158.8 155.3 164 152 165.4Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M76.3 107.4L63.7 109.5C62.8 104.9 67.7 100.2 74.7 99Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M79.1 121.4L66.5 123.5C67.5 128.1 73.9 131 80.8 129.8Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M100.1 96L112.7 93.9C111.8 89.3 105.4 86.5 98.5 87.6Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M103.5 112.8L116.1 110.7C117 115.3 112.1 120.1 105.2 121.2Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M89.7 141.6L88 133.2C95 132 101.4 134.8 102.3 139.4Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M30 82L135 64L135.5 66.5L30.5 84.5ZM30 82L32.7 81.5L46.7 151.5L44 152ZM132.3 64.5L135 64L149 134L146.3 134.5ZM43.5 149.5L89.7 141.6L90.2 144.1L44 152ZM102.3 139.4L148.5 131.5L149 134L102.8 141.9ZM69.9 75.2L72.6 74.7L77.4 98.5L74.7 99ZM76.3 107.4L79.1 106.9L81.9 120.9L79.1 121.4ZM80.8 129.8L83.6 129.3L86.6 144.7L83.9 145.2ZM92.4 71.3L95.1 70.8L98.5 87.6L95.7 88.1ZM97.4 96.5L100.1 96L103.5 112.8L100.8 113.3ZM102.5 121.7L105.2 121.2L109.1 140.8L106.4 141.3ZM37 117.1L78 110.1L78.5 112.6L37.5 119.7ZM100 100.6L140.9 93.5L141.4 96.1L100.5 103.1Z\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"63.5,108.3 76.1,106.1 76.3,107.4 63.7,109.5\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"66.5,123.5 79.1,121.4 79.4,122.6 66.8,124.8\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"99.9,94.8 112.5,92.6 112.7,93.9 100.1,96\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"103.5,112.8 116.1,110.7 116.4,111.9 103.8,114.1\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"88,133.2 89.9,132.8 91.6,141.2 89.7,141.6\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M48 72L94.3 105.5L102.1 113.2L90.2 111.1L43.9 77.7A3.5 3.5 0 0 1 48 72Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><polygon points=\"54,167 144,143 147.7,145.4 150.4,157.2 58.8,178.3 56.6,177.4\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M53.6 164.1L143.3 143.5Q145.2 143 145.7 144.9L147.4 152.8Q147.9 154.7 146 155.2L56.3 175.8Q54.4 176.3 53.9 174.4L52.2 166.5Q51.7 164.6 53.6 164.1Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M52.9 161.5L142.6 140.9Q144.5 140.4 145 142.3L146.7 150.2Q147.2 152.1 145.3 152.6L55.6 173.2Q53.7 173.7 53.2 171.8L51.5 163.9Q51 162 52.9 161.5Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M58.4 161.6l1.4-.3.5 2.3-1.4 .3zM66.2 159.8l1.4-.3.9 3.9-1.4 .3zM74 158l1.4-.3.5 2.3-1.4 .3zM81.8 156.2l1.4-.3.9 3.9-1.4 .3zM89.6 154.4l1.4-.3.5 2.3-1.4 .3zM97.4 152.6l1.4-.3.9 3.9-1.4 .3zM105.1 150.8l1.4-.3.5 2.3-1.4 .3zM112.9 149l1.4-.3.9 3.9-1.4 .3zM120.7 147.2l1.4-.3.5 2.3-1.4 .3zM128.5 145.4l1.4-.3.9 3.9-1.4 .3zM136.3 143.6l1.4-.3.5 2.3-1.4 .3z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M50 71.2L47 69A3.5 3.5 0 0 0 42.9 74.7L45.9 76.8Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M47.6 74.5L41.8 70.3A3.5 3.5 0 0 0 42.9 74.7L45.9 76.8Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"53.5,73.7 93.6,102.7 89.5,108.4 49.4,79.4\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"51.1,77 91.2,106 89.5,108.4 49.4,79.4\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"49.8,70.8 54.2,73.9 49.9,79.9 45.5,76.8\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"47.3,74.3 51.7,77.4 49.9,79.9 45.5,76.8\" fill=\"var(--art-sun-deep,#DB9A22)\"/><polygon points=\"93.3,102.5 102.1,113.2 89.2,108.1\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"90.9,105.8 102.1,113.2 89.2,108.1\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"100.4,111.2 102.1,113.2 99.7,112.2\" fill=\"var(--art-ink,#231F3B)\"/></svg>\n";
export const STILL_HASH = "e97efaf0cd";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 31 || !EL[2].startsWith('<path d="M29.2 66.9L146.2 47.4')) throw new Error("plan: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const pts = (P) => P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
const dOf = (svg) => /d="([^"]+)"/.exec(svg)[1];
const fillOf = (svg) => /fill="([^"]+)"/.exec(svg)[1];
const mixP = (a, b, w) => [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w];

// a path's outline as points (absolute M L C Q Z), each curve in steps
function outline(d) {
  const tok = d.match(/[MLCQZ]|-?\d*\.?\d+/g), P = [];
  let i = 0, cur = [0, 0], cmd = "";
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[MLCQZ]/.test(tok[i])) cmd = tok[i++];
    if (cmd === "Z") continue;
    if (cmd === "M" || cmd === "L") { cur = [num(), num()]; P.push(cur); }
    else if (cmd === "C") { const a = [num(), num()], b = [num(), num()], e = [num(), num()], s = cur; for (let k = 1; k <= 12; k++) { const t = k / 12, u = 1 - t; P.push([0, 1].map((j) => u * u * u * s[j] + 3 * u * u * t * a[j] + 3 * u * t * t * b[j] + t * t * t * e[j])); } cur = e; }
    else if (cmd === "Q") { const a = [num(), num()], e = [num(), num()], s = cur; for (let k = 1; k <= 12; k++) { const t = k / 12, u = 1 - t; P.push([0, 1].map((j) => u * u * s[j] + 2 * u * t * a[j] + t * t * e[j])); } cur = e; }
  }
  return P;
}
// the points of a run that lie on a curve, sent along two straight edges to a corner and on (by how far along they were)
const toCorner = (run, a, corner, b) => {
  const L1 = Math.hypot(corner[0] - a[0], corner[1] - a[1]), L2 = Math.hypot(b[0] - corner[0], b[1] - corner[1]);
  return run.map((_, k) => { const s = ((k + 1) / run.length) * (L1 + L2); return s <= L1 ? mixP(a, corner, s / L1) : mixP(corner, b, (s - L1) / L2); });
};
// the sheet: its outline as the still draws it, and flat (the curved corners squared off)
const TL = [3.6, 71.2], BR = [168.6, 162.6];
const SHEET = outline(dOf(EL[2]));
const SHEET_FLAT = (() => {
  // the runs: the line to (146.2, 47.4), to (166.3, 151), the curl to (152, 165.4), to (26, 186.4), to (7.1, 89), the curl back to the start
  const P = SHEET.slice(), i1 = P.findIndex((p) => p[0] === 166.3 && p[1] === 151), i2 = P.findIndex((p) => p[0] === 7.1 && p[1] === 89);
  const br = toCorner(P.slice(i1 + 1, i1 + 13), P[i1], BR, [152, 165.4]), tl = toCorner(P.slice(i2 + 1, i2 + 13), P[i2], TL, [29.2, 66.9]);
  return [...P.slice(0, i1 + 1), ...br, ...P.slice(i1 + 13, i2 + 1), ...tl, ...P.slice(i2 + 13)];
})();
// its edge of thickness, the same at the bottom-right (its curl's rounded corner squared off at (173.6, 168.6))
const EDGE = outline(dOf(EL[1]));
const EDGE_FLAT = (() => {
  const P = EDGE.slice(), i = P.findIndex((p) => p[0] === 170.6 && p[1] === 153.3);
  return [...P.slice(0, i + 1), ...toCorner(P.slice(i + 1, i + 25), P[i], [173.6, 168.6], [157, 171.4]), ...P.slice(i + 25)];
})();
// a curl's back (and the shade under it) folding down onto its crease: each point to its place on the crease line
const onLine = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], k = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy); return [a[0] + dx * k, a[1] + dy * k]; };
const CURL_TL = [8.2, 94.8], CURL_TL2 = [29.2, 66.9], CURL_BR = [152, 165.4], CURL_BR2 = [165.6, 147.3];
const FOLDING = [[EL[3], CURL_TL, CURL_TL2], [EL[4], CURL_TL, CURL_TL2], [EL[5], CURL_BR, CURL_BR2]].map(([svg, a, b]) => ({ P: outline(dOf(svg)), a, b, fill: fillOf(svg) }));
const REST = EL.slice(6).join("");
const PLAN = EL.slice(6, 17).join(""), PENCIL_SHADOW = EL[17], RULER = EL.slice(18, 22).join(""), PENCIL = EL.slice(22).join("");

function sheet(w) {
  const edge = `<polygon points="${pts(EDGE.map((p, k) => mixP(p, EDGE_FLAT[k], w)))}" fill="${fillOf(EL[1])}"/>`;
  const body = `<polygon points="${pts(SHEET.map((p, k) => mixP(p, SHEET_FLAT[k], w)))}" fill="${fillOf(EL[2])}"/>`;
  const curls = FOLDING.map((f) => (w >= 1 ? "" : `<polygon points="${pts(f.P.map((p) => mixP(p, onLine(p, f.a, f.b), w)))}" fill="${f.fill}"/>`)).join("");
  return edge + body + curls;
}

// ---- happy: the curls let go: slow while the paper's memory still holds, then down (light paper, a breath of air under it), a small lift
// and settled
const HAPPY_DUR = 1.6;
function happy(t) {
  if (t <= 0) return STILL;
  // (crisp: the corners give, then come down smartly and land, one small tick back and done)
  const w = track([[0.2, 0], [0.72, 1, "in"], [0.8, 0.95, "out"], [0.88, 1, "in"]], t);
  return `${OPEN}${EL[0]}${sheet(w)}${REST}</svg>`;
}

// ---- sad: the roll. The sheet in its own terms: a point (a, b) is TL + a U + b V (a across, b down, both 0 to 1)
const U = [142.6, -23.8], V = [22.4, 115.2], V_LEN = Math.hypot(...V);
const at = (a, b) => [TL[0] + a * U[0] + b * V[0], TL[1] + a * U[1] + b * V[1]];
const sheetB = (p) => { const x = p[0] - TL[0], y = p[1] - TL[1], det = U[0] * V[1] - U[1] * V[0]; return (U[0] * y - U[1] * x) / det; };
// the roll's radius grows as the root of the paper rolled into it
const radius = (b) => 7.5 * Math.sqrt(Math.max(0, b) / 0.63);
// the pencil as it lies (its outline, for where the roll meets it) and where it ends: against the ruler's top edge, along it
const PENCIL_OUTLINE = [[42.9, 74.7], [47, 69], [53.5, 73.7], [93.6, 102.7], [102.1, 113.2], [89.5, 108.4], [49.4, 79.4], [45.9, 76.8]];
const P0 = [73.5, 93.6], ANG0 = Math.atan2(113.2 - 74.5, 102.1 - 47.5), ANG1 = Math.atan2(-20.6, 89.7), P1 = [97, 146.8];
const posed = (c, a) => (p) => { const ca = Math.cos(a - ANG0), sa = Math.sin(a - ANG0), x = p[0] - P0[0], y = p[1] - P0[1]; return [c[0] + ca * x - sa * y, c[1] + sa * x + ca * y]; };
const topB = (c, a) => Math.min(...PENCIL_OUTLINE.map(posed(c, a)).map(sheetB));
// the roll's track: off slowly, gathering pace, until it meets the pencil lying at the ruler (worked out from where the pencil ends)
const B_STOP = (() => { let b = 0.3; while (b + radius(b) / V_LEN < topB(P1, ANG1) - 0.004) b += 0.0005; return b; })();
const T_STOP = 1.5;
// (slow to start, as the paper's pull overcomes it: the roll's radius, the root of what's in it, grows from nothing)
const rollB = (t) => track([[0.2, 0], [T_STOP, B_STOP, "in3"], [T_STOP + 0.1, B_STOP - 0.012, "out"], [T_STOP + 0.22, B_STOP, "in"]], t);
// the pencil, once the roll reaches its butt, is shoved along by it: always just at the roll's leading edge, its butt going first so it swings
// round (its point dragging) as it goes, until it lies along the ruler. Its pose at each moment is the one whose top is where the roll's edge is
const rollMain = (t) => track([[0.2, 0], [T_STOP, B_STOP, "in3"]], t);
const poseAt = (p) => { const spin = Math.min(1, p / 0.55), sp = 1 - (1 - spin) * (1 - spin); return { c: [P0[0] + (P1[0] - P0[0]) * p, P0[1] + (P1[1] - P0[1]) * p], a: ANG0 + (ANG1 - ANG0) * sp }; };
const B0 = topB(P0, ANG0);
function pencilPose(t) {
  const b = rollMain(t), edge = b + radius(b) / V_LEN;
  if (edge <= B0) return poseAt(0);
  let lo = 0, hi = 1;
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2, q = poseAt(m); if (topB(q.c, q.a) < edge) lo = m; else hi = m; }
  return poseAt(lo);
}
const SAD_DUR = 2.3;
function sad(t) {
  if (t <= 0) return STILL;
  const b = rollB(t), r = radius(b), rb = r / V_LEN;
  // what's still flat: the sheet past the roll's line (the rest is in the roll)
  const flat = [at(-0.3, b), at(1.3, b), at(1.3, 1.6), at(-0.3, 1.6)];
  const clip = `<clipPath id="fl"><polygon points="${pts(flat)}"/></clipPath>`;
  const body = `<g clip-path="url(#fl)">${sheet(0)}${PLAN}</g>`;
  // the roll over its line: lit above, turning to shade below (the light is to the upper left), its shadow on the sheet below it
  const band = (b0, b1, tone) => `<polygon points="${pts([at(0, b0), at(1, b0), at(1, b1), at(0, b1)])}" ${fill(tone)}/>`;
  const roll = r > 0.05 ? band(b + rb, b + rb + 0.55 * rb, "sky-deep") + band(b - rb, b + 0.1 * rb, "paper") + band(b + 0.1 * rb, b + 0.6 * rb, "paper-mid") + band(b + 0.6 * rb, b + rb, "paper-deep") : "";
  const pose = pencilPose(t), moved = Math.hypot(pose.c[0] - P0[0], pose.c[1] - P0[1]) > 1e-6 || Math.abs(pose.a - ANG0) > 1e-6;
  const turn = moved ? `translate(${n2(pose.c[0])} ${n2(pose.c[1])}) rotate(${n2(((pose.a - ANG0) * 180) / Math.PI)}) translate(${n2(-P0[0])} ${n2(-P0[1])})` : "";
  const g = (svg) => (moved ? `<g transform="${turn}">${svg}</g>` : svg);
  return `${OPEN}${EL[0]}${clip}${body}${roll}${g(PENCIL_SHADOW)}${RULER}${g(PENCIL)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
