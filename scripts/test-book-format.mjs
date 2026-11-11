#!/usr/bin/env node
// The book and weave contract (public/js/read/book-format.js), case by case. Every fixture is made up for the test.
// Cases marked "ledger" are defect classes that shipped in an earlier diglot pipeline; each must fail here (or, for
// rules that would also reject right answers, must pass here and be left to the audit). Exit 0 = pass.

import assert from "node:assert/strict";
import {
  tokenize, splitWords, segmentSentences, bookVersion, sentenceHash, validateBook, validateWeave, sentenceProblems,
  movedOf, englishOrderOf, literalLineOf, weaveSentence, weaveAt, coverageOf, frameOf, helpSentence, helpLiteralLineOf,
  validateFrequency, everydayShare, frequencyRanks, picturePath, coverPicture, rightsProblems, joinsNext, joinWords, gapBetween,
  validateDefinitions, DEFINITION_POS, glossFrame,
  LANGUAGES, layerCredit, MADE_WITH_AI,
} from "../public/js/read/book-format.js";
import { auditWeave } from "../public/js/read/weave-audit.js";
import { bookFromText } from "../public/js/read/import-text.js";

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
  } catch (error) {
    failures.push(`${name}\n    ${error.message.split("\n").join("\n    ")}`);
  }
}

// ---------- tokenize ----------

await test("tokenize: whitespace tokens keep their punctuation", () => {
  assert.deepEqual(tokenize("“Oh dear! Oh dear!” said  the\nRabbit."), ["“Oh", "dear!", "Oh", "dear!”", "said", "the", "Rabbit."]);
});
await test("ledger: a dash joining two words splits after the dash", () => {
  assert.deepEqual(tokenize("it—but she—"), ["it—", "but", "she—"]);
  assert.deepEqual(tokenize("Ha—ha—ha!"), ["Ha—", "ha—", "ha!"]);
  assert.deepEqual(tokenize("well…but"), ["well…", "but"]);
  assert.deepEqual(tokenize("said—“Oh"), ["said—", "“Oh"]);
});
await test("tokenize: a leading or trailing dash stays, and an en dash between digits stays", () => {
  assert.deepEqual(tokenize("—but then 1832–1898 and left–right"), ["—but", "then", "1832–1898", "and", "left–", "right"]);
});
await test("tokenize: hyphens and apostrophes are part of a word", () => {
  assert.deepEqual(tokenize("rabbit-hole don’t ’tis"), ["rabbit-hole", "don’t", "’tis"]);
});
await test("tokenize: no-break spaces split, invisible characters go", () => {
  assert.deepEqual(tokenize("Mr. Smith said⁠—no­"), ["Mr.", "Smith", "said—", "no"]);
});
// ---------- a language written without spaces ----------

const fixedBook = async (lang, words) => {
  const book = { format: "lexicommons-book", v: 1, id: `test-${lang}`, title: "T", authors: [], lang, rights: null, words, italic: [], paras: [{ k: "p", s: 0, e: words.length }], chapters: [] };
  book.sentences = segmentSentences(book.words, book.paras, lang);
  book.version = await bookVersion(book);
  return book;
};
await test("a Japanese and a Chinese book validate: their words are their writer's split, never tokenized", async () => {
  assert.deepEqual(await validateBook(await fixedBook("ja", ["私", "は", "公園", "で", "本", "を", "読みます。"])), []);
  assert.deepEqual(await validateBook(await fixedBook("zh", ["我", "在", "公园", "看书。"])), []);
  assert.throws(() => tokenize("私は公園で本を読みます。", "ja"), /written without spaces/);
});
await test("a Japanese word with a space or an invisible character in it is still refused", async () => {
  const spaced = await validateBook(await fixedBook("ja", ["私", "は 公園", "で"]));
  assert.ok(spaced.some((p) => /word 1 must be text with no spaces/.test(p)), spaced.join("; "));
  const invisible = await validateBook(await fixedBook("ja", ["私", "は\u200b", "公園"]));
  assert.ok(invisible.some((p) => /word 1 must be text with no spaces or invisible/.test(p)), invisible.join("; "));
});
await test("the control: a Dutch word tokenize() would split is still refused", async () => {
  const problems = await validateBook(await fixedBook("nl", ["Ik", "drink", "koffie—maar", "nu."]));
  assert.ok(problems.some((p) => /word 2 .*isn't one token/.test(p)), problems.join("; "));
});
await test("splitWords: a text someone brings in, in a language written without spaces, split once by the engine's word breaker", async () => {
  const ja = splitWords("今日はいい天気です。「私は公園で本を読みます」と言った。\n  Hello world!", "ja");
  assert.equal(ja.join(""), "今日はいい天気です。「私は公園で本を読みます」と言った。Helloworld!");
  assert.ok(ja.length >= 10 && ja.every((w) => w && !/\s/u.test(w)), JSON.stringify(ja));
  // A mark goes with the word before it, an opening bracket with the word it opens: none stands alone, so sentences still end on a word.
  assert.ok(!ja.some((w) => /^[。、」！？.!]+$/u.test(w) || /[「『（]$/u.test(w)), JSON.stringify(ja));
  assert.ok(ja.some((w) => w.startsWith("「")) && ja.some((w) => w.endsWith("。")));
  const book = await fixedBook("ja", ja);
  assert.deepEqual(await validateBook(book), []);
  assert.ok(book.sentences.length >= 2, `sentences: ${JSON.stringify(book.sentences)}`);
  const zh = splitWords("今天天气很好。我在公园看书。", "zh");
  assert.equal(zh.join(""), "今天天气很好。我在公园看书。");
  assert.ok(zh.length >= 4);
  // A language written with spaces goes to tokenize(), unchanged.
  assert.deepEqual(splitWords("Ik drink koffie—maar niet nu.", "nl"), tokenize("Ik drink koffie—maar niet nu.", "nl"));
});

await test("a pasted Japanese or Chinese text comes in as a book: split into words, its sentences found, its title joined with no spaces", async () => {
  const ja = await bookFromText("今日はいい天気です。私は公園で本を読みます。\n\n明日は学校に行きます。", { lang: "ja" });
  assert.equal(ja.lang, "ja");
  assert.ok(ja.words.length >= 12 && ja.paras.length === 2 && ja.sentences.length === 3, `${ja.words.length} words, ${ja.paras.length} paragraphs, ${ja.sentences.length} sentences`);
  assert.ok(!/\s/u.test(ja.title) && ja.title.startsWith("今日は"), `title: ${ja.title}`);
  assert.deepEqual(await validateBook(ja), []);
  const zh = await bookFromText("今天天气很好。我在公园看书。", { lang: "zh" });
  assert.ok(zh.words.length >= 4 && zh.sentences.length === 2, `${zh.words.length} words, ${zh.sentences.length} sentences`);
  // The control: read as English (the importer from before, for a file), a paragraph is one word.
  const asEnglish = await bookFromText("今日はいい天気です。私は公園で本を読みます。", { lang: "en" });
  assert.equal(asEnglish.words.length, 1);
});

await test("tokenize: every word it makes is a fixed point", () => {
  const words = tokenize("“Well!” thought Alice—to herself—“after such a fall as this, I shall think nothing of tumbling down stairs!”");
  for (const word of words) assert.deepEqual(tokenize(word), [word]);
});

// ---------- sentences ----------

const para = (words, k = "p") => [{ k, s: 0, e: words.length }];
const sentencesOf = (text, lang = "en") => {
  const words = tokenize(text);
  return segmentSentences(words, para(words), lang).map(([s, e]) => words.slice(s, e).join(" "));
};

await test("sentences: break at an end mark before a capital", () => {
  assert.deepEqual(sentencesOf("She was tired. So she sat down! Was it late?"), ["She was tired.", "So she sat down!", "Was it late?"]);
});
await test("sentences: dialogue attribution stays with its quote", () => {
  assert.deepEqual(sentencesOf("“What is the use of a book,” thought Alice, “without pictures?” So she considered."), [
    "“What is the use of a book,” thought Alice, “without pictures?”",
    "So she considered.",
  ]);
});
await test("sentences: abbreviations and initials don't end a sentence", () => {
  assert.deepEqual(sentencesOf("Mr. Smith met J. M. Barrie. They talked."), ["Mr. Smith met J. M. Barrie.", "They talked."]);
});
await test("sentences: Georgian (no capitals) breaks after its end marks; Armenian after its full stop ։, before a capital", () => {
  assert.deepEqual(sentencesOf("გამარჯობა! როგორ ხარ? კარგად ვარ.", "ka"), ["გამარჯობა!", "როგორ ხარ?", "კარგად ვარ."]);
  assert.deepEqual(sentencesOf("Բարև։ Ինչպե՞ս ես։ Լավ եմ։", "hy"), ["Բարև։", "Ինչպե՞ս ես։", "Լավ եմ։"]);
  assert.deepEqual(sentencesOf("Ես տանն եմ։ ու դու՞", "hy"), ["Ես տանն եմ։ ու դու՞"]);
});
await test("sentences: Hawaiian breaks before a sentence that starts with the ʻokina and a capital (ʻO)", () => {
  assert.deepEqual(sentencesOf("Aloha. ʻO wai kou inoa? Pehea ʻoe?", "haw"), ["Aloha.", "ʻO wai kou inoa?", "Pehea ʻoe?"]);
  assert.deepEqual(sentencesOf("Aloha. ʻo ia.", "haw"), ["Aloha. ʻo ia."]);
});
await test("sentences: a lowercase word after an end mark doesn't start a new sentence", () => {
  assert.deepEqual(sentencesOf("“Oh dear! oh dear!” she said."), ["“Oh dear! oh dear!” she said."]);
});
await test("sentences: never cross a paragraph, and skip scene breaks", () => {
  const words = tokenize("One two three four");
  const paras = [{ k: "h", s: 0, e: 1 }, { k: "scene", s: 1, e: 1 }, { k: "p", s: 1, e: 4 }];
  assert.deepEqual(segmentSentences(words, paras, "en"), [[0, 1], [1, 4]]);
});
await test("tokens: a dash before a straight quote opens a word when a letter follows, and closes one otherwise", () => {
  assert.deepEqual(tokenize(`Mr. McGregor—"I have a plan," she said—'Kertyschoo!'`, "en"), ["Mr.", "McGregor—", `"I`, "have", "a", "plan,\"", "she", "said—", "'Kertyschoo!'"]);
  assert.deepEqual(tokenize(`one, two, three—" and then`, "en"), ["one,", "two,", `three—"`, "and", "then"]);
  assert.deepEqual(tokenize(`it—but “no”—“yes”`, "en"), ["it—", "but", "“no”—", "“yes”"], "curly quotes as before");
});
await test("joins: words tokenize() split at a dash or an ellipsis are shown together again, as written", () => {
  for (const text of ["the right distance—but then", "“—yes, that’s it", "it—“no”—and Mr. McGregor—\"I have", "wait…what", "London–Paris", "said,—'Kertyschoo!'"]) {
    assert.equal(joinWords(tokenize(text, "en")), text, `round trip: ${text}`);
  }
  // A dash with spaces round it is a word of its own, and keeps them; a closing quote after a dash closes.
  for (const text of ["it — but", "one, two, three—\" and then", "1832–1898 was long", "— a dash first"]) {
    assert.equal(joinWords(tokenize(text, "en")), text, `kept: ${text}`);
  }
  assert.equal(joinsNext("distance—", "but"), true);
  assert.equal(joinsNext("—", "but"), false, "a dash alone is its own word");
  assert.equal(joinsNext("distance,", "but"), false);
  assert.equal(joinWords(["に", "行く"], ""), "に行く", "a language written without spaces");
});
await test("gaps: French spaces a mark as France does (one rule with typeset); other languages and joins as before", () => {
  const NNBSP = "\u202F", NBSP = "\u00A0";
  assert.equal(gapBetween("viens", "?", "fr"), NNBSP);
  assert.equal(gapBetween("Attention", ":", "fr"), NBSP);
  assert.equal(gapBetween("viens", "?", "en"), " ", "English keeps a plain space");
  assert.equal(gapBetween("viens", "demain", "fr"), " ");
  assert.equal(gapBetween("lui—", "mais", "fr"), "", "a dash join stays joined");
  assert.equal(joinWords(["Tu", "viens", "?"], " ", "fr"), `Tu viens${NNBSP}?`);
  assert.equal(joinWords(["Tu", "viens?"], " ", "fr"), `Tu viens${NNBSP}?`, "inside a word too");
  assert.equal(joinWords(["Il", "est", "10:30."], " ", "fr"), "Il est 10:30.", "a time keeps its colon");
  assert.equal(joinWords(["Tu", "viens", "?"]), "Tu viens ?", "without a language, plain spaces");
  assert.equal(joinWords(["Tu", "viens", "?"], " ", "nl"), "Tu viens ?", "a language without spaceBefore");
});
await test("sentences: Dutch abbreviations", () => {
  assert.deepEqual(sentencesOf("Hij kwam bijv. morgen. Dat is goed.", "nl"), ["Hij kwam bijv. morgen.", "Dat is goed."]);
});
await test("sentences: a language's own end marks (Greek's ;, Hindi's ।), and a next word in a script with no capitals", () => {
  // A language with endings of its own, in the registry for this test only.
  LANGUAGES.xg = { name: "Endings test", locale: "xg-XG", segmenter: "spaces", separator: " ", lemmaCase: "lower", abbreviations: [], ends: [";", "।"], patterns: {} };
  try {
    assert.deepEqual(sentencesOf("Τι κάνεις; Καλά, ευχαριστώ.", "xg"), ["Τι κάνεις;", "Καλά, ευχαριστώ."]);
    assert.deepEqual(sentencesOf("मैं घर जा रहा हूँ। तुम कहाँ हो?", "xg"), ["मैं घर जा रहा हूँ।", "तुम कहाँ हो?"]);
    assert.deepEqual(sentencesOf("Τι κάνεις; καλά.", "xg"), ["Τι κάνεις; καλά."]);
    // Other languages: ; stays a semicolon and । isn't an ending.
    assert.deepEqual(sentencesOf("She waited; Then she left.", "en"), ["She waited; Then she left."]);
    assert.deepEqual(sentencesOf("मैं घर जा रहा हूँ। तुम कहाँ हो?", "en"), ["मैं घर जा रहा हूँ। तुम कहाँ हो?"]);
    // A caseless letter after a full stop starts a sentence, in any language.
    assert.deepEqual(sentencesOf("He said namaste. नमस्ते means hello.", "en"), ["He said namaste.", "नमस्ते means hello."]);
  } finally {
    delete LANGUAGES.xg;
  }
});

// ---------- a valid book ----------

async function makeBook(text = "Alice was tired. She sat down.", { id = "test-book", lang = "en" } = {}) {
  const words = tokenize(text, lang);
  const paras = [{ k: "p", s: 0, e: words.length }];
  const book = {
    format: "lexicommons-book", v: 1, id, version: "", title: "Test", authors: [], lang,
    source: { kind: "paste" }, rights: { us: true, eu: true, basis: "made for the test", licence: "CC0-1.0" },
    words, italic: [], paras, chapters: [{ title: "One", para: 0 }], sentences: segmentSentences(words, paras, lang),
  };
  book.version = await bookVersion(book);
  return book;
}

await test("book: a valid book passes", async () => {
  assert.deepEqual(await validateBook(await makeBook()), []);
});
await test("book: the version is a content hash, and changes with the words", async () => {
  const a = await makeBook("Alice was tired.");
  const b = await makeBook("Alice was sleepy.");
  assert.match(a.version, /^[0-9a-f]{16}$/);
  assert.notEqual(a.version, b.version);
  assert.equal(a.version, await bookVersion({ ...a, title: "Another title" }), "the title isn't content");
});
await test("book: a stale version fails", async () => {
  const book = await makeBook();
  book.words[0] = "Alicia";
  assert.ok((await validateBook(book)).some((e) => e.includes("version must be the content hash")));
});
await test("ledger: a word tokenize() would split fails", async () => {
  const book = await makeBook();
  book.words[1] = "was—tired";
  assert.ok((await validateBook(book)).some((e) => e.includes("isn't one token")));
});
await test("book: paragraphs must tile the words", async () => {
  const book = await makeBook();
  book.paras = [{ k: "p", s: 0, e: 3 }];
  assert.ok((await validateBook(book)).some((e) => e.includes("paragraphs end at word 3")));
});
await test("book: sentences must be segmentSentences()'s", async () => {
  const book = await makeBook();
  book.sentences = [[0, book.words.length]];
  assert.ok((await validateBook(book)).some((e) => e.includes("segmentSentences")));
});

// ---------- a valid weave ----------

// "Alice was tired. She sat down." → "Alice was moe. Ze ging zitten."
async function makeWeave(book) {
  const sentences = [];
  const data = [
    {
      t: [["Alice", null], ["was", "zijn"], ["moe.", "moe"]],
      text: "Alice was moe.",
      m: [["Alice", "Alice", [0], null], ["was", "was", [1], "zijn"], ["moe.", "tired", [2], "moe"]],
      c: [],
    },
    {
      t: [["Ze", "zij"], ["ging zitten", "gaan"], ["neer.", "neer"]],
      text: "Ze ging zitten.",
      m: [["Ze", "She", [0], "zij"], ["ging", "sat", [1], "gaan"], ["zitten.", "down", [1, 2], "zitten"]],
      u: [[1, 2, "ging zitten."]],
    },
  ];
  for (const [x, [s, e]] of book.sentences.entries()) sentences.push({ s, e, h: await sentenceHash(book.words, s, e), ...data[x] });
  return {
    format: "lexicommons-weave", v: 1, kind: "weave", book: book.id, bookVersion: book.version, from: "en", to: "nl",
    variant: "nl-NL", licence: "CC BY-SA 4.0", made: { pipeline: "test" }, sentences,
  };
}
const clone = (x) => structuredClone(x);
const problemsOf = async (book, weave, options) => validateWeave(weave, book, options);
const BOOK = await makeBook();
const WEAVE = await makeWeave(BOOK);

// ---------- Japanese and Chinese: words split in the file, readings ----------

await test("tokenize: a language written without spaces is never tokenized (its words come split)", () => {
  assert.throws(() => tokenize("私は学生です。", "ja"), /written without spaces/);
  assert.throws(() => tokenize("我们是学生。", "zh"), /written without spaces/);
  assert.deepEqual(tokenize("Alice was tired."), ["Alice", "was", "tired."]);
});
await test("sentences: Japanese breaks after 。 and after 。」, before a word in kana or kanji", () => {
  const words = ["「", "雨", "です。」", "彼", "は", "言いました。", "本当", "です。"];
  assert.deepEqual(segmentSentences(words, para(words), "ja"), [[0, 3], [3, 6], [6, 8]]);
});

// "Alice was tired." woven into Japanese and Chinese, each word with kanji or hanzi carrying its reading.
async function makeCjkWeave(to, t, text, m) {
  const book = await makeBook("Alice was tired.");
  const [s, e] = book.sentences[0];
  const sentences = [{ s, e, h: await sentenceHash(book.words, s, e), t, text, m, c: [] }];
  return { book, weave: { format: "lexicommons-weave", v: 1, kind: "weave", book: book.id, bookVersion: book.version, from: "en", to, licence: "CC BY-SA 4.0", made: { pipeline: "test" }, sentences } };
}
const JA_WEAVE = () =>
  makeCjkWeave(
    "ja",
    [["Alice", null], ["was", null], ["疲れた.", "疲れる", "つかれた"]],
    "アリスは疲れていました。",
    [["アリス", "Alice", [0], null], ["は", "は", [], null], ["疲れていました。", "was tired", [1, 2], "疲れる", "つかれていました"]],
  );
const ZH_WEAVE = () =>
  makeCjkWeave(
    "zh",
    [["Alice", null], ["was", null], ["累了.", "累", "lèi le"]],
    "爱丽丝累了。",
    [["爱丽丝", "Alice", [0], null, "Ài lì sī"], ["累了。", "was tired", [1, 2], "累", "lèi le"]],
  );
await test("weave into Japanese and Chinese: readings fit their words, the literal line tiles with nothing between", async () => {
  for (const make of [JA_WEAVE, ZH_WEAVE]) {
    const { book, weave } = await make();
    assert.deepEqual(await problemsOf(book, weave, { keep: ["Alice"] }), []);
  }
});
await test("weave: a reading whose kana don't fit its word fails", async () => {
  const { book, weave } = await JA_WEAVE();
  weave.sentences[0].t[2][2] = "つかれまして";
  assert.ok((await problemsOf(book, weave)).some((e) => e.includes("doesn't fit")));
  const again = await JA_WEAVE();
  again.weave.sentences[0].m[2][4] = "つかれました";
  assert.ok((await problemsOf(again.book, again.weave)).some((e) => e.includes("literal line entry 2") && e.includes("doesn't fit")));
});
await test("weave: a Japanese word in kana carries no reading", async () => {
  const { book, weave } = await JA_WEAVE();
  weave.sentences[0].m[1] = ["は", "は", [], null, "は"];
  assert.ok((await problemsOf(book, weave)).some((e) => e.includes("is written without kanji")));
});
await test("weave: pinyin needs a syllable per character, with its tone mark in place", async () => {
  const { book, weave } = await ZH_WEAVE();
  weave.sentences[0].t[2][2] = "lèile";
  assert.ok((await problemsOf(book, weave)).some((e) => e.includes("has 1 syllable") && e.includes("2 characters")));
  const again = await ZH_WEAVE();
  again.weave.sentences[0].m[1][4] = "leì le";
  assert.ok((await problemsOf(again.book, again.weave)).some((e) => e.includes("isn't a pinyin syllable")));
});
await test("weave: a reading in a language without readings fails, in t and in m", async () => {
  const weave = clone(WEAVE);
  weave.sentences[0].t[2] = ["moe.", "moe", "moe"];
  weave.sentences[0].m[2] = ["moe.", "tired", [2], "moe", "moe"];
  const problems = await problemsOf(BOOK, weave);
  assert.ok(problems.filter((e) => e.includes("Dutch words don't carry a reading")).length === 2, problems.join(" | "));
});
await test("weave: an entry with more than a reading after it fails", async () => {
  const { book, weave } = await JA_WEAVE();
  weave.sentences[0].t[2] = ["疲れた.", "疲れる", "つかれた", "x"];
  assert.ok((await problemsOf(book, weave)).some((e) => e.includes("t entry must be [target, lemma or null] or [target, lemma or null, reading]")));
});

await test("weave: a valid weave passes", async () => {
  assert.deepEqual(await problemsOf(BOOK, WEAVE, { keep: ["Alice"] }), []);
});
await test("weave: it must be for this book version", async () => {
  const weave = clone(WEAVE);
  weave.bookVersion = "0000000000000000";
  assert.ok((await problemsOf(BOOK, weave)).some((e) => e.includes("This weave is for")));
});
await test("ledger: a word with no gloss fails (a learned word must always appear)", async () => {
  const weave = clone(WEAVE);
  weave.sentences[0].t.pop();
  assert.ok((await problemsOf(BOOK, weave)).some((e) => e.includes("exactly one [target, lemma] per word")));
});
await test("ledger: two words glossed as one fails", async () => {
  const weave = clone(WEAVE);
  weave.sentences[1].t = [["Ze", "zij"], ["ging zitten.", "gaan"]];
  assert.ok((await problemsOf(BOOK, weave)).some((e) => e.includes("exactly one [target, lemma] per word")));
});
await test("weave: punctuation-only words keep their text and a null lemma", async () => {
  const book = await makeBook("Alice — tired.");
  const weave = await makeWeave(book);
  weave.sentences[0] = { ...weave.sentences[0], t: [["Alice", null], ["–", null], ["moe.", "moe"]], text: "Alice – moe.", m: [["Alice", "Alice", [0], null], ["–", "–", [1], null], ["moe.", "tired", [2], "moe"]] };
  weave.sentences.length = 1;
  assert.ok((await problemsOf(book, weave)).some((e) => e.includes("is only punctuation")));
});
await test("ledger: a token with no letters isn't a word to learn", async () => {
  const book = await makeBook("In 1865 she left.");
  const weave = await makeWeave(book);
  weave.sentences = [{ ...weave.sentences[0], t: [["In", "in"], ["1865", "1865"], ["ging", "gaan"], ["weg.", "weg"]], text: "In 1865 ging ze weg.", m: [["In", "In", [0], "in"], ["1865", "1865", [1], null], ["ging", "left", [3], "gaan"], ["ze", "she", [2], "zij"], ["weg.", "away", [3], "weg"]] }];
  assert.ok((await problemsOf(book, weave)).some((e) => e.includes("has no letters, so it isn't a word to learn")));
});
await test("ledger: a lemma joining two words with a dash fails", async () => {
  const weave = clone(WEAVE);
  weave.sentences[0].t[2] = ["moe.", "moe—slaperig"];
  assert.ok((await problemsOf(BOOK, weave)).some((e) => e.includes("dictionary form")));
});
await test("ledger: a lemma's apostrophe is the straight one, so one word is one bank key", async () => {
  const weave = clone(WEAVE);
  weave.sentences[0].t[2] = ["moe.", "zo’n"];
  assert.ok((await problemsOf(BOOK, weave)).some((e) => e.includes("straight apostrophe")));
  weave.sentences[0].t[2] = ["moe.", "zo'n"];
  assert.ok(!(await problemsOf(BOOK, weave)).some((e) => e.includes("apostrophe")));
});
await test("weave: Dutch lemmas are lowercase", async () => {
  const weave = clone(WEAVE);
  weave.sentences[0].t[1] = ["was", "Zijn"];
  assert.ok((await problemsOf(BOOK, weave)).some((e) => e.includes("lowercase dictionary form")));
});
await test("ledger: a lemma may end in a combining mark (Hindi चलना, मैं; Thai ที่), never in a dash", async () => {
  // Each language's dash case shows its lemmas are checked at all, so the passes aren't empty.
  for (const [to, lemma] of [["hi", "चलना"], ["hi", "मैं"], ["th", "ที่"], ["gu", "છે"]]) {
    const weave = clone(WEAVE);
    weave.to = to;
    weave.sentences[0].t[2] = ["moe.", lemma];
    assert.ok(!(await problemsOf(BOOK, weave)).some((e) => e.includes("dictionary form")), `${to} ${lemma}`);
    weave.sentences[0].t[2] = ["moe.", `${lemma}-`];
    assert.ok((await problemsOf(BOOK, weave)).some((e) => e.includes("dictionary form")), `${to} ${lemma}-`);
  }
});
await test("ledger: a name that stays must stay exactly (no word added to it)", async () => {
  const weave = clone(WEAVE);
  weave.sentences[0].t[0] = ["Dat Alice", "dat"];
  const problems = await problemsOf(BOOK, weave, { keep: ["Alice"] });
  assert.ok(problems.some((e) => e.includes("is a name that stays as it is")));
});
await test("ledger: a gloss may not add quotation marks", async () => {
  const weave = clone(WEAVE);
  weave.sentences[0].t[1] = ["“was", "zijn"];
  assert.ok((await problemsOf(BOOK, weave)).some((e) => e.includes("adds quotation marks")));
});
await test("weave: a gloss keeps the word's punctuation", async () => {
  const weave = clone(WEAVE);
  weave.sentences[0].t[2] = ["moe", "moe"];
  assert.ok((await problemsOf(BOOK, weave)).some((e) => e.includes("must keep the word's punctuation")));
});
await test("ledger: no capitalization rule on targets (it forced wrong output once)", async () => {
  // A capital mid-sentence or a lowercase start are both left to the audit: Dutch writes "van" lowercase but some
  // names start with "Van", and a word can start a Dutch sentence where it didn't start the English one.
  const weave = clone(WEAVE);
  weave.sentences[0].t[1] = ["Was", "zijn"];
  weave.sentences[1].t[0] = ["ze", "zij"];
  assert.deepEqual(await problemsOf(BOOK, weave), []);
});
await test("weave: per-word glosses in English order are fine where Dutch reorders (te / strekken / uit)", async () => {
  const book = await makeBook("To stretch out.");
  const weave = await makeWeave(book);
  weave.sentences = [{ ...weave.sentences[0], t: [["Te", "te"], ["strekken", "strekken"], ["uit.", "uit"]], text: "Uit te strekken.", m: [["Uit", "out", [2], "uit"], ["te", "to", [0], "te"], ["strekken.", "stretch", [1], "strekken"]] }];
  delete weave.sentences[0].c;
  assert.deepEqual(await problemsOf(book, weave), []);
});
await test("ledger: the literal line must tile its own sentence (the three analyses agree)", async () => {
  const weave = clone(WEAVE);
  weave.sentences[1].m.pop();
  assert.ok((await problemsOf(BOOK, weave)).some((e) => e.includes("must be exactly text")));
});
await test("weave: literal-line sources must be word indices of the sentence", async () => {
  const weave = clone(WEAVE);
  weave.sentences[1].m[0][2] = [5];
  assert.ok((await problemsOf(BOOK, weave)).some((e) => e.includes("sources must list distinct word indices")));
});
await test("weave: an idiom upgrade covers at least one learnable word", async () => {
  const book = await makeBook("Alice and Bob slept.");
  const weave = await makeWeave(book);
  weave.sentences = [{ ...weave.sentences[0], t: [["Alice", null], ["en", "en"], ["Bob", null], ["sliepen.", "slapen"]], text: "Alice en Bob sliepen.", m: [["Alice", "Alice", [0], null], ["en", "and", [1], "en"], ["Bob", "Bob", [2], null], ["sliepen.", "slept", [3], "slapen"]], u: [[0, 3, "Alice en Bob"]] }];
  delete weave.sentences[0].c;
  assert.deepEqual(await problemsOf(book, weave), [], "a name inside an idiom is fine: it has a learnable word");
  weave.sentences[0].u = [[2, 1, "Bob"]];
  assert.ok((await problemsOf(book, weave)).some((e) => e.includes("covers at least two words")));
  weave.sentences[0].t[1] = ["and", null];
  weave.sentences[0].u = [[0, 3, "Alice en Bob"]];
  assert.ok((await problemsOf(book, weave)).some((e) => e.includes("at least one word with a lemma")));
});
await test("render: an idiom over a name shows once its learnable words are known, and never before", async () => {
  const book = await makeBook("Alice and Bob slept.");
  const sentence = { s: 0, e: 4, t: [["Alice", null], ["en", "en"], ["Bob", null], ["sliepen.", "slapen"]], m: [], u: [[0, 3, "Alice en Bob"]] };
  assert.deepEqual(weaveSentence(sentence, book.words, new Set()).words.map((w) => w.text), ["Alice", "and", "Bob", "slept."]);
  assert.deepEqual(weaveSentence(sentence, book.words, new Set(["en"])).words.map((w) => [w.show, w.text]), [["target", "Alice en Bob"], ["hidden", ""], ["hidden", ""], ["en", "slept."]]);
});
await test("weave: pattern ids come from the catalog", async () => {
  const weave = clone(WEAVE);
  weave.sentences[0].c = ["v2", "made-up"];
  assert.ok((await problemsOf(BOOK, weave)).some((e) => e.includes("pattern ids from the catalog")));
  weave.sentences[0].c = ["v2"];
  assert.deepEqual(await problemsOf(BOOK, weave), []);
});
await test("weave: the sentence hash is checked", async () => {
  const weave = clone(WEAVE);
  weave.sentences[0].h = "000000000000";
  assert.ok((await problemsOf(BOOK, weave)).some((e) => e.includes("sentenceHash")));
});
await test("help layer: lemmas are the book's language, and m carries none", async () => {
  const book = await makeBook("Ik heb gisteren een boek gelezen.", { lang: "nl" });
  const s = book.sentences[0];
  const sentence = {
    s: s[0], e: s[1], h: await sentenceHash(book.words, s[0], s[1]),
    t: [["I", "ik"], ["have", "hebben"], ["yesterday", "gisteren"], ["a", "een"], ["book", "boek"], ["read.", "lezen"]],
    text: "I read a book yesterday.",
    m: [["I", "Ik", [0], null], ["read", "heb gelezen", [1, 5], null], ["a", "een", [3], null], ["book", "boek", [4], null], ["yesterday.", "gisteren", [2], null]],
  };
  const weave = { format: "lexicommons-weave", v: 1, kind: "help", book: book.id, bookVersion: book.version, from: "nl", to: "en", sentences: [sentence] };
  assert.deepEqual(await validateWeave(weave, book), []);
  sentence.m[0][3] = "i";
  assert.ok((await validateWeave(weave, book)).some((e) => e.includes("in a help layer the lemma here is null")));
});

// ---------- the literal line ----------

// "I read a book yesterday." → "Ik heb gisteren een boek gelezen."
const M = [["Ik", "I", [0], "ik"], ["heb", "have", [1], "hebben"], ["gisteren", "yesterday", [4], "gisteren"], ["een", "a", [2], "een"], ["boek", "book", [3], "boek"], ["gelezen.", "read", [1], "lezen"]];

await test("literal line: moved words are the ones off the longest in-order run", () => {
  assert.deepEqual(movedOf(M), [false, false, true, false, false, true]);
});
await test("literal line: English order", () => {
  assert.deepEqual(englishOrderOf(M), [0, 1, 5, 3, 4, 2]);
});
await test("literal line: the shape ui.literalLine takes, with the full stop as its own piece", () => {
  const line = literalLineOf(M);
  assert.deepEqual(line.literal.map((c) => c.text), ["I", "have", "yesterday", "a", "book", "read"]);
  assert.deepEqual(line.literal.map((c) => c.moved), [false, false, true, false, false, true]);
  assert.equal(line.punct, ".");
  assert.deepEqual(line.english, [0, 1, 5, 3, 4, 2]);
});
await test("literal line: neighboring words carrying the same English are one chunk, with the cue once", () => {
  // "He went down quickly." → "Hij ging snel naar beneden."
  const m = [["Hij", "He", [0], "hij"], ["ging", "went", [1], "gaan"], ["snel", "quickly", [3], "snel"], ["naar", "down", [2], "naar"], ["beneden.", "down", [2], "beneden"]];
  const line = literalLineOf(m);
  assert.deepEqual(line.literal.map((c) => c.text), ["He", "went", "quickly", "down"]);
  assert.equal(line.punct, ".");
  // quickly and down swap; which one counts as moved is a tie, decided the same way every time.
  assert.deepEqual(line.literal.map((c) => c.moved), [false, false, true, false]);
  assert.deepEqual(line.english, [0, 1, 3, 2]);
});
await test("literal line: two words for one English word don't count as moved", () => {
  assert.deepEqual(movedOf([["Ik", "I", [0], "ik"], ["ben", "am", [0], "zijn"], ["moe.", "tired", [1], "moe"]]), [false, false, false]);
});
await test("frames", () => {
  assert.deepEqual(frameOf("“Oh"), ["“", ""]);
  assert.deepEqual(frameOf("dear!”"), ["", "!”"]);
  assert.deepEqual(frameOf("’tis"), ["", ""]);
  assert.deepEqual(frameOf("—"), ["—", ""]);
  // An apostrophe after punctuation is a closing quote; touching a letter, it's elision.
  assert.deepEqual(frameOf("Rome—’"), ["", "—’"]);
  assert.deepEqual(frameOf("dear!’"), ["", "!’"]);
  assert.deepEqual(frameOf("runnin’,"), ["", ","]);
  assert.deepEqual(frameOf("‘’Tis"), ["‘", ""]);
  // A combining mark is part of its word: a vowel sign or tone mark at the end is never punctuation.
  assert.deepEqual(frameOf("चलना,"), ["", ","]);
  assert.deepEqual(frameOf("“मैं"), ["“", ""]);
  assert.deepEqual(frameOf("ที่"), ["", ""]);
});

// ---------- what the reader shows ----------

await test("render: known lemmas show in the target language, the rest in English", () => {
  const view = weaveSentence(WEAVE.sentences[0], BOOK.words, new Set(["moe"]));
  assert.deepEqual(view.words.map((w) => [w.show, w.text]), [["en", "Alice"], ["en", "was"], ["target", "moe."]]);
  assert.equal(view.known, 1);
  assert.equal(view.total, 2);
});
await test("render: an idiom shows only once every word in it is known", () => {
  const some = weaveSentence(WEAVE.sentences[1], BOOK.words, new Set(["gaan"]));
  assert.deepEqual(some.words.map((w) => w.text), ["She", "ging zitten", "down."]);
  const all = weaveSentence(WEAVE.sentences[1], BOOK.words, new Set(["gaan", "neer"]));
  assert.deepEqual(all.words.map((w) => [w.show, w.text]), [["en", "She"], ["target", "ging zitten."], ["hidden", ""]]);
});
await test("render: a sentence flips at the threshold, as its literal line's target words", () => {
  const view = weaveSentence(WEAVE.sentences[0], BOOK.words, new Set(["zijn", "moe"]), { flipAt: 100 });
  assert.equal(view.flipped, true);
  assert.deepEqual(view.words.map((w) => w.text), ["Alice", "was", "moe."]);
  assert.equal(weaveSentence(WEAVE.sentences[0], BOOK.words, new Set(["zijn"]), { flipAt: 100 }).flipped, false);
  assert.equal(weaveSentence(WEAVE.sentences[0], BOOK.words, new Set(["zijn", "moe"]), { flipAt: 101 }).flipped, false);
});
await test("render: target order shows English cues with known words in the target language", () => {
  const view = weaveSentence(WEAVE.sentences[1], BOOK.words, new Set(["gaan"]), { order: true });
  assert.equal(view.ordered, true);
  assert.deepEqual(view.words.map((w) => [w.show, w.text]), [["en", "She"], ["target", "ging"], ["en", "down."]]);
});
await test("render: a known word always appears, at every bank (P1)", () => {
  const lemmas = ["zijn", "moe", "zij", "gaan", "neer"];
  for (let mask = 0; mask < 1 << lemmas.length; mask++) {
    const bank = new Set(lemmas.filter((_, i) => mask & (1 << i)));
    for (const view of weaveAt(BOOK, WEAVE, bank)) {
      for (const [j, piece] of view.words.entries()) {
        const sentence = WEAVE.sentences.find((s) => s.s <= piece.i && piece.i < s.e);
        const lemma = sentence.t[piece.i - sentence.s][1];
        const insideIdiom = view.idioms.some(({ k, len }) => j >= k && j < k + len);
        if (lemma && bank.has(lemma) && !insideIdiom) assert.equal(piece.show, "target", `${lemma} at bank ${[...bank]}`);
        if (lemma && !bank.has(lemma)) assert.equal(piece.show, "en", `${lemma} leaked at bank ${[...bank]}`);
      }
    }
  }
});
await test("coverage", () => {
  assert.deepEqual(coverageOf(WEAVE, new Set(["moe", "zij"])), { known: 2, total: 5, share: 0.4 });
});
await test("sentenceProblems is what validateWeave runs, per sentence", async () => {
  assert.deepEqual(await sentenceProblems(WEAVE.sentences[1], 1, BOOK, WEAVE), []);
});

// ---------- a help layer ----------

// A Dutch book with English help: "Ik heb gisteren een boek gelezen." → "I read a book yesterday."
const HELP_BOOK = await makeBook("Ik heb gisteren een boek gelezen.", { lang: "nl" });
const HELP = {
  s: 0, e: 6, h: await sentenceHash(HELP_BOOK.words, 0, 6),
  t: [["I", "ik"], ["have", "hebben"], ["yesterday", "gisteren"], ["a", "een"], ["book", "boek"], ["read.", "lezen"]],
  text: "I read a book yesterday.",
  m: [["I", "Ik", [0], null], ["read", "heb gelezen", [1, 5], null], ["a", "een", [3], null], ["book", "boek", [4], null], ["yesterday.", "gisteren", [2], null]],
  c: ["perfect"],
};

await test("help layer: a valid one passes, and its patterns are the book language's", async () => {
  const weave = { format: "lexicommons-weave", v: 1, kind: "help", book: HELP_BOOK.id, bookVersion: HELP_BOOK.version, from: "nl", to: "en", sentences: [HELP] };
  assert.deepEqual(await validateWeave(weave, HELP_BOOK), []);
  weave.sentences = [{ ...HELP, c: ["made-up"] }];
  assert.ok((await validateWeave(weave, HELP_BOOK)).some((e) => e.includes("v2")), "the catalog offered is Dutch's");
});
await test("help layer, gloss mode: every word stays Dutch; the ones you don't know carry their English", () => {
  const view = helpSentence(HELP, HELP_BOOK.words, new Set(["boek", "ik"]));
  assert.deepEqual(view.words.map((w) => [w.show, w.text, w.help]), [["book", "Ik", null], ["book", "heb", "have"], ["book", "gisteren", "yesterday"], ["book", "een", "a"], ["book", "boek", null], ["book", "gelezen.", "read."]]);
  assert.equal(view.known, 2);
  assert.equal(view.total, 6);
});
await test("help layer, weave mode: words you don't know show their English in place, in Dutch order", () => {
  const view = helpSentence(HELP, HELP_BOOK.words, new Set(["boek", "ik"]), { mode: "weave" });
  assert.deepEqual(view.words.map((w) => w.text), ["Ik", "have", "yesterday", "a", "boek", "read."]);
});
await test("help layer: a known word always shows in Dutch, and an unknown one never does without help (P1, both modes)", () => {
  const lemmas = HELP.t.map(([, l]) => l);
  for (let mask = 0; mask < 1 << lemmas.length; mask++) {
    const bank = new Set(lemmas.filter((_, i) => mask & (1 << i)));
    for (const mode of ["gloss", "weave"]) {
      helpSentence(HELP, HELP_BOOK.words, bank, { mode }).words.forEach((piece, j) => {
        const lemma = HELP.t[j][1];
        if (bank.has(lemma)) assert.ok(piece.show === "book" && piece.help === null, `${lemma} known, ${mode}`);
        else assert.ok(piece.help === HELP.t[j][0] && (mode === "gloss" ? piece.show === "book" : piece.show === "help"), `${lemma} unknown, ${mode}`);
      });
    }
  }
});
await test("help layer: an idiom shows its natural English while none of its words is known", () => {
  const sentence = { ...HELP, u: [[2, 2, "yesterday a"]] };
  assert.deepEqual(helpSentence(sentence, HELP_BOOK.words, new Set(), { mode: "weave" }).words.map((w) => w.text), ["I", "have", "yesterday a", "", "book", "read."]);
  assert.deepEqual(helpSentence(sentence, HELP_BOOK.words, new Set(["een"]), { mode: "weave" }).words.map((w) => w.text), ["I", "have", "yesterday", "een", "book", "read."]);
});
await test("help layer: its literal line is the glosses in Dutch order, switching to the English sentence's order", () => {
  const line = helpLiteralLineOf(HELP);
  assert.deepEqual(line.literal.map((c) => c.text), ["I", "have", "yesterday", "a", "book", "read"]);
  assert.deepEqual(line.literal.map((c) => c.moved), [false, false, true, false, false, true]);
  assert.equal(line.punct, ".");
  assert.deepEqual(line.english, [0, 1, 5, 3, 4, 2]);
});

// ---------- a picture book ----------

async function makePictureBook(change = {}) {
  const lang = "nl";
  const title = tokenize("De natte jas", lang);
  const one = tokenize("Het regent.", lang);
  const two = tokenize("Ik ga naar buiten, maar mijn jas is nat.", lang);
  const words = [...title, ...one, ...two];
  const paras = [{ k: "h", s: 0, e: 3 }, { k: "p", s: 3, e: 5 }, { k: "p", s: 5, e: 14 }];
  const book = {
    format: "lexicommons-book", v: 1, id: "test-picture-book", version: "", title: "De natte jas", authors: [], lang,
    source: { kind: "paste" }, rights: { us: false, eu: false, basis: "made for the test", licence: "CC0-1.0" },
    words, italic: [], paras, chapters: [], sentences: segmentSentences(words, paras, lang),
    pages: [{ s: 0, e: 3, picture: 0 }, { s: 3, e: 14, picture: 1 }],
    pictures: [
      { file: "0123456789abcdef.jpg", w: 1073, h: 513, alt: "A boy holding a coat", credit: "A made-up illustrator" },
      { file: "fedcba9876543210.jpg", w: 1073, h: 513, alt: "Rain on a window", credit: "A made-up illustrator" },
    ],
    breaks: [9],
    ...change,
  };
  book.version = await bookVersion(book);
  return book;
}

await test("picture book: pages, pictures and a line break pass, and a sentence runs across the break", async () => {
  const book = await makePictureBook();
  assert.deepEqual(await validateBook(book), []);
  assert.deepEqual(book.sentences.at(-1), [5, 14], "the line break at 'maar' doesn't end the sentence");
  assert.equal(picturePath(book.pictures[0].file), "pictures/0123456789abcdef.jpg");
});

await test("picture book: its pictures are content, so a changed picture is a new version", async () => {
  const a = await makePictureBook();
  const b = await makePictureBook({ pictures: [a.pictures[0], { ...a.pictures[1], alt: "Rain on a roof" }] });
  assert.notEqual(a.version, b.version);
});

await test("picture book: pages tile the words at paragraph edges, and every picture is on a page", async () => {
  const problems = async (change) => (await validateBook(await makePictureBook(change))).join(" | ");
  assert.match(await problems({ pages: [{ s: 0, e: 4, picture: 0 }, { s: 4, e: 14, picture: 1 }] }), /where a paragraph does/);
  assert.match(await problems({ pages: [{ s: 0, e: 3, picture: 0 }, { s: 5, e: 14, picture: 1 }] }), /tile the words/);
  assert.match(await problems({ pages: [{ s: 0, e: 3, picture: 0 }, { s: 3, e: 5, picture: 1 }] }), /pages end at word 5/);
  assert.match(await problems({ pages: [{ s: 0, e: 3, picture: 0 }, { s: 3, e: 14, picture: 2 }] }), /index into pictures/);
  assert.match(await problems({ pages: [{ s: 0, e: 3, picture: 0 }, { s: 3, e: 14, picture: null }] }), /isn't on any page/);
  assert.match(await problems({ pages: undefined }), /pictures\[0\] isn't on any page \(a book without pages shows a picture only as its cover\)/);
  assert.deepEqual(await problems({ pages: [{ s: 0, e: 0, picture: 0 }, { s: 0, e: 14, picture: 1 }] }), "", "a cover may hold no words");
  assert.match(await problems({ chapters: [{ title: "Een", para: 2 }] }), /chapter 0 must start where a page does/, "the reader shows a chapter at a time");
  assert.deepEqual(await problems({ chapters: [{ title: "Een", para: 1 }] }), "");
});

await test("picture book: a picture is named by its hash and credited; a line break falls inside a paragraph", async () => {
  const problems = async (change) => (await validateBook(await makePictureBook(change))).join(" | ");
  const [first, second] = (await makePictureBook()).pictures;
  assert.match(await problems({ pictures: [{ ...first, file: "cover.jpg" }, second] }), /16 hex/);
  assert.match(await problems({ pictures: [first, { ...first }] }), /repeats/);
  assert.match(await problems({ pictures: [{ ...first, credit: "" }, second] }), /credit/);
  assert.match(await problems({ breaks: [5] }), /between two words of one paragraph/, "a paragraph's own start isn't a line break");
  assert.match(await problems({ breaks: [9, 7] }), /in order/);
});

await test("a cover: a book without pages may carry one picture as its cover; it's content, and checked", async () => {
  const [first, second] = (await makePictureBook()).pictures;
  // A novel's cover: no pages, no line breaks, one picture.
  const novel = await makePictureBook({ pages: undefined, breaks: undefined, pictures: [first], cover: 0 });
  assert.deepEqual(await validateBook(novel), []);
  assert.deepEqual(coverPicture(novel), first);
  const bare = await makePictureBook({ pages: undefined, breaks: undefined, pictures: undefined });
  assert.equal(coverPicture(bare), null);
  assert.notEqual(novel.version, bare.version, "a cover is content: adding one makes a new version");
  const problems = async (change) => (await validateBook(await makePictureBook({ pages: undefined, breaks: undefined, ...change }))).join(" | ");
  assert.match(await problems({ pictures: [first], cover: 1 }), /cover must be an index into pictures/);
  assert.match(await problems({ pictures: undefined, cover: 0 }), /cover must be an index into pictures/);
  assert.match(await problems({ pictures: [first], cover: "0" }), /cover must be an index into pictures/);
  assert.match(await problems({ pictures: [first, second], cover: 0 }), /pictures\[1\] isn't on any page \(a book without pages shows a picture only as its cover\)/);
  // A picture book's cover is its first page's picture, unless it names another.
  const picture = await makePictureBook();
  assert.deepEqual(coverPicture(picture), first);
  const named = await makePictureBook({ cover: 1 });
  assert.deepEqual(await validateBook(named), []);
  assert.deepEqual(coverPicture(named), second);
  assert.notEqual(named.version, picture.version);
  // A picture shown only as the cover counts as shown.
  const coverOnly = await makePictureBook({ pages: [{ s: 0, e: 3, picture: null }, { s: 3, e: 14, picture: 1 }], cover: 0 });
  assert.deepEqual(await validateBook(coverOnly), []);
});

// ---------- definitions ----------

const DEFS = () => ({
  format: "lexicommons-definitions", v: 1, book: BOOK.id, bookVersion: BOOK.version, of: "0123456789ab", lang: "nl", in: "en",
  licence: "CC-BY-SA-4.0", credit: "Definitions written for Lexicommons", made: { pipeline: "test" },
  entries: {
    moe: { senses: [{ pos: "adjective", def: "tired; having little energy left", example: ["Na de wandeling was ik moe.", "After the walk I was tired."] }] },
    gaan: { senses: [{ pos: "verb", def: "to go; with zitten, liggen or staan: to begin to sit, lie or stand" }, { pos: "verb", def: "to be about to (do something)" }] },
  },
});
const defsProblems = (defs, options = { layer: WEAVE, layerSha: "0123456789ab" }) => validateDefinitions(defs, BOOK, options).join(" | ");

await test("definitions: a layer's lemmas, each with one to three senses, licensed and credited", () => {
  assert.equal(defsProblems(DEFS()), "");
  assert.ok(DEFINITION_POS.includes("contraction"));
});

await test("definitions: only the layer's own lemmas, checked against that very layer", () => {
  assert.match(defsProblems({ ...DEFS(), entries: { ...DEFS().entries, kat: { senses: [{ pos: "noun", def: "a cat" }] } } }), /kat.*isn't a lemma the layer uses/);
  assert.match(defsProblems(DEFS(), { layer: WEAVE, layerSha: "ba9876543210" }), /of names a layer/);
  assert.match(defsProblems(DEFS(), {}), /of names a layer/);
  assert.match(defsProblems({ ...DEFS(), lang: "de" }), /lang must be the layer's language being learned \(nl\)/);
  assert.match(defsProblems({ ...DEFS(), bookVersion: "0000000000000000" }), /bookVersion/);
});

await test("definitions: senses, parts of speech, one-line definitions, examples as [sentence, translation]", () => {
  const withSense = (sense) => ({ ...DEFS(), entries: { moe: { senses: [sense] } } });
  assert.match(defsProblems(withSense({ pos: "adj", def: "tired" })), /pos must be one of/);
  assert.match(defsProblems(withSense({ pos: "adjective", def: "x".repeat(121) })), /at most 120/);
  assert.match(defsProblems(withSense({ pos: "adjective", def: "two\nlines" })), /one line/);
  assert.match(defsProblems(withSense({ pos: "adjective", def: "moe" })), /not repeat the word/);
  assert.match(defsProblems(withSense({ pos: "adjective", def: "tired", example: ["Ik ben moe."] })), /example must be/);
  assert.match(defsProblems(withSense({ pos: "adjective", def: "tired", note: "x" })), /must be \{ pos, def, example\? \}/);
  assert.match(defsProblems({ ...DEFS(), entries: { moe: { senses: [] } } }), /1 to 3 senses/);
  assert.match(defsProblems({ ...DEFS(), entries: { moe: { senses: Array(4).fill({ pos: "adjective", def: "tired" }) } } }), /1 to 3 senses/);
  assert.match(defsProblems({ ...DEFS(), licence: "all rights reserved" }), /licence must be one of/);
  assert.match(defsProblems({ ...DEFS(), extra: 1 }), /extra isn't a field/);
});

await test("definitions: a book's own words, with forms for what it doesn't lemmatize and contractions spelled out", () => {
  const own = { ...DEFS(), of: "book", lang: "en", entries: { tired: { senses: [{ pos: "adjective", def: "needing rest or sleep" }] }, sit: { senses: [{ pos: "verb", def: "to rest with your weight on your bottom" }] } }, forms: { sat: "sit", "didn't": "did not" } };
  assert.equal(validateDefinitions(own, BOOK).join(" | "), "");
  assert.match(validateDefinitions({ ...own, forms: { sat: "stand" } }, BOOK).join(" | "), /point at a lemma defined here/);
  assert.match(validateDefinitions({ ...own, entries: { ...own.entries, rabbit: { senses: [{ pos: "noun", def: "a small furry animal" }] } } }, BOOK).join(" | "), /rabbit.*isn't a word of the book/);
  assert.match(validateDefinitions({ ...own, lang: "nl" }, BOOK).join(" | "), /the book's language/);
});

// ---------- the word-frequency list ----------

const LIST = {
  format: "lexicommons-frequency",
  v: 1,
  lang: "nl",
  unit: "lemma",
  corpus: { name: "a made-up corpus", tokens: 120, counted: 100, dropped: 20 },
  licence: "CC-BY-SA-4.0",
  attribution: [{ what: "word counts", name: "A made-up list", url: "https://example.org/list" }],
  lemmas: [["ik", 40], ["zijn", 30], ["huis", 20], ["m'n", 5]],
};
const listWith = (change) => ({ ...structuredClone(LIST), ...change });

await test("frequency: a well-formed list passes", () => {
  assert.deepEqual(validateFrequency(LIST), []);
});

await test("frequency: counts must add up, and a list never claims more than it counted", () => {
  assert.match(validateFrequency(listWith({ corpus: { name: "x", tokens: 120, counted: 100, dropped: 19 } })).join(), /counted \+ dropped = tokens/);
  assert.match(validateFrequency(listWith({ corpus: { name: "x", tokens: 90, counted: 90, dropped: 0 } })).join(), /more than the 90 words counted/);
});

await test("a book's word may carry a zero-width non-joiner where its script writes one, never elsewhere", () => {
  assert.deepEqual(tokenize("من به خانه می\u200Cروم.", "nl"), ["من", "به", "خانه", "می\u200Cروم."]);
  assert.deepEqual(tokenize("Ik ga na\u200Car huis.", "nl"), ["Ik", "ga", "naar", "huis."]);
});

await test("frequency: a right-to-left language's lemmas may carry a zero-width non-joiner (Persian خانه‌دار)", () => {
  LANGUAGES.xr = { name: "Right-to-left test", locale: "xr-XR", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", patterns: {} };
  try {
    assert.deepEqual(validateFrequency(listWith({ lang: "xr", lemmas: [["خانه\u200Cدار", 40], ["رفتن", 20]] })), []);
  } finally {
    delete LANGUAGES.xr;
  }
});

await test("frequency: lemmas are word-bank keys, once each, most used first", () => {
  assert.match(validateFrequency(listWith({ lemmas: [["ik", 40], ["Huis", 20]] })).join(), /lowercase dictionary form/);
  assert.match(validateFrequency(listWith({ lemmas: [["ik", 40], ["nr.", 20]] })).join(), /dictionary form/, "an abbreviation is no key");
  assert.match(validateFrequency(listWith({ lemmas: [["ik", 40], ["m’n", 20]] })).join(), /straight apostrophe/);
  assert.match(validateFrequency(listWith({ lemmas: [["ik", 40], ["ik", 20]] })).join(), /listed twice/);
  assert.match(validateFrequency(listWith({ lemmas: [["ik", 20], ["zijn", 40]] })).join(), /most used first/);
  assert.match(validateFrequency(listWith({ lemmas: [["ik", 0]] })).join(), /count of at least 1/);
});

await test("frequency: an open license and the sources' attribution travel with the list", () => {
  assert.match(validateFrequency(listWith({ licence: "CC-BY-NC-4.0" })).join(), /licence must be/);
  assert.match(validateFrequency(listWith({ attribution: [] })).join(), /attribution/);
  assert.match(validateFrequency(listWith({ attribution: [{ what: "counts", name: "x", url: "not a link" }] })).join(), /attribution/);
  assert.match(validateFrequency(listWith({ unit: "form" })).join(), /unit must be "lemma"/);
});

await test("frequency: the everyday share is out of the words counted, from a set or the bank's function", () => {
  assert.deepEqual(everydayShare(LIST, new Set(["ik", "huis"])), { known: 60, counted: 100, share: 0.6 });
  assert.equal(everydayShare(LIST, (lemma) => lemma === "zijn").share, 0.3);
  assert.equal(everydayShare(LIST, new Set()).share, 0);
  assert.equal(frequencyRanks(LIST).get("huis"), 3);
  assert.equal(frequencyRanks(LIST).get("kat"), undefined);
});

// ---------- whether a book may be shared ----------

await test("rights: public domain in both the US and the EU may be shared, either alone may not", () => {
  assert.deepEqual(rightsProblems({ rights: { us: true, eu: true } }), []);
  assert.equal(rightsProblems({ rights: { us: true, eu: false } }).length, 1);
  assert.equal(rightsProblems({ rights: { us: false, eu: true } }).length, 1);
  assert.equal(rightsProblems({}).length, 1);
  assert.equal(rightsProblems(null).length, 1);
});
await test("rights: an open license needs its attribution; NC and ND never pass", () => {
  const credit = [{ role: "author", name: "A Writer" }];
  for (const spdx of ["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-3.0", "CC-BY-SA-3.0"]) assert.deepEqual(rightsProblems({ rights: { spdx, attribution: credit } }), [], spdx);
  assert.equal(rightsProblems({ rights: { spdx: "CC-BY-4.0", attribution: [] } }).length, 1);
  assert.equal(rightsProblems({ rights: { spdx: "CC-BY-4.0" } }).length, 1);
  for (const spdx of ["CC-BY-NC-4.0", "CC-BY-ND-4.0", "CC-BY-NC-SA-4.0", "All rights reserved"]) assert.equal(rightsProblems({ rights: { spdx, attribution: credit } }).length, 1, spdx);
  // NC and ND stay out in every version (African Storybook's NC stories among them).
  for (const spdx of ["CC-BY-NC-3.0", "CC-BY-ND-3.0", "CC-BY-NC-SA-3.0", "CC-BY-NC-ND-3.0", "CC-BY-2.0"]) assert.equal(rightsProblems({ rights: { spdx, attribution: credit } }).length, 1, spdx);
  assert.equal(rightsProblems({ rights: { spdx: "CC-BY-3.0", attribution: [] } }).length, 1, "3.0 needs its attribution too");
});

// ---------- the audit (public/js/read/weave-audit.js) ----------

await test("audit: a valid weave holds both invariants at every bank", async () => {
  const { report, problems } = await auditWeave(BOOK, WEAVE);
  assert.deepEqual(problems, []);
  assert.equal(report.ok, true);
  assert.deepEqual(report.invariants, { "known-but-silent": 0, "unknown-shown": 0, doubled: 0 });
  assert.deepEqual(Object.keys(report.banks), ["none", "top100", "top400", "top1200", "all"]);
  // Every lemma known: the idiom (ging zitten) shows over its run, so 4 of the 5 learnable words show one by one.
  assert.deepEqual(report.banks.all, { lemmas: 5, shownInTarget: 80, sentencesFullyKnown: 2 });
  assert.deepEqual(report.banks.none, { lemmas: 0, shownInTarget: 0, sentencesFullyKnown: 0 });
});
await test("audit: one target word shown twice in a row for two book words fails (a group without its upgrade); with the upgrade, the book's own repeats and two clauses it doesn't", async () => {
  // The plant: "sat down" as one verb group, both words "ging zitten", without the upgrade that shows it once.
  const planted = clone(WEAVE);
  planted.sentences[1].t[2] = ["ging zitten.", "gaan"];
  delete planted.sentences[1].u;
  const bad = await auditWeave(BOOK, planted);
  assert.equal(bad.report.invariants.doubled, 1, JSON.stringify(bad.report.invariants));
  assert.equal(bad.report.ok, false);
  assert.deepEqual(bad.report.findings.doubled.samples[0], { x: 1, words: "sat down.", shown: "ging zitten ging zitten.", bank: "top100" });
  // The same group with its upgrade over both words: shown once.
  const grouped = clone(planted);
  grouped.sentences[1].u = [[1, 2, "ging zitten."]];
  const good = await auditWeave(BOOK, grouped);
  assert.equal(good.report.invariants.doubled, 0);
  assert.equal(good.report.ok, true);
  // A longer upgrade over the pair waits for every word in it: before then the pair shows twice, found at the pair's own bank.
  const book = await makeBook("He tried to find the way.");
  const [s, e] = book.sentences[0];
  const t = [["Él", "él"], ["intentó", "intentar"], ["encontrar", "encontrar"], ["encontrar", "encontrar"], ["el", "el"], ["camino.", "camino"]];
  const m = [["Intentó", "he tried", [0, 1], "intentar"], ["encontrar", "to find", [2, 3], "encontrar"], ["el", "the", [4], "el"], ["camino.", "way", [5], "camino"]];
  const weaveOf = async (u) => ({ ...clone(WEAVE), to: "es", variant: undefined, book: book.id, bookVersion: book.version, sentences: [{ s, e, h: await sentenceHash(book.words, s, e), t, text: "Intentó encontrar el camino.", m, ...(u ? { u } : {}), c: [] }] });
  const long = await auditWeave(book, await weaveOf([[2, 4, "encontrar el camino."]]));
  assert.deepEqual(long.problems, []);
  assert.equal(long.report.invariants.doubled, 1);
  assert.equal(long.report.findings.doubled.samples[0].bank, "just encontrar, encontrar");
  assert.equal((await auditWeave(book, await weaveOf([[2, 2, "encontrar"]]))).report.invariants.doubled, 0);
  // The book repeating itself, and two clauses with punctuation between them: no double.
  const said = await makeBook("Run run, he said.");
  const [rs, re] = said.sentences[0];
  const repeat = { ...clone(WEAVE), to: "es", variant: undefined, book: said.id, bookVersion: said.version, sentences: [{ s: rs, e: re, h: await sentenceHash(said.words, rs, re), t: [["Corre", "correr"], ["corre,", "correr"], ["él", "él"], ["dijo.", "decir"]], text: "Corre corre, dijo él.", m: [["Corre", "Run", [0], "correr"], ["corre,", "run", [1], "correr"], ["dijo", "said", [3], "decir"], ["él.", "he", [2], "él"]], c: [] }] };
  assert.equal((await auditWeave(said, repeat)).report.invariants.doubled, 0);
  const near = await makeBook("Near him, he heard it.");
  const [ns, ne] = near.sentences[0];
  const clauses = { ...clone(WEAVE), to: "es", variant: undefined, book: near.id, bookVersion: near.version, sentences: [{ s: ns, e: ne, h: await sentenceHash(near.words, ns, ne), t: [["Cerca de", "cerca"], ["él,", "él"], ["él", "él"], ["oyó", "oír"], ["lo.", "lo"]], text: "Cerca de él, lo oyó.", m: [["Cerca", "near", [0], "cerca"], ["de", "near", [0], "de"], ["él,", "him", [1], "él"], ["lo", "it", [4], "lo"], ["oyó.", "he heard", [2, 3], "oír"]], c: [] }] };
  assert.equal((await auditWeave(near, clauses)).report.invariants.doubled, 0);
});
await test("audit: a weave that doesn't validate is not ok, and says why", async () => {
  const broken = clone(WEAVE);
  broken.sentences[0].t.pop();
  const { report, problems } = await auditWeave(BOOK, broken);
  assert.equal(report.ok, false);
  assert.equal(report.valid, false);
  assert.ok(problems.length > 0 && report.validation.length === problems.length);
});
await test("audit: findings are for reading, never a failure (a word left in English with a lemma)", async () => {
  const odd = clone(WEAVE);
  odd.sentences[0].t[2] = ["tired.", "moe"];
  const { report } = await auditWeave(BOOK, odd);
  assert.equal(report.ok, true);
  // "was" (zijn) was already one; "tired." glossed as itself is the second.
  assert.equal(report.findings["same-as-english"].count, 2);
});
await test("audit: samples are capped, counts aren't", async () => {
  const odd = clone(WEAVE);
  odd.sentences[0].t[2] = ["tired.", "moe"];
  odd.sentences[1].t[0] = ["She", "zij"];
  const { report } = await auditWeave(BOOK, odd, { samples: 1 });
  assert.equal(report.findings["same-as-english"].count, 3);
  assert.equal(report.findings["same-as-english"].samples.length, 1);
});

await test("a language is one of the registry's own: never \"__proto__\", never an object a lookup would turn into a key", async () => {
  const trap = JSON.parse('{"toString": null}');
  const book = await makeBook("Ik ga naar huis.", { lang: "nl" });
  for (const lang of [trap, "__proto__", "toString", "constructor"]) {
    const problems = await validateBook({ ...book, lang });
    assert.ok(problems.some((p) => p.startsWith("lang must be a supported language")), `book lang ${String(typeof lang === "string" ? lang : "an object")}: ${problems[0]}`);
    const weaveProblems = await validateWeave({ ...structuredClone(WEAVE), to: lang }, BOOK);
    assert.ok(weaveProblems.some((p) => p.startsWith("to must be a supported language")), `weave to: ${weaveProblems.join(" · ")}`);
    assert.ok(validateFrequency({ ...LIST, lang }).some((p) => p.startsWith("lang must be a supported language")), "list lang");
  }
});

// ---------- an abbreviation's full stop, a final apostrophe, words joined as the language writes them ----------

await test("an abbreviation's full stop is part of the word: Mr. glosses as meneer (or meneer.), Mr., as meneer,", async () => {
  const abbreviations = new Set(LANGUAGES.en.abbreviations);
  assert.deepEqual(glossFrame("Mr.", abbreviations), ["", ""]);
  assert.deepEqual(glossFrame("Mr.,", abbreviations), ["", ","]);
  assert.deepEqual(glossFrame("(Dr.", abbreviations), ["(", ""]);
  assert.deepEqual(glossFrame("tired.", abbreviations), ["", "."], "a word that isn't an abbreviation keeps its full stop");
  const book = await makeBook("Mr. Brown was tired.");
  assert.equal(book.sentences.length, 1);
  const sentence = (title) => ({
    s: 0, e: 4, t: [[title, "meneer"], ["Brown", null], ["was", "zijn"], ["moe.", "moe"]], text: "Meneer Brown was moe.",
    m: [["Meneer", "Mr.", [0], "meneer"], ["Brown", "Brown", [1], null], ["was", "was", [2], "zijn"], ["moe.", "tired", [3], "moe"]],
  });
  for (const title of ["meneer", "meneer."]) {
    const problems = await sentenceProblems({ ...sentence(title), h: await sentenceHash(book.words, 0, 4) }, 0, book, { kind: "weave", to: "nl" });
    assert.deepEqual(problems, [], title);
  }
  const dropped = sentence("meneer");
  dropped.t[3] = ["moe", "moe"];
  const problems = await sentenceProblems({ ...dropped, h: await sentenceHash(book.words, 0, 4) }, 0, book, { kind: "weave", to: "nl" });
  assert.ok(problems.some((e) => e.includes("must keep the word's punctuation")), "a sentence's full stop is still kept");
});

await test("a lemma may end in an apostrophe only where the language says so (Maltese ta', seta')", async () => {
  LANGUAGES.xa = { ...LANGUAGES.nl, name: "Apostrophe test", lemmaFinalApostrophe: true };
  try {
    const sentence = (lemma) => {
      const one = clone(WEAVE.sentences[0]);
      one.t[2] = ["seta'.", lemma];
      one.m[2] = ["seta'.", "tired", [2], lemma];
      one.text = "Alice was seta'.";
      return one;
    };
    const refused = async (lemma, to) => (await sentenceProblems(sentence(lemma), 0, BOOK, { kind: "weave", to })).some((e) => e.includes(`lemma ${JSON.stringify(lemma)}`));
    assert.ok(!(await refused("seta'", "xa")), "allowed where the language says so");
    assert.ok(await refused("seta'", "nl"), "refused everywhere else");
    assert.ok(await refused("seta''", "xa"), "only one, after a letter");
    assert.ok(await refused("seta’", "xa"), "and the straight one");
  } finally {
    delete LANGUAGES.xa;
  }
});

// A woven sentence with every lemma known (t's lemmas), shown in a language.
function shownIn(lang, words, t, { text = "x", known = null, from = "en" } = {}) {
  const sentence = { s: 0, e: words.length, t, text, m: [] };
  const bank = known ?? new Set(t.map(([, lemma]) => lemma).filter(Boolean));
  const view = weaveSentence(sentence, words, bank, { lang, from });
  return { view, line: view.words.filter((w) => w.show !== "hidden").map((w) => w.text).join(" ") };
}

await test("joins, French: de le is du, de les des, à le au, à les aux, a capital kept", () => {
  assert.equal(shownIn("fr", ["Of", "the", "cat"], [["De", "de"], ["le", "le"], ["chat.", "chat"]]).line, "Du chat.");
  assert.equal(shownIn("fr", ["of", "the", "walls"], [["de", "de"], ["les", "le"], ["murs", "mur"]]).line, "des murs");
  assert.equal(shownIn("fr", ["to", "the", "market"], [["à", "à"], ["le", "le"], ["marché", "marché"]]).line, "au marché");
  assert.equal(shownIn("fr", ["to", "the", "shops,"], [["à", "à"], ["les", "le"], ["magasins,", "magasin"]]).line, "aux magasins,");
  const { view } = shownIn("fr", ["of", "the", "cat"], [["de", "de"], ["le", "le"], ["chat", "chat"]]);
  assert.deepEqual(view.words.map((w) => w.show), ["target", "hidden", "target"]);
  assert.deepEqual(view.idioms, [{ k: 0, len: 2, text: "du", joined: true }], "the pair is a run, as an idiom is");
});
await test("joins, French: elision before a vowel, a mute h, y or a name; not before an aspirated h, onze or oui", () => {
  const two = (a, b, words = ["x", "y"]) => shownIn("fr", words, [a, b]).line;
  assert.equal(two(["que", "que"], ["elles", "elle"]), "qu'elles");
  assert.equal(two(["Que", "que"], ["il", "il"]), "Qu'il");
  assert.equal(two(["le", "le"], ["arbre", "arbre"]), "l'arbre");
  assert.equal(two(["la", "le"], ["école", "école"]), "l'école");
  assert.equal(two(["le", "le"], ["homme", "homme"]), "l'homme", "a mute h");
  assert.equal(two(["le", "le"], ["hibou", "hibou"]), "le hibou", "an aspirated h");
  assert.equal(two(["le", "le"], ["héros", "héros"]), "le héros");
  assert.equal(two(["la", "le"], ["héroïne", "héroïne"]), "l'héroïne", "a mute h after all");
  assert.equal(two(["le", "le"], ["onze", "onze"]), "le onze");
  assert.equal(two(["ne", "ne"], ["ai", "avoir"]), "n'ai");
  assert.equal(shownIn("fr", ["of", "Alice"], [["de", "de"], ["Alice", null]]).line, "d'Alice", "a name that stays");
  assert.equal(shownIn("fr", ["of", "apples"], [["de", "de"], ["pommes", "pomme"]], { known: new Set(["de"]) }).line, "de apples", "never before an English word");
});
await test("joins, French: ce only before est, était, étaient; si only before il, ils", () => {
  const two = (a, b) => shownIn("fr", ["x", "y"], [a, b]).line;
  assert.equal(two(["ce", "ce"], ["est", "être"]), "c'est");
  assert.equal(two(["Ce", "ce"], ["était", "être"]), "C'était");
  assert.equal(two(["ce", "ce"], ["arbre", "arbre"]), "ce arbre");
  assert.equal(two(["si", "si"], ["il", "il"]), "s'il");
  assert.equal(two(["si", "si"], ["elle", "elle"]), "si elle");
});
await test("joins, French: de le before a vowel elides instead (de l'arbre); nothing joins across punctuation or with a word in English", () => {
  assert.equal(shownIn("fr", ["of", "the", "tree"], [["de", "de"], ["le", "le"], ["arbre", "arbre"]]).line, "de l'arbre");
  assert.equal(shownIn("fr", ["of,", "the", "cat"], [["de,", "de"], ["le", "le"], ["chat", "chat"]]).line, "de, le chat");
  assert.equal(shownIn("fr", ["of", "\"the", "cat"], [["de", "de"], ["\"le", "le"], ["chat", "chat"]]).line, "de \"le chat");
  assert.equal(shownIn("fr", ["of", "the", "cat"], [["de", "de"], ["le", "le"], ["chat", "chat"]], { known: new Set(["de", "chat"]) }).line, "de the chat");
});
await test("joins, French: contractions first, then elisions over them (jusqu'au bout, qu'aux enfants: lex-lang-eu's review)", () => {
  const until = shownIn("fr", ["until", "to", "the", "end"], [["jusque", "jusque"], ["à", "à"], ["le", "le"], ["bout", "bout"]]);
  assert.equal(until.line, "jusqu'au bout");
  assert.deepEqual(until.view.words.map((w) => w.show), ["target", "hidden", "hidden", "target"]);
  assert.deepEqual(until.view.idioms, [{ k: 0, len: 3, text: "jusqu'au", joined: true }], "one run over the three words");
  assert.equal(shownIn("fr", ["that", "to", "the", "children"], [["que", "que"], ["à", "à"], ["les", "le"], ["enfants", "enfant"]]).line, "qu'aux enfants");
});
await test("joins, French: the aspirated-h list's word beginnings, and the mute ones it would catch (lex-lang-eu's review)", () => {
  const two = (a, b) => shownIn("fr", ["x", "y"], [a, b]).line;
  assert.equal(two(["la", "le"], ["hallucination", "hallucination"]), "l'hallucination", "muteH");
  assert.equal(two(["le", "le"], ["hall", "hall"]), "le hall");
  assert.equal(two(["le", "le"], ["harcèlement", "harcèlement"]), "le harcèlement");
  assert.equal(two(["le", "le"], ["hollandais", "hollandais"]), "le hollandais");
  assert.equal(two(["la", "le"], ["hulotte", "hulotte"]), "la hulotte");
  assert.equal(two(["le", "le"], ["hélicoptère", "hélicoptère"]), "l'hélicoptère", "héler's forms don't catch it");
  assert.equal(two(["le", "le"], ["honneur", "honneur"]), "l'honneur", "honnir's forms don't catch it");
  assert.equal(two(["la", "le"], ["hargne", "hargne"]), "la hargne");
});
await test("joins, French: before a name only a vowel elides (d'Alice, de Harry)", () => {
  assert.equal(shownIn("fr", ["of", "Harry"], [["de", "de"], ["Harry", null]]).line, "de Harry");
  assert.equal(shownIn("fr", ["of", "Emma"], [["de", "de"], ["Emma", null]]).line, "d'Emma");
});
await test("joins, French: Codex's first pass (horde, harem, d'yeux, a dash after the article, halogène)", () => {
  const two = (a, b) => shownIn("fr", ["x", "y"], [a, b]).line;
  assert.equal(two(["la", "le"], ["horde", "horde"]), "la horde");
  assert.equal(two(["le", "le"], ["harem", "harem"]), "le harem");
  assert.equal(two(["de", "de"], ["yeux", "œil"]), "d'yeux");
  assert.equal(two(["le", "le"], ["yaourt", "yaourt"]), "le yaourt");
  assert.equal(two(["le", "le"], ["halo", "halo"]), "le halo");
  assert.equal(two(["le", "le"], ["halogène", "halogène"]), "l'halogène");
  assert.equal(shownIn("fr", ["to", "the—", "admittedly", "oak"], [["à", "à"], ["le—", "le"], ["assurément", "assurément"], ["chêne", "chêne"]]).line, "au— assurément chêne", "a dash after le: it can't elide, so it contracts");
});
await test("joins, French: Codex's second pass (je hais, l'Haïtien)", () => {
  const two = (a, b) => shownIn("fr", ["x", "y"], [a, b]).line;
  assert.equal(two(["Je", "je"], ["hais", "haïr"]), "Je hais");
  assert.equal(two(["il", "il"], ["hait", "haïr"]), "il hait");
  assert.equal(two(["le", "le"], ["haïtien", "haïtien"]), "l'haïtien");
});
await test("an abbreviation that ends its sentence: its full stop ends the sentence too, so the gloss keeps it", async () => {
  const book = await makeBook("He lives on Elm St.");
  const sentence = (last) => ({
    s: 0, e: 5, t: [["Hij", "hij"], ["woont", "wonen"], ["aan", "aan"], ["Elm", null], [last, "straat"]], text: "Hij woont aan de Elmstraat.",
    m: [["Hij", "He", [0], "hij"], ["woont", "lives", [1], "wonen"], ["aan", "on", [2], "aan"], ["de", "", [], "de"], ["Elmstraat.", "Elm St.", [3, 4], "straat"]],
  });
  const problemsWith = async (last) => sentenceProblems({ ...sentence(last), h: await sentenceHash(book.words, 0, 5) }, 0, book, { kind: "weave", to: "nl" });
  assert.ok((await problemsWith("straat")).some((e) => e.includes("must keep the word's punctuation")), "straat, its sentence's end lost");
  assert.ok(!(await problemsWith("straat.")).some((e) => e.includes("must keep the word's punctuation")), "straat. keeps it");
});
await test("joins, French: Codex's third pass (le heaume, la hampe, la herse)", () => {
  const two = (a, b) => shownIn("fr", ["x", "y"], [a, b]).line;
  assert.equal(two(["le", "le"], ["heaume", "heaume"]), "le heaume");
  assert.equal(two(["la", "le"], ["hampe", "hampe"]), "la hampe");
  assert.equal(two(["la", "le"], ["herse", "herse"]), "la herse");
  assert.equal(two(["le", "le"], ["héraut", "héraut"]), "le héraut");
});
await test("an abbreviation at a sentence's end before another end mark: the mark ends it (Elm St.? → straat?)", () => {
  const abbreviations = new Set(LANGUAGES.en.abbreviations);
  assert.deepEqual(glossFrame("St.", abbreviations, true), ["", "."], "its full stop ends the sentence");
  assert.deepEqual(glossFrame("St.?", abbreviations, true), ["", "?"]);
  assert.deepEqual(glossFrame("St.!”", abbreviations, true), ["", "!”"]);
  assert.deepEqual(glossFrame("St.”", abbreviations, true), ["", ".”"], "a closing quote isn't an end mark");
  assert.deepEqual(glossFrame("St.?", abbreviations), ["", "?"]);
});
await test("Codex's fourth pass: Greek's ; ends a sentence after an abbreviation; noElision is whole words; hotdog", () => {
  assert.deepEqual(glossFrame("χλμ.;", new Set(["χλμ."]), true, "el"), ["", ";"]);
  assert.deepEqual(glossFrame("χλμ.;", new Set(["χλμ."]), true, "en"), ["", ".;"], "; ends nothing in English");
  const two = (a, b) => shownIn("fr", ["x", "y"], [a, b]).line;
  assert.equal(two(["de", "de"], ["ouillage", "ouillage"]), "d'ouillage");
  assert.equal(two(["le", "le"], ["ouistiti", "ouistiti"]), "le ouistiti");
  assert.equal(two(["le", "le"], ["hotdog", "hotdog"]), "le hotdog");
});
await test("Codex's fifth pass: a pronoun le (lemma il) never contracts; huer and héler's forms keep their h", () => {
  assert.equal(shownIn("fr", ["to", "him", "see"], [["à", "à"], ["le", "il"], ["voir", "voir"]]).line, "à le voir");
  assert.equal(shownIn("fr", ["to", "the", "market"], [["à", "à"], ["le", "le"], ["marché", "marché"]]).line, "au marché", "the article does");
  const two = (a, b) => shownIn("fr", ["x", "y"], [a, b]).line;
  assert.equal(two(["je", "je"], ["hue", "huer"]), "je hue");
  assert.equal(two(["nous", "nous"], ["hélions", "héler"]), "nous hélions");
  assert.equal(two(["que", "que"], ["hélions", "héler"]), "que hélions");
  assert.equal(two(["le", "le"], ["hélicoptère", "hélicoptère"]), "l'hélicoptère");
});
await test("Codex's sixth pass: c'eût été; il ne haït (haïr's h) but l'haïtien", () => {
  const two = (a, b) => shownIn("fr", ["x", "y"], [a, b]).line;
  assert.equal(two(["Ce", "ce"], ["eût", "avoir"]), "C'eût");
  assert.equal(two(["ne", "ne"], ["haït", "haïr"]), "ne haït");
  assert.equal(two(["le", "le"], ["haïtien", "haïtien"]), "l'haïtien");
});
await test("Codex's seventh pass: a two-word gloss (s'il est), a y said as a vowel (d'Yves)", () => {
  assert.equal(shownIn("fr", ["if", "he's", "hungry."], [["si", "si"], ["il est", "être"], ["affamé.", "affamé"]]).line, "s'il est affamé.");
  assert.equal(shownIn("fr", ["of", "Yves."], [["de", "de"], ["Yves.", null]]).line, "d'Yves.");
  assert.equal(shownIn("fr", ["of", "York."], [["de", "de"], ["York.", null]]).line, "de York.", "a y before a vowel: a consonant");
  const two = (a, b) => shownIn("fr", ["x", "y"], [a, b]).line;
  assert.equal(two(["le", "le"], ["yoga", "yoga"]), "le yoga");
  assert.equal(two(["que", "que"], ["elle a", "avoir"]), "qu'elle a");
});
await test("Codex's eighth pass: la harangue, le haubert, de hardes; l'huitre", () => {
  const two = (a, b) => shownIn("fr", ["x", "y"], [a, b]).line;
  assert.equal(two(["la", "le"], ["harangue", "harangue"]), "la harangue");
  assert.equal(two(["le", "le"], ["haubert", "haubert"]), "le haubert");
  assert.equal(two(["de", "de"], ["hardes", "hardes"]), "de hardes");
  assert.equal(two(["la", "le"], ["huitre", "huitre"]), "l'huitre");
  assert.equal(two(["la", "le"], ["huître", "huître"]), "l'huître");
  assert.equal(two(["le", "le"], ["huit", "huit"]), "le huit");
});
await test("Codex's ninth pass: a two-word first gloss joins by its last word (Parce qu'il, près du); je hume, le hâbleur", () => {
  assert.equal(shownIn("fr", ["Because", "he", "comes."], [["Parce que", "parce que"], ["il", "il"], ["vient.", "venir"]]).line, "Parce qu'il vient.");
  assert.equal(shownIn("fr", ["near", "the", "wood"], [["près de", "près de"], ["le", "le"], ["bois", "bois"]]).line, "près du bois");
  const two = (a, b) => shownIn("fr", ["x", "y"], [a, b]).line;
  assert.equal(two(["Je", "je"], ["hume", "humer"]), "Je hume");
  assert.equal(two(["la", "le"], ["humeur", "humeur"]), "l'humeur");
  assert.equal(two(["le", "le"], ["humain", "humain"]), "l'humain");
  assert.equal(two(["le", "le"], ["hâbleur", "hâbleur"]), "le hâbleur");
});
await test("Codex's tenth pass: je humerai, ne hélât, le harfang, le hourra; l'humérus", () => {
  const two = (a, b) => shownIn("fr", ["x", "y"], [a, b]).line;
  assert.equal(two(["Je", "je"], ["humerai", "humer"]), "Je humerai");
  assert.equal(two(["ne", "ne"], ["hélât", "héler"]), "ne hélât");
  assert.equal(two(["le", "le"], ["harfang", "harfang"]), "le harfang");
  assert.equal(two(["le", "le"], ["hourra", "hourra"]), "le hourra");
  assert.equal(two(["le", "le"], ["humérus", "humérus"]), "l'humérus");
});
await test("Codex's eleventh pass: c'en est; a pronoun after its verb never elides (fais le entrer, suis je heureux, puis je entrer)", () => {
  assert.equal(shownIn("fr", ["It", "is", "enough."], [["Ce", "ce"], ["en est", "être"], ["assez.", "assez"]]).line, "Ce en est assez.", "not before en (Codex's thirty-second pass): a missed elision");
  assert.equal(shownIn("fr", ["Make", "him", "enter."], [["Fais", "faire"], ["le", "il"], ["entrer.", "entrer"]]).line, "Fais le entrer.");
  assert.equal(shownIn("fr", ["Am", "I", "happy?"], [["Suis", "être"], ["je", "je"], ["heureux?", "heureux"]]).line, "Suis je heureux?");
  assert.equal(shownIn("fr", ["Can", "I", "enter?"], [["Puis", "pouvoir"], ["je", "je"], ["entrer?", "entrer"]]).line, "Puis je entrer?");
  assert.equal(shownIn("fr", ["I", "have"], [["je", "je"], ["ai", "avoir"]]).line, "j'ai", "before its verb it does");
  assert.equal(shownIn("fr", ["I", "love"], [["Je", "je"], ["aime", "aimer"]]).line, "J'aime");
  assert.equal(shownIn("fr", ["he", "gave", "me", "a"], [["il", "il"], ["donna", "donner"], ["me", "moi"], ["un", "un"]]).line, "il donna me un");
  assert.equal(shownIn("fr", ["the", "tree"], [["le", "le"], ["arbre", "arbre"]]).line, "l'arbre", "the article does");
});
await test("Codex's twelfth pass: a gloss of several words ending with an article (tout l'arbre); one starting with a verb doesn't elide je (je ai eu)", () => {
  assert.equal(shownIn("fr", ["I", "had", "a", "dog."], [["Je", "je"], ["ai eu", "avoir"], ["un", "un"], ["chien.", "chien"]]).line, "Je ai eu un chien.", "a two-word verb gloss: a missed elision, the safe side (Codex's thirty-first pass)");
  assert.equal(shownIn("fr", ["all", "the", "tree"], [["tout le", "tout"], ["arbre", "arbre"]]).line, "tout l'arbre");
});
await test("Codex's thirteenth pass: an inverted je before an inflected adjective stays (Suis je heureuse?)", () => {
  assert.equal(shownIn("fr", ["Am", "I", "happy?"], [["Suis", "être"], ["je", "je"], ["heureuse?", "heureux"]]).line, "Suis je heureuse?");
  assert.equal(shownIn("fr", ["I", "was"], [["je", "je"], ["étais", "être"]]).line, "j'étais");
  assert.equal(shownIn("fr", ["I", "live"], [["je", "je"], ["habite", "habiter"]]).line, "j'habite");
});
await test("Codex's fourteenth pass: after an English auxiliary je never elides (Suis je étrangère?); an article opening a gloss contracts (du mien, des chats)", () => {
  assert.equal(shownIn("fr", ["Am", "I", "foreign?"], [["Suis", "être"], ["je", "je"], ["étrangère?", "étranger"]]).line, "Suis je étrangère?");
  assert.equal(shownIn("fr", ["Have", "I", "eaten?"], [["Ai", "avoir"], ["je", "je"], ["mangé?", "manger"]]).line, "Ai je mangé?");
  assert.equal(shownIn("fr", ["I", "also", "have"], [["je", "je"], ["aussi", "aussi"], ["ai", "avoir"]]).line, "je aussi ai");
  assert.equal(shownIn("fr", ["Take", "from", "mine."], [["Prends", "prendre"], ["de", "de"], ["le mien.", "mien"]]).line, "Prends du mien.");
  assert.equal(shownIn("fr", ["of", "cats"], [["de", "de"], ["les chats", "chat"]]).line, "des chats");
});
await test("Codex's fifteenth pass: after a negative auxiliary je never elides (Haven't I); me, te, se never elide in a woven line", () => {
  assert.equal(shownIn("fr", ["Haven't", "I", "opened"], [["N'ai pas", "avoir"], ["je", "je"], ["ouvert", "ouvrir"]]).line, "N'ai pas je ouvert");
  assert.equal(shownIn("fr", ["He", "showed", "me", "trees."], [["Il", "il"], ["montra", "montrer"], ["me", "moi"], ["arbres.", "arbre"]]).line, "Il montra me arbres.");
  assert.equal(shownIn("fr", ["she", "told", "herself", "everything"], [["elle", "elle"], ["dit", "dire"], ["se", "se"], ["aimait", "aimer"]]).line, "elle dit se aimait");
});
await test("Codex's sixteenth pass: a joined gloss's last word elides in turn (qu'assez d'eau); a clause's end isn't an inversion (peux; j'ai)", () => {
  assert.equal(shownIn("fr", ["that", "enough", "water"], [["que", "que"], ["assez de", "assez"], ["eau", "eau"]]).line, "qu'assez d'eau");
  assert.equal(shownIn("fr", ["can;", "I", "have"], [["peux;", "pouvoir"], ["je", "je"], ["ai", "avoir"]]).line, "peux; j'ai");
  assert.equal(shownIn("fr", ["can", "I", "have"], [["peux", "pouvoir"], ["je", "je"], ["ai", "avoir"]]).line, "peux je ai", "Can I have …?");
});
await test("Codex's seventeenth pass: a joined gloss's last word contracts in turn (au côté du garçon)", () => {
  assert.equal(shownIn("fr", ["beside", "the", "boy"], [["à", "à"], ["le côté de", "côté"], ["le", "le"], ["garçon", "garçon"]]).line, "au côté du garçon");
});
await test("Codex's eighteenth pass: en opening a phrase isn't the pronoun (Je en fait comprends)", () => {
  assert.equal(shownIn("fr", ["I", "actually", "understand."], [["Je", "je"], ["en fait", "en fait"], ["comprends.", "comprendre"]]).line, "Je en fait comprends.");
});
await test("Codex's nineteenth pass: ce before a phrase opening with en stays (Ce en fait est facile)", () => {
  assert.equal(shownIn("fr", ["It", "actually", "is", "easy."], [["Ce", "ce"], ["en fait", "en fait"], ["est", "être"], ["facile.", "facile"]]).line, "Ce en fait est facile.");
  assert.equal(shownIn("fr", ["It", "actually", "is", "easy."], [["Ce", "ce"], ["en réalité", "réalité"], ["est", "être"], ["facile.", "facile"]]).line, "Ce en réalité est facile.");
});
await test("Codex's twentieth pass: a phrase's lemma isn't a verb's (Je en particulier aime)", () => {
  assert.equal(shownIn("fr", ["I", "especially", "like"], [["Je", "je"], ["en particulier", "en particulier"], ["aime", "aimer"]]).line, "Je en particulier aime");
});
await test("Codex's twenty-first pass: an abbreviation before a spaced » still ends its sentence (etc. »)", async () => {
  const book = await makeBook("« Du pain, etc. »", { lang: "fr" });
  assert.deepEqual(book.words, ["«", "Du", "pain,", "etc.", "»"]);
  const sentence = (gloss) => ({
    s: 0, e: 5, t: [["«", null], ["Some", "some"], ["bread,", "bread"], [gloss, "and so on"], ["»", null]], text: "« Some bread, and so on. »",
    m: [["«", "«", [0], null], ["Some", "Du", [1], "some"], ["bread,", "pain", [2], "bread"], ["and so on.", "etc.", [3], "and so on"], ["»", "»", [4], null]],
  });
  const problemsWith = async (gloss) => sentenceProblems({ ...sentence(gloss), h: await sentenceHash(book.words, 0, 5) }, 0, book, { kind: "help", to: "en" });
  assert.ok((await problemsWith("and so on")).some((e) => e.includes("must keep the word's punctuation")), "its full stop ends the sentence");
  assert.ok(!(await problemsWith("and so on.")).some((e) => e.includes("must keep the word's punctuation")));
});
await test("Codex's twenty-second pass: a spaced end mark after the abbreviation ends the sentence (etc. ?)", () => {
  const abbreviations = new Set(LANGUAGES.fr.abbreviations);
  assert.deepEqual(glossFrame("etc.", abbreviations, true, "fr", "?»"), ["", ""]);
  assert.deepEqual(glossFrame("etc.", abbreviations, true, "fr", "»"), ["", "."]);
});
await test("Codex's twenty-third pass: je elides only from a book language whose questions the table knows", () => {
  const t = [["Ai", "avoir"], ["je", "je"], ["entendu?", "entendre"]];
  assert.equal(shownIn("fr", ["Habe", "ich", "gehört?"], t, { from: "de" }).line, "Ai je entendu?");
  assert.equal(shownIn("fr", ["I", "have"], [["je", "je"], ["ai", "avoir"]], { from: "de" }).line, "je ai", "from German, never");
  assert.equal(shownIn("fr", ["I", "have"], [["je", "je"], ["ai", "avoir"]], { from: null }).line, "je ai", "nor with no book language");
  assert.equal(shownIn("fr", ["I", "have"], [["je", "je"], ["ai", "avoir"]]).line, "j'ai", "from English");
});
await test("Codex's twenty-fourth to twenty-sixth passes: an auxiliary before I blocks elision in any case and place (May I …?, “Am I …?”); the month May only costs a missed one", () => {
  assert.equal(shownIn("fr", ["In", "May", "I", "arrived."], [["En", "en"], ["mai", "mai"], ["je", "je"], ["arrivai.", "arriver"]]).line, "En mai je arrivai.", "the safe side");
  assert.equal(shownIn("fr", ["He", "asked,", "“Am", "I", "in", "danger?”"], [["Il", "il"], ["demanda,", "demander"], ["“Suis", "être"], ["je", "je"], ["en", "en"], ["danger?”", "danger"]]).line, "Il demanda, “Suis je en danger?”");
  assert.equal(shownIn("fr", ["May", "I", "enter?"], [["Puis", "pouvoir"], ["je", "je"], ["entre?", "entrer"]]).line, "Puis je entre?");
});
await test("Codex's twenty-fifth pass: after a dash (— Am I in danger?)", () => {
  assert.equal(shownIn("fr", ["—", "Am", "I", "in", "danger?"], [["—", null], ["Suis", "être"], ["je", "je"], ["en", "en"], ["danger?", "danger"]]).line, "— Suis je en danger?");
});
await test("Codex's twenty-seventh pass: je never elides in a question, wherever its verb went (Am even I in danger?)", () => {
  assert.equal(shownIn("fr", ["Am", "even", "I", "in", "danger?"], [["Suis", "être"], ["même", "même"], ["je", "je"], ["en", "en"], ["danger?", "danger"]]).line, "Suis même je en danger?");
  assert.equal(shownIn("fr", ["Am", "even", "I", "going?"], [["Suis", "être"], ["même", "même"], ["je", "je"], ["allant?", "aller"]]).line, "Suis même je allant?");
  assert.equal(shownIn("fr", ["I", "have", "it."], [["Je", "je"], ["ai", "avoir"], ["le.", "il"]]).line, "J'ai le.", "a statement does");
  assert.equal(shownIn("fr", ["I", "have", "it;", "do", "you?"], [["Je", "je"], ["ai", "avoir"], ["le;", "il"], ["do", null], ["tu?", "tu"]]).line, "J'ai le; do tu?", "its clause ends before the question");
});
await test("Codex's twenty-eighth pass: an abbreviation's full stop doesn't end the question (Have even I opened Mr. Brown's door?)", () => {
  assert.equal(shownIn("fr", ["Have", "even", "I", "opened", "Mr.", "door?"], [["Ai", "avoir"], ["même", "même"], ["je", "je"], ["ouvert", "ouvrir"], ["M.", "monsieur"], ["porte?", "porte"]]).line, "Ai même je ouvert M. porte?");
});
await test("Codex's twenty-ninth pass: an auxiliary anywhere before I in its clause means a question, however it ends", () => {
  const t = (rest) => [["Ai", "avoir"], ["même", "même"], ["je", "je"], ["ouvert", "ouvrir"], ...rest];
  assert.equal(shownIn("fr", ["Have", "even", "I", "opened", "J.", "door?"], t([["J.", null], ["porte?", "porte"]])).line, "Ai même je ouvert J. porte?");
  assert.equal(shownIn("fr", ["Have", "even", "I", "opened...", "the", "door?"], t([["la", "le"], ["porte?", "porte"]]).map((x, i) => (i === 3 ? ["ouvert...", "ouvrir"] : x))).line, "Ai même je ouvert... la porte?");
  assert.equal(shownIn("fr", ["Have", "even", "I", "opened", "the", "door", "?"], t([["la", "le"], ["porte", "porte"], ["?", null]])).line, "Ai même je ouvert la porte ?");
  assert.equal(shownIn("fr", ["Then", "I", "have"], [["Puis", "puis"], ["je", "je"], ["ai", "avoir"]]).line, "Puis j'ai", "no auxiliary before it: a statement");
  assert.equal(shownIn("fr", ["He", "said", "that", "I", "was"], [["Il", "il"], ["dit", "dire"], ["que", "que"], ["je", "je"], ["étais", "être"]]).line, "Il dit que j'étais");
});
await test("Codex's thirtieth pass: an initial doesn't end the clause (Have J. Brown and I opened …?)", () => {
  assert.equal(shownIn("fr", ["Have", "J.", "Brown", "and", "I", "opened"], [["Avons", "avoir"], ["J.", null], ["Brown", null], ["et", "et"], ["je", "je"], ["ouvert", "ouvrir"]]).line, "Avons J. Brown et je ouvert");
});
await test("Codex's thirty-first pass: a list's comma doesn't end the clause (Have Tom, Mary and I …?); a phrase gloss isn't a verb (Je avec plaisir)", () => {
  assert.equal(shownIn("fr", ["Have", "Tom,", "Mary", "and", "I", "opened"], [["Avons", "avoir"], ["Tom,", null], ["Mary", null], ["et", "et"], ["je", "je"], ["ouvert", "ouvrir"]]).line, "Avons Tom, Mary et je ouvert");
  assert.equal(shownIn("fr", ["I", "gladly", "opened"], [["Je", "je"], ["avec plaisir", "plaisir"], ["ouvris", "ouvrir"]]).line, "Je avec plaisir ouvris");
  assert.equal(shownIn("fr", ["Yes,", "I", "have"], [["Oui,", "oui"], ["je", "je"], ["ai", "avoir"]]).line, "Oui, j'ai");
});
await test("Codex's thirty-third pass: a numeral doesn't end the clause (Have my 2 brothers and I …?)", () => {
  assert.equal(shownIn("fr", ["Have", "my", "2", "brothers", "and", "I", "opened"], [["Avons", "avoir"], ["mes", "mon"], ["2", null], ["frères", "frère"], ["et", "et"], ["je", "je"], ["ouvert", "ouvrir"]]).line, "Avons mes 2 frères et je ouvert");
});
await test("Codex's thirty-fourth pass: initials run together don't end the clause (Have J.R. and I …?)", () => {
  assert.equal(shownIn("fr", ["Have", "J.R.", "and", "I", "opened"], [["Avons", "avoir"], ["J.R.", null], ["et", "et"], ["je", "je"], ["ouvert", "ouvrir"]]).line, "Avons J.R. et je ouvert");
});
await test("an abbreviation's full stop doesn't hide a name that stays (St kept)", async () => {
  const book = await makeBook("St. Louis slept.");
  const sentence = {
    s: 0, e: 3, t: [["saint.", "saint"], ["Louis", null], ["sliep.", "slapen"]], text: "saint. Louis sliep.",
    m: [["saint.", "St.", [0], "saint"], ["Louis", "Louis", [1], null], ["sliep.", "slept", [2], "slapen"]],
  };
  const problems = await sentenceProblems({ ...sentence, h: await sentenceHash(book.words, 0, 3) }, 0, book, { kind: "weave", to: "nl" }, new Set(["St"]));
  assert.ok(problems.some((e) => e.includes("is a name that stays as it is")), problems.join(" | "));
});
await test("joins: the elided form takes the apostrophe its sentence's text uses", () => {
  assert.equal(shownIn("fr", ["that", "they"], [["que", "que"], ["elles", "elle"]], { text: "Qu’elles viennent." }).line, "qu’elles");
  assert.equal(shownIn("fr", ["that", "they"], [["que", "que"], ["elles", "elle"]], { text: "Qu'elles viennent." }).line, "qu'elles");
});
await test("joins, Spanish: a el is al, de el del; never before a capitalized El or él", () => {
  assert.equal(shownIn("es", ["to", "the", "park"], [["a", "a"], ["el", "el"], ["parque", "parque"]]).line, "al parque");
  assert.equal(shownIn("es", ["To", "the", "park"], [["A", "a"], ["el", "el"], ["parque", "parque"]]).line, "Al parque");
  assert.equal(shownIn("es", ["of", "the", "dog"], [["de", "de"], ["el", "el"], ["perro", "perro"]]).line, "del perro");
  assert.equal(shownIn("es", ["of", "El", "Salvador"], [["de", "de"], ["El", "el"], ["Salvador", null]]).line, "de El Salvador");
  assert.equal(shownIn("es", ["to", "him"], [["a", "a"], ["él", "él"]]).line, "a él");
});
await test("joins: a language without them (Dutch) shows exactly what it showed before, and so does no language", async () => {
  for (const bank of [new Set(), new Set(["zijn"]), new Set(["zijn", "moe", "zij", "gaan", "neer"])]) {
    for (const sentence of WEAVE.sentences) assert.deepEqual(weaveSentence(sentence, BOOK.words, bank, { lang: "nl" }), weaveSentence(sentence, BOOK.words, bank));
  }
  const t = [["de", "de"], ["le", "le"], ["chat", "chat"]];
  assert.equal(shownIn(null, ["of", "the", "cat"], t).line, "de le chat");
  assert.equal(shownIn("nl", ["of", "the", "cat"], t).line, "de le chat");
});
await test("joins: weaveAt shows a weave in its own language", async () => {
  const fr = { ...clone(WEAVE), to: "fr" };
  fr.sentences[0].t = [["Alice", null], ["de", "de"], ["le", "le"]];
  const views = weaveAt(BOOK, fr, new Set(["de", "le"]));
  assert.equal(views[0].words.filter((w) => w.show !== "hidden").map((w) => w.text).join(" "), "Alice du");
});

await test("a layer's credit as the app shows it: the books pipeline's say they were made with an AI model; anyone else's keeps its own", () => {
  const made = { pipeline: "lexicommons-books 1", model: "gpt-6.1-sol", run: "help-en-1" };
  // The pipeline's layers, whatever their own credit field says (the files from before 7 Nov 2026 say "Translated for Lexicommons").
  assert.equal(layerCredit({ kind: "help", credit: "Translated for Lexicommons", made }), MADE_WITH_AI);
  assert.equal(layerCredit({ kind: "weave", credit: "Translated for Lexicommons", made }), MADE_WITH_AI);
  assert.equal(MADE_WITH_AI, "Made for Lexicommons with an AI model and checked sentence by sentence");
  // Anyone else's: no record of being made, another maker, or no model named keeps the layer's own words.
  assert.equal(layerCredit({ kind: "help", credit: "Translated by Ada" }), "Translated by Ada");
  assert.equal(layerCredit({ kind: "weave", credit: "Woven by someone's own AI", made: { pipeline: "your-ai", model: "x" } }), "Woven by someone's own AI");
  assert.equal(layerCredit({ kind: "help", credit: "Ours", made: { pipeline: "lexicommons-books 1" } }), "Ours");
  assert.equal(layerCredit(null), null);
});

// ---------- a parallel layer: a person's translation beside a picture book ----------

/** A parallel layer for the picture book: its title page and its second page, each sentence of the second its own line. */
const makeParallel = (book, change = {}) => ({
  format: "lexicommons-weave", v: 1, kind: "parallel", book: book.id, bookVersion: book.version, from: book.lang, to: "en",
  licence: "CC BY 4.0", spdx: "CC-BY-4.0", credit: "The wet coat, written for the test",
  source: { ref: "https://example.org/stories/en/wet-coat", title: "The wet coat" },
  made: { pipeline: "test-parallel", sha256: "0".repeat(64), at: "2026-11-07T18:09" },
  pages: ["The wet coat", "It’s raining. I go outside, but my coat is wet."],
  sentences: ["The wet coat", "It’s raining.", "I go outside, but my coat is wet."],
  ...change,
});
const parallelProblems = async (change, book) => {
  const b = book ?? (await makePictureBook());
  return (await validateWeave(makeParallel(b, change), b)).join("\n");
};

await test("parallel: a translation by sentence passes; so does one whose page goes whole (every sentence on it null)", async () => {
  const book = await makePictureBook();
  assert.deepEqual(book.sentences, [[0, 3], [3, 5], [5, 14]], "the fixture's three sentences: its title, then two on its second page");
  assert.equal(await parallelProblems({}, book), "");
  assert.equal(await parallelProblems({ sentences: ["The wet coat", null, null] }, book), "");
  assert.equal(await parallelProblems({ sentences: [null, null, null] }, book), "");
});
await test("parallel: on a page, every sentence or none, and given ones joined are its page's translation exactly", async () => {
  assert.match(await parallelProblems({ sentences: ["The wet coat", "It’s raining.", null] }), /Page 1: give every sentence on it, or none \(1 of its 2 given\)/);
  assert.match(await parallelProblems({ sentences: ["The wet coat", "It’s raining.", "I go outside, but my coat’s wet."] }), /Page 1: its sentences, joined, must be its page's translation exactly/);
  assert.match(await parallelProblems({ pages: ["The wet coat", "It’s raining.  I go outside, but my coat is wet."] }), /pages\[1\] must be its translation/);
});
await test("parallel: a language written without spaces joins its sentences with nothing", async () => {
  const ja = { to: "ja", pages: ["ぬれたコート", "雨が降っている。外に出るけど、コートがぬれている。"], sentences: ["ぬれたコート", "雨が降っている。", "外に出るけど、コートがぬれている。"] };
  assert.equal(LANGUAGES.ja.separator, "", "the fixture's premise: Japanese joins with nothing");
  assert.equal(await parallelProblems(ja), "");
  assert.match(await parallelProblems({ ...ja, pages: ["ぬれたコート", "雨が降っている。 外に出るけど、コートがぬれている。"] }), /Page 1: its sentences, joined/);
});
await test("parallel: a page with words has its translation, and one with none has \"\"", async () => {
  const book = await makePictureBook({ pages: [{ s: 0, e: 0, picture: 0 }, { s: 0, e: 14, picture: 1 }] });
  assert.equal(await parallelProblems({ pages: ["", "The wet coat It’s raining. I go outside, but my coat is wet."] }, book), "");
  assert.match(await parallelProblems({ pages: ["A cover", "The wet coat It’s raining. I go outside, but my coat is wet."] }, book), /pages\[0\] must be "": the page has no words/);
  assert.match(await parallelProblems({ pages: ["The wet coat", ""] }), /pages\[1\] is empty, but the page has words/);
  assert.match(await parallelProblems({ pages: ["The wet coat"] }), /pages must hold one entry for each of the book's 2 pages/);
});
await test("parallel: a sentence across a page's edge is null", async () => {
  // Made by hand (validateWeave reads the book's spans as given): a page that ends inside the second page's last sentence.
  const book = { ...(await makePictureBook()), pages: [{ s: 0, e: 3, picture: 0 }, { s: 3, e: 9, picture: 1 }, { s: 9, e: 14, picture: null }] };
  const pages = ["The wet coat", "It’s raining. I go outside,", "but my coat is wet."];
  assert.equal(await parallelProblems({ pages, sentences: ["The wet coat", null, null] }, book), "");
  assert.match(await parallelProblems({ pages, sentences: ["The wet coat", null, "I go outside, but my coat is wet."] }, book), /sentences\[2\] runs across a page's edge, so it must be null/);
});
await test("parallel: no fields but its own, nothing a model made, an open license, its source and what wrote it", async () => {
  assert.match(await parallelProblems({ glossary: [] }), /A parallel layer has no glossary/);
  assert.match(await parallelProblems({ made: { pipeline: "test-parallel", sha256: "0".repeat(64), at: "2026-11-07T18:09", model: "a model" } }), /names no model/);
  assert.match(await parallelProblems({ made: { pipeline: "test-parallel", sha256: "abc", at: "2026-11-07" } }), /made must be/);
  assert.match(await parallelProblems({ made: { pipeline: "test-parallel", sha256: "0".repeat(64), at: "soon" } }), /made must be/);
  assert.match(await parallelProblems({ spdx: "CC-BY-NC-4.0" }), /spdx must be the same license's SPDX id, an open one/);
  assert.match(await parallelProblems({ licence: " CC BY 4.0" }), /licence must be/);
  assert.match(await parallelProblems({ credit: "x".repeat(501) }), /credit must say who made the translation/);
  assert.match(await parallelProblems({ source: { ref: "http://example.org/wet-coat", title: "The wet coat" } }), /source must be/);
  assert.match(await parallelProblems({ source: { ref: "https://example.org/wet-coat" } }), /source must be/);
  assert.match(await parallelProblems({ sentences: ["The wet coat", "It’s raining.", { text: "I go outside, but my coat is wet." }] }), /sentences\[2\] must be its translation/);
  assert.match(await parallelProblems({ sentences: ["The wet coat", "x".repeat(2001), "y"] }), /sentences\[1\] must be its translation \(one clean line, at most 2,000 characters\)/);
  assert.match(await parallelProblems({ pages: ["The wet coat", "x".repeat(4001)], sentences: [null, null, null] }), /pages\[1\] must be its translation: one clean line, at most 4,000 characters/);
});
await test("parallel: a picture book's only, into another language, for this version", async () => {
  const book = await makePictureBook();
  const { pages, ...novel } = book;
  assert.match((await validateWeave(makeParallel(novel), novel)).join(), /goes with a picture book, page by page: this book has no pages/);
  assert.match(await parallelProblems({ to: "nl" }), /to must be a supported language other than nl/);
  assert.match(await parallelProblems({ bookVersion: "0000000000000000" }), /This weave is for test-picture-book@0000000000000000/);
  assert.match(await parallelProblems({ kind: "gloss" }), /kind must be one of weave, help, parallel/);
});
await test("parallel: its credit is its own as written (a person made it: no model, so never the books pipeline's AI line)", () => {
  const layer = { kind: "parallel", credit: "The wet coat, written for the test", made: { pipeline: "globalstorybooks-parallel", sha256: "0".repeat(64), at: "2026-11-07T18:09" } };
  assert.equal(layerCredit(layer), "The wet coat, written for the test");
});

if (failures.length) {
  console.error(`book format: ${passed} passed, ${failures.length} failed\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log(`book format: ${passed}/${passed} passed`);
