// Hole's two stories, the dug soil's: the heap is loose, and its right shoulder slumps toward the hole, carrying the spade's buried blade with it, so the
// spade goes over. Happy: its blade's foot slides far enough that it lands right across the hole, its grip on the far side: a bridge. Sad: it slides less,
// the grip falls short of the far rim and drops into the hole, and the whole spade slides down after it, out of sight; a clod follows it in.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky, the ground (from y 117), the long shadow, the hole (its rim, and its
// dark mouth, x 105-189.5, y 125-151), the spade (grip, shaft, neck and blade, the blade's foot buried in the heap at about (52, 128)), the heap (lit and
// shaded), two crumbs. The spade is 114 long; a meter (its length) is 114 here.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect y=\"117\" width=\"200\" height=\"83\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M40 156C60 148 92 149 106 155L200 183L200 198L95 168C88 166 84 162 80 160C60 160 42 159 40 156Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M105 138.5C105 131 125 125.3 148 125.3C170 125.3 189.5 131 189.5 137.8C189.5 145 169 150.8 146 150.8C124 150.8 105 146 105 138.5Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M105 138.5C108 134 126 131.5 147 131.5C168 131.5 186.5 134 189.5 137.8C189.5 145 169 150.8 146 150.8C124 150.8 105 146 105 138.5Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M36 19L68 19Q71 19 71 22C71 32 64 39 56 43L56 46L48 46L48 43C40 39 33 32 33 22Q33 19 36 19ZM38.5 24.5L65.5 24.5C64.5 32 59 38 52 38C45 38 39.5 32 38.5 24.5Z\" fill-rule=\"evenodd\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M63 19L68 19Q71 19 71 22C71 32 64 39 56 43L56 46L53.5 46L53.5 38L52 38C59 38 64.5 32 65.5 24.5L63 24.5Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"48\" y=\"44\" width=\"8\" height=\"52\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"53.5\" y=\"43\" width=\"2.5\" height=\"53\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M47 95L48 85L56 85L57 95Z\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M53.5 85L56 85L57 95L53.5 95Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M38 98C38 95.5 40 94.5 43 94L61 94C64 94.5 66 95.5 66 98L65 113C63.5 122 59 129 52 133C45 129 40.5 122 39 113Z\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M53.5 94L61 94C64 94.5 66 95.5 66 98L65 113C63.5 122 59 129 52 133L53.5 133Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M5 158C4 151 8 145 15 144C16 137 22 132 29 132C29 123 34 117.5 41 117.5C45 114.5 59 114.5 63 117.5C70 116.5 77 121 77 128C84 128 90 133 91 140C97 141 101 146 100 152C102 154 102 157 99 158.5C80 161 26 161 5 158Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M64 117.4C70 116.5 77 121 77 128C84 128 90 133 91 140C97 141 101 146 100 152C102 154 102 157 99 158.5L82 159.6C84 148 79 130 64 117.4Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><ellipse cx=\"106.5\" cy=\"152.5\" rx=\"1.9\" ry=\"1.3\" fill=\"var(--art-bark,#7A4E2D)\"/><ellipse cx=\"113\" cy=\"154.5\" rx=\"1.2\" ry=\"0.8\" fill=\"var(--art-bark,#7A4E2D)\"/></svg>\n";
export const STILL_HASH = "471aa61ecb";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 17 || !EL[4].includes("M105 138.5C108 134")) throw new Error("hole: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const GROUND = EL.slice(0, 2).join(""), SHADOW = EL[2], HOLE = EL[3] + EL[4], SPADE = EL.slice(5, 13).join(""), HEAP = EL[13] + EL[14], CRUMBS = EL[15] + EL[16];
const FOOT = [52, 128], G = 1120;
// the long shadow is mostly the standing spade's: as it goes over, the shadow draws back to the heap's own
const shadow = (a) => { const k = 1 - 0.62 * Math.min(1, Math.max(0, a) / 90); return k > 0.999 ? SHADOW : `<g transform="translate(80 160) scale(${n4(k)}) translate(-80 -160)">${SHADOW}</g>`; };
// the spade turned a (degrees, clockwise: over to the right) about its foot, the foot moved to f
const spade = (a, f) => `<g transform="translate(${n2(f[0] - FOOT[0])} ${n2(f[1] - FOOT[1])}) rotate(${n2(a)} ${FOOT[0]} ${FOOT[1]})">${SPADE}</g>`;
// the heap with its right shoulder slumped k: lower on the right, its toe spread out toward the hole
function heap(k) {
  if (k < 0.004) return HEAP;
  const tr = `translate(5 159) scale(${n4(1 + 0.06 * k)} ${n4(1 - 0.16 * k)}) translate(-5 -159)`;
  const toe = `<path d="M${n2(80 + 2 * k)} 159.6C${n2(86 + 6 * k)} ${n2(156 - 4 * k)} ${n2(96 + 8 * k)} ${n2(155 - 2 * k)} ${n2(102 + 10 * k)} ${n2(157.6 - k)}C${n2(104 + 10 * k)} 159.4 ${n2(98 + 6 * k)} 161 ${n2(88 + 3 * k)} 161Z" ${fill("bark")}/>`;
  // (the toe grows out of the heap's foot as the soil slides)
  return `<g transform="${tr}">${HEAP}</g><g transform="translate(80 160) scale(${n4(Math.min(1, k * 1.6))}) translate(-80 -160)">${toe}</g>`;
}
// the slump both start with: the shoulder settling, the spade's foot riding it a little toward the hole
const slump = (t) => track([[0.3, 0], [0.75, 0.7, "in"], [1.1, 1, "out"]], t);
// the topple: from a lean, gathering speed (gravity at the spade's meter), to the ground (90) or over the hole's edge (more)
const tip = (t, end, t0 = 0.6) => { const s = Math.max(0, t - t0), a = 4 + 0.5 * (G / 114) * 57.3 * s * s; return Math.min(end, a); };
const T_LAND = 0.6 + Math.sqrt(((86 / 57.3) * 2 * 114) / G);

// ---- happy: it bridges the hole
const HAPPY_DUR = 2.4, BRIDGE = [78, 141];
function happy(t) {
  if (t <= 0) return STILL;
  const k = slump(t), a = track([[0.3, 0], [0.6, 4, "in"]], t) + (t > 0.6 ? tip(t, 90) - 4 : 0);
  // (it lands on both rims, bounces a hair at its grip end, and lies there)
  const bounce = t > T_LAND ? track([[T_LAND, 0], [T_LAND + 0.06, -3, "out"], [T_LAND + 0.14, 0, "in"], [T_LAND + 0.2, -0.8, "out"], [T_LAND + 0.26, 0, "in"]], t) : 0;
  const f = [FOOT[0] + (BRIDGE[0] - FOOT[0]) * k, FOOT[1] + (BRIDGE[1] - FOOT[1]) * k];
  return `${OPEN}${GROUND}${shadow(a)}${HOLE}${spade(a + bounce, f)}${heap(k)}${CRUMBS}</svg>`;
}

// ---- sad: it goes in
const SAD_DUR = 2.6, SHORT = [70, 140];
// (down the hole: what has gone below the hole's front edge, inside its span, is underground: hidden; nothing else is cut, so the spade lying across
// the mouth shows whole)
const MOUTH = '<clipPath id="mo"><path d="M-10-10H210V210H189.5V137.8C189.5 145 169 150.8 146 150.8C124 150.8 105 146 105 138.5V210H-10Z"/></clipPath>';
const PIVOT = [105, 140];
function sad(t) {
  if (t <= 0) return STILL;
  const k = slump(t);
  let a = track([[0.3, 0], [0.6, 4, "in"]], t) + (t > 0.6 ? tip(t, 90) - 4 : 0), f = [FOOT[0] + (SHORT[0] - FOOT[0]) * k, FOOT[1] + (SHORT[1] - FOOT[1]) * k];
  let clod = "";
  if (t > T_LAND) {
    // its grip end, short of the far rim, goes on down into the hole: the spade pivots on the near rim, steeply, then slides in along its length
    const r = t - T_LAND, turn = track([[0, 0], [0.22, 75, "in"]], r), d = track([[0.2, 0], [0.62, 72, "in"]], r);
    const c = Math.cos((turn * Math.PI) / 180), sn = Math.sin((turn * Math.PI) / 180), v = [SHORT[0] - PIVOT[0], SHORT[1] - PIVOT[1]];
    a = 90 + turn;
    const ar = (a * Math.PI) / 180, u = [Math.sin(ar), -Math.cos(ar)];
    f = [PIVOT[0] + v[0] * c - v[1] * sn + d * u[0], PIVOT[1] + v[0] * sn + v[1] * c + d * u[1]];
    // (a loosened clod from the heap's toe tumbles in after it)
    const q = track([[0.5, 0], [0.85, 1, "in"]], r);
    if (q > 0.004 && q < 1) clod = `<ellipse cx="${n2(104 + 18 * q)}" cy="${n2(152 - 10 * Math.sin(Math.PI * q) + 6 * q)}" rx="3" ry="2.2" ${fill("bark")}/>`;
  }
  return `${OPEN}${GROUND}${shadow(Math.min(a, 90))}${HOLE}${MOUTH}<g clip-path="url(#mo)">${spade(a, f)}${clod}</g>${heap(k)}${CRUMBS}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
