// Send's two stories: the camera follows the paper plane's glide (out of its climb, levelling, heading in toward a house wall up ahead and
// to the right) to a window. Happy: the window's lower sash is up; the plane glides in through it, smaller as it goes in, and lands in the
// tray on the inner sill. Sad: the window is shut; the plane's nose meets the pane and crumples, and it drops onto the outer sill.
// Every frame is a pure function of t, in seconds. The world in the still's own units (the still is where the camera starts): the plane's
// nose at (180, 30) climbing at 46°; its dashed trail drawn on behind it; the house wall from x 232, the window in it at x 262-352, y -36
// to 86, its outer sill at 86.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M22 172C50 164 62 150 58 136 54 124 40 128 44 140 48 152 72 150 92 132\" fill=\"none\" stroke=\"var(--art-violet-lit,#A68CFF)\" stroke-width=\"3.4\" stroke-dasharray=\"8 7\" stroke-linecap=\"round\"/><path d=\"M64 118 180 30 118 150 102 112Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M180 30 102 112 94 158Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M180 30 102 112 118 150Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M64 118 180 30 102 112Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n</svg>\n";
export const STILL_HASH = "24c3f55c2a";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 6 || !EL[2].includes("M64 118 180 30 118 150 102 112Z")) throw new Error("send: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const rect = (x, y, w, h, tone) => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" ${fill(tone)}/>`;
const poly = (P, tone) => `<polygon points="${P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ")}" ${fill(tone)}/>`;
const [SKY, TRAIL] = EL;
const PLANE = EL.slice(2).join("");
const TRAIL_D = /d="([^"]+)"/.exec(TRAIL)[1], TRAIL_STYLE = TRAIL.slice(TRAIL.indexOf('" fill') + 1).replace(/\/>$/, "");

// ---- the house: its wall, the window (frame, sashes, glass or the room behind, the tray on the inner sill), the outer sill
const W = { x0: 262, x1: 352, y0: -36, y1: 86, in: 8, rail: 25 };
function house(open) {
  const wall = rect(232, -400, 600, 900, "paper-mid") + rect(226, -400, 6, 900, "paper-deep");
  const frame = rect(W.x0, W.y0, W.x1 - W.x0, W.y1 - W.y0, "paper");
  const ix0 = W.x0 + W.in, ix1 = W.x1 - W.in, iy0 = W.y0 + W.in, iy1 = W.y1 - W.in;
  const pane = (y0, y1) => rect(ix0, y0, ix1 - ix0, y1 - y0, "sky-lit") + poly([[ix0 + 10, y1], [ix0 + 26, y1], [ix1 - 18, y0], [ix1 - 34, y0]], "sky-pale");
  const upper = pane(iy0, W.rail - 2.5);
  // the lower sash: down and glazed, or up behind the upper one (its bottom rail showing across it) with the room open below
  const lower = open
    ? rect(ix0, W.rail + 2.5, ix1 - ix0, iy1 - W.rail - 2.5, "ink-lit") + rect(ix0, iy1 - 4, ix1 - ix0, 4, "ink") + rect(ix0, W.rail - 9, ix1 - ix0, 4.5, "paper")
    : pane(W.rail + 2.5, iy1);
  const sill = rect(W.x0 - 6, W.y1, W.x1 - W.x0 + 12, 4, "paper") + rect(W.x0 - 6, W.y1 + 4, W.x1 - W.x0 + 12, 3, "paper-deep") + rect(W.x0 - 2, W.y1 + 7, W.x1 - W.x0 + 4, 3, "violet-deep");
  return wall + frame + upper + lower + sill;
}
// the tray on the inner sill, its back and its front lip (the plane lands between)
const TRAY = { x0: 292, x1: 338, y: 73 };
const trayBack = () => rect(TRAY.x0, TRAY.y - 7, TRAY.x1 - TRAY.x0, 3, "wood-deep") + rect(TRAY.x0, TRAY.y - 4, TRAY.x1 - TRAY.x0, 4, "wood-deep");
const trayFront = () => rect(TRAY.x0 - 1, TRAY.y - 3, TRAY.x1 - TRAY.x0 + 2, 5, "wood");

// ---- the flight: the nose along a curve from where it is, out of the climb and levelling into a glide down to the window; the plane
// turned along it, and smaller as it heads in toward the wall
const NOSE0 = [180, 30], HEAD0 = Math.atan2(30 - 112, 180 - 102);
// (it ends level, its whole length inside the lower opening: in through the window plane tail last)
const C = [NOSE0, [211, -2.6], [262, 40], [337, 58]];
const bez = (u) => { const v = 1 - u; return [0, 1].map((j) => v * v * v * C[0][j] + 3 * v * v * u * C[1][j] + 3 * v * u * u * C[2][j] + u * u * u * C[3][j]); };
const tang = (u) => { const v = 1 - u; return [0, 1].map((j) => 3 * v * v * (C[1][j] - C[0][j]) + 6 * v * u * (C[2][j] - C[1][j]) + 3 * u * u * (C[3][j] - C[2][j])); };
const planeAt = (u, extra = {}) => {
  // (it flies away from us the whole way, toward the house: smaller steadily)
  const p = extra.nose ?? bez(u), d = tang(Math.min(1, u)), head = extra.head ?? Math.atan2(d[1], d[0]), s = extra.scale ?? 1 - 0.55 * Math.min(1, Math.max(0, u)) ** 1.2;
  return { p, head, s, transform: `translate(${n2(p[0])} ${n2(p[1])}) rotate(${n2(((head - HEAD0) * 180) / Math.PI)}) scale(${n4(s)}) translate(${-NOSE0[0]} ${-NOSE0[1]})` };
};
// a point of the plane (in the still's drawing) where the plane is now
const placed = (q, pl) => {
  const a = pl.head - HEAD0, c = Math.cos(a), s = Math.sin(a), x = (q[0] - NOSE0[0]) * pl.s, y = (q[1] - NOSE0[1]) * pl.s;
  return [pl.p[0] + c * x - s * y, pl.p[1] + s * x + c * y];
};
// the trail drawn on behind it: the line the still's trail ends at, carried on by the same point of the plane
const TAIL = [92, 132];
const T_IN = 2.2;
const flightU = (t) => track([[0.2, 0], [T_IN, 1, "lin"]], t);
// (sampled at fixed moments the whole way, those still to come sitting on where it is now: the line never re-forms behind it)
function trail(t, poseAt, dur) {
  const now = placed(TAIL, poseAt(t)), pts = [];
  for (let k = 1; 0.2 + k * 0.025 < dur; k++) { const tk = 0.2 + k * 0.025; pts.push(tk < t ? placed(TAIL, poseAt(tk)) : now); }
  pts.push(now);
  return `<path d="${TRAIL_D}${pts.map((q) => `L${n2(q[0])} ${n2(q[1])}`).join("")}"${TRAIL_STYLE}/>`;
}
// the camera: holding the plane where the still has it (its middle), then easing over to frame the window
const MIDDLE = [122, 74];
function camera(t, pose) {
  const pc = placed(MIDDLE, pose), w = track([[0.8, 0], [2.3, 1, "io"]], t);
  const follow = [100 + pc[0] - MIDDLE[0], 100 + pc[1] - MIDDLE[1]], c = [follow[0] + (307 - follow[0]) * w, follow[1] + (32 - follow[1]) * w];
  return `translate(${n2(100 - c[0])} ${n2(100 - c[1])})`;
}

// ---- happy: in through the open window, and down into the tray
const HAPPY_DUR = 3.1;
function happyPose(t) {
  const u = flightU(t);
  if (t <= T_IN) return planeAt(u);
  // inside: settling down into the tray, slowing, a small slide forward and still
  const k = track([[T_IN, 0], [T_IN + 0.3, 1, "out"]], t), end = planeAt(1), rest = { nose: [end.p[0] + 1.5 * k, end.p[1] + 9 * k + track([[T_IN + 0.3, 0], [T_IN + 0.38, -0.8, "out"], [T_IN + 0.46, 0, "in"]], t)], head: end.head + (0.1 - end.head) * k, scale: end.s };
  return planeAt(1, rest);
}
function happy(t) {
  if (t <= 0) return STILL;
  const pose = happyPose(t);
  return `${OPEN}${SKY}<g transform="${camera(t, planeAt(flightU(t)))}">${house(true)}${trayBack()}${trail(t, happyPose, HAPPY_DUR)}<g transform="${pose.transform}">${PLANE}</g>${trayFront()}</g></svg>`;
}

// ---- sad: the nose meets the shut pane and crumples, and the plane drops onto the outer sill
const SAD_DUR = 3.1;
// the crumpled nose: the tip pushed back into the paper, the paper creased around it
const CRUMPLED = (k) => {
  const back = 34 * k, tip = [NOSE0[0] - back * Math.cos(HEAD0), NOSE0[1] - back * Math.sin(HEAD0)];
  return PLANE.replace(/180 30/g, `${n2(tip[0])} ${n2(tip[1])}`)
    + (k > 0.01 ? poly([tip, [tip[0] - 12 * k, tip[1] - 2 * k], [tip[0] - 7 * k, tip[1] + 8 * k], [tip[0] - 20 * k, tip[1] + 10 * k], [tip[0] - 9 * k, tip[1] + 18 * k], [tip[0] - 2 * k, tip[1] + 14 * k]], "paper-deep") : "");
};
// the plane's outline (for where it meets the sill)
const OUTLINE = [[64, 118], [180, 30], [118, 150], [94, 158], [102, 112]];
function sadPose(t) {
  const u = flightU(t);
  if (t <= T_IN) return { ...planeAt(u), crumple: 0 };
  // stopped dead at the glass, nose crushed; then off the pane, falling from rest and tipping level, onto the sill, a small bounce
  const T_OFF = T_IN + 0.08, end = planeAt(1), tf = Math.max(0, t - T_OFF), head = end.head + (0.04 - end.head) * track([[T_OFF, 0], [T_OFF + 0.32, 1, "io"]], t);
  const at = (dy) => planeAt(1, { nose: [end.p[0] - 6 * Math.min(1, tf / 0.3), end.p[1] + dy], head, scale: end.s });
  // how far it can drop before its lowest point reaches the sill's top, as it is turned now
  const room = W.y1 - Math.max(...OUTLINE.map((q) => placed(q, at(0))[1]));
  const fall = 0.5 * 900 * tf * tf, landT = Math.sqrt((2 * room) / 900);
  const dy = fall < room ? fall : room - track([[T_OFF + landT, 0], [T_OFF + landT + 0.08, 1.6, "out"], [T_OFF + landT + 0.16, 0, "in"]], t);
  return { ...at(dy), crumple: track([[T_IN, 0], [T_IN + 0.06, 1, "out"]], t) };
}
function sad(t) {
  if (t <= 0) return STILL;
  const pose = sadPose(t);
  return `${OPEN}${SKY}<g transform="${camera(t, planeAt(flightU(t)))}">${house(false)}${trail(t, sadPose, SAD_DUR)}<g transform="${pose.transform}">${CRUMPLED(pose.crumple)}</g></g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
