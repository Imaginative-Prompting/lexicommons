// Generated from the character's rig (08-lexicommons/docs/design/character/rig/inkdrop/today-throw.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// Today's throw: on the day's first finished thing, Tinta, by the streak, throws its drip into today's square, which is what
// marks the day. An act for the app's perform():
//   throwToday({ palette, size, into }) → { name: "throw", dur, exit: 0, frame(t, T, { rects }) }
// rects[0] is today's square (a box in tinta.js's VIEW units, y down). It starts from `ready` as it is at that moment
// (its drip hanging), gathers the drip into its curl's end as it winds up, flings it (inkdrop/throw.js: its pose and
// where the ink leaves), the drop flies on a gravity arc (lex-mascots' splat/throw.js) for exactly THROW_FLIGHT seconds,
// splats over the square and settles into its shape, then soaks away while the app's own square (studied) shows: the
// app holds the square's open look until THROW_IMPACT (seconds into the act), when the ink covers it. Tinta, delighted,
// settles into `into` (the held state the streak spot goes on in: counted, or the calm pose that holds today, mended),
// blended over its last BLEND seconds (its pose and ripple; the state's props, a patch, fading in), so its last frame is
// exactly that state's own drawing (any state with at(T)). With no square (it's left the page), no throw: it settles
// into `into` with a small happy bounce.
//
// mark: what the ink settles into. "square" (today's square), or "splat": the `studied` symbol's own outline (lx/symbols.js), on
// a mark drawn as that symbol; markScale is how big the symbol's drawn against rects[0] (46 px on a 40 px box: 1.15). Or "into":
// rects[0] is a glass (This week's, on the Knowledge page), and the drop falls into it, to its floor, and is gone at THROW_IMPACT,
// with no splat: the app's glass fills from that moment.

import { MATERIALS } from "./liquid-clips.js";
import { drawDrop, inkPalette } from "./inkdrop.js";
import { compose } from "./clips.js";
import { detailFor, tinta } from "./tinta.js";
import { throwLaunch, throwPose } from "./throw.js";
import { drip, READY, readyAt, readyEnd, readyLife } from "./states-places.js";
import { ring, smooth, span } from "../kit/acting.js";
import { impactEnergy } from "../kit/liquid.js";
import { f2 } from "../kit/geom.js";
import { drawFlying, drawInk, flight, shapes, splatInto } from "../splat/throw.js";

/** The ink leaves its curl at THROW_RELEASE, flies THROW_FLIGHT seconds and lands at THROW_IMPACT (act seconds). */
export const THROW_RELEASE = 0.8;
export const THROW_FLIGHT = 0.42;
export const THROW_IMPACT = THROW_RELEASE + THROW_FLIGHT;
const SOAK = 0.6, SOAK_DUR = 0.45; // after the impact: the ink holds in the square's shape, then soaks away
const DUR = THROW_IMPACT + 1.6, BLEND = 0.7; // the last BLEND seconds blend into the state it settles into

// The `studied` symbol's outline on its 96 grid: its splat and its three dots (scripts/test-art.mjs holds it to the symbol).
export const STUDIED_SPLAT = "M44 10C50 9 52 18 56 22 62 26 70 13 78 19 85 26 72 34 74 42 76 50 91 49 91 60 91 68 78 64 72 70 66 76 66 89 56 89 48 89 48 76 40 76 32 76 24 87 16 81 9 74 20 66 16 58 12 50 3 48 7 40 12 32 22 38 26 32 30 26 36 11 44 10Z";
export const STUDIED_DOTS = [[89, 30, 5], [20, 17, 5.5], [85, 83, 3.5]];
const STUDIED_POINTS = (() => {
  const n = STUDIED_SPLAT.match(/-?[\d.]+/g).map(Number);
  const points = [];
  for (let i = 2; i + 5 < n.length; i += 6) {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = n.slice(i - 2, i + 6);
    for (let k = 0; k < 5; k++) {
      const u = k / 5, v = 1 - u;
      points.push([v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3, v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3]);
    }
  }
  return points;
})();
/** The symbol as a distance field over a box (y up), at markScale times its size, in that box's units. */
function studiedField(sq, markScale) {
  const size = Math.min(sq[2] - sq[0], sq[3] - sq[1]) * markScale;
  const k = size / 96;
  const c = [(sq[0] + sq[2]) / 2, (sq[1] + sq[3]) / 2];
  const at = ([x, y]) => [c[0] + (x - 48) * k, c[1] - (y - 48) * k];
  return shapes.union(shapes.poly(STUDIED_POINTS.map(at)), ...STUDIED_DOTS.map(([x, y, r]) => shapes.dot(at([x, y]), r * k)));
}

const A = MATERIALS.A;
const unit = ([x, y]) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const EYES = [0, 34]; // its eyes' middle, in its units: what it looks from

// A pose field one side doesn't set is at its design value: 1 for these (inkdrop.js NEUTRAL), 0 for the rest (the curl is
// relative in compose: 0 is its design).
const AT_ONE = new Set(["belly", "tipLen", "reach", "bellyLow", "scale"]);
/** The numeric pose fields blended from a toward b (u 0..1); the face is b's past halfway. */
function blendPose(a, b, u) {
  const out = { ...a, face: u < 0.5 ? a.face : b.face };
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === "face") continue;
    const va = a[k], vb = b[k], base = AT_ONE.has(k) ? 1 : 0;
    if (typeof va === "number" || typeof vb === "number") out[k] = (va ?? base) + ((vb ?? base) - (va ?? base)) * u;
  }
  return out;
}

export function throwToday({ palette = "dark", size = 64, into = "counted", mark = "square", markScale = 1 } = {}) {
  const ink = inkPalette(palette);
  const sized = detailFor(size);
  const draw = (p) => drawDrop({ ...p, ...sized, curl: 1 + (p.curl ?? 0) }, palette);
  const liquid = (t, impacts = [], slosh = [0, 0], bulb = 0) => ({ t, wave: A.waveK * impactEnergy(t, impacts), seed: A.seed, foot: A.foot, rim: true, puddle: A.puddle, slosh, bulb });
  // The held state it settles into, as that state draws itself (its pose, liquid and props at T).
  const states = tinta({ palette, size });
  const target = typeof states[into]?.at === "function" ? states[into] : states.counted;
  /** Its own liquid toward the state's, by u (1: exactly the state's). */
  const liquidToward = (own, theirs, u) => ({
    ...theirs,
    wave: own.wave * (1 - u) + theirs.wave * u,
    slosh: [own.slosh[0] * (1 - u) + theirs.slosh[0] * u, own.slosh[1] * (1 - u) + theirs.slosh[1] * u],
    bulb: (own.bulb ?? 0) * (1 - u),
  });
  /** The state's props (a patch, an umbrella) at the pose, coming in with u. */
  const propsIn = (now, pose, u) => {
    if (u <= 0) return "";
    const svg = now.props(pose);
    return !svg || u >= 0.995 ? svg : `<g opacity="${f2(u)}">${svg}</g>`;
  };
  // Where the ink leaves, for a direction (tipEnd builds the whole outline: once per direction, not every frame).
  let launched = null;
  const launchFor = (dir, T0) => {
    const key = dir.map((v) => Math.round(v)).join(",");
    if (launched?.key !== key) {
      const { bulb: _bulb, ...layer } = throwPose(THROW_RELEASE, THROW_RELEASE, dir);
      const p = compose(READY, readyLife(T0 + THROW_RELEASE), layer);
      launched = { key, ...throwLaunch({ ...p, curl: 1 + (p.curl ?? 0), x: 0, y: 0, scale: 1 }, THROW_RELEASE, dir) };
    }
    return launched;
  };

  return {
    name: "throw",
    dur: DUR,
    exit: 0,
    frame(t, T = t, { rects = [] } = {}) {
      const T0 = T - t;
      const box = rects?.[0] ?? null;
      const start = readyAt(T0);
      const settle = target.at(T);
      const toSettle = smooth(span(t, DUR - BLEND, BLEND));
      if (!box) {
        // Nothing to throw at: from ready into the state it settles into, with a small happy bounce (gone by its end).
        const bounce = 0.08 * ring(Math.max(0, t - 0.3), 2.6, 0.32) * (1 - toSettle);
        const u = smooth(span(t, 0.2, 0.8));
        const pose = blendPose(compose(READY, readyLife(T)), compose(settle.pose, { squash: bounce }), u);
        const [len, r, sway] = start.drip;
        return drip(readyEnd(), len * (1 - u), r * (1 - u), sway, ink) + draw({ ...pose, liquid: liquidToward(liquid(T), settle.liquid, u) }) + propsIn(settle, pose, u);
      }
      // The square, y up, and its middle; the way from its eyes to it.
      const sq = [box[0], -box[3], box[2], -box[1]];
      const w = sq[2] - sq[0], h = sq[3] - sq[1];
      // Where it lands: the square's middle, or for a glass its floor, inside (it falls in).
      const c = mark === "into" ? [(sq[0] + sq[2]) / 2, sq[1] + 0.12 * h] : [(sq[0] + sq[2]) / 2, (sq[1] + sq[3]) / 2];
      const dir = [c[0] - EYES[0], c[1] - EYES[1]];
      const [ux, uy] = unit(dir);
      const look = [ux * 0.85, uy * 0.45];

      // Its body: ready's pose, eyes going to the square, then the throw's own layers (wind-up, fling, follow-through).
      const { bulb = 0, ...layer } = throwPose(t, THROW_RELEASE, dir);
      const toward = smooth(span(t, 0.05, 0.25)) * (1 - smooth(span(t, THROW_RELEASE - 0.36, 0.14)));
      const after = t - THROW_IMPACT;
      // Once it lands: eyes on the square as the ink settles, then delighted (^^) with a small bounce.
      const landed = after >= 0;
      const delighted = after > 0.25 && after < 1.1;
      const bounce = landed ? 0.09 * ring(Math.max(0, after - 0.2), 2.6, 0.32) : 0;
      let pose = compose(READY, readyLife(T), layer, {
        squash: bounce,
        face: {
          look: landed && !delighted ? [look[0] * 0.8, look[1] * 0.8] : [look[0] * toward, look[1] * toward],
          ...(delighted ? { closed: ["happy", "happy"], mouth: { type: "smile", open: 0.6, smile: 1.5, w: 12 } } : {}),
        },
      });
      if (toSettle > 0) pose = blendPose(pose, settle.pose, toSettle);

      // The drip: as it was, until the wind-up gathers it into the curl's end (throwPose's bulb grows meanwhile).
      const [len0, r0] = start.drip;
      const gather = smooth(span(t, THROW_RELEASE - 0.4, 0.25));
      const sway = 0; // as ready's: the drip hangs still, the body's breath and lean carrying it
      const dripSvg = gather < 1 ? drip(readyEnd(), (len0 + (5 - len0) * smooth(span(t, 0, 0.3))) * (1 - gather), r0 * (1 - gather), sway, ink) : "";

      // The flight: from where the ink leaves to the square's middle, its arc fitted to land at THROW_IMPACT.
      const L = launchFor(dir, T0);
      const arc = 10 + 0.08 * Math.abs(c[0] - L.at[0]);
      const top = Math.max(L.at[1], c[1]) + arc;
      const g = ((Math.sqrt(2 * (top - L.at[1])) + Math.sqrt(2 * (top - c[1]))) / THROW_FLIGHT) ** 2;
      const f = flight(t, { t0: THROW_RELEASE, from: L.at, to: c, h: arc, r: L.r, g });

      // The splat: over the square, settling into its shape (corners as the app's: 8 of 28 px) or the mark's, then soaking away.
      let splat = "";
      const soak = 1 - smooth(span(after, SOAK, SOAK_DUR));
      if (landed && soak > 0.01 && mark !== "into") {
        const R = 0.62 * Math.min(w, h);
        const settled = mark === "splat" ? studiedField(sq, markScale) : shapes.rect(sq[0], sq[1], sq[2], sq[3], 0.29 * Math.min(w, h));
        const spread = splatInto(t, THROW_IMPACT, { at: c, R, seed: 7, target: settled, settle: 0.35, dir: f.v ?? [ux, uy] });
        if (spread) {
          const pad = R * 1.9, res = Math.max(0.5, Math.min(w, h) / 32);
          const drawn = drawInk([{ field: spread.field, box: [sq[0] - pad, sq[1] - pad, sq[2] + pad, sq[3] + pad] }], ink, { res, k: Math.min(w, h) / 28 });
          splat = soak < 1 ? `<g opacity="${f2(soak)}">${drawn}</g>` : drawn;
        }
      }
      // Its own ripples hand over to the state's as it settles, and the state's props come in: its last frame is that
      // state's own drawing exactly.
      const own = liquid(T, [{ t: T0 + THROW_RELEASE, e: 0.55 }, ...(landed ? [{ t: T0 + THROW_IMPACT + 0.2, e: 0.22 }] : [])], [0, 0], bulb);
      const liq = toSettle > 0 ? liquidToward(own, settle.liquid, toSettle) : own;
      return dripSvg + draw({ ...pose, liquid: liq }) + propsIn(settle, pose, toSettle) + drawFlying(f, ink) + splat;
    },
  };
}
