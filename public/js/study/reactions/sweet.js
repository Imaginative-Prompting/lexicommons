// Sweet's two stories, the honey dipper's: the still has it over the pot with nothing holding it, so it falls. Happy: its head drops into the honey,
// sinks in, a ring of honey closing round it, and the handle comes down to rest across the far rim: parked. Sad: its head comes down on the near lip
// instead, tips over it, and the sticky dipper slides off down the front of the pot, wiping a streak of honey down it, and drops onto the table in
// front, a little pool of honey under its head.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall and table, the shadows, the pot (its body, its shaded side, its rim
// about (97, 92), 35 by 10, its inner wall, the honey 28 by 5.8 at y 93.6), the dipper (its handle up to (177, 44) and its honey-coated head about
// (99, 79)), the honey strand from the head to the honey, the two sugar cubes, the wrapped sweet.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<rect y=\"140\" width=\"200\" height=\"60\" fill=\"var(--art-violet-lit,#A68CFF)\"/>\n<path d=\"M76 159C84 168 112 171 138 168C150 166 150 159 138 155L124 153Z\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<polygon points=\"22,159 38,166 52,159 57,161 43,169 27,162\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M140 168C148 174 162 173 172 162L164 158Z\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M66 96C56 106 53 138 72 156Q80 163 97 163Q114 163 122 156C141 138 138 106 128 96Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M119 96L128 96C138 106 141 138 122 156Q114 163 97 163C113 150 122 126 119 96Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<ellipse cx=\"97\" cy=\"92\" rx=\"35\" ry=\"10\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<ellipse cx=\"97\" cy=\"92\" rx=\"30\" ry=\"7.5\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<ellipse cx=\"97\" cy=\"93.6\" rx=\"28\" ry=\"5.8\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M105.8 71.4L174.8 41.3A3 3 0 0 1 177.2 46.8L108.2 76.9Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M105.8 71.4L174.8 41.3A3 3 0 0 1 176.5 45.3L107.5 75.4Z\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M106.8 68.5C101 66 92 67 87.1 76Q85 81 92.7 88.8C97 90.5 105 88.5 111.6 79.5Q113 73 106.8 68.5Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M92.7 88.8C97 90.5 105 88.5 111.6 79.5Q113 73 106.8 68.5Q110 74 108 79C103 86 97 87 92.7 88.8Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<polygon points=\"91,74.3 95.8,85.3 97.2,84.7 92.4,73.7\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<polygon points=\"94.7,71.6 100.3,84.4 101.8,83.8 96.2,71\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<polygon points=\"99.7,70.5 104.5,81.5 105.9,80.9 101.1,69.9\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M95 86C95.5 89 94 91 92 93.5Q99 95.5 106 93.5C103 91 101.5 89 101.5 85.5Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<polygon points=\"22,140 38,147 38,166 22,159\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<polygon points=\"38,147 52,140 52,159 38,166\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<polygon points=\"22,140 36,133 52,140 38,147\" fill=\"var(--art-paper-mid,#EDE6D5)\"/>\n<polygon points=\"28,118 41,125 41,143 28,136\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<polygon points=\"41,125 54,120 54,138 41,143\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<polygon points=\"28,118 41,113 54,120 41,125\" fill=\"var(--art-paper-mid,#EDE6D5)\"/>\n<path d=\"M160.2 151.1L163 150.3C164.5 146 165 143 167.4 141.1Q172 142.5 172.5 146.5Q171 148.5 174.5 150.5Q177 152.5 176.1 154.7C171 154.5 167.5 154 164.2 153.1L161.8 154.7Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M164 152L172 147.5L176.1 154.7C171 154.5 167.5 154 164.2 153.1Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M138.2 161.3L135.8 163C133 161.5 129 160.5 124.9 161Q124 164.5 127.5 166.5Q125.5 169.5 128.5 171.5Q130.5 173.5 132.6 175C134 171 135.5 168 137 165.8L139.8 164.9Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M136.4 164.4L129.5 168.5L132.6 175C134 171 135.5 168 137 165.8Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M161.8 152.5C164.1 157.5 160.7 164.1 154.2 167.1C147.7 170.1 140.5 168.5 138.2 163.5C135.9 158.5 139.3 151.9 145.8 148.9C152.3 145.9 159.5 147.5 161.8 152.5Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M155.4 147.7C158.3 148.4 160.7 150 161.8 152.5C164.1 157.5 160.7 164.1 154.2 167.1C150 161 153 154 155.4 147.7Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n</svg>\n";
export const STILL_HASH = "f88798b0f4";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 30 || !EL[10].includes("M105.8 71.4L174.8 41.3")) throw new Error("sweet: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BACK = EL.slice(0, 5).join(""), POT = EL[5] + EL[6], MOUTH = EL[7] + EL[8] + EL[9], DIPPER = EL.slice(10, 17).join("");
const CUBES = EL.slice(18, 24).join(""), CANDY = EL.slice(24).join("");
const HEAD = [99, 79];
const G = 4300; // the pot is 10 cm across, 70 here
const placed = (dx, dy, a) => `<g transform="translate(${n2(dx)} ${n2(dy)}) rotate(${n2(a)} ${HEAD[0]} ${HEAD[1]})">${DIPPER}</g>`;
// the strand of honey from the head down to the surface, shortening as the head comes down to it
const strand = (dy) => (dy >= 7.6 ? "" : dy < 0.01 ? EL[17] : EL[17].replace(/d="[^"]+"/, `d="M95 ${n2(86 + dy)}C95.5 ${n2(89 + dy * 0.6)} 94 91 92 93.5Q99 95.5 106 93.5C103 91 101.5 ${n2(89 + dy * 0.6)} 101.5 ${n2(85.5 + dy)}Z"`));

// ---- happy: into the honey, parked on the rim
const HAPPY_DUR = 2.4, T0 = 0.3, IN_DY = 15, REST = [-4, 16, 9];
function happy(t) {
  if (t <= 0) return STILL;
  // it falls from rest; its head meets the honey and slows in it; the handle comes down onto the far rim and rocks once to rest there
  const s = Math.max(0, t - T0), tf = Math.sqrt((2 * IN_DY) / G);
  const k = s < tf ? (0.5 * G * s * s) / IN_DY : 1;
  const sink = track([[T0 + tf, 0], [T0 + tf + 0.35, 1, "out"]], t);
  const dy = k * IN_DY + (REST[1] - IN_DY) * sink, dx = REST[0] * sink;
  const a = track([[T0 + tf, 0], [T0 + tf + 0.28, REST[2] + 1.6, "in"], [T0 + tf + 0.42, REST[2] - 0.8, "io"], [T0 + tf + 0.56, REST[2], "io"]], t);
  // (the head's lower part under the honey: clipped at the surface; a lip of honey round it where it went in)
  const lip = sink > 0.01 ? `<ellipse cx="${n2(HEAD[0] + dx - 1)}" cy="${n2(94.2)}" rx="${n2(14 * sink)}" ry="${n2(2.6 * sink)}" ${fill("sun")}/>` : "";
  // (only the head goes under: the handle stays whole; the cut is there from the start and only bites once the head reaches the surface)
  const tr = `translate(${n2(dx)} ${n2(dy)}) rotate(${n2(a)} ${HEAD[0]} ${HEAD[1]})`;
  const dip = `<g transform="${tr}">${EL[10]}${EL[11]}</g><clipPath id="hn"><rect x="0" y="0" width="200" height="94.2"/></clipPath><g clip-path="url(#hn)"><g transform="${tr}">${EL.slice(12, 17).join("")}</g></g>`;
  return `${OPEN}${BACK}${POT}${MOUTH}${dip}${lip}${strand(dy)}${CUBES}${CANDY}</svg>`;
}

// ---- sad: off the lip, onto the table
const SAD_DUR = 2.6;
// where the head goes and how the dipper turns: down onto the near lip, over it, down the pot's front, off onto the table, a bounce, rest
const PATH = [[T0, 0, 0, 0], [0.5, 0, 17, 0, "in"], [0.62, 1, 26, 8, "io"], [0.8, -1, 58, 20, "in"], [0.93, -14, 103, 31, "in"], [1.02, -14, 99, 28, "out"], [1.1, -14, 103, 29.5, "in"]];
const along = (i, t) => track(PATH.map((p, j) => (j ? [p[0], p[i], p[4]] : [p[0], p[i]])), t);
function sad(t) {
  if (t <= 0) return STILL;
  const dx = along(1, t), dy = along(2, t), a = along(3, t);
  // the honey it leaves: a streak down the pot's front from the lip to as low as the head has gone (on the pot, below the rim), then a small pool
  // spreading on the table under the head once it's down
  const low = Math.min(146, HEAD[1] + dy + 6);
  let streak = "";
  if (dy > 22) {
    // honey's own shape: wide where the dipper went over the lip, narrowing as it runs, its edges a little uneven, a bead hanging at its end; lit on
    // its left, shaded down its right
    const n = 8, L = [], R = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n, y = 101 + (low - 101) * f, w = 11 - 7.5 * f ** 0.8 + 0.9 * Math.sin(f * 9.5), cx = 98.5 + dx * 0.25 * f - 1.2 * Math.sin(f * 5);
      L.push([cx - w, y]); R.push([cx + w * 0.92, y]);
    }
    const P = (A) => A.map((p) => `${n2(p[0])} ${n2(p[1])}`).join("L"), end = [(L[n][0] + R[n][0]) / 2, low];
    streak = `<path d="M${P(L)}L${P([...R].reverse())}Z" ${fill("sun")}/><path d="M${P(R.map(([x, y], i) => [x - 2.4 + 0.25 * i, y]))}L${P([...R].reverse())}Z" ${fill("sun-deep")}/>`
      + `<ellipse cx="${n2(end[0])}" cy="${n2(end[1] + 2.6)}" rx="3.6" ry="4.2" ${fill("sun")}/><ellipse cx="${n2(end[0] + 1.4)}" cy="${n2(end[1] + 3.2)}" rx="1.6" ry="2.6" ${fill("sun-deep")}/>`;
  }
  const pool = track([[1.0, 0], [1.9, 1, "out"]], t);
  // (the pool spreading out from under its head, past it on every side)
  const puddle = pool > 0.01 ? `<ellipse cx="${n2(HEAD[0] - 16)}" cy="${n2(HEAD[1] + 103 + 9)}" rx="${n2(23 * pool)}" ry="${n2(5.5 * pool)}" ${fill("sun-deep")}/><ellipse cx="${n2(HEAD[0] - 17)}" cy="${n2(HEAD[1] + 103 + 8.4)}" rx="${n2(19 * pool)}" ry="${n2(4.2 * pool)}" ${fill("sun")}/>` : "";
  // (in the still's order: where it lies, on the table in front, it clears the cubes and the sweet)
  return `${OPEN}${BACK}${POT}${streak}${MOUTH}${puddle}${placed(dx, dy, a)}${strand(dy)}${CUBES}${CANDY}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
