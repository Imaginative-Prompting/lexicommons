// On's two stories: a gust from the left sets the ball rolling across the top of its box. Happy: it's a lighter gust, and the top sags a touch
// (it's why the ball sat in the middle): the ball rolls up to the edge, teeters at the corner while the gust holds it there, and as the gust
// dies it rolls back down into the middle, past it and back, and settles where it was. Sad: it's stronger: the ball rolls off the edge, tips over it, drops to the floor, bounces once, low, and
// rolls to a stop beside the box; the camera draws back to keep it in view.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view; the world carries on past its frame.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M50.3 143l3.5 3.4 0 22.7 81.8 30.9 4.3 4.4-144.3 0 0-58 54.7 0 0-3.4ZM144 143.1l0 3.3 60.4 0 0 33.6-60.1-20.9-3.7-3.7 0-8.8 3.4-3.5Z\" fill=\"var(--art-teal-lit,#6FD0BD)\" fill-rule=\"evenodd\"/>\n<path d=\"M144 152l0 3.5 60.4 21.1 0 27.8-68.6 0c-.1-.2 0-.6-.2-.7l-84.6-32.4c-.2-.1-.4-.3-.6-.5-.1-.6-.1-1.1 0-1.7 .4-.4 .8-.8 1.3-1.2l70.6 0 21.7-15.9Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M56.6 96.7l65.7 0 3.7 3.7 0 67.5c-1.5 1.1-3 2-4 3.5l-71.7-.1 0-70.9c2.3-.7 4.3-2.3 6.3-3.7Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M97.7 32.3c.7 .3 1.3 .6 2 .9l7.3 1.3c5.3 5.4 9.4 10.1 11.4 17.6 3.6 14-2.6 27.8-12.4 37.6-2.4 2.4-4.8 4.9-7.8 6.5-1.7 .9-3.6 1.5-5.4 2.1-8.9-1.9-13.5-5.5-19.9-11.9l3.2 0c-4-4.9-7.3-9.9-8.7-16.1-3.3-14.7 5.2-30.1 19.1-35.7 3.7-1.5 7.3-1.9 11.2-2.3Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M119.1 82.4c.5 1.5 .5 1.8-.4 3.1l24.4 .1 .1 4-19.9 13.4c0-.9 0-1.9 0-2.8l-73.1 0 21.6-14.6 3.8 0c5.9 5.8 11 7.8 18.9 9.6l8.5-4c1.4-.6 3.1-.7 4.5-1.2 4.5-1.7 8.1-4.4 11.6-7.6Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M97.8 32.4c7.8 .3 15 2.8 20.7 8.4 15.5 15.3 10.8 43.3-9.5 52.1-5.3 2.3-10.7 2.5-16.5 2 2.1-.7 4.2-1.3 6.1-2.4 4.5-2.7 8.1-6.8 10.9-11.2 8.4-13.3 9.5-31.9-2.8-43.5-2.6-2.5-5.6-4-8.9-5.4Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M144 85.6l0 69.9-21.5 15.8 0-71.2 21.5-14.5Z\" fill=\"var(--art-ink,#231F3B)\"/>\n</svg>\n";
export const STILL_HASH = "5424522500";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 8) throw new Error("on: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
// ---- the world past the frame: the wall, the floor (its back edge at y 146.4), and the box's shadow, the still's own carried on to the shadow
// of the box's top (its edges along the still's two shadow edges, to the shadow of the box's top front and right edges)
const WALL = `<rect x="-400" y="-400" width="1000" height="546.4" ${fill("teal")}/>`;
const FLOOR = `<rect x="-400" y="146.4" width="1000" height="600" ${fill("teal-lit")}/>`;
const BOX_SHADOW = `<path d="M144 152l0 3.5L246.2 191.2L224.7 210.4L153.2 210.4L135.6 203.7l-84.6-32.4c-.2-.1-.4-.3-.6-.5c-.1-.6-.1-1.1 0-1.7c.4-.4 .8-.8 1.3-1.2l70.6 0 21.7-15.9Z" ${fill("teal-deep")}/>`;
// the box: its front, its whole top (the still's has a notch where the ball sat in front of it), its right side
const FRONT = EL[3], TOP = `<path d="M71.8 85.6H143.1L143.2 89.6L123.3 103V100.2H50.2Z" ${fill("paper-deep")}/>`, SIDE = EL[7];
// ---- the ball: the still's body and its shade, kept to its round outline (its traced foot, hidden by the top in the still, would show): a hair
// taller than wide, as the still draws it
const C0 = [97.3, 63.7], RX = 30.4, R = 31.2;
const BALL_PARTS = EL[4] + EL[6];
function ball(cx, cy) {
  const dx = cx - C0[0], dy = cy - C0[1];
  return `<g transform="translate(${n2(dx)} ${n2(dy)})"><clipPath id="bl"><ellipse cx="${C0[0]}" cy="${C0[1]}" rx="${RX}" ry="${R}"/></clipPath><g clip-path="url(#bl)">${BALL_PARTS}</g></g>`;
}
// it touches the top 0.36 of the way back from the box's front, so it rolls along that line: the top's right edge crosses it at E; the floor
// at that depth is y 165.6
const E = [130.5, 94.9], FLOOR_Y = 165.6, ON_FLOOR = FLOOR_Y - R;
// its shadow on the floor, by the box's light (a pole's shadow runs 1.52 its height along the box's shadow edge, (0.944, 0.33)); across, the
// ball's width foreshortened as the box's depth is (0.35), along the floor's depth axis
const DIR = [0.944, 0.33], DEPTH = [0.805, -0.592], K = 1.52;
function ballShadow(cx, cy) {
  const h = FLOOR_Y - cy, along = RX * 1.6, across = RX * 0.35;
  const px = cx + h * K * DIR[0], py = FLOOR_Y + h * K * DIR[1];
  return `<circle cx="0" cy="0" r="1" transform="matrix(${n4(along * DIR[0])} ${n4(along * DIR[1])} ${n4(across * DEPTH[0])} ${n4(across * DEPTH[1])} ${n2(px)} ${n2(py)})" ${fill("teal-deep")}/>`;
}
function view(z, fx, fy, inner) {
  const cam = z === 1 && fx === 100 && fy === 100 ? "" : `translate(100 100) scale(${n4(z)}) translate(${n2(-fx)} ${n2(-fy)})`;
  return `${OPEN}${cam ? `<g transform="${cam}">${inner}</g>` : inner}</svg>`;
}
const world = (bx, by, shadow) => `${WALL}${FLOOR}${BOX_SHADOW}${shadow ? ballShadow(bx, by) : ""}${FRONT}${TOP}${SIDE}${ball(bx, by)}`;

// ---- happy. From rest, up the sag to the brink (its middle 0.4 inside the edge), slowing as it climbs; a beat there, the gust fluttering it
// back and on; then, from rest, a damped roll back about the middle (period 1.3 s, settling by e^-2.4 a second), started with no kick.
const T_UP = 1.05, T_TEETER = T_UP + 0.56, BRINK = E[0] - 0.4;
const TEETER = [[0.05, C0[0]], [T_UP, BRINK - 1.1, "io"], [T_UP + 0.3, BRINK, "io"], [T_UP + 0.43, BRINK - 0.35, "io"], [T_TEETER, BRINK - 0.1, "io"]];
const W = (2 * Math.PI) / 1.3, DAMP = 2.4, FROM = BRINK - 0.1 - C0[0];
// the last unit or so of the roll dies away over its final 0.6 s (the ball's own friction), so it ends exactly in the middle, on the still's ball
const SETTLE = 1.6;
const back = (s) => C0[0] + FROM * Math.exp(-DAMP * s) * (Math.cos(W * s) + (DAMP / W) * Math.sin(W * s)) * (1 - track([[SETTLE - 0.6, 0], [SETTLE, 1, "io"]], s));
const T_SETTLED = T_TEETER + SETTLE;
const HAPPY_DUR = T_SETTLED + 0.4;
function happy(t) {
  if (t <= 0) return STILL;
  const x = t <= T_TEETER ? track(TEETER, t) : t >= T_SETTLED ? C0[0] : back(t - T_TEETER);
  return view(1, 100, 100, world(x, C0[1], false));
}

// ---- sad. Worked out once, as physics: the gust rolls it from rest (70 units/s², rolling) to the edge; it tips over the edge, turning about it
// (a rolling ball: φ'' = 5g/7R · sin φ) until the edge no longer holds it (g cos φ = R φ'²); it flies, lands, bounces once (a third of its fall
// back up, 0.85 of its speed on), lands again and rolls to a stop (300 units/s²). The box is about 0.45 m tall, so g is 1550 units/s².
const G = 1550, PUSH = 70, T0 = 0.08, ROLLING = 300, BOUNCE = 0.32, KEEP = 0.85;
const T_EDGE = T0 + Math.sqrt((2 * (E[0] - C0[0])) / PUSH), V_EDGE = PUSH * (T_EDGE - T0);
const PATH = (() => {
  // [t, x, y] every 1/600 s from the edge on
  const out = [], dt = 1 / 6000;
  let t = T_EDGE, phi = 0, w = V_EDGE / R, step = 0;
  while (G * Math.cos(phi) > R * w * w) {
    if (step++ % 10 === 0) out.push([t, E[0] + R * Math.sin(phi), E[1] - R * Math.cos(phi)]);
    w += ((5 * G) / (7 * R)) * Math.sin(phi) * dt; phi += w * dt; t += dt;
  }
  let x = E[0] + R * Math.sin(phi), y = E[1] - R * Math.cos(phi), vx = R * w * Math.cos(phi), vy = R * w * Math.sin(phi), bounced = false;
  for (;;) {
    if (step++ % 10 === 0) out.push([t, x, y]);
    vy += G * dt; x += vx * dt; y += vy * dt; t += dt;
    if (y >= ON_FLOOR) {
      y = ON_FLOOR;
      if (bounced) break;
      vy = -BOUNCE * vy; vx *= KEEP; bounced = true;
    }
  }
  return { table: out, landed: [t, x, vx] };
})();
const [T_ROLL, X_ROLL, V_ROLL] = PATH.landed, T_STOP = T_ROLL + V_ROLL / ROLLING, X_STOP = X_ROLL + (V_ROLL * V_ROLL) / (2 * ROLLING);
function ballAt(t) {
  if (t <= T_EDGE) return [C0[0] + 0.5 * PUSH * Math.max(0, t - T0) ** 2, C0[1]];
  if (t >= T_ROLL) { const s = Math.min(t, T_STOP) - T_ROLL; return [X_ROLL + V_ROLL * s - 0.5 * ROLLING * s * s, ON_FLOOR]; }
  const T = PATH.table, i = Math.min(T.length - 2, Math.floor((t - T_EDGE) * 600));
  const a = T[i], b = T[i + 1], u = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
  return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}
// the camera draws back as it goes over, to frame the box and the ball where it stops
const CAM = [T_EDGE - 0.3, T_STOP];
const Z_END = 0.8, FX_END = (40 + X_STOP + RX + 14) / 2, FY_END = 122;
const SAD_DUR = T_STOP + 0.7;
function sad(t) {
  if (t <= 0) return STILL;
  const [x, y] = ballAt(t);
  const s = track([[CAM[0], 0], [CAM[1], 1, "io"]], t);
  return view(1 + (Z_END - 1) * s, 100 + (FX_END - 100) * s, 100 + (FY_END - 100) * s, world(x, y, true));
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
