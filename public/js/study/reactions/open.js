// The open door's two stories, a draft's: the air moving through the doorway from the lit room takes the door. Happy: it pushes the door on round, wide
// open, slowing as it comes, until it lies against the wall beside the doorway: nothing in the way of the room and its light. Sad: it pulls the door to:
// it eases back a little, then swings shut faster and faster, bangs, bounces off the frame and shuts; the light on the floor narrows behind it and is gone.
// Every frame is a pure function of t, in seconds. The leaf is the still's own paths, swung in perspective: the camera is fitted to the drawing (the leaf is
// open at 90 degrees, and its vanishing point is where the jamb's depth line points). Each point of the leaf keeps its place across the door and its height.
import { n2, paint, parsePath, partsOf, runsToDc, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M54.1 140l3.8 3.7-47.7 59.5c-.3 .3-.6 .8-.8 1.2l-13.8 0 0-61 15.2 0 0-3.4 3.4 3.5 0 14.1c1.4 .3 3.2 1.1 4.6 .4l35.3-18ZM121.9 141.1c.1 .7 .1 1.3 .2 2 .2 .1 .4 .3 .7 .3l81.6 0 0 41.2-72.8-33.7c-2.9-1.3-6.3-2.4-8.9-4.3-1.2-.9-2.3-2.1-3.3-3.1l2.5-2.4Z\" fill=\"var(--art-violet-lit,#A68CFF)\" fill-rule=\"evenodd\"/>\n<path d=\"M122 139.7l0 3.4 82.4 38 0 23.3-41.2 0c-.3-.3-.5-.9-.9-1.2l-52.1-59.7c1.1-1 2.3-2.8 3.6-3.5 1.3-.7 6.5-.3 8.2-.3Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M114.2 28.3l3.7 3.7 0 105.3c-.5 .5-3.4 3.3-3.4 3.7 .1 .3 .9 1.1 1 1.3-.8 .1-1.4 0-2 .6l53.4 61.5-161.1 0 49.7-62.3c-.7 .3-1.4 .6-2.1 .9-.1 0-.5 .3-.6 .3-.3-.1-.4-.3-.6-.3 0-.2-.1-.5-.1-.7 .2-.7 2.9-2.6 3.6-2.9-.7-.7-2-1.8-2-2.9l-.1-68.5c1.1-1.1 2.3-2.6 3.6-3.4 1.5-.9 8.5-1.8 10.9-2.5 5.8-1.6 11.5-3.8 16.8-6.7 6.6-3.4 13.4-7.6 18.4-13.1 2-2 3.7-4.3 5.2-6.7 .8-1.2 1.4-2.6 2.3-3.8 1-1.3 2.2-2.4 3.4-3.5Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M18.7 9.8l25.3 15c1.7 1 4.3 .1 6.1 .5 2 .5 8.2 4.8 8.3 7l0 33.9c-.6 .6-2 1.4-2 2.4l-.1 68.8c.7 .7 1.4 1.2 2.1 1.8l0 3.2c-.8 0-1.7 0-2.5 0l-37.4 19.3c-1.2-.7-2.6-1-4.1-1.5l0-148.8 4.3-1.6ZM30 34.6l-.1 48.8c0 2.1-4.2 4.6-5.7 5.5 1.6 .7 5.7 3 5.7 5.1l.1 42.8 15.2-7.6 0-86.1-15.2-8.5Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M26.5 29.3l22.2 12.2 0 89.5-22.2 11 0-48.6c0-.3 .2-.5 .2-.7-.6-.3-1.3-.4-2-.7l2.3-2.3c-.3-2.1-.9-2.4-2.3-3.8 .5-.3 1.7-.8 1.7-1.6l.1-55Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M117.2 31.5c-.4 .1-.9 0-1.3 0-.8 .1-.1 .6-1.9 .1-1.9 5.8-7.6 11.6-12.1 15.6-10.2 9.2-23 15.9-36.3 19.1-3 .7-6.1 1-9.1 1.4-.2 .6-.3 1.3-.5 1.8 0-.2-.2-.4-.2-.7l-.1-36.5c0-.6-.3-1.5-.5-2 .8-.7 1.9-2.2 3.1-2.2l54.7 0c1.4 0 3.3 2.6 4.2 3.4Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<path d=\"M17.9 9.3l0 152.8-7.1-2 0-148.3 7.1-2.5Z\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n<path d=\"M43 24.3l79 0 0 118.9-67 0 0-111.8-12-7.1ZM57.1 31.5l0 106.2 57.3 0 0-106.2-57.3 0ZM29.2 85.9c1.6 1.8 1.5 4.5-.3 6.2-1.7 1.6-4.5 1.4-6.1-.3-1.6-1.8-1.5-4.6 .3-6.2 1.8-1.6 4.5-1.5 6.1 .3Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "70cee2eff6";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [FLOOR_LIT, FLOOR_DEEP, SUN, PAPER, PAPER_DEEP, SUN_LIT, INK_LIT, INK] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const fill = (t) => `fill="${paint(t)}"`;
const I = parsePath(INK.d);
const FRAME = `<path d="${runsToDc([I[0], I[1]])}" ${fill("ink")} fill-rule="evenodd"/>`;
// The jamb on the hinge side, which the leaf turns inside.
const JAMB = `<path d="M43 24.3H57.1V143.2H55V31.4Z" ${fill("ink")}/>`;

// ---- the camera and the leaf.
const Y_TOP = 32.6, Y_FLOOR = 141.8;
// The leaf stands at 90 degrees: its free edge is 1.391 times its height at the hinge, so it's that much nearer.
const HX = 57.1, W = 57.3, CX = 155.6, CY = 90.9, S1 = 1.391, D = (S1 * W) / (S1 - 1), PHI0 = 90;
const rad = (a) => (a * Math.PI) / 180;
const scaleAt = (z) => D / (D - z);
// Where a still point sits on the leaf: across it (u, 0 at the hinge, 1 at the free edge) and its height on the wall (Y).
const onLeaf = (x, y) => {
  const a = W * Math.cos(rad(PHI0)), b = W * Math.sin(rad(PHI0));
  const u = (D * (x - HX)) / (a * D + (x - CX) * b);
  return [u, CY + (y - CY) / scaleAt(u * b)];
};
const project = (u, Y, phi) => {
  const s = scaleAt(u * W * Math.sin(rad(phi)));
  return [CX + (HX + u * W * Math.cos(rad(phi)) - CX) * s, CY + (Y - CY) * s];
};
// The leaf's outline is trimmed to the door itself. Its thickness strip, beyond the free edge, is cut off. A sliver behind the hinge, and a corner tucked up
// under the frame's head, are hidden in the still: as the door swings round, they ease onto the hinge line and the door's top.
const swung = (runs, trim = false) => {
  const at = new Map();
  for (const r of runs) for (const s of r.segs) for (const q of s) {
    const k = `${q[0]},${q[1]}`;
    if (at.has(k)) continue;
    const [u, Y] = onLeaf(q[0], q[1]);
    at.set(k, trim ? [Math.min(u, U_FACE), Y] : [u, Y]);
  }
  return (phi) => {
    const k = trim ? Math.max(0, Math.min(1, (phi - EDGE_ON) / (PHI0 - EDGE_ON))) : 1;
    return runsToDc(runs, (x, y) => {
      let [u, Y] = at.get(`${x},${y}`);
      if (u < 0) u *= k;
      if (trim && Y < Y_TOP) Y = Y_TOP + (Y - Y_TOP) * k;
      const p = project(u, Y, phi);
      return u < 0 ? [Math.max(p[0], 55.2), p[1]] : p;
    });
  };
};
// Where the face ends and the edge's strip begins, in the still.
const U_FACE = onLeaf(17.9, 80)[0];
const LEAF = swung(parsePath(PAPER.d), true), PANEL = swung(parsePath(PAPER_DEEP.d)), EDGE = swung(parsePath(INK_LIT.d)), KNOB = swung([I[2]]);
// Past this angle the leaf is edge-on to the eye and its other face shows.
const EDGE_ON = (Math.atan2(D, CX - HX) * 180) / Math.PI;

// ---- the light: the doorway and the beam on the floor, less whatever the leaf hides or shades. The beam's rays come from a point inside the room.
const S = [82.9, 107.4], L0 = [55.5, 141.8], R0 = [113.5, 142.6];
const along = (p, y) => [S[0] + ((p[0] - S[0]) * (y - S[1])) / (p[1] - S[1]), y];
const cross = (p, q) => (p[0] - S[0]) * (q[1] - S[1]) - (p[1] - S[1]) * (q[0] - S[0]);
// The floor under the beam, for when it's gone.
const UNDER = `<path d="M${[L0, R0, along(R0, 215), along(L0, 215)].map((p) => `${n2(p[0])} ${n2(p[1])}`).join("L")}Z" ${fill("violet-lit")}/>`;
// The floor the open leaf stands on, which the still never shows.
const BEHIND_LEAF = `<path d="M10.8 143H54.7L18.5 161.7 17.9 162.1 10.8 160.1Z" ${fill("violet-lit")}/>`;
// The wall where the floor's edge pokes up under the open leaf.
const WALL = `<path d="M10.8 137H55.6V143H10.8Z" ${fill("violet")}/>`;
const pts = (list) => list.map((p) => `${n2(p[0])} ${n2(p[1])}`).join("L");
function lit(phi) {
  const top = project(1, Y_TOP, phi), bottom = project(1, Y_FLOOR, phi);
  let above;
  if (phi >= EDGE_ON) above = `M-5 -5H205V${Y_FLOOR}H-5Z`;
  else {
    // The doorway shows only right of the leaf's free edge.
    const k = (bottom[0] - top[0]) / (bottom[1] - top[1]), xAt = (y) => top[0] + k * (y - top[1]);
    above = `M${n2(xAt(-5))} -5H205V${Y_FLOOR}H${n2(xAt(Y_FLOOR))}Z`;
  }
  // The leaf's foot shades the floor when it's across the beam's near edge.
  const F = bottom, shaded = cross(L0, F) < 0 && phi < EDGE_ON + 15;
  const floor = shaded ? [L0, R0, along(R0, 215), along(F, 215), F, [HX, Y_FLOOR]] : [L0, R0, along(R0, 215), along(L0, 215)];
  return `<clipPath id="lt"><path d="${above}M${pts(floor)}Z"/></clipPath>`;
}

// Back to front. Past edge-on, the leaf is in front of everything round the doorway.
function scene(phi, { beam = "" } = {}) {
  const light = `<g clip-path="url(#lt)">${SUN.svg}</g>`;
  const edgeK = Math.max(0, Math.min(1, (phi - (EDGE_ON - 6)) / 12));
  const leaf = `<path d="${LEAF(phi)}" ${fill("paper")} fill-rule="evenodd"/><path d="${PANEL(phi)}" ${fill("paper-deep")}/>`;
  const edge = edgeK > 0 ? `<path d="${EDGE(phi)}" ${fill("ink-lit")}${edgeK < 1 ? ` opacity="${n2(edgeK)}"` : ""}/>` : "";
  const knob = `<path d="${KNOB(phi)}" ${fill("ink")}/>`;
  // (edge-on, the leaf's face is a line: its thickness, the free edge's own face, is what shows, along the hinge's line)
  // (always there under the leaf, hidden by its face and the jamb; only near edge-on does it reach the free edge's height and show)
  const w = Math.max(0, 1 - Math.abs(phi - EDGE_ON) / 6), a = project(1, Y_TOP, EDGE_ON), b = project(1, Y_FLOOR, EDGE_ON);
  const thick = `<path d="M${n2(HX - 2.8)} ${n2(Y_TOP + (a[1] - Y_TOP) * w)}H${HX}V${n2(Y_FLOOR + (b[1] - Y_FLOOR) * w)}H${n2(HX - 2.8)}Z" ${fill("ink-lit")}/>`;
  const floor = `${UNDER}${BEHIND_LEAF}${FLOOR_LIT.svg}${WALL}${FLOOR_DEEP.svg}<path d="M57.1 31.5H114.4V137.7H57.1Z" ${fill("ink")}/>`;
  if (phi >= EDGE_ON) return `${lit(phi)}${floor}${light}${beam}${thick}${leaf}${SUN_LIT.svg}${edge}${FRAME}${knob}`;
  return `${lit(phi)}${floor}${light}${beam}${SUN_LIT.svg.replace("/>", ' clip-path="url(#lt)"/>')}${FRAME}${thick}${leaf}${edge}${knob}${JAMB}`;
}

// ---- happy.
const HAPPY_DUR = 2.4;
function happy(t) {
  if (t <= 0) return STILL;
  // From rest it's pushed round, gathering speed, then slowing as it nears the wall (the draft spent, the hinge's friction), touches it, eases back a
  // hair and settles against it.
  const phi = track([[0.15, PHI0], [1.25, 178.5, "io"], [1.45, 176.5, "io"], [1.7, 178, "io"]], t);
  return `${SVG}${BG}${scene(phi)}</svg>`;
}

// ---- sad.
const SAD_DUR = 2.3;
const SLAM = 0.3 + Math.sqrt((2 * 93) / 640);
function sad(t) {
  if (t <= 0) return STILL;
  // It eases back a few degrees, holds, then swings shut from rest, faster and faster; bangs, bounces off the frame twice, and is shut.
  let phi;
  if (t < 0.3) phi = track([[0.04, PHI0], [0.2, 93, "io"], [0.3, 93]], t);
  else if (t < SLAM) phi = 93 - 0.5 * 640 * (t - 0.3) ** 2;
  else { const q = t - SLAM; phi = q < 0.18 ? 9 * Math.sin((Math.PI * q) / 0.18) : q < 0.28 ? 2.4 * Math.sin((Math.PI * (q - 0.18)) / 0.1) : 0; }
  return `${SVG}${BG}${scene(phi)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
