// The door's two stories. Happy: knock, knock, knock; it swings open, out onto a bright day, and on the step there's a present, which can't keep still. Sad:
// it's locked; the door rattles in its frame as the knob is tried, twice; a shove, and the whole door comes off its hinges, tips back slowly, then faster,
// and slams flat on the floor of the dark room behind it, bouncing once. The doorway stays empty and dark.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, n4, paint, parsePath, partsOf, runsToDc, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M53 169.5l3.4 3.5c0 .5 .1 1.1 .2 1.7l42.7 26.2c1.3 .7 2.5 2.5 3.5 3.5l-107.2 0 0-31.7 57.4 0 0-3.2ZM147 169.5l0 3.2 57.4 0 0 31.7c-2.1 0-4.6 .3-6.7-.1-1.7-.4-3.3-1.5-4.8-2.2-3.1-1.6-6.2-3.2-9.4-4.7-7.9-3.8-15.8-7.8-23.7-11.8-3.3-1.7-9.3-4.3-12.2-6.3-1.5-1.1-2.8-2.6-4.1-3.9 .1-.9 .2-1.8 .3-2.7l3.2-3.2Z\" fill=\"var(--art-violet-lit,#A68CFF)\" fill-rule=\"evenodd\"/>\n<path d=\"M147.2 172.4l-.3 3.2 57.8 28.8-105.2 0c-5-3.9-10.9-6.9-16.3-10.1-10.1-6.1-20.2-12.1-30.2-18.2l0-3.7 94.2 0Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M139.3 23.5l3.9 3.9c0 35.8 0 71.5 0 107.3 0 8.3 0 16.7 0 25 0 3.2 .2 4.3-2.2 6.6-.8 .8-1.5 1.5-2.6 1.7-3.5 .6-8.2 .2-9.8-3.6-.7-1.6-.2-6.3-.2-8.3 .1-4.9-.1-9.8-.1-14.6 0-23.4 .1-46.9 .2-70.3 0-7.2-.3-14.5-.2-21.8l.3-22.4c.1-.4 .8-1 1.1-1.3 2.9-3.1 5.7-2.2 9.6-2.2ZM72.2 33.9l45.9 0c3.2 0 5.9 2.7 5.9 6l0 43.7c0 3.3-2.7 6-5.9 6l-45.9 0c-3.3 0-6-2.7-6-6l0-43.7c0-3.3 2.7-6 6-6ZM72.2 99.5l45.9 0c3.2 0 5.9 2.7 5.9 6l0 43.5c0 3.3-2.7 6-5.9 6l-45.9 0c-3.3 0-6-2.7-6-6l0-43.5c0-3.3 2.7-6 6-6Z\" fill=\"var(--art-paper-deep,#DAD1BC)\" fill-rule=\"evenodd\"/>\n<path d=\"M131 23.5l2.4 2.6c-.7 .1-1.2 .1-1.9 .4 .6 3.7 .3 7.5 .3 11.2 0 6.8-.1 13.6 0 20.4 .1 20.6 .2 41.2 0 61.8l-.2 44.3c0 .3-.1 .6-.1 .9 .7 .3 1.2 .3 1.9 .4l-2.4 2.5c-17.2 0-34.5 0-51.7 0-4.1 0-8.2 0-12.3 0-1.7 0-3.7 .3-5.4 0-.6-.2-1-.4-1.5-.8-4.1-3-3.1-5.9-3.1-10.4 0-6.9 0-13.8 0-20.8 0-27.7 0-55.5 0-83.2 0-6 0-12 0-18 0-2.2-.5-4.9 .1-7 .4-1.3 1.9-2.7 3-3.5 .5-.3 .9-.6 1.5-.7 1.7-.4 3.7-.1 5.4-.1 4.1 0 8.2 0 12.3 0 17.2 0 34.5 0 51.7 0ZM70.4 37.4l49.4 0c.4 0 .7 .3 .7 .7l0 47.3c0 .4-.3 .7-.7 .7l-49.4 0c-.4 0-.7-.3-.7-.7l0-47.3c0-.4 .3-.7 .7-.7ZM126.8 94.1c.1 1-.6 2-1.6 2.1-1 .2-2-.5-2.1-1.5-.2-1 .5-1.9 1.6-2.1 1-.1 1.9 .6 2.1 1.5ZM70.4 103l49.4 0c.4 0 .7 .3 .7 .7l0 47.1c0 .4-.3 .7-.7 .7l-49.4 0c-.4 0-.7-.3-.7-.7l0-47.1c0-.4 .3-.7 .7-.7Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M130.2 93.9c.2 2.9-1.9 5.5-4.8 5.8-2.9 .2-5.5-1.9-5.7-4.8-.3-2.9 1.8-5.5 4.7-5.8 3-.2 5.5 1.9 5.8 4.8Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M147 20l-.1 155.8-93.9 0 0-155.8 94 0ZM60.4 27l0 137.6 79.3 0 0-137.6-79.3 0Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "88fccaabc9";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [TABLE, SHADOW, EDGE, FACE, KNOB, FRAME] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const fill = (t) => `fill="${paint(t)}"`;
const leaf = `${EDGE.svg}${FACE.svg}${KNOB.svg}`;
// The knob is round and stands out from the door's face on its stem (STEM, toward you while the door is shut), so when the door turns, the knob stays
// round and moves off the face's line; and the face has no hole where it sat.
const STEM = 4, KNOB_AT = [124.95, 94.6];
const FACE_WHOLE = FACE.svg.replace(/ d="[^"]*"/, ` d="${FACE.d.replace(/M126\.8 94\.1[^Z]*Z/, "")}"`);
if (FACE_WHOLE === FACE.svg) throw new Error("door: the face's hole at the knob wasn't found");
// The opening in the frame, and the hinge down its left side.
const HOLE = { x: 60.4, y: 27, w: 79.3, h: 137.6 };
// What shows through the opening reaches 1.5 under the frame all round, so the frame's inner edge never lies on another edge (two edges on one line let
// a hairline of wall through: the ring round the falling door, the sliver beside the open one).
const IN = { x: HOLE.x - 1.5, y: HOLE.y - 1.5, w: HOLE.w + 3, h: HOLE.h + 3 };
const hole = `<clipPath id="ho"><rect x="${IN.x}" y="${IN.y}" width="${IN.w}" height="${IN.h}"/></clipPath>`;

// ---- happy.
const KNOCKS = [0.12, 0.29, 0.46];
// Outside: a bright day, grass, and the present on the step. Lit from the left: its top lightest, the front, the right side darkest. A red ribbon and bow.
// Something inside it is alive: a bump tips it up on its left corner and it drops back; then a jump inside lifts it off the step and it lands. A box is
// stiff, so it tips and lifts whole, never squashes.
function outside(tilt, hop) {
  const b = `translate(0 ${n2(-hop)}) rotate(${n2(-tilt)} 84 162)`;
  const box = `<g transform="${b}"><polygon points="84,141 116,141 121,136 89,136" ${fill("wood")}/><rect x="84" y="141" width="32" height="21" ${fill("wood-deep")}/>`
    + `<polygon points="116,141 121,136 121,157 116,162" ${fill("bark")}/><rect x="98" y="141" width="4.4" height="21" ${fill("clay")}/><polygon points="100,141 104.4,141 109.4,136 105,136" ${fill("clay")}/>`
    + `<ellipse cx="97" cy="132.5" rx="6.5" ry="4" transform="rotate(-20 97 132.5)" ${fill("clay")}/><ellipse cx="110" cy="132.5" rx="6.5" ry="4" transform="rotate(20 110 132.5)" ${fill("clay")}/><circle cx="103.5" cy="135.5" r="2.6" ${fill("clay-deep")}/></g>`;
  return `<g clip-path="url(#ho)"><rect x="${IN.x}" y="${IN.y}" width="${IN.w}" height="101.5" ${fill("sky-lit")}/><circle cx="122" cy="58" r="9" ${fill("paper")}/><circle cx="131" cy="61" r="6.5" ${fill("paper")}/>`
    + `<rect x="${IN.x}" y="126" width="${IN.w}" height="41.5" ${fill("teal")}/><polygon points="88,126 112,126 126,165 74,165" ${fill("ground")}/>${box}</g>`;
}
const HAPPY_DUR = 2.3;
function happy(t) {
  if (t <= 0) return STILL;
  // Each knock, from outside, pushes the door toward you in its frame by the latch's play, and it springs back. (Nothing drawn for the sound: marks for a
  // sound are a stock effect.)
  let knock = 0;
  for (const at of KNOCKS) knock += t > at && t < at + 0.12 ? Math.sin(((t - at) / 0.12) * Math.PI) : 0;
  // It swings open on its left hinge, out, away from you (behind the frame's jamb), and settles.
  const ang = track([[0.72, 0], [1.16, 76, "out"], [1.28, 70, "io"], [1.38, 72, "io"]], t);
  const k = Math.cos((ang * Math.PI) / 180);
  // The bump: up on its corner, and down under its own weight, rocking once as it lands. The jump: up and down again, falling as it lands.
  const tilt = track([[1.4, 0], [1.5, 8, "out"], [1.6, 0, "in"], [1.65, 1.2, "out"], [1.7, 0, "in"]], t);
  const hop = track([[1.8, 0], [1.89, 4, "out"], [1.98, 0, "in"]], t);
  // Open, the door is seen turned (narrowed); its knob, round, stands off the face toward the opening by its stem.
  const knobX = HOLE.x + (KNOB_AT[0] - HOLE.x) * k + STEM * Math.sin((ang * Math.PI) / 180) - KNOB_AT[0];
  const door = ang <= 0.01
    ? `<g transform="translate(100 96) scale(${n4(1 + 0.014 * knock)}) translate(-100 -96)">${leaf}</g>`
    : `<g transform="translate(${HOLE.x} 0) scale(${n4(k)} 1) translate(-${HOLE.x} 0)">${EDGE.svg}${FACE_WHOLE}</g><g transform="translate(${n2(knobX)} 0)">${KNOB.svg}</g>`;
  return `${OPEN}${hole}${BG}${TABLE.svg}${SHADOW.svg}${ang > 0.01 ? outside(tilt, hop) : ""}${door}${FRAME.svg}</svg>`;
}

// ---- sad.
const SAD_DUR = 2.5;
// The knob is tried twice; each time the locked door rattles in its frame, toward you and back, by the latch's play.
const TRIES = [[0.1, 0.36], [0.44, 0.7]];
// Then the shove, and it's off its hinges: it tips back about its foot, the threshold. A door is a slab falling about one edge: its angle θ goes as
// θ'' = K sin θ (K = 3g/2L; 7.4 for a real door, a little quicker here), from upright with the shove's turn W0, so it leans slowly, then faster and
// faster, and slams flat; it bounces off the floor with E of its speed and falls back, until it lies still. Worked out once, step by step, as a table.
const SHOVE = 0.76, K = 14, W0 = 0.7, E = 0.18, STEP = 1 / 1200;
const FALLEN = [0];
let HIT = 0;
for (let th = 0, w = W0, i = 1, still = false; i < 2400; i++) {
  if (still) { FALLEN.push(90); continue; }
  w += K * Math.sin(th) * STEP;
  th += w * STEP;
  if (th >= Math.PI / 2 && w > 0) {
    th = Math.PI / 2;
    if (!HIT) HIT = SHOVE + i * STEP;
    if (w * E > 0.4) w = -w * E;
    else still = true;
  }
  FALLEN.push((th * 180) / Math.PI);
}
const tipAt = (t) => {
  const i = (t - SHOVE) / STEP;
  if (i <= 0) return 0;
  const a = Math.floor(i);
  return a >= FALLEN.length - 1 ? 90 : FALLEN[a] + (FALLEN[a + 1] - FALLEN[a]) * (i - a);
};
// A point of the door as it falls back about its foot (the threshold, 164.6), by the angle it's turned through: v above the threshold, it's at height
// v cos θ and depth v sin θ into the room. On the screen it comes down by the height, rises a tenth of the depth (the floor beyond is seen from a little
// above), and closes in toward the door's middle the deeper it is, so the falling door narrows at the top, and flat it's a strip on the floor.
const FOOT = 164.6, MID_X = 100;
function falling(x, y, deg) {
  const a = (deg * Math.PI) / 180, v = FOOT - y, depth = v * Math.sin(a), h = v * Math.cos(a) + 0.1 * depth;
  return [MID_X + (x - MID_X) / (1 + 0.0035 * depth), FOOT - h];
}
// The knob, worked out like the door's points, measured from where the still has it.
const KNOB_V = FOOT - KNOB_AT[1];
function knobAt(deg) {
  const a = (deg * Math.PI) / 180, at = (height, depth) => [MID_X + (KNOB_AT[0] - MID_X) / (1 + 0.0035 * depth), FOOT - height - 0.1 * depth];
  const [x0, y0] = at(KNOB_V, -STEM), depth = KNOB_V * Math.sin(a) - STEM * Math.cos(a), [x, y] = at(KNOB_V * Math.cos(a) + STEM * Math.sin(a), depth);
  const k = (1 - 0.0035 * STEM) / (1 + 0.0035 * depth);
  return `<g transform="translate(${n2(x - x0 + KNOB_AT[0])} ${n2(y - y0 + KNOB_AT[1])}) scale(${n4(k)}) translate(${-KNOB_AT[0]} ${-KNOB_AT[1]})">${KNOB.svg}</g>`;
}
function sad(t) {
  if (t <= 0) return STILL;
  let rattle = 0;
  for (const [a, b] of TRIES) if (t > a && t < b) rattle += Math.sin(2 * Math.PI * 9 * (t - a)) * Math.sin((Math.PI * (t - a)) / (b - a)) ** 2;
  const tip = tipAt(t);
  const door = tip <= 0
    ? `<g transform="translate(100 96) scale(${n4(1 + 0.02 * rattle)}) translate(-100 -96)">${leaf}</g>`
    : `<g clip-path="url(#ho)">${[EDGE.svg, FACE_WHOLE].map((svg) => svg.replace(/ d="([^"]*)"/, (m, d) => ` d="${runsToDc(parsePath(d), (x, y) => falling(x, y, tip))}"`)).join("")}${knobAt(tip)}</g>`;
  // The room it falls into is dark.
  const room = t < SHOVE ? "" : `<rect x="${IN.x}" y="${IN.y}" width="${IN.w}" height="${IN.h}" ${fill("ink-lit")}/>`;
  return `${OPEN}${hole}${BG}${TABLE.svg}${SHADOW.svg}${room}${door}${FRAME.svg}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
