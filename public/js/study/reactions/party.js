// The party's two stories. Happy: a party popper goes off, out of the frame: its streamer catches on a balloon's string and hangs there, the balloons
// sway, and the confetti flutters down. Sad: the party's over. The orange one pops, its shreds flying; the other two go soft and sag on their strings,
// and the confetti flutters down and away.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths; each balloon turns about its knot, so its string stays tied.
import { n2, n4, paint, parsePath, partsOf, runsToDc, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M96.9 99.9c-.1 .9-.2 1.6-.5 2.5 0-.9 .1-1.8 .3-2.8-1 0-2.3 .1-3.2-.2-2.9-.9-1-5.1-.5-7.1l-5.7-3.4c-.6 .7-.5 1.2-.6 2-3.5-2.5-2.4-5-3.1-8.8-.8-4.1-2.1-8.1-4.2-11.7-2.4-4.3-5.7-7.3-10.1-9.6-1.3-.6-2.8-1.1-4-1.9-1.4-.9-2.5-2.3-3.6-3.4l3.5 .9c-3.1-15.3 1.1-30 14-39.6 5.6-4.1 14.4-7.5 21.5-6.7 1.2 .2 2.3 .8 3.5 1.1 1.8 .4 3.8 .4 5.5 1.3 1.2 .7 2.2 2 3.3 3 5.3 5.4 8.7 11.9 9.5 19.5 .6 5.5 .1 10.9-1.2 16.2-2.4 10-7.2 18.7-12.6 27.3-1.7 2.7-6.8 11.3-7.4 14-.5 2.1 2 4 .6 6.1-1 1.4-3.5 1.1-5 1.3ZM25.9 40.6l8.5 7.8-3.9 4.4-8.5-7.6 3.9-4.6ZM132.9 159l9.3 5-2.4 5-9.4-5.2 2.5-4.8Z\" fill=\"var(--art-sun,#F7BE45)\" fill-rule=\"evenodd\"/>\n<path d=\"M68.4 127.4c.7 1.6 .9 1.2 1.7 2.3 2.6 3.3-1.2 4.3-3.5 4.9 .3 1.1 .4 1.8 .4 2.8-.3-.9-.6-1.7-.8-2.6-1 .1-2.3 .5-3.2 .4-2.8-.2-2.1-4.4-2.1-6.3-13.8-4.5-27-12.5-33.9-25.9-2.6-5-4.2-10.8-4.1-16.5 .1-14.5 10.6-28.4 24.8-31.7 2-.5 3.6-.1 5.6 0 2.6 .1 5.7-.3 8.1 .8 1.6 .7 2.8 2.1 4 3.3 4.2 4.1 7.5 8.3 9.5 13.8 5.4 14.5 1.4 28.9-3.1 43-1.2 3.9-1.7 8-3.4 11.7Z\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M130 59.9l-1.6 3.4c4.9-.8 9.4-2.1 14.3-1.5 1.5 .1 3 .3 4.4 .8 .8 .3 7.2 3.8 7.7 4.3 4.4 4.5 6.3 14.2 5.9 20.3-1.1 15.4-11.1 27.8-22.1 37.7-2.5 2.3-8.9 6.9-10.5 9.1-1.3 1.8 .4 4.2-1.3 5.7-1.2 1.1-3.1 .3-4.4 0-.3 1-.6 1.7-1.1 2.6 .2-.9 .4-1.8 .6-2.7-.9-.3-2.4-.6-3.2-1.2-2.1-1.7 .7-4.9 1.6-6.5-8-8.4-13.9-18-15.2-29.7-.2-2.2-.2-4.5-.1-6.7 .2-2 .6-3.9 .5-5.8-.6 .2-1.2 .6-1.8 .8-.5-.6-.5-.3-.8-1-.8-1.7 2.5-8 3.4-9.6 4.7-8.3 14.3-17.6 23.7-20Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M148.1 62.8c3.6 1.4 7.1 3 10.1 5.4 15.4 12.5 13.9 34.7 1.5 48.7-6.1 7-14.2 12.2-23 15.2-2.7 1-5.7 1.4-8.3 2.4-.2 .8-.3 1.4-.7 2.1l-3.1-3.4c6.3-5.1 12.9-10.2 18.5-16.1 10.4-11.3 17.9-27.9 12.1-43.2-1.6-4.2-4.2-7.7-7.1-11.1Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M101.4 10.1c3.2 .3 6.2 .7 9.2 1.8 16.2 5.6 25.4 22.9 22.4 39.5-.6 3.6-1.5 7.5-3.2 10.7-1.3 2.2-4.7 2.9-6.9 4.2-3.7 2.1-7 5.1-9.7 8.4-2.3 3-4.1 6.3-5.6 9.7-.7 1.8-.9 4.3-2.1 5.8-.9 1-2.5 1.6-3.7 2.2 .1 1 .3 2 .4 3l-4.6-3c2-3.7 3.8-7.6 5.9-11.2 3.3-5.6 7-10.9 9.7-16.8 6.7-14.6 10-34-1.8-46.9-2.9-3.2-6.3-5.4-10-7.4Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M69.1 126.8c.3 .9 .6 1.8 .9 2.7l-4.6-1.6c4-19.1 13.5-36.4 5.7-56.1-2.1-5.3-5.4-10.1-10.2-13.3-3.2-2.2-6.8-3.2-10.6-4.2 22.3-2.3 38.3 14.4 37.3 36.4-.7 14-8.1 27.1-18.5 36.1Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M96.1 99.6c.6-.1 1 0 1.6 .2-1.1 12.7-3.1 25.4-2.3 38.2l1.5 21.5c.2 4.2-.1 8.4-.5 12.6 2.7-3.9 5.8-7.3 9.2-10.6 3.5-3.2 7.2-6.1 10.1-9.9 2.8-3.8 3.9-7.9 5.6-12.1 .6 0 1.1 .2 1.6 .4-2 12-10 17.3-18 25.1-2.6 2.6-4.9 5.5-7 8.5 3-1.4 6.4-3.2 9.9-2.1 6.9 2.1 4.4 10.1-4.3 9.5-2.2-.1-4.2-.9-6.2-1.6 2.5 5.1 4 7.3 8.6 10.8-.6 .2-1.8 .8-2.5 .7-3.6-.6-7.5-9.2-8.7-12.2-1.5 3.1-6.2 11.8-9.2 13.1-.8 .3-2.3 .2-3 .3 1.6-1.9 3.4-3.6 4.9-5.5 1.8-2.3 3.2-4.8 4.6-7.4-1.9 .9-3.9 1.8-6 2.2-8.1 1.3-10.4-7.1-3.9-9.7 3.7-1.5 7.4 .5 10.6 2.2-1.6-3.1-3.4-6-5.8-8.7-3-3.2-6.7-5.7-9.9-8.6-5.9-5.5-10.6-13.6-11.4-21.6 .6-.3 1.1-.3 1.7-.4 2.4 6.9 3 11.2 8 17.2 3.5 4.2 8.2 7.2 12.2 11 2.9 2.9 5 6.2 6.9 9.8 .3-4 .7-8.1 .5-12.1l-1.5-23.3c-.6-9.4 .2-19 1.3-28.3 .3-3 .4-6.3 1.4-9.2ZM177.3 113.5l6.6 8.1-4.1 3.6-6.7-8.2 4.2-3.5ZM26 123.8l5.5 9-4.7 2.8-5.5-9 4.7-2.8ZM97.2 176.7c3.1 1.2 7.7 3.4 10.9 1.2 .7-.4 1.2-1.1 1.2-1.9 0-.8-.6-1.5-1.2-2-3.4-2.3-8 1-10.9 2.7ZM92.5 176.5c-2.8-1.8-7.4-4.8-10.6-2.2-.7 .6-1.2 1.5-1.2 2.5 .4 5.2 9.6 .7 11.8-.3Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M49.8 16.2l5.1 3.2-6.3 10.5-5.2-3.1 6.4-10.6ZM161 139.5l3 4.5-9.2 6.2-3.1-4.6 9.3-6.1ZM48.1 149.5l4.8 3.4-6.8 9.6-4.8-3.3 6.8-9.7Z\" fill=\"var(--art-teal-lit,#6FD0BD)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "5f0804ab7d";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [SUN, TEAL, CLAY, CLAY_DEEP, SUN_DEEP, TEAL_DEEP, PAPER, TEAL_LIT] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const fill = (t) => `fill="${paint(t)}"`;
const S = parsePath(SUN.d), P = parsePath(PAPER.d), L = parsePath(TEAL_LIT.d);
// The yellow one's body, with the little spike the still's cut leaves on its left (hidden by the teal one there) taken in: once the teal one goes,
// it would stick out of the balloon's side.
const YELLOW = { closed: S[0].closed, segs: S[0].segs.map((q, i) => (i === 10 ? [q[0], q[1], [65.3, 57.9], [65.25, 57.2]] : i === 11 ? [[65.25, 57.2], [65.24, 56.9], [65.22, 56.6], q[3]] : q)) };
const path = (runs, c) => `<path d="${runsToDc(runs)}" ${fill(c)}/>`;
// The balloons, each with its knot; the strings and bow; the confetti, piece by piece.
const BALLOONS = {
  // (the still cuts the yellow one's body along the teal and orange ones' edges, where they hid it; its natural lower sides are drawn under it, only
  // where they hid it, so when the others go, the yellow one is round there, not bitten)
  yellow: { body: `<clipPath id="yh"><path d="${TEAL.d}"/><path d="${TEAL_DEEP.d}"/></clipPath><path clip-path="url(#yh)" d="M95 45L64.2 52.1L65.2 56.4C66.6 63.4 79 86 94 97L96 60Z" ${fill("sun")}/>`
    // (and its lower right, in its shade, along the orange one's edge)
    + `<clipPath id="yo"><path d="${CLAY.d}"/><path d="${CLAY_DEEP.d}"/></clipPath><path clip-path="url(#yo)" d="M97 60L133.5 45C133 62 124 74 113 80C107 86 103 92 100.5 97Z" ${fill("sun-deep")}/>${path([YELLOW], "sun")}`, shade: SUN_DEEP.svg, knot: [96.5, 100] },
  teal: { body: TEAL.svg, shade: TEAL_DEEP.svg, knot: [68.6, 129] },
  orange: { body: CLAY.svg, shade: CLAY_DEEP.svg, knot: [130, 139] },
};
const STRINGS = path([P[0], P[3], P[4]], "paper");
const BITS = [[S[1], "sun"], [S[2], "sun"], [P[1], "paper"], [P[2], "paper"], [L[0], "teal-lit"], [L[1], "teal-lit"], [L[2], "teal-lit"]].map(([run, c]) => {
  const pts = run.segs.flat(), cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length;
  return { d: runsToDc([run]), c, at: [cx, cy] };
});
// In the still's order: the three bodies, then their shades (the yellow one's shade lies over the orange balloon), each moved with its own balloon; the
// strings; the confetti.
const g = (svg, tr) => (tr ? `<g transform="${tr}">${svg}</g>` : svg);
const bunch = (ty, tt, to, orange = null, strings = STRINGS) => `${g(BALLOONS.yellow.body, ty)}${g(BALLOONS.teal.body, tt)}${orange ?? g(BALLOONS.orange.body + BALLOONS.orange.shade, to)}`
  + `${g(BALLOONS.yellow.shade, ty)}${g(BALLOONS.teal.shade, tt)}${strings}`;
const about = (b, rot, s = 1, sy = s) => `rotate(${n4(rot)} ${b.knot[0]} ${b.knot[1]}) translate(${b.knot[0]} ${b.knot[1]}) scale(${n4(s)} ${n4(sy)}) translate(${-b.knot[0]} ${-b.knot[1]})`;

// Confetti flutters: air holds it back, so it falls at a slow, steady pace (here 90 a second) once it's going, swaying and turning as it goes, and
// leaves by the bottom of the frame (no floor's drawn to land on), all of it gone before the story ends. From rest at `from`, or thrown with a velocity
// from where it was.
const DRAG = 3, VT = 90;
const flight = (s, x0, y0, vx = 0, vy = 0) => [x0 + (vx * (1 - Math.exp(-DRAG * s))) / DRAG, y0 + VT * s + ((vy - VT) * (1 - Math.exp(-DRAG * s))) / DRAG];
function flutterBits(t, from) {
  return BITS.map((b, i) => {
    const s = Math.max(0, t - from - i * 0.05), [, y] = flight(s, 0, 0), sway = 4 * Math.sin(s * 5 + i) * Math.min(1, s / 0.3), rot = (i % 2 ? 1 : -1) * 220 * s;
    if (b.at[1] + y > 215) return "";
    return `<g transform="translate(${n2(sway)} ${n2(y)}) rotate(${n2(rot)} ${n2(b.at[0])} ${n2(b.at[1])})"><path d="${b.d}" ${fill(b.c)}/></g>`;
  }).join("");
}
// A smooth line through points (for the streamer).
function smoothOpen(P) {
  let d = `M${n2(P[0][0])} ${n2(P[0][1])}`;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], e = P[Math.min(P.length - 1, i + 2)];
    d += `C${n2(b[0] + (c[0] - a[0]) / 6)} ${n2(b[1] + (c[1] - a[1]) / 6)} ${n2(c[0] - (e[0] - b[0]) / 6)} ${n2(c[1] - (e[1] - b[1]) / 6)} ${n2(c[0])} ${n2(c[1])}`;
  }
  return d;
}

// ---- happy. Someone pulls a party popper, down to the left out of the frame: a streamer and a spray of confetti shoot up into the picture. The
// streamer arcs over and comes down across the yellow balloon's string, catches, and hangs there, its two ends swinging down and settling. The air of
// it sets the balloons swaying on their knots. All the confetti, the old and the new, flutters down and out of the frame.
const HAPPY_DUR = 3.0;
const FIRE = 0.15, MOUTH = [-30, 222];  // (the popper is out of the frame: what it throws comes in across the corner)
// The streamer: a curled ribbon, heavier than confetti, so one plain arc (gravity 300) from the popper's mouth to the string.
const CATCH = [94.9, 116], FLY = 1.0, G = 300;
const SVX = (CATCH[0] - MOUTH[0]) / FLY, SVY = (CATCH[1] - MOUTH[1] - 0.5 * G * FLY * FLY) / FLY;
const N = 9;
const CURL = Array.from({ length: N }, (_, i) => { const u = (i - 4) * 5.5; return [u, 3 * Math.sin(u * 0.32)]; });
// Hanging: from the string, a short end down to the left and a longer one to the right, each still curling.
const HANG = [[-1.5, 21], [-3.5, 15.5], [-0.5, 10.5], [-2, 5], [0, 0], [2, 6], [0.5, 12.5], [3.5, 19], [1.5, 26]];
function streamer(t) {
  const s = t - FIRE;
  if (s <= 0) return "";
  let P;
  if (s < FLY) {
    const x = MOUTH[0] + SVX * s, y = MOUTH[1] + SVY * s + 0.5 * G * s * s, a = (-150 + 300 * s) * (Math.PI / 180), c = Math.cos(a), sn = Math.sin(a);
    // (it comes out of the frame's corner, so its first frames are its leading end only)
    P = CURL.map(([u, v]) => [x + u * c - v * sn, y + u * sn + v * c]);
  } else {
    // Caught: from the shape it had in the air to hanging, its ends falling past and swinging back.
    const h = s - FLY, k = track([[0, 0], [0.3, 1, "out"]], h), a = (150) * (Math.PI / 180), c = Math.cos(a), sn = Math.sin(a);
    const swing = 4 * Math.sin(h * 10) * Math.exp(-h * 4.5);
    P = CURL.map(([u, v], i) => {
      const from = [CATCH[0] + u * c - v * sn, CATCH[1] + u * sn + v * c], to = [CATCH[0] + HANG[i][0] + swing * (HANG[i][1] / 26), CATCH[1] + HANG[i][1]];
      return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
    });
  }
  return `<path d="${smoothOpen(P)}" fill="none" stroke="${paint("clay")}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>`;
}
// The new confetti, out of the popper with the streamer: thrown up and to the right, slowed by the air, then fluttering down.
const SPRAY = [[260, -430, "sun"], [330, -380, "teal-lit"], [220, -470, "paper"], [300, -330, "clay"], [380, -420, "sun"], [250, -360, "teal-lit"], [340, -470, "paper"]];
function spray(t) {
  const s = t - FIRE;
  if (s <= 0) return "";
  return SPRAY.map(([vx, vy, c], i) => {
    const q = Math.max(0, s - i * 0.02), [x, y] = flight(q, MOUTH[0], MOUTH[1], vx, vy), sway = 3 * Math.sin(q * 6 + i) * Math.min(1, Math.max(0, q - 0.6) / 0.3);
    if (y > 215) return "";
    return `<rect x="-1.6" y="-3" width="3.2" height="6" ${fill(c)} transform="translate(${n2(x + sway)} ${n2(y)}) rotate(${n2((i % 2 ? 1 : -1) * 300 * q + i * 40)})"/>`;
  }).join("");
}
function happy(t) {
  if (t <= 0) return STILL;
  // The popper's puff of air reaches the bunch: each balloon sways on its knot at its own pace, less and less.
  const sway = (ph, amp) => amp * Math.sin(2 * Math.PI * 0.9 * (t - FIRE) + ph) * Math.min(1, Math.max(0, t - FIRE - 0.1) / 0.3) * Math.exp(-Math.max(0, t - FIRE) * 1.1);
  const all = bunch(about(BALLOONS.yellow, sway(0, 5)), about(BALLOONS.teal, sway(1.8, 7)), about(BALLOONS.orange, sway(3.6, 6)));
  return `${OPEN}${BG}${all}${streamer(t)}${flutterBits(t, FIRE)}${spray(t)}</svg>`;
}

// ---- sad. The party's over. The orange one swells a little and pops: shreds of it fly out and fall, and its string, with the scrap on it, drops to
// the floor. The other two lose their air: going soft, they lose their lift too, and the whole lot sinks. The bow comes down onto the floor (just under
// the frame's edge), the strings go slack, and the two limp balloons settle and flop over on the floor. The confetti flutters down and away.
const POP = 0.35;
const SAD_DUR = 3.2;
const FLOOR = 197, BOW_C = [95, 176];
// Where each soft balloon ends: flopped over on its side, smaller and flatter, its lowest point on the floor.
const lowest = (runs, b, rot, sx, sy) => {
  const a = (rot * Math.PI) / 180;
  let m = -1e9;
  for (const r of runs) for (const sg of r.segs) for (const q of sg) { const dx = (q[0] - b.knot[0]) * sx, dy = (q[1] - b.knot[1]) * sy; m = Math.max(m, b.knot[1] + dx * Math.sin(a) + dy * Math.cos(a)); }
  return m;
};
const Y_END = { rot: 78, sx: 0.72, sy: 0.6, dx: 12 }, T_END = { rot: -80, sx: 0.7, sy: 0.56, dx: -6 };
Y_END.dy = FLOOR - lowest([S[0], ...parsePath(SUN_DEEP.d)], BALLOONS.yellow, Y_END.rot, Y_END.sx, Y_END.sy);
T_END.dy = FLOOR - lowest([...parsePath(TEAL.d), ...parsePath(TEAL_DEEP.d)], BALLOONS.teal, T_END.rot, T_END.sx, T_END.sy);
// The strings, from the still's own: each point of a string goes with its knot near the top and with the bow near the bottom; slack, they lie in
// loose curls along the floor. The bow and its tails go with the bow.
const STRING_ENDS = [[BALLOONS.teal.knot, "teal"], [BALLOONS.yellow.knot, "yellow"], [[122.4, 139.6], "orange"]];
const ALL_STRINGS = [P[0], P[3], P[4]];
function stringsAt(move, dB, slack) {
  return path2(runsToDc(ALL_STRINGS, (x, y) => {
    if (y >= BOW_C[1] - 2) return [x + dB[0], y + dB[1]];
    let best = null;
    for (const [k, id] of STRING_ENDS) {
      const vx = BOW_C[0] - k[0], vy = BOW_C[1] - k[1], L2 = vx * vx + vy * vy, s = Math.max(0, Math.min(1, ((x - k[0]) * vx + (y - k[1]) * vy) / L2));
      const d = Math.hypot(x - (k[0] + vx * s), y - (k[1] + vy * s));
      if (!best || d < best.d) best = { d, s, id };
    }
    const dk = move[best.id], s = best.s, curl = slack[best.id] * 2.2 * Math.sin(Math.PI * s * 3);
    return [x + (1 - s) * dk[0] + s * dB[0], y + (1 - s) * dk[1] + s * dB[1] + curl];
  }), "paper");
}
const path2 = (d, c) => `<path d="${d}" ${fill(c)}/>`;
function sad(t) {
  if (t <= 0) return STILL;
  const O = BALLOONS.orange;
  let orange = "", shreds = "";
  if (t < POP) orange = g(O.body + O.shade, about(O, 0, track([[0.08, 1], [POP, 1.08, "in"]], t)));
  else {
    // (no burst drawn for the bang: the shreds are what's seen)
    const s = t - POP;
    for (const [dx, dy, rot] of [[-1, -1.2, 200], [1.2, -0.8, -260], [0.6, 0.6, 180], [-0.9, 0.4, -220]]) {
      const q = Math.min(s, 1.4), x = 132 + dx * 70 * q, y = 100 + dy * 70 * q + 0.5 * 260 * q * q;
      if (y > 205) continue;
      shreds += `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(rot * q)})"><path d="M-6 -2Q0 -6 6 -1Q2 3 -5 3Z" ${fill("clay")}/></g>`;
    }
    // (the scrap stays tied where the string's end is, and falls with it)
    const fall = track([[POP, 0], [POP + 0.5, 1, "in"]], t), [kx, ky] = [122.4 + 6 * fall, 139.6 + 56 * fall];
    orange = `<path d="M${kx - 4} ${ky - 1}Q${kx} ${ky - 9} ${kx + 5} ${ky - 2}Q${kx + 2} ${ky + 3} ${kx - 4} ${ky - 1}Z" ${fill("clay-deep")}/>`;
  }
  // Soft, they lose their lift: the bow touches down first, then the two sink, slowly at first, and once they're down they flop over.
  const soft = track([[0.6, 0], [2.0, 1, "io"]], t), sink = track([[0.85, 0], [2.4, 1, "io"]], t), flop = track([[1.7, 0], [2.7, 1, "io"]], t);
  const bow = track([[0.75, 0], [1.25, 1, "io"]], t);
  const Y = BALLOONS.yellow, T = BALLOONS.teal;
  const yd = [Y_END.dx * sink, Y_END.dy * sink], td = [T_END.dx * sink, T_END.dy * sink];
  const ty = `translate(${n2(yd[0])} ${n2(yd[1])}) ${about(Y, Y_END.rot * flop, 1 - 0.28 * soft, 1 - 0.4 * soft)}`;
  const tt = `translate(${n2(td[0])} ${n2(td[1])}) ${about(T, T_END.rot * flop, 1 - 0.3 * soft, 1 - 0.44 * soft)}`;
  const of = t < POP ? 0 : track([[POP, 0], [POP + 0.5, 1, "in"]], t);
  const strings = stringsAt({ yellow: yd, teal: td, orange: [6 * of, 56 * of] }, [0, 5 * bow], { yellow: sink, teal: sink, orange: of });
  return `${OPEN}${BG}${bunch(ty, tt, null, orange, strings)}${flutterBits(t, 0.15)}${shreds}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
