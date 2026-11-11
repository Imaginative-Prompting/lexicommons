// Truck's story, its sad alone (its happy, a short reverse leaving tracks, needed sand the still doesn't draw and was no happy: the player keeps the
// still for it), a time-lapse of a slow leak: the near front tire loses its air. It slumps, its sidewall bulging out flat on the ground, and the
// truck sinks onto it at that corner: the cab's near front lowest, the far front and the back wheels holding it up.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky, the ground, the shadow, the chassis, the two near back wheels, the
// box (its front over the cab, its side, its back end), the near front wheel's arch, the far front wheel, the cab (its side, its front, its
// windscreen, its side window, its mirrors), the radiator front, the headlights, the bumper, and the near front wheel (its lit edge, its tire, its hub,
// centered at 94, 158.5, its foot on the ground at 174). We see the truck from its front and near side: the cab's front runs from the far corner
// (x 27) to the near corner (x 80); the side from there back past the near back axle (x 150).
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect y=\"157\" width=\"200\" height=\"43\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M36,170 L100,173 L158,163 L200,169 L200,200 L166,200 Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M98,140 L165,136.5 L165,147.5 L100,153 L98,153 Z\" fill=\"var(--art-ink,#231F3B)\"/><ellipse cx=\"128.5\" cy=\"154.5\" rx=\"9\" ry=\"12.5\" fill=\"var(--art-ink-lit,#3A3460)\"/><ellipse cx=\"131\" cy=\"154.5\" rx=\"9\" ry=\"12.5\" fill=\"var(--art-ink,#231F3B)\"/><ellipse cx=\"132\" cy=\"154.5\" rx=\"3.4\" ry=\"5.6\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><path d=\"M132,148.9 A3.4,5.6 0 0 1 132,160.1 Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><ellipse cx=\"147.5\" cy=\"153\" rx=\"8.5\" ry=\"12\" fill=\"var(--art-ink-lit,#3A3460)\"/><ellipse cx=\"150\" cy=\"153\" rx=\"8.5\" ry=\"12\" fill=\"var(--art-ink,#231F3B)\"/><ellipse cx=\"151\" cy=\"153\" rx=\"3.2\" ry=\"5.4\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><path d=\"M151,147.6 A3.2,5.4 0 0 1 151,158.4 Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M54,100 L54,86 Q54,83.5 57,83.3 L104.5,80 L104.5,144 L60,144 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M104,80 L159.5,95 L159.5,139.6 L104,143.5 Z\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><path d=\"M159,94.9 L166,96.8 L166,139 L159,139.6 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><ellipse cx=\"94\" cy=\"150\" rx=\"11\" ry=\"12\" fill=\"var(--art-ink,#231F3B)\"/><ellipse cx=\"39.5\" cy=\"160\" rx=\"10\" ry=\"12\" fill=\"var(--art-ink-lit,#3A3460)\"/><ellipse cx=\"42\" cy=\"160\" rx=\"10\" ry=\"12\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M77,153 L77,100 Q77,91 86,91 L97,91 Q103,91.5 103,98 L103,146 Q102,138 94,138 Q85,138 83,148 L83,153 Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M27,153 L27,128 Q27,123 29,119 L36,98 Q38,92.5 45,92.3 L80,91.5 L80,153 Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M33,124 L39,103 Q40,99.5 44,99.4 L76,98.8 Q78.5,98.8 78.2,101.5 L76,124 Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M68,99 L76,98.8 Q78.5,98.8 78.2,101.5 L76,124 L63,124 Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M83,103 Q83,100 86,100 L94,100 Q96,100 96,102.5 L96,121.5 Q96,124 93.5,124 L83,124 Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M28,109 L34,107.8 L33.6,110.3 L28,111.3 Z\" fill=\"var(--art-teal-deep,#25907B)\"/><rect x=\"21.5\" y=\"107.5\" width=\"7.5\" height=\"14\" rx=\"1.8\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M86.5,120 L88.5,120 L88.5,124 Q88.5,126 86.5,126 L82,126 L82,124 L86.5,124 Z\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"85\" y=\"107\" width=\"7.5\" height=\"14\" rx=\"1.8\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"38.5\" y=\"135.5\" width=\"24\" height=\"3.5\" rx=\"1\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"39.5\" y=\"140.5\" width=\"22\" height=\"3.5\" rx=\"1\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"40.5\" y=\"145.5\" width=\"20\" height=\"3.5\" rx=\"1\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"29.5\" y=\"138.5\" width=\"7\" height=\"8.5\" rx=\"2\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"64.5\" y=\"138.5\" width=\"10.5\" height=\"8.5\" rx=\"2\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"25\" y=\"151\" width=\"47\" height=\"12\" rx=\"2\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M70,151 L82,151 Q84,151 84,153 L84,161 Q84,163 82,163 L70,163 Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><ellipse cx=\"91\" cy=\"158.5\" rx=\"12\" ry=\"15.5\" fill=\"var(--art-ink-lit,#3A3460)\"/><ellipse cx=\"94\" cy=\"158.5\" rx=\"12\" ry=\"15.5\" fill=\"var(--art-ink,#231F3B)\"/><ellipse cx=\"95\" cy=\"158.5\" rx=\"4.5\" ry=\"7\" fill=\"var(--art-paper-mid,#EDE6D5)\"/><path d=\"M95,151.5 A4.5,7 0 0 1 95,165.5 Z\" fill=\"var(--art-steel-deep,#6B687A)\"/></svg>\n";
export const STILL_HASH = "4d8d1ab8fe";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 38 || !EL[35].includes('cx="94" cy="158.5" rx="12" ry="15.5"') || !EL[19].includes("M27,153 L27,128")) throw new Error("truck: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
// how far each face sinks, as a shear of the picture's x, at the leak's end: a rigid body tipping onto its near front corner, the far front wheel and
// the near back axle holding. The tire goes fully flat, its rim coming down to 2 above the road: the axle drops 6.5, the near corner 8, the far front
// corner 1.6; along the side from 8 at the corner to 0 at the back axle; the box's front, behind the cab, from the side's 5.3 at its near edge,
// rolling across to -0.8 at its far edge)
const FRONT = [0.1208, -1.66], SIDE = [-0.116, 17.4], BOX = [0.1208, -7.34];
const FACE = [];
for (let i = 0; i < 38; i++) FACE[i] = [3, 13, 14, 15, 18, 22, 25, 26].includes(i) ? SIDE : i === 12 ? BOX : (i >= 19 && i <= 33 && ![22, 25, 26].includes(i)) ? FRONT : null;
// the near front wheel: its hub goes down with the corner (6.5 at the axle); its tire's foot stays on the ground at 174
const SINK = 6.5, FOOT = 174;

// ---- sad: flat
const T0 = 0.3, T1 = 2.1, SAD_DUR = 2.6;
function sad(t) {
  if (t <= T0) return STILL;
  const f = track([[T0, 0], [T1, 1, "io"]], t);
  let out = "", run = null, body = "";
  const flush = () => { if (run) out += `<g transform="matrix(1 ${n4(f * run[0])} 0 1 0 ${n4(f * run[1])})">${body}</g>`; run = null; body = ""; };
  for (let i = 0; i < 34; i++) {
    if (FACE[i] !== run) flush();
    if (FACE[i]) { run = FACE[i]; body += EL[i]; } else out += EL[i];
  }
  flush();
  // the tire: its top comes down with the rim, its foot stays, and its lower sidewall bulges out along the ground
  const top = 143 + SINK * f, ry = (FOOT - top) / 2, cy = (FOOT + top) / 2, g = Math.min(1, f / 0.2), bulge = f > 0.005 ? `<ellipse cx="93" cy="${n2(FOOT - (1.2 + 2.2 * f) * g)}" rx="${n2((12 + 4 * f) * g)}" ry="${n2((1.2 + 3.6 * f) * g)}" ${fill("ink")}/>` : "";
  const tire = `<ellipse cx="91" cy="${n2(cy)}" rx="12" ry="${n2(ry)}" ${fill("ink-lit")}/><ellipse cx="94" cy="${n2(cy)}" rx="12" ry="${n2(ry)}" ${fill("ink")}/>${bulge}`;
  const hub = `<g transform="translate(0 ${n2(SINK * f)})">${EL[36]}${EL[37]}</g>`;
  return `${OPEN}${out}${tire}${hub}</svg>`;
}

export const REACTIONS = { sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
