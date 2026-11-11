// Lexicommons components as DOM builders. Every screen builds its UI from these, so the markup, the data-part
// names (the theming surface, parts.js), the meaning icons and the motion stay the same everywhere. All text goes in
// as text. Motion goes through motion.js, so none of it can block a press (see its rules).

import { signInButtonMarkup } from "./brands.js";
import { flagOf } from "../lang/flags.js";
import { englishEnd, typeset, withoutAccents } from "../lang/index.js";
import { englishOrderTexts, flipsOrder } from "./literal-case.js";
import { LANGUAGES } from "../lang/index.js";
import { readingKind, rubyOf, rubyText, vowelled } from "../lang/readings.js";
import { icon, MEANING_ICON } from "./icons.js";
import { symbol, SYMBOL_NAMES } from "./symbols.js";
import * as motion from "./motion.js";
import { bidiRuns, dirFor, setLang } from "./bidi.js";
import { t } from "./i18n.js";
import { first, kindOf } from "../character/firsts.js";

// The language being learned and the one it's learned from, for the lang attribute on the learned language's text and
// the order switch's labels. The app sets it (shell/main.js, from study/learning.js); a builder given a lang uses that.
const target = { code: "nl", name: LANGUAGES.nl.name, fromCode: "en", fromName: LANGUAGES.en.name };
export function setTargetLanguage(code, name, fromCode = "en", fromName = LANGUAGES[fromCode]?.name ?? fromCode) {
  Object.assign(target, { code, name, fromCode, fromName });
}
/** The language being learned, as set: { code, name, fromCode, fromName } (other builders' defaults). */
export const targetLanguage = () => ({ ...target });

// ---------- words of the language being learned ----------

// A word given to a builder is its text, or { text, reading, hidden? } in a language that shows readings (Japanese,
// Chinese): the reading sits over the word's kanji or characters (lang/readings.js rubyOf). Arabic and Hebrew show
// the word itself with its vowel marks (vowelled), and a word you know well as written. hidden: a word you know well (progress.js
// readingHides: its read strength Strong), whose reading keeps its place but doesn't show until a tap shows it again (showReading). A word's element carries its text
// in data-word, so the reading never counts as part of the word.
const wordText = (word) => (typeof word === "string" ? word : typeof word?.text === "string" ? word.text : "");
function wordNodes(word, lang = target.code) {
  if (typeof word === "string" || !word?.reading) return [wordText(word)];
  // The word with its vowel marks, and as written beside it, shown in their turn (the marks are no wider than a line).
  // Never through rubyText: the marked word is the word itself, not an annotation over it.
  if (readingKind(lang) === "vowels") {
    return [el("span", { class: "lx-word" }, el("span", { part: "reading", variant: "vowels", state: word.hidden ? "hidden" : undefined }, vowelled(lang, word.text, word.reading)), el("span", { class: "lx-bare" }, word.text))];
  }
  // One inline piece, so a word with its reading lays out as one thing inside a chip or a tile.
  return [el("span", { class: "lx-word" }, rubyOf(lang, word.text, word.reading).map(([piece, reading]) => (reading ? el("ruby", {}, piece, el("rt", { part: "reading", state: word.hidden ? "hidden" : undefined }, rubyText(reading))) : piece)))];
}
/**
 * A word of the language as a label shows it (a chip, a list's row, a heading): with its reading ({ text, reading, lang },
 * as wordNodes draws it) in an isolate of its own language, so it reads in its own direction inside English. Text is
 * returned as it is.
 */
export function wordLabel(word, lang = target.code) {
  if (typeof word === "string" || !word || typeof word !== "object") return word;
  return el("bdi", { lang: word.lang ?? lang }, ...wordNodes(word, word.lang ?? lang));
}
/**
 * A run of a language's own text quoted inside English (a rule's words), its forms with a reading drawn with it, never hidden: [{ text,
 * reading? }], joined as one isolate of the language. Each reading's ruby sits straight beside the kana around it, in no box of its own, so
 * a reading wider than its kanji hangs over the kana either side as a sentence's does (私は, not 私 は): Chromium won't hang a reading out
 * of an isolate, nor WebKit out of a box, so a label per form (wordLabel) would push its neighbours away. Vowel marks are drawn as a
 * word's are (wordNodes): they're on the word, not over it. It stays on one line where it fits (components.css .lx-quote).
 */
export function quotedText(runs, lang = target.code) {
  const vowels = readingKind(lang) === "vowels";
  const pieces = runs.flatMap((run) =>
    !run.reading ? [run.text] : vowels ? wordNodes(run, lang) : rubyOf(lang, run.text, run.reading).map(([piece, reading]) => (reading ? el("ruby", {}, piece, el("rt", { part: "reading" }, rubyText(reading))) : piece)),
  );
  // A word joiner at the end of the text before a ruby: Chromium ends a line there even under keep-all (を | 飲みます), WebKit doesn't. In
  // that text's own node, the reading still hangs back over its kana (a node of its own stops it in Chromium).
  for (let i = 1; i < pieces.length; i++) if (pieces[i] instanceof Node && pieces[i].nodeName === "RUBY" && typeof pieces[i - 1] === "string") pieces[i - 1] += "\u2060";
  return el("bdi", { lang, class: "lx-quote" }, pieces);
}
/** The word an element holds (its data-word, else its text). */
const wordOf = (node) => node.dataset.word ?? node.textContent;
/** Shows the readings over a word again, where they were hidden (a word you know, tapped). */
export function showReading(node) {
  for (const reading of node.querySelectorAll('[data-part="reading"][data-state="hidden"]')) setState(reading, null);
}
// A language written without spaces (Japanese, Chinese) joins its words with nothing: lines of its words are "joined".
const isJoined = (lang = target.code) => LANGUAGES[lang]?.separator === "";
const space = (lang) => (isJoined(lang) ? null : " ");

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "part") node.setAttribute("data-part", value);
    else if (key === "state") node.setAttribute("data-state", value);
    else if (key === "meaning") node.setAttribute("data-meaning", value);
    else if (key === "variant") node.setAttribute("data-variant", value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  // Text in a right-to-left language runs right to left (lx/bidi.js); the rest of the interface never mirrors.
  if (typeof attrs.lang === "string" && attrs.dir === undefined) {
    const dir = dirFor(attrs.lang);
    if (dir) node.setAttribute("dir", dir);
  }
  return node;
}

/** English text that may quote a right-to-left language, as nodes: each right-to-left run isolated in a <bdi>. */
export const bidiText = (text) => bidiRuns(text).map((run) => (run.rtl ? el("bdi", {}, run.text) : run.text));

const setState = (node, state) => (state ? node.setAttribute("data-state", state) : node.removeAttribute("data-state"));

// A small deterministic shuffle, so a game's order is stable for the same content (and testable).
function seededShuffle(items, seedText) {
  let seed = [...seedText].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
  const next = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const MEANING_WORD = { right: "core.badge.right", wrong: "core.badge.wrong", slipping: "core.badge.slipping", new: "core.badge.new", hint: "core.badge.hint", moved: "core.badge.moved" };

export function badge(meaning, text = MEANING_WORD[meaning] ? t(MEANING_WORD[meaning]) : undefined) {
  return el("span", { part: "badge", meaning }, icon(MEANING_ICON[meaning]), text);
}

/** A word, phrase or pattern as a chip, with its meaning's icon; lang: its text's language (a word's or a phrase's). */
export function conceptTag(text, meaning, { lang } = {}) {
  // English naming a right-to-left language's words keeps each quoted run in its own order ("יש, אין", not "אין ,יש").
  // A tag can be pieces: a word of the language with its reading ({ text, reading, lang }: content.js shownName, drawn
  // by wordLabel) and English beside it (a word's gloss).
  const piece = (part) =>
    typeof part === "string" ? (!dirFor(lang) ? bidiText(part) : part) : part && typeof part === "object" && !(part instanceof Node) ? wordLabel(part, lang) : part;
  const shown = Array.isArray(text) ? text.map(piece) : piece(text);
  // The words are one box beside the icon, so a long tag wraps as a line of text (its runs aren't each a column).
  return el("span", { part: "concept-tag", meaning, lang }, meaning ? icon(MEANING_ICON[meaning]) : null, el("span", {}, shown));
}

export function button(text, { variant = "gray", size, block, icon: iconName, onclick, pressed, type = "button" } = {}) {
  return el(
    "button",
    { part: "button", variant, "data-size": size, "data-block": block, type, onclick, "aria-pressed": pressed },
    iconName ? icon(iconName) : null,
    text,
  );
}

/**
 * A way to sign in (part sign-in-button): way is google, github or passkey, label defaults to "Continue with …". The
 * same markup the server's sign-in pages use (brands.js); its mark and label are fixed strings or escaped.
 */
export function signInButton(way, { label, onclick, type = "button", disabled } = {}) {
  const holder = document.createElement("div");
  holder.innerHTML = signInButtonMarkup(way, { label, type });
  const button = /** @type {HTMLButtonElement} */ (holder.firstElementChild);
  if (onclick) button.addEventListener("click", onclick);
  if (disabled) button.disabled = true;
  return button;
}

export function iconButton(iconName, label, { onclick, state } = {}) {
  return el("button", { part: "icon-button", type: "button", "aria-label": label, title: label, state, onclick }, icon(iconName));
}

/**
 * Plays something aloud. speak({ onWord }) starts it and returns { stop(), done } (null when there's nothing to play);
 * pressing again stops it. The button is "playing" until it ends. onWord(i) reports the word being spoken (-1: none),
 * so a line can light up its words. button.lxPlay() starts it from code (a card's sentence playing by itself).
 */
export function speakButton(speak, { label = t("core.playAloud"), onWord, text } = {}) {
  let playing = null;
  const node = el("button", { part: "speak-button", type: "button", "aria-label": label, title: label, "aria-pressed": "false" }, SYMBOL_NAMES.includes("speaker") ? symbol("speaker", { size: 24 }) : icon("speaker"), text ? el("span", {}, text) : null);
  const start = () => {
    const ctl = speak({ onWord });
    if (!ctl) return;
    playing = ctl;
    setState(node, "playing");
    node.setAttribute("aria-pressed", "true");
    ctl.done.then(() => {
      if (playing !== ctl) return;
      playing = null;
      setState(node, null);
      node.setAttribute("aria-pressed", "false");
    });
  };
  node.addEventListener("click", () => (playing ? playing.stop() : start()));
  node.lxPlay = () => {
    if (!playing) start();
  };
  return node;
}

/**
 * The speaking game's button: wide and easy to reach, "Tap to speak" with the microphone. data-state follows the
 * listening: asking (for the microphone) · loading (the speech model) · listening · hearing (speech has started) ·
 * thinking; none when ready. While it listens, a row of bars inside it follows your voice (button.lxLevel(0..1), the
 * newest on the right); the button itself never moves. button.lxState(state) sets the state and its words.
 * size "sm": a compact round button with only the microphone (and its bars while listening), for tight places.
 */
/**
 * Whether a control is past the room it has: its content wider than it, or it wider than the box it sits in (the nearest ancestor it doesn't
 * size itself: a box that shrinks to fit it is passed over), so it would push past a card or the screen.
 */
export function pastItsRoom(node) {
  if (node.scrollWidth > node.clientWidth + 1) return true;
  const own = node.getBoundingClientRect();
  let room = node.parentElement;
  while (room && room !== document.body && Math.abs(room.getBoundingClientRect().width - own.width) < 1) room = room.parentElement;
  if (!room) return false;
  const box = room.getBoundingClientRect();
  const css = getComputedStyle(room);
  const left = box.left + parseFloat(css.borderLeftWidth) + parseFloat(css.paddingLeft);
  const right = box.right - parseFloat(css.borderRightWidth) - parseFloat(css.paddingRight);
  return own.right > right + 1 || own.left < left - 1;
}

/**
 * Keeps a control's words on one line in any language. When they don't fit the room the control has, it steps through levels (data-fit 1…levels
 * on the node; each a rule in components.css that gives the words more room: an icon or the mic's bars out of their way, then a size smaller),
 * and only if the last still won't do, lets them wrap (data-fit="wrap"): never cut off. Worked out again when its room changes (its width
 * changing other than by its own fit), and by the function it returns (call it when the words change, which keeps the level it has: for one
 * room the level only rises, so a control doesn't rearrange from one of its states to the next). overflows(): whether its words don't fit as
 * it's drawn now (default: pastItsRoom).
 */
export function fitLine(node, { levels = 2, overflows = () => pastItsRoom(node) } = {}) {
  let level = 0;
  let fitted = -1;
  const set = () => (level ? node.setAttribute("data-fit", level > levels ? "wrap" : String(level)) : node.removeAttribute("data-fit"));
  const refit = () => {
    if (!node.isConnected || !node.clientWidth) return;
    set();
    while (level <= levels && overflows()) {
      level++;
      set();
    }
    fitted = node.getBoundingClientRect().width;
  };
  new ResizeObserver(() => {
    if (Math.abs(node.getBoundingClientRect().width - fitted) < 0.5) return;
    level = 0;
    refit();
  }).observe(node);
  return refit;
}

export function micButton({ onclick, label = t("core.tapToSpeak"), size, words = null } = {}) {
  const BARS = 22;
  const WORDS = { asking: t("core.mic.asking"), loading: t("core.mic.loading"), listening: t("core.mic.listening"), hearing: t("core.mic.listening"), thinking: t("core.mic.checking") };
  const LABELS = { asking: t("core.micLabel.asking"), loading: t("core.micLabel.loading"), listening: t("core.micLabel.listening"), hearing: t("core.micLabel.listening"), thinking: t("core.micLabel.thinking") };
  const text = el("span", { class: "lx-mic-label" }, label);
  const bars = el("span", { class: "lx-mic-bars", "aria-hidden": "true" }, Array.from({ length: BARS }, () => el("i")));
  const node = el("button", { part: "mic-button", type: "button", "data-size": size, "aria-label": label, title: label, onclick }, size === "sm" ? symbol("mic", { size: 24 }) : icon("mic"), text, bars);
  // Its words on one line in every language and state: the bars give up room first (the oldest go), and once fewer than about ten would show,
  // they go under the words (1); then the words take a size smaller, four times (2–5, down to 12px). The words can wrap (so the button never grows past its
  // room), and their lines are what's tested. The round one has no words.
  const lines = () => {
    if (!text.firstChild) return 0;
    const range = document.createRange();
    range.selectNodeContents(text);
    return new Set([...range.getClientRects()].filter((r) => r.width > 1).map((r) => Math.round(r.top))).size;
  };
  const refit = size === "sm" ? () => {} : fitLine(node, { levels: 5, overflows: () => lines() > 1 || pastItsRoom(node) || (bars.offsetParent !== null && bars.clientWidth < 64) });
  const levels = new Array(BARS).fill(0);
  let last = 0;
  const draw = () => [...bars.children].forEach((bar, i) => bar.style.setProperty("--h", levels[i].toFixed(3)));
  node.lxState = (state) => {
    setState(node, state);
    text.textContent = words?.[state] ?? WORDS[state] ?? label;
    node.setAttribute("aria-label", LABELS[state] ?? label);
    refit();
    if (state !== "listening" && state !== "hearing") {
      levels.fill(0);
      draw();
    }
  };
  // A new bar about every 50 ms, so the row reads as your voice over the last second.
  node.lxLevel = (level) => {
    const value = Math.max(0, Math.min(1, level));
    const now = performance.now();
    if (now - last >= 50) {
      levels.shift();
      levels.push(value);
      last = now;
    } else levels[BARS - 1] = Math.max(levels[BARS - 1], value);
    draw();
  };
  return node;
}

const SAID = { right: "core.said.right", close: "core.said.close", order: "core.said.order", wrong: "core.said.wrong", missing: "core.said.missing", "left-out": "core.said.leftOut" };

/**
 * What you said against the sentence, word by word: each word right · close · order (right word, wrong place) · wrong
 * · missing, told apart by color and by its line (solid, dotted, highlighter, wavy, struck through). words = [{ text,
 * result }].
 */
export function saidLine(words, { lang = target.code } = {}) {
  return el(
    "p",
    { part: "said-line", lang, variant: isJoined(lang) ? "joined" : undefined },
    words.flatMap((word, i) => [i ? space(lang) : null, el("span", { part: "said-word", state: word.result, title: SAID[word.result] ? t(SAID[word.result]) : undefined }, word.text)]),
  );
}

/**
 * What you typed against the sentence (Type it), as you typed it: each word in your own spelling with how it went (right · close · order ·
 * wrong), a word you left out at its place, quiet (left-out: the sentence's word, never struck through), and words that match nothing after
 * them. An answer that shares nothing with the sentence is shown as typed and wrong, with none of the sentence's words (8 Nov 2026: "Fout"
 * for "Het boek is goed." struck the right sentence's words through, as if they were the mistake). result: speech/match.js's.
 */
export function typedLine(result, typed, { lang = target.code } = {}) {
  const word = (text, state) => el("span", { part: "said-word", state, title: SAID[state] ? t(SAID[state]) : undefined }, text);
  const shares = result.words.some((one) => one.result === "right" || one.result === "close" || one.result === "order");
  // Each word as you typed it: the matcher hears a plainer form (small letters; no accents when forgiving), so the typed word it came from,
  // taken in turn (a language written without spaces keeps what the matcher heard).
  const ends = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
  const loose = (text) => withoutAccents(String(text).normalize("NFC")).toLocaleLowerCase().replace(ends, "");
  const tokens = isJoined(lang) ? [] : String(typed ?? "").trim().split(/\s+/).filter(Boolean);
  const used = new Set();
  const asTyped = (heard) => {
    const at = tokens.findIndex((token, i) => !used.has(i) && loose(token) === loose(heard));
    if (at < 0) return heard;
    used.add(at);
    return tokens[at].replace(ends, "");
  };
  const parts = shares
    ? [
        ...result.words.map((one) => (one.result === "missing" ? word(one.text, "left-out") : word(typeof one.heard === "string" && one.heard ? asTyped(one.heard) : one.text, one.result))),
        ...(result.extra ?? []).map((text) => word(asTyped(text), "wrong")),
      ]
    : [word(String(typed ?? "").trim(), "wrong")];
  return el("p", { part: "said-line", lang, variant: isJoined(lang) ? "joined" : undefined }, parts.flatMap((part, i) => [i ? space(lang) : null, part]));
}

/**
 * A sentence in the language being learned, with a speak button in front; each word lights up as it's spoken. words =
 * [word] (text, or { text, reading, hidden }); a tap on a word shows its reading.
 */
export function spokenLine(words, speak, { lang = target.code, label = t("core.playSentence") } = {}) {
  const spans = words.map((word, at) => el("span", { part: "spoken-word", "data-word": wordText(word), "data-at": at, onclick: (event) => showReading(event.currentTarget) }, wordNodes(word, lang)));
  const light = (index) => spans.forEach((span, i) => (i === index ? span.setAttribute("data-speaking", "") : span.removeAttribute("data-speaking")));
  const button = speak ? speakButton(speak, { label, onWord: light }) : null;
  const line = el("p", { part: "spoken-line", lang, variant: isJoined(lang) ? "joined" : undefined }, button, el("span", { class: "lx-spoken-text" }, spans.flatMap((span, i) => (i && space(lang) ? [space(lang), span] : [span]))));
  line.lxPlay = () => button?.lxPlay();
  line.lxButton = button;
  return line;
}

export function segmented(options, value, onchange, label) {
  const group = el("div", { part: "segmented", role: "group", "aria-label": label });
  for (const [optionValue, optionLabel] of options) {
    group.append(
      el(
        "button",
        {
          part: "segment",
          type: "button",
          "aria-pressed": String(optionValue === value),
          onclick: (event) => {
            for (const b of group.children) b.setAttribute("aria-pressed", String(b === event.currentTarget));
            onchange(optionValue);
          },
        },
        optionLabel,
      ),
    );
  }
  return group;
}

export function feedback(meaning, title, text) {
  const node = el(
    "div",
    { part: "feedback", meaning, role: "status" },
    icon(MEANING_ICON[meaning] ?? "sparkle"),
    el("span", { part: "feedback-title" }, title),
    text ? el("span", { part: "feedback-text" }, text) : null,
  );
  return node;
}

/** Animates a feedback box arriving: it appears, and its icon is drawn. */
export function animateFeedback(node) {
  motion.appear(node);
  motion.draw(node.querySelector(".lx-icon"), { delay: motion.duration("--dur-150", 150) });
}

// ---------- the literal (Dutch-order) line ----------

/**
 * The literal line: English words in Dutch order, moved ones marked. item = { literal: [{ text, moved }], punct,
 * english }. `english` lists chunk indexes in English order; with it the line can switch between the two orders
 * (line.lxSetOrder("english" | "dutch")), each word sliding to its new place, and line.lxMorph() shows it in English
 * order and then slides it into Dutch order. name and lang: the language's, for the labels and the line's direction (the
 * one being learned unless said).
 */
export function literalLine(item, { part = "literal-line", hidden, name = target.name, lang = target.code } = {}) {
  // In a right-to-left language's order the line runs right to left, under its sentence, each English chunk left to
  // right inside it; in English order it runs left to right.
  const rtl = dirFor(lang) === "rtl";
  const chunks = item.literal.map((chunk, i) => el("span", { part: "literal-chunk", state: chunk.moved ? "moved" : undefined, "data-i": i, dir: rtl ? "ltr" : undefined }, chunk.text));
  // The full stop stays at the end of the line in either order, so it's its own piece.
  // The line is English: a space the learned language puts before its end mark (French: typeset) isn't English, and
  // nor is the mark itself when the language has its own (Greek ;, Hindi ।, Japanese 。: lang/index.js englishEnd), and
  // an Armenian question (its ՞ inside a word) ends with ? (the sentence: item.words, or item.text).
  const said = Array.isArray(item.words) && item.words.length ? item.words.map(wordText).join(" ") : item.text;
  const punct = item.punct ? el("span", { class: "lx-punct" }, englishEnd(lang, item.punct.replace(/^[\s\u00a0\u202f]+/u, ""), said)) : null;
  const line = el("p", { part, state: hidden ? "hidden" : undefined, "data-order": "dutch", dir: rtl ? "rtl" : undefined, "aria-label": t("core.inOrder", { language: name }) }, chunks, punct);
  // Only a line whose chunks really change places: every order toggle and morph on it follows this.
  const canFlip = flipsOrder(item.english) && item.english.length === chunks.length;
  line.lxCanFlip = canFlip;
  line.lxSetOrder = (order, { animate = true, delay = 0 } = {}) => {
    if ((order === "english" && !canFlip) || line.getAttribute("data-order") === order) return;
    const sequence = [...(order === "english" ? item.english.map((i) => chunks[i]) : chunks), ...(punct ? [punct] : [])];
    // The capital goes with whichever chunk leads (literal-case.js); back in the language's order, as written.
    const texts = order === "english" ? englishOrderTexts(item.literal, item.english, item.natural) : item.literal.map((chunk) => chunk.text);
    chunks.forEach((chunk, i) => chunk.textContent !== texts[i] && (chunk.textContent = texts[i]));
    line.setAttribute("data-order", order);
    line.setAttribute("aria-label", t("core.inOrder", { language: order === "english" ? target.fromName : name }));
    // A right-to-left line turns as it changes order, after the words' old places are measured (motion.reorder).
    const turn = () => rtl && line.setAttribute("dir", order === "english" ? "ltr" : "rtl");
    const visible = getComputedStyle(line).display !== "none";
    if (!animate || !visible) {
      turn();
      line.append(...sequence);
    } else {
      motion.reorder(line, sequence, { delay, arc: (chunk) => chunk.getAttribute("data-state") === "moved", change: turn });
      // The highlighter goes on as the moved words land in Dutch order, and comes off as they leave it.
      for (const chunk of chunks) {
        if (chunk.getAttribute("data-state") !== "moved") continue;
        if (order === "dutch") {
          motion.animate(chunk, [{ backgroundSize: "0% 100%" }, { backgroundSize: "100% 100%" }], {
            duration: motion.duration("--dur-320", 320),
            delay: delay + motion.duration("--dur-640", 640) * 0.55,
          });
        } else motion.animate(chunk, [{ backgroundSize: "100% 100%" }, { backgroundSize: "0% 100%" }], { duration: motion.duration("--dur-200", 200) });
      }
    }
    line.dispatchEvent(new CustomEvent("lx-order", { detail: order }));
  };
  line.lxMorph = () => {
    if (!canFlip || getComputedStyle(line).display === "none") return;
    line.lxSetOrder("english", { animate: false });
    line.lxSetOrder("dutch", { delay: motion.duration("--dur-320", 320) });
  };
  return line;
}

/**
 * The toggle that flips a literal line between Dutch and English order: one small switch, pressed anywhere to flip,
 * so the same spot flips it back. Its thumb sits under NL in Dutch order and EN in English order (aria-pressed: true
 * in English order). lang and name: the language's (the one being learned unless said).
 */
export function orderSwitch(line, { lang = target.code, name = target.name } = {}) {
  const english = () => line.getAttribute("data-order") === "english";
  const toggle = el(
    "button",
    {
      part: "order-toggle",
      type: "button",
      class: "lx-order-switch",
      "aria-label": t("core.orderSwitch", { language: target.fromName }),
      "aria-pressed": String(english()),
      title: t("core.orderFlip", { language: name, from: target.fromName }),
      onclick: () => line.lxSetOrder(english() ? "dutch" : "english"),
    },
    el("span", { class: "lx-order-thumb", "aria-hidden": "true" }),
    el("span", { class: "lx-order-label", lang, "aria-hidden": "true" }, lang.toUpperCase()),
    el("span", { class: "lx-order-label", "aria-hidden": "true" }, target.fromCode.toUpperCase()),
  );
  line.addEventListener("lx-order", () => toggle.setAttribute("aria-pressed", String(english())));
  return toggle;
}

/**
 * What a word means, on one line: "ben (zijn): to be; his, its". said: the word as shown; lemma: its dictionary form, when
 * that's something else, so a form's meaning always says which word it is; reading: over said, in a language that
 * shows them. The word in an isolate of its own language, so it reads in its own direction inside English.
 */
export function wordMeaning({ said, lemma, gloss, reading }, { lang = target.code, state } = {}) {
  const word = el("bdi", { lang }, el("strong", {}, ...wordNodes(reading ? { text: said, reading } : said, lang)), lemma ? ` (${lemma})` : null);
  return el("p", { part: "word-meaning", state }, word, ": ", el("span", {}, gloss));
}

// The word-popover showing now: one at a time, and any press anywhere closes it (and still does what it presses: the
// popover itself takes no presses, so it never stands in the way of what's under it).
let closePopover = null;
/** Shows a word's meaning by the word (anchor) inside host, which must be positioned. Returns a function that closes it. */
export function wordPopover(host, anchor, meaning) {
  closeWordPopover();
  const node = el("div", { part: "word-popover", role: "status" }, meaning);
  host.append(node);
  const box = host.getBoundingClientRect();
  const at = anchor.getBoundingClientRect();
  const margin = 12;
  const left = Math.min(Math.max(margin, at.left - box.left + at.width / 2 - node.offsetWidth / 2), box.width - node.offsetWidth - margin);
  const above = at.top - box.top - node.offsetHeight - 10;
  node.style.setProperty("left", `${Math.max(margin, left)}px`);
  node.style.setProperty("top", `${above >= margin ? above : at.bottom - box.top + 10}px`);
  motion.appear(node);
  const close = () => {
    document.removeEventListener("pointerdown", close, true);
    removeEventListener("keydown", close, true);
    node.remove();
    if (closePopover === close) closePopover = null;
  };
  document.addEventListener("pointerdown", close, true);
  addEventListener("keydown", close, true);
  closePopover = close;
  return close;
}
/** Closes the word's meaning showing now, if one is. */
export function closeWordPopover() {
  closePopover?.();
}

/**
 * A sentence as a study card shows it, each word a button. words: [{ text, state, reading, readingHidden, word }]. onWord(word,
 * node) for a press; without it, a press marks the word missed (onMiss(word, missed), as /design shows it).
 */
export function targetLine(words, { lang = target.code, onWord, onMiss } = {}) {
  return el(
    "p",
    { part: "target-line", lang, variant: isJoined(lang) ? "joined" : undefined },
    words.map((word, at) =>
      el(
        "button",
        {
          part: "target-word",
          type: "button",
          state: word.state,
          "data-word": word.text,
          "data-at": at,
          "aria-pressed": onWord ? undefined : String(word.state === "missed"),
          onclick: (event) => {
            const pressed = event.currentTarget;
            // A word you don't know: its reading shows again (and stays).
            if (onWord) {
              showReading(pressed);
              onWord(word, pressed);
              return;
            }
            const missed = pressed.getAttribute("data-state") !== "missed";
            setState(pressed, missed ? "missed" : word.state && word.state !== "missed" ? word.state : null);
            pressed.setAttribute("aria-pressed", String(missed));
            if (missed) showReading(pressed);
            if (missed) motion.pop(pressed);
            onMiss?.(word, missed);
          },
        },
        wordNodes({ text: word.text, reading: word.reading, hidden: word.readingHidden }, lang),
      ),
    ),
  );
}

/**
 * A study card: the sentence (each word a button: onWord(word, node), else a press marks it missed), the literal line, and
 * natural English. One word can be the one it's about (state "target"), with its meaning shown on reveal.
 * item = { tags: [[text, meaning]], words: [{ text, state }], literal, punct, english, natural, meaning? (a node) }
 * reveal: "button" hides the meaning behind a "Show meaning" button; "external" hides it with no button (a session's
 * card, revealed from its answer bar). card.lxReveal() reveals from outside.
 * literal (Settings → Study → Study cards): { show, start: slide · dutch · english, flip, position: below · above,
 * natural }. audio: speak({ onWord }) → { stop(), done } (see speakButton); with it the card has a speak button, and
 * card.lxPlay() plays the sentence.
 */
export function studyCard(item, { state, onMiss, onWord, reveal, audio, literal: options = {}, lang = target.code } = {}) {
  const { show = true, start = "slide", flip = true, position = "below", natural: showNatural = true } = options;
  // The words light up as they're spoken.
  const light = (index) => [...words.children].forEach((word, i) => (i === index ? word.setAttribute("data-speaking", "") : word.removeAttribute("data-speaking")));
  const speakControl = typeof audio === "function" ? speakButton(audio, { label: t("core.playSentence"), onWord: light }) : null;
  const card = el("article", { part: "study-card", state, "data-literal": show ? position : "off", "aria-label": t("core.studyCard") });
  const natural = el("p", { part: "natural-line", state: "hidden" }, item.natural);
  const literal = literalLine(item, { hidden: Boolean(reveal) || !show, lang });
  const words = targetLine(item.words, { lang, onWord, onMiss });
  const flipControl = show && flip && literal.lxCanFlip ? orderSwitch(literal) : null;
  const naturalToggle = button(t("core.naturalLine", { language: target.fromName }), {
    variant: "fade",
    size: "sm",
    icon: "eye",
    onclick: (event) => {
      const hidden = natural.getAttribute("data-state") === "hidden";
      setState(natural, hidden ? null : "hidden");
      event.currentTarget.setAttribute("aria-pressed", String(hidden));
      if (hidden) motion.appear(natural);
    },
  });
  // Its words on one line in a long language on a small phone: its icon goes, then its padding tightens, then the words take a size smaller.
  fitLine(naturalToggle, { levels: 3 });
  const actions = el("div", { part: "card-actions" });
  card.lxRevealed = !reveal;
  card.lxReveal = () => {
    if (card.lxRevealed) return;
    card.lxRevealed = true;
    if (item.meaning) {
      setState(item.meaning, null);
      motion.appear(item.meaning);
    }
    if (show) {
      setState(literal, null);
      if (start === "english") literal.lxSetOrder("english", { animate: false });
      else if (start === "slide") literal.lxMorph();
      motion.appear(literal, { rise: 0 });
    }
    if (showNatural) {
      setState(natural, null);
      motion.appear(natural, { delay: motion.duration("--dur-320", 320) });
    }
    actions.replaceChildren(...[flipControl, showNatural ? null : naturalToggle].filter(Boolean));
  };
  if (reveal === "button") actions.append(button(t("core.showMeaning"), { variant: "white", icon: "eye", onclick: card.lxReveal }));
  else if (!reveal) actions.append(...[flipControl, naturalToggle].filter(Boolean));
  card.append(
    el(
      "div",
      { part: "card-meta" },
      el("div", {}, item.tags.map(([text, meaning, lang]) => conceptTag(text, meaning, { lang }))),
      speakControl,
    ),
    ...[words, item.meaning, literal, natural, actions].filter(Boolean),
  );
  card.lxLiteral = literal;
  card.lxPlay = () => speakControl?.lxPlay();
  return card;
}

// ---------- games: each reports through its callback; a game is answered once ----------

/** Multiple choice. onAnswer({ correct, picked }). */
export function choiceList(options, correctIndex, { onAnswer, lang = target.code } = {}) {
  // data-keys: its buttons are what the number keys pick, in order (study/session.js); with a mouse each shows its number (components.css).
  const list = el("div", { part: "choice-list", role: "group", "data-keys": "" });
  let answered = false;
  options.forEach((text, index) => {
    list.append(
      el(
        "button",
        {
          part: "choice",
          type: "button",
          lang,
          onclick: () => {
            if (answered) return;
            answered = true;
            const choices = [...list.children];
            choices.forEach((choice, i) => setState(choice, i === correctIndex ? "right" : i === index ? "wrong" : "dimmed"));
            const correct = index === correctIndex;
            if (correct) motion.pop(choices[index]);
            else motion.shake(choices[index]);
            motion.draw(choices[correctIndex].querySelector(".lx-icon"));
            if (!correct) motion.draw(choices[index].querySelector(".lx-icon"));
            onAnswer?.({ correct, picked: index });
          },
        },
        el("span", {}, typeof text === "string" ? text : wordLabel(text, lang)),
        icon(index === correctIndex ? "check" : "cross"),
      ),
    );
  });
  list.lxPick = (index) => list.children[index]?.click();
  return list;
}

/**
 * Which one is it? Up to 4 cards, each a drawing with its words under it, or its words alone when there's no drawing: [{ label, picture? }]. A
 * drawing fills its card, clipped to its corners; right and wrong are the card's edge and mark, since a drawing's own colors are fixed. picture: { src, alt }.
 */
const MIN_PICTURES_WIDTH = 200; // px: two pictures a thumb can still tell apart
export function pictureChoices(options, correctIndex, { onAnswer, lang = null } = {}) {
  const grid = el("div", { part: "picture-choices", role: "group", "data-keys": "", "data-count": options.length, "data-kind": options.every((one) => one.picture) ? "pictures" : "words" });
  let answered = false;
  options.forEach((option, index) => {
    grid.append(
      el(
        "button",
        {
          part: "picture-choice",
          type: "button",
          lang,
          onclick: () => {
            if (answered) return;
            answered = true;
            const cards = [...grid.children];
            cards.forEach((card, i) => setState(card, i === correctIndex ? "right" : i === index ? "wrong" : "dimmed"));
            const correct = index === correctIndex;
            if (correct) motion.pop(cards[index]);
            else motion.shake(cards[index]);
            onAnswer?.({ correct, picked: index });
          },
        },
        option.picture ? el("span", { part: "picture-choice-art" }, option.picture) : null,
        el("span", { part: "picture-choice-label" }, option.label),
        icon(index === correctIndex ? "check" : "cross"),
      ),
    );
  });
  grid.lxPick = (index) => grid.children[index]?.click();
  // The pictures take the room there is: on a short or wide screen the grid narrows until it's clear of the bar, centered. A session
  // calls this as it fits a step (session.js).
  grid.setAttribute("data-reserves", "");
  grid.lxReserve = () => {
    grid.style.removeProperty("width");
    const scroller = grid.closest('[data-part="activity"]');
    const art = grid.querySelector('[data-part="picture-choice-art"]');
    if (!scroller || !art) return;
    const over = scroller.scrollHeight - scroller.clientHeight;
    if (over <= 0) return;
    const pictures = Math.ceil(options.length / 2) * art.getBoundingClientRect().height;
    if (!pictures) return;
    const width = grid.getBoundingClientRect().width;
    grid.style.setProperty("width", `${Math.max(MIN_PICTURES_WIDTH, Math.floor((width * (pictures - over)) / pictures))}px`);
  };
  return grid;
}

/**
 * Put words in order: tap a tile to place it and tap a placed tile to send it back, or drag a tile to where it goes
 * (from the bank, or along your order); then Check. A wrong answer shows the right order (arrange-key), each tile
 * traveling there from where you put it. `moved` marks the words Dutch moves. A tile that isn't in `answer` is a
 * stray: it belongs nowhere, so a right answer leaves it in the bank. lang: the tiles' language (English chunks can be
 * put into Dutch order too); order: the language whose order the answer is in (the one being learned unless said).
 * also: other orders that are right too (a sentence's word-for-word English beside its natural one); a wrong answer shows `answer`.
 * onCheck({ correct, placed, also }) (also: true when it matched one of `also`). onPlace(word) as each tile goes into your order, tapped or
 * dragged there; onReturn(word) as one goes back.
 */
export function arrange(tiles, answer, { onCheck, onPlace, onReturn, moved = [], also = [], lang = target.code, order = target.code, checkButton: withCheck = true } = {}) {
  // The rows run in the order's direction (a right-to-left language's from the right), and an English tile in them
  // still reads left to right.
  const rtl = dirFor(order) === "rtl";
  const rowDir = rtl ? "rtl" : undefined;
  const tileDir = rtl && dirFor(lang) !== "rtl" ? "ltr" : undefined;
  const container = el("div", { part: "arrange" });
  const answerRow = el("div", { part: "arrange-answer", dir: rowDir, "aria-label": t("core.arrange.yours") });
  const bank = el("div", { part: "arrange-bank", dir: rowDir, "aria-label": t("core.arrange.bank") });
  let checked = false;
  let dragged = false; // the click that ends a drag isn't a tap
  const tapped = () => {
    if (!dragged) return true;
    dragged = false;
    return false;
  };
  const placedTiles = () => [...answerRow.children].filter((t) => !t.hasAttribute("data-drop"));

  const sendBack = (placed, leaving = placed.getBoundingClientRect()) => {
    onReturn?.(wordOf(placed));
    motion.glide(placedTiles().filter((t) => t !== placed), () => placed.remove());
    setState(placed.lxSource, null);
    motion.fly(placed.lxSource, leaving, { arc: 14 });
  };
  const makePlaced = (source) => {
    const placed = el("button", { part: "tile", type: "button", lang, dir: tileDir, "data-word": wordOf(source) }, [...source.childNodes].map((node) => node.cloneNode(true)));
    placed.lxSource = source;
    placed.addEventListener("click", () => {
      if (checked || !tapped()) return;
      sendBack(placed);
    });
    draggable(placed);
    return placed;
  };
  const place = (source, index = placedTiles().length, from = source.getBoundingClientRect()) => {
    if (checked || source.getAttribute("data-state") === "used") return;
    const placed = makePlaced(source);
    motion.glide(placedTiles(), () => answerRow.insertBefore(placed, placedTiles()[index] ?? null));
    setState(source, "used");
    motion.fly(placed, from, { arc: 18 });
    // A tile going into your order, tapped or dropped (a session says it: Settings → Voices → Words you tap). Going back says nothing.
    onPlace?.(wordOf(source));
  };

  // Dragging: a copy follows the finger while your order makes room where it would land.
  const near = (rect, x, y, pad) => x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad;
  const indexAt = (x, y, others) => {
    for (let i = 0; i < others.length; i++) {
      const r = others[i].getBoundingClientRect();
      // Before this tile: a line above it, or on its line short of its middle (from the right, right to left).
      if (y < r.top - 6 || (y <= r.bottom + 6 && (rtl ? x > r.right - r.width / 2 : x < r.left + r.width / 2))) return i;
    }
    return others.length;
  };
  // Each pointer is followed on its own, so another finger down doesn't move this one's drag. A finger rolling a little is still a
  // press (the click comes, by motion.js if the browser won't send it).
  const TAP_TRAVEL = 12; // as motion.js: past it, it's a drag
  function draggable(tile) {
    tile.addEventListener("pointerdown", (down) => {
      if (checked || down.button !== 0 || tile.getAttribute("data-state") === "used") return;
      const fromBank = tile.parentElement === bank;
      const start = { x: down.clientX, y: down.clientY };
      const rect = tile.getBoundingClientRect();
      const mine = (event) => event.pointerId === down.pointerId;
      let ghost = null;
      let drop = null; // where a bank tile would land, in your order
      const move = (event) => {
        if (!mine(event)) return;
        if (!ghost) {
          if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < TAP_TRAVEL) return;
          // It lifts from where it is, without a jump to catch up with the finger.
          start.x = event.clientX;
          start.y = event.clientY;
          ghost = motion.ghostOf(tile, rect);
          ghost.setAttribute("data-state", "lifted");
          setState(tile, fromBank ? "used" : "dragging");
        }
        ghost.style.transform = `translate(${event.clientX - start.x}px, ${event.clientY - start.y}px)`;
        const inside = near(answerRow.getBoundingClientRect(), event.clientX, event.clientY, 28);
        if (fromBank) {
          if (inside) {
            drop ??= el("span", { part: "tile", "data-drop": "", state: "drop", lang, dir: tileDir, "aria-hidden": "true" }, [...tile.childNodes].map((node) => node.cloneNode(true)));
            const others = placedTiles();
            const ref = others[indexAt(event.clientX, event.clientY, others)] ?? null;
            if (drop.nextElementSibling !== ref || !drop.isConnected) motion.glide(others, () => answerRow.insertBefore(drop, ref));
          } else if (drop) {
            const leaving = drop;
            drop = null;
            motion.glide(placedTiles(), () => leaving.remove());
          }
        } else if (inside) {
          const others = placedTiles().filter((t) => t !== tile);
          const ref = others[indexAt(event.clientX, event.clientY, others)] ?? null;
          if (tile.nextElementSibling !== ref) motion.glide(others, () => answerRow.insertBefore(tile, ref));
        }
      };
      const up = (event) => {
        if (!mine(event)) return;
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
        removeEventListener("pointercancel", up);
        if (!ghost) return; // a tap: the click does it
        dragged = true;
        setTimeout(() => (dragged = false), 0);
        const at = ghost.getBoundingClientRect();
        ghost.remove();
        const inside = event.type === "pointerup" && near(answerRow.getBoundingClientRect(), event.clientX, event.clientY, 28);
        if (fromBank) {
          setState(tile, null);
          if (drop && inside) {
            const index = [...answerRow.children].indexOf(drop);
            drop.remove();
            place(tile, index, at);
          } else {
            drop?.remove();
            motion.fly(tile, at, {});
          }
        } else {
          setState(tile, null);
          if (inside) motion.fly(tile, at, {});
          else sendBack(tile, at);
        }
      };
      addEventListener("pointermove", move);
      addEventListener("pointerup", up);
      addEventListener("pointercancel", up);
    });
  }

  for (const word of tiles) {
    const source = el("button", { part: "tile", type: "button", lang, dir: tileDir, "data-word": wordText(word) }, wordNodes(word, lang));
    source.addEventListener("click", () => tapped() && place(source));
    draggable(source);
    bank.append(source);
  }
  const check = () => {
    if (checked || !placedTiles().length) return;
    checked = true;
    const placed = placedTiles();
    const words = placed.map(wordOf);
    const same = (one) => words.length === one.length && words.every((word, i) => word === one[i]);
    const others = also.map((one) => one.map(wordText));
    const other = others.find(same) ?? null;
    const answers = other ?? answer.map(wordText);
    const correct = same(answers);
    placed.forEach((tile, i) => {
      setState(tile, wordOf(tile) === answers[i] ? "right" : "wrong");
      motion.pop(tile, { delay: i * 45 });
    });
    // Where every word is now, before the emptied bank folds away.
    const origins = [...placed, ...[...bank.children].filter((t) => t.getAttribute("data-state") !== "used")].map((t) => [wordOf(t), t.getBoundingClientRect()]);
    // The tray fades where it is, and your order closes up after it.
    const trayWas = answerRow.getBoundingClientRect().height;
    motion.leave(bank, { dx: 0, dy: 0 });
    bank.hidden = true;
    container.lxReserve();
    const orderIs = answerRow.getBoundingClientRect().height;
    motion.animate(answerRow, [{ minHeight: `${trayWas}px` }, { minHeight: `${orderIs}px` }], { duration: motion.duration("--dur-320", 320), easing: motion.easingOf("--ease-out") });
    checkButton?.remove();
    // The right order under yours, each word traveling to its place.
    if (!correct) {
      const key = el(
        "div",
        { part: "arrange-key", dir: rowDir, "aria-label": t("core.arrange.key") },
        answer.map((word) => el("span", { part: "tile", state: moved.includes(wordText(word)) ? "moved" : undefined, lang, dir: tileDir, "data-word": wordText(word) }, wordNodes(word, lang))),
      );
      container.append(key);
      // Each word travels from where you put it (or from the bank) to its right place, in one smooth arc, once the step has
      // settled: a session makes room for its result, the step moving as the bar comes up (its 320 ms), and words flying while it
      // moved were drawn beside your own (7 Nov: one thing at a time, your tiles marked, the step settled, then the right order).
      // Till then they hold their places unseen; each flies from where its word is then (the step has moved: by as much as your
      // order did). A press before then shows them in place; one during their flight ends it (motion's own rule). Only while the
      // right order shows (a session on a small screen may leave it out, its answer bar saying the right sentence).
      const orderWas = answerRow.getBoundingClientRect();
      const tiles = [...key.children];
      if (motion.motionOn()) for (const tile of tiles) tile.style.visibility = "hidden";
      const show = () => {
        clearTimeout(timer);
        removeEventListener("pointerdown", show, true);
        removeEventListener("keydown", show, true);
        for (const tile of tiles) tile.style.removeProperty("visibility");
      };
      const fly = () => {
        show();
        if (!key.isConnected || !key.getClientRects().length || !motion.motionOn()) return;
        const now = answerRow.getBoundingClientRect();
        const dx = now.left - orderWas.left;
        const dy = now.top - orderWas.top;
        tiles.forEach((tile, i) => {
          const index = origins.findIndex(([text]) => text === wordOf(tile));
          if (index < 0) return;
          const [, from] = origins.splice(index, 1)[0];
          motion.fly(tile, new DOMRect(from.left + dx, from.top + dy, from.width, from.height), { arc: 10, delay: i * 40 });
        });
      };
      const timer = setTimeout(fly, motion.duration("--dur-320", 320));
      addEventListener("pointerdown", show, true);
      addEventListener("keydown", show, true);
    }
    onCheck?.({ correct, placed: words, also: Boolean(other) });
  };
  // A session puts Check in its answer bar, within reach (checkButton: false); a demo keeps its own.
  const checkButton = withCheck ? button(t("core.check"), { variant: "white", size: "sm", onclick: check }) : null;
  container.append(answerRow, bank);
  if (checkButton) container.append(el("div", { class: "lx-row" }, checkButton));
  container.lxCheck = check;
  // Your order keeps the tray's height from the start (the tray keeps every tile's outline, so it's as tall as every
  // tile placed), so placing tiles moves nothing under it. A session calls this before it measures a step (session.js
  // fit); anywhere else, the tray's own size keeps it right.
  container.lxReserve = () => {
    answerRow.style.removeProperty("min-height");
    const height = bank.getBoundingClientRect().height;
    if (height) answerRow.style.setProperty("min-height", `${Math.ceil(height)}px`);
  };
  container.setAttribute("data-reserves", "");
  if (globalThis.ResizeObserver) new ResizeObserver(() => container.lxReserve()).observe(bank);
  // Each change to your order (a tap, a tile sent back, a drag's landing place), told to whoever holds the game
  // (container.lxOnChange: a session fits its step again), before the frame is drawn.
  new MutationObserver(() => container.lxOnChange?.()).observe(answerRow, { childList: true });
  return container;
}

/**
 * Where does it go: a sentence with one word taken out and a gap between every two words; tap the gap where the word
 * belongs and it flies there. After a wrong pick its right place is shown too. onAnswer({ correct, picked }), picked
 * being the gap's index (0: before the first word).
 */
export function placeWord(words, word, correctIndex, { onAnswer, punct = "", lang = target.code } = {}) {
  const chip = el("span", { part: "place-word", lang }, wordNodes(word, lang));
  const sentence = el("p", { part: "place-sentence", lang, variant: isJoined(lang) ? "joined" : undefined });
  let answered = false;
  const gaps = [];
  const pick = (index) => {
    if (answered) return;
    answered = true;
    const correct = index === correctIndex;
    const from = chip.getBoundingClientRect();
    const land = (gap, state) => {
      gap.replaceChildren(el("span", { class: "lx-place-landed" }, wordNodes(word, lang)));
      setState(gap, state);
    };
    // The sentence closes up around the word: its words move together, to where they end up.
    const others = motion.measure(sentence.querySelectorAll(".lx-place-text"));
    land(gaps[index], correct ? "right" : "wrong");
    motion.fly(gaps[index], from, { arc: 16 });
    if (!correct) {
      land(gaps[correctIndex], "answer");
      motion.appear(gaps[correctIndex], { delay: motion.duration("--dur-320", 320) });
    }
    setState(chip, "used");
    motion.glideFrom(others);
    for (const gap of gaps) gap.setAttribute("tabindex", "-1");
    onAnswer?.({ correct, picked: index });
  };
  words.forEach((word, i) => {
    const text = wordText(word);
    const gap = el("button", { part: "place-gap", type: "button", "aria-label": i === 0 ? t("core.place.before", { word: text }) : t("core.place.between", { before: wordText(words[i - 1]), after: text }), onclick: () => pick(i) });
    gaps.push(gap);
    sentence.append(gap, el("span", { class: "lx-place-text", "data-word": text }, wordNodes(word, lang)));
  });
  const last = el("button", { part: "place-gap", type: "button", "aria-label": t("core.place.after", { word: wordText(words.at(-1)) }), onclick: () => pick(words.length) });
  gaps.push(last);
  sentence.append(last);
  if (punct) sentence.append(el("span", { class: "lx-place-text" }, punct));
  const game = el("div", { part: "place" }, el("p", { class: "lx-place-ask" }, t("core.place.ask", { word: chip })), sentence);
  game.lxPick = (index) => gaps[index]?.click();
  return game;
}

/**
 * Typing a whole sentence: a field and Check (Enter checks too). onCheck(text) when checked with something typed;
 * field.lxInput is the input, field.lxCheck() checks from outside.
 */
export function writeSentence(placeholder, { onCheck, lang = target.code, checkButton: withCheck = true } = {}) {
  const input = el("input", { part: "text-field", type: "text", lang, placeholder, autocomplete: "off", autocapitalize: "sentences", autocorrect: "off", spellcheck: "false", "aria-label": placeholder });
  let done = false;
  const check = () => {
    if (done || !input.value.trim()) return;
    done = true;
    input.readOnly = true;
    checkButton?.remove();
    onCheck?.(input.value);
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      check();
    }
  });
  const checkButton = withCheck ? button(t("core.check"), { variant: "white", size: "sm", onclick: check }) : null;
  const field = el("div", { part: "type-answer" }, input, checkButton ? el("div", { class: "lx-row" }, checkButton) : null);
  field.lxInput = input;
  field.lxCheck = check;
  return field;
}

/**
 * A sentence with a gap and words to choose from; the word flies into the gap. onAnswer({ correct, picked }), picked as
 * written. before and after: the text around the gap, or its words ([word], each text or { text, reading, hidden }),
 * joined as the language joins them. options: the choices, each text or { text, reading, hidden } as the words are;
 * correct: the right one as written.
 */
// head: the gap word's opening mark (Spanish's ¿ ¡; study/gap-marks.js), drawn against the gap with no space, as the language writes it.
export function fillSentence(before, after, options, correct, { onAnswer, lang = target.code, head = "" } = {}) {
  // Empty, a line holding the gap's room: what a screen reader says there is a word, never the underscores.
  const blank = el("span", { part: "blank", state: "empty" }, el("span", { "aria-hidden": "true" }, "____"), el("span", { class: "lx-visually-hidden" }, t("core.blank")));
  // data-at: where the word stands in the sentence, past the gap for what's after it.
  const words = (part, from = 0) => (Array.isArray(part) ? part.flatMap((word, i) => [i ? space(lang) : null, el("span", { "data-word": wordText(word), "data-at": from + i, onclick: (event) => showReading(event.currentTarget) }, wordNodes(word, lang))]) : [part]);
  const gap = (side) => (Array.isArray(side) ? side.length > 0 : Boolean(side)) && space(lang);
  const sentence = el("p", { part: "fill-sentence", lang, variant: isJoined(lang) ? "joined" : undefined }, ...words(before), gap(before) ? " " : null, head ? el("span", {}, head) : null, blank, gap(after) && !/^[.?!…,;:。？！、]/u.test(Array.isArray(after) ? wordText(after[0]) : after) ? " " : null, ...words(after, Array.isArray(before) ? before.length + 1 : 0));
  // The choices run in the language's direction (a right-to-left language's from the right).
  const row = el("div", { class: "lx-row", dir: dirFor(lang) ?? undefined, "data-keys": "" });
  let answered = false;
  for (const option of options) {
    const text = wordText(option);
    const choice = button(wordNodes(option, lang), {
      size: "sm",
      onclick: () => {
        if (answered) return;
        answered = true;
        blank.replaceChildren(...wordNodes(option, lang));
        const ok = text === correct;
        setState(blank, ok ? "right" : "wrong");
        motion.fly(blank, choice.getBoundingClientRect(), { ghostOf: choice, arc: 16 });
        if (!ok) motion.shake(blank, { delay: motion.duration("--dur-320", 320) });
        onAnswer?.({ correct: ok, picked: text });
      },
    });
    choice.dataset.word = text;
    setLang(choice, lang);
    row.append(choice);
  }
  const node = el("div", { class: "lx-stack" }, sentence, row);
  node.lxPick = (index) => row.children[index]?.click();
  // The gap keeps the room of its widest choice from the start, so the word going in doesn't move the sentence or wrap it. A session
  // calls this as it fits a step (session.js); anywhere else, once it's on the page.
  node.setAttribute("data-reserves", "");
  node.lxReserve = () => {
    if (answered || !node.isConnected) return;
    const held = [...blank.childNodes];
    blank.style.removeProperty("min-width");
    let widest = 0;
    // Measured as it will be: in its answered state, with its mark.
    setState(blank, "right");
    for (const option of options) {
      blank.replaceChildren(...wordNodes(option, lang));
      widest = Math.max(widest, blank.getBoundingClientRect().width);
    }
    setState(blank, "empty");
    blank.replaceChildren(...held);
    if (widest) blank.style.setProperty("min-width", `${Math.ceil(widest)}px`);
  };
  requestAnimationFrame(() => node.lxReserve());
  return node;
}

/**
 * A sentence with a gap to type its missing word in: the field sits in the gap, as Fill's blank does, the sentence's words around it.
 * before and after as fillSentence's. answer: the word as written, which only sets the gap's room (a little more than it needs, so its
 * length gives nothing away to the letter). onCheck(text) once checked with something typed (Enter checks); node.lxCheck() checks from
 * outside, node.lxInput is the field, node.lxShow("right" | "wrong") marks it once graded.
 */
export function typeInGap(before, after, answer, { onCheck, lang = target.code, head = "" } = {}) {
  const input = el("input", { part: "gap-field", type: "text", lang, autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "done", "aria-label": t("core.gapField") });
  // In the sentence's face, so the room is counted in its letters: the answer's and two more, at least five.
  input.style.setProperty("--gap-room", `${Math.max(5, [...wordText(answer)].length + 2)}ch`);
  const words = (part, from = 0) => (Array.isArray(part) ? part.flatMap((word, i) => [i ? space(lang) : null, el("span", { "data-word": wordText(word), "data-at": from + i, onclick: (event) => showReading(event.currentTarget) }, wordNodes(word, lang))]) : [part]);
  const gap = (side) => (Array.isArray(side) ? side.length > 0 : Boolean(side)) && space(lang);
  const sentence = el("p", { part: "fill-sentence", lang, variant: isJoined(lang) ? "joined" : undefined }, ...words(before), gap(before) ? " " : null, head ? el("span", {}, head) : null, input, gap(after) && !/^[.?!…,;:。？！、]/u.test(Array.isArray(after) ? wordText(after[0]) : after) ? " " : null, ...words(after, Array.isArray(before) ? before.length + 1 : 0));
  let done = false;
  const check = () => {
    if (done || !input.value.trim()) return;
    done = true;
    input.readOnly = true;
    onCheck?.(input.value);
  };
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    check();
  });
  const node = el("div", { class: "lx-stack" }, sentence);
  node.lxInput = input;
  node.lxCheck = check;
  node.lxShow = (state) => {
    setState(input, state);
    if (state === "right") motion.pop(input);
    else if (state === "wrong") motion.shake(input);
  };
  return node;
}

/**
 * Match pairs: tap one on each side. onPair({ ok, nl, en, matched, total }) for every try (matched: the pairs joined so far), onDone({ misses }) when all are matched,
 * onTap(text, side) for every tap on an unmatched item (to say a word aloud). lang: the language's (as fillSentence).
 */
export function matchGrid(pairs, { onPair, onDone, onTap, lang = target.code } = {}) {
  const grid = el("div", { part: "match-grid" });
  let selected = null;
  let misses = 0;
  let matched = 0;
  const left = pairs.map(([nl]) => nl);
  const right = seededShuffle(pairs.map(([, en]) => en), left.map(wordText).join("|"));
  const lookup = new Map(pairs.map(([nl, en]) => [wordText(nl), en]));
  const make = (word, side) =>
    el(
      "button",
      {
        part: "match-item",
        type: "button",
        lang: side === "nl" ? lang : target.fromCode,
        "data-side": side,
        "data-word": wordText(word),
        onclick: (event) => {
          const item = event.currentTarget;
          if (item.getAttribute("data-state") === "matched") return;
          onTap?.(wordOf(item), side);
          if (!selected || selected.dataset.side === side) {
            if (selected) setState(selected, null);
            selected = item;
            setState(item, "selected");
            return;
          }
          const nl = side === "nl" ? item : selected;
          const en = side === "nl" ? selected : item;
          selected = null;
          const ok = lookup.get(wordOf(nl)) === wordOf(en);
          for (const node of [nl, en]) setState(node, ok ? "matched" : "wrong");
          if (ok) {
            matched++;
            motion.pop(nl);
            motion.pop(en);
          } else {
            misses++;
            motion.shake(nl);
            motion.shake(en);
            // The miss shows briefly; the items stay pressable the whole time (a press just starts a new pick).
            setTimeout(() => [nl, en].forEach((node) => node.getAttribute("data-state") === "wrong" && setState(node, null)), 700);
          }
          onPair?.({ ok, nl: wordOf(nl), en: wordOf(en), matched, total: pairs.length });
          if (matched === pairs.length) onDone?.({ misses });
        },
      },
      // A gloss quoting the language's words keeps each quoted run in its own order (bidiText).
      side === "nl" ? wordNodes(word, lang) : bidiText(word),
    );
  left.forEach((nl, i) => grid.append(make(nl, "nl"), make(right[i], "en")));
  return grid;
}

const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?,;:]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Your typing against the answer, character by character: right, wrong (typed, not in the answer), missing. */
export function typeDiff(typed, answer, { lang = target.code } = {}) {
  const a = [...typed.trim()];
  const b = [...answer];
  const same = (x, y) => x.toLowerCase() === y.toLowerCase();
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) table[i][j] = same(a[i], b[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const parts = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && same(a[i], b[j])) parts.push(["right", b[j++]]), i++;
    else if (j < b.length && (i >= a.length || table[i][j + 1] >= table[i + 1][j])) parts.push(["missing", b[j++]]);
    else parts.push(["wrong", a[i++]]);
  }
  return el(
    "p",
    { part: "type-diff", lang, "data-label": t("core.typeDiff"), "aria-label": t("core.typeDiffAnswer", { answer }) },
    parts.map(([state, ch]) => el("span", { part: "diff-char", state }, ch)),
  );
}

/** Type the answer. A wrong answer shows your typing against it. onAnswer({ correct, typed }). */
export function typeAnswer(correct, placeholder, { onAnswer, accept = [], lang = target.code } = {}) {
  const input = el("input", { part: "text-field", type: "text", placeholder, lang, autocapitalize: "off", autocorrect: "off", autocomplete: "off", spellcheck: "false", "aria-label": t("core.yourAnswer") });
  const submit = el("button", { part: "button", variant: "white", type: "submit" }, t("core.check"));
  const form = el("form", { part: "type-answer" }, input, submit);
  const node = el("div", { class: "lx-stack" }, form);
  let answered = false;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (answered || !input.value.trim()) return;
    answered = true;
    const ok = [correct, ...accept].some((answer) => normalize(answer) === normalize(input.value));
    setState(form, ok ? "right" : "wrong");
    input.readOnly = true;
    submit.remove();
    if (ok) motion.pop(input);
    else {
      motion.shake(input);
      const diff = typeDiff(input.value, correct, { lang });
      node.append(diff);
      motion.appear(diff);
    }
    onAnswer?.({ correct: ok, typed: input.value });
  });
  node.lxInput = input;
  return node;
}

// ---------- reader ----------

/**
 * A woven paragraph: English text with Dutch words in place. segments = strings (English) or
 * { nl, en } (a woven word, tap for its meaning) or { flipped: [...segments], literal: [{ text, moved }] }.
 */
export function wovenParagraph(segments, onLookUp) {
  const renderWord = (seg) =>
    el(
      "button",
      {
        part: "woven-word",
        type: "button",
        lang: target.code,
        state: seg.state,
        title: seg.en,
        onclick: (event) => {
          event.currentTarget.setAttribute("data-state", "looked-up");
          onLookUp?.(seg, event.currentTarget);
        },
      },
      seg.nl,
    );
  const p = el("p");
  for (const seg of segments) {
    if (typeof seg === "string") p.append(seg);
    else if (seg.flipped) {
      const sentence = el("span", { part: "reader-sentence", state: "flipped", lang: target.code });
      for (const part of seg.flipped) sentence.append(typeof part === "string" ? part : renderWord(part));
      p.append(
        sentence,
        el(
          "span",
          { part: "reader-literal" },
          seg.literal.map((chunk, i) => [
            i ? " " : "",
            el("span", { part: "literal-chunk", state: chunk.moved ? "moved" : undefined }, chunk.text),
          ]),
        ),
      );
    } else p.append(renderWord(seg));
  }
  return p;
}

// ---------- progress ----------

export function sessionProgress(states) {
  const bar = el("div", { part: "session-progress", role: "progressbar", "aria-valuemin": 0 });
  setProgress(bar, states);
  return bar;
}

/** Updates a session's progress; a step that just got its result fills in with a wipe. */
export function setProgress(bar, states) {
  const steps = [...bar.children];
  const had = steps.length;
  while (steps.length < states.length) {
    const step = el("span", { part: "progress-step" });
    bar.append(step);
    steps.push(step);
    // One more on a bar already drawn (a missed question coming back): it opens, and the others make room as it does.
    if (had) motion.animate(step, [{ flexGrow: 0 }, { flexGrow: 1 }], { duration: motion.duration("--dur-320", 320), easing: motion.easingOf("--ease-standard") });
  }
  while (steps.length > states.length) steps.pop().remove();
  states.forEach((state, i) => {
    const before = steps[i].getAttribute("data-state");
    const next = state === "upcoming" ? null : state;
    setState(steps[i], next);
    if (before !== next && (next === "right" || next === "wrong")) {
      // The step fills from its start over what it showed, never emptying first.
      const start = document.documentElement.dir === "rtl" || getComputedStyle(steps[i]).direction === "rtl" ? "right" : "left";
      const under = before === "current" ? "var(--ink-2)" : "var(--strength-0)";
      motion.animate(steps[i], [{ backgroundSize: "0% 100%", backgroundRepeat: "no-repeat", backgroundPosition: `${start} center`, backgroundColor: under }, { backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", backgroundPosition: `${start} center`, backgroundColor: under }], {
        duration: motion.duration("--dur-320", 320),
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }
  });
  bar.setAttribute("aria-valuemax", String(states.length));
  bar.setAttribute("aria-valuenow", String(states.filter((s) => s === "right" || s === "wrong").length));
}

export function strengthMeter(level, meaning) {
  return el("span", { part: "strength-meter", "data-level": level, meaning, role: "img", "aria-label": t("core.strength", { level, levels: 4 }) }, el("i"), el("i"), el("i"), el("i"));
}

/** Moves a strength meter from one level to another, a bar at a time. */
export function animateStrength(meter, from, to, { delay = 0 } = {}) {
  meter.setAttribute("data-level", String(to));
  meter.setAttribute("aria-label", t("core.strength", { level: to, levels: 4 }));
  if (to === from) return;
  const bars = [...meter.children];
  const [low, high] = from < to ? [from, to] : [to, from];
  for (let i = low; i < high; i++) {
    motion.animate(bars[i], [{ transform: "scaleY(0.2)", opacity: 0.3 }, { transform: "scaleY(1)", opacity: 1 }], {
      duration: motion.duration("--dur-320", 320),
      delay: delay + (from < to ? i - low : high - 1 - i) * 90,
      easing: "cubic-bezier(0.3, 1.4, 0.5, 1)",
    });
  }
}

// ---------- app shell ----------

const TAB_SYMBOL = { today: "tabs2-home", read: "tabs2-read", know: "tabs2-know", explore: "tabs2-explore", ai: "tabs2-ai", practice: "tabs2-ai" };
/** A tab's symbol: one color, from currentColor, so the row and its purple copy draw the same shape. */
const tabSymbol = (id, iconName) => {
  const name = id === "study" ? "tabs2-study-a" : TAB_SYMBOL[id];
  return SYMBOL_NAMES.includes(name) ? symbol(name, { size: 28 }) : icon(iconName);
};

// How the bubble moves: each edge is a spring, the leading edge quicker than the trailing one, so it stretches as it goes and settles with a little overshoot.
const LENS = { lead: { k: 620, c: 38 }, trail: { k: 300, c: 29 } };
/**
 * The bubble and the lens. It moves by its own frames and takes no presses, and every link stays where it is, pressable, so nothing here ever waits: a press on
 * another tab redirects it from wherever it is. That's why it doesn't register with motion's finish-on-press. With animations off it's just there.
 */
export function tabLens(nav, bubble, lens) {
  let left = 0, right = 0, vLeft = 0, vRight = 0, toLeft = 0, toRight = 0, raf = 0, last = 0, placed = false, target = null;
  const paint = () => {
    const width = nav.clientWidth, height = nav.clientHeight;
    const rest = Math.max(1, toRight - toLeft);
    // Stretched, it thins a little, as something moving fast does.
    const stretch = Math.max(0, Math.min(1, (right - left) / rest - 1));
    const inset = 4 + 5 * stretch;
    const radius = (height - inset * 2) / 2;
    bubble.style.transform = `translate(${left.toFixed(2)}px, ${inset.toFixed(2)}px)`;
    bubble.style.width = `${(right - left).toFixed(2)}px`;
    bubble.style.height = `${(height - inset * 2).toFixed(2)}px`;
    lens.style.clipPath = `inset(${inset.toFixed(2)}px ${(width - right).toFixed(2)}px ${inset.toFixed(2)}px ${left.toFixed(2)}px round ${radius.toFixed(2)}px)`;
  };
  const step = (now) => {
    // A long frame (a page redrawing) slows it for that frame and never makes it jump.
    // A frame's own time can be earlier than the press that asked for it, after a long task: never a step backwards.
    const dt = Math.max(0, Math.min(0.02, (now - last) / 1000));
    last = now;
    const goingRight = toLeft + toRight > left + right;
    const a = goingRight ? LENS.trail : LENS.lead, b = goingRight ? LENS.lead : LENS.trail;
    // Small steps, so a slow frame never changes the path.
    for (let i = 0; i < 4; i++) {
      const h = dt / 4;
      vLeft += (a.k * (toLeft - left) - a.c * vLeft) * h;
      left += vLeft * h;
      vRight += (b.k * (toRight - right) - b.c * vRight) * h;
      right += vRight * h;
    }
    if (Math.abs(toLeft - left) + Math.abs(toRight - right) < 0.15 && Math.abs(vLeft) + Math.abs(vRight) < 4) {
      left = toLeft;
      right = toRight;
      vLeft = vRight = 0;
      raf = 0;
      paint();
      return;
    }
    paint();
    raf = requestAnimationFrame(step);
  };
  const measure = () => {
    if (!target?.offsetWidth) return false;
    // Exact, not whole pixels: a tab can be 83.5 wide, and the clip has to meet its edges.
    const box = target.getBoundingClientRect();
    const from = nav.getBoundingClientRect().left + nav.clientLeft;
    toLeft = box.left - from;
    toRight = box.right - from;
    return true;
  };
  const snap = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (!measure()) return;
    nav.removeAttribute("data-no-lens");
    left = toLeft;
    right = toRight;
    vLeft = vRight = 0;
    placed = true;
    paint();
  };
  new ResizeObserver(snap).observe(nav);
  return {
    /** The tab it covers (a link, or null where no tab in the bar is current). */
    to(link) {
      // The tab it's on already (a page within its tab): nothing to measure. (Measured right after the page changed, it laid the whole page out
      // ahead of its frame; the bar's own size changes reach it through the ResizeObserver above.)
      if (link && link === target && placed && !raf && !nav.hasAttribute("data-no-lens")) return;
      nav.toggleAttribute("data-no-lens", !link || !link.offsetWidth);
      const was = target;
      target = link;
      if (!link || !link.offsetWidth) return;
      if (!placed || !was || !motion.motionOn()) return snap();
      measure();
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(step);
      }
    },
  };
}

/**
 * tabs = [[id, label, icon]]. With `settings`, a Settings tab that only shows in the wide-screen sidebar. The links are the row; over them, taking no presses, a
 * copy in the current color shows only through the bubble, so as the bubble crosses a tab, the part of it inside turns purple. nav.lxSetActive(id) moves it.
 */
export function tabBar(tabs, active, { settings } = {}) {
  const links = new Map();
  const tab = ([id, label, iconName], variant) => {
    const link = el(
      "a",
      { part: "tab", href: `#${id}`, variant, title: label, state: id === active ? "active" : undefined, "aria-current": id === active ? "page" : undefined },
      tabSymbol(id, iconName),
      el("span", { class: "lx-tab-label" }, label),
    );
    links.set(id, link);
    return link;
  };
  const bubble = el("span", { class: "lx-tab-bubble", "aria-hidden": "true" });
  const lens = el("span", { class: "lx-tab-lens", "aria-hidden": "true" }, tabs.map(([id, label, iconName]) => el("span", { class: "lx-tab-lens-item" }, tabSymbol(id, iconName), el("span", { class: "lx-tab-label" }, label))));
  const nav = el("nav", { part: "tab-bar", "aria-label": t("core.tabBar") }, bubble, tabs.map((t) => tab(t)), settings ? tab(settings, "settings") : null, lens);
  nav.style.setProperty("--tabs", String(tabs.length));
  const moves = tabLens(nav, bubble, lens);
  nav.lxSetActive = (id) => {
    for (const [key, link] of links) {
      setState(link, key === id ? "active" : null);
      if (key === id) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    moves.to(links.get(id) ?? null);
  };
  requestAnimationFrame(() => moves.to(links.get(active) ?? null));
  return nav;
}

/**
 * The way back, everywhere in the app: one floating pill of the
 * tabs' own glass, a chevron and where it goes back to (label), or the chevron alone, round, with aria for its name. href makes it a
 * link (the header's: shell/main.js takes it back in the app's history), onclick a button. part: "app-back" for the header's.
 * scripts/test-back-buttons.mjs fails on any other way back.
 */
export function backButton({ label, href, onclick, aria, part } = {}) {
  const tag = href ? "a" : "button";
  return el(
    tag,
    { part, class: "lx-back", href, type: tag === "button" ? "button" : undefined, onclick, "aria-label": aria ?? (label ? undefined : t("core.back")) },
    icon("back"),
    label ? el("span", {}, label) : null,
  );
}

/**
 * A tab's top bar: its title; at its end the language you're learning (language: { code, name, href }, headerLanguage)
 * and the settings button. A page you went into has the back pill instead, and its title centered in the bar (bar-title): the page's own
 * large title's words, shown as that title goes under the header (shell/main.js followBar), or back.title, always (a page with no large title
 * of its own: Translate). Where they'd meet, the pill is its chevron alone (data-pill="chevron"), its name still said ("Back to …").
 * back.tab: the way back is to a tab (Settings' menu), which a wide screen's sidebar already has: data-back="tab" (shell.css hides the pill there).
 */
/** mark: a node at the header's end, before the language, on every page (shell/main.js: the sample learner's). */
export function appHeader(title, { onSettings, initials = "?", back, language, mark } = {}) {
  if (back)
    return el(
      "header",
      { part: "app-header", "data-back": back.tab ? "tab" : undefined },
      backButton({ part: "app-back", href: back.href, label: back.label, aria: back.label ? t("core.backTo", { page: back.label }) : undefined }),
      // The page's own title repeated: a screen reader has it already in the page (only back.title, the bar's own, is read).
      el("div", { part: "bar-title", "data-fixed": back.title ? "" : undefined, "aria-hidden": back.title ? undefined : "true" }, el("span", {}, back.title ?? "")),
      mark ? el("div", { class: "lx-header-end" }, mark) : null,
    );
  return el(
    "header",
    { part: "app-header" },
    el("div", { part: "app-title" }, el("span", { part: "app-mark", "aria-hidden": "true" }), el("span", {}, title)),
    el(
      "div",
      { class: "lx-header-end" },
      mark ?? null,
      language ? headerLanguage(language) : null,
      // Your initials; where the header has no room for them (large text on a narrow phone: shell/main.js fitTitle), a gear instead.
      onSettings === false ? null : el("button", { part: "settings-button", type: "button", "aria-label": t("core.settings"), onclick: onSettings }, el("span", { class: "lx-initials" }, initials), icon("gear")),
    ),
  );
}


/** The language you're learning, at a glance: its flag and code, small, opening where you change it (href). Every page's header is drawn anew
 * (Study's as a session goes back down over it), so its flag is a steady one, there in the header's first frame. */
export function headerLanguage({ code, name, href }) {
  return el("a", { part: "header-language", href, "aria-label": t("core.learningChange", { language: name }), title: t("core.learning", { language: name }) }, languageFlag(code), el("span", { "aria-hidden": "true" }, code.toUpperCase()));
}

export function toast(meaning, text) {
  return el("div", { part: "toast", meaning, role: "status" }, icon(MEANING_ICON[meaning] ?? "sparkle"), text);
}

/**
 * A place held for what's on its way (part skeleton): `height` px tall, what was there last time (lx/shapes.js
 * heldPlace), so nothing moves when it comes. Seen, not read: the page it's on says what's loading, when anything does.
 */
export function skeleton({ height } = {}) {
  return held({ height }, "content");
}

/**
 * A place held for what's on its way (docs/design-bible.md, "What arrives late"): the exact box of what comes, in the quiet fill with a slow
 * pulse (still with animations off), so nothing pops into empty space and nothing below it moves when it comes. Only for what waits on the
 * network or a slow store: what the device has is drawn in the page's first frame (a page gives view.ready until it is), never held.
 * shape: { height (px or a CSS length), width? (px or a CSS length; the line's width when left out), radius? (a radius token's number, 8,
 * 12, 16 or 24, or "full"), inline? (inside a line of text: a value at a row's end, a count) }. holds: what's coming (data-holds), for the
 * frame-watch gate and whoever reads the page. It comes with ui.arrive.
 */
export function held(shape = {}, holds = "content") {
  const node = el(shape.inline ? "span" : "div", { part: "skeleton", "data-holds": holds, "aria-hidden": "true" });
  const length = (value) => (typeof value === "number" ? `${Math.round(value)}px` : String(value));
  if (shape.height != null) node.style.setProperty("--skeleton-height", length(shape.height));
  if (shape.width != null) node.style.setProperty("--skeleton-width", length(shape.width));
  if (shape.radius != null) node.style.setProperty("--skeleton-radius", shape.radius === "full" ? "999px" : `var(--radius-${shape.radius})`);
  if (shape.inline) node.dataset.inline = "";
  return node;
}

/**
 * A line of text held (held, inline): on its line's baseline and under its text's height, so a line holding it is exactly the line its words make
 * (the default inline place sits lower and made a heading's line 0.65 px taller). width: the line's share, as a CSS length.
 */
export function heldText(width, holds = "words") {
  const line = held({ inline: true, width, height: "0.8em" }, holds);
  line.style.verticalAlign = "baseline";
  return line;
}

/**
 * A line of a block held (a heading, a line of facts): a held place the line's own box, one line tall (1lh) and as wide as its block, so the
 * line that comes is inside it however long its words; seen as a bar of `bar` of that width, placed as the block aligns its text.
 */
export function heldLine(bar = "60%", holds = "words") {
  const place = held({ height: "1lh" }, holds);
  Object.assign(place.style, { background: "none", minHeight: "0" });
  const shown = el("span", { "aria-hidden": "true" });
  Object.assign(shown.style, { display: "inline-block", width: bar, height: "0.8em", verticalAlign: "baseline", borderRadius: "var(--radius-8)", background: "var(--fill)" });
  place.append(shown);
  return place;
}

/**
 * A button held: the button that comes (button's own args), unseen and taking no presses, inside a held place that takes its box, so it's its
 * exact size at any text size. (A grid, so the button sits in no line box: as a line's inline box it took a descender's 4 px more.)
 */
export function heldButton(text, options = {}, { radius = 16, holds = "action" } = {}) {
  const place = held({ height: 0, radius }, holds);
  place.style.display = "grid";
  const inside = button(text, options);
  inside.style.visibility = "hidden";
  inside.inert = true;
  place.append(inside);
  return place;
}

// A late arrival's fade: opacity alone, so nothing moves (none with animations off: motion.animate).
const fadeIn = (node) => motion.animate(node, [{ opacity: 0 }, { opacity: 1 }], { duration: motion.duration("--dur-160", 160) });
// Whether a place is on the screen now (a page held unseen, one not drawn yet, or one the router has just shown whose first frame isn't drawn
// yet, shell/main.js shown's data-fresh, gets what comes with no fade: it's in its first frame).
const onScreenNow = (node) => {
  if (!node?.isConnected || node.closest("[hidden], [data-waiting], [data-fresh]")) return false;
  const box = node.getBoundingClientRect();
  return box.width > 0 && box.bottom > 0 && box.top < innerHeight;
};

/**
 * What was held arrives (ui.held): it takes the holder's place in the same box and fades in. A height off from the holder's by more than
 * 1 px marks the node data-holds-mismatch="<before>→<after>" for the gate, and says so in the console. A holder no longer on the page: the
 * node is returned as it is. Returns node.
 */
export function arrive(holder, node) {
  if (!holder?.isConnected || !node) return node;
  const late = onScreenNow(holder);
  const before = holder.getBoundingClientRect().height;
  holder.replaceWith(node);
  const after = node.getBoundingClientRect?.().height ?? before;
  if (Math.abs(after - before) > 1) {
    node.dataset.holdsMismatch = `${Math.round(before)}→${Math.round(after)}`;
    console.warn(`ui.arrive: ${holder.dataset.holds ?? "a place"} held at ${Math.round(before)} px came at ${Math.round(after)} px`);
  }
  if (late) fadeIn(node);
  return node;
}

/**
 * What comes into a place that already holds its size (a picture's square, a cover): it fills the place, fading in when the place is on
 * the screen already, at once when it isn't (a page still being drawn). Returns the place.
 */
export function arriveIn(place, ...nodes) {
  if (!place) return place;
  const late = onScreenNow(place);
  place.replaceChildren(...nodes);
  if (late) for (const node of nodes) if (node instanceof Element) fadeIn(node);
  return place;
}

/**
 * Tinta, Lexicommons' character (part character): an ink drop drawn live, `size` px tall (the drop at rest fills it;
 * a hop or a splash draws past it). state: a held state, which loops (idle, loading, or one drafted on the rig, like
 * lex-retention's lounge or sleepy); still: a still (no motion here, whatever the setting). Decoration: it takes no presses, and nothing waits for it. Named "Tinta" to screen readers unless `hidden`
 * (where it repeats, as on every question card). Its drawing (public/js/character/) is loaded by the start (shell/main.js), so it's
 * drawn in the frame it's put on the page. One made before it has come shows its kind's first frame, kept from an earlier start
 * (character/firsts.js), and the live Tinta takes over from that same frame; with none kept, it fades in when it comes, never popping
 * into an empty box. Its box is its size from the start, so nothing moves when the drawing arrives. Play a reaction with
 * playCharacter(). speaks: it says what the app says (every sentence and word study/voice.js plays), its mouth following the words
 * while the sound plays; one per screen. pokeable: where it stands on a tab (never in a session), a tap on it is his alone (the
 * link or card around him doesn't take it) and pokes him (character/character.js poke()).
 */
export function character({ state = "idle", size = 72, still = false, hidden = false, speaks = false, ground = true, pokeable = false } = {}) {
  const node = el("lx-tinta", {
    part: "character",
    state,
    "data-size": size,
    // ground false: it stands on something drawn (a lesson on the path), so no puddle of its own under it.
    "data-ground": ground ? undefined : "none",
    "data-still": still ? "" : undefined,
    "data-speaks": speaks ? "" : undefined,
    "data-pokeable": pokeable ? "" : undefined,
    role: hidden ? undefined : "img",
    "aria-label": hidden ? undefined : t("core.tinta"),
    "aria-hidden": hidden ? "true" : undefined,
  });
  node.style.setProperty("--character-size", `${Math.round(size)}px`);
  if (!customElements.get("lx-tinta")) holdFirst(node);
  characterReady();
  return node;
}

let rig = null;
/** Tinta's drawing (character/character.js and its rig), loading: the start waits for it (shell/main.js), so every page has it. */
export const characterReady = () => (rig ??= import("../character/character.js"));

/**
 * Null when every Tinta in `host` is drawn, else a promise for when they will be: a page's slide waits for it, as for its view's ready
 * (shell/main.js, READY_WAIT at most). Only before Tinta's drawing has come; from then on a Tinta is drawn in the frame it's put in.
 */
export function charactersReady(host) {
  if (customElements.get("lx-tinta") || !host?.querySelector?.("lx-tinta")) return null;
  return characterReady().then(
    () => {},
    () => {},
  );
}

// Before Tinta's drawing has come: its kind's kept first frame in its place (character/firsts.js), or, with none kept, the place marked
// (data-first-pending) for Tinta to fade in when it comes (character.js arrive()).
function holdFirst(node) {
  node.querySelector(":scope > svg")?.remove();
  const frame = first(kindOf({ state: node.getAttribute("data-state") ?? "idle", size: node.getAttribute("data-size"), ground: node.getAttribute("data-ground") !== "none", still: node.hasAttribute("data-still") }));
  if (frame) {
    node.removeAttribute("data-first-pending");
    node.append(frame);
  } else node.setAttribute("data-first-pending", "");
}

/** Plays one of Tinta's reactions (right, wrong, heart, wave, catch…) on a part built by character(); a press finishes it. */
export function playCharacter(node, reaction) {
  customElements.whenDefined("lx-tinta").then(() => {
    // Only a Tinta still on the page plays: one that left before its drawing loaded (a summary closed at once) was
    // never made a Tinta, and nothing should wait for it.
    if (!node.isConnected) return;
    customElements.upgrade(node);
    node.play?.(reaction);
  });
}

/**
 * Puts a Tinta built by character() in a held state (a place's pose: ready, counted, peek, beside, scribble, present…),
 * now or, before its drawing has loaded, as the state it starts in. Nothing when it's in that state already, so a
 * reaction or an act it's playing carries on.
 */
export function holdCharacter(node, state) {
  const Tinta = customElements.get("lx-tinta");
  if (Tinta && node instanceof Tinta) {
    if (node.state !== state) node.state = state;
  } else if (node.getAttribute("data-state") !== state) {
    node.setAttribute("data-state", state);
    // Its kept first frame is the new state's (or none: it fades in when its drawing comes).
    if (!Tinta) holdFirst(node);
  }
}

/** Tinta points its curl at each element in turn (a hint's clue words: never an answer), then looks back at you. */
export function pointCharacter(node, elements) {
  const list = [...elements];
  customElements.whenDefined("lx-tinta").then(() => {
    // As playCharacter: only a Tinta still on the page.
    if (!node.isConnected) return;
    customElements.upgrade(node);
    node.pointAt?.(list);
  });
}

/**
 * Tinta plays an act on a part built by character(), on `targets` (elements it acts on: a download's bar, an error's
 * Retry): make({ palette, size }) → { name, dur, exit, frame(t, T, { rects, data, speak, endedAt }) }, as
 * character.js perform() takes it (lex-mascots' rig/splat/acts.js makes them). Returns { set(data), end() } at once:
 * set hands the act its data (a download's { progress }), end plays its exit. Until Tinta's drawing has loaded they're
 * kept (the last data); an act ended before it could start never plays, since the page already shows the result. A
 * press finishes it, nothing waits for it, and with animations off nothing plays.
 */
export function performCharacter(node, make, targets = []) {
  const list = [...targets];
  let handle = null, data, hasData = false, ended = false;
  customElements.whenDefined("lx-tinta").then(() => {
    // As playCharacter: only a Tinta still on the page.
    if (ended || !node.isConnected) return;
    customElements.upgrade(node);
    handle = node.perform?.(make, list) ?? null;
    if (handle && hasData) handle.set(data);
  });
  return {
    set(value) {
      if (handle) return void handle.set(value);
      data = value;
      hasData = true;
    },
    end() {
      if (handle) return void handle.end();
      ended = true;
    },
  };
}

/**
 * A download's bar (part download-bar), with Tinta on it. The bar's own fill shows how much has come, whatever Tinta
 * does: set(share), 0 to 1. While it comes in, Tinta pours itself into the bar and is its fill, its eyes on the front
 * (the act `pour`, character/rig/splat/acts.js); done() fills it, and Tinta comes out of the far end, hops, and settles
 * there; stop() leaves it where it got to, Tinta coming out where it went in. Tinta is decoration: it takes no presses,
 * a press ends its act (the bar goes on filling), and with animations off it stands on the bar, still. label names it
 * for screen readers; still: Tinta never moves (a state shown on /design); tinta false: the bar alone (variant plain:
 * a book opening from the shelf, the step into reading, where Tinta isn't).
 */
export function downloadBar({ label = t("core.downloading"), share = 0, still = false, tinta: withTinta = true } = {}) {
  const fill = el("span", { class: "lx-download-fill" });
  const track = el("span", { class: "lx-download-track" }, fill);
  const tinta = withTinta ? character({ size: 32, hidden: true, still }) : null;
  const node = el("div", { part: "download-bar", variant: withTinta ? undefined : "plain", role: "progressbar", "aria-label": label, "aria-valuemin": "0", "aria-valuemax": "100" }, track, tinta);
  let now = 0;
  let state = "running";
  let act = null;
  let starting = false;
  const show = (value) => {
    now = Math.min(1, Math.max(0, Number(value) || 0));
    node.style.setProperty("--progress", String(now));
    node.setAttribute("aria-valuenow", String(Math.round(now * 100)));
  };
  // Tinta's act starts loading as the bar is made (a short download may be over before it could play: then it never
  // does, and the full bar says it all); nothing waits for it.
  const acts = still || !tinta ? null : import("../character/rig/splat/acts.js");
  const begin = () => {
    if (!acts || act || starting || state !== "running" || !node.isConnected) return;
    starting = true;
    acts.then(
      ({ pour }) => {
        starting = false;
        if (state !== "running" || !node.isConnected) return;
        act = performCharacter(tinta, pour, [track]);
        act.set({ progress: now });
      },
      () => (starting = false),
    );
  };
  node.set = (value) => {
    if (state !== "running") return;
    show(value);
    if (now >= 1) return node.done();
    act?.set({ progress: now });
    begin();
  };
  node.done = () => {
    if (state === "done") return;
    show(1);
    state = "done";
    node.setAttribute("data-state", "done");
    act?.set({ progress: 1 });
    act?.end();
    act = null;
  };
  node.stop = () => {
    if (state !== "running") return;
    state = "stopped";
    node.setAttribute("data-state", "stopped");
    act?.end();
    act = null;
  };
  show(share);
  requestAnimationFrame(begin);
  return node;
}

/**
 * Tinta acts out something that didn't go: it notices (`words`), slumps into a puddle of itself, peeks at `retry` and
 * pulls itself back up (the act `slump`, character/rig/splat/acts.js). Decoration on a line that's already there: a
 * press ends it, Retry works the whole time, and with animations off nothing moves.
 */
export function slumpCharacter(node, retry, words) {
  requestAnimationFrame(() => {
    if (!node.isConnected) return;
    import("../character/rig/splat/acts.js").then(({ slump }) => node.isConnected && performCharacter(node, slump, [retry, words]));
  });
}

/**
 * Tinta throws a drop that lands on `target` (a button) as a seal, holds a moment and dries away (the act `stamp`,
 * character/rig/splat/acts.js): "Me too". Decoration on a press that has already done its work: a press ends it, and
 * with animations off nothing moves.
 */
export function stampCharacter(node, target) {
  // The button against Tinta now, at the press: the page may draw a new button (the server's answer) before the act's
  // first frame, and the act lands its seal where this one was (the row moves as one).
  const t = node.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  import("../character/rig/splat/acts.js").then(({ stamp, VIEW }) => {
    if (!node.isConnected || !t.height) return;
    const k = VIEW[3] / t.height;
    const ox = t.left - (VIEW[0] / VIEW[2]) * t.width;
    const oy = t.top - (VIEW[1] / VIEW[3]) * t.height;
    performCharacter(node, stamp, [target]).set({ box: [(b.left - ox) * k, (b.top - oy) * k, (b.right - ox) * k, (b.bottom - oy) * k] });
  });
}

/**
 * The paper plane (the acts planeOff and planeIn, character/rig/splat/acts.js). way "off": something sent (a pack
 * shared): Tinta folds into a paper plane of ink, flies off, loops round and lands back as itself. way "in": something
 * arrived (an answer): a paper plane of ink glides in and unfolds into Tinta, which stays unseen until its plane is on
 * its way (data-arriving). Decoration: a press ends it; with animations off it's simply there.
 */
export function planeCharacter(node, way = "off") {
  if (way === "in") node.setAttribute("data-arriving", "");
  import("../character/rig/splat/acts.js").then(
    (acts) => {
      if (node.isConnected) performCharacter(node, way === "in" ? acts.planeIn : acts.planeOff);
      // Its first frame (the plane far off) is drawn in the same turn, before anything is painted.
      node.removeAttribute("data-arriving");
    },
    () => node.removeAttribute("data-arriving"),
  );
}

/**
 * Something that didn't go, said with Retry (part retry-line). `text` is the app's words for it, and they stay its own;
 * retry() does the same again. Retry is never disabled: a press while one is still out does nothing more. Tinta stands
 * beside the words, 32 px, and slumps (slumpCharacter). tinta: an <lx-tinta> already on the screen to act it instead
 * (one Tinta a screen), or false for none; still: its own Tinta stays still (a state shown on /design).
 */
export function retryLine(text, retry, { label = t("core.retry"), tinta = null, still = false } = {}) {
  let out = false;
  const words = el("span", { class: "lx-retry-words" }, text);
  const again = button(label, {
    variant: "gray",
    size: "sm",
    icon: "refresh",
    onclick: async () => {
      if (out) return;
      out = true;
      try {
        await retry();
      } finally {
        out = false;
      }
    },
  });
  const own = tinta === null ? character({ size: 32, hidden: true, still }) : null;
  const node = el("span", { part: "retry-line" }, own, words, again);
  const actor = own ?? (tinta || null);
  if (actor && !still) slumpCharacter(actor, again, words);
  return node;
}

/**
 * An empty state (part empty-state): its words, with Tinta above them in a pose that fits them (`pose`, one of
 * lex-retention's held states: lounge, page, box, shrug, off, doze; docs/design/retention/tinta-places.md), or playing a
 * reaction once when it's on the page (`react`). Tinta is decoration: hidden from screen readers, no presses. words: text
 * or nodes; tag "li" for one in a list; any other attributes (class) go on the part.
 */
/**
 * A page, or a part of one, that couldn't load (docs/design-bible.md, When something fails). Not there (a 404): its words, Tinta
 * shrugging, nothing to retry. Offline: Tinta dozes over what it needs,
 * and it tries again by itself once the connection's back. Online: what went wrong, in words, with Tinta's slump and Retry. `retry`
 * draws it again; `offline` says what needs the connection.
 */
export function loadFailed(error, retry, { offline = t("core.loadFailed.offline") } = {}) {
  // Not there (gone, or never was) is an answer, not a failure: its words, and nothing to try again.
  if (error?.status === 404 || error?.status === 410) return emptyState(error.message, { pose: "shrug" });
  if (navigator.onLine === false) {
    const node = emptyState(offline, { pose: "doze" });
    addEventListener("online", () => node.isConnected && retry(), { once: true });
    return node;
  }
  // Drawn as the offline one is (an empty state: Tinta at its full size over the words), with Retry under them; Tinta slumps, then peeks
  // at Retry. A press works the whole time, once at a time.
  let out = false;
  const tinta = character({ size: 64, hidden: true });
  const words = el("p", { class: "lx-load-failed-words" }, error?.message || t("core.loadFailed.generic"));
  const again = button(t("core.retry"), {
    variant: "gray",
    icon: "refresh",
    onclick: async () => {
      if (out) return;
      out = true;
      try {
        await retry();
      } finally {
        out = false;
      }
    },
  });
  const node = el("div", { part: "empty-state", class: "lx-load-failed" }, tinta, words, again);
  slumpCharacter(tinta, again, words);
  return node;
}

export function emptyState(words, { pose = null, react = null, size = 64, tag = "div", art = null, ...attrs } = {}) {
  if (art) {
    // A drawing for this screen (its box, explore.css .lx-empty-art, there from the first frame): the drawing in it as soon as it's in,
    // faded in if that's after the screen was seen. If it can't be had, Tinta takes the box the same way. Never Tinta first with the
    // drawing put over it a moment later (a flash, and the box growing under the words).
    const box = el("span", { class: "lx-empty-art" });
    const node = el(tag, { part: "empty-state", ...attrs }, box, words);
    let seen = false;
    requestAnimationFrame(() => (seen = true));
    import("../study/pictures.js").then(async ({ loadPictures, pictureNode }) => {
      const drawn = await loadPictures([art]);
      const shown = drawn ? pictureNode(art) : pose || react ? character({ state: pose ?? "idle", size, hidden: true }) : null;
      if (!shown) return;
      box.append(shown);
      if (seen && motion.motionOn()) shown.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease-out" });
      if (!drawn && react) requestAnimationFrame(() => shown.isConnected && playCharacter(shown, react));
    });
    return node;
  }
  const tinta = pose || react ? character({ state: pose ?? "idle", size, hidden: true }) : null;
  if (react) requestAnimationFrame(() => tinta.isConnected && playCharacter(tinta, react));
  return el(tag, { part: "empty-state", ...attrs }, tinta, words);
}

/**
 * Something loading (part empty-state, state loading): its words, with Tinta writing loops of ink above them (`writing`,
 * lex-character's), shown only once the wait has lasted (components.css), so a quick load never flashes it. Whatever
 * replaces it takes Tinta with it. Decoration: hidden from screen readers, no presses.
 */
export function loadingState(words = t("core.loading"), { size = 56 } = {}) {
  return el("div", { part: "empty-state", state: "loading" }, character({ state: "writing", size, hidden: true }), words);
}

/**
 * Something being looked up (part looking-up): Tinta beside its words (`lookup`: a magnifier swept along a line, a peer
 * through it now and then), 40 px; a smaller one (32) beside a line that's secondary ("Looking online too…"). It fades
 * in (components.css) and goes with the words: a page can show it and take it away at any moment, a fast answer 50 ms
 * after it came. Decoration: hidden from screen readers, no presses; the words are the status.
 */
export function lookingUp(words = t("core.lookingUp"), { size = 40 } = {}) {
  return el("p", { part: "looking-up", role: "status" }, character({ state: "lookup", size, hidden: true }), el("span", {}, words));
}

/** A row in a list. With href or onclick it's a link or button; state "soon" marks something not built yet. art: a node in
 * its icon's place (Tinta, small). symbol: one of lx/symbols.js's quiet symbols in its place, with no tile. opens: "sheet"
 * for a row that opens a sheet over the page rather than going to one: it's drawn as a button, with no chevron (which means
 * a page), and tells a screen reader a dialog comes (docs/design-bible.md, Rows; scripts/sheet-row-check.mjs). below: a
 * part on a line of its own under the text and trailing (a download's bar), the row's whole width, with the trailing
 * control centered on the text above it. */
export function listRow({ icon: iconName, art, symbol: symbolName, title, sub, href, onclick, state, variant, trailing, value, opens, below }) {
  const tag = href ? "a" : onclick ? "button" : "li";
  const sheet = opens === "sheet" && tag === "button";
  const row = el(
    tag,
    { part: "list-row", class: below ? "lx-row-has-below" : undefined, href, type: tag === "button" ? "button" : undefined, state, variant, onclick, "aria-haspopup": sheet ? "dialog" : undefined, "data-opens": sheet ? "sheet" : undefined },
    symbolName && SYMBOL_NAMES.includes(symbolName) ? symbol(symbolName, { size: 30 }) : art ? el("span", { class: "lx-row-icon", "data-art": "" }, art) : iconName ? el("span", { class: "lx-row-icon" }, icon(iconName)) : null,
    el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title" }, title), sub ? el("span", { class: "lx-row-sub" }, sub) : null),
    value !== undefined ? el("span", { class: "lx-row-end lx-row-value" }, value) : null,
    trailing ?? (href || (onclick && !sheet) ? icon("chevron") : null),
    below ? el("span", { class: "lx-row-below" }, below) : null,
  );
  return tag === "li" ? row : el("li", { class: "lx-row-item" }, row);
}

// A row's leading place: a drawn node (art: a quiet symbol, Tinta) on no tile, or a stroke icon on its tile.
const rowLead = (art, iconName) => (art ? el("span", { class: "lx-row-icon", "data-art": "" }, art) : iconName ? el("span", { class: "lx-row-icon" }, icon(iconName)) : null);

/** A row whose whole width toggles a switch. onchange(checked). art: a node in its icon's place, as listRow's; symbol: one of the app's symbols, as listRow's. */
export function switchRow({ icon: iconName, art, symbol: symbolName, title, sub, checked, onchange }) {
  const input = el("input", { part: "switch", type: "checkbox", role: "switch", checked: Boolean(checked) });
  input.addEventListener("change", () => onchange?.(input.checked, input));
  const row = el(
    "label",
    { part: "list-row", class: "lx-row-control" },
    symbolName && SYMBOL_NAMES.includes(symbolName) ? symbol(symbolName, { size: 30 }) : rowLead(art, iconName),
    el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title" }, title), sub ? el("span", { class: "lx-row-sub" }, sub) : null),
    input,
  );
  row.lxInput = input;
  return el("li", { class: "lx-row-item" }, row);
}

/** A row that's one choice of several (a radio button); trailing sits at its end. onchange(value) when it's picked. */
/**
 * A row that opens something (href) and has its own switch beside it, never inside it: the text opens the page, the
 * switch turns the thing on or off (onchange(checked, input)). label names the switch for a screen reader.
 */
export function switchLinkRow({ icon: iconName, title, sub, href, checked, onchange, label, chevron = true }) {
  const input = el("input", { part: "switch", type: "checkbox", role: "switch", checked: Boolean(checked), "aria-label": label ?? title });
  input.addEventListener("change", () => onchange?.(input.checked, input));
  const link = el(
    "a",
    { part: "list-row", href },
    iconName ? el("span", { class: "lx-row-icon" }, icon(iconName)) : null,
    el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title" }, title), sub ? el("span", { class: "lx-row-sub" }, sub) : null),
    // chevron: false where the switch is the row's end (Your packs): its name opens the page, the switch acts.
    chevron ? icon("chevron") : null,
  );
  const row = el("li", { part: "switch-link-row", class: "lx-row-item" }, link, el("label", { class: "lx-row-switch" }, input));
  row.lxInput = input;
  return row;
}

export function radioRow({ icon: iconName, art, title, sub, name, value, checked, onchange, trailing }) {
  const input = el("input", { part: "radio", type: "radio", name, value, checked: Boolean(checked) });
  input.addEventListener("change", () => input.checked && onchange?.(value, input));
  const row = el(
    "label",
    { part: "list-row", class: "lx-row-control" },
    rowLead(art, iconName),
    el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title" }, title), sub ? el("span", { class: "lx-row-sub" }, sub) : null),
    trailing,
    input,
  );
  row.lxInput = input;
  return el("li", { class: "lx-row-item" }, row);
}

/**
 * A row with a choice of a few options under its title. options = [[value, label]]. onchange(value). Short options
 * sit side by side; long ones stack as a list, so none wraps inside its button.
 */
export function choiceRow({ icon: iconName, title, sub, options, value, onchange }) {
  const stacked = options.reduce((sum, [, label]) => sum + String(label).length, 0) > 30;
  const group = el("div", { part: "segmented", role: "group", "aria-label": title, class: stacked ? "lx-segmented-stack" : undefined });
  for (const [optionValue, label] of options) {
    group.append(
      el(
        "button",
        {
          part: "segment",
          type: "button",
          "aria-pressed": String(optionValue === value),
          onclick: (event) => {
            for (const b of group.children) b.setAttribute("aria-pressed", String(b === event.currentTarget));
            onchange?.(optionValue);
          },
        },
        label,
      ),
    );
  }
  const row = el(
    "li",
    { part: "list-row", class: "lx-row-choice" },
    iconName ? el("span", { class: "lx-row-icon" }, icon(iconName)) : null,
    el("span", { class: "lx-row-text" }, el("span", { class: "lx-row-title" }, title), sub ? el("span", { class: "lx-row-sub" }, sub) : null, group),
  );
  row.lxGroup = group;
  return row;
}

/**
 * A choice between long options as a plain list under its name, the chosen one bold with a check (radioRow's rows, drawn so on a Settings
 * page; not the game's choiceList): the name is the choice's own, as a choiceRow's title is, never a heading over a group.
 */
export function pickList(title, rows) {
  return el("section", { class: "lx-group lx-choice-list", role: "radiogroup", "aria-label": title }, el("p", { class: "lx-choice-title" }, title), el("ul", { part: "list" }, rows));
}

/** A titled group of rows, with an optional note under it. */
export function group(label, rows, note) {
  return el(
    "section",
    { class: "lx-group" },
    label ? el("h2", { part: "group-label" }, label) : null,
    el("ul", { part: "list" }, rows),
    note ? el("p", { part: "group-note" }, note) : null,
  );
}

/** A group whose rows need its name to be read (what they're among: "Quiet hours", "Plays by itself"), named as a choice is: its words
 * over the list in the row's own ink, with no heading (docs/design-bible.md: grouped by space, no headings). A group whose rows say
 * themselves takes ui.group(null, rows) instead. */
export function namedGroup(title, rows, note) {
  return el(
    "section",
    { class: "lx-group", "aria-label": title },
    el("p", { class: "lx-choice-title" }, title),
    el("ul", { part: "list" }, rows),
    note ? el("p", { part: "group-note" }, note) : null,
  );
}

// ---------- sheets ----------

// How a sheet answers a finger: vaul's numbers (the web drawer library) where it has them.
const SHEET = {
  closeAt: 0.25, // let go past this share of its height, dragged down, and it closes
  flick: 0.4, // px/ms: a flick down this fast closes it, however far it went
  flickMin: 24, // px: ...as long as it went this far (a twitch isn't a flick)
  slop: 6, // px before a press becomes a drag (or a scroll)
  scrollLock: 100, // ms after its content scrolled, a pull doesn't take the sheet: the content is still moving
  stale: 100, // ms: a finger held still this long before letting go has stopped; no flick
  speedOver: 100, // ms: a flick's speed is the finger's over its last this much movement
  rubber: 0.55, // pulled up past its height it gives less and less
};
// What a press can start a drag from: never a control that has its own drag (a slider, a select's list).
const NO_DRAG = 'input[type="range"], select, [data-no-drag]';

/**
 * A sheet (part sheet): a panel that rises from the bottom, its grab handle (part sheet-handle) above its content.
 * Put the content in sheet.lxBody, which scrolls. sheet.lxShow() slides it up; sheet.lxHide(options) slides it away
 * (from where a drag left it), then hides it. A sheet over a page sits on a layer of its own (sheetLayer); the
 * reader's sit in the reader.
 *
 * It follows the finger: drag its handle either way, or pull its content down when the content is at its top and
 * hasn't just scrolled (the content scrolls otherwise, and a pull at its top takes the sheet). Let go past a quarter of
 * its height, or flick it down, and it closes: onClose({ from, velocity }), which hands the drag on to lxHide so the
 * slide carries on from the finger. Short of that it springs back. Pulled up, it gives less and less. A tap on the
 * handle closes it too (onClose()). sheet.lxOnDrag(progress) hears how far down it is while a finger has it (0 at
 * rest, 1 at its height), for a shade to follow.
 */
// One sheet at a time (Apple's HIG: "Display only one sheet at a time"): a sheet coming up closes the one that's up,
// at once, through its owner's own close (its onClose), so whoever holds it knows it's gone.
let sheetUp = null;
const sheetAside = (node) => {
  if (sheetUp && sheetUp !== node && sheetUp.isConnected && !sheetUp.hidden && sheetUp.getAttribute("data-state") !== "closing") sheetUp.lxCloseForAnother();
};

/** fn, once the frame being made now has been drawn (the next frame's start): a move started there has its whole length. */
export const afterThisFrame = (fn) => requestAnimationFrame(() => requestAnimationFrame(fn));

export function sheet({ label, onClose, hidden = true } = {}) {
  const body = el("div", { class: "lx-sheet-body" });
  // Its content only scrolls up and down: focus landing on something past its edge (a switch, a date field) mustn't slide it sideways, cutting off the first letters.
  body.addEventListener("scroll", () => body.scrollLeft && (body.scrollLeft = 0), { passive: true });
  const handle = el("button", { part: "sheet-handle", type: "button", "aria-label": label ? t("core.sheetClose", { label }) : t("core.close") });
  const node = el("div", { part: "sheet", role: "dialog", "aria-label": label, tabindex: "-1", hidden }, handle, body);
  node.lxBody = body;
  node.lxOnDrag = null;

  // ---------- showing and hiding ----------

  // The slide running now. A slide that's cut short (the sheet shown again while it's going) ends later, after its
  // promise settles: only the current one may finish anything.
  let sliding = null;
  let slideId = 0;
  // A slide up laid out but not begun yet (lxShow: it waits for the frame it came up in to be drawn).
  let pendingStart = false;
  // Ends any slide, a finished one holding its last frame (a slide away does) included. One not begun yet ends where a slide ends, at rest: a
  // press in those frames (a drag starting) finishes it at once, as a press does a running one.
  const endSlide = () => {
    slideId++;
    sliding = null;
    if (pendingStart) {
      pendingStart = false;
      node.style.removeProperty("transform");
    }
    for (const animation of node.getAnimations()) animation.cancel();
  };
  node.lxCloseForAnother = () => (onClose ? onClose({ animate: false }) : node.lxHide({ animate: false }));
  node.lxShow = () => {
    sheetAside(node);
    sheetUp = node;
    endSlide();
    node.removeAttribute("data-state");
    node.removeAttribute("inert");
    node.hidden = false;
    const id = slideId;
    if (!motion.motionOn()) return void node.style.removeProperty("transform");
    // The frame it comes up in pays for laying out what it holds (a list built a moment ago, the page under it made inert): a slide
    // started in that frame loses its first part to it, and on its ease-out that's most of the move. Measured on an iPhone
    // Simulator, 5 Nov 2026: a 110–180 ms first frame, every drawer arriving a quarter to most of the way up. So it's laid out where
    // the slide starts, past the screen's foot, in that frame, and slides from the next one, whole.
    node.style.transform = "translateY(100%)";
    pendingStart = true;
    afterThisFrame(() => {
      if (id !== slideId) return;
      pendingStart = false;
      node.style.removeProperty("transform");
      sliding = motion.slide(node, [{ transform: "translateY(100%)" }, { transform: "none" }], { onEnd: () => id === slideId && (sliding = null) });
    });
  };
  // Gone at once for presses (inert, and no pointer while it goes); the slide carries on from `from`, at the pace a
  // flick left it, then it hides. animate: false hides it there and then.
  node.lxHide = ({ animate = true, from: start = 0, onHidden } = {}) => {
    // Pressed away while it was still coming up (the press has finished its slide): it goes back from where it had got to.
    const from = !start && performance.now() - (node.lxSlidTo?.at ?? -Infinity) < 400 ? node.lxSlidTo.y : start;
    if (sheetUp === node) sheetUp = null;
    // Not on the screen yet (its slide up not begun): it goes at once, unseen.
    const unseen = pendingStart;
    endSlide();
    const id = slideId;
    const done = () => {
      if (id !== slideId) return;
      sliding = null;
      node.hidden = true;
      node.removeAttribute("data-state");
      node.removeAttribute("inert");
      node.style.removeProperty("transform");
      // The slide held its last frame until now: let it go, or the sheet would come back off the screen.
      for (const animation of node.getAnimations()) animation.cancel();
      onHidden?.();
    };
    if (node.hidden || unseen) return done();
    node.setAttribute("data-state", "closing");
    node.setAttribute("inert", "");
    if (!animate) return done();
    const height = node.offsetHeight || 1;
    node.style.setProperty("transform", `translateY(${from}px)`);
    // Off the bottom, with room for the shadow: translateY(100%) of its own height, plus a little.
    sliding = motion.slide(node, [{ transform: `translateY(${from}px)` }, { transform: `translateY(${height + 24}px)` }], { onEnd: done, fill: "forwards" });
  };

  // ---------- following a finger ----------

  let tracking = false; // a finger (or button) is down; whether it drags isn't decided yet
  let dragging = false; // it drags: the sheet follows it
  let fromHandle = false;
  let target = null;
  let x0 = 0;
  let y0 = 0;
  let dy = 0;
  let height = 0;
  // The finger's latest positions, each at its event's own time (event.timeStamp, when the finger was there): never
  // when a handler ran, because a busy phone runs them late and in bursts, and a flick timed by its handlers would
  // read as no movement at all. Kept back to the last one at least `speedOver` before the newest.
  let samples = [];
  let lastScroll = -Infinity;
  body.addEventListener("scroll", (event) => (lastScroll = event.timeStamp), { passive: true });
  // How fast the finger was going down as it let go at `t` (px/ms): over its last `speedOver` of movement, and nothing
  // if it had stopped for `stale` before letting go.
  const releaseSpeed = (t) => {
    const last = samples[samples.length - 1];
    const first = samples[0];
    if (!last || t - last.t > SHEET.stale || last.t <= first.t) return 0;
    return (last.y - first.y) / (last.t - first.t);
  };

  // Whether a drag that has gone `d` px down (up when negative), at time `t`, belongs to the sheet rather than to its
  // content.
  const canDrag = (d, t) => {
    if (target?.closest?.(NO_DRAG)) return false;
    if (fromHandle) return true;
    if (d <= 0) return false; // up, on the content: the content scrolls
    if (String(getSelection?.() ?? "").length) return false; // choosing text
    if (t - lastScroll < SHEET.scrollLock) return false;
    // Anything between the finger and the sheet that's scrolled down takes the pull: it scrolls back up first.
    for (let at = target; at && at !== node; at = at.parentElement) {
      if (at.scrollTop > 0 && at.scrollHeight > at.clientHeight + 1) return false;
    }
    return true;
  };
  // Each takes the event's own time, `t` (event.timeStamp).
  const down = (x, y, at, t) => {
    endSlide();
    tracking = true;
    dragging = false;
    target = at;
    fromHandle = Boolean(at?.closest?.('[data-part="sheet-handle"]'));
    x0 = x;
    y0 = y;
    samples = [{ y, t }];
    dy = 0;
  };
  // Returns whether this move is the sheet's (the page must not also scroll).
  const move = (x, y, t) => {
    if (!tracking) return false;
    samples.push({ y, t });
    while (samples.length > 2 && samples[1].t <= t - SHEET.speedOver) samples.shift();
    const raw = y - y0;
    if (!dragging) {
      if (Math.abs(raw) < SHEET.slop && Math.abs(x - x0) < SHEET.slop) return canDrag(raw, t) && Math.abs(raw) >= 1;
      // Sideways, or not the sheet's to take: let go of it for good.
      if (Math.abs(x - x0) > Math.abs(raw) || !canDrag(raw, t)) {
        tracking = false;
        return false;
      }
      dragging = true;
      height = node.offsetHeight || 1;
      node.setAttribute("data-state", "dragging");
    }
    // Down, exactly under the finger; up, a rubber band.
    dy = raw >= 0 ? raw : -height * (1 - 1 / ((-raw * SHEET.rubber) / height + 1));
    node.style.setProperty("transform", `translateY(${dy}px)`);
    node.lxOnDrag?.(Math.max(0, dy) / height);
    return true;
  };
  const up = ({ cancel = false, t = performance.now() } = {}) => {
    if (!tracking) return;
    tracking = false;
    if (!dragging) return;
    dragging = false;
    node.removeAttribute("data-state");
    // The speed over the finger's last stretch, not the whole gesture: a slow pull that ends in a flick reads as one.
    const velocity = releaseSpeed(t);
    const closes = !cancel && dy > 0 && (dy >= height * SHEET.closeAt || (velocity > SHEET.flick && dy > SHEET.flickMin));
    eatClick();
    if (closes) return onClose?.({ from: dy, velocity });
    // Back to rest, from where it was let go; the shade follows.
    const from = dy;
    node.style.removeProperty("transform");
    node.lxOnDrag?.(0);
    const id = slideId;
    if (from) sliding = motion.slide(node, [{ transform: `translateY(${from}px)` }, { transform: "none" }], { onEnd: () => id === slideId && (sliding = null) });
  };
  // A drag's own click isn't a tap, wherever the finger let go (on the shade it would close the sheet). A touch drag
  // has none, so the next press ends the wait: its click is its own.
  const eatClick = () => {
    const stop = () => {
      removeEventListener("click", eat, true);
      removeEventListener("pointerdown", stop, true);
    };
    const eat = (event) => {
      event.stopPropagation();
      event.preventDefault();
      stop();
    };
    addEventListener("click", eat, true);
    addEventListener("pointerdown", stop, true);
    setTimeout(stop, 400);
  };

  // Touch: a touchmove the page doesn't take now goes to the scroller, and iOS never gives it back, so the sheet claims
  // a pull from its very first move. The point under the finger, not the event's target: a touch near a control is
  // retargeted onto it.
  node.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) return up({ cancel: true, t: event.timeStamp });
      const t = event.touches[0];
      down(t.clientX, t.clientY, document.elementFromPoint(t.clientX, t.clientY) ?? event.target, event.timeStamp);
    },
    { passive: true },
  );
  node.addEventListener(
    "touchmove",
    (event) => {
      const t = event.touches[0];
      if (t && move(t.clientX, t.clientY, event.timeStamp) && event.cancelable) event.preventDefault();
    },
    { passive: false },
  );
  node.addEventListener("touchend", (event) => up({ t: event.timeStamp }));
  node.addEventListener("touchcancel", (event) => up({ cancel: true, t: event.timeStamp }));
  // A mouse or a pen: the same, through pointer events (a touch already has the events above).
  node.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch" || event.button > 0) return;
    down(event.clientX, event.clientY, event.target, event.timeStamp);
    const onMove = (ev) => {
      if (move(ev.clientX, ev.clientY, ev.timeStamp)) ev.preventDefault();
    };
    const onUp = (ev) => {
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp);
      removeEventListener("pointercancel", onCancel);
      up({ t: ev.timeStamp });
    };
    const onCancel = (ev) => {
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp);
      removeEventListener("pointercancel", onCancel);
      up({ cancel: true, t: ev.timeStamp });
    };
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    addEventListener("pointercancel", onCancel);
  });
  // The handle can't start a text selection or a native drag.
  handle.addEventListener("pointerdown", (event) => event.pointerType !== "touch" && event.preventDefault());
  // A tap (no drag) closes it: the handle is a close button too, and the keyboard's way to it.
  handle.addEventListener("click", () => onClose?.());
  return node;
}

/** A page's large title, with an optional line under it. */
export function pageTitle(title, sub) {
  return el("div", { class: "lx-page-head" }, el("h1", { part: "page-title" }, title), sub ? el("p", { class: "lx-muted" }, sub) : null);
}

/** Someone's initials in a circle. */
export function avatar(name, { size } = {}) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
  return el("span", { part: "avatar", "data-size": size, "aria-hidden": "true" }, initials);
}

/**
 * A theme drawn in its own colors, to pick from: a built-in one, or (with look, its content) one of yours, drawn
 * on its base theme with its own colors and its background image (imageUrl, a blob: URL).
 */
export function themeSwatch({ id, name, selected, onclick, look = null, imageUrl = null }) {
  // Only the little screen takes the theme's colors; the name stays in the page's own.
  const screen = el(
    "span",
    { class: "lx-swatch-screen", "data-theme-preview": look ? look.base : id, "aria-hidden": "true" },
    el("span", { class: "lx-swatch-card" }, el("i", { class: "lx-swatch-line" }), el("i", { class: "lx-swatch-line lx-swatch-short" })),
    el("span", { class: "lx-swatch-dots" }, el("i", { "data-swatch": "right" }), el("i", { "data-swatch": "wrong" }), el("i", { "data-swatch": "moved" })),
  );
  if (look) {
    // Set through the CSSOM, which the CSP allows (it forbids style attributes in markup). Token values were checked
    // when the theme was saved, so each stays one value.
    for (const [token, value] of Object.entries(look.tokens ?? {})) if (!token.startsWith("--image-")) screen.style.setProperty(token, value);
    if (imageUrl) {
      const size = look.tokens?.["--image-background-size"] ?? "cover";
      screen.style.setProperty("--swatch-image", `url("${imageUrl}")`);
      screen.style.setProperty("--swatch-size", /^(cover|contain)$/.test(size) ? "cover" : "36px");
      screen.style.setProperty("--swatch-repeat", look.tokens?.["--image-background-repeat"] ?? "no-repeat");
      screen.style.setProperty("--swatch-dim", look.tokens?.["--image-background-dim"] ?? "0%");
      screen.setAttribute("data-image", "");
    }
  }
  return el(
    "button",
    { part: "theme-swatch", type: "button", variant: look ? "yours" : undefined, "data-theme-id": id, "aria-pressed": String(Boolean(selected)), onclick },
    screen,
    el("span", { class: "lx-swatch-name" }, name),
  );
}

/** In-page navigation: links = [[href, label]]. */
export function subnav(links, active, label = t("core.sections")) {
  return el(
    "nav",
    { part: "subnav", "aria-label": label },
    links.map(([href, text]) => el("a", { part: "subnav-link", href, state: href === active ? "active" : undefined, "aria-current": href === active ? "true" : undefined }, text)),
  );
}

// ---------- study ----------

/** The top of a session: close, progress, step count. */
export function sessionBar({ onClose, closeHref, states = [], step = "", onGames = null }) {
  const close = closeHref
    ? el("a", { part: "icon-button", href: closeHref, "aria-label": t("core.endSession"), title: t("core.endSession") }, icon("cross"))
    : iconButton("cross", t("core.endSession"), { onclick: onClose });
  const count = el("span", { class: "lx-mono lx-small lx-muted lx-session-count" }, step);
  const games = onGames ? iconButton("sliders", t("core.chooseGames"), { onclick: onGames }) : null;
  const bar = el("div", { part: "session-bar" }, close, sessionProgress(states), count, games);
  bar.lxProgress = bar.querySelector('[data-part="session-progress"]');
  bar.lxCount = count;
  return bar;
}

export function activityPrompt(label, text) {
  return el("div", { part: "activity-prompt" }, el("span", {}, label), text ? el("p", {}, text) : null);
}

/** The bar under a step: its actions before an answer, the result and Continue after. */
export function answerBar(...children) {
  return el("div", { part: "answer-bar" }, el("div", {}, ...children));
}

// ---------- the library: sections, covers, books, asking your AI ----------

/**
 * A section's heading row: its title, and on the right a link to see all of it (section-link) or an info button.
 * variant sub: a smaller heading inside a section (a curated row of the open books).
 */
export function sectionHead(title, { link, info, sub = false } = {}) {
  return el(
    "div",
    { part: "section-head" },
    el(sub ? "h3" : "h2", { part: "section-title", variant: sub ? "sub" : undefined }, title),
    link ? el("a", { part: "section-link", href: link.href }, link.label ?? t("core.seeAll"), icon("chevron")) : null,
    info ? el("button", { part: "icon-button", type: "button", "aria-label": info.label, onclick: info.onclick }, icon("info")) : null,
  );
}

// A book's own small number (from its id, else its title), so the same book always gets the same cover color.
const coverSeed = (text = "") => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
// A book's paint: one of the art's paints for its objects, from its own number, the same wherever the book is drawn (Home's card, Read's
// shelves, Find a book): violet, clay or sun, each with the ink that reads on it (components.css). Never the book's own colors.
const COVER_PAINTS = ["violet", "clay", "sun"];
export const coverPaint = (seed = "") => COVER_PAINTS[coverSeed(String(seed)) % COVER_PAINTS.length];
const SVG_NS_COVER = "http://www.w3.org/2000/svg";
/** The cover's hard split, as the symbols draw one: its lit side, the far side in its deep tone, curving a little. */
function coverSplit() {
  const svg = document.createElementNS(SVG_NS_COVER, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("class", "lx-cover-split");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(SVG_NS_COVER, "path");
  path.setAttribute("d", "M62 0C64 34 61 70 52 100H100V0Z");
  svg.append(path);
  return svg;
}

/**
 * A book's cover. variant picture: its own picture; art: art made for it (an AI's SVG, shown only as an image, never
 * inline); type: neither, so a designed cover: a color picked from its id, its title large in a book face, a short
 * rule, and its author small. src: an image's URL; seed: its id (the color follows it); size: the picture's [width, height] when
 * known (the catalog's coverSize), so its box has its shape from the first frame, before the picture comes; assumed: that size is
 * a usual shape, not the picture's own, so the box keeps it once the picture comes and the picture sits whole inside it.
 */
export function bookCover({ title = "", by, src, art = false, lang, seed, size, assumed = false } = {}) {
  if (src) {
    // A picture that comes after its cover is drawn fades in, never pops: the cover's own color holds its place meanwhile (data-loaded),
    // at the picture's own shape when its size is known (an <img>'s width and height set its shape before it's loaded).
    const sized = Array.isArray(size) && size.length === 2 && size.every((n) => Number.isInteger(n) && n > 0);
    const img = el("img", { src, alt: "", loading: "lazy", decoding: "async", ...(sized ? { width: String(size[0]), height: String(size[1]) } : {}) });
    // The box keeps that shape once the picture comes, too: a picture of another (a size that was wrong, or only usual) sits whole inside it.
    if (sized) img.style.aspectRatio = `${size[0]} / ${size[1]}`;
    const cover = el("span", { part: "book-cover", variant: art ? "art" : "picture", "data-shape": sized ? (assumed ? "assumed" : "known") : undefined }, img);
    const shown = () => cover.setAttribute("data-loaded", "");
    if (img.complete && img.naturalWidth) shown();
    else img.addEventListener("load", shown, { once: true });
    return cover;
  }
  return el(
    "span",
    { part: "book-cover", variant: "type", "data-paint": coverPaint(seed ?? title) },
    coverSplit(),
    // A right-to-left title, and the rule under it, sit at the cover's right: the language's direction, or with no language
    // the title's own (auto; a title with its own dir would hide it from auto, so a known language decides).
    el("span", { class: "lx-cover-head", dir: (lang && dirFor(lang)) || "auto" }, el("span", { class: "lx-cover-title", lang }, title), el("span", { class: "lx-cover-rule" })),
    by ? el("span", { class: "lx-cover-by" }, by) : null,
  );
}

/** How far into a book you are, 0–1: a thin bar. */
export function bookProgress(share) {
  const value = Math.round(Math.max(0, Math.min(1, share)) * 100);
  const node = el("span", { part: "book-progress", role: "progressbar", "aria-label": t("core.bookRead", { share: value / 100 }), "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(value) }, el("span"));
  node.style.setProperty("--progress", String(value / 100));
  return node;
}

/**
 * A book on a shelf or in your library: its cover, its title, a line about it, and how far you are when you've
 * started it. cover: the cover's options (bookCover); href or onclick: what a press does; flag: { lang, label }, the
 * language it teaches, as a flag on the cover's bottom corner (a designed cover's title is at its top).
 */
export function bookTile({ title, sub, cover = {}, progress, href, onclick, lang, id, flag }) {
  const tag = href ? "a" : "button";
  const face = bookCover({ title, lang, seed: id, ...cover });
  const mark = flag ? languageFlag(flag.lang, { label: flag.label }) : null;
  // Loaded with its tile, wherever the tile is: a page come back to further down (a swipe back to Read) shows it whole, never arriving after.
  if (mark) mark.loading = "eager";
  if (mark) face.append(mark);
  // A title cover carries the title, so it's said once: under the cover, only what isn't on it (a picture's book keeps its title under it).
  const titled = face.getAttribute("data-variant") === "type";
  return el(
    tag,
    { part: "book-tile", href, type: tag === "button" ? "button" : undefined, onclick, "data-book": id, "aria-label": titled ? [title, sub].filter(Boolean).join(", ") : undefined },
    face,
    el("span", { class: "lx-tile-title", lang, hidden: titled || undefined }, title),
    sub ? el("span", { class: "lx-tile-sub" }, sub) : null,
    progress != null ? bookProgress(progress) : null,
  );
}

/** Books, as a grid (your library) or a row that scrolls sideways (a shelf). */
export const bookList = (tiles, { layout = "row", label } = {}) => el("div", { part: "book-list", variant: layout, "aria-label": label }, tiles);

/**
 * The book you're reading, to carry on: its cover, where you are, how much you'd follow, and the way back in.
 * action: { label, onclick } (the white button at the card's foot, in reach).
 */
export function continueCard({ cover, art = null, kicker, title, meta, progress, note, action, lang }) {
  return el(
    "section",
    { part: "continue-card", "aria-label": `${kicker}: ${title}`, "data-art": art ? "" : undefined },
    el(
      "div",
      { class: "lx-continue-top" },
      art ?? cover,
      el(
        "div",
        { class: "lx-continue-text" },
        // With the book drawn, what the card is is plain; the words stay for a screen reader.
        el("span", { class: art ? "lx-continue-kicker lx-visually-hidden" : "lx-continue-kicker" }, kicker),
        el("h2", { lang }, title),
        meta ? el("p", { class: "lx-continue-meta" }, meta) : null,
        progress != null ? bookProgress(progress) : null,
        note ? el("p", { class: "lx-continue-note" }, note) : null,
      ),
    ),
    action.variant === "go" ? button(action.label, { variant: "go", block: true, onclick: action.onclick }) : button(action.label, { variant: "white", size: "lg", block: true, icon: action.icon ?? "play", onclick: action.onclick }),
  );
}

/** A Copy button: copies getText()'s text, says so for a moment. */
export function copyButton(getText, { label = t("core.copy") } = {}) {
  const b = button(label, {
    size: "sm",
    icon: "copy",
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(getText());
        b.lastChild.textContent = t("core.copied");
      } catch {
        b.lastChild.textContent = t("core.selectToCopy");
      }
      setTimeout(() => (b.lastChild.textContent = label), 1400);
    },
  });
  return b;
}

/**
 * A way in through your AI, wherever you add your own: what it can do, prompts to copy into it (ask-prompt, each with
 * Copy), and a note (its prompt's name in Claude Code, say).
 */
export function askAi({ title, sub, prompts = [], note }) {
  return el(
    "section",
    { part: "ask-ai", "aria-label": title },
    el("div", { class: "lx-ask-head" }, icon("chat"), el("div", { class: "lx-ask-text" }, el("span", { class: "lx-ask-title" }, title), sub ? el("span", { class: "lx-ask-sub" }, sub) : null)),
    prompts.length ? el("ul", { class: "lx-ask-prompts" }, prompts.map((text) => el("li", { part: "ask-prompt" }, el("span", { class: "lx-ask-prompt-text" }, text), copyButton(() => text)))) : null,
    note ? el("p", { class: "lx-ask-note" }, note) : null,
  );
}

/**
 * A sheet over the page: on top of everything (the tabs, a session, the reader), the page showing through its shade
 * (sheet-scrim), not to be pressed or scrolled while it's open. A press on the shade, Escape, a drag down, a tap on the
 * handle or the page changing closes it; the shade follows a drag. It rides above the keyboard, and a field in it is
 * scrolled clear of the keys. Returns the layer, with lxBody (the sheet's content), lxOpen() and lxClose(options): it
 * puts itself over the page when it opens and takes itself off once it has gone.
 */
export function sheetLayer({ label, onClose } = {}) {
  let open = false;
  let opens = 0;
  let returnTo = null;
  let fade = null;
  const scrim = el("div", { part: "sheet-scrim", onclick: () => close() });
  const panel = sheet({ label, hidden: true, onClose: (options) => close(options) });
  const layer = el("div", { class: "lx-sheet-layer", hidden: true }, scrim, panel);
  layer.lxBody = panel.lxBody;
  layer.lxPanel = panel;
  panel.lxOnDrag = (progress) => scrim.style.setProperty("opacity", String(Math.max(0, 1 - progress)));
  const app = () => document.querySelector('[data-part="app"]');
  const pace = () => ({ duration: motion.duration("--dur-sheet", 500), easing: getComputedStyle(document.documentElement).getPropertyValue("--ease-sheet").trim() || "ease-out" });
  const onKey = (event) => event.key === "Escape" && close();
  const onAway = () => close({ animate: false });
  // A field it holds, scrolled clear of the edges of what's showing of its content: the screen above the keyboard (the
  // visual viewport), inside the sheet.
  const reveal = () => {
    const field = document.activeElement;
    const body = panel.lxBody;
    if (!field || !body.contains(field) || !field.matches("input, textarea, select, [contenteditable='true']")) return;
    const vv = globalThis.visualViewport;
    const port = body.getBoundingClientRect();
    // A form's pinned foot (pinnedActions) sits over the content's foot, above the keys: a field comes clear of it too.
    const foot = [...body.querySelectorAll('[data-part="pinned-actions"]')].find((node) => !node.closest("[hidden]") && !node.contains(field));
    // Its whole height, the fade at its top too: a field under the fade is as good as hidden.
    const footTop = foot ? foot.getBoundingClientRect().top : Infinity;
    const bottom = Math.min(vv ? Math.min(port.bottom, vv.offsetTop + vv.height) : port.bottom, footTop);
    const top = vv ? Math.max(port.top, vv.offsetTop) : port.top;
    const box = field.getBoundingClientRect();
    const pad = 12;
    if (box.bottom > bottom - pad) body.scrollTop += box.bottom - (bottom - pad);
    else if (box.top < top + pad) body.scrollTop -= top + pad - box.top;
  };
  // The keyboard: how much of the screen it covers (0 without one). It rides over the sheet, which keeps its height and
  // place; the sheet's content makes room for it at its foot (components.css, --lx-kb).
  const onViewport = () => {
    const vv = globalThis.visualViewport;
    const kb = vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;
    layer.style.setProperty("--lx-kb", `${Math.round(kb)}px`);
    reveal();
  };
  const onFocus = () => requestAnimationFrame(reveal);
  function close(options = {}) {
    if (!open) return;
    open = false;
    // The page is back at once, pressable and scrollable; the sheet takes no presses while it goes.
    layer.setAttribute("data-state", "closing");
    app()?.removeAttribute("inert");
    document.documentElement.removeAttribute("data-scroll-lock");
    removeEventListener("keydown", onKey);
    removeEventListener("hashchange", onAway);
    globalThis.visualViewport?.removeEventListener("resize", onViewport);
    panel.removeEventListener("focusin", onFocus);
    const from = getComputedStyle(scrim).opacity;
    scrim.style.setProperty("opacity", "0");
    fade?.cancel();
    fade = options.animate === false ? null : motion.animate(scrim, [{ opacity: from }, { opacity: 0 }], { ...pace(), fill: "none" });
    panel.lxHide({
      ...options,
      onHidden: () => {
        if (open) return;
        layer.hidden = true;
        layer.removeAttribute("data-state");
        layer.remove();
      },
    });
    if (returnTo?.isConnected && !returnTo.closest("[inert]")) returnTo.focus({ preventScroll: true });
    returnTo = null;
    onClose?.();
  }
  layer.lxOpen = () => {
    if (open) return;
    // The sheet that's up goes first, so its close can't undo what this one sets (the page inert, its scroll held).
    sheetAside(panel);
    open = true;
    returnTo = document.activeElement;
    if (layer.parentElement !== document.body) document.body.append(layer);
    layer.removeAttribute("data-state");
    layer.hidden = false;
    app()?.setAttribute("inert", "");
    document.documentElement.setAttribute("data-scroll-lock", "");
    addEventListener("keydown", onKey);
    addEventListener("hashchange", onAway);
    globalThis.visualViewport?.addEventListener("resize", onViewport);
    panel.addEventListener("focusin", onFocus);
    onViewport();
    fade?.cancel();
    // The shade comes in with the sheet, from the same frame (lxShow: once the frame it's laid out in has been drawn).
    if (motion.motionOn()) {
      scrim.style.setProperty("opacity", "0");
      const opening = ++opens;
      afterThisFrame(() => {
        if (!open || opening !== opens) return;
        scrim.style.removeProperty("opacity");
        fade = motion.animate(scrim, [{ opacity: 0 }, { opacity: 1 }], pace());
      });
    } else scrim.style.removeProperty("opacity");
    panel.lxShow();
    if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
  };
  layer.lxClose = close;
  return layer;
}

// ---------- menus ----------

/**
 * A short menu of actions: [{ icon, title, sub?, onclick }], each a menu-item. moreMenu opens one from a "…"; on its
 * own (as /design shows it) it sits where it's put.
 */
export function menu({ label, items }) {
  return el(
    "div",
    { part: "menu", role: "menu", "aria-label": label },
    items.map((item) =>
      el(
        "button",
        { part: "menu-item", type: "button", role: "menuitem", tabindex: "-1", onclick: item.onclick },
        icon(item.icon),
        el("span", { class: "lx-menu-text" }, el("span", { class: "lx-menu-title" }, item.title), item.sub ? el("span", { class: "lx-menu-sub" }, item.sub) : null),
      ),
    ),
  );
}

/**
 * A "…" that opens a menu of actions (menu's items) over everything, by the "…": below it when there's room, above it
 * when not, never off the screen's sides. under: an element (or a function giving one) to open below instead, such as
 * the small popover the "…" sits in, so what it's about stays in sight. A press outside, Escape, Tab, a scroll or a
 * resize closes it; an item closes it, then does what it says. Arrow keys, Home and End move between the items, and
 * while it's open no other key reaches the page under it.
 */
export function moreMenu({ label, items, under }) {
  const button = iconButton("more", label);
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  let open = null;
  const close = ({ focus = false } = {}) => {
    if (!open) return;
    const node = open;
    open = null;
    button.setAttribute("aria-expanded", "false");
    removeEventListener("pointerdown", onOutside, true);
    removeEventListener("keydown", onKey, true);
    removeEventListener("scroll", onScroll, true);
    removeEventListener("resize", onResize);
    motion.leave(node, { dx: 0, dy: 4 });
    node.remove();
    if (focus) button.focus({ preventScroll: true });
  };
  const onOutside = (event) => {
    if (!open?.contains(event.target) && !button.contains(event.target)) close();
  };
  const onScroll = (event) => !open?.contains(event.target) && close();
  const onResize = () => close();
  const onKey = (event) => {
    if (!open) return;
    if (event.key === "Tab") return close();
    event.stopPropagation();
    const choices = [...open.querySelectorAll('[data-part="menu-item"]')];
    const at = choices.indexOf(document.activeElement);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: choices.length - 1 }[event.key];
    if (event.key === "Escape") {
      event.preventDefault();
      close({ focus: true });
    } else if (to !== undefined) {
      event.preventDefault();
      choices[(to + choices.length) % choices.length]?.focus({ preventScroll: true });
    }
  };
  button.addEventListener("click", () => {
    if (open) return close();
    const node = menu({ label, items: items.map((item) => ({ ...item, onclick: () => (close({ focus: true }), item.onclick?.()) })) });
    node.classList.add("lx-menu-layer");
    document.body.append(node);
    open = node;
    button.setAttribute("aria-expanded", "true");
    const anchor = (typeof under === "function" ? under() : under) ?? button;
    const b = anchor.getBoundingClientRect();
    const m = node.getBoundingClientRect();
    const gap = 8;
    const edge = 12;
    const top = b.bottom + gap + m.height <= innerHeight - edge ? b.bottom + gap : Math.max(edge, b.top - gap - m.height);
    const left = Math.min(innerWidth - edge - m.width, Math.max(edge, anchor === button ? b.right - m.width : b.left));
    node.style.setProperty("top", `${top}px`);
    node.style.setProperty("left", `${left}px`);
    addEventListener("pointerdown", onOutside, true);
    addEventListener("keydown", onKey, true);
    addEventListener("scroll", onScroll, true);
    addEventListener("resize", onResize);
    motion.appear(node);
    node.querySelector('[data-part="menu-item"]')?.focus({ preventScroll: true });
  });
  button.lxClose = () => close();
  return button;
}

// ---------- asking your AI about something ----------

/** What a question is about, in the sheet you write it in: the thing itself (in its language), and a line on it. */
export function askAbout({ text, lang, meta }) {
  return el("div", { part: "ask-about" }, el("span", { class: "lx-ask-about-label" }, t("core.about")), el("span", { class: "lx-ask-about-text", lang }, text), meta ? el("span", { class: "lx-ask-about-meta" }, meta) : null);
}

/**
 * A line by what you asked about, saying what happened to the question: meaning right (sent, copied), wrong (it
 * couldn't go) or none (canceled), with an optional action (Undo). say(meaning, text, action) fills it; it takes no
 * room until then.
 */
export function askStatus() {
  const node = el("p", { part: "ask-status", role: "status", hidden: true });
  node.say = (meaning, text, action = null) => {
    node.hidden = false;
    if (meaning) node.setAttribute("data-meaning", meaning);
    else node.removeAttribute("data-meaning");
    node.replaceChildren(...[meaning ? icon(MEANING_ICON[meaning] ?? "sparkle") : null, el("span", {}, text), action].filter(Boolean));
    motion.appear(node);
  };
  // Something that didn't go: the words with Retry, Tinta beside them (retryLine).
  node.fail = (text, retry, options) => {
    node.hidden = false;
    node.setAttribute("data-meaning", "wrong");
    node.replaceChildren(retryLine(text, retry, options));
    motion.appear(node);
  };
  return node;
}

// ---------- Explore: finding packs ----------

/**
 * A search field with its icon: Enter (or the keyboard's search key) calls onsubmit with what's typed. label names it,
 * and shows in it until something's typed.
 */
export function searchField({ label, value = "", name = "q", onsubmit, oninput }) {
  const field = el("input", { part: "text-field", type: "search", name, value, placeholder: label, "aria-label": label, maxlength: 200, autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "search" });
  const form = el("form", { part: "search-field", role: "search" }, icon("search"), field);
  if (oninput) field.addEventListener("input", () => oninput(field.value));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onsubmit?.(field.value.trim());
  });
  return form;
}

/**
 * The languages to find packs in, the one you're learning first: [{ lang, name, sub, href, selected }], each with its
 * flag beside its name. A choice with onclick instead of href is a button (All languages, opening the rest).
 */
export function languageRow(choices, { label = t("core.languages") } = {}) {
  return el(
    "nav",
    { part: "language-row", "aria-label": label },
    choices.map((c) =>
      el(
        c.href ? "a" : "button",
        { part: "language-choice", href: c.href, type: c.href ? undefined : "button", onclick: c.onclick, state: c.selected ? "selected" : undefined, "aria-current": c.selected ? "page" : undefined },
        el("span", { class: "lx-choice-name" }, c.lang ? languageFlag(c.lang) : null, c.name),
        c.sub ? el("span", { class: "lx-choice-sub" }, c.sub) : null,
      ),
    ),
  );
}

/**
 * A sentence from a pack: the sentence, its literal line when it has one, and its natural English. onMore: its own
 * "…" menu (without it, none); or more, a "…" made already (moreMenu), with status, a line under the sentence about
 * what it did (askStatus). lang: the sentence's language.
 */
// Two English lines with the same words (case, marks and spacing aside): the word-for-word line that adds nothing to the translation.
const lineWords = (value) => (typeof value === "string" ? value : Array.isArray(value) ? value.map(lineWords).join("") : value?.textContent ?? "").normalize("NFKC").toLocaleLowerCase("en").replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();

/** Whether two English lines say the same words (case, marks and spacing aside): a word-for-word line that adds nothing to the translation. */
export const sameEnglish = (a, b) => Boolean(a && b) && lineWords(a) === lineWords(b);

export function sentenceRow({ text, words, literal, punct, natural, lang, onMore, moreLabel = t("core.moreAboutSentence"), more, status }) {
  // A word-for-word line that says just what the translation says would be the same English twice: the translation alone shows.
  const literalAdds = Array.isArray(literal) && !sameEnglish(literal.map((chunk) => chunk.text).join(" "), natural);
  // Its words, when given ([text | { text, reading, hidden }] as a study card's, the end mark after the last), draw it
  // with their readings; else its text, in the language's typography (French: a narrow space before ? and !:
  // lang/index.js typeset).
  const shown = Array.isArray(words) && words.length
    ? words.flatMap((word, i) => {
        const last = i === words.length - 1 && punct ? (typeof word === "string" ? word + punct : { ...word, text: wordText(word) + punct }) : word;
        return [i ? space(lang) : null, ...wordNodes(last, lang)];
      })
    : [typeset(lang, text)];
  return el(
    "div",
    { part: "sentence-row" },
    el(
      "div",
      { class: "lx-sentence-text" },
      el("p", { class: "lx-sentence-nl", lang, dir: dirFor(lang) ?? undefined }, ...shown),
      literalAdds ? literalLine({ literal, punct, words, text }, { lang }) : null,
      natural ? el("p", { class: "lx-sentence-en" }, natural) : null,
      status ?? null,
    ),
    onMore ? iconButton("more", moreLabel, { onclick: onMore }) : more ?? null,
  );
}

/**
 * One pack to start with: why (kicker), its title, a line about it, its facts (language: its language, whose flag leads
 * them), and a sentence from it (sentenceRow).
 */
export function featuredPack({ kicker, title, about, meta, language, sample, href, character: tinta = null, cover = null }) {
  return el(
    "a",
    { part: "featured-pack", href },
    // Tinta presenting the pack (present), in its top corner, its curl over the title.
    tinta,
    cover,
    el(
      "span",
      { class: "lx-feature-text" },
      kicker ? el("span", { class: "lx-feature-kicker" }, kicker) : null,
      el("h2", {}, title),
      about ? el("span", { class: "lx-feature-about" }, about) : null,
      meta ? el("span", { class: "lx-feature-meta" }, language ? languageFlag(language) : null, meta) : null,
    ),
    sample ?? null,
  );
}

/** Topics as tiles: [{ name, icon, href }]. */
export const topicGrid = (topics, { label = t("core.topics") } = {}) =>
  el("nav", { part: "topic-grid", "aria-label": label }, topics.map((t) => el("a", { part: "topic-tile", href: t.href }, icon(t.icon ?? "tag"), el("span", {}, t.name))));

/** A pack on a shelf: its title, a line about it, its facts (language · level · size · who), its flag leading them. */
export function packCard({ title, about, meta, language, href, cover = null }) {
  return el(
    "a",
    { part: "pack-card", href },
    cover,
    el("span", { class: "lx-pack-title" }, title),
    about ? el("span", { class: "lx-pack-about" }, about) : null,
    meta ? el("span", { class: "lx-pack-meta" }, language ? languageFlag(language) : null, meta) : null,
  );
}

/** Packs in a row that scrolls sideways. */
export const packShelf = (cards, { label } = {}) => el("div", { part: "pack-shelf", "aria-label": label }, cards);

/**
 * A form's or a page's main action pinned low, in reach, above the tab bar on a page and at a sheet's foot (above the keys
 * while they're up): a line about it, what the last press said (status: a role=status line, so a "Pick a reason first."
 * shows by the button, not out of view), then its buttons (the first the main one). Every form with one main action uses it.
 */
export const pinnedActions = (buttons, { note, status } = {}) =>
  el("div", { part: "pinned-actions" }, note ? el("p", { class: "lx-pinned-note" }, note) : null, status ?? null, el("div", { class: "lx-pinned-buttons" }, buttons));

/**
 * Flags for a place that changes language (Translate's names, its way): each code's flag made once, loaded at once
 * and decoded before it's drawn, and the same element each time it's shown, so changing language never shows a flag
 * blank while a new one loads. preload: codes to fetch now. Returns flagFor(code) (null for a language with none).
 */
export function steadyFlags(preload = []) {
  const made = new Map();
  const flagFor = (code) => {
    if (!made.has(code)) made.set(code, languageFlag(code));
    return made.get(code);
  };
  for (const code of preload) flagFor(code);
  return flagFor;
}

// A flag is drawn in the frame it's put on the page: asked for at once and decoded with the paint. A lazy image waits for its own look after
// layout, cached or not, and an async one paints a frame later: a page sliding in showed its flags a moment late (the WebKit sweep, 7 Nov), and
// Study's header drawn anew under a leaving session showed an empty chip. So every flag a page shows at first is steady, and only a long list's
// rows past its first screenful (lazy: true, from FLAG_ROWS_SHOWN on) wait to be near the screen: the 75 languages don't all load at once.
// And a flag drawn again is drawn from the page's own copy: WebKit sends every new <img> through the service worker, even one of a flag on the
// screen already, so a page's redraw showed it blank for 1 to 3 frames, and 18 under load (measured 7 Nov; no worker, none). Once a flag has
// loaded, its bytes are kept as a decoded blob: URL (keepFlag) and every later one takes it as its srcset, which draws at once in every engine;
// its src stays the flag's address.
export const FLAG_ROWS_SHOWN = 14; // a long list's rows a tall phone shows before any scrolling, and a few more
const flagsKept = new Map(); // a flag's address → { url: its blob: URL, img: an image of it, decoded, held so it stays decoded }
const flagsKeeping = new Map(); // a flag's address → its keeping, under way
function keepFlag(src) {
  if (flagsKept.has(src)) return Promise.resolve();
  if (flagsKeeping.has(src)) return flagsKeeping.get(src);
  const keeping = fetch(src)
    .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(String(response.status)))))
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.src = url;
      return img.decode().then(
        () => void flagsKept.set(src, { url, img }),
        (error) => (URL.revokeObjectURL(url), Promise.reject(error)),
      );
    })
    .catch(() => {}) // offline with no copy, say: the flag is drawn from its address, as before
    .finally(() => flagsKeeping.delete(src));
  flagsKeeping.set(src, keeping);
  return keeping;
}

/**
 * A language's flag, to sit beside its name or code: an image, or null for a language without one. size lg: a larger
 * one (a language's own page or picker). label: its alt text, where no name sits beside it (a book tile's corner).
 * lazy: a long list's row past its first screenful (FLAG_ROWS_SHOWN), loading as it comes near; one kept already never waits.
 */
export function languageFlag(lang, { size, label = "", lazy = false } = {}) {
  const src = flagOf(lang);
  if (!src) return null;
  const kept = flagsKept.get(src);
  const waits = lazy && !kept;
  const img = el("img", { part: "language-flag", src, srcset: kept?.url, alt: label, width: "20", height: "15", loading: waits ? "lazy" : "eager", decoding: waits ? "async" : "sync", "data-size": size });
  if (!kept) img.addEventListener("load", () => void keepFlag(src), { once: true });
  return img;
}

/** Loads these languages' flags ahead and keeps them (the ones every screen shows: the language you learn, the one you learn it from). */
export function warmFlags(langs) {
  for (const lang of langs) {
    const src = flagOf(lang);
    if (src) void keepFlag(src);
  }
}

// ---------- the AI tab: your AI, and the requests you leave it ----------

/**
 * Your AI at a glance: who checked in last and when (state on), or that none is connected yet (off), with a line on how
 * it works and an action (a node: Connect, say).
 */
export function aiStatus({ connected, who, when, note, action, title = t("core.ai.none"), character: tinta = null }) {
  return el(
    "section",
    { part: "ai-card", state: connected ? "on" : "off", "aria-label": t("core.ai.yours") },
    // Tinta beside your AI (beside; scribble while it works; catch when it's done), in the card's top corner.
    tinta,
    el("p", { class: "lx-ai-who" }, icon(connected ? "check" : "plug"), el("span", {}, connected && when ? t("core.ai.lastHere", { who: el("strong", {}, who), when }) : el("strong", {}, connected ? who : title))),
    note ? el("p", { class: "lx-ai-note" }, note) : null,
    action ?? null,
  );
}

/** The kinds of request, as tiles: [{ icon, title, sub, href }]. */
export const requestKinds = (kinds, { label = t("core.ai.canAsk") } = {}) =>
  el(
    "nav",
    { part: "request-kinds", "aria-label": label },
    kinds.map((k) => el("a", { part: "request-kind", href: k.href }, icon(k.icon), el("span", { class: "lx-kind-text" }, el("span", { class: "lx-kind-title" }, k.title), k.sub ? el("span", { class: "lx-kind-sub" }, k.sub) : null))),
  );

const REQUEST_MARK = { waiting: "clock", working: "refresh", done: "check", failed: "cross", canceled: "skip" };

/**
 * One request you left: what it is (symbol: its kind's quiet symbol, else icon on its tile), where it is (state: waiting · working ·
 * done · failed · canceled; an icon and the words, never the color alone) and one way on: href opens it, action is a node beside it
 * (Cancel, say).
 */
export function requestRow({ state, icon: name, symbol: symbolName, title, status, href, action }) {
  return el(
    "li",
    { part: "request-row", state },
    el(
      href ? "a" : "div",
      { class: "lx-request-main", href },
      symbolName && SYMBOL_NAMES.includes(symbolName) ? symbol(symbolName, { size: 30 }) : el("span", { class: "lx-row-icon" }, icon(name)),
      el("span", { class: "lx-request-text" }, el("span", { class: "lx-request-title" }, title), el("span", { class: "lx-request-status" }, icon(REQUEST_MARK[state] ?? "clock"), status)),
      href ? icon("chevron") : null,
    ),
    action ?? null,
  );
}

/**
 * The games as large buttons, three to a row: [{ title, icon, art?, href?, onclick?, state?, kind? }]. art: a drawn symbol, else icon. state "unavailable": it can't
 * play here, drawn quieter, and its onclick says why; it stays pressable.
 */
export const wayTiles = (ways, { label = t("core.oneGame") } = {}) =>
  el(
    "nav",
    { part: "way-tiles", "aria-label": label },
    ways.map((w) =>
      el(
        w.href ? "a" : "button",
        { part: "way-tile", href: w.href, type: w.href ? undefined : "button", onclick: w.onclick, state: w.state, "data-game": w.kind },
        el("span", { class: "lx-way-art", ...(w.state === "unavailable" ? { "data-art": "theme" } : {}) }, w.art ?? icon(w.icon)),
        el("span", { class: "lx-way-name" }, w.title),
      ),
    ),
  );
