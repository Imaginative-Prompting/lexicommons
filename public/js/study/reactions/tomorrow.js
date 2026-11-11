// Tomorrow's two stories. Happy: dawn comes on: the sun rises from behind the hills, a little to the right as it climbs, into the lower cloud's
// tapered tip, which takes a small bite from its edge as the wind carries it on; the wind drops with the tip clear, and the sun stands clean over
// the hills. Sad: the same dawn, the same disc risen clear of the hill line; then a bite comes out of its right side in the sky's own violet (a new
// moon can't be seen against the sky: only where it covers the sun), moving in from the right as the moon does at a low dawn, and stops with the
// sun a thick crescent. (Half the sun covered doesn't dim the land, so the hills stay as they are.)
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M-2 50C10 38 22 33 34 33C54 33 66 47 84 50C98 52 110 49 118 44.6C108 53 88 59 70 59C52 59 40 52 22 52C12 52 4 55 -2 58Z\" fill=\"var(--art-violet-lit,#A68CFF)\"/><path d=\"M78.6 87C90 76 106 66 123 66C140 66 148 74 162 78C176 82 188 81 196 76C190 84 172 90 155 90C138 90 118 81 99 81C90 81 84 84 78.6 87Z\" fill=\"var(--art-violet-lit,#A68CFF)\"/><circle cx=\"77.5\" cy=\"148\" r=\"50\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M0 137C14 134.6 34 134 50 136C70 138 88 144 104 147.5C116 150 128 150 140 150L140 180L0 180Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M0 164.6C10 166 20 166.5 30 166C55 164 80 154 102 147C120 142 140 138 158 138C174 138 188 141 200 145L200 200L0 200Z\" fill=\"var(--art-teal,#37B39B)\"/></svg>\n";
export const STILL_HASH = "d450116773";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 6) throw new Error("tomorrow: the still isn't as this story knows it");
const SKY = EL[0], LOW = EL[2], SUN = EL[3], HILLS = EL[4] + EL[5];
// the upper cloud runs out of the frame on the left: its two edges carried on to a tapered tail, as its right end tapers, so it can drift in
const HIGH = EL[1].replace('d="M-2 50C', 'd="M-30 66C-22 62 -8 56 -2 50C').replace("12 52 4 55 -2 58Z", "12 52 4 55 -2 58C-8 61 -20 65 -30 66Z");
if (HIGH === EL[1] || !HIGH.includes("-30 66Z")) throw new Error("tomorrow: the upper cloud isn't as this story knows it");
const at = (svg, dx, dy = 0) => (dx || dy ? `<g transform="translate(${n2(dx)} ${n2(dy)})">${svg}</g>` : svg);
/** The sky with the sun moved (dx, dy) and the clouds carried on by the wind, the lower (nearer, faster) one `low`, the upper one `high`; the
 *  clouds in front of the sun, the hills in front of it all. */
const scene = (sun, low, high) => `${OPEN}${SKY}${sun}${at(HIGH, high)}${at(LOW, low)}${HILLS}</svg>`;

// ---- happy. Both come on at once from the still (the sun was rising, the wind blowing), and slow together as the moment arrives: the sun up 36
// and over 10, its top clear of the upper cloud; the lower cloud on 58, just clear of the sun's edge everywhere along it.
const T_END = 2.2;
const HAPPY_DUR = T_END + 0.8;
function happy(t) {
  if (t <= 0) return STILL;
  const k = track([[0, 0], [T_END, 1, "out"]], t);
  return scene(at(SUN, 10 * k, -36 * k), 58 * k, 22 * k);
}

// ---- sad. The rise is the happy's, a little quicker; a beat with the sun up; then the moon's disc (49 to the sun's 50) comes in from the right
// and a touch down, from just touching to 50 from the sun's middle, slowing as the time-lapse ends.
const T_RISE = 1.7, T_BITE = T_RISE + 0.25, T_BITTEN = T_BITE + 1.1;
const SAD_DUR = T_BITTEN + 0.7;
const SUN_AT = [77.5, 148], MOON_R = 49, MOON_FROM = [99.5, -14], MOON_TO = [50, -6];
function sad(t) {
  if (t <= 0) return STILL;
  const k = track([[0, 0], [T_RISE, 1, "out"]], t);
  const m = track([[T_BITE, 0], [T_BITTEN, 1, "out"]], t);
  // the sun drawn only outside the moon's disc (its frame is the sun's, so it rides with it): one edge, where the moon covers it
  let sun = SUN;
  if (t > T_BITE) {
    const cx = SUN_AT[0] + MOON_FROM[0] + (MOON_TO[0] - MOON_FROM[0]) * m, cy = SUN_AT[1] + MOON_FROM[1] + (MOON_TO[1] - MOON_FROM[1]) * m;
    const disc = `M${n2(cx - MOON_R)} ${n2(cy)}A${MOON_R} ${MOON_R} 0 1 0 ${n2(cx + MOON_R)} ${n2(cy)}A${MOON_R} ${MOON_R} 0 1 0 ${n2(cx - MOON_R)} ${n2(cy)}Z`;
    sun = `<clipPath id="mn"><path d="M-300 -300H500V500H-300Z${disc}" clip-rule="evenodd"/></clipPath><g clip-path="url(#mn)">${SUN}</g>`;
  }
  return scene(at(sun, 10 * k, -36 * k), 58 * k, 22 * k);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
