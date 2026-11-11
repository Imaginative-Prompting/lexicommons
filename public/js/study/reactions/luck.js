// Luck's two stories, the picked four-leaf clover's. It lies on a sandstone stepping stone in a lawn, in a low evening sun (its long
// shadow). Happy, the camera's: easing back and up, it finds the lawn round the stone thick with clover, every one of them three-leaf:
// the one on the stone is the one in thousands. Sad, the clover's own (a time-lapse): picked, it wilts; its leaflets dull, one browns and
// curls, comes away from the rest and lies beside it, dry. An ordinary three-leaf clover.
// Every frame is a pure function of t, in seconds. The still's own parts: the stone (the yellow ground), the clover's long shadow (every
// point the clover hides from the sun: past the clover along (1, 1)), its top leaflets, its bottom leaflets and stem; the leaflets meet at
// (88, 88).
import { n2, n4, paint, parsePath, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M131.1 24.8c1.7 1.6 3.6 3.2 5.3 4.9l14.3 14.2c.3 .3 .5 .7 .8 .9l51.9 51.7c.3 .3 .7 .7 1 .9l0 107-107.3 0c-.3-.3-.6-.7-.9-1.1l-50.8-52.2-17.2-17.8c-1.9-2-3.8-4-5.5-6.3 .5-.6 1-1.1 1.5-1.6 5 3 8.9 4.4 14.7 3.7l3.9 3.9c-.7 4.3-.8 10.1 2.3 13.7 1 1.1 2.5 1.7 3.9 2.2 5.9 2 13.3 .5 17.8-3.9 7.2-7.2 11.8-25.2 14.2-35 .7-2.9 2.1-12.1 3.3-14 .8-1.4 2.2-2.5 3.4-3.6 3.4 3.5 3.8 2.6 3.7 7.6 .7 .8 1.5 1.5 2.1 2.4 1 1.9 2.4 8.8 3.3 11.4 2.4 7.8 8.2 22.7 14.3 28 5.1 4.3 16.1 6.8 21.3 1.3 2.8-3.1 3.3-7.8 3.4-11.7l3.9-3.9c3.6 .3 7.9-.2 10.8-2.7 1.2-1 1.9-2.5 2.5-3.9 2.8-6.4 2.1-14.1-1.9-19.9-4-5.9-13.9-8.4-20.5-9.3-2.3-.4-5.9-.2-7.8-1-1.5-.7-2.7-2.3-3.8-3.4 1-1.1 2.2-2.7 3.6-3.4 1.9-.9 5.7-.9 7.9-1.4 5.9-1.1 12.5-3.1 17.1-7.1 6.2-5.6 7.9-16.8 4.7-24.3-.6-1.3-1.3-2.7-2.4-3.7-3.6-3.2-9.2-3.3-13.7-3l-3.7-3.7c.6-5.3-.4-9.5-3.2-14.1 .6-.6 1.2-1.2 1.8-1.8ZM77.2 25.6l14.4 14.1c.3-.8 .6-1.7 .9-2.6l2.6 2.6c-3.2 13.5-3.4 27.1-3.4 40.8l-3.7 3.8-3.7-3.8-1.1-25c-.4-10.2-2.3-19.4-7.8-28.1 .6-.6 1.2-1.2 1.8-1.8ZM26.9 75.6c4.9 3 9.8 5 15.3 6.3 2.5 .6 9.8 1.2 11.4 2.1 1.3 .7 2.4 2.2 3.4 3.3l-3.6 3.5c-5.6 .3-10.9 1.1-16.4 2.4l-2.5-2.5 2.8-1-12.2-12.2c.6-.6 1.2-1.2 1.8-1.9ZM96.7 140.9c8 18.7 17.5 30.7 35.7 40.5 6.3 3.3 15 7.3 22.2 5 .1-.5 .2-.8 .2-1.4-2.8-1.5-6.1-2-9.2-3-4-1.3-7.9-3-11.7-4.9-11.9-6.3-23.7-16.9-31.7-27.7-2-2.7-3.7-5.6-5.5-8.5Z\" fill=\"var(--art-sun-deep,#DB9A22)\" fill-rule=\"evenodd\"/>\n<path d=\"M136 41c3.7-.3 7-.3 10.5 1.1 12.6 4.9 13.4 20.9 6.6 30.9-5.4 7.8-14.2 11.5-23.2 13.1-2.6 .5-5.4 .7-8 1.3 .5 .7 .9 .8 1.8 1l-2 2.3c-6.8 .5-13.6 .5-20.4 1.6-2.8 .5-5.5 1.1-8.2 1.8-1.6 .4-3.2 1.2-4.8 1.2-3.1 .1-9.6-1.8-13.1-2.4-7-1.2-14.1-1.5-21.2-2.2l-2.3-2.3c1.9-.2 1-.1 2.3-.9-2.5-.8-5.4-.9-8.1-1.4-8.7-1.5-17.9-4.4-23.6-11.6-8.1-10.1-6.2-26.6 6.4-32.1 3.7-1.6 7.4-1.7 11.4-1.5 0-3.6 .5-7.1 2.1-10.5 5.4-11.3 20.4-15 30.9-8.3 9.8 6.4 12.9 19.5 13.4 30.5l1.2 26.3c.1 .6 .2 1.1 .3 1.7 .6-3.1 .1-6.6 .3-9.8 .6-14.4 0-32.2 10-43.7 7.7-9 21.1-11.4 30.8-4.1 3.4 2.6 5.8 6.2 6.7 10.4 .6 2.5 .4 5 .2 7.6Z\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M139.2 130.9c0 2.2 0 4.4-.6 6.5-3.7 13.2-18.2 15.8-28 7.4-9.4-8-14.6-21.8-18.1-33.4-.9-3-1.5-6.1-2.5-9 0 .2-.2 .3-.3 .5-.3 1.1 2.2 14.6 2.7 16.6 4.5 19.8 15.8 37 32.5 48.6 5.6 3.9 11.6 7.1 18 9.5 4 1.4 8.6 2 12.3 4 3.3 1.7 4 5.5 .7 7.7-2.8 1.9-7 1.4-10.1 .7-8-1.7-15.5-5.9-22.2-10.5-19.1-13.2-31.5-33.7-34.9-56.7-1.4-9.6-.8-19.3-.8-28.9-3.3 15.7-7.6 41.4-19.3 53-8.3 8.2-23.3 9.6-28.4-2.9-1.5-3.7-1.4-7.5-.8-11.5-5.4 .6-10.8-.2-15.1-3.8-7.7-6.3-8.3-18.5-3.5-26.6 6.7-11.6 21-14.6 33.4-14.8 7.6-.1 15.5 1.1 22.9 2.5 3 .5 8.4 2.2 11.2 2.1 1.6-.1 3.2-.8 4.8-1.3 2.8-.7 5.7-1.4 8.7-1.8 13.2-2.2 30.1-2.8 42.4 3.3 6.7 3.4 12.1 9.1 13.6 16.5 2.4 12.1-5.8 23.6-18.6 22.3Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n</svg>\n";
export const STILL_HASH = "b79d705e93";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 4 || !EL[2].includes("M136 41c3.7-.3")) throw new Error("luck: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const t1 = (v) => (Math.round(v * 10) / 10).toString();
const [STONE, SHADOW, TOP, BOTTOM] = EL;
const TOP_D = /d="([^"]+)"/.exec(TOP)[1], BOTTOM_D = /d="([^"]+)"/.exec(BOTTOM)[1], TOP_FILL = /fill="[^"]+"/.exec(TOP)[0];
const MID = [88.5, 88];

// ---- the long shadow, from the clover as it is: across the light (u = x - y) the shadow starts at the clover's nearest point to the sun
// (least v = x + y) and runs on past the stone
const outline = (d) => parsePath(d).map((r) => r.segs.flatMap((g) => Array.from({ length: 6 }, (_, i) => { const t = i / 6, u = 1 - t; return [0, 1].map((j) => u * u * u * g[0][j] + 3 * u * u * t * g[1][j] + 3 * u * t * t * g[2][j] + t * t * t * g[3][j]); })));
const TOP_PTS = outline(TOP_D), BOTTOM_PTS = outline(BOTTOM_D);
function longShadow(rings, tone = "sun-deep") {
  const all = rings.flat(), U = all.map(([x, y]) => x - y), umin = Math.min(...U), umax = Math.max(...U), N = 120, best = new Array(N + 1).fill(Infinity);
  for (const Q of rings) for (let i = 0; i < Q.length; i++) {
    const a = Q[i], b = Q[(i + 1) % Q.length];
    for (let k = 0; k <= 8; k++) { const x = a[0] + ((b[0] - a[0]) * k) / 8, y = a[1] + ((b[1] - a[1]) * k) / 8, bi = Math.round(((x - y - umin) / (umax - umin)) * N); best[bi] = Math.min(best[bi], x + y); }
  }
  const FAR = 900, env = best.map((v, i) => { const u = umin + ((umax - umin) * i) / N; return [(u + v) / 2, (v - u) / 2]; }).filter((p) => Number.isFinite(p[0]));
  const P = [...env, [(umax + FAR) / 2, (FAR - umax) / 2], [(umin + FAR) / 2, (FAR - umin) / 2]];
  return `<path d="M${P.map((p) => `${t1(p[0])} ${t1(p[1])}`).join(" ")}Z" ${fill(tone)}/>`;
}

// ---- happy: back and up, to the lawn round the stone
// a three-leaf clover: three heart leaflets round its middle, the size of the four-leaf's
const heart = (a, s) => {
  const P = [[0, 0], [-14, -6], [-26, -20], [-22, -34], [-19, -44], [-6, -44], [0, -36], [6, -44], [19, -44], [22, -34], [26, -20], [14, -6], [0, 0]];
  // (whole units: a lawn's worth of them must fit the picture's size)
  const c = Math.cos(a), sn = Math.sin(a), q = P.map(([x, y]) => [Math.round((c * x - sn * y) * s), Math.round((sn * x + c * y) * s)]);
  return `M${q[0].join(" ")}C${q.slice(1, 4).flat().join(" ")} ${q.slice(4, 7).flat().join(" ")} ${q.slice(7, 10).flat().join(" ")} ${q.slice(10, 13).flat().join(" ")}Z`;
};
const TREFOIL = [0, 2.094, 4.189].map((a) => heart(a, 1.45)).join("");
// (their stems down among the grass and each other's leaves: unseen)
const clover = (x, y, a, s, tone) => `<path transform="translate(${x} ${y}) rotate(${a}) scale(${s})" d="${TREFOIL}" ${fill(tone)}/>`;
// the stone (the still's ground, carried a little past the frame, its edge in the low light), the lawn round it thick with clover
const LAWN_AT = [[-120, -110, 10, 1, "teal"], [-10, -150, -30, 0.95, "teal-lit"], [110, -160, 40, 1.05, "teal"], [230, -120, -10, 1, "teal-lit"], [320, -20, 25, 0.9, "teal"],
  [-170, 0, -40, 1, "teal-lit"], [-150, 120, 15, 1.05, "teal"], [-120, 250, -20, 0.95, "teal-lit"], [-10, 300, 35, 1, "teal"], [110, 290, -5, 1.1, "teal-lit"],
  [240, 280, 20, 0.95, "teal"], [320, 170, -35, 1, "teal-lit"], [330, 60, 10, 0.9, "teal-lit"], [-230, -200, 0, 1, "teal"], [370, -170, -20, 1, "teal"], [-230, 330, 30, 1, "teal"],
  [380, 330, -10, 1, "teal-lit"], [60, -260, 20, 1, "teal-lit"]];
const LAWN = `<rect x="-600" y="-600" width="1400" height="1400" ${fill("teal-deep")}/>` + LAWN_AT.map(([x, y, a, s, tone]) => clover(x, y, a, s, tone)).join("");
const STONE_EDGE = "M-14 -10C40 -16 150 -14 214 -12C218 50 216 150 212 214C150 220 50 218 -12 216C-16 150 -18 50 -14 -10Z";
// (the shadow as the stone has it, past the still's frame too)
const LONG = longShadow([...TOP_PTS, ...BOTTOM_PTS]);
const cam = (cx, cy, z) => `translate(100 100) scale(${n4(z)}) translate(${n2(-cx)} ${n2(-cy)})`;
const HAPPY_DUR = 2.8;
function happy(t) {
  if (t <= 0) return STILL;
  const u = track([[0.2, 0], [2.3, 1, "io"]], t), z = Math.exp(Math.log(0.36) * u);
  const stone = `<path d="${STONE_EDGE}" transform="translate(3 4)" ${fill("teal-deep")}/><path d="${STONE_EDGE}" ${fill("sun")}/>`;
  return `${OPEN}<g transform="${cam(100, 100 + 20 * u, z)}">${LAWN}${stone}<clipPath id="st"><path d="${STONE_EDGE}"/></clipPath><g clip-path="url(#st)">${LONG}</g>${TOP}${BOTTOM}</g></svg>`;
}

// ---- sad: it wilts, and a leaflet comes away
const SAD_DUR = 2.8;
// the top leaflets apart: the left one and the right one (cut at the leaflets' meeting)
const CLIPS = '<clipPath id="lf"><rect x="-10" y="-10" width="98.5" height="220"/></clipPath><clipPath id="rt"><rect x="88.5" y="-10" width="130" height="220"/></clipPath>';
const TL_PTS = TOP_PTS.map((r) => r.filter(([x]) => x < MID[0])).filter((r) => r.length > 2), TR_PTS = TOP_PTS.map((r) => r.filter(([x]) => x >= MID[0])).filter((r) => r.length > 2);
function sad(t) {
  if (t <= 0) return STILL;
  // the time-lapse: all of it dulling a little; the right top leaflet browning, curling toward its foot, then coming away from the middle
  // and lying beside it, turned a little
  const dull = track([[0.2, 0], [1.8, 0.35, "io"]], t), brown = track([[0.3, 0], [1.3, 1, "io"]], t);
  const curl = track([[0.6, 1], [1.5, 0.72, "io"]], t), away = track([[1.45, 0], [2.05, 1, "io"]], t);
  const dx = 16 * away, dy = -9 * away, turn = 24 * away;
  const tr = `translate(${n2(MID[0] + dx)} ${n2(MID[1] + dy)}) rotate(${n2(turn)}) scale(${n4(curl)}) translate(${-MID[0]} ${-MID[1]})`;
  const move = ([x, y]) => { const c = Math.cos((turn * Math.PI) / 180), s = Math.sin((turn * Math.PI) / 180), px = (x - MID[0]) * curl, py = (y - MID[1]) * curl; return [MID[0] + dx + c * px - s * py, MID[1] + dy + s * px + c * py]; };
  const shadow = longShadow([...TL_PTS, ...TR_PTS.map((r) => r.map(move)), ...BOTTOM_PTS]);
  const dulled = (svg) => (dull > 0.004 ? `${svg}<g opacity="${n4(dull)}">${svg.replace(/fill="[^"]+"/g, fill("wood-deep"))}</g>` : svg);
  const right = `<g transform="${tr}"><path d="${TOP_D}" clip-path="url(#rt)" ${TOP_FILL}/>${brown > 0.004 ? `<path d="${TOP_D}" clip-path="url(#rt)" ${fill("wood-deep")} opacity="${n4(brown)}"/>` : ""}</g>`;
  // (as the still lays them: the top leaflets, then the bottom ones over where they meet)
  return `${OPEN}${CLIPS}${STONE}${shadow}${dulled(`<path d="${TOP_D}" clip-path="url(#lf)" ${TOP_FILL}/>`)}${right}${dulled(BOTTOM)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
