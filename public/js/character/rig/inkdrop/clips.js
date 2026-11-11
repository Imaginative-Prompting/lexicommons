// Generated from the character's rig (08-lexicommons/docs/design/character/rig/inkdrop/clips.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// The ink drop's animation vocabulary, first reel (places.md "What it needs"). Each clip is a pure function of time:
// frame(t) → SVG content in the drop's units (y up; drawDrop flips). Every clip starts and ends at rest, so they chain.

import { drawDrop, PALETTES, tipEnd } from "./inkdrop.js";
import { EXPRESSIONS } from "./poses.js";
import { SHAPES } from "./shapes.js";
import { alive, clamp01, droplet, hop, inOut, keys, outBack, ring, smooth, span } from "../kit/acting.js";
import { f2, smoothPath } from "../kit/geom.js";

// The reels are the dark palette's; the ink they throw and pour is its body.
const VIOLET = PALETTES.dark.body;

/** Adds acting layers onto a pose: numbers add (belly multiplies), the face's look adds, blink takes the max. */
export function compose(...layers) {
  const out = { face: { look: [0, 0], blink: 0 } };
  for (const L of layers) {
    if (!L) continue;
    for (const [k, v] of Object.entries(L)) {
      if (k === "face") {
        for (const [fk, fv] of Object.entries(v)) {
          if (fk === "look") out.face.look = [out.face.look[0] + fv[0], out.face.look[1] + fv[1]];
          else if (fk === "blink") out.face.blink = Math.max(out.face.blink, fv);
          else out.face[fk] = fv;
        }
      } else if (k === "look") out.face.look = [out.face.look[0] + v[0], out.face.look[1] + v[1]];
      else if (k === "blink") out.face.blink = Math.max(out.face.blink, v);
      else if (k === "belly") out.belly = (out.belly ?? 1) * v;
      else if (typeof v === "number" && typeof out[k] === "number") out[k] += v;
      else out[k] = v;
    }
  }
  return out;
}

/** Blends two expressions' face fields (numbers and arrays), for moving between faces. */
export function faceMix(a, b, u) {
  const A = (EXPRESSIONS[a] || { face: {} }), B = (EXPRESSIONS[b] || { face: {} });
  const out = {};
  const keysAll = new Set([...Object.keys(A.face), ...Object.keys(B.face)]);
  const dflt = { look: [0, 0], top: [0, 0], tilt: [0, 0], bottom: [0, 0], pupil: 1, closed: [null, null], brows: { show: 0, raise: [0, 0], tilt: [0, 0] } };
  for (const k of keysAll) {
    const va = A.face[k] ?? dflt[k], vb = B.face[k] ?? dflt[k];
    if (k === "closed") out[k] = u < 0.5 ? va : vb;
    else if (k === "mouth") out[k] = u < 0.5 ? va ?? { type: "smile" } : vb ?? { type: "smile" };
    else if (k === "brows") out[k] = { show: lerpN(va.show, vb.show, u), raise: lerpA(va.raise, vb.raise, u), tilt: lerpA(va.tilt, vb.tilt, u) };
    else if (Array.isArray(va)) out[k] = lerpA(va, vb, u);
    else if (typeof va === "number") out[k] = lerpN(va, vb, u);
  }
  const body = {};
  for (const k of ["squash", "lean", "tip", "curl"]) {
    const va = A[k] ?? (k === "curl" ? 1 : 0), vb = B[k] ?? (k === "curl" ? 1 : 0);
    body[k] = lerpN(va, vb, u) - (k === "curl" ? 1 : 0);
  }
  return { ...body, face: out };
}
const lerpN = (a, b, u) => a + (b - a) * u;
const lerpA = (a, b, u) => a.map((v, i) => lerpN(v, b[i], u));

/** The pose's curl is relative in compose (0 = its design); turn it back into drawDrop's absolute curl. */
export const draw = (pose, pal = "dark") => drawDrop({ ...pose, curl: 1 + (pose.curl ?? 0) }, pal);

export const ground = (w = 140, col = "#1d1c19") => `<line x1="${-w}" y1="0" x2="${w}" y2="0" stroke="${col}" stroke-width="1.2"/>`;

// ---------------------------------------------------------------------------------------------------------------

export const CLIPS = [
  {
    name: "idle", title: "Idle: breathing, blinking, glancing, its tip swaying (never still)", dur: 6,
    frame: (t) => {
      const look = keys(t, [[0, [0, 0]], [1.4, [0, 0]], [1.6, [-0.8, 0.1], outBack], [2.6, [-0.8, 0.1]], [2.8, [0.75, -0.1], outBack], [3.8, [0.75, -0.1]], [4.05, [0, 0], outBack]]);
      const turn = keys(t, [[0, 0], [1.5, 0], [1.9, -0.32], [2.7, -0.32], [3.15, 0.3], [3.9, 0.3], [4.4, 0]]);
      return ground() + draw(compose(alive(t, 2, 1.4), { face: { look, turn } }));
    },
  },
  {
    name: "hop", title: "A right answer: anticipation, a hop on a gravity arc, a landing squash, a jelly settle", dur: 2.4,
    frame: (t) => {
      const h = hop(t, 0.5, { air: 0.52, h: 34 });
      const happy = span(t, 0.36, 0.08) > 0 && t < 1.75;
      const face = happy ? { closed: ["happy", "happy"], mouth: { type: "open", open: 0.75, w: 17, asym: 0.25 } } : {};
      return ground() + draw(compose(alive(t, 4), { air: h.air, squash: h.squash, bend: h.bend, tip: h.airborne ? 0.25 : 0 }, { face }));
    },
  },
  {
    name: "curious", title: "A wrong answer: curious, never sad. A tilt, a look at the right answer, a small nod", dur: 3,
    frame: (t) => {
      const u = keys(t, [[0, 0], [0.4, 0], [0.75, 1, outBack], [2.3, 1], [2.75, 0]]);
      const nod = 0.12 * Math.sin(Math.PI * clamp01((t - 1.6) / 0.35)) * (t > 1.6 && t < 1.95 ? 1 : 0);
      const look = keys(t, [[0, [0, 0]], [0.9, [0, 0]], [1.05, [0.55, -0.55], outBack], [2.3, [0.55, -0.55]], [2.6, [0, 0]]]);
      return ground() + draw(compose(alive(t, 5), faceMix("neutral", "unsure", u), { face: { look }, squash: nod * 0.8, bend: -nod }));
    },
  },
  {
    name: "look", title: "Looking round: the eyes lead, the body turns after on a softer spring", dur: 3.4,
    frame: (t) => {
      const look = keys(t, [[0, [0, 0]], [0.35, [0, 0]], [0.5, [-0.95, 0.15], outBack], [1.4, [-0.95, 0.15]], [1.55, [0.95, 0.4], outBack], [2.4, [0.95, 0.4]], [2.6, [0, 0], outBack]]);
      const turnTarget = (s) => keys(s, [[0, 0], [0.5, -0.55], [1.5, 0.5], [2.55, 0]]);
      // The body follows the eyes a beat later, overshooting a little (a spring on the target's steps).
      const turn = turnTarget(t - 0.12) + 0.08 * Math.sin(8 * t) * Math.exp(-3 * ((t % 1.05) + 0.2)) * 0;
      const lean = keys(t, [[0, 0], [0.62, -0.12, outBack], [1.52, -0.12], [1.72, 0.14, outBack], [2.6, 0.14], [2.85, 0, outBack]]);
      return ground() + draw(compose(alive(t, 6, 0.6), { lean, face: { look, turn } }));
    },
  },
  ...["heart", "star", "check", "seven", "bubble"].map((shape) => ({
    name: `to-${shape}`,
    title: {
      heart: "Splashing into a heart and back, its eyes riding along",
      star: "Splashing into a star (a run of right answers)",
      check: "Becoming a check mark (right)",
      seven: "Becoming a 7 (a 7-day streak)",
      bubble: "Becoming a speech bubble",
    }[shape],
    dur: 3.2,
    frame: (t) => {
      // hold 0.35 · anticipation squash 0.15 · pop out 0.28 (overshoot) · hold, with a pulse · squeeze back 0.3 · settle
      const pre = span(t, 0.35, 0.15), out = span(t, 0.5, 0.28), back = span(t, 2.25, 0.3);
      const m = clamp01(outBack(out, 1.4)) * (1 - inOut(back));
      const mOver = outBack(out, 1.4) * (1 - inOut(back));
      const squash = 0.3 * inOut(pre) * (1 - out) + 0.3 * Math.sin(Math.PI * back) + 0.25 * ring(t - 2.55, 2.6, 0.32) * (t > 2.55 ? 1 : 0);
      const pulse = shape === "heart" && t > 0.9 && t < 2.2 ? 1 + 0.05 * Math.max(0, Math.sin(2 * Math.PI * (t - 0.9) / 0.6)) ** 3 : 1;
      const S = SHAPES[shape];
      const morph = m > 0.001 ? { ...S, t: Math.min(1.08, mOver), to: S.to } : null;
      // Splash: droplets thrown as it pops, falling under gravity.
      const drops = [];
      [[-70, 150], [-35, 200], [30, 210], [75, 140], [5, 230]].forEach((v, i) => {
        const d = droplet(t, 0.55 + i * 0.012, [v[0] * 0.08, 70], v, { r: 2.4 + (i % 3) });
        if (d) drops.push(d);
      });
      const pose = compose(alive(t, 7, 0.5), { squash: m > 0.05 ? 0 : squash, face: m > 0.5 ? { look: [0, 0.15] } : {} });
      return ground() + draw({ ...pose, scale: pulse, y: (1 - pulse) * 40, morph, drops });
    },
  })),
  {
    name: "loading", title: "Loading: it flicks its tip and writes the ellipsis, one drop at a time", dur: 3.6,
    frame: (t) => {
      const flicks = [0.55, 1.15, 1.75];
      let tip = 0, bend = 0, lean = 0.12;
      for (const f of flicks) {
        const u = t - f;
        if (u > -0.18 && u < 0.5) {
          tip += u < 0 ? -0.35 * inOut((u + 0.18) / 0.18) : -0.35 + 0.75 * outBack(Math.min(1, u / 0.12), 2) - 0.4 * clamp01((u - 0.12) / 0.3);
          bend += u < 0 ? 0.08 * inOut((u + 0.18) / 0.18) : -0.12 * ring(u, 3, 0.35);
        }
      }
      let svg = ground();
      // Each flick throws a drop from the tip's end (about (44, 98) leaning) that lands as a dot.
      flicks.forEach((f, i) => {
        const x = 62 + i * 14;
        const land = 0.42;
        const u = t - f;
        const fade = 1 - span(t, 2.9, 0.4);
        if (u < 0 || fade <= 0) return;
        const p0 = [40, 96], v0 = [(x - p0[0]) / land, (0 - p0[1] + 0.5 * 520 * land * land) / land];
        if (u < land) {
          const c = [p0[0] + v0[0] * u, p0[1] + v0[1] * u - 0.5 * 520 * u * u];
          svg += `<circle cx="${f2(c[0])}" cy="${f2(-c[1])}" r="3" fill="${VIOLET}"/>`;
        } else {
          const s = outBack(Math.min(1, (u - land) / 0.15), 2.5);
          svg += `<ellipse cx="${x}" cy="${f2(-3.2 * s)}" rx="${f2(4.4 * s)}" ry="${f2(3.2 * s)}" fill="${VIOLET}" opacity="${f2(fade)}"/>`;
        }
      });
      const look = [keys(t, [[0, 0.2], [0.4, 0.85], [2.6, 0.85], [3.1, 0.1]]), keys(t, [[0, 0], [0.4, -0.45], [2.6, -0.45], [3.1, 0]])];
      return svg + draw(compose(alive(t, 8, 0.6), { tip, bend, lean: lean * smooth(t / 0.4) * (1 - span(t, 3.0, 0.5)), face: { look } }));
    },
  },
  {
    name: "puddle", title: "Melting into a puddle, peeking, and standing back up", dur: 3.6,
    frame: (t) => {
      // A little stretch up first (anticipation), then it slumps under gravity (accelerating), spreads, peeks.
      const up = span(t, 0.35, 0.16), down = span(t, 0.51, 0.3), rise = span(t, 2.3, 0.32);
      const m = Math.min(1, down ** 2) * (1 - inOut(rise));
      const squash = -0.22 * inOut(up) * (1 - down) - 0.3 * Math.sin(Math.PI * rise) + 0.3 * ring(t - 2.62, 2.7, 0.3) * (t > 2.62 ? 1 : 0);
      const look = [keys(t, [[0, 0], [1.2, 0], [1.35, -0.8, outBack], [1.7, -0.8], [1.85, 0.8, outBack], [2.15, 0.8], [2.3, 0]]), 0.4 * m];
      const pose = compose(alive(t, 9, 0.5), { squash: m > 0.05 ? 0 : squash, face: { look } });
      return ground() + draw({ ...pose, morph: m > 0.001 ? { ...SHAPES.puddle, t: m } : null });
    },
  },
  {
    name: "pour", title: "A download: its tip becomes a spout and pours it into the progress bar; full, it hops", dur: 4.6,
    frame: (t) => {
      const X0 = -70;
      const spout = tipEnd({ x: X0, tip: -1.05, curl: 0.5, tipLen: 2.5, lean: 0.1 });
      const bar = { x: spout.at[0] - 10, y: 0, w: 150, h: 13 };
      // Reach out (0.45–0.85, overshooting), pour (0.9–3.1), draw back (3.1–3.4), hop (3.5).
      const reachOut = keys(t, [[0, 0], [0.45, 0], [0.85, 1, outBack], [3.1, 1], [3.4, 0]]);
      const fill = clamp01((t - 0.95) / 2.1);
      const belly = 1 - 0.3 * smooth(fill) * (1 - span(t, 3.15, 0.3));
      const h = hop(t, 3.55, { air: 0.42, h: 20 });
      const body = { x: X0, air: h.air, squash: h.squash + 0.12 * Math.sin(Math.PI * span(t, 0.3, 0.2)), belly,
        tip: -1.05 * reachOut, curl: 1 - 0.5 * reachOut, tipLen: 1 + 1.5 * reachOut, lean: 0.1 * reachOut, bend: h.bend };
      const look = [keys(t, [[0, 0], [0.4, 0.9], [3.1, 0.9], [3.35, 0]]), keys(t, [[0, 0], [0.4, -0.55], [3.1, -0.55], [3.35, 0]])];
      const done = t > 3.4 && t < 4.3 ? { closed: ["happy", "happy"], mouth: { type: "open", open: 0.6, w: 15 } } : {};
      const pose = compose(alive(t, 10, 0.4), { ...body, curl: body.curl - 1 }, { face: { look, ...done } });
      const abs = { ...pose, curl: 1 + pose.curl };
      let svg = ground(170);
      svg += `<rect x="${bar.x}" y="${-bar.y - bar.h}" width="${bar.w}" height="${bar.h}" rx="6.5" fill="#151513" stroke="#3a3833" stroke-width="1"/>`;
      if (fill > 0) svg += `<rect x="${bar.x}" y="${-bar.y - bar.h}" width="${f2(Math.max(bar.h, bar.w * fill))}" height="${bar.h}" rx="6.5" fill="${VIOLET}"/>`;
      if (t > 0.9 && t < 3.1) {
        const tip = tipEnd(abs);
        // It falls: out of the spout along its direction, then straight down under gravity into the bar's left end.
        const land = [tip.at[0] + 3, bar.y + bar.h];
        const out = [tip.at[0] + tip.dir[0] * 4, tip.at[1] + tip.dir[1] * 4];
        const wob = 0.8 * Math.sin(t * 19);
        const pts = [tip.at, out, [land[0] + wob, (out[1] + land[1]) / 2], land];
        const w = (t < 1.05 ? (t - 0.9) / 0.15 : t > 2.95 ? (3.1 - t) / 0.15 : 1) * (4.2 + 0.8 * Math.sin(t * 13));
        svg += `<path d="${smoothPath(pts, false)}" stroke="${VIOLET}" stroke-width="${f2(Math.max(0.5, w))}" stroke-linecap="round" fill="none"/>`;
      }
      return svg + drawDrop(abs, "dark");
    },
  },
  {
    name: "sleepy", title: "Reminders are paused: it rests, breathing slowly", dur: 4,
    frame: (t) => {
      let svg = ground();
      for (let i = 0; i < 3; i++) {
        const u = ((t + i * 1.33) % 4) / 4;
        const x = 48 + 20 * u + 4 * Math.sin(u * 6), y = 112 + 36 * u, s = 6 + 6 * u;
        const op = Math.sin(Math.PI * u);
        svg += `<path d="M${f2(x)},${f2(-y)} h${f2(s)} l${f2(-s)},${f2(s)} h${f2(s)}" stroke="#A7A49C" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="${f2(op * 0.85)}"/>`;
      }
      const breath = Math.sin((2 * Math.PI * t) / 4);
      return svg + draw(compose(faceMix("neutral", "sleepy", 1), { belly: 1 + 0.025 * breath, squash: 0.03 * breath, tip: 0.05 * breath }));
    },
  },
];

export const byName = Object.fromEntries(CLIPS.map((c) => [c.name, c]));
