// The car's two stories. Happy: it starts first time. The engine turns over and catches, the headlight flicks on, and it's so pleased it pops a wheelie, back
// tire smoking, comes down bouncing, and peels out of the picture, leaving a skid mark and its dust. Sad: a puncture. The front tire hisses flat and the car slumps forward onto it with a sigh.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths, in the 200-unit view.
import { n2, paint, parsePath, partsOf, runsToD, runsToDc, subdivide, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M177.3 122.4c-1.8 1.9-3.8 4.7-6.7 4.6-6-.2-16.7-12.4-12.5-18.4 .7-1 1.8-1.8 2.6-2.7 3.5-3.4 5.7-3.1 9.1 .2 4.4 4.5 6.4 10.3 7.5 16.3ZM153.4 158.1l2 2.3c-.6 .4-1.2 .8-1.7 1.4l50.7 .1 0 29.3-50.9-25.3c-1.5-.7-2.9-2.6-4.1-3.8l4-4ZM38.3 158.3l62.5 41.8c1.6 1.1 3 2.9 4.3 4.3l-109.5 0 0-42.5 42.1-.2c-.5-.4-1-.8-1.5-1.2l2.1-2.2Z\" fill=\"var(--art-sun-lit,#FAD57E)\" fill-rule=\"evenodd\"/>\n<path d=\"M55.8 158.4c.7 .7 1.3 1.4 2 2.2-.6 .5-1.2 .8-1.7 1.3l80 .2-2.7-1.5 2.2-2.2c5.9 2.3 11.3 2.4 17.2 .1l2.2 2.2c-.7 .5-1.4 1-2.2 1.5l51.6 25.4 0 16.8-103.3-.1c-.1-.2 0-.5-.2-.7l-62.4-41.6c-.2-.2-.5-.3-.7-.4l2.4-2.4c5.8 1.5 10 1.3 15.6-.8Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M140.9 96.4l3.5 .7c-2.2 4.4-7 9.1-12.3 9.1l-97.2 .2c-6.8 0-10.7 4.4-15.1 8.8l1-3.9c0 0-.6 .4-.8 .4-.1 0 .1-.3 0-.3l7-21c1-3 2.4-5.9 3.8-8.7 10.9-21.6 29.7-27.4 52.5-27.2 9.7 0 20.6 1.2 29.1 6.2 11.8 7 21 24.4 28.5 35.7ZM37.7 94.7l31.5 0 0-21.2c-7.7 0-18.8 0-24.7 6-3.8 3.9-5.6 10-6.8 15.2ZM81.8 73.5l0 21.2 47.2 0c-2.6-4.6-6.3-10.6-10.4-14.1-10-8.4-24.6-7.1-36.8-7.1ZM144.2 129.1c4.8-.2 10.9 5.2 12.8 9.4 .7 1.8 .9 3.7 .7 5.6-.4 3.4-2.7 5.8-5 8.1-2.2 2.2-4.7 4-7.9 4.1-6.2 .2-13.9-7.9-13.6-14.1 .2-3.8 2.5-6.4 5.1-9 2.2-2.2 4.6-4 7.9-4.1ZM46.5 129.3c4.1-.4 6.9 2.1 9.6 4.8 1.3 1.4 2.6 2.6 3.4 4.3 .8 1.7 1.1 3.7 .9 5.6-.5 3.5-2.8 5.8-5.2 8.2-2.2 2.2-4.5 4-7.7 4.1-3.9 .1-6.4-2-9-4.6-2.7-2.8-5-5.5-4.7-9.7 .3-3.7 2.6-6 5.1-8.5 2.2-2.2 4.4-4 7.6-4.2Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M62.3 70.1c2.6-.2 6.9-.9 9 1.2 1.6 1.6 1.4 3.9 1.4 5.9 0 3.5 .7 16.8-.9 19-1.7 2.5-5.4 2-8 2-6.7 0-13.4 0-20 0-2.5 0-6.2 .6-8.1-1.4-2.8-2.7 0-8 1.3-10.9 5-10.9 13.7-15.1 25.3-15.8ZM81.6 70.2c2.8-.7 6.7-.2 9.5-.2 14.3 0 24.2 1.9 33.6 13.5 1.8 2.2 8.7 10.3 7.2 12.9-1.4 2.7-8.8 1.8-11.5 1.8-10 0-20 0-30 0-2.9 0-9 .8-11-1.6-1.5-1.6-1.1-4.3-1.1-6.4 0-3.3-.6-15.4 .4-17.7 .6-1.2 1.6-2 2.9-2.3Z\" fill=\"var(--art-teal-lit,#6FD0BD)\" fill-rule=\"evenodd\"/>\n<path d=\"M129.6 102.8c-.2 .6 .2 .3-.7 .8 .7 .1 1.5 .1 2.1 .3-3.6 4.1-5.6 3.5-10.2 5.6-3.5 1.5-6.8 3.5-9.7 6-4.7 3.8-7.8 9.3-11.9 13.7-9.8 10.4-16.9 14.7-31.1 17.1-1.2-1.2-3-2.5-3.7-4-.6-1.1-.5-2.4-.8-3.6-.6-3.3-2.1-7.4-4.9-9.5-6.3-4.7-19-4.9-24.4 1.4-3.9 4.5-4.5 10.9-3.7 16.6-.7 .7-1.4 1.3-2.1 1.9-.2-.6-.4-1-.8-1.5-7.5 .5-11.6-8.4-12.3-14.6-1.4-12.2 5-30.1 19.7-30.1l94.5-.1Z\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n<path d=\"M140.6 95.6c10.9 1.9 22.7 2.9 30.4 11.8 8 9.2 10 29.6-.4 37.8-1.9 1.5-4 2.3-6.2 2.9-.9 2.4-1.8 4.7-3.3 6.8-7.1 10.2-22.1 11.9-30.9 3-2.4-2.5-4-5.4-5.2-8.6l-58.4 0c-2.7 6.9-7.9 12.4-15.3 14-14.2 3.3-26.6-9.6-24.3-23.6 2.4-14.6 19.3-22.6 31.7-14 6 4.1 8.2 10.3 8.9 17.2 10.4-1.7 18.6-4.6 26.3-11.9 8.7-8.2 12.6-17.6 24-23.6 3-1.5 6-2.7 9.3-3.6 3.8-1 11.2-1.1 13-5.3 .4-.9 .3-2 .4-2.9ZM172.9 123.2c-2.7 1.7-7.3-.4-10.1-4.8-2.9-4.4-3-9.4-.3-11.2 2.7-1.8 7.2 .4 10.1 4.8 2.9 4.4 3 9.4 .3 11.2ZM144.6 152.9c-5.5 .1-10-4.5-10-10.1 0-5.7 4.4-10.3 9.8-10.3 5.5-.1 9.9 4.5 10 10.1 0 5.7-4.4 10.3-9.8 10.3ZM48.4 132.7c5.4 .7 9.3 5.8 8.6 11.3-.8 5.6-5.7 9.5-11.2 8.8-5.4-.7-9.2-5.7-8.5-11.3 .7-5.5 5.7-9.5 11.1-8.8Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "e6d70504f1";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [LIT, SHADOW, PAPER, GLASS, SIDE, INK] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const litRuns = parsePath(LIT.d);
const LAMP = runsToD([litRuns[0]]);
// The floor's back edge runs straight across at 161.8 behind the car: drawn whole, so it's there wherever the car moves off it.
const TABLE = `<rect y="161.8" width="200" height="38.2" fill="${paint("sun-lit")}"/>`;
// The shadow's top has humps where the tires hid it; only the floor's part is drawn once the car moves.
const FLOOR_CLIP = `<clipPath id="fl"><rect y="161.8" width="200" height="40"/></clipPath>`;
const SHADE = `<g clip-path="url(#fl)">${SHADOW.svg}</g>`;
const REAR = [47, 166]; // where the back tire meets the floor
const decay = (t, at, amp, hz, k) => (t <= at ? 0 : amp * Math.sin(2 * Math.PI * hz * (t - at)) * Math.exp(-k * (t - at)));
const fill = (t) => `fill="${paint(t)}"`;
// The lamp shows through a hole in the body, as in the still.
const body = (lamp, ink = INK.d) => `<path d="${LAMP}" ${fill(lamp)}/>${PAPER.svg}${GLASS.svg}${SIDE.svg}<path d="${ink}" ${fill("ink")} fill-rule="evenodd"/>`;
const pose = (rot, dy) => `translate(0 ${n2(dy)}) rotate(${n2(rot)} ${REAR[0]} ${REAR[1]})`;
const cloud = (x, y, r, color) => [[-0.7, 0.25, 0.7], [0, -0.25, 1], [0.75, 0.2, 0.68]].map(([ox, oy, f]) => `<circle cx="${n2(x + ox * r)}" cy="${n2(y + oy * r)}" r="${n2(r * f)}" ${fill(color)}/>`).join("");

// ---- happy.
// (ACCEL: it leaves the picture at under 6 units a frame, a speed the eye can follow out of the frame; faster, it reads as a vanish, not a car
// driving off: pops.mjs's edge speed)
const CATCH = 0.58, UP = 0.86, DOWN = 1.2, PEEL = 1.46, ACCEL = 320;
const HAPPY_DUR = 2.85;
function happy(t) {
  if (t <= 0) return STILL;
  // Turning over: a shiver that grows. Caught: the torque lifts the nose about the back tire, it hangs there, wobbling, and drops; the front springs take it.
  const crank = t > 0.12 && t < CATCH ? 1.7 * Math.min(1, (t - 0.12) / 0.26) * Math.sin(2 * Math.PI * 16 * (t - 0.12)) : 0;
  const lift = track([[CATCH, 0], [UP, 14, "out"], [UP + 0.1, 12.5, "io"], [UP + 0.2, 13.6, "io"], [DOWN, 0, "in"]], t);
  // Then it's off: it squats as the back tire bites, and goes, faster every frame, out of the picture to the right.
  const go = Math.max(0, t - PEEL), dx = 0.5 * ACCEL * go * go;
  const squat = t > PEEL ? -2.2 * Math.min(1, go / 0.08) : 0;
  const pitch = -lift + (t > DOWN ? 2.6 * Math.exp(-5 * (t - DOWN)) * Math.sin(2 * Math.PI * 2.6 * (t - DOWN)) : 0) + squat;
  const dy = crank + (t > DOWN ? -track([[0, 0], [0.04, 0], [0.12, 3.2, "out"], [0.22, 0, "in"]], t - DOWN) : 0);
  const on = t > CATCH + 0.02 && !(t > CATCH + 0.07 && t < CATCH + 0.12);
  // Exhaust from the tail as it catches; the back tire's smoke while the nose is up; and the dust it throws as it peels out, which hangs a moment after it's gone,
  // drifting, and thins away: the end is the empty road and its skid mark.
  let puffs = "";
  for (const [at, x, y, r, ddx, dy2, color, hang] of [[0.2, 24, 150, 4, -10, -4, "paper-mid"], [0.38, 24, 150, 5, -12, -5, "paper-mid"], [CATCH, 22, 148, 12, -22, -12, "paper-mid"],
    [CATCH + 0.06, 50, 166, 11, -30, -6, "paper"], [CATCH + 0.18, 50, 166, 13, -40, -8, "paper"], [CATCH + 0.32, 50, 166, 12, -44, -4, "paper"], [UP + 0.2, 52, 166, 10, -36, -10, "paper"],
    [PEEL, 46, 162, 18, -20, -10, "paper-mid", 1], [PEEL + 0.05, 64, 166, 15, 6, -14, "paper", 1], [PEEL + 0.1, 30, 168, 14, -18, -2, "paper-mid", 1]]) {
    const s = t - at, life = hang ? 1.2 : 1.0;
    if (s <= 0 || s >= life) continue;
    const k = track([[0, 0], [life, 1, "out3"]], s), size = r * (hang ? track([[0, 0], [0.18, 1.1, "out"], [0.6, 1.05, "io"], [life, 0, "in"]], s) : track([[0, 0], [0.14, 1, "out"], [0.55, 0.92, "io"], [life, 0, "in"]], s));
    puffs += cloud(x + ddx * k, y + dy2 * k, size, color);
  }
  // The skid mark: laid by the back tire from where it spun, to where it is now (or the edge).
  const skid = t > PEEL ? `<path d="M40 165.4H${n2(Math.min(206, 47 + dx))}" stroke="${paint("ink-lit")}" stroke-width="4.6" stroke-linecap="round"/><ellipse cx="47" cy="165.6" rx="9" ry="2.6" ${fill("ink")}/>` : "";
  // The headlight shows it's on in the lamp itself, which goes bright. No beam: in daylight a headlight throws nothing you can see, and light is
  // never drawn as a shape in the air (his rule on glow).
  const beam = "";
  const car = 47 + dx - 70 > 205 ? "" : `<g transform="translate(${n2(dx)} 0)">${SHADE}<g transform="${pose(pitch, dy)}">${beam}${body(on ? "paper" : "sun-lit")}</g></g>`;
  return `${OPEN}${FLOOR_CLIP}${BG}${TABLE}${skid}${car}${puffs}</svg>`;
}

// ---- sad. A small jolt and a puff at the front tire: it's picked something up. Then the hiss, and the tire goes soft from the bottom: it squashes and spreads,
// and the car tips forward onto it. When it's all out the car sinks the last bit with a sigh and stays down.
const INK_RUNS = subdivide(parsePath(INK.d), 2);
const TIRE = [143.5, 143];
const smooth = (v) => { const w = Math.max(0, Math.min(1, v)); return w * w * (3 - 2 * w); };
const flatTire = (x, y, d) => {
  if (y <= TIRE[1] + 3 || d <= 0) return [x, y];
  const v = (y - TIRE[1]) / 24, w = smooth(1.4 - Math.abs(x - TIRE[0]) / 22) * v * v;
  return [x + (x - TIRE[0]) * 0.42 * d * w, y - 10 * d * w];
};
const PUNCTURE = 0.24;
const SAD_DUR = 2.35;
function sad(t) {
  if (t <= 0) return STILL;
  const d = track([[PUNCTURE + 0.06, 0], [0.62, 0.62, "out"], [1.25, 0.94, "io"], [1.62, 0.94], [1.86, 1.06, "io"], [2.02, 1, "io"]], t);
  // It tips about the back tire until the squashed front meets the floor.
  const rot = (Math.atan((10 * d) / (TIRE[0] - REAR[0])) * 180) / Math.PI;
  const jolt = -track([[PUNCTURE, 0], [PUNCTURE + 0.05, 2.2, "out"], [PUNCTURE + 0.13, 0, "in"]], t);
  const ink = runsToDc(INK_RUNS, (x, y) => flatTire(x, y, d));
  // No strokes for the hiss: escaping air can't be seen. The tire going soft, and the puncture's puff of dust, are the story.
  const air = "";
  // The puncture's puff.
  let puff = "";
  const s = t - PUNCTURE;
  if (s > 0 && s < 0.4) puff = cloud(166 + 10 * s, 163 - 8 * s, 6 * track([[0, 0], [0.08, 1, "out"], [0.4, 0, "in"]], s), "paper");
  return `${OPEN}${FLOOR_CLIP}${BG}${TABLE}${SHADE}<g transform="${pose(rot, jolt)}">${body("sun-lit", ink)}</g>${puff}${air}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
