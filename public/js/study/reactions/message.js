// Message's two stories, the rolled paper's: it's tied with a bow, and the bow's knot slips; the ribbon drops away and the paper, rolled tight, springs
// open. Happy: it opens out evenly against the curve of the glass, one clean cream sheet filling the bottle. Sad: it springs open twisting, its left
// end jamming against the glass and crumpling there while its right end stays curled: crooked, creased, half open.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall and table, the bottle's shadow, its glass (lit and shaded, the neck
// to the left), the cork, the rolled paper (x 94-160, y 115-137, its rolled end at the left), the ribbon round it and its bow at x 128.5.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect y=\"132\" width=\"200\" height=\"68\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M84 141H168L200 155V186H158Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M40 109H58C68 109 71 94 86 94H163C170 94 176 100 176 107V129C176 136 170 142 163 142H86C71 142 68 127 58 127H40Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M163 95C170 96 176 100 176 107V129C176 136 170 142 163 142H86C77 142 72 137 68 132C74 135 79 136 86 136H162C166 136 169 133 169 129V108C169 102 167 98 163 95Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M40 123.5H58C63 123.5 66 127 68.5 132.3C64 129 61 127 58 127H40Z\" fill=\"var(--art-sky,#58ADEB)\"/><rect x=\"35\" y=\"106\" width=\"8\" height=\"24\" rx=\"3\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M35 124H43V127C43 128.7 41.7 130 40 130H38C36.3 130 35 128.7 35 127Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M48 111.5V124.5L30 125.5C28 125.5 27 122 27 118C27 114 28 110.5 30 110.5Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M48 121V124.5L30 125.5C28.6 125.5 27.7 124 27.3 122Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M94 115H156C158.5 115 160 120 160 126C160 132 158.5 137 156 137H94Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M94 131H159.3C158.6 134.8 157.5 137 156 137H94Z\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><ellipse cx=\"94\" cy=\"126\" rx=\"5\" ry=\"11\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><ellipse cx=\"94.6\" cy=\"126.2\" rx=\"4\" ry=\"9.8\" fill=\"var(--art-paper,#FBF7EC)\"/><ellipse cx=\"94.4\" cy=\"126.6\" rx=\"2.4\" ry=\"5.6\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><ellipse cx=\"94.6\" cy=\"126.8\" rx=\"1.3\" ry=\"3\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M127 115C126 122 126 130 127 137H130C129 130 129 122 130 115Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M126.4 131C126.5 133 126.7 135 127 137H130C129.7 135 129.5 133 129.4 131Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path fill-rule=\"evenodd\" d=\"M128.5 115C122 108 115 107 115 111C115 115 122 116 128.5 115ZM126 114C121 111 117.5 110.5 117.5 111.8C117.5 113.5 121 114.5 126 114Z\" fill=\"var(--art-clay,#E8743B)\"/><path fill-rule=\"evenodd\" d=\"M128.5 115C135 108 142 107 142 111C142 115 135 116 128.5 115ZM131 114C136 111 139.5 110.5 139.5 111.8C139.5 113.5 136 114.5 131 114Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M129 116L134.5 124L133 125L127.8 117Z\" fill=\"var(--art-clay,#E8743B)\"/><circle cx=\"128.5\" cy=\"115\" r=\"2\" fill=\"var(--art-clay-deep,#C25626)\"/></svg>\n";
export const STILL_HASH = "3fc8806f99";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 22 || !EL[10].includes("M94 115H156")) throw new Error("message: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const GLASS = EL.slice(0, 10).join(""), ROLL = EL.slice(10, 16).join(""), RIBBON = EL[16] + EL[17] + EL[20], BOW = EL[18] + EL[19] + EL[21];
const INSIDE = `<clipPath id="in"><path d="M88 97H162C168 97 172 101 172 107V129C172 135 168 139 162 139H88Z"/></clipPath>`;

// the bow: its loops drooping as the knot slips, then the ribbon dropping away and lying loose on the bottle's floor
function ribbon(t) {
  const droop = track([[0.3, 0], [0.6, 1, "in"]], t), drop = track([[0.6, 0], [0.84, 1, "in"]], t);
  if (droop < 0.004) return RIBBON + BOW;
  if (drop < 0.004) return `${RIBBON}<g transform="translate(128.5 115) scale(1 ${n4(1 - 0.45 * droop)}) rotate(${n2(8 * droop)}) translate(-128.5 -115)">${BOW}</g>`;
  // (down past the paper's front, to lie in a loose curl on the floor)
  // (the whole ribbon, band and bow, slipping off the paper as one, turning as it falls, to lie on the bottle's floor)
  const bow = `<g transform="translate(128.5 115) scale(1 0.55) rotate(8) translate(-128.5 -115)">${BOW}</g>`;
  return `<g clip-path="url(#in)"><g transform="translate(${n2(-4 * drop)} ${n2(22 * drop * drop)}) rotate(${n2(70 * drop)} 128.5 126)">${RIBBON}${bow}</g></g>`;
}
// the paper, opened o of the way: its rolled end unwinding (smaller), the sheet rising from the floor up the curve of the glass to h; wet w at its foot,
// slumped s into folds
function paper(o, h, w = 0, s = 0) {
  if (o < 0.004) return ROLL;
  const top = 137 - h * (1 - 0.62 * s), fold = 5 * s;
  const edge = `M94 137L94 ${n2(top + 4)}C110 ${n2(top - 3 + fold)} 124 ${n2(top + 2 - fold)} 138 ${n2(top - 2 + fold)}C148 ${n2(top - 4 - fold)} 156 ${n2(top + 1 + fold)} 160 ${n2(top + 3)}L160 137Z`;
  const sheet = `<path d="${edge}" ${fill("paper")}/><path d="M94 137V${n2(Math.min(137, top + 10 + 8 * s))}C120 ${n2(Math.min(137, top + 14 + 6 * s))} 140 ${n2(Math.min(137, top + 9 + 8 * s))} 160 ${n2(Math.min(137, top + 12 + 6 * s))}V137Z" ${fill("paper-mid")}/>`;
  // (where it soaks: darker, from the floor up)
  // (spreading out along the floor from where it first touched, and up)
  const half = 33 * Math.min(1, w * 2.5), wx = (u) => n2(127 + (u - 127) * (half / 33));
  const wet = w > 0.004 ? `<path d="M${wx(94)} 137V${n2(137 - 9 * w - 3 * s)}C${wx(112)} ${n2(137 - 11 * w - 2 * s)} ${wx(136)} ${n2(137 - 8 * w - 4 * s)} ${wx(160)} ${n2(137 - 10 * w - 2 * s)}V137Z" ${fill("paper-deeper")}/>` : "";
  // (its folds as it slumps: creases in the sheet)
  const cw = 1.6 * Math.min(1, s / 0.3);
  const creases = s > 0.004 ? [108, 123, 141].map((x, i) => `<path d="M${x} ${n2(top + 3 + fold * (i % 2 ? -1 : 1))}L${n2(x + 3 * s)} 137L${n2(x + cw + 3 * s)} 137L${n2(x + cw)} ${n2(top + 3)}Z" ${fill("paper-deep")}/>`).join("") : "";
  // (the rolled end, unwinding)
  const r = 1 - 0.8 * o, end = `<ellipse cx="94" cy="${n2(137 - 11 * r)}" rx="${n2(5 * r)}" ry="${n2(11 * r)}" ${fill("paper-mid")}/><ellipse cx="94.6" cy="${n2(137 - 10.8 * r)}" rx="${n2(4 * r)}" ry="${n2(9.8 * r)}" ${fill("paper")}/>`;
  return `<g clip-path="url(#in)">${sheet}${wet}${creases}${end}</g>`;
}

// ---- happy: it opens clean
const HAPPY_DUR = 2.4;
function happy(t) {
  if (t <= 0) return STILL;
  // it springs open fast as the ribbon leaves it, past its rest a little against the glass, and settles there
  const o = track([[0.66, 0], [1.05, 1, "out"]], t), h = 22 + 18 * track([[0.66, 0], [1.05, 1.08, "out"], [1.25, 0.98, "io"], [1.4, 1, "io"]], t);
  // (the bottle's inside, the one clip the paper and the ribbon both keep to)
  return `${OPEN}${INSIDE}${GLASS}${paper(o, h)}${ribbon(t)}</svg>`;
}

// ---- sad: it opens crooked and jams
const SAD_DUR = 2.4;
// the paper springing open unevenly: its left end springs up and jams against the glass, crumpling there, while its right end stays curled in a small
// roll; a crease runs across it where it's twisted: o, how far it has gone; j, how hard it has jammed (the crumple and the crease)
function crooked(o, j) {
  if (o < 0.004) return ROLL;
  const L = 115 - 15 * o - 2 * j, R = 115 + 6 * o, roll = 11 - 3 * o;
  const top = `M94 137V${n2(L + 3 * j)}L${n2(98 + 2 * j)} ${n2(L - 2 * j)}L${n2(103 + 2 * j)} ${n2(L + 2.5 * j)}L${n2(108 + 2 * j)} ${n2(L - 1 * j)}L${n2(114)} ${n2(L + 2 + 1.5 * j)}C130 ${n2(L + 4 + (R - L) * 0.3)} 146 ${n2(R - 2)} 158 ${n2(R)}V137Z`;
  const shade = `M94 137V${n2(L + 14)}C120 ${n2(L + 18)} 140 ${n2(R + 8)} 158 ${n2(R + 10)}V137Z`;
  const crease = j > 0.004 ? `<path d="M${n2(99)} ${n2(L + 6)}L${n2(102 + 46 * j)} ${n2(L + 8 + 18 * j)}L${n2(103.6 + 46 * j)} ${n2(L + 7.4 + 18 * j)}L${n2(100.6)} ${n2(L + 5)}Z" ${fill("paper-deep")}/>` : "";
  const end = `<ellipse cx="158" cy="${n2(137 - roll)}" rx="${n2(4 + o)}" ry="${n2(roll)}" ${fill("paper-mid")}/><ellipse cx="158.6" cy="${n2(137 - roll)}" rx="${n2(3 + o)}" ry="${n2(roll - 1.2)}" ${fill("paper")}/>`;
  const r = 1 - 0.8 * o, start = `<ellipse cx="94" cy="${n2(137 - 11 * r)}" rx="${n2(5 * r)}" ry="${n2(11 * r)}" ${fill("paper-mid")}/>`;
  return `<g clip-path="url(#in)"><path d="${top}" ${fill("paper")}/><path d="${shade}" ${fill("paper-mid")}/>${crease}${end}${start}</g>`;
}
function sad(t) {
  if (t <= 0) return STILL;
  // it springs open the same way, but twisting; its left end meets the glass and stops dead, crumpling; the crease comes as it jams
  const o = track([[0.66, 0], [0.95, 1, "out"]], t), j = track([[0.86, 0], [1.1, 1, "out"], [1.22, 0.92, "io"], [1.32, 1, "io"]], t);
  return `${OPEN}${INSIDE}${GLASS}${crooked(o, j)}${ribbon(t)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
