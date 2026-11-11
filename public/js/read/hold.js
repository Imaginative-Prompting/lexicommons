// Holding a word: readersound's selection, word by word (its docs/design.md, "Annotation gesture spec"). Native text
// selection is off in the reader (iPhone's Copy / Look Up menu can't be kept out of the way otherwise), so this is
// the reader's own:
// - A tap stays a tap. A hold (310 ms, the finger still: readersound's code; its notes say about 430) selects the
//   word, with a handle at each end.
// - A handle drags the selection's end word by word. The other end stays put: it's the gap between two words, so
//   dragging past it flips which side is selected and the word at the edge belongs to one side only. While it drags,
//   a faint handle shows where it will land.
// - Some words are held together (unit): a sentence shown whole, an idiom's run of words.
// - The toolbar sits above the selection (below, when there's no room) and holds what the reader puts in it: a
//   preview of the selection and its actions.
// - Any tap outside the selection and its toolbar ends it, and does nothing else.
// The handles and toolbar live in the text's own box, so they scroll with it.

import { el } from "../lx/ui.js";
import * as motion from "../lx/motion.js";

const HOLD_MS = 310;
const SLOP = 10;

/**
 * text: the reader's scroller; flow: the words' box; wordEl(i): the element drawn for word i (or null); unit(i): the
 * words [a, b] held together with word i; swallow(): the press that ended a gesture isn't a tap; content(lo, hi):
 * { preview, actions } for the toolbar; onEnd(): the selection ended; allow(): whether a hold may start now (not while
 * the page is zoomed or being pinched).
 * Returns { active, range, select(lo, hi), cancel(), refresh() }.
 */
export function createHold({ text, flow, wordEl, unit = (i) => [i, i], swallow, content, onEnd, allow = () => true }) {
  let lo = -1;
  let hi = -1;
  let painted = [];
  const startHandle = el("div", { part: "reader-handle", variant: "start", "aria-hidden": "true" });
  const endHandle = el("div", { part: "reader-handle", variant: "end", "aria-hidden": "true" });
  const landing = el("div", { part: "reader-handle", state: "landing", "aria-hidden": "true" });
  const bar = el("div", { part: "reader-hold", role: "toolbar", "aria-label": "The selected words" });
  for (const node of [startHandle, endHandle, landing, bar]) node.hidden = true;
  text.append(startHandle, endHandle, landing, bar);

  const active = () => lo >= 0;
  // The word under a point: the element stack is walked, so a handle under the finger doesn't hide the word.
  function wordAt(x, y) {
    for (const node of document.elementsFromPoint(x, y)) {
      const word = node.closest?.("[data-i]");
      if (word && flow.contains(word) && !word.hidden) return Number(word.getAttribute("data-i"));
    }
    return null;
  }
  // The nearest word to a point (over a margin or between paragraphs, a drag never goes numb).
  function nearestWord(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const word of flow.querySelectorAll("[data-i]")) {
      if (word.hidden) continue;
      const r = word.getBoundingClientRect();
      if (!r.height) continue;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const d = dy * 1000 + dx;
      if (d < bestD) {
        bestD = d;
        best = Number(word.getAttribute("data-i"));
      }
    }
    return best;
  }
  // Words a..b, widened to whole units.
  const whole = (a, b) => [Math.min(unit(a)[0], unit(b)[0]), Math.max(unit(a)[1], unit(b)[1])];
  // The first and last words of a range that are drawn (a hidden word has no box to put a handle by).
  function drawnEnds(a, b) {
    let x = a;
    let y = b;
    while (x < y && !wordEl(x)?.getClientRects().length) x++;
    while (y > x && !wordEl(y)?.getClientRects().length) y--;
    return [x, y];
  }
  // A word's first and last line boxes (a sentence shown whole runs over several), in the text's content
  // coordinates, which scroll with it.
  function lineBoxes(node) {
    const t = text.getBoundingClientRect();
    const rects = node.getClientRects();
    const at = (r) => ({ left: r.left - t.left + text.scrollLeft, right: r.right - t.left + text.scrollLeft, top: r.top - t.top + text.scrollTop, bottom: r.bottom - t.top + text.scrollTop, height: r.height });
    return [at(rects[0]), at(rects[rects.length - 1])];
  }
  // A handle at a word's start (its first line's left) or end (its last line's right); in a right-to-left book a line
  // starts at its right, so the two swap sides.
  function placeHandle(handle, node, side) {
    const [first, last] = lineBoxes(node);
    const r = side === "start" ? first : last;
    const rtl = getComputedStyle(text).direction === "rtl";
    Object.assign(handle.style, { left: `${((side === "start") !== rtl ? r.left : r.right) - 22}px`, top: `${r.top - 8}px`, height: `${r.height + 16}px` });
  }

  // The selected words, one run of color: only its two outer ends are rounded (data-selected "start" / "end").
  function paint() {
    for (const node of painted) node.removeAttribute("data-selected");
    painted = [];
    if (!active()) return;
    for (let i = lo; i <= hi; i++) {
      const node = wordEl(i);
      if (node && !node.hidden && !painted.includes(node)) {
        node.setAttribute("data-selected", "");
        painted.push(node);
      }
    }
    if (!painted.length) return;
    painted[0].setAttribute("data-selected", "start");
    const last = painted[painted.length - 1];
    last.setAttribute("data-selected", `${last.getAttribute("data-selected")} end`.trim());
  }

  function placeHandles() {
    const [a, b] = drawnEnds(lo, hi);
    const first = wordEl(a);
    const last = wordEl(b);
    if (!first?.getClientRects().length || !last?.getClientRects().length) return;
    placeHandle(startHandle, first, "start");
    placeHandle(endHandle, last, "end");
    startHandle.hidden = endHandle.hidden = false;
  }

  function placeBar() {
    const { preview, actions } = content(lo, hi);
    bar.replaceChildren(...(preview ? [preview] : []), el("div", { class: "lx-hold-actions" }, actions));
    bar.hidden = false;
    const [a, b] = drawnEnds(lo, hi);
    if (!wordEl(a)?.getClientRects().length || !wordEl(b)?.getClientRects().length) return;
    const [ra] = lineBoxes(wordEl(a));
    const [, rb] = lineBoxes(wordEl(b));
    const width = bar.offsetWidth;
    const height = bar.offsetHeight;
    // Above the first line, or below the last when that would be off the top of what's showing.
    let top = ra.top - height - 14;
    bar.removeAttribute("data-below");
    if (top < text.scrollTop + 8) {
      top = rb.bottom + 18;
      bar.setAttribute("data-below", "");
    }
    bar.style.top = `${top}px`;
    // Centered over the selection, whichever way its lines run.
    const middle = (Math.min(ra.left, rb.left) + Math.max(ra.right, rb.right)) / 2;
    bar.style.left = `${Math.max(8, Math.min(text.clientWidth - width - 8, middle - width / 2))}px`;
  }

  /** Selects words a..b (book indices, widened to whole units) and shows the handles and toolbar. */
  function select(a, b = a) {
    [lo, hi] = whole(a, b);
    paint();
    placeHandles();
    placeBar();
  }

  function cancel() {
    if (!active()) return;
    lo = hi = -1;
    paint();
    startHandle.hidden = endHandle.hidden = landing.hidden = bar.hidden = true;
    onEnd?.();
  }

  // ---------- the hold ----------

  let timer = 0;
  flow.addEventListener("pointerdown", (event) => {
    if (event.button > 0) return;
    const word = event.target.closest("[data-i]");
    if (!word || active() || !allow()) return;
    const x0 = event.clientX;
    const y0 = event.clientY;
    const clear = () => {
      clearTimeout(timer);
      timer = 0;
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", clear);
      removeEventListener("pointercancel", clear);
    };
    const move = (ev) => Math.hypot(ev.clientX - x0, ev.clientY - y0) > SLOP && clear();
    timer = setTimeout(() => {
      clear();
      // A second finger came down (a pinch) while this one was still.
      if (!allow()) return;
      // The press that made the hold isn't a tap when it lifts.
      swallow();
      select(Number(word.getAttribute("data-i")));
      for (const handle of [startHandle, endHandle]) motion.appear(handle, { rise: 0 });
      motion.appear(bar, { rise: 0 });
    }, HOLD_MS);
    addEventListener("pointermove", move, { passive: true });
    addEventListener("pointerup", clear);
    addEventListener("pointercancel", clear);
  });

  // A tap anywhere but the selection's own handles and toolbar ends it, and does nothing else.
  text.addEventListener(
    "pointerdown",
    (event) => {
      if (!active() || event.target.closest('[data-part="reader-handle"], [data-part="reader-hold"]')) return;
      cancel();
      swallow();
    },
    true,
  );

  // ---------- the handles ----------

  for (const handle of [startHandle, endHandle]) {
    handle.addEventListener("pointerdown", (event) => {
      // No pointer capture, and nothing changed on the element the finger holds: iPhone drops the touch otherwise.
      event.preventDefault();
      event.stopPropagation();
      bar.hidden = true;
      // The end that stays is the gap between two words, fixed for the whole drag.
      const gap = handle === startHandle ? hi + 1 : lo;
      const move = (ev) => {
        const t = text.getBoundingClientRect();
        handle.style.left = `${ev.clientX - t.left + text.scrollLeft - 22}px`;
        handle.style.top = `${ev.clientY - t.top + text.scrollTop - 22}px`;
        const at = wordAt(ev.clientX, ev.clientY) ?? nearestWord(ev.clientX, ev.clientY);
        if (at === null) return;
        [lo, hi] = at >= gap ? whole(gap, at) : whole(at, gap - 1);
        paint();
        // Where the drag will land: the moving end's edge, faint.
        const [a, b] = drawnEnds(lo, hi);
        const side = at >= gap ? "end" : "start";
        const node = wordEl(side === "end" ? b : a);
        if (node?.getClientRects().length) {
          landing.setAttribute("data-variant", side);
          placeHandle(landing, node, side);
          landing.hidden = false;
        }
      };
      const up = () => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
        removeEventListener("pointercancel", up);
        landing.hidden = true;
        swallow();
        select(lo, hi);
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", up);
      addEventListener("pointercancel", up);
    });
  }

  return {
    get active() {
      return active();
    },
    get range() {
      return active() ? [lo, hi] : null;
    },
    select,
    cancel,
    /** Redraws the toolbar's contents (after an action changed what it would say). */
    refresh: () => active() && placeBar(),
  };
}
