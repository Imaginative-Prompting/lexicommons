// Tire's story, its sad alone (no happy that isn't a near-save ending as the still: the player keeps the still for it): the tire stands on its tread,
// balanced on its back edge, and it goes: it tips over backward, slowly, then faster, and comes down flat on the floor with a thud, rocking round on
// its rim like a coin a few times before it lies still. Its face, with the hole through it, ends up on top.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor, the tire's shadow, its tread (a band between its back
// face's circle, centered (86, 99), and its front face's, centered (114, 99), each 49 tall and 24 wide as we see them), the tread's six grooves, the
// front face, its hole and what shows through it. The tire (65 cm across) is 98 here: 150 to the meter.
// The tire is drawn in 3D, each circle as a unit circle carried by a matrix. The still is drawn at eye level, where a tire lying down would be edge on
// to us; the slight look down that shows it flat comes in with the fall (the first frame is the still's own ellipses exactly).
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect y=\"140\" width=\"200\" height=\"60\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M84,146 H116 C128,146.5 139,150 143,153.5 C145,156 141,158 134.5,157.2 C123,155.8 108,152 88,150.5 C84,150 82.5,146.5 84,146Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M86,50 H114 A24,49 0 0 1 114,148 H86 A24,49 0 0 1 86,50Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M99.5,56Q86.4,55.4 73.2,59.7L73.4,61.5Q86.4,57.2 99.5,57.8Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M92.2,68.5Q79.5,68.9 66.8,74.2L67,76.5Q79.5,71.2 92.2,70.8Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M87.9,85.9Q75.8,86.8 63.7,92.6L63.8,95.2Q75.8,89.4 87.9,88.5Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M87.2,105.3Q75.8,106.2 64.4,112L64.6,114.6Q75.8,108.8 87.2,107.9Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M90.3,123.7Q79.5,124.1 68.7,129.4L69,131.7Q79.5,126.4 90.3,126Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M96.6,138.2Q86.3,137.6 76,142L76.4,143.8Q86.3,139.4 96.6,140Z\" fill=\"var(--art-ink,#231F3B)\"/><ellipse cx=\"114\" cy=\"99\" rx=\"24\" ry=\"49\" fill=\"var(--art-ink-lit,#3A3460)\"/><ellipse cx=\"114\" cy=\"99\" rx=\"16\" ry=\"32\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M107,70.2 A16,32 0 0 0 107,127.8 A16,32 0 0 0 107,70.2Z\" fill=\"var(--art-sun,#F7BE45)\"/></svg>\n";
export const STILL_HASH = "66ad3cfb38";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 13 || !EL[10].includes('cx="114" cy="99" rx="24" ry="49"')) throw new Error("tire: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const WALLS = EL[0] + EL[1], GROOVES = EL.slice(4, 10).join("");
// ---- the tire in 3D: x right, y up, z toward us; seen as (x, 99 - y + kz z)
const R = 49, HOLE = 32, D = [-24 / 49, 0, Math.sqrt(1 - (24 / 49) ** 2)], N0 = [D[2], 0, -D[0]], HALF = 14 / N0[0];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const UP = [0, 1, 0];
const proj = (p, kz) => [p[0], 99 - p[1] + kz * p[2]];
const projV = (v, kz) => [v[0], -v[1] + kz * v[2]];
// a circle (center c, its plane's two directions a and b, radius r) as a matrix on the unit circle
const circleM = (c, a, b, r, kz) => { const A = projV(a, kz), B = projV(b, kz), C = proj(c, kz); return [A[0] * r, A[1] * r, B[0] * r, B[1] * r, C[0], C[1]]; };
const M = (m) => `matrix(${m.map(n4).join(" ")})`;
const unit = (m, f, extra = "") => `<ellipse rx="1" ry="1" transform="${M(m)}" ${f}${extra}/>`;
// the farthest point of such an ellipse in a screen direction (for the tread's outline between its two faces)
const support = (m, dir) => { const u = [m[0] * dir[0] + m[1] * dir[1], m[2] * dir[0] + m[3] * dir[1]], l = Math.hypot(u[0], u[1]) || 1; return [m[4] + (m[0] * u[0] + m[2] * u[1]) / l, m[5] + (m[1] * u[0] + m[3] * u[1]) / l]; };
// The fall: it turns about its back edge on the floor (along D), its face turning up. Turned f radians, a vector v becomes:
const turn = (v, f) => { const u = v[1], n = v[0] * N0[0] + v[2] * N0[2], d = v[0] * D[0] + v[2] * D[2]; return add(add(scale(D, d), scale(UP, u * Math.cos(f) + n * Math.sin(f))), scale(N0, n * Math.cos(f) - u * Math.sin(f))); };
const PIVOT = add(add([100, 0, 0], UP, -R), N0, -HALF);
// how far it has gone over: from a hair past its balance, faster and faster (gravity at its scale: 1470; a ring tipping on its edge), to flat
const K = (3 * 1470) / (2 * R), T_TIP = 0.25;
// (from its still: a slight lean back, the first stir, then gravity takes it)
const OVER = (() => { const S = [0]; let a = 0, w = 0.35; while (a < Math.PI / 2) { w += (K * Math.sin(a)) / 2000; a += w / 2000; S.push(Math.min(a, Math.PI / 2)); } return S; })();
const T_FLAT = T_TIP + (OVER.length - 1) / 2000;
const fallAt = (t) => (t <= T_TIP ? 0 : OVER[Math.min(OVER.length - 1, Math.round((t - T_TIP) * 2000))]);
// the still's own back face and front face, as matrices (for the grooves, carried with the back face)
const BACK0 = circleM(add([100, 0, 0], N0, -HALF), D, UP, R, 0);
const inv = (m) => { const det = m[0] * m[3] - m[1] * m[2]; return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det]; };
const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3]];

function tire(f, wob, spin) {
  // the look down comes in with the fall
  const kz = 0.26 * Math.sin(f);
  // its center and its face's direction, turned f about the back edge; then rocking: its face tipped wob from flat, the tip going round (spin)
  let centre = add(PIVOT, turn(add(scale(UP, R), N0, HALF), f)), n = turn(N0, f);
  if (wob > 1e-4) {
    // (rocking flat on its rim: its face tipped wob from up, the way it leans going round; its center riding up a little on the rim)
    n = add(scale(UP, Math.cos(wob)), add(scale(D, Math.cos(spin)), N0, Math.sin(spin)), Math.sin(wob));
    centre = add(centre, UP, R * Math.sin(wob) * 0.5);
  }
  // its face's plane: the rolling direction laid into it, and the one across (a x n): a true circle, turned the same way the fall turns it
  const dn = D[0] * n[0] + D[1] * n[1] + D[2] * n[2], a0 = add(D, n, -dn), al = Math.hypot(...a0), a = scale(a0, 1 / al);
  const b = [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]];
  const front = circleM(add(centre, n, HALF), a, b, R, kz), back = circleM(add(centre, n, -HALF), a, b, R, kz);
  const middleHole = circleM(centre, a, b, HOLE, kz), frontHole = circleM(add(centre, n, HALF), a, b, HOLE, kz);
  // the tread: the two faces' circles and the band between them, its edges where each circle is farthest across the axis
  const axis = [front[4] - back[4], front[5] - back[5]], across = [-axis[1], axis[0]];
  const p1 = support(front, across), p2 = support(back, across), p3 = support(back, [-across[0], -across[1]]), p4 = support(front, [-across[0], -across[1]]);
  const band = `<path d="M${[p1, p2, p3, p4].map((p) => `${n2(p[0])} ${n2(p[1])}`).join("L")}Z" ${fill("steel-deep")}/>`;
  // the grooves ride the tread with its back face
  const T = mul(back, inv(BACK0)), tx = back[4] - (T[0] * BACK0[4] + T[2] * BACK0[5]), ty = back[5] - (T[1] * BACK0[4] + T[3] * BACK0[5]);
  const grooves = `<g transform="matrix(${[T[0], T[1], T[2], T[3], tx, ty].map(n4).join(" ")})">${GROOVES}</g>`;
  // the face, its hole, and through it what's behind (the wall and floor), seen where the hole's two ends overlap
  // (standing, the wall and floor behind it; lying, the floor under it, coming in as it goes over)
  const under = f > 0.6 ? `<path d="M0 0H200V200H0Z" ${fill("sun-lit")} opacity="${n4(Math.min(1, (f - 0.6) / 0.5))}"/>` : "";
  const through = `<clipPath id="tf">${unit(frontHole, "")}</clipPath><clipPath id="tm">${unit(middleHole, "")}</clipPath><g clip-path="url(#tf)"><g clip-path="url(#tm)">${WALLS}${under}</g></g>`;
  return unit(back, fill("steel-deep")) + band + grooves + unit(front, fill("ink-lit")) + unit(frontHole, fill("ink")) + through;
}

// ---- sad: down it goes
const SAD_DUR = 2.8;
function sad(t) {
  if (t <= T_TIP) return STILL;
  const f = fallAt(t);
  // landed: it rocks round on its rim, each turn quicker and lower, and lies still
  const s = t - T_FLAT, wob = s > 0 ? 0.11 * Math.exp(-s * 3.2) * (s < 1.3 ? 1 : Math.max(0, 1 - (s - 1.3) / 0.2)) : 0;
  const spin = s > 0 ? 2 * Math.PI * (1.6 * s + 1.4 * s * s) : 0;
  // its shadow: the standing one thins away as it goes over; lying, its own dark rim under it
  const k = f / (Math.PI / 2);
  const shadow = k < 0.999 ? `<g opacity="${n4(1 - k)}">${EL[2]}</g>` : "";
  return `${OPEN}${WALLS}${shadow}${tire(f, wob, spin)}</svg>`;
}

export const REACTIONS = { sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
