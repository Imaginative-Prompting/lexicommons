// Difficult's two stories, the camera's. The still: a thick sheet printed with a maze, on a plain floor, its orange route stopping at a dead
// end under a round pencil that lies across the maze there (its point past the sheet's edge). Happy: the camera swings round the sheet, low,
// to its far side, and from there the pencil hides nothing: the route runs on beside it, through a gap in the dead-end wall and a gap in the
// outer wall, off the paper. Sad: the camera draws back and up, and the floor around turns out to be covered in loose sheets of the same
// maze, each with the same orange line stopping at the same wall.
// Every frame is a pure function of t, in seconds. The still is an orthographic view of a world: the sheet's own plane (screen x = 59 + a −
// 0.3846 b, y = 32.8 + 0.2 a + b) a rectangle 111 × 96.2 seen from 46.1° up and turned 15.5°, its top 3.75 above the floor; the pencil a
// cylinder of radius 5 lying on it along a; the light low from the far left (the still's shadows). What lies on a surface (the print, the
// shadows) is carried with its surface; the sheet's sides and the pencil are drawn from the world.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><polygon points=\"64,38.8 175,61 138,157.2 27,135\" fill=\"var(--art-violet-deep,#5E40C4)\"/><polygon points=\"59,35.4 170,57.6 133,153.8 22,131.6\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"59,32.8 170,55 133,151.2 22,129\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"115,106.9 175.7,117 180.2,117 179.7,118.6 175.3,118.9 114.4,109.6\" fill=\"var(--art-violet-deep,#5E40C4)\"/><clipPath id=\"pp\"><polygon points=\"59,32.8 170,55 133,151.2 22,129\"/></clipPath><polygon points=\"115,106.9 175.7,117 180.2,117 179.7,118.6 175.3,118.9 114.4,109.6\" clip-path=\"url(#pp)\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M64 40.8L160 60L158 65.2L62 46ZM64 40.8L70 42L58 73.2L52 72ZM54 66.8L75 71L73 76.2L52 72ZM49 79.8L55 81L38 125.2L32 124ZM34 118.8L130 138L128 143.2L32 124ZM74 56.8L140 70L138 75.2L72 62ZM49 79.8L100 90L98 95.2L47 85ZM109 91.8L130 96L128 101.2L107 97ZM89 101.8L110 106L108 111.2L87 107ZM54 108.8L120 122L118 127.2L52 114ZM59 95.8L65 97L58 115.2L52 114ZM84 72.8L90 74L73 118.2L67 117ZM99 75.8L105 77L98 95.2L92 94ZM119 65.8L125 67L108 111.2L102 110ZM129 81.8L135 83L128 101.2L122 100ZM119 107.8L125 109L118 127.2L112 126ZM154 58.8L160 60L143 104.2L137 103ZM134 110.8L140 112L128 143.2L122 142Z\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"47.3,73.9 75,79.4 80,66.4 113,73 102,101.6 87,98.6 83,109 110,114.4 115,101.4 118,102 112,117.6 79,111 85,95.4 100,98.4 109,75 82,69.6 77,82.6 46.3,76.5\" fill=\"var(--art-clay,#E8743B)\"/><circle cx=\"46.8\" cy=\"75.2\" r=\"1.4\" fill=\"var(--art-clay,#E8743B)\"/><circle cx=\"116.5\" cy=\"101.7\" r=\"1.5\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M116.5 100.3L147 106.4L146 109L115.5 102.9Z\" fill=\"var(--art-clay,#E8743B)\"/><polygon points=\"114.6,97.2 166.1,107.5 165.5,110.4 114,100.1\" fill=\"var(--art-clay-lit,#F6A06F)\"/><polygon points=\"114,100.1 165.5,110.4 164.7,114.6 113.2,104.3\" fill=\"var(--art-clay,#E8743B)\"/><polygon points=\"113.2,104.3 164.7,114.6 164.2,117.3 112.7,107\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"166.1,107.5 174.5,112.5 174.2,114.2 165.2,112.4\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"165.2,112.4 174.2,114.2 173.8,115.9 164.2,117.3\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"174.5,112.5 178.2,115 173.8,115.9\" fill=\"var(--art-ink-lit,#3A3460)\"/><ellipse cx=\"113.7\" cy=\"102.1\" rx=\"1.9\" ry=\"5.0\" transform=\"rotate(11.3 113.7 102.1)\" fill=\"var(--art-clay-lit,#F6A06F)\"/><ellipse cx=\"113.7\" cy=\"102.1\" rx=\"1.4\" ry=\"3.7\" transform=\"rotate(11.3 113.7 102.1)\" fill=\"var(--art-wood,#DCA063)\"/><ellipse cx=\"113.7\" cy=\"102.1\" rx=\"0.55\" ry=\"1.3\" transform=\"rotate(11.3 113.7 102.1)\" fill=\"var(--art-ink-lit,#3A3460)\"/></svg>\n";
export const STILL_HASH = "3de58c121e";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]).filter((s) => s.includes(" fill="));
if (EL.length !== 20 || !EL[6].startsWith('<path d="M64 40.8L160 60')) throw new Error("difficult: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const pts = (P) => P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
const ptsOf = (svg) => /points="([^"]+)"/.exec(svg)[1].trim().split(/\s+/).map((q) => q.split(",").map(Number));
const DEG = Math.PI / 180;

// ---- the world and its cameras. A camera: turned psi, looking down e, scale s, the world point W shown at the screen point C
const SIN_E0 = Math.sqrt(0.52), E0 = Math.asin(SIN_E0), PSI0 = Math.atan(0.2 / SIN_E0);
const ALPHA = 1 / Math.cos(PSI0), BETA = 0.3846 / Math.sin(PSI0);   // the world's length of one a, one b
const H = 2.6 / Math.cos(E0);                                       // the sheet's top above the floor
const SHEET = [111, 96.2];
const CAM0 = { psi: PSI0, e: E0, s: 1, W: [0, 0, 0], C: [59, 35.4] };
function proj(cam, [X, Y, Z]) {
  const dx = X - cam.W[0], dy = Y - cam.W[1], dz = Z - cam.W[2], c = Math.cos(cam.psi), sn = Math.sin(cam.psi);
  return [cam.C[0] + cam.s * (c * dx - sn * dz), cam.C[1] + cam.s * (Math.sin(cam.e) * (sn * dx + c * dz) - Math.cos(cam.e) * dy)];
}
const lin = (cam, v) => { const o = proj(cam, [0, 0, 0]), p = proj(cam, v); return [p[0] - o[0], p[1] - o[1]]; };
const toCam = (cam) => [Math.sin(cam.psi) * Math.cos(cam.e), Math.sin(cam.e), Math.cos(cam.psi) * Math.cos(cam.e)];
// a point of the still on the plane at height Y, back in the world
function unproj(p, Y) {
  const ex = lin(CAM0, [1, 0, 0]), ez = lin(CAM0, [0, 0, 1]), o = proj(CAM0, [0, Y, 0]), det = ex[0] * ez[1] - ex[1] * ez[0];
  const x = p[0] - o[0], y = p[1] - o[1];
  return [(x * ez[1] - y * ez[0]) / det, Y, (ex[0] * y - ex[1] * x) / det];
}
// what the still shows on the plane at height Y, carried to the camera: one affine map
function planeMatrix(cam, Y) {
  const ex0 = lin(CAM0, [1, 0, 0]), ez0 = lin(CAM0, [0, 0, 1]), ex1 = lin(cam, [1, 0, 0]), ez1 = lin(cam, [0, 0, 1]);
  const det = ex0[0] * ez0[1] - ex0[1] * ez0[0], inv = [ez0[1] / det, -ez0[0] / det, -ex0[1] / det, ex0[0] / det];
  const a = ex1[0] * inv[0] + ez1[0] * inv[2], c = ex1[0] * inv[1] + ez1[0] * inv[3], b = ex1[1] * inv[0] + ez1[1] * inv[2], d = ex1[1] * inv[1] + ez1[1] * inv[3];
  const o0 = proj(CAM0, [0, Y, 0]), o1 = proj(cam, [0, Y, 0]);
  return [a, b, c, d, o1[0] - a * o0[0] - c * o0[1], o1[1] - b * o0[0] - d * o0[1]];
}
const onPlane = (M, svg) => `<g transform="matrix(${M.slice(0, 4).map(n4).join(" ")} ${n2(M[4])} ${n2(M[5])})">${svg}</g>`;
// the light: the still's sheet throws its top's outline (5, 3.4) along the floor, so this is the way to the light
const CAST = (() => { const f = unproj([59 + 5, 35.4 + 3.4], 0); return [f[0] / H, f[2] / H]; })();
const LIGHT = (() => { const v = [-CAST[0], 1, -CAST[1]], l = Math.hypot(...v); return v.map((x) => x / l); })();

// ---- the sheet: its sides from the world (a side shows when it faces the camera; the two towards the light paler), its print and
// shadows carried from the still
const paperAB = (p) => { const det = 1 + 0.3846 * 0.2; return [(p[0] - 59 + 0.3846 * (p[1] - 32.8)) / det, (p[1] - 32.8 - 0.2 * (p[0] - 59)) / det]; };
const fromAB = ([a, b]) => [59 + a - 0.3846 * b, 32.8 + 0.2 * a + b];
// a convex outline cut by a line a = A, keeping one side
function cutA(P, A, keepBelow) {
  const out = [], inside = (p) => (keepBelow ? p[0] <= A : p[0] >= A);
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length];
    if (inside(p)) out.push(p);
    if (inside(p) !== inside(q)) { const k = (A - p[0]) / (q[0] - p[0]); out.push([A, p[1] + (q[1] - p[1]) * k]); }
  }
  return out;
}
// the pencil's shadow on the paper (in the paper's shade), as the still has it
const PENCIL_SHADOW = ptsOf(EL[4]).map(paperAB);
const SHADOW_ON_PAPER = `<polygon points="${pts(cutA(PENCIL_SHADOW, SHEET[0], true).map(fromAB))}" ${fill("paper-deep")}/>`;
const PRINT = EL[3] + SHADOW_ON_PAPER + EL.slice(6, 11).join("");
const SHEET_SHADOW = EL[1];
// a sheet in the world: its corners (a, b) → (X, Z) through a pose (turned th about its middle, moved by [dx, dz])
const MID = [(ALPHA * SHEET[0]) / 2, (BETA * SHEET[1]) / 2];
const posed = (pose, [X, Z]) => {
  if (!pose) return [X, Z];
  const c = Math.cos(pose.th), s = Math.sin(pose.th), x = X - MID[0], z = Z - MID[1];
  return [MID[0] + c * x - s * z + pose.d[0], MID[1] + s * x + c * z + pose.d[1]];
};
const CORNERS = [[0, 0], [SHEET[0], 0], [SHEET[0], SHEET[1]], [0, SHEET[1]]].map(([a, b]) => [ALPHA * a, BETA * b]);
function sides(cam, pose) {
  const C = CORNERS.map((p) => posed(pose, p)), tc = toCam(cam);
  // its footprint first, in the shade, as the still draws it: with the top over it, that is the shaded sides (a sheet this thin, they
  // are what's between the two); then each side facing the camera that the light falls on, paler, over it
  let out = `<polygon points="${pts(C.map(([X, Z]) => proj(cam, [X, 0, Z])))}" ${fill("paper-deep")}/>`;
  for (let i = 0; i < 4; i++) {
    const p = C[i], q = C[(i + 1) % 4], nx = q[1] - p[1], nz = -(q[0] - p[0]), l = Math.hypot(nx, nz);
    if ((nx * tc[0] + nz * tc[2]) / l <= 1e-6) continue;
    const lit = (nx * LIGHT[0] + nz * LIGHT[2]) / l;
    if (lit <= 0) continue;
    const tone = lit > 0.6 ? "paper" : "paper-mid";
    // (its top edge tucked a little under the top, so no seam shows along the paper's edge)
    out += `<polygon points="${pts([[p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], H + 0.8, q[1]], [p[0], H + 0.8, p[1]]].map((P) => proj(cam, P)))}" ${fill(tone)}/>`;
  }
  return out;
}

// ---- the pencil: a cylinder along a, resting on the paper, drawn from the world. The still's bands of light are lines fixed on it (the
// light is fixed): lit, then plain, then deep, going round from the light; the wood's cone split the same way; its butt's rings.
const R = 5, AX_DZ = (R * Math.cos(E0) * Math.cos(PSI0)) / SIN_E0, AX = { y: H + R, z: BETA * 54.2 + AX_DZ, dx: Math.tan(PSI0) * AX_DZ };
const axisAt = (a) => [ALPHA * a + AX.dx, AX.y, AX.z];
const A_BUTT = 75.5, A_PAINT = 127, A_WOOD = 136, A_POINT = 140, LEAD_R = 1.7;
const PHI_L = Math.atan2(LIGHT[2], LIGHT[1]);
const PHI_C0 = Math.atan2(toCam(CAM0)[2], toCam(CAM0)[1]);
const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
const TH_LIT = Math.abs(wrap(PHI_C0 + Math.asin(-2 / R) - PHI_L)), TH_DEEP = Math.abs(wrap(PHI_C0 + Math.asin(2.2 / R) - PHI_L)), TH_WOOD = Math.abs(wrap(PHI_C0 - PHI_L));
const BUTT = [[1.9, 5, "clay-lit"], [1.4, 3.7, "wood"], [0.55, 1.3, "ink-lit"]];
// the parts of a band (arcs round the pencil, as angles: 0 is towards the light) that face the camera, as offsets across it on the screen
function across(cam, n, arcs) {
  const sy = lin(cam, [0, 1, 0]), sz = lin(cam, [0, 0, 1]), ny = n[0] * sy[0] + n[1] * sy[1], nz = n[0] * sz[0] + n[1] * sz[1];
  const tc = toCam(cam), phiC = Math.atan2(tc[2], tc[1]), off = (phi) => R * (Math.cos(phi) * ny + Math.sin(phi) * nz);
  const out = [];
  for (const [lo, hi] of arcs) {
    for (const k of [-2, -1, 0, 1, 2]) {
      const v0 = phiC - Math.PI / 2 + 2 * Math.PI * k, v1 = phiC + Math.PI / 2 + 2 * Math.PI * k, x0 = Math.max(PHI_L + lo, v0), x1 = Math.min(PHI_L + hi, v1);
      if (x1 - x0 > 1e-6) out.push([off(x0), off(x1)]);
    }
  }
  return out;
}
const TAU = 2 * Math.PI;
const BANDS = [[[[-TH_LIT, TH_LIT]], "clay-lit"], [[[TH_LIT, TH_DEEP], [-TH_DEEP, -TH_LIT]], "clay"], [[[TH_DEEP, TAU - TH_DEEP]], "clay-deep"]];
const WOOD = [[[[-TH_WOOD, TH_WOOD]], "wood"], [[[TH_WOOD, TAU - TH_WOOD]], "wood-deep"]];
function pencil(cam) {
  const p0 = proj(cam, axisAt(A_BUTT)), p1 = proj(cam, axisAt(A_PAINT)), p2 = proj(cam, axisAt(A_WOOD)), p3 = proj(cam, axisAt(A_POINT));
  const L = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]), d = [(p3[0] - p0[0]) / L, (p3[1] - p0[1]) / L], n = [-d[1], d[0]];
  const at = (p, o) => [p[0] + n[0] * o, p[1] + n[1] * o];
  const band = (pa, pb, ka, kb, tone) => (o) => `<polygon points="${pts([at(pa, o[0] * ka), at(pb, o[0] * kb), at(pb, o[1] * kb), at(pa, o[1] * ka)])}" ${fill(tone)}/>`;
  const body = BANDS.map(([arcs, tone]) => across(cam, n, arcs).map(band(p0, p1, 1, 1, tone)).join("")).join("");
  const wood = WOOD.map(([arcs, tone]) => across(cam, n, arcs).map(band(p1, p2, 1, LEAD_R / R, tone)).join("")).join("");
  const s = cam.s, lead = `<polygon points="${pts([at(p2, -LEAD_R * s), p3, at(p2, LEAD_R * s)])}" ${fill("ink-lit")}/>`;
  // the butt's rings: the still draws them a little open (0.38 of round), and from where the butt really faces the camera, as it shows
  const tc = toCam(cam), open = Math.max(0.38, -tc[0] * ALPHA * Math.cos(PSI0)), ang = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
  const butt = BUTT.map(([rx, ry, tone]) => `<ellipse cx="${n2(p0[0])}" cy="${n2(p0[1])}" rx="${n2(((rx * open) / 0.38) * s)}" ry="${n2(ry * s)}" transform="rotate(${n2(ang)} ${n2(p0[0])} ${n2(p0[1])})" ${fill(tone)}/>`).join("");
  return body + wood + lead + butt;
}

// the pencil's shadow past the paper's edge, on the floor. The still draws it as a thin line straight on from the shadow on the paper; the
// light it throws (low, from the far left) puts it out beyond the tip, away from the light. The one turns into the other as the camera
// starts round (outlines in the world, paired up evenly along them), so from the far side it falls behind the pencil, as it must.
const STILL_FLOOR_SHADOW = cutA(PENCIL_SHADOW, SHEET[0], false).map((q) => { const w = unproj(fromAB(q), 0); return [w[0], w[2]]; });
const LIGHT_FLOOR_SHADOW = (() => {
  // the pencil cast down the light onto the floor (round sections along it, the cone narrowing, the point), outlined; only what falls past
  // the sheet's own shadow (nearer in, the paper or the sheet takes the light first)
  const P = [];
  for (const [a, r] of [[A_BUTT, R], [A_PAINT, R], [A_WOOD, LEAD_R], [A_POINT, 0]]) {
    const c = axisAt(a);
    for (let k = 0; k < 24; k++) { const g = (k / 24) * TAU, y = c[1] + r * Math.cos(g), z = c[2] + r * Math.sin(g); P.push([c[0] + CAST[0] * y, z + CAST[1] * y]); }
  }
  P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return cutA(lo.slice(0, -1).concat(up.slice(0, -1)), ALPHA * SHEET[0] + CAST[0] * H, false);
})();
const clockwise = (P) => (P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + (q[0] - p[0]) * (q[1] + p[1]); }, 0) < 0 ? P : P.slice().reverse());
function even(P, n) {
  P = clockwise(P);
  const i0 = P.reduce((m, p, i) => (p[0] + p[1] < P[m][0] + P[m][1] ? i : m), 0), Q = [...P.slice(i0), ...P.slice(0, i0)], L = [];
  let tot = 0;
  for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length]; L.push(Math.hypot(b[0] - a[0], b[1] - a[1])); tot += L[i]; }
  return Array.from({ length: n }, (_, k) => { let d = (k / n) * tot, i = 0; while (d > L[i] && i < L.length - 1) { d -= L[i]; i++; } const a = Q[i], b = Q[(i + 1) % Q.length], f = L[i] ? Math.min(1, d / L[i]) : 0; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; });
}
const SHADOW_PAIRS = [even(STILL_FLOOR_SHADOW, 40), even(LIGHT_FLOOR_SHADOW, 40)];
function pencilFloorShadow(cam, w) {
  const P = SHADOW_PAIRS[0].map((p, k) => [p[0] + (SHADOW_PAIRS[1][k][0] - p[0]) * w, 0, p[1] + (SHADOW_PAIRS[1][k][1] - p[1]) * w]);
  return `<polygon points="${pts(P.map((q) => proj(cam, q)))}" ${fill("violet-deep")}/>`;
}

// ---- the scene through a camera: the floor and what lies on it, the loose sheets (the sad's), the sheet, the pencil
function scene(cam, w = 0, loose = "") {
  return `${OPEN}<rect x="-300" y="-300" width="800" height="800" ${fill("violet")}/>${loose}${onPlane(planeMatrix(cam, 0), SHEET_SHADOW)}${pencilFloorShadow(cam, w)}`
    + `${sides(cam)}${onPlane(planeMatrix(cam, H), PRINT)}${pencil(cam)}</svg>`;
}
const mix = (a, b, u) => a + (b - a) * u;
const mixCam = (A, B, u) => ({ psi: mix(A.psi, B.psi, u), e: mix(A.e, B.e, u), s: mix(A.s, B.s, u), W: [0, 1, 2].map((i) => mix(A.W[i], B.W[i], u)), C: [0, 1].map((i) => mix(A.C[i], B.C[i], u)) });

// ---- happy: round the sheet to its far side, low through the swing, ending straight on with the whole maze in view: the route from where
// it came in, to the dead end, past the pencil's butt and on beside it, through the gap in the dead-end wall and the gap in the outer wall,
// out of the maze (the line running out of it is the read)
const TURN = 190 * DEG, E_END = 62 * DEG, DIP = 12 * DEG;
const END_AT = [ALPHA * 72, H, BETA * 50];
const HAPPY_DUR = 3.4;
function happyCam(t) {
  // hold, a small lean the other way, the swing (round past the end a little), and the settle
  const psi = PSI0 + track([[0.2, 0], [0.5, 4 * DEG, "io"], [2.4, -TURN - 3 * DEG, "io"], [2.85, -TURN, "io"]], t);
  const u = track([[0.5, 0], [2.4, 1, "io"]], t);
  const from = { ...CAM0, W: [ALPHA * 55.5, H, BETA * 48.1] };
  from.C = proj(CAM0, from.W);
  const cam = mixCam(from, { psi: 0, e: E_END, s: 1.2, W: END_AT, C: [100, 100] }, u);
  return { ...cam, psi, e: cam.e - DIP * Math.sin(Math.PI * u) };
}
function happy(t) {
  if (t <= 0) return STILL;
  return scene(happyCam(t), track([[0.5, 0], [1.2, 1, "io"]], t));
}

// ---- sad: back and up, over the loose sheets. Each is the same maze as the still shows it (the dead-end wall and the outer wall whole: the
// pencil hides their gaps), with the same orange line stopping at the same wall, lying on the floor at its own angle, out of the still's view
// (short numbers: tenths, no leading zero; each outline from one point then steps, the steps taken between rounded points so none drifts)
const f1 = (v) => { const r = Math.round(v * 10) / 10; return (r === 0 ? 0 : r).toString().replace(/^(-?)0\./, "$1."); };
const run = (P) => {
  const Q = P.map((q) => q.map((v) => Math.round(v * 10) / 10));
  return `M${f1(Q[0][0])} ${f1(Q[0][1])}` + Q.slice(1).map((q, i) => { const dx = f1(q[0] - Q[i][0]), dy = f1(q[1] - Q[i][1]); return `l${dx}${dy.startsWith("-") ? "" : " "}${dy}`; }).join("") + "Z";
};
const box = (a0, b0, a1, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
const LOOSE_WALLS = [...[...EL[6].matchAll(/M([^Z]+)Z/g)].map((m) => m[1].split("L").map((q) => q.trim().split(/\s+/).map(Number))),
  box(82.5, 50.7, 88.5, 58.5).map(fromAB), box(97.5, 50.7, 103.5, 58.5).map(fromAB)];
const LOOSE_ROUTE = ptsOf(EL[7]);
// where they lie: (across, along) the still's view from the sheet's middle, and how far each is turned
const LOOSE = [[-232, -30, 24], [236, 52, -33], [-25, -262, 68], [58, 268, -12], [-228, 236, 47], [232, -232, 14], [-250, -300, -40]].map(([x, z, th]) => {
  const c = Math.cos(PSI0), sn = Math.sin(PSI0);
  return { th: th * DEG, d: [c * x + sn * z, -sn * x + c * z] };
});
function looseSheets(cam) {
  const at = (pose, p, Y) => { const w = unproj(p, Y), q = posed(pose, [w[0], w[2]]); return proj(cam, [q[0], Y, q[1]]); };
  const tc = toCam(cam), side = { paper: "", "paper-mid": "" };
  let shadow = "", foot = "", paper = "", walls = "", route = "";
  for (const pose of LOOSE) {
    const top = CORNERS.map((q) => posed(pose, q));
    shadow += run(top.map(([X, Z]) => proj(cam, [X + CAST[0] * H, 0, Z + CAST[1] * H])));
    // its footprint and its lit sides facing the camera (as the sheet's own)
    foot += run(top.map(([X, Z]) => proj(cam, [X, 0, Z])));
    for (let i = 0; i < 4; i++) {
      const a = top[i], b = top[(i + 1) % 4], nx = b[1] - a[1], nz = -(b[0] - a[0]), l = Math.hypot(nx, nz);
      if ((nx * tc[0] + nz * tc[2]) / l <= 1e-6) continue;
      const lit = (nx * LIGHT[0] + nz * LIGHT[2]) / l;
      if (lit <= 0) continue;
      side[lit > 0.6 ? "paper" : "paper-mid"] += run([[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], H + 0.8, b[1]], [a[0], H + 0.8, a[1]]].map((P) => proj(cam, P)));
    }
    paper += run(top.map(([X, Z]) => proj(cam, [X, H, Z])));
    walls += LOOSE_WALLS.map((P) => run(P.map((q) => at(pose, q, H)))).join("");
    route += run(LOOSE_ROUTE.map((q) => at(pose, q, H)));
  }
  const sides = Object.entries(side).map(([tone, d]) => (d ? `<path d="${d}" ${fill(tone)}/>` : "")).join("");
  return `<path d="${shadow}" ${fill("violet-deep")}/><path d="${foot}" ${fill("paper-deep")}/>${sides}<path d="${paper}" ${fill("paper")}/><path d="${walls}" ${fill("ink")}/><path d="${route}" ${fill("clay")}/>`;
}
// (it rises only so far: higher, the pencil would stop hiding the far edge of the gaps under it)
const SAD_FAR = 1 / 0.33, E_HIGH = 51 * DEG;
const SAD_DUR = 2.9;
function sadCam(t) {
  // drawing back is the camera's distance growing (the picture's scale its inverse); rising, its angle. Hold, a small lean in, the draw
  // back (a little past), the settle
  const far = track([[0.2, 1], [0.42, 0.97, "io"], [2.15, SAD_FAR + 0.09, "io"], [2.55, SAD_FAR, "io"]], t);
  const u = track([[0.42, 0], [2.15, 1, "io"]], t);
  const W = [ALPHA * 60, H, BETA * 50], C0 = proj(CAM0, W);
  return { psi: PSI0, e: mix(E0, E_HIGH, u), s: 1 / far, W, C: [mix(C0[0], 100, u), mix(C0[1], 100, u)] };
}
function sad(t) {
  if (t <= 0) return STILL;
  const cam = sadCam(t);
  return scene(cam, 0, looseSheets(cam));
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
