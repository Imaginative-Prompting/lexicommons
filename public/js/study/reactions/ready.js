// Ready's two stories: the pie just out of the oven, cooling on its rack, its steam rising and swaying. Happy: the camera draws back to
// what was laid out beside it all along: two plates, each with its fork, and the server waiting in front of the rack: ready to serve. Sad:
// the hot filling bubbles up in the lattice's gaps and boils over at the front: it runs over the crust's edge, down the dish and onto the
// counter between the rack's wires.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view; the world carries on past its frame.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"144\" width=\"200\" height=\"56\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"35,180 165,180 200,190 200,200 96,200\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M97 80C90 70 86 58 91 47C96 37 103 30 101 22C100 17 99 14 96 12C104 18 108 28 105 38C102 48 95 54 96 63C96.5 71 98 76 97 80Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M78 80C73.5 73.5 70.9 65.7 74.1 58.6C77.4 52.1 81.9 47.5 80.6 42.3C80 39.1 79.3 37.1 77.4 35.8C82.6 39.7 85.2 46.2 83.2 52.7C81.2 59.2 76.7 62.9 77.4 69C77.7 74.2 78.7 77.4 78 80Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M121 83C125.5 76.5 128.1 68.7 124.9 61.6C121.6 55.1 117.1 50.5 118.4 45.3C119 42.1 119.7 40.1 121.6 38.8C116.4 42.7 113.8 49.2 115.8 55.7C117.8 62.2 122.3 65.9 121.6 72C121.3 77.2 120.3 80.4 121 83Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path fill-rule=\"evenodd\" d=\"M22 152A78 19 0 1 0 178 152A78 19 0 1 0 22 152ZM24.4 152A75.6 16.8 0 1 0 175.6 152A75.6 16.8 0 1 0 24.4 152Z\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"31.6\" y=\"142.9\" width=\"136.8\" height=\"2.2\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"23.4\" y=\"150.9\" width=\"153.2\" height=\"2.2\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"31.6\" y=\"158.9\" width=\"136.8\" height=\"2.2\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"51.9,137.8 54.1,137.8 46.1,164.5 43.9,164.5\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"70.9,135.3 73.1,135.3 68.1,168.2 65.9,168.2\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"89.9,134.2 92.1,134.2 90.1,169.7 87.9,169.7\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"107.9,134.2 110.1,134.2 112.1,169.7 109.9,169.7\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"126.9,135.3 129.1,135.3 134.1,168.2 131.9,168.2\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"145.9,137.8 148.1,137.8 156.1,164.5 153.9,164.5\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"34.4\" y=\"161\" width=\"3.2\" height=\"19.5\" rx=\"1.6\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"162.4\" y=\"161\" width=\"3.2\" height=\"19.5\" rx=\"1.6\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M36 112C39 126 42 139 47 150Q100 164 153 150C158 139 161 126 164 112Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M124 112C123 132 114 147 100 157Q126.5 157 153 150C158 139 161 126 164 112Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M170 105Q175.5 110.8 164.7 114.6Q164 121.4 149.5 122.7Q142.8 129.5 126.8 128.1Q115 133.9 100 130Q85 133.9 73.2 128.1Q57.2 129.5 50.5 122.7Q36 121.4 35.3 114.6Q24.5 110.8 30 105Q24.5 99.2 35.3 95.4Q36 88.6 50.5 87.3Q57.2 80.5 73.2 81.9Q85 76.1 100 80Q115 76.1 126.8 81.9Q142.8 80.5 149.5 87.3Q164 88.6 164.7 95.4Q175.5 99.2 170 105Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M149.5 87.3Q164 88.6 164.7 95.4Q175.5 99.2 170 105Q175.5 110.8 164.7 114.6Q164 121.4 149.5 122.7Q142.8 129.5 126.8 128.1L118 112Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><ellipse cx=\"100\" cy=\"98\" rx=\"63\" ry=\"21\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"131.5,79.8 164.6,98.9 160.3,106.8 108.3,76.8\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"90,76.6 151.1,111.9 139.5,115.6 74.3,77.9\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"60.6,80.4 125.7,118.1 110,119.4 48.9,84.1\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"68.5,116.2 35.4,97.1 39.7,89.2 91.7,119.2\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"68.5,79.8 35.4,98.9 39.7,106.8 91.7,76.8\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"110,76.6 48.9,111.9 60.5,115.6 125.7,77.9\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"139.4,80.4 74.3,118.1 90,119.4 151.1,84.1\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"131.5,116.2 164.6,97.1 160.3,89.2 108.3,119.2\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"136,82.4 145,87.6 136,92.8 127,87.6\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"100,82.4 109,87.6 100,92.8 91,87.6\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"136,103.2 145,108.4 136,113.6 127,108.4\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"64,82.4 73,87.6 64,92.8 55,87.6\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"100,103.2 109,108.4 100,113.6 91,108.4\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"64,103.2 73,108.4 64,113.6 55,108.4\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"127,87.6 136,92.8 133.8,94.1 124.8,88.9\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"91,87.6 100,92.8 97.8,94.1 88.8,88.9\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"127,108.4 136,113.6 133.8,114.9 124.8,109.7\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"55,87.6 64,92.8 61.8,94.1 52.8,88.9\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"91,108.4 100,113.6 97.8,114.9 88.8,109.7\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"55,108.4 64,113.6 61.8,114.9 52.8,109.7\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"127,77.2 118,82.4 120.2,83.7 129.2,78.5\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"91,77.2 82,82.4 84.2,83.7 93.2,78.5\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"163,98 154,103.2 156.2,104.5 165.2,99.3\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"55,98 46,103.2 48.2,104.5 57.2,99.3\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"127,98 118,103.2 120.2,104.5 129.2,99.3\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"91,98 82,103.2 84.2,104.5 93.2,99.3\" fill=\"var(--art-sun,#F7BE45)\"/><path fill-rule=\"evenodd\" d=\"M170 99Q175.5 104.8 164.7 108.6Q164 115.4 149.5 116.7Q142.8 123.5 126.8 122.1Q115 127.9 100 124Q85 127.9 73.2 122.1Q57.2 123.5 50.5 116.7Q36 115.4 35.3 108.6Q24.5 104.8 30 99Q24.5 93.2 35.3 89.4Q36 82.6 50.5 81.3Q57.2 74.5 73.2 75.9Q85 70.1 100 74Q115 70.1 126.8 75.9Q142.8 74.5 149.5 81.3Q164 82.6 164.7 89.4Q175.5 93.2 170 99ZM38 98A62 20 0 1 0 162 98A62 20 0 1 0 38 98Z\" fill=\"var(--art-sun,#F7BE45)\"/></svg>\n";
export const STILL_HASH = "fd090cd03b";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 50) throw new Error("ready: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
// the wall and counter carried on; the rack's shadow carried on past the frame along its own edges (inside the frame, the still's own)
const WALL = `<rect x="-400" y="-400" width="1100" height="1000" ${fill("teal")}/>`, COUNTER = `<rect x="-400" y="144" width="1100" height="600" ${fill("teal-lit")}/>`;
const RACK_SHADOW = `<polygon points="35,180 165,180 200,190 238,200.9 246,212 210,226 150,231 130.5,211.3" ${fill("teal-deep")}/>`;
const RACK = EL.slice(6, 18).join(""), PIE = EL.slice(18).join("");
// the steam: three ribbons, each swaying from its foot as warm air does (more at the top), each in its own time
const STEAM = [[3, 80, 0], [4, 80, 1.9], [5, 83, 3.7]];
const steam = (t) => STEAM.map(([i, foot, ph]) => {
  const k = 0.11 * Math.sin(t * 3.4 + ph) * Math.min(1, t / 0.3);
  return `<g transform="matrix(1 0 ${n4(k)} 1 ${n2(-k * foot)} 0)">${EL[i]}</g>`;
}).join("");
const view = ([z, fx, fy], inner) => `${OPEN}<g transform="translate(100 100) scale(${n4(z)}) translate(${n2(-fx)} ${n2(-fy)})">${inner}</g></svg>`;

// ---- happy: the camera draws back (and down a little) to the table laid around the rack: a plate each side, a fork beside each, the
// server in front, all on the counter (lit from the upper left, as the pie is: their shadows to the lower right)
const plate = (cx, cy) => `<ellipse cx="${cx + 4}" cy="${cy + 3}" rx="27" ry="7.5" ${fill("teal-deep")}/><ellipse cx="${cx}" cy="${cy}" rx="27" ry="7.5" ${fill("paper-deep")}/><ellipse cx="${cx}" cy="${cy - 0.6}" rx="20" ry="5" ${fill("paper")}/>`;
const fork = (x, y) => `<path d="M${x} ${y}L${x + 22} ${y - 3}" stroke="${paint("steel")}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`
  + `<path d="M${x + 22} ${y - 4.6}L${x + 32} ${y - 6}M${x + 22} ${y - 3}L${x + 32} ${y - 4.4}M${x + 22} ${y - 1.4}L${x + 32} ${y - 2.8}" stroke="${paint("steel")}" stroke-width="1" stroke-linecap="round" fill="none"/>`;
// (all just out of the still's frame, so they come into sight only as the camera draws back)
const SERVER = `<path d="M70 216L104 211" stroke="${paint("bark")}" stroke-width="4" stroke-linecap="round" fill="none"/><path d="M104 209L130 204L134 210L108 215Z" ${fill("steel")}/>`;
const TABLE = plate(-32, 178) + fork(-58, 196) + plate(231, 180) + fork(203, 198) + SERVER;
const camAt = (t) => { const k = track([[0.1, 0], [1.1, 1, "io"]], t); return [1 - 0.38 * k, 100, 100 + 24 * k]; };
const HAPPY_DUR = 1.1 + 0.8;
function happy(t) {
  if (t <= 0) return STILL;
  return view(camAt(t), `${WALL}${COUNTER}${RACK_SHADOW}${steam(t)}${TABLE}${RACK}${PIE}`);
}

// ---- sad: bubbles come up in the lattice's gaps (swelling, bursting), then the filling wells up at the front right and runs over the
// crust's edge, down the dish's side, and drips onto the counter between the rack's wires
const GAPS = [[82.5, 87.5], [117.5, 87.5], [60, 97.5], [100, 97.5], [136, 97.5], [82.5, 107.5], [117.5, 107.5]];
const bubbles = (t) => GAPS.map(([x, y], i) => {
  // each bubble: comes up, swells, bursts (shrinking fast to nothing), twice, at its own times
  let svg = "";
  for (const k of [0, 1]) {
    const t0 = 0.15 + i * 0.13 + k * 0.62, s = t - t0;
    if (s <= 0 || s > 0.34) continue;
    const r = s < 0.26 ? 3.6 * (s / 0.26) : 3.6 * (1 - (s - 0.26) / 0.08);
    if (r > 0.05) svg += `<circle cx="${n2(x + (i % 2 ? 1.5 : -1.5))}" cy="${n2(y - r * 0.4)}" r="${n2(r)}" ${fill("clay")}/><circle cx="${n2(x + (i % 2 ? 1.5 : -1.5) - r * 0.35)}" cy="${n2(y - r * 0.75)}" r="${n2(r * 0.28)}" ${fill("clay-lit")}/>`;
  }
  return svg;
}).join("");
// the run: from the gap at the front right over the crust's edge and down the dish's front, its end a bead; a second, shorter, beside it
const RUN_TOP = [133, 112];
const run = (x0, y0, len, w, curve) => {
  if (len < 0.3) return "";
  const y1 = y0 + len, x1 = x0 + curve * len * 0.05, r = w * 0.8;
  return `<path d="M${n2(x0 - w)} ${n2(y0)}C${n2(x0 - w * 0.7)} ${n2(y0 + len * 0.45)} ${n2(x1 - r * 0.8)} ${n2(y1 - r * 2.4)} ${n2(x1 - r)} ${n2(y1 - r)}A${n2(r)} ${n2(r)} 0 0 0 ${n2(x1 + r)} ${n2(y1 - r)}C${n2(x1 + r * 0.8)} ${n2(y1 - r * 2.4)} ${n2(x0 + w * 0.7)} ${n2(y0 + len * 0.45)} ${n2(x0 + w)} ${n2(y0)}Z" ${fill("clay-deep")}/>`;
};
const SAD_DUR = 2.5 + 0.6;
function sad(t) {
  if (t <= 0) return STILL;
  // the well at the gap, swelling up over the lattice and the crust there
  const well = track([[0.9, 0], [1.3, 1, "out"]], t);
  const pool = well > 0.01 ? `<ellipse cx="${RUN_TOP[0]}" cy="${n2(RUN_TOP[1] + 4 * well)}" rx="${n2(9 * well)}" ry="${n2(5 * well)}" ${fill("clay-deep")}/><ellipse cx="${RUN_TOP[0] - 2}" cy="${n2(RUN_TOP[1] + 2.5 * well)}" rx="${n2(3 * well)}" ry="${n2(1.4 * well)}" ${fill("clay")}/>` : "";
  // down over the edge and the dish (thick and slow: it's syrup, slowing as it cools on the way), then a drop off the dish onto the counter
  const len = 48 * track([[1.15, 0], [2.4, 1, "out"]], t), len2 = 22 * track([[1.4, 0], [2.5, 1, "out"]], t);
  const runs = run(RUN_TOP[0], RUN_TOP[1] + 3, len, 3.6, -1) + run(RUN_TOP[0] - 7, RUN_TOP[1] + 4, len2, 2.4, 1);
  const drop = track([[2.15, 0], [2.45, 1, "in"]], t), puddle = track([[2.45, 0], [2.65, 1, "out"]], t);
  // (it lands and squashes out into its puddle)
  const squash = track([[2.45, 0], [2.53, 1, "out"]], t);
  const below = (drop > 0 && squash < 1 ? `<ellipse cx="129" cy="${n2(160 + 18 * drop + 0.8 * squash)}" rx="${n2(2 + 3 * squash)}" ry="${n2(2.6 * (1 - squash))}" ${fill("clay-deep")}/>` : "")
    + (puddle > 0.01 ? `<ellipse cx="129" cy="179" rx="${n2(6 * puddle)}" ry="${n2(1.6 * puddle)}" ${fill("clay-deep")}/>` : "");
  return view([1, 100, 100], `${WALL}${COUNTER}${RACK_SHADOW}${below}${steam(t)}${RACK}${PIE}${bubbles(t)}${pool}${runs}`);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
