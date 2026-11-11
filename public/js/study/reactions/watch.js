// Watch's two stories. Happy, the watch's own, a time-lapse: it keeps time; its hands sweep round from 10:10 to 4:10, six hours, and as
// the sun goes over, its shadow swings round on the table from long to the right, shorter at midday, to long down to the left. Sad, its
// strap's: the buckle was never done up; the tongue slides out of it, the loop slackens and the watch leans; the loop lets go, the case
// drops to the table and topples forward onto its face (true gravity: the 40 mm case is 80 here); it lies there face down, its back
// up, the loop fallen fully open: its two strap halves lie out on either side, their ends lifting and settling.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the table (from y 153), the shadow (long, to the
// right), the loop's far side (its inside), the case (its side, its bezel), the strap's top arch, the face, its four marks, the hands
// (about (81.8, 95.7)), the crown, the strap's bottom; the loop stands on the table at y 178.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<rect x=\"0\" y=\"153\" width=\"200\" height=\"47\" fill=\"var(--art-teal-lit,#6FD0BD)\"/>\n<path d=\"M76 170 C91 164 111 166 127 171 L200 190 L200 200 L130 200 L79 180 C73 178 71 174 76 170Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M89 23 C101 21 119 22 125 25 C139 31 145 61 145 90 C146 120 140 154 130 170 C127 175 123 178 118 178 L96 172 L103 138 L111 92 L105 52Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M107 46 C111 46 113 48 114 53 L116 63 C117 67 123 73 126 80 C130 88 131 96 129 107 C128 117 123 124 116 132 C113 137 113 144 110 147 C108 149 104 150 100 149 L62 149 C58 148 57 144 56 139 L53 131 C52 128 47 125 44 120 C36 108 36 92 42 80 C45 73 50 68 53 64 L59 50 C61 46 63 45 67 46Z\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n<path d=\"M63 46 C66 45 69 47 71 50 L104 48 L110 47 C109 53 109 59 110 63 C111 67 117 72 120 79 C125 89 125 101 122 111 C120 120 114 126 109 131 C107 135 108 144 104 148 C102 150 99 148 96 147 L65 149 C59 150 57 147 56 142 L53 132 C52 129 49 128 46 124 C35 111 36 92 42 79 C45 72 50 68 53 64 L58 51 C59 48 61 46 63 46Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M61.4 56.8 C64 43 70 31 79 26 C85 22 92 22.2 103 22.1 C112 22 122 22.4 126.5 25.1 C116 24 107.3 41.7 104.1 55.9 C103.9 57 103.3 56.7 102.4 56.3 C89.3 49.7 75.5 51 62.4 57.4 C61.6 57.8 61.2 57.4 61.4 56.8Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<ellipse cx=\"81.5\" cy=\"96.5\" rx=\"36.9\" ry=\"37.9\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<rect x=\"82\" y=\"61.1\" width=\"2.3\" height=\"7.2\" fill=\"var(--art-ink,#231F3B)\"/>\n<rect x=\"47.4\" y=\"95\" width=\"7\" height=\"2.4\" fill=\"var(--art-ink,#231F3B)\"/>\n<rect x=\"109.5\" y=\"95\" width=\"7\" height=\"2.4\" fill=\"var(--art-ink,#231F3B)\"/>\n<rect x=\"81\" y=\"124.5\" width=\"2.3\" height=\"7.3\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M80.3 97.6 L63.2 85 C60.4 82.9 63.2 79.7 65.6 81.7 L83.4 94.7 C85.5 96.4 82.8 99.4 80.3 97.6Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M81.4 93.8 L110 78.5 C112.1 77.3 113.8 80.1 111.7 81.4 L83.6 97.6Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<circle cx=\"81.8\" cy=\"95.7\" r=\"4.6\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M128.2 88.9 L130.6 88.9 C134 88.9 134.9 91.3 134.9 95.5 C134.9 100.7 134.6 104 131.3 104.1 L128.1 104.1 C125.5 104.1 125.1 101.8 125.2 97 C125.2 92.2 125.7 89.3 128.2 88.9Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M61 136.7 C61.1 136 61.4 136 62.2 136.5 C74.5 142.7 88.3 142.9 100.7 137.4 C101.8 136.9 102.2 137.2 102.4 138.4 C105.4 157.1 106.4 176 119.4 176.5 C113.3 179 94.8 179.3 82.2 178 C68.4 176.8 60.5 161.4 61 136.7Z\" fill=\"var(--art-clay,#E8743B)\"/>\n</svg>\n";
export const STILL_HASH = "ca64df3f28";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 17 || !EL[2].includes("M76 170 C91 164")) throw new Error("watch: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const HUB = [81.8, 95.7], BASE = 178, K = 0.25;
// the shadow, its edges carried on past the frame to its far end (the still's own lines inside it)
const SHADOW_D = "M76 170C91 164 111 166 127 171L330 223.84C344 228 344 274 330 278.43L79 180C73 178 71 174 76 170Z";
const SHADOW_FILL = /fill="[^"]+"/.exec(EL[2])[0];
const P0 = [101, 174], A0 = Math.atan2((251 - P0[1]) / K, 330 - P0[0]);
// a turn of beta in the table's own plane (the table seen at a slant: K of its depth on the screen per unit) with the shadow stretched
// l times along where it first lay, about the watch's foot, as the screen's matrix
function onTable(beta, l) {
  const c0 = Math.cos(A0), s0 = Math.sin(A0), cb = Math.cos(beta), sb = Math.sin(beta);
  // stretch along A0: R(A0) diag(l, 1) R(-A0)
  const a = c0 * c0 * l + s0 * s0, b = c0 * s0 * (l - 1), d = s0 * s0 * l + c0 * c0;
  const f11 = cb * a - sb * b, f12 = cb * b - sb * d, f21 = sb * a + cb * b, f22 = sb * b + cb * d;
  const m11 = f11, m12 = f12 / K, m21 = K * f21, m22 = f22;
  return `matrix(${n4(m11)} ${n4(m21)} ${n4(m12)} ${n4(m22)} ${n2(P0[0] - m11 * P0[0] - m12 * P0[1])} ${n2(P0[1] - m21 * P0[0] - m22 * P0[1])})`;
}
const shadow = (tr) => `<path d="${SHADOW_D}" transform="${tr}" ${SHADOW_FILL}/>`;

// ---- happy: the day goes by
const HAPPY_DUR = 2.8;
function happy(t) {
  if (t <= 0) return STILL;
  // the lapse runs up to speed and slows to a stop: six hours; the sun's way round the sky turns the shadow a quarter round on the table,
  // shorter as the sun climbs to midday, longer again as it goes down
  const u = track([[0.3, 0], [2.45, 1, "io"]], t), l = track([[0.3, 1], [1.37, 0.62, "io"], [2.45, 1.12, "io"]], t);
  const hand = (el, deg) => (deg ? `<g transform="rotate(${n2(deg)} ${HUB[0]} ${HUB[1]})">${el}</g>` : el);
  return `${OPEN}${EL[0]}${EL[1]}${shadow(onTable((Math.PI / 2) * u, l))}${EL.slice(3, 12).join("")}${hand(EL[12], 180 * u)}${hand(EL[13], 2160 * u)}${EL.slice(14).join("")}</svg>`;
}

// ---- sad: the strap lets go
const SAD_DUR = 2.6, T_LET = 0.95, G = 19600, DROP = 24;
// the topple, from the lean the slip gave it, about the foot's front edge: a body 78 mm tall falling over, its angle's speed growing as it
// goes (3g/2L sin a), worked out once in small steps
const FALL = (() => {
  const S = [[0, 0.12]];
  let a = 0.12, w = 0.37, s = 0;
  const dt = 1 / 4000;
  while (a < Math.PI / 2) { w += 188 * Math.sin(a) * dt; a += w * dt; s += dt; S.push([s, Math.min(a, Math.PI / 2)]); }
  return S;
})();
const T_DOWN = FALL[FALL.length - 1][0];
function tilt(t) {
  if (t <= T_LET) return 0.12 * track([[0.3, 0], [T_LET, 1, "in"]], t);
  const s = t - T_LET;
  if (s < T_DOWN) { const i = Math.min(FALL.length - 1, Math.floor(s * 4000)); return FALL[i][1]; }
  return Math.PI / 2;
}
// the slip: the tongue sliding out of the buckle, the loop growing (its far side going back, its top arch reaching further round)
const loose = (s) => [
  `<g transform="translate(${n2(5.5 * s)} 0) translate(0 ${BASE}) scale(1 ${n4(1 + 0.02 * s)}) translate(0 ${-BASE})">${EL[3]}</g>`,
  `<g transform="translate(61 56) scale(${n4(1 + 0.08 * s)} ${n4(1 + 0.03 * s)}) translate(-61 -56)">${EL[6]}</g>`,
  `<g transform="translate(61 137) scale(${n4(1 + 0.05 * s)} 1) translate(-61 -137)">${EL[16]}</g>`,
];
// the watch lying face down, the loop fallen fully open: the case back up, raised by the case's thickness over its side, the crown at three
// o'clock; its two strap halves lying out along the table on either side (the still's depth runs to the right: the buckle half, from twelve
// o'clock, toward us and so to the left, the holed half, from six, away and to the right), each keeping a little of its curl, its end
// lifted; short shadows down the light
const CC = [98, 173], R = 41, RY = 12, THICK = 16;
const CASE = `<ellipse cx="${CC[0] + 24}" cy="${CC[1] + 7}" rx="${R}" ry="${RY}" ${fill("teal-deep")}/>`
  + `<path d="M${CC[0] - R} ${CC[1] - THICK}V${CC[1]}A${R} ${RY} 0 0 0 ${CC[0] + R} ${CC[1]}V${CC[1] - THICK}Z" ${fill("ink")}/>`
  + `<rect x="${CC[0] + R - 1}" y="${CC[1] - THICK / 2 - 3}" width="7" height="8" rx="2" ${fill("ink-lit")}/>`
  + `<ellipse cx="${CC[0]}" cy="${CC[1] - THICK}" rx="${R}" ry="${RY}" ${fill("ink-lit")}/><ellipse cx="${CC[0]}" cy="${CC[1] - THICK}" rx="${R - 9}" ry="${RY - 2.8}" ${fill("steel-deep")}/>`;
// a strap half from its root at the case's edge along dir, `len` long times how far it has swung out (open), 10 across as the table shows
// its width, its edge below it; its last part rising off the table by up to 11 (lift); its shadow under the rise
function half(root, dir, len, open, lift, end) {
  const n = 10, top = [], bot = [], L = len * open;
  for (let i = 0; i <= n; i++) {
    const s = i / n, rise = lift * 11 * Math.max(0, (s - 0.62) / 0.38) ** 2, x = root[0] + dir[0] * L * s, y = root[1] + dir[1] * L * s - rise;
    top.push([x, y - 6]); bot.push([x, y + 6]);
  }
  const P = (A) => A.map((p) => `${n2(p[0])} ${n2(p[1])}`).join(" ");
  const edge = [...bot.map(([x, y]) => [x, y + 2.6])].reverse();
  const tip = top[n], tail = bot[n];
  const shade = lift > 0.02 ? `<path d="M${P(bot.slice(7))} L${n2(tail[0] + 4 * Math.sign(dir[0]))} ${n2(root[1] + dir[1] * L + 6.5)} L${n2(bot[7][0] + 2)} ${n2(bot[7][1] + 2.5)}Z" ${fill("teal-deep")}/>` : "";
  return `${shade}<path d="M${P(bot)} ${P(edge)}Z" ${fill("clay-deep")}/><path d="M${P(top)} ${P([...bot].reverse())}Z" ${fill("clay")}/>${end(top, bot, tip, tail)}`;
}
const unit = (x, y) => { const l = Math.hypot(x, y); return [x / l, y / l]; };
const D12 = unit(-1, 0.18), D6 = unit(1, -0.2), ROOT12 = [CC[0] - 38, CC[1] + 4], ROOT6 = [CC[0] + 36, CC[1] - 8];
// (the buckle at the end of the twelve o'clock half: its steel frame, the tongue's pin lying along it; the holes along the six o'clock half)
const buckle = (top, bot, tip, tail) => {
  // (the frame round the strap's end and on past it, its edge below it; the pin lying back along the strap)
  const x0 = Math.min(tip[0], tail[0]) - 11, x1 = Math.max(tip[0], tail[0]) + 2, y0 = Math.min(tip[1], tail[1]) - 2.5, y1 = Math.max(tip[1], tail[1]) + 2.5;
  const ring = (dy, tone) => `<path d="M${n2(x0)} ${n2(y0 + dy)}H${n2(x1)}V${n2(y1 + dy)}H${n2(x0)}Z M${n2(x0 + 2.6)} ${n2(y0 + 2.6 + dy)}V${n2(y1 - 2.6 + dy)}H${n2(x1 - 2.6)}V${n2(y0 + 2.6 + dy)}Z" fill-rule="evenodd" ${fill(tone)}/>`;
  return `${ring(1.8, "steel-deep")}${ring(0, "steel")}<rect x="${n2(x0 + 1)}" y="${n2((y0 + y1) / 2 - 0.9)}" width="${n2(x1 - x0 + 4)}" height="1.8" ${fill("steel")}/>`;
};
const holes = (top, bot) => [4, 5.5, 7].map((i) => { const k = Math.floor(i), f = i - k, y = (top[k][1] + bot[k][1]) / 2 + ((top[k + 1][1] + bot[k + 1][1]) / 2 - (top[k][1] + bot[k][1]) / 2) * f, x = top[k][0] + (top[k + 1][0] - top[k][0]) * f; return `<ellipse cx="${n2(x)}" cy="${n2(y)}" rx="2.2" ry="1.4" ${fill("ink")}/>`; }).join("");
const lying = (open, lift) => `${half(ROOT6, D6, 58, open, lift, holes)}${CASE}${half(ROOT12, D12, 42, open, lift, buckle)}`;
function sad(t) {
  if (t <= 0) return STILL;
  const a = tilt(t), s = track([[0.3, 0], [T_LET, 1, "in"]], t), after = Math.max(0, t - T_LET);
  // the forward turn seen from the front: everything at height h comes down to BASE - h (cos a - K sin a), past the edge-on (where that is
  // nothing) the watch lies face down and the other side of it shows
  const f = Math.cos(a) - K * Math.sin(a), drop = Math.min(DROP, 0.5 * G * after * after);
  // its shadow goes down with it, to nothing where it stood
  const sh = Math.max(0, f);
  const under = sh > 0.004 ? shadow(`translate(${P0[0]} ${P0[1]}) scale(${n4(sh)}) translate(${-P0[0]} ${-P0[1]})`) : "";
  if (f > 0) {
    const [far, arch, bottom] = s > 0 ? loose(s) : [EL[3], EL[6], EL[16]];
    const body = `${far}${EL[4]}${EL[5]}${arch}${EL.slice(7, 16).join("")}${bottom}`;
    const tr = `translate(0 ${BASE}) scale(1 ${n4(f)}) translate(0 ${n2(-BASE + drop)})`;
    // (the loop's foot can't go through the table: what of it the drop takes down is flattened there, out of sight)
    const clip = drop > 0 ? `<clipPath id="tb"><rect x="0" y="0" width="200" height="${BASE + 1}"/></clipPath>` : "";
    return `${OPEN}${EL[0]}${EL[1]}${under}${clip}<g${drop > 0 ? ' clip-path="url(#tb)"' : ""}><g transform="${tr}">${body}</g></g></svg>`;
  }
  // (the halves swing out and down onto the table as it lands, then their ends, still curled, lift and settle)
  const lie = -f / K, landed = Math.max(0, t - T_LET - T_DOWN), open = track([[0, 0.55], [0.14, 1, "out"]], landed);
  const lift = track([[0.1, 0], [0.24, 1.25, "out"], [0.45, 1, "io"]], landed);
  return `${OPEN}${EL[0]}${EL[1]}${under}<g transform="translate(0 ${BASE}) scale(1 ${n4(lie)}) translate(0 ${-BASE})">${lying(open, lift)}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
