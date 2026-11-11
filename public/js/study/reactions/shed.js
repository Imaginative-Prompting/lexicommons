// Shed's story. Happy, nearly: the shovel's foot slips and it topples along the wall, until its shaft comes down on the doors' latch bar and rests
// there, propped. Sad: the shovel stands leaning on the shed's front wall, its blade on the ground. Its foot slips; it slides along the wall
// and topples over to the right, slowly, then faster, and comes down with a clatter lying along the foot of the shed, across the bottom of the door.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky and the ground, then (all inside the still's own frame, 1.4 times
// these units) the shed's shadow, its side, its front and the boards' lines, its door (frame, two leaves, latch), its roof, the shovel's shadow, and
// the shovel (its shaft, its D-grip, its socket and its blade, its foot on the ground at 61.6, 147.8). The shed (2.4 m) is 76.6 across: 32 to the
// meter, gravity 310; the shovel is 51 long, toppling about its foot as a rod does (3 g / 2 L = 9.1).
import { n2, n4, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect x=\"0\" y=\"145.3\" width=\"200\" height=\"54.7\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><g transform=\"translate(100 104) scale(1.4) translate(-100 -106)\"><polygon points=\"127.5,142.3 147.5,136.8 200,147 200,163.5\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"128,87.5 148.3,90 148.3,137 128,142.3\" fill=\"var(--art-bark,#7A4E2D)\"/><rect x=\"52\" y=\"87\" width=\"76.6\" height=\"55.3\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"52\" y=\"96.6\" width=\"76.6\" height=\"1.3\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"52\" y=\"105.6\" width=\"76.6\" height=\"1.3\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"52\" y=\"114.6\" width=\"76.6\" height=\"1.3\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"52\" y=\"123.6\" width=\"76.6\" height=\"1.3\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"52\" y=\"132.6\" width=\"76.6\" height=\"1.3\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"67.5\" y=\"92\" width=\"46\" height=\"50.3\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"68.6\" y=\"93.2\" width=\"21.4\" height=\"49.1\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"91\" y=\"93.2\" width=\"21.4\" height=\"49.1\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"85.4\" y=\"113.2\" width=\"10.2\" height=\"2.4\" rx=\"0.6\" fill=\"var(--art-steel-deep,#6B687A)\"/><polygon points=\"48.5,89.6 84.5,71.5 113.5,71.5 132.4,89.6\" fill=\"var(--art-ink-lit,#3A3460)\"/><polygon points=\"113,71.5 123.6,71.5 151.2,90.6 131.8,89.6\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"57.4,147.2 62.8,147.2 75,150.6 71,151.2\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"60.8,135.5 62.6,135.5 65.9,103.8 64.1,103.8\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M61.6,96.6H69L66.4,104.6H64.2ZM63.6,98.2H66.9L65.6,102.4H64.8Z\" fill-rule=\"evenodd\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"59.9,133 63.5,133 63.1,137.2 60.3,137.2\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M56.6,136.6H66.6V143Q66.6,147.4 61.6,147.8Q56.6,147.4 56.6,143Z\" fill=\"var(--art-steel,#A9B0BF)\"/></g></svg>\n";
export const STILL_HASH = "1c7388b450";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const IN = '<g transform="translate(100 104) scale(1.4) translate(-100 -106)">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 21 || !STILL.includes(EL[1] + IN) || !EL[16].includes("57.4,147.2 62.8,147.2 75,150.6") || !EL[20].includes("M56.6,136.6H66.6V143")) throw new Error("shed: the still isn't as this story knows it");
const OUTSIDE = EL[0] + EL[1], SHED = EL.slice(2, 16).join(""), SHADOW = EL[16], SHOVEL = EL.slice(17).join("");
const FOOT = [61.6, 147.6], LEAN0 = 6, DOWN = 86;
// ---- the topple: from its lean, about its foot, faster and faster, to lying on the ground
const T0 = 0.3, T_SLIP = 0.45;
const FALL = (() => { const S = []; let a = (LEAN0 * Math.PI) / 180, w = 0.25; const dt = 1 / 2000; while (a < (DOWN * Math.PI) / 180) { S.push(a); w += 9.1 * Math.sin(a) * dt; a += w * dt; } S.push((DOWN * Math.PI) / 180); return S; })();
const T_DOWN = T_SLIP + (FALL.length - 1) / 2000;
function turn(t) {
  // degrees past its lean in the still
  if (t <= T0) return 0;
  if (t <= T_SLIP) return 1.2 * track([[T0, 0], [T_SLIP, 1, "out"]], t);
  if (t <= T_DOWN) return Math.max(1.2, (FALL[Math.round((t - T_SLIP) * 2000)] * 180) / Math.PI - LEAN0);
  return DOWN - LEAN0 - track([[T_DOWN, 0], [T_DOWN + 0.06, 5, "out"], [T_DOWN + 0.13, 0, "in"], [T_DOWN + 0.18, 1, "out"], [T_DOWN + 0.23, 0, "in"]], t);
}

// ---- sad: on the ground
const SAD_DUR = T_DOWN + 0.55;
function sad(t) {
  if (t <= T0) return STILL;
  const a = turn(t), s = 1 - 0.8 * Math.min(1, a / (DOWN - LEAN0));
  const shadow = `<g transform="translate(${FOOT[0]} ${FOOT[1]}) scale(${n4(s)}) translate(${-FOOT[0]} ${-FOOT[1]})">${SHADOW}</g>`;
  return `${OPEN}${OUTSIDE}${IN}${SHED}${shadow}<g transform="rotate(${n2(a)} ${FOOT[0]} ${FOOT[1]})">${SHOVEL}</g></g></svg>`;
}

// ---- happy: caught on the latch
// The same slip: the shovel's foot gives and it topples to the right along the wall, faster and faster, until its shaft comes down on the doors'
// latch bar, which stands out from the doors: it knocks on the bar's corner (CAUGHT degrees from upright), bounces, and rests there, propped across
// the left door, its blade still on the ground.
const CAUGHT = 33.45, T_KNOCK = T_SLIP + (FALL.findIndex((a) => a >= (CAUGHT * Math.PI) / 180)) / 2000;
function propped(t) {
  if (t <= T_SLIP) return turn(t);
  if (t <= T_KNOCK) return turn(t);
  return CAUGHT - LEAN0 - track([[T_KNOCK, 0], [T_KNOCK + 0.05, 3, "out"], [T_KNOCK + 0.12, 0, "in"], [T_KNOCK + 0.16, 0.7, "out"], [T_KNOCK + 0.2, 0, "in"]], t);
}
const HAPPY_DUR = T_KNOCK + 0.8;
function happy(t) {
  if (t <= T0) return STILL;
  const a = propped(t), s = 1 - 0.8 * Math.min(1, a / (DOWN - LEAN0));
  const shadow = `<g transform="translate(${FOOT[0]} ${FOOT[1]}) scale(${n4(s)}) translate(${-FOOT[0]} ${-FOOT[1]})">${SHADOW}</g>`;
  return `${OPEN}${OUTSIDE}${IN}${SHED}${shadow}<g transform="rotate(${n2(a)} ${FOOT[0]} ${FOOT[1]})">${SHOVEL}</g></g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
