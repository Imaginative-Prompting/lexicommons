// Lose's two stories: where the missing piece went. The camera finds it. Happy: easing back and over to the right, it finds the piece lying
// face up on the table just past the puzzle, the same blue sky, its knobs and hollows the hole's own. Sad: following down past the table's
// front edge to the floor, it finds the piece's blue between the slats of a floor register, down in the duct below the grate, out of reach.
// Every frame is a pure function of t, in seconds. The still's own world, carried on past its edges: the wall above y 30, the table from
// there down to its front edge at 212, the floor below it; the puzzle on the table, its hole (the piece's own outline) at (62, 74).
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect y=\"30\" width=\"200\" height=\"170\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M160.1,47.9L165.1,52.9A3,3 0 0 1 166,55V177A3,3 0 0 1 163,180H41A3,3 0 0 1 38.9,179.1L33.9,174.1Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M157.6,43.5L160.6,48.5A3,3 0 0 1 161,50V172A3,3 0 0 1 158,175H36A3,3 0 0 1 33.4,173.5L30.4,168.5L150,150Z\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><path d=\"M30.4,168.5L33.4,173.5A3,3 0 0 0 36,175H158A3,3 0 0 0 160.1,174.1L157.1,169.1Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M62,74h11c2,0 3.3,-3.2 2.4,-4a4,4 0 1 1 5.2,0c-0.9,0.8 0.5,4 2.4,4h11v11c0,2 -3.2,3.3 -4,2.4a4,4 0 1 0 0,5.2c0.8,-0.9 4,0.5 4,2.4v11h-11c-2,0 -3.3,3.2 -2.4,4a4,4 0 1 1 -5.2,0c0.9,-0.8 -0.5,-4 -2.4,-4h-11v-11c0,-2 3.2,-3.3 4,-2.4a4,4 0 1 0 0,-5.2c-0.8,0.9 -4,-0.5 -4,-2.4z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M65,79h11c2,0 3.3,-3.2 2.4,-4a4,4 0 1 1 5.2,0c-0.9,0.8 0.5,4 2.4,4h11v11c0,2 -3.2,3.3 -4,2.4a4,4 0 1 0 0,5.2c0.8,-0.9 4,0.5 4,2.4v11h-11c-2,0 -3.3,3.2 -2.4,4a4,4 0 1 1 -5.2,0c0.9,-0.8 -0.5,-4 -2.4,-4h-11v-11c0,-2 3.2,-3.3 4,-2.4a4,4 0 1 0 0,-5.2c-0.8,0.9 -4,-0.5 -4,-2.4z\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path fill-rule=\"evenodd\" d=\"M33,42H155A3,3 0 0 1 158,45V167A3,3 0 0 1 155,170H33A3,3 0 0 1 30,167V45A3,3 0 0 1 33,42ZM62,74h11c2,0 3.3,-3.2 2.4,-4a4,4 0 1 1 5.2,0c-0.9,0.8 0.5,4 2.4,4h11v11c0,2 -3.2,3.3 -4,2.4a4,4 0 1 0 0,5.2c0.8,-0.9 4,0.5 4,2.4v11h-11c-2,0 -3.3,3.2 -2.4,4a4,4 0 1 1 -5.2,0c0.9,-0.8 -0.5,-4 -2.4,-4h-11v-11c0,-2 3.2,-3.3 4,-2.4a4,4 0 1 0 0,-5.2c-0.8,0.9 -4,-0.5 -4,-2.4z\" fill=\"var(--art-sky,#58ADEB)\"/><circle cx=\"41\" cy=\"55\" r=\"7\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M30,116C56,110 84,130 110,126C130,123 144,113 158,111V167A3,3 0 0 1 155,170H33A3,3 0 0 1 30,167Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M30,144C54,136 80,140 104,150C124,158 142,152 158,146V167A3,3 0 0 1 155,170H33A3,3 0 0 1 30,167Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M126,73h10.4c1.6,0 3.1,-1.6 2.4,-2.2a5,5 0 1 1 6.4,0c-0.7,0.6 0.8,2.2 2.4,2.2h10.4v2h-11.6c-2.2,0 -3.6,-4.9 -2.5,-5.8a3,3 0 1 0 -3.8,0c1.1,0.9 -0.3,5.8 -2.5,5.8h-11.6zM30,105h10.4c1.6,0 3.1,-1.6 2.4,-2.2a5,5 0 1 1 6.4,0c-0.7,0.6 0.8,2.2 2.4,2.2h10.4v2h-11.6c-2.2,0 -3.6,-4.9 -2.5,-5.8a3,3 0 1 0 -3.8,0c1.1,0.9 -0.3,5.8 -2.5,5.8h-11.6zM94,105h10.4c1.6,0 3.1,-1.6 2.4,-2.2a5,5 0 1 1 6.4,0c-0.7,0.6 0.8,2.2 2.4,2.2h10.4v2h-11.6c-2.2,0 -3.6,-4.9 -2.5,-5.8a3,3 0 1 0 -3.8,0c1.1,0.9 -0.3,5.8 -2.5,5.8h-11.6zM62,137h10.4c1.6,0 3.1,-1.6 2.4,-2.2a5,5 0 1 1 6.4,0c-0.7,0.6 0.8,2.2 2.4,2.2h10.4v2h-11.6c-2.2,0 -3.6,-4.9 -2.5,-5.8a3,3 0 1 0 -3.8,0c1.1,0.9 -0.3,5.8 -2.5,5.8h-11.6zM126,137h10.4c1.6,0 3.1,-1.6 2.4,-2.2a5,5 0 1 1 6.4,0c-0.7,0.6 0.8,2.2 2.4,2.2h10.4v2h-11.6c-2.2,0 -3.6,-4.9 -2.5,-5.8a3,3 0 1 0 -3.8,0c1.1,0.9 -0.3,5.8 -2.5,5.8h-11.6z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M30,75h10.4c1.6,0 3.1,1.6 2.4,2.2a5,5 0 1 0 6.4,0c-0.7,-0.6 0.8,-2.2 2.4,-2.2h10.4v-2h-11.6c-2.2,0 -3.6,4.9 -2.5,5.8a3,3 0 1 1 -3.8,0c1.1,-0.9 -0.3,-5.8 -2.5,-5.8h-11.6zM94,75h10.4c1.6,0 3.1,1.6 2.4,2.2a5,5 0 1 0 6.4,0c-0.7,-0.6 0.8,-2.2 2.4,-2.2h10.4v-2h-11.6c-2.2,0 -3.6,4.9 -2.5,5.8a3,3 0 1 1 -3.8,0c1.1,-0.9 -0.3,-5.8 -2.5,-5.8h-11.6zM126,107h10.4c1.6,0 3.1,1.6 2.4,2.2a5,5 0 1 0 6.4,0c-0.7,-0.6 0.8,-2.2 2.4,-2.2h10.4v-2h-11.6c-2.2,0 -3.6,4.9 -2.5,5.8a3,3 0 1 1 -3.8,0c1.1,-0.9 -0.3,-5.8 -2.5,-5.8h-11.6zM30,139h10.4c1.6,0 3.1,1.6 2.4,2.2a5,5 0 1 0 6.4,0c-0.7,-0.6 0.8,-2.2 2.4,-2.2h10.4v-2h-11.6c-2.2,0 -3.6,4.9 -2.5,5.8a3,3 0 1 1 -3.8,0c1.1,-0.9 -0.3,-5.8 -2.5,-5.8h-11.6zM94,139h10.4c1.6,0 3.1,1.6 2.4,2.2a5,5 0 1 0 6.4,0c-0.7,-0.6 0.8,-2.2 2.4,-2.2h10.4v-2h-11.6c-2.2,0 -3.6,4.9 -2.5,5.8a3,3 0 1 1 -3.8,0c1.1,-0.9 -0.3,-5.8 -2.5,-5.8h-11.6z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M61,42v10.4c0,1.6 -1.6,3.1 -2.2,2.4a5,5 0 1 0 0,6.4c0.6,-0.7 2.2,0.8 2.2,2.4v10.4h2v-11.6c0,-2.2 -4.9,-3.6 -5.8,-2.5a3,3 0 1 1 0,-3.8c0.9,1.1 5.8,-0.3 5.8,-2.5v-11.6zM61,106v10.4c0,1.6 -1.6,3.1 -2.2,2.4a5,5 0 1 0 0,6.4c0.6,-0.7 2.2,0.8 2.2,2.4v10.4h2v-11.6c0,-2.2 -4.9,-3.6 -5.8,-2.5a3,3 0 1 1 0,-3.8c0.9,1.1 5.8,-0.3 5.8,-2.5v-11.6zM93,138v10.4c0,1.6 -1.6,3.1 -2.2,2.4a5,5 0 1 0 0,6.4c0.6,-0.7 2.2,0.8 2.2,2.4v10.4h2v-11.6c0,-2.2 -4.9,-3.6 -5.8,-2.5a3,3 0 1 1 0,-3.8c0.9,1.1 5.8,-0.3 5.8,-2.5v-11.6zM125,42v10.4c0,1.6 -1.6,3.1 -2.2,2.4a5,5 0 1 0 0,6.4c0.6,-0.7 2.2,0.8 2.2,2.4v10.4h2v-11.6c0,-2.2 -4.9,-3.6 -5.8,-2.5a3,3 0 1 1 0,-3.8c0.9,1.1 5.8,-0.3 5.8,-2.5v-11.6zM125,106v10.4c0,1.6 -1.6,3.1 -2.2,2.4a5,5 0 1 0 0,6.4c0.6,-0.7 2.2,0.8 2.2,2.4v10.4h2v-11.6c0,-2.2 -4.9,-3.6 -5.8,-2.5a3,3 0 1 1 0,-3.8c0.9,1.1 5.8,-0.3 5.8,-2.5v-11.6z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M63,138v10.4c0,1.6 1.6,3.1 2.2,2.4a5,5 0 1 1 0,6.4c-0.6,-0.7 -2.2,0.8 -2.2,2.4v10.4h-2v-11.6c0,-2.2 4.9,-3.6 5.8,-2.5a3,3 0 1 0 0,-3.8c-0.9,1.1 -5.8,-0.3 -5.8,-2.5v-11.6zM95,42v10.4c0,1.6 1.6,3.1 2.2,2.4a5,5 0 1 1 0,6.4c-0.6,-0.7 -2.2,0.8 -2.2,2.4v10.4h-2v-11.6c0,-2.2 4.9,-3.6 5.8,-2.5a3,3 0 1 0 0,-3.8c-0.9,1.1 -5.8,-0.3 -5.8,-2.5v-11.6zM95,106v10.4c0,1.6 1.6,3.1 2.2,2.4a5,5 0 1 1 0,6.4c-0.6,-0.7 -2.2,0.8 -2.2,2.4v10.4h-2v-11.6c0,-2.2 4.9,-3.6 5.8,-2.5a3,3 0 1 0 0,-3.8c-0.9,1.1 -5.8,-0.3 -5.8,-2.5v-11.6zM127,74v10.4c0,1.6 1.6,3.1 2.2,2.4a5,5 0 1 1 0,6.4c-0.6,-0.7 -2.2,0.8 -2.2,2.4v10.4h-2v-11.6c0,-2.2 4.9,-3.6 5.8,-2.5a3,3 0 1 0 0,-3.8c-0.9,1.1 -5.8,-0.3 -5.8,-2.5v-11.6zM127,138v10.4c0,1.6 1.6,3.1 2.2,2.4a5,5 0 1 1 0,6.4c-0.6,-0.7 -2.2,0.8 -2.2,2.4v10.4h-2v-11.6c0,-2.2 4.9,-3.6 5.8,-2.5a3,3 0 1 0 0,-3.8c-0.9,1.1 -5.8,-0.3 -5.8,-2.5v-11.6z\" fill=\"var(--art-paper,#FBF7EC)\"/></svg>\n";
export const STILL_HASH = "27168f5dfe";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 15 || !EL[5].includes('d="M62,74h11c2,0')) throw new Error("lose: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const rect = (x, y, w, h, tone) => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" ${fill(tone)}/>`;
const PUZZLE = EL.slice(2).join("");
// the piece: the hole's outline, drawn about its own middle
const PIECE_D = /d="([^"]+)"/.exec(EL[5])[1], PIECE_MID = [78.5, 90.5];

// the world past the still's frame: the wall, the table to its front edge (its apron below the edge), the floor (planks) and the table's
// shadow on it
const TABLE_EDGE = 212;
function world() {
  const planks = Array.from({ length: 9 }, (_, i) => rect(-400, 226 + 26 * i, 1000, 1.6, "wood-deep")).join("");
  return rect(-400, -400, 1000, 430, "sun") + rect(-400, 30, 1000, TABLE_EDGE - 30, "sun-lit") + rect(-400, TABLE_EDGE, 1000, 7, "sun-deep")
    + rect(-400, TABLE_EDGE + 7, 1000, 400, "wood") + planks + rect(-400, TABLE_EDGE + 7, 1000, 9, "wood-deep");
}
// the piece lying loose: its cardboard edge and a little shadow under it, its blue face up
const loosePiece = (x, y, a) => `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(a)}) translate(${-PIECE_MID[0]} ${-PIECE_MID[1]})">`
  + `<path d="${PIECE_D}" transform="translate(3 4)" ${fill("sun-deep")}/><path d="${PIECE_D}" transform="translate(1.4 2)" ${fill("paper-deeper")}/><path d="${PIECE_D}" ${fill("sky")}/></g>`;
// the floor register: its steel frame, the dark duct, the piece down in it, the slats over it
const REG = { x: 55, y: 268, w: 92, h: 56 };
function register() {
  const { x, y, w, h } = REG, ix = x + 5, iy = y + 5, iw = w - 10, ih = h - 10;
  const slats = Array.from({ length: 8 }, (_, i) => rect(ix, iy + 1.2 + i * 5.7, iw, 3, "steel")).join("");
  return rect(x - 1.5, y + 2, w + 3, h, "wood-deep") + rect(x, y, w, h, "steel-deep") + rect(ix, iy, iw, ih, "ink")
    + `<clipPath id="du"><rect x="${ix}" y="${iy}" width="${iw}" height="${ih}"/></clipPath><g clip-path="url(#du)">`
    + `<g transform="translate(${n2(ix + iw * 0.56)} ${n2(iy + ih * 0.52)}) scale(0.8) rotate(-22) translate(${-PIECE_MID[0]} ${-PIECE_MID[1]})"><path d="${PIECE_D}" ${fill("sky-deep")}/></g></g>`
    + slats;
}
// the camera: moved and zoomed, the world in the still's own units
const cam = (cx, cy, z) => `translate(100 100) scale(${n4(z)}) translate(${n2(-cx)} ${n2(-cy)})`;

// ---- happy: back and over, to the piece on the table
const HAPPY_DUR = 2.7, PIECE_AT = [234, 142];
function happy(t) {
  if (t <= 0) return STILL;
  const u = track([[0.2, 0], [2.2, 1, "io"]], t), z = 1 + (0.8 - 1) * u;
  return `${OPEN}<g transform="${cam(100 + 38 * u, 100 + 12 * u, z)}">${world()}${PUZZLE}${loosePiece(PIECE_AT[0], PIECE_AT[1], 14)}</g></svg>`;
}

// ---- sad: down past the table's edge, to the register in the floor
const SAD_DUR = 2.7;
function sad(t) {
  if (t <= 0) return STILL;
  const u = track([[0.2, 0], [2.2, 1, "io"]], t);
  return `${OPEN}<g transform="${cam(100, 100 + 196 * u, 1)}">${world()}${PUZZLE}${register()}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
