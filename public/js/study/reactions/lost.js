// Lost's stories, the found mitten someone set on the fence post (hooked by the loop in its cuff over the nail at the post's top, and laid
// over), and a gust, a light thing's natural mover. Both start the same: the gust gets under the cuff and lifts it, the mitten fluttering.
// Sad: it slides off over the post's shoulder and comes down swaying and turning, as cloth falls, to lie crumpled on the ground in the
// fence's shadow, the post bare above it. Happy: it flaps up off the post, and the loop in its cuff catches on the nail: tugged taut, it
// streams out in the wind a moment; the gust passes, it swings down on the loop and hangs from the nail against the post, swaying to rest,
// still where its owner will find it.
// Every frame is a pure function of t, in seconds. The still's own parts: the fence (three posts, two runs of rails), its shadow on the
// ground in front (the region right of the line from (18, 167) to (137, 200)), the mitten draped over the middle post's top (its cuff to
// the left, its hand hanging to the right); hidden under the cuff, the nail's head at (93, 84), the cuff's loop over it.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-teal,#37B39B)\"/><polygon points=\"18,167 181.6,166 200,171 200,200 137,200\" fill=\"var(--art-teal-deep,#25907B)\"/><rect x=\"30\" y=\"100.5\" width=\"140\" height=\"14.5\" fill=\"var(--art-bark,#7A4E2D)\"/><rect x=\"30\" y=\"100.5\" width=\"140\" height=\"9.5\" fill=\"var(--art-wood,#DCA063)\"/><rect x=\"30\" y=\"135\" width=\"140\" height=\"14.5\" fill=\"var(--art-bark,#7A4E2D)\"/><rect x=\"30\" y=\"135\" width=\"140\" height=\"9.5\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M16.4,165 V91 A11.6,11.6 0 0 1 39.6,91 V165 Q39.6,167.5 37.1,167.5 H18.9 Q16.4,167.5 16.4,165 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M32.4,167.5 V91 C32.4,85.5 30.5,81.5 26.5,79.5 A11.6,11.6 0 0 1 39.9,91 V165 Q39.9,167.5 37.1,167.5 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M87.4,165 V91 A11.6,11.6 0 0 1 110.6,91 V165 Q110.6,167.5 108.1,167.5 H89.9 Q87.4,167.5 87.4,165 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M103.4,167.5 V91 C103.4,85.5 101.5,81.5 97.5,79.5 A11.6,11.6 0 0 1 110.9,91 V165 Q110.9,167.5 108.1,167.5 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M158.4,165 V91 A11.6,11.6 0 0 1 181.6,91 V165 Q181.6,167.5 179.1,167.5 H160.9 Q158.4,167.5 158.4,165 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M174.4,167.5 V91 C174.4,85.5 172.5,81.5 168.5,79.5 A11.6,11.6 0 0 1 181.9,91 V165 Q181.9,167.5 179.1,167.5 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M98,76 C100,70.5 104,67.5 109,67.5 C119,68 128,77 132.5,91 C135,100 133.5,110.5 127,112.5 C121.5,114 118.5,110 117.5,104 L116.5,95 C115.5,91 113,89 110,89 Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M109,67.5 C119,68 128,77 132.5,91 C135,100 133.5,110.5 127,112.5 C125,113.1 123.2,113 121.8,112.4 C126.5,109.5 128,102 126.3,93.5 C124,82 118,72.5 109,67.5 Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M110.5,89 C109.5,95 110,101.5 113,104 C116,106 119,103.5 118.8,99 L118,91 Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M109.5,88 C108.5,94 109,100.5 112,103 C115,105 118,102.5 117.8,98 L117,90 Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M90.5,74 C97,74.5 106,76.5 112.5,79 C113,83 112.5,86.5 111,90 C104,88.5 96,88 88.5,89 C88,84 88.8,78.5 90.5,74 Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M90,77 C97,77.5 105,79.3 112.7,82 L112.6,84.2 C105,81.6 97,79.8 89.6,79.3 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M89.1,82.5 C97,82.6 105,84.2 112.4,86.6 L111.6,88.4 C105,86.6 97,85.2 88.8,84.8 Z\" fill=\"var(--art-paper,#FBF7EC)\"/></svg>\n";
export const STILL_HASH = "70b5804ead";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)\b[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 19 || !EL[1].includes('points="18,167 181.6,166 200,171 200,200 137,200"')) throw new Error("lost: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const FENCE = EL.slice(0, 12).join(""), MITTEN = EL.slice(12).join("");
// the mitten moved: about its middle, turned, flattened as it lies (seen a little from above)
const MID = [111, 90];
const placed = (svg, x, y, a, sy = 1) => `<g transform="translate(${n2(x)} ${n2(y)}) rotate(${n2(a)})${sy === 1 ? "" : ` scale(1 ${n4(sy)})`} translate(${-MID[0]} ${-MID[1]})">${svg}</g>`;
const DEG = Math.PI / 180;
const turn = ([px, py], a) => [Math.cos(a * DEG) * px - Math.sin(a * DEG) * py, Math.sin(a * DEG) * px + Math.cos(a * DEG) * py];

// ---- the gust both stories start with: under the cuff, the cuff lifting, the mitten turning a little and fluttering
const T_OFF = 0.85;
function gust(t) {
  const lift = track([[0.2, 0], [T_OFF, 9, "in"]], t), g = track([[0.2, 0], [T_OFF, 1, "in"]], t);
  return { x: MID[0] + lift / 3, y: MID[1] - (2 * lift) / 9, a: lift + g * (2.5 * Math.sin(t * 27) + 1.5 * Math.sin(t * 41)) };
}

// the nail's head on the post (under the cuff in the still)
const NAIL = [93, 84];
const NAIL_HEAD = `<circle cx="${NAIL[0]}" cy="${NAIL[1]}" r="1.5" ${fill("steel-deep")}/><circle cx="${NAIL[0] - 0.4}" cy="${NAIL[1] - 0.4}" r="0.7" ${fill("steel")}/>`;

// ---- sad: off the post, down to the ground (the loop, tugged sideways, slips over the nail's head)
const SAD_DUR = 2.6, LAND = 1.75;
// the mitten in the fence's shadow: its own tones a shade down
const SHADED = MITTEN.replace(/var\(--art-clay-deep,#[0-9A-F]+\)/g, paint("clay-deeper")).replace(/var\(--art-clay,#[0-9A-F]+\)/g, paint("clay-deep")).replace(/var\(--art-paper,#[0-9A-F]+\)/g, paint("paper-deep"));
const SHADOW = '<clipPath id="sh"><polygon points="18,167 181.6,166 200,171 200,200 137,200"/></clipPath>';
function sad(t) {
  if (t <= 0) return STILL;
  let { x, y, a } = gust(t);
  if (t > T_OFF) {
    // off over the shoulder and down: from rest, soon at cloth's own slow speed, drifting with the wind, swaying, turning over
    const k = track([[T_OFF, 0], [LAND, 1, "lin"]], t), f = k * k * (2 - k), still = gust(T_OFF);
    x = still.x + 34 * k + 7 * Math.sin(k * Math.PI * 1.6) * (1 - k);
    y = still.y + 96 * f;
    a = still.a * (1 - k) + track([[T_OFF, 0], [LAND, 150, "io"], [LAND + 0.2, 165, "out"]], t) + 9 * k;
  }
  // landing: it flattens as it settles
  const sy = track([[LAND - 0.05, 1], [LAND + 0.15, 0.5, "out"], [LAND + 0.3, 0.55, "io"]], t);
  return `${OPEN}${FENCE}${NAIL_HEAD}${SHADOW}${placed(MITTEN, x, y, a, sy)}<g clip-path="url(#sh)">${placed(SHADED, x, y, a, sy)}</g></svg>`;
}

// ---- happy: caught by its loop on the nail
const HAPPY_DUR = 2.9, LOOP_AT = [89.5, 81.5], LOOP = 6, T_CATCH = 1.05, T_PASS = 1.5;
// (its loop end where the mitten is: the cuff's edge, carried by its turn about the middle)
const loopEnd = (p) => { const r = turn([LOOP_AT[0] - MID[0], LOOP_AT[1] - MID[1]], p.a); return [p.x + r[0], p.y + r[1]]; };
// held: the loop's end out from the nail at angle phi, the mitten turned a about it
const held = (phi, a) => { const e = [NAIL[0] + LOOP * Math.cos(phi * DEG), NAIL[1] + LOOP * Math.sin(phi * DEG)], r = turn([LOOP_AT[0] - MID[0], LOOP_AT[1] - MID[1]], a); return { x: e[0] - r[0], y: e[1] - r[1], a }; };
function happy(t) {
  if (t <= 0) return STILL;
  let p = gust(t);
  // up off the post in the wind till the loop draws tight (up and out to the right of the nail), then held there streaming out, the jerk
  // of the catch rebounding once; the gust passes: it drops, swinging down on the loop, past hanging straight, and back, to rest
  const phi = track([[T_OFF, -40], [T_CATCH, -55, "out"], [T_PASS, -50, "io"], [T_PASS + 0.4, 90, "in"], [T_PASS + 0.62, 104, "out"], [T_PASS + 0.86, 82, "io"], [T_PASS + 1.08, 93, "io"], [T_PASS + 1.3, 90, "io"]], t);
  const a = track([[T_OFF, 9], [T_CATCH, -28, "out"], [T_CATCH + 0.08, -18, "out"], [T_CATCH + 0.16, -24, "io"], [T_PASS, -22, "io"], [T_PASS + 0.4, 84, "in"], [T_PASS + 0.62, 98, "out"], [T_PASS + 0.86, 66, "io"], [T_PASS + 1.08, 79, "io"], [T_PASS + 1.3, 74.5, "io"]], t);
  if (t > T_OFF) {
    // (from where the gust left it, eased onto the loop's line as the loop draws taut)
    // (streaming, it flutters while the wind holds it out; the flutter dies as the gust passes)
    const h = held(phi, a + 3 * Math.sin(t * 31) * track([[T_OFF, 0], [T_CATCH, 1], [T_PASS - 0.1, 1], [T_PASS + 0.1, 0]], t)), w = track([[T_OFF, 0], [T_CATCH, 1, "out"]], t), g = gust(T_OFF);
    p = { x: g.x + (h.x - g.x) * w, y: g.y + (h.y - g.y) * w, a: g.a + (h.a - g.a) * w };
  }
  // the loop: a strand of the cuff's yarn from the nail's head to the cuff
  const e = loopEnd(p), dx = e[0] - NAIL[0], dy = e[1] - NAIL[1], l = Math.hypot(dx, dy) || 1, nx = (-dy / l) * 0.5, ny = (dx / l) * 0.5;
  const loop = `<polygon points="${n2(NAIL[0] + nx)},${n2(NAIL[1] + ny)} ${n2(e[0] + nx)},${n2(e[1] + ny)} ${n2(e[0] - nx)},${n2(e[1] - ny)} ${n2(NAIL[0] - nx)},${n2(NAIL[1] - ny)}" ${fill("clay-deep")}/>`;
  return `${OPEN}${FENCE}${NAIL_HEAD}${loop}${placed(MITTEN, p.x, p.y, p.a)}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
