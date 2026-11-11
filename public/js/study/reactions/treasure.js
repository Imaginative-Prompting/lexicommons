// Treasure's two stories. A coin is tossed in from the left, flipping as it goes. Happy: it comes down flat on the heap, slides a little way down its
// front and settles in a gap between two coins: one more. Sad: it comes down too far over, bounces off the heap's right side, clips the rim and drops
// down the outside of the chest into its shadow, rolls a little on the floor, and topples flat there.
// Every frame is a pure function of t, in seconds. The 200-unit view; the coins are seen from above, as the heap's are (about 46°).
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M22.4 147.8l3.4 3.4 0 24.1c18.7 6 37.4 11.8 56.2 17.7 4.9 1.6 9.8 3.1 14.7 4.6 2.4 .8 5.4 1.3 7.5 2.5 1.8 1 3.2 2.9 4.6 4.3l-113.2 0 0-53.2 26.7 0 .1-3.4ZM169.5 147.9l0 3.3 34.9 0 0 29c-9.1-3.2-18.1-6.7-27.2-10-3.6-1.4-8.7-2.4-10.7-6.2-1.1-1.9-.4-10-.4-12.6l3.4-3.5Z\" fill=\"var(--art-teal-lit,#6FD0BD)\" fill-rule=\"evenodd\"/>\n<path d=\"M169.5 160.3l0 3.5 34.9 13 0 27.6-98.7 0c-.4-.2-.7-.4-1.1-.5l-82.6-26.4c.4-1.5 .8-2.1 1.9-3.2l114 5.5c1.1 .1 7.4-4.3 8.7-5.1 7.6-4.8 15.3-9.6 22.9-14.4Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M168.7 110.4c0 .9 0 1.8 0 2.7-3.3 0-4.7 .1-7.1-2.4-.3-.3-1-.8-1.1-1.3l-3.8-18.1c-1.4-6.3-8.7-23.8-14.3-26.9-2.2-1.2-17.8-1.2-21.5-1.3-18.1-.9-36.3-1.7-54.5-2.2l9.9 28.1c-1.2 1.2-2.3 2.6-3.6 3.6-1.3 1-2.5 1.7-3.7 2.8-.6-.6-1.2-1.3-1.9-1.9 .5-.4 1-.8 1.5-1.3-2.1-3-3-7.4-4.2-10.9-2-5.5-4-11.1-6.1-16.6-.8-2.5-3.4-7.4-2.5-9.9 1.3-3.4 4.7-6.5 7.4-8.9 10.6-9.1 19.2-9.4 32.4-8.8 4.4 .2 8.9 .3 13.4 .5 13.1 .5 26.1 1.1 39.2 1.8 5.7 .3 13.2-.1 18.4 2.4 11.4 5.6 15.5 19.9 15.5 31.7 0 5.7-1 11.6-2.8 17-2.2 7.2-5.6 14.3-10.6 19.9ZM168.7 115.4l-.1 3.2c.2 .1 .4 0 .6 .1 .5 .4 .3 10.5 .3 11.9 0 11.1 0 22.1 0 33.2l-31.1 19.4c-.2-.1-.2-.3-.4-.5-.2-.2-3-.1-3.4-.1l0-48.7c1.3-1.3 2.5-2.8 4-3.8 2.9-2.1 6.6-3.4 9.8-4.9 6.8-3.2 13.6-6.5 20.3-9.8Z\" fill=\"var(--art-bark,#7A4E2D)\" fill-rule=\"evenodd\"/>\n<path d=\"M87.1 130.2l2.2-2.2c9.7 .2 19.5 .7 29.2 1.2 4.7 .2 8.4-.7 11.5 3.8 1.2 1.8 .6 8.8 .6 11.2 0 9.6 0 19.2 0 28.7-1.1 1.1-2.4 2.9-3.9 3.5-1.9 .8-14.5-.4-17.5-.6-18.4-.7-36.8-1.7-55.1-2.7-5-.3-10-.5-14.9-.8-2.2 0-5.1 .3-6.9-1.1-4.3-3.3-3.2-6.4-3.2-11.2 0-8 0-16 0-24 0-3.7-.7-5.9 2.1-8.7 .6-.5 1.1-1.2 1.9-1.5 1.6-.7 8.8 .1 11.1 .2 6 .2 12 .5 18.1 .8 3 .1 6.2 0 9.2 .4 1.5 .2 2.8 2 3.4 2l12.2 1Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M95.2 82.7l3.5 3.5-.2 3.8c4 1.5 7.1 1.5 11.1 .1l.2-3.4 3.4-3.4c3.7 .5 11.1 1.6 14.1 3.5 1.4 .9 2.5 2.4 3.7 3.5-2.6 2.6-2.8 3.3-6.3 4.6l0 3.6c3.9 1.4 7.1 1.4 11 0 0-.6-.1-1.9 .1-2.5 .5-1 2.8-2.9 3.7-3.8 8.2 5.3 15.4 11.8 21.4 19.5-1.3 1.3-2.4 2.7-3.8 3.7-1.7 1.2-3.7 1.9-5.6 2.8-3.2 1.6-6.4 3.2-9.6 4.7-2.6 1.2-5.4 3.3-8.1 3.8-1.3 .2-2.7 0-4 0l-40.4-1.9c-.5 0-1.7-1-2-1.3l-13.4-.4c-.5 .3-.9 .7-1.3 1.1-8.3-.2-16.6-.7-24.8-1-2.5-.1-10.3 .1-12.1-.8-1.4-.8-2.6-2.3-3.7-3.4 1.7-2.6 3.5-5.9 6-7.8 1.2-1 2.8-1.4 4.1-2.3l13.9-10.7c2.9-2.2 6.5-3.8 9.7-5.2 .4-.2 2.9-1.2 3.2-.9 .1 .2 0 .4 .1 .6 .5-.5 1-.9 1.5-1.3 .5 .4 1 .8 1.4 1.3-.3 1.4-.3 2.6-.2 4 3.9 1.4 7 1.4 10.9 0 .2-1.3 .2-2.3 0-3.5-2.2-1.2-3.7-2.9-5.5-4.6 1.2-1.2 2.4-2.8 3.8-3.5 2.6-1.5 10.9-2 14.2-2.4ZM68.4 109.1c0 1.7-2.6 3-5.7 3-3.1 0-5.6-1.4-5.6-3.1 0-1.7 2.5-3 5.6-3 3.2 0 5.7 1.4 5.7 3.1ZM99.3 109c0 1.7-2.5 3.1-5.6 3.1-3.1 0-5.7-1.4-5.7-3.1 0-1.7 2.5-3 5.7-3.1 3.1 0 5.6 1.4 5.6 3.1ZM128.6 112.6c0 1.7-2.5 3.1-5.6 3.1-3.1 0-5.7-1.4-5.7-3.1 0-1.7 2.6-3.1 5.7-3.1 3.1 0 5.6 1.4 5.6 3.1Z\" fill=\"var(--art-sun-deep,#DB9A22)\" fill-rule=\"evenodd\"/>\n<path d=\"M116.7 86.5l-3.7-.7c.1 1.1 .3 2.3 .1 3.4-1.7 7.2-15.6 7.4-17.8 .6-.5-1.5 0-3 .3-4.5l-3.6 .4c1.9-1.9 3.9-4.4 6.2-5.8 1.5-1 3.2-1.5 4.9-1.6 6.2-.6 10 4 13.6 8.2ZM81.9 87.2c-.7 .3-1.2 .6-1.7 1.2 1.7 .8 3.7 1.6 4.9 3.2 3.8 4.7-1.8 9.1-6.4 9.7-5.1 .5-14.1-3.6-9.2-9.7 1.1-1.3 2.6-2.1 4.1-2.9-.3-.8-.6-1.7-.9-2.5 1.8-1.2 4.9-2.1 7-1.1 .9 .4 1.6 1.4 2.2 2.1ZM141.3 96c-.7-.4-1.3-.8-2-.9-.1 1.2 0 2.5-.6 3.6-2.3 5.2-10.7 5.6-14.9 2.6-3.3-2.3-3.4-6.6-.1-9.1 1.3-.9 2.9-1.4 4.4-2.1-.6-.6-1.2-.9-1.8-1.3 .6-.6 1.1-1.4 1.9-1.8 3.6-1.7 8.1 1.2 10.5 3.6 .7 .7 4.3 3.7 3.2 4.9-.2 .2-.5 .3-.6 .5ZM71.9 109c0 3.6-4.1 6.6-9.2 6.6-5 0-9.1-2.9-9.1-6.5 0-3.6 4-6.6 9.1-6.6 5 0 9.1 2.9 9.2 6.5ZM102.8 109c0 3.6-4 6.5-9.1 6.6-5.1 0-9.2-2.9-9.2-6.5 0-3.7 4.1-6.6 9.1-6.6 5.1-.1 9.2 2.9 9.2 6.5ZM132.1 112.6c0 3.6-4.1 6.6-9.1 6.6-5.1 0-9.2-2.9-9.2-6.6 0-3.6 4.1-6.6 9.2-6.6 5 0 9.1 2.9 9.1 6.6ZM89.7 122.3c.9 0 1.9 .1 2.8 .2l0 8.1-3.1 0c-.2 1-.4 2-.6 3l-15.7-.7-.6-3.1-3.3 0 0-8.3c1 0 1.9 0 2.9 0 .6-.7 1.1-1.5 2-1.8 1.2-.4 12.7 .1 13.8 .6 .8 .4 1.3 1.3 1.8 2Z\" fill=\"var(--art-sun,#F7BE45)\" fill-rule=\"evenodd\"/>\n<path d=\"M54.2 15.9c2.2 8.9 5.1 12.2 14 14.5-9.1 2.1-12.1 5.4-14.1 14.4-2.3-8.7-5-12.1-14-14.3 8.9-2.4 12-5.6 14.1-14.6Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<path d=\"M162.3 105.8l.4 3.5 5.6 .3c.3 1.1 .4 2.2 .4 3.6-3.6 2.4-7.8 4-11.7 5.8-6.1 2.9-12.2 5.9-18.3 8.8-.9-.2-3.5-.3-4-.5-1.2-.5-2.5-2.3-3.4-3.2 1 0 1.8 0 2.7 0-.2-.1-.6-.5-.8-.7l24.3-11.5c-.5-.7-1.6-1.6-1.9-2.5-.1-.2 .3-.3 .3-.5-.1-.3-1.1-1.6-1.2-1.8 .4-.4 .9-1.1 1.5-1.4 1.2-.5 4.7 .1 6.1 .1ZM46 106c-3.8 4-8.4 8.5-10.5 13.7 .6 .3 1.4 .5 2 .7-.2 .2-1.9 2.2-2.2 2.2l-12.1-.3 .2-4.1 22.6-12.2Z\" fill=\"var(--art-ink-lit,#3A3460)\" fill-rule=\"evenodd\"/>\n<path d=\"M163.6 109.4l-8.3-.3c-1.4-1.6-2.8-3.4-4.4-4.7l-12-9.5c-.2-.2-.4-.8-.6-1.1-.8-1-2.3-2.6-3.7-2.8l-8.9-1.4c-1.4-.2-2.9-.9-4.3-1.3-2.7-.7-5.4-1.2-8.2-1.6-4.6-6.5-12.8-6.8-17.8-.5l-16.6 2.2c-.5 .1-1.2-.1-1.7-.1-1.5 0-2.8 .4-4.2 .8l-11.2-31.8c9.8 .1 19.7 .7 29.5 1.1 9.8 .4 19.5 .6 29.3 1.2 3.8 .2 19.7 0 22 1.4 3.4 1.9 7.3 7.5 9.4 10.8 7 11.2 10.2 24.6 11.7 37.6ZM169.5 109.4l0 9.1-31.4 15.2 0 49.8-114.6-5.5c-.4 0-.8 0-1.1 .1l0-59.2 50.3 1.8 0 9.9-40.1-1.6 0 39.5 94.6 4.7 0-40.2-38.1-1.6 .1-9.9 48.7 2.7c.3 0 .6 .1 .8 .1l30.8-14.9Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "4aff2b07d6";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const BODY = STILL.slice(STILL.indexOf(">") + 1, STILL.lastIndexOf("</svg>"));
// The still's sparkle, and the still without it: it twinkles once when the coin has settled.
const SPARKLE = BODY.match(/<path[^>]*--art-sun-lit,[^>]*\/>/)[0], SPARK_AT = [54.2, 30.3];
const [BEFORE, AFTER] = [BODY.slice(0, BODY.indexOf(SPARKLE)), BODY.slice(BODY.indexOf(SPARKLE) + SPARKLE.length)];
const sparkle = (k) => (k === 1 ? SPARKLE : `<g transform="translate(${SPARK_AT[0]} ${SPARK_AT[1]}) scale(${n2(k)}) translate(${-SPARK_AT[0]} ${-SPARK_AT[1]})">${SPARKLE}</g>`);
// (the sparkle in its own place among the still's parts)
const at = (k) => BEFORE + sparkle(k) + AFTER;
const fill = (t) => `fill="${paint(t)}"`;
const rad = Math.PI / 180;
// The view looks down at 46°: a coin lying flat is an ellipse 0.72 as tall as it's wide, one standing facing us 0.69.
const E = 46 * rad, R = 8.75, THICK = 1.7;
const G = 600;

// The heap's top edge, read off the still every 4 units.
const TOP = [[38, 115.3], [42, 110.3], [46, 106], [50, 103], [54, 99.8], [58, 97], [62, 94.8], [66, 93], [70, 91], [74, 88.8], [78, 88.5], [82, 88], [86, 87.5], [90, 87],
  [94, 86.5], [98, 83.8], [102, 82], [106, 82], [110, 83.8], [114, 87], [118, 87.8], [122, 88.8], [126, 89.8], [130, 90.5], [134, 91], [138, 93.8], [142, 97.5], [146, 100.8],
  [150, 104], [154, 108]];
function heapTop(x) {
  if (x <= TOP[0][0] || x >= TOP.at(-1)[0]) return Infinity;
  const i = TOP.findIndex(([px]) => px > x), [x0, y0] = TOP[i - 1], [x1, y1] = TOP[i];
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

/** A coin, its middle at (x, y), turned α degrees from lying flat (90: standing, its face to us). lit: in the light, else in the chest's shadow.
 *  A new one: a touch brighter than the heap's, so the one that's joined them shows. */
function coin(x, y, alpha, lit = true) {
  const k = Math.sin(alpha * rad + E), ry = Math.max(0.4, R * Math.abs(k)), band = THICK * Math.abs(Math.cos(alpha * rad + E));
  const dy = k >= 0 ? band : -band;
  return `<ellipse cx="${n2(x)}" cy="${n2(y + dy)}" rx="${R}" ry="${n2(ry)}" ${fill(lit ? "sun" : "wood-deep")}/><ellipse cx="${n2(x)}" cy="${n2(y)}" rx="${R}" ry="${n2(ry)}" ${fill(lit ? "sun-lit" : "sun-deep")}/>`;
}

// A toss: from off the left edge, a parabola, until the coin's underside meets the heap (found once, here). Flat when it gets there.
const T0 = 0.03, FROM = [-12, 70];
function toss(vx, vy) {
  const at = (t) => { const s = Math.max(0, t - T0); return [FROM[0] + vx * s, FROM[1] + vy * s + 0.5 * G * s * s]; };
  let down = null;
  for (let t = T0; t < 2; t += 0.001) {
    const [x, y] = at(t);
    if (y + R * Math.sin(E) >= heapTop(x)) { down = t; break; }
  }
  if (down === null) throw new Error("treasure: the toss misses the heap");
  return { at, down, land: at(down) };
}
// Two flips in the air, and flat as it comes down.
const flips = (t, down, turns) => -360 * turns * Math.max(0, (down - t) / (down - T0));

// ---- happy.
const HAPPY = toss(185, -118);
const GAP = [108, 101], SLIDE = 0.34;
const HAPPY_DUR = HAPPY.down + SLIDE + 0.7;
function happy(t) {
  if (t <= 0) return STILL;
  let x, y, a;
  if (t < HAPPY.down) {
    [x, y] = HAPPY.at(t);
    a = flips(t, HAPPY.down, 2);
  } else {
    // It slides down the heap's front, slowing, and settles in the gap; it rocks a touch as it stops.
    const s = track([[HAPPY.down, 0], [HAPPY.down + SLIDE, 1, "out"]], t);
    x = HAPPY.land[0] + (GAP[0] - HAPPY.land[0]) * s;
    y = HAPPY.land[1] + (GAP[1] - HAPPY.land[1]) * s;
    a = track([[HAPPY.down, 0], [HAPPY.down + 0.08, 7, "out"], [HAPPY.down + SLIDE, -4, "io"], [HAPPY.down + SLIDE + 0.12, 2, "io"], [HAPPY.down + SLIDE + 0.24, 0, "io"]], t);
  }
  // As it settles, the sparkle twinkles: it swells and comes back.
  const settled = HAPPY.down + SLIDE;
  const k = track([[settled - 0.02, 1], [settled + 0.14, 1.45, "out"], [settled + 0.36, 0.92, "io"], [settled + 0.5, 1, "io"]], t);
  // (it shows from the frame's left edge on, so nothing off it is drawn)
  return `${OPEN}${at(k)}${x + R < 0 ? "" : coin(x, y, a)}</svg>`;
}

// ---- sad.
const SAD = toss(228, -122);
// It bounces off the heap and comes down on the rim, the chest's side top edge, which runs from (138, 124.2) to (169.5, 110).
const rimAt = (x) => 124.2 - ((x - 138) * 14.2) / 31.5;
const HOP = 0.3, RIM_X = 156;
const RIM = [RIM_X, rimAt(RIM_X) - R * Math.sin(E) * 0.8];
const H_VX = (RIM[0] - SAD.land[0]) / HOP, H_VY = (RIM[1] - SAD.land[1] - 0.5 * G * HOP * HOP) / HOP;
const T_RIM = SAD.down + HOP;
// Over the rim it goes, outward, and falls down the side to the floor, where it lands standing on its edge, its face to us.
const OUT = 26, FLOOR = 176, UP = FLOOR - R * Math.cos(E);
const FALL = Math.sqrt((2 * (UP - RIM[1])) / G), T_FLOOR = T_RIM + FALL;
const LAND_X = RIM[0] + OUT * FALL;
// It rolls on a little, slowing, and wobbles as it goes; then it leans, and topples flat towards us.
const ROLL = 0.42, ON = 13, T_LEAN = T_FLOOR + ROLL, TOPPLE = 0.24, T_FLAT = T_LEAN + TOPPLE;
const SAD_DUR = T_FLAT + 0.75;
// The chest's shadow, as a volume: right of its front corner and under its side's top edge, out along the light to the floor's shadow.
const SHADE = `<clipPath id="tl"><polygon points="-10,-10 210,-10 210,${n2(110 + (210 - 169.5) * 1.914)} 169.5,110 138,124.2 138,182.5 104,205 -10,205"/></clipPath><clipPath id="td"><polygon points="138,124.2 169.5,110 219,205 104,205 138,182.5"/></clipPath>`;
function sad(t) {
  if (t <= 0) return STILL;
  let x, y, a;
  if (t < SAD.down) {
    [x, y] = SAD.at(t);
    a = flips(t, SAD.down, 2);
  } else if (t < T_RIM) {
    // the bounce: a short hop off the heap, turning over a little
    const s = t - SAD.down;
    x = SAD.land[0] + H_VX * s;
    y = SAD.land[1] + H_VY * s + 0.5 * G * s * s;
    a = (s / HOP) * -35;
  } else if (t < T_FLOOR) {
    // off the rim, falling from rest downwards and a little out, turning up onto its edge as it goes
    const s = t - T_RIM;
    x = RIM[0] + OUT * s;
    y = RIM[1] + 0.5 * G * s * s;
    a = -35 + (125 * s) / FALL;
  } else if (t < T_LEAN) {
    // standing, rolling to a stop, with a wobble that dies away
    const s = track([[T_FLOOR, 0], [T_LEAN, 1, "out"]], t);
    x = LAND_X + ON * s;
    y = UP;
    a = 90 + 5 * Math.sin((t - T_FLOOR) * 2 * Math.PI * 4) * (1 - s);
  } else {
    // it leans towards us, faster and faster, and lands flat; a little bounce
    const tip = track([[T_LEAN, 90], [T_FLAT, 0, "in"], [T_FLAT + 0.06, 6, "out"], [T_FLAT + 0.12, 0, "in"]], t);
    x = LAND_X + ON;
    // turning about its foot on the floor: its middle goes from above the foot to in front of it
    y = FLOOR - R * Math.sin(tip * rad) * Math.cos(E) + R * Math.cos(tip * rad) * Math.sin(E);
    a = tip;
  }
  if (x + R < 0) return STILL;
  const lit = coin(x, y, a, true), dark = coin(x, y, a, false);
  return `${OPEN}${BODY}${SHADE}<g clip-path="url(#tl)">${lit}</g><g clip-path="url(#td)">${dark}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
