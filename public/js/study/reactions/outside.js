// Outside's two stories: a flying disc, thrown from off to the right, comes gliding in, slowly losing height, towards the tree. Sad: it flies
// into the fork between the middle branch and the right bough, tips over and wedges there, out of reach. Happy: a little lower, it clips the
// right bough's tip instead: it pops up off it, tumbles down, and lands on the lawn, where it rocks and settles, there to pick up.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M129.8 61.7c3.4 .8 6.8 1.6 10 3.4 2.5 1.4 4.5 3.3 6.5 5.3 1.8 1.8 3.5 3.5 4.8 5.7 4.7 7.7 3.4 17.2-2.7 23.6-2.2 2.3-4.4 4.6-7.1 6.3-3.7 2.4-7.8 3.3-12.2 4l-3.8-3.8 4-4-15.9 3.7c-3.7 .8-7 3.7-9.8 6-1.2-1.1-2.7-2.3-3.5-3.7-.6-1.3-.7-2.9-1-4.3-.7-2.6-1.6-5.2-2.2-7.9-.4-2-.6-4.1-1-6.1 0 .2-.2 .4-.2 .6l1 15.3c.4 5.1-3.9 9.2-7.1 12.5-.8-.8-1.6-1.8-2.4-2.4l-13.8-10.2c-1.9-1.4-3.5-3.5-5.2-5.1l.9 3.2-4.2 4.1c7.6 2.6 13.2 8.4 17.7 14.9l-2.3 2.3c-.4-.7-.8-1.4-1.2-2.1-4.7 2.3-9.5 3.7-14.8 3.7-16.6-.1-35.7-13.4-31.7-31.8-10.5-7.7-11-19.7-6.3-31 6-14.3 19.3-23.6 34.6-24.9 1.1-3.5 2.4-6.8 4.4-9.9 10.9-16.4 34.3-22 52.2-14.9 5.1 2 12.1 5.2 15.7 9.3 2 2.2 3.3 5.2 4.3 7.9 4 11.5 .6 22-7.7 30.3ZM.8 164.6l9.5-.1 0 3.5 9.4 0 0-3.4 9.3 0 0 3.4 9.4 0 0-3.4 9.4 0 0 3.4 9.5 0 0-3.4 9.4 0 0 3.4 9.3 0 0-3.7c2.4 .5 3.5 2.2 5.2 3.9l-4.7 7.3c7.9 2 15.3 5.1 22.8 8 7.6 3 15.2 6 22.8 9 4.2 1.7 8.4 3.4 12.7 5.1 2 .8 4.3 1.4 6.1 2.7 1.6 1.1 2.9 2.7 4.2 4.1l-149.5 0 0-36.4 5.2 0 0-3.4ZM124 164.6l0 3.4 9.3 0 0-3.4 9.4 0 0 3.4 9.5 0 0-3.4 9.4-.1 0 3.5 9.4 0 0-3.4 9.3 0 0 3.4 9.4 0 0-3.5 9.5 .1 0 3.4 5.2 0 0 32.1c-6.3-.9-12.6-2.7-18.9-4.1-12.3-2.7-24.7-5.5-37.1-8.2-6.4-1.4-12.9-2.8-19.4-4.3-2.6-.6-6.8-.9-9.1-2.2-3.4-1.9-9.2-9.6-11.3-13l2.2-2.2c.5 .8 .9 1.4 1.4 2 .7-.1 1.5-.1 2.2-.2l.2-3.3 9.4 0Z\" fill=\"var(--art-teal-lit,#6FD0BD)\" fill-rule=\"evenodd\"/>\n<path d=\"M121.4 15.8c12.2 6.3 23.1 15.6 24.2 30.2 29.3 5.4 38.7 40 20.9 62.3-3.3 4.2-10.3 10.4-15.5 11.8l-12.7 3.3c-.9 .2-1.8 1-2.6 1.5-1.7 .9-3.5 1.6-5.3 2.1-7.8 2.2-14.2 .7-21.6-1.7-.5 .6-.8 1.2-1.1 1.9l-2.5-2.2c5.5-10.4 13.4-16.7 23.5-22.2 .7 .7 1.3 1.3 1.9 2.1-.6 .5-1.2 .9-1.6 1.4 15.7 0 27.4-16.5 18.4-30.6-5.6-8.7-16.1-10.9-25.7-11 2.3-1.4 4.5-2.8 6.4-4.8 9.8-10.2 9.7-26.5 1-37.3-2.2-2.7-4.9-4.8-7.7-6.8ZM116.5 174.7c1.1 1.1 2.2 2.5 3.5 3.2 1.9 1 4.5 1.1 6.5 1.6 5.3 1.2 10.5 2.3 15.8 3.5 13.4 3 26.9 5.9 40.4 8.9 7.2 1.6 14.4 3.6 21.7 4.8l0 7.7-62.5 0c-3.5-2.2-7.6-3.5-11.5-5.1-6-2.4-12.2-4.8-18.3-7.2-6.4-2.6-12.8-5.1-19.2-7.6-7.1-2.8-14.3-5.7-21.9-6.5 .8-.9 1.6-2.3 2.8-2.9 1.7-1 8.5-.4 10.8-.4 10.6 0 21.3 0 31.9 0Z\" fill=\"var(--art-teal-deep,#25907B)\" fill-rule=\"evenodd\"/>\n<path d=\"M83.6 131.7c.2 .1 .5 .1 .7 .2 .2 .1 .6 .6 .8 .8 2.7 2.8 2.3 7.2 2.3 10.8 0 7.1-1.9 17.9-5.9 23.9-1.2 1.7-3 3.2-4.4 4.6l1.4-4.2c-.8 .2-1.6 .3-2.5 .3l0-5.7-9.3 0 0 5.6-9.4 0 0-5.6-9.5 0 0 5.6-9.4 0 0-5.6-9.4 0 0 5.6-9.3 0 0-5.6-9.4 0 0 5.6-9.5 0 0-5.6-5.2 0 0-4.8 5.2 0 0-10.9-5.2 0 0-4.8 5.2 0c0-1.3-.1-4.3 .3-5.5 .7-1.7 3.1-3.4 4.4-4.8 4.8 4.7 4.6 3.6 4.6 10.3l9.6 0c0-1.5-.4-3.8 .1-5.2 .4-1.5 3.4-4.1 4.6-5.2 1.1 1.2 4 3.7 4.5 5 .5 1.5 .1 3.8 .1 5.4l9.6 0c0-6.7-.2-5.5 4.5-10.3 4.8 4.8 4.7 3.5 4.7 10.3l9.5 0c0-1.6-.4-3.8 .1-5.3 .4-1.4 3.4-3.9 4.5-5.1 1.2 1.2 4.1 3.6 4.6 5.1 .5 1.5 .1 3.8 .1 5.3l9.6 0c0-7-.1-5.4 4.5-10.4 1 1.1 1.6 1.7 2.8 2.3 .3-.7 .1-1.3 .1-2.1ZM119.2 131.5c4.8 4.8 4.6 3.6 4.6 10.4l9.6 0c0-1.6-.4-3.9 .2-5.4 .5-1.5 3.3-3.8 4.5-5 4.6 5.1 4.6 3.3 4.6 10.4l9.5 0c0-7.4 .1-5 4.5-10.4 4.8 4.8 4.7 3.6 4.7 10.4l9.6 0c0-1.6-.4-4 .2-5.4 .5-1.4 3.4-3.9 4.4-5 1.2 1.2 4.1 3.6 4.6 5 .5 1.5 .1 3.8 .1 5.4l9.6 0c0-6.7-.2-5.6 4.6-10.3 4.7 4.9 4.7 3.4 4.7 10.3l5.2 0 0 4.8-5.2 0 0 10.9 5.2 0 0 4.8-5.2 0 0 5.6-9.5 0 0-5.6-9.4 0 0 5.6-9.3 0 0-5.6-9.4 0 0 5.6-9.4 0 0-5.6-9.5 0 0 5.6-9.4 0 0-5.3-9.3-.3 0 5.6-9.4 0 0-5.6-6.4-.2 1.8 4.3c-3.4-3.3-4.2-3.6-5.9-7.9 .6-.7 1.2-1.3 1.9-1.8 .3 .2 .7 .7 1 1.1 2.4-.6 5.1-.3 7.6-.3l0-10.9-9.9-.1c-.2 .6-.2 1.4-.3 2.1l-2.7-2.5-.3-3.5 2.7-2.4c0 .7 0 1.2 .4 1.9 3.2-.7 6.8-.3 10.1-.3 0-7.3 .1-5.1 4.6-10.4ZM10.8 146.7l8.2 0c.4 0 .7 .3 .7 .7l0 9.5c0 .4-.3 .7-.7 .7l-8.2 0c-.4 0-.7-.3-.7-.7l0-9.5c0-.4 .3-.7 .7-.7ZM29.7 146.7l8.2 0c.4 0 .7 .3 .7 .7l0 9.5c0 .4-.3 .7-.7 .7l-8.2 0c-.4 0-.7-.3-.7-.7l0-9.5c0-.4 .3-.7 .7-.7ZM48.6 146.7l8 0c.4 0 .7 .3 .7 .7l0 9.5c0 .4-.3 .7-.7 .7l-8 0c-.4 0-.8-.3-.8-.7l0-9.5c0-.4 .4-.7 .8-.7ZM67.3 146.7l8.1 0c.4 0 .8 .3 .8 .7l0 9.5c0 .4-.4 .7-.8 .7l-8.1 0c-.4 0-.7-.3-.7-.7l0-9.5c0-.4 .3-.7 .7-.7ZM124.6 146.7l8.1 0c.4 0 .7 .3 .7 .7l0 9.5c0 .4-.3 .7-.7 .7l-8.1 0c-.4 0-.8-.3-.8-.7l0-9.5c0-.4 .4-.7 .8-.7ZM144.2 146.7l6.6 0c.8 0 1.5 .7 1.5 1.5l0 7.9c0 .8-.7 1.5-1.5 1.5l-6.6 0c-.8 0-1.5-.7-1.5-1.5l0-7.9c0-.8 .7-1.5 1.5-1.5ZM162.1 146.7l8.2 0c.4 0 .7 .3 .7 .7l0 9.5c0 .4-.3 .7-.7 .7l-8.2 0c-.4 0-.7-.3-.7-.7l0-9.5c0-.4 .3-.7 .7-.7ZM181 146.7l8.2 0c.4 0 .7 .3 .7 .7l0 9.5c0 .4-.3 .7-.7 .7l-8.2 0c-.4 0-.7-.3-.7-.7l0-9.5c0-.4 .3-.7 .7-.7Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M109.9 68.9c-5.7 4.9-9.5 9.4-10.2 17.2-.2 1.7-.4 3.6 0 5.2l3.8 17.3c2.6-2.2 5.8-5.2 9.3-6l16.9-4.1c4.4-1 7.3-4.9 10.3-7.9-1.5 5.2-7 13.2-12.2 15.4l-14.5 6.1c-8.7 3.6-15.3 18.6-14.8 27.6l1.2 23.3c.3 5-1.8 10.1-4.1 14.3-.9 0-2-.1-2.9 .1-1 .2-1.8 .7-2.8 .7-2.4 .2-5 0-7.5 0-3.8 0-7.6 .2-11.4 0 2.1-2.7 4.2-5.5 5.9-8.6 6.8-12.1 9.6-27.9 4.6-41.2-1.9-5.3-5.1-10.2-9.7-13.6-.6-.4-1.4-1.1-2.1-1.3l-14.7-5.2c-6.1-2.1-9.6-8.3-12.3-13.6 7.3 7.8 12.9 8.9 23.1 9.6-2.4-7.6-1.9-11.9 .6-19.4 .4 5.3 1.3 10.3 4.6 14.7 .5 .7 1.2 1.7 1.9 2.3l14 10.3c1 .8 1.9 1.9 2.8 2.8 1.6-2.4 3.7-5.6 3.5-8.6l-.9-16c-.1-1.7 .5-3.8 1.1-5.4 2.7-8 9.3-12.4 16.5-16Z\" fill=\"var(--art-bark,#7A4E2D)\"/>\n<path d=\"M25.1 7.3c8.9 1.2 15.1 9.7 13.9 19-1.2 9.3-9.4 15.9-18.3 14.7-8.9-1.2-15.1-9.6-13.9-18.9 1.2-9.3 9.4-15.9 18.3-14.8Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M140.4 90.4c-1.5 4.1-3.7 10.2-7.6 12.7l-14.5 9.7c-4.1 2.8-7.5 7.8-9.6 12.2-8.3 17.9-2.2 39.6 11.2 53.1l-28.3 0c2.5-4.1 4.9-9.5 4.6-14.5l-1.2-23.1c-.5-10.5 5.9-22.7 14-29 1.3-1.1 2.8-2.3 4.4-2.9l16.9-6.8c4.8-1.9 7.8-7.1 10.1-11.4Z\" fill=\"var(--art-ink,#231F3B)\"/>\n</svg>\n";
export const STILL_HASH = "eddcaff252";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 7) throw new Error("outside: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const SCENE = EL.join("");
// the fence's pickets stand about a meter: 40 units a meter, so g is 392 units/s²; the disc is about 30 cm across
const G = 392, R = 6;
/** The disc at (x, y), turned `a` degrees, its face showing `face` (its half-height: about 1.3 edge-on, 3 tipped, 2 lying on the lawn below us). */
function disc(x, y, a, face, shade = false) {
  const turn = a ? ` transform="rotate(${n2(a)} ${n2(x)} ${n2(y)})"` : "";
  const top = shade ? "clay-deep" : "clay", rim = shade ? "clay-deeper" : "clay-deep";
  return `<g${turn}><ellipse cx="${n2(x)}" cy="${n2(y + 0.8)}" rx="${R}" ry="${n2(face + 0.7)}" ${fill(rim)}/><ellipse cx="${n2(x)}" cy="${n2(y)}" rx="${R}" ry="${n2(face)}" ${fill(top)}/></g>`;
}
// its glide: straight in from beyond the right edge, sinking a little more as it slows (lift going as its speed does)
function glide(from, to, T, s) {
  const u = Math.max(0, Math.min(1, s / T));
  return [from[0] + (to[0] - from[0]) * u, from[1] + (to[1] - from[1]) * (0.55 * u + 0.45 * u * u)];
}
const T_IN = 0.12;

// ---- sad. Into the fork: its leading rim meets the middle branch; it tips nose down into the V and slides a little deeper till its rims bear
// on both branches, tipped 25°; a small settle.
const S_FROM = [210, 60], S_AT = [114, 96], S_T = 0.5;
const WEDGED = [110, 99.5];
const T_HIT = T_IN + S_T;
const SAD_DUR = T_HIT + 0.3 + 0.7;
function sad(t) {
  if (t <= 0) return STILL;
  if (t <= T_HIT) { const [x, y] = glide(S_FROM, S_AT, S_T, t - T_IN); return `${OPEN}${SCENE}${disc(x, y, -6, 1.3)}</svg>`; }
  const k = track([[T_HIT, 0], [T_HIT + 0.14, 1, "out"], [T_HIT + 0.2, 1.06, "io"], [T_HIT + 0.3, 1, "io"]], t);
  const x = S_AT[0] + (WEDGED[0] - S_AT[0]) * k, y = S_AT[1] + (WEDGED[1] - S_AT[1]) * k;
  return `${OPEN}${SCENE}${disc(x, y, -6 - 19 * k, 1.3 + 1.7 * Math.min(1, k))}</svg>`;
}

// ---- happy. Lower, onto the right bough's tip: its rim catches there and it pops up off it, losing most of its way, and tumbles down (one
// parabola) to the lawn, clear of the trunk's shadow; it lands, hops a little, and rocks to rest, lying flat (a sliver of its own shadow beside it).
const H_FROM = [210, 66], H_AT = [140.5, 87], H_T = 0.38;
const T_CLIP = T_IN + H_T;
const POP = [-6, -55], LAND_Y = 177;
// when the parabola from the tip reaches the lawn
const T_FALL = (-POP[1] + Math.sqrt(POP[1] ** 2 + 2 * G * (LAND_Y - H_AT[1]))) / G;
const T_LAND = T_CLIP + T_FALL, LAND_X = H_AT[0] + POP[0] * T_FALL;
// it tumbles about a level axis turned a little towards us, a whole number of turns, so it comes down as it went up: level. Seen along our line
// of sight, a disc whose normal is n shows R·|n_z| of its face, its long axis across n's direction in the picture.
const AXIS = (() => { const v = [1, 0, 0.6], l = Math.hypot(...v); return v.map((c) => c / l); })();
const N0 = [0, -Math.cos((12 * Math.PI) / 180), Math.sin((12 * Math.PI) / 180)];
const TURNS = Math.max(1, Math.round((8.5 * T_FALL) / (2 * Math.PI)));
function turned(phi) {
  // Rodrigues: N0 turned phi about AXIS
  const [k0, k1, k2] = AXIS, [v0, v1, v2] = N0, c = Math.cos(phi), sn = Math.sin(phi), dot = k0 * v0 + k1 * v1 + k2 * v2;
  const cr = [k1 * v2 - k2 * v1, k2 * v0 - k0 * v2, k0 * v1 - k1 * v0];
  return [v0 * c + cr[0] * sn + k0 * dot * (1 - c), v1 * c + cr[1] * sn + k1 * dot * (1 - c), v2 * c + cr[2] * sn + k2 * dot * (1 - c)];
}
const HAPPY_DUR = T_LAND + 0.55 + 0.6;
if (Math.abs(turned(TURNS * 2 * Math.PI)[2] - N0[2]) > 1e-9) throw new Error("outside: the tumble doesn't come round");
function happy(t) {
  if (t <= 0) return STILL;
  if (t <= T_CLIP) { const [x, y] = glide(H_FROM, H_AT, H_T, t - T_IN); return `${OPEN}${SCENE}${disc(x, y, -6, 1.3)}</svg>`; }
  if (t <= T_LAND) {
    const s = t - T_CLIP, u = s / T_FALL;
    const x = H_AT[0] + POP[0] * s, y = H_AT[1] + POP[1] * s + 0.5 * G * s * s;
    const n = turned(TURNS * 2 * Math.PI * u);
    const face = Math.max(0.6, R * Math.abs(n[2])), a = (Math.atan2(n[1], n[0]) * 180) / Math.PI + 90;
    return `${OPEN}${SCENE}${disc(x, y, a, face)}</svg>`;
  }
  const s = t - T_LAND;
  const hop = -Math.max(0, track([[0, 0], [0.09, 2.2, "out"], [0.18, 0, "in"], [0.24, 0.5, "out"], [0.3, 0, "in"]], s));
  const rock = track([[0, 0], [0.12, 7, "out"], [0.24, -4, "io"], [0.35, 2, "io"], [0.45, -0.7, "io"], [0.55, 0, "io"]], s);
  const lying = Math.min(1, s / 0.12);
  // (its own shadow beside it grows in as it comes down to lie on the lawn)
  const shadow = `<ellipse cx="${n2(LAND_X + 2.2)}" cy="${n2(LAND_Y + 1.6)}" rx="${R}" ry="${n2(2.2 * lying)}" ${fill("teal-deep")}/>`;
  return `${OPEN}${SCENE}${shadow}${disc(LAND_X, LAND_Y + hop, rock, 1.25 + 0.75 * lying)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
