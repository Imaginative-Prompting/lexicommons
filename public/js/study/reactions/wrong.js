// Wrong's two stories, the block's own weight on the round rim. The block stands rolled about 20° onto its right side, its corner forced
// into the round hole. Happy: its weight is left of that corner: it rolls back, the corner riding up out of the hole over the rim, and it
// sits down square and flat on the board with a small knock: the wrong way given up, set down right. Sad: its weight bears down on the
// rim instead: the rim in front of the hole splits along two seams, a wedge of wood breaks out and drops onto the floor in front, and the
// block's corner sinks into the notch, jammed deeper.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view. The block's 3D is read off its
// three edges under the board's projection (screen x = X + 0.148 Z, y = 161 − H − 0.368 Z): an upright cube rolled ~20° about the depth axis.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect y=\"136\" width=\"200\" height=\"64\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"150,129.6 200,158.8 200,200 61.7,200 24,178 30,170\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M22.2,155.4L35.8,121.6Q38,116 44,116H160Q166,116 164.4,120.4V138L150.2,173.4Q148,179 142,179H26Q20.5,179 20.5,173.4V158Q20.5,156.5 22.2,155.4Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M20.5,157H148.5V177Q147,179 142,179H26Q20.5,179 20.5,173.4Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M26,161Q20,161 22.2,155.4L35.8,121.6Q38,116 44,116H160Q166,116 163.8,121.6L150.2,155.4Q148,161 142,161Z\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"90,142 124,121 156,124 146,150 112,155\" fill=\"var(--art-wood-deep,#B97F45)\"/><ellipse cx=\"91.7\" cy=\"138.8\" rx=\"18.5\" ry=\"6.8\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M73.2,138.8A18.5,6.8 0 0 1 110.2,138.8A18.5,4.2 0 0 0 73.2,138.8Z\" fill=\"var(--art-bark,#7A4E2D)\"/><polygon points=\"82.5,15.2 150.3,46.3 120.5,117.3 92.2,140.7 24.4,109.6 54.2,38.6\" fill=\"var(--art-sky-deep,#3488C9)\"/><polygon points=\"54.2,38.6 122,69.7 92.2,140.7 24.4,109.6\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"82.5,15.2 150.3,46.3 122,69.7 54.2,38.6\" fill=\"var(--art-sky-lit,#8FCDF4)\"/></svg>\n";
export const STILL_HASH = "4682b105aa";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 12) throw new Error("wrong: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const pts = (P) => P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
// the still's parts: the wall, floor and the board's shadow on it; the board (its edge, its front, its top); the block's shadow on the
// board; the hole and its far inner wall; the block
const ROOM = EL.slice(0, 3).join(""), BOARD = EL.slice(3, 6).join(""), HOLE = EL[7] + EL[8];
const TOP_D = /d="([^"]+)"/.exec(EL[5])[1];
const A = 0.148, B = 0.368;
// the block's corners as the still draws them, and in the world (fitted: edges 70.1,-25.3,-15.7 / 17,-4.7,76.2 / -30,-71.5,1.4)
const S = { T0: [54.2, 38.6], T1: [122, 69.7], T2: [150.3, 46.3], T3: [82.5, 15.2], B0: [24.4, 109.6], B1: [92.2, 140.7], B2: [120.5, 117.3] };
const W = { T0: [43.2, 94.9, 74.6], T1: [113.3, 69.6, 58.9], T2: [130.3, 64.9, 135.1], T3: [60.2, 90.2, 150.8], B0: [13.2, 23.4, 76], B1: [83.3, -1.9, 60.3], B2: [100.3, -6.6, 136.5], B3: [30.2, 18.7, 152.2] };
const proj = ([X, H, Z]) => [X + A * Z, 161 - H - B * Z];
// a turn about the depth axis through the pivot (anticlockwise as we see it, positive), then a shift of the world (dX, dH); on screen each
// corner moves by its world move (the depth unchanged), from where the still draws it
function moved(name, ang, pivot, dX = 0, dH = 0) {
  const [X, H] = W[name], r = (ang * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), x = X - pivot[0], h = H - pivot[1];
  const X2 = pivot[0] + c * x - s * h + dX, H2 = pivot[1] + s * x + c * h + dH;
  const base = S[name] ?? proj(W[name]);
  return [base[0] + (X2 - X), base[1] - (H2 - H)];
}
function block(ang, pivot, dX, dH) {
  const P = {};
  for (const k of Object.keys(W)) P[k] = moved(k, ang, pivot, dX, dH);
  // as the still: the outline in the right face's shade, the front and top over it
  return `<polygon points="${pts([P.T3, P.T2, P.B2, P.B1, P.B0, P.T0])}" ${fill("sky-deep")}/><polygon points="${pts([P.T0, P.T1, P.B1, P.B0])}" ${fill("sky")}/><polygon points="${pts([P.T3, P.T2, P.T1, P.T0])}" ${fill("sky-lit")}/>`;
}
// the block's shadow on the board: the still's own, and the shape the light (falling right, down and towards us) really throws
const STILL_SHADOW = [[90, 142], [124, 121], [156, 124], [146, 150], [112, 155]];
const LIGHT = [0.36, -0.875, -0.324];
function hull(P) {
  P = P.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cr = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]), lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function thrown(ang, pivot, dX, dH) {
  const r = (ang * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return hull(Object.values(W).map(([X, H, Z]) => {
    const x = X - pivot[0], h = H - pivot[1], X2 = pivot[0] + c * x - s * h + dX, H2 = Math.max(0, pivot[1] + s * x + c * h + dH), t = H2 / -LIGHT[1];
    return proj([X2 + t * LIGHT[0], 0, Z + t * LIGHT[2]]);
  }));
}
// two closed outlines resampled to the same number of points by length, from their leftmost point, so one can turn into the other
function even(P, n) {
  const i0 = P.reduce((m, p, i) => (p[0] < P[m][0] ? i : m), 0), Q = [...P.slice(i0), ...P.slice(0, i0)], L = [];
  let tot = 0;
  for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length]; L.push(Math.hypot(b[0] - a[0], b[1] - a[1])); tot += L[i]; }
  const out = [];
  for (let k = 0; k < n; k++) {
    let d = (k / n) * tot, i = 0;
    while (d > L[i]) { d -= L[i]; i++; }
    const a = Q[i], b = Q[(i + 1) % Q.length], f = L[i] ? d / L[i] : 0;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}
const shadowOn = (P) => `<clipPath id="bt"><path d="${TOP_D}"/></clipPath><g clip-path="url(#bt)"><polygon points="${pts(P)}" ${fill("wood-deep")}/></g>`;
const PIVOT = [W.B1[0], W.B1[1]];

// ---- happy: it rolls back as a body falling about its corner (slow to start, quickening), the corner riding up 1.9 out of the hole
// onto the rim as it comes; the bottom lands flat, knocks a little and settles. The shadow goes from the still's to the one it throws.
const UP = 19.9, T_GO = 0.3, T_LAND = 1.0;
const HAPPY_DUR = T_LAND + 0.35 + 0.6;
function happy(t) {
  if (t <= 0) return STILL;
  const ang = track([[T_GO, 0], [T_LAND, UP, "in"], [T_LAND + 0.07, UP - 1.3, "out"], [T_LAND + 0.15, UP, "in"], [T_LAND + 0.21, UP - 0.3, "out"], [T_LAND + 0.27, UP, "in"]], t);
  const lift = 1.9 * track([[T_GO, 0], [T_LAND, 1, "io"]], t);
  const w = Math.min(1, ang / UP);
  const A0 = even(STILL_SHADOW, 40), A1 = even(thrown(ang, PIVOT, 0, lift), 40);
  const shadow = A0.map((p, i) => [p[0] + (A1[i][0] - p[0]) * w, p[1] + (A1[i][1] - p[1]) * w]);
  return `${OPEN}${ROOM}${BOARD}${shadowOn(shadow)}${HOLE}${block(ang, PIVOT, 0, lift)}</svg>`;
}

// ---- sad: it presses (a hair deeper), the rim in front splits (two seams running out from the hole), and a chunk of the rim between them
// breaks out forward and drops onto the floor in front, landing on its broken base; the corner drops into the notch and the block tips a
// little further over. Broken wood is raw and lighter than the board's finished top: the chunk's broken faces, and the notch's broken floor
// and side seen through the gap.
const HC = [91.7, 138.8], RX = 18.5, RY = 6.8, A0D = 45, A1D = 135, OUT_R = 14, DEEP = 5;
const ell = (rx, ry, deg) => { const a = (deg * Math.PI) / 180; return [HC[0] + rx * Math.cos(a), HC[1] + ry * Math.sin(a)]; };
const rndJ = (i) => { const x = Math.sin(i * 57.31 + 9.7) * 43758.5453; return x - Math.floor(x) - 0.5; };
// the rim (along the hole) and the break's outer edge, jagged, both from the right seam (45°) to the left (135°)
const RIM = Array.from({ length: 9 }, (_, i) => ell(RX + 0.2, RY + 0.2, A0D + ((A1D - A0D) * i) / 8));
const OUTER = Array.from({ length: 9 }, (_, i) => { const j = i === 0 || i === 8 ? 0 : 3.2 * rndJ(i); return ell(RX + OUT_R + j, RY + 5.2 + 0.37 * j, A0D + ((A1D - A0D) * i) / 8); });
const CHUNK_TOP = [...RIM, ...OUTER.slice().reverse()];
// its broken faces as they come out of the board (out 0..1): the front, under the outer edge, its lower edge splintered; the right end
const SPLINTER = OUTER.map((p, i) => [p[0] + 1.2 * rndJ(i + 20), p[1] + DEEP + 1.4 * rndJ(i + 40)]);
const chunkFaces = (out) => {
  const front = [...OUTER, ...SPLINTER.map((p, i) => [p[0], OUTER[i][1] + (p[1] - OUTER[i][1]) * out]).reverse()];
  const end = [RIM[0], OUTER[0], [OUTER[0][0], OUTER[0][1] + DEEP * out], [RIM[0][0], RIM[0][1] + DEEP * out]];
  return `<polygon points="${pts(end)}" ${fill("skin-deep")}/><polygon points="${pts(front)}" ${fill("skin")}/>`;
};
// the notch left in the board: dark broken wood deep in, its floor of raw wood seen past the outer edge, and its left side (which faces
// the camera) raw too
const NOTCH = (() => {
  const floor = [...OUTER, ...OUTER.slice().reverse().map((p, i) => { const r = RIM[8 - i]; return [p[0] + (r[0] - p[0]) * 0.42 + 0.8 * rndJ(i + 60), p[1] + (r[1] - p[1]) * 0.42]; })];
  const side = [RIM[8], OUTER[8], [OUTER[8][0] + 2.2, OUTER[8][1] + 1.2], [RIM[8][0] + 2.2, RIM[8][1] + 1.6]];
  return `<clipPath id="nt"><polygon points="${pts(CHUNK_TOP)}"/></clipPath><polygon points="${pts(CHUNK_TOP)}" ${fill("bark-deep")}/><g clip-path="url(#nt)"><polygon points="${pts(floor)}" ${fill("skin")}/><polygon points="${pts(side)}" ${fill("skin-deep")}/></g>`;
})();
const BASE_Y = Math.max(...SPLINTER.map((p) => p[1])), FLOOR_Y = 194;
const T_CRACK = 0.6, T_BREAK = 0.78, G = 2500;
const SAD_DUR = Math.round((T_BREAK + 0.5 + 0.6) * 100) / 100;
function sad(t) {
  if (t <= 0) return STILL;
  // the block: a hair deeper as it presses, then dropping into the notch as the chunk goes, tipping 3° further over, a small knock
  const sink = track([[0.2, 0], [T_CRACK, 0.8, "in"], [T_BREAK, 1.2], [T_BREAK + 0.1, 6, "in"], [T_BREAK + 0.16, 5.4, "out"], [T_BREAK + 0.24, 6, "in"]], t);
  const tip = -3 * track([[T_BREAK, 0], [T_BREAK + 0.1, 1, "in"], [T_BREAK + 0.16, 0.9, "out"], [T_BREAK + 0.24, 1, "in"]], t);
  const shadow = STILL_SHADOW.map((p) => [p[0] + 0.2 * sink, p[1] + 0.5 * sink]);
  // the seams: two cracks running out from the rim at the chunk's ends as the rim takes the load (after the break, the notch's sides)
  const k = track([[T_CRACK, 0], [T_BREAK, 1, "out"]], t);
  let notch = "", front = "";
  if (k > 0.01) {
    const seam = (i) => { const p = RIM[i], q = OUTER[i]; return `M${n2(p[0])} ${n2(p[1])}L${n2(p[0] + (q[0] - p[0]) * k)} ${n2(p[1] + (q[1] - p[1]) * k)}`; };
    const seams = `<path d="${seam(0)}${seam(8)}" stroke="${paint("ink")}" stroke-width="1.2" stroke-linecap="round" fill="none"/>`;
    // the chunk is its own piece from the first crack (the same wood where it lay, the notch under it), so the notch shows only as it
    // moves. Thrown forward off the board's edge, tipping as it goes, it lands on its broken base on the floor in front and rocks once.
    const s = Math.max(0, t - T_BREAK), drop = FLOOR_Y - BASE_Y, sLand = (60 + Math.sqrt(60 * 60 + 2 * G * drop)) / G, u = Math.min(s, sLand);
    const x = -14 * u, bounce = s > sLand ? -2 * Math.max(0, Math.sin(Math.min(1, (s - sLand) / 0.1) * Math.PI)) : 0;
    const y = -60 * u + 0.5 * G * u * u + bounce, ang = 28 * Math.sin(Math.PI * (u / sLand));
    const out = Math.min(1, Math.hypot(x, -60 * u + 0.5 * G * u * u) / 4);
    const cx = HC[0], cy = BASE_Y;
    // its shadow on the floor, under its base, growing as it comes down to it
    const near = s > 0 ? Math.max(0, 1 - Math.abs(y - drop) / 14) : 0;
    const contact = near > 0.02 ? `<ellipse cx="${n2(cx + x)}" cy="${n2(FLOOR_Y + 1)}" rx="${n2(17 * near)}" ry="${n2(2 * near)}" ${fill("clay-deeper")}/>` : "";
    notch = NOTCH;
    front = seams + contact + `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(ang)} ${n2(cx)} ${n2(cy)})">${out > 0.01 ? chunkFaces(out) : ""}<polygon points="${pts(CHUNK_TOP)}" ${fill("wood")}/></g>`;
  }
  return `${OPEN}${ROOM}${BOARD}${shadowOn(shadow)}${HOLE}${notch}${block(tip, PIVOT, 0, -sink)}${front}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
