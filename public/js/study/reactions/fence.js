// Fence's story. Happy, nearly: the middle picket's rusted top nail gives and it leans over sideways on its bottom nail until it knocks against the
// next picket, and stays there, leaning, still in the row. Sad: the middle picket's
// top nail has rusted through. It gives: the picket's head leans out a hair, then the picket tips forward, slowly, then faster, hinging on the
// bottom rail's lower edge (its foot swinging back under the rail), until its point comes down on the ground in front with a knock: a gap in the row
// of points, one picket lying out across the grass.
// Every frame is a pure function of t, in seconds. The still's own parts: the grass behind, the ground, the shadow, the two rails (their tops and
// fronts, the top at 107-116.5, the bottom at 137-146.5) and the pickets' shadows on them, five pickets (each its point, its side and its front,
// from 91.5 down to 161: the middle one 90.4-103.4 across), and the two posts. Depth here: a step toward us is 0.38 left and 0.39 down. The picket
// (1 m) is 69.5 long: 70 to the meter, gravity 690; above its hinge 55, below it 14.5.
import { n2, n4, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"154\" width=\"200\" height=\"46\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"34,164.5 160,164 200,178.5 200,200 125,200\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"44,108.5 46,107 149,107 147,108.5\" fill=\"var(--art-clay-lit,#F6A06F)\"/><rect x=\"44\" y=\"108.4\" width=\"103\" height=\"8.1\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"44,138.5 46,137 149,137 147,138.5\" fill=\"var(--art-clay-lit,#F6A06F)\"/><rect x=\"44\" y=\"138.4\" width=\"103\" height=\"8.1\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"64.8\" y=\"108.4\" width=\"2.2\" height=\"8.1\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"64.8\" y=\"138.4\" width=\"2.2\" height=\"8.1\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"84\" y=\"108.4\" width=\"2.2\" height=\"8.1\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"84\" y=\"138.4\" width=\"2.2\" height=\"8.1\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"103.2\" y=\"108.4\" width=\"2.2\" height=\"8.1\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"103.2\" y=\"138.4\" width=\"2.2\" height=\"8.1\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"122.4\" y=\"108.4\" width=\"2.2\" height=\"8.1\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"122.4\" y=\"138.4\" width=\"2.2\" height=\"8.1\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"141.6\" y=\"108.4\" width=\"2.2\" height=\"8.1\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"141.6\" y=\"138.4\" width=\"2.2\" height=\"8.1\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"52,101 57.5,93 59.5,91.5 54,99.5\" fill=\"var(--art-clay-lit,#F6A06F)\"/><polygon points=\"57.3,93 59.5,91.5 65,99.5 65,159.5 63,161 62.8,101\" fill=\"var(--art-bark,#7A4E2D)\"/><polygon points=\"52,101 57.5,93 63,101 63,161 52,161\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"71.2,101 76.7,93 78.7,91.5 73.2,99.5\" fill=\"var(--art-clay-lit,#F6A06F)\"/><polygon points=\"76.5,93 78.7,91.5 84.2,99.5 84.2,159.5 82.2,161 82,101\" fill=\"var(--art-bark,#7A4E2D)\"/><polygon points=\"71.2,101 76.7,93 82.2,101 82.2,161 71.2,161\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"90.4,101 95.9,93 97.9,91.5 92.4,99.5\" fill=\"var(--art-clay-lit,#F6A06F)\"/><polygon points=\"95.7,93 97.9,91.5 103.4,99.5 103.4,159.5 101.4,161 101.2,101\" fill=\"var(--art-bark,#7A4E2D)\"/><polygon points=\"90.4,101 95.9,93 101.4,101 101.4,161 90.4,161\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"109.6,101 115.1,93 117.1,91.5 111.6,99.5\" fill=\"var(--art-clay-lit,#F6A06F)\"/><polygon points=\"114.9,93 117.1,91.5 122.6,99.5 122.6,159.5 120.6,161 120.4,101\" fill=\"var(--art-bark,#7A4E2D)\"/><polygon points=\"109.6,101 115.1,93 120.6,101 120.6,161 109.6,161\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"128.8,101 134.3,93 136.3,91.5 130.8,99.5\" fill=\"var(--art-clay-lit,#F6A06F)\"/><polygon points=\"134.1,93 136.3,91.5 141.8,99.5 141.8,159.5 139.8,161 139.6,101\" fill=\"var(--art-bark,#7A4E2D)\"/><polygon points=\"128.8,101 134.3,93 139.8,101 139.8,161 128.8,161\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"43.3,97.6 48.2,93.1 48.2,161.5 43.6,165.2 43.3,165.2\" fill=\"var(--art-bark,#7A4E2D)\"/><polygon points=\"31.6,97.8 36.2,93.1 48.2,93.1 43.6,97.8\" fill=\"var(--art-clay-lit,#F6A06F)\"/><rect x=\"31.6\" y=\"97.6\" width=\"12\" height=\"67.6\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"157.2,97.6 162.1,93.1 162.1,161.5 157.5,165.2 157.2,165.2\" fill=\"var(--art-bark,#7A4E2D)\"/><polygon points=\"145.5,97.8 150.1,93.1 162.1,93.1 157.5,97.8\" fill=\"var(--art-clay-lit,#F6A06F)\"/><rect x=\"145.5\" y=\"97.6\" width=\"12\" height=\"67.6\" fill=\"var(--art-wood,#DCA063)\"/></svg>\n";
export const STILL_HASH = "0c9b281589";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 38 || !EL[25].includes("90.4,101 95.9,93 101.4,101") || !EL[11].includes('x="103.2" y="108.4"')) throw new Error("fence: the still isn't as this story knows it");
const BACK = EL.slice(0, 3).join(""), RAILS = EL.slice(3, 7).join(""), SHADOWS_OTHER = [7, 8, 9, 10, 13, 14, 15, 16].map((i) => EL[i]).join("");
const PICKETS_LEFT = EL.slice(17, 23).join(""), PICKET = EL[23] + EL[24] + EL[25], PICKETS_RIGHT = EL.slice(26, 32).join(""), POSTS = EL.slice(32).join("");
const HINGE = 146.5, TOWARD = [-0.38, 0.39];
// the picket tipped forward by a (degrees) about the hinge line: a point h above it goes h cos(a) up and h sin(a) toward us
const tipped = (a) => { const r = (a * Math.PI) / 180, s = Math.sin(r), c = Math.cos(r); return `matrix(1 0 ${n4(-TOWARD[0] * s)} ${n4(c - TOWARD[1] * s)} ${n4(TOWARD[0] * s * HINGE)} ${n4(HINGE * (1 - c + TOWARD[1] * s))})`; };
// ---- the fall: a rod hinged near its foot, its weight 20.3 above the hinge (g d / k^2 = 17.2), from the nail's give to its point on the ground
const DOWN = (Math.acos(-14.5 / 55) * 180) / Math.PI;
const T0 = 0.3, T_GIVE = 0.42, FALL = (() => { const S = []; let a = 0.035, w = 0.15; const dt = 1 / 2000; while (a < (DOWN * Math.PI) / 180) { S.push(a); w += 17.2 * Math.sin(a) * dt; a += w * dt; } S.push((DOWN * Math.PI) / 180); return S; })();
const T_DOWN = T_GIVE + (FALL.length - 1) / 2000;
function tip(t) {
  if (t <= T0) return 0;
  if (t <= T_GIVE) return 2 * track([[T0, 0], [T_GIVE, 1, "out"]], t);
  if (t <= T_DOWN) { const a = (FALL[Math.round((t - T_GIVE) * 2000)] * 180) / Math.PI; return Math.max(2, a); }
  return DOWN - track([[T_DOWN, 0], [T_DOWN + 0.06, 5, "out"], [T_DOWN + 0.14, 0, "in"], [T_DOWN + 0.19, 1, "out"], [T_DOWN + 0.24, 0, "in"]], t);
}

// ---- sad: down
const SAD_DUR = T_DOWN + 0.6;
function sad(t) {
  if (t <= T0) return STILL;
  const a = tip(t), tf = tipped(a), gone = Math.min(1, a / 30);
  // (above the hinge it swings out in front of the fence; its foot swings back under the bottom rail, behind it)
  const above = `<clipPath id="fa"><path d="M0 0H200V${HINGE}H0Z"/></clipPath><g clip-path="url(#fa)"><g transform="${tf}">${PICKET}</g></g>`;
  const below = `<clipPath id="fb"><path d="M0 ${HINGE}H200V200H0Z"/></clipPath><g clip-path="url(#fb)"><g transform="${tf}">${PICKET}</g></g>`;
  // its shadows on the rails go as it leaves them
  const shade = gone < 0.999 ? `<g transform="translate(103.2 0) scale(${n4(1 - gone)} 1) translate(-103.2 0)">${EL[11]}${EL[12]}</g>` : "";
  return `${OPEN}${BACK}${below}${RAILS}${SHADOWS_OTHER}${shade}${PICKETS_LEFT}${PICKETS_RIGHT}${POSTS}${above}</svg>`;
}

// ---- happy: caught by its neighbor
// The same rusted top nail gives, but this time the picket leans the other way: sideways, in the fence's line, turning on its bottom nail (96.9,
// 142.5) as a stick stood on end does, slowly, then faster, until its upper corner knocks against the next picket's edge (8.7 degrees over); it
// bounces, settles, and leans there, held, still in the row. Its shadows on the rails lean with it.
const NAIL = [96.9, 142.5], CAUGHT = 8.7;
const LEAN_T = (() => { const S = []; let a = 0.006, w = 0; const dt = 1 / 2000; while (a < (CAUGHT * Math.PI) / 180) { S.push(a); w += 16.6 * Math.sin(a) * dt; a += w * dt; } S.push((CAUGHT * Math.PI) / 180); return S; })();
const T_KNOCK = T_GIVE + (LEAN_T.length - 1) / 2000;
function leanAt(t) {
  if (t <= T_GIVE) return 0.35 * track([[T0, 0], [T_GIVE, 1, "out"]], t);
  if (t <= T_KNOCK) return Math.max(0.35, (LEAN_T[Math.round((t - T_GIVE) * 2000)] * 180) / Math.PI);
  return CAUGHT - track([[T_KNOCK, 0], [T_KNOCK + 0.05, 1.6, "out"], [T_KNOCK + 0.12, 0, "in"], [T_KNOCK + 0.16, 0.4, "out"], [T_KNOCK + 0.2, 0, "in"]], t);
}
const HAPPY_DUR = T_KNOCK + 0.7;
function happy(t) {
  if (t <= T0) return STILL;
  const r = `rotate(${n2(-leanAt(t))} ${NAIL[0]} ${NAIL[1]})`;
  return `${OPEN}${BACK}${RAILS}${SHADOWS_OTHER}<g transform="${r}">${EL[11]}${EL[12]}</g>${PICKETS_LEFT}<g transform="${r}">${PICKET}</g>${PICKETS_RIGHT}${POSTS}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
