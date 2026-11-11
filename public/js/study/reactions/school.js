// The school's two stories. Happy: home time. The door flies open, and paper planes come sailing out of it, thrown from inside; the flag flies. Sad: the clock runs backwards, round and round, from home time all the way back to the morning, and the flag hangs limp.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths; the clock's hands are one path, clipped into two and turned.
import { n2, n4, paint, parsePath, partsOf, runsToDc, subdivide, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M13.4 160.5c20 8.9 39.8 18.2 59.6 27.5 6 2.7 11.9 5.5 17.9 8.3 2.6 1.2 5.7 2.1 8.1 3.8 1.7 1.1 3 2.9 4.4 4.3l-107.8 0 0-41.2c5.8 0 12.1-.6 17.8 .4l0-3.1ZM186.3 161.1c.3 .6 .3 1.3 .3 2l17.8 .1 0 12.9c-3.6-1.9-7.1-3.8-10.6-5.6-2.1-1.1-4.5-2.1-6.4-3.5-1.3-1-2.4-2.3-3.6-3.5l2.5-2.4Z\" fill=\"var(--art-teal-lit,#6FD0BD)\" fill-rule=\"evenodd\"/>\n<path d=\"M39.7 134.5c2-2.6 4.7-6.1 7.8-7.3 4.1-1.5 7.2 1 10 3.7 1.3 1.3 2.6 2.6 3.2 4.3 1.2 3.1 .6 12.9 .6 16.7l-3.9 3.9c-2.6 0-12.8 .5-14.5-.3-1.2-.5-2.3-2-3.2-2.9l-3.2 3.2-14.2 0-3.9-3.9c0-4.3-1-12.9 .4-16.6 .6-1.8 1.9-3.1 3.2-4.4 2.7-2.7 5.8-5.2 9.9-3.6 3.2 1.2 5.8 4.6 7.8 7.2ZM186.6 159.8l0 3.3 17.8 9.4 0 31.9-105 0c-.2-.2-.1-.4-.2-.6-.4-.7-6.5-3.3-7.6-3.8-5.5-2.5-11-5-16.5-7.6-20.6-9.6-41.1-19.1-61.7-28.5l0-4.1 173.2 0Z\" fill=\"var(--art-teal-deep,#25907B)\" fill-rule=\"evenodd\"/>\n<path d=\"M102.7 25.6c.7-.2 1.4-.6 2.1-.7 .4 .7 .5 .6 .8 1.2 .4 1.1 0 12.6 0 14.7l-3.3 1.5-.4 16.6c0 .2-.2 .3-.3 .4 .5 .5 1 .9 1.4 1.4-.5 .5-1.1 1-1.6 1.5-.7 .1-1.3 .1-2 .1-.6-.6-1.1-1.1-1.6-1.8 .4-.4 .9-.9 1.3-1.4-.1-.2-.4-.2-.5-.4-.2-.2 .1-7.3 .1-8.2 0-6.4 0-12.8 0-19.3 0-1.6 .1-3.3-.1-5-.1-.8-.5-1.7-.4-2.6 0-.4 .1-.8 .3-1.1 1-1.5 3.3-1.2 4 .4 .3 .7-.2 1.4-.1 2.1 .1 .2 .3 .4 .3 .6ZM100.2 64.2c6.4 6.1 12.5 12.7 18.5 19.2 1.7 1.9 6.1 5.7 6.9 7.8 .7 2 .2 18.1 .2 21.5 0 16.6 0 33.1 0 49.7l-3.1 0c-.3 .2-.4 .5-.6 .7-.5 .4-3.5 .1-4.2 .1-.5-.2-.8-.5-1.1-.8l-3.2 0c0-5.5 0-11 0-16.5 0-3 .2-6.1-.2-9-.2-1.9-.9-3.7-1.7-5.4-4-7.5-19.2-7.9-23.5-.6-1.1 1.9-1.8 4-2.2 6.1-.5 3.2-.2 6.5-.2 9.7 0 5.2 0 10.5 0 15.7l-3.3 0c-.2 .1-.1 .4-.3 .6-.2 .3-4.1 .2-4.7 .2-4.5 0-9.1 0-13.7 0-16.8 0-33.6 0-50.4 0l0-41.8c-.6-.4-1.4-.4-1.9-.6 .7-.7 1.4-1.7 2.3-2.1 1.8-.8 9.3-.3 11.7-.3 11.8 0 23.6 0 35.4 0 0-2.9-.4-15.5 .3-17.3 .9-2.4 8.9-8.8 11.1-11 9.3-8.6 18.7-17.2 27.9-25.9ZM21.9 152.3l15 0c0-4.2 .9-14.8-1-18.2-3.2-5.6-11.5-4.7-13.7 1.3-1.3 3.8-.3 12.5-.3 16.9ZM42.5 152.3l15.3 0c0-4.1 .8-14.8-1-18-3-5.6-11.4-5.1-13.7 .8-1.2 3-.6 13.4-.6 17.2Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M134.3 26.1c0 2.6 .5 12.1-.4 13.9-.9 1.6-3 2.8-4.7 3.4-1.4 .5-3.4 1.1-4.9 .8l-14.3-3c-2.6-.5-5.6 .9-7.8 2l0-18.1c2.2-1 6-2.5 8.5-1.6l12.8 4.6c3.7 1.3 7.6-.4 10.8-2ZM142.6 103.8c.6 .6 1.2 .6 1.9 .9-.6 .7-1.4 1.8-2.3 2.2-1.3 .7-5 .2-6.5 .2l-3.6-3.6c0-.3-.1-1.9-.4-2.3l-8.3-8.6c-.4-.4-.5-1.5-.8-2-.6-1-1.5-1.8-2.3-2.6-4.1-4.4-8.2-9-12.5-13.2-2.5-2.5-5.1-4.7-7.6-7.1l-35.8 33.2c0 1.8-.1 2.6-.8 4.1 0 .2 0-.2 0-.3 0-.1 0 .1 0 .2 0 .3 0 .5 0 .8 0 .5 0 .9 0 1.4-1.5 0-5.2 .5-6.5-.2-.9-.4-1.8-1.7-2.5-2.3 1-.1 2-.2 3-.4-1-.7-2.4-1.5-2.9-2.7-1.4-3.3 5.6-8.1 7.8-10.1 8.4-7.8 16.9-15.5 25.5-23.2 2.4-2.1 8.3-8.3 11-9.1 3.5-1.1 6.3 2.4 8.6 4.6 6.5 5.9 12.9 11.7 19.4 17.6 4.4 4.1 8.9 8.2 13.4 12.3 1.6 1.5 4.2 3.2 5 5.4 .8 2.4-1 3.6-2.8 4.8ZM117.1 163.2l-34.8 0c0-5.5 0-11 0-16.5 0-3.3-.3-6.7 .3-10 .4-2.1 1.1-4.1 2.2-6 7.3-12.2 25.6-11 31 2.3 2 4.8 1.3 10.4 1.3 15.5 0 4.9 0 9.8 0 14.7Z\" fill=\"var(--art-clay,#E8743B)\" fill-rule=\"evenodd\"/>\n<path d=\"M134.5 101.9c.1 .7 .1 1.2 .5 1.8 10.5-.3 21.2-.3 31.7-.2 3.1 0 10.2-.5 12.8 .5 2.8 1 10.9 11.8 12.4 14.7 .4 .8 .5 1.7 .8 2.6-2.4 .5-4.7 .4-7.1 .4l0 3.5-49.9 0-3.7-3.8 0-17.2 2.5-2.3ZM64.4 103.6l0 18.3c-12.3 0-24.6 0-37 0-6.4 0-13.9 .6-20.3-.5 .3-.8 .5-1.7 .9-2.5 1.6-3.2 9.3-13.6 12.3-14.9 2.4-.9 10.4-.4 13.4-.4 10.3 0 20.5 0 30.7 0Z\" fill=\"var(--art-clay-deep,#C25626)\" fill-rule=\"evenodd\"/>\n<path d=\"M103.8 71.3c3.7 2.6 7 6.3 10.4 9.5 4.4 4.2 8.8 8.4 13.2 12.5 1.1 1 7.7 6.8 7.7 7.7l.5 21.5 3.3 0-.2 39.9-3.2-.1c-.5 .5-.3 .6-.9 .9-.8 .4-10.6 0-12.2 0 0-17.8 0-35.7 0-53.5 0-4.5 0-9 0-13.5 0-.9 .2-4.4-.3-5l-18.3-19.9Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M159.9 134.5c1.9-2.5 4.4-5.7 7.3-7 4.2-2 7.7 .5 10.7 3.4 1.4 1.5 2.7 2.9 3.3 4.9 .9 3 .4 6.6 .4 9.7 0 4.1 .6 7.2-3.5 9.7-1.9 1.2-7.1 .6-9.5 .6-5.1 0-5 .4-8.7-3.2-3.6 3.6-3.6 3.2-8.6 3.2-2.4 0-7.7 .6-9.6-.6-4-2.5-3.5-5.6-3.5-9.7 0-3.1-.5-6.8 .3-9.7 .6-2 2-3.4 3.5-4.8 2.8-2.9 5.9-5.4 10.1-3.7 3.1 1.2 5.8 4.7 7.8 7.2Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M100.4 82.3c8.1 .1 14.5 6.9 14.3 15.1-.1 8.2-6.8 14.8-14.9 14.6-8.1-.2-14.5-6.9-14.4-15.2 .2-8.2 6.9-14.7 15-14.5ZM100.5 84.6c6.8 .2 12.2 6 11.9 12.9-.2 6.9-5.9 12.4-12.7 12.2-6.8-.2-12.2-6-12-13 .2-6.9 5.9-12.3 12.8-12.1ZM100 85.3c.3 .6 1 1.9 1.3 2.7 .4 1.4 0 6 0 7.7 1.3-.3 6.1-2 7.1-1.8 .7 .1 2.3 .8 2.6 .9-3.6 2.1-7.7 2.7-11.8 3.8-.2-2-.6-8.7-.2-10.5 .3-.9 .7-2.1 1-2.8ZM135.4 121.7l51 0 .2 41.5-51.3 0 .1-41.5ZM141.7 152.3l15.5 0-.4-16.3c0-.8-.7-1.8-1.2-2.4-2.9-4.3-9.3-4.4-12.4-.2-.7 .9-1.1 1.8-1.3 2.9-.4 1.8-.2 3.9-.2 5.7 0 3.5 0 6.9 0 10.3ZM162.7 152.3l15.4 0c0-4.3 .9-14.7-1.1-18.2-3.1-5.4-11.3-4.9-13.7 .9-1.2 3-.6 13.5-.6 17.3Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "1bf719314e";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [GROUND, DARK, PAPER, CLAY, CLAY_DEEP, PAPER_DEEP, SUNLIT, INK] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const fill = (t) => `fill="${paint(t)}"`;
const C = parsePath(CLAY.d), K = parsePath(INK.d);
const ev = (runs, c, extra = "") => `<path d="${runsToDc(runs)}" ${fill(c)} fill-rule="evenodd"${extra}/>`;
const FLAG = subdivide([C[0]], 3), ROOF = runsToDc([C[1]]), DOOR = runsToDc([C[2]]);
const HANDS = runsToDc([K[2]]), CLOCK = [100, 97];
const clips = `<clipPath id="mh"><rect x="94" y="78" width="12" height="20"/></clipPath><clipPath id="hh"><rect x="100.6" y="90" width="16" height="13"/></clipPath>`;
// The flag, waving out from its pole (a ripple that grows toward its free end), or hanging limp down the pole.
const POLE = [103, 24];
const flag = (wave, t, hang = 0) => runsToDc(FLAG, (x, y) => {
  const d = Math.max(0, x - POLE[0]), w = wave * Math.sin(d * 0.25 - t * 14) * (d / 32);
  if (!hang) return [x, y + w];
  // Limp: its edge stays on the pole, and the further out a point is the more it falls in toward the pole and down; a few folds down its length.
  const dx = x - POLE[0];
  return [POLE[0] + dx * (1 - 0.8 * hang) + 1.6 * hang * Math.sin(y * 0.5), y + dx * 0.9 * hang];
});
// Everything but the flag, the door and the hands, in the still's order.
const scene = (flagD, door, hands, extra = "") => `${GROUND.svg}${DARK.svg}${PAPER.svg}<path d="${flagD}" ${fill("clay")}/><path d="${ROOF}" ${fill("clay")}/>${door}`
  + `${CLAY_DEEP.svg}${PAPER_DEEP.svg}${SUNLIT.svg}${ev([K[0], K[1], K[3], K[4], K[5]], "ink")}${hands}${extra}`;
const hands = (minute, hour) => `<g transform="rotate(${n4(minute)} ${CLOCK[0]} ${CLOCK[1]})"><path d="${HANDS}" ${fill("ink")} clip-path="url(#mh)"/></g>`
  + `<g transform="rotate(${n4(hour)} ${CLOCK[0]} ${CLOCK[1]})"><path d="${HANDS}" ${fill("ink")} clip-path="url(#hh)"/></g>`;

// ---- happy.
// A paper plane: a dart, its far half in shade, pointing the way it flies.
const plane = (x, y, ang, s = 1) => `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(ang)}) scale(${n4(s)})"><polygon points="9,0 -9,-6 -5,0 -9,6" ${fill("paper")}/><polygon points="9,0 -5,0 -9,6" ${fill("paper-deep")}/></g>`;
// Each: where it comes out, when, how fast across and up, how it sinks (less than gravity: it glides).
// All of them out of the open doorway (x 82 to 118, hinged on the left; at the first one's moment it's open from about x 95): thrown from inside the hall,
// none through the windows' glass.
const PLANES = [[108, 146, 0.62, 150, 190, 150], [104, 140, 0.76, -60, 170, 130], [112, 142, 0.86, 90, 180, 170], [102, 148, 0.98, -120, 150, 110], [110, 136, 1.12, 40, 200, 160]];
const HAPPY_DUR = 2.2;
function happy(t) {
  if (t <= 0) return STILL;
  // It's home time on the clock already. No ringing marks and no shaking clock: a school's wall clock doesn't ring, and drawn marks for a sound are a
  // stock effect. The door and the planes are the story.
  const ring = 0, rings = "";
  // The door swings in on its left hinge, darkening as it turns from the light; the hall behind is dark.
  const open = track([[0.42, 0], [0.7, 1, "out"]], t), k = Math.cos(open * 1.3), dark = Math.max(0, Math.min(1, (open - 0.3) / 0.4));
  const door = open <= 0 ? `<path d="${DOOR}" ${fill("clay")}/>` : `<path d="${DOOR}" ${fill("ink-lit")}/><g transform="translate(82 0) scale(${n4(Math.max(0.08, k))} 1) translate(-82 0)"><path d="${DOOR}" ${fill("clay")}/>${dark > 0 ? `<path d="${DOOR}" ${fill("clay-deep")}${dark < 1 ? ` opacity="${n2(dark)}"` : ""}/>` : ""}</g>`;
  // The planes: out at speed, gliding in arcs, turned along their flight.
  let planes = "";
  for (const [x0, y0, at, vx, vy, sink] of PLANES) {
    const s = t - at;
    if (s <= 0) continue;
    const x = x0 + vx * s, y = y0 - vy * s + 0.5 * sink * s * s, ang = (Math.atan2(-vy + sink * s, vx) * 180) / Math.PI;
    if (x < -20 || x > 220 || y < -20) continue;
    // far inside the dark hall it's tiny; it grows to its size as it comes out of the doorway toward us
    planes += plane(x, y, ang, 0.06 + 0.94 * Math.min(1, s / 0.25));
  }
  const wave = track([[0.1, 0], [0.5, 4, "out"]], t);
  return `${OPEN}${clips}${BG}${scene(flag(wave, t), door, hands(ring, ring * 0.6), rings)}${planes}</svg>`;
}

// ---- sad. Backwards: the minute hand unwinds, hours of it, slowing; the hour hand goes back from three to eight. The flag gives up.
const SAD_DUR = 2.3;
function sad(t) {
  if (t <= 0) return STILL;
  const back = track([[0.15, 0], [1.5, 1, "out"]], t);
  const minute = -360 * 7 * back, hour = -210 * back;
  const hang = track([[0.6, 0], [1.6, 1, "io"], [1.72, 0.94, "io"], [1.82, 1, "io"]], t);
  return `${OPEN}${clips}${BG}${scene(flag(0, t, hang), `<path d="${DOOR}" ${fill("clay")}/>`, hands(minute, hour))}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
