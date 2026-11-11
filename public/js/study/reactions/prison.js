// Prison's two stories, the window's own: the old mortar round the second bar's foot crumbles, and the bar sinks until its top drops clear of its socket.
// Happy: it tips forward out of the row and falls, flat onto the sill: the gap where it stood is wide and clear. Sad: it leans forward and its top
// swings across in front of the others, wedging against the right jamb: still there, crooked, still barring the way.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall's courses, the sill's shadow, the sky in the window and its cloud,
// the four bars (5 wide, y 65-123, their ends set into the window's top and floor), the window's deep reveals (top and left dark, right lit), its
// frame, its floor and sill. The opening between the reveals: x 74-126, y 68-120. The window is 0.8 m wide: 67 to the meter.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-ground,#D3CAB5)\"/><rect x=\"0\" y=\"21\" width=\"200\" height=\"2\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"0\" y=\"57\" width=\"200\" height=\"2\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"0\" y=\"93\" width=\"200\" height=\"2\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"0\" y=\"129\" width=\"200\" height=\"2\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"0\" y=\"165\" width=\"200\" height=\"2\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"39\" y=\"0\" width=\"2\" height=\"22\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"103\" y=\"0\" width=\"2\" height=\"22\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"167\" y=\"0\" width=\"2\" height=\"22\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"7\" y=\"22\" width=\"2\" height=\"36\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"71\" y=\"22\" width=\"2\" height=\"36\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"135\" y=\"22\" width=\"2\" height=\"36\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"39\" y=\"58\" width=\"2\" height=\"36\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"167\" y=\"58\" width=\"2\" height=\"36\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"7\" y=\"94\" width=\"2\" height=\"36\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"39\" y=\"130\" width=\"2\" height=\"36\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"103\" y=\"130\" width=\"2\" height=\"36\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"167\" y=\"130\" width=\"2\" height=\"36\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"7\" y=\"166\" width=\"2\" height=\"34\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"71\" y=\"166\" width=\"2\" height=\"34\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"135\" y=\"166\" width=\"2\" height=\"34\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"46,145 154,145 157,150 49,150\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><rect x=\"73\" y=\"67\" width=\"54\" height=\"54\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><circle cx=\"87\" cy=\"88\" r=\"4\" fill=\"var(--art-sky-pale,#C9E7F9)\"/><circle cx=\"95\" cy=\"85.5\" r=\"6\" fill=\"var(--art-sky-pale,#C9E7F9)\"/><circle cx=\"102\" cy=\"88.5\" r=\"3.5\" fill=\"var(--art-sky-pale,#C9E7F9)\"/><rect x=\"87\" y=\"87\" width=\"15\" height=\"5\" fill=\"var(--art-sky-pale,#C9E7F9)\"/><rect x=\"81.9\" y=\"65\" width=\"5\" height=\"58\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"92.3\" y=\"65\" width=\"5\" height=\"58\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"102.7\" y=\"65\" width=\"5\" height=\"58\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"113.1\" y=\"65\" width=\"5\" height=\"58\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"139,55 139,133 126,120 126,67\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"61,55 139,55 126,68 74,68 74,120 61,133\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M54 133V48H146V133H138V56H62V133Z\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><polygon points=\"74,120 126,120 138,132 150,132 154,138 46,138 50,132 62,132\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"46\" y=\"138\" width=\"108\" height=\"8\" fill=\"var(--art-paper-mid,#EDE6D5)\"/></svg>\n";
export const STILL_HASH = "5fca0a0444";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 36 || !EL[28].includes('x="92.3"')) throw new Error("prison: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BACK = EL.slice(0, 28).join(""), OTHERS = EL[29] + EL[30], FRONT = EL.slice(31).join("");
const FOOT = [94.8, 123], L = 58, K = 0.3, SINK = 3;
// the bar, sunk s, tipped f forward toward us (degrees; its top coming down past its foot as seen) and leaned l across the window (degrees, about its
// foot), seen only where the window shows it: within the opening, and onto the floor and sill once it's down
function bar(s, f, l, floor = 0) {
  const fr = (f * Math.PI) / 180, k = Math.cos(fr) - K * Math.sin(fr);
  const clip = `<clipPath id="wb"><rect x="74" y="68" width="52" height="${n2(52 + 26 * floor)}"/></clipPath>`;
  const tr = `translate(${FOOT[0]} ${n2(FOOT[1] + s)}) rotate(${n2(l)}) scale(1 ${n4(k)}) translate(${-FOOT[0]} ${-FOOT[1]})`;
  return `${clip}<g clip-path="url(#wb)"><rect x="92.3" y="65" width="5" height="58" ${fill("ink")} transform="${tr}"/></g>`;
}
// the crumbled mortar: a few chips dropping from the bar's top socket down past it onto the floor of the window, and lying there
const CHIPS = [[93.5, 1.6, 0.5], [97.2, 1.2, 0.58], [95.6, 1.8, 0.66]];
const chips = (t) => CHIPS.map(([x, r, t0]) => { const s = t - t0; if (s <= 0) return ""; const y = Math.min(121.5, 68 + 0.5 * 660 * s * s); return `<rect x="${n2(x)}" y="${n2(y)}" width="${r}" height="${r}" ${fill("paper-deeper")}/>`; }).join("");
const sunk = (t) => track([[0.3, 0], [0.62, SINK, "in"]], t);

// ---- happy: it falls out
const HAPPY_DUR = 2.4, T_TIP = 0.66;
// the topple from its sunk foot: a 0.9 m bar going over (3g/2L sin a), worked out once in small steps
const FALL = (() => { const S = [[0, 0.03]]; let a = 0.03, w = 0.1, s = 0; while (a < Math.PI / 2) { w += 16.9 * Math.sin(a) / 4000; a += w / 4000; s += 1 / 4000; S.push([s, Math.min(a, Math.PI / 2)]); } return S; })();
const T_FALL = FALL[FALL.length - 1][0];
function happy(t) {
  if (t <= 0) return STILL;
  const s = t - T_TIP;
  let f = 0;
  if (s > 0) f = s < T_FALL ? (FALL[Math.min(FALL.length - 1, Math.floor(s * 4000))][1] * 180) / Math.PI : 90 - (s - T_FALL < 0.12 ? 5 * Math.sin((Math.PI * (s - T_FALL)) / 0.12) : 0);
  // (once it's past half way down it's out on the floor and sill, in front of the window's reveals)
  const down = Math.min(1, Math.max(0, (f - 30) / 50));
  const b = bar(sunk(t), f, 0, down);
  return down > 0 ? `${OPEN}${BACK}${OTHERS}${FRONT}${chips(t)}${b}</svg>` : `${OPEN}${BACK}${b}${OTHERS}${FRONT}${chips(t)}</svg>`;
}

// ---- sad: it wedges crooked
const SAD_DUR = 2.4;
function sad(t) {
  if (t <= 0) return STILL;
  // it leans out a little and its top swings across, in front of the others, faster, till it fetches up against the right jamb, and stays
  const f = track([[T_TIP, 0], [0.9, 14, "in"]], t), l = track([[T_TIP, 0], [1.22, 31, "in"], [1.3, 29.5, "out"], [1.38, 30.6, "in"], [1.46, 30.2, "io"]], t);
  return `${OPEN}${BACK}${OTHERS}${bar(sunk(t), f, l)}${FRONT}${chips(t)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
