// Fire's two stories, the wood's own: there's a pocket of pitch under the upper log's bark, and the heat boils it; a seam opens along the log, amber.
// Happy: the fire takes the pitch: the flame widens and puts up a second tongue over the seam: a broad, forked fire. Sad: the pocket spits instead: a
// burning glob arcs out over the stones and lands on the bare ground outside the ring, a small stray fire burning there in its sticky pool.
// Every frame is a pure function of t, in seconds. The still's own parts: the sky, the ground and shadow, the ring's dark floor, the back stones, the
// flame (its outer orange and shade, its middle and shade, its pale core), the two crossed logs (the upper one from (53, 152) up to (126, 122)), the
// front stones. The ring is about a meter across: 130 to the meter.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect x=\"0\" y=\"142\" width=\"200\" height=\"58\" fill=\"var(--art-violet-lit,#A68CFF)\"/><path d=\"M36 166L172 148L200 162L200 200L100 200Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><ellipse cx=\"98\" cy=\"143\" rx=\"62\" ry=\"22\" fill=\"var(--art-ink-lit,#3A3460)\"/><ellipse cx=\"98\" cy=\"118\" rx=\"12\" ry=\"7\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M98 111A12 7 0 0 1 98 125A6 7 0 0 0 98 111Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><ellipse cx=\"72\" cy=\"121\" rx=\"12\" ry=\"7\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M72 114A12 7 0 0 1 72 128A6 7 0 0 0 72 114Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><ellipse cx=\"124\" cy=\"121\" rx=\"12\" ry=\"7\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M124 114A12 7 0 0 1 124 128A6 7 0 0 0 124 114Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><ellipse cx=\"48\" cy=\"128\" rx=\"12\" ry=\"7\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M48 121A12 7 0 0 1 48 135A6 7 0 0 0 48 121Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><ellipse cx=\"148\" cy=\"128\" rx=\"12\" ry=\"7\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M148 121A12 7 0 0 1 148 135A6 7 0 0 0 148 121Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M64 128C46 112 44 80 74 52C70 60 69 66 71 70C78 56 96 46 92 30C91 24 89 20 86 16C106 26 116 44 112 66C114 62 117 58 119 54C126 66 136 82 136 98C136 112 130 120 124 128Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M86 16C106 26 116 44 112 66C114 62 117 58 119 54C126 66 136 82 136 98C136 112 130 120 124 128L112 128C122 116 124 102 116 90C108 78 104 66 106 52C107 38 98 26 86 16Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M68 130C56 114 54 98 64 82C63 89 64 94 67 96C72 82 90 74 96 56C104 70 100 84 98 92C102 88 104 83 105 78C116 88 124 102 122 114C121 121 120 125 118 130Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M105 78C116 88 124 102 122 114C121 121 120 125 118 130L108 130C114 120 115 106 110 96C107 90 105 84 105 78Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M80 130C74 118 76 108 82 100C86 95 88 91 88 86C96 96 102 106 101 118C101 123 100 127 99 130Z\" fill=\"var(--art-sun-lit,#FAD57E)\"/><path d=\"M66.8 114.5L142.8 142.5L137.2 157.5L61.2 129.5A8 8 0 0 1 66.8 114.5Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M139 152.8L56.1 122.2A8 8 0 0 0 61.2 129.5L137.2 157.5Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M142.8 142.5A5.5 8 20.2 0 1 137.2 157.5A5.5 8 20.2 0 1 142.8 142.5Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M52.8 144.6L122.8 114.6A8 8 0 0 1 129.2 129.4L59.2 159.4Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M57.2 154.8L134 121.9A8 8 0 0 1 129.2 129.4L59.2 159.4Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M52.8 144.6A5.5 8 -23.2 0 0 59.2 159.4A5.5 8 -23.2 0 0 52.8 144.6Z\" fill=\"var(--art-wood,#DCA063)\"/><ellipse cx=\"32\" cy=\"144\" rx=\"12\" ry=\"8.5\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M32 135.5A12 8.5 0 0 1 32 152.5A6 8.5 0 0 0 32 135.5Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><ellipse cx=\"165\" cy=\"145\" rx=\"12\" ry=\"8.5\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M165 136.5A12 8.5 0 0 1 165 153.5A6 8.5 0 0 0 165 136.5Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><ellipse cx=\"42\" cy=\"160\" rx=\"14.5\" ry=\"9\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M42 151A14.5 9 0 0 1 42 169A7.2 9 0 0 0 42 151Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><ellipse cx=\"149\" cy=\"163\" rx=\"14.5\" ry=\"9\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M149 154A14.5 9 0 0 1 149 172A7.2 9 0 0 0 149 154Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><ellipse cx=\"67\" cy=\"168\" rx=\"14.5\" ry=\"9\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M67 159A14.5 9 0 0 1 67 177A7.2 9 0 0 0 67 159Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><ellipse cx=\"123\" cy=\"169\" rx=\"14.5\" ry=\"9\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M123 160A14.5 9 0 0 1 123 178A7.2 9 0 0 0 123 160Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><ellipse cx=\"95\" cy=\"171\" rx=\"14.5\" ry=\"9\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M95 162A14.5 9 0 0 1 95 180A7.2 9 0 0 0 95 162Z\" fill=\"var(--art-steel-deep,#6B687A)\"/></svg>\n";
export const STILL_HASH = "a07cb79186";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 39 || !EL[22].includes("M52.8 144.6L122.8 114.6")) throw new Error("fire: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const BACK = EL.slice(0, 14).join(""), FLAME = EL.slice(14, 19).join(""), LOGS = EL.slice(19, 25).join(""), FRONT = EL.slice(25).join("");
const BASE = [98, 130];
// the flame breathing: a little wider and narrower, its tip leaning, never quite still while it changes (k: how much it's moving)
const flame = (sx, sy, lean, extra = "") => `<g transform="translate(${BASE[0]} ${BASE[1]}) skewX(${n2(lean)}) scale(${n4(sx)} ${n4(sy)}) translate(${-BASE[0]} ${-BASE[1]})">${FLAME}</g>${extra}`;
// the seam along the upper log: where the bark splits and the pitch shows, opening k (a band along the log's top, amber, darker at its lips)
function seam(k) {
  if (k < 0.004) return "";
  const a = [78, 133.5], b = [112, 119], w = 1.6 * k, n = [0.39, 0.92];
  const P = (p, s) => `${n2(p[0] + n[0] * s)} ${n2(p[1] + n[1] * s)}`;
  return `<path d="M${P(a, -w)}L${P(b, -w)}L${P(b, w)}L${P(a, w)}Z" ${fill("sun-deep")}/><path d="M${P(a, -w * 0.4)}L${P(b, -w * 0.4)}L${P(b, w * 0.3)}L${P(a, w * 0.3)}Z" ${fill("sun")}/>`;
}
// a tongue of flame rising from (x, y), h tall: outer orange, its middle, its core
function tongue(x, y, h) {
  if (h < 0.5) return "";
  const k = h / 40, P = (dx, dy) => `${n2(x + dx * k)} ${n2(y + dy * k)}`;
  return `<path d="M${P(-12, 0)}C${P(-20, -16)} ${P(-10, -30)} ${P(2, -40)}C${P(0, -30)} ${P(10, -24)} ${P(12, -14)}C${P(14, -8)} ${P(12, -3)} ${P(10, 0)}Z" ${fill("clay")}/>`
    + `<path d="M${P(-7, 0)}C${P(-12, -10)} ${P(-5, -20)} ${P(2, -26)}C${P(2, -18)} ${P(8, -14)} ${P(8, -6)}L${P(6, 0)}Z" ${fill("sun")}/><path d="M${P(-3, 0)}C${P(-5, -6)} ${P(-1, -11)} ${P(1, -14)}C${P(3, -9)} ${P(4, -5)} ${P(3, 0)}Z" ${fill("sun-lit")}/>`;
}
const opens = (t) => track([[0.35, 0], [0.8, 1, "out"]], t);
const flicker = (t, a) => a * Math.sin(t * 23) * Math.sin(t * 7.3);

// ---- happy: a broad, forked fire
const HAPPY_DUR = 2.4;
function happy(t) {
  if (t <= 0) return STILL;
  // the pitch catches: the flame broadens and a second tongue climbs up over the seam; it settles into its new, bigger shape
  const g = track([[0.7, 0], [1.4, 1.06, "out"], [1.7, 1, "io"]], t), live = t < 1.9 ? Math.min(1, Math.max(0, (t - 0.3) / 0.3)) * (1 - Math.max(0, (t - 1.6) / 0.3)) : 0;
  const sx = 1 + 0.32 * g + flicker(t, 0.025) * live, sy = 1 + 0.1 * g + flicker(t + 1, 0.02) * live;
  return `${OPEN}${BACK}${flame(sx, sy, flicker(t + 2, 3) * live)}${LOGS}${seam(opens(t))}${tongue(114, 124, 34 * g)}${FRONT}</svg>`;
}

// ---- sad: it spits
const SAD_DUR = 2.6, T_SPIT = 0.9, FROM = [108, 121], LAND = [176, 184];
function sad(t) {
  if (t <= 0) return STILL;
  const live = t < 2.1 ? Math.min(1, Math.max(0, (t - 0.3) / 0.3)) * (1 - Math.max(0, (t - 1.8) / 0.3)) : 0;
  const fl = flame(1 + flicker(t, 0.025) * live, 1 + flicker(t + 1, 0.02) * live, flicker(t + 2, 3) * live);
  let glob = "", stray = "";
  if (t > T_SPIT) {
    // the glob: thrown out of the seam in one arc over the front stones, burning as it goes, to the bare ground beyond the ring
    const s = t - T_SPIT, T = 0.42, k = Math.min(1, s / T), x = FROM[0] + (LAND[0] - FROM[0]) * k, y = FROM[1] + (LAND[1] - FROM[1]) * k - 46 * Math.sin(Math.PI * k);
    // (bursting out of the seam: it swells to its size as it comes)
    const gr = Math.min(1, s / 0.06);
    if (k < 1) glob = `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(3.4 * gr)}" ${fill("clay")}/><circle cx="${n2(x - 0.6)}" cy="${n2(y - 0.6)}" r="${n2(1.9 * gr)}" ${fill("sun-lit")}/>`;
    else {
      // landed: it flattens into a sticky pool and burns there: a small fire, flickering, then holding
      const r = s - T, pool = Math.min(1, r / 0.12), h = 24 * Math.min(1, r / 0.35);
      stray = `<ellipse cx="${LAND[0]}" cy="${LAND[1]}" rx="${n2(3.4 + 7.6 * pool)}" ry="${n2(3.4 - 1 * pool)}" ${fill("bark-deep")}/>`
        + `<g transform="translate(${LAND[0]} ${LAND[1]}) skewX(${n2(flicker(t, 6) * (1 - Math.min(1, r / 1.2)))}) translate(${-LAND[0]} ${-LAND[1]})">${tongue(LAND[0], LAND[1], h)}</g>`;
    }
  }
  return `${OPEN}${BACK}${fl}${LOGS}${seam(opens(t))}${FRONT}${stray}${glob}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
