// Hour's two stories, the clock's own. Happy: in time-lapse the minute hand goes round once and the hour hand on from one to two; on the
// hour the striker swings up from behind the clock's top and taps the left bell, then the right (each bell shivers as it's struck: no marks
// for sound), and rests against the right one. Sad: the minute hand has worked loose on its pin: nudged just past upright, it falls (a rod
// swinging about its end, faster as it goes) and at the bottom its worn hub slips off the pin: it drops, tips over and lies against the
// bezel at the bottom of the dial, the bare pin left with the hour hand alone.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"0\" y=\"144\" width=\"200\" height=\"56\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"40,177 125,177 200,190 200,200 88,200\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M50 64L50 40A32 24 0 0 1 114 40L114 64L108 64L108 40A26 18 0 0 0 56 40L56 64Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M50 146L60 153L47 175Q44 179.5 39.5 177.5Q35.5 175 37.5 171Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M114 146L104 153L117 175Q120 179.5 124.5 177.5Q128.5 175 126.5 171Z\" fill=\"var(--art-sky,#58ADEB)\"/><circle cx=\"88\" cy=\"109\" r=\"54\" fill=\"var(--art-sky-deep,#3488C9)\"/><circle cx=\"82\" cy=\"108\" r=\"54\" fill=\"var(--art-sky,#58ADEB)\"/><circle cx=\"82\" cy=\"108\" r=\"46\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M82 108L82 62A46 46 0 0 1 105 68.2Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/><rect x=\"80.7\" y=\"66\" width=\"2.6\" height=\"6\" rx=\"1.3\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"80.7\" y=\"144\" width=\"2.6\" height=\"6\" rx=\"1.3\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"118\" y=\"106.7\" width=\"6\" height=\"2.6\" rx=\"1.3\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"40\" y=\"106.7\" width=\"6\" height=\"2.6\" rx=\"1.3\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M101.1 77.5L104.1 72.3A1.3 1.3 0 0 0 101.9 71L98.9 76.2A1.3 1.3 0 0 0 101.1 77.5Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M113.9 91.1L119.1 88.1A1.3 1.3 0 0 0 117.8 85.9L112.6 88.9A1.3 1.3 0 0 0 113.9 91.1Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M112.6 127.1L117.8 130.1A1.3 1.3 0 0 0 119.1 127.9L113.9 124.9A1.3 1.3 0 0 0 112.6 127.1Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M98.9 139.9L101.9 145.1A1.3 1.3 0 0 0 104.1 143.8L101.1 138.6A1.3 1.3 0 0 0 98.9 139.9Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M62.9 138.6L59.9 143.8A1.3 1.3 0 0 0 62.1 145.1L65.1 139.9A1.3 1.3 0 0 0 62.9 138.6Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M50.2 124.9L45 127.9A1.3 1.3 0 0 0 46.2 130.1L51.4 127.1A1.3 1.3 0 0 0 50.2 124.9Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M51.4 88.9L46.2 85.9A1.3 1.3 0 0 0 45 88.1L50.2 91.1A1.3 1.3 0 0 0 51.4 88.9Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M65.1 76.2L62.1 71A1.3 1.3 0 0 0 59.9 72.3L62.9 77.5A1.3 1.3 0 0 0 65.1 76.2Z\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"80.1\" y=\"73\" width=\"3.8\" height=\"36\" rx=\"1.9\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M83.9 109.1L96.9 86.6A2.2 2.2 0 0 0 93.1 84.4L80.1 106.9A2.2 2.2 0 0 0 83.9 109.1Z\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"82\" cy=\"108\" r=\"4.2\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M38 70A20 18 -36.9 0 1 70 46Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M38 70A20 3.5 -36.9 0 0 70 46A20 3.5 -36.9 0 0 38 70Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M126 70A20 18 36.9 0 0 94 46Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M126 70A20 3.5 36.9 0 1 94 46A20 3.5 36.9 0 1 126 70Z\" fill=\"var(--art-sky-deep,#3488C9)\"/></svg>\n";
export const STILL_HASH = "e365970c41";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 29) throw new Error("hour: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const PIN = [82, 108];
const MINUTE = EL[22], HOURH = EL[23], CAP = EL[24];
const turned = (svg, a) => `<g transform="rotate(${n2(a)} ${PIN[0]} ${PIN[1]})">${svg}</g>`;
// the bells: each shivers about its foot when struck (a quick ring, dying away)
const BELL_L = [EL[25] + EL[26], [46, 66]], BELL_R = [EL[27] + EL[28], [118, 66]];
const bell = ([svg, foot], hit, t) => {
  const s = t - hit, a = s > 0 && s < 0.45 ? 3.4 * Math.exp(-s * 8) * Math.sin(s * 70) : 0;
  return `<g transform="rotate(${n2(a)} ${foot[0]} ${foot[1]})">${svg}</g>`;
};
// the striker: an arm on a pivot behind the clock's top (out of sight while it hangs down), a ball at its end; at 40° either side of
// upright its ball meets a bell's inner rim
const PIVOT = [82, 64], ARM = 21;
const striker = (a) => {
  const r = (a * Math.PI) / 180, b = [PIVOT[0] + ARM * Math.sin(r), PIVOT[1] - ARM * Math.cos(r)];
  return `<path d="M${PIVOT[0]} ${PIVOT[1]}L${n2(b[0])} ${n2(b[1])}" stroke="${paint("steel-deep")}" stroke-width="2.8" stroke-linecap="round"/><circle cx="${n2(b[0])}" cy="${n2(b[1])}" r="4.8" ${fill("steel")}/><circle cx="${n2(b[0] - 1.5)}" cy="${n2(b[1] - 1.5)}" r="1.6" ${fill("paper-mid")}/>`;
};
// (the clock's parts in the still's order: wall, floor, shadow, handle, feet; the striker behind the body; the body, dial, hour, ticks; the
// hands; the pin's cap; the bells)
const scene = (minute, hourA, strikeA, hitL, hitR, t, off = [0, 0]) => `${OPEN}${EL.slice(0, 6).join("")}${striker(strikeA)}${EL.slice(6, 22).join("")}`
  + `<g transform="translate(${n2(off[0])} ${n2(off[1])})">${turned(MINUTE, minute)}</g>${turned(HOURH, hourA)}${CAP}${bell(BELL_L, hitL, t)}${bell(BELL_R, hitR, t)}</svg>`;

// ---- happy. The hour: the minute hand once round, the hour hand 30° on, both easing in and out of the time-lapse. Then the strike.
const T_RUN = [0.15, 1.75], T_UP = 1.82, T_L = 1.98, T_R = 2.16;
const HAPPY_DUR = T_R + 0.4 + 0.6;
function happy(t) {
  if (t <= 0) return STILL;
  const k = track([[T_RUN[0], 0], [T_RUN[1], 1, "io"]], t);
  // the striker: hanging down (180°) behind the clock; up to the left bell, across to the right, resting there
  const a = track([[T_UP, 180], [T_L, -40, "in"], [T_L + 0.06, -28, "out"], [T_R, 40, "io"], [T_R + 0.06, 34, "out"], [T_R + 0.16, 40, "in"]], t);
  return scene(360 * k, 30 * k, a, T_L, T_R, t);
}

// ---- sad. The fall, worked out once: the hand a rod pivoted at its end (ω² = 3g/2L: 36 long, the clock about 16 cm, so g is 8900 a second
// squared; the hub's drag slows it to a third of that), from just past upright, nudged, until it points straight down.
const SIM = (() => {
  const w2 = (3 * 8900) / (2 * 36) / 3.2, dt = 1 / 1200, out = [];
  let th = (6 * Math.PI) / 180, w = 0;
  while (th < Math.PI) { w += w2 * Math.sin(th) * dt; th += w * dt; out.push(th); }
  return out;
})();
const T_NUDGE = 0.3, T_SLIP = 0.45, T_OFF = T_SLIP + SIM.length / 1200;
// off the pin: its hub drops and it tips over, its tip down on the bezel at the bottom, until it lies along the bezel's lower left (its tip at
// the bottom, 153.5, its hub against the rim at 49.5, 140: turned 112.6° from upright); a small bounce
const LIE = 112.6, HUB = [49.5 - 82, 140 - 108], T_LIE = T_OFF + 0.24;
const SAD_DUR = Math.round((T_LIE + 0.2 + 0.7) * 100) / 100;
function sad(t) {
  if (t <= 0) return STILL;
  // nudged just past upright by the works, then loose
  if (t < T_SLIP) return scene(6 * track([[T_NUDGE, 0], [T_SLIP, 1, "io"]], t), 0, 180, -9, -9, t);
  if (t < T_OFF) return scene((SIM[Math.min(SIM.length - 1, Math.round((t - T_SLIP) * 1200))] * 180) / Math.PI, 0, 180, -9, -9, t);
  const u = track([[T_OFF, 0], [T_LIE, 1, "in"]], t), bounce = track([[T_LIE, 0], [T_LIE + 0.06, 1, "out"], [T_LIE + 0.14, 0, "in"]], t);
  return scene(180 - (180 - LIE) * u + 3 * bounce, 0, 180, -9, -9, t, [HUB[0] * u, HUB[1] * u - 1.5 * bounce]);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
