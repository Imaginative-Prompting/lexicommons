// The coffee's two stories. Happy: a little jump, and the plate bounces and rattles when it lands. Sad: a tick, a beat, it cracks, it pours out, and it stays that way. Then the handle goes.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths, in the 200-unit view.
import { bendAbout, blob, n2, paint, parsePath, runsToD, scaleAbout, subdivide, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: a redrawn still has no reaction until its story is redrawn too. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect y=\"118.0\" width=\"200\" height=\"82.0\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path fill=\"var(--art-teal-deep,#25907B)\" d=\"M201.0 120.7L133.7 151.8L52.2 161.9C55.0 175.4 75.0 189.8 91.4 201.0H201.0Z\"/><path fill=\"var(--art-teal-deep,#25907B)\" d=\"M133.8 151c0 7.7-26 13.9-58 13.9-32.1 0-58.1-6.2-58.1-13.9 0-7.6 26-13.8 58.1-13.8 32 0 58 6.2 58 13.8Z\"/><path fill=\"var(--art-paper,#FBF7EC)\" d=\"M133.8 149c0 7.6-25.9 13.8-57.9 13.8-32 0-57.9-6.2-57.9-13.8 0-7.7 25.9-13.9 57.9-13.9 32 0 57.9 6.2 57.9 13.9Z\"/><path fill=\"var(--art-paper,#FBF7EC)\" d=\"M34 74.6c-.4 7 0 14.2 1.1 21.1 1.2 7.8 3.6 15.8 6.6 23.1 1.9 4.6 3.9 9.2 6.3 13.6 2 3.5 3.2 7.5 5.6 10.8 2.1 2.9 4.7 5.4 7.6 7.4 1.3 .8 3 1.1 4.5 .9 9.2-6.4 17.3-14.6 23.6-23.9 10.1-14.9 37.9-35.4 24.9-47.9-19.4-18.5-55.7-15.9-80.2-5.1Z\"/><path fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\" d=\"M82.3 88c5.3-3.1 10.9-5.9 16.6-8.3 4.7-1.9 9.7-3.5 14.7-4.7 .2 .7 .4 1.4 .6 2.2-.1 1.4 .8 3.5 2.1 4.2 1.5 .9 2.6 .7 4.2 .7 2.6 0 5.2-.2 7.9-.1 5 .2 9.9 1.3 14.1 4.2 4.9 3.5 7.8 9.9 7.4 15.9-.3 5.3-2.5 10.8-5.8 15-4.4 5.5-10.3 9.3-16.7 12-5.6 2.4-11.7 4.4-17.5 5.9-2.6 .6-5.4 1.4-7.8 2.5-2.6 1.2-4.9 2.7-7 4.7-2.7 2.4-5.9 4.7-9.4 6.1-3 1.2-6 2.1-9.1 2.5-3.8 .6-7.2 .5-10.9 .7 4.2-3.1 7.6-7 10.4-11.3 3.3-5 6-10.3 8.3-15.8 2.2-5.6 3.8-11.5 4.1-17.5 .2-4-.7-9.2-2.2-12.8-1-2.3-2.3-4.3-4-6.1ZM104.8 124.7c1.2-3.4 2.5-7.1 3.8-10.5 1.6-4 2.6-8.1 4-12.1 .9-2.7 2.5-5.3 5-6.8 2.8-1.5 6.9-2.1 10-2 4.4 .1 9.6 1.1 10 6.4 .3 2.6-1.8 6.4-3.2 8.5-2.8 4-6.6 7-10.8 9.5-5.3 3.2-12.8 5.7-18.8 7Z\"/><path fill=\"var(--art-paper,#FBF7EC)\" d=\"M114.2 76.1c0 6.7-18 12.2-40.2 12.2-22.2 0-40.2-5.5-40.2-12.2 0-6.8 18-12.2 40.2-12.2 22.2 0 40.2 5.4 40.2 12.2Z\"/><path fill=\"var(--art-ink,#231F3B)\" d=\"M109 77c0 5.3-15.7 9.6-35 9.6-19.3 0-35-4.3-35-9.6 0-5.4 15.7-9.7 35-9.7 19.3 0 35 4.3 35 9.7Z\"/><path fill=\"var(--art-paper,#FBF7EC)\" d=\"M68.6 13.9c-3.5 1.5-5.7 5.9-5.6 9.6 .1 3.7 2.2 6.7 2.4 10.5 .3 7-4 11.5-4.6 18.1-.3 2.2 1.1 5.3 2.8 6.6 1.2 1 2.7 1.5 4.2 1.7 .4-1.6-1-3.2-1-5.1 0-2.7 .6-4.7 1.9-7.1 1.6-3.1 3.4-6.4 3.5-9.9 .2-5.8-4.4-11.3-5.1-17.1-.3-3.1 .2-4.6 1.5-7.3Z\"/><path fill=\"var(--art-paper,#FBF7EC)\" d=\"M92.2 16.1c-2.7 1.1-4.8 4.5-4.9 7.3-.2 4.1 1.9 6.4 2 10.5 .1 5.7-4 10.1-4.3 15.5-.1 2.3 1 4.9 3 6.1 .9 .6 2.1 1.3 3.1 .8-.8-1.6-1-2.4-1-4.1 0-5.6 4.8-9.3 5.1-15 .3-5.8-4.4-10.4-4.3-16 .1-2.3 .2-3 1.3-5.1Z\"/></svg>";
export const STILL_HASH = "39b9ce0b7a";
const U = 200 / 1254;
const v = (x) => x * U;
const NAMES = ["shadow", "saucerRim", "saucer", "body", "inkSide", "rim", "coffee", "steamA", "steamB"];
const PART = {};
[...STILL.matchAll(/<path fill="([^"]*)"((?: fill-rule="evenodd")?) d="([^"]*)"\/>/g)].forEach((m, i) => { PART[NAMES[i]] = { fill: m[1], rule: m[2], d: m[3] }; });
const svgOf = (p) => `<path fill="${p.fill}"${p.rule} d="${p.d}"/>`;
const BACK = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf(svgOf(PART.saucerRim)));
const STEAM_A = subdivide(parsePath(PART.steamA.d), 3), STEAM_B = subdivide(parsePath(PART.steamB.d), 3);
const SA = [v(400), v(367)], SB = [v(552), v(352)];
const BASE = [v(464), v(950)], PLATE = [v(476), v(934)];
const COFFEE = [v(464), v(482.5), v(219.5), v(60.5)];
const open = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const steamPaths = (fn) => `<path fill="${paint("paper")}" d="${runsToD(STEAM_A, (x, y) => fn(x, y, SA, 0))}"/><path fill="${paint("paper")}" d="${runsToD(STEAM_B, (x, y) => fn(x, y, SB, 1))}"/>`;

// ---- happy
const g = 3600 * U, H = v(128), V0 = Math.sqrt(2 * g * H), AIR = (2 * V0) / g;
const T0 = 0.22, T1 = T0 + AIR, HAPPY_DUR = T1 + 0.85;
const rise = (t) => (t <= T0 || t >= T1 ? 0 : V0 * (t - T0) - 0.5 * g * (t - T0) ** 2);
const H_SY = [[0, 1], [0.04, 1], [T0 - 0.01, 0.8, "out"], [T0 + 0.07, 1.16, "out3"], [T0 + 0.22, 1.02, "io"], [T1 - 0.1, 1.01], [T1 - 0.01, 1.12, "in"], [T1 + 0.04, 0.76, "out"], [T1 + 0.14, 1.07, "io"], [T1 + 0.26, 0.98, "io"], [T1 + 0.36, 1, "io"]];
const H_STEAM = [[0, 1], [T0 - 0.01, 0.86, "out"], [T0 + 0.1, 0.55, "out"], [T0 + AIR / 2, 0.86, "io"], [T1 - 0.01, 1.42, "in"], [T1 + 0.07, 1.2, "out"], [T1 + 0.2, 0.86, "io"], [T1 + 0.36, 1.07, "io"], [T1 + 0.52, 1, "io"]];
const H_SWAY = [[0, 0], [T0, 10, "out"], [T0 + 0.2, -14, "io"], [T1, 12, "io"], [T1 + 0.16, -16, "out"], [T1 + 0.34, 8, "io"], [T1 + 0.54, 0, "io"]];
// the plate: the hit throws it up and off-level, it comes down, bounces lower, and rattles to rest, faster and smaller
const hop = [[T1, 0], [T1 + 0.075, v(46), "out"], [T1 + 0.15, 0, "in"], [T1 + 0.205, v(15), "out"], [T1 + 0.26, 0, "in"], [T1 + 0.295, v(4.5), "out"], [T1 + 0.33, 0, "in"]];
function plateTilt(t) {
  const s = t - T1;
  if (s <= 0) return 0;
  if (s < 0.15) return -6.5 * Math.sin((Math.PI * s) / 0.15);
  if (s < 0.26) return 3.4 * Math.sin((Math.PI * (s - 0.15)) / 0.11);
  const w = s - 0.26, e = 0.59;
  if (w >= e) return 0;
  // a coin settling: a phase that speeds up as the amplitude falls off, ending at exactly zero
  const amp = 1.9 * (1 - w / e) ** 1.7;
  return amp * Math.sin(2 * Math.PI * (9 * w + 16 * w * w));
}
const coffeeJump = [[T1 - 0.005, 0], [T1 + 0.05, -v(15), "out"], [T1 + 0.17, v(7), "io"], [T1 + 0.3, -v(3), "io"], [T1 + 0.42, 0, "io"]];
const TIP = [[T1, 0], [T1 + 0.12, -3.2, "out"], [T1 + 0.28, 2, "io"], [T1 + 0.46, 0, "io"]];

function happy(t) {
  const sy = track(H_SY, t), sx = 1 / Math.sqrt(sy), up = rise(t), up2 = rise(t - 0.045);
  const hp = track(hop, t), tilt = plateTilt(t);
  const plateT = `translate(0 ${n2(-hp)}) rotate(${n2(tilt)} ${n2(PLATE[0])} ${n2(PLATE[1])})`;
  const cupT = `translate(${n2(BASE[0])} ${n2(BASE[1] - up)}) scale(${n2(Math.round(sx * 1000) / 1000 === 1 ? 1 : sx)} ${n2(sy)}) translate(${n2(-BASE[0])} ${n2(-BASE[1])})`;
  // the coffee has its own weight
  const cj = track(coffeeJump, t), ct = track(TIP, t);
  const coffee = `<g transform="translate(0 ${n2(cj)}) rotate(${n2(ct)} ${n2(COFFEE[0])} ${n2(COFFEE[1])})">${svgOf(PART.coffee)}</g>`;
  // the steam rides a little behind the cup, squashed against the rise and stretched by the fall
  const ss = track(H_STEAM, t), sw = track(H_SWAY, t);
    const steam = steamPaths((x, y, b, i) => {
    let p = scaleAbout(x, y, b[0], b[1], 1 - (ss - 1) * 0.35, ss);
    p = bendAbout(p[0], p[1], b[0], b[1], -90, v(250), (i ? -1 : 1) * 0.7 * sw + sw * 0.5);
    const base = BASE[1] + (b[1] - BASE[1]) * sy;
    return [p[0], p[1] + (base - b[1]) - up2 - hp];
  });
  // two drops thrown from the cup on the hit, and back in
  let drops = "";
  const s = t - (T1 + 0.015);
  if (s > 0 && s < 0.46) {
    // they leave the coffee's surface and land back in it: a higher one, a lower one, a tiny one
    for (const [x0, x1, vd, r, life] of [[-v(70), -v(150), 175, v(25), 0.46], [v(46), v(150), 125, v(18), 0.38], [-v(4), v(26), 215, v(11), 0.44]]) {
      if (s >= life) continue;
      const f = s / life, x = COFFEE[0] + x0 + (x1 - x0) * f, y = COFFEE[1] - hp - vd * s + 0.5 * ((2 * vd) / life) * s * s;
      // each pinches off a bump in the surface as it leaves, and sinks back into it as it lands: it grows out of the coffee and goes back in, never
      // appearing or going whole
      const size = r * Math.min(1, s / 0.05) * Math.min(1, (life - s) / 0.05);
      drops += `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(size)}" fill="${paint("ink")}"/>`;
    }
  }
  // the plate's shadow on the table, only while it's in the air
  const contact = hp > 0.01 ? `<ellipse cx="${n2(PLATE[0] - v(22))}" cy="${n2(v(958))}" rx="${n2(v(300))}" ry="${n2(v(72))}" fill="${paint("teal-deep")}"/>` : "";
  return `${open}${BACK}${contact}<g transform="${plateT}">${svgOf(PART.saucerRim)}${svgOf(PART.saucer)}<g transform="${cupT}">${svgOf(PART.body)}${svgOf(PART.inkSide)}${svgOf(PART.rim)}${coffee}</g></g>${drops}${steam}</svg>`;
}

// ---- sad. The cup stays whole and a jagged dark gap widens in its wall, as a real crack does. All geometry in reference pixels.
const CRACK = [[352, 545], [338, 572], [374, 608], [330, 654], [376, 702], [344, 762], [402, 806], [366, 860], [406, 904], [394, 956]];
const WIDTH = [5, 8, 13, 18, 21, 24, 27, 33, 42, 54];
const pts = (a) => a.map((q) => `${n2(v(q[0]))},${n2(v(q[1]))}`).join(" ");
// the chip off the rim: its top edge runs along the coffee's edge
const CHIP = [[318, 527], [362, 535], [404, 541], [414, 586], [376, 606], [340, 568], [304, 584]];
const CUT = [[782, 470], [772, 522], [786, 556], [774, 600], [742, 748], [754, 778], [738, 808], [750, 860]];
const CUP_SIDE = [[782, 300], ...CUT, [750, 1010], [150, 1010], [150, 300]];
const HANDLE = [[782, 300], ...CUT, [750, 1010], [1180, 1010], [1180, 300]];
const TICK = 0.14, RUN = 0.5, RUN_END = 0.6, SPLIT = 0.6;
const SAG = 1.78, DROP = 2.04, HANDLE_G = 3400 * U;
const HANDLE_FALL = v(205), HANDLE_LAND = DROP + Math.sqrt((2 * HANDLE_FALL) / HANDLE_G), SAD_DUR = HANDLE_LAND + 0.5;
const S = {
  flinch: [[TICK - 0.001, 0], [TICK + 0.02, 1, "out"], [TICK + 0.13, 0, "io"], [RUN - 0.001, 0], [RUN + 0.025, 1.7, "out"], [RUN + 0.18, 0, "io"]],
  hair: [[TICK, 0], [TICK + 0.02, 0.24, "out"], [RUN, 0.24], [RUN_END, 1, "in"]],
  gap: [[SPLIT, 0], [SPLIT + 0.05, 0.42, "out"], [SPLIT + 0.2, 0.5], [1.5, 1, "io"]],
  sag: [[RUN, 0], [RUN + 0.14, 0.35, "out"], [1.6, 1, "io"]],
  wilt: [[TICK + 0.02, 0], [RUN, 0.45, "io"], [RUN_END + 0.06, 1, "in"], [1.05, 1.15, "io"]],
  steam: [[TICK + 0.04, 1], [RUN, 0.82, "io"], [RUN_END + 0.12, 0.42, "io"], [1.1, 0, "in"]],
  drain: [[SPLIT, 1], [1.58, 0.56, "out"]],
  pool: [[SPLIT + 0.04, 0], [1.06, 0.86, "out"], [1.5, 1, "io"]],
  neck: [[0.94, 0], [1.16, 1, "in"]],
  table: [[1.02, 0], [1.68, 1, "out"]],
};
const ON_PLATE = [[182, 955], [238, 926], [330, 910], [420, 906], [520, 918], [622, 928], [716, 946], [730, 968], [660, 986], [560, 1000], [460, 1012], [360, 1020], [262, 1010], [196, 988]];
const ON_TABLE = [[214, 1046], [128, 1056], [66, 1090], [86, 1128], [64, 1164], [130, 1198], [240, 1212], [332, 1194], [420, 1186], [516, 1160], [552, 1122], [500, 1084], [420, 1068], [356, 1046]];
const grown = (list, ox, oy, k) => blob(list.map((q) => [v(ox + (q[0] - ox) * k), v(oy + (q[1] - oy) * k)]));
function sad(t) {
  const f = track(S.flinch, t), gp = track(S.gap, t), sg = track(S.sag, t);
  const jx = f * Math.sin(t * 2 * Math.PI * 34) * v(3.2);
  const cupT = `translate(${n2(jx)} 0) rotate(${n2(-2.6 * sg)} ${n2(v(404))} ${n2(v(952))}) translate(${n2(BASE[0])} ${n2(BASE[1])}) scale(${n2(1 + f * 0.011)} ${n2(1 - f * 0.018 - 0.012 * sg)}) translate(${n2(-BASE[0])} ${n2(-BASE[1])})`;
  // the insides as the level falls: the far wall shows above the coffee
  const dr = track(S.drain, t);
  const insides = dr >= 0.999 ? svgOf(PART.coffee) : `<ellipse cx="${n2(COFFEE[0])}" cy="${n2(COFFEE[1])}" rx="${n2(COFFEE[2])}" ry="${n2(COFFEE[3])}" fill="${paint("paper-deep")}"/><ellipse cx="${n2(COFFEE[0])}" cy="${n2(COFFEE[1] + COFFEE[3] * (1 - dr))}" rx="${n2(COFFEE[2] * dr)}" ry="${n2(COFFEE[3] * dr)}" fill="${paint("ink")}"/>`;
  // the crack: a hairline until it runs, then a jagged gap that opens
  let crack = "";
  const hl = track(S.hair, t);
  if (gp > 0) {
    const L = CRACK.map((q, i) => [q[0] - WIDTH[i] * gp * 0.9, q[1]]), R = CRACK.map((q, i) => [q[0] + WIDTH[i] * gp * 1.1, q[1]]).reverse();
    crack = `<polygon fill="${paint("ink")}" points="${pts([...L, ...R])}"/>`;
  } else if (hl > 0) {
    const n = CRACK.length - 1, reach = hl * n, k = Math.floor(reach), u = reach - k, list = CRACK.slice(0, k + 1).map((q) => [v(q[0]), v(q[1])]);
    if (k < n) list.push([v(CRACK[k][0] + (CRACK[k + 1][0] - CRACK[k][0]) * u), v(CRACK[k][1] + (CRACK[k + 1][1] - CRACK[k][1]) * u)]);
    crack = `<path fill="none" stroke="${paint("ink")}" stroke-width="${n2(0.9 + hl)}" stroke-linejoin="round" d="M${list.map((q) => `${n2(q[0])} ${n2(q[1])}`).join("L")}"/>`;
  }
  // the chip: flush until the split, then a dark bite in the rim, and the chip is thrown out and falls onto the plate
  let bite = "", chip = "";
  const w = t - SPLIT;
  if (w > 0) {
    bite = `<polygon fill="${paint("ink")}" points="${pts(CHIP)}"/>`;
    const wg = 3000 * U, up0 = 26, drop = v(378), LAND = (up0 + Math.sqrt(up0 * up0 + 2 * wg * drop)) / wg, dx = -v(150);
    const c0 = [v(360), v(560)];
    let tx, ty, rot;
    if (w < LAND) { const fr = w / LAND; tx = dx * fr; ty = -up0 * w + 0.5 * wg * w * w; rot = -158 * fr; }
    else {
      const b = w - LAND;
      tx = dx - v(10) * Math.min(1, b / 0.2);
      ty = drop - track([[0, 0], [0.08, v(24), "out"], [0.16, 0, "in"], [0.2, v(6), "out"], [0.24, 0, "in"]], b);
      rot = -158 - 12 * Math.min(1, b / 0.2);
    }
    const tf = `translate(${n2(tx)} ${n2(ty)}) rotate(${n2(rot)} ${n2(c0[0])} ${n2(c0[1])})`;
    // a sliver of its broken edge shows, on the side away from the light
    chip = `<g transform="${tf}"><polygon fill="${paint("paper-deep")}" points="${pts(CHIP.map((q) => [q[0] + 13, q[1] - 11]))}"/><polygon fill="${paint("paper")}" points="${pts(CHIP)}"/></g>`;
  }
  // the handle: its top lets go, it swings down on the bottom one, that goes too, it drops on the table
  let side = svgOf(PART.inkSide), handle = "", clips = "";
  if (t >= SAG) {
    clips = `<clipPath id="cs"><polygon points="${pts(CUP_SIDE)}"/></clipPath><clipPath id="ch"><polygon points="${pts(HANDLE)}"/></clipPath>`;
    side = `<g clip-path="url(#cs)">${svgOf(PART.inkSide)}</g>`;
    const pivot = [v(745), v(800)];
    let tf;
    if (t < DROP) {
      const sag = track([[SAG, 0], [SAG + 0.09, 1, "in"], [SAG + 0.16, 0.84, "out"], [DROP, 0.9]], t);
      tf = `rotate(${n2(26 * sag)} ${n2(pivot[0])} ${n2(pivot[1])})`;
    } else {
      const d = t - DROP, end = HANDLE_LAND - DROP;
      if (d < end) tf = `translate(${n2(v(70) * (d / end))} ${n2(0.5 * HANDLE_G * d * d)}) rotate(${n2(23.4 + (d / end) * 50)} ${n2(pivot[0])} ${n2(pivot[1])})`;
      else {
        const b = d - end, hop = track([[0, 0], [0.07, v(15), "out"], [0.14, 0, "in"], [0.18, v(4), "out"], [0.22, 0, "in"]], b);
        const rock = b < 0.34 ? 7 * Math.sin(b * 28) * (1 - b / 0.34) : 0;
        tf = `translate(${n2(v(70))} ${n2(HANDLE_FALL - hop)}) rotate(${n2(73.4 + rock)} ${n2(pivot[0])} ${n2(pivot[1])})`;
      }
    }
    handle = `<g transform="${tf}"><g clip-path="url(#ch)">${svgOf(PART.inkSide)}</g></g>`;
  }
  const handleHanging = t < DROP ? handle : "", handleDown = t >= DROP ? handle : "";
  const cup = `<g transform="${cupT}">${clips}${svgOf(PART.body)}${handleHanging}${side}${svgOf(PART.rim)}${insides}${bite}${crack}</g>`;
  // the coffee: a pool on the plate, a neck over its edge, a pool on the table. All one color, so they read as one spill.
  const pl = track(S.pool, t), nk = track(S.neck, t), tb = track(S.table, t);
  let spill = "";
  if (pl > 0) spill += `<path fill="${paint("ink")}" d="${grown(ON_PLATE, 400, 950, pl)}"/>`;
  if (nk > 0) {
    // it starts inside the plate's pool and runs out and down over the plate's edge
    const y = 985 + 105 * nk, wide = 0.55 + 0.45 * nk;
    spill += `<path fill="${paint("ink")}" d="M${n2(v(250))} ${n2(v(978))}C${n2(v(246))} ${n2(v(1020))} ${n2(v(300 - 96 * wide))} ${n2(v(y - 30))} ${n2(v(300 - 118 * wide))} ${n2(v(y))}H${n2(v(300 + 92 * wide))}C${n2(v(300 + 112 * wide))} ${n2(v(y - 30))} ${n2(v(430))} ${n2(v(1020))} ${n2(v(462))} ${n2(v(990))}Z"/>`;
  }
  if (tb > 0) {
    spill += `<path fill="${paint("ink")}" d="${grown(ON_TABLE, 290, 1050, tb)}"/>`;
    const a = track([[1.34, 0], [1.46, 1, "back"]], t), b = track([[1.5, 0], [1.6, 1, "back"]], t);
    if (a > 0) spill += `<circle cx="${n2(v(618))}" cy="${n2(v(1096))}" r="${n2(v(21) * a)}" fill="${paint("ink")}"/>`;
    if (b > 0) spill += `<circle cx="${n2(v(508))}" cy="${n2(v(1216))}" r="${n2(v(15) * b)}" fill="${paint("ink")}"/>`;
  }
  const wl = track(S.wilt, t), sc = track(S.steam, t);
  // The steam: as the coffee drains away and cools, it thins and stops, each wisp narrowing, shortening and drifting up to nothing. Steam doesn't
  // droop, and it's gone only once it's nothing.
  const steam = sc > 0.003 ? steamPaths((x, y, b, i) => {
    const p = scaleAbout(x, y, b[0], b[1], Math.sqrt(sc), sc);
    return [p[0] + f * Math.sin(t * 2 * Math.PI * 21 + i) * v(4), p[1] - (1 - sc) * v(60)];
  }) : "";
  return `${open}${BACK}${svgOf(PART.saucerRim)}${svgOf(PART.saucer)}${spill}${cup}${chip}${handleDown}${steam}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export const frame = (name, t) => (name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR)));
