// Deep's story. Happy, a time-lapse of the well's own water (the wet season: weeks in two seconds): the groundwater rises in the shaft, up over the
// stones, past the bucket, which floats up on it, upright, its rope going slack and the slack lying in loops on the water; it stops halfway up the shaft,
// the well full and the bucket floating high, in easy reach. Sad: the worn windlass slips. The bucket runs down into the water, the drum spinning as the rope pays out, the crank whirling; the last wrap comes off, and the rope's frayed
// fastening parts, a stub left on the drum. The bucket tips over and floats; the whole rope falls down the shaft after it and heaps in loops on the
// water. The shaft stands empty below the crank.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky, the ground's layers and stones, the shaft (dark, its lit top), the
// water at its foot (y 180, 89-111 across), the lining, the well's head (its wall, shade, band, rim, opening), the windlass (posts, axle at y 8-12, the
// rope's coil on its drum (94-104), the crank), the rope (99.4-100.6 across, from the drum at 12.6 down to 166) and the bucket (165-173). The bucket
// (30 cm across) is 8 here: 27 to the meter.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M-2 30C40 28 150 29 202 27V46H-2Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M-2 43H202V47H-2Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M-2 47H202V202H-2Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M-2 47H202V64C160 67 120 62 80 66C40 70 20 64 -2 67Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M-2 112C40 108 80 115 120 111C160 107 180 112 202 109V121C170 124 140 118 100 123C60 128 30 120 -2 124Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M-2 158L20 154L44 160L70 155L100 159L130 153L160 158L184 154L202 157L202 202L-2 202Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M14 172L30 168L31 169.4L15 173.4ZM146 180L170 176L171 177.4L147 181.4ZM40 190L58 186.6L58.6 188L40.6 191.4ZM170 164L186 166L185.6 167.4L169.6 165.4Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M17.4 136a2.6 2 0 1 0 5.2 0a2.6 2 0 1 0 -5.2 0ZM50.2 146a1.8 1.4 0 1 0 3.6 0a1.8 1.4 0 1 0 -3.6 0ZM145.8 132a2.2 1.7 0 1 0 4.4 0a2.2 1.7 0 1 0 -4.4 0ZM173 144a3 2.2 0 1 0 6 0a3 2.2 0 1 0 -6 0ZM32.4 92a1.6 1.2 0 1 0 3.2 0a1.6 1.2 0 1 0 -3.2 0ZM158 88a2 1.5 0 1 0 4 0a2 1.5 0 1 0 -4 0ZM64.6 80a1.4 1 0 1 0 2.8 0a1.4 1 0 1 0 -2.8 0ZM130.4 100a1.6 1.2 0 1 0 3.2 0a1.6 1.2 0 1 0 -3.2 0Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M89 46H111V190H89Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M89 46H111V58L89 66Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M89 180H111V190H89Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M89 180H111V181.6H89Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M83 46H89V190H83ZM111 46H117V190H111Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M83 46.6H89V51H83ZM83 51.6H89V55.5H83ZM83 56.1H89V59.9H83ZM83 66H89V70.5H83ZM83 71.1H89V74.9H83ZM83 75.5H89V80.2H83ZM83 90.7H89V95.1H83ZM83 95.7H89V100.2H83ZM83 100.8H89V105.1H83ZM83 110.2H89V114.8H83ZM83 125.1H89V129.2H83ZM83 129.8H89V133.8H83ZM83 139.9H89V144.1H83ZM83 144.7H89V148.6H83ZM83 159.8H89V164.3H83ZM83 169.5H89V173.4H83ZM83 178.4H89V182.8H83ZM83 183.4H89V187.7H83ZM111 51.7H117V56.2H111ZM111 56.8H117V60.7H111ZM111 66.4H117V70.5H111ZM111 76.7H117V81.4H111ZM111 82H117V86.1H111ZM111 86.7H117V90.5H111ZM111 91.1H117V95.7H111ZM111 101.7H117V105.9H111ZM111 106.5H117V111H111ZM111 111.6H117V115.9H111ZM111 121.5H117V126.3H111ZM111 131.8H117V136.2H111ZM111 136.8H117V140.7H111ZM111 141.3H117V145.2H111ZM111 145.8H117V149.6H111ZM111 150.2H117V155H111ZM111 160.8H117V165.5H111ZM111 166.1H117V170.2H111ZM111 170.8H117V175.1H111ZM111 175.7H117V180.5H111Z\" fill=\"var(--art-ground,#D3CAB5)\"/><path d=\"M83 60.5H89V65.4H83ZM83 80.8H89V85.4H83ZM83 86H89V90.1H83ZM83 105.7H89V109.6H83ZM83 115.4H89V119.7H83ZM83 120.3H89V124.5H83ZM83 134.4H89V139.3H83ZM83 149.2H89V154.1H83ZM83 154.7H89V159.2H83ZM83 164.9H89V168.9H83ZM83 174H89V177.8H83ZM83 188.3H89V190H83ZM111 46.6H117V51.1H111ZM111 61.3H117V65.8H111ZM111 71.1H117V76.1H111ZM111 96.3H117V101.1H111ZM111 116.5H117V120.9H111ZM111 126.9H117V131.2H111ZM111 155.6H117V160.2H111ZM111 181.1H117V185.7H111ZM111 186.3H117V190H111Z\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><path d=\"M80 30V40A20 6 0 0 0 120 40V30Z\" fill=\"var(--art-ground,#D3CAB5)\"/><path d=\"M108 30V45.6A20 6 0 0 0 120 40V30Z\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><path d=\"M80 34.6H120V35.6H80Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><ellipse cx=\"100\" cy=\"30\" rx=\"20\" ry=\"6\" fill=\"var(--art-ground,#D3CAB5)\"/><ellipse cx=\"100\" cy=\"30.4\" rx=\"12\" ry=\"3.4\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M82 4H85V33H82ZM115 4H118V33H115Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M116.6 4H118V33H116.6Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M82 8H118V12H82Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M94 7.4H104V12.6H94Z\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><path d=\"M118 9H123V17H126V19H121V11H118Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M99.4 12.6H100.6V166H99.4Z\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><path d=\"M96 166H104L103.2 173H96.8Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M95.6 165.4H104.4V166.6H95.6Z\" fill=\"var(--art-wood-deep,#B97F45)\"/></svg>\n";
export const STILL_HASH = "de4504c239";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 29 || !EL[26].includes("M99.4 12.6H100.6V166H99.4Z")) throw new Error("deep: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const GROUND = EL.slice(0, 24).join(""), CRANK = EL[25], BUCKET = EL[27] + EL[28], WATER = EL[11] + EL[12];
const G = 264, T_SLIP = 0.25, SURFACE = 180;
// the bucket's run down: the windlass's friction lets it go at half the fall's pace, to the water (its bottom from 173 to 180), then it slows in the water
const A = G * 0.5, T_WET = T_SLIP + Math.sqrt((2 * (SURFACE - 173)) / A);
const bucketDrop = (t) => {
  if (t <= T_SLIP) return 0;
  if (t < T_WET) return 0.5 * A * (t - T_SLIP) ** 2;
  const v = A * (T_WET - T_SLIP), s = t - T_WET;
  // (the water takes its speed: it goes in to its middle, a little more, and floats back up)
  return 7 + track([[0, 0], [0.12, v * 0.06, "out"], [0.3, 5.2, "out"], [0.5, 4.2, "io"], [0.7, 4.5, "io"]], s);
};
// the coil pays out with the bucket; the drum holds 15 of rope, so its fastening takes the load as the bucket floats, and parts
const ROPE_ON_DRUM = 15, T_PART = 0.86;
// the rope's top end, falling free from the drum after it parts
const T_DOWN = T_PART + Math.sqrt((2 * (SURFACE - 15.6)) / G);
const ropeTop = (t) => (t <= T_PART ? 12.6 : Math.min(SURFACE, 15.6 + 0.5 * G * (t - T_PART) ** 2));

// a loop of rope lying on the water (a ring, k its size from 0 to 1)
const ring = (cx, cy, rx, k) => (k < 0.02 ? "" : `<path d="M${n2(cx - rx * k)} ${cy}a${n2(rx * k)} ${n2(1.4 * k)} 0 1 0 ${n2(2 * rx * k)} 0a${n2(rx * k)} ${n2(1.4 * k)} 0 1 0 ${n2(-2 * rx * k)} 0ZM${n2(cx - rx * k + 0.9)} ${cy}a${n2(Math.max(0.1, rx * k - 0.9))} ${n2(Math.max(0.1, 1.4 * k - 0.6))} 0 1 0 ${n2(2 * (rx * k - 0.9))} 0a${n2(Math.max(0.1, rx * k - 0.9))} ${n2(Math.max(0.1, 1.4 * k - 0.6))} 0 1 0 ${n2(-2 * (rx * k - 0.9))} 0Z" fill-rule="evenodd" ${fill("paper-deeper")}/>`);

// ---- sad: it's gone
const SAD_DUR = 3;
function sad(t) {
  if (t <= T_SLIP) return STILL;
  const drop = bucketDrop(t), paid = Math.min(ROPE_ON_DRUM, drop + (t > T_WET ? 6 * Math.min(1, (t - T_WET) / 0.3) : 0) + Math.max(0, t - T_WET) * 8);
  // the drum spins as the rope pays out (radius 2.6), and on a while once it's free; the crank goes round with it (its arm swings through the depth:
  // seen side on, it shortens, points up, comes back)
  const spin = paid / 2.6 + (t > T_PART ? 4 * (1 - Math.exp(-(t - T_PART) * 3)) : 0);
  const crank = `<g transform="translate(0 10) scale(1 ${n4(Math.cos(spin))}) translate(0 -10)">${CRANK}</g>`;
  // the coil on the drum, shorter as its wraps come off (its fastening at its left end): gone when it parts
  const coilW = 10 * (1 - Math.min(1, paid / ROPE_ON_DRUM));
  const coil = coilW > 0.05 ? `<path d="M94 7.4H${n2(94 + coilW)}V12.6H94Z" ${fill("paper-deeper")}/>` : "";
  // the rope: from the drum (or its falling top end) down to the bucket's handle (the bucket at 166, plus its drop); once the bucket floats and the rope
  // comes down on the water, what has fallen lies there in loops
  const top = ropeTop(t), bottom = Math.min(166 + drop, SURFACE);
  const rope = top < bottom - 0.3 ? `<path d="M99.4 ${n2(top)}H100.6V${n2(bottom)}H99.4Z" ${fill("paper-deeper")}/>` : "";
  const stub = t > T_PART ? `<path d="M99.4 12.6H100.6V15.6L99.8 15L99.4 15.8Z" ${fill("paper-deeper")}/>` : "";
  // (the loops: rings of rope on the water, more as more of it comes down)
  const heaped = t > T_PART ? Math.min(1, (top - 15.6) / (SURFACE - 15.6)) : 0;
  const loops = heaped > 0 ? ring(100, 180.6, 5, Math.min(1, heaped * 3)) + ring(97.5, 181.2, 4.2, Math.max(0, Math.min(1, heaped * 3 - 1))) + ring(102.5, 180.9, 4.6, Math.max(0, Math.min(1, heaped * 3 - 2))) : "";
  // the bucket: down with the rope, into the water; once its rope goes slack it tips over on its side and floats there (its lower half under the water)
  const tip = t > T_PART ? track([[T_PART, 0], [T_PART + 0.35, 78, "in"], [T_PART + 0.45, 70, "out"], [T_PART + 0.55, 74, "io"]], t) : 0;
  const bucket = `<g transform="translate(0 ${n2(drop)}) rotate(${n2(tip)} 100 173)">${BUCKET}</g>`;
  return `${OPEN}${GROUND}${coil}${crank}${stub}${rope}${bucket}${WATER}${loops}</svg>`;
}

// ---- happy: the well fills
// The surface rises from 180 to LEVEL, easing in and settling as the well's water comes level with the ground's. The bucket (its bottom at 173) floats
// once the water is FLOAT up its side, and rides up with the surface, drifting a little toward the lit side as its rope goes slack; the slack falls from
// the drum straight down past it onto the water, where it lies in loops, the rope's end running up out of the water to the bucket's rim.
const LEVEL = 104, T_RISE = 0.3, T_FULL = 2.3, FLOAT = 3.5, DRIFT = 5.5;
const BEHIND = EL.slice(0, 11).join(""), FRONT = EL.slice(13, 26).join("");
const surface = (t) => SURFACE - (SURFACE - LEVEL) * track([[T_RISE, 0], [T_FULL, 1, "io"]], t);
const HAPPY_DUR = T_FULL + 0.6;
function happy(t) {
  if (t <= T_RISE) return STILL;
  const s = surface(t), rise = Math.max(0, 173 - FLOAT - s), drift = DRIFT * track([[0, 0], [24, 1, "io"]], rise);
  const water = `<path d="M89 ${n2(s)}H111V190H89Z" ${fill("sky-deep")}/><path d="M89 ${n2(s)}H111V${n2(s + 1.6)}H89Z" ${fill("sky")}/>`;
  const bucket = `<g transform="translate(${n2(drift)} ${n2(-rise)})">${BUCKET}</g>`;
  // the rope: to the bucket's rim while it hangs; once it floats, from the drum down to the water, its slack in loops on it, its end up to the rim
  if (rise <= 0) return `${OPEN}${BEHIND}${FRONT}${EL[26]}${bucket}${water}</svg>`;
  const rim = 166 - rise, slack = Math.min(1, rise / (173 - FLOAT - LEVEL));
  const rope = `<path d="M99.4 12.6H100.6V${n2(s)}H99.4Z" ${fill("paper-deeper")}/>`;
  const loops = ring(95.5, n2(s + 0.6), 4, Math.min(1, slack * 2)) + ring(97.2, n2(s + 1.2), 3.2, Math.max(0, Math.min(1, slack * 2 - 1)));
  const end = `<path d="M100 ${n2(s + 0.2)}L${n2(96.4 + drift)} ${n2(rim + 0.2)}L${n2(97.6 + drift)} ${n2(rim + 0.2)}L101.2 ${n2(s + 0.2)}Z" ${fill("paper-deeper")}/>`;
  return `${OPEN}${BEHIND}${FRONT}${rope}${bucket}${water}${loops}${end}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
