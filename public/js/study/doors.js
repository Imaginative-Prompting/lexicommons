// Study's page: two doors, because Home has already said what to do and here you choose how, and where you are on the path, drawn small.
import { el } from "../lx/ui.js";
import * as ui from "../lx/ui.js";
import { icon } from "../lx/icons.js";
import { symbol } from "../lx/symbols.js";
import { edge } from "../lx/edge.js";
import { hopWhenSeen } from "./strip-hop.js";

/** A way in. door: "practice" or "lesson"; a lesson is a ticket, because a lesson is something you spend (docs/design-bible.md, Off shapes). */
export function studyDoor({ door, art, title, sub, href }) {
  const node = el(
    "a",
    { part: "study-door", "data-door": door, href },
    symbol(art, { size: 88 }),
    el("span", { class: "lx-door-words" }, el("span", { class: "lx-door-title" }, title), el("span", { class: "lx-door-sub" }, sub)),
    icon("chevron"),
  );
  // Practice holds Study's settings in a notch at its corner (study.js puts the gear there).
  if (door === "practice") edge(node, "notch", { drop: 3, r: 20 });
  if (door === "lesson") {
    edge(node, "ticket", {
      drop: 3,
      r: 20,
      fit: () => {
        const mark = node.querySelector("svg[data-symbol]").getBoundingClientRect();
        const halfGap = parseFloat(getComputedStyle(node).columnGap) / 2 || 15;
        const after = getComputedStyle(node).direction === "rtl" ? mark.left - halfGap : mark.right + halfGap;
        return { at: Math.round(after - node.getBoundingClientRect().left) };
      },
    });
  }
  return node;
}

// The strip is drawn to the width it's shown at, so its stops and its line keep a phone's size: 340 for a phone's column, and on a computer
// the page's own (720; 960 from 1280; 1120 from 1600: shell.css's frame). Drawn 340 wide and stretched to 960, every stop stood nearly three
// times its size, with Tinta small inside the ring of your place.
const STRIP_WIDTHS = [["(min-width: 1600px)", 1064], ["(min-width: 1280px)", 912], ["(min-width: 1024px)", 684]];
const stripWidth = () => STRIP_WIDTHS.find(([query]) => globalThis.matchMedia?.(query).matches)?.[1] ?? 340;

/** Where you are, drawn small: a few stops either side of yours, in the path's ink, with Tinta at your place. here: your place among `count` lessons; place: its words. */
export function pathStrip({ here, count, place, href, held = false }) {
  const first = Math.max(0, Math.min(here - 3, count - 7));
  const stops = Array.from({ length: Math.min(7, count - first) }, (_, i) => first + i);
  const W = stripWidth(), y = 22;
  const x = (i) => 10 + (i * (W - 20)) / (stops.length - 1 || 1);
  const at = stops.indexOf(here);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "lx-strip");
  svg.setAttribute("viewBox", `0 0 ${W} 44`);
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    (at > 0 ? `<path class="lx-strip-done" d="M${x(0)} ${y} L${x(at)} ${y}"/>` : "") +
    `<path class="lx-strip-ahead" d="M${x(at)} ${y} L${x(stops.length - 1)} ${y}"/>` +
    stops.map((_, i) => `<circle class="${i < at ? "lx-strip-blot" : i === at ? "lx-strip-here" : "lx-strip-next"}" cx="${x(i)}" cy="${y}" r="${i < at ? 7 : i === at ? 10 : 6}"/>`).join("");
  // Tinta stands on your place's dot: no ground of its own under it.
  const line = el("span", { class: "lx-path-strip-line" }, svg, ui.character({ size: 40, hidden: true, ground: false, pokeable: true }));
  line.style.setProperty("--at", (x(at) / W).toFixed(4));
  // A new place since this device last saw the strip: he hops onto it from the stop before (study/strip-hop.js). Never on a strip held
  // while a newcomer's lessons are coming (held): your place isn't final yet, so nothing is read or kept.
  if (!held) hopWhenSeen(line, { here, at, svg, count });
  return el(
    "a",
    { part: "path-strip", href },
    el("span", { class: "lx-path-strip-title" }, "Where you are"),
    el("span", { class: "lx-path-strip-at" }, place, icon("chevron")),
    line,
  );
}
