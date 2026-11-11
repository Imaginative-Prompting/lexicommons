// The dollar's two stories. The coin is rolling (a coin doesn't stand still on its edge): it rolls on to the right, slowing, as the camera follows it
// and draws back. Happy: a change tray comes into view; the coin rides up over its low side, rolls on inside, stops, and topples flat in it, $ up.
// Sad: a cabinet comes into view instead; the coin rolls in under it, into the dark behind its front leg, and topples flat there, out of reach.
// Every frame is a pure function of t, in seconds. The still's world, carried on past its frame: its wall, its floor, the coin's long shadow.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M65.2 156.7c2.3 1.1 4.6 2.2 7.1 2.9 1.4 .5 3.2 .7 4.5 1.5l64.7 38.9c1.7 1 3.2 3 4.6 4.4l-150.5 0 0-44.1 69.1-.1c-.4-.5-1-.8-1.5-1.1l2-2.4ZM121.5 156.6l2.2 2.2c-.6 .4-1.3 .8-1.9 1.2 .2 .1 .3 .3 .6 .3l82 0 0 31.9-91.2-24.9c-1.5-.4-3-2.6-4.1-3.6 1.2-1.2 2.3-2.7 3.7-3.6 1.1-.8 2.7-1 3.9-1.5 1.7-.6 3.3-1.3 4.8-2Z\" fill=\"var(--art-violet-lit,#A68CFF)\" fill-rule=\"evenodd\"/>\n<path d=\"M112.5 160.1l2.4 2.6c-.7 .3-1.4 .5-2.1 .8 .2 .2 .3 .4 .5 .4l91.1 24.9 0 15.6-61.9 0c-.3-.2-.8-.8-1.2-1l-64.6-38.9c-.6-.3-1.5-.6-2.1-.8l2.7-2.7c4.4 .8 8.6 .9 13.1 .9 7.5 0 14.7 0 22.1-1.8Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M87.9 28.9c4.4-.3 8.5 .4 12.9 .7 3.5 .2 7.4-.4 10.8 .9 8.4 3.1 19.9 15.6 24.7 23.1 19 29.5 14 71.1-10.7 95.9-5.2 5.2-11.8 11.7-18.8 14.2-3.8 1.4-8.3 .6-12.3 .9-3.1 .2-6 .9-9.1 .8-33.4-.8-55.5-35.8-56.4-66.5-.8-26.4 15.3-52.4 38.8-64.1 6.3-3.1 13-5.4 20.1-5.9ZM87.4 56.4c0 1.4 .3 3.1-.1 4.5-.5 1.6-2.7 3.6-4.2 4.4-1.1 .5-2.4 .6-3.5 1-2.4 .6-4.8 1.6-6.8 3-4.6 2.9-6.8 9.3-6.7 14.5 .3 8.6 4.7 11.4 12.2 13.8 1.6 .6 3.4 .8 4.8 1.9 1.1 .8 2.6 2.2 3.1 3.4 .4 1.2 .3 14.2-.2 15.4-.6 1.6-2.5 3-3.7 4.1-6.4-2.2-9.1-4.9-13.7-9.5l-5.7 6.5c3.5 4.5 8.4 7.1 14 8.4 1.6 .3 3.6 .3 5 1 1.6 .8 2.8 2.5 4 3.7l-.2 5.2 3.5 0c0-4-.5-5.5 2.8-8.4 1.7-1.5 4.1-1.6 6.2-2.3 2.4-.7 4.7-1.7 6.8-3.1 6.4-4.6 7.1-18.2 1.3-23.6-2.3-2.2-5.7-3.5-8.7-4.6-1.2-.4-2.5-.7-3.5-1.3-1.6-.9-2.8-2.5-4.1-3.8 .1-2.4 0-14.1 .7-15.6 .7-1.4 2.5-2.7 3.6-3.9 4.1 1.4 7.3 3.5 10.7 6.2l4.8-5.5c-3.1-2.3-6.3-4.3-10.1-5.4-1.7-.5-3.8-.5-5.2-1.4-1.5-.8-2.8-2.5-4-3.7l.2-5-3.3 .1ZM83.1 70.8c1.2 1.1 3 2.4 3.7 3.9 .5 1.1 .3 11.3-.3 12.5-.6 1.5-2.5 2.9-3.6 4-2.2-1.1-3.7-2.5-5.4-4.2-4.4-4.4-4.5-7.6-.1-12 1.8-1.8 3.4-3.1 5.7-4.2ZM93.7 102.4c5.8 4 11.6 9.4 5.1 15.9-1.6 1.7-3.2 3-5.3 4.1l-3.9-3.9c0-2-.2-11 .4-12.2 .7-1.4 2.6-2.8 3.7-3.9Z\" fill=\"var(--art-sun,#F7BE45)\" fill-rule=\"evenodd\"/>\n<path d=\"M91.2 165.3c2.6-.9 5.3-1.1 7.9-1.9 8.5-2.6 16.1-7.4 22.5-13.4 27.5-26.1 31.2-76.5 5-104.6-6.1-6.5-13.5-11.7-22.1-14.4-1.2-.4-7.5-1.6-7.8-1.7-.2-.1-.3-.3-.5-.4 2.5-.4 5-.1 7.5-.1 28.2 0 48.8 23 54.6 49.2 2.5 11.6 2.5 23.8-.5 35.4-7.6 30.4-33.9 55.1-66.6 51.9Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M87.4 34.9c22-1.7 39.4 14.2 46.9 33.7 3.9 10.1 5.5 21.2 4.5 32-1.9 21.7-13.7 44.3-33.7 54.3-6.1 3.1-12.9 4.9-19.7 4.7-28.3-.7-47.8-28.8-50.7-54.8-3.7-31.6 19.3-67.5 52.7-69.9ZM86.5 39.3c-27.4 2.2-46.8 29.3-48.2 55.3-.5 9 1.2 18.1 4.5 26.5 7.2 17.9 23.2 34.3 43.6 34.2 27.5-.1 45.5-29.1 48.2-53.7 1.1-10.4-.2-21-4-30.7-7.1-18.6-23.3-33.3-44.1-31.6Z\" fill=\"var(--art-sun-lit,#FAD57E)\" fill-rule=\"evenodd\"/>\n<path d=\"M94.2 52.8l-.3 9c8.3 1.1 13.5 4.1 19.3 10l-8 9.2c-3.6-2.8-6.9-5.1-11.3-6.5l-.4 16.4c6.2 1.9 12.6 4.3 16.7 9.7 6.5 8.5 3.5 20.7-5.1 26.6-3.7 2.6-8 3.8-12.4 4.6l-.2 9.4-10.2 .2 .2-9.3c-10.4-1-16.7-4.5-23.1-12.7l9.2-10.5c3.9 4.9 8.1 8.4 14.2 10.1l.1-16.5c-6.3-1.8-13.2-3.9-17.3-9.6-6.4-8.9-1.7-21.2 6.8-26.9 3.5-2.3 7.4-3.4 11.5-4.1l0-8.9 10.3-.2ZM83.2 87.9l.4-13.8c-1.2 .5-2.4 .9-3.4 1.7-2.9 2.2-3.4 6.5-1.1 9.3 1.1 1.3 2.6 2 4.1 2.8ZM93.2 105.7l-.2 13.4c1.1-.5 2.3-.9 3.2-1.7 2.6-2.3 2.7-6.5 .5-9.1-1-1.2-2.3-1.9-3.5-2.6Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "b6178f3528";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const P = [...STILL.matchAll(/<path[^>]*\/>/g)].map((m) => m[0]);
if (P.length !== 6) throw new Error("dollar: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const sunFill = P[2].match(/fill="[^"]+"/)[0];
const SUNS = P[2].match(/ d="([^"]+)"/)[1].split(/(?=M)/).filter(Boolean);
// the coin's face, its rim on the right (the coin is turned a little to the left of us), its ring; the $ and the gold inside it, which turn as it rolls
const FACE = `<path d="${SUNS[0]}" ${sunFill}/>`, RIM = P[3], RING = P[4], SIGN = `<path d="${SUNS.slice(1).join("")}" ${sunFill}/>${P[5]}`;
const D_FACE = SUNS[0], D_RIM = P[3].match(/ d="([^"]+)"/)[1], D_RING = P[4].match(/ d="([^"]+)"/)[1];
// the face's middle, and how narrow it is (it faces a little left): the $ turns in the face's own plane
const MID = [85.4, 96.5], NARROW = 0.859;
const R = 68.5, FLOOR = 160.1, FOOT = 165.5, X0 = 92;
// the floor's depth, seen from a camera about 20° up: a unit of depth is 0.34 down the screen, a unit of height 0.94 up it
const DEPTH = 0.342, HEIGHT = 0.94;

// ---- the world past the frame: the wall and the floor, and the coin's shadow carried on to a rounded end.
const WORLD = `<rect x="-900" y="-900" width="2600" height="${n2(900 + FLOOR)}" ${fill("violet")}/><rect x="-900" y="${FLOOR}" width="2600" height="1200" ${fill("violet-lit")}/>`;
// the still's shadow, its two edges (from the coin's foot, sloping 0.273 and 0.602) run on past the frame's edges to a round end
const SHADOW_D = "M112.5 160.1l2.4 2.6c-.7 .3-1.4 .5-2.1 .8 .2 .2 .3 .4 .5 .4L204.4 188.8L420 247.7C452 256 362 330 300 298.9L141.3 203.4c-.3-.2-.8-.8-1.2-1l-64.6-38.9c-.6-.3-1.5-.6-2.1-.8l2.7-2.7c4.4 .8 8.6 .9 13.1 .9 7.5 0 14.7 0 22.1-1.8Z";
const ANCHOR = [95, 162.5];
function shadow(dx, k, extra = "", tone = "violet-deep") {
  const shrink = k === 1 ? "" : ` translate(${ANCHOR[0]} ${ANCHOR[1]}) scale(${n4(k)}) translate(${-ANCHOR[0]} ${-ANCHOR[1]})`;
  const at = `${dx ? `translate(${n2(dx)} 0)` : ""}${shrink}`.trim();
  return `<path d="${SHADOW_D}"${at ? ` transform="${at}"` : ""} ${extra}${fill(tone)}/>`;
}

// ---- the coin, rolled dx along the floor and lifted by `lift`, turned θ (radians); tipped φ (0 upright … π/2 flat towards us).
function coinParts(theta, lit = true) {
  const deg = (theta * 180) / Math.PI;
  const turn = Math.abs(deg) < 1e-6 ? "" : `translate(${MID[0]} ${MID[1]}) scale(${NARROW} 1) rotate(${n2(deg)}) scale(${n4(1 / NARROW)} 1) translate(${-MID[0]} ${-MID[1]})`;
  const sign = turn ? `<g transform="${turn}">${SIGN}</g>` : SIGN;
  if (lit) return `${FACE}${RIM}${RING}${sign}`;
  // in the dark under the cabinet: every gold a step darker
  return `<path d="${D_FACE}" ${fill("wood-deep")}/><path d="${D_RIM}" ${fill("bark")}/><path d="${D_RING}" ${fill("sun-deep")}/>${turn ? `<g transform="${turn}">` : ""}<path d="${SUNS.slice(1).join("")}" ${fill("wood-deep")}/>${P[5]}${turn ? "</g>" : ""}`;
}
// tipping towards us about its foot: its height on the screen goes as cos(φ + 20°), through edge-on, to lying flat ($ up, seen from above)
const E = 20 * (Math.PI / 180);
const tipK = (phi) => Math.cos(phi + E) / Math.cos(E);
function coin(dx, lift, theta, phi, lit = true) {
  const foot = [X0 + dx, FOOT - lift];
  const k = tipK(phi);
  const move = dx || lift ? `translate(${n2(dx)} ${n2(-lift)})` : "";
  const tip = phi ? ` translate(${n2(foot[0])} ${n2(foot[1])}) scale(1 ${n4(k)}) translate(${n2(-foot[0])} ${n2(-foot[1])})` : "";
  const inner = coinParts(theta, lit);
  const g = `${move}${tip}`.trim();
  const rimTone = lit ? "sun-deep" : "bark";
  // as it tips its thickness shows: its outline again in the rim's tone, a little off the face (above it while it faces us, below once it's
  // over), and edge on, the whole thickness as a band where its top edge is
  let rim = "", band = "";
  if (phi) {
    const off = (k < 0 ? 1 : -1) * 2.4 * Math.min(1, phi / (Math.PI / 2));
    rim = `<g transform="translate(0 ${n2(off)})"><g transform="${g}"><path d="${D_FACE}" ${fill(rimTone)}/></g></g>`;
    const thick = 6.4 * Math.max(0, 1 - Math.abs(k) / 0.2);
    const top = foot[1] + (28.6 - foot[1]) * k;
    if (thick > 0.05) band = `<rect x="${n2(foot[0] - 63)}" y="${n2(top - thick / 2)}" width="126" height="${n2(thick)}" rx="${n2(thick / 2)}" ${fill(rimTone)}/>`;
  }
  return `${rim}${g ? `<g transform="${g}">${inner}</g>` : inner}${band}`;
}

// ---- the roll: slowing evenly to a stop, the camera following and drawing back.
const ROLL = 2, DIST = 428, Z_END = 0.42;
// it was standing on its edge: it leans into a roll from rest, and slows to a stop
const rolled = (t) => track([[0, 0], [ROLL, DIST, "io"]], t);
function camera(t, dx, fyEnd) {
  // it draws back first, and follows: what's ahead comes in with the slow start of the move back, never at the pan's full speed
  const s = track([[0, 0], [ROLL * 0.85, 1, "io"]], t), back = track([[0, 0], [ROLL * 0.55, 1, "io"]], t);
  const z = 1 + (Z_END - 1) * back;
  const fx = X0 + dx + 8 + (25 - 8) * s, fy = 100 + (fyEnd - 100) * s;
  return z === 1 && fx === 100 && fy === 100 ? "" : `translate(100 100) scale(${n4(z)}) translate(${n2(-fx)} ${n2(-fy)})`;
}
// it stops, stands a moment wobbling, then topples towards us, faster and faster, and rattles flat
const STOP = ROLL, TIP_AT = STOP + 0.12, FLAT = TIP_AT + 0.36;
const tipAt = (t) => track([[TIP_AT, 0], [FLAT, Math.PI / 2, "in"], [FLAT + 0.05, Math.PI / 2 - 0.12, "out"], [FLAT + 0.1, Math.PI / 2, "in"], [FLAT + 0.14, Math.PI / 2 - 0.03, "out"], [FLAT + 0.18, Math.PI / 2, "in"]], t);
const wobble = (t) => (t < STOP || t > TIP_AT ? 0 : 0.04 * Math.sin(((t - STOP) / 0.12) * Math.PI));
const lying = (phi) => Math.max(0.12, Math.cos(phi));

// ---- happy: the tray. Its sides 27 high (well under the coin's radius, so it can ride over), three coins wide, against the wall.
const TX = 340, TW = 410, WALL = 10, LIP = 27 * HEIGHT, BACK = FLOOR + 8 * DEPTH, FRONT = FLOOR + 300 * DEPTH;
// (the coin rolls at its foot's depth; a side's top edge there is at AT: what's above that line on a side is behind the coin, what's below, in front)
const AT = FOOT - LIP;
const side = (x, from, to) => `<rect x="${x}" y="${n2(from)}" width="${WALL}" height="${n2(to - from)}" ${fill("wood-deep")}/>`;
const TRAY_BACK = `<rect x="${TX}" y="${n2(BACK - LIP)}" width="${TW}" height="${n2(FRONT - BACK + LIP)}" ${fill("bark")}/>` // the tray's floor inside, in its own shade
  + `<rect x="${TX}" y="${n2(BACK - LIP)}" width="${TW}" height="${n2(LIP)}" ${fill("wood")}/>` // its back side's inside, facing us, lit
  + side(TX, BACK - LIP, AT) + side(TX + TW - WALL, BACK - LIP, AT); // its sides, behind the coin
const TRAY_FRONT = side(TX, AT, FRONT) + side(TX + TW - WALL, AT, FRONT) // its sides, in front of it
  + `<rect x="${TX}" y="${n2(FRONT - LIP)}" width="${TW}" height="${n2(LIP)}" ${fill("wood-deep")}/>` // its front, facing us
  + `<rect x="${TX}" y="${n2(FRONT - LIP - 2.8)}" width="${TW}" height="2.8" ${fill("wood")}/>`; // the front's top, lit
const TRAY_CLIPS = `<clipPath id="to"><rect x="-900" y="-900" width="${900 + TX}" height="2600"/><rect x="${TX + TW}" y="-900" width="1800" height="2600"/><rect x="${TX}" y="${n2(FRONT)}" width="${TW}" height="1200"/></clipPath>`
  + `<clipPath id="ti"><rect x="${TX + WALL}" y="${n2(BACK)}" width="${TW - 2 * WALL}" height="${n2(FRONT - LIP - BACK)}"/></clipPath>`;
const RISE_AT = TX + WALL / 2;
// riding over the side: its middle swings round the side's top edge (only while it's within reach of it)
function over(cx) {
  const d = cx - RISE_AT, h = 27, reach = Math.sqrt(R * R - (R - h) * (R - h));
  return Math.abs(d) >= reach ? 0 : (h + Math.sqrt(R * R - d * d) - R) * HEIGHT;
}
const HAPPY_DUR = FLAT + 0.18 + 0.6;
function happy(t) {
  if (t <= 0) return STILL;
  const dx = rolled(t), theta = dx / R + wobble(t), phi = tipAt(t), lift = over(X0 + dx);
  const cam = camera(t, dx, 190);
  const k = lying(phi);
  // its shadow on the floor round the tray, and on the tray's own floor in a deeper wood
  const world = `${WORLD}${TRAY_CLIPS}<g clip-path="url(#to)">${shadow(dx, k)}</g>${TRAY_BACK}<g clip-path="url(#ti)">${shadow(dx, k, "", "bark-deep")}</g>${coin(dx, lift, theta, phi)}${TRAY_FRONT}`;
  return `${OPEN}${cam ? `<g transform="${cam}">${world}</g>` : world}</svg>`;
}

// ---- sad: the cabinet. It stands on legs a little over a coin and a third high; the coin rolls in under it, behind its front left leg, into the dark.
const CX = 340, CFRONT = FLOOR + 170 * DEPTH, UNDER = CFRONT - 190 * HEIGHT;
// the cabinet's own shadow, thrown by the light that throws the coin's: from its front left foot, out along the slope of the coin shadow's left edge,
// over the floor in front of it and to its right (the coin's shadow goes into it there, as one shade)
const CAB_SHADOW = `<path d="M${CX} ${n2(CFRONT)}L${CX + 1400} ${n2(CFRONT)}L${CX + 1400} ${n2(CFRONT + 0.602 * 1400)}Z" ${fill("violet-deep")}/>`;
const CAB_DARK = `<rect x="${CX}" y="${n2(UNDER)}" width="1400" height="${n2(CFRONT - UNDER)}" ${fill("ink-lit")}/>`;
const CAB_FRONT = `<rect x="${CX}" y="-900" width="1400" height="${n2(900 + UNDER)}" ${fill("wood")}/>` // its front, lit
  + `<rect x="${CX}" y="${n2(UNDER - 9)}" width="1400" height="9" ${fill("wood-deep")}/>` // the rail along its foot
  + `<rect x="${CX}" y="${n2(UNDER)}" width="20" height="${n2(CFRONT - UNDER)}" ${fill("bark")}/>` // its front left leg
  + `<rect x="${CX}" y="${n2(UNDER)}" width="6" height="${n2(CFRONT - UNDER)}" ${fill("wood-deep")}/>`; // the leg's lit side
const DARK = `<clipPath id="du"><rect x="${CX}" y="${n2(UNDER)}" width="1400" height="1000"/></clipPath><clipPath id="dl"><rect x="-900" y="-900" width="${900 + CX}" height="2600"/></clipPath>`;
const SAD_DUR = FLAT + 0.18 + 0.6;
function sad(t) {
  if (t <= 0) return STILL;
  const dx = rolled(t), theta = dx / R + wobble(t), phi = tipAt(t);
  const cam = camera(t, dx, 150);
  const lit = coin(dx, 0, theta, phi, true), dim = coin(dx, 0, theta, phi, false);
  // (the coin in the light left of the cabinet, and a step darker under it)
  // its shadow is cast only by what's still in the light: it draws in as the coin goes under, and is gone once it's all in the dark
  const inLight = Math.max(0, Math.min(1, (CX - (X0 + dx - 63)) / 126));
  // (drawn in fast, under the coin's own foot: its far end never sweeps back across the floor in front of the cabinet)
  const k = Math.min(lying(phi), inLight ** 3);
  const world = `${WORLD}${DARK}${k > 0.02 ? shadow(dx, k) : ""}${CAB_SHADOW}${CAB_DARK}<g clip-path="url(#dl)">${lit}</g><g clip-path="url(#du)">${dim}</g>${CAB_FRONT}`;
  return `${OPEN}${cam ? `<g transform="${cam}">${world}</g>` : world}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
