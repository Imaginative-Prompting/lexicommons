// Drawer's story, its sad alone (its happy needed a towel the still doesn't draw: the player keeps the still for it): the middle drawer stands half
// out on worn runners, and its overhanging weight settles it a hair, tipping it downhill: it creeps out, faster and faster, until its back clears the
// runners and it drops, flat, to the floor in front of the chest with a thud. The chest's middle slot stands dark and empty.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor, the chest's shadow, its legs and side, its body, top
// and lip, the top and bottom drawers and their knobs, the middle slot (dark), and the middle drawer (its right side, rim, inside, left inside, front
// 35-119 across and 111-139 down, its knob). Toward us is (-0.825, 0.567) a unit of depth. The chest (70 cm) is 137 tall: 196 to the meter.
import { n2, n4, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"0\" y=\"150\" width=\"200\" height=\"50\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"41,180.5 56,168.5 156,166 200,170 200,200 152,200\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"147,157 154,157 154,168.7 148.5,168.7\" fill=\"var(--art-bark,#7A4E2D)\"/><polygon points=\"154,157.2 158,154.5 158,166 154,168.7\" fill=\"var(--art-bark-deep,#4B2F24)\"/><polygon points=\"136,64 158,50 158,155 136,169.5\" fill=\"var(--art-bark-deep,#4B2F24)\"/><polygon points=\"41,168 48,168 46.5,180 41,180\" fill=\"var(--art-bark,#7A4E2D)\"/><polygon points=\"130,168 137,168 137,180 131.5,180\" fill=\"var(--art-bark,#7A4E2D)\"/><polygon points=\"136.5,168.6 141,165.6 141,177.3 137,180\" fill=\"var(--art-bark-deep,#4B2F24)\"/><rect x=\"41\" y=\"63\" width=\"96\" height=\"106\" fill=\"var(--art-bark,#7A4E2D)\"/><polygon points=\"38,59.5 62,43 163,43 139,59.5\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"138.5,59 163,42.6 163,49 138.5,65.3\" fill=\"var(--art-bark,#7A4E2D)\"/><rect x=\"38\" y=\"59\" width=\"101\" height=\"6\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"47\" y=\"70\" width=\"84\" height=\"28\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"89\" cy=\"84\" r=\"4.5\" fill=\"var(--art-bark,#7A4E2D)\"/><rect x=\"47\" y=\"136\" width=\"84\" height=\"28\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"89\" cy=\"150\" r=\"4.5\" fill=\"var(--art-bark,#7A4E2D)\"/><rect x=\"47\" y=\"103\" width=\"84\" height=\"28\" fill=\"var(--art-bark-deep,#4B2F24)\"/><polygon points=\"118.5,111 131,103 131,131.5 118.5,139.5\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"35,111.5 47,103 131,103 119,111.5\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"39.9,109.4 49.5,103 128.5,103 118.9,109.4\" fill=\"var(--art-bark-deep,#4B2F24)\"/><polygon points=\"39.9,109.4 49.5,103 57,103 57,109.4\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"35\" y=\"111\" width=\"84\" height=\"28\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"77\" cy=\"125\" r=\"4.5\" fill=\"var(--art-bark,#7A4E2D)\"/></svg>\n";
export const STILL_HASH = "5bb4122ae2";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 24 || !EL[22].includes('x="35" y="111" width="84" height="28"')) throw new Error("drawer: the still isn't as this story knows it");
const CHEST = EL.slice(0, 18).join(""), BOX = EL.slice(18).join("");
const OUT = [-0.825, 0.567], G = 1920, SLIDE = 30, DROP = 41, T_GO = 0.55;
// the creep: from rest, faster and faster (half the fall's pull, the runners' friction taking the rest), until its back clears them
const A = 0.25 * G, T_CLEAR = T_GO + Math.sqrt((2 * SLIDE) / A), V_OUT = A * (T_CLEAR - T_GO);
const T_LAND = T_CLEAR + Math.sqrt((2 * DROP) / G);

// ---- sad: out it comes
const SAD_DUR = 2.2;
function sad(t) {
  if (t <= 0.25) return STILL;
  // it settles on the worn runners first (its front dipping a hair), then creeps out
  const sag = track([[0.25, 0], [T_GO, 1.4, "in"]], t);
  let along = 0, down = sag, squash = 1;
  if (t > T_GO) along = 0.5 * A * Math.min(t - T_GO, T_CLEAR - T_GO) ** 2;
  if (t > T_CLEAR) {
    // free of the runners: it falls (still carried out a little by its speed) and lands flat; the thud squashes it a hair and it settles
    const f = Math.min(t, T_LAND) - T_CLEAR;
    along += V_OUT * 0.3 * f;
    down += 0.5 * G * f * f;
    if (t > T_LAND) squash = track([[T_LAND, 1], [T_LAND + 0.05, 0.94, "out"], [T_LAND + 0.13, 1.01, "io"], [T_LAND + 0.2, 1, "io"]], t);
  }
  const x = OUT[0] * along, y = OUT[1] * along + down, foot = 139 + y;
  const box = `<g transform="translate(0 ${n2(foot)}) scale(1 ${n4(squash)}) translate(${n2(x)} ${n2(-139)})">${BOX}</g>`;
  return `${OPEN}${CHEST}${box}</svg>`;
}

export const REACTIONS = { sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
