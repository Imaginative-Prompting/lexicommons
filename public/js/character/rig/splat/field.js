// Generated from the character's rig (08-lexicommons/docs/design/character/rig/splat/field.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// A 2D signed-distance field, contoured: what makes the splat liquid. Shapes are distance functions (negative
// inside), unioned with a smooth minimum, so where two parts come close they bridge, neck and merge, and where they
// pull apart they pinch off. marching squares finds the field's zero line each frame and returns smooth closed loops.
// lex-mascots, 2 Nov 2026. Pure functions; y is up.

/** The distance to a circle. */
export const sdCircle = (p, c, r) => Math.hypot(p[0] - c[0], p[1] - c[1]) - r;

/** An ellipse (approximate: the circle's distance in squashed space, scaled back; good near the outline). */
export function sdEllipse(p, c, rx, ry, ang = 0) {
  const s = Math.sin(-ang), k = Math.cos(-ang), x = p[0] - c[0], y = p[1] - c[1];
  const u = x * k - y * s, v = x * s + y * k;
  const m = Math.min(rx, ry);
  return (Math.hypot(u / rx, v / ry) - 1) * m;
}

/** A tapered capsule (a "round cone") from a (radius ra) to b (radius rb). */
export function sdTaper(p, a, b, ra, rb) {
  const dx = b[0] - a[0], dy = b[1] - a[1], h = Math.hypot(dx, dy) || 1e-6;
  const uy = [dx / h, dy / h], ux = [uy[1], -uy[0]];
  const px = Math.abs((p[0] - a[0]) * ux[0] + (p[1] - a[1]) * ux[1]), py = (p[0] - a[0]) * uy[0] + (p[1] - a[1]) * uy[1];
  const bb = (ra - rb) / h;
  if (Math.abs(bb) >= 1) return Math.min(Math.hypot(px, py) - ra, Math.hypot(px, py - h) - rb);
  const aa = Math.sqrt(1 - bb * bb);
  const kk = -bb * px + aa * py;
  if (kk < 0) return Math.hypot(px, py) - ra;
  if (kk > aa * h) return Math.hypot(px, py - h) - rb;
  return aa * px + bb * py - ra;
}

/** The distance to a polygon (exact; negative inside). */
export function sdPolygon(p, v) {
  let d = Infinity, s = 1;
  for (let i = 0, j = v.length - 1; i < v.length; j = i, i++) {
    const ex = v[j][0] - v[i][0], ey = v[j][1] - v[i][1], wx = p[0] - v[i][0], wy = p[1] - v[i][1];
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey || 1)));
    const bx = wx - ex * t, by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c1 = p[1] >= v[i][1], c2 = p[1] < v[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}

/** A thick stroke along a polyline (round ends and joins). */
export function sdStroke(p, pts, r) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, sdTaper(p, pts[i], pts[i + 1], r, r));
  return d;
}

/** Smooth minimum (polynomial): a union whose joins are filleted over about k units. */
export function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * The field's zero line: marching squares over [x0, x1] × [y0, y1] with cells of size `h`. Returns closed loops
 * (arrays of [x, y]), each smoothed lightly. Cells on the box's border are treated as outside, so every loop closes.
 */
export function contour(f, x0, y0, x1, y1, h = 1) {
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1;
  const V = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    V[j * nx + i] = i === 0 || j === 0 || i === nx - 1 || j === ny - 1 ? 1 : f([x0 + i * h, y0 + j * h]);
  }
  const at = (i, j) => V[j * nx + i];
  // Edge points, keyed: "h" edges between (i,j)-(i+1,j), "v" edges between (i,j)-(i,j+1).
  const pts = new Map();
  const edgePoint = (kind, i, j) => {
    const key = `${kind}${i},${j}`;
    if (!pts.has(key)) {
      const a = at(i, j), b = kind === "h" ? at(i + 1, j) : at(i, j + 1);
      const t = a / (a - b);
      pts.set(key, kind === "h" ? [x0 + (i + t) * h, y0 + j * h] : [x0 + i * h, y0 + (j + t) * h]);
    }
    return key;
  };
  const next = new Map(); // directed: walking with the inside on the left
  const link = (a, b) => next.set(a, b);
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v0 = at(i, j), v1 = at(i + 1, j), v2 = at(i + 1, j + 1), v3 = at(i, j + 1);
    const c = (v0 < 0 ? 1 : 0) | (v1 < 0 ? 2 : 0) | (v2 < 0 ? 4 : 0) | (v3 < 0 ? 8 : 0);
    if (c === 0 || c === 15) continue;
    const B = () => edgePoint("h", i, j), R = () => edgePoint("v", i + 1, j), T = () => edgePoint("h", i, j + 1), L = () => edgePoint("v", i, j);
    switch (c) {
      case 1: link(L(), B()); break;
      case 2: link(B(), R()); break;
      case 3: link(L(), R()); break;
      case 4: link(R(), T()); break;
      case 5: { const mid = (v0 + v1 + v2 + v3) / 4; if (mid < 0) { link(L(), T()); link(R(), B()); } else { link(L(), B()); link(R(), T()); } break; }
      case 6: link(B(), T()); break;
      case 7: link(L(), T()); break;
      case 8: link(T(), L()); break;
      case 9: link(T(), B()); break;
      case 10: { const mid = (v0 + v1 + v2 + v3) / 4; if (mid < 0) { link(B(), L()); link(T(), R()); } else { link(B(), R()); link(T(), L()); } break; }
      case 11: link(T(), R()); break;
      case 12: link(R(), L()); break;
      case 13: link(R(), B()); break;
      case 14: link(B(), L()); break;
    }
  }
  // Walk the loops.
  const loops = [], seen = new Set();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let k = start, guard = 0;
    while (k && !seen.has(k) && guard++ < 100000) { seen.add(k); loop.push(pts.get(k)); k = next.get(k); }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}

/** Signed area (positive = counter-clockwise). */
export function loopArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}

/** Thins a dense loop to points at least `d` apart (keeps the shape; makes smooth paths lighter). */
export function thin(loop, d = 0.6) {
  const out = [loop[0]];
  for (let i = 1; i < loop.length; i++) { const p = loop[i], q = out[out.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= d) out.push(p); }
  return out;
}
