// The phone's two stories. Happy: they're all replying. It buzzes three times, and each time one of their bubbles comes into the conversation, which moves up
// to make room, while the buzz rattles the phone a step across the table. It rests where the last one left it. Sad: three dots say they're typing back;
// the dots stop, the bubble goes, nothing comes; then the battery dies too. It stays dark.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view. The screen leans a little: what's drawn on it leans with it.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M135.7 174.8c.6 .5 1.1 1 1.5 1.6-.5 .6-1 1.1-1.3 1.8l68.5 21.9 0 4.3-93.3 0c-.4-.2-1.1-.8-1.6-1l-53.9-22.3c-1.2-.5-2.3-1.4-3.3-2.2 .7-.7 1.4-1.4 2.1-2.1 1.5 .4 3 1 4.6 1l37.4-.2 32.3-.1c2.5 0 4.9-1.6 7-2.7Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M54.1 31C54.4 24.4 60.1 19 66.8 19L134.6 19.5C141.2 19.5 146.4 25 146.2 31.6L140.4 169C140.1 175.6 134.4 181.1 127.7 181.1L59.2 181.1C52.5 181.1 47.3 175.6 47.6 169Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<polygon points=\"61.7,34.8 139.1,35.9 133,165.2 54.3,165.4\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<polygon points=\"132.8,35.7 139.1,35.9 133,165.2 127.9,165.2\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M87.9 27C87.9 25.9 88.8 25 89.8 25L111.7 25.4C112.8 25.4 113.7 26.3 113.7 27.3L113.7 27.5C113.7 28.6 112.8 29.5 111.7 29.5L89.8 29.1C88.8 29.1 87.9 28.2 87.9 27.1Z\" fill=\"var(--art-ink-lit,#3A3460)\"/>\n<path d=\"M63.3 64.8C63.4 60.5 67 57 71.3 57L111.3 57C115.6 57 119.1 60.5 119 64.8L118.7 83.2C118.6 87.5 115 91 110.7 91.1L70.7 91.4C66.4 91.4 63 87.9 63 83.6Z\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M67.4 86.9Q66.8 95.1 62.5 98Q70.7 97.7 77.3 88.9Z\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M70 112.7C70.1 108.4 73.6 104.9 77.9 104.9L119.3 104.9C123.6 104.9 127.1 108.4 127 112.7L126.7 131.6C126.6 135.9 123 139.5 118.8 139.5L77.5 139.5C73.2 139.5 69.8 135.9 69.8 131.6Z\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M111.3 136.7Q117.2 144.9 125.4 146.7Q121.5 143.6 120.7 135.9Z\" fill=\"var(--art-teal,#37B39B)\"/>\n</svg>\n";
export const STILL_HASH = "bc68868c08";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const PART = [...STILL.matchAll(/<(path|polygon) (?:d|points)="[^"]*" fill="[^"]*"\/>/g)].map((m) => m[0]);
const [SHADOW, BODY, SCREEN, BEZEL_SHADE, SPEAKER, VBUBBLE, VTAIL, TBUBBLE, TTAIL] = PART;
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const SCREEN_PTS = /points="([^"]*)"/.exec(SCREEN)[1];
// The screen's lean: x moves 0.052 left for every unit down, about y = 100.
const LEAN = "matrix(1 0 -0.052 1 5.2 0)";
const clips = `<clipPath id="sc"><polygon points="${SCREEN_PTS}"/></clipPath>`;
const decay = (t, at, amp, hz, k) => (t <= at ? 0 : amp * Math.sin(2 * Math.PI * hz * (t - at)) * Math.exp(-k * (t - at)));
const fill = (t) => `fill="${paint(t)}"`;

// The typing bubble: theirs, so violet on the left like their first one, under your last. Its dots rise and fall in a wave.
const TX = 63, TY = 143, TW = 44, TH = 21;
function typing(scale, dots, swell = 1) {
  if (scale <= 0.01) return "";
  let d = "";
  for (let i = 0; i < 3; i++) {
    const up = Math.max(0, Math.sin(2 * Math.PI * 2.4 * dots - i * 0.95)) * 3.8;
    d += `<circle cx="${n2(TX + 11 + i * 11)}" cy="${n2(TY + TH / 2 - up)}" r="3.3" ${fill("paper")}/>`;
  }
  const w = TW * swell, h = TH * (1 + (swell - 1) * 1.6);
  return `<g transform="${LEAN} translate(${TX} ${TY + TH}) scale(${n4(scale)}) translate(${-TX} ${-(TY + TH)})"><rect x="${TX}" y="${n2(TY + TH - h)}" width="${n2(w)}" height="${n2(h)}" rx="10.5" ${fill("violet")}/>`
    + `<circle cx="${TX + 1}" cy="${TY + TH + 1.2}" r="3.6" ${fill("violet")}/>${swell > 1.05 ? "" : d}</g>`;
}
// A heart, as you'd send one: no bubble, just big. Lit from the left: a dark rim on the right, a highlight top left.
// The phone in the hand: everything but the backdrop and its shadow.
const phone = (screen, dx = 0) => `<g transform="translate(${n2(dx)} 0)">${BODY}${SCREEN}<g clip-path="url(#sc)">${screen}</g>${BEZEL_SHADE}${SPEAKER}</g>`;
const chat = (up) => (up === 0 ? `${VBUBBLE}${VTAIL}${TBUBBLE}${TTAIL}` : `<g transform="translate(${n2(0.052 * up)} ${n2(-up)})">${VBUBBLE}${VTAIL}${TBUBBLE}${TTAIL}</g>`);

// ---- happy. Each buzz brings one of their bubbles in: the conversation steps up a bubble's height, and the new one grows out of its tail corner. The buzz
// rattles the phone, lifts it a hair and walks it a step to the right, turning a little about its foot, its shadow going with it.
const RINGS = [0.3, 0.86, 1.42], RING = 0.34, STEP = 3.4, TURN = 0.7, PITCH = 48;
const HAPPY_DUR = 2.15;
const FOOT = [93.5, 181];
// Their bubble, as the still draws it (its body and tail), set one slot below the last, and a width of its own.
const VB = /d="([^"]*)"/.exec(VBUBBLE)[1], VT = /d="([^"]*)"/.exec(VTAIL)[1];
const reply = (slot, grow, wide) => {
  if (grow <= 0.01) return "";
  const y = 2 * PITCH + PITCH * slot, cx = 62.5, cy = 98 + y;
  return `<g transform="translate(${cx} ${n2(cy)}) scale(${n4(grow)}) translate(${-cx} ${n2(-cy)}) translate(0 ${y})"><g transform="translate(63 0) scale(${n4(wide)} 1) translate(-63 0)"><path d="${VB}" ${fill("violet")}/></g><path d="${VT}" ${fill("violet")}/></g>`;
};
function happy(t) {
  if (t <= 0) return STILL;
  let dx = 0, rot = 0, rattle = 0, hop = 0, up = 0, replies = "";
  RINGS.forEach((at, i) => {
    const k = Math.max(0, Math.min(1, (t - at) / RING));
    dx += STEP * k; rot += TURN * k;
    up += PITCH * track([[at, 0], [at + 0.26, 1, "io"]], t);
    replies += reply(i, track([[at + 0.06, 0], [at + 0.22, 1.08, "io"], [at + 0.3, 1, "io"]], t), [0.78, 1, 0.62][i]);
    if (t > at && t < at + RING) {
      const s = t - at, env = Math.sin((Math.PI * s) / RING);
      rattle = 0.9 * env * Math.sin(2 * Math.PI * 27 * s);
      hop = -0.7 * env * Math.abs(Math.sin(2 * Math.PI * 13.5 * s));
    }
  });
  const conversation = `<g transform="translate(${n2(0.052 * up)} ${n2(-up)})">${VBUBBLE}${VTAIL}${TBUBBLE}${TTAIL}${replies}</g>`;
  const at = `translate(${n2(dx + rattle)} ${n2(hop)}) rotate(${n2(rot)} ${FOOT[0]} ${FOOT[1]})`;
  return `${OPEN}${clips}${BG}<g transform="translate(${n2(dx)} 0)">${SHADOW}</g><g transform="${at}">${phone(conversation)}</g></svg>`;
}

// ---- sad. The dots bounce, and their bubble swells: here it comes. And the battery picks that moment. The screen goes black but for the empty battery,
// which blinks, as a dying phone shows it; then the backlight goes off at once, and the dark glass shows a little of the room. Whatever they said, you'll
// never know.
const SAD_DUR = 2.45;
const LOW = 1.22, OUT = 1.62;
function battery(on) {
  if (!on) return "";
  return `<g transform="${LEAN}"><rect x="78" y="90" width="38" height="19" rx="3.5" fill="none" stroke="${paint("paper-mid")}" stroke-width="3"/><rect x="116.5" y="95.5" width="4" height="8" rx="1.4" ${fill("paper-mid")}/>`
    + `<rect x="81.6" y="93.6" width="5" height="11.8" rx="1" ${fill("clay")}/></g>`;
}
function sad(t) {
  if (t <= 0) return STILL;
  const pop = track([[0.14, 0], [0.3, 1.12, "out"], [0.38, 1, "io"]], t);
  const swell = track([[1.0, 1], [1.2, 1.45, "out"]], t);
  let screen = `${chat((swell - 1) * 30)}${typing(pop, t, swell)}`;
  if (t >= LOW && t < OUT) {
    const blink = !(t > LOW + 0.16 && t < LOW + 0.26);
    // (a black screen has no lit edge: the bezel's shade over the lit screen goes when it goes black, as it is once the light's out; and the screen
    // itself is drawn dark, so no lit paper fringes its edge)
    return `${OPEN}${clips}${BG}${SHADOW}${BODY}<polygon points="${SCREEN_PTS}" ${fill("ink")}/>${battery(blink)}${SPEAKER}</svg>`;
  } else if (t >= OUT) {
    // Out: the backlight goes off at once (a phone's screen doesn't squeeze to a dot; that was an old television's tube). Dark, the glass shows a little
    // of the room.
    return `${OPEN}${clips}${BG}${SHADOW}${BODY}<polygon points="${SCREEN_PTS}" ${fill("ink-lit")}/><g clip-path="url(#sc)"><polygon points="70,35.5 90,35.8 58,120 56.5,96" ${fill("steel-deep")}/></g>${SPEAKER}</svg>`;
  }
  return `${OPEN}${clips}${BG}${SHADOW}${phone(screen)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
