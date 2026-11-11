// The sofa's two stories. Happy: it squashes down and coughs up the remote you lost in it, which spins out and lands on a cushion; then a coin, that lands and spins
// itself flat. Sad: it's old. The seat sags in the middle with a creak, and a spring boings up through a cushion, throwing out stuffing. It stays that way.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths, in the 200-unit view.
import { n2, n4, paint, parsePath, partsOf, runsToDc, subdivide, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M31.5 157.9c1.2 1.3 3.6 2.9 4.3 4.6 .5 1.1 .5 2.9 .8 4.1 .8 .1 1.5 .2 2.3 .3 1.4-5.8 1.5-5 5.7-9.2l-1 4.2 110.2 0-1-4.3c1.3 1.4 3.5 3 4.4 4.6 1.2 2.1 1.2 5 2 7.3-1 1-2.7 3.4-4.4 3.4l-36.9 0-39.2-.2-22.3 0 50 14.9 42.8 12.4c1.4 .4 3.8 3.4 4.8 4.4l-158.4 0 0-42.5 36.7 0-.8-4ZM165.8 157.9l-.8 4 39.4 0 0 21.6-39.6-10.3c-1.8-.5-3.3-2.5-4.6-3.8 .6-2.1 .6-5.6 1.6-7.3 .9-1.5 2.8-3 4-4.2Z\" fill=\"var(--art-violet-lit,#A68CFF)\" fill-rule=\"evenodd\"/>\n<path d=\"M42.7 165.2l-.8 3.8 114 .5c-.6-1.3-1.1-2.1-.3-3.4 3.2 .7 5.7 .8 8.6-.6 0 1.5-.1 2.5-.6 4l40.8 10.5 0 24.4-53.5 0c-1.2-.6-2.4-1.2-3.8-1.6l-62.6-18.2c-.1 0-.1 0-.2 0l-41-12.5c-2.8-.9-5.4-1.8-8.3-2.2l3.2-3.2c1.8-.2 2.8-.6 4.5-1.5Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M149.7 103.7l4.6 1c1.3-6.9 2.8-10.2 7.7-15.2 1.8-1.7 3.5-3.3 5.7-4.4 1.9-.9 4.6-2 6.7-1.5 .8 .2 1.6 .7 2.4 1 1.3 .3 2.6 .1 3.9 .6 1.4 .6 2.6 1.8 3.7 2.9 2.8 2.8 5.3 5.6 6 9.7 1.6 8.8-5.5 12.8-8.7 19.8-4.2 9.1-3.1 19.9-6.8 28.4-1.1 2.4-3.1 5.4-5.4 6.7-3.1 1.9-2.5-.1-4.8 3.9l-3.5 1.2-3.8-3.8c1.1-1.2 2.5-2.3 3.4-3.7 2.6-4.3 2.1-11.6 2.1-16.5-1.5 1.3-3.2 2.7-5.3 2.7l-50.8 0c-2.9 0-5-2.5-6.9-4.4-1.9 1.9-3.9 4.4-6.8 4.4l-52.5 0c-1.7 0-3.3-1-4.7-1.8 0 4.3-.1 11.5 2.1 15.2 .9 1.5 2.4 2.6 3.6 3.8l-3.8 3.8-5.4-.3-.8-3.1c-2.4-.8-4.9-1.4-7-3-10.1-7.3-4.5-21-7.7-31-1.1-3.4-3.8-3.8-6.5-5.6-2-1.4-3.6-3.4-4.7-5.7-4.4-9.1 .4-20.4 9.9-23.8 3.3-1.2 6.8-1.2 10.3-.8-1.1-4.3-.1-8.6 1.4-12.7 5.6-15.9 22.2-25.1 38.6-25.1l66.5 0c3.4 0 6.9 1.2 10.2 1.8 5.1 1 5.9 1.7 9.4 5.4 8.4 8.7 9.1 21 5.1 32-2.2 6.2-5.5 11.8-7.4 18.1Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M32.5 88.3c6.6 5.2 9.2 9.3 11.5 17.3 4.2-.9 8.4-1.6 12.7-1.5l24.2 0c7.4 0 14.3 1.1 19.2 7.1 4.5-6 12.2-7.2 19.4-7.2l23.5 .1c1.3 0 2.6 .1 4 .2l.9-3.2c3.2 .8 6.1 1.9 9.1 3.6l-.1 3.3c1.9 1.5 3.3 3.2 4.9 5-5.8-5-10.2-6.3-17.9-6.3l-24.2 0c-6.9 0-14.9 1.7-18 8.6-1 2.3-1.3 4.7-1.7 7.2-.3-2.2-.6-4.4-1.4-6.4-3-7.6-11.3-9.5-18.7-9.4l-24 0c-8.1 .1-16.1 2.4-20.1 10.2-2.1 4.3-3.4 11.8 1.4 15 .9 .6 2.1 1.1 3.2 1.1l52.8 0c4.6 0 6-4.6 6.7-8.3 .9 3.7 2.2 8.3 6.9 8.3l50.7 0c1.6 0 3.3-.8 4.5-1.9 4.7-4.4 2.3-12 .3-17 3.3 3.3 3.7 8.6 4 13 .3 6.2 1 18.2-2.3 23.6-1.1 1.8-2.9 3.2-4.5 4.6l4-.8c-.9 .8-2.2 2.6-3.3 3.1-1.3 .6-5 .2-6.5 .2l-1.1-3.4c-1-.1-2-.2-3.1-.2l-42.7-.2-62 0-1 3.5c-4 0-4.9 .8-7.4-2.6 .9-.1 1.3-.1 2-.7-1.4-1.4-3.1-2.5-4-4.5-2.9-6.2-2.4-24.3-.7-31 2.3-8.9 8.4-14.8 3.3-24.7-1.2-2.1-2.9-3.9-4.5-5.7Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M136.8 46.8c2.9 0 5.8 .5 8.6 1.2 11.2 2.8 21 9.7 26 20.3 1.4 3 2.4 6.2 2.9 9.5 .3 1.5 0 4 1.1 5.2 1 1.1 6.5 1.3 8.5 1.9 6.2 2.2 11 8.3 11.6 14.9 1.2 13-7.9 13.2-11 22.4-3.6 10.3 .3 23.7-11.3 30.2-2.4 1.4-5 1.7-7.6 2.3l-.7 3.4c-1.8-.6-2.7-1.6-3.9-2.9 .5-.2 1.2-.4 1.8-.6-.1-.1 .2-.2 .1-.2-.3-.2-.6 .1-.8-.3-.1-.1 .1-.1 .1-.2 9.8-3.1 10.7-11.6 12-20.5 .8-4.6 1.5-9.2 3.1-13.6 1-2.7 2.4-5.3 4.2-7.6 1.5-2 3.3-3.8 4.4-6 1.8-4 1.7-8.6-.4-12.5-4.6-9-16.4-8.4-22.7-1.5-4 4.5-4.8 10.6-5.2 16.4-3.7-2.2-7.3-3.5-11.5-4.3 1.8-6.5 5.2-12.3 7.5-18.6 4-10.9 3.5-23.9-5.4-32.4-2.1-2-4.7-3.7-7.4-4.9-1.3-.6-2.7-1-4-1.6Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M30.7 153.8l14.9 .2c-.9 2.8-2.7 13-3.9 14.7-1.4 2-6.3 2.1-7.9 .1-1.3-1.8-2.3-12-3.1-15ZM166.5 154.3c-.6 2.7-1.8 13-3 14.6-1.5 1.8-6.3 1.7-7.8-.1-1.2-1.6-3.1-11.8-3.9-14.5l14.7 0Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "b0f6bcb861";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [TABLE, SHADOW, BODY, SEAT, SIDE, LEGS] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const FLOOR = 170;
const decay = (t, at, amp, hz, k) => (t <= at ? 0 : amp * Math.sin(2 * Math.PI * hz * (t - at)) * Math.exp(-k * (t - at)));
const fill = (t) => `fill="${paint(t)}"`;
const sofa = (inner, tr) => (tr ? `<g transform="${tr}">${inner}</g>` : inner);
const squash = (sx, sy) => (sx === 1 && sy === 1 ? "" : `translate(100 ${FLOOR}) scale(${n4(sx)} ${n4(sy)}) translate(-100 -${FLOOR})`);

// ---- happy.
// The remote: a dark bar, its lit edge on the left, a red power button and a few gray ones. Lying on a cushion, it's seen flattened.
function remote(x, y, rot, flat) {
  let b = "";
  for (const yy of [-4, 2, 8]) for (const xx of [-2.6, 2.6]) b += `<circle cx="${xx}" cy="${yy}" r="1.35" ${fill("steel")}/>`;
  return `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(rot)}) scale(${n4(1.32 * flat)} 1.32)"><rect x="-6.5" y="-19" width="13" height="38" rx="4.5" ${fill("ink")}/>`
    + `<rect x="-6.5" y="-19" width="4.2" height="38" rx="2.1" ${fill("ink-lit")}/><circle cx="0" cy="-12.5" r="2.5" ${fill("clay")}/>${b}</g>`;
}
// A coin: its face, and its edge under it once it lies down.
function coin(x, y, face, tilt) {
  const r = 9.5;
  return `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(tilt)})"><ellipse cx="0" cy="1.8" rx="${r}" ry="${n2(Math.max(0.8, r * face))}" ${fill("sun-deep")}/>`
    + `<ellipse cx="0" cy="0" rx="${r}" ry="${n2(Math.max(0.6, r * face))}" ${fill("sun")}/><ellipse cx="-2.8" cy="${n2(-2.2 * face)}" rx="3.2" ry="${n2(Math.max(0.4, 2.7 * face))}" ${fill("sun-lit")}/></g>`;
}
const G = 820;
// A shadow on the seat (its top is at 104) under something in the air: offset to the right, away from the light, and gone by the time it's 60 up.
function seatShadow(x, bottom, size) {
  // (nothing while it's still down in the crack, below the seat: its shadow comes onto the seat as it rises out)
  const out = Math.max(0, Math.min(1, (112 - bottom) / 8));
  if (out <= 0) return "";
  const h = Math.max(0, 104 - bottom), k = 1 - Math.min(1, h / 60);
  if (k <= 0.05) return "";
  return `<ellipse cx="${n2(x + h * 0.25)}" cy="105.5" rx="${n2(size * (0.55 + 0.45 * k) * out)}" ry="${n2((2.4 * k + 0.6) * out)}" ${fill("paper-deep")}/>`;
}
// How far a thing reaches below its middle, turned: the remote is 50 long and 17 wide (at its scale), the coin 19 across.
const reachRemote = (rot, flat) => 25 * Math.abs(Math.cos((rot * Math.PI) / 180)) + 8.6 * flat * Math.abs(Math.sin((rot * Math.PI) / 180));
const LAUNCH = 0.34, LAND = 0.98;
// The crack between the cushions, where things go.
const CRACK = `<clipPath id="ck"><rect x="0" y="0" width="200" height="112"/></clipPath>`;
const HAPPY_DUR = 2.45;
function happy(t) {
  if (t <= 0) return STILL;
  // The squash, the heave that throws, the wobble after; a smaller heave for the coin.
  const sy = track([[0.1, 1], [0.32, 0.92, "io"], [0.4, 1.07, "out"], [0.52, 0.97, "io"], [0.64, 1.02, "io"], [0.76, 1, "io"], [1.14, 1], [1.24, 0.96, "io"], [1.3, 1.03, "out"], [1.42, 1, "io"]], t);
  const sx = 1 + (1 - sy) * 0.45;
  let thing = "", resting = "";
  // The remote: out of the crack fast, up and over, falling onto the right cushion, a turn and a quarter on the way; it lies down as it comes in.
  // It's there from the first frame, waiting deep in the crack where none of it shows, so it rises out rather than arriving.
  {
    let x, y, rot, flat;
    if (t <= LAUNCH) { x = 100; y = 138; rot = -20; flat = 1; }
    else if (t < LAND) {
      const s = (t - LAUNCH) / (LAND - LAUNCH), T = LAND - LAUNCH;
      x = 100 + 30 * s;
      // Launched from deep in the crack (its middle at 138, so all of it starts below the cushions' line at 112 and it rises out of the gap a few units a
      // frame, never appearing) so that gravity brings it down on the cushion at 98: up fast, slowing, then falling faster. It spins at one rate all the way.
      const vy = (138 - 98 + 0.5 * G * T * T) / T;
      y = 138 - vy * (t - LAUNCH) + 0.5 * G * (t - LAUNCH) ** 2;
      rot = -20 + 470 * s;
      flat = 1 - 0.3 * track([[0.7, 0], [1, 1, "in"]], s);
    } else {
      const hop = track([[0, 0], [0.07, -6, "out"], [0.14, 0, "in"], [0.19, -1.6, "out"], [0.24, 0, "in"]], t - LAND);
      x = 130; y = 98 + hop; rot = 450 + decay(t, LAND, -6, 3.4, 7); flat = 0.7;
    }
    // Its shadow on the seat, under it and a little to the right, smaller and paler the higher it is.
    // (cut to the crack's line while any of it is still below it)
    const r = remote(x, y, rot, flat), drawn = seatShadow(x, y + 6, 15) + (y + reachRemote(rot, flat) > 112 ? `<g clip-path="url(#ck)">${r}</g>` : r);
    // Coming out of the crack it's behind the cushions' fronts; once it's clear, nothing hides it. Once it's down, it rides the cushion as the sofa heaves.
    if (t < LAND) thing += drawn; else resting += drawn;
  }
  // The coin: a smaller hop, flipping, onto the left cushion; it rolls on its rim and spins itself down flat.
  const C0 = 1.3, C1 = 1.72;
  // (there from the first frame too, waiting in the crack where none of it shows)
  {
    let x, y, face, tilt;
    if (t <= C0) { x = 100; y = 122; face = 1; tilt = 0; }
    else if (t < C1) {
      // (from deep enough in the crack that all of it starts hidden, at 122)
      const s = (t - C0) / (C1 - C0), T = C1 - C0, vy = (122 - 102 + 0.5 * G * T * T) / T;
      x = 100 - 38 * s; y = 122 - vy * (t - C0) + 0.5 * G * (t - C0) ** 2;
      face = Math.abs(Math.cos(2 * Math.PI * 2.6 * (t - C0))); tilt = -30 * s;
    } else {
      const s = t - C1, k = Math.min(1, s / 0.62);
      // Wobbling down: the face opens as the spin quickens and dies.
      face = 0.5 - 0.34 * (1 - k) * Math.abs(Math.cos(2 * Math.PI * (3 + 9 * k) * s));
      x = 62 + 1.2 * (1 - k) * Math.sin(2 * Math.PI * 6 * s); y = 102; tilt = 0;
    }
    // (cut to the crack's line while any of it is still below it: it's 9.5 across each way, and up to 11.3 deep with its edge under it)
    const c = coin(x, y, face, tilt), drawn = seatShadow(x, y + 4, 9) + (y + 11.3 > 112 ? `<g clip-path="url(#ck)">${c}</g>` : c);
    if (t < C1) thing += drawn; else resting += drawn;
  }
  const shadow = `<g transform="translate(100 ${FLOOR}) scale(${n4(sx)} 1) translate(-100 -${FLOOR})">${SHADOW.svg}</g>`;
  return `${OPEN}${CRACK}${BG}${TABLE.svg}${shadow}${sofa(BODY.svg + SEAT.svg + SIDE.svg + LEGS.svg + resting, squash(sx, sy))}${thing}</svg>`;
}

// ---- sad. The seat gives in the middle, slowly, with nothing on it. Then a spring goes through the left cushion: up, too far, and boinging, and the stuffing it
// throws out comes down on the floor. The seat sinks the rest of the way.
// The sag: the middle of the seat and the frame under it come down, most at the middle, none at the legs; the top of the back hardly moves.
const RUNS = [BODY, SEAT, SIDE].map((p) => subdivide(parsePath(p.d), 2));
const bump = (x) => (x <= 36 || x >= 164 ? 0 : Math.sin((Math.PI * (x - 36)) / 128) ** 1.6);
const reach = (y) => { const w = Math.max(0, Math.min(1, (y - 62) / 46)); return w * w * (3 - 2 * w); };
const sagAt = (x, y, sag) => sag * bump(x) * reach(y);
const POP = 0.9, SX = 64, SY = 106;
const SAD_DUR = 2.65;
function spring(h, lean) {
  // A coil, seen from the side: a zigzag that stretches with it, lit on its left.
  const n = 6, w = 8.4;
  let d = `M0 0`;
  for (let i = 1; i <= n; i++) d += `L${i % 2 ? w : -w} ${n2((-h * (i - 0.5)) / n)}`;
  d += `L0 ${n2(-h)}`;
  return `<g transform="translate(${SX} ${SY}) rotate(${n2(lean)})"><path d="${d}" fill="none" stroke="${paint("steel-deep")}" stroke-width="3.8" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<path d="${d}" transform="translate(-0.8 -0.4)" fill="none" stroke="${paint("steel")}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></g>`;
}
// Stuffing: tufts thrown out of the hole, falling to the floor and staying there.
const TUFTS = [[-1, -190, -38, 0, 5.6], [1, -160, 52, 0.03, 4.8], [-1, -120, -26, 0.06, 4]];
function tufts(t) {
  let out = "";
  for (const [dir, vy, vx, at, r] of TUFTS) {
    const s = t - POP - at;
    if (s <= 0) continue;
    const g = 760, yLand = FLOOR + 3 - SY, tLand = (-vy + Math.sqrt(vy * vy + 2 * g * yLand)) / g;
    const q = Math.min(s, tLand), x = SX + vx * q * 1.4 + dir * 2, y = SY + vy * q + 0.5 * g * q * q;
    const grow = Math.min(1, s / 0.12);
    // Its shadow on the floor comes up under it as it nears, so it lands on the floor rather than in front of it.
    const near = Math.max(0, Math.min(1, 1 - (FLOOR + 3 - y) / 40));
    if (near > 0) out += `<ellipse cx="${n2(x + 1.5)}" cy="${n2(FLOOR + 3 + 0.92 * r)}" rx="${n2(r * 1.2 * near)}" ry="${n2(r * 0.34 * near)}" ${fill("violet-deep")}/>`;
    // Lit from the upper left, as the sofa is: the tuft in its shade, and a copy moved toward the light inside it, so the shade is a crescent on its lower right.
    const blob = (dx, dy) => [[-0.6, 0.2, 0.75], [0, -0.3, 1], [0.65, 0.25, 0.7]].map(([ox, oy, f]) => `<circle cx="${n2(x + dx + ox * r * grow)}" cy="${n2(y + dy + oy * r * grow)}" r="${n2(r * f * grow)}"/>`).join("");
    const id = `tf${TUFTS.findIndex((one) => one[3] === at)}`;
    out += `<g ${fill("paper-deep")}>${blob(0, 0)}</g><clipPath id="${id}">${blob(0, 0)}</clipPath><g clip-path="url(#${id})" ${fill("paper")}>${blob(-0.28 * r, -0.3 * r)}</g>`;
  }
  return out;
}
function sad(t) {
  if (t <= 0) return STILL;
  const sag = track([[0.12, 0], [0.62, 6.4, "io"], [0.74, 5.6, "io"], [POP, 5.8, "io"], [POP + 0.12, 10.5, "out"], [POP + 0.26, 9.2, "io"], [POP + 0.4, 10, "io"]], t);
  const [body, seat, side] = RUNS.map((r) => runsToDc(r, (x, y) => [x, y + sagAt(x, y, sag)]));
  const base = sagAt(SX, SY, sag);
  // The spring is in the cushion all along, pushed down out of sight; when it goes it comes up out of the hole it tears, all its length, fast, and
  // wobbles on its stretch. What's below the seat's surface is hidden: it rises out of the cushion, it doesn't appear on it.
  const rise = t < POP ? 0 : track([[0, 0], [0.16, 1, "out"]], t - POP), sink = 46 * (1 - rise);
  const h = 44 - decay(t, POP + 0.16, 12, 3.1, 4.2);
  const lean = decay(t, POP + 0.05, 14, 1.9, 2.6) - 6 * Math.min(1, Math.max(0, (t - POP) / 0.3));
  const hole = t < POP ? "" : `<ellipse cx="${SX}" cy="${n2(SY + base + 0.6)}" rx="${n2(9 * Math.min(1, (t - POP) / 0.05))}" ry="3.2" ${fill("ink-lit")}/>`;
  const sofaNow = `<path d="${body}" ${fill("paper")}/><path d="${seat}" ${fill("paper-deep")}/><path d="${side}" ${fill("violet-deep")}/>${LEGS.svg}`;
  const seatLine = `<clipPath id="sp"><rect x="0" y="-10" width="200" height="${n2(SY + base + 10)}"/></clipPath>`;
  return `${OPEN}${seatLine}${BG}${TABLE.svg}${SHADOW.svg}${sofaNow}${hole}<g clip-path="url(#sp)"><g transform="translate(0 ${n2(base + sink)})">${spring(h, lean)}</g></g>${tufts(t)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
