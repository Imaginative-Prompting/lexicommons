// Big's two stories, the big beach ball's own, as an afternoon goes by in a few seconds: nothing comes in. Happy: the sun warms it, the air in
// it expands and it firms and rounds out, sitting a size bigger on the sand; the sun gets lower as it does, the shadows lengthen to the
// right, and the big ball's shade reaches over the little one, which sits in it. Sad: a slow leak: it softens, its top sinks, its sides sag
// out, and it ends a flat, creased skin on the sand beside the little ball, still round.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { blob, n2, n4, paint, parsePath, runsToDc, subdivide, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<ellipse cx=\"88\" cy=\"176\" rx=\"62\" ry=\"9\" fill=\"var(--art-ground,#D3CAB5)\"/><ellipse cx=\"172\" cy=\"177\" rx=\"18\" ry=\"4\" fill=\"var(--art-ground,#D3CAB5)\"/>\n<clipPath id=\"b\"><circle cx=\"82\" cy=\"98\" r=\"72\"/></clipPath>\n<g clip-path=\"url(#b)\"><rect x=\"8\" y=\"24\" width=\"150\" height=\"150\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M82 98C50 76 40 44 56 22H6V74C30 90 58 96 82 98Z\" fill=\"var(--art-sky,#58ADEB)\"/>\n<path d=\"M82 98C96 66 124 44 158 44V22H56C40 44 50 76 82 98Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M82 98C106 92 136 92 158 112V44C124 44 96 66 82 98Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M82 98C100 118 104 148 96 176H158V112C136 92 106 92 82 98Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M82 98C62 112 40 138 40 172H96C104 148 100 118 82 98Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M82 98C58 96 30 90 6 74V172H40C40 138 62 112 82 98Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M154 98A72 72 0 0 1 82 170C60 170 42 160 30 146 74 150 130 130 146 62 151 73 154 85 154 98Z\" fill=\"var(--art-ink,#231F3B)\" opacity=\".2\"/></g>\n<circle cx=\"82\" cy=\"98\" r=\"9\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<clipPath id=\"s\"><circle cx=\"172\" cy=\"162\" r=\"15\"/></clipPath>\n<g clip-path=\"url(#s)\"><rect x=\"155\" y=\"145\" width=\"35\" height=\"35\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M172 162 160 148H178Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M172 162 186 152V170Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M172 162 180 178H162Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M186 162A15 15 0 0 1 164 175C176 172 182 164 184 154 185 156 186 159 186 162Z\" fill=\"var(--art-ink,#231F3B)\" opacity=\".2\"/></g>\n</svg>\n";
export const STILL_HASH = "02bd36fbd4";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 18) throw new Error("big: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const C = [82, 98], R = 72, GROUND = C[1] + R; // the big ball: its middle, its radius, where it sits on the sand
const TINY = `<clipPath id="s"><circle cx="172" cy="162" r="15"/></clipPath><g clip-path="url(#s)">${EL.slice(13, 18).join("")}</g>`;
const BIG_BALL = `<clipPath id="b"><circle cx="82" cy="98" r="72"/></clipPath><g clip-path="url(#b)">${EL.slice(3, 11).join("")}</g>${EL[11]}`;
const ellipse = (cx, cy, rx, ry) => `<ellipse cx="${n2(cx)}" cy="${n2(cy)}" rx="${n2(rx)}" ry="${n2(ry)}" ${fill("ground")}/>`;

// ---- happy. The ball grows 8% about the point it sits on (soft to taut); the sun lowers, so both shadows reach further right (their near ends stay at the
// balls' feet); the big one's comes over the little ball, and the little ball goes into its shade (a shade over it, deepening as it's covered).
const GROW = 0.08, T0 = 0.12, T1 = 2.0;
const HAPPY_DUR = T1 + 0.6;
function happy(t) {
  if (t <= 0) return STILL;
  const k = track([[T0, 0], [T1, 1, "io"]], t);
  const s = 1 + GROW * k;
  // the shadows: the big one's from its left end (26) out to 196, the little one's from 154 out to 200
  const big = ellipse(88 + 25 * k, 176, 62 + 25 * k, 9 + 1.2 * k), tiny = ellipse(172 + 5 * k, 177, 18 + 5 * k, 4 + 0.4 * k);
  const shade = track([[T0 + 0.9, 0], [T1, 0.16, "io"]], t);
  const inShade = shade > 0.002 ? `<circle cx="172" cy="162" r="15" ${fill("ink")} opacity="${n2(shade)}"/>` : "";
  // taut at last, its skin smooth: the light makes a clean highlight on it, upper left, towards the sun
  const gloss = track([[T0 + 1.2, 0], [T1, 0.6, "io"]], t);
  const shine = gloss > 0.004 ? `<path d="M30.5 76C36 58 50 43 67 36.5Q71 35.6 70.4 39.2C56 47 44 60 38.6 76.8Q36 80.8 30.5 76Z" ${fill("paper")} opacity="${n2(gloss)}"/>` : "";
  return `${OPEN}${big}${tiny}<g transform="translate(${C[0]} ${GROUND}) scale(${n4(s)}) translate(${-C[0]} ${-GROUND})">${BIG_BALL}${shine}</g>${TINY}${inShade}</svg>`;
}

// ---- sad. The leak: k goes 0 → 1, slow to start (it's still taut), sagging fastest in the middle, slow at the end (little air left to push
// out). Every point of the ball, by how high it is above the sand (e, 0 at its foot to 1 at its top) and how far out from its middle (u):
// it comes down as the ball loses height, the top sinking most, the sides sagging out wider the lower they are, and at the end the skin lies
// in a few soft creases.
const PANELS = [`M8 24H158V174H8Z`, ...EL.slice(4, 10).map((e) => e.match(/ d="([^"]*)"/)[1]),
  // the shade's quarter circle as its cubic
  `M154 98C154 137.76 121.76 170 82 170C60 170 42 160 30 146 74 150 130 130 146 62 151 73 154 85 154 98Z`];
const PANEL_FILLS = [EL[3], ...EL.slice(4, 11)].map((e) => e.match(/ fill="([^"]*)"/)[1]);
const PANEL_RUNS = PANELS.map((d) => subdivide(parsePath(d), 3));
const VALVE = subdivide(parsePath("M73 98C73 93.03 77.03 89 82 89C86.97 89 91 93.03 91 98C91 102.97 86.97 107 82 107C77.03 107 73 102.97 73 98Z"), 2);
const RIM = Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * 2 * Math.PI; return [C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)]; });
// at the end it's a low, creased mound of skin lying over its footprint on the sand (the sand is seen from a little above: the footprint is
// an ellipse like its shadow): the ball's lowest point comes to the footprint's front edge, its top to the mound's crest, its sides out over it
const FOOT = [80, 176], RX = 1.05 * R, FOOT_RY = 9, CREST = 13;
function sag(k) {
  const dent = 26 * Math.sin(Math.PI * Math.min(1, k * 1.3)), crease = k * k;
  return (x, y) => {
    const u = (x - C[0]) / R, v = (y - C[1]) / R, s = Math.sqrt(Math.max(0, 1 - u * u)), s2 = Math.max(s, 0.15);
    const wrinkle = crease * (3.4 * Math.sin(u * 9 + 0.7) + 1.8 * Math.sin(u * 17 + 2));
    const base = FOOT[1] + FOOT_RY * s, top = FOOT[1] - (CREST + wrinkle) * s;
    const X = FOOT[0] + u * RX, Y = top + ((base - top) * (v + s2)) / (2 * s2);
    // midway the top caves in before the sides give (a dimple, deepest at the top's middle)
    const cave = dent * Math.max(0, -v) ** 2 * s * s;
    return [x + (X - x) * k, y + (Y - y) * k + cave * (1 - k)];
  };
}
const SAD_DUR = 2.4 + 0.6;
function sad(t) {
  if (t <= 0) return STILL;
  const k = track([[0.12, 0], [2.4, 1, "io"]], t), W = sag(k);
  const rim = blob(RIM.map(([x, y]) => W(x, y)));
  const panels = PANEL_RUNS.map((r, i) => `<path d="${runsToDc(r, W)}" fill="${PANEL_FILLS[i]}"${i === 7 ? ' opacity=".2"' : ""}/>`).join("");
  // its shadow draws in as it comes down (a lower, wider thing on the sand)
  const shadow = ellipse(88 - 4 * k, 176 + 1 * k, 62 + 16 * k, 9 + 0.6 * k);
  return `${OPEN}${shadow}${EL[1]}<clipPath id="b"><path d="${rim}"/></clipPath><g clip-path="url(#b)">${panels}</g><path d="${runsToDc(VALVE, W)}" ${fill("paper")}/>${TINY}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
