// Dinner's story, its sad alone (its happy, the potato sauced by one last bubble, read at a learner's size as a leaking pie: the player keeps the
// still for it): the pie is just out of the oven, its filling still boiling under the crust. A bubble of it swells in the left slit, breaks over the
// slit's low side, and the thick gravy runs: down the crust's slope to its front, over the scalloped edge, down the pie's side, onto the potato
// leaning against it. And it doesn't stop: the gravy keeps coming, swamps the potato, runs off it onto the plate and spreads, round the potatoes'
// feet and in under the peas: a brown flood across the dinner.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the table, then (all inside the still's own frame, 1.2 times
// these units) the placemat, the napkin's shadow, the fork, the napkin and spoon, the plate (its shadow, its face, its three shadows), the pie (its
// side and shade, its crust's shade and lit top, scalloped, from y 104 to 126, and its three slits), the three potatoes (each lit and shaded: the
// middle one, 59.5-79 across and 134-150.5 down, leans on the pie's front left), and the peas. The pie (20 cm) is 50 across: 250 to the meter.
import { blob, n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"81.2\" width=\"200\" height=\"118.8\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><g transform=\"translate(100 116) scale(1.2) translate(-104 -140)\"><polygon points=\"44.4,145.2 66.3,200 160.3,200 134.6,135.8\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"141.5,122 162.5,123 183.5,162 182.5,166 150,167.3\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M32.9 128.2H44.3C43.8 132.7 41 134.7 38.6 137.7L31.6 161.2C31.2 164.2 29.8 165.8 28 165.6C26.2 165.4 25.4 163.8 25.8 161.6L35.6 137C34 134.7 32.7 132.2 32.9 128.2Z\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"36.3,119.4 38.1,119.4 34.6,131 32.8,131\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"39.4,119.4 41.2,119.4 37.7,131 35.9,131\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"42.5,119.4 44.3,119.4 40.8,131 39,131\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"45.6,119.4 47.4,119.4 43.9,131 42.1,131\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"35.1,118.4 36.9,118.4 33.4,130 31.6,130\" fill=\"var(--art-ink-lit,#3A3460)\"/><polygon points=\"38.2,118.4 40,118.4 36.5,130 34.7,130\" fill=\"var(--art-ink-lit,#3A3460)\"/><polygon points=\"41.3,118.4 43.1,118.4 39.6,130 37.8,130\" fill=\"var(--art-ink-lit,#3A3460)\"/><polygon points=\"44.4,118.4 46.2,118.4 42.7,130 40.9,130\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M31.5 127H42.9C42.4 131.5 39.6 133.5 37.2 136.5L30.2 160C29.8 163 28.4 164.6 26.6 164.4C24.8 164.2 24 162.6 24.4 160.4L34.2 135.8C32.6 133.5 31.3 131 31.5 127Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M37.2 136.5L30.2 160C29.8 163 28.4 164.6 26.6 164.4C28 163.5 28.6 162 28.8 160L35.6 136.6Z\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"139.5,120.5 158,120.5 160.5,121.5 181.5,160.5 180.5,164.5 148,165.8 147.5,162\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"139.5,120.5 158,120.5 179,160 147.5,162\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M148.5 118.3C152.2 117 156.6 120.4 158.5 125.9C160.4 131.4 159.2 136.8 155.3 138.1C151.4 139.4 147.2 136 145.3 130.5C143.4 125 144.8 119.6 148.5 118.3Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M153 135.2L155.2 134.4L163.6 156.6C164.6 159.4 160.6 160.8 159.6 158Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M151.6 134L153.8 133.2L162.2 155.4C163.2 158.2 159.2 159.6 158.2 156.8Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M153.8 133.2L162.2 155.4C162.7 156.8 161.8 158.2 160.4 158.4C161.1 157.1 161.1 156.1 160.6 154.8L153 133.5Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M147.1 117.1C150.8 115.8 155.2 119.2 157.1 124.7C159 130.2 157.8 135.6 153.9 136.9C150 138.2 145.8 134.8 143.9 129.3C142 123.8 143.4 118.4 147.1 117.1Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M147.1 117.1C150.8 115.8 155.2 119.2 157.1 124.7C159 130.2 157.8 135.6 153.9 136.9C156.2 132.5 155 122 147.1 117.1Z\" fill=\"var(--art-ink,#231F3B)\"/><ellipse cx=\"91\" cy=\"142.3\" rx=\"46\" ry=\"23.5\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><ellipse cx=\"89.5\" cy=\"140.5\" rx=\"46\" ry=\"23.5\" fill=\"var(--art-paper,#FBF7EC)\"/><ellipse cx=\"106\" cy=\"140\" rx=\"18\" ry=\"5.5\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><ellipse cx=\"80\" cy=\"154\" rx=\"10\" ry=\"3.5\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><ellipse cx=\"105\" cy=\"151.5\" rx=\"12\" ry=\"4\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><path d=\"M67 116L67.5 134C68 138 78 141 91 141C104 141 115.5 139 116.5 135L117 116Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M107 116C108 126 108 135 107 140.6C112 140 116 138 116.5 135L117 116Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M118 117Q121.5 120 114.5 121.4Q113.6 125.2 105 124.6Q99.9 128.2 92 125.8Q84.1 128.2 79 124.6Q70.4 125.2 69.5 121.4Q62.5 120 66 117Q62.5 114 69.5 112.6Q70.4 108.8 79 109.4Q84.1 105.8 92 108.2Q99.9 105.8 105 109.4Q113.6 108.8 114.5 112.6Q121.5 114 118 117Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M118 115Q121.5 118 114.5 119.4Q113.6 123.2 105 122.6Q99.9 126.2 92 123.8Q84.1 126.2 79 122.6Q70.4 123.2 69.5 119.4Q62.5 118 66 115Q62.5 112 69.5 110.6Q70.4 106.8 79 107.4Q84.1 103.8 92 106.2Q99.9 103.8 105 107.4Q113.6 106.8 114.5 110.6Q121.5 112 118 115Z\" fill=\"var(--art-clay-lit,#F6A06F)\"/><ellipse cx=\"86.5\" cy=\"114.6\" rx=\"4.6\" ry=\"0.95\" transform=\"rotate(-58 86.5 114.6)\" fill=\"var(--art-clay-deeper,#9C4219)\"/><ellipse cx=\"92\" cy=\"113.4\" rx=\"4.6\" ry=\"0.95\" transform=\"rotate(-90 92 113.4)\" fill=\"var(--art-clay-deeper,#9C4219)\"/><ellipse cx=\"97.5\" cy=\"114.6\" rx=\"4.6\" ry=\"0.95\" transform=\"rotate(-122 97.5 114.6)\" fill=\"var(--art-clay-deeper,#9C4219)\"/><path d=\"M51 139C50 133 55 128.5 61 129C67 129.5 70 134 69.5 138.5C69 143 64 145.5 59 145C54 144.5 51.5 142 51 139Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M66 130.8C69 133 70 136 69.5 138.5C69 143 64 145.5 59 145C63 143 66.8 138 66 130.8Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M59.5 144C59 138 64 134 70.5 134.5C76.5 135 79.5 139.5 79 144C78.5 148.5 73.5 151 68.5 150.5C63 150 60 147.5 59.5 144Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M75.5 136.3C78.5 138.5 79.5 141 79 144C78.5 148.5 73.5 151 68.5 150.5C72.5 148.5 76.3 144 75.5 136.3Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M68 150C67.5 144 72.5 140 79 140.5C85 141 88 145.5 87.5 150C87 154.5 82 157 77 156.5C71.5 156 68.5 153.5 68 150Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M84 142.3C87 144.5 88 147 87.5 150C87 154.5 82 157 77 156.5C81 154.5 84.8 150 84 142.3Z\" fill=\"var(--art-sun,#F7BE45)\"/><circle cx=\"99.8\" cy=\"139\" r=\"2.6\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"99.2\" cy=\"138.5\" r=\"2.1\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"96.8\" cy=\"141.1\" r=\"2.7\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"96.2\" cy=\"140.6\" r=\"2.2\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"93.5\" cy=\"141.2\" r=\"3.2\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"92.9\" cy=\"140.7\" r=\"2.7\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"107.1\" cy=\"141.6\" r=\"2.8\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"106.5\" cy=\"141.1\" r=\"2.3\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"110.7\" cy=\"142.3\" r=\"3.1\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"110.1\" cy=\"141.8\" r=\"2.6\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"102.7\" cy=\"142.4\" r=\"2.8\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"102.1\" cy=\"141.9\" r=\"2.3\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"89.9\" cy=\"142.9\" r=\"2.7\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"89.3\" cy=\"142.4\" r=\"2.2\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"106.5\" cy=\"145\" r=\"2.9\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"105.9\" cy=\"144.5\" r=\"2.4\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"97.3\" cy=\"145.3\" r=\"3.3\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"96.7\" cy=\"144.8\" r=\"2.8\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"110.5\" cy=\"146.4\" r=\"2.8\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"109.9\" cy=\"145.9\" r=\"2.3\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"101.4\" cy=\"147\" r=\"2.9\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"100.8\" cy=\"146.5\" r=\"2.4\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"94.3\" cy=\"149.2\" r=\"2.8\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"93.7\" cy=\"148.7\" r=\"2.3\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"103.9\" cy=\"149.7\" r=\"2.8\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"103.3\" cy=\"149.2\" r=\"2.3\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"97.2\" cy=\"150.3\" r=\"2.6\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"96.6\" cy=\"149.8\" r=\"2.1\" fill=\"var(--art-teal,#37B39B)\"/></g></svg>";
export const STILL_HASH = "3ae362b59b";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const IN = '<g transform="translate(100 116) scale(1.2) translate(-104 -140)">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 69 || !EL[28].includes("M67 116L67.5 134") || !EL[37].includes("M59.5 144C59 138 64 134 70.5 134.5") || !STILL.includes(EL[1] + IN)) throw new Error("dinner: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BACK = EL[0] + EL[1], TABLE = EL.slice(2, 28).join(""), PIE = EL.slice(28, 35).join(""), POTATOES = EL.slice(35, 41).join(""), PEAS = EL.slice(41).join("");
const MIDDLE = EL[37].match(/ d="([^"]*)"/)[1] + EL[38].match(/ d="([^"]*)"/)[1];

// ---- the gravy's way: from the left slit down the crust to its front-left scallop, then straight down the pie's side to the potato's top
const WAY = [[86.5, 115], [82, 117.4], [77.5, 120], [73.4, 123.2], [72, 125.6], [71.6, 129.5], [71.3, 133.4], [71, 135.6]];
const SEG = WAY.slice(1).map((p, i) => Math.hypot(p[0] - WAY[i][0], p[1] - WAY[i][1]));
const LEN = SEG.reduce((a, b) => a + b, 0);
// the point a distance along it, and the way it heads there
function along(d) {
  let k = 0; d = Math.max(0, Math.min(LEN, d));
  while (k < SEG.length - 1 && d > SEG[k]) { d -= SEG[k]; k++; }
  const a = WAY[k], b = WAY[k + 1], f = Math.min(1, d / SEG[k]);
  return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], dir: [(b[0] - a[0]) / SEG[k], (b[1] - a[1]) / SEG[k]] };
}
// the gravy from the slit to its front, rounding off to a head at the front: on the crust's gentle dome it spreads as it goes, a tongue widening from
// the slit to the edge (wide w at the edge); over the edge it gathers into a narrow drip down the pie's side. Its sheen (the light from the upper
// left) a stripe of the lighter brown along the tongue's upper edge.
const CRUST_LEN = SEG.slice(0, 4).reduce((a, b) => a + b, 0);
function band(front, wfn, off) {
  const n = Math.max(4, Math.ceil(front / 1.6)), L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const d = (front * i) / n, { p, dir } = along(d), head = Math.max(0, Math.min(1, (front - d) / 2.2)), half = (wfn(d) / 2) * Math.sqrt(head);
    const c = [p[0] - dir[1] * off * half, p[1] + dir[0] * off * half];
    L.push([c[0] - dir[1] * half, c[1] + dir[0] * half]); R.push([c[0] + dir[1] * half, c[1] - dir[0] * half]);
  }
  return blob([...L, along(front + 0.5).p, ...R.reverse()]);
}
function ribbon(front, w) {
  if (front < 0.3) return "";
  const wide = (d) => (d <= CRUST_LEN ? 3 + (w - 3) * (d / CRUST_LEN) : 2.8 + (w - 2.8) * Math.max(0, 1 - (d - CRUST_LEN) / 1.6));
  const sheen = Math.min(front, CRUST_LEN) - 1;
  return `<path d="${band(front, wide, 0)}" ${fill("bark")}/>${sheen > 0.5 ? `<path d="${band(sheen, (d) => 0.3 * wide(d), 1.15)}" ${fill("wood-deep")}/>` : ""}`;
}

// ---- the welling: the bubble swells (0.3-0.6), breaks, and the gravy runs: slowly on the crust's gentle slope, fast down the side
const T_BREAK = 0.62, CRUST = CRUST_LEN;
const T_EDGE = T_BREAK + 0.55, T_DOWN = T_EDGE + 0.22;
const front = (t) => (t <= T_BREAK ? 0 : t <= T_EDGE ? CRUST * track([[T_BREAK, 0], [T_EDGE, 1, "in"]], t) : CRUST + (LEN - CRUST) * track([[T_EDGE, 0], [T_DOWN, 1, "in"]], t));
function bubble(t, hold) {
  // a dome of filling in the slit: it swells, breaks over its low side, and settles to a wet bead over the slit
  const swell = track([[0.3, 0], [T_BREAK, 1, "in"], [T_BREAK + 0.12, hold, "out"]], t);
  if (swell <= 0.02) return "";
  const cy = 114.6 - 0.6 * swell, rx = 1.2 + 2.4 * swell, ry = 0.6 + 1.4 * swell;
  return `<ellipse cx="86.2" cy="${n2(cy)}" rx="${n2(rx)}" ry="${n2(ry)}" ${fill("bark")}/><ellipse cx="${n2(86.2 - 0.3 * rx)}" cy="${n2(cy - 0.35 * ry)}" rx="${n2(0.45 * rx)}" ry="${n2(0.3 * ry)}" ${fill("wood-deep")}/>`;
}
// on the potato: a drape spreading from where the gravy lands, over its top and dripping down its front, kept to the potato's own outline
function coat(s, cx, more) {
  if (s < 0.02) return "";
  const a = 2 + 8 * s + 6 * more, top = 131, foot = 136 + 3.5 * s + 7 * more, d1 = 2.2 * s + 3 * more, d2 = 3.2 * s + 4 * more;
  const P = [[cx - a, top], [cx - a * 0.95, foot - 2], [cx - a * 0.55, foot + d1], [cx - a * 0.25, foot - 0.5], [cx + a * 0.1, foot + d2], [cx + a * 0.45, foot - 1], [cx + a * 0.85, foot + 0.6 * d1], [cx + a, top]];
  const lit = [[cx - a * 0.7, top + 2], [cx - a * 0.5, foot - 3.2], [cx + a * 0.1, foot - 3.6], [cx + a * 0.4, top + 2]];
  return `<clipPath id="po"><path d="${MIDDLE}"/></clipPath><g clip-path="url(#po)"><path d="${blob(P)}" ${fill("bark")}/>${s > 0.4 ? `<path d="${blob(lit)}" ${fill("wood-deep")} />` : ""}</g>`;
}

// ---- sad: flooded
// the gravy keeps coming: the ribbon swells, the coat covers the potato and runs off its front, and a pool spreads over the plate from its foot
const T_OVER = T_DOWN + 0.55, SAD_DUR = T_OVER + 1.9;
function pool(t) {
  const s = track([[T_OVER, 0], [T_OVER + 1.7, 1, "out"]], t);
  if (s < 0.01) return "";
  // (the pool's edge: wider to the right, where the plate is open, held in a little by the dish's slope toward its rim)
  const c = [74 + 10 * s, 151 + 1.5 * s], a = 4 + 22 * s, b = 2 + 6.5 * s, P = [];
  for (let i = 0; i < 12; i++) { const q = (i / 12) * 2 * Math.PI, wob = 1 + 0.06 * Math.sin(3 * q + 1) + 0.04 * Math.sin(5 * q + 2); P.push([c[0] + a * wob * Math.cos(q), c[1] + b * wob * Math.sin(q)]); }
  return `<path d="${blob(P)}" ${fill("bark")}/>`;
}
function sad(t) {
  if (t <= 0.3) return STILL;
  const w = 6.5 + 2 * track([[T_DOWN, 0], [T_OVER, 1, "io"]], t);
  const c = track([[T_DOWN - 0.04, 0], [T_DOWN + 0.7, 1, "out"]], t), more = track([[T_DOWN + 0.4, 0], [T_OVER + 0.5, 1, "io"]], t);
  // (running off the potato's front: a tongue from the coat down to the pool)
  const run = track([[T_OVER - 0.2, 0], [T_OVER + 0.15, 1, "in"]], t);
  const tongue = run > 0.02 ? `<path d="M${n2(69.5)} 146C70 ${n2(146 + 4 * run)} ${n2(70.5)} ${n2(148 + 4 * run)} 71 ${n2(147 + 5 * run)}C72 ${n2(148 + 4 * run)} 73.5 ${n2(146 + 4 * run)} 73.5 146Z" ${fill("bark")}/>` : "";
  return `${OPEN}${BACK}${IN}${TABLE}${pool(t)}${PIE}${bubble(t, 1)}${ribbon(front(t), w)}${POTATOES}${coat(c, 71, more)}${tongue}${PEAS}</g></svg>`;
}

export const REACTIONS = { sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
