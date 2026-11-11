// Choice's story. Happy, nearly lost: the upper arrow's nail has worked loose too. It slips, and the arrow swings down on it, its point dropping, until
// its lower edge comes down on the lower arrow's back corner (34 degrees down) with a knock, bounces, and rests there: propped on the other arrow,
// both still pointing their ways. Sad: the signpost's lower arrow hangs on a single nail near its back end, and the nail has worked loose. The arrow sags a hair on it, then lets go and swings round on it, its weight carrying
// its point down past the post, back, and to rest hanging straight down the post: pointing nowhere.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky, the ground, the forking path, the post's shadow, the post (and its
// shade, its top), the upper arrow (shade, face, nail), the lower arrow (shade, face) and its nail at (94.5, 90.5). The post (about 2.2 m) is 114 here:
// 52 to the meter. The lower arrow is 64 long (1.2 m), its middle 18 left of the nail.
import { n2, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M0,123 Q100,106 200,123 L200,200 L0,200 Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M30,200 C48,184 68,170 67,157 C66,142 36,130 0,128 L0,123.8 C38,125 72,131 98,140 C128,130 165,125 200,123.8 L200,128 C165,130 124,138 119,150 C115,162 125,175 151,200 Z\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"90,151.5 101,148 200,178 200,190\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M90,151.5 L101,148 L118.3,153.3 Q118.2,157.4 119.2,161.4 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M87,37 L87,149 A7.5,2.5 0 0 0 102,149 L102,37 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M97,36 L97,151.4 Q100.5,151 102,149 L102,37 Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><ellipse cx=\"94.5\" cy=\"37\" rx=\"7.5\" ry=\"2.8\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M87,54.2 L133,48.9 Q136,48.5 138,50.5 L148.5,58.8 Q150.5,60.5 148.5,62.3 L138.5,71.5 Q137,73 134,73.1 L87,74.5 Q84,74.5 84,71.5 L84,57.3 Q84,54.5 87,54.2 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M85,51.7 L131,46.4 Q134,46 136,48 L146.5,56.3 Q148.5,58 146.5,59.8 L136.5,69 Q135,70.5 132,70.6 L85,72 Q82,72 82,69 L82,54.8 Q82,52 85,51.7 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"92.5\" cy=\"61\" r=\"1.2\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M106,84.3 L63,80.8 Q60,80.5 58,82.2 L47,90.9 Q45,92.5 47,94.2 L58,103.5 Q60,105.1 63,104.9 L106,102.2 Q109,102 109,99 L109,87.3 Q109,84.5 106,84.3 Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><path d=\"M104,81.8 L61,78.3 Q58,78 56,79.7 L45,88.4 Q43,90 45,91.7 L56,101 Q58,102.6 61,102.4 L104,99.7 Q107,99.5 107,96.5 L107,84.8 Q107,82 104,81.8 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><circle cx=\"94.5\" cy=\"90.5\" r=\"1.2\" fill=\"var(--art-steel-deep,#6B687A)\"/></svg>\n";
export const STILL_HASH = "4fadb64279";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 14 || !EL[13].includes('cx="94.5" cy="90.5"') || !EL[9].includes("M85,51.7 L131,46.4") || !EL[10].includes('cx="92.5" cy="61"')) throw new Error("choice: the still isn't as this story knows it");
const BACK = EL.slice(0, 11).join(""), ARROW = EL[11] + EL[12], NAIL = EL[13];
const PIN = [94.5, 90.5];
// The swing: a board on a nail, its middle 0.35 m from the nail, 1.23 m long (so about the nail it swings like a pendulum 0.71 m long: 3.7 radians a
// second), let go 4 degrees down from level; it hangs at -90 (point down). The loose nail and the board rubbing the post take its swing down fast.
const W2 = 13.8, DRAG = 2.1, FROM = -4, T_GO = 0.55;
const SWING = (() => {
  const S = [], dt = 1 / 2000, eq = -Math.PI / 2;
  let a = (FROM * Math.PI) / 180, w = 0;
  for (let i = 0; i <= 2.6 / dt; i++) {
    if (i % 10 === 0) S.push(a);
    w += (-W2 * Math.sin(a - eq) - DRAG * w) * dt;
    a += w * dt;
  }
  return S;
})();
const swing = (s) => { const k = s * 200, i = Math.floor(k), f = k - i; if (i >= SWING.length - 1) return SWING[SWING.length - 1]; return SWING[i] + (SWING[i + 1] - SWING[i]) * f; };
// (its last few tenths of a degree die away to the rest it hangs at)
const REST = -90;

// ---- sad: pointing nowhere
const SAD_DUR = 3.2;
function sad(t) {
  if (t <= 0) return STILL;
  // it sags on the nail as the hole gives (a creak's worth), then it's free
  let a = t < T_GO ? track([[0.2, 0], [T_GO, FROM, "in"]], t) : (swing(t - T_GO) * 180) / Math.PI;
  if (t > 2.7) a = a + (REST - a) * Math.min(1, (t - 2.7) / 0.4);
  if (Math.abs(a) < 0.005) return STILL;
  return `${OPEN}${BACK}<g transform="rotate(${n2(a)} ${PIN[0]} ${PIN[1]})">${ARROW}</g>${NAIL}</svg>`;
}

// ---- happy: propped
// The upper arrow (its shade, its face) on its nail at (92.5, 61), its weight 19 to the right of it: about the nail it swings as gravity turns it
// (13 radians a second squared at level, less as it turns), the loose nail dragging. Its lower edge meets the lower arrow's back corner (105.9, 82.4)
// at 34.35 degrees down; there it knocks, bounces back a little, and rests. Its shade is its thickness seen from here: it turns with it about the
// same nail, the offset staying as it is.
const UPPER_SHADE = EL[8], UPPER_FACE = EL[9], UPPER_NAIL = EL[10], LOWER = EL.slice(11).join(""), BEFORE_UPPER = EL.slice(0, 8).join("");
const UN = [92.5, 61], SHADE_OFF = [2, 2.5], REST_UP = 34.35, T_SLIP = 0.55;
const DROP = (() => {
  const S = [], dt = 1 / 2000;
  let a = (1.5 * Math.PI) / 180, w = 0;
  while (a < (REST_UP * Math.PI) / 180) { S.push(a); w += (13 * Math.cos(a) - 1.6 * w) * dt; a += w * dt; }
  S.push((REST_UP * Math.PI) / 180);
  return S;
})();
const T_KNOCK = T_SLIP + (DROP.length - 1) / 2000;
function upper(t) {
  if (t <= T_SLIP) return 1.5 * track([[0.2, 0], [T_SLIP, 1, "in"]], t);
  if (t <= T_KNOCK) return (DROP[Math.round((t - T_SLIP) * 2000)] * 180) / Math.PI;
  return REST_UP - track([[T_KNOCK, 0], [T_KNOCK + 0.07, 3.2, "out"], [T_KNOCK + 0.15, 0, "in"], [T_KNOCK + 0.2, 0.8, "out"], [T_KNOCK + 0.25, 0, "in"]], t);
}
const HAPPY_DUR = T_KNOCK + 0.85;
function happy(t) {
  if (t <= 0.2) return STILL;
  const a = n2(upper(t));
  return `${OPEN}${BEFORE_UPPER}<g transform="rotate(${a} ${UN[0] + SHADE_OFF[0]} ${UN[1] + SHADE_OFF[1]})">${UPPER_SHADE}</g><g transform="rotate(${a} ${UN[0]} ${UN[1]})">${UPPER_FACE}</g>${UPPER_NAIL}${LOWER}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
