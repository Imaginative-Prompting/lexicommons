// Captain's two stories, the cap's: it's perched on the wheel's round top knob, and a cap can't stay put on a knob; it slips. Happy: it tips to the right
// and its brim comes down on the wheel's rim: it rests there, at a rakish tilt, as a captain wears it. Sad: it tips past that, slides off the knob and
// tumbles down past the wheel to the deck, landing upside down.
// Every frame is a pure function of t, in seconds. The still's own parts: the sea-green wall, the deck, the stand's shadow, the stand and its base, the
// wheel (its shade behind, then its lit wood: rim about (100, 106), r 44, eight spokes and handles), and the cap on its top knob (band, crown, gold
// stripe, peak), its middle about (100, 55). A meter (the wheel's span) is 88 here.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"150\" width=\"200\" height=\"50\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M62 189L144 187L144 180L172 186L160 194L72 194Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M94 104L106 104L111 184L89 184Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M101 104L106 104L111 184L102 184Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><rect x=\"62\" y=\"180.5\" width=\"80\" height=\"9\" rx=\"2\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"60\" y=\"178\" width=\"80\" height=\"9\" rx=\"2\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"104.6,66.5 105.4,48.5 98.6,48.5 99.4,66.5\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"144,111.1 162,111.9 162,105.1 144,105.9\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"99.4,150.5 98.6,168.5 105.4,168.5 104.6,150.5\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"60,105.9 42,105.1 42,111.9 60,111.1\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"133.5,80.6 146.8,68.5 142,63.7 129.9,77\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"129.9,140 142,153.3 146.8,148.5 133.5,136.4\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"70.5,136.4 57.2,148.5 62,153.3 74.1,140\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"74.1,77 62,63.7 57.2,68.5 70.5,80.6\" fill=\"var(--art-wood-deep,#B97F45)\"/><circle cx=\"102\" cy=\"45.5\" r=\"5\" fill=\"var(--art-wood-deep,#B97F45)\"/><circle cx=\"146.5\" cy=\"64\" r=\"5\" fill=\"var(--art-wood-deep,#B97F45)\"/><circle cx=\"165\" cy=\"108.5\" r=\"5\" fill=\"var(--art-wood-deep,#B97F45)\"/><circle cx=\"146.5\" cy=\"153\" r=\"5\" fill=\"var(--art-wood-deep,#B97F45)\"/><circle cx=\"102\" cy=\"171.5\" r=\"5\" fill=\"var(--art-wood-deep,#B97F45)\"/><circle cx=\"57.5\" cy=\"153\" r=\"5\" fill=\"var(--art-wood-deep,#B97F45)\"/><circle cx=\"39\" cy=\"108.5\" r=\"5\" fill=\"var(--art-wood-deep,#B97F45)\"/><circle cx=\"57.5\" cy=\"64\" r=\"5\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"99.8\" y=\"68.5\" width=\"4.4\" height=\"80\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"62\" y=\"106.3\" width=\"80\" height=\"4.4\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"131.9,81.8 128.7,78.6 72.1,135.2 75.3,138.4\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"128.7,138.4 131.9,135.2 75.3,78.6 72.1,81.8\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M58 108.5a44 44 0 1 0 88 0a44 44 0 1 0-88 0ZM67 108.5a35 35 0 1 0 70 0a35 35 0 1 0-70 0Z\" fill-rule=\"evenodd\" fill=\"var(--art-wood-deep,#B97F45)\"/><circle cx=\"102\" cy=\"108.5\" r=\"11\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"102.6,64 103.4,46 96.6,46 97.4,64\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"142,108.6 160,109.4 160,102.6 142,103.4\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"97.4,148 96.6,166 103.4,166 102.6,148\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"58,103.4 40,102.6 40,109.4 58,108.6\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"131.5,78.1 144.8,66 140,61.2 127.9,74.5\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"127.9,137.5 140,150.8 144.8,146 131.5,133.9\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"68.5,133.9 55.2,146 60,150.8 72.1,137.5\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"72.1,74.5 60,61.2 55.2,66 68.5,78.1\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"100\" cy=\"43\" r=\"5\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"144.5\" cy=\"61.5\" r=\"5\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"163\" cy=\"106\" r=\"5\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"144.5\" cy=\"150.5\" r=\"5\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"100\" cy=\"169\" r=\"5\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"55.5\" cy=\"150.5\" r=\"5\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"37\" cy=\"106\" r=\"5\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"55.5\" cy=\"61.5\" r=\"5\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"97.8\" y=\"66\" width=\"4.4\" height=\"80\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"60\" y=\"103.8\" width=\"80\" height=\"4.4\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"129.9,79.3 126.7,76.1 70.1,132.7 73.3,135.9\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"126.7,135.9 129.9,132.7 73.3,76.1 70.1,79.3\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M56 106a44 44 0 1 0 88 0a44 44 0 1 0-88 0ZM65 106a35 35 0 1 0 70 0a35 35 0 1 0-70 0Z\" fill-rule=\"evenodd\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"100\" cy=\"106\" r=\"11\" fill=\"var(--art-wood,#DCA063)\"/><circle cx=\"100\" cy=\"106\" r=\"4\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M72 46L128 46L127 60Q100 67 73 60Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M119 46L128 46L127 60Q123 61 118.5 61.9Z\" fill=\"var(--art-ink,#231F3B)\"/><ellipse cx=\"100\" cy=\"42\" rx=\"38\" ry=\"11\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><ellipse cx=\"97\" cy=\"40.6\" rx=\"35\" ry=\"9.6\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M75 56Q100 63 125 56L125.3 58.6Q100 65.6 74.7 58.6Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M73 59Q100 67 127 59Q131 66 124 70Q100 78 76 70Q69 66 73 59Z\" fill=\"var(--art-ink,#231F3B)\"/></svg>\n";
export const STILL_HASH = "a4eac5470a";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 58 || !EL[57].includes("M73 59Q100 67 127 59")) throw new Error("captain: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const SCENE = EL.slice(0, 52).join(""), CAP = EL.slice(52).join("");
const MID = [100, 55], G = 863;
const cap = (dx, dy, a) => `<g transform="translate(${n2(dx)} ${n2(dy)}) rotate(${n2(a)} ${MID[0]} ${MID[1]})">${CAP}</g>`;
// the slip both start with: from rest, it rolls a little off the knob's crown to the right
const slip = (t) => ({ a: track([[0.3, 0], [0.7, 8, "in"]], t), dx: track([[0.3, 0], [0.7, 2, "in"]], t) });

// ---- happy: at a tilt
const HAPPY_DUR = 2.2;
function happy(t) {
  if (t <= 0) return STILL;
  // it tips on, its right brim dropping onto the rim; it lands there, gives a little, and rests
  let { a, dx } = slip(t), dy = 0;
  if (t > 0.7) {
    a = track([[0.7, 8], [0.92, 27, "in"], [1.02, 23.5, "out"], [1.14, 25.5, "io"], [1.24, 25, "io"]], t);
    dx = track([[0.7, 2], [0.92, 9, "in"], [1.24, 9.4, "io"]], t);
    dy = track([[0.7, 0], [0.92, 6, "in"], [1.02, 5.2, "out"], [1.24, 5.6, "io"]], t);
  }
  return `${OPEN}${SCENE}${cap(dx, dy, a)}</svg>`;
}

// ---- sad: down onto the deck
const SAD_DUR = 2.4, T_OFF = 0.86, LAND = [55, 117];
function sad(t) {
  if (t <= 0) return STILL;
  let { a, dx } = slip(t), dy = 0, shadow = "";
  if (t > 0.7) {
    // past the rim: it slides off the knob, clear of the wheel, and falls, turning over, onto the deck
    const tf = Math.sqrt((2 * (LAND[1] - 12)) / G);
    if (t <= T_OFF) { const k = (t - 0.7) / (T_OFF - 0.7); a = 8 + 34 * k * k; dx = 2 + 16 * k * k; dy = 12 * k * k; }
    else if (t <= T_OFF + tf) { const s = t - T_OFF, k = s / tf; a = 42 + 128 * k; dx = 18 + (LAND[0] - 18) * k; dy = 12 + 0.5 * G * s * s; }
    else { const r = t - T_OFF - tf; a = 170 + track([[0, 0], [0.1, 9, "out"], [0.22, 5, "io"], [0.32, 7, "io"]], r); dx = LAND[0]; dy = LAND[1] - track([[0, 0], [0.06, 2.5, "out"], [0.12, 0, "in"]], r); }
    // (its shadow on the deck as it comes down near it)
    const h = 177 - (MID[1] + dy), o = Math.max(0, 1 - h / 80);
    if (o > 0.01) shadow = `<ellipse cx="${n2(MID[0] + dx + 6)}" cy="194" rx="${n2(30 * (0.6 + 0.4 * o))}" ry="3.6" ${fill("teal")}${o < 1 ? ` opacity="${n2(o)}"` : ""}/>`;
  }
  return `${OPEN}${SCENE}${shadow}${cap(dx, dy, a)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
