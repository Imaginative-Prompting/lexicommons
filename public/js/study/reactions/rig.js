// The shared rig for word pictures with characters (the app's public/js/study/reactions/rig.js, in the service worker's SHELL): every character story
// imports what it needs from here, and is itself only its still, its key poses and timing, and its scene. Pure: no files, no DOM.
//   timing      CURVES, track (a value along timed keys), keyAt (the two keys around a moment), wrap (an angle into -180..180)
//   the puppet  makePuppet: a drawn character on real joints, its outlines rewritten each frame (the woman: jump), with paint, BONE_ORDER, tidyShapes
//   transforms  makeTformRig: a traced still on real joints by transforms, each piece the still's own path (lex-art's people: drunk)
// Its source is the rig (react/shared/rig.js); puppet/puppet.js, drunk/tform.mjs and leap-ends/runtime.mjs take theirs from it.

// ---------- timing
export const CURVES = { lin: (x) => x, io: (x) => x * x * (3 - 2 * x), in: (x) => x * x, out: (x) => 1 - (1 - x) * (1 - x), out3: (x) => 1 - (1 - x) ** 3 };
export const track = (k, t) => {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) if (t <= k[i][0]) return k[i - 1][1] + (k[i][1] - k[i - 1][1]) * CURVES[k[i][2] ?? "io"]((t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]));
  return k[k.length - 1][1];
};
export const keyAt = (keys, t) => {
  if (t <= keys[0][0]) return { a: keys[0][1], b: keys[0][1], u: 0 };
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) return { a: keys[i - 1][1], b: keys[i][1], u: CURVES[keys[i][2] ?? "io"]((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])) };
  const last = keys.at(-1)[1];
  return { a: last, b: last, u: 0 };
};
export const wrap = (a) => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };

// ---------- the puppet: rigid drawn segments on real joints. A pose is each bone's angle (relative to its parent) and where the hips are; every point
// of a segment is that bone's rigid transform, so a limb can't change length and a joint can't come apart. Only the cloth, the hair and the face's
// marks change shape, between key outlines with matched points. Every frame is a pure function of its pose.
const rad = Math.PI / 180;
const HEX = { violet: "#7C5CE6", "violet-deep": "#5E40C4", "violet-lit": "#A68CFF", ink: "#231F3B", "ink-lit": "#3A3460", clay: "#E8743B", "clay-deep": "#C25626", "clay-deeper": "#9C4219", paper: "#FBF7EC", skin: "#E9B48A", "skin-deep": "#CF9468" };
export const paint = (t) => `var(--art-${t},${HEX[t]})`;
const fmt = (v) => { const s = (Math.round(v * 100) / 100).toString(); return s === "-0" ? "0" : s; };

export const BONE_ORDER = ["hips", "torso", "neck", "head", "upperL", "foreL", "handL", "upperR", "foreR", "handR", "thighL", "shinL", "footL", "thighR", "shinR", "footR"];
const MARKS = ["browL", "lidL", "pupilL", "browR", "lidR", "pupilR", "nose", "mouth", "tongue"];
const MARK_FILL = { browL: "ink", lidL: "ink", pupilL: "ink", browR: "ink", lidR: "ink", pupilR: "ink", nose: "skin-deep", mouth: "clay-deeper", tongue: "clay-deep" };

// The compact writer (opts.compact): every path in relative steps of a tenth of a unit, each step taken between rounded positions (so nothing drifts),
// with only the separators a number needs, and a smooth join (its first handle the last one's mirror, to within a step) written as "s"; a lit limb,
// a tinted part and a run of accents on one shape keep one copy of that shape's outline, as their clip, the shape itself a rectangle inside it.
// (whole units with opts.whole: a frame drawn ten times larger in a viewBox ten times wider, the same picture with no decimal points)
const rTenth = (v) => Math.round(v * 10) / 10;
const sTenth = (v) => { const s = String(Math.round(v * 10) / 10); return s === "-0" ? "0" : s.replace(/^(-?)0\./, "$1."); };
const s0 = (v) => { const s = String(Math.round(v)); return s === "-0" ? "0" : s; };
function penPath(start, cubics, whole = false, smooth = null) {
  // start [x, y]; cubics [[c1, c2, end], ...], all absolute: M, then relative c (or s) steps, then z. smooth[k]: the curve is smooth by its making
  // at the node where segment k starts (a key drawing's node that isn't a corner: its handles mirror each other), so that segment is written "s"; the
  // same joins in every frame, so a frame's paths keep their shape of commands from one frame to the next
  const r1 = whole ? Math.round : rTenth, s1 = whole ? s0 : sTenth;
  let out = "", lastNum = false, lastDot = false, cmd = "";
  const letter = (c) => { out += c; lastNum = false; };
  const num = (v) => { const t = s1(v); if (lastNum && t[0] !== "-" && !(t[0] === "." && lastDot)) out += " "; out += t; lastNum = true; lastDot = t.includes("."); };
  // every outline wound the same way (against the clock on the page), so shapes of one color written as one path, or one clip of several parts,
  // only ever add up (a winding against another would cut a hole where they overlap)
  const pts = [start];
  let last = start, area = 0;
  for (const [p1, p2, p3] of cubics) {
    for (let k = 1; k <= 8; k++) {
      const u = k / 8, m = 1 - u, b0 = m * m * m, b1 = 3 * m * m * u, b2 = 3 * m * u * u, b3 = u * u * u;
      pts.push([b0 * last[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0], b0 * last[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1]]);
    }
    last = p3;
  }
  for (let i = 0; i < pts.length - 1; i++) area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  if (area > 0) {
    // (y runs down the page, so a positive shoelace runs with the clock: run it the other way, each segment's handles swapped; reversed, segment m
    // starts at the node segment n - m started at)
    const ends = [start, ...cubics.map((g) => g[2])], rev = [], n = cubics.length;
    for (let i = n - 1; i >= 0; i--) rev.push([cubics[i][1], cubics[i][0], ends[i]]);
    start = ends.at(-1);
    cubics = rev;
    if (smooth) smooth = Array.from({ length: n }, (_, m) => (m ? smooth[n - m] : false));
  }
  let cx = r1(start[0]), cy = r1(start[1]);
  letter("M"); num(cx); num(cy);
  for (const [k, [p1, p2, p3]] of cubics.entries()) {
    const q = [p1, p2, p3].map(([x, y]) => [r1(x), r1(y)]);
    const mirrored = k > 0 && !!smooth?.[k];
    const want = mirrored ? "s" : "c";
    if (want !== cmd) { letter(want); cmd = want; }
    for (const [x, y] of mirrored ? q.slice(1) : q) { num(r1(x - cx)); num(r1(y - cy)); }
    cx = q[2][0]; cy = q[2][1];
  }
  letter("z");
  return out;
}

/** A compact frame's shapes, tidied: neighboring paths of one color written as one path (their outlines all wind one way, so it's the same
 *  picture), and a color the story names said once, on a group around them all. */
export function tidyShapes(inner, common = null, merge = true) {
  let out = inner, before;
  if (merge) do {
    before = out;
    out = out.replace(/<path fill="([^"]+)" d="([^"]+)"\/><path fill="\1" d="([^"]+)"\/>/g, '<path fill="$1" d="$2$3"/>');
  } while (out !== before);
  // (common: the color a story says once, the same in every frame, so no part's own attributes change from frame to frame; none: nothing said once)
  if (!common) return out;
  return `<g fill="${common}">${out.split(` fill="${common}"`).join("")}</g>`;
}

export function makePuppet(model, keyed, opts = {}) {
  const compact = !!opts.compact, whole = !!opts.whole, BOX = opts.box ?? 200;
  const pen = (start, cubics, smooth) => penPath(start, cubics, whole, smooth);
  const num = whole ? s0 : sTenth;
  // (compact: a shape moved by a step in the picture, without writing its outline again: a rectangle, moved, clipped by that shape's own clip; a clip
  // is read in the space of what it clips, so inside a moved group it is moved too. The rectangle reaches past the frame by a tenth all round, so a
  // moved one still covers it.)
  const moved = (map, wx, wy, cid, color) => {
    const o = map(0, 0), q = map(wx, wy), e = BOX / 10;
    return `<g transform="translate(${num(q[0] - o[0])} ${num(q[1] - o[1])})"><rect x="-${e}" y="-${e}" width="${BOX + 2 * e}" height="${BOX + 2 * e}" fill="${paint(color)}" clip-path="url(#${cid})"/></g>`;
  };
  const B = model.bones;
  const parts = Object.fromEntries(model.parts.map((p) => [p.name, p]));
  // The offset of each bone's joint in its parent's frame: a limb's child sits exactly at the end of its parent's one length.
  const local = {};
  for (const n of BONE_ORDER) {
    const b = B[n];
    if (!b.parent) { local[n] = { x: 0, y: 0, th: b.th }; continue; }
    // (in the parent's true length: a foreshortened parent brings its child in by as much)
    const p = B[b.parent], c = Math.cos(-p.th * rad), s = Math.sin(-p.th * rad), dx = b.at[0] - p.at[0], dy = b.at[1] - p.at[1];
    local[n] = { x: (dx * c - dy * s) * p.k, y: dx * s + dy * c, th: b.th - p.th };
  }

  /** World frames, from world angles or from angles relative to the parent. pose: { x, y, rel?: {bone: degrees}, fs?: {bone: shown}, ik?: {...} }
   *  fs: how much of a bone shows when it turns out of the picture (1 = side on, all of it). A frame's f scales its segment along the bone only. */
  function solve(pose) {
    const W = {};
    for (const n of BONE_ORDER) {
      const b = B[n], l = local[n];
      const rel = pose.rel?.[n] ?? 0, f = pose.fs?.[n] ?? 1;
      if (!b.parent) {
        W[n] = { x: pose.x, y: pose.y, th: l.th + rel, f };
      } else {
        const P = W[b.parent], c = Math.cos(P.th * rad), s = Math.sin(P.th * rad), lx = l.x * P.f;
        W[n] = { x: P.x + lx * c - l.y * s, y: P.y + lx * s + l.y * c, th: P.th + l.th + rel, f };
      }
    }
    // Two-bone IK: a planted foot or hand stays where it is, with its limb's real lengths. The knee or elbow bends to `side`.
    for (const [upper, lower, end, target] of pose.ik ?? []) {
      const a = W[upper], L1 = B[upper].len * a.f, L2 = B[lower].len * W[lower].f;
      let dx = target.x - a.x, dy = target.y - a.y, d = Math.hypot(dx, dy);
      // (A limb at full stretch is straight: a tenth of a pixel short of it still bends the joint by degrees.)
      const dmax = L1 + L2 - 0.005, dmin = Math.abs(L1 - L2) + 0.5;
      if (d > dmax) { dx *= dmax / d; dy *= dmax / d; d = dmax; }
      if (d < dmin) { dx *= dmin / d; dy *= dmin / d; d = dmin; }
      const base = Math.atan2(dy, dx) / rad, cosA = Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))), A = Math.acos(cosA) / rad;
      const th1 = base + (target.side ?? 1) * A;
      W[upper] = { ...a, th: th1 };
      const ex = a.x + L1 * Math.cos(th1 * rad), ey = a.y + L1 * Math.sin(th1 * rad);
      const th2 = Math.atan2(a.y + dy - ey, a.x + dx - ex) / rad;
      W[lower] = { x: ex, y: ey, th: th2, f: W[lower].f };
      if (end) {
        const fx = a.x + dx, fy = a.y + dy;
        W[end] = { x: fx, y: fy, th: target.endTh ?? W[end].th, f: W[end].f };
      }
    }
    return W;
  }

  /** Bone angles as a pose wants them, from a table of world directions (a reference's), keeping hips as told. */
  function relFromAbs(abs, hipsDelta = 0) {
    const rel = {}, world = {};
    for (const n of BONE_ORDER) {
      const b = B[n];
      if (!b.parent) { world[n] = b.th + hipsDelta; rel[n] = hipsDelta; continue; }
      const want = abs[n];
      const parentWorld = world[b.parent];
      if (want === undefined) { world[n] = parentWorld + (b.th - B[b.parent].th); rel[n] = 0; continue; }
      let r = want - parentWorld - (b.th - B[b.parent].th);
      while (r > 180) r -= 360;
      while (r < -180) r += 360;
      rel[n] = r;
      world[n] = want;
    }
    return rel;
  }

  // The light comes from the upper left: a limb is its dark color, and a copy moved toward the light is its lit color, inside the limb. So the crescent is always on her right side, however the limb points.
  const LIGHT = [-0.707, -0.707];
  // A cloth part may carry other outlines for named key poses (p.ends[key], the same segments, point for point): a pose's cloth { a, b, u } morphs
  // the part between them, as cloth changes shape when the body under it moves. A part without one keeps its own outline.
  const segsOf = (p, cloth) => {
    if (!cloth || !p.ends) return p.segs;
    const A = p.ends[cloth.a] ?? p.segs, Z = p.ends[cloth.b] ?? p.segs, u = cloth.u ?? 0;
    if (u <= 0 || A === Z) return A;
    if (u >= 1) return Z;
    return A.map((g, i) => g.map((q, j) => [q[0] + (Z[i][j][0] - q[0]) * u, q[1] + (Z[i][j][1] - q[1]) * u]));
  };
  const mapPart = (p, F, map, cloth) => {
    const c = Math.cos(F.th * rad), s = Math.sin(F.th * rad), w = (q) => map(F.x + q[0] * F.f * c - q[1] * s, F.y + q[0] * F.f * s + q[1] * c);
    const segs = segsOf(p, cloth);
    if (compact) return pen(w(segs[0][0]), segs.map((g) => [w(g[1]), w(g[2]), w(g[3])]));
    let d = "";
    segs.forEach((g, i) => {
      if (!i) { const a = w(g[0]); d += `M${fmt(a[0])} ${fmt(a[1])}`; }
      const b = w(g[1]), e = w(g[2]), f = w(g[3]);
      d += `C${fmt(b[0])} ${fmt(b[1])} ${fmt(e[0])} ${fmt(e[1])} ${fmt(f[0])} ${fmt(f[1])}`;
    });
    return `${d}Z`;
  };

  /** A closed smooth curve through matched nodes, morphing between two key drawings, in the head's frame. */
  function morph(name, a, b, u, F, map) {
    const A = keyed[a]?.nodes[name], Bn = keyed[b]?.nodes[name];
    const from = A ?? Bn, to = Bn ?? A;
    if (!from) return null;
    // a mark only one drawing has grows out of, or shrinks into, its own middle
    let k = 1;
    if (!A) k = Math.max(0, (u - 0.5) * 2);
    if (!Bn) k = Math.max(0, 1 - u * 2);
    if (k <= 0.001) return null;
    const uu = A && Bn ? u : A ? 0 : 1;
    const c = Math.cos(F.th * rad), s = Math.sin(F.th * rad);
    let P = from.p.map((q, i) => { const r = to.p[i]; return [q[0] + (r[0] - q[0]) * uu, q[1] + (r[1] - q[1]) * uu]; });
    if (k < 1) {
      const cx = P.reduce((t, q) => t + q[0], 0) / P.length, cy = P.reduce((t, q) => t + q[1], 0) / P.length;
      P = P.map((q) => [cx + (q[0] - cx) * k, cy + (q[1] - cy) * k]);
    }
    const Q = P.map((q) => map(F.x + q[0] * c - q[1] * s, F.y + q[0] * s + q[1] * c));
    const corners = new Set(uu < 0.5 ? from.c : to.c), n = Q.length;
    const cub = [];
    for (let i = 0; i < n; i++) {
      const x = Q[i], y = Q[(i + 1) % n], z = Q[(i - 1 + n) % n], v = Q[(i + 2) % n];
      const t0 = corners.has(i) ? [(y[0] - x[0]) / 3, (y[1] - x[1]) / 3] : [(y[0] - z[0]) / 6, (y[1] - z[1]) / 6];
      const t1 = corners.has((i + 1) % n) ? [(y[0] - x[0]) / 3, (y[1] - x[1]) / 3] : [(v[0] - x[0]) / 6, (v[1] - x[1]) / 6];
      cub.push([[x[0] + t0[0], x[1] + t0[1]], [y[0] - t1[0], y[1] - t1[1]], y]);
    }
    if (compact) return pen(Q[0], cub, Array.from({ length: n }, (_, i) => !corners.has(i)));
    let d = `M${fmt(Q[0][0])} ${fmt(Q[0][1])}`;
    for (const [a, b, e] of cub) d += `C${fmt(a[0])} ${fmt(a[1])} ${fmt(b[0])} ${fmt(b[1])} ${fmt(e[0])} ${fmt(e[1])}`;
    return `${d}Z`;
  }

  // Paint order. Which leg is in front changes only at a fast moment; both are the same color.

  /** One frame. pose: { x, y, rel, ik, hair:{a,b,u}, marks:{a,b,u}, rightLegInFront } map: world to view. */
  function draw(pose, map, id = "g") {
    const W = solve(pose);
    let clips = 0;
    const pathOf = (p) => mapPart(p, W[p.bone], map, pose.cloth);
    const fill = (name) => {
      const p = parts[name], d = pathOf(p);
      // An accent stays inside the shape it lies on, whatever that shape does.
      if (p.clip) {
        const cid = `${id}c${clips++}`;
        return `<clipPath id="${cid}"><path d="${pathOf(parts[p.clip])}"/></clipPath><path fill="${paint(p.fill)}" clip-path="url(#${cid})" d="${d}"/>`;
      }
      let out = `<path fill="${paint(p.fill)}" d="${d}"/>`;
      if (p.tint) out += `<path fill="${paint(p.tint[0])}" fill-opacity="${p.tint[1]}" d="${d}"/>`;
      return out;
    };
    // A limb's segments are lit as one shape, so nothing shows at the joint inside it.
    const limb = (names, extra = "", named = null) => {
      const list = names.map((n) => parts[n]), d = list.map(pathOf).join(""), cid = named ?? `${id}c${clips++}`;
      if (compact) {
        // (its outline written once, as its clip: the dark a rectangle inside it, the lit the same clip moved toward the light, so it's lit where
        // the outline and its moved copy overlap, as the lit copy was; a limb's pieces are lit alike)
        const k = list[0].shade[1];
        if (list.some((p) => p.shade[1] !== k)) throw new Error(`${names.join("+")}: its pieces are lit differently`);
        return `<clipPath id="${cid}"><path d="${d}"/></clipPath><g clip-path="url(#${cid})"><rect width="${BOX}" height="${BOX}" fill="${paint(list[0].shade[0])}"/>${moved(map, LIGHT[0] * k, LIGHT[1] * k, cid, list[0].fill)}${extra}</g>`;
      }
      const lit = list.map((p) => mapPart(p, W[p.bone], (x, y) => map(x + LIGHT[0] * p.shade[1], y + LIGHT[1] * p.shade[1]), pose.cloth)).join("");
      return `<path fill="${paint(list[0].shade[0])}" d="${d}"/><clipPath id="${cid}"><path d="${d}"/></clipPath><path fill="${paint(list[0].fill)}" clip-path="url(#${cid})" d="${lit}"/>`;
    };
    // (compact: each leg's clip named for it, so the inner line can use the front one's)
    const legClip = (s) => `${id}leg${s.toLowerCase()}`;
    const leg = (s, extra = "") => fills([`shoe${s}`, `ankle${s}`]) + limb([`shin${s}`, `thigh${s}`], extra, compact ? legClip(s) : null);
    // Where the front leg lies over the back one, the inner thigh between them is in shade: the front leg's own outline, moved toward her back by
    // pose.innerLeg (0 in the still, which has none), drawn dark just behind it, shows as a line down her inner leg.
    const inner = (s) => {
      const k = pose.innerLeg ?? 0;
      if (k <= 0.001) return "";
      // (compact: the front leg's own clip, moved, inside the back leg's clip, which it is drawn in)
      if (compact) return moved(map, -k, 0, legClip(s), "ink");
      const o = s === "R" ? "L" : "R", cid = `${id}c${clips++}`;
      const d = [`shin${s}`, `thigh${s}`].map((n) => mapPart(parts[n], W[parts[n].bone], (x, y) => map(x - k, y), pose.cloth)).join("");
      // (only over the back leg: against the background her front leg's edge is lit)
      const back = [`shin${o}`, `thigh${o}`].map((n) => pathOf(parts[n])).join("");
      return `<clipPath id="${cid}"><path d="${back}"/></clipPath><path fill="${paint("ink")}" clip-path="url(#${cid})" d="${d}"/>`;
    };
    // (compact: a part and the accents that lie on it, or its tint, inside one clip of its outline; the same picture, its outline written once)
    const fills = (names) => {
      if (!compact) return names.map(fill).join("");
      let o = "";
      for (let i = 0; i < names.length; i++) {
        const p = parts[names[i]], acc = [];
        while (i + 1 < names.length && parts[names[i + 1]].clip === p.name) acc.push(parts[names[++i]]);
        if (!acc.length && !p.tint) { o += fill(p.name); continue; }
        const cid = `${id}c${clips++}`;
        o += `<clipPath id="${cid}"><path d="${pathOf(p)}"/></clipPath><g clip-path="url(#${cid})"><rect width="${BOX}" height="${BOX}" fill="${paint(p.fill)}"/>`;
        if (p.tint) o += `<rect width="${BOX}" height="${BOX}" fill="${paint(p.tint[0])}" fill-opacity="${p.tint[1]}"/>`;
        for (const q of acc) o += `<path fill="${paint(q.fill)}" d="${pathOf(q)}"/>`;
        o += "</g>";
      }
      return o;
    };
    let body = "";
    // The far arm and its sleeve go behind her hair, as they do in every drawing; lying on her back with her hair spread on the floor and that arm
    // flung back across it (pose.hairUnder), the arm lies on her hair.
    const farArm = () => limb(["upperR", "foreR"]) + fills(["handR", "sleeveR", "accSleeveR"]);
    const hairD = morph("hair", pose.hair.a, pose.hair.b, pose.hair.u, W.head, map), hair = hairD ? `<path fill="${paint("ink")}" d="${hairD}"/>` : "";
    body += pose.hairUnder ? hair + farArm() : farArm() + hair;
    body += fill("nape");
    if (compact) body += pose.rightLegInFront ? leg("L", inner("R")) + leg("R") : leg("R", inner("L")) + leg("L");
    else body += pose.rightLegInFront ? leg("L") + inner("R") + leg("R") : leg("R") + inner("L") + leg("L");
    body += fills(["hips", "hemShadow", "waistWedge", "chest", "neck", "chin", "sleeveIn", "torso", "waistFold", "collarShadow", "accTorso"]);
    body += limb(["upperL", "foreL"]);
    body += fills(["handL", "sleeveL", "face"]);
    let mouthHeld = false;
    for (const m of MARKS) {
      const d = morph(m, pose.marks.a, pose.marks.b, pose.marks.u, W.head, map);
      if (!d) continue;
      if (compact && m === "mouth") {
        const t = morph("tongue", pose.marks.a, pose.marks.b, pose.marks.u, W.head, map);
        body += `<clipPath id="${id}m"><path d="${d}"/></clipPath><g clip-path="url(#${id}m)"><rect width="${BOX}" height="${BOX}" fill="${paint(MARK_FILL.mouth)}"/>${t ? `<path fill="${paint(MARK_FILL.tongue)}" d="${t}"/>` : ""}</g>`;
        mouthHeld = true;
        continue;
      }
      if (compact && m === "tongue" && mouthHeld) continue;
      if (m === "mouth") body += `<clipPath id="${id}m"><path d="${d}"/></clipPath>`;
      const clip = m === "tongue" && body.includes(`id="${id}m"`) ? ` clip-path="url(#${id}m)"` : "";
      body += `<path fill="${paint(MARK_FILL[m])}"${clip} d="${d}"/>`;
    }
    return { body, W };
  }
  /** Each drawn segment as points in the drawing's own space, read through the same transforms the picture uses (for joint-check). */
  function shapes(pose) {
    const W = solve(pose), out = {};
    for (const p of model.parts) {
      const F = W[p.bone], c = Math.cos(F.th * rad), s = Math.sin(F.th * rad), pts = [];
      // (four points a segment; a refitted segment four for each drawn one it stands for: simplify.mjs)
      for (const [gi, g] of segsOf(p, pose.cloth).entries()) for (const k of p.merged ? Array.from({ length: 4 * p.merged[gi] }, (_, i) => (i + 1) / (4 * p.merged[gi])) : [0.25, 0.5, 0.75, 1]) {
        const m = 1 - k, x = m * m * m * g[0][0] + 3 * m * m * k * g[1][0] + 3 * m * k * k * g[2][0] + k * k * k * g[3][0], y = m * m * m * g[0][1] + 3 * m * m * k * g[1][1] + 3 * m * k * k * g[2][1] + k * k * k * g[3][1];
        pts.push([F.x + x * F.f * c - y * s, F.y + x * F.f * s + y * c]);
      }
      out[p.name] = pts;
    }
    return { W, shapes: out };
  }
  /** The angles against each parent that make these world frames: how a pose solved with its feet and hands on something becomes a key. */
  function relFromWorld(W) {
    const rel = {};
    for (const n of BONE_ORDER) {
      const b = B[n];
      rel[n] = b.parent ? W[n].th - W[b.parent].th - (b.th - B[b.parent].th) : W[n].th - b.th;
      while (rel[n] > 180) rel[n] -= 360;
      while (rel[n] < -180) rel[n] += 360;
    }
    return rel;
  }
  /** How far a part reaches below its bone's joint when the bone points at th degrees. */
  function depthBelow(name, th) {
    const c = Math.cos(th * rad), s = Math.sin(th * rad);
    let low = -1e9;
    for (const g of parts[name].segs) for (const q of g) low = Math.max(low, q[0] * s + q[1] * c);
    return low;
  }
  return { solve, relFromAbs, relFromWorld, depthBelow, draw, shapes, bones: B, keyed };
}

// ---------- transforms
// A traced still on real joints, by transforms: each piece keeps the still's own path, untouched, and turns about its joint (the dog's way, for any
// drawing cut into pieces on bones, as lex-art's people are). A pose is the root's move and each bone's turn from the still, in degrees, about its
// own pivot; a planted foot or hand is placed by two-bone IK. A frame writes each run of pieces on one bone inside one group, its transform the
// bone's whole move (translate, then rotate); a bone that hasn't moved writes its pieces bare. This becomes the shared rig's transform half.
const n1 = (v) => { const s = (Math.round(v * 10) / 10).toString(); return s === "-0" ? "0" : s.replace(/^(-?)0\./, "$1."); };

/** bones: { name: { parent, at: [x, y], follow?: [bone, share] } } in the still's own units, parents before children. */
export function makeTformRig(bones) {
  const order = Object.keys(bones);
  /** Each bone's move: { th (degrees turned in all), x, y (where its pivot is now) }, and the matrix [c, s, -s, c, e, f] taking the still to now. */
  function solve(pose) {
    const W = {};
    for (const n of order) {
      // (a bone that follows another turns a share of that one's turn, on top of its own: a sleeve's seam stays at the shoulder as the arm lifts)
      const b = bones[n], turn = (pose.rot?.[n] ?? 0) + (b.follow ? (pose.rot?.[b.follow[0]] ?? 0) * b.follow[1] : 0);
      if (!b.parent) {
        // (a root moves by pose.move; a rig with more than one root, two arms each coming in from its own corner, can move each its own way: pose.moves)
        const [dx, dy] = pose.moves?.[n] ?? pose.move ?? [0, 0];
        W[n] = { th: turn, x: b.at[0] + dx, y: b.at[1] + dy };
      } else {
        const P = W[b.parent], pb = bones[b.parent], c = Math.cos(P.th * rad), s = Math.sin(P.th * rad);
        const lx = b.at[0] - pb.at[0], ly = b.at[1] - pb.at[1];
        W[n] = { th: P.th + turn, x: P.x + lx * c - ly * s, y: P.y + lx * s + ly * c };
      }
      // the matrix: rotate by th about the still's pivot, then carry the pivot to where it is now
      const F = W[n], c = Math.cos(F.th * rad), s = Math.sin(F.th * rad), [ax, ay] = b.at;
      F.M = [c, s, -s, c, F.x - (c * ax - s * ay), F.y - (s * ax + c * ay)];
    }
    return W;
  }
  const apply = (M, [x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
  // which way a chain bends in the still: the side of its middle joint from the line between its ends
  const restSide = (upper, lower, end) => {
    const [a, m, e] = [bones[upper].at, bones[lower].at, bones[end].at];
    return Math.sign(wrap((Math.atan2(m[1] - a[1], m[0] - a[0]) - Math.atan2(e[1] - a[1], e[0] - a[0])) / rad)) || 1;
  };
  /** Two-bone IK: turns `upper` and `lower` so `end`'s pivot lands on target [x, y], the middle joint bending as it does in the still (or to `side`,
   *  +1 or -1). Returns the pose. */
  function reach(pose, upper, lower, end, target, side = null) {
    if (side === null) side = restSide(upper, lower, end);
    const p = { ...pose, rot: { ...(pose.rot ?? {}) } };
    const W = solve(p), A = [W[upper].x, W[upper].y];
    const L1 = Math.hypot(bones[lower].at[0] - bones[upper].at[0], bones[lower].at[1] - bones[upper].at[1]);
    const L2 = Math.hypot(bones[end].at[0] - bones[lower].at[0], bones[end].at[1] - bones[lower].at[1]);
    let dx = target[0] - A[0], dy = target[1] - A[1], d = Math.hypot(dx, dy);
    const dmax = (L1 + L2) * 0.9999, dmin = Math.abs(L1 - L2) * 1.0001;
    if (d > dmax) { dx *= dmax / d; dy *= dmax / d; d = dmax; }
    if (d < dmin) { dx *= dmin / d; dy *= dmin / d; d = dmin; }
    const base = Math.atan2(dy, dx), cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), a = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const th1 = base + side * a, mid = [A[0] + L1 * Math.cos(th1), A[1] + L1 * Math.sin(th1)];
    const th2 = Math.atan2(A[1] + dy - mid[1], A[0] + dx - mid[0]);
    // each bone's direction in the still, and its parent's turn now: the turn that points it there
    const rest1 = Math.atan2(bones[lower].at[1] - bones[upper].at[1], bones[lower].at[0] - bones[upper].at[0]);
    const rest2 = Math.atan2(bones[end].at[1] - bones[lower].at[1], bones[end].at[0] - bones[lower].at[0]);
    const parentTh = W[bones[upper].parent]?.th ?? 0;
    p.rot[upper] = wrap((th1 - rest1) / rad - parentTh);
    p.rot[lower] = wrap((th2 - rest2) / rad - (th1 - rest1) / rad);
    return p;
  }
  /** pieces: [{ bone, text }] in drawing order (bone null: scenery, never moves). Returns the frame's shapes. */
  function draw(pieces, W, opts = {}) {
    let out = "", open = null;
    // A bone that has moved is turned about its own pivot, then carried by how far that pivot moved (a rounded angle then moves a piece only by its
    // own size), always in that one form, both parts written, so a moving piece keeps the same shape of transform from frame to frame (the motion
    // checks match parts by it); a bone at rest is written bare.
    const tf = (n) => {
      const F = W[n], [ax, ay] = bones[n].at, dx = F.x - ax, dy = F.y - ay;
      if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05 && Math.abs(F.th) < 0.05) return "";
      return `translate(${n1(dx)} ${n1(dy)})rotate(${n1(F.th)} ${n1(ax)} ${n1(ay)})`;
    };
    for (const p of pieces) {
      const t = p.bone ? tf(p.bone) : "";
      const key = t ? `${p.bone}|${t}` : "";
      if (key !== open) {
        if (open) out += "</g>";
        if (key) out += `<g transform="${t}">`;
        open = key || null;
      }
      out += p.text;
    }
    if (open) out += "</g>";
    return out;
  }
  return { bones, order, solve, reach, draw, apply };
}

// ---------- people as data: a person module (person-<who>.js) writes its body packed, and unpacks it here once, as it loads
/** { bones, parts: [{ ...part, s: chain, e: { key: chain } }], keyed: { key: { mark: { p: points, c } } } } -> { model, keyed }. A chain is its start
 *  then each segment's two handles and its end, each a step from where the segment starts; points are the first, then each a step from the last;
 *  every number in hundredths of a unit, as whole numbers, so they come back exactly. */
export function unpackPerson(packed) {
  const chain = (a) => {
    const segs = [];
    let x = a[0], y = a[1];
    for (let i = 2; i < a.length; i += 6) {
      const s = [x / 100, y / 100], c1 = [(x + a[i]) / 100, (y + a[i + 1]) / 100], c2 = [(x + a[i + 2]) / 100, (y + a[i + 3]) / 100];
      x += a[i + 4]; y += a[i + 5];
      segs.push([s, c1, c2, [x / 100, y / 100]]);
    }
    return segs;
  };
  const points = (a) => { const out = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; out.push([x / 100, y / 100]); } return out; };
  const parts = packed.parts.map(({ s, e, ...p }) => ({ ...p, segs: chain(s), ...(e ? { ends: Object.fromEntries(Object.entries(e).map(([k, v]) => [k, chain(v)])) } : {}) }));
  const keyed = Object.fromEntries(Object.entries(packed.keyed).map(([k, marks]) => [k, { nodes: Object.fromEntries(Object.entries(marks).map(([n, m]) => [n, { p: points(m.p), c: m.c }])) }]));
  return { model: { bones: packed.bones, parts }, keyed };
}

// ---------- shapes: paths read and written, polygons, a level surface, a drop
// paths in, as absolute cubics: [{ start, segs: [[c1, c2, end], ...] }, ...] (M, L, C, Q, Z, absolute or relative)
export function parsePath(d) {
  const toks = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g), subs = [];
  let i = 0, cmd = "", cur = [0, 0], start = [0, 0], sub = null;
  const num = () => Number(toks[i++]);
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), at = (x, y) => (rel ? [cur[0] + x, cur[1] + y] : [x, y]);
    if (C === "Z") { if (sub && (cur[0] !== start[0] || cur[1] !== start[1])) sub.segs.push([cur, start, start]); cur = start; continue; }
    if (C === "M") { cur = start = at(num(), num()); sub = { start: cur, segs: [] }; subs.push(sub); cmd = rel ? "l" : "L"; continue; }
    if (C === "L") { const e = at(num(), num()); sub.segs.push([cur, e, e]); cur = e; continue; }
    if (C === "C") { const a = at(num(), num()), b = at(num(), num()), e = at(num(), num()); sub.segs.push([a, b, e]); cur = e; continue; }
    if (C === "Q") { const q = at(num(), num()), e = at(num(), num()); sub.segs.push([[cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])], [e[0] + (2 / 3) * (q[0] - e[0]), e[1] + (2 / 3) * (q[1] - e[1])], e]); cur = e; continue; }
    throw new Error(`a path command the face can't read: ${cmd}`);
  }
  return subs;
}

// written as the still's own paths are: relative steps of a tenth, each between rounded positions, with only the separators a number needs
// (r1 the puppet's rounding to a tenth; n1 the transforms' tenth, as written)
const r1 = rTenth;
export const writePath = (subs) => subs.map((s) => {
  let out = "", lastNum = false, lastDot = false, cx = r1(s.start[0]), cy = r1(s.start[1]);
  const num = (v) => { const t = n1(v); if (lastNum && t[0] !== "-" && !(t[0] === "." && lastDot)) out += " "; out += t; lastNum = true; lastDot = t.includes("."); };
  out += "M"; num(cx); num(cy); out += "c"; lastNum = false;
  for (const g of s.segs) { const q = g.map(([x, y]) => [r1(x), r1(y)]); for (const [x, y] of q) { num(x - cx); num(y - cy); } [cx, cy] = q[2]; }
  return `${out}z`;
}).join("");

/** A path's subpaths with every point through f. */
export const mapPath = (s, f) => ({ start: f(s.start), segs: s.segs.map((g) => g.map(f)) });
// a closed outline through points, smooth (Catmull-Rom to cubics), as one subpath
export const smoothRing = (P) => { const n = P.length, segs = []; for (let i = 0; i < n; i++) { const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], d = P[(i + 2) % n]; segs.push([[b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6], [c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6], c]); } return [{ start: P[0], segs }]; };

/** A polygon cut to what's below y0 (y grows down). */
export function below(poly, y0) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ina = a[1] >= y0, inb = b[1] >= y0;
    if (ina) out.push(a);
    if (ina !== inb) { const t = (y0 - a[1]) / (b[1] - a[1]); out.push([a[0] + t * (b[0] - a[0]), y0]); }
  }
  return out;
}
export const area = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
export const applyM = (M, [x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];

/** The height (y grows down) of a level surface leaving `amount` (an area) of a polygon below it; null when it holds none. */
export function levelIn(inner, amount) {
  const ys = inner.map((p) => p[1]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (amount <= 0) return null;
  if (amount >= area(inner)) return lo;
  // (halved until it's within a millionth of a unit)
  while (hi - lo > 1e-6) { const mid = (lo + hi) / 2; if (area(below(inner, mid)) > amount) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// A fall that stops: released from rest, it covers ½·a·s² (its speed greatest at the bottom), stops hard there, gives a little past it and
// comes back (the knees taking his weight). u from 0 (released) to 1 (down): the distance's share at seconds s after release.
export function drop(s, T, give = 0.07, settle = 0.32) {
  if (s <= 0) return 0;
  if (s < T) return (s / T) ** 2;
  const e = s - T, w = (2 * Math.PI) / settle;
  // (at the stop it keeps going at its full speed for an instant, into the give, then back: a damped swing whose first peak is `give`)
  return 1 + give * Math.sin(Math.min(e * w, Math.PI * 2)) * Math.exp(-e * 9) * (e * w < Math.PI * 2 ? 1 : 0);
}
