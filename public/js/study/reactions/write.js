// Write's two stories. Sad, the pen's own: laid down uncapped with its nib still on the end of the last stroke, it goes on giving ink;
// the paper draws it out of the nib, and a blot spreads from under the tip, slowing as it goes, and swallows the end of the line. Happy,
// the camera's: easing back and down it finds, on the table nearer us, the envelope it is for, already addressed in the same hand and
// stamped, waiting for the letter.
// Every frame is a pure function of t, in seconds. The still's own world, carried on past its edges: the wall above y 92, the table below,
// the sheet (lying in perspective: its sides run back toward a point at (-13, -192)), the pen across it, the cap; their short shadows
// fall down and to the right.
import { blob, n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect y=\"92\" width=\"200\" height=\"108\" fill=\"var(--art-violet-lit,#A68CFF)\"/><polygon points=\"36.5,105 134.5,101 168.5,169 48.5,180\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M16.9,176.5L50,184.3A6.2 2.6 103 0 1 47.2,196.3L14.1,188.5A6.2 6.2 0 0 1 16.9,176.5Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M117.2,152.9L188.2,169.6A5.5 5.5 0 0 1 185.6,180.4L114.6,163.7Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><polygon points=\"35,103.8 133,99.8 167,167.8 47,178.8\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"34,102 132,98 166,166 46,177\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M44,119.2C50,119.4 55,117 60.8,116.9C66.6,116.8 70,117.6 74.8,116.2C79.6,114.8 84,116.9 88.8,115.5C93.6,114.1 100,115.8 106,112.8L106,114.4C100,117.4 93.6,115.7 88.8,117.1C84,118.5 79.6,116.4 74.8,117.8C70,119.2 66.6,118.4 60.8,118.5C55,118.6 50,121 44,120.8ZM48,134.4C54,134.6 59,132.4 64.8,132C70.6,131.6 76,132.6 80.8,131.2C85.6,129.8 96,131.6 104,128.4L104,130C96,133.2 85.6,131.4 80.8,132.8C76,134.2 70.6,133.2 64.8,133.6C59,134 54,136.2 48,136ZM54,151.6C60,151.8 64,149.6 68.8,149C73.6,148.4 80,150.4 86,149.4C89,148.6 91,148.5 93,148.6L93,150.2C91,150.1 89,150.2 86,151C80,152 73.6,150 68.8,150.6C64,151.2 60,153.4 54,153.2Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path fill-rule=\"evenodd\" d=\"M58.6,117.1A4.4 3.2 -40 1 1 65.4,111.5A4.4 3.2 -40 1 1 58.6,117.1ZM59.8,116.1A2.8 1.6 -40 1 1 64.2,112.5A2.8 1.6 -40 1 1 59.8,116.1ZM72.6,116.4A4.4 3.2 -40 1 1 79.4,110.8A4.4 3.2 -40 1 1 72.6,116.4ZM73.8,115.4A2.8 1.6 -40 1 1 78.2,111.8A2.8 1.6 -40 1 1 73.8,115.4ZM86.6,115.7A4.4 3.2 -40 1 1 93.4,110.1A4.4 3.2 -40 1 1 86.6,115.7ZM87.8,114.7A2.8 1.6 -40 1 1 92.2,111.1A2.8 1.6 -40 1 1 87.8,114.7ZM62.6,132.1A4.4 3.2 -40 1 1 69.4,126.5A4.4 3.2 -40 1 1 62.6,132.1ZM63.8,131.1A2.8 1.6 -40 1 1 68.2,127.5A2.8 1.6 -40 1 1 63.8,131.1ZM78.6,131.3A4.4 3.2 -40 1 1 85.4,125.7A4.4 3.2 -40 1 1 78.6,131.3ZM79.8,130.3A2.8 1.6 -40 1 1 84.2,126.7A2.8 1.6 -40 1 1 79.8,130.3ZM66.6,149.2A4.4 3.2 -40 1 1 73.4,143.6A4.4 3.2 -40 1 1 66.6,149.2ZM67.8,148.2A2.8 1.6 -40 1 1 72.2,144.6A2.8 1.6 -40 1 1 67.8,148.2Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M92.4,149.4Q101.5,157.2 109.6,160.6L111.2,162.7L137.3,168.6L147.2,167.7L130,158L100,151Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M15.4,173L48.5,180.8L45.7,192.8L12.6,185A6.2 6.2 0 0 1 15.4,173Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M13.9,179.5L47,187.3L45.7,192.8L12.6,185A6.2 6.2 0 0 1 7.9,178.1Z\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"41.7,179.1 48.6,180.7 45.6,192.9 38.9,191.3\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"40.2,185.7 47,187.3 45.6,192.9 38.9,191.3\" fill=\"var(--art-sun-deep,#DB9A22)\"/><polygon points=\"44.6,183.1 45,181.4 24.5,178 24.1,179.7\" fill=\"var(--art-sun,#F7BE45)\"/><circle cx=\"23.4\" cy=\"178.7\" r=\"1.6\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M48.5,180.8A6.2 2.6 103 0 1 45.7,192.8A6.2 2.6 103 0 1 48.5,180.8Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M47.9,182.1A4.8 1.9 103 0 1 45.8,191.4A4.8 1.9 103 0 1 47.9,182.1Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M92,149Q102.5,147.9 110.4,149.2L113.3,149.9L111.5,157.7L108.6,157Q100.9,154.7 92,149Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M92,149L112.4,153.8L111.5,157.7L108.6,157Q100.9,154.7 92,149Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><polygon points=\"92.4,149.1 102.8,151.1 102.6,151.9\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"103.7\" cy=\"151.7\" r=\"1.1\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M115.7,148.9L186.7,165.6A5.5 5.5 0 0 1 184.1,176.4L113.1,159.7Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M114.3,154.8L190.7,172.7A5.5 5.5 0 0 1 184.1,176.4L113.1,159.7Z\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"112.8,148 116.7,148.9 114.1,160.1 110.2,159.2\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"111.4,154.1 115.3,155 114.1,160.1 110.2,159.2\" fill=\"var(--art-sun-deep,#DB9A22)\"/><polygon points=\"173.1,162.2 177,163.1 174.4,174.3 170.5,173.4\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"171.7,168.3 175.6,169.2 174.4,174.3 170.5,173.4\" fill=\"var(--art-sun-deep,#DB9A22)\"/></svg>\n";
export const STILL_HASH = "a6a8cdc372";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 28 || !EL[6].includes('points="34,102 132,98 166,166 46,177"')) throw new Error("write: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const pts = (P) => P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
const rect = (x, y, w, h, tone) => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" ${fill(tone)}/>`;
// the sheet, its writing and the nib's shadow on it (under where the ink spreads: on dark ink that shadow would not show), then the pen and
// the cap over them
const PAPER = EL.slice(2, 10).join(""), PEN_AND_CAP = EL.slice(10).join("");

// ---- sad: the blot, from under the nib's tip, round in the paper (seen at the sheet's slant), its edge a little ragged where the fibres
// draw it on unevenly
const SAD_DUR = 2.6, TIP = [92.6, 149.6];
const EDGE = [1, 0.96, 1.03, 1.06, 0.98, 0.94, 1.01, 1.05, 1.02, 0.95, 0.97, 1.04, 1.07, 0.99, 0.95, 1.02];
function blot(r) {
  const P = EDGE.map((k, i) => { const a = (i / EDGE.length) * 2 * Math.PI; return [TIP[0] + Math.cos(a) * r * k, TIP[1] + Math.sin(a) * r * k * 0.7]; });
  return `<path d="${blob(P)}" ${fill("ink-lit")}/>`;
}
function sad(t) {
  if (t <= 0) return STILL;
  // a bead of ink at the tip first, then drawn out into the paper, fast and then slower (the wet edge has further to pull it)
  const r = track([[0.25, 0], [0.6, 2.2, "in"], [1.4, 7.6, "out"], [2.3, 10.4, "out"]], t);
  return `${OPEN}${EL[0]}${EL[1]}${PAPER}${r > 0.01 ? blot(r) : ""}${PEN_AND_CAP}</svg>`;
}

// ---- happy: the envelope, lying on the table nearer us than the letter, in the sheet's own slant (wholly below the still's frame)
const VP = [-13, -192];
const toward = ([x, y], d) => { const dx = VP[0] - x, dy = VP[1] - y, l = Math.hypot(dx, dy); return [x + (dx / l) * d, y + (dy / l) * d]; };
const A = [95, 252], B = [185, 246], C = toward(A, 45), D = toward(B, 45);
// a point on it: s across (left to right), d back (near to far)
const at = (s, d) => [0, 1].map((j) => (1 - d) * ((1 - s) * A[j] + s * B[j]) + d * ((1 - s) * C[j] + s * D[j]));
const quad = (s0, s1, d0, d1) => [at(s0, d0), at(s1, d0), at(s1, d1), at(s0, d1)];
// the address: three short lines in the letter's own hand (a run of ink with a loop or two), smaller
function hand(s0, s1, d, loops) {
  const n = 10, top = [], bot = [];
  for (let i = 0; i <= n; i++) { const s = s0 + ((s1 - s0) * i) / n, w = 0.012 * Math.sin(i * 1.7); top.push(at(s, d + w + 0.012)); bot.push(at(s, d + w - 0.012)); }
  const line = `M${pts([...top, ...bot.reverse()]).replace(/,/g, " ")}Z`;
  const rings = loops.map((s) => { const [x, y] = at(s, d + 0.06); return `M${n2(x - 2.4)} ${n2(y + 1.6)}A2.7 1.9 -40 1 1 ${n2(x + 2.4)} ${n2(y - 1.6)}A2.7 1.9 -40 1 1 ${n2(x - 2.4)} ${n2(y + 1.6)}ZM${n2(x - 1.6)} ${n2(y + 1)}A1.7 1 -40 1 1 ${n2(x + 1.6)} ${n2(y - 1)}A1.7 1 -40 1 1 ${n2(x - 1.6)} ${n2(y + 1)}Z`; }).join("");
  return line + rings;
}
const ENVELOPE = [
  `<polygon points="${pts(quad(0, 1, 0, 1).map(([x, y]) => [x + 1.2, y + 2]))}" ${fill("violet-deep")}/>`,
  `<polygon points="${pts(quad(0, 1, 0, 1).map(([x, y], i) => (i < 2 ? [x, y + 1.6] : [x, y])))}" ${fill("paper-deep")}/>`,
  `<polygon points="${pts(quad(0, 1, 0, 1))}" ${fill("paper-mid")}/>`,
  // the stamp in its corner: its white border, its picture (a sun over a hill)
  `<polygon points="${pts(quad(0.8, 0.95, 0.6, 0.93))}" ${fill("paper")}/>`,
  `<polygon points="${pts(quad(0.815, 0.935, 0.64, 0.89))}" ${fill("sky")}/>`,
  `<polygon points="${pts([at(0.815, 0.64), at(0.935, 0.64), at(0.935, 0.72), at(0.875, 0.76), at(0.815, 0.7)])}" ${fill("teal-deep")}/>`,
  `<ellipse cx="${n2(at(0.895, 0.81)[0])}" cy="${n2(at(0.895, 0.81)[1])}" rx="1.9" ry="1.5" ${fill("sun")}/>`,
  `<path fill-rule="evenodd" d="${hand(0.3, 0.72, 0.52, [0.42, 0.56]) + hand(0.34, 0.68, 0.36, [0.5]) + hand(0.38, 0.62, 0.2, [0.47])}" ${fill("ink-lit")}/>`,
].join("");
// the world past the still's edges: the wall, the table
const WORLD = rect(-400, -400, 1000, 492, "violet") + rect(-400, 92, 1000, 600, "violet-lit");
const cam = (cx, cy, z) => `translate(100 100) scale(${n4(z)}) translate(${n2(-cx)} ${n2(-cy)})`;
const HAPPY_DUR = 2.7;
function happy(t) {
  if (t <= 0) return STILL;
  const u = track([[0.2, 0], [2.2, 1, "io"]], t), z = 1 + (0.74 - 1) * u;
  return `${OPEN}<g transform="${cam(100 + 15 * u, 100 + 50 * u, z)}">${WORLD}${PAPER}${ENVELOPE}${PEN_AND_CAP}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
