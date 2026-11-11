// Generated from the character's rig (08-lexicommons/docs/design/character/rig/inkdrop/tinta.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// Tinta in the app: the character (the liquid drop, variation A) as the app draws it,
// state by state. The app's part (public/js/character/) asks this module for frames and stills; the art stays here.
//
// tinta({ palette, size, ground }) → { idle, right, wrong, loading, heart }, each:
//   frame(t, T)  SVG content at t seconds into the state (T: the running clock, for its breathing and blinks), in VIEW's
//                units; loops (idle, loading) take any t; one-shots (right, wrong, heart) last `dur`, then it's idle again,
//                and take a third, speechTrack's params when the app is speaking (its mouth says the words mid-reaction).
//                Idle takes a third, a gaze { look: [x, y] (-1..1, y up), weight (0..1) }: where something holds its eyes
//                (what you touch), blended over its own glances by weight, so handing them back never jumps
//   still()      its designed still, for Animations Off (never a frozen frame from the middle of a move)
// VIEW, VIEW_LOADING  the viewBox (x, y, width, height): the drop at rest fills it; a hop, thrown drops and splats draw
//                past it (the part takes no presses). Loading's box is wider to the right, for its ellipsis, with the
//                same origin and height, so the drop stays where it is.
// ground        false where it stands on something drawn (a lesson on Study's path): no puddle of itself under it, only its
//                wet foot where it meets what it stands on (a pose that is a puddle, lounging, keeps its own)
// detailFor(px)  the outline's detail for a box px tall (inkdrop.js `detail`, `points` and `compact`; the rig's README)
// More states come from states-retention.js (lex-retention's: lounge, sleepy, wave, rest, mended, page, box, shrug, off,
// doze) and states-places.js (the main tabs': ready, counted, peek, beside, scribble, catch, present): a held state is { loop: true, frame(t, T), still() }, a reaction { dur, frame(t, T, speak), still() }; the
// app's part tells them apart by that, so any state here works by name.
// pointing(n)   pointing at n clues in turn (a hint): { dur, frame(t, T, { targets, speak }) }, targets [[x, y], …] in
//                VIEW's units from its origin (y down, as on the screen), where they are now (they may still be moving)
// say(T, { params, loud })  Tinta speaking (the app's speech drivers): its idle breathing and sway, facing you, the mouth
//                at speechTrack's params (kit/speech.js) and a small bob with the sound's loudness (0–1)
// poke(state)   a poke on Tinta standing in `state` (poke.js: an act for the app's perform(), its pokes as its data), or null for
//                a state with no at(T) (it's busy). idle, ready, counted and beside give at(T).

import { MATERIALS, clipsFor } from "./liquid-clips.js";
import { drawDrop } from "./inkdrop.js";
import { compose, faceMix } from "./clips.js";
import { alive, keys, outBack } from "../kit/acting.js";
import { blinkAt, blinkNext, wobble } from "../kit/anim.js";
import { IDLE_MOTION, SEED as IDLE_SEED, K as IDLE_K, bellyAt, leanAt, squashAt } from "./idle-motion.js";
import { impactEnergy } from "../kit/liquid.js";
// States other sessions drafted on this rig (reviewed here, owned by the rig): lex-retention's Today and empty states.
import { states as retentionStates } from "./states-retention.js";
// The main tabs' places (lex-character): Today's streak spot, Study's peek, the AI tab, Explore's featured pack.
import { states as placeStates } from "./states-places.js";
// A poke, layered on the state it stands in (lex-character).
import { pokeAct } from "./poke.js";
import { hopToAct } from "./hop-to.js";

export const VIEW = [-64, -124, 128, 130];
export const VIEW_LOADING = [-64, -124, 164, 130];
export const STATES = ["idle", "right", "wrong", "loading", "heart"];

export function detailFor(px) {
  // The compact SVG (the outline written once) too: the same picture in ~40% of the markup, a frame at a time.
  if (px <= 56) return { detail: 6, points: 72, compact: true };
  if (px <= 100) return { detail: 4, points: 96, compact: true };
  if (px <= 200) return { detail: 3, points: 120, compact: true };
  return { detail: 2, points: 160, compact: true };
}

const A = MATERIALS.A;
const IDLE_PERIOD = 7.3;

export function tinta({ palette = "dark", size = 72, ground = true } = {}) {
  const sized = detailFor(size);
  // Standing on something drawn, it has no ground of its own: its material with no puddle, for every clip and state.
  const M = ground ? A : { ...A, puddle: 0 };
  let live = 0;
  let speaking = null;
  const reels = Object.fromEntries(clipsFor(M, { palette, ground: false, ...sized, aliveAt: () => live, speakAt: () => speaking }).map((c) => [c.name, c]));
  // Stills (Animations Off, the share card, the app icon, the splash's frames): smooth vectors, never ripply: a ripple reads
  // as ink moving, and on something still it's only a rough edge. Drawn at full detail, whatever the size: a still is
  // drawn once.
  const stills = Object.fromEntries(clipsFor(M, { palette, ground: false, aliveAt: () => 0, calm: true }).map((c) => [c.name, c]));
  // In motion it ripples only from what moves it (an impact: a shiver, a landing), settling to none at rest.
  const liquid = (t, impacts = [], slosh = [0, 0]) => ({ t, wave: M.waveK * impactEnergy(t, impacts), seed: M.seed, foot: M.foot, rim: true, puddle: M.puddle, slosh });
  const calm = { t: 0, wave: 0, seed: M.seed, foot: M.foot, rim: true, puddle: M.puddle, slosh: [0, 0] };
  const draw = (p) => drawDrop({ ...p, ...sized, curl: 1 + (p.curl ?? 0) }, palette);
  const drawStill = (p) => drawDrop({ ...p, compact: sized.compact, curl: 1 + (p.curl ?? 0) }, palette);
  const expression = (name) => faceMix(name, name, 0);
  /** A still from a clip (loading's, the heart's): the calm, full-detail copy, its life layer at rest. */
  const stillAt = (reel, t) => stills[reel].frame(t);
  // A reaction's frame; speak (speechTrack's params, or null): the app is speaking, so its mouth says the words.
  const at = (reel, t, T, speak = null) => {
    live = T;
    speaking = speak;
    const svg = reels[reel].frame(t);
    speaking = null;
    return svg;
  };

  // Idle, endless: it breathes, sways and blinks; every 7.3 s it glances left, then right, and shivers like liquid. A gaze (something
  // it's watching) takes its eyes over its own glances, by its weight. Its eyes drift a little too, moving only while they're shut (a
  // blink), so the drawing holds still between: the app plays the breath and the sway on the compositor (idle-motion.js, the same
  // numbers this draws with) and draws only for a blink, a glance or the shiver (rest, busy, next).
  const GLANCES = [[2.2, 2.45], [3.4, 3.65], [4.5, 4.75]];
  const SHIVER = 5.6;
  // The shiver's ripple (0.28 at its impact × waveK 2.8 × the ripple's three modes at their crest, 1 + 0.55 + 0.6 (kit/liquid.js
  // waveOutline): 1.69 units, decaying with 0.45 s) is drawn while it reaches a quarter of a pixel at this size or more: 0.33 s at 40 px,
  // 0.54 s at 64 px, 0.82 s at 120 px; after that, calm (none).
  const SHIVER_PEAK = 0.28 * M.waveK * (1 + 0.55 + 0.6), SEEN = (0.25 * 130) / size;
  const SHIVER_CALM = SHIVER_PEAK > SEEN ? 0.45 * Math.log(SHIVER_PEAK / SEEN) : 0;
  const phaseOf = (T) => T - Math.floor(T / IDLE_PERIOD) * IDLE_PERIOD;
  const glanceAt = (u) => keys(u, [[0, [0, 0]], [2.2, [0, 0]], [2.45, [-0.7, 0.1], outBack], [3.4, [-0.7, 0.1]], [3.65, [0.55, 0], outBack], [4.5, [0.55, 0]], [4.75, [0, 0], outBack]]);
  // The eyes' drift as it was when they last shut (0.05 s into a blink), held until they shut again.
  const eyesAt = (T) => {
    const { last } = blinkNext(T - 0.05 + 1e-9, IDLE_SEED);
    const t = last === null ? 0 : last + 0.05;
    return [0.12 * IDLE_K * wobble(t * 0.35, IDLE_SEED + 5), 0.06 * IDLE_K * wobble(t * 0.3, IDLE_SEED + 9)];
  };
  const lookAt = (T, gaze) => {
    let look = glanceAt(phaseOf(T));
    if (gaze?.weight > 0) look = [look[0] + (gaze.look[0] - look[0]) * gaze.weight, look[1] + (gaze.look[1] - look[1]) * gaze.weight];
    const eyes = eyesAt(T);
    return [look[0] + eyes[0], look[1] + eyes[1]];
  };
  const impactsAt = (T) => {
    const k = Math.floor(T / IDLE_PERIOD);
    return [{ t: (k - 1) * IDLE_PERIOD + SHIVER, e: 0.28 }, { t: k * IDLE_PERIOD + SHIVER, e: 0.28 }];
  };
  const calmAt = (T) => {
    const u = phaseOf(T);
    return u < SHIVER || u >= SHIVER + SHIVER_CALM;
  };
  const idleAt = (T, gaze = null) => {
    const pose = compose({ belly: bellyAt(T), squash: squashAt(T), lean: leanAt(T), blink: blinkAt(T, IDLE_SEED) }, { face: { look: lookAt(T, gaze) } });
    return { pose, liquid: liquid(T, impactsAt(T)), props: () => "" };
  };
  const idle = (T, gaze = null) => {
    const now = idleAt(T, gaze);
    return draw({ ...now.pose, liquid: now.liquid });
  };
  // Idle without its breath and sway, which the app plays on the compositor as idle-motion.js's maps: the drawing between blinks, glances
  // and shivers, the ripple calm (none) once the shiver has died away. rest(T) under motionAt(T) is idle(T) within the bounds
  // idle-motion.js gives.
  const idleRest = (T, gaze = null) => {
    const pose = compose({ blink: blinkAt(T, IDLE_SEED) }, { face: { look: lookAt(T, gaze) } });
    return draw({ ...pose, liquid: calmAt(T) ? calm : liquid(T, impactsAt(T)) });
  };
  // Whether idle at T shows what only a drawing can (a blink, a glance under way, the shiver's ripple), and when the next of them starts.
  const idleBusy = (T) => blinkAt(T, IDLE_SEED) > 0 || GLANCES.some(([a, b]) => phaseOf(T) >= a && phaseOf(T) <= b) || !calmAt(T);
  const idleNext = (T) => {
    const k = Math.floor(T / IDLE_PERIOD), base = k * IDLE_PERIOD;
    const starts = [...GLANCES.map(([a]) => base + a), ...(SHIVER_CALM > 0 ? [base + SHIVER] : []), base + IDLE_PERIOD + GLANCES[0][0]].filter((t) => t > T);
    return Math.min(blinkNext(T, IDLE_SEED).next, ...starts);
  };

  // Speaking: no glances or shivers while it talks; the loudness bobs it a little, as in the speaking reels.
  const say = (T, { params = null, loud = 0 } = {}) => {
    // Idle's own breath and lean (idle-motion.js), so the drawing taking over from idle on the compositor doesn't jump (no slosh either).
    const p = compose({ belly: bellyAt(T), squash: squashAt(T), lean: leanAt(T), blink: blinkAt(T, IDLE_SEED) }, { squash: -0.035 * loud, face: { look: [0, 0] } });
    if (params) p.face = { ...p.face, speak: params };
    return draw({ ...p, liquid: liquid(T, []) });
  };

  // Pointing at clues (a hint; lex-mascots' pass 2): facing them, it leans in and its curl stretches out like a pointing
  // arm, at each clue in turn with its eyes on it (a quick sweep between), then draws back and looks at you. It never
  // points at an answer: the app hands it only the clue words. A long arm, the body leaning in after it (a short spout
  // barely changes its outline at 64 px; turning the tip further folds the arm back onto its head).
  const pointing = (n) => {
    const LEAD = 0.15, REACH = 0.35, HOLD = 0.9, SWEEP = 0.3, BACK = 0.35, TAIL = 0.6;
    const count = Math.max(1, n);
    const end = LEAD + REACH + HOLD * count;
    const span = (x, a, d) => Math.min(1, Math.max(0, (x - a) / d));
    const ease = (u) => u * u * (3 - 2 * u);
    return {
      dur: end + BACK + TAIL,
      frame(t, T = t, { targets = [], speak = null } = {}) {
        const spots = targets.length ? targets : [[-60, 30]];
        const flip = spots[0][0] < 0;
        const reach = keys(t, [[0, 0], [LEAD, 0], [LEAD + REACH, 1, outBack], [end, 1], [end + BACK, 0]]);
        // Which clue now: each held, then a quick sweep to the next.
        const s = Math.max(0, (t - LEAD - REACH) / HOLD), k = Math.min(spots.length - 1, Math.floor(s));
        const next = spots[Math.min(spots.length - 1, k + 1)];
        const move = k + 1 < spots.length ? ease(span(s - k, 1 - SWEEP / HOLD, SWEEP / HOLD)) : 0;
        const at = [spots[k][0] + (next[0] - spots[k][0]) * move, spots[k][1] + (next[1] - spots[k][1]) * move];
        // Its eyes (about 45 units up): on the clue from just before it reaches until it draws back, then on you.
        const dx = at[0], dy = at[1] + 45, d = Math.hypot(dx, dy) || 1;
        const onClue = t > LEAD * 0.5 && t < end + BACK * 0.5;
        const look = onClue ? [((flip ? -dx : dx) / d) * 0.9, (-dy / d) * 0.8] : [0, 0];
        const pre = 0.16 * Math.sin(Math.PI * span(t, LEAD - 0.07, 0.2)); // a small gather before it reaches
        // The arm can't angle down to words below it (the tip turned past about -1 folds it onto its head): it reaches out
        // to the side and its eyes aim, the tip sweeping a little from clue to clue (lex-mascots' pass 2).
        const aim = spots.length > 1 ? (k + move) / (spots.length - 1) : 0;
        const arm = { tip: -(0.7 - 0.08 * aim) * reach, curl: -0.75 * reach, tipLen: 1 + 2.4 * reach, lean: 0.15 * reach, bend: 0.06 * reach, squash: pre };
        const p = compose(alive(T, 43, 0.8), arm, { face: { look } });
        if (speak) p.face = { ...p.face, speak };
        const t0 = T - t;
        return draw({ ...p, flip, liquid: liquid(T, [{ t: t0 + LEAD + REACH, e: 0.4 }, { t: t0 + end + BACK, e: 0.3 }]) });
      },
    };
  };

  // The drafted states join these, drawn with exactly what these draw with (a still from drawStill and calm).
  const ctx = { palette, sized, draw, drawStill, liquid, calm, compose, alive, keys, faceMix, outBack };
  const extra = retentionStates(ctx);
  const places = placeStates(ctx);

  const idleState = {
    loop: true,
    at: (T) => idleAt(T),
    frame: (t, T, gaze) => idle(t, gaze),
    still: () => drawStill({ liquid: calm }),
    // On the compositor (the app's character.js): the drawing without the breath and sway, when it must be drawn, and the motion.
    rest: (T, gaze) => idleRest(T, gaze),
    busy: idleBusy,
    next: idleNext,
    motion: IDLE_MOTION,
  };
  const held = { ...extra, ...places, idle: idleState };
  // A poke on the state it stands in (poke.js), or null for a state it's busy in (no at(T): scribbling, peeking…).
  const poke = (state) => (typeof held[state]?.at === "function" ? pokeAct(ctx, held[state]) : null);
  // The strip's hop to your new place (hop-to.js), from the stop he stood on into idle.
  const hopTo = () => hopToAct(ctx, idleState);

  return {
    ...extra,
    ...places,
    say,
    pointing,
    poke,
    hopTo,
    idle: idleState,
    right: { dur: 2.8, frame: (t, T = t, speak = null) => at("right", t, T, speak), still: () => drawStill({ ...expression("delighted"), liquid: calm }) },
    wrong: { dur: 3, frame: (t, T = t, speak = null) => at("wrong", t, T, speak), still: () => drawStill({ ...expression("curious"), liquid: calm }) },
    // Loading: three drops flicked from its tip become the ellipsis, dry away, and again.
    loading: { loop: true, dur: 3.6, frame: (t, T = t) => at("loading", t % 3.6, T), still: () => stillAt("loading", 2.5) },
    heart: { dur: 3.4, frame: (t, T = t, speak = null) => at("to-heart", t, T, speak), still: () => stillAt("to-heart", 1.6) },
  };
}

/**
 * A state's designed still as a whole SVG document (viewBox included), `size` px tall: for pictures drawn elsewhere
 * (the milestone share card draws it into its canvas). Loading's runs on to the right for its ellipsis.
 */
export function stillSvg(state = "idle", { palette = "dark", size = 400 } = {}) {
  const t = tinta({ palette, size });
  const view = state === "loading" ? VIEW_LOADING : VIEW;
  const w = Math.round((size * view[2]) / view[3]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${size}" viewBox="${view.join(" ")}">${t[state].still()}</svg>`;
}
