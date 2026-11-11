// Calm's two stories, the top stone's weight's: it sits a little right of its seat, and it tips. Happy: it rocks on the stone below, back and forth in
// smaller and smaller swings, and comes to rest, still, on a flatter face of itself, a little lower: settled. Sad: it tips too far, rolls off its seat
// and tumbles down the stack's right shoulders, hop by hop, into the water beside it, where it lies half under; the water rings out from it and stills.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the water (from y 167, two white strokes on it), the stack's shadow,
// the five stones from the broad base up (each its shade, then its lit side), the top one about (82.5, 41.2), 18.7 by 11.4, on the next at y 52.6.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"167\" width=\"200\" height=\"33\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"18,167.5 152,167.5 200,190 200,200 104,200\" fill=\"var(--art-teal-deep,#25907B)\"/><rect x=\"4\" y=\"175\" width=\"24\" height=\"1.2\" rx=\"0.6\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"172\" y=\"172\" width=\"22\" height=\"1.2\" rx=\"0.6\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M18 168C13.5 168 13.5 163.5 17 160.5C27 152 45 148.5 70 147.5L112 146.8C134 146.6 148 153 153 161C155.5 165 153.5 168 148 168Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M18 168C13.5 168 13.5 163.5 17 160.5C27 152 45 148.5 70 147.5L118 146.9C127 152 129 162 121 168Z\" fill=\"var(--art-paper,#FBF7EC)\"/><ellipse cx=\"79.2\" cy=\"130.5\" rx=\"51.6\" ry=\"23.5\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M46 148.5A51.6 23.5 0 1 1 115.7 113.9C120.86 124.01 108.1 142.96 46 148.5Z\" fill=\"var(--art-paper,#FBF7EC)\"/><ellipse cx=\"78.5\" cy=\"94\" rx=\"39.5\" ry=\"18\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M53.1 107.8A39.5 18 0 1 1 106.4 81.3C110.35 89.04 100.62 103.54 53.1 107.8Z\" fill=\"var(--art-paper,#FBF7EC)\"/><ellipse cx=\"78.7\" cy=\"65.4\" rx=\"28.7\" ry=\"14\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M60.2 76.1A28.7 14 0 1 1 99 55.5C101.87 61.52 94.77 72.82 60.2 76.1Z\" fill=\"var(--art-paper,#FBF7EC)\"/><ellipse cx=\"82.5\" cy=\"41.2\" rx=\"18.7\" ry=\"11.4\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M70.5 49.9A18.7 11.4 0 1 1 95.7 33.1C97.57 38.0 92.97 47.24 70.5 49.9Z\" fill=\"var(--art-paper,#FBF7EC)\"/></svg>\n";
export const STILL_HASH = "2565faf320";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 15 || !EL[13].includes('cx="82.5"')) throw new Error("calm: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BELOW = EL.slice(0, 13).join(""), TOP = EL[13] + EL[14], SEAT = [82.5, 52.6];

// the top stone rocking on its seat: turned a (degrees) about where it touches, rolling along by its curve as it turns
const rocked = (a, dx = 0, dy = 0) => `<g transform="translate(${n2(dx + a * 0.17)} ${n2(dy)}) rotate(${n2(a)} ${SEAT[0]} ${SEAT[1]})">${TOP}</g>`;

// ---- happy: it settles
const HAPPY_DUR = 2.6, END_A = -11, END_DX = -2.5, END_DY = 1.6;
function happy(t) {
  if (t <= 0) return STILL;
  // tipping right from rest, then rocking: each swing smaller (the stones' grip takes it), about where it comes to rest, a flatter face down
  const s = Math.max(0, t - 0.3), w = (2 * Math.PI) / 0.5, k = 1 - Math.exp(-2.6 * s);
  const a = s === 0 ? 0 : END_A * k + 16 * Math.exp(-2.9 * s) * Math.sin(w * s);
  return `${OPEN}${BELOW}${rocked(a, END_DX * k, END_DY * k)}</svg>`;
}

// ---- sad: it tumbles into the water
const SAD_DUR = 2.6, IN_WATER = 1.36;
// where its middle goes (it starts at the still's), hop by hop down the right shoulders: off its seat, onto the third stone's shoulder, the second's,
// the base's slope, and into the water; each drop falling (in), each bounce off a shoulder thrown out (out); its turn as it goes
const PATH = [[0.4, 0, 0], [0.62, 12, 6, "in"], [0.82, 30, 44, "in"], [0.96, 40, 70, "in"], [1.1, 54, 100, "in"], [1.24, 72, 118, "in"], [IN_WATER, 92, 135, "in"]];
const TURN = [[0.4, 0], [0.62, 40, "in"], [IN_WATER, 330, "lin"], [IN_WATER + 0.25, 352, "out"]];
const at = (t) => [track(PATH.map(([u, x]) => [u, x]).map((p, i) => (i ? [...p, PATH[i][3]] : p)), t), track(PATH.map(([u, , y], i) => (i ? [u, y, PATH[i][3]] : [u, y])), t)];
function sad(t) {
  if (t <= 0) return STILL;
  const [dx, dy] = at(t), a = track(TURN, t), c = [82.5 + dx, 41.2 + dy];
  let stone = `<g transform="translate(${n2(dx)} ${n2(dy)}) rotate(${n2(a)} 82.5 41.2)">${TOP}</g>`;
  let rings = "";
  if (t > IN_WATER) {
    // in the water: it sinks a little and rides there, half under; the water closes over its lower half (the water's own color over it)
    const r = t - IN_WATER, sink = track([[0, 0], [0.3, 5, "out"], [0.6, 4, "io"]], r);
    stone = `<clipPath id="wl"><rect x="0" y="0" width="200" height="${n2(c[1] + 1 + sink * 0.4)}"/></clipPath><g clip-path="url(#wl)"><g transform="translate(${n2(dx)} ${n2(dy + sink)}) rotate(${n2(a)} 82.5 41.2)">${TOP}</g></g>`;
    // the water rings out from it as short white strokes moving apart along the surface, slowing, and lying still (as the still's own do)
    const k = 1 - Math.exp(-3 * r), y = c[1] + 2;
    rings = [[-1, 0], [1, 0], [-1, 5], [1, 5]].map(([d, o]) => { const len = 4 + 10 * k - o * 0.6, x = c[0] + d * (14 + 16 * k + o * 1.4) - (d < 0 ? len : 0); return `<rect x="${n2(x)}" y="${n2(y + o)}" width="${n2(len)}" height="1.2" rx="0.6" ${fill("paper")}/>`; }).join("");
  }
  return `${OPEN}${BELOW}${stone}${rings}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
