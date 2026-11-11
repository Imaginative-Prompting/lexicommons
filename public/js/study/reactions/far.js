// Far's two stories, the road's. Sad: the day runs out. The sun goes down the sky to the right and sets behind the right hill; the sky deepens
// from day through orange to a violet dusk, the hills go dark against it and the land a shade down, and the road still runs on to the
// horizon: too far to reach before dark.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky, the land from the horizon (y 96), the two hills on it, the
// road to its vanishing point, its dashes, the sun (r 17 at 132, 62; clear of the right hill, whose top there is at 83, so it can go behind).
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M-5 96H205V205H-5Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M-5 96C40 76 70 80 96 96ZM110 96C140 74 170 72 205 90V96Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M100 96 104 96 180 205H20Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M102 110V118M102 128V140M102 154V174M101 188V205\" fill=\"none\" stroke=\"var(--art-paper,#FBF7EC)\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"132\" cy=\"62\" r=\"17\" fill=\"var(--art-paper,#FBF7EC)\"/>\n</svg>\n";
export const STILL_HASH = "036690b2fc";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 6 || !EL[5].includes('cx="132" cy="62" r="17"')) throw new Error("far: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const [SKY, LAND, HILLS, ROAD, DASHES] = EL;
const dOf = (svg) => /d="([^"]+)"/.exec(svg)[1];
const over = (svg, k) => (k <= 0 ? "" : k >= 1 ? svg : `<g opacity="${n4(k)}">${svg}</g>`);
const sun = (x, y, tone) => `<circle cx="${n2(x)}" cy="${n2(y)}" r="17" ${fill(tone)}/>`;

// ---- sad: the sun sets
const SAD_DUR = 2.7;
function sad(t) {
  if (t <= 0) return STILL;
  // down and to the right along its arc, slowing as it nears the hill (a sunset's last minutes are the slow ones, here in time-lapse)
  const u = track([[0.2, 0], [1.9, 1, "io"]], t);
  const x = 132 + 27 * u, y = 62 + 40 * u - 6 * Math.sin(Math.PI * u);
  // the sun reddening as it goes low; the sky through orange to violet; the hills to silhouettes, the land a shade down
  const red = track([[0.6, 0], [1.6, 1, "io"]], t), dusk = track([[0.5, 0], [1.4, 1, "io"]], t), late = track([[1.3, 0], [2.4, 1, "io"]], t);
  const sky = SKY + over(`<rect width="200" height="200" ${fill("clay-lit")}/>`, dusk) + over(`<rect width="200" height="200" ${fill("violet-lit")}/>`, late);
  const disc = sun(x, y, "paper") + over(sun(x, y, "sun-lit"), red);
  const land = LAND + over(`<path d="${dOf(LAND)}" ${fill("teal-deep")}/>`, late);
  const hills = HILLS + over(`<path d="${dOf(HILLS)}" ${fill("ink-lit")}/>`, late);
  return `${OPEN}${sky}${disc}${land}${hills}${ROAD}${DASHES}</svg>`;
}

// ---- happy: the camera climbs, a drone's slow rise, tipping down as it goes, and the country past the crest comes into view
// The still in 3D: a camera 10 up (focal 200, eye level at y 96, x 102 straight ahead); the road (x -7.52 to 7.16) climbs 0.8° to a crest
// 714 ahead, at eye level, where it is the still's 4 across; the two hills stand on the crest. Past it (hidden from so low) the land falls to
// a wide plain 40 down and runs on to a mountain range 20000 off, the road straight across it into their pass. Farther land is lighter.
const FOC = 200, PX = 102, PY = 96, EYE0 = 10, CREST = 714, SLOPE = (96 - 93.2) / FOC;
// (the road's edges read off the still's corners at its foot, on the climbing ground)
const FOOT_Z = (FOC * EYE0) / (205 - (PY - FOC * SLOPE)), ROAD_L = ((20 - PX) * FOOT_Z) / FOC, ROAD_R = ((180 - PX) * FOOT_Z) / FOC, PLAIN_Y = -40, PLAIN_AT = 1200, RANGE_AT = 20000;
const groundY = (z) => (z <= CREST ? z * SLOPE : z <= PLAIN_AT ? CREST * SLOPE + ((PLAIN_Y - CREST * SLOPE) * (z - CREST)) / (PLAIN_AT - CREST) : PLAIN_Y);
function view(h, pitch) {
  const c = Math.cos(pitch), s = Math.sin(pitch);
  return ([X, Y, Z]) => { const zc = (Y - h) * -s + Z * c, u = (Y - h) * c + Z * s; return [PX + (FOC * X) / zc, PY - (FOC * u) / zc]; };
}
const poly = (P, tone) => `<polygon points="${P.map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ")}" ${fill(tone)}/>`;
// a stretch of ground from z0 to z1, x0 to x1 (null: as wide as the picture can see there), along the terrain
const strip = (P, x0, x1, z0, z1, n = 8) => {
  const zs = Array.from({ length: n + 1 }, (_, i) => z0 + ((z1 - z0) * i) / n);
  const L = (z) => (x0 === null ? -2.5 * z : x0), R = (z) => (x1 === null ? 2.5 * z : x1);
  return [...zs.map((z) => P([L(z), groundY(z), z])), ...zs.slice().reverse().map((z) => P([R(z), groundY(z), z]))];
};
// the hills: the still's outlines read back onto the crest, as heights above it; each a mound running 250 either side of the crest
const HILL_D = dOf(HILLS).split(/(?=M)/);
const sample = (d) => {
  const n = d.match(/-?\d*\.?\d+/g).map(Number), P = [];
  // M x y C x y x y x y [H/V…]: walk the cubic, then whatever closes it
  const start = [n[0], n[1]], c = [[n[2], n[3]], [n[4], n[5]], [n[6], n[7]]];
  for (let i = 0; i <= 24; i++) { const t = i / 24, u = 1 - t; P.push([0, 1].map((j) => u * u * u * start[j] + 3 * u * u * t * c[0][j] + 3 * u * t * t * c[1][j] + t * t * t * c[2][j])); }
  return P;
};
const HILL_TOPS = HILL_D.map(sample);
const HILL_HALF = 260;
const HILL_MAX = Math.max(...HILL_TOPS.flat().map(([, y]) => ((PY - y) * CREST) / FOC));
// a hill as a mound on the crest: at each place across, its height there, running back and forth from the crest as far as it's tall (so its
// foot rounds off at its ends), a smooth bump. Seen: its near slope (in its own shade, the sun being beyond it) from its near foot up to
// its crest, and from higher up its far slope too (lit, the land's own color), up to whatever of it shows highest
function hill(i, P) {
  const cols = HILL_TOPS[i].map(([x, y]) => {
    const X = ((x - PX) * CREST) / FOC, H = Math.max(0, ((PY - y) * CREST) / FOC), D = HILL_HALF * (0.25 + 0.75 * Math.sqrt(H / HILL_MAX));
    const at = (z) => { const b = Math.abs(z - CREST) < D ? Math.cos(((z - CREST) / D) * (Math.PI / 2)) ** 2 : 0; return P([X, groundY(z) + H * b, z]); };
    let top = null;
    for (let k = 0; k <= 16; k++) { const q = at(CREST - D + (2 * D * k) / 16); if (!top || q[1] < top[1]) top = q; }
    return { foot: at(CREST - D), crest: at(CREST), top };
  });
  const near = [...cols.map((c) => c.crest), ...cols.map((c) => c.foot).reverse()];
  const whole = [...cols.map((c) => c.top), ...cols.map((c) => c.foot).reverse()];
  return { near, whole };
}
// the mountains: a range 20000 off, a pass where the road goes (nothing there above eye level, as the still has it), rising either side
// no higher, seen from the still's eye, than seven tenths of the hills in front of them (so the still hides them)
const hillAbove = (x) => { let m = 0; for (const T of HILL_TOPS) for (let i = 1; i < T.length; i++) { const a = T[i - 1], b = T[i]; if ((x - a[0]) * (x - b[0]) <= 0 && a[0] !== b[0]) m = Math.max(m, PY - (a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]))); } return m; };
const RANGE = Array.from({ length: 81 }, (_, i) => {
  const x = -10 + (220 * i) / 80, X = ((x - PX) * RANGE_AT) / FOC;
  const want = Math.max(0, 0.7 * hillAbove(x) * (1 + 0.18 * Math.sin(i * 0.85) * Math.sin(i * 0.3)) - 1.5), Y = EYE0 + (want * RANGE_AT) / FOC;
  return [X, Math.max(PLAIN_Y, Y), RANGE_AT];
});
function country(h, pitch) {
  const P = view(h, pitch), far = 1e7;
  // the far plain, banded lighter with distance; the range; the slope down from the crest
  // (each piece laid a little under the next, so no seam of what's behind shows between them)
  const bands = [[PLAIN_AT - 20, 5050, "teal"], [5000, RANGE_AT, "teal-lit"]].map(([a, b, tone]) => poly(strip(P, null, null, a, b, 2), tone)).join("");
  const range = poly([P([-2.5 * RANGE_AT, PLAIN_Y, RANGE_AT]), ...RANGE.map(P), P([2.5 * RANGE_AT, PLAIN_Y, RANGE_AT])], "sky-lit");
  const slope = poly(strip(P, null, null, CREST - 3, PLAIN_AT + 20, 6), "teal");
  const road = poly(strip(P, ROAD_L, ROAD_R, CREST, 5000, 12), "ink") + poly(strip(P, ROAD_L, ROAD_R, 5000, RANGE_AT, 4), "ink-lit");
  // the near land, up to the crest, and its road (the road's far end at the crest, the still's 4 across)
  // (the land is all the camera sees below the crest line: that line, then down past the frame's foot)
  const crest = [P([-2.5 * CREST, groundY(CREST), CREST]), P([2.5 * CREST, groundY(CREST), CREST])];
  const near = poly([crest[0], crest[1], [crest[1][0], 400], [crest[0][0], 400]], "teal") + poly(strip(P, ROAD_L, ROAD_R, 1, CREST, 2), "ink");
  void far;
  return { P, back: range + bands + slope + road, near };
}
// the still's dashes, painted on the near road
// (where they lie: each end's depth read back from the still's y on the climbing road, and its x)
const DASH_Y = [[110, 118, 102], [128, 140, 102], [154, 174, 102], [188, 205, 101]];
const DASH_Z = DASH_Y.map(([a, b, x]) => { const za = (FOC * EYE0) / (a - (PY - FOC * SLOPE)), zb = (FOC * EYE0) / (b - (PY - FOC * SLOPE)); return [za, zb, ((x - PX) * za) / FOC, ((x - PX) * zb) / FOC]; });
const dashes = (P) => `<path d="${DASH_Z.map(([a, b, xa, xb]) => { const p = P([xa, groundY(a), a]), q = P([xb, groundY(b), b]); return `M${n2(p[0])} ${n2(p[1])}L${n2(q[0])} ${n2(q[1])}`; }).join("")}" fill="none" stroke="${/stroke="([^"]+)"/.exec(DASHES)[1]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
// the still's hills handed over to the mound's own outline as the climb starts (the still draws a hill's foot on the crest line; seen from
// the still's eye a mound's near slope shows a little below it), outlines paired up evenly along them
const clockwise = (P) => (P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + (q[0] - p[0]) * (q[1] + p[1]); }, 0) < 0 ? P : P.slice().reverse());
function even(P, n) {
  P = clockwise(P);
  const i0 = P.reduce((m, p, i) => (p[0] < P[m][0] ? i : m), 0), Q = [...P.slice(i0), ...P.slice(0, i0)], L = [];
  let tot = 0;
  for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length]; L.push(Math.hypot(b[0] - a[0], b[1] - a[1])); tot += L[i]; }
  return Array.from({ length: n }, (_, k) => { let d = (k / n) * tot, i = 0; while (d > L[i] && i < L.length - 1) { d -= L[i]; i++; } const a = Q[i], b = Q[(i + 1) % Q.length], f = L[i] ? Math.min(1, d / L[i]) : 0; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; });
}
const STILL_HILLS = HILL_TOPS.map((T) => [...T, [T[T.length - 1][0], PY], [T[0][0], PY]]);
const HAPPY_DUR = 3.0;
function happy(t) {
  if (t <= 0) return STILL;
  const u = track([[0.2, 0], [2.5, 1, "io"]], t), h = EYE0 + 200 * u, pitch = 13 * DEG * u;
  const { P, back, near } = country(h, pitch);
  const w = track([[0.2, 0], [0.75, 1, "io"]], t);
  const hills = [0, 1].map((i) => {
    const m = hill(i, P), A = even(STILL_HILLS[i], 72), mixed = (Q) => { const B = even(Q, 72); return A.map((p, k) => [p[0] + (B[k][0] - p[0]) * w, p[1] + (B[k][1] - p[1]) * w]); };
    return poly(mixed(m.whole), "teal") + poly(mixed(m.near), "teal-deep");
  }).join("");
  const s = P([((132 - PX) * 1e7) / FOC, EYE0 + ((PY - 62) * 1e7) / FOC, 1e7]);
  return `${OPEN}${SKY}${sun(s[0], s[1], "paper")}${back}${near}${dashes(P)}${hills}</svg>`;
}
const DEG = Math.PI / 180;

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
