// Behind's two stories, the camera's: it swings round the box (an orbit, the studio turning under a camera that stays put), the light
// fixed in the studio, so the floor, the wall's foot and both shadows turn with it and each face of the box keeps its own shade. Happy:
// it swings to the right until the ball comes out from behind the box, whole and round, and settles there. Sad: it swings the other way,
// and comes down as it goes (from the still's height the ball's crown always shows over the box; lower, the box covers it), until the box
// hides the ball completely, only the edge of its shadow showing past the box's.
// Every frame is a pure function of t, in seconds. The still's own numbers: one oblique projection for the studio, screen x = X + 0.39 Z,
// screen y = 175 − H − 0.27 Z (Z back from the box's front face, H up from the floor); the box a 75 cube at X 30–105, Z 0–75; the ball
// 60 across on the floor at X 80, Z 165; the wall at Z 225; shadows along (1, 0.3) on screen.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<rect y=\"114.25\" width=\"200\" height=\"85.75\" fill=\"var(--art-teal-lit,#6FD0BD)\"/>\n<polygon points=\"128.35,131.45 160.35,129.45 200,141.34 200,152.94\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<circle cx=\"144.35\" cy=\"100.45\" r=\"30\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M144.35 70.45A30 30 0 0 1 144.35 130.45A23.4 30 0 0 0 144.35 70.45Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<polygon points=\"30,175 113.33,200 200,200 200,174.47 134.25,154.75\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<polygon points=\"30,100 105,100 134.25,79.75 59.25,79.75\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<polygon points=\"105,100 134.25,79.75 134.25,154.75 105,175\" fill=\"var(--art-ink,#231F3B)\"/>\n<rect x=\"30\" y=\"100\" width=\"75\" height=\"75\" fill=\"var(--art-paper,#FBF7EC)\"/>\n</svg>\n";
export const STILL_HASH = "89bacfe2a4";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 9) throw new Error("behind: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const pts = (P) => P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");

// the studio. K is how far the floor rises on screen as it goes back: the camera's height (0.27 the still's)
const A = 0.39, Y0 = 175, K0 = 0.27;
const BOX = { x0: 30, x1: 105, d: 75, h: 75 }, BALL = { x: 80, z: 165, r: 30 }, WALL_Z = 225;
const PIVOT = [(BOX.x0 + BOX.x1) / 2, BOX.d / 2];
const turn = ([x, z], th) => { const c = Math.cos(th), s = Math.sin(th), dx = x - PIVOT[0], dz = z - PIVOT[1]; return [PIVOT[0] + c * dx - s * dz, PIVOT[1] + s * dx + c * dz]; };
const at = ([x, z], h, k) => [x + A * z, Y0 - h - k * z];
// the light along the floor: the still's shadows run (1, 0.3) on screen, which is this on the floor; the ball's shadow starts across its foot
const LIGHT = [1 + (A * 0.3) / K0, -0.3 / K0];
const BALL_FOOT = [[128.35 - (A * (Y0 - 131.45)) / K0, (Y0 - 131.45) / K0], [160.35 - (A * (Y0 - 129.45)) / K0, (Y0 - 129.45) / K0]];
const far = (p, d) => [p[0] + d[0] * 400, p[1] + d[1] * 400];
function hull(P) {
  P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// the ball's shade: a dark crescent on the side away from the light. In the still the light is 38.7° round to the left of the camera
// (the crescent's inner edge 0.78 of the ball across); the studio turning by th turns the light with it
const LIGHT_AZ = Math.acos(0.78);
function ball(c, th) {
  const r = BALL.r, g = th - LIGHT_AZ, rx = r * Math.abs(Math.cos(g)), right = g < 0;
  const body = `<circle cx="${n2(c[0])}" cy="${n2(c[1])}" r="${r}" ${fill("clay")}/>`;
  if (r - rx < 0.05) return body;
  const top = `${n2(c[0])} ${n2(c[1] - r)}`, bottom = `${n2(c[0])} ${n2(c[1] + r)}`;
  return body + `<path d="M${top}A${r} ${r} 0 0 ${right ? 1 : 0} ${bottom}A${n2(rx)} ${r} 0 0 ${right ? 0 : 1} ${top}Z" ${fill("clay-deep")}/>`;
}
// the box's faces, each with its own shade (the light fixed: low, round to the left of the camera): the front lit most, then the top,
// the left less (the light skims it), the right and back away from it
const FACES = [
  { n: [-1, 0], c: [3, 0], tone: "paper-deeper" }, { n: [1, 0], c: [1, 2], tone: "ink" }, { n: [0, 1], c: [2, 3], tone: "ink" }, { n: [0, -1], c: [0, 1], tone: "paper" },
];
function scene(th, k, pan) {
  const C = [[BOX.x0, 0], [BOX.x1, 0], [BOX.x1, BOX.d], [BOX.x0, BOX.d]].map((p) => turn(p, th));
  const L = turn([PIVOT[0] + LIGHT[0], PIVOT[1] + LIGHT[1]], th), Ld = [L[0] - PIVOT[0], L[1] - PIVOT[1]];
  // the floor up to the wall's foot (the wall turning with the studio)
  const w0 = at(turn([-700, WALL_Z], th), 0, k), w1 = at(turn([900, WALL_Z], th), 0, k);
  const floor = `<polygon points="${pts([w0, w1, [w1[0], 700], [w0[0], 700]])}" ${fill("teal-lit")}/>`;
  // the shadows: the ball's from across its foot along the light, the box's its footprint swept along it
  const foot = BALL_FOOT.map((p) => turn(p, th));
  const ballShadow = `<polygon points="${pts([foot[0], foot[1], far(foot[1], Ld), far(foot[0], Ld)].map((p) => at(p, 0, k)))}" ${fill("teal-deep")}/>`;
  const boxShadow = `<polygon points="${pts(hull([...C, ...C.map((p) => far(p, Ld))].map((p) => at(p, 0, k))))}" ${fill("teal-deep")}/>`;
  const b = at(turn([BALL.x, BALL.z], th), BALL.r, k);
  // the box: its top, then each side facing the camera (a face shows when its normal has the camera on its side)
  const top = `<polygon points="${pts(C.map((p) => at(p, BOX.h, k)))}" ${fill("paper-deep")}/>`;
  let sides = "";
  for (const f of FACES) {
    const n = turn([PIVOT[0] + f.n[0], PIVOT[1] + f.n[1]], th), nx = n[0] - PIVOT[0], nz = n[1] - PIVOT[1];
    if (nx * A - nz <= 0) continue;
    const a = C[f.c[0]], e = C[f.c[1]];
    sides += `<polygon points="${pts([at(a, BOX.h, k), at(e, BOX.h, k), at(e, 0, k), at(a, 0, k)])}" ${fill(f.tone)}/>`;
  }
  return `${OPEN}<g transform="translate(${n2(pan[0])} ${n2(pan[1])})"><rect x="-400" y="-400" width="1000" height="1000" ${fill("teal")}/>${floor}${ballShadow}${boxShadow}${ball(b, th)}${top}${sides}</g></svg>`;
}

// ---- happy: round to the right until the ball is clear of the box, the view following so both stay in frame
const T0 = 0.2, T1 = 1.75, DEG = Math.PI / 180;
const HAPPY = { th: -22 * DEG, pan: [-22, 0] };
const HAPPY_DUR = T1 + 0.7;
function happy(t) {
  if (t <= 0) return STILL;
  const u = track([[T0, 0], [T1, 1, "io"]], t);
  return scene(HAPPY.th * u, K0, [HAPPY.pan[0] * u, HAPPY.pan[1] * u]);
}
// ---- sad: round the other way and down, until the box covers the ball
const SAD = { th: 30 * DEG, k: 0.13, pan: [18, -15] };
const SAD_DUR = T1 + 0.7;
function sad(t) {
  if (t <= 0) return STILL;
  const u = track([[T0, 0], [T1, 1, "io"]], t);
  return scene(SAD.th * u, K0 + (SAD.k - K0) * u, [SAD.pan[0] * u, SAD.pan[1] * u]);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
