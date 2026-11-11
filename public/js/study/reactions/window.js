// Window's two stories: a paper plane, thrown from outside, comes in through the open window: out of sight behind the right jamb at first,
// across the opening (in front of the sky, still outside, so behind the frame), growing as it nears, and into the room. Happy: it glides down
// onto the sill, slides a little, and stops there, parked. Sad: it flies on, straight into the open casement's glass, swung in on the left:
// its nose crumples, and it drops onto the sill's left end.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M159.8 40L168.8 48.2V150.2L200 176.5V200H78.6L36 160.3L53.4 148V40Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<rect x=\"53.4\" y=\"40\" width=\"106.4\" height=\"108.2\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<rect x=\"59.7\" y=\"46.8\" width=\"93.5\" height=\"94.3\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M59.7 46.8H153.2L148.4 51.6H59.7Z\" fill=\"var(--art-paper-deeper,#BDB19A)\"/>\n<rect x=\"59.7\" y=\"51.6\" width=\"88.7\" height=\"89.5\" fill=\"var(--art-sky,#58ADEB)\"/>\n<path d=\"M78.3 84.4C75.7 84.4 73.8 82.4 73.8 79.9C73.8 77.4 75.8 75.5 78.3 75.5C79.5 75.5 80.6 75.9 81.4 76.6C82.1 72.7 85.2 69.7 88.8 69.7C92.5 69.7 95.3 72.3 96.1 75.8C96.6 75.6 97.2 75.5 97.9 75.5C100.3 75.5 102 77.5 102 79.9C102 82.4 100.2 84.4 97.7 84.4Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M21 28.3L27.8 26.1L29 153.9L27.8 155L21 152.8Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M27.8 26.1L59.8 46.8V141L27.8 155Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M33.3 39.2L54.7 52.8V134.3L33.3 142.5Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M33.3 42.6L52.5 54.6V134.3L33.3 142.5Z\" fill=\"var(--art-sky,#58ADEB)\"/>\n<rect x=\"57.3\" y=\"60.7\" width=\"3.5\" height=\"12.6\" fill=\"var(--art-ink,#231F3B)\"/>\n<rect x=\"57.3\" y=\"117.5\" width=\"3.5\" height=\"12.6\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M36 154.8H173.7V160.4L166.5 165.4H42L36 160.4Z\" fill=\"var(--art-bark,#7A4E2D)\"/>\n<path d=\"M36 154.8H173.7V160.5H36Z\" fill=\"var(--art-wood-deep,#B97F45)\"/>\n<path d=\"M45.8 147.9H166.3L174.8 155.1H35.6Z\" fill=\"var(--art-wood,#DCA063)\"/>\n</svg>\n";
export const STILL_HASH = "af6bf39045";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 16) throw new Error("window: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const SCENE = EL.join("");
// the opening, as the still paints it (the sky in the frame): outside, the plane is kept to it
const SKY = [59.7, 51.6, 88.7, 89.5];
const OUTSIDE = `<clipPath id="sky"><rect x="${SKY[0]}" y="${SKY[1]}" width="${SKY[2]}" height="${SKY[3]}"/></clipPath>`;
// the window is about a meter across: 106 units a meter; the plane, a sheet folded into a dart, is about 32 cm long
const G = 1040, LEN = 34;

/** The plane, flying left, its nose at (x, y), turned a°, scaled s; crushed c (0–1) at its nose. A dart seen a little from above: its near wing
 *  a sheet's gray, clearly off the window's white paint (33 levels, so it never vanishes against the frame), its far wing and the fold down its middle deeper. */
function plane(x, y, a, s, c = 0) {
  const n = 6 * c; // how much of its nose is crushed back, into a blunt fold
  const tip = c > 0 ? [[n, -1.4 * c], [n + 0.6, 1.6 * c]] : [[0, 0], [0, 0]];
  const near = `<polygon points="${n2(tip[1][0])},${n2(tip[1][1])} ${LEN},8.5 ${LEN - 5},1" ${fill("paper-deep")}/>`;
  const far = `<polygon points="${n2(tip[0][0])},${n2(tip[0][1])} ${LEN},-9 ${LEN - 5},1" ${fill("paper-deeper")}/>`;
  const fold = `<polygon points="${n2(tip[1][0])},${n2(tip[1][1])} ${LEN - 5},1 ${LEN - 5},2.4" ${fill("paper-deeper")}/>`;
  const crease = c > 0.05 ? `<polygon points="${n2(n - 0.4)},${n2(-2 * c)} ${n2(n + 3)},${n2(-2.6 * c)} ${n2(n + 3.4)},${n2(2.8 * c)} ${n2(n + 0.4)},${n2(2.2 * c)}" ${fill("paper-deeper")}/>` : "";
  return `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(a)}) scale(${n4(s)})">${far}${near}${fold}${crease}</g>`;
}
/** Where it is, outside or in: outside it's kept to the opening, drawn just over the sky; once through (wholly inside the opening's picture
 *  then, so the change can't show) it's in the room, over everything. */
const frameOf = (p, inside, extra = "") => (inside
  ? `${OPEN}${SCENE}${extra}${p}</svg>`
  : `${OPEN}${OUTSIDE}${EL.slice(0, 7).join("")}<g clip-path="url(#sky)">${p}</g>${EL.slice(7).join("")}</svg>`);
// its glide: from out of sight behind the right jamb (outside, so smaller), to the window's plane, growing as it comes
const FROM = [170, 84];

// ---- happy. Through the opening and down onto the sill: its belly touches at x 98 and it slides left on the wood, stopping at 84.
const T_IN = 0.12, T_THROUGH = 0.56, T_TOUCH = 0.82, T_STOP = 1.12;
const THROUGH = [112, 112], TOUCH = [98, 149.2], STOP = 84;
const HAPPY_DUR = T_STOP + 0.7;
function happy(t) {
  if (t <= 0) return STILL;
  if (t < T_THROUGH) {
    const u = Math.max(0, (t - T_IN) / (T_THROUGH - T_IN));
    const x = FROM[0] + (THROUGH[0] - FROM[0]) * u, y = FROM[1] + (THROUGH[1] - FROM[1]) * (0.6 * u + 0.4 * u * u);
    return frameOf(plane(x, y, -12, 0.72 + 0.28 * u), false);
  }
  if (t < T_TOUCH) {
    // gliding on down to the sill (its nose lifting a little as it flares to land)
    const u = (t - T_THROUGH) / (T_TOUCH - T_THROUGH);
    const x = THROUGH[0] + (TOUCH[0] - THROUGH[0]) * u, y = THROUGH[1] + (TOUCH[1] - THROUGH[1]) * (0.35 * u + 0.65 * u * u);
    return frameOf(plane(x, y, -12 + 10 * u, 1), true);
  }
  // sliding to a stop on the sill (friction: slowing evenly), settling flat, with its small shadow on the wood
  const s = Math.min(t, T_STOP) - T_TOUCH, dur = T_STOP - T_TOUCH, x = TOUCH[0] - (TOUCH[0] - STOP) * (2 * s / dur - (s / dur) ** 2);
  const a = -2 + 2 * Math.min(1, s / 0.12);
  // (its shadow grows in as it comes down onto the wood)
  const g = Math.min(1, s / 0.1);
  const shadow = `<polygon points="${n2(x + 3)},${n2(TOUCH[1] + 1.2)} ${n2(x + LEN + 2)},${n2(TOUCH[1] + 1.2 + 2 * g)} ${n2(x + LEN - 4)},${n2(TOUCH[1] + 1.2 + 5.5 * g)}" ${fill("wood-deep")}/>`;
  return frameOf(plane(x, TOUCH[1] - 3.4, a, 1), true, shadow);
}

// ---- sad. Faster and straighter, through and on across the room's side of the window, into the middle of the casement's glass (x 33 to 52): its nose crushes
// back against it, it stops dead, and drops (one parabola) onto the sill's left end, landing on its belly with a small bounce.
const S_THROUGH = [110, 100], HIT = [43, 106];
const T_S_THROUGH = 0.45, T_HIT = 0.68, T_CRUSH = 0.74, T_LAND = T_CRUSH + Math.sqrt((2 * (149.2 - 3.4 - HIT[1])) / G);
const SAD_DUR = T_LAND + 0.25 + 0.7;
function sad(t) {
  if (t <= 0) return STILL;
  if (t < T_S_THROUGH) {
    const u = Math.max(0, (t - T_IN) / (T_S_THROUGH - T_IN));
    const x = FROM[0] + (S_THROUGH[0] - FROM[0]) * u, y = FROM[1] - 4 + (S_THROUGH[1] - FROM[1] + 4) * u;
    return frameOf(plane(x, y, -10, 0.72 + 0.28 * u), false);
  }
  if (t < T_HIT) {
    const u = (t - T_S_THROUGH) / (T_HIT - T_S_THROUGH);
    return frameOf(plane(S_THROUGH[0] + (HIT[0] - S_THROUGH[0]) * u, S_THROUGH[1] + (HIT[1] - S_THROUGH[1]) * u, -10 + 4 * u, 1), true);
  }
  // crushed against the glass (it stays there an instant as its nose folds), then falls, tipping nose down a little, onto the sill
  const crush = track([[T_HIT, 0], [T_CRUSH, 1, "out"]], t);
  if (t < T_CRUSH) return frameOf(plane(HIT[0], HIT[1], -6, 1, crush), true);
  const s = Math.min(t, T_LAND) - T_CRUSH, y = HIT[1] + 0.5 * G * s * s, x = HIT[0] + 6 * s;
  const tip = -6 - 14 * (s / (T_LAND - T_CRUSH));
  const bounce = track([[T_LAND, 0], [T_LAND + 0.08, -1.6, "out"], [T_LAND + 0.16, 0, "in"], [T_LAND + 0.25, 0, "io"]], t);
  const landed = t >= T_LAND, a = landed ? track([[T_LAND, -20], [T_LAND + 0.18, -3, "out"]], t) : tip;
  const g = landed ? Math.min(1, (t - T_LAND) / 0.12) : 0;
  const shadow = landed ? `<polygon points="${n2(x + 6)},${n2(149.2 + 1.2)} ${n2(x + LEN)},${n2(149.2 + 1.2 + 2 * g)} ${n2(x + LEN - 6)},${n2(149.2 + 1.2 + 5 * g)}" ${fill("wood-deep")}/>` : "";
  return frameOf(plane(x, (landed ? 149.2 - 3.4 : y) + bounce, a, 1, 1), true, shadow);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
