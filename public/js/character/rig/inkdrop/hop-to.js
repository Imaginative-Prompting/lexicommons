// Generated from the character's rig (08-lexicommons/docs/design/character/rig/inkdrop/hop-to.js) by its export-app.mjs. Edit it
// there and export again; the app's copy is never edited by hand.
// Tinta hops to your new place on Study's path strip (lex-character, 7 Nov 2026; approved: "Study's strip: a hop to your new place
// after a lesson"). The first time the strip shows a new place, he hops from the stop he stood on onto it: a crouch, a gravity arc across
// at a steady pace (as anything thrown), a landing squash and a jelly settle, ending exactly in idle on the same clock.
//
// hopToAct(ctx, base) → { name: "hop-to", dur: Infinity, durFor(data), exit: 0, frame(t, T, { rects, data }) }
//   ctx       what tinta.js draws with ({ draw, liquid, compose })
//   base      the state he ends in (idle, with at(T)); he stands in it over the stop he left until he goes
//   rects[0]  the stop he hops from (a box in his drawing's units, y down, from his place's middle): he starts over its middle and lands
//             on his own place (0). None (it's left the page): a small hop where he stands.
//   data      { go }: the act time he takes off from (the app's: the moment the strip is on the screen); until then (go null) he stands
//             over the old stop, breathing and blinking, so the strip can be drawn with him there from its first frame
//   durFor    data's length: go + HOP_DUR, or Infinity while he waits
// Every frame a pure function of (t, T, rects, data). The hop's own layer fades out over its last FADE seconds (the jelly is already all
// but still by then), so the last frame is the state's own drawing.

import { hop, smooth, span } from "../kit/acting.js";

/** He crouches from 0 to HOP_TAKEOFF, flies HOP_AIR seconds and lands at HOP_LAND (act seconds); the settle runs to HOP_DUR. */
export const HOP_TAKEOFF = 0.24;
export const HOP_AIR = 0.46;
export const HOP_LAND = HOP_TAKEOFF + HOP_AIR;
export const HOP_DUR = HOP_LAND + 0.9;
const FADE = 0.3;

export function hopToAct(ctx, base) {
  const { draw, liquid, compose } = ctx;
  return {
    name: "hop-to",
    dur: Infinity,
    exit: 0,
    durFor: (data) => (Number.isFinite(data?.go) ? data.go + HOP_DUR : Infinity),
    frame(at, T = at, { rects = [], data = null } = {}) {
      // Its own time: from the take-off's start (0 and before: standing over the old stop).
      const t = Number.isFinite(data?.go) ? Math.max(0, at - data.go) : 0;
      const box = rects?.[0] ?? null;
      // Where he starts: over the stop he stood on (its middle, across), and how high the arc goes for that distance.
      const from = box ? (box[0] + box[2]) / 2 : 0;
      const h = hop(t, HOP_TAKEOFF, { air: HOP_AIR, h: 18 + Math.min(22, Math.abs(from) * 0.14), crouch: 0.28, land: 0.32 });
      // Across while he's in the air, at a steady pace; still before he leaves and once he's down.
      const across = span(t, HOP_TAKEOFF, HOP_AIR);
      const fade = 1 - smooth(span(t, HOP_DUR - FADE, FADE));
      const now = base.at(T);
      // He leans into the way he's going as he crouches and flies, and back as he lands.
      const way = Math.sign(-from) || 0;
      const lean = way * 0.12 * (smooth(span(t, 0.05, HOP_TAKEOFF)) - smooth(span(t, HOP_LAND - 0.05, 0.3)));
      const pose = compose(now.pose, { x: from * (1 - across), air: h.y, squash: h.squash * fade, bend: h.bend * fade, lean: lean * fade });
      // The landing ripples him (on the clock), fading with the rest so the last frame is the state's own.
      const T0 = T - t;
      const hits = t >= HOP_LAND ? [{ t: T0 + HOP_LAND, e: 0.32 }] : [];
      const flow = { ...now.liquid, wave: (now.liquid?.wave ?? 0) + liquid(T, hits).wave * fade };
      const props = now.props(pose, 1);
      return (now.under ? props : "") + draw({ ...pose, liquid: flow }) + (now.under ? "" : props);
    },
  };
}
