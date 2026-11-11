// Bag's two stories, the overstuffed handbag's own: its clasp holds a bag crammed too full. It strains (the bag bulging, the clasp trembling)
// and then lets go. Happy: gently: the crammed silk scarf pushes the flap up and over, rises out of the mouth, slides over the front lip and
// falls, draping down the front in folds that swing once and settle. Sad: with a pop: the flap flies open and the burst throws out keys,
// coins and a lipstick, which fall over the front and land on the floor; one coin rolls off and stops.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, n4, paint, parsePath, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<rect y=\"144\" width=\"200\" height=\"56\" fill=\"var(--art-teal-lit,#6FD0BD)\"/>\n<path d=\"M29.5 170.7 L155.8 167.3 L200 185.9 L200 200 L81.7 200 Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M49.5 77 L49.5 74.5 C49.5 45.5 71.1 22 97.9 22 C124.2 22 144.8 45.7 144.8 74.5 L144.8 78 L133.3 78 L133.5 74.5 C133.5 51.3 117.7 31.6 97.9 31.6 C77.3 31.6 59.7 51 59.7 74.5 L59.7 78 Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M36.2 93.7 C32.4 105.7 25.2 121.4 22.1 136.9 C18.3 155.8 20.8 168.9 32.7 172.3 C34.5 172.8 36.1 172.8 38.5 172.8 L151.7 172.8 C163 172.8 170 158.4 169.4 142.8 C169 128.2 160 107.7 156 88.1 C153.9 80.3 149.8 76.4 144.7 76 L52.1 76 C43.1 77.5 36.5 83.8 36.2 93.7 Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M36.2 94 C32.3 106.2 25.3 121.8 22.2 137 C18.4 155.1 20.7 168.3 32.5 172.3 C34.3 172.9 36.2 172.8 39.3 172.8 L96.2 172.8 C116 169.2 134.4 150.6 136.3 128.2 C136.5 126.8 135.6 126.7 134.4 127.2 C121.1 132.6 105.6 133.5 88.8 133 C60.6 132.4 39.1 120.2 36.2 98.4 Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M36.1 95.7 C35.6 108.6 45.2 120.4 60.3 126.8 C73.6 132.6 88.6 133.7 102.9 133.2 C124 132.6 141.5 128.2 150.5 115.8 C155 109.6 157.2 99.8 156 88 C154.1 81.1 150.1 76.8 145.9 76.2 L54 76.2 C42.8 77.5 34.5 84.9 36.1 95.7 Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M51.6 76 L144.7 76 C147 76 148.4 77.2 147.9 80.2 C146.7 91.7 138.1 104.9 126.3 114.1 C115.3 122.8 103.7 126.6 88.3 126.5 C66.7 126.9 49.4 121.4 40.9 109.6 C36.3 103.2 33.4 94 36.4 87.1 C39.2 80.6 44.6 77.1 51.6 76 Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M88.5 117.1 L102.6 117.1 C104.5 117.1 105.6 118.4 105.6 120.4 L105.6 127.8 C105.6 133.6 101.2 138 95.7 138 C90.1 138 85.5 133.6 85.5 127.8 L85.5 120.4 C85.5 118.5 86.6 117.1 88.5 117.1 Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n</svg>\n";
export const STILL_HASH = "4c2d8340be";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 9) throw new Error("bag: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const dOf = (svg) => /d="([^"]+)"/.exec(svg)[1];
const pts = (P) => P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
// the still's parts: the wall, the floor and the bag's shadow; the handle; the bag's body (its shaded back and side); its lit front; the flap
// (its edge, its face) and the clasp
const ROOM = EL.slice(0, 3).join(""), HANDLE = EL[3], BACK = EL[4], FRONT = EL[5], FLAP = EL[6] + EL[7], CLASP = EL[8];
const HINGE = 76;
const bezPts = (d, n = 6) => parsePath(d).flatMap((run) => run.segs.flatMap((s) => Array.from({ length: n }, (_, k) => { const t = k / n, u = 1 - t; return [0, 1].map((j) => u * u * u * s[0][j] + 3 * u * u * t * s[1][j] + 3 * u * t * t * s[2][j] + t * t * t * s[3][j]); })));
// the front's upper part, shaded by the flap until it lifts: the bag's front between its mouth and the lit front's top edge
const FRONT_TOP = bezPts(dOf(EL[5])).filter((p) => p[1] < 134 && p[0] > 35 && p[0] < 137 && !(p[1] > 130 && p[0] < 60));
// the mouth: from the front and a little above, the dark inside between the back edge (the hinge) and the front lip
const LIP = (x) => HINGE + 6 * Math.sin((Math.PI * (x - 50)) / 96);
// (its top edge is the lip: what's in the mouth shows above it, what's lower in the bag stays behind it)
const UPPER = [[36.2, 93.7], [40, 84], [46, 79], ...Array.from({ length: 12 }, (_, i) => { const x = 52 + (93 * i) / 11; return [x, LIP(x)]; }), [147.5, 80], [146, 96], [141, 116], [136.3, 128.2], ...FRONT_TOP.filter((p) => p[1] > 96).sort((a, b) => b[0] - a[0])];
const MOUTH = [...Array.from({ length: 13 }, (_, i) => [50 + 8 * i, HINGE]), ...Array.from({ length: 13 }, (_, i) => { const x = 146 - 8 * i; return [x, LIP(x)]; })];
// the flap turned about its hinge (seen from in front: squashed into its height, then flipped above it, showing its underside)
function flap(ang) {
  const c = Math.cos((ang * Math.PI) / 180);
  const at = `transform="translate(0 ${HINGE}) scale(1 ${n4(c)}) translate(0 ${-HINGE})"`;
  if (c >= 0) return { front: `<g ${at}>${FLAP}${CLASP}</g>`, back: "" };
  return { front: "", back: `<g ${at}><path d="${dOf(EL[6])}" ${fill("clay-deep")}/><path d="${dOf(EL[8])}" ${fill("paper-deep")}/></g>` };
}
// where the flap's tip is (its lowest point, at the clasp's foot, 138), for the light coming back onto the front under it
const tipY = (ang) => HINGE + (138 - HINGE) * Math.cos((ang * Math.PI) / 180);
// the strain: the bag swells a touch about its base and the flap's tip trembles at its clasp, faster and harder until it lets go
const strain = (t, t1) => {
  const k = track([[0.25, 0], [t1, 1, "in"]], t);
  // let go: the bulge relaxes quickly (not at once), the trembling stops
  const swell = t < t1 ? k : track([[t1, 1], [t1 + 0.12, 0, "out"]], t);
  return { swell: 1 + 0.02 * swell, shiver: t < t1 ? k * 1.4 * Math.sin(t * 70) : 0 };
};
function bag({ swell, shiver, ang, inside = "", outside = "" }) {
  const f = flap(ang + shiver), lit = tipY(ang) + 4;
  // the front's upper part once the flap moves: in the flap's shade, lit below its tip as it lifts
  const upper = ang > 0.01 ? `<polygon points="${pts(UPPER)}" ${fill("clay-deep")}/><clipPath id="lt"><rect x="0" y="${n2(lit)}" width="200" height="200"/></clipPath><polygon points="${pts(UPPER)}" ${fill("clay")} clip-path="url(#lt)"/>` : "";
  const body = `<g transform="translate(96 172.8) scale(${n4(swell)} ${n4(2 - swell)}) translate(-96 -172.8)">`;
  return `${OPEN}${ROOM}${f.back}${HANDLE}${body}${BACK}<polygon points="${pts(MOUTH)}" ${fill("clay-deeper")}/>${inside}${FRONT}${upper}${f.front}</g>${outside}</svg>`;
}

// ---- happy: the scarf, as cloth: its middle line through a few shapes (still inside; humping up out of the mouth, pushing the flap; over
// the lip; falling; draped down the front in folds), a band along it, its folds darker across it; its fall swings once and settles
const SCARF = [
  [0.5, [[78, 96], [92, 92], [104, 92], [114, 96], [118, 100], [118, 104], [118, 108], [118, 112]]],
  [0.75, [[78, 96], [86, 76], [98, 66], [110, 70], [117, 80], [119, 88], [119, 94], [119, 100]]],
  [1.0, [[78, 96], [86, 74], [98, 64], [110, 68], [118, 80], [120, 96], [118, 110], [116, 122]]],
  [1.25, [[78, 96], [86, 74], [98, 68], [110, 74], [116, 90], [116, 112], [112, 134], [114, 154]]],
  [1.5, [[78, 96], [86, 75], [98, 70], [110, 76], [115, 94], [114, 116], [109, 138], [112, 160]]],
];
const scarfLine = (t) => {
  let i = 0;
  while (i < SCARF.length - 2 && t > SCARF[i + 1][0]) i++;
  const [t0, A] = SCARF[i], [t1, B] = SCARF[i + 1], u = track([[t0, 0], [t1, 1, "io"]], t);
  // after the drape, its hanging end swings once and settles
  const swing = 3.2 * Math.exp(-Math.max(0, t - 1.5) * 3) * Math.sin(Math.max(0, t - 1.5) * 9) * (t > 1.5 ? 1 : 0);
  return smooth(A.map((p, k) => [p[0] + (B[k][0] - p[0]) * u + swing * Math.max(0, (k - 4) / 3), p[1] + (B[k][1] - p[1]) * u]));
};
// cloth bends smoothly: the line through its points as a curve (Catmull-Rom, four steps between each pair)
function smooth(P) {
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[Math.max(0, i - 1)], b = P[i], c = P[i + 1], d = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 4; k++) { const t = k / 4, t2 = t * t, t3 = t2 * t; out.push([0, 1].map((j) => 0.5 * (2 * b[j] + (-a[j] + c[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * t3))); }
  }
  out.push(P[P.length - 1]);
  return out;
}
// a band along a line (width w, narrowing a little to its end), from the given point on
function band(L, w, from = 0) {
  const left = [], right = [];
  for (let i = from; i < L.length; i++) {
    const a = L[Math.max(0, i - 1)], b = L[Math.min(L.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const half = (w / 2) * (1 - 0.25 * (i / (L.length - 1)));
    left.push([L[i][0] - (dy / len) * half, L[i][1] + (dx / len) * half]);
    right.push([L[i][0] + (dy / len) * half, L[i][1] - (dx / len) * half]);
  }
  return [...left, ...right.reverse()];
}
const HAPPY_DUR = 1.5 + 0.9;
function happy(t) {
  if (t <= 0) return STILL;
  const s = strain(t, 0.5);
  // the scarf's push lifts the flap, over the top, and it falls back to rest against the handle
  const ang = track([[0.5, 0], [0.85, 95, "io"], [1.05, 150, "in"], [1.12, 142, "out"], [1.2, 150, "in"]], t);
  let inside = "", outside = "";
  if (t > 0.5) {
    const L = scarfLine(t);
    // the part still inside and over the lip is behind the bag's front; from where it crosses the lip going down, in front of it
    // where it comes back down over the lip: after first rising out above it (until it has, all of it is still inside)
    const up = L.findIndex((p) => p[1] < LIP(p[0]) - 1), cross = up < 0 ? -1 : L.findIndex((p, i) => i > up && p[1] > LIP(p[0]) + 2);
    inside = `<polygon points="${pts(band(L, 22))}" ${fill("violet")}/>`;
    if (cross > 0) {
      // the hanging part, in front: the cloth, and its folds running down it (darker, narrowing to nothing at the top, where it turns over
      // the lip), one each side of the middle
      const hang = L.slice(cross - 1);
      const fold = (off) => band(hang.map((p, i) => { const a = hang[Math.max(0, i - 1)], b = hang[Math.min(hang.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, k = i / (hang.length - 1); return [p[0] - (dy / len) * off * k, p[1] + (dx / len) * off * k]; }), 3.2);
      outside = `<polygon points="${pts(band(L, 22, cross - 1))}" ${fill("violet")}/><polygon points="${pts(fold(5))}" ${fill("violet-deep")}/><polygon points="${pts(fold(-4))}" ${fill("violet-deep")}/>`;
    }
  }
  return bag({ ...s, ang, inside, outside });
}

// ---- sad: the pop: the flap flies open, and what's crammed in bursts out, each on its own arc (gravity 2500 a second squared), behind the
// bag's front while it's in the mouth, in front of it once it falls over the lip; each lands on the floor in front with its shadow under it,
// a small bounce; one coin rolls off right and stops
const T_POP = 0.8, G = 2500;
const KEYS = `<circle cx="0" cy="-5" r="3.4" fill="none" stroke="${paint("steel")}" stroke-width="1.3"/><path d="M-1 -2L-4 9L-2 9L-1.5 7.5L0 7.5L0.5 5L1 -2Z" ${fill("steel-deep")}/><path d="M1.5 -2.5L7 7L8.6 6L7.6 4.5L8.8 3.8L5 -3.5Z" ${fill("steel")}/>`;
const COIN = `<ellipse cx="0" cy="0" rx="3.8" ry="3.8" ${fill("sun-deep")}/><ellipse cx="-0.4" cy="-0.4" rx="3.1" ry="3.1" ${fill("sun")}/>`;
const LIPSTICK = `<rect x="-2.4" y="-6" width="4.8" height="8" rx="1" ${fill("ink")}/><rect x="-2" y="-9.5" width="4" height="4" rx="1.6" ${fill("clay-deep")}/><rect x="-2.6" y="1.4" width="5.2" height="2.4" rx=".6" ${fill("sun")}/>`;
const THINGS = [
  // [drawing, start x, y, velocity x, y, spin a second, where it lands (floor y), resting turn, rolls to x?]
  [KEYS, 72, 92, -55, -420, 420, 181, 74],
  [COIN, 100, 95, 22, -430, 0, 189, 0],
  [COIN, 112, 96, 46, -410, 0, 188, 0],
  [COIN, 122, 94, 72, -400, 0, 190, 0, 186],
  [LIPSTICK, 90, 94, -12, -440, 640, 188, 92],
];
const SAD_DUR = 2.0 + 0.6;
function sad(t) {
  if (t <= 0) return STILL;
  const s = strain(t, T_POP);
  const ang = track([[T_POP, 0], [T_POP + 0.24, 160, "io"], [T_POP + 0.32, 147, "out"], [T_POP + 0.4, 152, "in"]], t);
  let inside = "", outside = "";
  if (t > T_POP) {
    const dt = t - T_POP;
    for (const [svg, x0, y0, vx, vy, spin, land, rest, rollTo] of THINGS) {
      // its flight: up and out, then down onto the floor; the moment it lands, then a small bounce (or, for the rolling coin, the roll)
      const tl = (-vy + Math.sqrt(vy * vy + 2 * G * (land - y0))) / G, u = Math.min(dt, tl);
      let x = x0 + vx * u, y = y0 + vy * u + 0.5 * G * u * u, a = spin * u;
      if (dt > tl) {
        const after = dt - tl;
        a = rest;
        if (rollTo) { const d = rollTo - x, T = 0.7, k = Math.min(1, after / T); x += d * (1 - (1 - k) * (1 - k)); a = rest + ((d * (1 - (1 - k) * (1 - k))) / 5.7) * (180 / Math.PI); }
        else y -= 3.5 * Math.max(0, Math.sin(Math.min(1, after / 0.12) * Math.PI));
      }
      const thing = `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(a)}) scale(1.5)">${svg}</g>`;
      // in front once past the top of its arc (all of it above the lip there), behind the front before
      const falling = vy + G * u > 0;
      if (falling || dt > tl) {
        const near = Math.max(0, 1 - (land - y) / 40);
        const shadow = near > 0.05 ? `<ellipse cx="${n2(x + 2)}" cy="${n2(land + 4)}" rx="${n2(8 * near)}" ry="${n2(2.2 * near)}" ${fill("teal-deep")}/>` : "";
        outside += shadow + thing;
      } else inside += thing;
    }
  }
  return bag({ ...s, ang, inside, outside });
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
