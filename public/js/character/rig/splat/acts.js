// Generated from the character's rig (08-lexicommons/docs/design/character/rig/splat/acts.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// Tinta's acts in the app (lex-mascots, 2 Nov 2026): the places where the character does something on the screen, each the
// act from pass 2c of the thrown-drop reel. One idea a place, and quiet, so none of them gets in the way of using the app.
//
// Each is a `make` for the part's perform() (lex-character's character.js):
//   make({ palette, size }) → { name, dur, exit, frame(t, T, { rects, data, speak, endedAt }) }
// frame returns SVG content in tinta.js's VIEW units: its origin is the middle of its ground, y runs down as on the
// screen, and the drop at rest is about 116 tall. It draws past the box where the act goes (the part takes no presses).
//   rects    each target's box [x0, y0, x1, y1] in those units, measured each frame (null for one that's left the page)
//   data     what the page handed it with handle.set() (a download's { progress })
//   t, T     seconds into the act; the running clock (its breathing and blinks, so it runs on from idle and back)
//   endedAt  the act time handle.end() was called, or null; it settles at endedAt + exit (or at dur)
//
//   pour      a download: it pours itself into the bar (rects[0], its track) and is its fill, eyes on the front, as
//             data.progress (0–1) comes in. At the end it gathers out of the bar's far end, where the bar puts it once
//             it's full, and hops. dur Infinity: the bar calls end() (stopped early, it gathers out where it went in).
//   slump     an error: it notices (rects[1], the words), slumps into a puddle of itself, peeks at Retry (rects[0]) and
//             pulls itself back up with a shake. Never sad at you; Retry works the whole time.
//   stamp     "Me too": a thrown drop lands on the button (rects[0]) as a seal, holds, and dries away.
//   planeOff  sharing: it folds into a paper plane of ink, flies off, loops round and lands back as itself.
//   planeIn   an answer arrived: a paper plane of ink glides in and lands where it stands, unfolding into it.
//   shake     a new theme: it shakes itself like something wet (the app's theme-wipe spreads the theme from under it).
//
// Built on lex-character's rig: drawDrop and its morph, SHAPES.plane, throwPose and throwLaunch, hop, alive; the flight,
// splat and seal are this folder's (throw.js, field.js). Pure functions of (t, T, rects, data), except stamp, which
// keeps the button's last box (the page may redraw it mid-throw).

import { drawDrop, inkPalette } from "../inkdrop/inkdrop.js";
import { compose } from "../inkdrop/clips.js";
import { SHAPES } from "../inkdrop/shapes.js";
import { MATERIALS } from "../inkdrop/liquid-clips.js";
import { throwLaunch, throwPose } from "../inkdrop/throw.js";
import { detailFor } from "../inkdrop/tinta.js";
import { impactEnergy } from "../kit/liquid.js";
import { alive, clamp01, hop, inOut, outBack, ring, smooth } from "../kit/acting.js";
import { f2 } from "../kit/geom.js";
import { flight, drawFlying, drawInk, shapes, boxAround } from "./throw.js";
import { loopArea, sdStroke } from "./field.js";

const A = MATERIALS.A;
const HOME = { x: 0, y: 0, px: 116 };
const HALF = 64; // half the part's box (VIEW's width): a bar puts it with its box's edge on the bar's end

const span = (t, t0, d) => clamp01((t - t0) / d);
const lerp = (a, b, u) => a + (b - a) * u;
const Y = (q) => [q[0], -q[1]]; // screen (y down) ↔ the ink's y up
const center = (r) => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
const sway = (T) => 0.05 * Math.sin(T * 1.7); // idle's own sway, so an act starts and ends where idle is

const HAPPY = { closed: ["happy", "happy"], mouth: { type: "open", open: 0.7, w: 16 }, brows: { show: 0, raise: [0, 0], tilt: [0, 0] } };
const SMILE = { mouth: { type: "smile", smile: 1.2, w: 11 }, brows: { show: 0, raise: [0, 0], tilt: [0, 0] } };
const HM = { mouth: { type: "o", open: 0.35, w: 8 } };
const mulLook = (l, w) => [l[0] * w, l[1] * w];
const lift = (h) => ({ y: h.y, squash: h.squash, bend: h.bend }); // a kit hop as a pose layer (its y goes in `air`)
const eyesAt = (D) => [D.x, D.y - 32 * (D.px / 116)];
const lookTo = (from, to) => { const dx = to[0] - from[0], dy = -(to[1] - from[1]), l = Math.hypot(dx, dy) || 1; return [(0.9 * dx) / l, (0.75 * dy) / l]; };

/** The pose placed at D = { x, y (its ground point, screen units), px (its height), flip }: `y` stays its ground and a
 * hop's lift goes in the rig's `air`, so its puddle stays down while it's in the air. */
const placed = (pose, D) => ({ ...pose, flip: D.flip ?? pose.flip ?? false, curl: 1 + (pose.curl ?? 0), x: D.x, y: -D.y, air: (pose.y ?? 0) * (D.px / 116), scale: D.px / 116 });

/** Its pose at clock T: idle's life and sway, the act's layers on top, A's liquid rippling only after each impact
 * ([{ t, e }] on the clock): smooth at rest, with a ripple only while it moves (the rig's liquid has no base ripple).
 * throwPose's bulb (ink gathering at the tip) goes in the liquid. */
function dropPose(T, layers, impacts) {
  const s = sway(T);
  const { bulb = 0, ...p } = compose(alive(T, 43, 0.8), { lean: s }, ...layers);
  return { ...p, liquid: { t: T, wave: A.waveK * impactEnergy(T, impacts), seed: A.seed, foot: A.foot, rim: true, puddle: A.puddle, slosh: [-s * 30, 0], bulb } };
}

/** A shape it becomes, given in screen units: lex-character's morph format, in its own units round its ground point. */
function morphTo(D, poly, eyes, eyeScale, t, mouth = null) {
  const k = D.px / 116, L = ([x, y]) => [(x - D.x) / k, (D.y - y) / k];
  let to = poly.map(L);
  if (loopArea(to) < 0) to = to.reverse(); // its outline runs counter-clockwise
  return { to, eyes: eyes.map(L), eyeScale, mouth, t };
}
/** While it's a shape it holds the shape exactly: its life's squash, lean and breathing fade out as it becomes one. */
const holdShape = (p, m) => ({ ...p, squash: (p.squash ?? 0) * (1 - Math.min(1, m)), lean: (p.lean ?? 0) * (1 - Math.min(1, m)), bend: (p.bend ?? 0) * (1 - Math.min(1, m)), belly: lerp(p.belly ?? 1, 1, Math.min(1, m)) });
/** A rounded rectangle as a polygon (screen units). */
function rrPoly(x0, y0, x1, y1, r, n = 10) {
  const pts = [], rr = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  for (const [cx, cy, a0] of [[x1 - rr, y0 + rr, -Math.PI / 2], [x1 - rr, y1 - rr, 0], [x0 + rr, y1 - rr, Math.PI / 2], [x0 + rr, y0 + rr, Math.PI]]) {
    for (let i = 0; i <= n; i++) { const a = a0 + (i / n) * (Math.PI / 2); pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
  }
  return pts;
}
// A puddle of itself, low, with room for its eyes to peek (SHAPES.puddle is a thin film: at card sizes its eyes vanish).
const MOUND = { to: Array.from({ length: 120 }, (_, i) => { const a = (2 * Math.PI * i) / 120; return [62 * Math.cos(a), 13 + 13 * Math.sin(a)]; }), eyes: [[-16, 16], [16, 16]], eyeScale: 0.6, mouth: null };
/** Tinta's seal: a scalloped round of ink with a check pressed out of it (y up). */
const sealField = (c, r) => { const ring0 = shapes.seal(c, r), check = (q) => sdStroke(q, [[c[0] - r * 0.42, c[1] + r * 0.02], [c[0] - r * 0.12, c[1] - r * 0.3], [c[0] + r * 0.45, c[1] + r * 0.32]], r * 0.13); return (q) => Math.max(ring0(q), -check(q)); };

/** What every act shares: its palette, its outline's detail for its size, units per CSS px, and drawing it at D. */
function kit({ palette = "dark", size = 72 } = {}) {
  const pal = inkPalette(palette);
  const sized = detailFor(size);
  return { pal, u: 130 / size, draw: (pose, D = HOME) => drawDrop({ ...placed(pose, D), ...sized }, palette) };
}

// ---- pour: a download ------------------------------------------------------------------------------------------------

export function pour(options) {
  const { u, draw } = kit(options);
  const T_IN = 0.3, IN = 0.3, RUN = 0.22, OUT = 0.3;
  return {
    name: "pour", dur: Infinity, exit: 1.75,
    frame(t, T, { rects = [], data = null, endedAt = null } = {}) {
      const r = rects[0];
      if (!r) return draw(dropPose(T, [], []));
      const T0 = T - t;
      const [x0, y0, x1, y1] = r, h = Math.max(1, y1 - y0);
      const p = clamp01(Number(data?.progress) || 0);
      // Where it stands: on the bar's near end while it runs, its far end once it's full (the bar moves its box there
      // when it's done, so it settles where it gathered out). Stopped early, it gathers out where it went in.
      const tOut = endedAt === null ? Infinity : Math.max(endedAt, T_IN + IN), s = t - tOut;
      const out = s >= 0, full = p >= 1;
      const near = { x: x0 + HALF, y: y0, px: 116 }, far = { x: x1 - HALF, y: y0, px: 116 };
      const D = out && full ? far : near;
      // Up on its toes, then it pours itself down into the bar and is its fill to the front, its eyes riding the front.
      const stretch = 0.22 * Math.sin(Math.PI * span(t, 0, 0.27));
      // At the end its ink runs along the bar to the end it comes out at (the bar's own fill left behind), then rises
      // out of it as itself.
      const run = out ? inOut(span(s, 0, RUN)) : 0;
      const mIn = smooth(span(t, T_IN, IN)), mOut = out ? inOut(span(s, RUN, OUT)) : 0;
      const m = mIn * (1 - mOut);
      const front = x0 + Math.max(1.6 * h, (x1 - x0) * p);
      const keep = 2.2 * h; // what's left of it in the bar once it has run to the end
      const backEnd = full ? lerp(x0, x1 - keep, run) : x0, frontEnd = full ? front : lerp(front, x0 + keep, run);
      // Out at the far end it lands with a jelly and hops (a stopped download: no hop).
      const up = RUN + OUT;
      const hp = out && full ? hop(s, up + 0.3, { air: 0.36, h: 70 }) : { y: 0, squash: 0, bend: 0 };
      const landed = out && s > up ? 0.3 * ring(s - up, 2.6, 0.3) : 0;
      const happy = out && full && s > up && s < up + 1.1 ? HAPPY : {};
      const look = t < 0.3 ? mulLook(lookTo(eyesAt(near), [x0 + h, y0 + h / 2]), span(t, 0.03, 0.12)) : out && s > up ? [0, 0] : full || !out ? [0.85, -0.35] : [-0.85, -0.35];
      const impacts = [{ t: T0 + T_IN + 0.15, e: 1.0 }, ...(out ? [{ t: T0 + tOut + RUN, e: 0.5 }, { t: T0 + tOut + up, e: 0.8 }] : [])];
      let pose = dropPose(T, [{ squash: m > 0.02 ? 0 : -stretch + landed }, lift(hp), { face: { look, ...happy } }], impacts);
      if (m > 0.001) {
        const eyeY = y0 + 0.46 * h, eyeScale = Math.min(0.6, Math.max(0.3, (0.42 * h) / (10 * u)));
        const eyes = full || !out ? [[frontEnd - 1.2 * h, eyeY], [frontEnd - 0.5 * h, eyeY]] : [[backEnd + 0.5 * h, eyeY], [backEnd + 1.2 * h, eyeY]];
        pose = { ...holdShape(pose, m), morph: morphTo(D, rrPoly(backEnd, y0, frontEnd, y1, h / 2), eyes, eyeScale, m) };
      }
      return draw(pose, D);
    },
  };
}

// ---- slump: an error ---------------------------------------------------------------------------------------------------

export function slump(options) {
  const { draw } = kit(options);
  return {
    name: "slump", dur: 3.0, exit: 0,
    frame(t, T, { rects = [] } = {}) {
      const T0 = T - t, eyes = eyesAt(HOME);
      const retry = rects[0] ? center(rects[0]) : [140, -40];
      const said = rects[1] ? center(rects[1]) : [-140, -40];
      // It notices (a look at what went wrong), a small stretch up, then it slumps under its own weight into a puddle
      // and peeks at Retry from there; it pulls itself back up with a shake-off, tidy, and looks at Retry.
      const upS = span(t, 0.5, 0.16), down = span(t, 0.66, 0.3), rise = span(t, 1.8, 0.32);
      const m = Math.min(1, down ** 2) * (1 - inOut(rise));
      const shake = t > 2.15 && t < 2.55 ? 0.09 * Math.sin(2 * Math.PI * 7 * (t - 2.15)) * (1 - span(t, 2.15, 0.4)) : 0;
      const squash = m > 0.05 ? 0 : -0.2 * inOut(upS) * (1 - down) - 0.28 * Math.sin(Math.PI * rise) + (t > 2.12 ? 0.28 * ring(t - 2.12, 2.7, 0.3) : 0);
      const back = 1 - smooth(span(t, 2.7, 0.3)); // its eyes come back to you as it ends
      const look = t < 0.05 ? [0, 0] : t < 0.5 ? mulLook(lookTo(eyes, said), span(t, 0.05, 0.1)) : t < 1.05 ? [0, -0.3] : t < 1.8 ? lookTo(eyes, retry) : t < 2.15 ? [0, 0.1] : mulLook(lookTo(eyes, retry), back);
      const face = { look, ...(t > 0.1 && t < 2.15 ? HM : {}) };
      let pose = dropPose(T, [{ squash, lean: shake }, { face }], [{ t: T0 + 0.95, e: 1.0 }, { t: T0 + 2.12, e: 0.8 }, { t: T0 + 2.15, e: 0.5 }]);
      if (m > 0.001) pose = { ...holdShape(pose, m), morph: { ...MOUND, t: m } };
      return draw(pose);
    },
  };
}

// ---- stamp: "Me too" ------------------------------------------------------------------------------------------------------

export function stamp(options) {
  const { pal, u, draw } = kit(options);
  const SPEED = 1.2, POWER = 1.4, TR = 0.08 + 0.36 / SPEED, G = 2000 * u; // a snappy cartoon arc: 2000 CSS px/s²
  const HOLD = 1.0, DRY = 0.45;
  let last = null;
  return {
    name: "stamp", dur: 2.9, exit: 0,
    frame(t, T, { rects = [], data = null } = {}) {
      // The button as it is, else as it was last seen, else as it was when pressed (data.box: the page may have drawn
      // a new one before the act's first frame).
      if (rects[0]) last = rects[0];
      else if (!last && Array.isArray(data?.box)) last = data.box;
      if (!last) return draw(dropPose(T, [], []));
      const T0 = T - t, [x0, y0, , y1] = last, h = y1 - y0;
      // Its top corner on the near side, like a sticker half over the edge: clear of the button's words (their tops are
      // about a third of its height down), whatever its width.
      const at = [x0 + 0.24 * h, y0 + 0.06 * h], R = 0.22 * h;
      const e = eyesAt(HOME), dir = [at[0] - e[0], -(at[1] - e[1])];
      const layers = (tt) => throwPose(TR + (tt - TR) * SPEED, TR, dir, { power: POWER });
      const p0 = dropPose(T0 + TR, [layers(TR)], []);
      const L = throwLaunch({ ...p0, curl: 1 + (p0.curl ?? 0), x: 0, y: 0, air: 0, scale: 1 }, TR, dir, { power: POWER });
      const from = [L.at[0], -L.at[1]];
      const fl = flight(t, { t0: TR, from: Y(from), to: Y(at), h: 12 * u, r: L.r, g: G });
      const sL = t - fl.impactT;
      const lookW = 1 - span(t, TR + 0.3 / SPEED, 0.6 / SPEED) * (sL > 0.6 ? 1 : 0);
      const look = t < TR - 0.3 ? mulLook(lookTo(e, at), span(t, 0, 0.1)) : fl.phase === "fly" ? lookTo(e, Y(fl.c)) : mulLook(lookTo(e, at), 1 - span(sL, 1.0, 0.4));
      const nod = sL > 0.25 ? 0.18 * ring(sL - 0.25, 2.2, 0.3) : 0;
      const glad = sL > 0.3 && sL < 1.7 ? SMILE : {};
      const pose = dropPose(T, [layers(t), { squash: nod }, { face: { look: mulLook(look, Math.max(lookW, 0.0)), ...glad } }], [{ t: T0 + TR, e: 0.55 * POWER }, { t: T0 + fl.impactT, e: 0.18 }]);
      let s = draw(pose) + drawFlying(fl, pal);
      // The seal: the drop squashes onto the button and spreads into its stamp (outBack), holds, then dries away.
      if (sL >= 0 && sL < 0.16 + HOLD + DRY) {
        const g = outBack(span(sL, 0, 0.16), 1.8), r = R * Math.max(0.3, g);
        const flat = 1 - smooth(span(sL, 0, 0.08));
        const c = Y(at);
        const field = flat > 0.01 ? (q) => Math.hypot(q[0] - c[0], (q[1] - c[1]) * (1 + 1.2 * flat)) - r * (0.6 + 0.4 * (1 - flat)) : sealField(c, r);
        const dry = span(sL, 0.16 + HOLD, DRY);
        const ink = drawInk([{ field, box: boxAround(c, R * 1.8) }], pal, { res: 0.25 * u, k: 0.6 * u });
        s += dry > 0 ? `<g opacity="${f2(1 - smooth(dry))}">${ink}</g>` : ink;
      }
      return s;
    },
  };
}

// ---- the paper plane: sharing, and an answer arriving ------------------------------------------------------------------------

const PLANE = SHAPES.plane;
/** The fold line on the plane (its crease), in its shade, once it's mostly a plane. */
const crease = (D, m, pal) => {
  if (m < 0.85) return "";
  const k = D.px / 116, pts = PLANE.fold.map(([x, y]) => [D.x + x * k, D.y - y * k]);
  return `<path d="M${pts.map((q) => `${f2(q[0])},${f2(q[1])}`).join(" L")}" fill="none" stroke="${pal.shade}" stroke-width="${f2(1.6 * k)}" stroke-linecap="round" opacity="${f2((m - 0.85) / 0.15)}"/>`;
};
/** The plane at a point of its flight, its nose along the way it's going (deg, screen y down), rotating about its middle. */
const flown = (svg, [x, y], deg) => `<g transform="translate(${f2(x)},${f2(y)}) rotate(${f2(deg)} 0 -64)">${svg}</g>`;
const planeAt = (T, m, D, pal, draw, impacts, extra = []) => {
  const pose = dropPose(T, [{ squash: 0 }, ...extra], impacts);
  const shaped = m > 0.001 ? { ...holdShape(pose, m), morph: { ...PLANE, t: m } } : pose;
  return draw(shaped, D) + crease(D, m, pal);
};

export function planeOff(options) {
  const { pal, u, draw } = kit(options);
  const AWAY = 460 * u, UP = 150 * u;
  return {
    name: "plane-off", dur: 4.4, exit: 0,
    frame(t, T) {
      const T0 = T - t;
      // A crouch, then it folds into the plane (0.3–0.65) and holds a beat; off it goes, up and away to the right,
      // speeding up; round behind, it comes back in from the left and glides down onto its spot, flares, lands, and
      // unfolds into itself with a jelly settle and a smile.
      const crouch = 0.25 * inOut(span(t, 0.05, 0.25)) * (1 - span(t, 0.3, 0.1));
      const fold = Math.min(1, outBack(span(t, 0.3, 0.35), 1.2)), unfold = inOut(span(t, 3.45, 0.35));
      const m = fold * (1 - unfold);
      let x = 0, y = 0, deg = 0;
      if (t >= 0.8 && t < 1.7) {
        const a = span(t, 0.8, 0.9), e = a * a; // speeding up
        x = AWAY * e; y = -UP * e * (2 - e) * 0.9;
        deg = -14 - 10 * a;
      } else if (t >= 1.7 && t < 2.35) {
        x = AWAY * 2; // round behind, out of sight
      } else if (t >= 2.35 && t < 3.45) {
        const a = span(t, 2.35, 1.1), e = 1 - (1 - a) ** 2; // slowing down
        x = -AWAY * (1 - e); y = -UP * 0.7 * (1 - e) ** 2;
        deg = 8 * (1 - a) - 12 * Math.sin(Math.PI * span(a, 0.75, 0.25)); // a flare as it touches down
      }
      if (m < 0.001) {
        const settle = t > 3.8 ? 0.3 * ring(t - 3.8, 2.8, 0.3) : 0;
        const happy = t > 3.7 && t < 4.3 ? SMILE : {};
        return draw(dropPose(T, [{ squash: crouch + settle }, { face: happy }], [{ t: T0 + 0.3, e: 0.5 }, { t: T0 + 3.8, e: 0.8 }]));
      }
      return flown(planeAt(T, m, HOME, pal, draw, [{ t: T0 + 0.3, e: 0.5 }, { t: T0 + 3.45, e: 0.6 }]), [x, y], deg);
    },
  };
}

export function planeIn(options) {
  const { pal, u, draw } = kit(options);
  const FROM = 320 * u, UP = 150 * u;
  return {
    name: "plane-in", dur: 2.7, exit: 0,
    frame(t, T) {
      const T0 = T - t;
      // In from high on the right, nose first (a mirrored plane), gliding down and slowing, a flare as it touches down
      // on its spot; then it unfolds into itself, lands with a jelly and smiles.
      const a = span(t, 0, 1.2), e = 1 - (1 - a) ** 2;
      const x = FROM * (1 - e), y = -UP * (1 - e) ** 2;
      const deg = -16 * (1 - a) + 12 * Math.sin(Math.PI * span(a, 0.75, 0.25));
      const m = 1 - inOut(span(t, 1.25, 0.35));
      if (m < 0.001) {
        const settle = t > 1.6 ? 0.3 * ring(t - 1.6, 2.8, 0.3) : 0;
        const happy = t > 1.65 && t < 2.5 ? HAPPY : {};
        return draw(dropPose(T, [{ squash: settle }, { face: happy }], [{ t: T0 + 1.6, e: 0.8 }]));
      }
      return flown(`<g transform="scale(-1,1)">${planeAt(T, m, HOME, pal, draw, [{ t: T0 + 1.2, e: 0.6 }])}</g>`, [x, y], deg);
    },
  };
}

// ---- shake: a new theme -------------------------------------------------------------------------------------------------------

export function shake(options) {
  const { draw } = kit(options);
  return {
    name: "shake", dur: 1.8, exit: 0,
    frame(t, T) {
      const T0 = T - t;
      // It shakes itself like something wet: fast side to side, dying away, eyes squeezed; then it's glad.
      const a = t < 0.6 ? Math.sin(2 * Math.PI * 7.5 * t) * (1 - span(t, 0, 0.6)) : 0;
      const glad = t >= 0.6 && t < 1.6;
      const face = glad ? HAPPY : t < 0.6 ? { closed: ["squeeze", "squeeze"] } : {};
      return draw(dropPose(T, [{ lean: 0.16 * a, squash: 0.08 * Math.abs(a), tip: 0.35 * a, bend: -0.1 * a }, { face }], [{ t: T0, e: 0.9 }, { t: T0 + 0.3, e: 0.6 }]));
    },
  };
}

export const ACTS = { pour, slump, stamp, planeOff, planeIn, shake };
/** The part's drawing box (tinta.js VIEW): a page measuring something against Tinta, in its units, uses it. */
export { VIEW } from "../inkdrop/tinta.js";
