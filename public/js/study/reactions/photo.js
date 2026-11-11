// The photo's two stories. Happy: it's a keeper. It straightens up, and a wooden frame comes up from below, behind it, and settles round it. Sad: it fades. Its colors
// wash out to the browns of an old print, and a corner curls up off it.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own; its sun is a hole in the sky, so it shows whatever's behind.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M152.1 176.9c.6-5.2 .6-4.2 4.2-7.8l-.2 3.3 48.5 32-144.4 0-36.6-34.9 .2-3 128.3 10.4Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M45.5 22.9l116.5 10.7c.7 .1 3.4 3.1 4 3.6l-8.5 83.9c-.1 .7-2.9 3.2-3.4 3.7-4.6-4.6-8.5-9.8-12.4-14.9-4.9-6.5-9.8-12.9-14.7-19.4-6.1 7-12.1 14.1-18.7 20.7-1.4-1.4-2.9-2.7-4.1-4.2-3-3.6-5.4-7.8-8.1-11.6-4.9-7.2-9.8-14.3-14.8-21.4-8.5 10.5-17.3 20.9-26 31.3-6.4 7.9-12.6 16-19.8 23.2l-3.6-3.6c2.1-24.4 4.7-48.7 7.2-73 .6-5.7 1.1-11.5 1.7-17.2 .2-2.4 0-5.5 .9-7.6 .8-1.6 2.6-3 3.8-4.2ZM69.1 66.6c-7.3 1.3-14.3-3.7-15.6-11.1-1.3-7.3 3.6-14.4 10.9-15.6 7.3-1.3 14.3 3.6 15.6 11 1.3 7.4-3.6 14.4-10.9 15.7Z\" fill=\"var(--art-teal,#37B39B)\" fill-rule=\"evenodd\"/>\n<path d=\"M38.6 18.3l131.2 11.7-14.6 150.6-131.7-10.6 15.1-151.7ZM45.1 26.4l-9.7 99.3c.6-.4 1.2-.9 1.7-1.3 .6 .5 1.1 1 1.6 1.6l-1.2 11.7 110.8 9.2 2.7-24.7c.1-.6 1.1-1.3 1.5-1.6 .5 .5 1 1 1.6 1.3l8.4-85.1-117.4-10.4Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<polygon points=\"81.6,69.3 97.5,92.4 93.8,95.7 66.4,95.7 62.1,93\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<polygon points=\"127.3,86.3 141.4,104.9 136.7,107 115.2,107 111.3,104.5\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<polygon points=\"35.4,125 62.1,93 71.3,88.1 75.6,93.8 81.2,88.3 86.9,93.9 91,88.5 97.5,92.4 108.2,107.8 111.3,104.5 119.7,100.4 123,104.7 127.7,100.6 132.2,105.1 135.2,101 141.4,104.9 154.3,121.5 152,139.6 34.8,134.8\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M35 128.3C58.6 115.2 117.2 112.3 152.7 135.9L151.4 150.8L33.8 141Z\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n</svg>\n";
export const STILL_HASH = "3ab79496b4";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const ELS = [...STILL.matchAll(/<(path|polygon) [^>]*\/>/g)].map((m) => m[0]);
const [SHADOW, ...SCENE] = ELS;
// The sun is a hole in the sky: a disc of its own color goes behind, so the hole shows the sun whatever ends up behind the print.
const PRINT = [`<circle cx="66.75" cy="53.25" r="15" fill="${paint("sun")}"/>`, ...SCENE];
const fill = (t) => `fill="${paint(t)}"`;
const recolor = (svg, map) => svg.replace(/var\(--art-([a-z-]+),#[0-9A-Fa-f]{6}\)/g, (m, tok) => (map[tok] ? paint(map[tok]) : m));
const CENTER = [96.8, 99.7], TILT = 5.1;
const QUAD = [[38.6, 18.3], [169.8, 30], [155.2, 180.6], [23.5, 170]];

// ---- happy.
const HAPPY_DUR = 2.0;
function happy(t) {
  if (t <= 0) return STILL;
  const turn = -track([[0.1, 0], [0.42, TILT + 1.2, "out"], [0.55, TILT - 0.4, "io"], [0.64, TILT, "io"]], t);
  const rot = `rotate(${n4(turn)} ${CENTER[0]} ${CENTER[1]})`;
  // Straight, the print is 131.6 wide by 151.2 tall about its middle, square to the picture. A wooden frame (border b, its sides away from the light
  // darker) comes up from below the picture, behind the print, as it straightens, and settles round it with a small bump. The frame is a thing brought
  // in from outside the picture: it never grows out of nothing, and nothing glints across its glass.
  const x0 = CENTER[0] - 65.8, y0 = CENTER[1] - 75.6, x1 = CENTER[0] + 65.8, y1 = CENTER[1] + 75.6, b = 9;
  const rise = track([[0.3, 0], [1.0, 1, "io"]], t), settle = track([[1.0, 0], [1.08, -2.4, "out"], [1.18, 0, "io"], [1.24, -0.5, "out"], [1.3, 0, "io"]], t);
  const dy = 200 * (1 - rise) + settle;
  let frame = "";
  if (rise > 0) {
    const o = (v) => n2(v);
    const sx = b * 0.45, sy = b * 0.65; // its shadow on the wall
    frame = `<g transform="translate(0 ${n2(dy)})"><path d="M${o(x0 - b + sx)} ${o(y0 - b + sy)}H${o(x1 + b + sx)}V${o(y1 + b + sy)}H${o(x0 - b + sx)}Z" ${fill("sun-deep")}/>`
      + `<path d="M${o(x0 - b)} ${o(y0 - b)}H${o(x1 + b)}V${o(y1 + b)}H${o(x0 - b)}Z" ${fill("wood-deep")}/><path d="M${o(x0 - b)} ${o(y0 - b)}H${o(x1 + b)}L${o(x1)} ${o(y0)}H${o(x0)}V${o(y1)}L${o(x0 - b)} ${o(y1 + b)}Z" ${fill("wood")}/></g>`;
  }
  // The print's own shadow on the wall goes as the frame comes up behind it and covers that wall.
  const fade = 1 - Math.min(1, Math.max(0, (t - 0.75) / 0.25));
  return `${OPEN}${BG}${fade > 0 ? `<g transform="${rot}"${fade < 1 ? ` opacity="${n2(fade)}"` : ""}>${SHADOW}</g>` : ""}${frame}<g transform="${rot}">${PRINT.join("")}</g></svg>`;
}

// ---- sad. The faded print: the same shapes in an old print's colors, coming in over the fresh ones.
const OLD = { teal: "sun-lit", paper: "paper-deep", ink: "wood-deep", "ink-lit": "wood" };
const SAD_DUR = 2.4;
const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
function sad(t) {
  if (t <= 0) return STILL;
  const k = track([[0.1, 0], [1.5, 1, "io"]], t);
  // The bottom right corner lifts and curls over: the part of the print it was is gone (the backdrop shows), and its back lies folded across the print.
  const d = track([[0.9, 0], [1.4, 0.3, "out"], [1.5, 0.26, "io"], [1.6, 0.28, "io"]], t);
  let clip = "", flap = "";
  if (d > 0.002) {
    const C = QUAD[2], A = lerp(C, QUAD[3], d), B = lerp(C, QUAD[1], d);
    // C reflected over the fold line AB.
    const ax = B[0] - A[0], ay = B[1] - A[1], L = ax * ax + ay * ay, u = ((C[0] - A[0]) * ax + (C[1] - A[1]) * ay) / L, F = [A[0] + ax * u, A[1] + ay * u], R = [2 * F[0] - C[0], 2 * F[1] - C[1]];
    const pts = (ps) => ps.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
    clip = `<clipPath id="cn"><polygon points="${pts([QUAD[0], QUAD[1], B, A, QUAD[3]])}"/></clipPath>`;
    flap = `<polygon points="${pts([A, B, [R[0] + 2.5, R[1] + 3]])}" ${fill("sun-deep")} opacity="0.6"/><polygon points="${pts([A, B, R])}" ${fill("paper-deep")}/>`;
  }
  const print = PRINT.join("");
  const old = k > 0 ? `<g opacity="${n2(k)}">${recolor(print, OLD)}</g>` : "";
  const body = clip ? `<g clip-path="url(#cn)">${print}${old}</g>` : print + old;
  return `${OPEN}${clip}${BG}${SHADOW}${body}${flap}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
