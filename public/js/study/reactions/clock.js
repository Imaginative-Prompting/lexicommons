// Clock's story, its sad alone (its happy, the hands sweeping round to a diagonal, meant nothing: the player keeps the still for it): the minute
// hand's nut has worked loose. Standing up at twelve, the hand starts to tip, then falls over, swings down past six and up the other side, back, and
// on, smaller each time as the loose nut rubs, until it hangs straight down beside the hour hand: a clock with its long hand hanging.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the clock's shadow, its rim (shade and lit), its face (shade and
// lit), the minute hand (4 wide, from just below the middle at 100, 100 up to 64), the hour hand (pointing at seven), the hub. The clock (30 cm) is
// 110 across: 367 to the meter, gravity 3600. The minute hand turns on the spindle at the middle: a rod of 36 about its end tips as 3g/2L = 150.
import { n2, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><circle cx=\"105\" cy=\"105\" r=\"56\" fill=\"var(--art-violet-deep,#5E40C4)\"/><circle cx=\"103\" cy=\"101\" r=\"56\" fill=\"var(--art-sun-deep,#DB9A22)\"/><circle cx=\"100\" cy=\"100\" r=\"55\" fill=\"var(--art-sun,#F7BE45)\"/><circle cx=\"100\" cy=\"100\" r=\"47\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><circle cx=\"98.5\" cy=\"100\" r=\"45.5\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"98\" y=\"64\" width=\"4\" height=\"37\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"101.9,101.1 98.1,98.9 85.1,121.4 88.9,123.6\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"100\" cy=\"100\" r=\"5\" fill=\"var(--art-ink-lit,#3A3460)\"/></svg>\n";
export const STILL_HASH = "222699bb82";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 9 || !EL[6].includes('x="98" y="64" width="4" height="37"')) throw new Error("clock: the still isn't as this story knows it");
const FACE = EL.slice(0, 6).join(""), MINUTE = EL[6], REST = EL.slice(7).join("");
// ---- the swing: its angle from twelve, clockwise (radians), from a hair off upright, the nut's rub damping it
const T0 = 0.3, K = 150, RUB = 5;
const SWING = (() => { const S = []; let a = 0.03, w = 0; const dt = 1 / 4000; for (let i = 0; i <= 3.2 / dt; i++) { if (i % 20 === 0) S.push(a); w += (K * Math.sin(a) - RUB * w) * dt; a += w * dt; } return S; })();
const at = (t) => { if (t <= T0) return 0; const k = (t - T0) * 200, i = Math.floor(k), f = k - i; return i >= SWING.length - 1 ? SWING[SWING.length - 1] : SWING[i] + (SWING[i + 1] - SWING[i]) * f; };

// ---- sad: hanging
const SAD_DUR = 3.0;
function sad(t) {
  if (t <= T0) return STILL;
  // (its first hair off upright is the nut letting go: from rest, the angle grows from 0)
  let a = ((at(t) - 0.03 * Math.exp(-((t - T0) * 40))) * 180) / Math.PI;
  // (its last degree or so of swing dies out, and it hangs straight down)
  a += (180 - a) * track([[SAD_DUR - 0.45, 0], [SAD_DUR, 1, "io"]], t);
  return `${OPEN}${FACE}<g transform="rotate(${n2(a)} 100 100)">${MINUTE}</g>${REST}</svg>`;
}

export const REACTIONS = { sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
