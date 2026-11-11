// Beautiful's two stories, both the plant's own, in time-lapse: nothing comes into the picture. Happy: it thrives: a side shoot grows out of the
// stem, under the head and over the left leaf's tip, and a bud at its end swells and opens into a small second flower, the big head leaning a
// touch towards it. Sad: it wilts: the stem's top bends and the head bows on it, the leaves sag, and a petal lets go and flutters down onto the
// right leaf.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { bendAbout, blob, n2, n4, paint, parsePath, runsToDc, subdivide, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M139.9 53.5c9.5-2.4 19.1-2 26 6 10.9 12.4 3.7 33.7-12.5 36.9-5.1 1-9.9-.1-14.7-1.5 3.7 3 6.7 6.3 8.4 10.9 4.5 12.5-4.2 26.1-16.9 28.4-9 1.7-16.1-2.4-22.8-8-.3 .9-.5 1.7-.7 2.6-4.2-4.2-9-9.6-9.8-15.8-.4-3.2 0-6.7 0-9.9 1-1.1 2.2-2.7 3.6-3.4 1.4-.7 3.2-.5 4.6-.7 3.7-.6 7.3-2 10.3-4.1 10.1-6.9 12-22 7.5-32.6-1-2.5-2.4-5.1-4.4-6.9-3.2-2.9-7.6-4.6-11.8-5.5-1.4-.2-3.1-.1-4.3-.7-1.5-.7-2.8-2.5-4-3.7l.3-12.8 2.1-2.1c.4 .9 .8 1.7 1.3 2.6 1.2-4.9 2.9-9.2 6.2-13.1 17.7-20.7 49.8-2.5 40.1 22.5-1.8 4.6-4.8 7.8-8.5 10.9Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M103.8 47.3l-2.2 2.2c-6.3 .1-13.2 2.1-17.9 6.5-1.6 1.6-2.8 3.6-3.8 5.6-5 9.5-4 21.4 2.8 29.9 2.9 3.7 7.9 6 12.3 7 1.5 .4 3.3 .3 4.6 1 1 .5 1.8 1.5 2.5 2.3-.7 .2-1.3 .2-2 .6 .4 3.2 .4 6.7 .2 9.9 0 .9-.3 1.8-.2 2.7 .2 1.3 1 2.8 1.6 4-1.4 2.5-2.7 4.6-4.8 6.4-.4-.7-.6-1.3-1.3-1.8-1.4 1.4-2.5 2.9-4 4.1-5 4.5-11.6 7.2-18.4 6.7-12.8-1.1-22.9-13.5-19.8-26.3 1.5-6 5.4-10.2 10.3-13.8-8.2 2.5-15.8 3-23.1-2.3-16-11.6-8.8-36 9.7-39.9 4.8-1 9.5-.2 14.2 1-4.5-4.1-8.2-8.4-9.5-14.5-3.1-14.3 8.1-26.3 22-27.1 11.9-.7 23.4 8.3 25.1 20.3 .3 2.4-.5 13.1 0 14.2 .3 .6 1.2 .9 1.7 1.3Z\" fill=\"var(--art-clay,#E8743B)\"/>\n<path d=\"M100.3 113.3c1.7 5.1 4.1 9.2 7.6 13.3-.2 1.7-.7 3.5-.7 5.2l-.1 40.9c5.4-17.7 15.2-31.6 34.4-35 9-1.6 18.1-.1 27.1-1.5-.4 2.2 0 5-1 7.1-1.3 2.7-4.2 5-6.3 7-5.6 5.7-11.9 9.8-19.4 12.8-8.6 3.4-18.8 5.8-25.7 12.3-2.9 2.6-3.9 6-5.4 9.4-.8 1.8-2.8 2.8-3.4 4.7-.8 2.2-.3 12-.3 14.9l-9.7 0c0-4.4 0-8.8 0-13.2 0-2 .3-4.3-.2-6.2-.5-1.8-2.3-2.7-3.1-4.3-.6-1.2-.7-2.7-1.2-4-2-5-5.9-7.7-10.8-9.4-4.6-1.6-9.3-1.6-14-2-5.5-.4-10.8-1.9-15.6-4.7-2.9-1.8-9.3-7-11.1-9.9-.7-1.2-1-2.8-1.4-4.2-1-2.8-2.5-4.8-4.5-7.1 8.1-1.6 16.1-3.3 24.3-2.5 15.7 1.5 28.1 12.7 34.4 26.6 1.5 3.2 2.5 6.5 3.5 9.8 0-.2-.2-1.9-.2-2.7l-.2-37.7c-.1-3.1-1.1-6.3-1.9-9.2 2.2-3.3 3.9-6.6 4.9-10.4Z\" fill=\"var(--art-teal,#37B39B)\"/>\n<path d=\"M169 136.2c0 20.2-10 39.6-30.5 45.5-3.9 1.1-7.8 1.6-11.8 1.7-9 .3-14.3-1.3-19.6 7.7 0-2-.2-4.1 .2-6 .6-2.8 2-5.5 3.7-7.8 8.7-12 24.1-14 36.6-20.2 9.3-4.7 16.1-12 21.4-20.9ZM36.2 139.9c5.8 7.8 11.5 15.8 20.9 19.5 11.8 4.7 23.4 .1 33.8 9.6 2.5 2.3 4.6 5.1 5.7 8.3 1 2.9 .8 5.8 .8 8.8-6.2-9.7-13.8-5.9-23.2-5.5-5.2 .2-10.5-.9-15.2-3.2-16.8-8.4-15.7-23-22.8-37.5Z\" fill=\"var(--art-teal-deep,#25907B)\" fill-rule=\"evenodd\"/>\n<circle cx=\"101\" cy=\"74.2\" r=\"28.1\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<path d=\"M104.9 46.4C121.1 58.6 122.7 91.8 100 102.3C89.6 102 80.3 95.9 75.7 86.5C71.1 77.2 72.1 66.1 78.2 57.7C84.3 49.3 94.6 44.9 104.9 46.4Z\" fill=\"var(--art-sun,#F7BE45)\"/>\n</svg>\n";
export const STILL_HASH = "4e38d7e988";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 7) throw new Error("beautiful: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const SKY = EL[0], RIGHT_PETALS = EL[1], LEFT_PETALS = EL[2], CENTRE = EL[5] + EL[6];
const dOf = (e) => e.match(/ d="([^"]+)"/)[1];
// the stem and leaves (light, then their dark undersides), as curves to warp
const GREEN = subdivide(parsePath(dOf(EL[3])), 3), GREEN_DEEP = subdivide(parsePath(dOf(EL[4])), 3);
// the stem's top meets the head here (under the petals' join, behind the center); the head's six petals are circles of 23.5 round the center
const TIP = [100.5, 113], STEM_X = 100.5;
const BOTTOM_RIGHT = [124.2, 110.9], PETAL_R = 23.8; // its outer edge's best circle (the traced edge strays up to 2 from it)
// the bottom right petal is the right petals' path beyond the chord it shares with the middle right one: each side as a big half plane
const CHORD = [137, 93.25], TOWARD = [-0.56, 0.83], ALONG = [0.83, 0.56];
const half = (sgn) => { const q = (a, b) => `${n2(CHORD[0] + ALONG[0] * a + TOWARD[0] * b * sgn)} ${n2(CHORD[1] + ALONG[1] * a + TOWARD[1] * b * sgn)}`; return `M${q(-300, 0)}L${q(300, 0)}L${q(300, 300)}L${q(-300, 300)}Z`; };
const HALF_UP = half(-1), HALF_DOWN = half(1);
// the falling petal: its outline as radii round its middle every 10° (0° to the right, 90° down), measured off the still's traced edge where
// that edge shows (0°–130°, 340°, 350°), and elsewhere (under the center, the left petal and the stem, so never seen while it's on the head) a
// smooth run through its best circle. It falls from exactly the head's petal, and rounds out into a clean circle as it goes.
const SEEN = { 0: 24.05, 10: 24.35, 20: 24.45, 30: 24.55, 40: 24.55, 50: 24.55, 60: 24.45, 70: 24.25, 80: 23.95, 90: 23.55, 100: 23.25, 110: 22.75, 120: 22.45, 130: 22.45, 340: 23.05, 350: 23.65 };
const RADII = (() => {
  const r = [];
  for (let k = 0; k < 36; k++) {
    const deg = k * 10;
    if (deg in SEEN) { r.push(SEEN[deg]); continue; }
    // from 130° to 340° unseen: eased from one seen end to the other, rising through the best circle between
    const u = (deg - 130) / 210, ease = (1 - Math.cos(Math.PI * u)) / 2, ends = SEEN[130] + (SEEN[340] - SEEN[130]) * ease;
    r.push(ends + (PETAL_R + 0.4 - ends) * Math.sin(Math.PI * u));
  }
  return r;
})();
function fallen(round) {
  const pts = RADII.map((r, k) => { const a = (k * Math.PI) / 18, rr = r + (PETAL_R - r) * round; return [BOTTOM_RIGHT[0] + rr * Math.cos(a), BOTTOM_RIGHT[1] + rr * Math.sin(a)]; });
  return `<path d="${blob(pts)}" ${fill("clay-deep")}/>`;
}

// ---- the head: the still's petals and center, turned `turn`° on the stem's tip and carried to `at`, nodding `nod` (its face tipping towards us
// shortens it upright); optionally without its bottom right petal (gone)
function head(turn, at, nod, without) {
  const right = without ? `<clipPath id="np"><path d="${HALF_UP}"/></clipPath><g clip-path="url(#np)">${RIGHT_PETALS}</g>` : RIGHT_PETALS;
  const inner = `${right}${LEFT_PETALS}`;
  return { petals: wrap(inner, turn, at, nod), centre: wrap(CENTRE, turn, at, nod) };
}
const wrap = (svg, turn, at, nod) => {
  if (!turn && !nod && at[0] === TIP[0] && at[1] === TIP[1]) return svg;
  return `<g transform="translate(${n2(at[0])} ${n2(at[1])}) rotate(${n2(turn)}) scale(1 ${n4(1 - nod)}) translate(${-TIP[0]} ${-TIP[1]})">${svg}</g>`;
};
/** Where a point of the head (in the still) is, with the head turned and carried as above. */
function onHead(p, turn, at, nod) {
  const a = (turn * Math.PI) / 180, x = p[0] - TIP[0], y = (p[1] - TIP[1]) * (1 - nod);
  return [at[0] + x * Math.cos(a) - y * Math.sin(a), at[1] + x * Math.sin(a) + y * Math.cos(a)];
}

// ---- the green: the stem's top (above y 141, where the leaves are clear of it) bent `bend`° to the right over its 28 units; the leaves turned
// `sag`° down about where they leave the stem. Each point is the stem's if it's within 9 of the stem's middle, else a leaf's.
const LEAF_FEET = { left: [95, 168], right: [106, 166] };
function green(bend, sag, relax = 0) {
  const fn = (x, y) => {
    // (the stem's neck flares out into the bottom right petal; with that petal gone, its flare eases back to the stem's own edge, x 106)
    if (relax && y < 136 && x > 106) { const w = Math.min(1, (136 - y) / 10), ww = w * w * (3 - 2 * w); x = 106 + (x - 106) * (1 - relax * ww); }
    if (Math.abs(x - STEM_X) < 9) return bend ? bendAbout(x, y, STEM_X, 141, -90, 28, bend) : [x, y];
    if (!sag || y > 182) return [x, y];
    const [fx, fy] = x < STEM_X ? LEAF_FEET.left : LEAF_FEET.right, a = ((x < STEM_X ? -sag : sag) * Math.PI) / 180;
    // (the sag grows from nothing at the leaf's foot to all of it at its tip, so it bends rather than swings)
    const k = Math.min(1, Math.abs(x - fx) / 60), aa = a * k;
    return [fx + (x - fx) * Math.cos(aa) - (y - fy) * Math.sin(aa), fy + (x - fx) * Math.sin(aa) + (y - fy) * Math.cos(aa)];
  };
  const d = runsToDc(GREEN, fn);
  return { svg: `<path d="${d}" ${fill("teal")}/><path d="${runsToDc(GREEN_DEEP, fn)}" ${fill("teal-deep")}/>`, d };
}
const STILL_GREEN = EL[3] + EL[4];

// ---- sad. The bend comes on slowly and runs on, as a stem loses its water; the head bows on it (no more than keeps it in the frame), the
// leaves sag 9°; early on the bottom right petal lets go, flutters down (slow, swaying, as a petal falls through air) onto the right leaf, and lies
// along it.
const T_WILT = [0.1, 1.1], BEND = 30, NOD = 0.12, SAG = 9;
const T_LET_GO = 0.62, T_LANDS = 1.5; // it lets go early in the wilt, while it's still clear of the leaf
const LEAF_REST = [146, 147], LEAF_SLOPE = -30; // where the petal comes to lie on the right leaf, along its slope
const SAD_DUR = T_WILT[1] + 0.3 + 0.7;
const wiltAt = (t) => track([[T_WILT[0], 0], [T_WILT[0] + 0.35, 0.18, "in"], [T_WILT[1], 1, "out"]], t);
function sad(t) {
  if (t <= 0) return STILL;
  const k = wiltAt(t);
  const bend = BEND * k, at = bendAbout(TIP[0], TIP[1], STEM_X, 141, -90, 28, bend), nod = NOD * k;
  const gone = t >= T_LET_GO;
  const h = head(bend, at, nod, gone), g = green(bend, SAG * k, track([[T_LET_GO, 0], [T_LET_GO + 0.4, 1, "io"]], t));
  let petal = "";
  if (gone) {
    // from where it was on the bowed head to its rest on the leaf: falling slowly, swaying, turning to lie along the leaf, flattening as it does.
    // It starts as the head had it (nodded, so a little short) and, as it was there, under the center and the stem's top: it's drawn over
    // everything but kept off those two, so it comes out from under them and lies over the leaf without changing places.
    // (where the head had it when it let go)
    const kGo = wiltAt(T_LET_GO), bendGo = BEND * kGo, nodGo = NOD * kGo;
    const from = onHead(BOTTOM_RIGHT, bendGo, bendAbout(TIP[0], TIP[1], STEM_X, 141, -90, 28, bendGo), nodGo);
    const u = track([[T_LET_GO, 0], [T_LANDS, 1, "io"]], t), sway = Math.sin(u * Math.PI * 2) * 4 * (1 - u);
    const x = from[0] + (LEAF_REST[0] - from[0]) * u + sway, y = from[1] + (LEAF_REST[1] - from[1]) * (u * u * (3 - 2 * u));
    const settle = track([[T_LANDS, 0], [T_LANDS + 0.12, 1.5, "out"], [T_LANDS + 0.25, 0, "io"]], t);
    const lie = Math.min(1, u * 1.3), turn = bendGo + (LEAF_SLOPE - bendGo) * lie + sway * 2 * (1 - lie) + settle;
    // (carried as the head carried it, so the first frame is the head's own: at its middle, turned, nodded; then flattening along the leaf)
    const sy = (1 - nodGo) + (0.55 - (1 - nodGo)) * lie;
    const carry = `translate(${n2(x)} ${n2(y)}) rotate(${n2(turn)}) scale(1 ${n4(sy)}) translate(${-BOTTOM_RIGHT[0]} ${-BOTTOM_RIGHT[1]})`;
    // (kept off what lay over it on the head, as long as they meet: the left petals and the center, carried as the head carries them, and the
    // green above y 131, the stem's top there; below that it lies over everything)
    const headAt = `translate(${n2(at[0])} ${n2(at[1])}) rotate(${n2(bend)}) scale(1 ${n4(1 - nod)}) translate(${-TIP[0]} ${-TIP[1]})`, BIG = "M-400 -400H600V600H-400Z";
    const off = `<clipPath id="fp"><path d="${BIG}${g.d}" clip-rule="evenodd"/><rect x="-20" y="131" width="240" height="100"/></clipPath>`
      + `<clipPath id="fl"><path d="${BIG}${dOf(LEFT_PETALS)}" clip-rule="evenodd" transform="${headAt}"/></clipPath>`
      + `<clipPath id="fc"><path d="${BIG}M72.9 74.2a28.1 28.1 0 1 0 56.2 0a28.1 28.1 0 1 0 -56.2 0Z" clip-rule="evenodd" transform="${headAt}"/></clipPath>`;
    petal = off
      + `<g clip-path="url(#fp)"><g clip-path="url(#fl)"><g clip-path="url(#fc)"><g transform="${carry}">${fallen(track([[T_LET_GO, 0], [T_LET_GO + 0.25, 1, "io"]], t))}</g></g></g></g>`;
  }
  // (the still's order: petals, the green over them, the center over all; the fallen petal lies on the leaf, over the green)
  return `${OPEN}${SKY}${h.petals}${g.svg}${h.centre}${petal}</svg>`;
}

// ---- happy. The shoot leaves the stem's left side under the head and grows (its length drawn on as it grows), level under the petals, then
// up past the left leaf's tip; a bud swells at its end, then opens: six small petals unfolding from its middle, its center, the still's
// flower in small. The big head leans 3° towards it as it opens, and back to 2°.
const SHOOT = "M95.5 139C82 141.5 60 141.5 45 136C35 132 27 127 22.5 119";
const SHOOT_LEN = 82;
const BLOOM = [21.5, 113], SMALL = 0.26; // the small flower's middle, and its size against the still's
const T_GROW = [0.15, 0.95], T_BUD = [0.75, 1.15], T_OPEN = [1.15, 1.7];
const HAPPY_DUR = T_OPEN[1] + 0.25 + 0.6;
// the small flower: the still's own petals and center, small, about its middle
const SMALL_FLOWER = (s) => `<g transform="translate(${BLOOM[0]} ${BLOOM[1]}) scale(${n4(SMALL * s)}) translate(-101 -74)">${RIGHT_PETALS}${LEFT_PETALS}${CENTRE}</g>`;
function happy(t) {
  if (t <= 0) return STILL;
  const grown = track([[T_GROW[0], 0], [T_GROW[1], 1, "out"]], t);
  const shoot = `<path d="${SHOOT}" fill="none" stroke="${paint("teal")}" stroke-width="3.6" stroke-linecap="round" stroke-dasharray="${n2(SHOOT_LEN * grown)} ${SHOOT_LEN + 4}"/>`;
  // the bud: green sepals round an orange tip, swelling as the shoot ends; it opens into the flower (petals out from its middle)
  const bud = track([[T_BUD[0], 0], [T_BUD[1], 1, "out"]], t), open = track([[T_OPEN[0], 0], [T_OPEN[1] - 0.1, 1.06, "out"], [T_OPEN[1], 1, "io"]], t);
  let flower = "";
  if (bud > 0) {
    const sepal = `<ellipse cx="${BLOOM[0] + 0.8}" cy="${BLOOM[1] + 4}" rx="${n2(5.2 * bud * (1 - 0.6 * Math.min(1, open)))}" ry="${n2(6.5 * bud)}" ${fill("teal-deep")}/>`;
    // (the petals unfold out of the bud from nothing; the bud's tip stays under them until the small flower's center covers it)
    const tipBud = open < 0.8 ? `<ellipse cx="${BLOOM[0] + 0.8}" cy="${BLOOM[1] + 1}" rx="${n2(3.6 * bud)}" ry="${n2(5 * bud)}" ${fill("clay")}/>` : "";
    flower = sepal + tipBud + (open > 0 ? SMALL_FLOWER(open) : "");
  }
  const lean = -track([[T_OPEN[0], 0], [T_OPEN[1], 3, "io"], [T_OPEN[1] + 0.25, 2, "io"]], t);
  const h = head(lean, TIP, 0, false);
  return `${OPEN}${SKY}${h.petals}${STILL_GREEN}${shoot}${flower}${h.centre}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
