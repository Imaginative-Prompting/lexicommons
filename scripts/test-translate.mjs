// Translate's engine (public/js/translate/engine.js), case by case, on the real starter and test packs and two books'
// layers (a help layer and a weave from English, shaped as the library's): whole sentences both ways, word by word
// with each meaning's source, a book's gloss of the very form typed, phrases, accents, examples, what isn't found, the
// direction guessed, the credits, and two results merged with every source still credited. Pure, so it runs in Node:
// `node scripts/test-translate.mjs` (exit 0 = pass).

// Dutch's grammar as the library has it, first: packs/path-nl.json uses its later patterns (scripts/fixtures/library-grammar.mjs).
import "./fixtures/library-grammar.mjs";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILT_IN } from "../public/js/packs/index.js";
import { checkPack } from "../public/js/study/pack-format.js";
import { LANGUAGES } from "../public/js/lang/index.js";
import { READINGS } from "../public/js/translate/readings.js";
import { bestGuess, bookSource, buildIndex, firstSense, glossKeys, keyOf, mergeResults, nextGuesses, search, TRANSLATE_LIMITS } from "../public/js/translate/engine.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(HERE, "fixtures/packs", name), "utf8"));
const STARTER = checkPack(BUILT_IN[0]).pack;
const builtIn = [{ ...STARTER, builtIn: true }];
const DE = checkPack(fixture("check-de.json"), { installed: [] }).pack;
const packSource = (pack, credit) => ({ id: `pack:${pack.id}`, kind: "pack", name: pack.name, credit, language: pack.language, items: pack.items, words: pack.words, chunks: pack.chunks });
// A Dutch picture book with its English help layer, and an English book woven into Dutch, as the library has them.
const HELP_BOOK = {
  id: "regenjas",
  title: "De rode regenjas",
  lang: "nl",
  authors: [{ name: "A. Writer", role: "author" }],
  rights: { us: false, eu: false, spdx: "CC-BY-4.0", licence: "CC BY 4.0", attributionText: "Story by A. Writer, StoryWeaver" },
  words: ["De", "rode", "regenjas", "hangt", "aan", "de", "deur.", "Oma", "leest", "een", "boek."],
  sentences: [[0, 7], [7, 11]],
};
const HELP = {
  kind: "help",
  from: "nl",
  to: "en",
  credit: "Translated for Lexicommons",
  licence: "CC BY-SA 4.0",
  made: { pipeline: "lexicommons-books 1", model: "gpt-6-astra", run: "help-en-2" },
  sentences: [
    { s: 0, e: 7, t: [["The", "de"], ["red", "rood"], ["raincoat", "regenjas"], ["hangs", "hangen"], ["on", "aan"], ["the", "de"], ["door.", "deur"]], text: "The red raincoat hangs on the door." },
    { s: 7, e: 11, t: [["Grandma", "oma"], ["reads", "lezen"], ["a", "een"], ["book.", "boek"]], text: "Grandma reads a book." },
  ],
};
const WEAVE_BOOK = { id: "alice", title: "Alice", lang: "en", authors: [{ name: "Lewis Carroll", role: "author" }], rights: { us: true, eu: true, licence: "Public domain; a long note" }, words: ["Down", "the", "Rabbit-Hole"], sentences: [[0, 3]] };
const WEAVE = {
  kind: "weave",
  from: "en",
  to: "nl",
  credit: "Translated for Lexicommons",
  licence: "CC BY-SA 4.0",
  made: { pipeline: "lexicommons-books 1", model: "gpt-6-astra", run: "pilot-nl-5" },
  sentences: [{ s: 0, e: 3, t: [["In", "in"], ["het", "het"], ["Konijnenhol", "konijnenhol"]], text: "Het konijnenhol in", m: [["Het", "the", [1], "het"], ["konijnenhol", "rabbit-hole", [2], "konijnenhol"], ["in", "into", [0], "in"]] }],
};
const BOOK = bookSource(HELP_BOOK, HELP);
const WOVEN = bookSource(WEAVE_BOOK, WEAVE);
const index = buildIndex([packSource(STARTER, "Lexicommons"), packSource(DE, "Lexicommons"), BOOK, WOVEN]);

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
const eq = (actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${a} ≠ ${e}`);
};
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};
const first = STARTER.items[0];
const sentenceText = first.words.map(([t]) => t).join(" ") + first.punct;

test("keys: lower case, punctuation off each word; glosses looked up without 'to', 'the' or what's in brackets", () => {
  eq(keyOf("  Ik heb gisteren een BOEK gelezen. "), "ik heb gisteren een boek gelezen");
  eq(keyOf("Where's   the “station”?"), "where's the station");
  eq(glossKeys("to go (by car, train or bike)"), ["go"]);
  eq(glossKeys("the book; a volume"), ["book", "volume"]);
});

test("a whole sentence, both ways: the pack's own sentence with its English, and back", () => {
  const there = search(index, sentenceText, { from: "nl", to: "en" });
  eq([there.whole.text, there.whole.translation, there.whole.item.id], [sentenceText, first.means, first.id]);
  // The pack it's from first; then any other source an example sentence came from, each used by something shown.
  eq(there.sources[0].id, "pack:starter-word-order");
  const shown = new Set([there.whole.source, ...there.words.map((w) => w.source), ...there.sentences.map((s) => s.source)]);
  ok(there.sources.every((s) => shown.has(s.id)), JSON.stringify(there.sources));
  const back = search(index, first.means, { from: "en", to: "nl" });
  eq([back.whole.text, back.from, back.to], [sentenceText, "en", "nl"]);
});

test("word by word: a word's meaning from the pack's glossary, and sentences that use it", () => {
  const r = search(index, "boek", { from: "nl", to: "en" });
  eq(r.whole, null);
  eq(r.words.map((w) => [w.text, w.en, w.source]), [["boek", STARTER.words.boek, "pack:starter-word-order"]]);
  ok(r.sentences.some((s) => s.item?.id === first.id && s.natural === first.means), JSON.stringify(r.sentences).slice(0, 200));
  const en = search(index, "book", { from: "en", to: "nl" });
  ok(en.words.some((w) => w.lemma === "boek"), JSON.stringify(en.words));
});

test("a word as written finds its dictionary form; a book's gloss of that very form comes first, both credited", () => {
  const r = search(index, "gelezen", { from: "nl", to: "en" });
  eq(r.words.map((w) => w.lemma), ["lezen"]);
  const leest = search(index, "leest", { from: "nl", to: "en" });
  eq(leest.words[0], { text: "leest", lemma: "lezen", en: "reads", source: "book:regenjas:nl", at: 0, span: 1 });
  ok(leest.words.some((w) => w.text === "lezen" && w.en === STARTER.words.lezen && w.source === "pack:starter-word-order"), JSON.stringify(leest.words));
  ok(["book:regenjas:nl", "pack:starter-word-order"].every((id) => leest.sources.some((s) => s.id === id)), JSON.stringify(leest.sources));
  eq(search(index, "reads", { from: "en", to: "nl" }).words.map((w) => [w.text, w.lemma]), [["leest", "lezen"]]);
});

test("a phrase counts as one, found before its words", () => {
  const [id, chunk] = Object.entries(STARTER.chunks)[0];
  const r = search(index, chunk.text, { from: "nl", to: "en" });
  ok(r.whole || r.words.some((w) => w.text === chunk.text && w.en === chunk.en), `${id}: ${JSON.stringify(r)}`);
  const back = search(index, chunk.en, { from: "en", to: "nl" });
  ok(back.words.some((w) => w.text === chunk.text) || back.whole, JSON.stringify(back.words));
});

test("a help layer: its sentences both ways, each word's gloss without the book's punctuation, the book and layer credited", () => {
  eq(BOOK.sentences[0], { text: "De rode regenjas hangt aan de deur.", translation: "The red raincoat hangs on the door.", words: [["de", "de", "The"], ["rode", "rood", "red"], ["regenjas", "regenjas", "raincoat"], ["hangt", "hangen", "hangs"], ["aan", "aan", "on"], ["de", "de", "the"], ["deur", "deur", "door"]] });
  const r = search(index, "regenjas", { from: "nl", to: "en" });
  eq(r.words.map((w) => [w.text, w.en, w.source]), [["regenjas", "raincoat", "book:regenjas:nl"]]);
  eq(r.sentences.map((s) => [s.item, s.natural]), [[null, "The red raincoat hangs on the door."]]);
  eq(r.sources, [{ id: "book:regenjas:nl", kind: "book", name: "De rode regenjas", credit: "Story by A. Writer, StoryWeaver · English: Made for Lexicommons with an AI model and checked sentence by sentence (CC BY-SA 4.0)", license: "CC BY 4.0" }]);
  eq(search(index, "the red raincoat hangs on the door", { from: "en", to: "nl" }).whole.text, "De rode regenjas hangt aan de deur.");
  eq(search(index, "hangt", { from: "nl", to: "en" }).words.map((w) => [w.text, w.lemma, w.en]), [["hangt", "hangen", "hangs"]]);
});

test("a weave from English: the language's sentence in its own order, its words from the woven line, public domain", () => {
  eq(WOVEN.language, "nl");
  eq(WOVEN.sentences, [{ text: "Het konijnenhol in", translation: "Down the Rabbit-Hole", words: [["het", "het", "the"], ["konijnenhol", "konijnenhol", "rabbit-hole"], ["in", "in", "into"]] }]);
  const r = search(index, "konijnenhol", { from: "nl", to: "en" });
  eq(r.words.map((w) => [w.text, w.en]), [["konijnenhol", "rabbit-hole"]]);
  eq(r.sources.map((s) => [s.credit, s.license]), [["Lewis Carroll · Dutch: Made for Lexicommons with an AI model and checked sentence by sentence (CC BY-SA 4.0)", "Public domain"]]);
  eq(search(index, "Down the rabbit-hole", { from: "en", to: "nl" }).whole.text, "Het konijnenhol in");
  // Only a layer between a language and English is a source.
  eq([bookSource(HELP_BOOK, { ...HELP, to: "de" }), bookSource(WEAVE_BOOK, { ...WEAVE, to: "en" }), bookSource({ ...HELP_BOOK, lang: "en" }, HELP)], [null, null, null]);
});

test("what isn't found is said; the language's little words aren't listed as missing", () => {
  const r = search(index, "de xyzzy boek", { from: "nl", to: "en" });
  eq(r.unknown, ["xyzzy"]);
  eq(search(index, "the zorblax", { from: "en", to: "nl" }).unknown, ["zorblax"]);
  const none = search(index, "qwerty", { from: "nl", to: "en" });
  eq([none.whole, none.words.length, none.sentences.length, none.sources.length], [null, 0, 0, 0]);
});

test("a language with nothing here: every word typed is said to be missing, little words aside", () => {
  const r = search(index, "ein Buch für dich", { from: "es", to: "en" });
  eq([r.from, r.whole, r.words, r.sentences, r.sources], ["es", null, [], [], []]);
  eq(r.unknown, ["ein", "buch", "für", "dich"]);
  eq(search(buildIndex([]), "the book", { from: "en", to: "nl" }).unknown, ["book"]);
});

test("other languages: German from its own pack, German nouns as written", () => {
  const r = search(index, "Buch", { from: "de", to: "en" });
  eq(r.words.map((w) => [w.text, w.source]), [["Buch", "pack:check-de"]]);
  ok(r.sentences.every((s) => s.source === "pack:check-de"), "German examples");
});

test("the direction, guessed: English typed goes to the language, the language's words to English", () => {
  eq([search(index, "book", { language: "nl" }).from, search(index, "boek gelezen", { language: "nl" }).from], ["en", "nl"]);
});

test("nothing typed is null; two results merge, keeping every source", () => {
  eq([search(index, ""), search(index, "   ")], [null, null]);
  const a = search(index, "leest", { from: "nl", to: "en" });
  const b = search(buildIndex([WOVEN]), "leest konijnenhol", { from: "nl", to: "en" });
  const m = mergeResults(a, b);
  eq(m.sources.map((s) => s.id).sort(), ["book:alice:nl", "book:regenjas:nl", "pack:starter-word-order"]);
  ok(m.words.some((w) => w.text === "leest") && m.words.some((w) => w.text === "konijnenhol"), JSON.stringify(m.words));
  eq(m.unknown, []);
});

test("merging results split differently (Japanese, by what each index knows): each word once, in the order typed", () => {
  const ja = (id, words) => buildIndex([{ id, kind: "pack", name: id, credit: "Test", language: "ja", items: [], words, chunks: {} }]);
  const device = search(ja("pack:d", { 猫: "cat" }), "食べる猫", { from: "ja", to: "en" });
  const server = search(ja("pack:s", { 食べる: "eat", 猫: "cat" }), "食べる猫", { from: "ja", to: "en" });
  ok(device.tokens.join("|") !== server.tokens.join("|"), `the two split it the same way: ${device.tokens.join("|")}`);
  const merged = mergeResults(device, server);
  eq(merged.words.map((w) => w.en).join(" "), "eat cat");
  eq(merged.words.map((w) => w.text), ["食べる", "猫"]);
});

test("a gloss of several words and a phrase of one word are found, both ways", () => {
  const small = buildIndex([{ id: "pack:small", kind: "pack", name: "Small", credit: "Test", language: "nl", items: [], words: { ijs: "ice cream", fiets: "bicycle" }, chunks: { hoi: { text: "Hoi", en: "Hello" } } }]);
  eq(search(small, "ice cream", { from: "en", to: "nl" }).words.map((w) => [w.text, w.at, w.span]), [["ijs", 0, 2]]);
  eq(search(small, "an ice cream and a bicycle", { from: "en", to: "nl" }).words.map((w) => w.text), ["ijs", "fiets"]);
  eq(search(small, "hoi", { from: "nl", to: "en" }).words.map((w) => [w.text, w.en]), [["Hoi", "Hello"]]);
  eq(search(small, "hello", { from: "en", to: "nl" }).words.map((w) => [w.text, w.en]), [["Hoi", "Hello"]]);
});

test("merging keeps the order typed, fills only what the first didn't find, and a whole sentence keeps its own words", () => {
  const device = buildIndex([{ id: "pack:d", kind: "pack", name: "D", credit: "Test", language: "nl", items: [], words: { hond: "dog" }, chunks: {} }]);
  const server = buildIndex([{ id: "pack:s", kind: "pack", name: "S", credit: "Test", language: "nl", items: [], words: { kat: "cat", hond: "hound" }, chunks: {} }]);
  const m = mergeResults(search(device, "kat hond", { from: "nl", to: "en" }), search(server, "kat hond", { from: "nl", to: "en" }));
  eq(m.words.map((w) => [w.text, w.en]), [["kat", "cat"], ["hond", "dog"]]);
  eq([m.unknown, m.found], [[], 2]);
  const one = mergeResults(search(device, "hond", { from: "nl", to: "en" }), search(server, "hond", { from: "nl", to: "en" }));
  eq(one.words.map((w) => w.en), ["dog", "hound"]);
  const whole = search(index, sentenceText, { from: "nl", to: "en" });
  const merged = mergeResults(whole, search(server, sentenceText, { from: "nl", to: "en" }));
  eq(merged.words, whole.words);
  const fromServer = mergeResults(search(server, sentenceText, { from: "nl", to: "en" }), whole);
  eq([fromServer.whole.text, fromServer.words], [whole.whole.text, whole.words]);
});

test("one source per layer: an English book woven into two languages credits each layer's own translator", () => {
  // The German layer is someone else's (no record of the books pipeline): its own credit, beside the pipeline's Dutch one.
  const de = { ...WEAVE, to: "de", credit: "Ins Deutsche übertragen", made: undefined, sentences: [{ ...WEAVE.sentences[0], text: "In den Kaninchenbau", m: [["In", "Down", [0], "in"], ["den", "the", [1], "der"], ["Kaninchenbau", "Rabbit-Hole", [2], "Kaninchenbau"]] }] };
  const both = buildIndex([bookSource(WEAVE_BOOK, WEAVE), bookSource(WEAVE_BOOK, de)]);
  eq(search(both, "konijnenhol", { from: "nl", to: "en" }).sources.map((s) => [s.id, s.credit]), [["book:alice:nl", "Lewis Carroll · Dutch: Made for Lexicommons with an AI model and checked sentence by sentence (CC BY-SA 4.0)"]]);
  eq(search(both, "Kaninchenbau", { from: "de", to: "en" }).sources.map((s) => [s.id, s.credit]), [["book:alice:de", "Lewis Carroll · German: Ins Deutsche übertragen (CC BY-SA 4.0)"]]);
});

test("Hindi: vowel signs, virama, nukta and candrabindu are the word's own, typed exactly or loosely", () => {
  const checked = checkPack({
    format: "lexicommons-pack", version: 2, id: "check-hi", name: "A check pack (Hindi)", language: "hi", from: "en",
    topics: {}, words: { का: "of, 's", गाड़ी: "car", होना: "to be", पिज़्ज़ा: "pizza", स्वादिष्ट: "delicious", डॉक्टर: "doctor" }, chunks: {}, patterns: {},
    items: [
      { id: "gaadi", concepts: ["possessive"], words: [["यह"], ["मेरे"], ["पापा"], ["की", "का"], ["गाड़ी", "गाड़ी"], ["है", "होना"]], punct: "।", literal: [["This"], ["my dad's car"], ["is", true]], english: [0, 2, 1], moved: ["है"], means: "This is my dad's car.", wrong: ["यह मेरे पापा का गाड़ी है।"], gap: { index: 3, options: ["की", "का"] } },
      { id: "pizza", concepts: ["past"], words: [["पिज़्ज़ा", "पिज़्ज़ा"], ["स्वादिष्ट", "स्वादिष्ट"], ["था", "होना"]], punct: "।", literal: [["The pizza"], ["delicious"], ["was", true]], english: [0, 2, 1], moved: ["था"], means: "The pizza was delicious.", wrong: ["पिज़्ज़ा स्वादिष्ट थी।"], gap: { index: 2, options: ["था", "थी"] } },
      { id: "doctor", concepts: ["copula"], words: [["मैं"], ["डॉक्टर", "डॉक्टर"], ["हूँ", "होना"]], punct: "।", literal: [["I"], ["a doctor"], ["am", true]], english: [0, 2, 1], moved: ["हूँ"], means: "I'm a doctor.", wrong: ["मैं डॉक्टर है।"], gap: { index: 2, options: ["हूँ", "है"] } },
    ],
  }, { installed: [] });
  eq(checked.errors, []);
  const HI = checked.pack;
  const index = buildIndex([packSource(HI, "Test")]);
  eq(keyOf("यह मेरे पापा की गाड़ी है।"), "यह मेरे पापा की गाड़ी है");
  const found = (q) => search(index, q, { from: "hi", to: "en" }).words.map((w) => [w.text, w.en]);
  eq(found("की"), [["का", HI.words["का"]]]);
  eq(found("हूँ"), [["होना", HI.words["होना"]]]);
  eq(found("स्वादिष्ट"), [["स्वादिष्ट", "delicious"]]);
  eq(found("पिज़्ज़ा"), [["पिज़्ज़ा", "pizza"]]);
  // Loose matching takes off only the accents scripts share (é → e), never a script's own marks: a bare consonant is
  // no word (before, क found का, के and की), and पिज्जा without its nuktas isn't पिज़्ज़ा.
  eq(found("क"), []);
  eq(found("पिज्जा"), []);
});

test("Persian: a word typed without its zero-width non-joiner still finds it", () => {
  LANGUAGES.xr = { name: "Right-to-left test", locale: "xr-XR", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", patterns: { v2: { name: "Verb last", about: "The verb comes last.", after: [] } } };
  try {
    const goes = "می\u200Cروم";
    const checked = checkPack({
      format: "lexicommons-pack", version: 2, id: "check-xr", name: "A check pack (right to left)", language: "xr", from: "en",
      topics: {}, words: { رفتن: "to go", خانه: "home" }, chunks: {}, patterns: {},
      items: [{ id: "mi-ravam", concepts: ["v2"], words: [["به"], ["خانه", "خانه"], [goes, "رفتن"]], punct: ".", literal: [["to"], ["home"], ["I go", true]], english: [2, 0, 1], moved: [goes], means: "I'm going home.", wrong: [`خانه به ${goes}.`], gap: { index: 2, options: [goes, "می\u200Cرود"] } }],
    }, { installed: [] });
    eq(checked.errors, []);
    eq(checked.pack.items[0].words[2][0], goes);
    const index = buildIndex([packSource(checked.pack, "Test")]);
    eq(search(index, "میروم", { from: "xr", to: "en" }).words.map((w) => [w.lemma, w.en]), [["رفتن", "to go"]]);
  } finally {
    delete LANGUAGES.xr;
  }
});

test("Japanese: a sentence typed whole, or its words, without spaces; and English into Japanese", () => {
  const JA = checkPack({
    format: "lexicommons-pack", version: 2, id: "check-ja", name: "A check pack (Japanese)", language: "ja", from: "en",
    topics: {}, words: { 私: "I", 学生: "student", です: "is", 寿司: "sushi", 食べる: "to eat" },
    readings: { 私: "わたし", 学生: "がくせい", 寿司: "すし", 食べる: "たべる" },
    chunks: { "douzo-yoroshiku": { text: "どうぞよろしくお願いします。", en: "Nice to meet you." } }, patterns: {},
    items: [
      { id: "student", concepts: ["desu"], words: [["私", "私", "わたし"], ["は"], ["学生", "学生", "がくせい"], ["です", "です"]], punct: "。", literal: [["I"], ["a student"], ["am", true]], english: [0, 2, 1], moved: ["です"], means: "I'm a student.", wrong: ["私を学生です。"], gap: { index: 1, options: ["は", "を"] } },
      { id: "sushi", concepts: ["object-o"], words: [["寿司", "寿司", "すし"], ["を"], ["食べました", "食べる", "たべました"]], punct: "。", literal: [["sushi"], ["ate", true]], english: [1, 0], moved: ["食べました"], means: "I ate sushi.", wrong: ["寿司が食べました。"], gap: { index: 1, options: ["を", "が"] } },
    ],
  }).pack;
  const index = buildIndex([packSource(JA, "Test")]);
  const whole = search(index, "私は学生です。", { from: "ja", to: "en" });
  eq([whole.whole?.translation, whole.found], ["I'm a student.", 4]);
  const spaced = search(index, "私 は 学生 です", { from: "ja", to: "en" });
  eq(spaced.whole?.translation, "I'm a student.");
  const words = search(index, "学生は寿司を食べました", { from: "ja", to: "en" });
  eq(words.words.map((w) => [w.text, w.en]), [["学生", "student"], ["寿司", "sushi"], ["食べる", "to eat"]]);
  eq(words.unknown, []);
  const phrase = search(index, "どうぞよろしくお願いします", { from: "ja", to: "en" });
  eq(phrase.words.map((w) => w.en), ["Nice to meet you."]);
  const back = search(index, "sushi", { from: "en", to: "ja" });
  eq(back.words.map((w) => w.text), ["寿司"]);
  // Guessing the direction: Japanese typed is read as Japanese.
  eq(search(index, "寿司", { language: "ja" }).from, "ja");
});

// A word pack as the frequency series has them: one sentence written for each word (its gap is that word), and
// other sentences that use it too, before and after it.
const WORDS_NL = (() => {
  const item = (id, words, natural, gap) => ({ id, concepts: ["v2"], words: words.map((w) => (Array.isArray(w) ? w : [w])), punct: ".", literal: [["x"]], english: null, moved: [], means: natural, wrong: ["x"], gap: { index: gap, options: [] } });
  const items = [];
  // Seven sentences that only use hoi, then hoi's own (the eighth), then hallo's own, then two that say both.
  for (let n = 1; n <= 7; n++) items.push(item(`other-${n}`, [["Hoi", "hoi"], ["zegt", "zeggen"], [`buur${n}`, `buur${n}`]], `Neighbor ${n} says hi.`, 1));
  items.push(item("hoi", [["Hoi", "hoi"], ["allemaal", "allemaal"]], "Hi, everyone.", 0));
  items.push(item("hallo", [["Hallo", "hallo"], ["daar", "daar"]], "Hello there.", 0));
  items.push(item("both-1", [["Hallo", "hallo"], ["en", "en"], ["hoi", "hoi"]], "Hello and hi.", 1));
  return { id: "words-nl-test", name: "Dutch words (test)", language: "nl", from: "en", items, words: { hoi: "hi, hello; bye", hallo: "hello, hi", zeggen: "to say", allemaal: "all, everyone" }, chunks: {} };
})();
const WORDS_INDEX = buildIndex([packSource(WORDS_NL, "Lexicommons")]);

test("one word typed (hi): its translations first, then up to 6 sentences, each word's own sentence first", () => {
  const found = search(WORDS_INDEX, "hi", { from: "en", to: "nl" });
  eq(found.words.map((w) => w.lemma), ["hoi", "hallo"]);
  eq(found.sentences.length, 6);
  // hoi's own, then hallo's own (each kept though seven sentences use hoi before its own), then the others in order.
  eq(found.sentences.slice(0, 2).map((s) => [s.text, s.own === true]), [["Hoi allemaal.", true], ["Hallo daar.", true]]);
  ok(found.sentences.slice(2).every((s) => !s.own), "only the words' own sentences are own");
  // Typed in Dutch, the same: hoi's own first.
  const nl = search(WORDS_INDEX, "hoi", { from: "nl", to: "en" });
  eq([nl.words[0].en, nl.sentences.length, nl.sentences[0].text], ["hi, hello; bye", 6, "Hoi allemaal."]);
  // A gloss of several words typed is one thing too ("say" → zeggen; "thank you" works the same way).
  eq(search(WORDS_INDEX, "to say", { from: "en", to: "nl" }).sentences.length, 6);
});

test("several things typed: 3 sentences, as before; nothing found: none", () => {
  const two = search(WORDS_INDEX, "hoi allemaal daar", { from: "nl", to: "en" });
  ok(two.words.length >= 2, JSON.stringify(two.words));
  eq(two.sentences.length, 3);
  eq(search(WORDS_INDEX, "hi zzyzx", { from: "en", to: "nl" }).sentences.length, 3);
  eq(search(WORDS_INDEX, "zzyzx", { from: "en", to: "nl" }).sentences, []);
});

test("a word's own sentence stays kept however many sentences before it use the word", () => {
  const busy = { ...WORDS_NL, items: [...Array.from({ length: 40 }, (_, n) => ({ ...WORDS_NL.items[0], id: `busy-${n}`, words: [["Hoi", "hoi"], ["zegt", "zeggen"], [`kind${n}`, `kind${n}`]], means: `Child ${n} says hi.` })), ...WORDS_NL.items.slice(7)] };
  const found = search(buildIndex([packSource(busy, "Lexicommons")]), "hoi", { from: "nl", to: "en" });
  eq([found.sentences.length, found.sentences[0].text, found.sentences[0].own], [6, "Hoi allemaal.", true]);
});

test("merging: the server's own sentence goes before the device's others, up to 6 for one word", () => {
  // The device has only sentences that use hoi; the server has hoi's own.
  const device = search(buildIndex([packSource({ ...WORDS_NL, id: "mine", items: WORDS_NL.items.slice(0, 7) }, "Your pack")]), "hoi", { from: "nl", to: "en" });
  const server = search(WORDS_INDEX, "hoi", { from: "nl", to: "en" });
  ok(!device.sentences.some((s) => s.own), "the device has no own sentence");
  const merged = mergeResults(device, server);
  eq([merged.sentences.length, merged.sentences[0].text, merged.sentences[0].own], [6, "Hoi allemaal.", true]);
  eq(new Set(merged.sentences.map((s) => s.text)).size, 6);
  // Several things typed still merge to 3.
  eq(mergeResults(search(WORDS_INDEX, "hoi allemaal daar", { from: "nl", to: "en" }), search(WORDS_INDEX, "hoi allemaal daar", { from: "nl", to: "en" })).sentences.length, 3);
});

test("one word that's both a Dutch word and English (hi), no direction given: a commoner word for it leads, from English", () => {
  // The Dutch hi (said in Dutch too), with its own sentence, beside the English hi's hoi and hallo.
  const withHi = { ...WORDS_NL, items: [...WORDS_NL.items, { ...WORDS_NL.items[8], id: "hi", words: [["Hi", "hi"], ["buurman", "buurman"]], means: "Hi, neighbor." }], words: { ...WORDS_NL.words, hi: "hi, hello", buurman: "neighbor" } };
  const found = search(buildIndex([packSource(withHi, "Lexicommons")]), "hi", { language: "nl" });
  eq([found.led, found.from, found.to], [true, "en", "nl"]);
  eq([...found.words.map((w) => w.lemma)].sort(), ["hallo", "hi", "hoi"]);
  ok(found.words[0].lemma !== "hi", `the lead echoes what was typed: ${found.words[0].lemma}`);
  eq(found.sentences.length, 6);
  // Every word's own sentence first.
  eq([...found.sentences.slice(0, 3).map((s) => s.own === true)], [true, true, true]);
  eq(found.sentences.slice(0, 3).map((s) => s.text).sort(), ["Hallo daar.", "Hi buurman.", "Hoi allemaal."]);
  // A direction given is one direction, as before.
  eq(search(buildIndex([packSource(withHi, "Lexicommons")]), "hi", { from: "nl", to: "en" }).words.map((w) => w.lemma), ["hi"]);
  // Only one side knowing it: that side alone (hoi isn't English; book isn't Dutch).
  eq([search(WORDS_INDEX, "hoi", { language: "nl" }).both, search(index, "book", { language: "nl" }).both], [undefined, undefined]);
});

// ---------- what the Translate page shows (the real Dutch word packs, when this copy has them) ----------

const assert = ok;
const item = (natural, nl) => ({ id: natural, words: nl, means: natural, punct: "" });
const DUTCH = readdirSync(join(HERE, "../packs")).filter((f) => /^words-nl-0\d\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(join(HERE, "../packs", f), "utf8")));
const DUTCH_INDEX = buildIndex(DUTCH.map((pack) => packSource(pack, "Lexicommons")));

test("a form's dictionary word: the one the packs use it as most, not the first one seen", () => {
  if (!DUTCH.length) return;
  const first = (text) => search(DUTCH_INDEX, text, { from: "nl", to: "en" }).words[0].lemma;
  eq(["loopt", "nemen", "gaat", "staat", "wil", "denk"].map(first), ["lopen", "nemen", "gaan", "staan", "willen", "denken"]);
  // In a phrase too, where only the first is shown.
  eq(search(DUTCH_INDEX, "de hond loopt naar huis", { from: "nl", to: "en" }).words.map((w) => w.lemma).slice(0, 3), ["de", "hond", "lopen"]);
  // A tie goes to the word that is the form itself.
  const tie = packSource({ ...DE, id: "tie", items: [item("Ik vaar af.", [["Ik", "ik"], ["vaar", "varen"], ["af", "afvaren"]]), item("Het is af.", [["Het", "het"], ["is", "zijn"], ["af", "af"]])], words: { af: "finished", afvaren: "to sail off", varen: "to sail", ik: "I", het: "it", zijn: "to be" }, chunks: {}, language: "nl" }, "x");
  eq(search(buildIndex([tie]), "af", { from: "nl", to: "en" }).words[0].lemma, "af");
});

test("from English, the commonest word for it: a meaning further down its gloss counts against it, a regional word most", () => {
  const gapped = (natural, nl) => ({ ...item(natural, nl), gap: { index: 0 } });
  const series = packSource({ ...DE, id: "series", language: "nl", items: [gapped("A", [["kaart", "kaart"]]), gapped("B", [["joe", "joe"]]), gapped("C", [["hoi", "hoi"]]), gapped("D", [["moi", "moi"]]), gapped("E", [["plattegrond", "plattegrond"]])], words: { kaart: "card; map", joe: "bye; hi", hoi: "hi, hello", moi: "hi, hello (regional)", plattegrond: "map, floor plan" }, chunks: {} }, "x");
  const index = buildIndex([series]);
  eq(search(index, "map", { from: "en", to: "nl" }).words[0].lemma, "kaart");
  eq(search(index, "hi", { from: "en", to: "nl" }).words.map((w) => w.lemma), ["hoi", "joe", "moi"]);
});

test("a word spelled the same on both sides: one word, two words, or a commoner word leading", () => {
  if (!DUTCH.length) return;
  const read = (word) => {
    const r = search(DUTCH_INDEX, word, { language: "nl" });
    return { reading: r.reading ?? (r.led ? "led" : null), lead: r.words[0]?.text, from: r.from };
  };
  for (const word of ["water", "week", "bed", "in"]) eq(read(word).reading, "same");
  for (const word of ["die", "door", "boot", "room", "wet", "slim", "angel"]) eq(read(word).reading, "two");
  const hi = read("hi");
  ok(hi.reading === "led" && hi.from === "en" && ["hallo", "hoi"].includes(hi.lead), `hi: ${JSON.stringify(hi)}`);
  const room = search(DUTCH_INDEX, "room", { language: "nl" });
  eq(room.readings.map((w) => w.text), ["room", "kamer"]);
  eq(bestGuess(room).kind, "two");
  eq(bestGuess(search(DUTCH_INDEX, "water", { language: "nl" })).kind, "same");
  // A direction given: as asked, no reading of the two sides.
  eq(search(DUTCH_INDEX, "room", { from: "nl", to: "en" }).reading, undefined);
  // Loanwords the language uses every day (readings.js): the same word, with what comes first among the guesses.
  for (const [word, first] of [["student", "leerling"], ["wow", "jee"], ["type", "soort"]]) {
    const r = search(DUTCH_INDEX, word, { language: "nl" });
    eq([r.reading, nextGuesses(r)[0]?.lemma], ["same", first]);
  }
  // The table's chosen leads and two-word calls, typed with no direction and from English.
  for (const [word, lead] of [["order", "bestelling"], ["strike", "staking"], ["reserve", "reserveren"], ["sound", "geluid"], ["cake", "taart"]]) {
    eq(search(DUTCH_INDEX, word, { language: "nl" }).words[0].lemma, lead);
    eq(search(DUTCH_INDEX, word, { from: "en", to: "nl" }).words[0].lemma, lead);
  }
  const file = search(DUTCH_INDEX, "file", { language: "nl" });
  eq([file.reading, file.readings[0].en, file.readings[1].lemma, nextGuesses(file)[0].lemma], ["two", "traffic jam", "bestand", "dossier"]);
  eq(nextGuesses(search(DUTCH_INDEX, "record", { language: "nl" })).slice(0, 2).map((g) => g.lemma), ["opnemen", "plaat"]);
  // Every word the table names is in the packs, or says what it means itself.
  for (const [word, specs] of Object.entries(READINGS.nl.firstGuess)) for (const spec of specs) ok(typeof spec === "object" || nextGuesses(search(DUTCH_INDEX, word, { language: "nl" })).some((g) => g.lemma === spec), `${word}'s first guess ${spec} isn't in the packs`);
  // From English too: the word itself leads.
  eq(search(DUTCH_INDEX, "type", { from: "en", to: "nl" }).words[0].lemma, "type");
  const was = nextGuesses(search(DUTCH_INDEX, "was", { language: "nl" }))[0];
  eq([was.lemma, was.en], ["was", "laundry"]);
  ok(nextGuesses(search(DUTCH_INDEX, "stem", { language: "nl" })).some((g) => g.lemma === "stengel"), "stem lists stengel");
  // A word typed alone isn't a separated verb.
  for (const [word, not] of [["in", "inpakken"], ["door", "doorgaan"], ["op", "opvallen"], ["aan", "aanraken"]]) {
    const guesses = search(DUTCH_INDEX, word, { language: "nl" });
    ok(![...guesses.words, ...guesses.alternatives].some((w) => w.lemma === not), `${word} lists ${not}`);
  }
  // In a sentence it can still be one.
  eq(search(DUTCH_INDEX, "betaal de lening af", { from: "nl", to: "en" }).tokens.length, 4);
});

test("next best guesses: every other reading of each word, and the other sentences a whole match could be", () => {
  if (DUTCH.length) {
    const phrase = search(DUTCH_INDEX, "de hond loopt naar huis", { from: "nl", to: "en" });
    assert(phrase.alternatives.some((a) => a.at === 2 && a.lemma === "aflopen"), `loopt's other reading: ${JSON.stringify(phrase.alternatives.map((a) => a.lemma))}`);
    assert(!phrase.alternatives.some((a) => a.lemma === "lopen"), "the best reading isn't its own alternative");
    assert(phrase.alternatives.every((a) => a.source && Number.isInteger(a.at)), "every alternative has its source and place");
    assert(phrase.alternatives.length <= TRANSLATE_LIMITS.alternatives, "alternatives stay within their limit");
  }
  // One word shows up to three readings as words; a fourth and on are alternatives.
  const many = { ...DE, id: "many", language: "nl", items: [], chunks: {}, words: { aa: "fine, ok", bb: "fine, good", cc: "fine, nice", dd: "fine, well", ee: "fine, thin" } };
  const found = search(buildIndex([packSource(many, "x")]), "fine", { from: "en", to: "nl" });
  eq(found.words.map((w) => w.lemma), ["aa", "bb", "cc"]);
  eq(found.alternatives.map((a) => a.lemma), ["dd", "ee"]);
  // Two sentences that say the same thing: the other is the next guess.
  const same = { ...DE, id: "same", language: "nl", chunks: {}, words: { thuis: "at home", ben: "am" }, items: [{ ...item("Ik ben thuis.", [["Ik", "ik"], ["ben", "zijn"], ["thuis", "thuis"]]), means: "I'm home." }, { ...item("Ik ben weer thuis.", [["Ik", "ik"], ["ben", "zijn"], ["weer", "weer"], ["thuis", "thuis"]]), means: "I'm home." }] };
  const whole = search(buildIndex([packSource(same, "x")]), "I'm home.", { from: "en", to: "nl" });
  eq(whole.whole.text, "Ik ben thuis");
  eq(whole.alternatives.map((a) => [a.sentence, a.text, a.translation]), [[true, "Ik ben weer thuis", "I'm home."]]);
});

test("the main words: little and very common words left out, each with its meaning and sentences, own first", () => {
  if (!DUTCH.length) return;
  const phrase = search(DUTCH_INDEX, "ik wil graag een biertje", { from: "nl", to: "en" });
  const lemmas = phrase.main.map((m) => m.lemma);
  assert(lemmas.includes("biertje") && lemmas.includes("graag"), `main: ${lemmas}`);
  assert(!lemmas.includes("ik") && !lemmas.includes("een"), `little words among the main ones: ${lemmas}`);
  assert(phrase.main.length <= TRANSLATE_LIMITS.mainWords, "at most the limit");
  for (const m of phrase.main) {
    assert(m.en, `${m.lemma} has its meaning`);
    assert(m.sentences.length > 0 && m.sentences.length <= TRANSLATE_LIMITS.examplesOne, `${m.lemma}'s sentences: ${m.sentences.length}`);
    for (const s of m.sentences) assert(s.item?.words.some(([, l]) => l === m.lemma), `${m.lemma} isn't in "${s.text}"`);
  }
  const biertje = phrase.main.find((m) => m.lemma === "biertje");
  assert(biertje.sentences[0].own, "the sentence written for a word comes first");
  // Nothing but common words typed: they're what there is.
  assert(search(DUTCH_INDEX, "ik ben", { from: "nl", to: "en" }).main.length > 0, "common words alone still show");
  // One word, however common.
  eq(search(DUTCH_INDEX, "ik", { from: "nl", to: "en" }).main.map((m) => m.lemma), ["ik"]);
  // From English: the main words are the language's words.
  const back = search(DUTCH_INDEX, "the beer", { from: "en", to: "nl" });
  assert(back.main.some((m) => m.lemma === "bier"), `from English: ${back.main.map((m) => m.lemma)}`);
  // A whole sentence has main words too, and never itself as an example.
  const line = DUTCH[0].items[40];
  const text = line.words.map(([t]) => t).join(" ") + (line.punct ?? "");
  const whole = search(DUTCH_INDEX, text, { from: "nl", to: "en" });
  assert(whole.whole && whole.main.length > 0, "a whole sentence's main words");
  for (const m of whole.main) assert(!m.sentences.some((s) => s.text === text), "the sentence itself isn't its own example");
});

test("the best guess: the sentence, the word, the labeled word-by-word line, or nothing", () => {
  eq(firstSense("to want"), "want");
  eq(firstSense("the (common-gender nouns and all plurals)"), "the");
  eq(firstSense("a, an; one"), "a");
  eq(firstSense("beer (a glass or bottle)"), "beer");
  eq(firstSense("I; me"), "I");
  eq(firstSense(null), null);
  const index = buildIndex([packSource(STARTER, "Lexicommons")]);
  const sentence = STARTER.items[0];
  const text = sentence.words.map(([t]) => t).join(" ") + (sentence.punct ?? "");
  const fromNl = bestGuess(search(index, text, { from: "nl", to: "en" }));
  eq([fromNl.kind, fromNl.rough, fromNl.text, fromNl.said], ["sentence", false, sentence.means, text]);
  const fromEn = bestGuess(search(index, sentence.means, { from: "en", to: "nl" }));
  eq([fromEn.kind, fromEn.rough, fromEn.text], ["sentence", false, text]);
  const one = bestGuess(search(index, "boek", { from: "nl", to: "en" }));
  eq([one.kind, one.rough, one.word.lemma], ["word", false, "boek"]);
  const nothing = bestGuess(search(index, "xyzzyq", { from: "nl", to: "en" }));
  eq(nothing.kind, "none");
  if (!DUTCH.length) return;
  const line = bestGuess(search(DUTCH_INDEX, "ik wil graag een biertje", { from: "nl", to: "en" }));
  eq([line.kind, line.rough], ["line", true]);
  eq(line.parts.map((p) => p.text).join(" "), "I want gladly a beer");
  assert(line.parts.every((p) => p.found), "every word found");
  const partly = bestGuess(search(DUTCH_INDEX, "ik wil xyzzyq", { from: "nl", to: "en" }));
  eq(partly.parts.map((p) => [p.text, p.found]), [["I", true], ["want", true], ["xyzzyq", false]]);
  const english = bestGuess(search(DUTCH_INDEX, "I want a beer", { from: "en", to: "nl" }));
  assert(english.kind === "line" && english.parts.some((p) => p.text === "bier"), `from English: ${JSON.stringify(english.parts)}`);
});

test("merged with the server's: its alternatives and main words fill in, nothing twice", () => {
  const a = search(buildIndex([packSource({ ...DE, id: "a", language: "nl", chunks: {}, items: [], words: { aa: "fine", bb: "fine", cc: "fine", dd: "fine" } }, "x")]), "fine", { from: "en", to: "nl" });
  const b = search(buildIndex([packSource({ ...DE, id: "b", language: "nl", chunks: {}, items: [item("Dit is ee.", [["Dit", "dit"], ["ee", "ee"]])], words: { aa: "fine", dd: "fine", ee: "fine", dit: "this" } }, "x")]), "fine", { from: "en", to: "nl" });
  const merged = mergeResults(a, b);
  eq(merged.alternatives.map((w) => w.lemma).sort(), ["dd"].concat(merged.words.some((w) => w.lemma === "ee") ? [] : ["ee"]).sort());
  assert(merged.main.some((m) => m.lemma === "aa"), "the first's main word stays");
});

// ---------- how common a word is: only a word series says ----------

const PATH_NL = existsSync(join(HERE, "../packs/path-nl.json")) ? JSON.parse(readFileSync(join(HERE, "../packs/path-nl.json"), "utf8")) : null;
if (PATH_NL) {
  const lexi = (pack) => packSource(pack, "Lexicommons");
  const leadIn = (index, word) => search(index, word, { from: "en", to: "nl", language: "nl" }).words[0]?.lemma;
  const withPath = buildIndex([STARTER, ...DUTCH, PATH_NL].map(lexi));
  test("a lesson pack has no say in how common a word is: girl leads with meisje, kill with doden, hi with hoi", () => {
    eq(["girl", "kill", "hi"].map((word) => leadIn(withPath, word)), ["meisje", "doden", "hoi"]);
  });
  test("every word the lead table chooses leads, and its own gloss says what it's chosen for", () => {
    const table = READINGS.nl.lead;
    const glossOf = (lemma) => [...DUTCH, STARTER].map((pack) => pack.words?.[lemma]).filter(Boolean);
    const empty = Object.entries(table).filter(([word, lemma]) => !glossOf(lemma).some((gloss) => glossKeys(gloss).includes(word))).map(([word, lemma]) => `${word} → ${lemma}: ${glossOf(lemma)[0] ?? "no gloss"}`);
    eq(empty, []);
    eq(Object.keys(table).filter((word) => leadIn(withPath, word) !== table[word]).map((word) => [word, leadIn(withPath, word), table[word]]), []);
  });
  test("lessons rebuilt in another order change no lead", () => {
    const reversed = buildIndex([STARTER, ...DUTCH, { ...PATH_NL, items: [...PATH_NL.items].reverse() }].map(lexi));
    const words = [...new Set(DUTCH.flatMap((pack) => Object.values(pack.words).slice(0, 300).map((gloss) => glossKeys(gloss)[0])))].filter(Boolean);
    const moved = words.filter((word) => leadIn(withPath, word) !== leadIn(reversed, word));
    eq(moved, []);
  });
  test("nor has a shared pack, whatever it's named: it can't put a word first by coming first", () => {
    const item = DUTCH[0].items.find((one) => Number.isInteger(one.gap?.index) && one.words[one.gap.index][1] === "meid");
    ok(item, "a sentence of band 1 for meid");
    const shared = (id) => ({ id: `pack:${id}`, kind: "pack", name: id, credit: "Shared in Explore by someone", language: "nl", items: [item], words: { meid: "girl; maid" }, chunks: {} });
    for (const id of ["aaa-first", "words-aaa", "words-nl-00"]) eq(leadIn(buildIndex([shared(id), STARTER && lexi(STARTER), ...DUTCH.map(lexi)]), "girl"), "meisje", id);
  });
  test("a language with no word series goes by its other packs, lessons left out", () => {
    const of = (id, lemma, en) => ({ id: `pack:${id}`, kind: "pack", name: id, credit: "Lexicommons", language: "de", words: { [lemma]: en }, chunks: {}, items: [{ id: `${id}-1`, words: [["Ein", null], [lemma, lemma]], punct: ".", means: `A ${en}.`, gap: { index: 1, options: [lemma, "x"] } }] });
    const index = buildIndex([of("path-de", "Maid", "girl"), of("starter-de", "Mädchen", "girl")]);
    eq(search(index, "girl", { from: "en", to: "de", language: "de" }).words[0]?.lemma, "Mädchen");
  });
}

// A pack sent to the index's worker a part of its sentences at a time (translate.js make, worker.js more) is the pack sent whole: the same
// index, every answer the same. The worker's own code, its self stood in; a part left out is the control that it can tell.
const workerSaid = [];
globalThis.self = { postMessage: (message) => workerSaid.push(message) };
await import("../public/js/translate/worker.js");
// The worker builds a piece at a time and answers a look sent meanwhile once it's built: each look waited for by its own answer.
const answerOf = async (said, id) => {
  for (let i = 0; i < 4000; i++) {
    const found = said.find((m) => m.type === "looked" && m.id === id);
    if (found) return found.look;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`no answer to look ${id}`);
};
let lookId = 0;
await testAsync("a pack sent to the worker in parts is the pack sent whole: every answer the same, and one with a part left out isn't", async () => {
  const send = (data) => globalThis.self.onmessage({ data });
  const sources = DUTCH.slice(0, 3).map((pack) => ({ id: `pack:${pack.id}`, kind: "pack", name: pack.name, credit: "Lexicommons", language: pack.language, items: pack.items, words: pack.words, chunks: pack.chunks }));
  const queries = ["hallo", "de hond loopt naar huis", "ik wil graag een biertje", "girl", "to say", "thee", "huis", "where is the station", "zeggen", "allemaal"];
  const PART = 200;
  const answers = (key, { parts = false, leaveOut = -1 } = {}) => {
    send({ type: "begin", key, keep: [] });
    for (const source of sources) {
      if (!parts) {
        send({ type: "source", source });
        continue;
      }
      send({ type: "source", source: { ...source, items: source.items.slice(0, PART) } });
      for (let from = PART, n = 0; from < source.items.length; from += PART, n++) if (n !== leaveOut) send({ type: "more", id: source.id, items: source.items.slice(from, from + PART) });
    }
    send({ type: "end", key, order: sources.map((source) => source.id) });
    const ids = queries.map((text) => {
      const id = ++lookId;
      send({ type: "look", id, text, options: {} });
      return id;
    });
    return Promise.all(ids.map((id) => answerOf(workerSaid, id)));
  };
  const whole = await answers("whole");
  ok(sources.every((source) => source.items.length > 3 * PART), "each pack comes in several parts");
  eq(await answers("parts", { parts: true }), whole);
  ok(JSON.stringify(await answers("a part left out", { parts: true, leaveOut: 2 })) !== JSON.stringify(whole), "an index missing a part answers differently");
});

// The build a piece at a time (worker.js, engine.js buildIndexSteps): a look sent while the index is made waits and is answered from it, the
// same as from an index made at once; the worker never holds its thread for a whole build (the control: buildIndex at once, timed here); a
// newer build while one is made leaves one "built", the newest; a new set of sources (begin) drops the build under way.
await testAsync("an index made a piece at a time: a look meanwhile answered from it once built, as from one made at once; no hold near a whole build's; a newer build or a new set drops the one under way", async () => {
  const { buildIndex, lookBothWays } = await import("../public/js/translate/engine.js");
  const send = (data) => globalThis.self.onmessage({ data });
  const sources = DUTCH.slice(0, 4).map((pack) => ({ id: `pack:${pack.id}`, kind: "pack", name: pack.name, credit: "Lexicommons", language: pack.language, items: pack.items, words: pack.words, chunks: pack.chunks }));
  const order = sources.map((x) => x.id);
  const t0 = performance.now();
  const atOnce = buildIndex(sources);
  const wholeMs = performance.now() - t0;
  const builtSince = (from) => workerSaid.slice(from).filter((m) => m.type === "built");
  // The longest the event loop is held while the worker builds: a tick every ms and the gaps between them.
  let last = performance.now();
  let worst = 0;
  let going = true;
  const tick = () => {
    const now = performance.now();
    worst = Math.max(worst, now - last);
    last = now;
    if (going) setTimeout(tick, 1);
  };
  setTimeout(tick, 1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  const from = workerSaid.length;
  send({ type: "begin", key: "pieces", keep: [] });
  for (const source of sources) send({ type: "source", source });
  send({ type: "end", key: "pieces", order });
  const id = ++lookId;
  send({ type: "look", id, text: "ik wil graag een biertje", options: {} });
  ok(!workerSaid.slice(from).some((m) => m.type === "looked" && m.id === id), "a look sent while the index is made was answered before it was built");
  const look = await answerOf(workerSaid, id);
  going = false;
  const builtAt = workerSaid.findIndex((m, i) => i >= from && m.type === "built");
  const lookedAt = workerSaid.findIndex((m) => m.type === "looked" && m.id === id);
  ok(builtAt >= 0 && lookedAt > builtAt, "the look was answered before the index said it was built");
  eq(look, lookBothWays(atOnce, "ik wil graag een biertje", {}));
  ok(worst < Math.max(25, wholeMs / 4), `the worker held the loop ${worst.toFixed(0)} ms at most; a whole build at once takes ${wholeMs.toFixed(0)} ms`);
  // A newer build while one is made: one "built", the newest.
  const before = workerSaid.length;
  send({ type: "begin", key: "older", keep: order });
  send({ type: "end", key: "older", order });
  send({ type: "end", key: "newer", order: order.slice(0, 2) });
  const id2 = ++lookId;
  send({ type: "look", id: id2, text: "huis", options: {} });
  await answerOf(workerSaid, id2);
  eq(builtSince(before).map((m) => m.key), ["newer"]);
  // A new set of sources while one is made: the build under way never says it's built.
  const before3 = workerSaid.length;
  send({ type: "end", key: "dropped", order });
  send({ type: "begin", key: "next", keep: order });
  send({ type: "end", key: "next", order });
  const id3 = ++lookId;
  send({ type: "look", id: id3, text: "huis", options: {} });
  await answerOf(workerSaid, id3);
  eq(builtSince(before3).map((m) => m.key), ["next"]);
});

// The index a worker keeps on the device (worker.js, IndexedDB) and a worker started again reads back instead of being sent every pack: the
// worker's own code on a stand-in IndexedDB (one store, values copied as the real one copies them), its self stood in.
{
  const kept = new Map();
  const reads = [];
  const puts = []; // the key of each index written (a burst writes one, not one each)
  const standIn = {
    open() {
      const request = {};
      const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore() {},
        transaction: () => ({
          objectStore: () => ({
            get(key) {
              reads.push(key);
              const r = {};
              setTimeout(() => ((r.result = kept.has(key) ? structuredClone(kept.get(key)) : undefined), r.onsuccess?.()), 0);
              return r;
            },
            put(value, key) {
              const r = {};
              if (key === "last") puts.push(value.key);
              setTimeout(() => (kept.set(key, structuredClone(value)), r.onsuccess?.()), 0);
              return r;
            },
          }),
        }),
      };
      setTimeout(() => {
        request.result = db;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      }, 0);
      return request;
    },
  };
  globalThis.indexedDB = standIn;
  const said = [];
  const asWorker = async (copy) => {
    globalThis.self = { postMessage: (message) => said.push(message) };
    await import(`../public/js/translate/worker.js?${copy}`);
    const handle = globalThis.self.onmessage;
    return (data) => handle({ data });
  };
  const until = async (test) => {
    for (let i = 0; i < 2000; i++) {
      const found = test();
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    return null;
  };
  const sources = DUTCH.slice(0, 2).map((pack) => ({ id: `pack:${pack.id}`, kind: "pack", name: pack.name, credit: "Lexicommons", language: pack.language, items: pack.items, words: pack.words, chunks: pack.chunks }));
  const queries = ["hallo", "ik wil graag een biertje", "girl", "to say", "huis", "zeggen"];
  const looks = (send) =>
    Promise.all(
      queries.map((text) => {
        const id = ++lookId;
        send({ type: "look", id, text, options: {} });
        return answerOf(said, id);
      }),
    );
  // A worker builds it from the packs, and keeps it.
  const first = await asWorker("first");
  first({ type: "begin", key: "a", keep: [] });
  for (const source of sources) first({ type: "source", source });
  // Two builds in a row (a burst): the first is never written, the second is, once it has stood (worker.js KEEP_AFTER).
  first({ type: "end", key: "z", order: sources.map((x) => x.id), kept: "kept-z" });
  first({ type: "end", key: "a", order: sources.map((x) => x.id), kept: "kept-a" });
  const built = await looks(first);
  const keptOne = await until(() => kept.get("last"));
  const keyOne = kept.get("key");
  const writes = [...puts];
  // A worker started again: read back, no pack sent.
  const again = await asWorker("again");
  again({ type: "load", id: 1, key: "a", kept: "kept-a" });
  const loaded = await until(() => said.find((m) => m.type === "loaded" && m.id === 1));
  const readBack = await looks(again);
  // Asked for another set of packs: nothing read back.
  const other = await asWorker("other");
  reads.length = 0;
  other({ type: "load", id: 2, key: "b", kept: "kept-b" });
  const missed = await until(() => said.find((m) => m.type === "loaded" && m.id === 2));
  const readsOfMiss = [...reads];
  // With nothing kept (the control): nothing read back either.
  kept.clear();
  const empty = await asWorker("empty");
  empty({ type: "load", id: 3, key: "a", kept: "kept-a" });
  const none = await until(() => said.find((m) => m.type === "loaded" && m.id === 3));
  delete globalThis.indexedDB;
  test("the index a worker keeps on the device is read back by a worker started again, answering as the one built; two builds in a row keep only the last, once; packs of another key, or nothing kept, read nothing back", () => {
    ok(keptOne?.key === "kept-a" && keyOne === "kept-a", "the built index was kept under its key, and the key in a record of its own");
    eq(writes, ["kept-a"]);
    ok(!readsOfMiss.includes("last"), `another key read the index itself: ${readsOfMiss.join(", ")}`);
    ok(Array.isArray(loaded?.languages) && loaded.languages.includes("nl"), `read back: ${JSON.stringify(loaded)}`);
    eq(readBack, built);
    ok(missed && missed.languages === null, `another key: ${JSON.stringify(missed)}`);
    ok(none && none.languages === null, `nothing kept: ${JSON.stringify(none)}`);
  });
}

// The index is kept once looks have stopped (worker.js KEEP_QUIET): its write is one long piece of the worker's, and a key typed during it
// waited for it (translate-check's speed, 7 Nov 2026: three keys over 100 ms, the worker busy keeping). Looks every 250 ms for 6.5 s, past
// KEEP_AFTER: nothing written meanwhile, then written about KEEP_QUIET after the last one. The worker from before writes at KEEP_AFTER.
{
  const puts = [];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  globalThis.indexedDB = {
    open() {
      const request = {};
      const db = {
        objectStoreNames: { contains: () => true },
        createObjectStore() {},
        transaction: () => ({
          objectStore: () => ({
            get() {
              const r = {};
              setTimeout(() => ((r.result = undefined), r.onsuccess?.()), 0);
              return r;
            },
            put(value, key) {
              const r = {};
              if (key === "last") puts.push({ key: value.key, at: performance.now() });
              setTimeout(() => r.onsuccess?.(), 0);
              return r;
            },
          }),
        }),
      };
      setTimeout(() => {
        request.result = db;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      }, 0);
      return request;
    },
  };
  const said = [];
  globalThis.self = { postMessage: (message) => said.push(message) };
  await import("../public/js/translate/worker.js?quiet-keep");
  const handle = globalThis.self.onmessage;
  const send = (data) => handle({ data });
  const sources = DUTCH.slice(0, 1).map((pack) => ({ id: `pack:${pack.id}`, kind: "pack", name: pack.name, credit: "Lexicommons", language: pack.language, items: pack.items, words: pack.words, chunks: pack.chunks }));
  send({ type: "begin", key: "q", keep: [] });
  for (const source of sources) send({ type: "source", source });
  send({ type: "end", key: "q", order: sources.map((x) => x.id), kept: "kept-q" });
  for (let i = 0; i < 2000 && !said.some((m) => m.type === "built" && m.key === "q"); i++) await sleep(5);
  const builtAt = performance.now();
  let lastLookAt = builtAt;
  while (performance.now() - builtAt < 6500) {
    send({ type: "look", id: ++lookId, text: "hallo", options: {} });
    lastLookAt = performance.now();
    await sleep(250);
  }
  const whileLooking = puts.filter((p) => p.at <= lastLookAt + 1).length;
  for (let i = 0; i < 1200 && !puts.length; i++) await sleep(5);
  delete globalThis.indexedDB;
  test("an index is kept once looks have stopped (worker.js KEEP_QUIET), never while they keep coming past KEEP_AFTER (a key typed during the write waited for it)", () => {
    eq(whileLooking, 0);
    ok(puts.length === 1 && puts[0].key === "kept-q", `kept: ${JSON.stringify(puts)}`);
    const after = puts[0].at - lastLookAt;
    ok(after >= 1900 && after < 3500, `kept ${Math.round(after)} ms after the last look (KEEP_QUIET is 2000)`);
  });
}

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
