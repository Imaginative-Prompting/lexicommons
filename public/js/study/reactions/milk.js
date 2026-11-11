// The milk's two stories. Happy: the carton tips itself over the glass and pours, the glass fills with a splash, and the carton rights itself. Sad: it's gone off. The carton swells, its top bursts, a lump lands on the glass, and the glass leans away.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths, in the 200-unit view.
import { n2, paint, parsePath, partsOf, runsToD, subdivide, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M149.6 150.7l-.7 4.1 55.5 0 0 36.7-57.3-19.6c-1.5-.5-2.9-2.5-4-3.6 .5-2.7 1.4-11.6 2.5-13.5 .9-1.5 2.7-2.9 4-4.1ZM28.5 151.6l3.5 3.4 .2 16c1 .2 1.9 .4 2.8 .7l88.5 28.3c1.5 .5 3.8 3.4 4.8 4.4l-132.7 0 0-49.6 32.9 0 0-3.2Z\" fill=\"var(--art-teal-lit,#6FD0BD)\" fill-rule=\"evenodd\"/>\n<path d=\"M147.4 164.5l-.8 3.8 57.8 19.7 0 16.4-80 0c-.4-.4-.3-.7-.9-.9l-88.6-28.3c-1-.4-2.1-.6-3.2-.9 2.1-2.1 2.8-3 5.9-2.9l28.2 .2c.1 0 .1 0 .2 0l24.2 .2c2.5 0 12.4-3.1 15.4-4 1.1 1 4.4 5.1 5.2 5.6 4.6 2.8 17.6 2.8 23 2.1 2.3-.3 5.4-.6 7.3-2 1.7-1.2 1.3-3.2 2.2-4.8 .9-1.5 2.8-3 4.1-4.2Z\" fill=\"var(--art-teal-deep,#25907B)\"/>\n<path d=\"M32.3 50.5l55.2 0 3.7 3.7 .1 64.6 0 53c0 .9-.6 1.9-.9 2.7-1.1 0-2.2-.1-3.2 .1-.9 .2-1.7 .7-2.6 .7l-28.2-.3c-4.6 0-9.1-.2-13.7-.2-2.9 0-5.9 .3-8.8-.1-2.7-.3-5.4-2.5-5.4-5.4l.1-113.7c0-.3 0-.6 .1-.8 1.5-1.2 2.4-2.7 3.6-4.3ZM56.7 66.7c-4.4 .4-6.4 3.8-9.6 6.2-2.8 2.2-6.6 2-8.8 3.8-3.2 2.5-4.1 13.4-.8 16.1 1.9 1.4 5.7 1.5 7.5 .1 1.1-.9 1.5-2.4 2.2-3.6 1.7-2.6 4.5-5.2 7.2-6.9 2.4-1.4 7.3-2.1 8.6-4.4 1.5-2.7 1.6-7.6-.7-9.9-1.4-1.3-3.8-1.6-5.6-1.4ZM112.7 93.3l0 3.4c11-.7 21.8-1.1 32.7 .8 4.2 .7 9.7 1.5 11.9 5.6-1.5 2.1-1.5 3.1-1.8 5.7-3.3 1.7-6.7 2.7-10.4 3.5l-4.6 25.3c-1.9 10.8-4.9 25.7-10.9 35-1.4 2.2-3.2 4-5 5.9-1.1 0-2.3-.2-3.4-.1-.7 .1-1.4 .4-2.1 .5-3.5 .1-9.4-1.8-11.8-4.5-.9-1.2-1.4-2.5-1.9-3.9-.9 .3-1.8 .5-2.7 .8-.5-1.2-.8-2.3-1-3.5l-4.5-29.4-4.7-34.3c-.3-1.9 2.1-3.6 3.3-4.7 4.5-4.5 11-5.1 16.9-6.1ZM75.4 94.5c-3.1 .4-3.3 2.6-5 4.8-.8 1.2-1.9 2.1-2.9 3.1-1.3 1.4-2.6 2.7-4.5 3.4-1.6 .7-3.9 .7-5.3 2-2.6 2.3-1.6 9.1 1.2 11.1 4.7 3.3 15.3 3.2 19.3-1.4 2.5-3 3.3-7.9 3.4-11.7 .1-2.6 0-8.9-2.2-10.7-1-.8-2.7-.8-4-.6ZM112.7 98.9l0 3.4-6 1 6 .8 0 3.3c9.8 1.2 29.1 1.1 38.2-2.2 1.4-.6 2.6-1.4 3.8-2.2-1-.7-2-1.5-3.2-2-8.7-3.6-29.2-3.5-38.8-2.1ZM43.3 131.7c-6.3 .8-9.4 6.8-6.9 12.6 1.4 3.1 4.4 5.2 5.6 8.5 1.1 2.8 .5 8.7 2.9 10.5 .8 .6 2 .9 2.9 1 5.8 .8 9.3-3.9 14.5-5.3 2.7-.7 8.6 .2 10.5-1.9 1.8-2.1 1.3-6.9-.6-8.8-2.1-2.2-8.1-2.1-11.1-3.7-2.8-1.6-5.6-4.5-7.5-7-.8-1.1-1.4-2.4-2.3-3.5-1.8-2.2-5.3-2.7-8-2.4Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n<path d=\"M113 48.9l-.3 4.4-21.2 4c-.4-.3-1.5-1.9-2-1.7-.3 .1-.6 .4-.9 .5 0-.8 0-1.5-.3-2.2l-59.3 .1 15.6-22.8c1.9-2.7-1.5-8.3 2.5-11.1 .6-.4 1.5-.8 2.2-.8l47.3 0c2.3 0 3.9 2.3 4.1 4.4 .3 2.3-.4 4.9 .3 7.2 .6 1.7 2.2 3.4 3.2 4.9 2.9 4.4 5.8 8.8 8.8 13.1ZM157 104.1l-9 55.7c-.6 3.8-1 10.9-3 14-4.4 6.8-18.3 5.7-25.4 5.3 1.5-1.1 3-2 4.2-3.4 6.8-7.5 10-22 11.9-31.8l4.1-20.7c.9-4.6 1.7-9.3 2.4-13.9 5.3-.9 10.4-1.9 14.8-5.2Z\" fill=\"var(--art-paper-deep,#DAD1BC)\" fill-rule=\"evenodd\"/>\n<path d=\"M99.8 33l-8.8 20.9 22.6-4.1 0 46.9c-4.1 .5-15.4 2-17.3 6-.6 1.3-.2 2.9 0 4.3l7.6 53.2c.6 3.7 1.2 7.4 1.9 11-4.4 1.3-10.8 3.5-15.1 4.1-1.5 .2-3.1 0-4.6 0 1.1-1.6 1.8-2.9 1.8-4.8l-.1-53 0-63.1c0-.2 .1-.6 .2-.7l11.3-20.3c.1-.2 .3-.2 .5-.4ZM56.6 63.2c7.6-.8 12.7 7.6 10.1 14.2-2.3 6.1-7.9 5.7-12.6 8.7-4.9 3.1-5.2 10.5-11.8 11.2-1.9 .2-3.8-.3-5.5-1.3-7.2-4.5-6-17.1 .2-22 2.8-2.3 6.7-2.1 9.7-4.2 3.4-2.4 5.3-6.1 9.9-6.6ZM75.3 91c7.6-1.2 9.7 7.4 9.8 13.2 .1 9.8-4.3 18.8-14.9 20.3-3.5 .5-7.2 0-10.4-1.6-6.6-3.2-10.1-12.5-3.7-17.8 2.9-2.3 6.9-1.9 9.6-4.4 3.7-3.3 3.5-8.7 9.6-9.7ZM113.6 98.7l0 8.8c-5.3-.3-10.8-.9-15.2-4 4.2-3.6 9.9-4.1 15.2-4.8ZM43.2 128.3c4.5-.6 8.8 1.6 11.3 5.3 1.6 2.2 2.6 4.6 4.8 6.3 5.5 4.4 13.9 1.7 17.2 9.5 .7 1.8 1 3.9 .6 5.8-.4 1.5-1.2 3-2.3 4.1-3.3 3.4-7.9 2.1-12.1 3.1-6.7 1.6-11.7 9.2-19.3 3.6-4.4-3.3-3.1-8.5-4.8-13.1-1.4-3.6-4.7-5.8-6-9.4-2.3-6.8 3.9-14.4 10.6-15.2Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n<ellipse cx=\"126.6\" cy=\"103.1\" rx=\"29\" ry=\"5.9\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M95.9 103.2a30.7 6.8 0 1 0 61.4 0a30.7 6.8 0 1 0-61.4 0ZM98.4 103.1a28.2 5.1 0 1 0 56.4 0a28.2 5.1 0 1 0-56.4 0Z\" fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "9f6fe0f60e";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [TABLE, SHADOW, PAPER, DEEP, INK] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const pr = parsePath(PAPER.d), dr = parsePath(DEEP.d), ir = parsePath(INK.d);
const FRONT = subdivide([pr[0]], 2), GABLE = [dr[0]], SIDE = [ir[0]];
const GLASS = `<path fill="${paint("paper")}" fill-rule="evenodd" d="${runsToD([pr[2], pr[4]])}"/><path fill="${DEEP.fill}" d="${runsToD([dr[1]])}"/><path fill="${INK.fill}" d="${runsToD([ir[3]])}"/>`;
// The still draws the carton's dark side over the glass's left edge by a hair (its cut round the glass isn't exact). The glass is trimmed by that side's own
// shape, a cut that goes with the glass, so at rest it's the still's, and once the carton moves the hair of difference is nothing.
const GLASS_TRIM = `<clipPath id="gs"><path clip-rule="evenodd" d="M-10 -10H210V210H-10Z${runsToD(SIDE)}"/></clipPath>`;
// The glass's mouth, as the still draws it: its inside (an empty glass's own inside, not the wall through it) and the near half of its rim, over whatever
// is in the glass. A glass is the body, its inside, what's in it, then its near rim; what lands on the rim goes over that.
const EXTRA = [...STILL.slice(STILL.indexOf(INK.svg) + INK.svg.length).matchAll(/<(ellipse|path)\b[^>]*\/>/g)].map((m) => m[0]);
const INSIDE = EXTRA.find((e) => e.startsWith("<ellipse")) ?? "", RIM_FRONT = EXTRA.filter((e) => e.startsWith("<path")).join("");
const glass = (inside = "", over = "") => `<g clip-path="url(#gs)">${GLASS}</g>${INSIDE}${inside}${RIM_FRONT}${over}`;
// A run as evenly spaced points, so a spot can become any other shape with the same count.
const N = 34;
function points(run) {
  const fine = [];
  for (const [a, b, c, d] of run.segs) for (let i = 0; i < 24; i++) {
    const u = i / 24, m = 1 - u;
    fine.push([m * m * m * a[0] + 3 * m * m * u * b[0] + 3 * m * u * u * c[0] + u * u * u * d[0], m * m * m * a[1] + 3 * m * m * u * b[1] + 3 * m * u * u * c[1] + u * u * u * d[1]]);
  }
  let len = 0;
  const at = fine.map((q, i) => { if (i) len += Math.hypot(q[0] - fine[i - 1][0], q[1] - fine[i - 1][1]); return len; });
  return Array.from({ length: N }, (_, k) => fine[Math.max(0, at.findIndex((v) => v >= (k / N) * len))]);
}
const SPOTS = [points(ir[1]), points(ir[2]), points(ir[4])];
const mid = (P) => [P.reduce((s, q) => s + q[0], 0) / P.length, P.reduce((s, q) => s + q[1], 0) / P.length];
const lerp = (a, b, k) => a + (b - a) * k;
// A smooth closed curve through points, written to a tenth of a unit without its zeros (kit's blob, compact): a tenth is under a pixel at any size
// the app draws, and a frame must stay under 12 KB.
const tenth = (v) => { let t = String(Math.round(v * 10) / 10); if (t === "-0") t = "0"; return t.replace(/^(-?)0\./, "$1."); };
const nums = (...v) => v.map(tenth).join(" ").replace(/ -/g, "-");
function blobC(P) {
  const n = P.length;
  let d = `M${nums(P[0][0], P[0][1])}`;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], z = P[(i - 1 + n) % n], c = P[(i + 2) % n];
    d += `C${nums(a[0] + (b[0] - z[0]) / 6, a[1] + (b[1] - z[1]) / 6, b[0] - (c[0] - a[0]) / 6, b[1] - (c[1] - a[1]) / 6, b[0], b[1])}`;
  }
  return `${d}Z`;
}
const shape = (P) => blobC(P);
const inkPath = (d) => `<path fill="${paint("ink")}" d="${d}"/>`;

// ---- happy. The carton leans back a touch, then tips over on its front corner until its spout is over the glass, and pours: a stream falling in an arc,
// the glass filling from below its lip, splashing where the stream lands. Then it rights itself, rocking onto its foot; the stream's tail drops in with a
// last splash, and the milk settles just under the rim.
const PIVOT = [113, 175], SPOUT = [100, 22];
// The glass's mouth: its inside's ellipse, as the still draws it (the milk fills inside it).
const HOLE = (() => { const e = INSIDE; const g = (a) => Number(new RegExp(`${a}="([^"]*)"`).exec(e)[1]); return { cx: g("cx"), cy: g("cy"), rx: g("rx"), ry: g("ry") }; })();
// (Tipped 15 degrees on its corner, its spout, the right end of its top ridge, is over the glass's mouth.)
const TIP = [[0.12, 0], [0.24, -3, "io"], [0.5, 16, "io"], [0.58, 14.5, "io"], [1.34, 15], [1.62, -2, "in"], [1.72, 0.8, "out"], [1.8, 0, "io"]];
const POUR = [0.52, 1.44];
const DEPTH = [[0.62, 15], [1.48, 1, "out"]];
const HAPPY_DUR = 2.15;
const turnAbout = ([x, y], deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), dx = x - PIVOT[0], dy = y - PIVOT[1]; return [PIVOT[0] + dx * c - dy * s, PIVOT[1] + dx * s + dy * c]; };
const LAND_X = Math.min(HOLE.cx + HOLE.rx - 6, turnAbout(SPOUT, 15)[0] + 4);
const CARTON = `<path fill="${paint("paper")}" d="${runsToD(FRONT)}"/><path fill="${DEEP.fill}" d="${runsToD(GABLE)}"/>${inkPath(runsToD(SIDE))}${inkPath(runsToD([ir[1], ir[2], ir[4]]))}`;
const drop = (x, y, r) => `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" ${"fill"}="${paint("paper")}"/>`;
// Its spout, opening: the gable's top corner folds out into a lip, with the dark of the carton's inside showing in its mouth. It's opened before it tips:
// a carton can't pour through a shut top.
function spoutOpen(k) {
  if (k <= 0.01) return "";
  const [x, y] = SPOUT, p = (dx, dy) => `${n2(x + dx * k)},${n2(y + dy * k)}`;
  return `<polygon fill="${paint("ink")}" points="${p(-6, 2.5)} ${p(-1, -3)} ${p(3, 1)} ${p(-1, 5)}"/><polygon fill="${DEEP.fill}" points="${p(-1, -3)} ${p(7, -6)} ${p(3, 1)}"/>`;
}
const OPEN_SPOUT = [[0.04, 0], [0.24, 1, "io"]];
// The still's table stops short round the carton's foot; as it tips, the table has to be whole under it (as in sad).
const FLOOR_WHOLE = `<rect x="20" y="150" width="14" height="5" fill="${paint("teal")}"/><rect x="20" y="155" width="140" height="26" fill="${TABLE.fill}"/>`;
// The still's shadow reaches under the carton's foot, where the carton hides it; once the foot lifts, light gets under it. So inside the carton's own
// outline at rest, and on the table only, the table is painted back over the shadow: hidden by the carton at rest, plain lit table once it tips.
const SHADOW_LIFT = `<clipPath id="cf"><path d="${runsToD(FRONT)}"/><path d="${runsToD(SIDE)}"/><path d="${runsToD(GABLE)}"/></clipPath><clipPath id="tb"><rect x="0" y="155" width="200" height="45"/></clipPath>`
  + `${SHADOW.svg}<g clip-path="url(#tb)"><g clip-path="url(#cf)"><rect x="0" y="0" width="200" height="200" fill="${TABLE.fill}"/></g></g>`;
function happy(t) {
  if (t <= 0) return STILL;
  const tip = track(TIP, t), depth = track(DEPTH, t), level = HOLE.cy + depth;
  const whole = CARTON + spoutOpen(track(OPEN_SPOUT, t));
  const carton = tip === 0 ? whole : `<g transform="rotate(${n2(tip)} ${PIVOT[0]} ${PIVOT[1]})">${whole}</g>`;
  // The milk in the glass: its surface, an ellipse as wide as the mouth, seen through the mouth.
  const milk = depth < 15 ? `<clipPath id="mo"><ellipse cx="${HOLE.cx}" cy="${HOLE.cy}" rx="${HOLE.rx}" ry="${HOLE.ry}"/></clipPath><g clip-path="url(#mo)"><ellipse cx="${HOLE.cx}" cy="${n2(level)}" rx="${HOLE.rx}" ry="${HOLE.ry}" ${"fill"}="${paint("paper-mid")}"/></g>` : "";
  // The stream: from the spout, falling in an arc to the milk; it thins and its tail drops away after the pour.
  let stream = "", splash = "";
  // Where the stream lands: under the spout as it pours, the same place after it rights itself.
  const spout = turnAbout(SPOUT, tip), land = [LAND_X, level];
  // (its head leaves the spout as poured milk does, from rest and falling faster, so its first frame is a drop, not a length of stream)
  const head = Math.min(1, (Math.max(0, t - POUR[0]) / 0.22) ** 2), tail = Math.max(0, Math.min(1, (t - POUR[1]) / 0.14));
  if (head > 0 && tail < 1) {
    const at = (u) => [spout[0] + (land[0] - spout[0]) * u, spout[1] + (land[1] - spout[1]) * u * u * 0.6 + (land[1] - spout[1]) * 0.4 * u];
    // (its tail thins to nothing as the last of it drops in)
    const u0 = tail * tail, u1 = head, w = 3.4 * (1 - tail), pts = [];
    for (let k = 0; k <= 8; k++) pts.push(at(u0 + ((u1 - u0) * k) / 8));
    stream = `<path d="M${pts.map((q) => `${n2(q[0])} ${n2(q[1])}`).join("L")}" fill="none" stroke="${paint("paper")}" stroke-width="${n2(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  // Splashes where it lands: drops thrown up that fall back in, one after another while it pours, and a last ring of them when the tail drops in.
  const hits = [];
  for (let k = 0; POUR[0] + 0.1 + k * 0.16 < POUR[1]; k++) hits.push([POUR[0] + 0.1 + k * 0.16, k % 2 ? 1 : -1, 0.8]);
  hits.push([POUR[1] + 0.16, 1, 1.4], [POUR[1] + 0.16, -1, 1.3]);
  for (const [at, side, big] of hits) {
    const q = t - at, life = 0.26 * big;
    if (q <= 0 || q >= life) continue;
    const vx = side * 22 * big, vy = -70 * big, g = (2 * -vy) / life;
    splash += drop(land[0] + vx * q, land[1] + vy * q + 0.5 * g * q * q, 1.5 * big * (1 - 0.4 * q / life));
  }
  // Inside the mouth, the splashes show; over the rim, the glass's front hides what's below it.
  return `${OPEN}${BG}${TABLE.svg}${FLOOR_WHOLE}${SHADOW_LIFT}${carton}${GLASS_TRIM}${glass(milk + stream)}<g clip-path="url(#ab)">${splash}</g><clipPath id="ab"><path d="M0 0H200V${n2(HOLE.cy)}H${HOLE.cx + HOLE.rx}A${HOLE.rx} ${HOLE.ry} 0 0 1 ${HOLE.cx - HOLE.rx} ${HOLE.cy}H0Z"/></clipPath></svg>`;
}

// ---- sad. It swells, twice, each bigger than the last. Its top bursts. A lump comes out, flies, and lands on the glass's mouth, and the blow tips the
// glass up on its far edge and it slides a little; it drops back onto its foot and rocks once. The carton lets its breath out and sags, and the sour
// lump creeps down the glass.
const POP = 1.12, FLY = 0.42, LAND = POP + 0.06 + FLY;
const SWELL = [[0.14, 0], [0.42, 0.42, "io"], [0.56, 0.3, "io"], [0.92, 1, "io"], [POP, 1.1, "in"], [POP + 0.06, 0.42, "out"], [POP + 0.3, -0.34, "io"], [POP + 0.5, -0.22, "io"], [POP + 0.72, -0.28, "io"]];
const SAG = [[POP + 0.1, 0], [POP + 0.5, 1, "io"]];
// (the seam splits open from a line: a burst is quick, but the opening still grows from nothing)
const FLAP = [[POP, 0], [POP + 0.12, 1.12, "io"], [POP + 0.24, 0.92, "io"], [POP + 0.37, 1, "io"]];
// The blow tips the glass up on the far edge of its foot (degrees), and it falls back under its own weight onto its foot, rocking once; it's pushed
// along a little as it goes. A glass can't stay leaning on a flat table, so it ends standing.
const LEAN = [[LAND, 0], [LAND + 0.09, 9, "out"], [LAND + 0.21, 0, "in"], [LAND + 0.26, 1.5, "out"], [LAND + 0.31, 0, "in"]];
const SKID = [[LAND, 0], [LAND + 0.2, 4, "out"]];
const FOOT_EDGE = [151, 177];
// The lump spreads over the mouth as it lands, from its own size, rather than being a dome the width of the glass at once.
const SPREAD = [[LAND, 0], [LAND + 0.08, 1, "out"]];
const SPLAT = [[LAND - 0.01, 0], [LAND + 0.05, 1, "out"], [LAND + 0.18, 0.62, "io"], [LAND + 0.32, 0.8, "io"], [LAND + 0.44, 0.72, "io"]];
const OOZE = [[LAND + 0.2, 0], [LAND + 1.0, 1, "out"]];
const SAD_DUR = LAND + 1.2;
const swellAt = (b, sag) => (x, y) => {
  const v = Math.max(0, Math.min(1, (y - 40) / 135)), k = Math.sin(v * Math.PI), cx = 66;
  const nx = cx + (x - cx) * (1 + 0.24 * b * k), top = 1 - Math.max(0, Math.min(1, (y - 19) / 156));
  // sagging, the whole box leans a little and its top comes down
  return [nx - 7 * sag * top * top, y - 6 * b * top + 15 * sag * top * top];
};
// (traced through as many points as the splat on the glass has, so the lump that lands and the splat it makes are one shape changing)
const LUMP = ((P, n) => {
  const len = P.map((q, i) => Math.hypot(P[(i + 1) % P.length][0] - q[0], P[(i + 1) % P.length][1] - q[1])), all = len.reduce((a, b) => a + b, 0), out = [];
  for (let k = 0, i = 0, run = 0; k < n; k++) {
    const want = (k / n) * all;
    while (run + len[i] < want) run += len[i++];
    const f = (want - run) / len[i], a = P[i], b = P[(i + 1) % P.length];
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
})([[-8, -6], [-1, -9], [7, -7], [10, -1], [7, 6], [0, 8], [-8, 6], [-10, 0]], 17);
const lumpAt = (cx, cy, sx, sy, rot) => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return blobC(LUMP.map((q) => [cx + (q[0] * c - q[1] * s) * sx, cy + (q[0] * s + q[1] * c) * sy]));
};
function sad(t) {
  if (t <= 0) return STILL;
  const b = track(SWELL, t), sag = track(SAG, t), fn = swellAt(b, sag);
  // (no shudder: a carton swelling with gas bulges, it doesn't tremble)
  const jx = 0;
  // the spots ride the carton, and droop when it does
  const spots = SPOTS.map((P, i) => inkPath(shape(P.map((q) => { const p = fn(q[0], q[1]); return [p[0], p[1] + sag * [8, 6, 1.5][i]]; })))).join("");
  const ft = track(FLAP, t);
  // the burst: its top split, an inside showing, the fold thrown back
  // (both are there, shut, from the start: the opening a line along the seam, the fold lying where it lies; the burst opens them)
  const open = t > 0 ? (() => {
    const a = fn(44, 34), c = fn(92, 34), h = fn(68, 22), m = fn(70, 42), sy = (a[1] + c[1]) / 2, o = Math.min(1, ft);
    // every point of the opening comes out from the seam's line by how far it's opened (the seam parts, then gapes)
    const at = (x, y) => `${n2(x)},${n2(sy + (y - sy) * o)}`;
    return `<polygon fill="${paint("ink")}" points="${at(a[0], a[1])} ${at(lerp(a[0], h[0], 0.6), a[1] - 7 * ft)} ${at(h[0], h[1] - 3 * ft)} ${at(lerp(h[0], c[0], 0.5), a[1] - 8 * ft)} ${at(c[0], c[1])} ${at(m[0], m[1])}"/>`;
  })() : "";
  const flap = t > 0 ? (() => {
    const p = fn(46, 34), r = -50 * ft;
    return `<g transform="rotate(${n2(r)} ${n2(p[0])} ${n2(p[1])})"><polygon fill="${DEEP.fill}" points="${n2(p[0])},${n2(p[1])} ${n2(p[0] + 5)},${n2(p[1] - 12)} ${n2(p[0] + 37)},${n2(p[1] - 13)} ${n2(p[0] + 39)},${n2(p[1])}"/></g>`;
  })() : "";
  const whole = [[91, 60], [113.6, 50], [113.6, 70], [113.6, 90], [113.6, 110], [113.6, 130], [113.6, 156], [106, 167], [91, 175]].map((q) => fn(q[0], q[1]));
  const behind = `<polygon fill="${paint("ink")}" points="${whole.map((q) => `${n2(q[0])},${n2(q[1])}`).join(" ")}"/>`;
  const carton = `<g transform="translate(${n2(jx)} 0)">${behind}<path fill="${paint("paper")}" d="${runsToD(FRONT, fn)}"/><path fill="${DEEP.fill}" d="${runsToD(GABLE, fn)}"/>${inkPath(runsToD(SIDE, fn))}${open}${flap}${spots}</g>`;
  // the lump: a slow arc, then it lands on the glass and won't go in
  const lean = track(LEAN, t), skid = track(SKID, t);
  const glassT = `translate(${n2(skid)} 0) rotate(${n2(lean)} ${FOOT_EDGE[0]} ${FOOT_EDGE[1]})`;
  let lump = "", onGlass = "";
  // (it comes out once the top has opened enough to let it, and it's where it lands at the moment it lands)
  const s = t - (POP + 0.06);
  const sour = (d, id) => `<clipPath id="${id}"><path d="${d}"/></clipPath><path fill="${paint("sun-deep")}" d="${d}"/>`;
  if (s > 0 && t < LAND) {
    // (it's pushed out of the burst top, swelling out of the opening over its first frames, not appearing whole above it)
    const k = 1.15 * Math.min(1, s / 0.08);
    const u = s / FLY, x = lerp(70, 133, u), y = lerp(24, 90, u) - 130 * u * (1 - u), d = lumpAt(x, y, k, k, u * 3.4), lit = lumpAt(x - 2.4 * k / 1.15, y - 1.6 * k / 1.15, k, k, u * 3.4);
    lump = `${sour(d, "ml")}<path fill="${paint("sun-lit")}" clip-path="url(#ml)" d="${lit}"/>`;
  } else if (t >= LAND) {
    const sp = track(SPLAT, t), oz = track(OOZE, t), d0 = 8 + 12 * sp, top = 84 - 7 * (1 - sp * 0.4), w = 0.45 + 0.55 * track(SPREAD, t);
    // a dome over the mouth of the glass, its lower edge running down the front in three fingers
    const edge = [[110, 92], [114, 92 + 5 + 18 * oz], [119, 92 + 6 + 18 * oz], [122, 94], [128, 95], [132, 95 + 6 + 9 * oz], [137, 95 + 6 + 9 * oz], [140, 95], [146, 94], [149, 94 + 5 + 26 * oz], [153, 94 + 5 + 26 * oz], [156, 90]];
    const dome = [[150, 83], [139, top - 2], [128, top - 3 - d0 * 0.1], [117, top], [108, 84]];
    const list = [...edge, ...dome].map(([x, y]) => [132 + (x - 132) * w, y]);
    const d = blobC(list), lit = blobC(list.map((q) => [q[0] - 3, q[1] - 1.8]));
    onGlass = `${sour(d, "ml")}<path fill="${paint("sun-lit")}" clip-path="url(#ml)" d="${lit}"/>`;
  }
  // (the still's table stops short round the carton and the glass; they've moved)
  const floor = `<rect x="20" y="150" width="14" height="5" fill="${paint("teal")}"/><rect x="20" y="155" width="140" height="26" fill="${TABLE.fill}"/>`;
  const shade = `<polygon fill="${SHADOW.fill}" points="92,172 128,170 150,182 112,184"${skid ? ` transform="translate(${n2(skid)} 0)"` : ""}/>`;
  return `${OPEN}${BG}${TABLE.svg}${floor}${SHADOW.svg}${shade}${carton}${GLASS_TRIM}<g transform="${glassT}">${glass("", t < LAND ? lump : onGlass)}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export const frame = (name, t) => (name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR)));
