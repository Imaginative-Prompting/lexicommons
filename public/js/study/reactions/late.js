// Late's two stories. The bus you've missed pulls away down the road and out of sight; the next one comes along right behind it, on the road
// behind the shelter. Happy: it's braking for the stop: it pulls up just past the shelter, rocks back on its springs, kneels, and folds its front
// door open. Sad: it isn't stopping: it goes straight past at the same speed and on out of the frame, the stop is left empty, and the clock
// jumps on a quarter of an hour.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect x=\"0\" y=\"152.5\" width=\"200\" height=\"47.5\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"8,170 109,170 200,190.5 200,200 95,200\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M154,152.5 H184 L193,156.5 H163 Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M130.5,134.2 C136,132.4 142,131.6 148,131.6 A0.7 0.7 0 0 1 148,133 C142,133 136.5,133.8 131,135.6 A0.7 0.7 0 0 1 130.5,134.2 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M134,141.6 C137,140.2 140,139.2 144,138.4 A0.7 0.7 0 0 1 144.3,139.8 C140.5,140.6 137.6,141.6 134.7,142.9 A0.7 0.7 0 0 1 134,141.6 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"156\" y=\"145\" width=\"6\" height=\"8\" rx=\"1.5\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"175\" y=\"145\" width=\"6\" height=\"8\" rx=\"1.5\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M170,121 H178.5 C182,121 184,123.5 184,127.5 V144.5 C184,146.5 182.5,147.5 180.5,147.5 H170 Z\" fill=\"var(--art-clay-deep,#C25626)\"/><rect x=\"153.5\" y=\"121\" width=\"27\" height=\"26\" rx=\"4\" fill=\"var(--art-clay,#E8743B)\"/><rect x=\"157.5\" y=\"125\" width=\"19\" height=\"8.5\" rx=\"2\" fill=\"var(--art-sky-pale,#C9E7F9)\"/><circle cx=\"158.8\" cy=\"139.5\" r=\"2.1\" fill=\"var(--art-clay-deeper,#9C4219)\"/><circle cx=\"175.2\" cy=\"139.5\" r=\"2.1\" fill=\"var(--art-clay-deeper,#9C4219)\"/><rect x=\"153\" y=\"144\" width=\"28\" height=\"3.8\" rx=\"1.5\" fill=\"var(--art-ink-lit,#3A3460)\"/><rect x=\"72.5\" y=\"54\" width=\"5.5\" height=\"18\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"76.6\" cy=\"35\" r=\"21\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"74.6\" cy=\"35\" r=\"21\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M75.8,34.4 L71.4,21.1 A1.3 1.3 0 0 0 69,21.9 L73.4,35.2 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M74.6,33.5 H89.3 A1.3 1.3 0 0 1 89.3,36.1 H74.6 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"74.6\" cy=\"34.8\" r=\"2.6\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M8,168 V110 C8,88 28,77.5 58,77 L120,82 C125.5,83 126.5,86.5 124,88 C118,91 102,92 94,96.5 C91,98.5 89.5,100 89,102 L40,98 V168 Z\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"38,97.6 89,101.8 89,159 38,159\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M88,102.8 L89.5,99.5 C92,96.5 96,94.2 101.5,92 V97 L88.5,104 Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M88.5,102 C90.5,99 95,97 100.5,95.8 V160 H88.5 Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><rect x=\"86\" y=\"100.5\" width=\"3\" height=\"59\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M15,160 V112 C15,100 22,92 35,89 V160 Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><rect x=\"12\" y=\"158\" width=\"91\" height=\"4.5\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M47.5,162 V151 C47.5,149.5 46.5,148.5 45,148.5 H50.5 C52.5,148.5 53.5,150 53.5,152 V162 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M82,162 V151 C82,149.5 81,148.5 79.5,148.5 H85.5 C87.5,148.5 88.5,150 88.5,152 V162 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M38,142 H92 C94,142 95,143.5 95,145.5 V146.5 C95,148 94,149 92.5,149 H38 Z\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M38,142 H92 C94,142 95,143.5 95,145.5 H38 Z\" fill=\"var(--art-violet-lit,#A68CFF)\"/><rect x=\"34\" y=\"85\" width=\"5.5\" height=\"83\" fill=\"var(--art-ink-lit,#3A3460)\"/><rect x=\"100\" y=\"92.5\" width=\"6.5\" height=\"75.5\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M2.5,108 C4,88 20,70 44,68 C52,67.4 60,67.9 70,69.5 L117,78.5 C123,80 126,83 125,87 C123,84.5 121,83.5 117,83 L62,77 C40,76 16,86 9.5,108 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"7\" y=\"166\" width=\"12\" height=\"4.5\" rx=\"1\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"31.5\" y=\"166\" width=\"13\" height=\"4.5\" rx=\"1\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"97.5\" y=\"166\" width=\"12.5\" height=\"4.5\" rx=\"1\" fill=\"var(--art-ink,#231F3B)\"/></svg>\n";
export const STILL_HASH = "8d5e3ea082";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 37) throw new Error("late: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BACK = EL.slice(0, 3).join(""); // the sky, the pavement, the shelter's shadow
const GOING = EL.slice(3, 14).join(""); // the bus pulling away: its shadow, its two speed lines, the bus
// the clock on its post (its face, its rim, the hour hand, the minute hand, the cap they turn on), then the shelter
const PIVOT = "74.6 34.8";
/** The clock, its minute hand on by `minutes` (in degrees of the minute hand; the hour hand, geared to it, goes a twelfth as far). */
function clock(minutes) {
  if (!minutes) return EL.slice(14, 20).join("");
  const turned = (e, a) => `<g transform="rotate(${n2(a)} ${PIVOT})">${e}</g>`;
  return `${EL[14]}${EL[15]}${EL[16]}${turned(EL[17], minutes / 12)}${turned(EL[18], minutes)}${EL[19]}`;
}
const SHELTER_ONLY = EL.slice(20).join("");

// ---- the bus pulling away: on at its speed, a little faster, out through the right edge (its speed lines go with it)
const away = (t) => 80 * t + 60 * t * t;
const going = (t) => { const d = away(t); return 130.5 + d > 200.5 ? "" : `<g transform="translate(${n2(d)} 0)">${GOING}</g>`; };

// ---- the next bus, side on, its door side to us, flat as the still draws things. The shelter's feet and the bus pulling away put the eye low
// (the horizon at y 152, the eye about 0.42 m up); a bus standing on y 159.5 is 17.9 units a meter there, so 3 m tall and 11 m long.
const G = 159.5;
const TOP = 105.8, FLOOR = 154.1, L = 197;
// in the bus's own units its nose is at x 0; the front wheel 2.6 m back, the rear 8.1 m back; both doors 20 wide
const R = 9, WY = G - R, WHEELS = [-46.5, -145], DOOR = -25, MID_DOOR = -108.5;
const rect = (x, y, w, h, rx, t) => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}"${rx ? ` rx="${rx}"` : ""} ${fill(t)}/>`;
const path = (d, t) => `<path d="${d}" ${fill(t)}/>`;
const BODY = path(`M${-L + 4} ${TOP}H-6A6 6 0 0 1 0 ${TOP + 6}V${FLOOR - 1.5}A1.5 1.5 0 0 1 -1.5 ${FLOOR}H${-L + 1.5}A1.5 1.5 0 0 1 ${-L} ${FLOOR - 1.5}V${TOP + 4}A4 4 0 0 1 ${-L + 4} ${TOP}Z`, "clay");
const WINDOWS = [[-43.5, -27.5], [-65, -45], [-86.5, -66.5], [-128.5, -110.5], [-148.5, -130], [-168.5, -150], [-191, -170]].map(([a, b]) => rect(a, 114, b - a, 25.5, 1.8, "sky-pale")).join("");
// the rubbing strip along its foot, the wheel arches, the windscreen's wrap at the nose, an indicator, the rear lamp, the mirror on its arm
const STRIP = rect(-L + 1.6, FLOOR - 3.2, L - 3.2, 3.2, 0, "ink-lit");
const ARCHES = WHEELS.map((x) => path(`M${n2(x - 10.39)} ${FLOOR}A11 11 0 1 1 ${n2(x + 10.39)} ${FLOOR}Z`, "ink")).join("");
const NOSE = rect(-2.2, 113, 2.2, 28, 0, "ink") + rect(-4.3, 145, 2.6, 2.4, 0.6, "sun") + rect(-L, 135, 2, 10, 0, "clay-deeper");
const MIRROR = path("M-3 108C1 106 6 107 6.8 111V113H5.6V111.4C5 108.6 1 108.2 -3 110Z", "ink-lit") + rect(4.4, 112.5, 3.4, 11, 1.4, "ink");
// a door leaf: its frame and two panes, hinged at x h on the side it folds to
const LEAF_H = FLOOR - 117;
const leaf = (x) => rect(x, 117, 10, LEAF_H, 1, "ink-lit") + rect(x + 1.3, 118.4, 7.4, 17, 0.8, "sky-pale") + rect(x + 1.3, 136.8, 7.4, FLOOR - 1.6 - 136.8, 0.8, "sky-pale");
const folded = (x, h, c) => (c === 1 ? leaf(x) : `<g transform="translate(${h} 0) scale(${n4(c)} 1) translate(${-h} 0)">${leaf(x)}</g>`);
// the doorway behind them: dark inside, the far side's window dim through it, the step's yellow edge and a yellow grab pole
const INSIDE = rect(DOOR, 117, 20, LEAF_H, 1, "ink") + rect(DOOR, 121.5, 20, 15.5, 0, "ink-lit") + rect(DOOR, 150.4, 20, 0.9, 0, "sun") + rect(DOOR + 3.6, 118, 1.2, 32.4, 0.6, "sun");
/** The front door, its two leaves folded in by `fold` radians (each turns on its outer edge, into the bus, so it shows cos of its width). */
function frontDoor(fold) {
  const c = Math.cos(fold);
  return `${INSIDE}${folded(DOOR, DOOR, c)}${folded(DOOR + 10, DOOR + 20, c)}`;
}
const MIDDLE = leaf(MID_DOOR) + leaf(MID_DOOR + 10);
/** A wheel at x (the bus's units), turned by a radians: its tire, its hub and five nuts. */
function wheel(x, a) {
  let nuts = "";
  for (let i = 0; i < 5; i++) { const b = a + (i * 2 * Math.PI) / 5; nuts += `<circle cx="${n2(x + 2.8 * Math.cos(b))}" cy="${n2(WY + 2.8 * Math.sin(b))}" r="0.8" ${fill("ink")}/>`; }
  return `<circle cx="${x}" cy="${WY}" r="${R}" ${fill("ink")}/><circle cx="${x}" cy="${WY}" r="4.6" ${fill("ink-lit")}/>${nuts}`;
}
// Through the shelter's glass the bus shows as a shade darker than the pane: its body a deeper blue, its windows and door panes the pane's own,
// its wheels deeper still; the side pane, turned to the light, shows only its sheen. (The bus is behind a pane while any of it, tail to mirror,
// is between x 15 and 89.)
const PANES = [EL[21], EL[25]].map((e) => e.replace(/ fill="[^"]*"/, "")).join("");
const PANE_RECTS = [[-43.5, -27.5], [-65, -45], [-86.5, -66.5], [-128.5, -110.5], [-148.5, -130], [-168.5, -150], [-191, -170]].map(([a, b]) => rect(a, 114, b - a, 25.5, 1.8, "sky-lit")).join("")
  + [DOOR, DOOR + 10, MID_DOOR, MID_DOOR + 10].map((x) => rect(x + 1.3, 118.4, 7.4, 17, 0.8, "sky-lit") + rect(x + 1.3, 136.8, 7.4, FLOOR - 1.6 - 136.8, 0.8, "sky-lit")).join("");
const SEEN_BODY = BODY.replace(/ fill="[^"]*"/, ` ${fill("sky")}`) + PANE_RECTS;
const SEEN_WHEELS = WHEELS.map((w) => `<circle cx="${w}" cy="${WY}" r="${R}" ${fill("sky-deep")}/>`).join("");
/** The bus with its nose at x: pitched `pitch` degrees nose down about its middle, its body lowered `kneel`, its front door folded `fold`, its
 *  wheels turned `turn` radians; with its shadow, the still's light (as the departing bus's: 18.7 across and 8.3 down for its 3 m), and what
 *  the shelter's glass shows of it. */
function bus(x, { pitch = 0, kneel = 0, fold = 0, turn = 0 } = {}) {
  const tail = x - L;
  const shadow = path(`M${n2(tail + 1.5)} 158.8L${n2(x + 1.5)} 158.8L${n2(x + 18.7)} 167.8L${n2(tail + 18.7)} 167.8Z`, "sun-deep");
  const tilt = pitch ? ` rotate(${n2(pitch)} ${-L / 2} 132)` : "";
  const at = `translate(${n2(x)} ${n2(kneel)})${tilt}`, roll = `translate(${n2(x)} 0)`;
  const body = `<g transform="${at}">${BODY}${WINDOWS}${STRIP}${frontDoor(fold)}${MIDDLE}${ARCHES}${NOSE}${MIRROR}</g>`;
  const wheels = `<g transform="${roll}">${WHEELS.map((w) => wheel(w, turn)).join("")}</g>`;
  const behind = x + 8 > 15 && tail < 89;
  const seen = behind ? `<clipPath id="gl">${PANES}</clipPath><g clip-path="url(#gl)"><g transform="${at}">${SEEN_BODY}</g><g transform="${roll}">${SEEN_WHEELS}</g></g>` : "";
  return { shadow, bus: `${body}${wheels}`, seen };
}
// the panes are drawn as the still has them, then what they show of the bus; the shelter's back post (which never touches the side pane drawn
// after it in the still) moves after the panes, so it stays in front
const SHELTER_BEHIND = [20, 21, 22, 23, 25].map((i) => EL[i]).join(""), SHELTER_FRONT = EL.slice(24, 25).concat(EL.slice(26)).join("");
function frameOf(t, next, minutes = 0) {
  if (!next) return `${OPEN}${BACK}${going(t)}${clock(minutes)}${SHELTER_ONLY}</svg>`;
  return `${OPEN}${BACK}${going(t)}${next.shadow}${next.bus}${clock(minutes)}${SHELTER_BEHIND}${next.seen}${SHELTER_FRONT}</svg>`;
}

// ---- happy. It comes in braking (7 m/s², firm), nose down on its springs; it stops with its door just past the shelter, rocks back past level
// and settles, kneels a touch to the kerb, and folds its door in.
const STOP_X = 152, T_STOP = 1.7, BRAKE = (2 * (STOP_X + 30)) / T_STOP ** 2;
const HAPPY_DUR = T_STOP + 0.75 + 0.6;
function happy(t) {
  if (t <= 0) return STILL;
  const left = Math.max(0, T_STOP - t), x = STOP_X - 0.5 * BRAKE * left * left;
  const pitch = t < T_STOP ? 0.7 : track([[T_STOP, 0.7], [T_STOP + 0.16, -0.3, "io"], [T_STOP + 0.32, 0.12, "io"], [T_STOP + 0.46, 0, "io"]], t);
  const kneel = track([[T_STOP + 0.25, 0], [T_STOP + 0.45, 1.2, "io"]], t);
  const fold = track([[T_STOP + 0.35, 0], [T_STOP + 0.75, (82 * Math.PI) / 180, "io"]], t);
  return frameOf(t, bus(x, { pitch, kneel, fold, turn: (x + 30) / R }));
}

// ---- sad. It comes in as fast, and doesn't brake: on past the stop at the same speed, until its back and its shadow are out of the frame.
const SPEED = BRAKE * T_STOP, GONE = 200 + L;
const T_GONE = (GONE + 30) / SPEED;
// and the clock jumps on a quarter of an hour, past and back: late again
const T_JUMP = T_GONE + 0.25;
const jump = (t) => track([[T_JUMP, 0], [T_JUMP + 0.16, 97, "io"], [T_JUMP + 0.26, 87.5, "io"], [T_JUMP + 0.36, 90, "io"]], t);
const SAD_DUR = T_JUMP + 0.36 + 0.7;
function sad(t) {
  if (t <= 0) return STILL;
  const x = -30 + SPEED * t;
  return frameOf(t, x > GONE ? null : bus(x, { turn: (x + 30) / R }), jump(t));
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
