// Place's two stories, the map's own: it was folded, and its paper remembers. Happy: the folds let go. The shaded middle panel comes down flat
// into the light, the left one with it, and the road runs whole across the map to the pin standing in its place. Sad: the folds spring back.
// The first crease rises a little, and the free panel with the pin in it (the lightest part, its edge already up) swings up on its crease
// and over, until the pin's head knocks against the fold's ridge and holds it there: the place is turned under, the road runs up to the
// panel's blank back, and where the pin stood is bare floor, the pin's head showing past the fold.
// Every frame is a pure function of t, in seconds. The still in 3D (fitted to its corners, 1.9 px): a camera 100 up, looking down 30.8°,
// focal 204.9; a map of three panels 32.2 wide and 69.9 long on the floor, folded on two creases: the left panel rising 18° to the first
// crease, the middle coming down 18° to the second, on the floor, the right panel (with the pin) rising 20.9° from it. What's printed on a
// panel goes where the panel goes (each panel's corners carried by a perspective map); a panel's shade is its angle to the light.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect y=\"84\" width=\"200\" height=\"116\" fill=\"var(--art-violet-lit,#A68CFF)\"/><polygon points=\"16,164 22,169 72,162 116,174 177,162 155,99 150,98\" fill=\"var(--art-violet-deep,#5E40C4)\"/><polygon points=\"46,104 82,96 83.5,96.6 67.5,156.5 66,156 16,164\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"110.5,107.4 112,108 150,98 170,158 112,170 110.5,169.5\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"139.6,117 141.4,116.2 144.9,119.6 143.1,120.4\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><ellipse cx=\"146\" cy=\"122.4\" rx=\"3.7\" ry=\"2.2\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M47,108C47,104 52,103 58,102C64,101 70,99 74,100C77,101 76,105 73,107C70,109 72,112 68,113.5C62,115 56,112 52,114C48,115 47,111 47,108Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M46,151C47,145 54,141 60,142C65,143 66,147 62,149C59,150.5 62,153 58,154C53,155 46,155.5 46,151Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M117,113C117,109 122,108 127,108C131,108 133,111 130,113.5C127,116 119,117 117,113Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M120,156C122,151 130,150 136,152C142,154 150,153 154,156C157,158 154,161 150,161C140,161 132,164 124,163C119,163 118,159 120,156Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M41.5,118C50,117 56,125 64,128C68,129.5 72,129 80,128L80,134C72,135 66,135.5 61,134C53,131.5 48,124.5 38.5,124Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M106,138C120,143 132,140 144,142C152,143.5 158,145 162,145L164,151C156,151 150,149.5 143,148C132,146 120,149 106,144Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M27,147.5C40,144 46,136 52,128C58,120 66,117 82,116.5L82,119.5C68,120 61,123 55,130C49,138 42,147 25.5,150.5Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M106,121.8C116,124.8 126,118 140,114.5L140,117.5C127,121 116,127.8 106,124.8Z\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"82,96 112,108 112,170 66,156\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M80,152C82,147 88,146 92,148C95,149.5 98,149 101,151C104,153 103,157 99,158C94,159 88,157 84,158C80,158.5 79,155 80,152Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M73.5,128C86,127 96,134 112,140L112,146C96,140 86,133 71.9,134Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M76.5,116.5C88,116 100,119 112,122.5L112,125.5C100,122 88,119 75.7,119.5Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"138.9\" y=\"100\" width=\"2.2\" height=\"16.5\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"140\" cy=\"92\" r=\"10\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M143.38,82.62A10,10 0 1 1 133.54,99.69A10.77,10.77 0 0 0 143.38,82.62Z\" fill=\"var(--art-clay-deep,#C25626)\"/></svg>\n";
export const STILL_HASH = "450278b93e";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 22 || !EL[15].includes("82,96 112,108 112,170 66,156")) throw new Error("place: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const pts = (P) => P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
const ptsOf = (svg) => /points="([^"]+)"/.exec(svg)[1].trim().split(/\s+/).map((q) => q.split(",").map(Number));
const DEG = Math.PI / 180;

// ---- the world: the camera, the map across its creases (x across, y up, v along the creases), and the still's corners
const F = 204.897, PITCH = 0.537886, PP = [95.0403, 100.0285], CAM_Y = 100;
const MAP = { x0: -49.0287, z0: 89.4255, th: -0.070630, W: 32.1885, L: 69.9029 };
const A1 = 0.314173, A3 = 0.365633;
const X2 = 2 * MAP.W * Math.cos(A1); // the second crease, on the floor
function proj([x, y, v]) {
  const c = Math.cos(MAP.th), s = Math.sin(MAP.th), X = MAP.x0 + c * x - s * v, Z = MAP.z0 + s * x + c * v, dy = y - CAM_Y;
  const yc = Math.cos(PITCH) * dy + Math.sin(PITCH) * Z, zc = -Math.sin(PITCH) * dy + Math.cos(PITCH) * Z;
  return [PP[0] + (F * X) / zc, PP[1] - (F * yc) / zc];
}
// where the camera is, in the map's own frame (for which side of a panel it sees)
const EYE = (() => { const c = Math.cos(MAP.th), s = Math.sin(MAP.th), X = -MAP.x0, Z = -MAP.z0; return [c * X + s * Z, CAM_Y, -s * X + c * Z]; })();
// the cross-section of the map: the second crease fixed, on the floor; the first crease up at d (the left and middle panels each d off the
// floor, the left's edge on it), the right panel at angle r from the second crease
function section(d, r) {
  const c1 = [X2 - MAP.W * Math.cos(d), MAP.W * Math.sin(d)];
  return { e0: [c1[0] - MAP.W * Math.cos(d), 0], c1, c2: [X2, 0], e3: [X2 + MAP.W * Math.cos(r), MAP.W * Math.sin(r)] };
}
const near = (p) => [p[0], p[1], 0], far = (p) => [p[0], p[1], MAP.L];

// the still's corners: the left edge (near, far), the first crease, the second, the right edge; and the model's own there, to carry the
// drawing's small differences from the model along with each corner
const DRAWN = { D: [16, 164], A: [46, 104], C: [66, 156], B: [82, 96], F: [112, 170], E: [112, 108], H: [170, 158], G: [150, 98] };
function corners(d, r) {
  const S = section(d, r);
  return { D: near(S.e0), A: far(S.e0), C: near(S.c1), B: far(S.c1), F: near(S.c2), E: far(S.c2), H: near(S.e3), G: far(S.e3) };
}
const MODEL0 = Object.fromEntries(Object.entries(corners(A1, A3)).map(([k, P]) => [k, proj(P)]));
const OFF = Object.fromEntries(Object.keys(DRAWN).map((k) => [k, [DRAWN[k][0] - MODEL0[k][0], DRAWN[k][1] - MODEL0[k][1]]]));
// (the right edge's difference eases onto its crease's as that panel lifts, so it turns through edge-on as a true panel does)
const LIFTED = { H: "F", G: "E" };
const seen = (k, P, lift = 0) => {
  const p = proj(P), o = LIFTED[k] ? [0, 1].map((i) => OFF[k][i] + (OFF[LIFTED[k]][i] - OFF[k][i]) * lift) : OFF[k];
  return [p[0] + o[0], p[1] + o[1]];
};

// ---- carrying a panel's print: a perspective map from its drawn corners to where they are now
function homography(src, dst) {
  const M = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [X, Y] = dst[i];
    M.push([x, y, 1, 0, 0, 0, -X * x, -X * y, X], [0, 0, 0, x, y, 1, -Y * x, -Y * y, Y]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < 8; r++) if (r !== c) { const k = M[r][c] / M[c][c]; for (let j = c; j <= 8; j++) M[r][j] -= k * M[c][j]; }
  }
  const h = M.map((r, i) => r[8] / r[i]);
  return ([x, y]) => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };
}
// a path's or polygon's numbers, two by two, through a map
const carried = (svg, map) => svg.replace(/(d|points)="([^"]+)"/, (_, a, d) => {
  let i = 0, x = 0;
  return `${a}="${d.replace(/-?\d*\.?\d+/g, (v) => { if (i++ % 2 === 0) { x = Number(v); return "\u0000"; } const q = map([x, Number(v)]); return `${n2(q[0])},${n2(q[1])}`; }).replace(/\u0000,?/g, "")}"`;
});
// each panel: its drawn corners (near-left, far-left, far-right, near-right), its print lit and in shade
const SHADE = { "#FBF7EC": "paper-deep", "#6FD0BD": "teal", "#58ADEB": "sky-deep", "#DCA063": "wood-deep" };
const LIGHT_OF = { "#DAD1BC": "paper", "#37B39B": "teal-lit", "#3488C9": "sky", "#B97F45": "wood" };
const retone = (svg, table) => svg.replace(/fill="var\(--art-[a-z-]+,(#[0-9A-Fa-f]{6})\)"/, (s, hex) => (table[hex] ? fill(table[hex]) : s));
const PANELS = {
  left: { q: ["D", "A", "B", "C"], lit: [EL[7], EL[8], EL[11], EL[13]] },
  middle: { q: ["C", "B", "E", "F"], shade: [EL[16], EL[17], EL[18]] },
  right: { q: ["F", "E", "G", "H"], lit: [EL[9], EL[10], EL[12], EL[14]] },
};
PANELS.left.shade = PANELS.left.lit.map((s) => retone(s, SHADE));
PANELS.right.shade = PANELS.right.lit.map((s) => retone(s, SHADE));
PANELS.middle.lit = PANELS.middle.shade.map((s) => retone(s, LIGHT_OF));
// the light, across the creases: from the upper left. A panel is lit in full turned to it more than the left one is in the still, in shade
// turned away as the middle one is, between the two by how far it's turned
const LIGHT = [-Math.SQRT1_2, Math.SQRT1_2];
const litness = (n) => Math.min(1, Math.max(0, (n[0] * LIGHT[0] + n[1] * LIGHT[1] - 0.5) / 0.18));

// ---- a panel drawn: its print side if the camera is on that side (lit and shaded print crossfading by its light), else its back
function panel(name, C, a, b, lift, extra = "") {
  const P = PANELS[name], quad = P.q.map((k) => seen(k, C[k], lift)), map = homography(P.q.map((k) => DRAWN[k]), quad);
  // the panel's print side: its section from a to b (left to right in the still) turned a quarter, to the side that was up
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), n = [-dy / l, dx / l];
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], facing = (EYE[0] - mid[0]) * n[0] + (EYE[1] - mid[1]) * n[1] > 0;
  const shape = `<polygon points="${pts(quad)}"`, clip = `<clipPath id="c${name[0]}"><polygon points="${pts(quad)}"/></clipPath>`;
  if (!facing) {
    const k = litness([-n[0], -n[1]]);
    return `${shape} ${fill("paper-deep")}/>` + (k > 0 ? `<g opacity="${n4(k)}">${shape} ${fill("paper")}/></g>` : "");
  }
  const k = litness(n), layer = (tone, els) => `${shape} ${fill(tone)}/><g clip-path="url(#c${name[0]})">${els.map((s) => carried(s, map)).join("")}${extra ? extra(map) : ""}</g>`;
  return clip + (k < 1 ? layer("paper-deep", P.shade) : "") + (k > 0 ? (k < 1 ? `<g opacity="${n4(k)}">${layer("paper", P.lit)}</g>` : layer("paper", P.lit)) : "");
}
// the pin, stuck in the right panel and going with it: its foot on the panel, its shaft's top, its head's middle (the head a ball, so its
// shade stays away from the light however it turns); and the marks of its shadow on the panel, which go as the panel turns from the light
const PIN_AT = { u: 21.0, v: 46.45, top: 14.94, head: 21.66 };
function pinPoints(r) {
  const foot = [X2 + PIN_AT.u * Math.cos(r), PIN_AT.u * Math.sin(r)], a = r + Math.PI / 2 - A3, dir = [Math.cos(a), Math.sin(a)];
  const at = (h) => [foot[0] + h * dir[0], foot[1] + h * dir[1], PIN_AT.v];
  return { foot: [foot[0], foot[1], PIN_AT.v], top: at(PIN_AT.top), head: at(PIN_AT.head) };
}
const PIN_DRAWN = { foot: [140, 116.5], top: [140, 100], head: [140, 92] };
const PIN0 = pinPoints(A3);
const PIN_OFF = Object.fromEntries(Object.keys(PIN_DRAWN).map((k) => { const p = proj(PIN0[k]); return [k, [PIN_DRAWN[k][0] - p[0], PIN_DRAWN[k][1] - p[1]]]; }));
const sizeAt = (P) => { const a = proj(P), b = proj([P[0], P[1], P[2] + 0]), c = proj([P[0] + 1, P[1], P[2]]); return Math.hypot(c[0] - a[0], c[1] - a[1]) + 0 * b[0]; };
const HEAD_SIZE0 = sizeAt(PIN0.head);
function pin(r) {
  const Q = pinPoints(r), p = Object.fromEntries(Object.keys(Q).map((k) => { const q = proj(Q[k]); return [k, [q[0] + PIN_OFF[k][0], q[1] + PIN_OFF[k][1]]]; }));
  const dx = p.top[0] - p.foot[0], dy = p.top[1] - p.foot[1], l = Math.hypot(dx, dy), w = 1.1 * (sizeAt(Q.foot) / sizeAt(PIN0.foot)), n = [(-dy / l) * w, (dx / l) * w];
  const shaft = r === A3 ? EL[19] : `<polygon points="${pts([[p.foot[0] + n[0], p.foot[1] + n[1]], [p.top[0] + n[0], p.top[1] + n[1]], [p.top[0] - n[0], p.top[1] - n[1]], [p.foot[0] - n[0], p.foot[1] - n[1]]])}" ${fill("ink")}/>`;
  const k = sizeAt(Q.head) / HEAD_SIZE0, head = EL[20] + EL[21];
  return shaft + (r === A3 ? head : `<g transform="matrix(${n4(k)} 0 0 ${n4(k)} ${n2(p.head[0] - k * 140)} ${n2(p.head[1] - k * 92)})">${head}</g>`);
}
const ELLIPSE = /cx="([^"]+)" cy="([^"]+)" rx="([^"]+)" ry="([^"]+)"/.exec(EL[6]).slice(1).map(Number);
const pinMarks = (fade) => (map) => {
  if (fade <= 0) return "";
  const c = map([ELLIPSE[0], ELLIPSE[1]]), marks = carried(EL[5], map) + EL[6].replace(/cx="[^"]+" cy="[^"]+"/, `cx="${n2(c[0])}" cy="${n2(c[1])}"`);
  return fade < 1 ? `<g opacity="${n4(fade)}">${marks}</g>` : marks;
};

// the map's shadow on the floor, as the still draws it, its corners going with the feet of the corners they hang from
const SHADOW = ptsOf(EL[2]), SHADOW_OF = ["D", "D", "C", "F", "H", "G", "G"];
const FOOT0 = Object.fromEntries(Object.entries(corners(A1, A3)).map(([k, P]) => [k, proj([P[0], 0, P[2]])]));
function shadow(C) {
  const P = SHADOW.map((s, i) => { const k = SHADOW_OF[i], f = proj([C[k][0], 0, C[k][2]]); return [s[0] + f[0] - FOOT0[k][0], s[1] + f[1] - FOOT0[k][1]]; });
  return `<polygon points="${pts(P)}" ${fill("violet-deep")}/>`;
}

function scene(d, r) {
  const lift = Math.min(1, Math.max(0, (r - A3) / (40 * DEG)));
  const C = corners(d, r), S = section(d, r);
  const fade = Math.max(0, 1 - (r - A3) / (20 * DEG));
  const middle = panel("middle", C, S.c1, S.c2, 0), left = panel("left", C, S.e0, S.c1, 0);
  const right = panel("right", C, S.c2, S.e3, lift, pinMarks(fade));
  // the pin on the side of its panel that's up: in front of it while the print faces the camera, behind it once the panel is over
  const tc = [S.e3[0] - S.c2[0], S.e3[1] - S.c2[1]], nr = [-tc[1], tc[0]], mr = [(S.c2[0] + S.e3[0]) / 2, (S.c2[1] + S.e3[1]) / 2];
  const printSeen = (EYE[0] - mr[0]) * nr[0] + (EYE[1] - mr[1]) * nr[1] > 0, pinned = printSeen ? right + pin(r) : pin(r) + right;
  // (the right panel is always on the camera's side of the middle, lying or lifted: after it)
  return `${OPEN}${EL[0]}${EL[1]}${shadow(C)}${left}${middle}${pinned}</svg>`;
}

// ---- happy: the folds let go: the first crease comes down (the left edge sliding out a little on the floor) until the map lies flat, with a
// small rebound of the light paper as it lands
const HAPPY_DUR = 2.3;
function happy(t) {
  if (t <= 0) return STILL;
  return scene(track([[0.25, A1], [1.2, 0, "in"], [1.4, 1.6 * DEG, "out"], [1.62, 0, "in"]], t), A3);
}

// ---- sad: the folds spring back: the first crease rises to 24°, and the right panel swings up on its crease (slow off the floor, falling
// once past upright) until the pin's head knocks against the ridge, at 109.6° (worked out from the pin's size and place), bounces and settles
const R_REST = 109.6 * DEG;
const SAD_DUR = 2.4;
function sad(t) {
  if (t <= 0) return STILL;
  const d = track([[0.2, A1], [1.05, 24 * DEG, "io"]], t);
  const r = track([[0.2, A3], [0.95, 92 * DEG, "io"], [1.18, R_REST, "in"], [1.32, R_REST - 3.5 * DEG, "out"], [1.48, R_REST, "in"]], t);
  return scene(d, r);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
