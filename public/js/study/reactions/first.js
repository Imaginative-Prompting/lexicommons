// First's two stories, the medal's own. The still shows the medal's plain back, turned a little: its front, with the laurel and the 1, faces
// the step. Happy: the ribbon's twist lets go, and the medal swings round on it to face us, round and full, its front arriving: a raised 1 in
// a laurel ring, embossed in the medal's own darker gold. It swings past once and back and settles hanging straight, the ribbon lying flat and
// straight down the step. Sad: the medal's weight pulls the ribbon: it creeps over the front edge, slowly and then faster, its end slips off
// the top, the medal drops to the foot of the podium and tips forward flat (front up, its 1 upside down to us), the ribbon slithering down
// after it, its end on the floor. The winner's step is bare.
// Every frame is a pure function of t, in seconds. The still's own numbers: the winner's step's top runs back along (17, -12) (its depth, 20.8
// on the screen; the floor's too), its front face from y 78.6 down to the floor at 171; the ribbon 14 wide across the top and down the front,
// behind the medal; the medal r 19 on an axis at x 90, 5.1 thick, its back turned 22.9° (its face 17.5 across, its edge showing right).
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"144\" width=\"200\" height=\"56\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"19,171 19,165 180,155 200,169 200,200 78,200\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"19,105 36,93 83,93 66,105\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"19\" y=\"104.6\" width=\"46.4\" height=\"66.4\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><polygon points=\"114,79 131,67 131,160 114,171\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"65,79 82,67 131,67 114,79\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"65\" y=\"78.6\" width=\"49.4\" height=\"92.4\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><rect x=\"64.6\" y=\"105\" width=\"0.7\" height=\"66\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"163,123 180,111 180,159 163,171\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"114,123 131,111 180,111 163,123\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"114\" y=\"122.6\" width=\"49.4\" height=\"48.4\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><rect x=\"113.7\" y=\"123\" width=\"0.7\" height=\"48\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"84,79 101,67 115,67 98,79\" fill=\"var(--art-clay-lit,#F6A06F)\"/><path d=\"M84,78.6 L98,78.6 C97.2,90 96.3,102 95.5,113 L85.5,113 C84.9,102 84.4,90 84,78.6 Z\" fill=\"var(--art-clay,#E8743B)\"/><circle cx=\"91\" cy=\"127\" r=\"19\" fill=\"var(--art-sun-deep,#DB9A22)\"/><ellipse cx=\"89\" cy=\"127\" rx=\"17.5\" ry=\"19\" fill=\"var(--art-sun,#F7BE45)\"/></svg>\n";
export const STILL_HASH = "668cd443b1";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 17 || !EL[14].includes("84,78.6 L98,78.6")) throw new Error("first: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const pts = (P) => P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
const DEG = Math.PI / 180;
// the podium (and the floor, its shadow) as the still has it, under everything that moves
const SETTING = EL.slice(0, 13).join("");
const SHADOW_PTS = /points="([^"]+)"/.exec(EL[2])[1];
const DOWN = { "sun-lit": "sun", sun: "sun-deep", "sun-deep": "wood-deep" };
const darker = (svg) => svg.replace(/fill="var\(--art-([a-z-]+),#[0-9A-Fa-f]{6}\)"/g, (m, tok) => (DOWN[tok] ? fill(DOWN[tok]) : m));
const DEPTH = [17 / 20.8, -12 / 20.8], TOP_LEN = 20.8, EDGE_Y = 78.6, FLOOR_Y = 172.5, MEDAL_Y = 127, R = 19;
const AXIS = 90, HALF_THICK = 1 / Math.sin(Math.acos(17.5 / R)), TURN0 = Math.acos(17.5 / R), EDGE_OUT = 1.5 / Math.sin(Math.acos(17.5 / R));

// ---- the medal's front: a laurel ring round a raised 1, in the medal's darker gold, each raised part with its lit edge up and to the left
// (where the light is); drawn about the medal's middle, as seen from in front
// a leaf at angle a along a stem (from the bottom of the ring round one side), leaning out from it or in toward the middle
const leaf = (a, side, out) => {
  const rr = 13.4, x = side * rr * Math.sin(a), y = rr * Math.cos(a);
  const t = [side * Math.cos(a), -Math.sin(a)], n = [side * Math.sin(a), Math.cos(a)], k = out ? 0.75 : -0.55;
  const dl = Math.hypot(t[0] + k * n[0], t[1] + k * n[1]), d = [(t[0] + k * n[0]) / dl, (t[1] + k * n[1]) / dl], q = [-d[1], d[0]];
  const L = 4.4, W = 1.75, tip = [x + d[0] * L, y + d[1] * L], mid = [x + d[0] * L * 0.5, y + d[1] * L * 0.5];
  return `M${n2(x)} ${n2(y)}Q${n2(mid[0] + q[0] * W)} ${n2(mid[1] + q[1] * W)} ${n2(tip[0])} ${n2(tip[1])}Q${n2(mid[0] - q[0] * W)} ${n2(mid[1] - q[1] * W)} ${n2(x)} ${n2(y)}Z`;
};
const LAUREL = [1, -1].flatMap((side) => [0.36, 0.62, 0.88, 1.14, 1.4, 1.66, 1.92, 2.18].map((a, i) => leaf(a, side, i % 2 === 0))).join("")
  // the two stems, thin arcs up each side from the bottom, tied at the foot
  + "M-1.6 13.6A13.6 13.6 0 0 1 -11.6 -6.6L-10.8 -6.2A12.8 12.8 0 0 0 -1.6 12.8ZM1.6 13.6A13.6 13.6 0 0 0 11.6 -6.6L10.8 -6.2A12.8 12.8 0 0 1 1.6 12.8Z"
  + "M-2.4 12.4h4.8v2.4h-4.8Z";
const ONE = "M-2.6 -7.4L1.6 -9.6h1.9v15.4h2.5v2.6h-8.4v-2.6h2.5v-11.2l-2.5 1.2Z";
const FRONT_ART = `<path d="${LAUREL}${ONE}" transform="translate(-0.45 -0.45)" ${fill("sun-lit")}/><path d="${LAUREL}${ONE}" ${fill("sun-deep")}/>`;

// the medal turned psi about its hanging axis (0: its back square to us; the still's 22.9°; 180°: its front square to us): its edge (the
// face behind, as the still draws it) and the face toward us, foreshortened, the front's art on it once it's the front we see
function medal(psi) {
  const c = Math.cos(psi), s = Math.sin(psi), sg = c >= 0 ? 1 : -1, w = R * Math.abs(c);
  const edgeX = AXIS + HALF_THICK * s * sg, faceX = AXIS - HALF_THICK * s * sg, edgeW = w + EDGE_OUT * Math.abs(s);
  let out = `<ellipse cx="${n2(edgeX)}" cy="${MEDAL_Y}" rx="${n2(edgeW)}" ry="${R}" ${fill("sun-deep")}/>`;
  if (w > 0.01) out += `<ellipse cx="${n2(faceX)}" cy="${MEDAL_Y}" rx="${n2(w)}" ry="${R}" ${fill("sun")}/>`;
  if (c < 0 && w > 0.01) out += `<g transform="translate(${n2(faceX)} ${MEDAL_Y}) scale(${n4(-c)} 1)">${FRONT_ART}</g>`;
  return out;
}
const STILL_MEDAL = EL[15] + EL[16];

// ---- the ribbon down the front: the still's strip narrows to 10 at the medal, twisted; k of that twist left (1 the still, 0 flat)
function strip(k) {
  return `<path d="M84,78.6 L98,78.6 C${n2(98 - 0.8 * k)},90 ${n2(98 - 1.7 * k)},102 ${n2(98 - 2.5 * k)},113 L${n2(84 + 1.5 * k)},113 C${n2(84 + 0.9 * k)},102 ${n2(84 + 0.4 * k)},90 84,78.6 Z" ${fill("clay")}/>`;
}
const TOP_BAND = EL[13];

// ---- happy: the twist lets go: the medal swings round to its front, past once and back, and hangs straight; the ribbon flattens
const HAPPY_DUR = 2.3;
function happy(t) {
  if (t <= 0) return STILL;
  const psi = track([[0.2, TURN0], [1.25, 197 * DEG, "io"], [1.6, 176 * DEG, "io"], [1.9, Math.PI, "io"]], t);
  // the ribbon's twist is what turned the medal: as much of it is left as of the turn still to come
  const k = Math.min(1, Math.max(0, (Math.PI - psi) / (Math.PI - TURN0)));
  return `${OPEN}${SETTING}${TOP_BAND}${strip(k)}${medal(psi)}</svg>`;
}

// ---- sad
const SAD_DUR = 2.6;
const T_OFF = 1.2, MEDAL_BOTTOM = MEDAL_Y + R, DROP = FLOOR_Y - (MEDAL_BOTTOM + TOP_LEN), G = 790;
// the medal tipping forward about its foot on the floor by a: the oblique's own way down and toward us (a disc on its edge falls flat)
const tipped = (a, svg) => {
  const c = 0.817 * Math.sin(a), d = Math.cos(a) - 0.577 * Math.sin(a);
  return `<g transform="matrix(1 0 ${n4(c)} ${n4(d)} ${n2(-c * FLOOR_Y)} ${n2(FLOOR_Y - d * FLOOR_Y)})">${svg}</g>`;
};
function sad(t) {
  if (t <= 0) return STILL;
  // the creep: slow while friction holds most of it, faster as more hangs over
  const s = track([[0.2, 0], [0.85, 3.5, "in"], [T_OFF, TOP_LEN, "in"]], t);
  // then free: the medal drops the last bit to the floor (from rest, as gravity has it)
  const tf = Math.max(0, t - T_OFF), tLand = Math.sqrt((2 * DROP) / G), fall = Math.min(DROP, 0.5 * G * tf * tf), dy = s + fall;
  // on its edge, the ribbon behind it pushes it off balance: it tips forward and falls flat, slapping down and settling
  const a = track([[T_OFF + tLand + 0.04, 0], [T_OFF + tLand + 0.42, 90 * DEG, "in"], [T_OFF + tLand + 0.52, 82 * DEG, "out"], [T_OFF + tLand + 0.62, 90 * DEG, "in"]], t);
  // the ribbon's end, off the top, falls down the face behind the medal; its end comes to lie on the floor
  const endY = t <= T_OFF ? EDGE_Y : Math.min(FLOOR_Y, EDGE_Y + 0.5 * G * tf * tf);
  const tongue = track([[1.52, 0], [1.75, 1, "out"]], t);
  const left = TOP_LEN - s;
  const band = left > 0.01 ? (s > 0 ? `<polygon points="${pts([[84, 79], [84 + DEPTH[0] * left, 79 + DEPTH[1] * left], [98 + DEPTH[0] * left, 79 + DEPTH[1] * left], [98, 79]])}" ${fill("clay-lit")}/>` : TOP_BAND) : "";
  const upper = dy > 0.01 ? `<rect x="84" y="${n2(EDGE_Y)}" width="14" height="${n2(dy + 0.4)}" ${fill("clay")}/>` : "";
  const hung = `<g transform="translate(0 ${n2(dy)})">${strip(1)}</g>`;
  const front = endY > EDGE_Y + 0.01 ? `<clipPath id="fr"><rect x="70" y="${n2(endY)}" width="40" height="${n2(200 - endY)}"/></clipPath><g clip-path="url(#fr)">${upper}${hung}</g>` : upper + (dy > 0 ? hung : EL[14]);
  // (on the floor in the podium's shadow, as all of that floor is: a shade down)
  const end = tongue > 0.01 ? `<polygon points="${pts([[96, 171.5], [96 + 20 * tongue, 171.5 + 5.5 * tongue], [96 + 20 * tongue + 7.4, 166.3 + 5.5 * tongue], [103.4, 166.3]])}" ${fill("clay")}/>` : "";
  // the medal: its back to us as it hangs and drops; tipping, the back turns down and away, and past edge-on (60°: the oblique's own
  // eye) its front is what faces up, seen from its far side: drawn mirrored, so the turn shows it upside down
  const back = dy > 0 ? `<g transform="translate(0 ${n2(dy)})">${STILL_MEDAL}</g>` : STILL_MEDAL;
  const d = Math.cos(a) - 0.577 * Math.sin(a);
  const shown = a <= 0 ? back : d >= 0 ? tipped(a, back) : tipped(a, `<g transform="translate(0 ${n2(dy)}) translate(${AXIS} 0) scale(-1 1) translate(${-AXIS} 0)">${medal(Math.PI)}</g>`);
  // lying down, it comes into the podium's shadow on the floor: what of it lies there a shade down, coming in as it lies
  const shade = a > 0 ? `<clipPath id="sh"><polygon points="${SHADOW_PTS}"/></clipPath><g clip-path="url(#sh)" opacity="${n4(Math.min(1, a / (90 * DEG)))}">${darker(shown)}</g>` : "";
  return `${OPEN}${SETTING}${band}${front}${end}${shown}${shade}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
