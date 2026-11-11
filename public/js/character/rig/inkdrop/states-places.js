// Generated from the character's rig (08-lexicommons/docs/design/character/rig/inkdrop/states-places.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// Tinta's states for the app's main tabs (lex-character, 2 Nov 2026): the character on each of them, doing what suits that
// tab. One pose and one act per place, never the idle everywhere:
//   ready      Today, by the streak, before today counts: a drip of ink hangs from its curl, swells nearly to falling now
//              and then and is snapped back up; the drip it throws into today's square (today-throw.js) once something's
//              finished
//   counted    Today, once today counts: it sits back, content, eyes on the strip, a small happy bounce now and then
//   peek       Study: it peeks over the top edge of the quick session's card, sunk behind it (everything below EDGE is
//              clipped: the card's edge), ducking and popping back up, looking round
//   beside     the AI tab, beside your AI: it listens, eyes on your AI's name, nodding along
//   scribble   the AI tab, while your AI is working: it scribbles busily on a little pad, line after line, a page torn
//              off and again
//   catch      the AI tab, when the work arrives (a reaction): it looks up, hops and catches the stack that drops in,
//              holds it up, delighted, and puts it away
//   present    Explore, by the featured pack: its curl held out like a showing hand, a little flourish, a bow
//
// states(ctx) as states-retention.js: ctx is what tinta.js draws with ({ palette, sized, draw, drawStill, liquid, calm,
// compose, alive, keys, faceMix, outBack }). A held state is { loop: true, frame(t, T), still() }; a reaction is { dur,
// frame(t, T, speak), still() }. Every still() is its designed still (Animations Off), smooth vectors at full detail.
// ready, counted and beside also give at(T): { pose, liquid, props(pose, keep, moved), under }, their pose at T for an act to blend
// into or layer on (Today's throw, a poke: poke.js); props are drawn over the drop, or under it with under: true (ready's drip;
// keep 0..1 draws it up into him).
// Units: the drop's (it stands on y = 0, ~118 tall, y up; SVG content is drawn with y down, as drawDrop does).

import { inkPalette, tipEnd } from "./inkdrop.js";
import { f2, polyPath, smoothPath } from "../kit/geom.js";
import { compose } from "./clips.js";
import { alive, hop, ring, smooth, span } from "../kit/acting.js";
import { blinkAt } from "../kit/anim.js";
import { heldMotion } from "./idle-motion.js";
import { SWITCH, breathing, heldEyes, nextOf, within } from "./held.js";

const TAU = 2 * Math.PI;
// peek's clip ids: one per rig (states() runs once a tinta()), so each Tinta's is its own and the same in every frame.
let clips = 0;

/** The card edge `peek` sits behind, in its units up from its ground (the part lines it up with the card's top edge). */
export const PEEK_EDGE = 16;

/** A stroked line of ink through points (y up), round ends. */
const inkLine = (pts, color, width, opacity = 1) =>
  pts.length < 2 ? "" : `<path d="${polyPath(pts, false)}" fill="none" stroke="${color}" stroke-width="${f2(width)}" stroke-linecap="round" stroke-linejoin="round"${opacity < 1 ? ` opacity="${f2(opacity)}"` : ""}/>`;
/** A rounded rectangle (y up), corner radius r, turned by `angle` (rad) about its middle. */
const roundRect = (x0, y0, x1, y1, r, fill, stroke, width = 1.4, angle = 0, opacity = 1) => {
  const turn = angle ? ` transform="rotate(${f2((-angle * 180) / Math.PI)} ${f2((x0 + x1) / 2)} ${f2(-(y0 + y1) / 2)})"` : "";
  return `<rect x="${f2(x0)}" y="${f2(-y1)}" width="${f2(x1 - x0)}" height="${f2(y1 - y0)}" rx="${f2(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${f2(width)}"${turn}${opacity < 1 ? ` opacity="${f2(opacity)}"` : ""}/>`;
};
/** A bead of ink (y up) with its glint. */
const bead = (c, r, ink) =>
  `<circle cx="${f2(c[0])}" cy="${f2(-c[1])}" r="${f2(r)}" fill="${ink.body}"/><circle cx="${f2(c[0] - r * 0.3)}" cy="${f2(-c[1] - r * 0.35)}" r="${f2(r * 0.3)}" fill="${ink.light}"/>`;

const DRIP_R = 6.4;
/**
 * A drip of ink hanging from the curl's end bulb ({ at, r } from tipEnd, y up): a neck narrowing from the bulb's
 * underside to a round drop `len` below it, radius `r`, swung `sway` units sideways. Drawn under the drop (the bulb
 * covers the neck's top).
 */
export function drip(end, len, r, sway, ink) {
  if (r < 0.4) return "";
  const { at, r: R } = end;
  const top = [at[0], at[1] - R * 0.55], c = [at[0] + sway, at[1] - R - len - r * 0.6];
  const neck = Math.max(1.1, r * 0.32);
  const pts = [
    [top[0] - R * 0.5, top[1] + 2], [top[0] - R * 0.32, top[1] - 2], [c[0] - neck, c[1] + r * 1.15],
    ...Array.from({ length: 13 }, (_, i) => { const a = Math.PI * (0.62 + (1.76 * i) / 12); return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]; }),
    [c[0] + neck, c[1] + r * 1.15], [top[0] + R * 0.32, top[1] - 2], [top[0] + R * 0.5, top[1] + 2],
  ];
  return `<path d="${smoothPath(pts, true)}" fill="${ink.body}"/><circle cx="${f2(c[0] - r * 0.32)}" cy="${f2(-c[1] - r * 0.3)}" r="${f2(r * 0.26)}" fill="${ink.light}"/>`;
}

// Where its curl ends for a pose, at full detail (used for the places' props: the pen's lines, the stack it holds).
const tipOf = (pose) => tipEnd({ ...pose, detail: 2, curl: 1 + (pose.curl ?? 0) }).at;

// ---- the pad it scribbles on (scribble): three lines of quick zigzags across the pad, its curl's end the pen --------
// The pen's pose for line k at u (0..1 across) with its zigzag; sampled once (tipEnd builds the whole outline: too slow
// for every frame), the curl drawn at the same pose, so the line ends exactly at its tip.
const SCRIBBLE_ZIGS = 5;
const PEN = (k, u) => ({ x: -14, lean: 0.12, tip: -0.9 + 0.36 * u - 0.12 * k + 0.07 * Math.sin(TAU * SCRIBBLE_ZIGS * u), curl: -0.55 + 0.3 * u, tipLen: 2.1 + 0.2 * u });
let PEN_LINES = null;
const penLines = () => (PEN_LINES ??= [0, 1, 2].map((k) => Array.from({ length: 41 }, (_, i) => tipOf(PEN(k, i / 40)))));
const PAD = [20, 62, 60, 96]; // x0, y0, x1, y1: a little pad of paper at its right, under the pen

// ---- the loops it writes while something loads (writing): its curl's end circles once every LOOP seconds while the
// page under it moves away to its right at PAGE_V, so the line it leaves is a run of cursive loops, drying as it goes.
// The end's path round one loop is sampled once (as the pen's above); the curl is drawn at the same pose.
const LOOP = 0.6, PAGE_V = 24, TRAIL = 1.5; // seconds a loop; units a second; seconds of line kept
const PEN_LOOP = (phi) => ({ x: -20, lean: 0.1, bend: 0.04 * Math.sin(phi), tip: -0.92 + 0.3 * Math.sin(phi), curl: -0.5 + 0.14 * Math.cos(phi), tipLen: 2.05 + 0.32 * Math.cos(phi) });
let LOOP_TIPS = null;
const loopTips = () => (LOOP_TIPS ??= Array.from({ length: 48 }, (_, i) => tipOf(PEN_LOOP((TAU * i) / 48))));
/** Where its curl's end is at phase phi (radians), between the samples. */
const loopTipAt = (phi) => {
  const tips = loopTips(), u = (((phi / TAU) % 1) + 1) % 1 * tips.length, i = Math.floor(u), k = u - i;
  const a = tips[i % tips.length], b = tips[(i + 1) % tips.length];
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
};
// ---- the magnifier it looks things up with (lookup): its curl grips the handle, the glass swept along a line ----------
// s: where along the line (-1 its left end, 1 its right), n: how near it has brought it to peer (0..1). The curl's end
// round the sweep and the peer, sampled once (as the pen's); the curl drawn at the same pose. The handle is a straight
// rod at its own angle (ROD: 40° below level, where the curl's end runs about level), held at its end by the curl, so
// the silhouette is a magnifier.
const LOOK_POSE = (s, n) => ({ x: -22, lean: 0.1 + 0.08 * n, bend: 0.04 * n, tip: -0.6 + 0.16 * s - 0.05 * n, curl: -0.7 + 0.06 * s, tipLen: 1.8 - 0.12 * n });
const LENS_R = 15, SHAFT = 14;
const ROD = [Math.cos(-0.7), Math.sin(-0.7)];
let LOOK_ENDS = null;
const lookEnds = () => (LOOK_ENDS ??= [0, 1].map((n) => Array.from({ length: 17 }, (_, i) => tipEnd({ ...LOOK_POSE(-1 + i / 8, n), detail: 2, curl: 1 + LOOK_POSE(-1 + i / 8, n).curl }))));
/** The magnifier's parts for the curl's end and how near it's held: the butt, where the rod meets the rim, the glass. */
const magnifier = (end, near) => {
  const R = LENS_R * (1 + 0.12 * near), at = end.at, reach = end.r * 0.6 + SHAFT;
  return {
    R,
    butt: at, // held at its end: the curl's end covers it
    neck: [at[0] + ROD[0] * reach, at[1] + ROD[1] * reach],
    c: [at[0] + ROD[0] * (reach + R), at[1] + ROD[1] * (reach + R)],
  };
};
/** The curl's end ({ at, dir, r }) at s, n, between the samples. */
const lookEndAt = (s, n) => {
  const u = ((Math.max(-1, Math.min(1, s)) + 1) / 2) * 16, i = Math.min(15, Math.floor(u)), k = u - i;
  const mix = (a, b, w) => a.map((v, j) => v + (b[j] - v) * w);
  const row = (m) => { const a = lookEnds()[m][i], b = lookEnds()[m][i + 1]; return { at: mix(a.at, b.at, k), dir: mix(a.dir, b.dir, k), r: a.r }; };
  const a = row(0), b = row(1);
  return { at: mix(a.at, b.at, n), dir: mix(a.dir, b.dir, n), r: a.r };
};

/** The line of loops written up to T: its points, oldest last, each with its age (s), carried right with the page. */
const loopLine = (T, span = TRAIL) =>
  Array.from({ length: Math.round(span * 60) + 1 }, (_, i) => {
    const age = i / 60, [x, y] = loopTipAt((TAU * (T - age)) / LOOP);
    return { q: [x + PAGE_V * age, y - 3], age };
  });

// ---- On the compositor (lex-character, 7 Nov 2026), as idle is (idle-motion.js) ----------------------------------------------
// ready, counted and beside breathe, sway and lean as one transform the app plays on the compositor (heldMotion: alive()'s breath at the
// state's own seed and strength, a sway and a slow lean on periods that divide 31.2 s), and their drawing changes only for what a
// transform can't do: a blink, their eyes, a nod, the drip, a bounce. Each gives rest(T) (the drawing without the breath), busy(T)
// (something only a drawing shows is under way) and next(T) (when the next one starts); at(T), for the acts that start or end in it
// (a poke, Today's throw, Home's AI card), is rest(T) with the breath drawn in, so a drawn frame and one on the compositor are the same
// pose. tests/held-motion.mjs holds each one's rest under its motion against its at(T), its quiet stretches and its next().
export const READY_MOTION = heldMotion({ seed: 101, k: 0.6, sway: 0.011, swayPeriod: 7.8, drift: 0.007 });
export const COUNTED_MOTION = heldMotion({ seed: 103, k: 0.5, sway: 0.035, swayPeriod: 5.2, drift: 0.006 });
export const BESIDE_MOTION = heldMotion({ seed: 109, k: 0.5, sway: 0.009, swayPeriod: 7.8, drift: 0.006 });
/** What alive() gave each state's acts (Today's throw from ready, Home's AI card from beside): its breath as its motion plays it, its blink
 * and its eyes' held drift, so an act starts and ends in exactly the pose the compositor shows. */
export const readyLife = (T) => compose(breathing(READY_MOTION, T), { blink: blinkAt(T, 101), face: { look: heldEyes(T, 101, 0.6) } });
export const besideLife = (T) => compose(breathing(BESIDE_MOTION, T), { blink: blinkAt(T, 109), face: { look: heldEyes(T, 109, 0.5) } });

// ---- Today's two poses, shared with the throw (today-throw.js starts from ready's moment and ends in counted's) -------
export const READY = { squash: 0.03, tip: 0.04, face: { look: [0.15, -0.1], bottom: [0.22, 0.22], mouth: { type: "smile", smile: 1.15, w: 10 } } };
/** Where its curl's end bulb is in the ready pose ({ at, r }, full detail): the drip hangs from it. */
export const readyEnd = () => (readyEnd.end ??= tipEnd({ ...READY, detail: 2, curl: 1 + (READY.curl ?? 0) }));
const DRIP_LOOP = 7.2, SWELL = 3.0;
/**
 * Ready at T: { pose, drip: [len, r, sway], impacts }. The drip's length below the bulb: resting 5 (a slow sway),
 * swelling to 15 (0.9 s), snapped up (0.12 s), regrown (1.1 s); its eyes follow it down, then back to you.
 */
export function readyAt(T, { breath = true } = {}) {
  const u = T % DRIP_LOOP, s = u - SWELL;
  // Between swells the drip hangs still (its breath and lean are the body's, on the compositor); the swell is drawn.
  let len = 5, r = DRIP_R;
  if (s >= 0 && s < 0.9) { const k = smooth(s / 0.9); len += 10 * k; r += 1.2 * k; }
  else if (s >= 0.9 && s < 1.02) { const k = (s - 0.9) / 0.12; len = 15 * (1 - k); r = (DRIP_R + 1.2) * (1 - k); }
  else if (s >= 1.02 && s < 2.12) { const k = smooth((s - 1.02) / 1.1); len *= k; r *= k; }
  const watching = s > 0.1 && s < 1.0;
  const snapped = s >= 0.9 && s < 1.6;
  const pose = compose(READY, breath ? breathing(READY_MOTION, T) : null, { blink: blinkAt(T, 101), face: { look: heldEyes(T, 101, 0.6) } }, {
    tip: snapped ? 0.08 * ring(s - 0.9, 3, 0.3) : 0,
    face: watching ? { look: [0.55, -0.85], top: [0, 0], mouth: { type: "o", open: 0.3, w: 7 } } : snapped ? { look: [0, 0], bottom: [0.35, 0.35] } : {},
  });
  return { pose, drip: [len, r, 0], impacts: s >= 0.9 ? [{ t: T - (s - 0.9), e: 0.35 }] : [] };
}
/** Ready draws only while its drip swells, snaps and regrows (and its ripple dies away), and to blink. */
const READY_BUSY = [SWELL, SWELL + 2.12];
export const readyBusy = (T) => blinkAt(T, 101) > 0 || within(T, DRIP_LOOP, ...READY_BUSY);
export const readyNext = (T) => nextOf(T, DRIP_LOOP, [SWELL], 101);

/** beside's pose (the AI tab, and Home's AI card): turned a little toward your AI (to its left), listening. */
export const BESIDE = { lean: -0.07, tip: 0.08, face: { look: [-0.6, 0.05], top: [0.04, 0.04], bottom: [0.22, 0.22], brows: { show: 1, raise: [0.3, 0.3], tilt: [0, 0] }, mouth: { type: "smile", smile: 1.1, w: 9 } } };
export const COUNTED = { squash: 0.1, lean: -0.06, bend: -0.03, tip: 0.1, face: { look: [-0.55, -0.3], bottom: [0.4, 0.4], mouth: { type: "smile", smile: 1.35, w: 12 } } };
/** Counted at T: { pose, impacts, slosh }: sitting back, content, a small happy bounce every 5.4 s. */
export function countedAt(T, { breath = true } = {}) {
  const u = T % 5.4;
  // The bounce's ring is settled to a few ten-thousandths by the end of its window, and held at none after it (so the drawing holds still).
  const bounce = u > 3.2 && u < COUNTED_BUSY[1] ? 0.07 * ring(u - 3.2, 2.6, 0.32) : 0;
  const happy = u > 3.15 && u < 3.9;
  // Its sway is its motion's (5.2 s, on the compositor; it was 4.6 s); the highlight no longer sloshes with it, as idle's doesn't.
  const pose = compose(COUNTED, breath ? breathing(COUNTED_MOTION, T) : null, { blink: blinkAt(T, 103), face: { look: heldEyes(T, 103, 0.5) } }, { squash: bounce, face: happy ? { closed: ["happy", "happy"] } : {} });
  return { pose, impacts: u > 3.2 && u < COUNTED_BUSY[1] ? [{ t: T - (u - 3.2), e: 0.18 }] : [], slosh: [0, 0] };
}
/** Counted draws only for its bounce and happy eyes (its ring settled by 4.3 s of 5.4, its ripple sooner), and to blink. */
const COUNTED_BUSY = [3.15, 4.3];
export const countedBusy = (T) => blinkAt(T, 103) > 0 || within(T, 5.4, ...COUNTED_BUSY);
export const countedNext = (T) => nextOf(T, 5.4, [COUNTED_BUSY[0]], 103);

/** beside at T (the AI tab), with or without its breath: { pose }. Nods at 1.0 and 1.45 s of 6.8, a look at you 3.1–4.6, thinking 5.0–6.2. */
export function besideAt(T, { breath = true } = {}) {
  const u = T % 6.8;
  const nod = [1.0, 1.45].reduce((n, at) => n + (u > at && u < at + 0.32 ? Math.sin(Math.PI * ((u - at) / 0.32)) : 0), 0);
  const atYou = u > 3.1 && u < 4.6;
  const think = u > 5.0 && u < 6.2 ? Math.sin(Math.PI * ((u - 5.0) / 1.2)) : 0;
  const pose = compose(BESIDE, breath ? breathing(BESIDE_MOTION, T) : null, { blink: blinkAt(T, 109), face: { look: heldEyes(T, 109, 0.5) } }, {
    squash: 0.05 * nod,
    bend: -0.07 * nod,
    tip: 0.16 * think,
    face: atYou ? { look: [0.6, -0.05], bottom: [0.3, 0.3], mouth: { type: "smile", smile: 1.2, w: 10 } } : think > 0.3 ? { look: [0.25, 0.4] } : {},
  });
  return { pose };
}
/** beside draws only for its nods and its thinking, the moments its look changes, and to blink. */
const BESIDE_BUSY = [[1.0, 1.32], [1.45, 1.77], [3.1, 3.1 + SWITCH], [4.6, 4.6 + SWITCH], [5.0, 6.2]];
export const besideBusy = (T) => blinkAt(T, 109) > 0 || BESIDE_BUSY.some(([a, b]) => within(T, 6.8, a, b));
export const besideNext = (T) => nextOf(T, 6.8, BESIDE_BUSY.map(([a]) => a), 109);

export function states(ctx) {
  const { palette, sized = {}, draw, drawStill, liquid, calm, compose, alive, keys, faceMix, outBack } = ctx;
  // A palette's name, or the palette itself (the app's static frames draw with stand-in colors: splash/app-frames.mjs).
  const ink = inkPalette(palette);
  const face = (name) => faceMix(name, name, 0).face;

  // ---------- ready: a drip of ink hanging from its curl, ready (Today, before today counts) ----------
  // A drip hangs from its curl's end, swaying a little; now and then it swells and stretches nearly to falling, its eyes
  // following it down, and it snaps it back up into itself with a shiver (the drip grows back). That drip is what it
  // throws into today's square (today-throw.js). Calm and playful; never waiting at you.
  const ready = {
    loop: true,
    // Its pose at T, for an act layered on it (a poke: poke.js): { pose, liquid, props(pose, keep, moved), under }, its drip the prop,
    // drawn under the drop (under: true). keep 0..1 draws it up into the bulb; moved ({ x, air, squash }, the act's own) carries it
    // with him, as the drip hangs where READY's bulb is whatever his breathing does.
    at(T) {
      const { pose, drip: [len, r, sway], impacts } = readyAt(T);
      const props = (_pose, keep = 1, moved = null) => {
        const svg = drip(readyEnd(), len * keep, r * keep, sway, ink);
        const { x = 0, air = 0, squash = 0 } = moved ?? {};
        if (!svg || (Math.abs(x) < 1e-4 && Math.abs(air) < 1e-4 && Math.abs(squash) < 1e-4)) return svg;
        const sx = 1 + 0.32 * squash;
        return `<g transform="translate(${f2(x)} ${f2(-air)}) scale(${f2(sx)} ${f2(1 / sx)})">${svg}</g>`;
      };
      return { pose, liquid: liquid(T, impacts), props, under: true };
    },
    frame(t, T = t) {
      const { pose, drip: [len, r, sway], impacts } = readyAt(T);
      return drip(readyEnd(), len, r, sway, ink) + draw({ ...pose, liquid: liquid(T, impacts) });
    },
    still: () => drip(readyEnd(), 5, DRIP_R, 0, ink) + drawStill({ ...compose(READY), liquid: calm }),
    // On the compositor: without its breath, the ripple calm between swells.
    rest(T) {
      const { pose, drip: [len, r, sway], impacts } = readyAt(T, { breath: false });
      return drip(readyEnd(), len, r, sway, ink) + draw({ ...pose, liquid: within(T, DRIP_LOOP, ...READY_BUSY) ? liquid(T, impacts) : calm });
    },
    busy: readyBusy,
    next: readyNext,
    motion: READY_MOTION.motion,
  };

  // ---------- counted: today counts (Today, after its first finished thing) ----------
  // It sits back, settled and content, eyes on the strip; every few seconds a small happy bounce, eyes shut happily.
  const counted = {
    loop: true,
    // Its pose at T, for an act to end in (Today's throw): { pose, liquid, props(pose) } (no props of its own).
    at(T) {
      const { pose, impacts, slosh } = countedAt(T);
      return { pose, liquid: liquid(T, impacts, slosh), props: () => "" };
    },
    frame(t, T = t) {
      const now = counted.at(T);
      return draw({ ...now.pose, liquid: now.liquid }) + now.props(now.pose);
    },
    still: () => drawStill({ ...compose(COUNTED), liquid: calm }),
    rest(T) {
      const { pose, impacts } = countedAt(T, { breath: false });
      return draw({ ...pose, liquid: within(T, 5.4, ...COUNTED_BUSY) ? liquid(T, impacts) : calm });
    },
    busy: countedBusy,
    next: countedNext,
    motion: COUNTED_MOTION.motion,
  };

  // ---------- peek: over the edge of the quick session's card (Study) ----------
  // Sunk behind the card, its eyes just over the edge: it peers at the card (down, at Start), spots you and pops up a
  // little, ducks down out of sight to its eyes, pops back up with a jelly, and looks along the edge one way and the
  // other. EDGE is the card's top edge in its units: the part places it there, and everything below is the card's.
  const EDGE = PEEK_EDGE;
  const PEEK = { y: -3, squash: 0.06, lean: 0.03, tip: 0.12, face: { y: 6, look: [-0.35, -0.55], top: [0.12, 0.12], mouth: { type: "smile", smile: 0.9, w: 8 } } };
  // Its clip, one id for this Tinta's every frame (a new id a frame made every drawing's markup new, the same picture or not).
  const PEEK_CLIP = `pk${clips++}`;
  const behind = (svg) => `<clipPath id="${PEEK_CLIP}"><rect x="-400" y="-600" width="800" height="${f2(600 - EDGE)}"/></clipPath><g clip-path="url(#${PEEK_CLIP})">${svg}</g>`;
  const PEEK_LOOP = 7.6;
  const peek = {
    loop: true,
    frame(t, T = t) {
      const u = T % PEEK_LOOP;
      // Up and down: spots you (a small pop at 1.6), ducks (3.9–4.3) and pops back up (4.3) with a jelly.
      const pop = u > 1.6 && u < 3.6 ? 4 * smooth(span(u, 1.6, 0.18)) * (1 - smooth(span(u, 3.2, 0.4))) : 0;
      const duck = u > 3.7 && u < 4.35 ? -16 * Math.sin((Math.PI / 2) * smooth(span(u, 3.7, 0.25))) * (1 - smooth(span(u, 4.15, 0.2))) : 0;
      const jelly = u > 4.3 ? 0.12 * ring(u - 4.3, 3, 0.3) : 0;
      let look = [-0.35, -0.55];
      if (u > 1.6 && u < 3.4) look = [0, 0.05];
      else if (u > 4.9 && u < 5.7) look = [-0.85, 0.05];
      else if (u > 5.9 && u < 6.8) look = [0.85, 0.05];
      const spotted = u > 1.65 && u < 3.4;
      const pose = compose(PEEK, alive(T, 107, 0.5), {
        y: pop + duck,
        squash: jelly + (duck < -2 ? 0.08 : 0),
        face: { look: [look[0] + 0.35, look[1] + 0.55], ...(spotted ? { bottom: [0.3, 0.3], mouth: { type: "smile", smile: 1.3, w: 11 } } : {}), ...(duck < -6 ? { top: [0.35, 0.35] } : {}) },
      });
      return behind(draw({ ...pose, liquid: liquid(T, u > 4.3 ? [{ t: T - (u - 4.3), e: 0.3 }] : []) }));
    },
    still: () => behind(drawStill({ ...compose(PEEK, { face: { look: [0.35, 0.6] } }), liquid: calm })),
  };

  // ---------- beside: beside your AI (the AI tab), listening ----------
  // Turned a little toward your AI's name (to its left), it listens and nods along, glances at you, and tilts its curl
  // as if thinking it over.
  const beside = {
    loop: true,
    // Its pose at T, for an act to end in (Home's AI card reads your AI's line: read-line.js): { pose, liquid, props(pose) }.
    at(T) {
      return { pose: besideAt(T).pose, liquid: liquid(T), props: () => "" };
    },
    frame(t, T = t) {
      const now = beside.at(T);
      return draw({ ...now.pose, liquid: now.liquid });
    },
    still: () => drawStill({ ...compose(BESIDE), liquid: calm }),
    rest: (T) => draw({ ...besideAt(T, { breath: false }).pose, liquid: calm }),
    busy: besideBusy,
    next: besideNext,
    motion: BESIDE_MOTION.motion,
  };

  // ---------- scribble: your AI is working (the AI tab) ----------
  // A little pad at its right; its curl scribbles three lines of quick zigzags across it, eyes on the pen, concentrating,
  // its body bobbing with the strokes; then it tears the page off (the lines go with a flick) and starts the next.
  const LINE = 0.62, BACK = 0.14, PAGE = 3 * (LINE + BACK), TEAR = 0.45, SCRIBBLE_LOOP = PAGE + TEAR;
  const pad = (lines, lift = 0, opacity = 1) => {
    const [x0, y0, x1, y1] = PAD;
    let s = roundRect(x0, y0 + lift, x1, y1 + lift, 3, ink.paper, ink.shade, 1.3, lift * 0.01, opacity);
    s += inkLine([[x0 + 2, y1 + lift - 4], [x1 - 2, y1 + lift - 4]], ink.shade, 0.9, 0.35 * opacity); // the pad's top binding
    return s + lines;
  };
  const written = (k, upTo, opacity = 1, dx = 0, dy = 0) => {
    const pts = penLines()[k];
    const n = Math.max(2, Math.round(upTo * 40) + 1);
    return inkLine(pts.slice(0, n).map(([x, y]) => [x + dx, y + dy]), ink.shade, 2.2, opacity);
  };
  const SCRIBBLE_FACE = { look: [0.75, 0.35], top: [0.18, 0.18], bottom: [0.12, 0.12], mouth: { type: "o", open: 0.18, w: 6 } };
  const scribble = {
    loop: true,
    frame(t, T = t) {
      const u = T % SCRIBBLE_LOOP;
      let lines = "", pose;
      if (u < PAGE) {
        const k = Math.min(2, Math.floor(u / (LINE + BACK))), v = u - k * (LINE + BACK);
        for (let j = 0; j < k; j++) lines += written(j, 1);
        const writing = v < LINE;
        const w = writing ? v / LINE : 1;
        if (writing) lines += written(k, w);
        else lines += written(k, 1);
        // Between lines, the pen goes back to the start of the next (a quick sweep left).
        const back = writing ? 0 : smooth((v - LINE) / BACK);
        const pen = writing ? PEN(k, w) : { ...PEN(k + 1 > 2 ? 2 : k + 1, 0), tip: PEN(k, 1).tip + (PEN(Math.min(2, k + 1), 0).tip - PEN(k, 1).tip) * back };
        const bob = writing ? 0.025 * Math.sin(TAU * SCRIBBLE_ZIGS * w) : 0;
        pose = compose(pen, alive(T, 113, 0.35), { squash: bob, face: SCRIBBLE_FACE });
      } else {
        // Tear: the full page lifts and flicks away to the upper right, fading; the pen lifts, a pleased look at you.
        const s = (u - PAGE) / TEAR;
        for (let j = 0; j < 3; j++) lines += written(j, 1, 1 - s, 30 * s, 10 * s);
        pose = compose(PEN(2, 1), alive(T, 113, 0.35), { tip: 0.2 * Math.sin(Math.PI * s), face: { ...face("content"), look: [0.2, 0.1] } });
        return roundRect(PAD[0], PAD[1], PAD[2], PAD[3], 3, ink.paper, ink.shade, 1.3) + roundRect(PAD[0] + 30 * s, PAD[1] + 10 * s, PAD[2] + 30 * s, PAD[3] + 10 * s, 3, ink.paper, ink.shade, 1.3, -0.4 * s, 1 - s) + lines + draw({ ...pose, liquid: liquid(T) });
      }
      return pad(lines) + draw({ ...pose, liquid: liquid(T) });
    },
    still: () => pad(written(0, 1) + written(1, 0.55)) + drawStill({ ...compose(PEN(1, 0.55), { face: SCRIBBLE_FACE }), liquid: calm }),
  };

  // ---------- catch: the work arrives (the AI tab), once ----------
  // It hears it coming and looks up; a small stack of pages drops in from above; it crouches, hops and catches it on its
  // raised curl, lands with a jelly, holds it up delighted, then lowers it and puts it away, back to listening.
  const CATCH_DUR = 2.3;
  const TRAY = { tip: 0.9, curl: -0.5, tipLen: 1.2 };
  const trayTip = () => (trayTip.at ??= tipOf(TRAY));
  const stack = (c, lean = 0, opacity = 1) =>
    [2, 1, 0].map((i) => roundRect(c[0] - 17 + i * 2, c[1] + i * 5.5, c[0] + 17 + i * 2, c[1] + 7 + i * 5.5, 1.6, ink.paper, ink.shade, 1.4, lean + (i - 1) * 0.07, opacity)).join("");
  const catchState = {
    dur: CATCH_DUR,
    frame(t, T = t, speak = null) {
      const h = hop(t, 0.5, { air: 0.36, h: 14, crouch: 0.22, land: 0.3 });
      const raise = smooth(span(t, 0.3, 0.25)) * (1 - smooth(span(t, 1.65, 0.4)));
      const look = t < 0.62 ? [0.1, 0.9] : t < 1.6 ? [0, 0.1] : [-0.4, 0];
      const delighted = t > 0.75 && t < 1.65;
      const p = compose(alive(T, 117, 0.5), { tip: TRAY.tip * raise, curl: TRAY.curl * raise, tipLen: 1 + (TRAY.tipLen - 1) * raise }, {
        squash: h.squash,
        bend: h.bend,
        face: delighted ? face("delighted") : t < 0.62 ? { ...face("surprised"), look } : { look },
      });
      if (speak) p.face = { ...p.face, speak };
      // The stack: falling on gravity from above until it meets the raised curl at the top of the hop (0.66 s), then
      // riding on it (with a little lag on the landing), then fading as it's put away.
      const at = trayTip();
      const rest = [at[0], at[1] + 7];
      const meet = 0.66;
      let c;
      if (t < meet) {
        const fall = Math.max(0, t - 0.12) / (meet - 0.12);
        c = [rest[0] + 4 * (1 - fall), rest[1] + h.air + 120 * (1 - fall * fall)];
      } else c = [rest[0] * raise + at[0] * (1 - raise), rest[1] * raise + (at[1] - 30) * (1 - raise) + h.air + 3 * ring(t - meet, 3, 0.3)];
      const fade = 1 - smooth(span(t, 1.75, 0.4));
      const pages = t > 0.12 && fade > 0.01 ? stack(c, 0.04 * Math.sin(TAU * 1.6 * Math.max(0, t - meet)) * (t > meet ? 1 : 0), fade) : "";
      return draw({ ...p, air: h.air, liquid: liquid(T, [{ t: T - t + 0.86, e: 0.35 }, { t: T - t + meet, e: 0.2 }]) }) + pages;
    },
    still: () => {
      const at = tipOf(TRAY);
      return drawStill({ ...compose(TRAY, { face: face("delighted") }), liquid: calm }) + stack([at[0], at[1] + 7]);
    },
  };

  // ---------- present: the featured pack (Explore) ----------
  // It sits at the card's top right, mirrored so its curl reaches to its left over the pack: like a host, it raises its
  // curl, sweeps it out over the title with an overshoot (the end pointing down at it) and looks at you, delighted; a
  // little flourish of the curl's end; a small bow; its eyes go to the pack and back. Now and then it draws the curl in
  // and presents again. Eyes aren't mirrored: "at the pack" is to the screen's left.
  const PRESENT = { lean: 0.06, bend: -0.03, tip: -1.0, curl: -0.45, tipLen: 2.4 };
  const PRESENT_FACE = { look: [0, 0], bottom: [0.3, 0.3], mouth: { type: "smile", smile: 1.3, w: 12 } };
  const PRESENT_LOOP = 9.2;
  const present = {
    loop: true,
    frame(t, T = t) {
      const u = T % PRESENT_LOOP;
      // Raised (0.2–0.45), swept out with an overshoot (0.45–0.85), held; drawn in again 8.4–8.9.
      const raise = u < 0.45 ? smooth(span(u, 0.15, 0.3)) : 0;
      const out = keys(u, [[0, 0], [0.45, 0], [0.85, 1, outBack], [8.4, 1], [8.9, 0]]);
      const flourish = u > 3.2 && u < 3.9 ? Math.sin(TAU * ((u - 3.2) / 0.7)) : 0;
      const bow = u > 5.4 && u < 6.4 ? Math.sin(Math.PI * ((u - 5.4) / 1.0)) : 0;
      const toPack = (u > 1.4 && u < 2.6) || (u > 4.1 && u < 5.2) || (u > 6.8 && u < 8.2);
      const pose = compose(alive(T, 127, 0.45), {
        lean: PRESENT.lean * out + 0.07 * bow,
        bend: PRESENT.bend * out + 0.06 * bow,
        tip: PRESENT.tip * out + 0.55 * raise + 0.07 * flourish,
        curl: PRESENT.curl * out - 0.2 * raise + 0.3 * flourish,
        tipLen: 1 + (PRESENT.tipLen - 1) * out,
        squash: -0.06 * raise + 0.05 * bow,
        face: { ...PRESENT_FACE, look: toPack ? [-0.8, -0.3] : [0, 0], ...(bow > 0.3 ? { closed: ["happy", "happy"] } : {}) },
      });
      return draw({ ...pose, flip: true, liquid: liquid(T, [{ t: T - u + 0.85, e: 0.2 }]) });
    },
    still: () => drawStill({ ...compose(PRESENT, { face: PRESENT_FACE }), flip: true, liquid: calm }),
  };

  // ---------- writing: something's loading (a page's "Loading…") ----------
  // It writes: its curl's end circles, and the line it leaves runs away to its right in cursive loops, drying as it
  // goes (lex-mascots' pass 2: "it writes little loops of ink until the content arrives"). Eyes on the pen, intent but
  // easy; its body gives a little with each loop. The page that replaces "Loading…" takes it away with it.
  const WRITE_FACE = { look: [0.8, -0.1], top: [0.04, 0.04], bottom: [0.24, 0.24], mouth: { type: "smile", smile: 1.1, w: 8 } };
  const BANDS = 5; // the line in bands of opacity, newest first (one path each)
  const loops = (line, fresh = 0.55) => {
    const bands = Array.from({ length: BANDS }, () => []);
    for (let i = 0; i < line.length; i++) {
      const { q, age } = line[i];
      const dry = smooth(span(age, fresh, TRAIL - fresh));
      const b = Math.min(BANDS - 1, Math.floor(dry * BANDS));
      bands[b].push(q);
      // Each band carries on to the next point, so the line has no gaps between bands.
      if (i + 1 < line.length) {
        const nb = Math.min(BANDS - 1, Math.floor(smooth(span(line[i + 1].age, fresh, TRAIL - fresh)) * BANDS));
        if (nb !== b) bands[b].push(line[i + 1].q);
      }
    }
    return bands.map((pts, b) => inkLine(pts, ink.body, 2.4, 1 - b / BANDS)).join("");
  };
  const writing = {
    loop: true,
    frame(t, T = t) {
      const phi = (TAU * T) / LOOP;
      const pose = compose(PEN_LOOP(phi), alive(T, 131, 0.35), { squash: 0.025 * Math.sin(phi + 0.6), face: WRITE_FACE });
      return loops(loopLine(T)) + draw({ ...pose, liquid: liquid(T) });
    },
    still: () => {
      // Its designed still: a few loops written, the pen at the end of the line.
      const phi = TAU * 0.3;
      const line = loopLine((phi * LOOP) / TAU, 0.95).map(({ q, age }) => ({ q, age: 0 }));
      return loops(line) + drawStill({ ...compose(PEN_LOOP(phi), { face: WRITE_FACE }), liquid: calm });
    },
  };

  // ---------- lookup: looking something up (Translate's wait) ----------
  // A magnifying glass, its curl gripping the handle, swept along a line at its right as if scanning a page, its eyes on
  // the glass; it holds at each end of the line. Every few seconds it draws back a touch (anticipation), leans in close to
  // peer through it, eyes wide, holds, and settles back with a small overshoot. The magnifier reads as one at 32 px: a
  // straight handle at its own angle, a heavy rim in a neutral metal (ink.rim: light on dark themes, dark on light ones,
  // apart from its violet), a see-through lens (a light tint over whatever's behind, a crisp white glint). All of it
  // stays inside its box (the words beside it are never covered). Its lines are heavier at small sizes.
  const LOOK_LOOP = 6.0;
  const small = (sized.detail ?? 1) >= 6;
  const RIM = small ? 5.6 : 4.4, HANDLE_W = small ? 6.6 : 5.4, GLINT = small ? 3 : 2.4;
  /** The handle: under the drop, so its curl's end covers the end it holds. */
  const handle = (m) => inkLine([m.butt, m.neck], ink.grip ?? ink.shade, HANDLE_W);
  /** The glass: a light tint over whatever's behind it (see-through), the rim, a crisp glint arc and a fleck. */
  const glass = (m) => {
    const [cx, cy] = m.c, R = m.R;
    const glint = Array.from({ length: 11 }, (_, i) => { const a = Math.PI * (0.55 + (0.42 * i) / 10); return [cx + R * 0.62 * Math.cos(a), cy + R * 0.62 * Math.sin(a)]; });
    const fleck = [cx + R * 0.36, cy - R * 0.38];
    return `<g data-lens=""><circle cx="${f2(cx)}" cy="${f2(-cy)}" r="${f2(R)}" fill="${ink.glass ?? ink.light}" fill-opacity="0.2"/>`
      + `<circle cx="${f2(cx)}" cy="${f2(-cy)}" r="${f2(R)}" fill="none" stroke="${ink.rim ?? ink.shade}" stroke-width="${f2(RIM)}"/>`
      + `${inkLine(glint, ink.white, GLINT)}<circle cx="${f2(fleck[0])}" cy="${f2(-fleck[1])}" r="${f2(GLINT * 0.55)}" fill="${ink.white}"/></g>`;
  };
  /** Its eyes on the glass (their middle at about (-22, 34)). */
  const lookAtLens = (m) => {
    const tx = m.c[0] + 22, ty = m.c[1] - 34, l = Math.hypot(tx, ty) || 1;
    return [(tx / l) * 0.9, (ty / l) * 0.6];
  };
  const lookupAt = (T) => {
    const u = T % LOOK_LOOP;
    // The sweep: left to right (1.1 s), a hold, back (1.1 s), a hold; still while it peers.
    const SWEEP = 2.7, peerFrom = 3.4, peerTo = 5.1;
    const v = u < peerFrom ? u % SWEEP : u < peerTo ? peerFrom % SWEEP : (u - peerTo + (peerFrom % SWEEP)) % SWEEP;
    const s = keys(v, [[0, -1], [0.25, -1], [1.35, 1, smooth], [1.6, 1], [2.7, -1, smooth]]);
    // The peer: draws back (anticipation), leans in with an overshoot, holds, settles back with a small ring.
    const n = u < peerFrom ? 0 : keys(u, [[peerFrom, 0], [peerFrom + 0.2, -0.25, smooth], [peerFrom + 0.5, 1, outBack], [peerFrom + 1.15, 1], [peerFrom + 1.5, 0, smooth], [peerTo, 0]]) + (u > peerFrom + 1.5 ? -0.12 * ring(u - peerFrom - 1.5, 2.8, 0.35) : 0);
    const peering = u > peerFrom + 0.4 && u < peerFrom + 1.3;
    const end = lookEndAt(s, n); // n below 0 (drawing back) follows the curl on past its samples
    const m = magnifier(end, Math.max(0, n));
    const face = peering
      ? { look: lookAtLens(m), top: [0, 0], bottom: [0.05, 0.05], pupil: 1.18, mouth: { type: "o", open: 0.28, w: 6 } }
      : { look: lookAtLens(m), top: [0.14, 0.14], bottom: [0.14, 0.14], mouth: { type: u > peerTo - 0.2 && u < peerTo + 0.7 ? "hm" : "smile", smile: 1.05, w: 8 } };
    const pose = compose(LOOK_POSE(s, n), alive(T, 137, 0.35), { face });
    // No blink across the peer: its eyes are the beat (a blink from its idle life would land on the lean in).
    if (u > peerFrom + 0.15 && u < peerFrom + 1.35) pose.face.blink = 0;
    return { pose, m, impacts: u > peerFrom + 0.5 ? [{ t: T - (u - peerFrom - 0.5), e: 0.2 }] : [] };
  };
  const lookup = {
    loop: true,
    frame(t, T = t) {
      const { pose, m, impacts } = lookupAt(T);
      return handle(m) + draw({ ...pose, liquid: liquid(T, impacts) }) + glass(m);
    },
    still: () => {
      const m = magnifier(lookEndAt(0.35, 0), 0);
      return handle(m) + drawStill({ ...compose(LOOK_POSE(0.35, 0), { face: { look: lookAtLens(m), top: [0.1, 0.1], bottom: [0.14, 0.14], mouth: { type: "smile", smile: 1.05, w: 8 } } }), liquid: calm }) + glass(m);
    },
  };

  return { ready, counted, peek, beside, scribble, catch: catchState, present, writing, lookup };
}
