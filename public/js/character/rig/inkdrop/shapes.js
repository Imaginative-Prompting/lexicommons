// Generated from the character's rig (08-lexicommons/docs/design/character/rig/inkdrop/shapes.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// What the ink drop turns into: outlines in its own units (ground y = 0, ~100 wide), each with where its eyes go and
// how big they are there. Built from curves and the same sweep as the drop, so morphs stay smooth.

import { add, ellipse, filletConcave, resample, sweep } from "../kit/geom.js";

const line = (a, b, n = 40) => Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / (n - 1), a[1] + ((b[1] - a[1]) * i) / (n - 1)]);
const path = (pts, n = 30) => pts.slice(1).flatMap((p, i) => line(pts[i], p, n).slice(i ? 1 : 0));
/** A thick round-ended stroke along a polyline: the shape ink makes when it's drawn. */
const stroke = (pts, r) => {
  // Round the centerline's corners first (Chaikin), so the outer side of each bend is a smooth arc, not a spike.
  let c = pts;
  for (let it = 0; it < 4; it++) {
    const next = [c[0]];
    for (let i = 0; i < c.length - 1; i++) {
      const a = c[i], b = c[i + 1];
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    next.push(c[c.length - 1]);
    c = next;
  }
  const sp = resample(path(c, 6), 160, false);
  return filletConcave(sweep(sp, sp.map(() => r)), { angle: 0.4, radius: 4, iters: 30 });
};

function heart() {
  const out = [];
  for (let i = 0; i < 160; i++) {
    const t = (2 * Math.PI * i) / 160;
    const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push([x * 3.15, y * 3.15 + 58]);
  }
  return out.reverse();
}

function star(outer = 60, inner = 29, cy = 60) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / 5, r = i % 2 ? inner : outer;
    pts.push([r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  // Rounded tips: resample densely, then relax (a soft, inky star, never pointy).
  let p = resample(pts, 200);
  for (let it = 0; it < 26; it++) p = p.map((q, i) => { const a = p[(i + 199) % 200], b = p[(i + 1) % 200]; return [(a[0] + b[0] + 2 * q[0]) / 4, (a[1] + b[1] + 2 * q[1]) / 4]; });
  return p;
}

function bubble() {
  const e = ellipse(0, 62, 52, 42, 120);
  // A tail at the lower left: swap the arc near 235° for a point reaching down.
  const out = [];
  e.forEach((q, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / 120;
    const d = Math.atan2(Math.sin(a - 4.0), Math.cos(a - 4.0));
    if (Math.abs(d) < 0.32) {
      const k = 1 - Math.abs(d) / 0.32;
      out.push(add(q, [-14 * k * k, -30 * k * k]));
    } else out.push(q);
  });
  return out;
}

/** A polygon with straight edges kept straight and its corners only slightly rounded (resample, then relax a little). */
function crisp(pts, n = 220, relax = 4) {
  let p = resample(pts, n);
  for (let it = 0; it < relax; it++) p = p.map((q, i) => { const a = p[(i + n - 1) % n], b = p[(i + 1) % n]; return [(a[0] + b[0] + 2 * q[0]) / 4, (a[1] + b[1] + 2 * q[1]) / 4]; });
  return p;
}

function plane() {
  // A paper plane in side view, nose to the right: the wing's top edge, the fold, the keel.
  return crisp([[60, 66], [-44, 96], [-26, 72], [-42, 50], [-4, 42]].reverse(), 220, 5);
}

function umbrella() {
  // A dome with a scalloped rim, its handle a stroke ending in a hook, all one outline.
  const out = [];
  const R = 52, cy = 66;
  for (let i = 0; i <= 60; i++) { const a = Math.PI - (Math.PI * i) / 60; out.push([R * Math.cos(a), cy + R * 0.82 * Math.sin(a)]); }
  // Rim, right to left, four scallops; the handle leaves from the middle.
  const sc = (x0, x1) => { for (let i = 1; i <= 14; i++) { const u = i / 14, x = x0 + (x1 - x0) * u; out.push([x, cy - 5 * Math.sin(Math.PI * u)]); } };
  sc(52, 26); sc(26, 3.5);
  // Handle down the right side, the hook, back up the left side.
  const hw = 3.5;
  for (let i = 0; i <= 12; i++) out.push([hw, cy - 3 - (52 * i) / 12]);
  for (let i = 0; i <= 20; i++) { const a = (Math.PI * i) / 20; out.push([-8 + (8 + hw) * Math.cos(a), 11 - (8 + hw) * Math.sin(a)]); }
  for (let i = 20; i >= 0; i--) { const a = (Math.PI * i) / 20; out.push([-8 + (8 - hw) * Math.cos(a), 11 - (8 - hw) * Math.sin(a)]); }
  for (let i = 12; i >= 0; i--) out.push([-hw, cy - 3 - (48 * i) / 12]);
  sc(-3.5, -26); sc(-26, -52);
  return out.reverse();
}

export const SHAPES = {
  heart: { to: heart(), eyes: [[-19, 64], [19, 64]], eyeScale: 0.78 },
  star: { to: star(), eyes: [[-12.5, 64], [12.5, 64]], eyeScale: 0.56 },
  check: { to: stroke([[-40, 64], [-13, 34], [42, 98]], 13), eyes: [[2, 58], [20, 74]], eyeScale: 0.46, mouth: null },
  seven: { to: stroke([[-30, 106], [32, 106], [-4, 12]], 12.5), eyes: [[-13, 106], [11, 106]], eyeScale: 0.5, mouth: null },
  ball: { to: ellipse(0, 44, 44, 44, 120), eyes: [[-18, 46], [18, 46]], eyeScale: 0.85 },
  puddle: { to: ellipse(0, 7, 66, 7.5, 140), eyes: [[-16, 13], [16, 13]], eyeScale: 0.5, mouth: null },
  bubble: { to: bubble(), eyes: [[-20, 64], [20, 64]], eyeScale: 0.9 },
  plane: { to: plane(), eyes: [[-4, 70], [14, 68]], eyeScale: 0.46, mouth: null, fold: [[60, 66], [-26, 72]] },
  umbrella: { to: umbrella(), eyes: [[-16, 90], [16, 90]], eyeScale: 0.62, mouth: [0, 79] },
};
