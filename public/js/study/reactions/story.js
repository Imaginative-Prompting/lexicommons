// Story's two stories, the pop-up book's own mechanism: the open right page settles a little flatter under its own weight and pulls on the castle's
// paper linkage. Happy: the pull works the pop-up's last fold: a paper flag on its pole rises from behind the tall tower's roof and its pennant swings
// out. Sad: the pull peels the castle's glued mount off the page instead; with nothing holding it up, the castle tips forward and falls flat on its face
// across the pages, its back (printed too) up, its roofs toward us. The tree stands.
// Every frame is a pure function of t, in seconds. The still's own parts: the background and table, the book's shadow, its cover, its two page stacks,
// its two open pages (the spine at x 100, its foot at (100, 161)), the shadows on the pages, the castle's mount, the castle (its wall and gate, the tall
// tower at left with its roof's tip at (80, 29), the short tower at right), the tree.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect y=\"143\" width=\"200\" height=\"57\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M10,167 L190,167 L200,170.5 L200,200 L88,200 Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M17,149 L8,166 Q7,169.5 11,169.5 Q55,166 89,167 Q100,174 111,167 Q145,166 189,169.5 Q193,169.5 192,166 L183,149 Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M16.5,150 C45,141 80,145 100.5,160.5 L100.5,165 C75,160.5 40,161 13,166.5 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M183.5,150 C155,141 120,145 99.5,160.5 L99.5,165 C125,160.5 160,161 187,166.5 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M16,151 L37,123 Q70,128 100.5,146 L100.5,161.5 C80,145.5 45,141.5 16,151 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M184,151 L157,120 Q130,126 99.5,146 L99.5,161.5 C120,145.5 155,141.5 184,151 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M146,133 L167,135.5 L140,139.5 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M52,139.5 L65,140.5 L53,142.5 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><polygon points=\"67,129 100.5,129 100.5,150 67,140\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M88,138 L88,89 L98,89 L98,95 L103,95 L103,89 L111,89 L111,95 L116,95 L116,89 L127,89 L127,137 Q112,139 100,147 Q94,141 88,138 Z\" fill=\"var(--art-violet,#7C5CE6)\"/><path d=\"M94,117 A10,10 0 0 1 114,117 L114,140.3 Q105,142 100,146.5 Q97,143.3 94,141.6 Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M66,58 L87,58 L87,137.5 Q76,134.5 66,133 Z\" fill=\"var(--art-violet-lit,#A68CFF)\"/><path d=\"M86.5,60 L95,58 L95,140.3 Q91,138.8 86.5,137.5 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M72,83 L72,73 A4,4 0 0 1 80,73 L80,83 Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M80,29 L61.5,59 L86,62 Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M80,29 L86,62 L99.5,59 Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M124,74 L141,74 L141,137 Q132,136 124,137 Z\" fill=\"var(--art-violet-lit,#A68CFF)\"/><path d=\"M140.5,77 L148,74 L148,134.5 L140.5,137 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M129,94 L129,86 A3,3 0 0 1 135,86 L135,94 Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M135,52 L119.5,76 L140,79 Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M135,52 L140,79 L151.5,76 Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M46,141 L47.5,117 L52,117 L53.5,141 Q49.8,142 46,141 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M50.8,117 L52,117 L53.5,141 L51.6,141.4 Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><circle cx=\"50\" cy=\"96\" r=\"13\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"38\" cy=\"109\" r=\"10.5\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"60\" cy=\"108\" r=\"10.5\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"49\" cy=\"113\" r=\"10\" fill=\"var(--art-teal-deep,#25907B)\"/><circle cx=\"47.5\" cy=\"95\" r=\"12.5\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"36\" cy=\"108\" r=\"10\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"57\" cy=\"107\" r=\"10\" fill=\"var(--art-teal,#37B39B)\"/><circle cx=\"46.5\" cy=\"112\" r=\"9.5\" fill=\"var(--art-teal,#37B39B)\"/></svg>\n";
export const STILL_HASH = "933692124c";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 33 || !EL[16].includes("M80,29")) throw new Error("story: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BOOK = EL.slice(0, 5).join(""), LEFT_PAGE = EL[6], TREE = EL.slice(23).join("");
const CASTLE = EL.slice(11, 23).join("");

// the settle both start with: the right page (and its stack, and the short tower's shadow on it) easing down about the spine's foot
const settle = (t) => track([[0.2, 0], [0.7, 2.4, "io"]], t);
const rightPage = (a) => {
  const p = EL[5] + EL[7] + EL[8];
  return a > 0.004 ? `<g transform="rotate(${n2(a)} 100 161)">${p}</g>` : p;
};

// ---- happy: the flag goes up
const HAPPY_DUR = 2.4, POLE_X = 79.2, HIDDEN = 47;
function flag(t) {
  // the pole pushed up from behind the roof by the linkage, slowing as it reaches its stop; then the pennant, folded flat against it, swings out on
  // its paper hinge, a little past, and settles
  const r = track([[0.55, 0], [1.1, 1, "out"]], t), w = track([[0.95, 0], [1.35, 1.12, "out"], [1.6, 0.97, "io"], [1.8, 1, "io"]], t);
  if (r < 0.004) return "";
  const top = HIDDEN - (HIDDEN - 3) * r;
  const pole = `<rect x="${POLE_X}" y="${n2(top)}" width="1.6" height="${n2(HIDDEN + 4 - top)}" rx="0.8" ${fill("bark")}/>`;
  if (w < 0.01) return pole;
  const x = POLE_X + 1.6, tip = x + 21 * w;
  return `${pole}<path d="M${n2(x)} ${n2(top + 1)}L${n2(tip)} ${n2(top + 6.5)}L${n2(x)} ${n2(top + 12)}Z" ${fill("teal")}/><path d="M${n2(x)} ${n2(top + 6.5)}L${n2(tip)} ${n2(top + 6.5)}L${n2(x)} ${n2(top + 12)}Z" ${fill("teal-deep")}/>`;
}
function happy(t) {
  if (t <= 0) return STILL;
  // (the pole rises behind the roof: drawn before the castle, so the roof hides its foot)
  return `${OPEN}${BOOK}${LEFT_PAGE}${rightPage(settle(t))}${EL[9]}${EL[10]}${flag(t)}${CASTLE}${TREE}</svg>`;
}

// ---- sad: the castle comes away and falls
const SAD_DUR = 2.5, BASE = 139, K = 0.24, T_PEEL = 0.72;
// the topple from rest about its foot: a 15 cm card falling over (the book's 25 cm is 180 here), its angle's speed growing as it goes, worked out
// once in small steps
const FALL = (() => {
  const S = [[0, 0.04]];
  let a = 0.04, w = 0.15, s = 0;
  while (a < Math.PI / 2) { w += 98 * Math.sin(a) / 4000; a += w / 4000; s += 1 / 4000; S.push([s, Math.min(a, Math.PI / 2)]); }
  return S;
})();
const T_DOWN = FALL[FALL.length - 1][0];
function tilt(t) {
  if (t <= T_PEEL) return 0.04 * track([[0.45, 0], [T_PEEL, 1, "in"]], t);
  const s = t - T_PEEL;
  if (s < T_DOWN) return FALL[Math.min(FALL.length - 1, Math.floor(s * 4000))][1];
  // (card lands and lifts a hair at its far end as it settles)
  const r = s - T_DOWN;
  return Math.PI / 2 - (r < 0.12 ? 0.06 * Math.sin((Math.PI * r) / 0.12) : 0);
}
// the castle's back, as it lies: a pop-up piece is printed both sides, so its back is the castle's back, the walls and roofs in their own colors (no
// windows, no gate on this side); flipped top for bottom about its foot (it fell forward); the card's edge under it, a thin dark line
const BACK = [10, 11, 13, 14, 18, 19, 16, 17, 21, 22].map((i) => EL[i]).join("");
function sad(t) {
  if (t <= 0) return STILL;
  const a = tilt(t), f = Math.cos(a) - K * Math.sin(a);
  // its shadow on the right page goes as it falls
  const page = rightPage(settle(t)).replace(EL[8], f > 0.002 ? `<g transform="translate(140 137) scale(1 ${n4(Math.max(0, f))}) translate(-140 -137)">${EL[8]}</g>` : "");
  const castle = f > 0
    ? `<g transform="translate(0 ${BASE}) scale(1 ${n4(f)}) translate(0 ${-BASE})">${EL[10]}${CASTLE}</g>`
    : `<g transform="translate(0 ${n2(BASE + 1.6)}) scale(1 ${n4(f)}) translate(0 ${-BASE})">${BACK.replace(/fill="[^"]+"/g, fill("paper-deeper"))}</g><g transform="translate(0 ${BASE}) scale(1 ${n4(f)}) translate(0 ${-BASE})">${BACK}</g>`;
  // (the mount, glued under it, comes away with it)
  return `${OPEN}${BOOK}${LEFT_PAGE}${page}${EL[9]}${castle}${TREE}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
