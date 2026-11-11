// Pizza's two stories: the loose slice is taken, out through the bottom of the frame (whoever takes it is out of the picture). Happy: it lifts away
// with its cheese, which stretches into strings back to the pizza; they thin, snap one by one and spring back. Sad: the cheese is stuck to the pizza:
// the bare slice slides out from under it, and the whole blanket of cheese, pepperoni and all, is left lying in the gap on the plate.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view, seen from above.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<rect x=\"0\" y=\"133\" width=\"200\" height=\"67\" fill=\"var(--art-teal-lit,#6FD0BD)\"/>\n<path d=\"M79 139 L163 131 L200 157 L200 200 L105 200 L57 170 Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<ellipse cx=\"97.2\" cy=\"102.4\" rx=\"78\" ry=\"77.8\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M148.6 52.4 C165.1 66.8 175 85 175.2 100.6 C175.2 143.5 140.3 180.2 97.2 180.2 C78.6 180.2 61.1 173.5 47.8 161.9 C69.3 173.5 99.1 169.3 123.8 147.2 C149.5 124.2 161.4 87.4 148.6 52.4 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M96.7 35.3 C135.9 34.1 166.5 66.1 166.7 99.2 C167 126.6 149.4 151.8 120.6 161.4 C118.4 162.1 118.1 157.4 116.7 153 L100 98.1 L50.2 145.2 C46.2 148.8 43.5 135.6 39.3 126.7 C11.8 76.5 48.8 36.5 96.7 35.3 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M49.1 145.4 C23.6 125.5 20.7 88 40.4 60.6 C54.3 41.3 76.5 31.6 99.6 32 C134.7 32.3 161.1 57.9 160.9 92.7 C160.7 120.8 144.3 144 123.6 153.6 C120.5 155.1 119.6 157.5 119.7 160.7 L100.3 96.5 Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M54.6 131.2 C34.9 112.8 32.5 85.4 46.1 64.8 C58.1 46.8 78.8 40.1 100.2 40.8 C128.8 41.7 151.6 62.9 151.9 92.7 C152.2 116.1 139 137.8 110.6 146.2 L100.3 96.5 Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M47.6 93.7 C42.6 93.9 39.9 90.9 40.9 85.7 C41.8 80.5 45.4 77.2 51.6 75.5 C56.9 74.1 58.7 71.5 58.1 66.5 C57.1 58.9 63.5 53.8 71.7 52.6 C77.9 51.7 78.4 46.6 84.8 45.6 C92.8 44.2 95.4 49.3 100.3 48.4 C104 47.7 106.5 44.9 111.6 45.7 C116.1 46.3 118.6 48.3 119.5 51.3 C115.3 53.6 110.4 54.4 105.7 55.7 C99.8 57.2 93.6 59.1 95.5 66.9 C97.9 77 92.4 79.6 86.5 81.1 C80.8 82.6 78.4 86.7 75.7 90.7 C70.1 97.1 65.7 99.5 58.5 99.7 C52.3 99.9 48.2 98 47.6 93.7 Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<path d=\"M50.7 99.6 C56.7 99.6 61 101 66 100.6 C70.3 100.3 71 102.8 74.5 104.3 C79.9 106.6 80.3 110 76.4 111.3 C72.2 112.8 68.5 109.8 64.6 111.5 C58.6 114.1 56.6 120.7 50.2 119.5 C44.9 118.5 43 112.1 44.9 107.4 C46.3 104.1 49.1 102.4 50.7 99.6 Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<path d=\"M88 94.3 C85.2 92.4 87.7 88.5 91.3 86.3 C96.5 82.9 102.6 85.5 106.9 81.2 C109.5 78.7 109.8 76.1 114.2 75.6 C120.3 75 122.2 66.9 129 68.6 C134.7 69.8 140.2 65.6 144.7 70 C148.9 74.1 143.3 78.7 142.9 82.5 C142.4 87.3 150.7 86.5 149.9 93.7 C149.4 98.5 144.3 101 142.5 103.2 C138 109 132.3 115.9 134.4 121.6 C135.7 125.1 137.4 127.5 135.6 131.1 C133.9 134.3 128.5 138.3 125.1 137.4 C120.6 136.3 123.9 131.8 122.1 129.3 C119.8 125.9 114.6 127.8 111.5 122.9 C106.4 114.7 114.9 109.7 111 104.8 C108.7 101.9 104.4 103.2 102.2 98.6 C100.8 95.7 100.6 93.9 97.6 94 C94.4 94.2 90.8 96.1 88 94.3 Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<path d=\"M69.6 56.9 C79.8 55.7 85.7 62 86.7 72.7 C75.8 72.6 70.6 68.8 69.6 56.9 Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M115.3 93.3 C117 83.2 125.4 78 135.1 80 C132.6 89.1 126.2 93.4 115.3 93.3 Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<ellipse cx=\"115.7\" cy=\"62.3\" rx=\"13.5\" ry=\"13.5\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<ellipse cx=\"62.6\" cy=\"89.3\" rx=\"14.3\" ry=\"13.4\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<ellipse cx=\"131.5\" cy=\"109.3\" rx=\"14.2\" ry=\"13.7\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M49.1 145.4 C46.5 142.2 48.3 135.8 52 132.5 L95.7 95.6 C98.7 93 100.5 93.8 101.9 98.3 L120 158.9 C120.2 159.9 120.3 160.7 120.3 161.4 C117.7 161 117.6 155.1 116.2 151 L99.9 99.6 C99.2 97.5 98.9 97.3 97.2 98.9 L51.3 143.4 C50.4 144.3 49.7 145 49.1 145.4 Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M99 98.2 C102.9 112.1 108.5 141.5 113.2 164.9 C114.3 170.1 114.3 174.3 111.8 175.1 C91.2 180.7 63.5 169.8 52.7 161.3 C49.9 159.1 50 154.9 52.4 150.8 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M99 98.2 L112.9 165.8 C113.7 169 113.1 170.6 109.8 171 C90 175.1 65.9 166.3 54.3 159.2 C52.6 158.1 51.6 158.4 51 159.9 C49.6 156.5 50.9 152.4 53.2 149.2 Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M99 98.2 L112.4 162.6 C94 167.6 68.8 160.9 54.4 147.8 Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M99 98.2 C101.6 102.5 98.1 107.8 94.7 110.6 C90.8 113.5 86.3 113.7 85.1 120.6 C84.4 125 80.9 128.8 75.8 129 C71.3 129.2 68.5 129.8 64.5 132.5 Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<path d=\"M63.5 142 C67 135.9 72.4 134.8 77.5 135.9 C83.8 137.3 93.9 129.2 93.9 123.6 C93.9 120.2 95.6 117.1 99.3 119.1 C104 121.5 107.5 128.6 106 135.3 C104.9 140.1 101.5 144.5 103.3 148.7 C104.8 152.3 108.4 154.6 105.9 159.2 C103.4 163.7 94.2 162.8 89.7 159.2 C85.9 156.2 82.1 154.6 76.5 153.1 C72.2 151.8 70.6 149.8 67.3 150.5 C62.2 151.6 60.4 147.5 63.5 142 Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<ellipse cx=\"89.2\" cy=\"137.2\" rx=\"13.1\" ry=\"11.7\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M67.1 145.6 C75.3 144.2 81.9 148.6 83.7 157.8 C74.8 158.7 69 154.8 67.1 145.6 Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n</svg>\n";
export const STILL_HASH = "1a0007f6a4";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 24) throw new Error("pizza: the still isn't as this story knows it");
const TABLE = EL.slice(0, 5).join(""), PIE = EL.slice(5, 17).join(""); // the table and the plate; the pizza and the gap's cut faces
// (the slice's shadow goes between them: the pizza covers it, and it shows on the plate through the gap)
const DOUGH = EL.slice(17, 20).join(""), CHEESE = EL.slice(20).join(""); // the slice: its crust and sauce; its cheese, pepperoni and basil
const SLICE_D = EL[17].match(/ d="([^"]+)"/)[1];
const fill = (t) => `fill="${paint(t)}"`;
// The way it's taken: from the pizza's middle out past its crust, and on down out of the frame.
const DIR = (() => { const x = -0.21, y = 1, l = Math.hypot(x, y); return [x / l, y / l]; })();
const TIP = [99, 98.2], RIGHT = [113.2, 164.9], LEFT = [52.4, 150.8];
// The gap's own edges, the pizza's cut faces, from the middle out.
const GAP_L = [[97.5, 97.2], [50.5, 139.5]], GAP_R = [[100.9, 98.9], [118.1, 156]];
const along = ([a, b], f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
const moved = (p, d) => [p[0] + DIR[0] * d, p[1] + DIR[1] * d];
const shift = (d) => (d === 0 ? "" : `translate(${n2(DIR[0] * d)} ${n2(DIR[1] * d)})`);
const group = (tr, inner) => (tr ? `<g transform="${tr}">${inner}</g>` : inner);
// Its shadow as it lifts, out from under it to the lower right (the light is upper left): the plate's shade on the plate, the table's beyond it.
const PLATE = '<clipPath id="pp"><ellipse cx="97.2" cy="102.4" rx="78" ry="77.8"/></clipPath>';
function shadow(d, lift) {
  // (from the first moving frame, hidden under the slice until it lifts: it grows out from under it, never appears)
  const at = `translate(${n2(DIR[0] * d + 3.2 * lift)} ${n2(DIR[1] * d + 4.2 * lift)})`;
  return `${PLATE}<path d="${SLICE_D}" transform="${at}" ${fill("teal-deep")}/><g clip-path="url(#pp)"><path d="${SLICE_D}" transform="${at}" ${fill("paper-deep")}/></g>`;
}
// How far it's gone: drawn out slowly (the cheese holds it back), then carried off quickly, out of the frame.
const PULL = 0.9, GONE = 1.45;
const distance = (t) => track([[0.08, 0], [PULL, 36, "io"], [GONE, 150, "in"]], t);
const lifted = (t) => track([[0.04, 0], [0.3, 1, "out"]], t);

// ---- happy. The strings: from a point on the pizza's cut face to the matching point on the slice's, wherever that has got to. Each snaps at its own
// stretch, and both halves spring back to their cheese.
const STRINGS = [
  { gap: along(GAP_L, 0.08), slice: along([TIP, LEFT], 0.08), snap: 30, w: 2.4 },
  { gap: along(GAP_L, 0.4), slice: along([TIP, LEFT], 0.4), snap: 17, w: 2 },
  { gap: along(GAP_R, 0.1), slice: along([TIP, RIGHT], 0.1), snap: 37, w: 2.6 },
  { gap: along(GAP_R, 0.36), slice: along([TIP, RIGHT], 0.36), snap: 24, w: 2.2 },
  { gap: along(GAP_R, 0.62), slice: along([TIP, RIGHT], 0.62), snap: 13, w: 1.8 },
];
// when each snaps: the first moment its length passes its stretch (found once, here)
for (const s of STRINGS) {
  s.at = null;
  for (let t = 0; t < GONE; t += 0.002) {
    const [x, y] = moved(s.slice, distance(t));
    if (Math.hypot(x - s.gap[0], y - s.gap[1]) >= s.snap) { s.at = t; break; }
  }
  if (s.at === null) throw new Error("pizza: a string never snaps");
}
const BACK = 0.14;
const line = (a, b, w) => (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.4 ? "" : `<path d="M${n2(a[0])} ${n2(a[1])}L${n2(b[0])} ${n2(b[1])}" stroke="${paint("sun-lit")}" stroke-width="${n2(w)}" stroke-linecap="round" fill="none"/>`);
function strings(t, d) {
  let out = "";
  for (const s of STRINGS) {
    const end = moved(s.slice, d), len = Math.hypot(end[0] - s.gap[0], end[1] - s.gap[1]), base = Math.hypot(s.slice[0] - s.gap[0], s.slice[1] - s.gap[1]);
    if (t < s.at) {
      // it draws out of the cheese as the slice starts to move, and thins as it's stretched
      const grow = Math.min(1, d / 5);
      if (grow > 0) out += line(s.gap, end, grow * Math.max(0.7, s.w * Math.sqrt(Math.max(base, 1) / Math.max(len, base, 1)) * 1.6));
    } else {
      // snapped at its middle: each half springs back into its own cheese
      const u = track([[s.at, 0], [s.at + BACK, 1, "out"]], t);
      if (u >= 1) continue;
      const broke = moved(s.slice, distance(s.at)), mid = [(broke[0] + s.gap[0]) / 2, (broke[1] + s.gap[1]) / 2];
      const k = 1 - u, w = 0.9 + 0.5 * u;
      out += line(s.gap, [s.gap[0] + (mid[0] - s.gap[0]) * k, s.gap[1] + (mid[1] - s.gap[1]) * k], w);
      const half = [mid[0] - broke[0], mid[1] - broke[1]];
      out += line(end, [end[0] + half[0] * k, end[1] + half[1] * k], w);
    }
  }
  return out;
}
const HAPPY_DUR = GONE + 0.5;
function happy(t) {
  if (t <= 0) return STILL;
  const d = distance(t), lift = lifted(t);
  const slice = d > 140 ? "" : group(shift(d), DOUGH + CHEESE);
  return `${OPEN}${TABLE}${d > 140 ? "" : shadow(d, lift)}${PIE}${slice}${strings(t, d)}</svg>`;
}

// ---- sad. The cheese comes a little way with it, then holds; the slice goes on without it. Off the slice, the blanket settles flat on the plate, its
// edges slumping a touch.
const HOLD = 9;
const SAD_DUR = GONE + 0.6;
function sad(t) {
  if (t <= 0) return STILL;
  const d = distance(t), lift = lifted(t);
  const c = Math.min(d, HOLD);
  // once the slice is out from under it, it drops the little way to the plate: a slump, out from its middle
  const slump = track([[0.95, 1], [1.08, 1.035, "in"], [1.16, 1.02, "out"]], t);
  const mid = [84, 133];
  const cheeseAt = `${shift(c)}${slump !== 1 ? ` translate(${mid[0]} ${mid[1]}) scale(${n4(slump)}) translate(${-mid[0]} ${-mid[1]})` : ""}`.trim();
  const slice = d > 140 ? "" : group(shift(d), DOUGH);
  return `${OPEN}${TABLE}${d > 140 ? "" : shadow(d, lift)}${PIE}${slice}${group(cheeseAt, CHEESE)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
