// Hallway's two stories, the near door's: it isn't latched, and its hinges lean a little, so it drifts open into the hall under its own weight. Happy: it
// swings on round, wide, and comes to rest back against the wall beside its doorway, the hall clear, the room beyond it open. Sad: its bottom corner
// catches the runner's edge, rucks it up, and jams there, the door standing across the hall.
// Every frame is a pure function of t, in seconds. The still is one-point perspective: the eye at the vanishing point (100, 100.5), the hall 2 wide
// (walls at X = -1 and 1), the floor 1.57 below the eye (screen x = 100 + 100 X / Z, y = 100.5 + 100 Y / Z). The near left door: hinged at its near
// edge (X -1, Z 1.4286, screen x 30), its face 0.676 deep, its knob near its far edge; the runner 0.65 wide down the middle.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><polygon points=\"36,201 85.5,123.6 114.5,123.6 164,201\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"79.2,201 94.7,125.3 105.3,125.3 120.8,201\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"85.6\" y=\"81.6\" width=\"28.8\" height=\"42.6\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"93\" y=\"93\" width=\"14\" height=\"31.2\" fill=\"var(--art-clay-deep,#C25626)\"/><rect x=\"93\" y=\"94.3\" width=\"14\" height=\"29.9\" fill=\"var(--art-clay,#E8743B)\"/><circle cx=\"104.3\" cy=\"110.5\" r=\"0.7\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"0,0 22.2,0 86,82 86,124 41.7,200 0,200\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"200,0 177.8,0 114,82 114,124 158.3,200 200,200\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"30,70 56.3,81.3 56.3,175 30,220\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"30,72.4 52.5,81.3 52.5,181.4 30,220\" fill=\"var(--art-clay,#E8743B)\"/><ellipse cx=\"47\" cy=\"136.6\" rx=\"1.4\" ry=\"2\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"68.9,86.7 75.4,89.5 75.4,142.1 68.9,153.3\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"68.9,87.7 73.3,89.5 73.3,145.7 68.9,153.3\" fill=\"var(--art-clay,#E8743B)\"/><ellipse cx=\"72\" cy=\"119.3\" rx=\"0.6\" ry=\"0.9\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"80,91.4 82.5,92.5 82.5,130 80,134.3\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"80,92.1 81,92.5 81,132.6 80,134.3\" fill=\"var(--art-clay,#E8743B)\"/><polygon points=\"170,70 143.7,81.3 143.7,175 170,220\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"170,72.4 147.5,81.3 147.5,181.4 170,220\" fill=\"var(--art-clay,#E8743B)\"/><ellipse cx=\"153\" cy=\"136.6\" rx=\"1.4\" ry=\"2\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"131.1,86.7 124.6,89.5 124.6,142.1 131.1,153.3\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"131.1,87.7 126.7,89.5 126.7,145.7 131.1,153.3\" fill=\"var(--art-clay,#E8743B)\"/><ellipse cx=\"128\" cy=\"119.3\" rx=\"0.6\" ry=\"0.9\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"120,91.4 117.5,92.5 117.5,130 120,134.3\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"120,92.1 119,92.5 119,132.6 120,134.3\" fill=\"var(--art-clay,#E8743B)\"/><rect x=\"99.6\" y=\"72.3\" width=\"0.8\" height=\"3.5\" fill=\"var(--art-violet,#7C5CE6)\"/><ellipse cx=\"100\" cy=\"72.3\" rx=\"2.5\" ry=\"0.7\" fill=\"var(--art-violet,#7C5CE6)\"/><circle cx=\"100\" cy=\"77.7\" r=\"2.8\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M100 74.9A2.8 2.8 0 0 1 100 80.5A3.6 3.6 0 0 0 100 74.9Z\" fill=\"var(--art-sun,#F7BE45)\"/><rect x=\"99.4\" y=\"55\" width=\"1.2\" height=\"5\" fill=\"var(--art-violet,#7C5CE6)\"/><ellipse cx=\"100\" cy=\"55\" rx=\"4\" ry=\"1.1\" fill=\"var(--art-violet,#7C5CE6)\"/><circle cx=\"100\" cy=\"63.8\" r=\"4.5\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M100 59.3A4.5 4.5 0 0 1 100 68.3A5.8 5.8 0 0 0 100 59.3Z\" fill=\"var(--art-sun,#F7BE45)\"/><rect x=\"98.8\" y=\"10\" width=\"2.4\" height=\"9.5\" fill=\"var(--art-violet,#7C5CE6)\"/><ellipse cx=\"100\" cy=\"10\" rx=\"8\" ry=\"2.2\" fill=\"var(--art-violet,#7C5CE6)\"/><circle cx=\"100\" cy=\"27.5\" r=\"9\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M100 18.5A9 9 0 0 1 100 36.5A11.5 11.5 0 0 0 100 18.5Z\" fill=\"var(--art-sun,#F7BE45)\"/></svg>\n";
export const STILL_HASH = "0a114b1c10";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 37 || !EL[10].includes("30,72.4 52.5,81.3")) throw new Error("hallway: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const P = (X, Y, Z) => [100 + (100 * X) / Z, 100.5 + (100 * Y) / Z];
const pts = (A) => A.map((p) => `${n2(p[0])} ${n2(p[1])}`).join("L");
const ZH = 1.4286, W = 0.6764, TOP = [-0.4014, -0.4042], BOT = [1.707, 1.703], KNOB = [0.677, 0.681], THICK = 0.045;
const DEG = Math.PI / 180;

// the leaf turned f (degrees) out into the hall about its hinge: its face, the thickness of its free edge beyond it, its knob
function leaf(f) {
  const s = Math.sin(f * DEG), c = Math.cos(f * DEG);
  const at = (u, Y) => P(-1 + u * W * s, Y, ZH + u * W * c);
  const face = [P(-1, TOP[0], ZH), at(1, TOP[1]), at(1, BOT[1]), P(-1, BOT[0], ZH)];
  // (the free edge's own face: the door's thickness, behind its face, toward the wall it came from)
  const back = (Y) => P(-1 + W * s - THICK * c, Y, ZH + W * c + THICK * s);
  const edge = [at(1, TOP[1]), back(TOP[1]), back(BOT[1]), at(1, BOT[1])];
  const k = at(KNOB[0], KNOB[1]), z = ZH + KNOB[0] * W * c, sc = 1.8868 / z;
  return `<path d="M${pts(edge)}Z" ${fill("clay-deep")}/><path d="M${pts(face)}Z" ${fill("clay")}/><ellipse cx="${n2(k[0])}" cy="${n2(k[1])}" rx="${n2(1.4 * sc)}" ry="${n2(2 * sc)}" ${fill("ink")}/>`;
}
// what the door shows when it's open: the room beyond, dim (its far wall in the room's shade, its floor below), tucked 0.4 inside the doorway so only
// the frame bounds it
const ROOM = `<path d="M30.4 73.2L52.1 81.8L52.1 181L30.4 219.2Z" ${fill("paper-deeper")}/><path d="M30.4 186L52.1 166L52.1 181L30.4 219.2Z" ${fill("wood-deep")}/>`;
const HALL = EL.slice(0, 9).join(""), FAR = EL.slice(12).join("");
function scene(f, extra = "") {
  if (f < 0.01) return STILL;
  // (back to front: the hall and its far doors, the near door's frame, the room through its doorway, the runner's ruck, the leaf)
  return `${OPEN}${HALL}${EL[9]}${ROOM}${FAR}${extra}${leaf(f)}</svg>`;
}

// the drift both start with: from rest, gathering speed as its weight swings it
const drift = [[0.3, 0], [0.95, 40, "in"]];

// ---- happy: back against the wall
const HAPPY_DUR = 2.4;
function happy(t) {
  if (t <= 0) return STILL;
  // on round past square, the hinges' friction slowing it as it nears the wall; it touches, gives back a hair, and rests there
  return scene(track([...drift, [1.8, 174, "out"], [1.92, 171.5, "io"], [2.08, 174, "io"]], t));
}

// ---- sad: it jams on the runner
const SAD_DUR = 2.4, T_CATCH = 1.17;
// the runner's left edge, rucked up by the door's corner: a hump of the cloth pushed in toward the middle, and the floor bared where it was
function ruck(k) {
  if (k < 0.01) return "";
  const x0 = 79.2, top = 200 - 15 * k, mid = 84 + 2 * k;
  return `<path d="M76.6 200L${n2(x0 - 1.2 * k)} ${n2(196 - 2 * k)}L79.3 200Z" ${fill("wood")}/>`
    + `<path d="M${n2(x0 - 1 * k)} 200C${n2(x0)} ${n2(top + 4)} ${n2(mid - 3)} ${n2(top)} ${n2(mid)} ${n2(top)}C${n2(mid + 3.5)} ${n2(top)} ${n2(mid + 4)} ${n2(top + 6)} ${n2(mid + 5)} 200Z" ${fill("teal")}/>`
    + `<path d="M${n2(mid)} ${n2(top)}C${n2(mid + 3.5)} ${n2(top)} ${n2(mid + 4)} ${n2(top + 6)} ${n2(mid + 5)} 200L${n2(mid + 2.4)} 200C${n2(mid + 2.2)} ${n2(top + 7)} ${n2(mid + 1.6)} ${n2(top + 2)} ${n2(mid)} ${n2(top)}Z" ${fill("teal-deep")}/>`;
}
function sad(t) {
  if (t <= 0) return STILL;
  // the same drift and swing; its corner meets the runner's edge and drags it, slowing hard; it stops, eases back a little against the cloth, and stays
  const f = track([...drift, [T_CATCH, 79, "in"], [1.32, 84.5, "out"], [1.45, 83, "io"], [1.6, 83.6, "io"]], t);
  return scene(f, ruck(track([[T_CATCH - 0.02, 0], [1.32, 1, "out"], [1.45, 0.92, "io"]], t)));
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
