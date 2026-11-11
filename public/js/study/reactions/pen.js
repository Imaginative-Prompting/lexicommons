// Pen's story, its sad alone (its stories with the pen rolling needed a slope the still doesn't have: the player keeps the still for it): the pen lies
// uncapped, its nib's tip resting on the table, and the ink wicks out of it where it touches: a dark blot wells up round the tip and spreads over the
// table, quickly at first, then slower, until it stands in a broad wet stain about the nib.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the table, the shadows of the pen and its cap, the nib (gold,
// lit and shaded, its slit and its hole, its tip at 42, 150 on the table), the grip, the barrel, and the cap lying beside it. The table, seen from
// above at a slant, shortens a spot on it to two fifths as deep as it is wide.
import { blob, n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"92\" width=\"200\" height=\"108\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M42,150Q52,153.5 60.5,151.5L70.8,148.8L94.6,142.9L156.6,120.3A7.5 4 70 0 0 151.4,106.3L89.4,128.9L66,141Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M110,149L112.7,156.3Q112.6,159.2 115.7,159.3L157.1,144.3A7.8 4 70 0 0 151.7,129.7L110,144Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M67.8,135.9L55.3,139.8Q48,143 42,150Q51,151.5 58.7,149.2L70.8,144.3Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M69.6,141L57.3,145.4L42,150Q51,151.5 58.7,149.2L70.8,144.3Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M59.7,143L60.1,144L45.8,148.6Z\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"59.9\" cy=\"143.5\" r=\"1.2\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M64.5,135.9L88.7,126.1L93.1,138.3L68.3,146.3A5.5 2 70 0 1 64.5,135.9Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M65,142.9L91.4,133.6L93.1,138.3L68.3,146.3A5.5 2 70 0 1 65,142.9Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M86.4,125.9L148.4,103.3A7.5 4 70 0 1 153.6,117.3L91.6,139.9A7.5 2.5 70 0 1 86.4,125.9Z\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M87.2,135.1L155.2,110.4A7.5 4 70 0 1 153.6,117.3L91.6,139.9A7.5 2.5 70 0 1 87.2,135.1Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M107.3,141.7L148.7,126.7A7.8 4 70 0 1 154.1,141.3L112.7,156.3Z\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M110.5,150.4L155.6,134.1A7.8 4 70 0 1 154.1,141.3L112.7,156.3Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M107.3,141.7A7.8 3.5 70 0 0 112.7,156.3A7.8 3.5 70 0 0 107.3,141.7Z\" fill=\"var(--art-violet-lit,#A68CFF)\"/><path d=\"M107.8,143A6.4 2.7 70 0 0 112.2,155A6.4 2.7 70 0 0 107.8,143Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M149,128.8L125,137.5A1.1 1.1 0 0 0 125.7,139.6L149.7,130.9Z\" fill=\"var(--art-sun,#F7BE45)\"/></svg>\n";
export const STILL_HASH = "5aa501cdf3";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 17 || !EL[4].includes("M67.8,135.9L55.3,139.8Q48,143 42,150") || !EL[2].includes("M42,150Q52,153.5")) throw new Error("pen: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const UNDER = EL.slice(0, 4).join(""), PEN = EL.slice(4).join("");
const TIP = [42, 150], FLAT = 0.4;
// the blot: lumpy all round (the ink running further along the table's grain one way than another), its middle drifting a little ahead of the tip
const LUMPS = Array.from({ length: 10 }, (_, i) => 1 + 0.09 * Math.sin(i * 1.9 + 0.4) + 0.05 * Math.sin(i * 3.3 + 1.3));
function stain(r) {
  if (r < 0.05) return "";
  const c = [TIP[0] - 0.35 * r, TIP[1] + 0.12 * r];
  const P = LUMPS.map((k, i) => { const a = (i / LUMPS.length) * 2 * Math.PI; return [c[0] + r * k * Math.cos(a), c[1] + FLAT * r * k * Math.sin(a)]; });
  const wet = LUMPS.map((k, i) => { const a = (i / LUMPS.length) * 2 * Math.PI; return [c[0] - 0.25 * r + 0.45 * r * k * Math.cos(a), c[1] - 0.12 * r + FLAT * 0.4 * r * k * Math.sin(a)]; });
  return `<path d="${blob(P)}" ${fill("ink")}/>${r > 2 ? `<path d="${blob(wet)}" ${fill("ink-lit")}/>` : ""}`;
}

// ---- sad: a blot
const SAD_DUR = 2.8;
function sad(t) {
  if (t <= 0.3) return STILL;
  const r = 17 * track([[0.3, 0], [2.4, 1, "out"]], t);
  return `${OPEN}${UNDER}${stain(r)}${PEN}</svg>`;
}

export const REACTIONS = { sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
