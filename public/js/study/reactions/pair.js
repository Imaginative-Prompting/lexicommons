// Pair's two stories, the washing's own. Happy: the line creeps under the wet weight and sags, its low point between the two pegs, and the
// pegs (gripping their socks the whole way) slide down it toward each other, gathering pace, until the socks bump and hang touching; they
// swing together once and settle. The shadows on the wall follow the line's curve. Sad: the right sock, wet and heavy, creeps down through its peg's grip (its cuff sliding down past
// the peg, slowly and then faster), slips free and drops out of the frame, its shadow on the wall going with it. The left one hangs alone
// beside the empty peg.
// Every frame is a pure function of t, in seconds. The still's own parts: the line at y 40.9, each sock's cuff under it from y 41.6, gripped
// by its peg down to y 52.6; each sock's shadow on the wall 6 right and 6 down.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect y=\"46.9\" width=\"200\" height=\"2.4\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M64.6 49.2Q64.6 47.6 66.2 47.6H101.3Q102.9 47.6 102.9 49.2V92C102.9 102 112.5 110 112.4 120.5C112.3 130 105 136 98 141.5C88 149 82 158 77 170C73 180 64 187.5 55.5 187.5C46 187.5 40.8 180 41.2 171C41.6 161 50 149 57 138.5C64 128 67.8 118 67.8 106C67.8 94 64.6 70 64.6 49.2Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M118.6 49.2Q118.6 47.6 120.2 47.6H155.3Q156.9 47.6 156.9 49.2V92C156.9 102 166.5 110 166.4 120.5C166.3 130 159 136 152 141.5C142 149 136 158 131 170C127 180 118 187.5 109.5 187.5C100 187.5 94.8 180 95.2 171C95.6 161 104 149 111 138.5C118 128 121.8 118 121.8 106C121.8 94 118.6 70 118.6 49.2Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M78.3 22Q78.3 20 80.3 20H87.3Q89.3 20 89.3 22L88.5 56.8Q88.5 58.6 86.7 58.6H80.9Q79.1 58.6 79.1 56.8Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M132.3 22Q132.3 20 134.3 20H141.3Q143.3 20 143.3 22L142.5 56.8Q142.5 58.6 140.7 58.6H134.9Q133.1 58.6 133.1 56.8Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M58.6 43.2Q58.6 41.6 60.2 41.6H95.3Q96.9 41.6 96.9 43.2V86C96.9 96 106.5 104 106.4 114.5C106.3 124 99 130 92 135.5C82 143 76 152 71 164C67 174 58 181.5 49.5 181.5C40 181.5 34.8 174 35.2 165C35.6 155 44 143 51 132.5C58 122 61.8 112 61.8 100C61.8 88 58.6 64 58.6 43.2Z\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M92.4 41.6H95.3Q96.9 41.6 96.9 43.2V86C96.9 96 106.5 104 106.4 114.5C106.3 124 99 130 92 135.5C82 143 76 152 71 164C67 174 58 181.5 49.5 181.5L58 172C65 163 71.5 153 74 143C76 133 80 126 86 120C91 115 93.5 109 93 101C92.6 94 92.4 88 92.4 80Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M58.9 54.5Q77.9 56.1 96.9 54.5V61Q78 62.6 59.2 61Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M59.5 65.5Q78.2 67.1 96.9 65.5V72Q78.4 73.6 59.9 72Z\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"92.4,54.8 96.9,54.5 96.9,61 92.4,61.3\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"92.4,65.8 96.9,65.5 96.9,72 92.4,72.3\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M65 173.6C60.6 178.4 54.9 181.5 49.5 181.5C40 181.5 34.8 174 35.2 165C35.3 161.5 36.5 157.8 38.2 153.9C47 151.5 60 160 65 173.6Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M61.8 167.2Q63.8 170.4 65 173.6C60.6 178.4 54.9 181.5 49.5 181.5C54 181 57.8 172.8 61.8 167.2Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M112.6 43.2Q112.6 41.6 114.2 41.6H149.3Q150.9 41.6 150.9 43.2V86C150.9 96 160.5 104 160.4 114.5C160.3 124 153 130 146 135.5C136 143 130 152 125 164C121 174 112 181.5 103.5 181.5C94 181.5 88.8 174 89.2 165C89.6 155 98 143 105 132.5C112 122 115.8 112 115.8 100C115.8 88 112.6 64 112.6 43.2Z\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M146.4 41.6H149.3Q150.9 41.6 150.9 43.2V86C150.9 96 160.5 104 160.4 114.5C160.3 124 153 130 146 135.5C136 143 130 152 125 164C121 174 112 181.5 103.5 181.5L112 172C119 163 125.5 153 128 143C130 133 134 126 140 120C145 115 147.5 109 147 101C146.6 94 146.4 88 146.4 80Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M112.9 54.5Q131.9 56.1 150.9 54.5V61Q132 62.6 113.2 61Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M113.5 65.5Q132.2 67.1 150.9 65.5V72Q132.4 73.6 113.9 72Z\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"146.4,54.8 150.9,54.5 150.9,61 146.4,61.3\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"146.4,65.8 150.9,65.5 150.9,72 146.4,72.3\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M119 173.6C114.6 178.4 108.9 181.5 103.5 181.5C94 181.5 88.8 174 89.2 165C89.3 161.5 90.5 157.8 92.2 153.9C101 151.5 114 160 119 173.6Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M115.8 167.2Q117.8 170.4 119 173.6C114.6 178.4 108.9 181.5 103.5 181.5C108 181 111.8 172.8 115.8 167.2Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><rect y=\"40.9\" width=\"200\" height=\"2.4\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M72.3 16Q72.3 14 74.3 14H81.3Q83.3 14 83.3 16L82.5 50.8Q82.5 52.6 80.7 52.6H74.9Q73.1 52.6 73.1 50.8Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M80.9 14H81.3Q83.3 14 83.3 16L82.5 50.8Q82.5 52.6 80.7 52.6H80.1Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"76.8\" y=\"24\" width=\"1.6\" height=\"12\" rx=\"0.8\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M126.3 16Q126.3 14 128.3 14H135.3Q137.3 14 137.3 16L136.5 50.8Q136.5 52.6 134.7 52.6H128.9Q127.1 52.6 127.1 50.8Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M134.9 14H135.3Q137.3 14 137.3 16L136.5 50.8Q136.5 52.6 134.7 52.6H134.1Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"130.8\" y=\"24\" width=\"1.6\" height=\"12\" rx=\"0.8\" fill=\"var(--art-steel-deep,#6B687A)\"/></svg>\n";
export const STILL_HASH = "da4268ecd2";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 29 || !EL[22].includes('y="40.9"')) throw new Error("pair: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
// the still's parts: the wall; the line's shadow; the socks' shadows; the pegs' shadows; the left sock; the right sock; the line; the pegs
const [WALL, LINE_SHADOW, LEFT_SHADOW, RIGHT_SHADOW, LEFT_PEG_SHADOW, RIGHT_PEG_SHADOW] = EL;
const LEFT_SOCK = EL.slice(6, 14).join(""), RIGHT_SOCK = EL.slice(14, 22).join(""), LINE = EL[22], LEFT_PEG = EL.slice(23, 26).join(""), RIGHT_PEG = EL.slice(26, 29).join("");
// where the right sock hangs from: the middle of its cuff
const CUFF = [131.75, 41.6];

function scene(right) {
  return `${OPEN}${WALL}${LINE_SHADOW}${LEFT_SHADOW}${right(RIGHT_SHADOW)}${LEFT_PEG_SHADOW}${RIGHT_PEG_SHADOW}${LEFT_SOCK}${right(RIGHT_SOCK)}${LINE}${LEFT_PEG}${RIGHT_PEG}</svg>`;
}

// ---- sad: the right sock slips out of its peg
const SAD_DUR = 2.2;
const T_FREE = 1.25, GRIP = 11.5, G = 900;
function sad(t) {
  if (t <= 0) return STILL;
  // the creep: the wet weight drawing the cuff down through the peg's grip, faster as less of it is held
  const vFree = (2 * (GRIP - 6)) / (T_FREE - 1.0);
  const tf = Math.max(0, t - T_FREE);
  const d = t <= T_FREE ? track([[0.2, 0], [1.0, 6, "in"], [T_FREE, GRIP, "in"]], t) : GRIP + vFree * tf + 0.5 * G * tf * tf;
  // once free it falls, and turns a little as it goes (its right side came out last)
  const a = track([[T_FREE - 0.1, 0], [T_FREE + 0.5, 7, "in"]], t);
  const right = (svg) => (d < 1e-6 ? svg : `<g transform="translate(0 ${n2(d)}) rotate(${n2(a)} ${CUFF[0]} ${CUFF[1]})">${svg}</g>`);
  return scene(right);
}

// ---- happy: the line sags and brings them together
// the line between its posts (just past the frame, 140 either side of its middle, the middle between the pegs): a sag of depth s there
const MID = 104.8, HALF = 140;
const sagAt = (x, s) => s * Math.max(0, 1 - ((x - MID) / HALF) ** 2);
const slopeAt = (x, s) => (-2 * s * (x - MID)) / (HALF * HALF);
// a thick line (y0 its top, 2.4 deep) along the sag, as the still's straight one when s is 0
function sagging(y0, s, dx, tone) {
  const xs = Array.from({ length: 21 }, (_, i) => i * 10), top = xs.map((x) => [x, y0 + sagAt(x - dx, s)]);
  return `<polygon points="${[...top, ...top.slice().reverse().map(([x, y]) => [x, y + 2.4])].map(([x, y]) => `${n2(x)},${n2(y)}`).join(" ")}" ${fill(tone)}/>`;
}
const LEFT_CUFF = [77.75, 41.6], GAP = (112.6 - 96.9) / 2;
const HAPPY_DUR = 2.4;
function happy(t) {
  if (t <= 0) return STILL;
  // the sag: the line's slow creep under the wet socks
  const s = track([[0.2, 0], [1.05, 15, "io"]], t);
  // the pegs: held by friction until the slope is enough, then sliding down it, gathering pace, until the socks meet; a small knock apart
  const u = track([[0.62, 0], [1.28, GAP, "in"], [1.38, GAP - 1.3, "out"], [1.5, GAP, "in"]], t);
  // and the socks, stopped short by each other, swing on: their feet toward each other first, once, and settle
  const sw = track([[1.24, 0], [1.44, 3.2, "out"], [1.7, -1.7, "io"], [1.94, 0.6, "io"], [2.14, 0, "io"]], t);
  const at = (cx, dir) => {
    const x = cx + dir * u, y = sagAt(x, s), tilt = (Math.atan(slopeAt(x, s)) * 180) / Math.PI;
    return { dx: dir * u, dy: y, tilt, sock: (svg) => `<g transform="translate(${n2(dir * u)} ${n2(y)}) rotate(${n2(-dir * sw)} ${cx} 41.6)">${svg}</g>`,
      peg: (svg) => `<g transform="translate(${n2(dir * u)} ${n2(y)}) rotate(${n2(tilt)} ${cx} 42.1)">${svg}</g>` };
  };
  const L = at(LEFT_CUFF[0], 1), R = at(CUFF[0], -1);
  return `${OPEN}${WALL}${sagging(46.9, s, 6, "sun-deep")}${L.sock(LEFT_SHADOW)}${R.sock(RIGHT_SHADOW)}${L.peg(LEFT_PEG_SHADOW)}${R.peg(RIGHT_PEG_SHADOW)}`
    + `${L.sock(LEFT_SOCK)}${R.sock(RIGHT_SOCK)}${sagging(40.9, s, 0, "ink")}${L.peg(LEFT_PEG)}${R.peg(RIGHT_PEG)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
