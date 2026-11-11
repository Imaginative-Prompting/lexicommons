// Generated from the character's rig (08-lexicommons/docs/design/character/rig/kit/anim.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// Time functions for character animation. Every one is a pure function of time (seconds), so any frame can be drawn
// on its own, in any order: the channel's first animation rule, and what lets the app jump to the end of an animation
// the moment someone presses something (the design system's motion rule 4).

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const inOut = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2; };
export const outCubic = (t) => 1 - (1 - clamp01(t)) ** 3;
export const inCubic = (t) => clamp01(t) ** 3;
export const inQuad = (t) => clamp01(t) ** 2;
export const outQuad = (t) => 1 - (1 - clamp01(t)) ** 2;
export const outBack = (t, k = 1.7) => { t = clamp01(t) - 1; return 1 + (k + 1) * t * t * t + k * t * t; };
export const linear = (t) => clamp01(t);

/**
 * A damped spring released at time 0, from 0 toward 1: its step response. `freq` in Hz, `damping` the ratio
 * (below 1 it overshoots and swings back). Before 0 it's 0.
 */
export function spring(t, freq = 2.2, damping = 0.45) {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * freq, z = damping;
  if (z >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}

/** A spring's swing alone: 0 at rest, starts at `kick` velocity-free displacement 1 and rings down to 0. */
export const ring = (t, freq = 2.2, damping = 0.35) => (t <= 0 ? 0 : 1 - spring(t, freq, damping));

/**
 * Keyframes: [[t, value, ease?], ...] sorted by t. The ease on a key shapes the segment that ends at it.
 * Holds the first value before and the last after. Values may be numbers or arrays of numbers.
 */
export function keys(t, ks) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i][0]) {
      const [t0, v0] = ks[i - 1], [t1, v1, ease = inOut] = ks[i];
      const u = ease((t - t0) / (t1 - t0 || 1));
      return Array.isArray(v0) ? v0.map((a, j) => lerp(a, v1[j], u)) : lerp(v0, v1, u);
    }
  }
  return ks[ks.length - 1][1];
}

/** Smooth 1D value noise in -1..1 (a hash per integer, smoothstepped), seeded. */
export function noise(t, seed = 0) {
  const h = (i) => { const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const i = Math.floor(t), f = t - i;
  return lerp(h(i), h(i + 1), smooth(f));
}

/** Layered noise, gentler: two octaves. */
export const wobble = (t, seed = 0) => 0.7 * noise(t, seed) + 0.3 * noise(t * 2.3, seed + 7);

/**
 * Lid closure for blinks at the given times: shut in 50 ms, held 30 ms, open in 80 ms (Ember's timing).
 * Returns 0 (open) .. 1 (shut).
 */
export function blinks(t, times, shut = 0.05, hold = 0.03, open = 0.08) {
  let v = 0;
  for (const b of times) {
    const u = t - b;
    if (u < 0 || u > shut + hold + open) continue;
    v = Math.max(v, u < shut ? inQuad(u / shut) : u < shut + hold ? 1 : 1 - outQuad((u - shut - hold) / open));
  }
  return v;
}

/** Blink times every 2.5–5 s from a seed, between t0 and t1 (deterministic). */
export function blinkTimes(t0, t1, seed = 1) {
  const out = [];
  let t = t0 + 0.8, i = 0;
  while (t < t1) { out.push(t); t += 2.5 + 2.5 * (noise(i++ * 3.7, seed) * 0.5 + 0.5); }
  return out;
}

// blinkTimes(-1, …)'s sequence per seed, grown as far as a clock has reached: the same starts, summed in the same order.
const BLINK_RUNS = new Map();
/**
 * The blink at t (0 open … 1 shut) on blinkTimes(-1, ∞, seed)'s starts, for as long as the clock runs: blinks(t,
 * blinkTimes(-1, 60, seed)) to the bit before 60 s, where that list ended (and the app's idle, on the page's clock,
 * stopped blinking a minute in). Blinks are 2.5 s apart at least, so only the last one started can be under way.
 */
export function blinkAt(t, seed = 1, shut = 0.05, hold = 0.03, open = 0.08) {
  let run = BLINK_RUNS.get(seed);
  if (!run) BLINK_RUNS.set(seed, (run = { starts: [], next: -1 + 0.8, i: 0 }));
  while (run.next <= t) {
    run.starts.push(run.next);
    run.next += 2.5 + 2.5 * (noise(run.i++ * 3.7, seed) * 0.5 + 0.5);
  }
  const { starts } = run;
  let lo = 0, hi = starts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return 0;
  const u = t - starts[lo - 1];
  if (u < 0 || u > shut + hold + open) return 0;
  return Math.max(0, u < shut ? inQuad(u / shut) : u < shut + hold ? 1 : 1 - outQuad((u - shut - hold) / open));
}

/**
 * When the blink at or after t starts (blinkAt's own sequence for the seed), and when the one before it started (or null): an app
 * drawing Tinta only while something changes (his idle on the compositor) sleeps until the next one.
 */
export function blinkNext(t, seed = 1) {
  blinkAt(t, seed); // the run grown past t
  const run = BLINK_RUNS.get(seed);
  const { starts } = run;
  let lo = 0, hi = starts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return { next: lo < starts.length ? starts[lo] : run.next, last: lo > 0 ? starts[lo - 1] : null };
}
/** How long a blink lasts (blinkAt's shut + hold + open). */
export const BLINK_LENGTH = 0.05 + 0.03 + 0.08;

/** The window of an action: 0 before t0, 0..1 through it, 1 after. */
export const span = (t, t0, dur) => clamp01((t - t0) / dur);
