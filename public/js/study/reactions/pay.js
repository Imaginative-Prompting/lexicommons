// Pay's two stories: the printer in the top of the reader feeds out the receipt from its slot behind the top edge, printed side to us. Happy:
// a short one: it stands up a little way, curls forward over the top, and its free end settles on the rim, ready to take. Sad: it doesn't stop:
// the curl comes on down the front, over the screen's tick and the keys, to the counter, where the paper still coming buckles into a loop
// at the reader's foot before the rollers stop.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M167.9 154.4l2.8 2.8-4.2 .9 37.9 0 0 35.1c-21.8-4.7-43.7-9.3-65.5-14.2-6-1.3-11.9-2.7-17.9-4.3-2-.5-4.5-.8-6.4-1.8-1.4-.8-2.6-2.4-3.8-3.5 1.1-1.1 2.3-2.6 3.6-3.4 2-1 12.8-3 15.7-3.6 12.6-2.7 25.1-5.9 37.8-8ZM29.7 154.6c1.2 1.2 3 2.5 3.6 4.1 .6 1.6 .9 6.6 2.7 7.3l84.8 34.6c1 .4 3 3 3.8 3.8l-129 0 0-46.3 34.5 0-.4-3.5Z\" fill=\"var(--art-teal-lit,#6FD0BD)\" fill-rule=\"evenodd\"/>\n<path d=\"M68.8 82.7c-4.7-3.3-8.4-8.1-12.4-12.2-1.5-1.4-4.1-3.4-4.5-5.5-.5-2.7 5.7-8.5 8.4-7.8 2.1 .5 6.3 5.5 7.9 7.1 3-4.1 11.5-16.3 15.3-18.7 3.2-2 8.9 3.9 8.8 6.5-.1 2.1-4.5 7-5.9 8.8-5.6 7.5-10.8 15.4-17.6 21.8ZM108.9 163.6c1 .8 2.1 1.6 3.4 2 .7 .2 1.5 .1 2.1 .5 1 .6 2 1.8 2.8 2.6l-3.2 .7c30 7.7 60.2 13.8 90.4 20.3l0 14.7-83.9 0c0-.2 .1-.6-.2-.7l-85.4-34.5 2.6-2.6c16.5 0 33 0 49.4 0 4.3 0 13.5 .6 17.2-.4 1.8-.5 3.3-1.5 4.8-2.6Z\" fill=\"var(--art-teal-deep,#25907B)\" fill-rule=\"evenodd\"/>\n<path d=\"M48.3 35.9c11.2-.2 22.4-.1 33.5-.1 1.7 0 3.5 .1 5.2 .1 5.2-.1 7.3-.7 11.3 3.2 1 1 2.1 2 2.9 3.1 1.9 2.6 4.1 18 4.9 22.2 .7 3.8 1.5 7.6 2.3 11.4 .3 1.9 1.1 4.1 .9 6.1 0 1.3-.6 2.5-1.4 3.6-5.4 6.8-8.8 5.2-16.7 5.2-9.6 0-19.2 0-28.8 0-3.8 0-9.3 .5-12.9-.1-3.2-.6-7.3-4.6-8.9-7.3-1.6-2.9-1.8-6.8-2.4-10.1-1.4-6.7-2.7-13.4-4-20.1-.7-3.2-2.4-7.6-.9-10.7 .6-1.2 1.7-2.2 2.7-3.2 4.5-4.4 6.5-3.3 12.3-3.3ZM68.5 68.3c-1.8-1.8-5.7-6.7-7.8-7.5-2.3-.8-5.7 1.5-5.4 4 .2 1.8 2.2 3.3 3.3 4.5 3.3 3.4 6.4 7.4 10.3 9.9 5-5.4 9.2-11.8 13.6-17.7 1.5-2 5.4-6.4 6.1-8.4 1.1-3.1-3.4-6-4.9-4.2l-15.2 19.4ZM62.9 96.9c1.1-1.1 2.4-2.8 3.9-3.5 1.5-.7 9-.7 10.5 0 1.5 .7 2.8 2.3 3.9 3.5 1.1-1.2 2.3-2.8 3.8-3.4 1.5-.7 3.3-.5 4.9-.5 1.7 0 3.8-.3 5.4 .3 1.6 .6 4.6 3.7 5.2 5.2 .6 1.5 .6 6.3 .1 7.8-.6 1.8-2.5 3.1-3.7 4.4 1.1 1.1 2.8 2.4 3.5 3.9 .8 1.5 .8 7.3-.1 8.8-.7 1.3-2.2 2.4-3.3 3.5 1.1 1.1 2.7 2.3 3.4 3.7 .7 1.4 .8 7.1 .1 8.5-.8 1.4-2.5 2.7-3.6 3.8 1.3 1.2 3.1 2.6 3.7 4.3 .5 1.5 .5 6.3-.1 7.8-.7 1.8-3.4 4.5-5.2 5.1-1.6 .6-3.7 .3-5.4 .3-1.5 0-3.3 .3-4.7-.3-1.5-.7-2.8-2.5-4-3.6-1.1 1.1-2.3 2.7-3.7 3.5-1.6 .8-9.2 .8-10.8 0-1.5-.7-2.7-2.3-3.8-3.5-1.1 1.2-2.4 2.8-3.9 3.5-1.4 .7-3.1 .4-4.6 .4-1.7 0-3.8 .3-5.4-.2-2-.7-4.7-3.5-5.4-5.4-.7-1.6-.7-6.2-.1-7.8 .7-1.7 2.5-3 3.7-4.2-1.1-1.1-2.6-2.3-3.4-3.6-.9-1.6-.9-7.1-.1-8.8 .7-1.4 2.2-2.5 3.3-3.7-1.1-1.1-2.5-2.2-3.3-3.6-.8-1.6-.9-7.1 0-8.7 .8-1.5 2.4-2.7 3.6-3.8-1.3-1.2-3.1-2.6-3.7-4.2-.7-1.6-.7-6.3-.1-7.9 .7-1.8 3.4-4.5 5.2-5.2 1.6-.6 3.9-.3 5.6-.3 1.5 0 3.3-.2 4.7 .4 1.5 .7 2.8 2.4 3.9 3.5ZM60.3 110.6l2.6 2.6 2.6-2.6-2.6-2.6-2.6 2.6ZM78.6 110.7l2.6 2.5 2.7-2.6-2.6-2.6-2.7 2.7ZM60.5 126.8l2.4 2.4 2.5-2.5-2.4-2.4-2.5 2.5ZM78.7 126.8l2.5 2.5 2.5-2.5-2.5-2.5-2.5 2.5ZM132.6 142.5l1 5.6c.1 .1-.1-.2-.1-.2 .1-.1 .1 .1 .2 .2 .3 .6 .4 1.4 .3 2.1-.2 1.9-1.9 3.2-3.2 4.5-.9 .9-1.7 1.9-2.9 2.4-1.9 .9-4.4 1-6.5 1.2-.3 .2-2.1 .7-3.1 .8-3.6 .7-4.7-.3-7.1-2.8-.9-.8-1.9-1.7-2.4-2.8-.5-1.1-.6-2.6-.8-3.7-.2 .2 .2 .5 .3 .8 0 0-.1-.2-.2-.2-.1-.2-.1-.3-.2-.5-.2-.4-.2-.8-.3-1.2-.3-1.3-.5-2.4-.5-3.7-.4-1.1-.8-2.2-.5-3.4 .4-2.1 4.2-5.7 6.2-6.5 1.9-.8 4.3-.9 6.4-1.2 .1-.1-.2 .1-.3 .1-.1 .1 .1 0 .2-.1 .1-.1 .2-.1 .4-.2 .4-.2 .9-.3 1.4-.4 1.5-.3 3.2-.7 4.6-.3 1.8 .6 5.5 4.2 6.3 5.9 .4 1.1 .5 2.5 .8 3.6ZM60.3 142.9l2.6 2.5 2.6-2.5-2.6-2.6-2.6 2.6ZM78.7 142.9l2.5 2.5 2.5-2.5-2.5-2.5-2.5 2.5Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M177 107.4c-.2 .2-.6 .3-.8 .6-.2 .4 .7 2.4 .7 2.7-2.8 1.2-6 1.6-9 2.3-4.8 1-9.6 2-14.3 3-11.3 2.6-22.6 5.1-33.9 7.7-6.8 1.6-13.6 3.1-20.3 4.9l-3.3-3.3c3.5-4.1 .9-4.7 2.5-7.7 .4-.7 1.1-1.4 1.8-2 4.2-4.2 8.5-4.3 14-5.7l-.1 3.4c5.5-.9 10.9-2.4 16.4-3.7 9.6-2.2 19.2-4.4 28.8-6.5 7-1.5 14.2-4.4 17.5 4.3ZM177.8 114.9l.5 3.1c.5 .3 .7 .2 1 .5 .5 .5 .7 2.5 .6 3.1-.1 .3-.4 .5-.4 .8-.1 .8 .4 2 .5 2.7-4 1.7-8 3.1-11.9 5.2-12.7 6.8-19.2 17.9-23 31.5l-3.3 .6c-.3 .4-.6 .8-.9 1.1l-27.2 5.7c-1.9 .4-4-1.6-5.3-2.6-.7 .5-1.3 1-2 1.5-3.2-3.9-3.4-8.1-4.4-12.9-1.4-6.4-3.7-14.2-3.8-20.7 1.1-1.1 2.2-2.6 3.7-3.3 1.8-1 4.2-1.2 6.2-1.6 4.6-1.1 9.2-2.1 13.8-3.1 18.6-4.1 37.2-8.1 55.9-11.6ZM118.8 137.2l1.1 5.4 9.2-1.8c-2.4-5.9-4.9-4.7-10.3-3.6ZM110 144.6l9.1-1.7-1.1-5.5c-5.5 1.2-8.2 .5-8 7.2ZM120.2 143.5l1 5.2 8.9-1.7-1.1-5.3-8.8 1.8ZM110.4 145.5l1.1 5.1 8.8-1.8-1-5.1-8.9 1.8ZM121.5 149.6l1 5.3c4.7-1 8.7-1 7.9-7.1l-8.9 1.8ZM111.6 151.6c2.1 6 5.1 4.4 10.2 3.3l-1.1-5.1-9.1 1.8Z\" fill=\"var(--art-sun,#F7BE45)\" fill-rule=\"evenodd\"/>\n<path d=\"M180.1 121.8c1.4 5.9 2.7 11.9 3.9 17.8 .5 2.4 1.2 4.9 1.4 7.3 .2 2.6-1.2 7.2-4.1 7.9l-40 8.6c4.8-21.4 18.4-34.7 38.8-41.6Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M38.5 29c-2.3 .3 1.4-.1 1.4-.1-1.1 1.1-2.2 2.3-3.3 3.3-.9 .6-1.9 1.1-2.6 1.9-1.1 1.4-2.2 4.5-1.9 6.3l10.5 57.5 .8 62.4c.1 3.7 3 6.5 5.4 8.9-1 0-1.9 0-2.8-.1-.1 .2-.4 0-.4 .3 0 .2 .3 .2 .3 .6 0 0-.2-.1-.2 0-5.8 .1-10.2 1.4-13.6-4.3-.7-1.2-1.6-2.8-1.7-4.2l-2.3-48.1c-.1-2.8-.4-5.7-.9-8.4l-9.3-54.4c-.2-1.3 .2-3 .4-4.2 1.4-7.7 7-14.6 14.4-17.1 2.1-.7 3.8-1.1 5.8-.3Z\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n<path d=\"M115.1 113.2c-8 2.1-15.6 1.7-15.9 12 9.1-2.5 18.5-4.5 27.7-6.6 16.7-3.8 33.3-7.5 50-11l2.4 10.6c-26.3 4.2-52.1 11-78.2 16.4 1.5 6.6 2.8 13.3 4.2 19.9 .9 4.3 1.4 8.7 3.5 12.6-5.7 4.2-11.6 2.9-18.4 2.9-10 0-20 0-30 0-3.7 0-9.8 .5-13.2 0-3.4-.6-7.1-6-7.2-9.3l-1.1-65.6-10.2-54.5c-.2-.9 .1-2.1 .3-3 1.3-5 5.5-8.8 10.7-9.5 4.2-.6 8.9-.1 13.2-.1 9 0 18 0 27 0 6.3 0 13.6-1.1 19.4 2 9 4.7 9.7 14.8 11.5 23.7 1.4 6.7 2.7 13.3 4 20 .9 4.2 2 8.5 2.2 12.9 .2 3.5-.3 7.1-.6 10.7-.4 5.3-.9 10.6-1.3 15.9ZM48.4 39.3c-3.5 .1-8.8-.9-11.1 2.4-2.2 3-.5 7.2 .2 10.5 1.5 7.4 2.9 14.9 4.4 22.4 .7 3.3 .8 7.5 3.3 10.2 2.9 3.1 7.4 2.5 11.3 2.5 8.7 0 17.5 0 26.2 0 4.2 0 8.3 0 12.5 0 2.1 0 4.4 .2 6.5-.3 1.1-.2 2.1-.8 2.9-1.7 .8-1 1.2-2.3 1.3-3.6 0-1.9-.6-3.8-1-5.6-.7-3.8-1.5-7.5-2.2-11.2-.8-4.5-1.7-8.9-2.5-13.4-.4-2.4-.7-5-1.4-7.3-.4-1-.9-2-1.7-2.7-3.1-3.4-8.8-2.1-13-2.2-4.8-.2-9.7 .1-14.6 .1-7 0-14-.1-21.1-.1ZM49.8 96.5l8 0c1.7 0 3.1 1.4 3.1 3.2l0 5.6c0 1.7-1.4 3.1-3.1 3.1l-8 0c-1.7 0-3.1-1.4-3.1-3.1l0-5.6c0-1.8 1.4-3.2 3.1-3.2ZM68 96.5l8 0c1.7 0 3.1 1.4 3.1 3.2l0 5.6c0 1.7-1.4 3.1-3.1 3.1l-8 0c-1.7 0-3.1-1.4-3.1-3.1l0-5.6c0-1.8 1.4-3.2 3.1-3.2ZM86.3 96.5l8 0c1.7 0 3.1 1.4 3.1 3l0 5.9c0 1.7-1.4 3-3.1 3l-8 0c-1.7 0-3-1.3-3-3l0-5.9c0-1.6 1.3-3 3-3ZM50 112.7l7.6 0c1.9 0 3.3 1.5 3.3 3.3l0 5.5c0 1.9-1.4 3.3-3.3 3.3l-7.6 0c-1.8 0-3.3-1.4-3.3-3.3l0-5.5c0-1.8 1.5-3.3 3.3-3.3ZM68.2 112.7l7.6 0c1.8 0 3.3 1.5 3.3 3.4l0 5.4c0 1.8-1.5 3.3-3.3 3.3l-7.6 0c-1.8 0-3.3-1.5-3.3-3.3l0-5.4c0-1.9 1.5-3.4 3.3-3.4ZM86.6 112.7l7.4 0c1.9 0 3.4 1.5 3.4 3.4l0 5.4c0 1.8-1.5 3.3-3.4 3.3l-7.4 0c-1.8 0-3.3-1.5-3.3-3.3l0-5.4c0-1.9 1.5-3.4 3.3-3.4ZM50 128.6l7.6 0c1.8 0 3.3 1.5 3.3 3.4l0 5.4c0 1.8-1.5 3.3-3.3 3.3l-7.6 0c-1.8 0-3.3-1.5-3.3-3.3l0-5.4c0-1.9 1.5-3.4 3.3-3.4ZM68.1 128.8l7.9 0c1.7 0 3.1 1.4 3.1 3.2l0 5.5c0 1.8-1.4 3.2-3.1 3.2l-7.9 0c-1.8 0-3.2-1.4-3.2-3.2l0-5.5c0-1.8 1.4-3.2 3.2-3.2ZM86.6 128.8l7.5 0c1.8 0 3.3 1.5 3.3 3.3l0 5.5c0 1.8-1.5 3.3-3.3 3.3l-7.5 0c-1.9 0-3.3-1.5-3.3-3.3l0-5.5c0-1.8 1.4-3.3 3.3-3.3ZM49.9 145l7.9 0c1.7 0 3.1 1.5 3.1 3.2l0 5.6c0 1.7-1.4 3.2-3.1 3.2l-7.9 0c-1.8 0-3.2-1.5-3.2-3.2l0-5.6c0-1.7 1.4-3.2 3.2-3.2ZM68.1 145l7.9 0c1.7 0 3.1 1.4 3.1 3.2l0 5.6c0 1.7-1.4 3.2-3.1 3.2l-7.9 0c-1.8 0-3.2-1.5-3.2-3.2l0-5.6c0-1.8 1.4-3.2 3.2-3.2ZM86.3 145l8 0c1.7 0 3.1 1.4 3.1 3.1l0 5.8c0 1.7-1.4 3.1-3.1 3.1l-8 0c-1.7 0-3-1.4-3-3.1l0-5.8c0-1.7 1.3-3.1 3-3.1Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "9f392b9146";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 8) throw new Error("pay: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
// what's behind the reader's body (the room, the tick and its shadow, the screen and keys, the card), the body (its bevel; its ink, which
// carries the card's stripe)
const BEHIND = EL.slice(0, 6).join(""), BODY = EL[6] + EL[7];
// the paper: the slot across the reader's top (flat at y 28), as wide as the keypad (its columns run 47 to 97, so none shows a sliver past
// the paper's edges); it's hidden below y 33, in the top's ink border (the screen starts at 39). Its right edge passes behind the card's top
// corner (the card is in front of the reader), so what hangs in front is cut out where the card is.
const X0 = 46, W = 51.5, TOP = 28, HIDDEN = 33;
const CARD_D = EL[4].match(/ d="([^"]+)"/)[1];
const NOT_CARD = `<clipPath id="nc"><path d="M-10 -10H210V210H-10Z${CARD_D}" clip-rule="evenodd"/></clipPath>`;
// the screen's right edge, by its pixels, where the paper's shadow falls beside it (beside the keys it falls on the reader's ink)
const SCREEN_EDGE = "M97.3 42L98.3 44L99.3 48L99.5 48L99.5 87L97.4 87Z";
const RISE = 14, OVER = 3.4; // it stands this high before it curls; the curl takes this much paper before the end comes down
const FEED = 70, T_FEED = 0.2; // units a second, as a terminal's printer runs
const FLOOR = 169.5; // the reader's foot, where the paper meets the counter
const rect = (x, y, w, h, t, rx = 0) => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(Math.max(0, h))}"${rx ? ` rx="${rx}"` : ""} ${fill(t)}/>`;
// the print: lines down the receipt, as far from its free end as they're printed (a blank margin, a centered header, then lines of varying
// length), to be seen only on the face that's still turned to us
const LINES = (() => {
  const out = [];
  for (let i = 0; i < 70; i++) {
    const r = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const head = i < 3, w = head ? [22, 30, 16][i] : 12 + r * 24;
    out.push({ p: 3.5 + i * 2.6, x: head ? X0 + (W - w) / 2 : X0 + 3, w });
  }
  return out;
})();
/** The face that stands up behind the top, its top at y `top`, its print (paper `start` units from the free end at that top). */
function standing(top, start) {
  const lines = LINES.filter((l) => { const y = top + l.p - start; return y > top + 0.6 && y < HIDDEN; })
    .map((l) => rect(l.x, top + l.p - start, l.w, 0.9, "steel")).join("");
  return rect(X0, top, W, HIDDEN - top, "paper", 0.8) + lines;
}

// ---- the paper's front view, from how much has fed (ℓ, beyond the top edge): standing straight up while ℓ ≤ RISE; then curled, its top at
// the crest and its free end coming down in front (its blank back to us), the print going over the crest out of sight
function receipt(l, settle = 0) {
  // (drawn from the first frame, still hidden behind the top, so it comes up out of the slot rather than appearing)
  if (l <= RISE) return { behind: standing(TOP - Math.max(0, l), 0), front: "" };
  const crest = TOP - RISE, end = Math.min(FLOOR, crest + Math.max(0, l - RISE - OVER) + settle);
  const behind = standing(crest, l - RISE);
  // (the curl over the top: a little rounder at the crest, the paper's turn there a shade darker as it rolls away from the light)
  // (where it lies against the screen and the keys, which are as pale as it is, its edges show: its left edge a thin line in its own shade,
  // and its shadow, cast to the right by the room's light, on whatever cream is beside it)
  let front = "";
  if (end > crest) {
    const tall = end - crest;
    front = rect(X0, crest, W, tall, "paper", 1.2) + rect(X0 + 0.6, crest + 0.4, W - 1.2, Math.min(1.1, tall - 0.4), "paper-mid") + rect(X0, crest + 1.5, 0.6, tall - 1.5, "paper-mid");
    if (end > 42) front = `<clipPath id="se"><path d="${SCREEN_EDGE}"/></clipPath><g clip-path="url(#se)">${rect(X0 + W, 42, 1.8, end - 42 + 0.5, "paper-deep")}</g>` + front;
  }
  // on the counter: what feeds after the end reaches the foot lies forward on the floor (in the reader's shadow, so a shade deeper), and once
  // ten units lie there, the rest buckles into a loop standing up off the counter against the reader's foot
  // (in the drawing from the start at no height, each grows from nothing as the paper arrives)
  if (front) {
    const over = Math.max(0, l - (RISE + OVER + (FLOOR - crest))), lying = Math.min(over, 10) * 0.32, loop = Math.max(0, over - 10) * 0.42, a = Math.min(1, over / 2), b = Math.min(1, loop);
    front += rect(X0 - 0.4, FLOOR - 0.5 * a, W + 0.8, (lying + 0.5) * a, "paper-deep", 1);
    front += rect(X0 - 0.6, FLOOR - loop, W + 1.2, loop + 0.6 * b, "paper", 2) + rect(X0 - 0.6, FLOOR - 1.2 * b, W + 1.2, 1.4 * b, "paper-mid") + rect(X0 + 0.2, FLOOR - loop + 0.5 * b, W - 0.4, 0.9 * b, "paper-mid");
  }
  return { behind, front };
}
const frameOf = (r) => `${OPEN}${BEHIND}${r.behind}${BODY}${r.front ? `${NOT_CARD}<g clip-path="url(#nc)">${r.front}</g>` : ""}</svg>`;

// ---- happy. A short receipt: fed until its free end rests just above the rim (13 down from the crest), then the rollers stop, and the
// springy paper settles: its end nods out and back.
const L_HAPPY = RISE + OVER + 13;
const T_HAPPY = T_FEED + L_HAPPY / FEED;
const HAPPY_DUR = T_HAPPY + 0.75;
function happy(t) {
  if (t <= 0) return STILL;
  const l = FEED * Math.max(0, Math.min(t, T_HAPPY) - T_FEED);
  const nod = track([[T_HAPPY, 0], [T_HAPPY + 0.1, -0.9, "out"], [T_HAPPY + 0.24, 0.35, "io"], [T_HAPPY + 0.38, 0, "io"]], t);
  return frameOf(receipt(l, nod));
}

// ---- sad. It keeps feeding: down the front to the foot, ten units along the counter, and a loop's worth more, then the rollers stop.
const L_SAD = RISE + OVER + (FLOOR - (TOP - RISE)) + 10 + 22;
const T_SAD = T_FEED + L_SAD / FEED;
const SAD_DUR = T_SAD + 0.7;
function sad(t) {
  if (t <= 0) return STILL;
  return frameOf(receipt(FEED * Math.max(0, Math.min(t, T_SAD) - T_FEED)));
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
