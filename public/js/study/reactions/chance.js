// Chance's two stories. The right die is caught mid-tumble in the still. Happy: it bounces up off its edge, turns over towards us and round in the air
// and lands flat as its partner sits, its 4 up and its 5 to us: a double. Sad: it tumbles left into its partner, nudging it, and comes to rest cocked against it, on an
// edge, with no face up: a roll that doesn't count.
// Every frame is a pure function of t, in seconds. The dice are real cubes: the left die gives the camera (a parallel projection) and the floor; the
// right die is its still's own cube in that camera, its corners, pips and shading drawn the way the still draws them.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<rect y=\"132\" width=\"200\" height=\"68\" fill=\"var(--art-teal-lit,#6FD0BD)\"/>\n<path d=\"M66 150L66 156.2L80 158.6Q82 158.8 83.3 157.6L100.4 141.4Q101.6 140.3 100 140L86 137Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M146 141L182 144Q185.5 144.3 183 146.6L178.6 150.3Q177.2 151.4 175.2 151.2L150 146.6Q147 146 146 144Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M18 110Q18 106 21 103.2L35.1 89.8Q38 87 42 87L85 87Q89 87 89 91L89 135.3Q89 137 87.6 138.3L72 153.2Q69 156 65 156L22 156Q18 156 18 152Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M18 112L18 110Q18 106 21 103.2L35.1 89.8Q38 87 42 87L85 87Q89 87 86.5 89.4L69 106L69 112Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M18 110Q18 106 22 106L69 106L69 152Q69 156 65 156L22 156Q18 156 18 152Z\" fill=\"var(--art-paper-mid,#EDE6D5)\"/>\n<path d=\"M30.9 102A4.9 1.6 -8 0 1 40.7 100.6A4.9 1.6 -8 0 1 30.9 102Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M56.4 102A4.9 1.6 -8 0 1 66.2 100.6A4.9 1.6 -8 0 1 56.4 102Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M40.9 92.5A4.9 1.6 -8 0 1 50.7 91.1A4.9 1.6 -8 0 1 40.9 92.5Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M66.4 92.5A4.9 1.6 -8 0 1 76.2 91.1A4.9 1.6 -8 0 1 66.4 92.5Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<circle cx=\"30.8\" cy=\"118.5\" r=\"4.5\" fill=\"var(--art-ink,#231F3B)\"/>\n<circle cx=\"56.3\" cy=\"118.5\" r=\"4.5\" fill=\"var(--art-ink,#231F3B)\"/>\n<circle cx=\"43.5\" cy=\"131\" r=\"4.5\" fill=\"var(--art-ink,#231F3B)\"/>\n<circle cx=\"30.8\" cy=\"143.5\" r=\"4.5\" fill=\"var(--art-ink,#231F3B)\"/>\n<circle cx=\"56.3\" cy=\"143.5\" r=\"4.5\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M73.3 118.6A4.9 1.7 -81.4 0 1 74.7 108.9A4.9 1.7 -81.4 0 1 73.3 118.6Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M73.3 131.1A4.9 1.7 -81.4 0 1 74.7 121.4A4.9 1.7 -81.4 0 1 73.3 131.1Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M73.3 143.6A4.9 1.7 -81.4 0 1 74.7 133.9A4.9 1.7 -81.4 0 1 73.3 143.6Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M83.3 109.1A4.9 1.7 -81.4 0 1 84.7 99.4A4.9 1.7 -81.4 0 1 83.3 109.1Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M83.3 121.6A4.9 1.7 -81.4 0 1 84.7 111.9A4.9 1.7 -81.4 0 1 83.3 121.6Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M83.3 134.1A4.9 1.7 -81.4 0 1 84.7 124.4A4.9 1.7 -81.4 0 1 83.3 134.1Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M102.7 87.1L121.3 66.9Q124 64 127.9 64.9L165.1 73.1Q169 74 169.4 78L172.6 114Q173 118 170.3 120.9L151.7 141.1Q149 144 145.1 143.1L107.9 134.9Q104 134 103.6 130L100.4 94Q100 90 102.7 87.1Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M100.4 94Q100 90 102.7 87.1L121.3 66.9Q124 64 127.9 64.9L165.1 73.1Q169 74 166.3 76.9L145 100L143 108L102 99Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M100.4 94Q100 90 103.9 90.9L145 100L148.6 140Q149 144 145.1 143.1L107.9 134.9Q104 134 103.6 130Z\" fill=\"var(--art-paper-mid,#EDE6D5)\"/>\n<path d=\"M135.2 91.4A4.6 2.5 -5.4 0 1 144.4 90.6A4.6 2.5 -5.4 0 1 135.2 91.4Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M129.9 82.4A4.6 2.5 -5.4 0 1 139.1 81.6A4.6 2.5 -5.4 0 1 129.9 82.4Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M124.7 73.4A4.6 2.5 -5.4 0 1 133.9 72.6A4.6 2.5 -5.4 0 1 124.7 73.4Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M131.5 105.2A4.6 3.4 45 0 1 138.1 111.8A4.6 3.4 45 0 1 131.5 105.2Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M132.5 116.2A4.6 3.4 45 0 1 139.1 122.8A4.6 3.4 45 0 1 132.5 116.2Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M133.5 127.2A4.6 3.4 45 0 1 140.1 133.8A4.6 3.4 45 0 1 133.5 127.2Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M109 100.2A4.6 3.4 45 0 1 115.6 106.8A4.6 3.4 45 0 1 109 100.2Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M110 111.2A4.6 3.4 45 0 1 116.6 117.8A4.6 3.4 45 0 1 110 111.2Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M111 122.2A4.6 3.4 45 0 1 117.6 128.8A4.6 3.4 45 0 1 111 122.2Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M151 109.1A4.7 2 -78 0 1 153 99.9A4.7 2 -78 0 1 151 109.1Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M163 96.1A4.7 2 -78 0 1 165 86.9A4.7 2 -78 0 1 163 96.1Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M158 113.6A4.7 2 -78 0 1 160 104.4A4.7 2 -78 0 1 158 113.6Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M153 131.1A4.7 2 -78 0 1 155 121.9A4.7 2 -78 0 1 153 131.1Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M165 118.1A4.7 2 -78 0 1 167 108.9A4.7 2 -78 0 1 165 118.1Z\" fill=\"var(--art-ink,#231F3B)\"/>\n</svg>\n";
export const STILL_HASH = "98d4b9405a";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 39) throw new Error("chance: the still isn't as this story knows it");
// (the left die: its outline, faces and pips, its side's 6 among them; a standard die, 1 2 3 counterclockwise round their corner, as the right is)
const ROOM = EL.slice(0, 2).join(""), LEFT_SHADOW = EL[2], LEFT_DIE = EL.slice(4, 22).join("");
const STILL_SHADOW = EL[3].match(/ d="([^"]+)"/)[1];
const fill = (t) => `fill="${paint(t)}"`;
const rad = Math.PI / 180;
const n1 = (v) => { const r = (Math.round(v * 10) / 10).toString(); return r === "-0" ? "0" : r; };

// ---- the camera: world X right, Y down, Z back, a die 1 across; the floor is Y = 1. The left die's front top left corner is at the world's origin.
const P = [[51, 0, 20], [0, 50, -19]], S0 = [18, 106];
const scr = (w) => [S0[0] + P[0][0] * w[0] + P[0][1] * w[1] + P[0][2] * w[2], S0[1] + P[1][0] * w[0] + P[1][1] * w[1] + P[1][2] * w[2]];
// towards the viewer (P's null direction, the way that sees the dice's tops, fronts and right sides)
const VIEW = (() => { const v = [1000, -969, -2550], l = Math.hypot(...v); return v.map((x) => x / l); })();
// towards the light: upper left, in front
const LIGHT = (() => { const v = [-0.45, -1, -0.62], l = Math.hypot(...v); return v.map((x) => x / l); })();
// the light's shadow offset per unit of height, as the left die's shadow has it
const LX = 0.2693498452012384, LZ = -0.1368421052631579;

// ---- the right die in the still: its local axes in the world (columns), from fitting its drawn cube into the camera exactly, and its corner.
const M0 = [[0.9506507805423408, 0.13381939365447187, -0.17415949038296866], [-0.0120086360198991, 0.9676363683032824, 0.23062202185074265], [0.10451222916159736, -0.16527235005758786, 0.9334938156379268]];
const T0 = [1.3823072878820992, -0.10145576195775412, 0.5751164159006471];
const mul = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
const tr = (A) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[j][i]));
const apply = (A, v) => [0, 1, 2].map((i) => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2]);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => a.map((x) => x * k);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// as a matrix with the local axes as columns
const M = tr(M0);
// its nearest rotation (the polar decomposition), which is what it becomes as it moves
const R0 = (() => {
  let R = M;
  for (let i = 0; i < 40; i++) {
    const it = tr(inv3(R));
    R = R.map((row, a) => row.map((v, b) => (v + it[a][b]) / 2));
  }
  return R;
})();
function inv3(A) {
  const [[a, b, c], [d, e, f], [g, h, i]] = A, det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [[(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det], [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det], [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det]];
}
const CENTER0 = add(T0, apply(M, [0.5, 0.5, 0.5]));
const Rx = (a) => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const Ry = (a) => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const Rz = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
// rotations by quaternion, to turn smoothly from one to another
function quat(R) {
  const tr0 = R[0][0] + R[1][1] + R[2][2];
  let w, x, y, z;
  if (tr0 > 0) { const s = Math.sqrt(tr0 + 1) * 2; w = s / 4; x = (R[2][1] - R[1][2]) / s; y = (R[0][2] - R[2][0]) / s; z = (R[1][0] - R[0][1]) / s; }
  else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) { const s = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2; w = (R[2][1] - R[1][2]) / s; x = s / 4; y = (R[0][1] + R[1][0]) / s; z = (R[0][2] + R[2][0]) / s; }
  else if (R[1][1] > R[2][2]) { const s = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2; w = (R[0][2] - R[2][0]) / s; x = (R[0][1] + R[1][0]) / s; y = s / 4; z = (R[1][2] + R[2][1]) / s; }
  else { const s = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2; w = (R[1][0] - R[0][1]) / s; x = (R[0][2] + R[2][0]) / s; y = (R[1][2] + R[2][1]) / s; z = s / 4; }
  return [w, x, y, z];
}
function fromQuat([w, x, y, z]) {
  return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
}
function slerp(qa, qb, s) {
  let d = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
  if (d < 0) { qb = qb.map((v) => -v); d = -d; }
  if (d > 0.9995) { const q = qa.map((v, i) => v + (qb[i] - v) * s), l = Math.hypot(...q); return q.map((v) => v / l); }
  const th = Math.acos(d), a = Math.sin((1 - s) * th) / Math.sin(th), b = Math.sin(s * th) / Math.sin(th);
  return qa.map((v, i) => a * v + b * qb[i]);
}
const Q_I = [1, 0, 0, 0];

// ---- the cube. Local corners 0..1 (x right, y down, z back); its faces with their outward normals, their origin and two axes for the pips (as
// the still lays them: top 3, front 6, right 5; opposite faces add up to 7).
const CORNERS = [];
for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) CORNERS.push([x, y, z]);
const ci = (x, y, z) => x * 4 + y * 2 + z;
const FACES = [
  { n: [0, -1, 0], o: [0, 0, 0], a: [1, 0, 0], b: [0, 0, 1], quad: [ci(0, 0, 0), ci(1, 0, 0), ci(1, 0, 1), ci(0, 0, 1)], pips: 3 },
  { n: [0, 0, -1], o: [0, 0, 0], a: [1, 0, 0], b: [0, 1, 0], quad: [ci(0, 0, 0), ci(1, 0, 0), ci(1, 1, 0), ci(0, 1, 0)], pips: 6 },
  { n: [1, 0, 0], o: [1, 0, 0], a: [0, 0, 1], b: [0, 1, 0], quad: [ci(1, 0, 0), ci(1, 0, 1), ci(1, 1, 1), ci(1, 1, 0)], pips: 5 },
  { n: [0, 1, 0], o: [0, 1, 0], a: [1, 0, 0], b: [0, 0, 1], quad: [ci(0, 1, 0), ci(1, 1, 0), ci(1, 1, 1), ci(0, 1, 1)], pips: 4 },
  { n: [0, 0, 1], o: [0, 0, 1], a: [1, 0, 0], b: [0, 1, 0], quad: [ci(0, 0, 1), ci(1, 0, 1), ci(1, 1, 1), ci(0, 1, 1)], pips: 1 },
  { n: [-1, 0, 0], o: [0, 0, 0], a: [0, 0, 1], b: [0, 1, 0], quad: [ci(0, 0, 0), ci(0, 0, 1), ci(0, 1, 1), ci(0, 1, 0)], pips: 2 },
];
const LAYOUT = {
  1: [[0.5, 0.5]], 2: [[0.75, 0.25], [0.25, 0.75]], 3: [[0.75, 0.25], [0.5, 0.5], [0.25, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]], 5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.25], [0.25, 0.5], [0.25, 0.75], [0.75, 0.25], [0.75, 0.5], [0.75, 0.75]],
};
const PIP = 0.09;
// The light on a face: the left die's top, front and right side are the three tones; the cut-offs lie between them.
const B = (n) => dot(n, LIGHT);
const B_TOP = B([0, -1, 0]), B_FRONT = B([0, 0, -1]), B_RIGHT = B([1, 0, 0]);
const T1 = (B_TOP + B_FRONT) / 2, T2 = (B_FRONT + B_RIGHT) / 2;
const tone = (b) => (b > T1 ? "paper" : b > T2 ? "paper-mid" : "paper-deep");

const hull = (pts) => {
  const p = pts.map((q, i) => [...q, i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), q) <= 1e-9) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cr(up.at(-2), up.at(-1), q) <= 1e-9) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
};
// a polygon with its listed corners rounded: each by a quadratic through the corner, from r before it to r after it along its two edges
function roundPath(pts, round, r) {
  const n = pts.length;
  const toward = (a, b, d) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = Math.min(d, l / 2) / l; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; };
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n], p = pts[i], next = pts[(i + 1) % n];
    if (round[i]) {
      const a = toward(p, prev, r), b = toward(p, next, r);
      d += `${i ? "L" : "M"}${n2(a[0])} ${n2(a[1])}Q${n2(p[0])} ${n2(p[1])} ${n2(b[0])} ${n2(b[1])}`;
    } else d += `${i ? "L" : "M"}${n2(p[0])} ${n2(p[1])}`;
  }
  return `${d}Z`;
}
// a pip: the circle of radius PIP on a face, as the ellipse the face's two screen axes make of it
function pip(c, ja, jb) {
  // the ellipse's axes from the 2×2 [ja jb]: eigen of J Jᵀ
  const a = ja[0] * ja[0] + jb[0] * jb[0], b = ja[0] * ja[1] + jb[0] * jb[1], d = ja[1] * ja[1] + jb[1] * jb[1];
  const tr0 = a + d, det = a * d - b * b, s = Math.sqrt(Math.max(0, (tr0 * tr0) / 4 - det));
  const l1 = tr0 / 2 + s, l2 = Math.max(0, tr0 / 2 - s);
  const ang = Math.abs(b) < 1e-12 ? (a >= d ? 0 : Math.PI / 2) : Math.atan2(l1 - a, b);
  const rx = PIP * Math.sqrt(l1), ry = PIP * Math.sqrt(l2);
  // (a face turning into view brings its pips with it, from nothing)
  if (ry < 0.02) return "";
  const ux = Math.cos(ang) * rx, uy = Math.sin(ang) * rx, deg = (ang / rad);
  // (to a tenth, as the still writes its pips)
  return `<path d="M${n1(c[0] - ux)} ${n1(c[1] - uy)}A${n1(rx)} ${n1(ry)} ${n1(deg)} 0 1 ${n1(c[0] + ux)} ${n1(c[1] + uy)}A${n1(rx)} ${n1(ry)} ${n1(deg)} 0 1 ${n1(c[0] - ux)} ${n1(c[1] - uy)}Z" ${fill("ink")}/>`;
}

/**
 * The right die, its local axes now K (columns, in the world) about its middle at C: its silhouette in its darkest face's tone, its two lighter faces
 * over it (the lightest reaching a little under the next, so no seam shows), every corner on the silhouette rounded as the still's are, and the pips.
 */
function die(K, C) {
  const wc = CORNERS.map((p) => add(C, apply(K, [p[0] - 0.5, p[1] - 0.5, p[2] - 0.5])));
  const sc = wc.map(scr);
  const R = rigid(K);
  const faces = FACES.map((f) => ({ ...f, wn: apply(R, f.n) })).filter((f) => dot(f.wn, VIEW) > 1e-6).map((f) => ({ ...f, lum: B(f.wn) })).sort((x, y) => y.lum - x.lum);
  const H = hull(sc), onHull = new Set(H.map((h) => h[2]));
  const darkest = faces.at(-1);
  let out = `<path d="${roundPath(H.map((h) => [h[0], h[1]]), H.map(() => true), 4)}" ${fill(tone(darkest.lum))}/>`;
  const lit = faces.slice(0, -1);
  lit.forEach((f, k) => {
    let ring = [...f.quad], pts = null, round = null;
    // the lightest face, when another lit face follows it, reaches across their shared edge a little way into it (under it: no seam shows)
    const next = lit[k + 1];
    const shared = next ? f.quad.filter((i) => next.quad.includes(i)) : [];
    if (shared.length === 2) {
      // its corners turned so the shared edge is the one that closes its outline
      for (let r = 0; r < 4; r++) {
        const rr = [...f.quad.slice(r), ...f.quad.slice(0, r)];
        if (shared.includes(rr[3]) && shared.includes(rr[0])) { ring = rr; break; }
      }
      const reach = (i) => { const j = next.quad.find((q) => !f.quad.includes(q) && adjacent(q, i)); return [sc[i][0] + (sc[j][0] - sc[i][0]) * 0.19, sc[i][1] + (sc[j][1] - sc[i][1]) * 0.19]; };
      pts = [...ring.map((i) => sc[i]), reach(ring[3]), reach(ring[0])];
      round = [...ring.map((i) => onHull.has(i)), false, false];
    } else {
      pts = ring.map((i) => sc[i]);
      round = ring.map((i) => onHull.has(i));
    }
    out += `<path d="${roundPath(pts, round, 4)}" ${fill(tone(f.lum))}/>`;
  });
  for (const f of faces) {
    const o = add(C, apply(K, add(f.o, [-0.5, -0.5, -0.5])));
    const ja = sub2(scr(add(o, apply(K, f.a))), scr(o)), jb = sub2(scr(add(o, apply(K, f.b))), scr(o));
    for (const [u, v] of LAYOUT[f.pips]) out += pip(scr(add(o, apply(K, add(scale(f.a, u), scale(f.b, v))))), ja, jb);
  }
  return out;
}
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const adjacent = (i, j) => { const a = CORNERS[i], b = CORNERS[j]; return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) === 1; };
// the rotation part of K, for which way its faces look
function rigid(K) {
  let R = K;
  for (let i = 0; i < 12; i++) { const it = tr(inv3(R)); R = R.map((row, a) => row.map((v, b) => (v + it[a][b]) / 2)); }
  return R;
}
// its shadow on the floor: every corner carried down along the light to the floor, their outline (the dice cover what's under them)
function castShadow(K, C) {
  const pts = CORNERS.map((p) => { const w = add(C, apply(K, [p[0] - 0.5, p[1] - 0.5, p[2] - 0.5])), h = 1 - w[1]; return scr([w[0] + h * LX, 1, w[2] + h * LZ]); });
  return hull(pts).map((h) => [h[0], h[1]]);
}
// The still's own shadow for the right die, as points round its outline, for the first moments: the cast one takes over from it.
const STILL_SHADOW_PTS = (() => {
  const nums = STILL_SHADOW.match(/-?\d+(\.\d+)?/g).map(Number), pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
})();
function resample(poly, n) {
  const segs = poly.map((p, i) => [p, poly[(i + 1) % poly.length]]), lens = segs.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1])), total = lens.reduce((x, y) => x + y, 0);
  const out = [];
  for (let k = 0; k < n; k++) {
    let d = (k / n) * total, i = 0;
    while (d > lens[i] && i < lens.length - 1) { d -= lens[i]; i++; }
    const [a, b] = segs[i], f = lens[i] ? d / lens[i] : 0;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}
// start both outlines at their lowest-right point, so they blend point for point
const fromCorner = (pts) => { let best = 0; pts.forEach((p, i) => { if (p[0] + p[1] > pts[best][0] + pts[best][1]) best = i; }); return [...pts.slice(best), ...pts.slice(0, best)]; };
function shadowPath(K, C, w) {
  const cast = castShadow(K, C);
  if (w <= 0) return `<path d="${roundPath(cast, cast.map(() => true), 2.5)}" ${fill("teal-deep")}/>`;
  const a = fromCorner(resample(STILL_SHADOW_PTS, 48)), b = fromCorner(resample(cast, 48));
  const mix = a.map((p, i) => [p[0] * w + b[i][0] * (1 - w), p[1] * w + b[i][1] * (1 - w)]);
  return `<path d="M${mix.map((p) => `${n2(p[0])} ${n2(p[1])}`).join("L")}Z" ${fill("teal-deep")}/>`;
}

// The die's axes at a moment: its rotation from the still's, applied to the still's (slightly drawn) axes, which settle into a true cube as it goes.
function axes(Rot, settle) {
  const K = M.map((row, i) => row.map((v, j) => v + (R0[i][j] - v) * settle));
  return mul(Rot, K);
}
// how far below its middle its lowest corner is, turned as K: the middle never comes lower than that above the floor
const reachDown = (K) => Math.max(...CORNERS.map((p) => apply(K, [p[0] - 0.5, p[1] - 0.5, p[2] - 0.5])[1]));
const onFloor = (C, K) => [C[0], Math.min(C[1], 1 - reachDown(K)), C[2]];
const SHADOW_TAKES = 0.15;
const blend = (t) => track([[0, 1], [SHADOW_TAKES, 0, "io"]], t);

// ---- happy. It comes up off its edge (it was bouncing) in a hop, turning half over towards us and a quarter round, and lands flat as its partner
// sits, 4 up, 5 to us and 6 on its side: the same as its partner, a double.
const G = 12; // a die's lengths a second squared: the 600 units of the 200-unit view
const TOP_Y = 0.02, END = [1.95, 0.5, 0.84];
const RISE = Math.sqrt((2 * (CENTER0[1] - TOP_Y)) / G), DROP = Math.sqrt((2 * (END[1] - TOP_Y)) / G), HOP = RISE + DROP;
const Q_UPRIGHT = quat(tr(R0)); // what takes the still's tilt off
function happyPose(t) {
  if (t <= HOP) {
    // it rolls up over its edge (its middle rising slowly at first), leaves the floor, and falls the rest of the way, faster and faster
    const y = track([[0, CENTER0[1]], [RISE, TOP_Y, "io"], [HOP, END[1], "in"]], t);
    // the turn starts from the bounce and slows to land flat; it drifts over with it
    const turn = track([[0, 0], [HOP, 1, "io"]], t);
    const C = [CENTER0[0] + (END[0] - CENTER0[0]) * turn, y, CENTER0[2] + (END[2] - CENTER0[2]) * turn];
    // half over towards us, and a quarter turn round as it goes, so it lands as its partner sits: its 4 up and its 5 to us
    const Rot = mul(Ry((Math.PI / 2) * turn), mul(Rx(Math.PI * turn), fromQuat(slerp(Q_I, Q_UPRIGHT, turn))));
    const K = axes(Rot, turn);
    // (it rolls on its edge until the hop lifts it: no corner goes below the floor)
    return { C: onFloor(C, K), K };
  }
  // landed: a rock towards us and back, dying away, and a short skid
  const rock = track([[HOP, 0], [HOP + 0.08, 7, "out"], [HOP + 0.18, -3, "io"], [HOP + 0.27, 1.2, "io"], [HOP + 0.34, 0, "io"]], t) * rad;
  const skid = track([[HOP, 0], [HOP + 0.2, -0.06, "out"]], t);
  // rocking: forward on its front bottom edge, back on its back one
  const Rot = mul(Rx(rock), mul(Ry(Math.PI / 2), mul(Rx(Math.PI), fromQuat(Q_UPRIGHT))));
  const K = axes(Rot, 1), front = rock >= 0;
  const edge = [END[0], 1, END[2] + (front ? -0.5 : 0.5) + skid];
  const C = add(edge, apply(Rx(rock), [0, -0.5, front ? 0.5 : -0.5]));
  return { C, K };
}
const HAPPY_DUR = HOP + 0.34 + 0.6;
function happy(t) {
  if (t <= 0) return STILL;
  const { C, K } = happyPose(t);
  return `${OPEN}${ROOM}${LEFT_SHADOW}${shadowPath(K, C, blend(t))}${LEFT_DIE}${die(K, C)}</svg>`;
}

// ---- sad. It tumbles left, into its partner: its top left corner comes to rest against the partner's side, half way up, with its bottom left edge on
// the floor, tilted well over, no face up. The knock moves the left die a touch.
// (its top left corner against the left die's side where the knock leaves it, 0.05 over)
const TILT = -60 * rad, PUSH = 0.05, REST = [1.683 - PUSH, 0.317, 0.62];
const Q_COCKED = quat(mul(Rz(TILT), tr(R0)));
const KNOCK = 0.36;
function sadPose(t) {
  const s = track([[0, 0], [KNOCK, 1, "in"]], t);
  // after the knock: a small give against the partner, and still
  const give = track([[KNOCK, 0], [KNOCK + 0.07, 3.5, "out"], [KNOCK + 0.16, -1.2, "io"], [KNOCK + 0.24, 0, "io"]], t) * rad;
  const q = slerp(Q_I, Q_COCKED, s);
  const Rot = mul(Rz(give), fromQuat(q));
  // its middle goes over to where it rests, lifting a little as it tips (a tumbling cube's middle rises over its edge)
  const lift = Math.sin(Math.PI * s) * 0.12;
  const C = [CENTER0[0] + (REST[0] - CENTER0[0]) * s, CENTER0[1] + (REST[1] - CENTER0[1]) * s - lift, CENTER0[2] + (REST[2] - CENTER0[2]) * s];
  const K = axes(Rot, s);
  return { C: onFloor(C, K), K };
}
// the moment it first reaches the left die (found once, here): the knock moves that one from then
const MEET = (() => {
  for (let i = 0; i <= 2000; i++) {
    const t = (i / 2000) * KNOCK, { C, K } = sadPose(t);
    const w = CORNERS.map((p) => add(C, apply(K, [p[0] - 0.5, p[1] - 0.5, p[2] - 0.5])));
    if (w.some((v) => v[0] <= 1 && v[1] > 0 && v[1] < 1 && v[2] > 0 && v[2] < 1)) return t;
  }
  return KNOCK;
})();
const SAD_DUR = KNOCK + 0.24 + 0.8;
function sad(t) {
  if (t <= 0) return STILL;
  const { C, K } = sadPose(t);
  // the knock moves it from the moment they meet
  const push = track([[MEET, 0], [KNOCK, -PUSH, "out"]], t);
  const nudge = push ? `translate(${n2(P[0][0] * push)} 0)` : "";
  const left = nudge ? `<g transform="${nudge}">${LEFT_SHADOW}</g>` : LEFT_SHADOW;
  const leftDie = nudge ? `<g transform="${nudge}">${LEFT_DIE}</g>` : LEFT_DIE;
  return `${OPEN}${ROOM}${left}${shadowPath(K, C, blend(t))}${leftDie}${die(K, C)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
