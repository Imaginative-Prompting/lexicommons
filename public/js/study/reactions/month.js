// Month's two stories, the air's, a wall calendar's natural mover. Happy: a breath lifts the old page from its foot; the paper bends up
// toward us, rises over the rings and drops behind, and the fresh month is there (its own color of header, its first week starting later).
// Sad: the same lift, but as the page goes up the right ring catches and tears through it; the page falls back hanging from the left ring
// alone, swinging crooked to rest across the new month, a ragged notch where the right ring was, the torn-out scrap left on that ring.
// Every frame is a pure function of t, in seconds. The page in its own terms: it hangs from its ring holes on the line y 53 (the holes at
// x 53 and 126); a point s below that line, as the page bends, is where the page's own direction (straight down, turning toward us and up)
// carries it, seen from in front; where it has turned past edge-on we see its blank back, and where it has gone back past the calendar's
// face it is behind the fresh page.
import { n2, paint, parsePath, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M171 44.6l33.4 32.8 0 127-153.9 0c-3-3.8-6.9-7-10.4-10.4-3.8-3.6-7.4-7.6-11.5-10.8 .7-.6 1.3-1.3 2-2 5.1 1.6 10.6 1.1 15.9 1.1 6.1 0 12.3 0 18.5 0 23.2 0 46.4 0 69.7 0 7.6 0 15.3 0 23 0 3.6 0 8 .4 10.9-2.3 2.7-2.3 2.9-6.6 2.9-9.9 0-7.3 0-14.5 0-21.8 0-23 0-46.1 0-69.2 0-5.9 0-11.8 0-17.7 0-3 .4-6.3-.2-9.2-.4-2.1-1.3-3.9-2.2-5.7 .7-.6 1.3-1.3 1.9-1.9Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M23.5 65.7c30.2 0 60.3 0 90.5 0 6.8 0 13.6 0 20.5 0 2.2 0 7.3-.5 9.1 .3 1.5 .6 2.8 2.3 3.9 3.5 0 2.7 .3 5.5 0 8.2l-1 11.3c-.1 1.2-.1 2.7 0 4l1 10.2-1 9.5c-.2 2.4-.3 6.3 .1 8.7 .3 1.9 1.1 3.4 .9 5.5l-1 10c-.1 1.5-.1 3.4 0 5l1 10c.3 2.6-.5 4.1-.9 6.5-.3 2.2-.3 5-.1 7.2l1 11.1c.3 2.7 0 5.5 0 8.2-2.2 0-3.5 .2-5.7 .9 .4 0 .7 0 1.1 0 .2 0-.3 0-.5 0-.2 0-.5 0-.7 0-1 0-1.9 0-2.8 0-2.7 0-5.3 0-8 0-8.2 0-16.5 0-24.7 0-17.4 0-34.7 0-52 0-5.2 0-19 .8-23.1-1-9.9-4.3-8.4-15-8.4-23.8 0-22 0-44 0-66 0-6.1 0-12.2 0-18.3 0-.9-.1-7.1 .2-7.4 .2-.2 .5-.1 .6-.3l0-3.3ZM36.9 84.4l14 0c.2 0 .4 .2 .4 .5l0 11.7c0 .2-.2 .4-.4 .4l-14 0c-.3 0-.5-.2-.5-.4l0-11.7c0-.3 .2-.5 .5-.5ZM64.4 84.4l13.9 0c.3 0 .5 .2 .5 .5l0 11.7c0 .2-.2 .4-.5 .4l-13.9 0c-.3 0-.5-.2-.5-.4l0-11.7c0-.3 .2-.5 .5-.5ZM92.9 84.4l11.9 0c.8 0 1.5 .7 1.5 1.6l0 9.5c0 .8-.7 1.5-1.5 1.5l-11.9 0c-.8 0-1.5-.7-1.5-1.5l0-9.5c0-.9 .7-1.6 1.5-1.6ZM119.6 84.4l13.6 0c.3 0 .6 .3 .6 .6l0 11.5c0 .3-.3 .5-.6 .5l-13.6 0c-.3 0-.6-.2-.6-.5l0-11.5c0-.3 .3-.6 .6-.6ZM36.9 108.9l13.8 0c.3 0 .6 .3 .6 .7l0 11.3c0 .3-.3 .6-.6 .6l-13.8 0c-.4 0-.6-.3-.6-.6l0-11.3c0-.4 .2-.7 .6-.7ZM64.4 108.9l13.9 0c.3 0 .5 .3 .5 .5l0 11.7c0 .2-.2 .4-.5 .4l-13.9 0c-.3 0-.5-.2-.5-.4l0-11.7c0-.2 .2-.5 .5-.5ZM91.8 108.9l14.1 0c.2 0 .4 .2 .4 .5l0 11.7c0 .2-.2 .4-.4 .4l-14.1 0c-.2 0-.4-.2-.4-.4l0-11.7c0-.3 .2-.5 .4-.5ZM120.4 108.9l12 0c.9 0 1.5 .7 1.5 1.6l0 9.5c0 .8-.6 1.5-1.5 1.5l-12 0c-.8 0-1.5-.7-1.5-1.5l0-9.5c0-.9 .7-1.6 1.5-1.6ZM37.6 133.3l12.4 0c.7 0 1.3 .6 1.3 1.3l0 9.9c0 .8-.6 1.4-1.3 1.4l-12.4 0c-.7 0-1.3-.6-1.3-1.4l0-9.9c0-.7 .6-1.3 1.3-1.3ZM64.3 133.3l14.1 0c.2 0 .4 .1 .4 .3l0 11.7c0 .2-.2 .4-.4 .4l-14.1 0c-.2 0-.4-.2-.4-.4l0-11.7c0-.2 .2-.3 .4-.3ZM92.7 133.3l12.3 0c.7 0 1.3 .6 1.3 1.3l0 10c0 .7-.6 1.3-1.3 1.3l-12.3 0c-.7 0-1.3-.6-1.3-1.3l0-10c0-.7 .6-1.3 1.3-1.3ZM120.5 133.3l11.8 0c.9 0 1.6 .7 1.6 1.6l0 9.3c0 .9-.7 1.7-1.6 1.7l-11.8 0c-.9 0-1.6-.8-1.6-1.7l0-9.3c0-.9 .7-1.6 1.6-1.6ZM36.8 157.8l14 0c.3 0 .5 .2 .5 .5l0 11.5c0 .3-.2 .6-.5 .6l-14 0c-.3 0-.5-.3-.5-.6l0-11.5c0-.3 .2-.5 .5-.5ZM64.3 157.8l14.1 0c.2 0 .4 .2 .4 .4l0 11.8c0 .2-.2 .4-.4 .4l-14.1 0c-.2 0-.4-.2-.4-.4l0-11.8c0-.2 .2-.4 .4-.4ZM91.8 157.8l14.1 0c.2 0 .4 .2 .4 .4l0 11.7c0 .3-.2 .5-.4 .5l-14.1 0c-.2 0-.4-.2-.4-.5l0-11.7c0-.2 .2-.4 .4-.4ZM119.2 157.8l14.4 0c.2 0 .3 .1 .3 .3l0 11.9c0 .2-.1 .4-.3 .4l-14.4 0c-.2 0-.3-.2-.3-.4l0-11.9c0-.2 .1-.3 .3-.3Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M69 35.6l5.5 0 0 3.3 48.1 .4c.4-.7 .4-1.3 .6-2l2.5 2.4 2.5-2.4c.3 .6 .3 1.3 .7 1.9l12.7-.3 0-3.3 5.4 0 0 3.3 10.2 .4c.4 .1 .7 .4 1.1 .6 .5 0 1.5 0 2 0-5.3 5.3-9.3 9.1-11.6 16.5-.7 2.1-1 4.2-1.2 6.4 0 1.7 .4 4-.2 5.6-.4 1.1-1.4 1.8-2.2 2.6-.2-.6-.3-1.2-.5-1.8l-121.9 0c0-4.9-.6-12.5 .3-17.1 1.4-7.2 7.6-12.3 14.8-12.9 4-.4 8.3-.2 12.3 0 .4-.6 .4-1.1 .5-1.9l2.6 2.4 2.6-2.4c.2 .6 .2 1.2 .5 1.8l12.7-.2 0-3.3ZM125.7 48.2c-1.8 2.4-2.4 4-2 7 1.5 .2 2.6 .2 4.1 0 .5-3.2 0-4.5-2.1-7ZM53.3 48.3c-2 2.3-2.4 3.9-2 6.9 1.5 .1 2.5 .2 4.1 0 .3-3.2 .1-4.4-2.1-6.9Z\" fill=\"var(--art-clay,#E8743B)\" fill-rule=\"evenodd\"/>\n<path d=\"M144.9 65.7l29.3 0 0 3.3c.1 .2 .4 .1 .6 .3 .3 .3 .2 6.3 .2 7.2 0 6 0 12.1 0 18.2 0 20.3 0 40.7 0 61 0 3.9 0 7.8 0 11.8 0 2.4 .2 5-.3 7.4-.5 2.2-1.6 4.2-3 6-1.8 2.1-4.3 3.7-7 4.5-2.6 .7-5.5 .4-8.2 .4-4.2 0-8.3 0-12.5 0l.3-12.8c0-.2 .3-.2 .4-.4l-1-3.2c5.4 1.8 12.2 1 17.9 1l0-12.6c-4.5 0-9.1-.3-13.6 0-.7 0-2 .6-2.6 .4-.7-.2-.5-.3-1.2-.7 .2-.7 .4-1.2 .8-1.8-.4-.2-.7-.3-.9-.6-.5-.8 .1-6.8 .4-7.9-.1 0 .1 .3 0 .3-.6-.2-.3-2.1-.3-2.3 5.6 1.2 11.5 .7 17.2 .7l0-12.6c-5.5 0-12-.8-17.3 .7 0-1.1 0-1.6 .5-2.6-.1-.2-.5-.7-.5-1-.2-.5 0-6 .1-6.2 .2-.1 .6 0 .8-.2-.4-.6-.7-1.1-.9-1.8 .2-.2 .3-.7 .6-.7l16.7 0 0-12.6-16.9 .1c-.2 0-.3-.4-.4-.6 .2-.6 .5-1.1 .9-1.7-.5-.4-.6-.1-.9-.5-.1-.2-.1-6.3 0-6.4 .2-.3 .5-.4 .8-.6-.3-.5-.6-1-.8-1.5 .2-.3 .2-.8 .5-.8l16.5 .1 0-12.6c-5.6 0-11.8-.8-17.2 1 .2-1 .3-1.7 .7-2.5-.1-.3-.3-.6-.3-.9l-.3-12.6c.2-.2 .6-.2 .8-.4 .2-.2 .1-2.9 .1-3.3Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M175 69.2l-31 0c0-9 .7-15.7 6.6-23 1.4-1.7 5.5-6.3 7.4-6.9 .9-.3 1.9-.1 2.9 0 4.6 .6 9.3 3.3 11.8 7.4 3.5 5.9 2.3 15.6 2.3 22.5Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M75.3 39.1l-7.1 0c0-3.1 .7-7.2-1-9.9-2.3-3.8-7.9-3.4-9.7 .6-.9 2-1.2 15.8-.6 18 .7 2.6 2.7 3.5 1.9 6.6-1.1 5-8.1 6-10.5 1.4-1.1-2-.8-4.1 .3-6 .2-.4 .8-.9 .8-1.3l.6-18.8c.1-1.2 .9-2.7 1.4-3.7 3.5-6.4 12-8.5 18-4.5 6.5 4.3 5.9 10.7 5.9 17.6ZM147.8 39.1l-7.1 0c0-3.1 .7-7.2-1-9.9-2.3-3.8-7.9-3.3-9.8 .6-.8 2-1 15.5-.5 17.9 .5 2.6 2.7 3.6 1.9 6.8-1.2 4.9-8.2 5.9-10.5 1.3-1.1-2.1-.8-4.2 .4-6.1 .1-.3 .7-.9 .7-1.3l.6-18.8c0-1.2 .9-2.7 1.4-3.7 3.6-6.3 12-8.4 18.1-4.4 6.4 4.3 5.8 10.7 5.8 17.6ZM37.2 81l13.4 0c2.3 0 4.2 1.8 4.2 4.2l0 11.1c0 2.3-1.9 4.2-4.2 4.2l-13.4 0c-2.4 0-4.3-1.9-4.3-4.2l0-11.1c0-2.4 1.9-4.2 4.3-4.2ZM64.6 81l13.5 0c2.3 0 4.2 1.8 4.2 4.1l0 11.2c0 2.3-1.9 4.2-4.2 4.2l-13.5 0c-2.3 0-4.2-1.9-4.2-4.2l0-11.2c0-2.3 1.9-4.1 4.2-4.1ZM92.4 81l12.9 0c2.5 0 4.5 2 4.5 4.5l0 10.5c0 2.5-2 4.5-4.5 4.5l-12.9 0c-2.5 0-4.5-2-4.5-4.5l0-10.5c0-2.5 2-4.5 4.5-4.5ZM119.9 81l13.1 0c2.3 0 4.3 1.9 4.3 4.3l0 10.9c0 2.4-2 4.3-4.3 4.3l-13.1 0c-2.4 0-4.3-1.9-4.3-4.3l0-10.9c0-2.4 1.9-4.3 4.3-4.3ZM147.2 81l13.2 0c2.3 0 4.2 1.8 4.2 4.1l0 11.2c0 2.3-1.9 4.2-4.2 4.2l-13.2 0c-2.3 0-4.2-1.9-4.2-4.2l0-11.2c0-2.3 1.9-4.1 4.2-4.1ZM37 105.5l13.6 0c2.3 0 4.2 1.9 4.2 4.2l0 11c0 2.4-1.9 4.3-4.2 4.3l-13.6 0c-2.3 0-4.2-1.9-4.2-4.3l0-11c0-2.3 1.9-4.2 4.2-4.2ZM64.5 105.5l13.7 0c2.2 0 4.1 1.8 4.1 4.1l0 11.3c0 2.3-1.9 4.1-4.1 4.1l-13.7 0c-2.2 0-4.1-1.8-4.1-4.1l0-11.3c0-2.3 1.9-4.1 4.1-4.1ZM92 105.5l13.6 0c2.3 0 4.2 1.8 4.2 4.1l0 11.3c0 2.3-1.9 4.1-4.2 4.1l-13.6 0c-2.2 0-4.1-1.8-4.1-4.1l0-11.3c0-2.3 1.9-4.1 4.1-4.1ZM119.9 105.5l13 0c2.5 0 4.5 2 4.5 4.5l0 10.5c0 2.5-2 4.5-4.5 4.5l-13 0c-2.5 0-4.5-2-4.5-4.5l0-10.5c0-2.5 2-4.5 4.5-4.5ZM147.2 105.5l13.6 0c2.3 0 4.1 1.8 4.1 4.1l0 11.3c0 2.3-1.8 4.1-4.1 4.1l-13.6 0c-2.3 0-4.2-1.8-4.2-4.1l0-11.3c0-2.3 1.9-4.1 4.2-4.1ZM37.2 129.8l13.2 0c2.4 0 4.4 2 4.4 4.4l0 10.8c0 2.4-2 4.3-4.4 4.3l-13.2 0c-2.5 0-4.4-1.9-4.4-4.3l0-10.8c0-2.4 1.9-4.4 4.4-4.4ZM64.3 129.8l14.1 0c2.1 0 3.9 1.8 3.9 3.9l0 11.6c0 2.1-1.8 3.9-3.9 3.9l-14.1 0c-2.1 0-3.9-1.8-3.9-3.9l0-11.6c0-2.1 1.8-3.9 3.9-3.9ZM92.2 129.8l13.3 0c2.3 0 4.3 1.9 4.3 4.3l0 10.9c0 2.4-2 4.3-4.3 4.3l-13.3 0c-2.4 0-4.3-1.9-4.3-4.3l0-10.9c0-2.4 1.9-4.3 4.3-4.3ZM119.9 129.8l13.1 0c2.4 0 4.4 2 4.4 4.5l0 10.6c0 2.4-2 4.4-4.4 4.4l-13.1 0c-2.5 0-4.5-2-4.5-4.4l0-10.6c0-2.5 2-4.5 4.5-4.5ZM147.2 129.8l13.6 0c2.2 0 4.1 1.9 4.1 4.1l0 11.3c0 2.3-1.9 4.1-4.1 4.1l-13.6 0c-2.3 0-4.2-1.8-4.2-4.1l0-11.3c0-2.2 1.9-4.1 4.2-4.1ZM37 154.3l13.6 0c2.3 0 4.2 1.9 4.2 4.2l0 11.1c0 2.4-1.9 4.2-4.2 4.2l-13.6 0c-2.3 0-4.2-1.8-4.2-4.2l0-11.1c0-2.3 1.9-4.2 4.2-4.2ZM64.5 154.3l13.7 0c2.3 0 4.1 1.8 4.1 4.1l0 11.4c0 2.2-1.8 4-4.1 4l-13.7 0c-2.3 0-4.1-1.8-4.1-4l0-11.4c0-2.3 1.8-4.1 4.1-4.1ZM92 154.3l13.7 0c2.2 0 4.1 1.8 4.1 4.1l0 11.4c0 2.2-1.9 4-4.1 4l-13.7 0c-2.3 0-4.1-1.8-4.1-4l0-11.4c0-2.3 1.8-4.1 4.1-4.1ZM119.5 154.3l13.8 0c2.3 0 4.1 1.8 4.1 4.1l0 11.3c0 2.3-1.8 4.1-4.1 4.1l-13.8 0c-2.3 0-4.1-1.8-4.1-4.1l0-11.3c0-2.3 1.8-4.1 4.1-4.1ZM147.3 154.3l13.5 0c2.4 0 4.3 1.9 4.3 4.3l0 11c0 2.3-1.9 4.2-4.3 4.2l-13.5 0c-2.3 0-4.3-1.9-4.3-4.2l0-11c0-2.4 2-4.3 4.3-4.3Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "2940551927";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 7) throw new Error("month: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
// (tenths, for the many-pointed outlines)
const t1 = (v) => (Math.round(v * 10) / 10).toString();
const pts1 = (P) => P.map((p) => `${t1(p[0])},${t1(p[1])}`).join(" ");
const dPoly = (P) => `M${P.map((p) => `${t1(p[0])} ${t1(p[1])}`).join(" ")}Z`;
const DEG = Math.PI / 180;
const INK_SUBS = /d="([^"]+)"/.exec(EL[6])[1].split(/(?=M)/);
const RINGS = `<path d="${INK_SUBS[0]}${INK_SUBS[1]}" ${fill("ink")}/>`;
const SQUARES = INK_SUBS.slice(2);
// points along a path's first outline: its curves at the given fractions, its straight runs at their ends
const pointsOf = (d, at) => parsePath(d)[0].segs.flatMap((g) => {
  const straight = [1, 2].every((c) => Math.abs((g[c][0] - g[0][0]) * (g[3][1] - g[0][1]) - (g[c][1] - g[0][1]) * (g[3][0] - g[0][0])) < 1e-6);
  return (straight ? [0] : at).map((t) => { const u = 1 - t; return [0, 1].map((j) => u * u * u * g[0][j] + 3 * u * u * t * g[1][j] + 3 * u * t * t * g[2][j] + t * t * t * g[3][j]); });
});
// each day square's own outline (its corners finely) and its box; its corners are rounded 4.2
const SQ = SQUARES.map((d) => pointsOf(d, [0, 1 / 3, 2 / 3]));
const BOX = SQ.map((P) => [Math.min(...P.map((p) => p[0])), Math.min(...P.map((p) => p[1])), Math.max(...P.map((p) => p[0])), Math.max(...P.map((p) => p[1]))]);
const R = 4.2;
// the old page as the still draws it (its paper, the paper's shaded right side, the header and its shaded side, the day squares); the
// still's paper also carries small patches under each square, never seen: left out. The squares wholly above a line (the page flat to there)
const PAPER = EL[2].replace(/(d="[^M"]*M[^M"]*)M[^"]*"/, '$1"');
// (the header's two small inner shapes are its own color over itself: never seen, left out too)
const HEADER = EL[3].replace(/(d="[^M"]*M[^M"]*)M[^"]*"/, '$1"');
const PAGE_BODY = PAPER + EL[4] + HEADER + EL[5];
const squaresAbove = (y) => { const d = SQUARES.filter((q, i) => BOX[i][3] <= y).join(""); return d ? `<path d="${d}" ${fill("ink")}/>` : ""; };
const BACKDROP = EL[0] + EL[1];
const AXIS = 53, TOP = 35.6, FOOT = 186.4, L = FOOT - AXIS;

// the still's own outlines of the page's parts (its paper, the paper's shaded side, the header, the header's shaded side), as points
// (the points within a twentieth of a unit of the line through those either side left out: the still draws its edges in many short steps)
function thin(P, tol = 0.05) {
  const far = (i, j) => { let best = -1, at = -1; for (let k = i + 1; k < j; k++) { const [ax, ay] = P[i], [bx, by] = P[j % P.length], [px, py] = P[k], l = Math.hypot(bx - ax, by - ay) || 1e-9, d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / l; if (d > best) { best = d; at = k; } } return [best, at]; };
  const keep = new Set([0]);
  const split = (i, j) => { const [d, k] = far(i, j); if (d > tol) { keep.add(k); split(i, k); split(k, j); } };
  const mid = Math.floor(P.length / 2);
  keep.add(mid); split(0, mid); split(mid, P.length);
  return P.filter((_, i) => keep.has(i));
}
// (all wound the same way round, so drawn together in one shape none of them cancels another)
const area = (P) => P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
const clockwise = (P) => (area(P) < 0 ? P.slice().reverse() : P);
const outlineOf = (svg) => clockwise(thin(pointsOf(/d="(M[^M"]*)/.exec(svg)[1], [0, 0.5])));
const PARTS = [[outlineOf(EL[2]), "paper"], [outlineOf(EL[4]), "paper-deep"], [outlineOf(EL[3]), "clay"], [outlineOf(EL[5]), "clay-deep"]];
// the page's back: the paper and its shaded side as one (their hull: the shaded side's own outline goes in round each of its day squares,
// which cover those bites), the header and its shaded side
const hull = (P) => {
  const Q = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (pts) => pts.reduce((h, p) => { while (h.length > 1 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); return h; }, []);
  const lo = half(Q), hi = half(Q.slice().reverse());
  return clockwise([...lo.slice(0, -1), ...hi.slice(0, -1)]);
};
const BACK = [hull([...PARTS[0][0], ...PARTS[1][0]]), PARTS[2][0], PARTS[3][0]];
// ---- the tear (sad): from above the page's top edge down round the right hole, ragged. It is cut from the header's own outline, so the
// page and the scrap it leaves on the ring are each the page's own paper wherever the page is; where a line (open) crosses an outline
const NOTCH = [[115, 30], [117.6, 35.5], [113.8, 39.8], [117.2, 44.2], [114.2, 48.6], [118.4, 53.6], [121.2, 57.8], [125.4, 59.6], [129.6, 58.2], [133.8, 54.2], [137.2, 49.4], [134.2, 45], [138, 40.6], [134.8, 36], [137.6, 30]];
function crossings(N, H) {
  const X = [];
  for (let j = 0; j < N.length - 1; j++) for (let i = 0; i < H.length; i++) {
    const [p, q, r, v] = [N[j], N[j + 1], H[i], H[(i + 1) % H.length]], d = (q[0] - p[0]) * (v[1] - r[1]) - (q[1] - p[1]) * (v[0] - r[0]);
    if (Math.abs(d) < 1e-12) continue;
    const t = ((r[0] - p[0]) * (v[1] - r[1]) - (r[1] - p[1]) * (v[0] - r[0])) / d, u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) X.push({ at: j + t, i, p: [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t] });
  }
  return X.sort((a, b) => a.at - b.at);
}
// the outline cut in two along the line: the larger part (the page's) and the smaller (the scrap)
function cut(H, N) {
  const X = crossings(N, H), A = X[0], Z = X[X.length - 1], inner = N.slice(Math.floor(A.at) + 1, Math.floor(Z.at) + 1);
  const walk = (from, to) => { const out = []; for (let i = (from + 1) % H.length; ; i = (i + 1) % H.length) { out.push(H[i]); if (i === to) break; } return out; };
  const one = [A.p, ...inner, Z.p, ...walk(Z.i, A.i)], two = [Z.p, ...inner.slice().reverse(), A.p, ...walk(A.i, Z.i)];
  return Math.abs(area(one)) > Math.abs(area(two)) ? [clockwise(one), clockwise(two)] : [clockwise(two), clockwise(one)];
}
const [TORN_HEADER, SCRAP] = cut(PARTS[2][0], NOTCH);
const TORN = { parts: [PARTS[0], PARTS[1], [TORN_HEADER, "clay"], PARTS[3]], back: [BACK[0], TORN_HEADER, BACK[2]] }, WHOLE = { parts: PARTS, back: BACK };
// ---- the fresh month beneath: the same page, its header in its own color, its first week starting two days later
const NEW_DAYS = BOX.filter((_, i) => i >= 2);
const roundBox = ([x0, y0, x1, y1]) => `M${n2(x0 + R)} ${n2(y0)}H${n2(x1 - R)}a${R} ${R} 0 0 1 ${R} ${R}V${n2(y1 - R)}a${R} ${R} 0 0 1 -${R} ${R}H${n2(x0 + R)}a${R} ${R} 0 0 1 -${R} -${R}V${n2(y0 + R)}a${R} ${R} 0 0 1 ${R} -${R}Z`;
// (its paper the old page's own outline, a hair smaller, so it lies wholly under the old page until that lifts)
const TUCK = 0.995, TUCK_AT = [99, 120];
const tuck = (P) => P.map(([x, y]) => [TUCK_AT[0] + (x - TUCK_AT[0]) * TUCK, TUCK_AT[1] + (y - TUCK_AT[1]) * TUCK]);
const NEW_PAGE = `<polygon points="${pts1(tuck(PARTS[0][0]))}" ${fill("paper")}/><polygon points="${pts1(tuck(PARTS[1][0]))}" ${fill("paper-deep")}/>`
  + HEADER.replace(/fill="[^"]+"/, fill("sky")) + EL[5].replace(/fill="[^"]+"/, fill("sky-deep")) + `<path d="${NEW_DAYS.map(roundBox).join("")}" ${fill("ink")}/>`;

// ---- the old page bending: its direction at s below the hole line is phi(s) (0 hanging, 90° toward us, 180° straight up, on round
// behind). Where each line of the page is seen (y) and how far it stands out from the calendar's face (z), stepping out from the hole line
// both ways; the part above the holes turns the other way about them. As the page turns its holes ride round the ring's wire (a loop from
// the holes up to the ring's top at y 28.5, out in front and back behind), so it goes over the fresh page, not through it.
const S0 = TOP - AXIS, RING = 12.25;
const GRID = [...Array.from({ length: 18 }, (_, i) => S0 - (S0 * i) / 18), ...Array.from({ length: 134 }, (_, i) => (L * i) / 133)];
const holes = (turn) => [AXIS - RING + RING * Math.cos(turn), RING * Math.sin(turn)];
function bend(phiAt) {
  const n = GRID.length, Y = new Array(n), Z = new Array(n), i0 = GRID.indexOf(0);
  [Y[i0], Z[i0]] = holes(phiAt(0));
  const step = (i, j) => { const ds = GRID[j] - GRID[i], p = phiAt((GRID[i] + GRID[j]) / 2); Y[j] = Y[i] + Math.cos(p) * ds; Z[j] = Z[i] + Math.sin(p) * ds; };
  for (let j = i0 + 1; j < n; j++) step(j - 1, j);
  for (let j = i0 - 1; j >= 0; j--) step(j + 1, j);
  // (y at any s: between the steps, and carried on straight past the page's ends)
  const at = (s) => { let i = 1; while (i < n - 1 && GRID[i] < s) i++; return Y[i - 1] + ((Y[i] - Y[i - 1]) * (s - GRID[i - 1])) / (GRID[i] - GRID[i - 1]); };
  return { Y, Z, at };
}
// how far out the ring's wire stands at a row: its loop's front half, and the wire's own thickness (its end through the holes, too)
const wire = (y) => { const d = y - (AXIS - RING); return Math.sqrt(Math.max(0, RING * RING - d * d)) + 1.5; };
// an outline cut to the rows y0 to y1
function rows(P, y0, y1) {
  let out = P;
  for (const [edge, keep] of [[y0, 1], [y1, -1]]) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[i], b = src[(i + 1) % src.length], ina = (a[1] - edge) * keep >= 0, inb = (b[1] - edge) * keep >= 0;
      if (ina) out.push(a);
      if (ina !== inb) { const k = (edge - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * k, edge]); }
    }
  }
  return out;
}
// an outline's points carried to where their rows are seen
const mapP = (B, Q) => Q.map(([x, y]) => [x, B.at(y - AXIS)]);
// the page's paper and header from s0 to s1, bent: their own outlines cut to those rows
const body = (B, s0, s1, page) => page.parts.map(([P, tone]) => { const Q = rows(P, AXIS + s0, AXIS + s1); return Q.length > 2 ? `<path d="${dPoly(mapP(B, Q))}" ${fill(tone)}/>` : ""; }).join("");
// its blank back there, one tone
const back = (B, s0, s1, page) => { const d = page.back.map((P) => rows(P, AXIS + s0, AXIS + s1)).filter((Q) => Q.length > 2).map((Q) => dPoly(mapP(B, Q))).join(""); return d ? `<path d="${d}" ${fill("paper-mid")}/>` : ""; };
// the day squares in the rows a to b, bent: a whole square keeps its rounded corners (each bent as the page is there), a part of one is its
// own outline cut; with `whole`, squares reaching up past a are drawn whole (the page above a is flat)
function squaresIn(B, a, b, whole) {
  let d = "";
  BOX.forEach(([x0, y0, x1, y1], i) => {
    if (y1 <= a || y0 >= b) return;
    const lo = whole ? -Infinity : a;
    if (y0 >= lo && y1 <= b) {
      const Y0 = B.at(y0 - AXIS), Y1 = B.at(y1 - AXIS), rt = B.at(y0 + R - AXIS) - Y0, rb = Y1 - B.at(y1 - R - AXIS), T = t1(rt), U = t1(rb);
      d += `M${t1(x0 + R)} ${t1(Y0)}H${t1(x1 - R)}a${R} ${T} 0 0 1 ${R} ${T}V${t1(Y1 - rb)}a${R} ${U} 0 0 1 -${R} ${U}H${t1(x0 + R)}a${R} ${U} 0 0 1 -${R} -${U}V${t1(Y0 + rt)}a${R} ${T} 0 0 1 ${R} -${T}Z`;
    } else { const Q = rows(SQ[i], lo, b); if (Q.length > 2) d += dPoly(mapP(B, Q)); }
  });
  return d ? `<path d="${d}" ${fill("ink")}/>` : "";
}
// the bent page drawn: cut where it turns edge-on, where it crosses the calendar's face and where it passes out in front of the rings'
// wire; each run facing us (paper, shaded side, header, squares) or not (blank back), behind the fresh page, in front of it under the
// rings, or out over them. The part above the holes is inside the rings' loop: behind once it has turned past edge-on.
function bentPage(phiAt, { sFrom = S0, whole = false, page = WHOLE } = {}) {
  // (a part lying in the calendar's face is in front until the page has gone over the top, behind after)
  const B = bend(phiAt), runs = [], eps = phiAt(0) > Math.PI ? 1e-6 : -1e-6;
  const D = B.Z.map((z) => z - eps), W = B.Z.map((z, i) => z - wire(B.Y[i]) - 1e-6);
  for (let i = 0; i < GRID.length - 1; i++) {
    const a = GRID[i], b = GRID[i + 1];
    if (b <= sFrom) continue;
    // (in front of the wire or not only matters in the rows the rings are drawn in: elsewhere a run goes on as it was)
    const inRings = (k) => Math.abs(B.Y[i] + (B.Y[i + 1] - B.Y[i]) * k - (AXIS - RING)) < RING + 5;
    const cuts = a < 0 ? [] : [[D, false], [W, true]].map(([F, rings]) => [F, F[i] / (F[i] - F[i + 1]), rings])
      .filter(([F, k, rings]) => F[i] < 0 !== F[i + 1] < 0 && (!rings || inRings(k))).map(([, k]) => a + (b - a) * k).sort((u, v) => u - v);
    let p = Math.max(a, sFrom);
    for (const q of [...cuts.filter((c) => c > p), b]) {
      const m = (p + q) / 2, k = (m - a) / (b - a), phi = phiAt(m), last = runs[runs.length - 1];
      const facing = Math.cos(phi) > 0, past = m < 0 ? phi > Math.PI / 2 : D[i] + (D[i + 1] - D[i]) * k < 0;
      const over = m >= 0 && !past && (inRings(k) ? W[i] + (W[i + 1] - W[i]) * k > 0 : last ? last.over : false);
      if (last && last.facing === facing && last.past === past && last.over === over) last.s1 = q;
      else runs.push({ s0: p, s1: q, facing, past, over });
      p = q;
    }
  }
  const out = { B, behind: "", front: "", over: "" };
  runs.forEach((r, k) => {
    // (a run under the rings reaches a little way under a run of the same face out over them, so no seam opens between the two)
    const joins = (n) => n && !n.past && n.over && n.facing === r.facing && !r.past && !r.over;
    const s0 = joins(runs[k - 1]) ? r.s0 - 0.4 : r.s0, s1 = joins(runs[k + 1]) ? r.s1 + 0.4 : r.s1;
    out[r.past ? "behind" : r.over ? "over" : "front"] += r.facing ? body(B, s0, s1, page) + squaresIn(B, AXIS + s0, AXIS + s1, whole && k === 0) : back(B, s0, s1, page);
  });
  return out;
}
// the page while only its foot has lifted: the still's own page down to the curl (cut there), the curl bent below it
function lifting(phiAt, sb) {
  const P = bentPage(phiAt, { sFrom: sb, whole: true });
  return `${OPEN}${BACKDROP}${NEW_PAGE}<clipPath id="fl"><rect x="0" y="0" width="200" height="${n2(AXIS + sb + 0.3)}"/></clipPath><g clip-path="url(#fl)">${PAGE_BODY}${squaresAbove(AXIS + sb)}</g>`
    + `${P.front}${RINGS}${P.over}</svg>`;
}
// what has gone round behind is hidden by the calendar's pad wherever the pad is (from the header's top edge down), seen only past it
const behind = (svg) => (svg ? `<clipPath id="bh"><path clip-rule="evenodd" d="M-400 -400H600V600H-400ZM22 39H176V188H22Z"/></clipPath><g clip-path="url(#bh)">${svg}</g>` : "");
// the lift both stories share: the curl climbing from the foot (the paper above it still hanging flat); then the page turning about its holes
const climb = (t) => track([[0.2, L], [0.85, 0, "io"]], t);
const shape = (sb, curl, turn) => (s) => turn + (s <= sb ? 0 : curl * ((s - sb) / (L - sb)) ** 1.5);

// ---- happy: lifted from the foot, over the rings, dropped behind
const HAPPY_DUR = 2.8;
function happy(t) {
  if (t <= 0) return STILL;
  // the whole page turns up and over, unbending, and drops behind: gravity takes it once it's past the top, the air holding it to a steady
  // fall, its free end trailing; it comes to hang behind and the end straightens
  const sb = climb(t), curl = track([[0.2, 0], [0.85, 170 * DEG, "io"], [1.65, 40 * DEG, "io"], [2.05, -20 * DEG, "io"], [2.55, -10 * DEG, "io"], [2.75, 0, "io"]], t);
  const turn = track([[0.75, 0], [1.65, 200 * DEG, "io"], [2.05, 245 * DEG, "in"], [2.55, 360 * DEG, "lin"]], t);
  const phiAt = shape(sb, curl, turn);
  if (turn === 0) return lifting(phiAt, sb);
  const P = bentPage(phiAt);
  return `${OPEN}${BACKDROP}${behind(P.behind)}${NEW_PAGE}${P.front}${RINGS}${P.over}</svg>`;
}

// ---- sad: the right ring tears through; the page falls back hanging from the left ring alone, crooked, and swings to rest
// (it hangs from the left hole, x 53, wherever the hole line is on the ring)
const SAD_DUR = 3, LEFT_HOLE = 53, T_TEAR = 1.1;
function sad(t) {
  if (t <= 0) return STILL;
  const sb = climb(t), curl = track([[0.2, 0], [0.85, 150 * DEG, "io"], [T_TEAR, 120 * DEG, "io"], [1.75, 0, "in"]], t);
  const turn = track([[0.75, 0], [T_TEAR, 75 * DEG, "io"], [1.75, 0, "in"]], t);
  const phiAt = shape(sb, curl, turn);
  if (t < T_TEAR && turn === 0) return lifting(phiAt, sb);
  if (t < T_TEAR) { const P = bentPage(phiAt); return `${OPEN}${BACKDROP}${behind(P.behind)}${NEW_PAGE}${P.front}${RINGS}${P.over}</svg>`; }
  // torn: the page falling back with the notch cut from it; hanging from one hole it turns until its weight is under it, overshooting and
  // swinging back to rest. The scrap stays on the right ring, falling back with the page to lie on the fresh one
  const P = bentPage(phiAt, { page: TORN });
  const rho = track([[T_TEAR + 0.05, 0], [1.85, 37, "in"], [2.13, 27, "io"], [2.39, 33, "io"], [2.67, 30.5, "io"], [2.87, 31.2, "io"]], t);
  const hang = (svg) => (svg ? `<g transform="rotate(${n2(rho)} ${LEFT_HOLE} ${n2(P.B.at(0))})">${svg}</g>` : "");
  return `${OPEN}${BACKDROP}${behind(hang(P.behind))}${NEW_PAGE}${hang(P.front)}<path d="${dPoly(mapP(P.B, SCRAP))}" ${fill("clay")}/>${RINGS}${hang(P.over)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
