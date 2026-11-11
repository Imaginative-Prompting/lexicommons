// The bed's two stories, seen from its side. Happy: it makes itself. The rumpled blanket lifts off, shakes out in a wave, and settles flat and square
// down the near side, the top of it turned back at the head end, and the pillow plumps. Sad: the blanket slides off the near side to the floor in a
// heap, and the pillow it was lying over is dragged after it and drops onto the heap. The bed's left bare.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths. The blanket is cloth, so it changes shape: each point of its
// outline moves to the point of the new outline in the same direction from its middle. (Its darker part, the drape's far end turned from the light,
// is the same cloth and goes the same way.)
import { n2, n4, paint, parsePath, partsOf, runsToDc, subdivide, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M184.4 141.2l-1 4.3 21 0 0 34.2-24.7-9c-1.5-.5-3-2.7-4.1-3.8 .4-6.1 1.2-11.4 3-17.2 .4-1.3 .7-2.8 1.4-4 1.1-1.7 3-3.1 4.4-4.5ZM9.7 142.1c1.2 1.1 3 2.5 3.6 4 .7 1.8 .9 16.2 1 19.3 .7 .4 1.3 .7 2 .9 .7-2.5 .7-5.5 2-7.8 1.1-2.2 4.7-5.7 7-6.5 3-1.1 13.4-.5 17.2-.5 2 2 3.4 2.7 4 5.6 8.7 .7 16.2-4.3 25.5-3.5 5.5 .4 10.9 2 16.3 3.4 10 2.5 20.5 4.7 30.9 3.8 4.7-.4 10.5-1.1 14.6-3.7 2.9-1.9 3.3-5.5 7.5-5.6 4.1-.1 20.2-.6 23.1 .5 2.2 .9 5.7 4.5 6.8 6.5 1.2 2.5 1.5 5.5 1.9 8.2-1 1.1-2.8 3.6-4.5 3.6l-142.8 .1 70.7 29.5c1.8 .8 3.5 3.2 4.8 4.5l-105.7 0 0-58.7 14.6 0-.5-3.6Z\" fill=\"var(--art-teal-lit,#6FD0BD)\" fill-rule=\"evenodd\"/>\n<path d=\"M20.4 163l-.5 3.9 149.8 0-.5-3.9c.5 .6 1.6 1.9 2.4 2.2 .9 .4 4.9 .4 5.7 0 .8-.4 1.6-1.4 2.1-2l-.3 4 25.3 9 0 28.2-107.1 0c-.5-.5-.4-.8-1.1-1.1l-82.1-34.3c-.7-.2-1.7-.3-2.4-.4 2.8-2.9 2.2-3.2 6.3-3.2l2.4-2.4Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M9.4 155V71C9.4 63.5 15.6 58 23.6 58C31.5 58 36.5 63.2 40.2 72L43 82V154.3H24.2C21.9 154.3 20.8 156 20.6 158.6L19.9 166.9C19.8 168.2 18.9 169 17.6 169H12.9C11.6 169 10.8 168.2 10.7 166.9Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M40 140.6H168V154.3H40Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M25.4 114.3H176V141H25.4C22.2 141 19.5 138.3 19.5 135.1V120.2C19.5 117 22.2 114.3 25.4 114.3Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M162.5 136.5C164 126 167.3 116.6 171.7 112.4C175.3 109 181.8 108.6 185.5 110.4C188.2 111.7 188.3 115.7 187.8 119.4C187.2 127 185.6 138.6 183.8 146.4C182.8 150.4 181 154.2 180.1 158.2L179.4 166.6C179.3 168 178.4 169 177 169H172.6C171.3 169 170.4 168.1 170.2 166.8L169.4 160.2C169.1 157.3 167.6 154.3 164.9 154.3H162.5V136.5Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M22.5 80.7C29.5 79.1 36.2 77.7 45 77.6C59.5 77.5 71.2 82.2 77.6 89.6C80.6 93.1 82.7 97.2 84 100.6C86.2 105.6 87 110.6 87 115H37C32.7 114.9 29.6 112.9 27.7 110.5C25.6 107.8 24.8 103.6 24.2 99.5C23.6 94.5 23.2 89.6 22.6 85.2C22.4 83.6 22.3 82.1 22.5 80.7Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M22.6 83.4C25.4 88.8 28.6 95.6 34.4 99.6C40.6 103.8 50.2 104.6 58.4 105.2C64.4 105.6 74 106 86.4 106.4C86.8 109.4 87 112.2 87 115H39.4C34.4 115 30.6 113.4 28.2 110.8C25.8 108.2 24.8 103.8 24.2 99.5C23.6 94.4 23 88.6 22.6 83.4Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M153.6 104.3c.4 1.2 .6 1.4 1.7 2.3-2.4 2.2-3.8 1.8-6.7 2.5-5 1.4-10.6 3.8-13.9 8-7.6 9.9-9.1 22.8-14.4 33.8-2.4 5-6 8.7-9.8 12.6-1.2-.1-2.5-.3-3.6-.2-.8 0-1.6 .3-2.4 .3-2 .1-4.2-.4-6.1-.9l-22-5.1c-7-1.6-13.8 .1-20.6 1.9-3.2 .9-8.2 2.5-11.2 0-3.2-2.7-1.7-9.6-1.1-13.2 1.8-12.4 6.2-24.9 16.8-32.4 6.9-4.9 14.3-10.1 22.2-13.2 14.8-5.7 40.6-8 55.8-3.6 5.5 1.5 10.5 4.1 15.3 7.2Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M166.4 114.4c-4.3 0-8.9-.5-13.2 .2-14.8 2.1-13.3 20.3-13.3 31.2 0 3.6 .2 7.8-1.8 10.9-5.5 8.5-24.1 8.2-32.9 7.1 17.7-10.5 14.8-35 28.2-49.2 4.4-4.8 10.3-8 16.7-9.3 1.5-.3 3.2-.6 4.6-.1 2.8 1.1 9.2 7 11.7 9.2Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n</svg>\n";
export const STILL_HASH = "751672b82d";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [FLOORP, SHADOW, HEAD, RAIL, MATTRESS, FOOT, PILLOW, PSHADE, BLANKET, FOLD] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const fill = (t) => `fill="${paint(t)}"`;
// The floor runs straight across behind the bed: drawn whole underneath, so it's there wherever the blanket no longer is.
const FLOOR = `<rect y="145.5" width="200" height="54.5" ${fill("teal-lit")}/>`;
const BLANKET_RUNS = subdivide(parsePath(BLANKET.d), 3), FOLD_RUNS = subdivide(parsePath(FOLD.d), 3);
const C = [100, 130], CF = [138, 138];
const lerp = (a, b, k) => a + (b - a) * k;
// Where a ray from a middle meets an outline (the nearest edge it crosses).
const onPoly = (poly, c) => (x, y) => {
  const dx = x - c[0], dy = y - c[1];
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length], ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const tt = ((ax - c[0]) * ey - (ay - c[1]) * ex) / den, u = ((ax - c[0]) * dy - (ay - c[1]) * dx) / den;
    if (tt > 0 && u >= 0 && u <= 1) best = Math.min(best, tt);
  }
  return Number.isFinite(best) ? [c[0] + dx * best, c[1] + dy * best] : [x, y];
};
const cloth = (runs, k, target, lift = 0, wave = 0, t = 0) => runsToDc(runs, (x, y) => {
  const [tx, ty] = target(x, y);
  const w = wave ? wave * Math.sin((x - 40) * 0.09 - t * 22) : 0;
  return [lerp(x, tx, k), lerp(y, ty, k) - lift + w];
});
const over = (svg, k) => (k <= 0 ? "" : k >= 1 ? svg : `<g opacity="${n2(k)}">${svg}</g>`);
const pillow = (tr) => `<g transform="${tr}">${PILLOW.svg}${PSHADE.svg}</g>`;

// ---- happy.
// The made bed: the blanket over the mattress from just past the pillow to the footboard, down the near side and hanging over the rail, its hem soft.
// Its foot end, turned from the light, a band in shade.
const HEM = (x) => 152 + 1.6 * Math.sin((x - 88) * 0.23);
const NEAT_OUTLINE = [[88, 110.5], [164, 110.5], [166.5, 113], [167, HEM(167)]];
for (let x = 160; x >= 88; x -= 6) NEAT_OUTLINE.push([x, HEM(x)]);
NEAT_OUTLINE.push([87, 113]);
const NEAT = onPoly(NEAT_OUTLINE, C);
// The shaded fold is the same cloth, its underside turned from the light: it moves with the rest, and as the crease shakes out and turns back to the
// light, its shade gives way to the blanket's own color (the cloth stays there, solid, the whole time: only its shade changes).
const HAPPY_DUR = 2.1;
function happy(t) {
  if (t <= 0) return STILL;
  // Up it goes off the bed, shaking out in a wave; down it comes, settling square, with a last small float as the air under it goes.
  const lift = track([[0.1, 0], [0.4, 20, "out"], [0.66, 0, "in"], [0.74, 2.2, "out"], [0.82, 0, "in"]], t);
  const wave = track([[0.1, 0], [0.32, 4.5, "out"], [0.66, 2, "io"], [0.94, 0, "io"]], t);
  const k = track([[0.14, 0], [0.66, 1, "io"]], t);
  // The top of it turned back at the head end: the sheet's white shows as the fold comes over, from the head edge.
  // (the fold's own edge, in shade, is as deep as the fold has come over)
  const turn = track([[0.86, 0], [1.12, 1, "io"]], t), fw = 9 * turn, sw = 1.6 * turn;
  const sheet = turn > 0 ? `<path d="M88 110.5H${n2(88 + fw)}V${n2(HEM(88 + fw))}H88Z" ${fill("paper")}/><path d="M${n2(88 + fw)} 110.5H${n2(88 + fw + sw)}V${n2(HEM(88 + fw + sw))}H${n2(88 + fw)}Z" ${fill("paper-deep")}/>` : "";
  // The pillow plumps once the blanket's down: up, past, and back, from its foot on the mattress.
  const s = track([[1.1, 1], [1.22, 1.1, "out"], [1.34, 0.96, "io"], [1.44, 1.02, "io"], [1.52, 1, "io"]], t);
  const pl = pillow(`translate(55 115) scale(${n4(2 - s)} ${n4(s)}) translate(-55 -115)`);
  const foldD = cloth(FOLD_RUNS, k, NEAT, lift, wave, t), lit = Math.min(1, k * 1.4);
  const cover = `<path d="${cloth(BLANKET_RUNS, k, NEAT, lift, wave, t)}" ${fill("sun")}/><path d="${foldD}" ${fill("sun-deep")}/>${over(`<path d="${foldD}" ${fill("sun")}/>`, lit)}`;
  return `${OPEN}${BG}${FLOOR}${FLOORP.svg}${SHADOW.svg}${HEAD.svg}${RAIL.svg}${MATTRESS.svg}${FOOT.svg}${pl}${cover}${sheet}</svg>`;
}

// ---- sad.
// The heap: a mound on the floor just off the near side of the bed, flat underneath where it sits, lumpy on top where it's folded on itself.
const HEAP = [104, 180];
const onHeap = (c) => (x, y) => {
  const a = Math.atan2(y - c[1], x - c[0]), co = Math.cos(a), sn = Math.sin(a);
  if (sn > 0) return [HEAP[0] + co * 50, HEAP[1] + 6 + sn * 3];
  const r = 1 + 0.16 * Math.sin(4 * a + 0.6) + 0.09 * Math.sin(9 * a + 2);
  return [HEAP[0] + co * 50 * (1 + 0.05 * Math.sin(6 * a)), HEAP[1] + 6 + sn * 26 * r];
};
// Its far end in shade lands as the heap's shaded side, to the right.
const onHeapFold = (x, y) => {
  const a = Math.atan2(y - CF[1], x - CF[0]), co = Math.cos(a), sn = Math.sin(a);
  return [HEAP[0] + 30 + co * 20, HEAP[1] + 2 + sn * (sn > 0 ? 7 : 22)];
};
const SAD_DUR = 2.2;
function sad(t) {
  if (t <= 0) return STILL;
  // It creeps, then goes: the weight hanging over the side draws the rest after it, faster and faster, and it slumps into a heap.
  const k = track([[0.12, 0], [0.45, 0.12, "io"], [0.85, 1, "in"]], t);
  const slump = t > 0.85 ? -track([[0, 0], [0.06, 2.6, "out"], [0.16, 0, "io"]], t - 0.85) : 0;
  const heap = `<g transform="translate(0 ${n2(-slump)})"><path d="${cloth(BLANKET_RUNS, k, onHeap(C))}" ${fill("sun")}/><path d="${cloth(FOLD_RUNS, k, onHeapFold)}" ${fill("sun-deep")}/></g>`;
  // The pillow: the blanket lay over its corner, so as the blanket goes it drags the pillow along the mattress to the near edge; off it goes, turning
  // as it falls, and drops onto the heap (a pillow is soft: it gives as it lands, and rounds out again).
  const P0 = 0.62, P1 = 0.9, P2 = 1.2;
  let tr;
  if (t < P1) tr = `translate(${n2(track([[P0, 0], [P1, 8, "in"]], t))} 0)`;
  else {
    const s = Math.min(t, P2) - P1, T = P2 - P1, f = s / T;
    // (it falls off the near side, toward you, so on the screen it drops straight down in front of the mattress, and lands flat on the heap's top)
    const x = 8 + 17 * f, y = 45 * f * f, rot = 5 * f;
    const give = t > P2 ? track([[0, 0], [0.06, 1, "out"], [0.16, -0.3, "io"], [0.24, 0, "io"]], t - P2) : 0;
    tr = `translate(${n2(x)} ${n2(y)}) rotate(${n2(rot)} 55 115) translate(55 115) scale(${n4(1 + 0.08 * give)} ${n4(1 - 0.12 * give)}) translate(-55 -115)`;
  }
  const pl = pillow(tr);
  // (the pillow's under the blanket until it's dragged out from it, then it's in front of the heap's back, falling onto it)
  const onTop = t >= P1;
  return `${OPEN}${BG}${FLOOR}${FLOORP.svg}${SHADOW.svg}${HEAD.svg}${RAIL.svg}${MATTRESS.svg}${FOOT.svg}${onTop ? "" : pl}${heap}${onTop ? pl : ""}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
