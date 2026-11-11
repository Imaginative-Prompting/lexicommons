// Readings: how a word written in characters is said, for the languages that show it over the word (a language's
// `readings` in lang/<code>.js: "kana" for Japanese, "pinyin" for Chinese, "jyutping" for Cantonese, "paiboon" for
// Thai, "roman" for Yiddish), or a word written without its vowels with them put back ("vowels" for Arabic and Hebrew; Latin's
// long vowels; Russian's stress).
// Pure, so packs, weaves, the reader and Study all check a reading, and place it, with the same code.
//
//   needsReading(lang, word)          whether the word must carry a reading: it's written in characters a beginner
//                                     can't sound out (kanji, hanzi; any Arabic or Hebrew word, its short vowels
//                                     unwritten)
//   mayRead(lang, word)               whether the word may carry one (all that needs one; a Latin word its macrons, a
//                                     Persian or Urdu word its marks, a Yiddish word its romanization), so a reading a
//                                     pack or layer gives is shown wherever this holds
//   readingProblem(lang, word, reading)  null when the reading fits the word, else what's wrong, in words
//   rubyOf(lang, word, reading)       the word in pieces, each [text, reading | null]: where the reading sits
//   readingOver(lang)                 whether readings sit over the word (kana, pinyin, jyutping, paiboon, roman), not
//                                     on it (vowels)
//   vowelled(lang, word, reading)     the word with its vowel marks, its frame kept (Arabic, Hebrew: the reading is shown
//                                     in the word's place, not over it), or the word as written
//   readingKind(lang)                 "kana", "pinyin", "jyutping", "paiboon", "vowels", "roman", or null for a language
//                                     without readings
//
// Japanese: hiragana (and ー), for a word with kanji only. The word's own kana must appear in the reading where it is
// in the word, so 食べました / たべました puts た over 食 alone, and a reading that doesn't fit the word is refused.
// Chinese: pinyin with tone marks, one syllable per character, separated by spaces (wǒ men); the neutral tone has no
// mark, 儿 said as part of the syllable before it is "r", and a name may start with a capital (Běi jīng).
// Cantonese: Jyutping (LSHK), one syllable per character, separated by spaces, each with its tone number 1–6 (nei5 hou2);
// lowercase; a syllable ending in p, t or k (an entering tone) has tone 1, 3 or 6. As said in the sentence: Cantonese's
// changed tones (錢 cin2, 名 meng2) are written as said, never worked out.
// Thai: Paiboon+ romanization over the whole word, its syllables joined by hyphens (sà-wàt-dii, kâao-pàt): tones as
// marks on a syllable's first vowel (grave low, acute high, circumflex falling, caron rising, none mid), a long vowel
// doubled (aa, ʉʉ), ʉ ɛ ɔ ə for the vowels English lacks, bp and dt for the unaspirated stops; lowercase. Every word
// with Thai letters carries one (a beginner can't sound out Thai script).
// Arabic and Hebrew: the word with every vowel mark it's read with (كَتَبَ for كتب, סֵפֶר for ספר): the same letters, in
// the same order, with marks only, so Hebrew keeps its everyday full spelling with the points added (מִילָּה for מילה,
// never the short spelling מִלָּה). Hebrew's marks are its points (niqqud, the shin and sin dots, dagesh, rafe);
// Arabic's are its tashkeel and the superscript alef. Cantillation and tatweel are no part of a reading. Every Arabic
// or Hebrew word carries one; in Persian and Urdu (vowelsWhereNeeded), only a word whose letters don't say how it's
// read (کتاب carries کِتاب; آب, این carry none). Latin's "vowels" are its long vowels' macrons (and a breve where one is wanted): amō
// for amo; only a word with a long vowel carries a reading (puella carries none). Russian's "vowels" are its stress mark: a word of
// two syllables or more carries itself with an acute (U+0301) after its stressed vowel (молоко́, хорошо́), one a word; a word of one
// syllable carries none, and neither does a word with ё, which is always stressed (ещё). Russian is written without them, so typing
// and what's said never need them; they're a learner's help, shown until the word is known well (progress.js readingHides).
// Yiddish ("roman"): its YIVO spelling is read as written, but its Hebrew-Aramaic words keep their Hebrew spelling,
// which doesn't say how they're said (שבת is shabes, not shabbat); only those carry a reading, their YIVO
// romanization in Latin letters (shabes, khaver), over the whole word. No word must carry one. Punjabi ("roman" too):
// Gurmukhi shows tone only through certain letters, so a word with a high or low tone, or a silent ਹ, carries its
// pronunciation with the tone marked (ਘਰ kàr, ਚਾਹ chā́).

import { LANGUAGES } from "./index.js";

const HAN = /\p{Script=Han}/u;
const HAN_CHAR = /^\p{Script=Han}$/u;
// The word's frame: what's around its letters (punctuation and brackets), which never carries a reading. A mark is
// never frame (جداً ends in one).
const FRAME = /^([^\p{L}\p{M}\p{N}]*)(.*?)([^\p{L}\p{M}\p{N}]*)$/su;

/** "kana", "pinyin", "jyutping", "paiboon", "vowels", "roman", or null. */
export const readingKind = (lang) => LANGUAGES[lang]?.readings ?? null;

/** Whether the language's readings sit over the word (kana, pinyin, jyutping, paiboon, roman), so its lines need room
 * above; vowel marks are on the word itself. */
export const readingOver = (lang) => ["kana", "pinyin", "jyutping", "paiboon", "roman"].includes(readingKind(lang));

// An Arabic or Hebrew letter (not a mark or a digit).
const ABJAD = /(?=\p{L})[\p{Script=Arabic}\p{Script=Hebrew}]/u;
// A Thai letter (not a digit or a mark).
const THAI = /(?=\p{L})\p{Script=Thai}/u;

/** Whether the word must carry a reading in its language (words with kanji or hanzi; any Arabic or Hebrew word). A
 * Latin, Persian or Urdu word may carry one (vowels) without needing it, and a Yiddish word (roman). */
export const needsReading = (lang, word) => {
  const kind = readingKind(lang);
  if (!kind || kind === "roman" || typeof word !== "string") return false;
  if (kind === "paiboon") return THAI.test(word);
  return kind === "vowels" ? ABJAD.test(word) && !LANGUAGES[lang]?.vowelsWhereNeeded : HAN.test(word);
};

const frameOf = (word) => FRAME.exec(word).slice(1);

// ---------- Japanese ----------

const HIRAGANA_READING = /^[ぁ-ゖー]+$/u;
const KANA = /[ぁ-ゖゝゞァ-ヺーヽヾ]/u;
/** Katakana as hiragana (ー stays), so a word's katakana can be found in its reading. */
const toHiragana = (text) => text.replace(/[ァ-ヶ]/gu, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A word's runs: [text, isKana], the kana ones to be found in the reading, the rest (kanji, digits) read by it. */
function kanaRuns(core) {
  const runs = [];
  for (const ch of core) {
    const kana = KANA.test(ch);
    const last = runs[runs.length - 1];
    if (last && last[1] === kana) last[0] += ch;
    else runs.push([ch, kana]);
  }
  return runs;
}

/** The kanji runs' readings, in order, or null when the reading doesn't fit the word. */
function alignKana(core, reading) {
  const runs = kanaRuns(core);
  const pattern = new RegExp(`^${runs.map(([text, kana]) => (kana ? escape(toHiragana(text)) : "(.+?)")).join("")}$`, "u");
  const found = pattern.exec(reading);
  if (!found) return null;
  let group = 1;
  return runs.map(([text, kana]) => [text, kana ? null : found[group++]]);
}

function kanaProblem(word, reading) {
  if (!HIRAGANA_READING.test(reading)) return `the reading "${reading}" must be hiragana only (and ー)`;
  const [, core] = frameOf(word);
  if (!alignKana(core, reading)) return `the reading "${reading}" doesn't fit "${core}": the word's own kana must be in the reading, where they are in the word`;
  return null;
}

// ---------- Chinese ----------

// Every syllable of Mandarin, without tones (ü written v here), and r for 儿 said with the syllable before it.
const SYLLABLES = new Set(
  `a ai an ang ao ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu pa pai pan pang pao pei pen peng pi
  pian piao pie pin ping po pu ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu fa fan fang
  fei fen feng fo fou fu da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo
  ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo na nai nan nang nao ne nei nen neng ni
  nian niang niao nie nin ning niu nong nou nu nuan nuo nv nve la lai lan lang lao le lei leng li lia lian liang liao
  lie lin ling liu lo long lou lu luan lun luo lv lve ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan
  guang gui gun guo ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo ha hai han hang hao
  he hei hen heng hong hou hu hua huai huan huang hui hun huo ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue
  jun qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun xi xia xian xiang xiao xie xin xing xiong xiu xu
  xuan xue xun zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo
  cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo sha shai shan shang
  shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo ra ran rang rao re ren reng ri rong rou
  ru rua ruan rui run ruo za zai zan zang zao ze zei zen zeng zi zong zou zu zuan zui zun zuo ca cai can cang cao ce
  cen ceng ci cong cou cu cuan cui cun cuo sa sai san sang sao se sen seng si song sou su suan sui sun suo ya yan yang
  yao ye yi yin ying yo yong you yu yuan yue yun wa wai wan wang wei wen weng wo wu e ei en eng er o ou`.split(/\s+/),
);
// A tone-marked vowel → [the vowel (ü as v), its tone].
const MARKED = new Map(
  [..."āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ"].map((ch, i) => [ch, ["aeiouv"[Math.floor(i / 4)], (i % 4) + 1]]),
);

/** One syllable: { base, tone } (tone 0 for the neutral tone), or null when it isn't one. */
function parseSyllable(text, { first = false } = {}) {
  if (!text) return null;
  let lower = text;
  if (first && /^[A-ZĀÁǍÀĒÉĚÈŌÓǑÒ]/u.test(text)) lower = text[0].toLowerCase() + text.slice(1);
  let base = "";
  let tone = 0;
  let markAt = -1;
  for (const ch of lower) {
    if (MARKED.has(ch)) {
      if (tone) return null; // two tone marks
      const [vowel, t] = MARKED.get(ch);
      markAt = base.length;
      base += vowel;
      tone = t;
    } else if (ch === "ü") base += "v";
    else if (/^[a-z]$/.test(ch)) base += ch;
    else return null;
  }
  if (base !== "r" && !SYLLABLES.has(base)) return null;
  if (tone) {
    // The mark sits on a or e if there is one, on the o of ou, and otherwise on the last vowel.
    const expected = /[ae]/.test(base) ? base.search(/[ae]/) : base.includes("ou") ? base.indexOf("ou") : Math.max(...[..."iouv"].map((v) => base.lastIndexOf(v)));
    if (markAt !== expected) return null;
  }
  return { base, tone };
}

function pinyinProblem(word, reading) {
  const hanzi = [...word].filter((ch) => HAN_CHAR.test(ch));
  if (reading !== reading.trim() || /\s{2,}/.test(reading)) return `the reading "${reading}" must have one space between syllables`;
  const syllables = reading.normalize("NFC").split(" ");
  if (syllables.length !== hanzi.length) return `the reading "${reading}" has ${syllables.length} syllable${syllables.length === 1 ? "" : "s"}; "${word}" has ${hanzi.length} character${hanzi.length === 1 ? "" : "s"} (one syllable each, separated by spaces)`;
  for (const [i, syllable] of syllables.entries()) {
    const parsed = parseSyllable(syllable, { first: i === 0 });
    if (!parsed) return `"${syllable}" isn't a pinyin syllable with its tone mark in the right place (wǒ, mén, xué, ér)`;
    if (parsed.base === "r" && hanzi[i] !== "儿") return `"r" is only for 儿 said with the syllable before it`;
  }
  return null;
}

// ---------- Cantonese ----------

// A Jyutping syllable: an initial (or none), a final (a vowel, then i, u, m, n, ng, p, t or k, or none), or m or ng
// alone (唔 m4, 五 ng5); then its tone, 1 to 6.
const JYUTPING = /^(?:(?:b|p|m|f|d|t|n|l|gw|kw|g|k|ng|h|w|z|c|s|j)?(?:aa|a|e|i|o|u|oe|eo|yu)(?:i|u|m|n|ng|p|t|k)?|m|ng)([1-6])$/;

function jyutpingProblem(word, reading) {
  const hanzi = [...word].filter((ch) => HAN_CHAR.test(ch));
  if (reading !== reading.trim() || /\s{2,}/.test(reading)) return `the reading "${reading}" must have one space between syllables`;
  const syllables = reading.split(" ");
  if (syllables.length !== hanzi.length) return `the reading "${reading}" has ${syllables.length} syllable${syllables.length === 1 ? "" : "s"}; "${word}" has ${hanzi.length} character${hanzi.length === 1 ? "" : "s"} (one syllable each, separated by spaces)`;
  for (const syllable of syllables) {
    const parsed = JYUTPING.exec(syllable);
    if (!parsed) return `"${syllable}" isn't a Jyutping syllable: lowercase, with its tone number 1 to 6 after it (nei5, hou2, m4)`;
    if (/[ptk][1-6]$/.test(syllable) && !"136".includes(parsed[1])) return `"${syllable}" ends in ${syllable.at(-2)}, so its tone is 1, 3 or 6 (sik6, hok6, jat1)`;
  }
  return null;
}

// ---------- Arabic and Hebrew ----------

// The marks a vowelled word adds: Hebrew's points (U+05B0–U+05BD, U+05BF, U+05C1, U+05C2, U+05C7), Arabic's tashkeel
// (U+064B–U+065F) and superscript alef (U+0670), and Latin's macron and breve (U+0304, U+0306). The macron and breve
// are found apart from their letter once a word is decomposed (NFD: ō is o and U+0304); the rest are taken from the
// composed word, where أ, إ and آ stay letters of their own.
const VOWEL_MARKS = /[\u05B0-\u05BD\u05BF\u05C1\u05C2\u05C7\u064B-\u065F\u0670]/gu;
const LONG_SHORT = /[\u0304\u0306]/gu;
// Russian's stress mark, and its vowels (ё among them: its dots are part of the letter, never a reading's mark).
const STRESS = /\u0301/gu;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const CYRILLIC_VOWELS = /[аеёиоуыэюя]/giu;
const withoutVowelMarks = (text) => text.normalize("NFD").replace(LONG_SHORT, "").normalize("NFC").replace(VOWEL_MARKS, "");

// Letters that look alike across Arabic, Persian and Urdu, which a reading typed on another keyboard swaps in: kaf
// and keheh; yeh, alef maksura and Farsi yeh; Arabic heh and heh goal; Arabic heh and do-chashmi heh. Heh goal and
// do-chashmi are different letters in Urdu (ھ marks aspiration), so they aren't look-alikes of each other.
const LOOK_ALIKE = ["\u0643\u06a9", "\u064a\u0649\u06cc", "\u0647\u06c1", "\u0647\u06be"];
const codePoint = (letter) => `U+${letter.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;
/** Where a reading's letters differ from the word's only by look-alikes: the first such pair, else null. */
function lookAlike(bare, letters) {
  const a = [...bare];
  const b = [...letters];
  if (a.length !== b.length) return null;
  let first = null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (!LOOK_ALIKE.some((set) => set.includes(a[i]) && set.includes(b[i]))) return null;
    first ??= [a[i], b[i]];
  }
  return first;
}

// Russian's stress: the reading is the word exactly, letter for letter (й and ё kept as they are), with one acute after its stressed vowel,
// on a word of two syllables or more that isn't written with ё (always stressed).
function stressProblem(core, reading) {
  const decomposed = reading.normalize("NFD");
  const unmarked = decomposed.replace(STRESS, "").normalize("NFC");
  if (unmarked !== core.normalize("NFC")) {
    const plain = (text) => text.normalize("NFD").replace(/\p{M}/gu, "");
    if (plain(unmarked) === plain(core)) return `the reading "${reading}" isn't "${core}" as written with a stress mark: its other marks differ (й and ё stay as the word has them; the one mark added is an acute, U+0301, after the stressed vowel: молоко́)`;
    const swapped = lookAlike(unmarked, core);
    if (swapped) return `the reading "${reading}" has ${swapped[0]} (${codePoint(swapped[0])}) where "${core}" has ${swapped[1]} (${codePoint(swapped[1])}), letters that look alike: write the reading with the word's own letters`;
    return `the reading "${reading}" isn't "${core}" with a stress mark: without it it's "${unmarked}" (the same letters, in the same order)`;
  }
  if (/ё/iu.test(core)) return `"${core}" is written with ё, which is always stressed: it carries no stress mark`;
  if ((core.match(CYRILLIC_VOWELS) ?? []).length < 2) return `"${core}" has one syllable: it carries no stress mark`;
  const stresses = decomposed.match(STRESS) ?? [];
  if (!stresses.length) return `the reading "${reading}" has no stress mark: write the word with an acute after its stressed vowel (молоко́)`;
  if (stresses.length > 1) return `the reading "${reading}" has ${stresses.length} stress marks: one a word, on its stressed vowel`;
  if (/[^аеиоуыэюя]\u0301/iu.test(decomposed)) return `the stress mark in "${reading}" isn't after a vowel: put it right after the stressed vowel (молоко́)`;
  return null;
}

function vowelsProblem(lang, word, reading) {
  const [, core] = frameOf(word);
  if (CYRILLIC.test(core)) return stressProblem(core, reading);
  const bare = withoutVowelMarks(reading);
  // The word may carry a mark of its own as written (شكرًا), so the two are compared without theirs.
  const letters = withoutVowelMarks(core);
  if (bare === reading) {
    if (!ABJAD.test(core)) return `the reading "${reading}" has no macron: a word with no long vowel carries no reading`;
    return LANGUAGES[lang]?.vowelsWhereNeeded ? `the reading "${reading}" has no vowel marks: a word whose letters say how it's read carries no reading` : `the reading "${reading}" has no vowel marks: it's the word with its marks`;
  }
  if (bare !== letters) {
    const swapped = lookAlike(bare, letters);
    if (swapped) return `the reading "${reading}" has ${swapped[0]} (${codePoint(swapped[0])}) where "${core}" has ${swapped[1]} (${codePoint(swapped[1])}), letters that look alike: write the reading with the word's own letters`;
    const arabic = /\p{Script=Arabic}/u.test(core) ? "; spell the word with its hamza or madda (أ, إ, آ), and write alef as plain ا, never ٱ" : "";
    return `the reading "${reading}" isn't "${core}" with marks: without them it's "${bare}" (the same letters, in the same order, and marks only${arabic})`;
  }
  // Nor may it drop a mark the word is written with (شكرًا's tanween).
  const marks = (text) => text.normalize("NFD").match(new RegExp(`${VOWEL_MARKS.source}|${LONG_SHORT.source}`, "gu")) ?? [];
  const has = marks(reading);
  for (const mark of marks(core)) {
    const at = has.indexOf(mark);
    if (at < 0) return `the reading "${reading}" drops a mark "${core}" is written with`;
    has.splice(at, 1);
  }
  return null;
}

// ---------- Thai ----------

// A Paiboon+ syllable without its tone mark: an initial (bp, dt, ch, ng or one consonant, then r, l or w in a
// cluster), its vowels, and a final stop or nasal. The glottal initial is unwritten (aa-gàat).
const PAIBOON_SYLLABLE = /^(?:(?:bp|dt|ch|ng|[bdfghjklmnprstwy])[lrw]?)?[aeiouɛɔʉə]{1,4}(?:ng|[ptkmn])?$/u;
// The four tone marks: grave (low), acute (high), circumflex (falling), caron (rising).
const PAIBOON_TONE = /[\u0300\u0301\u0302\u030C]/u;

function paiboonProblem(reading) {
  if (reading !== reading.toLowerCase()) return `the reading "${reading}" has a capital: Paiboon+ readings are lowercase (tɔm)`;
  if (/\s/u.test(reading)) return `the reading "${reading}" has a space: it's one word's syllables, joined by - (sà-wàt-dii)`;
  for (const syllable of reading.split("-")) {
    const parts = [...syllable.normalize("NFD")];
    const marks = parts.filter((ch) => /\p{M}/u.test(ch));
    if (marks.some((ch) => !PAIBOON_TONE.test(ch))) return `"${syllable}" has a mark that isn't a tone (grave, acute, circumflex or caron on a vowel)`;
    if (marks.length > 1) return `"${syllable}" has two tone marks: a syllable has one tone`;
    const bare = parts.filter((ch) => !/\p{M}/u.test(ch)).join("");
    if (!PAIBOON_SYLLABLE.test(bare)) return `"${syllable}" isn't a Paiboon+ syllable (an initial like bp, dt, ch or ng, vowels from a e i o u ɛ ɔ ʉ ə, a final p t k m n or ng), syllables joined by -`;
    // The tone goes on the syllable's first vowel.
    if (marks.length) {
      const at = parts.findIndex((ch) => PAIBOON_TONE.test(ch));
      const firstVowel = parts.findIndex((ch) => /[aeiouɛɔʉə]/u.test(ch));
      if (at !== firstVowel + 1) return `"${syllable}" has its tone mark off its first vowel (kâao, mʉ̂ʉa)`;
    }
  }
  return null;
}

// ---------- roman (Yiddish) ----------

// A letter of a script other than Latin: a word written in one may carry a romanization.
const NOT_LATIN = /(?=\p{L})\P{Script=Latin}/u;
// The romanization: Latin letters, a name's capital, and spaces, hyphens or apostrophes between them (shabes, Moyshe).
// A letter may carry combining accents (U+0300–U+036F): Punjabi's tone on a long vowel (chā́) has no precomposed letter.
const ROMAN = /^(?:\p{Script=Latin}[\u0300-\u036F]*)+(?:[ '\u2019-](?:\p{Script=Latin}[\u0300-\u036F]*)+)*$/u;

function romanProblem(reading) {
  return ROMAN.test(reading) ? null : `the reading "${reading}" isn't a romanization: Latin letters only (shabes), with a space, hyphen or apostrophe between them`;
}

// ---------- shared ----------

/** Whether the word may carry a reading in its language: everything that needs one; in "vowels", any word with a
 * letter (a Latin word's macrons, a Persian or Urdu word's marks); in "roman", a word with a letter outside Latin. */
export const mayRead = (lang, word) => {
  const kind = readingKind(lang);
  if (!kind || typeof word !== "string") return false;
  return kind === "vowels" ? /\p{L}/u.test(word) : kind === "roman" ? NOT_LATIN.test(word) : needsReading(lang, word);
};

/** null when the reading fits the word in its language, else what's wrong. A word that needs none must have none. */
export function readingProblem(lang, word, reading) {
  const kind = readingKind(lang);
  if (reading === undefined || reading === null) return null;
  if (!kind) return `${LANGUAGES[lang]?.name ?? lang} words don't carry a reading`;
  if (typeof reading !== "string" || !reading) return "a reading must be text";
  if (!mayRead(lang, word)) return `"${word}" is written without ${kind === "kana" ? "kanji" : kind === "vowels" ? "letters" : kind === "roman" ? "its own script's letters" : "characters"}, so it carries no reading`;
  if (kind === "vowels") return vowelsProblem(lang, word, reading.normalize("NFC"));
  if (kind === "jyutping") return jyutpingProblem(word, reading);
  if (kind === "paiboon") return paiboonProblem(reading.normalize("NFC"));
  if (kind === "roman") return romanProblem(reading.normalize("NFC"));
  return kind === "kana" ? kanaProblem(word, reading.normalize("NFC")) : pinyinProblem(word, reading);
}

/**
 * A reading as ruby text: Chrome splits a letter with a mark (ā, じ) when it starts a ruby annotation ("a¯n" over 安),
 * so a reading that starts with one gets an invisible word joiner (U+2060) first. For display only; never stored.
 */
export const rubyText = (reading) => (typeof reading === "string" && reading && reading[0].normalize("NFD").length > 1 ? `\u2060${reading}` : reading);

/**
 * Where a word's reading sits: the word in pieces, each [text, reading | null], covering the word exactly. Japanese:
 * the reading over each run of kanji, the kana bare. Chinese and Cantonese: a syllable over each character. Thai and
 * Yiddish: the reading over the whole word. A word without a reading (or one that doesn't fit, which a checked pack
 * never has) is one piece with none.
 */
export function rubyOf(lang, word, reading) {
  const kind = readingKind(lang);
  // Vowel marks go on the word itself (vowelled), never over it.
  if (!reading || !kind || kind === "vowels" || readingProblem(lang, word, reading)) return [[word, null]];
  const [lead, core, trail] = frameOf(word);
  let pieces;
  if (kind === "kana") pieces = alignKana(core, reading.normalize("NFC"));
  // Thai: one reading over the whole word (its syllables don't map onto its letters one by one). A romanization
  // (Yiddish) belongs to the whole word too.
  else if (kind === "paiboon" || kind === "roman") pieces = [[core, reading.normalize("NFC")]];
  else {
    const syllables = reading.normalize("NFC").split(" ");
    let next = 0;
    pieces = [...core].map((ch) => [ch, HAN_CHAR.test(ch) ? syllables[next++] : null]);
  }
  // Neighboring pieces without a reading join up, and the frame goes on the ends.
  const out = [];
  for (const piece of [[lead, null], ...pieces, [trail, null]]) {
    if (!piece[0]) continue;
    const last = out[out.length - 1];
    if (last && last[1] === null && piece[1] === null) last[0] += piece[0];
    else out.push([...piece]);
  }
  return out;
}

/** The word with its vowel marks, its frame (punctuation) kept: Arabic and Hebrew, where the reading is shown in the
 * word's place. The word as written when it has no reading, or one that doesn't fit (a checked pack never has). */
export function vowelled(lang, word, reading) {
  if (!reading || readingKind(lang) !== "vowels" || readingProblem(lang, word, reading)) return word;
  const [lead, , trail] = frameOf(word);
  return `${lead}${reading.normalize("NFC")}${trail}`;
}
