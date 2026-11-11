// Find's two stories, the grass's own: nothing comes in. A breeze from the left runs through the tuft: the blades bend over to the right, left
// ones first, flutter, and spring back past upright to rest; the grass in the lens (magnified) bends with them. The key, held up in the blades,
// shifts as they give: it slips, bow end first. Happy: the blades catch it and, springing back, lift it up a little past where it was: it
// rests on their tips, in plain sight. Sad: it slips again and drops down through the tuft, out of sight behind the grass; the lens is left on grass alone.
// The lens magnifies what's behind it about 1.7 times (the shaft is 8 wide in it, 4.75 outside), so the key in it moves 1.7 times as far.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { bendAbout, n2, parsePath, runsToDc, subdivide, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect y=\"137\" width=\"200\" height=\"63\" fill=\"var(--art-violet-lit,#A68CFF)\"/><path d=\"M14 155L162 153L200 167L200 200L150 200Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M20 140C21 118 19 100 13 88C25 98 32 116 34 138Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M112 134C117 112 126 97 139 88C133 100 129 116 129 134Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M128 136C134 122 142 112 152 106C148 116 146 126 146 138Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M112.9 107.7L141.9 120.4A2.4 2.4 0 0 1 143.2 123.5A2.4 2.4 0 0 1 140.1 124.8L111.1 112.1Z\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M112 109.9L143.2 123.5A2.4 2.4 0 0 1 140.1 124.8L111.1 112.1Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><polygon points=\"126.8,118.1 129.8,119.3 128,123.6 125,122.4\" fill=\"var(--art-sun-deep,#DB9A22)\"/><polygon points=\"133.3,120.9 136.3,122.1 134.5,126.4 131.5,125.2\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M14 161C9 151 11 139 24 134C48 126 118 124 138 128C151 131 157 146 153 160C120 164 46 164 14 161Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M134 127C148 130 156 144 153 160C148 161 143 162 136 162C141 150 141 138 134 127Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M22 150C20 134 15 120 7 111C20 114 30 126 34 146Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M20 158C19 146 15 138 10 132C21 134 28 142 30 154Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M110 142C113 128 118 116 127 106C123 118 121 130 123 142Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M134 144C137 134 141 126 149 120C147 128 145 136 146 144Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M12 160C14 151 18 145 25 140C22 148 22 154 24 161Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><circle cx=\"72\" cy=\"94\" r=\"40\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><polygon points=\"81.6,92.7 110.6,105 107.4,112.4 78.4,100.1\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"80,96.4 109,108.7 107.4,112.4 78.4,100.1\" fill=\"var(--art-sun-deep,#DB9A22)\"/><circle cx=\"65\" cy=\"90\" r=\"24\" fill=\"var(--art-sun-deep,#DB9A22)\"/><circle cx=\"63\" cy=\"89\" r=\"22\" fill=\"var(--art-sun,#F7BE45)\"/><circle cx=\"59\" cy=\"86\" r=\"7.5\" fill=\"var(--art-sun-deep,#DB9A22)\"/><circle cx=\"60\" cy=\"87\" r=\"6\" fill=\"var(--art-sky-lit,#8FCDF4)\"/><path d=\"M32.5 108.4C38 104 44 101 48 95C48 104 50 112 55 118C61 109 70 104 81 101C77 108 76 114 78 120C85 112 95 106 106 103C104 107 104 111 108.4 115A42 42 0 0 1 32.5 108.4Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M35.6 115C42 112 50 108 58 100C58 110 61 118 66 124C72 116 81 111 93 109C89 115 88 121 90 127C95 121 99 119 104.2 121A42 42 0 0 1 35.6 115Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M45 126.2C49 116 57 108 69 103C63 111 61 121 64.7 135.4A42 42 0 0 1 45 126.2Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M79.3 135.4C81 124 88 116 99 111C94 118 92 125 93 130.4A42 42 0 0 1 79.3 135.4Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M106.1 115.3L118.7 125.2C121 127 123 128 126.4 128.3L155.1 150.1A7 7 0 0 1 146.5 161.1L118.4 138.5C116 135 115 133 113.5 131.8L100.9 121.9Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M103.5 118.6L156.3 159.9A7 7 0 0 1 146.5 161.1L118.4 138.5C116 135 115 133 113.5 131.8L100.9 121.9Z\" fill=\"var(--art-ink,#231F3B)\"/><path fill-rule=\"evenodd\" d=\"M25 94A47 47 0 1 0 119 94A47 47 0 1 0 25 94ZM34 94A38 38 0 1 0 110 94A38 38 0 1 0 34 94Z\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M105.2 60.8A47 47 0 0 1 38.8 127.2L45.1 120.9A38 38 0 0 0 98.9 67.1Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M30 162C32 148 38 136 48 126C45 138 44 150 46 162Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M56 162C58 152 62 144 70 136C69 146 70 154 72 162Z\" fill=\"var(--art-teal-lit,#6FD0BD)\"/><path d=\"M88 162C90 150 93 138 99 129C99 140 100 152 104 162Z\" fill=\"var(--art-teal-deep,#25907B)\"/></svg>\n";
export const STILL_HASH = "b2bab93703";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 35) throw new Error("find: the still isn't as this story knows it");
const dOf = (e) => e.match(/ d="([^"]*)"/)[1], fillOf = (e) => e.match(/ fill="([^"]*)"/)[1];
const MAG = 1.7;
// the lens: its glass, a disc of r 40 at (72, 94) (the rim covers it from r 38); the key and grass seen in it are kept to it
const LENS_CLIP = '<clipPath id="ln"><circle cx="72" cy="94" r="40"/></clipPath>';

// ---- the grass. Each blade bends along itself, from its foot (the middle of its base) towards its tip, as an arc (its length kept).
const BLADE_IDS = [3, 4, 5, 12, 13, 14, 15, 16, 32, 33, 34];
const BLADES = Object.fromEntries(BLADE_IDS.map((i) => {
  const runs = parsePath(dOf(EL[i])), segs = runs[0].segs, a = segs[0][0], tip = segs[0][3], b = segs[1][3];
  const foot = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const ang = (Math.atan2(tip[1] - foot[1], tip[0] - foot[0]) * 180) / Math.PI, len = Math.hypot(tip[0] - foot[0], tip[1] - foot[1]);
  return [i, { runs: subdivide(runs, 3), fill: fillOf(EL[i]), foot, ang, len }];
}));
const bladeAt = (i, turn) => {
  const B = BLADES[i];
  return `<path d="${runsToDc(B.runs, (x, y) => bendAbout(x, y, B.foot[0], B.foot[1], B.ang, B.len, turn))}" fill="${B.fill}"/>`;
};
// the grass in the lens: its masses end at the glass's edge on an arc; here they're carried on down and out past the glass (the clip keeps
// them to it, so nothing changes at rest), so they can bend without the glass's edge showing. They bend from well below the lens, as long
// blades seen big.
const LENS_FOOT = 178, LENS_LEN = 84;
const LENS_GRASS = [24, 25, 26, 27].map((i) => {
  const d = dOf(EL[i]), m = d.match(/^M(-?[\d.]+) (-?[\d.]+)(.*?)A42 42 0 0 1 -?[\d.]+ -?[\d.]+Z$/);
  if (!m) throw new Error(`find: lens grass ${i} isn't as this story knows it`);
  const runs = parsePath(`M${m[1]} ${m[2]}${m[3]}`), last = runs[0].segs.at(-1)[3], x0 = Number(m[1]), y0 = Number(m[2]);
  // out from each end, away from the glass, then down below the lens and across
  const out = (x) => (x < 72 ? Math.min(x, 26) - 14 : Math.max(x, 118) + 14);
  const ext = `M${m[1]} ${m[2]}${m[3]}L${n2(out(last[0]))} ${last[1]}L${n2(out(last[0]))} ${LENS_FOOT}L${n2(out(x0))} ${LENS_FOOT}L${n2(out(x0))} ${y0}Z`;
  return { runs: subdivide(parsePath(ext), 2), fill: fillOf(EL[i]), cx: (x0 + last[0]) / 2 };
});
const lensGrassAt = (turn) => LENS_GRASS.map((g) => `<path d="${runsToDc(g.runs, (x, y) => bendAbout(x, y, g.cx, LENS_FOOT, -90, LENS_LEN, turn))}" fill="${g.fill}"/>`).join("");

// the breeze: it reaches each blade as it crosses, left to right (600 units a second), bends it over, gusts, eases, and the blade springs back
// past upright and sways to rest
const T_BREEZE = 0.12, CROSS = 600, TURN = 24, LENS_TURN = 15;
const gust = (u) => track([[0, 0], [0.22, 1, "out"], [0.34, 0.78, "io"], [0.46, 0.95, "io"], [0.62, 0.55, "io"], [0.78, -0.3, "io"], [0.96, 0.12, "io"], [1.12, -0.04, "io"], [1.26, 0, "io"]], u);
const flutter = (u) => (u > 0 && u < 0.7 ? Math.sin(u * 2 * Math.PI * 4.5) * 0.08 * Math.sin((u / 0.7) * Math.PI) : 0);
const breezeAt = (t, x) => { const u = t - T_BREEZE - x / CROSS; return gust(u) + flutter(u); };

// ---- the key: outside the lens its shaft and teeth (6–9), in the lens its shaft and bow seen big (18–23). Both turn about where they meet
// at the rim, J; the key drops d below where it was (the lens shows it dropping 1.7 d).
const J = [110, 108];
const KEY_OUT = EL.slice(6, 10).join(""), KEY_IN = EL.slice(18, 24).join("");
const keyAt = (svg, dy, tilt) => `<g transform="translate(0 ${n2(dy)}) rotate(${n2(tilt)} ${J[0]} ${J[1]})">${svg}</g>`;

/** The picture: the breeze's bend at t, the key dropped d and tilted (bow end down is negative); `push` adds to the lens grass's bend (the bow
 *  pushing through it), `give` to the two blades behind the key (they spring up as it leaves them). */
function scene(t, d, tilt, push = 0, give = 0) {
  const blade = (i) => bladeAt(i, TURN * breezeAt(t, BLADES[i].foot[0]) + (i === 4 || i === 5 ? give : 0));
  const lens = `<g clip-path="url(#ln)">${keyAt(KEY_IN, MAG * d, tilt)}${lensGrassAt(LENS_TURN * breezeAt(t, 72) + push)}</g>`;
  return `${OPEN}${LENS_CLIP}${EL.slice(0, 3).join("")}${blade(3)}${blade(4)}${blade(5)}${keyAt(KEY_OUT, d, tilt)}${EL[10]}${EL[11]}`
    + `${blade(12)}${blade(13)}${blade(14)}${blade(15)}${blade(16)}${EL[17]}${lens}${EL.slice(28, 32).join("")}${blade(32)}${blade(33)}${blade(34)}</svg>`;
}

// when the breeze reaches the blades holding the key, they give, and it slips: down 4.5, its bow end dipping 5°
const T_SLIP = 0.34, SLIP = [[T_SLIP, 0], [T_SLIP + 0.12, 4.5, "in"]], SLIP_TILT = [[T_SLIP, 0], [T_SLIP + 0.12, -5, "in"]];

// ---- happy: the blades catch it, and as they spring back upright they lift it with them, up past where it was: it bobs and comes to rest
// on their tips, a little higher than it lay, the bow clear of the grass in the lens.
const HAPPY_END = T_BREEZE + 200 / CROSS + 1.26, UP = -2.6;
const HAPPY_DUR = Math.round((HAPPY_END + 0.5) * 100) / 100;
function happy(t) {
  if (t <= 0) return STILL;
  const d = track([...SLIP, [T_SLIP + 0.28, UP - 1.6, "out"], [T_SLIP + 0.44, UP + 0.7, "io"], [T_SLIP + 0.6, UP - 0.25, "io"], [T_SLIP + 0.74, UP, "io"]], t);
  const tilt = track([...SLIP_TILT, [T_SLIP + 0.26, 1.2, "out"], [T_SLIP + 0.44, -0.5, "io"], [T_SLIP + 0.62, 0, "io"]], t);
  return scene(t, d, tilt);
}

// ---- sad: it catches a moment, then slips again and goes on down through the tuft, faster as it goes (the blades slow it, so it's not a
// free fall), bow end first, out of sight: outside behind the tuft, in the lens behind the grass and off the glass's foot. The grass in the
// lens shakes as the bow goes through it; the blades behind it spring up as it leaves them.
const T_GO = T_SLIP + 0.42, T_GONE = T_GO + 0.24, DOWN = 36;
const SAD_DUR = Math.round((T_BREEZE + 200 / CROSS + 1.26 + 0.5) * 100) / 100;
function sad(t) {
  if (t <= 0) return STILL;
  const d = track([...SLIP, [T_SLIP + 0.22, 3, "out"], [T_GO, 3.8, "io"], [T_GONE, DOWN, "in"]], t);
  const tilt = track([...SLIP_TILT, [T_SLIP + 0.22, -3.5, "out"], [T_GO, -4.2, "io"], [T_GONE, -14, "in"]], t);
  const push = track([[T_GO + 0.06, 0], [T_GO + 0.16, 7, "out"], [T_GO + 0.3, -4, "io"], [T_GO + 0.46, 1.5, "io"], [T_GO + 0.6, 0, "io"]], t);
  const give = track([[T_GO, 0], [T_GO + 0.1, -9, "out"], [T_GO + 0.26, 4, "io"], [T_GO + 0.42, -1.5, "io"], [T_GO + 0.56, 0, "io"]], t);
  return scene(t, d, tilt, push, give);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
