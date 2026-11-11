// Tent's story. Happy, nearly: the right peg works a good way loose in the soft ground, then holds in the firm ground beneath; the front pole leans
// over until its rope is taut again, and the tent stands, a little crooked, still up. Sad: the right guy rope's peg is in soft ground, and the rope's pull works it loose: it tilts, rises, and is yanked out toward the tent, then
// drops on the ground. The rope falls slack. Held now only by the left rope, the front pole leans over to the left, the front's right edge goes
// slack and bows in, and the roof sags between the front pole and the back: a slumped, lopsided tent.
// Every frame is a pure function of t, in seconds. The still's own parts: the grass behind, the ground, the shadow, the left guy rope (from the front's
// left edge at 46, 136 to its peg at 16, 167.5), the roof's side (from the front's peak at 82, 72 back to 116, 66), the front, the doorway, the two
// tied-back door flaps, the pole (its foot at 82, 160), the right guy rope (from the front's right edge at 118.6, 138 to its peg at 148, 167.5), and
// the two pegs (wood, 4 by 6, at 14 and 146 across, 166-172 down). The tent (2 m) is 100 across: 50 to the meter, gravity 490.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"140\" width=\"200\" height=\"60\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"34,159.5 166,153 200,166 200,194\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"46.2,136.6 16.6,167.9 15.4,167.1 45,135.8\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"82,72 116,66 166,154 132,160\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"82,72 32,160 132,160\" fill=\"var(--art-clay,#E8743B)\"/><polygon points=\"82,76 54,160 110,160\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M82 76C70 112 52 142 34 160L62 160C66 158 68 154 70 148C74 128 78 104 81 84Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M82 76C94 112 112 142 130 160L102 160C98 158 96 154 94 148C90 128 86 104 83 84Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><rect x=\"80.6\" y=\"68\" width=\"2.8\" height=\"92.5\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"82\" y=\"68\" width=\"1.4\" height=\"92.5\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"119,137.4 148.6,167.1 147.4,167.9 118.2,138.6\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"14\" y=\"166\" width=\"4\" height=\"6\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"16.2\" y=\"166\" width=\"1.8\" height=\"6\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"146\" y=\"166\" width=\"4\" height=\"6\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"148.2\" y=\"166\" width=\"1.8\" height=\"6\" fill=\"var(--art-wood-deep,#B97F45)\"/></svg>\n";
export const STILL_HASH = "81816c4bbc";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 16 || !EL[4].includes("82,72 116,66 166,154 132,160") || !EL[11].includes("119,137.4 148.6,167.1")) throw new Error("tent: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const GROUND = EL.slice(0, 3).join(""), DOOR = EL.slice(6, 9).join(""), POLE = EL[9] + EL[10], PEG_L = EL[12] + EL[13], PEG_R = EL[14] + EL[15];
const PEAK = [82, 72], BACK = [116, 66], BASE_L = [32, 160], BASE_R = [132, 160], POLE_FOOT = [82, 160];
const TIE_L = [45.6, 136.2], TIE_R = [118.6, 138], PEG_TOP_L = [16, 167.5], PEG_TOP_R = [148, 167.5];

// ---- the peg: it works loose (tilting toward the tent and rising), is yanked out up toward the tent, and drops to the ground, lying
const T_LOOSE = 0.35, T_OUT = 0.62, T_DROP = 0.8;
function peg(t) {
  // [dx, dy, turn about its middle (148, 169)]
  if (t <= T_LOOSE) return [0, 0, 0];
  if (t <= T_OUT) { const f = track([[T_LOOSE, 0], [T_OUT, 1, "in"]], t); return [-1 * f, -2.5 * f, -12 * f]; }
  if (t <= T_DROP) { const f = (t - T_OUT) / (T_DROP - T_OUT), up = 10 * f - 14 * f * f; return [-1 - 8 * f, -2.5 - up, -12 - 70 * f]; }
  const b = track([[T_DROP, 0], [T_DROP + 0.05, 1, "out"], [T_DROP + 0.1, 0, "in"]], t);
  return [-9, 0.5 - 0.8 * b, -82 - 4 * b];
}
// where the rope's end on the peg is now
const pegTop = ([dx, dy, a]) => { const r = (a * Math.PI) / 180, x = PEG_TOP_R[0] - 148, y = PEG_TOP_R[1] - 169; return [148 + dx + x * Math.cos(r) - y * Math.sin(r), 169 + dy + x * Math.sin(r) + y * Math.cos(r)]; };

// ---- the lean: once the rope's pull is gone, the left rope draws the front pole over, swinging past and back to rest (degrees off upright)
const LEAN = 13;
const lean = (t) => (t <= T_OUT + 0.02 ? 0 : LEAN * track([[T_OUT + 0.02, 0], [1.15, 1.15, "io"], [1.45, 0.96, "io"], [1.7, 1, "io"]], t));
// everything hung on the pole, leaned with it about the ground line (the pole's foot): its top moves along the pole's circle
function leaned(a) {
  const r = (a * Math.PI) / 180, h = POLE_FOOT[1] - PEAK[1];
  const top = [POLE_FOOT[0] - h * Math.sin(r), POLE_FOOT[1] - h * Math.cos(r)];
  const k = (top[0] - PEAK[0]) / h, m = (top[1] - PEAK[1]) / h;
  return { top, tf: `matrix(1 0 ${n4(-k)} ${n4(1 - m)} ${n4(160 * k)} ${n4(160 * m)})` };
}
// a rope as a thin band along a curve from a to b, sagging by s at its middle; its half-width the still's own for that rope (so a taut one is the
// still's exactly)
function rope(a, b, s, offA, offB) {
  const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + s], P = [], O = [];
  for (let i = 0; i <= 8; i++) { const u = i / 8; P.push([(1 - u) ** 2 * a[0] + 2 * u * (1 - u) * c[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * u * (1 - u) * c[1] + u * u * b[1]]); O.push([offA[0] + (offB[0] - offA[0]) * u, offA[1] + (offB[1] - offA[1]) * u]); }
  const side = (k) => P.map((p, i) => `${n2(p[0] + k * O[i][0])} ${n2(p[1] + k * O[i][1])}`);
  return `<path d="M${side(1).join("L")}L${side(-1).reverse().join("L")}Z" ${fill("paper")}/>`;
}

// ---- sad: down on one side
const SAD_DUR = 2.1;
function sad(t) {
  if (t <= T_LOOSE) return STILL;
  const a = lean(t), slump = a / LEAN, { top, tf } = leaned(a);
  const p = peg(t), pt = pegTop(p);
  // the right rope: taut until the peg's out, then falling slack between the tent's edge and the peg on the ground
  const slack = track([[T_OUT, 0], [T_OUT + 0.18, 1, "out"]], t);
  const tieR = [TIE_R[0] + (top[0] - PEAK[0]) * ((160 - TIE_R[1]) / 88) - 2.5 * slump, TIE_R[1] + (top[1] - PEAK[1]) * ((160 - TIE_R[1]) / 88)];
  const tieL = [TIE_L[0] + (top[0] - PEAK[0]) * ((160 - TIE_L[1]) / 88), TIE_L[1] + (top[1] - PEAK[1]) * ((160 - TIE_L[1]) / 88)];
  // the front: its peak on the pole's top, its right edge bowing in with nothing pulling it out; the roof's top sagging between the poles
  const bow = [(top[0] + BASE_R[0]) / 2 - 9 * slump, (top[1] + BASE_R[1]) / 2 + 2 * slump];
  const ridge = [(top[0] + BACK[0]) / 2, (top[1] + BACK[1]) / 2 + 9 * slump];
  const roof = `<path d="M${n2(top[0])} ${n2(top[1])}Q${n2(ridge[0])} ${n2(ridge[1])} ${BACK[0]} ${BACK[1]}L166 154L${BASE_R[0]} ${BASE_R[1]}Q${n2(bow[0])} ${n2(bow[1])} ${n2(top[0])} ${n2(top[1])}Z" ${fill("clay-deep")}/>`;
  const front = `<path d="M${n2(top[0])} ${n2(top[1])}L${BASE_L[0]} ${BASE_L[1]}L${BASE_R[0]} ${BASE_R[1]}Q${n2(bow[0])} ${n2(bow[1])} ${n2(top[0])} ${n2(top[1])}Z" ${fill("clay")}/>`;
  const hung = a ? `<g transform="${tf}">${DOOR}${POLE}</g>` : DOOR + POLE;
  const ropeL = a ? rope(tieL, PEG_TOP_L, 0, [0.6, 0.4], [0.6, 0.4]) : EL[3];
  const ropeR = slack > 0 || p[0] ? rope(tieR, pt, 9 * slack, [0.4, -0.6], [0.6, -0.4]) : EL[11];
  const pegR = p[0] || p[1] ? `<g transform="translate(${n2(p[0])} ${n2(p[1])}) rotate(${n2(p[2])} 148 169)">${PEG_R}</g>` : PEG_R;
  return `${OPEN}${GROUND}${ropeL}${roof}${front}${hung}${ropeR}${PEG_L}${pegR}</svg>`;
}

// ---- happy: it holds
// The same soft ground: the right peg works loose, tilting toward the tent and rising, a good way out; then its foot finds the firm ground beneath and it
// holds. The rope it let go of lets the left rope draw the front pole over, until the right rope is taut again (7 degrees): it shudders and stands,
// a little crooked, still up.
const HOLD_LEAN = 7, T_CATCH = 0.78;
function heldPeg(t) {
  if (t <= T_LOOSE) return [0, 0, 0];
  const f = track([[T_LOOSE, 0], [T_CATCH, 1, "in"]], t), b = t > T_CATCH ? track([[T_CATCH, 0], [T_CATCH + 0.05, 1, "out"], [T_CATCH + 0.12, 0, "in"]], t) : 0;
  return [-2.2 * f, -4 * f + 0.4 * b, -25 * f - 2 * b];
}
const heldLean = (t) => (t <= T_LOOSE + 0.05 ? 0 : HOLD_LEAN * track([[T_LOOSE + 0.05, 0], [T_CATCH + 0.04, 1.12, "in"], [T_CATCH + 0.22, 0.95, "io"], [T_CATCH + 0.4, 1, "io"]], t));
const HAPPY_DUR = T_CATCH + 0.4 + 0.8;
function happy(t) {
  if (t <= T_LOOSE) return STILL;
  const a = heldLean(t), slump = a / LEAN, { top, tf } = leaned(a);
  const p = heldPeg(t), pt = pegTop(p);
  const tieR = [TIE_R[0] + (top[0] - PEAK[0]) * ((160 - TIE_R[1]) / 88) - 2.5 * slump, TIE_R[1] + (top[1] - PEAK[1]) * ((160 - TIE_R[1]) / 88)];
  const tieL = [TIE_L[0] + (top[0] - PEAK[0]) * ((160 - TIE_L[1]) / 88), TIE_L[1] + (top[1] - PEAK[1]) * ((160 - TIE_L[1]) / 88)];
  // (the right rope still pulls the front's edge out, so it bows in only a little)
  const bow = [(top[0] + BASE_R[0]) / 2 - 3 * slump, (top[1] + BASE_R[1]) / 2 + slump];
  const ridge = [(top[0] + BACK[0]) / 2, (top[1] + BACK[1]) / 2 + 5 * slump];
  const roof = `<path d="M${n2(top[0])} ${n2(top[1])}Q${n2(ridge[0])} ${n2(ridge[1])} ${BACK[0]} ${BACK[1]}L166 154L${BASE_R[0]} ${BASE_R[1]}Q${n2(bow[0])} ${n2(bow[1])} ${n2(top[0])} ${n2(top[1])}Z" ${fill("clay-deep")}/>`;
  const front = `<path d="M${n2(top[0])} ${n2(top[1])}L${BASE_L[0]} ${BASE_L[1]}L${BASE_R[0]} ${BASE_R[1]}Q${n2(bow[0])} ${n2(bow[1])} ${n2(top[0])} ${n2(top[1])}Z" ${fill("clay")}/>`;
  const hung = a ? `<g transform="${tf}">${DOOR}${POLE}</g>` : DOOR + POLE;
  const ropeL = a ? rope(tieL, PEG_TOP_L, 0, [0.6, 0.4], [0.6, 0.4]) : EL[3];
  const ropeR = p[0] ? rope(tieR, pt, 0, [0.4, -0.6], [0.6, -0.4]) : EL[11];
  const pegR = p[0] || p[1] ? `<g transform="translate(${n2(p[0])} ${n2(p[1])}) rotate(${n2(p[2])} 148 169)">${PEG_R}</g>` : PEG_R;
  return `${OPEN}${GROUND}${ropeL}${roof}${front}${hung}${ropeR}${PEG_L}${pegR}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
