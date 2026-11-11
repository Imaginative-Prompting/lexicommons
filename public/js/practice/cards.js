// A card your AI dealt: its sentence, played in the app's own games (lx/ui.js), graded here at once, and recorded as
// the same game in Study records it (so it counts the same way), tagged as a practice card and in the practice's
// language. The result goes back to your AI as your turn, so it can aim the next one at the mistake.

import { upgradeItem } from "../study/pack-items.js";
import * as ui from "../lx/ui.js";
import { orderDiffers } from "../lx/literal-case.js";
import { el } from "../lx/ui.js";
import * as voice from "../study/voice.js";
import { getStudySettings } from "../study/settings.js";
import { TESTS } from "../study/progress.js";
import { allWrong, orderOutcome, typedRight, wordOutcomes as outcomesOf } from "../study/attribute.js";
import { match as matchWords } from "../speech/match.js";
import { LANGUAGES, languageName, withoutAccents } from "../lang/index.js";
import { conceptLabel, itemSentence } from "./protocol.js";
import { shownItem } from "../study/pack-format.js";
import { microphone } from "./listen.js";
import { aiLine, practiceCard } from "./ui.js";

// What each game asks, naming the practice's language.
const PROMPTS = (name) => ({
  choose: "Which is right?",
  arrange: `Put it in ${name} order`,
  place: "Where does it go?",
  fill: "Fill the gap",
  type: "Type the missing word",
  write: `Type it in ${name}`,
  match: "Match the pairs",
  say: `Say it in ${name}`,
});

const shuffled = (items, seed) => {
  // Stable per card, so a reload doesn't reshuffle what you were looking at.
  let h = [...seed].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const plain = withoutAccents;
const loose = (text) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’‘]/g, "'")
    .replace(/[.!?,;:"“”]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

// A card from a practice kept since before a pack's version 2 names its item's fields as packs did then.
const cardNow = (card) => (card.item && !Array.isArray(card.item.concepts) ? { ...card, item: upgradeItem(card.item, " ") } : card);

/**
 * The evidence a card gives, in the shape Study's games record (session.js recordItem, progress.js), tagged as a
 * practice card. patterns: the patterns' outcome when the answer says more than right or wrong (a word-by-word result);
 * wordOutcomes: an outcome per lemma (Match: per word shown in the language); help: "answer" when the hint was used.
 * lang: the practice's language (the one being learned unless said).
 */
export function cardEvidence(given, correct, { practiceId, patterns, wordOutcomes = {}, help = "none", lang } = {}) {
  const card = cardNow(given);
  const { game, item } = card;
  const kind = game === "say" ? (item.from === "english" ? "say" : "read-aloud") : game;
  const { test, skill } = TESTS[kind];
  const tag = { activity: game, item: item.id, source: "ai", practice: practiceId, test, skill, ...(lang ? { lang } : {}) };
  if (game === "match") {
    return item.pairs.map(([nl], i) => ({ ...tag, concept: `w:${item.words[i]}`, outcome: wordOutcomes[nl] ?? (correct ? "right" : "wrong") }));
  }
  // Read aloud, it's how you sound: nothing about the grammar.
  const patternOutcome = kind === "read-aloud" ? "met" : (patterns ?? (correct ? "right" : "wrong"));
  const rows = item.concepts.map((id) => ({ ...tag, concept: `p:${id}`, outcome: patternOutcome, help: patternOutcome === "right" ? help : "none" }));
  const gapLemma = item.gap ? item.words[item.gap.index]?.[1] : null;
  const seen = new Set();
  for (const [, lemma] of item.words) {
    if (!lemma || seen.has(lemma)) continue;
    seen.add(lemma);
    const tested = (gapLemma === lemma && (game === "fill" || game === "type")) || game === "write" || game === "say";
    rows.push({ ...tag, concept: `w:${lemma}`, outcome: wordOutcomes[lemma] ?? (tested ? (correct ? "right" : "wrong") : "met") });
  }
  return rows;
}

/**
 * Builds the card in the chat, in the practice's language (lang: its code; the one being learned unless said).
 * onDone({ correct, answer, hint, tries, rows }) once it's answered (rows: its evidence). Returns the card's node.
 */
export function playCard(given, { seed, practiceId, patterns = {}, onDone, lang = ui.targetLanguage().code }) {
  const card = cardNow(given);
  const { game } = card;
  // The item as the screens show it in its language (French: a narrow space before ? and !: pack-format.js shownItem).
  const item = shownItem(card.item, lang);
  const settings = getStudySettings();
  const name = languageName(lang);
  const prompts = PROMPTS(name);
  const words = item.words?.map(([text]) => text) ?? [];
  const full = item.words ? itemSentence(item, lang) : "";
  // Words joined as the practice's language joins them (nothing in Japanese or Chinese).
  const glue = LANGUAGES[lang]?.separator ?? " ";
  let hintUsed = false;
  let finished = false;
  const speakItem = (options) => voice.speakItem(item, { ...options, lang });
  const result = el("div", { class: "lx-card-result" });
  const tools = el("div", { class: "lx-answer-actions" });

  // correct is what's recorded; title overrides the headline (Say it: right on a later try still records the first).
  const finish = (correct, answer, { tries, wordOutcomes, patterns, title } = {}) => {
    if (finished) return;
    finished = true;
    const rows = cardEvidence(card, correct, { practiceId, patterns, wordOutcomes, help: hintUsed ? "answer" : "none", lang });
    tools.remove();
    node.querySelector(".lx-game")?.setAttribute("inert", "");
    const about = item.concepts?.[0] ? conceptLabel(`p:${item.concepts[0]}`, patterns) : null;
    const feedback = ui.feedback(correct ? (hintUsed ? "hint" : "right") : "wrong", title ?? (correct ? (hintUsed ? "Right, with a hint" : "Right") : "Not quite"), correct ? about : about ? `${about}. Here it is:` : "Here it is:");
    result.append(feedback);
    if (full && game !== "match") {
      const line = aiLine({ nl: full, literal: item.literal.map(([text, moved]) => ({ text, moved })), en: item.means, english: item.english }, { speak: speakItem, lang, name });
      result.append(line);
      if (!correct) line.lxReveal();
      if (settings.listening.answers) line.lxPlay();
    }
    ui.animateFeedback(feedback);
    onDone?.({ correct, answer, hint: hintUsed, tries, rows });
  };

  let game_;
  let giveUp = null; // Match: what "I don't know" records
  if (game === "choose") {
    const options = shuffled([full, ...item.wrong], seed);
    game_ = ui.choiceList(options, options.indexOf(full), { lang, onAnswer: ({ correct, picked }) => finish(correct, options[picked]) });
  } else if (game === "arrange") {
    game_ = ui.arrange(shuffled(words, seed), words, { moved: item.moved, lang, order: lang, onCheck: ({ correct, placed }) => finish(correct, placed.join(glue)) });
  } else if (game === "place") {
    const index = item.place.index;
    const rest = words.filter((_, i) => i !== index);
    game_ = ui.placeWord(rest, words[index], index, { punct: item.punct, lang, onAnswer: ({ correct, picked }) => finish(correct, [...rest.slice(0, picked), words[index], ...rest.slice(picked)].join(glue)) });
  } else if (game === "fill") {
    const before = words.slice(0, item.gap.index).join(glue);
    const after = words.slice(item.gap.index + 1).join(glue) + item.punct;
    game_ = ui.fillSentence(before, after, shuffled(item.gap.options, seed), words[item.gap.index], { lang, onAnswer: ({ correct, picked }) => finish(correct, picked) });
  } else if (game === "type") {
    const answer = words[item.gap.index];
    const gap = el("span", { part: "blank", state: "empty" }, "____");
    const space = glue ? " " : null;
    const shown = el("p", { part: "fill-sentence", lang }, words.slice(0, item.gap.index).join(glue), space, gap, space, words.slice(item.gap.index + 1).join(glue) + item.punct);
    const field = ui.typeAnswer(answer, "The missing word", {
      lang,
      onAnswer: ({ correct, typed }) => {
        gap.textContent = answer;
        gap.setAttribute("data-state", correct ? "right" : "filled");
        finish(correct, typed);
      },
    });
    game_ = el("div", { class: "lx-stack" }, shown, field);
  } else if (game === "write") {
    const holder = el("div", { class: "lx-stack" });
    const field = ui.writeSentence(prompts.write, {
      lang,
      onCheck: (typed) => {
        // Word by word, as Study's Type it: accents aside, a near miss is a wrong form, a word out of place is the order's.
        const result = matchWords(plain(full), plain(typed), { lang });
        const correct = loose(typed) === loose(full) || typedRight(result);
        if (!correct) holder.append(ui.typeDiff(typed, full, { lang }));
        finish(correct, typed, { patterns: correct ? "right" : orderOutcome(result), wordOutcomes: correct ? undefined : outcomesOf(item.words, result) });
      },
    });
    holder.append(field);
    game_ = holder;
  } else if (game === "match") {
    const missed = {};
    const matched = new Set();
    // Giving up: the pairs matched first time are right, the rest wrong.
    giveUp = () => Object.fromEntries(item.pairs.map(([nl]) => [nl, matched.has(nl) && !missed[nl] ? "right" : "wrong"]));
    game_ = ui.matchGrid(item.pairs, {
      lang,
      onPair: ({ ok, nl }) => {
        if (!ok) missed[nl] = "wrong";
        else matched.add(nl);
      },
      onDone: ({ misses }) => {
        const wordOutcomes = Object.fromEntries(item.pairs.map(([nl], i) => [nl, missed[nl] ?? "right"]));
        finish(misses === 0, `${misses} missed`, { wordOutcomes });
      },
      onTap: (text, side) => side === "nl" && settings.listening.tapWords && voice.speakTapped(text, { lang }),
    });
  } else if (game === "say") {
    const fromEnglish = item.from === "english";
    const mic = ui.micButton();
    const status = el("p", { class: "lx-say-status lx-muted" }, "Press the microphone and say it.");
    const said = el("div", { class: "lx-said", "aria-live": "polite" });
    let tries = 0;
    let first = null; // the first try is what counts, as in Study
    const listening = microphone({
      mic,
      status,
      expected: full,
      isCurrent: () => !finished,
      locale: () => LANGUAGES[lang]?.locale ?? lang,
      onResult: (heard) => {
        tries++;
        said.replaceChildren(ui.saidLine(heard.match.words, { lang }), el("p", { class: "lx-small lx-muted" }, heard.heard ? `Heard: “${heard.heard}”` : "Heard nothing clear."));
        // The first try is what counts, as in Study; up to three tries to get it.
        if (tries === 1) first = heard.match;
        if (heard.match.ok || tries >= 3) {
          finish(heard.match.ok && tries === 1, heard.heard, { tries, patterns: orderOutcome(first), wordOutcomes: outcomesOf(item.words, first, { spoken: true }), title: heard.match.ok && tries > 1 ? `Right on try ${tries}` : undefined });
        }
        else status.textContent = `Not quite. Try again (${3 - tries} left).`;
      },
      onError: (text) => (status.textContent = text),
    });
    mic.addEventListener("click", () => listening.press());
    game_ = el(
      "div",
      { class: "lx-stack lx-say" },
      fromEnglish ? null : ui.spokenLine(item.words.map(([text], i) => (i === item.words.length - 1 ? text + item.punct : text)), speakItem, { lang, label: "Hear it first" }),
      el("div", { class: "lx-say-mic" }, mic, status),
      said,
    );
  }
  game_.classList.add("lx-game");

  // The hint (the literal line, sliding into the language's order) and "I don't know", as in Study.
  const hintLine = item.literal?.length ? ui.literalLine({ literal: item.literal.map(([text, moved]) => ({ text, moved })), punct: item.punct, english: item.english }, { hidden: true, name }) : null;
  if (hintLine && game !== "match" && orderDiffers(item)) {
    const hint = ui.button(`Hint: ${name} order`, {
      variant: "fade",
      size: "sm",
      icon: "bulb",
      onclick: () => {
        if (finished || hintUsed) return;
        hintUsed = true;
        hintLine.removeAttribute("data-state");
        hint.remove();
        hintLine.lxMorph();
      },
    });
    tools.append(hint);
  }
  tools.append(ui.button("I don't know", { variant: "fade", size: "sm", icon: "skip", onclick: () => finish(false, "", { wordOutcomes: giveUp?.() ?? (game === "write" || game === "say" ? allWrong(item.words) : undefined) }) }));

  const promptText = game === "match" ? null : game === "say" && item.from !== "english" ? null : item.means;
  const node = practiceCard(
    { label: card.prompt ?? (game === "say" && item.from !== "english" ? "Read it aloud" : prompts[game]), text: promptText },
    game !== "match" ? hintLine : null,
    game_,
    tools,
    result,
  );
  node.lxFinished = () => finished;
  // A card answered on another device (or before a reload): shown answered.
  node.lxShowAnswered = (turn) => {
    if (finished) return;
    finished = true;
    tools.remove();
    game_.setAttribute("inert", "");
    if (!turn) return result.append(ui.feedback("hint", "Not answered"));
    result.append(ui.feedback(turn.correct ? (turn.hint ? "hint" : "right") : "wrong", turn.correct ? "Right" : "Not quite", turn.answer ? `You answered: ${turn.answer}` : null));
  };
  return node;
}

