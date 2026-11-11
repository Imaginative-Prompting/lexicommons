// Exactly's two stories, the dart's. Happy: the camera pushes slowly in on the dart's point until the bullseye fills the frame, and the
// target's fine center mark (a hairline cross printed on the bull, too fine to see from where the still looks) shows the point resting
// exactly on its crossing. Sad: the dart's own weight levers it in the board: it sags about its tip, slowly, the hold giving, then
// the tip pulls free and it drops to the floor in front of the target, leaving only the small hole at the dead center.
// Every frame is a pure function of t, in seconds. The still's own parts: the target on its easel, the dart's tip in the dead center at
// (92, 100), its flights up to the left; the floor in front of the target at y 182 where the dart would lie.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect y=\"150\" width=\"200\" height=\"50\" fill=\"var(--art-violet-lit,#A68CFF)\"/><path d=\"M76 168L150 159L170 159.5L200 166L200 200L120 200Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M148 108L156 106L181 158L173 159Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M154 106.5L156 106L181 158L178.6 158.4Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><rect x=\"167\" y=\"156.5\" width=\"18\" height=\"4.5\" rx=\"1.5\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"179\" y=\"156.5\" width=\"6\" height=\"4.5\" rx=\"1.5\" fill=\"var(--art-wood-deep,#B97F45)\"/><ellipse cx=\"100\" cy=\"99.5\" rx=\"63\" ry=\"72\" fill=\"var(--art-paper-deep,#DAD1BC)\"/><ellipse cx=\"92\" cy=\"100\" rx=\"64\" ry=\"72\" fill=\"var(--art-paper,#FBF7EC)\"/><ellipse cx=\"92\" cy=\"100\" rx=\"54\" ry=\"61\" fill=\"var(--art-teal,#37B39B)\"/><ellipse cx=\"92\" cy=\"100\" rx=\"43\" ry=\"49\" fill=\"var(--art-paper,#FBF7EC)\"/><ellipse cx=\"92\" cy=\"100\" rx=\"32\" ry=\"36.5\" fill=\"var(--art-teal,#37B39B)\"/><ellipse cx=\"92\" cy=\"100\" rx=\"16\" ry=\"18\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M62.4 76.4C53.4 78.2 45.2 78.8 39.4 74.8C35.3 72.1 37.6 64.4 43.6 61.6Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M62.4 76.4C62 67.2 60.8 59.2 55.6 54.6C51.9 51.1 45 55 43.6 61.6Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M60.8 75.2C56.9 68.9 51.3 63.1 47.4 60C45.1 58.1 43 59.1 43.6 61.6Z\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"43.5,60.2 70.8,81.9 69.6,83.3 42.3,61.6\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"84.1,95.5 85.9,93.3 92,100\" fill=\"var(--art-steel,#A9B0BF)\"/><path d=\"M87 93.4L84.3 90.4L71.9 80.4L69.8 79.8L67.4 83L68.5 84.8L80.9 94.8L84.6 96.6Z\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"83.3,90.2 72.3,81.6 71.5,82.5 82.5,91.1\" fill=\"var(--art-ink-lit,#3A3460)\"/></svg>\n";
export const STILL_HASH = "80275e5317";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 20 || !EL[17].includes("92,100")) throw new Error("exactly: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
// the target, with its center mark printed on the bull (a hairline cross, 0.22 wide, its across arm narrowed as the target is turned: its
// rings are 64 across to 72 high)
const CROSS = `<rect x="88.44" y="99.89" width="7.12" height="0.22" ${fill("clay-deep")}/><rect x="91.89" y="96" width="0.22" height="8" ${fill("clay-deep")}/>`;
// and where the point goes in, on the crossing: the bull pressed in a shade around it, the hole's dark core (both too small for the still)
const ENTRY = `<ellipse cx="92" cy="100" rx="0.78" ry="0.88" ${fill("sun-deep")}/><ellipse cx="92" cy="100" rx="0.32" ry="0.36" ${fill("ink-lit")}/>`;
const SETTING = EL.slice(0, 13).join("") + CROSS + ENTRY, DART = EL.slice(13).join("");
const TIP = [92, 100], FLOOR = 182;
// the dart's outline (for where it meets the floor)
const OUTLINE = [[92, 100], [84.1, 95.5], [67.4, 83], [62.4, 76.4], [39.4, 74.8], [37.6, 64.4], [43.6, 61.6], [55.6, 54.6], [62.4, 76.4]];
const rot = ([x, y], a, c) => { const cs = Math.cos(a), sn = Math.sin(a); return [c[0] + cs * (x - c[0]) - sn * (y - c[1]), c[1] + sn * (x - c[0]) + cs * (y - c[1])]; };

// ---- sad: levered out by its own weight
const SAD_DUR = 2.4;
const DEG = Math.PI / 180, T_FREE = 1.05, G = 900;
function sad(t) {
  if (t <= 0) return STILL;
  // the sag about the tip: the flights going down, slowly while the board holds it, then more as it gives
  const sag = -track([[0.2, 0], [0.8, 4 * DEG, "in"], [T_FREE, 14 * DEG, "in"]], t);
  let dx = 0, dy = 0, a = sag;
  if (t > T_FREE) {
    // free: falling from the board (from rest, as gravity has it), still turning the way it was, out from the board a little, to the floor
    const tf = t - T_FREE;
    a = -14 * DEG - 70 * DEG * tf;
    dx = -14 * tf;
    const lowest = (aa) => Math.max(...OUTLINE.map((q) => rot(q, aa, TIP)[1]));
    const room = (aa) => FLOOR - lowest(aa);
    dy = 0.5 * G * tf * tf;
    // landing: when its lowest point meets the floor, it comes to lie there, settling flat with a small bounce
    const landT = (() => { let s = 0; while (0.5 * G * s * s < room(-14 * DEG - 70 * DEG * s)) s += 0.002; return s; })();
    if (tf >= landT) {
      const aLand = -14 * DEG - 70 * DEG * landT, k = track([[T_FREE + landT, 0], [T_FREE + landT + 0.16, 1, "out"]], t);
      a = aLand + (-34 * DEG - aLand) * k;
      dx = -14 * landT - 4 * k;
      dy = room(a) - track([[T_FREE + landT + 0.16, 0], [T_FREE + landT + 0.24, 1.2, "out"], [T_FREE + landT + 0.32, 0, "in"]], t);
    }
  }
  // the hole it leaves, uncovered as the tip comes out
  const hole = t > T_FREE ? `<ellipse cx="92" cy="100" rx="1.3" ry="1.5" ${fill("ink")} opacity="${n4(Math.min(1, (t - T_FREE) / 0.06))}"/>` : "";
  return `${OPEN}${SETTING}${hole}<g transform="translate(${n2(dx)} ${n2(dy)}) rotate(${n2(a / DEG)} ${TIP[0]} ${TIP[1]})">${DART}</g></svg>`;
}

// ---- happy: the push in, slowing as it comes, settling with the point in the middle of the frame
const HAPPY_DUR = 2.6, Z_END = 7;
function happy(t) {
  if (t <= 0) return STILL;
  // (zooming evenly is moving in by equal steps of scale, so the push runs on the scale's log)
  const u = track([[0.2, 0], [2.2, 1, "io"]], t), z = Math.exp(Math.log(Z_END) * u), cx = TIP[0] + (100 - TIP[0]) * u;
  return `${OPEN}<g transform="translate(${n2(cx)} ${TIP[1]}) scale(${n4(z)}) translate(${-TIP[0]} ${-TIP[1]})">${SETTING}${DART}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
