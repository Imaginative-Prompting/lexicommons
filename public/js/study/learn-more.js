// What there is to learn after an answer: the "?" on every result, right or wrong, in every game (study/session.js finishStep, a deck's
// steps, Match, a Study card once it's shown), and the drawer it opens over the question, with the session waiting and nothing graded.
// Everything in it is what the packs and the language already hold on this device, read as it's opened; a part with nothing to say is
// left out, never filled with words of our own:
//   a word or phrase: as it's taught (a noun with its article), what it means, its drawing; the forms the packs write it in, each with
//     the language's line for it; sentences it's in (yours first) with what it does there, from the pack's notes; the ideas those
//     sentences show; where it ranks among everyday words, with the list's credit; how you're doing;
//   a sentence: what it says, word for word where that differs; its ideas, each opening the idea's own sheet (after-answer.js
//     conceptView) inside this one; its words, each opening its own page;
//   a round of Match: its words, the missed first; a deck's card: its sides, what else it carried, the words in it the packs know.
// A page opened from another comes in its place with the floating back above it (ui.backButton, as every way back is): one drawer, never
// a sheet over a sheet.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { icon } from "../lx/icons.js";
import { t } from "../lx/i18n.js";
import * as motion from "../lx/motion.js";
import { CHUNKS, ITEMS, WORDS, contentLanguage, describe, sentence as itemSentence, sentenceUnits, shownName, writtenName } from "./content.js";
import { conceptState, itemEvidence } from "./progress.js";
import { formNow, notesNow } from "./notes.js";
import { glossOfForm, lemmaOfForm, meaningOfWord, sentencesWith } from "./new-words.js";
import { pictureFits, sentenceSenses } from "./learn-senses.js";
import { writtenOf } from "./written.js";
import { pathThing } from "./path.js";
import { loadPictures, pictureNode, pictureOfWord } from "./pictures.js";
import { frequencyCredit, rankOf } from "./frequency.js";
import { conceptView, ruleText } from "./after-answer.js";
import { articled } from "./lesson.js";
import * as voice from "./voice.js";
import { languageName } from "../lang/index.js";

// The same sentence for the other gender (a pack's otherGender), by whose it is: said by them, or said to them.
const OTHER_GENDER = { speaker: { f: "study.learn.womanSays", m: "study.learn.manSays" }, listener: { f: "study.learn.toWoman", m: "study.learn.toMan" } };
const LEVEL_KEYS = ["study.learn.level0", "study.learn.level1", "study.learn.level2", "study.learn.level3", "study.learn.level4"];
const SENTENCES = 3; // a word's sentences shown, at most
const bare = (text) => String(text ?? "").replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");
const lower = (text) => bare(text).toLocaleLowerCase(contentLanguage());
// A sentence's word as the language writes it on its own: its first word loses the capital the sentence's start gave it, unless the
// language writes that word with one (study/written.js: Engels, a German noun). A word with no dictionary word keeps it as it is.
function asWritten(item, at, lemma = item.words[at][1]) {
  const [text] = item.words[at];
  const word = bare(text);
  if (at !== 0 || !lemma) return word;
  const lang = contentLanguage();
  const written = writtenOf(lang, lemma) ?? lemma;
  const first = written.charAt(0);
  return first && first === first.toLocaleLowerCase(lang) ? word.charAt(0).toLocaleLowerCase(lang) + word.slice(1) : word;
}

// ---------- the "?" ----------

// What a screen reader hears for the "?", by the page it opens.
const LABELS = {
  word: (page) => t("study.learn.buttonWord", { word: page.label }),
  phrase: (page) => t("study.learn.buttonWord", { word: page.label }),
  sentence: () => t("study.learn.buttonSentence"),
  round: () => t("study.learn.buttonRound"),
  card: () => t("study.learn.buttonCard"),
};

/** The "?" on a result: quiet, its result's ink, at the end of the result's line. open(): what a press does; page: what it opens, which names it. */
export function learnButton(open, { page = null } = {}) {
  const label = (page && LABELS[page.kind]?.(page)) ?? t("study.learn.button");
  return el("button", { part: "learn-more", type: "button", "aria-label": label, title: label, "aria-haspopup": "dialog", onclick: () => open() }, icon("help"));
}

// ---------- the drawer ----------

/**
 * Opens the drawer on a page (wordPage, sentencePage, roundPage, cardPage). Keys belong to it while it's up: Escape closes it, never the
 * session under it. onClose: after it's gone. Returns the layer.
 */
export function openLearn(first, { onClose } = {}) {
  ui.closeWordPopover();
  const onKeys = (event) => {
    event.stopPropagation();
    if (event.key !== "Escape") return;
    event.preventDefault();
    layer.lxClose();
  };
  const layer = ui.sheetLayer({
    label: first.label,
    onClose: () => {
      removeEventListener("keydown", onKeys, true);
      voice.stopSpeaking();
      onClose?.();
    },
  });
  const stack = [];
  const show = (page, { back = false } = {}) => {
    const node = page.render(nav);
    const from = stack.at(-2);
    const top = back || stack.length > 1 ? el("div", { class: "lx-learn-back" }, ui.backButton({ label: from?.label ?? first.label, onclick: () => nav.back() })) : null;
    const body = el("div", { part: "learn-sheet", "data-page": page.kind }, top, node);
    layer.lxBody.replaceChildren(body);
    layer.lxPanel.setAttribute("aria-label", page.label);
    layer.lxBody.scrollTop = 0;
    if (layer.dataset.open) motion.appear(body, { rise: 0, duration: motion.duration("--dur-150", 150) });
    node.lxPlay?.(stack.length > 1 ? motion.duration("--dur-150", 150) : motion.duration("--dur-sheet", 500));
  };
  const nav = {
    go(page) {
      stack.push(page);
      show(page);
    },
    back() {
      if (stack.length < 2) return layer.lxClose();
      stack.pop();
      show(stack.at(-1), { back: stack.length > 1 });
    },
    close: () => layer.lxClose(),
  };
  stack.push(first);
  show(first);
  addEventListener("keydown", onKeys, true);
  document.body.append(layer);
  layer.lxOpen();
  layer.dataset.open = "";
  return layer;
}

// ---------- shared parts ----------

const section = (title, ...children) => el("section", { part: "concept-section", class: "lx-learn-section" }, el("h3", {}, title), ...children);
const hearWord = (text) => (voice.hearsWord(text) ? ui.speakButton(() => voice.speakWord(text), { label: t("study.learn.play", { text }) }) : null);

// A sentence as a line to hear, its word (or words) lit: the item's own words, the sentence's end on the last.
function sentenceLine(item, lit = []) {
  const lang = contentLanguage();
  const words = item.words.map(([text], i) => (i === item.words.length - 1 ? text + (item.punct ?? "") : text));
  const line = el(
    "p",
    { class: "lx-concept-line", lang },
    ...words.flatMap((word, i) => {
      const gap = i ? " " : "";
      if (!lit.includes(i)) return [gap, word];
      const end = /[.,!?;:…"”’)]*$/u.exec(word)[0];
      return [gap, el("span", { class: "lx-concept-mark" }, end ? word.slice(0, -end.length) : word), end];
    }),
  );
  return line;
}
// Its recording, else the device's voice (nothing, quietly, with neither: the button is the same as every sentence's).
const hearItem = (item) => (options) => voice.speakItem(item, options);

// How you're doing with a unit: its level in words and how many of its answers were right, as the idea's sheet says it.
function doing(unit) {
  const state = conceptState(unit);
  const tries = state.right + state.wrong;
  return section(
    t("study.learn.doing"),
    el(
      "div",
      { class: "lx-concept-level" },
      ui.strengthMeter(state.level),
      el("span", {}, t(LEVEL_KEYS[state.level] ?? LEVEL_KEYS[0])),
      tries ? el("span", { class: "lx-concept-means" }, t("study.learn.rightOf", { right: state.right, tries })) : null,
    ),
  );
}

// Where a word ranks on the language's frequency list, with the list's credit (AGENTS.md: its numbers are always shown with it).
function rankSection(lemma) {
  const lang = contentLanguage();
  const rank = rankOf(lemma, lang);
  const credit = Number.isFinite(rank) ? frequencyCredit(lang) : null;
  if (!credit) return null;
  const sources = credit.attribution.flatMap((source, i) => [i ? ", " : "", el("a", { href: source.url, target: "_blank", rel: "noopener" }, source.name)]);
  return section(
    t("study.learn.common"),
    el("p", { class: "lx-learn-text" }, t("study.learn.rank", { rank, language: languageName(lang) })),
    el("p", { class: "lx-learn-credit" }, t("study.learn.rankFrom", { corpus: credit.corpus }), " ", ...sources, "."),
  );
}

// Ideas as rows: each its name and what it says in a line (a lesson's own line for its idea, never the catalog's, which may name what the lesson
// hasn't met), opening the idea's page in the drawer on the sentence given for it. units: [[unit, item]].
function ideaList(units, nav, { answer, practice = null, lessonIdea = null } = {}) {
  if (!units.length) return null;
  return el(
    "ul",
    { class: "lx-learn-idea-list" },
    units.map(([unit, item]) => {
      const ours = lessonIdea && unit === `p:${lessonIdea.pattern}`;
      const info = describe(unit);
      const name = ours ? lessonIdea.name : info.name;
      const line = ours ? lessonIdea.line : unit.startsWith("c:") ? info.en : (info.short ?? info.about);
      return el(
        "li",
        {},
        el(
          "button",
          { type: "button", class: "lx-learn-idea-row", "data-concept": unit, onclick: () => nav.go(ideaPage(unit, { item, answer, practice, lessonIdea })) },
          el("span", { class: "lx-learn-idea-text" }, el("span", { class: "lx-learn-idea-name" }, name), line ? el("span", { class: "lx-learn-idea-line" }, ...ruleText(line)) : null),
          icon("chevron"),
        ),
      );
    }),
  );
}
const IDEAS = 3; // a word's ideas listed, at most
// The ideas some sentences show, each with the first of them that shows it; first: the units to put first.
const ideasOf = (items, first = []) => {
  const units = [...new Set([...first, ...items.flatMap((item) => sentenceUnits(item))])].filter((unit) => unit.startsWith("p:") || unit.startsWith("c:"));
  return units.map((unit) => [unit, items.find((item) => sentenceUnits(item).includes(unit)) ?? null]);
};

// ---------- a word, or a phrase ----------

/**
 * What the packs know about a word (unit "w:<lemma>") or a phrase ("c:<id>"). shown: how the question showed it (de koffie), when it
 * did; item: the sentence it was met in, which leads its sentences; practice: the session's Practice this ({ onPractice } → how many
 * went in), or none.
 */
export function wordPage(unit, { shown = null, item = null, practice = null, lessonIdea = null } = {}) {
  const phrase = unit.startsWith("c:");
  const id = unit.slice(2);
  const label = phrase ? CHUNKS[id]?.text ?? id : writtenName(unit);
  return { kind: phrase ? "phrase" : "word", label, render: (nav) => (phrase ? phraseBody(id, { item, nav, practice, lessonIdea }) : wordBody(id, { shown, item, nav, practice, lessonIdea })) };
}

// The drawing, on its tile, where the word has one; filled in once it's here (loadPictures), its tile holding its place meanwhile.
function drawing(picture) {
  if (!picture) return null;
  const tile = el("div", { part: "word-picture", class: "lx-learn-picture", "aria-hidden": "true", "data-picture": picture }, pictureNode(picture));
  const node = tile.firstElementChild;
  if (!node.firstElementChild) {
    node.dataset.held = picture;
    loadPictures([picture]).then((ok) => {
      if (!ok || !tile.isConnected) return;
      node.replaceWith(pictureNode(picture));
    });
  }
  return tile;
}

// Every form the packs write a word in, with the language's line for each that isn't its dictionary form (notes.js formNow), or the pack's
// own note on it in a sentence it's in: [{ form, line, count }], the commonest first, its dictionary form leading.
function formsOf(lemma, items, shown = null) {
  const lang = contentLanguage();
  const forms = new Map();
  for (const item of items) {
    item.words.forEach(([text, word], at) => {
      if (word !== lemma) return;
      const form = lower(text);
      if (!form) return;
      const one = forms.get(form) ?? { form, line: null, count: 0 };
      one.count++;
      one.line ??= formNow(lang, lemma, bare(text)) ?? notesNow(item)?.words?.[at]?.form ?? null;
      forms.set(form, one);
    });
  }
  const thing = pathThing(`w:${lemma}`);
  for (const form of thing?.forms ?? []) if (!forms.has(lower(form))) forms.set(lower(form), { form: lower(form), line: formNow(lang, lemma, form), count: 0 });
  // The form the question showed first (drink, for drinken), then the dictionary form, then the commonest.
  const self = lower(lemma);
  const asked = shown ? lower(String(shown).split(/\s+/).at(-1)) : null;
  const rank = (one) => (one.form === asked ? 0 : one.form === self ? 1 : 2);
  return [...forms.values()].sort((a, b) => rank(a) - rank(b) || b.count - a.count);
}

// A word's sentences: the one it was met in first, then one for each other form it takes (so they show it doing different things), then
// the rest; within each, ones you've played first, then the shortest. Each once.
function sentencesOf(lemma, item) {
  const all = sentencesWith(lemma);
  const formIn = (one) => lower(one.words.find(([, word]) => word === lemma)?.[0] ?? "");
  const played = (one) => (itemEvidence(one.id).length ? 0 : 1);
  const order = all.filter((one) => one !== item).sort((a, b) => played(a) - played(b) || a.words.length - b.words.length);
  const picked = item && item.words.some(([, word]) => word === lemma) ? [item] : [];
  const forms = new Set(picked.map(formIn));
  for (const one of order) {
    if (picked.length >= SENTENCES) break;
    if (!forms.has(formIn(one))) {
      picked.push(one);
      forms.add(formIn(one));
    }
  }
  for (const one of order) {
    if (picked.length >= SENTENCES) break;
    if (!picked.includes(one)) picked.push(one);
  }
  return picked;
}

// A sentence with the word lit, its English, and what the pack's notes say the word does there (said: notes already said above, not again).
function usedIn(item, lemma, said = new Set()) {
  const at = item.words.map(([, word], i) => (word === lemma ? i : -1)).filter((i) => i >= 0);
  const note = notesNow(item)?.words?.[at[0]] ?? null;
  const all = [note?.role, note?.why].filter(Boolean);
  const does = said.has(all.join("|")) ? [] : all;
  said.add(all.join("|"));
  return el(
    "div",
    { class: "lx-concept-example lx-learn-used" },
    ui.speakButton(hearItem(item), { label: t("study.learn.play", { text: itemSentence(item) }) }),
    el(
      "div",
      {},
      sentenceLine(item, at),
      item.means ? el("p", { class: "lx-concept-means" }, item.means) : null,
      does.length ? el("p", { class: "lx-learn-note" }, el("span", { class: "lx-concept-mark", lang: contentLanguage() }, asWritten(item, at[0])), ": ", does.map((one) => one.replace(/[.\s]*$/, "")).join(". "), ".") : null,
    ),
  );
}

function wordBody(lemma, { shown, item, nav, practice, lessonIdea }) {
  const lang = contentLanguage();
  const thing = pathThing(`w:${lemma}`);
  const article = thing?.article ?? null;
  // The word as a dictionary has it, a noun with its article (de koffie, drinken); the form the question showed leads its forms.
  const title = article ? articled(article, writtenName(`w:${lemma}`)) : shownName(`w:${lemma}`);
  const gloss = WORDS[lemma] ?? thing?.means ?? "";
  // The drawing of the lesson that first taught it (path.js pathThing, its picture field) only beside a sentence that uses the sense that lesson
  // teaches, read as this drawer reads a sentence (learn-senses.js pictureFits): halen's dog fetching a stick never over "we caught the train",
  // nor kaart's greeting card over a map. A sentence of another sense, or one that doesn't tell, shows none: a missing picture rather than a
  // wrong one. With no sentence of its own (the page from Knowledge, or a sentence it isn't in), or with one of that lesson's own, its drawing.
  const own = item ? sentenceRead(item) : null;
  const at = own ? own.lemmas.indexOf(lemma) : -1;
  // (HAVE, BE or "no" as the lesson's English: the sentence's own English against the lesson's own sentences', learn-senses.js usesIn.)
  const lessonLines = () => thing.lessonPicture.map((id) => ITEMS.find((one) => one.id === id)).filter((one) => one && sentenceRead(one).lemmas.includes(lemma)).map((one) => ({ means: one.means ?? "", literal: (one.literal ?? []).map(([text]) => text).join(" ") }));
  const fits = !thing?.lessonPicture || at < 0 || thing.lessonPicture.includes(item.id) || pictureFits(own.glosses, own.literal, at, thing.means, { means: item.means ?? "", lesson: lessonLines() });
  const picture = thing?.picture ? (fits ? thing.picture : null) : pictureOfWord(lemma);
  const items = sentencesWith(lemma);
  const forms = formsOf(lemma, items, shown).filter((one) => one.form !== lower(lemma) || one.line);
  // Forms with a line of their own as rows; the rest named together after them, as the packs write them.
  const lined = forms.filter((one) => one.line);
  const bareForms = forms.filter((one) => !one.line && one.form !== lower(lemma));
  const sentences = sentencesOf(lemma, item);
  const heard = typeof title === "string" ? title : title.text;
  const top = el(
    "div",
    { class: "lx-learn-top" },
    drawing(picture),
    el(
      "div",
      { class: "lx-learn-head" },
      el("div", { class: "lx-learn-name" }, el("h2", { class: "lx-concept-name", lang }, ui.wordLabel(title, lang)), hearWord(heard)),
      gloss ? el("p", { class: "lx-learn-gloss" }, gloss) : null,
      article ? el("p", { class: "lx-learn-text" }, t("study.learn.article", { article, word: writtenName(`w:${lemma}`) })) : null,
    ),
  );
  // The idea about this word in its sentence first (the pack's note names it), then the rest its sentences show.
  const noted = sentences.flatMap((one) => one.words.map(([, word], at) => (word === lemma ? notesNow(one)?.words?.[at]?.concept : null)).filter(Boolean)).map((id) => `p:${id}`);
  const ideas = ideaList(ideasOf(sentences, noted).slice(0, IDEAS), nav, { practice, lessonIdea });
  const notesSaid = new Set();
  const body = el(
    "div",
    { part: "concept-sheet", class: "lx-learn-word" },
    top,
    lined.length || bareForms.length
      ? section(
          t("study.learn.forms"),
          lined.length ? el("dl", { class: "lx-learn-forms" }, lined.flatMap((one) => [el("dt", { lang }, one.form), el("dd", {}, one.line)])) : null,
          bareForms.length ? el("p", { class: "lx-learn-text" }, t("study.learn.otherForms"), " ", el("span", { class: "lx-learn-also", lang }, bareForms.map((one) => one.form).join(", "))) : null,
        )
      : null,
    sentences.length ? section(t("study.learn.inSentences"), ...sentences.map((one) => usedIn(one, lemma, notesSaid))) : null,
    ideas ? section(t("study.learn.ideas"), ideas) : null,
    rankSection(lemma),
    doing(`w:${lemma}`),
    practice ? practiceRow(`w:${lemma}`, practice, nav) : null,
  );
  return body;
}

function phraseBody(id, { item, nav, practice, lessonIdea }) {
  const lang = contentLanguage();
  const chunk = CHUNKS[id] ?? { text: id };
  const items = ITEMS.filter((one) => one.chunks?.includes(id));
  const sentences = [...(item?.chunks?.includes(id) ? [item] : []), ...items.filter((one) => one !== item && itemEvidence(one.id).length), ...items.filter((one) => one !== item && !itemEvidence(one.id).length)].slice(0, SENTENCES);
  // Its words, each what it means by itself, where the packs know it.
  const words = String(chunk.text)
    .split(/\s+/)
    .map((text) => ({ text, meaning: meaningOfWord(text, null) }))
    .filter((one) => one.meaning && one.meaning.gloss !== chunk.en);
  const body = el(
    "div",
    { part: "concept-sheet", class: "lx-learn-word" },
    el(
      "div",
      { class: "lx-learn-top" },
      el(
        "div",
        { class: "lx-learn-head" },
        el("div", { class: "lx-learn-name" }, el("h2", { class: "lx-concept-name", lang }, chunk.text), hearWord(chunk.text)),
        chunk.en ? el("p", { class: "lx-learn-gloss" }, chunk.en) : null,
        chunk.about ? el("p", { class: "lx-learn-text" }, chunk.about) : null,
      ),
    ),
    words.length > 1 ? section(t("study.learn.phraseWords"), wordRows(words.map(({ text, meaning }) => ({ text, meaning })), nav)) : null,
    sentences.length
      ? section(
          t("study.learn.inSentences"),
          ...sentences.map((one) =>
            el("div", { class: "lx-concept-example lx-learn-used" }, ui.speakButton(hearItem(one), { label: t("study.learn.play", { text: itemSentence(one) }) }), el("div", {}, sentenceLine(one), one.means ? el("p", { class: "lx-concept-means" }, one.means) : null)),
          ),
        )
      : null,
    (() => {
      const ideas = ideaList(ideasOf(sentences).filter(([unit]) => unit !== `c:${id}`).slice(0, IDEAS), nav, { practice, lessonIdea });
      return ideas ? section(t("study.learn.ideas"), ideas) : null;
    })(),
    doing(`c:${id}`),
    practice ? practiceRow(`c:${id}`, practice, nav) : null,
  );
  return body;
}

// Rows of words, each opening its own page: { text (as written), meaning (meaningOfWord's), note (what it does here), missed, page (a page of
// its own to open, a deck's card's; else the word's or phrase's by its unit) }.
function wordRows(rows, nav, { item = null, practice = null } = {}) {
  const lang = contentLanguage();
  return el(
    "ul",
    { class: "lx-learn-words" },
    rows.map(({ text, meaning, note, missed, unit, senses = 0, page = null }) => {
      const target = page ? null : (unit ?? (meaning?.lemma ? `w:${meaning.lemma}` : meaning ? (lemmaUnit(text, meaning) ?? null) : null));
      const opens = page ?? (target ? wordPage(target, { item, practice }) : null);
      const inner = [
        el("span", { class: "lx-learn-word-text", lang }, bare(text), meaning?.lemma ? el("span", { class: "lx-learn-word-lemma" }, ` (${meaning.lemma})`) : null),
        el(
          "span",
          { class: "lx-learn-word-means" },
          meaning?.gloss === null ? el("span", { class: "lx-learn-word-note" }, t("study.learn.meanings", { count: senses })) : (meaning?.gloss ?? ""),
          note ? el("span", { class: "lx-learn-word-note" }, note) : null,
        ),
        missed ? el("span", { class: "lx-learn-missed" }, icon("cross"), t("study.learn.missed")) : null,
      ];
      return el(
        "li",
        {},
        opens
          ? el("button", { type: "button", class: "lx-learn-word-row", "data-unit": target ?? unit ?? undefined, onclick: () => nav.go(opens) }, ...inner, icon("chevron"))
          : el("div", { class: "lx-learn-word-row" }, ...inner),
      );
    }),
  );
}
// The unit a written word stands for when it's its own dictionary form (meaningOfWord leaves lemma out then), or a phrase's.
function lemmaUnit(text, meaning) {
  if (WORDS[lower(text)] !== undefined && meaning.gloss) return `w:${lower(text)}`;
  const word = Object.keys(WORDS).find((one) => lower(one) === lower(text));
  if (word) return `w:${word}`;
  const chunk = Object.entries(CHUNKS).find(([, one]) => one.text === meaning.said && one.en === meaning.gloss);
  return chunk ? `c:${chunk[0]}` : null;
}

// Practice this, at the drawer's foot: a few questions on it go in right after this one and the drawer closes; nothing to ask, it says so.
function practiceRow(unit, { onPractice }, nav) {
  const status = el("p", { class: "lx-small lx-muted", role: "status" });
  const button = ui.button(t("study.learn.practice"), {
    variant: "gray",
    size: "lg",
    block: true,
    onclick: () => {
      const n = onPractice(unit);
      if (n) nav.close();
      else status.textContent = t("study.learn.nothingToPractice");
    },
  });
  return el("div", { part: "concept-practice" }, button, status);
}

// ---------- an idea (a pattern, or a phrase as a sentence's unit) ----------

/** An idea's page: the sheet an answer's chip opens (after-answer.js conceptView), here inside the drawer. lessonIdea: a lesson's own words for it. */
export function ideaPage(unit, { item = null, answer, practice = null, lessonIdea = null } = {}) {
  const ours = lessonIdea && unit === `p:${lessonIdea.pattern}`;
  const label = ours ? lessonIdea.name : describe(unit).name;
  return {
    kind: "idea",
    label,
    render: (nav) =>
      conceptView(unit, {
        item,
        sentence: item ? itemSentence(item) : undefined,
        answer,
        practice: practice ? { unit, onPractice: () => practice.onPractice(unit), close: nav.close } : null,
        ...(ours ? { name: lessonIdea.name, line: lessonIdea.line } : {}),
      }),
  };
}

// ---------- a sentence ----------

/**
 * A sentence's page: what it says, its ideas (each opening its own page), then its words (each opening its own). answer: what you answered,
 * when it was wrong (an idea's page names a known mistake); lessonIdea: a lesson's own words for its idea.
 */
export function sentencePage(item, { answer, practice = null, lessonIdea = null } = {}) {
  return { kind: "sentence", label: t("study.learn.sentenceTitle"), render: (nav) => sentenceBody(item, { answer, practice, lessonIdea, nav }) };
}

/**
 * A sentence as its drawer reads it: each word's meaning (meaningOfWord); its dictionary word as that meaning was found, the sentence's own, else
 * its form's (a starter's sentence names few), never for a word that's part of a fixed phrase (its meaning is the phrase's); each one's gloss;
 * its word-for-word line. { meanings, lemmas, glosses, literal }.
 */
function sentenceRead(item) {
  const meanings = item.words.map(([text], at) => meaningOfWord(text, item, at));
  const lemmas = item.words.map(([text, lemma], at) => {
    if (lemma) return lemma;
    const found = meanings[at] ? lemmaOfForm(text) : null;
    return found && glossOfForm(found, bare(text)) === meanings[at].gloss ? found : null;
  });
  const glosses = lemmas.map((lemma, at) => (lemma ? glossOfForm(lemma, bare(item.words[at][0])) : null));
  return { meanings, lemmas, glosses, literal: (item.literal ?? []).map(([text]) => text).join(" ") };
}

function sentenceBody(item, { answer, practice, lessonIdea, nav }) {
  const lang = contentLanguage();
  const notes = notesNow(item);
  const { meanings, lemmas, glosses, literal } = sentenceRead(item);
  const ideas = ideasOf([item]);
  // The sentence for the other gender, where its pack gives one (A woman says: Obrigada.): one line, the sentence in the language's own words.
  const other = item.otherGender && OTHER_GENDER[item.otherGender.who]?.[item.otherGender.gender];
  const otherLine = other ? el("p", { class: "lx-concept-literal", part: "other-gender" }, t(other, { text: el("span", { lang }, item.otherGender.text) })) : null;
  // Its words in order, each once: as the language writes it, its dictionary word where that's another, what it means HERE (the senses of
  // its gloss the sentence's word-for-word line uses: learn-senses.js; a word whose senses the line doesn't tell apart says how many it has,
  // and its page lists them), and what it does here (the notes). (Each word's meaning and dictionary word as sentenceRead finds them.)
  const here = sentenceSenses(glosses, literal);
  const seen = new Set();
  const rows = item.words
    .map(([text], at) => {
      const lemma = lemmas[at];
      const meaning = meanings[at];
      const note = notes?.words?.[at];
      const all = meaning && lemma ? String(glossOfForm(lemma, bare(text)) ?? "").split(";").map((one) => one.trim()).filter(Boolean) : [];
      const gloss = !meaning ? "" : !lemma || all.length < 2 ? meaning.gloss : here[at].length ? here[at].join("; ") : null;
      return { text: asWritten(item, at, lemma), meaning: meaning ? { ...meaning, gloss } : null, senses: all.length, note: note ? [note.role, note.form].filter(Boolean).join(" · ") : null };
    })
    .filter((row) => {
      const key = `${lower(row.text)}|${row.meaning?.gloss ?? ""}`;
      return seen.has(key) ? false : seen.add(key);
    });
  return el(
    "div",
    { part: "concept-sheet", class: "lx-learn-sentence" },
    el(
      "div",
      { class: "lx-concept-example lx-learn-said" },
      ui.speakButton(hearItem(item), { label: t("study.learn.play", { text: itemSentence(item) }) }),
      el("div", {}, sentenceLine(item), item.means ? el("p", { class: "lx-concept-means" }, item.means) : null, literal && !ui.sameEnglish(literal, item.means) ? el("p", { class: "lx-concept-literal" }, t("study.learn.wordForWord", { literal })) : null, otherLine),
    ),
    ideas.length ? section(ideas.length === 1 ? t("study.learn.idea") : t("study.learn.ideasHere"), ideaList(ideas, nav, { answer, practice, lessonIdea })) : null,
    section(t("study.learn.words"), wordRows(rows, nav, { item, practice })),
  );
}

// ---------- a round of Match ----------

/** A round of Match: its words, the ones you missed first, each opening its own page. pairs: [{ unit, nl, en, page? }] (page: a deck's card's
 * own); missed: a Set of units. */
export function roundPage(pairs, missed, { practice = null } = {}) {
  return {
    kind: "round",
    label: t("study.learn.roundTitle"),
    render: (nav) => {
      const order = [...pairs.filter((one) => missed.has(one.unit)), ...pairs.filter((one) => !missed.has(one.unit))];
      return el(
        "div",
        { part: "concept-sheet", class: "lx-learn-round" },
        el("h2", { class: "lx-concept-name" }, t("study.learn.roundTitle")),
        wordRows(
          order.map((one) => ({ text: one.nl, meaning: { gloss: one.en }, missed: missed.has(one.unit), unit: one.unit.startsWith("w:") || one.unit.startsWith("c:") ? one.unit : null, page: one.page ?? null })),
          nav,
          { practice },
        ),
      );
    },
  };
}

// ---------- a deck's card ----------

/** A card of a deck (an Anki deck, a plain pack): its two sides, how it's said, what else it carried, and the words in it the packs know. */
export function cardPage(card, { say = null, unit = null } = {}) {
  return {
    kind: "card",
    label: card.text,
    render: (nav) => {
      const lang = contentLanguage();
      const known = String(card.text)
        .split(/\s+/)
        .map((text) => ({ text, meaning: meaningOfWord(text, null) }))
        .filter((one) => one.meaning);
      return el(
        "div",
        { part: "concept-sheet", class: "lx-learn-card" },
        el(
          "div",
          { class: "lx-learn-top" },
          el(
            "div",
            { class: "lx-learn-head" },
            el("div", { class: "lx-learn-name" }, el("h2", { class: "lx-concept-name", lang }, card.text), say ? ui.speakButton(say, { label: t("study.learn.play", { text: card.text }) }) : null),
            card.reading ? el("p", { class: "lx-learn-text", lang }, card.reading) : null,
            card.means ? el("p", { class: "lx-learn-gloss" }, card.means) : null,
          ),
        ),
        card.sentence ? section(t("study.learn.cardSentence"), el("p", { class: "lx-concept-line", lang }, card.sentence), card.sentenceBack ? el("p", { class: "lx-concept-means" }, card.sentenceBack) : null) : null,
        ...(card.extras ?? []).map((extra) => section(extra.label, el("p", { class: "lx-learn-text" }, extra.text))),
        card.tags?.length ? el("section", { part: "concept-section", class: "lx-learn-section", "data-card-tags": "" }, el("h3", {}, t("study.learn.tags")), el("p", { class: "lx-learn-text" }, card.tags.join(", "))) : null,
        known.length ? section(t("study.learn.cardWords"), wordRows(known, nav)) : null,
        unit ? doing(unit) : null,
      );
    },
  };
}

/** A word's own page from a question about it alone (Tap the picture, Pick the word, Type the word, the speaking twins): the step's unit and how it showed it. */
export const stepWordPage = (step, options) => wordPage(step.unit, { shown: step.text ?? null, ...options });

/** Whether a word unit has anything for its page (it's in the packs' words, or a phrase they have). */
export const hasWordPage = (unit) => Boolean(unit) && ((unit.startsWith("w:") && WORDS[unit.slice(2)] !== undefined) || (unit.startsWith("c:") && Boolean(CHUNKS[unit.slice(2)])));
