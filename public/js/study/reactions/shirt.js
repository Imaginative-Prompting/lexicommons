// Shirt's story. Happy, nearly: the right shoulder creeps out along the hanger's arm and the knit neck round the hook stops it a hair short of the tip;
// loosened, the right sleeve folds down to hang beside the body, the shirt still on its hanger. Sad: the shirt's right shoulder creeps out
// along the hanger's arm, reaches its tip, and slips off: that side drops, swings, and settles, hanging from the left shoulder and the collar on the
// hook, lopsided: its right shoulder fallen, its right sleeve hanging, its hem slanting, the hanger's bare right arm showing above it.
// Every frame is a pure function of t, in seconds. The still's own parts, all inside the still's own frame (1.4 times these units about the hook):
// the wall, the shadows of the peg, the hook, the hanger and the shirt (each 4 down and right of its thing), the peg, the hook, the inside of the
// shirt's neck, the hanger (its arms from the hook's foot at 100, 61.5 down to their tips at 70 and 130 across, 81.5-86 down) and its shade, the shirt
// and its shade. The collar is round the hook, so the shirt can't swing whole about its left shoulder: the cloth gives instead, the right side
// dropping by its weight, nothing at the collar. The shirt (75 cm) is 80 tall: 107 to the meter, gravity 1050.
import { n2, n4, parsePath, runsToDc, subdivide, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><g transform=\"translate(100 100) scale(1.4) translate(-102 -99)\"><circle cx=\"101.5\" cy=\"51.5\" r=\"4.2\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M101,67 L101,60.5 C101,58 103,56.5 105,55 A4.3,4.3 0 1 0 98,53.5 A1,1 0 0 1 96.1,54.2 A6.3,6.3 0 1 1 106.5,56.5 C105,58 103,59 103,61 L103,67 Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M103,64.5 C98,67 93,72 89,76.2 L73,84.5 L75,89 L91,81 C95,77 99,73.5 103,71.5 C107,73.5 111,77 115,81 L131,89 L133,84.5 L117,76.2 C113,72 108,67 103,64.5 Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M91,77 Q82,79 75,82.8 Q73.5,83.8 72.5,85.3 L59,103 Q57.5,105 59.5,106.5 L71,115 Q73,116.5 74,114.5 L80,100 C79,114 78,134 78,148 Q78,152 82,152.5 Q104,156 126,152.5 Q130,152 130,148 C130,134 129,114 128,100 L134,114.5 Q135,116.5 137,115 L148.5,106.5 Q150.5,105 149,103 L135.5,85.3 Q134.5,83.8 133,82.8 Q126,79 117,77 C115,88 93,88 91,77 Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/><circle cx=\"100\" cy=\"50\" r=\"4.2\" fill=\"var(--art-ink-lit,#3A3460)\"/><path d=\"M100,45.8 A4.2,4.2 0 0 1 100,54.2 A2.8,4.2 0 0 0 100,45.8 Z\" fill=\"var(--art-ink,#231F3B)\"/><path d=\"M99,65 L99,58.5 C99,56 101,54.5 103,53 A4.3,4.3 0 1 0 96,51.5 A1,1 0 0 1 94.1,52.2 A6.3,6.3 0 1 1 104.5,54.5 C103,56 101,57 101,59 L101,65 Z\" fill=\"var(--art-steel-deep,#6B687A)\"/><path d=\"M86.5,74.5 C92,66 108,66 113.5,74.5 C111,84 89,84 86.5,74.5 Z\" fill=\"var(--art-sky-deep,#3488C9)\"/><path d=\"M100,61.5 C95,64 90,69 86,73.2 L70,81.5 L72,86 L88,78 C92,74 96,70.5 100,68.5 C104,70.5 108,74 112,78 L128,86 L130,81.5 L114,73.2 C110,69 105,64 100,61.5 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M100,66.5 C104.5,68.5 109,72 112.5,75.5 L128.5,84 L128,86 L112,78 C108,74 104,70.5 100,68.5 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M87,73 Q78,75 71,78.8 Q69.5,79.8 68.5,81.3 L55,99 Q53.5,101 55.5,102.5 L67,111 Q69,112.5 70,110.5 L76,96 C75,110 74,130 74,144 Q74,148 78,148.5 Q100,152 122,148.5 Q126,148 126,144 C126,130 125,110 124,96 L130,110.5 Q131,112.5 133,111 L144.5,102.5 Q146.5,101 145,99 L131.5,81.3 Q130.5,79.8 129,78.8 Q122,75 113,73 C111,84 89,84 87,73 Z\" fill=\"var(--art-sky,#58ADEB)\"/><path d=\"M121,89 L131,103.5 L143.1,96.5 L145,99 Q146.5,101 144.5,102.5 L133,111 Q131,112.5 130,110.5 L124,96 C125,110 126,130 126,144 Q126,148 122,148.5 Q118,149.5 110,149.7 C121,136 121,110 121,89 Z\" fill=\"var(--art-sky-deep,#3488C9)\"/></g></svg>\n";
export const STILL_HASH = "5c0396c39d";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const IN = '<g transform="translate(100 100) scale(1.4) translate(-102 -99)">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 13 || !STILL.includes(EL[0] + IN) || !EL[11].includes("M87,73 Q78,75 71,78.8")) throw new Error("shirt: the still isn't as this story knows it");
// (the shirt's outline has quadratic curves, which the kit's reader doesn't take: each is raised to the same curve as a cubic first)
function cubics(d) {
  const tok = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g);
  let out = "", i = 0, cmd = null, x = 0, y = 0;
  const num = () => Number(tok[i++]);
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    if (cmd === "Q") {
      const qx = num(), qy = num(), nx = num(), ny = num();
      out += `C${x + (2 / 3) * (qx - x)} ${y + (2 / 3) * (qy - y)} ${nx + (2 / 3) * (qx - nx)} ${ny + (2 / 3) * (qy - ny)} ${nx} ${ny}`; x = nx; y = ny;
    } else if (cmd === "C") { const v = [num(), num(), num(), num(), num(), num()]; out += `C${v.join(" ")}`; x = v[4]; y = v[5]; }
    else if (cmd === "M" || cmd === "L") { x = num(); y = num(); out += `${cmd}${x} ${y}`; if (cmd === "M") cmd = "L"; }
    else if (cmd === "Z") { out += "Z"; }
    else throw new Error(`shirt: path command ${cmd}`);
  }
  return out;
}
const runs = (e) => subdivide(parsePath(cubics(e.match(/ d="([^"]*)"/)[1])), 3), paintOf = (e) => e.match(/fill="[^"]*"/)[0];
// the cloth's parts, to be reshaped: its shadow (4 down and right), the inside of its neck, the shirt and its shade
const CLOTH = { shadow: EL[4], neck: EL[8], shirt: EL[11], shade: EL[12] };
const R = Object.fromEntries(Object.entries(CLOTH).map(([k, e]) => [k, { runs: runs(e), paint: paintOf(e) }]));
const smooth = (u) => { const v = Math.max(0, Math.min(1, u)); return v * v * (3 - 2 * v); };
// how far a point of the cloth drops, its right side the most: nothing at the collar, all of it past the right shoulder, the right sleeve more
const dropAt = (x) => smooth((x - 95) / 40) + 0.35 * smooth((x - 124) / 20);

// ---- the slip: the shoulder creeps out to the arm's tip (a little), then drops off it (falling, 15), swings past and settles
const T0 = 0.3, T_TIP = 0.75, DROP = 15, T_DOWN = T_TIP + Math.sqrt((2 * (DROP - 2)) / 1050);
function drop(t) {
  if (t <= T_TIP) return 2 * track([[T0, 0], [T_TIP, 1, "in"]], t);
  if (t <= T_DOWN) return 2 + 0.5 * 1050 * (t - T_TIP) ** 2;
  return DROP + track([[T_DOWN, 0], [T_DOWN + 0.08, 2.6, "out"], [T_DOWN + 0.2, -0.8, "io"], [T_DOWN + 0.32, 0.4, "io"], [T_DOWN + 0.44, 0, "io"]], t);
}

// ---- sad: lopsided
const SAD_DUR = T_DOWN + 0.75;
function sad(t) {
  if (t <= T0) return STILL;
  const d = drop(t);
  const warp = (off) => (x, y) => { const k = dropAt(x - off) * d; return [x - 0.12 * k, y + k]; };
  const part = (k, off) => `<path d="${runsToDc(R[k].runs, warp(off))}" ${R[k].paint}/>`;
  // (in the still's order: the shadows, the peg and hook, the neck's inside, the hanger, then the shirt over it)
  return `${OPEN}${EL[0]}${IN}${EL[1]}${EL[2]}${EL[3]}${part("shadow", 4)}${EL[5]}${EL[6]}${EL[7]}${part("neck", 0)}${EL[9]}${EL[10]}${part("shirt", 0)}${part("shade", 0)}</g></svg>`;
}

// ---- happy: saved by its collar
// The same creep: the right shoulder slides out along the arm toward its tip; the knit neck, round the hook, stretches and stops it a hair short, and
// pulls it back a little. Loosened, the right sleeve folds down by its weight from the shoulder seam and swings in to hang beside the body: the
// shirt still on its hanger, one sleeve down.
// (the sleeve turns down about its armpit, at (124, 96), up to SLEEVE degrees, the seam's cloth turning less, the shoulder over the hanger's
// tip hardly at all)
const T_HOLD = 0.75, T_BACK = 1.0, SLEEVE = 34, SEAM = [124, 96], T_HUNG = 1.0 + 0.24;
const sleeveAt = (x) => smooth((x - 128.5) / 7);
function saved(t) {
  // [how far the right side has crept down and out (as the sad's first 2), how far the sleeve has dropped]
  const creep = t <= T_HOLD ? 1.8 * track([[T0, 0], [T_HOLD, 1, "in"]], t) : 1.8 - 1.45 * track([[T_HOLD, 0], [T_BACK, 1, "io"]], t);
  // (it swings down as a hanging flap does, faster as it goes, a little past, back, and settles)
  let sl = 0;
  if (t > 0.82 && t <= T_HUNG) sl = SLEEVE * track([[0.82, 0], [T_HUNG, 1, "in"]], t);
  if (t > T_HUNG) sl = SLEEVE + track([[T_HUNG, 0], [T_HUNG + 0.09, 6, "out"], [T_HUNG + 0.22, -2.2, "io"], [T_HUNG + 0.34, 0.8, "io"], [T_HUNG + 0.46, 0, "io"]], t);
  return [creep, sl];
}
const HAPPY_DUR = T_HUNG + 0.75;
function happy(t) {
  if (t <= T0) return STILL;
  const [c, sl] = saved(t);
  const warp = (off) => (x, y) => {
    const k = dropAt(x - off) * c, a = (sleeveAt(x - off) * sl * Math.PI) / 180, px = SEAM[0] + off, py = SEAM[1] + off, dx = x - px, dy = y - py;
    return [px + dx * Math.cos(a) - dy * Math.sin(a) - 0.12 * k, py + dx * Math.sin(a) + dy * Math.cos(a) + k];
  };
  const part = (k, off) => `<path d="${runsToDc(R[k].runs, warp(off))}" ${R[k].paint}/>`;
  // the hanging sleeve's lit front hangs in front of the body's shaded side: the shade is kept off it (cut to all but that face, turned with it)
  const face = SLEEVE_FACE.map((q) => warp(0)(...q)).map(([x, y]) => `${n2(x)} ${n2(y)}`).join("L");
  const clip = `<clipPath id="sv"><path d="M-60 -60H260V260H-60ZM${face}Z" clip-rule="evenodd"/></clipPath>`;
  return `${OPEN}${EL[0]}${IN}${EL[1]}${EL[2]}${EL[3]}${part("shadow", 4)}${EL[5]}${EL[6]}${EL[7]}${part("neck", 0)}${EL[9]}${EL[10]}${part("shirt", 0)}${clip}<g clip-path="url(#sv)">${part("shade", 0)}</g></g></svg>`;
}
// the right sleeve's lit front in the still: from the shoulder out along its top to its end, back along the top of its shade band, up into the shoulder
const SLEEVE_FACE = [[129, 78.8], [130.5, 79.8], [131.5, 81.3], [145, 99], [143.1, 96.5], [131, 103.5], [121, 89], [122, 80]];

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : name === "sad" ? sad(Math.min(t, SAD_DUR)) : STILL;
}
