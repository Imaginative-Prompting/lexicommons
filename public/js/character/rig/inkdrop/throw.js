// Generated from the character's rig (08-lexicommons/docs/design/character/rig/inkdrop/throw.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// The drop throwing a drop of itself at something, which is how it acts on things in the app from where it stands. The
// drop's side of it: its acting, and exactly where and how fast the ink leaves it. The flight and what the splat does to its target are
// lex-mascots' (rig/splat/throw.js), which starts its flight from throwLaunch.
//
// throwPose(t, t0, dir, { power })  pose layers for clips.js compose(): anticipation (gathers ink, pulls back, eyes on
//                                   the target), the fling, follow-through and settle. Add its `bulb` to the pose's
//                                   liquid.bulb (the ink gathering at its tip before it goes).
// throwLaunch(pose, t0, dir, { power })  { at, v, r, tRelease }: where the drop leaves (its tip when the target is to
//                                   its right, its side when it's to its left), its velocity (units/s) and radius.
//
// dir: toward the target, [x, y] (y up, normalized here). t0: the moment the ink leaves. Pure functions of time.

import { tipEnd, worldOutline } from "./inkdrop.js";
import { clamp01, inOut, outCubic, ring } from "../kit/anim.js";

const PRE = 0.24, SNAP = 0.1;

const unit = ([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };

export function throwPose(t, t0, dir, { power = 1 } = {}) {
  const [dx, dy] = unit(dir);
  const tipThrow = dx >= 0;                          // to its right: flung from its tip; to its left: from its side
  const k = 0.6 + 0.4 * power;
  const look = [dx * 0.85, dy * 0.45];
  // Each part's pose at the three keys: cocked (end of the anticipation), flung (the snap), and the overshoot after.
  // Tip throws cock the curl up and back and straighten it at the target; side flicks lean only a little, so the curl
  // never folds over the head.
  const K = tipThrow
    ? { cocked: { squash: 0.2, lean: -0.14, bend: -0.06, tip: 0.42, curl: 0.05, bulb: 3.2 },
        flung: { squash: -0.24, lean: 0.2, bend: 0.12, tip: -0.12, curl: -0.55, bulb: 0 },
        over: { squash: -0.1, lean: 0.26, bend: 0.18, tip: -0.22, curl: -0.45, bulb: 0 } }
    : { cocked: { squash: 0.22, lean: 0.12, bend: 0.05, tip: 0.1, curl: 0, bulb: 0 },
        flung: { squash: -0.2, lean: -0.1, bend: -0.04, tip: 0.18, curl: 0.1, bulb: 0 },
        over: { squash: -0.08, lean: -0.13, bend: -0.06, tip: 0.22, curl: 0.12, bulb: 0 } };
  const mix = (a, b, u) => Object.fromEntries(Object.keys(a).map((f) => [f, (a[f] + (b[f] - a[f]) * u) * (f === "curl" || f === "bulb" ? 1 : k)]));
  const zero = { squash: 0, lean: 0, bend: 0, tip: 0, curl: 0, bulb: 0 };
  if (t < t0 - PRE - 0.12) return {};
  if (t < t0 - SNAP / 2) {
    // Anticipation: eyes go to the target first, then it crouches and pulls back away from it, ink gathering.
    const a = inOut((t - (t0 - PRE - 0.12)) / (PRE + 0.12 - SNAP / 2));
    const e = Math.min(1, a * 2);
    return {
      ...mix(zero, K.cocked, a),
      face: { look: [look[0] * e, look[1] * e], tilt: [0.18 * a, 0.18 * a], brows: { show: a, raise: [0, 0], tilt: [0.2 * a, 0.2 * a] }, mouth: { type: "flat", w: 9 } },
    };
  }
  if (t < t0 + SNAP / 2) {
    // The fling: a snap toward the target (the ink leaves at t0).
    const a = outCubic((t - (t0 - SNAP / 2)) / SNAP);
    return { ...mix(K.cocked, K.flung, a), face: { look, tilt: [0.18, 0.18], brows: { show: 1, raise: [0, 0], tilt: [0.2, 0.2] }, mouth: { type: "o", open: 0.5 * a, w: 8 } } };
  }
  // Follow-through and settle: on past the snap to its overshoot, then rings back to rest; eyes follow the throw.
  const u = t - (t0 + SNAP / 2);
  const toOver = outCubic(u / 0.12), back = u <= 0.12 ? 1 : ring(u - 0.12, 2.2, 0.32);  // 1 at the overshoot, rings to 0
  const rest = 1 - clamp01(u / 0.9);
  const pose = u < 0.12 ? mix(K.flung, K.over, toOver) : mix(zero, K.over, back);
  return { ...pose, face: { look: [look[0] * rest, look[1] * rest], brows: { show: rest, raise: [0, 0], tilt: [0.2 * rest, 0.2 * rest] }, mouth: { type: u < 0.35 ? "o" : "smile", open: 0.4, w: 8 } } };
}

/** Where the ink leaves the drop at t0, how fast, and how big: the start of the flight (world units, y up). */
export function throwLaunch(pose, t0, dir, { power = 1 } = {}) {
  const [dx, dy] = unit(dir);
  // A placed pose (x, y, scale) gives a placed launch: its point, size and speed all in the pose's own units.
  const s = pose.scale ?? 1, y0 = pose.y ?? 0;
  const speed = (380 + 260 * power) * s, r = (4.5 + 2.5 * power) * s;
  let at;
  if (dx >= 0) {
    // From the tip: the bulb at the curl's end, at the moment of the snap.
    const te = tipEnd(pose);
    at = [te.at[0] + dx * te.r, te.at[1] + dy * te.r];
  } else {
    // From its side facing the target: the outline point furthest along dir, a little above its middle.
    const all = worldOutline(pose), belly = all.filter(([, y]) => y > y0 + 25 * s && y < y0 + 70 * s);   // its belly's side
    const o = belly.length ? belly : all;
    at = o.reduce((best, p) => (p[0] * dx + p[1] * dy > best[0] * dx + best[1] * dy ? p : best), o[0]);
  }
  return { at, v: [dx * speed, dy * speed + 60 * s], r, tRelease: t0 };
}

export const THROW_TIMING = { anticipation: PRE + 0.12, snap: SNAP, settle: 0.9 };
