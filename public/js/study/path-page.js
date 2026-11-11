// Where you are: the whole path on one quiet, dark page. No line: every lesson is a large solid icon of its theme that is itself the button, left and right
// wandering slowly from side to side, its title beside it with its words and its idea under it; each unit opens with its number and name and ends in a
// grander stop. What you've finished is in its unit's color, what's ahead is gray, and your place bobs gently with Tinta standing on it. What's finished
// lights up, one after another, as it comes into view. A tap on a lesson opens a bubble out of it, right there: what it teaches, and Start (asking first about lessons
// you'd be skipping). Nothing that moves can block a press.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import * as motion from "../lx/motion.js";
import { icon } from "../lx/icons.js";
import { lessonsSkippedBy, markLessonsDone, pathOverview } from "./plan.js";
import { pathLessons } from "./path.js";
import { lessonsComing, onLessonsComing } from "./packs.js";
import { setPlace } from "./path-place.js";
import { learning } from "./learning.js";
import { contentLanguage, onContentChange } from "./content.js";
import { articled, meaningOfThing } from "./lesson.js";
import { pathLayout, stopSize } from "./path-layout.js";
import { symbol, SYMBOL_NAMES } from "../lx/symbols.js";
import { stopArt, STOP_THEMES } from "../lx/stop-art.js";
import { starterNote } from "./starter-note.js";
import { play } from "../lx/sound.js";
import { standOn } from "../character/stand.js";

const DOING = { strong: "Strong", learning: "Coming along", slipping: "Ready to practice" };
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

// ---------- a stop's face: a slot whose look can be swapped ----------

// A lesson's icon is the button: its theme's symbol as a solid object (lx/stop-art.js), its face and the near half of its walls pressing down and right onto
// the far half. Its colors are the art tokens --art-stop-face, -wall, -wall-dark and -mark, set per state in path-page.css (the unit's hue when it's done,
// grays ahead). A theme with no solid drawing yet shows its flat symbol. An idea lesson (no new words, one idea) has its own.
const STAND_IN = { stories: "reading-q", time: "clock-q", places: "globe-q", travel: "path-q", work: "cards-q", things: "data-q" };
const symbolOf = (lesson) => {
  const theme = lesson.kind === "idea" ? "idea" : lesson.theme;
  return SYMBOL_NAMES.includes(`theme-${theme}`) ? `theme-${theme}` : STAND_IN[theme] ?? "learn-q";
};
function stopFace(lesson, size) {
  const face = el("span", { class: "lx-ps-face", "aria-hidden": "true" });
  const theme = lesson.kind === "idea" ? "idea" : lesson.theme;
  if (STOP_THEMES.includes(theme)) {
    face.dataset.art = "solid";
    face.append(stopArt(theme, { size }));
  } else face.append(symbol(symbolOf(lesson), { size }));
  return face;
}
// The unit's grand stop is its own object: a gold medal with the crown on its face (stopArt "unit"), larger than any lesson, pressing as they do.
function pieceFace(size) {
  const face = el("span", { class: "lx-full-face", "aria-hidden": "true", "data-art": "solid" });
  face.append(stopArt("unit", { size }));
  return face;
}

// ---------- how tall a stop's words are, measured in their own faces ----------

const measure = document.createElement("canvas").getContext("2d");
const FONT = { title: '600 17px "Instrument Sans"', here: '700 21px "Onest"', hereNarrow: '700 18px "Onest"', sub: '400 15px "Instrument Sans"', idea: 'italic 400 14px "Instrument Sans"' };
const LINE = { title: 22, here: 26, hereNarrow: 23, sub: 20, idea: 19 };
// On the narrowest phones your place's title is a size smaller, so it and Start fit beside the bend (path-page.css says the same).
let narrow = false;
function linesOf(text, font, width) {
  measure.font = font;
  const space = measure.measureText(" ").width;
  let lines = 1, run = 0;
  for (const word of String(text).split(/\s+/)) {
    const w = measure.measureText(word).width;
    if (run && run + space + w > width) {
      lines += 1;
      run = w;
    } else run += (run ? space : 0) + w;
  }
  return lines;
}
/** A finished lesson's words that fit on one line beside it: never a word left alone on a second line. */
function wordsThatFit(words, width) {
  measure.font = FONT.sub;
  const out = [];
  let run = 0;
  for (const word of (words ?? []).slice(0, 5)) {
    const w = measure.measureText(word).width + (out.length ? measure.measureText(" · ").width : 0);
    if (run + w > width && out.length) break;
    if (run + w > width) return [];
    out.push(word);
    run += w;
  }
  return out;
}
const START_H = 60;
/** A finished lesson's idea, in italics under its words ("Questions: verb first"). */
const ideaOf = (lesson) => lesson.concept?.name ?? null;
/** Its idea under its title: a finished lesson's, and a lesson of one idea's in every state (it has no words; its idea is what it teaches). */
const ideaShown = (lesson) => (lesson.state === "done" || lesson.kind === "idea" ? ideaOf(lesson) : null);
function labelSize(lesson, width) {
  if (lesson.state === "here") return { h: linesOf(lesson.title, narrow ? FONT.hereNarrow : FONT.here, width) * (narrow ? LINE.hereNarrow : LINE.here) + 12 + START_H };
  const title = linesOf(lesson.title, FONT.title, width) * LINE.title;
  const idea = ideaShown(lesson) ? 2 + linesOf(ideaShown(lesson), FONT.idea, width) * LINE.idea : 0;
  if (lesson.state === "done") return { h: title + (wordsThatFit(lesson.words, width).length ? 2 + LINE.sub : 0) + idea };
  if (lesson.state === "skipped") return { h: title + idea + 2 + LINE.sub };
  return { h: title + idea };
}

// ---------- the page ----------

/**
 * options: moreLessons, the address past the last lesson; open, a lesson's id to open the bubble on (#study/path/<id>). Returns { title, ready, place, leave, redraw, dispose }: ready once it's drawn and at
 * your place, so the shell can show it whole; place puts it there again right before its first frame.
 */
// Where the path was when a lesson was started from it: the session's end comes back here by moving forward, so the shell builds the path again, and it
// opens where it was left rather than at your place. Kept only for that trip (the session, then back); going anywhere else forgets it.
let startedAt = null;
addEventListener("hashchange", () => {
  if (!/^#study\/(session|path)(\/|\?|$)/.test(location.hash)) startedAt = null;
});

export function pathPageTake(page, { upTo = 40, moreLessons, open = null } = {}) {
  let shown = upTo;
  // Coming back from a lesson started here: where it was left. (Once: the next open is a fresh one again.)
  const cameBack = open ? null : startedAt;
  startedAt = null;
  let stopScroll = null;
  let closeBubble = () => {};
  // Where it opens (the shell's view.place, right before its first frame): your place, or where it was left; set by its first draw.
  let placeFirst = () => {};
  let scroller = page;
  let isReady;
  const ready = new Promise((done) => (isReady = done));
  const writers = [];
  // Your place's bob, and Tinta's on it, on the document's clock from the start: together, and in step with a picture of the page.
  motion.loopsOnClock(page);

  const startLesson = (lesson) => {
    startedAt = scroller.scrollTop;
    location.hash = `#study/session/lesson/${encodeURIComponent(lesson.id)}?from=path`;
  };
  // keep: drawn again over itself (its faces came, Show more), it stays where it's scrolled; only the first draw goes to your place.
  let hadLessons = false;
  const draw = ({ openId = null, keep = false } = {}) => {
    scroller = page.closest('[data-part="page"]') ?? page;
    const kept = scroller.scrollTop;
    // (Drawn before this language's packs had come, it had nothing: now they're here, it's a first draw, at your place.)
    if (keep && !hadLessons) keep = false;
    stopScroll?.();
    closeBubble();
    for (const writer of writers.splice(0)) writer.stop();
    // While this language's lessons are on their way (a newcomer's first minutes: packs.js lessonsComing), none yet, as before its packs come: never
    // the starter's worked-out ones, whose stops would open a lesson the path's own then replace.
    const coming = lessonsComing();
    const { lessons, at, more } = coming ? { lessons: [], at: 0, more: false } : pathOverview(shown);
    hadLessons = lessons.length > 0;
    const width = Math.min(scroller.clientWidth || innerWidth, 560);
    const gap = lessons.find((lesson) => lesson.state === "skipped" && !lesson.full) ?? null;
    const here = lessons[at] ?? null;
    const S = stopSize(width);
    narrow = width < 360;

    // A unit's header, measured as it will be drawn.
    const headers = new Map();
    const headerOf = (group) => {
      if (headers.has(group.id)) return headers.get(group.id);
      const note = starterNote({ id: group.id, title: group.title });
      const head = el(
        "header",
        { class: "lx-pu-head" },
        el("span", { class: "lx-pu-kicker" }, `Unit ${(headers.size + 1).toLocaleString()}`),
        el("h2", { class: "lx-pu-title", "aria-label": group.title }, group.title),
      );
      headers.set(group.id, { head, note });
      return headers.get(group.id);
    };
    const probe = el("div", { class: "lx-path-probe" });
    probe.style.width = `${width}px`;
    page.append(probe);
    const heights = new Map();
    // Its name, and under it the starter's line when it has one: each measured at the width it'll have.
    const headerHeight = (group) => {
      if (heights.has(group.id)) return heights.get(group.id).total;
      const { head, note } = headerOf(group);
      probe.replaceChildren(head);
      const h = head.offsetHeight;
      let noteH = 0;
      if (note) {
        probe.replaceChildren(note);
        noteH = note.offsetHeight;
      }
      const total = h + (note ? 10 + noteH : 0);
      heights.set(group.id, { head: h, total });
      return total;
    };
    const layout = pathLayout(lessons, width, { labelSize, headerHeight });
    probe.remove();

    const stopsById = new Map();
    const sections = layout.units.map((unit) => {
      const { head, note } = headers.get(unit.id) ?? headerOf(unit);
      head.style.top = `${unit.headerTop - unit.top}px`;
      // Its own ground, blending in from the unit before it over a band at its top: painted once, nothing written as you scroll.
      const inner = el("section", { class: "lx-pu", "data-hue": String((unit.n - 1) % 3), "data-from": String(((unit.n > 1 ? unit.n - 1 : unit.n) - 1) % 3) }, head);
      inner.style.top = `${unit.top}px`;
      inner.style.height = `${unit.bottom - unit.top}px`;
      if (note) {
        note.style.top = `${unit.headerTop - unit.top + heights.get(unit.id).head + 10}px`;
        inner.append(note);
      }
      const nodes = unit.stops.map((stop) => stopNode(unit, stop, S, { onOpen: (node) => pressOpen(node), onStart: (lesson) => startLesson(lesson) }));
      for (const node of nodes) {
        inner.append(...node.parts);
        stopsById.set(node.lesson.id, node);
      }
      if (unit.piece) {
        const node = pieceNode(unit, { onOpen: (n) => pressOpen(n), onStart: (lesson) => startLesson(lesson) });
        inner.append(...node.parts);
        stopsById.set(node.lesson.id, node);
      }
      return { unit, inner, nodes };
    });

    // The back pill to your place, and the page's foot.
    const placeY = here ? ([...stopsById.values()].find((node) => node.lesson === here)?.y ?? 0) : layout.height;
    const backButton = here ? el("button", { class: "lx-path-back", type: "button", hidden: true }, "Back to your place") : null;
    const placeTop = () => Math.max(0, placeY - scroller.clientHeight * 0.42);
    backButton?.addEventListener("click", () => scroller.scrollTo({ top: placeTop(), behavior: motion.motionOn() ? "smooth" : "auto" }));
    const foot = coming
      ? null
      : more
      ? el("button", { class: "lx-path-more", type: "button", onclick: () => ((shown += upTo), draw({ keep: true })) }, "Show more")
      : el("ul", { part: "list", class: "lx-path-foot" }, ui.listRow({ icon: "chat", title: "Want more lessons?", sub: "Ask for them, or share what you've made", href: `${moreLessons}?from=path` }));
    const backToGap = !here && gap ? el("button", { class: "lx-path-more", type: "button", onclick: () => openOn(gap.id) }, "Go back to what you skipped") : null;
    const path = el("div", { class: "lx-path" }, sections.map((s) => s.inner));
    path.style.height = `${layout.height}px`;
    path.style.setProperty("--s", `${S}px`);
    const lastHue = String(((layout.units.at(-1)?.n ?? 1) - 1) % 3);
    const wrap = el("div", { class: "lx-path-page", "data-first": "0" }, path, el("div", { class: "lx-path-foot-ground", "data-hue": lastHue }, backToGap, foot), backButton);
    page.replaceChildren(wrap);
    // Tinta stands on your place's drawing, its feet on the drawing's own top edge (a cup's rim, not its box): once it's in view and laid out.
    for (const node of stopsById.values()) {
      if (!node.tinta) continue;
      const seen = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        seen.disconnect();
        requestAnimationFrame(() => {
          const by = standOn(node.tinta, node.face);
          node.head = Math.min(node.y - node.r, node.tintaTop + by);
        });
      });
      seen.observe(node.tinta);
    }

    // ---------- the bubble ----------

    let bubble = null;
    // Where the page was scrolled once the bubble had come up (and any scroll that brought it on screen had ended): your own scroll
    // past this closes it.
    let bubbleAt = null;
    closeBubble = ({ animate = true } = {}) => {
      if (!bubble) return;
      const going = bubble;
      bubble = null;
      bubbleAt = null;
      going.lxFrom?.setAttribute("aria-expanded", "false");
      if (animate) motion.leave(going, { dx: 0, dy: -6, duration: motion.duration("--dur-150", 150) });
      going.remove();
    };
    const begin = (lesson, body) => {
      const go = () => startLesson(lesson);
      const skipped = lesson.full ? [] : lessonsSkippedBy(lesson.id);
      if (!skipped.length) return go();
      // Jumping ahead: what about the lessons in between? Asked right here, in the bubble.
      const leave = (mark) => {
        if (mark) markLessonsDone(skipped);
        setPlace(learning(), lesson.id);
        go();
      };
      body.replaceChildren(
        el("h3", { class: "lx-bubble-title" }, `Mark the ${plural(skipped.length, "lesson")} you skipped as done?`),
        el("p", { class: "lx-bubble-words" }, `Yes, and Practice asks about their words as things you know.`),
        el(
          "div",
          { class: "lx-bubble-actions" },
          ui.button("Yes, mark them done", { variant: "go", size: "lg", block: true, onclick: () => leave(true) }),
          ui.button("No, just this lesson", { variant: "gray", size: "lg", block: true, onclick: () => leave(false) }),
        ),
      );
    };
    // A press on a stop: its sound as its bubble opens (not as it closes, and not when the page opens one by itself).
    function pressOpen(node) {
      if (bubble?.lxFrom !== node.button) play("path-press");
      openBubble(node);
    }
    function openBubble(node) {
      const same = bubble?.lxFrom === node.button;
      closeBubble({ animate: same });
      if (same) return;
      const { lesson } = node;
      const words = lesson.words?.length ? lesson.words.slice(0, 6).join(" · ") : null;
      const body = el("div", { class: "lx-bubble-body" });
      const primary = lesson.state === "done" ? "Do it again" : "Start";
      body.append(
        el("p", { class: "lx-bubble-kicker" }, node.kicker),
        el("h3", { class: "lx-bubble-title" }, lesson.full ? "The whole unit" : lesson.title),
        words ? el("p", { class: "lx-bubble-words", lang: contentLanguage() }, words) : el("p", { class: "lx-bubble-words" }, lesson.full ? "Everything this unit taught, together." : (lesson.teaches?.line ?? "")),
        ...(lesson.state === "done" && lesson.doing ? [el("p", { class: "lx-bubble-state" }, DOING[lesson.doing])] : lesson.state === "skipped" ? [el("p", { class: "lx-bubble-state" }, "Skipped")] : []),
        el(
          "div",
          { class: "lx-bubble-actions" },
          ui.button(primary, { variant: "go", size: "lg", block: true, onclick: () => begin(lesson, body) }),
          lesson.full ? null : ui.button("Its words", { variant: "fade", onclick: () => wordsSheet(lesson) }),
        ),
        // At your place, with lessons skipped behind it: the way back to the first of them.
        ...(lesson.state === "here" && gap
          ? [
              el(
                "button",
                { class: "lx-here-skip", type: "button", onclick: () => openOn(gap.id) },
                el("span", { class: "lx-here-skip-words" }, el("span", {}, "Go back to what you skipped"), el("span", { class: "lx-here-skip-sub" }, gap.title)),
                icon("chevron"),
              ),
            ]
          : []),
      );
      // As wide as the words are (edge to edge), so nothing under it shows past its sides.
      const w = Math.min(width - 32, 420);
      const left = clamp(node.x - w / 2, 16, width - 16 - w);
      bubble = el("div", { class: "lx-path-bubble", role: "dialog", "aria-label": lesson.title }, el("span", { class: "lx-bubble-arrow", "aria-hidden": "true" }), body);
      bubble.style.left = `${left}px`;
      bubble.style.width = `${w}px`;
      bubble.style.setProperty("--arrow", `${node.x - left}px`);
      bubble.lxFrom = node.button;
      node.button.setAttribute("aria-expanded", "true");
      path.append(bubble);
      // Above the lesson, pointing down at it (its hard edge and the arrow's under it); below it only where there's no room above.
      const high = bubble.offsetHeight;
      const above = (node.head ?? node.y - node.r) - 16 - high;
      const side = above >= 8 ? "above" : "below";
      bubble.dataset.side = side;
      bubble.style.top = `${side === "above" ? above : node.y + node.r + 12}px`;
      // It grows out of the stop: a picture of it does, while the real one is already there to press.
      const from = node.button.getBoundingClientRect();
      motion.fly(bubble, new DOMRect(from.left + from.width / 2 - 8, from.top + from.height / 2 - 8, 16, 16), { clip: true, duration: motion.duration("--dur-200", 200) });
      // All of it on the screen, under the header and above the tab bar. Once that scroll is over (or there was none), your own scroll
      // closes it.
      const opened = bubble;
      requestAnimationFrame(() => {
        if (bubble !== opened || !opened.isConnected) return;
        const box = opened.getBoundingClientRect();
        const frame = scroller.getBoundingClientRect();
        const rootStyle = getComputedStyle(document.documentElement);
        const top = frame.top + (parseFloat(rootStyle.getPropertyValue("--header-room")) || 72);
        const bottom = frame.bottom - (parseFloat(rootStyle.getPropertyValue("--bar-room")) || 96);
        const by = box.top < top ? box.top - top - 12 : box.bottom > bottom ? box.bottom - bottom + 12 : 0;
        const settle = () => bubble === opened && (bubbleAt = scroller.scrollTop);
        if (!by) return settle();
        const smooth = motion.motionOn();
        scroller.scrollBy({ top: by, behavior: smooth ? "smooth" : "auto" });
        if (!smooth) return requestAnimationFrame(settle);
        // A smooth scroll's end: scrollend where there is one, else when it's had time.
        let done = false;
        const end = () => {
          if (done) return;
          done = true;
          scroller.removeEventListener("scrollend", end);
          settle();
        };
        scroller.addEventListener("scrollend", end, { once: true });
        setTimeout(end, 700);
      });
    }
    const openOn = (id) => {
      const node = stopsById.get(id);
      if (!node) return;
      scroller.scrollTo({ top: Math.max(0, node.y - scroller.clientHeight * 0.3) });
      openBubble(node);
    };
    // A press anywhere else closes it; so does Escape.
    const outside = (event) => {
      if (!bubble || bubble.contains(event.target) || event.target.closest?.(".lx-ps, .lx-full, .lx-ps-label")) return;
      closeBubble();
    };
    const keys = (event) => event.key === "Escape" && bubble && (event.preventDefault(), closeBubble());
    addEventListener("pointerdown", outside, true);
    addEventListener("keydown", keys);

    // ---------- the paper, and the pen writing what's finished as it comes into view ----------

    // The shell's ground (the fades under the header and the bar) is set once, to the unit you open on, and not again while you're here: a property on
    // :root restyles the whole document, which with thousands of stops took over a second (WebKit), and the units' grounds differ by a faint tint.
    // The path's own ground never changes: each unit paints its own (path-page.css).
    let groundWas = -1;
    const unitAt = (y, vh) => {
      let a = layout.units[0];
      for (const unit of layout.units) if (unit.top <= y + vh * 0.5) a = unit;
      return a;
    };
    const setGround = (unit) => {
      if (!unit || !page.isConnected || unit.n === groundWas) return;
      groundWas = unit.n;
      document.documentElement.style.setProperty("--page-ground", grounds[(unit.n - 1) % 3]);
    };

    const wrapStyle = getComputedStyle(wrap);
    const grounds = [0, 1, 2].map((i) => wrapStyle.getPropertyValue(`--paper-${i}`).trim() || "var(--canvas)");
    // What's finished lights up as it comes into view, one after another in the path's order: its color comes in. Your place and a grand stop just
    // reached have a moment of their own as they light (a pop; the grand stop's ring of gold).
    // (Only on its first draw: drawn again over itself, what was lit stays lit. And only on an open: built again for a way back to it (a back, which
    // finds its history entry marked lit; a lesson's end, which comes back to where it was left), it's as it was left, lit at once.)
    const returning = cameBack != null || history.state?.lxPathLit === true;
    const lighting = motion.motionOn() && !keep && !returning;
    if (!keep && !returning) {
      try {
        history.replaceState({ ...(history.state ?? {}), lxPathLit: true }, "");
      } catch {}
    }
    const lit = [...stopsById.values()].filter((node) => node.lesson.state === "done" || node.lesson.state === "here");
    if (lighting) for (const node of lit) node.button.classList.add("lx-unlit");
    // Seen means seen: not under the floating bar or the header, where its pop would be drawn over them.
    const clearOf = () => {
      const view = scroller.getBoundingClientRect();
      const bar = document.querySelector('[data-part="tab-bar"]')?.getBoundingClientRect();
      const head = document.querySelector('[data-part="app"] > header')?.getBoundingClientRect();
      const below = bar?.height ? Math.max(0, Math.round(view.bottom - bar.top)) : 0;
      const above = head?.height ? Math.max(0, Math.round(head.bottom - view.top)) : 0;
      return { top: view.top + above, bottom: view.bottom - below, above, below };
    };
    const inSight = (art) => {
      const { top, bottom } = clearOf();
      const r = art.getBoundingClientRect();
      return r.top >= top && r.bottom <= bottom;
    };
    // The unit's colors, on the button itself: a pop is drawn on a copy outside the unit, and a drawing inside it keeps its own rules.
    const UNIT_VARS = ["--u", "--u-deep", "--u-lit", "--paper", "--art-stop-face", "--art-stop-wall", "--art-stop-wall-dark", "--art-stop-mark"];
    const light = (node, { quietly = false } = {}) => {
      const art = node.button;
      delete art.dataset.lighting;
      if (!art.classList.contains("lx-unlit")) return;
      const parts = [art, art.querySelector(".lx-ps-face")].filter(Boolean);
      if (quietly) for (const one of parts) one.style.transition = "none";
      art.classList.remove("lx-unlit");
      // (Its bob starts now: on the clock, with Tinta's.)
      if (node.lesson.state === "here" || art.matches(".lx-full")) requestAnimationFrame(() => motion.loopsOnClock(art));
      if (quietly) {
        for (const one of parts) void getComputedStyle(one).opacity;
        requestAnimationFrame(() => { for (const one of parts) one.style.transition = ""; });
        return;
      }
      if (node.lesson.state === "here" || art.matches(".lx-full")) {
        // (Its colors at once: the pop is a copy of it as it is now, and keeps them.)
        art.style.transition = "none";
        const style = getComputedStyle(art);
        requestAnimationFrame(() => (art.style.transition = ""));
        for (const name of UNIT_VARS) art.style.setProperty(name, style.getPropertyValue(name));
        if (inSight(art)) motion.pop(art);
      }
      if (node.burst) {
        node.burst.classList.remove("lx-bursting");
        void node.burst.offsetWidth;
        node.burst.classList.add("lx-bursting");
      }
    };
    const STAGGER = 110;
    let queue = [];
    let ticking = null;
    let frameId = 0;
    const stopTicking = () => {
      cancelAnimationFrame(frameId);
      ticking?.end();
      ticking = null;
    };
    const finishAll = () => {
      for (const node of queue.splice(0)) light(node, { quietly: true });
      stopTicking();
    };
    const run = () => {
      if (ticking || !queue.length) return;
      // A press finishes everything waiting.
      ticking = motion.registerTicker(() => finishAll());
      if (!ticking) return finishAll();
      let last = -Infinity;
      const step = (now) => {
        if (now - last >= STAGGER && queue.length) {
          last = now;
          queue.sort((a, b) => a.order - b.order);
          light(queue.shift());
        }
        if (queue.length) frameId = requestAnimationFrame(step);
        else stopTicking();
      };
      frameId = requestAnimationFrame(step);
    };
    lit.forEach((node, order) => (node.order = order));
    const seen = lighting
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const node = lit.find((one) => one.button === entry.target);
              // (Marked while it waits its turn: what a press would light at once.)
              if (node && node.button.classList.contains("lx-unlit") && !queue.includes(node)) {
                node.button.dataset.lighting = "";
                queue.push(node);
              }
              seen.unobserve(entry.target);
            }
            run();
          },
          { root: scroller, threshold: 0.6, rootMargin: (({ above, below }) => `-${above}px 0px -${below}px 0px`)(clearOf()) },
        )
      : null;
    // Only once the page is on the screen. The shell holds a page unseen until it's drawn, then slides a picture of it in, and an observer
    // reports a stop in view all the same: lit then, your place's pop would hide the real stop under its copy (motion.js) as the page appears,
    // the stop first seen a moment later and its copy drawn over the page before it; and the page would differ from its picture.
    const stopWaiting = seen ? whenOnScreen(page, () => { for (const node of lit) seen.observe(node.button); }) : () => {};
    writers.push({ stop: () => { stopWaiting(); seen?.disconnect(); finishAll(); } });

    // The floating header's ground is the path's own under it: the unit there, blended from the one before over its band (path-page.css .lx-pu),
    // so it never shows as a band of another unit's tint. Written on the header alone (a property on :root restyles the whole path), on change.
    const header = document.querySelector('[data-part="app"] > [data-part="app-header"]');
    const BAND = 420;
    let headerWas = "";
    const headerGround = () => {
      if (!header || !layout.units.length || !path.isConnected) return;
      // Where the header's middle is on the path (read each time: the page may still have been on its way in at the first draw).
      const box = header.getBoundingClientRect();
      const at = box.top + box.height / 2 - path.getBoundingClientRect().top;
      let unit = layout.units[0];
      for (const one of layout.units) if (one.top <= at) unit = one;
      const to = (unit.n - 1) % 3;
      const from = ((unit.n > 1 ? unit.n - 1 : unit.n) - 1) % 3;
      const t = Math.round(Math.min(1, Math.max(0, (at - unit.top) / BAND)) * 20) * 5;
      const value = t >= 100 || from === to ? grounds[to] : `color-mix(in oklab, ${grounds[to]} ${t}%, ${grounds[from]})`;
      if (value === headerWas) return;
      headerWas = value;
      header.style.setProperty("--header-ground", value);
    };
    const frame = () => {
      const y = scroller.scrollTop;
      const vh = scroller.clientHeight;
      headerGround();
      // (Written only when it changes.)
      const away = Boolean(here) && Math.abs(y + vh * 0.42 - placeY) >= vh * 0.62;
      if (backButton && backButton.hidden === away) backButton.hidden = !away;
    };
    let pending = false;
    const onScroll = () => {
      // Your own scroll closes the lesson's bubble: one a finger, a wheel or a key makes (and its glide after). Any other (the app bringing
      // it on screen, the shell putting a page back where it was, an automation bringing a button into view) moves where it's measured from.
      if (bubble && bubbleAt !== null) {
        if (performance.now() < yoursUntil) {
          yoursUntil = performance.now() + 400; // still gliding from your own
          if (Math.abs(scroller.scrollTop - bubbleAt) > 12) closeBubble();
        } else bubbleAt = scroller.scrollTop;
      }
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (page.isConnected) frame();
      });
    };
    // When a scroll is yours: from a finger on the page, a wheel or a scroll key, for as long as what it set going goes on.
    let yoursUntil = 0;
    const yours = () => (yoursUntil = performance.now() + 400);
    const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);
    const yourKey = (event) => SCROLL_KEYS.has(event.key) && yours();
    scroller.addEventListener("touchstart", yours, { passive: true });
    scroller.addEventListener("touchmove", yours, { passive: true });
    scroller.addEventListener("wheel", yours, { passive: true });
    addEventListener("keydown", yourKey);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    stopScroll = () => {
      scroller.removeEventListener("touchstart", yours);
      scroller.removeEventListener("touchmove", yours);
      scroller.removeEventListener("wheel", yours);
      removeEventListener("keydown", yourKey);
      scroller.removeEventListener("scroll", onScroll);
      removeEventListener("pointerdown", outside, true);
      removeEventListener("keydown", keys);
    };
    // At your place from its first frame, then shown. (Coming back to it, the shell puts back where you left it, after this.)
    // Your place's bob, and Tinta's on it, on the clock: together, and in step with a picture of the page.
    requestAnimationFrame(() => page.isConnected && motion.loopsOnClock(page));
    if (keep) {
      scroller.scrollTop = kept;
      frame();
      return;
    }
    const firstTop = () => (cameBack ?? placeTop());
    scroller.scrollTop = firstTop();
    placeFirst = () => {
      if (!openId && page.isConnected) scroller.scrollTop = firstTop();
    };
    frame();
    setGround(unitAt(scroller.scrollTop, scroller.clientHeight));
    requestAnimationFrame(() => {
      if (scroller.scrollTop !== firstTop() && !openId) scroller.scrollTop = firstTop();
      if (openId) openOn(openId);
      isReady();
    });
  };

  // Its words are measured in their faces, so those come first; a page that waits long enough draws with what it has, and again when they've come.
  const faces = Promise.all([
    document.fonts?.load(FONT.title),
    document.fonts?.load(FONT.here),
    document.fonts?.load(FONT.hereNarrow),
    document.fonts?.load(FONT.sub),
    document.fonts?.load('30px "Onest"'),
  ]).catch(() => {});
  let drawn = false;
  const first = () => {
    if (drawn || !page.isConnected) return;
    drawn = true;
    draw({ openId: open });
  };
  // Drawn as soon as the page is in place, never waiting on them (on WebKit fonts.check can say no for faces long loaded, and the page held black for
  // 300 ms); if they weren't all here yet, drawn again over itself when they come, where it's scrolled to.
  const facesHere = Object.values(FONT).every((font) => document.fonts?.check(font) ?? true);
  queueMicrotask(first);
  faces.then(() => !facesHere && drawn && page.isConnected && draw({ keep: true }));
  // Away from the path (another page, or a session over it), the shell's ground is the canvas again.
  const leave = () => {
    document.documentElement.style.removeProperty("--page-ground");
    document.querySelector('[data-part="app"] > [data-part="app-header"]')?.style.removeProperty("--header-ground");
  };
  // Back to it (a session closed over it): drawn again where it's scrolled to; the shell puts back where you left it.
  const redraw = () => drawn && page.isConnected && draw({ keep: true });
  // Its packs arriving (a cold start in a language whose packs came after the page): drawn again.
  // Its lessons given up for now (they didn't come in time: packs.js LESSONS_WAIT): drawn with what's here.
  const stops = [onContentChange(() => redraw()), onLessonsComing(() => redraw())];
  const dispose = () => {
    for (const stop of stops) stop();
    leave();
  };
  return { title: "Where you are", ready, place: () => placeFirst(), leave, redraw, dispose };
}

/**
 * Runs `then` once the page's view is on the screen: the shell's hold on it gone (data-waiting, until it's drawn), and the move bringing it in
 * over (shell/page-slide.js slides a picture of it in while the page itself is hidden, data-motion-hidden), and its fade in (reveal's
 * motion.appear). Returns a stop.
 */
function whenOnScreen(page, then) {
  const host = page.closest(".lx-view");
  const held = () => Boolean(host?.isConnected && (host.hasAttribute("data-waiting") || host.hasAttribute("data-motion-hidden")));
  let stopped = false;
  let watch = null;
  const go = () => {
    watch?.disconnect();
    watch = null;
    Promise.all((host?.getAnimations?.() ?? []).map((animation) => animation.finished.catch(() => {}))).then(() => !stopped && then());
  };
  if (!held()) go();
  else {
    watch = new MutationObserver(() => !held() && go());
    watch.observe(host, { attributes: true, attributeFilter: ["data-waiting", "data-motion-hidden"] });
  }
  return () => {
    stopped = true;
    watch?.disconnect();
  };
}

// ---------- a lesson: its icon, its words, and Tinta at your place ----------

function stopNode(unit, stop, S, { onOpen, onStart }) {
  const { lesson, x, y, side, label } = stop;
  const here = lesson.state === "here";
  const n = stop.k + 1;
  const button = el(
    "button",
    { class: "lx-ps", type: "button", "data-state": lesson.state, "data-side": side, "data-kind": lesson.kind ?? null, "aria-label": `Lesson ${n}: ${lesson.title}`, "aria-expanded": "false" },
    stopFace(lesson, Math.round(S * 0.92)),
  );
  button.style.left = `${x}px`;
  button.style.top = `${y - unit.top}px`;
  // head: the top of what's drawn here (Tinta's, where it stands on it), for the bubble to open above.
  const node = { lesson, button, x, y, r: S / 2 + 7, head: stop.tinta ? Math.min(y - S / 2 - 7, stop.tinta.y) : y - S / 2 - 7, kicker: `Lesson ${n} · ${unit.title}`, parts: [] };
  button.addEventListener("click", () => onOpen(node));
  const idea = ideaShown(lesson);
  const words =
    here
      ? el(
          "div",
          { class: "lx-ps-label lx-here", "data-side": side },
          el("span", { class: "lx-here-title" }, lesson.title),
          ui.button("Start", { variant: "go", size: "lg", block: true, onclick: () => onStart(lesson) }),
        )
      : el(
          "div",
          { class: "lx-ps-label", "data-side": side, "data-state": lesson.state, onclick: () => onOpen(node) },
          el("span", { class: "lx-ps-title" }, lesson.title),
          lesson.state === "done" && wordsThatFit(lesson.words, label.w).length ? el("span", { class: "lx-ps-words", lang: contentLanguage() }, wordsThatFit(lesson.words, label.w).join(" · ")) : null,
          idea ? el("span", { class: "lx-ps-idea" }, idea) : null,
          lesson.state === "skipped" ? el("span", { class: "lx-ps-sub" }, "Skipped") : null,
        );
  words.style.left = `${label.x}px`;
  words.style.top = `${label.y - unit.top}px`;
  words.style.width = `${label.w}px`;
  node.parts.push(words, button);
  if (here && stop.tinta) {
    // Tinta stands on your place, and rides its slow bob with it.
    // It stands on the lesson's drawing: no ground of its own under it.
    const tinta = ui.character({ size: stop.tinta.size, hidden: true, ground: false, pokeable: true });
    tinta.classList.add("lx-ps-tinta", "lx-ps-tinta-here");
    tinta.style.left = `${stop.tinta.x}px`;
    tinta.style.top = `${stop.tinta.y - unit.top}px`;
    node.parts.push(tinta);
    Object.assign(node, { tinta, face: button.querySelector(".lx-ps-face"), tintaTop: stop.tinta.y });
  }
  return node;
}

// ---------- the unit's grand stop ----------

function pieceNode(unit, { onOpen, onStart }) {
  const { lesson, x, y, size, here, tinta: spot } = unit.piece;
  const art = pieceFace(size);
  const button = el("button", { class: "lx-full", type: "button", "data-state": lesson.state, "aria-label": lesson.title, "aria-expanded": "false" }, art);
  button.style.left = `${x - size / 2}px`;
  button.style.top = `${y - unit.top - size / 2}px`;
  button.style.setProperty("--piece", `${size}px`);
  const words = here
    ? el(
        "div",
        { class: "lx-full-words lx-full-here" },
        el("span", { class: "lx-full-kicker" }, "The whole unit"),
        el("span", { class: "lx-ps-sub" }, "Every word of it, together"),
        ui.button("Start", { variant: "go", size: "lg", block: true, onclick: () => onStart(lesson) }),
      )
    : el("div", { class: "lx-full-words", onclick: () => onOpen(node) }, el("span", { class: "lx-full-kicker" }, "The whole unit"), lesson.state === "done" ? el("span", { class: "lx-ps-sub" }, "Done") : null);
  words.style.top = `${y - unit.top + size / 2 + 6}px`;
  // Its moment: as it lights, a ring of gold goes out from it, once.
  const burst = el("span", { class: "lx-full-burst", "aria-hidden": "true" });
  burst.style.left = `${x}px`;
  burst.style.top = `${y - unit.top}px`;
  burst.style.setProperty("--piece", `${size}px`);
  const node = { lesson, button, x, y, r: size / 2, head: spot ? Math.min(y - size / 2, spot.y) : y - size / 2, kicker: unit.title, burst, parts: [burst, button, words] };
  button.addEventListener("click", () => onOpen(node));
  if (here && spot) {
    // It stands on the lesson's drawing: no ground of its own under it.
    const tinta = ui.character({ size: spot.size, hidden: true, ground: false, pokeable: true });
    tinta.classList.add("lx-ps-tinta", "lx-ps-tinta-here");
    tinta.style.left = `${spot.x}px`;
    tinta.style.top = `${spot.y - unit.top}px`;
    node.parts.push(tinta);
    Object.assign(node, { tinta, face: art, tintaTop: spot.y });
  }
  return node;
}

// ---------- a lesson's words, all of them, in a sheet ----------

function wordsSheet(shown) {
  const lesson = pathLessons().find((one) => one.id === shown.id);
  if (!lesson) return;
  const lang = contentLanguage();
  const layer = ui.sheetLayer({ label: `${lesson.title}: its words` });
  const note = starterNote(lesson.unit, lesson);
  layer.lxBody.append(
    el(
      "div",
      { class: "lx-stack lx-lesson-words-sheet" },
      el("h2", { class: "lx-sheet-title" }, lesson.title),
      el(
        "ul",
        { part: "list", class: "lx-lesson-words" },
        lesson.things.map((thing) => ui.listRow({ title: el("span", { lang }, thing.article && !thing.formOnly ? articled(thing.article, thing.text) : thing.text), sub: meaningOfThing(thing) })),
      ),
      ...(lesson.concept ? [el("p", { class: "lx-muted" }, lesson.concept.line)] : []),
      ...(note ? [note] : []),
    ),
  );
  document.body.append(layer);
  layer.lxOpen();
}
