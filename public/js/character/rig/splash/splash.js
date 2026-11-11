// Generated from the character's rig (08-lexicommons/docs/design/character/rig/splash/splash.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// The splash screen: Tinta's first appearance, made out of ink in front of you, so the app opens on where its character
// comes from.
//
// One continuous shot, a pure function of time, framed for any screen (phone, tablet, desktop; either theme):
//   a drop of ink hangs on the app's black, a finished mark for as long as the app takes to draw (t = 0 is the launch
//   image and the first paint on every start). It sags a little, lets go, and falls from rest while the camera pushes in and
//   down with it. It splats on its little ground, then bounces back up as the character (variation A, the liquid drop),
//   its eyes opening on the way up, and settles.
// Plain ink until it comes alive: the drop, the fall and the splat have no face. (An earlier shot began on a pen dipping into an
// inkwell, kept in splash-pen.js; its first frame held still on every start, so this one opens on the drop, already in motion.)
//
// scene(t, theme)         the world (SVG, y up flipped like the rig's), drawn at world units
// camera(t, vw, vh)       { cx, cy, s }: the world point at the screen's center, and pixels per unit
// frame(t, vw, vh, theme) the whole picture, a <svg> of vw × vh px (the app draws the same at its own size)
// fallFrames(w, h)        the hold's end and the fall alone as transforms, for the compositor: see below
// DUR                     when it has settled (the app fades it out after; Animations Off shows frame(DUR))

import { drawDrop, PALETTES } from "../inkdrop/inkdrop.js";
import { SHAPES } from "../inkdrop/shapes.js";
import { EXPRESSIONS } from "../inkdrop/poses.js";
import { compose, faceMix } from "../inkdrop/clips.js";
import { MATERIALS } from "../inkdrop/liquid-clips.js";
import { alive, clamp01, droplet, keys, outBack, outCubic, ring, span } from "../kit/acting.js";
import { drawSplat, impactEnergy, splatMark } from "../kit/liquid.js";
import { ellipse, f2, smoothPath } from "../kit/geom.js";

const A = MATERIALS.A;

// ---- Themes: the app's canvas and the ground, the drop's own palette. ------------------------------------------------
export const THEMES = {
  dark: { bg: "#000000", ground: "#1d1c19", pal: "dark" },
  light: { bg: "#FDFDFC", ground: "#E4E2DD", pal: "light" },
};
/**
 * A theme by name; { name, ink } (a theme by name drawn in another ink: a palette object as inkdrop.js's, the app's splash easing
 * from the default ink to a theme's); or { th, pal } as it is (the app's generator draws with one stand-in color per role).
 */
const themeOf = (theme) => {
  if (typeof theme === "string") return { th: THEMES[theme], pal: PAL[theme] };
  if (theme.ink) return { th: { ...THEMES[theme.name ?? "dark"], pal: theme.ink }, pal: inkFamily(theme.ink) };
  return theme;
};
export { PAL };

// The drop's own colors are its palette's ink (inkdrop.js PALETTES): the body, its shade, its light.
const inkFamily = (P) => ({ body: P.body, shade: P.shade, light: P.light });
const PAL = { dark: inkFamily(PALETTES.dark), light: inkFamily(PALETTES.light) };


// ---- The set (world units: the drop is ~117 tall; ground y = 0; it lands at x = 0). --------------------------------
const R = 46;                                   // the drop's radius: about the character's own area (8136)
const G = 900;                                  // gravity, units/s²
const REST_Y = R + 150;                         // where the drop's round part hangs
const REST_STRETCH = 1.36;                      // a teardrop at rest: its point up
const height = (s) => R * (2 + (s - 1) * 2.2);  // tip to bottom, at a stretch (kit/liquid.js's teardrop)
const CENTER_Y = REST_Y + (height(REST_STRETCH) - 2 * R) / 2; // the first frame centers the whole drop, not its round part
const BOX = 250;                                // the first frame's square: the drop's about 37% of the screen's shorter side

// ---- Timing (s). Each beat: hold, anticipation, action, overshoot, settle. (The hold is the app's: t = 0 lasts until it has drawn.) -----
const T = { release: 0.1 };
T.hit = T.release + Math.sqrt((2 * (REST_Y - R)) / G);
T.gather = T.hit + 0.1; T.takeoff = T.hit + 0.32; T.air = 0.26; T.land = T.takeoff + T.air;
export const DUR = T.land + 0.78;

/** The drop before it hits: it sags as it's about to let go, then falls from rest, drawn out by its speed. */
function dropAt(t) {
  const sag = 0.03 * clamp01(t / T.release) ** 2;
  const tf = Math.max(0, t - T.release);
  return { c: [0, REST_Y - 0.5 * G * tf * tf], stretch: REST_STRETCH + sag + Math.min(0.18, G * tf * 0.00042) };
}

function shine(c, r, stretch, pal) {
  const h = ellipse(c[0] - r * 0.38, c[1] + r * 0.32 * stretch, r * 0.2, r * 0.36 * stretch, 24, -0.6);
  return `<path d="${smoothPath(h)}" fill="${pal.light}"/><circle cx="${f2(c[0] - r * 0.22)}" cy="${f2(-(c[1] + r * 0.58 * stretch))}" r="${f2(r * 0.07)}" fill="#FFFFFF"/>`;
}


/** The character's pose after it lands (t ≥ T.hit): splat, gather, bounce, come alive. */
function dropPose(t) {
  const u = t - T.hit;
  const impacts = [{ t: T.hit, e: 1.9 }, { t: T.land, e: 0.7 }];
  const spread = Math.min(1, outCubic(u / 0.07));
  const m = t < T.gather ? 1 : 1 - outCubic(span(t, T.gather, T.takeoff - T.gather - 0.02));
  let y = 0, squash = 0, bend = 0;
  if (t < T.takeoff) {
    // Springing up out of the splat: stretching tall as it gathers.
    squash = -0.36 * Math.sin(Math.PI * 0.5 * span(t, T.gather + 0.05, T.takeoff - T.gather - 0.05));
  } else if (t < T.land) {
    const a = (t - T.takeoff) / T.air, H = 18;
    y = 4 * H * a * (1 - a);
    const vy = (4 * H * (1 - 2 * a)) / T.air;
    squash = -Math.min(0.34, Math.abs(vy) * 0.0018) * (vy > 0 ? 1 : 0.5);
    bend = -vy * 0.001;
  } else {
    const w = t - T.land;
    squash = 0.34 * ring(w, 3.0, 0.3);
    bend = 0.14 * ring(w, 2.3, 0.3);
  }
  // Its eyes open on the way up (a pop), wide at the top; it lands delighted, then settles, looking at you.
  const eyes = t < T.takeoff + 0.04 ? 0 : outBack(span(t, T.takeoff + 0.04, 0.16), 2.2);
  let face;
  if (t < T.land + 0.04) face = faceMix("surprised", "surprised", 0);
  else if (t < T.land + 0.42) face = faceMix("surprised", "delighted", span(t, T.land + 0.04, 0.08));
  else face = faceMix("delighted", "neutral", span(t, T.land + 0.42, 0.22));
  const life = t > T.land + 0.3 ? alive(t, 43, 0.8) : {};
  const p = compose(life, face, { air: y, squash, bend });
  p.face = { ...p.face, eyeScale: [eyes, eyes] };
  // It ripples only from what moves it (the fall, the splat, the bounce's landing): none at rest, so a still is a clean curve.
  p.liquid = { t, wave: A.waveK * impactEnergy(t, impacts), seed: A.seed, foot: A.foot, rim: true, puddle: A.puddle * (m > 0.5 ? 0.7 : 1) };
  if (m > 0.001) {
    const sx = 1.25 * (0.55 + 0.45 * spread), sy = 1.6;
    p.morph = { ...SHAPES.puddle, to: SHAPES.puddle.to.map(([x, yy]) => [x * sx, yy * sy]), eyes: [[-20, 10], [20, 10]], t: m };
  }
  return p;
}

const drawCharacter = (p, palName) => drawDrop({ ...p, curl: 1 + (p.curl ?? 0) }, palName);

/** Drops thrown by the splat: they arc out and land as small splats that stay. */
function thrown(t, pal, n = 64) {
  let s = "";
  for (let i = 0; i < 7; i++) {
    const side = i % 2 ? 1 : -1, vx = side * (110 + 70 * ((i * 37) % 7) / 7), vy = 170 + 90 * (((i * 53) % 5) / 5);
    const d = droplet(t, T.hit, [side * 40, 8], [vx, vy], { g: G, r: 3.4 + (i % 3) * 1.1, stick: 1.2 });
    if (!d) continue;
    if (!d.landed) s += `<circle cx="${f2(d.c[0])}" cy="${f2(-d.c[1])}" r="${f2(d.r)}" fill="${pal.body}"/>`;
    else s += drawSplat(splatMark(70 + i, { r: 4.6 + (i % 2), h: 1.8, dots: 0, n }), d.c[0], { grow: 1, fade: 0, color: pal.body, dry: pal.shade });
  }
  return s;
}

/** The whole world at t (SVG in world units, y flipped). */
let sceneCount = 0;
/** The drop's pose at t with its sizing; calm (a still) takes away any ripple. */
function posed(t, { calm = false, ...sized } = {}) {
  const p = { ...dropPose(t), ...sized };
  if (calm && p.liquid) p.liquid = { ...p.liquid, wave: 0 };
  return p;
}

/** sized: the drop's detail, points and compact (the app; the reels draw it at full detail); calm: drawn as a still
 * (no ripple: the static first and last frames). */

/** The teardrop: one smooth curve from its point round its belly (no shoulder where a cone would meet a ball), its round part at c, radius r. */
function teardrop(c, r, stretch) {
  const H = height(stretch) * (r / R), n = 72, m = 1.45;
  // The classic drop curve; its widest is scaled to the radius. u = 0 is the point, u = pi the bottom.
  let widest = 0;
  for (let i = 0; i <= 200; i++) { const u = (Math.PI * i) / 200; widest = Math.max(widest, Math.sin(u) * Math.sin(u / 2) ** m); }
  const bottom = c[1] - r;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const u = (2 * Math.PI * i) / n;
    const side = Math.sin(u) * Math.abs(Math.sin(u / 2)) ** m;
    // (Eased so its belly is as round as a drop's, not an onion's, with no point at the bottom.)
    const v = (1 + Math.cos(u)) / 2;
    pts.push([c[0] + (r * side) / widest, bottom + H * (v + 0.26 * v * (1 - v))]);
  }
  return smoothPath(pts);
}

function drawFall(t, pal) {
  const d = dropAt(t);
  return `<path d="${teardrop(d.c, R, d.stretch)}" fill="${pal.body}"/>` + shine(d.c, R, d.stretch, pal);
}

/** The ground comes up with the hit: nothing shows it before there's a splat on it. */
const groundLine = (t, th) => (t < T.hit ? "" : `<line x1="-4000" y1="0" x2="4000" y2="0" stroke="${th.ground}" stroke-width="1.4" opacity="${f2(clamp01((t - T.hit) / 0.16))}"/>`);

export function scene(t, theme = "dark", id = `lx-splash-${sceneCount++}`, sized = {}) {
  const { th, pal } = themeOf(theme);
  let s = groundLine(t, th);
  if (t < T.hit) s += drawFall(t, pal);
  else {
    s += drawSplat(splatMark(9, { r: 54, h: 4.2, dots: 6 }), 0, { grow: outCubic((t - T.hit) / 0.12), fade: 0, color: pal.body, dry: pal.shade });
    s += thrown(t, pal);
    s += drawCharacter(posed(t, sized), th.pal);
  }
  return s;
}

// ---- The app's form. What the old shot drew once (the pen, the inkwell) is gone; these keep their names, empty, for splash-run.js. ------
const WHOLE = '<rect x="-5000" y="-5000" width="10000" height="10000"/>';
export function stillParts(theme = "dark", id = "lx-splash") {
  return { ground: "", well: `<clipPath id="${id}-opening">${WHOLE}</clipPath>`, pen: "", penClip: `<clipPath id="${id}-pen">${WHOLE}</clipPath>`, openingClip: `${id}-opening` };
}

/** What's drawn at t: only the ink. sized: the drop's detail, points and compact. */
export function movingParts(t, theme = "dark", sized = {}) {
  const { th, pal } = themeOf(theme);
  let ink = groundLine(t, th);
  if (t < T.hit) ink += drawFall(t, pal);
  else {
    ink += drawSplat(splatMark(9, { r: 54, h: 4.2, dots: 6, n: 32 }), 0, { grow: outCubic((t - T.hit) / 0.12), fade: 0, color: pal.body, dry: pal.shade });
    ink += thrown(t, pal, 14);
    ink += drawCharacter(posed(t, sized), th.pal);
  }
  return { pen: "translate(0,0)", penInk: "", ripples: "", underPen: "", ink };
}

// ---- The camera: one move. It starts centered on the drop, the drop about 37% of the shorter side; as the drop falls it pushes in and down
// with it, on one rise and fall of speed, and lands on the character on its ground at about 40% of the screen's height.
const END = T.land + 0.5;
const bump = (t, m, sd) => Math.exp(-(((t - m) / sd) ** 2));
function progress(speed) {
  const n = 600, out = [0];
  let acc = 0;
  for (let i = 1; i <= n; i++) { acc += speed((END * (i - 0.5)) / n) * (END / n); out.push(acc); }
  return (t) => { const x = Math.min(n, Math.max(0, (t / END) * n)), a = Math.floor(x), f = x - a; return (out[a] + (out[Math.min(n, a + 1)] - out[a]) * f) / acc; };
}
const PUSH = progress((t) => bump(t, T.hit - 0.02, 0.26));

/** The first frame's and the last frame's framing as boxes (world units) a viewBox can meet-fit: camera(0) and
 * camera(end) are exactly these, except the last on a screen wider than 2:1 (it shows the drop a little bigger there). */
export const FIRST_BOX = { x0: -BOX / 2, x1: BOX / 2, y0: CENTER_Y - BOX / 2, y1: CENTER_Y + BOX / 2 };
export const LAST_BOX = { x0: -75, x1: 75, y0: 58 - 146.25, y1: 58 + 146.25 };

export function camera(t, vw, vh) {
  const s0 = Math.min(vw, vh) / BOX;
  // The drop at about 40% of the screen's height (less on a narrow one); on a very wide screen a little more, so no more
  // than ~300 units show each side of it.
  const s1 = Math.max(Math.min(0.4 * vh, 0.78 * vw) / 117, vw / 600);
  const pz = t <= 0 ? 0 : PUSH(t);
  return { cx: 0, cy: CENTER_Y + (58 - CENTER_Y) * pz, s: s0 * (s1 / s0) ** pz, px: 0, pz };
}

export function frame(t, vw, vh, theme = "dark", { px = vw } = {}) {
  const { th } = themeOf(theme), cam = camera(t, vw, vh);
  const tr = `translate(${f2(vw / 2)},${f2(vh / 2)}) scale(${cam.s.toFixed(5)}) translate(${f2(-cam.cx)},${f2(cam.cy)})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${Math.round((px * vh) / vw)}" viewBox="0 0 ${vw} ${vh}"><rect width="${vw}" height="${vh}" fill="${th.bg}"/><g transform="${tr}">${scene(t, theme)}</g></svg>`;
}

/**
 * The sag and the fall as transforms alone, so the compositor can run them with the main thread busy: for element.animate() on the first
 * frame's own outer <svg> (.lx-splash-first, which fills the overlay and meet-fits FIRST_BOX, its transform-origin the default 50% 50%).
 * w, h: that element's size in CSS px (the web view's, not the screen's). `t` is the time it ends at: the live frames carry on from exactly
 * there, the drop a hair above the ground. Holding on its last keyframe (fill: "forwards") is the drop waiting just over the ground.
 */
export function fallFrames(w, h, { steps = 40 } = {}) {
  const t1 = T.hit - 1 / 120;
  const c0 = camera(0, w, h), d0 = dropAt(0);
  const bottom0 = (c0.cy - (d0.c[1] - R)) * c0.s; // the drop's bottom below the element's center, in the first frame
  const keyframes = [];
  for (let i = 0; i <= steps; i++) {
    const t = (t1 * i) / steps, c = camera(t, w, h), d = dropAt(t);
    const sx = c.s / c0.s, sy = (sx * height(d.stretch)) / height(d0.stretch);
    const ty = (c.cy - (d.c[1] - R)) * c.s - sy * bottom0;
    keyframes.push({ offset: i / steps, easing: "linear", transform: `translate(0px,${ty.toFixed(2)}px) scale(${sx.toFixed(4)},${sy.toFixed(4)})` });
  }
  return { selector: ".lx-splash-first", keyframes, duration: t1 * 1000, t: t1 };
}

export const TIMES = T;
