// Bad's two stories, the burnt toast's own: it's still smoking. Happy: it cools: the smoke's source dies, and the two columns lift off the
// toast, thinning as they rise, and drift up out of the frame, leaving it quiet on its plate. Sad: it's still smouldering: the char creeps
// out from its scorch patches, the patches running together until the top is nearly all black, the smoke thickening and a third column
// rising from the new char.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { blob, n2, paint, parsePath, runsToDc, subdivide, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect y=\"144\" width=\"200\" height=\"56\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<path d=\"M188.9,144A81,40 0 1 1 27.1,144Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<ellipse cx=\"96\" cy=\"143\" rx=\"81\" ry=\"40\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<ellipse cx=\"96\" cy=\"140\" rx=\"81\" ry=\"40\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M100,151.5L121.1,158.3Q125,159 128.1,156.4L156,133.4C159,132.6 162.6,133 164.4,131.4C165.6,130.3 165.7,124 165.6,119L156,113Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M37.1,129.4L65,106.2C63,104.6 62.4,102.6 64.4,100.6C68.5,96.5 78,96.6 90,97.4C112,98.8 136,103.5 150.5,110C154.1,111.6 156.4,114 156.4,116.1L156.4,125C156.4,126 156.1,126.8 155.4,127.4C153.6,129 150,128.6 147,129.4L119.1,152.4Q116,155 112.1,154.3L37.9,141.7Q36,141.5 35.8,140.5L35.8,131.5Q35.9,130.2 37.1,129.4Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/>\n<path d=\"M115.8,145.2Q117.6,144.7 119.1,143.4L147,120.4C150,119.6 153.6,120 155.4,118.4C156.1,117.7 156.5,117 156.4,116.1L156.4,125C156.4,126 156.1,126.8 155.4,127.4C153.6,129 150,128.6 147,129.4L119.1,152.4Q117.6,153.8 115.8,154.2Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M43.5,130.8Q40.5,130.3 42.8,128.4L66.6,108.5C65.6,106.8 65.2,104.8 67,103.2C70.8,99.6 79,99.4 90,100.2C111.5,101.6 134.5,106 148.2,112.4C152.2,114.2 154,116 152.4,117.4C150.8,118.6 148,117.8 145.4,117.9L117.6,141Q115.2,143 112.5,142.6Z\" fill=\"var(--art-bark,#7A4E2D)\"/>\n<path d=\"M86.5,121.8C86.2,117.4 92.8,115.2 99.6,115.2C104.8,115.2 108.2,116.4 113.2,115.2C119.6,113.6 127.4,114.8 128.2,119.2C128.8,122.4 125.2,123 126.2,125.6C127.2,128.6 121.6,130.6 116.2,129.4C112.8,128.6 110.2,130.8 105.4,130.6C99.4,130.4 97.6,127.4 93.2,127C89,126.6 86.7,124.8 86.5,121.8Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M58.4,126.4C58,123.2 62.4,121.6 67,122.4C70.2,123 71.6,121.4 74.6,122C78.4,122.8 78.6,126.6 75.6,128C73.4,129 74.4,131.2 70.6,131.6C67.2,132 65.6,130 62.2,129.8C59.8,129.6 58.6,128.4 58.4,126.4Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M80,111.4C80,109.6 83,108.8 85.6,109.2C88.2,109.6 89,111.4 87.4,112.4C85.6,113.4 80,113.4 80,111.4Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M99.5,116C93,106 88.5,98 92.5,88C96.5,78 106,72 105,58C104.4,48 99,40 94,32C102,38 110,48 110.6,58C111.4,73 101.6,80 98.6,89C96,97 99,106 101.5,116Z\" fill=\"var(--art-steel-deep,#6B687A)\"/>\n<path d=\"M116.4,117C112,110 110.6,103 114.6,96C118.4,89.4 124.4,85.6 124,76C123.8,70 121,66 117.6,62.4C123.6,65 128.6,70.4 128.8,77C129.2,86.4 121.2,91.6 119.6,98C118.2,103.6 116.4,110 118.4,117Z\" fill=\"var(--art-steel-deep,#6B687A)\"/>\n</svg>\n";
export const STILL_HASH = "f10afcfe19";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 14) throw new Error("bad: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
// the still's parts: the table, the plate and the toast's shadow on it; the toast (crust, its dark side, its top, the three scorch
// patches); the two smoke columns
const SETTING = EL.slice(0, 6).join(""), CRUST = EL[6] + EL[7], TOP = EL[8], PATCHES = EL.slice(9, 12).join("");
const dOf = (svg) => /d="([^"]+)"/.exec(svg)[1];
const TOP_D = dOf(EL[8]);
// the smoke: each column's outline, its foot (where it leaves the toast) and its height
const SMOKE = [{ runs: subdivide(parsePath(dOf(EL[12])), 2), foot: 116, top: 32, cx: 100 }, { runs: subdivide(parsePath(dOf(EL[13])), 2), foot: 117, top: 62.4, cx: 117 }];
// a column's sway: a wave running up it (smoke rising), its foot held, growing with height; widened about its own middle by w; lifted by up
const column = (s, t, amp, w = 1, up = 0, phase = 0) => runsToDc(s.runs, (x, y) => {
  const h = Math.max(0, Math.min(1, (s.foot - y) / (s.foot - s.top)));
  const xs = s.cx + (x - s.cx) * (1 + (w - 1) * (0.4 + 0.6 * h));
  return [xs + amp * h * Math.sin((y / 34) * 2 * Math.PI + t * 5.5 + phase), y - up];
});
const smoke = (d) => `<path d="${d}" ${fill("steel-deep")}/>`;
const sway = (t) => 2.6 * track([[0, 0], [0.5, 1, "io"]], t);

// ---- happy: the source dies: each column lifts off the toast and rises away, thinning, the second a beat after the first
const HAPPY_DUR = 2.2 + 0.6;
function happy(t) {
  if (t <= 0) return STILL;
  const cols = SMOKE.map((s, i) => {
    const u = track([[0.35 + i * 0.2, 0], [1.95 + i * 0.2, 1, "in"]], t);
    // risen 150 by the end: off the top of the frame; narrowing to a wisp as it goes
    return smoke(column(s, t, sway(t), 1 - 0.55 * u, 150 * u, i * 1.7));
  }).join("");
  return `${OPEN}${SETTING}${CRUST}${TOP}${PATCHES}${cols}</svg>`;
}

// ---- sad: the char creeping: ragged patches spreading from each scorch mark, and from two spots that catch later, flattened to the
// top's slope; the toast's top is the limit. The smoke widens, and a third column rises from the left patch as it spreads.
const rnd = (i) => { const x = Math.sin(i * 91.7 + 17.3) * 43758.5453; return x - Math.floor(x); };
const CHAR = [
  // [x, y, start, full radius]
  [107, 122, 0.15, 46], [67, 126.5, 0.3, 30], [84, 111, 0.45, 26], [136, 116, 0.9, 22], [50, 131, 1.2, 16],
];
const ragged = (cx, cy, r, seed) => {
  const P = [];
  for (let i = 0; i < 11; i++) { const a = (i / 11) * 2 * Math.PI, w = 0.75 + 0.35 * rnd(seed * 13 + i); P.push([cx + Math.cos(a) * r * w, cy + Math.sin(a) * r * w * 0.42]); }
  return blob(P);
};
const THIRD = { runs: subdivide(parsePath(dOf(EL[12])), 2), foot: 116, top: 32, cx: 100 };
const SAD_DUR = 2.6 + 0.6;
function sad(t) {
  if (t <= 0) return STILL;
  let char = "";
  CHAR.forEach(([x, y, t0, r], i) => {
    const g = track([[t0, 0], [t0 + 1.5, 1, "out"]], t);
    if (g > 0.01) char += `<path d="${ragged(x, y, r * g, i + 1)}"/>`;
  });
  const thick = 1 + 0.5 * track([[0.3, 0], [2.2, 1, "io"]], t);
  const cols = SMOKE.map((s, i) => smoke(column(s, t, sway(t), thick, 0, i * 1.7))).join("");
  // the third column: the first's shape, set over the left patch, rising out of it (cut off at the patch, in the frame's own space)
  const k = track([[0.9, 0], [2.4, 1, "out"]], t);
  let third = "";
  if (k > 0.01) {
    const rise = (1 - k) * 86;
    third = `<clipPath id="r"><rect x="0" y="0" width="200" height="126"/></clipPath><g clip-path="url(#r)"><g transform="translate(-30 ${n2(10 + rise)})">${smoke(column(THIRD, t, sway(t) * 1.2, 0.85 + 0.25 * k, 0, 3.1))}</g></g>`;
  }
  return `${OPEN}${SETTING}${CRUST}<clipPath id="tp"><path d="${TOP_D}"/></clipPath>${TOP}${PATCHES}<g clip-path="url(#tp)" ${fill("ink")}>${char}</g>${cols}${third}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
