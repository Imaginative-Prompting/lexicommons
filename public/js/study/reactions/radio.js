// Radio's story, its sad alone (the happy, the antenna folded down across the top, only takes it away: the player keeps the still for it): the
// antenna leans in a worn socket, and the leverage splits it. A crack runs across the socket, the antenna gives a little more, then goes, toppling over
// to the right, faster and faster, and comes down across the radio's top with a clatter: a bounce, and it lies there, the radio without its aerial up.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the table, the shadow, the antenna (its shade and its lit side,
// from its foot at (52, 97) up to (78, 25): 74 long, leaning 20 degrees right), the cabinet's back and top, the socket (shade and lit), the front, the
// speaker and its five bars, the two knobs. The radio (40 cm) is 118 across: 295 to the meter.
import { n2, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect y=\"150\" width=\"200\" height=\"50\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M40 172L162 165L200 176V200H158Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M50.3 96.4L76.3 25.4A1.8 1.8 0 0 1 79.7 26.6L53.7 97.6Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M50.3 96.4L76.3 25.4A1.8 1.8 0 0 1 79.1 24.6L52.6 97.2Z\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"48\" y=\"94\" width=\"118\" height=\"76\" rx=\"13\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M40.4 100.8L56.4 94.8Q58.5 94 61 94L153 94L137 100L137 103L40 103Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><rect x=\"45\" y=\"94.5\" width=\"12\" height=\"5.5\" rx=\"2\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><rect x=\"45\" y=\"94.5\" width=\"8.5\" height=\"5.5\" rx=\"2\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"32\" y=\"100\" width=\"118\" height=\"76\" rx=\"13\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"40\" y=\"108\" width=\"64\" height=\"60\" rx=\"9\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"45.5\" y=\"115\" width=\"7\" height=\"46\" rx=\"3.5\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M50 115.2A3.5 3.5 0 0 1 52.5 118.5V157.5A3.5 3.5 0 0 1 50 160.8Z\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"57\" y=\"115\" width=\"7\" height=\"46\" rx=\"3.5\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M61.5 115.2A3.5 3.5 0 0 1 64 118.5V157.5A3.5 3.5 0 0 1 61.5 160.8Z\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"68.5\" y=\"115\" width=\"7\" height=\"46\" rx=\"3.5\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M73 115.2A3.5 3.5 0 0 1 75.5 118.5V157.5A3.5 3.5 0 0 1 73 160.8Z\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"80\" y=\"115\" width=\"7\" height=\"46\" rx=\"3.5\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M84.5 115.2A3.5 3.5 0 0 1 87 118.5V157.5A3.5 3.5 0 0 1 84.5 160.8Z\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"91.5\" y=\"115\" width=\"7\" height=\"46\" rx=\"3.5\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M96 115.2A3.5 3.5 0 0 1 98.5 118.5V157.5A3.5 3.5 0 0 1 96 160.8Z\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"127.5\" cy=\"124\" r=\"11\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M127.5 113A11 11 0 0 1 127.5 135A6.5 11 0 0 0 127.5 113Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><circle cx=\"127.5\" cy=\"152\" r=\"11\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M127.5 141A11 11 0 0 1 127.5 163A6.5 11 0 0 0 127.5 141Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/></svg>\n";
export const STILL_HASH = "cd49e836ce";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 25 || !EL[4].includes("M50.3 96.4L76.3 25.4")) throw new Error("radio: the still isn't as this story knows it");
const BACK = EL.slice(0, 3).join("") + EL[5] + EL[6], ANTENNA = EL[3] + EL[4], SOCKET = EL[7] + EL[8], FRONT = EL.slice(9).join("");
const FOOT = [52, 97], LEAN0 = 20.1, FLAT = 87.5;
// the topple: a rod pivoting on its foot (gravity at its scale: 2890), from where the split leaves it, to lying on the radio's top
const K = (3 * 2890) / (2 * 74), T_SPLIT = 0.62;
const OVER = (() => { const S = []; let a = ((LEAN0 + 2) * Math.PI) / 180, w = 0; while (a < (FLAT * Math.PI) / 180) { S.push(a); w += (K * Math.sin(a)) / 2000; a += w / 2000; } S.push((FLAT * Math.PI) / 180); return S; })();
const T_DOWN = T_SPLIT + (OVER.length - 1) / 2000;

// ---- sad: it comes down
const SAD_DUR = 2.2;
function sad(t) {
  if (t <= 0.25) return STILL;
  // the socket gives: it leans two degrees more, slowly, as the crack opens; then the antenna goes over
  let lean = LEAN0 + track([[0.25, 0], [T_SPLIT, 2, "in"]], t);
  if (t > T_SPLIT) lean = (OVER[Math.min(OVER.length - 1, Math.round((t - T_SPLIT) * 2000))] * 180) / Math.PI;
  // (landing across the top: it bounces up off it once and lies there)
  if (t > T_DOWN) lean = FLAT - track([[T_DOWN, 0], [T_DOWN + 0.07, 4, "out"], [T_DOWN + 0.15, 0, "in"], [T_DOWN + 0.2, 1, "out"], [T_DOWN + 0.25, 0, "in"]], t);
  const antenna = `<g transform="rotate(${n2(lean - LEAN0)} ${FOOT[0]} ${FOOT[1]})">${ANTENNA}</g>`;
  // the crack across the socket, opening from its right edge
  const crack = track([[0.3, 0], [T_SPLIT, 1, "out"]], t);
  const split = crack > 0.02 ? `<path d="M${n2(57 - 12 * crack)} 97.6L${n2(57 - 9 * crack)} 96.8L${n2(57 - 5 * crack)} 98L57 97.2V98.2L${n2(57 - 5 * crack)} 99L${n2(57 - 9 * crack)} 97.8L${n2(57 - 12 * crack)} 98.4Z" fill="var(--art-ink,#231F3B)"/>` : "";
  return `${OPEN}${BACK}${antenna}${SOCKET}${split}${FRONT}</svg>`;
}

export const REACTIONS = { sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
