// Second's two stories, the ribbon's: it was hung with a half-twist in it, and the twist lets go, turning the medal on it. Happy: it turns half round,
// past, back, and settles, its eye seated in the ring, its face (the laurels) to us. Sad: as it turns edge-on its eye works off the open split ring;
// it drops, lands on its rim at the foot of the step and topples forward, face down, into the podium's shadow, under an empty ribbon.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor, the podium's shadow, the three blocks (second at left,
// its front face x 19-65.4, y 104.6-171), the ribbon over its top and down its front to y 133, the medal hanging from it: its back to us, turned 23
// degrees, the plain back face (steel) and its rim beyond it (steel-deep), about (41.4, 147), r 16, 4 thick.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"144\" width=\"200\" height=\"56\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"19,171 19,165 180,155 200,169 200,200 78,200\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"19,105 36,93 83,93 66,105\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"19\" y=\"104.6\" width=\"46.4\" height=\"66.4\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><polygon points=\"114,79 131,67 131,160 114,171\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"65,79 82,67 131,67 114,79\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"65\" y=\"78.6\" width=\"49.4\" height=\"92.4\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><rect x=\"64.6\" y=\"105\" width=\"0.7\" height=\"66\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"163,123 180,111 180,159 163,171\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"114,123 131,111 180,111 163,123\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"114\" y=\"122.6\" width=\"49.4\" height=\"48.4\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><rect x=\"113.7\" y=\"123\" width=\"0.7\" height=\"48\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"35,105 52,93 64.6,93 47.6,105\" fill=\"var(--art-clay-lit,#F6A06F)\"/><path d=\"M35,104.6 L47.6,104.6 C46.9,114 46.1,124 45.4,133 L36.2,133 C35.7,124 35.3,114 35,104.6 Z\" fill=\"var(--art-clay,#E8743B)\"/><circle cx=\"42.2\" cy=\"147\" r=\"16\" fill=\"var(--art-steel-deep,#6B687A)\"/><ellipse cx=\"40.6\" cy=\"147\" rx=\"14.7\" ry=\"16\" fill=\"var(--art-steel,#A9B0BF)\"/></svg>\n";
export const STILL_HASH = "b7cf4bb4df";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 17 || !EL[16].includes('cx="40.6"')) throw new Error("second: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const SCENE = EL.slice(0, 15 - 2).join(""), RIBBON = EL[13] + EL[14];
const C = [41.4, 147], R = 16, HALF_T = 2.02, A0 = (23.3 * Math.PI) / 180;

// its face: a bold 2 struck in the middle, a laurel ring round it, both in relief: lit on their upper-left edges, dark on their lower-right (in the face's
// own frame, r 16; squeezed by its turn)
const LEAF = (x, y, a) => { const c = Math.cos(a), s = Math.sin(a), p = (u, v) => `${n2(x + c * u - s * v)} ${n2(y + s * u + c * v)}`; return `M${p(0, 0)}Q${p(2.6, -2.1)} ${p(5.4, 0)}Q${p(2.6, 2.1)} ${p(0, 0)}Z`; };
const BRANCH = (d) => [[0.6, 12.4], [-4.8, 10.6], [-9.2, 6.8], [-11.6, 1.6], [-12, -3.8], [-10.4, -9.2]].map(([x, y], i) => LEAF(d * x, y, d > 0 ? (-2.2 + i * 0.42) : Math.PI + 2.2 - i * 0.42)).join("");
const LAURELS = BRANCH(1) + BRANCH(-1);
const TWO = "M-4.8 -2.6C-4.8 -6 -2.4 -7.6 .2 -7.6C3 -7.6 5 -5.8 5 -3C5 -.8 3.6 .8 1.4 2.6L-1.2 4.6H5V7.6H-5V5L.6 -.4C1.6 -1.3 2 -2.1 2 -3C2 -4.2 1.3 -4.9 .1 -4.9C-1.1 -4.9 -1.9 -4.1 -1.9 -2.6Z";
const FACE = `<path transform="translate(-.6 -.6)" d="${LAURELS}" ${fill("paper")}/><path transform="translate(.35 .35)" d="${LAURELS}" ${fill("steel-deep")}/>`
  + `<path transform="translate(.9 .9)" d="${TWO}" ${fill("steel-deep")}/><path d="${TWO}" ${fill("paper")}/>`;
// the medal turned a (the still's back to us at A0): the face toward us and, beyond it, the other face showing as its rim; front or back by which
// way it faces; tone darkens it where it hangs in shade
function medal(a, cx = C[0], cy = C[1], shade = false) {
  // (near edge-on the two faces' offsets ease through zero together, so the edge band stays whole and centered as the faces swap)
  const c = Math.cos(a), s = Math.sin(a), g = Math.max(-1, Math.min(1, c / 0.15)), d = HALF_T * s * g, rx = R * Math.abs(c);
  const rim = `<ellipse cx="${n2(cx + d)}" cy="${n2(cy)}" rx="${n2(rx + 1.3 * Math.abs(g) + 2 * (1 - Math.abs(g)))}" ry="${R}" ${fill(shade ? "ink-lit" : "steel-deep")}/>`;
  const face = rx > 0.05 ? `<ellipse cx="${n2(cx - d)}" cy="${n2(cy)}" rx="${n2(rx)}" ry="${R}" ${fill(shade ? "steel-deep" : "steel")}/>` : "";
  const laurels = c < 0 && rx > 0.6 ? `<g transform="translate(${n2(cx - d)} ${n2(cy)}) scale(${n4(Math.abs(c))} 1)">${FACE}</g>` : "";
  return rim + face + laurels;
}
// the twist letting go, from rest: a half turn about the ribbon, past and back, its swing dying away
const unwind = (t, t0 = 0.35) => { const s = Math.max(0, t - t0), w = 2 * Math.PI / 1.8, l = 0.7 * w; return A0 + Math.PI * (1 - Math.exp(-l * s) * (Math.cos(w * s) + 0.7 * Math.sin(w * s))); };

const RING = `<path d="M41.5 131.2a3.3 3.3 0 1 0 .01 0Zm0 1.5a1.8 1.8 0 1 1-.01 0Z" fill-rule="evenodd" ${fill("steel-deep")}/>`;

// ---- happy: its face comes round
const HAPPY_DUR = 2.8;
function happy(t) {
  if (t <= 0) return STILL;
  return `${OPEN}${SCENE}${RING}${RIBBON}${medal(unwind(t))}</svg>`;
}

// ---- sad: it comes off the ring
const SAD_DUR = 2.6, G = 4500, FLOOR = 171, K = 0.3;
// the moment it turns edge-on (a quarter round from its back): the eye slips off
const T_OFF = (() => { for (let t = 0.35; t < 2; t += 0.001) if (unwind(t) >= Math.PI / 2) return t; return 1; })();
// (its turn going on as it falls, at the speed it came off with)
const SPIN = (unwind(T_OFF + 0.001) - unwind(T_OFF - 0.001)) / 0.002;
const DROP = FLOOR - (C[1] + R);
const T_LAND = Math.sqrt((2 * DROP) / G);
// the topple from its rim onto its face, from a small lean, its speed growing as it goes (a 7 cm disc), worked out once
const FALL = (() => { const S = [[0, 0.08]]; let a = 0.08, w = 0.6, s = 0; while (a < Math.PI / 2) { w += 210 * Math.sin(a) / 4000; a += w / 4000; s += 1 / 4000; S.push([s, Math.min(a, Math.PI / 2)]); } return S; })();
const T_FLAT = FALL[FALL.length - 1][0];
// (the split ring on the ribbon's end, there all along: hidden behind the ribbon's end and the medal's top until the medal comes off it)
function sad(t) {
  if (t <= 0) return STILL;
  if (t < T_OFF) return `${OPEN}${SCENE}${RING}${RIBBON}${medal(unwind(t))}</svg>`;
  const s = t - T_OFF, a = Math.PI / 2 + SPIN * s;
  // falling, still turning a little, its foot to the floor at the step's foot
  if (s < T_LAND) return `${OPEN}${SCENE}${RING}${RIBBON}${medal(a, C[0], C[1] + 0.5 * G * s * s)}</svg>`;
  // on the floor: up on its rim (the rim's grip stops its turn as it lands), it topples forward, toward us, onto its face: everything at height h comes down to FLOOR - h (cos b - K sin b);
  // past edge-on its back lies up, flat, in the podium's shadow
  const r = s - T_LAND, b = r < T_FLAT ? FALL[Math.min(FALL.length - 1, Math.floor(r * 4000))][1] : Math.PI / 2, f = Math.cos(b) - K * Math.sin(b);
  // (it goes into the podium's shadow as it comes down onto the floor: the shade comes over it in the first tenth of a second there)
  const lit = Math.max(0, 1 - r / 0.1), aLand = Math.PI / 2 + SPIN * T_LAND;
  const up = `<g transform="translate(0 ${FLOOR}) scale(1 ${n4(f)}) translate(0 ${-FLOOR})">${medal(aLand, C[0], FLOOR - R, true)}${lit > 0.004 ? `<g opacity="${n4(lit)}">${medal(aLand, C[0], FLOOR - R)}</g>` : ""}</g>`;
  const flat = `<ellipse cx="${n2(C[0] + 1)}" cy="${n2(FLOOR + 1)}" rx="${R + 1}" ry="${n2(-f * R + 1)}" ${fill("ink-lit")}/><ellipse cx="${C[0]}" cy="${FLOOR}" rx="${R}" ry="${n2(-f * R)}" ${fill("steel-deep")}/>`;
  return `${OPEN}${SCENE}${RING}${RIBBON}${f > 0 ? up : `<g transform="translate(0 ${n2(-f * R)})">${flat}</g>`}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
