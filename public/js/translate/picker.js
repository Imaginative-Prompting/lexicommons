// Translate's language picker: a wheel in a popover, the shape of iOS's own time picker. iOS gives that wheel only to date and time inputs (a select opens a plain
// menu, with no flags), so this is ours: a real scroller, so a finger gets the phone's own momentum and snap and two fingers on a trackpad just scroll it, with the
// wheel's look drawn from where each row is. Also: click-drag with a mouse or a trackpad's press, a click on a row, arrow keys, Page keys, Home, End, typing a name,
// Enter, Escape. The field keeps its focus, so a keyboard that's up stays up and nothing behind it moves. A press outside takes what's in the band, as iOS's does.

import { el } from "../lx/ui.js";
import * as ui from "../lx/ui.js";
import { icon } from "../lx/icons.js";
import * as motion from "../lx/motion.js";

const ROW = 36;
const STEP = (20 * Math.PI) / 180; // how far round the wheel one row is
const RADIUS = ROW / STEP;
const keepFocus = (node) => (node.addEventListener("mousedown", (event) => event.preventDefault()), node);
const noFlag = () => el("i", { class: "lx-pick-noflag" });
/** A row's flag, there before it's turned to, so a flick shows no blanks; one that can't load (offline, never fetched) leaves a blank of its size, not a broken picture. */
const flagFor = (code) => {
  const flag = ui.languageFlag(code);
  if (!flag) return noFlag();
  flag.loading = "eager";
  flag.addEventListener("error", () => flag.replaceWith(noFlag()), { once: true });
  return flag;
};

/**
 * items: [{ code, name, offline }] in the wheel's order. current: the code it opens on. onDone(code): called with what's in the band when it closes by the check or
 * a press outside; not on Escape. Returns the layer, which is on the page already: node.lxSetItems(items) updates what's known about them (their order stays).
 */
export function languagePicker({ items, current, onDone, anchor = null, label = "Choose a language", inline = null }) {
  let at = Math.max(0, items.findIndex((item) => item.code === current));
  const started = at;
  let goal = null; // where it's turning to: until it gets there, that's what's chosen, whatever passes through the band
  const rows = items.map((item, i) =>
    el("div", { class: "lx-pick-row", role: "option", id: `lx-pick-${item.code}`, "data-i": i, "data-code": item.code, "aria-selected": "false", "data-off": item.offline === false ? "" : undefined }, flagFor(item.code), el("span", {}, item.name)),
  );
  const wheel = el("div", { class: "lx-pick-wheel", role: "listbox", tabindex: "0", "aria-label": label }, rows);
  const band = el("div", { class: "lx-pick-band", "aria-hidden": "true" });
  const note = el("p", { class: "lx-pick-note", role: "status" });
  const reset = keepFocus(el("button", { class: "lx-pick-reset", type: "button", onclick: () => go(started) }, "Reset"));
  const done = keepFocus(el("button", { class: "lx-pick-done", type: "button", "aria-label": "Done", title: "Done", onclick: () => close(true) }, icon("check")));
  const card = el("div", { part: "language-picker", role: "dialog", "aria-modal": "true", "aria-label": label }, band, wheel, note, el("div", { class: "lx-pick-foot" }, reset, done));
  const scrim = keepFocus(el("div", { class: "lx-pick-scrim", onclick: () => close(true) }));
  // inline: in a place of its own on the page, with nothing behind it (the design page).
  const layer = inline ? el("div", { class: "lx-pick-inline" }, card) : el("div", { class: "lx-pick-layer" }, scrim, card);
  (inline ?? document.querySelector('[data-part="app"]')).append(layer);
  // By what opened it: above a flag at the foot, under a language up the screen. Always wholly on what's showing of the screen, keys or no keys.
  const placeCard = () => {
    const height = card.offsetHeight;
    const seen = globalThis.visualViewport?.height ?? innerHeight;
    let wanted = !anchor ? (seen - height) / 2 : anchor.top > seen / 2 ? anchor.top - height - 12 : anchor.bottom + 10;
    // Never a sliver of the language's label showing past the card's top edge: over it whole, or not at all.
    const label = document.querySelector(".lx-tr-lang-to")?.getBoundingClientRect();
    if (label?.height && wanted > label.top - 12 && wanted < label.bottom) wanted = label.top - 12; // past the card's rounded corner too
    card.style.top = `${Math.round(Math.max(8, Math.min(seen - height - 8, wanted)))}px`;
  };
  if (!inline) placeCard();

  const center = () => wheel.scrollTop + wheel.clientHeight / 2;
  const offsetOf = (i) => rows[i].offsetTop + ROW / 2 - wheel.clientHeight / 2;
  let frame = 0;
  // The wheel's look, from where each row is: rows lean back and close up toward its edges.
  const draw = () => {
    frame = 0;
    const c = center();
    let nearest = 0, best = Infinity;
    rows.forEach((row, i) => {
      const d = (row.offsetTop + ROW / 2 - c) / ROW;
      if (Math.abs(d) < best) (best = Math.abs(d)), (nearest = i);
      if (Math.abs(d) > 4.4) {
        if (row.dataset.far !== "1") (row.style.opacity = "0"), (row.dataset.far = "1");
        return;
      }
      row.dataset.far = "";
      const angle = Math.max(-1.45, Math.min(1.45, d * STEP));
      const y = RADIUS * Math.sin(angle) - d * ROW;
      const near = Math.max(0, 1 - Math.abs(d));
      // Quiet by its ink, never by opacity (the design bible); a flag isn't text, and fades with it.
      const quiet = Math.max(0, Math.cos(angle) ** 1.6 * (0.62 + 0.38 * near));
      row.style.opacity = "1";
      row.style.color = `color-mix(in srgb, var(--ink-1) ${Math.round(quiet * 100)}%, transparent)`;
      row.style.setProperty("--pick-flag", String(quiet));
      row.style.transform = `translateY(${y.toFixed(2)}px) scale(${(1 + 0.08 * near).toFixed(3)}, ${(Math.cos(angle) * (1 + 0.08 * near)).toFixed(3)})`;
    });
    if (goal !== null) {
      // There, or near enough that the snap finishes it.
      if (Math.abs(wheel.scrollTop - offsetOf(goal)) < 1) goal = null;
    } else if (nearest !== at) {
      at = nearest;
      mark();
    }
    if (goal !== null) soon();
  };
  const mark = () => {
    rows.forEach((row, i) => row.setAttribute("aria-selected", String(i === at)));
    wheel.setAttribute("aria-activedescendant", rows[at].id);
    note.textContent = rows[at].hasAttribute("data-off") ? "Needs a connection" : (items[at]?.note ?? "");
  };
  const soon = () => (frame ||= requestAnimationFrame(draw));
  wheel.addEventListener("scroll", soon, { passive: true });
  function go(i, { smooth = true } = {}) {
    const to = Math.max(0, Math.min(rows.length - 1, i));
    wheel.scrollTo({ top: offsetOf(to), behavior: smooth && motion.motionOn() ? "smooth" : "auto" });
    at = to;
    goal = to;
    mark();
    soon();
  }
  // A finger or a trackpad takes over from whatever it was turning to.
  for (const kind of ["wheel", "touchstart"]) wheel.addEventListener(kind, () => (goal = null), { passive: true });

  // A press on a row turns it to the band. A mouse, or a trackpad's press, can also drag the wheel; a finger scrolls it natively.
  let drag = null;
  wheel.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") return;
    goal = null;
    drag = { y: event.clientY, top: wheel.scrollTop, moved: false, id: event.pointerId };
  });
  wheel.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      wheel.setPointerCapture(event.pointerId);
      wheel.style.scrollSnapType = "none";
    }
    wheel.scrollTop = drag.top - dy;
  });
  const endDrag = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (!moved) return;
    wheel.style.scrollSnapType = "";
    go(at);
    wheel.lxDragged = true;
    setTimeout(() => (wheel.lxDragged = false), 0);
  };
  wheel.addEventListener("pointerup", endDrag);
  wheel.addEventListener("pointercancel", endDrag);
  wheel.addEventListener("mousedown", (event) => event.preventDefault());
  wheel.addEventListener("click", (event) => {
    if (wheel.lxDragged) return;
    const row = event.target.closest?.(".lx-pick-row");
    if (row) go(Number(row.dataset.i));
  });

  // Keys, wherever the focus is: a field behind it keeps its own, and takes none of these.
  let typed = "";
  let typedAt = 0;
  const onKey = (event) => {
    const key = event.key;
    const moves = { ArrowDown: at + 1, ArrowUp: at - 1, PageDown: at + 5, PageUp: at - 5, Home: 0, End: rows.length - 1 };
    if (Object.hasOwn(moves, key)) go(moves[key]);
    else if (key === "Enter") close(true);
    else if (key === "Escape") close(false);
    else if (key.length === 1 && !event.metaKey && !event.ctrlKey) {
      const now = performance.now();
      typed = now - typedAt > 800 ? key : typed + key;
      typedAt = now;
      const found = items.findIndex((item) => item.name.toLowerCase().startsWith(typed.toLowerCase()));
      if (found >= 0) go(found);
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };
  if (!inline) document.addEventListener("keydown", onKey, true);

  let closed = false;
  function close(take) {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    cancelAnimationFrame(frame);
    // Nothing waits for its going: what it was for changes now, and a picture of it fades.
    motion.leave(card, { dx: 0, dy: 0, duration: motion.duration("--dur-150", 150) });
    layer.remove();
    if (take) onDone?.(items[at].code);
  }

  layer.lxSetItems = (next) => {
    const known = new Map(next.map((item) => [item.code, item]));
    rows.forEach((row) => row.toggleAttribute("data-off", known.get(row.dataset.code)?.offline === false));
    mark();
  };
  layer.lxClose = close;

  wheel.style.scrollSnapType = "none";
  wheel.scrollTop = offsetOf(at);
  mark();
  draw();
  // (Snap only after it's placed, or the browser picks the row it's nearest to from the top.)
  requestAnimationFrame(() => (wheel.style.scrollSnapType = ""));
  motion.appear(card, { rise: 0, blur: 6, duration: motion.duration("--dur-200", 200) });
  if (!inline && !document.documentElement.hasAttribute("data-keyboard")) wheel.focus({ preventScroll: true });
  return layer;
}

/**
 * A language as one row (part list-row, its flag and name at its end) that opens the wheel on a press: for a form that needs a language (Paste a text, a
 * request to your AI) without a list of every language on the page. codes: the wheel's order (the likely ones first, then the rest by name: wheelOrder).
 * onchange(code) when another is taken. Returns the row's item (li): node.lxSet(code) shows another without asking, node.lxClose() puts a wheel that's up away.
 */
export function languageRow({ title, codes, current, nameOf, onchange }) {
  let code = current;
  const shown = el("span", { class: "lx-lang-value" });
  const show = () => {
    const flag = ui.languageFlag(code);
    shown.replaceChildren(...(flag ? [flag] : []), nameOf(code));
  };
  show();
  let wheel = null;
  const item = ui.listRow({
    title,
    value: shown,
    onclick: () => {
      if (wheel?.isConnected) return;
      wheel = languagePicker({
        items: codes.map((one) => ({ code: one, name: nameOf(one), offline: true })),
        current: code,
        label: title,
        anchor: item.getBoundingClientRect(),
        onDone: (next) => {
          if (next === code) return;
          code = next;
          show();
          onchange?.(next);
        },
      });
    },
  });
  item.lxSet = (next) => {
    code = next;
    show();
  };
  item.lxClose = () => wheel?.lxClose?.(false);
  return item;
}

/** A wheel's order: these first (those known, once each), then every other code by name. */
export function wheelOrder(first, all, nameOf) {
  const lead = [...new Set(first)].filter((code) => all.includes(code));
  return [...lead, ...all.filter((code) => !lead.includes(code)).sort((a, b) => nameOf(a).localeCompare(nameOf(b)))];
}
