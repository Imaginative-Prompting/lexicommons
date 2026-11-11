// The day's two stories. Happy: a cloud drifts in on the wind and across the sun (the hills dim under it), and on past it; the wind drops and it
// rests off to one side, the sun clear and the hills bright again. Sad: a gray cloud drifts in, slows, and stops right over the sun. The hills stay dim.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view. (Light is shown by what it lights: under
// the cloud the hills and the sky go a shade darker; no rays, no beams.)
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M-5 146C40 134 90 136 130 146 160 152 180 150 205 142V205H-5Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M-5 172C40 156 100 160 140 172 170 180 190 178 205 170V205H-5Z\" fill=\"var(--art-teal-deep,#25907B)\"/><g transform=\"translate(100 72)\"><path d=\"M-6-40H6L0-62Z\" fill=\"var(--art-sun,#F7BE45)\"/></g><g transform=\"translate(100 72) rotate(30)\"><path d=\"M-6-40H6L0-62Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/></g><g transform=\"translate(100 72) rotate(60)\"><path d=\"M-6-40H6L0-62Z\" fill=\"var(--art-sun,#F7BE45)\"/></g><g transform=\"translate(100 72) rotate(90)\"><path d=\"M-6-40H6L0-62Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/></g><g transform=\"translate(100 72) rotate(120)\"><path d=\"M-6-40H6L0-62Z\" fill=\"var(--art-sun,#F7BE45)\"/></g><g transform=\"translate(100 72) rotate(150)\"><path d=\"M-6-40H6L0-62Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/></g><g transform=\"translate(100 72) rotate(180)\"><path d=\"M-6-40H6L0-62Z\" fill=\"var(--art-sun,#F7BE45)\"/></g><g transform=\"translate(100 72) rotate(210)\"><path d=\"M-6-40H6L0-62Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/></g><g transform=\"translate(100 72) rotate(240)\"><path d=\"M-6-40H6L0-62Z\" fill=\"var(--art-sun,#F7BE45)\"/></g><g transform=\"translate(100 72) rotate(270)\"><path d=\"M-6-40H6L0-62Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/></g><g transform=\"translate(100 72) rotate(300)\"><path d=\"M-6-40H6L0-62Z\" fill=\"var(--art-sun,#F7BE45)\"/></g><g transform=\"translate(100 72) rotate(330)\"><path d=\"M-6-40H6L0-62Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/></g><clipPath id=\"s\"><path d=\"M64 72A36 36 0 1 1 136 72A36 36 0 1 1 64 72Z\"/></clipPath><g clip-path=\"url(#s)\"><rect x=\"-99\" y=\"-99\" width=\"399\" height=\"399\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M116 30C130 56 124 96 104 112H144V30Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/></g>\n</svg>\n";
export const STILL_HASH = "235b4e16ac";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const BODY = STILL.slice(STILL.indexOf(">", STILL.indexOf("<svg")) + 1, STILL.lastIndexOf("</svg>"));
// The sky and hills, then the sun (its rays and disc): the shade of a cloud darkens the first, never the sun itself.
const SPLIT = BODY.indexOf('<g transform="translate(100 72)">');
if (SPLIT < 0) throw new Error("day: the still isn't as this story knows it");
const LAND = BODY.slice(0, SPLIT), SUNLIGHT = BODY.slice(SPLIT);
const fill = (t) => `fill="${paint(t)}"`;
const over = (svg, k) => (k <= 0 ? "" : k >= 1 ? svg : `<g opacity="${n2(k)}">${svg}</g>`);
// The sun's middle and its disc, as the still has them.
const SUN = [100, 72], R = 36;

// A cloud: a row of rounded puffs on a flat underside, lit from above, its underside a shade darker. Drawn at its middle.
const PUFFS = [[-24, 4, 12], [-9, -7, 16], [9, -5, 15], [24, 4, 11]];
function cloud(x, y, s, lit, shade) {
  const tr = `translate(${n2(x)} ${n2(y)}) scale(${n2(s)})`;
  const shape = (dy = 0) => `${PUFFS.map(([px, py, r]) => `<circle cx="${px}" cy="${py + dy}" r="${r}"/>`).join("")}<rect x="-34" y="${4 + dy}" width="68" height="${12 - dy}" rx="6"/>`;
  return `<g transform="${tr}"><clipPath id="cu"><rect x="-40" y="9" width="80" height="20"/></clipPath><g ${fill(lit)}>${shape()}</g><g ${fill(shade)} clip-path="url(#cu)">${shape()}</g></g>`;
}
// How much of the sun's disc a cloud at x covers, roughly (0 to 1): the shade it casts follows that.
const covered = (x, s) => Math.max(0, Math.min(1, (34 * s + R - Math.abs(x - SUN[0])) / (2 * R)));
// The shade: the land and sky a little darker while the sun's behind the cloud.
const SHADE = `<rect width="200" height="200" ${fill("ink")}/>`;

// ---- happy.
const HAPPY_DUR = 2.6;
function happy(t) {
  if (t <= 0) return STILL;
  // In from the left on the wind, steadily across, rising a little on it; the wind drops and it slows to rest in the corner, clear of the sun
  // and its rays.
  const x = track([[0.05, -44], [2.0, 165, "out"]], t), y = track([[0.05, 60], [2.0, 27, "io"]], t), s = 0.85;
  const dim = 0.22 * covered(x, s) * Math.max(0, Math.min(1, (y - 20) / 30));
  return `${OPEN}${LAND}${over(SHADE, dim)}${SUNLIGHT}${cloud(x, y, s, "paper", "paper-deep")}</svg>`;
}

// ---- sad.
const SAD_DUR = 2.6;
function sad(t) {
  if (t <= 0) return STILL;
  // A bigger, greyer one: in from the left, slowing, and it stops square over the sun.
  const x = track([[0.05, -60], [1.9, SUN[0], "out"]], t), y = 70, s = 1.25;
  const dim = 0.32 * covered(x, s);
  return `${OPEN}${LAND}${over(SHADE, dim)}${SUNLIGHT}${cloud(x, y, s, "paper-mid", "steel")}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
