// Beach's story. Happy, nearly: the same big wave's wash runs up toward the bucket and stops a hand short of it, and drains away, leaving its wet
// tongue of sand reaching up to just below the bucket; the bucket stands. Sad: a big
// wave's wash runs up the beach from the shoreline, slantwise, further on the right, slowing as it climbs. It reaches the empty bucket from its right,
// presses on it, and tips it over to the left onto its side, its handle flopping down; then the water drains back to the sea, leaving the sand dark
// and wet where it ran. The spade, planted in its heap, stands.
// Every frame is a pure function of t, in seconds. The still's own parts, all inside the still's own frame (1.3 times these units about (100, 150)):
// the sky, the sea, the foam at the shoreline (y 115-121), the sand, two shaded hollows, the bucket's shadow, the bucket (its handle, its body and
// shade from its rim at y 151 to its foot at 181, 74.5-101.5 across there, its rim and mouth, its handle's ears), the spade (its shaft, its blade
// buried in its heap, its grip) and the heap. The bucket (20 cm) is 34 across: 170 to the meter.
import { blob, n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><g transform=\"translate(100 150) scale(1.3) translate(-100 -150)\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><rect y=\"87\" width=\"200\" height=\"33\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M0 115.5C20 113.8 40 113.8 60 115C80 116.2 100 115.8 120 114.8C140 113.8 160 114 180 115C190 115.5 196 115.3 200 115L200 121L0 121Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M0 117.8C20 116.2 40 116.3 60 117.4C80 118.5 100 118.2 120 117.2C140 116.3 160 116.5 180 117.4C190 117.8 196 117.6 200 117.3L200 200L0 200Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M35 124.4C50 124.6 64 129.5 79 132.9L56 132C52 131.8 51 131 49 129.7C45 127 40 124.6 35 124.4Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M165 126.8C178 127 190 130 200 132.5L200 135.8L186 134.6C182 134.2 181 133.5 179 132.2C174 129 170 127 165 126.8Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M78 182L124 180L200 191L200 200L150 200Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M70.9 153C70.9 135.5 105.1 135.5 105.1 153L102.9 153C102.9 138.6 73.1 138.6 73.1 153Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M71 151L105 151L101.5 181Q88 183.2 74.5 181Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M97 151L105 151L101.5 181Q97.4 181.9 93 182Z\" fill=\"var(--art-clay-deep,#C25626)\"/><ellipse cx=\"88\" cy=\"151\" rx=\"17\" ry=\"3\" fill=\"var(--art-clay,#E8743B)\"/><ellipse cx=\"88\" cy=\"150.8\" rx=\"15.6\" ry=\"2.2\" fill=\"var(--art-clay-deeper,#9C4219)\"/><circle cx=\"71.5\" cy=\"153.2\" r=\"2.4\" fill=\"var(--art-clay,#E8743B)\"/><circle cx=\"104.5\" cy=\"153.2\" r=\"2.4\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M116.3 167.6L119.4 168.4L124.4 150.1L121.3 149.3Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M118.3 168.1L119.4 168.4L124.4 150.1L123.2 149.8Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M105.3 180.2L107.6 171.5Q110.2 165.9 116.5 167.1L119.6 167.9Q125.6 170.1 125 176.1L122.7 184.8Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M118.4 167.6L119.6 167.9Q125.6 170.1 125 176.1L122.7 184.8L116.9 183.3Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M120.7 151.2C121.5 148.3 117.5 146.2 118.3 143.3L119.1 140.4Q119.5 138.9 120.9 139.3L129.6 141.6Q131.1 142 130.7 143.5L129.9 146.4C129.1 149.3 124.6 149.1 123.8 152ZM121.2 141.7L128.2 143.5L127.8 144.8C127.2 147.2 120.2 145.3 120.9 142.9Z\" fill-rule=\"evenodd\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M129.6 141.6Q131.1 142 130.7 143.5L129.9 146.4C129.1 149.3 124.6 149.1 123.8 152L122.7 151.7C123.5 148.8 127.9 148.4 128.5 146L129.3 143.1Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M101 183.5C104 176 121 175 130 183.5Q115 188 101 183.5Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/></g></svg>\n";
export const STILL_HASH = "e2b07f9cfc";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const IN = '<g transform="translate(100 150) scale(1.3) translate(-100 -150)">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 21 || !STILL.startsWith(OPEN + IN) || !EL[8].includes("M71 151L105 151L101.5 181")) throw new Error("beach: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const SEA = EL.slice(0, 6).join(""), SHADOW = EL[6], HANDLE = EL[7], BUCKET = EL.slice(8, 14).join(""), SPADE = EL.slice(14).join("");
const FOOT = [74.5, 181];

// ---- the wash: one tongue of a wave's swash, a thin sheet running slantwise up the beach from the shoreline on the right (185, 118) to just past
// the bucket's right foot (98, 184), slowing as it climbs; it holds a moment and drains back, leaving the sand it ran over dark and wet
const FROM = [185, 118], TO = [98, 184], LONG = Math.hypot(TO[0] - FROM[0], TO[1] - FROM[1]), DIR = [(TO[0] - FROM[0]) / LONG, (TO[1] - FROM[1]) / LONG];
const reachOf = (t) => (t <= 1.45 ? track([[0.3, 0], [1.3, 1, "out"], [1.45, 1]], t) : track([[1.45, 1], [2.5, 0, "in"]], t));
function tongue(r, t, extra) {
  // its edges, either side of its middle line, wide at the shore and narrowing toward its rounded tip; a little wobble along them
  const L = [], R = [], n = 8, len = LONG * r + extra;
  for (let i = 0; i <= n; i++) {
    const d = (len * i) / n, w = (24 - 10 * (d / LONG)) * Math.min(1, (len - d) / 9 + 0.35) + 0.8 * Math.sin(d / 7 + 2.5 * t), p = [FROM[0] + DIR[0] * d, FROM[1] + DIR[1] * d];
    L.push([p[0] - DIR[1] * w, p[1] + DIR[0] * w]); R.push([p[0] + DIR[1] * w, p[1] - DIR[0] * w]);
  }
  const tip = [FROM[0] + DIR[0] * (len + 3), FROM[1] + DIR[1] * (len + 3)];
  return blob([[FROM[0] - DIR[1] * 30, SHORE - 3], ...L, tip, ...R.reverse(), [FROM[0] + DIR[1] * 30, SHORE - 3]]);
}
const SHORE = 118;
function wash(t, k = 1) {
  // (k: how far up toward the bucket it gets, 1 all the way to its foot)
  const r = k * reachOf(t), most = k * track([[0.3, 0], [1.3, 1, "out"]], t);
  if (most < 0.02) return "";
  // (kept below the shoreline's foam, where it comes from; the water thin enough to show the sand through it)
  const clip = `<clipPath id="sw"><path d="M-20 ${SHORE - 1}H220V220H-20Z"/></clipPath>`;
  const wet = `<path d="${tongue(most, 1.3, 0)}" ${fill("sun")} opacity="0.75"/>`;
  if (r < 0.02) return `${clip}<g clip-path="url(#sw)">${wet}</g>`;
  return `${clip}<g clip-path="url(#sw)">${wet}<path d="${tongue(r, t, 2.4)}" ${fill("paper")}/><path d="${tongue(r, t, 0)}" ${fill("sky-pale")} opacity="0.82"/></g>`;
}

// ---- the bucket: the water at its right side pushes it up onto its left edge, rocking it until its weight (20.2 out from that edge, 42 degrees
// right of straight up) is past the edge; then gravity takes it over (g r / (r^2 + k^2): 60 a second a second here) onto its side, its tapered side
// flat on the sand: 96.7 degrees
const T_PUSH = 1.08, T_TIP = 1.43, BALANCE = 42, FLAT = 96.7;
const OVER = (() => { const S = []; let a = (BALANCE * Math.PI) / 180, w = 3; const dt = 1 / 2000; while (a < (FLAT * Math.PI) / 180) { S.push(a); w += 60 * Math.sin(a - (BALANCE * Math.PI) / 180) * dt; a += w * dt; } S.push((FLAT * Math.PI) / 180); return S; })();
const T_DOWN = T_TIP + (OVER.length - 1) / 2000;
function tilt(t) {
  if (t <= T_PUSH) return 0;
  if (t <= T_TIP) return BALANCE * track([[T_PUSH, 0], [T_TIP, 1, "in"]], t);
  if (t <= T_DOWN) return (OVER[Math.round((t - T_TIP) * 2000)] * 180) / Math.PI;
  return FLAT - track([[T_DOWN, 0], [T_DOWN + 0.06, 4, "out"], [T_DOWN + 0.13, 0, "in"], [T_DOWN + 0.17, 0.8, "out"], [T_DOWN + 0.21, 0, "in"]], t);
}
// its handle, once it's down, flops over onto the sand (seen flatter and flatter)
const flop = (t) => track([[T_DOWN, 1], [T_DOWN + 0.25, 0.3, "in"]], t);

// ---- sad: knocked over
const SAD_DUR = 2.9;
function sad(t) {
  if (t <= 0.3) return STILL;
  const a = tilt(t), f = flop(t);
  const handle = f < 1 ? `<g transform="translate(0 153.2) scale(1 ${n2(f)}) translate(0 -153.2)">${HANDLE}</g>` : HANDLE;
  const bucket = a ? `<g transform="rotate(${n2(-a)} ${FOOT[0]} ${FOOT[1]})">${handle}${BUCKET}</g>` : HANDLE + BUCKET;
  // (its shadow shortens as it goes over)
  const shadow = a ? `<g transform="translate(78 0) scale(${n2(1 - 0.55 * Math.min(1, a / FLAT))} 1) translate(-78 0)">${SHADOW}</g>` : SHADOW;
  return `${OPEN}${IN}${SEA}${wash(t)}${shadow}${bucket}${SPADE}</g></svg>`;
}

// ---- happy: it stops short
// The same big wave's wash runs up the same way, slowing as it climbs, and its tip stops a hand short of the bucket's foot (0.8 of the way); it hangs
// there a moment and drains back to the sea, leaving the wet tongue of sand it ran over reaching up to just below the bucket. The bucket stands.
const HAPPY_DUR = 3;
function happy(t) {
  if (t <= 0.3) return STILL;
  return `${OPEN}${IN}${SEA}${wash(t, 0.8)}${SHADOW}${HANDLE}${BUCKET}${SPADE}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
