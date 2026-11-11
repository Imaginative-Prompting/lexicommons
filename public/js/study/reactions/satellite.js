// Satellite's story: its two solar panels turn on their drives, each about its own boom, one cause with two outcomes.
// Happy: both drives turn their panels round to their broadest, full face on (52 degrees), brake, and hold there, two broad wings.
// Sad: the same turn, but the right panel's drive runs backward: it turns its panel the other way, edge on (38 degrees back), and jams there at the
// end of its travel with a shudder; the left one turns to its broadest as it should. The satellite is left lopsided: one broad wing, one thin blade.
// Every frame is a pure function of t, in seconds. The still's own parts: space, the Earth (its sea, its lit side, its land), the left panel (its
// edge, its face, its two cell lines), the two booms, the body (its side, its shade, its top), the dish (its mount, its arm, its back, its face, its
// feed), and the right panel (edge, face, cell lines). Each panel is a thin flat slab: its long side runs along its boom (33, 8 across the picture),
// its short side runs (-14, 19.5), its thickness (0, 2.6). For those to be one square panel seen from one place, the panel's face is seen 54
// degrees off square on, and its face normal shows as 29 straight down the picture for each unit of its length. A panel turned by a about its boom:
// its short side becomes v cos a + (0, 30) sin a, and its thickness turns with it. Edge on is at -37.7 degrees; broadest, 1.63 times the still's
// face, at +52.3. In space there's no gravity and no air: the panels turn as their drives turn them, and stop as they brake.
import { n2, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"-5\" cy=\"335\" r=\"197\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M0 201L0 138.1A197 197 0 0 1 57 148C77 154.6 102 178 112 201Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M0 143.5C8 142.5 17 143 24 145.5C21 148 23 150.5 28 150.5C34 150.5 40 150 45 152.5C52 156 54 161 49 164.5C44 168 38 166.5 33.5 170.5C29 174.5 25 178 23.5 182.5C22 187 25 190 29 193C22 195 13 192 7 187.5C4 185.5 1 184.5 0 184.5Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M0 191C7 192.5 13 196 15.5 201L0 201Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M56 201C57 195 61 189 68 187C74 186 80 182 86 180C91 179 95 181 97 184C99 188 100 194 101.5 201Z\" fill=\"var(--art-teal,#37B39B)\"/><polygon points=\"39.7,83.3 72.7,91.3 86.7,71.8 86.7,74.4 72.7,93.9 39.7,85.9\" fill=\"var(--art-sky-deep,#3488C9)\"/><polygon points=\"53.7,63.8 86.7,71.8 72.7,91.3 39.7,83.3\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"64.1,66.3 65.3,66.6 51.3,86.1 50.1,85.8\" fill=\"var(--art-sky-deep,#3488C9)\"/><polygon points=\"75.1,68.9 76.3,69.2 62.3,88.7 61.1,88.4\" fill=\"var(--art-sky-deep,#3488C9)\"/><polygon points=\"79,83.2 87.6,85.3 88.4,81.8 79.8,79.7\" fill=\"var(--art-steel,#A9B0BF)\"/><polygon points=\"113.6,91.2 126.6,94.3 127.4,90.8 114.4,87.7\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M84.2 74.2L84.2 102A17.3 6 0 0 0 118.8 102L118.8 74.2Z\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><path d=\"M110 79.4A17.3 6 0 0 0 118.8 74.2L118.8 102A17.3 6 0 0 1 110 107.2Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><ellipse cx=\"101.5\" cy=\"74.2\" rx=\"17.3\" ry=\"6\" fill=\"var(--art-paper,#FBF7EC)\"/><ellipse cx=\"95\" cy=\"99\" rx=\"2.8\" ry=\"1.4\" fill=\"var(--art-steel-deep,#6B687A)\"/><polygon points=\"95.8,99.8 83.8,111.8 82.2,110.2 94.2,98.2\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M68.6 100C83.4 96.2 94.2 118.2 82 127.6Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M68.6 100A15.4 8 64.1 0 1 82 127.6A15.4 8 64.1 0 1 68.6 100Z\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"75.6,114.3 66.6,118.7 66,117.7 75,113.3\" fill=\"var(--art-steel-deep,#6B687A)\"/><circle cx=\"65.5\" cy=\"118.6\" r=\"2.2\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><polygon points=\"116.9,102.5 149.9,110.5 163.9,91 163.9,93.6 149.9,113.1 116.9,105.1\" fill=\"var(--art-sky-deep,#3488C9)\"/><polygon points=\"130.9,83 163.9,91 149.9,110.5 116.9,102.5\" fill=\"var(--art-sky,#58ADEB)\"/><polygon points=\"141.3,85.5 142.5,85.8 128.5,105.3 127.3,105\" fill=\"var(--art-sky-deep,#3488C9)\"/><polygon points=\"152.3,88.1 153.5,88.4 139.5,107.9 138.3,107.6\" fill=\"var(--art-sky-deep,#3488C9)\"/></svg>\n";
export const STILL_HASH = "fbf2217372";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 25 || !EL[7].includes('points="53.7,63.8 86.7,71.8 72.7,91.3 39.7,83.3"') || !EL[22].includes('points="130.9,83 163.9,91 149.9,110.5 116.9,102.5"')) throw new Error("satellite: the still isn't as this story knows it");
// ---- the panel's geometry (as above)
const U = [33, 8], V = [-14, 19.5], D = 2.6;
const W = Math.sqrt((U[0] * U[1]) / (-V[0] * V[1])), K = Math.sqrt(U[0] * U[0] + (V[0] / W) ** 2 - U[1] * U[1] - (V[1] / W) ** 2);
const BROAD = (Math.atan2(W * K * U[0], U[0] * V[1] - U[1] * V[0]) * 180) / Math.PI, EDGE = -(Math.atan2(U[0] * V[1] - U[1] * V[0], W * K * U[0]) * 180) / Math.PI;
// the turned short side and thickness
const side = (a) => { const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [V[0] * c, V[1] * c + W * K * s]; };
const thick = (a) => { const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), f = D / (K * W); return [-f * V[0] * s, D * c - f * V[1] * s]; };
// a point of the panel (axis through P along U) as the panel turns: its part along U stays, its part along V goes along the turned side
const DET = U[0] * V[1] - U[1] * V[0];
function turner(P, a) {
  const v2 = side(a);
  return ([x, y]) => { const dx = x - P[0], dy = y - P[1], al = (dx * V[1] - dy * V[0]) / DET, be = (U[0] * dy - U[1] * dx) / DET; return [P[0] + al * U[0] + be * v2[0], P[1] + al * U[1] + be * v2[1]]; };
}
const pts = (el) => el.match(/points="([^"]*)"/)[1].trim().split(/\s+/).map((p) => p.split(",").map(Number));
const withPts = (el, P) => el.replace(/points="[^"]*"/, `points="${P.map(([x, y]) => `${n2(x)},${n2(y)}`).join(" ")}"`);
function panel(edgeEl, faceEl, lineEls, P, a) {
  if (Math.abs(a) < 1e-9) return edgeEl + faceEl + lineEls.join("");
  const f = turner(P, a), F = pts(faceEl).map(f), n = thick(a);
  // its edge: the face's two sides that face the way its thickness shows, and the same two sides moved by its thickness
  let i = 0;
  for (let j = 1; j < 4; j++) if (F[j][0] * n[0] + F[j][1] * n[1] > F[i][0] * n[0] + F[i][1] * n[1]) i = j;
  const C = [F[(i + 1) % 4], F[i], F[(i + 3) % 4]], E = [...C, ...C.slice().reverse().map(([x, y]) => [x + n[0], y + n[1]])];
  return withPts(edgeEl, E) + withPts(faceEl, F) + lineEls.map((l) => withPts(l, pts(l).map(f))).join("");
}
const LEFT = [EL[6], EL[7], [EL[8], EL[9]], [79.7, 81.55]], RIGHT = [EL[21], EL[22], [EL[23], EL[24]], [123.9, 92.75]];
const MID = EL.slice(10, 21).join(""), SPACE = EL.slice(0, 6).join("");
// ---- the turns
const T0 = 0.3, T_TURN = 1.45, OVER = 2.5;
// a drive's turn to its mark: easing out of rest, braking a touch past it, settling back
const driven = (t, to, t0, t1) => track([[t0, 0], [t1, to + Math.sign(to) * OVER, "io"], [t1 + 0.32, to, "io"]], t);
// the right drive run backward: it runs at the same speed the other way until its panel is edge on, where it jams with a shudder
const T_JAM = T0 + (T_TURN - T0) * 0.78;
function jammed(t) {
  if (t <= T_JAM) return track([[T0, 0], [T_JAM, EDGE, "in"]], t);
  const k = t - T_JAM;
  // (it hits its stop and bounces back off it, never past: past it we would see its back)
  return EDGE + 2.2 * Math.exp(-k * 16) * Math.abs(Math.sin(k * 30));
}

// ---- happy: both broad
const HAPPY_DUR = T_TURN + 0.32 + 0.6;
function happy(t) {
  if (t <= T0) return STILL;
  return `${OPEN}${SPACE}${panel(...LEFT, driven(t, BROAD, T0, T_TURN))}${MID}${panel(...RIGHT, driven(t, BROAD, T0 + 0.04, T_TURN + 0.04))}</svg>`;
}
// ---- sad: lopsided
const SAD_DUR = T_TURN + 0.32 + 0.6;
function sad(t) {
  if (t <= T0) return STILL;
  return `${OPEN}${SPACE}${panel(...LEFT, driven(t, BROAD, T0, T_TURN))}${MID}${panel(...RIGHT, jammed(t))}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
