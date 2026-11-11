// Fast's two stories: the car racing right (the camera rides with it, widening a little), the road coming at it. Happy: a painted bay
// comes in from the right; the car brakes hard, its nose dipping, its speed lines going, and stops dead in the middle of it. Sad: a fat speed
// hump; it brakes too late: its front wheel strikes the hump and rides up it, the front kicking up on its springs and rocking back, and it
// stops there, nose up, its front wheel on the crest and its rear wheel on the road.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view; the world carries on past its frame.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"144\" width=\"200\" height=\"56\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"57,149.5 164,149.5 200,162 200,200 166,200\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M4,110 C18,108 31,107.4 39.5,107.7 C43.5,107.9 45.5,110 45.5,113 C32,111.5 18,110.5 4,110 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M5,121.5 C17,119.6 29,118.6 37,118.8 C40,118.9 41.5,121 41.5,124.2 C29,122.6 17,121.8 5,121.5 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M11,132.2 C20,130.6 29,130 35.5,130.2 C38.5,130.3 40,132 40,134.6 C31,133.4 21,132.6 11,132.2 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"56.5\" y=\"95\" width=\"4\" height=\"13\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M32,93.5 C32,92 33.5,91.4 35,91.4 L62,91.9 C68,92.2 72,94 74.5,97.6 C61,96.6 48,96.1 38,96.1 C35,96.1 32.6,95.2 32,93.5 Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M54,147 C47,144 43,137 44,128 C44.5,117 47,106.5 55,103.2 C60,102.5 64,103 70,103 C78,102 84,98 92,96 C98,94.5 104,94 110,94 C126,94 140,102 150,112 C164,113 176,118 185,126 C191,131 195,137 193,141 C191,145 180,147 168,147 Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M44.6,135 C60,130 74,133 88,137 C104,141 120,140 138,134 C152,129 166,128 180,131 C186,133 190,135.5 192.4,138 C192,144 180,147 168,147 L54,147 C48.5,144.5 45,140 44.6,135 Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M89,109 C93,101 101,96.5 112,96.6 C126,96.8 138,103.5 147,113.6 C140,116.6 132,116.8 122,115.8 C110,114.4 98,112 89,109 Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><circle cx=\"110.7\" cy=\"126\" r=\"10.5\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"67\" cy=\"133\" r=\"17\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"67\" cy=\"133\" r=\"8\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"155\" cy=\"133\" r=\"17\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"155\" cy=\"133\" r=\"8\" fill=\"var(--art-paper,#FBF7EC)\"/></svg>\n";
export const STILL_HASH = "a01e3b2258";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 16) throw new Error("fast: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const pts = (P) => P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
// the wall and ground carried on; the car's shadow carried on past the frame's edges along its own (inside the frame, the still's own)
const WALL = `<rect x="-300" y="-300" width="900" height="900" ${fill("teal")}/>`, GROUND = `<rect x="-300" y="144" width="900" height="600" ${fill("teal-lit")}/>`;
const SHADOW_PTS = [[57, 149.5], [164, 149.5], [240, 175.9], [240, 232], [189.8, 211]];
const SHADOW = `<polygon points="${pts(SHADOW_PTS)}" ${fill("teal-deep")}/>`;
const WEDGES = EL.slice(3, 6).join(""), BODY = EL.slice(6, 12).join(""), REAR = EL[12] + EL[13], FRONT = EL[14] + EL[15];
// the camera: widening a little about the car's lower middle, so the road ahead shows
const camAt = (t) => 1 - 0.16 * track([[0.08, 0], [0.9, 1, "io"]], t);
const view = (z, inner) => `${OPEN}<g transform="translate(100 140) scale(${n4(z)}) translate(-100 -140)">${inner}</g></svg>`;
// its run: 290 a second (its speed lines say fast), then braking hard (700 a second squared) to a stop; s is how far it's gone
const V0 = 290;
const runner = (tBrake, a) => { const stopT = tBrake + V0 / a, D = V0 * tBrake + (V0 * V0) / (2 * a); return { stopT, D, s: (t) => (t < tBrake ? V0 * t : V0 * tBrake + V0 * Math.min(t - tBrake, V0 / a) - 0.5 * a * Math.min(t - tBrake, V0 / a) ** 2), v: (t) => (t < tBrake ? V0 : Math.max(0, V0 - a * (t - tBrake))) }; };
// its speed lines draw in towards its tail as it slows
const wedges = (k) => (k > 0.99 ? WEDGES : k < 0.01 ? "" : `<g transform="translate(45 0) scale(${n4(k)} 1) translate(-45 0)">${WEDGES}</g>`);

// ---- happy: the bay, painted on the road: its far line behind the car, its near line in front, its ends crossing the road (slanting down
// to us); where the car's shadow lies over them they're in shade
const RUN_H = runner(0.5, 700);
const BAY = [30, 209]; // its ends, where it is when the car has stopped in it
function bayLines(dx) {
  const [a, b] = [BAY[0] + dx, BAY[1] + dx], w = 2.4;
  const P = (x0, x1, y, h) => `<polygon points="${pts([[x0, y], [x1, y], [x1 - 0.5, y + h], [x0 - 0.5, y + h]])}"/>`;
  const end = (x) => `<polygon points="${pts([[x, 145.5], [x + w, 145.5], [x + w - 7, 177.5], [x - 7, 177.5]])}"/>`;
  return P(a, b + w, 145.5, 1.6) + P(a - 7, b + w - 7, 175, 2.5) + end(a) + end(b);
}
const SHADE_CLIP = `<clipPath id="sh"><polygon points="${pts(SHADOW_PTS)}"/></clipPath><clipPath id="lt"><path d="M-300 -300H600V600H-300Z M${SHADOW_PTS.map((p) => `${p[0]} ${p[1]}`).join("L")}Z" clip-rule="evenodd"/></clipPath>`;
const HAPPY_DUR = Math.round((RUN_H.stopT + 0.35 + 0.6) * 100) / 100;
function happy(t) {
  if (t <= 0) return STILL;
  const dx = RUN_H.D - RUN_H.s(t), v = RUN_H.v(t);
  // braking: the nose dips (the body pitching forward on its springs), and comes back up past level as it stops, then settles
  const pitch = track([[0.5, 0], [0.62, 2.6, "out"], [RUN_H.stopT, 2.2, "io"], [RUN_H.stopT + 0.1, -0.9, "out"], [RUN_H.stopT + 0.3, 0, "io"]], t);
  const lines = bayLines(dx);
  const road = `<g clip-path="url(#lt)" ${fill("paper")}>${lines}</g>${SHADOW}<g clip-path="url(#sh)" ${fill("paper-deep")}>${lines}</g>`;
  const body = `<g transform="rotate(${n2(pitch)} 112 128)">${BODY}</g>`;
  return view(camAt(t), `${SHADE_CLIP}${WALL}${GROUND}${road}${wedges(v / V0)}${body}${REAR}${FRONT}`);
}

// ---- sad: the hump, a fat rubber one across the car's lane (15 high, 46 long; its far edge at 145, its near edge at 158, skewed a little
// with depth like the road), yellow with dark chevrons, its near face in shade. It brakes too late: its front wheel strikes the hump's slope
// and rides up it, and the car stops with that wheel on the crest and its rear wheel on the road, nose up. Its front rides on its springs:
// as the wheel climbs, the body lags, then kicks up past, drops back and rocks once to rest (a damped spring on the wheel's climb, about the
// rear axle). The light is low behind it on the left (LIGHT, read off the still's own shadow: a thing h up throws its shadow h·LIGHT further
// along the ground), so the car's shadow follows its tilt, the hump throws one of its own, and the car's falls across the hump's near half.
const RUN_S = runner(0.62, 520), HUMP_L = 46, HUMP_H = 15, R = 17, BASE = 88, AXLE = [67, 133], TRACK = 150, LIGHT = [1.04, 0.36];
const hAt = (u) => (u <= 0 || u >= 1 ? 0 : HUMP_H * Math.sin(Math.PI * u));
const skew = (d) => 2.5 - (5 * (d - 145)) / 13;
const surfaceY = (x, x0) => TRACK - hAt((x - x0 - skew(TRACK)) / HUMP_L);
// the front wheel's center over x: as low as it sits without going into the road or the hump
const wheelY = (x, x0, n = 80) => { let y = Infinity; for (let i = -n; i <= n; i++) { const dx = (R * i) / n; y = Math.min(y, surfaceY(x + dx, x0) - Math.sqrt(R * R - dx * dx)); } return y; };
// the car's pitch (radians, nose up) with its front wheel sitting on the road or the hump and its springs as in the still
const pitchFor = (x0) => {
  if (x0 + skew(TRACK) > AXLE[0] + BASE + R + 0.5) return 0;
  let a = 0;
  for (let k = 0; k < 6; k++) a = Math.asin((AXLE[1] - wheelY(AXLE[0] + BASE * Math.cos(a), x0, 160)) / BASE);
  return a;
};
// where the hump is when it stops: the crest under the front wheel (the crest is sharper than the wheel, so the wheel sits on its very top)
const TH_END = Math.asin(HUMP_H / BASE), HUMP_X0 = AXLE[0] + BASE * Math.cos(TH_END) - skew(TRACK) - HUMP_L / 2;
const x0At = (t) => HUMP_X0 + (RUN_S.D - RUN_S.s(t));
const SAD_DUR = Math.round((RUN_S.stopT + 0.75 + 0.5) * 100) / 100;
// the body's pitch on its springs, worked out once: 2.2 a second, damped to rock once
const SIM = (() => {
  const dt = 1 / 1200, n = Math.ceil(SAD_DUR * 1200) + 2, G = new Float64Array(n), out = new Float64Array(n), W = 2 * Math.PI * 2.2, Z = 0.4;
  for (let i = 0; i < n; i++) G[i] = pitchFor(x0At(i * dt));
  let p = 0, w = 0;
  for (let i = 0; i < n; i++) {
    out[i] = p;
    const gv = i > 0 && i < n - 1 ? (G[i + 1] - G[i - 1]) / (2 * dt) : 0;
    w += (-W * W * (p - G[i]) - 2 * Z * W * (w - gv)) * dt;
    p += w * dt;
  }
  return out;
})();
const pitchAt = (t) => SIM[Math.min(SIM.length - 1, Math.max(0, Math.round(t * 1200)))];
// the hump: its top (lit, then where the car's shadow falls on it), its near face, its chevrons; its own shadow on the road before it
const topAt = (u, v, x0) => { const d = 145 + 13 * v; return [x0 + HUMP_L * u + skew(d), d - hAt(u)]; };
// a convex polygon's clip of the segment a→b (as fractions of it), or null
const clipSeg = (a, b, P) => {
  let lo = 0, hi = 1;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length], nx = q[1] - p[1], ny = p[0] - q[0];
    const fa = (a[0] - p[0]) * nx + (a[1] - p[1]) * ny, fb = (b[0] - p[0]) * nx + (b[1] - p[1]) * ny;
    if (fa > 0 && fb > 0) return null;
    if (fa > 0 || fb > 0) { const f = fa / (fa - fb); if (fa > 0) lo = Math.max(lo, f); else hi = Math.min(hi, f); }
  }
  return lo < hi ? [lo, hi] : null;
};
function shadeOnTop(x0, SH) {
  // a point on the top at height h is in the car's shadow where the ray through it meets the road in the car's shadow there: h·LIGHT on
  const runs = [];
  let run = null;
  for (let i = 0; i <= 64; i++) {
    const u = i / 64, h = hAt(u), g = (v) => { const d = 145 + 13 * v; return [x0 + HUMP_L * u + skew(d) + h * LIGHT[0], d + h * LIGHT[1]]; };
    const c = clipSeg(g(0), g(1), SH);
    if (c) { (run ??= []).push([u, c[0], c[1]]); } else if (run) { runs.push(run); run = null; }
  }
  if (run) runs.push(run);
  return runs.map((r) => `<polygon points="${pts([...r.map(([u, v0]) => topAt(u, v0, x0)), ...r.slice().reverse().map(([u, , v1]) => topAt(u, v1, x0))])}" ${fill("sun-deep")}/>`).join("");
}
function hump(x0, SH) {
  const far = [], near = [];
  for (let i = 0; i <= 24; i++) { far.push(topAt(i / 24, 0, x0)); near.push(topAt(i / 24, 1, x0)); }
  const cast = [[x0 + skew(158), 158]];
  for (let i = 0; i <= 24; i++) { const u = i / 24, h = hAt(u); cast.push([x0 + HUMP_L * u + skew(158) + h * LIGHT[0], 158 + h * LIGHT[1]]); }
  cast.push([x0 + HUMP_L + skew(158), 158]);
  const topFace = `<polygon points="${pts([...far, ...near.slice().reverse()])}" ${fill("sun")}/>`;
  const face = `<polygon points="${pts([...near, [x0 + HUMP_L + skew(158), 158], [x0 + skew(158), 158]])}" ${fill("sun-deep")}/>`;
  let stripes = "";
  for (let i = 0; i < 4; i++) { const u0 = 0.14 + i * 0.2, u1 = u0 + 0.09; stripes += `<polygon points="${pts([topAt(u0, 0.05, x0), topAt(u1, 0.05, x0), topAt(u1, 0.95, x0), topAt(u0, 0.95, x0)])}" ${fill("ink")}/>`; }
  return `<polygon points="${pts(cast)}" ${fill("teal-deep")}/>${topFace}${shadeOnTop(x0, SH)}${face}${stripes}`;
}
// the car's shadow, each corner moved on by how far the part of the car it falls from has risen (nose up about the rear axle, the braking dip
// about its middle): the corners from its rear, under its front, its nose, its roof, its spoiler
const SHADOW_FROM = [57, 164, 193, 150, 40];
const carShadow = (phi, dip) => SHADOW_PTS.map((p, i) => { const x = SHADOW_FROM[i], h = (x - AXLE[0]) * Math.sin(phi) - (x - 112) * Math.sin((dip * Math.PI) / 180); return [p[0] + h * LIGHT[0], p[1] + h * LIGHT[1]]; });
function sad(t) {
  if (t <= 0) return STILL;
  const x0 = x0At(t), v = RUN_S.v(t), phi = pitchAt(t);
  // braking: the nose dips on its springs as in the happy, and comes back as it stops
  const dip = track([[0.62, 0], [0.74, 2.6, "out"], [RUN_S.stopT, 2.2, "io"], [RUN_S.stopT + 0.1, -0.9, "out"], [RUN_S.stopT + 0.3, 0, "io"]], t);
  const SH = carShadow(phi, dip);
  const xw = AXLE[0] + BASE * Math.cos(phi), yw = wheelY(xw, x0);
  const body = `<g transform="rotate(${n4((-phi * 180) / Math.PI)} ${AXLE[0]} ${AXLE[1]})"><g transform="rotate(${n2(dip)} 112 128)">${BODY}</g></g>`;
  const front = `<g transform="translate(${n2(xw - 155)} ${n2(yw - 133)})">${FRONT}</g>`;
  return view(camAt(t), `${WALL}${GROUND}<polygon points="${pts(SH)}" ${fill("teal-deep")}/>${hump(x0, SH)}${wedges(v / V0)}${body}${REAR}${front}`);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
