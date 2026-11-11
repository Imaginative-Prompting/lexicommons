// Generated from the character's rig (08-lexicommons/docs/design/character/rig/kit/acting.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// Acting helpers shared by every character: the pieces of the channel's animation grammar (context/animation-rules.md:
// hold, anticipation, action, overshoot, settle; nothing alive static; gravity accelerates; impacts land), as pure
// functions of time that return pose fields to add.

import { blinkAt, blinks, blinkTimes, clamp01, inOut, keys, noise, outBack, outCubic, ring, smooth, span, wobble } from "./anim.js";

/** Never static: breathing, a slow bob, the tip swaying, blinks, small glances. Add to any pose. */
export function alive(t, seed = 1, k = 1) {
  return {
    belly: 1 + 0.012 * k * Math.sin((2 * Math.PI * t) / 2.6 + seed),
    squash: 0.02 * k * Math.sin((2 * Math.PI * t) / 2.6 + seed + 0.6),
    tip: 0.06 * k * wobble(t * 0.45, seed),
    lean: 0.025 * k * wobble(t * 0.3, seed + 3),
    blink: blinkAt(t, seed),
    look: [0.12 * k * wobble(t * 0.35, seed + 5), 0.06 * k * wobble(t * 0.3, seed + 9)],
  };
}

/**
 * A hop: anticipation (crouch), takeoff, flight on a gravity parabola, landing squash, settle.
 * t0 = takeoff; air = seconds in the air; h = height (units). Returns { y, squash, bend, airborne }.
 */
export function hop(t, t0, { air = 0.5, h = 30, crouch = 0.3, land = 0.3 } = {}) {
  const pre = 0.16;
  let y = 0, squash = 0, bend = 0, airborne = false;
  if (t < t0 - pre) return { y, air: y, squash, bend, airborne };
  if (t < t0) {
    squash = crouch * inOut((t - (t0 - pre)) / pre);           // anticipation: crouch
    bend = -0.12 * inOut((t - (t0 - pre)) / pre);
  } else if (t < t0 + air) {
    const u = (t - t0) / air;
    y = 4 * h * u * (1 - u);                                     // constant gravity
    const vy = (4 * h * (1 - 2 * u)) / air;                       // units / s
    squash = -Math.min(0.32, Math.abs(vy) * 0.0016) * (vy > 0 ? 1 : 0.6); // stretch along the speed
    bend = -vy * 0.0012;                                          // the tip trails the motion
    airborne = true;
  } else {
    const u = t - (t0 + air);
    squash = land * ring(u, 3.1, 0.3);                            // impact, then a damped jelly
    bend = 0.15 * ring(u, 2.4, 0.3);                              // the tip carries on, swings back
  }
  // air: how far it's off its ground (pass it as the pose's `air`, so its puddle stays down); y: the same, for older callers.
  return { y, air: y, squash, bend, airborne };
}

/** A ballistic droplet: from p0 with velocity v0 (units/s), gravity g; null before t0 or after it lands. */
export function droplet(t, t0, p0, v0, { g = 520, r = 3.2, floor = 0, stick = 0.35 } = {}) {
  const u = t - t0;
  if (u < 0) return null;
  const x = p0[0] + v0[0] * u, y = p0[1] + v0[1] * u - 0.5 * g * u * u;
  if (y > floor) return { c: [x, y], r, landed: false };
  // Landed: it splats into a dot that stays a moment then shrinks away.
  const tl = (v0[1] + Math.sqrt(v0[1] ** 2 + 2 * g * (p0[1] - floor))) / g;
  const since = u - tl;
  if (since > stick) return null;
  return { c: [p0[0] + v0[0] * tl, floor + r * 0.35], r: r * (1 - since / stick), landed: true };
}

export { blinks, blinkTimes, clamp01, inOut, keys, noise, outBack, outCubic, ring, smooth, span, wobble };
