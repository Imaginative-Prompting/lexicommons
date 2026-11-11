// Bedroom's story. Happy, nearly: the right pillow's outer corner sinks into the soft edge of the mattress and it leans out over the side, and the
// corner comes down on the mattress's firm part at 20 degrees, short of its balance: it rocks and settles there, leaning, still on the bed. Sad:
// the right pillow stands near the bed's edge, and its outer corner sinks into the soft edge of the mattress: it tilts out over the edge, slowly,
// then past its balance, and falls off the side of the bed, turning as it goes, to land on the floor and slump against the bed's side. Its place by
// the headboard is empty.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor, the shadow, the window, the bedside table and its lamp,
// the headboard, the two pillows (the right one 105.5-154 across, 97-121 down, standing on the mattress), the bed's legs, the duvet (to x 174 at its
// right), and the bed's base. The bed (2 m) is 134 long: 67 to the meter, gravity 660. Everything behind the duvet's front and the base stays behind
// them: the pillow, falling at the bed's far side, goes down behind its front corner and legs.
import { n2, n4, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect y=\"160\" width=\"200\" height=\"40\" fill=\"var(--art-violet-lit,#A68CFF)\"/><polygon points=\"7,163 171,163 200,178 200,200 101,200 7,169.5\" fill=\"var(--art-violet-deep,#5E40C4)\"/><polygon points=\"61,18 64,21 64,70.5 14,70.5 11,67.5 61,67.5\" fill=\"var(--art-violet-deep,#5E40C4)\"/><rect x=\"58\" y=\"16.5\" width=\"3\" height=\"51\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><rect x=\"11\" y=\"16.5\" width=\"47.5\" height=\"51\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"14.5\" y=\"20\" width=\"40\" height=\"44\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><rect x=\"33.7\" y=\"20\" width=\"1.6\" height=\"44\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"14.5\" y=\"41.2\" width=\"40\" height=\"1.6\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"40.5\" y=\"158\" width=\"3\" height=\"7.5\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"7\" y=\"163\" width=\"4.5\" height=\"6.5\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"31\" y=\"163\" width=\"4.5\" height=\"6.5\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"37,123.5 43.5,120 43.5,160.5 37,164\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"5.5\" y=\"123.5\" width=\"31.8\" height=\"40.5\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"5.5,123.6 12,120 43.5,120 37,123.6\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"7.5\" y=\"128\" width=\"28\" height=\"34.5\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"8\" y=\"128.5\" width=\"27\" height=\"13.7\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"8\" y=\"142.8\" width=\"27\" height=\"19.2\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M19.3 128.5a2.2 2.2 0 0 0 4.4 0z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M19.3 142.8a2.2 2.2 0 0 0 4.4 0z\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"23.4\" y=\"100\" width=\"3.2\" height=\"19\" fill=\"var(--art-ink-lit,#3A3460)\"/><rect x=\"17\" y=\"117.5\" width=\"16\" height=\"4\" rx=\"2\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M16.8 81H33.2Q34 81 34.3 81.8L40.6 100.6Q40.9 101.8 39.7 101.8H10.3Q9.1 101.8 9.4 100.6L15.7 81.8Q16 81 16.8 81Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M30 81H33.2Q34 81 34.3 81.8L40.6 100.6Q40.9 101.8 39.7 101.8H35.5Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M57 154V98.5A16 16 0 0 1 73 82.5H148A16 16 0 0 1 164 98.5V154Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M51 154V98.5A16 16 0 0 1 67 82.5H142A16 16 0 0 1 158 98.5V154Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M58 121V103.5Q58 97 64.5 97H99.5Q106 97 106 103.5V121Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M58 121V103.5Q58 97 64.5 97H95Q99.5 101 99.5 109Q99.5 116 97 121Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M105.5 121V103.5Q105.5 97 112 97H147.5Q154 97 154 103.5V121Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M105.5 121V103.5Q105.5 97 112 97H143.5Q148 101 148 109Q148 116 145.5 121Z\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"43.5\" y=\"163\" width=\"6\" height=\"15\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"49.5\" y=\"163\" width=\"2.5\" height=\"15\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"157\" y=\"163\" width=\"6\" height=\"15\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"163\" y=\"163\" width=\"2.5\" height=\"15\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M40 154V143C40 129 50 119 64 119H150C164 119 174 129 174 143V154Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M40 154V143C40 129 50 119 64 119H148C157 121 162 132 162 143V154Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M46.8 125.8C51 121.5 57 119 64 119H148C151.5 119.8 154.6 122.3 157 125.8Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M148 119H150C157 119 163 121.5 167.3 125.8H157C154.6 122.3 151.5 119.8 148 119Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M44 153H174V161.5Q174 164.5 171 164.5H44Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"40\" y=\"153\" width=\"129.5\" height=\"11.5\" fill=\"var(--art-wood,#DCA063)\"/></svg>\n";
export const STILL_HASH = "3ec3146f5b";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 40 || !EL[28].includes("M105.5 121V103.5") || !EL[34].includes("M40 154V143C40 129")) throw new Error("bedroom: the still isn't as this story knows it");
const BEFORE = EL.slice(0, 28).join(""), PILLOW = EL[28] + EL[29], AFTER = EL.slice(30).join("");
const MID = [129.75, 109], CORNER = [154, 121];

// ---- the tip: about its outer bottom corner, sinking into the mattress's edge, slowly then faster, to past its balance (30 degrees)
const T0 = 0.3, T_TIP = 0.9, TIP = 30;
// ---- the fall: off the side, turning on over (to 76 degrees), falling to the floor beside the bed (gravity: about 0.4 s for its 45)
const T_LAND = 1.32, REST = [180.5, 152], TURN = 76;
// its middle, tipped a degrees about its outer bottom corner (the corner sinking into the mattress as it goes)
const rot = (a) => { const r = (a * Math.PI) / 180, dx = MID[0] - CORNER[0], dy = MID[1] - CORNER[1]; return [CORNER[0] + dx * Math.cos(r) - dy * Math.sin(r), CORNER[1] + dx * Math.sin(r) + dy * Math.cos(r) + 2.2 * (a / TIP)]; };
function place(t) {
  // [x, y of its middle, turn in degrees, squash across]
  if (t <= T_TIP) { const a = TIP * track([[T0, 0], [T_TIP, 1, "in"]], t); return [...rot(a), a, 1]; }
  const from = rot(TIP), f = Math.min(1, (t - T_TIP) / (T_LAND - T_TIP));
  if (t <= T_LAND) return [from[0] + (REST[0] - from[0]) * (0.6 * f + 0.4 * f * f), from[1] + (REST[1] - from[1]) * f * f, TIP + (TURN - TIP) * f, 1];
  // (it lands soft: it squashes against the floor and the bed, and eases back a little)
  const s = track([[T_LAND, 1], [T_LAND + 0.08, 0.84, "out"], [T_LAND + 0.25, 0.9, "io"]], t);
  return [REST[0], REST[1] + 2.4 * (1 - s), TURN + 3 * (1 - s), s];
}

// ---- sad: on the floor
const SAD_DUR = T_LAND + 0.6;
function sad(t) {
  if (t <= T0) return STILL;
  const [x, y, a, s] = place(t);
  const pillow = `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(a)}) scale(1 ${n4(s)}) translate(${-MID[0]} ${-MID[1]})">${PILLOW}</g>`;
  return `${OPEN}${BEFORE}${pillow}${AFTER}</svg>`;
}

// ---- happy: it stops short
// The same soft edge: the corner sinks and the pillow leans out over the side, slowly, and the corner comes down onto the firm part of the mattress at
// 20 degrees, short of its balance (30): it rocks back a little and settles there, leaning, on the bed.
const HELD = 20, T_HELD = 1.05, HAPPY_DUR = T_HELD + 0.85;
function happy(t) {
  if (t <= T0) return STILL;
  const a = t <= T_HELD ? HELD * track([[T0, 0], [T_HELD, 1, "in"]], t) : HELD - track([[T_HELD, 0], [T_HELD + 0.12, 2.4, "out"], [T_HELD + 0.3, 0.6, "io"], [T_HELD + 0.45, 0.8, "io"]], t);
  const [x, y] = rot(a);
  return `${OPEN}${BEFORE}<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(a)}) translate(${-MID[0]} ${-MID[1]})">${PILLOW}</g>${AFTER}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
