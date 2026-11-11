// Chair's two stories. Happy: a cushion, tossed in from the left, flies in front of the back and lands on the seat: it squashes, bounces a
// little, slides a touch and settles, its own shade on the wood beside it. Sad: a heavy bag, tossed from the left, sails over the back; its
// strap catches the top of the right post and the bag swings on out past it, and its pull carries the chair over onto its side. The bag
// hits the floor first and the chair's back comes down across it; the camera draws back as it goes, to keep the whole fall in view.
// The chair is the still's own parts. Each point has a depth (0 at the front legs' faces, 1 at the back posts'), and the chair falls about the
// line along its two right feet: every depth turns about that line's own point at that depth, so the chair turns as a solid, in this view.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view; the world carries on past its frame.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M43 161L54 158.8L82.5 162.8L103 162.6L111 159.5L200 182.6L200 200L108.3 200L19.4 181.2L31.8 177.1L82.5 182.2L82.5 175.8Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M37.2 116.6L50.6 116.6L50.6 159.2Q49.4 161.8 45.6 162.8L41.6 162.7Q39.2 162.6 37.7 161.9Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M37.2 117.5L46.2 117.5L46.2 162.8L41.6 162.7Q39.2 162.6 37.7 161.9Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M101.6 103.8L114.6 101.6L114.6 159.9Q113.4 162.5 109.2 164.3L105.4 164.3L101.6 163.8Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M101.6 108.1L109.2 108.1L109.2 164.3L105.4 164.3L101.6 163.8Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M19.4 117.8L32.5 117.8L32.5 176.9Q31.4 180.5 28 181.9L23.7 181.9L19.4 181.3Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M19.4 119L28 119L28 181.9L23.7 181.9L19.4 181.3Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M81.9 118L96.2 117.7L96.2 181.4Q94.4 184.5 90.8 185.9L86.6 185.9L81.9 185.5Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M81.9 119L90.8 119L90.8 185.9L86.6 185.9L81.9 185.5Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M37.2 24.7L46.2 24.7L50.6 22.2L50.6 96.8L47.7 98.3L37.2 98.3Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M37.2 24.7L46.2 24.7L46.2 98.3L37.2 98.3Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M37.2 24.7L41.6 22.1L48.7 22.1L50.6 22.2L46.2 24.7Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M57.5 41L64.9 41L64.9 78.9L63.5 79.6L57.5 79.6Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M57.5 41L63.5 41L63.5 79.6L57.5 79.6Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M72.1 41L79.5 41L79.5 78.9L78.1 79.6L72.1 79.6Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M72.1 41L78.1 41L78.1 79.6L72.1 79.6Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M86.6 41L94.1 41L94.1 78.9L92.7 79.6L86.6 79.6Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M86.6 41L92.7 41L92.7 79.6L86.6 79.6Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M47.3 78.7L50.7 77.2L103 77.2L103 85.9L48 85.9Q47.3 85.9 47.3 85.2Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M47.3 31.4L50.7 29.4L103 29.4L103 42.2L48 42.2Q47.3 42.2 47.3 41.5Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M100.7 24.7L109.2 24.7L114.6 22.1L114.6 104L109.2 104L100.7 98.1Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M100.7 24.7L109.2 24.7L109.2 98.1L100.7 98.1Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M100.7 24.7L104.8 22.1L114.6 22.1L109.2 24.7Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M94.8 110.7L112.6 97.4L112.6 106.2L96 119.6L94.8 120Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M17.2 110.7L96.2 110.7L96.2 120L17.2 120Z\" fill=\"var(--art-bark,#7A4E2D)\"/>\n<path d=\"M17.2 111.2L38 98.3L50.8 96.2L100.7 96.2L100.7 97.7L109.2 97.7L112.6 97.4L94.9 111.2Z\" fill=\"var(--art-wood,#DCA063)\"/>\n</svg>\n";
export const STILL_HASH = "576e8fbd11";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 27) throw new Error("chair: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const dOf = (e) => e.match(/ d="([^"]*)"/)[1], fillOf = (e) => e.match(/ fill="([^"]*)"/)[1];

// ---- depth. The view's depth runs up and right: a step from the front legs' faces to the back posts' is (18.4, −21.6) at the floor.
const F0 = [90.8, 185.9], DEPTH = [18.4, -21.6];
const side = (z0, xr) => (x) => z0 + Math.max(0, x - xr) / DEPTH[0];
// each part's depth at a point (its front face at one depth, its right side going back from the face's right edge; tops back above)
const Z = {
  2: side(1, 46.2), 3: () => 1, 4: side(1, 109.2), 5: () => 1, 6: side(0, 28), 7: () => 0, 8: side(0, 90.8), 9: () => 0,
  10: side(1, 46.2), 11: () => 1, 12: (x, y) => (y < 24 ? 1.24 : 1),
  13: side(1.1, 63.5), 14: () => 1.1, 15: side(1.1, 78.1), 16: () => 1.1, 17: side(1.1, 92.7), 18: () => 1.1,
  19: () => 1.06, 20: () => 1.06, 21: side(1, 109.2), 22: () => 1, 23: (x, y) => (y < 24 ? 1.29 : 1),
  24: (x) => Math.max(0, x - 94.8) / DEPTH[0], 25: () => 0, 26: (x, y) => (y > 110 ? 0 : 1),
};
/** A path's points (M, L, Q, Z only), each with its depth. */
function parse(d, zf) {
  const out = [], re = /([MLQZ])([^MLQZ]*)/g;
  for (const [, c, args] of d.matchAll(re)) {
    const v = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    const pts = [];
    for (let i = 0; i < v.length; i += 2) pts.push([v[i], v[i + 1], zf(v[i], v[i + 1])]);
    out.push([c, pts]);
  }
  return out;
}
const PARTS = Object.fromEntries(Object.keys(Z).map((i) => [i, { cmds: parse(dOf(EL[i]), Z[i]), fill: fillOf(EL[i]) }]));
// the faces the still never shows, on each member's left (they come into view as the chair goes past about 40°): from the front face's left
// edge back to where its right side's depth ends; drawn behind their member, so hidden until then
const face = (x, yTop, yBot, z0, w, topBack = null, botBack = null, xBot = x) => {
  const tb = topBack ?? [x + DEPTH[0] * w, yTop + DEPTH[1] * w], bb = botBack ?? [x + DEPTH[0] * w, yBot + DEPTH[1] * w];
  return { cmds: [["M", [[x, yTop, z0]]], ["L", [[tb[0], tb[1], z0 + w], [bb[0], bb[1], z0 + w], [xBot, yBot, z0]]], ["Z", []]], fill: paint("wood") };
};
const LEFT = {
  2: face(37.2, 117.5, 161.9, 1, 0.24, null, null, 37.7), 4: face(101.6, 108.1, 163.8, 1, 0.29), 6: face(19.4, 119, 181.3, 0, 0.24), 8: face(81.9, 119, 185.5, 0, 0.29),
  10: face(37.2, 24.7, 98.3, 1, 0.24, [41.6, 22.5]), 21: face(100.7, 24.7, 98.1, 1, 0.29, [104.8, 22.5]),
  13: face(57.5, 41, 79.6, 1.1, 0.076), 15: face(72.1, 41, 79.6, 1.1, 0.076), 17: face(86.6, 41, 79.6, 1.1, 0.076),
  seat: { cmds: [["M", [[17.2, 111.6, 0]]], ["L", [[38, 98.8, 1], [38, 107.6, 1], [17.2, 119.6, 0]]], ["Z", []]], fill: paint("wood") },
};

/** A point of the chair, at its depth z, turned phi° (to the right, falling) about the right feet's line. */
function turn(x, y, z, c, s) {
  const ax = F0[0] + DEPTH[0] * z, ay = F0[1] + DEPTH[1] * z, dx = x - ax, dy = y - ay;
  return [ax + c * dx - s * dy, ay + s * dx + c * dy];
}
function draw(part, c, s) {
  let d = "";
  for (const [cmd, pts] of part.cmds) {
    d += cmd;
    d += pts.map(([x, y, z]) => { const p = turn(x, y, z, c, s); return `${n2(p[0])} ${n2(p[1])}`; }).join(" ");
  }
  return `<path d="${d}" fill="${part.fill}"/>`;
}
const ORDER = [["L", 2], 2, 3, ["L", 4], 4, 5, ["L", 6], 6, 7, ["L", 8], 8, 9, ["L", 10], 10, 11, 12, ["L", 13], 13, 14, ["L", 15], 15, 16, ["L", 17], 17, 18, 19, 20, ["L", 21], 21, 22, 23, ["L", "seat"], 24, 25, 26];
// the tops (the seat's and the posts' caps) face the light; as the chair goes over they turn to face the way the right sides did, into the
// right sides' shade: a shade over them grows as they turn
const TOPS = new Set([12, 23, 26]);
/** The chair turned phi degrees; `after` adds drawing after a part (the strap round the right post). */
function chairAt(phi, after = {}) {
  const a = (phi * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), shade = Math.min(1, phi / 88);
  return ORDER.map((k) => {
    if (Array.isArray(k)) return draw(LEFT[k[1]], c, s);
    let svg = draw(PARTS[k], c, s);
    if (TOPS.has(k) && shade > 0.004) svg += draw({ ...PARTS[k], fill: `${paint("wood-deep")}" opacity="${n2(shade)}` }, c, s);
    return svg + (after[k] ?? "");
  }).join("");
}
const turnAt = (phi) => { const a = (phi * Math.PI) / 180; return (x, y, z) => turn(x, y, z, Math.cos(a), Math.sin(a)); };
const floorAt = (z) => F0[1] + DEPTH[1] * z;
const pts = (P) => P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

// ---- the world past the frame: the wall and floor (one teal) carried on; the chair's shadow carried on past the frame's right and bottom
// edges to the backrest's end (its shape inside the frame is the still's own). The light throws a point h above the floor (1.27, 0.28) h.
const BG = `<rect x="-400" y="-400" width="1100" height="1000" ${fill("teal")}/>`;
const LIGHT = [1.27, 0.28];
const shadowOf = (p, z) => { const fl = floorAt(z), h = Math.max(0, fl - p[1]); return [p[0] + h * LIGHT[0], fl + h * LIGHT[1]]; };
// the still's shadow, carried on past the frame's right and bottom edges to the shadow of the backrest's top (its shape inside the frame is the
// still's own)
const STILL_SHADOW = [[43, 161], [54, 158.8], [82.5, 162.8], [103, 162.6], [111, 159.5], [200, 182.6], [287, 205.2], [289, 208], [216, 210],
  [190, 207], [112, 200.8], [19.4, 181.2], [31.8, 177.1], [82.5, 182.2], [82.5, 175.8]];
// as the chair goes over, its shadow is the outline of every point of it thrown along the light (its hull, the still's own simple manner):
// the still's shadow becomes it over the first 25°, and from there it is it
const ALL_POINTS = ORDER.flatMap((k) => (Array.isArray(k) ? LEFT[k[1]] : PARTS[k]).cmds.flatMap(([, p]) => p));
function hull(P) {
  const Q = [...P].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of Q) { while (lo.length > 1 && cross(lo.at(-2), lo.at(-1), p) <= 0) lo.pop(); lo.push(p); }
  for (const p of Q.reverse()) { while (hi.length > 1 && cross(hi.at(-2), hi.at(-1), p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
/** An outline as N points evenly round it, from its leftmost point, going the same way round whatever its own order. */
function even(P, N) {
  let area = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const Q = area < 0 ? [...P].reverse() : P, k = Q.reduce((m, p, i) => (p[0] < Q[m][0] ? i : m), 0), R = Q.slice(k).concat(Q.slice(0, k));
  const L = R.map((p, i) => Math.hypot(R[(i + 1) % R.length][0] - p[0], R[(i + 1) % R.length][1] - p[1])), total = L.reduce((x, y) => x + y, 0);
  const out = [];
  let i = 0, acc = 0;
  for (let n = 0; n < N; n++) {
    const want = (n / N) * total;
    while (acc + L[i] < want) { acc += L[i]; i++; }
    out.push(lerp(R[i], R[(i + 1) % R.length], L[i] ? (want - acc) / L[i] : 0));
  }
  return out;
}
const N_SHADOW = 48, STILL_EVEN = even(STILL_SHADOW, N_SHADOW);
function chairShadow(phi) {
  if (phi <= 0) return `<polygon points="${pts(STILL_SHADOW)}" ${fill("teal-deep")}/>`;
  const tr = turnAt(phi), H = even(hull(ALL_POINTS.map(([x, y, z]) => shadowOf(tr(x, y, z), z))), N_SHADOW), u = track([[0, 0], [25, 1, "io"]], phi);
  return `<polygon points="${pts(STILL_EVEN.map((p, i) => lerp(p, H[i], u)))}" ${fill("teal-deep")}/>`;
}

function view(z, fx, fy, inner) {
  const cam = z === 1 && fx === 100 && fy === 100 ? "" : `translate(100 100) scale(${n4(z)}) translate(${n2(-fx)} ${n2(-fy)})`;
  return `${OPEN}${cam ? `<g transform="${cam}">${inner}</g>` : inner}</svg>`;
}

// ---- sad. Weights and sizes in the view's units: the seat is 70 up (about 45 cm), so gravity is 1530 a second squared.
const G = 1530;
// the bag: a satchel 34 wide, 26 high, a strap from its two top corners; drawn from its top's middle, turned rot°
const BAG = {
  back: `<rect x="-13.8" y="-3.8" width="34" height="26" rx="4" ${fill("ink")}/>`,
  body: `<rect x="-17" y="0" width="34" height="26" rx="4" ${fill("ink-lit")}/>`,
  flap: `<path d="M-17 4Q-17 0-13 0H13Q17 0 17 4V9Q17 12 14 12H-14Q-17 12-17 9Z" ${fill("ink")}/>`,
  buckle: `<rect x="-2.6" y="8.6" width="5.2" height="4.8" rx="1" ${fill("sun")}/>`,
};
const ANCHORS = [[-15, 1.5], [15, 1.5]], BAG_Z = 1.3, BAG_FLOOR = floorAt(BAG_Z);
const rotP = (p, rot, at, sy = 1) => { const a = (rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), y = p[1] * sy; return [at[0] + c * p[0] - s * y, at[1] + s * p[0] + c * y]; };
const bagAt = (at, rot, sy = 1) => `<g transform="translate(${n2(at[0])} ${n2(at[1])}) rotate(${n2(rot)}) scale(1 ${n4(sy)})">${BAG.back}${BAG.body}${BAG.flap}${BAG.buckle}</g>`;
// its shadow: high up it's too soft to see; it sharpens in as the bag comes down to the floor (full by 20 above it)
const bagShadow = (at, rot, sy = 1) => {
  const k = Math.min(1, Math.max(0, (55 - (BAG_FLOOR - (at[1] + 26 * sy))) / 35));
  return k < 0.004 ? "" : `<polygon points="${pts([[-17, 0], [17, 0], [17, 26], [-17, 26], [-13.8, -3.8], [20.2, -3.8]].map((p) => shadowOf(rotP(p, rot, at, sy), BAG_Z)))}" ${fill("teal-deep")}${k < 1 ? ` opacity="${n2(k)}"` : ""}/>`;
};
// where the strap goes round the right post: its right edge, 132 up, at the post's back (so the strap never crosses the post as it's drawn)
const HOOK = [114.6, floorAt(1.29) - 132], HOOK_Z = 1.29, R_STRAP = 30;
// the strap's loop in front of the post, round its front face and right side, at that height
const BAND_Y = floorAt(1) - 132;
const BAND = [[100.7, BAND_Y - 1.2, 1], [109.2, BAND_Y - 1.2, 1], [114.6, BAND_Y - 1.2 + DEPTH[1] * 0.29, 1.29], [114.6, BAND_Y + 1.2 + DEPTH[1] * 0.29, 1.29], [109.2, BAND_Y + 1.2, 1], [100.7, BAND_Y + 1.2, 1]];

// the throw: in from the left behind the chair's back (it passes behind the posts), over and down past the right post, the strap's loop
// trailing above and behind it; at T_HOOK the loop drops over the post's top and the strap goes taut, the bag 30 out from it, 70° up from
// straight down
const T_THROW = 0.02, T_HOOK = 0.62, PSI0 = 70;
const CATCH = [HOOK[0] + R_STRAP * Math.sin((PSI0 * Math.PI) / 180), HOOK[1] + R_STRAP * Math.cos((PSI0 * Math.PI) / 180)];
// (from low and far enough out that its shadow, thrown right along the light, starts out of the frame too)
const FROM = [-66, 128], FLY = T_HOOK - T_THROW, VX = (CATCH[0] - FROM[0]) / FLY, VY = (CATCH[1] - FROM[1] - 0.5 * G * FLY * FLY) / FLY;
const flight = (s) => [FROM[0] + VX * s, FROM[1] + VY * s + 0.5 * G * s * s];
const LOOP = [HOOK[0] - CATCH[0], HOOK[1] - CATCH[1]];

// the fall, worked out once: the yank starts the chair over at 1 rad/s; with the bag hanging from its post it tips about the right feet
// like a rod (13.9/s², its balance 6° over); the bag swings on its strap from 70° (a pendulum, 30 long, slowly damped); when the bag's
// foot reaches the floor it stands there and skids a little, the strap goes slack, and the chair falls on alone (its own balance 27° over)
// until its back comes down across the bag's top corner
const SIM = (() => {
  const dt = 1 / 600, out = [];
  let phi = 0, w = 1, s = 0, land = null, rest = null;
  const A = [F0[0] + DEPTH[0] * HOOK_Z, floorAt(HOOK_Z)], RH = Math.hypot(HOOK[0] - A[0], HOOK[1] - A[1]), H0 = Math.atan2(HOOK[0] - A[0], A[1] - HOOK[1]);
  const psiAt = (u) => PSI0 * Math.exp(-3 * u) * Math.cos(Math.sqrt(G / R_STRAP) * u);
  while (s < 3) {
    const alpha = land ? 14.7 * Math.sin(phi - (27 * Math.PI) / 180) : 13.9 * Math.sin(phi - (6 * Math.PI) / 180);
    w += alpha * dt; phi += w * dt; s += dt;
    const psi = psiAt(s), hook = [A[0] + RH * Math.sin(phi + H0), A[1] - RH * Math.cos(phi + H0)];
    const at = [hook[0] + R_STRAP * Math.sin((psi * Math.PI) / 180), hook[1] + R_STRAP * Math.cos((psi * Math.PI) / 180)];
    if (!land && at[1] + 26 >= BAG_FLOOR) {
      land = { s, at: [at[0], BAG_FLOOR - 26], psi };
      const left = land.at[0] - 17 + 12, A2 = [F0[0] + DEPTH[0] * BAG_Z, BAG_FLOOR];
      rest = (Math.atan2(left - A2[0], 26) * 180) / Math.PI;
    }
    out.push([phi, psi]);
    if (rest !== null && (phi * 180) / Math.PI >= rest) break;
  }
  return { dt, rows: out, land, rest, end: s };
})();
const T_LAND = T_HOOK + SIM.land.s, T_REST = T_HOOK + SIM.end;
const simAt = (s) => { const k = Math.min(SIM.rows.length - 1, Math.max(0, Math.round(s / SIM.dt) - 1)); return SIM.rows[k]; };

// the camera draws back while the bag is in the air, so the fall fits
const Z_CAM = 0.66, FX = 165, FY = 112;
const camAt = (t) => { const k = track([[0.06, 0], [0.8, 1, "io"]], t); return [1 + (Z_CAM - 1) * k, 100 + (FX - 100) * k, 100 + (FY - 100) * k]; };
const SAD_DUR = Math.round((T_REST + 0.35 + 0.6) * 100) / 100;

/** The strap from the bag's corners to its loop's top (`top`): each half a curve bowed out away from the bag by `bow` (rounded in the air,
 *  straight when taut); slack (`slack` true), each half bows out by as much as its length, 30, needs between its ends. */
function strap(at, rot, top, bow, sy = 1, slack = false) {
  const mid = rotP([0, 13], rot, at, sy);
  const half = (a) => {
    const c = [top[0] - a[0], top[1] - a[1]], d = Math.hypot(c[0], c[1]) || 1, m = lerp(a, top, 0.5);
    let nx = -c[1] / d, ny = c[0] / d;
    if (nx * (m[0] - mid[0]) + ny * (m[1] - mid[1]) < 0) { nx = -nx; ny = -ny; }
    const b = slack ? 2 * Math.sqrt((3 * d * Math.max(0, R_STRAP - d)) / 8) : bow;
    return [m[0] + nx * b, m[1] + ny * b];
  };
  const [l, r] = ANCHORS.map((p) => rotP(p, rot, at, sy)), cl = half(l), cr = half(r);
  return `<path d="M${n2(l[0])} ${n2(l[1])}Q${n2(cl[0])} ${n2(cl[1])} ${n2(top[0])} ${n2(top[1])}Q${n2(cr[0])} ${n2(cr[1])} ${n2(r[0])} ${n2(r[1])}" fill="none" stroke="${paint("ink")}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function sad(t) {
  if (t <= 0) return STILL;
  const [z, fx, fy] = camAt(t);
  let phi = 0, at, rot, sy = 1, top, bow, band = 0, slack = false;
  if (t < T_HOOK) {
    // in the air, turning a little as it flies
    at = flight(Math.max(0, t - T_THROW)); rot = -6 + 22 * Math.max(0, (t - T_THROW) / FLY);
    top = [at[0] + LOOP[0], at[1] + LOOP[1]]; bow = 6;
  } else {
    const s = t - T_HOOK, [p, psi] = simAt(Math.min(s, SIM.end));
    phi = (p * 180) / Math.PI;
    if (t >= T_REST) phi = SIM.rest - track([[T_REST, 0], [T_REST + 0.08, 2.2, "out"], [T_REST + 0.18, 0, "in"], [T_REST + 0.26, 0.5, "out"], [T_REST + 0.33, 0, "in"]], t);
    const tr = turnAt(phi);
    top = tr(HOOK[0], HOOK[1], HOOK_Z);
    band = track([[T_HOOK, 0], [T_HOOK + 0.06, 1, "out"]], t);
    if (t < T_LAND) {
      at = [top[0] + R_STRAP * Math.sin((psi * Math.PI) / 180), top[1] + R_STRAP * Math.cos((psi * Math.PI) / 180)];
      rot = -psi + (16 + PSI0) * Math.exp(-s / 0.06);
      bow = 6 * Math.exp(-s / 0.03);
    } else {
      // it lands on its foot, rocks upright, and skids 12 to the right
      const u = t - T_LAND;
      at = [SIM.land.at[0] + 12 * track([[0, 0], [0.2, 1, "out"]], u), BAG_FLOOR - 26];
      rot = -SIM.land.psi * Math.max(0, 1 - u / 0.1);
      // the chair's back comes down on it: it gives under the blow and stays a little pressed
      sy = 1 - track([[T_REST, 0], [T_REST + 0.06, 0.09, "out"], [T_REST + 0.2, 0.04, "io"]], t);
      at = [at[0], BAG_FLOOR - 26 * sy];
      slack = true; bow = 0;
    }
  }
  const tr = turnAt(phi), bandPts = BAND.map(([x, y, zz]) => tr(x + (114.6 - x) * (1 - band), y, zz + (HOOK_Z - zz) * (1 - band)));
  const loop = `<polygon points="${pts(bandPts)}" ${fill("ink")}/>`;
  const taut = t >= T_HOOK;
  const scene = `${BG}${chairShadow(phi)}${taut ? bagShadow(at, rot, sy) : ""}${bagAt(at, rot, sy)}${taut ? "" : strap(at, rot, top, bow, sy)}`
    + chairAt(phi, { 23: `${loop}${taut ? strap(at, rot, top, bow, sy, slack) : ""}` });
  return view(z, fx, fy, scene);
}

// ---- happy. The cushion, at rest on the seat: a pad 64 wide, as deep as the seat less a border, 6 thick; its top in the light, its front in
// the seat's own front shade, its right side between. Drawn from the middle of its bottom front edge; squashed by q (thinner and wider).
const SEAT_DEPTH = [17.7, -13.8], CUSH_AT = [57.15, 109.6], CW = 64, CT = 9, CD = 0.74;
function cushion(at, q = 0, rot = 0) {
  const w = (CW / 2) * (1 + 0.3 * q), th = CT * (1 - q), d = [SEAT_DEPTH[0] * CD, SEAT_DEPTH[1] * CD];
  const P = (x, y) => rotP([x, y], rot, at);
  const p = (x, y) => { const v = P(x, y); return `${n2(v[0])} ${n2(v[1])}`; };
  // it's stuffed: its edges bow out, most along the front; squashed, they bow out more
  const r = 4, bf = 2.2 * (1 + 0.8 * q), bs = 1.3 * (1 + 0.8 * q);
  const FLb = [-w, 0], FRb = [w, 0], FLt = [-w, -th], FRt = [w, -th], BRt = [w + d[0], -th + d[1]], BLt = [-w + d[0], -th + d[1]], BRb = [w + d[0], d[1]];
  // the top: rounded at its corners, its front edge bowed towards us, its sides and back out a little
  const topD = `M${p(FLt[0] + r, FLt[1] + 1)}Q${p(0, FLt[1] + 1 + bf)} ${p(FRt[0] - r, FRt[1] + 1)}Q${p(FRt[0] + 0.6, FRt[1] + 0.6)} ${p(FRt[0] + 2.2, FRt[1] - 1.6)}`
    + `Q${p((FRt[0] + BRt[0]) / 2 + bs, (FRt[1] + BRt[1]) / 2 + bs * 0.4)} ${p(BRt[0] - 1.6, BRt[1] + 1.4)}Q${p(BRt[0], BRt[1])} ${p(BRt[0] - r, BRt[1])}`
    + `Q${p((BRt[0] + BLt[0]) / 2, BLt[1] - bs)} ${p(BLt[0] + r, BLt[1])}Q${p(BLt[0], BLt[1])} ${p(BLt[0] - 1.6, BLt[1] + 1.4)}`
    + `Q${p((BLt[0] + FLt[0]) / 2 - bs, (BLt[1] + FLt[1]) / 2)} ${p(FLt[0] + 0.4, FLt[1] - 0.6)}Q${p(FLt[0], FLt[1] + 1)} ${p(FLt[0] + r, FLt[1] + 1)}Z`;
  // the front: from the top's front edge down to the seat, its ends rounded, its foot bowed a little too
  const frontD = `M${p(FLt[0] + r, FLt[1] + 1)}Q${p(0, FLt[1] + 1 + bf)} ${p(FRt[0] - r, FRt[1] + 1)}Q${p(FRt[0] + 0.6, FRt[1] + 1.4)} ${p(FRt[0] + 0.6, FRt[1] + r + 1)}`
    + `L${p(FRb[0] + 0.3, FRb[1] - r)}Q${p(FRb[0], FRb[1])} ${p(FRb[0] - r, FRb[1])}Q${p(0, FRb[1] + bf * 0.35)} ${p(FLb[0] + r, FLb[1])}`
    + `Q${p(FLb[0], FLb[1])} ${p(FLb[0] - 0.3, FLb[1] - r)}L${p(FLt[0] - 0.4, FLt[1] + r + 1)}Q${p(FLt[0] - 0.4, FLt[1] + 1.4)} ${p(FLt[0] + r, FLt[1] + 1)}Z`;
  // the right side, behind both: from the front's right end back to the top's back right corner and down to the seat
  const sideD = `M${p(FRt[0] - 1, FRt[1] + 1)}L${p(FRt[0] + 2.2, FRt[1] - 1.6)}Q${p((FRt[0] + BRt[0]) / 2 + bs, (FRt[1] + BRt[1]) / 2 + bs * 0.4)} ${p(BRt[0] - 1.6, BRt[1] + 1.4)}`
    + `L${p(BRb[0] - 1.2, BRb[1] - r)}Q${p(BRb[0] - 1.4, BRb[1])} ${p(BRb[0] - r - 1, BRb[1] + 0.6)}L${p(FRb[0] - 1, FRb[1])}Z`;
  const mid = P(d[0] / 2, -th + d[1] / 2 + 0.6);
  const tuft = `<ellipse cx="${n2(mid[0])}" cy="${n2(mid[1])}" rx="${n2(2.4 * (1 + 0.3 * q))}" ry="1.4" ${fill("violet")}/>`;
  return { svg: `<path d="${sideD}" ${fill("violet")}/><path d="${topD}" ${fill("violet-lit")}/><path d="${frontD}" ${fill("violet-deep")}/>${tuft}`, top: [FLt, FRt, BRt, BLt].map((v) => P(...v)), height: th };
}
// its shade on the seat: its top thrown along the light onto the seat (h above it), kept to the seat's top
const SEAT_CLIP = `<clipPath id="st"><path d="${dOf(EL[26])}"/></clipPath>`;
const cushionShade = (c, h) => `<g clip-path="url(#st)"><polygon points="${pts(c.top.map((v) => [v[0] + h * LIGHT[0], v[1] + h * (1 + LIGHT[1])]))}" ${fill("wood-deep")}/></g>`;
// (from low at the left, so its shade starts off the seat and comes on over it as it flies in)
const H_FROM = [-46, 92], H_THROW = 0.08, H_LAND = 0.5, H_SLIDE = 5;
const H_TOUCH = [CUSH_AT[0] - H_SLIDE, CUSH_AT[1]];
const H_VX = (H_TOUCH[0] - H_FROM[0]) / (H_LAND - H_THROW), H_VY = (H_TOUCH[1] - H_FROM[1] - 0.5 * G * (H_LAND - H_THROW) ** 2) / (H_LAND - H_THROW);
const HAPPY_DUR = Math.round((H_LAND + 0.45 + 0.6) * 100) / 100;
function happy(t) {
  if (t <= 0) return STILL;
  let at, q = 0, rot = 0, h = 0;
  if (t < H_LAND) {
    const s = Math.max(0, t - H_THROW);
    at = [H_FROM[0] + H_VX * s, H_FROM[1] + H_VY * s + 0.5 * G * s * s];
    rot = -14 * (1 - s / (H_LAND - H_THROW));
    h = CUSH_AT[1] - at[1];
  } else {
    const u = t - H_LAND;
    at = [H_TOUCH[0] + H_SLIDE * track([[0, 0], [0.22, 1, "out"]], u), CUSH_AT[1] - track([[0.1, 0], [0.18, 2.4, "out"], [0.27, 0, "in"]], u)];
    q = track([[0, 0], [0.06, 0.34, "out"], [0.15, -0.1, "io"], [0.27, 0.12, "in"], [0.36, -0.03, "io"], [0.45, 0, "io"]], u);
    h = CUSH_AT[1] - at[1];
  }
  const c = cushion(at, q, rot);
  return view(1, 100, 100, `${SEAT_CLIP}${BG}${EL[1]}${chairAt(0, { 26: cushionShade(c, c.height + h) + c.svg })}`);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
