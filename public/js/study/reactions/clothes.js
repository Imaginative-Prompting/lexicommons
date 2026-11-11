// Clothes' two stories, the socks': the left sock creeps down through its peg under its own wet weight until its top slips out, and it drops, its
// leg brushing past its partner's toe (which pokes into its way). Happy: as its open top comes by, the partner's toe slips into it: it's caught, and
// hangs from its partner by the corner, the two swinging and settling, a pair. Sad: the top goes by too soon, and it falls away out of the picture,
// its partner left swaying alone beside an empty peg.
// Every frame is a pure function of t, in seconds. The still's own parts: the teal behind, the shirt (its collar, body, shade), the trousers (and
// shade), the left sock and its shade (its top in the peg at y 61, 153-165.5 across), the right sock and its shade (its toe at about (163, 100)),
// the line, and the six pegs (the socks' at x 156.8 and 176.3). A sock (25 cm) is 46 here: 185 to the meter.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M36,61.5 Q50,66 64,61.5 L64,64 Q50,74 36,64 Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M26,61 L37,61 Q50,72 63,61 L74,61 Q86,69 93,80 L80,93 L75,85 L79,134 Q50,139 21,134 L25,85 L20,93 L7,80 Q14,69 26,61 Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M63.5,61 L74,61 Q86,69 93,80 L80,93 L75,85 L79,134 Q74,135.4 68,135.9 Q71.5,108 70,86 Q68.5,72 63.5,61 Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M100,61 L137,61 L154,158 Q141.5,161 129,158 L118.5,92 L108,158 Q95.5,161 83,158 Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M131,61 L137,61 L154,158 Q149,159.5 143,159.6 Q137.5,110 131,61 Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M153,61 L165.5,61 L165.5,85 Q167.5,93 162,98 L152,104.5 Q146,107 143.5,102.5 Q142,98.5 146,95 L152.5,88 Q153,87 153,85 Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M161.5,61 L165.5,61 L165.5,85 Q167.5,93 162,98 L152,104.5 Q149,105.8 147,105.4 L157,97 Q161.5,92 161.5,85 Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M172.5,61 L185,61 L185,85 Q187,93 181.5,98 L171.5,104.5 Q165.5,107 163,102.5 Q161.5,98.5 165.5,95 L172,88 Q172.5,87 172.5,85 Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M181,61 L185,61 L185,85 Q187,93 181.5,98 L171.5,104.5 Q168.5,105.8 166.5,105.4 L176.5,97 Q181,92 181,85 Z\" fill=\"var(--art-clay-deep,#C25626)\"/><rect x=\"0\" y=\"60\" width=\"200\" height=\"2\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"29\" y=\"53\" width=\"5\" height=\"13\" rx=\"1\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M32.3,53 H33 Q34,53 34,54 V65 Q34,66 33,66 H32.3 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"66\" y=\"53\" width=\"5\" height=\"13\" rx=\"1\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M69.3,53 H70 Q71,53 71,54 V65 Q71,66 70,66 H69.3 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"102\" y=\"53\" width=\"5\" height=\"13\" rx=\"1\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M105.3,53 H106 Q107,53 107,54 V65 Q107,66 106,66 H105.3 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"129\" y=\"53\" width=\"5\" height=\"13\" rx=\"1\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M132.3,53 H133 Q134,53 134,54 V65 Q134,66 133,66 H132.3 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"156.8\" y=\"53\" width=\"5\" height=\"13\" rx=\"1\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M160.1,53 H160.8 Q161.8,53 161.8,54 V65 Q161.8,66 160.8,66 H160.1 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"176.3\" y=\"53\" width=\"5\" height=\"13\" rx=\"1\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M179.6,53 H180.3 Q181.3,53 181.3,54 V65 Q181.3,66 180.3,66 H179.6 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/></svg>\n";
export const STILL_HASH = "939e1936bb";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 23 || !EL[6].includes("M153,61 L165.5,61")) throw new Error("clothes: the still isn't as this story knows it");
const BACK = EL.slice(0, 6).join(""), LEFT = EL[6] + EL[7], RIGHT = EL[8] + EL[9], FRONT = EL.slice(10).join("");
const G = 1810, T_R = 0.75, V0 = 18, CREEP = 5, PUSH = -4;
// the right sock turned a (degrees) about where its peg holds it
const PEG = [178.8, 61];
const right = (a) => (Math.abs(a) < 0.001 ? RIGHT : `<g transform="rotate(${n2(a)} ${PEG[0]} ${PEG[1]})">${RIGHT}</g>`);
const spin = (p, a, c) => { const r = (a * Math.PI) / 180, x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * Math.cos(r) - y * Math.sin(r), c[1] + x * Math.sin(r) + y * Math.cos(r)]; };
// the slip both start with: it creeps down through the peg's jaws, faster as it goes, until its top is out of them; then it falls
const drop = (t) => (t < 0.2 ? 0 : t < T_R ? CREEP * ((t - 0.2) / (T_R - 0.2)) ** 2 : CREEP + V0 * (t - T_R) + 0.5 * G * (t - T_R) ** 2);
// (falling, its leg meets the partner's toe and is pushed a little aside, the toe a little the other way)
const aside = (t) => track([[T_R, 0], [T_R + 0.05, PUSH, "out"]], t);
// when its top edge comes level with the top of the toe (y 95)
const T_TOP = T_R + (-V0 + Math.sqrt(V0 * V0 + 2 * G * (95 - 61 - CREEP))) / G;
const brushed = (t) => track([[T_R, 0], [T_R + 0.05, -3, "out"], [T_TOP + 0.03, -3.5, "io"]], t);

// ---- happy: caught by its partner
const HAPPY_DUR = 2.6, T_C = T_TOP + 0.012, CORNER = [165, 61.5];
const H0 = [CORNER[0] + 0.5, CORNER[1] + drop(T_C)];
function happy(t) {
  if (t <= 0.2) return STILL;
  // (drawn one way all through, in front of its partner from the moment it moves: before the catch the two never overlap, the leg pushed aside past
  // the toe; after it, the toe is inside its top)
  let x, y, la = 0, pa;
  if (t < T_C) {
    // (the toe slips in as the top goes by: the sock springs back over it)
    x = t < T_TOP ? aside(t) : PUSH + (0.5 - PUSH) * ((t - T_TOP) / (T_C - T_TOP));
    y = drop(t);
    pa = brushed(t);
  } else {
    // caught: its fall stops on the toe, the cloth giving and taking up; the partner's foot is pulled down; the sock swings under the toe and settles
    const s = t - T_C;
    const give = track([[0, 0], [0.06, 4, "out"], [0.16, -1, "io"], [0.26, 0.5, "io"], [0.34, 0, "io"]], s);
    pa = track([[0, -3.5], [0.08, -11, "out"], [0.25, -6, "io"], [0.42, -9, "io"], [0.6, -7.6, "io"], [0.8, -8, "io"]], s);
    la = track([[0, 0], [0.22, -28, "out"], [0.5, -16, "io"], [0.75, -24, "io"], [1.0, -20.5, "io"], [1.25, -22, "io"]], s);
    const H = spin(H0, pa - -3.5, PEG);
    x = H[0] - CORNER[0];
    y = H[1] + give - CORNER[1];
  }
  return `${OPEN}${BACK}${right(pa)}<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(la)} ${CORNER[0]} ${CORNER[1]})">${LEFT}</g>${FRONT}</svg>`;
}

// ---- sad: gone
const SAD_DUR = 2.6;
function sad(t) {
  if (t <= 0) return STILL;
  const dy = drop(t);
  // (it goes on falling, its top past the toe, and out of the bottom of the picture)
  const sock = dy < 145 ? `<g transform="translate(${n2(aside(t))} ${n2(dy)})">${LEFT}</g>` : "";
  // the partner, let go by the passing leg, sways on its peg and comes to rest
  const pa = t < T_TOP + 0.03 ? brushed(t) : track([[T_TOP + 0.03, -3.5], [T_TOP + 0.2, 2.2, "io"], [T_TOP + 0.38, -1.3, "io"], [T_TOP + 0.56, 0.7, "io"], [T_TOP + 0.74, -0.3, "io"], [T_TOP + 0.9, 0, "io"]], t);
  return `${OPEN}${BACK}${sock}${right(pa)}${FRONT}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
