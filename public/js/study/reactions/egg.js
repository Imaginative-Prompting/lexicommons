// Egg's two stories. Happy, the camera's, easing back a little from the egg (it stays the subject, at three quarters of its size): in
// along the frame's bottom comes the top of a slice of toast in front of it, cut into soldiers, butter melting on them, ready to dip. Sad, the yolk's own: it is runny, broken by the cut and filled to it; it wells up
// over the cut on the far side, runs down the shell in a thick tongue, slowing as it goes, spreads on the cup's rim, and goes on
// over it, down the cup; its level in the egg drops as it runs out.
// Every frame is a pure function of t, in seconds. The still's own parts: the table, the shadow, the cup (its rim's top at y 77-99), the egg
// (its shell, its shaded side, the cut's white ring and the yolk filling it, its middle at (72.5, 32)), the cut-off top lying to the right.
import { blob, n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<rect x=\"0\" y=\"144\" width=\"200\" height=\"56\" fill=\"var(--art-violet-lit,#A68CFF)\"/>\n<path d=\"M37 172 C47 168 72 168 91 170 L147 166 L162 167 L200 183 L200 200 L91 200 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M29.2 88 C29.2 80.6 48.7 77 72.8 77 C96.9 77 116.4 80.6 116.4 88 L115.8 95 L113.5 99.5 L32 99.5 L30 95 Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<ellipse cx=\"72.8\" cy=\"87.1\" rx=\"39.7\" ry=\"9.1\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M37.7 32 C32.1 42.6 28.4 55.5 29.3 66.7 C29.8 77.4 33.3 86.6 38 92.4 C48.1 98.7 94 101.8 107.7 92.3 C113.9 84.4 116.5 72.4 115.8 60.8 C115.3 49.4 112.2 39.6 107.3 31.3 C101.9 21.2 48.2 20.6 37.7 32 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M37.7 32 C32.1 42.6 28.4 55.5 29.3 66.7 C29.8 77.4 33.3 86.6 38 92.4 C47.3 97 61.4 99.2 73.9 98.5 C92.5 85.5 104.5 64.3 100.8 39.3 C86.6 30.7 53.6 25.8 37.7 32 Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M107.5 31.8 C107.5 39.6 92 46.8 72.5 46.8 C53 46.8 37.3 40.5 37.3 32.7 C37.3 24.9 53 18.2 72.5 18.2 C92 18.2 107.5 24 107.5 31.8 Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M101.9 31.9 C101.9 37.9 88.6 43.2 72 43.2 C55.8 43.2 43.2 39 43.2 32.9 C43.2 26.8 56.8 21.2 73 21.2 C89.2 21.2 101.9 25.8 101.9 31.9 Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M29.2 88 C30 93.7 48.1 98.4 72.8 98.4 C96.6 98.4 114 93.8 116.4 88 C116.6 107.3 107.8 122.5 93.3 134.2 C88.1 138.4 85.4 143.2 85.5 148 C85.7 155.3 90.6 159.4 98.4 164.3 C105.8 168.9 109.5 172.5 106.1 175 C101.3 178.6 88.3 179.7 72.8 179.7 C55.5 179.7 42 177.7 37.8 173 C34.3 169.1 39.8 164.4 47.6 159.8 C54 156 57.1 150.8 56.8 145.4 C56.6 140.4 54.1 136.1 49.5 132 C35.9 120.1 29.2 105.6 29.2 88 Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M116.4 88 C114.7 92.3 108.2 95.3 100 97.9 C95.9 111.4 87.3 122.8 75.7 133.6 C69.8 139.1 68.1 145.5 69.9 151.8 C71.8 158.7 78.2 163.6 81 170.5 C82.7 174.5 82.5 177.1 79.2 179.6 C91.9 179.2 102.2 177.9 106.1 175 C109.5 172.5 105.8 168.9 98.4 164.3 C90.6 159.4 85.7 155.3 85.5 148 C85.4 143.2 88.1 138.4 93.3 134.2 C107.8 122.5 116.6 107.3 116.4 88 Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M97.7 169.6 C98.7 160.7 106.8 147.6 116.7 140.1 C122.1 136.1 127.5 134.3 132.5 134.8 C146.6 135.3 161.4 151.7 165.6 167.9 C166 169.5 166.1 170.6 165.6 171.5 C163.2 177 146.9 179.8 132.1 179.8 C117.2 179.8 103.5 177.2 98.8 173 C97.6 172 97.3 171.1 97.7 169.6 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M97.7 169.6 C98.7 160.7 106.8 147.6 116.7 140.1 C121.9 136.2 127 134.4 132.1 134.8 C144.3 140.4 153.7 157.6 147.9 178.6 C142.9 179.4 137.4 179.8 132.1 179.8 C117.2 179.8 103.5 177.2 98.8 173 C97.6 172 97.3 171.1 97.7 169.6 Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n</svg>\n";
export const STILL_HASH = "6bcb489642";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 13 || !EL[8].includes("M101.9 31.9")) throw new Error("egg: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const rect = (x, y, w, h, tone) => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" ${fill(tone)}/>`;

// ---- happy: back a little, to the toast
// the table and the egg's shadow carried on past the frame; in front, nearer, a plate (seen more from above, being nearer: K, its depth on
// the screen per unit) with a slice of toast on it cut into four soldiers, a pat of butter melting on them; the slice's crust round its
// edge and its loaf-top at the back, its thickness (the crust's front face) and its short shadow on the plate down the light
const WORLD = rect(-400, -400, 1200, 544, "violet") + rect(-400, 144, 1200, 400, "violet-lit")
  + `<path d="M37 172C47 168 72 168 91 170L147 166L162 167L400 267.2V360.2L91 200Z" ${fill("violet-deep")}/>`;
const PLATE = [40, 282], PR = 150, K = 0.5, SLICE = [14, -40], T = 9;
const LOAF = "M-58 67Q-62 67-62 62L-62-28C-71-36-71-58-50-64C-30-70 30-70 50-64C71-58 71-36 62-28L62 62Q62 67 58 67Z";
const on = (dx, dy, k = 1) => `translate(${PLATE[0] + SLICE[0] + dx} ${PLATE[1] + SLICE[1] * K + dy}) scale(${k} ${K * k})`;
const loaf = (tr, tone) => `<path transform="${tr}" d="${LOAF}" ${fill(tone)}/>`;
const CUTS = [-31, 0, 31].map((x) => `<rect x="${PLATE[0] + SLICE[0] + x - 2}" y="200" width="4" height="200"/>`).join("");
const PLATE_SVG = `<ellipse cx="${PLATE[0] + 6}" cy="${PLATE[1] + 5}" rx="${PR + 2}" ry="${PR * K + 2}" ${fill("violet-deep")}/>`
  + `<ellipse cx="${PLATE[0]}" cy="${PLATE[1]}" rx="${PR}" ry="${PR * K}" ${fill("paper-deep")}/><ellipse cx="${PLATE[0]}" cy="${PLATE[1] - 1}" rx="${PR - 18}" ry="${(PR - 18) * K}" ${fill("paper")}/>`
  + loaf(on(10, T + 3), "paper-deep") + loaf(on(0, T), "bark") + loaf(on(0, 0), "wood-deep") + loaf(on(0, -0.5, 0.9), "wood")
  // (the butter, softening into the toast where it lies across two soldiers)
  + `<path transform="${on(0, 0)}" d="M-14-10C-6-15 12-14 16-8C19-2 18 12 10 15C2 18-12 16-16 9C-19 3-20-6-14-10Z" ${fill("sun-lit")}/>`
  + `<clipPath id="ct"><path transform="${on(0, 0)}" d="${LOAF}"/><path transform="${on(0, T)}" d="${LOAF}"/></clipPath><g clip-path="url(#ct)" ${fill("paper")}>${CUTS}</g>`;
const cam = (cx, cy, z) => `translate(100 100) scale(${n4(z)}) translate(${n2(-cx)} ${n2(-cy)})`;
const HAPPY_DUR = 2.7;
function happy(t) {
  if (t <= 0) return STILL;
  const u = track([[0.2, 0], [2.2, 1, "io"]], t), z = 1 + (0.75 - 1) * u;
  return `${OPEN}<g transform="${cam(100, 100 + 43.5 * u, z)}">${WORLD}${PLATE_SVG}${EL.slice(3).join("")}</g></svg>`;
}

// ---- sad: the yolk runs over
const SAD_DUR = 2.8;
// the yolk's tongue: spilling over the cut on the far right side of the ring in a broad lip (its top in the yolk's own surface), narrowing
// down the shell (whose edge runs from (107, 33) to (115, 60) and on to the cup's rim at y 88), its edges never quite straight, its front a
// rounded bead, slowing as it goes
function tongue(reach, w) {
  if (reach < 0.2) return "";
  const P = [], Q = [], n = 14;
  for (let i = 0; i <= n; i++) {
    const f = i / n, y = 30 + reach * f, x = 101 + 12 * Math.sin(Math.min(1, (y - 30) / 40) * Math.PI / 2) - 0.08 * Math.max(0, y - 70);
    const ww = w * (1.6 - 0.9 * Math.sqrt(f)) * (1 + 0.07 * Math.sin(f * 11));
    P.push([x - ww, y]); Q.push([x + ww * 0.5, y]);
  }
  const end = P[n], r = (Q[n][0] - end[0]) / 2;
  // (its top a bulge over the cut, rising from the yolk's surface)
  const top = `C${n2(Q[0][0] - 0.5)} ${n2(Q[0][1] - 3.2)} ${n2(P[0][0] + 7)} ${n2(P[0][1] - 3.6)} ${n2(P[0][0])} ${n2(P[0][1])}`;
  return `<path d="M${[...P, ...Q.reverse()].map((p) => `${n2(p[0])} ${n2(p[1])}`).join(" ")}${top}Z" ${fill("sun")}/>`
    + `<ellipse cx="${n2(end[0] + r)}" cy="${n2(end[1])}" rx="${n2(r * 1.25)}" ry="${n2(r * 1.4)}" ${fill("sun")}/>`;
}
// the yolk gathering where the shell meets the cup's front rim (the rim's edge: from (72.8, 98.4) curving up to (116.4, 88)), from where the
// tongue reaches it out along the rim both ways, thickest there, and a little over the edge
const RIM = [[72.8, 98.4], [96.6, 98.4], [114, 93.8], [116.4, 88]];
const onRim = (u) => [0, 1].map((j) => (1 - u) ** 3 * RIM[0][j] + 3 * (1 - u) ** 2 * u * RIM[1][j] + 3 * (1 - u) * u * u * RIM[2][j] + u ** 3 * RIM[3][j]);
function rimPool(k) {
  const U0 = 0.86, a = U0 - 0.36 * k, b = Math.min(0.995, U0 + 0.12 * k), A = [], B = [], n = 10;
  for (let i = 0; i <= n; i++) {
    const u = a + ((b - a) * i) / n, th = k * (0.35 + 0.65 * Math.exp(-(((u - U0) / 0.12) ** 2))), [x, y] = onRim(u);
    A.push([x, y - 3.2 * th]); B.push([x, y + 3.4 * th]);
  }
  return `<path d="${blob([...A, ...B.reverse()])}" ${fill("sun")}/>`;
}
// over the cup's rim and down the front of its bowl, close in by its shaded edge (the bowl's edge: (116, 88) curving in to (106, 120))
function drip(k) {
  if (k < 0.01) return "";
  const P = [], Q = [], n = 8, len = 28 * k;
  for (let i = 0; i <= n; i++) {
    const y = 95 + (len * i) / n, d = (y - 95) / 28, x = 109.5 - 5 * d - 3 * d * d, ww = 3.2 * Math.min(1, k * 4) * (1 - 0.3 * (i / n)) * (1 + 0.1 * Math.sin(i * 1.9));
    P.push([x - ww, y]); Q.push([x + ww, y]);
  }
  const e = P[n], r = Q[n][0] - e[0];
  return `<path d="M${[...P, ...Q.reverse()].map((p) => `${n2(p[0])} ${n2(p[1])}`).join(" ")}Z" ${fill("sun")}/><ellipse cx="${n2(e[0] + r / 2)}" cy="${n2(e[1])}" rx="${n2(r * 0.62)}" ry="${n2(r * 0.75)}" ${fill("sun")}/>`;
}
function sad(t) {
  if (t <= 0) return STILL;
  // the yolk swells a hair over the cut, then breaks over the far edge and runs: fast at first, slower as it thickens and cools; its level
  // in the egg drops as it runs out; where it reaches the cup it spreads on the rim, then goes over and runs down the bowl
  const swell = track([[0.25, 0], [0.75, 1, "io"], [1.6, 0.3, "io"]], t), sink = track([[1.0, 0], [2.4, 1, "io"]], t);
  const reach = track([[0.6, 0], [1.3, 36, "out"], [1.9, 56, "out"]], t), w = track([[0.6, 2], [1.2, 6.5, "io"]], t);
  const pool = track([[1.75, 0], [2.4, 1, "out"]], t), down = track([[2.05, 0], [SAD_DUR, 1, "out"]], t);
  const d = `M101.9 ${n2(31.9 - swell)}C101.9 ${n2(37.9 - swell * 0.4)} 88.6 43.2 72 43.2C55.8 43.2 43.2 39 43.2 32.9C43.2 ${n2(26.8 - swell * 1.6)} 56.8 ${n2(21.2 - swell * 1.6)} 73 ${n2(21.2 - swell * 1.6)}C89.2 ${n2(21.2 - swell * 1.6)} 101.9 ${n2(25.8 - swell * 1.6)} 101.9 ${n2(31.9 - swell)}Z`;
  const yolk = EL[8].replace(/d="[^"]+"/, `d="${d}"${sink > 0.004 ? ` transform="translate(72.5 ${n2(32 + 2.5 * sink)}) scale(${n4(1 - 0.08 * sink)}) translate(-72.5 -32)"` : ""}`);
  const spread = pool > 0.004 ? rimPool(pool) : "";
  const run = tongue(reach, w);
  return `${OPEN}${EL.slice(0, 8).join("")}${yolk}${EL.slice(9).join("")}${spread}${drip(down)}${run}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
