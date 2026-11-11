// The house's two stories, both at dusk. Happy: someone's home. Evening comes on, the stars and the moon show as the sky darkens, the windows are
// warm, and the door opens on the lit hall, its light falling out across the step. Sad: nobody's home. The same evening, and the lights go out, one
// window after another, until the house stands dark.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view. (No smoke and no beams: puffs and
// see-through light are stock effects. Light here is what it lights: lit glass, a lit hall, a lit patch of ground.)
import { n2, n4, paint, partsOf, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M166.9 142l0 3.5 37.5 0 0 32.5c-8.6-3.8-17.4-7.4-26.1-11.2-3.3-1.5-8.6-3.2-11.6-5.1-1.3-1-2.4-2.3-3.6-3.5 0-2.4-.8-10.6 .1-12.3 .7-1.5 2.6-2.8 3.7-3.9ZM26.7 142.5l3.4 3.4 .2 21.2c15.7 7.8 31.5 15.4 47.3 23 5 2.4 9.9 4.8 14.8 7.2 1.9 .9 3.9 1.6 5.6 2.8 1.7 1.2 3 2.9 4.4 4.3l-106.8 0 0-58.7 31.1 0 0-3.2Z\" fill=\"var(--art-teal-lit,#6FD0BD)\" fill-rule=\"evenodd\"/>\n<path d=\"M166.6 154.5l0 3.7 37.8 16.3 0 29.9-106 0c-.1-.2 0-.5-.2-.6l-71.4-35.2 .3-3.2c16.9 2.6 33.9 4.5 50.9 6.7 5.7 .8 11.5 1.5 17.2 2.3 2.3 .3 5 1 7.3 .7 2.6-.2 5.2-1.5 7.6-2.3 4.5-1.4 8.9-2.9 13.3-4.3 14.4-4.7 28.8-9.3 43.2-14Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<rect x=\"51.2\" y=\"82.4\" width=\"13.4\" height=\"13.2\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"66\" y=\"82.4\" width=\"13\" height=\"13.2\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"51.2\" y=\"97\" width=\"13.4\" height=\"13.6\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"66\" y=\"97\" width=\"13\" height=\"13.6\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M64.1 56.5c10.2 10.3 19.7 21.5 29.4 32.4 1.9 2.1 11.2 11.9 11.8 13.7 .7 1.9 .2 18.9 .2 22.4 0 17.3 0 34.6 0 52-1.5 .5-3 .9-4.3 1.6l-22.4-2.9c-1.8-1.2-2.5-1.1-4.6-1.5 0-9.8 0-19.6 0-29.4 0-5.6 .7-11.5-2-16.7-3.4-6.8-14.2-7.3-19.3-2.1-1.1 1.1-1.9 2.7-2.4 4.1-.3 .9-.8 2.1-.8 3.1l-.7 37.8-3.1-.5c-.1 .1-.3 .6-.6 .5l-18.5-2.1-.4-65.5c-.6 .2-1.1 .6-1.7 1-.5-.3-.8-.6-1.2-1.1 5.5-7.3 11.9-14.1 17.9-21.1 7.4-8.6 14.6-17.6 22.7-25.7ZM52 94.9l11.7 0 0-11.8c-11.6 0-11.7 .1-11.7 11.8ZM66.6 83.1l0 11.8 11.7 0c0-11.7 0-11.8-11.7-11.8ZM52 97.7c0 11.9-.4 12.1 11.7 12.1l0-12.1-11.7 0ZM66.6 97.7l0 12.1c12.1 0 11.7-.2 11.7-12.1l-11.7 0Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M77.6 175.6l-32.1-4.2 .7-38.2c0-2.1 1.3-4.5 2.4-6.2 6.5-9.9 19.9-10.8 26.3-.3 3.4 5.4 2.7 11.5 2.7 17.6 0 10.5 0 20.9 0 31.3Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M166.1 100.1l2.1 2.2c-.7 .2-1.2 .3-1.8 .7 .6 3.2 .3 6.6 .3 9.8 0 4.9 .1 9.8 0 14.7l-.2 27.6c0 1 .1 1.9 .1 2.9l-64.6 20.9c0-17.9 0-35.9 0-53.8 0-4.8 0-9.7 0-14.5 0-2.1-.3-4.4 0-6.5 .1-.5 .4-1 .6-1.5-.5-1.2-.4-1.6 0-2.9 1.8 1.8 5.7 6.6 8.4 6.3l55.1-5.9Z\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n<path d=\"M135.1 43.9c0 3.4 0 6.9 0 10.3 0 .6-.2 3.2 .2 3.7l36.9 37.5c2.8 2.8 .7 7-2.7 7.7-4.9 1-10.1 1.2-15 1.7-10.4 1.2-20.9 2.4-31.3 3.6-3.7 .4-13.2 2.6-15.9-.4l-43.2-48.1-39.3 45.3c-3.2 3.6-9.8 .5-7.2-4.7 1.6-3.1 6.8-8.4 9.3-11.3 6.2-7.2 12.4-14.5 18.6-21.8 3.4-3.9 13-16.4 17-18.2 3.6-1.6 11.3-.2 15.3 .2 11.1 1.2 22.2 2.2 33.3 3.7l0-9c-.8-.6-1.9-1.2-2.5-2.1-1.5-2.4-.8-6.7 2-7.7 2.4-.8 5.5-.4 8-.4 3.5 0 7 0 10.5 0 1.8 0 3.9-.2 5.7 .2 3.2 .7 4.4 5.1 2.7 7.8-.5 .9-1.5 1.4-2.4 2Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<polygon points=\"113.3,121.5 122.4,120.2 122.5,131.1 113.3,132.4\" fill=\"var(--art-sun,#F7BE45)\"/>\n<polygon points=\"113.3,134 122.5,132.8 122.5,143.7 113.3,144.9\" fill=\"var(--art-sun,#F7BE45)\"/>\n<polygon points=\"124.1,120 133.2,118.8 133.3,129.6 124.1,130.9\" fill=\"var(--art-sun,#F7BE45)\"/>\n<polygon points=\"124.1,132.5 133.3,131.3 133.4,142.2 124.2,143.4\" fill=\"var(--art-sun,#F7BE45)\"/>\n<polygon points=\"141.6,117.8 149.3,116.8 149.3,126.9 141.6,127.9\" fill=\"var(--art-sun,#F7BE45)\"/>\n<polygon points=\"141.6,129.5 149.3,128.6 149.4,138.7 141.6,139.6\" fill=\"var(--art-sun,#F7BE45)\"/>\n<polygon points=\"150.9,116.6 158.6,115.6 158.7,125.7 151,126.7\" fill=\"var(--art-sun,#F7BE45)\"/>\n<polygon points=\"151,128.4 158.7,127.4 158.8,137.5 151,138.5\" fill=\"var(--art-sun,#F7BE45)\"/>\n</svg>\n";
export const STILL_HASH = "652096a461";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [, SHADOW, WALL, DOOR, SIDE, ROOF] = partsOf(STILL);
// The gable window's four panes (lit, behind the wall's mullions) and the side wall's eight.
const PANES = [...STILL.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="[^"]*"\/>/g)].map((m) => m.slice(1).map(Number));
const SIDE_PANES = [...STILL.matchAll(/<polygon points="([^"]*)" fill="[^"]*"\/>/g)].map((m) => m[1]);
if (PANES.length !== 4 || SIDE_PANES.length !== 8) throw new Error("house: the still's windows aren't as this story knows them");
const fill = (t) => `fill="${paint(t)}"`;
const over = (svg, k) => (k <= 0 ? "" : k >= 1 ? svg : `<g opacity="${n2(k)}">${svg}</g>`);
// The ground's back edge runs straight across at 145.6 behind the house: drawn whole, so it's there wherever it changes.
const GROUND = 145.6;
const sky = (c) => `<rect width="200" height="200" ${fill(c)}/>`;
const ground = (c) => `<rect y="${GROUND}" width="200" height="${200 - GROUND}" ${fill(c)}/>`;
const shadow = (c) => `<path d="${SHADOW.d}" ${fill(c)}/>`;
const wall = (c) => `<path d="${WALL.d}" ${fill(c)} fill-rule="evenodd"/>`;
const gablePanes = (c) => PANES.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${fill(c)}/>`).join("");
const sidePanes = (c, which = [0, 1, 2, 3, 4, 5, 6, 7], edge = false) => which.map((i) => `<polygon points="${SIDE_PANES[i]}" ${fill(c)}${edge ? ` stroke="${paint(c)}" stroke-width=".6"` : ""}/>`).join("");

// Evening comes over everything at once, as light does: the night's colors laid over the day's, thickening. The stars and the moon were there all
// along; they show as the sky darkens behind them, the brightest first.
const STARS = [[18, 22, 0.5], [92, 14, 0.6], [62, 40, 0.7], [160, 72, 0.78], [178, 104, 0.86], [36, 116, 0.94]];
const MOON = "M34.88 49.06A11 11 0 1 0 46.06 64.44A9.6 9.6 0 0 1 34.88 49.06Z";
function evening(t) {
  const k = track([[0.1, 0], [0.9, 1, "io"]], t);
  const night = (s) => over(s, k);
  const stars = STARS.map(([x, y, at]) => over(`<circle cx="${x}" cy="${y}" r="1.4" ${fill("sun-lit")}/>`, track([[at - 0.15, 0], [at + 0.25, 1, "io"]], t))).join("");
  const moon = over(`<path d="${MOON}" ${fill("paper")}/>`, track([[0.3, 0], [0.85, 1, "io"]], t));
  return { k, night, back: `${sky("teal")}${night(sky("violet-deep"))}${stars}${moon}${ground("teal-lit")}${night(ground("ink-lit"))}${shadow("teal-deep")}${night(shadow("ink"))}` };
}

// ---- happy.
const HAPPY_DUR = 2.5;
// The door darkens with the evening, as the wall does. Opening, it swings in on its left hinge: narrower as it turns, and darker still as it turns
// from the last of the light outside. It swings in behind the wall's face, so only what's inside the doorway shows of it: it's seen through the
// doorway's own shape (the still draws the door over the wall, a little past the opening the wall leaves, so the wall can't be what hides it).
const HINGE = 46;
function door(open, k) {
  const shut = `<path d="${DOOR.d}" ${fill("clay")}/>${over(`<path d="${DOOR.d}" ${fill("clay-deep")}/>`, Math.max(k, Math.min(1, Math.max(0, (open - 0.3) / 0.35))))}`;
  const clip = `<clipPath id="dw"><path d="${DOOR.d}"/></clipPath>`;
  if (open <= 0.001) return `${clip}<g clip-path="url(#dw)"><g>${shut}</g></g>`;
  return `${clip}<g clip-path="url(#dw)"><g transform="translate(${HINGE} 0) scale(${n4(Math.max(0.06, Math.cos(open * 1.25)))} 1) translate(-${HINGE} 0)">${shut}</g></g>`;
}
function happy(t) {
  if (t <= 0) return STILL;
  const { k, night, back } = evening(t);
  // A beat after dark, the door opens (someone inside opens it from rest, and holds it): out, past, and back to where it's held.
  const open = track([[1.2, 0], [1.66, 1, "io"], [1.78, 0.93, "io"], [1.88, 1, "io"]], t);
  // The hall's light falls out through the doorway onto the step and the path: the doorway's shape laid on the ground away from the house. The door
  // swings in on its left hinge, so the light comes first through the gap at the latch side, on the right, and widens to the left as it opens.
  const s = Math.min(1, open), lerp = (a, b) => a + (b - a) * s;
  const patch = open <= 0 ? "" : `<polygon points="${n2(lerp(77.6, 45.5))},${n2(lerp(175.6, 171.4))} 77.6,175.6 97.6,199.6 ${n2(lerp(97.6, 37.5))},${n2(lerp(199.6, 199.4))}" ${fill("sun-lit")}/>`;
  const hall = open > 0 ? `<path d="${DOOR.d}" ${fill("sun")}/>` : "";
  return `${OPEN}${back}${patch}${gablePanes("sun")}${hall}${wall("paper")}${night(wall("paper-deep"))}${door(open, k)}${SIDE.svg}${ROOF.svg}${sidePanes("sun")}</svg>`;
}

// ---- sad.
const SAD_DUR = 2.6;
// The lights go out one window after another, the far one first. A bulb doesn't stop at once: it dims over a moment as its filament cools.
const OUT = [[1.0, "far"], [1.42, "near"], [1.9, "gable"]];
const dim = (t, at) => track([[at, 0], [at + 0.16, 1, "io"]], t);
function sad(t) {
  if (t <= 0) return STILL;
  const { k, night, back } = evening(t);
  // Unlit, a window's glass is as dark as the night it shows: the side wall's darker than its wall, the gable's dark against the pale wall.
  const far = dim(t, OUT[0][0]), near = dim(t, OUT[1][0]), gable = dim(t, OUT[2][0]);
  const gableGlass = over(gablePanes("ink-lit"), gable);
  // (the dark glass is drawn a hair over the lit pane's edge, so no lit rim is left round it)
  const sideGlass = `${over(sidePanes("ink", [4, 5, 6, 7], true), far)}${over(sidePanes("ink", [0, 1, 2, 3], true), near)}`;
  return `${OPEN}${back}${gablePanes("sun")}${gableGlass}${wall("paper")}${night(wall("paper-deep"))}${door(0, k)}${SIDE.svg}${ROOF.svg}${sidePanes("sun")}${sideGlass}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
