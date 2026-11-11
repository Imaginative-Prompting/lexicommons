// Against's two stories: the ladder's feet start to creep out over the floor and its top to scrape down the bricks. Happy: the feet catch: a
// small jolt, and it stands, a touch lower, still against the wall. Sad: they don't: the slip runs away, the top drops down the wall, comes off
// it, and the ladder slaps down flat on the floor, out over the frame's foot, the bricks bare where it stood.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><rect x=\"0\" y=\"20\" width=\"200\" height=\"146\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M0 20h200v2H0zM0 36h200v2H0zM0 52h200v2H0zM0 68h200v2H0zM0 84h200v2H0zM0 100h200v2H0zM0 116h200v2H0zM0 132h200v2H0zM0 148h200v2H0zM13 22h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zM31 38h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zM13 54h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zM31 70h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zM13 86h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zM31 102h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zM13 118h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zM31 134h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zM13 150h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2zm36 0h2v14h-2z\" fill=\"var(--art-paper,#FBF7EC)\"/><rect x=\"0\" y=\"164\" width=\"200\" height=\"36\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M67 24h8L101 164h-8zM103 24h8L137 164h-8zM76.9 56h36l1.2 6h-36zM81.6 81h36l1.1 6h-36zM86.4 107h36l1.1 6h-36zM91.1 132h36l1.1 6h-36zM95.7 157h36l1.1 6h-36z\" fill=\"var(--art-clay-deeper,#9C4219)\"/><path d=\"M69.2 36h8l.4 2h-8zM105.2 36h8l.4 2h-8zM72.2 52h8l.4 2h-8zM108.2 52h8l.4 2h-8zM75.2 68h8l.4 2h-8zM111.2 68h8l.4 2h-8zM78.1 84h44l.4 2h-44zM81.1 100h8l.4 2h-8zM117.1 100h8l.4 2h-8zM84.1 116h8l.4 2h-8zM120.1 116h8l.4 2h-8zM87.1 132h44l.4 2h-44zM90 148h8l.4 2h-8zM126 148h8l.4 2h-8zM85 56h2v6h-2zM103 81h2v3h-2zM85 86h2v14h-2zM121 86h2v14h-2zM103 107h2v6h-2zM85 118h2v13.7L85 120.9zM121 118h2v13.7L121 120.9zM103 134h2v4h-2zM121 157h2v6h-2z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M23.5 187h9.6L101 164h-8zM59.5 187h9.6L137 164h-8z\" fill=\"var(--art-teal-deep,#25907B)\"/><polygon points=\"71,24 74,26.5 33.1,187 29.5,187\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"65,24 71,24 29.5,187 23.5,187\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"107,24 110,26.5 69.1,187 65.5,187\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"65.1,47 98.1,47 96.6,53 63.6,53\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"64.3,50.5 97.3,50.5 96.6,53 63.6,53\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"58.5,73 91.5,73 90,79 57,79\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"57.6,76.5 90.6,76.5 90,79 57,79\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"51.9,99 84.9,99 83.4,105 50.4,105\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"51,102.5 84,102.5 83.4,105 50.4,105\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"45.3,125 78.3,125 76.8,131 43.8,131\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"44.4,128.5 77.4,128.5 76.8,131 43.8,131\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"38.7,151 71.7,151 70.1,157 37.1,157\" fill=\"var(--art-wood,#DCA063)\"/><polygon points=\"37.8,154.5 70.8,154.5 70.1,157 37.1,157\" fill=\"var(--art-wood-deep,#B97F45)\"/><polygon points=\"101,24 107,24 65.5,187 59.5,187\" fill=\"var(--art-wood,#DCA063)\"/></svg>\n";
export const STILL_HASH = "144336fc2e";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 21) throw new Error("against: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const ROOM = EL.slice(0, 4).join(""); // the sky, the wall, its mortar, the floor
const MORTAR_D = EL[2].match(/ d="([^"]+)"/)[1], WALL_SHADOW_D = EL[4].match(/ d="([^"]+)"/)[1];
const LADDER = EL.slice(7).join("");

// ---- the ladder, as the still draws it: an oblique view, depth coming towards us down and to the left (0.437 across and 0.242 down a unit),
// the wall's foot at y 164. Its left rail's left edge runs from its foot (23.5, 187), 95 out from the wall, to its top (65, 24), 140 up.
const CX = 0.437, CY = 0.242, BASE = 164;
const L = Math.hypot(95, 140), THETA0 = Math.atan2(140, 95);
const screen = (x, depth, h) => [x - CX * depth, BASE - h + CY * depth];
/** The matrix that carries the still's ladder to the ladder with its foot `foot` out from the wall and leaning at `theta` from the floor. */
function ladderAt(theta, foot) {
  const q0 = screen(65, foot, 0), q2 = screen(65, foot - L * Math.cos(theta), L * Math.sin(theta));
  // x' = x + c y + e, y' = d y + f: across the ladder nothing changes; (23.5, 187) goes to q0 and (65, 24) to q2
  const dx = q2[0] - q0[0], dy = q2[1] - q0[1];
  const c = (41.5 - dx) / 163, d = -dy / 163;
  return { m: [1, 0, c, d, q0[0] - 23.5 - c * 187, q0[1] - d * 187], q0, q2 };
}

// ---- how it slides, worked out once, as a rod on a slippery wall and floor. While its top is on the wall, θ'' = −(3g/2L) cos θ; friction
// holds back the start (the creep: the pull it can't resist grows as the feet begin to move). The top leaves the wall at two thirds of the height
// it started from; from then the floor alone holds it: its middle keeps the speed it had away from the wall, and it turns as a rod whose foot
// slides, θ'' (L²/12 + L²/4 cos²θ) = −(L/2) cos θ (g − (L/2) sin θ θ'²), so its top end lands a little out from the wall. It slaps down with a small
// bounce, and the floor's friction stops its slide.
const W2 = 13; // 3g/2L, per second squared: a ladder this long (about 0.8 m) falls in about two thirds of a second
const G = (2 * L * W2) / 3, CREEP = 0.5;
const FALL = (() => {
  const out = [], dt = 1 / 6000, H0 = Math.sin(THETA0);
  let t = 0, th = THETA0, w = 0, step = 0, mid = null, v = 0;
  for (;;) {
    const foot = mid === null ? L * Math.cos(th) : mid + (L / 2) * Math.cos(th);
    if (step++ % 10 === 0) out.push([t, th, foot]);
    if (th <= 0) return { table: out, landed: t, foot, slide: v };
    if (mid === null) {
      const pull = Math.min(1, 0.06 + 0.94 * (t / CREEP) ** 2);
      w += -W2 * pull * Math.cos(th) * dt;
    } else {
      const c = Math.cos(th), sn = Math.sin(th);
      w += ((-(L / 2) * c * (G - (L / 2) * sn * w * w)) / ((L * L) / 12 + ((L * L) / 4) * c * c)) * dt;
      mid += v * dt;
    }
    th = Math.max(0, th + w * dt); t += dt;
    if (mid === null && Math.sin(th) <= (2 / 3) * H0) { mid = (L / 2) * Math.cos(th); v = -(L / 2) * Math.sin(th) * w; }
  }
})();
const STOP = 0.16;
function fallAt(t) {
  const T = FALL.table;
  if (t >= FALL.landed) {
    // the slap (its top end lifts a hair off the floor and drops back), while the floor's friction brings its slide to a stop
    const s = t - FALL.landed, r = Math.min(s, STOP);
    const lift = Math.max(0, track([[0, 0], [0.07, 0.035, "out"], [0.15, 0, "in"], [0.2, 0.008, "out"], [0.25, 0, "in"]], s));
    return [lift, FALL.foot + FALL.slide * (r - (r * r) / (2 * STOP))];
  }
  const i = Math.min(T.length - 2, Math.floor(t * 600)), a = T[i], b = T[i + 1], u = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
  return [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

// ---- its shadow, as the still draws it (not one light's: its rails fall steeply and its rungs as bands, so it isn't worked out again): the
// wall's part rides down with the ladder's top, so it slides down the bricks and under the floor's edge; the floor's part runs from the feet
// to where the rails' shadows meet the floor, and once the ladder's down, closes in to a sliver along each rail.
const WALL_SHADE = `<rect x="0" y="0" width="200" height="${BASE}" ${fill("clay-deeper")}/><path d="${MORTAR_D}" ${fill("clay-deep")}/>`;
function wallShadow(drop) {
  if (drop >= BASE - 24) return "";
  const at = drop ? ` transform="translate(0 ${n2(drop)})"` : "";
  return `<clipPath id="wall"><rect x="0" y="0" width="200" height="${BASE}"/></clipPath><clipPath id="ws"><path d="${WALL_SHADOW_D}"${at}/></clipPath><g clip-path="url(#wall)"><g clip-path="url(#ws)">${WALL_SHADE}</g></g>`;
}
// each rail's: its foot (from its left edge, 9.6 wide) and where its wall shadow meets the floor (8 wide); the rails' wall shadows slant 26 across
// for 140 down, so sliding down d moves that meeting 0.186 d to the left
const RAILS = [{ u: 0, meet: 93 }, { u: 36, meet: 129 }];
function floorShadow(lad, drop, down) {
  return RAILS.map(({ u, meet }) => {
    const foot = [lad.q0[0] + u, lad.q0[1]], top = [lad.q2[0] + u, lad.q2[1]];
    const m = meet - 0.186 * drop;
    // down: 0 while the top is high, 1 lying (the sliver: 2 wide, beside the rail's right side, from its foot to its top end)
    const lerp = (a, b) => a + (b - a) * down;
    const pts = [[foot[0], foot[1]], [foot[0] + 9.6, foot[1]], [lerp(m + 8, top[0] + 11.5), lerp(BASE, top[1] - 0.4)], [lerp(m, top[0] + 9.6), lerp(BASE, top[1])]];
    if (down > 0) { pts[0] = [lerp(foot[0], foot[0] + 9.6), foot[1]]; pts[1] = [lerp(foot[0] + 9.6, foot[0] + 11.5), lerp(foot[1], foot[1] - 0.4)]; }
    return `<path d="M${pts.map(([x, y]) => `${n2(x)} ${n2(y)}`).join("L")}Z" ${fill("teal-deep")}/>`;
  }).join("");
}
function scene(theta, foot, down) {
  const lad = ladderAt(theta, foot);
  const drop = 140 - L * Math.sin(theta) + CY * (foot - L * Math.cos(theta));
  const [a, b, c, d, e, f] = lad.m;
  const ladder = `<g transform="matrix(${a} ${b} ${n4(c)} ${n4(d)} ${n2(e)} ${n2(f)})">${LADDER}</g>`;
  return `${OPEN}${ROOM}${wallShadow(Math.max(0, drop))}${floorShadow(lad, Math.max(0, drop), down)}${ladder}</svg>`;
}

// ---- happy. The same creep, and then the feet bite: it stops 3.5° lower with a jolt (a touch past, and back), and stands.
const CATCH = 0.62;
const HAPPY_DUR = CATCH + 0.2 + 0.7;
function happy(t) {
  if (t <= 0) return STILL;
  const slip = (3.5 * Math.PI) / 180;
  const k = track([[0.08, 0], [CATCH, 1, "in"], [CATCH + 0.06, 1.07, "out"], [CATCH + 0.18, 1, "io"]], t);
  const th = THETA0 - slip * k;
  return scene(th, L * Math.cos(th), 0);
}

// ---- sad. It runs away, comes off the wall, and lies down.
const SAD_DUR = FALL.landed + 0.25 + 0.7;
function sad(t) {
  if (t <= 0) return STILL;
  const [th, foot] = fallAt(t);
  const down = Math.max(0, Math.min(1, 1 - th / (THETA0 * 0.55)));
  return scene(th, foot, down);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
