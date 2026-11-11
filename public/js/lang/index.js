// The languages Lexicommons knows: one module of data per language, here. Pure (no DOM), so the app, the Worker, the
// books pipeline and the tests all read the same registry. A new language is a new module here (and a pack of study
// material for it, study/pack-format.js); code changes only where a language needs it, such as a segmenter for a
// language written without spaces. How the books pipeline prompts for a language is its own registry; this is what the
// files, the reader and studying depend on.
//
// What each language says about itself:
//   name           its name, in English
//   locale         its main BCP 47 tag (nl-NL): the device voice and the speech recognizers it asks for; a language
//                  with no country of its own has its language tag alone (eo)
//   segmenter      "spaces": words are whitespace tokens (read/book-format.js tokenize() makes them, the same everywhere);
//                  "fixed": the language is written without spaces, so whoever writes a text splits it into words once,
//                  and the split is kept in the file and never redone (tokenize() refuses text in it)
//   separator      what joins the words of a sentence: " ", or "" for a language written without spaces (a weave's
//                  `text` is tiled by its m with it, and a pack's sentence is its words joined with it)
//   lemmaCase      "lower": dictionary forms are lowercase; "any": the language capitalizes some (German nouns), or has
//                  no case at all (Korean, Japanese, Chinese)
//   readings       how a word written in characters is said, shown over it until you know it well: "kana" (Japanese),
//                  "pinyin" (Chinese), "jyutping" (Cantonese), "paiboon" (Thai) or "roman" (a romanization, only where
//                  the spelling doesn't say: Yiddish's Hebrew-origin words, Punjabi's tones); or "vowels" (Arabic, Hebrew; Latin's long
//                  vowels; Russian's stress), the word with its marks shown in its place until you know it well; lang/readings.js checks them (optional)
//   vowelsWhereNeeded  with readings "vowels": a word carries one only where its letters don't say how it's read
//                  (Persian, Urdu: کتاب carries کِتاب, آب none); Arabic and Hebrew words always carry one (optional)
//   abbreviations  lowercase words ending in a full stop that don't end a sentence
//   stray          little words that fit no sentence on their own: Arrange's decoy tile when a sentence's gap
//                  options don't give one (optional)
//   ends           the marks that end a sentence in it besides . ? ! … ?! !? ... (every language keeps those), each one
//                  whole ending, such as Greek's ";" (its question mark) or Hindi's "।" (optional; sentenceEnds below)
//   direction      "rtl" for a language written right to left (Arabic, Hebrew, Persian, Urdu): its text is shown
//                  right to left, and so are the layouts in its order (the literal line, Arrange's row); absent means
//                  left to right (optional; directionOf below)
//   spaceBefore    the space a mark takes before it when shown, by mark: French puts a narrow no-break space (U+202F)
//                  before ? ! ; and a no-break space (U+00A0) before : ("Tu viens ?"). A rendering rule only (typeset
//                  below): stored text, ids, versions and answers never carry it (optional)
//   joins          how two words shown side by side in a woven line are written together, a rendering rule only, never
//                  stored (read/book-format.js weaveSentence, given its lang; optional). Contractions first, then
//                  elisions over them (jusque à le is jusqu'au); only between words shown in the language, or before a
//                  name that stays. Its fields:
//                    contract { "de le": "du" }: two words that become one, the second only with an article's lemma
//                      (articles: ["le"]), so a pronoun spelled the same never contracts
//                    elide { que: "qu" }: a word that drops its vowel before a vowel, a mute h or a y said as a vowel,
//                      taking the apostrophe its sentence's text uses; elideOnlyBefore { ce: ["est"] }: one that elides
//                      only before these
//                    aspirated (word beginnings: le hibou), aspiratedWords and noElision (whole words: je hume,
//                      le onze): no elision before them; muteH: beginnings the aspirated list would catch that do
//                      elide (l'hallucination); elideBeforeY: the y-words before a vowel that take elision (j'y, d'yeux)
//                    articleOnly: words that elide only as an article (le, la); beforeInflected: words that elide only
//                      before an inflected verb (its lemma ending in one of verbEndings, not shown as it), and never
//                      after one of invertedAfter[the book's language] in its clause, the words a question puts before
//                      I (Am I, Have even I); from a book language with no list there, never: je
//   questionMarks  the marks a question puts on a word inside the sentence instead of at its end: Armenian's ՞, over the
//                  word asked about (Ինչպե՞ս ես։ ends with its full stop); a sentence with one is a question in English
//                  (englishEnd) (optional)
//   apostropheLetter  the letter a keyboard types as an apostrophe, in a language that writes one: Hawaiian's ʻokina
//                  and Uzbek's oʻ and gʻ (U+02BB; Uzbek's ʼ too). A typed or spoken answer's apostrophes count as
//                  it (speech/match.js words) (optional)
//   lemmaFinalApostrophe  true where a dictionary form can end in an apostrophe after a letter (Maltese ta', seta');
//                  everywhere else a lemma ends in a letter (optional)
//   patterns       the grammar catalog: { id: { name, about, after, source? } }, the p:<id> units that packs, weaves
//                  (their `c`) and your AI's grades all share. It's revision 1 of the language's shared grammar
//                  (lang/grammar.js): a change after it is data an admin publishes to the open library, which devices
//                  and the Worker install over this one, so edit it here only for a language whose grammar the library
//                  doesn't have yet. An id is never renamed or removed once anything uses it (retired instead:
//                  scripts/fixtures/pattern-ids.json holds every id, test-grammar.mjs every rule). after: the patterns
//                  it builds on, for the grammar map's order. source: who drafted and reviewed it (SEED_SOURCE when
//                  left out).

import en from "./en.js";
import nl from "./nl.js";
import af from "./af.js";
import ar from "./ar.js";
import az from "./az.js";
import be from "./be.js";
import bg from "./bg.js";
import br from "./br.js";
import bs from "./bs.js";
import ca from "./ca.js";
import ckb from "./ckb.js";
import cs from "./cs.js";
import cy from "./cy.js";
import da from "./da.js";
import de from "./de.js";
import el from "./el.js";
import eo from "./eo.js";
import es from "./es.js";
import et from "./et.js";
import eu from "./eu.js";
import fa from "./fa.js";
import fi from "./fi.js";
import fr from "./fr.js";
import fy from "./fy.js";
import ga from "./ga.js";
import gd from "./gd.js";
import gl from "./gl.js";
import gu from "./gu.js";
import haw from "./haw.js";
import he from "./he.js";
import hi from "./hi.js";
import hr from "./hr.js";
import ht from "./ht.js";
import hu from "./hu.js";
import hy from "./hy.js";
import id from "./id.js";
import is from "./is.js";
import it from "./it.js";
import ja from "./ja.js";
import ka from "./ka.js";
import kk from "./kk.js";
import kmr from "./kmr.js";
import ko from "./ko.js";
import la from "./la.js";
import lb from "./lb.js";
import lt from "./lt.js";
import lv from "./lv.js";
import mk from "./mk.js";
import mr from "./mr.js";
import ms from "./ms.js";
import mt from "./mt.js";
import nb from "./nb.js";
import ne from "./ne.js";
import pa from "./pa.js";
import pl from "./pl.js";
import ps from "./ps.js";
import pt from "./pt.js";
import ro from "./ro.js";
import ru from "./ru.js";
import sk from "./sk.js";
import sl from "./sl.js";
import sq from "./sq.js";
import sr from "./sr.js";
import sv from "./sv.js";
import sw from "./sw.js";
import th from "./th.js";
import tl from "./tl.js";
import tr from "./tr.js";
import uk from "./uk.js";
import ur from "./ur.js";
import uz from "./uz.js";
import vi from "./vi.js";
import yi from "./yi.js";
import yue from "./yue.js";
import zh from "./zh.js";
import zhHant from "./zh-Hant.js";

/**
 * The shape of a language's code: ISO 639's two or three letters, and where one language is learned in two scripts, the
 * script after it in BCP 47's casing (zh-Hant: Chinese in Traditional characters). Every file name, key and parameter
 * that carries a code takes this shape (src/books.ts serves it, src/library-admin.ts and the MCP tools take it).
 */
export const LANGUAGE_CODE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?$/;

export const LANGUAGES = { en, nl, af, ar, az, be, bg, br, bs, ca, ckb, cs, cy, da, de, el, eo, es, et, eu, fa, fi, fr, fy, ga, gd, gl, gu, haw, he, hi, hr, ht, hu, hy, id, is, it, ja, ka, kk, kmr, ko, la, lb, lt, lv, mk, mr, ms, mt, nb, ne, pa, pl, ps, pt, ro, ru, sk, sl, sq, sr, sv, sw, th, tl, tr, uk, ur, uz, vi, yi, yue, zh, "zh-Hant": zhHant };

/**
 * A language's name with its article, by its sound: "a Dutch", "an Arabic", "a Ukrainian", "an Urdu" (capital: "An
 * Arabic"). A vowel letter takes "an" unless it sounds like y or w (Uk-, Uy-, Eu-).
 */
export function withArticle(name, { capital = false } = {}) {
  const an = /^[AEIOU]/i.test(name) && !/^(Uk|Uy|Eu)/i.test(name);
  const article = an ? "an" : "a";
  return `${capital ? article[0].toUpperCase() + article.slice(1) : article} ${name}`;
}

/** A language's name ("Dutch"), or its code when it isn't one Lexicommons knows. */
export const languageName = (code) => LANGUAGES[code]?.name ?? code;

// Voices a language speaks with under another language tag: devices tag Filipino voices fil (fil-PH), and Filipino is
// Tagalog's; Android's older voices tag Hebrew iw and Indonesian in (Java's legacy codes); Norwegian voices are often
// no-NO, and speak Bokmål; Cantonese voices are tagged yue, or zh with Hong Kong's or Macau's region; Kurmanji's are
// tagged ku (CLDR's Kurdish is Kurmanji, ku-TR).
const VOICE_LANGUAGES = { tl: ["tl", "fil"], he: ["he", "iw"], id: ["id", "in"], nb: ["nb", "no"], yue: ["yue", "zh"], kmr: ["kmr", "ku"] };
// Chinese voices from Hong Kong and Macau (zh-HK, zh-MO: Apple's Sinji, Google's 粵語) speak Cantonese, not Mandarin.
const CANTONESE_REGIONS = new Set(["hk", "mo"]);
/**
 * Whether a voice tagged `tag` speaks the language `code`: a device's voice ("nl-NL", "en_GB") or a recording's locale.
 * Its language is the code's own, or one devices use for it (tl takes fil); a Chinese voice from Hong Kong or Macau
 * speaks Cantonese, so Mandarin (zh) never takes one and Cantonese (yue) takes only those of zh's. study/voice.js picks
 * device voices by it, and
 * study/pack-audio.js checks a recording's locale by it.
 */
export function voiceSpeaks(code, tag) {
  if (typeof code !== "string" || typeof tag !== "string") return false;
  const [language, ...rest] = tag.replace(/_/g, "-").toLowerCase().split("-");
  const base = code.split("-")[0].toLowerCase();
  if (!(VOICE_LANGUAGES[base] ?? [base]).includes(language)) return false;
  // The region is the tag's two-letter subtag, after a script if there is one (zh-Hant-HK).
  const region = rest.find((part) => /^[a-z]{2}$/.test(part));
  if (base === "yue" && language === "zh") return CANTONESE_REGIONS.has(region);
  return !(base === "zh" && CANTONESE_REGIONS.has(region));
}

// Characters that never belong in text: soft hyphen, zero-width space, word joiner, byte-order mark. The zero-width
// joiners (U+200C, U+200D) are part of words in the scripts that write with them (Persian and Urdu in Arabic script,
// Syriac, and the Brahmic scripts of South Asia: Persian می\u200Cروم keeps its non-joiner), so they stay between two
// letters of one of those scripts, the same on both sides (marks skipped). Anywhere else (Latin, Japanese, Korean, Thai,
// two scripts meeting) one is invisible, and two words that look the same would differ, so it goes.
const INVISIBLE = /[\u00ad\u200b\u2060\ufeff]/g;
const JOINER_SCRIPTS = ["Arabic", "Syriac", "Devanagari", "Bengali", "Gurmukhi", "Gujarati", "Oriya", "Tamil", "Telugu", "Kannada", "Malayalam", "Sinhala"].map(
  (script) => new RegExp(`^\\p{Script=${script}}$`, "u"),
);
const LETTER = /^\p{L}$/u;
const joinerScript = (char) => (char && LETTER.test(char) ? JOINER_SCRIPTS.findIndex((script) => script.test(char)) : -1);

/** Text without its invisible characters, keeping a zero-width joiner or non-joiner only where a word needs it. */
export function withoutInvisible(text) {
  return String(text)
    .replace(INVISIBLE, "")
    .replace(/[\u200c\u200d]/g, (joiner, at, whole) => {
      let before = at - 1;
      while (before >= 0 && /\p{M}/u.test(whole[before])) before--;
      const script = joinerScript(whole[before]);
      return script >= 0 && joinerScript(whole[at + 1]) === script ? joiner : "";
    });
}

/** Which way a language's text runs: "rtl" or "ltr" (a code Lexicommons doesn't know runs left to right). */
export const directionOf = (code) => (typeof code === "string" && Object.hasOwn(LANGUAGES, code) && LANGUAGES[code].direction === "rtl" ? "rtl" : "ltr");

const ENDS = ["...", "?!", "!?", ".", "?", "!", "…"];

// The English form of a language's own end marks: Greek's ; is a question mark, and Hindi's । and Japanese and
// Chinese 。 and Armenian ։ are full stops. Only a mark in the language's ends is read this way (; in French is a semicolon).
const ENGLISH_ENDS = { ";": "?", "।": ".", "॥": ".", "。": ".", "？": "?", "！": "!", "؟": "?", "۔": ".", "։": "." };

/**
 * A sentence's end mark as English writes it, for English that stands for the sentence (the literal line). Given the
 * sentence's text, a full stop after a question asked inside it (Armenian's ՞: questionMarks) is a question mark.
 */
export function englishEnd(code, mark, text) {
  const language = typeof code === "string" && Object.hasOwn(LANGUAGES, code) ? LANGUAGES[code] : null;
  const end = (language?.ends ?? []).includes(mark) && Object.hasOwn(ENGLISH_ENDS, mark) ? ENGLISH_ENDS[mark] : mark;
  const asks = language?.questionMarks ?? [];
  return end === "." && typeof text === "string" && asks.some((ask) => text.includes(ask)) ? "?" : end;
}

/**
 * The marks that may end a sentence in a language, longest first (so "?!" is found before "!"): . ? ! … ?! !? ... and
 * the language's own ends. A pack item's punct is one of them, and they're where a book's sentences break.
 */
export const sentenceEnds = (code) =>
  [...new Set([...ENDS, ...(typeof code === "string" && Object.hasOwn(LANGUAGES, code) ? LANGUAGES[code].ends ?? [] : [])])].sort((a, b) => b.length - a.length);

/**
 * The space a word takes before the next one when shown, where the language wants a special one: before a word or
 * token that starts with one of its spaceBefore marks (French: U+202F before "?", U+00A0 before ":"); null otherwise.
 * The one decision typeset (below) and the reader's word-by-word layout (read/book-format.js) both make.
 */
export function spaceBeforeNext(code, next) {
  const space = typeof code === "string" && Object.hasOwn(LANGUAGES, code) ? LANGUAGES[code].spaceBefore : undefined;
  if (!space || typeof next !== "string" || !next) return null;
  return Object.hasOwn(space, next[0]) ? space[next[0]] : null;
}

// A run of marks after a word, with any spaces before it: "viens ?", "Quoi?!", "Attention :".
const MARK_RUN = /(?<=[^\s?!;:])[   ]*([?!;:]+)/gu;

/**
 * Text as a language shows it: each run of marks it has a spaceBefore for gets that space before it (a plain space
 * there becomes the right one), so "Tu viens?" shows as "Tu viens ?" in French. Idempotent; a colon between digits
 * (10:30) is left alone, and a language without spaceBefore gets its text back unchanged.
 */
export function typeset(code, text) {
  if (typeof text !== "string" || !(typeof code === "string" && Object.hasOwn(LANGUAGES, code) && LANGUAGES[code].spaceBefore)) return text;
  return text.replace(MARK_RUN, (run, marks, at, whole) => {
    const before = spaceBeforeNext(code, marks);
    if (before === null) return run;
    if (marks === ":" && /\d/.test(whole[at - 1] ?? "") && /\d/.test(whole[at + run.length] ?? "")) return run;
    return before + marks;
  });
}

/** A sentence's end mark as the language shows it after its last word: "?" is " ?" in French, "" stays "". */
export const endMark = (code, punct) => (punct ? typeset(code, `x${punct}`).slice(1) : punct);

// The letters NFD doesn't take apart into a letter and an accent, as a keyboard without them types them: Vietnamese
// and Croatian đ, Danish and Norwegian ø and æ, Polish ł, German ß, French œ, Turkish ı, Icelandic ð and þ.
const PLAIN_LETTERS = { đ: "d", Đ: "D", ø: "o", Ø: "O", æ: "ae", Æ: "Ae", ł: "l", Ł: "L", ß: "ss", ẞ: "SS", œ: "oe", Œ: "Oe", ı: "i", ð: "d", Ð: "D", þ: "th", Þ: "Th" };
const PLAIN_LETTER = new RegExp(`[${Object.keys(PLAIN_LETTERS).join("")}]`, "gu");
// The marks forgiving typing takes off: the accents scripts share (diacritics of no script of their own: é's acute,
// Vietnamese tones, Catalan's middle dot, Arabic tashkeel), Arabic's superscript alef and tatweel, and Hebrew's niqqud
// and cantillation (not its maqaf or punctuation), and the zero-width non-joiner and joiner (Persian's ZWNJ: a word
// typed without it is near, never wrong; text itself keeps it). Never a script's own marks (Devanagari's virama and nukta, Thai's
// tone marks), nor kana's voicing and long marks, which make another word.
const MARKS = /(?![\u3099-\u309c\u30fc\uff70])(?=\p{Diacritic})[\p{Script=Inherited}\p{Script=Common}]|[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7\u0640\u0670\u200c\u200d]/gu;

/**
 * Text without its accents, as forgiving typing compares it (een for één): the shared marks NFD takes off a letter
 * (MARKS), and the letters it doesn't take apart written plain (PLAIN_LETTERS), so "di" for "đi" counts as "cafe" for
 * "café" does; a script's own marks stay (क्या keeps its virama). Comes back in NFC.
 */
export const withoutAccents = (text) =>
  String(text).normalize("NFD").replace(MARKS, "").replace(PLAIN_LETTER, (letter) => PLAIN_LETTERS[letter]).normalize("NFC");

/** Two words spelled the same, case and accents aside (water and water, café and cafe): a Match pair that would ask nothing. */
export function spelledAlike(a, b) {
  const plain = (text) => withoutAccents(String(text ?? "").trim()).toLocaleLowerCase();
  return Boolean(plain(a)) && plain(a) === plain(b);
}
