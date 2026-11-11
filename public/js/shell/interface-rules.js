// The rules of the app's own language (Settings → Language; shell/interface-language.js keeps the settings on the device and applies
// them). Pure, no DOM, so Node's tests hold them (scripts/test-interface-language.mjs):
// - which of the device's languages Lexicommons knows, the first run's first offers;
// - the settings as kept, and what they decide: the locale the app's words are shown in, and whether Grow is on;
// - Grow: with the app's words in the language you speak, each message turns into the language you're learning once you know every word
//   of it, counted and formatted in that language.
import { tokenize } from "../read/book-format.js";
import { LANGUAGES } from "../lang/index.js";
import { parseMessage } from "../lx/i18n.js";

// A device's language tag as Lexicommons' code, where the two differ: older codes (Hebrew's iw), Filipino as Tagalog, Norwegian's
// written standards as Bokmål.
const ALIASES = { fil: "tl", iw: "he", in: "id", ji: "yi", no: "nb", nn: "nb" };

/** A device's language tag ("en-GB", "pt-BR", "zh-TW") as the language Lexicommons knows it by, or null. */
export function languageOfTag(tag) {
  let parsed;
  try {
    parsed = new Intl.Locale(String(tag)).maximize();
  } catch {
    return null;
  }
  const base = ALIASES[parsed.language] ?? parsed.language;
  // Chinese written in traditional characters (Taiwan, Hong Kong, Macau) is its own language here.
  if (base === "zh" && parsed.script === "Hant" && Object.hasOwn(LANGUAGES, "zh-Hant")) return "zh-Hant";
  return Object.hasOwn(LANGUAGES, base) ? base : null;
}

/** The device's languages (navigator.languages) Lexicommons knows, each once, in the device's order. */
export function deviceLanguagesOf(tags) {
  const out = [];
  for (const tag of tags ?? []) {
    const code = tag ? languageOfTag(tag) : null;
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

/** The settings as kept (any JSON): { speak: a language or null, app: a code or null, grow: true only when set so }. */
export function settingOf(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { speak: null, app: null, grow: false };
  return {
    speak: typeof value.speak === "string" && Object.hasOwn(LANGUAGES, value.speak) ? value.speak : null,
    app: typeof value.app === "string" && Object.hasOwn(LANGUAGES, value.app) ? value.app : null,
    grow: value.grow === true,
  };
}

/** The language you speak: as set, else the device's first one Lexicommons knows, else null (never assumed). */
export const speakerOf = (setting, device) => setting.speak ?? device[0] ?? null;

/** What App language can be set to: a shipped locale other than the language you speak, else null ("Same as I speak"). */
export const appLanguageFor = (code, { shipped, speak }) => (typeof code === "string" && shipped.includes(code) && code !== speak ? code : null);

/**
 * What the settings decide: { code, wanted, fallback, canGrow, growInto }.
 * - wanted: the language asked for the app's words (App language, else the language you speak, else English);
 * - code: the locale they're shown in: wanted when it's shipped, else English (fallback true);
 * - canGrow: whether Grow could work: the language you're learning is shipped and isn't the one you speak;
 * - growInto: the language they grow into now: Grow on, the app in the language you speak (no App language), and canGrow.
 */
export function decide(setting, { device, shipped, learning }) {
  const speak = speakerOf(setting, device);
  const wanted = setting.app ?? speak ?? "en";
  const code = shipped.includes(wanted) ? wanted : "en";
  const canGrow = shipped.includes(learning) && learning !== speak && learning !== code;
  const growInto = setting.grow && !setting.app && canGrow ? learning : null;
  return { code, wanted, fallback: code !== wanted, canGrow, growInto };
}

// A word as it's matched: no punctuation around it, lowercase in its language.
const bare = (text, lang) => text.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "").toLocaleLowerCase(LANGUAGES[lang]?.locale ?? lang);
// Something to read, not a number or a sign.
const isWord = (text) => /\p{L}/u.test(text);

/** The text a message shows whatever its values are: every literal part, every option of a plural or select. */
function literalText(parts, out = []) {
  for (const part of parts) {
    if (typeof part === "string") out.push(part);
    else if (part.options) for (const option of Object.values(part.options)) literalText(option, out);
  }
  return out;
}

/**
 * The words of a message in lang, as they're matched (lowercase, no punctuation), each once: from its literal text, never its values.
 * A language written with spaces is split as its books and packs are (book-format.js tokenize); one without (Japanese, Chinese) by
 * Intl.Segmenter's words. Throws if the message doesn't read.
 */
export function wordsOfMessage(text, lang) {
  const literal = literalText(parseMessage(text));
  const words = new Set();
  for (const piece of literal) {
    const tokens =
      (LANGUAGES[lang]?.segmenter ?? "spaces") === "spaces"
        ? tokenize(piece, lang)
        : [...new Intl.Segmenter(LANGUAGES[lang]?.locale ?? lang, { granularity: "word" }).segment(piece)].filter((s) => s.isWordLike).map((s) => s.segment);
    for (const token of tokens) {
      const word = bare(token, lang);
      if (word && isWord(word)) words.add(word);
    }
  }
  return [...words];
}

/**
 * Which keys have grown: the keys of strings (the language you're learning's, readStrings' Map) whose every word you know. lang: that
 * language; lemmaOf(form) → the dictionary form a written form is of, or undefined (a word no pack has); known(lemma) → whether you know
 * it. A grown message is counted and formatted in lang (lx/i18n.js t(), the chooser's { locale, strings }). A message with no words of its
 * own (only values and signs) never grows on its own; nor does one that doesn't read.
 */
export function grownKeys(strings, { lang, lemmaOf, known }) {
  const grown = new Set();
  if (!strings?.size) return grown;
  for (const [key, text] of strings) {
    let words;
    try {
      words = wordsOfMessage(text, lang);
    } catch {
      continue;
    }
    if (!words.length) continue;
    if (words.every((word) => {
      const lemma = lemmaOf(word);
      return lemma !== undefined && lemma !== null && known(lemma);
    }))
      grown.add(key);
  }
  return grown;
}
