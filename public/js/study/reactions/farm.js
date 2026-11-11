// Farm's story, two time-lapses of one season in its beds. Sad, the season left to itself: the weeds come up out of the beds' soil and swallow the
// rows. Happy, a time-lapse of a season in its beds: the sixteen seedlings in the three rows grow; their leaves broaden into wide outer leaves,
// and in each a green head swells up between them: three rows of firm, round cabbages, the nearest the biggest, the farmhouse and barn behind.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky, the field, the shadows, the barn (its side, its roof, its front,
// its doors), the farmhouse (its chimney, its back wing, its roof, its front, its window, its door), the three beds (each a shade and a lit strip:
// their tops at 145, 161 and 180), and the seedlings: three paths (left leaves, right leaves, middle leaves), sixteen seedlings in each, the back row
// of six standing at y 145.6, the middle five at 161.8, the front five at 181.
import { paint, parsePath, runsToDc, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><rect x=\"0\" y=\"127\" width=\"200\" height=\"73\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"19,127.5 179,127.5 200,136 200,152 125,134.5 33,133\" fill=\"var(--art-teal-deep,#25907B)\"/><rect x=\"153\" y=\"80\" width=\"26\" height=\"48\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"72,80.5 84,61 98,47.5 157.5,47.5 141.5,67 87,67 76.5,84.5\" fill=\"var(--art-ink-lit,#3A3460)\"/><polygon points=\"140.5,67 156.5,47.5 169,61 183.5,84.5 153,84.5\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"76,128 76,84 87,66 141,66 154,84 154,128\" fill=\"var(--art-clay,#E8743B)\"/><rect x=\"115\" y=\"87.5\" width=\"2\" height=\"40.5\" fill=\"var(--art-bark-deep,#4B2F24)\"/><rect x=\"93.5\" y=\"87.5\" width=\"22\" height=\"40.5\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"116.5\" y=\"87.5\" width=\"22\" height=\"40.5\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"93.5,121.5 112.5,87.5 115.5,87.5 115.5,93.5 96.6,128 93.5,128\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"138.5,121.5 119.5,87.5 116.5,87.5 116.5,93.5 135.4,128 138.5,128\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"45\" y=\"65.5\" width=\"4.5\" height=\"11\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"49.5\" y=\"65.5\" width=\"2.5\" height=\"11\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><rect x=\"56.5\" y=\"98\" width=\"27.5\" height=\"30\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"14,100 38,74.5 59,74.5 86,100\" fill=\"var(--art-clay,#E8743B)\"/><polygon points=\"19,128 19,100 38,80.5 57,100 57,128\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"25\" y=\"104\" width=\"13\" height=\"12\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"30.9\" y=\"104\" width=\"1.2\" height=\"12\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"25\" y=\"109.4\" width=\"13\" height=\"1.2\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"43\" y=\"107\" width=\"9\" height=\"21\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"45.5\" y=\"146.3\" width=\"112\" height=\"5.6\" rx=\"2.8\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"44\" y=\"145\" width=\"112\" height=\"5.6\" rx=\"2.8\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"41.6\" y=\"162.5\" width=\"121\" height=\"6.6\" rx=\"3.3\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"40\" y=\"161\" width=\"121\" height=\"6.6\" rx=\"3.3\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"37\" y=\"182\" width=\"131\" height=\"8\" rx=\"4\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"35\" y=\"180\" width=\"131\" height=\"8\" rx=\"4\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M53 145.6c-.8-2.8-3.2-4-5.2-3.6c.4 2 2.4 3.4 5.2 3.6zM71 145.6c-.9-3.2-3.6-4.5-5.9-4.1c.5 2.3 2.7 3.8 5.9 4.1zM89 145.6c-.8-2.8-3.2-4-5.2-3.6c.4 2 2.4 3.4 5.2 3.6zM107.5 145.6c-.9-3.2-3.6-4.5-5.9-4.1c.5 2.3 2.7 3.8 5.9 4.1zM125 145.6c-.8-2.8-3.2-4-5.2-3.6c.4 2 2.4 3.4 5.2 3.6zM142.5 145.6c-.9-3.2-3.6-4.5-5.9-4.1c.5 2.3 2.7 3.8 5.9 4.1zM49 161.8c-1-3.5-4-5-6.5-4.5c.5 2.5 3 4.2 6.5 4.5zM72.5 161.8c-1.1-3.9-4.4-5.5-7.2-5c.6 2.8 3.3 4.6 7.2 5zM96 161.8c-1-3.5-4-5-6.5-4.5c.5 2.5 3 4.2 6.5 4.5zM120 161.8c-1.1-3.9-4.4-5.5-7.2-5c.6 2.8 3.3 4.6 7.2 5zM145 161.8c-1-3.5-4-5-6.5-4.5c.5 2.5 3 4.2 6.5 4.5zM47 181c-1.2-4.2-4.8-6-7.8-5.4c.6 3 3.6 5 7.8 5.4zM75 181c-1.3-4.6-5.2-6.5-8.5-5.9c.7 3.3 3.9 5.5 8.5 5.9zM102.5 181c-1.2-4.2-4.8-6-7.8-5.4c.6 3 3.6 5 7.8 5.4zM130 181c-1.3-4.6-5.2-6.5-8.5-5.9c.7 3.3 3.9 5.5 8.5 5.9zM156 181c-1.2-4.2-4.8-6-7.8-5.4c.6 3 3.6 5 7.8 5.4z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M53 145.6c.8-2.8 3.2-4 5.2-3.6c-.4 2-2.4 3.4-5.2 3.6zM71 145.6c.9-3.2 3.6-4.5 5.9-4.1c-.5 2.3-2.7 3.8-5.9 4.1zM89 145.6c.8-2.8 3.2-4 5.2-3.6c-.4 2-2.4 3.4-5.2 3.6zM107.5 145.6c.9-3.2 3.6-4.5 5.9-4.1c-.5 2.3-2.7 3.8-5.9 4.1zM125 145.6c.8-2.8 3.2-4 5.2-3.6c-.4 2-2.4 3.4-5.2 3.6zM142.5 145.6c.9-3.2 3.6-4.5 5.9-4.1c-.5 2.3-2.7 3.8-5.9 4.1zM49 161.8c1-3.5 4-5 6.5-4.5c-.5 2.5-3 4.2-6.5 4.5zM72.5 161.8c1.1-3.9 4.4-5.5 7.2-5c-.6 2.8-3.3 4.6-7.2 5zM96 161.8c1-3.5 4-5 6.5-4.5c-.5 2.5-3 4.2-6.5 4.5zM120 161.8c1.1-3.9 4.4-5.5 7.2-5c-.6 2.8-3.3 4.6-7.2 5zM145 161.8c1-3.5 4-5 6.5-4.5c-.5 2.5-3 4.2-6.5 4.5zM47 181c1.2-4.2 4.8-6 7.8-5.4c-.6 3-3.6 5-7.8 5.4zM75 181c1.3-4.6 5.2-6.5 8.5-5.9c-.7 3.3-3.9 5.5-8.5 5.9zM102.5 181c1.2-4.2 4.8-6 7.8-5.4c-.6 3-3.6 5-7.8 5.4zM130 181c1.3-4.6 5.2-6.5 8.5-5.9c-.7 3.3-3.9 5.5-8.5 5.9zM156 181c1.2-4.2 4.8-6 7.8-5.4c-.6 3-3.6 5-7.8 5.4z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M53 145.6c-1.8-1.6-2.1-4-.5-6c2 2 2.3 4.4.5 6zM71 145.6c-2-1.8-1.7-4.5.5-6.8c1.8 2.3 1.5 5-.5 6.8zM89 145.6c-1.8-1.6-1.8-4 0-6c1.8 2 1.8 4.4 0 6zM107.5 145.6c-2-1.8-2.3-4.5-.5-6.8c2.2 2.3 2.5 5 .5 6.8zM125 145.6c-1.8-1.6-1.5-4 .5-6c1.6 2 1.3 4.4-.5 6zM142.5 145.6c-2-1.8-2-4.5 0-6.8c2 2.3 2 5 0 6.8zM49 161.8c-2.2-2-1.9-5 .5-7.5c2 2.5 1.7 5.5-.5 7.5zM72.5 161.8c-2.4-2.2-2.7-5.5-.5-8.3c2.6 2.8 2.9 6.1.5 8.3zM96 161.8c-2.2-2-2.2-5 0-7.5c2.2 2.5 2.2 5.5 0 7.5zM120 161.8c-2.4-2.2-2.1-5.5.5-8.3c2.2 2.8 1.9 6.1-.5 8.3zM145 161.8c-2.2-2-2.5-5-.5-7.5c2.4 2.5 2.7 5.5.5 7.5zM47 181c-2.6-2.4-2.6-6 0-9c2.6 3 2.6 6.6 0 9zM75 181c-2.9-2.6-2.6-6.5.5-9.8c2.7 3.3 2.4 7.2-.5 9.8zM102.5 181c-2.6-2.4-2.9-6-.5-9c2.8 3 3.1 6.6.5 9zM130 181c-2.9-2.6-2.9-6.5 0-9.8c2.9 3.3 2.9 7.2 0 9.8zM156 181c-2.6-2.4-2.3-6 .5-9c2.4 3 2.1 6.6-.5 9z\" fill=\"var(--art-teal,#37B39B)\"/></svg>\n";
export const STILL_HASH = "b6a64e3a27";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 30 || !EL[27].includes("M53 145.6c-.8-2.8") || !EL[22].includes('y="145"')) throw new Error("farm: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const SCENE = EL.slice(0, 27).join("");
const SUBS = [27, 28, 29].map((i) => EL[i].match(/ d="([^"]*)"/)[1].match(/M[^M]*/g));
const PAINTS = [27, 28, 29].map((i) => EL[i].match(/fill="[^"]*"/)[0]);
const BASES = SUBS[0].map((s) => s.match(/^M([\d.]+) ([\d.]+)/).slice(1).map(Number));
const ROW = BASES.map(([, y]) => (y < 150 ? 0 : y < 170 ? 1 : 2));
const NEAR = [1, 1.22, 1.45];
// (each plant a little ahead of or behind the others, as plants are)
const LAG = BASES.map((_, i) => 0.12 * Math.sin(i * 2.39 + 0.7));
const RUNS = SUBS.map((ss) => ss.map((d) => parsePath(d)));
const n1 = (v) => String(Math.round(v * 10) / 10);
// the outer leaves: each color's leaves, every plant's, in one path as the still has them, each broadened about its own foot
function leaves(gs) {
  return RUNS.map((rr, j) => `<path d="${rr.map((runs, i) => { const [x, y] = BASES[i], g = gs[i]; return runsToDc(runs, (px, py) => [x + (px - x) * (1 + 1.7 * g), y + (py - y) * (1 + 1.25 * g)]); }).join("")}" ${PAINTS[j]}/>`).join("");
}

// the head: a green ball swelling up between them (its lit top, its shaded side), a wrapper leaf curling up round its foot in front
function head(i, g) {
  const [x, y] = BASES[i], k = NEAR[ROW[i]], h = Math.max(0, (g - 0.3) / 0.7);
  if (h <= 0.01) return "";
  const r = 5.4 * k * (h * h * (3 - 2 * h)), cy = y - 0.78 * r - 0.4;
  const ball = `<ellipse cx="${n1(x)}" cy="${n1(cy)}" rx="${n1(r)}" ry="${n1(0.92 * r)}" ${fill("teal")}/><ellipse cx="${n1(x + 0.42 * r)}" cy="${n1(cy + 0.15 * r)}" rx="${n1(0.5 * r)}" ry="${n1(0.7 * r)}" ${fill("teal-deep")}/><ellipse cx="${n1(x - 0.3 * r)}" cy="${n1(cy - 0.38 * r)}" rx="${n1(0.42 * r)}" ry="${n1(0.3 * r)}" ${fill("teal-lit")}/>`;
  const wrap = `<path d="M${n1(x - 1.05 * r)} ${n1(cy + 0.1 * r)}Q${n1(x - 0.6 * r)} ${n1(y + 0.6)} ${n1(x + 0.2 * r)} ${n1(y + 0.4)}Q${n1(x + 1.1 * r)} ${n1(y)} ${n1(x + 1.05 * r)} ${n1(cy + 0.25 * r)}Q${n1(x + 0.5 * r)} ${n1(cy + 0.75 * r)} ${n1(x)} ${n1(cy + 0.8 * r)}Q${n1(x - 0.6 * r)} ${n1(cy + 0.7 * r)} ${n1(x - 1.05 * r)} ${n1(cy + 0.1 * r)}Z" ${fill("teal-deep")}/>`;
  return ball + wrap;
}
function field(t) {
  const gs = BASES.map((_, i) => grown(t, i));
  // (row by row, back to front: each row's heads over the leaves of the rows behind)
  const heads = BASES.map((_, i) => head(i, gs[i])).join("");
  return `${OPEN}${SCENE}${leaves(gs)}${heads}</svg>`;
}

const grown = (t, i) => track([[0.3 + LAG[i], 0], [2.1 + LAG[i], 1, "io"]], t);
// ---- happy: cabbages
const HAPPY_DUR = 2.75;
function happy(t) {
  if (t <= 0.3 + Math.min(...LAG)) return STILL;
  return field(t);
}
// ---- sad: an unweeded season
// The same season, left to itself: the seedlings don't get going, and the weeds come up out of the beds' own soil all along them, tuft after tuft,
// taller and ranker than the crop, dark green, a blade here and there gone to straw, until the rows are lost under them: the farmhouse and barn behind, the beds a tangle.
// Each tuft: a fan of five blades from its foot, the near rows' bigger (as everything nearer is), each coming up a little ahead of or behind the others.
const ROWS = [[146.6, 45, 155, 10], [163.4, 41, 160, 10], [183, 37, 165, 9]];
const TUFTS = ROWS.flatMap(([y, x0, x1, n], row) => Array.from({ length: n }, (_, k) => [x0 + ((x1 - x0) * (k + 0.5 + 0.3 * Math.sin(k * 2.7 + row))) / n, y, row, row * 11 + k]));
const BLADES = [[-52, 0.55], [-24, 0.88], [2, 1], [26, 0.82], [50, 0.52]];
const SEEDLINGS = EL.slice(27).join("");
function weeds(t) {
  const dark = [], straw = [];
  for (const [x, y, row, i] of TUFTS) {
    const lag = 0.4 * (0.5 + 0.5 * Math.sin(i * 1.93 + 0.4)), h = 19 * NEAR[row] * (0.8 + 0.35 * (0.5 + 0.5 * Math.sin(i * 3.1))) * track([[0.4 + lag, 0], [2.2 + lag * 0.3, 1, "io"]], t);
    if (h < 0.3) continue;
    const w = 2.2 * NEAR[row] * Math.min(1, h / 8);
    BLADES.forEach(([deg, len], j) => {
      const a = ((deg + 10 * Math.sin(i * 2.3 + j)) * Math.PI) / 180, L = h * len, bx = x + (j - 2) * 0.7 * NEAR[row];
      // (a blade bows out as it grows: its middle lies inside the straight line to its tip)
      const tx = bx + L * Math.sin(a), ty = y - L * Math.cos(a), cx = bx + 0.42 * L * Math.sin(a * 0.55), cy = y - 0.6 * L * Math.cos(a * 0.55);
      (i % 5 === j ? straw : dark).push(`M${n1(bx - w / 2)} ${n1(y)}Q${n1(cx)} ${n1(cy)} ${n1(tx)} ${n1(ty)}L${n1(bx + w / 2)} ${n1(y)}Z`);
    });
  }
  return (dark.length ? `<path d="${dark.join("")}" ${fill("teal-deep")}/>` : "") + (straw.length ? `<path d="${straw.join("")}" ${fill("paper-deeper")}/>` : "");
}
const SAD_DUR = 3.1;
function sad(t) {
  if (t <= 0.4) return STILL;
  return `${OPEN}${SCENE}${SEEDLINGS}${weeds(t)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
