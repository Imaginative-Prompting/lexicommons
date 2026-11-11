// Plant's story, a time-lapse of its own growth: a new shoot rises from the top of the stem, up behind the top leaf and on above the whole plant,
// its blade rolled.
// Happy: the blade unrolls into a big new leaf up above the crown, reaching up and left; its weight bows its stalk a little. Seven leaves, and the
// plant a good deal taller.
// Sad: it opens small, and the plant draws on its big upper-left leaf instead: the old leaf yellows, its stalk lets go at the stem, and it drops onto
// the leaf below, which gives under it; it slides off that leaf's tip and flutters down to lie on the floor beside the pot.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor, the shadow, the pot (its body and shade, its rim and
// its soil), the main stem (from the soil at 121 up to 75) and its five branch stalks, and six leaves, each a lit half and a shaded half: the top
// one, the right upper, the left upper (its base at 76, 86, its tip at 42, 96), the small one, the left lower (base 80, 103, tip 50, 107) and the
// right lower. The pot (18 cm) is 60 across: 330 to the meter. A falling leaf drifts down at about a meter a second, rocking as it goes.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect y=\"150\" width=\"200\" height=\"50\" fill=\"var(--art-violet-lit,#A68CFF)\"/><path d=\"M74 168L113 160L200 177V200H176Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M65 135H119Q117.5 157 112.5 165.5Q110.5 169.5 106 169.5H78Q73.5 169.5 71.5 165.5Q66.5 157 65 135Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M108 135Q110 154 103 169.5H106Q110.5 169.5 112.5 165.5Q117.5 157 119 135Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M65.3 137Q92 142 118.8 137L118.5 140.5Q92 145 65.6 140.5Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M62 118A30 5.5 0 0 0 122 118V133.5Q122 137.5 118 137.6Q92 140.5 66 137.6Q62 137.5 62 133.5Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M113 121.9Q115.5 129.5 115 138.4L118 137.6Q122 137.5 122 133.5V118A30 5.5 0 0 1 113 121.9Z\" fill=\"var(--art-clay-deep,#C25626)\"/><ellipse cx=\"92\" cy=\"118\" rx=\"30\" ry=\"5.5\" fill=\"var(--art-clay-lit,#F6A06F)\"/><ellipse cx=\"92\" cy=\"118.3\" rx=\"26.5\" ry=\"4.4\" fill=\"var(--art-clay-deeper,#9C4219)\"/><ellipse cx=\"92\" cy=\"119.3\" rx=\"25\" ry=\"3.4\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M90 121C89 108 87 92 88.6 75L91.4 75.4C90.5 92 93 108 94.4 121Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M89.5 102Q83 91 75.4 87.4L76.6 84.8Q85.5 88 91.2 98.5Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M90.8 108.6Q97 95 107.6 90.6L108.4 93.4Q99.5 97.5 93.4 111Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M88.6 94Q90.5 88.5 94.6 86.6L95.6 89.2Q92.5 90.5 90.2 96Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M90.6 116.6Q87.5 106 79.4 104.4L80.4 101.8Q89.5 103.5 92.9 114.4Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M92.2 114.6Q97 107.5 104.6 104.2L105.6 106.8Q99 109.5 94.4 117.2Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M90 74C77.9 61.4 99 41.3 112 40C116.2 52.3 106.5 79.8 90 74Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M90 74Q99.3 55.9 112 40C116.2 52.3 106.5 79.8 90 74Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M108 92C108.8 76.6 133.6 78.3 142 86C136.8 96.1 114 106.2 108 92Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M108 92Q124.7 87.2 142 86C136.8 96.1 114 106.2 108 92Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M76 86C68.4 72.6 46.3 85.4 42 96C51.3 102.6 76.8 101.4 76 86Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M76 86Q58.5 89.3 42 96C51.3 102.6 76.8 101.4 76 86Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M95 88C90.4 78.7 106.3 70.6 114 72C114.1 79.8 103.4 94.1 95 88Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M95 88Q103.7 79.1 114 72C114.1 79.8 103.4 94.1 95 88Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M80 103C75.4 91.5 55 99.1 50 107C57 113.3 78.6 115.3 80 103Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M80 103Q64.8 103.6 50 107C57 113.3 78.6 115.3 80 103Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M105 105.5C107.3 94.4 126.4 98.1 132 104.5C126.8 111.3 108.1 116.4 105 105.5Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M105 105.5Q118.5 103.7 132 104.5C126.8 111.3 108.1 116.4 105 105.5Z\" fill=\"var(--art-teal-deep,#25907B)\"/></svg>\n";
export const STILL_HASH = "d32cbd9a5c";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 29 || !EL[21].includes("M76 86C68.4 72.6 46.3 85.4 42 96") || !EL[25].includes("M80 103C75.4 91.5 55 99.1 50 107")) throw new Error("plant: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const d = (e) => e.match(/ d="([^"]*)"/)[1];
const POT = EL.slice(0, 11).join(""), STEM = EL[11];
// (the stalks: to the left upper leaf, the right upper, the small one, the left lower, the right lower)
const [STALK_LU, STALK_RU, STALK_S, STALK_LL, STALK_RL] = EL.slice(12, 17);
const TOP = EL[17] + EL[18], RU = EL[19] + EL[20], LU = EL[21] + EL[22], SMALL = EL[23] + EL[24], LL = EL[25] + EL[26], RL = EL[27] + EL[28];
const LU_D = [d(EL[21]), d(EL[22])];

// ---- the new leaf: the left upper leaf's own shape, put on the new stalk's end pointing up and left, grown about its base, unrolled across its axis
const OLD_BASE = [76, 86], OLD_ANGLE = (Math.atan2(96 - 86, 42 - 76) * 180) / Math.PI;
const SHOOT_FROM = [89.8, 77], SHOOT_TO = [85, 36];
function shoot(len) {
  // the new stalk, from the stem toward its end, as far as it has grown
  if (len < 0.02) return "";
  const e = [SHOOT_FROM[0] + (SHOOT_TO[0] - SHOOT_FROM[0]) * len, SHOOT_FROM[1] + (SHOOT_TO[1] - SHOOT_FROM[1]) * len], m = [(SHOOT_FROM[0] + e[0]) / 2 + 1.2 * len, (SHOOT_FROM[1] + e[1]) / 2 - 1.6 * len];
  // (it rises nearly straight up: as thick as the stem at its foot, thinner toward its leaf)
  return `<path d="M${SHOOT_FROM[0] - 1.5} ${SHOOT_FROM[1]}Q${n2(m[0] - 1.2)} ${n2(m[1])} ${n2(e[0] - 0.9)} ${n2(e[1])}L${n2(e[0] + 0.9)} ${n2(e[1])}Q${n2(m[0] + 1.2)} ${n2(m[1])} ${SHOOT_FROM[0] + 1.5} ${SHOOT_FROM[1]}Z" ${fill("teal-deep")}/>`;
}
function newLeaf(len, size, open, droop) {
  if (size < 0.02) return "";
  const at = [SHOOT_FROM[0] + (SHOOT_TO[0] - SHOOT_FROM[0]) * len, SHOOT_FROM[1] + (SHOOT_TO[1] - SHOOT_FROM[1]) * len];
  const angle = -132 + droop; // up and left
  const tf = `translate(${n2(at[0])} ${n2(at[1])}) rotate(${n2(angle)}) scale(${n4(size)} ${n4(size * open)}) rotate(${n2(-OLD_ANGLE)}) translate(${-OLD_BASE[0]} ${-OLD_BASE[1]})`;
  return `<g transform="${tf}"><path d="${LU_D[0]}" ${fill("teal")}/><path d="${LU_D[1]}" ${fill("teal-deep")}/></g>`;
}

// ---- happy: a new leaf
const HAPPY_DUR = 2.9;
function happy(t) {
  if (t <= 0.3) return STILL;
  const len = track([[0.3, 0], [1.2, 1, "out"]], t), size = track([[0.7, 0], [2.2, 0.9, "io"]], t), open = track([[1.0, 0.14], [2.3, 1, "io"]], t), droop = 7 * track([[1.6, 0], [2.6, 1, "io"]], t);
  return `${OPEN}${POT}${STEM}${shoot(len)}${STALK_LU}${STALK_RU}${STALK_S}${STALK_LL}${STALK_RL}${newLeaf(len, size, open, droop)}${TOP}${RU}${LU}${SMALL}${LL}${RL}</svg>`;
}

// ---- sad: one in, one out
// the old leaf (with its stalk) yellows, then falls: onto the lower leaf (which bows under it), off its tip, down to the floor, rocking
const T_YELLOW = 0.7, T_GO = 1.6, T_ON = 1.78, T_OFF = 2.1, T_FLOOR = 2.55;
const SAD_DUR = T_FLOOR + 0.5;
function sad(t) {
  if (t <= 0.3) return STILL;
  // (starved, the shoot grows less and its leaf opens small)
  const len = track([[0.3, 0], [1.2, 0.62, "out"]], t), size = track([[0.7, 0], [1.9, 0.42, "io"]], t), open = track([[1.0, 0.14], [2.0, 1, "io"]], t);
  const yellow = track([[T_YELLOW, 0], [T_GO - 0.1, 1, "io"]], t);
  // (its stalk and its blade, each with its yellow laid over it as it turns)
  const over = (green, gold) => (yellow > 0.01 ? `${green}<g opacity="${n4(yellow)}">${gold}</g>` : green);
  const stalk = over(STALK_LU, STALK_LU.replace(/fill="[^"]*"/, fill("sun-deep")));
  const blade = over(LU, `<path d="${LU_D[0]}" ${fill("sun")}/><path d="${LU_D[1]}" ${fill("sun-deep")}/>`);
  // where the falling leaf is: moved and turned about the stalk's foot on the stem (89.5, 102); as it comes to lie on the floor, the floor's
  // foreshortening flattens it up and down the picture, whichever way it lies
  const FOOT = [89.5, 102];
  let dx = 0, dy = 0, turn = 0, flat = 1, bow = 0;
  if (t > T_GO) {
    if (t <= T_ON) { const f = (t - T_GO) / (T_ON - T_GO); dx = -3 * f; dy = 11 * f * f; turn = 8 * f; }
    else if (t <= T_OFF) { const f = (t - T_ON) / (T_OFF - T_ON); dx = -3 - 16 * f * f; dy = 11 + 9 * f * f; turn = 8 + 14 * f; bow = 9 * Math.sin(Math.PI * Math.min(1, f * 1.4)) ; }
    else if (t <= T_FLOOR) { const f = (t - T_OFF) / (T_FLOOR - T_OFF); dx = -19 - 6 * f + 3 * Math.sin(f * Math.PI * 2); dy = 20 + 52 * f; turn = 22 + 30 * f + 14 * Math.sin(f * Math.PI * 3); flat = 1 - 0.6 * f * f; }
    else { const f = track([[T_FLOOR, 0], [T_FLOOR + 0.12, 1, "out"]], t); dx = -25; dy = 72 + 0.6 * f; turn = 52 - 4 * f; flat = 0.4 - 0.05 * f; }
  }
  const falling = t > T_GO ? `<g transform="translate(${n2(dx)} ${n2(dy)}) translate(${FOOT[0]} ${FOOT[1]}) scale(1 ${n4(flat)}) rotate(${n2(turn)}) translate(${-FOOT[0]} ${-FOOT[1]})">${stalk}${blade}</g>` : "";
  // the lower left leaf, bowing as the old one slides across it and springing back
  const lower = bow > 0.01 ? `<g transform="rotate(${n2(bow)} 80 103)">${LL}</g>` : LL;
  const lowerStalk = bow > 0.01 ? `<g transform="rotate(${n2(bow * 0.4)} 90.6 116.6)">${STALK_LL}</g>` : STALK_LL;
  const on = t <= T_GO;
  return `${OPEN}${POT}${STEM}${shoot(len)}${on ? stalk : ""}${STALK_RU}${STALK_S}${lowerStalk}${STALK_RL}${newLeaf(len, size, open, 0)}${TOP}${RU}${on ? blade : ""}${SMALL}${lower}${RL}${falling}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
