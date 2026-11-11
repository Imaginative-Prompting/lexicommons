// Suitcase's story: the extended handle's worn catch slips, and the grip's own weight draws both rails down into the case.
// Happy: it seats on the top with a knock and a little bounce: the handle stowed, a shorter case, ready to go.
// Sad: the same knock shakes the left wheel, already worn loose, off the end of its axle: the case drops onto that corner, rocking on the
// floor, and the wheel topples over flat in front of it.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall, the floor, the shadow, the two rails (each a lit and a dark
// strip, from y 77 down into the case at 94), the grip (shade and lit, 74-79.5), the case (its back and its front, 94-150, and the two grooves),
// and the two wheels (each a dark disc and its lit side, axles at y 151.5, their feet on the floor at 156). Seen from the front, a wheel's axle
// points at us. The case (50 cm) is 56 tall in its own units: 112 to the meter, so gravity is 1100 in them (the still draws it 1.8 times that).
import { n2, n4, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><rect y=\"145\" width=\"200\" height=\"55\" fill=\"var(--art-sun-lit,#FAD57E)\"/><g transform=\"translate(100 100) scale(1.8) translate(-108 -118)\"><polygon points=\"80,155.5 117,154.5 176,170 152,178.5\" fill=\"var(--art-sun-deep,#DB9A22)\"/><rect x=\"90\" y=\"77\" width=\"4\" height=\"20\" fill=\"var(--art-ink-lit,#3A3460)\"/><rect x=\"92.6\" y=\"77\" width=\"1.4\" height=\"20\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"106\" y=\"77\" width=\"4\" height=\"20\" fill=\"var(--art-ink-lit,#3A3460)\"/><rect x=\"108.6\" y=\"77\" width=\"1.4\" height=\"20\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"95\" y=\"74\" width=\"16.5\" height=\"5.5\" rx=\"2.75\" fill=\"var(--art-ink,#231F3B)\"/><rect x=\"88.5\" y=\"74\" width=\"20\" height=\"5.5\" rx=\"2.75\" fill=\"var(--art-ink-lit,#3A3460)\"/><rect x=\"82\" y=\"94\" width=\"40\" height=\"56\" rx=\"8\" fill=\"var(--art-sky-deep,#3488C9)\"/><rect x=\"78\" y=\"94\" width=\"37\" height=\"56\" rx=\"8\" fill=\"var(--art-sky,#58ADEB)\"/><rect x=\"86.5\" y=\"101\" width=\"5\" height=\"42\" rx=\"2.5\" fill=\"var(--art-sky-deep,#3488C9)\"/><rect x=\"101.5\" y=\"101\" width=\"5\" height=\"42\" rx=\"2.5\" fill=\"var(--art-sky-deep,#3488C9)\"/><circle cx=\"84\" cy=\"151.5\" r=\"4.5\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M84 147A4.5 4.5 0 0 0 84 156A6 6 0 0 0 84 147Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><circle cx=\"113.5\" cy=\"151.5\" r=\"4.5\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M113.5 147A4.5 4.5 0 0 0 113.5 156A6 6 0 0 0 113.5 147Z\" fill=\"var(--art-ink-lit,#3A3460)\"/></g></svg>";
export const STILL_HASH = "8e72525a43";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 17 || !EL[2].includes("80,155.5 117,154.5 176,170 152,178.5") || !EL[13].includes('cx="84" cy="151.5" r="4.5"')) throw new Error("suitcase: the still isn't as this story knows it");
// (everything past the floor is drawn inside the still's own frame: a group scaling it 1.8 about the case)
const IN = '<g transform="translate(100 100) scale(1.8) translate(-108 -118)">';
if (!STILL.includes(EL[1] + IN) || !STILL.endsWith("</g></svg>")) throw new Error("suitcase: the still's frame isn't as this story knows it");
const BACK = EL[0] + EL[1], HANDLE = EL.slice(3, 9).join(""), CASE = EL.slice(9, 13).join(""), WHEEL_L = EL[13] + EL[14], WHEEL_R = EL[15] + EL[16];
const G = 1100;
// the handle: the catch gives a hair, holds, then lets go; the rails slide (the sleeves' friction taking about half of gravity) until the grip
// sits on the top (its foot from 79.5 to 94)
const T_SLIP = 0.3, T_GO = 0.45, DIP = 0.8, SEAT = 14.5, A = 0.55 * G;
const T_SEAT = T_GO + Math.sqrt((2 * (SEAT - DIP)) / A);
function drop(t) {
  if (t <= T_SLIP) return 0;
  if (t <= T_GO) return track([[T_SLIP, 0], [T_SLIP + 0.05, DIP, "out"]], t);
  if (t <= T_SEAT) return DIP + 0.5 * A * (t - T_GO) ** 2;
  // the knock: it bounces off the top once, a little, and sits
  return SEAT - track([[T_SEAT, 0], [T_SEAT + 0.05, 1.1, "out"], [T_SEAT + 0.1, 0, "in"], [T_SEAT + 0.13, 0.25, "out"], [T_SEAT + 0.16, 0, "in"]], t);
}
const handle = (t) => { const d = drop(t); return d ? `<g transform="translate(0 ${n2(d)})">${HANDLE}</g>` : HANDLE; };

// ---- happy: stowed
const HAPPY_DUR = T_SEAT + 0.45;
function happy(t) {
  if (t <= T_SLIP) return STILL;
  return `${OPEN}${BACK}${IN}${EL[2]}${handle(t)}${CASE}${WHEEL_L}${WHEEL_R}</g></svg>`;
}

// ---- sad: a wheel off
// the case pivots on the right wheel's axle once the left wheel has gone, its weight to the left of it (I about the axle 1535 m, the lever 15.5:
// 11.1 rad/s/s), until its front's rounded corner meets the floor: 12.15 degrees
const PIVOT = [113.5, 151.5], TILT = 12.15, ALPHA = (G * 15.5) / 1535;
const T_OFF = T_SEAT + 0.08, T_DOWN = T_OFF + Math.sqrt((2 * ((TILT * Math.PI) / 180)) / ALPHA);
function tilt(t) {
  if (t <= T_OFF) return 0;
  if (t <= T_DOWN) return (0.5 * ALPHA * (t - T_OFF) ** 2 * 180) / Math.PI;
  return TILT - track([[T_DOWN, 0], [T_DOWN + 0.06, 1.1, "out"], [T_DOWN + 0.12, 0, "in"], [T_DOWN + 0.15, 0.25, "out"], [T_DOWN + 0.18, 0, "in"]], t);
}
// the wheel: it comes out toward us off the axle's end, then topples over toward us about its foot (a disc on its rim: 4g/5r), from the nudge
// that brought it off. The floor here: a step toward us is 0.4 of it down the picture.
const K = 0.4, R = 4.5, FOOT = [84, 156];
const FALL = (() => { const S = []; let a = 0.12, w = 3; const dt = 1 / 2000; while (a < Math.PI / 2) { S.push(a); w += ((4 * G) / (5 * R)) * Math.sin(a) * dt; a += w * dt; } S.push(Math.PI / 2); return S; })();
const T_FLAT = T_OFF + (FALL.length - 1) / 2000;
const INK = 'fill="var(--art-ink,#231F3B)"', LIT = 'fill="var(--art-ink-lit,#3A3460)"';
function wheel(t) {
  if (t <= T_SEAT) return WHEEL_L;
  // (the knock shakes it out toward us: a little lower and nearer)
  const out = track([[T_SEAT, 0], [T_OFF, 1, "in"]], t), near = 1 + 0.03 * out, foot = FOOT[1] + 0.6 * out;
  if (t <= T_OFF) return `<g transform="translate(${FOOT[0]} ${n2(foot)}) scale(${n4(near)}) translate(${-FOOT[0]} ${-FOOT[1]})">${WHEEL_L}</g>`;
  const f = t >= T_FLAT ? Math.PI / 2 : FALL[Math.round((t - T_OFF) * 2000)];
  // its face, seen: the outer face while it leans less than edge on, then the inner one, lying up; its rim's width keeps it from vanishing
  const up = Math.cos(f) - K * Math.sin(f), r = R * near;  // (it slaps down flat: rubber, no bounce)
  const cy = foot - r * up;
  if (up > 0) {
    return `<g transform="translate(${FOOT[0]} ${n2(cy)}) scale(${n4(near)} ${n4(Math.max(up * r, 1.2) / R)}) translate(${-FOOT[0]} -151.5)">${WHEEL_L}</g>`;
  }
  // (its inner face comes round into view: the rim under it and the face's lit top growing in from edge on)
  const ry = Math.max(-up * r, 1.2), g = Math.min(1, -up / 0.35);
  return `<ellipse cx="${FOOT[0]}" cy="${n2(cy + 0.9 * g)}" rx="${n2(r)}" ry="${n2(ry)}" ${INK}/><ellipse cx="${FOOT[0]}" cy="${n2(cy - 0.3 * g)}" rx="${n2(r * (1 - 0.14 * g))}" ry="${n2(ry * (1 - 0.14 * g) * g)}" ${LIT}/>`;
}
// the shadow follows the case's top as it leans left
const shadow = (a) => { if (!a) return EL[2]; const s = 11.6 * (a / TILT); return `<polygon points="80,155.5 117,154.5 ${n2(176 - s)},170 ${n2(152 - s)},178.5" fill="var(--art-sun-deep,#DB9A22)"/>`; };
const SAD_DUR = Math.max(T_FLAT + 0.12, T_DOWN + 0.2) + 0.3;
function sad(t) {
  if (t <= T_SLIP) return STILL;
  const a = tilt(t);
  const body = `${handle(t)}${CASE}`;
  const leaning = a ? `<g transform="rotate(${n2(-a)} ${PIVOT[0]} ${PIVOT[1]})">${body}</g>` : body;
  return `${OPEN}${BACK}${IN}${shadow(a)}${leaning}${wheel(t)}${WHEEL_R}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
