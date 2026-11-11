// Kitchen's two stories, the pot's: it's popcorn in there, on a lit hob. The kernels start popping, knocking the lid up in little hops, then the
// popped corn swells up out of the pot. Happy: it rises evenly and carries the lid up level on a buttery crown, where it settles. Sad: it rises
// higher on one side: the lid tips, slides off down the far slope and comes to rest propped between the pot's handle and the counter, and a few
// popped pieces tumble down it onto the worktop.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor and its edge, the window (frame, glass, bars), the two
// wall cupboards, the base units and the oven, the counter's edge and top, the tap and the sink, the hob and its trivets, the pot (its two
// handles, body and shade, lid and its shade, knob; its rim at y 102 from x 102 to 138), the lid sitting on it. The pot (24 cm) is 36 here.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"0\" y=\"177\" width=\"200\" height=\"23\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"12,178 186,178 194,184 18,184\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M70 92V50A30 28 0 0 1 130 50V92Z\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M74 88V50A26 24 0 0 1 126 50V88Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><rect x=\"98.5\" y=\"25\" width=\"3\" height=\"63.5\" fill=\"var(--art-violet,#7C5CE6)\"/><rect x=\"73.5\" y=\"60\" width=\"53\" height=\"3\" fill=\"var(--art-violet,#7C5CE6)\"/><rect x=\"14\" y=\"37\" width=\"50\" height=\"51\" rx=\"5\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"14\" y=\"37\" width=\"45\" height=\"47\" rx=\"5\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"51\" cy=\"75\" r=\"2.6\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"136\" y=\"37\" width=\"50\" height=\"51\" rx=\"5\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"136\" y=\"37\" width=\"45\" height=\"47\" rx=\"5\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"143\" cy=\"75\" r=\"2.6\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"10\" y=\"130\" width=\"176\" height=\"49\" rx=\"3\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"13\" y=\"136\" width=\"35\" height=\"38\" rx=\"2.5\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"42.5\" cy=\"147\" r=\"2.2\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"50\" y=\"136\" width=\"35\" height=\"38\" rx=\"2.5\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"55.5\" cy=\"147\" r=\"2.2\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"88\" y=\"132\" width=\"54\" height=\"43\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"102\" cy=\"140\" r=\"2.3\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><circle cx=\"115\" cy=\"140\" r=\"2.3\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><circle cx=\"128\" cy=\"140\" r=\"2.3\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><rect x=\"91\" y=\"146\" width=\"48\" height=\"27\" rx=\"2\" fill=\"var(--art-ink-lit,#3A3460)\"/><rect x=\"96\" y=\"150\" width=\"38\" height=\"19\" rx=\"3\" fill=\"var(--art-sky-deep,#3488C9)\"/><rect x=\"145\" y=\"136\" width=\"33\" height=\"38\" rx=\"2.5\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"151\" cy=\"147\" r=\"2.2\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"8\" y=\"124\" width=\"180\" height=\"9\" rx=\"2.5\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M182 124H185.5Q188 124 188 126.5V130.5Q188 133 185.5 133H182Z\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><rect x=\"8\" y=\"116\" width=\"180\" height=\"9\" rx=\"2.5\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><path d=\"M40 117V101A8 8 0 0 1 56 101V106H52.5V101A4.5 4.5 0 0 0 43.5 101V117Z\" fill=\"var(--art-steel,#A9B0BF)\"/><rect x=\"52.5\" y=\"105\" width=\"3.5\" height=\"1.5\" fill=\"var(--art-steel-deep,#6B687A)\"/><polygon points=\"43,110 49,106 50.5,107.5 43.5,112.5\" fill=\"var(--art-steel,#A9B0BF)\"/><rect x=\"37\" y=\"112\" width=\"10\" height=\"5.5\" rx=\"1.5\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M44 112H45.5Q47 112 47 113.5V117.5H44Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><rect x=\"28\" y=\"117\" width=\"54\" height=\"7\" rx=\"2\" fill=\"var(--art-steel,#A9B0BF)\"/><rect x=\"31\" y=\"118.5\" width=\"48\" height=\"4\" rx=\"1.5\" fill=\"var(--art-steel-deep,#6B687A)\"/><rect x=\"92\" y=\"117.5\" width=\"54\" height=\"6.5\" rx=\"1.5\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M106 117H115V120.5H113.5V118.5H107.5V120.5H106Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M125 117H134V120.5H132.5V118.5H126.5V120.5H125Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><rect x=\"97\" y=\"104\" width=\"8\" height=\"3\" rx=\"1.5\" fill=\"var(--art-clay-deep,#C25626)\"/><rect x=\"135\" y=\"104\" width=\"8\" height=\"3\" rx=\"1.5\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M104 101H136V112Q136 117.5 130 117.5H110Q104 117.5 104 112Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M127 101H136V112Q136 117.5 130 117.5H121Q127 115 127 108Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M102 102C102 96 110 94 120 94C130 94 138 96 138 102Z\" fill=\"var(--art-clay-lit,#F6A06F)\"/><path d=\"M126 94.6C133 95.4 138 97.5 138 102H128C128.5 99 127.8 96.5 126 94.6Z\" fill=\"var(--art-clay,#E8743B)\"/><rect x=\"116.5\" y=\"90.5\" width=\"7\" height=\"4.5\" rx=\"1.5\" fill=\"var(--art-clay,#E8743B)\"/></svg>\n";
export const STILL_HASH = "c7adf0ceed";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 46 || !EL[43].includes("M102 102C102 96 110 94 120 94")) throw new Error("kitchen: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const ROOM = EL.slice(0, 39).join(""), BODY = EL.slice(39, 43).join(""), LID = EL.slice(43).join("");
const RIM = 102, L0 = 103, R0 = 137, MID = [120, 102];
// the popped corn heaped up out of the pot: its top a run of puffs from the left of the rim to the right, hl high at the left and hr at the right
// (drawn behind the pot's body, so it comes up out of the pot)
function crown(hl, hr) {
  if (Math.max(hl, hr) < 0.3) return "";
  const n = 9, pts = [];
  for (let i = 0; i <= n; i++) { const u = i / n, h = (hl + (hr - hl) * u) * Math.sin(Math.PI * u) ** 0.35; pts.push([L0 - 1.5 * Math.sin(Math.PI * u) * (i < n / 2 ? 1 : -1) * Math.min(1, Math.max(hl, hr) / 6) + 34 * u, RIM - h]); }
  let d = `M${n2(pts[0][0])} ${RIM + 4}L${n2(pts[0][0])} ${n2(pts[0][1])}`;
  // (each step along the top a little puff)
  for (let i = 1; i <= n; i++) { const a = pts[i - 1], b = pts[i], r = 0.56 * Math.hypot(b[0] - a[0], b[1] - a[1]); d += `A${n2(r)} ${n2(r)} 0 0 1 ${n2(b[0])} ${n2(b[1])}`; }
  d += `L${n2(pts[n][0])} ${RIM + 4}Z`;
  // a few whiter puffs on it, and its shaded right side
  const puffs = [0.22, 0.45, 0.68].map((u, j) => { const i = Math.round(u * n), p = pts[i]; const k = Math.min(1, Math.max(hl, hr) / 8); return `<circle cx="${n2(p[0] + (j - 1) * 0.6)}" cy="${n2(p[1] + 2.6)}" r="${n2(1.9 * k)}" ${fill("paper")}/>`; }).join("");
  return `<path d="${d}" ${fill("sun-lit")}/>${puffs}<path d="M${n2(pts[6][0])} ${RIM + 4}L${n2(pts[6][0])} ${n2(pts[6][1] + 2)}${pts.slice(7).map((p) => `L${n2(p[0])} ${n2(p[1] + 1)}`).join("")}L${n2(pts[n][0])} ${RIM + 4}Z" ${fill("sun")}/>`;
}
// the lid lifted dy and turned a (degrees) about the middle of its rim, moved dx
const lid = (dx, dy, a = 0) => (Math.abs(dx) + Math.abs(dy) + Math.abs(a) < 0.005 ? LID : `<g transform="translate(${n2(dx)} ${n2(-dy)})${a ? ` rotate(${n2(a)} ${MID[0]} ${MID[1]})` : ""}">${LID}</g>`);
// the first pops knock the lid up in little hops: each one a short throw up and a fall back onto the rim (or onto the corn)
const POPS = [[0.2, 0.9], [0.29, 1.3], [0.36, 0.8], [0.43, 1.6], [0.49, 1.1], [0.56, 1.8], [0.63, 1.2], [0.71, 1.5], [0.8, 0.9], [0.9, 1.1], [1.02, 0.7], [1.15, 0.5], [1.3, 0.35]];
const G = 2450;
const hops = (t) => { let up = 0; for (const [t0, h] of POPS) { const T = 2 * Math.sqrt((2 * h) / G); if (t > t0 && t < t0 + T) { const s = t - t0, v = Math.sqrt(2 * G * h); up = Math.max(up, v * s - 0.5 * G * s * s); } } return up; };

// ---- happy: a crown
const HAPPY_DUR = 2.4, TOP = 10.5;
function happy(t) {
  if (t <= 0) return STILL;
  const h = track([[0.55, 0], [1.4, TOP + 0.6, "out"], [1.6, TOP, "io"]], t);
  return `${OPEN}${ROOM}${crown(h, h)}${BODY}${lid(0, h + hops(t))}</svg>`;
}

// ---- sad: it slides off
const SAD_DUR = 2.6, T_SLIP = 1.08;
// where it comes to rest: its left rim end on the right handle's top, its right rim end on the counter: turned 19.5 degrees
const REST = { dx: 37.6, dy: -9.4, a: 19.5 };
// the popped pieces that roll down it and drop onto the worktop: where each lands, when it leaves the heap
const SPILL = [[156, 114.2, 1.3, 2], [166, 114.6, 1.42, 1.7], [149, 114, 1.55, 1.5]];
function sad(t) {
  if (t <= 0) return STILL;
  // it rises faster on the left
  const HL = (u) => track([[0.55, 0], [1.5, 15, "out"], [1.7, 14.4, "io"]], u), HR = (u) => track([[0.55, 0], [1.5, 7.5, "out"], [1.7, 7.2, "io"]], u);
  const hl = HL(t), hr = HR(t);
  let L;
  if (t < T_SLIP) {
    // (it rides the heap, tipping as one side rises past the other)
    const a = (Math.atan2(hl - hr, 34) * 180) / Math.PI;
    L = lid(0, (hl + hr) / 2 + hops(t), a);
  } else {
    // past the tip, it slides off down the low side, faster and faster, and drops onto the handle and the counter: a knock, and it lies there
    const s = t - T_SLIP, k = Math.min(1, (s / 0.34) ** 2), a0 = (Math.atan2(HL(T_SLIP) - HR(T_SLIP), 34) * 180) / Math.PI;
    const lift0 = (HL(T_SLIP) + HR(T_SLIP)) / 2 + hops(T_SLIP);
    const knock = s > 0.34 ? track([[0.34, 0], [0.4, 1.4, "out"], [0.48, 0, "in"], [0.53, 0.4, "out"], [0.58, 0, "in"]], s) : 0;
    L = lid(REST.dx * k, lift0 + (REST.dy - lift0) * k + knock, a0 + (REST.a - a0) * k);
  }
  const spill = SPILL.map(([x, y, t0, r]) => {
    if (t < t0) return "";
    // (each comes off the heap's right side, rolls down and hops once where it lands)
    const s = t - t0, k = Math.min(1, s / 0.3), sx = 132 + (x - 132) * k, sy = 96 + (y - 96) * k * k - (s > 0.3 && s < 0.4 ? 1.6 * Math.sin((Math.PI * (s - 0.3)) / 0.1) : 0);
    return `<circle cx="${n2(sx)}" cy="${n2(sy)}" r="${r}" ${fill("sun-lit")}/><circle cx="${n2(sx - 0.4)}" cy="${n2(sy - 0.4)}" r="${n2(r * 0.55)}" ${fill("paper")}/>`;
  }).join("");
  return `${OPEN}${ROOM}${crown(hl, hr)}${BODY}${L}${spill}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
