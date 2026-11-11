// The heart's two stories. Happy: it beats, lub-dub, lub-dub, and settles a touch fuller. Sad: it breaks. A crack runs down it, zigzag, from the dip
// at the top to the point, and the two halves come apart and droop.
// Every frame is a pure function of t, in seconds. The shapes are the still's own: its outline, its shadow, its lit and shaded halves.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><g transform=\"translate(16 18)\"><path d=\"M100 170C60 138 24 110 24 72 24 46 44 28 66 28 80 28 92 36 100 50 108 36 120 28 134 28 156 28 176 46 176 72 176 110 140 138 100 170Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/></g><clipPath id=\"h\"><path d=\"M100 170C60 138 24 110 24 72 24 46 44 28 66 28 80 28 92 36 100 50 108 36 120 28 134 28 156 28 176 46 176 72 176 110 140 138 100 170Z\"/></clipPath><g clip-path=\"url(#h)\"><rect x=\"-99\" y=\"-99\" width=\"399\" height=\"399\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M100 50C112 86 112 130 100 170H180V20H100Z\" fill=\"var(--art-clay-deep,#C25626)\"/></g>\n</svg>\n";
export const STILL_HASH = "380f961bd3";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<g"));
const HEART = STILL.slice(STILL.indexOf("<g"), STILL.lastIndexOf("</svg>"));
const SHAPE = /<clipPath id="h"><path d="([^"]*)"/.exec(STILL)[1];
const fill = (t) => `fill="${paint(t)}"`;
const MID = [100, 100];
// A small heart, the same shape: for the ones that float up.
const small = (x, y, s, k) => `<g transform="translate(${n2(x)} ${n2(y)}) scale(${n4(s)}) translate(-100 -100)" opacity="${n2(k)}"><path d="${SHAPE}" ${fill("clay-lit")}/></g>`;

// ---- happy.
const HAPPY_DUR = 2.3;
function happy(t) {
  if (t <= 0) return STILL;
  // Two beats: a big one and a smaller one just after, twice; then it settles a touch bigger than it was.
  const s = track([[0.1, 1], [0.2, 1.12, "out"], [0.28, 1, "in"], [0.36, 1.07, "out"], [0.46, 1, "in"], [0.75, 1], [0.85, 1.12, "out"], [0.93, 1, "in"], [1.01, 1.07, "out"], [1.11, 1, "in"], [1.4, 1.04, "io"]], t);
  // No little hearts floating up off it: that's the stock emoji effect. The beat is the story.
  const floats = "";
  return `${OPEN}${BG}<g transform="translate(${MID[0]} ${MID[1]}) scale(${n4(s)}) translate(${-MID[0]} ${-MID[1]})">${HEART}</g>${floats}</svg>`;
}

// ---- sad.
const ZIG = [[100, 50], [91, 72], [107, 93], [93, 115], [106, 137], [97, 154], [100, 170]];
const SPLIT = 0.85;
// It winces as it cracks, drawing in a little, so its halves have room to part inside the picture.
const wince = (t) => { const k = track([[0.3, 1], [0.8, 0.84, "io"]], t); return `translate(100 106) scale(${n4(k)}) translate(-100 -106)`; };
const SAD_DUR = 2.3;
function sad(t) {
  if (t <= 0) return STILL;
  // The crack runs down it, quickly, as a dark line.
  const run = track([[0.2, 0], [0.62, 1, "out"]], t);
  const zig = ZIG.map(([x, y]) => `${x} ${y}`).join(" L");
  if (t < SPLIT) {
    const crack = run > 0 ? `<path d="M${zig}" fill="none" stroke="${paint("ink")}" stroke-width="3" stroke-linejoin="round" stroke-dasharray="${n2(150 * run)} 200"/>` : "";
    const shiver = t > 0.62 && t < SPLIT ? Math.sin(2 * Math.PI * 18 * t) * 0.8 : 0;
    return `${OPEN}${BG}<g transform="translate(${n2(shiver)} 0) ${wince(t)}">${HEART}${crack}</g></svg>`;
  }
  // Apart: each half turns away about the point, a jolt out, then they sag lower; a dark edge on each broken side.
  const q = t - SPLIT;
  const a = track([[0, 0], [0.12, 13, "out"], [0.3, 9, "io"], [0.9, 15, "io"]], q), dx = track([[0, 0], [0.12, 9, "out"], [0.3, 7, "io"]], q), drop = track([[0.2, 0], [1.0, 8, "io"]], q);
  const left = `M-20 -20H100L${zig}L100 220H-20Z`, right = `M220 -20H100L${zig}L100 220H220Z`;
  // Each half has its own copy of the heart, so each copy has its own clip id.
  const half = (clip, sign) => `<g transform="translate(${n2(sign * dx)} ${n2(drop)}) rotate(${n2(sign * a)} 100 170)"><g clip-path="url(#${clip})">${HEART.replace(/id="h"/, `id="${clip}h"`).replace(/url\(#h\)/, `url(#${clip}h)`)}</g>`
    + `<path d="M${zig}" fill="none" stroke="${paint("clay-deep")}" stroke-width="3.4" stroke-linejoin="round" clip-path="url(#${clip})"/></g>`;
  return `${OPEN}<clipPath id="hl"><path d="${left}"/></clipPath><clipPath id="hr"><path d="${right}"/></clipPath>${BG}<g transform="${wince(t)}">${half("hl", -1)}${half("hr", 1)}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
