// Packs and languages, case by case: the language registry (public/js/lang/) and that the book format reads it, the
// pack format's check (study/pack-format.js) on the built-in starter, on a Dutch and a German test pack, and on every
// way a pack can be wrong (each refused with its own message, all at once), and the view studying draws on (which
// packs are on, what an item may borrow from another pack, ids), and public packs in the open library (versions, the
// catalog's entries, what changed between versions), and your AI's side (pack-authoring.js: the form it writes items
// in, both ways, and its changes applied to a pack). Pure, so it runs in Node:
// `node scripts/test-packs.mjs` (exit 0 = pass).

// Dutch's grammar as the library has it, first: packs/path-nl.json uses its later patterns (scripts/fixtures/library-grammar.mjs).
import "./fixtures/library-grammar.mjs";
import { orderedItem } from "../public/js/study/pack-items.js";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGUAGES, directionOf, endMark, englishEnd, languageName, sentenceEnds, withArticle, withoutInvisible } from "../public/js/lang/index.js";
import { mayRead, needsReading, readingOver, readingProblem, rubyOf, vowelled } from "../public/js/lang/readings.js";
import { LANGUAGES as FORMAT_LANGUAGES } from "../public/js/read/book-format.js";
import { BUILT_IN } from "../public/js/packs/index.js";
import { FLAGS, flagOf } from "../public/js/lang/flags.js";
import { rubyText } from "../public/js/lang/readings.js";
import { PACK_CHECKS, PACK_LIMITS, buildView, catalogueEntry, checkPack, checkRulesOf, checkedProof, compareVersions, defaultInstalled, isPackRef, itemSentence, packKey, packRefs, packText, packUrl, packVersion, proofHolds, withPackEntry, withoutPack } from "../public/js/study/pack-format.js";
import * as content from "../public/js/study/content.js";
import { applyChange, authoringItem, describeChange, editItem, idFor, newPack, packIdFor, splitSentence, storedItem } from "../public/js/study/pack-authoring.js";

// A pack written out here says its sentences' words; as kept, each also says its text.
// A pack as the check gives it back: each sentence's text from its words (a plain card, as kana-ja's are, has its own text).
const texted = (pack) => ({ ...pack, items: pack.items.map((item) => orderedItem(item.words ? { ...item, text: item.words.map(([word]) => word).join(LANGUAGES[pack.language]?.separator ?? " ") + (item.punct ?? "") } : item)) });

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(HERE, "fixtures/packs", name), "utf8"));
const builtIn = BUILT_IN.map((pack) => ({ ...pack, builtIn: true }));
const NL = fixture("check-nl.json");
const DE = fixture("check-de.json");

let failed = 0;
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const eq = (actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${a} ≠ ${e}`);
};
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};
const copy = (value) => structuredClone(value);
const copy_ = copy;

// ---------- the registry ----------

test("a language's name with its article, by its sound: an Arabic, a Dutch, a Ukrainian, an Urdu", () => {
  eq(["Arabic", "Dutch", "Esperanto", "Icelandic", "Hindi", "Ukrainian", "Urdu", "Uyghur"].map((name) => withArticle(name)), ["an Arabic", "a Dutch", "an Esperanto", "an Icelandic", "a Hindi", "a Ukrainian", "an Urdu", "a Uyghur"]);
  eq(withArticle("Arabic", { capital: true }), "An Arabic");
  eq(withArticle("Dutch", { capital: true }), "A Dutch");
  // A name starting with U or Eu may sound like y or w: each registered one is decided here, so a new one fails until it is.
  const decided = { Ukrainian: "a", Urdu: "an", Uzbek: "an" };
  for (const { name } of Object.values(LANGUAGES)) {
    if (!/^(U|Eu)/.test(name)) continue;
    ok(name in decided, `${name}: decide its article (a or an) here`);
    eq(withArticle(name), `${decided[name]} ${name}`);
  }
});

// A language's locale is a BCP 47 tag of its own language, with its main country unless it has none (nl-NL, eo). A code
// with a script (zh-Hant: Chinese in Traditional characters) has its base language's, in a country (zh-TW).
const localeFits = (code, locale) => {
  const base = code.split("-")[0];
  return typeof locale === "string" && /^[a-z]{2,3}(-[A-Z]{2})?$/.test(locale) && (locale === code || locale.startsWith(`${code}-`) || (base !== code && locale.startsWith(`${base}-`)));
};
test("a language's locale: its own language's tag, or a code with a script its base language's (zh-Hant: zh-TW)", () => {
  for (const [code, locale] of [["nl", "nl-NL"], ["eo", "eo"], ["fil", "fil-PH"], ["zh", "zh-CN"], ["zh-Hant", "zh-TW"]]) ok(localeFits(code, locale), `${code} ${locale} refused`);
  for (const [code, locale] of [["nl", "de-DE"], ["zh-Hant", "ja-JP"], ["zh-Hant", "zh-Hant"], ["zh-Hant", "zh-Hant-TW"], ["zh", "zh-Hant-TW"], ["nl", "nl-nl"], ["nl", undefined]]) ok(!localeFits(code, locale), `${code} ${locale} taken`);
});

test("every language has what the format and studying read", () => {
  for (const [code, lang] of Object.entries(LANGUAGES)) {
    ok(typeof lang.name === "string" && lang.name, `${code}: name`);
    ok(localeFits(code, lang.locale), `${code}: locale (a BCP 47 tag of its own language, with its main country unless it has none; a code with a script, its base language's)`);
    ok(lang.stray === undefined || (Array.isArray(lang.stray) && lang.stray.every((w) => typeof w === "string" && w === w.toLowerCase())), `${code}: stray words`);
    // Written with spaces, or without (words split once and kept as written: Japanese, Chinese).
    ok(lang.segmenter === "spaces" ? lang.separator === " " : lang.segmenter === "fixed" && lang.separator === "", `${code}: segmenter and separator ("spaces" with " ", or "fixed" with "")`);
    ok(lang.readings === undefined || ["kana", "pinyin", "jyutping", "paiboon", "vowels", "roman"].includes(lang.readings), `${code}: readings ("kana", "pinyin", "jyutping", "paiboon", "vowels" or "roman")`);
    ok(lang.vowelsWhereNeeded === undefined || (lang.vowelsWhereNeeded === true && lang.readings === "vowels"), `${code}: vowelsWhereNeeded (true, with readings "vowels")`);
    ok(["lower", "any"].includes(lang.lemmaCase), `${code}: lemmaCase`);
    ok(lang.direction === undefined || lang.direction === "rtl", `${code}: direction ("rtl", or absent for left to right)`);
    ok(Array.isArray(lang.abbreviations) && lang.abbreviations.every((a) => a === a.toLowerCase() && a.endsWith(".")), `${code}: abbreviations`);
    ok(lang.ends === undefined || (Array.isArray(lang.ends) && lang.ends.every((e) => typeof e === "string" && e.length >= 1 && e.length <= 3 && e === e.normalize("NFC") && !/[\p{L}\p{N}\s]/u.test(e))), `${code}: ends (whole endings of 1 to 3 marks, no letters, digits or spaces)`);
    for (const [id, pattern] of Object.entries(lang.patterns)) {
      ok(/^[a-z0-9][a-z0-9-]{0,39}$/.test(id), `${code}: pattern id ${id}`);
      ok(pattern.name && pattern.about && Array.isArray(pattern.after), `${code}: pattern ${id} needs name, about and after`);
      for (const other of pattern.after) ok(lang.patterns[other], `${code}: pattern ${id} builds on ${other}, which isn't in the catalog`);
    }
  }
  eq(languageName("nl"), "Dutch");
  eq(languageName("xx"), "xx");
});
// A language with sentence endings of its own (Greek's ; and Hindi's ।), in the registry for one test only.
function withLanguage(code, lang, fn) {
  LANGUAGES[code] = lang;
  try {
    fn();
  } finally {
    delete LANGUAGES[code];
  }
}
test("a language's own sentence endings: an item may end with one, your AI's form splits it off, other languages refuse it", () => {
  eq(sentenceEnds("nl"), ["...", "?!", "!?", ".", "?", "!", "…"]);
  eq(sentenceEnds("xx"), sentenceEnds("nl"));
  // Only a language's own module counts: never a property every object has, never a value that isn't text.
  eq(sentenceEnds("__proto__"), sentenceEnds("nl"));
  eq(sentenceEnds({ toString: null }), sentenceEnds("nl"));
  withLanguage("xg", { name: "Endings test", locale: "xg-XG", segmenter: "spaces", separator: " ", lemmaCase: "lower", abbreviations: [], ends: [";", "।"], patterns: { v2: { name: "Verb second", about: "The verb comes second.", after: [] } } }, () => {
    eq(sentenceEnds("xg"), ["...", "?!", "!?", ".", "?", "!", "…", ";", "।"]);
    eq(splitSentence("Τι κάνεις;", "xg"), { words: ["Τι", "κάνεις"], punct: ";" });
    eq(splitSentence("Τι κάνεις;", "nl"), { words: ["Τι", "κάνεις;"], punct: "" });
    eq(splitSentence("मैं घर जा रहा हूँ।", "xg"), { words: ["मैं", "घर", "जा", "रहा", "हूँ"], punct: "।" });
    eq(splitSentence("Wat nu?!", "xg"), { words: ["Wat", "nu"], punct: "?!" });
    const item = { id: "ti-kaneis", concepts: ["v2"], words: [["Τι"], ["κάνεις", "κάνω"]], punct: ";", literal: [["What"], ["do you do"]], english: [0, 1], moved: [], means: "How are you?", wrong: ["Κάνεις τι;"], gap: { index: 1, options: ["κάνεις", "κάνω"] } };
    const pack = { format: "lexicommons-pack", version: 2, id: "check-xg", name: "Endings", language: "xg", from: "en", topics: {}, words: { κάνω: "to do" }, chunks: {}, patterns: {}, items: [item] };
    const checked = checkPack(copy(pack));
    eq(checked.errors, []);
    eq(checked.pack.items[0].punct, ";");
    eq(storedItem(authoringItem(checked.pack.items[0]), { language: "xg" }).item, checked.pack.items[0]);
    const wrongEnd = checkPack({ ...copy(pack), items: [{ ...copy(item), punct: "¿" }] });
    ok(wrongEnd.errors.some((e) => e.message.includes('punct must be one of . ? ! … ; । or "" (got "¿")')), JSON.stringify(wrongEnd.errors));
    const dutch = checkPack({ ...copy(pack), id: "check-xg-nl", language: "nl", words: {}, items: [{ ...copy(item), words: [["Wat"], ["doe"], ["je"]], gap: { index: 1, options: ["doe", "doet"] }, literal: [["What"], ["do"], ["you"]], english: null, wrong: ["Wat je doe;"] }] });
    ok(dutch.errors.some((e) => e.message.includes('punct must be one of . ? ! … or "" (got ";")')), JSON.stringify(dutch.errors));
    // The literal line is English, so a language's own end mark shows as English writes it; another language's ; stays.
    eq([";", "।", ".", "?!"].map((mark) => englishEnd("xg", mark)), ["?", ".", ".", "?!"]);
    eq(englishEnd("nl", ";"), ";");
  });
});
test("a language's flag, or its script's mark, is a file that exists; Arabic has a mark, not a country's flag", () => {
  for (const code of Object.keys(LANGUAGES)) {
    const src = flagOf(code);
    if (src) ok(existsSync(join(HERE, "../public", src)), `${code}: ${src} is missing`);
  }
  eq([flagOf("ar"), flagOf("fa"), flagOf("he"), flagOf("zz"), flagOf("__proto__")], ["/flags/marks/ar.svg", "/flags/4x3/ir.svg", "/flags/4x3/il.svg", null, null]);
  ok(!Object.hasOwn(FLAGS, "ar"), "Arabic has no country's flag");
  ok(existsSync(join(HERE, "../public/flags/marks/ar.svg")), "Arabic's mark is missing");
});
test("the English form of the real languages' own end marks (the literal line's end)", () => {
  eq(["el", "hi", "ja", "zh", "zh", "ja"].map((code, i) => englishEnd(code, [";", "।", "。", "？", "！", "?"][i])), ["?", ".", ".", "?", "!", "?"]);
  eq([englishEnd("fr", ";"), englishEnd("de", "。"), englishEnd("__proto__", ";"), englishEnd({ toString: null }, ";")], [";", "。", ";", ";"]);
  // Armenian asks inside the sentence (՞ on the word asked about) and ends a question with its full stop ։.
  eq([englishEnd("hy", "։", "Ինչպե՞ս ես։"), englishEnd("hy", "։", "Ես տանն եմ։"), englishEnd("hy", "։"), englishEnd("hy", "!", "Ո՞վ է"), englishEnd("ka", ".", "Ո՞վ է")], ["?", ".", ".", "!", "."]);
});
test("a right-to-left language: its direction, its own ends (؟ ۔), and words joined by a zero-width non-joiner", () => {
  eq([directionOf("nl"), directionOf("zz"), directionOf(undefined), directionOf("__proto__")], ["ltr", "ltr", "ltr", "ltr"]);
  // Invisible characters go, except a zero-width (non-)joiner between two letters of a script that writes with one.
  eq(withoutInvisible("می\u200Cروم"), "می\u200Cروم");
  eq(withoutInvisible("क्\u200Dष"), "क्\u200Dष");
  eq(withoutInvisible("bo\u200Cek"), "boek");
  eq(withoutInvisible("кни\u200Dга"), "книга");
  // Where a joiner is invisible it would make two look-alike words, so it goes: Japanese, Korean, Thai, two scripts meeting.
  eq(["日\u200C本", "한\u200C국", "ไท\u200Cย", "ه\u200Cक"].map(withoutInvisible), ["日本", "한국", "ไทย", "هक"]);
  eq(withoutInvisible("\u200Cمی روم\u200C"), "می روم");
  eq(withoutInvisible("so\u00adft\u200bwa\u2060re\ufeff"), "software");
  withLanguage("xr", { name: "Right-to-left test", locale: "xr-XR", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", ends: ["؟", "۔"], patterns: { v2: { name: "Verb last", about: "The verb comes last.", after: [] } } }, () => {
    eq(directionOf("xr"), "rtl");
    eq([englishEnd("xr", "؟"), englishEnd("xr", "۔")], ["?", "."]);
    eq(splitSentence("آیا انگلیسی صحبت می\u200Cکنی؟", "xr"), { words: ["آیا", "انگلیسی", "صحبت", "می\u200Cکنی"], punct: "؟" });
    eq(splitSentence("میں گھر جا رہا ہوں۔", "xr"), { words: ["میں", "گھر", "جا", "رہا", "ہوں"], punct: "۔" });
    // A Persian word keeps its zero-width non-joiner (U+200C): a word like mi-ravam is one word, and a dictionary form may carry one.
    const housewife = "خانه\u200Cدار";
    const goes = "می\u200Cرود";
    const item = { id: "mi-ravad", concepts: ["v2"], words: [[housewife, housewife], ["به"], ["خانه", "خانه"], [goes, "رفتن"]], punct: "۔", literal: [["The housewife"], ["to"], ["home"], ["goes", true]], english: [0, 3, 1, 2], moved: [goes], means: "The housewife goes home.", wrong: [`${housewife} خانه به ${goes}۔`], gap: { index: 3, options: [goes, "می\u200Cروم"] } };
    const pack = { format: "lexicommons-pack", version: 2, id: "check-xr", name: "Right to left", language: "xr", from: "en", topics: {}, words: { [housewife]: "housewife", خانه: "home, house", رفتن: "to go" }, chunks: {}, patterns: {}, items: [item] };
    const checked = checkPack(copy(pack));
    eq(checked.errors, []);
    eq(checked.pack.items[0].words[0], [housewife, housewife]);
    eq(storedItem(authoringItem(checked.pack.items[0]), { language: "xr" }).item, checked.pack.items[0]);
    // A joiner sits between letters only: one at a word's end goes, so no dictionary form ends in one.
    const trailing = checkPack({ ...copy(pack), words: { ...copy(pack).words, "خانه\u200C": "house" } });
    ok(!Object.keys(trailing.pack.words).some((key) => /[\u200c\u200d]$/.test(key)), JSON.stringify(Object.keys(trailing.pack.words)));
  });
});
test("the book format reads the same registry (one list of languages)", () => {
  ok(FORMAT_LANGUAGES === LANGUAGES, "book-format.js LANGUAGES isn't the registry");
});
test("every pattern a published weave uses is still in the catalog, by the same id", () => {
  // The Alice opening, woven into Dutch (the open library's weave.nl.eadf6e578bf6.json): its sentences' `c` ids. A
  // published weave stops opening if one of these is renamed or removed.
  for (const id of ["dat", "modal", "niet", "omte", "perfect", "question", "separable", "v2"]) ok(LANGUAGES.nl.patterns[id]?.name, `nl catalog lost "${id}"`);
});

// ---------- the built-in packs ----------

test("the starter pack passes the check unchanged, with no warnings", () => {
  const { pack, errors, warnings } = checkPack(BUILT_IN[0]);
  eq(errors, []);
  eq(warnings, []);
  eq(pack, BUILT_IN[0]);
});
test("built-in packs never share an item id within a language (their ids are app-wide)", () => {
  const seen = new Map();
  for (const pack of BUILT_IN) for (const item of pack.items) {
    const key = `${pack.language} ${item.id}`;
    ok(!seen.has(key), `${item.id} is in ${seen.get(key)} and ${pack.id}`);
    seen.set(key, pack.id);
  }
});

// ---------- Lexicommons' own default packs (packs/) ----------
// Each language's starter is a pack file, packs/<id>.json: the file an admin stages with library_upload and publishes as
// a default pack. Each must be its own checked form with nothing to fix (against its language's other default packs),
// come back the same from your AI's form, and give every pattern in its language's catalog at least 3 sentences
// across that language's packs here. A new language's pack only adds a file; nothing here changes.

const PACKS_DIR = join(HERE, "../packs");
const DEFAULTS = existsSync(PACKS_DIR)
  ? readdirSync(PACKS_DIR)
      .filter((name) => name.endsWith(".json"))
      .sort()
      .map((name) => ({ name, pack: JSON.parse(readFileSync(join(PACKS_DIR, name), "utf8")) }))
  : [];
const PATTERN_SENTENCES = 3;
const defaultsBeside = (pack) =>
  [...BUILT_IN, ...DEFAULTS.map((d) => d.pack)].filter((other) => other.language === pack.language && other.id !== pack.id).map((other) => ({ ...other, builtIn: true }));

for (const { name, pack } of DEFAULTS) {
  test(`packs/${name}: named for its id, its language in the registry, its own checked form with no warnings`, () => {
    eq(name, `${pack.id}.json`);
    ok(LANGUAGES[pack.language], `"${pack.language}" isn't in the registry`);
    const { pack: checked, errors, warnings } = checkPack(pack, { installed: defaultsBeside(pack) });
    eq(errors, []);
    eq(warnings, []);
    eq(checked, texted(pack));
  });
  test(`packs/${name}: every sentence, in your AI's form and back, is the same sentence`, () => {
    const items = pack.items.map((item) => {
      // A plain card (a script's letter, as kana-ja's are) is no sentence: it's carried as it is.
      if (!item.words) return item;
      const { item: back, problems } = storedItem(authoringItem(item, pack.language), { language: pack.language });
      ok(!problems.length, `${item.id}: ${JSON.stringify(problems)}`);
      return back;
    });
    eq(checkPack({ ...pack, items }, { installed: defaultsBeside(pack) }).pack?.items, pack.items);
  });
}
// A pattern of the shared grammar no sentence shows yet isn't offered (content.js PATTERNS_IN_USE): the grammar can
// name what packs haven't taught yet. One the default packs do teach has enough sentences to study it.
test(`packs/: every pattern of a language's grammar its default packs use has ${PATTERN_SENTENCES} sentences or more in them`, () => {
  for (const language of new Set(DEFAULTS.map((d) => d.pack.language))) {
    const count = Object.fromEntries(Object.keys(LANGUAGES[language].patterns).map((id) => [id, 0]));
    for (const { pack } of DEFAULTS) if (pack.language === language) for (const item of pack.items) for (const id of item.concepts ?? []) if (Object.hasOwn(count, id)) count[id]++;
    const thin = Object.entries(count).filter(([, n]) => n > 0 && n < PATTERN_SENTENCES);
    ok(!thin.length, `${language}: ${thin.map(([id, n]) => `${id} has ${n}`).join(", ")}`);
  }
});

// ---------- languages written without spaces, and readings (Japanese, Chinese) ----------

// A Japanese pack: its words split as written, a reading on each word with kanji, and its dictionary forms' readings.
const JA = {
  format: "lexicommons-pack",
  version: 2,
  id: "check-ja",
  name: "A check pack (Japanese)",
  language: "ja",
  from: "en",
  topics: { home: "At home" },
  words: { 私: "I", 学生: "student", です: "is", 食べる: "to eat", 寿司: "sushi" },
  readings: { 私: "わたし", 学生: "がくせい", 食べる: "たべる", 寿司: "すし" },
  chunks: {},
  patterns: {},
  items: [
    { id: "student", topic: "home", concepts: ["desu"], words: [["私", "私", "わたし"], ["は"], ["学生", "学生", "がくせい"], ["です", "です"]], punct: "。", literal: [["I"], ["a student"], ["am", true]], english: [0, 2, 1], moved: ["です"], means: "I'm a student.", wrong: ["私を学生です。"], gap: { index: 1, options: ["は", "を"] } },
    { id: "sushi", topic: "home", concepts: ["object-o"], words: [["寿司", "寿司", "すし"], ["を"], ["食べました", "食べる", "たべました"]], punct: "。", literal: [["sushi"], ["ate", true]], english: [1, 0], moved: ["食べました"], means: "I ate sushi.", wrong: ["寿司が食べました。"], gap: { index: 1, options: ["を", "が"] } },
  ],
};
const ZH = {
  format: "lexicommons-pack",
  version: 2,
  id: "check-zh",
  name: "A check pack (Chinese)",
  language: "zh",
  from: "en",
  topics: { people: "Family & people" },
  words: { 我们: "we", 是: "to be", 学生: "student" },
  readings: { 我们: "wǒ men", 是: "shì", 学生: "xué sheng" },
  chunks: {},
  patterns: { identity: { name: "是: is", about: "是 joins two nouns.", after: [] } },
  items: [
    { id: "students", topic: "people", concepts: ["identity"], words: [["我们", "我们", "wǒ men"], ["是", "是", "shì"], ["学生", "学生", "xué sheng"]], punct: "。", literal: [["we"], ["are"], ["students"]], english: [0, 1, 2], moved: [], means: "We're students.", wrong: ["我们学生是。"], gap: { index: 1, options: ["是", "有"] } },
  ],
};

test("Japanese and Chinese: words joined with nothing, each word with kanji or hanzi read, a pack that passes as it is", () => {
  for (const pack of [JA, ZH]) {
    const { pack: checked, errors, warnings } = checkPack(pack);
    eq(errors, []);
    eq(warnings, []);
    eq(checked, texted(pack));
  }
  eq(itemSentence(JA.items[0], "ja"), "私は学生です。");
  eq(itemSentence(ZH.items[0], "zh"), "我们是学生。");
  // Without its language, a sentence is joined with spaces, as before.
  eq(itemSentence(JA.items[0]), "私 は 学生 です。");
  const view = buildView([JA], "ja");
  eq(view.readings, { 私: "わたし", 学生: "がくせい", 食べる: "たべる", 寿司: "すし" });
  eq(view.glossary.readings.学生, "がくせい");
});

const JA_REFUSED = [
  ["a reading whose kana don't fit the word", (p) => (p.items[1].words[2] = ["食べました", "食べる", "たべまして"]), 'items[1] (sushi): words[2] "食べました": the reading "たべまして" doesn\'t fit'],
  ["a reading in katakana", (p) => (p.items[0].words[0] = ["私", "私", "ワタシ"]), 'the reading "ワタシ" must be hiragana only'],
  ["a reading on a word written in kana", (p) => (p.items[0].words[3] = ["です", "です", "です"]), '"です" is written without kanji, so it carries no reading'],
  ["a dictionary form's reading that doesn't fit it", (p) => (p.readings.食べる = "たべます"), 'readings["食べる"]: the reading "たべます" doesn\'t fit'],
  ["a reading that isn't text", (p) => (p.items[0].words[0] = ["私", "私", 5]), "items[0].words[0][2] must be text."],
];
for (const [name, change, message] of JA_REFUSED) {
  test(`refused (Japanese): ${name}`, () => {
    const pack = copy(JA);
    change(pack);
    const result = checkPack(pack);
    ok(result.pack === null, "it was kept");
    ok(result.errors.some((e) => e.message.includes(message)), `no error saying "${message}"; got ${JSON.stringify(result.errors.map((e) => e.message))}`);
  });
}
test("a reading as ruby text: a word joiner first when it starts with a marked letter (Chrome splits ā there), only then", () => {
  for (const reading of ["ān", "ài", "èr", "ōu", "じかん", "がく"]) ok(rubyText(reading) === `\u2060${reading}`, `${reading} has no word joiner first`);
  for (const reading of ["shì", "miàn", "xué", "かど", "わたし"]) ok(rubyText(reading) === reading, `${reading} was changed`);
  ok(rubyText(null) === null && rubyText("") === "", "an empty reading was changed");
});
const ZH_REFUSED = [
  ["pinyin run together (a syllable per character, with spaces)", (p) => (p.items[0].words[0] = ["我们", "我们", "wǒmen"]), 'the reading "wǒmen" has 1 syllable; "我们" has 2 characters'],
  ["a tone mark on the wrong vowel", (p) => (p.items[0].words[2] = ["学生", "学生", "xúe sheng"]), '"xúe" isn\'t a pinyin syllable with its tone mark in the right place'],
  ["something that isn't pinyin", (p) => (p.items[0].words[1] = ["是", "是", "shir"]), '"shir" isn\'t a pinyin syllable'],
  ["r for a character that isn't 儿", (p) => (p.items[0].words[1] = ["是", "是", "r"]), '"r" is only for 儿'],
];
for (const [name, change, message] of ZH_REFUSED) {
  test(`refused (Chinese): ${name}`, () => {
    const pack = copy(ZH);
    change(pack);
    const result = checkPack(pack);
    ok(result.pack === null, "it was kept");
    ok(result.errors.some((e) => e.message.includes(message)), `no error saying "${message}"; got ${JSON.stringify(result.errors.map((e) => e.message))}`);
  });
}
test("kept, with a warning: a word with kanji and no reading, a reading on a word with no lemma, a dictionary form with no reading", () => {
  const pack = copy(JA);
  pack.items[0].words[2] = ["学生", "学生"];
  pack.items[1].words[0] = ["寿司", null, "すし"];
  delete pack.readings.食べる;
  const { pack: checked, warnings } = checkPack(pack);
  ok(checked, "it was refused");
  const said = warnings.map((w) => w.message).join(" | ");
  ok(said.includes("No reading for 学生") && said.includes("寿司 has a reading but no dictionary form") && said.includes("No reading for the dictionary forms 食べる"), said);
  eq(checked.items[1].words[0], ["寿司", null, "すし"]);
});
test("kept: one written word with two readings in a sentence, each time its own, and your AI's form keeps both (it kept one, with a warning, before 9 Nov 2026)", () => {
  const pack = copy(JA);
  pack.items[0].words = [["今日", "今日", "きょう"], ["は"], ["今日", "今日", "こんにち"], ["です", "です"]];
  pack.items[0].gap = { index: 1, options: ["は", "を"] };
  pack.items[0].wrong = ["今日を今日です。"];
  const { pack: checked, warnings } = checkPack(pack);
  ok(checked && !warnings.some((w) => /two readings|round trip/.test(w.message)), JSON.stringify(warnings));
  eq(checked.items[0].words, pack.items[0].words);
  eq(storedItem(authoringItem(checked.items[0], "ja"), { language: "ja" }).item, checked.items[0]);
});
test("the same sentence twice is found in a language without spaces too", () => {
  const pack = copy(JA);
  pack.items.push({ ...copy(pack.items[0]), id: "again" });
  ok(checkPack(pack).errors.some((e) => e.message.includes("the same sentence as items[0] (student)")), "not found");
});
test("your AI's form in Japanese: the words as split, readings by the word as written, and back", () => {
  const written = authoringItem(JA.items[1], "ja");
  eq(written.sentence, "寿司を食べました。");
  eq(written.words, ["寿司", "を", "食べました"]);
  eq(written.readings, { 寿司: "すし", 食べました: "たべました" });
  eq(storedItem(written, { language: "ja" }).item, texted(JA).items[1]);
  // Dutch keeps its form: no words, no readings.
  ok(!("words" in authoringItem(BUILT_IN[0].items[0], "nl")) && !("readings" in authoringItem(BUILT_IN[0].items[0], "nl")), "Dutch got words or readings");
  const missing = storedItem({ ...written, words: undefined }, { language: "ja" });
  ok(missing.problems.some((p) => p.at === "words" && p.message.includes("written without spaces")), JSON.stringify(missing.problems));
  const wrongSplit = storedItem({ ...written, words: ["寿司", "を", "食べた"] }, { language: "ja" });
  ok(wrongSplit.problems.some((p) => p.at === "words" && p.message.includes("joined, give")), JSON.stringify(wrongSplit.problems));
  const spaced = storedItem({ ...authoringItem(BUILT_IN[0].items[0], "nl"), words: ["Ik"] }, { language: "nl" });
  ok(spaced.problems.some((p) => p.at === "words" && p.message.includes("only for a language written without spaces")), JSON.stringify(spaced.problems));
  const stray = storedItem({ ...written, readings: { 天ぷら: "てんぷら" } }, { language: "ja" });
  ok(stray.problems.some((p) => p.at === "readings.天ぷら"), JSON.stringify(stray.problems));
});
test("your AI's changes carry the pack's readings like its other dictionaries", () => {
  const { pack: next, problems } = applyChange(copy(JA), { kind: "edit", dictionaries: { readings: { 寿司: null, 天ぷら: "てんぷら" } } });
  eq(problems, []);
  eq(next.readings, { 私: "わたし", 学生: "がくせい", 食べる: "たべる", 天ぷら: "てんぷら" });
});

// ---------- vowel marks as readings (Arabic, Hebrew, Latin's macrons) ----------

// Languages that show vowel marks, registered for these tests only (the first real ones land with their packs).
const VOWEL_LANGS = {
  xa: { name: "Vowels test (Arabic)", locale: "xa-XA", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", readings: "vowels", patterns: {} },
  xh: { name: "Vowels test (Hebrew)", locale: "xh-XH", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", readings: "vowels", patterns: { adjective: { name: "Describing words come after", about: "טוב comes after ספר.", after: [] } } },
  xp: { name: "Vowels test (Persian)", locale: "xp-XP", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", readings: "vowels", vowelsWhereNeeded: true, patterns: { adjective: { name: "Describing words come after", about: "خوب comes after کتاب.", after: [] } } },
  xl: { name: "Vowels test (Latin)", locale: "xl-XL", segmenter: "spaces", separator: " ", lemmaCase: "lower", abbreviations: [], readings: "vowels", patterns: {} },
};
Object.assign(LANGUAGES, VOWEL_LANGS);
test("vowel marks: a reading is the word with its marks, the same letters in the same order", () => {
  eq(readingProblem("xh", "ספר", "סֵפֶר"), null);
  // The everyday full spelling, its points added.
  eq(readingProblem("xh", "שולחן", "שׁוּלְחָן"), null);
  // A word written with a mark of its own.
  eq(readingProblem("xa", "جداً", "جِدًّا"), null);
  eq(readingProblem("xa", "شكرًا", "شُكْرًا"), null);
  eq(readingProblem("xa", "أكل", "أَكَلَ"), null);
  eq(readingProblem("xl", "amo", "amō"), null);
  eq(readingProblem("xl", "Romae", "Rōmae"), null);
  // Shown in the word's place, its frame kept; the mark it was written with is no frame.
  eq(vowelled("xh", "ספר.", "סֵפֶר"), "סֵפֶר.");
  eq(vowelled("xa", "جداً", "جِدًّا"), "جِدًّا");
  eq(vowelled("xl", "amo,", "amō"), "amō,");
  // Never over the word, so the lines need no room above.
  eq(rubyOf("xh", "ספר", "סֵפֶר"), [["ספר", null]]);
  ok(!readingOver("xh") && !readingOver("xl") && readingOver("ja") && readingOver("zh"), "readingOver");
  // Every Arabic or Hebrew word must carry one; a Latin word may.
  ok(needsReading("xh", "ספר") && needsReading("xa", "جدا") && !needsReading("xl", "amo") && !needsReading("xh", "12"), "needsReading");
  // Persian and Urdu: a word carries one only where its letters don't say how it's read.
  ok(!needsReading("xp", "کتاب") && !needsReading("xp", "آب"), "needsReading (vowelsWhereNeeded)");
  eq(readingProblem("xp", "کتاب", "کِتاب"), null);
  eq(readingProblem("xp", "می‌روم", "می‌رَوَم"), null);
  eq(vowelled("xp", "خانه", "خانهٔ"), "خانهٔ");
});
const VOWELS_REFUSED = [
  ["no marks at all", "xh", "ספר", "ספר", "has no vowel marks"],
  ["the short spelling of a word written in full", "xh", "מילה", "מִלָּה", 'without them it\'s "מלה"'],
  ["a hamza the word as written doesn't have", "xa", "اكل", "أَكَلَ", "spell the word with its hamza"],
  ["alef wasla for plain alef", "xa", "اكل", "ٱكَلَ", "plain ا, never ٱ"],
  ["a Latin word with no long vowel", "xl", "puella", "puella", "a word with no long vowel carries no reading"],
  ["another letter under the macron", "xl", "amo", "amā", 'without them it\'s "ama"'],
  ["a word with no letters", "xh", "12", "12", "written without letters"],
  ["a Persian word its letters already read", "xp", "آب", "آب", "a word whose letters say how it's read carries no reading"],
  ["a mark the word is written with, dropped", "xa", "شكرًا", "شُكْرا", "drops a mark"],
  ["Arabic kaf for Persian keheh", "xp", "کتاب", "كِتاب", 'has ك (U+0643) where "کتاب" has ک (U+06A9), letters that look alike'],
  ["Arabic yeh for Farsi yeh", "xp", "میز", "مِيز", 'has ي (U+064A) where "میز" has ی (U+06CC)'],
  ["alef maksura for Farsi yeh", "xp", "دری", "دَرى", 'has ى (U+0649) where "دری" has ی (U+06CC)'],
  ["Arabic heh for Urdu heh goal", "xp", "کہ", "کِه", 'has ه (U+0647) where "کہ" has ہ (U+06C1)'],
  ["Arabic heh for do-chashmi heh", "xp", "بھی", "بِهی", 'has ه (U+0647) where "بھی" has ھ (U+06BE)'],
  ["a look-alike beside another letter: the general message", "xp", "کتاب", "كِتان", "isn't \"کتاب\" with marks"],
  ["heh goal for do-chashmi: the general message", "xp", "بھی", "بِہی", "isn't \"بھی\" with marks"],
];
for (const [name, lang, word, reading, message] of VOWELS_REFUSED) {
  test(`refused (vowel marks): ${name}`, () => {
    const problem = readingProblem(lang, word, reading);
    ok(problem?.includes(message), `got ${JSON.stringify(problem)}`);
    eq(vowelled(lang, word, reading), word);
  });
}
const HE = {
  format: "lexicommons-pack",
  version: 2,
  id: "check-xh",
  name: "A check pack (vowel marks)",
  language: "xh",
  from: "en",
  topics: { home: "At home" },
  words: { ספר: "book", טוב: "good" },
  readings: { ספר: "סֵפֶר", טוב: "טוֹב" },
  chunks: {},
  patterns: {},
  items: [
    { id: "good-book", topic: "home", concepts: ["adjective"], words: [["ספר", "ספר", "סֵפֶר"], ["טוב", "טוב", "טוֹב"]], punct: ".", literal: [["a book", true], ["good", true]], english: [1, 0], moved: ["ספר", "טוב"], means: "A good book.", wrong: ["טוב ספר."], gap: { index: 1, options: [{ text: "טוב", reading: "טוֹב" }, { text: "טובה", reading: "טוֹבָה" }] } },
  ],
};
test("a pack with vowel marks passes as it is, its words and dictionary forms read", () => {
  const { pack: checked, errors, warnings } = checkPack(HE);
  eq(errors, []);
  eq(warnings, []);
  eq(checked, texted(HE));
  eq(buildView([HE], "xh").readings, { ספר: "סֵפֶר", טוב: "טוֹב" });
  // Your AI's form: readings by the word as written, and back.
  const written = authoringItem(HE.items[0], "xh");
  eq(written.readings, { ספר: "סֵפֶר", טוב: "טוֹב" });
  eq(storedItem(written, { language: "xh" }).item, texted(HE).items[0]);
});
test("refused, and warned: a reading that isn't the word with marks; an Arabic or Hebrew word with none", () => {
  const wrong = copy(HE);
  wrong.items[0].words[0] = ["ספר", "ספר", "סְפָרִים"];
  ok(checkPack(wrong).errors.some((e) => e.message.includes('isn\'t "ספר" with marks')), "not refused");
  const unread = copy(HE);
  unread.items[0].words[1] = ["טוב", "טוב"];
  unread.items[0].gap.options = ["טוב", "טובה"];
  const { pack: checked, warnings } = checkPack(unread);
  ok(checked && warnings.some((w) => w.message.includes("No reading for טוב") && w.message.includes("vowel marks")), JSON.stringify(warnings.map((w) => w.message)));
});
test("Fill's choices carry their readings: warned when none has the word's marks, refused when one would stand out", () => {
  const withOptions = (options) => {
    const pack = copy(HE);
    pack.items[0].gap.options = options;
    return checkPack(pack);
  };
  const errorOf = (result) => result.errors.map((e) => e.message).join(" | ");
  const bare = withOptions(["טוב", "טובה"]);
  ok(bare.pack && bare.warnings.some((w) => w.message.includes("Fill shows the choices for טוב") && w.message.includes("{ text, reading }")), JSON.stringify(bare.warnings.map((w) => w.message)));
  for (const [why, options, message] of [
    ["a choice's reading that isn't it with marks", [{ text: "טוב", reading: "טוֹב" }, { text: "טובה", reading: "טובה" }], 'gap.options[1] "טובה": the reading "טובה" has no vowel marks'],
    ["a choice with more than text and reading", [{ text: "טוב", reading: "טוֹב" }, { text: "טובה", reading: "טוֹבָה", hidden: true }], "is the word as written or { text, reading } (not hidden)"],
    ["a choice with no reading beside choices with theirs", [{ text: "טוב", reading: "טוֹב" }, "טובה"], "טובה has no reading while the other choices do"],
    ["the right choice read another way than in its sentence", [{ text: "טוב", reading: "טוּב" }, { text: "טובה", reading: "טוֹבָה" }], "needs the sentence's reading (טוֹב)"],
    ["the right choice bare beside choices with readings", ["טוב", { text: "טובה", reading: "טוֹבָה" }], "needs the sentence's reading (טוֹב)"],
    ["a choice that isn't text", [{ text: "טוב", reading: "טוֹב" }, { text: 7, reading: "טוֹבָה" }], "gap.options[1].text"],
  ]) {
    const result = withOptions(options);
    ok(!result.pack && errorOf(result).includes(message), `${why}: ${errorOf(result)}`);
  }
  // The right choice with a reading its sentence's word doesn't have.
  const unread = copy(HE);
  unread.items[0].words[1] = ["טוב", "טוב"];
  const stray = checkPack(unread);
  ok(!stray.pack && stray.errors.some((e) => e.message.includes('the right choice "טוב" has a reading, but the sentence\'s word has none')), JSON.stringify(stray.errors));
  // Persian and Urdu: a choice whose letters say how it's read needs none beside one that has it.
  const fa = copy(HE);
  Object.assign(fa, { id: "check-xp", language: "xp", words: { کتاب: "book", خوب: "good" }, readings: { کتاب: "کِتاب" } });
  fa.items[0] = { ...fa.items[0], words: [["کتاب", "کتاب", "کِتاب"], ["خوب", "خوب"]], moved: ["کتاب", "خوب"], wrong: ["خوب کتاب."], gap: { index: 0, options: [{ text: "کتاب", reading: "کِتاب" }, "کتابها"] } };
  const where = checkPack(fa);
  eq(where.errors, []);
  eq(where.pack?.items[0].gap.options, [{ text: "کتاب", reading: "کِتاب" }, "کتابها"]);
});
for (const code of Object.keys(VOWEL_LANGS)) delete LANGUAGES[code];

// ---------- Thai's Paiboon+ readings ----------

test("Paiboon+: a Thai word's reading, over the whole word", () => {
  for (const [word, reading] of [["สวัสดี", "sà-wàt-dii"], ["ทอม", "tɔm"], ["เมื่อวาน", "mʉ̂ʉa-waan"], ["ช่วย", "chûuai"], ["กรุงเทพ", "grung-têep"], ["ปลา", "bplaa"], ["ตลาด", "dtà-làat"], ["ภาษาอังกฤษ", "paa-sǎa-ang-grìt"]]) {
    eq(readingProblem("th", word, reading), null);
  }
  // The frame (brackets, punctuation) bare, the reading over the rest.
  eq(rubyOf("th", "(สวัสดี)", "sà-wàt-dii"), [["(", null], ["สวัสดี", "sà-wàt-dii"], [")", null]]);
  ok(readingOver("th") && needsReading("th", "ครับ") && !needsReading("th", "OK") && !needsReading("th", "2026"), "readingOver and needsReading");
});
test("Paiboon+: a Thai word left unread is warned about, saying how to write its reading", () => {
  const pack = JSON.parse(readFileSync(join(HERE, "..", "packs", "starter-th.json"), "utf8"));
  const unread = copy(pack);
  const item = unread.items.find((it) => it.id === "hello-man");
  item.words[0] = [item.words[0][0], item.words[0][1]];
  const { pack: checked, warnings } = checkPack(unread);
  const warning = warnings.find((w) => w.message.includes("No reading for สวัสดี"));
  ok(checked && warning && warning.message.includes("Paiboon+") && !warning.message.includes("undefined"), JSON.stringify(warnings.map((w) => w.message)));
});
const PAIBOON_REFUSED = [
  ["a capital", "ผม", "Pǒm", "has a capital"],
  ["a space", "ผม", "pǒm pǒm", "has a space"],
  ["two tones on a syllable", "ผม", "pǒǒm̀", "two tone marks"],
  ["the tone off the first vowel", "ข้าว", "kaâo", "off its first vowel"],
  ["a mark that isn't a tone", "ผม", "pöm", "a mark that isn't a tone"],
  ["a tone number", "ผม", "pom4", "isn't a Paiboon+ syllable"],
  ["a word with no Thai letters", "OK", "oo-kee", "carries no reading"],
];
for (const [name, word, reading, message] of PAIBOON_REFUSED) {
  test(`refused (Paiboon+): ${name}`, () => {
    const problem = readingProblem("th", word, reading);
    ok(problem?.includes(message), `got ${JSON.stringify(problem)}`);
  });
}

// ---------- Yiddish's romanization (readings "roman"), with a test language registered here only ----------

LANGUAGES.xy = { name: "Roman test", locale: "xy", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", readings: "roman", patterns: { "the-past": { name: "The past", about: "האָבן and a participle.", after: [] } } };
test("roman: a Hebrew-origin word carries its romanization over the whole word, its frame bare; no word needs one", () => {
  eq(readingProblem("xy", "שבת", "shabes"), null);
  eq(readingProblem("xy", "שבת,", "shabes"), null);
  eq(readingProblem("xy", "ירושלים", "Yerusholayim"), null);
  eq(readingProblem("xy", "ראש־השנה", "rosheshone"), null);
  eq(rubyOf("xy", "שבת,", "shabes"), [["שבת", "shabes"], [",", null]]);
  eq(rubyOf("xy", "שבת", null), [["שבת", null]]);
  ok(readingOver("xy") && !needsReading("xy", "שבת") && !needsReading("xy", "שול"), "readingOver, needsReading");
  // May carry one (so the reader shows a layer's): a word in Hebrew letters, never a Latin one.
  ok(mayRead("xy", "שבת") && mayRead("xy", "שבת,") && !mayRead("xy", "shabes") && !mayRead("xy", "12"), "mayRead (roman)");
  ok(mayRead("ja", "学生") && !mayRead("ja", "です") && !mayRead("nl", "boek"), "mayRead (kana, none)");
  eq(vowelled("xy", "שבת", "shabes"), "שבת");
});
for (const [name, word, reading, message] of [
  ["Hebrew points for a romanization", "שבת", "שַׁבָּת", "isn't a romanization"],
  ["a digit in it", "שבת", "shab3s", "isn't a romanization"],
  ["a word in Latin letters", "shabes", "shabes", "its own script's letters"],
  ["two spaces", "ראש השנה", "rosh  hashone", "isn't a romanization"],
  ["a Hebrew point on a Latin letter", "שבת", "sha\u05B8bes", "isn't a romanization"],
  ["an accent with no letter under it", "שבת", "\u0301shabes", "isn't a romanization"],
]) {
  test(`refused (roman): ${name}`, () => {
    const problem = readingProblem("xy", word, reading);
    ok(problem?.includes(message), `got ${JSON.stringify(problem)}`);
  });
}
test("roman: a tone accent may sit on a long vowel, as a combining accent (Punjabi's ਚਾਹ chā́, ਤੁਹਾਡਾ tuā̀ḍā)", () => {
  // No precomposed letter has both a macron and a tone accent, so the accent comes as a combining mark (U+0300–U+036F).
  eq(readingProblem("xy", "ਚਾਹ", "cha\u0304\u0301"), null);
  eq(readingProblem("xy", "ਤੁਹਾਡਾ", "tua\u0304\u0300\u1E0Da\u0304"), null);
  eq(readingProblem("xy", "ਮੀਂਹ", "mi\u0304\u0301ñ"), null);
});
test("roman: a pack whose Hebrew-origin words carry readings and others none passes, with no warnings", () => {
  const pack = {
    format: "lexicommons-pack", version: 2, id: "check-xy", name: "A check pack (roman)", language: "xy", from: "en",
    topics: { home: "At home" }, words: { האָבן: "to have", שבת: "the Sabbath, Saturday", געגעסן: "eaten" }, readings: { שבת: "shabes" }, chunks: {},
    patterns: {},
    items: [
      { id: "shabes", topic: "home", concepts: ["the-past"], words: [["שבת", "שבת", "shabes"], ["האָבן", "האָבן"], ["מיר", null], ["געגעסן", "געגעסן"]], punct: ".", literal: [["On Saturday"], ["have", true], ["we", true], ["eaten"]], english: [2, 1, 3, 0], moved: ["האָבן", "מיר"], means: "On Saturday we ate.", wrong: ["שבת מיר האָבן געגעסן."], gap: { index: 1, options: ["האָבן", "האָט", "האָסט"] } },
      { id: "two", topic: "home", concepts: ["the-past"], words: [["מיר", null], ["האָבן", "האָבן"], ["געגעסן", "געגעסן"]], punct: ".", literal: [["We"], ["have"], ["eaten"]], english: [0, 1, 2], means: "We ate.", wrong: ["מיר האָט געגעסן."], gap: { index: 1, options: ["האָבן", "האָט", "האָסט"] } },
      { id: "three", topic: "home", concepts: ["the-past"], words: [["איך", null], ["האָב", "האָבן"], ["געגעסן", "געגעסן"]], punct: ".", literal: [["I"], ["have"], ["eaten"]], english: [0, 1, 2], means: "I ate.", wrong: ["איך האָבן געגעסן."], gap: { index: 1, options: ["האָב", "האָבן", "האָט"] } },
    ],
  };
  const { pack: checked, errors, warnings } = checkPack(pack);
  eq(errors, []);
  eq(warnings, []);
  eq(checked.items[0].words[0], ["שבת", "שבת", "shabes"]);
  eq(buildView([pack], "xy").readings, { שבת: "shabes" });
});
delete LANGUAGES.xy;

// ---------- Cantonese's Jyutping readings ----------

test("Jyutping: a syllable over each character, its tone number after it", () => {
  for (const [word, reading] of [["學生", "hok6 saang1"], ["我", "ngo5"], ["唔該", "m4 goi1"], ["廣東話", "gwong2 dung1 waa2"], ["食", "sik6"], ["一", "jat1"], ["佢", "keoi5"], ["呢度", "ni1 dou6"], ["香港", "hoeng1 gong2"], ["雨", "jyu5"], ["五", "ng5"], ["名", "meng2"]]) {
    eq(readingProblem("yue", word, reading), null);
  }
  // A syllable over each character, the frame (a comma) bare.
  eq(rubyOf("yue", "奶茶，", "naai5 caa4"), [["奶", "naai5"], ["茶", "caa4"], ["，", null]]);
  ok(readingOver("yue") && needsReading("yue", "學生") && !needsReading("yue", "，"), "readingOver and needsReading");
});
test("Jyutping: a Cantonese word left unread is warned about, saying how to write its reading", () => {
  const pack = JSON.parse(readFileSync(join(HERE, "..", "packs", "starter-yue.json"), "utf8"));
  const unread = copy(pack);
  const item = unread.items.find((it) => it.id === "student");
  item.words[2] = [item.words[2][0], item.words[2][1]];
  const { pack: checked, warnings } = checkPack(unread);
  const warning = warnings.find((w) => w.message.includes("No reading for 學生"));
  ok(checked && warning && warning.message.includes("Jyutping") && !warning.message.includes("undefined"), JSON.stringify(warnings.map((w) => w.message)));
});
test("a reading kind with no hint of its own is still asked for in words, never \"undefined\"", () => {
  LANGUAGES.xq = { name: "Kind test", locale: "xq", segmenter: "fixed", separator: "", lemmaCase: "any", abbreviations: [], ends: ["。"], readings: "a-new-kind", patterns: { be: { name: "Is", about: "A test pattern.", after: [] } } };
  const pack = {
    format: "lexicommons-pack", version: 2, id: "check-xq", name: "A check pack (a new kind)", language: "xq", from: "en", topics: { home: "At home" },
    words: { 我: "I", 学生: "student" }, readings: {}, chunks: {}, patterns: {},
    items: [{ id: "one", topic: "home", concepts: ["be"], words: [["我", "我"], ["学生", "学生"]], punct: "。", literal: [["I"], ["a student"]], english: [0, 1], means: "I'm a student.", wrong: ["学生我。"], gap: { index: 1, options: ["学生", "我"] } }],
  };
  const { warnings } = checkPack(pack);
  delete LANGUAGES.xq;
  const warning = warnings.find((w) => w.message.includes("add each word's reading"));
  ok(warning && warning.message.includes("(as it's said)") && !warning.message.includes("undefined"), JSON.stringify(warnings.map((w) => w.message)));
});
const JYUTPING_REFUSED = [
  ["no tone number", "我", "ngo", "isn't a Jyutping syllable"],
  ["a tone past 6", "我", "ngo7", "isn't a Jyutping syllable"],
  ["a capital", "香港", "Hoeng1 gong2", "isn't a Jyutping syllable"],
  ["pinyin's tone mark", "我", "ngǒ", "isn't a Jyutping syllable"],
  ["an entering tone off 1, 3 or 6", "食", "sik2", "its tone is 1, 3 or 6"],
  ["a syllable short", "學生", "hok6", "has 1 syllable"],
  ["two spaces", "學生", "hok6  saang1", "one space between syllables"],
  ["a word without characters", "OK", "ou1 kei1", "carries no reading"],
];
for (const [name, word, reading, message] of JYUTPING_REFUSED) {
  test(`refused (Jyutping): ${name}`, () => {
    const problem = readingProblem("yue", word, reading);
    ok(problem?.includes(message), `got ${JSON.stringify(problem)}`);
  });
}

// ---------- the test packs ----------

test("a Dutch pack of yours passes beside the starter: a new pattern, a phrase, a built-in topic", () => {
  const { pack, errors, warnings } = checkPack(NL, { installed: builtIn });
  eq(errors, []);
  eq(warnings, []);
  eq(pack.items.map((i) => i.id), ["balletje", "eet-smakelijk", "oma-gebeld"]);
});
test("a German pack passes: nouns keep their capital (lemmaCase any), its patterns the German catalog's", () => {
  const { pack, errors, warnings } = checkPack(DE, { installed: builtIn });
  eq(errors, []);
  eq(warnings, []);
  eq(pack.words.Buch, "book");
  eq(Object.keys(pack.patterns), []);
  eq([...new Set(pack.items.flatMap((i) => i.concepts))].filter((id) => !LANGUAGES.de.patterns[id]), []);
});
test("a topic from a built-in pack only works when that pack is installed", () => {
  const { errors } = checkPack(NL);
  eq(errors.map((e) => e.message), [
    'items[0] (balletje): topic "people" isn\'t one of the pack\'s topics.',
    'items[2] (oma-gebeld): topic "people" isn\'t one of the pack\'s topics.',
  ]);
});

// ---------- every way a pack can be wrong ----------

const item = (i, change) => (pack) => change(pack.items[i]);
const REFUSED = [
  ["not an object", () => "a pack", "A pack must be an object."],
  ["the wrong format", (p) => (p.format = "anki"), 'format must be "lexicommons-pack".'],
  ["a later version", (p) => (p.version = 3), "version must be 2."],
  ["an id with capitals and spaces", (p) => (p.id = "My Pack"), "id must be 2 to 48 lowercase letters"],
  ["no name", (p) => delete p.name, "name is missing."],
  ["a name too long", (p) => (p.name = "x".repeat(81)), "name is 81 characters; keep it to 80."],
  ["a language Lexicommons doesn't know", (p) => (p.language = "xx"), 'language "xx" isn\'t one Lexicommons knows'],
  ["from the same language", (p) => (p.from = "nl"), "from must be a different language from language."],
  ["from a language Lexicommons doesn't know", (p) => (p.from = "klingon"), 'from "klingon" isn\'t a language Lexicommons knows'],
  ["a topic id with punctuation", (p) => (p.topics["food!"] = "Food"), 'topics: "food!" isn\'t a topic id'],
  ["a Dutch gloss on a capitalized lemma", (p) => (p.words.Meisje = "girl"), 'words["Meisje"] "Meisje" isn\'t a dictionary form'],
  ["a gloss that isn't text", (p) => (p.words.bal = 5), 'words["bal"] must be text.'],
  ["a phrase id with spaces", (p) => (p.chunks["eet smakelijk"] = { text: "Eet smakelijk!", en: "Enjoy!" }), 'chunks: "eet smakelijk" isn\'t a phrase id'],
  ["a phrase without its English", (p) => delete p.chunks["eet-smakelijk"].en, "chunks.eet-smakelijk.en is missing."],
  ["a pattern without its explanation", (p) => delete p.patterns.verkleinwoord.about, "patterns.verkleinwoord.about is missing."],
  ["a pattern that builds on one nobody has", (p) => (p.patterns.verkleinwoord.after = ["plurals"]), 'patterns.verkleinwoord.after: "plurals" isn\'t a pattern in the catalog or this pack.'],
  ["too many items", (p) => (p.items = Array.from({ length: PACK_LIMITS.items + 1 }, (_, n) => ({ id: `x${n}`, text: "a", means: "b" }))), "items has 5001 entries; keep it to 5000."],
  ["a pack over 2 MB", (p) => (p.about = "x".repeat(2_000_001)), "bytes; keep it under 2000000."],
  ["an item that isn't an object", (p) => (p.items[0] = "Het meisje speelt."), "items[0] must be an object."],
  ["an item id with an underscore", item(0, (i) => (i.id = "het_meisje")), "items[0] (het_meisje): id must be lowercase letters, digits and dashes"],
  ["two items with one id", item(1, (i) => (i.id = "balletje")), "items[1] (balletje): another item in the pack has this id."],
  ["the same sentence twice", (p) => p.items.push({ ...copy(p.items[0]), id: "again" }), "items[3] (again): the same sentence as items[0] (balletje)."],
  ["a topic the pack doesn't have", item(0, (i) => (i.topic = "nowhere")), 'items[0] (balletje): topic "nowhere" isn\'t one of the pack\'s topics.'],
  ["a pattern nobody has", item(0, (i) => (i.concepts = ["made-up"])), 'items[0] (balletje): pattern "made-up" isn\'t in the language\'s catalog or the pack\'s patterns.'],
  ["a phrase nobody has", item(1, (i) => (i.chunks = ["made-up"])), 'items[1] (eet-smakelijk): phrase "made-up" isn\'t one of the pack\'s chunks.'],
  ["the same pattern twice", item(2, (i) => (i.concepts = ["perfect", "p:perfect"])), "items[2] (oma-gebeld): concepts lists the same one twice."],
  ["a sentence over 16 words", item(0, (i) => (i.words = Array.from({ length: 17 }, () => ["ja"]))), "items[0].words has 17 entries; keep it to 16."],
  ["two words in one", item(0, (i) => (i.words[0] = ["Het meisje"])), 'items[0] (balletje): words[0] "Het meisje" is more than one word'],
  ["a word that's only punctuation", item(0, (i) => (i.words[3] = [","])), 'items[0] (balletje): words[3] "," has no letters'],
  ["a word in the wrong shape", item(0, (i) => (i.words[0] = ["Het", "het", "het", "x"])), 'items[0] (balletje): words[0] must be ["word"], ["word", "lemma"] or ["word", "lemma" or null, "reading"].'],
  ["a reading on a Dutch word", item(0, (i) => (i.words[0] = ["Het", "het", "hət"])), `items[0] (balletje): words[0] "Het": Dutch words don't carry a reading.`],
  ["a capitalized Dutch lemma", item(0, (i) => (i.words[1] = ["meisje", "Meisje"])), 'items[0].words[1][1] "Meisje" isn\'t a dictionary form'],
  ["an ending that isn't punctuation", item(0, (i) => (i.punct = ";")), "items[0] (balletje): punct must be one of"],
  ["a literal chunk marked moved with a word", item(0, (i) => (i.literal[1] = ["plays", "yes"])), "items[0] (balletje): literal[1][1] must be true (moved) or false."],
  ["an English order that repeats a chunk", item(0, (i) => (i.english = [0, 0, 1])), "items[0] (balletje): english must list each literal chunk's index once"],
  ["a moved word that isn't in the sentence", item(2, (i) => (i.moved = ["gisteren", "gebelt"])), 'items[2] (oma-gebeld): moved "gebelt" isn\'t one of the sentence\'s words as written.'],
  ["no natural English", item(0, (i) => delete i.means), "items[0].means is missing."],
  ["no wrong versions", item(0, (i) => (i.wrong = [])), "items[0].wrong has 0 entries; it needs at least 1."],
  ["a wrong version that's the sentence (in other case)", item(0, (i) => (i.wrong = ["het meisje speelt met een balletje."])), "items[0] (balletje): a wrong version is the sentence itself."],
  ["the same wrong version twice", item(0, (i) => (i.wrong = ["Het meisje speelt met balletje.", "Het meisje speelt met balletje."])), "items[0] (balletje): the wrong versions must all be different."],
  ["a gap past the end", item(0, (i) => (i.gap.index = 6)), "items[0] (balletje): gap.index must be a word's position in words (0 to 5)."],
  ["gap options without the word", item(0, (i) => (i.gap.options = ["ballen", "bal"])), 'items[0] (balletje): gap.options must include the word as written ("balletje").'],
  ["the same gap option twice", item(0, (i) => (i.gap.options = ["balletje", "bal", "bal"])), "items[0] (balletje): gap.options must all be different."],
  ["one gap option", item(0, (i) => (i.gap.options = ["balletje"])), "items[0].gap.options has 1 entry; it needs at least 2."],
  ["copiedFrom that isn't a public pack's id and version", (p) => (p.copiedFrom = { id: "starter-word-order", version: "v2" }), "copiedFrom must be { id, version }"],
];
for (const [name, change, message] of REFUSED) {
  test(`refused: ${name}`, () => {
    let pack = copy(NL);
    const replaced = change(pack);
    if (typeof replaced === "string" && name === "not an object") pack = replaced;
    const result = checkPack(pack, { installed: builtIn });
    ok(result.pack === null, "it was kept");
    const found = result.errors.find((e) => e.message.includes(message));
    ok(found, `no error saying "${message}"; got ${JSON.stringify(result.errors.map((e) => e.message))}`);
  });
}
test("every message is different, so each problem says what it is", () => {
  const messages = REFUSED.map(([, , message]) => message);
  eq(new Set(messages).size, messages.length);
});
test("every problem comes back at once", () => {
  const pack = copy(NL);
  pack.name = "";
  pack.items[0].gap.index = 9;
  pack.items[1].means = "";
  pack.items[2].moved = ["nergens"];
  const { errors } = checkPack(pack, { installed: builtIn });
  eq(errors.map((e) => e.at), ["name", "items[0].gap.index", "items[1].means", "items[2].moved[0]"]);
});

// ---------- warnings: kept, but worth fixing ----------

test("warned and left out: fields that aren't part of a pack (nothing in a pack runs)", () => {
  const pack = copy(NL);
  pack.script = "alert(1)";
  pack.items[0].onclick = "steal()";
  const result = checkPack(pack, { installed: builtIn });
  eq(result.errors, []);
  eq(result.warnings.map((w) => w.at), ["pack.script", "items[0].onclick"]);
  ok(!("script" in result.pack) && !("onclick" in result.pack.items[0]), "an unknown field was kept");
});
test("warned: a sentence you already have in another pack", () => {
  const pack = copy(NL);
  pack.items.push({ ...copy(BUILT_IN[0].items[0]), id: "ook-gelezen", topic: "people" });
  const { errors, warnings } = checkPack(pack, { installed: builtIn });
  eq(errors, []);
  eq(warnings.map((w) => w.message), ["items[3] (ook-gelezen): you already have this sentence, in Starter: Dutch word order (boek-gelezen)."]);
});
test("warned: words with no gloss anywhere", () => {
  const pack = copy(NL);
  delete pack.words.spelen;
  delete pack.words.bal;
  const { errors, warnings } = checkPack(pack, { installed: builtIn });
  eq(errors, []);
  ok(warnings.length === 1 && warnings[0].message.startsWith("No gloss for spelen, bal:"), JSON.stringify(warnings));
});
test("warned and left out: a pattern the catalog already has (the catalog's is used)", () => {
  const pack = copy(NL);
  pack.patterns.v2 = { name: "V2", about: "Mine" };
  const result = checkPack(pack, { installed: builtIn });
  eq(result.errors, []);
  eq(result.warnings.map((w) => w.at), ["patterns.v2"]);
  ok(!result.pack.patterns.v2, "the pack's v2 was kept");
});
test("text is kept as text: control characters and stray spaces go, accents compose", () => {
  const pack = copy(NL);
  pack.items[0].means = "  The girl\u0000 is\tplaying\n with a little ball. ";
  pack.items[1].words[1] = ["smákelijk", "smakelijk"];
  delete pack.items[1].text;
  pack.items[1].gap.options[0] = "smákelijk";
  pack.items[0].words[5] = ["ballet­je", "bal"]; // a soft hyphen: gone, never a space that splits the word
  const result = checkPack(pack, { installed: builtIn });
  eq(result.errors, []);
  eq(result.pack.items[0].means, "The girl is playing with a little ball.");
  eq(result.pack.items[1].words[1][0], "smákelijk");
  eq(result.pack.items[0].words[5][0], "balletje");
});

// ---------- the view ----------

const starterIds = ["boek-gelezen", "morgen-oma", "weet-komt", "bel-op", "hoe-gaat", "wil-lezen", "zie-niet", "winkel-brood", "vader-thuis", "denk-regent", "trein-gemist", "raam-opendoen", "wat-eet"];

test("the starter alone: its 13 sentences with their own ids, the whole catalog", () => {
  const view = buildView(builtIn, "nl");
  eq(view.items.map((i) => i.id), starterIds);
  ok(view.items.every((i) => i.pack === "starter-word-order"), "an item without its pack");
  eq(Object.keys(view.patterns), Object.keys(LANGUAGES.nl.patterns));
  eq(Object.keys(view.topics), ["people", "home", "plans", "out"]);
  eq(view.packs, [{ id: "starter-word-order", name: "Starter: Dutch word order", about: "Dutch word order in real, everyday sentences.", language: "nl", from: "en", builtIn: true, on: true, items: 13 }]);
});
test("with a pack of yours: its sentences after the starter's, with <pack>/<id> ids; first to name a word wins", () => {
  const view = buildView([...builtIn, checkPack(NL, { installed: builtIn }).pack], "nl");
  eq(view.items.map((i) => i.id), [...starterIds, "check-nl/balletje", "check-nl/eet-smakelijk", "check-nl/oma-gebeld"]);
  eq(view.items.at(-1).pack, "check-nl");
  eq(Object.keys(view.topics), ["people", "home", "plans", "out", "food"]);
  eq(view.words.oma, "grandma");
  eq(view.words.bal, "ball");
  eq(Object.keys(view.chunks), ["hoe-gaat-het", "eet-smakelijk"]);
  eq(Object.keys(view.patterns), [...Object.keys(LANGUAGES.nl.patterns), "verkleinwoord"]);
});
test("a German pack stays out of Dutch, and Dutch out of German", () => {
  const packs = [...builtIn, checkPack(NL, { installed: builtIn }).pack, checkPack(DE, { installed: builtIn }).pack];
  const nl = buildView(packs, "nl");
  const de = buildView(packs, "de");
  ok(nl.items.every((i) => i.pack !== "check-de"), "German in the Dutch view");
  eq(de.items.map((i) => i.id), ["check-de/buch-gelesen", "check-de/morgen-berlin", "check-de/weiss-kommt"]);
  eq(Object.keys(de.patterns), Object.keys(LANGUAGES.de.patterns));
  eq(de.patterns.v2.about, LANGUAGES.de.patterns.v2.about);
  eq(de.packs.map((p) => p.id), ["check-de"]);
});
test("a pack turned off: its sentences go; what the ones left use still reads, from whichever pack names it", () => {
  const packs = [...builtIn, checkPack(NL, { installed: builtIn }).pack];
  const view = buildView(packs, "nl", { isOn: (id) => id !== "starter-word-order" });
  eq(view.items.map((i) => i.id), ["check-nl/balletje", "check-nl/eet-smakelijk", "check-nl/oma-gebeld"]);
  eq(Object.keys(view.topics), ["food", "people"]);
  eq(view.topics.people, "Family & people");
  eq(view.words.oma, "grandma", "a word's meaning doesn't change when a pack is off");
  eq(view.words.eten, "to eat");
  ok(!view.words.boek, "an off pack's word is in play");
  eq(view.glossary.words.boek, "book");
  eq(view.packs.map((p) => [p.id, p.on]), [["starter-word-order", false], ["check-nl", true]]);
});
test("every pack off: nothing to study, the catalog still there to name evidence", () => {
  const view = buildView(builtIn, "nl", { isOn: () => false });
  eq(view.items, []);
  eq(view.words, {});
  eq(Object.keys(view.patterns), Object.keys(LANGUAGES.nl.patterns));
  eq(view.glossary.chunks["hoe-gaat-het"].en, "How are you?");
});
test("content.js in Node (no device storage): the built-in packs, named units, sentences", () => {
  eq(content.contentLanguage(), "nl");
  eq(content.ITEMS.map((i) => i.id), starterIds);
  eq(content.sentence(content.itemById.get("hoe-gaat")), "Hoe gaat het met je?");
  eq(content.describe("c:hoe-gaat-het").name, "Hoe gaat het?");
  eq(content.describe("p:v2").name, "Verb second");
  eq(content.describe("w:boek").en, "book");
  eq(content.PACKS.map((p) => [p.id, p.on]), [["starter-word-order", true]]);
  eq(itemSentence(BUILT_IN[0].items[0]), "Ik heb gisteren een boek gelezen.");
});

// ---------- public packs in the open library ----------

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const checked = (pack) => checkPack(pack, { installed: builtIn }).pack;

await testAsync("a version is the content: 12 hex, the same every time, and checking a checked pack changes nothing", async () => {
  for (const raw of [BUILT_IN[0], NL, DE]) {
    const once = checked(raw);
    const twice = checked(JSON.parse(packText(once)));
    eq(packText(twice), packText(once));
    const version = await packVersion(once);
    ok(/^[0-9a-f]{12}$/.test(version), version);
    eq(await packVersion(twice), version);
  }
  const changed = checked(NL);
  changed.items[0].means = "The girl plays with a small ball.";
  ok((await packVersion(changed)) !== (await packVersion(checked(NL))), "a change to an item kept the version");
});
test("a copy says where it came from (copiedFrom), and keeps it", () => {
  const copy = { ...copy_(NL), id: "my-copy", copiedFrom: { id: "check-nl", version: "0123456789ab" } };
  const result = checkPack(copy, { installed: builtIn });
  eq(result.errors, []);
  eq(result.pack.copiedFrom, { id: "check-nl", version: "0123456789ab" });
  eq(Object.keys(result.pack).slice(0, 8), ["format", "version", "id", "name", "about", "language", "from", "copiedFrom"]);
});
test("where a version lives, and its catalog entry", () => {
  const pack = checked(NL);
  eq(packKey("check-nl", "0123456789ab"), "packs/check-nl/0123456789ab/pack.json");
  eq(packUrl("check-nl", "0123456789ab"), "/library/packs/check-nl/0123456789ab/pack.json");
  eq(catalogueEntry(pack, "0123456789ab"), { id: "check-nl", version: "0123456789ab", url: "/library/packs/check-nl/0123456789ab/pack.json", name: "A check pack (Dutch)", about: NL.about, sentences: 3 });
});
test("the catalog: an entry replaces its id in place or is added; every other key stays as found", () => {
  const base = { format: "lexicommons-catalogue", v: 1, books: [{ id: "alice" }], lists: { frequency: { nl: { url: "x" } } }, shelf: [{ id: "s" }], writeId: "w1", future: { x: 1 }, packs: { nl: [{ id: "a", version: "000000000001" }, { id: "b", version: "000000000002" }], de: [{ id: "c" }] } };
  const replaced = withPackEntry(base, "nl", { id: "a", version: "000000000009" });
  eq(replaced.packs.nl.map((p) => `${p.id}@${p.version}`), ["a@000000000009", "b@000000000002"]);
  const added = withPackEntry(base, "nl", { id: "z", version: "000000000003" });
  eq(added.packs.nl.map((p) => p.id), ["a", "b", "z"]);
  const fresh = withPackEntry({ format: "lexicommons-catalogue", v: 1, books: [] }, "es", { id: "e", version: "000000000004" });
  eq(fresh.packs, { es: [{ id: "e", version: "000000000004" }] });
  const removed = withoutPack(base, "nl", "a");
  eq(removed.packs.nl.map((p) => p.id), ["b"]);
  for (const next of [replaced, added, removed]) {
    for (const key of ["format", "v", "books", "lists", "shelf", "writeId", "future"]) eq(next[key], base[key]);
    eq(next.packs.de, base.packs.de);
  }
  eq(base.packs.nl.length, 2);
});
test("refs from the catalog: only well-formed ones, the url exactly where that version lives", () => {
  const good = { id: "starter-word-order", version: "0123456789ab", url: "/library/packs/starter-word-order/0123456789ab/pack.json", name: "Starter" };
  const catalogue = { packs: { nl: [good, { ...good, id: "x", url: good.url }, { ...good, version: "0123" , url: "/library/packs/starter-word-order/0123/pack.json" }, { ...good, url: "https://elsewhere.example/pack.json" }, null, "a pack"] } };
  eq(packRefs(catalogue, "nl"), [{ id: good.id, version: good.version, url: good.url }]);
  eq(packRefs(catalogue, "de"), []);
  eq(packRefs({}, "nl"), []);
  ok(isPackRef(good) && !isPackRef({ ...good, url: "/library/packs/other/0123456789ab/pack.json" }), "isPackRef");
});
await testAsync("checking a default pack before it's published: the language's other defaults, fetched and marked builtIn", async () => {
  const catalogue = { packs: { nl: [{ id: "starter-word-order", version: "000000000001", url: packUrl("starter-word-order", "000000000001") }, { id: "check-nl", version: "000000000002", url: packUrl("check-nl", "000000000002") }] } };
  const fetched = [];
  const fetchPack = async (ref) => (fetched.push(ref.id), ref.id === "starter-word-order" ? BUILT_IN[0] : NL);
  const installed = await defaultInstalled(catalogue, "nl", fetchPack, "check-nl");
  eq(fetched, ["starter-word-order"]);
  eq(installed.map((p) => [p.id, p.builtIn]), [["starter-word-order", true]]);
  eq(checkPack(NL, { installed }).errors, []);
});
test("what changed between versions: added, removed, changed, kept (item ids carry evidence across)", () => {
  const before = checked(NL);
  const after = checked(NL);
  after.items[0].means = "The girl plays with a small ball.";
  after.items = after.items.filter((i) => i.id !== "eet-smakelijk");
  after.items.push({ ...copy_(NL.items[2]), id: "oma-gebeld-2", text: undefined, words: [["Gisteren", "gisteren"], ["heb"], ["ik"], ["oma", "oma"], ["gebeld", "bellen"]], moved: ["gebeld"], wrong: ["Gisteren ik heb oma gebeld."], gap: { index: 4, options: ["gebeld", "belt"] }, literal: [["Yesterday"], ["have", true], ["I"], ["grandma"], ["called", true]], english: null });
  eq(compareVersions(before, checked(after)), { added: ["oma-gebeld-2"], removed: ["eet-smakelijk"], changed: ["balletje"], kept: ["oma-gebeld"] });
});
test("only the starter keeps its own item ids; another of Lexicommons' packs is <pack>/<id>, and where a pack came from shows", () => {
  const starter = { ...BUILT_IN[0], builtIn: true, origin: { kind: "default", version: "000000000001" } };
  const travel = { ...checked(NL), id: "travel-nl", builtIn: true, origin: { kind: "default", version: "000000000002" } };
  const view = buildView([starter, travel], "nl");
  eq(view.items[0].id, "boek-gelezen");
  eq(view.items.at(-1).id, "travel-nl/oma-gebeld");
  eq(view.packs.map((p) => [p.id, p.builtIn, p.origin.kind, p.origin.version]), [["starter-word-order", true, "default", "000000000001"], ["travel-nl", true, "default", "000000000002"]]);
});

test("a catalog entry and a ref may name their version's audio, beside it, and nothing else", () => {
  const pack = checkPack(copy(BUILT_IN[0])).pack;
  const audio = "/library/packs/starter-word-order/6a8619bea57c/audio.0123456789ab.json";
  const entry = catalogueEntry(pack, "6a8619bea57c", { audio });
  eq(entry.audio, audio);
  ok(!("audio" in catalogueEntry(pack, "6a8619bea57c")), "no audio, no field");
  const listed = withPackEntry({ format: "lexicommons-catalogue", packs: {} }, "nl", entry);
  eq(packRefs(listed, "nl"), [{ id: "starter-word-order", version: "6a8619bea57c", url: entry.url, audio }]);
  ok(isPackRef({ id: entry.id, version: entry.version, url: entry.url }), "audio is optional");
  for (const wrong of ["/library/packs/other/6a8619bea57c/audio.0123456789ab.json", "/library/packs/starter-word-order/000000000000/audio.0123456789ab.json", "/library/packs/starter-word-order/6a8619bea57c/audio.0123.json", "/library/audio/0123456789abcdef.mp3", "https://elsewhere.example/audio.0123456789ab.json"]) {
    ok(!isPackRef({ id: entry.id, version: entry.version, url: entry.url, audio: wrong }), wrong);
  }
});

test("an opt-in pack: its entry and ref say so (only true, never anything else), beside a default's", () => {
  const pack = checkPack(copy(BUILT_IN[0])).pack;
  const entry = catalogueEntry(pack, "6a8619bea57c", { optIn: true });
  eq(entry.optIn, true);
  ok(!("optIn" in catalogueEntry(pack, "6a8619bea57c")) && !("optIn" in catalogueEntry(pack, "6a8619bea57c", { optIn: false })), "a default has no optIn");
  const audio = "/library/packs/starter-word-order/6a8619bea57c/audio.0123456789ab.json";
  eq(catalogueEntry(pack, "6a8619bea57c", { audio, optIn: true }).optIn, true);
  let listed = withPackEntry({ format: "lexicommons-catalogue", packs: {} }, "nl", entry);
  listed = withPackEntry(listed, "nl", { ...catalogueEntry({ ...pack, id: "words-nl-01" }, "0123456789ab") });
  eq(packRefs(listed, "nl"), [{ id: "starter-word-order", version: "6a8619bea57c", url: entry.url, optIn: true }, { id: "words-nl-01", version: "0123456789ab", url: packUrl("words-nl-01", "0123456789ab") }]);
  // A catalog that says anything but true is a default (a string "true" too).
  // suggest: only on an opt-in pack, and carried by packRefs; a default pack never has it, and anything but true is no suggest.
  const suggested = catalogueEntry(pack, "6a8619bea57c", { optIn: true, suggest: true });
  eq(suggested.suggest, true);
  ok(!("suggest" in catalogueEntry(pack, "6a8619bea57c", { suggest: true })) && !("suggest" in entry), "suggest only on an opt-in pack");
  eq(packRefs(withPackEntry({ format: "lexicommons-catalogue", packs: {} }, "nl", suggested), "nl")[0].suggest, true);
  ok(!("suggest" in packRefs(withPackEntry({ format: "lexicommons-catalogue", packs: {} }, "nl", { ...suggested, suggest: "true" }), "nl")[0]), "a suggest that isn't true");
  ok(!("suggest" in packRefs(withPackEntry({ format: "lexicommons-catalogue", packs: {} }, "nl", { ...entry, optIn: undefined, suggest: true }), "nl")[0]), "suggest on a default pack");
  const odd = withPackEntry({ format: "lexicommons-catalogue", packs: {} }, "nl", { ...entry, optIn: "true" });
  ok(!("optIn" in packRefs(odd, "nl")[0]), JSON.stringify(packRefs(odd, "nl")));
});

test("a full check's proof (a public pack used at a start without its check again): only under the same rules, its language's, at its version", () => {
  const pack = checkPack(copy(BUILT_IN[0])).pack;
  const proof = checkedProof(pack, "6a8619bea57c");
  eq(proof, { checks: PACK_CHECKS, rules: checkRulesOf("nl"), version: "6a8619bea57c" });
  ok(proofHolds(proof, pack, "6a8619bea57c"), "holds as made");
  ok(!proofHolds(proof, pack, "0123456789ab"), "another version");
  ok(!proofHolds({ ...proof, checks: 2 }, pack, "6a8619bea57c"), "older check rules");
  ok(proofHolds({ ...proof, checks: 8 }, pack, "6a8619bea57c"), "rules 8: 9 only adds two fields a pack from before can't have");
  ok(proofHolds({ ...proof, checks: 9 }, pack, "6a8619bea57c"), "rules 9: 10 only adds an item's shapes, which a pack checked before can't have");
  ok(proofHolds({ ...proof, checks: 7 }, pack, "6a8619bea57c"), "rules 7 still hold as before");
  ok(proofHolds({ ...proof, checks: 4 }, pack, "6a8619bea57c") && !proofHolds({ ...proof, checks: 4 }, { ...pack, cards: [] }, "6a8619bea57c"), "rules 4 hold for a pack with no cards only: rules 5 changed nothing else");
  ok(!proofHolds({ ...proof, rules: checkRulesOf("de") }, pack, "6a8619bea57c"), "another language's rules");
  ok(!proofHolds(proof, { ...pack, language: "xx" }, "6a8619bea57c"), "a language this app doesn't know");
  for (const odd of [null, undefined, "proof", 1, { ...proof, version: undefined }, { ...proof, rules: null }]) ok(!proofHolds(odd, pack, "6a8619bea57c"), JSON.stringify(odd));
  ok(checkRulesOf("ja") !== checkRulesOf("nl") && checkRulesOf("nl") === checkRulesOf("nl"), "rules differ by language, and are the same each time");
});

// ---------- a copy of another pack's item (copyOf) ----------
// Dutch's category packs (5 Nov 2026) copy the word bands' sentences as they are: the view keys a copy by its source's
// id, so what's learned on it in either pack is one, and it's there once when both packs are on.
{
  const source = checkPack(NL, { installed: builtIn }).pack;
  const copyOf = (i) => ({ ...structuredClone(source.items[i]), copyOf: "check-nl" });
  const copies = (items) => ({ ...structuredClone(NL), id: "check-nl-copies", name: "Copies", items });
  test("copyOf: a copy beside its source passes and keeps copyOf", () => {
    const { pack, errors, warnings } = checkPack(copies([copyOf(0), copyOf(2)]), { installed: [...builtIn, source] });
    eq(errors, []);
    eq(warnings, [], "its source has the same sentence by design: no warning about that one");
    eq(pack.items.map((item) => [item.id, item.copyOf]), [["balletje", "check-nl"], ["oma-gebeld", "check-nl"]]);
    const elsewhere = checkPack(copies([{ ...copyOf(0), copyOf: undefined, id: "balletje-own" }]), { installed: [...builtIn, source] }).warnings;
    ok(elsewhere.some((w) => /already have this sentence/.test(w.message)), `the same sentence not as a copy still says so: ${JSON.stringify(elsewhere)}`);
    // The other way round, and between two packs copying the same item: one item, no word about it.
    const copying = checkPack(copies([copyOf(0), copyOf(2)]), { installed: [...builtIn, source] }).pack;
    eq(checkPack(NL, { installed: [...builtIn, copying] }).warnings, [], "the source, beside a pack that copies it");
    eq(checkPack({ ...copies([copyOf(0)]), id: "check-nl-more" }, { installed: [...builtIn, copying] }).warnings, [], "a second pack copying the same item");
  });
  test("copyOf: your AI's form carries it, there and back", () => {
    const item = { ...source.items[2], copyOf: "check-nl" };
    const form = authoringItem(item, "nl");
    eq(form.copyOf, "check-nl");
    eq(storedItem(form, { language: "nl" }).item, orderedItem(item));
  });
  test("copyOf: the view keys a copy by its source; with both packs on it's there once, from the pack that comes first", () => {
    const pack = checkPack(copies([copyOf(0), copyOf(2)]), { installed: [...builtIn, source] }).pack;
    const tail = (view) => view.items.slice(starterIds.length).map((item) => [item.id, item.pack]);
    eq(tail(buildView([...builtIn, pack], "nl")), [["check-nl/balletje", "check-nl-copies"], ["check-nl/oma-gebeld", "check-nl-copies"]]);
    eq(tail(buildView([...builtIn, source, pack], "nl")), [["check-nl/balletje", "check-nl"], ["check-nl/eet-smakelijk", "check-nl"], ["check-nl/oma-gebeld", "check-nl"]]);
    eq(tail(buildView([...builtIn, pack, source], "nl")), [["check-nl/balletje", "check-nl-copies"], ["check-nl/oma-gebeld", "check-nl-copies"], ["check-nl/eet-smakelijk", "check-nl"]]);
    eq(buildView([...builtIn, pack], "nl").items.at(-1).copyOf, "check-nl");
  });
  test("copyOf: refused when its source is here and lacks the item, or has it changed; taken as it says when the source isn't here", () => {
    const changed = copyOf(2);
    changed.means = "I called grandma yesterday evening.";
    const missing = { ...copyOf(0), id: "balletje-twee" };
    const { errors } = checkPack(copies([changed, missing]), { installed: [...builtIn, source] });
    eq(errors.map((e) => [e.at, e.message.replace(/;.*/, "")]), [
      ["items[0].copyOf", "items[0] (oma-gebeld): it isn't check-nl's item oma-gebeld as it is now"],
      ["items[1].copyOf", "items[1] (balletje-twee): it's a copy from check-nl, which has no item balletje-twee."],
    ]);
    eq(checkPack(copies([changed, missing]), { installed: builtIn }).errors, []);
  });
  test("copyOf: a copy into another learner language says its own means and literal line; its sentence is still the source's", () => {
    // The English starter's copies (6 Nov 2026): one per language a learner speaks, each item its source's, said in its
    // own language, so progress carries when "I speak" changes.
    const across = (items) => ({ ...copies(items), from: "es" });
    const own = copyOf(2);
    own.means = "Ayer por la tarde llamé a la abuela.";
    own.literal = own.literal.map(([text, ...rest]) => [`(${text})`, ...rest]);
    const taken = checkPack(across([own]), { installed: [...builtIn, source] });
    eq(taken.errors, [], "its own means and literal line, from another learner language");
    eq(taken.pack.items[0].means, own.means);
    const reworded = copyOf(2);
    reworded.means = own.means;
    reworded.wrong = [...reworded.wrong].reverse();
    const { errors } = checkPack(across([reworded]), { installed: [...builtIn, source] });
    ok(errors.some((e) => e.at === "items[0].copyOf" && /for what it says in its own learner language/.test(e.message)), JSON.stringify(errors));
  });
  test("copyOf: must be another pack's id", () => {
    const own = checkPack(copies([{ ...copyOf(0), copyOf: "check-nl-copies" }]), { installed: builtIn }).errors.map((e) => e.message);
    ok(own.some((m) => m.includes("copyOf names this pack itself")), JSON.stringify(own));
    const bad = checkPack(copies([{ ...copyOf(0), copyOf: "Not A Pack" }]), { installed: builtIn }).errors.map((e) => e.message);
    ok(bad.some((m) => m.includes("copyOf must be the id of the pack")), JSON.stringify(bad));
  });
  test("copyOf: a lesson naming a copy points at the copy's id in the view", () => {
    const pack = checkPack(copies([copyOf(0), copyOf(2)]), { installed: [...builtIn, source] }).pack;
    const view = buildView([...builtIn, { ...pack, lessons: [{ id: "one", title: "One", words: [], phrases: [], items: ["balletje"] }] }], "nl");
    eq(view.lessons.at(-1).items, ["check-nl/balletje"]);
  });
  test("copyOf: an edit that changes a copy drops copyOf (it's a sentence of its own now); one that changes nothing keeps it", () => {
    const item = { ...source.items[2], copyOf: "check-nl" };
    eq(editItem(item, { means: "I called grandma yesterday evening." }, "nl").item.copyOf, undefined);
    eq(editItem(item, { means: item.means }, "nl").item.copyOf, "check-nl");
  });
}

// The check's code, fingerprinted: a change to what checkPack accepts must bump PACK_CHECKS, so every stored pack is
// checked in full again at its next start (packs.js loadPacks trusts a proof made under the same PACK_CHECKS).
test("the authoring form: one written word that's two words in a sentence keeps both, there and back; a list of the wrong length is refused", () => {
  const input = { id: "two", sentence: "Woon je hier met je moeder?", lemmas: { Woon: "wonen", je: ["jij", "je"], hier: "hier", met: "met", moeder: "moeder" }, literal: ["Live you", "here", "with your mother"], natural: "Do you live here with your mother?", wrong: ["Woont je hier met je moeder?"], gap: { word: "hier", options: ["hier", "daar"] }, patterns: ["question"], topic: "home" };
  const { item, problems } = storedItem(input, { language: "nl" });
  ok(item, JSON.stringify(problems));
  ok(item.words[1][1] === "jij" && item.words[4][1] === "je", JSON.stringify(item.words));
  const back = authoringItem(item, "nl");
  ok(JSON.stringify(back.lemmas.je) === JSON.stringify(["jij", "je"]), JSON.stringify(back.lemmas));
  const again = storedItem({ ...back, id: "two" }, { language: "nl" });
  ok(JSON.stringify(again.item?.words) === JSON.stringify(item.words), JSON.stringify(again.problems));
  const wrong = storedItem({ ...input, lemmas: { ...input.lemmas, je: ["jij"] } }, { language: "nl" });
  ok(wrong.problems.some((p) => /written 2 times/.test(p.message)), JSON.stringify(wrong.problems));
});

// A phrase's word, with no dictionary form, beside the same word written with one: the form gave both the one, so these sentences (as two
// language lanes first wrote them, 9 Nov 2026, then reworded around it) came back changed. Each a sentence as a pack builder stores it.
const bareWord = (word) => word.toLowerCase().replace(/^[^\p{L}\p{M}\p{N}']+|[^\p{L}\p{M}\p{N}']+$/gu, "");
const asStored = ({ id, words, punct, literal, english = null, moved = [], means, wrong, gap, concepts }) =>
  orderedItem({ id, concepts, text: words.map(([word]) => word).join(" ") + punct, words, punct, literal: literal.map((chunk) => (chunk.startsWith("*") ? [chunk.slice(1), true] : [chunk])), english, moved, means, wrong, gap });
const PHRASE_BESIDE = {
  // Portuguese: a gente's A (we), then the article a (o).
  "pt idea-a-gente-3": ["pt", asStored({
    id: "idea-a-gente-3", concepts: ["a-gente", "gender"], punct: ".",
    words: [["A"], ["gente"], ["vai", "ir"], ["para", "para"], ["a", "o"], ["cidade", "cidade"], ["hoje"], ["à"], ["noite"]],
    literal: ["The", "people", "goes", "to", "the", "city", "today", "at the", "night"], means: "We're going into town tonight.",
    wrong: ["A gente vai para o cidade hoje à noite."], gap: { index: 5, options: ["cidade", "casa", "cama"] },
  })],
  // German: zu Hause's zu, then the infinitive's zu.
  "de l037-2": ["de", asStored({
    id: "l037-2", concepts: ["modal", "zu-infinitive"], punct: ".",
    words: [["Wir", "wir"], ["können", "können"], ["versuchen,", "versuchen"], ["zu"], ["Hause"], ["zu", "zu"], ["arbeiten", "arbeiten"]],
    literal: ["We", "can", "try,", "*at", "*home", "to", "work"], english: [0, 1, 2, 5, 6, 3, 4], moved: ["zu", "Hause"], means: "We can try working from home.",
    wrong: ["Wir kann versuchen, zu Hause zu arbeiten.", "Wir können versuchen, zu Hause zu arbeitest."], gap: { index: 6, options: ["arbeiten", "essen", "lesen"] },
  })],
  // German: zu Fuß's zu, then the infinitive's zu.
  "de l068-5": ["de", asStored({
    id: "l068-5", concepts: ["question", "zu-infinitive"], punct: "?",
    words: [["Ist", "sein"], ["es", "es"], ["sicher,", "sicher"], ["hier", "hier"], ["zu"], ["Fuß"], ["zu", "zu"], ["gehen", "gehen"]],
    literal: ["Is", "it", "safe,", "*here", "*on foot", "to", "go"], english: [0, 1, 2, 5, 6, 3, 4], moved: ["hier", "zu", "Fuß"], means: "Is it safe to walk here?",
    wrong: ["Bist es sicher, hier zu Fuß zu gehen?", "Ist es sicher, hier zu Fuß zu gehst?"], gap: { index: 2, options: ["sicher,", "schön,", "schwierig,"] },
  })],
};
for (const [name, [language, item]] of Object.entries(PHRASE_BESIDE)) {
  test(`the authoring form, ${name}: a phrase's word with no dictionary form beside the same word with one comes back as written`, () => {
    const form = authoringItem(item, language);
    const { item: back, problems } = storedItem(form, { language });
    ok(back, JSON.stringify(problems));
    eq(back.words, item.words);
    // What get_pack shows: one entry per time the word is written, null for the phrase's.
    const twice = item.words.find(([word], i) => item.words.some(([other], j) => j > i && other.toLowerCase() === word.toLowerCase()))[0].toLowerCase();
    eq(form.lemmas[Object.keys(form.lemmas).find((key) => key.toLowerCase() === twice)], item.words.filter(([word]) => word.toLowerCase() === twice).map(([, lemma]) => lemma ?? null));
    eq(back, item);
  });
}
test("the authoring form, its control: a word with the same dictionary form every time it's written keeps one form, there and back (as before)", () => {
  // path-pt's idea-infinitive-links-4 as landed (reworded around the bug): para both times para.
  const item = JSON.parse(readFileSync(join(HERE, "../packs/path-pt.json"), "utf8")).items.find((one) => one.id === "idea-infinitive-links-4");
  ok(item?.words.filter(([word]) => word === "para").length === 2, JSON.stringify(item?.words));
  const form = authoringItem(item, "pt");
  eq(form.lemmas.para, "para");
  eq(storedItem(form, { language: "pt" }).item, orderedItem(item));
  // One form for a word written twice, as an AI writes it, still gives it every time.
  eq(storedItem({ sentence: "Wir können versuchen, zu Hause zu arbeiten.", lemmas: { zu: "zu" }, gap: { word: "arbeiten", options: [] } }, { language: "de" }).item.words.filter(([word]) => word === "zu"), [["zu", "zu"], ["zu", "zu"]]);
});
test("the authoring form, as an AI writes it: a list's null keeps that time without a dictionary form; a list's wrong entries refused, saying null is how", () => {
  const written = storedItem({ sentence: "Wir können versuchen, zu Hause zu arbeiten.", lemmas: { Wir: "wir", zu: [null, "zu"], arbeiten: "arbeiten" }, gap: { word: "arbeiten", options: [] } }, { language: "de" });
  ok(written.item, JSON.stringify(written.problems));
  eq(written.item.words.filter(([word]) => word === "zu"), [["zu"], ["zu", "zu"]]);
  for (const bad of [["", "zu"], [0, "zu"], [null], [null, "zu", "zu"]]) {
    const refused = storedItem({ sentence: "Wir können versuchen, zu Hause zu arbeiten.", lemmas: { zu: bad }, gap: { word: "arbeiten", options: [] } }, { language: "de" });
    ok(!refused.item && refused.problems.some((p) => p.at === "lemmas.zu" && /written 2 times/.test(p.message) && /null/.test(p.message)), `${JSON.stringify(bad)}: ${JSON.stringify(refused.problems)}`);
  }
});
// One written word said two ways in a sentence: the form kept one reading per written word, so the other time came back with it. Each a
// sentence as a pack stores it, planted (none ships yet; Russian 121-200 is being written), kept by the check in its language's starter.
const READ_TWICE = {
  // Russian: до́ма (at home), then дома́ (houses): the same letters, the stress elsewhere.
  ru: asStored({
    id: "ru-doma", concepts: ["plural"], punct: ".",
    words: [["Мы", "мы"], ["дома,", "дома", "до́ма"], ["а"], ["дома", "дом", "дома́"], ["вокруг", "вокруг", "вокру́г"], ["старые", "старый", "ста́рые"]],
    literal: ["We", "at home,", "and", "houses", "around", "old"], means: "We're at home, and the houses around us are old.",
    wrong: ["Мы дома, а дома вокруг старый."], gap: { index: 5, options: ["старые", "старый", "старая"] },
  }),
  // Japanese: 方 said かた (that person), then ほう (the side compared): あの方の方が上手です.
  ja: orderedItem({
    id: "ja-kata-hou", concepts: ["possessive-no", "subject-ga"], text: "あの方の方が上手です。", punct: "。",
    words: [["あの", "あの"], ["方", "方", "かた"], ["の", "の"], ["方", "方", "ほう"], ["が", "が"], ["上手", "上手", "じょうず"], ["です", "です"]],
    literal: [["That person's"], ["side"], ["skilled"], ["is"]], english: null, moved: [], means: "That person is better at it.",
    wrong: ["あの方の方を上手です。"], gap: { index: 4, options: ["が", "を"] },
  }),
};
const starterWith = (language, item) => {
  const starter = JSON.parse(readFileSync(join(HERE, `../packs/starter-${language}.json`), "utf8"));
  return checkPack({ ...starter, items: [...starter.items, item] }, { installed: [] });
};
for (const [language, item] of Object.entries(READ_TWICE)) {
  test(`the authoring form, ${language} ${item.id}: one written word said two ways in a sentence comes back with each time's reading`, () => {
    const kept = starterWith(language, item);
    ok(kept.pack, JSON.stringify(kept.errors).slice(0, 400));
    eq(kept.pack.items.at(-1).words, item.words);
    const form = authoringItem(item, language);
    const { item: back, problems } = storedItem(form, { language });
    ok(back, JSON.stringify(problems));
    eq(back.words, item.words);
    // What get_pack shows: one reading per time the word is written.
    const twice = item.words.find(([word], i) => item.words.some(([other], j) => j > i && bareWord(other) === bareWord(word)))[0];
    eq(form.readings[Object.keys(form.readings).find((key) => bareWord(key) === bareWord(twice))], item.words.filter(([word]) => bareWord(word) === bareWord(twice)).map(([, , reading]) => reading ?? null));
    eq(back, item);
  });
}
test("the authoring form's readings, its control: a word said the same every time it's written keeps one reading, there and back (as before)", () => {
  // path-ru's l035-7 (хочу́ both times) and path-ja's l001-9 (元気, げんき both times), as shipped.
  for (const [file, id, word, reading] of [["path-ru", "l035-7", "хочу", "хочу́"], ["path-ja", "l001-9", "元気", "げんき"]]) {
    const pack = JSON.parse(readFileSync(join(HERE, `../packs/${file}.json`), "utf8"));
    const item = pack.items.find((one) => one.id === id);
    ok(item?.words.filter(([w]) => bareWord(w) === word).length === 2, `${file} ${id}: ${JSON.stringify(item?.words)}`);
    const form = authoringItem(item, pack.language);
    eq(form.readings[word], reading);
    eq(storedItem(form, { language: pack.language }).item, orderedItem(item));
  }
});
test("the authoring form's readings, as an AI writes them: a list keeps each time's (null for none); a list's wrong entries refused, saying null is how", () => {
  const sentence = "Мы дома, а дома вокруг старые.";
  const written = storedItem({ sentence, lemmas: { дома: ["дома", "дом"] }, readings: { дома: ["до́ма", "дома́"], вокруг: "вокру́г" }, gap: { word: "старые", options: [] } }, { language: "ru" });
  ok(written.item, JSON.stringify(written.problems));
  eq(written.item.words.slice(0, 5), [["Мы"], ["дома,", "дома", "до́ма"], ["а"], ["дома", "дом", "дома́"], ["вокруг", null, "вокру́г"]]);
  eq(storedItem({ sentence, readings: { дома: [null, "дома́"] }, gap: { word: "старые", options: [] } }, { language: "ru" }).item.words.filter(([w]) => bareWord(w) === "дома"), [["дома,"], ["дома", null, "дома́"]]);
  // One reading for a word written twice, as an AI writes it, still gives it every time.
  eq(storedItem({ sentence, readings: { дома: "до́ма" }, gap: { word: "старые", options: [] } }, { language: "ru" }).item.words.filter(([w]) => bareWord(w) === "дома").map(([, , r]) => r), ["до́ма", "до́ма"]);
  for (const bad of [["", "дома́"], [0, "дома́"], ["до́ма"], ["до́ма", "дома́", "до́ма"]]) {
    const refused = storedItem({ sentence, readings: { дома: bad }, gap: { word: "старые", options: [] } }, { language: "ru" });
    ok(!refused.item && refused.problems.some((p) => p.at === "readings.дома" && /written 2 times/.test(p.message) && /null/.test(p.message)), `${JSON.stringify(bad)}: ${JSON.stringify(refused.problems)}`);
  }
});
test("every pack the app ships, each sentence in your AI's form and back, is the same sentence", () => {
  const dir = join(HERE, "../packs");
  let sentences = 0;
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
    const pack = JSON.parse(readFileSync(join(dir, file), "utf8"));
    for (const item of pack.items ?? []) {
      if (!item.words) continue;
      sentences++;
      const { item: back, problems } = storedItem(authoringItem(item, pack.language), { language: pack.language });
      ok(back && JSON.stringify(back) === JSON.stringify(orderedItem(item)), `${file} ${item.id}: ${problems.length ? JSON.stringify(problems) : `${JSON.stringify(item.words)} came back ${JSON.stringify(back?.words)}`}`);
    }
  }
  ok(sentences > 10000, `only ${sentences} sentences read`);
  console.log(`      (${sentences} sentences)`);
});

test("the check's code is what PACK_CHECKS says (change the check: bump PACK_CHECKS, update scripts/fixtures/pack-checks.json)", () => {
  const source = readFileSync(join(HERE, "../public/js/study/pack-format.js"), "utf8");
  const check = source.slice(0, source.indexOf("export function buildView")) + readFileSync(join(HERE, "../public/js/study/pack-items.js"), "utf8");
  const readings = readFileSync(join(HERE, "../public/js/lang/readings.js"), "utf8");
  const shared = [sentenceEnds, withoutInvisible, endMark].map(String).join("\n");
  const fingerprint = createHash("sha256").update(check + readings + shared).digest("hex").slice(0, 16);
  const kept = JSON.parse(readFileSync(join(HERE, "fixtures/pack-checks.json"), "utf8"));
  ok(kept.checks === PACK_CHECKS && kept.fingerprint === fingerprint, `the check's code is ${fingerprint} at PACK_CHECKS ${PACK_CHECKS}; the fixture says ${kept.fingerprint} at ${kept.checks}. If the check changed, bump PACK_CHECKS in pack-format.js and set both in scripts/fixtures/pack-checks.json`);
});

// ---------- your AI's side: the form it writes, and its changes ----------

test("every starter item and every test-pack item, in your AI's form and back, is the same item", () => {
  for (const pack of [BUILT_IN[0], NL, DE]) {
    const items = pack.items.map((item) => {
      const { item: back, problems } = storedItem(authoringItem(item, pack.language), { language: pack.language });
      ok(!problems.length, `${pack.id}/${item.id}: ${JSON.stringify(problems)}`);
      return back;
    });
    const checked = checkPack({ ...copy(pack), items }, { installed: pack === BUILT_IN[0] ? [] : builtIn });
    ok(checked.pack, `${pack.id}: ${JSON.stringify(checked.errors).slice(0, 300)}`);
    eq(checked.pack.items, checkPack(copy(pack), { installed: pack === BUILT_IN[0] ? [] : builtIn }).pack.items);
  }
});

test("your AI's form: the sentence split, lemmas by the word as written, moved chunks between asterisks, the gap by its word", () => {
  eq(splitSentence("  Ich habe gestern ein Buch gelesen. "), { words: ["Ich", "habe", "gestern", "ein", "Buch", "gelesen"], punct: "." });
  eq(splitSentence("Wat nu?!"), { words: ["Wat", "nu"], punct: "?!" });
  eq(splitSentence("Ja, dat klopt"), { words: ["Ja,", "dat", "klopt"], punct: "" });
  const { item, problems } = storedItem(
    {
      sentence: "Ich habe gestern ein Buch gelesen.",
      lemmas: { gestern: "gestern", Buch: "Buch", "gelesen,": "lesen" },
      literal: ["I have", "*yesterday*", "a book", "*read*"],
      english: [0, 3, 2, 1],
      natural: "I read a book yesterday.",
      wrong: ["Ich habe gelesen gestern ein Buch."],
      gap: { word: "gelesen", options: ["gelesen", "lesen"] },
      patterns: ["perfect"],
    },
    { language: "de" },
  );
  eq(problems, []);
  eq(item.id, "ich-habe-gestern-ein-buch-gelesen");
  eq(item.words, [["Ich"], ["habe"], ["gestern", "gestern"], ["ein"], ["Buch", "Buch"], ["gelesen", "lesen"]]);
  eq(item.literal, [["I have"], ["yesterday", true], ["a book"], ["read", true]]);
  eq(item.gap, { index: 5, options: ["gelesen", "lesen"] });
  // Dutch dictionary forms are lower case; German ones keep their capital.
  eq(storedItem({ sentence: "Het Boek ligt hier.", lemmas: { Boek: "Boek" }, gap: { word: "ligt", options: [] } }, { language: "nl" }).item.words[1], ["Boek", "boek"]);
});

test("your AI's form: what can't be read is said, each with where", () => {
  const problems = (input) => storedItem(input, { language: "nl" }).problems.map((p) => p.at);
  eq(problems({ nl: [["Ik"], ["ga"]] }), ["nl", "sentence"]);
  eq(problems({ sentence: "Ik ga.", lemmas: { gaan: "gaan" }, gap: { word: "ga", options: [] } }), ["lemmas.gaan"]);
  eq(problems({ sentence: "Ik ga.", gap: { word: "kom", options: [] } }), ["gap.word"]);
  eq(problems({ sentence: "Ik ga, ik ga.", gap: { word: "ga", at: 1, options: [] } }), []);
  eq(problems({ sentence: "Ik ga, ik ga.", gap: { word: "ga", at: 0, options: [] } }), ["gap.at"]);
  eq(storedItem("Ik ga.", { language: "nl" }).item, null);
});

test("ids: an item's from its first words, a pack's from its name, never one that's taken", () => {
  eq(idFor(["Où", "est", "la", "gare?"]), "ou-est-la-gare");
  eq(idFor(["Ik", "ga"], new Set(["ik-ga", "ik-ga-2"])), "ik-ga-3");
  eq(idFor(["?!"]), "item");
  eq(packIdFor("Travel in Germany"), "travel-in-germany");
  eq(packIdFor("Reizen 🇳🇱", new Set(["reizen"])), "reizen-2");
  eq(packIdFor("!"), "my-pack");
});

test("a repeated gap word keeps its place both ways", () => {
  const item = storedItem({ sentence: "Ik ga, ik ga.", natural: "I go, I go.", wrong: ["Ga ik, ik ga."], literal: ["I go,", "I go"], gap: { word: "ga", at: 3, options: ["ga", "gaat"] }, patterns: ["v2"] }, { language: "nl" }).item;
  eq(item.gap.index, 3);
  eq(authoringItem(item).gap, { word: "ga", options: ["ga", "gaat"], at: 3 });
});

test("changes: add, update, remove and edit applied to a pack; what doesn't fit is said", () => {
  const pack = checkPack(copy(NL), { installed: builtIn }).pack;
  const extra = { ...copy(pack.items[0]), id: "extra" };
  const added = applyChange(pack, { kind: "add", items: [extra], dictionaries: { words: { extra: "more" } } });
  eq([added.pack.items.length, added.pack.items.at(-1).id, added.pack.words.extra], [pack.items.length + 1, "extra", "more"]);
  eq(applyChange(pack, { kind: "add", items: [pack.items[0]] }).problems.map((p) => p.at), ["items[0].id"]);
  const changed = { ...copy(pack.items[1]), means: "Changed." };
  eq(applyChange(pack, { kind: "update", items: [changed] }).pack.items[1].means, "Changed.");
  eq(applyChange(pack, { kind: "update", items: [{ ...changed, id: "nope" }] }).problems.map((p) => p.at), ["items[0].id"]);
  eq(applyChange(pack, { kind: "remove", ids: [pack.items[0].id] }).pack.items.map((i) => i.id), pack.items.slice(1).map((i) => i.id));
  eq(applyChange(pack, { kind: "remove", ids: ["nope"] }).problems.map((p) => p.at), ["ids[0]"]);
  const edited = applyChange(pack, { kind: "edit", name: "Renamed", about: "", dictionaries: { topics: { extra: "Extra" } } }).pack;
  eq([edited.name, edited.about, edited.topics.extra], ["Renamed", undefined, "Extra"]);
  const topic = Object.keys(pack.topics)[0];
  eq(Object.hasOwn(applyChange(pack, { kind: "edit", dictionaries: { topics: { [topic]: null } } }).pack.topics, topic), false);
  // The result is checked as a whole: a topic the items still use can't go.
  ok(!checkPack(applyChange(pack, { kind: "edit", dictionaries: { topics: { [topic]: null } } }).pack, { installed: builtIn }).pack || !pack.items.some((i) => i.topic === topic), "a topic in use can't be taken out");
  eq(applyChange(null, { kind: "add", items: [] }).problems.map((p) => p.at), ["id"]);
  eq(applyChange(pack, { kind: "create", pack }).problems.map((p) => p.at), ["id"]);
  for (const kind of ["undo", "delete", "sing"]) eq(applyChange(pack, { kind }).problems.map((p) => p.at), ["kind"]);
});

test("a new pack's shell passes the check empty, and what a change did reads in words", () => {
  ok(checkPack(newPack({ id: "travel-de", name: "Travel", language: "de" })).pack, "an empty pack is a pack");
  eq(describeChange({ kind: "add", items: [1, 2] }, { name: "Travel" }), "added 2 sentences to Travel");
  eq(describeChange({ kind: "remove", ids: ["a"] }, { name: "Travel" }), "took 1 sentence out of Travel");
  eq(describeChange({ kind: "create", pack: { name: "Travel", items: [] } }), "made Travel (0 sentences)");
  eq(describeChange({ kind: "delete" }, { name: "Travel" }), "deleted Travel");
  eq(describeChange({ kind: "edit", name: "Trips" }, { name: "Trips", was: "Travel" }), "renamed Travel to Trips");
  eq(describeChange({ kind: "edit", dictionaries: {} }, { name: "Trips", was: "Trips" }), "changed the details of Trips");
});

test("a field of the wrong type is refused, never coerced (JSON can carry an object whose toString is null)", () => {
  const trap = JSON.parse('{"toString": null}');
  const at = (value) => {
    try {
      return checkPack(value, { installed: [] }).errors.map((e) => e.at);
    } catch (error) {
      throw new Error(`threw instead of refusing: ${error.message}`);
    }
  };
  ok(at({ ...structuredClone(NL), language: trap }).includes("language"), "language");
  ok(at({ ...structuredClone(NL), from: trap }).includes("from"), "from");
  ok(at({ ...structuredClone(NL), copiedFrom: { id: trap, version: trap } }).includes("copiedFrom"), "copiedFrom");
  const item = structuredClone(NL);
  item.items[0].topic = trap;
  item.items[0].concepts = [trap];
  item.items[0].punct = trap;
  item.items[0].wrong = [trap, ...item.items[0].wrong.slice(1)];
  const errors = at(item);
  for (const field of ["topic", "concepts", "punct"]) ok(errors.some((e) => e.endsWith(`.${field}`)), `${field}: ${JSON.stringify(errors)}`);
  eq(isPackRef({ id: trap, version: trap, url: "/library/x" }), false);
  // A pack's own pattern building on others: names read as text only, and only real patterns count ("__proto__" isn't one).
  for (const other of [trap, "__proto__", "constructor"]) {
    const own = { ...structuredClone(NL), patterns: { mine: { name: "Mine", about: "A pattern of the pack's own.", after: [other] } } };
    ok(at(own).includes("patterns.mine.after"), `after ${typeof other === "string" ? other : "an object"}`);
  }
  const stored = storedItem({ sentence: "Ik lees een boek.", lemmas: { lees: "lezen" }, literal: ["I", "read", "a book."], english: [0, 1, 2], natural: "I read a book.", wrong: ["Ik een boek lees."], gap: { word: trap, options: ["lees", "leest"] } }, { language: "nl" });
  ok(stored.problems.some((p) => p.at === "gap.word" && p.message.includes('{"toString":null}')), JSON.stringify(stored.problems));
  // A word's reading, the pack's readings, and your AI's words and readings.
  const ja = structuredClone(JA);
  ja.items[0].words[0] = ["私", "私", trap];
  ja.readings = { 学生: trap };
  const jaErrors = at(ja);
  ok(jaErrors.includes("items[0].words[0][2]") && jaErrors.some((e) => e.startsWith("readings")), JSON.stringify(jaErrors));
  const jaStored = storedItem({ ...authoringItem(JA.items[0], "ja"), words: [trap, "は", "学生", "です"], readings: { 私: trap } }, { language: "ja" });
  ok(jaStored.problems.some((p) => p.at === "words") && jaStored.problems.some((p) => p.at.startsWith("readings")), JSON.stringify(jaStored.problems));
});

test("a pack never carries a cover: refused, not left out, so a share can't carry one", () => {
  const withCover = { ...structuredClone(NL), cover: { file: "0123456789abcdef.svg" } };
  const { pack, errors } = checkPack(withCover, { installed: [] });
  ok(pack === null && errors.some((e) => e.at === "cover" && /covers stay/.test(e.message)), JSON.stringify(errors));
  ok(!checkPack(structuredClone(NL), { installed: [] }).errors.some((e) => e.at === "cover"), "without one, no cover error");
});

test("Hindi: a vowel sign is part of its word, so को and के are two words and a lemma lands on its own", () => {
  // Devanagari's vowel signs are combining marks (\p{M}); trimmed as punctuation, को, के, का and की were all क.
  const { item, problems } = storedItem(
    {
      id: "shanivaar-dadi",
      sentence: "शनिवार को हम दादी के घर जा रहे हैं।",
      lemmas: { के: "का", हैं: "होना" },
      literal: ["On Saturday", "we", "to Grandma's house", "are going"],
      natural: "On Saturday we're going to Grandma's.",
      wrong: ["शनिवार को हम दादी का घर जा रहे हैं।"],
      gap: { word: "के", options: ["के", "का"] },
    },
    { language: "hi" },
  );
  eq(problems, []);
  eq(item.words, [["शनिवार"], ["को"], ["हम"], ["दादी"], ["के", "का"], ["घर"], ["जा"], ["रहे"], ["हैं", "होना"]]);
  eq([item.punct, item.gap.index], ["।", 4]);
});

await testAsync("shapes: a checker that knows them keeps them and the version holds; one that doesn't (an older device) drops them and gets another version, so a library pack carries shapes only once that checker is live; a bad mark is dropped with a warning, the item kept", async () => {
  const withShapes = structuredClone(BUILT_IN[0]);
  const at = withShapes.items.findIndex((one) => one.id === "boek-gelezen");
  withShapes.items[at].shapes = { perfect: [{ shape: "lit", words: [5] }, { shape: "frame", from: 1, to: 5 }] };
  const kept = checkPack(withShapes, { installed: builtIn });
  eq(kept.pack.items[at].shapes, withShapes.items[at].shapes);
  eq(await packVersion(checked(JSON.parse(packText(kept.pack)))), await packVersion(kept.pack));
  // What an older checker keeps: everything but the field it doesn't know.
  const older = structuredClone(kept.pack);
  delete older.items[at].shapes;
  ok((await packVersion(older)) !== (await packVersion(kept.pack)), "an older device's copy, without shapes, hashed the same");
  const bad = structuredClone(BUILT_IN[0]);
  bad.items[at].shapes = { perfect: [{ shape: "frame", from: 5, to: 1 }] };
  const result = checkPack(bad, { installed: builtIn });
  ok(result.pack && result.pack.items[at] && !result.pack.items[at].shapes, "a bad mark sank the item or was kept");
  ok(result.warnings.some((w) => /shapes/.test(w.at)), "no warning for the dropped mark");
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
