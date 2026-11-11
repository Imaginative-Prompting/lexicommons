// Little's two stories: the camera, easing back from the jar with its last three beans, finds what there is besides. Happy: over to the
// right past the lid, a paper bag of the same beans stands open on the table, its top rolled down, heaped full. Sad: over to the left, the
// bag stands there empty, its top unrolled and flopped over, its sides fallen in: the three in the jar are all there is.
// Every frame is a pure function of t, in seconds. The still's own world, carried on past its edges: the wall above y 144, the table
// below it, the jar (its three beans inside) and the lid, and their long shadow on the table, cast down to the right by a low light from
// the left (it runs on along the same lines: (1.81, 1) for each unit down).
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect y=\"144\" width=\"200\" height=\"56\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M29 163L96 200L200 200L200 166.6L179 155L140 160L60 166Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M35 37L109 37L109 40C109 43 105 44 105 47C105 51 107 53 111 56C117 63 120 70 120 82L120 156C120 166 100 170 72 170C44 170 24 166 24 156L24 82C24 70 27 63 33 56C37 53 39 51 39 47C39 44 35 43 35 40Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><ellipse cx=\"72\" cy=\"159\" rx=\"42\" ry=\"6\" fill=\"var(--art-sky-pale,#C9E7F9)\"/><path d=\"M57.9 142.2C59.9 146.5 56.4 152.3 50.2 155.2C44 158.1 37.3 157.1 35.3 152.8C33.3 148.5 36.8 142.7 43 139.8C49.2 136.9 55.9 137.9 57.9 142.2Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M37.6 151.7C43 146.5 48 150.5 55.6 143.3C49 147.9 43 144.5 37.6 151.7Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M101.2 152.9C99.2 157.2 92.7 158.3 86.7 155.5C80.7 152.7 77.4 147 79.4 142.7C81.4 138.4 87.9 137.3 93.9 140.1C99.9 142.9 103.2 148.6 101.2 152.9Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M81.6 143.7C87 144.5 94 151.3 99 151.9C94 152.9 87 146.1 81.6 143.7Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M80.6 154.1C81.4 158.5 76.5 163 69.7 164.2C62.9 165.4 56.8 162.9 56 158.5C55.2 154.1 60.1 149.6 66.9 148.4C73.7 147.2 79.8 149.7 80.6 154.1Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M58.5 158.1C65 155 72 157.5 78.1 154.5C72 155.9 65 153.4 58.5 158.1Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M109 37L109 40C109 43 105 44 105 47C105 51 107 53 111 56C117 63 120 70 120 82L120 156C120 163 112 167 104 168.6L104 82C104 72 100 62 98 56C96 52 94 49.5 94 47C94 44 96.5 42 96.5 37Z\" fill=\"var(--art-sky,#58ADEB)\"/><ellipse cx=\"72\" cy=\"37\" rx=\"37\" ry=\"9.5\" fill=\"var(--art-sky-pale,#C9E7F9)\"/><ellipse cx=\"72\" cy=\"37.5\" rx=\"32\" ry=\"6.5\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M105 146L105 154A37 11 0 0 0 179 154L179 146Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><ellipse cx=\"142\" cy=\"146\" rx=\"37\" ry=\"11\" fill=\"var(--art-wood,#DCA063)\"/></svg>\n";
export const STILL_HASH = "e611960e29";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 16 || !EL[2].includes('d="M29 163L96 200L200 200L200 166.6L179 155L140 160L60 166Z"')) throw new Error("little: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const rect = (x, y, w, h, tone) => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" ${fill(tone)}/>`;
const SHADOW_RUN = 1 / 0.5526;
// the world: the wall, the table, the jar's and the lid's shadow carried on down past the frame (along its own edges), then the jar and lid
const FAR = 320;
const WORLD = rect(-400, -400, 1000, 544, "sun") + rect(-400, 144, 1000, 600, "sun-lit")
  + `<path d="M29 163L${n2(29 + (FAR - 163) * SHADOW_RUN)} ${FAR}L${n2(179 + (FAR - 155) * SHADOW_RUN)} ${FAR}L179 155L140 160L60 166Z" ${fill("sun-deep")}/>`;
const THINGS = EL.slice(3).join("");

// ---- the bag (its own drawing, about the middle of its front foot): a stand-up paper bag, its front lit, its side gusset in shade
const bean = (x, y, a, s = 1) => {
  // a bean like the jar's: its body and the crease down its middle
  const c = Math.cos((a * Math.PI) / 180), sn = Math.sin((a * Math.PI) / 180), rx = 9.6 * s, ry = 6.6 * s;
  const P = [x - c * rx, y - sn * rx], Q = [x + c * rx, y + sn * rx], k = (u, v) => [x + c * u - sn * v, y + sn * u + c * v];
  const m1 = k(-rx * 0.3, -ry * 0.25), m2 = k(rx * 0.3, ry * 0.25), e1 = k(-rx * 0.82, ry * 0.12), e2 = k(rx * 0.82, -ry * 0.12), m3 = k(rx * 0.3, ry * 0.45), m4 = k(-rx * 0.3, -ry * 0.05);
  return `<path d="M${n2(P[0])} ${n2(P[1])}A${n2(rx)} ${n2(ry)} ${n2(a)} 1 0 ${n2(Q[0])} ${n2(Q[1])}A${n2(rx)} ${n2(ry)} ${n2(a)} 1 0 ${n2(P[0])} ${n2(P[1])}Z" ${fill("bark")}/>`
    + `<path d="M${n2(e1[0])} ${n2(e1[1])}C${n2(m1[0])} ${n2(m1[1])} ${n2(m2[0])} ${n2(m2[1])} ${n2(e2[0])} ${n2(e2[1])}C${n2(m3[0])} ${n2(m3[1])} ${n2(m4[0])} ${n2(m4[1])} ${n2(e1[0])} ${n2(e1[1])}Z" ${fill("bark-deep")}/>`;
};
// (wholly past the still's right edge; its shadow falls away to the right)
const BAG_AT = [242, 160];
const FULL_BAG = [
  // its shadow on the table, down to the right like the jar's
  `<path d="M-36 0L${n2(-36 + (FAR - BAG_AT[1]) * SHADOW_RUN)} ${FAR - BAG_AT[1]}L${n2(42 + (FAR - BAG_AT[1] + 6) * SHADOW_RUN)} ${FAR - BAG_AT[1]}L42 -6Z" ${fill("sun-deep")}/>`,
  // the side, the front (bulging, full), the fold across its foot
  `<path d="M24 1C30 -1 36 -3 42 -6C43 -28 43 -50 42 -71L24 -66Z" ${fill("paper-deeper")}/>`,
  `<path d="M-36 0C-22 3.5 10 3.5 24 1C26 -22 26 -44 24 -66C10 -68 -22 -68 -37 -66C-41 -44 -41 -22 -36 0Z" ${fill("ground")}/>`,
  `<path d="M-36 0C-22 3.5 10 3.5 24 1L24 -2.5C10 -0.5 -22 -0.5 -36 -3.5Z" ${fill("paper-deeper")}/>`,
  // its label: a dark band, a bean on it
  `<path d="M-28 -50C-14 -51.5 4 -51.5 16 -50L17 -22C4 -20.5 -14 -20.5 -28 -22Z" ${fill("ink")}/>`,
  // the rolled-down top: its shade on the bag below it, the roll round the front and the side
  `<path d="M-37 -66C-22 -68 10 -68 24 -66L42 -71L42 -68L24 -63C10 -65 -22 -65 -37 -63Z" ${fill("paper-deeper")}/>`,
  `<path d="M-38 -66C-22 -68.5 10 -68.5 25 -66L25 -76C10 -78.5 -22 -78.5 -38 -76Z" ${fill("paper-deep")}/>`,
  `<path d="M25 -66L43 -71L43 -81L25 -76Z" ${fill("paper-deeper")}/>`,
  // the beans heaped in its mouth: the dark between them, then the beans, back to front
  `<path d="M-37 -77C-28 -88 -12 -94 3 -94C18 -94 32 -88 43 -80C30 -76 -20 -74 -37 -77Z" ${fill("bark-deep")}/>`,
].join("");
const HEAP = [[-8, -91, 15], [10, -91, -20], [-24, -84, -25], [-4, -84, 30], [15, -85, -5], [32, -82, 20], [-31, -78, 10], [-14, -78, -15], [4, -77, 20], [22, -78, -30], [37, -78, 5]];
const FULL = `<g transform="translate(${BAG_AT[0]} ${BAG_AT[1]})">${FULL_BAG}${HEAP.map(([x, y, a]) => bean(x, y, a, 0.9)).join("")}${bean(-6, -36, -12, 0.75).replace(fill("bark"), fill("sun-lit")).replace(fill("bark-deep"), fill("ink"))}</g>`;

// the same bag empty: its top unrolled and open, nothing in its mouth; standing on its foot, it has folded over to the left above its
// middle (nothing in it to hold it up), its sides fallen in and creased
// (far enough left that its long shadow, falling to the right, passes below the still's frame: the still shows none of it)
const EMPTY_AT = [-110, 162];
const EMPTY = `<g transform="translate(${EMPTY_AT[0]} ${EMPTY_AT[1]})">${[
  `<path d="M-36 0L${n2(-36 + (FAR - EMPTY_AT[1]) * SHADOW_RUN)} ${FAR - EMPTY_AT[1]}L${n2(32 + (FAR - EMPTY_AT[1] + 3) * SHADOW_RUN)} ${FAR - EMPTY_AT[1]}L32 -3Z" ${fill("sun-deep")}/>`,
  // the side, fallen in, folding over with the rest
  `<path d="M24 1C27 -0.5 30 -1.5 32 -3C31 -18 29 -34 27 -47C18 -60 8 -76 0 -92L-6 -90C4 -76 13 -62 21 -50C22 -34 23 -16 24 1Z" ${fill("paper-deeper")}/>`,
  // the open top: the far wall's edge, and dark down inside
  `<path d="M-58 -84C-46 -95 -22 -103 -3 -103C0 -102 1 -97 0 -92C-18 -90 -40 -85 -57 -80Z" ${fill("paper-deeper")}/>`,
  `<path d="M-56 -80C-42 -91 -20 -98 -2 -98.5L-6 -90C-22 -87.5 -40 -84 -56 -80Z" ${fill("ink-lit")}/>`,
  // the front above the fold, turned up toward the light; below it, standing, pinched in
  `<path d="M-34 -46C-18 -46 4 -47 21 -50C13 -62 4 -76 -6 -90C-20 -87.5 -40 -84 -56 -80C-50 -70 -42 -57 -34 -46Z" ${fill("paper-deep")}/>`,
  `<path d="M-36 0C-22 2.5 10 2.5 24 1C23 -16 22 -34 21 -50C4 -47 -18 -46 -34 -46C-33 -36 -32 -26 -33 -18C-34 -10 -36 -5 -36 0Z" ${fill("ground")}/>`,
  `<path d="M-36 0C-22 2.5 10 2.5 24 1L23.8 -2.5C10 -1 -22 -1 -36 -3.5Z" ${fill("paper-deeper")}/>`,
  // the fold, and creases where it has fallen in
  `<path d="M-34 -46C-18 -46 4 -47 21 -50L20.6 -46.5C4 -43.5 -18 -42.5 -33.6 -42.5Z" ${fill("paper-deeper")}/>`,
  `<path d="M-31 -14C-20 -20 -8 -28 4 -40L6 -38C-6 -26 -18 -18 -30 -11Z" ${fill("paper-deeper")}/>`,
  `<path d="M-44 -66C-34 -68 -22 -72 -12 -80L-10 -78C-20 -70 -32 -66 -43 -63Z" ${fill("paper-deeper")}/>`,
  // its label, crumpled with it
  `<path d="M-28 -38C-16 -39 2 -40 14 -41L15 -14C3 -13 -14 -12 -27 -12Z" ${fill("ink")}/>`,
].join("")}${bean(-6, -26, -6, 0.75).replace(fill("bark"), fill("sun-lit")).replace(fill("bark-deep"), fill("ink"))}</g>`;

// the camera: moved and zoomed, the world in the still's own units
const cam = (cx, cy, z) => `translate(100 100) scale(${n4(z)}) translate(${n2(-cx)} ${n2(-cy)})`;

// ---- happy: back and over to the right, to the full bag
const HAPPY_DUR = 2.7;
function happy(t) {
  if (t <= 0) return STILL;
  const u = track([[0.2, 0], [2.2, 1, "io"]], t), z = 1 + (0.72 - 1) * u;
  return `${OPEN}<g transform="${cam(100 + 55 * u, 100 + 18 * u, z)}">${WORLD}${THINGS}${FULL}</g></svg>`;
}

// ---- sad: back and over to the left, to the empty bag
const SAD_DUR = 2.7;
function sad(t) {
  if (t <= 0) return STILL;
  const u = track([[0.2, 0], [2.2, 1, "io"]], t), z = 1 + (0.72 - 1) * u;
  return `${OPEN}<g transform="${cam(100 - 135 * u, 100 + 18 * u, z)}">${WORLD}${EMPTY}${THINGS}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
