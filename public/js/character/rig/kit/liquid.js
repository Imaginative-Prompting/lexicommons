// Generated from the character's rig (08-lexicommons/docs/design/character/rig/kit/liquid.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// Liquid behavior for code-built characters: what makes ink move as a liquid and never as a solid toy. Pure functions of
// time, like the rest of the kit; y is up, the ground is y = 0.
//
// - impactEnergy: how much a body is still ringing after its impacts (drives the waves);
// - waveOutline: surface ripples along an outline, flat where it touches the ground;
// - spreadFoot: a wet foot, the base flaring out where liquid meets the ground;
// - drip: a droplet forming at a point, hanging, pinching off, falling under gravity and splatting;
// - splatMark / drawSplat: the ink a splat leaves on the ground, drying and fading.

import { add, arcLengths, clamp, f2, mul, norm, resample, smoothPath, sub, sweep } from "./geom.js";

export const hash = (i, seed) => { const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };

/** Ringing after impacts: Σ e·exp(−(t − t₀)/τ), each from its own moment on. impacts: [{ t, e }]. */
export function impactEnergy(t, impacts, tau = 0.45) {
  let e = 0;
  for (const im of impacts) if (t >= im.t) e += im.e * Math.exp(-(t - im.t) / (im.tau ?? tau));
  return e;
}

/**
 * Ripples along a closed outline (counter-clockwise, y up): each point moves along its outward normal by a sum of
 * travelling waves round the outline, weighted to nothing where it touches the ground (so it never lifts off).
 * amp in units; modes: [[count round the outline, relative amplitude, speed rad/s], …].
 */
export function waveOutline(poly, t, { amp = 1, modes = [[3, 1, 5.5], [5, 0.55, -7.5], [2, 0.6, 3.1]], seed = 0, ground = 0, flat = 8 } = {}) {
  if (amp <= 0.001) return poly;
  const n = poly.length;
  const L = arcLengths([...poly, poly[0]]);
  const total = L[L.length - 1] || 1;
  return poly.map((p, i) => {
    const a = poly[(i - 1 + n) % n], b = poly[(i + 1) % n];
    const tan = norm(sub(b, a));
    const out = [tan[1], -tan[0]];
    const u = L[i] / total;
    let d = 0;
    modes.forEach(([k, w, s], j) => { d += w * Math.sin(2 * Math.PI * k * u + s * t + 6.283 * hash(j, seed)); });
    const keep = clamp((p[1] - ground) / flat, 0, 1);
    return add(p, mul(out, amp * d * keep * keep));
  });
}

/** A wet foot: the base widens where it meets the ground (a meniscus), strongest at y = 0, gone by y = h. */
export function spreadFoot(poly, { spread = 0.12, h = 10, ground = 0, cx = 0 } = {}) {
  if (spread <= 0.001) return poly;
  return poly.map(([x, y]) => {
    const k = clamp(1 - (y - ground) / h, 0, 1);
    return [cx + (x - cx) * (1 + spread * k * k), y];
  });
}

/**
 * A drip at a point (where it hangs from: `at`, and which way is down along the body: gravity), over its life from t0:
 * grows as a bead (grow s), hangs and stretches (hang s), pinches off, falls under gravity to the floor and splats.
 * Returns null before t0; otherwise { phase, c (its center), r, neck (0..1, for the body's tip), stretch, landedAt }.
 */
export function drip(t, t0, at, { grow = 0.45, hang = 0.3, r = 3.6, g = 520, floor = 0, vx = 0 } = {}) {
  const u = t - t0;
  if (u < 0) return null;
  if (u < grow) {
    const k = u / grow;
    return { phase: "grow", c: [at[0], at[1] - r * k * 0.8], r: r * Math.sqrt(k), neck: 0, stretch: 1 + 0.15 * k };
  }
  if (u < grow + hang) {
    const k = (u - grow) / hang;
    return { phase: "hang", c: [at[0], at[1] - r * (0.8 + 1.1 * k * k)], r, neck: k, stretch: 1.15 + 0.5 * k * k };
  }
  const tf = u - grow - hang;
  const y0 = at[1] - r * 1.9;
  const y = y0 - 0.5 * g * tf * tf;
  const tland = Math.sqrt((2 * Math.max(0, y0 - floor - r * 0.4)) / g);
  if (tf < tland) {
    const v = g * tf;
    return { phase: "fall", c: [at[0] + vx * tf, y], r, neck: 1, stretch: 1 + Math.min(0.6, v * 0.0012) };
  }
  return { phase: "splat", c: [at[0] + vx * tland, floor], r, neck: 1, landedAt: t0 + grow + hang + tland };
}

/** Draws a drip's droplet (grow/hang/fall): a bead hanging from its point by a neck, or a falling teardrop. */
export function drawDrip(d, at, color) {
  if (!d || d.phase === "splat") return "";
  if (d.phase === "grow" || d.phase === "hang") {
    // A neck from the hanging point to the bead, thinning as it pinches.
    const neckR = Math.max(0.35, d.r * 0.55 * (1 - d.neck));
    const spine = resample([at, d.c], 24, false);
    const radii = spine.map((_, i) => neckR + (d.r - neckR) * (i / (spine.length - 1)) ** 2);
    return `<path d="${smoothPath(sweep(spine, radii))}" fill="${color}"/>`;
  }
  // Falling: a teardrop, its point up.
  const s = d.stretch, c = d.c, r = d.r;
  const pts = [];
  for (let i = 0; i < 32; i++) {
    const a = (2 * Math.PI * i) / 32;
    const up = Math.sin(a) > 0 ? 1 + (s - 1) * 2.2 * Math.sin(a) ** 3 : 1;
    pts.push([c[0] + r * Math.cos(a) * (1 - 0.25 * Math.max(0, Math.sin(a))), c[1] + r * Math.sin(a) * up]);
  }
  return `<path d="${smoothPath(pts)}" fill="${color}"/>`;
}

/**
 * The ink a splat leaves on the ground: a low, wide blob with a bumpy rim and a few satellite dots, seeded.
 * Returns { body: polygon (y from 0 up to ~h), dots: [{ c, r }] } in units round x = 0.
 */
export function splatMark(seed = 1, { r = 14, h = 3.4, lobes = null, dots = 5, n = 64 } = {}) {
  // Lobes in proportion to its size (a small splat with many lobes reads as a tuft of grass), and a rim that never
  // pinches to nothing, so it stays one mark of ink.
  lobes ??= Math.min(7, Math.max(2, Math.round(r / 2.5)));
  const body = [];
  const N = n;                      // points along its rim (fewer for a small one in the app)
  for (let i = 0; i <= N; i++) {
    const u = i / N, x = -r + 2 * r * u;
    const env = Math.sqrt(Math.max(0, 1 - (x / r) ** 2));
    let bump = 0;
    for (let k = 0; k < (lobes >= 5 ? 3 : 1); k++) bump += (0.5 + hash(k, seed)) * Math.sin(Math.PI * (lobes + k * 2) * u + 6.28 * hash(k + 9, seed));
    body.push([x * (1 + 0.06 * bump), h * env * Math.max(0.5, 1 + 0.22 * bump)]);
  }
  for (let i = N; i >= 0; i--) body.push([-r + (2 * r * i) / N, 0]);
  const out = [];
  for (let k = 0; k < dots; k++) {
    const side = hash(k + 20, seed) < 0.5 ? -1 : 1;
    out.push({ c: [side * r * (1.15 + 0.7 * hash(k + 30, seed)), 1.2 + 1.6 * hash(k + 40, seed)], r: 0.9 + 1.4 * hash(k + 50, seed) });
  }
  return { body, dots: out };
}

/**
 * Draws a splat mark at x (on the ground), grown in by `grow` (0..1, the impact spreading it) and fading as it dries
 * (`fade` 0..1). Wet ink is the body color (`color`); drying ink goes to the shade color (`dry`): both always given, from the palette.
 */
export function drawSplat(mark, x, { grow = 1, fade = 0, color, dry, scale = 1 } = {}) {
  if (fade >= 1 || grow <= 0) return "";
  const g = clamp(grow, 0, 1);
  const sx = scale * (0.35 + 0.65 * g), sy = scale * (0.6 + 0.4 * g);
  const body = mark.body.map(([px, py]) => [x + px * sx, py * sy]);
  const op = f2(1 - fade);
  let s = `<path d="${smoothPath(body)}" fill="${fade > 0.3 ? dry : color}" opacity="${op}"/>`;
  for (const d of mark.dots) {
    const k = clamp((g - 0.4) / 0.6, 0, 1);
    if (k <= 0) continue;
    s += `<ellipse cx="${f2(x + d.c[0] * sx)}" cy="${f2(-d.c[1] * sy * 0.6)}" rx="${f2(d.r * k * scale)}" ry="${f2(d.r * 0.7 * k * scale)}" fill="${fade > 0.3 ? dry : color}" opacity="${op}"/>`;
  }
  return s;
}

/**
 * Ink running down a surface: a bead travelling along `path` (a polyline, y up, from where it starts to where it ends)
 * from t0 over `dur` seconds (accelerating, as a drip does), leaving a thinning trail behind it. Returns SVG, or "";
 * with parts: true, { trail, gloss } (each SVG or ""). min: the thinnest the trail gets (0 lets it dry away entirely).
 */
export function runDown(t, t0, path, { dur = 0.9, r = 2.8, trail = 1.1, color, fade = 0.6, gloss = null, parts = false, min = 0.3 } = {}) {
  const none = parts ? { trail: "", gloss: "" } : "";
  const u = t - t0;
  if (u < 0 || path.length < 2) return none;
  const pts = resample(path, 60, false);
  const k = Math.min(1, (u / dur) ** 1.6);
  const n = Math.max(2, Math.round(k * (pts.length - 1)) + 1);
  const left = u > dur ? clamp(1 - (u - dur) / fade, 0, 1) : 1;
  if (left <= 0) return none;
  const seg = pts.slice(0, n);
  const radii = seg.map((_, i) => {
    const w = i / (seg.length - 1 || 1);
    return Math.max(min, trail * left * (0.6 + 0.4 * w)) + (u <= dur ? (r - trail) * Math.max(0, (w - 0.8) / 0.2) ** 2 : 0);
  });
  const trailSvg = `<path d="${smoothPath(sweep(seg, radii))}" fill="${color}"/>`;
  // A glint on the running bead: it reads as wet ink moving, not a bump in the outline.
  let glint = "";
  if (gloss && u <= dur) { const b = seg[seg.length - 1]; glint = `<circle cx="${f2(b[0] - r * 0.3)}" cy="${f2(-(b[1] + r * 0.35))}" r="${f2(r * 0.32)}" fill="${gloss}"/>`; }
  // parts: { trail, gloss } apart, so the trail can go under a body (only what bulges past its edge shows).
  return parts ? { trail: trailSvg, gloss: glint } : trailSvg + glint;
}
