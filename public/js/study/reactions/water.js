// The water's two stories. Happy: half full, and drops fall in, each too small to do what it does, until it's fuller than full and holds. Sad: a straw comes in from outside the picture and drinks it.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths, in the 200-unit view.
import { n2, paint, parsePath, partsOf, runsToD, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M127.3 29.9c-1.7 1.7-3.3 3.7-5.2 5-4.3 3.1-12 4-17.1 4.6-1.3 17.6-7.8 26-18.2 39.4-1.7 2.3-3 4.8-4.7 7-1.1 1.4-2.4 2.5-3.5 3.7-9.7 .1-26.4 1-34.2 6.7l-7.8-66.8c3.2-.7 3.5-2.6 6-4.2 2.2-1.5 5.2-2.1 7.7-2.8 15.7-4 36.3-4.3 52.3-2.5 5.1 .5 15.1 1.8 19.3 4.5 2 1.3 3.8 3.5 5.4 5.4ZM50 141.8c1.2 1.2 3 2.5 3.8 4.1 1.1 2 1.8 11.4 2.2 14.3 .5 3.7 .5 8.3 4.3 10.3l55.1 29.1c2 1.1 3.6 3.3 5.2 4.8l-125 0 0-58.7 54.9 0-.5-3.9ZM113.9 141.9l-.4 3.8 90.9 0 0 53.2-93.4-28.6c-1.5-.5-2.9-2.5-4-3.6l3-20.1c.2-1.7 2.8-3.5 3.9-4.7Z\" fill=\"var(--art-violet-lit,#A68CFF)\" fill-rule=\"evenodd\"/>\n<path d=\"M111.2 162.6l-.8 4.1 94 28.7 0 9-87.2 0c-.6-.4-1.2-1-1.8-1.3l-55.2-29.2c-2.9-1.5-4.9-4-6.4-6.9 .3-.5 .7-.9 1.1-1.3 1.5 1 2.8 2 4.4 2.8 8.3 3.9 18.3 3.5 27.2 3.2 6-.2 13.1-.7 18.6-3.6 2.4-1.3 4.2-3.7 6.1-5.5Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M45.2 92.4c6.4 3.7 14 4.6 21.2 5.3 14.7 1.4 29.7 .9 44.2-2.1l3.7 3.7c-.7 5.5-1.5 10.8-3.3 16-5.5 16.7-16.2 31.2-28.6 43.6-5.3 5.3-10.7 10.2-17 14.4-1.1-.3-2.2-.8-3.3-.9-.7-.2-1.5-.1-2.2-.3-3.6-1-6.3-4.1-6.8-7.7l-5.2-38.8-3.3-29.2c-.1-.6 .5-2.3 .6-2.6 0-.2 0 .4 0 .6 0 .1 0-.2 0-.3-.1-.3 0-.1 0-.5 0-.4 0-.8 0-1.2Z\" fill=\"var(--art-sky,#58ADEB)\"/>\n<path d=\"M127.2 28.7c-.2 .9-.3 1.9-.5 2.9 .4 .3 .9 0 .8 1l-7.7 59.5c-.1 .7-.6 .8-1 1.1 .1 .6 .1 1.2 .1 1.8 .6 .3-.5 .2 .2 .3 .1 .1 .3-.3 .4-.3 .6 .1-.2 .2 .2 .4-.1 1.2-.2 2.5-.3 3.7l-6.5 51.1c-.5 3.9-1.4 15.3-3.5 18-3.1 4-8.8 5.3-13.5 6.1-11.3 1.8-24.6 1.8-35.5-1.7 23.7-12.8 49.8-46.5 50.4-74.1-.7-.1-1.4 0-2-.2 2.6-3.2 3.3-3 7.1-4.2-8.2-3-16.9-3.9-25.5-4.3-2.3-.1-9.1 .2-10.9-.5-.9-.4-1.7-1.3-2.4-2 .4-.2 1.1-.5 1.5-.8 .7-.7 1-2 1.4-2.8 1.3-2.2 2.8-4.2 4.4-6.1 10.5-13.2 15.3-21 17.2-38.1-.6-.3-1.4-.3-2.1-.4 .6-.6 1.1-1.2 1.8-1.6 1.8-.8 8.5-1.4 11-1.9 7.2-1.4 9-2.8 14.9-6.9Z\" fill=\"var(--art-sky-deep,#3488C9)\"/>\n<path d=\"M119.7 94c0 4.4-16.9 8-37.8 8-20.8 0-37.7-3.6-37.7-8 0-4.4 16.9-8 37.7-8 20.9 0 37.8 3.6 37.8 8Z\" fill=\"var(--art-sky-lit,#8FCDF4)\"/>\n<path d=\"M127.8 29.6c.1 6.2-20.3 11.4-45.6 11.7-25.2 .3-45.8-4.4-45.8-10.6-.1-6.2 20.3-11.4 45.6-11.7 25.2-.3 45.7 4.4 45.8 10.6ZM123.5 29.7c0 4.1-18.4 7.7-41.2 7.9-22.7 .2-41.2-3-41.2-7.1-.1-4.2 18.3-7.8 41.1-8 22.7-.2 41.2 3 41.3 7.2Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "967a814e34";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [TABLE, SHADOW, BODY, DEEP, SURF, RIM] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const UPPER = runsToD([parsePath(TABLE.d)[0]]);
const LEVEL0 = 94, TOP = 31;
// The glass's walls, read off the still.
const lerp = (a, b, k) => a + (b - a) * k;
const wallL = (y) => (y < 92 ? lerp(36.6, 45.2, (y - 30) / 62) : lerp(45.2, 56.5, (y - 92) / 78));
const wallR = (y) => (y < 94 ? lerp(127.6, 119.7, (y - 30) / 64) : lerp(119.7, 110.6, (y - 94) / 76));
const surfaceAt = (y, k = 1, tilt = 0, id = "") => {
  if (y === LEVEL0 && k === 1 && tilt === 0) return SURF.svg;
  const cx = (wallL(y) + wallR(y)) / 2, s = (((wallR(y) - wallL(y)) / 2) / 37.75) * k;
  return `<path fill="${SURF.fill}" transform="translate(${n2(cx)} ${n2(y)}) rotate(${n2(tilt)}) scale(${n2(s)}) translate(-81.95 -94)" d="${SURF.d}"/>`;
};
// Water in the glass's upper half, where the still has none; the still's own water emptied, where it's gone.
// (The still's surface covers a seam between the two, so the clip takes all three.)
const clips = `<clipPath id="wg"><path d="${UPPER}${BODY.d}${SURF.d}"/></clipPath>`;
const fillUp = (y) => (y >= 94 ? "" : `<rect x="30" y="${n2(y)}" width="105" height="${n2(104 - y)}" fill="${BODY.fill}" clip-path="url(#wg)"/>`);
const drainDown = (y) => (y <= 94 ? "" : `<rect x="30" y="80" width="105" height="${n2(y - 80)}" fill="${paint("violet-lit")}" clip-path="url(#wg)"/>`);
// The still's shade has a step where its surface hid it. Once that surface has gone, the step is closed, one curve from the top of the wall to the bottom.
const SEAM = `<path fill="${DEEP.fill}" d="M77.5 86.5C86 91 102 93 110.5 106L119 106L121 90L100 86Z"/>`;
const decay = (t, at, amp, hz, k) => (t <= at ? 0 : amp * Math.sin(2 * Math.PI * hz * (t - at)) * Math.exp(-k * (t - at)));

// ---- happy. Three drops, each bigger than the last, and each lifts the level far more than it should. Then a tiny one on a surface that's already over the rim. It holds.
const g = 1500;
const DROPS = [[0.5, 1.5], [0.86, 2.5], [1.16, 3.8], [1.66, 1.5]]; // when it lands, how big
// (each rise swells up smoothly from the drop's landing, rather than leaping in its first frame)
const H_LEVEL = [[0, 94], [0.5, 94], [0.68, 74, "io"], [0.86, 74], [1.04, 52, "io"], [1.16, 52], [1.32, TOP, "io"]];
// (it bulges over the rim only once the water has risen to it, at 1.32: before, the dome's lens filled the glass's mouth while the water was still below)
const DOME = [[1.32, 0], [1.44, 3.4, "out"], [1.54, 2.2, "io"], [1.66, 2.2], [1.72, 8.2, "out"], [1.82, 4.6, "io"], [1.92, 6.6, "io"], [2.02, 5.3, "io"], [2.12, 5.9, "io"]];
const HAPPY_DUR = 2.5;
const dropAt = (t, hit, size, landY) => {
  // It goes into the water, not out of sight: it keeps falling a few frames past the surface, cut off where the surface is, until it's all in.
  const fall = Math.sqrt((2 * (landY + 14)) / g), s = t - (hit - fall);
  if (s < 0 || t >= hit + 0.08) return "";
  const y = -14 + 0.5 * g * s * s, v = g * s, stretch = 1 + Math.min(1.1, v / 480), id = `dr${Math.round(hit * 100)}`;
  return `<clipPath id="${id}"><rect x="0" y="-60" width="200" height="${n2(landY + 60)}"/></clipPath><ellipse clip-path="url(#${id})" cx="82" cy="${n2(y)}" rx="${n2(size / Math.sqrt(stretch))}" ry="${n2(size * stretch)}" fill="${paint("sky")}"/>`;
};
const ripple = (t, hit, y, reach) => {
  const s = t - hit, life = 0.42;
  if (s <= 0 || s >= life) return "";
  // (it spreads from the point where the drop went in, and thins to nothing as it reaches the wall: it never appears or goes as a ring)
  const k = track([[0, 0], [life, reach, "out"]], s), rx = ((wallR(y) - wallL(y)) / 2) * k;
  return `<ellipse cx="${n2((wallL(y) + wallR(y)) / 2)}" cy="${n2(y)}" rx="${n2(rx)}" ry="${n2(rx * 0.212)}" fill="none" stroke="${paint("sky-deep")}" stroke-width="${n2(2 * Math.min(1, s / 0.06) * (1 - s / life))}"/>`;
};
const crown = (t, hit, y, size) => {
  const s = t - hit, life = 0.34;
  if (s <= 0 || s >= life) return "";
  let out = "";
  for (const [dx, up, r] of [[-15, 96, 1], [13, 118, 0.85], [-3, 150, 0.7]]) {
    const yy = y - up * size * s + 0.5 * ((2 * up * size) / life) * s * s;
    // (each droplet pinches off the surface as it leaves and sinks back into it as it lands)
    const grow = Math.min(1, s / 0.05) * Math.min(1, (life - s) / 0.05);
    out += `<circle cx="${n2(82 + dx * size * (s / life))}" cy="${n2(yy)}" r="${n2(r * 1.1 * Math.sqrt(size) * grow)}" fill="${paint("sky")}"/>`;
  }
  return out;
};
function happy(t) {
  if (t <= 0) return STILL;
  const level = track(H_LEVEL, t);
  let tilt = 0;
  for (const [hit, size] of DROPS) tilt += decay(t, hit, 1.2 + size, 3.4, 4.2);
  const dome = track(DOME, t) + decay(t, 2.12, 0.45, 8, 7);
  let air = "", fx = "";
  const levels = [94, 74, 52, TOP];
  DROPS.forEach(([hit, size], i) => {
    const y = i < 3 ? levels[i] : TOP - 6;
    air += dropAt(t, hit, size, y);
    if (i < 3) fx += ripple(t, hit, track(H_LEVEL, t), 0.95) + crown(t, hit, track(H_LEVEL, hit), size / 1.8);
  });
  // the last, tiny one: it can't break the surface. It sits on it, bounces once, and goes.
  const b = t - DROPS[3][0];
  if (b > 0 && b < 0.3) fx += `<circle cx="82" cy="${n2(TOP - 2 - dome - 26 * b + 0.5 * (52 / 0.3) * b * b)}" r="1.4" fill="${paint("sky")}"/>`;
  // Over the rim: a lens of water, its ends on the rim, rising above the far edge. The near edge stays over it. Lit from the left, a crescent on its right.
  const lens = (dx) => `M${n2(40.8 + dx)} 30C${n2(47 + dx)} ${n2(23.4 - dome)} ${n2(63 + dx)} ${n2(21.8 - dome)} ${n2(82.2 + dx)} ${n2(21.8 - dome)}C${n2(101 + dx)} ${n2(21.8 - dome)} ${n2(117 + dx)} ${n2(23.4 - dome)} ${n2(123.7 + dx)} 30C${n2(117 + dx)} 38.4 ${n2(47 + dx)} 38.4 ${n2(40.8 + dx)} 30Z`;
  // (as it starts to round, the flat surface's light gives way to the dome's over a few frames, rather than the whole mouth changing color at once)
  const lensIn = Math.min(1, Math.max(0, (t - 1.32) / 0.12));
  const lensPaths = `<path fill="${paint("sky")}" d="${lens(0)}"/><path fill="${paint("sky-lit")}" clip-path="url(#wd)" d="${lens(-3.4)}"/>`;
  const over = dome > 0.01 ? `<clipPath id="wd"><path d="${lens(0)}"/></clipPath>${lensIn < 1 ? `<g opacity="${n2(lensIn)}">${lensPaths}</g>` : lensPaths}<g clip-path="url(#wr)">${RIM.svg}</g>` : "";
  const rimClip = dome > 0.01 ? '<clipPath id="wr"><rect x="30" y="29.7" width="105" height="20"/></clipPath>' : "";
  return `${OPEN}${BG}${clips}${rimClip}${TABLE.svg}${SHADOW.svg}${BODY.svg}${fillUp(level)}${DEEP.svg}${SEAM}${surfaceAt(level, 1, tilt)}${RIM.svg}${over}${fx}${air}</svg>`;
}

// ---- sad. A straw, from outside the picture. A beat. Then it drinks, in gulps, each one travelling up the straw. It chases the last of it around the bottom, gets it, and leaves.
const STRAW_TIP = [79, 158], STRAW_DIR = [0.259, -0.966], STRAW_W = 4;
const IN_AT = 0.2, IN_END = 0.5;
const GULPS = [0.74, 0.98, 1.22, 1.46, 1.68];
// (each gulp lowers the water smoothly, starting gently, so the empty glass above it never jumps into view)
const S_LEVEL = [[0, 94], [0.74, 94], [0.94, 112, "io"], [0.98, 112], [1.18, 128, "io"], [1.22, 128], [1.42, 144, "io"], [1.46, 144], [1.66, 156, "io"], [1.68, 156], [1.88, 164, "io"], [2.32, 164], [2.5, 170.5, "io"]];
const S_SIZE = [[1.68, 1], [1.82, 0.72, "out"], [2.32, 0.72], [2.42, 0.26, "out"]];
// The straw slides in along itself from just beyond the top edge, and out the same way, starting and ending gently, so it's seen crossing the edge both
// ways (it was 33 units a frame coming in, 18 going out).
const INSERT = [[IN_AT, 0], [IN_END + 0.12, 1.02, "io"], [IN_END + 0.18, 1, "io"], [2.46, 1], [3.06, 0, "io"]];
const STRAW_OUT = 170;
const SAD_DUR = 3.15;
const huntAt = (t) => (t < 1.84 || t > 2.42 ? 0 : 6.5 * Math.sin((t - 1.84) * 2 * Math.PI * 3.1) * Math.min(1, (t - 1.84) / 0.1) * Math.min(1, (2.42 - t) / 0.08));
function strawAt(t) {
  const ins = track(INSERT, t);
  if (ins <= 0) return null;
  const pivot = [110.6, 40], hunt = huntAt(t), a = (hunt * Math.PI) / 180;
  const rel = [STRAW_TIP[0] - pivot[0], STRAW_TIP[1] - pivot[1]], c = Math.cos(a), s = Math.sin(a);
  let tip = [pivot[0] + rel[0] * c - rel[1] * s, pivot[1] + rel[0] * s + rel[1] * c];
  const d = [STRAW_DIR[0] * c - STRAW_DIR[1] * s, STRAW_DIR[0] * s + STRAW_DIR[1] * c];
  const out = (1 - ins) * STRAW_OUT;
  tip = [tip[0] + d[0] * out, tip[1] + d[1] * out];
  return { tip, d };
}
const strawShape = ({ tip, d }, a, b, w, side = 0, fill = "clay") => {
  const n = [-d[1], d[0]], p = (u, v) => `${n2(tip[0] + d[0] * u + n[0] * v)},${n2(tip[1] + d[1] * u + n[1] * v)}`;
  return `<polygon fill="${paint(fill)}" points="${p(a, side - w)} ${p(b, side - w)} ${p(b, side + w)} ${p(a, side + w)}"/>`;
};
const strawAll = (st) => strawShape(st, 0, 260, STRAW_W) + strawShape(st, 0, 260, 1, 3, "clay-deep");
function sad(t) {
  if (t <= 0) return STILL;
  const level = track(S_LEVEL, t), size = track(S_SIZE, t), st = strawAt(t);
  let tilt = decay(t, IN_END - 0.06, 3, 4, 6);
  for (const g0 of GULPS) tilt += decay(t, g0, 2.6, 5, 7);
  // a gulp is a slug of water going up the straw, steadily (at about 5.6 units a frame, so it's seen leaving out of the top)
  let slugs = "";
  if (st) for (const g0 of GULPS) {
    const s = t - g0, life = 0.6;
    if (s < 0 || s > life) continue;
    // it's drawn up out of the water: its length grows from nothing at the water's surface as it rises
    const from = Math.max(0, (st.tip[1] - level) / 0.966), at = from + (s / life) * 200, len = 26 * Math.min(1, s / 0.25);
    slugs += strawShape(st, at, at + len, STRAW_W - 1.1, -0.4, "sky");
  }
  let below = "", above = "";
  if (st) {
    const sy = (y0, y1, id) => `<clipPath id="${id}"><rect x="0" y="${n2(y0)}" width="200" height="${n2(y1 - y0)}"/></clipPath>`;
    below = `${sy(29.7, level, "sb")}<g clip-path="url(#sb)">${strawAll(st)}${slugs}</g>`;
    above = `${sy(-40, 29.7, "sa")}<g clip-path="url(#sa)">${strawAll(st)}${slugs}</g>`;
  }
  // the last drop, off the straw's end as it goes
  const lift = t - 2.56;
  let drop = "";
  if (lift > 0) {
    const fall = Math.sqrt((2 * 96) / 900);
    if (lift < fall) drop = `<circle cx="84" cy="${n2(72 + 0.5 * 900 * lift * lift)}" r="1.5" fill="${paint("sky")}"/>`;
    else if (lift < fall + 0.24) drop = `<circle cx="${n2(84 + (lift - fall) * 16)}" cy="${n2(168 - 34 * (lift - fall) + 0.5 * (68 / 0.24) * (lift - fall) ** 2)}" r="0.9" fill="${paint("sky")}"/>`;
  }
  return `${OPEN}${BG}${clips}${TABLE.svg}${SHADOW.svg}${BODY.svg}${drainDown(level)}${DEEP.svg}${level > 94 ? SEAM : ""}${surfaceAt(level, size, tilt)}${below}${RIM.svg}${above}${drop}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export const frame = (name, t) => (name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR)));
