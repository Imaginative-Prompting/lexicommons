// The room's two stories. Happy: the sun comes out. Warm light pours in through the window, lies across the floor, and reaches the armchair; dust turns in it.
// Sad: the picture on the wall swings on its nail, the nail gives, and it drops onto the armchair below, crooked. Where it hung, the wall's a brighter patch.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths; the picture's parts are its runs, kept together.
import { n2, n4, paint, parsePath, partsOf, runsToDc, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M30.7 109.6l-3.5 0 54.5 49.1c.6 .5 2.7 .3 3.4 .3-.6-1.7-.9-2.9-1.2-4.6l7.3 7.9c1 1.2 2.2 2.2 3.3 3.3l.4 9.7 3.2 .5c.2-2.1 1-7.7 2-9.4 .7-1.3 2.3-2.5 3.4-3.6l41.9 1.8c.5 0 1.1 .7 1.4 1 3.2 2.9 2.8 6 3.5 10l-3.7 3.7-40.8 0 48.8 21.3c1 .4 3 3 3.7 3.8l-105.8 0-28.5-45.6 3.5 0-22.4-50c-.3-.6-.2-2-.2-2.7 3.4 0 20.2-.4 22.1 .2 1.4 .6 2.7 2.2 3.7 3.3Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/>\n<path d=\"M180 154.9c.6 1.9 .4 2-.4 3.9l24.8 0 0 45.6-49.5 0c-4.2-3.1-10.2-4.8-15-6.8-8.8-3.7-17.5-7.6-26.3-11.4-3.7-1.6-7.5-3.3-11.2-4.9-1.7-.8-3.6-1.8-5.5-2.3-.8-.2-1.8-.2-2.7-.3 1-1 2.1-2.5 3.3-3.2 .5-.3 1.1-.3 1.6-.7 1.1-.8 2.3-2.3 3.3-3.3l-1 4.3 45.4 0-.6-3.8 4.6 4.7c1 0 2 0 2.9 0 .6-4.4 .5-10.9 5.3-12.8 1.9-.8 4.7-.7 6.8-1 1.1 1.1 2.7 2.3 3.5 3.6 .7 1.3 .3 3 1 4.3 .3 .7 1 1.7 1.3 2.2l.8-10.1 7.6-8ZM-4.4 158.8l31.9 0 28.5 45.6-60.4 0 0-45.6Z\" fill=\"var(--art-teal-deep,#25907B)\" fill-rule=\"evenodd\"/>\n<path d=\"M37.7 17.1l2.4 2.3c.8-.8 1.6-1.8 2.8-2.2 2-.6 4.8-.1 6.9-.1 6 0 11.9 0 17.8 0l3.9 3.8c0 9.5 0 18.9 0 28.3 0 2.3 .6 8.3-.3 10.2-.4 .9-1.4 1.7-2.1 2.5l2.4 2.4c0 10.1 0 20.2 0 30.3 0 4.6 1.2 9.2-3.5 12-1.9 1.2-5.4 .5-7.6 .5-6 0-11.9 0-17.9 0l-2.4-2.4-2.4 2.4-25.5 0-3.9-3.9c0-9.6 0-19.2 0-28.7 0-2.3-.6-8.3 .3-10.2 .4-.9 1.4-1.7 2.1-2.5l-2.4-2.4c0-10.1 0-20.1 0-30.1 0-4.6-1.1-8.9 3.5-11.7 1.9-1.2 5.4-.5 7.6-.5 6.1 0 12.2 0 18.3 0ZM136 31.6c.7 .7 1.8 1.5 2.1 2.5 .5 1.5 .1 12.2 .1 14.7l-3 3.1c-3.5-1.4-7.5-2.3-11.2-1l-16.3 5.9c-.5 .2-3.6-.2-4.7 0-3.1 .4-5.7 1.8-8.4 3.5-.3-.4-2.7-2.5-2.7-3.1l-.3-23.4c.6-.6 1.4-1.5 2.2-1.9 1.7-.7 8.7-.3 10.9-.3 10.5 0 20.9 0 31.3 0ZM106.6 43.5c.1 .9-.7 1.7-1.7 1.7-.9 .1-1.7-.7-1.8-1.6 0-.9 .8-1.7 1.7-1.7 1-.1 1.8 .7 1.8 1.6Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M172.8 114c-5.4 .4-11.1 1.1-15.4 4.8-7.4 6.3-8 24.2-8.6 33.4-.2 3-.2 11.9-1 14.1-.2 .7-.6 1-1 1.6-.7-.3-1.2-.8-2-1-.3 .3-.2 .6-.7 .6l-41.6-1.2-.7 3.5-5.5-.3c-1.1-1.1-2.4-2.1-3.3-3.4-1.7-2.5-2.2-6.3-2.6-9.2-.7-5-1.4-10.8 .2-15.6 .9-2.8 2.9-4.9 5-7 6.9-6.9 12.5-8.8 22-9.9-.8-2.6-1.6-5.5-3.2-7.7-1.4-1.8-3.2-3.4-4.7-5.2l3.8 1.4c.5-10.3 5.2-24.1 13.8-30.5 8.7-6.5 20.9-7.7 31.4-7.1 5.1 .4 12.9 1.2 17.4 3.9 .8 .5 1.4 1.2 2.2 1.7 1.2 .8 2.7 1.4 3.7 2.5 1.6 2 1.5 5.7 1.4 8.2-.2 8.4-4.8 16.6-10.6 22.4Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M175.6 107.3c2 .4 4 .7 5.8 1.6 3.5 1.7 7.2 6 9.2 9.2l-3.8 3.8c-7.9-.8-15.3 2.3-17.8 10.4l-8.8 29.1c-.9 2.8-6.2 8-8.9 9.2-1.4 .6-2.8 .7-4.3 .8l-.5-3.3c-.6-.2-1.3-.3-1.9-.6-.4-6.2 .5-14.2 1.1-20.5 1.3-14 2.6-30.1 18.4-35.2 3-1 6.2-1.1 9.3-1.2l2.2-3.3ZM114.8 114.4c.5 .4 1 .7 1.5 1.2-.3 .3-.7 1.1-1.2 1.2l-8.9 2.4c-6.3 1.7-6.6 9.5-8.1 14.5-.8 2.3-3.3 3.6-3.9 6.1-1.6 6.5-1.2 13.5 .2 19.9 .4 2.3 1.3 4.5 1.5 6.8 .6 .4 1.1 .4 1.9 .5l-2.2 2.4-3.7-.1 0-3.4c-7.1-3.4-7.8-9.2-9.7-16.2-3.4-12.5-8.1-28.2 5.9-36.4 5.8-3.4 13.3-3.7 19.8-2.7 1.3 .2 7.2 1.4 7.1 3.2-.1 .2-.2 .4-.2 .6Z\" fill=\"var(--art-sun-lit,#FAD57E)\" fill-rule=\"evenodd\"/>\n<path d=\"M176.9 79.4c2.8 1.5 5.6 3.1 7.8 5.4 13.6 14.2 6.2 39.7 1.2 56.1-1.8 5.6-3.9 14.5-7.3 19.2-1 1.4-2.3 2.5-3.5 3.6l-.3 3.5c-2.4 1.1-4.8 1.8-7.4 2.4l-.7-3.3-8.9 1.2-.7 3.3-5.3 .5-2.4-2.6c.6-.2 1-.4 1.6-.6 0-.2 .4 0 .3-.3-.2-.5-.3 .3-.5-.2-.4-1.2 .4 .9 .2-.3 2.3-1.2 4.9-3.3 5.7-5.9l8.7-28.6c.5-1.9 1.7-3.7 2.7-5.3 4.6-7 11-9.8 19.2-9-3.9-6.6-7.5-7.1-14.7-8 6.8-10.1 10.1-19.6 4.3-31.1ZM121.8 127.4c-8.8 .9-19.2 2.1-25.2 9.5-1.1 1.4-1.9 3-2.7 4.6 .7-6.8 .8-14.1 5-19.8 3.2-4.4 8.5-7.3 13.9-7.6 1.1-.1 2.3-.2 3.3 .5 3.1 2 4.8 9.4 5.7 12.8Z\" fill=\"var(--art-sun-deep,#DB9A22)\" fill-rule=\"evenodd\"/>\n<path d=\"M135.2 55.2l3 3 0 5.8c-.6 .7-1.3 1.5-2.2 1.9-1.9 .9-6.4 .3-8.6 .3-8.2 0-16.5 0-24.7 0-2.1 0-7.2 .5-8.9-.3-.9-.4-1.6-1.2-2.2-1.9l.2-7.2c.6-.6 1.1-1.1 1.8-1.6 .1 .8 .1 1.3 .6 2 3.3-2.4 7.2-4.2 11.3-4 1.3 0 2.6 .5 3.9 .4 1.1-.1 3.6-1.8 4.4-1.5l14.5 3.7c2.2 .6 4.8-.2 6.9-.6Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M136.1 46.8c.7 .5 1.6 .9 1.9 1.8 .4 .8 .4 8.7 .1 9.6-.3 .8-1 1.3-1.6 1.8-.2-.5-.3-1.2-.9-1.8-7.8 3.5-19.3-2.4-27.2-4.7 7.6-3.6 19.1-9.7 27.1-4.7 .7-.7 .6-1.1 .6-2Z\" fill=\"var(--art-violet-lit,#A68CFF)\"/>\n<path d=\"M110.1 43.6c0 2.9-2.4 5.2-5.3 5.1-2.9 0-5.2-2.3-5.1-5.2 0-2.8 2.4-5.1 5.2-5.1 2.9 0 5.2 2.4 5.2 5.2Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M74.8 14.2l-.2 95.4-69.6 0 0-95.4 69.8 0ZM12.5 20.5l24.9 0c.4 0 .7 .3 .7 .7l0 37.9c0 .4-.3 .7-.7 .7l-24.9 0c-.4 0-.7-.3-.7-.7l0-37.9c0-.4 .3-.7 .7-.7ZM42.8 20.5l24.5 0c.4 0 .7 .3 .7 .7l0 37.9c0 .4-.3 .7-.7 .7l-24.5 0c-.4 0-.7-.3-.7-.7l0-37.9c0-.4 .3-.7 .7-.7ZM92.1 30.8l45.6 0c.8 0 1.4 .6 1.4 1.3l0 33.6c0 .8-.6 1.4-1.4 1.4l-45.6 0c-.8 0-1.4-.6-1.4-1.4l0-33.6c0-.7 .6-1.3 1.4-1.3ZM94.5 33.9l0 30 40.7 0 .1-30-40.8 0ZM12.5 63.9l24.9 0c.4 0 .7 .3 .7 .7l0 38.3c0 .4-.3 .7-.7 .7l-24.9 0c-.4 0-.7-.3-.7-.7l0-38.3c0-.4 .3-.7 .7-.7ZM42.8 63.9l24.5 0c.4 0 .7 .3 .7 .7l0 38.3c0 .4-.3 .7-.7 .7l-24.5 0c-.4 0-.7-.3-.7-.7l0-38.3c0-.4 .3-.7 .7-.7ZM175.9 163l-1 10.5c-.2 2-5.7 1.7-6.8 .7-1.5-1.3-1.8-5.9-2.2-7.8 3.6-.7 6.8-1.6 10-3.4ZM91 165.6l12.4 .6c-.5 2.2-1.4 9.5-2.5 11.1-1.7 2.3-7.5 2.3-8.9-.3-1.1-1.9-.9-9-1-11.4ZM158.6 167.4c-.4 2.4-.9 9.5-2.1 11.1-1.7 2.4-7.5 2.4-9-.1-1.2-1.9-1.5-8.1-1.8-10.5l12.9-.5Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "4cada40391";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [FLOOR_LIT, FLOOR, PAPER, SEAT, SEAT_LIT, SEAT_DEEP, HILL, HILL_LIT, SUN, INK] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const fill = (t) => `fill="${paint(t)}"`;
const P = parsePath(PAPER.d), K = parsePath(INK.d);
const ev = (runs, c) => `<path d="${runsToDc(runs)}" ${fill(c)} fill-rule="evenodd"/>`;
// The room without the picture, and the picture on its own: its mat, its hills, its sun, its frame.
const ROOM = `${FLOOR_LIT.svg}${FLOOR.svg}${ev([P[0]], "paper")}${SEAT.svg}${SEAT_LIT.svg}${SEAT_DEEP.svg}${ev([K[0], K[1], K[2], K[5], K[6], K[7], K[8], K[9]], "ink")}`;
const PICTURE = `${ev([P[1]], "paper")}${HILL.svg}${HILL_LIT.svg}${SUN.svg}${ev([K[3], K[4]], "ink")}`;
const NAIL = [115, 28];
const decay = (t, at, amp, hz, k) => (t <= at ? 0 : amp * Math.sin(2 * Math.PI * hz * (t - at)) * Math.exp(-k * (t - at)));

// ---- happy.
const HAPPY_DUR = 2.3;
function happy(t) {
  if (t <= 0) return STILL;
  // The sun comes out, over a moment, as a cloud passes: the window's panes go warm, and the light on the floor, in the still's own lit color, stretches
  // out to the chair (under it: the chair stands in it). No new light color and nothing in the air: no shaft, no motes, no glow.
  const k = track([[0.1, 0], [0.75, 1, "io"]], t), reach = track([[0.2, 0], [1.2, 1, "io"]], t);
  // (it widens out of the still's band of light, from that band's right edge, so its first frame is a sliver; its far corner is tucked under the
  // chair's seat, inside the chair's outline)
  const lerp = (p, q) => `${n2(p[0] + (q[0] - p[0]) * reach)},${n2(p[1] + (q[1] - p[1]) * reach)}`;
  // (drawn from the first frame, at no size, so it's one part that grows, never one that arrives)
  // (the band's right edge runs from 27.2,109.6 to 81.7,158.7; the new light grows from that edge, and its inner edge lies 1.5 units inside the band,
  // so the two overlap and no seam shows between them)
  const patch = t <= 0 ? "" : `<polygon points="25.7,109.6 ${lerp([27.2, 109.6], [75, 110])} ${lerp([81.7, 161.5], [160, 165])} 80.2,161.5" ${fill("teal-lit")}/>`;
  const glass = `<g opacity="${n2(k)}">${ev([P[0]], "sun-lit")}</g>`;
  const rest = ROOM.slice(FLOOR_LIT.svg.length + FLOOR.svg.length).replace(ev([P[0]], "paper"), ev([P[0]], "paper") + glass);
  return `${OPEN}${BG}${FLOOR_LIT.svg}${FLOOR.svg}${patch}${rest}${PICTURE}</svg>`;
}

// ---- sad.
const POP = 0.95, SEAT_Y = 126;
const SAD_DUR = 2.3;
function sad(t) {
  if (t <= 0) return STILL;
  // A nudge sets it swinging on its nail; the swing grows a little, then the nail lets go at the end of a swing.
  const swing = t < POP ? track([[0.12, 0], [0.24, 7, "out"], [0.44, -10, "io"], [0.66, 12, "io"], [POP, -9, "io"]], t) : -9;
  let tr;
  if (t < POP) tr = `rotate(${n4(swing)} ${NAIL[0]} ${NAIL[1]})`;
  else {
    // Falling from rest, turning a little more as it goes, down onto the armchair's seat below it; it lands with a bump and settles there, crooked.
    // It starts from exactly the pose the swing left it in (turned -9° on its nail), and the turn it adds while falling is about its own middle as it
    // hangs in that pose, so the hand-over from swinging to falling moves nothing.
    const s = t - POP, drop = SEAT_Y - 67, tf = Math.sqrt((2 * drop) / 900), q = Math.min(s, tf), y = 0.5 * 900 * q * q, extra = -7 * (q / tf);
    const after = Math.max(0, s - tf);
    const bump = after > 0 ? -track([[0, 0], [0.06, 5, "out"], [0.13, 0, "in"], [0.18, 1.2, "out"], [0.23, 0, "in"]], after) : 0;
    const settle = after > 0 ? track([[0, 0], [0.1, 6, "out"], [0.2, 3.5, "io"], [0.3, 4.5, "io"]], after) : 0;
    const a = (-9 * Math.PI) / 180, mid = [NAIL[0] - 39 * Math.sin(a), NAIL[1] + 39 * Math.cos(a)];
    tr = `translate(0 ${n2(y + bump)}) rotate(${n4(extra + settle)} ${n2(mid[0])} ${n2(mid[1])}) rotate(-9 ${NAIL[0]} ${NAIL[1]})`;
  }
  // Where it hung, the wall hasn't faded: a brighter patch, and the nail.
  const mark = `<path d="M91.5 31.5H138.5V66.5H91.5Z" ${fill("teal-lit")}/><circle cx="${NAIL[0]}" cy="${NAIL[1]}" r="1.6" ${fill("ink")}/>`;
  // Once it's in the chair, the chair's near arm is in front of it.
  const arm = t > POP + 0.3 ? `${ev([parsePath(SEAT_LIT.d)[1]], "sun-lit")}${ev([parsePath(SEAT_DEEP.d)[1]], "sun-deep")}${ev([K[8]], "ink")}` : "";
  return `${OPEN}${BG}${ROOM}${mark}<g transform="${tr}">${PICTURE}</g>${arm}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
