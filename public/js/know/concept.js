// A concept's own page (#know/<unit>), and the drawer a word opens over a page: a word, a grammar pattern or a phrase. What it is, with an
// example to hear and its Dutch-order line; the one way to practice it (or, when only a pack that's off has it, turning that pack on); how
// well you know it reading, hearing and saying it, in plain words; and its history behind one row that opens in place.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { conceptsOf, describe, nameLang, onContentChange, sentence, shownName, writtenName } from "../study/content.js";
import { unitState } from "../study/progress.js";
import { allPacks, isPackOn, setPackOn } from "../study/packs.js";
import { buildView } from "../study/pack-format.js";
import { SKILLS } from "../study/scheduler.js";
import { cardItem } from "../study/session.js";
import * as voice from "../study/voice.js";
import { activityName } from "./activity-names.js";
import { history, itemsWith } from "./summary.js";
import { rankOf } from "../study/frequency.js";
import { learning } from "../study/learning.js";
import { languageName } from "../lang/index.js";
import { conceptHead, fill, ordinal, wideButton } from "./ui.js";
import { askMenu } from "../ai/ask.js";

const DAY = 86_400_000;
const SKILL = {
  read: { label: "Reading it", icon: "book", short: "Read" },
  hear: { label: "Hearing it", icon: "ear", short: "Hear" },
  say: { label: "Saying it", icon: "mic", short: "Say" },
};
// How well, in the words the Knowledge page uses (its levels 1 to 4).
const LEVEL = ["Just started", "Getting there", "Strong", "Solid"];

/** A unit's page address. */
export const conceptHref = (unit) => `#know/${encodeURIComponent(unit)}`;

// When it comes back to be asked again, in words.
function backText(strength, now) {
  if (strength.due) return "due now";
  const days = Math.round((strength.dueAt - now) / DAY);
  return days <= 0 ? "back later today" : days === 1 ? "back tomorrow" : `back in ${days} days`;
}

/** A pack of the language you're learning that's off and has a sentence practicing `unit`, or null: turning it on is the way to practice it. */
function packToTurnOn(unit) {
  const lang = learning();
  for (const pack of allPacks()) {
    if (pack.language !== lang || isPackOn(pack.id)) continue;
    if (buildView([pack], lang).items.some((item) => conceptsOf(item).includes(unit))) return pack;
  }
  return null;
}

// What a test's grade means, in words, with its meaning color.
function verdict(test) {
  if (test.grade === "again") return test.help === "answer" ? ["wrong", "Shown the answer"] : ["wrong", "Missed"];
  if (test.grade === "good") return ["right", "Right"];
  if (test.outcome === "wrong") return ["hint", "Not quite"];
  if (test.help === "nudge") return ["hint", "Right, with help"];
  return ["hint", "Right, easy to guess"];
}

// Where a word ranks in everyday language (from the frequency list), if it's among the words it lists.
function frequencyLine(unit) {
  if (!unit.startsWith("w:")) return null;
  const lang = learning();
  const rank = rankOf(unit.slice(2), lang);
  return Number.isFinite(rank) ? `The ${ordinal(rank)} most common word in everyday ${languageName(lang)}.` : null;
}

function example(unit) {
  const item = itemsWith(unit)[0];
  if (!item) return null;
  const words = item.words.map(([text], i) => (i === item.words.length - 1 ? text + item.punct : text));
  // Its word-for-word line, unless it says just what the translation says (ui.sentenceRow's rule): then the translation alone, as English.
  if (ui.sameEnglish((item.literal ?? []).map(([text]) => text).join(" "), item.means)) {
    return el("div", { class: "lx-concept-example" }, ui.spokenLine(words, (options) => voice.speakItem(item, options)), el("p", { class: "lx-concept-means" }, item.means));
  }
  const line = ui.literalLine(cardItem(item));
  return el(
    "div",
    { class: "lx-concept-example" },
    ui.spokenLine(words, (options) => voice.speakItem(item, options)),
    el("div", { class: "lx-answer-literal" }, line, line.lxCanFlip ? ui.orderSwitch(line) : null),
    el("p", { class: "lx-small lx-muted" }, item.means),
  );
}

// The "…" by a concept's name: ask your AI about it, with the sentence the page shows it in.
const EXPLAIN = {
  pattern: (name) => `Explain the pattern “${name}”: how it works, with a few examples.`,
  word: (name) => `Explain the word “${name}”: what it means and how it's used, with a few examples.`,
  phrase: (name) => `Explain the phrase “${name}”: what it means and when to use it, with a few examples.`,
};
function askAboutConcept(unit, info) {
  const item = itemsWith(unit)[0];
  const lang = learning();
  return askMenu({
    about: {
      language: lang,
      where: "concept",
      unit,
      ...(item ? { sentence: { id: item.id, text: sentence(item), literal: item.literal.map(([text]) => text).join(" "), natural: item.means } } : {}),
    },
    thing: `this ${info.kind}`,
    subject: `this ${info.kind}, with examples`,
    explain: (EXPLAIN[info.kind] ?? EXPLAIN.word)(writtenName(unit)),
    card: { text: writtenName(unit), lang: nameLang(unit, lang), meta: [info.kind[0].toUpperCase() + info.kind.slice(1), info.en].filter(Boolean).join(" · ") },
    label: `More about ${writtenName(unit)}`,
  });
}

/** Renders a unit's page into `page`. Returns { title, back }. */
export function renderConcept(page, unit, { back = { href: "#know", label: "What you know" } } = {}) {
  const now = Date.now();
  const info = describe(unit);
  const s = unitState(unit, { now });
  // Reading, hearing and saying it: how well, in plain words, and when it's asked again.
  const strengths = SKILLS.map((skill) => {
    const strength = s.strengths[skill];
    const trained = s.trained.includes(skill);
    const slipping = strength && trained && strength.due && strength.level >= 2;
    const sub = !trained
      ? "Off in your study settings"
      : !strength
        ? "Not asked yet"
        : `${slipping ? "Slipping" : LEVEL[Math.min(4, Math.max(1, strength.level)) - 1]} · ${backText(strength, now)}`;
    return ui.listRow({ icon: SKILL[skill].icon, title: SKILL[skill].label, sub, trailing: ui.strengthMeter(strength?.level ?? 0, slipping ? "slipping" : undefined) });
  });

  const { tests, met, placedAt } = history(unit);
  const shown = tests.slice(0, 30);
  const rows = shown.map((test) => {
    const [meaning, word] = verdict(test);
    // Its line: the skill and the day first ("Read · Nov 9"), so every date starts where its line does, then what you said and any note. (As
    // the row's value, each date sat left of its badge, at a different place on every row.)
    const day = new Date(test.at).toLocaleDateString([], { day: "numeric", month: "short" });
    const detail = [SKILL[test.skill]?.short, day, test.said ? `“${test.said}”` : null, test.note].filter(Boolean).join(" · ");
    return ui.listRow({
      // Every activity a session records has its name (activity-names.js); one only a newer device knows is still never its raw id.
      title: activityName(test.activity) ?? "A game",
      sub: detail,
      trailing: ui.badge(meaning, word),
    });
  });
  // A placement's entry, the oldest: what Find your level put down as known, never an answer.
  const placedDay = placedAt ? new Date(placedAt).toLocaleDateString([], { day: "numeric", month: "short" }) : "";
  // In its place in time among the answers (newest first): after the placement's own right answers, before any since.
  const placedPos = shown.filter((test) => test.at > placedAt).length;
  if (placedAt && (placedPos < shown.length || tests.length <= shown.length)) rows.splice(placedPos, 0, ui.listRow({ title: "Placed by Find your level", sub: [SKILL.read?.short, placedDay].filter(Boolean).join(" · "), trailing: ui.badge("right", "Known") }));
  const metTimes = (met.reading ?? 0) + (met.games ?? 0) + (met.talk ?? 0) + (met.listening ?? 0);
  const metLine = [
    met.reading && `${met.reading} in your reading`,
    met.games && `${met.games} in games`,
    met.talk && `${met.talk} talking with your AI`,
    met.listening && `${met.listening} listening`,
  ].filter(Boolean);
  // Its history: one row saying what's in it, opening in place (never a long list by default).
  const right = tests.filter((test) => test.grade && test.grade !== "again").length;
  const missed = tests.length - right;
  const historyBody = el(
    "div",
    { class: "lx-concept-history", hidden: true },
    el("ul", { part: "list" }, rows),
    tests.length > shown.length ? el("p", { class: "lx-small lx-muted" }, `And ${tests.length - shown.length} earlier.`) : null,
    metLine.length ? el("p", { class: "lx-small lx-muted" }, `Met ${metLine.join(", ")}.`) : null,
  );
  const entries = tests.length + (placedAt ? 1 : 0);
  const historyRow = entries
    ? el(
        "button",
        {
          type: "button",
          class: "lx-shelf-row",
          "aria-expanded": "false",
          onclick: () => {
            const opening = historyRow.getAttribute("aria-expanded") !== "true";
            historyRow.setAttribute("aria-expanded", String(opening));
            historyBody.hidden = !opening;
          },
        },
        el("span", { class: "lx-shelf-label" }, "History", el("span", { class: "lx-shelf-count" }, String(entries))),
        el("span", { class: "lx-shelf-peek" }, [placedAt ? `Placed ${placedDay}` : null, tests.length || !placedAt ? `${right} right` : null, missed ? `${missed} missed` : null, metTimes ? `met ${metTimes} ${metTimes === 1 ? "time" : "times"}` : null].filter(Boolean).join(" · ")),
      )
    : null;

  // The one thing to do here comes straight after what it is: practice it; or, when only a pack that's off has it, turn that pack on.
  const sentences = itemsWith(unit).length;
  const off = sentences ? null : packToTurnOn(unit);
  const action = sentences
    ? wideButton("Practice this", { variant: "go", size: "lg", onclick: () => (location.hash = `#study/session/concept/${encodeURIComponent(unit)}?from=know`) })
    : off
      ? el(
          "div",
          { class: "lx-stack lx-concept-turn-on" },
          el("p", { class: "lx-small lx-muted" }, `Its sentences are in ${off.name}, which is off.`),
          wideButton("Turn it on to practice this", {
            variant: "gray",
            size: "lg",
            onclick: () => {
              // Once its sentences are in, this is drawn again with the way to practice.
              const stop = onContentChange(() => {
                stop();
                if (page.isConnected) renderConcept(page, unit, { back });
              });
              setPackOn(off.id, true);
            },
          }),
        )
      : el("p", { class: "lx-small lx-muted" }, "None of your packs has a sentence with this yet.");

  const ask = askAboutConcept(unit, info);
  fill(page,
    conceptHead({ name: ui.wordLabel(shownName(unit)), kind: info.kind, about: info.about ?? frequencyLine(unit), en: info.en, example: example(unit), more: ask.button, status: ask.status }),
    action,
    ui.group("How well you know it", strengths, s.isNew ? "It counts once a game asks you about it." : undefined),
    s.leech
      ? el("p", { class: "lx-small" }, "You've missed this on eight different days. More of the same rarely helps: try reading it in a few sentences, or set it beside what it gets mixed up with.")
      : null,
    el("section", { part: "section", class: "lx-concept-past" }, historyRow ?? el("p", { class: "lx-muted" }, "No answers yet."), historyBody),
  );
  return { title: writtenName(unit), back };
}
