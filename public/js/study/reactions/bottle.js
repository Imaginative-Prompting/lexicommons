// Bottle's two stories, the bottle's own: it is sparkling, and warm, and the pressure in it pushes the cork. It creeps up out of the neck,
// then pops, flies up to the top of the picture and comes down beside the bottle, onto its side. Happy: a crown of foam wells up out of the
// mouth and stands on the lip, a little of it running down the neck, and settles. Sad: it gushes: the foam surges up out of the mouth and
// pours down the shoulders and sides, over the label, and spreads in a pool round the foot, out along the table and round the cork.
// Every frame is a pure function of t, in seconds. The still's own parts: the table, the bottle's shadow, the bottle (its glass, its shaded
// side, the lip at y 18-29 round the mouth at (71, 21.6)), the cork (its body, shade and top, in the mouth), the label.
import { blob, n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<rect x=\"0\" y=\"144\" width=\"200\" height=\"56\" fill=\"var(--art-violet-lit,#A68CFF)\"/>\n<path d=\"M44 180 C53 173 72 171 91 173 L193 200 H82 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M60 24 H82 V45 C82 51 85 54 91 58 C99 64 103.2 72 103.2 81 V168 C103.2 182 96.6 188.8 71 188.8 C47 188.8 38.9 182.7 38.9 168 V81 C38.9 71 43.2 63.6 51.7 57.3 C57.4 53.1 60 50.4 60 45 Z\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M74.2 24 H82 V45 C82 51 85 54 91 58 C99 64 103.2 72 103.2 81 V168 C103.2 182 96.6 188.8 71 188.8 C84.2 187.6 90 182.5 90 171 V81 C90 72 86.5 65.2 81.2 60 C76.7 55.6 75 51.8 75 45 V28 C75 26.3 74.7 25 74.2 24 Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M57.2 22.8 C57.2 19.8 63.4 18.1 71 18.1 C78.6 18.1 84.8 19.8 84.8 22.8 V23.7 C84.8 27.3 79.4 29.2 71 29.2 C62.6 29.2 57.2 27.3 57.2 23.7 Z\" fill=\"var(--art-teal,#37B39B)\"/>\n<ellipse cx=\"71\" cy=\"21.6\" rx=\"13.1\" ry=\"3.1\" fill=\"var(--art-teal-lit,#6FD0BD)\"/>\n<path d=\"M60.3 11.6 H81.7 L80.1 21.4 C75.7 23.2 66.6 23.2 61.9 21.4 Z\" fill=\"var(--art-bark,#7A4E2D)\"/>\n<path d=\"M74.8 12 L81.7 11.6 L80.1 21.4 Q77.7 22.3 75 22.5 Z\" fill=\"var(--art-bark,#7A4E2D)\"/>\n<ellipse cx=\"71\" cy=\"11.6\" rx=\"10.7\" ry=\"2.4\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M38.9 82.4 C38.9 88.6 53.3 93.6 71 93.6 C88.7 93.6 103.2 88.6 103.2 82.4 V134.7 C103.2 141.7 88.7 147.1 71 147.1 C53.3 147.1 38.9 141.7 38.9 134.7 Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M90 91.5 C98.1 89.4 103.2 86.1 103.2 82.4 V134.7 C103.2 139.3 98.1 143.1 90 145.3 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n</svg>\n";
export const STILL_HASH = "fb7b8e9703";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 12 || !EL[7].includes("M60.3 11.6 H81.7")) throw new Error("bottle: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const SCENE = EL.slice(0, 3).join(""), GLASS = EL[3] + EL[4], LIP = EL[5] + EL[6], CORK = EL[7] + EL[8] + EL[9], LABEL = EL[10] + EL[11];
const MOUTH = [71, 21.6];
// the open mouth, dark down the neck (under the cork in the still: its dark comes into the gap as the cork lifts)
const hole = (t) => { const k = Math.min(1, track([[0.3, 0], [T_POP, 6, "in"]], t) / 2.5 + (t > T_POP ? 1 : 0)); return k > 0.004 ? `<ellipse cx="71" cy="21.6" rx="9.6" ry="2.2" ${fill("ink-lit")}${k < 1 ? ` opacity="${n4(k)}"` : ""}/>` : ""; };

// ---- the cork: creeping up out of the neck as the pressure pushes (the rest of it, down in the neck, showing above the mouth as it comes),
// then out: up to the top of the picture, turning over and over once clear of the mouth, and down beside the bottle under its own weight (g, 4900 a second each
// second: the bottle, 30 cm, is 150 high), onto its side; one bounce, a rock, a slide, and it lies there, its short shadow down the light
const T_POP = 0.95, G = 4900, START = 18.75, APEX = -4, REST = [136, 168], SLIDE = 9, HALF = 15.55;
const V_UP = Math.sqrt(2 * G * (START - APEX)), T_AIR = V_UP / G + Math.sqrt((2 * (REST[1] - APEX)) / G), V_B = Math.sqrt(2 * G * 10);
// (straight up out of the neck until its foot clears the mouth: only then can it turn, and drift)
const T_CLEAR = (V_UP - Math.sqrt(V_UP * V_UP - 2 * G * (START + HALF - 21.4))) / G, V_X = (REST[0] - 71) / (T_AIR - T_CLEAR);
const CORK_ALL = `<path d="M61.9 21L62.7 39C66.4 40.8 75.6 40.8 79.3 39L80.1 21Z" ${fill("bark")}/>${CORK}`;
const MOUTH_PLANE = '<clipPath id="mp"><rect x="-10" y="-60" width="220" height="81.4"/><ellipse cx="71" cy="21.4" rx="9.1" ry="1.35"/></clipPath>';
function corkAt(t) {
  if (t <= T_POP) return { x: 71, y: 24.75 - track([[0.3, 0], [T_POP, 6, "in"]], t), a: 0, inNeck: true };
  const s = t - T_POP;
  if (s < T_AIR) { const f = Math.max(0, s - T_CLEAR); return { x: 71 + V_X * f, y: START - V_UP * s + (G * s * s) / 2, a: (450 * f) / (T_AIR - T_CLEAR), inNeck: s < T_CLEAR }; }
  // (on the table: the bounce, the rock as the spin is spent, the slide to a stop)
  const r = s - T_AIR, hop = r < (2 * V_B) / G ? V_B * r - (G * r * r) / 2 : 0;
  return { x: REST[0] + SLIDE * (1 - Math.exp(-r / 0.07)), y: REST[1] - hop, a: 450 + 11 * Math.sin(25 * r) * Math.exp(-r / 0.13) };
}
function cork(t) {
  const p = corkAt(t);
  if (t <= T_POP && p.y === 24.75) return CORK;
  const g = `<g transform="translate(${n2(p.x)} ${n2(p.y)}) rotate(${n2(p.a)}) translate(-71 -24.75)">${CORK_ALL}</g>`;
  return p.inNeck ? `${MOUTH_PLANE}<g clip-path="url(#mp)">${g}</g>` : g;
}
// its shadow on the table, down the light (as far along it as it is high), coming as it comes down near it
function corkShadow(t, tone = "violet-deep") {
  const p = corkAt(t), h = REST[1] - p.y, o = Math.max(0, 1 - h / 60);
  if (p.inNeck || o < 0.004) return "";
  const x = p.x + h, y = 178.6 + 0.265 * h;
  return `<path d="M${n2(x - 14)} ${n2(y)}H${n2(x + 15)}L${n2(x + 36)} ${n2(y + 5.6)}L${n2(x + 8)} ${n2(y + 6)}Z" ${fill(tone)}${o < 1 ? ` opacity="${n4(o)}"` : ""}/>`;
}
// foam: an irregular round mass about (x, y), r across, h high (its edge bubbly)
const BUMPS = [1, 0.86, 1.08, 0.92, 1.04, 0.84, 1.1, 0.9, 1, 0.88, 1.06, 0.94];
function foam(x, y, r, h, tone = "paper") {
  if (r < 0.2) return "";
  const P = BUMPS.map((k, i) => { const a = (i / BUMPS.length) * 2 * Math.PI; return [x + Math.cos(a) * r * k, y + Math.sin(a) * h * k]; });
  return `<path d="${blob(P)}" ${fill(tone)}/>`;
}

// ---- happy: a crown of foam
const HAPPY_DUR = 2.6;
// a head of froth: an ellipse about (x, y), r across, h high, its edge finely bubbled
// (bubbles of all sizes at its edge: no two alike)
const FROTH = [1, 0.95, 1.04, 0.98, 0.93, 1.03, 1.06, 0.96, 1.01, 0.92, 0.99, 1.05, 0.97, 1.02, 0.94, 1.03, 0.98, 1.06, 0.95, 1, 0.93];
function froth(x, y, r, h, tone = "paper") {
  if (r < 0.2) return "";
  return `<path d="${blob(FROTH.map((k, i) => { const a = (i / FROTH.length) * 2 * Math.PI; return [x + Math.cos(a) * r * k, y + Math.sin(a) * h * k]; }))}" ${fill(tone)}/>`;
}
// a run of foam down the neck from the collar: at x, w wide, k of the way to its length
const drip = (x, w, len, k) => (k < 0.02 ? "" : `<path d="M${n2(x - w)} 34V${n2(34 + len * k)}A${w} ${w} 0 0 0 ${n2(x + w)} ${n2(34 + len * k)}V34Z" ${fill("paper")}/>`);
function happy(t) {
  if (t <= 0) return STILL;
  // it wells up out of the mouth into a dome standing over the lip, a little past, and settles; it spills over the lip into a collar round
  // the top of the neck; two runs go down the neck from it, slowing, and stop well above the label
  const k = track([[T_POP + 0.02, 0], [T_POP + 0.4, 1.1, "out"], [1.9, 1, "io"]], t), c = track([[T_POP + 0.2, 0], [1.75, 1, "out"]], t);
  const r1 = track([[T_POP + 0.5, 0], [2.3, 1, "out"]], t), r2 = track([[T_POP + 0.65, 0], [2.4, 1, "out"]], t);
  const collar = c > 0.004 ? `<path d="${blob([[56, 24], [86, 24], [86.4, 24 + 13 * c], [80, 25 + 15 * c], [72, 24 + 12 * c], [64, 25 + 14 * c], [56.4, 24 + 11 * c]])}" ${fill("paper")}/>` : "";
  const dome = k > 0.004 ? froth(71.5, 24 - 6 * k, 21 * k, 14.5 * k, "paper-deep") + froth(70, 22.8 - 6 * k, 18.5 * k, 12.5 * k) : "";
  return `${OPEN}${SCENE}${corkShadow(t)}${GLASS}${LABEL}${LIP}${hole(t)}${collar}${drip(81, 2.4, 16, r1)}${drip(63, 2, 9, r2)}${dome}${cork(t)}</svg>`;
}

// ---- sad: it gushes
const SAD_DUR = 2.9;
// runs of foam down the front of the bottle: each from the lip, down the neck, spreading over the shoulder to its own line, then down; how
// wide it is, how fast its front comes down (some reach the table and pool, some stop on the way)
const RUNS = [
  { path: [[64, 26], [62, 44], [52, 60], [46, 80], [45, 120], [45, 160], [47, 184]], w: 9, speed: 1, to: 1 },
  { path: [[70, 26], [69, 46], [64, 64], [60, 90], [59, 120], [60, 140]], w: 6, speed: 0.8, to: 0.85 },
  { path: [[76, 26], [77, 46], [84, 64], [86, 90], [86, 120], [86, 150], [85, 172]], w: 7, speed: 0.9, to: 0.7 },
  { path: [[79, 26], [81, 46], [92, 60], [99, 80], [100, 120], [100, 160], [98, 183]], w: 8, speed: 0.95, to: 1 },
];
function run({ path, w, speed, to }, k) {
  const reach = Math.min(to, k * speed);
  if (reach < 0.01) return "";
  // (its bubbly front, and the run itself, grow as it starts)
  const n = path.length - 1, end = reach * n, A = [], B = [], g = Math.min(1, reach * 8);
  for (let j = 0; j <= Math.ceil(end); j++) {
    const i = Math.min(j, end), i0 = Math.floor(i), f = i - i0, p = path[Math.min(i0, n)], q = path[Math.min(i0 + 1, n)];
    const x = p[0] + (q[0] - p[0]) * f, y = p[1] + (q[1] - p[1]) * f, ww = (w / 2) * g * (1 - 0.3 * (i / n)) * (1 + 0.18 * Math.sin(i * 2.3 + w));
    A.push([x - ww, y]); B.push([x + ww, y]);
  }
  const tip = [(A[A.length - 1][0] + B[B.length - 1][0]) / 2, A[A.length - 1][1]];
  return `<path d="M${[...A, ...B.reverse()].map((p) => `${n2(p[0])} ${n2(p[1])}`).join(" ")}Z" ${fill("paper")}/>${foam(tip[0], tip[1], w * 0.62 * g, w * 0.5 * g)}`;
}
function sad(t) {
  if (t <= 0) return STILL;
  // the surge: up out of the mouth, a tall head of foam that slumps as it pours over; the runs down both sides; the pool spreading
  const head = track([[T_POP + 0.02, 0], [T_POP + 0.3, 1, "io"], [1.9, 0.55, "io"], [SAD_DUR, 0.4, "io"]], t);
  const reach = track([[T_POP + 0.1, 0], [2.2, 1, "io"]], t);
  const pool = track([[1.85, 0], [SAD_DUR, 1, "out"]], t);
  const g = Math.sqrt(pool);
  // (and on out along the table to where the cork lies, round it: its shadow there falls on the foam); one pool, its edge round both
  const l = track([[2.1, 0], [SAD_DUR, 1, "out"]], t), L = [REST[0] - 6, 185];
  const lobe = (d) => (l > 0.004 ? `<ellipse cx="${n2(L[0] - 24 + 24 * l)}" cy="${L[1]}" rx="${n2(Math.max(0.1, 40 * l - d))}" ry="${n2(Math.max(0.1, 8 * l - d * 0.3))}"/>` : "");
  const puddle = pool > 0.004 ? `<g ${fill("paper-deep")}><ellipse cx="${n2(72 + 8 * pool)}" cy="${n2(186 + 2 * pool)}" rx="${n2(60 * g)}" ry="${n2(10 * g)}"/>${lobe(0)}</g>`
    + `<g ${fill("paper")}><ellipse cx="${n2(70 + 6 * pool)}" cy="${n2(185 + 1.5 * pool)}" rx="${n2(48 * g)}" ry="${n2(7 * g)}"/>${lobe(7)}</g>` : "";
  const lap = l > 0.004 ? `<clipPath id="lb">${lobe(0)}</clipPath><g clip-path="url(#lb)">${corkShadow(t, "paper-deeper")}</g>` : "";
  const rim = l > 0.004 ? foam(REST[0] + SLIDE, 178.8, 17 * l, 2.6 * l) : "";
  return `${OPEN}${SCENE}${corkShadow(t)}${puddle}${lap}${GLASS}${LABEL}${LIP}${hole(t)}${RUNS.map((r) => run(r, reach)).join("")}`
    + `${head > 0.004 ? foam(71, 21 - 25 * head, 21 * Math.sqrt(head), 28 * head, "paper-deep") + foam(70, 19 - 25 * head, 18 * Math.sqrt(head), 23 * head) : ""}${cork(t)}${rim}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
