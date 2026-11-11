// Closed's two stories, the padlock's own. Happy: a frosty night in a few seconds: frost ferns grow out over the body from a few points,
// fine rime crystals stand up along the shackle's curve, and last a clear glaze of ice closes over the keyhole from its rim inward, the dark
// hole still showing through it: frozen shut, really closed. Sad: it only looked latched: the shackle creeps up a hair as the latch slips,
// then its spring snaps it up against its stop; it bounces there and settles high, its toe standing clear of the body with a gap under it.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><g transform=\"translate(13 16)\"><path d=\"M48 92H152C156 92 160 96 160 100V168C160 172 156 176 152 176H48C44 176 40 172 40 168V100C40 96 44 92 48 92Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/></g><path d=\"M70 92V62C70 22 130 22 130 62V92\" fill=\"none\" stroke=\"var(--art-ink,#231F3B)\" stroke-width=\"15\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><clipPath id=\"l\"><path d=\"M48 92H152C156 92 160 96 160 100V168C160 172 156 176 152 176H48C44 176 40 172 40 168V100C40 96 44 92 48 92Z\"/></clipPath><g clip-path=\"url(#l)\"><rect x=\"-99\" y=\"-99\" width=\"399\" height=\"399\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M116 84C128 108 128 150 114 184H170V84Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/></g><circle cx=\"96\" cy=\"126\" r=\"11\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M90 130H102L105 154H87Z\" fill=\"var(--art-ink,#231F3B)\"/>\n</svg>\n";
export const STILL_HASH = "133d7c6439";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 8) throw new Error("closed: the still isn't as this story knows it");
const PAPER = paint("paper");
// the still's parts: the wall; the body's shadow on it; the shackle; the body (kept to its outline: its gold, its deep right panel); the keyhole
const WALL = EL[0], SHADOW = `<g transform="translate(13 16)">${EL[1]}</g>`, BODY_D = /d="([^"]+)"/.exec(EL[3])[1];
const BODY = (inner = "") => `<clipPath id="l"><path d="${BODY_D}"/></clipPath><g clip-path="url(#l)">${EL[4]}${EL[5]}${inner}</g>`;
const KEYHOLE = EL[6] + EL[7];
const SHACKLE_STROKE = 'fill="none" stroke="' + paint("ink") + '" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"';
// the shackle lifted by L: its heel (left) leg runs on down inside the body, out of sight; its toe (right) leg ends at the body's top
const shackle = (L) => `<path d="M70 ${n2(122 - L)}V${n2(62 - L)}C70 ${n2(22 - L)} 130 ${n2(22 - L)} 130 ${n2(62 - L)}V${n2(92 - L)}" ${SHACKLE_STROKE}/>`;
// a small seeded random, so the frost is the same every frame
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---- happy: the frost. Ferns: a stem curling a little as it grows, side branches alternating off it, each with its own small ticks;
// everything grows out from its nucleus, the tips slowing as they go (crystal growth)
const NUCLEI = [
  // [x, y, start time, [[heading in degrees, length, curl], ...]]
  [44, 172, 0.15, [[-60, 44, 0.008], [-16, 36, -0.008]]],
  [156, 171, 0.3, [[-122, 42, -0.008], [-160, 32, 0.008]]],
  [43, 97, 0.45, [[36, 36, -0.008], [80, 26, 0.008]]],
  [157, 98, 0.6, [[142, 32, 0.008], [100, 24, -0.008]]],
  [40, 136, 0.75, [[-4, 26, 0.006]]],
  [160, 138, 0.9, [[182, 22, -0.006]]],
];
const GROW = 1.4;
// a path written short (the frames have a size limit): one decimal, each step relative to the last point as rounded, so nothing drifts
const f1 = (v) => { const r = Math.round(v * 10) / 10, s = (r === 0 ? 0 : r).toString(); return s.replace(/^(-?)0\./, "$1."); };
function pen(x, y) {
  let d = `M${f1(x)} ${f1(y)}`, rx = Math.round(x * 10) / 10, ry = Math.round(y * 10) / 10, open = false;
  const num = (v) => { const t = f1(v); return (t[0] === "-" ? "" : " ") + t; };
  return {
    to(x2, y2) {
      const nx = Math.round(x2 * 10) / 10, ny = Math.round(y2 * 10) / 10, dx = nx - rx, dy = ny - ry;
      if (!dx && !dy) return;
      d += (open ? num(dx) : `l${f1(dx)}`) + num(dy); open = true; rx = nx; ry = ny;
    },
    get d() { return d; },
  };
}
// a fern is one path: up its stem, and at each node out along a branch and back, then the other side, then on up the stem
function fern(x, y, deg, len, curl, k, seed) {
  const s = len * k;
  if (s < 0.05) return "";
  let a = (deg * Math.PI) / 180, px = x, py = y;
  const P = pen(x, y), STEP = 0.5, GAP = 2.4, OUT = 1.05;
  for (let u = 0, node = GAP, i = 0; u < s; u += STEP) {
    const du = Math.min(STEP, s - u);
    a += curl * du * 6; px += Math.cos(a) * du; py += Math.sin(a) * du;
    if (u + du >= node) {
      P.to(px, py);
      // a pair of branches here, one each side: their full length shrinks towards the stem's tip; they've grown as far as the stem has
      for (const side of [1, -1]) {
        const full = (0.3 * (len - node) + 1.6) * (0.75 + 0.5 * rnd(seed * 31 + i * 2 + side)), grown = Math.min(full, (s - node) * 0.8);
        if (grown <= 0.05) continue;
        const b = a + side * OUT;
        // a long branch carries a fine tick on its outer side, half way out, once it has grown past it
        const v = full * 0.5, tk = full > 7 ? Math.min(full * 0.3, (grown - v) * 0.8) : 0;
        if (tk > 0.05) { const qx = px + Math.cos(b) * v, qy = py + Math.sin(b) * v, c = b + side * 0.9; P.to(qx, qy); P.to(qx + Math.cos(c) * tk, qy + Math.sin(c) * tk); P.to(qx, qy); }
        P.to(px + Math.cos(b) * grown, py + Math.sin(b) * grown); P.to(px, py);
      }
      node += GAP; i++;
    }
  }
  P.to(px, py);
  return `<path d="${P.d}" fill="none" stroke="${PAPER}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function frost(t) {
  let ferns = "";
  NUCLEI.forEach(([x, y, t0, stems], i) => {
    const k = track([[t0, 0], [t0 + GROW, 1, "out"]], t);
    if (k > 0) stems.forEach(([deg, len, curl], j) => { ferns += fern(x, y, deg, len, curl, k, i * 10 + j + 1); });
  });
  return `<g clip-path="url(#kh-out)">${ferns}</g>`;
}
// the keyhole's outline (its round top and its tapering slot as one shape)
const KEY_D = "M89.4 134.8A11 11 0 1 1 102.6 134.8L105 154H87Z";
// ferns stay off the keyhole: the body less the keyhole and a margin round it
const KH_OUT = `<clipPath id="kh-out"><path d="M-99 -99H299V299H-99Z M96 112A16 16 0 1 0 96.01 112Z M82 130H110L113 160H79Z" clip-rule="evenodd"/></clipPath>`;
// rime: fine crystals standing out from the shackle's outer edge, and a thin coat along both its edges
const RIME = (() => {
  const P = [], push = (x, y, nx, ny) => P.push([x + nx * 7.5, y + ny * 7.5, nx, ny]);
  for (let y = 90; y > 62; y -= 2.2) { push(70, y, -1, 0); push(130, y, 1, 0); }
  for (let i = 0; i <= 40; i++) {
    const u = i / 40, w = 1 - u, x = w * w * w * 70 + 3 * w * w * u * 70 + 3 * w * u * u * 130 + u * u * u * 130, y = w * w * w * 62 + 3 * w * w * u * 22 + 3 * w * u * u * 22 + u * u * u * 62;
    const dx = 6 * w * u * 60, dy = 3 * w * w * -40 + 3 * u * u * 40, L = Math.hypot(dx, dy);
    push(x, y, dy / L, -dx / L);
  }
  return P;
})();
function rime(t) {
  const k = track([[0.3, 0], [2.0, 1, "out"]], t);
  if (k <= 0) return { coat: "", needles: "" };
  const coat = `<path d="M70 99V62C70 22 130 22 130 62V99" fill="none" stroke="${PAPER}" stroke-width="${n2(13.6 + 3.8 * k)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  let d = "";
  RIME.forEach(([x, y, nx, ny], i) => {
    if (i % 2) return;
    // more on the top of the curve (it faces the open air), each its own length and lean
    const top = Math.max(0, -ny), full = (1.4 + 2.4 * rnd(i + 50)) * (0.55 + 0.6 * top), len = full * track([[0.08 * rnd(i + 90), 0], [1, 1, "out"]], k);
    if (len < 0.05) return;
    const lean = (rnd(i + 70) - 0.5) * 0.8, c = Math.cos(lean), s = Math.sin(lean), ex = nx * c - ny * s, ey = nx * s + ny * c;
    d += `M${f1(x)} ${f1(y)}l${f1(ex * len)} ${f1(ey * len)}`.replace(/ -/g, "-");
  });
  return { coat, needles: d ? `<path d="${d}" fill="none" stroke="${PAPER}" stroke-width=".9"/>` : "" };
}
// the glaze over the keyhole: a clear sheet of ice closing in from the rim (a band thickening inward, kept to the hole, one paint at a
// low opacity so the dark hole shows through), fine needles of ice growing in from the rim across it, and a crisp line where the ice
// meets the metal
const KEY_PTS = (() => {
  const P = [];
  for (let i = 0; i <= 12; i++) { const a = ((126.9 + (286.2 * i) / 12) * Math.PI) / 180; P.push([96 + 11 * Math.cos(a), 126 + 11 * Math.sin(a)]); }
  for (let i = 1; i <= 4; i++) P.push([102.6 + (2.4 * i) / 4, 134.8 + (19.2 * i) / 4]);
  for (let i = 1; i <= 3; i++) P.push([105 - (18 * i) / 4, 154]);
  for (let i = 0; i < 4; i++) P.push([87 + (2.4 * i) / 4, 154 - (19.2 * i) / 4]);
  return P;
})();
function glaze(t) {
  const k = track([[1.25, 0], [2.3, 1, "io"]], t);
  if (k <= 0) return "";
  const sheet = `<g opacity=".3"><path d="${KEY_D}" fill="none" stroke="${PAPER}" stroke-width="${n2(24 * k)}" stroke-linejoin="round" clip-path="url(#kh)"/></g>`;
  let needles = "";
  KEY_PTS.forEach(([x, y], i) => {
    const toC = Math.atan2(138 - y, 96 - x) + (rnd(i + 200) - 0.5) * 0.7, dist = Math.hypot(96 - x, 138 - y), len = dist * (0.45 + 0.4 * rnd(i + 230)) * k;
    if (len > 0.05) needles += `M${f1(x)} ${f1(y)}l${f1(Math.cos(toC) * len)} ${f1(Math.sin(toC) * len)}`.replace(/ -/g, "-");
  });
  return `<clipPath id="kh"><path d="${KEY_D}"/></clipPath>${sheet}`
    + (needles ? `<g opacity=".7" clip-path="url(#kh)"><path d="${needles}" fill="none" stroke="${PAPER}" stroke-width=".7"/></g>` : "")
    + `<path d="${KEY_D}" fill="none" stroke="${PAPER}" stroke-width="${n2(1.3 * k)}" stroke-linejoin="round" opacity=".85"/>`;
}
const HAPPY_DUR = 2.3 + 0.7;
function happy(t) {
  if (t <= 0) return STILL;
  const r = rime(t);
  return `${OPEN}${WALL}${SHADOW}${r.coat}${shackle(0)}${r.needles}${KH_OUT}${BODY(frost(t))}${KEYHOLE}${glaze(t)}</svg>`;
}

// ---- sad: the shackle's travel: the latch slips (a creep of a hair), then the spring throws it up against its stop, 14 up; it bounces
// back off the stop and the spring brings it home there.
const T_SNAP = 0.62, T_STOP = 0.67;
const SAD_DUR = Math.round((T_STOP + 0.3 + 0.7) * 100) / 100;
function sad(t) {
  if (t <= 0) return STILL;
  const L = track([[0.2, 0], [0.42, 1.2, "io"], [T_SNAP, 1.2], [T_STOP, 14, "in"], [T_STOP + 0.06, 12.4, "out"], [T_STOP + 0.13, 14, "in"], [T_STOP + 0.18, 13.6, "out"], [T_STOP + 0.24, 14, "in"]], t);
  return `${OPEN}${WALL}${SHADOW}${shackle(L)}${BODY()}${KEYHOLE}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
