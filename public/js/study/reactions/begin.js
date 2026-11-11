// Begin's two stories, a time-lapse of a few days for the seedling: nothing comes in; it sways a little as growing plants do. Happy: its
// first true leaf comes up from the fork between its two seed leaves, a small, lighter, folded leaf on a short new shoot, and opens. Sad:
// damping off: at the soil line its stem goes dark and thin, pinched, until it can't hold the leaves up: it buckles there and the seedling
// falls over onto the mound, its stub left standing.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, paint, parsePath, runsToDc, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"28,176 161,170 200,191.5 200,200 71.6,200\" fill=\"var(--art-sun-deep,#DB9A22)\"/><path d=\"M87 133C87.3 122 88.6 113 89.8 106C91 99 87 92 80 89.5C70.5 86.1 54 84 44 72.5C37 64.5 34 46 31.5 33C40 30 53 31.4 63 33C78 34.7 89 46 92.6 58C95 66 94 74 93 80C92.5 83.5 93.5 88.5 96 93.5C96.6 86 98 77 103 69C109 59.5 120 53.5 132 53.2C139 53 144 54 147.2 55.9C148.8 56.8 149.2 57.9 149.1 59.8C149 70 142 83 130 90.5C121 95 110 95 103.5 98.5C98.5 101.5 96.4 107 96.3 114C96.2 120 96.8 127 97.4 133Z\" fill=\"var(--art-teal,#37B39B)\"/><path d=\"M63 33C78 34.7 89 46 92.6 58C95 66 94 74 93 80C92.5 83.5 93.5 88.5 96 93.5C89 88 81 80 80.6 67C80.3 57 78 44 63 33Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M148.8 57.5C149.1 58.1 149.2 58.9 149.1 59.8C149 70 142 83 130 90.5C121 95 110 95 103.5 98.5C110 84 125 66 148.8 57.5Z\" fill=\"var(--art-teal-deep,#25907B)\"/><path d=\"M23 171C22 160 38 149 52 144.5C56 143.2 58 141 62 137C72 127 84 124.5 97 124.5C110 124.5 120 129 128 136C132 139.5 136 141.4 141 143C155 147.5 164 157 163.5 168C163 175 157 177.7 148 178.5C120 181 60 181 34 178.5C26 177.7 23 175 23 171Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M97 124.5C110 124.5 120 129 128 136C132 139.5 136 141.4 141 143C155 147.5 164 157 163.5 168C163 175 157 177.7 148 178.5C136 172 125 162 119 151C113 140 108 127 97 124.5Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><polygon points=\"88,125.3 83.2,132 85.6,135.6 79.6,144.4 87.6,135.8 86,132.2 91.6,125\" fill=\"var(--art-bark-deep,#4B2F24)\"/></svg>\n";
export const STILL_HASH = "2a981dd37a";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 8) throw new Error("begin: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const dOf = (e) => e.match(/ d="([^"]*)"/)[1];
const BEFORE = EL[0] + EL[1], PLANT_SHADE = EL[3] + EL[4], MOUND = EL[5] + EL[6] + EL[7];
// the stem's foot, where it comes out of the mound; growing plants sway about it (slowly: a time-lapse)
const FOOT = [92, 124.5];
const sway = (t, k = 1) => 1.6 * k * Math.sin((t * 2 * Math.PI) / 1.3) * Math.min(1, t / 0.4);
const swayed = (svg, a) => (Math.abs(a) < 0.005 ? `<g transform="rotate(0 ${FOOT[0]} ${FOOT[1]})">${svg}</g>` : `<g transform="rotate(${n2(a)} ${FOOT[0]} ${FOOT[1]})">${svg}</g>`);

// ---- happy. The new shoot from the fork (96, 93.5), up and a little left (to the light); the leaf on it a pointed oval, lighter than the
// seed leaves (it's young), its right half in the light's shade as theirs are; folded at first (narrow), opening as it grows.
const FORK = [96, 93.5];
const pt = (p) => `${n2(p[0])} ${n2(p[1])}`;
function newLeaf(g, open) {
  if (g <= 0.002) return `<path d="M${pt(FORK)}L${pt(FORK)}" fill="none" stroke="${paint("teal")}" stroke-width="2.4" stroke-linecap="round"/>`;
  // (up through the gap between the seed leaves' inner edges, into the open above them)
  const B = [FORK[0] + 2 * g, FORK[1] - 28 * g], T = [B[0] + 3 * g, B[1] - 37 * g];
  const shoot = `<path d="M${pt(FORK)}Q${pt([FORK[0] + 1.6 * g, FORK[1] - 15 * g])} ${pt(B)}" fill="none" stroke="${paint("teal")}" stroke-width="${n2(1.2 + 1.6 * g)}" stroke-linecap="round"/>`;
  const dx = T[0] - B[0], dy = T[1] - B[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len, w = 12 * g * (0.2 + 0.8 * open);
  const at = (u, s) => [B[0] + dx * u + nx * w * s, B[1] + dy * u + ny * w * s];
  // (n points to the leaf's right; its right half is the shaded one)
  const leaf = `<path d="M${pt(B)}C${pt(at(0.28, -1))} ${pt(at(0.78, -0.75))} ${pt(T)}C${pt(at(0.78, 0.75))} ${pt(at(0.28, 1))} ${pt(B)}Z" ${fill("teal-lit")}/>`;
  const shade = `<path d="M${pt(B)}L${pt(T)}C${pt(at(0.78, 0.75))} ${pt(at(0.28, 1))} ${pt(B)}Z" ${fill("teal")}/>`;
  return shoot + leaf + shade;
}
const HAPPY_DUR = 2.2 + 0.6;
function happy(t) {
  if (t <= 0) return STILL;
  const g = track([[0.3, 0], [1.6, 1, "io"]], t), open = track([[1.1, 0], [2.2, 1, "io"]], t);
  return `${OPEN}${BEFORE}${swayed(EL[2] + PLANT_SHADE + newLeaf(g, open), sway(t))}${MOUND}</svg>`;
}

// ---- sad. The pinch: the stem just above the soil narrows (its sides drawn in towards its middle, most at 120, to a third of its width)
// and goes the dark of rot (a bark-dark band over it, deepening). Then it buckles there: everything above the pinch falls over about it to
// the left (the bigger seed leaf is that side), faster as it goes, until it's down on the mound, a little flop, and lies there.
const PINCH_Y = 120, MID_X = 92;
const PLANT_RUNS = parsePath(dOf(EL[2]));
const pinched = (p) => (x, y) => { const b = Math.max(0, 1 - Math.abs(y - PINCH_Y) / 9); return [MID_X + (x - MID_X) * (1 - 0.66 * p * b), y]; };
const plantAt = (p) => `<path d="${runsToDc(PLANT_RUNS, pinched(p))}" ${fill("teal")}/>`;
// the rot: over the stem from 112 to the soil, its width as pinched, dark
const rot = (p, dark) => {
  if (dark < 0.004) return "";
  const w = (y) => { const b = Math.max(0, 1 - Math.abs(y - PINCH_Y) / 9); return 4.6 * (1 - 0.66 * p * b); };
  const L = [], R = [];
  for (let y = 111; y <= 127; y += 2) { L.push([MID_X - w(y) + (y - 120) * -0.06, y]); R.push([MID_X + w(y) + 0.2, y]); }
  return `<polygon points="${[...L, ...R.reverse()].map((q) => `${n2(q[0])},${n2(q[1])}`).join(" ")}" ${fill("bark")} opacity="${n2(dark)}"/>`;
};
// the fall, worked out once: how far over (to the left, about the pinch) before any of it touches the mound's top or the ground (178)
const MOUND_TOP = (() => {
  const runs = parsePath(dOf(EL[5])), pts = [];
  for (const sg of runs[0].segs) for (let i = 0; i <= 8; i++) { const u = i / 8, v = 1 - u; pts.push([v ** 3 * sg[0][0] + 3 * v * v * u * sg[1][0] + 3 * v * u * u * sg[2][0] + u ** 3 * sg[3][0], v ** 3 * sg[0][1] + 3 * v * v * u * sg[1][1] + 3 * v * u * u * sg[2][1] + u ** 3 * sg[3][1]]); }
  return (x) => { let best = 178; for (const p of pts) if (Math.abs(p[0] - x) < 2.5) best = Math.min(best, p[1]); return best; };
})();
const PIVOT = [MID_X, PINCH_Y];
const PLANT_PTS = PLANT_RUNS[0].segs.flatMap((sg) => [sg[0], sg[3]]).filter((p) => p[1] < PINCH_Y - 4);
const turnPt = (p, a) => { const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), dx = p[0] - PIVOT[0], dy = p[1] - PIVOT[1]; return [PIVOT[0] + c * dx - s * dy, PIVOT[1] + s * dx + c * dy]; };
const DOWN = (() => { for (let a = 0; a > -150; a -= 0.25) if (PLANT_PTS.some((p) => { const q = turnPt(p, a); return q[1] >= MOUND_TOP(q[0]) - 0.5; })) return a; return -90; })();
const T_PINCH = [0.3, 1.5], T_GO = 1.55, T_DOWN = T_GO + 0.26;
const SAD_DUR = Math.round((T_DOWN + 0.3 + 0.6) * 100) / 100;
const ABOVE = `<clipPath id="ab"><rect x="-300" y="-300" width="700" height="${300 + PINCH_Y}"/></clipPath>`, BELOW = `<clipPath id="bl"><rect x="-300" y="${PINCH_Y}" width="700" height="400"/></clipPath>`;
function sad(t) {
  if (t <= 0) return STILL;
  const p = track([[T_PINCH[0], 0], [T_PINCH[1], 1, "io"]], t), dark = 0.85 * track([[T_PINCH[0], 0], [T_PINCH[1] - 0.2, 1, "in"]], t);
  // over it goes: from rest, faster and faster (a thing toppling), then a small bounce as it lands
  const fall = DOWN * track([[T_GO, 0], [T_DOWN, 1, "in"]], t) - Math.sign(DOWN) * track([[T_DOWN, 0], [T_DOWN + 0.08, 3, "out"], [T_DOWN + 0.2, 0, "in"]], t);
  const sw = sway(t, 1 - Math.min(1, Math.max(0, (t - T_PINCH[0]) / 0.8)));
  const top = plantAt(p) + PLANT_SHADE + rot(p, dark);
  const upper = `<g clip-path="url(#ab)"><g transform="rotate(${n2(fall + sw)} ${PIVOT[0]} ${PIVOT[1]})">${top}</g></g>`;
  const stub = `<g clip-path="url(#bl)">${swayed(plantAt(p) + rot(p, dark), 0)}</g>`;
  return `${OPEN}${ABOVE}${BELOW}${BEFORE}${stub}${upper}${MOUND}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
