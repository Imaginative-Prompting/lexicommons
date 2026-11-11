// The film's two stories. Happy: action! The clapper winds up and snaps shut with a clap, bounces once on the board, and stays shut.
// Sad: the film burns. A spot browns in the middle of the board, glows, and a hole eats outward through it, edged with embers and smoking, until it's out.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths: the stick, its hinge and the board are its runs, kept apart.
import { blob, n2, n4, paint, parsePath, partsOf, runsToDc, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M23 173.4c1.4 .6 2.8 1.2 4.3 1.5 3.1 .4 6.5 .1 9.7 .1 6.3 0 12.7 0 19 0 24.2 0 48.5 0 72.7 0 7.5 0 15 0 22.5 0 4.6 0 9.1 .5 13.4-1.4 .6 .7 1.2 1.2 1.7 1.9-.4 .6-1 1.1-1.4 1.6 .2 0 .4 .2 .7 .2 .6 .1 1.3-.4 1.9-.2l36.9 13.4 0 13.9-131.6 0c-6.4-4.4-14.9-8.5-21.9-12.2-9.3-4.9-18.4-10.1-27.8-14.6-.8-1.5-.5-1.1-1.8-2.5 .6-.5 1.2-1.1 1.7-1.7Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M157.1 46.6c-.3 .3-1.1 1.1-1.5 1.2l-19.3 7.8-3.8-3.8c1.8-7 3.5-14 6.1-20.8l3.8-1.4c2.6-3.1 7.5-2.2 10 .8 1 1.4 3.8 9.5 4.2 11.4 .2 1.6 .1 3.2 .5 4.8ZM127.6 35.3c.5 .3 .8 .7 1.2 1.2l-6.7 22.5c-.4 1.5-4.1 3.6-5.4 4.1-5.1 2-10.1 3.8-15.1 5.8l-3.8-3.8c1.7-7 3.7-13.8 5.9-20.6l3.9-1.5c.4-.5 .5-.8 1-1.2 1.3-1 10.2-4 12.3-4.8 .5-.2 4.3-1.7 4.4-1.5 .2 .1 .2 .4 .4 .5 .6-.3 1.2-.5 1.9-.7ZM93.1 48.7c.4 .4 .7 .7 1 1.1l-6.6 22.1c-.4 1.3-4 3.8-5.3 4.3-5.1 1.9-10.2 3.8-15.3 5.7l-3.7-3.7c1.5-6.9 3.6-13.5 5.8-20.2l9-4.4 12.8-4.7c.2-.1 .2 .4 .3 .6 .6-.3 1.3-.6 2-.8ZM56.6 62.9c.6-.3 1.2-.5 1.9-.7 .4 .3 .7 .6 1.1 1l-6.6 21.8c-.2 .8-2.6 2.8-3.3 3.5 .3 .4 .6 .9 .9 1.3-.6 .4-1 .7-1.4 1.3l42.1 .5c.2 0 .2 .4 .3 .6l3.3 0 0 85.4-3.2 0c-.2 .1-.2 .4-.3 .5-.4 .5-3.4 .4-4.1 .4-3.9 0-7.9 0-11.8 0-13.1 0-26.3 0-39.5 0-5.4 0-11.8 .9-15.3-4.2-2.6-3.6-1.7-8.9-1.7-13.1 0-9.7 0-19.5 0-29.2 0-8.2-.1-16.4-.1-24.5 0-1.2-.3-8.3 .6-8.7 .2-.1 .4 0 .5-.2-.3-.4-.6-.9-1-1.3 .3-.6 .6-.9 1.1-1.3 3.2 1.7 6.4 2.8 10.1 1.7 1-.3 2.1-.7 2.8-1.5 1.4-1.6 1.5-4 3-5.9-.3-.5-.7-.9-1.2-1.4-1 2.6-4.1 6.9-7 7.6-3.1 .8-8.7-4.6-8.7-7.6 0-3.1 5.7-8.5 8.9-7.5 2.8 .9 5.7 4.8 6.9 7.2-.6-2.6-1.4-4.7-2.8-7.1 .4-1.2 3.2-9.3 3.8-9.7l7.6-4.7 12.7-4.7c.2-.1 .3 .3 .4 .5ZM153.6 107.3l3.9 3.9c-.4 4.2 .7 8.1-3.7 10.5-1.8 1-12.6 .5-15.3 .5-12.9 0-25.7 0-38.6 0l-3.9-3.9c0-3.6-.8-6.3 1.9-9 .6-.6 1.1-1.3 1.9-1.6 1.8-1 12.6-.4 15.3-.4 12.8 0 25.6 0 38.5 0ZM80.6 114.6c0 .4-10.9 .7-24.5 .7-13.5 0-24.5-.2-24.5-.6 0-.3 11-.6 24.5-.7 13.6 0 24.5 .3 24.5 .6ZM157.3 139.2l-3.7 3.7-53.5 .1c-1.1-1.1-2.9-2.3-3.6-3.8-.4-.9-.3-1.9-.3-2.9 0-2.8-.2-3.9 1.9-6 .5-.5 1.1-1.2 1.8-1.6 1.7-.9 10.4-.4 12.9-.4 9.6 0 19.2 0 28.8 0 2.3 0 10.1-.5 11.8 .3 .8 .4 1.3 1.1 1.9 1.6 3 3 2 5.1 2 9ZM79.3 135.8c0 .2-10.6 .5-23.8 .5-13.1 0-23.7-.3-23.7-.5 0-.3 10.6-.5 23.7-.5 13.2 0 23.8 .2 23.8 .5ZM157.5 153.2l0 7c-1.2 1.1-2.4 2.8-3.9 3.5-1.9 .9-11.9 .4-14.6 .4-13 0-25.9 .1-38.9 .1l-3.9-3.9c0-3.5-.9-6.2 1.9-9 .5-.5 1.1-1.2 1.8-1.6 1.8-.9 11.3-.4 13.9-.4 9.2 0 18.5 0 27.7 0 2.4 0 10.4-.4 12.1 .4 1.5 .7 2.7 2.4 3.9 3.5ZM81.4 156.8c0 .3-11.1 .5-24.8 .5-13.7 0-24.8-.3-24.8-.6 0-.3 11.1-.5 24.8-.5 13.7 .1 24.8 .3 24.8 .6Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M157.1 43c.5 2.5 1.2 5.1-.3 7.4-1.6 2.6-4.9 3.4-7.6 4.4-5.6 2.1-11.2 4.1-16.8 6.1-20.9 7.6-41.7 15.3-62.6 22.8-5.1 1.8-10.1 3.8-15.2 5.6-1.8 .6-3.7 1.6-5.6 2-2.7 .5-8.3 .3-11.1-.2-.4 .6-.6 1.1-.8 1.8l-2.9-2.7 3.1-2.7c.1 .7 .1 1.2 .6 1.8l12.9-4.9 1-3.8 14.7-5.5-.7 3.5c3.2-.8 6.3-2.2 9.5-3.3 3.4-1.3 6.8-2.5 10.1-4.1l.9-3.5 14.9-5.7-.9 3.6 19.6-7.2 1.1-3.9 14.9-5.8-.8 3.6c4.2-1.2 8.3-3 12.5-4.6 2.3-.9 5-1.5 7.2-2.8 .8-.5 1.6-1.2 2.3-1.9ZM155.4 91.4c5.2 0 11 .9 13 6.5 1.3 3.5 .6 16.3 .6 20.9 0 12 0 23.9 0 35.9 0 4.2 .7 13.7-.5 17.2-1.8 5.9-6.9 6.6-12.2 6.6 0-.1-.2-.1-.2-.1 .1-.4 .5-.3 .4-.7 0-.1-.2 0-.2 0-.8-.2-1.4 0-2.2-.2 .9-1.2 2-2.2 2.6-3.5 1.6-3.8 .9-14.1 .9-18.6 0-12.6 0-25.2 0-37.8 0-4.3 .7-16.7-.6-20.1-.8-2.1-2.8-3.4-4-5.2 .8-.1 1.5-.1 2.2-.1 .1-.1 .4 .1 .4-.2 0-.2-.4-.2-.4-.5 0-.1 .2 0 .2-.1Z\" fill=\"var(--art-ink-lit,#3A3460)\" fill-rule=\"evenodd\"/>\n<path d=\"M142.9 28.6c-2.6 7.8-5 15.6-7 23.6l-16.9 6.6 6.7-23.7 17.2-6.5ZM108.1 42c-2.6 7.8-4.9 15.5-7 23.5l-16.7 6.3c2-7.8 4.1-15.5 6.7-23.2l17-6.6ZM73.5 55.4c-2.7 7.6-5.1 15.2-6.9 23.1l-16.7 6.4c1.9-7.7 4.2-15.3 6.6-22.8l17-6.7ZM40.7 68.2l-5.2 13.3c1.5 2.4 2.6 4.7 2.8 7.6 .6 15.8-22.5 16.9-22.1 .8 .1-2.4 .6-4.8 1.6-7 1-1.9 2.6-4.7 4.7-5.7l18.2-9ZM30.1 86.2c1.5 1.8 1.3 4.5-.6 6-1.8 1.5-4.5 1.3-6-.5-1.5-1.9-1.3-4.6 .5-6.1 1.9-1.5 4.6-1.3 6.1 .6ZM91.4 91.4c15.6 0 31.1 0 46.7 0 3.6 0 7.3 0 11 0 1.7 0 3.5-.2 5.2 .1 .9 .2 1.7 .6 2.4 1.1 5.8 3.8 4.4 11.8 4.4 17.7 0 16 0 32 0 48 0 5.2 1.3 15.6-3.4 18.9-.8 .6-1.7 1-2.7 1.2-1.7 .3-3.5 .1-5.2 .1-3.5 0-7 0-10.5 0-16 0-31.9 0-47.9 0l0-87.1ZM30.1 110.6l50.7 0c1.1 0 2 .9 2 2l0 4.2c0 1-.9 1.9-2 1.9l-50.7 0c-1.1 0-2-.9-2-1.9l0-4.2c0-1.1 .9-2 2-2ZM100.8 110.8l51.9 0c.7 0 1.3 .5 1.3 1.3l0 5.3c0 .7-.6 1.3-1.3 1.3l-51.9 0c-.7 0-1.3-.6-1.3-1.3l0-5.3c0-.8 .6-1.3 1.3-1.3ZM29 131.8l53.1 0c.4 0 .7 .3 .7 .7l0 6.5c0 .4-.3 .7-.7 .7l-53.1 0c-.4 0-.7-.3-.7-.7l0-6.5c0-.4 .3-.7 .7-.7ZM99.7 131.8l0 7.8 54.1-.2 0-7.6-54.1 0ZM82.8 152.8l0 8-54.5-.2 0-7.8 54.5 0ZM99.7 152.8l0 8 54.3-.2 0-7.8-54.3 0Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "04fca4c642";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [SHADOW, PAPER, LIT, INK] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const fill = (t) => `fill="${paint(t)}"`;
const P = parsePath(PAPER.d), L = parsePath(LIT.d), K = parsePath(INK.d);
const path = (runs, c) => `<path d="${runsToDc(runs)}" ${fill(c)} fill-rule="evenodd"/>`;
// The board's paper run also holds the stick's first white stripe, by the hinge (they touch, and they're one color): a clip splits it off to turn with the stick.
// The band the stick lies in, by the hinge: between its lower edge and its upper.
const BAND = "38,92.3 78,76.2 78,50 38,62";
const STRIPE = `<clipPath id="sw"><polygon points="${BAND}"/></clipPath><clipPath id="bw"><path d="M-5 -5H205V205H-5ZM${BAND.replace(/ /g, "L")}Z" clip-rule="evenodd"/></clipPath>`;
const BOARD_PAPER = runsToDc(P.slice(3));
const STICK = { paper: `${path(P.slice(0, 3), "paper")}<path d="${BOARD_PAPER}" ${fill("paper")} fill-rule="evenodd" clip-path="url(#sw)"/>`, lit: path([L[0]], "ink-lit"), ink: path(K.slice(0, 3), "ink") };
const BOARD = { paper: `<path d="${BOARD_PAPER}" ${fill("paper")} fill-rule="evenodd" clip-path="url(#bw)"/>`, lit: path([L[1]], "ink-lit"), ink: path(K.slice(5), "ink") };
const HINGE = path(K.slice(3, 5), "ink");
const PIVOT = [27, 89];
const decay = (t, at, amp, hz, k) => (t <= at ? 0 : amp * Math.sin(2 * Math.PI * hz * (t - at)) * Math.exp(-k * (t - at)));
// As the still paints them: papers, then the darks, then the blacks; the stick turned about its hinge. Unturned, the board's paper is drawn as it is.
const scene = (turn, inner = "") => {
  if (turn === 0) return `${path(P, "paper")}${path(L, "ink-lit")}${path(K, "ink")}${inner}`;
  const r = `rotate(${n4(turn)} ${PIVOT[0]} ${PIVOT[1]})`;
  return `${BOARD.paper}<g transform="${r}">${STICK.paper}</g>${BOARD.lit}<g transform="${r}">${STICK.lit}${STICK.ink}</g>${BOARD.ink}${HINGE}${inner}`;
};

// ---- happy.
const CLAP = 0.3;
// A kernel: three puffs, a toasty spot. Each pops at the clap from the top edge, and flies: out, up, falling, landing on the floor or on the board's top.
const KERNELS = [[44, -60, 250, 186, 0.0], [62, -20, 300, 92, 0.02], [80, 30, 330, 190, 0.01], [96, -45, 280, 88, 0.04], [112, 50, 310, 194, 0.03], [128, -10, 260, 91, 0.05],
  [140, 75, 290, 184, 0.02], [58, -90, 230, 192, 0.06], [118, 95, 240, 188, 0.07], [150, 40, 200, 90, 0.08], [74, 60, 220, 89, 0.09], [100, -100, 260, 196, 0.1]];
const G = 760;
// Kernels go in two paths, every puff a circle written as two arcs: popcorn is many small things, and bytes add up.
const circ = (x, y, r) => `M${n2(x - r)} ${n2(y)}a${n2(r)} ${n2(r)} 0 1 0 ${n2(2 * r)} 0a${n2(r)} ${n2(r)} 0 1 0 ${n2(-2 * r)} 0`;
function kernel(x, y, s, spin) {
  const r = 4.2 * s, a = (spin * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const at = (dx, dy) => [x + dx * c - dy * sn, y + dx * sn + dy * c];
  const puffs = [[-0.6, 0.25, 0.8], [0.55, 0.2, 0.75], [0, -0.35, 1]].map(([dx, dy, f]) => circ(...at(dx * r, dy * r), r * f)).join("");
  return [puffs, circ(...at(0.3 * r, 0.55 * r), 0.45 * r)];
}
const HAPPY_DUR = 2.2;
function happy(t) {
  if (t <= 0) return STILL;
  // Wind up, snap, the clap; it bounces once on the board.
  const turn = t < CLAP ? track([[0, 0], [0.04, 0], [0.17, -8, "io"], [CLAP, 22, "in"]], t) : 22 - Math.abs(decay(t, CLAP, 4, 5, 9));
  const jolt = t > CLAP && t < CLAP + 0.12 ? Math.sin(((t - CLAP) / 0.12) * Math.PI) * 1.6 : 0;
  // No lines for the clap and no popcorn: a clapperboard has nothing to throw, and drawn marks for a sound are a stock effect. The snap, the clap and
  // the bounce on the board are the story; it ends shut, ready for the take.
  const lines = "", corn = "";
  return `${OPEN}${STRIPE}${BG}${SHADOW.svg}<g transform="translate(0 ${n2(jolt)})">${scene(turn)}</g>${lines}${corn}</svg>`;
}

// ---- sad. The burn: a ragged ring that grows, embers on its edge, char inside that, and nothing in the middle, all of it only on the board.
const C = [104, 136];
const ring = (r, t, grow = 0) => {
  const pts = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * 2 * Math.PI, k = 1 + 0.2 * Math.sin(3 * a + 1.1) + 0.12 * Math.sin(7 * a + 0.4) + 0.05 * Math.sin(11 * a + t * 9);
    pts.push([C[0] + Math.cos(a) * (r + grow) * k, C[1] + Math.sin(a) * (r + grow) * k * 0.92]);
  }
  return blob(pts);
};
const SAD_DUR = 2.45;
function sad(t) {
  if (t <= 0) return STILL;
  const r = track([[0.22, 0], [0.55, 4, "in"], [1.7, 34, "out"]], t);
  const glow = track([[0.25, 0], [0.4, 1, "out"], [1.6, 1], [2.0, 0, "io"]], t);
  let burn = "";
  if (r > 0.05) {
    // Every ring grows with the hole from a point, so nothing appears at its full width.
    const g = Math.min(1, r / 6);
    const ember = glow > 0 ? `<path d="${ring(r, t, 5.5 * g)}" ${fill("clay")}${glow < 1 ? ` opacity="${n2(glow)}"` : ""}/>` : "";
    // (the hottest line of the edge kindles in, and cools away, by its width: it never switches on or off whole)
    const hot = Math.max(0, Math.min(1, (glow - 0.3) / 0.3));
    // (it shimmers as embers do: the hot yellow over the orange brightens and dims smoothly, never switching color from one frame to the next)
    const edge = ring(r, t, 3.4 * g * hot), shimmer = 0.5 + 0.5 * Math.sin(t * 40);
    const flicker = hot > 0 ? `<path d="${edge}" ${fill("clay-lit")}${glow < 1 ? ` opacity="${n2(glow)}"` : ""}/><path d="${edge}" ${fill("sun")} opacity="${n2(glow * shimmer)}"/>` : "";
    burn = `<g clip-path="url(#bd)"><path d="${ring(r, t, 8 * g)}" ${fill("clay-deep")} opacity="0.55"/>${ember}${flicker}<path d="${ring(r, t, 1.8 * g)}" ${fill("ink-lit")}/>${r > 3 ? `<path d="${ring(r - 3, t)}" ${fill("teal")}/>` : ""}</g>`;
  }
  // (No smoke: puffs drawn as circles that swell and shrink away to specks read as a stock effect, not as smoke. The burn is the story.)
  const clip = `<clipPath id="bd">${[P[3], L[1], K[5]].map((run) => `<path d="${runsToDc([run])}"/>`).join("")}</clipPath>`;
  return `${OPEN}${clip}${BG}${SHADOW.svg}${scene(0, burn)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
