// /design: Explore's parts (lx/ui.js: searchField, languageRow, languageFlag, featuredPack, sentenceRow, topicGrid,
// packCard, packShelf, pinnedActions), in every state, with sample packs. The page fills the same builders from what's
// shared in Explore and the library's own packs.

import * as ui from "./lx/ui.js";
import { el } from "./lx/ui.js";
import { loadPictures, pictureNode } from "./study/pictures.js";

const SENTENCE = {
  text: "Ik heb gisteren een boek gelezen.",
  literal: [
    { text: "I", moved: false },
    { text: "have", moved: false },
    { text: "yesterday", moved: true },
    { text: "a book", moved: false },
    { text: "read", moved: true },
  ],
  punct: ".",
  natural: "I read a book yesterday.",
  lang: "nl",
};
const PACKS = [
  { title: "Dutch on the move", about: "Trains, trams and bikes: getting around", meta: "Dutch · A2 · 40 sentences · by Lexicommons", language: "nl" },
  { title: "At the bakery", about: "Ordering, paying and small talk at the counter", meta: "Dutch · A1 · 24 sentences · by mila", language: "nl" },
  { title: "Erste Schritte", about: "Hello, please, thank you, and the verb in second place", meta: "German · A1 · 40 sentences · by Lexicommons", language: "de" },
];
const TOPICS = [
  ["Everyday life", "sun"],
  ["Travel", "compass"],
  ["Food and drink", "flame"],
  ["Family and friends", "user"],
].map(([name, icon]) => ({ name, icon, href: "#design-explore" }));

export function exploreSection({ section, demo, states }) {
  return section(
    "explore",
    "Explore",
    "Finding packs, in the language you're learning or any other. A language always shows its flag beside its name (never the flag alone: flag-icons' SVGs, MIT, in public/flags/); a pack's facts lead with its language. A pack's page keeps Add pack pinned low, in reach, while the page scrolls under it.",
    demo("Search: Enter searches", ui.searchField({ label: "Search packs" })),
    states("A language's flag, beside its name", [
      ["Dutch", el("span", {}, ui.languageFlag("nl"), "Dutch")],
      ["German", el("span", {}, ui.languageFlag("de"), "German")],
      ["Spanish", el("span", {}, ui.languageFlag("es"), "Spanish")],
      ["French, larger (size lg)", el("span", {}, ui.languageFlag("fr", { size: "lg" }), "French")],
      // A learner's own language (a pack of theirs in a language Lexicommons doesn't list) has no flag: its mark stands where one would.
      ["A language of your own (its mark)", el("span", {}, ui.languageMark("Sindarin"), "Sindarin")],
      ["A language of your own, larger", el("span", {}, ui.languageMark("Gronings", { size: "lg" }), "Gronings")],
    ]),
    demo(
      "The languages: the one you're learning, the one shown (selected), the rest in All languages",
      ui.languageRow([
        { lang: "nl", name: "Dutch", sub: "Learning · 12 packs", href: "#design-explore", selected: true },
        { lang: "de", name: "German", sub: "8 packs", href: "#design-explore" },
        { lang: "es", name: "Spanish", sub: "No packs yet", href: "#design-explore" },
        { name: "All languages", sub: "26 languages", onclick: () => {} },
      ]),
    ),
    (() => {
      // A pack's cover: its drawing, or for a shared pack a designed one with its title (explore.js packCover).
      const drawn = el("span", { part: "pack-cover" });
      loadPictures(["pack-starter"]).then((found) => found && drawn.replaceChildren(pictureNode("pack-starter")));
      return demo("A pack's cover: its drawing, or a designed one with its title", el("div", { class: "lx-design-covers" }, drawn, el("span", { part: "pack-cover" }, ui.bookCover({ title: "Dutch word order", seed: "demo-pack" }))));
    })(),
    demo(
      "One pack to start with, with a sentence from it",
      ui.featuredPack({ kicker: "Start here", title: "Dutch word order", about: "Real, everyday sentences where Dutch puts the verb somewhere new.", meta: "Dutch · A1 · 13 sentences · by Lexicommons", language: "nl", href: "#design-explore", sample: ui.sentenceRow(SENTENCE), character: ui.character({ state: "present", size: 64, hidden: true }) }),
    ),
    states("A sentence from a pack", [
      ["on its own", ui.sentenceRow(SENTENCE)],
      ["with its own … menu", ui.sentenceRow({ ...SENTENCE, onMore: () => {} })],
      // Drawn from its words, each with its reading as a study card's (a word you know as written: here שותה).
      ["Hebrew, from its words", ui.sentenceRow({ text: "אני שותה קפה.", words: [{ text: "אני", reading: "אֲנִי" }, { text: "שותה", reading: "שׁוֹתֶה", hidden: true }, { text: "קפה", reading: "קָפֶה" }], punct: ".", natural: "I drink coffee.", lang: "he" })],
      ["Japanese, from its words", ui.sentenceRow({ text: "私は学生です。", words: [{ text: "私", reading: "わたし" }, "は", { text: "学生", reading: "がくせい" }, "です"], punct: "。", natural: "I'm a student.", lang: "ja" })],
    ]),
    demo("Topics as tiles", ui.topicGrid(TOPICS)),
    demo("A shelf: packs in a row that scrolls sideways", ui.sectionHead("Popular in Dutch", { link: { href: "#design-explore", label: "See all" } }), ui.packShelf(PACKS.map((p) => ui.packCard({ ...p, href: "#design-explore" })), { label: "Popular in Dutch" })),
    demo(
      "A page's main action pinned low (in a frame here; on a pack's page it sits over the page as it scrolls)",
      el("div", { class: "ds-pinned-frame" }, ui.pinnedActions([ui.button("Add pack", { variant: "white", size: "lg", block: true, icon: "plus" }), ui.button("Like", { size: "lg" }), ui.button("More", { size: "lg" })], { note: "Added packs keep getting their updates and fixes." })),
    ),
  );
}
