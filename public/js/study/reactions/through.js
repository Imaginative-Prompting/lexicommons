// Through's two stories. The still's ball has just come out of the pipe and is rolling away from it (its speed lines trail back towards the
// pipe), slowing on the floor; the camera follows it to the right, to what was on the floor past the frame all along. Happy: a croquet hoop,
// right across its line: it rolls through, under the arch, between the hoop's legs, and on, slowing to a stop beyond it. Sad: an old piece of
// gum on the floor: the ball rolls onto it, the gum sticks to it and strings out between the floor and the ball as it turns, and the ball
// drags to a stop, stuck, strung to the floor.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view; the world carries on past its frame.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect y=\"145\" width=\"200\" height=\"55\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"12,146 24,150 121,146 200,170 200,200 104,200\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M166.3,145.6A20 6 28 0 0 201.7,164.4A20 6 28 0 0 166.3,145.6Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M24 98L121 104A13 21 0 0 1 121 146L24 150Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M20 134.5L132.9 133.4A13 21 0 0 1 121 146L24 150Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><ellipse cx=\"24\" cy=\"124\" rx=\"16\" ry=\"26\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><ellipse cx=\"24\" cy=\"124\" rx=\"13.5\" ry=\"23.5\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M138 124.4Q143 121.6 149 121.2A0.9 0.9 0 0 1 149 123Q143.5 123.4 138.9 126A0.9 0.9 0 0 1 138 124.4Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M138 130.4Q143 127.6 148.5 127.2A0.9 0.9 0 0 1 148.5 129Q143.5 129.4 138.9 132A0.9 0.9 0 0 1 138 130.4Z\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"172\" cy=\"129\" r=\"20\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M178.8 110.2A20 20 0 0 1 168.5 148.7C187 136 188 122 178.8 110.2Z\" fill=\"var(--art-clay-deep,#C25626)\"/></svg>\n";
export const STILL_HASH = "1fd3bd1057";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 12) throw new Error("through: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
// the wall and floor carried on; the pipe's shadow carried on past the frame's right and bottom edges to its end (inside the frame, the
// still's own: its left edge stays on the still's line)
const WALL = `<rect x="-300" y="-300" width="900" height="900" ${fill("sun")}/>`, FLOOR = `<rect x="-300" y="145" width="900" height="500" ${fill("sun-lit")}/>`;
const PIPE_SHADOW = `<polygon points="12,146 24,150 121,146 200,170 238,181.6 250,196 254,212 247,230 232,250 216.4,266" ${fill("sun-deep")}/>`;
const PIPE = EL.slice(4, 8).join(""), LINES = EL[8] + EL[9], BALL = EL[10] + EL[11], BALL_SHADOW = EL[3];
const B0 = [172, 129], R = 20, FOOT = B0[1] + R;
const at = (svg, dx, extra = "") => (dx || extra ? `<g transform="translate(${n2(dx)} 0)${extra}">${svg}</g>` : svg);
/** The ball moved dx, its speed lines (shrinking towards it as it slows), and its shadow. */
const ball = (dx, speed) => {
  const k = Math.max(0, Math.min(1, speed));
  const lines = k > 0.01 ? at(LINES, dx, k < 1 ? ` translate(${B0[0] - R} 0) scale(${n4(k)} 1) translate(${-(B0[0] - R)} 0)` : "") : "";
  return { shadow: at(BALL_SHADOW, dx), lines, body: at(BALL, dx) };
};
// it's rolling at 120 a second (as out's ball, its lines the same), the floor slowing it 60 a second squared
const V0 = 120, DRAG = 60;
const rolled = (s, v) => { const tt = Math.min(Math.max(0, s), v / DRAG); return v * tt - 0.5 * DRAG * tt * tt; };
// the camera follows it to the right (and, for the happy, draws back a little), the pipe's end still in sight at the left
const camera = (z1, fx1, fy1) => (t) => { const k = track([[0.08, 0], [1.4, 1, "io"]], t); return [1 + (z1 - 1) * k, 100 + (fx1 - 100) * k, 100 + (fy1 - 100) * k]; };
function view([z, fx, fy], inner) {
  const cam = z === 1 && fx === 100 && fy === 100 ? "" : `translate(100 100) scale(${n4(z)}) translate(${n2(-fx)} ${n2(-fy)})`;
  return `${OPEN}${cam ? `<g transform="${cam}">${inner}</g>` : inner}</svg>`;
}
const scene = (cam, mid, front = "") => view(cam, `${WALL}${FLOOR}${PIPE_SHADOW}${mid}${PIPE}${front}`);

// ---- happy. The hoop: a white wire arch standing on the floor across the ball's line, turned a little to us so its arch shows: its near
// leg in front of the ball's line (nearer us, lower on the floor) at the left, its far leg behind it at the right; legs 42 high, the arch a
// half circle 36 across on top; the ball's line passes between its legs, its top well under the arch.
const NEAR = [216, FOOT + 10], FAR = [254, FOOT - 12], LEG = 42, ARCH = 36;
const TOP_N = [NEAR[0], NEAR[1] - LEG], TOP_F = [FAR[0], FAR[1] - LEG], MID = [(TOP_N[0] + TOP_F[0]) / 2, (TOP_N[1] + TOP_F[1]) / 2];
const HALF = [(TOP_F[0] - TOP_N[0]) / 2, (TOP_F[1] - TOP_N[1]) / 2];
const archPt = (a) => [MID[0] - Math.cos(a) * HALF[0], MID[1] - Math.cos(a) * HALF[1] - Math.sin(a) * ARCH];
const archD = (a0, a1) => { let d = ""; for (let i = 0; i <= 8; i++) { const p = archPt(a0 + ((a1 - a0) * i) / 8); d += `${i ? "L" : "M"}${n2(p[0])} ${n2(p[1])}`; } return d; };
const wire = (d, tone) => `<path d="${d}" fill="none" stroke="${paint(tone)}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
// the far half (behind the ball's line) in the wire's shade, the near half in the light
const HOOP_BACK = wire(`M${FAR[0]} ${FAR[1]}V${TOP_F[1]}`, "paper-deep") + wire(archD(Math.PI / 2, Math.PI), "paper-deep");
const HOOP_FRONT = wire(`${archD(0, Math.PI / 2)}M${TOP_N[0]} ${TOP_N[1]}V${NEAR[1]}`, "paper");
// the hoop's shadow, thrown down and right along the light, as the ball's is (35, 19 for its 40 of height)
const L = [35 / 40, 19 / 40];
const thrown = (p, h) => [p[0] + h * L[0], p[1] + h * L[1]];
// (each point of the arch stands over the line between the feet, at its own depth, as high as its leg plus its rise on the arch)
const HOOP_SHADOW = (() => {
  let d = `M${NEAR[0]} ${NEAR[1]}`;
  for (let i = 0; i <= 8; i++) {
    const a = (Math.PI * i) / 8, u = (1 - Math.cos(a)) / 2, foot = [NEAR[0] + (FAR[0] - NEAR[0]) * u, NEAR[1] + (FAR[1] - NEAR[1]) * u], q = thrown(foot, LEG + Math.sin(a) * ARCH);
    d += `L${n2(q[0])} ${n2(q[1])}`;
  }
  return `<path d="${d}L${FAR[0]} ${FAR[1]}" fill="none" stroke="${paint("sun-deep")}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
})();
const HAPPY_CAM = camera(0.8, 212, 116);
const HAPPY_DUR = Math.round((V0 / DRAG + 0.6) * 100) / 100;
function happy(t) {
  if (t <= 0) return STILL;
  const a = rolled(t, V0), b = ball(a, (V0 - DRAG * Math.min(t, V0 / DRAG)) / V0);
  return scene(HAPPY_CAM(t), `${HOOP_SHADOW}${b.shadow}${HOOP_BACK}${b.lines}${b.body}`, HOOP_FRONT);
}

// ---- sad. The gum: a flattened gray-pink blob on the floor on the ball's line. When the ball's foot reaches it, it sticks; from then on a
// patch of it rides on the ball, turning with it (the ball rolls, so a point of it turns 1 rad for each 20 it goes), and two strands stretch
// from the floor's blob to it; their pull and the gum's drag stop the ball in 24 (a hard, even slowing), and the strands, done stretching,
// sag a little.
const GX = 236, GUM = paint("paper-deeper"), SAD_CAM = camera(1, 205, 100);
const T_GUM = (V0 - Math.sqrt(V0 * V0 - 2 * DRAG * (GX - B0[0]))) / DRAG, V_GUM = V0 - DRAG * T_GUM, STOP = 24, T_STOP = T_GUM + (2 * STOP) / V_GUM;
const SAD_DUR = Math.round((T_STOP + 0.7) * 100) / 100;
const FLOOR_GUM = (squash) => `<path d="M${GX - 7} ${FOOT + 0.6}Q${GX - 6} ${FOOT - 2.4 * squash} ${GX - 1} ${FOOT - 2.2 * squash}Q${GX + 4} ${FOOT - 3 * squash} ${GX + 6.5} ${FOOT - 0.4}Q${GX + 5} ${FOOT + 2.6} ${GX} ${FOOT + 2.2}Q${GX - 5} ${FOOT + 2.8} ${GX - 7} ${FOOT + 0.6}Z" fill="${GUM}"/>`;
function sad(t) {
  if (t <= 0) return STILL;
  let a, v;
  if (t < T_GUM) { a = rolled(t, V0); v = V0 - DRAG * t; } else {
    const s = Math.min(t, T_STOP) - T_GUM, d = (V_GUM * V_GUM) / (2 * STOP);
    a = GX - B0[0] + V_GUM * s - 0.5 * d * s * s; v = Math.max(0, V_GUM - d * s);
  }
  const b = ball(a, v / V0);
  let gum = "", onBall = "", strands = "";
  if (t < T_GUM) gum = FLOOR_GUM(1);
  else {
    // the patch on the ball: where its foot met the gum, turned with it since
    const c = [B0[0] + a, B0[1]], turned = (a - (GX - B0[0])) / R, ang = Math.PI / 2 + turned;
    const p = [c[0] + R * Math.cos(ang), c[1] + R * Math.sin(ang)];
    const tangent = [-Math.sin(ang), Math.cos(ang)], out = [Math.cos(ang), Math.sin(ang)];
    // a lump of it, half pressed onto the ball, half standing out of its outline
    const lump = [p[0] + out[0] * 0.8, p[1] + out[1] * 0.8], deg = (Math.atan2(tangent[1], tangent[0]) * 180) / Math.PI;
    // (it comes up off the floor onto the ball over its first 8 of travel)
    const took = Math.min(1, (a - (GX - B0[0])) / 8);
    onBall = `<ellipse cx="${n2(lump[0])}" cy="${n2(lump[1])}" rx="${n2(6.5 * took)}" ry="${n2(3.4 * took)}" transform="rotate(${n2(deg)} ${n2(lump[0])} ${n2(lump[1])})" fill="${GUM}"/>`;
    gum = FLOOR_GUM(1 - 0.4 * took);
    // two strands, from the floor's blob to either side of the patch; taut while it's still being pulled, sagging once it stops
    const sag = track([[T_STOP, 0], [T_STOP + 0.25, 3.5, "out"]], t);
    for (const [k, off] of [[1, -3.8], [0.75, 3.4]]) {
      const from = [GX + off * 0.6, FOOT - 0.6], to = [p[0] + tangent[0] * off, p[1] + tangent[1] * off];
      const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + sag * k];
      // a strand thick where it's stuck at each end, drawn thin in the middle
      const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, w0 = 1.5 * k, w1 = 0.45 * k;
      strands += `<path d="M${n2(from[0] - nx * w0)} ${n2(from[1] - ny * w0)}Q${n2(mid[0] - nx * w1)} ${n2(mid[1] - ny * w1)} ${n2(to[0] - nx * w0)} ${n2(to[1] - ny * w0)}`
        + `L${n2(to[0] + nx * w0)} ${n2(to[1] + ny * w0)}Q${n2(mid[0] + nx * w1)} ${n2(mid[1] + ny * w1)} ${n2(from[0] + nx * w0)} ${n2(from[1] + ny * w0)}Z" fill="${GUM}"/>`;
    }
  }
  return scene(SAD_CAM(t), `${gum}${b.shadow}${b.lines}${strands}${b.body}${onBall}`);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
