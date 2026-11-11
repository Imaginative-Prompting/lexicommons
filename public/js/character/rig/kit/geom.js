// Generated from the character's rig (08-lexicommons/docs/design/character/rig/kit/geom.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// Geometry for code-built 2D characters: pure functions, no DOM, so the same code draws in the browser and renders
// frames in Node.
//
// Coordinates: y up while building (ground at y = 0); toSvg() flips y at the very end.
// A shape's outline is a closed polygon (an array of [x, y]); smoothPath() turns it into cubic Béziers.

export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const mul = (a, k) => [a[0] * k, a[1] * k];
export const len = (a) => Math.hypot(a[0], a[1]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const rot = (p, ang, c = [0, 0]) => {
  const s = Math.sin(ang), k = Math.cos(ang), x = p[0] - c[0], y = p[1] - c[1];
  return [c[0] + x * k - y * s, c[1] + x * s + y * k];
};

/** A cubic Bézier at t. */
export function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

/** Arc length along a polyline, cumulative. */
export function arcLengths(pts, closed = false) {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + len(sub(pts[i], pts[i - 1])));
  if (closed) out.push(out[out.length - 1] + len(sub(pts[0], pts[pts.length - 1])));
  return out;
}

/** Resamples a polyline (or closed polygon) to n points evenly spaced by arc length. */
export function resample(pts, n, closed = true) {
  const ring = closed ? [...pts, pts[0]] : pts;
  const L = arcLengths(ring);
  const total = L[L.length - 1];
  const out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = closed ? (total * i) / n : (total * i) / (n - 1);
    while (j < L.length - 2 && L[j + 1] < d) j++;
    const seg = L[j + 1] - L[j] || 1;
    out.push(lerp2(ring[j], ring[j + 1], (d - L[j]) / seg));
  }
  return out;
}

/** Signed area (positive = counter-clockwise in y-up space). */
export function area(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export const centroid = (pts) => mul(pts.reduce((s, p) => add(s, p), [0, 0]), 1 / pts.length);

/**
 * Makes two closed outlines correspond point for point, for morphing: same count, same winding, and the start of `b`
 * rotated to whichever offset makes the pairs closest. Returns [a', b'].
 */
export function correspond(a, b, n = 160) {
  let A = resample(a, n), B = resample(b, n);
  if (Math.sign(area(A)) !== Math.sign(area(B))) B = B.reverse();
  const ca = centroid(A), cb = centroid(B);
  let best = 0, bestCost = Infinity;
  for (let k = 0; k < n; k += 2) {
    let c = 0;
    for (let i = 0; i < n; i += 4) {
      const p = sub(A[i], ca), q = sub(B[(i + k) % n], cb);
      c += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
    }
    if (c < bestCost) { bestCost = c; best = k; }
  }
  B = B.map((_, i) => B[(i + best) % n]);
  return [A, B];
}

/** Point-for-point blend of two corresponded outlines. */
export const blend = (A, B, t) => A.map((p, i) => lerp2(p, B[i], t));

/**
 * The outline swept by a circle of radius r(s) moving along a spine: the envelope of the circles, with round caps.
 * `spine` and `radii` are arrays of the same length (dense samples). Returns a closed polygon, counter-clockwise.
 * Keeps |dr/ds| < 0.95, where the envelope exists.
 */
export function sweep(spine, radii, capSteps = 28) {
  const n = spine.length;
  const L = arcLengths(spine);
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(n - 1, i + 1)];
    const t = norm(sub(b, a));
    const nrm = [-t[1], t[0]];
    const ds = L[Math.min(n - 1, i + 1)] - L[Math.max(0, i - 1)] || 1;
    let dr = (radii[Math.min(n - 1, i + 1)] - radii[Math.max(0, i - 1)]) / ds;
    dr = clamp(dr, -0.95, 0.95);
    const k = Math.sqrt(1 - dr * dr), r = radii[i];
    left.push(add(spine[i], add(mul(t, -r * dr), mul(nrm, r * k))));
    right.push(add(spine[i], add(mul(t, -r * dr), mul(nrm, -r * k))));
  }
  const capArc = (c, r, from, to, dir) => {
    // from/to are points on the circle; go round the long way in direction dir (+1 ccw, -1 cw).
    let a0 = Math.atan2(from[1] - c[1], from[0] - c[0]);
    let a1 = Math.atan2(to[1] - c[1], to[0] - c[0]);
    if (dir > 0) { while (a1 <= a0) a1 += 2 * Math.PI; } else { while (a1 >= a0) a1 -= 2 * Math.PI; }
    const out = [];
    for (let s = 1; s < capSteps; s++) {
      const a = a0 + ((a1 - a0) * s) / capSteps;
      out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
    }
    return out;
  };
  // Counter-clockwise: down the right side from the start, round the end cap, back up the left side, round the start.
  const endCap = capArc(spine[n - 1], radii[n - 1], right[n - 1], left[n - 1], +1);
  const startCap = capArc(spine[0], radii[0], left[0], right[0], +1);
  return [...right, ...endCap, ...left.slice().reverse(), ...startCap];
}

/** Removes the loops a sweep makes where the spine curls tighter than the tube is thick (keeps the outer boundary). */
export function untangle(pts) {
  const out = pts.slice();
  const segX = (p1, p2, p3, p4) => {
    const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
    if (Math.abs(d) < 1e-9) return null;
    const ua = ((p4[0] - p3[0]) * (p1[1] - p3[1]) - (p4[1] - p3[1]) * (p1[0] - p3[0])) / d;
    const ub = ((p2[0] - p1[0]) * (p1[1] - p3[1]) - (p2[1] - p1[1]) * (p1[0] - p3[0])) / d;
    return ua > 0 && ua < 1 && ub > 0 && ub < 1 ? [p1[0] + ua * (p2[0] - p1[0]), p1[1] + ua * (p2[1] - p1[1])] : null;
  };
  // Small local loops only (within a window), cut out at their crossing.
  for (let guard = 0; guard < 50; guard++) {
    let cut = false;
    const n = out.length;
    outer: for (let i = 0; i < n - 1; i++) {
      for (let j = i + 2; j < Math.min(n - 1, i + 60); j++) {
        const x = segX(out[i], out[i + 1], out[j], out[j + 1]);
        if (x) { out.splice(i + 1, j - i, x); cut = true; break outer; }
      }
    }
    if (!cut) break;
  }
  return out;
}

/** A number to 2 decimals, as the shortest string: the same strings as (Math.round(v * 100) / 100).toString() (checked
 * on 3.4 million values and the edge cases, 2 Nov 2026), by integer math, ~3× faster (it was half of a frame's time). */
const f2 = (v) => {
  const r = Math.round(v * 100);
  if (r === 0) return "0";
  const neg = r < 0, a = neg ? -r : r;
  const i = Math.floor(a / 100), f = a - i * 100;
  let s = (neg ? "-" : "") + i;
  if (f) s += f % 10 ? "." + (f < 10 ? "0" + f : f) : "." + f / 10;
  return s;
};

// ---- a path's text, written into one reused buffer --------------------------------------------------------------------
// Every path a frame draws was a few hundred small strings (each number, each segment's piece, the joins): most of a frame's
// garbage, 30 frames a second for every Tinta on the page. Its text now goes into one buffer, each number digit by digit
// (exactly f2's text), and becomes one string at its end. begin() / end(from) nest: a path written inside another's keeps
// the outer one's text.
const TEXT = { b: new Uint8Array(1 << 16), n: 0 };
const ascii = new TextDecoder();
const room = (k) => {
  if (TEXT.n + k <= TEXT.b.length) return;
  const b = new Uint8Array(Math.max(TEXT.b.length * 2, TEXT.n + k));
  b.set(TEXT.b.subarray(0, TEXT.n));
  TEXT.b = b;
};
/** Starts a piece of text in the buffer; end(from) gives it back as a string and lets its room go. */
export const begin = () => TEXT.n;
export const end = (from) => {
  const out = ascii.decode(TEXT.b.subarray(from, TEXT.n));
  TEXT.n = from;
  return out;
};
/** One character (its code, ASCII). */
export const ch = (c) => {
  room(1);
  TEXT.b[TEXT.n++] = c;
};
/** The number numv() writes: a slot, so a hot loop hands it over without boxing it (a double passed to a function that isn't
 * inlined is boxed: a path's thousand numbers were most of what its writing allocated). */
export const V = new Float64Array(1);
/** A number as f2 writes it (2 decimals, the shortest string), digit by digit. */
export function num(v) {
  V[0] = v;
  numv();
}
/** num(V[0]): the number in the slot (no argument to box). */
export function numv() {
  const v = V[0];
  const r = Math.round(v * 100);
  if (r === 0) return ch(48);
  if (!Number.isFinite(r) || Math.abs(r) >= 1e15) {
    // Never in a drawing; written as f2 writes it all the same.
    const s = f2(v);
    room(s.length);
    for (let i = 0; i < s.length; i++) TEXT.b[TEXT.n++] = s.charCodeAt(i);
    return;
  }
  room(20);
  const b = TEXT.b;
  const neg = r < 0, a = neg ? -r : r;
  let i = Math.floor(a / 100);
  const f = a - i * 100;
  if (neg) b[TEXT.n++] = 45;
  if (i === 0) b[TEXT.n++] = 48;
  else {
    // Its digits counted first, then written from the last (no view of the buffer made to reverse them).
    let digits = 1;
    for (let p = 10; i >= p; p *= 10) digits++;
    let at = TEXT.n + digits;
    TEXT.n = at;
    while (i > 0) {
      const q = Math.floor(i / 10);
      b[--at] = 48 + (i - q * 10);
      i = q;
    }
  }
  if (f) {
    b[TEXT.n++] = 46;
    const tens = Math.floor(f / 10), ones = f - tens * 10;
    b[TEXT.n++] = 48 + tens;
    if (ones) b[TEXT.n++] = 48 + ones;
  }
}

/** A closed (or open) smooth path through the points: Catmull-Rom as cubic Béziers. y is flipped for SVG. */
export function smoothPath(pts, closed = true, tension = 1) {
  const n = pts.length;
  if (n < 2) return "";
  const P = (i) => (closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)]);
  const from = begin();
  const k = tension / 6;
  const first = P(0);
  ch(77); num(first[0]); ch(44); num(-first[1]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    // c1 = p1 + (p2 - p0)·k and c2 = p2 - (p3 - p1)·k, as add(p1, mul(sub(p2, p0), k)) computed them, without their arrays.
    const c1x = p1[0] + (p2[0] - p0[0]) * k, c1y = p1[1] + (p2[1] - p0[1]) * k;
    const c2x = p2[0] - (p3[0] - p1[0]) * k, c2y = p2[1] - (p3[1] - p1[1]) * k;
    ch(67); num(c1x); ch(44); num(-c1y); ch(32); num(c2x); ch(44); num(-c2y); ch(32); num(p2[0]); ch(44); num(-p2[1]);
  }
  if (closed) ch(90);
  return end(from);
}

/** smoothPath's text for a flat polyline (kit/flat.js: { x, y, n }), closed, offset by (dx, dy): the same text as smoothPath of
 * its points (each shifted, as `x + dx`), without them as arrays. */
export function smoothPathFlat(f, dx = 0, dy = 0, tension = 1) {
  const { x, y, n } = f;
  if (n < 2) return "";
  const k = tension / 6;
  const from = begin();
  ch(77); V[0] = dx ? x[0] + dx : x[0]; numv(); ch(44); V[0] = -(dy ? y[0] + dy : y[0]); numv();
  for (let i = 0; i < n; i++) {
    const i0 = (i - 1 + n) % n, i1 = i, i2 = (i + 1) % n, i3 = (i + 2) % n;
    const p0x = dx ? x[i0] + dx : x[i0], p0y = dy ? y[i0] + dy : y[i0];
    const p1x = dx ? x[i1] + dx : x[i1], p1y = dy ? y[i1] + dy : y[i1];
    const p2x = dx ? x[i2] + dx : x[i2], p2y = dy ? y[i2] + dy : y[i2];
    const p3x = dx ? x[i3] + dx : x[i3], p3y = dy ? y[i3] + dy : y[i3];
    const c1x = p1x + (p2x - p0x) * k, c1y = p1y + (p2y - p0y) * k;
    const c2x = p2x - (p3x - p1x) * k, c2y = p2y - (p3y - p1y) * k;
    ch(67); V[0] = c1x; numv(); ch(44); V[0] = -c1y; numv(); ch(32); V[0] = c2x; numv(); ch(44); V[0] = -c2y; numv();
    ch(32); V[0] = p2x; numv(); ch(44); V[0] = -p2y; numv();
  }
  ch(90);
  return end(from);
}

/** A polygon as an SVG path, straight segments, y flipped. */
export function polyPath(pts, closed = true) {
  const from = begin();
  for (let i = 0; i < pts.length; i++) {
    ch(i ? 76 : 77); num(pts[i][0]); ch(44); num(-pts[i][1]);
  }
  if (closed) ch(90);
  return end(from);
}

/** An ellipse as a polygon (y up), n points, counter-clockwise from angle a0. */
/** ellipse(), into a flat polyline's buffers (out: { x, y, n }, kit/flat.js), the same points. */
export function ellipseInto(out, cx, cy, rx, ry, n = 64, rotA = 0, a0 = -Math.PI / 2) {
  const s = Math.sin(rotA), k = Math.cos(rotA);
  for (let i = 0; i < n; i++) {
    const a = a0 + (2 * Math.PI * i) / n;
    const x = cx + rx * Math.cos(a) - cx, y = cy + ry * Math.sin(a) - cy;
    out.x[i] = cx + x * k - y * s;
    out.y[i] = cy + x * s + y * k;
  }
  out.n = n;
  return out;
}

export function ellipse(cx, cy, rx, ry, n = 64, rotA = 0, a0 = -Math.PI / 2) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (2 * Math.PI * i) / n;
    out.push(rot([cx + rx * Math.cos(a), cy + ry * Math.sin(a)], rotA, [cx, cy]));
  }
  return out;
}

export { f2 };

/**
 * How sharply a closed polygon turns at each point, in radians (positive left).
 */
export function turnsOf(poly) {
  const n = poly.length;
  return poly.map((b, i) => {
    const a = poly[(i - 1 + n) % n], c = poly[(i + 1) % n];
    let d = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  });
}

/**
 * A corner: where the polygon turns much more sharply than at the points either side (a cap meeting a tube that
 * tapers, or the chords of a coarse arc), as against a tight but even curve. The largest such jump, in degrees.
 */
export function cornerOf(poly) {
  const t = turnsOf(poly), n = t.length;
  let worst = 0, at = 0;
  for (let i = 0; i < n; i++) {
    const jump = Math.abs(t[i] - (t[(i - 1 + n) % n] + t[(i + 1) % n]) / 2);
    if (jump > worst) [worst, at] = [jump, i];
  }
  return { deg: (worst * 180) / Math.PI, at: poly[at], i: at };
}

/**
 * A closed outline made smooth along its length: resampled at even `spacing` (units), then each point the Gaussian-
 * weighted mean of its neighbours (sigma, in units). Every corner rounds alike (a cap meeting a tapering tube, a coarse
 * arc's chords); a curve of radius R pulls in by about sigma² / 2R (0.14 units on the bulb, nothing visible elsewhere),
 * and straight runs stay straight.
 */
export function smoothOutline(poly, { sigma = 1.2, spacing = 0.5 } = {}) {
  const L = arcLengths([...poly, poly[0]]);
  const n = Math.max(24, Math.round(L[L.length - 1] / spacing));
  const pts = resample(poly, n);
  const step = L[L.length - 1] / n;
  const reach = Math.max(1, Math.ceil((3 * sigma) / step));
  const w = [];
  for (let k = -reach; k <= reach; k++) w.push(Math.exp(-((k * step) ** 2) / (2 * sigma * sigma)));
  const total = w.reduce((x, y) => x + y, 0);
  return pts.map((_, i) => {
    let x = 0, y = 0;
    for (let k = -reach; k <= reach; k++) {
      const q = pts[(i + k + n) % n], wk = w[k + reach];
      x += q[0] * wk;
      y += q[1] * wk;
    }
    return [x / total, y / total];
  });
}

/**
 * Rounds sharp inward corners (where two parts of a shape meet at a crease, like a curl's underside against the body),
 * leaving the rest untouched: resamples to an even spacing, finds concave turns sharper than `angle`, and relaxes the
 * points within `radius` of each (Laplacian smoothing). Counter-clockwise polygons (y up).
 */
export function filletConcave(poly, { angle = 0.6, radius = 5, iters = 24, spacing = 0.6 } = {}) {
  const L = arcLengths([...poly, poly[0]]);
  let pts = resample(poly, Math.max(60, Math.round(L[L.length - 1] / spacing)));
  const n = pts.length, k = 3;
  const turnAt = (i) => {
    const a = pts[(i - k + n) % n], b = pts[i], c = pts[(i + k) % n];
    const u = norm(sub(b, a)), v = norm(sub(c, b));
    return Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]); // + left (convex), - right (concave)
  };
  const w = new Float64Array(n);
  const reach = Math.round(radius / spacing);
  for (let i = 0; i < n; i++) {
    if (turnAt(i) < -angle) for (let j = -reach; j <= reach; j++) w[(i + j + n) % n] = Math.max(w[(i + j + n) % n], 1 - Math.abs(j) / (reach + 1));
  }
  if (!w.some((v) => v > 0)) return pts;
  for (let it = 0; it < iters; it++) {
    const next = pts.slice();
    for (let i = 0; i < n; i++) {
      if (!w[i]) continue;
      const a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n], m = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
      next[i] = lerp2(pts[i], m, 0.5 * w[i]);
    }
    pts = next;
  }
  return pts;
}

/** Point in polygon (even-odd). */
export function inside(poly, x, y) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * One smooth outline for a union of shapes (each a closed polygon, y up): coverage on a grid (2×2 supersampled), the
 * 0.5 contour by marching squares, the longest loop kept (its outer edge; holes are filled), then resampled to `n`
 * points. For things built from parts (a lens and a handle, a flag and its pole). Slow-ish: build shapes once.
 */
export function unionOutline(shapes, opts = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of shapes) for (const [x, y] of s) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const bbs = shapes.map((s) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, y] of s) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a, b, c, d]; });
  const inAny = (x, y) => shapes.some((s, k) => x >= bbs[k][0] && x <= bbs[k][2] && y >= bbs[k][1] && y <= bbs[k][3] && inside(s, x, y));
  return outlineOf(inAny, [x0, y0, x1, y1], opts);
}

/** The outline of any region given as an inside test over a box (cuts too: "in A and not in B"). See unionOutline. */
export function outlineOf(inAny, [x0, y0, x1, y1], { res = 0.6, n = 240, pad = 4 } = {}) {
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const W = Math.ceil((x1 - x0) / res) + 1, H = Math.ceil((y1 - y0) / res) + 1;
  const cov = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    // 3×3 supersampled: coverage in ninths, never exactly 0.5, so no crossing lands on a grid corner.
    const x = x0 + i * res, y = y0 + j * res, q = res / 3;
    let k = 0;
    for (const dx of [-q, 0, q]) for (const dy of [-q, 0, q]) k += inAny(x + dx, y + dy);
    cov[j * W + i] = k / 9;
  }
  // Marching squares: segments between edge crossings of the 0.5 level, then chained into loops.
  const v = (i, j) => cov[j * W + i];
  const P = (i, j) => [x0 + i * res, y0 + j * res];
  const cross = (a, b, va, vb) => { const t = (0.5 - va) / (vb - va); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
  const key = (p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  const next = new Map();
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
    const idx = (a > 0.5) | ((b > 0.5) << 1) | ((c > 0.5) << 2) | ((d > 0.5) << 3);
    if (idx === 0 || idx === 15) continue;
    const e = {
      b: () => cross(P(i, j), P(i + 1, j), a, b), r: () => cross(P(i + 1, j), P(i + 1, j + 1), b, c),
      t: () => cross(P(i + 1, j + 1), P(i, j + 1), c, d), l: () => cross(P(i, j + 1), P(i, j), d, a),
    };
    // Each case: segments oriented with the inside on the left (counter-clockwise loops).
    const segs = {
      1: [["b", "l"]], 2: [["r", "b"]], 3: [["r", "l"]], 4: [["t", "r"]], 5: [["t", "l"], ["b", "r"]], 6: [["t", "b"]], 7: [["t", "l"]],
      8: [["l", "t"]], 9: [["b", "t"]], 10: [["l", "b"], ["r", "t"]], 11: [["r", "t"]], 12: [["l", "r"]], 13: [["b", "r"]], 14: [["l", "b"]],
    }[idx];
    for (const [s0, s1] of segs) { const p0 = e[s0](), p1 = e[s1](); next.set(key(p0), p1); }
  }
  const loops = [], seen = new Set();
  for (const [k0] of next) {
    if (seen.has(k0)) continue;
    const loop = [];
    let k = k0, guard = 0;
    while (!seen.has(k) && next.has(k) && guard++ < 1e6) {
      seen.add(k);
      const p = next.get(k);
      loop.push(p);
      k = key(p);
    }
    if (loop.length > 8) loops.push(loop);
  }
  loops.sort((A, B) => B.length - A.length);
  let out = loops[0] || [];
  if (area(out) < 0) out = out.reverse();
  return resample(out, n);
}
