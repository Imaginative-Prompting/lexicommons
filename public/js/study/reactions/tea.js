// The tea's two stories, from one setup: a cup slides in and the pot tips. Happy: it pours, the cup fills, the pot bows back. Sad: it dribbles down its own spout and belly, misses the cup completely, and the cup leaves.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths, in the 200-unit view.
import { n2, paint, parsePath, partsOf, runsToD, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/>\n<path d=\"M126 156.3c.7 .7 1.3 1.3 1.9 2.1-.6 .4-1.2 .8-1.6 1.4l78.1 .1 0 30.3-82.6-18.4c-1.5-.3-3-2.4-4.1-3.5l-.3-6c1.1-1.1 2.3-2.5 3.6-3.5 1.5-1 3.4-1.7 5-2.5ZM73.9 156.4c1.5 .8 3.1 1.4 4.4 2.4 1.3 .9 2.4 2.3 3.6 3.4l-.3 5.6 60 32.2c1.7 .9 3.3 3.1 4.6 4.4l-150.6 0 0-44.5 77.8-.1c-.4-.4-1-.9-1.4-1.3 .6-.7 1.3-1.4 1.9-2.1Z\" fill=\"var(--art-sun-lit,#FAD57E)\" fill-rule=\"evenodd\"/>\n<path d=\"M121.2 165l0 3.3 83.2 18.4 0 17.7-62.2 0c-.1-.3 0-.6-.2-.7l-61.3-33.1c-.9-.4-1.7-1.2-2.5-1.7l2.3-2.3c9.4 1.9 19.3 2.1 28.9 1.4 4-.3 8.5-.4 11.8-3Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M166.5 28.8c7.3 4.8 16.3 12.7 10.5 22.3-3.7 5.9-16.1 8.7-12.6 17.9 .5 1.4 1.5 2.6 2.4 3.9-1.9-1.3-3.8-2.5-5.3-4.3-1.2-1.2-2-2.6-2.6-4.2-.9-2.2-1.2-4.5-.7-6.8 1.7-7.8 10.5-9.1 12.8-16.2 1.8-5.2-1.4-8.9-4.5-12.6ZM105.2 62.4c2.3 .4 5 .5 7.2 1.5 1.2 .6 2.2 1.7 3.1 2.7 3.9 4 3.8 7 .1 11 4.8 2.4 8.7 6.5 12.3 10.4 3 3.2 5.4 7 6.8 11.2 6.7 19.2-10 35.1-24.9 44.1-5.1 3-13.6 6.9-17.3 11.3-1.8 2-2.7 4.4-3.6 7 10.6 1.6 21 1 31.1-2.6 .6 .6 1.2 1.2 1.8 1.9-.5 .4-1.1 .7-1.5 1.2 .1 .2 .3 .2 .4 .4 1 1.1 .8 6.2-1 7.2-2 1.2-6.3 1.4-8.7 1.6-7.4 .7-14.9 .7-22.3 0-2.3-.2-8-.4-9.6-1.9-1.6-1.6-.8-5.1-.6-7.1-10-5-15.9-10.5-22.3-19.6l-3.3 0c-2.2-3.8-4.1-7.7-5.3-11.9l3.1-.5c-3-16.7-2-22.7 5.5-37.9-.5-.9-1.1-1.7-1.7-2.5 2-2.8 4-5.4 6.7-7.6 .6 .4 1.2 .9 1.8 1.2l5.3-4.6c0-.9-.1-1.9 .1-2.8 .5-1.9 2-3.5 3.4-4.9 5.8-5.9 13.9-8.3 21.9-9.4-1.1-1.4-2.2-2.7-2.6-4.4-2.6-9.7 12.3-14.1 16.7-5.4 1 1.9 1.1 4.1 .4 6.2-.6 1.7-1.8 2.9-3 4.2ZM77.3 111.8l0 12.7 11.8 0 0-12.7c-2.2-2-3.4-3.1-6-4.4-.6 .4-1.3 .6-1.9 1-1.4 .8-2.7 2.3-3.9 3.4Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M81.4 104.7l3.9 .3c1.7 1.4 6 4.5 6.9 6.3 .9 1.8 .3 13.8 .3 16.7l-18.6 0c-.1-2.8-.5-14.9 .3-16.6 .9-1.9 5.5-5.2 7.2-6.7Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M131.1 78.8c4 3.4 7.7 7.1 10.6 11.4 1.2 1.8 2.3 4.5 4.8 4.3 4.5-.4 6.8-7.8 8.5-11.2 3-5.6 7.1-8.9 13.6-8.3 3.2 .2 5.7 1.1 8.2 3-2.9 2.1-5.8 3.9-7.8 6.9-5.4 8.2-4.2 22.2-8.2 32.1-1.6 3.8-3.9 7.6-6.9 10.5-1.6 1.5-4.7 3.1-5.8 4.6-1 1.6-1.5 3.8-2.3 5.5-2 4.2-4.5 8.2-7.5 11.7-13.7 15.9-33.4 19.2-53.1 14.9 .8-7.1 4.7-11.6 10.3-15.7 13.6-10 30.3-14.3 36-32.6 3.2-10.3-.4-21.2-7.8-28.7-1.8-1.8-4.9-5.1-7.5-5.7-.8-.2-1.8-.1-2.6 0-8.5 .4-16.9 .3-25.4 .3-2.5 4.7-3.7 9.6-4 14.9-.1 1.2 .1 8.8-.2 9.2-.2 .2-.5 .3-.6 .5-.2-.2-.5-.1-.7-.3-.4-.3-.3-5.6-.2-6.4 0-6.4 1.2-12.5 4-18.2-4.8-.1-11.2-.4-15.5-2.4 2.6-.1 5.4 .4 8.1 .6 8.7 .7 20.7 1.8 29.1-.8 8.7-2.6 8.9-9.5 1.4-14-1.9-1.2-3.9-1.7-6.1-2.2 .9-.3 1.9-.7 2.9-.8 1.3 0 2.7 .3 3.9 .6 6.7 1.3 18.3 6.1 20.7 13.2 .3 1 .2 2.1 .1 3.1ZM63.5 83.2c-3 3.1-5.5 6.5-7.7 10.2-5.5-10.2-17.6-8.8-23.7 .1-2.3 3.4-3.6 7.5-3.5 11.7 0 11.2 9.8 25.4 22.1 24.4 1.6 4.9 3.5 9.4 6.1 13.9-5.8 0-11.4-1.2-16.7-3.7-14.7-7.3-25.4-25-21.6-41.6 3.6-15.8 19.1-26 35-20.8 3.8 1.3 6.9 3.4 10 5.8Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "8ff472cb73";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [TABLE, SHADOW, PAPER, TAG, INK] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const paperRuns = parsePath(PAPER.d);
const BODY = runsToD([paperRuns[1]]), STEAM = runsToD([paperRuns[0]]);
const potBody = `<path fill="${PAPER.fill}" d="${BODY}"/>`;
const CAM = [25, 170], FOOT_R = [121, 168], FOOT_L = [78, 168], TIP = [177, 78.4], TAG_AT = [83.3, 105];
const CUP = 213.5, RIM_Y = 140, BASE_Y = 167;
const rad = Math.PI / 180;
const potT = (a) => `rotate(${n2(a)} ${n2((a < 0 ? FOOT_L : FOOT_R)[0])} ${n2((a < 0 ? FOOT_L : FOOT_R)[1])})`;
const turned = (q, a) => {
  const p = a < 0 ? FOOT_L : FOOT_R, c = Math.cos(a * rad), s = Math.sin(a * rad), x = q[0] - p[0], y = q[1] - p[1];
  return [p[0] + x * c - y * s, p[1] + x * s + y * c];
};
// The table runs on past the still's edge once the view pulls back, and the pot's shadow with it.
function stage(s) {
  const cam = `translate(${CAM[0]} ${CAM[1]}) scale(${n2(s)}) translate(${-CAM[0]} ${-CAM[1]})`;
  const top = CAM[1] + (160 - CAM[1]) * s;
  const under = `<rect x="-5" y="${n2(top)}" width="210" height="${n2(210 - top)}" fill="${TABLE.fill}"/>`;
  const more = s < 1 ? `<polygon fill="${SHADOW.fill}" points="200,185.8 262,199.5 262,226 182,226 142,204.4"/>` : "";
  return { cam, under: `${under}`, floor: `<rect x="70" y="158" width="62" height="14" fill="${TABLE.fill}"/>${TABLE.svg}${SHADOW.svg}${more}` };
}
function cupBack(x) {
  // handle, then the inside
  return `<ellipse cx="${n2(x - 30)}" cy="151" rx="7" ry="8.5" fill="none" stroke="${paint("ink")}" stroke-width="3.2"/><polygon fill="${SHADOW.fill}" points="${n2(x - 12)},${BASE_Y - 1} ${n2(x + 15)},${BASE_Y - 3} ${n2(x + 90)},${BASE_Y + 13} ${n2(x + 52)},${BASE_Y + 20}"/><ellipse cx="${n2(x)}" cy="${RIM_Y}" rx="26" ry="6.6" fill="${paint("paper")}"/><ellipse cx="${n2(x)}" cy="${RIM_Y}" rx="23.8" ry="5.3" fill="${paint("ink")}"/>`;
}
function cupFront(x, f) {
  const body = (dx) => `M${n2(x - 26 + dx)} ${RIM_Y}C${n2(x - 25 + dx)} 156 ${n2(x - 19 + dx)} ${BASE_Y - 1} ${n2(x - 12 + dx)} ${BASE_Y}L${n2(x + 12 + dx)} ${BASE_Y}C${n2(x + 19 + dx)} ${BASE_Y - 1} ${n2(x + 25 + dx)} 156 ${n2(x + 26 + dx)} ${RIM_Y}C${n2(x + 18 + dx)} ${RIM_Y + 9} ${n2(x - 18 + dx)} ${RIM_Y + 9} ${n2(x - 26 + dx)} ${RIM_Y}Z`;
  // (the first of it is a puddle where the stream lands, spreading across the bottom over a few frames, before it rises as a surface)
  const spread = Math.min(1, f / 0.15);
  const tea = f > 0.005 ? `<ellipse cx="${n2(x)}" cy="${n2(RIM_Y + 3.2 * (1 - f))}" rx="${n2((10 + 13.8 * f) * spread)}" ry="${n2((2 + 3.3 * f) * spread)}" fill="${paint("clay-deep")}"/>` : "";
  return `${tea}<clipPath id="tc"><path d="${body(0)}"/></clipPath><path fill="${paint("ink")}" d="${body(0)}"/><path fill="${paint("paper")}" clip-path="url(#tc)" d="${body(-7)}"/>`;
}
// The pot's steam: it rides over its spout, and bends and thins as the pot moves.
const steamAt = (k, sway, a) => {
  if (k <= 0.01) return "";
  const b = turned([164, 74], a);
  return `<path fill="${paint("paper")}" transform="translate(${n2(b[0])} ${n2(b[1])}) rotate(${n2(sway)}) scale(${n2(0.6 + 0.4 * k)} ${n2(k)}) translate(-164 -74)" d="${STEAM}"/>`;
};
const cupSteam = (x, k, t) => (k <= 0.01 ? "" : `<path fill="${paint("paper")}" transform="translate(${n2(x + 2)} ${n2(RIM_Y - 3)}) rotate(${n2(5 * Math.sin(t * 5))}) scale(${n2(0.5 + 0.2 * k)} ${n2(0.72 * k)}) translate(-164 -74)" d="${STEAM}"/>`);
// A hanging tag keeps hanging as the pot turns; it swings when it's jolted.
const tagAt = (a, t, swing) => `<g transform="rotate(${n2(-a * 0.92 + swing)} ${TAG_AT[0]} ${TAG_AT[1]})">${TAG.svg}</g>`;
const pot = (a, t, swing, extra = "") => `<g transform="${potT(a)}">${potBody}${tagAt(a, t, swing)}${INK.svg}${extra}</g>`;

// ---- happy
const H = {
  scale: [[0.06, 1], [0.42, 0.78, "io"]],
  // (the cup slides in from beyond the edge, starting gently, so it's seen coming in; it was 13 units a frame across the edge)
  cup: [[0.08, 300], [0.62, CUP - 3, "io"], [0.74, CUP, "io"]],
  tip: [[0.44, 0], [0.58, -5, "out"], [0.68, -5], [1.0, 30, "io"], [1.72, 30], [2.04, -2.6, "io"], [2.2, 1.1, "io"], [2.32, 0, "io"]],
  fill: [[1.1, 0], [1.72, 1, "io"]],
  steam: [[0.34, 1], [0.7, 0, "io"], [2.14, 0], [2.48, 1, "out"]],
  sway: [[0, 0], [0.42, -16, "io"], [0.7, -28], [2.14, 12], [2.48, 0, "io"]],
  cupSteam: [[1.56, 0], [2.1, 1, "out"]],
};
const POUR_AT = 0.96, POUR_END = 1.68, HAPPY_DUR = 2.75;
const G = 620;
function stream(t) {
  if (t < POUR_AT) return "";
  // (from where the spout is while it pours: once it stops, what's in the air just falls)
  const tip = turned(TIP, 30), vx = 34, vy = 18, drop = RIM_Y + 1 - tip[1];
  const T = (-vy + Math.sqrt(vy * vy + 2 * G * drop)) / G;
  const head = Math.min(T, t - POUR_AT), tail = Math.max(0, t - POUR_END);
  if (tail >= T) return "";
  const list = [];
  for (let i = 0; i <= 8; i++) {
    const u = tail + ((head - tail) * i) / 8;
    list.push(`${n2(tip[0] + vx * u)} ${n2(tip[1] + vy * u + 0.5 * G * u * u)}`);
  }
  return `<path fill="none" stroke="${paint("clay-deep")}" stroke-width="${n2(4.2)}" stroke-linecap="round" d="M${list.join("L")}"/>`;
}
function happy(t) {
  if (t <= 0) return STILL;
  const st = stage(track(H.scale, t)), a = track(H.tip, t), x = track(H.cup, t), f = track(H.fill, t);
  const jolt = t > 1.72 ? 13 * Math.sin((t - 1.72) * 13) * Math.exp(-(t - 1.72) * 3.6) : 0;
  const swing = t > 0.9 ? 4 * Math.sin((t - 0.9) * 11) * Math.exp(-(t - 0.9) * 3) + jolt : 0;
  return `${OPEN}${BG}${st.under}<g transform="${st.cam}">${st.floor}${cupBack(x)}${cupFront(x, f)}${pot(a, t, swing)}${stream(t)}${steamAt(track(H.steam, t), track(H.sway, t), a)}${cupSteam(x, track(H.cupSteam, t), t)}</g></svg>`;
}

// ---- sad. The same setup; no stream comes. A bead forms, creeps back along the spout, and runs down the pot's own side. The cup shuffles closer to help. It doesn't help.
const S = {
  // (the camera pushes back in only once the cup has gone: pushing in while it left swept it across the edge too fast to see)
  scale: [[0.06, 1], [0.42, 0.78, "io"], [2.92, 0.78], [3.32, 1, "io"]],
  // (in gently, as in happy; and out gathering speed but slowly enough to be seen going: it crosses the picture's edge at about 2.4 units a frame, where
  // it was 7 and read as a vanish)
  cup: [[0.08, 300], [0.62, CUP - 3, "io"], [0.74, CUP, "io"], [1.42, CUP], [1.6, CUP - 13, "io"], [2.36, CUP - 13], [2.44, CUP - 16, "out"], [3.1, 330, "in"]],
  tip: [[0.44, 0], [0.58, -5, "out"], [0.68, -5], [1.0, 30, "io"], [1.9, 30], [1.98, 33, "out"], [2.34, 0, "io"]],
  run: [[1.16, 0], [1.74, 1, "in"]],
  pool: [[1.6, 0], [2.3, 1, "out"]],
  bead: [[1.0, 0], [1.14, 1, "out"], [1.3, 1], [1.5, 0, "io"]],
  steam: [[0.34, 1], [0.7, 0, "io"], [2.5, 0], [3.0, 0.62, "io"]],
  sway: [[0, 0], [0.42, -16, "io"], [0.7, -28], [2.5, -48], [3.0, -40, "io"]],
};
const SAD_DUR = 3.45;
// Along the outside of the spout and down the belly, in the pot's own frame.
const RUN = [[176.4, 79], [168.6, 84.4], [164, 96], [161, 111], [155, 125], [149, 132], [146, 141], [137, 154], [125, 162], [113, 166]];
const runD = (k) => {
  const n = RUN.length - 1, reach = k * n, i = Math.floor(reach), u = reach - i, P = RUN.slice(0, i + 1);
  if (i < n) P.push([RUN[i][0] + (RUN[i + 1][0] - RUN[i][0]) * u, RUN[i][1] + (RUN[i + 1][1] - RUN[i][1]) * u]);
  // a smooth run through them, not a chain of straight bits
  let d = `M${n2(P[0][0])} ${n2(P[0][1])}`;
  for (let j = 0; j + 1 < P.length; j++) {
    const a = P[j], b = P[j + 1], z = P[Math.max(0, j - 1)], c = P[Math.min(P.length - 1, j + 2)];
    d += `C${n2(a[0] + (b[0] - z[0]) / 6)} ${n2(a[1] + (b[1] - z[1]) / 6)} ${n2(b[0] - (c[0] - a[0]) / 6)} ${n2(b[1] - (c[1] - a[1]) / 6)} ${n2(b[0])} ${n2(b[1])}`;
  }
  return d;
};
function sad(t) {
  if (t <= 0) return STILL;
  const st = stage(track(S.scale, t)), a = track(S.tip, t), x = track(S.cup, t), k = track(S.run, t), pl = track(S.pool, t), bd = track(S.bead, t);
  const swing = t > 1.9 ? 9 * Math.sin((t - 1.9) * 11) * Math.exp(-(t - 1.9) * 3.2) : 0;
  const stain = k > 0.005 ? `<path fill="none" stroke="${paint("clay-deep")}" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round" d="${runD(k)}"/>` : "";
  // and at the very end there's still a drop on its lip
  const last = track([[2.5, 0], [2.9, 0.72, "out"]], t);
  const bead = bd + last > 0.01 ? `<circle cx="${TIP[0]}" cy="${n2(TIP[1] + 1.8)}" r="${n2(3 * Math.max(bd, last))}" fill="${paint("clay-deep")}"/>` : "";
  // it reaches the table beside the foot, nowhere near the cup
  const pool = pl > 0.01 ? `<ellipse cx="${n2(131 + 7 * pl)}" cy="${n2(170 + 2 * pl)}" rx="${n2(30 * pl)}" ry="${n2(6.6 * pl)}" fill="${paint("clay-deep")}"/>` : "";
  return `${OPEN}${BG}${st.under}<g transform="${st.cam}">${st.floor}${pool}${x < 290 ? cupBack(x) + cupFront(x, 0) : ""}${pot(a, t, swing, stain + bead)}${steamAt(track(S.steam, t), track(S.sway, t), a)}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export const frame = (name, t) => (name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR)));
