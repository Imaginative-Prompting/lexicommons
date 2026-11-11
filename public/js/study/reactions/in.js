// In's two stories, the ball's weight's: the ball sits up in the box on a cardboard flap folded inside it (out of sight), and it presses down. Happy: the
// flap gives at its crease, folds down against the front wall, and the ball drops and settles right down in the box, only its crown showing. Sad: the
// flap holds and the front wall gives instead: its top buckles in under the load, the rim sagging, and the ball goes down with it, into a dented box.
// Every frame is a pure function of t, in seconds. The still's own parts: the wall (teal), the floor, the box's shadow, its front (its top at y 90.1, the
// ball and the box's dark inside lying over its top edge down to y 93.5), the ball (its visible crown and its shade, a circle about (96.6, 84.2), r 42.5),
// the box's dark right side and inside (one ink path). The opening: front rim y 93.5 (x 35.3-130.1), back rim (57.9, 75.6) to (161.3, 71).
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M35.1 139.7l3.4 3.4 .2 25.8 91.5 0 54.3 31.7c1.3 .8 2.6 2.7 3.7 3.8l-192.6 0 0-61.4 39.5 0 0-3.3ZM161.3 139.7l0 3.3 43.1 0 0 25.9c-10-4.4-19.9-9.1-29.8-13.8-3.7-1.7-10-4.1-13.1-6.3-1.4-.9-2.6-2.3-3.7-3.6 0-.7 0-1.3 0-2l3.5-3.5Z\" fill=\"var(--art-teal-lit,#6FD0BD)\" fill-rule=\"evenodd\"/>\n<path d=\"M161.3 141.7l0 3.7 43.1 19.9 0 39.1-20.2 0c-.1-.3 0-.6-.2-.7l-54-31.4-3.4 .1c4.7-4.8 9.8-9.1 14.8-13.4 6.6-5.8 13.2-11.5 19.9-17.3Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M129.9 90.1l3.7 3.7 0 74.6-4.2 4-94.1 0-.2-78.4c2.2-.9 3.9-2.4 5.8-3.9l89 0Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M120 92.7c-2.3 0-3.9 .2-6.2 .8l-54.4 0c-1.7-1.2-2-.8-4.1-.8-1.1-4.4-1.3-8.6-1.3-13.1l3.8-3c2.6-14 11.2-25.9 24.5-31.5 2.8-1.1 9-3.2 12-2.9l10.2 1.3c4.8 .6 7.2 3.8 10.4 7.1 11.2 11.5 12.6 28.3 5.1 42.1Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M135.3 72l3.3-.1c1.4 5.8 1.2 11.4 .5 17.4-2.6 2.6-5.2 4.9-8.1 7.1 0-.9 0-1.8 0-2.8l-15-.1c8.4-14.5 6.7-32.3-5.7-44.1-2.4-2.2-5.2-4-8.1-5.3-.8-.4-3.3-1-3.7-1.4-.2-.1-.2-.3-.4-.5 13.3-.8 26.3 7.9 32.8 19.1 2 3.4 3.2 7 4.4 10.7Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M161.3 71l0 74.2-31.2 27.1 0-78.8 5.5-4.1c.8-6.3 .7-12-.6-18.2l26.3-.2ZM57.9 75.6c-.7 6.2-.5 11.9 1.1 17.9l-23.7 0 22.6-17.9Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "74124546d8";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 7 || !EL[3].includes("M129.9 90.1")) throw new Error("in: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const G = 3724; // a 20 cm ball is 76 here: 380 to the meter

// the buckle, as cardboard takes it, in straight folds: the crease runs from near each top corner down to a flat bottom in the middle; above it the top
// of the wall has tipped in, so its top edge (the rim) is lower and the tipped part shows as a band, foreshortened, facing up a little more
const xs = [44, 70, 104, 126];
const crease = (k) => [[xs[0], 90.6], [xs[1], 90.6 + 30 * k], [xs[2], 90.6 + 30 * k], [xs[3], 90.6]];
const rimAt = (k, base) => [[xs[0], base], [xs[1], base + 16 * k], [xs[2], base + 16 * k], [xs[3], base]];
const pl = (P) => P.map(([x, y]) => `${n2(x)} ${n2(y)}`).join("L");
function front(k) {
  if (k < 0.002) return EL[3];
  const R = rimAt(k, 90.1), C = crease(k);
  const face = `<path d="M129.9 90.1l3.7 3.7 0 74.6-4.2 4-94.1 0-.2-78.4c2.2-.9 3.9-2.4 5.8-3.9L${pl(R)}L129.9 90.1Z" ${fill("paper")}/>`;
  const band = `<path d="M${pl(C)}L${pl([...R].reverse())}Z" ${fill("paper-mid")}/>`;
  // (the crease itself, a thin dark line where the board is folded; and the creases running up from its corners into the tipped part)
  const line = `<path d="M${pl(C)}L${pl([...C].reverse().map(([x, y]) => [x, y + 1.6]))}Z" ${fill("paper-deeper")}/>`;
  const up = [[C[1], R[1], -1], [C[2], R[2], 1]].map(([c, r, d]) => `<path d="M${n2(c[0])} ${n2(c[1])}L${n2(r[0] + 6 * d)} ${n2(r[1])}L${n2(r[0] + 7.6 * d)} ${n2(r[1])}Z" ${fill("paper-deep")}/>`).join("");
  return face + band + up + line;
}
// the inside, dark, and the region the ball shows in: above the front rim, inside the right side's top edge
const RIM_PATH = (k, base = 93.5) => `L${pl([...rimAt(k, base)].reverse())}`;
// (its edges tucked inside what bounds them in the still; its bottom starts half a unit above the rim's row, so only the still's own edges show,
// and comes down to the rim as the ball starts down, so no strip of the front's top edge opens where the ball was)
const inside = (k, b) => `<path d="M${n2(36.4 - (b - 93) * 1.2)} ${n2(b)}L58.2 75.95 160.9 71.2 160.9 ${n2(b)}H${xs[3]}${RIM_PATH(k, b)}Z" ${fill("ink")}/>`;
const SEEN = (k) => `<clipPath id="bx"><path d="M-10-100H210V71H161.3L130.1 93.5H${xs[3]}${RIM_PATH(k)}H-10Z"/></clipPath>`;
const ball = (dy, k) => (dy < 0.01 && k < 0.002 ? EL[4] + EL[5] : `${SEEN(k)}<g clip-path="url(#bx)"><g transform="translate(0 ${n2(dy)})">${EL[4]}${EL[5]}</g></g>`);
// (as the still lays them: the ink of the right side and the inside lies over the ball's edges)
const scene = (dy, k) => `${OPEN}${EL.slice(0, 3).join("")}${front(k)}${inside(k, 93 + 0.5 * Math.min(1, dy / 2))}${ball(dy, k)}${EL[6]}</svg>`;

// the press both start with: the ball's weight settling onto the flap, it giving a little
const press = (t) => track([[0.3, 0], [0.62, 2.5, "io"]], t);
const T_GO = 0.72;

// ---- happy: the flap gives, the ball drops in
const HAPPY_DUR = 2.2, SEAT = 34;
function happy(t) {
  if (t <= 0) return STILL;
  let dy = press(t);
  if (t > T_GO) {
    // falling from rest onto the box's floor, one small bounce, and it sits
    const s = t - T_GO, tf = Math.sqrt((2 * (SEAT - 2.5)) / G), vb = 0.22 * G * tf, tb = (2 * vb) / G;
    dy = s < tf ? 2.5 + 0.5 * G * s * s : s < tf + tb ? SEAT - (vb * (s - tf) - 0.5 * G * (s - tf) ** 2) : SEAT;
  }
  return scene(dy, 0);
}

// ---- sad: the wall gives
const SAD_DUR = 2.4;
function sad(t) {
  if (t <= 0) return STILL;
  // the wall's top buckling in under the load, quick at first then stopping as the fold takes it; the ball going down with it
  const k = track([[T_GO, 0], [T_GO + 0.16, 0.85, "in"], [T_GO + 0.3, 0.75, "io"], [T_GO + 0.45, 0.78, "io"]], t);
  const dy = press(t) + 15 * Math.min(1, k / 0.78);
  return scene(dy, k);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
