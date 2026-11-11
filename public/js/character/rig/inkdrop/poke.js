// Generated from the character's rig (08-lexicommons/docs/design/character/rig/inkdrop/poke.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// Tinta poked (lex-character, 7 Nov 2026; approved: poke him wherever he stands on a tab, never inside a session). A tap on
// him and he reacts; pokes in a row vary:
//   splat    he splats into a puddle of himself, peeks up at you from it, and pulls himself back into shape with a wobble
//   tickle   a ticklish shiver: eyes squeezed happily shut, giggling, little bounces
//   slide    he splats, and the puddle slides a step away from your finger, peeks back at you, slides home and gets up
//   squirt   (every fifth) grumpy: he puffs up, squeezes a little squirt of ink out of his curl, and turns away, huffy, for a
//            moment; the drops land beside him and dry away
// A poke is a layer over the state he's in (its at(T): { pose, liquid, props(pose, keep, moved), under }), so it starts and
// ends exactly in that state, on the same clock: what he holds (ready's drip, rest's umbrella, mended's patch) is drawn up into
// him as he's hit and grows back as he settles.
// A state with no at(T) (he's busy: scribbling, peeking) takes no poke.
//
// pokeAct(ctx, base) → { name: "poke", dur: Infinity, durFor(data), exit: 0, frame(t, T, { data }) }
//   ctx       what tinta.js draws with ({ palette (a name or the palette), draw, liquid, compose })
//   base      the state he stands in (with at(T))
//   data      { pokes: [{ at, n, side }] }: each poke the app took, in order: its act time (s), which poke in the run it is
//             (0 the first), and which side of his middle it landed (-1 his left on the screen, 1 the right). The app takes
//             one per BEAT at most and starts the run again after REST quiet seconds; the n-th plays ORDER[n % 5].
//   durFor    how long the act runs for that data: to the end of the last poke's move (and of any drops still flying)
// Every frame a pure function of (t, T, data). A new poke takes over from the one playing over BLEND (inside a beat), from
// where it is, so nothing jumps.

import { inkPalette, tipEnd } from "./inkdrop.js";
import { droplet, inOut, ring, smooth, span } from "../kit/acting.js";
import { inQuad, outQuad } from "../kit/anim.js";
import { impactEnergy } from "../kit/liquid.js";
import { f2 } from "../kit/geom.js";

/** At most one poke a beat (s): the app ignores a tap sooner than this after the last one it took. */
export const BEAT = 0.3;
/** Quiet seconds after the last poke's move before the next poke starts the run again (a splat). */
export const REST = 4;
const BLEND = 0.1;
const TAU = 2 * Math.PI;

// A puddle of himself, low, with room for his eyes to peek over it (narrower than the slump's, so a slide stays near his box).
const MOUND = {
  to: Array.from({ length: 120 }, (_, i) => { const a = (TAU * i) / 120; return [50 * Math.cos(a), 13 + 13 * Math.sin(a)]; }),
  eyes: [[-13, 15], [13, 15]],
  eyeScale: 0.6,
  mouth: null,
};
/** While he's a puddle he holds it exactly: his life's squash, lean and breathing fade out as he becomes one. */
const holdShape = (p, m) => {
  const k = 1 - Math.min(1, m);
  return { ...p, squash: (p.squash ?? 0) * k, lean: (p.lean ?? 0) * k, bend: (p.bend ?? 0) * k, belly: 1 + ((p.belly ?? 1) - 1) * k };
};

const GRUMPY = { brows: { show: 1, raise: [-0.55, -0.55], tilt: [-0.35, -0.35] }, top: [0.32, 0.32], tilt: [0.25, 0.25], mouth: { type: "hm", w: 9 } };
const SMILE = { bottom: [0.3, 0.3], mouth: { type: "smile", smile: 1.3, w: 11 } };
const GIGGLE = (u) => ({ closed: ["happy", "happy"], mouth: { type: "open", open: 0.5 + 0.25 * Math.abs(Math.sin(TAU * 6 * u)), w: 15 } });

/** The press itself: squashed down from above in the first 60 ms, held until `until`. */
const pressed = (u, k, until) => (u < until ? k * outQuad(span(u, 0, 0.06)) : 0);
/** His drip (ready's) drawn up into him as he's hit, grown back from `back`. */
const keepDrip = (u, back, over = 0.45) => (1 - smooth(span(u, 0, 0.1))) + smooth(span(u, back, over));
/** Fades a layer to exactly nothing by `end`. */
const outBy = (u, end, d = 0.3) => 1 - smooth(span(u, end - d, d));

// Each move: dur, impacts (s into it, energy), and delta(u, side) → the layer it adds at u: numbers added to the pose
// (squash, lean, bend, tip, curl, air, x), belly (1 = none), m (how far he's a puddle), face (fields that replace the
// state's), keep (his drip, 0..1). Every move's delta is nothing at its end.
const MOVES = {
  splat: {
    dur: 1.7,
    puddleBy: 0.26, // a puddle by then (a poke on a puddle keeps him one until then)
    impacts: [[0.26, 1.0], [1.0, 0.6]],
    delta(u) {
      const m = u < 0.7 ? inQuad(span(u, 0.06, 0.2)) : 1 - inOut(span(u, 0.7, 0.24));
      const stretch = u >= 0.7 && u < 1.0 ? -0.22 * Math.sin(Math.PI * span(u, 0.7, 0.3)) : 0;
      const after = u >= 1.0 ? outBy(u, 1.7) : 0;
      const jelly = u >= 1.0 ? 0.2 * ring(u - 1.0, 2.8, 0.3) * after : 0;
      const sway = u >= 1.0 ? 0.05 * ring(u - 1.0, 3.6, 0.32) * after : 0;
      const face = u < 0.26 ? { closed: ["squeeze", "squeeze"] } : u < 0.94 ? { look: [0, 0.35], blink: u > 0.52 && u < 0.6 ? 1 : 0 } : u < 1.5 ? SMILE : {};
      return { squash: pressed(u, 0.24, 0.26) + stretch + jelly, lean: sway, m, face, keep: keepDrip(u, 1.1) };
    },
  },
  tickle: {
    dur: 1.35,
    impacts: [[0.05, 0.6], [0.45, 0.35]],
    delta(u) {
      const env = u < 0.05 ? u / 0.05 : (1 - span(u, 0.05, 0.95)) ** 1.5;
      const face = u < 1.0 ? GIGGLE(u) : u < 1.25 ? SMILE : {};
      return {
        squash: 0.12 * outQuad(span(u, 0, 0.05)) * (1 - span(u, 0.05, 0.15)) + 0.05 * Math.abs(Math.sin(TAU * 6 * u)) * env,
        lean: 0.075 * Math.sin(TAU * 12 * u) * env,
        tip: 0.14 * Math.sin(TAU * 9 * u + 1) * env,
        air: 4 * Math.abs(Math.sin(TAU * 3 * u)) * env,
        face,
        keep: keepDrip(u, 0.9),
      };
    },
  },
  slide: {
    dur: 2.0,
    puddleBy: 0.22,
    impacts: [[0.22, 0.9], [0.58, 0.3], [1.2, 0.3], [1.55, 0.6]],
    delta(u, side) {
      const away = side < 0 ? 1 : -1; // away from the finger
      const m = u < 1.25 ? inQuad(span(u, 0.06, 0.16)) : 1 - inOut(span(u, 1.25, 0.24));
      const x = 20 * away * (inOut(span(u, 0.28, 0.3)) - inOut(span(u, 0.9, 0.3)));
      const stretch = u >= 1.25 && u < 1.55 ? -0.2 * Math.sin(Math.PI * span(u, 1.25, 0.3)) : 0;
      const after = u >= 1.55 ? outBy(u, 2.0) : 0;
      const jelly = u >= 1.55 ? 0.18 * ring(u - 1.55, 2.8, 0.3) * after : 0;
      let face = {};
      if (u < 0.22) face = { closed: ["squeeze", "squeeze"] };
      else if (u < 0.62) face = { look: [-away * 0.75, 0.3] }; // looking back at you as it slides off
      else if (u < 0.9) face = { look: [0, 0.35], blink: u > 0.7 && u < 0.78 ? 1 : 0 };
      else if (u < 1.22) face = { look: [-away * 0.6, 0.25] }; // and where it's going, home
      else if (u < 1.9) face = u < 1.55 ? { look: [0, 0.2] } : SMILE;
      return { squash: pressed(u, 0.22, 0.22) + stretch + jelly, x, m, face, keep: keepDrip(u, 1.55) };
    },
  },
  squirt: {
    dur: 1.9,
    impacts: [[0.06, 0.5], [0.42, 0.7]],
    delta(u) {
      const gather = smooth(span(u, 0.06, 0.3)) * (1 - smooth(span(u, 0.4, 0.08)));
      const squeeze = u >= 0.38 && u < 0.6 ? 0.14 * Math.sin(Math.PI * span(u, 0.38, 0.22)) : 0;
      const after = outBy(u, 1.9, 0.45);
      const huff = smooth(span(u, 0.5, 0.25)) * outBy(u, 1.6, 0.4); // turned away a little, huffy
      const jelly = u >= 0.6 ? 0.1 * ring(u - 0.6, 3, 0.3) * after : 0;
      const face = u < 0.06 ? { closed: ["squeeze", "squeeze"] } : u < 1.35 ? { ...GRUMPY, look: [-0.55 * huff, 0.1 * huff] } : {};
      return {
        squash: pressed(u, 0.2, 0.08) * (1 - span(u, 0.06, 0.12)) - 0.07 * gather + squeeze + jelly,
        belly: 1 + 0.08 * gather,
        // The curl straightens a little into a nozzle as he gathers, and gives a flick as it squirts.
        curl: -0.3 * gather,
        tip: -0.12 * gather + 0.1 * (u >= 0.4 ? ring(u - 0.4, 3.2, 0.3) * after : 0),
        lean: -0.06 * huff,
        face,
        keep: keepDrip(u, 1.3),
      };
    },
  },
};
/** Which move each poke in a run plays, in turn. */
export const ORDER = ["splat", "tickle", "slide", "splat", "squirt"];

// The squirt's drops: out of his curl's end (where it points as he squirts) and down beside him under gravity, landing as
// dots that dry away. In his units, y up; the curl's end for the squirt's pose, worked out once.
const SQUIRT_POSE = { curl: 1 - 0.3, tip: -0.12, belly: 1.08, squash: -0.07, detail: 2 };
let squirtFrom = null;
const DROPS = [
  { at: 0.4, speed: 1.0, r: 6.5 },
  { at: 0.43, speed: 0.85, r: 5.5 },
  { at: 0.47, speed: 0.7, r: 4.5 },
];
const EXTRA_END = 1.6; // s into the squirt: every drop has landed and dried by then
function drops(u, ink, flip) {
  const from = (squirtFrom ??= tipEnd(SQUIRT_POSE));
  const [dx, dy] = from.dir;
  const l = Math.hypot(dx, dy) || 1;
  let svg = "";
  for (const d of DROPS) {
    // Out along the curl and up a little: they land 51–59 units out, inside his box (half of it is 64), beside his foot.
    const v = [(dx / l) * 60 * d.speed, (dy / l) * 60 * d.speed + 60];
    const q = droplet(u, d.at, [from.at[0] + (dx / l) * from.r, from.at[1] + (dy / l) * from.r], v, { g: 900, r: d.r, stick: 0.5 });
    if (!q) continue;
    const x = flip ? -q.c[0] : q.c[0];
    if (q.landed) svg += `<ellipse cx="${f2(x)}" cy="${f2(-q.c[1] + q.r * 0.2)}" rx="${f2(q.r * 1.5)}" ry="${f2(q.r * 0.45)}" fill="${ink.body}"/>`;
    else svg += `<circle cx="${f2(x)}" cy="${f2(-q.c[1])}" r="${f2(q.r)}" fill="${ink.body}"/><circle cx="${f2(x - q.r * 0.3)}" cy="${f2(-q.c[1] - q.r * 0.35)}" r="${f2(q.r * 0.3)}" fill="${ink.light}"/>`;
  }
  return svg;
}

// Every field here rests at 0 in a pose (curl too: the drawing adds 1), so a layer of zeros changes nothing (compose takes a field a
// state lacks as the layer's value, not added to a default: a tipLen of 0 would be no curl at all, so the moves leave it alone).
const NUMS = ["squash", "lean", "bend", "tip", "curl", "air", "x", "m", "keep"];
/** A move's layer at u, with what it leaves out at its rest values. */
const layerOf = (name, u, side) => {
  const d = MOVES[name].delta(Math.max(0, u), side);
  return { squash: 0, lean: 0, bend: 0, tip: 0, curl: 0, air: 0, x: 0, m: 0, keep: 1, belly: 1, face: {}, ...d };
};
/** From one move's layer to the next's, k of the way (numbers mixed but m and x, which carry: layerAt; the face changes halfway). */
const mixLayers = (a, b, k) => {
  const out = { face: k < 0.5 ? a.face : b.face, belly: a.belly + (b.belly - a.belly) * k };
  for (const f of NUMS) out[f] = f === "m" || f === "x" ? b[f] : a[f] + (b[f] - a[f]) * k;
  return out;
};

/** The pokes as given, in order, a beat apart at least (one sooner than that is dropped, as the app drops it). */
function valid(data) {
  const out = [];
  if (!Array.isArray(data?.pokes)) return out;
  for (const p of data.pokes) {
    if (!Number.isFinite(p?.at) || !Number.isInteger(p?.n) || p.n < 0) continue;
    if (out.length && p.at < out.at(-1).at + BEAT - 1e-9) continue;
    out.push(p);
  }
  return out;
}
const moveOf = (p) => ORDER[p.n % ORDER.length];

/**
 * Poke k's layer at t, from where he was when it landed (`before`: poke k-1's layer then, or null). What he is carries over:
 * a poke on a puddle keeps him one until his new move would be one anyway, or gets him up over 0.3 s in a move that isn't;
 * a puddle slid off home slides back over 0.35 s as the new move plays.
 */
function layerAt(p, t, before) {
  const name = moveOf(p), u = t - p.at;
  const L = layerOf(name, u, p.side ?? 1);
  if (!before) return L;
  const by = MOVES[name].puddleBy;
  const carried = by ? (u < by ? before.m : 0) : before.m * (1 - inOut(span(u, 0, 0.3)));
  return { ...L, m: Math.max(L.m, carried), x: L.x + before.x * (1 - inOut(span(u, 0, 0.35))) };
}
/** Where he was as each poke landed: befores[j] is poke j-1's layer at poke j (pokes come a beat apart, past any blend). */
function befores(pokes) {
  const out = [null];
  for (let j = 1; j < pokes.length; j++) out.push(layerAt(pokes[j - 1], pokes[j].at, out[j - 1]));
  return out;
}

/** How long the act runs for these pokes: to the end of the last one's move, or of drops still flying from a squirt. */
export function pokeLength(data) {
  const pokes = valid(data);
  if (!pokes.length) return 0;
  let end = 0;
  for (const [i, p] of pokes.entries()) {
    const name = moveOf(p);
    if (i === pokes.length - 1) end = Math.max(end, p.at + MOVES[name].dur);
    if (name === "squirt") end = Math.max(end, p.at + EXTRA_END);
  }
  return end;
}

export function pokeAct(ctx, base) {
  const { draw, liquid, compose, palette } = ctx;
  const ink = inkPalette(palette);
  return {
    name: "poke",
    dur: Infinity,
    exit: 0,
    durFor: pokeLength,
    frame(t, T, { data = null } = {}) {
      const pokes = valid(data).filter((p) => p.at <= t);
      const now = base.at(T);
      if (!pokes.length) return now.props(now.pose, 1) + draw({ ...now.pose, liquid: now.liquid });
      const k = pokes.length - 1, cur = pokes[k], u = t - cur.at, from = befores(pokes);
      let L = layerAt(cur, t, from[k]);
      if (k > 0 && u < BLEND) L = mixLayers(layerAt(pokes[k - 1], t, from[k - 1]), L, smooth(u / BLEND));
      // The pose: the state's at T, his move's layer on it; a puddle of himself as far as m says.
      const { m, keep, face, ...nums } = L;
      let pose = compose(now.pose, { ...nums, face });
      if (m > 0.001) pose = { ...holdShape(pose, m), morph: { ...MOUND, t: Math.min(1, m) } };
      // The liquid ripples from each poke's impacts (on the clock), over the state's own.
      const T0 = T - t, hits = [];
      for (const p of pokes) for (const [iu, e] of MOVES[moveOf(p)].impacts) if (p.at + iu <= t) hits.push({ t: T0 + p.at + iu, e });
      // Faded to nothing by the act's end (an impact's ripple only dies away), so its last frame is the state's own.
      const end = pokeLength(data), calmed = 1 - smooth(span(t, end - 0.35, 0.35));
      const flow = { ...now.liquid, wave: (now.liquid?.wave ?? 0) + liquid(T, hits).wave * (1 - 0.5 * Math.min(1, m)) * calmed };
      // What he holds (ready's drip, rest's umbrella, mended's patch), drawn up into him as far as `keep` says, moved with him by
      // the poke where it hangs apart from him (the state's props decide), under or over him as the state draws it; at rest,
      // exactly the state's.
      const props = now.props(pose, Math.max(0, Math.min(1, keep)), { x: nums.x, air: nums.air, squash: nums.squash });
      let extra = "";
      for (const p of pokes) if (moveOf(p) === "squirt" && t - p.at < EXTRA_END) extra += drops(t - p.at, ink, Boolean(now.pose.flip));
      return (now.under ? props : "") + draw({ ...pose, liquid: flow }) + (now.under ? "" : props) + extra;
    },
  };
}
