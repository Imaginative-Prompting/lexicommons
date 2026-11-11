// Time's two stories: an hourglass with its sand running. Happy: the last of the sand runs through. The top empties, the stream's tail drops in, and
// the heap, grown to a peak, slips: a little landslide, and it settles broad. Time's up, done. Sad: as the top drains, a caked clump in it comes
// into view, sinks into the neck and sticks there. The stream stops, its last grains fall, and the sand above it is stuck. Never finishes.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect y=\"155\" width=\"200\" height=\"45\" fill=\"var(--art-violet-lit,#A68CFF)\"/><path d=\"M38.5 167 L128.5 162.5 L200 190.7 V200 H105.4 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M36.5 154 H131.5 V165 A47.5 7 0 0 1 36.5 165 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M108.5 154 H131.5 V165 A47.5 7 0 0 1 108.5 171 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><ellipse cx=\"84\" cy=\"154\" rx=\"47.5\" ry=\"7\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M52 30 H116 C120.5 38 120.5 56 113 68 C106 79 88 84 87.5 94 C88 104 106 110 113 121 C120.5 133 120.5 147 117 152 A33 4.8 0 0 1 51 152 C47.5 147 47.5 133 55 121 C62 110 80 104 80.5 94 C80 84 62 79 55 68 C47.5 56 47.5 38 52 30 Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M103 30 H116 C120.5 38 120.5 56 113 68 C106 79 88 84 87.5 94 C89 86 94 80 99 72 C106 60 108 42 103 30 Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M87.5 94 C88 104 106 110 113 121 C120.5 133 120.5 147 117 152 A33 4.8 0 0 1 107 155.4 C109 140 107 125 99 113 C93 105 88 101 87.5 94 Z\" fill=\"var(--art-sky,#58ADEB)\"/><rect x=\"83.3\" y=\"90\" width=\"1.4\" height=\"34\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M64.5 76 C69 79.5 81.5 84 82.5 93 H85.5 C86.5 84 99 79.5 103.5 76 A19.5 3 0 0 0 64.5 76 Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M96 76 H103.5 C99 79.5 86.5 84 85.5 93 H85 C86 86 95 81.5 96 76 Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><ellipse cx=\"84\" cy=\"76\" rx=\"19.5\" ry=\"3\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M84 123 C88 130 102 134 116.5 141 C117.5 145 116.5 148.5 115 151 A31 4.3 0 0 1 53 151 C51.5 148.5 50.5 145 51.5 141 C66 134 80 130 84 123 Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M94.6 131.2 C100.7 134.2 108.5 137.2 116.5 141 C117.5 145 116.5 148.5 115 151 A31 4.3 0 0 1 104 154.3 C105 145 101 137 94.6 131.2 Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M43 30 H49.5 V155 A3.3 1 0 0 1 43 155 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M47.8 30 H49.5 V155 A3.3 1 0 0 1 47.8 155.9 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M118.5 30 H125 V155 A3.3 1 0 0 1 118.5 155 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M123.3 30 H125 V155 A3.3 1 0 0 1 123.3 155.9 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M36.5 23 H131.5 V32 A47.5 6.5 0 0 1 36.5 32 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M108.5 23 H131.5 V32 A47.5 6.5 0 0 1 108.5 37.6 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><ellipse cx=\"84\" cy=\"23\" rx=\"47.5\" ry=\"6.5\" fill=\"var(--art-wood,#DCA063)\"/></svg>\n";
export const STILL_HASH = "b83a229ffb";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 22) throw new Error("time: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BACK = EL.slice(0, 9).join(""); // the room, the base, the glass and its shading
const [STREAM, SAND, SAND_SHADE, SURFACE, HEAP, HEAP_SHADE] = EL.slice(9, 15);
const FRONT = EL.slice(15).join(""); // the posts and the top
const X = 84, NECK = 93, TOP0 = 76, FLOOR = 152, PEAK0 = 123;
// The top sand's edge against the glass, from its surface (76) down to the neck: its half-width at a level, read off the still's own curve.
const EDGE = [[103.5, 76], [99, 79.5], [86.5, 84], [85.5, 93]];
function halfAt(y) {
  let best = 1.5;
  for (let i = 0; i <= 60; i++) {
    const u = i / 60, a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
    const px = a * EDGE[0][0] + b * EDGE[1][0] + c * EDGE[2][0] + d * EDGE[3][0], py = a * EDGE[0][1] + b * EDGE[1][1] + c * EDGE[2][1] + d * EDGE[3][1];
    if (py <= y) best = px - X;
  }
  return Math.max(0.6, best);
}
// The top sand down to a level: the still's sand below it, and its surface there (as wide as the glass lets it be, a flatter ellipse as it narrows).
function topSand(level, bottom = NECK + 1) {
  if (level >= bottom - 0.3) return "";
  const r = halfAt(level), clip = `<clipPath id="ts"><rect x="40" y="${n2(level)}" width="90" height="${n2(bottom - level)}"/></clipPath>`;
  return `${clip}<g clip-path="url(#ts)">${SAND}${SAND_SHADE}</g><ellipse cx="${X}" cy="${n2(level)}" rx="${n2(r)}" ry="${n2(Math.max(0.3, (3 * r) / 19.5))}" ${fill("sun-lit")}/>`;
}
// The heap, grown or slumped: the still's heap stretched up or down from the floor of the bulb.
const heap = (s) => `<g transform="translate(${X} ${FLOOR}) scale(1 ${n4(s)}) translate(${-X} ${-FLOOR})">${HEAP}${HEAP_SHADE}</g>`;
const peakOf = (s) => FLOOR - (FLOOR - PEAK0) * s;
// The stream: a thin line of falling sand from the neck to the heap, its top end falling once nothing feeds it.
const stream = (top, bottom) => (bottom - top < 0.3 ? "" : `<rect x="83.3" y="${n2(top)}" width="1.4" height="${n2(bottom - top)}" ${fill("sun")}/>`);
const G = 600;

// ---- happy.
const EMPTY = 1.15;
const HAPPY_DUR = 2.3;
function happy(t) {
  if (t <= 0) return STILL;
  // The top drains, faster as the bulb narrows (the same flow through a smaller section), until it's empty.
  const level = track([[0, TOP0], [EMPTY, NECK + 1, "in"]], t);
  // The heap grows to a peak with what falls, then the peak gives: it slumps and spreads, overshooting a touch, and settles.
  const s = track([[0, 1], [EMPTY + 0.2, 1.16, "io"], [EMPTY + 0.42, 1.16], [EMPTY + 0.6, 0.93, "in"], [EMPTY + 0.7, 0.97, "out"], [EMPTY + 0.8, 0.95, "io"]], t);
  // The stream's top end, once the top is empty, falls the rest of the way in.
  const fall = Math.max(0, t - EMPTY), top = 90 + 0.5 * G * fall * fall, bottom = peakOf(s);
  return `${OPEN}${BACK}${stream(Math.min(top, bottom), bottom)}${topSand(level)}${heap(s)}${FRONT}</svg>`;
}

// ---- sad. A caked lump buried in the top sand rides down with it as it drains, and jams in the neck: wider than the neck, dark, with the rest of the
// top sand lying over it. The stream stops, its last grains fall, and then one stuck shudder: the hourglass rocks once on its base and settles, and
// nothing falls. The top stays as it was, stuck; the happy one ends empty.
const PLUG = 0.6, STUCK = 77.6;
const SAD_DUR = 2.2;
const ROOM = EL[0] + EL[1], SHADOW = EL[2], BODY = EL.slice(3, 9).join(""); // the wall and floor; the shadow; the base and the glass
const GLASS = EL[6].match(/ d="([^"]+)"/)[1];
// The lump, at its middle: an egg, widest a little above its middle, tapering to a blunt tip that wedges in the neck; lit from the left.
const egg = (x, y) => `M${n2(x)} ${n2(y - 9.5)}C${n2(x + 7)} ${n2(y - 9.5)} ${n2(x + 11.8)} ${n2(y - 5.4)} ${n2(x + 11.5)} ${n2(y - 0.8)}C${n2(x + 11.2)} ${n2(y + 4.2)} ${n2(x + 4.6)} ${n2(y + 8.6)} ${n2(x)} ${n2(y + 8.6)}C${n2(x - 4.6)} ${n2(y + 8.6)} ${n2(x - 11.2)} ${n2(y + 4.2)} ${n2(x - 11.5)} ${n2(y - 0.8)}C${n2(x - 11.8)} ${n2(y - 5.4)} ${n2(x - 7)} ${n2(y - 9.5)} ${n2(x)} ${n2(y - 9.5)}Z`;
const lump = (x, y) => `<clipPath id="lm"><path d="${egg(x, y)}"/></clipPath><path d="${egg(x, y)}" ${fill("bark-deep")}/><path clip-path="url(#lm)" d="${egg(x - 3.6, y - 0.6)}" ${fill("bark")}/>`;
// Where the top sand stops below: a line from the neck up to the lump's shoulders, domed over its top once it rests there.
const curve = (base, dome) => Array.from({ length: 19 }, (_, i) => { const x = 66 + i * 2, u = Math.max(0, 1 - ((x - X) / 9) ** 2); return [x, base - dome * u]; });
const pts = (list) => list.map(([x, y]) => `${n2(x)},${n2(y)}`).join(" ");
function sad(t) {
  if (t <= 0) return STILL;
  // The top drains as before, a little, until the lump wedges and it stops where it is.
  const level = Math.min(STUCK, track([[0, TOP0], [PLUG, STUCK, "in"]], t));
  // The lump sinks with the sand and wedges: a touch past, and back.
  const cy = track([[0.1, 81.6], [PLUG, 86.2, "in"], [PLUG + 0.05, 85.8, "out"], [PLUG + 0.1, 85.9, "io"]], t);
  // The sand under it runs out of the neck, so the sand's foot rises from the neck to the lump's shoulders, and lies domed over it.
  const base = track([[0, NECK + 1], [PLUG, 82.6, "in"]], t), dome = track([[0.3, 0], [PLUG, 2.4, "io"]], t);
  const edge = curve(base, dome);
  // the heap grows only with what got through before the plug
  const s = track([[0, 1], [PLUG + 0.3, 1.03, "io"]], t);
  const fall = Math.max(0, t - PLUG), top = 90 + 0.5 * G * fall * fall, bottom = peakOf(s);
  // The top sand: the still's, between its surface and the line it now stops at.
  const sandClip = `<clipPath id="ts"><polygon points="40,${n2(level)} 130,${n2(level)} 130,${n2(base)} ${pts([...edge].reverse())} 40,${n2(base)}"/></clipPath>`;
  const sand = level >= base - 0.3 ? "" : `${sandClip}<g clip-path="url(#ts)">${SAND}${SAND_SHADE}</g><ellipse cx="${X}" cy="${n2(level)}" rx="${n2(halfAt(level))}" ry="${n2(Math.max(0.3, (3 * halfAt(level)) / 19.5))}" ${fill("sun-lit")}/>`;
  // The lump shows only where the sand has gone from around it: under that line, and inside the glass.
  const below = `<clipPath id="cb"><polygon points="${pts(edge)} 102,200 66,200"/></clipPath><clipPath id="gl"><path d="${GLASS}"/></clipPath>`;
  const plug = `${below}<g clip-path="url(#gl)"><g clip-path="url(#cb)">${lump(X, cy)}</g></g>`;
  const body = `${BODY}${stream(Math.min(top, bottom), bottom)}${sand}${plug}${heap(s)}${FRONT}`;
  // The shudder, once the last grains are down: knocked up onto its base's right rim, it falls back, a small bounce, and still. Its shadow follows
  // the top over, along the floor.
  const rock = track([[1.12, 0], [1.26, 3.6, "out"], [1.42, 0, "in"], [1.5, 0.7, "out"], [1.58, 0, "in"]], t);
  if (!rock) return `${OPEN}${ROOM}${SHADOW}${body}</svg>`;
  const k = rock * 0.05;
  return `${OPEN}${ROOM}<g transform="matrix(1 0 ${n4(k)} 1 ${n2(-k * 165)} 0)">${SHADOW}</g><g transform="rotate(${n2(rock)} 131.5 165)">${body}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
