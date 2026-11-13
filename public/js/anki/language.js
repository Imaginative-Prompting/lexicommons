// Working out which language a deck teaches, from what it says about itself and what's in it. In order of trust: a
// template that reads a field aloud in a locale, a field or deck named for a language, the script, then the letters and
// common words. It answers with how sure it is: unsure, the page asks. Data is short and local, because this runs in the
// parser's worker, which never loads the language registry. test-anki.mjs holds every code here to the registry's. The common words
// themselves are lang/common-words.js's (the study path reads them too, without this file).

import { TABLE, WORDS, tokensOf } from "../lang/common-words.js";

export const DETECTABLE = Object.keys(TABLE);

const SCRIPTS = [
  [/[぀-ヿ]/u, "kana"],
  [/[가-힯ᄀ-ᇿ]/u, "hangul"],
  [/[一-鿿㐀-䶿]/u, "han"],
  [/[Ѐ-ӿ]/u, "cyrillic"],
  [/[؀-ۿݐ-ݿ]/u, "arabic"],
  [/[֐-׿]/u, "hebrew"],
  [/[ऀ-ॿ]/u, "devanagari"],
  [/[઀-૿]/u, "gujarati"],
  [/[਀-੿]/u, "gurmukhi"],
  [/[฀-๿]/u, "thai"],
  [/[Ͱ-Ͽἀ-῿]/u, "greek"],
  [/[԰-֏]/u, "armenian"],
  [/[Ⴀ-ჿ]/u, "georgian"],
  [/\p{Script=Latin}/u, "latin"],
];

// A script with one language: certain. Those with several: decided below.
const ONE = { kana: "ja", hangul: "ko", gujarati: "gu", gurmukhi: "pa", thai: "th", greek: "el", armenian: "hy", georgian: "ka" };

const scriptOf = (text) => {
  // Kana first, since Japanese is written with Chinese characters too.
  for (const [pattern, name] of SCRIPTS) if (pattern.test(text)) return name;
  return "";
};

const SIMPLIFIED = /[这们说国来时对个门见关现经发东车书学习话语长马鸟鱼]/;
const TRADITIONAL = /[這們說國來時對個門見關現經發東車書學習話語長馬鳥魚]/;
const CANTONESE = /[係嘅咗唔佢哋喺冇嗰啲]/;

/** What a side's sample looks like: { code, sure, score, second }, code null when it can't be told at all. */
export function languageOfSample(texts) {
  const sample = texts.filter(Boolean);
  if (!sample.length) return { code: null, sure: false, score: 0 };
  const counts = new Map();
  for (const text of sample) {
    const script = scriptOf(text);
    if (script) counts.set(script, (counts.get(script) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { code: null, sure: false, score: 0 };
  const hasKana = counts.has("kana");
  const script = hasKana && counts.get("kana") >= sample.length * 0.05 ? "kana" : ranked[0][0];
  if (ONE[script]) return { code: ONE[script], sure: true, score: 1 };
  const all = sample.join("\n");
  if (script === "han") {
    if (CANTONESE.test(all)) return { code: "yue", sure: false, score: 0.6 };
    const simple = (all.match(new RegExp(SIMPLIFIED.source, "g")) ?? []).length;
    const traditional = (all.match(new RegExp(TRADITIONAL.source, "g")) ?? []).length;
    if (simple > traditional * 3 && simple >= 2) return { code: "zh", sure: true, score: 0.9 };
    if (traditional > simple * 3 && traditional >= 2) return { code: "zh-Hant", sure: true, score: 0.9 };
    return { code: "zh", sure: false, score: 0.5 };
  }
  // Word and letter counts over this script's languages.
  const candidates = {
    cyrillic: ["ru", "uk", "bg", "be", "mk", "sr", "kk"],
    arabic: ["ar", "fa", "ur", "ps", "ckb"],
    hebrew: ["he", "yi"],
    devanagari: ["hi", "mr", "ne"],
    latin: Object.keys(TABLE).filter((code) => TABLE[code][2] && /\p{Script=Latin}/u.test(TABLE[code][2])),
  }[script];
  if (!candidates) return { code: null, sure: false, score: 0 };
  const tokens = sample.flatMap(tokensOf);
  const scores = candidates.map((code) => {
    const words = WORDS.get(code);
    const hits = tokens.filter((token) => words.has(token)).length;
    const letters = TABLE[code][1];
    let marks = 0;
    if (letters) for (const c of all.toLowerCase()) if (letters.includes(c)) marks++;
    return { code, score: hits / Math.max(1, tokens.length) + (0.3 * marks) / Math.max(1, all.length) };
  });
  scores.sort((a, b) => b.score - a.score);
  const [first, second] = scores;
  if (first.score <= 0) return { code: null, sure: false, score: 0 };
  // Sure only with a real count and a clear lead: a list of nouns often has neither.
  const sure = tokens.length >= 20 && first.score >= 0.06 && first.score >= second.score * 2;
  return { code: first.code, sure, score: first.score, second: second?.code };
}

const NAME_TO_CODE = (() => {
  const out = [];
  for (const [code, [names]] of Object.entries(TABLE)) {
    // Two-word names first ("traditional chinese", "scottish gaelic"), so the longer one wins.
    for (const name of names.match(/traditional chinese|scottish gaelic|haitian creole|sorani kurdish|bahasa indonesia|tiếng việt|tieng viet|ʻōlelo hawaiʻi|\S+/g) ?? []) if (name.length >= 2) out.push([name, code]);
  }
  return out.sort((a, b) => b[0].length - a[0].length);
})();

const CODE_OF_LOCALE = { nl: "nl", de: "de", en: "en", fr: "fr", es: "es", it: "it", pt: "pt", sv: "sv", nb: "nb", no: "nb", nn: "nb", da: "da", fi: "fi", pl: "pl", cs: "cs", sk: "sk", hu: "hu", ro: "ro", tr: "tr", id: "id", ms: "ms", vi: "vi", tl: "tl", fil: "tl", ca: "ca", eu: "eu", gl: "gl", hr: "hr", bs: "bs", sl: "sl", et: "et", lv: "lv", lt: "lt", sq: "sq", is: "is", ga: "ga", cy: "cy", af: "af", sw: "sw", ru: "ru", uk: "uk", bg: "bg", be: "be", mk: "mk", sr: "sr", kk: "kk", ar: "ar", fa: "fa", ur: "ur", ps: "ps", he: "he", iw: "he", yi: "yi", hi: "hi", mr: "mr", ne: "ne", gu: "gu", pa: "pa", el: "el", hy: "hy", ka: "ka", th: "th", ko: "ko", ja: "ja", zh: "zh", yue: "yue" };

/** A template's TTS locale ("nl_NL", "zh-TW") as a language code, or null. */
export function codeOfLocale(locale) {
  if (typeof locale !== "string") return null;
  const lower = locale.toLowerCase().replace("-", "_");
  if (lower === "zh_tw" || lower === "zh_hk") return lower === "zh_hk" ? "yue" : "zh-Hant";
  return CODE_OF_LOCALE[lower.split("_")[0]] ?? null;
}

/** Languages a name mentions, as whole words (a deck's or a field's), in the order it names them. */
export function languagesNamed(text) {
  if (typeof text !== "string" || !text) return [];
  const lower = text.toLowerCase();
  const found = [];
  for (const [name, code] of NAME_TO_CODE) {
    // Han, kana and Hangul have no spaces to mark a word; the others need a word's edges.
    const at = /[぀-鿿가-힯]/.test(name) ? lower.indexOf(name) : lower.search(new RegExp(`(?<![\\p{L}\\p{M}])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{M}])`, "u"));
    if (at >= 0 && !found.some((entry) => entry.code === code)) found.push({ code, at });
  }
  return found.sort((a, b) => a.at - b.at).map((entry) => entry.code);
}

/**
 * Which language a deck teaches, and which side is which:
 *   { language, from, swap, sure, unsureAbout } swap: its fronts are in `from`, so its sides change places; language
 *   null when it can't be told; unsureAbout: "language" or "side", what to ask.
 * sides: { fronts, backs } text samples; hints: { frontTts, backTts, frontNames, backNames, deckNames }, what its
 * templates and names say.
 */
export function detectLanguage({ fronts, backs }, { frontTts = null, backTts = null, frontNames = [], backNames = [], deckNames = [] } = {}) {
  const front = languageOfSample(fronts);
  const back = languageOfSample(backs);
  const told = (tts, names, seen) => tts ?? names[0] ?? (seen.sure ? seen.code : null);
  const f = told(frontTts, frontNames, front);
  const b = told(backTts, backNames, back);
  const named = deckNames.filter((code) => code !== "en");
  const done = (language, from, swap, sure, unsureAbout = null) => ({ language, from: from && from !== language ? from : language === "en" ? null : "en", swap, sure, unsureAbout });
  // Both sides told apart: the one that isn't English is the one being learned, or the one the deck is named for.
  if (f && b && f !== b) {
    if (b === "en") return done(f, "en", false, true);
    if (f === "en") return done(b, "en", true, true);
    if (named.includes(b) && !named.includes(f)) return done(b, f, true, true);
    if (named.includes(f) && !named.includes(b)) return done(f, b, false, true);
    // Two languages and nothing to say which: a deck's fronts are what it asks about.
    return done(f, b, false, false, "side");
  }
  // One side told: the other's taken from the deck's name or its likeliest reading.
  if (f && f !== "en") return done(f, back.code && back.code !== f ? back.code : "en", false, Boolean(back.code === "en" || frontTts || frontNames.length));
  if (b && b !== "en") return done(b, front.code && front.code !== b ? front.code : "en", true, Boolean(front.code === "en" || backTts || backNames.length));
  // English on the side we can tell: the other side, by its name or its likeliest guess.
  const other = f === "en" ? back : b === "en" ? front : null;
  const swap = f === "en";
  if (other) {
    if (named[0]) return done(named[0], "en", swap, true);
    if (other.code && other.code !== "en") return done(other.code, "en", swap, false, "language");
    return { language: null, from: "en", swap, sure: false, unsureAbout: "language" };
  }
  // Neither side told: the deck's own name is the next best word, with its sides as they are unless the back reads like it.
  if (named[0]) return done(named[0], "en", back.code === named[0] && front.code !== named[0], true);
  const guess = front.code && front.code !== "en" ? front.code : back.code && back.code !== "en" ? back.code : null;
  return guess ? done(guess, "en", guess !== front.code, false, "language") : { language: null, from: "en", swap: false, sure: false, unsureAbout: "language" };
}
