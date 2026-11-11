// Letter's two stories, the sun's own: nothing comes in. A day goes by in a few seconds: the sun climbs, so the letter's shadow draws in
// towards it, and its warmth gets into the wax seal. Happy: the wax softens just enough; the folded flap's own spring peels it free, and the
// flap springs up and open, rocking back to lean against the wall, the folded letter inside showing at the envelope's mouth. Sad: the wax
// goes past soft: the seal slumps and runs, a drip of it creeping down the envelope's face to its foot, the flap still stuck fast.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<rect x=\"0\" y=\"143.9\" width=\"200\" height=\"56.1\" fill=\"var(--art-violet-lit,#A68CFF)\"/>\n<path d=\"M35.5 170.4L168.5 151.5L200 169.6L200 200L118.7 200Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M23.7 77.7L160.7 60.6L172.3 153.4L35.5 170.4Z\" fill=\"var(--art-paper-mid,#EDE6D5)\"/>\n<path d=\"M91.9 118.5L166 101.5L172.3 153.4L124.9 159.3Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M23.7 77.7L93.2 115.3L126.9 158.9L35.5 170.4Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M160.7 60.6L166 102.3L126.1 159.2L90.6 119Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M23.7 77.7L160.7 60.6L92 119.1Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M138.2 80.2L140.2 80Q140.4 81.5 141.7 81.3Q143 81.1 142.8 79.7L144.8 79.4Q145 80.9 146.3 80.7Q147.6 80.5 147.4 79.1L149.4 78.8Q149.6 80.3 150.9 80.1Q152.2 79.9 152 78.5L154 78.3Q154.2 79.7 155.5 79.5Q156.8 79.3 156.6 77.9L158.6 77.7L158.9 79.8Q157.4 80 157.6 81.3Q157.8 82.6 159.2 82.4L159.5 84.6Q158 84.8 158.2 86.1Q158.4 87.4 159.8 87.2L160.1 89.4Q158.6 89.6 158.8 90.9Q159 92.2 160.4 92L160.7 94.2Q159.2 94.4 159.4 95.7Q159.6 97 161 96.8L161.3 99.1L159.3 99.3Q159.1 97.8 157.8 98Q156.5 98.2 156.7 99.6L154.7 99.9Q154.5 98.4 153.2 98.6Q151.9 98.8 152.1 100.2L150.1 100.5Q149.9 99 148.6 99.2Q147.3 99.4 147.5 100.8L145.5 101Q145.3 99.6 144 99.8Q142.7 100 142.9 101.4L140.3 101.7L140.1 99.6Q141.6 99.4 141.4 98.1Q141.2 96.8 139.8 97L139.5 94.8Q141 94.6 140.8 93.3Q140.6 92 139.2 92.2L138.9 90Q140.4 89.8 140.2 88.5Q140 87.2 138.6 87.4L138.3 85.2Q139.8 85 139.6 83.7Q139.4 82.4 138 82.6Z\" fill=\"var(--art-sky,#58ADEB)\"/>\n<circle cx=\"149.5\" cy=\"89.7\" r=\"3.6\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M148.2 82.8Q148.1 82.3 148.6 82.2Q149.1 82.1 149.2 82.6L149.5 84.7Q149.6 85.2 149.1 85.3Q148.6 85.4 148.5 84.9Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M153.5 83.9Q153.8 83.5 154.2 83.8Q154.7 84.1 154.3 84.5L153 86.2Q152.7 86.6 152.3 86.3Q151.9 86 152.2 85.6Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M156.2 88.3Q156.8 88.2 156.8 88.7Q156.9 89.2 156.4 89.3L154.3 89.6Q153.8 89.7 153.7 89.2Q153.6 88.7 154.1 88.6Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M155.3 93.7Q155.7 94 155.3 94.4Q155 94.8 154.6 94.5L153 93.1Q152.6 92.8 152.9 92.4Q153.2 92 153.6 92.3Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M150.4 94.3Q150.9 94.2 151 94.7L151.3 96.7Q151.4 97.2 150.9 97.3Q150.4 97.4 150.3 96.9L150 94.9Q149.9 94.4 150.4 94.3Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M146.3 93Q146.6 92.6 147 92.9Q147.4 93.2 147.1 93.6L145.8 95.4Q145.5 95.8 145.1 95.5Q144.7 95.2 145 94.8Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M142.7 90Q142.2 90.1 142.3 90.6Q142.3 91.1 142.9 91L145 90.7Q145.5 90.6 145.4 90.1Q145.3 89.6 144.8 89.7Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M144.5 85Q144.1 84.7 143.8 85.1Q143.4 85.5 143.8 85.8L145.5 87.2Q145.9 87.5 146.2 87.1Q146.6 86.7 146.2 86.4Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<ellipse cx=\"92.1\" cy=\"118.7\" rx=\"11.5\" ry=\"11.7\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M101 111.1C98.3 107.5 94.3 106.1 90.2 107.2C83.9 108.4 79.8 114.4 80.8 120.6C81.2 123.5 82.7 126 84.7 127.8C90.2 128.2 96.1 125 99 120C100.7 117.2 101.5 113.9 101 111.1Z\" fill=\"var(--art-clay,#E8743B)\"/>\n</svg>\n";
export const STILL_HASH = "57fe5e60f3";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 20) throw new Error("letter: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const pts = (P) => P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
// the still's order: wall, floor, shadow; the envelope's back (3), its lower right fold (4), the side flaps (5, 6), the top flap (7), the
// stamp (8–17, on the right side flap), the seal (18, 19) at the flap's tip
const WALL_FLOOR = EL[0] + EL[1], BACK = EL[3] + EL[4], SIDES = EL[5] + EL[6], FLAP = EL[7], STAMP = EL.slice(8, 18).join(""), SEAL = EL[18] + EL[19];
const HINGE = [[23.7, 77.7], [160.7, 60.6]], TIP = [92, 119.1];

// ---- the day: the shadow's far edge comes in towards the letter's foot as the sun climbs (its near edge, the foot, stays). Inside the frame
// at the start it's the still's own: carried on past the frame along the still's own edges.
const FOOT_L = [35.5, 170.4], FOOT_R = [168.5, 151.5], FAR_L = [183, 65.1], FAR_R = [69.3, 39.8];
const shadow = (k) => `<polygon points="${pts([FOOT_L, FOOT_R, [FOOT_R[0] + FAR_R[0] * k, FOOT_R[1] + FAR_R[1] * k], [FOOT_L[0] + FAR_L[0] * k, FOOT_L[1] + FAR_L[1] * k]])}" ${fill("violet-deep")}/>`;
const day = (t) => 1 - 0.45 * track([[0.1, 0], [1.7, 1, "io"]], t);

// ---- happy. The flap turns up about its fold (what's off the fold comes towards us, shortened across it; past edge on, its inside, the
// lining, faces us above the fold); the seal goes with it, on its outside. The mouth it uncovers: the envelope's inside in its own shade,
// and the folded letter's top edge, with its fold line.
function foldMatrix(a, b, phi) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l, k = 1 - Math.cos(phi), d = a[0] * nx + a[1] * ny;
  return [1 - k * nx * nx, -k * nx * ny, -k * nx * ny, 1 - k * ny * ny, k * d * nx, k * d * ny];
}
const matrix = (m) => `matrix(${m.slice(0, 4).map(n4).join(" ")} ${n2(m[4])} ${n2(m[5])})`;
const MOUTH = `<path d="M${HINGE[0].join(" ")}L${HINGE[1].join(" ")}L${TIP.join(" ")}Z" ${fill("paper-deeper")}/>`;
// the letter inside, its top edge 8 below the envelope's and parallel to it, folded in three (its upper fold shows at the mouth)
// (kept inside what the side flaps cover, so nothing of it shows until the top flap lifts)
const SHEET = `<polygon points="31.5,86.6 151.6,71.6 136,138 40,150" ${fill("paper-mid")}/><polygon points="35,107.4 147.2,93.4 147,94.8 35.2,108.8" ${fill("paper-deep")}/>`
  // the side flaps' top edges throw a thin shade on it, inside
  + `<polygon points="23.7,77.7 93.2,115.3 92.2,119 23.7,80.9" ${fill("paper-deep")}/><polygon points="160.7,60.6 90.6,119 92.8,121.4 160.7,64.2" ${fill("paper-deep")}/>`;
const LINING = FLAP.replace(paint("paper-deep"), paint("paper-mid"));
const T_GIVE = 0.95, T_OPEN = 1.45;
const HAPPY_DUR = 1.85 + 0.6;
function happy(t) {
  if (t <= 0) return STILL;
  // the seal lets go with a little start; the flap springs up past upright and settles leaning back against the wall
  const phi = (Math.PI / 180) * track([[T_GIVE - 0.12, 0], [T_GIVE, 7, "in"], [T_OPEN, 158, "out"], [T_OPEN + 0.16, 146, "io"], [T_OPEN + 0.3, 152, "io"], [T_OPEN + 0.42, 150, "io"]], t);
  const m = matrix(foldMatrix(HINGE[0], HINGE[1], phi)), up = phi > Math.PI / 2;
  // its outside turns up to the light as it lifts, so it lightens to the lining's own tone by the time it's edge on, and past that the
  // lining shows: the same tone, so the turn shows nothing (the flap stays the same two parts throughout)
  const lit = up ? 1 : Math.max(0, Math.min(1, (phi - Math.PI / 6) / ((55 * Math.PI) / 180)));
  const flap = `<g transform="${m}">${FLAP}${lit > 0.004 ? LINING.replace("/>", lit < 1 ? ` opacity="${n2(lit)}"/>` : "/>") : ""}${up ? "" : SEAL}</g>`;
  return `${OPEN}${WALL_FLOOR}${shadow(day(t))}${BACK}${MOUTH}${SHEET}${SIDES}${STAMP}${flap}</svg>`;
}

// ---- sad. The seal sags as it softens (lower and wider, its foot bulging down), then runs: a drip creeps down from its foot, the envelope's
// face being near upright (a slow, thick run, slowing as the wax cools along it), a bead at its end; a second, shorter one beside it.
const SEAL_FOOT = [91, 129.5];
const drip = (x0, len, w) => {
  if (len < 0.2) return "";
  const x1 = x0 + len * 0.12, y0 = SEAL_FOOT[1] - 3, y1 = y0 + len, r = w * 0.72;
  return `<path d="M${n2(x0 - w)} ${n2(y0)}C${n2(x0 - w * 0.6)} ${n2(y0 + len * 0.5)} ${n2(x1 - r * 0.7)} ${n2(y1 - r * 2.2)} ${n2(x1 - r)} ${n2(y1 - r)}`
    + `A${n2(r)} ${n2(r)} 0 0 0 ${n2(x1 + r)} ${n2(y1 - r)}C${n2(x1 + r * 0.7)} ${n2(y1 - r * 2.2)} ${n2(x0 + w * 0.6)} ${n2(y0 + len * 0.5)} ${n2(x0 + w)} ${n2(y0)}Z" ${fill("clay")}/>`
    + `<path d="M${n2(x1 + r * 0.15)} ${n2(y1 - r * 0.1)}A${n2(r)} ${n2(r)} 0 0 0 ${n2(x1 + r)} ${n2(y1 - r)}C${n2(x1 + r * 0.7)} ${n2(y1 - r * 2.2)} ${n2(x0 + w * 0.6)} ${n2(y0 + len * 0.5)} ${n2(x0 + w)} ${n2(y0)}L${n2(x0 + w * 0.55)} ${n2(y0)}C${n2(x0 + w * 0.3)} ${n2(y0 + len * 0.5)} ${n2(x1 + r * 0.3)} ${n2(y1 - r * 2)} ${n2(x1 + r * 0.15)} ${n2(y1 - r * 0.1)}Z" ${fill("clay-deep")}/>`;
};
const SAD_DUR = 1.9 + 0.6;
function sad(t) {
  if (t <= 0) return STILL;
  const soft = track([[0.55, 0], [1.0, 1, "io"]], t);
  // (sagging about its top: down and out)
  const sag = `translate(${SEAL_FOOT[0]} 107.2) scale(${n4(1 + 0.12 * soft)} ${n4(1 + 0.1 * soft)}) translate(${-SEAL_FOOT[0]} -107.2)`;
  const run = track([[0.85, 0], [1.9, 1, "out"]], t), run2 = track([[1.1, 0], [1.9, 1, "out"]], t);
  const seal = `${drip(SEAL_FOOT[0] + 1, 26 * run, 3.2)}${drip(SEAL_FOOT[0] - 6.5, 11 * run2, 2.1)}<g transform="${sag}">${SEAL}</g>`;
  return `${OPEN}${WALL_FLOOR}${shadow(day(t))}${BACK}${SIDES}${FLAP}${STAMP}${seal}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
