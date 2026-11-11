// Heavy's story, its sad alone (the plank's sag is already its rest under the bell, so no happy can end anywhere else: the player keeps the still for
// that): the plank bows a little deeper under the kettlebell, creaking, then snaps at its middle. The bell drops through, driving the two broken ends
// down into the gap, and lands on the floor on top of them: pinned under it, the halves (straight again, their bend let go) slope up over the blocks,
// their far ends lifted like a seesaw's.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor, the shadow, the two brick blocks (front and side), the
// plank (its top face, front face and right end: a bow from (6, 99.25) down to 123 at its middle and up to (194, 99.25)), the dent under the bell, and
// the bell (handle, body about (100, 91) r 31, its shine). The bell (25 cm across) is 62 here: 250 to the meter.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"150\" width=\"200\" height=\"50\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"24,150 181,150 200,157 200,167 44,167\" fill=\"var(--art-teal-deep,#25907B)\"/><rect x=\"24\" y=\"125\" width=\"30\" height=\"25\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M54 125L59 121V146L54 150Z\" fill=\"var(--art-clay-deep,#C25626)\"/><rect x=\"146\" y=\"125\" width=\"30\" height=\"25\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M176 125L181 121V146L176 150Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M6 99.25Q100 146.75 194 99.25L197 93.25Q103 140.75 9 93.25Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M6 99.25Q100 146.75 194 99.25V112.25Q100 159.75 6 112.25Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M194 99.25L197 93.25V106.25L194 112.25Z\" fill=\"var(--art-bark,#7A4E2D)\"/><ellipse cx=\"112\" cy=\"120\" rx=\"26\" ry=\"3\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M76 71C70 38 84 30 100 30C116 30 130 38 124 71L112 65C116 46 110 42 100 42C90 42 84 46 88 65Z\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"100\" cy=\"91\" r=\"31\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M72 97A31 31 0 0 1 94 61A37 37 0 0 0 78 105Z\" fill=\"var(--art-ink-lit,#3A3460)\"/></svg>\n";
export const STILL_HASH = "85d43dfd7a";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 14 || !EL[7].includes("M6 99.25Q100 146.75 194 99.25")) throw new Error("heavy: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BACK = EL.slice(0, 7).join(""), BELL = EL.slice(11).join("");
// the plank bowed b (1 its bow in the still, 0 straight) and let down dy: its top face, front face and right end, and the dent
const plank = (b, dy = 0) => {
  if (Math.abs(b - 1) < 1e-4 && Math.abs(dy) < 1e-4) return EL.slice(7, 11).join("");
  const c = (y) => n2(y + 47.5 * b + dy), y = (v) => n2(v + dy);
  return `<path d="M6 ${y(99.25)}Q100 ${c(99.25)} 194 ${y(99.25)}L197 ${y(93.25)}Q103 ${c(93.25)} 9 ${y(93.25)}Z" ${fill("wood")}/>`
    + `<path d="M6 ${y(99.25)}Q100 ${c(99.25)} 194 ${y(99.25)}V${y(112.25)}Q100 ${c(112.25)} 6 ${y(112.25)}Z" ${fill("wood-deep")}/>`
    + `<path d="M194 ${y(99.25)}L197 ${y(93.25)}V${y(106.25)}L194 ${y(112.25)}Z" ${fill("bark")}/>`
    // (the dent the bell pressed in stays in the wood, broken halves and all)
    + `<g transform="translate(0 ${n2(47.5 * (b - 1) / 2 + dy)})">${EL[10]}</g>`;
};
// where it snaps: a ragged line down through the middle (the left half is everything left of it, the right half everything right)
const RAG = [[100, 0], [100, 108], [97.5, 113], [101.5, 118], [98, 124], [101, 130], [99.5, 136], [100, 200]];
const half = (left) => `M${left ? "0" : "200"} 0${RAG.map(([x, y]) => `L${x} ${y}`).join("")}L${left ? "0" : "200"} 200Z`;
const CLIPS = `<clipPath id="hl"><path d="${half(true)}"/></clipPath><clipPath id="hr"><path d="${half(false)}"/></clipPath>`;
// each half turns on its block's inner top corner (the straight plank's underside rests there at y 126.25)
const PIVOT_L = [59, 126.25], PIVOT_R = [146, 126.25], REACH = 41;
const G = 2450, T_SNAP = 0.78, CREAK = 0.08;
// the bell's bottom sits at 122 (its middle sinking 23.75 for each unit of extra bow). The broken ends go down until their underside's corner meets the
// floor (y 150: 35 degrees, the straight half's underside at the pivot's height, 41 out); the bell comes to rest on their top corners there
const DOWN = Math.asin((150 - 126.25) / 41), BOTTOM0 = 122 + 23.75 * CREAK;
const FLOOR = 126.25 + 41 * Math.sin(DOWN) + (113.25 - 126.25) * Math.cos(DOWN), T_FALL = Math.sqrt((2 * (FLOOR - BOTTOM0)) / G);
// A half's broken end, bowed b and let down dy, before it turns: the plank's top at its middle. Turned a about the pivot, that end is at the bell's
// bottom: 41 sin a + c cos a = d, solved for a (and never turned back up past level).
const endTop = (b, dy) => 99.25 + 23.75 * b + dy;
function angleFor(b, dy, bottom) {
  const c = endTop(b, dy) - PIVOT_L[1], d = bottom - PIVOT_L[1], R = Math.hypot(REACH, c);
  return Math.max(0, ((Math.asin(Math.max(-1, Math.min(1, d / R))) - Math.atan2(c, REACH)) * 180) / Math.PI);
}

// ---- sad: it gives
const SAD_DUR = 2.6;
function sad(t) {
  if (t <= 0) return STILL;
  // the creak: it bows deeper under the bell, slowly, the bell sinking with its middle
  const creak = track([[0.2, 0], [T_SNAP, CREAK, "in"]], t);
  if (t < T_SNAP) return `${OPEN}${BACK}${plank(1 + creak)}<g transform="translate(0 ${n2(23.75 * creak)})">${BELL}</g></svg>`;
  // snapped: the bell falls (gravity at its scale), its bottom driving the two broken ends down with it, and lands on them on the floor; the halves let
  // go of their bend as they go (straight in a tenth of a second), resting on their blocks' inner corners
  const s = t - T_SNAP, f = Math.min(s, T_FALL), bottom = BOTTOM0 + 0.5 * G * f * f;
  const b = (1 + CREAK) * (1 - Math.min(1, s / 0.1)), dy = 14 * (1 - b / (1 + CREAK));
  // (landing: a thud, the bell rocking once on the ends under it, the halves' far ends bouncing a hair)
  const landed = s - T_FALL;
  const rock = landed > 0 ? track([[0, 0], [0.07, 2.4, "out"], [0.16, -1.2, "io"], [0.24, 0.4, "io"], [0.3, 0, "io"]], landed) : 0;
  const bounce = landed > 0 ? track([[0, 0], [0.06, -1.6, "out"], [0.14, 0.6, "io"], [0.2, 0, "io"]], landed) : 0;
  const a = angleFor(b, dy, bottom) + bounce;
  const halves = `${CLIPS}<g transform="rotate(${n2(a)} ${PIVOT_L[0]} ${PIVOT_L[1]})"><g clip-path="url(#hl)">${plank(b, dy)}</g></g><g transform="rotate(${n2(-a)} ${PIVOT_R[0]} ${PIVOT_R[1]})"><g clip-path="url(#hr)">${plank(b, dy)}</g></g>`;
  const bell = `<g transform="translate(0 ${n2(bottom - 122)}) rotate(${n2(rock)} 100 ${n2(122)})">${BELL}</g>`;
  return `${OPEN}${BACK}${halves}${bell}</svg>`;
}

export const REACTIONS = { sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
