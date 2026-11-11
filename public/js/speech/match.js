// What was said against what was expected, word by word. Pure (no DOM), so typed answers, both recognizers and the
// tests in Node all use the same rules.
//
//   match(expected, heard, { lang, accept, readings })
//     expected  the sentence as written ("Ik heb gisteren een boek gelezen.") or its words as an array, so a game can
//               line the result up with its own word list by index (always the array in a language written without
//               spaces: Japanese, Chinese)
//     heard     what a recognizer heard (a string), or several guesses (an array): the closest one is used
//     accept    other sentences that count as right ("Kan je…" beside "Kun je…")
//     readings  [[word, reading]]: in Japanese, a word with kanji heard or typed in its reading (わたし for 私)
//               counts as the word
// In a language written without spaces, both sides are compared character by character, and each word's result comes
// from its characters; numbers written as digits count as the same number in kanji (7時 for 七時).
//   → { ok, score, expected, heard, words: [{ text, heard, result }], extra: [words heard that match nothing] }
//
// Each expected word's result:
//   right    said (case, punctuation, accents, numbers written as digits and short forms like 't or m'n don't count)
//   close    said nearly: one or two sounds off ("gelese" for "gelezen")
//   order    said, but somewhere else in the sentence: a word-order slip
//   wrong    something else was said in its place
//   missing  nothing was said for it

import { LANGUAGES } from "../lang/index.js";
import { foldKana, romajiGuesses } from "../lang/romaji.js";

const isJoined = (lang) => LANGUAGES[lang]?.separator === "";

const FILLERS = new Set(["eh", "ehm", "euh", "uh", "uhm", "um", "hm", "hmm", "mm", "mmm", "ah", "oh"]);

// Short and full forms that sound different but say the same thing.
const SAME = {
  nl: [
    ["het", "t"],
    ["een", "n"],
    ["mijn", "m'n", "mn", "me"],
    ["zijn", "z'n", "zn"],
    ["haar", "d'r", "dr", "der"],
    ["je", "jij"],
    ["jouw", "je"],
    ["we", "wij"],
    ["ze", "zij"],
    ["me", "mij"],
    ["u", "uw"],
  ],
  en: [],
};

// ---------- normalizing ----------

const fold = (word) => word.normalize("NFD").replace(/[\u0300-\u036f\u200C\u200D]/g, "").replace(/['\u2019`-]/g, "");

// The languages whose numbers are written out here (cardinal, ordinal). In any other, digits stay digits on both sides,
// never another language's number words.
const NUMBER_WORDS = new Set(["nl", "en"]);

/** Lower case, apostrophes made plain, numbers written out (in a language that has them here), punctuation gone; then split into words. */
export function words(text, lang = "nl") {
  if (isJoined(lang)) return characters(text, lang);
  // A letter keyboards type as an apostrophe (Hawaiian's ʻokina, Uzbek's ʻ and ʼ): every apostrophe-like mark is
  // that letter, so Hawai'i is Hawaiʻi and o'zbek is oʻzbek, kept inside the word.
  const letter = typeof lang === "string" && Object.hasOwn(LANGUAGES, lang) ? LANGUAGES[lang].apostropheLetter : undefined;
  const plain = String(text)
    .normalize("NFC")
    .toLowerCase()
    .replace(/['\u2018\u2019`\u00B4\u02BB\u02BC]/g, (mark) => letter ?? mark)
    .replace(/[\u2018\u2019`\u00b4\u055A]/g, "'")
    .replace(/[\u2010-\u2015]/g, "-");
  const spelled = !NUMBER_WORDS.has(lang)
    ? plain
    : plain
        // 8:30 and 8.30 uur: a time, said "acht uur dertig"
        .replace(/\b([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*uur\b)?/g, (_, h, m) =>
          lang === "nl" ? `${Number(h)} uur${m === "00" ? "" : ` ${Number(m)}`}` : `${Number(h)}${m === "00" ? "" : ` ${Number(m)}`}`,
        )
        // 1.000 and 1 000: thousands
        .replace(/(\d)[.\u00a0 ](?=\d{3}\b)/g, "$1")
        .replace(/\u20ac\s*(\d+(?:[.,]\d+)?)/g, "$1 euro")
        .replace(/(\d+(?:[.,]\d+)?)\s*%/g, "$1 procent")
        .replace(/(\d+)(?:e|ste|de|st|nd|rd|th)\b/g, (_, n) => ordinal(Number(n), lang))
        // 2,5: a decimal, "twee komma vijf"
        .replace(/(\d+)[.,](\d+)/g, (_, a, b) => {
          const after = b.startsWith("0") ? [...b].map((d) => cardinal(Number(d), lang)).join(" ") : cardinal(Number(b), lang);
          return `${cardinal(Number(a), lang)} ${lang === "nl" ? "komma" : "point"} ${after}`;
        })
        .replace(/\d+/g, (n) => ` ${cardinal(Number(n), lang)} `);
  return spelled
    // Armenian's marks inside a word come off and leave it whole: emphasis ՛, exclamation ՜, question ՞
    // (Ինչպե՞ս) and abbreviation ՟; its apostrophe ՚ is an apostrophe (above)
    .replace(/[\u055B\u055C\u055E\u055F]/gu, "")
    .replace(/[^\p{L}\p{M}\p{N}\u200C\u200D'\s-]/gu, " ")
    .split(/[\s-]+/)
    // Apostrophes only inside a word or at the front of 't, 'n, 's
    .map((word) => word.replace(/^'+(?![tns]$)|'+$/g, ""))
    .filter((word) => word && !/^'+$/.test(word));
}

// A language written without spaces, as its characters: full-width letters and digits made plain, numbers as kanji
// numerals, punctuation and spaces gone. Japanese's kana as one: katakana as hiragana and ー as the vowel it lengthens (lang/romaji.js
// foldKana), so what's typed in romaji or in either kana is compared with what's written by how it's said (コーヒー: こおひい).
function characters(text, lang) {
  const plain = String(text).normalize("NFKC").toLowerCase().replace(/\d+/g, (n) => kanjiNumber(Number(n)));
  return [...(lang === "ja" ? foldKana(plain) : plain)].filter((ch) => /[\p{L}\p{N}ー々]/u.test(ch));
}

// One word written more than one way, by recognizers and people alike, made one form on both sides: the spelling on the
// left becomes the one on the right. Same word and sound only, never a standard written Chinese word for a Cantonese one
// (他 for 佢 stays wrong). Cantonese: 畀 (bei2, give) as 俾 or 比, the aspect 咗 (zo2) as 左, the particle 呀 (aa3) as
// 啊, 而家 (now) as 依家. Each spelling is as long as the one it becomes, so a whole sentence's characters are made one
// form at once (across its words, whatever spaces were heard) and every character keeps its place and its word.
const SAME_WORD = { yue: [["依家", "而家"], ["俾", "畀"], ["比", "畀"], ["左", "咗"], ["啊", "呀"]] };
function sameWord(chars, lang) {
  for (const [from, to] of SAME_WORD[lang] ?? []) {
    const spelling = [...from];
    for (let i = 0; i + spelling.length <= chars.length; i++) if (spelling.every((ch, k) => chars[i + k] === ch)) chars.splice(i, spelling.length, ...to);
  }
  return chars;
}
const KANJI_DIGITS = "〇一二三四五六七八九";
/** A number in kanji numerals, the way it's written out: 7 → 七, 12 → 十二, 2026 → 二千二十六. */
function kanjiNumber(n) {
  if (!Number.isSafeInteger(n) || n >= 100_000_000) return String(n);
  if (n < 10) return KANJI_DIGITS[n];
  const part = (value, unit) => (value === 0 ? "" : (value === 1 && unit !== "万" ? "" : kanjiNumber(value)) + unit);
  if (n >= 10_000) return part(Math.floor(n / 10_000), "万") + (n % 10_000 ? kanjiNumber(n % 10_000) : "");
  return part(Math.floor(n / 1000), "千") + part(Math.floor(n / 100) % 10, "百") + part(Math.floor(n / 10) % 10, "十") + (n % 10 ? KANJI_DIGITS[n % 10] : "");
}

// ---------- numbers ----------

const NL_UNITS = ["nul", "een", "twee", "drie", "vier", "vijf", "zes", "zeven", "acht", "negen", "tien", "elf", "twaalf", "dertien", "veertien", "vijftien", "zestien", "zeventien", "achttien", "negentien"];
const NL_TENS = ["", "", "twintig", "dertig", "veertig", "vijftig", "zestig", "zeventig", "tachtig", "negentig"];
const EN_UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** A whole number in words, the way it's said: 23 → "drieëntwintig". Dutch writes it as one word. */
export function cardinal(n, lang = "nl") {
  if (!Number.isSafeInteger(n) || n < 0) return String(n);
  return lang === "en" ? english(n) : dutch(n);
}

function dutch(n) {
  if (n < 20) return NL_UNITS[n];
  if (n < 100) {
    const unit = n % 10;
    const tens = NL_TENS[Math.floor(n / 10)];
    if (!unit) return tens;
    const first = NL_UNITS[unit];
    // drieëntwintig, tweeëntwintig: a diaeresis where "en" follows an e
    return `${first}${first.endsWith("e") ? "ë" : "e"}n${tens}`;
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rest = n % 100;
    return `${hundreds === 1 ? "" : dutch(hundreds)}honderd${rest ? dutch(rest) : ""}`;
  }
  if (n < 1_000_000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    return `${thousands === 1 ? "" : dutch(thousands)}duizend${rest ? dutch(rest) : ""}`;
  }
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  return `${dutch(millions)} miljoen${rest ? ` ${dutch(rest)}` : ""}`;
}

function english(n) {
  if (n < 20) return EN_UNITS[n];
  if (n < 100) return EN_TENS[Math.floor(n / 10)] + (n % 10 ? ` ${EN_UNITS[n % 10]}` : "");
  if (n < 1000) return `${EN_UNITS[Math.floor(n / 100)]} hundred${n % 100 ? ` ${english(n % 100)}` : ""}`;
  if (n < 1_000_000) return `${english(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${english(n % 1000)}` : ""}`;
  return `${english(Math.floor(n / 1_000_000))} million${n % 1_000_000 ? ` ${english(n % 1_000_000)}` : ""}`;
}

/** 1 → "eerste", 3 → "derde", 20 → "twintigste". */
export function ordinal(n, lang = "nl") {
  if (lang === "en") {
    const word = english(n);
    const irregular = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
    const parts = word.split(" ");
    const last = parts.pop();
    const tail = irregular[last] ?? (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`);
    return [...parts, tail].join(" ");
  }
  if (n === 1) return "eerste";
  if (n === 3) return "derde";
  if (n === 8) return "achtste";
  const word = dutch(n);
  return n < 20 ? `${word}de` : `${word}ste`;
}

// ---------- comparing words ----------

function distance(a, b) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

function sameGroup(a, b, lang) {
  return (SAME[lang] ?? []).some((group) => group.includes(a) && group.includes(b));
}

/** How alike two normalized words are: 1 = the same word; ≥ CLOSE = nearly; below = a different word. */
function likeness(a, b, lang) {
  if (a === b || sameGroup(a, b, lang)) return 1;
  const fa = fold(a);
  const fb = fold(b);
  if (fa === fb || sameGroup(fa, fb, lang)) return 1;
  const longest = Math.max(fa.length, fb.length);
  const d = distance(fa, fb);
  // One sound off in a word of up to six letters, two up to ten, three beyond.
  const allowed = longest <= 6 ? 1 : longest <= 10 ? 2 : 3;
  if (d > allowed || (longest <= 2 && d > 0)) return Math.min(CLOSE - 0.01, 1 - d / longest);
  return Math.max(CLOSE, 1 - d / longest);
}
const CLOSE = 0.6;
// Two words heard as one (or one as two) only when the letters all but match: "open doen" for "opendoen".
const JOINED = 0.85;
// A separable verb said as one word ("opbel" for "bel … op") is caught even with a sound off ("opbell").
const SPLIT = 0.8;

// ---------- lining up ----------

// Edit-distance alignment of expected words against heard ones. Besides one-for-one, a word can be heard as two
// ("open doen" for "opendoen") or two as one ("opendoen" for "open doen"). A substitution of a different word costs
// more than leaving one out and adding another, so a different word only pairs up in a later pass.
function align(expected, heard, lang) {
  const n = expected.length;
  const m = heard.length;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(Infinity));
  const step = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
  cost[n][m] = 0;
  const pairCost = (s) => (s >= CLOSE ? 2 * (1 - s) : 2.5);
  for (let i = n; i >= 0; i--) {
    for (let j = m; j >= 0; j--) {
      if (i === n && j === m) continue;
      const options = [];
      if (i < n) options.push([1 + cost[i + 1][j], ["skip-expected"]]);
      if (j < m) options.push([1 + cost[i][j + 1], ["skip-heard"]]);
      if (i < n && j < m) {
        const s = likeness(expected[i], heard[j], lang);
        options.push([pairCost(s) + cost[i + 1][j + 1], ["pair", 1, 1, s]]);
      }
      if (i < n && j + 1 < m) {
        const s = likeness(expected[i], heard[j] + heard[j + 1], lang);
        if (s >= JOINED) options.push([pairCost(s) + 0.1 + cost[i + 1][j + 2], ["pair", 1, 2, s]]);
      }
      if (i + 1 < n && j < m) {
        const s = likeness(expected[i] + expected[i + 1], heard[j], lang);
        if (s >= JOINED) options.push([pairCost(s) + 0.1 + cost[i + 2][j + 1], ["pair", 2, 1, s]]);
      }
      let best = options[0];
      for (const option of options) if (option[0] < best[0]) best = option;
      cost[i][j] = best[0];
      step[i][j] = best[1];
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    const [kind, di, dj, s] = step[i][j];
    if (kind === "skip-expected") out.push({ e: [i++], h: [] });
    else if (kind === "skip-heard") out.push({ e: [], h: [j++] });
    else {
      out.push({ e: Array.from({ length: di }, (_, k) => i + k), h: Array.from({ length: dj }, (_, k) => j + k), s });
      i += di;
      j += dj;
    }
  }
  return out;
}

// A language written without spaces: the heard characters lined up with the expected ones (their longest common
// subsequence), then each word judged by its own characters. All of them in place: right; all but one of a word of three
// or more (an ending slipped: 食べます for 食べました): close; none, but the word was said elsewhere: order; otherwise,
// with something else said where it belongs: wrong (and what was said there); nothing there: missing. Heard
// characters that belong to no word are extra.
function matchJoined(expectedText, shown, heardText, lang) {
  const owner = [];
  const expected = [];
  shown.forEach((word, index) => {
    for (const ch of words(word, lang)) {
      expected.push(ch);
      owner.push(index);
    }
  });
  // A word's other spellings made one, across the whole sentence on each side (SAME_WORD).
  sameWord(expected, lang);
  const heard = sameWord(words(heardText ?? "", lang), lang);
  const n = expected.length;
  const m = heard.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i][j] = expected[i] === heard[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const at = new Array(n).fill(-1); // the heard character each expected one was found as
  const used = new Array(m).fill(false);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (expected[i] === heard[j]) {
      at[i] = j;
      used[j] = true;
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  const leftover = () => heard.map((ch, j) => (used[j] ? null : [j, ch])).filter(Boolean);
  const results = shown.map((text) => ({ text: text.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, ""), heard: null, result: "missing" }));
  shown.forEach((_, index) => {
    const own = expected.map((ch, i) => [ch, i]).filter(([, i]) => owner[i] === index);
    if (!own.length) return void (results[index].result = "right");
    const found = own.filter(([, i]) => at[i] >= 0).length;
    // Right: shown as written (Japanese is compared with its kana folded, so コーヒー typed as koohii is right and shown コーヒー, never こおひい).
    if (found === own.length) results[index] = { ...results[index], heard: results[index].text, result: "right" };
    else if (own.length >= 3 && found >= own.length - 1) results[index] = { ...results[index], heard: own.map(([ch, i]) => (at[i] >= 0 ? ch : "")).join(""), result: "close" };
  });
  // Said elsewhere: the word's characters together among what's left over.
  shown.forEach((_, index) => {
    if (results[index].result !== "missing") return;
    const text = expected.filter((_, i) => owner[i] === index).join("");
    const rest = leftover();
    const spot = rest.map(([, ch]) => ch).join("").indexOf(text);
    if (!text || spot < 0) return;
    for (const [j] of rest.slice(spot, spot + text.length)) used[j] = true;
    results[index] = { ...results[index], heard: text, result: "order" };
  });
  // Something else said in its place: the leftover characters between what the words around it were heard as.
  shown.forEach((_, index) => {
    if (results[index].result !== "missing") return;
    const before = Math.max(-1, ...expected.map((_, i) => (owner[i] < index ? at[i] : -1)));
    const afterAll = expected.map((_, i) => (owner[i] > index && at[i] >= 0 ? at[i] : Infinity));
    const after = Math.min(m, ...afterAll);
    const there = leftover().filter(([j]) => j > before && j < after);
    if (!there.length) return;
    for (const [j] of there) used[j] = true;
    // What was said there: the leftover characters and any of the word's own between them (先生 for 学生).
    const span = [...there.map(([j]) => j), ...expected.map((_, i) => (owner[i] === index ? at[i] : -1)).filter((j) => j >= 0)];
    results[index] = { ...results[index], heard: heard.slice(Math.min(...span), Math.max(...span) + 1).join(""), result: "wrong" };
  });
  for (const word of results) if (word.result === "missing") word.heard = null;
  const extra = leftover().map(([, ch]) => ch);
  const credit = { right: 1, close: 0.75, order: 0.5, wrong: 0, missing: 0 };
  const total = results.reduce((sum, w) => sum + credit[w.result], 0);
  const score = results.length ? total / (results.length + (extra.length ? 1 : 0)) : heard.length ? 0 : 1;
  const ok = results.length > 0 && results.every((w) => w.result === "right" || w.result === "close") && extra.length === 0;
  return { ok, score: Math.round(score * 1000) / 1000, expected: Array.isArray(expectedText) ? expectedText.join("") : String(expectedText), heard: heard.join(""), words: results, extra: extra.length ? [extra.join("")] : [] };
}

function matchOne(expectedText, expectedWords, heardText, lang) {
  if (isJoined(lang)) return matchJoined(expectedText, expectedWords ?? [String(expectedText)], heardText, lang);
  // The words as written (for showing), and normalized (for comparing), one-to-one.
  const shown = expectedWords ?? String(expectedText).split(/\s+/).filter((w) => words(w, lang).length);
  const expected = [];
  const owner = []; // normalized word → index of the shown word it came from
  shown.forEach((word, index) => {
    for (const w of words(word, lang)) {
      expected.push(w);
      owner.push(index);
    }
  });
  const heardAll = words(heardText ?? "", lang);
  // A hesitation (um, uh, oh) is dropped, but never a word the sentence says: Portuguese's um (a), German's um (at), Dutch's Oh, are kept as
  // many times as the sentence has them, the last ones heard, so a recognizer's "um, um café" still loses its first um.
  const own = new Map();
  for (const w of expected) if (FILLERS.has(w)) own.set(w, (own.get(w) ?? 0) + 1);
  const heard = [];
  for (let i = heardAll.length - 1; i >= 0; i--) {
    const w = heardAll[i];
    if (FILLERS.has(w)) {
      const left = own.get(w) ?? 0;
      if (!left) continue;
      own.set(w, left - 1);
    }
    heard.unshift(w);
  }

  // h: where in the heard words each expected word was found.
  const results = expected.map(() => ({ heard: null, result: "missing", s: 0, h: null }));
  const extra = new Map(); // heard index → word
  // Which gap between paired words each extra heard word sits in: the index of the first expected word after the
  // last pair before it. A missing run starting at that index is the same gap.
  const gapOf = new Map();
  let anchor = 0;
  for (const step of align(expected, heard, lang)) {
    if (step.e.length && step.h.length) {
      const heardWords = step.h.map((k) => heard[k]).join(step.e.length > 1 ? "" : " ");
      for (const i of step.e) results[i] = { heard: heardWords, result: step.s === 1 ? "right" : "close", s: step.s, h: step.h[0] };
      anchor = step.e.at(-1) + 1;
    } else for (const k of step.h) extra.set(k, heard[k]), gapOf.set(k, anchor);
  }

  // Whether heard word k sits where expected words a..b belong: after what was heard for the words before them, and
  // before what was heard for the words after.
  const inPlace = (a, b, k) => {
    for (let i = a - 1; i >= 0; i--) if (results[i].h !== null) return results[i].h < k;
    return true;
  };
  const inPlaceAfter = (b, k) => {
    for (let i = b + 1; i < results.length; i++) if (results[i].h !== null) return results[i].h > k;
    return true;
  };
  const where = (a, b, k) => (inPlace(a, b, k) && inPlaceAfter(b, k) ? "close" : "order");

  // Two missing words said as one word. In their place and in their order, they just ran together ("ganwe" for
  // "gaan we"); otherwise it's a separable verb kept together ("opbel" for "bel … op"), an order slip.
  for (const [k, w] of [...extra]) {
    const missing = [...results.keys()].filter((i) => results[i].result === "missing");
    const pair = missing.flatMap((a) => missing.filter((b) => b !== a).map((b) => [a, b])).find(([a, b]) => likeness(expected[a] + expected[b], w, lang) >= SPLIT);
    if (!pair) continue;
    const [a, b] = pair;
    const result = b === a + 1 ? where(a, b, k) : "order";
    for (const i of pair) results[i] = { heard: w, result, s: 1, h: k };
    extra.delete(k);
  }
  // A missing word that was said elsewhere: an order slip.
  for (const [i, r] of results.entries()) {
    if (r.result !== "missing") continue;
    let best = null;
    for (const [k, w] of extra) {
      const s = likeness(expected[i], w, lang);
      if (s >= CLOSE && (!best || s > best.s)) best = { k, s };
    }
    if (best) {
      const result = where(i, i, best.k) === "close" ? (best.s === 1 ? "right" : "close") : "order";
      results[i] = { heard: extra.get(best.k), result, s: best.s, h: best.k };
      extra.delete(best.k);
    }
  }
  // A missing word said as two words: in its place they're just split ("open doen" for "opendoen"); elsewhere it's
  // an order slip ("open doen" before "het raam").
  for (const [i, r] of results.entries()) {
    if (r.result !== "missing") continue;
    const keys = [...extra.keys()];
    const at = keys.findIndex((k, n) => keys[n + 1] === k + 1 && likeness(expected[i], extra.get(k) + extra.get(k + 1), lang) >= JOINED);
    if (at < 0) continue;
    const [a, b] = [keys[at], keys[at + 1]];
    results[i] = { heard: `${extra.get(a)} ${extra.get(b)}`, result: where(i, i, a), s: 1, h: a };
    extra.delete(a);
    extra.delete(b);
  }
  // A missing word with something else said in its place: wrong.
  for (const [i, r] of results.entries()) {
    if (r.result !== "missing") continue;
    // The run of missing words this one belongs to, and the heard words in that same gap.
    let start = i;
    while (start > 0 && results[start - 1].result === "missing") start--;
    const inGap = [...extra.keys()].filter((k) => gapOf.get(k) === start);
    if (inGap.length) {
      const k = inGap[0];
      results[i] = { heard: extra.get(k), result: "wrong", s: 0, h: k };
      extra.delete(k);
    }
  }

  // Back to the words as written: a shown word is as good as its worst part.
  const rank = { right: 0, close: 1, order: 2, wrong: 3, missing: 4 };
  const perShown = shown.map((text) => ({ text: text.replace(/^[^\p{L}\p{M}\p{N}']+|[^\p{L}\p{M}\p{N}']+$/gu, ""), heard: null, result: "right" }));
  results.forEach((r, k) => {
    const target = perShown[owner[k]];
    if (rank[r.result] > rank[target.result]) target.result = r.result;
    if (r.heard && !target.heard) target.heard = r.heard;
  });
  for (const word of perShown) if (word.result === "missing") word.heard = null;

  const credit = { right: 1, close: 0.75, order: 0.5, wrong: 0, missing: 0 };
  const total = perShown.reduce((sum, w) => sum + credit[w.result], 0);
  const extraWords = [...extra.values()];
  const score = perShown.length ? total / (perShown.length + extraWords.length) : heard.length ? 0 : 1;
  const ok = perShown.length > 0 && perShown.every((w) => w.result === "right" || w.result === "close") && extraWords.length === 0;
  return { ok, score: Math.round(score * 1000) / 1000, expected: Array.isArray(expectedText) ? expectedText.join(" ") : String(expectedText), heard: heardAll.join(" "), words: perShown, extra: extraWords };
}

/** See the top of this file. */
export function match(expected, heard, { lang = "nl", accept = [], readings = [] } = {}) {
  const guesses = (Array.isArray(heard) ? heard : [heard]).filter((h) => typeof h === "string");
  if (!guesses.length) guesses.push("");
  // Japanese typed in romaji (a phone with no Japanese keyboard): each guess again as kana (lang/romaji.js), before the readings below.
  if (lang === "ja") for (const guess of [...guesses]) guesses.push(...romajiGuesses(guess));
  // Each guess again with the expected words' readings put back as the words (たべます → 食べます), longest first.
  if (LANGUAGES[lang]?.readings === "kana" && Array.isArray(readings) && readings.length) {
    const pairs = readings
      .filter((pair) => Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string" && pair[1])
      .map(([word, reading]) => [word.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, ""), reading])
      .sort((a, b) => b[1].length - a[1].length);
    // Left to right, the longest reading first at each place, so a word put back is never read into again: いまテレビをみています's
    // みています put back as 見ています keeps its い and ま, never 今's いま (each reading swapped everywhere gave 見て今す, 8 Nov 2026).
    for (const guess of [...guesses]) {
      let swapped = "";
      for (let i = 0; i < guess.length; ) {
        const pair = pairs.find(([, reading]) => guess.startsWith(reading, i));
        swapped += pair ? pair[0] : guess[i];
        i += pair ? pair[1].length : 1;
      }
      if (swapped !== guess) guesses.push(swapped);
    }
  }
  const targets = [expected, ...accept];
  let best = null;
  for (const target of targets) {
    for (const guess of guesses) {
      const result = matchOne(target, Array.isArray(target) ? target : null, guess, lang);
      if (!best || result.score > best.score || (result.score === best.score && result.ok && !best.ok)) best = result;
    }
  }
  // A recognizer's other guesses can hold the slip itself: the same words as the sentence, in another order, is what was said,
  // whatever else it guessed (Chrome: "hoe het gaat met je" first, "Hoe gaat het met je" second). The closest guess mustn't hide it.
  if (best.ok && guesses.length > 1 && !isJoined(lang)) {
    const slip = guesses.find((guess) => isReordered(guess, targets, lang));
    if (slip !== undefined) return targets.map((target) => matchOne(target, Array.isArray(target) ? target : null, slip, lang)).reduce((a, b) => (b.score > a.score ? b : a));
  }
  return best;
}

/** Whether a guess has exactly the words of a sentence that's right, in an order none of them has. */
function isReordered(guess, targets, lang) {
  const inOrder = (text) => words(Array.isArray(text) ? text.join(" ") : text, lang).map(fold);
  const heard = inOrder(guess);
  const sorted = (list) => [...list].sort().join(" ");
  const said = heard.join(" ");
  const lists = targets.map(inOrder);
  return lists.every((list) => list.join(" ") !== said) && lists.some((list) => sorted(list) === sorted(heard));
}
