// Generated from the character's rig (08-lexicommons/docs/design/character/rig/inkdrop/held.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// What a held state on the compositor is built from (lex-character, 7 Nov 2026): idle's way (idle-motion.js) for the places' states
// (states-places.js: ready, counted, beside) and the empty states (states-retention.js: lounge, box, off, doze). Each plays its breath,
// sway and lean as one transform (heldMotion) and draws only for what a transform can't show: rest(T), busy(T), next(T), motion.
import { blinkAt, blinkNext, wobble } from "../kit/anim.js";

/** A held state's breath as a pose layer, as its motion (heldMotion) plays it. */
export const breathing = (M, T) => ({ belly: M.belly(T), squash: M.squash(T), lean: M.lean(T) });

/** Its eyes' drift (alive()'s look wobble at seed and k) as it was when they last shut, held until they shut again. */
export const heldEyes = (T, seed, k) => {
  const { last } = blinkNext(T - 0.05 + 1e-9, seed);
  const t = last === null ? 0 : last + 0.05;
  return [0.12 * k * wobble(t * 0.35, seed + 5), 0.06 * k * wobble(t * 0.3, seed + 9)];
};

/** Its blink and held eyes, what alive() gave it besides the breath. */
export const blinkAndEyes = (T, seed, k) => ({ blink: blinkAt(T, seed), face: { look: heldEyes(T, seed, k) } });

/** A moment's change of face (one drawing then held): drawn in the frame it comes, so busy for that frame. */
export const SWITCH = 1 / 30;

/** In [a, b] of a loop of `loop` s, at T. */
export const within = (T, loop, a, b) => {
  const u = T - Math.floor(T / loop) * loop;
  return u >= a && u <= b;
};

/** The next of these starts in a loop of `loop` s after T, and (with a seed) the next blink. */
export const nextOf = (T, loop, starts, seed = null) => {
  const base = Math.floor(T / loop) * loop;
  const at = [...starts.map((a) => base + a), ...starts.map((a) => base + loop + a)].filter((t) => t > T);
  return Math.min(seed === null ? Infinity : blinkNext(T, seed).next, ...at);
};

/** A 2×2 map's inverse ([a, b, c, d] as CSS matrix's, x' = a x + c y, y' = b x + d y). */
const inverse = ([a, b, c, d]) => {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det];
};
/**
 * A part of the drawing on its own track (the app's character.js plays a held state's `tracks` on the elements marked
 * data-track="<part>" inside its drawing, aligned to its clock, as it plays `motion` on the drawing): { part, period, matrix(T) },
 * matrix(T) as CSS matrix's [a, b, c, d, e, f] in the drawing's units, about its ground point (VIEW's (0, 0)), like motion's.
 * still(M): a prop beside him (a box, a switch) held still while he breathes: the inverse of his motion, so the two cancel.
 * drifting(M, at): one that floats on its own (doze's cloud): still against his breath, then moved by at(T) = [dx, dy] (y up).
 * Its period is his motion's: at(T) repeats on a period dividing it.
 */
export const stillPart = (M, part = "still") => ({ part, period: M.motion.period, matrix: (T) => [...inverse(M.matrix(T)), 0, 0] });
export const driftingPart = (M, at, part) => ({
  part,
  period: M.motion.period,
  matrix: (T) => {
    const [a, b, c, d] = inverse(M.matrix(T)), [dx, dy] = at(T);
    // His motion's inverse after the drift (the drift happens in the scene, under his breath): inverse · translate(dx, -dy).
    return [a, b, c, d, a * dx + c * -dy, b * dx + d * -dy];
  },
});
/**
 * floatingPart(M, at, part, base): a part drawn once at its start (its corner at base = [x, y], y up) that rises, grows and fades on its own
 * (sleepy's z's): at(T) = { x, y, scale, opacity }, its corner's place and its size against the start's, and how much it shows. Still against
 * his breath, as the others. Its track gives opacity(T) beside matrix(T); the app plays both.
 */
export const floatingPart = (M, at, part, [bx, by]) => ({
  part,
  period: M.motion.period,
  matrix: (T) => {
    const [a, b, c, d] = inverse(M.matrix(T)), { x, y, scale: s } = at(T);
    // Its own move in the drawing's units (y down): scale s about its corner, then to (x, y): [s, 0, 0, s, x − s·bx, −y + s·by]. His motion's
    // inverse after it.
    const e = x - s * bx, f = -y + s * by;
    return [a * s, b * s, c * s, d * s, a * e + c * f, b * e + d * f];
  },
  opacity: (T) => at(T).opacity,
});
