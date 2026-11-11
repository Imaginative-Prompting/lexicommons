// Wall's two stories, a time-lapse of the ivy's: a seed lodged in the bed joint under the end coping stone has rooted there, and a shoot comes out.
// Happy: it climbs the stone's face, over its top and along the coping, putting out leaves: a neat green fringe over the last two stones. Sad: it stays
// in the joint and goes woody, its stem thickening under the end stone until it prises it up crooked; two chips of the bed mortar break off and drop
// to the wall's foot.
// Every frame is a pure function of t, in seconds. The still's own parts: the teal ground and wall behind, the wall's shadow, its right face (mortar
// and bricks), its front (mortar and brick courses, three darker bricks), the coping (the end stone's right face, the stones' tops and fronts, the
// joints between them, at x 48, 79, 110, 141). The coping's front runs y 57-68, its top 49-57; the top course of brick starts at y 69.2. A brick
// (21.5 cm) is 32 here: 148 to the meter.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"142\" width=\"200\" height=\"58\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><polygon points=\"165,155 180,146 195,151 183,160 168.5,156\" fill=\"var(--art-teal,#37B39B)\"/><polygon points=\"168,68 180.5,59.5 180.5,148.3 168,156.3\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M168.5 69.2L180.5 61.2V71L168.5 79zM168.5 80.2L180.5 72.2V82L168.5 90zM168.5 91.2L180.5 83.2V93L168.5 101zM168.5 102.2L180.5 94.2V104L168.5 112zM168.5 113.2L180.5 105.2V115L168.5 123zM168.5 124.2L180.5 116.2V126L168.5 134zM168.5 135.2L180.5 127.2V137L168.5 145zM168.5 146.2L180.5 138.2V148L168.5 156z\" fill=\"var(--art-clay-deep,#C25626)\"/><rect x=\"20\" y=\"67.5\" width=\"148.8\" height=\"88.5\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><path d=\"M20 69.2h31.8v9.8h-31.8zM53 69.2h31.8v9.8h-31.8zM86 69.2h31.8v9.8h-31.8zM119 69.2h31.8v9.8h-31.8zM152 69.2h16.5v9.8h-16.5zM20 80.2h15.3v9.8h-15.3zM36.5 80.2h31.8v9.8h-31.8zM69.5 80.2h31.8v9.8h-31.8zM102.5 80.2h31.8v9.8h-31.8zM135.5 80.2h33v9.8h-33zM20 91.2h31.8v9.8h-31.8zM53 91.2h31.8v9.8h-31.8zM86 91.2h31.8v9.8h-31.8zM119 91.2h31.8v9.8h-31.8zM152 91.2h16.5v9.8h-16.5zM20 102.2h15.3v9.8h-15.3zM36.5 102.2h31.8v9.8h-31.8zM69.5 102.2h31.8v9.8h-31.8zM102.5 102.2h31.8v9.8h-31.8zM135.5 102.2h33v9.8h-33zM20 113.2h31.8v9.8h-31.8zM53 113.2h31.8v9.8h-31.8zM86 113.2h31.8v9.8h-31.8zM119 113.2h31.8v9.8h-31.8zM152 113.2h16.5v9.8h-16.5zM20 124.2h15.3v9.8h-15.3zM36.5 124.2h31.8v9.8h-31.8zM69.5 124.2h31.8v9.8h-31.8zM102.5 124.2h31.8v9.8h-31.8zM135.5 124.2h33v9.8h-33zM20 135.2h31.8v9.8h-31.8zM53 135.2h31.8v9.8h-31.8zM86 135.2h31.8v9.8h-31.8zM119 135.2h31.8v9.8h-31.8zM152 135.2h16.5v9.8h-16.5zM20 146.2h15.3v9.8h-15.3zM36.5 146.2h31.8v9.8h-31.8zM69.5 146.2h31.8v9.8h-31.8zM102.5 146.2h31.8v9.8h-31.8zM135.5 146.2h33v9.8h-33z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M152 69.2h16.5v9.8h-16.5zM20 124.2h15.3v9.8h-15.3zM53 135.2h31.8v9.8h-31.8z\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"171,57 183.5,49 183.5,60 171,68.3\" fill=\"var(--art-steel-deep,#6B687A)\"/><polygon points=\"17,57.3 29,49 183.5,49 171.5,57.3\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><rect x=\"17\" y=\"57\" width=\"154.5\" height=\"11\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><polygon points=\"48,57 60,49 60.9,49 48.9,57\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><polygon points=\"79,57 91,49 91.9,49 79.9,57\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><polygon points=\"110,57 122,49 122.9,49 110.9,57\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><polygon points=\"141,57 153,49 153.9,49 141.9,57\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><rect x=\"48\" y=\"57\" width=\"0.9\" height=\"11\" fill=\"var(--art-steel-deep,#6B687A)\"/><rect x=\"79\" y=\"57\" width=\"0.9\" height=\"11\" fill=\"var(--art-steel-deep,#6B687A)\"/><rect x=\"110\" y=\"57\" width=\"0.9\" height=\"11\" fill=\"var(--art-steel-deep,#6B687A)\"/><rect x=\"141\" y=\"57\" width=\"0.9\" height=\"11\" fill=\"var(--art-steel-deep,#6B687A)\"/></svg>\n";
export const STILL_HASH = "14866b9a5c";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 19 || !EL[9].includes("17,57.3 29,49 183.5,49 171.5,57.3")) throw new Error("wall: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const WALL = EL.slice(0, 8).join(""), COPING = EL.slice(8).join("");

// ---- the ivy: a stem grown along a path from where it comes out of the joint, and its leaves, each opening once the stem has passed its node
// (a stem: its points; its width at the root; leaves: [how far along (0-1), angle (degrees, 0 = up), length])
function stem(P, k, w0, color) {
  if (k <= 0.002) return "";
  const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const end = L[L.length - 1] * k, pts = [P[0]];
  for (let i = 1; i < P.length; i++) { if (L[i] <= end) pts.push(P[i]); else { const f = (end - L[i - 1]) / (L[i] - L[i - 1]); pts.push([P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f]); break; } }
  // (it tapers from its root to its growing tip)
  const left = [], right = [];
  pts.forEach((p, i) => { const q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)], d = Math.hypot(q[0] - o[0], q[1] - o[1]) || 1, n = [-(q[1] - o[1]) / d, (q[0] - o[0]) / d], w = w0 * (1 - (0.7 * i) / Math.max(1, pts.length - 1)) / 2; left.push(`${n2(p[0] + n[0] * w)} ${n2(p[1] + n[1] * w)}`); right.unshift(`${n2(p[0] - n[0] * w)} ${n2(p[1] - n[1] * w)}`); });
  return `<path d="M${left.join("L")}L${right.join("L")}Z" ${fill(color)}/>`;
}
const along = (P, k) => { const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); const e = L[L.length - 1] * k; for (let i = 1; i < P.length; i++) if (L[i] >= e) { const f = (e - L[i - 1]) / (L[i] - L[i - 1]); return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f]; } return P[P.length - 1]; };
// an ivy leaf: three shallow lobes and a pointed tip, on a short stalk; s is how open it is. Its outline and its pale midrib, as path data (every
// leaf goes in one path, every midrib in another)
function leaf([x, y], ang, len, s) {
  if (s <= 0.01) return ["", ""];
  const k = len * s, r = (ang * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r), P = (u, v) => `${n2(x + (u * c - v * sn) * k)} ${n2(y + (u * sn + v * c) * k)}`;
  return [`M${P(0, 0)}L${P(0.05, -0.18)}C${P(0.42, -0.14)} ${P(0.6, -0.3)} ${P(0.5, -0.5)}L${P(0.3, -0.52)}C${P(0.32, -0.78)} ${P(0.14, -0.95)} ${P(0, -1.05)}C${P(-0.14, -0.95)} ${P(-0.32, -0.78)} ${P(-0.3, -0.52)}L${P(-0.5, -0.5)}C${P(-0.6, -0.3)} ${P(-0.42, -0.14)} ${P(-0.05, -0.18)}Z`,
    `M${P(-0.03, -0.2)}L${P(0, -0.9)}L${P(0.03, -0.2)}Z`];
}
const leaves = (L) => { const a = L.map((l) => l[0]).join(""), b = L.map((l) => l[1]).join(""); return a ? `<path d="${a}" ${fill("teal-deep")}/><path d="${b}" ${fill("teal-lit")}/>` : ""; };
// where it comes out: the bed joint under the end stone, near the corner
const ROOT = [163, 68.6];
// the happy's ivy: up the stone's face, over its top edge, along the top to the left; two sprays droop back down over the front
const MAIN = [ROOT, [162.4, 64], [161.2, 58.5], [158, 54.5], [152, 53.2], [145, 53.8], [138, 54.6], [131, 53.6], [124, 53], [117, 53.8], [112, 54.4]];
const SPRAYS = [[0.3, [[155, 56], [154.5, 60.5], [153, 66.5]]], [0.5, [[143.5, 55.8], [142.5, 60.5], [140.5, 67.5]]], [0.7, [[131, 55.4], [130.4, 60], [128.6, 65.5]]], [0.88, [[119.5, 55.2], [119, 58.5], [117.6, 62.5]]]];
const LEAVES = [[0.07, 55, 9.5], [0.14, -65, 11], [0.22, 15, 12.5], [0.29, -35, 12], [0.36, 40, 12.5], [0.43, -20, 13], [0.5, 25, 12.5], [0.57, -40, 12.5], [0.64, 20, 12.5], [0.71, -25, 12], [0.78, 35, 11.5], [0.85, -30, 11], [0.92, 15, 10], [1, -70, 9]];
const SPRAY_LEAVES = [[0.35, 120, 10], [0.7, 215, 10.5], [1, 175, 10]];
function ivy(k) {
  let out = stem(MAIN, k, 1.6, "bark");
  const L = [];
  for (const [at, P] of SPRAYS) { const s = Math.max(0, Math.min(1, (k - at) / 0.22)); out += stem([along(MAIN, at), ...P], s, 1.1, "bark"); for (const [a, ang, len] of SPRAY_LEAVES) L.push(leaf(along([along(MAIN, at), ...P], a), ang, len, Math.max(0, Math.min(1, (s - a + 0.05) / 0.3)))); }
  // (each leaf unfolds from its node after the tip has passed it)
  for (const [a, ang, len] of LEAVES) L.push(leaf(along(MAIN, a), ang, len, Math.max(0, Math.min(1, (k - a + 0.02) / 0.14))));
  return out + leaves(L);
}

// ---- happy: a green fringe
const HAPPY_DUR = 2.6;
function happy(t) {
  if (t <= 0) return STILL;
  const k = track([[0.2, 0], [2.0, 1, "io"]], t);
  return `${OPEN}${WALL}${COPING}${ivy(k)}</svg>`;
}

// ---- sad: it prises the stone up
const SAD_DUR = 2.6;
// the end stone: everything of the coping right of its joint (x 141.9), turned about its top left corner, where it bears on its neighbour
const END = "M141.9 72V57L153.9 49L186 45V72Z", REST = "M0 0H141.9V57L153.9 49L186 45V0H0ZM0 0V72H141.9V0Z";
const HINGE = [141.9, 57], LIFT = -17;
const stone = (a) => (Math.abs(a) < 0.001 ? COPING : `<clipPath id="rs"><path d="M0 40H141.9V57L153.9 49L153.9 40ZM0 40V72H141.9V40Z"/></clipPath><clipPath id="es"><path d="${END}"/></clipPath><g clip-path="url(#rs)">${COPING}</g><g transform="rotate(${n2(a)} ${HINGE[0]} ${HINGE[1]})"><g clip-path="url(#es)">${COPING}</g></g>`);
// the stone's underside corners, turned
const turn = (p, a) => { const r = (a * Math.PI) / 180, x = p[0] - HINGE[0], y = p[1] - HINGE[1]; return [HINGE[0] + x * Math.cos(r) - y * Math.sin(r), HINGE[1] + x * Math.sin(r) + y * Math.cos(r)]; };
// the two chips of bed mortar that break off the joint: where each sits in it, its size, when it goes, where it lands at the wall's foot
const CHIPS = [[[150, 68.6], 2.6, 1.62, 158.5], [[166, 68.6], 2.2, 1.7, 160.5]];
const G = 1450;
function chip([[x, y], r, t0, rest], t, i) {
  const s = Math.max(0, t - t0), land = Math.sqrt((2 * (rest - y)) / G);
  // (it breaks out of the joint: from nothing to its size in a few frames)
  r *= Math.min(1, s / 0.06);
  let cy = y + 0.5 * G * Math.min(s, land) * Math.min(s, land), cx = x + (i ? 6 : -4) * Math.min(s, land);
  // (a small hop where it lands, then it lies there)
  if (s > land) { const q = s - land; cy -= q < 0.14 ? 4 * Math.sin((Math.PI * q) / 0.14) : 0; cx += (i ? 2 : -1.5) * Math.min(1, q / 0.14); }
  return `<path d="M${n2(cx - r)} ${n2(cy - r * 0.5)}L${n2(cx + r * 0.3)} ${n2(cy - r * 0.8)}L${n2(cx + r)} ${n2(cy + r * 0.2)}L${n2(cx - r * 0.2)} ${n2(cy + r * 0.7)}Z" ${fill("paper-mid")}/>`;
}
function sad(t) {
  if (t <= 0) return STILL;
  // the same shoot comes out, but stays short: the growth goes into the stem in the joint, which thickens; slowly, then the bed gives, the stone tips up
  const k = track([[0.2, 0], [0.9, 1, "io"]], t), w = track([[0.6, 0], [1.6, 1, "io"]], t);
  const a = track([[0.9, 0], [1.55, LIFT * 0.35, "io"], [1.66, LIFT, "in"], [1.72, LIFT + 1.2, "out"], [1.8, LIFT, "in"]], t);
  const SHOOT = [ROOT, [163.5, 66], [165, 64.5]];
  let gap = "";
  if (a < -0.05) {
    // the opened joint: dark where the stone has come up off its bed, the woody stem wedged in it
    const bl = turn([141.9, 68], a), br = turn([171.5, 68], a), rr = turn([180.5, 59.5], a);
    const low = 1.2 * Math.min(1, -a / 3);
    gap = `<path d="M${n2(bl[0])} ${n2(bl[1])}L${n2(br[0])} ${n2(br[1])}L${n2(rr[0])} ${n2(rr[1])}L180.5 ${n2(59.5 + low)}L171.5 ${n2(68 + low)}L141.9 ${n2(68 + low)}Z" ${fill("bark-deep")}/>`
      // (and where the stone has swung off its neighbour, the neighbour's own end face, in shade)
      + `<path d="M141.9 57L153.9 49L${n2(turn([153.9, 49], a)[0])} ${n2(turn([153.9, 49], a)[1])}L${n2(bl[0])} ${n2(bl[1])}L141.9 69.2Z" ${fill("steel-deep")}/>`;
  }
  const thick = 1.4 + 5.6 * w, trunk = `<path d="M${n2(163 - thick / 2)} 69.2C${n2(163 - thick / 2)} ${n2(66 - 3 * w)} ${n2(161 - thick / 2)} ${n2(64 - 6 * w)} ${n2(160.5 - thick / 2)} ${n2(62 - 8 * w)}L${n2(160.5 + thick / 2)} ${n2(62 - 8 * w)}C${n2(162 + thick / 2)} ${n2(64 - 6 * w)} ${n2(163 + thick / 2)} ${n2(66 - 3 * w)} ${n2(163 + thick / 2)} 69.2Z" ${fill("wood-deep")}/>`;
  const shoot = stem(SHOOT, k, 1.4, "bark") + leaves([leaf(along(SHOOT, 0.55), 40, 8, Math.max(0, Math.min(1, (k - 0.5) / 0.3))), leaf(along(SHOOT, 1), -30, 7.5, Math.max(0, Math.min(1, (k - 0.85) / 0.15)))]);
  const chips = CHIPS.map((c, i) => (t > c[2] ? chip(c, t, i) : "")).join("");
  return `${OPEN}${WALL}${gap}${w > 0.01 ? `<g clip-path="url(#gp)"><clipPath id="gp"><path d="M141.9 69.2H184V40H141.9Z"/></clipPath>${trunk}</g>` : ""}${stone(a)}${shoot}${chips}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
