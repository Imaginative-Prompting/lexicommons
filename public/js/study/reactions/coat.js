// Coat's two stories. Happy: a keyring comes in on a toss from the left, over the sleeve, and drops into the left pocket: the pocket sags with
// it, and the coat gives one small swing on its loop and settles. Sad: the loop's right end tears out of the collar; the coat lurches onto the
// other end, the strap starts to run over the hook, faster and faster, and slips off its top: the coat drops, gathering speed, out of the frame,
// its shadow going with it, and the hook is left empty on the wall with its own shadow.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view; the world carries on past its frame.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M102.7 12.5L111 22.2C126.4 36.3 139.9 46.9 148 62.2L200 147.2V200H72.8L59.7 185.8L69.5 111.2L59.5 135.6L46.8 132.9L71.9 65.3L92.6 36.1Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<circle cx=\"99.3\" cy=\"14.3\" r=\"5.6\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M98.2 16.6C98.2 14.9 100.4 14.9 100.4 16.6V26.3C100.4 29.4 99.3 31.4 96.9 31.4C94.4 31.4 92.8 29.1 92.8 26C92.8 24.3 95 24.2 95 25.9C95 27.8 95.5 29.2 96.8 29.2C98 29.2 98.2 27.8 98.2 26.2Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M90.5 35.7C90.6 31.2 91.7 27 95.5 27C99.3 27 101.8 30.2 102 35.7L99.7 36C99.6 31.8 98.2 29.2 95.7 29.2C93.5 29.2 92.7 31.9 92.7 35.7Z\" fill=\"var(--art-sky-deep,#3488C9)\"/>\n<path d=\"M91.4 35.5C91.5 31.3 92.4 27.1 96 27.1C99.7 27.1 102.1 30.7 102.2 35.7L100.2 35.7C100.1 31.6 98.5 29.1 96 29.1C93.7 29.1 93.4 32.6 93.3 35.7Z\" fill=\"var(--art-sky,#58ADEB)\"/>\n<path d=\"M76.9 45.5C70.6 49.2 66 54.3 63.3 63.5C59.6 75.7 57 89.8 52.8 103.2C49.9 112.4 46.5 125.6 46.7 131.8C47.3 134.3 55.5 136.4 62.3 133.9L70.5 108.2L55.5 181.6C54.6 185.7 67.5 190.5 80.7 191.6C87.3 192.3 94.3 192.5 99.7 191.6C112.4 192.4 132.9 189.6 138.6 184.5C139.5 183.7 139.3 181.9 138.9 180L130 134.1C133.4 137.2 142.7 135.7 145.8 132.6C147.2 128.1 142.4 113.7 139.7 103.1L131.2 68.6C128.2 54.4 125.3 49 115.5 44.1C110.8 34.8 103.6 32.2 95.6 33.1C87 33 80.6 37.8 76.9 45.5Z\" fill=\"var(--art-sky,#58ADEB)\"/>\n<path d=\"M112.6 42.4C122.5 46.4 127.8 51.6 130.5 64.6C133.6 79.5 136.3 92.2 140.5 107.5C143.6 118.5 146.9 128.2 146.1 132L138.3 132.7C136.2 119.9 133.2 105.8 129.5 91.9C126.5 80.7 122.8 68.7 119.4 57.7C116.3 65 110.7 64.6 104.3 60.4C100.4 69.7 99.9 81.7 100.2 94.1L101.9 160.1L103.8 191.4L99.7 191.4L99.7 66C99.7 59.8 100 54.5 96.1 54.7C91.9 54.9 86.2 62 80.4 61.6C77.6 61.4 76.6 58 76.1 55.3L90.5 49.8Z\" fill=\"var(--art-sky-deep,#3488C9)\"/>\n<path d=\"M118.4 67.8C117.5 82.7 118.4 92.5 121.8 105.5C125.1 118.6 127.9 126.4 130 134.1L139.1 181.8C139.6 184.4 135.1 186.1 128.6 188.2C126.6 171.9 124.6 155.3 122.3 139.1C120 122.8 116.5 110.9 115 98.6C113.6 87.2 114.9 77.3 118.4 67.8Z\" fill=\"var(--art-sky-deep,#3488C9)\"/>\n<path d=\"M72.6 63.7C75.6 75.2 75.4 87.1 73.8 97.3C72.9 103.1 71.3 107.7 69.4 111.5L63.6 126.5C64.9 112.4 68.3 100.2 70.2 87.1C71.4 78.8 72.2 71.2 72.6 63.7Z\" fill=\"var(--art-sky-deep,#3488C9)\"/>\n<path d=\"M89.7 35.5C89.7 33.7 101.7 33.3 102.9 35.8C104.1 39.1 100.2 46.6 95.5 51C91.1 46.4 87.4 39 89.7 35.5Z\" fill=\"var(--art-sky-deep,#3488C9)\"/>\n<path d=\"M89.7 35.5C92.3 34.6 98.3 34.3 102.1 35.3L103 38C98.7 37.1 93.3 37.2 89.1 38.1Z\" fill=\"var(--art-sky,#58ADEB)\"/>\n<path d=\"M90.7 33.6C83.3 35.1 77.8 39.9 75.9 46.5C74.6 50.7 75.5 56.9 78.3 58.6C81.8 61 89.5 54.9 95.5 51C92.9 46.4 88.1 40.4 88.7 36.9C88.8 35.6 89.6 34.4 90.7 33.6Z\" fill=\"var(--art-sky,#58ADEB)\"/>\n<path d=\"M101.8 33.4C108.5 34.7 112.1 38.1 114 44.2C115.8 49.9 115.1 56.9 112.1 59C108.6 61.6 100.8 54.5 95.3 50.8C98.6 45.7 103.4 39.3 103 36.7C102.9 35.4 102.5 34.3 101.8 33.4Z\" fill=\"var(--art-sky,#58ADEB)\"/>\n<path d=\"M70 124.4C70.2 123.6 70.7 123.5 71.7 123.6C76.9 123.9 80.7 122.9 84.4 121.5C85.5 120.8 85 124.6 84.9 127.7C84.6 132 84 137.6 82.6 140.6C80.8 144.7 72 145.5 69.2 142.1C67.2 139.7 68.3 135 68.8 131.3Z\" fill=\"var(--art-sky-deep,#3488C9)\"/>\n<path d=\"M107.1 122.2C106.9 121.3 107.5 121.2 108.3 121.6C112.8 123.3 116.9 123.6 121.6 123.5C122.6 123.4 122.8 124 122.9 125.1L124.4 137.3C124.8 141 123.2 143.1 119.7 143.9C116.5 144.6 112.2 144.1 110.3 141.9C108.5 139.5 108.2 135.4 107.8 131.3Z\" fill=\"var(--art-sky-deep,#3488C9)\"/>\n<ellipse cx=\"54.6\" cy=\"132.9\" rx=\"7.8\" ry=\"2.8\" fill=\"var(--art-sky-deep,#3488C9)\"/>\n<path d=\"M130.3 134C130.2 132.4 133.4 130.8 137.3 130C141.1 129.2 145.3 129.4 146 131.2C146.7 133.1 142.5 135.1 138.8 135.9C134.7 136.8 131.2 136 130.3 134Z\" fill=\"var(--art-sky-deep,#3488C9)\"/>\n<circle cx=\"95.5\" cy=\"60.8\" r=\"2.3\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<circle cx=\"95.5\" cy=\"79\" r=\"2.3\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<circle cx=\"95.5\" cy=\"97.6\" r=\"2.3\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<circle cx=\"95.6\" cy=\"116.4\" r=\"2.3\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<circle cx=\"95.5\" cy=\"135.1\" r=\"2.3\" fill=\"var(--art-paper,#FBF7EC)\"/>\n</svg>\n";
export const STILL_HASH = "734c2f838b";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 23) throw new Error("coat: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const WALL = EL[0], HOOK = EL[2] + EL[3], LOOP = EL[4] + EL[5];
const LEFT_POCKET = 14, COAT_PARTS = EL.slice(6);
// the coat's long shadow, carried on past the frame along its own two edges (inside the frame it's the still's own)
const SHADOW_D = EL[1].match(/ d="([^"]+)"/)[1];
const LONG = SHADOW_D.replace("L200 147.2V200H72.8L59.7 185.8", "L300 310.6L177.6 313.6L59.7 185.8");
if (LONG === SHADOW_D) throw new Error("coat: its shadow isn't as this story knows it");
const COAT_SHADOW = `<path d="${LONG}" ${fill("sun-deep")}/>`;
const G = 1470; // the coat is about 1.1 m long: 150 units a meter

// ---- the hook's own long shadow: its knob and its J, carried along the still's long shadow edge, (52, 85); inside the coat's shadow in the
// still, so it shows once the coat has gone
const HOOK_SHADOW = (() => {
  const U = [52 / 99.65, 85 / 99.65], pts = [];
  for (let i = 0; i < 32; i++) { const a = (i / 32) * 2 * Math.PI; pts.push([99.3 + 5.6 * Math.cos(a), 14.3 + 5.6 * Math.sin(a)]); }
  const J = [[98.2, 16.6], [100.4, 16.6], [100.4, 26.3], [100.1, 29.3], [98.9, 31], [96.9, 31.4], [94.6, 31], [93.3, 29.6], [92.8, 26], [93.3, 24.8], [95, 25.9]];
  pts.push(...J);
  const all = pts.concat(pts.map(([x, y]) => [x + 400 * U[0], y + 400 * U[1]]));
  // the hull, by gift wrapping
  const hull = [];
  let p = all.reduce((a, b) => (b[0] < a[0] ? b : a));
  do {
    hull.push(p);
    let q = all[0] === p ? all[1] : all[0];
    for (const r of all) { const c = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); if (c < 0 || (c === 0 && Math.hypot(r[0] - p[0], r[1] - p[1]) > Math.hypot(q[0] - p[0], q[1] - p[1]))) q = r; }
    p = q;
  } while (p !== hull[0] && hull.length < 200);
  // (kept to the still's wedge by the hook, the two edges its shadow leaves the knob by, so none of it shows where the still has bare wall)
  const wedge = `<clipPath id="hw"><polygon points="102.7,12.5 517.7,497.5 -402.3,1192.5"/></clipPath>`;
  return `${wedge}<path d="M${hull.map(([x, y]) => `${n2(x)} ${n2(y)}`).join("L")}Z" clip-path="url(#hw)" ${fill("sun-deep")}/>`;
})();

// ---- happy. The toss: one parabola, from outside the left edge (moving 5 units a frame there) over its top just right of the edge, down into
// the pocket's mouth at a steep slant; the keyring turning as it goes, its keys leading as they go in.
const APEX = [22, 80], MOUTH = [72.5, 123];
const T_FALL = Math.sqrt((2 * (MOUTH[1] - APEX[1])) / G), VX = (MOUTH[0] - APEX[0]) / T_FALL;
const T_FROM = (APEX[0] + 10) / VX; // from x -10 to the top
const T_THROW = 0.25, T_IN = T_THROW + T_FROM + T_FALL;
const keyAt = (t) => { const s = t - T_THROW - T_FROM; return [APEX[0] + VX * s, APEX[1] + 0.5 * G * s * s]; };
const LEAD = (-Math.atan2(VX, G * T_FALL) * 180) / Math.PI; // its keys along its path at the mouth
const SPIN = 252; // degrees, over the flight
// a keyring, its ring at the origin: a brass key and a steel one hanging from it, the steel one turned out
const KEYS = `<g><circle cx="0" cy="4.4" r="2.2" ${fill("sun-deep")}/><rect x="-0.65" y="6.2" width="1.3" height="6.5" ${fill("sun-deep")}/><path d="M0.65 9.2H1.8V10.1H1.2V10.9H1.8V12L0.65 12.7Z" ${fill("sun-deep")}/></g>`
  + `<g transform="rotate(32)"><circle cx="0" cy="4.2" r="2" ${fill("steel")}/><rect x="-0.6" y="5.8" width="1.2" height="5.8" ${fill("steel")}/><path d="M-0.6 8.4H-1.7V9.2H-1.1V10H-1.7V11.1L-0.6 11.6Z" ${fill("steel")}/></g>`
  + `<circle cx="0" cy="0" r="2.3" fill="none" stroke="${paint("steel-deep")}" stroke-width="0.8"/>`;
// the bundle turns about its middle, 6 below the ring; it's gone into the pocket once its ring is past the mouth
const MID = 6;
function keys(t) {
  const [x, y] = keyAt(t);
  const a = LEAD - SPIN * Math.max(0, (T_IN - t) / (T_FROM + T_FALL));
  const ringY = y - MID * Math.cos((a * Math.PI) / 180);
  if (t < T_THROW || ringY > 126) return "";
  return `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(a)}) translate(0 ${-MID})">${KEYS}</g>`;
}
// the pocket sags with their weight: its lower half drawn down (most at its foot), on a cloth's small give and spring
const POCKET_D = EL[LEFT_POCKET].match(/ d="([^"]+)"/)[1];
const sagged = (sag) => EL[LEFT_POCKET].replace(POCKET_D, POCKET_D.replace(/(-?\d*\.?\d+) (-?\d*\.?\d+)/g, (_, x, y) => `${x} ${n2(+y + sag * Math.max(0, Math.min(1, (+y - 128) / 15)))}`));
const T_HIT = T_IN + 0.04;
const SWING_W = (2 * Math.PI) / 1.74, SWING_D = 1.4, SWING_WD = SWING_W * Math.sqrt(1 - (SWING_D / SWING_W) ** 2);
// its new weight hangs it 0.45° over; the keys' blow sets it going at 6.4°/s; it swings and settles (the last of it dying over 0.5 s)
const TILT = -0.45, KICK = -6.4, SWING_END = 1.9;
function swing(t) {
  const s = t - T_HIT;
  if (s <= 0) return 0;
  if (s >= SWING_END) return TILT;
  const e = Math.exp(-SWING_D * s);
  const free = TILT * (1 - e * (Math.cos(SWING_WD * s) + (SWING_D / SWING_WD) * Math.sin(SWING_WD * s))) + (KICK / SWING_WD) * e * Math.sin(SWING_WD * s);
  return TILT + (free - TILT) * (1 - track([[SWING_END - 0.5, 0], [SWING_END, 1, "io"]], s));
}
const PIVOT = "96 28.1"; // where the loop rides on the hook
const HAPPY_DUR = T_HIT + SWING_END + 0.3;
function happy(t) {
  if (t <= 0) return STILL;
  const sag = track([[T_HIT, 0], [T_HIT + 0.07, 3.2, "out"], [T_HIT + 0.17, 2.3, "io"], [T_HIT + 0.28, 2.6, "io"]], t);
  const a = swing(t);
  const coat = COAT_PARTS.map((e, i) => (i + 6 === LEFT_POCKET && sag ? sagged(sag) : e)).join("");
  const turn = (svg) => (a ? `<g transform="rotate(${n2(a)} ${PIVOT})">${svg}</g>` : svg);
  // the keys fly in front of it all, and go in behind the pocket's front: drawn under the pocket, over the rest
  const before = COAT_PARTS.slice(0, LEFT_POCKET - 6).join(""), after = coat.slice(before.length);
  const front = t < T_IN + 0.2 ? `${before}${keys(t)}${after}` : coat;
  return `${OPEN}${WALL}${HOOK_SHADOW}${turn(COAT_SHADOW)}${HOOK}${turn(LOOP + front)}</svg>`;
}

// ---- sad. The strap, as its center line, over the hook: its left leg from the collar (A) up to the hook's shoulder (L0), over the top (T) to
// the other shoulder (R0), and its right leg down to the collar again (F). Its right end tears; the coat hangs from A, so it swings over to
// put its middle under it (3.2°, a 1.74 s pendulum) while the strap runs over the hook, from rest, on its friction (120 units/s²): the
// right leg shortens, its end rides up over the top, and the strap is off. Then the coat falls freely, turning on as it was.
const A0 = [92.35, 35.6], L0 = [93.16, 30.2], T = [96, 28.1], R0 = [99.76, 30.14], F0 = [101.2, 35.7];
const OVER_L = "C93.71 28.88 94.6 28.1 96 28.1", RIGHT = [[97.6, 28.1], [98.875, 28.825], [99.76, 30.14]];
const LEG_R = Math.hypot(F0[0] - R0[0], F0[1] - R0[1]), OVER_R = 4.3, OFF = LEG_R + OVER_R;
const T_TEAR = 0.2, T_SLIDE = T_TEAR + 0.12, SLIP = 120;
const T_OFF = T_SLIDE + Math.sqrt((2 * OFF) / SLIP), V_OFF = SLIP * (T_OFF - T_SLIDE);
const LEAN = 3.2, W = (2 * Math.PI) / 1.74;
const lean = (t) => (t <= T_TEAR ? 0 : LEAN * (1 - Math.cos(W * (Math.min(t, T_OFF) - T_TEAR))) + (t > T_OFF ? LEAN * W * Math.sin(W * (T_OFF - T_TEAR)) * (t - T_OFF) : 0));
const slid = (t) => (t <= T_SLIDE ? 0 : t <= T_OFF ? 0.5 * SLIP * (t - T_SLIDE) ** 2 : OFF + V_OFF * (t - T_OFF) + 0.5 * G * (t - T_OFF) ** 2);
// the right half of the top, from T, cut short at u (de Casteljau)
function overRight(u) {
  const P = [T, ...RIGHT], lerp = (a, b) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const a = lerp(P[0], P[1]), b = lerp(P[1], P[2]), c = lerp(P[2], P[3]), d = lerp(a, b), e = lerp(b, c), f = lerp(d, e);
  return `C${n2(a[0])} ${n2(a[1])} ${n2(d[0])} ${n2(d[1])} ${n2(f[0])} ${n2(f[1])}`;
}
const strap = (d, dx = 0, dy = 0) => {
  const at = dx || dy ? ` transform="translate(${n2(dx)} ${n2(dy)})"` : "";
  return `<path d="${d}" fill="none" stroke="${paint("sky-deep")}" stroke-width="2.3" stroke-linecap="round" transform="translate(${n2(dx - 0.55)} ${n2(dy + 0.05)})"/><path d="${d}" fill="none" stroke="${paint("sky")}" stroke-width="1.95" stroke-linecap="round"${at}/>`;
};
const SAD_DUR = (() => { let t = T_OFF; while (slid(t) < 200) t += 1 / 600; return t + 0.8; })();
function sad(t) {
  if (t <= 0) return STILL;
  const s = slid(t), a = lean(t);
  // the coat's attachment: swung over under the shoulder as it leans, then down with the strap
  const k = Math.min(1, a / LEAN);
  const A = [A0[0] + (L0[0] - A0[0]) * k, A0[1] + s];
  const at = `translate(${n2(A[0] - A0[0])} ${n2(A[1] - A0[1])}) rotate(${n2(a)} ${A0[0]} ${A0[1]})`;
  let loop;
  if (t <= T_TEAR) {
    loop = strap(`M${A0[0]} ${A0[1]}L${L0[0]} ${L0[1]}${OVER_L}C${RIGHT.map((p) => p.join(" ")).join(" ")}L${F0[0]} ${F0[1]}`);
  } else if (t <= T_OFF) {
    // the torn end swings to hang straight down from the far shoulder as it's drawn up
    const legR = LEG_R - s;
    const swingTo = track([[T_TEAR, Math.atan2(F0[0] - R0[0], F0[1] - R0[1])], [T_TEAR + 0.12, -0.12, "out"], [T_TEAR + 0.24, 0.05, "io"], [T_TEAR + 0.34, 0, "io"]], t);
    const right = legR > 0
      ? `C${RIGHT.map((p) => p.join(" ")).join(" ")}L${n2(R0[0] + legR * Math.sin(swingTo))} ${n2(R0[1] + legR * Math.cos(swingTo))}`
      : overRight(Math.max(0.001, 1 - (s - LEG_R) / OVER_R));
    loop = strap(`M${n2(A[0])} ${n2(A[1])}L${L0[0]} ${L0[1]}${OVER_L}${right}`);
  } else {
    // off: light, it streams up above the coat as they fall, its curl over the top straightening out within a tenth of a second, fluttering
    const u = t - T_OFF, straight = track([[0, 0], [0.1, 1, "out"]], u), sway = 1.4 * Math.sin(u * 31) * Math.min(1, u * 8);
    const top = [L0[0] + (T[0] - L0[0]) * (1 - straight) + sway, L0[1] + (T[1] - L0[1]) * (1 - straight) - 3.6 * straight];
    const A_OFF = [L0[0], A0[1] + OFF];
    loop = strap(`M${n2(A_OFF[0])} ${n2(A_OFF[1])}Q${n2(L0[0] + sway * 0.5)} ${n2(L0[1] + 2)} ${n2(top[0])} ${n2(top[1])}`, 0, s - OFF);
  }
  const coatGone = s > 200;
  const coat = coatGone ? "" : `<g transform="${at}">${COAT_PARTS.join("")}</g>`;
  const shadow = coatGone ? "" : `<g transform="${at}">${COAT_SHADOW}</g>`;
  return `${OPEN}${WALL}${HOOK_SHADOW}${shadow}${HOOK}${coatGone ? "" : loop}${coat}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
