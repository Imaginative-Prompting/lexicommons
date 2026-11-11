// The bit's two stories: the last bit of cake on a plate. Happy: more cake. A cake server comes in from the right, held out of the frame, carrying
// a fresh piece, and sets it down at the back of the plate, behind the last bit, and slides out from under it. Sad: the server slides in under the
// last bit to take it, and lifts it; the bit's too wide for the blade, so it tips over the blade's edge, topples onto its side on the plate and
// lands dented, its filling squashed out. The server goes away empty.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<rect y=\"132\" width=\"200\" height=\"68\" fill=\"var(--art-violet-lit,#A68CFF)\"/>\n<path d=\"M176 136L200 155.5V200H88C64 194 40 182 24 160Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<ellipse cx=\"98.5\" cy=\"145.5\" rx=\"82\" ry=\"40.5\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<ellipse cx=\"94.5\" cy=\"142\" rx=\"78\" ry=\"37\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<polygon points=\"90,133 99,138 129,144.2 145,132 136,127\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"119.5,115.6 136,104 136,127 119.5,139.4\" fill=\"var(--art-sun,#F7BE45)\"/>\n<polygon points=\"119.5,124.4 136,112 136,116.5 119.5,128.9\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<polygon points=\"90,110 120,115.5 120,139 90,133\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<polygon points=\"90,118 120,124 120,128.5 90,122.5\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M90 110L120 116L136 104C133 96 108 90 90 110Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<ellipse cx=\"141\" cy=\"137\" rx=\"2.2\" ry=\"1.6\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<ellipse cx=\"133.5\" cy=\"143\" rx=\"2\" ry=\"1.4\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<ellipse cx=\"146\" cy=\"143.5\" rx=\"1.4\" ry=\"1.1\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<path d=\"M141 169.3A4 4 0 0 0 143.8 161.7L83 141.6L70 135L66 145L40.8 135.1Q37.4 135.4 39.7 138L67.9 148.1C70.1 147.8 75.8 144.1 81.5 145.8Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M140.6 167.8A4 4 0 0 0 143.4 160.2L82.6 140.1C77.1 137.9 75.1 131.3 73.7 129.7L45.5 119.5Q42.1 119.9 44.4 122.4L68.8 131.2Q71.3 133.1 68.2 133L43.8 124.2Q40.4 124.6 42.7 127.1L67.1 135.9Q69.6 137.8 66.5 137.8L42.1 128.9Q38.7 129.3 41 131.8L65.4 140.6Q67.9 142.5 64.8 142.4L40.4 133.6Q37 133.9 39.3 136.5L67.5 146.6C69.7 146.3 75.4 142.6 81.1 144.3Z\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n</svg>\n";
export const STILL_HASH = "14aab30123";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 16) throw new Error("bit: the still isn't as this story knows it");
const [BG, TABLE, PSHADOW, RIM, TOP, CSHADOW, R_FACE, R_FILL, F_FACE, F_FILL, CTOP, C1, C2, C3, FORK_D, FORK] = EL;
const CAKE = `${R_FACE}${R_FILL}${F_FACE}${F_FILL}${CTOP}`;
const CRUMBS = `${C1}${C2}${C3}`;
const fill = (t) => `fill="${paint(t)}"`;
const at = (x, y) => `translate(${n2(x)} ${n2(y)})`;
// The plate's top, for what lies on it (a shadow on the plate stops at its edge).
const PLATE = `<clipPath id="pt"><ellipse cx="94.5" cy="142" rx="78" ry="37"/></clipPath>`;
// The bit's base, the middle of its foot on the plate.
const BASE = [115, 134];

// The server: a flat steel blade, seen from above and in front, and its handle running up and out of the frame to the hand that holds it (to the
// right). Drawn at its blade's middle; `rot` turns it about the hand.
function server(x, y, rot = 0) {
  const blade = `<polygon points="-20,-1.5 13,-8 17,-4 17,3.5 -14,5.5" ${fill("steel")}/><polygon points="-14,5.5 17,3.5 17,5.2 -14,7.2" ${fill("steel-deep")}/>`;
  const handle = `<path d="M15 -1L160 -38" fill="none" stroke="${paint("ink")}" stroke-width="4" stroke-linecap="round"/>`;
  return `<g transform="${at(x, y)}${rot ? ` rotate(${n2(rot)} 140 -33)` : ""}">${handle}${blade}</g>`;
}
// A piece's shadow on the plate under it, lifted by h: it slips a little toward the back, away from the light, and narrows.
const shadowAt = (dx, dy, h) => {
  const k = Math.max(0, 1 - h / 45);
  if (k <= 0) return "";
  return `<g clip-path="url(#pt)"><g transform="${at(BASE[0] + dx + 0.4 * h, BASE[1] + dy)} scale(${n4(k)}) ${at(-BASE[0], -BASE[1])}">${CSHADOW}</g></g>`;
};

// ---- happy.
const HAPPY_DUR = 2.3;
// The fresh piece goes down at the back of the plate, behind the last bit and clear of the fork.
const PIECE = [-32, -16];
const SET = [BASE[0] + PIECE[0] + 2, BASE[1] + PIECE[1] + 1];
function happy(t) {
  if (t <= 0) return STILL;
  // Carried in from the right, high, then lowered to the plate; a beat; then the blade slides out from under it, faster as it goes.
  const x = track([[0.1, SET[0] + 180], [0.85, SET[0], "io"], [1.15, SET[0]], [1.8, SET[0] + 150, "in"]], t);
  const y = track([[0.1, SET[1] - 24], [0.85, SET[1] - 5, "io"], [1.0, SET[1], "io"]], t);
  // The piece rides the blade until it's set down; then it stays, settling the blade's thickness onto the plate as the blade leaves it.
  const set = t >= 1.15;
  const settle = set ? track([[1.15, 0], [1.3, 1.2, "in"]], t) : 0;
  const px = set ? PIECE[0] : PIECE[0] + (x - SET[0]), py = set ? PIECE[1] + settle : PIECE[1] + (y - SET[1]);
  const h = set ? 1.2 - settle : SET[1] - y + 1.2;
  const piece = `<g transform="${at(px, py)}">${CAKE}</g>`;
  return `${OPEN}${PLATE}${BG}${TABLE}${PSHADOW}${RIM}${TOP}${shadowAt(px, py, h)}${server(x, y)}${piece}${CSHADOW}${CAKE}${CRUMBS}${FORK_D}${FORK}</svg>`;
}

// ---- sad.
const SAD_DUR = 2.6;
// The blade goes in under the bit's left side; the bit is wider than it, and the blade's right edge is where it tips over.
const UNDER = [BASE[0] - 4, BASE[1] + 1], EDGE = [BASE[0] + 6, BASE[1]];
const LIFT = 11, TOP_T = 1.02, FALL_T = 0.34, FLAT = 84;
function sad(t) {
  if (t <= 0) return STILL;
  // In it slides, from the right, slowing as it goes under; up it lifts.
  const x = track([[0.1, UNDER[0] + 135], [0.72, UNDER[0], "out"], [1.7, UNDER[0]], [2.3, UNDER[0] + 150, "in"]], t);
  const lift = track([[0.8, 0], [TOP_T, LIFT, "io"], [TOP_T + FALL_T + 0.1, LIFT], [TOP_T + FALL_T + 0.35, 2, "io"]], t);
  const y = UNDER[1] - lift;
  // Lifted, the bit's weight is past the blade's edge: it leans over, slowly, then faster and faster about that edge, dropping the lift as it goes,
  // and lands on its side on the plate. It's soft: it squashes as it lands and stays a little flattened, its filling pressed out on the plate.
  const tip = t < TOP_T ? 0 : track([[0, 0], [0.12, 6, "in"], [FALL_T, FLAT, "in"]], t - TOP_T);
  const drop = t < TOP_T ? -Math.min(lift, LIFT) : -LIFT * (1 - track([[0, 0], [FALL_T, 1, "in"]], t - TOP_T));
  const landed = t >= TOP_T + FALL_T;
  const squash = landed ? track([[0, 0], [0.05, 1, "out"], [0.16, 0.45, "io"]], t - TOP_T - FALL_T) : 0;
  const pivot = [EDGE[0], EDGE[1] + drop];
  // (squashed along the way it fell: its width as it now lies, which was its height)
  const cakeT = `${at(pivot[0], pivot[1])} rotate(${n2(tip)}) scale(${n4(1 - 0.16 * squash)} 1) ${at(-EDGE[0], -EDGE[1])}`;
  const smear = landed ? (() => { const s = Math.min(1, (t - TOP_T - FALL_T) / 0.1); return `<g clip-path="url(#pt)"><ellipse cx="${n2(EDGE[0] + 30)}" cy="${n2(EDGE[1] + 4)}" rx="${n2(9 * s)}" ry="${n2(2.4 * s)}" ${fill("clay")}/></g>`; })() : "";
  // its shadow: under it while it's lifted (narrowing), and under it again where it lies
  // (one shadow all the way: narrowing as it's lifted, then going over with it, to lie flatter under where it lands)
  const f = tip / FLAT, h = Math.min(lift, LIFT) * (1 - f), kk = Math.max(0.05, 1 - h / 45);
  const sx = kk + (1 - kk) * f, sy = kk + (0.7 - kk) * f, ox = BASE[0] + 0.4 * h + (EDGE[0] + 18 - BASE[0]) * f, oy = BASE[1] + 3 * f;
  const shadow = `<g clip-path="url(#pt)"><g transform="${at(ox, oy)} scale(${n4(sx)} ${n4(sy)}) ${at(-BASE[0], -BASE[1])}">${CSHADOW}</g></g>`;
  // While the bit's on the blade the blade is under it (the bit drawn over it); once the bit's off, the blade is behind where it lies. The crumbs
  // are on the plate, under whatever comes down on them.
  return `${OPEN}${PLATE}${BG}${TABLE}${PSHADOW}${RIM}${TOP}${shadow}${smear}${CRUMBS}${server(x, y)}<g transform="${cakeT}">${CAKE}</g>${FORK_D}${FORK}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
