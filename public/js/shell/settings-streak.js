// Settings → Streak (#settings/streak): your streak as Today shows it, then its year (know/streak-days.js: the months it has run
// through, two across, each day studied, a rest day, paused or plain; never a missed mark) and a day of it, today until you tap
// another: the words and ideas you came to know well that day, the lessons, sessions, minutes read and conversations (the words are worked
// out after the tap, a few questions at a time between frames, so the ring moves at once; the last week's ahead of time as the page opens).
// Then, quietly, how
// it counts (and why it never warns) and pausing it ahead for a trip, an illness or exams (study/done.js pauses: synced to your other
// devices). A pause holds the streak: its days neither count nor break it (know/streak.js). Opened from Today's streak, all of it
// (#settings/streak?from=today, back to Today).

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { addPause, endPause, onDoneChange, pauses, streakNow, thingsOn } from "../study/done.js";
import { addDays, dayKey, MEND_NEEDS, REST_EVERY, REST_MOST } from "../know/streak.js";
import { streakSummary } from "../know/ui.js";
import { wordEntry } from "../know/word-index.js";
import { inBank } from "../read/bank.js";
import { crossings, dayBounds, dayThings, dayUnits, streakMonths, wordsAndIdeas } from "../know/streak-days.js";
import { evidenceSince, gradeOf, onProgressChange } from "../study/progress.js";
import { learning } from "../study/learning.js";
import { CHUNKS, PATTERNS, onContentChange } from "../study/content.js";
import { pathLessons } from "../study/path.js";

const shown = (key) => new Date(`${key}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const span = (p) => (p.from === p.to ? shown(p.from) : `${shown(p.from)} to ${shown(p.to)}`);

// The ways to start one, as Apple's Pause Rings offers them: today, to the end of the week, a week, or your own dates.
function presets(today) {
  const d = new Date(`${today}T12:00:00`);
  const sunday = addDays(today, (7 - d.getDay()) % 7);
  return [
    { label: "Today", from: today, to: today },
    // On a Sunday, "until Monday" is today: Today says it.
    sunday === today ? null : { label: "Until Monday", from: today, to: sunday },
    { label: "For a week", from: today, to: addDays(today, 6) },
  ].filter(Boolean);
}

const WEEKDAY = ["M", "T", "W", "T", "F", "S", "S"];
const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** A month of the streak's year: its name, the weekdays once over its columns, and its days as one control (a tap picks the nearest day). */
function monthNode(m, { current, today, onPick }) {
  const thisYear = Number(today.slice(0, 4));
  const name = new Date(m.year, m.month, 1).toLocaleDateString([], { month: "long", ...(m.year !== thisYear ? { year: "numeric" } : {}) });
  const studied = m.days.filter((d) => d.state === "studied").length;
  const cells = [...Array.from({ length: m.lead }, () => el("span", { class: "lx-streak-blank", "aria-hidden": "true" })), ...m.days.map((d) => el("span", { part: "streak-day", state: d.state, "data-key": d.key, "aria-current": d.key === current() ? "date" : undefined }))];
  // A day's mark is 14 px, too small to press on its own: the month is the control, 44 px and more, and a tap picks the day under it.
  const days = el("button", { type: "button", part: "streak-month-days", "aria-label": `${name}: ${plural(studied, "day", "days")} studied. Choose a day` }, cells);
  // Where the finger came down: lx/motion.js sends a quick second tap's click itself (iOS drops it), with no place on it.
  let downAt = null;
  days.addEventListener("pointerdown", (event) => (downAt = { x: event.clientX, y: event.clientY }));
  days.addEventListener("click", (event) => {
    const at = downAt ?? (event.clientX || event.clientY ? { x: event.clientX, y: event.clientY } : null);
    downAt = null;
    // The day pressed, or else the nearest to where the press was. Enter from a keyboard has neither: the arrows choose there.
    const hit = event.target.closest?.('[data-key]:not([data-state="future"])');
    if (hit) return onPick(hit.dataset.key);
    if (!at) return;
    let best = null;
    for (const cell of days.querySelectorAll('[data-key]:not([data-state="future"])')) {
      const r = cell.getBoundingClientRect();
      const d = Math.hypot(at.x - (r.left + r.width / 2), at.y - (r.top + r.height / 2));
      if (!best || d < best.d) best = { d, key: cell.dataset.key };
    }
    if (best) onPick(best.key);
  });
  // Arrows move the chosen day, a day or a week, staying on this side of today.
  days.addEventListener("keydown", (event) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = addDays(current(), step);
    if (next <= today) onPick(next, { focus: true });
  });
  return el("section", { part: "streak-month" }, el("h3", {}, name), el("div", { class: "lx-streak-weekdays", "aria-hidden": "true" }, WEEKDAY.map((w) => el("span", {}, w))), days);
}

/** How a word, phrase or idea is shown on a day's line. */
const nameOf = (unit) => (unit.startsWith("c:") ? CHUNKS[unit.slice(2)]?.text : unit.startsWith("p:") ? PATTERNS[unit.slice(2)]?.name : null) ?? unit.slice(2);

/**
 * What you did on a day, in words only: its finished things at once, its words and ideas once `known` has them ({ words, ideas }, worked out
 * in slices; null while they're being worked out, and the part says it's busy).
 */
function dayNode(key, { today, state, known }) {
  const titles = new Map(pathLessons().map((lesson) => [lesson.id, lesson.title]));
  const d = { ...(known ?? { words: [], ideas: [] }), ...dayThings(thingsOn(key), (id) => titles.get(id) ?? null) };
  const line = (title, detail) => el("li", { class: "lx-streak-line" }, el("strong", {}, title), detail ? el("span", {}, detail) : null);
  const lessons = d.lessons.length + d.untitled;
  const lines = [
    d.words.length ? line(plural(d.words.length, "word you now know well", "words you now know well"), d.words.join(", ")) : null,
    d.ideas.length ? line(plural(d.ideas.length, "idea", "ideas"), d.ideas.join(" · ")) : null,
    lessons ? line(plural(lessons, "lesson", "lessons"), d.lessons.join(" · ") || null) : null,
    d.sessions ? line(plural(d.sessions, "session", "sessions"), null) : null,
    d.minutes ? line(`${d.minutes.toLocaleString()} minutes reading`, null) : null,
    d.talks ? line(plural(d.talks, "conversation", "conversations"), null) : null,
  ].filter(Boolean);
  const title = key === today ? "Today" : new Date(`${key}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  // Nothing finished: what the day was, in plain words (a day without study is just that, never "missed"). While its words are still being
  // worked out, nothing is said yet.
  const empty = state === "rested" ? "A rest day held your streak." : state === "paused" ? "Paused." : key === today ? "Nothing yet today." : state === "studied" ? "Studied." : "Nothing that day.";
  const body = lines.length ? el("ul", { class: "lx-streak-lines" }, lines) : known ? el("p", { class: "lx-muted" }, empty) : null;
  return el("section", { class: "lx-streak-daypart", "data-key": key, "aria-live": "polite", "aria-busy": known ? undefined : "true" }, el("h2", { class: "lx-streak-day-title" }, title), body);
}

export function streakSettings(page, params = {}) {
  let alive = true;
  const msg = el("p", { part: "group-note", role: "status", class: "lx-streak-said" });
  const say = (text) => (msg.textContent = text);
  const summarySlot = el("div", { class: "lx-settings-streak" });
  const yearSlot = el("div");
  let selected = dayKey();
  const pauseSlot = el("div", { class: "lx-streak-paused" });

  // A day's words and ideas: crossings' questions asked a few at a time between frames (each a look at the word index's stretches, cheap,
  // but a page with the index still to build, or a year's day of them, never holds the ring back), the chosen day first, then the week before
  // today, kept while the page is open; today's asked again when something changes. Only units answered right that day are asked about.
  const work = new Map(); // day key → { asking (crossings), lang, known: { words, ideas } | null }
  const queue = [];
  let running = false;
  let lastToday = dayKey();
  let stateOf = () => "plain";
  const rose = (row) => {
    const grade = gradeOf(row);
    return grade === "good" || grade === "hard";
  };
  // Whether you knew a unit well at a moment, from the evidence before it: a word in your word bank, or the moment inside one of the stretches
  // the word index keeps for it (know/word-index.js: read known at level 3 or more, the rule of summary.js understood, each stretch [from, to)
  // as wellOver reads them). A comparison, never a replay; understood itself answers only for now.
  const knewAt = (lang) => (unit, at) =>
    (unit.startsWith("w:") && inBank(lang, unit.slice(2))) || (wordEntry(unit, { lang })?.read?.well ?? []).some(([from, to]) => from <= at && at < to);
  const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));
  // The page is composed once the chosen day's words are drawn (its view's ready, which the shell waits on before the page's first frame,
  // READY_WAIT at most): its line has its height from the first frame, and nothing under it moves when they come.
  let composed;
  const ready = new Promise((resolve) => (composed = resolve));
  const want = (key, { first = false } = {}) => {
    if (work.get(key)?.known) return;
    const at = queue.indexOf(key);
    if (at >= 0) queue.splice(at, 1);
    if (first) queue.unshift(key);
    else queue.push(key);
    run();
  };
  const run = async () => {
    if (running) return;
    running = true;
    try {
      // After the tap's frame is drawn: nothing here holds the ring back.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      while (alive && queue.length) {
        const key = queue[0];
        const w = work.get(key);
        if (!w) {
          // Finding the day's units reads every row from its start on: a task of its own.
          const lang = learning();
          const bounds = dayBounds(key);
          work.set(key, { asking: crossings(dayUnits(key, { evidence: evidenceSince(bounds.start), lang, rose }), bounds), lang, known: null });
        } else {
          const ask = knewAt(w.lang);
          const t0 = performance.now();
          do w.asking.step(ask);
          while (!w.asking.done && performance.now() - t0 < 8);
          if (w.asking.done) {
            w.known = wordsAndIdeas(w.asking.crossed, nameOf);
            queue.shift();
            if (key === selected) {
              showDay();
              composed();
            }
          }
        }
        await nextTask();
      }
    } finally {
      running = false;
    }
  };
  // The chosen day's part, drawn again where it is once its words are in.
  const showDay = () => {
    const part = yearSlot.querySelector(`.lx-streak-daypart[data-key="${selected}"]`);
    part?.replaceWith(dayNode(selected, { today: lastToday, state: stateOf(selected), known: work.get(selected)?.known ?? null }));
  };
  // The chosen day's part, under the two months holding it, across both: a year is several screens, and what it says stays by the finger
  // (today's under the first two). While its words are worked out it keeps the height the last one had, so the months under it stay put.
  const placeDay = (calendar, before = 0) => {
    calendar.querySelector(".lx-streak-daypart")?.remove();
    const months = [...calendar.querySelectorAll(':scope > [data-part="streak-month"]')];
    const holding = Math.max(0, months.findIndex((m) => m.querySelector(`[data-part="streak-day"][data-key="${selected}"]`)));
    const known = work.get(selected)?.known ?? null;
    const part = dayNode(selected, { today: lastToday, state: stateOf(selected), known });
    if (!known && before) part.style.minHeight = `${before}px`;
    months[Math.min(months.length, (Math.floor(holding / 2) + 1) * 2) - 1].after(part);
  };
  // A tap: the ring moves and the day's part opens; nothing else is drawn again.
  const choose = (key, { focus = false } = {}) => {
    const calendar = yearSlot.querySelector('[data-part="streak-calendar"]');
    const cell = calendar?.querySelector(`[data-part="streak-day"][data-key="${key}"]`);
    if (!calendar || !cell) return;
    const before = calendar.querySelector(".lx-streak-daypart")?.offsetHeight ?? 0;
    selected = key;
    for (const ringed of calendar.querySelectorAll('[data-part="streak-day"][aria-current]')) ringed.removeAttribute("aria-current");
    cell.setAttribute("aria-current", "date");
    placeDay(calendar, before);
    if (focus) cell.closest("button")?.focus();
    want(key, { first: true });
  };

  // Pausing is rare, so it's a row and a sheet: the ways to start one, and in that same sheet, your own dates.
  const openPause = () => {
    const today = dayKey();
    const layer = ui.sheetLayer({ label: "Pause your streak" });
    const body = el("div", { class: "lx-stack" });
    const status = el("p", { class: "lx-small lx-muted", role: "status" });
    const start = (from, to) => {
      try {
        addPause(from, to);
        // The page's Paused row shows it.
        say("");
        layer.lxClose?.();
      } catch (error) {
        status.textContent = error.message;
      }
    };
    const standing = pauses().filter((p) => p.to >= today);
    const covered = (p) => standing.some((q) => q.from <= p.from && p.to <= q.to);
    const ways = () => {
      status.textContent = "";
      body.replaceChildren(
        el("h2", { class: "lx-sheet-title" }, "Pause your streak"),
        el("p", { class: "lx-small lx-muted" }, "Paused days neither count nor break it."),
        el(
          "ul",
          { part: "list" },
          ...presets(today)
            .filter((p) => !covered(p))
            .map((p) => ui.listRow({ title: p.label, sub: span(p), onclick: () => start(p.from, p.to) })),
          ui.listRow({ title: "Pick the days", onclick: dates }),
        ),
      );
    };
    const dates = () => {
      const fromField = el("input", { part: "text-field", type: "date", "aria-label": "First day of the pause" });
      const toField = el("input", { part: "text-field", type: "date", "aria-label": "Last day of the pause" });
      fromField.value = today;
      fromField.min = today;
      toField.value = addDays(today, 6);
      toField.min = today;
      body.replaceChildren(
        el("div", { class: "lx-reader-sheet-back" }, ui.backButton({ label: "Pause your streak", onclick: ways })),
        el("h2", { class: "lx-sheet-title" }, "Pick the days"),
        el(
          "div",
          { class: "lx-pause-dates" },
          el("label", { part: "field" }, "From", fromField),
          el("label", { part: "field" }, "To", toField),
          ui.button("Pause these days", { variant: "go", size: "lg", block: true, onclick: () => start(fromField.value, toField.value) }),
        ),
        status,
      );
    };
    ways();
    layer.lxBody.append(body);
    layer.lxOpen();
  };

  const openHow = () => {
    const layer = ui.sheetLayer({ label: "How your streak counts" });
    layer.lxBody.append(
      el(
        "div",
        { class: "lx-stack" },
        el("h2", { class: "lx-sheet-title" }, "How your streak counts"),
        el("p", {}, "A day counts once you finish one thing: a study session, or 5 minutes of reading. A day starts at 4 am, so a late night counts for the day before."),
        el("p", {}, `Every ${REST_EVERY} days you study earn a rest day (you keep up to ${REST_MOST}), used by itself when you miss a day. With none left, ${MEND_NEEDS} finished things the next day mend it.`),
        el("p", {}, "Nothing is ever lost for good: you keep your longest, and a new run starts the next time you study."),
      ),
    );
    layer.lxOpen();
  };

  const drawYear = (now, today) => {
    lastToday = today;
    const months = streakMonths(now.statuses ?? {}, today);
    const states = new Map(months.flatMap((m) => m.days).map((d) => [d.key, d.state]));
    stateOf = (key) => states.get(key) ?? "plain";
    const before = yearSlot.querySelector(".lx-streak-daypart")?.offsetHeight ?? 0;
    const calendar = el("div", { part: "streak-calendar" }, months.map((m) => monthNode(m, { current: () => selected, today, onPick: choose })));
    placeDay(calendar, before);
    yearSlot.replaceChildren(
      el(
        "p",
        { class: "lx-streak-key" },
        el("span", { part: "streak-day", state: "studied", "aria-hidden": "true" }),
        " Studied ",
        el("span", { part: "streak-day", state: "rested", "aria-hidden": "true" }),
        " Rest day ",
        el("span", { part: "streak-day", state: "paused", "aria-hidden": "true" }),
        " Paused",
      ),
      calendar,
    );
  };

  const draw = () => {
    if (!alive) return;
    const today = dayKey();
    // Today's may have changed (this is a redraw for something finished): worked out again.
    work.delete(today);
    const now = streakNow();
    if (selected > today) selected = today;
    // The best run and the rest days kept, under the number (the summary's own line is what today holds).
    // This run being the best, the number isn't said twice.
    const best = now.longest > now.days ? `Best ${plural(now.longest, "day", "days")}` : now.days > 1 ? "Your best yet" : null;
    const facts = [best, now.rest ? `${plural(now.rest, "rest day", "rest days")} kept` : null].filter(Boolean);
    summarySlot.replaceChildren(streakSummary(now), ...(facts.length ? [el("p", { class: "lx-streak-facts" }, facts.join(" · "))] : []));
    drawYear(now, today);
    // The chosen day first, then the week before today, ahead of a tap.
    want(selected, { first: true });
    for (let n = 1; n <= 7; n++) want(addDays(today, -n));
    const standing = pauses().filter((p) => p.to >= today);
    pauseSlot.replaceChildren(
      ...(standing.length
        ? [
            el(
              "ul",
              { part: "list", class: "lx-study-rows" },
              standing.map((p) =>
                ui.listRow({
                  title: p.from <= today ? `Paused until ${shown(p.to)}` : `Pause from ${shown(p.from)}`,
                  sub: span(p),
                  trailing: ui.button(p.from <= today ? "End it" : "Remove", { size: "sm", onclick: () => (endPause(p.id), say(p.from <= today ? "Pause ended. Today counts again." : "Pause removed.")) }),
                }),
              ),
            ),
          ]
        : []),
    );
  };

  page.replaceChildren(
    ui.pageTitle("Streak"),
    summarySlot,
    yearSlot,
    pauseSlot,
    msg,
    el(
      "ul",
      { part: "list", class: "lx-study-rows" },
      // Words only on a page under Settings: no symbols.
      ui.listRow({ title: "Pause your streak", opens: "sheet", onclick: openPause }),
      ui.listRow({ title: "How your streak counts", opens: "sheet", onclick: openHow }),
    ),
  );
  draw();
  const stop = onDoneChange(draw);
  // An answer recorded (here or on another device) can change today's words: worked out again, and shown if today is the chosen day.
  const stopProgress = onProgressChange(() => {
    const today = dayKey();
    if (!work.has(today)) return;
    work.delete(today);
    if (selected === today) want(today, { first: true });
  });
  // Packs arriving (a start's, or a new version) can name a lesson or a phrase anew: the chosen day says it as they have it now.
  const stopContent = onContentChange(() => alive && showDay());
  const back = params.from === "today" ? { href: "#today", label: "Home" } : undefined;
  return { title: "Streak", back, ready, dispose: () => ((alive = false), composed(), stop(), stopProgress(), stopContent()) };
}
