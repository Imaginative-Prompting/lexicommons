// Four's two stories, the tablecloth's own weight: the four apples stand on a cloth over a wooden table, seen from above (the near two
// lower in the picture, the far two higher); the cloth hangs a little over the table's near edge, and the hanging part starts to slip,
// dragging the rest after it, faster the more of it hangs (a chain sliding off a table). The camera eases back as it starts, so the edge
// shows. Happy: the slide runs away, too fast for the cloth's friction to take the apples along: the hem sweeps down under them and over
// the edge, the wood shows, and all four stand where they stood, rocking a little and still. Sad: the cloth drags and creeps, the apples
// riding on it; the near two reach the edge and tip off it, out of sight; then the hanging end reaches the floor, its weight is held, and
// the cloth stops. Two.
// Every frame is a pure function of t, in seconds. The still's own parts: the cloth (the whole ground, teal), the four apples, each one
// drawing (the near left's is the far left's moved 84 down, the right ones 82 across), standing on its foot. Past the still's frame: the
// cloth's far hem just above it, the table's near edge just below (y 205), the cloth hanging over it, the floor 70 below the top (its
// height shown 0.6, the table seen from above).
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M58.1 45.8l.2-1.2c.9 .2 1.6 .2 2.5 0l-.3 1.5c3.7-1.7 6-3.8 10.4-3.7 3 0 7.3 4.8 8.8 7.1 6.4 10.1-1.1 25.4-8.4 33l-7.3 7.5c-1.4 1.4-2.6 3-3.6 4.6l-1.3-.2c-.9 .6-2.1 .6-3.1 1-1.6 .7-3 1.4-4.7 1.7-7.1 1.1-12.8-4.6-16.6-9.9-7-10.1-11.3-25-4-36 2.1-3.2 5-5.9 8.5-7.5 2.5-1.2 5.2-1.8 7.9-1.8 4.6 .1 7.2 2.1 11 3.9ZM140.1 45.8l.2-1.2c.9 .2 1.6 .2 2.5 0l-.3 1.5c3.7-1.7 6-3.8 10.4-3.7 3 0 7.3 4.8 8.8 7.1 6.4 10.1-1.1 25.4-8.4 33l-7.3 7.5c-1.4 1.4-2.6 3-3.6 4.6l-1.3-.2c-.9 .6-2.1 .6-3.1 1-1.6 .7-3 1.4-4.7 1.7-7.1 1.1-12.8-4.6-16.6-9.9-7-10.1-11.3-25-4-36 2.1-3.2 5-5.9 8.5-7.5 2.5-1.2 5.2-1.8 7.9-1.8 4.6 .1 7.2 2.1 11 3.9ZM58.1 129.8l.2-1.2c.9 .2 1.6 .2 2.5 0l-.3 1.5c3.7-1.7 6-3.8 10.4-3.7 3 0 7.3 4.8 8.8 7.1 6.4 10.1-1.1 25.4-8.4 33l-7.3 7.5c-1.4 1.4-2.6 3-3.6 4.6l-1.3-.2c-.9 .6-2.1 .6-3.1 1-1.6 .7-3 1.4-4.7 1.7-7.1 1.1-12.8-4.6-16.6-9.9-7-10.1-11.3-25-4-36 2.1-3.2 5-5.9 8.5-7.5 2.5-1.2 5.2-1.8 7.9-1.8 4.6 .1 7.2 2.1 11 3.9ZM140.1 129.8l.2-1.2c.9 .2 1.6 .2 2.5 0l-.3 1.5c3.7-1.7 6-3.8 10.4-3.7 3 0 7.3 4.8 8.8 7.1 6.4 10.1-1.1 25.4-8.4 33l-7.3 7.5c-1.4 1.4-2.6 3-3.6 4.6l-1.3-.2c-.9 .6-2.1 .6-3.1 1-1.6 .7-3 1.4-4.7 1.7-7.1 1.1-12.8-4.6-16.6-9.9-7-10.1-11.3-25-4-36 2.1-3.2 5-5.9 8.5-7.5 2.5-1.2 5.2-1.8 7.9-1.8 4.6 .1 7.2 2.1 11 3.9Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M58.9 94.7c1-1.6 2.2-3.3 3.6-4.7l7-7.2c6-6.1 10.9-15.2 11.2-23.9 .3-8.9-5.8-16-14.8-15.8 12.9-4.1 23.2 4.8 24.8 17.5 1.4 11.9-6.2 29.2-17 34.9-3.2 1.7-6.7 2-10.1 .8-1.6-.6-3-1.3-4.7-1.6ZM140.9 94.7c1-1.6 2.2-3.3 3.6-4.7l7-7.2c6-6.1 10.9-15.2 11.2-23.9 .3-8.9-5.8-16-14.8-15.8 12.9-4.1 23.2 4.8 24.8 17.5 1.4 11.9-6.2 29.2-17 34.9-3.2 1.7-6.7 2-10.1 .8-1.6-.6-3-1.3-4.7-1.6ZM58.9 178.7c1-1.6 2.2-3.3 3.6-4.7l7-7.2c6-6.1 10.9-15.2 11.2-23.9 .3-8.9-5.8-16-14.8-15.8 12.9-4.1 23.2 4.8 24.8 17.5 1.4 11.9-6.2 29.2-17 34.9-3.2 1.7-6.7 2-10.1 .8-1.6-.6-3-1.3-4.7-1.6ZM140.9 178.7c1-1.6 2.2-3.3 3.6-4.7l7-7.2c6-6.1 10.9-15.2 11.2-23.9 .3-8.9-5.8-16-14.8-15.8 12.9-4.1 23.2 4.8 24.8 17.5 1.4 11.9-6.2 29.2-17 34.9-3.2 1.7-6.7 2-10.1 .8-1.6-.6-3-1.3-4.7-1.6Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M84.6 25.3c-1.7 5.6-4.9 11.4-10.9 13.2-4.1 1.2-11.1-1.3-12.9 3.1-1.3-1.3-1.5-3.1-2-4.9 .2-.2 .4-.4 .6-.7 .2 .2 .3 .5 .5 .6 3.2-6.4 6.6-10.7 14.3-11.3 3.5-.3 7 .7 10.4 0ZM166.6 25.3c-1.7 5.6-4.9 11.4-10.9 13.2-4.1 1.2-11.1-1.3-12.9 3.1-1.3-1.3-1.5-3.1-2-4.9 .2-.2 .4-.4 .6-.7 .2 .2 .3 .5 .5 .6 3.2-6.4 6.6-10.7 14.3-11.3 3.5-.3 7 .7 10.4 0ZM84.6 109.3c-1.7 5.6-4.9 11.4-10.9 13.2-4.1 1.2-11.1-1.3-12.9 3.1-1.3-1.3-1.5-3.1-2-4.9 .2-.2 .4-.4 .6-.7 .2 .2 .3 .5 .5 .6 3.2-6.4 6.6-10.7 14.3-11.3 3.5-.3 7 .7 10.4 0ZM166.6 109.3c-1.7 5.6-4.9 11.4-10.9 13.2-4.1 1.2-11.1-1.3-12.9 3.1-1.3-1.3-1.5-3.1-2-4.9 .2-.2 .4-.4 .6-.7 .2 .2 .3 .5 .5 .6 3.2-6.4 6.6-10.7 14.3-11.3 3.5-.3 7 .7 10.4 0Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M60.8 46c-1.1 .3-1.9 .2-3-.2 .5-3.1 .2-6.2-1.7-8.9-.5-.6-1.4-1.3-1.7-2-.2-.9 .6-2.2 1.4-2.4 1.6-.4 2.8 1.5 3.5 2.6 2 3.3 2.2 7.1 1.5 10.9ZM142.8 46c-1.1 .3-1.9 .2-3-.2 .5-3.1 .2-6.2-1.7-8.9-.5-.6-1.4-1.3-1.7-2-.2-.9 .6-2.2 1.4-2.4 1.6-.4 2.8 1.5 3.5 2.6 2 3.3 2.2 7.1 1.5 10.9ZM60.8 130c-1.1 .3-1.9 .2-3-.2 .5-3.1 .2-6.2-1.7-8.9-.5-.6-1.4-1.3-1.7-2-.2-.9 .6-2.2 1.4-2.4 1.6-.4 2.8 1.5 3.5 2.6 2 3.3 2.2 7.1 1.5 10.9ZM142.8 130c-1.1 .3-1.9 .2-3-.2 .5-3.1 .2-6.2-1.7-8.9-.5-.6-1.4-1.3-1.7-2-.2-.9 .6-2.2 1.4-2.4 1.6-.4 2.8 1.5 3.5 2.6 2 3.3 2.2 7.1 1.5 10.9Z\" fill=\"var(--art-ink,#231F3B)\"/>\n</svg>\n";
export const STILL_HASH = "9ed3118aae";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 5 || !EL[1].includes("M58.1 45.8")) throw new Error("four: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const rect = (x, y, w, h, tone) => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(Math.max(0, h))}" ${fill(tone)}/>`;
// one apple (the far left's body, shade, leaf, stem), its foot at (59, 96.5)
const APPLE = [1, 2, 3, 4].map((i) => { const d = /d="([^"]+)"/.exec(EL[i])[1].split(/(?=M)/)[0]; return EL[i].replace(/d="[^"]+"/, `d="${d}"`); }).join("");
const FOOT = [59, 96.5];
const AT = [[0, 0], [82, 0], [0, 84], [82, 84]];
const apple = (i, dx, dy, a) => `<g transform="translate(${n2(AT[i][0] + dx)} ${n2(AT[i][1] + dy)})${a ? ` rotate(${n2(a)} ${FOOT[0]} ${FOOT[1]})` : ""}">${APPLE}</g>`;

// ---- the table, the floor, the cloth
const EDGE = 205, HIGH = 0.6, TABLE_H = 70, FLOOR = EDGE + TABLE_H * HIGH, HEM0 = -8, HANG0 = 25;
const WORLD = rect(-200, FLOOR, 600, 300, "paper-deeper") + rect(-200, EDGE, 600, FLOOR - EDGE, "ink") + rect(-200, EDGE, 600, 4, "wood-deep")
  + rect(-200, -200, 600, EDGE + 200, "wood") + `<path d="${[-82, -49, -16, 17, 50, 83, 116, 149, 182].map((y) => `M-200 ${y}H400V${y + 1.3}H-200Z`).join("")}" ${fill("wood-deep")}/>`
  + `<path d="M22 31H74V31.8H22ZM118 36H186V36.8H118ZM40 66H96V66.8H40ZM130 99H170V99.8H130ZM14 131H62V131.8H14ZM100 164H158V164.8H100ZM60 196H120V196.8H60Z" ${fill("wood-deep")}/>`;
// the cloth slid s along: on the top from its hem down to the edge, then hanging (shown 0.6), down to its end or the floor (piling there)
function cloth(s) {
  const hem = HEM0 + s, hang = HANG0 + s, end = EDGE + Math.min(hang, TABLE_H + 6) * HIGH;
  // (once the hem is over the edge, it goes on down what hangs, and at last the cloth lies on the floor)
  const top = hem < EDGE ? EDGE : Math.min(end - 2.5, EDGE + (hem - EDGE) * HIGH);
  return (hem < EDGE ? rect(-200, hem, 600, EDGE - hem, "teal") + rect(-200, hem, 600, 3, "teal-deep") : "")
    + rect(-200, top, 600, end - top, "teal-lit") + rect(-200, end - 2.5, 600, 2.5, "teal-deep");
}
// the camera, easing back to show the edge
const cam = (u) => { const z = 1 + (0.8 - 1) * u, cy = 100 + 28 * u; return `translate(100 100) scale(${n4(z)}) translate(-100 ${n2(-cy)})`; };
const view = (t) => track([[0.05, 0], [0.8, 1, "io"]], t);

// ---- happy: the slide runs away
const HAPPY_DUR = 2.2;
// the slide: from rest, the pull growing with what hangs (cosh), until the whole cloth is over the edge and gone
const runaway = (t) => (t <= 0.15 ? 0 : 0.66 * (Math.cosh(6 * (t - 0.15)) - 1));
function happy(t) {
  if (t <= 0) return STILL;
  const s = Math.min(runaway(t), 400);
  // the apples ride the first little way while it is slow, then it slips out under them; each rocks as the hem leaves its foot
  const ride = Math.min(s, 4) + 1.5 * (1 - Math.exp(-Math.max(0, s - 4) / 6));
  const out = AT.map(([, y], i) => {
    const sOff = FOOT[1] + y - HEM0;
    let tOff = 0.15; while (tOff < 3 && runaway(tOff) < sOff) tOff += 0.002;
    const a = track([[tOff - 0.03, 0], [tOff + 0.08, i % 2 ? -4 : 4, "out"], [tOff + 0.24, i % 2 ? 2.2 : -2.2, "io"], [tOff + 0.42, i % 2 ? -0.8 : 0.8, "io"], [tOff + 0.58, 0, "io"]], t);
    return apple(i, 0, ride, a);
  }).join("");
  return `${OPEN}<g transform="${cam(view(t))}">${WORLD}${cloth(s)}${out}</g></svg>`;
}

// ---- sad: it drags and creeps
const SAD_DUR = 3;
// the slide: the same slip, then the apples' weight drags it to a creep; held when the hanging end reaches the floor
const STOP = TABLE_H - HANG0;
const creep = (t) => track([[0.15, 0], [0.65, 6, "in"], [0.9, 9, "out"], [2.6, STOP - 3, "lin"], [2.85, STOP, "out"]], t);
function sad(t) {
  if (t <= 0) return STILL;
  const s = creep(t);
  const out = AT.map(([, y], i) => {
    if (FOOT[1] + y + s <= EDGE) return apple(i, 0, s, 0);
    // over the edge: dipping toward us off it, then falling from it, out of sight
    let tEdge = 0.15; while (tEdge < t && FOOT[1] + y + creep(tEdge) <= EDGE) tEdge += 0.002;
    const u = t - tEdge;
    return apple(i, 0, EDGE - FOOT[1] - y + 0.5 * 900 * u * u + 20 * u, (i % 2 ? 1 : -1) * Math.min(8, 40 * u));
  }).join("");
  return `${OPEN}<g transform="${cam(view(t))}">${WORLD}${cloth(s)}${out}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
