// /design: Today's and the Knowledge page's parts (public/js/know/ui.js, css/lx/know.css), in every state, with sample
// numbers. The pages fill the same builders from the scheduler.

import * as ui from "./lx/ui.js";
import { el } from "./lx/ui.js";
import * as voice from "./study/voice.js";
import { itemById } from "./study/content.js";
import { cardItem } from "./study/session.js";
import { conceptHead, credit, forecastBars, grammarLegend, grammarMap, growthChart, knowHeadline, knowHighlight, knowLinkCard, nextStep, shareRing, skillBars, skillTable, skillTiles, sourceBars, statTiles, stripLegend, streakSpot, streakSummary, studyCalendar, translateBest, translateField, translateGuesses, translateResult, translateWord, weekStrip, wordStrip, translatePack, translateStatus, translateWide } from "./know/ui.js";
import { languagePicker } from "./translate/picker.js";
import { aiCard, bookCard, installCard, pausedCard } from "./know/home-cards.js";
import { timeCard } from "./know/cards-more.js";
import { wordsCard } from "./know/cards.js";
import { knowledge } from "./know/summary.js";

const BARS = [
  { skill: "read", label: "Read", known: 212, of: 260, trained: true },
  { skill: "hear", label: "Hear", known: 140, of: 260, trained: true },
  { skill: "say", label: "Say", known: 60, of: 260, trained: true },
];
const SAMPLE_CREDIT = () =>
  credit([
    "Out of the words in OpenSubtitles 2018 (Dutch). Word counts: ",
    { text: "FrequencyWords", href: "https://github.com/hermitdave/FrequencyWords" },
    "; the subtitles counted: ",
    { text: "OpenSubtitles", href: "http://www.opensubtitles.org/" },
    ". CC BY-SA 4.0.",
  ]);

const MAP = [
  { unit: "p:v2", name: "Verb second", depth: 0, also: [], state: "strong", level: 4 },
  { unit: "p:question", name: "Questions: verb first", depth: 1, also: [], state: "strong", level: 3 },
  { unit: "p:modal", name: "Modal + infinitive last", depth: 1, also: [], state: "slipping", level: 2 },
  { unit: "p:dat", name: "dat: verb to the end", depth: 2, also: ["Perfect tense: verb last"], state: "new", level: 0 },
  { unit: "p:omte", name: "om … te", depth: 2, also: [], state: "new", level: 0 },
  { unit: "p:perfect", name: "Perfect tense: verb last", depth: 1, also: [], state: "learning", level: 2 },
];
// 200 words: mostly known at the start, thinning out, with some in the word bank, learning and slipping.
const STRIP = Array.from({ length: 200 }, (_, i) => {
  const r = (i * 37) % 100;
  const state = i < 40 ? (r < 80 ? "known" : r < 90 ? "said" : "slipping") : i < 120 ? (r < 35 ? "known" : r < 45 ? "learning" : r < 50 ? "slipping" : "new") : r < 10 ? "learning" : "new";
  return { lemma: `word ${i + 1}`, rank: i + 1, state };
});

const FORECAST = [14, 3, 0, 6, 9, 2, 4].map((count, i) => ({ count, label: ["Today", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon"][i], title: ["Today", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Monday"][i] }));
// Twelve weeks: the days you studied, more lately, today in the last week and the days still to come after it.
const CALENDAR = Array.from({ length: 12 }, (_, w) =>
  Array.from({ length: 7 }, (_, d) => {
    const n = w * 7 + d;
    const today = w === 11 && d === 2;
    const future = w === 11 && d > 2;
    const moments = future ? 0 : (n * 13) % 7 < (w > 6 ? 5 : 2) ? ((n * 7) % 25) + 1 : 0;
    return { day: n, date: Date.UTC(2026, 7, 3 + n), moments, level: !moments ? 0 : moments <= 3 ? 1 : moments <= 9 ? 2 : moments <= 19 ? 3 : 4, today, future };
  }),
);

// Four weeks of words you'd recall: growing, with a few days that slipped.
const GROWTH = Array.from({ length: 28 }, (_, i) => ({ at: Date.UTC(2026, 8, 30 + i, 21), n: Math.max(0, i * 9 - 20 - (i > 17 && i < 21 ? 14 : 0)) }));
const TILES = [
  { skill: "read", n: 235, label: "you can read", icon: "book", href: "#knowledge" },
  { skill: "hear", n: 157, label: "you know by ear", icon: "ear", href: "#knowledge" },
  { skill: "say", n: 73, label: "you can say", icon: "mic", href: "#knowledge" },
];

export function knowledgeSection({ section, demo, states }) {
  const item = itemById.get("morgen-oma");
  const words = item.words.map(([text], i) => (i === item.words.length - 1 ? text + item.punct : text));
  const literal = ui.literalLine(cardItem(item));
  const example = el(
    "div",
    { class: "lx-concept-example" },
    ui.spokenLine(words, (options) => voice.speakItem(item, options)),
    el("div", { class: "lx-answer-literal" }, literal, literal.lxCanFlip ? ui.orderSwitch(literal) : null),
    el("p", { class: "lx-small lx-muted" }, item.means),
  );
  const days = ["M", "T", "W", "T", "F", "S", "S"].map((label, i) => ({ label, studied: [0, 1, 2, 4].includes(i), today: i === 4, future: i > 4, title: label }));
  return section(
    "knowledge",
    "Home and Knowledge",
    "What you know, from the scheduler: Home's next step and its glance, and the Knowledge page. Amounts are shades of one ink; slipping and stronger carry their mark and word.",
    el(
      "div",
      { class: "ds-grid" },
      demo(
        "The next step: a quick session (variant session)",
        nextStep({ kicker: "Up next", title: "Quick session", meta: "14 due · 3 new · about 6 min", focus: [["Verb second", null], ["dat: verb to the end", "slipping"]], action: { label: "Start", icon: "play", href: "#knowledge" }, secondary: { text: "No talking this week: practice with your AI", href: "#knowledge" } }),
      ),
      demo(
        "A text to keep reading (reading)",
        nextStep({ variant: "reading", kicker: "Nothing's due. Keep reading", title: "De kleine prins", meta: "Chapter 3 of 27 · You know 94% of its words", action: { label: "Continue", icon: "book", href: "#knowledge" }, secondary: { text: "Or learn something new", href: "#knowledge" } }),
      ),
      demo(
        "Back after days away: Welcome back, nothing about the gap (Tinta waves once from Home's streak spot, not here)",
        nextStep({ kicker: "Welcome back", title: "Pick up where you left off", meta: "5 for today · the rest over the next 6 days · 1 new · about 5 min", action: { label: "Start", icon: "play", href: "#knowledge" } }),
      ),
      demo("Home's cards: reminders paused (a door, no drawing)", el("div", { class: "lx-home-cards" }, pausedCard())),
      demo("Home's cards: adding the app to the Home Screen (a door; its cross is Not now)", el("div", { class: "lx-home-cards" }, installCard({ inApp: false }))),
      demo(
        "Home's cards: your AI's last exchange drawn on a sun tile, Tinta beside your answer",
        el("div", { class: "lx-home-cards" }, aiCard({ exchange: { ai: { text: "Wat ga je dit weekend doen?", means: "What are you doing this weekend?" }, you: "Ik ga met mijn zus fietsen." }, client: "Claude", lang: "nl", language: "Dutch" })),
      ),
      demo(
        "Home's cards: the book you're reading, open (on Home it opens as you scroll to it)",
        el(
          "div",
          { class: "lx-home-cards" },
          (() => {
            const card = bookCard({
              reading: { id: "design-book", title: "De rode regenjas", textLang: "nl", lang: "nl", chapter: { n: 1, of: 1, title: "De rode regenjas" }, read: 0.4, passage: [{ text: "Op dinsdag was de lucht blauw. \"Mama, wanneer komt mijn wens uit?\", vroeg Manu.", target: false }] },
              where: "Page 4 of 10",
              language: "Dutch",
            });
            card.querySelector(".lx-hb-book")?.style.setProperty("--open", "1");
            return card;
          })(),
        ),
      ),
      demo("A practice that's open (practice)", nextStep({ variant: "practice", kicker: "Up next", title: "Role-play is open", meta: "With Claude. Pick up where you left off.", action: { label: "Back to it", icon: "chat", href: "#knowledge" } })),
      demo(
        "Nothing due (new)",
        nextStep({ variant: "new", kicker: "Nothing's due", title: "Learn something new", meta: "3 new words · about 4 min", steps: [{ icon: "book", meaning: "new", label: "Study card" }, { icon: "check", label: "Choose" }], action: { label: "Start", icon: "play", href: "#knowledge" }, secondary: { text: "Or read something", href: "#knowledge" } }),
      ),
    ),
    states("Translate's field: either way (whichever finds more), or one way; the button changes it", [
      ["either way", translateField({ left: { code: "en", name: "English" }, right: { code: "nl", name: "Dutch" } })],
      ["English to Dutch", translateField({ left: { code: "en", name: "English" }, right: { code: "nl", name: "Dutch" }, both: false, value: "to read" })],
    ]),
    states("What Translate found", [
      ["a word", translateResult({ text: "lezen", meaning: "to read", from: "From Starter: Dutch word order", lang: "nl", speak: () => voice.speakWord("lezen", { lang: "nl" }) })],
      ["a whole sentence", translateResult({ variant: "sentence", text: "Ik heb gisteren een boek gelezen.", meaning: "I read a book yesterday.", from: "From Starter: Dutch word order", lang: "nl", speak: () => voice.speakWord("Ik heb gisteren een boek gelezen.", { lang: "nl" }) })],
    ]),
    states("What Translate says first, large: a sentence, a word, or the word-by-word line, labeled", [
      ["a sentence, Dutch typed", translateBest({ variant: "sentence", said: "Ik heb gisteren een boek gelezen.", meaning: "I read a book yesterday.", toEnglish: true, lang: "nl", from: "From Starter: Dutch word order", speak: () => voice.speakWord("I read a book yesterday.", { lang: "en" }), speakSaid: () => voice.speakWord("Ik heb gisteren een boek gelezen.", { lang: "nl" }) })],
      ["a word, English typed", translateBest({ variant: "word", said: "sneeuwbal", meaning: "snowball", toEnglish: false, lang: "nl", from: "From Dutch words 12,001–14,000", speak: () => voice.speakWord("sneeuwbal", { lang: "nl" }) })],
      ["the rough line", translateBest({ variant: "line", meaning: ["I want gladly a ", el("mark", { class: "lx-tr-miss" }, "xyzzyq")], toEnglish: true, lang: "nl", rough: true, notFound: ["xyzzyq"], speak: () => voice.speakWord("I want gladly a", { lang: "en" }) })],
    ]),
    states("Its next best guesses, one tap away", [
      ["closed", translateGuesses({ count: 3, rows: () => [translateResult({ text: "hallo", meaning: "hello, hi", lang: "nl" })] })],
      ["open", translateGuesses({ count: 2, open: true, rows: () => [translateResult({ text: "hallo", meaning: "hello, hi", lang: "nl", from: "From Dutch words 1–2,000" }), translateResult({ text: "aflopen", meaning: "to end, to turn out", lang: "nl", about: "For “loopt”" })] })],
    ]),
    states("The one wide button, with why the answer is what it is over it", [
      ["what your packs have", translateWide({ symbol: "cards-q", word: "In your packs", count: 6 })],
      ["nothing in your packs", translateWide({ icon: "compass", word: "Find a pack" })],
      ["a line that says why", translateStatus({ words: "There's no full translator for West Frisian." })],
      ["something on its way", translateStatus({ words: "Full translator coming: 14 of 37 MB", share: 14 / 37 })],
    ]),
    states("A pack that has it, to add", [
      ["one sentence", translatePack({ name: "Strong language", by: "Lexicommons · 1 sentence with this", add: ui.button("Add", { pressed: "false" }), line: ["Noem niemand een ", el("mark", {}, "imbeciel"), "."], means: "Don't call anyone an imbecile.", lang: "nl" })],
    ]),
    states("Choosing a language", [
      ["its wheel", (() => {
        const place = el("div");
        languagePicker({ items: [{ code: "en", name: "English", offline: true }, { code: "nl", name: "Dutch", offline: true }, { code: "de", name: "German", offline: true }, { code: "fr", name: "French", offline: true }], current: "nl", inline: place });
        return place;
      })()],
    ]),
    states("A main word: what it means, and the sentences of your packs that use it", [
      ["with more to show", translateWord({ word: "biertje", lang: "nl", meaning: "beer (a glass or bottle)", rows: [ui.sentenceRow({ text: "Zullen we een biertje drinken?", natural: "Shall we have a beer?", lang: "nl" })], restCount: 2, rest: () => [ui.sentenceRow({ text: "Ik drink vanavond een biertje.", natural: "I'm having a beer tonight.", lang: "nl" })] })],
    ]),
    demo(
      "Your progress, on Home: numbers at a glance, each opening what's behind it",
      statTiles([
        { symbol: "recall-q", n: 212, label: "words you'd recall", href: "#knowledge" },
        { symbol: "done-q", n: 48, label: "things done this week", href: "#knowledge" },
      ]),
    ),
    demo("Your words before you've started any (know-card, empty): the number, and Tinta saying how it starts", wordsCard({ lang: "nl", rows: [] })),
    demo(
      "One of the Knowledge page's cards (know-section): Over time, its chart the way into its page (know-door), from this device's own study",
      timeCard({ lang: "nl", now: Date.now(), k: knowledge({ lang: "nl", now: Date.now() }) }),
    ),
    states("Read, hear, say: trained, and a strength you don't train (off)", [
      ["trained", skillBars(BARS)],
      ["hearing off", skillBars([BARS[0], { ...BARS[1], trained: false }, BARS[2]])],
    ]),
    states("This week: studied, missed, today, still to come", [["Thursday", weekStrip(days, 4)]]),
    states("This week with a rest day and a pause: Wednesday rested, the weekend paused", [
      ["rest and pause, beside the streak (no count)", weekStrip(days.map((d, i) => ({ ...d, studied: [0, 1, 3, 4].includes(i), rested: i === 2, paused: i > 4, future: false })), 4, { count: false })],
      ["the rest day Tinta's umbrella is about, ringed (mark)", weekStrip(days.map((d, i) => ({ ...d, key: `day-${i}`, studied: [0, 1, 3].includes(i), rested: i === 2, future: i > 3 })), 3, { count: false, mark: { day: "day-2", pose: "rest" } })],
    ]),
    states("Home's streak spot: Tinta by the streak and the week (ready with its drip until today counts, then counted; lex-retention's calm poses on a rest day and a mended one)", [
      ["ready: today to come", streakSpot({ character: ui.character({ state: "ready", size: 64, hidden: true }), summary: streakSummary({ days: 12, longest: 12, rest: 1, state: "open", need: 1 }), strip: weekStrip(days, 4, { count: false }) })],
      ["counted: today counts", streakSpot({ character: ui.character({ state: "counted", size: 64, hidden: true }), summary: streakSummary({ days: 13, longest: 13, rest: 1, state: "done", need: 0 }), strip: weekStrip(days.map((d, i) => ({ ...d, studied: d.studied || i === 4 })), 5, { count: false }) })],
      ["rest: a rest day used", streakSpot({ character: ui.character({ state: "rest", size: 64, hidden: true }), summary: streakSummary({ days: 12, longest: 12, rest: 0, state: "open", need: 1 }), strip: weekStrip(days.map((d, i) => ({ ...d, key: `day-${i}`, studied: [0, 1, 2].includes(i), rested: i === 3, future: i > 4 })), 3, { count: false, mark: { day: "day-3", pose: "rest" } }) })],
      ["mended: yesterday mended", streakSpot({ character: ui.character({ state: "mended", size: 64, hidden: true }), summary: streakSummary({ days: 12, longest: 12, rest: 0, state: "done", need: 0 }), strip: weekStrip(days.map((d, i) => ({ ...d, key: `day-${i}`, studied: i !== 3 && i < 5, future: i > 4 })), 4, { count: false, mark: { day: "day-3", pose: "mended" } }) })],
    ]),
    states("The streak on Home: what today holds, never a warning", [
      ["today counts", streakSummary({ days: 12, longest: 40, rest: 2, state: "done", need: 0 })],
      ["nothing yet today", streakSummary({ days: 12, longest: 12, rest: 1, state: "open", need: 1 })],
      ["yesterday to mend", streakSummary({ days: 12, longest: 12, rest: 0, state: "mend", need: 2 })],
      ["one more mends it", streakSummary({ days: 12, longest: 12, rest: 0, state: "mend", need: 1 })],
      ["paused", streakSummary({ days: 30, longest: 30, rest: 2, state: "paused", need: 0, pausedUntil: "2026-11-12" })],
      ["no streak yet", streakSummary({ days: 0, longest: 0, rest: 0, state: "none", need: 1 })],
      ["day 1 again", streakSummary({ days: 1, longest: 40, rest: 0, state: "done", need: 0 })],
      ["on Home: a row that opens Settings → Streak", streakSummary({ days: 12, longest: 40, rest: 2, state: "done", need: 0 }, { href: "#knowledge" })],
    ]),
    demo("The Knowledge page's headline: the share as a ring and a sentence, what you know by kind, its credit", knowHeadline({ counts: "212 words · 9 patterns · 14 phrases", share: 0.71, note: "Including 38 words you added in your reading.", credit: SAMPLE_CREDIT() })),
    states("The ring: its arc is the share itself", [
      ["nothing yet", shareRing(0)],
      ["just starting (0.4%)", shareRing(0.004)],
      ["a third", shareRing(0.34)],
      ["most of it", shareRing(0.71)],
    ]),
    demo("Before the word list is here: what you know by kind only", knowHeadline({ counts: "12 words · 2 patterns · 0 phrases", share: null })),
    demo("Over time: words you'd recall each day for four weeks, today last (a few days slipped)", growthChart({ points: GROWTH, what: "words you'd recall" })),
    states("Read, hear, say as three numbers, each opening the table by kind", [
      ["trained", skillTiles(TILES)],
      ["saying off", skillTiles([TILES[0], TILES[1], { ...TILES[2], trained: false }])],
    ]),
    states("Highlights: slipping, a next step, stronger today", [
      ["slipping", knowHighlight({ icon: "clock", meaning: "slipping", text: "3 things slipping. About 4 minutes brings them back.", tags: [["Perfect tense: verb last", "#knowledge", "slipping"], ["gelezen", "#knowledge", "slipping"], ["gisteren", "#knowledge", "slipping"]], action: { label: "Review them", href: "#knowledge", variant: "white" } })],
      ["a next step", knowHighlight({ icon: "mic", text: "You can read 12 things you can't say yet. Saying them is the next step.", action: { label: "Practice saying them", href: "#knowledge" } })],
      ["stronger today", knowHighlight({ icon: "check", meaning: "right", text: "4 things got stronger today.", tags: [["Verb second", "#knowledge", "right"], ["boek", "#knowledge", "right"]] })],
    ]),
    el(
      "div",
      { class: "ds-grid" },
      demo("A card that opens its page: the grammar map, a glimpse", knowLinkCard({ title: "Your grammar", sub: "4 of 6 patterns started · 2 strong", href: "#knowledge", preview: grammarMap(MAP.slice(0, 4)) })),
      demo("The most common words, a glimpse", knowLinkCard({ title: "The 1,000 most common words", sub: "212 you'd read · 38 learning", href: "#knowledge", preview: wordStrip({ cells: STRIP, label: "The 200 most common words" }) })),
      demo("The next 7 days, a glimpse", knowLinkCard({ title: "Next 7 days", sub: "38 reviews coming", href: "#knowledge", preview: forecastBars(FORECAST) })),
      demo("Every day you studied, a glimpse", knowLinkCard({ title: "Every day you studied", sub: "31 days in the last 12 weeks", href: "#knowledge", preview: studyCalendar({ weeks: CALENDAR, studied: 31 }) })),
    ),
    demo(
      "Read, hear, say by kind: each count opens its list (saying off here)",
      skillTable(
        ["Words", "Patterns", "Phrases"],
        [
          { skill: "read", label: "Read", cells: [212, 9, 14].map((n) => ({ n, href: "#knowledge" })) },
          { skill: "hear", label: "Hear", cells: [140, 6, 11].map((n) => ({ n, href: "#knowledge" })) },
          { skill: "say", label: "Say", trained: false, cells: [60, 4, 9].map((n) => ({ n, href: "#knowledge" })) },
        ],
      ),
    ),
    demo("The grammar map: each pattern under the one it builds on, lit by how well you know it (strong, learning, slipping, new)", grammarMap(MAP, { href: () => "#knowledge" }), grammarLegend()),
    demo(
      "The most common words: cells in frequency order (known, in your word bank, learning, slipping, not yet); each two rows open their words",
      wordStrip({ cells: STRIP, linkHref: () => "#knowledge", label: "The 200 most common words" }),
      stripLegend([["known", "you'd read it"], ["said", "in your word bank"], ["learning", "learning"], ["slipping", "slipping"], ["new", "not yet"]]),
    ),
    demo("The next 7 days: reviews coming each day, today first (a day with none)", forecastBars(FORECAST)),
    demo(
      "Where it came from this week",
      sourceBars([
        { source: "games", label: "Games", count: 42 },
        { source: "reading", label: "Reading", count: 12 },
        { source: "talk", label: "Talk with your AI", count: 8 },
        { source: "listening", label: "Listening", count: 5 },
      ]),
    ),
    demo("Every day you studied: levels 0–4 by how much, today outlined, the days to come empty", studyCalendar({ weeks: CALENDAR, studied: CALENDAR.flat().filter((d) => d.moments).length, months: [{ week: 0, label: "Aug" }, { week: 4, label: "Sep" }, { week: 8, label: "Oct" }] })),
    demo("A concept's page: its head, with an example to hear and its Dutch-order line", conceptHead({ name: "Verb second", kind: "pattern", about: "In a main clause the verb comes second. Start with a time word, and the subject moves after the verb.", example })),
  );
}
