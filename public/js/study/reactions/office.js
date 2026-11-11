// The office's two stories. Happy: a good day. The plant perks up, and a stem rises out of it and opens into a flower.
// Sad: the screen goes dark, the plant wilts as the day drags, and a leaf lets go and flutters to the floor.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths.
import { n2, n4, paint, parsePath, partsOf, runsToDc, subdivide, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M28.2 158.6c1.1 1.1 2.9 2.4 3.5 3.9 .7 1.6 .5 3.7 .6 5.4 .3 3.6 .5 7.2 .8 10.9 .2 2.4 .1 5.1 .8 7.5l3.4-23.9c.1-.8 3.2-3.5 3.7-4l-.4 3.7 117.8 .1-.4-3.7c.5 .6 3.5 3.2 3.6 3.9l3.2 25.5c-1.1 1.1-2.3 2.8-3.8 3.4-1.9 .7-6.6 .3-8.7 .3-6.4 0-12.8 0-19.2 0-28.7 0-57.4-.1-86 0 4.4 1.8 8.9 3.5 13.3 5.3 2.6 1 5.7 1.8 8.1 3.3 1.6 1.1 3 2.8 4.3 4.2l-77.2 0 0-42.3 32.9 0-.3-3.5ZM170.8 158.6l-.1 3.5 33.7 0 0 36.1c-9.4-2.1-18.8-4.2-28.2-6.4-3.8-.8-8.8-1.2-10.6-5.3-.8-1.7 .6-12.8 .8-15.4 .2-2.4 0-7 1.1-9 .8-1.3 2.2-2.5 3.3-3.5Z\" fill=\"var(--art-sun-lit,#FAD57E)\" fill-rule=\"evenodd\"/>\n<path d=\"M169 182.9l-.4 3.8 35.8 8 0 9.7-135.7 0c-.1-.2 0-.6-.2-.7l-38.3-15.6 2.5-2.5c2.3 0 3.3-.2 5.2-1.4l-.6 3.9 124.1 0-.6-3.6c4.3 2 5 1.6 8.2-1.6Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M62.3 64.7c.8-.8 1.7-1.9 2.8-2.3 2.2-.9 10.4-.3 13.2-.3 12.3 0 24.7 0 37 0 2.6 0 9.4-.5 11.4 .3 1.6 .7 3.4 2.6 4.4 4 1.7 2.2 1 7.2 1 9.9 0 6.5 0 12.9 0 19.3 0 2.7 .5 5.8-.1 8.5-.3 1.3-1.2 2.2-2.1 3.2-.9 .8-1.7 1.9-2.8 2.4-2.1 1-6.5 .4-8.9 .4-14.1 0-28.2 0-42.3 0-2.5 0-9.1 .6-11.1-.4-1.2-.5-2.1-1.7-3-2.6-.4-.5-1.6-1.4-1.6-2.1l-.4-35.2c-2 1.9-3.8 4.3-6.5 5.3-3.3 1.2-7.4 .6-10.9 .6-7.2 0-14.3 0-21.5 0-4.3 0-11.7 1.2-14.6-2.7-2.8-3.9-2.3-8.6-2.3-13.1 0-8 0-15.9 0-23.8 0-4.7 0-9.5 0-14.2 0-2.4-.3-4.9 .1-7.3 .3-1.4 .9-2.6 1.8-3.7 3.2-3.8 8.5-3 12.8-3 10.7 0 21.4 0 32 0 1.3 0 2.8-.1 4 .2 2.4 .5 7.2 3.1 7.2 5.9l.4 50.7ZM9.4 38.2l20.7 0 0-24.5c-3.7 0-7.4 0-11.2 0-1.9 0-4.1-.2-6 .2-.8 .2-1.5 .5-2.1 1-1.8 1.6-1.4 4.4-1.4 6.6 0 5.6 0 11.2 0 16.7ZM34.1 13.7l0 24.5 20.7 0c0-5.5 0-11 0-16.6 0-2.2 .5-5.1-1.4-6.7-.6-.6-1.4-.9-2.2-1-1.8-.4-3.8-.2-5.7-.2-3.8 0-7.6 0-11.4 0ZM9.4 42.2c0 5.7 0 11.3 0 16.9 0 2.3-.4 5.2 1.5 6.8 2.3 1.8 15.7 1 19.2 1l0-24.7-20.7 0ZM34.1 42.2l0 24.7c3.6 0 16.8 .8 19.1-1 2-1.6 1.6-4.4 1.6-6.7 0-5.7 0-11.3 0-17l-20.7 0ZM50.7 102.8c0 3.7 .7 13.3-.7 16.2-.6 1.4-1.7 2.5-2.7 3.5-2.7 2.7-4.1 3.8-8 3.8-2.6 0-3.8-.6-5.4-2.7 .8-.1 1.3 0 2-.7-1-1-1.6-2-2.1-3.3-1.6-.1-3.1-.3-4.4-1.1-4.8-2.9-4.3-10.2 .7-12.6 1.2-.6 2.6-.6 4-.8l.1-3.1c3 0 8.7-.4 11.5 0 .7 .1 1.1 .5 1.7 .7 1 .3 2.2 .1 3.3 .1ZM34.1 116.8l0-8.8c-.9 .1-1.9 0-2.8 .4-3.1 1.3-3.4 5.9-.5 7.7 1 .6 2.1 .6 3.3 .7Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M62.6 65.1H129.1V107.1H62.6Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M182.3 56.3l-5.4 12.4c-.3 .6-1 1.6-1.5 2l-9.8 7.6c-3.6 2.8-3.5 16.1-3.5 20.6l5.3-12.8c.5-1.1 1.9-2.2 2.8-2.8 5.8-4.3 13.2-2.4 19.4-.2-.5 .2-1.6 .6-2 1.1l-8.2 7.9c-2.6 2.5-6.7 1-9.8 1.6-4.5 .8-5.6 5.2-6.3 9.1 .6 .3 1.2 .4 1.8 .5-2.3 2.9-2.5 2.5-6.1 2.5l-2.3-2.5c.6-.1 1.2-.2 1.9-.2 0-.3 .3-.4 .3-.6 .2-.4-.1-1.5 0-1.9 .1-3.5 .5-8.5-3.5-10-2.5-.9-7.2 .3-8.9-2.4l-5.8-8.8c-.4-.5-1.3-1.1-1.7-1.5 6.7-1.7 15.6-2.3 19.2 5 1.4 2.9 1.4 6.4 1.9 9.5 .2-1.8 1.2-7.8 .8-9.4l-2.6-11.1c-.3-1.5 .3-3.7 .9-5.1 3.4-8.7 14.9-10.5 23.1-10.5ZM62.6 95.6C70.5 92.4 80.2 86.4 93.4 85.1C104.6 84 115.6 86.9 129.1 92.2L129.1 107.1L62.6 107.1Z\" fill=\"var(--art-teal,#37B39B)\" fill-rule=\"evenodd\"/>\n<path d=\"M55.3 7.7c9.5 3.2 7.8 8.3 7.8 16.8 0 12.6 .3 25.3-.1 38l3.2-.7c-.2 .3-3.2 3.1-3.3 3.6l-.9 10c0 .5-1.5 1.6-1.9 1.9-.2-.8-.1-1.4-.6-2-1.2 .5-2.4 1-3.7 1.2-3.2 .5-6.7 .2-9.9 .2-6.7 0-13.4 0-20 0-4 0-12 .5-15.5-.3-4-1-5.7-4.2-6.5-7.9 4.9 4.9 8.1 3.7 14.6 3.7 8.2 0 16.3 0 24.5 0 4.2 0 9.3 .8 12.8-2 3.8-3.1 3.2-8.5 3.1-12.9l-.4-44.8c0-1.8-2.1-3.6-3.2-4.8ZM47 102l4.9 .1c.1 4.1 .1 8.3 .1 12.5 0 1.8 .3 3.9-.2 5.7-.2 1-1.1 1.9-1.7 2.8 .7 .4 1.3 .4 2 .6-.7 .7-1.5 2-2.4 2.4-.9 .4-5 .4-5.9 .1-.8-.4-1.5-1.4-2.2-2 1.6-1.3 3.9-3.2 4.8-4.9 1.4-2.8 .9-13.8 .6-17.3Z\" fill=\"var(--art-paper-deep,#DAD1BC)\" fill-rule=\"evenodd\"/>\n<path d=\"M169.6 103.2c-.1 4.2-.6 11.7-2.6 15.4-1.3 2.4-5.4 6.6-8.1 7.4-1.4 .3-2.9 .2-4.2 .2-1.2 0-2.6 .1-3.7-.4-1-.5-1.9-1.6-2.7-2.4 .9-.1 1.9-.1 2.9-.1-3.7-4.7-4.2-8.9-4.9-14.7-.2-1.8-.9-4.8 1-5.9 1.7-.9 4.5-.4 6.4-.4 3.3 0 6.9-.3 10.2 0 .9 .1 1.6 .5 2.4 .7 1.1 .2 2.2 .2 3.3 .2Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M165.5 102.3c2 0 5.8-.7 7.3 .9 1.2 1.4 .5 4 .3 5.7-.7 5.8-1.2 9.8-5 14.4 1 0 2 0 3 0-.7 .8-1.8 2.2-2.8 2.7-1.2 .6-6.3 .2-8 .2l-2.3-2.6c.6-.1 1-.2 1.6-.6 0-.2 .4 .1 .3-.3-.2-.3-.4 .3-.5-.1-.4-1.1 .3 .7 .2-.4 1.3-.7 2.5-1.4 3.4-2.7 2.3-3.3 3.5-13.3 2.5-17.2Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M128.5 61.3c3.3 0 6.4 .6 7.7 4 1.2 3.1 .6 8.1 .6 11.4 0 6.8 0 13.5 0 20.3 0 3 .6 6.9-.5 9.9-1.3 3.4-4.4 4-7.6 4-.1-.1-.3 .1-.3 0-.1-.5 .4-.4 .3-.8 0 0-.2 .1-.2 0-1 0-1.9 0-2.8 .1 .8-.9 1.9-1.8 2.5-2.8 2.1-3.1 1.3-7.9 1.3-11.4 0-5.9 0-11.9 0-17.8 0-3.7 .7-8.3-.6-11.9-.6-1.6-1.9-2.7-2.9-4.1 .8-.1 1.5-.1 2.2-.1 .1-.1 .4 .1 .4-.2 0-.2-.4-.2-.3-.6 0 0 .2 0 .2 0ZM106 107.5l2.4 2.5c-.8 .1-1.3 .1-1.9 .5l1 7.7 3.4 0c.2-.4 .4 .1 .4-.3 0-.2-.4-.2-.3-.4 .1-.6 .1 .3 .3-.3 4.6 .1 8.5 .5 8.7 6 .6 .1 1.3 .1 1.9 .2l-2.4 2.8c-3.4 0-4.2 .6-6.7-1.9-.6-.6-1.3-1.1-1.7-1.9-.9-1.6-.5-1.9-2-3.6-2.7 2.7-2.7 2.1-6.4 2.1-4.3-4.4-3.8-3.5-4.6-9.6 3.7-3.7 2.6-3.8 7.9-3.8ZM175.4 122.7c2.3 0 4.9-.4 6.9 .6 4.1 1.9 4.6 7.6 .8 10.1-2.1 1.4-5 1-7.5 1-.6-1 0 .6 0-.7 0-.1-.2 0-.2-.1-1 0-1.9 0-2.9 0 .3 4.9-.4 9.8-.8 14.6-.7 9.4-1.5 18.8-2.3 28.2-.2 2.5-.1 10.5-1.8 12-.9 .7-2.2 .6-3.3 .7-.7-1 .4-.9-2.1-1.1-1.2-7.5-.3-15.2 0-22.7 .3-5.7 .4-11.3 .7-17 .2-2.7-.1-11.6 1-13.5 .7-1.5 2.4-2.7 3.6-3.8 3.3 0 3.8-.7 6.3 1.6 3.2-4.1 1.7-6.1-1.4-9.3 1 .1 1.8 .2 2.9 .2 0-.1 .2 0 .2 0 .2-.4-.3-.3-.3-.7 0-.1 .2 0 .2-.1ZM45.6 133.6c-.8 0-1.2 0-1.9 .4 .1 4.7-.9 9.4-1.4 14.1-1.1 9.5-2.3 19-3.5 28.5-.3 2.2-.7 10.3-2.1 11.7-1 .8-2.3 .7-3.5 .8-.1-.2 0-.5 0-.7-.1-.2-2-.3-2.1-.3-1-9.9 .8-20.1 1.6-29.9 .5-5.3 .9-10.6 1.4-15.8 .2-2.1 .1-4.4 .6-6.4 .2-1.3 1.1-2.1 2-3 3-3 6.4-2.8 8.9 .6Z\" fill=\"var(--art-ink-lit,#3A3460)\" fill-rule=\"evenodd\"/>\n<path d=\"M101.6 110.9c.3 2.2 .5 4.3 .8 6.5 5.7 0 10.3-1.6 12.2 5.3 13.6 0 27.2 0 40.7 0 3.9 0 7.7 .1 11.5 0 2.4-.1 5-.5 7.4 .1 4.9 1.2 6.5 7.4 2.4 10.5-2.6 1.9-6.6 1.1-9.6 1.1-.8 17.8-1.7 35.7-2.5 53.5 0 .7-.5 1.2-.8 1.8-.7-.6-1.7-1.2-2.2-2-1-1.9-1.4-10.4-1.7-13-1.6-13.4-3.2-26.8-4.6-40.3-15.4 0-30.9 0-46.3 0-5.9 0-11.9 0-17.8 0-17.6 0-35.2 0-52.8 0-1.6 17.9-3.3 35.7-4.9 53.6 0 .6-.5 1.2-.8 1.8-.7-.6-1.7-1.3-2.1-2.2-.9-1.7-1-10.8-1.2-13.3-.9-13.3-2.1-26.6-2.7-39.9-3.5 0-8.2 .9-10.8-2-2.4-2.6-1.8-6.9 1.2-8.8 .4-.2 1.1-.7 1.6-.7 19.4-.1 38.8-.1 58.2-.2 1.8-6.5 6.8-5.9 12.5-5.2 .3-2.2 .6-4.4 .9-6.6-7 0-14 0-21 0-3.2 0-6.7 .5-8.8-2.5-.6-.8-1-1.7-1.2-2.7-.3-2-.1-4.2-.1-6.2 0-3.9 0-7.8 0-11.7 .1-7.3 .1-14.6 .2-21.9 0-3 4.3-4.6 6.8-4.6 8.3-.3 16.6 0 25 0 9.1 0 18.3 0 27.5 0 3.6 0 8.5-1 11.5 1.5 3.1 2.4 2.4 6.7 2.4 10.2 0 8.7 0 17.5 0 26.2 0 3.6 .7 8-2.5 10.4-2.5 1.9-6 1.3-8.9 1.3-6.5 0-13 0-19.5 0ZM65.5 65.7c-3.3 1-2.3 6.2-2.3 8.8 0 7.5 0 15 0 22.5 0 2.1-.5 6.9 .8 8.5 1.4 1.8 10.3 1.1 12.8 1.1 12.5 0 25 0 37.4 0 2.8 0 10 .5 12.3-.2 .7-.2 1.2-.6 1.6-1.2 1.1-1.8 .5-6.4 .5-8.6 0-7.1 0-14.3 0-21.5 0-2.3 .8-7.5-1.3-8.9-1.9-1.3-12.7-.6-15.6-.6-10.6 0-21.2 0-31.7 0-3 0-12.2-.5-14.5 .1Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n<path d=\"M74.6 119.7L116.4 119.7C117.4 119.7 118.2 120.5 118.2 121.5L118.2 123.2L72.8 123.2L72.8 121.5C72.8 120.5 73.6 119.7 74.6 119.7Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M113.4 119.7L116.4 119.7C117.4 119.7 118.2 120.5 118.2 121.5L118.2 123.2L113.4 123.2Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/></svg>\n";
export const STILL_HASH = "78cb76ce11";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const PARTS = partsOf(STILL);
// The screen's picture: a sky behind, and the teal path (the plant's leaves, then the screen's hill).
const SKY = PARTS.findIndex((p) => p.fill.includes("--art-sky-lit,")), TEALI = PARTS.findIndex((p) => p.fill.includes("--art-teal,"));
if (SKY < 0 || TEALI !== SKY + 1) throw new Error("office: the still isn't as this story knows it");
const TEAL = PARTS[TEALI];
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const fill = (t) => `fill="${paint(t)}"`;
const tealRuns = parsePath(TEAL.d);
const LEAVES = subdivide([tealRuns[0]], 2), LINES = runsToDc(tealRuns.slice(1));
// Everything but the screen's picture and the teal, in the still's order, with their place kept: the leaves and the screen are drawn by the story.
const before = PARTS.slice(0, SKY).map((p) => p.svg).join(""), after = PARTS.slice(TEALI + 1).map((p) => p.svg).join("");
// The whole screen, out under its frame (drawn after it), so its light covers all of it.
const SCREEN = { x: 62.6, y: 65.1, w: 66.5, h: 42 }, MID = [95.5, 86];
const screenClip = `<clipPath id="sc"><rect x="${SCREEN.x}" y="${SCREEN.y}" width="${SCREEN.w}" height="${SCREEN.h}"/></clipPath>`;
// The plant: its leaves turn about the top of the pot, the further out the more, each to its own side: up when it perks, down when it wilts.
const BASE = [158, 104];
const bend = (x, y, lift) => {
  const dx = x - BASE[0], dy = y - BASE[1], d = Math.hypot(dx, dy), a = (-Math.sign(dx || 1) * lift * Math.min(1.4, d / 40) * Math.PI) / 180;
  return [BASE[0] + dx * Math.cos(a) - dy * Math.sin(a), BASE[1] + dx * Math.sin(a) + dy * Math.cos(a)];
};
const leaves = (lift) => (lift === 0 ? `<path d="${runsToDc(LEAVES)}" ${fill("teal")} fill-rule="evenodd"/>` : `<path d="${runsToDc(LEAVES, (x, y) => bend(x, y, lift))}" ${fill("teal")} fill-rule="evenodd"/>`);
const scene = (screen, plant) => `${before}${plant}<g clip-path="url(#sc)">${screen}</g>${after}`;

// ---- happy.
// The flower: a stem out of the middle of the plant, growing up and leaning with it, and at its top a bud that opens into five petals, lit from the upper left
// like everything here, round a sunny middle.
const STEM = [[160, 92], [161, 74], [164, 56]];
function flower(grow, open, lift) {
  if (grow <= 0) return "";
  const [a, b, c] = STEM.map(([x, y]) => bend(x, y, lift * 0.6));
  const tip = [a[0] + (c[0] - a[0]) * grow, a[1] + (c[1] - a[1]) * grow], mid = [a[0] + (b[0] - a[0]) * grow, a[1] + (b[1] - a[1]) * grow];
  let out = `<path d="M${n2(a[0])} ${n2(a[1])}Q${n2(mid[0] + 1)} ${n2(mid[1])} ${n2(tip[0])} ${n2(tip[1])}" fill="none" stroke="${paint("teal-deep")}" stroke-width="2.6" stroke-linecap="round"/>`;
  const bud = Math.min(1, grow * 1.3);
  out += `<g transform="translate(${n2(tip[0])} ${n2(tip[1])})">`;
  if (open <= 0) out += `<ellipse cx="0" cy="-3.4" rx="${n2(3.2 * bud)}" ry="${n2(4.5 * bud)}" ${fill("clay-deep")}/>`;
  else {
    for (let i = 0; i < 5; i++) {
      const ang = -90 + i * 72, r = 6.2 * open, lit = Math.cos(((ang + 135) * Math.PI) / 180) > 0;
      out += `<ellipse cx="0" cy="${n2(-r)}" rx="${n2(3.9 * open)}" ry="${n2(5.9 * open)}" transform="rotate(${ang + 90})" ${fill(lit ? "clay-lit" : "clay")}/>`;
    }
    // The bud opens: its petals spread out from under it, and it shrinks into the flower's middle as they do (it never just goes).
    const k = Math.max(0, 1 - open / 0.6);
    if (k > 0) out += `<ellipse cx="0" cy="${n2(-3.4 * k)}" rx="${n2(3.2 * bud * k)}" ry="${n2(4.5 * bud * k)}" ${fill("clay-deep")}/>`;
    out += `<circle r="${n2(3.2 * Math.min(1, open * 1.4))}" ${fill("sun")}/><path d="M0 ${n2(-3.2 * Math.min(1, open * 1.4))}A${n2(3.2 * Math.min(1, open * 1.4))} ${n2(3.2 * Math.min(1, open * 1.4))} 0 0 1 0 ${n2(3.2 * Math.min(1, open * 1.4))}Z" ${fill("sun-deep")}/>`;
  }
  return `${out}</g>`;
}
const HAPPY_DUR = 2.1;
function happy(t) {
  if (t <= 0) return STILL;
  // The screen keeps its picture: the plant tells it.
  const screen = `${PARTS[SKY].svg}<path d="${LINES}" ${fill("teal")} fill-rule="evenodd"/>`;
  // The plant perks up with a little spring; then the stem rises and the bud opens, past open, and settles.
  const lift = track([[0.3, 0], [0.65, 9, "out"], [0.8, 7, "io"], [0.92, 8, "io"]], t);
  const grow = track([[0.6, 0], [1.1, 1, "out"]], t), open = track([[1.08, 0], [1.32, 1.12, "out"], [1.44, 0.96, "io"], [1.54, 1, "io"]], t);
  return `${OPEN}${screenClip}${BG}${scene(screen, leaves(lift) + flower(grow, open, lift))}</svg>`;
}

// ---- sad.
const SAD_DUR = 2.6;
// (it lets go early, while the foliage it's tucked behind still hangs over it: later, the drooping leaves have moved off that spot and it would appear in
// the open)
const FALL = 0.62;
function sad(t) {
  if (t <= 0) return STILL;
  // The screen goes dark: its light dies away over the picture, and stays off.
  const off = track([[0.2, 0], [0.42, 1, "in"]], t);
  let screen = `${PARTS[SKY].svg}<path d="${LINES}" ${fill("teal")} fill-rule="evenodd"/>`;
  if (off > 0) screen += `<rect x="${SCREEN.x}" y="${SCREEN.y}" width="${SCREEN.w}" height="${SCREEN.h}" ${fill("ink-lit")} opacity="${n2(off)}"/>`;
  // The plant wilts, slowly, the longer it hangs.
  const droop = track([[0.4, 0], [2.2, -44, "io"]], t);
  // A leaf lets go and flutters down: falling at a drag-limited speed, swinging side to side, turning as it swings; it lies on the floor.
  // It starts tucked in the foliage, behind the other leaves, so it slips out from among them rather than appearing.
  let leaf = "";
  if (t > FALL) {
    const s = t - FALL, land = 1.0, q = Math.min(s, land);
    const x = 174 + 10 * Math.sin(q * 7) - 6 * q, y = 84 + 104 * (q / land), rot = 40 * Math.sin(q * 7);
    const flat = track([[land - 0.08, 1], [land, 0.45, "in"]], s);
    leaf = `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(rot + 70)}) scale(${n4(flat)} 1)"><path d="M0 7C-4 3 -4 -4 0 -8C4 -4 4 3 0 7Z" ${fill("teal")}/></g>`;
  }
  return `${OPEN}${screenClip}${BG}${scene(screen, leaf + leaves(droop))}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
