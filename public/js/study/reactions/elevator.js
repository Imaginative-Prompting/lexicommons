// Elevator's two stories, its doors' own: its time is up and the door drive closes the two leaves, each sliding out of its pocket behind the frame.
// Happy: they glide shut and meet in one clean seam. Sad: the left leaf's bottom corner catches on the sill; the drive goes on pushing its top along
// the track, so it racks over about the caught corner, and the right leaf stops against its leaning top: a crooked door over a triangle of cabin.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor, the frame, the right jamb's inner face, the cabin
// (its back wall, top band, rail, floor), the two leaves (18 of their 39 showing: 54-72 and 114-132), the header, the sill, the call panel and its
// two lit buttons. The doorway is 54-132 across, 39-178 down; the leaves meet at 93. The doorway (1.65 m) is 78 here: 47 to the meter.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<rect x=\"0\" y=\"178\" width=\"200\" height=\"22\" fill=\"var(--art-violet-lit,#A68CFF)\"/>\n<rect x=\"48\" y=\"32\" width=\"90\" height=\"146\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<rect x=\"109\" y=\"39\" width=\"5\" height=\"139\" fill=\"var(--art-paper-deeper,#BDB19A)\"/>\n<rect x=\"76\" y=\"39\" width=\"34\" height=\"139\" fill=\"var(--art-sun-lit,#FAD57E)\"/>\n<rect x=\"76\" y=\"39\" width=\"34\" height=\"7\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<rect x=\"76\" y=\"121\" width=\"34\" height=\"2\" fill=\"var(--art-sun,#F7BE45)\"/>\n<rect x=\"76\" y=\"118\" width=\"34\" height=\"3.6\" rx=\"0.8\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<rect x=\"76\" y=\"163\" width=\"34\" height=\"15\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<rect x=\"54\" y=\"39\" width=\"18\" height=\"139\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<rect x=\"114\" y=\"39\" width=\"18\" height=\"139\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<rect x=\"54\" y=\"38\" width=\"78\" height=\"2\" fill=\"var(--art-paper-deeper,#BDB19A)\"/>\n<rect x=\"54\" y=\"175.5\" width=\"78\" height=\"2.5\" fill=\"var(--art-steel,#A9B0BF)\"/>\n<rect x=\"144\" y=\"86\" width=\"11\" height=\"27\" rx=\"1\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n<circle cx=\"149.5\" cy=\"95\" r=\"2.8\" fill=\"var(--art-sun,#F7BE45)\"/>\n<circle cx=\"149.5\" cy=\"104\" r=\"2.8\" fill=\"var(--art-sun,#F7BE45)\"/>\n</svg>\n";
export const STILL_HASH = "51fffd82ed";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 16 || !EL[9].includes('x="54" y="39" width="18" height="139"')) throw new Error("elevator: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BACK = EL.slice(0, 9).join(""), FRONT = EL.slice(11).join("");
// the leaves are drawn whole (39 wide) and shown only inside the doorway: the rest of each is in its pocket behind the frame
const DOOR = '<clipPath id="dw"><path d="M54 39H132V178H54Z"/></clipPath>';
const W = 39, TOP = 39, BOT = 178, TRAVEL = 21;
// a leaf: its leading edge at x (the left leaf's right edge, the right leaf's left edge), turned a degrees about (cx, cy); with a hair of shade on its leading edge
const leaf = (left, x, sh, a = 0, c = [0, 0]) => {
  const x0 = left ? x - W : x, edge = left ? x - sh : x;
  const body = `<path d="M${n2(x0)} ${TOP}H${n2(x0 + W)}V${BOT}H${n2(x0)}Z" ${fill("paper")}/>` + (sh > 0.01 ? `<path d="M${n2(edge)} ${TOP}H${n2(edge + sh)}V${BOT}H${n2(edge)}Z" ${fill("paper-deep")}/>` : "");
  return a ? `<g transform="rotate(${n2(a)} ${n2(c[0])} ${n2(c[1])})">${body}</g>` : body;
};
// the drive: from rest, up to speed, slowing to the close
const drive = (t) => track([[0.25, 0], [1.35, 1, "io"]], t);
// (in the still the leaves have no edge shade: it grows in from nothing as they start to move)
const still = (t) => t <= 0.25;
const shade = (t) => 0.9 * Math.min(1, (t - 0.25) / 0.2);

// ---- happy: shut
const HAPPY_DUR = 2.2;
function happy(t) {
  if (t <= 0 || still(t)) return STILL;
  const k = drive(t), x = 72 + TRAVEL * k;
  // (the two leading edges meet; the seam between them is their two shaded edges)
  return `${OPEN}${BACK}${DOOR}<g clip-path="url(#dw)">${leaf(true, x, shade(t))}${leaf(false, 114 - TRAVEL * k, shade(t))}</g>${FRONT}</svg>`;
}

// ---- sad: jammed
const SAD_DUR = 2.4, CATCH = 6, RACK = 6;
// when the left leaf's bottom corner meets the snag in the sill: 6 along its 21 (the 15 the drive has left rack it the 6 degrees: 139 x sin 6 = 14.5)
const K_CATCH = CATCH / TRAVEL;
function sad(t) {
  if (t <= 0 || still(t)) return STILL;
  const k = drive(t);
  let lx = 72 + TRAVEL * k, a = 0, corner = [0, 0], rx = 114 - TRAVEL * k;
  if (k > K_CATCH) {
    // caught: its bottom corner stays at the snag; the drive goes on carrying its top along the track, so it racks over, until the motor stalls
    lx = 72 + CATCH; corner = [lx, BOT];
    const push = TRAVEL * (k - K_CATCH), H = BOT - TOP;
    a = Math.min(RACK, (Math.asin(Math.min(1, push / H)) * 180) / Math.PI);
    // (stalled, it shudders once on the motor and holds)
    const tStall = (() => { let lo = 0.25, hi = 1.35; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; const p = TRAVEL * (drive(m) - K_CATCH); if (Math.asin(Math.min(1, p / H)) * 180 / Math.PI < RACK) lo = m; else hi = m; } return (lo + hi) / 2; })();
    if (t > tStall) a = RACK + track([[tStall, 0], [tStall + 0.06, 0.5, "out"], [tStall + 0.14, -0.25, "io"], [tStall + 0.22, 0, "io"]], t);
    // the right leaf comes on until it meets the leaning leaf's top corner, and stops there
    const topX = lx + H * Math.sin((a * Math.PI) / 180);
    rx = Math.max(rx, topX);
  }
  return `${OPEN}${BACK}${DOOR}<g clip-path="url(#dw)">${leaf(true, lx, shade(t), a, corner)}${leaf(false, rx, shade(t))}</g>${FRONT}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
