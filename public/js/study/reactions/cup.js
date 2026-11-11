// The cup's two stories. Happy: a cookie comes rolling in on its edge, hops the saucer's lip, and comes to rest leaning on the cup. Sad: it's gone cold. Frost
// creeps up the cup and saucer from the table, icicles grow from the rim, and the cup gives a shiver. It stays frozen.
// Every frame is a pure function of t, in seconds. The cup and saucer are the still's own paths.
import { n2, n4, paint, partsOf, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M16.9 144c.8 .5 1.3 .9 2 1.6-4.7 7.2-4.6 14.8 1.9 20.9 2.2 2.1 4.9 3.5 7.3 5.2 1.9 1.4 3.5 3 5.5 4.4 6.2 4.3 13.1 8 20 11.2l19.1 9.1c2.7 1.2 5.7 2.1 8.1 3.8 1.7 1.1 3.1 2.8 4.5 4.2l-89.7 0 0-58.9 19.8 0c.5-.4 1-1 1.5-1.5ZM165.8 144c.6 .4 1.1 1 1.6 1.5l37 0 0 37.8-35.8-16.5c-1.4-.6-2.7-2.4-3.7-3.5 3.7-6.7 3.2-11.3-.9-17.6 .6-.6 1.2-1.1 1.8-1.7Z\" fill=\"var(--art-violet-lit,#A68CFF)\" fill-rule=\"evenodd\"/>\n<path d=\"M168.6 159.6c1 1.9 .8 1.9-.2 3.7l36 16.5 0 24.6-122.6 0c-.3-.2-1-.8-1.4-1l-23.3-10.8c-7.9-3.8-16.1-7.9-23.3-12.9-2.4-1.6-4.5-3.6-6.8-5.3 .7-.7 1.4-1.4 2.1-2.1 4 2.1 8.1 4.1 12.4 5.6 18.2 6.6 38.6 8.1 57.8 7.2 20-.9 41.8-3.9 58.7-15.3 4.2-2.9 7.1-6.7 10.6-10.2Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M143.9 87.7c-1.4 1.3-2.6 2.7-4.1 3.9-8 6-19 7.6-28.5 9.3-1.7 23.2-8.4 47.6-25.3 64.5 3.9 .3 5.9 1.5 9.5 2.7 3.2 1.1 6.5 2.1 9.8 2.7 13.6 2.8 28 .7 40.3-5.8 7.2-3.8 17.6-10.7 13.7-20.4-.9-2.1-2.3-3.8-3.7-5.5 2.1-1.1 2-.3 4-.2 .2 .1-.3-.2-.5-.3 0-.1 .2 .1 .2 .1 .2 .1 .3 .2 .5 .3 .4 .3 .8 .5 1.2 .8 1.2 .9 2.4 1.8 3.5 2.8 1.7 1.5 3.1 3.2 4.3 5.1 10.4 17.4-18.2 30.9-30.8 34.8-27.9 8.8-71.5 8.9-98.8-2-10.6-4.2-29.4-14.1-26.9-28.1 2.1-12.1 20.9-19.8 31.3-23-5.1-11.8-8.8-24.3-9.5-37.2-.3-4.4-.9-10 1.7-13.9 4.6-6.8 15.8-9.8 23.4-11.4 19.6-4.1 42.1-4 61.7 0 6.6 1.4 20.6 5 23.1 12 .6 1.7-.1 6.6-.1 8.8ZM44.3 83c16.9 9.3 49.3 8.9 68.1 5.8 4.8-.8 17.2-3.2 20.7-6.3 .6-.5 .9-1.2 1.3-1.8-19.1-8.8-46.4-9.2-66.9-6.1-5.6 .8-17.2 3-21.5 6.4-.7 .6-1.2 1.4-1.7 2Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M137.4 81.2c.1 6.9-21.4 12.8-48 13.1-26.7 .4-48.3-5-48.4-11.9-.1-6.8 21.4-12.7 48.1-13 26.6-.4 48.2 5 48.3 11.8ZM156.1 134.1c.6 .5 1.1 1 1.6 1.5-.4 .5-.9 .9-1.4 1.4 1.6 .9 2.9 2.3 4.1 3.7 9.1 11.3-4.1 21.7-13.3 26.9-18.6 10.6-37.6 9.7-56.9 1.9-.1-.2 .1-.4 .1-.7-.1-.3-1.4-.9-1.5-1 .6-.7 1.3-1.5 2.1-1.9 1.9-1 5.8-.7 8-1 4.7-.8 9.3-2.2 13.4-4.4 4.3-2.4 6.3-5.9 9.1-9.7 2.5-3.3 5.6-6.9 9.1-9.2 4.6-3.1 11.2-3.1 16.4-4.4 3.2-.8 6.2-2 9.2-3.1Z\" fill=\"var(--art-paper-deep,#DAD1BC)\" fill-rule=\"evenodd\"/>\n<path d=\"M144.7 81l0 6.4c4.1-1.3 8.3-2.4 12.7-2.1 21.7 1.6 24.2 23.4 14.3 38.8-5.5 8.5-14.5 13.9-24.2 16.4-5 1.4-10.9 1.5-15.6 3.8-6.9 3.4-9.6 11.9-15.3 16.8-10 8.5-25.5 8.7-37.8 6.9 2.3-1.6 4.6-3.4 6.5-5.4 14.5-15.1 22.5-44.1 22.5-64.6 10.1-1.7 28.1-4.1 34.7-12.6 1.1-1.3 1.6-2.8 2.2-4.4ZM135.7 128c.8 .4 1.5 1 2.4 1.2 5.9 1.9 15.2-3.1 19.3-7.2 2.2-2.2 4-4.9 5.1-7.9 1.7-4.5 1.8-10.4-2.1-13.8-4.6-4.1-11.9-2-15.6 2.2-3.5 4-4 10.1-5.5 15-1 3.6-2.2 7-3.6 10.5Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "8206d0424e";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [TABLE, SHADOW, PAPER, DEEP, INK] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const fill = (t) => `fill="${paint(t)}"`;
const decay = (t, at, amp, hz, k) => (t <= at ? 0 : amp * Math.sin(2 * Math.PI * hz * (t - at)) * Math.exp(-k * (t - at)));

// ---- happy. The cookie: golden, a rim darker on the side away from the light, a lit edge toward it, chocolate chips. It rolls, so its chips turn with it.
const R = 17;
function cookie(x, y, spin, tilt = 0) {
  let chips = "";
  for (const [a, d, r] of [[20, 7, 2.6], [130, 8, 2.2], [230, 6, 2.8], [310, 9, 2], [80, 2, 1.9]]) {
    const ang = ((a + spin) * Math.PI) / 180;
    chips += `<circle cx="${n2(x + Math.cos(ang) * d)}" cy="${n2(y + Math.sin(ang) * d)}" r="${r}" ${fill("bark-deep")}/>`;
  }
  return `<g transform="rotate(${n4(tilt)} ${n2(x)} ${n2(y + R)})"><circle cx="${n2(x)}" cy="${n2(y)}" r="${R}" ${fill("wood-deep")}/><circle cx="${n2(x - 1.6)}" cy="${n2(y - 1.6)}" r="${R - 1.4}" ${fill("wood")}/>`
    + `<path d="M${n2(x - 12.5)} ${n2(y + 2)}A13 13 0 0 1 ${n2(x + 2)} ${n2(y - 12.5)}" fill="none" stroke="${paint("sun-lit")}" stroke-width="1.8" stroke-linecap="round"/>${chips}</g>`;
}
const HAPPY_DUR = 2.2;
function happy(t) {
  if (t <= 0) return STILL;
  // Rolling in along the table from the left (its spin is its travel over its radius), slowing; a hop over the saucer's lip, a parabola; a skid, and it tips
  // back onto the cup and settles there.
  const ROLL = [[0.06, -24], [0.7, 16, "out"]], HOP0 = 0.7, HOP1 = 1.04;
  let x, y, spin, tilt = 0;
  if (t < HOP0) { x = track(ROLL, t); y = 176; spin = ((x + 24) / R) * (180 / Math.PI); }
  else if (t < HOP1) {
    const s = (t - HOP0) / (HOP1 - HOP0), T = HOP1 - HOP0, g = 700, vy = (176 - 135 + 0.5 * g * T * T) / T;
    x = 16 + 18 * s; y = 176 - vy * (t - HOP0) + 0.5 * g * (t - HOP0) ** 2; spin = (40 / R) * (180 / Math.PI) + 160 * s;
  } else {
    const s = t - HOP1;
    x = 34 + track([[0, 0], [0.12, 2.5, "out"], [0.3, 1.5, "io"]], s); y = 135 - track([[0, 0], [0.06, 2, "out"], [0.12, 0, "in"]], s);
    spin = (40 / R) * (180 / Math.PI) + 160 + 30 * Math.min(1, s / 0.3); tilt = track([[0.1, 0], [0.34, 9, "out"], [0.46, 7, "io"], [0.56, 8, "io"]], s);
  }
  // Its shadow: on the table while it rolls, on the saucer once it's up.
  const ground = t < HOP0 ? 191 : t < HOP1 ? 191 - (191 - 152) * ((t - HOP0) / (HOP1 - HOP0)) : 152;
  const h = Math.max(0, ground - (y + R)), k = 1 - Math.min(1, h / 50);
  const shadow = `<ellipse cx="${n2(x + 4 + h * 0.2)}" cy="${n2(ground)}" rx="${n2(13 * (0.6 + 0.4 * k))}" ry="${n2(2.6 * k + 0.4)}" ${fill(x > 18 ? "paper-deep" : "violet-deep")}/>`;
  return `${OPEN}${BG}${TABLE.svg}${SHADOW.svg}${PAPER.svg}${DEEP.svg}${INK.svg}${shadow}${cookie(x, y, spin, tilt)}</svg>`;
}

// ---- sad. Frost: the same shapes in ice colors, revealed from the table up behind a ragged edge. Icicles from the rim's front edge, growing.
const ICICLES = [[52, 88.5, 9], [66, 92, 13], [80, 93.8, 10], [95, 94.2, 15], [110, 93, 9], [124, 89.5, 12]];
const SAD_DUR = 2.5;
function sad(t) {
  if (t <= 0) return STILL;
  const rise = track([[0.12, 0], [1.25, 1, "io"]], t), top = 196 - 140 * rise;
  let edge = `M-5 205L-5 ${n2(top)}`;
  for (let x = 0; x <= 205; x += 12.5) edge += `L${x} ${n2(top + 5 * Math.sin(x * 0.21 + t * 5) + (x % 25 ? 3 : 0))}`;
  edge += "L205 205Z";
  const frost = rise <= 0 ? "" : `<clipPath id="fr"><path d="${edge}"/></clipPath><g clip-path="url(#fr)"><path d="${PAPER.d}" ${fill("sky-pale")} fill-rule="evenodd"/><path d="${DEEP.d}" ${fill("sky-lit")} fill-rule="evenodd"/><path d="${INK.d}" ${fill("sky-deep")} fill-rule="evenodd"/></g>`;
  let ice = "";
  for (const [x, y, len] of ICICLES) {
    const g = track([[1.0 + (x % 7) * 0.03, 0], [1.6 + (x % 5) * 0.04, 1, "out"]], t);
    if (g <= 0) continue;
    const L = len * g;
    ice += `<polygon points="${n2(x - 3.2)},${n2(y)} ${n2(x + 3.2)},${n2(y + 0.4)} ${n2(x + 0.4)},${n2(y + L)}" ${fill("sky-pale")}/><polygon points="${n2(x + 0.6)},${n2(y + 0.2)} ${n2(x + 3.2)},${n2(y + 0.4)} ${n2(x + 0.4)},${n2(y + L)}" ${fill("sky-lit")}/>`;
  }
  // The shiver, once it is frozen.
  const shiver = t > 1.7 && t < 2.15 ? 1.1 * Math.sin(2 * Math.PI * 19 * t) * Math.sin(((t - 1.7) / 0.45) * Math.PI) : 0;
  return `${OPEN}${BG}${TABLE.svg}${SHADOW.svg}<g transform="translate(${n2(shiver)} 0)">${PAPER.svg}${DEEP.svg}${INK.svg}${frost}${ice}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
