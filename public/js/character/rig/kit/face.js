// Generated from the character's rig (08-lexicommons/docs/design/character/rig/kit/face.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// Faces for code-built characters: eyes that act (lids cut straight across, a lower lid that smiles, pupils that look,
// two glints), floating brows, and a set of mouths. Pure: parameters in, SVG out. y is up in the inputs.
//
// Duolingo's rules, which these follow (research.md §1): geometric eyes; emotion from lids, pupil size and direction;
// closed eyes as arcs or chevrons; brows as separate floating shapes; mouths the least geometric part, favoring a side.

import { add, begin, ch, ellipse, end, f2, mul, numv, polyPath, rot, smoothPath, V } from "./geom.js";

let uid = 0;
const nextId = (p) => `${p}${(uid = (uid + 1) % 1e9)}`;
/** Restart the id counter (so one frame's SVG is the same however many were drawn before it). */
export const resetIds = () => { uid = 0; };

/**
 * One eye. `e`: { c: [x,y], rx, ry, angle (rad, the face's tilt), look: [lx, ly] in -1..1, pupil (scale, 1 = normal),
 * top (upper lid 0 open..1 shut), tilt (upper lid's angle, rad: + lowers its inner end), bottom (lower lid 0..1),
 * closed: null | "happy" | "squeeze" | "calm", side: -1 left eye / +1 right eye, squash: [sx, sy] }
 * `pal`: { white, pupil, glint, lid, lidLine }
 */
const WHITE = {};
export function eye(e, pal) {
  const { c, rx, ry, angle = 0, look = [0, 0], pupil = 1, top = 0, tilt = 0, bottom = 0, closed = null, side = 1 } = e;
  const R = (p) => rot(p, angle, c);
  const stroke = Math.max(1.6, rx * 0.2);
  // Shut: the closed shapes are strokes in the pupil color.
  if (closed || top >= 0.97) {
    const kind = closed || "calm";
    let pts;
    if (kind === "happy") {
      // ^ : an arch, convex up.
      pts = [[-rx * 0.82, -ry * 0.05], [-rx * 0.45, ry * 0.42], [0, ry * 0.58], [rx * 0.45, ry * 0.42], [rx * 0.82, -ry * 0.05]];
    } else if (kind === "squeeze") {
      // > < : a chevron pointing at the nose.
      const s = -side;
      pts = [[-s * rx * 0.75, ry * 0.5], [s * rx * 0.6, 0], [-s * rx * 0.75, -ry * 0.5]];
      return `<path d="${polyPath(pts.map((p) => R(add(c, p))), false)}" fill="none" stroke="${pal.pupil}" stroke-width="${f2(stroke)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else {
      // A gentle downward curve where the lid meets the lower lid.
      const y = -ry * 0.15;
      pts = [[-rx * 0.85, y + ry * 0.12], [-rx * 0.4, y - ry * 0.12], [0, y - ry * 0.18], [rx * 0.4, y - ry * 0.12], [rx * 0.85, y + ry * 0.12]];
    }
    return `<path d="${smoothPath(pts.map((p) => R(add(c, p))), false)}" fill="none" stroke="${pal.pupil}" stroke-width="${f2(stroke)}" stroke-linecap="round"/>`;
  }
  // Open: the visible white is built exactly, in the eye's own frame: inside the ellipse, below the upper lid's line,
  // above the lower lid's curve. (Covering the white with lid-colored shapes left a faint ring of its edge.)
  const a = tilt * -side;
  const yLid = (x) => ry - 2 * ry * top + x * Math.tan(a);
  const Rr = rx * 1.6, cyL = -ry - Rr * 0.62 + 2 * ry * bottom * 0.9;
  const yLow = (x) => (bottom > 0.005 && Math.abs(x) < Rr ? cyL + Rr * 0.62 * Math.sqrt(1 - (x / Rr) ** 2) : -Infinity);
  // Cosine spacing: dense where the ellipse turns vertical at its ends (even steps left flat sides there). The white's edge in
  // kept buffers (WHITE): its top along the upper edge, its bottom back along the lower, as [...upper, ...lower.reverse()] was.
  const N = 64;
  const W = (WHITE.x ??= new Float64Array(N + 1)), HI = (WHITE.hi ??= new Float64Array(N + 1)), LO = (WHITE.lo ??= new Float64Array(N + 1));
  let m = 0;
  for (let i = 0; i <= N; i++) {
    const x = -rx * Math.cos((Math.PI * i) / N);
    const h = ry * Math.sqrt(Math.max(0, 1 - (x / rx) ** 2));
    const hi = Math.min(h, yLid(x)), lo = Math.max(-h, yLow(x));
    if (hi >= lo) {
      W[m] = x;
      HI[m] = hi;
      LO[m] = lo;
      m++;
    }
  }
  if (m < 3) {
    return eye({ ...e, closed: closed || "calm", top: 1 }, pal);
  }
  // polyPath of each point R(add(c, q)): the same arithmetic, written as it goes.
  const sn = Math.sin(angle), kc = Math.cos(angle);
  const from = begin();
  const put = (qx, qy, first) => {
    const x = c[0] + qx - c[0], y = c[1] + qy - c[1];
    ch(first ? 77 : 76); V[0] = c[0] + x * kc - y * sn; numv(); ch(44); V[0] = -(c[1] + x * sn + y * kc); numv();
  };
  for (let i = 0; i < m; i++) put(W[i], HI[i], i === 0);
  for (let i = m - 1; i >= 0; i--) put(W[i], LO[i], false);
  ch(90);
  const white = end(from);
  const id = nextId("e");
  // The pupil travels inside the white, further sideways than up and down.
  const pr = Math.min(rx, ry) * 0.56 * pupil;
  const pc = R(add(c, [look[0] * (rx - pr * 0.85), look[1] * (ry - pr * 0.9)]));
  const g1 = add(pc, rot([pr * 0.32, pr * 0.42], angle));
  const g2 = add(pc, rot([-pr * 0.34, -pr * 0.36], angle));
  let s = `<clipPath id="${id}"><path d="${white}"/></clipPath>`;
  s += `<path d="${white}" fill="${pal.white}"/>`;
  s += `<g clip-path="url(#${id})">`;
  s += `<circle cx="${f2(pc[0])}" cy="${f2(-pc[1])}" r="${f2(pr)}" fill="${pal.pupil}"/>`;
  s += `<circle cx="${f2(g1[0])}" cy="${f2(-g1[1])}" r="${f2(pr * 0.3)}" fill="${pal.glint}"/>`;
  s += `<circle cx="${f2(g2[0])}" cy="${f2(-g2[1])}" r="${f2(pr * 0.12)}" fill="${pal.glint}" opacity="0.85"/>`;
  s += `</g>`;
  return s;
}

/**
 * A brow floating above an eye. b: { c: [x,y] (the eye's center), rx, ry, angle, raise (-1..1), tilt (rad, + lifts
 * the inner end: worried), show (0..1), side }
 */
export function brow(b, pal) {
  const { c, rx, ry, angle = 0, raise = 0, tilt = 0, show = 0, side = 1 } = b;
  if (show <= 0.01) return "";
  const w = rx * 0.62 * show;
  const mid = add(c, rot([side * rx * 0.12, ry + rx * 0.3 + raise * rx * 0.32], angle));
  const a = angle + tilt * -side;
  // An arched pill: thick in the middle, round ends.
  const pts = [-1, -0.6, -0.2, 0.2, 0.6, 1].map((u) => rot(add(mid, [u * w, (1 - u * u) * rx * 0.16]), a, mid));
  return `<path d="${smoothPath(pts, false)}" fill="none" stroke="${pal.brow}" stroke-width="${f2(rx * 0.24 * Math.max(0.4, show))}" stroke-linecap="round"/>`;
}

/**
 * A mouth. m: { c: [x,y], w (width), type: "smile" | "grin" | "open" | "o" | "flat" | "hm" | "none", open (0..1),
 * smile (-1..1, + corners up), asym (-1..1, + lifts the right corner), angle }
 */
export function mouth(m, pal) {
  const { c, w, type = "smile", open = 0.5, smile = 1, asym = 0.35, angle = 0 } = m;
  if (type === "none") return "";
  const R = (p) => rot(add(c, p), angle, c);
  const sw = Math.max(1.4, w * 0.2);
  const line = (pts) => `<path d="${smoothPath(pts.map(R), false)}" fill="none" stroke="${pal.pupil}" stroke-width="${f2(sw)}" stroke-linecap="round"/>`;
  const hw = w / 2;
  if (type === "smile" || type === "grin") {
    const k = type === "grin" ? 1.5 : 1;
    const depth = hw * 0.55 * smile * k;
    const lift = hw * 0.35 * asym;
    return line([[-hw * k, depth * 0.15 - lift * 0.4], [-hw * k * 0.45, -depth * 0.75], [hw * k * 0.1, -depth], [hw * k * 0.6, -depth * 0.55 + lift * 0.5], [hw * k, depth * 0.35 + lift]]);
  }
  if (type === "flat") return line([[-hw * 0.7, 0], [0, -hw * 0.04], [hw * 0.7, hw * 0.06 * asym]]);
  if (type === "hm") return line([[-hw * 0.8, -hw * 0.05], [-hw * 0.3, hw * 0.12], [hw * 0.2, -hw * 0.08], [hw * 0.75, hw * 0.1]]);
  if (type === "o") {
    const r = hw * (0.42 + 0.5 * open);
    return `<path d="${smoothPath(ellipse(c[0], c[1], r * 0.85, r, 40, angle))}" fill="${pal.mouth}"/>`;
  }
  // "open": a D-shaped open smile: a gently curved top edge, a deep round bottom, a tongue.
  const h = hw * (0.7 + 0.8 * open);
  const tilt2 = asym * hw * 0.18;
  const topEdge = [-1, -0.5, 0, 0.5, 1].map((u) => [u * hw, hw * 0.12 * u * u + tilt2 * u]);
  const bottom = [0.85, 0.55, 0.2, -0.2, -0.55, -0.85].map((u) => [u * hw, -h * Math.sqrt(1 - u * u) + tilt2 * u * 0.5]);
  const shape = [...topEdge, ...bottom].map(R);
  const id = nextId("m");
  let s = `<clipPath id="${id}"><path d="${smoothPath(shape)}"/></clipPath>`;
  s += `<path d="${smoothPath(shape)}" fill="${pal.mouth}"/>`;
  const tc = R([hw * 0.15, -h * 1.12]);
  s += `<g clip-path="url(#${id})"><ellipse cx="${f2(tc[0])}" cy="${f2(-tc[1])}" rx="${f2(hw * 0.5)}" ry="${f2(h * 0.38)}" fill="${pal.tongue}"/></g>`;
  return s;
}

/** Shifts a point by the face's turn: points slide sideways, and the far side narrows (a flat 2D turn). */
export function turn(p, center, amount, halfWidth) {
  const dx = p[0] - center[0];
  const squeeze = 1 - Math.abs(amount) * 0.25 * Math.sign(dx * amount + 1e-9);
  return [center[0] + dx * squeeze + amount * halfWidth * 0.55, p[1]];
}

export { mul };
