// A deck's steps on the session screen (session.js hands over what it has): a card, Choose, Type it, Fill the gap,
// Listening, Word order, Say it and Match, built from the same parts as the sentence games. What a card says is only ever shown
// as text. Each answer is one row of evidence on the card's own unit, through TESTS as any game's is.

import { t } from "../lx/i18n.js";
import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import { LANGUAGES, withoutAccents } from "../lang/index.js";
import { orderOf, plainItems } from "./pack-items.js";
import { allPacks } from "./packs.js";
import { learningFrom, learningFromName, learningName } from "./learning.js";
import { TESTS, record } from "./progress.js";
import { cardRows, scriptChoices, seededShuffle, soundTyped, teachesScript, wrongChoices } from "./deck.js";
import { contentLanguage } from "./content.js";
import * as voice from "./voice.js";
import { play as playSound } from "../lx/sound.js";
import { cardPage, learnButton, openLearn, roundPage } from "./learn-more.js";

const CHOICES = 4;

const quiet = (text) => el("span", {}, text);

// Typed text as it's compared: its case, the space and marks around it, and the accents if the settings forgive them.
function typedKey(text, lang, forgiving) {
  const plain = text.normalize("NFC").toLocaleLowerCase(lang).replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
  // Accents don't apply to a language written without spaces: folding them would drop kana's voicing marks.
  return forgiving && LANGUAGES[lang]?.separator !== "" ? withoutAccents(plain) : plain;
}

/** Whether what's typed is what the card says, counting a card's slashes or commas as its alternatives ("huis, woning"). */
export function typedMatches(typed, expected, lang, forgiving = true) {
  const answer = typedKey(typed, lang, forgiving);
  if (!answer) return false;
  if (answer === typedKey(expected, lang, forgiving)) return true;
  return expected.split(/[,;/]/).some((part) => typedKey(part, lang, forgiving) === answer);
}

// The words of a card's text as a line shows them: split where the language puts spaces, whole where it has none.
const wordsOf = (text, lang) => (LANGUAGES[lang]?.separator === "" ? [text] : text.trim().split(/\s+/).filter(Boolean));

function frontLine(card, lang) {
  const words = wordsOf(card.text, lang).map((text) => ({ text }));
  // One written unit with how it's said: over it, as a word in a sentence shows its reading.
  if (card.reading && words.length === 1) words[0] = { text: words[0].text, reading: card.reading };
  return ui.targetLine(words, { lang, onWord: () => {} });
}

// What plays a card aloud: its own sound on this device, else the device's voice reading its front.
const speakerOf = (step, lang) => (options) => voice.speakCard({ text: step.card.text, clip: step.sound, lang }, options);

/** Draws a deck's step. s: what the session screen hands over. */
export function deckStep(step, s) {
  const lang = contentLanguage();
  // A pack that teaches a script (kana): each card a letter and how it's said, so its games ask how it's said, never what it means.
  const script = teachesScript(allPacks().find((pack) => pack.id === step.pack));
  const fromLang = learningFrom();
  const say = speakerOf(step, lang);
  const keep = (activity, outcome, help = "none") => {
    const { test, skill } = TESTS[activity];
    record(cardRows(step.card, { concept: step.unit, outcome, activity, test, skill, help: outcome === "right" ? help : "none", item: step.unit.slice(2) }));
    s.touched.add(step.unit);
  };
  // The answer's two sides, under the feedback, and the sound it has.
  const answerLine = () => `${step.card.text}${step.card.reading ? ` (${step.card.reading})` : ""}${step.card.means ? `: ${step.card.means}` : ""}`;
  const finish = (right, { skipped = false } = {}) => {
    const spoken = ui.speakButton(say, { label: "Play it aloud", text: "Play it" });
    // Its "?" opens the card: its sides, what else it carried, the words in it the packs know.
    s.finishStep(right ? "right" : "wrong", { feedbackMeaning: right ? "right" : "wrong", title: right ? "Right" : skipped ? "Here's the answer" : "Not quite", text: answerLine(), also: [spoken], skipped, learn: cardPage(step.card, { say, unit: step.unit }) });
    if (s.settings.listening.answers) s.afterAnswerSound(() => spoken.lxPlay());
  };
  const skip = (activity) =>
    ui.button(quiet("I don't know"), {
      variant: "fade",
      icon: "skip",
      onclick: () => {
        if (s.current().answered) return;
        keep(activity, "wrong");
        finish(false, { skipped: true });
      },
    });
  const cardsHere = () => plainItems(allPacks().find((pack) => pack.id === step.pack));
  const pool = (field) => cardsHere().map(field).filter(Boolean);

  const game = step.game;
  if (game === "card") return cardGame();
  if (game === "choose") return chooseGame();
  if (game === "type") return script ? soundGame() : typeGame();
  if (game === "fill") return fillGame();
  if (game === "listen") return listenGame();
  if (game === "arrange") return orderGame();
  // Say it: the session screen's own speaking step, on the card's text (session.js drawSay).
  if (game === "say") return s.sayCard(step);
  return matchGame();

  function cardGame() {
    const { card } = step;
    const reading = card.reading && wordsOf(card.text, lang).length > 1 ? card.reading : null;
    const extra = card.sentence ? ui.wordMeaning({ said: card.sentence, gloss: card.sentenceBack }, { lang, state: "hidden" }) : reading ? ui.wordMeaning({ said: reading, gloss: "how it's said" }, { lang, state: "hidden" }) : null;
    const shown = ui.studyCard(
      {
        tags: step.first ? [["New card", "new"]] : [],
        words: wordsOf(card.text, lang).map((text) => ({ text, ...(card.reading && !reading ? { reading: card.reading } : {}) })),
        literal: [],
        punct: "",
        english: null,
        natural: card.means ?? "",
        meaning: extra,
      },
      { reveal: "external", audio: say, literal: { show: false }, onWord: (word) => (word && !s.current().revealed ? reveal() : null), lang },
    );
    const done = (outcome) => {
      if (s.current().answered) return;
      s.current().answered = true;
      keep("card", outcome);
      s.results[s.index()] = outcome === "wrong" ? "wrong" : "right";
      s.advance();
    };
    const reveal = () => {
      if (s.current().revealed) return;
      shown.lxReveal();
      s.current().revealed = true;
      // Shown, its "?" leads the row: the card's drawer (what else it carried, the words in it).
      const page = cardPage(card, { say, unit: step.unit });
      const learn = learnButton(() => openLearn(page), { page });
      if (step.first) {
        s.current().continue = () => done("met");
        s.setBar(null, el("div", { class: "lx-answer-actions" }, learn, ui.button("Continue", { variant: "white", size: "lg", block: true, onclick: () => done("met") })));
      } else {
        s.current().grade = (knew) => done(knew ? "right" : "wrong");
        s.setBar(
          null,
          el("div", { class: "lx-answer-actions" }, learn, ui.button("Not yet", { variant: "gray", size: "lg", icon: "cross", onclick: () => done("wrong") }), ui.button("I knew it", { variant: "white", size: "lg", icon: "check", onclick: () => done("right") })),
        );
      }
    };
    s.current().reveal = reveal;
    if (script) shown.setAttribute("data-letter", "");
    s.show(s.prompt(script ? "Read it" : `Read it in ${learningName()}`, null), shown);
    if (s.settings.listening.cards) shown.lxPlay();
    s.setBar(null, el("div", { class: "lx-answer-actions" }, ui.button(script ? "Show how it's said" : "Show the other side", { variant: "white", size: "lg", block: true, icon: "eye", onclick: reveal })));
  }

  function answered(activity, right) {
    if (s.current().answered) return;
    keep(activity, right ? "right" : "wrong");
    finish(right);
  }

  function chooseGame() {
    const { card } = step;
    const wrong = script ? scriptChoices(card, cardsHere(), "means", CHOICES - 1, card.id) : wrongChoices(card.means, pool((c) => c.means), CHOICES - 1, card.id);
    const options = seededShuffle([card.means, ...wrong], `${card.id}:choose`);
    const game = ui.choiceList(options, options.indexOf(card.means), { onAnswer: ({ correct }) => answered("choose", correct), lang: fromLang });
    game.classList.add("lx-game");
    s.current().pick = (n) => game.lxPick(n);
    s.show(s.prompt(script ? "How is it said?" : "What does it mean?", null), el("div", { class: "lx-stimulus", "data-letter": script ? "" : undefined }, frontLine(card, lang)), el("div", { class: "lx-stack lx-reach" }, game));
    s.setBar(null, el("div", { class: "lx-answer-actions" }, skip("choose")));
  }

  function typeGame() {
    const { card } = step;
    const label = `Type it in ${learningName()}`;
    const forgiving = s.settings.type.accents !== "strict";
    const field = ui.writeSentence(label, { checkButton: false, onCheck: (text) => answered("type", typedMatches(text, card.text, lang, forgiving) || (Boolean(card.reading) && typedMatches(text, card.reading, lang, forgiving))) });
    field.classList.add("lx-game");
    s.current().check = () => field.lxCheck();
    s.show(s.prompt(label, card.means), el("div", { class: "lx-stack lx-reach" }, field));
    requestAnimationFrame(() => field.lxInput.focus({ preventScroll: true }));
    s.setBar(null, ui.button("Check", { variant: "white", size: "lg", block: true, onclick: () => s.current().check?.() }), el("div", { class: "lx-answer-actions" }, skip("type")));
  }

  // A script's letter, read: shown the letter, how it's said typed in the letters you type with (any of its spellings: o or wo for を).
  function soundGame() {
    const { card } = step;
    const label = "Type how it's said";
    const field = ui.writeSentence(label, { checkButton: false, lang: fromLang, onCheck: (text) => answered("type-sound", soundTyped(card, text)) });
    field.classList.add("lx-game");
    s.current().check = () => field.lxCheck();
    s.show(s.prompt(label, null), el("div", { class: "lx-stimulus", "data-letter": "" }, frontLine(card, lang)), el("div", { class: "lx-stack lx-reach" }, field));
    requestAnimationFrame(() => field.lxInput.focus({ preventScroll: true }));
    s.setBar(null, ui.button("Check", { variant: "white", size: "lg", block: true, onclick: () => s.current().check?.() }), el("div", { class: "lx-answer-actions" }, skip("type-sound")));
  }

  function fillGame() {
    const { card } = step;
    const { at, answer, hint } = card.cloze;
    const before = wordsOf(card.text.slice(0, at), lang);
    const after = wordsOf(card.text.slice(at + answer.length), lang);
    const others = wrongChoices(answer, pool((c) => c.cloze?.answer), CHOICES - 1, card.id);
    const label = hint ? `Fill the gap (${hint})` : "Fill the gap";
    const backLine = card.means ?? null;
    // With other answers in the deck to choose from, choices; with too few, the gap's typed.
    if (others.length >= 2) {
      const game = ui.fillSentence(before, after, seededShuffle([answer, ...others], `${card.id}:fill`), answer, { onAnswer: ({ correct, picked }) => (s.sayTapped(picked, { answers: true }), answered("fill", correct)), lang });
      game.classList.add("lx-game");
      s.current().pick = (n) => game.lxPick(n);
      s.show(s.prompt(label, backLine), el("div", { class: "lx-stack lx-reach" }, game));
      s.setBar(null, el("div", { class: "lx-answer-actions" }, skip("fill")));
      return;
    }
    const forgiving = s.settings.type.accents !== "strict";
    // The gap a line on the screen; a screen reader says a word for it, never the underscores.
    const blank = el("p", { part: "fill-sentence", lang }, before.length ? `${before.join(" ")} ` : null, el("span", { "aria-hidden": "true" }, "____"), el("span", { class: "lx-visually-hidden" }, t("core.blank")), after.length ? ` ${after.join(" ")}` : null);
    const field = ui.writeSentence("The missing part", { checkButton: false, onCheck: (text) => answered("fill", typedMatches(text, answer, lang, forgiving)) });
    field.classList.add("lx-game");
    s.current().check = () => field.lxCheck();
    s.show(s.prompt(label, backLine), el("div", { class: "lx-stimulus" }, blank), el("div", { class: "lx-stack lx-reach" }, field));
    requestAnimationFrame(() => field.lxInput.focus({ preventScroll: true }));
    s.setBar(null, ui.button("Check", { variant: "white", size: "lg", block: true, onclick: () => s.current().check?.() }), el("div", { class: "lx-answer-actions" }, skip("fill")));
  }

  function listenGame() {
    const { card } = step;
    if (script) return letterHeard();
    const options = seededShuffle([card.means, ...wrongChoices(card.means, pool((c) => c.means), CHOICES - 2, card.id)], `${card.id}:listen`);
    const again = ui.speakButton(say, { label: "Play it again", text: "Play again" });
    const slower = ui.speakButton((options_) => say({ ...options_, rate: 0.7 }), { label: "Play it slower", text: "Slower" });
    const game = ui.choiceList(options, options.indexOf(card.means), { onAnswer: ({ correct }) => answered("listen-meaning", correct), lang: fromLang });
    game.classList.add("lx-game");
    s.current().pick = (n) => game.lxPick(n);
    s.show(s.prompt("What did you hear?", null), el("div", { class: "lx-stimulus" }, el("div", { class: "lx-listen-row" }, again, slower)), el("div", { class: "lx-stack lx-reach" }, game));
    again.lxPlay();
    s.setBar(null, el("div", { class: "lx-answer-actions" }, skip("listen-meaning")));
  }

  // A script's letter, heard (its recording, or the device's voice): which of four it is, none of the others said alike.
  function letterHeard() {
    const { card } = step;
    const options = seededShuffle([card.text, ...scriptChoices(card, cardsHere(), "text", CHOICES - 1, card.id)], `${card.id}:heard`);
    const again = ui.speakButton(say, { label: "Play it again", text: "Play again" });
    const slower = ui.speakButton((options_) => say({ ...options_, rate: 0.7 }), { label: "Play it slower", text: "Slower" });
    const game = ui.choiceList(options, options.indexOf(card.text), { onAnswer: ({ correct }) => answered("listen-meaning", correct), lang });
    game.classList.add("lx-game");
    game.setAttribute("data-letters", "");
    s.current().pick = (n) => game.lxPick(n);
    s.show(s.prompt("Which one did you hear?", null), el("div", { class: "lx-stimulus" }, el("div", { class: "lx-listen-row" }, again, slower)), el("div", { class: "lx-stack lx-reach" }, game));
    again.lxPlay();
    s.setBar(null, el("div", { class: "lx-answer-actions" }, skip("listen-meaning")));
  }

  function orderGame() {
    const { card } = step;
    const source = orderOf(card, { separator: LANGUAGES[lang]?.separator ?? " " });
    const game = ui.arrange(seededShuffle(source.words, `${card.id}:order`), source.words, { onCheck: ({ correct }) => answered("arrange", correct), ...s.tileSounds(true), moved: [], lang, checkButton: false });
    game.classList.add("lx-game");
    game.lxOnChange = () => s.fit();
    s.current().check = () => game.lxCheck();
    s.show(s.prompt(`Put it in ${learningName()} order`, source.means), el("div", { class: "lx-stack lx-reach" }, game));
    s.setBar(null, ui.button("Check", { variant: "white", size: "lg", block: true, onclick: () => s.current().check?.() }), el("div", { class: "lx-answer-actions" }, skip("arrange")));
  }

  function matchGame() {
    const missed = new Set();
    const byBack = new Map(step.entries.map((entry) => [entry.card.means, entry]));
    const byFront = new Map(step.entries.map((entry) => [entry.card.text, entry]));
    const game = ui.matchGrid(
      step.entries.map(({ card }) => [card.text, card.means]),
      {
        lang,
        onPair: ({ ok, nl, en, matched, total }) => {
          playSound(!ok ? "match-miss" : matched === total ? "match-last" : "match", ok ? { step: matched } : {});
          if (ok) return;
          if (byFront.has(nl)) missed.add(byFront.get(nl).unit);
          if (byBack.has(en)) missed.add(byBack.get(en).unit);
        },
        // A card's front, tapped, is said (Words you tap): its own sound on this device where it has one.
        onTap: (text, side) => {
          if (side !== "nl") return;
          const entry = byFront.get(text);
          s.sayTapped(text, { say: entry?.sound ? () => voice.speakCard({ text, clip: entry.sound, lang }) : null });
        },
        onDone: ({ misses }) => {
          if (s.current().answered) return;
          const { test, skill } = TESTS.match;
          record(step.entries.flatMap((entry) => cardRows(entry.card, { concept: entry.unit, outcome: missed.has(entry.unit) ? "wrong" : "right", activity: "match", test, skill, item: entry.unit.slice(2) })));
          for (const entry of step.entries) s.touched.add(entry.unit);
          // No right or wrong at the end: the last pair has just sounded.
          // Its "?" opens the round's cards, the missed first, each opening as its card.
          const pairs = step.entries.map((entry) => ({ unit: entry.unit, nl: entry.card.text, en: entry.card.means, page: cardPage(entry.card, { unit: entry.unit, say: (options) => voice.speakCard({ text: entry.card.text, clip: entry.sound, lang }, options) }) }));
          s.finishStep(misses ? "wrong" : "right", { sound: false, feedbackMeaning: misses ? "wrong" : "right", title: misses ? `Matched, with ${misses} ${misses === 1 ? "miss" : "misses"}` : "All matched", text: null, learn: roundPage(pairs, missed) });
        },
      },
    );
    game.classList.add("lx-game");
    s.show(s.prompt("Match the pairs", null), el("div", { class: "lx-stack lx-reach" }, game));
    s.setBar(null, el("p", { class: "lx-small lx-muted" }, script ? "Tap one, then how it's said." : `Tap ${learningName()}, then its ${learningFromName()}.`));
  }
}

