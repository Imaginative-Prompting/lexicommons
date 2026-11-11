// Tall's two stories. Happy, the camera's: it tilts up the tower, floor after floor, past a cloud drifting at its middle, to its top
// standing in the open sky, a flag on its roof. Sad, the sun's (a time-lapse of an afternoon): the light swings round from the left to the
// right, low, and the tall tower's long shadow sweeps across the ground and over the little house beside it, the tower's own lit face
// going into shade.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky, the ground (y 176 down), the tower (its lit face x 66-106,
// its dark face 106-134, windows every 14 up), the little house (x 18-46, its roof's peak at (32, 142)).
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M-5 176H205V205H-5Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M-5 176H205V205H-5Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M66-5H106V176H66Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M106-5H134V176H106Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M74 -6h9v9h-9zM90 -6h9v9h-9zM74 8h9v9h-9zM90 8h9v9h-9zM74 22h9v9h-9zM90 22h9v9h-9zM74 36h9v9h-9zM90 36h9v9h-9zM74 50h9v9h-9zM90 50h9v9h-9zM74 64h9v9h-9zM90 64h9v9h-9zM74 78h9v9h-9zM90 78h9v9h-9zM74 92h9v9h-9zM90 92h9v9h-9zM74 106h9v9h-9zM90 106h9v9h-9zM74 120h9v9h-9zM90 120h9v9h-9zM74 134h9v9h-9zM90 134h9v9h-9zM74 148h9v9h-9zM90 148h9v9h-9zM74 162h9v9h-9zM90 162h9v9h-9z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M112 -6h14v8h-14zM112 8h14v8h-14zM112 22h14v8h-14zM112 36h14v8h-14zM112 50h14v8h-14zM112 64h14v8h-14zM112 78h14v8h-14zM112 92h14v8h-14zM112 106h14v8h-14zM112 120h14v8h-14zM112 134h14v8h-14zM112 148h14v8h-14zM112 162h14v8h-14z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M18 176V156L32 144 46 156V176Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M32 144 46 156V176H32Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M14 158 32 142 50 158 47 161 32 148 17 161Z\" fill=\"var(--art-clay,#E8743B)\"/>\n</svg>\n";
export const STILL_HASH = "a8aecce24e";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 10 || !EL[3].includes("M66-5H106V176H66Z")) throw new Error("tall: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const rect = (x, y, w, h, tone) => `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" ${fill(tone)}/>`;
const [SKY, , GROUND, LIT_FACE, DARK_FACE, LIT_WINDOWS, DARK_WINDOWS, HOUSE_WALL, HOUSE_SIDE, HOUSE_ROOF] = EL;
const HOUSE = HOUSE_WALL + HOUSE_SIDE + HOUSE_ROOF;

// ---- happy: up the tower to its top
// the tower carried on up past the frame: its faces, and its windows every 14 (the still's run of them, repeated)
const TOP = -330;
const winsOf = (svg) => /d="([^"]+)"/.exec(svg)[1];
const LIT_W = winsOf(LIT_WINDOWS), DARK_W = winsOf(DARK_WINDOWS), WIN_FILL = /fill="([^"]+)"/.exec(LIT_WINDOWS)[1], DARK_WIN_FILL = /fill="([^"]+)"/.exec(DARK_WINDOWS)[1];
// (the still's windows run from y -6 to 166: a block 182 high; the floors above are the same block moved up)
const UPPER = (d, f) => [182, 364].map((dy) => `<path d="${d}" transform="translate(0 ${-dy})" fill="${f}"/>`).join("");
// its top: a parapet, the roof's plant room, a flagpole and its flag lifting in the wind up there
function crown(t) {
  const wave = Math.sin(t * 7) * 2.5, w2 = Math.sin(t * 7 + 1.2) * 2.5;
  return rect(62, TOP - 8, 76, 8, "paper-deep") + rect(106, TOP - 8, 32, 8, "ink-lit") + rect(80, TOP - 26, 30, 18, "paper") + rect(110, TOP - 26, 12, 18, "ink")
    + rect(99, TOP - 70, 2, 44, "ink") + `<path d="M101 ${TOP - 69}C110 ${TOP - 72 + wave} 118 ${TOP - 66 + w2} 128 ${TOP - 69 + wave}L128 ${TOP - 55 + wave}C118 ${TOP - 52 + w2} 110 ${TOP - 58 + wave} 101 ${TOP - 55}Z" ${fill("clay")}/>`;
}
// a cloud drifting across the tower's middle, and one higher off to the side
const cloud = (x, y, s) => `<path transform="translate(${n2(x)} ${n2(y)}) scale(${n4(s)})" d="M-30 0C-34 -10 -22 -18 -12 -13C-8 -24 10 -25 15 -14C24 -20 36 -12 32 -2C40 0 38 10 30 10H-26C-36 10 -38 2 -30 0Z" ${fill("paper")}/>`;
const cam = (cy, z) => `translate(100 100) scale(${n4(z)}) translate(-100 ${n2(-cy)})`;
const HAPPY_DUR = 2.9;
function happy(t) {
  if (t <= 0) return STILL;
  // a slow start, up past the floors, easing in to frame the top, a little wider
  const u = track([[0.2, 0], [2.4, 1, "io"]], t), cy = 100 + (TOP - 50 - 100) * u, z = 1 + (0.86 - 1) * u;
  const tower = `<path d="M66 ${TOP}H106V176H66Z" ${fill("paper")}/><path d="M106 ${TOP}H134V176H106Z" ${fill("ink")}/>`
    + `<clipPath id="tw"><rect x="60" y="${TOP + 4}" width="80" height="${176 - TOP}"/></clipPath><g clip-path="url(#tw)"><path d="${LIT_W}" fill="${WIN_FILL}"/>${UPPER(LIT_W, WIN_FILL)}<path d="${DARK_W}" fill="${DARK_WIN_FILL}"/>${UPPER(DARK_W, DARK_WIN_FILL)}</g>`;
  return `${OPEN}<g transform="${cam(cy, z)}">${rect(-200, -800, 600, 1200, "sun")}${cloud(176 - 40 * u, -260, 1.3)}${GROUND}${tower}${crown(t)}${HOUSE}`
    + `${cloud(30 + 60 * u, -150, 1.6)}${cloud(-20 + 40 * u, -310, 1)}</g></svg>`;
}

// ---- sad: the sun swings round and the tower's shadow takes the house
const SAD_DUR = 2.8;
function sad(t) {
  if (t <= 0) return STILL;
  // the light moving round: the tower's lit face going into shade, its shadow (from its foot, stretching left as the sun goes low on the
  // right) sweeping over the ground and over the house
  const k = track([[0.25, 0], [2.3, 1, "io"]], t);
  const edge = 66 - 90 * k;
  const shadeFace = k > 0.004 ? `<path d="M66-5H106V176H66Z" ${fill("paper-deep")} opacity="${n4(Math.min(1, k * 1.4))}"/>` : "";
  const ground = edge < 66 ? `<path d="M${n2(Math.max(edge, -5))} 176H66V205H${n2(Math.max(edge - 12 * k, -5))}Z" ${fill("wood-deep")}/>` : "";
  // the house in the shadow: its own parts a shade down, where the shadow has reached
  const dark = HOUSE.replace(/var\(--art-paper,#[0-9A-F]+\)/, paint("paper-deeper")).replace(/var\(--art-clay,#[0-9A-F]+\)/, paint("clay-deep"));
  const shadowed = edge < 50 ? `<clipPath id="sh"><rect x="${n2(Math.max(edge, -5))}" y="0" width="${n2(66 - Math.max(edge, -5))}" height="200"/></clipPath><g clip-path="url(#sh)">${dark}</g>` : "";
  return `${OPEN}${SKY}${GROUND}${ground}${LIT_FACE}${shadeFace}${DARK_FACE}${LIT_WINDOWS}${DARK_WINDOWS}${HOUSE}${shadowed}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
