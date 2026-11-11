// Three's two stories, the stack's own: three apples, one resting in the saddle between two, its weight pressing them apart. Happy: they give a
// little (the two below slide out a few units, leaning, the top one sagging deeper), then the skins bite and they catch: the top apple drops
// into the deeper saddle, rocks once and settles. Three, holding. Sad: the right one gives: it rolls out from under, wedged on by the top
// apple sliding down the left one's shoulder, and away off the frame; the top apple lands in its place, rocks upright and settles. Two.
// Every frame is a pure function of t, in seconds. The still's three apples are one drawing, three times (moved 44 across and 80 down for
// the two below); each moves as a body: turned about its middle, resting on the floor where it touches it. The light is fixed, so each
// apple's shaded side stays where the light puts it however the apple turns.
import { n2, n4, paint, parsePath, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M99 47.5l.2-1.4c1 .2 1.8 .2 2.8 0l-.3 1.6c4.2-1.9 6.9-4.3 12-4.2 3.4 .1 8.3 5.5 10 8.2 7.4 11.6-1.2 29.1-9.6 37.8l-8.4 8.6c-1.6 1.6-2.9 3.4-4.1 5.3l-1.5-.2c-1 .6-2.4 .6-3.5 1.1-1.8 .8-3.5 1.6-5.4 1.9-8.2 1.3-14.7-5.2-19-11.3-8.1-11.6-13-28.6-4.7-41.3 2.4-3.6 5.8-6.7 9.8-8.6 2.8-1.4 5.9-2 9.1-2 5.2 0 8.2 2.3 12.6 4.5ZM55 127.5l.2-1.4c1 .2 1.8 .2 2.8 0l-.3 1.6c4.2-1.9 6.9-4.3 12-4.2 3.4 .1 8.3 5.5 10 8.2 7.4 11.6-1.2 29.1-9.6 37.8l-8.4 8.6c-1.6 1.6-2.9 3.4-4.1 5.3l-1.5-.2c-1 .6-2.4 .6-3.5 1.1-1.8 .8-3.5 1.6-5.4 1.9-8.2 1.3-14.7-5.2-19-11.3-8.1-11.6-13-28.6-4.7-41.3 2.4-3.6 5.8-6.7 9.8-8.6 2.8-1.4 5.9-2 9.1-2 5.2 0 8.2 2.3 12.6 4.5ZM143 127.5l.2-1.4c1 .2 1.8 .2 2.8 0l-.3 1.6c4.2-1.9 6.9-4.3 12-4.2 3.4 .1 8.3 5.5 10 8.2 7.4 11.6-1.2 29.1-9.6 37.8l-8.4 8.6c-1.6 1.6-2.9 3.4-4.1 5.3l-1.5-.2c-1 .6-2.4 .6-3.5 1.1-1.8 .8-3.5 1.6-5.4 1.9-8.2 1.3-14.7-5.2-19-11.3-8.1-11.6-13-28.6-4.7-41.3 2.4-3.6 5.8-6.7 9.8-8.6 2.8-1.4 5.9-2 9.1-2 5.2 0 8.2 2.3 12.6 4.5Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M99.9 103.5c1.2-1.9 2.5-3.8 4.1-5.4l8.1-8.2c6.8-7.1 12.4-17.5 12.8-27.5 .3-10.1-6.6-18.3-17-18 14.8-4.7 26.6 5.4 28.4 20 1.7 13.6-7.1 33.5-19.4 40-3.7 2-7.7 2.3-11.6 .9-1.9-.7-3.5-1.5-5.4-1.8ZM55.9 183.5c1.2-1.9 2.5-3.8 4.1-5.4l8.1-8.2c6.8-7.1 12.4-17.5 12.8-27.5 .3-10.1-6.6-18.3-17-18 14.8-4.7 26.6 5.4 28.4 20 1.7 13.6-7.1 33.5-19.4 40-3.7 2-7.7 2.3-11.6 .9-1.9-.7-3.5-1.5-5.4-1.8ZM143.9 183.5c1.2-1.9 2.5-3.8 4.1-5.4l8.1-8.2c6.8-7.1 12.4-17.5 12.8-27.5 .3-10.1-6.6-18.3-17-18 14.8-4.7 26.6 5.4 28.4 20 1.7 13.6-7.1 33.5-19.4 40-3.7 2-7.7 2.3-11.6 .9-1.9-.7-3.5-1.5-5.4-1.8Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M129.4 23.9c-2 6.5-5.6 13.1-12.5 15.2-4.8 1.4-12.8-1.6-14.9 3.5-1.5-1.5-1.6-3.6-2.3-5.6 .3-.2 .5-.5 .8-.8 .2 .2 .3 .5 .6 .7 3.6-7.4 7.5-12.3 16.3-13 4-.3 8 .9 12 0ZM85.4 103.9c-2 6.5-5.6 13.1-12.5 15.2-4.8 1.4-12.8-1.6-14.9 3.5-1.5-1.5-1.6-3.6-2.3-5.6 .3-.2 .5-.5 .8-.8 .2 .2 .3 .5 .6 .7 3.6-7.4 7.5-12.3 16.3-13 4-.3 8 .9 12 0ZM173.4 103.9c-2 6.5-5.6 13.1-12.5 15.2-4.8 1.4-12.8-1.6-14.9 3.5-1.5-1.5-1.6-3.6-2.3-5.6 .3-.2 .5-.5 .8-.8 .2 .2 .3 .5 .6 .7 3.6-7.4 7.5-12.3 16.3-13 4-.3 8 .9 12 0Z\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M102.1 47.6c-1.3 .4-2.2 .3-3.5-.2 .6-3.5 .2-7.1-1.9-10.2-.6-.7-1.6-1.4-1.9-2.3-.3-1 .6-2.5 1.6-2.7 1.7-.5 3.2 1.7 3.9 2.9 2.4 3.9 2.6 8.2 1.8 12.5ZM58.1 127.6c-1.3 .4-2.2 .3-3.5-.2 .6-3.5 .2-7.1-1.9-10.2-.6-.7-1.6-1.4-1.9-2.3-.3-1 .6-2.5 1.6-2.7 1.7-.5 3.2 1.7 3.9 2.9 2.4 3.9 2.6 8.2 1.8 12.5ZM146.1 127.6c-1.3 .4-2.2 .3-3.5-.2 .6-3.5 .2-7.1-1.9-10.2-.6-.7-1.6-1.4-1.9-2.3-.3-1 .6-2.5 1.6-2.7 1.7-.5 3.2 1.7 3.9 2.9 2.4 3.9 2.6 8.2 1.8 12.5Z\" fill=\"var(--art-ink,#231F3B)\"/>\n</svg>\n";
export const STILL_HASH = "b22b0daad7";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 5) throw new Error("three: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const DEG = Math.PI / 180;
// each color's path, cut into its three apples (the top one, the left, the right)
const each = (svg) => /d="([^"]+)"/.exec(svg)[1].split(/(?=M)/);
const BODY = each(EL[1]), SHADE = each(EL[2]), LEAF = each(EL[3]), STEM = each(EL[4]);
const TONES = ["clay", "clay-deep", "teal-deep", "ink"].map((t, i) => /fill="([^"]+)"/.exec(EL[i + 1])[1]);
// an apple's outline, as points
const outline = (d) => parsePath(d)[0].segs.flatMap((s) => [0, 0.25, 0.5, 0.75].map((t) => {
  const u = 1 - t;
  return [0, 1].map((j) => u * u * u * s[0][j] + 3 * u * u * t * s[1][j] + 3 * u * t * t * s[2][j] + t * t * t * s[3][j]);
}));
// (the still draws an apple as its lit part and its shaded part, side by side: the whole apple is both)
const OUT = BODY.map((d, i) => [...outline(d), ...outline(SHADE[i])]);
const box = (P) => [Math.min(...P.map((p) => p[0])), Math.min(...P.map((p) => p[1])), Math.max(...P.map((p) => p[0])), Math.max(...P.map((p) => p[1]))];
const MIDS = OUT.map((P) => { const b = box(P); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; });
const FLOOR = box(OUT[1])[3];
const HALF_W = (box(OUT[0])[2] - box(OUT[0])[0]) / 2;
// the shaded side as the light makes it: the still's shadow edge (the first stretch of each shade path, up from its foot), closed round
// far to the right, so that cut to the apple's turned outline it is the shaded part of whatever faces right
const TERMINATOR = SHADE.map((d) => {
  // the shade path runs up its shadow edge from its foot (a curve, a line, two curves) to the top, then round the outline back down
  const steps = d.match(/[a-zA-Z][^a-zA-Z]*/g), nums = steps[3].slice(1).match(/-?\d*\.?\d+/g).slice(0, 12).join(" ");
  if (steps[0][0] !== "M" || steps[1][0] !== "c" || steps[2][0] !== "l" || steps[3][0] !== "c") throw new Error("three: the shade isn't as this story knows it");
  return `${steps[0]}${steps[1]}${steps[2]}c${nums}l40-60l0 200z`;
});
const rot = ([x, y], a, c) => { const cs = Math.cos(a), sn = Math.sin(a); return [c[0] + cs * (x - c[0]) - sn * (y - c[1]), c[1] + sn * (x - c[0]) + cs * (y - c[1])]; };

// ---- an apple drawn at a pose: moved [dx, dy] and turned a (radians, clockwise) about its middle; on the floor if it rests there (the
// lowest point of its turned outline put on it)
function apple(i, dx, dy, a, onFloor) {
  const c = MIDS[i];
  if (onFloor) dy = FLOOR - Math.max(...OUT[i].map((p) => rot(p, a, c)[1]));
  const turn = `translate(${n2(dx)} ${n2(dy)}) rotate(${n2(a / DEG)} ${n2(c[0])} ${n2(c[1])})`;
  const still = Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9 && Math.abs(a) < 1e-9;
  if (still) return `<path d="${BODY[i]}" fill="${TONES[0]}"/><path d="${SHADE[i]}" fill="${TONES[1]}"/><path d="${LEAF[i]}" fill="${TONES[2]}"/><path d="${STEM[i]}" fill="${TONES[3]}"/>`;
  return `<clipPath id="a${i}"><path d="${BODY[i]}" transform="${turn}"/><path d="${SHADE[i]}" transform="${turn}"/></clipPath>`
    + `<g transform="${turn}"><path d="${BODY[i]}" fill="${TONES[0]}"/><path d="${SHADE[i]}" fill="${TONES[0]}"/></g>`
    // (the clip on a group with no move of its own: a clip is read in the space of what it's on)
    + `<g clip-path="url(#a${i})"><path d="${TERMINATOR[i]}" transform="translate(${n2(dx)} ${n2(dy)})" fill="${TONES[1]}"/></g>`
    + `<g transform="${turn}"><path d="${LEAF[i]}" fill="${TONES[2]}"/><path d="${STEM[i]}" fill="${TONES[3]}"/></g>`;
}
const scene = (poses) => `${OPEN}${EL[0]}${poses.map((p, i) => apple(i, ...p)).join("")}</svg>`;
// the top apple rests on the two below at this reach from each (the still's own spacing)
const REACH = Math.hypot(MIDS[0][0] - MIDS[1][0], MIDS[0][1] - MIDS[1][1]);
const HALF_GAP = (MIDS[2][0] - MIDS[1][0]) / 2;
const topDrop = (s) => (MIDS[1][1] - MIDS[0][1]) - Math.sqrt(REACH * REACH - (HALF_GAP + s) * (HALF_GAP + s));

// ---- happy: they give, and catch
const HAPPY_DUR = 2.1;
function happy(t) {
  if (t <= 0) return STILL;
  // the two below slide out (slow to start, the weight growing on them), then the skins bite: stopped short
  const s = track([[0.2, 0], [0.62, 11, "in"], [0.74, 13, "out"]], t);
  // and lean out under it as they go, rocking back nearly upright when they catch
  const lean = track([[0.2, 0], [0.62, 7 * DEG, "in"], [0.86, -2 * DEG, "io"], [1.06, 2 * DEG, "io"], [1.26, 1 * DEG, "io"]], t);
  // the top one sinks with them into the deeper saddle, a little past as they stop, and rocks once
  const sink = topDrop(s) + track([[0.62, 0], [0.8, 3, "out"], [0.96, -0.8, "io"], [1.1, 0, "io"]], t);
  const rock = track([[0.7, 0], [0.9, 4 * DEG, "io"], [1.12, -2.2 * DEG, "io"], [1.32, 0.7 * DEG, "io"], [1.5, 0, "io"]], t);
  return scene([[0, sink, rock, false], [-s, 0, -lean, true], [s, 0, lean, true]]);
}

// ---- sad: the right one gives
const SAD_DUR = 2.3;
// the top apple's path down the left one's shoulder: round the left apple's middle, from where it rests to the floor beside it
const SHOULDER = Math.atan2(MIDS[1][1] - MIDS[0][1], MIDS[0][0] - MIDS[1][0]);
const BESIDE = 2 * HALF_W + 1;
function sad(t) {
  if (t <= 0) return STILL;
  // the top apple sliding down: slow off the saddle, falling faster, landing at 1.1 s
  const u = track([[0.45, 0], [1.1, 1, "in"]], t);
  const ang = SHOULDER * (1 - u), reach = REACH + (BESIDE - REACH) * u;
  const top = [MIDS[1][0] + reach * Math.cos(ang) - MIDS[0][0], MIDS[1][1] - reach * Math.sin(ang) - MIDS[0][1]];
  // rolling a little on the shoulder as it goes, landing tipped; then a small hop and a rock back upright
  const tip = 18 * DEG * u + track([[1.1, 0], [1.32, -23 * DEG, "io"], [1.52, -15.5 * DEG, "io"], [1.7, -18 * DEG, "io"]], t);
  const hop = track([[1.1, 0], [1.2, -2.6, "out"], [1.3, 0, "in"]], t);
  const landed = t >= 1.1;
  // the right one: pushed from the start, wedged on by the top one, and away, turning as it rolls (its middle 34 off the floor)
  const vEnd = (2 * 64) / 0.6;
  const x = t <= 1.1 ? track([[0.2, 0], [0.5, 5, "in"], [1.1, 64, "in"]], t) : 64 + vEnd * 0.5 * (1 - Math.exp(-(t - 1.1) / 0.5));
  // the left one rocks as the top one pushes off it
  const lrock = track([[0.55, 0], [0.85, -3 * DEG, "io"], [1.15, 1.4 * DEG, "io"], [1.45, 0, "io"]], t);
  const topPose = landed ? [top[0], hop, tip, false] : [top[0], top[1], tip, false];
  if (landed) topPose[1] = FLOOR - Math.max(...OUT[0].map((p) => rot(p, tip, MIDS[0])[1])) + hop;
  return scene([topPose, [0, 0, lrock, true], [x, 0, x / 34, true]]);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
