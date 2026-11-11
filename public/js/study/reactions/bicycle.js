// Bicycle's story. Happy, nearly: the stand's foot slips and the bicycle lurches over toward us, then the foot digs in and holds it, 14 degrees
// further over, still up. Sad: the bicycle leans on
// its kickstand toward us, and the stand's foot slips outward on the ground. Nothing holds it now: it tips over toward us, slowly, then faster, and
// comes down on its side with a clatter, a bounce, and lies there on the ground, held a little off it by its pedal and handlebar.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the ground, the bicycle's shadow, and the bicycle (seen from its
// side: its kickstand, its wheels with their spokes and rims, their feet on the ground at y 152, its pedals and chain, its frame, its saddle, its
// handlebars). We look down at the ground: a step toward us is 0.55 down the picture. The bicycle (1.7 m) is 150 long: 88 to the meter,
// gravity 870; its weight about 50 up.
import { n2, n4, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect y=\"140\" width=\"200\" height=\"60\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M53 151.5L147 151.5L200 168L200 200L170 200Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M105.2 129.2L111.2 121.2L113 122.6L107 130.6Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><rect x=\"108\" y=\"120.6\" width=\"8\" height=\"2.6\" rx=\"1.2\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M159.9 133.3L160.1 132.4L124.2 122.7L123.9 123.6ZM154.8 141.5L155.5 140.8L129.2 114.5L128.5 115.2ZM146.4 146.1L147.3 145.9L137.6 109.9L136.7 110.2ZM136.7 145.9L137.6 146.1L147.3 110.2L146.4 109.9ZM128.5 140.8L129.2 141.5L155.5 115.2L154.8 114.5ZM123.9 132.4L124.2 133.3L160.1 123.6L159.9 122.7Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M121.8 128a20.2 20.2 0 1 0 40.4 0a20.2 20.2 0 1 0-40.4 0ZM124 128a18 18 0 1 0 36 0a18 18 0 1 0-36 0Z\" fill-rule=\"evenodd\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M118 128a24 24 0 1 0 48 0a24 24 0 1 0-48 0ZM122.3 128a19.7 19.7 0 1 0 39.4 0a19.7 19.7 0 1 0-39.4 0Z\" fill-rule=\"evenodd\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M75.9 133.3L76.1 132.4L40.2 122.7L39.9 123.6ZM70.8 141.5L71.5 140.8L45.2 114.5L44.5 115.2ZM62.4 146.1L63.3 145.9L53.6 109.9L52.7 110.2ZM52.7 145.9L53.6 146.1L63.3 110.2L62.4 109.9ZM44.5 140.8L45.2 141.5L71.5 115.2L70.8 114.5ZM39.9 132.4L40.2 133.3L76.1 123.6L75.9 122.7Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M37.8 128a20.2 20.2 0 1 0 40.4 0a20.2 20.2 0 1 0-40.4 0ZM40 128a18 18 0 1 0 36 0a18 18 0 1 0-36 0Z\" fill-rule=\"evenodd\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M34 128a24 24 0 1 0 48 0a24 24 0 1 0-48 0ZM38.3 128a19.7 19.7 0 1 0 39.4 0a19.7 19.7 0 1 0-39.4 0Z\" fill-rule=\"evenodd\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M113.2 131.2L109.2 152.2L106.8 151.8L110.8 130.8Z\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"104.6\" y=\"150.8\" width=\"7\" height=\"1.7\" rx=\"0.8\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"106\" cy=\"130\" r=\"5.6\" fill=\"var(--art-ink-lit,#3A3460)\"/><circle cx=\"142\" cy=\"128\" r=\"3.6\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M106 124L142 124.2L142 125.2L106 125ZM106 135L142 130.8L142 131.8L106 136Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M121.3 90.5L125.5 78.5L122.9 77.5L118.7 89.5Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M111 77.6Q111.4 75.6 116 75.4L128 74.4Q134.5 74 135 77.6Q135.3 80.8 130.5 81.2Q124 81.6 118.5 80.2Q111 79.4 111 77.6Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M131 74.5Q134.6 74.8 135 77.6Q135.3 80.8 130.5 81.2L128.5 81.3Q132 78 131 74.5Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M74.6 96.8L59.6 128.8L56.4 127.2L71.4 95.2Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M78 78.5L81 69L84 70L81 79.5Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M66.5 62.5L72 62.5Q74 62.5 75.5 65Q77.5 68 82 68Q87 68 89 65Q90.5 62.5 93 62.5L98 62.5A1.8 1.8 0 0 1 98 66.1L93.5 66.1Q92.5 66.1 91.8 67.6Q89 71.7 82 71.7Q75 71.7 72.4 67.6Q71.6 66.1 70.5 66.1L66.5 66.1A1.8 1.8 0 0 1 66.5 62.5Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M120.3 92.2L143.3 127.2L140.7 128.8L117.7 93.8Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M106 128.4L142 126.4L142 129.6L106 131.6Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M107.9 130.7L121.9 90.7L118.1 89.3L104.1 129.3Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M78.3 83L120.3 90L119.7 94L77.7 87Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M76.7 90.6L107.7 128.6L104.3 131.4L73.3 93.4Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M82.4 80.1L74.4 98.1L69.6 95.9L77.6 77.9Z\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"142\" cy=\"128\" r=\"2.6\" fill=\"var(--art-ink-lit,#3A3460)\"/><circle cx=\"58\" cy=\"128\" r=\"2.8\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M107 130.8L101 138.8L99 137.2L105 129.2Z\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"95\" y=\"137\" width=\"10\" height=\"3\" rx=\"1.3\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"106\" cy=\"130\" r=\"2\" fill=\"var(--art-ink,#231F3B)\"/></svg>\n";
export const STILL_HASH = "dfa5a1a3be";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 33 || !EL[2].includes("M53 151.5L147 151.5L200 168") || !EL[11].includes("M113.2 131.2L109.2 152.2")) throw new Error("bicycle: the still isn't as this story knows it");
const WALL = EL[0] + EL[1], SHADOW = EL[2], BIKE = EL.slice(3).join("");
const GROUND = 152, TOWARD = 0.55, DOWN = 78;
// tipped over toward us by a degrees about the line its wheels stand on: a point h up goes h cos(a) up and h sin(a) toward us
const tipped = (a) => { const r = (a * Math.PI) / 180, d = Math.cos(r) - TOWARD * Math.sin(r); return `matrix(1 0 0 ${n4(d)} 0 ${n4(GROUND * (1 - d))})`; };
// ---- the fall: an upright body tipping about its foot (g / h = 17.4), from the stand's slip to its side on the ground
const T0 = 0.3, T_SLIP = 0.45;
const FALL = (() => { const S = []; let a = 0.02, w = 0.35; const dt = 1 / 2000; while (a < (DOWN * Math.PI) / 180) { S.push(a); w += 17.4 * Math.sin(a) * dt; a += w * dt; } S.push((DOWN * Math.PI) / 180); return S; })();
const T_DOWN = T_SLIP + (FALL.length - 1) / 2000;
function tip(t) {
  if (t <= T0) return 0;
  // (the stand's foot slips: a lurch toward us, caught for a moment; then over it goes)
  if (t <= T_SLIP) return 1.2 * track([[T0, 0], [T_SLIP, 1, "out"]], t);
  if (t <= T_DOWN) return Math.max(1.2, (FALL[Math.round((t - T_SLIP) * 2000)] * 180) / Math.PI);
  return DOWN - track([[T_DOWN, 0], [T_DOWN + 0.07, 6, "out"], [T_DOWN + 0.16, 0, "in"], [T_DOWN + 0.22, 1.2, "out"], [T_DOWN + 0.28, 0, "in"]], t);
}

// ---- sad: down on its side
const SAD_DUR = T_DOWN + 0.65;
function sad(t) {
  if (t <= T0) return STILL;
  const a = tip(t), tf = tipped(a);
  // its shadow draws in under it as it comes down
  const s = 1 - 0.85 * Math.min(1, a / DOWN);
  const shadow = `<g transform="translate(0 ${GROUND - 0.5}) scale(1 ${n4(s)}) translate(0 ${-(GROUND - 0.5)})">${SHADOW}</g>`;
  return `${OPEN}${WALL}${shadow}<g transform="${tf}">${BIKE}</g></svg>`;
}

// ---- happy: the stand bites
// The same slip: the stand's foot slides outward on the ground and the bicycle lurches over toward us; then the foot digs into a rough patch and holds,
// the bicycle stopping 14 degrees further over with a jolt, rocking back a little, and standing there, leaning more, but up.
const CAUGHT = 14, T_BITE = 0.78;
function held(t) {
  if (t <= T0) return 0;
  if (t <= T_SLIP) return 1.2 * track([[T0, 0], [T_SLIP, 1, "out"]], t);
  if (t <= T_BITE) return 1.2 + (CAUGHT - 1.2) * track([[T_SLIP, 0], [T_BITE, 1, "in"]], t);
  return CAUGHT - track([[T_BITE, 0], [T_BITE + 0.07, 2.6, "out"], [T_BITE + 0.18, -0.6, "io"], [T_BITE + 0.28, 0.3, "io"], [T_BITE + 0.36, 0, "io"]], t);
}
const HAPPY_DUR = T_BITE + 0.36 + 0.6;
function happy(t) {
  if (t <= T0) return STILL;
  const a = held(t), s = 1 - 0.85 * Math.min(1, a / DOWN);
  const shadow = `<g transform="translate(0 ${GROUND - 0.5}) scale(1 ${n4(s)}) translate(0 ${-(GROUND - 0.5)})">${SHADOW}</g>`;
  return `${OPEN}${WALL}${shadow}<g transform="${tipped(a)}">${BIKE}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
