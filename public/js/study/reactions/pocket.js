// The pocket's two stories. Happy: banknotes come down from above and slide into the pocket behind the note, two of them, fanning out. Sad: the bottom
// seam goes, stitch by stitch, the pocket gapes open at the bottom, and the note slips down through it and falls out. It's gone.
// Every frame is a pure function of t, in seconds. The pocket, its stitches and its shadows are the still's own paths; the note is drawn again whole, behind the
// pocket's front, so it can move in and out (the still only has the part you see).
import { n2, n4, paint, parsePath, partsOf, runsToD, runsToDc, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M140.1 49.6c.1 .8 .3 1.7 .4 2.5 3.2 1.6 6.5 3.1 9.7 4.7 2 1 4.1 2.3 6.3 3 .9 .2 2 .3 2.9 .4-.9 1-2 2.4-3.2 3.1-1.9 1-11.8 1.7-14.5 2-1-1-2.6-2.2-3.3-3.4-1-1.6-1.1-7.1-1.4-9.2l3.1-3.1ZM160.4 61l44 41.5 0 101.9-104 0-51.5-48.8c.7-.6 1.3-1.2 1.9-1.9 1.9 1.3 3.9 2.6 5.9 3.6l28.4 13.6c5.3 2.5 12.4 7.4 18.5 4.3l36.4-18.6c9.6-4.9 14.6-12.6 15.4-23.3l2.9-42.4 1.1-24.3c.1-1.3-.4-2.6-.7-3.8 .6-.6 1.1-1.2 1.7-1.8Z\" fill=\"var(--art-sun-deep,#DB9A22)\" fill-rule=\"evenodd\"/>\n<path d=\"M138.8 58.7c.5 .6 1.5 1.3 1.8 2 .2 .3 .1 .6 .2 .9 .3 .6 1.1 1.3 1.4 1.7-.8 9.9-2.6 19.9-4.7 29.6-7.5 35.1-20.4 59.3-47.7 82.8-1.6-.7-3.4-.8-4.8-1.4l-28.1-13.4c-9.3-4.4-18.4-14.1-19.1-24.8l-1.5-26.1-1.2-30.1c-.1-3.4-.8-12.5 .2-15.4 .6-1.6 1.8-3 3.4-3.6 2.7-1 11.3 .9 14.7 1.1l-.5-3.3c21.1 1.7 42.2 3.3 63.3 1.7l22.6-1.7Z\" fill=\"var(--art-sky,#58ADEB)\"/>\n<path d=\"M136.5 19.2l5 43.2c.7 .2 1.2 .2 1.9 .1 0 .3-.2 .7-.5 1.2 .9-.1 1.8-.1 2.7-.2l2.6 2.6c1-.9 2-2.4 3.3-3.1 .7-.4 1.5-.4 2.3-.5 .8-.1 1.7-.3 2.5-.1 1.6 .6 4 3.6 5.2 5l-3.1 3 3.1 3.1c-.8 6.2 1 4.8-3.7 9.5 .8 .9 2.2 1.8 2.7 2.9 .5 1.1 .2 5.7-.4 6.8-.6 1.1-2 2.1-2.9 3 .8 .8 2.2 1.8 2.7 2.8 .4 1 .1 5.6-.3 6.6-.6 1.1-2.1 2.2-3 3.1l2.7 2.7c0 1.6 .2 5.2-.6 6.6-.6 1.1-2 2.1-2.9 2.9l2.7 2.7c-.1 1.7 .2 5.1-.6 6.6-.6 1.1-2.2 2.2-3.1 3.2l2.5 2.5c-1.7 5.7-1.9 5.8-6.1 10 .4 .8 .5 .5 .6 1.2 0 .4-7.3 7.9-8 8.1-.5 .1-.9-.1-1.3-.3-3.3 3.4-5.5 5.3-9.9 7.2-.4-.4-.8-.8-1.3-1.2-3.5 3.7-5.3 5-10 7-.6-.4-1.1-.9-1.6-1.2-3.2 3.5-5.4 5.1-9.9 6.8-.5-.4-1-.9-1.5-1.3-1.2 1.2-2.4 2.8-3.9 3.8-2.5 1.6-7.2 1.7-9.8 .1-1.3-.8-2.5-2.3-3.6-3.4l5.6-5.2c2.5 .1 4.6 0 7-.6 .5 .4 1 .9 1.5 1.3 3.7-3.8 5.1-4.8 10-6.7 .5 .4 1 .8 1.5 1.2 2.3-2.9 4.4-4.3 7.7-6 .6-.3 1.4-.9 2-.8 .6 0 1.3 .5 1.7 .8 3-3 6.4-6.4 10.8-6.9l7.8-7.8c-.3-.7-.4-.5-.5-1.1-.1-.4 1.7-5 2-5.6 .7-1.1 2-2.1 3-3l-2.5-2.4c.8-5.9-.7-4.8 3.7-9.3l-2.8-2.8c.2-1.7-.1-5.1 .6-6.5 .6-1.1 2.1-2.2 3-3.1l-2.8-2.9c.1-1.5 0-5.2 .5-6.4 .5-1.1 2.1-2.3 3-3.1l-2.9-2.9c.3-1.8-.1-5.2 .6-6.7 .6-1.1 2.2-2.2 3.1-3.1l-3-2.9c.3-2.5-.1-5.1 .9-7.3-1.4-.7-2.3-1.8-3.4-2.9-1 1-2.1 2.7-3.4 3.3-1.3 .6-5.7 .7-7.4 .9 .2-1 .6-2.3 .4-3.3-.1-.6-.5-1.2-.6-1.8 .2-.3 .3-.7 .5-1 .1-.1 .4-.1 .5-.3 .4-.8 .5-4.1 .7-5.1l-24 1.7c-7.2 .5-14.4 .5-21.6 .5-13.9 0-27.9-.5-41.6-2.4l-4.1-32.6 88-10.2ZM47.5 68.5c-.1 .8-1.8 1.2-3.7 1-2-.2-3.5-1-3.4-1.7 .1-.8 1.7-1.2 3.7-1 1.9 .2 3.4 1 3.4 1.7ZM60.8 69.9c0 .7-1.9 1.2-4.2 1-2.2-.2-4-1-3.9-1.7 0-.8 1.9-1.2 4.2-1 2.2 .2 4 1 3.9 1.7ZM132.4 69.5c0 .7-1.7 1.5-4 1.7-2.2 .2-4-.3-4.1-1-.1-.7 1.7-1.5 3.9-1.7 2.2-.2 4.1 .3 4.2 1ZM75.1 70.8c-.1 .8-2 1.3-4.2 1.1-2.3-.1-4.1-.8-4-1.5 0-.8 1.9-1.3 4.1-1.2 2.3 .2 4.1 .9 4.1 1.6ZM118.2 70.6c.1 .7-1.7 1.4-4 1.5-2.2 .2-4.1-.3-4.1-1.1-.1-.7 1.7-1.5 4-1.6 2.2-.1 4.1 .4 4.1 1.2ZM89.4 71.3c0 .8-1.9 1.3-4.1 1.3-2.3-.1-4.1-.8-4.1-1.5 0-.7 1.9-1.3 4.2-1.2 2.2 0 4 .7 4 1.4ZM103.9 71.2c0 .8-1.8 1.4-4.1 1.4-2.3 0-4.1-.5-4.1-1.3 0-.7 1.8-1.4 4.1-1.4 2.2 0 4.1 .6 4.1 1.3ZM41.5 80.6c-.7 0-1.3-1.5-1.4-3.5-.1-2 .5-3.7 1.2-3.7 .8 0 1.4 1.6 1.5 3.6 0 2-.5 3.6-1.3 3.6ZM42 93c-.7 .1-1.4-1.6-1.4-3.6-.1-2 .5-3.7 1.2-3.7 .7 0 1.4 1.6 1.4 3.6 .1 2.1-.5 3.7-1.2 3.7ZM42.6 105.5c-.7 0-1.4-1.6-1.5-3.6-.1-2 .4-3.7 1.1-3.7 .8-.1 1.5 1.5 1.6 3.6 .1 2-.4 3.7-1.2 3.7ZM43.2 118c-.7 0-1.4-1.6-1.5-3.7-.1-2 .4-3.7 1.1-3.7 .8-.1 1.4 1.5 1.5 3.6 .2 2-.3 3.7-1.1 3.8ZM44 130.5c-.8 0-1.4-1.6-1.6-3.6-.1-2.1 .4-3.7 1.1-3.8 .8 0 1.4 1.6 1.5 3.6 .2 2-.3 3.7-1 3.8ZM47.1 142.4c-.7 .3-1.9-1-2.6-2.9-.7-1.9-.7-3.7 0-3.9 .7-.3 1.8 1 2.5 2.9 .7 1.9 .7 3.7 .1 3.9ZM55.6 151.6c-.5 .6-2.2-.1-3.7-1.4-1.6-1.4-2.5-3-2-3.5 .5-.6 2.2 .1 3.8 1.4 1.5 1.4 2.4 3 1.9 3.5ZM66.8 157.6c-.3 .6-2.1 .4-3.9-.6-1.9-.9-3.1-2.2-2.8-2.8 .3-.7 2.1-.4 3.9 .5 1.9 1 3.1 2.3 2.8 2.9ZM78.3 163.2c-.4 .6-2.1 .4-4-.5-1.8-.9-3.1-2.2-2.8-2.8 .3-.6 2.1-.4 4 .5 1.8 .9 3.1 2.2 2.8 2.8ZM89.7 168.7c-.3 .6-2 .4-3.9-.5-1.9-.8-3.1-2.1-2.8-2.7 .3-.7 2-.5 3.9 .4 1.9 .9 3.1 2.2 2.8 2.8Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M86.5 175c4.5-3.7 9.1-7.5 13.1-11.8 24.6-25.9 33.6-58.6 38.4-93.2 2.6 .2 5.4-.2 7.8-.8 .1-.8 .1-1.4-.3-2.1l-7.3 .5 .7-5.4c3.3-.5 17.6-2.7 19.9-2 2.9 1 4.2 4.1 4.1 6.9l-1.2 25.1-2.9 41.1c-.8 11.9-8.6 21.6-19 26.9l-36.5 18.6c-5.5 2.8-12-1.5-16.8-3.8ZM157.7 67c.1 .8-1.4 1.5-3.2 1.6-1.9 .2-3.4-.4-3.5-1.2 0-.8 1.4-1.5 3.3-1.6 1.8-.1 3.4 .4 3.4 1.2ZM156.7 72.8c.8 .1 1.3 1.7 1.2 3.8-.1 2-.8 3.6-1.5 3.6-.8-.1-1.3-1.7-1.2-3.8 .1-2 .8-3.6 1.5-3.6ZM156.1 85.5c.7 .1 1.2 1.7 1.1 3.8-.1 2-.8 3.6-1.5 3.6-.7 0-1.2-1.7-1.1-3.8 .1-2 .8-3.6 1.5-3.6ZM155.4 98.1c.7 0 1.2 1.7 1.1 3.7-.1 2-.7 3.6-1.5 3.6-.7-.1-1.2-1.7-1.1-3.7 .1-2.1 .8-3.7 1.5-3.6ZM154.7 110.5c.8 0 1.2 1.7 1.1 3.7-.2 2-.9 3.6-1.6 3.6-.8-.1-1.2-1.8-1.1-3.8 .2-2 .9-3.6 1.6-3.5ZM153.9 122.8c.8 .1 1.2 1.7 1.1 3.7-.2 1.9-.9 3.5-1.7 3.4-.7 0-1.2-1.7-1-3.7 .2-1.9 .9-3.5 1.6-3.4ZM152.8 134.8c.7 .2 .8 1.9 .1 3.8-.6 1.8-1.7 3.1-2.4 2.9-.7-.3-.7-2-.1-3.8 .7-1.9 1.7-3.2 2.4-2.9ZM147.9 145.6c.5 .6-.3 2.2-1.7 3.6-1.5 1.5-3.1 2.2-3.6 1.7-.5-.5 .3-2.1 1.7-3.6 1.5-1.4 3.1-2.2 3.6-1.7ZM138.4 153.7c.3 .6-.8 1.9-2.6 2.9-1.8 1-3.6 1.3-3.9 .6-.3-.6 .8-1.9 2.6-2.9 1.8-1 3.6-1.3 3.9-.6ZM127.2 159.6c.4 .6-.9 1.9-2.7 2.8-1.9 1-3.7 1.2-4 .6-.3-.6 .9-1.9 2.8-2.8 1.9-1 3.6-1.2 3.9-.6ZM115.8 165.3c.3 .7-1 1.9-2.8 2.8-1.9 .9-3.6 1.2-3.9 .5-.3-.6 .9-1.8 2.8-2.8 1.8-.9 3.6-1.1 3.9-.5ZM95 169.9c-.4 .7-.7 1.3-.7 2.1 3.2 1.6 7.2 1.7 10.3-.2-.2-.7-.4-1.4-1-1.9-3.1 .7-5.6 .7-8.6 0Z\" fill=\"var(--art-sky-deep,#3488C9)\" fill-rule=\"evenodd\"/>\n<path d=\"M130 33.2l.5 4-71.3 6.6-.4-3.9 71.2-6.7ZM131.5 45.5l.4 3.7-71.1 6.8-.5-3.8 71.2-6.7Z\" fill=\"var(--art-paper-deep,#DAD1BC)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "dc5a2e0f83";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [SHADE, SKY, PAPER, DEEP, LINES] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const fill = (t) => `fill="${paint(t)}"`;
const shadeRuns = parsePath(SHADE.d), paperRuns = parsePath(PAPER.d), deepRuns = parsePath(DEEP.d);
const NOTE_SHADOW = runsToD([shadeRuns[0]]), POCKET_SHADOW = runsToD([shadeRuns[1]]);
// The pocket's whole front, for clipping: the light part and the shaded right side.
const FRONT = `${SKY.d}${runsToD([deepRuns[0]])}`;
// The note: its top corner, its turn, how long it is under the pocket.
const TL = [48.5, 29.4], ANG = -6.62, W = 88.6, L = 84;
const rad = Math.PI / 180, U = [Math.cos(ANG * rad), Math.sin(ANG * rad)], V = [-U[1], U[0]];
const MID = [TL[0] + U[0] * W * 0.5 + V[0] * 20, TL[1] + U[1] * W * 0.5 + V[1] * 20];
const decay = (t, at, amp, hz, k) => (t <= at ? 0 : amp * Math.sin(2 * Math.PI * hz * (t - at)) * Math.exp(-k * (t - at)));
// The note's own frame: x along its top edge, y down its side.
const local = `translate(${TL[0]} ${TL[1]}) rotate(${ANG})`;
const paperFace = `<g transform="${local}"><rect width="${W}" height="${L}" ${fill("paper")}/></g>${LINES.svg}`;
// Money: the same note, the other side. Its own color, a frame inside the edge, the round middle, a mark in each top corner.
function moneyFace(shade = "teal-lit") {
  return `<g transform="${local}"><rect width="${W}" height="${L}" ${fill(shade)}/><rect x="4.5" y="4.5" width="${W - 9}" height="${L}" fill="none" stroke="${paint("teal-deep")}" stroke-width="2"/>`
    + `<circle cx="${W / 2}" cy="20" r="10.5" ${fill("teal")}/><circle cx="${W / 2 - 2}" cy="18" r="4.6" ${fill("teal-lit")}/><ellipse cx="15" cy="13.5" rx="5" ry="3.4" ${fill("teal")}/><ellipse cx="${W - 15}" cy="13.5" rx="5" ry="3.4" ${fill("teal")}/></g>`;
}
// Along the note: d up its own side, k its width turning over about its middle (negative: the back).
const along = (d) => `translate(${n2(-V[0] * d)} ${n2(-V[1] * d)})`;
const turn = (k) => `translate(${n2(MID[0])} ${n2(MID[1])}) rotate(${ANG}) scale(${n4(k)} 1) rotate(${-ANG}) translate(${n2(-MID[0])} ${n2(-MID[1])})`;
// The band under the dark side's stitches is part of the note's run in the still, so it's drawn clipped to the pocket, and clear of the mouth where the note was.
const pocketFront = (sky, paper, deep, patch = "") => { const [band, ...rest] = parsePath(paper); return `<path d="${sky}" ${fill("sky")} clip-path="url(#mo)"/>${patch}<g clip-path="url(#pf)"><path d="${runsToDc([band])}" ${fill("paper")} clip-path="url(#nb)"/></g><path d="${runsToDc(rest)}" ${fill("paper")}/><path d="${deep}" ${fill("sky-deep")} fill-rule="evenodd"/>`; };
const NB = `<clipPath id="nb"><polygon points="142.2,0 200,0 200,200 0,200 0,71 142.2,71"/></clipPath>`;
// The mouth: the still's front reaches up under the note, so it's cut along the note's own bottom edge, which is the mouth you see. Where the note covered a
// corner of the hem, a patch stands in once it's gone.
const MOUTH = `<clipPath id="mo"><path d="M0 0H52.6V62C66.3 63.9 80.3 64.4 94.2 64.4C101.4 64.4 108.6 64.4 115.8 63.9C123.8 63.3 131.8 62.8 139.8 62.2V0H200V200H0Z"/></clipPath>`;
const PATCH = `<polygon points="137.4,63.4 139.8,62.4 142.2,61.6 142.2,70.4 137.4,70.4" ${fill("sky")}/><polygon points="138.3,66.4 146.3,66.2 146.3,70 138.3,70" ${fill("sky-deep")}/>`;
const clips = `<clipPath id="pf"><path d="${FRONT}"/></clipPath>${NB}${MOUTH}`;

// ---- happy.
const HAPPY_DUR = 2.15;
function happy(t) {
  if (t <= 0) return STILL;
  // The note stays where it is. Banknotes come down from above the picture and slide into the pocket behind it, one and then another, as if someone
  // were tucking them in; each fans out a little once it's in, about a point down in the pocket, and settles. (They come from outside the picture: nothing
  // turns into money.) Each comes down along the note's own slant, behind the pocket's front, so the pocket takes it in.
  let more = "";
  for (const [at, ang, end] of [[0.2, 12, 6], [0.62, -10, 3]]) {
    const up = track([[at, 150], [at + 0.65, end, "io"], [at + 0.74, end + 1.6, "out"], [at + 0.82, end, "io"]], t);
    if (t <= at) continue;
    const fan = track([[at + 0.62, 0], [at + 0.82, 1.1, "out"], [at + 0.92, 1, "io"]], t);
    more = `<g transform="rotate(${n2(ang * fan)} 95 128) ${along(up)}">${moneyFace("teal")}</g>` + more;
  }
  const shadow = `<path d="${NOTE_SHADOW}" ${fill("sun-deep")}/>`;
  return `${OPEN}${clips}${BG}<path d="${POCKET_SHADOW}" ${fill("sun-deep")}/>${shadow}${more}${paperFace}${pocketFront(SKY.d, PAPER.d, DEEP.d)}</svg>`;
}

// ---- sad.
// The seam along the bottom: the dashes from the left side's foot round to the right side's, in the order they go. Paper ones are stitches on top; on the
// dark side a stitch is a hole in the shade over the paper band.
const SEAM = [[13, "paper"], [14, "paper"], [15, "paper"], [16, "paper"], [12, "deep"], [11, "deep"], [17, "paper"], [10, "deep"], [9, "deep"], [8, "deep"]];
const POPS = [0.22, 0.34, 0.44, 0.53, 0.6, 0.66, 0.71, 0.75, 0.79, 0.83];
const centerOf = (run) => { const p = run.segs.flatMap((s) => s); return [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length]; };
const G = 700;
// a paper note's fall: much gentler than a stone's, the air holding it back
const NOTE_G = 260;
// The front's foot lifts away in the middle once the seam's gone: the inside shows dark under it.
const FRONT_RUNS = [SKY, PAPER, DEEP].map((p) => parsePath(p.d));
const smooth = (v) => { const w = Math.max(0, Math.min(1, v)); return w * w * (3 - 2 * w); };
const gape = (x, y, g) => [x, y - g * smooth((y - 120) / 52) * smooth(1 - Math.abs(x - 98) / 62)];
const SAD_DUR = 2.5;
function sad(t) {
  if (t <= 0) return STILL;
  let flying = "";
  const gone = new Set();
  SEAM.forEach(([i, kind], n) => {
    const at = POPS[n];
    if (t < at) return;
    gone.add(`${kind}${i}`);
    const run = kind === "paper" ? paperRuns[i] : deepRuns[i], [cx, cy] = centerOf(run), s = t - at;
    // Off it goes, out from the seam and down, turning.
    const out = [(cx - 98) / 60, 0.6], vx = out[0] * 70, vy = -60 + out[1] * 20, x = cx + vx * s, y = cy + vy * s + 0.5 * G * s * s;
    if (y > 215) return;
    flying += `<path d="${runsToD([run])}" ${fill("paper")} transform="translate(${n2(x - cx)} ${n2(y - cy)}) rotate(${n2(540 * s * Math.sign(out[0] || 1))} ${n2(cx)} ${n2(cy)})"/>`;
  });
  const g = track([[0.5, 0], [0.95, 10.5, "out"], [1.1, 8.6, "io"], [1.3, 9.6, "io"]], t);
  const keep = (runs, kind) => runs.filter((_, i) => !gone.has(`${kind}${i}`));
  const warp = (runs) => (g > 0 ? runsToDc(runs, (x, y) => gape(x, y, g)) : runsToDc(runs));
  const sky = warp(FRONT_RUNS[0]), paper = warp(keep(FRONT_RUNS[1], "paper")), deep = warp(keep(FRONT_RUNS[2], "deep"));
  // The note: it slips down into the pocket as the seam gives, then out of the bottom, falling, turning as it goes.
  const SLIP = 0.9, OUT = 1.42;
  let note, inMouth = false;
  if (t < OUT) {
    // (it slides down through the gap, easing out of the pocket rather than shooting out: paper drags)
    const d = -track([[SLIP - 0.25, 0], [SLIP - 0.12, 3, "io"], [OUT, 92, "io"]], t);
    note = `<g transform="${along(d)}"><path d="${NOTE_SHADOW}" ${fill("sun-deep")}/>${paperFace}</g>`;
    inMouth = d > -12;
  } else {
    // Out of the pocket, it falls from rest as paper does against the air, slowly: it leaves the picture at about 3.5 units a frame.
    const s = t - OUT, y = 92 + 0.5 * NOTE_G * s * s;
    // (turning slowly as it goes, as paper does, so its far end never whips out of the picture between two frames)
    note = `<g transform="${along(-y)} rotate(${n2(-45 * s * s)} 98 175) translate(${n2(-18 * s)} 0)">${paperFace}</g>`;
  }
  // The inside of the pocket, dark, behind the note: it only shows where the front lifts away.
  const inside = g > 0 ? `<path d="${FRONT}" ${fill("ink-lit")}/>` : "";
  return `${OPEN}<clipPath id="pf"><path d="${sky}${runsToDc([parsePath(deep)[0]])}"/></clipPath>${NB}${MOUTH}${BG}<path d="${POCKET_SHADOW}" ${fill("sun-deep")}/>${inside}${note}${pocketFront(sky, paper, deep, inMouth ? "" : PATCH)}${flying}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
