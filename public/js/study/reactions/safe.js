// Safe's two stories, the rain's and the umbrella's own. The rain falls on, slanting down to the left. Happy: it comes down harder; the
// ground darkens wet and puddles gather, all but the dry patch under the umbrella, where the flower stands dry. Sad: a gust from the right
// leans the umbrella and gets under the canopy, and it turns inside out; the rain comes down on the flower, beats it over, and knocks a
// petal off.
// Every frame is a pure function of t, in seconds. The still's own parts: the rain (one streak, many times), the ground, the umbrella
// (its pole, tip, canopy: rim at y 98, its points at x 26, 72, 128 and 174), the flower in its pot. A streak falls 9 down for every 4 to
// the left; one that reached the canopy's rim under the canopy was stopped there (the still's own drawing leaves the rain clear from
// x 39 in), so below the canopy only rain that missed it shows.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M16.7 8.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM40.7 4.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM64.7 9.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM88.7 5.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM116.7 8.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM140.7 4.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM164.7 9.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM188.7 5.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM28.7 22.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM52.7 20.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM76.7 24.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM126.7 22.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM150.7 20.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM174.7 24.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM196.7 21.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM12.7 38.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM36.7 37.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM62.7 38.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM156.7 40.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM182.7 38.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM22.7 55.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM44.7 50.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM170.7 56.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM194.7 54.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM10.7 70.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM186.7 72.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM18.7 86.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM198.7 88.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM180.7 90.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM8.7 104.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM20.7 116.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM6.7 130.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM16.7 146.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM4.7 158.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM192.7 104.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM178.7 114.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM196.7 122.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM184.7 134.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM170.7 148.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM192.7 150.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7ZM180.7 158.3l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7Z\" fill=\"var(--art-paper,#FBF7EC)\"/><rect y=\"171\" width=\"200\" height=\"29\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"62,180 99,177 200,192 200,200 120,200\" fill=\"var(--art-teal-deep,#25907B)\"/><rect x=\"97.5\" y=\"60\" width=\"5\" height=\"117\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"97\" y=\"36\" width=\"6\" height=\"16\" rx=\"3\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M26 98C40 62 70 46 100 46C130 46 160 62 174 98Q151 83 128 98Q100 82 72 98Q49 83 26 98Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M26 98C40 62 70 46 100 46C82 54 71 74 72 98Q49 83 26 98Z\" fill=\"var(--art-clay-lit,#F6A06F)\"/><path d=\"M174 98C160 62 130 46 100 46C118 54 129 74 128 98Q151 83 174 98Z\" fill=\"var(--art-clay-deep,#C25626)\"/><rect x=\"68.5\" y=\"126\" width=\"2\" height=\"28\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M52 136C58 135 65 137 69 142L69 146C61 147 54 143 52 136Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M87 136C81 135 74 137 70 142L70 146C78 147 85 143 87 136Z\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"69.5\" cy=\"112.5\" r=\"6\" fill=\"var(--art-violet,#7C5CE6)\"/><circle cx=\"77.6\" cy=\"118.4\" r=\"6\" fill=\"var(--art-violet,#7C5CE6)\"/><circle cx=\"74.5\" cy=\"127.9\" r=\"6\" fill=\"var(--art-violet,#7C5CE6)\"/><circle cx=\"64.5\" cy=\"127.9\" r=\"6\" fill=\"var(--art-violet,#7C5CE6)\"/><circle cx=\"61.4\" cy=\"118.4\" r=\"6\" fill=\"var(--art-violet,#7C5CE6)\"/><circle cx=\"69.5\" cy=\"121\" r=\"7\" fill=\"var(--art-violet,#7C5CE6)\"/><circle cx=\"69.5\" cy=\"121\" r=\"3.8\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M55 157L84 157L80 177Q79 180 76 180L62 180Q59 180 58 177Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M77 157L84 157L80 177Q79 180 76 180L68 180Q75 172 77 157Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><rect x=\"51\" y=\"151\" width=\"37\" height=\"8\" rx=\"2.5\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M53.5 151H82V159H53.5A2.5 2.5 0 0 1 51 156.5V153.5A2.5 2.5 0 0 1 53.5 151Z\" fill=\"var(--art-paper,#FBF7EC)\"/></svg>\n";
export const STILL_HASH = "d7f8dad5a5";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 23 || !EL[1].includes("M16.7 8.3l-4 9")) throw new Error("safe: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const [SKY, RAIN_EL, GROUND, SHADOW] = EL;
// (the shaft runs on up through the canopy to its tip: under the canopy in the still, it shows once the canopy turns)
const POLE = EL[4] + EL[5] + `<rect x="97.5" y="46" width="5" height="16" ${/fill="[^"]+"/.exec(EL[4])[0]}/>`, CANOPY = EL.slice(6, 9).join(""), FLOWER_STEM = EL[9], LEAVES = EL[10] + EL[11], PETALS = EL.slice(12, 17), HEART = EL[17] + EL[18], POT = EL.slice(19).join("");
const STREAK = "l-4 9a.8.8 0 0 1-1.5-.7l4-9a.8.8 0 0 1 1.5.7Z";
const RAIN_FILL = /fill="([^"]+)"/.exec(RAIN_EL)[1];

// ---- the rain: the still's streaks, and more where the still can't show them (behind the canopy, behind the ground), so it falls evenly
const STILL_RAIN = [...RAIN_EL.matchAll(/M([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
const HIDDEN_RAIN = [[52, 70], [70, 60], [90, 56], [110, 56], [130, 60], [148, 70], [62, 80], [84, 72], [106, 70], [128, 74], [146, 80], [38, 175], [70, 178], [104, 186], [140, 176], [176, 182], [16, 190], [128, 195], [56, 192], [196, 196]];
const RAIN = [...STILL_RAIN, ...HIDDEN_RAIN];
// (a second fall, for the harder rain: the same field moved half over, arriving from above once it starts)
const HEAVY = RAIN.map(([x, y]) => [x + 109, y + 106]);
const V = 260, SLANT = 4 / 9, TOP = -12, H = 212, LEFT = -12, W = 218, RIM = 98, HUB = 46;
const wrap = (v, lo, span) => ((((v - lo) % span) + span) % span) + lo;
// a streak at t: where it is, and whether something stopped it on its way here this time down
function streak([x0, y0], t, stopped, since = -Infinity) {
  const fallen = V * t, y = wrap(y0 + fallen, TOP, H), x = wrap(x0 - SLANT * fallen, LEFT, W);
  // (when it came in at the top this time round, for rain that only starts falling at `since`)
  if (t - (y - TOP) / V < since) return "";
  return stopped(x, y, t) ? "" : `M${n2(x)} ${n2(y)}${STREAK}`;
}
// under the canopy's rim: stopped if it crossed the rim's line under the canopy (while the canopy was there)
const underCanopy = (until = Infinity) => (x, y, t) => {
  if (y <= RIM) return false;
  const xc = x + SLANT * (y - RIM), tc = t - (y - RIM) / V;
  return xc >= 39 && xc <= 174 && tc < until;
};
const rain = (svg) => `<path d="${svg}" fill="${RAIN_FILL}"/>`;

// ---- the ground getting wet: a darker wash over all of it but the patch the umbrella keeps dry, and puddles gathering in the wet
const DRY = "M74 171.5A68 9 0 1 0 74.01 171.5Z";
const wet = (k, dryToo = 0) => (k > 0.004 ? `<path fill-rule="evenodd" d="M-1 171H201V201H-1Z${dryToo < 1 ? DRY : ""}" ${fill("teal")} opacity="${n4(k)}"/>` + (dryToo > 0.004 ? `<path d="${DRY}" ${fill("teal")} opacity="${n4(Math.min(k, dryToo))}"/>` : "") : "");
const puddle = (cx, cy, rx, ry) => (rx > 0.05 ? `<ellipse cx="${cx}" cy="${cy}" rx="${n2(rx)}" ry="${n2(ry)}" ${fill("teal-deep")}/>` : "");

// ---- happy: harder rain, the flower dry
const HAPPY_DUR = 2.6;
function happy(t) {
  if (t <= 0) return STILL;
  const stop = underCanopy();
  const d = RAIN.map((p) => streak(p, t, stop)).join("") + HEAVY.map((p) => streak(p, t, stop, 0.35)).join("");
  const k = track([[0.3, 0], [2.2, 1, "io"]], t), pr = track([[0.9, 0], [2.4, 1, "out"]], t);
  const puddles = puddle(14, 189, 15 * pr, 3.4 * pr) + puddle(166, 183, 20 * pr, 3.6 * pr) + puddle(186, 195, 14 * pr, 3 * pr) + puddle(150, 196, 10 * pr, 2.2 * pr);
  return `${OPEN}${SKY}${rain(d)}${GROUND}${wet(k)}${puddles}${SHADOW}${POLE}${CANOPY}${FLOWER_STEM}${LEAVES}${PETALS.join("")}${HEART}${POT}</svg>`;
}

// ---- sad: inside out
const SAD_DUR = 2.8, T_FLIP = 0.78, FOOT = [100, 177];
// the canopy turned: squashed to its hub's line and through it (sy below 0: inside out, its underside and ribs showing)
const UNDERSIDE = CANOPY.replace(/var\(--art-clay-lit,#[0-9A-F]+\)/, paint("clay")).replace(/var\(--art-clay,#[0-9A-F]+\)/, paint("clay-deep")).replace(/var\(--art-clay-deep,#[0-9A-F]+\)/, paint("clay-deeper"))
  + `<path d="M99.4 46L25.4 98H26.6ZM99.6 46L71.4 98H72.6ZM100.4 46L127.4 98H128.6ZM100.6 46L173.4 98H174.6Z" ${fill("ink")}/>`;
function canopy(sy, sx) {
  // (through edge-on, the one side gives way to the other)
  const k = Math.min(1, Math.max(0, (0.15 - sy) / 0.3));
  const svg = k <= 0 ? CANOPY : k >= 1 ? UNDERSIDE : `${CANOPY}<g opacity="${n4(k)}">${UNDERSIDE}</g>`;
  return `<g transform="translate(100 ${HUB}) scale(${n4(sx)} ${n4(sy)}) translate(-100 ${-HUB})">${svg}</g>`;
}
function sad(t) {
  if (t <= 0) return STILL;
  // the gust: the umbrella leans away from it, the canopy lifting, then it goes inside out, and the umbrella rocks back
  const lean = track([[0.3, 0], [T_FLIP, -7, "in"], [T_FLIP + 0.3, 3, "io"], [T_FLIP + 0.6, -1.5, "io"], [T_FLIP + 0.9, 0, "io"]], t);
  const sy = track([[0.3, 1], [T_FLIP - 0.12, 0.86, "in"], [T_FLIP + 0.12, -0.62, "io"], [T_FLIP + 0.26, -0.82, "out"], [T_FLIP + 0.46, -0.76, "io"]], t);
  const sx = track([[T_FLIP - 0.08, 1], [T_FLIP + 0.2, 0.9, "io"]], t);
  // the rain: stopped by the canopy till it turns; after, the turned canopy catches what falls into its cup
  const stop = (x, y, tt) => underCanopy(T_FLIP + 0.04)(x, y, tt) || (y > HUB && (() => { const xc = x + SLANT * (y - HUB), tc = tt - (y - HUB) / V; return xc >= 34 && xc <= 166 && tc >= T_FLIP + 0.04; })());
  const d = RAIN.map((p) => streak(p, t, stop)).join("");
  // the flower beaten over by the rain once it reaches it (each drop a small knock), its leaves pressed down, a petal knocked off
  const hit = T_FLIP + 0.3;
  const bowAt = (tt) => track([[hit, 0], [hit + 0.12, -10, "out"], [hit + 0.3, -7, "io"], [hit + 0.45, -22, "out"], [hit + 0.65, -18, "io"], [hit + 0.8, -36, "out"], [hit + 1.1, -32, "io"]], tt);
  const bow = bowAt(t);
  // (its head, heavy with water, hangs further over at the top of the stem)
  const hang = track([[hit + 0.2, 0], [hit + 1.1, -34, "io"]], t);
  const droop = track([[hit, 0], [hit + 0.9, 1, "io"]], t);
  const loose = PETALS[4];
  const tOff = hit + 0.45, u = Math.max(0, t - tOff);
  // (it leaves from where the bowed head had it, and falls, light, drifting with the rain, to the ground)
  const petal = t < tOff ? "" : (() => {
    const hangOff = track([[hit + 0.2, 0], [hit + 1.1, -34, "io"]], tOff), fy = Math.min(52, 0.5 * 500 * u * u), fx = -SLANT * fy * 0.6;
    // (lying on the ground, seen from in front: flat)
    const flat = track([[tOff + Math.sqrt(52 / 250) - 0.02, 1], [tOff + Math.sqrt(52 / 250) + 0.08, 0.45, "out"]], t);
    return `<g transform="translate(${n2(fx)} ${n2(fy)}) rotate(${n2(bowAt(tOff))} 69.5 152) rotate(${n2(hangOff)} 69.5 127) translate(61.4 124.4) scale(1 ${n4(flat)}) translate(-61.4 -124.4)">${loose}</g>`;
  })();
  const head = `<g transform="rotate(${n2(bow)} 69.5 152)">${FLOWER_STEM}<path d="${/d="([^"]+)"/.exec(EL[10])[1]}" transform="rotate(${n2(22 * droop)} 69 144)" ${/fill="[^"]+"/.exec(EL[10])[0]}/><path d="${/d="([^"]+)"/.exec(EL[11])[1]}" transform="rotate(${n2(-22 * droop)} 70 144)" ${/fill="[^"]+"/.exec(EL[11])[0]}/><g transform="rotate(${n2(hang)} 69.5 127)">${(t < tOff ? PETALS : PETALS.slice(0, 4)).join("")}${HEART}</g></g>`;
  const k = track([[0.3, 0], [2.4, 1, "io"]], t), dryToo = track([[hit, 0], [SAD_DUR, 0.85, "io"]], t);
  return `${OPEN}${SKY}${rain(d)}${GROUND}${wet(k, dryToo)}${SHADOW}<g transform="rotate(${n2(lean)} ${FOOT[0]} ${FOOT[1]})">${POLE}${canopy(sy, sx)}</g>${head}${petal}${POT}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
