// Full's two stories, the water's own: the glass is filled past its brim, the water standing proud of the rim and a bead already over the
// right side of it. The bead runs. Happy: it runs a little way down the outside of the glass, leaving its water behind it, slows and
// stops; the brim holds, and the camera eases in to it: the water standing over the rim, full to it. Sad: as it runs it draws the brim after it: the
// water at the rim breaks over, a stream runs down the side to the table and spreads there in a pool, and the level drops below the rim.
// Every frame is a pure function of t, in seconds. The still's own parts: the table and the glass's shadow, the water (its body, its
// shaded side, its top with the bead hanging over the rim at the right, its foot at (116.5, 66)), the glass (its walls, its base); the
// glass's right side runs down from (124.5, 45) to (108, 172) on the table.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M109.4 141.8l-.4 3.7 95.4 0 0 58.9c-1.9 0-4.1 .3-5.9-.3l-92.7-30.8c-1.4-.5-2.8-2.5-3.8-3.5l3.5-23.4c.2-1.3 3-3.7 3.9-4.6ZM35.3 141.7c.8 .8 3.9 3.4 4.1 4.6l4.3 29.4c.2 1.1 1.3 2.8 2.3 3.3l41.7 21.1c1.7 .8 3.2 3 4.5 4.3l-96.6 0 0-58.9 40.4 0-.7-3.8Z\" fill=\"var(--art-violet-lit,#A68CFF)\" fill-rule=\"evenodd\"/>\n<path d=\"M106 166.2l-.5 3.6 98.8 32.6c.1 .7 .1 1.3 0 2l-116.2 0c-.3-.6 0-.6-.4-.8l-41.9-21.2c-1.7-.8-2.9-2.8-4.1-4.1 .6-.6 1.1-1.2 1.7-1.8 11.2 6.3 29.2 6 41.7 4.5 4.1-.4 11.5-1.4 14.8-3.8 2.1-1.5 1.4-4.4 2.2-6.5 .7-1.8 2.7-3.2 3.9-4.5Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M25.9 28.3c20.7 10.3 55.9 8.4 78.3 4.7l3.5 3.4c1.5 18.4-3.4 36.3-12.5 52.3l-16.2 28.1c-7.5 12.9-12.8 28-13.6 43.1-.1 3.4 .1 6.9 .2 10.3l-3.6 3.7c-7.3-1-14.6-2.3-19.9-7.8-1-.9-2.1-1.9-2.7-3.2-.5-1-.5-2.2-.7-3.3l-9.2-69.2c-.1-.1-.1-.2-.1-.2l-4.1-38.2-2-21.1 2.6-2.6Z\" fill=\"var(--art-sky,#58ADEB)\"/>\n<path d=\"M113.9 64.2c1.7 1 2.9 2.2 4.4 3.6l-4 32.7-8.5 61.3c-.3 2.5-4.6 6.2-6.7 7.4-7.5 4.6-18.7 5.1-27.3 5.1-2.3 0-7 .4-9-.7-1-.6-1.7-1.6-2.3-2.4 .6-.1 1.1 0 1.8-.3-.1-3.5-.5-7.1-.4-10.7 .7-15 6-30.2 13.5-43.2l16.1-28.1c7.4-12.7 12.4-27.5 13.1-42.2 .2-3.6-.1-7.3-.2-10.9-.7-.1-1.4 0-2.1-.2 1.6-2.1 5.1-4.5 8-3.5 1.2 .5 2.2 1.8 3.1 2.8 1.2 1.1 2.4 2.3 2.9 3.9 2.3 7-5.7 14.9-2.4 25.4Z\" fill=\"var(--art-sky-deep,#3488C9)\"/>\n<path d=\"M118.1 68.8l-.3 3.1c-.7 .1-1 .1-1.6-.2 0-1 0-1.9 .1-2.9-10.7-3.6-6.2-14.5-3.9-22.3 1-3.5 1.8-8.6-2-10.9-2.5-1.5-5.9-.1-8.6 .4-6.4 1.1-12.9 1.8-19.4 2.2-13.2 .7-26.8 .5-39.9-1.9-3.4-.7-7-1.4-10.3-2.6-2.7-.9-5-2.3-7.8-2.6-.1-.1-1-1-1.3-1.3-.2-2.1-.7-4.4 .5-6.3 1.6-2.8 5.5-4.1 8.3-5.1 7.5-2.6 15.5-3.7 23.4-4.5 16.4-1.6 33.4-1.5 49.7 1.8 4.3 .9 14.1 3.1 16.6 7 2.4 3.5-.7 12.4-.3 16.8 .2 2.3 1.2 4.7 1.8 7 1.5 5.8 3.1 15-1.5 20-1 1-2.3 1.6-3.5 2.3Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/>\n<path d=\"M121.7 41.7c-.9-4-1.6-7.8-1.3-11.9 .1-2.2 1.4-4.5 0-6.6-2.7-4-11.6-5.7-16.1-6.6-15.3-3-31.4-3.1-47-1.8-8.5 .7-17.3 1.8-25.3 4.8-2.6 .9-7 2.5-7.7 5.7-.4 2.4 1.9 4.1 3.8 5.2 4.6 2.6 10.2 3.7 15.4 4.6 13.9 2.4 28.3 2.6 42.4 1.6 4.1-.3 8.2-.7 12.3-1.3 2.5-.4 5-1.1 7.6-1.1 1.4 .1 2.9 .5 4.3 .8-21.5 5.1-57 6.6-77.9-.6-2.4-.8-4.5-1.9-6.7-3l6.3 54.1 9 65.7c.4 3.1 .6 8.4 1.8 11.2 .5 1.2 1.5 2.4 2.2 3.5 .6 .4 1.2 .8 1.8 1.3 .1 .9 .1 1.9 .2 2.8 13 6.3 38.3 6.1 51.3-.1l.4-3c.5-.3 1-.7 1.6-1 1.4-2.3 2.6-4 2.9-6.6l9.6-68.4 2.9-22.5 3.4 0-2.6 23-10.2 74.5c-.5 3.5-.5 9.2-2.7 12-2.7 3.3-7.5 4.5-11.5 5.4-9.8 2.2-20.4 2.3-30.4 1.4-6-.6-20.4-2.1-21.4-9.8l-8.5-62-4.3-33.7c0-.1 0-.1 0-.2l-4.8-46.6c-.2-2.6-1.1-6.1 0-8.5 2.9-6.6 19.6-9.2 26.1-10.1 18.1-2.6 37.1-2.6 55.1 .7 5.3 1 15.9 3.3 18.8 8.1 1.8 3-.3 15.1-.8 19Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M43.7 164.4c1.9 1.3 3.7 2.5 5.9 3.3 13.1 5 38.7 4.6 50.8-2.7 .5 .4 1.1 .9 1.6 1.5-.2 1.2-.2 2.4-.7 3.6-1.8 4-7.5 5.4-11.4 6.3-11 2.5-24 2.4-35 .1-6.1-1.3-14-4.3-11.2-12.1Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n</svg>\n";
export const STILL_HASH = "972d3ed780";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 8 || !EL[5].includes("M118.1 68.8")) throw new Error("full: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const [BG, TABLE, SHADOW, WATER, WATER_SHADE, TOP, GLASS, BASE] = EL;
const TOP_D = /d="([^"]+)"/.exec(TOP)[1];
// the glass's right side, outside (where the running water goes)
const SIDE = (y) => 124.5 - 0.117 * (y - 45);
const BEAD = [116.5, 66];

// ---- the run: a stream from the bead down the glass's side to its head, a bead at its end
function run(head, width, bead, tone = "sky-lit") {
  if (head <= BEAD[1] + 0.05) return "";
  const n = 12, L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const y = BEAD[1] + ((head - BEAD[1]) * i) / n, x = Math.min(BEAD[0] + (SIDE(y) - 2.6 - BEAD[0]) * Math.min(1, (y - BEAD[1]) / 10), SIDE(y) - 2.6);
    const w = width * (1 - 0.35 * (i / n));
    L.push([x - w / 2, y]); R.push([x + w / 2, y]);
  }
  const hx = L[n][0] + width * 0.33;
  return `<path d="M${[...L, ...R.reverse()].map((p) => `${n2(p[0])} ${n2(p[1])}`).join(" ")}Z" ${fill(tone)}/><ellipse cx="${n2(hx)}" cy="${n2(head)}" rx="${n2(bead)}" ry="${n2(bead * 1.2)}" ${fill(tone)}/>`;
}

// ---- happy: the bead runs a little way and stops; the brim holds, and the camera eases in to it, the water standing over the rim
const HAPPY_DUR = 2.6;
const cam = (cx, cy, z) => `translate(100 100) scale(${n4(z)}) translate(${n2(-cx)} ${n2(-cy)})`;
function happy(t) {
  if (t <= 0) return STILL;
  // it gathers, then runs, slowing as it leaves its water on the glass, and stops
  const head = track([[0.3, BEAD[1]], [0.6, BEAD[1] + 4, "in"], [1.5, 86, "out"]], t);
  const width = track([[0.3, 3.4], [1.5, 2.2, "io"]], t), bead = track([[0.3, 3.6], [1.5, 3, "io"]], t);
  const u = track([[0.45, 0], [2.2, 1, "io"]], t), z = Math.exp(Math.log(2.3) * u);
  return `${OPEN}<g transform="${cam(100 + 10 * u, 100 - 48 * u, z)}">${BG.replace('width="200" height="200"', 'x="-100" y="-100" width="400" height="400"')}${TABLE}${SHADOW}${WATER}${WATER_SHADE}${TOP}${GLASS}${BASE}${run(head, width, bead)}</g></svg>`;
}

// ---- sad: the brim breaks
const SAD_DUR = 2.8, T_TABLE = 1.05;
// the water over the rim at the right (the bead's side of the still's top), which stays at the rim; the rest of the top, inside the glass
const OVER = "M110 34L119 27L140 10L140 90L105 90Z";
const CLIPS = `<clipPath id="ov"><path d="${OVER}"/></clipPath><clipPath id="in"><path clip-rule="evenodd" d="M-10 -10H210V210H-10Z${OVER}"/></clipPath>`;
function sad(t) {
  if (t <= 0) return STILL;
  // the run, faster: down to the table; the stream after it thickening as the brim gives; a pool spreading on the table at the glass's foot
  const head = track([[0.3, BEAD[1]], [0.5, BEAD[1] + 6, "in"], [T_TABLE, 171, "in"]], t);
  const width = track([[0.3, 3.4], [T_TABLE, 3.2, "io"], [T_TABLE + 0.6, 5.2, "io"], [SAD_DUR, 4.2, "io"]], t);
  const pool = track([[T_TABLE - 0.02, 0], [SAD_DUR, 1, "out"]], t);
  // the level falling below the rim as the water goes over it: the top inside the glass lower, the empty glass above it pale
  const d = track([[T_TABLE, 0], [SAD_DUR - 0.2, 7, "out"]], t);
  const top = d > 0.01
    ? `<g clip-path="url(#in)"><path d="${TOP_D}" ${fill("sky-pale")}/><rect x="23" y="29" width="97" height="${n2(d)}" ${fill("sky-pale")}/><path d="${TOP_D}" transform="translate(0 ${n2(d)})" ${fill("sky-lit")}/></g><path d="${TOP_D}" clip-path="url(#ov)" ${fill("sky-lit")}/>`
    : TOP;
  const puddle = pool > 0.004
    ? `<ellipse cx="${n2(118 + 10 * pool)}" cy="${n2(176 + 3 * pool)}" rx="${n2(30 * pool)}" ry="${n2(6.5 * pool)}" ${fill("sky")}/><ellipse cx="${n2(114 + 9 * pool)}" cy="${n2(174.6 + 2.6 * pool)}" rx="${n2(17 * pool)}" ry="${n2(2.6 * pool)}" ${fill("sky-lit")}/>`
    : "";
  return `${OPEN}${d > 0.01 ? CLIPS : ""}${BG}${TABLE}${SHADOW}${puddle}${WATER}${WATER_SHADE}${top}${GLASS}${BASE}${run(head, width, track([[0.3, 3.6], [T_TABLE, 3.2]], t))}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
