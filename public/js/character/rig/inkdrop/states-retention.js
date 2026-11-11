// Generated from the character's rig (08-lexicommons/docs/design/character/rig/inkdrop/states-retention.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// Tinta's states for lex-retention's places (drafted by lex-retention, 2 Nov 2026; lex-character reviews and owns the
// rig): Today's calm states by the streak (rest, mended), the paused reminders row (sleepy), the comeback card (wave),
// and the empty states (lounge, page, box, shrug, off, doze), one pose for each group of words
// (docs/design/retention/tinta-places.md). Never sad at you, nothing about a gap.
//
// states(ctx) → { name: state }, where ctx is what tinta.js draws with: { palette, sized, draw, liquid, compose, alive,
// keys, faceMix } plus drawStill (full detail) and calm (liquid at rest, no ripple), which every still() draws with. A held state is { loop: true, frame(t, T), still() }; a reaction is { dur, frame(t, T, speak),
// still() }. still() is each one's designed still (Animations Off), never a frozen moment of a move. rest and mended
// also give at(T): { pose, liquid, props(pose, keep) }, their pose at T for an act to blend into (Today's throw ends in them) or
// layer on (a poke: poke.js; keep 0..1 draws its prop up into its curl's end); props are drawn over the drop. Units: the drop's
// (it stands on y = 0, ~118 tall, y up); props are drawn in its own ink, inside tinta.js's VIEW where they can be.

import { inkPalette, tipEnd } from "./inkdrop.js";
import { ellipse, f2, polyPath, smoothPath } from "../kit/geom.js";
import { hop, keys, outBack, smooth, span } from "../kit/acting.js";
import { blinkAt, blinkNext } from "../kit/anim.js";
import { heldMotion } from "./idle-motion.js";
import { SWITCH, blinkAndEyes, breathing, driftingPart, floatingPart, nextOf, stillPart, within } from "./held.js";

const TAU = 2 * Math.PI;

// On the compositor (lex-character, 7 Nov 2026), as idle and the places' states are (held.js): lounge, box, off, doze, mended and sleepy breathe,
// sway and lean as one transform the app plays, and draw only for their beats (a sigh, a peek, a glance, a pat, a blink when their eyes are open); their
// props (the box, the switch) on a track that holds them still against his breath, doze's cloud on one that drifts. tests/held-motion.mjs
// holds them. shrug and page act most of their loops, and rest's curl sways its umbrella all the time (its calm-day character), so they draw
// every frame as before (the director, 7 Nov). wave is a reaction: once, then its state.
const LOUNGE_MOTION = heldMotion({ seed: 51, k: 0.45, sway: 0.008, swayPeriod: 7.8, drift: 0.006 });
const BOX_MOTION = heldMotion({ seed: 91, k: 0.45, sway: 0.008, swayPeriod: 7.8, drift: 0.006 });
const OFF_MOTION = heldMotion({ seed: 101, k: 0.5, sway: 0.009, swayPeriod: 7.8, drift: 0.006 });
const MENDED_MOTION = heldMotion({ seed: 73, k: 0.5, sway: 0.009, swayPeriod: 7.8, drift: 0.006 });
// Sleepy's slow deep breath is its motion (3.9 s: it was 3.8, now dividing the track's 31.2).
const SLEEPY_MOTION = heldMotion({ seed: 29, k: 0.3, sway: 0.005, swayPeriod: 7.8, drift: 0.004, deep: { belly: 0.03, squash: 0.03, period: 3.9 } });
// Doze's slow deep breath is its motion (5.2 s: it was 4.2, now dividing the track's 31.2), on alive()'s faint one.
const DOZE_MOTION = heldMotion({ seed: 107, k: 0.3, sway: 0.005, swayPeriod: 7.8, drift: 0.004, deep: { belly: 0.028, squash: 0.025, period: 5.2 } });
/** The next blink of seed after T that falls where ok(t) says (its eyes open then), or Infinity before `until`. */
const nextBlinkWhere = (T, seed, ok, until) => {
  for (let t = T, i = 0; i < 40; i++) {
    const { next } = blinkNext(t, seed);
    if (next >= until) return Infinity;
    if (ok(next)) return next;
    t = next + 0.2;
  }
  return Infinity;
};

/** A stroked line of ink through points (y up), round ends: a "z", a written line, a stitch. */
const inkLine = (pts, color, width, opacity = 1) =>
  `<path d="${polyPath(pts, false)}" fill="none" stroke="${color}" stroke-width="${f2(width)}" stroke-linecap="round" stroke-linejoin="round"${opacity < 1 ? ` opacity="${f2(opacity)}"` : ""}/>`;

/** A "z" of ink, `h` tall, its lower left corner at [x, y]. */
const zed = (x, y, h, color, opacity) => inkLine([[x, y + h], [x + h * 0.85, y + h], [x, y], [x + h * 0.85, y]], color, h * 0.2, opacity);

/** A filled shape (points y up), with an outline. */
const shape = (pts, fill, stroke, width = 1.6, closed = true) =>
  `<path d="${smoothPath(pts, closed)}" fill="${fill}" stroke="${stroke}" stroke-width="${f2(width)}" stroke-linejoin="round"/>`;
/** A rounded rectangle (y up), corner radius r. */
const roundRect = (x0, y0, x1, y1, r, fill, stroke, width = 1.6) =>
  `<rect x="${f2(x0)}" y="${f2(-y1)}" width="${f2(x1 - x0)}" height="${f2(y1 - y0)}" rx="${f2(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${f2(width)}"/>`;

// The pen's path for `page`: where the curl's end goes as it writes one line across the page, sampled once (tipEnd
// builds the whole outline, too slow to call every frame) and drawn up to where the pen is.
let PEN = null;
const PEN_POSE = (u) => ({ x: -14, lean: 0.1, tip: -0.72 + 0.32 * u, curl: -0.5 + 0.3 * u, tipLen: 2 + 0.2 * u }); // curl relative (0: its design)
const penPath = () => (PEN ??= Array.from({ length: 25 }, (_, i) => { const p = PEN_POSE(i / 24); return tipEnd({ ...p, detail: 2, curl: 1 + p.curl }).at; }));

export function states(ctx) {
  const { palette, sized = {}, draw, drawStill, liquid, calm, compose, alive, faceMix } = ctx;
  // Where its curl ends, at the detail it's drawn at (a full-detail outline every frame would double a frame's cost).
  const tipAt = (pose) => tipEnd({ ...pose, ...sized, curl: 1 + (pose.curl ?? 0) }).at;
  const ink = inkPalette(palette);
  // A prop held at its curl's end (y up), drawn up into it as far as keep says (0..1: a poke, poke.js) and grown back.
  const kept = (svg, at, keep) => (keep >= 0.999 ? svg : `<g transform="translate(${f2(at[0])} ${f2(-at[1])}) scale(${f2(keep)}) translate(${f2(-at[0])} ${f2(at[1])})">${svg}</g>`);

  // ---------- lounge: it lounges in a puddle of itself (nothing to do right now) ----------
  // Low and wide, leaning back, its curl flopped over, eyes half shut and content, in a wide puddle. A slow sigh now and
  // then (its belly rises and settles), a lazy blink; never still.
  const LOUNGE = { squash: 0.42, bellyLow: 0.72, wide: 0.15, lean: -0.22, bend: -0.15, tip: 0.3, curl: 0.25, tipLen: 0.9, face: { closed: ["calm", "calm"], mouth: { type: "smile", smile: 1.45, w: 13, asym: 0.2 } } };
  // Now and then it opens its eyes halfway to glance at you, content, and closes them again.
  const GLANCE = { closed: [null, null], look: [0.05, 0.1], top: [0.18, 0.18], bottom: [0.45, 0.45] };
  const loungeLiquid = (T) => ({ ...liquid(T), puddle: 1.7, foot: 0.5 });
  const loungeCalm = { ...calm, puddle: 1.7, foot: 0.5 };
  const SIGH = 6.4;
  const loungeAt = (T, { breath = true } = {}) => {
    const u = T % SIGH;
    const sigh = Math.sin(Math.PI * span(u, 3.2, 1.6)); // in and out over 1.6 s
    const looking = u > 0.9 && u < 2.1;
    const pose = compose(LOUNGE, breath ? breathing(LOUNGE_MOTION, T) : null, blinkAndEyes(T, 51, 0.45), { belly: 1 + 0.035 * sigh, squash: -0.04 * sigh, blink: 0 });
    if (looking) pose.face = { ...pose.face, ...GLANCE };
    return pose;
  };
  // Its eyes are shut but for its glance (0.9–2.1 s of 6.4): a blink shows only then.
  const loungeOpen = (t) => within(t, SIGH, 0.9, 2.1);
  const lounge = {
    loop: true,
    frame: (t, T = t) => draw({ ...loungeAt(T), liquid: loungeLiquid(T) }),
    still: () => drawStill({ ...compose(LOUNGE), liquid: loungeCalm }),
    rest: (T) => draw({ ...loungeAt(T, { breath: false }), liquid: loungeCalm }),
    busy: (T) => within(T, SIGH, 3.2, 4.8) || within(T, SIGH, 0.9, 0.9 + SWITCH) || within(T, SIGH, 2.1, 2.1 + SWITCH) || (loungeOpen(T) && blinkAt(T, 51) > 0),
    next: (T) => Math.min(nextOf(T, SIGH, [0.9, 2.1, 3.2]), nextBlinkWhere(T, 51, loungeOpen, T + SIGH)),
    motion: LOUNGE_MOTION.motion,
  };

  // ---------- sleepy: resting, eyes shut, a small "z" in ink (reminders are paused) ----------
  // Slow, deep breaths; a "z" rises from beside its curl and fades, then the next. Drawn big enough to read at 32 px.
  const SLEEPY = { ...faceMix("sleepy", "sleepy", 0) };
  // Each "z": where it is at T (its lower left corner, y up), its size against the 12 units it starts at, how much it shows. Two, half a
  // rise apart; 2.6 s a rise divides the track's 31.2.
  const RISE = 2.6, Z0 = [46, 90];
  const zAt = (T, i) => {
    const u = ((T + i * RISE * 0.5) % RISE) / RISE;
    return { x: Z0[0] + 8 * u, y: Z0[1] + 14 * u, scale: (12 + 6 * u) / 12, opacity: Math.min(1, u * 5) * (1 - smooth(span(u, 0.6, 0.4))) };
  };
  const zs = (T) => [0, 1].map((i) => { const z = zAt(T, i); return zed(z.x, z.y, 12 * z.scale, ink.body, z.opacity); }).join("");
  // On the compositor: its deep breath its motion, each z drawn once at its start on a track that rises, grows and fades it, still against
  // his breath. Its eyes are shut, so it's never drawn again.
  const SLEEPY_ZS = [0, 1].map((i) => floatingPart(SLEEPY_MOTION, (T) => zAt(T, i), `z${i}`, Z0));
  const sleepy = {
    loop: true,
    frame: (t, T = t) => draw({ ...compose(SLEEPY, breathing(SLEEPY_MOTION, T)), liquid: liquid(T) }) + zs(T),
    still: () => drawStill({ ...compose(SLEEPY), liquid: calm }) + zed(48, 96, 16, ink.body, 1),
    rest: () => draw({ ...compose(SLEEPY), liquid: calm }) + [0, 1].map((i) => `<g data-track="z${i}">${zed(Z0[0], Z0[1], 12, ink.body, 1)}</g>`).join(""),
    busy: () => false,
    next: () => Infinity,
    motion: SLEEPY_MOTION.motion,
    tracks: SLEEPY_ZS,
  };

  // ---------- wave: a warm hello, once (the comeback card): it pops up and waves its curl; nothing about the gap ----------
  // Anticipation (a small crouch), a little hop (its puddle stays on the ground: `air`), its curl raised long like an arm,
  // the hook swinging side to side as a hand waves (three times), delighted; then it lowers it and settles to rest.
  const WAVE_DUR = 2.4;
  const ARM = (r, swing) => ({ tipLen: 1 + 0.8 * r, curl: -0.3 * r, tip: (0.85 + 0.45 * swing) * r, lean: -0.07 * swing * r });
  const wave = {
    dur: WAVE_DUR,
    frame(t, T = t, speak = null) {
      const h = hop(t, 0.22, { air: 0.34, h: 10, crouch: 0.22, land: 0.28 });
      const r = smooth(span(t, 0.2, 0.35)) * (1 - smooth(span(t, 1.8, 0.45)));
      const swing = Math.sin(TAU * 2.2 * Math.max(0, t - 0.55)) * smooth(span(t, 0.5, 0.15)) * (1 - smooth(span(t, 1.6, 0.25)));
      const face = r > 0.4 ? faceMix("delighted", "delighted", 0).face : faceMix("content", "content", 0).face;
      const p = compose(alive(T, 61, 0.5), ARM(r, swing), { lean: 0.05 * r, squash: h.squash, bend: h.bend, face });
      if (speak) p.face = { ...p.face, speak };
      return draw({ ...p, air: h.air, liquid: liquid(T, [{ t: T - t + 0.56, e: 0.35 }]) });
    },
    still: () => drawStill({ ...compose(ARM(1, 0.4), { lean: 0.05, face: faceMix("delighted", "delighted", 0).face }), liquid: calm }),
  };

  // ---------- rest: a rest day used. Calm under a little umbrella of ink; no mood at you ----------
  // Its curl raised to hold the umbrella's handle, the canopy over its head (drawing past the top of its box), swaying
  // a little with its curl; content, eyes soft.
  const REST = { squash: 0.2, tipLen: 1.15, curl: -0.1, tip: 0.5, face: { look: [0, 0.1], bottom: [0.38, 0.38], top: [0.12, 0.12], mouth: { type: "smile", smile: 1.1, w: 10 } } };
  const umbrella = (pose, keep = 1) => {
    if (keep <= 0.001) return "";
    const at = tipAt(pose);
    const top = [at[0] - 8, at[1] + 12], w = 40, hgt = 17;
    const canopy = [];
    for (let i = 0; i <= 20; i++) { const a = Math.PI * (i / 20); canopy.push([top[0] + w * Math.cos(a), top[1] - 6 + hgt * Math.sin(a)]); }
    // Its hem: four scallops back from left to right.
    for (let k = 0; k < 4; k++) { const x0 = top[0] - w + (2 * w * k) / 4, x1 = x0 + (2 * w) / 4; for (let i = 1; i <= 6; i++) { const u = i / 6; canopy.push([x0 + (x1 - x0) * u, top[1] - 6 - 4 * Math.sin(Math.PI * u)]); } }
    const ribs = [-w / 2, w / 2].map((dx) => inkLine([[top[0], top[1] + hgt - 6], [top[0] + dx, top[1] - 8]], ink.shade, 1.2)).join("");
    return kept(inkLine([at, [top[0], top[1] + hgt - 4]], ink.shade, 2.2) + `<path d="${polyPath(canopy.map(([x, y]) => [x, y]).reverse().reverse(), true)}" fill="${ink.light}" stroke="${ink.shade}" stroke-width="1.6" stroke-linejoin="round"/>` + ribs + inkLine([[top[0], top[1] + hgt - 6], [top[0], top[1] + hgt + 1]], ink.shade, 1.8), at, keep);
  };
  const rest = {
    loop: true,
    // Its pose at T, for an act to end in (Today's throw blends into it; lex-character): { pose, liquid, props(pose) }.
    at: (T) => ({ pose: compose(REST, alive(T, 71, 0.5), { tip: 0.04 * Math.sin((TAU * T) / 4.2) }), liquid: liquid(T), props: umbrella }),
    frame(t, T = t) {
      const now = rest.at(T);
      return draw({ ...now.pose, liquid: now.liquid }) + now.props(now.pose);
    },
    still: () => { const pose = compose(REST); return drawStill({ ...pose, liquid: calm }) + umbrella(pose); },
  };

  // ---------- mended: a missed day mended. It holds up a little patch of ink, stitched; content ----------
  // The patch at its curl's end; now and then it pats it down (a small press), then looks at you.
  const MENDED = { tipLen: 1.35, curl: -0.1, tip: -0.15, lean: 0.06, face: { look: [0.45, 0.25], bottom: [0.38, 0.38], mouth: { type: "smile", smile: 1.2, w: 10 } } };
  // A sticking plaster: the universal "patched up", a capsule at a slant with its pad and four dots.
  const patch = (pose, keep = 1) => {
    if (keep <= 0.001) return "";
    const at = tipAt(pose);
    const c = [at[0] + 8, at[1] + 2], a = 0.55, L = 17, R = 6.2;
    const pt = (x, y) => [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)];
    const capsule = [];
    for (let i = 0; i <= 12; i++) { const q = -Math.PI / 2 + (Math.PI * i) / 12; capsule.push(pt(L - R + R * Math.cos(q), R * Math.sin(q))); }
    for (let i = 0; i <= 12; i++) { const q = Math.PI / 2 + (Math.PI * i) / 12; capsule.push(pt(-L + R + R * Math.cos(q), R * Math.sin(q))); }
    const pad = [pt(-5.5, -R + 1.2), pt(5.5, -R + 1.2), pt(5.5, R - 1.2), pt(-5.5, R - 1.2)];
    const dots = [[-2.4, -2], [2.4, -2], [-2.4, 2], [2.4, 2]].map(([x, y]) => { const q = pt(x, y); return `<circle cx="${f2(q[0])}" cy="${f2(-q[1])}" r="0.9" fill="${ink.shade}"/>`; }).join("");
    return kept(`<path d="${polyPath(capsule)}" fill="${ink.light}" stroke="${ink.shade}" stroke-width="1.3" stroke-linejoin="round"/><path d="${polyPath(pad)}" fill="${ink.paper}" stroke="${ink.shade}" stroke-width="0.9"/>` + dots, at, keep);
  };
  // Its pat (2.6–3.1 s of 4.6) and its look at you (3.2–4.4) drawn; its breath on the compositor. Its patch is held at its curl's end, so it
  // moves with it.
  const mendedAt = (T, { breath = true } = {}) => {
    const u = T % 4.6;
    const pat = Math.sin(Math.PI * span(u, 2.6, 0.5)) * 0.12;
    const lookYou = u > 3.2 && u < 4.4;
    return compose(MENDED, breath ? breathing(MENDED_MOTION, T) : null, blinkAndEyes(T, 73, 0.5), { tip: -pat, face: lookYou ? { look: [-0.45, -0.25] } : {} });
  };
  const mended = {
    loop: true,
    // Its pose at T, for an act to end in (Today's throw on a mending day blends into it; lex-character).
    at: (T) => ({ pose: mendedAt(T), liquid: liquid(T), props: patch }),
    frame(t, T = t) {
      const now = mended.at(T);
      return draw({ ...now.pose, liquid: now.liquid }) + now.props(now.pose);
    },
    still: () => { const pose = compose(MENDED); return drawStill({ ...pose, liquid: calm }) + patch(pose); },
    rest(T) {
      const pose = mendedAt(T, { breath: false });
      return draw({ ...pose, liquid: calm }) + patch(pose);
    },
    busy: (T) => blinkAt(T, 73) > 0 || within(T, 4.6, 2.6, 3.1) || within(T, 4.6, 3.2, 3.2 + SWITCH) || within(T, 4.6, 4.4, 4.4 + SWITCH),
    next: (T) => nextOf(T, 4.6, [2.6, 3.2, 4.4], 73),
    motion: MENDED_MOTION.motion,
  };

  // ---------- page: writes on a blank page, waiting (what you do will be kept here) ----------
  // A page stands at its right; its curl writes a line across it, then another, and the lines fade, and again: waiting
  // for what you'll bring. Concentrating, then content.
  const PAGE_X = [30, 62], PAGE_Y = [44, 104];
  const page = {
    loop: true,
    frame(t, T = t) {
      const u = T % 5.2;
      const w1 = span(u, 0.5, 1.4), w2 = span(u, 2.3, 1.4);
      const writing = u > 0.4 && u < 3.8;
      const pen = writing ? (u < 2.1 ? w1 : w2) : 0;
      const dy = u < 2.1 ? 0 : -9; // the second line, lower
      const pose = compose(PEN_POSE(pen), alive(T, 81, 0.4), { tip: dy ? 0.12 : 0, face: writing ? { look: [0.75, -0.2], top: [0.25, 0.25], mouth: { type: "flat", w: 7 } } : { look: [0.1, 0.1], bottom: [0.35, 0.35], mouth: { type: "smile", smile: 1, w: 9 } } });
      const fade = 1 - smooth(span(u, 4.2, 0.8));
      const path = penPath();
      const line = (k, y0) => (k > 0 ? inkLine(path.slice(0, Math.max(2, Math.round(k * 24) + 1)).map(([x, y]) => [x, y + y0]), ink.shade, 2.6, fade) : "");
      return roundRect(PAGE_X[0], PAGE_Y[0], PAGE_X[1], PAGE_Y[1], 3, ink.paper, ink.shade, 1.4) + line(w1, 0) + line(w2, -9) + draw({ ...pose, liquid: liquid(T) });
    },
    still: () => roundRect(PAGE_X[0], PAGE_Y[0], PAGE_X[1], PAGE_Y[1], 3, ink.paper, ink.shade, 1.4) + inkLine(penPath().slice(0, 14), ink.shade, 2.6) + drawStill({ ...compose(PEN_POSE(0.5), { face: { look: [0.75, -0.2], top: [0.25, 0.25], mouth: { type: "flat", w: 7 } } }), liquid: calm }),
  };

  // ---------- box: looks into an empty box (no pack yet) ----------
  // An open box of ink at its right; it leans over and peers in, then looks back at you, unsure, and peers again.
  const BOXC = [34, 0], BW = 26, BH = 30;
  const box = () => {
    const [cx] = BOXC;
    const front = roundRect(cx - BW, 0, cx + BW, BH, 3, ink.shade, ink.shade, 1);
    const inside = shape([[cx - BW, BH], [cx + BW, BH], [cx + BW - 6, BH + 9], [cx - BW + 6, BH + 9]], ink.deep, ink.shade, 1.2);
    const flapL = shape([[cx - BW, BH], [cx - BW + 6, BH + 9], [cx - BW - 8, BH + 17], [cx - BW - 12, BH + 6]], ink.light, ink.shade, 1.2);
    const flapR = shape([[cx + BW, BH], [cx + BW - 6, BH + 9], [cx + BW + 8, BH + 17], [cx + BW + 12, BH + 6]], ink.light, ink.shade, 1.2);
    return inside + flapL + flapR + front;
  };
  const PEEK = { x: -16, lean: 0.32, bend: 0.18, tip: 0.2, face: { look: [0.65, -0.7], top: [0.1, 0.1], brows: { show: 1, raise: [0.6, 0.6], tilt: [0, 0] }, mouth: { type: "o", open: 0.35, w: 9 } } };
  const BACK = { x: -16, lean: 0.12, face: { look: [0, 0], top: [0.2, 0.05], brows: { show: 1, raise: [0.1, 0.7], tilt: [0, 0.2] }, mouth: { type: "hm", w: 10 } } };
  const boxAt = (T, { breath = true } = {}) => {
    const u = T % 5.6;
    const k = keys(u, [[0, 0], [0.4, 1, outBack], [2.6, 1], [3.0, 0], [4.8, 0], [5.6, 0]]);
    return compose(breath ? breathing(BOX_MOTION, T) : null, blinkAndEyes(T, 91, 0.45), { x: -16, lean: 0.12 + 0.2 * k, bend: 0.18 * k, tip: 0.2 * k, face: k > 0.5 ? PEEK.face : BACK.face });
  };
  // The box holds still while it breathes (its own track, the inverse of its motion).
  const BOX_STILL = stillPart(BOX_MOTION);
  const boxState = {
    loop: true,
    frame: (t, T = t) => draw({ ...boxAt(T), liquid: liquid(T) }) + box(),
    still: () => drawStill({ ...compose(PEEK), liquid: calm }) + box(),
    // It peers in (0–0.4 s of 5.6) and looks back at you (2.6–3.0).
    rest: (T) => draw({ ...boxAt(T, { breath: false }), liquid: calm }) + `<g data-track="still">${box()}</g>`,
    busy: (T) => blinkAt(T, 91) > 0 || within(T, 5.6, 0, 0.4) || within(T, 5.6, 2.6, 3.0),
    next: (T) => nextOf(T, 5.6, [0, 2.6], 91),
    motion: BOX_MOTION.motion,
    tracks: [BOX_STILL],
  };

  // ---------- shrug: looks around, then shrugs with its curl (that isn't here) ----------
  const SHRUG = { squash: -0.07, tip: -0.3, curl: -0.3, tipLen: 1.6, face: { look: [0, 0.05], brows: { show: 1, raise: [0.85, 0.85], tilt: [-0.1, 0.1] }, mouth: { type: "hm", w: 11 }, top: [0.1, 0.1] } };
  const shrug = {
    loop: true,
    frame(t, T = t) {
      const u = T % 5.0;
      const look = keys(u, [[0, [0, 0]], [0.3, [-0.8, 0.05], outBack], [1.1, [-0.8, 0.05]], [1.35, [0.8, 0.05], outBack], [2.1, [0.8, 0.05]], [2.35, [0, 0]]]);
      const s = keys(u, [[0, 0], [2.4, 0], [2.65, 1, outBack], [3.9, 1], [4.3, 0]]);
      // The shrug itself: a quick flick of its curl up and back ("dunno"), its body bobbing up with it.
      const bump = Math.sin(Math.PI * span(u, 2.55, 0.45));
      const pose = compose(alive(T, 97, 0.45), { squash: SHRUG.squash * s - 0.06 * bump, tip: SHRUG.tip * s + 0.45 * bump, curl: SHRUG.curl * s - 0.2 * bump, tipLen: 1 + 0.6 * s, lean: -0.08 * s, face: s > 0.5 ? SHRUG.face : { look } });
      return draw({ ...pose, liquid: liquid(T, [{ t: T - u + 2.65, e: 0.25 }]) });
    },
    still: () => drawStill({ ...compose(SHRUG), liquid: calm }),
  };

  // ---------- off: by a little switch of ink, off (everything is turned off) ----------
  const SW = [30, 18];
  const toggle = () => roundRect(SW[0], SW[1] - 8.5, SW[0] + 33, SW[1] + 8.5, 8.5, ink.deep, ink.shade, 1.4) + `<circle cx="${f2(SW[0] + 8.5)}" cy="${f2(-SW[1])}" r="6.4" fill="${ink.light}" stroke="${ink.shade}" stroke-width="1.2"/>`;
  const OFF = { x: -14, lean: 0.1, face: { look: [0.6, -0.5], bottom: [0.2, 0.2], mouth: { type: "smile", smile: 0.6, w: 8 } } };
  const offAt = (T, { breath = true } = {}) => {
    const u = T % 4.8;
    const atYou = u > 2.4 && u < 4.2;
    return compose(OFF, breath ? breathing(OFF_MOTION, T) : null, blinkAndEyes(T, 101, 0.5), atYou ? { face: { look: [-0.6, 0.5] } } : {});
  };
  const OFF_STILL = stillPart(OFF_MOTION);
  const off = {
    loop: true,
    frame: (t, T = t) => draw({ ...offAt(T), liquid: liquid(T) }) + toggle(),
    still: () => drawStill({ ...compose(OFF), liquid: calm }) + toggle(),
    // Its look moves to you at 2.4 s of 4.8 and back at 4.2: a drawing each.
    rest: (T) => draw({ ...offAt(T, { breath: false }), liquid: calm }) + `<g data-track="still">${toggle()}</g>`,
    busy: (T) => blinkAt(T, 101) > 0 || within(T, 4.8, 2.4, 2.4 + SWITCH) || within(T, 4.8, 4.2, 4.2 + SWITCH),
    next: (T) => nextOf(T, 4.8, [2.4, 4.2], 101),
    motion: OFF_MOTION.motion,
    tracks: [OFF_STILL],
  };

  // ---------- doze: dozing under a small cloud (offline); it wakes when you're back (the app swaps it for idle) ----------
  const cloud = (dx) => {
    const blobs = [[-30, 112, 11], [-18, 117, 13], [-6, 112, 10], [-24, 106, 9], [-11, 106, 9]].map(([x, y, r]) => ellipse(x + dx, y, r, r * 0.92, 28));
    return blobs.map((b) => `<path d="${smoothPath(b)}" fill="${ink.light}" opacity="0.92"/>`).join("") + `<path d="${smoothPath(ellipse(-18 + dx, 104, 22, 4, 28))}" fill="${ink.light}" opacity="0.92"/>`;
  };
  const DOZE = { squash: 0.1, lean: 0.06, curl: 0.2, tip: 0.25, face: { closed: ["calm", "calm"], mouth: { type: "smile", smile: 0.5, w: 7 } } };
  // Its slow deep breath is its motion; its cloud drifts on its own track (10.4 s: it was 9, now dividing the track's 31.2), held
  // still against its breath. Its eyes shut, it never has to be drawn again.
  const cloudDrift = (T) => [2.5 * Math.sin((TAU * T) / 10.4), 0];
  const DOZE_CLOUD = driftingPart(DOZE_MOTION, cloudDrift, "cloud");
  const doze = {
    loop: true,
    frame: (t, T = t) => draw({ ...compose(DOZE, breathing(DOZE_MOTION, T)), liquid: liquid(T) }) + cloud(cloudDrift(T)[0]),
    still: () => drawStill({ ...compose(DOZE), liquid: calm }) + cloud(0),
    rest: () => draw({ ...compose(DOZE), liquid: calm }) + `<g data-track="cloud">${cloud(0)}</g>`,
    busy: () => false,
    next: () => Infinity,
    motion: DOZE_MOTION.motion,
    tracks: [DOZE_CLOUD],
  };

  return { lounge, sleepy, wave, rest, mended, page, box: boxState, shrug, off, doze };
}
