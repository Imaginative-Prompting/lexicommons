// Cave's story. Happy, nearly: the same slab breaks off the lip, but it overhangs, so it pitches forward as it falls and lands flat on the ground in
// front of the mouth: the way in clear behind it. Sad: the lip of rock
// over the cave's mouth has a crack behind it. The crack opens along the lip; the slab breaks away, its left end first, and falls, turning, lands on
// its end in the sand of the mouth, and tips over until its top comes to rest against the left side of the opening: a broken slab leaning across
// the cave's mouth, the scar where it hung showing dark.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky, the hill (lit and shaded), the rock faces about the mouth, the
// paler rim round the opening (its top at 72-77 over the middle), the dark opening (its top at 83-90), its right inside wall (cut to the opening),
// the sand floor of the mouth and the ground in front, and a pebble. The mouth (3 m) is 100 tall: 33 to the meter, gravity 330.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M0 14C10 12 22 6 32 7C40 8 48 20 54 32C58 40 62 42 70 42C84 42 96 46 104 52C110 58 112 62 118 64C128 66 136 68 140 74C148 82 150 94 156 102C162 106 166 108 170 114C176 126 180 136 186 144C192 150 196 154 200 158L200 200L0 200Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M156 102C162 106 166 108 170 114C176 126 180 136 186 144C192 150 196 154 200 158L200 200L190 200C186 180 180 160 172 140C166 126 162 112 156 102Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M0 18C10 16 18 9 27 8C30 8 32 9 33 10C36 18 39 25 40 29C33 33 26 37 22 41C18 46 15 52 13 57C8 60 4 62 0 63Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M33 10C36 18 39 25 40 29C36 31 33 33 30 35C32 27 32 18 33 10Z\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><path d=\"M0 74C14 70 28 62 40 56C52 50 62 46 74 44C84 43 92 46 98 52C102 56 104 60 106 62C94 62 82 64 68 66C56 68 46 72 38 78C30 84 22 92 16 102C10 108 4 110 0 112Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M98 52C102 56 104 60 106 62C100 62 92 63 86 63C90 60 94 56 98 52Z\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><path d=\"M150 190C152 160 156 150 162 146C168 144 174 146 178 150C182 158 184 168 187 192Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M170 145C176 147 180 152 182 160C184 170 186 180 187 192L180 192C180 176 178 160 170 145Z\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><path d=\"M6 190C8 160 12 138 16 122C20 104 30 92 44 84C58 76 72 70 88 68C104 66 120 68 132 72C140 76 144 86 148 98C152 110 156 124 158 140C160 152 162 164 166 190Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M130 71C140 76 144 86 148 98C152 110 156 124 158 140C160 152 162 164 166 190L156 190C154 170 152 154 150 140C148 124 144 110 140 98C136 86 134 78 126 71Z\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><path d=\"M22.0 172.0L23.6 165.7L23.8 159.7L24.2 153.8L24.1 148.1L23.7 142.5L23.5 137.1L22.8 131.6L25.0 126.8L26.5 122.1L27.0 117.3L29.8 113.3L31.9 109.2L34.5 105.7L36.9 102.1L39.1 98.6L40.5 94.4L45.1 89.8L49.5 85.6L54.0 82.1L58.2 78.6L63.2 77.1L67.7 74.4L72.6 72.5L78.0 73.2L84.1 72.9L90.0 73.4L95.3 76.0L100.8 77.1L105.1 80.8L109.2 84.0L112.8 87.5L116.1 91.0L119.8 94.0L124.0 172.0Z\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><path d=\"M30.0 172.0L28.6 165.2L28.0 158.7L29.6 152.5L31.2 146.5L32.1 140.8L33.1 135.4L35.4 130.4L34.9 125.1L36.2 120.3L39.5 116.4L39.5 111.4L41.5 107.4L44.2 104.0L45.7 99.7L50.9 95.9L55.0 91.7L59.9 89.2L64.1 86.6L68.8 85.5L73.2 84.0L78.0 82.8L83.7 83.9L89.2 85.0L95.1 85.1L100.5 86.9L104.9 90.5L108.6 94.7L112.3 98.5L116.6 101.8L119.8 106.1L120.8 109.1L121.8 112.4L123.7 115.8L125.3 119.7L126.8 124.1L127.3 128.9L126.1 134.1L125.4 139.5L125.2 145.3L125.3 151.5L126.2 158.0L124.7 164.8L124.0 172.0Z\" fill=\"var(--art-ink,#231F3B)\"/><clipPath id=\"cv\"><path d=\"M30.0 172.0L28.6 165.2L28.0 158.7L29.6 152.5L31.2 146.5L32.1 140.8L33.1 135.4L35.4 130.4L34.9 125.1L36.2 120.3L39.5 116.4L39.5 111.4L41.5 107.4L44.2 104.0L45.7 99.7L50.9 95.9L55.0 91.7L59.9 89.2L64.1 86.6L68.8 85.5L73.2 84.0L78.0 82.8L83.7 83.9L89.2 85.0L95.1 85.1L100.5 86.9L104.9 90.5L108.6 94.7L112.3 98.5L116.6 101.8L119.8 106.1L120.8 109.1L121.8 112.4L123.7 115.8L125.3 119.7L126.8 124.1L127.3 128.9L126.1 134.1L125.4 139.5L125.2 145.3L125.3 151.5L126.2 158.0L124.7 164.8L124.0 172.0Z\"/></clipPath><path d=\"M96 85C106 89 115 96 120 106C126 118 126 140 124 172L106 172C104 158 100 146 102 134C104 122 108 112 105 102C103 96 100 90 96 85Z\" fill=\"var(--art-ink-lit,#3A3460)\" clip-path=\"url(#cv)\"/><path d=\"M28 168C40 158 64 154 82 154C100 154 116 158 126 164L126 174L28 174Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M0 176C14 172 28 168 40 166C64 168 92 168 114 164C120 164 126 166 134 168L200 196L200 200L0 200Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M140 170.5L200 196L200 200L186 200C172 190 156 182 138 176Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><ellipse cx=\"25\" cy=\"188.5\" rx=\"9\" ry=\"2\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M12 188C12 182 16 179 21 179C26 179 30 183 30 188Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M24 179.5C28 181 30 184 30 188L25 188C26 185 26 182 24 179.5Z\" fill=\"var(--art-paper-deeper,#BDB19A)\"/></svg>\n";
export const STILL_HASH = "23d79ced4f";
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 21 || !EL[11].includes("var(--art-paper-deeper") || !EL[12].includes("var(--art-ink,") || !STILL.includes('<clipPath id="cv">') || !EL[18].includes('cx="25" cy="188.5"')) throw new Error("cave: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const RIM = EL[11], ROCK = EL.slice(0, 12).join(""), PEBBLE = EL[18]; // (the slab carries all the still shows where it was: rock, rim, a little of the hill above)
// the slab: a chunk of the lip, between the opening's top edge and a ragged break up through the rim and the rock face above it, 57-104 across
const OPENING_TOP = [[103, 88.5], [100.5, 86.9], [95.1, 85.1], [89.2, 85], [83.7, 83.9], [78, 82.8], [73.2, 84], [68.8, 85.5], [64.1, 86.6], [59.9, 89.2], [57.5, 90.7]];
const BREAK = [[57, 79], [60.5, 73.2], [64, 72.4], [67.5, 69], [71, 68.6], [74, 66.4], [78, 67.6], [82, 66.2], [86, 67.8], [90, 66.6], [94, 69.4], [97.5, 69.2], [101, 71.4], [104, 79]];
const SLAB = `M${BREAK.map((p) => p.join(" ")).join("L")}L${OPENING_TOP.map((p) => p.join(" ")).join("L")}Z`;
const C0 = [80.5, 77.5], FOOT_REST = [59, 84];
// ---- the crack along the break, then the fall: the left end lets go first; it falls (turning its left end down), lands on that end in the sand, and
// tips over to the left about it until its top meets the opening's left side
const T_CRACK = 0.3, T_GO = 0.8, FOOT = [62, 170], HALF = Math.hypot(C0[0] - FOOT_REST[0], C0[1] - FOOT_REST[1]), DROP = FOOT[1] - FOOT_REST[1];
const T_LAND = T_GO + Math.sqrt((2 * DROP) / 330), A_LAND = -75, A_REST = -146;
const A0 = (Math.atan2(C0[1] - FOOT_REST[1], C0[0] - FOOT_REST[0]) * 180) / Math.PI; // the foot-to-middle direction at rest
// (its broken top edge stays dark: the crack's line, now its fracture)
// (the topple about its foot, faster and faster until the top meets the side)
const T_REST = T_LAND + 0.45;
function pose(t) {
  // [the slab's middle, its turn from rest (degrees)]
  if (t <= T_GO) return [C0, 0];
  const at = (foot, turn) => { const r = ((A0 + turn) * Math.PI) / 180; return [foot[0] + HALF * Math.cos(r), foot[1] + HALF * Math.sin(r)]; };
  if (t <= T_LAND) { const s = t - T_GO, f = s / (T_LAND - T_GO), foot = [FOOT_REST[0] + (FOOT[0] - FOOT_REST[0]) * f, FOOT_REST[1] + 0.5 * 330 * s * s], turn = A_LAND * f * f; return [at(foot, turn), turn]; }
  if (t <= T_REST) { const turn = A_LAND + (A_REST - A_LAND) * track([[T_LAND, 0], [T_REST, 1, "in"]], t); return [at(FOOT, turn), turn]; }
  const turn = A_REST + track([[T_REST, 0], [T_REST + 0.06, 4, "out"], [T_REST + 0.13, 0, "in"], [T_REST + 0.18, 1, "out"], [T_REST + 0.23, 0, "in"]], t);
  return [at(FOOT, turn), turn];
}
function crack(run) {
  if (run <= 0.02) return "";
  const n = BREAK.length - 1, upto = run * n, P = [];
  for (let i = 0; i <= n; i++) { if (i <= upto) P.push(BREAK[i]); else { const a = BREAK[i - 1], b = BREAK[i], f = upto - (i - 1); P.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); break; } }
  return `<path d="M${P.map((p) => `${n2(p[0])} ${n2(p[1] - 0.5)}`).join("L")}L${P.slice().reverse().map((p) => `${n2(p[0])} ${n2(p[1] + 0.5)}`).join("L")}Z" ${fill("ink")}/>`;
}

// ---- sad: fallen across the mouth
const SAD_DUR = T_REST + 0.6;
function sad(t) {
  if (t <= T_CRACK) return STILL;
  const cr = crack(track([[T_CRACK, 0], [T_GO, 1, "io"]], t));
  // until it goes, the crack opens along the still's own rim
  if (t <= T_GO) return STILL.replace(RIM, RIM + cr);
  const [c, a] = pose(t);
  // (where it hung, the dark of the cave shows: the opening's top is now the break)
  const scar = `<path d="${SLAB}" ${fill("ink")}/>`;
  const slab = `<g transform="translate(${n2(c[0] - C0[0])} ${n2(c[1] - C0[1])}) rotate(${n2(a)} ${C0[0]} ${C0[1]})"><clipPath id="cs"><path d="${SLAB}"/></clipPath><g clip-path="url(#cs)">${ROCK}</g>${cr}</g>`;
  return STILL.replace(RIM, RIM + scar).replace(PEBBLE, slab + PEBBLE);
}

// ---- happy: out of the way
// The same crack opens along the lip; but the slab's weight is out past the lip (it overhangs us), so as it breaks away it pitches forward, its top
// coming toward us as it falls, and it comes down flat on its face on the ground in front of the mouth with a thud: the opening clear behind it,
// taller now where the slab hung. Lying there we see its back, the fresh break. We look down at the ground: a step toward us is 0.5 down the picture.
const EDGE_Y = 86.5, LANDED = 176, TOWARD = 0.5;
const T_FALL = T_GO + Math.sqrt((2 * (LANDED - EDGE_Y)) / 330);
function pitch(t) {
  // [how far its foot has fallen, how far over it has pitched (degrees)]
  if (t <= T_GO) return [0, 0];
  if (t <= T_FALL) { const s = t - T_GO, f = s / (T_FALL - T_GO); return [0.5 * 330 * s * s, 92 * f * f]; }
  return [LANDED - EDGE_Y, 92 - track([[T_FALL, 0], [T_FALL + 0.05, 5, "out"], [T_FALL + 0.12, 0, "in"], [T_FALL + 0.16, 1.2, "out"], [T_FALL + 0.2, 0, "in"]], t) - 2];
}
const HAPPY_DUR = T_FALL + 0.75;
function happy(t) {
  if (t <= T_CRACK) return STILL;
  const cr = crack(track([[T_CRACK, 0], [T_GO, 1, "io"]], t));
  if (t <= T_GO) return STILL.replace(RIM, RIM + cr);
  const [fall, a] = pitch(t), r = (a * Math.PI) / 180, d = Math.cos(r) - TOWARD * Math.sin(r);
  const scar = `<path d="${SLAB}" ${fill("ink")}/>`;
  // (its face while we can see it; past edge on, its back, the fresh break)
  const body = d >= 0 ? `<clipPath id="cs"><path d="${SLAB}"/></clipPath><g clip-path="url(#cs)">${ROCK}</g>${cr}` : `<path d="${SLAB}" ${fill("paper-deeper")}/>`;
  const slab = `<g transform="matrix(1 0 0 ${n2(d)} 0 ${n2(EDGE_Y + fall - EDGE_Y * d)})">${body}</g>`;
  return STILL.replace(RIM, RIM + scar).replace(PEBBLE, slab + PEBBLE);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
