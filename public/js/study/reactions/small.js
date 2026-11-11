// Small's two stories, the camera's: scale and point of view are the word. The studio as it is (a floor, a plain wall, the two balls, the
// one low light), seen through a real camera that moves. Happy: it comes down and in to the tiny ball's own height, beside it, until the tiny
// orange ball fills the foreground, round and proud, the huge dark ball a soft wall behind it: small, but the hero. Sad: it rises and draws
// back, high, until the tiny ball is a speck on the wide floor beside the huge one, nearly lost.
// Every frame is a pure function of t, in seconds. The still is a floor-level camera (focal 200, its eye 3.5 above the floor, the horizon at
// y 163.8): the huge ball, radius 207, centered 600 ahead and 21 right; the tiny one, radius 24.5, 583 ahead and 212 left; the wall at 807.
import { n2, n4, paint, parsePath, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M24.3 161c2.2 .6 3.7 2.2 5.5 3.6l66.5 .1c-.4-.4-1-.5-1.6-.8l2.7-2.8 3.2 .6c12.8 9.2 26.3 17.7 39.4 26.4 3.8 2.6 7.6 5.1 11.4 7.7 2.1 1.4 4.4 2.7 6.3 4.3 1.6 1.3 3 2.9 4.4 4.3l-63.1 0-61.8-34.1c8 6.4 16.1 12.7 24.2 19.1 6.1 4.8 12.3 9.4 17.7 15l-83.5 0 0-39.7 29 0c-.8-.5-1.6-1-2.5-1.5l2.2-2.2ZM134.2 164.7l70.2 0 0 32c-15.3-6.4-30.6-13.1-45.9-19.5-4.6-2-9.3-4-13.9-6-2.3-1-4.8-1.7-6.8-3.1-1.4-.9-2.5-2.2-3.6-3.4Z\" fill=\"var(--art-violet-lit,#A68CFF)\" fill-rule=\"evenodd\"/>\n<path d=\"M30.7 161.1l2.2 2.1c-.9 .5-1.7 1-2.6 1.5l3.3 0 71.4 39.7-29.4 0c-3.7-3.6-8-6.6-12.1-9.8-7.3-5.8-14.7-11.6-22.1-17.4-3.7-3-7.4-5.9-11.1-8.8-1.4-1.1-2.8-2.5-4.4-3.3-.7-.3-1.5-.5-2.3-.7l2.8-2.8 4.3-.5ZM122 161l2.5 2.8c-.7 .2-1.5 .4-2.1 .7l16 .6 66 28.1 0 11.2-45.8 0c-5.6-4.7-12.4-8.6-18.5-12.7-13.2-8.8-26.6-17.4-39.6-26.5-.7-.1-1.5-.3-2.1-.5l2.8-3c7 .9 13.8 .3 20.8-.7Z\" fill=\"var(--art-violet-deep,#5E40C4)\" fill-rule=\"evenodd\"/>\n<path d=\"M120.8 26.9c.5 .3 .9 .7 1.4 1 2.3 .5 5.1 .8 7.2 1.9 2 1.1 3.7 3.2 5.3 4.8 6.6 6.7 12.5 13.6 16.7 22 16 32 4.4 67.8-19.8 92-6.4 6.4-13.2 12-21.1 16.3-3.2 0-6.5-.7-9.6 .3-10-1.4-19.5-5.3-27.8-11.1-20.1-14-33.2-37.7-32-62.5 1.6-31.9 27.6-59.4 58.7-64.6 6.9-1.2 14.1-1.4 21-.1Z\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n<path d=\"M120.2 26.6c10.8 2.4 20.8 6 29.7 12.6 41.9 31.4 35.5 93.5-9.5 118.4-9.4 5.2-20.1 8-30.9 8.1-3 .1-6-.3-9-.4 35.3-10.6 60.3-53.9 53.7-89.8-3.7-20.5-16.5-37.8-34-48.9Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<circle cx=\"27.3\" cy=\"156.6\" r=\"8.4\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M29.5 148.5C33.6 152 33.6 161.3 26.2 165C23.1 164.5 20.5 162.4 19.4 159.5C18.4 156.5 19.1 153.2 21.2 150.9C23.3 148.7 26.5 147.7 29.5 148.5Z\" fill=\"var(--art-clay,#E8743B)\"/>\n</svg>\n";
export const STILL_HASH = "1e91e02b3a";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 7) throw new Error("small: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const dOf = (svg) => /d="([^"]+)"/.exec(svg)[1];
const pts = (P) => P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
// the still's parts: the wall; the floor and the balls' shadows on it; the huge ball (its body, its shaded side); the tiny one (the same)
const BIG = EL[3] + EL[4], TINY = EL[5] + EL[6];

// ---- the studio and the camera
const F = 200, WALL_Z = 807;
const BALLS = [
  { c: [21, 207, 600], r: 207, svg: BIG },
  { c: [-212, 24.5, 583], r: 24.5, svg: TINY },
];
// the one light, very low (6° up: the still's shadows run all the way to the camera), going back to front and a little right: on the floor,
// from a ball towards the camera's right
const ELEV = (6 * Math.PI) / 180, PLAN = [0.351, -0.936];
function cameraOf(cam) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const toCam = ([X, Y, Z]) => {
    const dx = X - cam.pos[0], dy = Y - cam.pos[1], dz = Z - cam.pos[2];
    const xc = cy * dx - sy * dz, z1 = sy * dx + cy * dz;
    return [xc, cp * dy - sp * z1, sp * dy + cp * z1];
  };
  const screen = ([xc, yc, zc]) => [cam.pp[0] + (F * xc) / zc, cam.pp[1] - (F * yc) / zc];
  return { toCam, screen, at: (P) => screen(toCam(P)) };
}
// a polygon in the world, cut where it passes behind the camera, then drawn
function shown(cam, P) {
  const C = P.map(cam.toCam), NEAR = 2, out = [];
  for (let i = 0; i < C.length; i++) {
    const a = C[i], b = C[(i + 1) % C.length], ina = a[2] > NEAR, inb = b[2] > NEAR;
    if (ina) out.push(a);
    if (ina !== inb) { const k = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, NEAR]); }
  }
  return out.map(cam.screen);
}
// a ball's shadow on the floor: an ellipse thrown along the light (its middle r / tan(elevation) on from the ball's foot, r / sin(elevation)
// long that way, r across)
const shadowOf = (b) => Array.from({ length: 48 }, (_, i) => {
  const a = (i / 48) * 2 * Math.PI, along = (b.r / Math.sin(ELEV)) * Math.cos(a) + b.r / Math.tan(ELEV), across = b.r * Math.sin(a);
  return [b.c[0] + PLAN[0] * along - PLAN[1] * across, 0, b.c[2] + PLAN[1] * along + PLAN[0] * across];
});
// the still's own shadows, on the floor (each point of their outlines taken back down to the floor through the still's camera), so they can be
// carried by the moving camera and turn into the shadows the light throws
const CAM0 = { pos: [0, 3.5, 0], yaw: 0, pitch: 0, pp: [100, 163.8] };
const STILL_SHADOWS = parsePath(dOf(EL[2])).map((run) => run.segs.flatMap((s) => Array.from({ length: 5 }, (_, k) => {
  const t = k / 5, u = 1 - t, p = [0, 1].map((j) => u * u * u * s[0][j] + 3 * u * u * t * s[1][j] + 3 * u * t * t * s[2][j] + t * t * t * s[3][j]);
  const dy = Math.max(p[1], 165) - CAM0.pp[1], z = (F * CAM0.pos[1]) / dy;
  return [(z * (p[0] - CAM0.pp[0])) / F, 0, z];
})));
// (both outlines turned the same way round first, so the points pair up along the shape and the turn never twists through itself)
const clockwise = (P) => (P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + (q[0] - p[0]) * (q[1] + p[1]); }, 0) < 0 ? P : P.slice().reverse());
// a screen outline cut to a box a little past the frame, so a shadow running past the camera keeps its points where they're seen
function boxed(P, lo = -40, hi = 240) {
  let out = P;
  for (const [axis, edge, keep] of [[0, lo, 1], [0, hi, -1], [1, lo, 1], [1, hi, -1]]) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i], b = src[(i + 1) % src.length], ina = (a[axis] - edge) * keep >= 0, inb = (b[axis] - edge) * keep >= 0;
      if (ina) out.push(a);
      if (ina !== inb) { const k = (edge - a[axis]) / (b[axis] - a[axis]); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
    }
    if (!out.length) return out;
  }
  return out;
}
function even(P, n) {
  P = clockwise(P);
  const i0 = P.reduce((m, p, i) => (p[1] < P[m][1] ? i : m), 0), Q = [...P.slice(i0), ...P.slice(0, i0)], L = [];
  let tot = 0;
  for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length]; L.push(Math.hypot(b[0] - a[0], b[1] - a[1])); tot += L[i]; }
  return Array.from({ length: n }, (_, k) => { let d = (k / n) * tot, i = 0; while (d > L[i] && i < L.length - 1) { d -= L[i]; i++; } const a = Q[i], b = Q[(i + 1) % Q.length], f = L[i] ? Math.min(1, d / L[i]) : 0; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; });
}
function scene(cam, blend) {
  const C = cameraOf(cam);
  const floor = shown(C, [[-6000, 0, -6000], [6000, 0, -6000], [6000, 0, WALL_Z], [-6000, 0, WALL_Z]]);
  // the shadows: the still's own, carried by the camera, turning into the ones the light throws (both as floor shapes, then drawn)
  const shadows = BALLS.map((b, i) => {
    const thrown = boxed(shown(C, shadowOf(b))), still = boxed(shown(C, STILL_SHADOWS[i]));
    if (blend <= 0) return still;
    if (blend >= 1 || still.length < 3 || thrown.length < 3) return thrown;
    const A = even(still, 64), B = even(thrown, 64);
    return A.map((p, k) => [p[0] + (B[k][0] - p[0]) * blend, p[1] + (B[k][1] - p[1]) * blend]);
  });
  // each ball: its own drawing, moved and scaled to where the camera sees it, the farther first
  const balls = BALLS.map((b) => {
    const c0 = cameraOf(CAM0), p0 = c0.at(b.c), r0 = (F * b.r) / c0.toCam(b.c)[2];
    const q = C.toCam(b.c), p = C.screen(q), r = (F * b.r) / q[2];
    return { far: q[2], svg: `<g transform="translate(${n2(p[0])} ${n2(p[1])}) scale(${n4(r / r0)}) translate(${n2(-p0[0])} ${n2(-p0[1])})">${b.svg}</g>` };
  }).sort((a, b) => b.far - a.far);
  return `${OPEN}<rect x="-300" y="-300" width="900" height="900" ${fill("violet")}/>${floor.length > 2 ? `<polygon points="${pts(floor)}" ${fill("violet-lit")}/>` : ""}`
    + shadows.map((P) => (P.length > 2 ? `<polygon points="${pts(P)}" ${fill("violet-deep")}/>` : "")).join("") + balls.map((b) => b.svg).join("") + "</svg>";
}
const mix = (a, b, u) => a + (b - a) * u;
const camMix = (A, B, u) => ({ pos: [0, 1, 2].map((i) => mix(A.pos[i], B.pos[i], u)), yaw: mix(A.yaw, B.yaw, u), pitch: mix(A.pitch, B.pitch, u), pp: [mix(A.pp[0], B.pp[0], u), mix(A.pp[1], B.pp[1], u)] });
const DEG = Math.PI / 180;

// ---- happy: down and in, beside the tiny ball at its own height, looking past it at the huge one
const HAPPY_CAM = { pos: [-300, 22, 452], yaw: 46 * DEG, pitch: 4 * DEG, pp: [100, 128] };
const T = [0.2, 1.9];
const HAPPY_DUR = T[1] + 0.7;
function happy(t) {
  if (t <= 0) return STILL;
  const u = track([[T[0], 0], [T[1], 1, "io"]], t);
  return scene(camMix(CAM0, HAPPY_CAM, u), track([[T[0], 0], [T[0] + 0.22, 1, "io"]], t));
}
// ---- sad: up and back, high, looking down on the floor
const SAD_CAM = { pos: [60, 1150, -850], yaw: 0, pitch: -42 * DEG, pp: [100, 100] };
const SAD_DUR = T[1] + 0.7;
function sad(t) {
  if (t <= 0) return STILL;
  const u = track([[T[0], 0], [T[1], 1, "io"]], t);
  return scene(camMix(CAM0, SAD_CAM, u), track([[T[0], 0], [T[0] + 0.22, 1, "io"]], t));
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
