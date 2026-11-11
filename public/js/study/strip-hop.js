// Tinta's hop on Study's path strip (study/doors.js pathStrip calls hopWhenSeen as it builds the strip). The first time the strip shows a
// new place (your place moved on since this device last saw the strip, in this language), he stands over the stop before it from the
// strip's first frame and, once the strip is on the screen clear of the tab bar, hops onto your place: the rig's inkdrop/hop-to.js,
// played on his own rig (he stands with no ground of his own on the strip), ending in idle.
// - Once a new place: it's taken as seen the moment the hop starts, or at once when there's nothing to hop (a first sight, the same place
//   or an earlier one, the first stop, animations off).
// - Kept per language and per path (its number of lessons): a path that changes under you (a newcomer's starter giving way to the path
//   when its lessons arrive) is a first sight, never a hop.
// - Never blocking: a press ends it as it ends every animation (he's at your place); the page never waits on him.
// - He's ink: the strip's first frame shows the old progress (the line to the stop he stands on, that stop your place's ring, the next
//   one plain), and the new segment inks in under him as he flies, landing with him: the stop he leaves fills to a blot as he takes off,
//   and the one he lands on rings up as he lands. Drawn in his own frames, at his act's own time (inkStrip, a pure function of it), and
//   put back exactly as doors.js drew it once he's landed, or the moment his act ends any other way.
import * as motion from "../lx/motion.js";
import { HOP_AIR, HOP_LAND, HOP_TAKEOFF } from "../character/rig/inkdrop/hop-to.js";
import { outBack, smooth, span } from "../character/rig/kit/anim.js";
import { learning } from "./learning.js";
import { sampleKey } from "./sample-mode.js";

// Per language and path ("<lang>:<lessons>"): the place (a lesson's index on the path) the strip last showed on this device.
const SEEN = sampleKey("lx.study.stripSeen");
const readSeen = () => {
  try {
    const all = JSON.parse(localStorage.getItem(SEEN) ?? "null");
    return all && typeof all === "object" ? all : {};
  } catch {
    return {};
  }
};
const writeSeen = (lang, here) => {
  const all = readSeen();
  all[lang] = here;
  try {
    localStorage.setItem(SEEN, JSON.stringify(all));
  } catch {
    // Full, or private browsing: he may hop again on another visit to the same place.
  }
};

/**
 * The strip's hop, when there's one to make. line: the strip's .lx-path-strip-line (his ui.character in it); here: your place among the
 * path's `count` lessons; at: its stop in the strip's drawing; svg: the strip's drawing (its stops' circles in order).
 */
export function hopWhenSeen(line, { here, at, svg, count }) {
  const tinta = line?.querySelector('[data-part="character"]');
  const lang = `${learning()}:${count}`;
  const seen = readSeen()[lang];
  const from = at > 0 ? svg?.querySelectorAll("circle")[at - 1] : null;
  // A first sight has nothing to hop from: your place is the one to hop on from.
  if (!tinta || !from || !Number.isFinite(seen) || here <= seen || !motion.motionOn()) {
    writeSeen(lang, here);
    return;
  }
  // The strip at the old progress until he goes; done() puts doors.js's own drawing back.
  const ink = inkStrip(svg, at);
  let handle = null, startedAt = 0, seenAt = null;
  const go = () => handle?.set({ go: Math.max(0, (seenAt - startedAt) / 1000) });
  // The act, its every frame inking the strip to the same moment (a remake, on a new theme, wraps the new one).
  const make = () => {
    const act = tinta.clips().hopTo();
    return {
      ...act,
      frame(t, T, ctx) {
        const drawing = act.frame(t, T, ctx);
        ink.at(t, ctx?.data);
        return drawing;
      },
    };
  };
  // He stands over the stop he left from the strip's first frame: the act starts as he's put on the page (performOnArrival), waiting
  // for its go; at once if the strip was on the screen before his drawing's code had come.
  const start = () => {
    if (!motion.motionOn()) {
      ink.done();
      return void writeSeen(lang, here);
    }
    tinta.performOnArrival(make, [from], { data: { go: seenAt === null ? null : 0 } }).then((h) => {
      startedAt = performance.now();
      handle = h;
      // Nothing played (animations went off, he left the page first): the strip as it is.
      if (tinta.getAttribute("data-state") !== "hop-to") return ink.done();
      // Ended any way (landed and settled, a press, animations off): the strip as it is, at once.
      const ended = new MutationObserver(() => {
        if (tinta.getAttribute("data-state") === "hop-to") return;
        ended.disconnect();
        ink.done();
      });
      ended.observe(tinta, { attributes: true, attributeFilter: ["data-state"] });
      // Seen while it was being started: it goes now.
      if (seenAt !== null) go();
    });
  };
  if (typeof tinta.performOnArrival === "function") start();
  else customElements.whenDefined("lx-tinta").then(start);
  // On the screen means clear of a phone's tab bar: a hop under it would be missed.
  const bar = document.querySelector('[data-part="tab-bar"]')?.getBoundingClientRect();
  const under = bar && bar.top > innerHeight / 2 ? Math.round(innerHeight - bar.top) : 0;
  const watching = new IntersectionObserver(
    (entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      watching.disconnect();
      writeSeen(lang, here);
      seenAt = performance.now();
      // A press meanwhile ended it (he's at your place): the handle does nothing then.
      if (handle) go();
    },
    { threshold: 0.75, rootMargin: `0px 0px ${-under}px 0px` },
  );
  watching.observe(line);
}

// The new segment's ink, after he lands: the stop he landed on rings up over INK_RING seconds (a little past its size, and back).
const INK_RING = 0.32;
const INK_END = HOP_LAND - 0.04 + INK_RING;

/**
 * The strip (doors.js pathStrip's drawing, your place at stop `at`) drawn at the old progress, the stop before as your place, and inked
 * forward by the hop's own time: at(t, data) for the act's time t and its data ({ go }); done() puts doors.js's drawing back, exactly.
 * The dotted way between the two stops is a path of its own under the line (the way on from your place stays as doors.js drew it, so
 * none of its dots move), and the line grows over it. The stop he leaves fills by its stroke in its own ink (never a mix with the canvas,
 * which reads as a muddy disk); only the ring he lands on mixes, its thin stroke from the plain stop's grey to the ink.
 */
function inkStrip(svg, at) {
  const circles = svg.querySelectorAll("circle");
  const leave = circles[at - 1], land = circles[at];
  const line = svg.querySelector(".lx-strip-done");
  if (!leave || !land || !line) return { at() {}, done() {} };
  const kept = {
    line: line.getAttribute("d"),
    leave: [leave.getAttribute("class"), leave.getAttribute("r")],
    land: [land.getAttribute("class"), land.getAttribute("r")],
  };
  const x0 = Number(line.getAttribute("d").match(/^M\s*(-?[\d.]+)/)?.[1]);
  const from = Number(leave.getAttribute("cx")), to = Number(land.getAttribute("cx")), y = Number(land.getAttribute("cy"));
  const way = document.createElementNS("http://www.w3.org/2000/svg", "path");
  way.setAttribute("class", "lx-strip-ahead");
  way.setAttribute("d", `M${from} ${y} L${to} ${y}`);
  svg.prepend(way);
  let finished = false, last = null;
  const setLine = (end) => line.setAttribute("d", `M${x0} ${y} L${end} ${y}`);
  // The old progress: the line to the stop he stands on, that stop your place, the next one plain.
  setLine(from);
  leave.setAttribute("class", "lx-strip-here");
  leave.setAttribute("r", "10");
  land.setAttribute("class", "lx-strip-next");
  land.setAttribute("r", "6");
  const done = () => {
    if (finished) return;
    finished = true;
    way.remove();
    line.setAttribute("d", kept.line);
    for (const [node, [cls, r]] of [[leave, kept.leave], [land, kept.land]]) {
      node.removeAttribute("style");
      node.setAttribute("class", cls);
      node.setAttribute("r", r);
    }
  };
  return {
    done,
    at(t, data) {
      if (finished) return;
      const hop = Number.isFinite(data?.go) ? Math.max(0, t - data.go) : 0;
      if (hop >= INK_END) return done();
      if (hop === last) return;
      last = hop;
      // Under him: across at his steady pace, from his take-off to his landing.
      setLine(from + (to - from) * span(hop, HOP_TAKEOFF, HOP_AIR));
      // The stop he leaves fills with ink as he springs off: your place's ring (out to 12, its hole to 8) thickening inward in its own ink
      // until the hole's gone, drawn in to a blot's 7 (its hole closing just past the middle, so none is left).
      const k = smooth(span(hop, HOP_TAKEOFF - 0.02, 0.2)), outer = 12 - 5 * k, hole = 8 - 8.5 * k;
      leave.setAttribute("r", ((outer + hole) / 2).toFixed(3));
      leave.style.strokeWidth = k ? (outer - hole).toFixed(3) : "";
      // The stop he lands on rings up as he lands: your place's ring, a little past its size and back.
      const j = span(hop, HOP_LAND - 0.04, INK_RING), e = smooth(j);
      land.setAttribute("r", (6 + 4 * outBack(j, 1.4)).toFixed(3));
      land.style.stroke = j ? `color-mix(in oklab, var(--art-violet) ${(e * 100).toFixed(2)}%, var(--line-strong))` : "";
      land.style.strokeWidth = j ? (2 + 2 * e).toFixed(3) : "";
    },
  };
}
