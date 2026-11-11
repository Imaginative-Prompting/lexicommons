// The book's two stories. Happy: a page turns, and the spread under it is a pop-up: a tree folds up out of the gutter, then a sun behind it. Sad: the right half
// creeps up by itself, teeters, tips over the top and slams shut, and the book jumps. It stays shut.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own paths, in the 200-unit view. A leaf turns about the spine by an affine map:
// seen from the front and above, a point u from the spine at angle θ sits at x = S + u cos θ, lifted by u K sin θ.
import { n2, n4, paint, parsePath, partsOf, runsToD, runsToDc, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/>\n<path d=\"M10.7 143.2l2.8 2.9-4.6 19.1c.4 .1 .7 .3 1 .5l78.3 34.3c1.7 .8 3.3 3.1 4.6 4.4l-97.2 0 0-58.5 14.5 0c.2-.9 .4-1.8 .6-2.7ZM189.3 143.2c.2 .9 .4 1.7 .6 2.5l14.5 0 0 31.1c-3.6-1.7-7.8-3.2-11-5.6-1.3-1-2.4-2.3-3.6-3.5 .5-.9 1.1-1.8 1.1-2.9 .1-1.5-.6-3.2-.9-4.6-1.1-4.7-2.4-9.4-3.5-14.2l2.8-2.8Z\" fill=\"var(--art-violet-lit,#A68CFF)\" fill-rule=\"evenodd\"/>\n<path d=\"M193.2 164.2c.5 .4 .8 .8 1.2 1.3-.4 .8-.7 1.4-1.2 2.2l11.2 5.6 0 31.1-114.9 0c-.4-.3-1.2-.9-1.7-1.1l-78.3-34.3c-.8-.4-1.7-.7-2.6-1 .9-.9 2.2-2.7 3.7-2.7l77.1 0c1.4 0 3 1.8 4.3 2.4 2.5 1.2 5.2 1.5 8 1.5 2.7 0 5.4-.2 8-1.4 1.3-.6 2.9-2.5 4.4-2.5l25-.2 52.9-.1c1 0 2-.5 2.9-.8Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/>\n<path d=\"M100.3 84.7c.5-.4 .9-.9 1.5-1.3 .6 .6 1.6 1.3 1.6 2.3l.1 79.8-3.7 3.7c-1.9-1.9-3.8-3.6-6-5.1-17.2-11.5-45.2-11.7-64.5-6-5.8 1.8-11.3 4.2-16.6 7.2l-3.7-3.8 18.7-76.4 3.5-.8c.4-1.5 .6-3.6 1.6-4.9 2.3-3 12.8-6.6 16.6-7.6 13.9-3.5 29.5-2 41.9 5.4 3.4 1.9 6.6 4.4 9 7.5Z\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<path d=\"M168.2 84.3l3.5 .6 19 76.3-3.8 3.8c-23.9-13.5-64.7-16.2-86 3.7-.6-.6-1.1-1.1-1.7-1.7 .1-.2 .7-1.1 .7-1.4l.2-80.6c0-1.6 2.1-3.1 3.2-4.1 3.8-3.2 8.3-5.6 12.9-7.4 12.3-4.6 26.2-4.7 38.5-.3 2.8 1 10.3 4 12 6.4 .8 1.3 1.1 3.2 1.5 4.7Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M160.7 86.7l1 4.7c-19.1-7.6-37.3-6.2-55.2 3.5l-.3-4.4c17.1-9.8 36.3-11.1 54.5-3.8ZM163.2 99.4l.9 4.7c-20.1-7.5-38.2-6.5-57.3 3.1l-.1-4.6c17.8-10 37.5-10.1 56.5-3.2ZM165.8 112.8l.9 4.8c-20.2-6.5-40.3-6.9-59.6 2.8l0-5c18.7-9.4 39.1-9.9 58.7-2.6ZM168 124.9l.9 4.7c-21.1-6.3-41.2-5.9-61.4 3l0-5c20.2-9.1 39.5-9 60.5-2.7ZM167 136.6l.6 4.5c-18.5-5.1-38.3-5.2-56.2 2.4l0-4.7c17.9-6.9 37.2-7.4 55.6-2.2Z\" fill=\"var(--art-ink-lit,#3A3460)\" fill-rule=\"evenodd\"/>\n<path d=\"M93.4 90.1l-.3 4.4c-17.6-9.4-36.9-10-55.4-2.7l.9-4.5c18.1-7.3 37.7-6.8 54.8 2.8ZM31.5 83.3l-19.2 78.7c5.5-3 11-5.6 17-7.4 19.3-5.7 47.1-5.5 64.4 5.9 2.4 1.6 4.4 3.5 6.4 5.6 21.1-20.9 63.3-18.4 87.3-4.3l-19.5-78.3c2.9 .4 6.8 1.2 7.7 4.5l18.7 75.8c.6 2.3-1.4 4.6-3.7 4.6l-53.8 .2-24.4 .2c-1.5 0-3.2 1.9-4.5 2.5-2.5 1.2-5.2 1.4-8 1.4-2.7 0-5.5-.4-8-1.5-1.3-.6-2.8-2.4-4.2-2.4l-78.7-.2c-2 0-3.8-2.5-3.3-4.3l18.6-76.6c.8-3 4.7-3.7 7.2-4.4ZM93 102.2l0 4.7c-18.6-9.2-38.3-9.8-57.7-2.4l.9-4.7c19.3-7.5 38.3-6.8 56.8 2.4ZM92.7 115.1l0 5c-19.9-8.9-39.3-9.2-59.8-2.3l.8-4.7c19.8-7.5 39.9-6.9 59 2ZM92.7 127.6l-.3 4.8c-20.2-8.5-40.8-8.8-61.6-2.6l.8-4.6c20.1-6.5 41.6-6.3 61.1 2.4ZM88.6 138.8l-.3 4.5c-18.1-7.2-37.6-6.9-56.2-2l.7-4.5c19-5.1 37.3-4.8 55.8 2Z\" fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\"/>\n</svg>\n";
export const STILL_HASH = "ec294d00e1";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const [, SHADOW, LPAGE, RPAGE, RLINES, INK] = partsOf(STILL);
const BG = STILL.slice(STILL.indexOf("<rect"), STILL.indexOf("<path"));
const inkRuns = parsePath(INK.d);
const BAND = runsToD([inkRuns[1]]);
const LLINES = runsToD(inkRuns.filter((_, i) => i !== 1));
// The table's top runs straight across at 145.8 behind the book: drawn whole, so it's there wherever the book no longer is.
const TABLE = `<rect y="145.8" width="200" height="54.2" fill="${paint("violet-lit")}"/>`;
const S = 100.6, K = 0.72, rad = Math.PI / 180;
const p = (d, fill, extra = "") => `<path d="${d}" fill="${paint(fill)}"${extra}/>`;
// A right-hand leaf at θ, and a left-hand shape lifted back up to θ (its back, landing at 180°).
const front = (th) => { const c = Math.cos(th * rad), s = Math.sin(th * rad); return `matrix(${n4(c)} ${n4(-K * s)} 0 1 ${n4(S - S * c)} ${n4(S * K * s)})`; };
const back = (th) => { const c = Math.cos(th * rad), s = Math.sin(th * rad); return `matrix(${n4(-c)} ${n4(K * s)} 0 1 ${n4(S * (1 + c))} ${n4(-S * K * s)})`; };
const halves = `<clipPath id="lh"><rect x="-10" y="0" width="${S + 10}" height="200"/></clipPath><clipPath id="rh"><rect x="${S}" y="0" width="110" height="200"/></clipPath>`;
// A face turning toward the light brightens: its lit colors come in over its shaded ones, rather than switching in a frame.
const ramp = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
const over = (svg, k) => (k <= 0 ? "" : k >= 1 ? svg : `<g opacity="${n2(k)}">${svg}</g>`);
const frontFace = (th, between = "") => `${p(RPAGE.d, "paper-deep")}${over(p(RPAGE.d, "paper"), ramp(th, 12, 36))}${between}${p(RLINES.d, "ink-lit", ' fill-rule="evenodd"')}${over(p(RLINES.d, "ink", ' fill-rule="evenodd"'), ramp(th, 12, 36))}`;
const decay = (t, at, amp, hz, k) => (t <= at ? 0 : amp * Math.sin(2 * Math.PI * hz * (t - at)) * Math.exp(-k * (t - at)));

// ---- happy. The page lifts at its corner, turns, flaps flat. The tree is a card folded into the spread: it stands up as the spread opens, overshoots and sways.
// (It starts from rest: a page doesn't move at full speed the instant you tap.) It's carried up and over the top, slowing as it goes past upright, so
// it's never edge-on for more than a moment and never whips through it; let go just past upright, it falls the rest of the way, faster and faster, and
// flaps once.
const H_TURN = [[0, 0], [0.04, 0], [0.16, 11, "io"], [0.25, 9, "io"], [0.58, 93, "io"], [0.84, 180, "in"], [0.92, 172, "out"], [1.0, 180, "in"]];
// (it starts standing up gently from flat in the gutter as the page goes over, so its first frame is a sliver of card, then overshoots and sways)
const H_TREE = [[0.56, 0], [0.9, 1.16, "io"], [1.04, 0.93, "io"], [1.17, 1.04, "io"], [1.29, 1, "io"]];
const HAPPY_DUR = 2.25;
const BASE = 150;
// The tree: a round crown of three, lit from the left (a lit rim, the dark side's rim), a trunk with its lit edge.
const CROWN = [[100, 70, 27], [80, 86, 18], [121, 86, 18]];
const crown = (dx, dy, fill) => CROWN.map(([x, y, r]) => `<circle cx="${n2(x + dx)}" cy="${n2(y + dy)}" r="${r}"${fill ? ` fill="${paint(fill)}"` : ""}/>`).join("");
function tree(s, sway) {
  if (s <= 0.001) return "";
  const t = `translate(100 ${BASE}) rotate(${n2(sway)}) scale(1 ${n4(s)}) translate(-100 -${BASE})`;
  return `<g transform="${t}"><rect x="94.5" y="92" width="11" height="${BASE - 92}" fill="${paint("bark")}"/><rect x="94.5" y="92" width="3.6" height="${BASE - 92}" fill="${paint("wood-deep")}"/>`
    + `${crown(0, 0, "teal-deep")}<g clip-path="url(#cr)">${crown(-6, -6, "teal-lit")}<g clip-path="url(#cs)">${crown(-6, -6, "teal")}</g></g></g>`;
}
const treeClips = `<clipPath id="cr">${crown(0, 0)}</clipPath><clipPath id="cs">${crown(3.2, 3.2)}</clipPath>`;
// A sun on the spread's back panel, coming up from behind the far edge of the right page.
function sun(t) {
  const y = track([[1.16, 104], [1.48, 58, "out"], [1.62, 66, "io"], [1.74, 62.5, "io"], [1.84, 64, "io"]], t);
  if (y >= 103) return "";
  return `<g transform="translate(0 ${n2(y - 64)})"><circle cx="152" cy="64" r="17" fill="${paint("sun-deep")}"/><circle cx="150" cy="62" r="16" fill="${paint("sun")}"/><circle cx="145.5" cy="57.5" r="7.5" fill="${paint("sun-lit")}"/></g>`;
}
function happy(t) {
  if (t <= 0) return STILL;
  const th = track(H_TURN, t), s = track(H_TREE, t), sway = decay(t, 0.9, 3.2, 1.6, 3.2);
  let leaf;
  if (th < 90) leaf = `<g transform="${front(th)}">${frontFace(th)}</g>`;
  else leaf = `<g transform="${back(th)}">${p(LPAGE.d, "paper-deep")}${over(p(LPAGE.d, "paper"), ramp(th, 140, 170))}</g>`;
  return `${OPEN}${treeClips}${th < 25 ? halves : ""}${BG}${TABLE}${SHADOW.svg}${sun(t)}${p(LPAGE.d, "paper")}${p(RPAGE.d, "paper-deep")}${p(BAND, "ink", ' fill-rule="evenodd"')}`
    // (the cover's band stays over the page's foot until the page has lifted clear of it: dropped sooner, the page's hidden foot showed over it at once)
    + `${th < 179.9 ? p(LLINES, "ink") : ""}${leaf}${th < 25 ? `<g clip-path="url(#rh)">${p(BAND, "ink", ' fill-rule="evenodd"')}</g>` : ""}${tree(s, sway)}</svg>`;
}

// ---- sad. Like a paperback that won't stay open: its spine pushes the right half up; it creeps, stops short of upright, teeters, creeps on over the top
// (slowly: nothing's pushing it hard there, so it's never edge-on for more than a moment), and falls shut, faster all the way. It lands and the book
// jumps; the left page's bow is pressed flat under it.
const S_TURN = [[0, 0], [0.2, 0], [0.7, 80, "io"], [0.82, 76, "io"], [1.06, 93, "io"], [1.3, 180, "in"]];
const HIT = 1.3;
const SAD_DUR = 2.6;
// Shut, the book lies flat where its left half lay, in the open book's own view (the open book is a paperback seen from low down: its halves curl up
// off the table, which is why they stand so tall; pressed flat, a half is a shallow, foreshortened slab): on top its cover, lit from above; along the
// front, the edge of its pages between the boards; at the right, the round of its spine. Open, the left cover reaches back to 84; flat, it reaches
// back only DEPTH of that, its outer edge still leaning in toward the back as the open book's do.
const FRONT = 170, BACKY = 84, BOARD = 1.6, DEPTH = 0.3;
const outer = (y) => 5.8 + ((165.5 - y) * 18.6) / 76.6;
// Its thickness on the screen: 12 at the front, less at the back, which is farther off. Past upright the cover rises to it as it comes over (from
// nothing while it's edge-on), and the block of pages under it shows its front edge.
const T_F = 12, T_B = 11;
// A point of a half, by how far it's been pressed flat (f) and raised to the shut book's top (g): its depth from the front shrinks to DEPTH of the
// curled half's, and it rises by the book's thickness there.
const flatten = (f, g = 0) => ([x, y]) => {
  const v = (FRONT - y) / (FRONT - BACKY);
  return [x, FRONT - (FRONT - y) * (1 - f * (1 - DEPTH)) - (T_F + (T_B - T_F) * v) * g];
};
const COVER = [[outer(FRONT), FRONT], [100, FRONT], [100, BACKY], [outer(BACKY), BACKY]];
// A quad with rounded corners (the boards' corners are worn round, as the still's are).
function rounded(P, r) {
  const n = P.length, unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
  let d = "";
  for (let i = 0; i < n; i++) {
    const a = P[(i + n - 1) % n], b = P[i], c = P[(i + 1) % n], u = unit(b, a), v = unit(b, c);
    const p0 = [b[0] + u[0] * r, b[1] + u[1] * r], p1 = [b[0] + v[0] * r, b[1] + v[1] * r];
    d += `${i ? "L" : "M"}${n2(p0[0])} ${n2(p0[1])}C${n2(b[0])} ${n2(b[1])} ${n2(b[0])} ${n2(b[1])} ${n2(p1[0])} ${n2(p1[1])}`;
  }
  return `${d}Z`;
}
// The same, round at its last two corners only (the first two kept as the same curve commands, of no size, so the path keeps its shape of commands).
function roundedFoot(P, r) {
  const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  let d = "";
  for (let i = 0; i < 4; i++) {
    const a = P[(i + 3) % 4], b = P[i], c = P[(i + 1) % 4], u = unit(b, a), v = unit(b, c), k = i < 2 ? 0 : r;
    const p0 = [b[0] + u[0] * k, b[1] + u[1] * k], p1 = [b[0] + v[0] * k, b[1] + v[1] * k];
    d += `${i ? "L" : "M"}${n2(p0[0])} ${n2(p0[1])}C${n2(b[0])} ${n2(b[1])} ${n2(b[0])} ${n2(b[1])} ${n2(p1[0])} ${n2(p1[1])}`;
  }
  return `${d}Z`;
}
// The cover, in the left half's frame (where it lies once shut), flattened and raised as it comes over; its label, a card on its upper half.
const onCover = (Q, u, v) => { const xl = Q[0][0] + (Q[3][0] - Q[0][0]) * v, y = Q[0][1] + (Q[3][1] - Q[0][1]) * v; return [xl + (Q[1][0] - xl) * u, y]; };
const toScreen = (th) => { const c = Math.cos(th * rad), s = Math.sin(th * rad); return ([x, y]) => [-c * x + S * (1 + c), K * s * x + y - S * K * s]; };
const pts = (P) => P.map(([x, y]) => `${n2(x)},${n2(y)}`).join(" ");
function shutCover(th, g) {
  // (the curl goes out of the falling half as it comes down: past upright it straightens, and it's flat by the time it lands)
  const Q = COVER.map(flatten(g, g)), m = toScreen(th);
  const label = [onCover(Q, 0.24, 0.6), onCover(Q, 0.8, 0.6), onCover(Q, 0.8, 0.82), onCover(Q, 0.24, 0.82)];
  // Under the cover, its front edge: the block's front face hangs from the cover's front edge toward the pages' side (left of it while it's upright,
  // below it once it's down), as deep as the book is thick; the boards at either side of it, the pages between, set in a little at the ends.
  const A = m(Q[0]), B = m(Q[1]), h = T_F * g, dir = [-Math.sin(th * rad), -Math.cos(th * rad)];
  const off = (P, k) => [P[0] + dir[0] * h * k, P[1] + dir[1] * h * k];
  const ab = [(B[0] - A[0]) / Math.hypot(B[0] - A[0], B[1] - A[1]), (B[1] - A[1]) / Math.hypot(B[0] - A[0], B[1] - A[1])];
  const inA = [A[0] + ab[0] * 1.2, A[1] + ab[1] * 1.2], inB = [B[0] - ab[0] * 1.2, B[1] - ab[1] * 1.2];
  const f = BOARD / T_F;
  // (only its foot's corners are round: at the top it runs on under the cover's own rounded corners, so nothing shows between them)
  const face = `<path d="${roundedFoot([A, B, off(B, 1), off(A, 1)], 1.2)}" fill="${paint("ink")}"/><polygon points="${pts([off(inA, f), off(inB, f), off(inB, 1 - f), off(inA, 1 - f)])}" fill="${paint("paper-deep")}"/>`;
  // The spine rounds out past the cover's edge at the right, as wide as it's come over (over the left page's gutter edge, which runs to 103.5).
  const R = m(Q[2]), F = off(B, 1), w = 4 * g;
  // (its inner side runs on a little under the cover, so the cover's rounded corners sit on it rather than on the page behind)
  const ins = 1.2 * g;
  const spine = `<path d="M${n2(R[0] - ins)} ${n2(R[1])}L${n2(R[0])} ${n2(R[1])}C${n2(R[0] + w * 0.8)} ${n2(R[1])} ${n2(R[0] + w)} ${n2(R[1] + 1.4)} ${n2(R[0] + w)} ${n2(R[1] + 3)}L${n2(F[0] + w)} ${n2(F[1] - 2.4)}C${n2(F[0] + w)} ${n2(F[1] - 0.8)} ${n2(F[0] + w * 0.8)} ${n2(F[1])} ${n2(F[0])} ${n2(F[1])}L${n2(F[0] - ins)} ${n2(F[1])}Z" fill="${paint("ink")}"/>`;
  // (The cover brightens as it turns to the light, over the whole fall, not in its last fast frames.)
  const top = `<g transform="${back(th)}">${p(rounded(Q, 1.5), "ink")}${over(p(rounded(Q, 1.5), "ink-lit"), ramp(th, 100, 178))}<polygon points="${pts(label)}" fill="${paint("paper-deep")}"/></g>`;
  return `${spine}${face}${top}`;
}
// The left half curls up off the table; the cover, coming down on it, presses it flat (under the cover, where it stays).
const LP = parsePath(LPAGE.d), BAND_RUNS = parsePath(BAND), LL_RUNS = parsePath(LLINES);
// The cast shadow: the still's, from the book's foot down and to the right; its right corner comes in to the spine as the book shuts.
function shadow(shut) {
  // (shut, it starts under the spine's round foot, so no lit table shows in that round)
  const rx = 193.2 + (104 - 193.2) * shut, ry = 167.7 + (167.6 - 167.7) * shut;
  // (and its left side starts from the shut book's front corner, which stands a little left of the open cover's round one)
  const dx = -3.5 * shut, dy = 1.2 * shut;
  return `<polygon points="${n2(6.9 - 1.7 * shut)},${n2(168 + 0.4 * shut)} ${n2(rx)},${n2(ry)} ${n2(rx + (204.4 - ry) * 2)},204.4 ${n2(89.5 + dx)},204.4 ${n2(87.8 + dx)},203.3 ${n2(9.5 + dx)},${n2(169 + dy)}" fill="${paint("violet-deep")}"/>`;
}
function sad(t) {
  if (t <= 0) return STILL;
  const th = track(S_TURN, t), shut = (1 - Math.cos(th * rad)) / 2;
  const hop = t < HIT ? 0 : -track([[0, 0], [0.07, 4.2, "out"], [0.17, 0, "in"], [0.23, 0.9, "out"], [0.29, 0, "in"]], t - HIT);
  // (the cover meets the curled half on its way down and presses it as it comes, under it: shut, the half is flat)
  const flat = t >= HIT ? 1 : th < 115 ? 0 : (th - 115) / 65;
  const press = flatten(flat);
  // (open, the spine's foot rounds down below the gutter; as the book shuts, the spine turns to the side, and that round comes up level with the front)
  const g = th < 90 ? 0 : -Math.cos(th * rad);
  const spineFoot = runsToD(BAND_RUNS, (x, y) => (y > FRONT ? [x, FRONT + (y - FRONT) * (1 - g)] : press([x, y])));
  const left = `${p(runsToD(LP, (x, y) => press([x, y])), "paper")}<g clip-path="url(#lh)">${p(spineFoot, "ink", ' fill-rule="evenodd"')}</g>${p(runsToD(LL_RUNS, (x, y) => press([x, y])), "ink")}`;
  let book;
  if (th < 90) {
    const leaf = `<g transform="${front(th)}">${frontFace(th, `<g clip-path="url(#rh)">${p(BAND, "ink", ' fill-rule="evenodd"')}</g>`)}</g>`;
    book = `${left}${leaf}`;
  } else {
    // Past upright it's the cover's outside we see, the same cover and label from there until it lies shut (nothing appears as it lands).
    book = `${left}${shutCover(th, g)}`;
  }
  return `${OPEN}${halves}${BG}${TABLE}${shadow(shut)}<g transform="translate(0 ${n2(hop)})">${book}</g></svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
