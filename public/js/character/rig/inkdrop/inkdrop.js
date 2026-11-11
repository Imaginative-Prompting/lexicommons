// Generated from the character's rig (08-lexicommons/docs/design/character/rig/inkdrop/inkdrop.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// The ink drop: Lexicommons' character.
//
// drawDrop(pose, palette) → an SVG <g> string, a pure function of the pose. Units: the belly is 100 wide; the drop
// stands on y = 0 at x = 0 and is ~118 tall to the top of its curl. Every pose field is optional (see NEUTRAL).
//
// How it's built: a spine from the belly's center up through the tip and round the curl, with a radius along it; the
// outline is the envelope of those circles (kit/geom.js sweep), flattened where it sits on the ground. So leaning,
// bending, curling the tip and squashing are all changes to the spine, and the shape stays one smooth ink drop.
// Shading is flat: one shade crescent (the outline shifted against itself) and one highlight streak.

import { add, blend, centroid, clamp, correspond, ellipse, f2, filletConcave, lerp, lerp2, resample, rot, smoothOutline, smoothPath, sweep, untangle } from "../kit/geom.js";
import { brow, eye, mouth } from "../kit/face.js";
import { speakingMouth } from "../kit/speech.js";
import { spreadFoot, waveOutline } from "../kit/liquid.js";
import * as F from "../kit/flat.js";
import { ellipseInto, smoothPathFlat } from "../kit/geom.js";

let bodyIds = 0;
/** Restart ids (call once per frame, with face.js resetIds, so a frame's SVG is always the same). */
export const resetBodyIds = () => { bodyIds = 0; };

export const PALETTES = {
  // Violet, per theme: research.md §6 and design-sheet.md (checked with tools/color-scan.py against each theme's own
  // meaning colors under protanopia and deuteranopia).
  // deep: a prop's inside or track (a box, a switch), readable on the theme's own ground; paper: a page it writes on.
  // rim, grip, glass: a magnifier's metal rim and handle (neutral greys that stand apart from its violet on the theme's
  // ground) and its lens's tint (drawn see-through). gloss: the liquid's highlight (liquid-clips.js).
  // The ink (body, shade, light, brow, tongue, deep, glass, gloss) is what a theme may change: the app reads its --tinta-*
  // tokens (character/ink.js) into a palette object of the same shape, which every function here takes in place of a name.
  // The eyes (white, pupil, glint), the mouth and the props' paper, rim and grip keep their own colors.
  dark: { body: "#7C5CE6", shade: "#5E40C4", light: "#A68CFF", white: "#FFFFFF", pupil: "#1B1A17", glint: "#FFFFFF", brow: "#3B2785", mouth: "#1B1A17", tongue: "#A68CFF", deep: "#3A2C80", paper: "#F6F3EC", rim: "#D9D6CF", grip: "#A7A39A", glass: "#A68CFF", gloss: "#BBA3FF" },
  light: { body: "#9370F0", shade: "#7452D6", light: "#BBA3FF", white: "#FFFFFF", pupil: "#1B1A17", glint: "#FFFFFF", brow: "#4A33A6", mouth: "#1B1A17", tongue: "#BBA3FF", deep: "#CFC4F5", paper: "#FFFFFF", rim: "#3A3833", grip: "#75726A", glass: "#7452D6", gloss: "#E2D8FF" },
  // Monochrome, in the app's own inks (tokens.css): a grey body so the white eyes still read.
  "mono-dark": { body: "#A7A49C", shade: "#75726A", light: "#D9D6CF", white: "#FFFFFF", pupil: "#0B0B0A", glint: "#FFFFFF", brow: "#56544D", mouth: "#0B0B0A", tongue: "#75726A", deep: "#3A3833", paper: "#F1EFEA", rim: "#F1EFEA", grip: "#A7A39A", glass: "#D9D6CF", gloss: "#F1EFEA" },
  "mono-light": { body: "#57544D", shade: "#3A3833", light: "#7C7970", white: "#FDFDFC", pupil: "#1B1A17", glint: "#FFFFFF", brow: "#1B1A17", mouth: "#1B1A17", tongue: "#7C7970", deep: "#D9D6CF", paper: "#FFFFFF", rim: "#1B1A17", grip: "#57544D", glass: "#3A3833", gloss: "#D9D6CF" },
};

/** A palette by name ("dark", "light", "mono-dark", "mono-light"), or a palette object as it is (a theme's ink, resolved). */
export const inkPalette = (palette) => (palette && typeof palette === "object" ? palette : PALETTES[palette] ?? PALETTES.dark);

export const NEUTRAL = {
  x: 0, y: 0, scale: 1,
  squash: 0,          // + squashes (wider, shorter), - stretches; volume kept
  lean: 0,            // rad, + leans to its right (our right); bends from the base, the tip more than the belly
  bend: 0,            // rad, extra bend of the upper body alone (follow-through)
  tip: 0,             // rad, turns the curl about its base (its "hand": pointing, waving)
  curl: 1,            // how tightly the tip curls: 0 straight up, 1 its design, 1.5 tight
  reach: 1,           // the body's height (the cone's length)
  tipLen: 1,          // the curl's length (a spout when it reaches out)
  belly: 1,           // the belly's size (breathing, puffing up)
  bellyLow: 1,        // how far the belly reaches below its widest line (< 1: flatter, a bead of liquid)
  wide: 0,            // the body's own width (volume kept), body only: a lower, wider variation keeps round eyes
  flip: false,        // mirrors the body (its curl to the other side)
  face: {
    turn: 0,          // -1..1: the face slides round toward its left/right (a flat 2D turn)
    y: 0,             // face lifts (+) or drops (-), in units
    look: [0, 0],     // -1..1, where the pupils point
    converge: 0.22,   // pupils toward each other (looking at you)
    pupil: 1,         // pupil size
    top: [0, 0],      // upper lids, left/right eye, 0 open..1 shut
    tilt: [0, 0],     // upper lids' angle, rad (+ = inner ends down: cross or determined)
    bottom: [0, 0],   // lower lids rising (a smile in the eyes)
    blink: 0,         // 0..1, both upper lids down
    closed: [null, null], // per eye: null | "happy" | "squeeze" | "calm"
    eyeScale: [1, 1],
    brows: { show: 0, raise: [0, 0], tilt: [0, 0] },
    mouth: { type: "smile", open: 0.5, smile: 1, asym: 0.35, w: 10, x: 0 },
    speak: null,      // speaking: a mouth's parameters from kit/speech.js (speechTrack(...).at(t)), drawn instead of mouth
  },
  morph: null,        // { to: polygon (local units), t: 0..1, eyes: [[x,y],[x,y]], eyeScale, mouth: [x,y] | null }
  drops: [],          // loose droplets: [{ c: [x, y], r }]
  shade: 1,           // 0 hides the shade crescent and highlight (for tiny sizes)
  points: 0,          // >0: draw the outline through this many points (smaller static files)
  compact: false,     // true: the outline written once and referenced (the app); false: the reels' long form
  air: 0,             // how far its body is off its ground (world units): y is the ground, where its puddle and wet foot
                      // stay through a jump: only its body leaves the ground, and what it's standing in stays put
  detail: 1,          // >1: computes the outline that many times coarser, for small sizes in the app (1: the reels)
  liquid: null,       // { t, wave (units), seed, foot (0..), slosh: [x, y] (the highlight lagging), bulb (units) }:
                      // the drop as liquid (kit/liquid.js), so it moves like ink and not like a solid
};

const merge = (base, over) => {
  if (!over) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  }
  return out;
};

// Measured from the round-1 hero picture (tools/…/hero-cut.png, in units of its belly's width): widest (100) at
// y 33; below that a flattened ellipse 33 tall; above it a straight cone at ~41° each side, into a curl that hooks to
// the right (outermost x 38 at y 99, top y 116) and ends in a round bulb near (27, 92), clear of the shoulder.
const BELLY = [0, 33];      // the belly's center: its widest line
const BELLY_R = 50;
const BELLY_LOW = 33;      // how far the belly reaches below its center (an ellipse, flattened: superellipse n 2.4)
const CONE = 59.9;         // the straight body's length, belly center to the curl's base (fit-curl.mjs, IoU 0.957)
const NECK_R = 11.87;      // the tube's radius where the curl starts
const EYE = { x: 25.5, y: 32, rx: 15.3, ry: 14.3 };
const MOUTH_Y = 21.5;

/** The sweep's end caps (the belly's round, about 260° of a 50-unit circle, and the bulb at the curl's end), at the
 * pose's detail. 112 points at full detail: under 2.5° a step, a true curve at any size. 28 (until 2 Nov 2026) left
 * 9° chords that read as flat sides with corners on a large still. Smaller sizes take fewer, never so few a step shows
 * at their size. */
const CAPS = (p) => ((p.detail ?? 1) === 1 ? 112 : Math.max(16, Math.round(112 / p.detail)));
/** The fillet where the curl meets the body, at the pose's detail: its points `detail` times further apart and its
 * smoothing passes fewer by detail², so it rounds over the same distance (detail 1, the default). */
const FILLET = (p) => {
  const D = p.detail ?? 1;
  return D === 1 ? { angle: 0.5, radius: 10, iters: 120 } : { angle: 0.5, radius: 10, iters: Math.max(4, Math.round(120 / (D * D))), spacing: 0.6 * D };
};

/** The spine (dense points) and radius per point, for a pose. */
function spineOf(p) {
  const pts = [], radii = [];
  const rb = BELLY_R * p.belly;
  const S = p._shape || {};
  const cone = (S.cone ?? CONE) * p.reach;
  const neckR = S.neckR ?? NECK_R;
  // Part A: the body, straight up from the belly's center; the radius shrinks linearly (a straight-sided cone).
  // detail > 1 (small sizes in the app) samples it coarser; the curl keeps enough steps that its path stays within a
  // pixel of the reels' at the sizes that use it.
  const D = p.detail ?? 1;
  const nA = D === 1 ? 64 : Math.max(16, Math.round(64 / D));
  for (let i = 0; i < nA; i++) {
    const a = i / nA;
    pts.push([0, BELLY[1] + cone * a]);
    radii.push(lerp(rb, neckR, a));
  }
  // Part B: the curl, turning clockwise (to its right), tightening a little, ending in a small round bulb.
  const turnTotal = (S.turn ?? 2.316) * Math.max(0, p.curl); // 133° at its design
  const L = Math.max(14, turnTotal * (S.R ?? 17.24)) * (p.tipLen ?? 1);
  const nB = D === 1 ? 70 : Math.max(30, Math.round(70 / D)), ds = L / nB;
  let pos = [0, BELLY[1] + cone], head = Math.PI / 2 - (S.head ?? 0.274) + p.tip;
  for (let i = 0; i <= nB; i++) {
    const u = i / nB;
    pts.push(pos);
    radii.push(lerp(neckR, S.endR ?? 7.56, u ** 0.8) + 0.6 * Math.max(0, (u - 0.8) / 0.2) ** 2 + (p.liquid?.bulb ?? 0) * Math.max(0, (u - 0.7) / 0.3) ** 2);
    head -= (turnTotal / L) * ((S.tight ?? 0.767) + 2 * (1 - (S.tight ?? 0.767)) * u) * ds;
    pos = add(pos, [Math.cos(head) * ds, Math.sin(head) * ds]);
  }
  return { pts, radii, rb, nA };
}

/** Bends the spine: the higher a point, the more it turns about the belly (lean + bend). */
function bendSpine(pts, lean, bend) {
  return pts.map((q) => {
    const h = clamp((q[1] - BELLY[1]) / 70, 0, 1.4);
    return rot(q, lean * 0.55 * h + bend * h * h, BELLY);
  });
}

/** The whole-body transform: squash about the ground point, a lean of the whole body, flip, scale, position. */
function bodyXf(p) {
  const s = clamp(p.squash, -0.6, 0.8);
  // `wide` is the design's own proportion (a bead), applied to the body only: the eyes keep their shape.
  const sx = (1 + 0.32 * s) * (1 + (p.wide ?? 0)), sy = 1 / sx;
  const m = p.flip ? -1 : 1;
  return (q) => {
    let r = [q[0] * sx * m, q[1] * sy];
    r = rot(r, -p.lean * 0.3, [0, 0]);
    return [p.x + r[0] * p.scale, p.y + (p.air ?? 0) + r[1] * p.scale];
  };
}

// ---- the outline on flat buffers (kit/flat.js): the same steps, the same numbers, nothing allocated a point ------------------
// A Tinta on a page draws 30 frames a second; its outline's arrays were most of what each frame allocated. spineFlat and
// outlineFlat compute what spineOf, bendSpine, groundIt (now groundFlat) and outline computed, operation for operation (golden.mjs holds them
// byte for byte), into buffers kept between frames. Their results are good until they run again.

/** spineOf + bendSpine, flat: the bent spine (pool "bent"), its radii, rb and nA. */
function spineFlat(p) {
  const rb = BELLY_R * p.belly;
  const S = p._shape || {};
  const cone = (S.cone ?? CONE) * p.reach;
  const neckR = S.neckR ?? NECK_R;
  const D = p.detail ?? 1;
  const nA = D === 1 ? 64 : Math.max(16, Math.round(64 / D));
  const turnTotal = (S.turn ?? 2.316) * Math.max(0, p.curl);
  const L = Math.max(14, turnTotal * (S.R ?? 17.24)) * (p.tipLen ?? 1);
  const nB = D === 1 ? 70 : Math.max(30, Math.round(70 / D)), ds = L / nB;
  const n = nA + nB + 1;
  const sp = F.pool("spine", n), radii = F.scratch("radii", n);
  for (let i = 0; i < nA; i++) {
    const a = i / nA;
    sp.x[i] = 0;
    sp.y[i] = BELLY[1] + cone * a;
    radii[i] = lerp(rb, neckR, a);
  }
  let px = 0, py = BELLY[1] + cone, head = Math.PI / 2 - (S.head ?? 0.274) + p.tip;
  for (let i = 0; i <= nB; i++) {
    const u = i / nB;
    sp.x[nA + i] = px;
    sp.y[nA + i] = py;
    radii[nA + i] = lerp(neckR, S.endR ?? 7.56, u ** 0.8) + 0.6 * Math.max(0, (u - 0.8) / 0.2) ** 2 + (p.liquid?.bulb ?? 0) * Math.max(0, (u - 0.7) / 0.3) ** 2;
    head -= (turnTotal / L) * ((S.tight ?? 0.767) + 2 * (1 - (S.tight ?? 0.767)) * u) * ds;
    px = px + Math.cos(head) * ds;
    py = py + Math.sin(head) * ds;
  }
  // bendSpine(pts, -p.lean, -p.bend): each point turned about the belly by rot().
  const lean = -p.lean, bend = -p.bend;
  const bent = F.pool("bent", n);
  for (let i = 0; i < n; i++) {
    const h = clamp((sp.y[i] - BELLY[1]) / 70, 0, 1.4);
    const ang = lean * 0.55 * h + bend * h * h;
    const s = Math.sin(ang), k = Math.cos(ang), x = sp.x[i] - BELLY[0], y = sp.y[i] - BELLY[1];
    bent.x[i] = BELLY[0] + x * k - y * s;
    bent.y[i] = BELLY[1] + x * s + y * k;
  }
  return { spine: bent, radii, rb, nA };
}

/** Below the belly's widest line the circle becomes a flattened superellipse; its bottom then sits on y = 0 (pool "ground"). */
function groundFlat(f, rb, lowK = 1) {
  const low = BELLY_LOW * (rb / BELLY_R) * lowK, n = 2.4;
  const out = F.pool("ground", f.n);
  let minY = Infinity;
  for (let i = 0; i < f.n; i++) {
    const x = f.x[i], y = f.y[i];
    out.x[i] = x;
    if (y >= BELLY[1]) out.y[i] = y;
    else {
      const t = Math.min(1, Math.abs(x) / rb);
      out.y[i] = BELLY[1] - low * (1 - t ** n) ** (1 / n);
    }
    minY = Math.min(minY, out.y[i]);
  }
  for (let i = 0; i < f.n; i++) out.y[i] = out.y[i] - minY;
  return out;
}

/** outline(), flat: { body (a flat outline), spine, radii, rb, nA }, p merged already. */
function outlineFlat(p) {
  const built = spineFlat(p);
  // Smooth vectors: every corner rounded alike (the bulb's cap meeting a tube that tapers, the belly's cap meeting the
  // cone), at the pose's detail; then set back on its ground.
  let body = F.smoothOutline(groundFlat(F.filletConcave(F.untangle(F.sweep(built.spine, built.radii, CAPS(p))), FILLET(p)), built.rb, p.bellyLow), { spacing: 0.5 * (p.detail ?? 1) });
  const floor = F.minY(body);
  if (floor !== 0) for (let i = 0; i < body.n; i++) body.y[i] = body.y[i] - floor;
  const L = p.liquid;
  if (L) {
    // The wet foot flares where it meets the ground: it lets go as the body leaves it.
    const off = clamp((p.air ?? 0) / ((p.scale ?? 1) * 6), 0, 1);
    F.spreadFoot(body, { spread: (L.foot ?? 0) * (1 - off), h: 11 });
    body = F.waveOutline(body, L.t ?? 0, { amp: L.wave ?? 0, seed: L.seed ?? 0, modes: L.modes });
  }
  return { ...built, body };
}

/** The drop's outline (local units, before the body transform), ground-flattened. */
export function outline(pose) {
  return F.toArrays(outlineFlat(merge(NEUTRAL, pose)).body);
}

/** The outline in world units (the pose's x, y, scale, squash and lean applied), exactly where drawDrop draws it: for
 * things that sit on the body's surface (ink running down it, a drip landing on it). */
export function worldOutline(pose = {}) {
  const p = merge(NEUTRAL, pose);
  return outline(p).map(bodyXf(p));
}

/**
 * Where the tip's end is, in world units (the same space the pose's x and y are in), and which way it points: for
 * things that come out of the tip (a stream, a flicked drop, a written line).
 */
export function tipEnd(pose = {}) {
  const p = merge(NEUTRAL, pose);
  // On the flat steps (as drawDrop's outline: the same numbers), so a prop held at its curl (rest's umbrella, mended's patch) costs
  // no arrays a frame.
  const { spine, radii, rb } = spineFlat(p);
  const raw = F.filletConcave(F.untangle(F.sweep(spine, radii, CAPS(p))), FILLET(p));
  const low = BELLY_LOW * (rb / BELLY_R) * p.bellyLow, n = 2.4;
  let minY = Infinity;
  for (let i = 0; i < raw.n; i++) {
    const x = raw.x[i], y = raw.y[i];
    minY = Math.min(minY, y >= BELLY[1] ? y : BELLY[1] - low * (1 - Math.min(1, Math.abs(x) / rb) ** n) ** (1 / n));
  }
  const X = bodyXf(p);
  const N = spine.n;
  const a = X([spine.x[N - 1], spine.y[N - 1] - minY]), b = X([spine.x[N - 4], spine.y[N - 4] - minY]);
  const d = [a[0] - b[0], a[1] - b[1]], l = Math.hypot(d[0], d[1]) || 1;
  return { at: a, dir: [d[0] / l, d[1] / l], r: radii[N - 1] * p.scale };
}

/** The construction behind the outline, for the design sheet: the spine and its radii (ground-shifted like the
 * outline), the belly's center line and how low it reaches. */
export function construction(pose = {}) {
  const p = merge(NEUTRAL, pose);
  const { pts, radii, rb } = spineOf(p);
  const spine = bendSpine(pts, -p.lean, -p.bend);
  const raw = filletConcave(untangle(sweep(spine, radii, CAPS(p))), FILLET(p));
  const low = BELLY_LOW * (rb / BELLY_R);
  const shift = -(BELLY[1] - low); // groundFlat puts the belly's lowest point on y = 0
  const sh = (q) => [q[0], q[1] + shift];
  return { spine: spine.map(sh), radii, belly: sh(BELLY), bellyR: rb, bellyLow: low, outline: outline(pose), eye: EYE, mouthY: MOUTH_Y + shift - shift };
}

/** The highlight streak: along the cone's left edge, inset, near the hero's (x -11, y 85), tilted with the edge. `built` is
 * outlineFlat's for this p (its bent spine and radii, flat), so the spine isn't built twice a frame. */
function highlightOf(p, built) {
  const { spine: S, radii, rb, nA } = built;
  const X = S.x, Y = S.y;
  // At 53/64 of the body's height (the reels' point 53 of 64; a coarser spine interpolates to the same place).
  const f = (53 * nA) / 64, i = Math.floor(f), w = f - i;
  const atX = w ? lerp(X[i], X[i + 1], w) : X[i], atY = w ? lerp(Y[i], Y[i + 1], w) : Y[i];
  const tx0 = w ? lerp(X[i + 1], X[i + 2], w) - lerp(X[i - 1], X[i], w) : X[i + 1] - X[i - 1];
  const ty0 = w ? lerp(Y[i + 1], Y[i + 2], w) - lerp(Y[i - 1], Y[i], w) : Y[i + 1] - Y[i - 1];
  const tl = Math.hypot(tx0, ty0) || 1;
  const t = [tx0 / tl, ty0 / tl];
  const n = [-t[1], t[0]];
  const rr = (w ? lerp(radii[i], radii[i + 1], w) : radii[i]) * 0.6;
  const c = [atX + n[0] * rr, atY + n[1] * rr];
  const ang = Math.atan2(t[1], t[0]) - Math.PI / 2 - 0.72;
  const sl = p.liquid?.slosh ?? [0, 0];
  return { c: [c[0] + sl[0], c[1] - (rb - BELLY_LOW * (rb / BELLY_R) * p.bellyLow) + sl[1]], rx: 4.4, ry: 11.5, ang };
}

/** body.map(bodyXf(p)), flat (pool "world"): the same transform, its sin and cos worked out once. */
function worldFlat(f, p, name = "world") {
  const sq = clamp(p.squash, -0.6, 0.8);
  const sx = (1 + 0.32 * sq) * (1 + (p.wide ?? 0)), sy = 1 / sx;
  const m = p.flip ? -1 : 1;
  const ang = -p.lean * 0.3, sn = Math.sin(ang), k = Math.cos(ang);
  const out = F.pool(name, f.n);
  for (let i = 0; i < f.n; i++) {
    // rot([q0·sx·m, q1·sy], ang, [0, 0]), then placed.
    const x = f.x[i] * sx * m - 0, y = f.y[i] * sy - 0;
    const rx = 0 + x * k - y * sn, ry = 0 + x * sn + y * k;
    out.x[i] = p.x + rx * p.scale;
    out.y[i] = p.y + (p.air ?? 0) + ry * p.scale;
  }
  return out;
}

/** For tests: while `on`, each drawDrop records { puddle (its puddle's world y, or null), bottom (its body's lowest world
 * y) } in `calls`, and { wave (its ripple), detail, points } in `draws`. */
export const probe = { on: false, calls: [], draws: [] };

export function drawDrop(pose = {}, palette = "dark") {
  const p = merge(NEUTRAL, pose);
  if (probe.on) probe.draws.push({ wave: p.liquid?.wave ?? 0, detail: p.detail ?? 1, points: p.points ?? null });
  const pal = inkPalette(palette);
  const X = bodyXf(p);
  const built = outlineFlat(p);
  let body = built.body;
  const f = p.face;
  // Where the face sits (local units), and how big; a morph moves it onto the shape it becomes.
  let eyeL = [-EYE.x, EYE.y + f.y], eyeR = [EYE.x, EYE.y + f.y], eyeK = 1, mouthAt = [f.mouth.x ?? 0, MOUTH_Y + f.y];
  const turnShift = f.turn * EYE.x * 0.7;
  eyeL = [eyeL[0] + turnShift - f.turn * 4, eyeL[1]];
  eyeR = [eyeR[0] + turnShift - f.turn * 4, eyeR[1]];
  mouthAt = [mouthAt[0] + turnShift * 1.05, mouthAt[1]];
  let shadeK = p.shade;
  let mouthHidden = false;
  if (p.morph && p.morph.t > 0) {
    const m = p.morph;
    const [A, B] = correspond(F.toArrays(body), m.to, 200);
    body = blend(A, B, m.t);
    // Liquid keeps rippling in whatever it becomes: in proportion to the shape (a flat puddle ripples a little, never
    // twisting into a ribbon), and a shape that sits on the ground keeps its base there.
    if (p.liquid?.wave) {
      const ys = body.map((q) => q[1]), lo = Math.min(...ys), hi = Math.max(...ys);
      const onGround = lo < 1;
      const amp = Math.min(p.liquid.wave * m.t, 0.12 * (hi - lo));
      body = waveOutline(body, p.liquid.t ?? 0, { amp, seed: p.liquid.seed ?? 0, modes: p.liquid.modes, ground: onGround ? lo : -1e9, flat: onGround ? Math.min(8, 0.5 * (hi - lo)) : 1 });
    }
    if (m.eyes) {
      eyeL = lerp2(eyeL, m.eyes[0], m.t);
      eyeR = lerp2(eyeR, m.eyes[1], m.t);
      eyeK = lerp(1, m.eyeScale ?? 0.8, m.t);
      mouthAt = m.mouth === null ? mouthAt : lerp2(mouthAt, m.mouth ?? [lerp(eyeL[0], eyeR[0], 0.5), eyeL[1] - 11 * eyeK], m.t);
      if (m.mouth === null) mouthHidden = m.t > 0.35;
    }
    shadeK *= 1 - 0.6 * m.t;
    body = F.fromArrays(body, "morphed");
  }
  // `points` thins the outline for static files (icons): the curve stays smooth through fewer points.
  if (p.points) body = F.resample(body, p.points, "points");
  const world = worldFlat(body, p);
  const d = smoothPathFlat(world);
  const id = `b${bodyIds++}`;
  const s = p.scale;
  let g = `<g>`;
  // compact (the app): the outline written once and referenced, the crescents made by a clip and a mask instead of
  // even-odd pairs. The same picture, about a sixth of the SVG; the reels keep the long form.
  const C = p.compact;
  const bodyFill = (fill, extra = "") => (C ? `<use href="#${id}o" fill="${fill}"${extra}/>` : `<path d="${d}" fill="${fill}"${extra}/>`);
  if (C) g += `<defs><path id="${id}o" d="${d}"/></defs><clipPath id="${id}"><use href="#${id}o"/></clipPath>`;
  else g += `<clipPath id="${id}"><path d="${d}"/></clipPath>`;
  const Lq = p.liquid;
  // Liquid: a thin puddle of itself where it sits (under the body), drawn before it.
  if (Lq?.puddle && !p.morph) {
    // On the ground through a jump: it thins and shrinks as the body rises and takes it back as it lands.
    const up = clamp((p.air ?? 0) / (28 * s), 0, 1);
    const w = Lq.puddle * 50 * s * (1 - 0.5 * up), cx = p.x;
    g += `<ellipse cx="${f2(cx)}" cy="${f2(-p.y + 0.6 * s)}" rx="${f2(w)}" ry="${f2(2.6 * s * (1 - 0.55 * up))}" fill="${pal.shade}"/>`;
    if (probe.on) probe.calls.push({ puddle: p.y - 0.6 * s, bottom: F.minY(world) });
  }
  if (Lq?.rim && shadeK > 0.01) {
    // Liquid shading, each crescent its own region (the outline less itself shifted, even-odd, clipped to the body):
    // the shade on the left as before; light coming through the lower right edge (a rim); a specular glint.
    const shift = (dx, dy) => smoothPathFlat(world, dx, dy);
    const fl = p.flip ? -1 : 1;
    if (C) {
      // The outline's box (Math.min/max over its xs and its flipped ys, as before, without the arrays).
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let i = 0; i < world.n; i++) {
        const x = world.x[i], y = -world.y[i];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      const bx = x0 - 8 * s, by = y0 - 8 * s, bw = x1 - bx + 8 * s, bh = y1 - by + 8 * s;
      const box = `x="${f2(bx)}" y="${f2(by)}" width="${f2(bw)}" height="${f2(bh)}"`;
      const o1 = [5.4 * s * shadeK * fl, 1.4 * s * shadeK], o2 = [-2.6 * s * fl, 2.4 * s];
      const tr = (o) => ` transform="translate(${f2(o[0])},${f2(-o[1])})"`;
      g += `<mask id="${id}m" maskUnits="userSpaceOnUse" ${box}><rect ${box} fill="#fff"/><use href="#${id}o" fill="#000"${tr(o2)}/></mask>`;
      g += bodyFill(pal.body);
      g += `<g clip-path="url(#${id})">`;
      g += bodyFill(pal.shade) + bodyFill(pal.body, tr(o1));
      g += `<rect ${box} fill="${pal.light}" opacity="0.75" mask="url(#${id}m)"/>`;
    } else {
    g += `<path d="${d}" fill="${pal.body}"/>`;
    g += `<g clip-path="url(#${id})">`;
    g += `<path d="${d}${shift(5.4 * s * shadeK * fl, 1.4 * s * shadeK)}" fill-rule="evenodd" fill="${pal.shade}"/>`;
    g += `<path d="${d}${shift(-2.6 * s * fl, 2.4 * s)}" fill-rule="evenodd" fill="${pal.light}" opacity="0.75"/>`;
    }
    if (!p.morph || p.morph.t < 0.6) {
      const h = highlightOf(p, built);
      const op = f2(shadeK * (p.morph ? 1 - p.morph.t / 0.6 : 1));
      g += `<path d="${smoothPathFlat(worldFlat(ellipseInto(F.pool("highlight", 40), h.c[0], h.c[1], h.rx, h.ry, 40, h.ang), p, "highlight.world"))}" fill="${pal.light}" opacity="${op}"/>`;
      const gl = X([h.c[0] + 7, h.c[1] + 9]);
      g += `<circle cx="${f2(gl[0])}" cy="${f2(-gl[1])}" r="${f2(2.1 * s)}" fill="#FFFFFF" opacity="${op}"/>`;
    }
    g += `</g>`;
  } else if (shadeK > 0.01) {
    // Shade crescent: the body in shade, the body shifted up-right over it in the body color.
    g += `<path d="${d}" fill="${pal.shade}"/>`;
    const off = [5.4 * s * shadeK * (p.flip ? -1 : 1), 1.4 * s * shadeK];
    g += `<g clip-path="url(#${id})"><path transform="translate(${f2(off[0])},${f2(-off[1])})" d="${d}" fill="${pal.body}"/>`;
    if (!p.morph || p.morph.t < 0.6) {
      const h = highlightOf(p, built);
      const he = ellipse(h.c[0], h.c[1], h.rx, h.ry, 40, h.ang).map(X);
      g += `<path d="${smoothPath(he)}" fill="${pal.light}" opacity="${f2(shadeK * (p.morph ? 1 - p.morph.t / 0.6 : 1))}"/>`;
    }
    g += `</g>`;
  } else {
    g += bodyFill(pal.body);
  }
  // Loose droplets (splashes).
  for (const dr of p.drops) {
    const c = X(dr.c);
    g += `<circle cx="${f2(c[0])}" cy="${f2(-c[1])}" r="${f2(dr.r * s)}" fill="${pal.body}"/>`;
  }
  // The face, in world space: positions through the body transform, sizes by scale and squash.
  const sq = clamp(p.squash, -0.6, 0.8), sx = 1 + 0.32 * sq, sy = 1 / sx;
  const ang = -p.lean * 0.3 + (p.flip ? 0 : 0);
  const eyes = [eyeL, eyeR];
  g += `<g clip-path="url(#${id})">`;
  const facePal = { ...pal, lid: pal.body, lidLine: pal.shade };
  eyes.forEach((e, i) => {
    const side = i === 0 ? -1 : 1;
    const c = X(e);
    const k = eyeK * (f.eyeScale[i] ?? 1) * (1 - Math.abs(f.turn) * 0.22 * (side * f.turn < 0 ? 1 : 0));
    if (k < 0.02) return;
    const look = [clamp(f.look[0] + (i === 0 ? f.converge : -f.converge) + f.turn * 0.35, -1, 1), f.look[1]];
    const top = Math.max(f.top[i], f.blink);
    g += eye({ c, rx: EYE.rx * k * s * sx, ry: EYE.ry * k * s * sy, angle: ang, look, pupil: f.pupil, top, tilt: f.tilt[i], bottom: f.bottom[i], closed: f.closed[i], side }, facePal);
    g += brow({ c, rx: EYE.rx * k * s * sx, ry: EYE.ry * k * s * sy, angle: ang, raise: f.brows.raise[i], tilt: f.brows.tilt[i], show: f.brows.show, side }, pal);
  });
  const mc = X(mouthAt);
  if (f.eyeScale.every((v) => v < 0.02)) return g + `</g></g>`;
  // Speaking, the mouth is bigger than its resting smile: it has to read at a card's corner.
  if (!mouthHidden && f.speak) g += speakingMouth({ c: mc, w: f.mouth.w * 1.8 * s * eyeK * sx, angle: ang, params: f.speak, tongue: f.tongue ?? "none" }, pal);
  else if (!mouthHidden) g += mouth({ c: mc, w: f.mouth.w * s * eyeK * sx, type: f.mouth.type, open: f.mouth.open, smile: f.mouth.smile, asym: f.mouth.asym * (p.flip ? -1 : 1), angle: ang }, pal);
  g += `</g></g>`;
  return g;
}

export { svgDoc } from "../kit/svg.js";
export { centroid };
