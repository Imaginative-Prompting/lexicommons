// The train's two stories. Happy: the camera draws back to show a coach waiting further up the line; the train backs up to it, gently, and couples:
// a small jolt, and it stands three cars long. Sad: the engine sets off, and its coach starts after it, but the coupling slips: the coach rolls to
// a stop with its coupling swinging down, and the engine goes on without it, out of the frame.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view; the world carries on past its frame.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"0\" y=\"148\" width=\"200\" height=\"52\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<path d=\"M16 148H179.8L200 158.4V200H120.9Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<rect x=\"0\" y=\"144.7\" width=\"200\" height=\"3.9\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n<path d=\"M50.8 89.1H102.9C110.1 89.1 115.7 95.3 115.7 103.1V129.6C115.7 135.5 111.4 139.4 105.8 139.4H17.5C10.5 139.4 6.4 135.2 6.4 129.1C6.4 122.8 11.2 115.3 15.5 110.1C26.8 96.6 38 89.1 50.8 89.1Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M50.8 89.1H105.9C109.2 100.8 107.1 112.3 100.4 120C94.2 127.1 84.8 130.6 73.1 130.6H6.5C5.5 124.3 10.8 115.8 15.5 110.1C26.8 96.6 38 89.1 50.8 89.1Z\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M72.1 90.8C72.5 87.3 74.7 84.9 77.9 84.9H99.7C103 84.9 105.3 87.2 105.7 90.8Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M26.3 98.2H37.1C40 98.2 41.1 100.6 39.9 103.6L37.9 108.7C35.5 114.7 30.4 117.8 22.5 117.8H10C14.3 110.8 20 104 26.3 98.2Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<rect x=\"45.2\" y=\"102.6\" width=\"16\" height=\"13.8\" rx=\"3.4\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<rect x=\"65\" y=\"102.6\" width=\"16\" height=\"13.8\" rx=\"3.4\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<rect x=\"84.9\" y=\"102.6\" width=\"16\" height=\"13.8\" rx=\"3.4\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M130.2 92.8H180.8C188 92.8 193 97.8 193 104.8V129.9C193 135.4 189 139.4 183.6 139.4H128C122.1 139.4 118.3 135.3 118.3 129.6V105C118.3 98.2 123.4 92.8 130.2 92.8Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M130.2 92.8H180.8C182.4 92.8 184 93 185.3 93.6C189 103.8 187.7 113.7 181.7 120.8C176.1 127.3 167.6 130.6 156.1 130.6H118.3V105C118.3 98.2 123.4 92.8 130.2 92.8Z\" fill=\"var(--art-teal,#37B39B)\"/>\n<rect x=\"114.5\" y=\"124.4\" width=\"5.1\" height=\"6.4\" rx=\"2.5\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<rect x=\"125.5\" y=\"103\" width=\"16.2\" height=\"13.4\" rx=\"3.5\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<rect x=\"146.5\" y=\"103\" width=\"16.2\" height=\"13.4\" rx=\"3.5\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<rect x=\"167.5\" y=\"103\" width=\"16.2\" height=\"13.4\" rx=\"3.5\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<circle cx=\"25.6\" cy=\"139.3\" r=\"6.7\" fill=\"var(--art-ink,#231F3B)\"/>\n<circle cx=\"50.8\" cy=\"139.3\" r=\"6.7\" fill=\"var(--art-ink,#231F3B)\"/>\n<circle cx=\"75\" cy=\"139.3\" r=\"6.7\" fill=\"var(--art-ink,#231F3B)\"/>\n<circle cx=\"99.2\" cy=\"139.3\" r=\"6.7\" fill=\"var(--art-ink,#231F3B)\"/>\n<circle cx=\"136.6\" cy=\"139.3\" r=\"6.7\" fill=\"var(--art-ink,#231F3B)\"/>\n<circle cx=\"176.2\" cy=\"139.3\" r=\"6.7\" fill=\"var(--art-ink,#231F3B)\"/>\n</svg>\n";
export const STILL_HASH = "f9778e417d";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 23) throw new Error("train: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const pick = (...ix) => ix.map((i) => EL[i]).join("");
const ENGINE = pick(4, 5, 6, 7, 8, 9, 10, 17, 18, 19, 20), COACH = pick(11, 12, 14, 15, 16, 21, 22), COUPLING = EL[13];
// the coupling hangs from the coach's end, here
const PIN = [119.6, 127.6];
// ---- the world past the frame: the sky, the ground, the rail; and the train's shadow, the still's own, carried on to its roofline's shadow and
// split between the cars along the light (so each car takes its own)
const WORLD = `<rect x="-400" y="-400" width="1000" height="548" ${fill("sun")}/><rect x="-400" y="148" width="1000" height="400" ${fill("sun-lit")}/>`;
const RAIL = `<rect x="-400" y="144.7" width="1000" height="3.9" ${fill("ink-lit")}/>`;
const FAR = 330, LEFT_SLOPE = (200 - 148) / (120.9 - 16), RIGHT_SLOPE = (158.4 - 148) / (200 - 179.8);
const farL = 16 + (FAR - 148) / LEFT_SLOPE, farR = 179.8 + (FAR - 148) / RIGHT_SLOPE, SPLIT = 118, farS = SPLIT + (FAR - 148) / ((LEFT_SLOPE + RIGHT_SLOPE) / 2);
// (the engine's reaches a hair under the coach's, so no seam shows between them)
const ENGINE_SHADOW = `M16 148L${SPLIT + 0.8} 148L${n2(farS + 0.8)} ${FAR}L${n2(farL)} ${FAR}Z`, COACH_SHADOW = `M${SPLIT} 148L179.8 148L${n2(farR)} ${FAR}L${n2(farS)} ${FAR}Z`;
const shadow = (d, dx) => `<path d="${d}"${dx ? ` transform="translate(${n2(dx)} 0)"` : ""} ${fill("sun-deep")}/>`;
const moved = (svg, dx) => (dx ? `<g transform="translate(${n2(dx)} 0)">${svg}</g>` : svg);
function view(t, z, fx, fy, inner) {
  const cam = z === 1 && fx === 100 && fy === 100 ? "" : `translate(100 100) scale(${n4(z)}) translate(${n2(-fx)} ${n2(-fy)})`;
  return `${OPEN}${cam ? `<g transform="${cam}">${inner}</g>` : inner}</svg>`;
}

// ---- happy. The coach waiting up the line, as the train's own, 100 further on, its coupling at its near end.
const PARKED = 100, BACK = 22;
const HAPPY_DUR = 2.3;
function happy(t) {
  if (t <= 0) return STILL;
  const s = track([[0.02, 0], [0.75, 1, "io"]], t);
  const z = 1 + (0.68 - 1) * s, fx = 100 + 50 * s, fy = 100 + 20 * s;
  // it backs up, slowing as it comes, and couples: the waiting coach jolts on its brakes, the train gives back a touch, and both settle
  const dx = track([[0.62, 0], [1.38, BACK - 0.6, "io"], [1.46, BACK, "out"], [1.52, BACK - 0.7, "io"], [1.6, BACK - 0.35, "io"]], t);
  const jolt = track([[1.46, 0], [1.5, 1.4, "out"], [1.58, -0.3, "io"], [1.66, 0, "io"]], t);
  const parked = `<g transform="translate(${n2(PARKED + jolt)} 0)">${COUPLING}${COACH}</g>`;
  const inner = `${WORLD}${shadow(ENGINE_SHADOW, dx)}${shadow(COACH_SHADOW, dx)}${shadow(COACH_SHADOW, PARKED + jolt)}${RAIL}${moved(ENGINE + COUPLING + COACH, dx)}${parked}`;
  return view(t, z, fx, fy, inner);
}

// ---- sad. The engine pulls away from rest, faster and faster; the coach comes a little way, then the coupling slips off the engine: the coach
// rolls on a touch and stops, its coupling swinging down from the coach's end and hanging; the engine runs on, out of the frame.
const GO = 0.15, ACC = 320, SLIP = 0.48;
const engineX = (t) => -0.5 * ACC * Math.max(0, t - GO) ** 2;
const AT_SLIP = engineX(SLIP), V_SLIP = ACC * (SLIP - GO);
const STOP = 0.18;
function coachX(t) {
  if (t <= SLIP) return engineX(t);
  const s = Math.min(t - SLIP, STOP);
  // coasting to a stop on its own: slowing evenly
  return AT_SLIP - (V_SLIP * s - (0.5 * V_SLIP * s * s) / STOP);
}
const swing = (t) => track([[SLIP, 0], [SLIP + 0.2, -96, "in"], [SLIP + 0.32, -72, "out"], [SLIP + 0.44, -88, "io"], [SLIP + 0.56, -79, "io"], [SLIP + 0.68, -82, "io"]], t);
const SAD_DUR = SLIP + 0.68 + 0.6;
function sad(t) {
  if (t <= 0) return STILL;
  const ex = engineX(t), cx = coachX(t), a = swing(t);
  const coupling = a ? `<g transform="rotate(${n2(a)} ${PIN[0]} ${PIN[1]})">${COUPLING}</g>` : COUPLING;
  // (its long shadow follows it out: it's drawn till the end, by when both are far past the frame's left edge)
  const inner = `${WORLD}${shadow(ENGINE_SHADOW, ex)}${shadow(COACH_SHADOW, cx)}${RAIL}${moved(ENGINE, ex)}${moved(coupling + COACH, cx)}`;
  return view(t, 1, 100, 100, inner);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
