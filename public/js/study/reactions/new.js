// New's two stories: the camera draws back from the new shoe, and the floor beside it shows what was there all along. Happy: the box it came in,
// open, tissue paper spilling over its rim, standing on its own lid: just unpacked. Sad: a paint can lying on its side, its lid off, and its paint
// creeping slowly over the floor (paint, thick and slow, in lobes), until it reaches the new sole and runs round its toe; the shoe's sparkles go
// out one by one as it does.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view; the world carries on past its frame.
import { blob, n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M191.9 145.1c.6 1.9 .3 2.2-.5 4.1l13 0 0 14.4c-3.9-1.3-7.7-2.6-11.6-4-1.8-.6-4-1.1-5.6-2.1-1.4-1-2.6-2.4-3.8-3.6l8.5-8.8ZM6.6 145c1.4 1.3 3 2.6 4.1 4.1 1.3 1.9 1.7 4.7 4.1 5.7l114.3 45.2c1.7 .7 3.4 3.1 4.6 4.4l-138.1 0 0-55.2 11.9 0-.9-4.2Z\" fill=\"var(--art-teal-lit,#6FD0BD)\" fill-rule=\"evenodd\"/>\n<path d=\"M186.9 150.4c.7 .7 1.2 1.3 1.8 2.1-.5 .5-1.1 .9-1.6 1.4l17.3 6.2 0 44.3-74.2 0c-.3-.2-1-.8-1.5-1l-114-45.1c-2.1-.9-3.6-3-4.8-4.8 .5-.5 1-1.1 1.6-1.5 3 1.1 6 2 9.3 2l26 0 53.5-.1 21.4 0 20.1 0c12.2 0 34.3 1 45.1-3.5Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M95.4 75.4c.7 .1 1.6 .1 2.2 .2-.8 .9-1.6 1.9-2.7 2.6-1.1 .7-2.5 .9-3.6 1.5-2.7 1.2-6.9 3.4-8.7 5.8-.6 .8-1.1 2-1.5 2.9 5.9-3 8.8-8 15.7-10.3 2-.7 5.5-1.6 7.2 .3 .9 1 1.1 2.6 1.4 3.8 .7 .6 3.4 2.1 3.7 2.8 .1 .1 .2 1 .2 1 .8-.1 1.4-.3 2 .2-.8 .9-1.6 1.9-2.7 2.6-1 .6-2.3 .9-3.4 1.4-2.8 1.2-7.5 3.6-9.4 6-.6 .7-1.2 1.9-1.6 2.6 3.5-1.7 4.1-2.6 6.9-4.9 3.1-2.3 6.6-4.4 10.3-5.5 2-.7 5.7-1.7 7.5 0 1 1 1.2 2.7 1.5 4.1 1.7 1.2 3.7 1.9 4.3 3.7 .8 0 1.5-.2 2.2 .1-2.8 3.1-3.9 3-7.5 4.6-3.1 1.3-7 3.2-9.3 5.7-.7 .8-1.3 1.9-1.8 2.7 3.7-1.7 4.2-2.7 7.3-5 3.2-2.4 6.9-4.4 10.8-5.6 2.3-.7 6.6-1.9 8.3 .5 .8 1 .9 2.3 1.2 3.5 1.3 .9 5.2 2.4 5.9 3 .3 .3 .2 .6 .4 .8 .5 .5 1.3 .8 1.9 1.1-.6 .7-1.3 1.5-2.2 2-1.4 .7-3.2 .9-4.7 1.3-2.4 .7-4.7 1.7-6.9 2.9-8.4 4.3-15 11.8-24.6 13.8l-23.8 5.1c-8.1 1.7-16.1 4.3-23.9 7-3 1-6.1 2.6-9.1 3.2-1.7 .3-3.4 .1-5 0-4.8-.2-9.6-.5-14.4-1-8.6-.9-14.7-1.5-21.1-7.9 .3-.8 .6-1.7 .7-2.6 .1-1.4-.5-2.9-.8-4.3-.4-2.8-.8-5.8-.6-8.7 .3-8.5 3.1-15.3 5.7-23.3 .8-2.7 .8-5.2 1.2-8 0-.1 .1-1 .3-1.1 .1 0 .4 .1 .5 0 0-1 0-2 0-3 2.5 2.5 4.7 5.5 7.4 7.7 10.5 8.7 25.7 12.1 37.5 3.8 3.1-2.1 5.2-5.2 7.4-8.1l-3.6-3.7c.6-.3 1.3-.3 2-.7 .1-6.8 5.3-17.5 13.3-17.1 3.9 .3 7.2 3.2 10.2 5.4 2.1 1.5 4.6 2.8 5.8 5.1Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M59.1 19.6c1.7 4.7 2.9 6 7.6 7.7-4.7 1.8-5.9 2.9-7.6 7.7-1.7-4.8-2.9-6-7.7-7.7 4.7-1.7 6-3 7.7-7.7ZM88.3 25.3c2.6 8.3 4.8 10.6 13.3 13.2-8.6 2.3-10.8 4.8-13.3 13.3-2.5-8.5-4.8-10.8-13.3-13.4 8.6-2.5 10.5-4.8 13.3-13.1ZM111.9 45.6c1.7 4.7 2.7 6 7.6 7.8-4.6 1.6-5.9 2.8-7.6 7.5-1.8-4.6-2.9-5.8-7.5-7.5 4.7-1.8 5.9-3 7.5-7.8ZM189.8 128.5c.3 .6 .4 1.3 .6 2.1 .2 .1 .5 0 .7 .1 1.2 .4 2 4.4 2.2 5.5 .9 5.7-.3 12.9-5 16.7-5.5 4.4-22.5 4.3-29.6 4.4l-23.3 .2c-9.6 0-19.3-.2-28.9-.1l-60.2 .2-25.5-.1c-3.1 0-7.1-.5-9.7-2.5-6.5-5.1-4.7-17.9-2.3-24.6 1.1 1.4 2.1 2.7 3.6 3.6 6.9 4.6 19.8 4.9 28 5.3 3.3 .1 6.9 .6 10.2 .2 3.1-.4 6.6-3 9.7-3l26.4 .3 30.5 .1 22.7-.4c13.6-.2 37.9-1.8 49.9-8Z\" fill=\"var(--art-sun,#F7BE45)\" fill-rule=\"evenodd\"/>\n<path d=\"M158.6 110.7c.1 0-.3 0-.4-.1-.1 0 .3 .1 .5 .1 .4 .1 .8 .1 1.2 .2-1 .9-1.9 2.1-3.1 2.9-2.6 1.9-5.6 3.2-7.9 5.5-5.5 5.2-8.7 12.8-10.7 19.9l-3.2 0c-.3 .4-.6 .7-.9 1l-30 .2-25-.2-28.4-.6c-.5 0-1.1-.1-1.7-.1 10.5-4 21.3-7.8 32.3-10.2l24-5.1c12.2-2.6 20.2-13.4 32-16.8 1.6-.5 3.2-1 4.9-1 2.5-.2 6 1.4 8.6 2 2.7 .6 5.3 .9 7.8 2.3Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M66.5 81.5c.4 .3 .7 .8 1.1 1.2 2.8-1.1 5.3-1.9 8.3-2-5 5.4-8.6 11.9-14.4 16.4-10.9 8.5-25.6 6.6-36.3-1-2.8-2-10-8-10.6-11.3-.2-1.5 .2-3.3 .5-4.9 1.5-6.5 6.4-11.2 13.4-10.7 5 .4 9.4 2.9 13.8 5.3 7.8 4.4 15 7.6 24.2 7ZM29.4 74.3c1.3 3.5 2.8 7.2 5.4 10 4.2 4.5 11.4 6 17.3 4.4 2.1-.6 4.1-1.6 6.2-2.6-3.6-1-7.1-1.9-10.4-3.6-6.1-3-11.6-6.8-18.5-8.2Z\" fill=\"var(--art-clay,#E8743B)\" fill-rule=\"evenodd\"/>\n<path d=\"M66.7 83.2c-11.3 9.9-24 14.8-35.1 1.4-2-2.4-6.1-8.2-5.3-11.5 1-3.8 6.9-1.5 9.3-.5 4.2 1.8 8 4.3 12.1 6.3 6.5 3.4 11.8 4 19 4.3Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M106.1 82.8c-1.1-.7-2.3-1.5-3.6-1.8-5-1.2-11.5 3.1-15.2 6.2-1.2 1.1-2.2 2.6-3.6 3.4-2.1 1.1-4.8 .2-5.3-2.3-.5-3.3 3.8-6.2 6-7.9 7.1-5.5 19.7-10.7 21.7 2.4ZM121.2 93c-1.2-.7-2.4-1.6-3.7-1.9-5.3-1.1-12.6 3.3-16.5 6.4-1.4 1.1-2.5 2.6-4 3.4-2.1 1.1-4.8 .1-5.3-2.4-.5-3.3 4.2-6.1 6.5-7.7 7.1-5.1 21-11.2 23 2.2ZM136.9 103.3c-1.3-.7-2.6-1.6-4.1-1.9-5.4-1-12.9 3.3-17.1 6.4-1.5 1.1-2.8 2.7-4.4 3.6-2.1 1.1-4.9 .3-5.4-2.2-.6-3.4 5-6.9 7.5-8.5 5.5-3.6 17.5-9.7 22.2-1.6 .7 1.3 .9 2.8 1.3 4.2ZM191.3 130.6c-4.9 4-11.7 5.2-17.8 6.2-12.8 2.3-26 3.3-39 3.3 2.7-10.3 8.1-19.8 16.7-26.3 1.8-1.3 3.9-2.8 6-3.5 2.7-1 7.9 .4 10.7 1 11 2.7 20.3 7.7 23.4 19.3Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "530120b236";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 9) throw new Error("new: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const path = (d, t, extra = "") => `<path d="${d}"${extra} ${fill(t)}/>`;
// the sole and the three sparkles are one path in the still: its four parts, apart (each its own, starting with an absolute move)
const SUN_D = EL[4].match(/ d="([^"]+)"/)[1].split(/(?=M)/);
if (SUN_D.length !== 4) throw new Error("new: its sole and sparkles aren't as this story knows them");
const SPARKLES = SUN_D.slice(0, 3), SOLE = path(SUN_D[3], "sun");
const SPARK_AT = [[59.1, 27.3], [88.3, 38.5], [111.9, 53.3]]; // each sparkle's middle, where it shrinks to
const UPPER = EL[3], REST = EL.slice(5).join("");
const shoe = (spark) => `${UPPER}${SOLE}${SPARKLES.map((d, i) => sparkle(d, i, spark[i])).join("")}${REST}`;
function sparkle(d, i, k) {
  if (k >= 1) return path(d, "sun");
  if (k <= 0) return "";
  const [x, y] = SPARK_AT[i];
  return `<g transform="translate(${x} ${y}) scale(${n4(k)}) translate(${-x} ${-y})">${path(d, "sun")}</g>`;
}
// the room past the frame: the wall, the floor (its back edge at y 149.2), and the shoe's shadow, the still's own carried on along its two edges
// to a rounded end, the shadow of the shoe's top
const WALL = `<rect x="-400" y="-400" width="1100" height="549.2" ${fill("teal")}/>`;
const FLOOR = `<rect x="-400" y="149.2" width="1100" height="600" ${fill("teal-lit")}/>`;
const SHADOW_D = "M186.9 150.4c.7 .7 1.2 1.3 1.8 2.1-.5 .5-1.1 .9-1.6 1.4L292 190.5C312 198 300 236 272 238L200 231.6L128.7 203.4l-114-45.1c-2.1-.9-3.6-3-4.8-4.8 .5-.5 1-1.1 1.6-1.5 3 1.1 6 2 9.3 2l26 0 53.5-.1 21.4 0 20.1 0c12.2 0 34.3 1 45.1-3.5Z";
const SHOE_SHADOW = path(SHADOW_D, "teal-deep");
function view(z, fx, fy, inner) {
  const cam = z === 1 && fx === 100 && fy === 100 ? "" : `translate(100 100) scale(${n4(z)}) translate(${n2(-fx)} ${n2(-fy)})`;
  return `${OPEN}${cam ? `<g transform="${cam}">${inner}</g>` : inner}</svg>`;
}
// the camera: drawn back to show the floor beside the shoe, to its right
const Z = 0.56, FX = 183, FY = 130, T_CAM = [0.15, 1.15];
const camAt = (t) => { const s = track([[T_CAM[0], 0], [T_CAM[1], 1, "io"]], t); return [1 + (Z - 1) * s, 100 + (FX - 100) * s, 100 + (FY - 100) * s]; };

// ---- happy: the shoebox (a 28 cm shoe is 187 units here, so the box is 110 wide at its end, 62 tall), standing on its lid, open, the tissue
// it was wrapped in spilling out over the rim; the box's own shadow down and to the right, by the room's light
const BX = 222, BY = 158, BW = 112, BH = 62, DX = 20, DY = -13; // its front's foot, size, and how its depth goes back
const BOX = (() => {
  const L = BX, R = BX + BW, T = BY - BH;
  const lid = path(`M${L - 4} ${BY - 5}H${R + 4}L${R + 4 + DX} ${BY - 5 + DY}V${BY + 2 + DY}L${R + 4} ${BY + 3}H${L - 4}Z`, "bark");
  const front = path(`M${L} ${T}H${R}V${BY - 4}H${L}Z`, "wood"), side = path(`M${R} ${T}L${R + DX} ${T + DY}V${BY - 4 + DY}L${R} ${BY - 4}Z`, "wood-deep");
  // the open top: the rim's far walls inside, dark, and the tissue rising out of it
  const inside = path(`M${L + 2.5} ${T}L${L + DX + 1} ${T + DY + 1}H${R + DX - 2}L${R - 2} ${T}Z`, "bark-deep");
  const tissue = [
    blob([[L + 14, T + 2], [L + 22, T - 14], [L + 38, T - 18], [L + 52, T - 9], [L + 50, T + 2]]),
    blob([[L + 44, T + 2], [L + 58, T - 22], [L + 76, T - 26], [L + 92, T - 12], [L + 96, T + 2]]),
    blob([[L + 76, T + 2], [L + 90, T - 15], [L + 106, T - 13], [L + 112, T + 1]]),
  ];
  const folds = [`M${L + 30} ${T - 12}Q${L + 36} ${T - 6} ${L + 33} ${T + 1}L${L + 31} ${T + 1}Q${L + 33} ${T - 6} ${L + 28} ${T - 11}Z`, `M${L + 70} ${T - 20}Q${L + 78} ${T - 10} ${L + 74} ${T + 1}L${L + 71.5} ${T + 1}Q${L + 75} ${T - 10} ${L + 68} ${T - 19}Z`];
  const shadow = path(`M${R + DX} ${BY + 2 + DY}L${R + DX + 64} ${BY + 26 + DY}L${R + 40} ${BY + 34}L${L + 6} ${BY + 3}Z`, "teal-deep");
  return { shadow, box: `${lid}${inside}${tissue.map((d) => path(d, "paper")).join("")}${folds.map((d) => path(d, "paper-deep")).join("")}${front}${side}` };
})();
const HAPPY_DUR = T_CAM[1] + 0.8;
function happy(t) {
  if (t <= 0) return STILL;
  const [z, fx, fy] = camAt(t);
  return view(z, fx, fy, `${WALL}${FLOOR}${SHOE_SHADOW}${BOX.shadow}${shoe([1, 1, 1])}${BOX.box}`);
}

const LIP = 240;
// ---- sad: the can, a litre's (11 cm), lying on its side, its open end to the shoe; its lid on the floor beyond it; and the paint, which has
// been coming out of it all along: a pool on the floor (foreshortened as the floor is), its front lobes creeping on at a slow paint's pace,
// 22 units a second and slowing, to the toe and round the sole's foot. Where it lies in the shoe's shadow it's a shade deeper.
const CAN = (() => {
  const L = LIP, R = LIP + 74, T = 102, B = 164, M = (T + B) / 2;
  const body = path(`M${L} ${T}H${R}V${B}H${L}Z`, "steel") + path(`M${L} ${M + 14}H${R}V${B}H${L}Z`, "steel-deep") + path(`M${L + 22} ${T}H${L + 52}V${B}H${L + 22}Z`, "violet") + path(`M${L + 22} ${M + 14}H${L + 52}V${B}H${L + 22}Z`, "violet-deep");
  const base = `<ellipse cx="${R}" cy="${M}" rx="8" ry="${(B - T) / 2}" ${fill("steel-deep")}/>`;
  // its open end: the rim, the dark inside, and the paint lying in its lowest part, spilling over the lip
  const mouth = `<ellipse cx="${L}" cy="${M}" rx="8.5" ry="${(B - T) / 2}" ${fill("steel")}/><ellipse cx="${L}" cy="${M}" rx="6.5" ry="${(B - T) / 2 - 2.5}" ${fill("ink")}/>` + path(`M${L - 6} ${M + 16}Q${L} ${M + 24} ${L + 6} ${M + 16}L${L + 6.4} ${M + 22}Q${L} ${B} ${L - 6.6} ${M + 22}Z`, "violet");
  const lid = `<ellipse cx="${R + 22}" cy="178" rx="17" ry="4.6" ${fill("steel-deep")}/><ellipse cx="${R + 22}" cy="176.6" rx="17" ry="4.6" ${fill("steel")}/>`;
  const shadow = path(`M${R + 4} ${B - 4}L${R + 62} ${B + 20}L${R + 40} ${B + 28}L${L} ${B + 1}Z`, "teal-deep");
  return { shadow, can: `${body}${base}${mouth}`, lid };
})();
// the pool: a small spill at the can's lip when the camera finds it, spreading at a slow paint's pace (about 50 units a second at first, slowing
// as it spreads) along the floor towards the shoe, 90 out by the end, and widening towards us as it goes, up to 26 deep at its widest
// (foreshortened as the floor is); its far edge runs along the floor's line under the shoe's foot. It reaches the sole's toe (x 192) after the
// camera has drawn back, and runs on along the front of the sole.
const T_SPILL = 0.5, FLOW = 2.8, SPREAD = 90, SMALL = 8;
const reachAt = (t) => { const u = Math.max(0, Math.min(1, (t - T_SPILL) / FLOW)); return LIP - SMALL - (SPREAD - SMALL) * (1 - (1 - u) ** 2); };
function pool(t) {
  const x = reachAt(t), w = LIP - x, deep = 26 * Math.min(1, w / 70) + 3;
  const pts = [[LIP + 3, 158.5], [LIP + 5, 163]];
  const n = 9;
  for (let i = 1; i <= n; i++) {
    const u = i / n, px = LIP + 4 - w * u;
    // lobes along the near edge, a little different each, as thick paint runs
    const lobe = Math.sin(u * 11.7 + 0.6) * 1.8 + Math.sin(u * 23.1) * 0.8;
    pts.push([px, 163 + deep * Math.sin(Math.PI * Math.min(1, u * 1.05)) ** 0.7 * (1 - 0.35 * u) + lobe * Math.min(1, w / 40)]);
  }
  pts.push([x - 1.5, 160.5], [x + 2, 157.2]);
  for (let i = n; i >= 1; i--) { const u = i / n; pts.push([LIP + 4 - w * u, 156.4 + 0.5 * Math.sin(u * 7)]); }
  return blob(pts);
}
const T_SOLE = T_SPILL + FLOW * (1 - Math.sqrt(1 - (LIP - 192 - SMALL) / (SPREAD - SMALL))); // it reaches the toe
const SAD_DUR = T_SPILL + FLOW + 0.6;
function sad(t) {
  if (t <= 0) return STILL;
  const [z, fx, fy] = camAt(t);
  const d = pool(t);
  const wet = `<clipPath id="sh"><path d="${SHADOW_D}"/></clipPath>${path(d, "violet")}<g clip-path="url(#sh)">${path(d, "violet-deep")}</g>`;
  // the sparkles go out as the paint reaches the sole, one by one, from the toe's end
  const spark = [2, 1, 0].reduce((a, i, k) => { a[i] = 1 - track([[T_SOLE + 0.15 * k, 0], [T_SOLE + 0.15 * k + 0.25, 1, "in"]], t); return a; }, [1, 1, 1]);
  return view(z, fx, fy, `${WALL}${FLOOR}${SHOE_SHADOW}${CAN.shadow}${CAN.lid}${wet}${shoe(spark)}${CAN.can}`);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
