// The evening's two stories. Happy: golden hour. The sky warms, band by band from the horizon up, as the sun goes down until it sits half behind the hills. Sad: the day's
// over. The sun goes on down until it's gone behind the hills, and the sky darkens from the top, to night.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths. The sun sits in a hole in its sky band: where it's gone, a patch of
// the band covers the hole, and the sun is clipped to its own outline, so it sets behind the hills.
import { n2, paint, parsePath, partsOf, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n<path d=\"M-4.4-4.4l208.8 0 0 48.4-208.8 0 0-48.4Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M-4.4 40.6l208.8 0 0 45.3-208.8 0 0-45.3Z\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M-4.4 82.5l208.8 0 0 63c-13.8-2.8-28.5-3.1-42.5-1.3-.3-.2-.6-.7-.9-.8-.6-.2-2.5 .3-3.1 .4-2.2-13-7-26.1-16.5-35.7-3.6-3.6-8.1-6.5-12.6-8.9-20.6-11.2-46.2-9.2-65.1 4.6-7.2 5.2-12.9 12.7-16.7 20.7-1 2.3-2 4.6-2.9 6.9-.5 1.6-.8 3.3-1.6 4.7-.7 1.2-2.1 2.7-3.2 3.3-1.2 .7-13.2 .2-15.6 .2-9.6 0-18.8 1.8-28.1 3.8l0-60.9Z\" fill=\"var(--art-violet-lit,#A68CFF)\"/>\n<path d=\"M144.2 108.3c.9 .9 1.7 2 2.7 2.9 .6 .6 1.4 1 2 1.7 3.7 4.2 6.8 10.6 8.7 15.9-.6 1.6-.2 1.7 .4 3.6-.4 0-1.3 .3-1.8 .3l-113.2 0c-.5 0-1.3-.4-1.8-.5 .7-1.7 .8-2.5 .8-4.3 .1-.1-.1 .2-.1 .2 .9-1.3 1.3-3 2-4.3 2.2-4.4 4.9-9.3 8.7-12.4 1.1-.9 2.2-3 3.7-3l87.9-.1Z\" fill=\"var(--art-clay-lit,#F6A06F)\"/>\n<path d=\"M41.5 129.3l116.4 0c1.6 4.9 2.9 9.8 3.4 14.9-7.1 .8-14.2 1.7-21.2 3-5 1-10 2.4-15 3.1-1.3 .2-2.6 0-3.9 .1-3.2 .4-6.3 1.9-9.5 2.2-2.8 .3-6.4-.6-9.2-1.2l-34.7-7.6c-6.4-1.5-13-2.3-19.5-3-2.3-.3-6.6-.1-8.5-1.2-.9-.5-1.6-1.4-2.3-2.1 .5-.2 1.2-.3 1.7-.5 .2-2.5 1.3-5.2 2.3-7.7Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M148.2 111.7l-96.5 .1c18.1-22.4 48.9-29.8 74.9-17.3 8.6 4.2 15.3 10.2 21.6 17.2Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M124.7 150.5c-.8 .2-1.6 .3-2.4 .5l-46.3 11.2-20.4 4.3c-19.7 4.1-40.2 4.4-60 .7l0-27.3c5.9-1.1 11.6-2.5 17.6-3.2 16.8-1.8 37.7-.1 54.3 3.5l34.6 7.7c7.4 1.6 15.1 2.1 22.6 2.6Z\" fill=\"var(--art-ink,#231F3B)\"/>\n</svg>\n";
export const STILL_HASH = "06c25acc10";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [TOP, MID, LOW, SUN_MID, SUN_LOW, SUN_TOP, HILLS] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const fill = (t) => `fill="${paint(t)}"`;
const SUN = `${SUN_MID.svg}${SUN_LOW.svg}${SUN_TOP.svg}`;
const SUN_AREA = `${SUN_MID.d}${SUN_LOW.d}${SUN_TOP.d}`;
const over = (svg, k) => (k <= 0 ? "" : k >= 1 ? svg : `<g opacity="${n2(k)}">${svg}</g>`);
const as = (part, c) => `<path d="${part.d}" ${fill(c)}/>`;

// ---- happy.
const HAPPY_DUR = 2.4;
// The lowest band, whole: the still cuts a hole in it for the sun, and a sun moving in a hole leaves seams at its edge. Drawn whole, with the sun over it,
// there's no edge there at all.
const LOW_BOX = (() => { const pts = parsePath(LOW.d).flatMap((r) => r.segs.flat()); const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]); return `M${Math.min(...xs)} ${Math.min(...ys)}H${Math.max(...xs)}V${Math.max(...ys)}H${Math.min(...xs)}Z`; })();
function happy(t) {
  if (t <= 0) return STILL;
  // Each band takes its warm color in turn, the lowest first, as the sun goes down: slowly, until it's half behind the hills.
  const low = track([[0.1, 0], [0.7, 1, "io"]], t), mid = track([[0.4, 0], [1.1, 1, "io"]], t), top = track([[0.75, 0], [1.5, 0.85, "io"]], t);
  const y = track([[0.1, 0], [2.1, 13, "io"]], t);
  // (clipped to the band's outline and the sun's together: one shape, so its curve along the hills stays and there's no edge where the hole was)
  const lowSky = y <= 0 ? `${LOW.svg}${over(as(LOW, "sun-lit"), low)}` : `<clipPath id="lb"><path d="${LOW.d}${SUN_AREA}"/></clipPath><g clip-path="url(#lb)"><path d="${LOW_BOX}" fill="${LOW.fill}"/>${over(`<path d="${LOW_BOX}" ${fill("sun-lit")}/>`, low)}</g>`;
  const sky = `${TOP.svg}${over(as(TOP, "violet"), top)}${MID.svg}${over(as(MID, "clay-lit"), mid)}${lowSky}`;
  const sun = y <= 0 ? SUN : `<g clip-path="url(#sa)"><g transform="translate(0 ${n2(y)})">${SUN}</g></g>`;
  return `${OPEN}<clipPath id="sa"><path d="${SUN_AREA}"/></clipPath>${BG}${sky}${sun}${HILLS.svg}</svg>`;
}

// ---- sad. The day's over: no lingering. The sun goes on down at the evening's own pace until it's gone behind the hills, and the dusk drains out of
// the sky from the top down, to night. (The happy one stops at the best of it; this one doesn't.)
const SAD_DUR = 2.2;
// The sky's three bands, as boxes (each band's own top to the next one's), darkened in turn.
const BANDS = [[-5, 42], [42, 84], [84, 205]];
function sad(t) {
  if (t <= 0) return STILL;
  const y = track([[0.1, 0], [1.4, 64, "io"]], t);
  const sun = y <= 0 ? SUN : `<path d="${SUN_AREA}" ${fill("violet-lit")}/><g clip-path="url(#sa)"><g transform="translate(0 ${n2(y)})">${SUN}</g></g>`;
  // Night comes down from the top: each band darkens a little after the one above it. (The lowest box runs on behind the hills, so no sky shows
  // between them where they cross.)
  const night = BANDS.map(([y0, y1], i) => over(`<path d="M-5 ${y0}H205V${y1}H-5Z" ${fill("ink")}/>`, 0.78 * track([[0.45 + 0.22 * i, 0], [1.25 + 0.25 * i, 1, "io"]], t))).join("");
  return `${OPEN}<clipPath id="sa"><path d="${SUN_AREA}"/></clipPath>${BG}${TOP.svg}${MID.svg}${LOW.svg}${sun}${night}${HILLS.svg}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
