// Generated from the character's rig (08-lexicommons/docs/design/character/rig/inkdrop/liquid-clips.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// The ink drop as liquid: ink spreads where it lands, ripples where it's hit and can drip, where a solid shape would only
// bounce. Three variations (MATERIALS A, B, C) through the same six places; each side-by-side reel puts today's
// drop beside one of them (today's side is clips.js itself, unchanged, plus a solid "falls in" for the new place).
//
// clipsFor(material) → [{ name, title, dur, frame(t) }]

import { SHAPES } from "./shapes.js";
import { inkPalette, tipEnd, worldOutline } from "./inkdrop.js";
import { byName as TODAY, compose, draw as drawRig, faceMix, ground } from "./clips.js";
import { alive, clamp01, droplet, hop, inOut, keys, outBack, outCubic, ring, smooth, span } from "../kit/acting.js";
import { drawDrip, drawSplat, drip, impactEnergy, runDown, splatMark } from "../kit/liquid.js";
import { f2 } from "../kit/geom.js";

const M_SEED_SPLAT = 61;
// The ink's colors from a palette (inkdrop.js PALETTES, or a theme's ink as an object): a name other than "light" is the dark one,
// as the reels are.
const inkOf = (palette) => {
  const P = inkPalette(typeof palette === "string" && palette !== "light" ? "dark" : palette);
  return { V: P.body, SHADE: P.shade, gloss: P.gloss };
};
const DARK = inkOf("dark");

export const MATERIALS = {
  A: { key: "A", name: "A: liquid drop", about: "today's shape, never solid: it ripples, sloshes, and sits in a wet foot", base: {}, wave0: 0.45, waveK: 2.8, foot: 0.12, puddle: 1.12, landSquash: 0.55, seed: 3 },
  B: { key: "B", name: "B: drippy drop", about: "ink keeps gathering at its curl, dripping off and running down it", base: {}, wave0: 0.45, waveK: 2.8, foot: 0.12, puddle: 1.15, landSquash: 0.55, seed: 4, drips: true },
  C: { key: "C", name: "C: bead", about: "a low, wide bead of ink: it wobbles more and oozes", base: { wide: 0.28, bellyLow: 0.8 }, wave0: 0.7, waveK: 3.4, foot: 0.22, puddle: 1.25, landSquash: 0.45, seed: 5, bead: true },
};

/** The material's liquid at time t, given its impacts ([{ t, e }]); slosh: the highlight lagging the body. */
function liquid(M, t, impacts = [], slosh = [0, 0], over = {}, calm = false) {
  // It ripples only while something moves it (an impact: a landing, a splat, a shiver), never at rest, so a
  // still is a clean curve. wave0 is no longer a resting ripple: calm clips (stills) take none at all.
  return { t, wave: calm ? 0 : M.waveK * impactEnergy(t, impacts), seed: M.seed, foot: M.foot, rim: true, puddle: M.puddle, slosh, ...over };
}

/** Where its right side runs down from under the curl to the ground (for B's drips): the drawn outline's points there,
 * moved `out` units along the outward normal, top to bottom. */
function rightSide(pose, out = 0.4) {
  const o = worldOutline(pose), n = o.length, x0 = pose.x ?? 0;
  const side = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = o[i];
    if (!(x - x0 > 8 && y > 1 && y < 86)) continue;
    const a = o[(i - 1 + n) % n], b = o[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    side.push([x + (out * (b[1] - a[1])) / l, y - (out * (b[0] - a[0])) / l]);
  }
  side.sort((a, b) => b[1] - a[1]);
  const pts = [];
  let lastY = Infinity;
  for (const p of side) if (lastY - p[1] > 1.5 && p[0] > (pts.length ? pts[pts.length - 1][0] - 8 : 0)) { pts.push(p); lastY = p[1]; }
  return pts;
}

/** The body's drawn surface right under a point (the highest outline point below it, near its x): where a drip lands. */
function surfaceBelow(pose, x, yAbove) {
  let best = 0;
  for (const [px, py] of worldOutline(pose)) if (Math.abs(px - x) < 2.5 && py < yAbove - 6 && py > best) best = py;
  return best;
}

/** Down the body's drawn surface from the point nearest `from`, to the ground, `out` units outside it: the way ink
 * runs (clockwise round a counter-clockwise outline is down its right side). */
function surfacePath(pose, from, out) {
  const o = worldOutline(pose), n = o.length;
  let k = 0, best = Infinity;
  o.forEach(([x, y], i) => { const d = (x - from[0]) ** 2 + (y - from[1]) ** 2; if (d < best) { best = d; k = i; } });
  const path = [];
  for (let s = 0; s < n; s++) {
    const i = (k - s + n) % n, [x, y] = o[i];
    const a = o[(i - 1 + n) % n], b = o[(i + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    path.push([x + (out * (b[1] - a[1])) / l, y - (out * (b[0] - a[0])) / l]);
    if (y < 3) break;
  }
  return path;
}

/** B's drip cycle from t0 every `every` seconds: a bead swells at the curl's end, drops onto its shoulder, runs down
 * its side (centered on its edge and under the body, so only the ink bulging past it shows, glinting, and it dries
 * back into the edge) and pools off its foot as a splat. */
function dripCycle(t, pose, { t0 = 0.6, every = 2.4, until = Infinity } = {}, col = DARK) {
  let svg = "", pre = "", bulb = 0;
  const te = tipEnd(pose);
  const R = 5.2, RUN = 0.8, OUT = 0;
  // tipEnd is the curl's end bulb's center: the drip hangs from the bulb's underside and lands on the shoulder below
  // it, then runs down the outline as drawn (the wet one, ripples and all).
  const hangY = te.at[1] - te.r + 1.5;
  const land = surfaceBelow(pose, te.at[0], hangY);
  for (let k = 0; t0 + k * every <= Math.min(t, until); k++) {
    const s = t0 + k * every;
    const d = drip(t, s, [te.at[0], hangY], { grow: 0.6, hang: 0.35, r: R, floor: land + R * 0.3 });
    if (!d) continue;
    if (d.phase === "grow" || d.phase === "hang") bulb = Math.max(bulb, (d.phase === "grow" ? (t - s) / 0.6 : 1) * 2.2);
    if (d.phase === "grow" || d.phase === "hang" || d.phase === "fall") svg += drawDrip(d, [te.at[0], hangY + 1], col.V);
    if (d.phase === "splat") {
      const path = surfacePath(pose, [d.c[0], land], OUT);
      const run = runDown(t, d.landedAt, path, { dur: RUN, r: 4.6, trail: 2.6, color: col.V, fade: 0.9, gloss: col.gloss, parts: true, min: 0 });
      pre += run.trail;
      svg += run.gloss;
      // It drips off its foot: a splat on the ground there, drying away.
      const end = path[path.length - 1];
      svg += splatAtIn(t, d.landedAt + RUN, end[0] + 8, M_SEED_SPLAT + k, { r: 8, stay: 1.1 }, col);
    }
  }
  return { svg, pre, bulb };
}

/** A splat mark at x that appears at t0 (spreading over 0.15 s) and dries away after `stay` s. */
function splatAtIn(t, t0, x, seed, { r = 16, stay = 2.2, scale = 1 } = {}, col = DARK) {
  if (t < t0) return "";
  const mark = splatMark(seed, { r, h: 3.4 });
  return drawSplat(mark, x, { grow: outCubic((t - t0) / 0.15), fade: clamp01((t - t0 - stay) / 0.6), color: col.V, dry: col.SHADE, scale });
}

/** Droplets thrown by an impact at t0 from (x, y): they arc out and land as small splats. */
function thrownIn(t, t0, x, y, seed, n = 4, col = DARK) {
  let svg = "";
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, vx = side * (60 + 50 * ((i * 37 + seed * 11) % 7) / 7), vy = 120 + 60 * (((i * 53 + seed) % 5) / 5);
    const d = droplet(t, t0, [x + side * 30, y + 6], [vx, vy], { r: 2.2 + (i % 3) * 0.7, stick: 1.2 });
    if (!d) continue;
    if (!d.landed) svg += `<circle cx="${f2(d.c[0])}" cy="${f2(-d.c[1])}" r="${f2(d.r)}" fill="${col.V}"/>`;
    else svg += drawSplat(splatMark(seed * 10 + i, { r: 3.2 + i % 2, h: 1.4, dots: 0 }), d.c[0], { grow: 1, fade: clamp01((t - t0 - 1.5) / 0.6), color: col.V, dry: col.SHADE });
  }
  return svg;
}

/**
 * The material's clips. opts (the app's; the reels use the defaults): palette "dark" | "light" (the ink and the drop),
 * ground: false (no ground line: a card or a page is its ground), detail and points (inkdrop.js: coarser and thinner,
 * for small sizes), aliveAt (the time its life layer runs on: a loop that wraps keeps breathing and blinking without a
 * jump), speakAt (the speaking mouth's params now, or null: a reaction played while the app speaks says the words too),
 * calm (no ripple at all, whatever moves it: for stills, which are drawn smooth).
 */
export function clipsFor(M, { palette = "dark", ground: withGround = true, detail, points, aliveAt = (t) => t, speakAt = () => null, calm = false } = {}) {
  const base = M.base;
  const col = inkOf(palette);
  const G = withGround ? ground : () => "";
  const sized = { ...(detail ? { detail } : {}), ...(points ? { points } : {}) };
  const draw = (p) => {
    const speak = speakAt();
    return drawRig({ ...p, ...sized, ...(speak ? { face: { ...p.face, speak } } : {}) }, palette);
  };
  const splatAt = (t, t0, x, seed, o) => splatAtIn(t, t0, x, seed, o, col);
  const thrown = (t, t0, x, y, seed, n) => thrownIn(t, t0, x, y, seed, n, col);
  const pose = (t, impacts, layers, liq = {}) => {
    const p = compose(alive(aliveAt(t), 40 + M.seed, 0.8), ...layers);
    return { ...p, ...base, liquid: liquid(M, t, impacts, liq.slosh, liq.over, calm) };
  };
  const withDrips = (t, p, opts) => {
    if (!M.drips) return { pre: "", post: "", p };
    const c = dripCycle(t, { ...p, ...sized, curl: 1 + (p.curl ?? 0) }, opts, col);
    return { pre: c.pre, post: c.svg, p: { ...p, liquid: { ...p.liquid, bulb: c.bulb } } };
  };

  return [
    {
      name: "idle", title: "Idle", dur: 4,
      frame: (t) => {
        // A little shimmy every so often keeps it wobbling like liquid; the highlight sloshes with the sway.
        const impacts = [{ t: 0.9, e: 0.25 }, { t: 2.6, e: 0.3 }];
        const sway = 0.05 * Math.sin(t * 1.7);
        const look = keys(t, [[0, [0, 0]], [1.4, [0, 0]], [1.6, [-0.8, 0.1], outBack], [2.5, [-0.8, 0.1]], [2.7, [0.6, 0], outBack], [3.4, [0.6, 0]], [3.6, [0, 0], outBack]]);
        let p = pose(t, impacts, [{ lean: sway, face: { look } }], { slosh: [-sway * 30, 0] });
        let trail = "";
        if (M.bead) {
          // It oozes along and back, leaning into it, and the ground it crossed stays wet, drying from where it was
          // longest ago (each bit of ground by when the bead last covered it).
          const OOZE = [[0, -30], [0.4, -30], [1.9, 30, inOut], [2.6, 30], [3.8, -30, inOut]];
          const at = (s) => keys(s, OOZE);
          const x = at(t), v = (at(t + 0.02) - x) / 0.02;
          const lean = Math.max(-0.12, Math.min(0.12, v * 0.0016));
          p = { ...p, x, lean: p.lean + lean, liquid: { ...p.liquid, slosh: [Math.max(-6, Math.min(6, -v * 0.07)), 0], wave: calm ? 0 : p.liquid.wave + Math.min(1.2, Math.abs(v) * 0.015) } };
          const N = 48, lo = -30 - 40, hi = 30 + 40, half = 40;
          for (let i = 0; i < N; i++) {
            const xi = lo + ((hi - lo) * (i + 0.5)) / N;
            let last = -1;
            for (let s = t; s >= 0; s -= 1 / 30) if (Math.abs(at(s) - xi) < half) { last = s; break; }
            if (last < 0) continue;
            const wet = 1 - clamp01((t - last) / 2.2);
            if (wet <= 0.02) continue;
            const hgt = 1.2 + 2.4 * wet;
            trail += `<rect x="${f2(xi - (hi - lo) / N / 2 - 0.3)}" y="${f2(-hgt + 0.6)}" width="${f2((hi - lo) / N + 0.6)}" height="${f2(hgt)}" fill="${wet > 0.45 ? col.V : col.SHADE}" opacity="${f2(Math.min(1, 1.3 * wet))}"/>`;
          }
        }
        const w = withDrips(t, p, { t0: 0.4, every: 2.6 });
        return G() + trail + w.pre + draw(w.p) + w.post;
      },
    },
    {
      name: "right", title: "A right answer", dur: 2.8,
      frame: (t) => {
        const T0 = 0.5, AIR = 0.52, land = T0 + AIR;
        let h = hop(t, T0, { air: AIR, h: 34, land: 0 });
        if (M.bead) {
          // A bead doesn't leave the ground: it pulls itself up tall, then splashes back down into itself.
          const up = t >= T0 && t < land ? Math.sin((Math.PI * (t - T0)) / AIR) : 0;
          h = { y: 0, air: 0, squash: t < T0 ? h.squash : -0.5 * up, bend: -0.12 * up, airborne: false };
        }
        // Landing like liquid: a deep splash-squash that rings out, a splat left round it, drops thrown.
        const squash = t >= land ? M.landSquash * ring(t - land, 2.2, 0.26) : h.squash * (t < T0 ? 1 : 1.35);
        const impacts = [{ t: land, e: 1.3 }, { t: T0, e: 0.4 }];
        const happy = t > 0.36 && t < 2.1 ? { closed: ["happy", "happy"], mouth: { type: "open", open: 0.75, w: 17, asym: 0.25 } } : {};
        let p = pose(t, impacts, [{ air: h.air, squash, bend: h.bend * 1.4, tip: h.airborne ? 0.3 : 0 }, { face: happy }], { slosh: [0, h.airborne ? 6 : -3 * ring(t - land, 2, 0.3)] });
        const w = withDrips(t, p, { t0: 99 });
        return G() + splatAt(t, land, 0, M.seed + 1, { r: 30, stay: 1.2 }) + thrown(t, land, 0, 0, M.seed) + w.pre + draw(w.p) + w.post;
      },
    },
    {
      name: "wrong", title: "A wrong answer: curious, never sad", dur: 3,
      frame: (t) => {
        const u = keys(t, [[0, 0], [0.4, 0], [0.75, 1, outBack], [2.3, 1], [2.75, 0]]);
        const impacts = [{ t: 0.55, e: 0.5 }, { t: 2.45, e: 0.4 }];
        const look = keys(t, [[0, [0, 0]], [0.9, [0, 0]], [1.05, [0.55, -0.55], outBack], [2.3, [0.55, -0.55]], [2.6, [0, 0]]]);
        let p = pose(t, impacts, [faceMix("neutral", "unsure", u), { face: { look } }], { slosh: [-8 * u, 0] });
        const w = withDrips(t, p, { t0: 0.5, every: 99 });
        return G() + w.pre + draw(w.p) + w.post;
      },
    },
    {
      name: "loading", title: "Loading: the ellipsis in drops of ink", dur: 3.6,
      frame: (t) => {
        const flicks = [0.55, 1.15, 1.75];
        let tip = 0, bend = 0;
        for (const f of flicks) {
          const u = t - f;
          if (u > -0.18 && u < 0.5) {
            tip += u < 0 ? -0.35 * inOut((u + 0.18) / 0.18) : -0.35 + 0.75 * outBack(Math.min(1, u / 0.12), 2) - 0.4 * clamp01((u - 0.12) / 0.3);
            bend += u < 0 ? 0.08 * inOut((u + 0.18) / 0.18) : -0.12 * ring(u, 3, 0.35);
          }
        }
        let svg = G();
        flicks.forEach((f, i) => {
          const x = 62 + i * 14, land = 0.42, u = t - f;
          if (u < 0) return;
          const p0 = [40, 96], v0 = [(x - p0[0]) / land, (0 - p0[1] + 0.5 * 520 * land * land) / land];
          if (u < land) {
            const c = [p0[0] + v0[0] * u, p0[1] + v0[1] * u - 0.5 * 520 * u * u];
            svg += `<circle cx="${f2(c[0])}" cy="${f2(-c[1])}" r="3" fill="${col.V}"/>`;
          } else {
            // Each lands as a little splat: it spreads, then the three dry away together.
            svg += drawSplat(splatMark(30 + i, { r: 5, h: 2.6, dots: 2 }), x, { grow: outCubic((u - land) / 0.12), fade: clamp01((t - 2.9) / 0.45), color: col.V, dry: col.SHADE });
          }
        });
        const impacts = flicks.map((f) => ({ t: f, e: 0.35 }));
        const look = [keys(t, [[0, 0.2], [0.4, 0.85], [2.6, 0.85], [3.1, 0.1]]), keys(t, [[0, 0], [0.4, -0.45], [2.6, -0.45], [3.1, 0]])];
        let p = pose(t, impacts, [{ tip, bend, lean: 0.12 * smooth(t / 0.4) * (1 - span(t, 3.0, 0.5)), face: { look } }]);
        const w = withDrips(t, p, { t0: 99 });
        return svg + w.pre + draw(w.p) + w.post;
      },
    },
    {
      name: "to-heart", title: "Becoming a heart: it pours itself into the shape", dur: 3.4,
      frame: (t) => {
        // It sags first (liquid gathering), then pours up into the heart, overshooting, rippling; then it runs back.
        const sag = span(t, 0.3, 0.25), up = span(t, 0.55, 0.35), back = span(t, 2.3, 0.4);
        const m = Math.min(1.06, outBack(up, 1.3)) * (1 - inOut(back));
        const impacts = [{ t: 0.55, e: 1.0 }, { t: 0.9, e: 0.6 }, { t: 2.7, e: 0.9 }];
        const squash = m > 0.05 ? 0 : 0.35 * inOut(sag) * (1 - up) + 0.35 * Math.sin(Math.PI * back) + (t > 2.7 ? 0.3 * ring(t - 2.7, 2.4, 0.28) : 0);
        let p = pose(t, impacts, [{ squash, face: m > 0.5 ? { look: [0, 0.15] } : {} }]);
        p.morph = m > 0.001 ? { ...SHAPES.heart, t: m } : null;
        if (base.wide) p.wide = base.wide * (1 - Math.min(1, m));
        // Drops shaken off as it pours, landing as small splats.
        return G() + thrown(t, 0.62, 0, 50, M.seed + 3, 3) + draw(p);
      },
    },
    {
      name: "falls-in", title: "Falling in: a drop of ink falls, splats, and pulls itself back up", dur: 3.4,
      frame: (t) => {
        // From rest above (½·g·t², accelerating), stretched by its speed; it splats flat with drops flying, rests a
        // beat as a splat, then gathers itself up out of it and settles, leaving the splat drying behind.
        const T0 = 0.15, H = 215, g = 520, tHit = T0 + Math.sqrt((2 * H) / g);
        let svg = G();
        let p;
        if (t < tHit) {
          const u = Math.max(0, t - T0), y = H - 0.5 * g * u * u, v = g * u;
          p = pose(t, [], [{ y, squash: -Math.min(0.55, v * 0.0016), face: { look: [0, -0.6], top: [0.15, 0.15] } }]);
          p.liquid.puddle = 0;
          svg += draw(p);
          return svg;
        }
        const u = t - tHit;
        const flat = 1 - smooth(clamp01((u - 0.55) / 0.5));          // a splat for a beat, then up out of it
        const m = Math.min(1, outCubic(u / 0.07)) * flat;
        const impacts = [{ t: tHit, e: 1.8 }, { t: tHit + 0.9, e: 0.8 }];
        const rise = clamp01((u - 0.55) / 0.5);
        const squash = m > 0.05 ? 0 : -0.25 * Math.sin(Math.PI * rise) + (u > 1.05 ? 0.3 * ring(u - 1.05, 2.4, 0.3) : 0);
        const eyes = u < 0.75 ? { closed: ["squeeze", "squeeze"] } : u < 1.6 ? { closed: ["happy", "happy"], mouth: { type: "open", open: 0.6, w: 15 } } : {};
        p = pose(t, impacts, [{ squash, face: eyes }]);
        p.morph = m > 0.001 ? { ...SHAPES.puddle, to: SHAPES.puddle.to.map(([x, y]) => [x * 1.25, y * 1.1]), eyes: [[-18, 9.5], [18, 9.5]], t: m } : null;
        svg += splatAt(t, tHit, 0, M.seed + 7, { r: 46, stay: 1.6 }) + thrown(t, tHit, 0, 0, M.seed + 5, 6);
        return svg + draw(p);
      },
    },
  ];
}

/** Today's drop through the same places: its own clips (clips.js), and a solid fall for the new place. */
export function todayClips() {
  return [
    { ...TODAY.idle, name: "idle", dur: 4 },
    { ...TODAY.hop, name: "right", dur: 2.8 },
    { ...TODAY.curious, name: "wrong", dur: 3 },
    { ...TODAY.loading, name: "loading", dur: 3.6 },
    { ...TODAY["to-heart"], name: "to-heart", dur: 3.4 },
    {
      name: "falls-in", title: "Falling in (solid)", dur: 3.4,
      frame: (t) => {
        const T0 = 0.15, H = 215, g = 520, tHit = T0 + Math.sqrt((2 * H) / g);
        let y = 0, squash = 0;
        if (t < tHit) { const u = Math.max(0, t - T0); y = H - 0.5 * g * u * u; squash = -Math.min(0.4, g * u * 0.0012); }
        else squash = 0.4 * ring(t - tHit, 2.8, 0.3);
        return ground() + drawRig(compose(alive(t, 9, 0.5), { y, squash }));
      },
    },
  ];
}
