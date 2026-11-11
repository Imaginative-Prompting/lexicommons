// Jacket's two stories, its zipper's: the slider doesn't lock, and the pull's weight drags it down. Happy: it runs all the way down to the bottom stop
// (the pin stays seated) and the fronts, free above it, fall open in a V on the hanger: the jacket hangs open. Sad: just below the chest, a loose fold
// of the lining lies across its path; the slider swallows it and jams there, the lining bunched in its jaws, the opening above it short and crooked.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the peg and hook, the jacket's shadow, the sleeves, the body, the hem,
// the collar and the hanger in it, the zipper (a dark line down the middle, x 95-97, from y 59.5 to 178) and its pull at the throat (y 61-70), the pockets.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><circle cx=\"102\" cy=\"21\" r=\"5.5\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M94.9,29.7 A7.5,7.5 0 0 1 109.4,33.5 C108.6,36.5 103,37.5 103,41 L103,47 L101,47 L101,41 C101,36.5 106.6,35.5 107.4,33.1 A5.5,5.5 0 0 0 96.8,30.3 A1,1 0 0 1 94.9,29.7 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M100,44 C101,43 103,43 104,44 C108,48 113,52 120,56 L121,63 L83,63 L84,56 C91,52 96,48 100,44 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M66,72 C58,73 49,78 45,90 C39,112 34,144 33,174 L53,176 C54,154 58,130 64,110 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M138,72 C146,73 155,78 159,90 C165,112 170,144 171,174 L151,176 C150,154 146,130 140,110 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M82,66 L122,66 L140,74 C144,86 143,98 142,106 C143,128 143,152 141,172 L63,172 C61,152 61,128 62,106 C61,98 60,86 64,74 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M80,56 C80,49 124,49 124,56 C124,63 123,68 120,72 C114,75 108,76 102,76 C96,76 90,75 84,72 C81,68 80,63 80,56 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><rect x=\"62.5\" y=\"171\" width=\"79\" height=\"13\" rx=\"2\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M33.5,172 L54,174 L53.2,183.5 Q53,184.5 52,184.4 L36,183.2 Q35,183 35,182 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M170.5,172 L150,174 L150.8,183.5 Q151,184.5 152,184.4 L168,183.2 Q169,183 169,182 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><circle cx=\"96\" cy=\"15\" r=\"5.5\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M88.9,23.7 A7.5,7.5 0 0 1 103.4,27.5 C102.6,30.5 97,31.5 97,35 L97,41 L95,41 L95,35 C95,30.5 100.6,29.5 101.4,27.1 A5.5,5.5 0 0 0 90.8,24.3 A1,1 0 0 1 88.9,23.7 Z\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"94.5\" y=\"14\" width=\"3\" height=\"7\" rx=\"1.5\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M60,66 C52,67 43,72 39,84 C33,106 28,138 27,168 L47,170 C48,148 52,124 58,104 Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M41,169 C42,142 46,118 52,98 L58,96 L58,104 C52,124 48,148 47,170 Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M132,66 C140,67 149,72 153,84 C159,106 164,138 165,168 L145,170 C144,148 140,124 134,104 Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M132,66 C140,67 149,72 153,84 C159,106 164,138 165,168 L158,169 C157,140 152,110 147,90 C145,82 140,76 132,73 Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M27.5,166 L48,168 L47.2,177.5 Q47,178.5 46,178.4 L30,177.2 Q29,177 29,176 Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M164.5,166 L144,168 L144.8,177.5 Q145,178.5 146,178.4 L162,177.2 Q163,177 163,176 Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M76,60 L116,60 L134,68 C138,80 137,92 136,100 C137,122 137,146 135,166 L57,166 C55,146 55,122 56,100 C55,92 54,80 58,68 Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M127,64.9 L134,68 C138,80 137,92 136,100 C137,122 137,146 135,166 L127,166 C129,146 129,122 128,100 C129,90 129,78 127,64.9 Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><rect x=\"56.5\" y=\"165\" width=\"79\" height=\"13\" rx=\"2\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M74,50 C74,43 118,43 118,50 C118,57 117,62 114,66 C108,69 102,70 96,70 C90,70 84,69 78,66 C75,62 74,57 74,50 Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M77.5,50 C77.5,45 114.5,45 114.5,50 C114.5,55 107,59.5 96,59.5 C85,59.5 77.5,55 77.5,50 Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M94,38 C95,37 97,37 98,38 C102,42 107,46 114,50 L115,57 L77,57 L78,50 C85,46 90,42 94,38 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M98,38 C102,42 107,46 114,50 L115,57 L104,57 C104,50 102,44 98,38 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M77.5,50 C83,52 89,52.5 96,52.5 C103,52.5 109,52 114.5,50 C114.5,55 107,59.5 96,59.5 C85,59.5 77.5,55 77.5,50 Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M74,50 L77.5,50 C77.5,55 85,59.5 96,59.5 C107,59.5 114.5,55 114.5,50 L118,50 C118,57 117,62 114,66 C108,69 102,70 96,70 C90,70 84,69 78,66 C75,62 74,57 74,50 Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M113.2,53.7 C114.2,52.5 114.5,51.3 114.5,50 L118,50 C118,57 117,62 114,66 Q111.6,67.2 108.6,68.2 C111,64 112.5,58 113.2,53.7 Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><rect x=\"95\" y=\"59.5\" width=\"2\" height=\"118.5\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"94\" y=\"61\" width=\"4\" height=\"9\" rx=\"1.5\" fill=\"var(--art-ink-lit,#3A3460)\"/><polygon points=\"69.5,124.5 73.5,125.5 64.5,150.5 60.5,149.5\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"122.5,124.5 118.5,125.5 127.5,150.5 131.5,149.5\" fill=\"var(--art-ink,#231F3B)\"/></svg>\n";
export const STILL_HASH = "aa4d24fec7";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 34 || !EL[30].includes('x="95" y="59.5"')) throw new Error("jacket: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const MID = 96, TOP = 59.5, PULL = 61;

// the jacket with its zipper open from the collar down to the slider at y: the fronts parted (w across at the top, bowing out a little as they hang),
// the inside back seen between them, each front's tape along its edge; below the slider the zipper still closed; the slider and its pull at y
function open(y, w, lean = 0, fold = 0) {
  const base = EL.slice(0, 30).join("") + EL.slice(32).join("");
  if (y - PULL < 0.05) return `${OPEN}${base}${EL[30]}${EL[31]}</svg>`;
  const L = [MID - w / 2 - lean, TOP], R = [MID + w / 2 - lean * 0.4, TOP], V = [MID, y + 1];
  const bow = w * 0.18;
  const gap = `M${n2(L[0])} ${TOP}C${n2(L[0] - bow)} ${n2(TOP + (y - TOP) * 0.45)} ${n2(MID - 1 - bow * 0.4)} ${n2(y - 6)} ${MID} ${n2(V[1])}`
    + `C${n2(MID + 1 + bow * 0.4)} ${n2(y - 6)} ${n2(R[0] + bow)} ${n2(TOP + (y - TOP) * 0.45)} ${n2(R[0])} ${TOP}Z`;
  // (it's lined in orange: the lining inside, in the jacket's shade)
  const inside = w > 0.05 ? `<path d="${gap}" ${fill("clay-deeper")}/>` : "";
  // (the tapes: each a thin dark strip along its front's edge, meeting at the slider)
  const tape = (P, s) => `<path d="M${n2(P[0])} ${TOP}C${n2(P[0] + s * -bow)} ${n2(TOP + (y - TOP) * 0.45)} ${n2(MID + s * (-1 - bow * 0.4))} ${n2(y - 6)} ${MID} ${n2(V[1])}`
    + `L${n2(MID + s * 1.6)} ${n2(V[1])}C${n2(MID + s * (0.6 - bow * 0.4))} ${n2(y - 6)} ${n2(P[0] + s * (2 - bow))} ${n2(TOP + (y - TOP) * 0.45)} ${n2(P[0] + s * 2)} ${TOP}Z" ${fill("ink")}/>`;
  const tapes = w > 0.05 ? tape(L, 1) + tape(R, -1) : `<rect x="95" y="59.5" width="2" height="${n2(y - TOP)}" ${fill("ink")}/>`;
  const below = `<rect x="95" y="${n2(y + 8)}" width="2" height="${n2(178 - y - 8)}" ${fill("ink")}/>`;
  const slider = EL[31].replace('y="61"', `y="${n2(y)}"`);
  // (the lining it has swallowed: a fold of the inside, bunched and pinched into the slider's jaws, creased)
  // (two lobes of cloth bulging out either side of the slider, pinched into its jaws, creases running into it)
  const F = fold * 1.6, S = [MID, y + 2.5];
  const lobe = (d, cx, cy, r) => `<path d="M${n2(S[0])} ${n2(S[1])}C${n2(S[0] + d * 2)} ${n2(cy + r * 0.9)} ${n2(cx + d * r)} ${n2(cy + r * 0.6)} ${n2(cx + d * r * 0.9)} ${n2(cy - r * 0.2)}`
    + `C${n2(cx + d * r * 0.7)} ${n2(cy - r)} ${n2(cx - d * r * 0.4)} ${n2(cy - r * 1.05)} ${n2(cx - d * r * 0.7)} ${n2(cy - r * 0.4)}C${n2(cx - d * r)} ${n2(cy + r * 0.1)} ${n2(S[0] + d * 0.5)} ${n2(S[1] - 3)} ${n2(S[0])} ${n2(S[1])}Z"`;
  const crease = (d, cx, cy, r) => `<path d="M${n2(S[0] + d * 0.6)} ${n2(S[1] - 1)}L${n2(cx + d * r * 0.3)} ${n2(cy - r * 0.55)}L${n2(cx + d * r * 0.45)} ${n2(cy - r * 0.35)}L${n2(S[0] + d * 1.2)} ${n2(S[1] - 0.4)}Z" ${fill("clay-deep")}/>`;
  const L1 = [-1, MID - 6.5 * F, y - 4.5 * F, 4.6 * F], R1 = [1, MID + 7.5 * F, y - 3.5 * F, 5.2 * F];
  const bunch = fold > 0.01 ? `<g ${fill("clay")}>${lobe(...L1)}/>${lobe(...R1)}/></g>${crease(...L1)}${crease(...R1)}` : "";
  return `${OPEN}${base}${inside}${tapes}${below}${bunch}${slider}</svg>`;
}

// ---- happy: all the way down
const HAPPY_DUR = 2.4, STOP = 160;
function happy(t) {
  if (t <= 0) return STILL;
  // it creeps, gathers speed, runs down and knocks against the bottom stop, a little back, and rests; the fronts fall open as it goes
  const y = PULL + track([[0.35, 0], [1.4, STOP - PULL, "in"], [1.5, STOP - PULL - 1.6, "out"], [1.62, STOP - PULL, "in"]], t);
  const w = 26 * Math.min(1, track([[0.5, 0], [1.75, 1, "io"]], t));
  return open(y, w);
}

// ---- sad: it jams on the lining
const SAD_DUR = 2.4, JAM = 106;
function sad(t) {
  if (t <= 0) return STILL;
  // the same creep and run, then the lining caught: it drags into the jaws, slows the slider and stops it dead; the opening above stays short and
  // pulled crooked by the caught side
  const y = PULL + track([[0.35, 0], [0.88, JAM - PULL - 6, "in"], [1.02, JAM - PULL, "out"]], t);
  const fold = track([[0.82, 0], [1.02, 1, "out"], [1.12, 0.94, "io"]], t);
  const w = 12 * Math.min(1, track([[0.5, 0], [1.4, 1, "io"]], t)), lean = 4 * track([[0.85, 0], [1.2, 1, "io"]], t);
  return open(y, w, lean, fold);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
