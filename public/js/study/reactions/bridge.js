// Bridge's two stories, a time-lapse of the river's: it rises, up the bridge's legs and over its shores, to the arch's springing line (the eye
// level of this low view: no higher can water come in it). Happy: it rises clear and slow and goes still: the arch's reflection forms in it, and
// the arch and its reflection close into one full ring. Sad: it comes up in flood: brown with the mud it carries, rough, the shores drowned; it
// never stills, and no reflection forms.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky, the river (from y 142, its far edge), the arch's shadow on the
// water, the two banks (grass, then the sandy shore below), the bridge (its deck's top, its right end, its face with the arch (inner curve from
// (50, 142) up to (100, 94) and down to (150, 142)), the deck's edge, the arch's inner left face), two ripples. Its feet stand in the water at y
// 164. The light doesn't change: only the water does.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect x=\"0\" y=\"142\" width=\"200\" height=\"58\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M42 162 L158 162 L168 169 L52 169 Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M0 124 L30 124 C40 125 46 130 48 138 L48 153 L0 157 Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M0 156 L48 152 L52 162 C40 164 22 166 0 168 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M200 128 L172 128 C162 129 156 134 154 142 L154 155 L200 159 Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M200 158 L154 154 L150 163 C162 165 180 167 200 169 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M26 120 Q100 40 174 120 L182 115 Q108 35 34 115 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M174 120 L182 115 L182 133 L174 138 Z\" fill=\"var(--art-paper-deeper,#BDB19A)\"/><path d=\"M26 120 Q100 40 174 120 L174 138 L158 164 L150 164 L150 142 C150 112 128 94 100 94 C72 94 50 112 50 142 L50 164 L42 164 L26 138 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M26 120 Q100 40 174 120 L174 128 Q100 48 26 128 Z\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><path d=\"M50 164 L50 142 C50 123.1 58.8 107.1 72.2 101.1 C63.5 110 58 122 58 137 L58 159 Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><rect x=\"70\" y=\"181\" width=\"34\" height=\"3\" rx=\"1.5\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><rect x=\"118\" y=\"188\" width=\"24\" height=\"3\" rx=\"1.5\" fill=\"var(--art-sky-lit,#8FCDF4)\"/></svg>\n";
export const STILL_HASH = "c88c5f7bfc";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 14 || !EL[9].includes("C150 112 128 94 100 94 C72 94 50 112 50 142")) throw new Error("bridge: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const SCENE = EL.slice(0, 12).join(""), RIPPLES = EL[12] + EL[13];
const FEET = 164, LINE = 143.2, LOW = 169.5;
// the time-lapse: the water's line, from just under the lowest thing in the still (the shores' foot, the arch's shadow) up the legs and shores to
// just under the springing line
const level = (t) => LOW + (LINE - LOW) * track([[0.2, 0], [1.75, 1, "io"]], t);
// the risen water in front: it covers the legs and the shores below the line
const risen = (y, color = "sky") => (y > LOW - 0.05 ? "" : `<path d="M0 ${n2(y)}H200V200H0Z" ${fill(color)}/>`);
// the arch's shadow on the water thins away as the water comes up through it
const shadow = (y) => { const k = Math.max(0, Math.min(1, (y - 158) / (LOW - 158))); return k > 0.999 ? EL[2] : k < 0.01 ? "" : `<g opacity="${n4(k)}">${EL[2]}</g>`; };
const SCENE_NO_SHADOW = EL[0] + EL[1], BANKS_BRIDGE = EL.slice(3, 12).join("");
// the reflection: everything above the water, mirrored about the waterline, each color as still water gives it back (the sky a deeper gold, the
// grass a deeper green, the pale stone a pale blue, the shadowed inner face a deep blue). Just above the line there is sky only through the arch:
// the rest is banks and stone; lower down the mirror reaches the sky above the banks at either side.
const REFLECT = { sun: "sun-deep", teal: "teal-deep", paper: "sky-pale", "paper-mid": "sky-pale", "paper-deep": "sky-pale", "paper-deeper": "sky-lit", "ink-lit": "sky-deep" };
const MIRRORED = [3, 5, 7, 8, 9, 10, 11].map((i) => EL[i].replace(/fill="var\(--art-([a-z-]+),#[0-9A-Fa-f]{6}\)"/, (m, tok) => fill(REFLECT[tok]))).join("");
function reflection(y, k) {
  if (k < 0.01) return "";
  return `<clipPath id="wt"><path d="M0 ${n2(y)}H200V200H0Z"/></clipPath><g clip-path="url(#wt)" opacity="${n4(k)}"><path d="M0 ${n2(y)}H200V200H0Z" ${fill("sun-deep")}/><g transform="translate(0 ${n2(2 * y)}) scale(1 -1)">${MIRRORED}</g></g>`;
}

// ---- happy: a ring
const HAPPY_DUR = 2.6;
function happy(t) {
  if (t <= 0) return STILL;
  const y = level(t);
  // as it slows to its height the surface calms: the ripples die away, and the reflection comes clear
  const calm = track([[1.3, 0], [2.05, 1, "io"]], t);
  const ripples = calm < 0.999 ? `<g opacity="${n4(1 - calm)}">${RIPPLES}</g>` : "";
  return `${OPEN}${SCENE_NO_SHADOW}${shadow(y)}${BANKS_BRIDGE}${risen(y)}${reflection(y, calm)}${ripples}</svg>`;
}

// ---- sad: a flood
const SAD_DUR = 2.6;
// (its streaks of foam, riding the rough water: they come with the mud)
const FOAM = [[18, 176, 20], [64, 168, 26], [118, 179, 22], [150, 170, 30], [90, 189, 28], [36, 193, 18], [160, 195, 24]];
function sad(t) {
  if (t <= 0) return STILL;
  const y = level(t);
  // the water comes up brown: the mud mixes through it as it rises, the water behind the bridge and the risen water in front alike
  const mud = track([[0.35, 0], [1.6, 1, "io"]], t);
  const tint = (y0) => (mud > 0.005 ? `<path d="M0 ${n2(y0)}H200V200H0Z" ${fill("wood-deep")} opacity="${n4(mud)}"/>` : "");
  const front = y < LOW - 0.05 ? risen(y) + tint(y) : "";
  const foam = FOAM.map(([x, fy, w], i) => (fy > y + 3 && mud > 0.005 ? `<rect x="${x}" y="${fy}" width="${n2(w * Math.min(1, mud * 1.4) * Math.min(1, (fy - y - 3) / 8))}" height="2.2" rx="1.1" ${fill("paper-deep")} opacity="${n4(Math.min(1, mud * 1.4) * (0.75 + 0.25 * (i % 2)))}"/>` : "")).join("");
  const ripples = mud < 0.999 ? `<g opacity="${n4(1 - mud)}">${RIPPLES}</g>` : "";
  return `${OPEN}${SCENE_NO_SHADOW}${shadow(y)}${tint(142)}${BANKS_BRIDGE}${front}${ripples}${foam}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
