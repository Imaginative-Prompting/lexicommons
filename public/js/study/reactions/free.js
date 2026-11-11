// Free's two stories, the air's: a draft through the cage (air is what moves a feather). Happy: it lifts the feather off the cage floor,
// rocking as a feather does, and carries it out through the open door (the same air nudging the door a little wider) and up and away out of
// the frame. Sad: it lifts the feather the same way, but higher than the door, and presses it flat against the bars over the doorway from
// inside, where it flutters; then the draft dies, and the feather slides down the inside of the cage, swaying as a feather falls, and
// settles on the cage floor by the door. Still inside.
// Every frame is a pure function of t, in seconds. The still's own parts: the cage (its floor, bars, dome, the doorway at x 100-135, y
// 100-146), the feather on the floor about (77, 155), the door open outward on its hinge line at x 134, its free edge at x 166.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<rect y=\"144\" width=\"200\" height=\"56\" fill=\"var(--art-teal-lit,#6FD0BD)\"/>\n<path d=\"M24 170L78 200H200V190L136 166Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<ellipse cx=\"80\" cy=\"170\" rx=\"56\" ry=\"10\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"24\" y=\"155\" width=\"112\" height=\"15\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M100 164.3V179.3A56 10 0 0 0 136 170V155A56 10 0 0 1 100 164.3Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<ellipse cx=\"80\" cy=\"155\" rx=\"56\" ry=\"10\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<ellipse cx=\"80\" cy=\"155.5\" rx=\"50\" ry=\"8\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M57 159.5L66 158L66.3 158.9L57.3 160.3Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M64 158.3C71 153 84 149.8 97 150.3C95.5 154 92 156.6 87.5 157.6L86 156.3L84.6 158.9C78 160.5 70 160.6 64 158.3Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M24.5 81A55.5 6.5 0 0 1 135.5 81L132.5 81A52.5 3.5 0 0 0 27.5 81Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<rect x=\"26\" y=\"117\" width=\"108\" height=\"4\" rx=\"2\" fill=\"var(--art-wood,#DCA063)\"/>\n<path d=\"M80 38.5C109.8 38.5 135.5 57.5 135.5 81L132.5 81C132.5 59.2 109.8 41.5 80 41.5Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<rect x=\"132.5\" y=\"80\" width=\"3\" height=\"76\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M80 38.5C50.2 38.5 24.5 57.5 24.5 81L27.5 81C27.5 59.2 50.2 41.5 80 41.5Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M80 38.5C59 38.5 40.5 59.2 40.5 84.6L43.5 84.6C43.5 60.8 59 41.5 80 41.5Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M80 38.5C69.5 38.5 59.5 59.6 59.5 85.7L62.5 85.7C62.5 61.3 69.5 41.5 80 41.5Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M80 38.5C90.5 38.5 100.5 59.6 100.5 85.7L97.5 85.7C97.5 61.3 90.5 41.5 80 41.5Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M80 38.5C101 38.5 119.5 59.2 119.5 84.6L116.5 84.6C116.5 60.8 101 41.5 80 41.5Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"24.5\" y=\"80\" width=\"3\" height=\"76\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"40.5\" y=\"84\" width=\"3\" height=\"77.5\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"59.5\" y=\"85\" width=\"3\" height=\"78.6\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"78.5\" y=\"38\" width=\"3\" height=\"126.2\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"97.5\" y=\"85\" width=\"3\" height=\"78.6\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"116.5\" y=\"84\" width=\"3\" height=\"18\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"116.5\" y=\"145\" width=\"3\" height=\"16.5\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M97.5 100.7A55.5 5 0 0 0 135.5 96L135.5 99A55.5 5 0 0 1 97.5 103.7Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M97.5 145.7A55.5 5 0 0 0 135.5 141L135.5 144A55.5 5 0 0 1 97.5 148.7Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M24.5 81A55.5 6.5 0 0 0 135.5 81L132.5 81A52.5 3.5 0 0 1 27.5 81Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M69 17A11 11 0 1 1 91 17A11 11 0 1 1 69 17ZM72 17A8 8 0 1 0 88 17A8 8 0 1 0 72 17Z\" fill-rule=\"evenodd\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M62 44.5C62 39 70 35.5 80 35.5C90 35.5 98 39 98 44.5C92 46.5 68 46.5 62 44.5Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M88 36.3C94 37.5 98 40.5 98 44.5C95.5 45.4 92 45.9 88 46.1Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<circle cx=\"80\" cy=\"30.5\" r=\"5.5\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M80 25A5.5 5.5 0 0 1 80 36A3 5.5 0 0 0 80 25Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M24 155A56 10 0 0 0 136 155L130 155.5A50 8 0 0 1 30 155.5Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<polygon points=\"166,97 168.5,97.8 168.5,152.4 166,153\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M134 96L166 97L166 153L134 144ZM137 99.1L163 99.9L163 149.2L137 141.8Z\" fill-rule=\"evenodd\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"144\" y=\"98\" width=\"2.8\" height=\"47.5\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"153.5\" y=\"98.5\" width=\"2.8\" height=\"50\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"131.5\" y=\"104\" width=\"5\" height=\"7\" rx=\"1\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<rect x=\"131.5\" y=\"129\" width=\"5\" height=\"7\" rx=\"1\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n</svg>\n";
export const STILL_HASH = "822e1ca863";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 41 || !EL[36].includes("M134 96L166 97L166 153L134 144Z")) throw new Error("free: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const pts = (P) => P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
// the still's layers: under the feather (room, floor, the cage's base and its floor), the feather, the cage over it, the door, its hinges
const UNDER = EL.slice(0, 8).join(""), FEATHER = EL[8] + EL[9], CAGE = EL.slice(10, 35).join(""), DOOR = EL.slice(35, 39).join(""), HINGES = EL[39] + EL[40];
const FEATHER_MID = [77, 155];

// ---- the door on its hinge (x 134, y 96 to 144), open at angle a from the cage's face: its free edge, nearer as it swings toward us, taller
const A0 = Math.acos(32 / 37);
function door(a) {
  const xf = 134 + 37 * Math.cos(a), p = 1 + 0.332 * Math.sin(a), cy = 120 + 9.97 * Math.sin(a);
  const TL = [134, 96], TR = [xf, cy - 24 * p], BR = [xf, cy + 24 * p], BL = [134, 144];
  const at = (s, v) => { const top = [TL[0] + (TR[0] - TL[0]) * s, TL[1] + (TR[1] - TL[1]) * s], bot = [BL[0] + (BR[0] - BL[0]) * s, BL[1] + (BR[1] - BL[1]) * s]; return [top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v]; };
  const quad = (s0, s1, v0, v1) => [at(s0, v0), at(s1, v0), at(s1, v1), at(s0, v1)];
  const d = (P) => `M${P.map((q) => `${n2(q[0])} ${n2(q[1])}`).join("L")}Z`;
  const edgeW = 2.5 * (Math.cos(a) / Math.cos(A0));
  const edge = `<polygon points="${pts([TR, [TR[0] + edgeW, TR[1] + 0.8], [BR[0] + edgeW, BR[1] - 0.6], BR])}" ${fill("sun-deep")}/>`;
  const frame = `<path d="${d(quad(0, 1, 0, 1))}${d(quad(3 / 32, 29 / 32, 0.0615, 0.9385))}" fill-rule="evenodd" ${fill("sun")}/>`;
  const bars = `<polygon points="${pts(quad(10 / 32, 12.8 / 32, 0.032, 0.968))}" ${fill("sun")}/><polygon points="${pts(quad(19.5 / 32, 22.3 / 32, 0.035, 0.99))}" ${fill("sun")}/>`;
  return edge + frame + bars;
}

// ---- the feather in the air: where its middle is, how it's turned, how upright (lying flat it's seen edge-on, low)
const feather = (x, y, a, up) => `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(a)}) scale(1 ${n4(up)}) translate(${-FEATHER_MID[0]} ${-FEATHER_MID[1]})">${FEATHER}</g>`;
// (inside the cage it's behind the bars; once it's through the doorway, in front of everything)
const scene = (f, outside, a) => `${OPEN}${UNDER}${outside ? "" : f}${CAGE}${a === A0 ? DOOR : door(a)}${HINGES}${outside ? f : ""}</svg>`;

// ---- happy: out through the door, and down onto the ground outside it
const HAPPY_DUR = 3.6, OUT_REST = [176, 168];
// its way: up off the floor, drifting right to the doorway's middle, through it and out, then down, swaying, to the ground right of the door
const PATH = [[0.2, FEATHER_MID], [0.9, [92, 138]], [1.5, [117, 124]], [1.95, [148, 118]]];
function along(t) {
  for (let i = 1; i < PATH.length; i++) if (t <= PATH[i][0]) {
    const [t0, a] = PATH[i - 1], [t1, b] = PATH[i], k = (t - t0) / (t1 - t0), e = i === 1 ? k * k : k;
    return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
  }
  return PATH[PATH.length - 1][1];
}
function happy(t) {
  if (t <= 0) return STILL;
  const lift = track([[0.2, 0], [0.9, 1, "out"]], t);
  let [x, y] = along(t);
  // rocking as it floats, as feathers do
  let a = (-6 + 22 * Math.sin((t - 0.2) * 4.2)) * lift, up = 1 + 0.7 * lift;
  if (t > 1.95) {
    // out, the draft spent: down to the ground, slowly, swaying and turning with each sway, and settling flat
    const d = track([[1.95, 0], [3.1, 1, "io"]], t), sway = Math.sin((t - 1.95) * 6.2) * (1 - d), settle = track([[2.9, 0], [3.3, 1, "io"]], t);
    x = 148 + (OUT_REST[0] - 148) * d + 8 * sway;
    y = 118 + (OUT_REST[1] - 118) * d;
    a = (a * (1 - d) + 20 * sway) * (1 - settle) + 3 * settle;
    up = up + (1 - up) * settle;
  }
  const swing = A0 + (-7 * Math.PI) / 180 * track([[1.2, 0], [1.75, 1, "out"], [2.6, 0.35, "io"], [3.1, 0.45, "io"]], t);
  return scene(feather(x, y, t <= 0.2 ? 0 : a, t <= 0.2 ? 1 : up), t > 1.55, t < 1.2 ? A0 : swing);
}

// ---- sad: the draft presses it into the bars beside the door, and its vane snags between two of them: when the draft dies it stays there,
// upright across the bars, half in and half out
const SAD_DUR = 3.2, SNAG = [88, 116];
function sad(t) {
  if (t <= 0) return STILL;
  const lift = track([[0.2, 0], [0.9, 1, "out"]], t);
  const k = track([[0.2, 0], [1.5, 1, "io"]], t);
  let x = FEATHER_MID[0] + (SNAG[0] - FEATHER_MID[0]) * k, y = FEATHER_MID[1] + (SNAG[1] - FEATHER_MID[1]) * k - 6 * Math.sin(Math.PI * k);
  // pressed into the gap it stands upright, fluttering in the air going through; when the air stops, it sags a little in the bars, still
  const pressed = track([[1.3, 0], [1.65, 1, "io"]], t), fl = track([[1.4, 0], [1.65, 1, "io"], [2.25, 1], [2.45, 0, "io"]], t);
  const sag = track([[2.3, 0], [2.75, 1, "io"]], t);
  const a = (-6 + 22 * Math.sin((t - 0.2) * 4.2)) * lift * (1 - pressed) + pressed * (76 - 8 * sag) + fl * (3.5 * Math.sin(t * 31) + 2 * Math.sin(t * 47));
  const up = 1 + 0.7 * lift + 0.15 * pressed;
  x += fl * 0.6 * Math.sin(t * 39);
  y += 1.6 * sag;
  // the part through the gap is in front of the cage's front: drawn again over the bars, cut to what has come through
  const through = track([[1.35, 0], [1.75, 1, "io"]], t), cut = 130 - 40 * through;
  const f = feather(x, y, t <= 0.2 ? 0 : a, t <= 0.2 ? 1 : up);
  const front = through > 0 ? `<clipPath id="th"><rect x="${n2(cut)}" y="0" width="${n2(200 - cut)}" height="200"/></clipPath><g clip-path="url(#th)">${f}</g>` : "";
  return `${OPEN}${UNDER}${f}${CAGE}${DOOR}${HINGES}${front}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
