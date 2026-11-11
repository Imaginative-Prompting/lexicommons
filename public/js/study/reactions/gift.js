// Gift's two stories. Happy: something alive inside wants out: it knocks the lid up as far as the ribbon lets it, dragging the box's base off
// the floor a little, and it falls back; then again, harder and a touch lopsided (pushed at one corner); the bow's loops spring and its tails swing with
// each knock, and it settles. The contents are never seen. Sad: the bow wilts: one tall loop sags, buckles
// and flops over onto the lid, lying there flat; then the other.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<rect x=\"0\" y=\"141\" width=\"200\" height=\"59\" fill=\"var(--art-teal-lit,#6FD0BD)\"/>\n<path d=\"M22.2 167.4 112 153 145.8 148.5 200 166.8 200 200 116.5 200Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M22.2 96 115.5 105.5 115.5 178.9 22.2 167.5Z\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M114.5 105 146 84.5 146 148.7 114.5 178.9Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M22.2 96 115.5 105.5 115.5 113.3 22.2 103.4Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M114.5 105 146 84.5 146 91.7 114.5 114Z\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n<path d=\"M61.1 85 77.1 87 77.1 174.6 61.1 172.6Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M18.5 81.1 52.6 60.8 149.4 69.8 115.2 90.2Z\" fill=\"var(--art-violet-lit,#A68CFF)\"/>\n<path d=\"M34.7 72.3 48.5 64.1 129.1 81.5 141.2 74.3 60.9 60.1 52.6 60.8Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M61 87.3 95.9 64.7 111.8 66.2 77.1 88.9Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M18.5 81.1 115.3 90 115.3 110.1 18.5 99.9Z\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M115.2 90 149.4 69.8 149.4 87.2 115.2 110.1Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M61.1 86.1 77.1 87.8 77.1 106.2 61.1 104.5Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M33.7 51.4C31.8 44.4 42.3 33.2 49.5 30.1 59.1 25.9 67.5 30.8 72.8 40.8 76.4 47.5 78 55.1 79 63.8L74.4 67.6C67.4 59.8 61.2 51.9 53.5 47 44.9 41.5 36.5 43.8 33.7 51.4Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M33.7 51.1C33 59.7 43.8 67.9 55.3 70.1 61.5 71.3 68.2 71.7 74.4 71.9L75.1 64.6C65.3 60.3 55.3 54.8 53.5 47 44.7 41.3 35.6 43.6 33.7 51.1Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M87.7 59.5C94.4 46.1 107.1 34.1 118.1 33.6 129.4 32.8 132.8 41.3 135.2 52.1 136 55.4 135.3 58.5 134 60.7 136.6 50.4 127 48.5 118.5 51.8 108.8 55.3 99.9 62.6 91.3 70.8L87.7 59.5Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M121 50.7C118.9 57.8 109.6 63 99.9 65.1L88.7 72.3C99.2 76.1 111.5 76.3 120.8 72.3 129 68.8 134.2 62.8 135.1 57 136.3 51.6 129.2 49.3 121 50.7Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M78.9 72.7C67.8 70.9 57.6 74.4 48.8 82.5 41 89.8 37 100 34.2 110.8 32.8 115 30.2 118.2 26.9 120.9L40.3 115.6 47.6 128.1C52 118.3 53.7 109 57.1 98.5 60.6 87.4 67.3 80.9 80.2 76.5Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M60.9 86.5C66.1 80.4 72.8 77 80.3 75.2L77.8 72.9C70.3 75.6 64.5 79.9 60.9 86.5Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M86.4 73.5C91.1 79 93.5 86.6 93.3 95.6 93.1 105.3 91.3 116.4 88.4 125.5L103.7 112.9 111.5 121.7C114.4 112.9 113.7 101.6 109.4 91.6 105.6 82.8 99.7 76.7 91.4 73.1Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M75.3 60.5C78.3 56.4 84.9 56.2 89.2 58.6 93.3 60.9 94.9 65.3 92.7 69.2L89.8 73.9C86.4 76.2 79.5 75.8 75.6 73.6 72.9 72 73.9 67.4 74.2 64.6Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n</svg>\n";
export const STILL_HASH = "cf56757641";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 22) throw new Error("gift: the still isn't as this story knows it");
const ROOM = EL.slice(0, 3).join(""), BOX = EL[3] + EL[4], UNDER_LID = EL[5] + EL[6], BAND = EL[7];
const LID = EL.slice(8, 14).join(""), LOOPS = EL.slice(14, 18).join(""), TAILS = EL.slice(18, 21).join(""), KNOT = EL[21];
// the box's own top, under the lid: its rim (the tops of its walls) and the dark inside; and its front and side, to keep the lid's shadows on
const FRONT_D = EL[3].match(/ d="([^"]+)"/)[1], SIDE_D = EL[4].match(/ d="([^"]+)"/)[1];
const BOX_TOP = `<path d="M22.2 96L115.5 105.5L146 84.5L52.7 75Z" fill="${paint("violet-lit")}"/><path d="M24.7 95.8L114.2 104.9L143.5 84.7L54 75.6Z" fill="${paint("ink")}"/>`;
// the knot, where the bow is tied to the lid; the loops spring about their foot there, the tails hang from it
const KNOT_AT = [84, 66];
const G = 3040; // the box is about 0.3 m across: 310 units a meter

// ---- happy. Two knocks from inside. The ribbon is tied round the box and the lid together, so the lid can only rise as far as its slack (3
// units, about a centimeter): each knock throws the lid up to the ribbon, the ribbon goes taut and drags the box's base up off the floor, a short
// hop on one parabola; the box lands, and the lid drops back onto its rim a moment after. The second knock is harder and off to one corner, so
// the lid tips a little within the slack.
const KNOCKS = [{ at: 0.3, box: 2, rel: 2.5 }, { at: 0.75, box: 4.5, rel: 3, tip: -1.2 }];
const TAUT = 0.05, DROP = 0.05; // the lid takes up the slack in three frames; it drops back onto the rim after the box lands
const flight = (k) => 2 * Math.sqrt((2 * k.box) / G);
function boxAt(t) {
  for (const k of KNOCKS) {
    const s = t - k.at - TAUT, T = flight(k);
    if (s > 0 && s < T) { const v = Math.sqrt(2 * G * k.box); return -(v * s - 0.5 * G * s * s); }
  }
  return 0;
}
function lidAt(t) {
  const by = boxAt(t);
  let rel = 0, tip = 0;
  for (const k of KNOCKS) {
    const s = t - k.at, T = TAUT + flight(k);
    if (s <= 0 || s > T + DROP) continue;
    rel = k.rel * track([[0, 0], [TAUT, 1, "io"], [T, 1], [T + DROP, 0, "in"]], s);
    tip = (k.tip ?? 0) * Math.sin(Math.PI * Math.min(1, s / (T + DROP)));
  }
  return { dx: 0, dy: by - rel, tip };
}
// each knock and each landing is a jolt the ribbon answers: the loops squash and spring back (about 5 a second, dying fast), the tails swing
function ring(t, amp, w, damp) {
  let v = 0;
  for (const k of KNOCKS) for (const at of [k.at, k.at + TAUT + flight(k) + DROP]) {
    const s = t - at;
    if (s > 0) v += amp * (k.box / 4.5) * Math.exp(-damp * s) * Math.sin(w * s);
  }
  return v;
}
const SETTLED = KNOCKS[1].at + TAUT + flight(KNOCKS[1]) + DROP + 0.9;
const HAPPY_DUR = SETTLED + 0.4;
function happy(t) {
  if (t <= 0) return STILL;
  const { dx, dy, tip } = lidAt(t);
  const fade = 1 - track([[SETTLED - 0.4, 0], [SETTLED, 1, "io"]], t);
  const squash = 1 - ring(t, 0.1, 32, 7) * fade, swing = ring(t, 3, 14, 5) * fade;
  const loops = Math.abs(squash - 1) < 1e-4 ? LOOPS : `<g transform="translate(${KNOT_AT[0]} ${KNOT_AT[1]}) scale(1 ${n4(squash)}) translate(${-KNOT_AT[0]} ${-KNOT_AT[1]})">${LOOPS}</g>`;
  const tails = Math.abs(swing) < 0.01 ? TAILS : `<g transform="rotate(${n2(swing)} ${KNOT_AT[0]} ${KNOT_AT[1]})">${TAILS}</g>`;
  const lift = `translate(${n2(dx)} ${n2(dy)})${tip ? ` rotate(${n2(tip)} 115 100)` : ""}`;
  // (each moving thing keeps the same holder all the way through, so it's followed as one thing)
  const moved = (svg) => `<g transform="${lift}">${svg}</g>`;
  // the box hops on its own (its shadow stays on the floor, so the floor under it shows dark); the shadow the lid's rim throws on the box
  // rides with the lid; the band stays on the box
  const by = boxAt(t), onBox = (svg) => `<g transform="translate(0 ${n2(by)})">${svg}</g>`;
  // (once the lid's off the rim, the gap shows the box's own top: its rim and the dark inside; the shadows the lid's rim throws stay on the
  // box's faces)
  const at = ` transform="translate(0 ${n2(by)})"`;
  const shade = `<clipPath id="bf"><path d="${FRONT_D}"${at}/></clipPath><clipPath id="bs"><path d="${SIDE_D}"${at}/></clipPath><g clip-path="url(#bf)">${moved(EL[5])}</g><g clip-path="url(#bs)">${moved(EL[6])}</g>`;
  return `${OPEN}${ROOM}${onBox(BOX + BOX_TOP)}${shade}${onBox(BAND)}${moved(LID + loops + tails + KNOT)}</svg>`;
}

// ---- sad. Each loop, standing on the knot (its foot B, its reach towards its far end), sags a few degrees, then goes over under gravity, turning
// about its foot, onto the lid, and lies there: flat, so its width foreshortens as the lid's depth does (0.45, along the lid's depth axis),
// diagonally towards the lid's front corner so all of it lies on the lid. A small rebound as it lands; the tails swing a little each time.
const DEPTH = [0.859, -0.511];
const LOOP_PARTS = [EL[14] + EL[15], EL[16] + EL[17]];
const WILT = [
  { foot: [76, 66], reach: [40, 40], lie: [-0.967, 0.254], sag: -4, at: 0.2 },
  { foot: [89, 64], reach: [133, 45], lie: [0.95, 0.31], sag: 4, at: 0.95 },
].map((w) => {
  const as = norm([w.reach[0] - w.foot[0], w.reach[1] - w.foot[1]]), ps = [-as[1], as[0]];
  const turn = Math.atan2(as[0] * w.lie[1] - as[1] * w.lie[0], as[0] * w.lie[0] + as[1] * w.lie[1]);
  const pr = rot(ps, turn), q = pr[0] * DEPTH[0] + pr[1] * DEPTH[1] >= 0 ? DEPTH : [-DEPTH[0], -DEPTH[1]];
  return { ...w, as, ps, turn, q, sagR: (w.sag * Math.PI) / 180 };
});
function norm(v) { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; }
function rot(v, a) { return [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)]; }
const SAG = 0.3, FALL = 0.28, FLAT = 0.14;
/** A loop at t: its matrix (the reach and width of its drawing carried to where they are now), or null while it stands. */
function wilted(w, t) {
  const s = t - w.at;
  if (s <= 0) return null;
  const landed = s - SAG - FALL;
  // its angle: the sag (slow), then over (faster and faster), then a small bounce back off the lid and down again
  const a = s <= SAG ? w.sagR * track([[0, 0], [SAG, 1, "io"]], s)
    : landed <= 0 ? w.sagR + (w.turn - w.sagR) * track([[0, 0], [FALL, 1, "in"]], s - SAG)
    : w.turn - Math.sign(w.turn) * 0.06 * Math.sin(Math.PI * Math.min(1, landed / 0.16));
  const ax = rot(w.as, a), pr = rot(w.ps, a);
  // flattening as it lands: its width goes over to the lid's depth, foreshortened
  const c = landed <= 0 ? 0 : track([[0, 0], [FLAT, 1, "out"]], landed);
  const k = 0.45, vx = [pr[0] + (w.q[0] * k - pr[0]) * c, pr[1] + (w.q[1] * k - pr[1]) * c];
  const m = [ax[0] * w.as[0] + vx[0] * w.ps[0], ax[1] * w.as[0] + vx[1] * w.ps[0], ax[0] * w.as[1] + vx[0] * w.ps[1], ax[1] * w.as[1] + vx[1] * w.ps[1]];
  const e = w.foot[0] - (m[0] * w.foot[0] + m[2] * w.foot[1]), f = w.foot[1] - (m[1] * w.foot[0] + m[3] * w.foot[1]);
  return `matrix(${m.map(n4).join(" ")} ${n2(e)} ${n2(f)})`;
}
const SAD_DUR = WILT[1].at + SAG + FALL + FLAT + 0.9;
function sad(t) {
  if (t <= 0) return STILL;
  const loops = WILT.map((w, i) => { const m = wilted(w, t); return m ? `<g transform="${m}">${LOOP_PARTS[i]}</g>` : LOOP_PARTS[i]; }).join("");
  // the tails answer each landing with a small swing about the knot
  let sw = 0;
  for (const w of WILT) { const l = t - w.at - SAG - FALL; if (l > 0) sw += 2.2 * Math.sign(w.turn) * Math.exp(-5 * l) * Math.sin(14 * l); }
  const tails = Math.abs(sw) < 0.01 ? TAILS : `<g transform="rotate(${n2(sw)} ${KNOT_AT[0]} ${KNOT_AT[1]})">${TAILS}</g>`;
  return `${OPEN}${ROOM}${BOX}${UNDER_LID}${BAND}${LID}${loops}${tails}${KNOT}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
