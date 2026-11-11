// Money's two stories. Happy: coins drop from above the picture onto the stack, one, two, three, each landing with a bounce and a wobble; the stack's
// taller. Sad: a gust from the left. The note shivers against the coins, lifts, and tumbles away up and out of the picture. The coins are all that's left.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view; the note's hidden parts (behind the coins, under its
// corners) are drawn again so it can leave whole.
import { n2, n4, paint, parsePath, partsOf, runsToD, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M133.1 54l3.9 4c-.5 4-.8 8.1-1.3 12.1-.2 1.5-.2 3.1-.6 4.4-.3 1-2.9 4.2-3.9 4.3l-18.6 2.2-3.9-3.9c.3-3 1.1-15.3 2.3-17.1 .7-1.3 2.4-2.9 3.7-3.5 1.6-.6 3.7-.6 5.4-.8 4.3-.5 8.7-1.1 13-1.7ZM44.7 65.6l3.9 3.9-2 16.2c-.1 .9-3.3 3.5-4.1 3.8-1.6 .5-3.5 .5-5.2 .6-3.6 .4-7.2 .7-10.8 1.1l-3.9-4 2-15.9c.2-.8 3.3-3.4 4.2-3.7 1.5-.5 3.3-.5 4.9-.7 3.6-.4 7.3-.9 11-1.3ZM38.2 127.6l3.7 3.8-1.4 16.8-2.3 2.3 52.3 .2c.1-2.3 .5-10.2 1.3-11.8 .8-1.4 2.5-2.7 3.6-3.8l10 0c1.1 1.1 2.9 2.4 3.5 3.9 .5 1.3 .4 12.1-.1 13.3-.9 1.9-3.1 3.3-5 3.9l84.8 44.4c1.1 .6 2.9 2.9 3.8 3.8l-196.8 0 0-50.9 17.9 0 .3-3.2 5 0-2.3-2.3c.2-2.9 .8-14.2 1.7-16.1 .7-1.6 2.6-2.9 3.7-4.1l16.3-.2ZM177.5 150.4l0 3.1 26.9 0 0 16.4c-5.2-2.3-10.3-5-15.4-7.4-3.5-1.7-8.1-3.4-11.1-5.6-1.3-.9-2.4-2.2-3.6-3.3l3.2-3.2Z\" fill=\"var(--art-teal-lit,#6FD0BD)\" fill-rule=\"evenodd\"/>\n<path d=\"M177.5 150.1l0 3.2 26.9 13.1 0 38-16 0c-.1-.2 0-.6-.2-.7l-95.1-49.5c-.3-.2-1.6-.1-1.9-.2 .6-.6 1.2-1.2 1.9-1.8 1.4 .2 11.2 .6 12 .2 .4-.2 .8-.8 1-1 .9 .9 1.8 1.9 3 2.7 4.5 3.1 10.7 4.1 16 4.9 13.3 2.1 28.9 2 41.8-2 2-.7 4.3-1.3 6-2.5 1.7-1.1 3.1-3 4.6-4.4Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M144.6 50c-.1 .3-.6 1.4-.6 1.8l-1.9 17.7c-.2 2.5-1.8 6.2-2.6 8.6-1.9 6.5-3.9 13.1-5.9 19.6-1 3.1-1.4 5.2-3.8 7.6-.3 .2-.8 .9-1.2 1l-14 3.6c-1.9 .5-3.7 1.5-5.4 2.4l-.1 25.7-2.3 2.2c-.3-.5-.4-1.1-.7-1.7l-11 .1-1.5 13.9 12.4 .2c.5-.7 .4-1.3 .7-2l2.7 2.6c-.7 .7-1.4 1.3-2 1.9-.5-.3-.9-.8-1.4-1.3-.2 .1-.4 .3-.6 .3l-91.9-.4 9.3-86.6 121.8-17.2ZM114 59.9l-1.8 17.7 19.4-2 2-18.1-19.6 2.4ZM27.7 71.1l-1.7 16.7 17.4-1.8 1.8-17-17.5 2.1ZM88.7 78.7c14.1 6.2 20.3 23.3 13.8 38.4-6.5 15-23.3 22.2-37.4 16-14.2-6.1-20.4-23.3-13.9-38.3 6.6-15 23.3-22.2 37.5-16.1ZM83.7 85.3c10.6 3.6 16.1 15.8 12.2 27.2-3.8 11.4-15.6 17.7-26.3 14.1-10.7-3.7-16.2-15.9-12.3-27.3 3.9-11.4 15.7-17.6 26.4-14ZM21.6 131.3l-1.6 17 17 .2 1.5-17.4-16.9 .2Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M144.6 49.3l-3.3 53.2-13 .9 16.3-54.1Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M105.7 113.4L105.7 153.5C105.7 159.6 121.8 164.5 141.6 164.5C161.4 164.5 177.5 159.6 177.5 153.5L177.5 113.4Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M105.7 126.6C105.7 132.7 121.8 137.6 141.6 137.6C161.4 137.6 177.5 132.7 177.5 126.6C177.5 133.6 161.4 139.3 141.6 139.3C121.8 139.3 105.7 133.6 105.7 126.6ZM105.7 139.8C105.7 145.9 121.8 150.8 141.6 150.8C161.4 150.8 177.5 145.9 177.5 139.8C177.5 146.8 161.4 152.5 141.6 152.5C121.8 152.5 105.7 146.8 105.7 139.8Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<ellipse cx=\"141.6\" cy=\"113.4\" rx=\"35.9\" ry=\"11\" fill=\"var(--art-sun,#F7BE45)\"/>\n</svg>\n";
export const STILL_HASH = "6762c3e815";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [LIT, SHADOW, NOTE, CURL, BODY, RIMS] = partsOf(STILL);
const TOP = /<ellipse [^>]*\/>/.exec(STILL)[0];
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const fill = (t) => `fill="${paint(t)}"`;
const litRuns = parsePath(LIT.d), noteRuns = parsePath(NOTE.d);
// The note's own: its top corners' squares, its ring, and the two bottom squares, which the still keeps in the table's run.
const SQUARES = `${runsToD([litRuns[0], litRuns[1]])}M38.2 127.6L41.9 131.4L40.5 148.2L38.2 150.5L18.8 150.3L16.5 148L18.2 131.9L21.9 127.8ZM91.8 138.9L95.4 135.1L105.4 135.1L108.9 139L108.8 152.3L90.5 150.7Z`;
const RING = runsToD([noteRuns[3], noteRuns[4]]);
// Behind the coins: the rest of the note, down to its foot.
const HIDDEN = "M105.6 101.7L128.3 103.4L123.6 153.8L105.6 153.8Z";
const note = `<path d="${HIDDEN}" ${fill("paper")}/><path d="${SQUARES}" ${fill("teal-lit")}/><path d="${RING}" ${fill("teal")} fill-rule="evenodd"/>${NOTE.svg}${CURL.svg}`;
// The table, whole: its back edge is at 153.5; the still's piece is kept below that line, where the squares aren't.
const TABLE = `<rect y="153.5" width="200" height="46.5" ${fill("teal-lit")}/><g clip-path="url(#tb)">${LIT.svg}</g>`;
const tableClip = `<clipPath id="tb"><rect y="153.5" width="200" height="47"/></clipPath>`;
const STACK = `${BODY.svg}${RIMS.svg}${TOP}`;
const decay = (t, at, amp, hz, k) => (t <= at ? 0 : amp * Math.sin(2 * Math.PI * hz * (t - at)) * Math.exp(-k * (t - at)));

// ---- happy. A coin, as the stack's are drawn: its side, the bright rim at its foot, its face.
const CX = 141.6, RX = 35.9, RY = 11, STEP = 13.2;
const RIM = "M105.7 126.6C105.7 132.7 121.8 137.6 141.6 137.6C161.4 137.6 177.5 132.7 177.5 126.6C177.5 133.6 161.4 139.3 141.6 139.3C121.8 139.3 105.7 133.6 105.7 126.6Z";
function coin(top, tilt = 0) {
  const y = top + STEP;
  return `<g transform="rotate(${n4(tilt)} ${CX} ${n2(top + 6)})"><path d="M${n2(CX - RX)} ${n2(top)}L${n2(CX - RX)} ${n2(y)}A${RX} ${RY} 0 0 0 ${n2(CX + RX)} ${n2(y)}L${n2(CX + RX)} ${n2(top)}Z" ${fill("sun-deep")}/>`
    + `<path d="${RIM}" transform="translate(0 ${n2(y - 126.6)})" ${fill("sun")}/><ellipse cx="${CX}" cy="${n2(top)}" rx="${RX}" ry="${RY}" ${fill("sun")}/></g>`;
}
// (gravity for the falling coins: each lands at about 7 units a frame, covering the coin below over a few frames; at 1400 it landed at 10 and the
// face under it went in one frame)
const G = 700;
const DROPS = [0.5, 0.82, 1.12]; // when each lands; each falls from rest above the picture, so the first starts after the tap
const HAPPY_DUR = 2.15;
function happy(t) {
  if (t <= 0) return STILL;
  let coins = "", clinks = "";
  DROPS.forEach((land, i) => {
    // (from: the coin's top when it lets go, far enough above the picture that the whole coin starts out of sight)
    const rest = 113.4 - STEP * (i + 1), from = -50, fall = Math.sqrt((2 * (rest - from)) / G), s = t - (land - fall);
    if (s <= 0) return;
    // Falling from rest under gravity, tipping a little; on the stack, a bounce and a wobble.
    let top, tilt;
    if (t < land) { top = from + 0.5 * G * s * s; tilt = -10 * (1 - s / fall) + 4; }
    else { top = rest - track([[0, 0], [0.05, 2.4, "out"], [0.11, 0, "in"]], t - land); tilt = decay(t, land, 3, 7, 9); }
    coins += coin(top, tilt);
  });
  // No clink marks and no glint: a coin's landing is its bounce and wobble on the stack, and the stack is simply taller. (Drawn marks for a sound, and
  // a bar of shine sweeping across, are stock effects, not things that happen.)
  const glint = "";
  const stackClip = `<clipPath id="st"><path d="M105.7 ${n2(113.4 - STEP * 3)}L105.7 153.5A${RX} ${RY} 0 0 0 177.5 153.5L177.5 ${n2(113.4 - STEP * 3)}Z"/><ellipse cx="${CX}" cy="${n2(113.4 - STEP * 3)}" rx="${RX}" ry="${RY}"/></clipPath>`;
  return `${OPEN}${stackClip}${BG}${LIT.svg}${SHADOW.svg}${NOTE.svg}${CURL.svg}${STACK}${coins}${glint}${clinks}</svg>`;
}

// ---- sad. Gusts from the left: streaks of air. The note shivers against the coins, then the big one takes it: up, over, turning and flipping, and out.
const GO = 0.62;
const SAD_DUR = 2.2;
function sad(t) {
  if (t <= 0) return STILL;
  // The gust shows in what it does to the note, never as drawn lines: air can't be seen.
  const wind = "";
  // Before it goes: shivering about its foot. Then it's off: an arc up and to the right, turning, flipping over and over, smaller as it goes.
  let tr;
  if (t < GO) {
    // Growing, then easing to nothing just as it lifts, so it leaves from where it is.
    const shiver = t > 0.14 ? Math.sin(2 * Math.PI * 9 * (t - 0.14)) * 3.4 * Math.sin((Math.PI * (t - 0.14)) / (GO - 0.14)) : 0;
    tr = `rotate(${n4(shiver)} 60 154)`;
  } else {
    const s = t - GO;
    // (a steady tumble, slow enough that it's seen going out over the top: it flips about once a second and turns a little, so its far edge never
    // whips out of the picture between two frames)
    const x = 60 + 120 * s + 20 * s * s, y = 100 - 125 * s + 12 * s * s, rot = 35 * s + 40 * s * s;
    const flip = Math.cos(2 * Math.PI * 0.95 * s), k = 1 - 0.25 * Math.min(1, s / 0.8);
    tr = `translate(${n2(x)} ${n2(y)}) rotate(${n4(rot)}) scale(${n4(flip * k)} ${n4(k)}) translate(-60 -100)`;
  }
  const gone = t > GO + 1.2;
  return `${OPEN}${tableClip}${BG}${TABLE}${SHADOW.svg}${gone ? "" : `<g transform="${tr}">${note}</g>`}${STACK}${wind}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
