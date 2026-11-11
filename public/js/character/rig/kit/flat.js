// Generated from the character's rig (08-lexicommons/docs/design/character/rig/kit/flat.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// The outline's steps on flat buffers (lex-character, 7 Nov 2026): the same steps as geom.js's and liquid.js's (sweep,
// untangle, filletConcave, smoothOutline, spreadFoot, waveOutline, resample, arc lengths), each number computed by the same
// operations in the same order, so every outline comes out bit for bit the same (golden.mjs holds it, the app's sizes
// included). They write into buffers kept between frames instead of an array for every point at every step: a Tinta standing
// still allocated about 1 MB a frame, 30 frames a second, which an iPhone's JavaScriptCore kept around (lex-design-2's
// measure, +100 MB held).
//
// A flat polyline is { x, y, n }: Float64Arrays (longer than n), n points. Each step names its own buffers (pool(name)), so a
// step's result stays good until that step runs again: use it, or copy it, before the next frame's call.

import { hash } from "./liquid.js";

/**
 * Math.hypot of two numbers, by V8's own steps (the larger magnitude, a Kahan sum of the scaled squares, its square root times
 * it): the same number as Math.hypot in V8, bit for bit (4 million pairs, every sign, zero and magnitude:
 * scratch/character/v-churn/hypot-check.mjs), without the builtin's boxed arguments and array (it was a fifth of a frame's
 * garbage). Engines whose Math.hypot rounds otherwise (JavaScriptCore's libm) get V8's number, at most a last bit apart.
 */
export function hypot(x, y) {
  if (x !== x || y !== y) return Math.abs(x) === Infinity || Math.abs(y) === Infinity ? Infinity : NaN;
  const ax = Math.abs(x), ay = Math.abs(y);
  const max = ax > ay ? ax : ay;
  if (max === Infinity) return Infinity;
  if (max === 0) return 0;
  const n1 = ax / max, s1 = n1 * n1, p1 = 0 + s1;
  const comp = p1 - 0 - s1;
  const n2 = ay / max, s2 = n2 * n2 - comp, p2 = p1 + s2;
  return Math.sqrt(p2) * max;
}

const pools = new Map();
// Each step's buffers' names, made once (a name built every call is a string every frame).
const names = new Map();
const named = (name, part) => {
  let m = names.get(name);
  if (!m) names.set(name, (m = new Map()));
  let s = m.get(part);
  if (!s) m.set(part, (s = `${name}.${part}`));
  return s;
};
/** A named buffer of at least n points (its contents kept only while it's big enough). */
export function pool(name, n) {
  let b = pools.get(name);
  if (!b || b.x.length < n) {
    const cap = Math.max(n, b ? b.x.length * 2 : 256);
    b = { x: new Float64Array(cap), y: new Float64Array(cap), n: 0 };
    pools.set(name, b);
  }
  b.n = n;
  return b;
}
const scalars = new Map();
/** A named Float64Array of at least n numbers. */
export function scratch(name, n) {
  let a = scalars.get(name);
  if (!a || a.length < n) {
    a = new Float64Array(Math.max(n, a ? a.length * 2 : 256));
    scalars.set(name, a);
  }
  return a;
}

/** As arrays of [x, y] (for the steps that still take them: a morph, a resample to `points`, outline()'s callers). */
export function toArrays(f) {
  const out = new Array(f.n);
  for (let i = 0; i < f.n; i++) out[i] = [f.x[i], f.y[i]];
  return out;
}
/** Arrays of [x, y] into a named buffer. */
export function fromArrays(pts, name) {
  const f = pool(name, pts.length);
  for (let i = 0; i < pts.length; i++) {
    f.x[i] = pts[i][0];
    f.y[i] = pts[i][1];
  }
  return f;
}

/** arcLengths([...poly, poly[0]]): n + 1 numbers, the last the whole ring's length. */
function ringLengths(f, L) {
  const { x, y, n } = f;
  L[0] = 0;
  for (let i = 1; i < n; i++) L[i] = L[i - 1] + hypot(x[i] - x[i - 1], y[i] - y[i - 1]);
  L[n] = L[n - 1] + hypot(x[0] - x[n - 1], y[0] - y[n - 1]);
  return L;
}

/** resample(poly, m) (closed), with the ring's lengths L already worked out. */
function resampleRing(f, L, m, out) {
  const { x, y, n } = f;
  const total = L[n];
  let j = 0;
  for (let i = 0; i < m; i++) {
    const d = (total * i) / m;
    while (j < n - 1 && L[j + 1] < d) j++;
    const seg = L[j + 1] - L[j] || 1;
    const t = (d - L[j]) / seg;
    const k = j + 1 === n ? 0 : j + 1;
    out.x[i] = x[j] + (x[k] - x[j]) * t;
    out.y[i] = y[j] + (y[k] - y[j]) * t;
  }
  out.n = m;
  return out;
}

/** resample(poly, m) (closed), into its own buffer. */
export function resample(f, m, name = "resample") {
  const L = ringLengths(f, scratch(named(name, "L"), f.n + 1));
  return resampleRing(f, L, m, pool(name, m));
}

/** sweep(spine, radii, capSteps): the circles' envelope along the spine with round caps, counter-clockwise. */
export function sweep(spine, radii, capSteps, name = "sweep") {
  const { x: sx, y: sy, n } = spine;
  const L = scratch(named(name, "L"), n);
  L[0] = 0;
  for (let i = 1; i < n; i++) L[i] = L[i - 1] + hypot(sx[i] - sx[i - 1], sy[i] - sy[i - 1]);
  const left = pool(named(name, "left"), n), right = pool(named(name, "right"), n);
  for (let i = 0; i < n; i++) {
    const ia = Math.max(0, i - 1), ib = Math.min(n - 1, i + 1);
    const dx = sx[ib] - sx[ia], dy = sy[ib] - sy[ia];
    const l = hypot(dx, dy) || 1;
    const tx = dx / l, ty = dy / l;
    const nx = -ty, ny = tx;
    const ds = L[ib] - L[ia] || 1;
    let dr = (radii[ib] - radii[ia]) / ds;
    dr = Math.min(0.95, Math.max(-0.95, dr));
    const k = Math.sqrt(1 - dr * dr), r = radii[i];
    const along = -r * dr, out = r * k, inn = -r * k;
    left.x[i] = sx[i] + (tx * along + nx * out);
    left.y[i] = sy[i] + (ty * along + ny * out);
    right.x[i] = sx[i] + (tx * along + nx * inn);
    right.y[i] = sy[i] + (ty * along + ny * inn);
  }
  const caps = capSteps - 1;
  const res = pool(name, 2 * n + 2 * caps);
  let at = 0;
  for (let i = 0; i < n; i++, at++) {
    res.x[at] = right.x[i];
    res.y[at] = right.y[i];
  }
  // capArc(c, r, from, to, +1): round the long way, counter-clockwise.
  const cap = (cx, cy, r, fx, fy, tx2, ty2) => {
    const a0 = Math.atan2(fy - cy, fx - cx);
    let a1 = Math.atan2(ty2 - cy, tx2 - cx);
    while (a1 <= a0) a1 += 2 * Math.PI;
    for (let s = 1; s < capSteps; s++, at++) {
      const a = a0 + ((a1 - a0) * s) / capSteps;
      res.x[at] = cx + r * Math.cos(a);
      res.y[at] = cy + r * Math.sin(a);
    }
  };
  cap(sx[n - 1], sy[n - 1], radii[n - 1], right.x[n - 1], right.y[n - 1], left.x[n - 1], left.y[n - 1]);
  for (let i = n - 1; i >= 0; i--, at++) {
    res.x[at] = left.x[i];
    res.y[at] = left.y[i];
  }
  cap(sx[0], sy[0], radii[0], left.x[0], left.y[0], right.x[0], right.y[0]);
  res.n = at;
  return res;
}

/** untangle(pts): small local loops cut out at their crossing, into its own buffer. */
export function untangle(f, name = "untangle") {
  const out = pool(name, f.n);
  out.x.set(f.x.subarray(0, f.n));
  out.y.set(f.y.subarray(0, f.n));
  const X = out.x, Y = out.y;
  for (let guard = 0; guard < 50; guard++) {
    let cut = false;
    const n = out.n;
    outer: for (let i = 0; i < n - 1; i++) {
      const p1x = X[i], p1y = Y[i], p2x = X[i + 1], p2y = Y[i + 1];
      for (let j = i + 2; j < Math.min(n - 1, i + 60); j++) {
        const p3x = X[j], p3y = Y[j], p4x = X[j + 1], p4y = Y[j + 1];
        const d = (p2x - p1x) * (p4y - p3y) - (p2y - p1y) * (p4x - p3x);
        if (Math.abs(d) < 1e-9) continue;
        const ua = ((p4x - p3x) * (p1y - p3y) - (p4y - p3y) * (p1x - p3x)) / d;
        const ub = ((p2x - p1x) * (p1y - p3y) - (p2y - p1y) * (p1x - p3x)) / d;
        if (!(ua > 0 && ua < 1 && ub > 0 && ub < 1)) continue;
        // out.splice(i + 1, j - i, crossing)
        const cx = p1x + ua * (p2x - p1x), cy = p1y + ua * (p2y - p1y);
        X[i + 1] = cx;
        Y[i + 1] = cy;
        X.copyWithin(i + 2, j + 1, n);
        Y.copyWithin(i + 2, j + 1, n);
        out.n = n - (j - i) + 1;
        cut = true;
        break outer;
      }
    }
    if (!cut) break;
  }
  return out;
}

/** filletConcave(poly, opts): sharp inward corners relaxed (Laplacian), the rest untouched. */
export function filletConcave(f, { angle = 0.6, radius = 5, iters = 24, spacing = 0.6 } = {}, name = "fillet") {
  const L = ringLengths(f, scratch(named(name, "L"), f.n + 1));
  const m = Math.max(60, Math.round(L[f.n] / spacing));
  let pts = resampleRing(f, L, m, pool(named(name, "a"), m));
  let other = pool(named(name, "b"), m);
  const k = 3, X = pts.x, Y = pts.y;
  const w = scratch(named(name, "w"), m);
  w.fill(0, 0, m);
  const reach = Math.round(radius / spacing);
  let any = false;
  for (let i = 0; i < m; i++) {
    const a = (i - k + m) % m, c = (i + k) % m;
    const ux0 = X[i] - X[a], uy0 = Y[i] - Y[a], lu = hypot(ux0, uy0) || 1;
    const vx0 = X[c] - X[i], vy0 = Y[c] - Y[i], lv = hypot(vx0, vy0) || 1;
    const ux = ux0 / lu, uy = uy0 / lu, vx = vx0 / lv, vy = vy0 / lv;
    if (Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) < -angle) {
      for (let j = -reach; j <= reach; j++) {
        const at = (i + j + m) % m;
        w[at] = Math.max(w[at], 1 - Math.abs(j) / (reach + 1));
      }
    }
  }
  for (let i = 0; i < m; i++) if (w[i] > 0) { any = true; break; }
  if (!any) return pts;
  for (let it = 0; it < iters; it++) {
    const px = pts.x, py = pts.y, nx = other.x, ny = other.y;
    for (let i = 0; i < m; i++) {
      if (!w[i]) {
        nx[i] = px[i];
        ny[i] = py[i];
        continue;
      }
      const a = (i - 1 + m) % m, c = (i + 1) % m;
      const mx = (px[a] + px[c]) / 2, my = (py[a] + py[c]) / 2, t = 0.5 * w[i];
      nx[i] = px[i] + (mx - px[i]) * t;
      ny[i] = py[i] + (my - py[i]) * t;
    }
    other.n = m;
    const was = pts;
    pts = other;
    other = was;
  }
  return pts;
}

/** smoothOutline(poly, { sigma, spacing }): even spacing, each point its neighbours' Gaussian-weighted mean. */
export function smoothOutline(f, { sigma = 1.2, spacing = 0.5 } = {}, name = "smooth") {
  const L = ringLengths(f, scratch(named(name, "L"), f.n + 1));
  const total = L[f.n];
  const n = Math.max(24, Math.round(total / spacing));
  const pts = resampleRing(f, L, n, pool(named(name, "r"), n));
  const step = total / n;
  const reach = Math.max(1, Math.ceil((3 * sigma) / step));
  const w = scratch(named(name, "w"), 2 * reach + 1);
  for (let k = -reach; k <= reach; k++) w[k + reach] = Math.exp(-((k * step) ** 2) / (2 * sigma * sigma));
  let sum = 0;
  for (let k = 0; k < 2 * reach + 1; k++) sum = sum + w[k];
  const out = pool(name, n);
  const X = pts.x, Y = pts.y;
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0;
    for (let k = -reach; k <= reach; k++) {
      const q = (i + k + n) % n, wk = w[k + reach];
      x += X[q] * wk;
      y += Y[q] * wk;
    }
    out.x[i] = x / sum;
    out.y[i] = y / sum;
  }
  return out;
}

/** spreadFoot(poly, { spread, h, ground, cx }), in place: the base flared where it meets the ground. */
export function spreadFoot(f, { spread = 0.12, h = 10, ground = 0, cx = 0 } = {}) {
  if (spread <= 0.001) return f;
  for (let i = 0; i < f.n; i++) {
    const k = Math.min(1, Math.max(0, 1 - (f.y[i] - ground) / h));
    f.x[i] = cx + (f.x[i] - cx) * (1 + spread * k * k);
  }
  return f;
}

const MODES = [[3, 1, 5.5], [5, 0.55, -7.5], [2, 0.6, 3.1]];
/** waveOutline(poly, t, opts): ripples along it, flat where it meets the ground, into its own buffer (or f itself, unmoved). */
export function waveOutline(f, t, { amp = 1, modes = MODES, seed = 0, ground = 0, flat = 8 } = {}, name = "wave") {
  if (amp <= 0.001) return f;
  const n = f.n, X = f.x, Y = f.y;
  const L = ringLengths(f, scratch(named(name, "L"), n + 1));
  const total = L[n] || 1;
  const out = pool(name, n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    const dx = X[b] - X[a], dy = Y[b] - Y[a], l = hypot(dx, dy) || 1;
    const tx = dx / l, ty = dy / l;
    const ox = ty, oy = -tx;
    const u = L[i] / total;
    let d = 0;
    for (let j = 0; j < modes.length; j++) {
      const mode = modes[j], k = mode[0], w = mode[1], s = mode[2];
      d += w * Math.sin(2 * Math.PI * k * u + s * t + 6.283 * hash(j, seed));
    }
    const keep = Math.min(1, Math.max(0, (Y[i] - ground) / flat));
    const by = amp * d * keep * keep;
    out.x[i] = X[i] + ox * by;
    out.y[i] = Y[i] + oy * by;
  }
  return out;
}

/** The lowest y. */
export function minY(f) {
  let lo = Infinity;
  for (let i = 0; i < f.n; i++) if (f.y[i] < lo) lo = f.y[i];
  return lo;
}
