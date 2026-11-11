// Win's two stories. Sad, the plaque's own: its glue lets go; it leans out from the top, then tips over forward off the base and lands
// face down on the floor in front, its plain back up, and on the base where it was two patches of old glue. Happy, the camera's, tilting
// down and back: the floor the cup stands on is the top of a winners' podium, the highest block, a gold 1 on its face, the silver 2 and
// the bronze 3 lower either side.
// Every frame is a pure function of t, in seconds. The still's own world: the wall above y 145, the floor (the podium's top) below; the
// trophy's long shadow runs off down and to the right (the light is low, behind and to the left: the faces toward us are in shade).
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M70.6 145c-1.1 1.1-2.2 2.4-3.5 3.4-1.2 1.1-2.9 1.5-3.8 3-1 1.9-.6 4.7-.6 6.8 0 5.1 0 10.1 0 15.1 .3 .1 .5 .2 .7 .3l55.4 26.5c1.7 .8 3.3 3 4.5 4.3l-127.7 0 0-58.9 70.8-.1c.7 0 1.3-.3 1.9-.4 .8-.1 1.6 0 2.3 0ZM204.4 145.5l0 53.8-64.9-26.6c-1.5-.6-3-2.6-4.1-3.7 0-3.3 .7-15.7-.7-17.8-.8-1.4-2.4-1.8-3.6-2.8-1.3-1.1-2.4-2.4-3.6-3.6 1.3 .1 3 .6 4.3 .6l47.5 .1 25.1 0Z\" fill=\"var(--art-violet-lit,#A68CFF)\" fill-rule=\"evenodd\"/>\n<path d=\"M138.9 166l0 3.2 65.5 26.6 0 8.6-85.2 0c-.3-.6 0-.6-.4-.8l-55.2-26.4 2.6-2.5c12.9 2.4 25.8 3.2 38.9 2.8 10.3-.3 20.6-.8 30.1-4.7 .1-.9 0-2.4 .3-3.3 .5-1.2 2.5-2.6 3.4-3.5Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M150.9 42.1c-5.7 5.5-13.7 7.4-21.3 8.9-3.5 18.7-10 38.1-22.2 53.1-2.8 3.5-6.2 6.7-9.5 9.7 1.1 1.2 2.4 2.3 3.3 3.7 3.8 5.8 2.4 13.3 5 19.6 2.8 6.6 8 8.7 11.3 14.5-1.1 1.1-2.3 2.8-3.8 3.5-2.6 1.4-9.7 1-12.8 1-7.8 .2-23.5-.1-30.2-4-2.2-1.3-3.9-3.4-5.6-5.2 1.2-.4 2.5-.8 3.6-1.4 1.6-.9 2.9-2.1 4.6-2.8 2-.9 4.1-1.6 6-2.5 6.3-2.9 10-8.4 10.4-15.4 .2-3.4-.6-7.1-2.6-9.9-2.2-3.1-6.1-4.1-9.2-6.1-4.2-2.7-7.7-6.2-11.1-9.7l-3 .3c-2.6-3-4.9-6.2-7.1-9.5l3.3 0c-3.3-6.3-6.6-12.4-8.8-19.1-.9-2.6-1.6-5.2-2.3-7.9-.4-1.6-.5-3.5-1.2-5-.8-1.9-2.8-2.8-3.7-4.5-.8-1.3-1.6-8.3-1.1-9.7 .2-.7 .4-.8 .8-1.4 .7 .2 1.4 .5 2.1 .8 .5-3.5-.9-7.6 1.3-10.8 3.8-5.2 14.1-7.3 20.1-8.4 18.5-3.4 38.1-3.6 56.8-1 6.8 .9 24.9 3.7 27.6 10.8 .7 1.8 0 3.1-.4 4.8-.2 1.1-.2 2.4-.3 3.6ZM141.4 35.4c0 3.2-19 5.9-42.4 5.9-23.3 0-42.3-2.7-42.3-5.9 0-3.3 19-5.9 42.3-5.9 23.4 0 42.4 2.6 42.4 5.9ZM73.2 156c2.1-.4 10.7 .8 13.6 .9 7.9 .4 15.9 .4 23.8 0 3-.1 13.3-1.5 15.3-.7 1.5 .7 4.9 4.1 5.4 5.6 .7 1.8 .6 7.1 .2 8.9-.4 1.5-1.4 2.4-2.4 3.4-3.7 3.8-4.8 3.6-9.9 4-11.5 1-23.1 1.2-34.6 .4-3.3-.2-10.3-.1-12.9-1.9-.9-.6-1.6-1.4-2.3-2.2-3-3-2.9-4.8-2.8-8.8 0-1.5-.1-3 .6-4.4 .5-1 1.6-1.9 2.4-2.7 1.1-1.1 2.1-2.2 3.6-2.5Z\" fill=\"var(--art-sun,#F7BE45)\" fill-rule=\"evenodd\"/>\n<path d=\"M145 35.4c0 5.2-20.5 9.4-45.9 9.4-25.4 0-46-4.2-46-9.4 0-5.2 20.6-9.4 46-9.4 25.4 0 45.9 4.2 45.9 9.4ZM152 36.7l-.2 6.5c2.5-1.4 5-2.6 7.8-3.3 12.9-3.1 24.3 4.7 25.1 18.1 .2 3.2-.5 6.5-1.4 9.6-5.1 16.1-21 27.9-37.2 31.4-5.4 1.1-10.6 1-16 1-2.7 2.7-5.3 5.3-8.3 7.6-3.8 2.9-8.5 4.9-11.1 9-4.5 7.1-1.5 17 5.1 21.6 3 2.1 6.6 3.2 9.8 4.8 1.4 .7 2.5 1.6 3.8 2.4 1.1 .7 2.6 1.1 3.8 1.6-1.5 1.5-3 3.4-4.8 4.6-3.8 2.7-9.2 3-13.7 3.8l-2.1-2.3c.7-.3 1.2-.5 1.7-.9-3.1-5.8-8.4-8.2-11.3-14.5-4.1-9.1 .1-18.2-10.1-24.3 19.8-10.9 30.2-44.4 33.7-65.4 8.9-1.5 20.1-3.2 25.4-11.3ZM46.2 42.5c0 5.6 .9 11.2 1.9 16.6-2-2.4-3.9-4.8-6.6-6.4-6.2-3.7-14.2-1.8-15.3 6-.5 4 .8 8.2 2.7 11.7 6.1 11 18.2 18.4 30.7 18.7 2.5 3.8 5.2 7.3 8 10.9-5.4 .1-10.8 .1-16.2-1.1-15.9-3.5-31.4-15.8-36.1-31.8-4.6-15.7 5.4-30.8 22.7-27.7 2.9 .6 5.5 1.8 8.2 3.1ZM138 89.1c12.8-.6 25.3-7.2 31.8-18.6 2.8-5.1 5-12.9-.1-17.5-5.1-4.6-12.7-1.3-16.7 3.1-4.8 5.1-4.8 9.5-7 15.7-2.1 6.1-4.9 11.7-8 17.3Z\" fill=\"var(--art-sun-deep,#DB9A22)\" fill-rule=\"evenodd\"/>\n<path d=\"M69.8 144.3c-.5 .9-.9 1.7-1.4 2.5 4.4 3.8 10.6 4.6 16.1 5.2 12.2 1.3 35 2 45.3-4.8l-1.2-2.8c3.8 1.3 6.8 2.8 9.5 5.8-.3 1.6 0 2.9 0 4.5-2.8 2.5-7 4.3-10.9 4.3-.8 0-1.6-.3-2.4-.4-1.2-.1-2.4 .1-3.7 .2-14.2 1.4-28.6 1.4-42.9 .1-1.5-.1-3.1-.4-4.6-.3-.9 0-1.8 .4-2.7 .4-3.8 0-8.1-1.8-10.9-4.3l.6-5c1.9-2.6 5.8-4.1 9.2-5.4Z\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n<path d=\"M59.8 150.7c.7 .8 1.4 1.7 2.3 2.3 4 2.5 10.8 3 15.4 3.5 14.4 1.7 29.3 1.6 43.7-.1 4.4-.5 10.9-.9 14.7-3.3 1-.6 1.7-1.5 2.5-2.4 1 5.4 .5 11 .5 16.4 0 2.5 .4 5.1-1.3 7.1-3.3 3.9-11.1 4.9-15.9 5.6-13.7 1.9-30.2 1.9-43.9 .3-4.5-.6-14.4-1.5-17.4-5-1.6-1.9-1.1-4.7-1.1-6.9 0-5.7-.7-11.9 .5-17.5ZM73.3 159.4c-1.2 .2-2.1 .9-2.7 1.9-1 1.9-.9 8.4 0 10.3 .4 .9 1.1 1.6 2 2 2.6 1.3 8.9 1.3 11.9 1.5 10.2 .6 20.5 .6 30.6-.1 3.8-.3 11.8 .2 12.9-4.3 .4-1.9 .5-7.2-.2-8.9-.3-.9-.9-1.6-1.7-2-1.8-.9-12.2 .4-14.9 .6-8.1 .4-16.3 .4-24.4 0-2.8-.2-5.7-.4-8.6-.6-1.6-.2-3.4-.6-4.9-.4Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "7cb314dea7";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 7 || !EL[6].includes("M73.3 159.4")) throw new Error("win: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const rect = (x, y, w, h, tone) => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" ${fill(tone)}/>`;
// the trophy's parts: its gold (cup, handles, the plaque's plate), shading, the base's rim and its dark front (a window for the plaque)
const subs = (svg) => /d="([^"]+)"/.exec(svg)[1].split(/(?=M)/);
const GOLD = subs(EL[3]), FRONT = subs(EL[6]);
const withD = (svg, d) => svg.replace(/d="[^"]+"/, `d="${d}"`);

// ---- sad: the plaque
const SAD_DUR = 2.4;
// the plaque as seen through the base's window (its face), its foot on the line y 174.5; the base's front whole behind it, with the glue
const PLAQUE_D = FRONT[1], FOOT = 174.5;
const PLAQUE_PTS = (() => {
  const nums = PLAQUE_D.match(/-?\d*\.?\d+/g).map(Number), P = [[nums[0], nums[1]]];
  // (the window's outline: an absolute start, then relative cubic runs; walked at their ends and middles)
  let [x, y] = P[0], i = 2;
  while (i + 5 < nums.length) { const [a, b, c, d, e, f] = nums.slice(i, i + 6); i += 6; P.push([x + 0.125 * 0 + 0.375 * a + 0.375 * c + 0.125 * e, y + 0.375 * b + 0.375 * d + 0.125 * f]); x += e; y += f; P.push([x, y]); }
  return P;
})();
const BASE_WHOLE = withD(EL[6], FRONT[0]).replace(' fill-rule="evenodd"', "");
const GLUE = `<path d="M79 163.5C81.5 162.4 85.8 162.9 87.2 164.6C88.4 166.2 87.6 169.3 85.2 170.2C82.6 171.1 78.8 170.4 77.9 168.2C77.2 166.6 77.6 164.2 79 163.5ZM113.4 162.8C116.2 162.2 120 163.4 120.6 165.6C121.2 167.6 119.8 170 117 170.4C114.2 170.8 111.4 169.6 110.9 167.4C110.4 165.4 111.4 163.2 113.4 162.8Z" ${fill("paper-deeper")}/>`;
function plaque(phi, drop) {
  // turned forward about its foot by phi (the floor seen a little from above: what comes toward us shows a little lower), its foot dropped
  const c = Math.cos(phi), s = Math.sin(phi), foot = FOOT + drop;
  const P = PLAQUE_PTS.map(([x, y]) => { const h = FOOT - y; return [x, foot - h * c + 0.15 * h * s]; });
  // (past lying flat less the view's own tilt, its plain back is what shows)
  const back = phi > (81 * Math.PI) / 180;
  return `<polygon points="${P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ")}" ${fill(back ? "sun-deep" : "sun")}/>`;
}
function sad(t) {
  if (t <= 0) return STILL;
  // the top leans out, slowly, as the glue lets go; then it goes, tipping over under its weight, the foot slipping off the base's edge to
  // the floor; it lands flat, a small rebound, and lies still
  const phi = (Math.PI / 180) * track([[0.3, 0], [1.05, 9, "in"], [1.42, 90, "in"], [1.5, 84, "out"], [1.58, 90, "in"]], t);
  const drop = track([[1.05, 0], [1.42, 10, "in"]], t);
  const gold = withD(EL[3], GOLD.slice(0, 2).join(""));
  return `${OPEN}${EL[0]}${EL[1]}${EL[2]}${gold}${EL[4]}${EL[5]}${BASE_WHOLE}${GLUE}${plaque(phi, drop)}</svg>`;
}

// ---- happy: down and back, to the podium
// its blocks (each a top lit by the low light, a face toward us in shade, the wall behind): the highest under the cup, long enough that
// the trophy's long shadow lies wholly on it (on to its edge: the face beyond is in shade already), the 2 lower to the left (wholly past
// the still's frame), the 3 lowest to the right; the blocks' shadows fall toward us
const FLOOR = 145.5, FACE = 242, GROUND = 320, LEFT = -12, RIGHT = 340;
const numeral = {
  1: "M-5 -18L4 -24H9V16H15V24H-11V16H-1V-12L-7 -9Z",
  2: "M-12 -11C-12 -20 -5 -24 1 -24C9 -24 13 -18 13 -12C13 -5 8 -1 2 5L-3 15H13V24H-13V16L-4 6C2 0 5 -4 5 -10C5 -14 3 -16 0 -16C-3 -16 -5 -13 -5 -10Z",
  3: "M-12 -13C-10 -20 -4 -24 1 -24C9 -24 13 -19 13 -13C13 -8 10 -4 6 -2C11 0 14 4 14 10C14 18 8 24 0 24C-7 24 -12 19 -13 12L-5 11C-4 15 -2 17 0 17C4 17 6 14 6 10C6 6 3 3 -2 3V-4C3 -4 5 -7 5 -11C5 -14 3 -16 0 -16C-2 -16 -4 -14 -5 -12Z",
};
const num = (n, x, y, s, tone) => `<path transform="translate(${x} ${y}) scale(${s})" d="${numeral[n]}" ${fill(tone)}/>`;
const PODIUM = [
  // the floor of the room, the blocks' shadow cast toward us on it
  rect(-400, GROUND, 1000, 400, "violet-lit"), rect(-112, GROUND, 428, 26, "violet-deep"),
  // the 2: its top (lower), its face
  rect(-112, 185, 100, FACE + 20 - 185, "violet-lit"), rect(-112, FACE + 20, 100, GROUND - FACE - 20, "ink-lit"),
  // the 3: its top (lowest), the highest block's shadow across it, its face
  rect(RIGHT, 205, 100, FACE + 40 - 205, "violet-lit"), `<polygon points="${RIGHT},205 ${RIGHT + 46},205 ${RIGHT + 30},${FACE + 40} ${RIGHT},${FACE + 40}" ${fill("violet-deep")}/>`,
  rect(RIGHT, FACE + 40, 100, GROUND - FACE - 40, "ink-lit"),
  // the highest: its top (the still's floor, carried on), its face, the edge between catching the light
  rect(LEFT, FLOOR, RIGHT - LEFT, FACE - FLOOR, "violet-lit"), rect(LEFT, FACE, RIGHT - LEFT, GROUND - FACE, "ink-lit"), rect(LEFT, FACE, RIGHT - LEFT, 1.6, "violet"),
  num(1, 102, 281, 1.25, "sun"), num(2, -62, 291, 0.9, "steel"), num(3, 390, 300, 0.8, "wood-deep"),
].join("");
// the trophy's shadow carried on past the frame along its own edges, to the block's edge (inside the still's frame, the still itself is
// drawn over all this, so the start is the still exactly)
const SHADOW_END = `<path d="M138.9 169.2L${n2(138.9 + (FACE - 169.2) / 0.406)} ${FACE}L${n2(119.2 + (FACE - 204.4) / 0.478)} ${FACE}L119.2 204.4Z" ${fill("violet-deep")}/>`;
const cam = (cx, cy, z) => `translate(100 100) scale(${n4(z)}) translate(${n2(-cx)} ${n2(-cy)})`;
const HAPPY_DUR = 2.7;
function happy(t) {
  if (t <= 0) return STILL;
  const u = track([[0.2, 0], [2.2, 1, "io"]], t), z = 1 + (0.5 - 1) * u;
  return `${OPEN}<g transform="${cam(100 + 2 * u, 100 + 90 * u, z)}">${rect(-400, -400, 1000, 700, "violet")}${PODIUM}${SHADOW_END}${EL.join("")}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
