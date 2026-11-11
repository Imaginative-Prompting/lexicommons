// Generated from the character's rig (08-lexicommons/docs/design/character/rig/inkdrop/idle-motion.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// Idle Tinta's continuous motion (lex-character, 7 Nov 2026; the director: "decoration shouldn't cost a learner's battery and memory 30
// times a second"): his breath, his sway and a slow lean, as linear maps about his ground point (VIEW's (0, 0)), so the app can play them
// on the compositor (a transform on his drawing) and draw only when something else changes: a blink, a glance, the shiver.
// tinta.js's idle draws with exactly these (its at(T) is rest + these), so a drawn frame and a frame on the compositor are the same pose.
//
// Each part is periodic, matrix(T) = matrix(T + period): [a, b, c, d] with x' = a x + c y, y' = b x + d y (svg units, y down), the
// convention of CSS matrix(a, b, c, d, 0, 0). Their periods are commensurate (2.6, 3.9 and 10.4 s), so all of it is ONE track repeating
// every 31.2 s (MOTION_PERIOD, motionAt): the app plays it as a single transform animation, replacing (an animation that adds to another
// runs on the main thread in Chrome, every frame: the cost this exists to take away). Fitted to the rig's own outline at 64 px (scratch/character/v-idle/fit.mjs):
//   squash: exactly inkdrop.js bodyXf's (x by 1 + 0.32 s, y by its inverse, about the ground), a leftover of 0.01 units;
//   belly:  the swell (±1% of the belly's radius) as a widening from the base, 1.22 × its change: a leftover of up to 1.3 units, the
//           swell being round where a widening is straight;
//   lean:   the whole body's turn and the spine's bend as one map: a leftover of up to 2.8 units at the curl's tip at the sway's widest
//           (0.07 rad), the bend reaching further at the tip than a linear map can.
// tests/idle-motion.mjs holds those bounds against the drawn frames.

export const SEED = 43;
export const K = 0.8;
/** The breath's period (s): alive()'s. */
export const BREATH = 2.6;
/** The sway's period (s): 1.5 breaths (it was 3.7 s, 0.05 · sin(1.7 T)). */
export const SWAY = 3.9;
/** The slow lean's period (s), 4 breaths: in place of alive()'s lean wobble, which is noise and has none. */
export const DRIFT = 10.4;
/** The whole motion repeats every 12 breaths. */
export const MOTION_PERIOD = 31.2;
/** How the belly's swell widens him: x by 1 + BELLY_WIDEN · (belly − 1). */
export const BELLY_WIDEN = 1.22;

/** The breath as a map: the squash s exactly (x by 1 + 0.32 s, y by its inverse) and the belly's swell as a widening. */
const breathOf = (belly, squash) => {
  const s = Math.max(-0.6, Math.min(0.8, squash));
  const sx = 1 + 0.32 * s, w = 1 + BELLY_WIDEN * (belly - 1);
  return [sx * w, 0, 0, 1 / sx];
};
/** a · b for maps [a, b, c, d] (x' = a x + c y, y' = b x + d y): b first, then a. */
const after = ([e, f, g, h], [a, b, c, d]) => [e * a + g * b, f * a + h * b, e * c + g * d, f * c + h * d];

/**
 * A held state's continuous motion as idle's is (the places' ready, counted and beside use it too: states-places.js): alive()'s breath at
 * the state's own seed and strength k (kit/acting.js), and, in place of alive()'s lean wobble (noise, with no period), a sway and a slow lean
 * on periods that divide MOTION_PERIOD, so the whole of it is one track the app plays on the compositor.
 *   seed, k:           alive()'s, for the breath (its belly and squash);
 *   sway, swayPeriod:  the sway's amplitude (rad) and period (s, dividing 31.2: 2.6, 3.9, 5.2, 7.8, 10.4, 15.6);
 *   drift, driftPhase: the slow lean's amplitude (rad) on DRIFT, and its phase.
 *   deep:              a slower, deeper breath on top ({ belly, squash, period }: doze's), its period dividing 31.2 too.
 * Gives { belly(T), squash(T), sway(T), drift(T), lean(T), breath(T), matrix(T), motion: { period, matrix } }.
 */
export function heldMotion({ seed, k, sway, swayPeriod = SWAY, drift, driftPhase = 1.1, deep = null }) {
  const divides = (p) => Number.isInteger(Math.round((MOTION_PERIOD / p) * 1e9) / 1e9);
  if (!divides(swayPeriod)) throw new Error(`heldMotion: a sway of ${swayPeriod} s doesn't divide ${MOTION_PERIOD} s`);
  if (deep && !divides(deep.period)) throw new Error(`heldMotion: a deep breath of ${deep.period} s doesn't divide ${MOTION_PERIOD} s`);
  const deepAt = (T) => (deep ? Math.sin((2 * Math.PI * T) / deep.period) : 0);
  const belly = (T) => (1 + 0.012 * k * Math.sin((2 * Math.PI * T) / BREATH + seed)) * (deep ? 1 + deep.belly * deepAt(T) : 1);
  const squash = (T) => 0.02 * k * Math.sin((2 * Math.PI * T) / BREATH + seed + 0.6) + (deep ? deep.squash * deepAt(T) : 0);
  const swayAt = (T) => sway * Math.sin((2 * Math.PI * T) / swayPeriod);
  const driftAt = (T) => drift * Math.sin((2 * Math.PI * T) / DRIFT + driftPhase);
  const lean = (T) => swayAt(T) + driftAt(T);
  const breath = (T) => breathOf(belly(T), squash(T));
  // The lean's map after the breath's (inkdrop.js bodyXf squashes, then turns): lean · breath.
  const matrix = (T) => after(leanMatrix(lean(T)), breath(T));
  return { belly, squash, sway: swayAt, drift: driftAt, lean, breath, matrix, motion: { period: MOTION_PERIOD, matrix } };
}

/** Idle's: the breath at SEED and K, a sway of 0.05 rad and a slow lean of 0.02. */
const IDLE = heldMotion({ seed: SEED, k: K, sway: 0.05, drift: 0.02 });
export const bellyAt = IDLE.belly;
export const squashAt = IDLE.squash;
export const swayAt = IDLE.sway;
export const driftAt = IDLE.drift;
/** His lean at T: the sway and the slow lean. */
export const leanAt = IDLE.lean;

/** The breath at T: the squash, exactly, and the belly's swell as a widening. */
export const breathMatrix = IDLE.breath;

/** A lean of L rad (+ to his right) as one map: the body's turn about the ground and the spine's bend. */
export function leanMatrix(L) {
  return [1 + 0.0679 * L, 0.3297 * L, -0.485 * L, 1 - 0.0461 * L];
}

/** The parts, each on its own period: { name, period, matrix(T) } (tests/idle-motion.mjs holds each one's period). */
export const PARTS = [
  { name: "breath", period: BREATH, matrix: breathMatrix },
  { name: "sway", period: SWAY, matrix: (T) => leanMatrix(swayAt(T)) },
  { name: "drift", period: DRIFT, matrix: (T) => leanMatrix(driftAt(T)) },
];

/** All of it at T: the breath, then the lean (the sway and the slow lean together, as tinta.js draws them): [a, b, c, d]. */
export const motionAt = IDLE.matrix;

/** What the app plays: one track, { period, matrix(T) }. */
export const IDLE_MOTION = IDLE.motion;
