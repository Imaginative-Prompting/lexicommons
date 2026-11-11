// Generated from the character's rig (08-lexicommons/docs/design/character/rig/inkdrop/read-line.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// Reading your AI's line (lex-character, 5 Nov 2026): on Home's AI card, Tinta stands on your answer bubble, beside your
// AI's last line, and reads it. An act for the app's perform():
//   readLine({ palette, size, ask, rtl, lineHeight }) → { name: "read", dur, exit: 0, frame(t, T, { rects }) }
// rects[0] is your AI's line (the element holding its words in the language), a box in tinta.js's VIEW units, y down.
// It starts from `beside` as it is at that moment (the card's held state: listening, turned toward your AI), leans to the
// line and reads it: its eyes hop along each row of words as eyes do (a quick hop, a pause on each word or two), row
// after row, in the text's direction (rtl: right to left), sweeping back to the start of the next. Then it reacts:
//   ask    the line waits on your answer (your AI asked, or had the last word): its brows go up and it looks at you, then
//          nods toward the line and back to you: your turn
//   glad   otherwise: its eyes shut happily, a smile, a small bounce
// Then it looks at you, smiling, and settles into `beside`, blended over its last BLEND seconds, so its last frame is
// exactly beside's drawing. With no line (it has left the page), it smiles at you and settles at once.
// lineHeight: the line's row height in CSS px, which says how many rows the box holds (1 to 3).
// Its timing is planned from the first line it's handed, and dur is set then (until its first frame, the longest a line
// can take): perform() reads dur every frame, so it settles as soon as the reading and its reaction are over.

import { MATERIALS } from "./liquid-clips.js";
import { drawDrop } from "./inkdrop.js";
import { compose } from "./clips.js";
import { detailFor, tinta, VIEW } from "./tinta.js";
import { BESIDE, besideLife } from "./states-places.js";
import { ring, smooth, span } from "../kit/acting.js";
import { impactEnergy } from "../kit/liquid.js";

const A = MATERIALS.A;
const EYES = [0, 34]; // its eyes' middle, in its units (y up): what it looks from
const LEAD = 0.35; // from beside's pose into reading, eyes to the first word
const HOP = 0.08; // an eye hop between fixations
const PX_PER_S = 260; // reading pace, CSS px of words a second
const ROW_MIN = 0.45, ROW_MAX = 1.2, RETURN = 0.16; // a row's time; the sweep back to the next row's start
const REACT = 0.9, AT_YOU = 0.45, BLEND = 0.5;

const lerp = (a, b, u) => a + (b - a) * u;
const lerpA = (a, b, u) => a.map((v, i) => lerp(v, b[i], u));
/** Two faces blended: numbers and arrays move, a mouth of the same type moves, anything else changes halfway. */
function mixFace(a = {}, b = {}, u) {
  if (u <= 0) return a;
  if (u >= 1) return b;
  const out = {};
  const zero = { look: [0, 0], top: [0, 0], bottom: [0, 0], tilt: [0, 0], blink: 0, pupil: 1, closed: [null, null], brows: { show: 0, raise: [0, 0], tilt: [0, 0] } };
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[k] ?? zero[k], vb = b[k] ?? zero[k];
    if (k === "brows") out[k] = { show: lerp(va.show ?? 0, vb.show ?? 0, u), raise: lerpA(va.raise ?? [0, 0], vb.raise ?? [0, 0], u), tilt: lerpA(va.tilt ?? [0, 0], vb.tilt ?? [0, 0], u) };
    else if (k === "mouth" && va && vb && va.type === vb.type) {
      out[k] = { ...vb };
      for (const f of ["smile", "w", "open"]) if (typeof va[f] === "number" || typeof vb[f] === "number") out[k][f] = lerp(va[f] ?? 0, vb[f] ?? 0, u);
    } else if (Array.isArray(va) && Array.isArray(vb)) out[k] = lerpA(va, vb, u);
    else if (typeof va === "number" && typeof vb === "number") out[k] = lerp(va, vb, u);
    else out[k] = u < 0.5 ? va : vb;
    if (out[k] === undefined) delete out[k]; // a field neither side sets is left to the drawing's default
  }
  return out;
}
// A pose field one side doesn't set is at its design value: 1 for these (inkdrop.js NEUTRAL), 0 for the rest.
const AT_ONE = new Set(["belly", "tipLen", "reach", "bellyLow", "scale"]);
/** Two poses blended (u 0..1), the face too. */
function mixPose(a, b, u) {
  const out = { ...a, face: mixFace(a.face, b.face, u) };
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === "face") continue;
    const va = a[k], vb = b[k], base = AT_ONE.has(k) ? 1 : 0;
    if (typeof va === "number" || typeof vb === "number") out[k] = lerp(va ?? base, vb ?? base, u);
  }
  return out;
}
const liquidToward = (own, theirs, u) => ({ ...theirs, wave: lerp(own.wave, theirs.wave, u), slosh: lerpA(own.slosh, theirs.slosh, u) });

/** The reading's timing for a line's box: its rows (each with its time and fixations) and when the reading ends. */
function plan(box, size, lineHeight) {
  const k = VIEW[3] / size; // VIEW units per CSS px
  const [x0, y0, x1, y1] = box; // y down
  const rows = Math.max(1, Math.min(3, Math.round((y1 - y0) / (lineHeight * k))));
  const px = (x1 - x0) / k;
  const dur = Math.max(ROW_MIN, Math.min(ROW_MAX, px / PX_PER_S));
  const hops = Math.max(2, Math.min(5, Math.round(px / 70)));
  const out = [];
  let t = LEAD;
  for (let r = 0; r < rows; r++) {
    out.push({ r, t0: t, dur, hops });
    t += dur + (r < rows - 1 ? RETURN : 0);
  }
  return { rows: out, end: t };
}

/** How far along its row the eyes are at t (0 its start, 1 its end): a fixation on each of `hops` places, a quick hop between. */
function along(row, t) {
  const u = (t - row.t0) / row.dur;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const n = row.hops, each = row.dur / n, i = Math.min(n - 1, Math.floor(u * n));
  if (i === 0) return 0;
  return lerp((i - 1) / (n - 1), i / (n - 1), smooth(Math.min(1, (t - row.t0 - i * each) / HOP)));
}

export function readLine({ palette = "dark", size = 44, ask = false, rtl = false, lineHeight = 20 } = {}) {
  const sized = detailFor(size);
  const draw = (p) => drawDrop({ ...p, ...sized, curl: 1 + (p.curl ?? 0) }, palette);
  const liquid = (t, impacts = []) => ({ t, wave: A.waveK * impactEnergy(t, impacts), seed: A.seed, foot: A.foot, rim: true, puddle: A.puddle, slosh: [0, 0] });
  const beside = tinta({ palette, size }).beside;
  let planned = null;
  // Its length is set by the first line it's handed (perform() asks for dur before any frame): a long line, 3 rows.
  const longest = LEAD + 3 * ROW_MAX + 2 * RETURN;
  const tail = REACT + AT_YOU + BLEND;
  const act = {
    name: "read",
    // Until its first frame plans the line, the longest a line can take.
    dur: longest + tail,
    exit: 0,
    frame(t, T = t, { rects = [] } = {}) {
      const box = rects?.[0] ?? null;
      const settle = beside.at(T);
      // No line: a smile at you, then beside.
      if (!box) {
        const u = smooth(span(t, 0, 0.5));
        const pose = mixPose(compose(BESIDE, besideLife(T), { face: { look: [0.6, -0.05], bottom: [0.3, 0.3], mouth: { type: "smile", smile: 1.2, w: 10 } } }), settle.pose, u);
        return draw({ ...pose, liquid: settle.liquid });
      }
      if (!planned) {
        planned = plan(box, size, lineHeight);
        act.dur = Math.min(longest + tail, planned.end + tail);
      }
      const P = planned, readEnd = P.end, end = act.dur;
      // Where the words are now (the box, y up), which side of it they're on, and their rows' heights.
      const [x0, y0, x1, y1] = box;
      const s = (x0 + x1) / 2 < 0 ? -1 : 1;
      const near = s < 0 ? x1 : x0, far = s < 0 ? x0 : x1;
      const rowY = (r) => -(y0 + ((r + 0.5) * (y1 - y0)) / P.rows.length);
      // Its eyes at a place along a row (a: 0 the row's start, 1 its end, in the text's direction), and its lean.
      const lookFor = (row, a) => {
        const x = rtl ? lerp(x1, x0, a) : lerp(x0, x1, a);
        const f = Math.abs(x - near) / (Math.abs(far - near) || 1); // 0 by it, 1 at the far end
        const dy = rowY(row.r) - EYES[1], d = Math.hypot(x - EYES[0], dy) || 1;
        // Across its eyes' range, the far end 1 and the near 0.25, so the sweep shows at card size.
        return { look: [s * lerp(0.25, 1, f), Math.max(-0.4, Math.min(0.5, (dy / d) * 0.9))], lean: s * lerp(0.07, 0.13, f) };
      };
      const rows = P.rows;
      let i = 0;
      for (const row of rows) if (t >= row.t0) i = row.r;
      let L = lookFor(rows[i], along(rows[i], t));
      const next = rows[i + 1];
      if (next && t > next.t0 - RETURN) {
        const u = smooth(span(t, next.t0 - RETURN, RETURN)), N = lookFor(next, 0);
        L = { look: lerpA(L.look, N.look, u), lean: lerp(L.lean, N.lean, u) };
      }
      const lookWords = L.look;
      const reading = { lean: L.lean, tip: 0.04, face: { look: lookWords, top: [0.22, 0.22], bottom: [0.18, 0.18], brows: { show: 1, raise: [0.12, 0.12], tilt: [0, 0] }, mouth: { type: "smile", smile: 0.55, w: 7 } } };
      // The reaction, after the reading.
      const r = t - readEnd;
      let react = null, impacts = [];
      if (r > 0) {
        if (ask) {
          // A question's look at you (as the rig's curious: its head tilted away from the line, one brow up), then a nod
          // toward the line, eyes flicking to it, and back to you: your turn.
          const nod = r > 0.45 && r < 0.8 ? Math.sin(Math.PI * ((r - 0.45) / 0.35)) : 0;
          react = {
            lean: -s * 0.1 * (1 - nod) + s * 0.05 * nod,
            tip: 0.18,
            bend: s * 0.05 * nod,
            squash: 0.04 * nod,
            face: { look: nod > 0.3 ? [s * 0.7, 0.05] : [0, -0.02], top: [0, 0.12], bottom: [0.2, 0.2], brows: { show: 1, raise: [0.95, 0.2], tilt: [0.1, -0.15] }, mouth: { type: "smile", smile: 0.8, w: 8 } },
          };
        } else {
          // Glad: its eyes shut happily, a smile, a small bounce.
          const bounce = 0.09 * ring(Math.max(0, r - 0.12), 2.6, 0.32);
          react = { squash: bounce, face: { look: [0, 0], closed: r > 0.1 && r < 0.8 ? ["happy", "happy"] : [null, null], bottom: [0.3, 0.3], brows: { show: 1, raise: [0.4, 0.4], tilt: [0, 0] }, mouth: { type: "smile", open: 0.55, smile: 1.5, w: 11 } } };
          impacts = [{ t: T - r + 0.12, e: 0.25 }];
        }
      }
      const atYou = { face: { look: [0, 0], bottom: [0.3, 0.3], brows: { show: 1, raise: [0.3, 0.3], tilt: [0, 0] }, mouth: { type: "smile", smile: 1.25, w: 10 } } };
      const life = besideLife(T);
      const readPose = compose(BESIDE, life, reading);
      let pose = readPose;
      if (react) pose = mixPose(readPose, compose(BESIDE, life, react), smooth(span(r, 0, 0.18)));
      if (r > REACT) pose = mixPose(pose, compose(BESIDE, life, atYou), smooth(span(r, REACT, 0.25)));
      // In from beside as it was, out into beside as it is.
      const start = beside.at(T);
      const fromBeside = 1 - smooth(span(t, 0, LEAD));
      if (fromBeside > 0) pose = mixPose(pose, start.pose, fromBeside);
      const toSettle = smooth(span(t, end - BLEND, BLEND));
      if (toSettle > 0) pose = mixPose(pose, settle.pose, toSettle);
      if (t >= end) return draw({ ...settle.pose, liquid: settle.liquid });
      const own = liquid(T, impacts);
      return draw({ ...pose, liquid: toSettle > 0 ? liquidToward(own, settle.liquid, toSettle) : own });
    },
  };
  return act;
}
