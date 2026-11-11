// Rich's two stories, the overstuffed wallet's: its coin pocket is crammed, and the leather of its lip gives a little under the pressure. Happy: the
// crowded coins slip down inside it and settle, packed in, the gold crown at its mouth dropping a coin's height. Sad: three at the front tip out over
// the eased lip instead; they fall down the pocket's front, each lands on the floor, bounces once and goes down flat; the rest settle inside.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor, the shadow, the wallet (its back, its dark inside, its
// side), the seven coins crowding the pocket's mouth (each its edge and its face), the card side and its slots, the pocket's front (over the coins'
// lower halves), the coin standing at the right, the two stacks in front, the coin on the right stack. A coin (2.4 cm) is 20 here.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect y=\"136\" width=\"200\" height=\"64\" fill=\"var(--art-violet-lit,#A68CFF)\"/><path d=\"M44,160L176,157Q186,160 194,166Q197,171 190,172L132,173Q122,172 118,166Z\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M26,84C26,79 29,77 34,75C58,67 84,59 106,55.5C128,52.5 152,55 164,61C172,65 177,71 177,79L177,156Q177,161 172,161L31,161Q26,161 26,156Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M31,82Q31,79.5 34,78.6C58,71 84,63.5 106,60C128,57 150,59.5 160,65C167,69 172,74 172,82L172,120L31,120Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M165,79C171,78 176,82 177,88L177,155Q177,161 171,161L159,161C156,140 157,100 165,79Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M113.7,55.7A10 8.5 -10 0 1 133.3,52.3A10 8.5 -10 0 1 113.7,55.7Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M112.2,53.7A10 8.5 -10 0 1 131.8,50.3A10 8.5 -10 0 1 112.2,53.7Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M139.8,54.4A10 8.5 15 0 1 159.2,59.6A10 8.5 15 0 1 139.8,54.4Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M138.3,52.4A10 8.5 15 0 1 157.7,57.6A10 8.5 15 0 1 138.3,52.4Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M93.2,69.8A11 9.5 -20 0 1 113.8,62.2A11 9.5 -20 0 1 93.2,69.8Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M91.7,67.8A11 9.5 -20 0 1 112.3,60.2A11 9.5 -20 0 1 91.7,67.8Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M115.6,67.3A12 10 8 0 1 139.4,70.7A12 10 8 0 1 115.6,67.3Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M114.1,65.3A12 10 8 0 1 137.9,68.7A12 10 8 0 1 114.1,65.3Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M146.9,78.8A11 9.5 -15 0 1 168.1,73.2A11 9.5 -15 0 1 146.9,78.8Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M145.4,76.8A11 9.5 -15 0 1 166.6,71.2A11 9.5 -15 0 1 145.4,76.8Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M99.5,81A12 10.5 5 0 1 123.5,83A12 10.5 5 0 1 99.5,81Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M98,79A12 10.5 5 0 1 122,81A12 10.5 5 0 1 98,79Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M129.6,84.7A12 10 -8 0 1 153.4,81.3A12 10 -8 0 1 129.6,84.7Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M128.1,82.7A12 10 -8 0 1 151.9,79.3A12 10 -8 0 1 128.1,82.7Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M26,94C26,89 29,87 33,86C54,81 74,76 92,72L92,161L31,161Q26,161 26,156Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M36,97L86,84.4Q87.6,85.4 86,87L36,99.6Q34.4,98.6 36,97Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M36,106L86,93.4Q87.6,94.4 86,96L36,108.6Q34.4,107.6 36,106Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M36,115L86,102.4Q87.6,103.4 86,105L36,117.6Q34.4,116.6 36,115Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M89,71.5L91.5,71L93.5,161L91,161Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M91,71C95,74 99,90 109,92C126,93.5 148,88 160,83Q164,81 167,80C159,100 158,140 161,161L93,161Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M119.6,148.8A11 13.5 6 0 1 141.4,151.2A11 13.5 6 0 1 119.6,148.8Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M117.1,148.3A11 13.5 6 0 1 138.9,150.7A11 13.5 6 0 1 117.1,148.3Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M50,149.4A18 6 0 0 1 86,149.4L86,158A18 6 0 0 1 50,158Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M50,149.4A18 6 0 0 1 81,145.2L81,160.9A18 6 0 0 1 50,156.7Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M50.8,140.8A18 6 0 0 1 86.8,140.8L86.8,149.4A18 6 0 0 1 50.8,149.4Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M50.8,140.8A18 6 0 0 1 81.8,136.6L81.8,152.3A18 6 0 0 1 50.8,148.1Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M49.6,132.2A18 6 0 0 1 85.6,132.2L85.6,140.8A18 6 0 0 1 49.6,140.8Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M49.6,132.2A18 6 0 0 1 80.6,128L80.6,143.7A18 6 0 0 1 49.6,139.5Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M50.4,123.6A18 6 0 0 1 86.4,123.6L86.4,132.2A18 6 0 0 1 50.4,132.2Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M50.4,123.6A18 6 0 0 1 81.4,119.4L81.4,135.1A18 6 0 0 1 50.4,130.9Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M51.2,115A18 6 0 0 1 87.2,115L87.2,123.6A18 6 0 0 1 51.2,123.6Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M51.2,115A18 6 0 0 1 82.2,110.8L82.2,126.5A18 6 0 0 1 51.2,122.3Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M50,106.4A18 6 0 0 1 86,106.4L86,115A18 6 0 0 1 50,115Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M50,106.4A18 6 0 0 1 81,102.2L81,117.9A18 6 0 0 1 50,113.7Z\" fill=\"var(--art-sun,#F7BE45)\"/><ellipse cx=\"68\" cy=\"106.4\" rx=\"18\" ry=\"6\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M82,153.4A18 6 0 0 1 118,153.4L118,162A18 6 0 0 1 82,162Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M82,153.4A18 6 0 0 1 113,149.2L113,164.9A18 6 0 0 1 82,160.7Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M81.2,144.8A18 6 0 0 1 117.2,144.8L117.2,153.4A18 6 0 0 1 81.2,153.4Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M81.2,144.8A18 6 0 0 1 112.2,140.6L112.2,156.3A18 6 0 0 1 81.2,152.1Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M82.6,136.2A18 6 0 0 1 118.6,136.2L118.6,144.8A18 6 0 0 1 82.6,144.8Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M82.6,136.2A18 6 0 0 1 113.6,132L113.6,147.7A18 6 0 0 1 82.6,143.5Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M81.8,127.6A18 6 0 0 1 117.8,127.6L117.8,136.2A18 6 0 0 1 81.8,136.2Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M81.8,127.6A18 6 0 0 1 112.8,123.4L112.8,139.1A18 6 0 0 1 81.8,134.9Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M82.4,119A18 6 0 0 1 118.4,119L118.4,127.6A18 6 0 0 1 82.4,127.6Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M82.4,119A18 6 0 0 1 113.4,114.8L113.4,130.5A18 6 0 0 1 82.4,126.3Z\" fill=\"var(--art-sun,#F7BE45)\"/><ellipse cx=\"100.4\" cy=\"119\" rx=\"18\" ry=\"6\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M93.2,114.3A12 9.5 -10 0 1 116.8,110.1A12 9.5 -10 0 1 93.2,114.3Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M91.7,112.1A12 9.5 -10 0 1 115.3,107.9A12 9.5 -10 0 1 91.7,112.1Z\" fill=\"var(--art-sun,#F7BE45)\"/></svg>\n";
export const STILL_HASH = "280c92bc71";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 54 || !EL[25].includes("M91,71C95,74")) throw new Error("rich: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BACK = EL.slice(0, 6).join(""), FRONT = EL.slice(20, 26).join(""), STANDING = EL[26] + EL[27], STACKS = EL.slice(28).join("");
// the seven coins at the mouth: each its pair of shapes and its middle
const COINS = [[6, 123.5, 54], [8, 149, 56], [10, 102.8, 65], [12, 126.8, 68], [14, 157, 75], [16, 111, 81], [18, 141, 83]];
const coin = ([i], dx = 0, dy = 0) => (dx || dy ? `<g transform="translate(${n2(dx)} ${n2(dy)})">${EL[i]}${EL[i + 1]}</g>` : EL[i] + EL[i + 1]);
const G = 8300;
// the settle: the coins slipping down into the pocket as its lip eases, each a little differently
const settle = (t, i) => track([[0.4 + 0.04 * i, 0], [0.85 + 0.05 * i, 9 + (i % 3), "in"], [0.95 + 0.05 * i, 8 + (i % 3), "out"]], t);

// ---- happy: packed in
const HAPPY_DUR = 2.2;
function happy(t) {
  if (t <= 0) return STILL;
  return `${OPEN}${BACK}${COINS.map((c, i) => coin(c, 0, settle(t, i))).join("")}${FRONT}${STANDING}${STACKS}</svg>`;
}

// ---- sad: three spill out
const SAD_DUR = 2.6;
// the three that go: which coin, when it tips over the lip, where it lands on the floor
const OUT = [[4, 0.62, [170, 172]], [6, 0.7, [150, 178]], [3, 0.8, [182, 181]]];
function spill(t, [k, t0, land]) {
  const [, x0, y0] = COINS[k], s = t - t0;
  if (s <= 0) return null;
  // over the lip (rising a little, turning toward us), then falling to the floor, one low bounce, and down flat
  const tf = Math.sqrt((2 * (land[1] - y0)) / G) + 0.06;
  if (s < tf) { const k1 = s / tf, x = x0 + (land[0] - x0) * k1, y = y0 - 6 * Math.sin(Math.PI * Math.min(1, k1 * 2.2)) + (land[1] - y0) * k1 * k1; return `<g transform="translate(${n2(x - x0)} ${n2(y - y0)}) rotate(${n2(70 * k1)} ${x0} ${y0})">${EL[COINS[k][0]]}${EL[COINS[k][0] + 1]}</g>`; }
  const r = s - tf, hop = r < 0.12 ? 7 * Math.sin((Math.PI * r) / 0.12) : 0, lay = Math.min(1, r / 0.18);
  // (landed, it hops once and goes down flat: its own shapes, squashed to lie on the floor)
  const shapes = `<g transform="translate(${n2(land[0] - x0)} ${n2(land[1] - y0)}) rotate(70 ${x0} ${y0})">${EL[COINS[k][0]]}${EL[COINS[k][0] + 1]}</g>`;
  return `<g transform="translate(0 ${n2(-hop)}) translate(${land[0]} ${land[1]}) scale(1 ${n2(1 - 0.6 * lay)}) translate(${-land[0]} ${-land[1]})">${shapes}</g>`;
}
function sad(t) {
  if (t <= 0) return STILL;
  const going = new Set(OUT.map(([k]) => k));
  const inside = COINS.map((c, i) => (going.has(i) && t > OUT.find(([k]) => k === i)[1] ? "" : coin(c, 0, going.has(i) ? 0 : settle(t, i)))).join("");
  const out = OUT.map((o) => spill(t, o)).filter(Boolean).join("");
  return `${OPEN}${BACK}${inside}${FRONT}${STANDING}${STACKS}${out}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
