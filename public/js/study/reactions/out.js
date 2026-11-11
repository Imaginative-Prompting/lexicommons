// Out's two stories: the ball, already rolling out of the box, rolls on, slowing, and the camera draws back to show where it's going, what was
// on the floor there all along. Happy: another ball like it, resting: it rolls up and meets it, a soft click, and stops; the other rolls on a
// little and stops too, the two of them out together. Sad: a hatch in the floor, open: the ball rolls over its edge and drops in, gone; the
// floor is left empty.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view; the world carries on past its frame.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"128\" width=\"200\" height=\"72\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"15,130.5 42,138 42,147.8 70,164 149,148 131.5,138.5 106,134\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M162.3,158.6A20 8 28 0 0 197.7,177.4A20 8 28 0 0 162.3,158.6Z\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"14,75 62,67 106,79 106,81 58,89\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"14,75 59,87.3 59,143.3 14,131\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><polygon points=\"71.5,66.4 119.5,58.4 106,79 106,80.5 58,88.5 58,87\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><polygon points=\"104.5,79.4 106,79 132,83 132,139 106,135 104.5,135.1\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"58,143 58,141.5 106,133.5 106,135 133,142.4 85,150.4\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"41.1,92.4 58,87 59.5,87 59.5,142.5 58,143 41.1,148.4\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"58,87 106,79 106,135 58,143\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"58,143 106,135 58,122\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><path d=\"M138.5,131Q146,130 153,133.6A1.2 1.2 0 0 1 152,135.8Q145.5,132.6 138.5,133.4A1.2 1.2 0 0 1 138.5,131Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M137.5,138Q144,137.2 150,140.4A1.2 1.2 0 0 1 149,142.6Q143.5,139.7 137.5,140.4A1.2 1.2 0 0 1 137.5,138Z\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"172\" cy=\"145.5\" r=\"18\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M172,127.5A18 18 0 0 1 172,163.5A23 23 0 0 0 172,127.5Z\" fill=\"var(--art-clay-deep,#C25626)\"/></svg>\n";
export const STILL_HASH = "bad322bbca";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 16) throw new Error("out: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const WALL = `<rect x="-400" y="-400" width="1100" height="528" ${fill("teal")}/>`, FLOOR = `<rect x="-400" y="128" width="1100" height="600" ${fill("teal-lit")}/>`;
const BOX = EL.slice(2, 3).concat(EL.slice(4, 12)).join(""); // its shadow, then the box
const BALL_SHADOW = EL[3], LINES = EL[12] + EL[13], BALL = EL[14] + EL[15];
const B0 = [172, 145.5], R = 18;
const at = (svg, dx, extra = "") => (dx || extra ? `<g transform="translate(${n2(dx)} 0)${extra}">${svg}</g>` : svg);
/** The ball moved dx along the floor, with its shadow; its speed lines (marks of its speed) shrinking as it slows, towards it. */
function ball(dx, speed, dark = "") {
  const k = Math.max(0, Math.min(1, speed));
  const lines = k > 0.01 ? at(LINES, dx, k < 1 ? ` translate(${B0[0] - R} 0) scale(${n4(k)} 1) translate(${-(B0[0] - R)} 0)` : "") : "";
  return `${at(BALL_SHADOW, dx)}${lines}${at(BALL, dx)}${dark}`;
}
function view(z, fx, fy, inner) {
  const cam = z === 1 && fx === 100 && fy === 100 ? "" : `translate(100 100) scale(${n4(z)}) translate(${n2(-fx)} ${n2(-fy)})`;
  return `${OPEN}${cam ? `<g transform="${cam}">${inner}</g>` : inner}</svg>`;
}
const Z = 0.55, FX = 185, FY = 116, T_CAM = [0.1, 1.0];
const camAt = (t) => { const s = track([[T_CAM[0], 0], [T_CAM[1], 1, "io"]], t); return [1 + (Z - 1) * s, 100 + (FX - 100) * s, 100 + (FY - 100) * s]; };
// it's rolling out at 120 units a second (its lines say so), and the floor slows it, 60 units/s² (a rubber ball on a hard floor)
const V0 = 120, DRAG = 60;
const rolled = (s, v) => { const tt = Math.min(Math.max(0, s), v / DRAG); return v * tt - 0.5 * DRAG * tt * tt; };

// ---- happy: the other ball, resting, 112 further on; they meet (equal rubber balls: a third of the speed kept between them, e = 0.7)
const OTHER = 112, MEET = OTHER - 2 * R, E = 0.7;
const T_MEET = (V0 - Math.sqrt(V0 * V0 - 2 * DRAG * MEET)) / DRAG, V_MEET = V0 - DRAG * T_MEET;
const VA = (V_MEET * (1 - E)) / 2, VB = (V_MEET * (1 + E)) / 2;
const HAPPY_DUR = T_MEET + VB / DRAG + 0.6;
function happy(t) {
  if (t <= 0) return STILL;
  const [z, fx, fy] = camAt(t);
  let a, b, va;
  if (t < T_MEET) { a = rolled(t, V0); b = 0; va = V0 - DRAG * t; } else { const s = t - T_MEET; a = MEET + rolled(s, VA); b = rolled(s, VB); va = Math.max(0, VA - DRAG * s); }
  const other = at(BALL_SHADOW + BALL, OTHER + b);
  return view(z, fx, fy, `${WALL}${FLOOR}${BOX}${other}${ball(a, va / V0)}`);
}

// ---- sad: further on, past the frame, a hatch in the floor stands open, and the ball's line runs across it. It rolls up to the hatch's
// edge, still going (60 a second), rolls over the edge (pivoting on it, a rolling ball: φ'' = 5g sin φ / 7r, until the edge can't hold it,
// g cos φ < r φ'²), and drops in: below the floor's line it can only be seen through the opening, and it falls on down past the opening's near
// edge, out of sight. The floor is empty; its speed lines went with it.
// (a rubber ball 18 across about 7 cm: 1 unit is 0.4 cm, so gravity is 2450 a second squared)
const GRAV = 2450, X1 = 262, X2 = 320, Y_FAR = 149, Y_NEAR = 177, LINE = B0[1] + R;
// the opening: the floor's cut edge at its far side (in the light's shade, as the floor's shadows are), and below it the dark, deepest
// towards its near edge, where we look furthest down
const HATCH = `<rect x="${X1}" y="${Y_FAR}" width="${X2 - X1}" height="${Y_NEAR - Y_FAR}" ${fill("ink-lit")}/>`
  + `<rect x="${X1}" y="${Y_FAR}" width="${X2 - X1}" height="3" ${fill("teal-deep")}/>`
  + `<rect x="${X1}" y="${Y_NEAR - 11}" width="${X2 - X1}" height="11" ${fill("ink")}/>`;
// below the floor's line, the ball shows only through the opening
const IN_HOLE = `<clipPath id="hl"><rect x="-400" y="-400" width="1200" height="${400 + LINE}"/><rect x="${X1}" y="${Y_FAR}" width="${X2 - X1}" height="${Y_NEAR - Y_FAR}"/></clipPath>`;
// worked out once: rolling to the edge, over it, and the fall
const TIP = (() => {
  const reach = X1 - B0[0], v = Math.sqrt(V0 * V0 - 2 * DRAG * reach), t0 = (V0 - v) / DRAG;
  let phi = 0, w = v / R, t = 0;
  const dt = 1 / 4800;
  while (GRAV * Math.cos(phi) > R * w * w && phi < Math.PI / 2) { w += ((5 * GRAV) / (7 * R)) * Math.sin(phi) * dt; phi += w * dt; t += dt; }
  const p = [X1 + R * Math.sin(phi), LINE - R * Math.cos(phi)], vel = [R * w * Math.cos(phi), R * w * Math.sin(phi)];
  return { t0, v, t1: t0 + t, phi, w, p, vel };
})();
const SAD_GONE = TIP.t1 + (-TIP.vel[1] + Math.sqrt(TIP.vel[1] ** 2 + 2 * GRAV * (Y_NEAR + R + 4 - TIP.p[1]))) / GRAV;
const SAD_DUR = Math.round((SAD_GONE + 0.6) * 100) / 100;
function sad(t) {
  if (t <= 0) return STILL;
  const [z, fx, fy] = camAt(t);
  let svg;
  if (t < TIP.t0) {
    const a = rolled(t, V0);
    svg = ball(a, (V0 - DRAG * t) / V0);
  } else {
    // its middle, over the edge and falling (the ball's turn shows in nothing but its place; it has no marks to turn)
    let c;
    if (t < TIP.t1) {
      // on the edge: the pivot's angle at this moment, by the same law, from the edge at its speed
      let phi = 0, w = TIP.v / R, s = 0;
      const dt = 1 / 4800;
      while (s < t - TIP.t0) { w += ((5 * GRAV) / (7 * R)) * Math.sin(phi) * dt; phi += w * dt; s += dt; }
      c = [X1 + R * Math.sin(phi), LINE - R * Math.cos(phi)];
    } else {
      const s = t - TIP.t1;
      c = [TIP.p[0] + TIP.vel[0] * s, TIP.p[1] + TIP.vel[1] * s + 0.5 * GRAV * s * s];
    }
    const dx = c[0] - B0[0], dy = c[1] - B0[1];
    // its speed lines go as it leaves the floor: they shrink to it over the edge
    const k = Math.max(0, (TIP.v / V0) * (1 - Math.min(1, (t - TIP.t0) / 0.1)));
    const lines = k > 0.01 ? at(LINES, dx, ` translate(${B0[0] - R} 0) scale(${n4(k)} 1) translate(${-(B0[0] - R)} 0)`) : "";
    const body = `<g transform="translate(${n2(dx)} ${n2(dy)})">${BALL}</g>`;
    // its shadow goes with it, and draws in to where it left the floor as it drops below it (nothing of it left above the floor to throw one)
    const sk = Math.max(0, 1 - Math.max(0, dy) / 12), foot = [X1, LINE];
    const shadow = sk > 0.01 ? `<g transform="translate(${n2(foot[0])} ${n2(foot[1])}) scale(${n4(sk)}) translate(${n2(-foot[0])} ${n2(-foot[1])})">${at(BALL_SHADOW, dx)}</g>` : "";
    svg = `${shadow}${lines}<g clip-path="url(#hl)">${body}</g>`;
  }
  return view(z, fx, fy, `${IN_HOLE}${WALL}${FLOOR}${HATCH}${BOX}${svg}`);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
