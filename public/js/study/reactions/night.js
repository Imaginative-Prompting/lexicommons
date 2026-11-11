// The night's two stories. Happy: a shooting star goes over, the stars twinkle, and fireflies come up out of the grass and stay, blinking. Sad: clouds roll in
// over the moon, the stars go out one by one under them, and then the window's light goes off. It's just dark.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths; its stars and window panes are runs of one path, kept apart.
import { n2, n4, paint, parsePath, partsOf, runsToDc, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M170.4 156.9l0 3.4c6.1 1.3 12.3 2.5 18.3 4.3 5.4 1.6 10.5 3.6 15.7 5.4l0 34.4-208.8 0 0-22.7 44.9-11.7c.1-.1 .1-.1 .2-.1l24.2-5.7c16.8-3.9 36.8-7.1 54-7.3l0-3.6c3.7 0 7.5-.2 11.3-.1 13.4 .3 26.9 1.2 40.2 3.7Z\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n<path d=\"M66.4 14.6c-13.7 6.9-25.8 19.4-26.5 35.6-.8 18.7 15.1 37.7 34 39.1 6.4 .5 12-1.1 17.8-3.7-3.5 4.7-7.4 8.6-12.5 11.5-21.1 12.2-46.5 2-57.7-18.6-3-5.3-5-11.3-5.4-17.4-.6-10.1 3.1-20.1 9.3-28 4.2-5.3 9.5-9.9 15.6-13 8.1-4.1 16.4-5.5 25.4-5.5Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M169.8 124l2.3 2.5c-.6 .2-1.2 .2-1.8 .5l.1 33.4c-13.3-2.5-26.8-3.5-40.3-3.8-3.7-.1-7.5 .2-11.2 .2l.1-28.9c0-.7-.1-.1-.3-1-.6-.2-1.1-.3-1.7-.3 .6-.9 1.7-2.5 3-2.5l49.8-.1ZM140.6 136.9c0 .4-.5 .7-1 .7-.6 0-1-.3-1-.7 0-.3 .4-.6 1-.6 .5 0 1 .3 1 .6ZM150.7 136.9c0 .4-.5 .7-1 .7-.6 0-1-.3-1-.7 0-.3 .4-.6 1-.6 .5 0 1 .3 1 .6ZM140.6 146.4c0 .3-.5 .6-1 .6-.6 0-1-.3-1-.6 0-.4 .4-.7 1-.7 .5 0 1 .3 1 .7ZM150.7 146.4c0 .3-.5 .6-1 .6-.6 0-1-.3-1-.6 0-.4 .4-.7 1-.7 .5 0 1 .3 1 .7Z\" fill=\"var(--art-violet-deep,#5E40C4)\" fill-rule=\"evenodd\"/>\n<path d=\"M144.6 101.5c1.1 .7 2.1 1.4 3.2 2.1l18 13c4.9 3.5 9.6 7.3 14.4 10.9l-71.3 0 19.8-14.9c5.2-3.8 10.5-7.5 15.9-11.1Z\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M88.7 27.3c1.8 5.1 2.2 5.4 7.2 7.4-4.9 1.8-5.4 2.4-7.2 7.3-1.9-5-2.4-5.6-7.4-7.3 5.2-1.9 5.5-2.4 7.4-7.4ZM108.6 67.8c1 2.2 1.6 2.8 3.7 3.9-2 .9-2.7 1.6-3.6 3.5-1.2-2.3-1.4-2.5-3.7-3.6 2-1 2.6-1.7 3.6-3.8ZM23.9 107c1.6 4.3 1.8 4.5 6.1 6.2-3.9 1.5-4.5 2.2-6.1 6.1-1.8-4.2-2-4.5-6.3-6.1 4.4-1.7 4.5-2 6.3-6.2ZM135.8 132.8l7.5 0c.4 0 .7 .3 .7 .7l0 6.9c0 .3-.3 .7-.7 .7l-7.5 0c-.4 0-.7-.4-.7-.7l0-6.9c0-.4 .3-.7 .7-.7ZM145.9 132.8l7.5 0c.4 0 .7 .3 .7 .7l0 6.9c0 .3-.3 .7-.7 .7l-7.5 0c-.4 0-.7-.4-.7-.7l0-6.9c0-.4 .3-.7 .7-.7ZM135.8 142.2l7.5 0c.4 0 .7 .3 .7 .7l0 6.9c0 .4-.3 .7-.7 .7l-7.5 0c-.4 0-.7-.3-.7-.7l0-6.9c0-.4 .3-.7 .7-.7ZM145.9 142.2l7.5 0c.4 0 .7 .3 .7 .7l0 6.9c0 .4-.3 .7-.7 .7l-7.5 0c-.4 0-.7-.3-.7-.7l0-6.9c0-.4 .3-.7 .7-.7Z\" fill=\"var(--art-sun,#F7BE45)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "e0b463793a";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [GROUND, MOON, WALLS, ROOF, SUN] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const fill = (t) => `fill="${paint(t)}"`;
const R = parsePath(SUN.d);
const STARS = [0, 1, 2].map((i) => { const p = R[i].segs.flat(); return { d: runsToDc([R[i]]), at: [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length] }; });
const PANES = runsToDc(R.slice(3));
const star = (s, k) => (k <= 0.01 ? "" : `<g transform="translate(${n2(s.at[0])} ${n2(s.at[1])}) scale(${n4(k)}) translate(${n2(-s.at[0])} ${n2(-s.at[1])})"><path d="${s.d}" ${fill("sun")}/></g>`);
// As the still paints them: ground, moon, house, then the stars and panes in sun.
const scene = (stars, panes, sky = "") => `${GROUND.svg}${MOON.svg}${stars}${sky}${WALLS.svg}${ROOF.svg}${panes}`;

// ---- happy.
const FLIES = [[30, 0.6, 0.0], [62, 0.75, 1.3], [96, 0.68, 2.1], [128, 0.9, 0.7], [176, 0.82, 1.7], [12, 1.0, 2.6], [190, 1.1, 0.4]];
const HAPPY_DUR = 2.4;
// where each firefly is in its beat when the story ends: near the top of a flash, or (π) between flashes
const END_BEAT = [0.1, -0.4, Math.PI, 0.3, -0.2, Math.PI * 0.9, 0.5];
function happy(t) {
  if (t <= 0) return STILL;
  const stars = STARS.map((s, i) => star(s, 1 + 0.35 * Math.max(0, Math.sin(2 * Math.PI * 1.4 * t + i * 2.1)) * Math.min(1, t / 0.3))).join("");
  // The shooting star: in from beyond the top right, fast, a bright head and a tail that's longest mid-flight; it burns out, the head shrinking to
  // nothing at the end of its path.
  let shoot = "";
  const s = (t - 0.2) / 0.5;
  if (s > 0 && s < 1) {
    const hx = 212 - 136 * s, hy = 6 + 52 * s, len = 50 * Math.sin(Math.PI * Math.min(1, s * 1.1)), r = 2.6 * Math.min(1, (1 - s) / 0.3);
    shoot = `<path d="M${n2(hx)} ${n2(hy)}L${n2(hx + len * 0.93)} ${n2(hy - len * 0.36)}" stroke="${paint("paper")}" stroke-width="2.4" stroke-linecap="round"/><circle cx="${n2(hx)}" cy="${n2(hy)}" r="${n2(r)}" ${fill("sun-lit")}/>`;
  }
  // Fireflies: up out of the grass, drifting and swaying as they rise and slow, each blinking on its own beat. A firefly's light is its own tail going
  // on and off: a small dark body, and over it a solid light that brightens and dims. No halo: the light is the dot.
  let flies = "";
  FLIES.forEach(([x0, at, ph], i) => {
    const q = t - at;
    if (q <= 0) return;
    const rise = 34 + (i % 3) * 14, k = 1 - Math.exp(-2.4 * q), x = x0 + 8 * Math.sin(q * 2.2 + ph) * k, y = 168 - rise * k;
    // on for most of each beat and off for the rest, with a quick ramp between (about four frames), so no light hangs half lit
    // (each one's beat is set so the story ends with five lit and two between flashes: it blinks the whole way, and its held end is a lit night)
    const beat = Math.PI / 2 + END_BEAT[i] - 2 * Math.PI * 1.6 * (HAPPY_DUR - at);
    const blink = Math.max(0, Math.min(1, (Math.sin(2 * Math.PI * 1.6 * q + beat) + 0.2) * 1.6)), grow = Math.min(1, q / 0.2);
    flies += `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(2.4 * grow)}" ${fill("ink-lit")}/><circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(2.4 * grow)}" ${fill("sun-lit")} opacity="${n2(blink)}"/>`;
  });
  return `${OPEN}${BG}${scene(stars, `<path d="${PANES}" ${fill("sun")}/>`, shoot)}${flies}</svg>`;
}

// ---- sad.
const SAD_DUR = 2.5;
// (a lower row, under the moon)
const BELOW = [[28, 94, 20], [54, 100, 21], [80, 98, 20], [104, 90, 17], [92, 46, 12]];
const LUMPS = [[0, 30, 30], [34, 18, 26], [62, 30, 28], [92, 16, 24], [118, 34, 26], [-20, 70, 26], [20, 62, 30], [56, 74, 24], [88, 66, 22], [116, 80, 20]];
function sad(t) {
  if (t <= 0) return STILL;
  // The clouds: one bank, coming in from the left over the moon and the stars, slowing.
  const k = track([[0.1, 0], [1.3, 1, "out"]], t), dx = -150 * (1 - k);
  let clouds = "";
  // The bank, shaded as everything here is: moonlit gray, its lower right in shade (all the shade first, then the gray nudged up and left over it, so the
  // shade shows only along the bank's lower right edge, never inside it). A lower row covers the moon whole: none of its edge peeks out under the bank.
  if (k > 0) {
    const all = [...LUMPS, ...BELOW];
    for (const [x, y, r] of all) clouds += `<circle cx="${n2(x + dx)}" cy="${y}" r="${r}" ${fill("ink-lit")}/>`;
    for (const [x, y, r] of all) clouds += `<circle cx="${n2(x + dx - 3.5)}" cy="${y - 3.5}" r="${r}" ${fill("steel-deep")}/>`;
  }
  // Each star goes out as the bank's edge reaches it.
  const edge = 90 * k + 60 * k * k;
  const stars = STARS.map((s) => star(s, s.at[0] < edge - 20 ? 0 : s.at[0] < edge ? (edge - s.at[0]) / -20 + 1 : 1)).join("");
  // Then the light in the window goes off, with a little flicker first.
  const off = t > 1.55 ? 1 : t > 1.45 && t < 1.5 ? 1 : 0;
  const panes = `<path d="${PANES}" ${fill(off ? "ink-lit" : "sun")}/>`;
  return `${OPEN}${BG}${scene(stars, panes, clouds)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
