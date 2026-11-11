// Bathroom's story, its sad alone (its happy needed a sponge hidden under water the still draws as opaque: the player keeps the still for it): the
// towel hangs doubled over the rail, its front side the longer. That side's weight draws it over the rail, slowly, then faster and faster (each bit it
// slides makes the front heavier still), its end dipping into the bath; then the back end comes over the rail and the whole towel drops into the
// water, and lies there bunched on it, soaking dark. The rail hangs empty.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor, the tiles and their joints, the rail and its ends, the
// towel (its back side, shaded, 140-158 across down to 94; its front side 121.7-150.5 across down to 98.6, both from the rail at 58), the shadow,
// the bath's feet, the bath (its side and shade, its rim, its water: an ellipse about 99.5, 115.4), the shower (its pipe, its head, its holes). The
// bath is drawn over the towel: whatever of the towel goes down into it is behind its rim and side. The bath (1.7 m) is 164 long: 96 to the meter,
// gravity 940.
import { blob, n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"150\" width=\"200\" height=\"50\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><rect x=\"9\" y=\"10\" width=\"162\" height=\"108\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><rect x=\"26.2\" y=\"10\" width=\"1.6\" height=\"108\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"44.2\" y=\"10\" width=\"1.6\" height=\"108\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"62.2\" y=\"10\" width=\"1.6\" height=\"108\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"80.2\" y=\"10\" width=\"1.6\" height=\"108\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"98.2\" y=\"10\" width=\"1.6\" height=\"108\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"116.2\" y=\"10\" width=\"1.6\" height=\"108\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"134.2\" y=\"10\" width=\"1.6\" height=\"108\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"152.2\" y=\"10\" width=\"1.6\" height=\"108\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"9\" y=\"27.2\" width=\"162\" height=\"1.6\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"9\" y=\"45.2\" width=\"162\" height=\"1.6\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"9\" y=\"63.2\" width=\"162\" height=\"1.6\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"9\" y=\"81.2\" width=\"162\" height=\"1.6\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"9\" y=\"99.2\" width=\"162\" height=\"1.6\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"109\" y=\"60.2\" width=\"56\" height=\"2.4\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"109\" cy=\"61.4\" r=\"3.4\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"165\" cy=\"61.4\" r=\"3.4\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M140 58H153C156 58 158 60 158 63V90C158 92.5 156 94 153.5 94H140Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M124.5 58H147.5Q150.5 58 150.5 61V95C150.5 97 149 98.6 147 98.6H125C123 98.6 121.7 97 121.7 95V61Q121.7 58 124.5 58Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M38 180L160 177L200 189V200H76Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M41 158H53C52 166 48 170 45 175C46 178 45 181 41 181C37.5 181 37 178 38.5 175C40.5 170 41.5 165 41 158Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M57 160H67C66.5 166 65 170 64 173C64.5 176 63 177.5 60.5 177.5C58 177.5 57.5 175.5 58.5 173C59 169 58 165 57 160Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M140 160H130C130.5 166 132 170 133 173C132.5 176 134 177.5 136.5 177.5C139 177.5 139.5 175.5 138.5 173C138 169 139 165 140 160Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M156 158H144C145 166 149 170 152 175C151 178 152 181 156 181C159.5 181 160 178 158.5 175C156.5 170 155.5 165 156 158Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M20 119C22 146 36 167 66 168H132C160 167 174 146 177 119Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M154 119C150 145 132 162 102 168H132C160 167 174 146 177 119Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><ellipse cx=\"99.5\" cy=\"115.9\" rx=\"82\" ry=\"8.5\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><ellipse cx=\"98\" cy=\"114.6\" rx=\"82\" ry=\"8.5\" fill=\"var(--art-paper,#FBF7EC)\"/><ellipse cx=\"99.5\" cy=\"115.4\" rx=\"70\" ry=\"5\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M22 114V58C22 36 38 24 54 24C68 24 77.5 32 78 42H72C71.5 35 64 30 54 30C42 30 28 40 28 58V114Z\" fill=\"var(--art-ink,#231F3B)\"/><ellipse cx=\"25\" cy=\"114.4\" rx=\"4.5\" ry=\"1.8\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M57 56C57 46 65 40 75.5 40C86 40 94 46 94 56Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M75.5 40C86 40 94 46 94 56H82C82 48 79.5 42 75.5 40Z\" fill=\"var(--art-ink,#231F3B)\"/><ellipse cx=\"75.5\" cy=\"56\" rx=\"18.5\" ry=\"4.5\" fill=\"var(--art-steel-deep,#6B687A)\"/><circle cx=\"68\" cy=\"54.8\" r=\"1.1\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"75.5\" cy=\"54.6\" r=\"1.1\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"83\" cy=\"54.8\" r=\"1.1\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"64\" cy=\"57.4\" r=\"1.1\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"71.5\" cy=\"57.8\" r=\"1.1\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"79.5\" cy=\"57.8\" r=\"1.1\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"87\" cy=\"57.4\" r=\"1.1\" fill=\"var(--art-ink,#231F3B)\"/></svg>";
export const STILL_HASH = "5444e8744f";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 43 || !EL[19].includes("M140 58H153") || !EL[20].includes("M124.5 58H147.5") || !EL[30].includes('cx="99.5" cy="115.4" rx="70" ry="5"')) throw new Error("bathroom: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const WALL = EL.slice(0, 19).join(""), BACK = EL[19], FRONT = EL[20], BATH = EL.slice(21, 31).join(""), SHOWER = EL.slice(31).join("");
const RAIL = 58, FRONT_LEN = 40.6, BACK_LEN = 36;

// ---- the slide: s, how far the towel has slid over the rail toward its front, faster and faster, until its back end comes over (36)
const T0 = 0.3, T_OFF = 1.3, K = Math.log(1 + BACK_LEN / 1.5) / (T_OFF - T0);
const slid = (t) => (t <= T0 ? 0 : Math.min(BACK_LEN, 1.5 * (Math.exp(K * (t - T0)) - 1)));
// ---- the drop: the whole towel, one long strip now from the rail down into the bath, falls (its top from the rail to the water, 56 below)
const T_WATER = T_OFF + Math.sqrt((2 * 56) / 940);
// ---- on the water: it bunches up floating there, and soaks dark
function floating(t) {
  const g = track([[T_OFF + 0.12, 0], [T_WATER + 0.12, 1, "out"]], t);
  if (g < 0.01) return "";
  const c = [138, 114.2], a = 21 * g, b = 3.8 * g, P = [];
  for (let i = 0; i < 10; i++) { const q = (i / 10) * 2 * Math.PI, w = 1 + 0.12 * Math.sin(3 * q + 0.6) + 0.07 * Math.sin(5 * q); P.push([c[0] + a * w * Math.cos(q), c[1] + b * w * Math.sin(q) - (Math.sin(q) < 0 ? 1.2 * g * Math.abs(Math.sin(2 * q)) : 0)]); }
  const folds = `<path d="M${n2(c[0] - 0.6 * a)} ${n2(c[1] - 0.2 * b)}Q${n2(c[0] - 0.2 * a)} ${n2(c[1] - 1.1 * b)} ${n2(c[0] + 0.15 * a)} ${n2(c[1] - 0.3 * b)}Q${n2(c[0] - 0.2 * a)} ${n2(c[1] - 0.5 * b)} ${n2(c[0] - 0.6 * a)} ${n2(c[1] - 0.2 * b)}Z" ${fill("clay-deep")}/><path d="M${n2(c[0] + 0.1 * a)} ${n2(c[1] + 0.3 * b)}Q${n2(c[0] + 0.45 * a)} ${n2(c[1] - 0.6 * b)} ${n2(c[0] + 0.75 * a)} ${n2(c[1])}Q${n2(c[0] + 0.45 * a)} ${n2(c[1] - 0.1 * b)} ${n2(c[0] + 0.1 * a)} ${n2(c[1] + 0.3 * b)}Z" ${fill("clay-deep")}/>`;
  const towel = `<path d="${blob(P)}" ${fill("clay")}/>${folds}`;
  const soak = track([[T_WATER, 0], [T_WATER + 1.1, 0.75, "io"]], t);
  return soak > 0.01 ? `${towel}<g opacity="${n4(soak)}"><path d="${blob(P)}" ${fill("clay-deeper")}/></g>` : towel;
}

// ---- sad: in the bath
const SAD_DUR = T_WATER + 1.4;
function sad(t) {
  if (t <= T0) return STILL;
  const s = slid(t);
  let towel;
  if (t <= T_OFF) {
    // the front side lengthening down over the rail's front, the back side shortening up behind it
    const back = s < BACK_LEN - 0.3 ? `<g transform="translate(0 ${RAIL}) scale(1 ${n4((BACK_LEN - s) / BACK_LEN)}) translate(0 ${-RAIL})">${BACK}</g>` : "";
    towel = `${back}<g transform="translate(0 ${RAIL}) scale(1 ${n4((FRONT_LEN + s) / FRONT_LEN)}) translate(0 ${-RAIL})">${FRONT}</g>`;
  } else {
    // off the rail: the strip falls straight down into the bath, behind its rim
    const f = Math.min(t, T_WATER + 0.2) - T_OFF, dy = 0.5 * 940 * f * f;
    towel = `<g transform="translate(0 ${n2(RAIL + dy)}) scale(1 ${n4((FRONT_LEN + BACK_LEN) / FRONT_LEN)}) translate(0 ${-RAIL})">${FRONT}</g>`;
  }
  // (what of it is down in the bath is under the water's surface: none of it shows below that)
  const wet = `<clipPath id="bw"><path d="M0 0H200V116H0Z"/></clipPath><g clip-path="url(#bw)">${towel}</g>`;
  return `${OPEN}${WALL}${t <= T_WATER + 0.2 ? wet : ""}${BATH}${floating(t)}${SHOWER}</svg>`;
}

export const REACTIONS = { sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
