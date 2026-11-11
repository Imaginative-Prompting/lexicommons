// Generated from the character's rig (08-lexicommons/docs/design/character/rig/splat/throw.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// The thrown drop: the liquid ink drop (lex-character's variation A) throws or splats a drop of itself onto things in
// the app to make something happen, so what the app does reads as the character's doing. lex-mascots.
//
// Its drop flies on a gravity arc (flight), splats where it lands (a seeded splat in the field), and the splat flows
// into what it does there (splatInto): a dot that marks, a check, a filled square, an underline, a bar's share, a seal.
// The ink is one signed-distance field (field.js), contoured each frame, so every step stays liquid.
//
// Coordinates: y up (world units or CSS px with y negated; any scale), pure functions of time. The drop itself (its
// throw, from tipEnd / throwLaunch) is lex-character's rig; this module starts where the drop leaves it.

import { contour, sdCircle, sdStroke, sdTaper, smin, thin } from "./field.js";
import { f2, smoothPath } from "../kit/geom.js";

const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const outBack = (t, k = 1.7) => { t = clamp(t) - 1; return 1 + (k + 1) * t * t * t + k * t * t; };
const hash = (i, s = 0) => { const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return v - Math.floor(v); };

/**
 * A drop's flight from `from` to `to` on a gravity arc whose top is `h` above the higher end. g in the same units per
 * second squared. Returns { phase: "before" | "fly" | "splat", c, v, r, stretch, angle, releaseT, impactT, since }.
 */
export function flight(t, { t0, from, to, h = 30, r = 4, g = 900 }) {
  const top = Math.max(from[1], to[1]) + h;
  const vy = Math.sqrt(2 * g * Math.max(0.01, top - from[1]));
  const tUp = vy / g, tDown = Math.sqrt((2 * Math.max(0.01, top - to[1])) / g);
  const T = tUp + tDown, vx = (to[0] - from[0]) / T;
  const base = { releaseT: t0, impactT: t0 + T, T, r };
  if (t < t0) return { ...base, phase: "before" };
  if (t >= t0 + T) return { ...base, phase: "splat", since: t - t0 - T, c: to, v: [vx, vy - g * T] };
  const u = t - t0, v = [vx, vy - g * u], sp = Math.hypot(v[0], v[1]);
  return { ...base, phase: "fly", c: [from[0] + vx * u, from[1] + vy * u - 0.5 * g * u * u], v, stretch: Math.min(0.7, sp / (g * 0.9)), angle: Math.atan2(v[1], v[0]) };
}

/** The flying drop: a bead stretched along its speed, with a glint. `M` maps y-up points to SVG coordinates. */
export function drawFlying(f, pal, M = (q) => [q[0], -q[1]]) {
  if (f.phase !== "fly") return "";
  const c = M(f.c), rx = f.r * (1 + f.stretch), ry = f.r / (1 + f.stretch * 0.6);
  const deg = (-f.angle * 180) / Math.PI;
  return `<g transform="translate(${f2(c[0])},${f2(c[1])}) rotate(${f2(deg)})"><ellipse rx="${f2(rx)}" ry="${f2(ry)}" fill="${pal.body}"/><circle cx="${f2(-rx * 0.2)}" cy="${f2(-ry * 0.42)}" r="${f2(f.r * 0.28)}" fill="${pal.light}"/></g>`;
}

// ---- shapes the ink can become (distance functions, y up) ------------------------------------------------------------

export const shapes = {
  dot: (c, r) => (q) => sdCircle(q, c, r),
  /** A rounded rectangle given by its corners. */
  rect: (x0, y0, x1, y1, rr = 3) => (q) => {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hx = Math.abs(x1 - x0) / 2 - rr, hy = Math.abs(y1 - y0) / 2 - rr;
    const dx = Math.abs(q[0] - cx) - Math.max(0, hx), dy = Math.abs(q[1] - cy) - Math.max(0, hy);
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - rr;
  },
  line: (a, b, w) => (q) => sdTaper(q, a, b, w / 2, w / 2),
  /** A check mark of size s centered at c, stroke w. */
  check: (c, s, w) => (q) => sdStroke(q, [[c[0] - s * 0.45, c[1] + s * 0.02], [c[0] - s * 0.12, c[1] - s * 0.32], [c[0] + s * 0.5, c[1] + s * 0.38]], w / 2),
  /** A 7 of height s centered at c. */
  seven: (c, s, w) => (q) => sdStroke(q, [[c[0] - s * 0.32, c[1] + s * 0.5], [c[0] + s * 0.32, c[1] + s * 0.5], [c[0] - s * 0.06, c[1] - s * 0.5]], w / 2),
  /** A seal: a scalloped round stamp. */
  seal: (c, r) => (q) => { const a = Math.atan2(q[1] - c[1], q[0] - c[0]); return sdCircle(q, c, r * (1 + 0.08 * Math.cos(10 * a))); },
  union: (...fs) => (q) => fs.reduce((d, f) => Math.min(d, f(q)), Infinity),
  /** A closed outline, given by its points. */
  poly: (points) => (q) => {
    let d = Infinity, inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [ax, ay] = points[j], [bx, by] = points[i];
      const ex = bx - ax, ey = by - ay, wx = q[0] - ax, wy = q[1] - ay;
      const u = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
      d = Math.min(d, Math.hypot(wx - ex * u, wy - ey * u));
      if (ay > q[1] !== by > q[1] && q[0] < ax + ((q[1] - ay) / ey) * ex) inside = !inside;
    }
    return inside ? -d : d;
  },
};

/**
 * The splat a drop makes where it lands: a core, lobes and a few thrown dots, seeded; `grow` 0..1 (overshoots past 1
 * on impact). `R` is the splat's radius; `dir` the way it was flying (its dots throw on forward).
 */
export function splatField(at, R, seed = 1, grow = 1, dir = [0, -1]) {
  const g = Math.max(0, grow);
  const lobes = [];
  for (let i = 0; i < 6; i++) {
    const a = (2 * Math.PI * i) / 6 + hash(i, seed) * 0.8;
    lobes.push({ c: [at[0] + Math.cos(a) * R * 0.62 * g, at[1] + Math.sin(a) * R * 0.5 * g], r: R * (0.3 + 0.2 * hash(i, seed + 3)) * g });
  }
  const fwd = Math.atan2(dir[1], dir[0]) + Math.PI; // dots fly on past the impact
  const dots = [];
  for (let i = 0; i < 3; i++) {
    const a = fwd + Math.PI + (hash(i, seed + 7) - 0.5) * 2.2;
    const d = R * (1.35 + 0.5 * hash(i, seed + 9)) * g;
    dots.push({ c: [at[0] + Math.cos(a) * d, at[1] + Math.sin(a) * d * 0.7], r: R * (0.12 + 0.08 * hash(i, seed + 11)) * Math.min(1, g) });
  }
  return (q) => {
    let d = sdCircle(q, at, R * 0.72 * g);
    for (const L of lobes) d = smin(d, sdCircle(q, L.c, L.r), R * 0.35);
    for (const D of dots) if (D.r > 0.05) d = smin(d, sdCircle(q, D.c, D.r), R * 0.2);
    return d;
  };
}

/**
 * The splat at `at` (landing at impactT) flowing into `target` (a distance function): it bursts out (with overshoot)
 * over ~0.12 s, holds a beat, then the field blends from the splat to the target over `settle` seconds.
 * Returns { field, u } (u: how far it has become the target) or null before the impact.
 */
export function splatInto(t, impactT, { at, R, seed = 1, target, delay = 0.1, settle = 0.4, dir = [0, -1], base = null }) {
  if (t < impactT) return null;
  const s = t - impactT;
  const grow = outBack(clamp(s / 0.12), 2.2);
  const u = smooth(clamp((s - delay) / settle));
  const sp = splatField(at, R, seed, grow, dir);
  const withBase = base ? (q) => Math.min(base(q), sp(q)) : sp;
  if (!target) return { u: 0, field: withBase }; // a splat that stays a splat (the caller blends it on)
  return { u, field: u <= 0 ? withBase : u >= 1 ? target : (q) => lerp(withBase(q), target(q), u) };
}

/**
 * Draws ink fields (each { field, box: [x0, y0, x1, y1] } in y-up units) as flat violet: one shade crescent, a gloss.
 * `M` maps y-up to SVG; `res` is the contour's cell size; `k` the shade's offset (units).
 */
let ids = 0;
export function drawInk(items, pal, { M = (q) => [q[0], -q[1]], res = 0.6, shade = 1, k = 1, gloss = true } = {}) {
  let d = "";
  for (const it of items) {
    if (!it) continue;
    const [x0, y0, x1, y1] = it.box;
    for (const loop of contour(it.field, x0, y0, x1, y1, res)) d += smoothPath(thin(loop, res * 0.55).map((q) => { const p = M(q); return [p[0], -p[1]]; }));
  }
  if (!d) return "";
  if (shade <= 0) return `<path d="${d}" fill="${pal.body}" fill-rule="evenodd"/>`;
  const id = `ink${ids++}`;
  let s = `<clipPath id="${id}"><path d="${d}" clip-rule="evenodd"/></clipPath><path d="${d}" fill="${pal.shade}" fill-rule="evenodd"/>`;
  s += `<g clip-path="url(#${id})"><path transform="translate(${f2(0.9 * k)},${f2(-0.8 * k)})" d="${d}" fill="${pal.body}" fill-rule="evenodd"/>`;
  if (gloss) s += `<path transform="translate(${f2(-0.7 * k)},${f2(-0.9 * k)})" d="${d}" fill="none" stroke="${pal.light}" stroke-width="${f2(0.6 * k)}" opacity="0.5"/>`;
  return s + `</g>`;
}

/** A box round a point (for drawInk), padded. */
export const boxAround = (c, r) => [c[0] - r, c[1] - r, c[0] + r, c[1] + r];
/** A box round a rectangle and a splat point, padded. */
export const boxUnion = (...bs) => [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
