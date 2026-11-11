// Mountain's story. Happy, a time-lapse of a winter coming: the snow lies deeper and lower, week by week, its line creeping down both faces and down
// the ridges, its teeth reaching further down the slopes: the mountain under a full white crown. Sad, a time-lapse of the snow's own: the cap's lowest tooth shears under its weight and the failure runs up through it. The cap breaks into three
// slabs that slide down the mountain's faces, faster and faster, tumbling, and break up in heaps at its foot. The summit stands bare.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky, the far peak on the left, the mountain and its shaded right face,
// the snowcap (its lit face and its shaded right side, its teeth reaching down to y 96.5), the plain in front (from y 155.5). The mountain is about
// 1.5 km: an avalanche down it takes a minute or two, shown in a few seconds.
import { n2, n4, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M4,157 C14,134 28,112 40,98 C46,91 50,88.5 53,88.5 C57,88.5 62,92 68,99 L70,157 Z\" fill=\"var(--art-violet-lit,#A68CFF)\"/><path d=\"M8,157 C30,136 52,116 66,96 L89,63 C95,56 99,54.5 102,54.5 C103.5,54.5 104.8,54.8 106,55.3 C107.3,55.9 108.5,56.8 110,58 C120,68 130,82 137,92 C143,101 147,108 155,116 C167,127 176,138 191,157 Z\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M106,55.3 Q124,96 153.5,157 L191,157 C176,138 167,127 155,116 C147,108 143,101 137,92 C130,82 120,68 110,58 C108.5,56.8 107.3,55.9 106,55.3 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M66,96 L89,63 C95,56 99,54.5 102,54.5 C103.5,54.5 104.8,54.8 106,55.3 C107.3,55.9 108.5,56.8 110,58 C120,68 130,82 137,92 L127,85 L123.1,92.9 L114,86 L110.5,96.5 L100,86 L89.5,94 L85,84 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M106,55.3 Q113.6,72.4 123.1,92.9 L127,85 L137,92 C130,82 120,68 110,58 C108.5,56.8 107.3,55.9 106,55.3 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><rect y=\"155.5\" width=\"200\" height=\"44.5\" fill=\"var(--art-teal-lit,#6FD0BD)\"/></svg>\n";
export const STILL_HASH = "809a5ba90b";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 7 || !EL[4].includes("L127,85 L123.1,92.9 L114,86 L110.5,96.5")) throw new Error("mountain: the still isn't as this story knows it");
const ROCK = EL.slice(0, 4).join(""), CAP = EL[4] + EL[5], PLAIN = EL[6];
// where it breaks: two ragged lines down through the cap; three slabs (left, middle, right)
const CUT1 = [[96, 40], [93, 58], [97, 68], [91, 80], [93, 104]], CUT2 = [[110, 40], [113, 57], [117, 70], [114, 84], [118, 104]];
const P = (pts) => pts.map(([x, y]) => `${x} ${y}`).join("L");
const CELLS = [`M40 40L${P(CUT1)}L40 104Z`, `M${P(CUT1)}L${P([...CUT2].reverse())}Z`, `M${P(CUT2)}L170 104L170 40Z`];
// each slab: its middle in the still, the way down its face, when it goes (the middle first: its tooth shears), how far it slides, its tumble
const SLABS = [[[80, 78], [-0.65, 0.76], 0.62, 79, -14], [[105, 74], [0, 1], 0.45, 60, 6], [[127, 80], [0.63, 0.77], 0.74, 76, 16]];
const A = 240, FOOT = 156;

// ---- sad: down it all comes
const SAD_DUR = 2.8;
function slab([c, dir, t0, dist, tumble], t, i) {
  const s = Math.max(0, t - t0), slideT = Math.sqrt((2 * dist) / A), f = Math.min(s, slideT), d = 0.5 * A * f * f;
  // (it breaks loose with a lurch, slides, tumbling as it goes; at the foot it shatters down into a low heap)
  const spin = tumble * (d / dist);
  const heap = s > slideT ? track([[0, 0], [0.1, 1, "out"]], s - slideT) : 0;
  const x = c[0] + dir[0] * d, y = c[1] + dir[1] * d;
  const squash = heap > 0 ? ` translate(${n2(x)} ${FOOT}) scale(${n4(1 + 0.7 * heap)} ${n4(1 - 0.62 * heap)}) translate(${n2(-x)} ${-FOOT})` : "";
  return `<clipPath id="sl${i}"><path d="${CELLS[i]}"/></clipPath><g${squash ? ` transform="${squash.trim()}"` : ""}><g transform="translate(${n2(x - c[0])} ${n2(y - c[1])}) rotate(${n2(spin)} ${c[0]} ${c[1]})"><g clip-path="url(#sl${i})">${CAP}</g></g></g>`;
}
function sad(t) {
  if (t <= 0.45) return STILL;
  return `${OPEN}${ROCK}${SLABS.map((s, i) => slab(s, t, i)).join("")}${PLAIN}</svg>`;
}

// ---- happy: a full white crown
// The cap (lit and shaded) is drawn from its parts as the snow comes down: its left end down the left ridge (the still's curve from (66, 96) toward its
// foot), its right end down the right ridge (to (155, 116)), each point of its toothed lower edge moved down its slope, the tooth on the faces' edge
// staying on that edge (the still's curve from the summit, 0.42 of the way along it in the still).
const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const cubicAt = (P, k) => lerp(lerp(lerp(P[0], P[1], k), lerp(P[1], P[2], k), k), lerp(lerp(P[1], P[2], k), lerp(P[2], P[3], k), k), k);
const LEFT_RIDGE = [[8, 157], [30, 136], [52, 116], [66, 96]], RIGHT_RIDGE = [[137, 92], [143, 101], [147, 108], [155, 116]];
const FACE_EDGE = [[106, 55.3], [124, 96], [153.5, 157]], TIP_ON_EDGE = 0.422;
const edgeAt = (v) => lerp(lerp(FACE_EDGE[0], FACE_EDGE[1], v), lerp(FACE_EDGE[1], FACE_EDGE[2], v), v);
// the lower edge's points, right to left (notch, tip on the faces' edge, notch, tip, notch, tip, notch), each from where it is to where it goes
const TEETH = [[[127, 85], [134, 104.5]], null, [[114, 86], [118, 107]], [[110.5, 96.5], [108.5, 121]], [[100, 86], [98, 107.5]], [[89.5, 94], [83, 119]], [[85, 84], [72, 106.5]]];
const pt = ([x, y]) => `${n2(x)},${n2(y)}`;
function crown(p) {
  // the left ridge from where the snow now ends up to (66, 96): the still's curve from k to its end
  const k = 1 - 0.45 * p, L = cubicAt(LEFT_RIDGE, k);
  const L1 = lerp(lerp(LEFT_RIDGE[1], LEFT_RIDGE[2], k), lerp(LEFT_RIDGE[2], LEFT_RIDGE[3], k), k), L2 = lerp(LEFT_RIDGE[2], LEFT_RIDGE[3], k);
  // the right ridge from (137, 92) down to where the snow now ends: the still's curve from its start to p
  const R1 = lerp(RIGHT_RIDGE[0], RIGHT_RIDGE[1], p), R2 = lerp(lerp(RIGHT_RIDGE[0], RIGHT_RIDGE[1], p), lerp(RIGHT_RIDGE[1], RIGHT_RIDGE[2], p), p), R = cubicAt(RIGHT_RIDGE, p);
  const v = TIP_ON_EDGE + 0.16 * p, tip = edgeAt(v), teeth = TEETH.map((m) => (m ? lerp(m[0], m[1], p) : tip));
  const lit = `M${pt(L)} C${pt(L1)} ${pt(L2)} 66,96 L89,63 C95,56 99,54.5 102,54.5 C103.5,54.5 104.8,54.8 106,55.3 C107.3,55.9 108.5,56.8 110,58 C120,68 130,82 137,92 C${pt(R1)} ${pt(R2)} ${pt(R)} ${teeth.map((q) => `L${pt(q)}`).join(" ")} Z`;
  const shade = `M106,55.3 Q${pt(lerp(FACE_EDGE[0], FACE_EDGE[1], v))} ${pt(tip)} L${pt(teeth[0])} L${pt(R)} C${pt(R2)} ${pt(R1)} 137,92 C130,82 120,68 110,58 C108.5,56.8 107.3,55.9 106,55.3 Z`;
  return EL[4].replace(/d="[^"]*"/, `d="${lit}"`) + EL[5].replace(/d="[^"]*"/, `d="${shade}"`);
}
const T_SNOW = 0.3, T_DEEP = 2.4, HAPPY_DUR = T_DEEP + 0.6;
function happy(t) {
  if (t <= T_SNOW) return STILL;
  // (the first hair of it is the still itself)
  const p = track([[T_SNOW, 0], [T_DEEP, 1, "io"]], t);
  if (p < 0.002) return STILL;
  return `${OPEN}${ROCK}${crown(p)}${PLAIN}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
