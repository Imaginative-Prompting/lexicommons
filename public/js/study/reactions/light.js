// The light's two stories. Happy: an idea. The bulb flares up, its glow spreading, its rays shooting out longer, and it stays bright. Sad: it's going.
// It flickers, flickers again, pops, and it's out: gray glass, no rays, its filament snapped and a smudge of soot inside.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths; its rays are runs of the light's path, kept apart.
import { n2, n4, paint, parsePath, partsOf, runsToDc, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M123.2 82.9c4.2 4.2 6.8 5.3 2.3 10.8l2.9 2.8c-7.5 9.4-17.1 16.9-22.2 28.1-.7 1.5-1.3 3.2-1.8 4.9-1 3.4-1.5 7.1-5.7 7.6l0 10.3c-1.2 1.2-2.5 3.1-4.1 3.7-1.2 .5-12.1 .5-13.3 0-1-.3-1.7-1.2-2.4-2 .6-.3 1.2-.5 1.8-.9-.3-1.9 .1-3.9 .1-6-.1-4.9-1.6-9.9-3.8-14.3-2.9-5.4-6.8-10-10.5-14.8-6.6-8.4-11.5-18.4-11.5-29.3 .1-21.9 16.9-41.2 38.5-44.6 4.5-.7 9.9-1 14.3 .1 1.3 .3 2.4 1 3.7 1.5 2.6 1 5.5 1.4 7.9 3 2.8 1.9 5.2 5.2 7 8 6.4 10.7 4.8 21.8-3.2 31.1Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M101.4 14.4c1.7 0 3.1 1.4 3.1 3.1l0 12.9c0 1.7-1.4 3-3.1 3-1.7 0-3.1-1.3-3.1-3l0-12.9c0-1.7 1.4-3.1 3.1-3.1ZM54 31.2c.9-.3 1.8-.1 2.6 .3 1.3 .7 9.3 8.8 10.1 10.2 .8 1.3 .8 2.9-.4 3.9-.9 .8-2 .9-3.1 .5-1.5-.5-9.9-9-10.7-10.6-.9-1.6-.3-3.7 1.5-4.3ZM146.7 31.2c2.3-.6 4.4 1.6 3.6 3.8-.5 1.6-9.3 10.5-10.9 11.1-.9 .4-2.1 .4-2.9-.2-1.4-1-1.6-2.7-.8-4.1 .9-1.6 9.6-10.3 11-10.6ZM108.1 39.2c6.9 1.7 13.3 4 19 8.2 4.5 3.2 8.4 7.3 11.5 12 2.5 3.8 4.4 8 5.7 12.4 3.4 12.4 1.1 25.2-5.9 35.9-5.6 8.5-13.4 15.6-17.3 25.1-2.7 6.3-2 9.1-2.4 15.5 .5 .3 1.1 .5 1.6 .9-.6 .7-1.3 1.4-2 2.1-3 0-16 .5-18-.2-1.3-.5-3.2-2.4-3.8-3.7-.8-1.7-.3-10-.3-12.4l2.5-2.3c.2 .8 .2 1.2 .9 1.9 .7-2 1-4.1 1.7-6.2 1.7-5.3 4.6-10.3 8.2-14.7 3.7-4.6 13.6-13.3 15.5-17.9-.7 0-1 .3-1.7 .7-.4-.4-.7-.7-1-1.1 2.7-3.7 3.7-5.1 2.1-9.5-2.5-.8-3.1-.9-5-2.8 2.5-1.6 4-4.9 5.2-7.5 5.2-11.1 .8-23.9-8.4-31.5-2.4-2-5.2-3.4-8.1-4.9ZM34.5 75l13.2 0c1.7 0 3 1.3 3 2.9l0 .3c0 1.6-1.3 2.9-3 2.9l-13.2 0c-1.6 0-2.9-1.3-2.9-2.9l0-.3c0-1.6 1.3-2.9 2.9-2.9ZM154.8 75.2l12.8 0c1.7 0 3.1 1.4 3.1 3.1 0 1.8-1.4 3.2-3.1 3.2l-12.8 0c-1.7 0-3.1-1.4-3.1-3.2 0-1.7 1.4-3.1 3.1-3.1ZM55.6 111.6c2.3-.3 4 2 3.2 4-.5 1.5-8.9 10-10.4 10.6-1 .4-2 .4-2.9-.3-1.1-.7-1.5-2.1-1.1-3.3 .6-1.8 9.6-10.7 11.2-11ZM144.4 111.6c.8-.1 1.6 .1 2.3 .6 1.1 .7 8.9 8.6 9.5 9.7 .7 1.3 .6 2.9-.6 3.9-.9 .7-1.9 .8-2.9 .5-1.6-.6-9.6-8.7-10.4-10.3-.9-1.8 0-4 2.1-4.4Z\" fill=\"var(--art-sun,#F7BE45)\" fill-rule=\"evenodd\"/>\n<path d=\"M101.1 89.1l5.7 3.9c3.4-5.4 9.1-13.2 16.7-10.9 2 .6 3.6 2.1 4.4 4 2.9 7.1-5.1 13.1-11.4 13.4-3 .1-5.8-.9-8.5-2.1-9.5 18.9-8.3 30.1-8.3 50.4 4.4 0 8.8 0 13.3 0 2 0 4.2-.2 6.2 .1 .9 .1 1.7 .5 2.5 1 5.2 3.7 3.3 14.3-2.7 14.3l-38.7 0c-6.1 0-7.7-10.2-3.2-13.9 .7-.6 1.6-1.1 2.6-1.3 1.7-.4 3.5-.2 5.2-.2 3.4 0 6.9 0 10.3 0l-.1-27.2c0-7.9-1.8-15.6-4.7-22.9-2.6 1-5.2 1.9-8 1.7-6.3-.3-14.2-6.4-11.2-13.4 .9-1.9 2.6-3.3 4.6-3.9 7.6-2.1 12.9 5.3 16.3 10.8l4.4-3.7c-2.1-2.4-4-4.9-5.1-7.9-2.2-6.1-1.4-16.6 7.2-16.7 8.5 0 9.2 10.1 7.2 16.2-1.1 3.1-2.8 5.6-4.7 8.3ZM98.6 86.8c2.8-3.8 5.2-8.4 4.3-13.4-.4-2.1-1.7-4.9-4.3-4.9-1.4 0-2.6 1-3.3 2.2-3.3 5.3 .1 11.8 3.3 16.1ZM89 94.7c-2.3-3.6-6-9.4-11.2-8.8-1.1 .1-2.2 .7-2.7 1.7-2.2 4.1 3.9 7.8 7.3 8.2 2.3 .2 4.4-.4 6.6-1.1ZM109.8 94.6c4.8 1.6 10.8 2.1 13.8-3 .7-1.1 1.1-2.6 .5-3.9-.5-1-1.6-1.6-2.7-1.8-5.1-.7-9.1 5.2-11.6 8.7ZM93.6 95.8c2.4 5.8 4 11.6 4.9 17.8 1.6-6.2 3.8-12 6.7-17.8l-6.4-4.5-5.2 4.5ZM121.3 166.7c-1.9 25-41.7 24.9-43.4 0l43.4 0Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "24a227eda1";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [GLASS, SUN, INK] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const fill = (t) => `fill="${paint(t)}"`;
const R = parsePath(SUN.d);
const LIT = runsToDc([R[3]]);
// Each ray, with the direction it points from the bulb's middle, so it can grow out along it.
const MID = [101, 92];
const RAYS = [0, 1, 2, 4, 5, 6, 7].map((i) => { const p = R[i].segs.flat(), cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length; return { d: runsToDc([R[i]]), at: [cx, cy] }; });
const ray = (r, out, s) => `<g transform="translate(${n2((r.at[0] - MID[0]) * out)} ${n2((r.at[1] - MID[1]) * out)}) translate(${n2(r.at[0])} ${n2(r.at[1])}) scale(${n4(s)}) translate(${n2(-r.at[0])} ${n2(-r.at[1])})"><path d="${r.d}" ${fill("sun")}/></g>`;
const bulb = (glass, lit, rays) => `${glass}${rays}${lit}${INK.svg}`;

// ---- happy.
const HAPPY_DUR = 2.1;
function happy(t) {
  if (t <= 0) return STILL;
  const f = track([[0.08, 0], [0.32, 1.2, "out"], [0.45, 0.95, "io"], [0.58, 1, "io"]], t);
  // (No halo: the bulb itself lights, and its rays shoot out.)
  // The glass catches the light: its left half warms to the lit color, over it.
  const glass = `${GLASS.svg}${f > 0 ? `<path d="${GLASS.d}" ${fill("sun-lit")} opacity="${n2(Math.min(1, f) * 0.85)}"/>` : ""}`;
  const rays = RAYS.map((r, i) => ray(r, 0.22 * f + 0.05 * Math.sin(t * 9 + i) * Math.min(1, f), 1 + 0.35 * f)).join("");
  return `${OPEN}${BG}${bulb(glass, `<path d="${LIT}" ${fill("sun")}/>`, rays)}</svg>`;
}

// ---- sad.
const POP = 1.05;
const SAD_DUR = 2.3;
function sad(t) {
  if (t <= 0) return STILL;
  // Flickers: off for a frame or two, on, off longer, on, then the pop.
  const off = (t > 0.25 && t < 0.31) || (t > 0.42 && t < 0.46) || (t > 0.66 && t < 0.8) || (t > 0.9 && t < 0.95) || t >= POP;
  const dead = t >= POP;
  let glass, lit, rays;
  if (!off) { glass = GLASS.svg; lit = `<path d="${LIT}" ${fill("sun")}/>`; rays = RAYS.map((r) => ray(r, 0, 1)).join(""); }
  else {
    // Off, it's the glass's own pale; dead, it cools from that last warmth to gray, over half a second.
    const cool = dead ? Math.min(1, (t - POP) / 0.55) : 0;
    glass = `<path d="${GLASS.d}" ${fill("paper-deep")}/>${cool > 0 ? `<path d="${GLASS.d}" ${fill("steel")} opacity="${n2(cool)}"/>` : ""}`;
    lit = `<path d="${LIT}" ${fill("sun-deep")}/>${cool > 0 ? `<path d="${LIT}" ${fill("steel-deep")} opacity="${n2(cool)}"/>` : ""}`;
    rays = "";
  }
  // The pop: a little white flash inside, gone at once.
  const s = t - POP;
  const flash = s > 0 && s < 0.08 ? `<circle cx="${MID[0]}" cy="${MID[1] - 4}" r="${n2(10 + 120 * s)}" ${fill("paper")} opacity="${n2(1 - s / 0.08)}"/>` : "";
  // Dead: the filament has snapped, a gap in its top loop where it burned through; and the inside of the glass takes a smudge of soot at the top. Nothing
  // comes out of a sealed bulb.
  let broken = "";
  if (s > 0) {
    const soot = Math.min(1, s / 0.9);
    broken = `<clipPath id="lg"><path d="${GLASS.d}"/></clipPath><g clip-path="url(#lg)"><ellipse cx="101" cy="57" rx="22" ry="10" ${fill("ink-lit")} opacity="${n2(0.3 * soot)}"/></g>`
      + `<ellipse cx="104.6" cy="73" rx="2.6" ry="3.4" transform="rotate(-25 104.6 73)" ${fill("steel")}/>`;
  }
  return `${OPEN}${BG}${bulb(glass, lit, rays)}${broken}${flash}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
