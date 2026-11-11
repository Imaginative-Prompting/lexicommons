// Old's two stories: a draft along the floor stirs the dangling lace and tugs at the old patch (under it, the hole it mends). Happy: its loose
// top corner lifts and flutters, and the stitches hold: it lies back down flat, the old repair still doing its job. Sad: the top stitches give:
// the patch folds down and hangs by its bottom ones, swinging; those go too and it drops to the floor in front of the sole, leaving the hole
// open and the broken thread ends in the leather.
// Every frame is a pure function of t, in seconds. Shapes come from the still's own, in the 200-unit view.
import { n2, n4, paint, track } from "./kit.js";

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\"><rect width=\"200\" height=\"200\" fill=\"var(--art-violet,#7C5CE6)\"/><rect y=\"146\" width=\"200\" height=\"54\" fill=\"var(--art-violet-lit,#A68CFF)\"/><path d=\"M20 161 C60 165 110 162 183 156 L200 158 L200 198 C150 186 80 174 22 165 Z\" fill=\"var(--art-violet-deep,#5E40C4)\"/><path d=\"M80 122 L88 68 C89 62 97 61 100 64 L112 96 L104 122 Z\" fill=\"var(--art-clay-deep,#C25626)\"/><path d=\"M16 152 C10 134 18 121 36 119 C54 117 72 118 84 118 L106 82 C116 76 128 78 140 74 C154 68 164 64 172 64 Q180 66 182 76 C186 92 186 106 186 118 C186 132 185 142 183 150 L100 154 L18 156 Z\" fill=\"var(--art-clay-deeper,#9C4219)\"/><path d=\"M112 81 C124 80 132 79 141 76 C154 70 164 67 171 67 C175 73 173 80 167 86 C150 92 128 90 112 81 Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><path d=\"M160 70 C164 68 168 67 171 67 C175 73 173 80 167 86 C163 83 161 77 160 70 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M111 80 C128 90 150 92 167 85 C168 86.5 168 88 167 89 C150 95 126 93 110 83 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M182 76 C186 92 186 106 186 118 C186 132 185 142 183 150 L150 152 C150 132 158 118 168 106 C176 97 180 88 182 76 Z\" fill=\"var(--art-bark,#7A4E2D)\"/><path d=\"M16 152 C10 134 18 121 36 119 C46 118 54 119 60 121 C56 130 56 142 60 153 Z\" fill=\"var(--art-clay-deep,#C25626)\"/><polygon points=\"33.5,121 35,121 33,128 37,134 34,141 35.5,147 34,147 32.5,141 35.4,134 31.5,128\" fill=\"var(--art-bark-deep,#4B2F24)\"/><polygon points=\"35,133.2 43,132 46.5,137 45.3,137.6 42.3,133.4 35.6,134.6\" fill=\"var(--art-bark-deep,#4B2F24)\"/><polygon points=\"22,135 27,137 26.2,142 25,142 25.7,138 21.6,136.2\" fill=\"var(--art-bark-deep,#4B2F24)\"/><polygon points=\"123,104 154,99 159,126 127,130\" fill=\"var(--art-sun,#F7BE45)\"/><polygon points=\"131.9,100 133.1,99.8 133.9,104.8 132.7,105\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"144.5,98 145.7,97.8 146.5,102.8 145.3,103\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"153.2,108.5 158.2,107.7 158.4,108.9 153.4,109.7\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"155.1,119 160.1,118.2 160.3,119.4 155.3,120.2\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"148.1,124.8 149.3,124.8 149.9,129.8 148.7,129.8\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"136.1,126.3 137.3,126.3 137.9,131.3 136.7,131.3\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"123.3,121.8 128.3,121 128.5,122.2 123.5,123\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"121.7,112.4 126.7,111.6 126.9,112.8 121.9,113.6\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M13 148 C20 151 60 151 100 149 L184 145 C186 150 185 156 182 158 L112 161 C80 164 40 165 22 161 C14 159 11 153 13 148 Z\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M176 145.3 L184 145 C186 150 185 156 182 158 L176 158.3 Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><path d=\"M104 152 L114 151 L116 153.5 L124 152 L127 155 L118 156.5 L108 155.5 Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/><circle cx=\"91\" cy=\"113\" r=\"2.2\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"97\" cy=\"103\" r=\"2.2\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"103\" cy=\"93\" r=\"2.2\" fill=\"var(--art-ink,#231F3B)\"/><polygon points=\"91.8,111.6 91,114.6 82.4,107 83,103.5\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"97.8,101.6 97,104.6 83.4,97 84,93.5\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"103.8,91.6 103,94.6 84.8,87 85.4,83.5\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M85 83 C76 88 70 100 66 114 L64 119 L67 120 L69 115 C73 102 79 91 87 86 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"64,118.5 61,123 64.5,121.5 64,125 66.5,121.5 68.5,123.5 67.4,119.6\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M102 93 C98 110 90 128 92 146 C93 160 100 170 112 175 L113.5 172.3 C104 167 97 158 95.5 146 C94.5 128 102 112 105 95 Z\" fill=\"var(--art-paper,#FBF7EC)\"/><polygon points=\"111,175.6 117,177 113.5,178 117.5,181 112,179.5 112.5,183 109.8,177.5 113.5,172.3\" fill=\"var(--art-paper,#FBF7EC)\"/></svg>\n";
export const STILL_HASH = "940e9ac705";
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">';
const EL = [...STILL.matchAll(/<(?:rect|path|ellipse|circle|polygon)[^>]*\/>/g)].map((m) => m[0]);
if (EL.length !== 35) throw new Error("old: the still isn't as this story knows it");
const fill = (t) => `fill="${paint(t)}"`;
const pts = (P) => P.map(([x, y]) => `${n2(x)},${n2(y)}`).join(" ");
// the still's order: room and shoe, the patch (13) and its stitches (14–21), the sole and the rest, the long lace last (33, 34)
const BEFORE = EL.slice(0, 13).join(""), STITCHES = EL.slice(14, 22).join(""), AFTER = EL.slice(22, 33).join(""), LACE = EL[33] + EL[34];
const TL = [123, 104], TR = [154, 99], BR = [159, 126], BL = [127, 130];
const PATCH = EL[13];
// the hole it mends: ragged, a little inside it, the shoe's dark lining through it
const HOLE = `<polygon points="127.5,107.5 133,104.6 135.5,106.8 141,104.1 145.5,105.6 150.2,103 153,106.5 154.4,112 152.6,115.5 155.6,120.8 151,123.2 145,122.6 140.5,125.1 134,124.4 130.2,126.4 128.8,121 126.8,117.3 128.3,112.4" ${fill("bark-deep")}/>`;
// each stitch straddles the patch's edge: the half on the patch goes with it, the half on the leather stays (a broken thread end)
const P_D = `M${TL.join(" ")}L${TR.join(" ")}L${BR.join(" ")}L${BL.join(" ")}Z`;
const CLIPS = `<clipPath id="on"><path d="${P_D}"/></clipPath><clipPath id="off"><path d="M0 0H200V200H0Z${P_D}" clip-rule="evenodd"/></clipPath>`;
const THREAD_ENDS = `<g clip-path="url(#off)">${STITCHES}</g>`;
/** The patch with its halves of the stitches, its front to us; seen from the back once it's turned past edge on, without them. */
// (both faces are the same parts, the patch under a shade: its front's shade grows as it tips away from the light, its back is in it; so it
// stays one thing as it turns over)
const patchFace = (back, shade = 0) => back ? `${PATCH}<path d="${P_D}" ${fill("sun-deep")}/>`
  : `${PATCH}<g clip-path="url(#on)">${STITCHES}</g>${shade > 0.005 ? `<path d="${P_D}" ${fill("sun-deep")} opacity="${n2(Math.min(1, shade))}"/>` : ""}`;
const frameOf = (inner) => `${OPEN}${CLIPS}${inner}</svg>`;
// the lace stirs in the draft, swinging about its top at the eyelet
const LACE_TOP = [103.5, 94];
const lace = (a) => (Math.abs(a) < 0.01 ? LACE : `<g transform="rotate(${n2(a)} ${LACE_TOP[0]} ${LACE_TOP[1]})">${LACE}</g>`);
const draft = (t) => track([[0.15, 0], [0.4, 3.2, "io"], [0.62, -1.4, "io"], [0.85, 2, "io"], [1.1, -0.6, "io"], [1.45, 0, "io"]], t);

/** Folding about the line a–b by φ: what's off the line comes towards us, so we see it shortened across the line (an affine map). */
function foldMatrix(a, b, phi) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l, k = 1 - Math.cos(phi), d = a[0] * nx + a[1] * ny;
  return [1 - k * nx * nx, -k * nx * ny, -k * nx * ny, 1 - k * ny * ny, k * d * nx, k * d * ny];
}
const matrix = (m) => `matrix(${m.slice(0, 4).map(n4).join(" ")} ${n2(m[4])} ${n2(m[5])})`;
const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

// ---- happy. The loose top right corner lifts in the draft, folding back about a line across it 40% in along each edge, flutters, and lies
// back down flat; the hole shows a little under it while it's up.
const P1 = lerp(TR, TL, 0.4), P2 = lerp(TR, BR, 0.4);
const BODY = `M${TL.join(" ")}L${n2(P1[0])} ${n2(P1[1])}L${n2(P2[0])} ${n2(P2[1])}L${BR.join(" ")}L${BL.join(" ")}Z`;
const CORNER = `M${n2(P1[0])} ${n2(P1[1])}L${TR.join(" ")}L${n2(P2[0])} ${n2(P2[1])}Z`;
const HAPPY_DUR = 1.4 + 0.6;
function happy(t) {
  if (t <= 0) return STILL;
  const lift = (Math.PI / 180) * track([[0.2, 0], [0.42, 70, "out"], [0.58, 35, "io"], [0.74, 58, "io"], [0.95, 14, "io"], [1.1, 22, "io"], [1.4, 0, "in"]], t);
  // the body stays; the corner (with its stitches) is carried by the fold
  const patch = `<clipPath id="bd"><path d="${BODY}"/></clipPath><clipPath id="cn"><path d="${CORNER}"/></clipPath><g clip-path="url(#bd)">${patchFace(false)}</g>`
    + `<g transform="${matrix(foldMatrix(P1, P2, lift))}"><g clip-path="url(#cn)">${patchFace(false)}</g></g>`;
  return frameOf(`${BEFORE}${HOLE}${patch}${THREAD_ENDS}${AFTER}${lace(draft(t))}`);
}

// ---- sad. The top edge lifts in the draft and flutters; then the top stitches give and the patch folds down about its bottom edge, faster and
// faster, past edge on (from there its back is to us) to hang, swinging on its bottom stitches; they give, and it drops, turning to lie flat on
// the floor in front of the sole (foreshortened as the floor is), still back up.
const T_GIVE = 0.55, T_HANG = 0.95, T_DROP = 1.4, T_LAND = 1.64;
const HANG = 165;
// where its corners come to lie: TL, TR, BL (BR follows: the patch is near a parallelogram)
const LANDS = [[117, 165.5], [149, 163.5], [120, 176]];
const SAD_DUR = T_LAND + 0.2 + 0.7;
// the affine map that takes three points to three points
function affine3(p, q) {
  const [a, b, c] = p, [A, B, C] = q;
  const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  const m11 = ((B[0] - A[0]) * (c[1] - a[1]) - (C[0] - A[0]) * (b[1] - a[1])) / det, m12 = ((C[0] - A[0]) * (b[0] - a[0]) - (B[0] - A[0]) * (c[0] - a[0])) / det;
  const m21 = ((B[1] - A[1]) * (c[1] - a[1]) - (C[1] - A[1]) * (b[1] - a[1])) / det, m22 = ((C[1] - A[1]) * (b[0] - a[0]) - (B[1] - A[1]) * (c[0] - a[0])) / det;
  return [m11, m21, m12, m22, A[0] - m11 * a[0] - m12 * a[1], A[1] - m21 * a[0] - m22 * a[1]];
}
const apply = (m, p) => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
function sad(t) {
  if (t <= 0) return STILL;
  let patch, front = false;
  if (t < T_DROP) {
    const phi = (Math.PI / 180) * track([[0.2, 0], [0.4, 28, "out"], [T_GIVE, 18, "io"], [T_HANG, 180, "in"], [T_HANG + 0.12, 155, "out"], [T_HANG + 0.25, 172, "io"], [T_DROP, HANG, "io"]], t);
    // (as it tips out, its front turns to face the floor and goes into shade, the back's own tone by the time it's edge on: so it turns over
    // with no change to see)
    const shade = Math.max(0, Math.min(1, (phi - (20 * Math.PI) / 180) / ((60 * Math.PI) / 180)));
    patch = `<g transform="${matrix(foldMatrix(BL, BR, phi))}">${patchFace(phi > Math.PI / 2, shade)}</g>`;
    // (past edge on it hangs below its hinge, over the sole: in front of it from the moment it's thinnest, so the change can't show)
    front = phi > Math.PI / 2;
  } else {
    // from where it hung to where it lies, its corners each on their way (falling, so faster as it goes), turning to lie flat
    const hung = foldMatrix(BL, BR, (HANG * Math.PI) / 180), from = [TL, TR, BL].map((p) => apply(hung, p));
    const s = Math.min(t, T_LAND) - T_DROP, u = (s / (T_LAND - T_DROP)) ** 2;
    const flop = track([[T_LAND, 0], [T_LAND + 0.08, 1, "out"], [T_LAND + 0.2, 0, "io"]], t);
    const to = from.map((p, i) => { const q = lerp(p, LANDS[i], u); return [q[0], q[1] - (i < 2 ? 1.2 * flop : 0)]; });
    patch = `<g transform="${matrix(affine3([TL, TR, BL], to))}">${patchFace(true)}</g>`;
    front = true;
  }
  return frameOf(`${BEFORE}${HOLE}${front ? "" : patch}${THREAD_ENDS}${AFTER}${front ? patch : ""}${lace(draft(t))}`);
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export function frame(name, t) {
  return name === "happy" ? happy(Math.min(t, HAPPY_DUR)) : sad(Math.min(t, SAD_DUR));
}
