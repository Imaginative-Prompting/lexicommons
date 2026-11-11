// Buy's two stories, a time-lapse of an afternoon: three tulips bought and left in the bag keep growing (cut tulips do, by several
// centimeters), up out of its mouth between the two handles. Happy: they open, a bouquet standing in the bag. Sad: they lean over towards the
// light at the upper left as they grow, their heavy heads more and more out over the bag's left edge, until the bag tips about its left foot
// and falls over onto its side, the tulips spilling out onto the floor; the camera draws back as it goes.
// The bag falls as a solid: each point of it has a depth (its front at 0, its back at 1), and every depth turns about its own point on the
// line along the bag's left foot. Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, n4, paint, parsePath, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M28.3 149.4l3.1 3.1-2.7 19 95.9 28.5c1.5 .4 3.8 3.3 4.9 4.4l-133.9 0 0-52.1 32.3 0c.1-1 .2-1.9 .4-2.9ZM155.2 149.4c.1 1 .2 1.9 .4 2.9l48.8 0 0 33.4-30.6-10c-3.5-1.2-7-2.3-10.5-3.5-1.8-.5-3.9-.9-5.6-1.9-1.2-.8-2.8-2.2-3.5-3.5-1-1.9-1.7-11.5-2.1-14.3l3.1-3.1Z\" fill=\"var(--art-sun-lit,#FAD57E)\" fill-rule=\"evenodd\"/>\n<path d=\"M157 163.6l.4 3.2 47 15.3 0 22.3-78.9 0c-.4-.5-.1-.7-.7-.8l-97.6-29.1c-.7-.2-1.5-.6-2.2-.9l.6-3.2c.7 0 1.4-.1 2.1-.1l88.3 0c3.3 0 6.5-.1 9.8-.7l20.2-3.8c3.7-.6 7.3-1.5 11-2.2Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M54.6 58.8l3.8 0-.4 3.3 15.7 .1 .6-3.4 3.7 0-.3 3.3 30 0-.3-3.3 3.9 0 .4 3.3 15.7 0-.3-3.3 4 0c0 3.2 0 4 3.5 4.2l-5 63.8-4.4 45.6c-.9 .1-1.9 .2-2.8 .5-.7 .3-1.4 .7-2.1 .8-1.5 .3-3 .1-4.5 .1l-88.2 0c-.9 0-1.8 0-2.7 .1l14.3-111.6 15 0 .4-3.5ZM82.5 143l15.6-14.4c5.6-5.1 11.5-12.5 12.3-20.3 .3-3.7-.2-8.4-2.8-11.3-3.1-3.5-9.7-3.8-13.8-2.4-4.3 1.5-6.9 5.1-10 8.3-3.4-3.3-5.5-7.1-10.3-8.5-4.5-1.3-11.2-.8-14.7 2.9-3.4 3.6-3.8 9.7-2.8 14.3 2.9 12.3 17.2 23.7 26.5 31.4Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M83.8 99.6c2.5-3.6 5.3-6.6 9.4-8.2 9.1-3.7 19.3 2.9 20.6 12.4 1.4 10.1-6.7 20-13.7 26.4l-17.6 16.3c-10.4-8.7-29.8-24.1-30.5-38.6-.4-11.1 10.3-19.9 21-17.1 4.9 1.3 8.1 4.7 10.8 8.8Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M132 62.1l12.7 0 12.7 104.8-22.7 4.6c-4.4 .9-8.8 1.5-13.1 2.4l4.3-44.5c0-.1 0-.2 0-.3l3.7-46c.5-6.9 .8-13.9 1.7-20.8l-4.7 0c-.5-4.7-.8-9.3-1.7-13.8-2.8-13.9-9.8-25.5-25.8-22.2 10.1 9.8 12.4 22.4 13.4 36l-5.7 0c-.5-12.3-3.1-25.5-12.8-33.7-11.2 8.1-14.2 20.6-15.5 33.7l-5.6 0c2.4-14.2 4.7-26.4 16.3-36.1-22.4-3.7-28.7 18.5-30.3 36.1l-5.5 0c1.3-16.3 7.3-36.2 25.4-40.4 3.8-.8 7.7-.9 11.5 0 1.4 .3 2.9 1.1 4.3 1.1 2 0 5.1-1.4 7.5-1.7 6.5-.7 13 1.1 17.9 5.5 9.6 8.6 11.6 23.2 12 35.3Z\" fill=\"var(--art-ink,#231F3B)\"/>\n</svg>\n";
export const STILL_HASH = "13fb4447a7";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 6) throw new Error("buy: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const dOf = (e) => e.match(/ d="([^"]*)"/)[1], fillOf = (e) => e.match(/ fill="([^"]*)"/)[1];
const pts = (P) => P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
// the still's floor is cut round the bag; here it's whole (the bag covers it as before), and the wall carried on past the frame
const WALL = `<rect x="-400" y="-400" width="1100" height="1000" ${fill("sun")}/>`, FLOOR = `<rect x="-400" y="152.3" width="1100" height="600" ${fill("sun-lit")}/>`;

// ---- the handles: one shape in the still, the front one (left) and the back one (right) crossing at the top. The front part: the front
// handle (its legs, its arch; the hole inside it left out), the band where every leg's foot meets the rim (the still draws them over the
// bag's front), and the gusset (the still draws it over the front's right edge). The back part is all the rest: the back handle above the
// band. Things in the bag's mouth go between: in front of the back part, behind the front.
const OUTER = "M40 64L40 58L46 58L46 40L52 24L66 16L91 16L95.5 21.5L99.1 26.3L106 32L114.5 44L115 58L148 58L148 60L161 168L136 174L119 178L119 64Z";
const HOLE = "M59.38 58L106.53 57.99C105.6 47.01 102.58 35.85 94 28.6L89.2 26.2C68.59 22.8 61.61 41.31 59.38 58Z";
const CLIPS = `<clipPath id="hf"><path d="${OUTER}${HOLE}"/></clipPath><clipPath id="hb"><path d="M-400 -400H700V700H-400Z${OUTER}${HOLE}" clip-rule="evenodd"/></clipPath>`;
const bagOver = (inside) => `<g clip-path="url(#hb)">${EL[5]}</g>${inside}${EL[3]}${EL[4]}<g clip-path="url(#hf)">${EL[5]}</g>`;
// ---- the tulips: three, standing in the bag at its middle depth, their feet low in it; each a stem, a leaf, a head. A head grows from a
// closed bud (a narrow cup) to open (its side petals turned out); the light is from the upper left, so a head's left petal is lit, its right
// in shade.
const TULIPS = [
  { foot: [86, 150], lean: -4, tone: ["violet-lit", "violet", "violet-deep"], leaf: -1 },
  { foot: [95, 150], lean: 1.5, tone: ["clay-lit", "clay", "clay-deep"], leaf: 1 },
  { foot: [104, 150], lean: 6, tone: ["paper", "paper-mid", "paper-deep"], leaf: 1 },
];
const STEM = paint("teal-deep"), LEAF = paint("teal");
/** One tulip: its foot, its head at `head`, its stem bowed by `bow` (sideways at its middle), open o (0 a bud, 1 open), turned `rot`°. */
function tulip(T, head, bow, o, rot, knee = null) {
  const [f, h] = [T.foot, head], mid = knee ?? [(f[0] + h[0]) / 2 + bow, (f[1] + h[1]) / 2];
  const stem = `<path d="M${n2(f[0])} ${n2(f[1])}Q${n2(mid[0])} ${n2(mid[1])} ${n2(h[0])} ${n2(h[1])}" fill="none" stroke="${STEM}" stroke-width="2.8" stroke-linecap="round"/>`;
  // a leaf from the stem near the rim, curving out and up (it grows with the stem)
  const lb = knee ? lerp(knee, h, 0.15) : lerp(f, h, 0.6), ll = knee ? 0 : 0.35 * Math.hypot(h[0] - f[0], h[1] - f[1]) - 10, lt = [lb[0] + T.leaf * 0.42 * ll + bow * 0.3, lb[1] - ll];
  const leaf = ll < 1 ? "" : `<path d="M${n2(lb[0])} ${n2(lb[1])}Q${n2(lb[0] + T.leaf * 0.5 * ll)} ${n2(lb[1] - 0.35 * ll)} ${n2(lt[0])} ${n2(lt[1])}Q${n2(lb[0] + T.leaf * 0.12 * ll)} ${n2(lb[1] - 0.5 * ll)} ${n2(lb[0])} ${n2(lb[1])}Z" fill="${LEAF}"/>`;
  // the head, drawn about its foot on the stem's end, pointing up: the back petal (shade), the side petals turned out by o, the front petal
  const spread = 26 * o, w = 6.6 + 2.6 * o, hh = 19 - 2.5 * o;
  const petal = (dx, ang, tone, wid) => `<path d="M${n2(dx)} 0C${n2(dx - wid)} -2 ${n2(dx - wid * 0.9)} ${n2(-hh * 0.7)} ${n2(dx)} ${n2(-hh)}C${n2(dx + wid * 0.9)} ${n2(-hh * 0.7)} ${n2(dx + wid)} -2 ${n2(dx)} 0Z" transform="rotate(${n2(ang)})" fill="${paint(tone)}"/>`;
  const headSvg = petal(0, 0, T.tone[2], w) + petal(-1.2, -spread, T.tone[0], w * 0.92) + petal(1.2, spread, T.tone[2], w * 0.92) + petal(0, 0, T.tone[1], w * 0.78);
  return `${leaf}${stem}<g transform="translate(${n2(h[0])} ${n2(h[1])}) rotate(${n2(rot)})">${headSvg}</g>`;
}
// how tall each has grown: from its head low in the bag (out of sight below the rim, 62) to well above the handles
const grownAt = (g) => 64 + 62 * g; // from its foot

// ---- happy
const HAPPY_DUR = 2.2 + 0.6;
function happy(t) {
  if (t <= 0) return STILL;
  const g = track([[0.1, 0], [1.8, 1, "io"]], t), o = track([[1.1, 0], [2.2, 1, "io"]], t);
  // (a little sway as they open: alive)
  const sway = Math.sin(t * 3.1) * 1.2 * o;
  const flowers = TULIPS.map((T, i) => {
    const up = grownAt(g) + i * 3 * g, lean = T.lean * (0.4 + 0.6 * g) + sway * (i - 1) * 0.6;
    return tulip(T, [T.foot[0] + lean * 1.6, T.foot[1] - up], lean * 0.5, o, lean * 1.4);
  }).join("");
  return `${OPEN}${CLIPS}${WALL}${FLOOR}${EL[2]}${bagOver(flowers)}</svg>`;
}

// ---- sad. The bag as a solid, falling left about its left foot. Its depth runs back along its foot (35.8, −7 from front to back, the
// gusset's own foot); the front, the heart and the handles are at the front (0), the gusset goes from 0 at its front edge to 1 at its back.
const F0 = [28.8, 172], DEPTH = [35.8, -7];
const gussetZ = (x, y) => {
  if (y < 62) return 0;
  if (y > 166.9) return Math.max(0, Math.min(1, (x - 121.6) / (157.4 - 121.6)));
  const fx = 131.3 + ((121.6 - 131.3) * (y - 62.3)) / (173.9 - 62.3), bx = 144.7 + ((157.4 - 144.7) * (y - 62.1)) / (166.9 - 62.1);
  return Math.max(0, Math.min(1, (x - fx) / (bx - fx)));
};
const runsOf = (d) => parsePath(d);
const FRONT_RUNS = runsOf(dOf(EL[3])), HEART_RUNS = runsOf(dOf(EL[4])), HANDLE_RUNS = runsOf(dOf(EL[5]));
// the bag's floor, never seen standing (it faces down), in view on its right once it's down on its side
const BOTTOM = [[28.8, 171.6, 0], [121.6, 173.9, 0], [157.4, 166.9, 1], [64.6, 164.6, 1]];
function turner(phi) {
  const a = (-phi * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  return (x, y, z) => { const ax = F0[0] + DEPTH[0] * z, ay = F0[1] + DEPTH[1] * z, dx = x - ax, dy = y - ay; return [ax + c * dx - sn * dy, ay + sn * dx + c * dy]; };
}
const drawRuns = (runs, zf, tr, attrs) => {
  let d = "";
  for (const r of runs) {
    const map = (q) => tr(q[0], q[1], zf(q[0], q[1]));
    const p0 = map(r.segs[0][0]); d += `M${n2(p0[0])} ${n2(p0[1])}`;
    for (const sg of r.segs) { const [p1, p2, p3] = [map(sg[1]), map(sg[2]), map(sg[3])]; d += `C${n2(p1[0])} ${n2(p1[1])} ${n2(p2[0])} ${n2(p2[1])} ${n2(p3[0])} ${n2(p3[1])}`; }
    if (r.closed) d += "Z";
  }
  return `<path d="${d}" ${attrs}/>`;
};
// the shadow: the still's, carried on past the frame to the bag's top; as it goes over, it becomes the outline of every point of the bag
// thrown along the light (1.3, 0.39 for each unit of height, the still's own edges' slant) over the first 25°, and from there it is that
const STILL_SHADOW = [[157, 163.6], [157.4, 166.8], [281, 207], [183, 221], [124.8, 203.6], [27.2, 174.5], [25, 173.6], [25.6, 170.4], [27.7, 170.3], [116, 170.3], [125.8, 169.6], [146, 165.8]];
const LIGHT = [1.3, 0.39], floorAt = (z) => F0[1] + DEPTH[1] * z;
const shadowOf = (p, z) => { const fl = floorAt(z), h = Math.max(0, fl - p[1]); return [p[0] + h * LIGHT[0], fl + h * LIGHT[1]]; };
const ALL = [...FRONT_RUNS, ...HANDLE_RUNS].flatMap((r) => r.segs.flatMap((sg) => [sg[0], sg[3]])).map(([x, y]) => [x, y, gussetZ(x, y)]).concat(BOTTOM);
function hull(P) {
  const Q = [...P].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of Q) { while (lo.length > 1 && cross(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p); }
  for (const p of Q.reverse()) { while (hi.length > 1 && cross(hi.at(-2), hi.at(-1), p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function even(P, N) {
  let area = 0;
  for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; area += p[0] * q[1] - q[0] * p[1]; }
  const Q = area < 0 ? [...P].reverse() : P, k = Q.reduce((m, p, i) => (p[0] < Q[m][0] ? i : m), 0), R = Q.slice(k).concat(Q.slice(0, k));
  const L = R.map((p, i) => Math.hypot(R[(i + 1) % R.length][0] - p[0], R[(i + 1) % R.length][1] - p[1])), total = L.reduce((x, y) => x + y, 0);
  const out = []; let i = 0, acc = 0;
  for (let n = 0; n < N; n++) { const want = (n / N) * total; while (acc + L[i] < want) { acc += L[i]; i++; } out.push(lerp(R[i], R[(i + 1) % R.length], L[i] ? (want - acc) / L[i] : 0)); }
  return out;
}
const STILL_EVEN = even(STILL_SHADOW, 48);
function bagShadow(phi, tr) {
  if (phi <= 0) return `<polygon points="${pts(STILL_SHADOW)}" ${fill("sun-deep")}/>`;
  const H = even(hull(ALL.map(([x, y, z]) => shadowOf(tr(x, y, z), z))), 48), u = track([[0, 0], [25, 1, "io"]], phi);
  return `<polygon points="${pts(STILL_EVEN.map((p, i) => lerp(p, H[i], u)))}" ${fill("sun-deep")}/>`;
}
// the fall, worked out once: once the tulips' weight has it leaning past its foot it topples like a rod 120 tall (3g/2l, gravity 2725: the
// bag is 110 high, about 40 cm), from rest, until its side is down at 90°
// (the bag narrows upwards, its sides leaning in 5.1°, so it's down flat on its side at 95.1°)
const DOWN = 95.1, T_TIP = 1.45, FALL = (() => { const out = []; let p = 0, w = 0; const dt = 1 / 600; while (p < ((DOWN - 3) * Math.PI) / 180) { w += 34 * Math.sin(p + 0.06) * dt; p += w * dt; out.push(p); } return out; })();
const T_DOWN = T_TIP + FALL.length / 600;
const phiAt = (t) => {
  if (t < T_TIP) return 3 * track([[1.05, 0], [T_TIP, 1, "in"]], t);
  if (t < T_DOWN) return 3 + (FALL[Math.min(FALL.length - 1, Math.round((t - T_TIP) * 600))] * 180) / Math.PI;
  return DOWN - track([[T_DOWN, 0], [T_DOWN + 0.07, 3.5, "out"], [T_DOWN + 0.16, 0, "in"], [T_DOWN + 0.23, 0.8, "out"], [T_DOWN + 0.3, 0, "in"]], t);
};
const SAD_CAM = (t) => { const k = track([[1.2, 0], [2.1, 1, "io"]], t); return [1 - 0.38 * k, 100 - 90 * k, 100 + 38 * k]; };
// (the camera's holder is there from the first frame on, so nothing is held anew when it starts to move)
const view = ([z, fx, fy], inner) => `${OPEN}<g transform="translate(100 100) scale(${n4(z)}) translate(${n2(-fx)} ${n2(-fy)})">${inner}</g></svg>`;
const SAD_DUR = Math.round((T_DOWN + 0.3 + 0.7) * 100) / 100;
function sad(t) {
  if (t <= 0) return STILL;
  const g = track([[0.1, 0], [1.4, 1, "io"]], t), o = track([[0.8, 0], [1.6, 0.75, "io"]], t);
  // they lean to the light as they grow, more and more
  const toLight = track([[0.5, 0], [1.6, 1, "in"]], t);
  const phi = phiAt(t), tr = turner(phi);
  const flowers = TULIPS.map((T, i) => {
    const up = grownAt(g) + i * 3 * g, lean = T.lean * (0.4 + 0.6 * g) - 34 * toLight - i * 4 * toLight;
    // in the bag's own frame (drawn against its front, so turned with it): its foot, where it leaves the mouth (over the rim's left corner if
    // it leans that far: it bends there), and its head out beyond
    const rad = (lean * Math.PI) / 180, outLen = up - (T.foot[1] - 62);
    const exitB = [Math.max(44, Math.min(120, T.foot[0] + Math.sin(rad) * (T.foot[1] - 62))), 62];
    const headB = [exitB[0] + Math.sin(rad) * outLen, exitB[1] - Math.cos(rad) * outLen];
    const foot = tr(T.foot[0], T.foot[1], 0), exit = tr(exitB[0], exitB[1], 0);
    let head = tr(headB[0], headB[1], 0);
    // down at the end of the fall: a head that would go through the floor lies on it, its stem laid along the floor from the mouth
    // (each lying on the floor a little nearer us than the bag's foot, spread out in depth)
    const rest = F0[1] - 5 + i * 4.5;
    // (its head points along its stem, turned with the bag; once it's down, along the stem on the floor: the two agree as it touches down)
    let dir = lean - phi;
    if (head[1] > rest && exit[1] < rest + 6) {
      const dy = Math.max(0, rest - exit[1]), dx = Math.sqrt(Math.max(0, outLen * outLen - dy * dy));
      head = [exit[0] - dx, rest];
      dir = (Math.atan2(head[0] - exit[0], exit[1] - head[1]) * 180) / Math.PI;
    }
    return tulip({ ...T, foot }, head, 0, o, dir, exit);
  }).join("");
  const bottom = `<polygon points="${pts(BOTTOM.map(([x, y, z]) => tr(x, y, z)))}" ${fill("paper-deep")}/>`;
  if (phi <= 0) return view(SAD_CAM(t), `${CLIPS}${WALL}${FLOOR}${EL[2]}${bagOver(flowers)}`);
  const front = drawRuns(FRONT_RUNS, () => 0, tr, `fill="${fillOf(EL[3])}" fill-rule="evenodd"`);
  const heart = drawRuns(HEART_RUNS, () => 0, tr, `fill="${fillOf(EL[4])}"`);
  const handles = drawRuns(HANDLE_RUNS, gussetZ, tr, `fill="${fillOf(EL[5])}"`);
  // (the handle clips turn with the bag: they're at its front, depth 0)
  const scene = `${WALL}${FLOOR}${bagShadow(phi, tr)}${bottom}<g clip-path="url(#hb3)">${handles}</g>${flowers}${front}${heart}<g clip-path="url(#hf3)">${handles}</g>`;
  const clips = `<clipPath id="hf3"><path d="${OUTER}${HOLE}" transform="${bagMatrix(phi)}"/></clipPath><clipPath id="hb3"><path d="M-900 -900H1100V1100H-900Z${mapPath(OUTER + HOLE, tr)}" clip-rule="evenodd"/></clipPath>`;
  return view(SAD_CAM(t), `${clips}${scene}`);
}
// the front's own turn (all its points are at depth 0) as one matrix, for the handle clips
function bagMatrix(phi) {
  const a = (-phi * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  return `matrix(${n4(c)} ${n4(sn)} ${n4(-sn)} ${n4(c)} ${n2(F0[0] - c * F0[0] + sn * F0[1])} ${n2(F0[1] - sn * F0[0] - c * F0[1])})`;
}
const mapPath = (d, tr) => parsePath(d).map((r) => { let s = ""; const m = (q) => tr(q[0], q[1], 0); const p0 = m(r.segs[0][0]); s += `M${n2(p0[0])} ${n2(p0[1])}`; for (const sg of r.segs) { const [a1, a2, a3] = [m(sg[1]), m(sg[2]), m(sg[3])]; s += `C${n2(a1[0])} ${n2(a1[1])} ${n2(a2[0])} ${n2(a2[1])} ${n2(a3[0])} ${n2(a3[1])}`; } return s + (r.closed ? "Z" : ""); }).join("");

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
