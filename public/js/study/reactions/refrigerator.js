// Refrigerator's story, its sad alone: the note on the door is held by one small magnet at its top, and the magnet's grip on the paper is weak. The
// note creeps down out from under it, slowly, then, its top edge out from under the magnet, it drops away from the door and flutters down, rocking
// side to side as paper falls, and lands flat on the floor in front of the fridge. The magnet stays on the door, holding nothing.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall and the floor, then (all inside the still's own frame, 1.45 times
// these units) the shadow, the fridge's feet, its side, its top, its body, its two doors, their handles, the note (its face and its edge, 88-102.5
// across, 112-129.5 down, on the lower door) and the magnet on it (at 94.8, 113). The fridge stands on the floor at y 168.5; the floor in front of it
// runs down to the picture's foot (187). The fridge (1.6 m) is 98 tall: 61 to the meter; a falling note drops at about a meter a second.
import { n2, n4, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"0\" y=\"146.4\" width=\"200\" height=\"53.6\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><g transform=\"translate(100 100) scale(1.45) translate(-96 -118)\"><polygon points=\"72,168 122,160 200,182 200,200 138,200\" fill=\"var(--art-teal-deep,#25907B)\"/><rect x=\"70\" y=\"164\" width=\"5.5\" height=\"7\" rx=\"0.8\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"104.5\" y=\"164\" width=\"5.5\" height=\"7\" rx=\"0.8\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"111,74 125,65.5 125,160.5 111,168.5\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"68,74.5 81.5,65.5 125,65.5 111.5,74.5\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"68\" y=\"74\" width=\"44\" height=\"94.5\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><rect x=\"68\" y=\"74\" width=\"44\" height=\"27\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><rect x=\"68\" y=\"102.5\" width=\"44\" height=\"63\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><rect x=\"72\" y=\"84\" width=\"3.5\" height=\"13\" rx=\"0.8\" fill=\"var(--art-ink-lit,#3A3460)\"/><rect x=\"74.3\" y=\"84\" width=\"1.2\" height=\"13\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"72\" y=\"106.5\" width=\"3.5\" height=\"15\" rx=\"0.8\" fill=\"var(--art-ink-lit,#3A3460)\"/><rect x=\"74.3\" y=\"106.5\" width=\"1.2\" height=\"15\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"88,113 101.5,112 102.5,128.5 89,129.5\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"101.5,112 102.5,128.5 101,128.6 100,112.1\" fill=\"var(--art-sun,#F7BE45)\"/><circle cx=\"94.8\" cy=\"113\" r=\"2.2\" fill=\"var(--art-clay,#E8743B)\"/></g></svg>\n";
export const STILL_HASH = "c3e109f5be";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const IN = '<g transform="translate(100 100) scale(1.45) translate(-96 -118)">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 17 || !STILL.includes(EL[1] + IN) || !EL[14].includes("88,113 101.5,112 102.5,128.5 89,129.5") || !EL[16].includes('cx="94.8" cy="113"')) throw new Error("refrigerator: the still isn't as this story knows it");
const OUTSIDE = EL[0] + EL[1], FRIDGE = EL.slice(2, 14).join(""), NOTE = EL[14] + EL[15], MAGNET = EL[16];
const MID = [95.2, 120.8];
// ---- the slip: the note creeps down under the magnet (6), its top edge then out from under it; it falls away from the door, fluttering, and lands
// flat on the floor (lying, it's seen shortened to a third as deep as it's tall)
const T0 = 0.3, T_FREE = 1.05, CREEP = 6, T_FLOOR = T_FREE + 0.8, REST = [91, 176.5];
function note(t) {
  // [its middle, its turn (degrees), how upright (1) or flat on the floor (0.32)]
  if (t <= T_FREE) { const c = CREEP * track([[T0, 0], [T_FREE, 1, "in"]], t); return [[MID[0], MID[1] + c], 0, 1]; }
  if (t <= T_FLOOR) {
    const f = (t - T_FREE) / (T_FLOOR - T_FREE), from = [MID[0], MID[1] + CREEP];
    // (falling at about paper's speed, swinging side to side, leaning back from the door toward us as it goes)
    const x = from[0] + (REST[0] - from[0]) * f + 5 * Math.sin(f * Math.PI * 2.2), y = from[1] + (REST[1] - from[1]) * (0.35 * f + 0.65 * f * f);
    return [[x, y], 16 * Math.sin(f * Math.PI * 2.2) * (1 - f * 0.6), 1 - 0.68 * f * f];
  }
  const settle = track([[T_FLOOR, 0], [T_FLOOR + 0.15, 1, "out"]], t);
  return [[REST[0], REST[1] + 0.4 * settle], 6 * (1 - settle) - 4 * settle, 0.32];
}

// ---- sad: on the floor
const SAD_DUR = T_FLOOR + 0.5;
function sad(t) {
  if (t <= T0) return STILL;
  const [c, a, up] = note(t);
  const n = `<g transform="translate(${n2(c[0])} ${n2(c[1])}) rotate(${n2(a)}) scale(1 ${n4(up)}) translate(${-MID[0]} ${-MID[1]})">${NOTE}</g>`;
  // (on the door it's under the magnet; once it's off the door it's in front of everything)
  return t <= T_FREE ? `${OPEN}${OUTSIDE}${IN}${FRIDGE}${n}${MAGNET}</g></svg>` : `${OPEN}${OUTSIDE}${IN}${FRIDGE}${MAGNET}${n}</g></svg>`;
}

export const REACTIONS = { sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
