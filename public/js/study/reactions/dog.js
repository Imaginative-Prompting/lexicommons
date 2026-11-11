// The dog on real joints: the still's own shapes, each a rigid piece on a bone, turning only about its joint. Happy: it can't sit still. It tilts its head, ears up,
// springs straight up off its seat, ears and tongue flying, lands and bounces, tail wagging, and settles with its head on one side, tongue out. Sad: it's not
// getting what it hoped for. The tail stops and drops to the floor, the ears sink, its head goes down to one side, its eyelids come halfway down, and it sighs.
// Every frame is a pure function of t, in seconds. Nothing changes shape: the face's lids are new marks, clipped to the eyes, as a face's marks are.

const n2 = (v) => { const s = (Math.round(v * 100) / 100).toString(); return s === "-0" ? "0" : s; };
const n4 = (v) => { const s = (Math.round(v * 10000) / 10000).toString(); return s === "-0" ? "0" : s; };
const CURVES = { lin: (x) => x, io: (x) => x * x * (3 - 2 * x), in: (x) => x * x, out: (x) => 1 - (1 - x) * (1 - x), out3: (x) => 1 - (1 - x) ** 3 };
const track = (k, t) => {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * CURVES[k[i][2] ?? "io"]((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
  return k[k.length - 1][1];
};

/** The still this story starts from, and its hash in the manifest: redraw the still and this story stops playing, until it's drawn again. */
export const STILL = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 200 200\">\n<ellipse cx=\"108\" cy=\"182\" rx=\"60\" ry=\"8\" fill=\"var(--art-ground,#D3CAB5)\"/>\n<path d=\"M134 158C160 160 174 136 162 114\" fill=\"none\" stroke=\"var(--art-wood-deep,#B97F45)\" stroke-width=\"15\" stroke-linecap=\"round\"/>\n<clipPath id=\"b\"><path d=\"M60 182C54 134 70 100 100 100 130 100 146 134 140 182Z\"/></clipPath>\n<g clip-path=\"url(#b)\"><rect x=\"50\" y=\"95\" width=\"100\" height=\"90\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M116 95H150V185H112C124 160 124 125 116 95Z\" fill=\"var(--art-wood-deep,#B97F45)\"/></g>\n<ellipse cx=\"96\" cy=\"130\" rx=\"19\" ry=\"23\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<rect x=\"72\" y=\"136\" width=\"21\" height=\"46\" rx=\"10.5\" fill=\"var(--art-wood,#DCA063)\"/>\n<rect x=\"106\" y=\"136\" width=\"21\" height=\"46\" rx=\"10.5\" fill=\"var(--art-wood,#DCA063)\"/>\n<ellipse cx=\"82\" cy=\"178\" rx=\"14\" ry=\"7.5\" fill=\"var(--art-paper,#FBF7EC)\"/><ellipse cx=\"117\" cy=\"178\" rx=\"14\" ry=\"7.5\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<rect x=\"70\" y=\"100\" width=\"60\" height=\"11\" rx=\"5.5\" fill=\"var(--art-sky-deep,#3488C9)\"/><circle cx=\"100\" cy=\"116\" r=\"7\" fill=\"var(--art-sun,#F7BE45)\"/><path d=\"M100 109A7 7 0 0 1 100 123Z\" fill=\"var(--art-sun-deep,#DB9A22)\"/>\n<clipPath id=\"h\"><path d=\"M54 64C54 38 76 22 100 22 124 22 146 38 146 64 146 90 124 106 100 106 76 106 54 90 54 64Z\"/></clipPath>\n<g clip-path=\"url(#h)\"><rect x=\"50\" y=\"18\" width=\"100\" height=\"92\" fill=\"var(--art-wood,#DCA063)\"/><path d=\"M122 18H150V110H104C126 96 134 56 122 18Z\" fill=\"var(--art-wood-deep,#B97F45)\"/><ellipse cx=\"78\" cy=\"54\" rx=\"17\" ry=\"20\" fill=\"var(--art-bark,#7A4E2D)\"/></g>\n<path d=\"M60 38C42 38 30 60 34 90 36 104 54 106 60 90 66 72 68 50 60 38Z\" fill=\"var(--art-bark,#7A4E2D)\"/>\n<path d=\"M140 38C158 38 170 60 166 90 164 104 146 106 140 90 134 72 132 50 140 38Z\" fill=\"var(--art-bark-deep,#4B2F24)\"/>\n<ellipse cx=\"100\" cy=\"80\" rx=\"25\" ry=\"20\" fill=\"var(--art-paper,#FBF7EC)\"/><path d=\"M100 60C114 60 125 69 125 80 125 91 114 100 100 100Z\" fill=\"var(--art-paper-deep,#DAD1BC)\"/>\n<path d=\"M90 90H110V98A10 10 0 0 1 90 98Z\" fill=\"var(--art-clay,#E8743B)\"/><path d=\"M100 90H110V98A10 10 0 0 1 100 108Z\" fill=\"var(--art-clay-deep,#C25626)\"/>\n<path d=\"M88 64H112C115 64 116 68 114 70L104 78C102 80 98 80 96 78L86 70C84 68 85 64 88 64Z\" fill=\"var(--art-ink,#231F3B)\"/>\n<path d=\"M92 66.5H99\" stroke=\"var(--art-steel-deep,#6B687A)\" stroke-width=\"2.5\" stroke-linecap=\"round\"/>\n<path d=\"M100 79V86M84 86C88 93 96 92 100 86 104 92 112 93 116 86\" fill=\"none\" stroke=\"var(--art-ink,#231F3B)\" stroke-width=\"3.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>\n<circle cx=\"78\" cy=\"54\" r=\"6.5\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"76\" cy=\"52\" r=\"2\" fill=\"var(--art-paper,#FBF7EC)\"/>\n<circle cx=\"122\" cy=\"54\" r=\"6.5\" fill=\"var(--art-ink,#231F3B)\"/><circle cx=\"120\" cy=\"52\" r=\"2\" fill=\"var(--art-paper,#FBF7EC)\"/>\n</svg>\n";
export const STILL_HASH = "9fa2e8fe61";
const tok = (name, hex) => `var(--art-${name},${hex})`;
const C = { ground: tok("ground", "#D3CAB5"), wood: tok("wood", "#DCA063"), woodDeep: tok("wood-deep", "#B97F45"), paper: tok("paper", "#FBF7EC"), paperDeep: tok("paper-deep", "#DAD1BC"), sky: tok("sky-deep", "#3488C9"), sun: tok("sun", "#F7BE45"), sunDeep: tok("sun-deep", "#DB9A22"), bark: tok("bark", "#7A4E2D"), barkDeep: tok("bark-deep", "#4B2F24"), clay: tok("clay", "#E8743B"), clayDeep: tok("clay-deep", "#C25626"), ink: tok("ink", "#231F3B"), steelDeep: tok("steel-deep", "#6B687A") };

// ---- the rig: each bone's joint in the still, and its parent. The body turns about its seat.
export const BONES = {
  body: { parent: null, at: [100, 182] },
  tail1: { parent: "body", at: [134, 158] },
  tail2: { parent: "tail1", at: [162.25, 145] },
  legL: { parent: "body", at: [82.5, 140] },
  legR: { parent: "body", at: [116.5, 140] },
  tag: { parent: "body", at: [100, 109] },
  head: { parent: "body", at: [100, 104] },
  earL: { parent: "head", at: [63, 46] },
  earR: { parent: "head", at: [137, 46] },
  tongue: { parent: "head", at: [100, 90] },
};
// Its pieces, in the still's order, each on its bone: the still's own elements.
const PIECES = [
  ["tail1", `<path d="M134 158C147 159 157 153.5 162.25 145" fill="none" stroke="${C.woodDeep}" stroke-width="15" stroke-linecap="round"/>`],
  ["tail2", `<path d="M162.25 145C167.5 136.5 168 125 162 114" fill="none" stroke="${C.woodDeep}" stroke-width="15" stroke-linecap="round"/>`],
  ["body", `<clipPath id="b"><path d="M60 182C54 134 70 100 100 100 130 100 146 134 140 182Z"/></clipPath><g clip-path="url(#b)"><rect x="50" y="95" width="100" height="90" fill="${C.wood}"/><path d="M116 95H150V185H112C124 160 124 125 116 95Z" fill="${C.woodDeep}"/></g><ellipse cx="96" cy="130" rx="19" ry="23" fill="${C.paper}"/>`],
  ["legL", `<rect x="72" y="136" width="21" height="46" rx="10.5" fill="${C.wood}"/>`],
  ["legR", `<rect x="106" y="136" width="21" height="46" rx="10.5" fill="${C.wood}"/>`],
  ["legL", `<ellipse cx="82" cy="178" rx="14" ry="7.5" fill="${C.paper}"/>`],
  ["legR", `<ellipse cx="117" cy="178" rx="14" ry="7.5" fill="${C.paperDeep}"/>`],
  ["body", `<rect x="70" y="100" width="60" height="11" rx="5.5" fill="${C.sky}"/>`],
  ["tag", `<circle cx="100" cy="116" r="7" fill="${C.sun}"/><path d="M100 109A7 7 0 0 1 100 123Z" fill="${C.sunDeep}"/>`],
  ["head", `<clipPath id="h"><path d="M54 64C54 38 76 22 100 22 124 22 146 38 146 64 146 90 124 106 100 106 76 106 54 90 54 64Z"/></clipPath><g clip-path="url(#h)"><rect x="50" y="18" width="100" height="92" fill="${C.wood}"/><path d="M122 18H150V110H104C126 96 134 56 122 18Z" fill="${C.woodDeep}"/><ellipse cx="78" cy="54" rx="17" ry="20" fill="${C.bark}"/></g>`],
  ["earL", `<path d="M60 38C42 38 30 60 34 90 36 104 54 106 60 90 66 72 68 50 60 38Z" fill="${C.bark}"/>`],
  ["earR", `<path d="M140 38C158 38 170 60 166 90 164 104 146 106 140 90 134 72 132 50 140 38Z" fill="${C.barkDeep}"/>`],
  ["head", `<ellipse cx="100" cy="80" rx="25" ry="20" fill="${C.paper}"/><path d="M100 60C114 60 125 69 125 80 125 91 114 100 100 100Z" fill="${C.paperDeep}"/>`],
  ["tongue", `<path d="M90 90H110V98A10 10 0 0 1 90 98Z" fill="${C.clay}"/><path d="M100 90H110V98A10 10 0 0 1 100 108Z" fill="${C.clayDeep}"/>`],
  ["head", `<path d="M88 64H112C115 64 116 68 114 70L104 78C102 80 98 80 96 78L86 70C84 68 85 64 88 64Z" fill="${C.ink}"/><path d="M92 66.5H99" stroke="${C.steelDeep}" stroke-width="2.5" stroke-linecap="round"/>`],
  ["mouth", ""],
  ["eyes", ""],
];
// The mouth: its smile, or turned down. A face's mark, so it may change shape: the same points, moved.
const SMILE = [[84, 86], [88, 93], [96, 92], [100, 86], [104, 92], [112, 93], [116, 86]], FROWN = [[87, 90.5], [90, 86.5], [96, 86], [100, 88.5], [104, 86], [110, 86.5], [113, 90.5]];
const mouth = (k) => {
  const P = SMILE.map((q, i) => [q[0] + (FROWN[i][0] - q[0]) * k, q[1] + (FROWN[i][1] - q[1]) * k]), p = (q) => `${n2(q[0])} ${n2(q[1])}`;
  return `<path d="M100 79V${n2(86 + 2.5 * k)}M${p(P[0])}C${p(P[1])} ${p(P[2])} ${p(P[3])} ${p(P[4])} ${p(P[5])} ${p(P[6])}" fill="none" stroke="${C.ink}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`;
};
const EYES = `<circle cx="78" cy="54" r="6.5" fill="${C.ink}"/><circle cx="76" cy="52" r="2" fill="${C.paper}"/><circle cx="122" cy="54" r="6.5" fill="${C.ink}"/><circle cx="120" cy="52" r="2" fill="${C.paper}"/>`;

// ---- the outline of each piece, in the still, for the check: what a rigid copy of it must cover.
const ellipsePts = (cx, cy, rx, ry, n = 24) => Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((2 * Math.PI * i) / n), cy + ry * Math.sin((2 * Math.PI * i) / n)]);
const rectPts = (x, y, w, h) => [[x, y], [x + w / 2, y], [x + w, y], [x + w, y + h / 2], [x + w, y + h], [x + w / 2, y + h], [x, y + h], [x, y + h / 2]];
const cubicPts = (P, n = 8) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, m = 1 - t; return [m * m * m * P[0][0] + 3 * m * m * t * P[1][0] + 3 * m * t * t * P[2][0] + t * t * t * P[3][0], m * m * m * P[0][1] + 3 * m * m * t * P[1][1] + 3 * m * t * t * P[2][1] + t * t * t * P[3][1]]; });
export const OUTLINES = {
  body: [...cubicPts([[60, 182], [54, 134], [70, 100], [100, 100]]), ...cubicPts([[100, 100], [130, 100], [146, 134], [140, 182]])],
  head: [...cubicPts([[54, 64], [54, 38], [76, 22], [100, 22]]), ...cubicPts([[100, 22], [124, 22], [146, 38], [146, 64]]), ...cubicPts([[146, 64], [146, 90], [124, 106], [100, 106]]), ...cubicPts([[100, 106], [76, 106], [54, 90], [54, 64]])],
  earL: [...cubicPts([[60, 38], [42, 38], [30, 60], [34, 90]]), ...cubicPts([[34, 90], [36, 104], [54, 106], [60, 90]]), ...cubicPts([[60, 90], [66, 72], [68, 50], [60, 38]])],
  earR: [...cubicPts([[140, 38], [158, 38], [170, 60], [166, 90]]), ...cubicPts([[166, 90], [164, 104], [146, 106], [140, 90]]), ...cubicPts([[140, 90], [134, 72], [132, 50], [140, 38]])],
  legL: [...rectPts(72, 136, 21, 46), ...ellipsePts(82, 178, 14, 7.5, 12)],
  legR: [...rectPts(106, 136, 21, 46), ...ellipsePts(117, 178, 14, 7.5, 12)],
  tail1: cubicPts([[134, 158], [147, 159], [157, 153.5], [162.25, 145]]),
  tail2: cubicPts([[162.25, 145], [167.5, 136.5], [168, 125], [162, 114]]),
  tag: ellipsePts(100, 116, 7, 7, 12),
  tongue: [[90, 90], [110, 90], [110, 98], [100, 108], [90, 98]],
};
// Which joints hold what together: each joint's point must stay inside both pieces it joins.
export const JOINTS = [["neck", "head", "body", "head"], ["ear L", "earL", "head", "earL"], ["ear R", "earR", "head", "earR"], ["shoulder L", "legL", "body", "legL"], ["shoulder R", "legR", "body", "legR"], ["tail", "tail1", "body", "tail1"], ["tail middle", "tail2", "tail1", "tail2"], ["tag", "tag", "body", "tag"], ["tongue", "tongue", "head", "tongue"]];

// ---- frames: a bone's matrix is its parent's, turned about its own joint. A pose: angles in degrees, and where the body is (dx, dy).
const mul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const turn = (deg, [px, py]) => { const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r); return [c, s, -s, c, px - c * px + s * py, py - s * px - c * py]; };
export function matrices(pose) {
  const M = {};
  for (const [name, b] of Object.entries(BONES)) {
    const own = turn(pose[name] ?? 0, b.at);
    M[name] = b.parent ? mul(M[b.parent], own) : mul([1, 0, 0, 1, pose.dx ?? 0, pose.dy ?? 0], own);
  }
  return M;
}
export const apply = (M, [x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
const mat = (M) => `matrix(${n4(M[0])} ${n4(M[1])} ${n4(M[2])} ${n4(M[3])} ${n2(M[4])} ${n2(M[5])})`;

// The lids: each eye's top, closing to `k` of the way down, its edge tilted (the inner side higher reads sad). A lid is the head's own fur over the eye (its
// patch, its shade), with a dark rim along its edge.
const FUR = `<rect x="50" y="18" width="100" height="92" fill="${C.wood}"/><path d="M122 18H150V110H104C126 96 134 56 122 18Z" fill="${C.woodDeep}"/><ellipse cx="78" cy="54" rx="17" ry="20" fill="${C.bark}"/>`;
const lid = (id, cx, cy, k, tilt) => {
  if (k <= 0.005) return "";
  const yi = cy - 6.6 + 13.2 * k + tilt, yo = cy - 6.6 + 13.2 * k - tilt, edge = `M${cx - 9} ${n2(yo)}L${cx + 9} ${n2(yi)}`;
  return `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="7.4"/></clipPath><clipPath id="${id}t"><path d="M${cx - 9} ${cy - 9}H${cx + 9}V${n2(yi)}L${cx - 9} ${n2(yo)}Z"/></clipPath><g clip-path="url(#${id})"><g clip-path="url(#${id}t)">${FUR}</g><path d="${edge}" stroke="${C.barkDeep}" stroke-width="1.4"/></g>`;
};

// A grin's lower lid: fur rising from below the eye with an arched top, so what's left of the eye is a crescent turned up.
const grin = (id, cx, cy, k) => {
  if (k <= 0.005) return "";
  const top = cy + 7.4 - 10.6 * k, arch = 6 * k;
  return `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="7.4"/></clipPath><clipPath id="${id}t"><path d="M${cx - 9} ${n2(top + arch)}Q${cx} ${n2(top - arch)} ${cx + 9} ${n2(top + arch)}V${cy + 9}H${cx - 9}Z"/></clipPath><g clip-path="url(#${id})"><g clip-path="url(#${id}t)">${FUR}</g></g>`;
};
/** One frame from a pose: { body, head, earL, …, dx, dy, shadow, lids, tongueIn }. */
export function draw(pose) {
  const M = matrices(pose);
  let out = "";
  // The ground: its shadow, smaller and fainter the higher it is.
  const sh = pose.shadow ?? 1;
  out += sh === 1 ? `<ellipse cx="108" cy="182" rx="60" ry="8" fill="${C.ground}"/>` : `<ellipse cx="108" cy="182" rx="${n2(60 * sh)}" ry="${n2(8 * sh)}" fill="${C.ground}" opacity="${n2(0.4 + 0.6 * sh)}"/>`;
  for (const [bone, svg] of PIECES) {
    let piece = svg;
    if (bone === "mouth") { out += `<g transform="${mat(M.head)}">${mouth(pose.frown ?? 0)}</g>`; continue; }
    if (bone === "eyes") {
      const L = pose.lids ?? 0;
      // The inner corners higher: the left eye's inner side is its right.
      const slant = 3.2 * Math.min(1, L * 3), g = pose.grin ?? 0;
      piece = `${EYES}${lid("el", 78, 54, L, -slant)}${lid("er", 122, 54, L, slant)}${grin("gl", 78, 54, g)}${grin("gr", 122, 54, g)}`;
      out += `<g transform="${mat(M.head)}">${piece}</g>`;
      continue;
    }
    if (bone === "tongue" && (pose.tongueIn ?? 0) > 0) {
      // In, it slides up behind the muzzle's mouth line: clipped to below that line, in the head's frame.
      const k = pose.tongueIn;
      out += `<g transform="${mat(M.head)}"><clipPath id="tg"><path d="M80 87H120V120H80Z"/></clipPath><g clip-path="url(#tg)"><g transform="translate(0 ${n2(-23 * k)}) ${mat(turn(pose.tongue ?? 0, BONES.tongue.at))}">${piece}</g></g></g>`;
      continue;
    }
    out += `<g transform="${mat(M[bone])}">${piece}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${out}</svg>`;
}

// ---- happy.
const HAPPY_DUR = 2.4;
// The ears hang: when the head turns, each swings back toward hanging straight, past it, and settles (a damped pendulum, driven by the head's own turn).
const hang = (headAt, t, k = 0.75, f = 3.2, z = 4.5) => {
  // the ear's angle against the head: minus the head's turn, as it was a moment ago, ringing out
  let a = 0;
  for (let i = 1; i <= 24; i++) {
    const s = i * 0.02, w = Math.exp(-z * s) * Math.sin(2 * Math.PI * f * s) * 0.02 * 2 * Math.PI * f;
    a += (headAt(t - s + 0.02) - headAt(t - s)) / 0.02 * w;
  }
  return -k * headAt(t) + 0.06 * a;
};
const headHappy = (t) => track([[0.22, 0], [0.42, 15, "out"], [0.5, 13, "io"], [0.78, 13], [0.94, -11, "io"], [1.02, -9, "io"], [1.3, -9], [1.5, 12, "io"], [1.6, 10, "io"]], t);
function happyPose(t) {
  // Its ears prick; its tail goes, hard, and wags its whole body against it. It tips its head one way, then the other, the ears hanging behind each turn;
  // then back, and its eyes squeeze shut in a grin.
  const prick = track([[0.04, 0], [0.2, 1, "out"]], t);
  const amp = track([[0.08, 0], [0.3, 1, "out"], [1.7, 1], [2.25, 0, "io"]], t);
  const ph = 2 * Math.PI * 3 * (t - 0.08);
  // (Its body stays put on its seat and paws: the wag is all tail, and what it shakes loose is the ears, the tongue and the tag.)
  const wag = 21 * amp * Math.sin(ph), swing = amp * Math.sin(ph - 1.3);
  const head = headHappy(t);
  return {
    body: 0, dy: 0,
    head: head + 1.2 * amp * Math.sin(ph - 0.6),
    earL: 6 * prick + 0.6 * hang(headHappy, t) + 3.5 * swing, earR: -6 * prick + 0.6 * hang(headHappy, t) + 3.5 * swing,
    tongue: 9 * swing - 0.35 * head,
    tail1: wag + track([[1.7, 0], [2.25, -12, "io"]], t), tail2: 0.5 * wag + 0.4 * 21 * amp * Math.sin(ph - 1.1),
    tag: -14 * swing - 0.5 * head,
    grin: track([[1.48, 0], [1.72, 1, "out"]], t),
    legL: 0, legR: 0,
  };
}

// ---- sad.
const SAD_DUR = 2.5;
function sadPose(t) {
  // It was wagging, hoping. The tail stops and drops to the floor; the ears sink; its head goes down to one side, its mouth turns down and its tongue goes
  // in; the lids come halfway down; and it sighs, a breath in and a long one out.
  const wag = track([[0, 1], [0.35, 0, "out"]], t) * 16 * Math.sin(2 * Math.PI * 3 * t);
  const drop = track([[0.2, 0], [0.75, 1, "in"], [0.85, 0.94, "out"], [0.95, 1, "io"]], t);
  const ears = track([[0.3, 0], [0.9, 1, "io"], [1.0, 0.95, "io"], [1.12, 1, "io"]], t);
  const head = track([[0.45, 0], [1.15, 1, "io"]], t);
  const sigh = track([[1.35, 0], [1.65, 1, "io"], [2.15, -0.5, "io"], [2.4, 0, "io"]], t);
  return {
    // Its body stays put on its seat and paws; the sigh lifts its head a little and lets it sink further.
    body: 0, dy: 0,
    head: -16 * head + 3.5 * sigh,
    earL: -8 * ears, earR: 8 * ears,
    tail1: wag + 68 * drop, tail2: wag * 0.6 + 22 * drop,
    tag: 2 * head - 1.5 * sigh,
    tongue: 0, tongueIn: track([[0.4, 0], [0.8, 1, "io"]], t),
    frown: track([[0.55, 0], [1.05, 1, "io"]], t),
    lids: track([[0.6, 0], [1.2, 0.36, "io"], [1.6, 0.3, "io"], [2.2, 0.4, "io"]], t),
    legL: 0, legR: 0,
  };
}

export const REACTIONS = { happy: { dur: HAPPY_DUR }, sad: { dur: SAD_DUR } };
export const poseAt = (name, t) => (name === "happy" ? happyPose(Math.min(t, HAPPY_DUR)) : sadPose(Math.min(t, SAD_DUR)));
export function frame(name, t) {
  if (t <= 0) return STILL;
  return draw(poseAt(name, t));
}
