// Next's two stories, the raised leaf's own: it stands just past upright, leaning over to the left, and gravity takes it. Happy: it falls
// over about the spine, its free edge trailing in the air, and lands on the left page (a breath of air under it lifts the edge once), and the
// next spread lies open: the leaf's back, a new page, beside the page that was under it. Sad: as it goes over, the worn glue at its root
// gives: the leaf comes out of the spine, and landing loose it skids on the air under it and comes to rest crooked across the left page,
// over its edge, the old page showing at the spine where it was.
// Every frame is a pure function of t, in seconds. The leaf in its own terms: a point on it is (u, v), u across it from its root (0) to its
// free edge (1), v along it from its near end (0) to its far end (1); standing, it is the still's leaf (its four edges); fallen, the left
// page's top sheet (its four edges). Between, each point turns about the spine where it is, round the ellipse a turn about the spine draws
// from here: the leaf falling over.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"143\" width=\"200\" height=\"57\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"14,165 186,165 200,172 200,200 76,200\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M101 106L29 102Q25 102 24 106L10 163Q9 168 14 168L88 166Q93 166 94 169Q96 172 100 172L101 172Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M100 106L171 102Q175 102 176 106L190 163Q191 168 186 168L112 166Q107 166 106 169Q104 172 100 172Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M30 99Q30 95 35 94Q70 87 101 103.5L101 166Q60 159 16 164Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M30 99Q30 95 35 94Q70 87 101 103.5L100 160Q80 147 50 148Q30 149 17.1 159Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M100 103Q130 87 165 94Q170 95 170 99L184 164Q140 159 100 166Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M100 103Q130 87 165 94Q170 95 170 99L182.9 159Q170 149 150 148Q120 147 100 160Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M36 105Q60 99 88 107L88 108.6Q60 100.6 36 106.6Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M34.5 113Q60 107 89 115L89 116.6Q60 108.6 34.5 114.6Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M33 121Q60 115 90 123L90 124.6Q60 116.6 33 122.6Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M31 129Q60 123 91 131L91 132.6Q60 124.6 31 130.6Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M29.5 137Q60 131 92 139L92 140.6Q60 132.6 29.5 138.6Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M112 107Q140 99 164 105L164 106.6Q140 100.6 112 108.6Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M111 115Q140 107 165.5 113L165.5 114.6Q140 108.6 111 116.6Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M110 123Q140 115 167 121L167 122.6Q140 116.6 110 124.6Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M109 131Q140 123 169 129L169 130.6Q140 124.6 109 132.6Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M108 139Q140 131 170.5 137L170.5 138.6Q140 132.6 108 140.6Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M58 41L58 101C81 109 94 120 100 131.3L100 163C102.5 158.5 104 153.4 104.1 148L104.1 88C104.5 71.8 92.5 53 58 41Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M92.6 61.3C101 70 104.3 79.3 104.1 88L104.1 148C104 153.4 102.5 158.5 100 163L100 131.3C98.2 127.9 95.7 124.6 92.6 121.3Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M64.6 55.5C75.1 59.8 83.2 64.8 89.3 70.1L89.3 71.7C83.2 66.4 75.1 61.4 64.6 57.1Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M64.6 63.5C75.1 67.8 83.2 72.8 89.3 78.1L89.3 79.7C83.2 74.4 75.1 69.4 64.6 65.1Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M64.6 71.5C75.1 75.8 83.2 80.8 89.3 86.1L89.3 87.7C83.2 82.4 75.1 77.4 64.6 73.1Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M64.6 79.5C75.1 83.8 83.2 88.8 89.3 94.1L89.3 95.7C83.2 90.4 75.1 85.4 64.6 81.1Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M64.6 87.5C75.1 91.8 81 95.5 84.5 98.4L84.5 100C81 97.1 75.1 93.4 64.6 89.1Z\" fill=\"var(--art-ink-lit,#3A3460)\"/></svg>\n";
export const STILL_HASH = "454ad28271";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 26 || !EL[19].includes("M58 41L58 101")) throw new Error("next: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const t1 = (v) => (Math.round(v * 10) / 10).toString();
const dPoly = (P) => `M${P.map((p) => `${t1(p[0])} ${t1(p[1])}`).join(" ")}Z`;
const BOOK = EL.slice(0, 19).join("");

// ---- curves: [start, ...segments], a segment ["L", x, y], ["Q", cx, cy, x, y] or ["C", x1, y1, x2, y2, x, y]; walked by length
function curve(start, ...segs) {
  const P = [start];
  let at = start;
  for (const [k, ...a] of segs) {
    const n = k === "L" ? 1 : 24;
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      if (k === "L") P.push([a[0], a[1]]);
      else if (k === "Q") P.push([0, 1].map((j) => u * u * at[j] + 2 * u * t * a[j] + t * t * a[2 + j]));
      else P.push([0, 1].map((j) => u * u * u * at[j] + 3 * u * u * t * a[j] + 3 * u * t * t * a[2 + j] + t * t * t * a[4 + j]));
    }
    at = k === "L" ? [a[0], a[1]] : k === "Q" ? [a[2], a[3]] : [a[4], a[5]];
  }
  const L = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  return (s) => { const want = s * L[L.length - 1]; let i = 1; while (i < L.length - 1 && L[i] < want) i++; const k = (want - L[i - 1]) / (L[i] - L[i - 1] || 1); return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k]; };
}
// a sheet from its four edges: near (root to free), far (root to free), root (near to far), free (near to far)
function coons(near, far, root, free) {
  const P00 = near(0), P10 = near(1), P01 = far(0), P11 = far(1);
  return (u, v) => {
    const a = near(u), b = far(u), c = root(v), d = free(v);
    return [0, 1].map((j) => (1 - v) * a[j] + v * b[j] + (1 - u) * c[j] + u * d[j] - ((1 - u) * (1 - v) * P00[j] + u * (1 - v) * P10[j] + (1 - u) * v * P01[j] + u * v * P11[j]));
  };
}
// standing: the still's leaf
const STAND = coons(
  curve([100, 163], ["L", 100, 131.3], ["C", 94, 120, 81, 109, 58, 101]),
  curve([104.1, 88], ["C", 104.5, 71.8, 92.5, 53, 58, 41]),
  curve([100, 163], ["C", 102.5, 158.5, 104, 153.4, 104.1, 148], ["L", 104.1, 88]),
  curve([58, 101], ["L", 58, 41]),
);
// fallen: the left page's top sheet
const FLAT = coons(
  curve([100, 160], ["Q", 80, 147, 50, 148], ["Q", 30, 149, 17.1, 159]),
  curve([101, 103.5], ["Q", 70, 87, 35, 94], ["Q", 30, 95, 30, 99]),
  curve([100, 160], ["L", 101, 103.5]),
  curve([17.1, 159], ["L", 30, 99]),
);
// the spine where a line of the leaf at v meets it
const SPINE = (v) => [100 + v, 160 - 56.5 * v];
// where a point of the still's leaf is on it: (u, v) found by search, then refined
function placeOf([x, y]) {
  let best = [0, 0], bd = Infinity;
  for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) { const p = STAND(i / 40, j / 40), d = (p[0] - x) ** 2 + (p[1] - y) ** 2; if (d < bd) { bd = d; best = [i / 40, j / 40]; } }
  let [u, v] = best;
  for (let k = 0; k < 30; k++) {
    const p = STAND(u, v), e = 1e-4, pu = STAND(u + e, v), pv = STAND(u, v + e);
    const a = (pu[0] - p[0]) / e, b = (pv[0] - p[0]) / e, c = (pu[1] - p[1]) / e, d = (pv[1] - p[1]) / e, det = a * d - b * c;
    if (Math.abs(det) < 1e-9) break;
    const dx = x - p[0], dy = y - p[1];
    u += (d * dx - b * dy) / det; v += (-c * dx + a * dy) / det;
  }
  return [Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v))];
}
// a point of the leaf as it falls (F 0 standing at P0, 1 fallen at P1), seen about the spine where it is (v): how far out from the spine
// it is and at what angle, upright shown 0.87 (the leaf's free edge stands out 83 from the spine and up 62); both go over to where it lies
const UP = 0.87;
function fall(P0, P1, v, F) {
  const S = SPINE(v), x0 = P0[0] - S[0], z0 = -(P0[1] - S[1]) / UP, r0 = Math.hypot(x0, z0), th0 = Math.atan2(z0, x0);
  const r1 = Math.max(0, S[0] - P1[0]), r = r0 + (r1 - r0) * F, th = th0 + (Math.PI - th0) * F;
  return [S[0] + r * Math.cos(th), S[1] - UP * r * Math.sin(th) + (P1[1] - S[1]) * F];
}
// the leaf's own parts as places on it: its outline, its shaded side by the root, its five lines (the last a paragraph's end)
const N_U = 16, N_V = 12;
const OUTLINE = [
  ...Array.from({ length: N_U }, (_, i) => [i / N_U, 0]), ...Array.from({ length: N_V }, (_, i) => [1, i / N_V]),
  ...Array.from({ length: N_U }, (_, i) => [1 - i / N_U, 1]), ...Array.from({ length: N_V }, (_, i) => [0, 1 - i / N_V]),
];
const pointsOf = (svg) => {
  const d = /d="([^"]+)"/.exec(svg)[1], nums = d.match(/-?\d*\.?\d+/g).map(Number), cmds = d.match(/[A-Za-z]/g);
  // (these paths are absolute M, L, C and Q runs: walk them)
  const P = []; let i = 0, at = [0, 0];
  for (const c of cmds) {
    if (c === "M" || c === "L") { at = [nums[i++], nums[i++]]; P.push(at); }
    else if (c === "C") { const s = at, a = nums.slice(i, i + 6); i += 6; for (let k = 1; k <= 8; k++) { const t = k / 8, w = 1 - t; P.push([0, 1].map((j) => w * w * w * s[j] + 3 * w * w * t * a[j] + 3 * w * t * t * a[2 + j] + t * t * t * a[4 + j])); } at = [a[4], a[5]]; }
    else if (c === "Q") { const s = at, a = nums.slice(i, i + 4); i += 4; for (let k = 1; k <= 8; k++) { const t = k / 8, w = 1 - t; P.push([0, 1].map((j) => w * w * s[j] + 2 * w * t * a[j] + t * t * a[2 + j])); } at = [a[2], a[3]]; }
  }
  return P;
};
// (each a place on the leaf, where it stands and where it lies fallen)
const onLeaf = ([u, v]) => ({ u, v, P0: STAND(u, v), P1: FLAT(u, v) });
const OUTLINE_AT = OUTLINE.map(onLeaf);
const SHADE = pointsOf(EL[20]).map(placeOf).map(onLeaf);
// its lines: the still's, standing; fallen, they lie as the left page's lines lie (the leaf's last line, a paragraph's end, as short)
const LINES = EL.slice(21, 26).map((e, i) => {
  const lying = pointsOf(EL[9 + i]), x0 = lying[0][0], short = i === 4 ? 0.8 : 1;
  return pointsOf(e).map((P0, k) => { const [u, v] = placeOf(P0); return { u, v, P0, P1: [x0 + (lying[k][0] - x0) * short, lying[k][1]] }; });
});

// the leaf drawn where it is: each place carried by `at`; the shaded side fading as it lies flatter; loose, the edge of it (its thickness)
// shows along its right and near sides
function leaf(at, shade, edge = [0, 0]) {
  const P = (Q) => dPoly(Q.map(at));
  return (edge[0] || edge[1] ? `<path d="${dPoly(OUTLINE_AT.map((q) => { const p = at(q); return [p[0] + edge[0], p[1] + edge[1]]; }))}" ${fill("paper-deep")}/>` : "")
    + `<path d="${P(OUTLINE_AT)}" ${fill("paper")}/>`
    + (shade > 0.004 ? `<path d="${P(SHADE)}" ${fill("paper-deep")}${shade < 1 ? ` opacity="${n2(shade)}"` : ""}/>` : "")
    + `<path d="${LINES.map(P).join("")}" ${fill("ink-lit")}/>`;
}
// the fall: the root goes first, the free edge trailing in the air; landing, the air under the edge lifts it once
const rootFall = (t) => track([[0.15, 0], [0.72, 1, "in"]], t);
const edgeFall = (t) => track([[0.2, 0], [0.8, 1, "in"], [0.92, 0.93, "out"], [1.04, 1, "in"], [1.11, 0.985, "out"], [1.18, 1, "in"]], t);
const progress = (t, u) => rootFall(t) + (edgeFall(t) - rootFall(t)) * u ** 1.5;
const falling = (t) => (q) => fall(q.P0, q.P1, q.v, progress(t, q.u));

// ---- happy: over onto the left page, and the next spread lies open
const HAPPY_DUR = 2;
function happy(t) {
  if (t <= 0) return STILL;
  return `${OPEN}${BOOK}${leaf(falling(t), 1 - rootFall(t))}</svg>`;
}

// ---- sad: out of the spine, and crooked across the left page
// (where it comes to rest: slid out and over to the left, turned in the page's plane; the page seen at a slant, its depth shown 0.6)
const SAD_DUR = 2.2, REST_AT = [60, 128], SLID = [-15, 7], TURN = (-11 * Math.PI) / 180, DEPTH = 0.6;
const turned = ([x, y], k) => {
  const a = TURN * k, c = Math.cos(a), s = Math.sin(a), dx = x - REST_AT[0], dy = y - REST_AT[1];
  return [REST_AT[0] + c * dx + (s / DEPTH) * dy + SLID[0] * k, REST_AT[1] - DEPTH * s * dx + c * dy + SLID[1] * k];
};
function sad(t) {
  if (t <= 0) return STILL;
  // the glue giving as it goes over: the root slips out while it falls, and it skids on, slowing, once it is down
  const k = track([[0.4, 0], [0.78, 0.35, "in"], [1.4, 1, "out"]], t);
  const at = falling(t);
  return `${OPEN}${BOOK}${leaf((q) => turned(at(q), k), 1 - rootFall(t), [1.4 * k, 1 * k])}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
