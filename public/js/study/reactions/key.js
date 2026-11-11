// The key's two stories. Both: the key swings round, tip up, as a padlock hanging on a chain comes into the frame above it, and goes up into the
// keyway in the padlock's bottom (where a padlock's keyway is: the face has none). Happy: it turns, the lock gives, and the body drops down the shackle's
// long leg, hanging open. Sad: it won't turn; you try again; a beat; you force it, it snaps, and the bow drops to the floor and tips over onto its side,
// while the lock doesn't care.
// Every frame is a pure function of t, in seconds. World units are the still's reference pixels. Light from the left: the key's dark half is fixed in
// the world, so it stays on the right whichever way the key turns.
import { n2, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-sun,#F7BE45)\"/><clipPath id=\"ks\"><rect x=\"-500\" y=\"-478.47\" width=\"756.62\" height=\"1275.92\"/></clipPath><g clip-path=\"url(#ks)\"><path fill=\"var(--art-sun-deep,#DB9A22)\" fill-rule=\"evenodd\" d=\"M88.83 127.22C104.77 148.38 120.71 169.53 136.66 190.69C140.81 196.2 147.58 199.07 154.42 198.23C161.26 197.39 167.14 192.96 169.83 186.62C172.53 180.27 171.63 172.97 167.48 167.46C153.91 149.45 140.34 131.44 126.76 113.43C134.97 102.89 137.03 88.8 132.19 76.35C127.34 63.9 116.31 54.91 103.14 52.68C89.96 50.46 76.59 55.32 67.92 65.49C59.25 75.66 56.57 89.63 60.86 102.29C65.14 114.94 75.77 124.41 88.83 127.22ZM97 90.37C100.64 87.62 102.54 83.15 101.99 78.62C101.43 74.1 98.5 70.21 94.31 68.43C90.11 66.65 85.29 67.24 81.64 69.99C78 72.73 76.1 77.21 76.66 81.73C77.21 86.26 80.14 90.14 84.34 91.92C88.53 93.7 93.36 93.11 97 90.37Z\"/></g><g transform=\"translate(0 0)\"><clipPath id=\"lb\"><rect x=\"239.23\" y=\"86.6\" width=\"192.82\" height=\"147.05\" rx=\"14.35\"/></clipPath><path transform=\"rotate(0 288.04 86.6)\" fill=\"none\" stroke=\"var(--art-ink,#231F3B)\" stroke-width=\"26.16\" stroke-linecap=\"round\" d=\"M288.04 159.49L288.04 64.59A57.26 57.26 0 0 1 402.55 64.59L402.55 82.93\"/><rect x=\"239.23\" y=\"86.6\" width=\"192.82\" height=\"147.05\" rx=\"14.35\" fill=\"var(--art-violet,#7C5CE6)\"/><path clip-path=\"url(#lb)\" fill=\"var(--art-violet-deep,#5E40C4)\" d=\"M369.7 79.74C384.37 121.21 387.56 175.44 363.96 239.23L446.57 239.23L446.57 79.74Z\"/><rect x=\"247.85\" y=\"134.93\" width=\"17.38\" height=\"55.18\" rx=\"8.69\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"331.1\" cy=\"143.7\" r=\"18.82\" fill=\"var(--art-ink,#231F3B)\"/><path fill=\"var(--art-ink,#231F3B)\" d=\"M319.62 153.11L342.58 153.11L346.41 190.91L315.79 190.91Z\"/></g><g clip-path=\"url(#ks)\"><clipPath id=\"kkd\"><polygon points=\"-319.3,-460.59 439.11,565.46 952.52,185.98 194.11,-840.08\"/></clipPath><clipPath id=\"kkl\"><polygon points=\"-318.92,-460.87 439.49,565.18 -73.54,944.38 -831.94,-81.67\"/></clipPath><g clip-path=\"url(#kkd)\"><path fill=\"var(--art-ink,#231F3B)\" fill-rule=\"evenodd\" d=\"M70.18 88.52C81.07 102.87 91.97 117.22 102.87 131.58C113.77 145.93 124.67 160.29 135.57 174.64C139.07 179.74 142.9 182.93 147.53 182.93C149.92 183.41 152.79 182.62 155.02 181.18C161.72 177.03 166.51 170.97 166.51 163.16C166.51 159.38 166.51 155.61 166.51 151.83C166.14 151.46 165.76 151.09 165.39 150.72C161.35 150.72 157.31 150.72 153.27 150.72C153.27 145.03 153.27 139.34 153.27 133.65C152.9 133.28 152.53 132.91 152.15 132.54C147.53 132.54 142.9 132.54 138.28 132.54C138.28 126.85 138.28 121.16 138.28 115.47C137.91 115.1 137.53 114.73 137.16 114.35C132.06 114.35 126.95 114.35 121.85 114.35C121.85 108.72 121.85 103.08 121.85 97.45C121.48 97.08 121.11 96.7 120.73 96.33C116.69 96.33 112.65 96.33 108.61 96.33C102.71 88.41 96.81 80.49 90.91 72.57C98.5 63.26 100.06 50.78 96.08 39.51C92.1 28.24 83.04 19.5 71.63 15.93C60.23 12.36 47.8 14.37 38.1 21.35C28.4 28.34 22.56 39.48 22.34 51.43C22.11 63.38 27.52 74.74 36.95 82.09C46.38 89.44 58.71 91.92 70.25 88.78ZM60.48 52.41C64.12 49.66 66.02 45.19 65.46 40.66C64.91 36.14 61.98 32.25 57.79 30.47C53.59 28.69 48.76 29.28 45.12 32.03C41.48 34.77 39.58 39.25 40.14 43.77C40.69 48.3 43.62 52.18 47.81 53.96C52.01 55.74 56.84 55.15 60.48 52.41Z\"/></g><g clip-path=\"url(#kkl)\"><path fill=\"var(--art-paper,#FBF7EC)\" fill-rule=\"evenodd\" d=\"M70.18 88.52C81.07 102.87 91.97 117.22 102.87 131.58C113.77 145.93 124.67 160.29 135.57 174.64C139.07 179.74 142.9 182.93 147.53 182.93C149.92 183.41 152.79 182.62 155.02 181.18C161.72 177.03 166.51 170.97 166.51 163.16C166.51 159.38 166.51 155.61 166.51 151.83C166.14 151.46 165.76 151.09 165.39 150.72C161.35 150.72 157.31 150.72 153.27 150.72C153.27 145.03 153.27 139.34 153.27 133.65C152.9 133.28 152.53 132.91 152.15 132.54C147.53 132.54 142.9 132.54 138.28 132.54C138.28 126.85 138.28 121.16 138.28 115.47C137.91 115.1 137.53 114.73 137.16 114.35C132.06 114.35 126.95 114.35 121.85 114.35C121.85 108.72 121.85 103.08 121.85 97.45C121.48 97.08 121.11 96.7 120.73 96.33C116.69 96.33 112.65 96.33 108.61 96.33C102.71 88.41 96.81 80.49 90.91 72.57C98.5 63.26 100.06 50.78 96.08 39.51C92.1 28.24 83.04 19.5 71.63 15.93C60.23 12.36 47.8 14.37 38.1 21.35C28.4 28.34 22.56 39.48 22.34 51.43C22.11 63.38 27.52 74.74 36.95 82.09C46.38 89.44 58.71 91.92 70.25 88.78ZM60.48 52.41C64.12 49.66 66.02 45.19 65.46 40.66C64.91 36.14 61.98 32.25 57.79 30.47C53.59 28.69 48.76 29.28 45.12 32.03C41.48 34.77 39.58 39.25 40.14 43.77C40.69 48.3 43.62 52.18 47.81 53.96C52.01 55.74 56.84 55.15 60.48 52.41Z\"/></g></g></svg>";
export const STILL_HASH = "b4150ec065";

const U = 200 / 1254;
const rad = Math.PI / 180;
const line = (a, b) => [a, [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], [a[0] + (2 * (b[0] - a[0])) / 3, a[1] + (2 * (b[1] - a[1])) / 3], b];
function arc(c, r, a0, a1) {
  const n = Math.ceil(Math.abs(a1 - a0) / 60), out = [], step = ((a1 - a0) / n) * rad, k = (4 / 3) * Math.tan(step / 4);
  for (let i = 0; i < n; i++) {
    const s = a0 * rad + i * step, e = s + step, p = [Math.cos(s), Math.sin(s)], q = [Math.cos(e), Math.sin(e)];
    out.push([[c[0] + r * p[0], c[1] + r * p[1]], [c[0] + r * (p[0] - k * p[1]), c[1] + r * (p[1] + k * p[0])], [c[0] + r * (q[0] + k * q[1]), c[1] + r * (q[1] - k * q[0])], [c[0] + r * q[0], c[1] + r * q[1]]]);
  }
  return out;
}
const R = 238;
const TH0 = 53, BOW0 = [378, 327];
const AX = [Math.cos(TH0 * rad), Math.sin(TH0 * rad)], AY = [AX[1], -AX[0]];
// The key's own frame: u along the blade, v toward its teeth. The stairs are square to the still's frame, so they're placed there and carried over.
const L_ = (x, y) => [(x - BOW0[0]) * AX[0] + (y - BOW0[1]) * AX[1], (x - BOW0[0]) * AY[0] + (y - BOW0[1]) * AY[1]];
const STAIRS = [[681, 604], [757, 604], [764, 611], [764, 717], [860, 717], [867, 724], [867, 831], [954, 831], [961, 838], [961, 945], [1037, 945], [1044, 952], [1044, 1023]].map((q) => L_(q[0], q[1]));
const polyline = (list) => list.slice(1).map((q, i) => line(list[i], q));
const TOP = L_(570, 455), LOW = L_(440, 555), LOW2 = L_(850, 1095), TIP = L_(925, 1147), TIP2 = L_(972, 1136);
const OUT = [
  line(LOW, [(LOW[0] + LOW2[0]) / 2, (LOW[1] + LOW2[1]) / 2]), line([(LOW[0] + LOW2[0]) / 2, (LOW[1] + LOW2[1]) / 2], LOW2),
  [LOW2, L_(872, 1127), L_(896, 1147), TIP], [TIP, L_(940, 1150), L_(958, 1145), TIP2], [TIP2, L_(1014, 1110), L_(1044, 1072), STAIRS[12]],
  ...polyline([...STAIRS].reverse()), line(STAIRS[0], TOP),
  ...arc([0, 0], R, Math.atan2(TOP[1], TOP[0]) / rad, 360 + Math.atan2(LOW[1], LOW[0]) / rad),
];
const HOLE = arc([-78, 0], 80, 0, 360);
// the light's fixed split, through the bow, read off the still
const SPLIT_TH = 53.53;
const DIR = [Math.cos(SPLIT_TH * rad), Math.sin(SPLIT_TH * rad)], NRM = [DIR[1], -DIR[0]];
/** The cast shadow's outline: the bow, and a plain capsule for the blade, with no teeth: a designed shadow, not a copy. Its blade is the still's: broad
 *  and short. */
function shadowOut() {
  const lo = -180, hi = 62, end = 654, r = (hi - lo) / 2, mid = (hi + lo) / 2;
  const ul = Math.sqrt(Math.max(R * R - lo * lo, 0)), uh = Math.sqrt(Math.max(R * R - hi * hi, 0));
  return [line([ul, lo], [end, lo]), ...arc([end, mid], r, -90, 90), line([end, hi], [uh, hi]), ...arc([0, 0], R, Math.atan2(hi, uh) / rad, 360 + Math.atan2(lo, ul) / rad)];
}
const SHADOW = shadowOut();

// The world: the padlock hangs by its shackle from the bottom link of a chain that comes down from above the frame. Its keyway is in the middle of its
// bottom face, at KX; the key goes up into it to the shoulder (INSERT along the blade) and the rest of the blade is inside, behind the body's face.
const KX = 1900, KB = 1450, INSERT = 673;
const BODY = { x: KX - 560, y: 650, w: 1120, h: KB - 650, r: 110 };
const LEG = 330, ARC_TOP = 150, SH_W = 150;
const FLOOR = 2700;
const KEY_IN = [KX, KB + INSERT];
const T = 1.02;
// Until it's under the keyway the key is in front of the lock (it swings round between the lock and you); from there it goes up into it, behind
// the body's face. (The two don't overlap at the moment the order changes.)
const UNDER = 0.82;
// The view pulls back, slowly enough that the lock comes in over the frame's edge at a pace the eye follows.
const CAM = {
  z: [[0, 1], [0.04, 1], [0.9, 0.4, "io"]],
  x: [[0, 627], [0.04, 627], [0.9, KX, "io"]],
  y: [[0, 627], [0.04, 627], [0.9, 1250, "io"]],
};
// The key swings round, tip up, and comes down under the lock, low, so it's never in front of it; then up it goes, into the keyway, and stops at the
// shoulder with a thud the lock feels.
const COMMON = {
  th: [[0, TH0], [0.12, TH0 + 7, "io"], [0.68, -95, "io"], [0.8, -90, "io"]],
  x: [[0, BOW0[0]], [0.12, BOW0[0] - 26, "io"], [0.74, KX, "io"]],
  y: [[0, BOW0[1]], [0.12, BOW0[1] - 30, "io"], [0.74, KEY_IN[1] + 420, "io"], [0.86, KEY_IN[1] + 450, "out"], [T, KEY_IN[1], "in"]],
  // the cast shadow on the surface the key lay on in the still: it falls away as the key's lifted off it
  shadow: [[0, 1], [0.04, 1], [0.4, 0, "io"]],
  thud: [[T, 0], [T + 0.025, -16, "out"], [T + 0.12, 0, "io"]],
};
const HAPPY = {
  dur: 2.3,
  // a quarter turn, with a catch just before it gives
  turn: [[0, 1], [T + 0.15, 1], [T + 0.21, 1.05, "out"], [T + 0.42, 0.46, "io"], [T + 0.47, 0.54, "out"], [T + 0.56, 0.5, "io"]],
  // it gives: the shackle's short leg is free, and the body (with the key in it) drops down the long leg to its stop, and jolts there
  drop: [[T + 0.42, 0], [T + 0.54, 250, "in"], [T + 0.6, 226, "out"], [T + 0.67, 250, "in"], [T + 0.72, 244, "out"], [T + 0.77, 250, "in"]],
};
const SNAP = T + 0.86, G = 3600;
const SAD = {
  turn: [[0, 1], [T + 0.1, 1], [T + 0.17, 0.84, "out"], [T + 0.25, 1, "io"], [T + 0.3, 1], [T + 0.37, 0.76, "out"], [T + 0.44, 1, "io"], [T + 0.62, 1], [SNAP - 0.03, 0.56, "in"], [SNAP, 0.56]],
  shake: [[T + 0.17, 0], [T + 0.175, 0.6, "out"], [T + 0.25, 0, "io"], [T + 0.37, 0], [T + 0.375, 1, "out"], [T + 0.45, 0, "io"], [T + 0.66, 0], [SNAP - 0.01, 1.8, "in"], [SNAP + 0.1, 0, "out"]],
};
// The broken-off piece: the bow and the shank below the break. It drops from rest, a little turn on it from the forcing, lands on its bow, and tips over
// onto its side under its own weight, faster and faster, until the shank's end meets the floor; a small bounce, and it lies still.
const BREAK_U = 540;
// (the angle it tips to: where the shank's own lower edge, not its middle, meets the floor, with the bow resting on it)
const LAND_TH = (() => {
  const pts = OUT.flatMap((sg) => sg).filter(([u]) => u > 200 && u < BREAK_U);
  for (let a = 0; a <= 90; a += 0.25) if (Math.max(...pts.map(([u, v]) => u * Math.sin(a * rad) + v * Math.cos(a * rad))) >= R) return a;
  return 90;
})();
const FALL = Math.sqrt((2 * (FLOOR - R - KEY_IN[1])) / G), DOWN = SNAP + FALL;
const TIP_T = 0.34;
const SAD_DUR = DOWN + TIP_T + 0.6;

function makeView(t) {
  const z = track(CAM.z, t), cx = track(CAM.x, t), cy = track(CAM.y, t);
  return { z, map: (x, y) => [((x - cx) * z + 627) * U, ((y - cy) * z + 627) * U] };
}
function keyPath(view, X, Y, th, vs, jx = 0, outline = OUT) {
  const c = Math.cos(th * rad), s = Math.sin(th * rad);
  const map = (q) => { const u = q[0], w = q[1] * vs; return view.map(X + jx + u * c + w * s, Y + u * s - w * c); };
  const ring = (segs) => {
    let d = "";
    segs.forEach((g0, i) => {
      const [a, b, e, f] = g0.map(map);
      if (!i) d += `M${n2(a[0])} ${n2(a[1])}`;
      d += `C${n2(b[0])} ${n2(b[1])} ${n2(e[0])} ${n2(e[1])} ${n2(f[0])} ${n2(f[1])}`;
    });
    return `${d}Z`;
  };
  return ring(outline) + ring(HOLE);
}
function halfPlane(view, cx, cy, side, from) {
  // the side of the split line that faces away from the light (1), or toward it (-1). `from` moves the edge, so the dark runs a little under the lit.
  const q = (a, b) => view.map(cx + DIR[0] * a + NRM[0] * b, cy + DIR[1] * a + NRM[1] * b);
  return [q(-4000, from), q(4000, from), q(4000, side * 4000), q(-4000, side * 4000)].map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
}
function drawKey(d, view, X, Y, id) {
  const dark = halfPlane(view, X, Y, 1, -3), lit = halfPlane(view, X, Y, -1, 0);
  return `<clipPath id="${id}d"><polygon points="${dark}"/></clipPath><clipPath id="${id}l"><polygon points="${lit}"/></clipPath><g clip-path="url(#${id}d)"><path fill="${paint("ink")}" fill-rule="evenodd" d="${d}"/></g><g clip-path="url(#${id}l)"><path fill="${paint("paper")}" fill-rule="evenodd" d="${d}"/></g>`;
}
// The chain down from above the frame, and the padlock on it: the shackle (behind the body: its legs go into it), the body with its shaded side.
// `drop` lowers the body down the shackle's long leg once it's open; `jy` jolts the whole lock (the chain gives a little).
function lock(view, drop, jy) {
  const m = view.map, z = view.z * U;
  const p = (x, y) => { const q = m(x, y + jy); return `${n2(q[0])} ${n2(q[1])}`; };
  const lr = (a) => n2(a * z);
  const L = KX - LEG, Rr = KX + LEG, cy = ARC_TOP + LEG;
  // the shackle: the long leg (left) runs well down into the body, so the body can slide on it; the short leg (right) only just in
  const shackle = `<path fill="none" stroke="${paint("ink")}" stroke-width="${lr(SH_W)}" stroke-linecap="round" d="M${p(L, BODY.y + 420)}L${p(L, cy)}A${lr(LEG)} ${lr(LEG)} 0 0 1 ${p(Rr, cy)}L${p(Rr, BODY.y + 60)}"/>`;
  // the chain: links from above the frame down to the one the shackle hangs in (its near side over the shackle, its far side behind)
  let chain = "";
  const LINK_H = 300, LINK_W = 150, sw = lr(46);
  for (let i = 0; i < 4; i++) {
    const cyl = ARC_TOP - 40 - (i + 0.5) * (LINK_H - 70), w = i % 2 ? 46 : LINK_W;
    const [cx0, cy0] = m(KX, cyl + jy);
    chain += `<rect x="${n2(cx0 - (w / 2) * z)}" y="${n2(cy0 - (LINK_H / 2) * z)}" width="${n2(w * z)}" height="${n2(LINK_H * z)}" rx="${n2((Math.min(w, LINK_H) / 2) * z)}" fill="none" stroke="${paint("steel-deep")}" stroke-width="${sw}"/>`;
  }
  const [lx, ly] = m(KX, ARC_TOP - 40 + jy);
  const lastBack = `<path fill="none" stroke="${paint("steel-deep")}" stroke-width="${sw}" stroke-linecap="round" d="M${n2(lx)} ${n2(ly - 110 * z)}C${n2(lx + 70 * z)} ${n2(ly - 110 * z)} ${n2(lx + 75 * z)} ${n2(ly + 80 * z)} ${n2(lx)} ${n2(ly + 90 * z)}"/>`;
  const lastFront = `<path fill="none" stroke="${paint("steel-deep")}" stroke-width="${sw}" stroke-linecap="round" d="M${n2(lx)} ${n2(ly + 90 * z)}C${n2(lx - 75 * z)} ${n2(ly + 80 * z)} ${n2(lx - 70 * z)} ${n2(ly - 110 * z)} ${n2(lx)} ${n2(ly - 110 * z)}"/>`;
  const tl = m(BODY.x, BODY.y + drop + jy), W = BODY.w * z, Hh = BODY.h * z;
  const clip = `<clipPath id="lb"><rect x="${n2(tl[0])}" y="${n2(tl[1])}" width="${n2(W)}" height="${n2(Hh)}" rx="${n2(BODY.r * z)}"/></clipPath>`;
  const q = (x, y) => p(x, y + drop);
  const accent = `<path clip-path="url(#lb)" fill="${paint("violet-deep")}" d="M${q(KX + 300, BODY.y - 50)}C${q(KX + 390, BODY.y + 230)} ${q(KX + 410, BODY.y + 560)} ${q(KX + 260, KB + 50)}L${q(KX + 700, KB + 50)}L${q(KX + 700, BODY.y - 50)}Z"/>`;
  const body = `<rect x="${n2(tl[0])}" y="${n2(tl[1])}" width="${n2(W)}" height="${n2(Hh)}" rx="${n2(BODY.r * z)}" fill="${paint("violet")}"/>`;
  return `${chain}${lastBack}${clip}${shackle}${lastFront}${body}${accent}`;
}
function stage(view) {
  const f = view.map(0, FLOOR);
  let s = `<rect width="200" height="200" fill="${paint("sun")}"/>`;
  if (f[1] < 203) s += `<rect x="-5" y="${n2(f[1])}" width="210" height="${n2(Math.max(0, 205 - f[1]))}" fill="${paint("sun-deep")}"/><rect x="-5" y="${n2(f[1])}" width="210" height="${n2(14 * view.z * U * 2)}" fill="${paint("sun-lit")}"/>`;
  return s;
}
const open = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
function common(t) {
  const view = makeView(t);
  return { view, th: track(COMMON.th, t), X: track(COMMON.x, t), Y: track(COMMON.y, t), sh: track(COMMON.shadow, t), thud: track(COMMON.thud, t) };
}
// The key's cast shadow on the surface it lay on in the still, offset down and right, falling away as it's lifted.
function keyShadow(c, vs) {
  if (c.sh <= 0) return "";
  const ds = keyPath(c.view, c.X + 229 * c.sh, c.Y + 238 * c.sh, c.th, vs, 0, SHADOW);
  return `<path fill="${paint("sun-deep")}" fill-rule="evenodd" d="${ds}"${c.sh < 1 ? ` opacity="${n2(c.sh)}"` : ""}/>`;
}

function happy(t) {
  if (t <= 0) return STILL;
  const c = common(t), H = HAPPY, vs = track(H.turn, t), drop = track(H.drop, t);
  // once it's in, the key goes where the body goes
  const kY = c.Y + (t >= T ? drop : 0);
  const d = keyPath(c.view, c.X, kY, c.th, vs);
  const key = `${keyShadow(c, vs)}${drawKey(d, c.view, c.X, kY, "kk")}`, lk = lock(c.view, drop, c.thud);
  return `${open}${stage(c.view)}${t < UNDER ? lk + key : key + lk}</svg>`;
}

const JAG = [[522, -300], [530, -95], [552, -52], [522, -8], [560, 34], [528, 86], [552, 300]];
function sad(t) {
  if (t <= 0) return STILL;
  const c = common(t), S = SAD, vs = track(S.turn, t), sh = track(S.shake, t);
  // forcing it: the key shakes with the effort, and the lock with it a little
  const jx = sh * Math.sin(t * 2 * Math.PI * 27) * 7, ly = c.thud + sh * Math.sin(t * 2 * Math.PI * 31) * 3;
  let keys;
  if (t < SNAP) keys = `${keyShadow(c, vs)}${drawKey(keyPath(c.view, c.X, c.Y, c.th, vs, jx), c.view, c.X, c.Y, "kk")}`;
  else {
    // Two pieces, cut by a jagged line across the shank in the key's own frame. The stub stays in the keyway; the rest falls.
    const local = (X, Y, th, vsc) => (q) => { const co = Math.cos(th * rad), si = Math.sin(th * rad), w = q[1] * vsc; return c.view.map(X + q[0] * co + w * si, Y + q[0] * si - w * co); };
    const poly = (arr, mp) => arr.map(mp).map((p) => `${n2(p[0])},${n2(p[1])}`).join(" ");
    const stubD = keyPath(c.view, KEY_IN[0], KEY_IN[1], -90, 1);
    keys = `<clipPath id="kc"><polygon points="${poly([...JAG, [1400, 300], [1400, -300]], local(KEY_IN[0], KEY_IN[1], -90, 1))}"/></clipPath><g clip-path="url(#kc)">${drawKey(stubD, c.view, KEY_IN[0], KEY_IN[1], "kk")}</g>`;
    let X, Y, th;
    if (t < DOWN) {
      // falling, from rest, turning a little from the twist it was given
      const s = t - SNAP;
      X = KEY_IN[0] + 30 * (s / FALL); Y = KEY_IN[1] + 0.5 * G * s * s; th = -90 + 9 * (s / FALL);
    } else {
      // on its bow on the floor: it tips over onto its side, faster and faster, and the shank's end lands; a small bounce, and still
      const b = t - DOWN;
      X = KEY_IN[0] + 30 + 40 * Math.min(1, b / TIP_T); Y = FLOOR - R;
      const tip = track([[0, -81], [TIP_T, LAND_TH, "in"], [TIP_T + 0.07, LAND_TH - 6, "out"], [TIP_T + 0.14, LAND_TH, "in"], [TIP_T + 0.19, LAND_TH - 1.5, "out"], [TIP_T + 0.24, LAND_TH, "in"]], b);
      th = 180 - tip;
    }
    const fall = keyPath(c.view, X, Y, th, 1);
    keys += `<clipPath id="kp"><polygon points="${poly([...JAG, [-400, 300], [-400, -300]], local(X, Y, th, 1))}"/></clipPath><g clip-path="url(#kp)">${drawKey(fall, c.view, X, Y, "kj")}</g>`;
  }
  const lk = lock(c.view, 0, ly);
  return `${open}${stage(c.view)}${t < UNDER ? lk + keys : keys + lk}</svg>`;
}

export const REACTIONS = { happy: { dur: HAPPY.dur }, sad: { dur: SAD_DUR } };
export const frame = (name, t) => (name === "happy" ? happy(Math.min(t, HAPPY.dur)) : sad(Math.min(t, SAD_DUR)));
