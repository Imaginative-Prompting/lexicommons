// Help's two stories, the life ring's. Happy: help is right where it's needed: the camera draws back and down, and the yellow wall turns
// out to be a board at the end of a jetty, the sea below it moving in slow swells; the ring sways once on its peg in the sea air and
// settles. Sad: its worn peg gives: under the ring's weight it creeps out of the wall and tips, then slips out of its hole, and peg, cord
// and ring drop out of the frame together, leaving the bare wall and the peg's hole.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view; the world carries on past its frame.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><circle cx=\"98\" cy=\"119\" r=\"58\" fill=\"var(--art-sun-deep,#DB9A22)\"/><circle cx=\"98\" cy=\"119\" r=\"31\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M98.3,14.7 L106.3,22.7 A7.5 7.5 0 0 1 95.7,33.3 L87.7,25.3 Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><rect x=\"87\" y=\"17\" width=\"10\" height=\"14\" rx=\"5\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M92,16 L44.7,75.3 A60.5 60.5 0 0 0 31.5,113 L31.5,114 L34.5,114 L34.5,113 A57.5 57.5 0 0 1 47,77.3 L92,20.5 L137,77.3 A57.5 57.5 0 0 1 149.5,113 L149.5,114 L152.5,114 L152.5,113 A60.5 60.5 0 0 0 139.3,75.3 Z\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"92\" cy=\"18\" r=\"8.5\" fill=\"var(--art-bark-deep,#4B2F24)\"/><circle cx=\"90.8\" cy=\"17.2\" r=\"7\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M92,55 A58 58 0 0 0 34,113 L61,113 A31 31 0 0 1 92,82 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M92,55 A58 58 0 0 1 150,113 L123,113 A31 31 0 0 0 92,82 Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M150,113 A58 58 0 0 1 92,171 L92,144 A31 31 0 0 0 123,113 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M92,171 A58 58 0 0 1 34,113 L61,113 A31 31 0 0 0 92,144 Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M88.5,55.1 A58 58 0 0 1 150,113 L143,113 A58 58 0 0 0 88.5,55.1 Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M150,113 A58 58 0 0 1 88.5,170.9 A58 58 0 0 0 143,113 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><rect x=\"88.5\" y=\"51\" width=\"7\" height=\"35\" rx=\"3.5\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"88.5\" y=\"140\" width=\"7\" height=\"35\" rx=\"3.5\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"28\" y=\"109.5\" width=\"36\" height=\"7\" rx=\"3.5\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"120\" y=\"109.5\" width=\"36\" height=\"7\" rx=\"3.5\" fill=\"var(--art-wood,#DCA063)\"/></svg>\n";
export const STILL_HASH = "85c9af9681";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 18) throw new Error("help: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
// the still's parts: the ring's shadow on the wall (a disc and the wall through its hole); the peg's shadow, its shaft; the cord; the
// peg's head; the ring (its four quarters, its shading, its four lashings)
const RING_SHADOW = EL[1] + EL[2], PEG_SHADOW = EL[3], PEG_SHAFT = EL[4], CORD = EL[5], PEG_HEAD = EL[6] + EL[7], RING = EL.slice(8, 18).join("");
const PEG = [92, 18], SHADOW_PEG = [98, 24];
const turned = (svg, a, p) => `<g transform="rotate(${n2(a)} ${p[0]} ${p[1]})">${svg}</g>`;
// short path numbers (tenths), for the water's moving edges
const f1 = (v) => { const r = Math.round(v * 10) / 10, s = (r === 0 ? 0 : r).toString(); return s.replace(/^(-?)0\./, "$1."); };

// ---- happy. The world past the wall: sky; the sea from its horizon down; the board (the wall) standing on the jetty's end, its shaded
// right edge; the deck's top and its edge beam; the piles going down into the water; the swells, flat lighter bands drifting and rising
const HORIZON = 196, BOARD = [-14, -50, 214, 236], DECK = 236;
const PILES = [-86, 4, 94, 184, 274];
function swell(y0, h, len, speed, t, seed) {
  // a band of lighter water: its top a slow wave, drifting along; its underside a flatter wave, so it reads as the back of a swell
  const top = [], bot = [], ph = t * speed + seed;
  for (let x = -170; x <= 370; x += 18) {
    top.push([x, y0 + 1.8 * Math.sin((x / len) * 2 * Math.PI + ph) + 1.2 * Math.sin(t * 0.9 + seed)]);
    bot.push([x, y0 + h + 0.9 * Math.sin((x / len) * 2 * Math.PI + ph + 1.1) + 1.2 * Math.sin(t * 0.9 + seed)]);
  }
  const P = [...top, ...bot.reverse()];
  return `<path d="M${P.map((p) => `${f1(p[0])} ${f1(p[1])}`).join("L")}Z" ${fill("sky")}/>`;
}
function world(t) {
  const sky = `<rect x="-300" y="-300" width="900" height="${300 + HORIZON}" ${fill("sky-lit")}/>`;
  const sea = `<rect x="-300" y="${HORIZON}" width="900" height="600" ${fill("sky-deep")}/>`;
  const far = swell(HORIZON + 9, 2.2, 90, 0.5, t, 0.4) + swell(HORIZON + 22, 3, 110, 0.6, t, 2.1);
  const near = swell(282, 6, 70, 0.8, t, 1.3) + swell(312, 8, 80, 0.7, t, 3.7) + swell(348, 9, 90, 0.6, t, 5.2);
  const piles = PILES.map((x) => `<rect x="${x}" y="${DECK + 18}" width="9" height="120" ${fill("bark")}/>`).join("");
  const deck = `<rect x="-300" y="${DECK}" width="900" height="9" ${fill("wood")}/><rect x="-300" y="${DECK + 8}" width="900" height="12" ${fill("wood-deep")}/>`;
  // (each part laid 2 under its neighbour, so no seam of sky shows between them as the camera moves)
  const board = `<rect x="${BOARD[2] - 2}" y="${BOARD[1] + 4}" width="8" height="${BOARD[3] - BOARD[1] - 2}" ${fill("sun-deep")}/>`
    + `<rect x="${BOARD[0]}" y="${BOARD[1]}" width="${BOARD[2] - BOARD[0]}" height="${BOARD[3] - BOARD[1] + 2}" ${fill("sun")}/>`;
  // the board's shadow on the deck, the light from the upper left
  const boardShadow = `<polygon points="${BOARD[2] - 2},${DECK} ${BOARD[2] + 26},${DECK} ${BOARD[2] + 30},${DECK + 9} ${BOARD[2] - 2},${DECK + 9}" ${fill("wood-deep")}/>`;
  return sky + sea + far + piles + near + deck + boardShadow + board;
}
const T_CAM = [0.2, 2.0];
const HAPPY_DUR = 2.45 + 0.6;
function happy(t) {
  if (t <= 0) return STILL;
  const u = track([[T_CAM[0], 0], [T_CAM[1], 1, "io"]], t);
  const z = 1 - 0.45 * u, cx = 100 - 8 * u, cy = 100 + 52 * u;
  // the sway: a breath of sea air takes it a little to one side; it swings back past, and settles
  const a = track([[0.8, 0], [1.2, 3.2, "io"], [1.65, -1.4, "io"], [2.05, 0.5, "io"], [2.45, 0, "io"]], t);
  const scene = world(t) + turned(RING_SHADOW, a, SHADOW_PEG) + PEG_SHADOW + PEG_SHAFT + turned(CORD, a, PEG) + PEG_HEAD + turned(RING, a, PEG);
  return `${OPEN}<g transform="translate(100 100) scale(${n4(z)}) translate(${n2(-cx)} ${n2(-cy)})">${scene}</g></svg>`;
}

// ---- sad. The peg creeps out and tips (the ring hanging from it drops with it a little; its shadow on the wall lengthens as it stands
// further out); then it's out of its hole, and everything falls, from rest, out of the frame (g: the ring about 75 cm across)
const T_SLIP = 1.0, G = 1500;
const HOLE = `<ellipse cx="92" cy="21" rx="4" ry="4.4" ${fill("ink")}/>`;
const SAD_DUR = Math.round((T_SLIP + 0.55 + 0.7) * 100) / 100;
function sad(t) {
  if (t <= 0) return STILL;
  const creep = track([[0.2, 0], [T_SLIP, 2.6, "in"]], t), s = Math.max(0, t - T_SLIP), drop = creep + 0.5 * G * s * s;
  const out = 1 + 0.35 * track([[0.2, 0], [T_SLIP, 1, "in"]], t);
  const down = (svg) => `<g transform="translate(0 ${n2(drop)})">${svg}</g>`;
  // the peg standing further out: its shaft showing longer under its head, its shadow reaching further down the wall
  const shaft = `<g transform="translate(0 17) scale(1 ${n4(out)}) translate(0 -17)">${PEG_SHAFT}</g>`;
  const pegShadow = `<g transform="translate(${n2(3 * (out - 1))} ${n2(4 * (out - 1))})">${PEG_SHADOW}</g>`;
  return `${OPEN}${EL[0]}${HOLE}${down(RING_SHADOW + pegShadow + shaft + CORD + PEG_HEAD + RING)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
