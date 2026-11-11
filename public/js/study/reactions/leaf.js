// Leaf's story. Happy, a time-lapse of a cool night: dew beads up on the leaf, drop by drop, until it lies at dawn studded with beads, still green and
// fresh. Sad, a time-lapse of its drying: fallen, the leaf dries from its margins in, browning, its green shrinking to the middle; and as it dries its two halves
// curl up off the ground about the midrib, the near half rising over: a dry brown curl.
// Every frame is a pure function of t, in seconds. The still's own parts: the ground, the far ground, the leaf's shadow, its stem, its far half
// (lit, up and left of the midrib), its near half (shaded), its six veins (three on each half) and its midrib, from its tip at 22, 171 to its base
// at 132, 127.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun-lit,#FAD57E)\"/><rect width=\"200\" height=\"92\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M24 172C35 177 55 179.2 72 178.6C90 178 106 172.5 116 165C125 158 130 150 132.5 141C133.5 137 134 133 136 131.2Q145 128.6 152.6 126.6A1.8 1.8 0 0 0 151.6 123.3Q141 125.5 128 126Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M127 126.5Q138 122.8 147.6 119.4A1.8 1.8 0 0 1 148.8 122.6Q139 125.4 130 129.6Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M22 171Q23.3 164 27.5 159L29.5 159.5Q30.3 152.8 34 147.5L36 148Q37.6 141.2 42 137L44 137.8Q46.7 130.7 52 127L54 128.3Q58 121.5 64 118.5L65.8 120.2Q71.2 113.3 78 111.5L79.5 113.4Q86 108.4 93.5 107.5L94.5 109.5Q100.9 106.4 107 109.5L107.5 111.5Q113.8 112 118 116L118.5 118Q123 124.5 132 127L132 128Q77 136 22 171Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M132 126L132 128.5Q131.8 135 128.5 141L126.5 140Q126.6 147 123.5 152L121.5 151Q120.4 157.3 116.5 160.5L115 158.5Q111 165.2 105 168L106 166Q99 171.5 91 172.8L92 170.8Q83.8 174.7 76 174.5L77 172.5Q68.5 175.7 60 174.8L61 172.8Q52.8 175.8 45 173L46 171Q33 173.5 22 171Q77 134 132 126Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M104.5 132.8C96 128 92 119 77 116.5C91 120.5 95 129.5 102 133.6Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M82 140.3C72 134 63 131 52 132.5C63 132.6 71 136.5 79 141.2Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M59.5 149.4C52 147 45 147 38 149.5C45 148.3 51 148.8 57 150.8Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M121 129.8C114 135 112 150 105 156C110 149 112 136.5 118 130.6Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M99 135.6C90 142 86 158 74 165.5C84 157 87 143 96 136.6Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M68 145C61 151 59 158 52 162.5C57 157 59 151 65.5 146.6Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M22 171Q77 134 132 126L133.5 127L132 128Q77 136.4 22 171Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/></svg>\n";
export const STILL_HASH = "3459f94d5c";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 13 || !EL[4].includes("M22 171Q23.3 164 27.5 159") || !EL[12].includes("M22 171Q77 134 132 126L133.5 127")) throw new Error("leaf: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const d = (e) => e.match(/ d="([^"]*)"/)[1];
const GROUND = EL.slice(0, 3).join(""), STEM = EL[3], FAR = EL[4], NEAR = EL[5], VEINS_FAR = EL.slice(6, 9), VEINS_NEAR = EL.slice(9, 12), MIDRIB = EL[12];
const TIP = [22, 171], BASE = [132, 127], MID = [80, 147];
const L = Math.hypot(BASE[0] - TIP[0], BASE[1] - TIP[1]), N = [-(BASE[1] - TIP[1]) / L, (BASE[0] - TIP[0]) / L]; // across the midrib, toward the near half
// a half curled up by a about the midrib: a point v across from it comes in to v cos(a) and rises v sin(a): we look down on the leaf from well
// above, so a rise toward us moves a point only a little up the picture (0.35 of it)
const LIFT = 0.35;
function curl(a, side) {
  const r = (a * Math.PI) / 180, w = [N[0] * (Math.cos(r) - 1), N[1] * (Math.cos(r) - 1) - side * LIFT * Math.sin(r)];
  const k = -(N[0] * TIP[0] + N[1] * TIP[1]);
  return `matrix(${n4(1 + w[0] * N[0])} ${n4(w[1] * N[0])} ${n4(w[0] * N[1])} ${n4(1 + w[1] * N[1])} ${n4(w[0] * k)} ${n4(w[1] * k)})`;
}
// a half as it dries: its dry brown whole under its green, the green shrinking to the leaf's middle (the margins browning first); its veins, paling
function half(path, green, brown, veins, dry) {
  if (dry <= 0.001) return path + veins.join("");
  const core = 1 - dry, dpath = d(path);
  const g = core > 0.002 ? `<g transform="translate(${MID[0]} ${MID[1]}) scale(${n4(core)}) translate(${-MID[0]} ${-MID[1]})"><path d="${dpath}" ${fill(green)}/></g>` : "";
  const v = veins.map((e) => `${e}<path d="${d(e)}" ${fill("sun-lit")} opacity="${n4(dry)}"/>`).join("");
  return `<path d="${dpath}" ${fill(brown)}/>${g}${v}`;
}

// ---- sad: dried and curled
const SAD_DUR = 2.7;
function sad(t) {
  if (t <= 0.3) return STILL;
  const dry = track([[0.3, 0], [2.1, 1, "io"]], t), a = 50 * track([[0.6, 0], [2.3, 1, "io"]], t);
  const stem = dry > 0.001 ? `${STEM}<path d="${d(STEM)}" ${fill("bark")} opacity="${n4(dry)}"/>` : STEM;
  const far = half(FAR, "teal", "wood", VEINS_FAR, dry), near = half(NEAR, "teal-deep", "bark", VEINS_NEAR, dry);
  const midrib = dry > 0.001 ? `${MIDRIB}<path d="${d(MIDRIB)}" ${fill("sun-lit")} opacity="${n4(dry)}"/>` : MIDRIB;
  const bend = (body, side) => (a > 0.001 ? `<g transform="${curl(a, side)}">${body}</g>` : body);
  return `${OPEN}${GROUND}${stem}${bend(far, -1)}${bend(near, 1)}${midrib}</svg>`;
}

// ---- happy: dew
// A time-lapse of the night: the cool leaf gathers dew. Drops bead up on it, here and there, growing as the water condenses, the near ones pulling
// together into bigger ones, until it lies at dawn studded with round beads, still green and fresh. Each bead is a little lens of the leaf it sits on
// (its own green, lighter), its shadow cast down and right onto the leaf below it.
// [x, y, its full radius, which half (0 far, lit; 1 near, shaded), when it starts]
const BEADS = [[50, 152, 4.4, 0, 0.35], [72, 136, 5.6, 0, 0.5], [96, 127, 4.6, 0, 0.42], [116, 131, 3.6, 0, 0.62], [60, 166, 4, 1, 0.55], [90, 156, 5.2, 1, 0.4], [114, 143, 3.6, 1, 0.7]];
function dew(t) {
  let shade = "", lens = "", rim = "";
  for (const [x, y, r0, h, t0] of BEADS) {
    const r = r0 * Math.sqrt(track([[t0, 0], [t0 + 1.4, 1, "out"]], t));
    if (r < 0.15) continue;
    shade += `M${n2(x - r + 0.9)} ${n2(y + 0.7)}a${n2(r)} ${n2(r * 0.8)} 0 1 0 ${n2(2 * r)} 0a${n2(r)} ${n2(r * 0.8)} 0 1 0 ${n2(-2 * r)} 0Z`;
    (h ? (rim += `M${n2(x - r)} ${n2(y)}a${n2(r)} ${n2(r * 0.85)} 0 1 0 ${n2(2 * r)} 0a${n2(r)} ${n2(r * 0.85)} 0 1 0 ${n2(-2 * r)} 0Z`) : (lens += `M${n2(x - r)} ${n2(y)}a${n2(r)} ${n2(r * 0.85)} 0 1 0 ${n2(2 * r)} 0a${n2(r)} ${n2(r * 0.85)} 0 1 0 ${n2(-2 * r)} 0Z`));
  }
  return (shade ? `<path d="${shade}" ${fill("ink-lit")} opacity="0.35"/>` : "") + (lens ? `<path d="${lens}" ${fill("teal-lit")}/>` : "") + (rim ? `<path d="${rim}" ${fill("teal")}/>` : "");
}
const HAPPY_DUR = 2.9;
function happy(t) {
  if (t <= 0.35) return STILL;
  return STILL.replace("</svg>", `${dew(t)}</svg>`);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
