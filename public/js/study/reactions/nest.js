// Nest's story, a time-lapse of a hatching: the chick inside the middle egg stirs, and the egg rocks in the nest, harder and harder.
// Happy: the egg cracks round its top; the chick pushes the cap up and off (it tips over onto the egg beside) and its head comes up out of the shell:
// a chick among two eggs.
// Sad: the rocking egg knocks the egg beside it: that one rolls up the inside of the bowl, over the rim, and drops down into the fork of the branch
// beside the nest, and lies there, out of the nest for good.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky, the twig rising from the branch's fork and its leaf, the branch
// (lit, shaded, its knot), two straws sticking out, the nest (its bowl and shade, its rim, its hollow), the three eggs (each lit and shaded: the
// middle one the tallest, 92-110 across, 85-109 down; the right one 113-129), and the weave in front of them, over their feet. The nest (11 cm) is 110
// across: 1000 to the meter, gravity 9800. The chick is only its head and a little down: no more of it shows.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M150,146 C158,136 166,124 174,116 C176,114 178,116 177,118 C171,126 164,138 158,148 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M175,117 C176,106 184,100 192,98 C192,106 186,114 175,117 Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M175,117 C182,110 188,104 192,98 C192,106 186,114 175,117 Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M0,146 C40,142 90,146 130,142 C150,140 170,134 186,128 C189,127 191,131 187,133 C170,141 150,150 130,154 C90,160 40,160 0,162 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M0,156 C40,155 90,155 130,149 C150,146 170,138 187,133 C170,141 150,150 130,154 C90,160 40,160 0,162 Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M126,144 C140,141 152,139 163,135 C161,141 150,146 136,149 C131,149 126,148 126,144 Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M48,105 L31,113.5 L30.6,112.4 L47,103.2 Z M57,88.5 L49.5,79 L50.6,78.4 L58.8,87.6 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M152,101 L171.5,98.6 L171.6,99.9 L152.4,103 Z M146,121 L157.5,129.5 L156.7,130.4 L144.8,122.4 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M45,97 C45,87 72,81 100,81 C128,81 155,87 155,97 C155,122 132,147 100,147 C68,147 45,122 45,97 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M100,147 C132,147 155,122 155,97 C155,94 154,92 152,90 C152,118 132,140 100,147 Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><ellipse cx=\"100\" cy=\"97\" rx=\"55\" ry=\"16\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M138,83 C149,86 155,91 155,97 C155,101 152,104 147,107 C150,102 151,99 150,96 C149,91 145,87 138,83 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M48,95 C54,87 70,83 88,82 C72,85 58,89 51,97 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M112,82 C132,82 147,86 153,93 C146,89 131,85 112,84 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><ellipse cx=\"100\" cy=\"97\" rx=\"41\" ry=\"11\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M59,97 C59,91 74,87 92,86 C80,89 70,93 68,100 C66,104 61,103 59,97 Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M102,85 C108,85 110,96 109,102 C108,107 105,109 100,109 C95,109 92,106 92,101 C92,94 96,85 102,85 Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M104,86 C108,87 110,96 109,102 C108,107 105,109 100,109 C104,106 106,100 106,96 C106,92 105,88 104,86 Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M82,88 C88,88 92,98 92,103 C92,108 89,110 85,110 C80,110 77,107 77,102 C77,96 77,88 82,88 Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M85,89 C89,91 92,98 92,103 C92,108 89,110 85,110 C88,107 89,102 89,99 C89,95 87,91 85,89 Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M123,91 C128,92 129,100 128,104 C127,108 124,109 120,109 C116,109 113,106 114,102 C115,97 118,90 123,91 Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M124,92 C128,94 129,100 128,104 C127,108 124,109 120,109 C123,107 125,103 125,100 C125,97 125,94 124,92 Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M46,100 C44,112 52,126 64,134 C56,124 50,112 52,100 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M48,108 C60,124 84,136 120,138 C122,138 124,139 124,139 C86,143 58,130 48,108 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M50,100 C66,114 100,120 138,116 C146,115 152,112 155,108 C150,118 140,122 128,123 C94,126 64,118 50,100 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M154,102 C148,124 122,140 82,143 C118,145 147,130 154,102 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M58,129 C72,140 88,145 104,145 C120,145 132,140 140,132 C134,142 120,149 104,149 C86,149 68,142 58,129 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M156,98 C158,112 150,126 136,134 C146,124 152,112 150,99 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M43,95 C56,105 82,108 106,107 C120,106 134,104 146,100 C138,110 122,114 104,115 C78,116 54,110 43,95 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M157,93 C152,104 134,112 112,114 C100,115 90,114 80,112 C92,110 104,109 116,107 C136,104 150,100 157,93 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/></svg>\n";
export const STILL_HASH = "1316b572f6";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 31 || !EL[17].includes("M102,85 C108,85 110,96 109,102") || !EL[21].includes("M123,91 C128,92 129,100 128,104")) throw new Error("nest: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BACK = EL.slice(0, 17).join(""), MIDDLE = EL[17] + EL[18], LEFT = EL[19] + EL[20], RIGHT = EL[21] + EL[22], WEAVE = EL.slice(23).join("");
const FOOT = [100.5, 109], CRACK_Y = 93.5;
// the rocking: side to side about its foot, quicker and bigger
const rock = (t, until, big) => (t <= 0.3 ? 0 : big * track([[0.3, 0], [until, 1, "in"]], Math.min(t, until)) * Math.sin((t - 0.3) * 2 * Math.PI * 3.2) * (t > until ? Math.max(0, 1 - (t - until) / 0.25) : 1));
const rocked = (a, body) => (Math.abs(a) > 0.005 ? `<g transform="rotate(${n2(a)} ${FOOT[0]} ${FOOT[1]})">${body}</g>` : body);

// ---- happy: hatched
// the crack runs round the top (a zigzag from left to right); the head pushes the cap up and it tips off to the left, onto the left egg
const ZIG = [[92.4, 94.6], [94.8, 92.2], [97.2, 94.8], [99.6, 91.8], [102, 94.6], [104.4, 92], [106.8, 94.4], [109.2, 92.6]];
function crack(run) {
  if (run <= 0.02) return "";
  const n = ZIG.length - 1, upto = run * n, pts = [];
  for (let i = 0; i <= n; i++) { if (i <= upto) pts.push(ZIG[i]); else { const a = ZIG[i - 1], b = ZIG[i], f = upto - (i - 1); pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); break; } }
  const top = pts.map((p) => `${n2(p[0])} ${n2(p[1] - 0.45)}`).join("L"), bottom = pts.slice().reverse().map((p) => `${n2(p[0])} ${n2(p[1] + 0.45)}`).join("L");
  return `<path d="M${top}L${bottom}Z" ${fill("ink")}/>`;
}
const CAP_CLIP = `M80 70H120V${CRACK_Y}${ZIG.slice().reverse().map((p) => `L${p[0]} ${p[1]}`).join("")}L80 ${CRACK_Y}Z`;
const SHELL_CLIP = `M80 120H120V${CRACK_Y}${ZIG.slice().reverse().map((p) => `L${p[0]} ${p[1]}`).join("")}L80 ${CRACK_Y}Z`;
function chick(rise) {
  // its head, round and downy, a little beak and an eye; it comes up from inside the shell (none of it below the shell's broken rim)
  const c = [100.6, 99 - 11 * rise], r = 6.6;
  return `<clipPath id="nh"><path d="M80 60H120V${CRACK_Y + 1}${ZIG.slice().reverse().map((p) => `L${p[0]} ${p[1] + 0.6}`).join("")}L80 ${CRACK_Y + 1}Z"/></clipPath><g clip-path="url(#nh)"><circle cx="${n2(c[0])}" cy="${n2(c[1])}" r="${r}" ${fill("sun")}/><circle cx="${n2(c[0] - 1.6)}" cy="${n2(c[1] - 1.8)}" r="${r - 2.4}" ${fill("sun-lit")}/><path d="M${n2(c[0] + 5)} ${n2(c[1] - 0.6)}L${n2(c[0] + 9.4)} ${n2(c[1] + 0.8)}L${n2(c[0] + 5)} ${n2(c[1] + 2.2)}Z" ${fill("clay")}/><circle cx="${n2(c[0] + 2.6)}" cy="${n2(c[1] - 1.2)}" r="1.15" ${fill("ink")}/><path d="M${n2(c[0] - 2.5)} ${n2(c[1] - 5.8)}L${n2(c[0] - 1.6)} ${n2(c[1] - 9.4)}L${n2(c[0] - 0.4)} ${n2(c[1] - 6.2)}L${n2(c[0] + 0.8)} ${n2(c[1] - 9)}L${n2(c[0] + 1.4)} ${n2(c[1] - 5.9)}Z" ${fill("sun")}/></g>`;
}
const HAPPY_DUR = 2.9;
function happy(t) {
  if (t <= 0.3) return STILL;
  const a = rock(t, 1.0, 4), run = track([[0.95, 0], [1.4, 1, "io"]], t), rise = track([[1.5, 0], [2.3, 1, "io"]], t);
  if (run <= 0.02) return `${OPEN}${BACK}${rocked(a, MIDDLE)}${LEFT}${RIGHT}${WEAVE}</svg>`;
  // the cap: pushed up by the head, then tipping over to the left and coming to rest on the left egg's top
  const lift = track([[1.5, 0], [1.85, 4.5, "out"]], t), tip = track([[1.75, 0], [2.25, 1, "in"]], t), land = track([[2.25, 0], [2.35, 1, "out"]], t);
  const capT = `translate(${n2(-14 * tip)} ${n2(-lift + 9 * tip * tip - 1.5 * land)}) rotate(${n2(-58 * tip)} 100.5 ${CRACK_Y})`;
  const cap = `<clipPath id="nc"><path d="${CAP_CLIP}"/></clipPath><g transform="${capT}"><g clip-path="url(#nc)">${MIDDLE}</g></g>`;
  const shell = `<clipPath id="ns"><path d="${SHELL_CLIP}"/></clipPath><g clip-path="url(#ns)">${MIDDLE}</g>`;
  const egg = rocked(a, `${shell}${rise > 0.01 ? chick(rise) : ""}${crack(run)}`);
  return `${OPEN}${BACK}${egg}${LEFT}${RIGHT}${WEAVE}${rocked(a, cap)}</svg>`;
}

// ---- sad: out of the nest
// the right egg, knocked: it rolls right and up the bowl's inside (behind the weave), over the rim, out, and down into the fork; it turns as it
// goes, coming to lie along the fork
const R0 = [121, 100], PATH = [[0, R0, 0], [0.35, [135, 95], 25], [0.6, [145, 85.5], 55], [0.72, [152, 83.5], 70]], T_HIT = 1.05, T_FALL_END = 1.05 + 0.72 + 0.11, REST = [163, 131], REST_A = 102;
function rightEgg(t) {
  if (t <= T_HIT) return null;
  const s = t - T_HIT;
  if (s <= 0.72) { let k = 1; while (k < PATH.length - 1 && s > PATH[k][0]) k++; const [ta, pa, aa] = PATH[k - 1], [tb, pb, ab] = PATH[k], f = Math.min(1, (s - ta) / (tb - ta)), e = f * f * (3 - 2 * f); return [[pa[0] + (pb[0] - pa[0]) * e, pa[1] + (pb[1] - pa[1]) * e], aa + (ab - aa) * e]; }
  if (t <= T_FALL_END) { const f = (t - T_HIT - 0.72) / 0.11, p = PATH[PATH.length - 1][1]; return [[p[0] + (REST[0] - p[0]) * f, p[1] + (REST[1] - p[1]) * f * f], 70 + (REST_A - 70) * f]; }
  // (it lands in the fork, rocks a little, and lies still)
  return [REST, REST_A - track([[T_FALL_END, 0], [T_FALL_END + 0.08, 9, "out"], [T_FALL_END + 0.18, 0, "in"], [T_FALL_END + 0.24, 2, "out"], [T_FALL_END + 0.3, 0, "in"]], t)];
}
const SAD_DUR = T_FALL_END + 0.6;
function sad(t) {
  if (t <= 0.3) return STILL;
  // the middle egg rocks harder, and knocks the right one (its lean toward it the knock)
  const a = rock(t, T_HIT, 6) + 5 * track([[T_HIT - 0.06, 0], [T_HIT, 1, "out"], [T_HIT + 0.3, 0, "io"]], t);
  const r = rightEgg(t);
  // (inside the bowl it stays behind the weave; once it's up over the rim, clear of the weave, it's drawn in front)
  let behind = RIGHT, front = "";
  if (r) {
    const [p, ang] = r, moved = `<g transform="translate(${n2(p[0] - R0[0])} ${n2(p[1] - R0[1])}) rotate(${n2(ang)} ${R0[0]} ${R0[1]})">${RIGHT}</g>`;
    if (t - T_HIT >= 0.72) { front = moved; behind = ""; } else behind = moved;
  }
  return `${OPEN}${BACK}${rocked(a, MIDDLE)}${LEFT}${behind}${WEAVE}${front}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
