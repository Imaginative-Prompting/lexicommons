// Airport's story, its sad alone (its happy, a taxi turn, needed the jet drawn from another side: the player keeps the still for it): the jet's nose
// gear gives: its strut buckles and folds back under the nose, and the nose comes down, slowly at first, the whole jet tipping forward on its main
// wheels, until its belly near the nose comes down on the apron with a bump, its tail cocked up behind: a jet down on its nose.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky, the control tower, the terminal (its glass and its frames), the
// apron, the jet's shadow on it, and the jet: its far wing, its tail fin, its body (shade and lit, its nose at x 175), its windows, its cockpit
// windows, its tailplane, its nose gear (a strut from 148-150.5 across, 158 down, to its two wheels on the apron), its main gear (a strut and two
// wheels, their feet at 181), its near wing and its engine. The jet (40 m) is 170 long: 4.25 to the meter. Its weight sits a little ahead of its main
// wheels, so its nose comes down slowly, as a big thing does.
import { n2, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><rect x=\"46\" y=\"28\" width=\"31\" height=\"7\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"70\" y=\"28\" width=\"7\" height=\"7\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"37,39 86,39 79,58.5 45,58.5\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"72,39 86,39 79,58.5 69,58.5\" fill=\"var(--art-sky-deep,#3488C9)\"/><rect x=\"36\" y=\"34\" width=\"51\" height=\"6\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"78\" y=\"34\" width=\"9\" height=\"6\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><rect x=\"49\" y=\"62\" width=\"25\" height=\"32\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"64\" y=\"62\" width=\"10\" height=\"32\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><rect x=\"44\" y=\"57\" width=\"36\" height=\"6\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"71\" y=\"57\" width=\"9\" height=\"6\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"89,92 106,96 106,139 89,139\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><rect x=\"-1\" y=\"92\" width=\"91\" height=\"47\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"-1\" y=\"104\" width=\"85\" height=\"17\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"70,104 84,104 84,121 62,121\" fill=\"var(--art-sky-deep,#3488C9)\"/><rect x=\"15\" y=\"104\" width=\"1\" height=\"17\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"33\" y=\"104\" width=\"1\" height=\"17\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"52\" y=\"104\" width=\"1\" height=\"17\" fill=\"var(--art-paper,#FBF7EC)\"/><rect y=\"137\" width=\"200\" height=\"63\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M48,180 C90,179.5 150,181 200,184.5 L200,194 C160,190 110,185 62,182 C54,181.5 48,181 48,180 Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M160,151 L194,147.5 C197.5,147.5 197.5,152 194.5,152.5 L166,161 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"46.5,108 53.5,108 74,136 53,140\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><path d=\"M52,138 L140,121 C158,118 170,124 175,137 C179,148 175,158 164,162 C148,167 125,168 110,167 L88,164 C72,158 60,150 52,141 C51,140 51,138.5 52,138 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M52,138 L140,121 C158,118 170,124 175,137 C176,140 176.5,143 176,146 C168,154 150,157 120,157 C95,157 70,152 52,141 C51,140 51,138.5 52,138 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"75\" y=\"140.3\" width=\"2\" height=\"3.4\" rx=\"1\" fill=\"var(--art-sky,#58ADEB)\"/><rect x=\"81\" y=\"139.7\" width=\"2\" height=\"3.5\" rx=\"1\" fill=\"var(--art-sky,#58ADEB)\"/><rect x=\"87.5\" y=\"139.1\" width=\"2.1\" height=\"3.6\" rx=\"1\" fill=\"var(--art-sky,#58ADEB)\"/><rect x=\"94\" y=\"138.4\" width=\"2.1\" height=\"3.7\" rx=\"1\" fill=\"var(--art-sky,#58ADEB)\"/><rect x=\"100.5\" y=\"137.8\" width=\"2.1\" height=\"3.8\" rx=\"1\" fill=\"var(--art-sky,#58ADEB)\"/><rect x=\"107.5\" y=\"137.1\" width=\"2.2\" height=\"3.9\" rx=\"1\" fill=\"var(--art-sky,#58ADEB)\"/><rect x=\"114.5\" y=\"136.4\" width=\"2.2\" height=\"4\" rx=\"1\" fill=\"var(--art-sky,#58ADEB)\"/><rect x=\"121.5\" y=\"135.8\" width=\"2.2\" height=\"4.1\" rx=\"1\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"141,131 157,129 159,137 139,138.5\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"158.5,129 163,129 170,136 160.5,137\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M59,140 L27,139.5 C23.5,139.5 23.5,143.5 27,143.8 L61,148 Z\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><rect x=\"148\" y=\"158\" width=\"2.5\" height=\"18\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><circle cx=\"153.2\" cy=\"178.2\" r=\"3.4\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"145.3\" cy=\"178\" r=\"3.6\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"89.5\" y=\"160\" width=\"2.5\" height=\"15\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><circle cx=\"95.3\" cy=\"177.3\" r=\"3.6\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"86.5\" cy=\"177.5\" r=\"3.8\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M8,145.5 L102,154 C110,155 116,159 117,164 L62,160 L8,150.5 C5,150.5 5,145.5 8,145.5 Z\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><path d=\"M58,159 L79,158.5 L79,178.5 L59,178 C53,178 50,173.5 50,168.5 C50,163.5 53,159 58,159 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M50.5,171 C52,175.5 55,178 59,178 L79,178.5 L79,174.5 L60,174 C55,174 52.5,173 50.5,171 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><ellipse cx=\"79\" cy=\"168.5\" rx=\"6.5\" ry=\"10\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><ellipse cx=\"80\" cy=\"168.8\" rx=\"4.6\" ry=\"8\" fill=\"var(--art-ink,#231F3B)\"/></svg>\n";
export const STILL_HASH = "13c2ee669b";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 46 || !EL[35].includes('x="148" y="158" width="2.5" height="18"') || !EL[38].includes('x="89.5" y="160"')) throw new Error("airport: the still isn't as this story knows it");
const SCENE = EL.slice(0, 20).join(""), BODY = EL.slice(20, 35).join(""), NOSE_GEAR = EL.slice(35, 38).join(""), AFT = EL.slice(38).join("");
// it tips on its main wheels' feet; the nose comes down 14.6 degrees, until its belly near the nose is on the apron (the strut folded up under it)
const PIVOT = [91, 181.4], DOWN = 14.6, STRUT_TOP = [149.2, 158];
const T0 = 0.3, T_GIVE = T0 + 0.07, T_DOWN = 1.55;
function tip(t) {
  if (t <= T0) return 0;
  // (the strut buckles with a jolt; then the nose falls, faster and faster, and bumps down)
  if (t <= T_GIVE) return 0.5 * track([[T0, 0], [T_GIVE, 1, "out"]], t);
  if (t <= T_DOWN) return 0.5 + (DOWN - 0.5) * ((t - T_GIVE) / (T_DOWN - T_GIVE)) ** 2;
  return DOWN - track([[T_DOWN, 0], [T_DOWN + 0.1, 0.9, "out"], [T_DOWN + 0.22, 0, "in"], [T_DOWN + 0.3, 0.2, "out"], [T_DOWN + 0.38, 0, "in"]], t);
}

// ---- sad: down on its nose
const SAD_DUR = T_DOWN + 0.7;
function sad(t) {
  if (t <= T0) return STILL;
  const a = tip(t), fold = 72 * Math.min(1, a / DOWN);
  // (the strut folds back toward the tail about its top, carried with the nose)
  const gear = `<g transform="rotate(${n2(fold)} ${STRUT_TOP[0]} ${STRUT_TOP[1]})">${NOSE_GEAR}</g>`;
  return `${OPEN}${SCENE}<g transform="rotate(${n2(a)} ${PIVOT[0]} ${PIVOT[1]})">${BODY}${gear}${AFT}</g></svg>`;
}

export const REACTIONS = { sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
