// This week's own page (#know/week), from the Knowledge page's This week card: the week's glasses and what its things are made of, each in its
// own unit, and the words that got stronger; then each day, newest first: what you did that day, what you finished, and the words you met that
// day that you understand well (each opens its sheet). What you only read has no surface: a day is a heading and its lines.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { t, formatDate, formatList, formatNumber } from "../lx/i18n.js";
import { symbol } from "../lx/symbols.js";
import { learning } from "../study/learning.js";
import { finishedBetween } from "../study/done.js";
import { pathLessons } from "../study/path.js";
import { countedFrom, finishedIn, madeOf, miniTiles, weekGlasses, weekOf, whatCounts } from "./cards-more.js";
import { dayOf } from "./summary.js";

const DAY = 86_400_000;
const READ_BLOCK = 5; // minutes: the done-log keeps reading in blocks of five (study/done.js)
const STRONGER_SHOWN = 24;

/** Renders the week's page into `page`. */
export function renderWeek(page) {
  const lang = learning();
  const draw = () => {
    const now = Date.now();
    const week = weekOf({ lang, now });
    const today = dayOf(now);
    const titles = new Map(pathLessons().map((lesson) => [lesson.id, lesson.title]));
    const finished = finishedBetween(now - 7 * DAY, now + 1);
    const stronger = week.stronger.length
      ? el(
          "div",
          { class: "lx-week-new" },
          el("p", { class: "lx-know-line" }, t("know.week.strongerWords", { count: week.stronger.length })),
          miniTiles(week.stronger.slice(0, STRONGER_SHOWN), lang, week.stronger.length > STRONGER_SHOWN ? el("span", { class: "lx-know-line" }, t("know.week.andMore", { count: week.stronger.length - STRONGER_SHOWN })) : null),
        )
      : null;
    const days = [...week.days].reverse().map((d) => {
      const name = d.day === today ? t("know.week.today") : d.day === today - 1 ? t("know.week.yesterday") : formatDate(d.date, { weekday: "long" });
      const that = finished.filter((thing) => dayOf(thing.at) === d.day);
      const lessons = that.filter((thing) => thing.kind === "lesson").map((thing) => titles.get(thing.id)).filter(Boolean);
      const n = (kind) => that.filter((thing) => thing.kind === kind).length;
      const reading = n("read") * READ_BLOCK;
      const lines = [
        lessons.length ? t("know.week.finished", { lessons: formatList(lessons.map((title) => t("know.week.lessonName", { title }))) }) : null,
        n("practice") ? t("know.week.practices", { count: n("practice") }) : null,
        n("game") ? t("know.week.games", { count: n("game") }) : null,
        n("session") ? t("know.week.sessions", { count: n("session") }) : null,
        reading ? t("know.week.reading", { minutes: reading }) : null,
        n("talk") ? t("know.week.talks", { count: n("talk") }) : null,
      ].filter(Boolean);
      const id = `lx-week-day-${d.day}`;
      return el(
        "section",
        { part: "week-day", "aria-labelledby": id, "data-empty": d.moments.size ? undefined : "" },
        el("h2", { class: "lx-week-day-h", id }, el("span", {}, name), el("span", { class: "lx-week-day-date" }, formatDate(d.date, { month: "short", day: "numeric" }))),
        d.moments.size ? madeOf(d.from, { always: true }) : el("p", { class: "lx-know-line" }, t("know.week.nothing")),
        ...lines.map((line) => el("p", { class: "lx-know-line" }, line)),
        d.words.length ? el("div", { class: "lx-week-new" }, el("p", { class: "lx-know-line" }, t("know.week.newWords", { count: d.words.length })), miniTiles(d.words, lang)) : null,
      );
    });
    page.replaceChildren(
      el(
        "div",
        { class: "lx-week-page" },
        ui.pageTitle(t("know.week.title")),
        el("div", { class: "lx-know-stat-block" }, el("span", { class: "lx-know-n" }, formatNumber(week.done)), symbol("done-q", { size: 30 }), el("span", { class: "lx-know-label" }, t("know.week.unit", { count: week.done }))),
        weekGlasses(week, now),
        el("p", { class: "lx-know-caption" }, t("know.week.scale")),
        countedFrom(finishedIn(now - 7 * DAY, now + 1)),
        madeOf(week.from, { always: true }),
        week.done ? whatCounts() : null,
        stronger,
        el("div", { class: "lx-week-days" }, days),
      ),
    );
  };
  draw();
  return { title: t("know.week.title"), back: { href: "#know", label: t("know.week.back") }, refresh: draw };
}
