// Translate's page: Today's box, once something's typed in it, with everything else gone (Today's page stays under it,
// so it's the same field and the keyboard never drops). The first thing it says is its best guess; the next best guesses
// are one tap away; under them the main words, each with its meaning and the sentences of your packs that use it, the
// ones you've studied first. This device answers first and nothing waits on the server: its results are drawn as they're
// found, Lexicommons' and shared packs merged in when they come. Tinta writes only while there's a wait to see.
//
// The microphone in the box: the browser's recognizer, in one language at a time, with a press to switch; Whisper only for who chose
// it in Settings, where it hears whether it's English or the language you're learning and sets the way (speaking.js chooseDictation).
// A computer with no recognizer of its own uses Whisper if it's here, and otherwise its first press offers the download, right there.

import * as ui from "../lx/ui.js";
import { el } from "../lx/ui.js";
import * as motion from "../lx/motion.js";
import { icon } from "../lx/icons.js";
import { declineTranslator, downloadTranslator, onTranslatorChange, stopTranslator, translateWith, translatorState } from "./translator.js";
import { languageLabel, t } from "../lx/i18n.js";
import { del as apiDel, post as apiPost } from "../shell/api.js";
import { translateBar, translateBest, translateField, translateListening, translatePack, translateResult, translateStatus, translateTwo, translateWide, translateWord } from "../know/ui.js";
import { languagePicker } from "./picker.js";
import { findPacksHolding, knownShare, onColdAnswer, onTranslateIndex, holdTranslateIndex, prepareTranslate, translate, translateLanguages } from "./translate.js";
import { bestGuess, firstSense, nextGuesses, TRANSLATE_LIMITS } from "./engine.js";
import { itemById, shownName } from "../study/content.js";
import { onWritten, writtenOf } from "../study/written.js";
import { holdSlices } from "../know/slices.js";
import { unitEvidence } from "../study/progress.js";
import { allPacks, followPack, onPackDownloads, packDownloads, unfollowPack } from "../study/packs.js";
import * as voice from "../study/voice.js";
import { learning, learningLocale } from "../study/learning.js";
import { chooseDictation, speechApi } from "../study/speaking.js";
import { onPhone } from "../speech/guard.js";
import { microphone } from "../practice/listen.js";
import { LANGUAGES, typeset } from "../lang/index.js";

// ms after the last key before Tinta shows: past a quick answer, so it never comes in for one. This device answers in 25 ms at the
// 95th percentile on a phone slowed 4× (translate-check's speed stage); the server is asked 300 ms after the last key (ONLINE_PAUSE)
// and on a normal connection answers 100–300 ms later. At 150 ms, an answer landing just past it showed Tinta for a frame or two.
const LOOK_AFTER = 600;
const ONLINE_PAUSE = 300; // ms after the last key before the server is asked (this device answers every key)
const MODEL_PAUSE = 250; // ms after the last key before the full translator is asked: a run per letter flickered
const NOTHING_WAIT = 900; // ms after the last key before "nothing found" is said: a word half typed isn't a failure
const PHRASE_ROWS = 2; // a main word's sentences shown at first, in a phrase
const KEPT = "lx.translate.v1"; // what's typed, for a reload of the page (sessionStorage)
const HEARD_IN = "lx.translate.listen"; // the language a recognizer that can't tell last listened in (localStorage)

const LITTLE = new Set(["a", "an", "the", "to", "of", "be", "is", "are", "with", "on", "in", "at", "(with", "verb)"]);
/** A word or two out of a gloss, to find in a sentence's English. */
const glossWords = (gloss) => String(gloss ?? "").split(/[,;()]/).flatMap((part) => part.trim().split(/\s+/)).map(fold).filter((word) => word && !LITTLE.has(word));
/** Text with the words in terms marked. */
const markIn = (text, terms) =>
  el("span", {}, String(text).split(/(\s+)/).map((piece) => {
    const [, before, word, after] = piece.match(/^([^\p{L}\p{M}\p{N}]*)(.*?)([^\p{L}\p{M}\p{N}]*)$/su) ?? [];
    return word && terms.has(word.toLowerCase()) ? [before, el("mark", {}, word), after] : piece;
  }));

const LONG = 80; // characters: a sentence longer than this (a book's, mostly) shows clipped around what was found
const CLIP = 56; // characters shown of it: about two lines on a phone
const fold = (word) => word.toLowerCase().replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");

/** A pack sentence's literal line, as sentence rows take it: [{ text, moved }]. */

/**
 * A long sentence clipped to about two lines around the first word found in it (terms: lowercase words), "…" where
 * it's cut and that word marked: [nodes], or null when it's short enough to show whole.
 */
function clipAround(text, terms) {
  if (text.length <= LONG) return null;
  const words = text.split(/\s+/);
  const at = Math.max(0, words.findIndex((word) => terms.has(fold(word))));
  let start = at;
  let end = at + 1;
  const length = () => words.slice(start, end).join(" ").length;
  // Widen around it, a word each side in turn, while it fits.
  for (let grow = true; grow; ) {
    grow = false;
    if (end < words.length && length() + words[end].length + 1 <= CLIP) (end++, (grow = true));
    if (start > 0 && length() + words[start - 1].length + 1 <= CLIP) (start--, (grow = true));
  }
  const found = terms.has(fold(words[at]));
  return [
    start > 0 ? "… " : "",
    words.slice(start, at).join(" ") + (at > start ? " " : ""),
    found ? el("mark", {}, words[at]) : words[at],
    (end > at + 1 ? " " : "") + words.slice(at + 1, end).join(" "),
    end < words.length ? " …" : "",
  ];
}

/** A result's sentence as the app knows it (a pack's item, with its recordings and its id in your evidence), if it can. */
function liveItem(item, source) {
  if (!item) return null;
  const id = item.id ?? item;
  const pack = String(source ?? "").replace(/^(?:pack|yours):/, "");
  return itemById.get(`${pack}/${id}`) ?? itemById.get(id) ?? (typeof item === "object" ? item : null);
}

const sentenceText = (item) => item.words.map(([text]) => text).join(" ") + (item.punct ?? "");

/**
 * A word's sentences to show: the ones you've studied first, newest first (your evidence on that word: study/progress.js),
 * then what was found, each once. { item, text, natural, source, studied? }.
 */
function sentencesFor(lemma, found, lang) {
  const rows = [];
  const seen = new Set();
  const add = (row) => {
    if (seen.has(row.text)) return;
    seen.add(row.text);
    rows.push(row);
  };
  for (const row of [...unitEvidence(`w:${lemma}`, lang)].reverse()) {
    const item = row.item && itemById.get(row.item);
    if (item?.words?.some(([, l]) => l === lemma) && sentenceText(item) !== found.whole?.text) add({ item, text: sentenceText(item), natural: item.means, source: `pack:${item.pack}`, studied: true });
  }
  for (const s of found.main?.find((m) => m.lemma === lemma)?.sentences ?? []) add(s);
  return rows;
}

export function translatePage({ host, onChange }) {
  const savedLang = () => {
    try {
      const code = localStorage.getItem("lx.translate.language");
      return code && Object.hasOwn(LANGUAGES, code) && code !== "en" ? code : null;
    } catch {
      return null;
    }
  };
  let lang = savedLang() || learning();
  let ends = [{ code: "en", name: languageLabel("en") }, { code: lang, name: languageLabel(lang) }];
  // Either way (whichever finds more), then English to the language, then the language to English.
  let way = 0;
  let text = "";
  let seq = 0;
  let open = false;
  let leaveIndex = null; // while open and in view, the index held (translate.js holdTranslateIndex)
  // Open but out of view (another tab taken while it's up: Home's page kept off the screen with it open) isn't in use: the shell's mark that
  // Translate's page is in view (:root[data-translate], main.js translateFrame) going off leaves the index, as closing does, and its coming back
  // holds it again. Held from behind a tab, packs arriving made an index for no one and the worker stayed its whole idle (G10).
  const inView = new MutationObserver(() => {
    if (!open) return;
    if (document.documentElement.hasAttribute("data-translate")) leaveIndex ??= holdTranslateIndex();
    else {
      leaveIndex?.();
      leaveIndex = null;
    }
  });
  inView.observe(document.documentElement, { attributes: true, attributeFilter: ["data-translate"] });
  let controller = null;
  let lookTimer = null;
  let pressedAt = -Infinity; // the last finger or click in the field: focus from one opens the page
  let current = null; // what's drawn: the result
  let shownAt = -Infinity; // when what's drawn was typed (performance.now()): a server answer from before it never replaces it
  let shown = new Map(); // what's drawn, by its slot: { signature, nodes }, kept while it says the same
  let lastKey = 0; // when the last key came (performance.now())
  let letGo = null; // lets go of the slices' hold for the query being found (holdSlices)

  const msg = el("p", { class: "lx-settings-message", role: "status" });
  msg.say = (line, tone) => {
    msg.replaceChildren(line ?? "");
    if (tone) msg.setAttribute("data-tone", tone);
    else msg.removeAttribute("data-tone");
  };
  const results = el("div", { class: "lx-tr-results", "aria-live": "polite" });
  const top = el("div", { class: "lx-tr-top" }); // Tinta, when there's nothing else to look at
  // Which query the results are the answer to (data-query): an answer up from the query before stays while the next is found, so a
  // check reading the page waits for its own (translate-check's settled()).
  const answerFor = (query) => (query == null ? results.removeAttribute("data-query") : results.setAttribute("data-query", query));
  const scroller = el("div", { class: "lx-tr-scroll" }, top, results, msg);
  // A press on a button here keeps the field's focus: the keyboard stays, and nothing moves under the finger before the
  // press lands. Scrolling what's found puts the keyboard away, to read it (as Material's search does).
  scroller.addEventListener("mousedown", (event) => {
    if (event.target.closest?.("button, a")) event.preventDefault();
  });
  let dragFrom = null;
  scroller.addEventListener("touchstart", (event) => (dragFrom = event.touches[0]?.clientY ?? null), { passive: true });
  scroller.addEventListener("touchmove", (event) => {
    if (dragFrom === null || Math.abs((event.touches[0]?.clientY ?? dragFrom) - dragFrom) < 12) return;
    dragFrom = null;
    if (document.documentElement.hasAttribute("data-keyboard")) field.lxInput.blur();
  }, { passive: true });

  const direction = () => (way === 1 ? { from: "en", to: lang } : way === 2 ? { from: lang, to: "en" } : { language: lang });
  const shownWay = () => {
    const [left, right] = way === 2 ? [ends[1], ends[0]] : ends;
    return { left, right, both: way === 0 };
  };

  const keep = (line) => {
    try {
      if (line) sessionStorage.setItem(KEPT, line);
      else sessionStorage.removeItem(KEPT);
    } catch {
      // Private browsing: a reload starts empty.
    }
  };

  // ---------- what it's doing ----------

  /** What's said about the packs while they download, or null. */
  const downloadsLine = () => {
    const d = packDownloads();
    if (!d || d.language !== lang || !text.trim()) return null;
    const which = `Getting the word packs (${d.done} of ${d.total}).`;
    return `${which} ${typeof navigator !== "undefined" && navigator.onLine === false ? t("translate.offlineOnlyHere") : t("translate.searchingOnline")}`;
  };
  let looking = null; // { words, node }: Tinta looking it up, kept while its words stay the same (it fades in once)
  /** Says what's going on: working: "nothing" (nothing to show yet), or null. The page has its answer while the server's out, so that goes unsaid.
   * boxes: the leaving Tinta's and the scroller's, read before the answer was drawn (draw: leavingBoxes), so none is read after its writes. */
  const sayWorking = (working, boxes = null) => {
    const line = downloadsLine();
    if (working === "nothing") {
      const words = line ?? t("translate.lookingItUp");
      if (looking?.words !== words) looking = { words, node: ui.lookingUp(words) };
      top.replaceChildren(looking.node);
    } else {
      // An answer came in while Tinta was looking: the answer takes its place at once, and Tinta, lifted out of the page where it
      // stood, fades and shrinks away over it (never gone in one frame, never holding the answer back).
      const leaving = looking?.node;
      looking = null;
      if (leaving?.isConnected && motion.motionOn()) {
        // Read before the new answer's nodes went in where the caller could (draw): read here, after them, it laid the page out inside the
        // answer's own task (24 ms of a slowed phone's, 9 Nov 2026).
        const from = boxes?.from ?? leaving.getBoundingClientRect();
        const within = boxes?.within ?? scroller.getBoundingClientRect();
        top.replaceChildren();
        leaving.setAttribute("aria-hidden", "true");
        leaving.removeAttribute("role");
        Object.assign(leaving.style, { top: `${from.top - within.top + (boxes?.scrollTop ?? scroller.scrollTop)}px`, left: `${from.left - within.left}px`, width: `${from.width}px` });
        leaving.setAttribute("data-leaving", "");
        scroller.append(leaving);
        const gone = () => leaving.remove();
        leaving.addEventListener("animationend", gone, { once: true });
        setTimeout(gone, 400);
      } else top.replaceChildren();
    }
  };

  // ---------- the full translator's own line ----------

  // Last in the foot, one node kept from one draw to the next, so a download's bar (Tinta pouring) is never drawn again on
  // a key, and Not now takes away only its own line. What it says: the offer (a limited answer, online, the packs here,
  // not declined for this language), the download, that it's here (until the next search), or that it didn't download.
  const translatorLine = el("div", { class: "lx-tr-model" });
  const foot = el("div", { class: "lx-tr-foot" });
  // A parent's children made these, in order, moving nothing that stays: what goes is taken out first, then each new
  // node goes in before the ones that stay. So the foot, and the translator's line last in it, are never moved.
  const reconcile = (parent, nodes) => {
    const keep = new Set(nodes);
    for (const child of [...parent.childNodes]) if (!keep.has(child)) child.remove();
    nodes.forEach((node, i) => {
      if (parent.childNodes[i] !== node) parent.insertBefore(node, parent.childNodes[i] ?? null);
    });
  };
  let translatorSaid = "";
  let translatorBar = null;
  let translatorWords = null; // the download's line, its words changed in place as it comes
  let translatorJustCame = null;
  function sayTranslator(what, model) {
    const key = `${what}:${model?.language ?? ""}${model?.waiting ? ":waiting" : ""}`;
    if (what === "downloading" && !model?.waiting && translatorSaid === key) {
      translatorBar?.set(model.size ? model.got / model.size : 0);
      if (translatorWords) translatorWords.textContent = t("translate.model.coming", { got: model.got, size: model.size });
      return;
    }
    if (translatorSaid === key) return;
    translatorSaid = key;
    if (what !== "downloading") translatorBar = translatorWords = null;
    const lang = model?.language;
    const start = () => {
      translatorJustCame = null;
      downloadTranslator(lang).then(
        () => {
          translatorBar?.done();
          translatorJustCame = lang;
          if (current) run({ now: true });
        },
        () => {},
      );
    };
    if (what === "offer") {
      translatorLine.replaceChildren(
        el("p", { class: "lx-small" }, t("translate.model.offer", { size: model.size })),
        el("div", { class: "lx-inline-form" }, ui.button(t("translate.model.download"), { icon: "download", size: "sm", onclick: start }), ui.button(t("translate.model.notNow"), { variant: "fade", size: "sm", onclick: () => declineTranslator(lang) })),
      );
    } else if (what === "downloading" && model.waiting) {
      // Pressed while the word packs are still coming: it starts once they're in (never sharing the connection), and Stop
      // ends the wait. No bar yet: nothing of it is coming.
      translatorLine.replaceChildren(el("div", { class: "lx-tr-model-row" }, el("p", { class: "lx-small lx-tr-model-quiet", role: "status" }, t("translate.model.waiting")), ui.button(t("translate.model.stop"), { variant: "fade", size: "sm", onclick: () => stopTranslator(lang) })));
    } else if (what === "downloading") {
      // The plain bar (no Tinta: its room above the track read as a gap here, and its color stood alone in monochrome), under
      // one row of the line's words and Stop at its end (lex-design-2, 5 Nov).
      translatorBar = ui.downloadBar({ label: t("translate.model.coming", { got: model.got, size: model.size }), share: model.size ? model.got / model.size : 0, tinta: false });
      translatorWords = el("p", { class: "lx-small", role: "status" }, t("translate.model.coming", { got: model.got, size: model.size }));
      translatorLine.replaceChildren(el("div", { class: "lx-tr-model-row" }, translatorWords, ui.button(t("translate.model.stop"), { variant: "fade", size: "sm", onclick: () => stopTranslator(lang) })), translatorBar);
    } else if (what === "here") {
      translatorLine.replaceChildren(el("p", { class: "lx-small", role: "status" }, t("translate.model.here")));
    } else if (what === "failed") {
      translatorLine.replaceChildren(ui.retryLine(t("translate.model.failed"), start));
    } else translatorLine.replaceChildren();
  }

  // ---------- what it found ----------

  const speakWith = (say, name) => (options) => {
    const playing = say(options);
    if (!playing) msg.say(t("translate.noVoice", { language: name }));
    return playing;
  };
  const speakText = (line, code) => speakWith(() => voice.speakWord(line, { lang: code }), languageLabel(code));

  /** A slot's nodes: the ones already drawn while what it says is the same, so a sound playing or a list open stays. */
  const slot = (name, signature, make, next) => {
    const was = shown.get(name);
    const nodes = was?.signature === signature ? was.nodes : make();
    next.set(name, { signature, nodes });
    return nodes;
  };

  // What the translator said, per way and text: asked once, and the page draws again when it answers.
  const translated = new Map();
  const ASKING = Symbol("asking");
  function askTranslator(from, to, found) {
    const key = `${from}|${to}|${found.query}`;
    if (translated.has(key)) return translated.get(key);
    if (translated.size > 200) translated.clear();
    translated.set(key, ASKING);
    // Asked once typing pauses: what's typed MODEL_PAUSE after the last key. Text typed past before then is never asked.
    const ask = () => {
      if (current?.query !== found.query) return void translated.delete(key);
      translateWith(from, to, found.query).then(
        (words) => {
          translated.set(key, words);
          // For the text on the page now, whichever search drew it (a run again, the server's merged in, are other objects).
          if (current?.query === found.query) drawFound(current);
        },
        () => {
          translated.set(key, null);
          if (current?.query === found.query) drawFound(current);
        },
      );
    };
    const wait = MODEL_PAUSE - (performance.now() - lastKey);
    if (wait > 0) setTimeout(ask, wait);
    else ask();
    return ASKING;
  }
  const translatedFor = (from, to, found) => {
    const words = askTranslator(from, to, found);
    return words === ASKING ? null : words;
  };
  // Which way something typed goes when the packs found nothing either way: the translator asked both ways, and the way
  // that changed it is the one, since what's already in the other language comes back nearly as typed ("Mijn zus heeft
  // een hond." from English is "Mijn zus heeft hond."; from Dutch, "My sister has a dog."). ASKING until both have
  // answered; null when they keep as much of it as each other (a name, a number, water), and the page goes on as it was.
  const keptOf = (typed, out) => {
    const words = typed.split(/\s+/).map(fold).filter(Boolean);
    const there = new Set(String(out ?? "").split(/\s+/).map(fold).filter(Boolean));
    return words.length ? words.filter((word) => there.has(word)).length / words.length : 0;
  };
  function wayByTranslator(found) {
    const fromLanguage = askTranslator(lang, "en", found);
    const fromEnglish = askTranslator("en", lang, found);
    if (fromLanguage === ASKING || fromEnglish === ASKING) return ASKING;
    if (!fromLanguage || !fromEnglish) return null;
    const kept = keptOf(found.query, fromLanguage) - keptOf(found.query, fromEnglish);
    return kept < 0 ? lang : kept > 0 ? "en" : null;
  }

  function drawFound(found) {
    const code = found.from === "en" ? found.to : found.from;
    const name = languageLabel(code);
    const toEnglish = found.from !== "en";
    // A word of the language as the language writes it (study/written.js: Engels, Nederland) where the engine hands back its key (a
    // dictionary word, lowercase): the best guess, the word-by-word line, both readings, the other words. A form as typed or as a book
    // has it, and English, stay as they are.
    const asWritten = (word) => (word?.lemma && word.text === word.lemma ? writtenOf(code, word.lemma) : word?.text);
    const partText = (part) => (toEnglish || !part.found ? part.text : asWritten(part));
    const sourceName = new Map(found.sources.map((s) => [s.id, s.name]));
    const from = (id) => (sourceName.get(id) ? t("translate.fromSource", { source: sourceName.get(id) }) : null);
    let best = bestGuess(found);
    const next = new Map();
    // Nothing in the packs, and no way chosen: the translator, when it's here, says which way (and until both its answers
    // are in, it gives none, so an answer the wrong way never shows).
    const unsettled = !way && !found.both && !found.whole && !found.words.length && translatorState(lang, "en").state === "ready";
    const decided = unsettled ? wayByTranslator(found) : null;
    if (decided && decided !== ASKING) lastFrom = decided;
    sayWay(found);
    // The full translator's answer, when it's here for this way. Without it, what the packs can say.
    const packBest = best;
    const modelFrom = sayingFrom();
    const modelTo = modelFrom === "en" ? lang : "en";
    const model = translatorState(modelFrom, modelTo);
    const given = model.state === "ready" && decided !== ASKING ? translatedFor(modelFrom, modelTo, found) : null;
    // The translator thinking about what's typed now, its answer to what came before on the screen: that stays, whole,
    // until this one's in, and then it's swapped in place. Between letters nothing empties or turns into the packs' line.
    const thinking = model.state === "ready" && (decided === ASKING || (decided !== ASKING && askTranslator(modelFrom, modelTo, found) === ASKING));
    if (thinking && sourceShown === "model") return;
    // The translator hands back what it can't translate as it came. With nothing in the packs either, that isn't an answer: letters mean nothing larger for being bold.
    const echoed = Boolean(given) && given.trim().toLowerCase() === found.query.trim().toLowerCase();
    const untranslated = echoed && !found.whole && !found.words.length;
    // Handed back unchanged, with the packs knowing the word: if theirs is spelled the same it really is one word in both (water), and if theirs is different (run: rennen) theirs is the answer.
    const packWord = packBest.kind === "word" ? fold(packBest.word.text) : null;
    const sameWord = echoed && !untranslated && (packBest.kind === "same" || packWord === fold(found.query));
    const answer = untranslated || (echoed && !sameWord) ? null : given;
    if (answer) best = { kind: "model", text: answer };
    {
      // Swap's answer is only ever this query's: a result drawn again for what was typed before (the translator answering
      // late, a pack coming in) leaves it as it is. A query is what's typed, trimmed and cut as the engine cuts it.
      const thisQuery = found.query === text.trim().slice(0, TRANSLATE_LIMITS.query);
      if (thisQuery) lastAnswer = best.kind === "model" ? best.text : best.kind === "sentence" ? (toEnglish ? found.whole.translation : found.whole.text) : best.kind === "word" ? (toEnglish ? firstSense(best.word.en) ?? asWritten(best.word) : asWritten(best.word)) : best.kind === "line" ? best.parts.filter((part) => part.found).map(partText).join(best.glue) : null;
      const typedInLanguage = (best.kind === "model" ? modelFrom !== "en" : toEnglish) && best.kind !== "two" && best.kind !== "none";
      field.lxSetSpeak(typedInLanguage ? ui.speakButton(best.kind === "sentence" ? speakWith((options) => { const item = liveItem(found.whole.item, found.whole.source); return item?.words ? voice.speakItem(item, { ...options, lang: code }) : voice.speakWord(found.whole.text, { lang: code }); }, name) : speakText(found.query, code), { label: t("translate.hearIn", { language: name }) }) : null);
    }

    // The best guess.
    // What it shows as written is in the key too: a pack that changes how a word is written draws it again.
    const shownBest = best.kind === "word" ? asWritten(best.word) : best.kind === "two" ? asWritten(best.readings[1]) : best.kind === "line" ? best.parts.map(partText) : null;
    const bestNodes = slot("best", JSON.stringify([found.query, found.from, best, found.unknown, found.whole?.source, best.word?.source, shownBest]), () => {
      if (best.kind === "model") {
        const up = modelFrom !== "en";
        const node = translateBest({ variant: best.text.length <= 24 ? "word" : "sentence", ...(up ? { meaning: best.text } : { said: best.text }), toEnglish: up, lang: up ? modelFrom : modelTo, speak: speakText(best.text, modelTo), speakLabel: up ? t("translate.hearIn", { language: languageLabel("en") }) : t("translate.hearIn", { language: languageLabel(modelTo) }) });
        // The translator answering while you're looking: the better answer comes in where the other was, and nothing moves.
        if (sourceShown && sourceShown !== "model") motion.appear(node);
        return [node];
      }
      if (best.kind === "sentence") {
        const item = liveItem(found.whole.item, found.whole.source);
        const hearLanguage = speakWith((options) => (item?.words ? voice.speakItem(item, { ...options, lang: code }) : voice.speakWord(found.whole.text, { lang: code })), name);
        return [
          translateBest({
            variant: "sentence",
            said: typeset(code, found.whole.text),
            meaning: found.whole.translation,
            toEnglish,
            lang: code,
            from: from(found.whole.source),
            speak: toEnglish ? speakText(found.whole.translation, "en") : hearLanguage,
            speakLabel: toEnglish ? t("translate.hearIn", { language: languageLabel("en") }) : t("translate.hearIn", { language: name }),
          }),
        ];
      }
      if (best.kind === "word") {
        const { word } = best;
        const hearLanguage = speakText(word.text, code);
        return [
          translateBest({
            variant: "word",
            said: asWritten(word),
            meaning: word.en,
            toEnglish,
            lang: code,
            from: from(word.source),
            speak: toEnglish && word.en ? speakText(word.en, "en") : hearLanguage,
            speakLabel: toEnglish ? t("translate.hearIn", { language: languageLabel("en") }) : t("translate.hearWords", { words: asWritten(word) }),
          }),
        ];
      }
      if (best.kind === "same") {
        return [translateBest({ variant: "word", said: best.text, meaning: t("translate.sameWordIn", { english: languageLabel("en"), language: name }), toEnglish: false, lang: code, from: from(best.word.source), speak: speakText(best.text, code), speakLabel: t("translate.hearWordsIn", { words: best.text, language: name }) })];
      }
      if (best.kind === "two") {
        const [theirs, ours] = best.readings;
        return [
          translateTwo({
            readings: [
              { label: t("translate.asLanguage", { language: name }), meaning: theirs.en, lang: code, from: from(theirs.source), speak: speakText(firstSense(theirs.en) ?? theirs.text, "en"), speakLabel: t("translate.hearIn", { language: languageLabel("en") }) },
              { label: t("translate.asLanguage", { language: languageLabel("en") }), said: asWritten(ours), lang: code, from: from(ours.source), speak: speakText(ours.text, code), speakLabel: t("translate.hearWords", { words: asWritten(ours) }) },
            ],
          }),
        ];
      }
      if (best.kind === "line") {
        const line = best.parts.flatMap((part, i) => [i ? best.glue : "", part.found ? partText(part) : el("mark", { class: "lx-tr-miss", title: t("translate.notFound") }, part.text)]);
        const spoken = best.parts.filter((part) => part.found).map(partText).join(best.glue);
        return [
          translateBest({
            variant: "line",
            ...(toEnglish ? { meaning: line } : { said: line }),
            toEnglish,
            lang: code,
                        speak: toEnglish ? speakText(spoken, "en") : speakText(spoken, code),
            speakLabel: toEnglish ? t("translate.hearIn", { language: languageLabel("en") }) : t("translate.hearIn", { language: name }),
                      }),
        ];
      }
      return [];
    }, next);

    // The next best guesses.
    const single = packBest.kind === "word" || packBest.kind === "same" || packBest.kind === "two";
    let others = nextGuesses(found);
    // A sentence from your packs, what you asked about marked in both languages. For a phrase's word, only that word.
    const askRow = (s, about) => {
      const item = liveItem(s.item, s.source);
      const terms = new Set([...found.words.flatMap((w) => [w.text, w.lemma]), ...(found.from === "en" ? [] : found.query.split(/\s+/))].filter(Boolean).map(fold));
      const clipped = clipAround(s.text, terms);
      const readings = about ? [about] : [...found.words, ...others.filter((o) => !o.sentence)];
      const lemmas = new Set(readings.map((w) => w.lemma).filter(Boolean));
      const here = new Set([...readings.flatMap((w) => [w.text, w.lemma]), ...(item?.words ?? []).filter(([, lemma]) => lemmas.has(lemma)).map(([text]) => text)].filter(Boolean).map(fold));
      const there = new Set([...(found.from === "en" && !about ? found.query.split(/\s+/).map(fold) : []), ...readings.flatMap((w) => glossWords(w.en))].filter(Boolean));
      // A long one (a book's) clipped around what was found; a tap shows it whole.
      const line = clipped ? el("button", { type: "button", class: "lx-tr-clip", "aria-expanded": "false", "aria-label": `${s.text}. Show the whole sentence` }, clipped) : markIn(s.text, here);
      const status = s.studied ? el("span", { class: "lx-tr-studied" }, t("translate.studied")) : null;
      const row = ui.sentenceRow({ text: line, punct: item?.punct ?? "", natural: s.natural ? markIn(s.natural, there) : s.natural, lang: code, status });
      if (clipped) {
        row.setAttribute("data-clipped", "");
        line.addEventListener("click", () => {
          line.replaceWith(s.text);
          row.removeAttribute("data-clipped");
        });
      }
      return row;
    };
    const flat = single || found.both;
    const lists = (found.main ?? []).map((m) => ({ ...m, rows: sentencesFor(m.lemma, found, code) }));
    let flatRows = [];
    if (flat) {
      const seen = new Set();
      const add = (s) => {
        if (seen.has(s.text) || flatRows.length >= 6) return;
        seen.add(s.text);
        flatRows.push(s);
      };
      for (const m of lists) for (const s of m.rows) if (s.studied) add(s);
      for (const s of found.sentences) add(s);
      for (const m of lists) for (const s of m.rows) add(s);
    }
    // Nothing found. "Not in your packs" only once it's really looked: not while packs are on their way or the server's still to answer.
    const nothing = !found.whole && !found.words.length;
    const nothingNodes = !nothing || answer ? [] : [el("p", { class: "lx-tr-none" }, untranslated ? t("translate.noTranslation") : packDownloads() || found.partial || found.pending ? t("translate.notFoundYet") : t("translate.notInYourPacks"))];

    // Every source a result came from, with its credit (a book's carries its author and translator, a shared pack's who shared it).
    const creditLine = found.sources.length ? t("translate.fromSources", { sources: found.sources.map((s) => `${s.name} (${s.credit}${s.license ? `, ${s.license}` : ""})`).join("; ") }) : null;
    // Found online in a pack this device hasn't got: the one case a pack would help (while the word packs are still
    // coming they're on their way). Nothing found online means no pack it searched has it.
    const here = new Set(allPacks().map((pack) => `pack:${pack.id}`));
    const shownSources = [found.whole?.source, ...found.words.map((word) => word.source)].filter(Boolean);
    const missing = found.online && !packDownloads() ? shownSources.find((id) => id.startsWith("pack:") && !here.has(id)) : null;
    // Found only in an open book: it's that book's words, and its license asks for its name.
    const bookSource = shownSources.length && shownSources.every((id) => id.startsWith("book:")) ? found.sources.find((one) => one.id === shownSources[0]) : null;
    const packsWord = bookSource ? t("translate.inTheBook") : t("translate.inYourPacks");
    {
      const sheetTop = (title) => el("h2", { class: "lx-sheet-title" }, title);
      // Every pack and book it drew on, with their credits and licenses, a tap away under the sentences (a book's license asks for its
      // name; spelled out under every answer, a phrase's ran to a wall of words).
      const credits = () => (creditLine ? [el("details", { class: "lx-quiet-more lx-tr-credits" }, el("summary", {}, t("translate.whereFrom")), el("div", { class: "lx-quiet-body" }, el("p", { part: "credit" }, creditLine)))] : []);
      // The other words the packs have for it, under the sentences: words to read, each with its voice.
      const wordRows = () => {
        const here = packBest.kind === "word" ? [packBest.word] : [];
        const words = [...here, ...others.filter((o) => !o.sentence)];
        return words.map((other) => {
          const typed = found.tokens?.[other.at ?? 0];
          return translateResult({ text: asWritten(other), meaning: other.en, lang: code, about: !single && typed ? t("translate.forTyped", { typed }) : null, speak: speakText(other.text, code) });
        });
      };
      // The same letters in the other language, when they mean something there too: a press reads them that way.
      const otherSide = ambiguous?.query === found.query && ambiguous.readings ? (found.from === "en" ? ambiguous.readings[0] : ambiguous.readings[1]) : null;
      const otherRow = () =>
        otherSide
          ? [
              translateResult({
                about: t("translate.asLanguage", { language: found.from === "en" ? name : languageLabel("en") }),
                text: found.from === "en" ? found.query : otherSide.text,
                meaning: found.from === "en" ? otherSide.en : found.query,
                lang: code,
                onPick: () => {
                  way = found.from === "en" ? 2 : 1;
                  field.lxSetWay(shownWay());
                  sheet.lxClose();
                  sayWay(current, { now: true });
                  run({ now: true });
                },
              }),
            ]
          : [];
      const sectionLabel = (words) => el("p", { class: "lx-tr-section" }, words);
      const sentenceNodes = () => {
        if (flat) return flatRows.length ? [el("div", { class: "lx-tr-results" }, flatRows.map((s) => askRow(s)))] : [];
        const words = lists.filter((m) => m.rows.length);
        return words.length ? [el("div", { class: "lx-tr-results" }, words.map((m) => translateWord({ word: lang === code && m.lemma ? shownName(`w:${m.lemma}`) : m.text, lang: code, meaning: m.en, rows: m.rows.slice(0, PHRASE_ROWS).map((s) => askRow(s, m)), restCount: Math.max(0, m.rows.length - PHRASE_ROWS), rest: () => m.rows.slice(PHRASE_ROWS).map((s) => askRow(s, m)) })))] : [];
      };
      const packRows = () => {
        const sentences = [...sentenceNodes(), ...others.filter((o) => o.sentence).map((other) => translateResult({ variant: "sentence", text: typeset(code, other.text), meaning: other.translation, lang: code }))];
        const words = wordRows();
        return [sheetTop(packsWord), ...otherRow(), ...sentences, ...(words.length ? [sentences.length ? sectionLabel(t("translate.otherWords")) : null, ...words].filter(Boolean) : []), ...credits()];
      };
      // A pack with what you typed, found only when you ask: until this press, nothing about it has been looked for.
      const findRows = () => {
        const body = el("div", { class: "lx-tr-found" });
        const language = modelFrom === "en" ? modelTo : modelFrom;
        const search = async () => {
          const waited = setTimeout(() => body.replaceChildren(ui.lookingUp(t("translate.lookingThroughPacks"))), 150);
          const answer = await findPacksHolding(found.query, language);
          clearTimeout(waited);
          if (answer.offline) return body.replaceChildren(ui.emptyState(t("translate.needsConnection"), { pose: "off" }));
          if (answer.failed) return body.replaceChildren(ui.retryLine(t("translate.serverDidntAnswer"), search));
          if (answer.packs.length) return body.replaceChildren(...answer.packs.map((pack) => packRow(pack, language)));
          // Some of this language's packs aren't searchable yet, so it can't say none of them has it.
          if (answer.indexing) return body.replaceChildren(ui.emptyState(t("translate.stillIndexing"), { pose: "page" }), ui.button(t("translate.lookAgain"), { onclick: search }));
          body.replaceChildren(ui.emptyState(t("translate.noPackYet"), { pose: "shrug" }));
        };
        search();
        return [sheetTop(t("translate.packsWith", { query: found.query })), body];
      };
      const packRow = (pack, language) => {
        let added = false;
        const add = ui.button(t("translate.add"), { pressed: "false" });
        const say = () => {
          add.setAttribute("aria-pressed", String(added));
          add.replaceChildren(...(added ? [icon("check"), t("translate.added")] : [t("translate.add")]));
        };
        add.setAttribute("aria-label", t("translate.addPack", { pack: pack.name }));
        add.addEventListener("click", async () => {
          added = !added;
          say();
          try {
            const path = `/api/community/items/${encodeURIComponent(pack.id)}/follow`;
            const done = added ? await followPack(await apiPost(path)) : (await apiDel(path), await unfollowPack(pack.id));
            if (done?.ok === false) throw new Error(done.errors?.[0]?.message);
            run({ now: true });
          } catch {
            added = !added;
            say();
            msg.say(t("translate.didntGoThrough"));
          }
        });
        const line = pack.sentences?.[0];
        const terms = new Set([...found.query.split(/\s+/), ...(pack.words ?? []).map((w) => w.lemma)].filter(Boolean).map(fold));
        return translatePack({ name: pack.name, by: t("translate.packHas", { credit: pack.credit, count: pack.matched }), add, line: line ? markIn(line.text, terms) : null, means: line?.means, lang: language });
      };
      const hasCards = flat ? flatRows.length > 0 : lists.some((m) => m.rows.length);
      const open = (nodes) => () => {
        field.lxInput.blur();
        sheet.lxBody.replaceChildren(...nodes());
        sheet.lxBody.scrollTop = 0;
        sheet.lxOpen();
      };
      // One wide button: what your packs have with this in it, or, when they have nothing, a way to find a pack that does. Offline, or for something long, neither.
      const yourCount = flat ? flatRows.length : lists.reduce((sum, m) => sum + m.rows.length, 0);
      const inYourPacks = !nothing && !missing && (hasCards || wordRows().length > 0);
      const shortEnough = found.query.trim().split(/\s+/).length <= 6;
      // What your packs have with it is under the answer, in place (the sheet's sentences, then the other words and the credits), kept
      // while it says the same so a key that doesn't change it draws nothing again. Only finding a pack, when they have nothing, is a button.
      // This device's answer comes first (pending: the server's to be merged in): for the query already shown, what's under the answer
      // stays as it is until the merged one is in, so a key that changes nothing never draws it twice (the device's, then the merged).
      const inlineKey = `${found.from}:${found.query}`;
      const held = shown.get("inline");
      const holding = found.pending && held?.key === inlineKey;
      if (holding) next.set("inline", held);
      // A new "In your packs" is made right after the frame this key's answer is drawn in (its rows were most of a long task: 33–69 ms of a
      // slowed phone's, 9 Nov 2026): the one before stays under the answer until then, so nothing empties and fills, and a key that changes
      // nothing still draws nothing again (the same signature, the same nodes).
      const inlineSignature = inYourPacks
        ? JSON.stringify([found.query, found.from, flat ? flatRows.map((s) => [s.text, s.studied]) : lists.map((m) => [m.lemma, writtenOf(code, m.lemma), m.rows.map((r) => [r.text, r.studied])]), others.map((o) => [asWritten(o), o.en, Boolean(o.sentence)]), creditLine, packsWord, otherSide?.text ?? null, yourCount])
        : null;
      const makeInline = () => [el("section", { class: "lx-tr-inline", "aria-label": packsWord }, el("h2", { class: "lx-tr-inline-title" }, packsWord), ...packRows().slice(1))];
      const wasInline = shown.get("inline");
      let inline = [];
      let later = null;
      if (holding) inline = held.nodes;
      else if (inYourPacks && wasInline?.signature === inlineSignature) {
        inline = wasInline.nodes;
        next.set("inline", { signature: inlineSignature, nodes: inline, key: inlineKey });
      } else if (inYourPacks) {
        // The one before stays until then (a newer key before then too), under its own query's key: the holding rule above never takes it
        // for another query's.
        if (wasInline) {
          inline = wasInline.nodes;
          next.set("inline", wasInline);
        }
        later = { signature: inlineSignature, key: inlineKey, old: inline };
      }
      const wide = !inYourPacks && !holding && navigator.onLine !== false && shortEnough ? translateWide({ icon: "compass", word: t("translate.findAPack"), onclick: open(findRows) }) : null;
      // What's answering, on the answer's own line, so nothing moves when the translator arrives; and only when it matters, why it's this and not the translator.
      sourceShown = answer ? "model" : nothing ? "none" : "packs";
      setSource(sameWord || packBest.kind === "same" ? t("translate.sameInBoth") : answer || nothing ? null : packBest.kind === "line" ? t("translate.wordByWord") : missing ? t("translate.fromSourceCredit", { source: found.sources.find((one) => one.id === missing)?.name ?? t("translate.aPack"), credit: found.sources.find((one) => one.id === missing)?.credit ?? "Lexicommons" }) : bookSource ? t("translate.fromSourceCredit", { source: bookSource.name, credit: bookSource.credit }) : t("translate.fromYourPacks"));
      const limited = !answer && (nothing || packBest.kind === "line");
      const status =
        answer || !model
          ? null
          : !limited
          ? null
          : model.state === "none"
          ? translateStatus({ words: t("translate.noFullTranslator", { language: languageLabel(model.language) }) })
          : null;
      // While the word packs are still coming, that's the line to say: what's answering may change when they're here.
      const coming = !status && downloadsLine() ? translateStatus({ words: downloadsLine() }) : null;
      // The translator's line, last: its download and its failure whatever the answer; its offer only on a limited one,
      // online, the word packs' line above it while they come (a Download then waits for them); that it came until the next
      // search.
      const offering = model?.state === "offer" && !answer && limited && navigator.onLine !== false;
      sayTranslator(model?.state === "downloading" ? "downloading" : model?.state === "failed" ? "failed" : translatorJustCame && translatorJustCame === model?.language ? "here" : offering ? "offer" : "", model);
      const footKids = [wide, status ?? coming, translatorLine.firstChild ? translatorLine : null].filter(Boolean);
      shown = next;
      reconcile(foot, footKids);
      // The foot (Find a pack, what's answering and why, the translator's own line) is about the answer, so it's right under it; what your
      // packs have comes after.
      reconcile(results, [...bestNodes, ...nothingNodes, ...(footKids.length ? [foot] : []), ...inline]);
      answerFor(found.query);
      placeInFrame();
      if (later) {
        const drawn = [...results.childNodes];
        requestAnimationFrame(() =>
          setTimeout(() => {
            // Drawn again since, emptied (cleared, looking, listening) or anything else put there: that one's own.
            if (shown !== next || results.childNodes.length !== drawn.length || drawn.some((child, i) => results.childNodes[i] !== child)) return;
            const nodes = makeInline();
            reconcile(results, [...drawn.filter((child) => !later.old.includes(child)), ...nodes]);
            shown.set("inline", { signature: later.signature, nodes, key: later.key });
            placeInFrame();
          }, 0),
        );
      }
    }
  }

  // ---------- typing ----------

  function run({ now = false, forced = null } = {}) {
    const mine = ++seq;
    const keyAt = performance.now();
    // Swap's answer belongs to one query: a new one has none until its own is drawn.
    lastAnswer = null;
    if (!now) translatorJustCame = null;
    controller?.abort();
    controller = new AbortController();
    clearTimeout(lookTimer);
    msg.say("");
    const query = text.trim();
    // The background slices wait while this key's answer is found and drawn (know/slices.js holdSlices: 300 ms at most).
    letGo?.();
    letGo = query ? holdSlices() : null;
    // "Nothing found" is about what was typed before: gone at once (what was found stays until its next is drawn).
    if (current && !current.whole && !current.words.length && sourceShown !== "model") {
      current = null;
      shown = new Map();
      results.replaceChildren();
      answerFor(null);
    }
    if (!query) {
      current = null;
      sourceShown = null;
      shown = new Map();
      sayWorking(null);
      results.replaceChildren();
      answerFor(null);
      return;
    }
    const draw = (found) => {
      if (mine !== seq || !found) return;
      // A word that could be either language: the likeliest reading (the language you were last in), with the other under the wide button or a press on the other flag. The bubble is always on one.
      if (!forced && way === 0 && found.both && found.reading !== "same") {
        ambiguous = { query: found.query, readings: found.readings ?? null, firstGuesses: found.firstGuesses ?? null };
        return run({ now: true, forced: lastFrom === "en" ? { from: "en", to: lang } : { from: lang, to: "en" } });
      }
      // What the language says comes first among its other words stays, whichever way it's read.
      if (forced && ambiguous?.query === found.query && ambiguous.firstGuesses) found.firstGuesses = ambiguous.firstGuesses;
      // Nothing, with a key just pressed: a word half typed. Said once they've stopped.
      const held = !now && !found.whole && !found.words.length ? NOTHING_WAIT - (performance.now() - lastKey) : 0;
      if (held > 0) return void setTimeout(() => draw(found), held);
      current = found;
      shownAt = keyAt;
      // The server's answer while this device's index is still being made: the device's own come in when it's ready.
      node.toggleAttribute("data-indexing", Boolean(found.indexing));
      // Tinta, if it's up, measured where it stands before the answer is drawn over it (sayWorking moves it out from there).
      const leavingBoxes = looking?.node?.isConnected && motion.motionOn() ? { from: looking.node.getBoundingClientRect(), within: scroller.getBoundingClientRect(), scrollTop: scroller.scrollTop } : null;
      drawFound(found);
      clearTimeout(lookTimer);
      sayWorking(null, leavingBoxes);
      letGo?.();
      letGo = null;
    };
    // Nothing yet after a moment: what's there is out of date, and Tinta says it's looking.
    lookTimer = setTimeout(() => {
      if (mine !== seq) return;
      // The translator's last answer stays up while the next is found: no blank, no Tinta, between letters.
      if (sourceShown === "model") return;
      results.replaceChildren();
      answerFor(null);
      shown = new Map();
      current = null;
      sayWorking("nothing");
    }, LOOK_AFTER);
    translate(text, forced ?? direction(), { onLocal: draw, pauseOnline: now ? 0 : ONLINE_PAUSE, signal: controller.signal, stale: true }).then(draw, (error) => {
      if (mine !== seq || controller?.signal.aborted) return;
      clearTimeout(lookTimer);
      sayWorking(null);
      results.replaceChildren(el("p", { class: "lx-small" }, error.message));
      answerFor(query);
      letGo?.();
      letGo = null;
    });
  }

  // ---------- dictation ----------

  const micStatus = el("p", { class: "lx-small lx-muted", role: "status" });
  const offerRow = el("div", { class: "lx-tr-offer" });
  const otherRow = el("div", { class: "lx-tr-listen-in" });
  const voiceRow = el("div", { class: "lx-tr-voice" }, micStatus, otherRow, offerRow);
  let dictatedWay = false;
  // Recognizers that failed outright on this visit: the next press tries another (a phone's browser's recognizer is tried again: it has no other).
  const refused = [];
  let heardIn = (() => {
    try {
      return localStorage.getItem(HEARD_IN) === "en" ? "en" : lang;
    } catch {
      return lang;
    }
  })();
  const canDetect = () => way === 0;
  // Only Whisper can tell the languages apart, and only ones it knows.
  const detects = (choice) => canDetect() && choice.engine === "whisper" && choice.api.whisperKnows(learningLocale());
  const listenCode = () => (way === 1 ? "en" : way === 2 ? lang : heardIn);
  const say = (said, language) => {
    way = language === "en" ? 1 : 2;
    dictatedWay = true;
    field.lxSetWay(shownWay());
    text = said;
    keep(said);
    field.lxSetValue(said);
    run({ now: true });
  };
  // What Whisper wrote in each language: the one it scores best per word, counting how many of its words this device knows
  // (Whisper alone leans hard to English on a short word: ../docs/design/translate-v2/dictation.md). The other is one tap away.
  const OTHER_WITHIN = 0.6;
  const heard = async (result) => {
    otherRow.replaceChildren();
    const said = String(result?.heard ?? "").trim();
    if (!said) return msg.say(t("translate.heardNothing"));
    if (!result.written?.length) return say(said, result.language ?? (way === 1 ? "en" : way === 2 ? lang : heardIn));
    const scored = await Promise.all(result.written.map(async (one) => ({ ...one, score: one.mean + (await knownShare(one.text, one.language)) })));
    scored.sort((a, b) => b.score - a.score);
    const [best, other] = scored;
    say(best.text, best.language);
    // Only when it's a real rival: forced into the wrong language, Whisper writes nonsense it isn't sure of.
    if (other?.text && other.text.toLowerCase() !== best.text.toLowerCase() && best.score - other.score < OTHER_WITHIN) {
      otherRow.replaceChildren(
        ui.button(t("translate.orIn", { language: languageLabel(other.language), words: other.text }), {
          size: "sm",
          onclick: () => {
            otherRow.replaceChildren();
            say(other.text, other.language);
          },
        }),
      );
    }
  };
  /** The first press where nothing can listen yet: Whisper's download, with its size, right here. Not now leaves typing as it was. */
  const offerDownload = (choice) => {
    const notNow = () => offerRow.replaceChildren();
    const start = async () => {
      const bar = ui.downloadBar({ label: t("translate.whisper.downloading") });
      const stopping = new AbortController();
      offerRow.replaceChildren(bar, el("div", { class: "lx-inline-form" }, ui.button(t("translate.whisper.stop"), { size: "sm", onclick: () => stopping.abort() })));
      try {
        await choice.api.downloadModel(choice.model, { signal: stopping.signal, onProgress: ({ have, total }) => total && bar.set(have / total) });
        bar.done();
        offerRow.replaceChildren(el("p", { class: "lx-small", role: "status" }, t("translate.whisper.here")));
      } catch (error) {
        bar.stop();
        if (stopping.signal.aborted) return notNow();
        offerRow.replaceChildren(ui.retryLine(error.message ?? t("translate.whisper.failed"), start));
      }
    };
    offerRow.replaceChildren(
      el("p", { class: "lx-small" }, t("translate.whisper.offer", { size: choice.api.megabytes(choice.bytes) })),
      el("div", { class: "lx-inline-form" }, ui.button(t("translate.whisper.download"), { icon: "download", onclick: start }), ui.button(t("translate.whisper.notNow"), { variant: "fade", onclick: notNow })),
    );
  };
  const listening = microphone({
    mic: null,
    status: micStatus,
    choose: (locale) => chooseDictation(locale, { refused }),
    locale: () => LANGUAGES[listenCode()]?.locale ?? learningLocale(),
    detect: (choice) => (detects(choice) ? ["en", lang] : null),
    onListen: (choice) => {
      if (choice.whisperStopped) msg.say(t("translate.whisper.stoppedLastTime"), "wrong");
      // A recognizer that can't tell: the bubble says which language it's listening in, and a press on the other flag changes it.
      if (way === 0 && !detects(choice)) bar.lxFrom(heardIn);
    },
    onEnd: () => {
      sayWay(current);
    },
    onResult: (result, choice) => {
      // A phone's memory goes back before the translating: Whisper there is for this phrase, and it loads again for the next.
      if (choice.engine === "whisper" && onPhone()) choice.api.unload();
      heard(result).catch((error) => msg.say(error.message, "wrong"));
    },
    onError: (line, reason, choice) => {
      if (reason === "download") return offerDownload(choice);
      // It failed outright: the next press tries the other one, where there is one and it's for this device to use.
      const outright = ["unsupported", "failed", "model-failed"].includes(reason);
      const other = outright && !(onPhone() && choice?.engine === "browser") ? { browser: t("translate.otherRecognizer.whisper"), whisper: t("translate.otherRecognizer.browser") }[choice?.engine] : null;
      if (other) refused.push(choice.engine);
      msg.say(other ? t("translate.tryOther", { line, other }) : line, "wrong");
    },
  });
  const mic = ui.micButton({
    size: "sm",
    label: t("translate.speakToTranslate"),
    words: { listening: t("translate.listen.stop"), hearing: t("translate.listen.stop"), thinking: t("translate.listen.working"), loading: t("translate.listen.wait"), asking: t("translate.listen.allow") },
    onclick: () => {
      msg.say("");
      otherRow.replaceChildren();
      setOpen(true, { byPage: true });
      // A way the last phrase set was for that phrase: this one can be in either language again.
      if (!listening.listening) forgetDictatedWay();
      listening.press();
    },
  });
  // Take: while it listens, the answer's place says so, large, with your voice in bars.
  const largeListen = translateListening();
  const showListen = (on) => {
    if (!largeListen) return;
    largeListen.lxReset();
    if (on) {
      largeListen.lxSay(way === 0 && listenCode() ? t("translate.listen.inLanguage", { language: languageLabel(listenCode()) }) : t("translate.listen.ready"));
      results.replaceChildren();
      answerFor(null);
      shown = new Map();
      current = null;
      top.replaceChildren(largeListen);
    } else if (largeListen.isConnected) top.replaceChildren();
  };
  listening.mic = !largeListen ? mic : {
    lxState: (state) => {
      mic.lxState(state);
      showListen(state === "listening" || state === "hearing");
    },
    lxLevel: (level) => {
      mic.lxLevel(level);
      largeListen.lxLevel(level);
    },
  };

  const field = translateField({
    ...shownWay(),
    mic,
    onFocus: () => {
      prepareTranslate();
      // A finger or a click in the field on Home: the page, at once, with nothing typed. (Focus by a key, Tab, doesn't move the page: typing does.)
      if (!open && performance.now() - pressedAt < 1500) setOpen(true, { byPage: true });
    },
    onInput: (value, { now }) => {
      text = value;
      lastKey = performance.now();
      otherRow.replaceChildren();
      keep(value);
      if (value.trim()) {
        setOpen(true, { byPage: true });
        run({ now });
      } else if (open) {
        // Deleted to nothing: the page stays, empty, for the next word. Back is the way home.
        run({ now });
      }
    },
    onClear: () => {
      text = "";
      keep("");
      forgetDictatedWay();
      otherRow.replaceChildren();
      field.lxSetValue("");
      run({ now: true });
      // The page stays, empty, the keys up for what's next. Back is the way home.
      field.lxInput.focus();
    },
    onLabel: () => pickFor(sayingFrom() ?? lang, field.querySelector(".lx-tr-lang")),
    onSwap: () => {
      // The way the page shows (sayWay's: the way chosen, else the language you were last in, the translator's reading too).
      const now = sayingFrom();
      way = now === "en" ? 2 : 1;
      dictatedWay = false;
      field.lxFlip(way === 2);
      // The swap moves the answer up and translates it back. (A flag at the foot says what you typed is in that language, and leaves the words alone.)
      if (lastAnswer) {
        text = lastAnswer;
        keep(text);
        field.lxSetValue(text);
      }
      field.lxSetWay(shownWay());
      sayWay(current, { now: true });
      run({ now: true });
    },
    onWay: () => {
      way = (way + 1) % 3;
      dictatedWay = false;
      field.lxSetWay(shownWay());
      run({ now: true });
    },
  });
  field.lxInput.addEventListener("pointerdown", () => (pressedAt = performance.now()), { passive: true });
  // A way dictation set lasts for what was said.
  function forgetDictatedWay() {
    if (!dictatedWay) return;
    dictatedWay = false;
    way = 0;
    field.lxSetWay(shownWay());
  }
  // The bar. The same microphone moves into it on the page and back into the box on Home.
  const bar = translateBar({
        ends,
        onPick: (code) => {
          const target = code === "en" ? 1 : 2;
          // Pressing the flag you're on: another language for that side.
          if (!listening.listening && code === sayingFrom()) return pickFor(code, bar);
          if (listening.listening) {
            heardIn = code;
            try {
              localStorage.setItem(HEARD_IN, code);
            } catch {
              // Private browsing: it lasts for this visit.
            }
            bar.lxFrom(code);
            listening.restart();
            return;
          }
          way = target;
          dictatedWay = false;
          field.lxSetWay(shownWay());
          sayWay(current, { now: true });
          run({ now: true });
        },
      });
  field.lxInput.addEventListener("input", () => sizeText());
  field.lxInput.addEventListener("scroll", () => edgeOfText(), { passive: true });
  const toLabel = el("button", { class: "lx-tr-lang lx-tr-lang-to", type: "button" });
  const toFlags = ui.steadyFlags(ends.map((end) => end.code));
  const sheet = ui.sheetLayer({ label: t("translate.inYourPacks") });
  const sourceLabel = el("span", { class: "lx-tr-source" });
  let sourceShown = null;
  const setSource = (words) => {
    sourceLabel.textContent = words ?? "";
    sourceLabel.hidden = !words;
  };
  // The answer's language and where it's from, one row: where it's from goes under the language, at the end, when there's no room beside it
  // (320 wide with text at twice its size), never cut (translate.css .lx-tr-head).
  scroller.prepend(el("div", { class: "lx-tr-head" }, toLabel, sourceLabel));
  setSource(null);
  // The language under the bite: a press there, too, chooses another.
  toLabel.addEventListener("click", () => pickFor(toLabel.dataset.code, toLabel));
  toLabel.addEventListener("mousedown", (event) => event.preventDefault());
  const node = el("section", { class: "lx-today-translate", "aria-label": t("translate.pageLabel") }, field, voiceRow, scroller, bar, sheet);
  // On a computer (1024 px and up, translate.css) the swap sits in the language bar, between the two languages: the row reads language,
  // swap, language, speak, by eye and by keys, and the box is a plain box. Narrower, it's in the bite at the box's foot, where it was built.
  const swapButton = field.querySelector(":scope > .lx-tr-swap");
  const swapHome = swapButton?.nextSibling ?? null;
  const barWide = globalThis.matchMedia?.("(min-width: 1024px)");
  const seatSwap = () => {
    if (!swapButton || !bar) return;
    if (barWide?.matches) {
      if (swapButton.parentElement !== bar) bar.insertBefore(swapButton, bar.querySelector('.lx-way-tab[data-at="1"]'));
    } else if (swapButton.parentElement !== field) field.insertBefore(swapButton, swapHome?.parentElement === field ? swapHome : null);
  };
  seatSwap();
  barWide?.addEventListener?.("change", seatSwap);
  let lastAnswer = null;
  let lastFrom = "en"; // the language you were last in: where the bubble is when nothing else says
  let ambiguous = null; // { query, readings }: what was typed could be either language
  const placeMic = () => {
    if (!bar) return;
    if (open) {
      bar.append(mic);
    } else field.querySelector(".lx-tr-controls").append(mic);
  };
  // Which way it went: the bubble (take b) or the labels (take c) say so.
  let wayTimer = null;
  function sayWay(found, { now = false } = {}) {
    const nothing = found && !found.whole && !found.words.length;
    if (found && !found.both && !nothing && !way) lastFrom = found.from;
    const code = way === 1 ? "en" : way === 2 ? lang : lastFrom;
    if (bar) {
      clearTimeout(wayTimer);
      // Typing, it settles once the word does: it doesn't jump on every letter.
      if (way || !found || now) bar.lxFrom(code);
      else wayTimer = setTimeout(() => bar.lxFrom(code), 220);
    }
    {
      const name = (one) => ({ code: one, name: languageLabel(one) });
      field.lxSetFrom(code ? [name(code)] : ends);
      if (code) {
        const to = code === "en" ? lang : "en";
        toLabel.dataset.code = to;
        toLabel.replaceChildren(...[toFlags(to), languageLabel(to)].filter(Boolean));
      } else toLabel.replaceChildren();
    }
  }
  sayWay(null);
  // Which language the first side is right now, if that's settled.
  function sayingFrom() {
    return way === 1 ? "en" : way === 2 ? lang : lastFrom;
  }
  // ---------- choosing a language ----------
  let known = null;
  const loadKnown = () => translateLanguages().then((list) => (known = list), () => null);
  const wheelItems = () => {
    const server = known ? new Map(known.map((item) => [item.code, item])) : null;
    const all = [{ code: "en", name: languageLabel("en"), offline: true }, ...Object.keys(LANGUAGES).filter((code) => code !== "en" && (!server || server.has(code))).map((code) => ({ code, name: languageLabel(code), offline: server ? server.get(code).offline : undefined }))];
    // Offline, a language with nothing on this device has nothing to search; online, every one can be asked.
    const online = navigator.onLine !== false;
    return all.map((item) => ({ ...item, offline: online ? true : item.offline })).sort((a, b) => a.name.localeCompare(b.name));
  };
  let picker = null;
  function pickFor(shownCode, from = null) {
    if (picker?.isConnected) return;
    picker = languagePicker({ items: wheelItems(), current: shownCode, anchor: from?.getBoundingClientRect() ?? null, onDone: (code) => chooseLanguage(shownCode, code) });
    if (!known) loadKnown().then(() => picker?.isConnected && picker.lxSetItems(wheelItems()));
  }
  // Everything goes through English: a pair is English and one other language. A language chosen for either side makes that pair, on that side.
  function chooseLanguage(was, code) {
    if (code === was) return;
    const from = sayingFrom() ?? "en";
    const wasFrom = was === from;
    if (code !== "en") {
      lang = code;
      ends = [ends[0], { code, name: languageLabel(code) }];
      try {
        localStorage.setItem("lx.translate.language", code);
      } catch {
        // Private browsing: it lasts for this visit.
      }
      bar?.lxSetEnds(ends);
      way = wasFrom ? 2 : 1;
      if (heardIn !== "en") heardIn = code;
    } else way = wasFrom ? 1 : 2;
    dictatedWay = false;
    field.lxSetWay(shownWay());
    sayWay(current, { now: true });
    run({ now: true });
  }
  // ---------- where the box sits ----------
  // Low enough to reach, with nothing below it to make room for. The top stays put: only when what's here would be covered does it rise, and only as far as it must.
  // The screen is split in two: the box fills the top half, from just under the header to the bite, and the answer has the rest. The box's top never moves, and neither does the
  // text in it: when the keys come up the bite rises, as far as keeps a one-line answer above the bar and no further. Long text scrolls inside the box; nothing below moves for it.
  const ONE_BOX = 112; // the smallest the box gets
  const LINE_ROOM = 126; // the box (with UNDER_HEADER) one typed line of the largest text fits with the usual spacing
  // The box is the same size with the keys up or down: the size they leave room for. Measured the first time they're up
  // (kept for next time); until then a phone's keys are taken as about 43% of its screen (an iPhone's, with its bar, is
  // 362 of 844). A computer has no keys to make room for: there the box takes half the room.
  const KEYS_ROOM = "lx.translate.keys-room";
  let keysRoom = (() => {
    try {
      return Number(localStorage.getItem(KEYS_ROOM)) || 0;
    } catch {
      return 0;
    }
  })();
  const touchKeys = () => globalThis.matchMedia?.("(pointer: coarse)").matches ?? false;
  const BELOW = 126; // from the box's foot to the foot of a one-line answer
  const MORE_ROW = 69;
  const UNDER_HEADER = 8;
  // With the keys up and too little room for a one-line answer under the smallest box (an iPhone SE, 375 × 667, keys of 304–320 px: the
  // floating bar covered half of "I drink coffee." and its speaker, 7 Nov 2026), the answer comes up into the room above it (data-snug,
  // translate.css: the scroll's top padding 30 → 8 px, the gap under the answer's language 12 → 4), its language level with the swap button.
  const SNUG = 30;
  let split = -1;
  let tween = 0;
  let tweenId = 0;
  let tweenTicker = null;
  // Inline styles written only when they change: written again the same, they restyle what's under them (a custom property is inherited)
  // and the next read lays the page out again, on every key (7 Nov 2026).
  const setStyle = (target, name, value) => {
    if (target.style.getPropertyValue(name) !== value) target.style.setProperty(name, value);
  };
  const setSplit = (value) => setStyle(field, "height", `${Math.round(value - UNDER_HEADER)}px`);
  // A tablet or wider (700 px and up, as translate.css has it) splits nothing: the box is as tall as its text, and the answer under it has the
  // room an iPad's keys leave (at 820 the split left ~300 px of empty box, 8 Nov 2026), so there's no split to keep, nor keys to make room for.
  // From 1024 px (the sidebar's) the language bar sits in the page under the answer; on a tablet it floats at the foot as on a phone, over the
  // keys while typing (translate.css).
  const sized = globalThis.matchMedia?.("(min-width: 700px)");
  function placeWide() {
    ++tweenId;
    cancelAnimationFrame(tween);
    tweenTicker?.finish?.();
    tweenTicker = null;
    split = -1;
    if (field.style.getPropertyValue("height")) field.style.removeProperty("height");
    for (const name of ["data-floor", "data-snug", "data-tight"]) if (node.hasAttribute(name)) node.removeAttribute(name);
    setStyle(node, "--tr-drop", `${UNDER_HEADER}px`);
    sizeText();
  }
  function place() {
    if (!open) return;
    if (sized?.matches) return placeWide();
    const barTop = bar?.offsetWidth ? bar.getBoundingClientRect().top : node.getBoundingClientRect().bottom;
    const room = barTop - node.getBoundingClientRect().top;
    const keys = document.documentElement.hasAttribute("data-keyboard");
    if (keys && Math.abs(room - keysRoom) > 1) {
      keysRoom = Math.round(room);
      try {
        localStorage.setItem(KEYS_ROOM, String(keysRoom));
      } catch {
        // Private browsing: measured again next visit.
      }
    }
    const roomWithKeys = keys ? room : keysRoom || (touchKeys() ? room - Math.round(innerHeight * 0.43) : 0);
    const snug = keys && room - BELOW - 12 < ONE_BOX;
    if (node.hasAttribute("data-snug") !== snug) node.toggleAttribute("data-snug", snug);
    const below = snug ? BELOW - SNUG : BELOW;
    const next = Math.round(Math.max(ONE_BOX, roomWithKeys ? Math.min(roomWithKeys - below - 12, room - below - 12) : Math.min(room / 2, room - below - 12)));
    // Too short for a line of the largest text with its usual spacing (the field is the box less 72 px, a 30 px line takes 45.5), the box
    // makes the room from its own spacing (translate.css data-floor: 62 px, a line taking 41.5 there).
    const floor = next < LINE_ROOM;
    if (node.hasAttribute("data-floor") !== floor) node.toggleAttribute("data-floor", floor);
    setStyle(node, "--tr-drop", `${UNDER_HEADER}px`);
    const moving = split >= 0 && Math.abs(next - split) > 1 && motion.motionOn();
    const from = split;
    // Already on its way there: leave it going. Everything that calls this (a key, a redraw, the keyboard's own events) comes through here.
    const onItsWay = next === split && tweenTicker;
    split = next;
    if (!onItsWay) {
    cancelAnimationFrame(tween);
    const mine = ++tweenId;
    tweenTicker?.finish?.();
    tweenTicker = null;
    if (!moving) setSplit(next);
    else {
      // It follows the keyboard, moving on its own for a moment: nothing waits for it, and any press finishes it where it's going.
      const started = performance.now();
      tweenTicker = motion.registerTicker(() => {
        if (mine !== tweenId) return;
        cancelAnimationFrame(tween);
        setSplit(next);
        tweenTicker = null;
      });
      const step = (now) => {
        if (mine !== tweenId) return;
        const t = Math.min(1, (now - started) / motion.duration("--dur-320", 260));
        setSplit(from + (next - from) * (1 - (1 - t) ** 3));
        if (t < 1) tween = requestAnimationFrame(step);
        else tweenTicker?.finish?.();
      };
      if (tweenTicker) tween = requestAnimationFrame(step);
    }
    }
    // With the keys up there may be no room for the button: it comes back with the keys down.
    const row = results.querySelector(".lx-tr-foot");
    const shownRow = row?.offsetHeight ? row.offsetHeight + 18 : 0;
    const answer = results.scrollHeight - shownRow;
    const top = node.getBoundingClientRect().top + UNDER_HEADER + next - UNDER_HEADER + 70;
    node.toggleAttribute("data-tight", Boolean(keys && row && top + answer + MORE_ROW > barTop));
    sizeText();
  }
  // The words as large as they can be: short ones fill the box, long ones fit more in it.
  function sizeText() {
    const length = field.lxInput.value.length;
    // Written only when it changes: the same size again would have the next read lay the page out for nothing.
    const size = length <= 24 ? "s" : length <= 90 ? "m" : "l";
    if (field.dataset.len !== size) field.dataset.len = size;
    edgeOfText();
  }
  // Words still out of sight below fade out at the box's foot, rather than being cut through.
  function edgeOfText() {
    const input = field.lxInput;
    field.toggleAttribute("data-more-below", input.scrollHeight - input.clientHeight - input.scrollTop > 2);
  }
  // A new answer placed in its frame's own rendering, after that frame's layout and before its paint: placed at once, its reads laid the new
  // answer out inside the message that brought it (34 ms of a slowed phone's 50, 7 Nov 2026). A ResizeObserver's first notice of the page
  // comes in that same frame, so no frame shows the answer unplaced; several answers in a frame are placed once.
  const placeWatch = new ResizeObserver(() => {
    placeWatch.disconnect();
    place();
  });
  const placeInFrame = () => {
    placeWatch.disconnect();
    placeWatch.observe(node);
  };
  addEventListener("resize", place);
  globalThis.visualViewport?.addEventListener("resize", place);
  const keyboardWatch = new MutationObserver(place);
  keyboardWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-keyboard"] });
  const fieldWatch = new ResizeObserver(place);
  fieldWatch.observe(field);
  // The page just opened: placed, and the field's move drawn, in this frame's own rendering, after its layout and before its paint, as a new
  // answer is (placeInFrame). Placed in the focus that opened it, place()'s reads laid the opened page out three times inside that task: 41 of
  // its 58–68 ms of CPU at 4× (8 Nov 2026). The page itself still opens in the focus: on an iPhone the frame right after it is the last before
  // the keyboard's ~200 ms, and opened in the next animation frame it showed with the keys, 190–240 ms after the tap (the iOS Simulator). A
  // ResizeObserver's first notice comes in the frame it's asked in, so no frame shows the page unplaced or the field without its ghost.
  // opening: { from, flying } (flying null: no ghost, after a swipe).
  let opening = null;
  const openWatch = new ResizeObserver(() => {
    openWatch.disconnect();
    const was = opening;
    opening = null;
    if (!was || !open) return;
    place();
    if (was.flying !== null) motion.fly(field, was.from, { ghostOf: el("div", { class: "lx-tr-ghost" }, field.lxInput.value), duration: was.flying });
  });

  /**
   * Opens or closes the page. The state changes first, in this moment, with the field already where it ends up; a ghost
   * draws its move (motion.fly). byPage: the page did it (the first key, cleared), so the shell follows; else the shell
   * did (the route), and on leaving, what was typed goes.
   */
  function setOpen(on, { byPage = false, still = false } = {}) {
    if (on === open) return;
    // What's read before anything is written: read after, each laid the page out again (the ghost's duration, a style, 20 ms at 4×).
    const from = field.getBoundingClientRect();
    const flying = still ? 0 : motion.duration("--dur-200", 200);
    if (on) {
      if (byPage) onChange?.(true);
      open = true;
      // Held while it's open: the index's worker stays for its idle (translate.js holdTranslateIndex).
      leaveIndex ??= holdTranslateIndex();
      host.setAttribute("data-translating", "");
      node.setAttribute("data-open", "");
      placeMic();
      sayWay(current);
      loadKnown();
      split = -1;
      opening = { from, flying: still ? null : flying };
      openWatch.disconnect();
      openWatch.observe(node);
      // The route opened it (a reload): what was typed comes back.
      if (!byPage && !text) {
        try {
          text = sessionStorage.getItem(KEPT) ?? "";
        } catch {
          text = "";
        }
        field.lxSetValue(text);
        if (text.trim()) run({ now: true });
        else queueMicrotask(() => (location.hash = "#today"));
      }
    } else {
      open = false;
      opening = null;
      openWatch.disconnect();
      // Left: the index's worker goes in a minute unless something holds it again (translate.js; its index is kept on the device).
      leaveIndex?.();
      leaveIndex = null;
      // The box goes back to its one line: the height it's given here is only for this page.
      tweenId++;
      cancelAnimationFrame(tween);
      const going = tweenTicker;
      tweenTicker = null;
      going?.finish?.();
      field.style.removeProperty("height");
      host.removeAttribute("data-translating");
      node.removeAttribute("data-open");
      placeMic();
      way = 0;
      lastAnswer = null;
      ambiguous = null;
      setSource(null);
      field.lxSetSpeak(null);
      field.lxFlip(false);
      field.lxSetWay(shownWay());
      if (!byPage) {
        // Left by Back or the phone's back: Today as it was, an empty box and no keyboard.
        listening.cancel();
        offerRow.replaceChildren();
        otherRow.replaceChildren();
        forgetDictatedWay();
        text = "";
        keep("");
        field.lxSetValue("");
        run({ now: true });
        field.lxInput.blur();
      }
      if (byPage) onChange?.(false);
    }
    // The ghost is a plain box with the words: no second field or controls in the page, even for a moment. After a swipe back the swipe drew
    // the move, and the field is already where the picture under the finger had it.
    if (!on && !still) motion.fly(field, from, { ghostOf: el("div", { class: "lx-tr-ghost" }, field.lxInput.value), duration: flying });
  }

  // The speech module ahead of the first press: on an iPhone the microphone's audio has to start inside the press itself.
  setTimeout(() => speechApi(), 1500);

  // While packs download: said; once they're here, or a newer index is, the search again on what's on this device.
  let wasDownloading = Boolean(packDownloads());
  const stops = [
    onTranslatorChange(() => {
      if (open && current) drawFound(current);
    }),
    // A word's written form decided again (study/written.js: a new view's packs, a book noted or forgotten): what's shown drawn again, so an
    // answer saying "engels" becomes "Engels" with no key pressed. Only the parts whose words changed are redrawn (drawFound's signatures).
    onWritten(() => {
      if (open && current) drawFound(current);
    }),
    onPackDownloads((d) => {
      if (!open) return;
      sayWorking(looking ? "nothing" : null);
      if (current) drawFound(current);
      if (wasDownloading && !d && text.trim()) run({ now: true });
      wasDownloading = Boolean(d);
    }),
    onTranslateIndex(() => {
      if (open && text.trim()) run({ now: !current?.pending });
    }),
    // While this device's index is still being made, the server's answers as they come back (translate.js coldAsk: at most one in
    // COLD_EVERY while typing goes on): one to the start of what's typed now, typed after what's shown, is drawn the moment it's here, in
    // place, so the screen keeps up with the typing. The key's own answer comes through run() (its translate() is handed it too). A half
    // typed phrase's "nothing" says nothing, and a word read both ways waits for the key's own (run picks the reading).
    onColdAnswer((found) => {
      if (!open || found.at <= shownAt) return;
      const query = text.trim().slice(0, TRANSLATE_LIMITS.query);
      if (!query || found.query === query || !query.startsWith(found.query)) return;
      if ((!found.whole && !found.words.length) || (found.both && found.reading !== "same")) return;
      const want = direction();
      if (want.from ? found.from !== want.from || found.to !== want.to : found.from !== lang && found.to !== lang) return;
      current = found;
      shownAt = found.at;
      node.toggleAttribute("data-indexing", true);
      drawFound(found);
      sayWorking(null);
    }),
  ];

  return {
    node,
    setOpen: (on, options) => setOpen(on, { still: Boolean(options?.still) }),
    dispose: () => {
      seq++;
      letGo?.();
      letGo = null;
      inView.disconnect();
      leaveIndex?.();
      leaveIndex = null;
      controller?.abort();
      clearTimeout(lookTimer);
      // A page that's gone keeps nothing listening: rebuilt with each change of language, they piled up.
      removeEventListener("resize", place);
      globalThis.visualViewport?.removeEventListener("resize", place);
      barWide?.removeEventListener?.("change", seatSwap);
      keyboardWatch.disconnect();
      fieldWatch.disconnect();
      placeWatch.disconnect();
      listening.cancel();
      for (const stop of stops) stop();
    },
  };
}
