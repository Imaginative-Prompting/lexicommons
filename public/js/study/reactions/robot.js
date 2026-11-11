// Robot's story: the arm lowers the cube it holds onto the cube below.
// Happy: it sets it down square, opens its fingers, and lifts away and back: a two-cube tower, built.
// Sad: its move overshoots to the right: it sets the cube down half off the lower one's edge and lets go, and the cube, its weight past that edge,
// tips over it and tumbles down to the floor beside, landing on its side. The arm, open, lifts away over the one cube left.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor, the shadow, the base and its column, the upper arm
// (from the shoulder at 51.5, 112 to the elbow at 90, 42: 79.9 long), the forearm (from the elbow to the wrist at 143, 66: 58.2 long), the lower
// cube (its front 120-152 across, 143-175 down, its top and side receding 13 right and 8 up), the left finger, the held cube (its front 121-153 by
// 99-131), the right finger, the wrist's block, and the three joints. The gripper hangs level from the wrist. The cubes (10 cm) are 32: 320 to the
// meter, gravity 3140.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect y=\"157\" width=\"200\" height=\"43\" fill=\"var(--art-sun-lit,#FAD57E)\"/><polygon points=\"70,175 88,167 165,167 187,180 181,189 108,189\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M20 146.6V168A34.3 7 0 0 0 88.6 168V146.6Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M72 152.6A34.3 7 0 0 0 88.6 146.6V168A34.3 7 0 0 1 72 174Z\" fill=\"var(--art-ink,#231F3B)\"/><ellipse cx=\"54.3\" cy=\"146.6\" rx=\"34.3\" ry=\"7\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M38 110H68V146Q53 151 38 146Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M38 110H58V148.2Q47 148.8 38 146Z\" fill=\"var(--art-clay,#E8743B)\"/><polygon points=\"41,106.2 79.5,36.2 100.5,47.8 62,117.8\" fill=\"var(--art-clay,#E8743B)\"/><polygon points=\"94,49.7 100.5,47.8 62,117.8 55.5,114.2\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"93.4,34.7 146.4,59.2 139.6,73.8 86.6,49.3\" fill=\"var(--art-clay,#E8743B)\"/><polygon points=\"89.2,43.8 142.2,68.3 139.6,73.8 86.6,49.3\" fill=\"var(--art-clay-deep,#C25626)\"/><rect x=\"120\" y=\"143\" width=\"32\" height=\"32\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"120,143 133,135 165,135 152,143\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><polygon points=\"152,143 165,135 165,167 152,175\" fill=\"var(--art-sky-deep,#3488C9)\"/><polygon points=\"140,77 140,83 122,88 122,121 113,121 113,84\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"121\" y=\"99\" width=\"32\" height=\"32\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"121,99 134,91 166,91 153,99\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><polygon points=\"153,99 166,91 166,123 153,131\" fill=\"var(--art-sky-deep,#3488C9)\"/><polygon points=\"174,84 178,82 178,119 174,121\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"147,77 147,83 165.5,88 165.5,121 174,121 174,84\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"137\" y=\"72\" width=\"13\" height=\"12\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"54.5\" cy=\"112\" r=\"19\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"51.5\" cy=\"112\" r=\"19\" fill=\"var(--art-ink-lit,#3A3460)\"/><circle cx=\"93\" cy=\"42\" r=\"17\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"90\" cy=\"42\" r=\"17\" fill=\"var(--art-ink-lit,#3A3460)\"/><circle cx=\"145.5\" cy=\"66\" r=\"12\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"143\" cy=\"66\" r=\"12\" fill=\"var(--art-ink-lit,#3A3460)\"/></svg>\n";
export const STILL_HASH = "af0c53de60";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 28 || !EL[16].includes('x="121" y="99" width="32" height="32"') || !EL[12].includes('x="120" y="143"')) throw new Error("robot: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BASE = EL.slice(0, 8).join(""), UPPER = EL[8] + EL[9], FORE = EL[10] + EL[11], LOWER = EL.slice(12, 15).join(""), LEFT = EL[15], RIGHT = EL[19] + EL[20], BLOCK = EL[21];
const S = [51.5, 112], E0 = [90, 42], W0 = [143, 66], L1 = Math.hypot(E0[0] - S[0], E0[1] - S[1]), L2 = Math.hypot(W0[0] - E0[0], W0[1] - E0[1]);
const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
// the elbow for a wrist at w (elbow up, as it is)
function elbow(w) {
  const d = Math.hypot(w[0] - S[0], w[1] - S[1]), a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)))), dir = ang(S, w) - a;
  return [S[0] + L1 * Math.cos(dir), S[1] + L1 * Math.sin(dir)];
}
const deg = (r) => (r * 180) / Math.PI;
// a cube: its front square's middle c, turned a (degrees), its faces receding 13 right and 8 up; the faces that show lit by which way they face
const D = [13, -8], HALF = 16;
function cube(c, a) {
  const r = (a * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
  const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [c[0] + HALF * (x * co - y * si), c[1] + HALF * (x * si + y * co)]);
  const pt = (p) => `${n2(p[0])},${n2(p[1])}`;
  let faces = "";
  for (let i = 0; i < 4; i++) {
    const p = P[i], q = P[(i + 1) % 4], n = [q[1] - p[1], -(q[0] - p[0])];
    if (n[0] * D[0] + n[1] * D[1] <= 0) continue;
    // (lit as much as it faces up rather than right: a face turning from one to the other changes shade smoothly)
    const m = Math.hypot(n[0], n[1]), quad = `points="${pt(p)} ${pt([p[0] + D[0], p[1] + D[1]])} ${pt([q[0] + D[0], q[1] + D[1]])} ${pt(q)}"`;
    const w = Math.max(0, Math.min(1, ((-n[1] - n[0]) / m + 1) / 2));
    faces += w >= 0.999 ? `<polygon ${quad} ${fill("sky-lit")}/>` : w <= 0.001 ? `<polygon ${quad} ${fill("sky-deep")}/>` : `<polygon ${quad} ${fill("sky-deep")}/><polygon ${quad} ${fill("sky-lit")} opacity="${n4(w)}"/>`;
  }
  return `${faces}<polygon points="${P.map(pt).join(" ")}" ${fill("sky")}/>`;
}
const C0 = [137, 115];
// the arm drawn for a wrist at w, its fingers opened by f degrees, the held cube (or wherever the cube is) between the fingers' layers
function arm(w, f, cubeSvg) {
  const e = elbow(w), t1 = deg(ang(S, e) - ang(S, E0)), t2 = deg(ang(e, w) - ang(E0, W0)), dw = [w[0] - W0[0], w[1] - W0[1]], de = [e[0] - E0[0], e[1] - E0[1]];
  const at = (d) => `translate(${n2(d[0])} ${n2(d[1])})`;
  const left = `<g transform="${at(dw)} rotate(${n2(f)} 140 80)">${LEFT}</g>`, right = `<g transform="${at(dw)} rotate(${n2(-f)} 147 80)">${RIGHT}</g>`;
  return `<g transform="rotate(${n4(t1)} ${S[0]} ${S[1]})">${UPPER}</g><g transform="${at(de)} rotate(${n4(t2)} ${E0[0]} ${E0[1]})">${FORE}</g>${LOWER}${left}${cubeSvg}${right}<g transform="${at(dw)}">${BLOCK}</g>${EL[22]}${EL[23]}<g transform="${at(de)}">${EL[24]}${EL[25]}</g><g transform="${at(dw)}">${EL[26]}${EL[27]}</g>`;
}

// ---- happy: built
const HAPPY_DUR = 2.0;
function happy(t) {
  if (t <= 0.3) return STILL;
  // down 12 (the cube onto the other), fingers open, then up and back toward the base
  const down = 12 * track([[0.3, 0], [0.9, 1, "io"]], t), open = 13 * track([[0.95, 0], [1.15, 1, "out"]], t), away = track([[1.2, 0], [1.85, 1, "io"]], t);
  const w = [W0[0] - 22 * away, W0[1] + down - 30 * away];
  const held = [C0[0], C0[1] + down];
  return `${OPEN}${BASE}${arm(w, open, cube(held, 0))}</svg>`;
}

// ---- sad: dropped off the edge
// the move overshoots 19 right as it comes down; let go, the cube pivots on the lower cube's top right edge (152, 143), its weight 4 past it, and
// goes over (gravity: g r / (r^2 + k^2) = 117 a second a second), leaves the edge, falls and lands on its side on the floor (its foot at 175)
const OVER = 19, EDGE = [152, 143], T_LET = 1.0;
const TIP = (() => { const S2 = []; let a = 0, w = 0; const dt = 1 / 4000, a0 = Math.atan2(4, 16); while (a < 0.75) { S2.push(a); w += 117 * Math.sin(a0 + a) * dt; a += w * dt; } return { S2, w }; })();
const T_OFF = T_LET + 0.05 + (TIP.S2.length - 1) / 4000;
const REST = [179, 159], FALL = Math.sqrt((2 * 26) / 3140) + 0.06, T_DOWN = T_OFF + FALL;
function falling(t) {
  // [middle of its front, its turn]
  const set = [C0[0] + OVER, C0[1] + 12];
  if (t <= T_LET + 0.05) return [set, 0];
  const r0 = [set[0] - EDGE[0], set[1] - EDGE[1]];
  if (t <= T_OFF) { const a = TIP.S2[Math.round((t - T_LET - 0.05) * 4000)], co = Math.cos(a), si = Math.sin(a); return [[EDGE[0] + r0[0] * co - r0[1] * si, EDGE[1] + r0[0] * si + r0[1] * co], deg(a)]; }
  const a1 = TIP.S2[TIP.S2.length - 1], from = [EDGE[0] + r0[0] * Math.cos(a1) - r0[1] * Math.sin(a1), EDGE[1] + r0[0] * Math.sin(a1) + r0[1] * Math.cos(a1)];
  if (t <= T_DOWN) { const f = (t - T_OFF) / FALL; return [[from[0] + (REST[0] - from[0]) * f, from[1] + (REST[1] - from[1]) * f * f], deg(a1) + (90 - deg(a1)) * f]; }
  // (it lands on its side with a knock: rocks once, settles)
  return [REST, 90 - track([[T_DOWN, 0], [T_DOWN + 0.05, 4, "out"], [T_DOWN + 0.11, 0, "in"], [T_DOWN + 0.15, 0.8, "out"], [T_DOWN + 0.19, 0, "in"]], t)];
}
const SAD_DUR = T_DOWN + 0.65;
function sad(t) {
  if (t <= 0.3) return STILL;
  const move = track([[0.3, 0], [0.95, 1, "io"]], t), open = 13 * track([[T_LET, 0], [T_LET + 0.15, 1, "out"]], t), away = track([[T_LET + 0.35, 0], [T_LET + 1.0, 1, "io"]], t);
  const w = [W0[0] + OVER * move - (OVER + 10) * away, W0[1] + 12 * move - 30 * away];
  const [c, a] = falling(t);
  // (while it's held, it moves with the hand)
  const where = t <= T_LET ? [C0[0] + OVER * move, C0[1] + 12 * move] : c;
  return `${OPEN}${BASE}${arm(w, open, cube(where, a))}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
