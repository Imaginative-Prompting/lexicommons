// Camera's two stories, the camera's own: it's an instant camera, and its print feed runs, the rollers pushing a finished print up out of the slot at
// the back of its top. Happy: the print rises straight and stands there, held at its foot: a clean photo of a sunny hill. Sad: the print's corner
// catches on the slot's worn lip; the rest is still pushed, so it skews, then buckles: its top folds over forward onto the camera's top, the print's
// dark back showing, only a strip of the picture left.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor, the long shadow, the camera's body, its cream top and
// its highlight, the right face, the window, the shutter button (its side and top), the lens (ring, glass, glint). The top's back edge (the slot) runs
// at about y 55-57 from x 90 to 146. A print is about 5.5 cm wide: 56 here, 1 to the millimetre.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<rect x=\"0\" y=\"144.2\" width=\"200\" height=\"55.8\" fill=\"var(--art-violet-lit,#A68CFF)\"/>\n<path d=\"M31.5 157.9L159.8 156.5L200 175.2V200H111.3Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M24.7 79.1C24.7 68.8 33.2 60.3 44 59.7L143.5 55.2C155.5 54.6 167.1 61.2 168.8 72.4C169.1 74.2 169 77.2 169 80.1V143.4C169 153.7 164.1 159.2 154.7 159.2H42C30.6 159.2 24.7 153.8 24.7 143.4Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M24.7 79.1C24.7 68.8 33.2 60.3 44 59.7L143.5 55.2C155.5 54.6 167.1 61.2 168.8 72.4L166.6 82.8L44.2 89C33.4 89 26.6 85.8 24.7 79.1Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M42 88.2C42 79.4 47.9 72.8 56.7 72.3L146.1 67.5L162 68.5L160.7 83.2L77.6 87.2C64.1 87.6 51.9 88.2 42 88.2Z\" fill=\"var(--art-paper-mid,#EDE6D5)\"/>\n<path d=\"M128.1 83.2C132.4 83.3 134.4 82.7 134.4 78.8V74.8C134.4 69.9 137.6 67.6 142.4 67.3L157.6 66.6C164.4 66.2 169 70.2 169 77.1V143.4C169 153.7 164.1 159.2 154.7 159.2H134.4V141.1L126.9 92.3Z\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n<path d=\"M138.6 75.7C138.6 72.9 140.1 71.3 142.9 71.1L155.6 70.5C159.2 70.3 161.1 71.7 161.1 75V76.6C161.1 79.1 159.7 80.4 157 80.5L142.4 81.1C139.6 81.2 138.6 79.7 138.6 77.4Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M48.5 54.2H78.1V62.5C78.1 65.7 71.6 67.3 63.3 67.3C55.1 67.3 48.5 65.7 48.5 62.5Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<ellipse cx=\"63.3\" cy=\"54.2\" rx=\"14.8\" ry=\"5.2\" fill=\"var(--art-clay,#E8743B)\"/>\n<ellipse cx=\"103.8\" cy=\"115.7\" rx=\"40.4\" ry=\"41.3\" fill=\"var(--art-ink,#231F3B)\"/>\n<ellipse cx=\"103.7\" cy=\"115.7\" rx=\"31.3\" ry=\"32\" fill=\"var(--art-sky,#58ADEB)\"/>\n<path d=\"M91.5 90C81.5 94.4 75.8 104.5 75.8 115.7C75.8 131.4 87.8 144.1 103.2 144.1C108.9 144.1 114.3 142.6 118.6 139.9C116.7 140.2 114.8 140.3 112.9 140.3C97.1 140.3 84.5 126.9 84.5 110.5C84.5 102.9 87.2 95.7 91.5 90Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/>\n</svg>\n";
export const STILL_HASH = "b89cf3819d";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 13 || !EL[3].includes("M24.7 79.1C24.7 68.8 33.2 60.3 44 59.7L143.5 55.2")) throw new Error("camera: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BACK = EL.slice(0, 3).join(""), CAMERA = EL.slice(3).join("");
// the print, in its own place (x from 0 at its left, y from 0 at its top edge): its white border, then the picture, a snapshot of a ginger cat
// looking up at the lens (the wall behind it, its ears, its striped head, eyes, muzzle and nose, its shoulders)
const PW = 56, PL = 72, X0 = 90, Y0 = 61;
const PICTURE = `<path d="M0 0H${PW}V${PL}H0Z" ${fill("paper")}/><path d="M3.5 3.5H52.5V56H3.5Z" ${fill("sky-pale")}/><path d="M8 56C8 45 17 38 29 38C41 38 50 45 50 56Z" ${fill("clay")}/>`
  + `<path d="M15.5 18L18 4.5L26 12.5ZM31 12.5L39.5 4.5L41.5 18Z" ${fill("clay")}/><path d="M18 15L19 8L23.5 12.5ZM34 12.5L38.5 8L39.5 15Z" ${fill("clay-lit")}/>`
  + `<ellipse cx="28.5" cy="24" rx="14.5" ry="12.5" ${fill("clay")}/><path d="M25.5 12L27 17.5L28.5 12ZM21 13.5L23.5 18L24.5 13ZM32.5 13L33.5 18L36 13.5Z" ${fill("clay-deep")}/>`
  + `<ellipse cx="23" cy="23.5" rx="2.3" ry="2.6" ${fill("ink")}/><ellipse cx="34" cy="23.5" rx="2.3" ry="2.6" ${fill("ink")}/><ellipse cx="28.5" cy="30" rx="6" ry="4.2" ${fill("paper")}/><path d="M26.6 27.3H30.4L28.5 29.4Z" ${fill("clay-deeper")}/>`;
// the feed: the rollers push it out, starting and stopping smoothly (u is how far out, in units)
const feed = (t, end, t1) => track([[0.15, 0], [t1, end, "io"]], t);

// ---- happy: a clean photo
const HAPPY_DUR = 2.4, OUT = 50;
function happy(t) {
  if (t <= 0) return STILL;
  const u = feed(t, OUT, 1.35);
  // (as the rollers stop, the stiff print sways a little on its held foot and comes upright)
  const sway = t > 1.25 ? track([[1.25, 0], [1.4, -1.4, "out"], [1.6, 0.8, "io"], [1.8, -0.3, "io"], [1.95, 0, "io"]], t) : 0;
  return `${OPEN}${BACK}<g transform="translate(${X0} ${n2(Y0 - u)})${sway ? ` rotate(${n2(sway)} ${PW / 2} ${n2(u)})` : ""}">${PICTURE}</g>${CAMERA}</svg>`;
}

// ---- sad: jammed
const SAD_DUR = 2.6, T_SNAG = 0.85;
// where it catches: its right edge, at the slot
const CATCH = [PW, 0];
// the side that's held is the side that buckles: a crease runs from the top edge down to the right edge, and the corner beyond it folds over
const CL = [27, 0], CR = [PW, 29];
const FLAP = `M${CL[0]} 0H${PW}V${CR[1]}Z`, BELOW = `M0 0H${CL[0]}L${PW} ${CR[1]}V${PL}H0Z`;
// the fold: the corner turned phi about the crease toward us; seen from a little above, its back shows once it's over past ~76 degrees
function folded(phi) {
  const r = (phi * Math.PI) / 180, f = Math.cos(r) - 0.25 * Math.sin(r), L = Math.hypot(CR[0] - CL[0], CR[1] - CL[1]);
  const u = [(CR[0] - CL[0]) / L, (CR[1] - CL[1]) / L], n = [u[1], -u[0]], k = f - 1, nA = n[0] * CL[0] + n[1] * CL[1];
  return { f, m: `matrix(${n4(1 + k * n[0] * n[0])} ${n4(k * n[0] * n[1])} ${n4(k * n[0] * n[1])} ${n4(1 + k * n[1] * n[1])} ${n4(-k * n[0] * nA)} ${n4(-k * n[1] * nA)})` };
}
function sad(t) {
  if (t <= 0) return STILL;
  // it feeds as the happy one does, until the corner catches; after that the rollers push on a little (less and less gets through) and stall
  const u0 = feed(T_SNAG, OUT, 1.35), u = t < T_SNAG ? feed(t, OUT, 1.35) : u0 + track([[T_SNAG, 0], [1.6, 9, "out"]], t);
  // held at its right edge, it skews: the left side keeps coming, the print turning about the caught corner
  const skew = track([[T_SNAG, 0], [1.25, 9, "out"]], t);
  // then the held side buckles: its corner folds over toward us, faster as it goes, and lands face down on the print with a little bounce
  const phi = track([[1.15, 0], [1.62, 165, "in"], [1.7, 156, "out"], [1.78, 165, "in"], [1.84, 162, "out"], [1.9, 165, "in"]], t);
  const at = `translate(${X0} ${n2(Y0 - u)}) rotate(${n2(skew)} ${CATCH[0]} ${n2(u0 + 8)})`;
  const { f, m } = folded(phi);
  if (phi < 0.01) return `${OPEN}${BACK}<g transform="${at}">${PICTURE}</g>${CAMERA}</svg>`;
  const below = `<clipPath id="lo"><path d="${BELOW}"/></clipPath><g transform="${at}"><g clip-path="url(#lo)">${PICTURE}</g></g>`;
  // (still up, it's the picture we see, foreshortened; once over, the print's pale back, a shade along the fold where it turns)
  const flap = f > 0 ? `<clipPath id="up"><path d="${FLAP}"/></clipPath><g transform="${at} ${m}"><g clip-path="url(#up)">${PICTURE}</g></g>`
    : `<g transform="${at} ${m}"><path d="${FLAP}" ${fill("paper-mid")}/><path d="M${CL[0]} 0L${CR[0]} ${CR[1]}L${n2(CR[0] - 1.6)} ${n2(CR[1] - 3)}L${n2(CL[0] + 2.6)} 0Z" ${fill("paper-deep")}/></g>`;
  return `${OPEN}${BACK}${below}${flap}${CAMERA}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
