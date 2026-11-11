// Garage's story (the word is its own door). Happy: the raised door's two worn springs, weakened alike, let it down: it glides down its tracks, level,
// and shuts softly on the threshold, the car safe inside. Sad: the raised door hangs on two springs, and the left one snaps. That side of the door, held now by nothing, comes down: it crashes to the
// ground, bounces, and the door jams crooked in its tracks, its right side only a little way down: a broken door slanting across the opening, the car
// half shut in behind it.
// Every frame is a pure function of t, in seconds. The still's own parts: the grass, the ground, the shadow, the drive, the garage (its side, its front,
// its roof and the roof's side, its lintel), the open bay (dark, 39-117 across, 102-173.5 down, its floor), the door raised into the top of the bay
// (102-123: its face, its right end in shade, two joints between its sections), and the car inside, its wheels behind the bay's threshold. The door
// (2.4 m) is 78 across: 32 to the meter, gravity 320.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"0\" y=\"144\" width=\"200\" height=\"56\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"149,158 200,181 200,200 163,200 123,172.5\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"34,172 124,172 165,200 2,200\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"123,98 150,82.5 150,158 123,173.5\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><rect x=\"33\" y=\"97\" width=\"92\" height=\"76.5\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"29,94 73,77 153,77 125.5,94.5\" fill=\"var(--art-ink-lit,#3A3460)\"/><polygon points=\"124.5,94.5 153,77 153,83 124.5,99.5\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"29\" y=\"93.5\" width=\"96\" height=\"6\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"39\" y=\"102\" width=\"78\" height=\"71.5\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"39\" y=\"165\" width=\"78\" height=\"8.5\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"39\" y=\"102\" width=\"78\" height=\"21\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><rect x=\"105\" y=\"102\" width=\"12\" height=\"21\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><rect x=\"39\" y=\"108.5\" width=\"78\" height=\"1\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"39\" y=\"115.5\" width=\"78\" height=\"1\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"45\" y=\"158\" width=\"12\" height=\"14\" rx=\"2\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"93\" y=\"158\" width=\"12\" height=\"14\" rx=\"2\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"110\" cy=\"166.5\" r=\"5\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M51 143L59 131Q61 128 65 128H99Q102 128 104 131L111 143Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M99.5 128.3Q102.3 128.6 104 131L111 143H104.5Z\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"57,141.5 64,131 97,131 100.5,141.5\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"91,131 97,131 100.5,141.5 94.5,141.5\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M43 162V152Q43 142 54 141.5H104V164H45Q43 164 43 162Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M103 141.5H107Q116 142 116 151V164H115.5A5.5 5.5 0 0 0 104.5 164H103Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M43 160H104V164H45Q43 164 43 162Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M46 148.5H57L55.5 152H46Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M90 148.5H101V152H91.5Z\" fill=\"var(--art-paper,#FBF7EC)\"/></svg>\n";
export const STILL_HASH = "11818eb27a";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 27 || !EL[11].includes('x="39" y="102" width="78" height="21"') || !EL[13].includes('y="108.5"')) throw new Error("garage: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BEHIND = EL.slice(0, 11).join(""), CAR = EL.slice(15).join("");
const X0 = 39, X1 = 117, TOP = 102, LOW = 123, FLOOR = 173.5;

// ---- the door's foot, left and right: the left side falls free (from a snap that jolts it), lands, bounces and lies; the right side, its spring
// holding but the door racking in its tracks, slides down a little and jams
const T_SNAP = 0.35, FALL = FLOOR - LOW, T_LAND = T_SNAP + 0.06 + Math.sqrt((2 * FALL) / 320);
function feet(t) {
  if (t <= T_SNAP) return [LOW, LOW];
  const jolt = track([[T_SNAP, 0], [T_SNAP + 0.04, 1.2, "out"], [T_SNAP + 0.06, 0.8]], t);
  let left = LOW + jolt;
  if (t > T_SNAP + 0.06) { const s = Math.min(t, T_LAND) - T_SNAP - 0.06; left = LOW + 0.8 + 0.5 * 320 * s * s; }
  if (t > T_LAND) left = FLOOR - track([[T_LAND, 0], [T_LAND + 0.06, 1.5, "out"], [T_LAND + 0.12, 0, "in"]], t);
  left = Math.min(left, FLOOR);
  const right = LOW + 0.6 * jolt + 12 * track([[T_SNAP + 0.1, 0], [T_LAND, 1, "in"]], t);
  return [left, right];
}
// the door drawn down to its slanting foot: its face, its shaded right end, its joints between sections at their places down it (a section's
// height apart, as the two in the still), slanting with it
// (drawn this way from the first frame, as it is at rest, so its parts stay the same parts once it moves: the still's face and shade made as tall as
// the bay and cut to the door's outline; its joints, all of them, the higher ones hidden behind the lintel until they come down)
function door(l, r) {
  const slope = (r - l) / (X1 - X0), c = l - LOW - slope * X0;
  const face = EL[11].replace('height="21"', 'height="71.5"'), shade = EL[12].replace('height="21"', 'height="71.5"');
  let joints = "";
  for (let k = 0; k < 9; k++) joints += `<rect x="${X0}" y="${LOW - 7.5 - 7 * k}" width="78" height="1" ${fill("ink")}/>`;
  return `<clipPath id="gd"><path d="M${X0} ${TOP}H${X1}V${n2(r)}L${X0} ${n2(l)}Z"/></clipPath><g clip-path="url(#gd)">${face}${shade}<clipPath id="gj"><path d="M${X0} ${TOP + 0.5}H${X1}V200H${X0}Z"/></clipPath><g clip-path="url(#gj)"><g transform="matrix(1 ${n4(slope)} 0 1 0 ${n4(c)})">${joints}</g></g></g>`;
}

// ---- sad: jammed crooked
const SAD_DUR = T_LAND + 0.7;
function sad(t) {
  if (t <= 0) return STILL;
  const [l, r] = feet(t);
  return `${OPEN}${BEHIND}${CAR}${door(l, r)}</svg>`;
}

// ---- happy: shut, safe
// The same worn springs, both weakened alike: they let the door's weight take it, slowly at first, then down it glides in its tracks, level, the
// springs braking it as it nears the ground; it touches the threshold with a soft bump and settles: the garage shut, the car inside.
const T_GO = 0.3, T_SHUT = 1.75, HAPPY_DUR = T_SHUT + 0.7;
const footAt = (t) => (t <= T_SHUT ? LOW + (FLOOR - LOW) * track([[T_GO, 0], [T_GO + 0.35, 0.12, "in"], [T_SHUT - 0.3, 0.85, "lin"], [T_SHUT, 1, "out"]], t)
  : FLOOR - track([[T_SHUT, 0], [T_SHUT + 0.06, 0.9, "out"], [T_SHUT + 0.14, 0, "in"]], t));
function happy(t) {
  if (t <= T_GO) return STILL;
  const y = footAt(t);
  return `${OPEN}${BEHIND}${CAR}${door(y, y)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
