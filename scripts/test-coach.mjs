// Your study as your AI reads it (src/coach.ts), on a record shaped as the device builds it. `node scripts/test-coach.mjs` (exit 0 = pass).
// Dutch's grammar as the library has it, first: packs/path-nl.json uses its later patterns (scripts/fixtures/library-grammar.mjs).
import "./fixtures/library-grammar.mjs";
import assert from "node:assert/strict";
import { workerEnv } from "./fixtures/worker-env.mjs";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LIBRARY_DIR = join(dirname(fileURLToPath(import.meta.url)), "../library");

workerEnv();
const { checkRecord, conceptOf, lessonOf, missesOf, summaryOf } = await import("../src/coach.ts");

let failed = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n").slice(0, 6).join("\n        ")}`);
  }
};
const v2 = { id: "p:v2", name: "Verb second", about: "In a main clause the verb comes second.", level: 1, recall: { read: 41 }, seen: 7, right: 3, wrong: 4, lapses: 2, last: "2026-11-04T10:00:00.000Z" };
const untouched = { id: "p:omte", name: "om … te", about: "In order to.", level: 0, seen: 0, right: 0, wrong: 0 };
const record = {
  version: 1,
  language: "nl",
  languageName: "Dutch",
  from: "en",
  device: "abc",
  evidenceAt: 1000,
  place: { lesson: 3, of: 132, id: "path-nl/l003", title: "At home", lessonsDone: 2, today: { left: 9 } },
  lessons: [
    { n: 1, id: "path-nl/l001", title: "Saying hello", status: "done", teaches: [{ unit: "c:hallo", text: "Hallo", means: "Hello" }], sentences: ["s1"] },
    { n: 2, id: "path-nl/l002", title: "Coffee and tea", status: "done", pattern: "p:v2", teaches: [{ unit: "w:drinken", text: "drinken", means: "to drink" }, { unit: "w:koffie", text: "koffie", means: "coffee" }], sentences: ["s2", "s3"] },
    { n: 3, id: "path-nl/l003", title: "At home", status: "current", teaches: [{ unit: "w:huis", text: "huis", means: "house" }], sentences: [] },
  ],
  games: { arrange: { name: "Put it in Dutch order", right: 2, wrong: 6 }, choose: { name: "Choose", right: 9, wrong: 1 } },
  skills: { read: { right: 11, wrong: 7 } },
  struggles: { patterns: [{ id: "p:v2", name: "Verb second", why: "missed 4 of 7; forgotten on 2 separate days" }], words: [{ id: "w:drinken", name: "drinken", why: "missed 2 of 4" }], phrases: [] },
  patterns: [v2, untouched],
  phrases: [{ id: "c:hallo", nl: "Hallo", en: "Hello", level: 2, seen: 3, right: 3, wrong: 0 }],
  words: [{ id: "w:drinken", en: "to drink", level: 1, seen: 4, right: 2, wrong: 2 }, { id: "w:koffie", en: "coffee", level: 3, seen: 5, right: 5, wrong: 0 }],
  misses: [
    { at: "2026-11-04T10:00:00.000Z", game: "Put it in Dutch order", skill: "read", item: "s2", nl: "Morgen drink ik koffie.", literal: ["Tomorrow", "*drink*", "I", "coffee"], en: "Tomorrow I'm drinking coffee.", said: "Morgen ik drink koffie.", units: ["p:v2", "w:drinken"] },
    { at: "2026-11-03T10:00:00.000Z", game: "Fill the gap", skill: "read", item: "s3", nl: "Ik drink thee.", en: "I drink tea.", units: ["w:drinken"] },
    { at: "2026-11-02T10:00:00.000Z", game: "Put it in Dutch order", skill: "read", item: "s4", nl: "Soms lees ik.", en: "Sometimes I read.", units: ["p:v2"] },
  ],
  sentences: {
    s1: { nl: "Hallo!", en: "Hello!", units: ["c:hallo"], words: [], right: 3, missed: 0 },
    s2: { nl: "Morgen drink ik koffie.", literal: ["Tomorrow", "*drink*", "I", "coffee"], en: "Tomorrow I'm drinking coffee.", units: ["p:v2"], words: ["morgen", "drinken", "ik", "koffie"], right: 0, missed: 2, last: "2026-11-04T10:00:00.000Z" },
    s3: { nl: "Ik drink thee.", en: "I drink tea.", units: [], words: ["ik", "drinken", "thee"], right: 1, missed: 1 },
    s4: { nl: "Soms lees ik.", en: "Sometimes I read.", units: ["p:v2"], words: ["soms", "lezen", "ik"], right: 0, missed: 1 },
  },
  totals: { answers: 18, right: 11, wrong: 7, unitsSeen: 12, days: 3, leftOutMisses: 40 },
};

test("a record's check: its version, its language and its time; lists are lists", () => {
  assert.equal(checkRecord(record).language, "nl");
  for (const bad of [{ ...record, version: 2 }, { ...record, language: "../x" }, { ...record, language: 7 }, { ...record, evidenceAt: "soon" }, { ...record, misses: "all" }, { ...record, words: {} }]) assert.throws(() => checkRecord(bad));
});
test("the summary: where they are, what's hardest and why, how each game goes, the grammar they've met with its explanation", () => {
  const s = summaryOf(record, 5000, [{ language: "de", updatedAt: 3000 }]);
  assert.equal(s.languageName, "Dutch");
  assert.equal(s.where.lesson, 3);
  assert.equal(s.currentLesson.title, "At home");
  assert.equal(s.strugglingMost.patterns[0].why, "missed 4 of 7; forgotten on 2 separate days");
  assert.equal(s.byGame["Put it in Dutch order"].percentRight, 25);
  assert.equal(s.recentMisses[0].said, "Morgen ik drink koffie.");
  assert.deepEqual(s.recentMisses[0].about, ["Verb second", "drinken"]);
  assert.equal(s.recentMisses[0].units, undefined);
  assert.equal(s.grammar[0].about, "In a main clause the verb comes second.");
  assert.deepEqual(s.grammarNotMetYet, ["om … te"]);
  assert.equal(s.otherLanguages[0].language, "de");
  assert.match(s.howToRead, /starred/);
  assert.equal(s.words, undefined, "the summary isn't the whole record");
  assert.ok(JSON.stringify(s).length < 8000);
});
test("one lesson: by number, by id, by words of its title; what it taught and how that's going, its sentences, what was missed", () => {
  for (const asked of ["2", "lesson 2", "Lesson 2", "path-nl/l002", "coffee"]) assert.equal(lessonOf(record, asked).title, "Coffee and tea", asked);
  const lesson = lessonOf(record, "2");
  assert.equal(lesson.pattern.name, "Verb second");
  assert.deepEqual(lesson.teaches[0], { text: "drinken", means: "to drink", level: 1, recall: undefined, seen: 4, right: 2, wrong: 2, due: undefined, leech: undefined });
  assert.equal(lesson.sentences.length, 2);
  assert.equal(lesson.missedHere.length, 2);
  const none = lessonOf(record, "99");
  assert.equal(none.found, false);
  assert.match(none.note, /lesson 3 of 132/);
});
test("one concept: a pattern by name or id, a word, a phrase; its explanation, why it's hard, their sentences, what they missed", () => {
  for (const asked of ["p:v2", "v2", "Verb second", "verb second", "verb"]) assert.equal(conceptOf(record, asked).id, "p:v2", asked);
  const pattern = conceptOf(record, "verb second");
  assert.equal(pattern.kind, "pattern");
  assert.match(pattern.about, /verb comes second/);
  assert.match(pattern.why, /missed 4 of 7/);
  assert.equal(pattern.sentences[0].nl, "Morgen drink ik koffie.", "what they missed first");
  assert.equal(pattern.misses.length, 2);
  assert.deepEqual(pattern.inLessons, [{ n: 2, title: "Coffee and tea", status: "done" }]);
  const word = conceptOf(record, "drinken");
  assert.equal(word.kind, "word");
  assert.equal(word.en, "to drink");
  assert.equal(word.sentences.length, 2);
  assert.equal(word.misses.length, 2);
  assert.equal(conceptOf(record, "hallo").kind, "phrase");
  assert.equal(conceptOf(record, "w:koffie").level, 3);
});
test("a form they've only seen in a sentence, and something they haven't", () => {
  const form = conceptOf(record, "drink");
  assert.equal(form.found, false);
  assert.equal(form.sentences.length, 2);
  const nothing = conceptOf(record, "zwemmen");
  assert.equal(nothing.found, false);
  assert.match(nothing.note, /isn't in what they've studied/);
});
test("misses: newest first, by game, by concept, and a limit; older ones counted", () => {
  assert.equal(missesOf(record, {}).count, 3);
  assert.equal(missesOf(record, { game: "order" }).count, 2);
  assert.equal(missesOf(record, { game: "Fill the gap" }).misses[0].nl, "Ik drink thee.");
  assert.equal(missesOf(record, { concept: "verb second" }).count, 2);
  assert.equal(missesOf(record, { concept: "p:v2" }).count, 2);
  assert.equal(missesOf(record, { concept: "drinken" }).count, 2);
  assert.equal(missesOf(record, { limit: 1 }).misses.length, 1);
  assert.equal(missesOf(record, {}).olderMissesNotKept, 40);
});
test("a deck's card: its words, how strong it is and what they missed, read like anything else they study", () => {
  const card = { id: "k:anki-es/n1", nl: "la llave", en: "the key", deck: "Spanish words", level: 1, recall: { read: 38 }, seen: 3, right: 1, wrong: 2 };
  const withCards = {
    version: 1,
    language: "es",
    languageName: "Spanish",
    evidenceAt: 1,
    cards: [card],
    struggles: { cards: [{ id: card.id, name: "la llave", why: "missed 2 of 3" }] },
    misses: [{ at: "2026-11-04T10:00:00.000Z", game: "Choose", skill: "read", item: "anki-es/n1", nl: "la llave", en: "the key", units: [card.id] }],
    sentences: { "anki-es/n1": { nl: "la llave", en: "the key", units: [card.id], words: [], right: 1, missed: 2 } },
  };
  assert.equal(checkRecord(withCards).cards.length, 1);
  assert.throws(() => checkRecord({ ...withCards, cards: "many" }), /must be lists/);
  const summary = summaryOf(withCards, 1, []);
  assert.deepEqual(summary.strugglingMost.cards[0].why, "missed 2 of 3");
  assert.deepEqual(summary.recentMisses[0].about, ["la llave"]);
  assert.equal(summary.recentMisses[0].nl, "la llave");
  for (const asked of ["la llave", "k:anki-es/n1", "llave"]) {
    const found = conceptOf(withCards, asked);
    assert.equal(found.kind, "card", asked);
    assert.deepEqual([found.nl, found.en, found.deck, found.wrong, found.recall.read, found.why], ["la llave", "the key", "Spanish words", 2, 38, "missed 2 of 3"]);
    assert.equal(found.misses.length, 1);
    assert.equal(found.sentences[0].missed, 2);
  }
  assert.equal(missesOf(withCards, { concept: "la llave" }).count, 1);
  assert.equal(missesOf(withCards, { game: "Choose" }).misses[0].en, "the key");
});
test("a record with almost nothing in it still reads", () => {
  const empty = { version: 1, language: "de", languageName: "German", evidenceAt: 0 };
  assert.equal(summaryOf(empty, 1, []).language, "de");
  assert.equal(lessonOf(empty, "1").found, false);
  assert.equal(conceptOf(empty, "x").found, false);
  assert.equal(missesOf(empty, {}).count, 0);
});
// What the library says, on R2 in memory, with the record as the device builds it. A test here can wait.
const { formFromLibrary, patternFromLibrary, sentenceFromLibrary } = await import("../src/coach-library.ts");
const { env: libraryEnv } = workerEnv();
const NOTE = { format: "lexicommons-notes", version: 1, pack: "path-nl", language: "nl", source: { by: "Lexicommons" }, items: { s1: { text: "Morgen ga ik.", words: [{ role: "time word" }, { role: "the verb", form: "form of gaan used with ik", why: "With Morgen first, ga comes next.", concept: "v2" }, { role: "who does it" }] }, s2: { text: "Dit was anders.", words: [{ role: "x" }, { role: "y" }, { role: "z" }] } } };
const FORMS = { format: "lexicommons-forms", version: 1, language: "nl", source: { by: "Lexicommons" }, forms: { gaan: { ga: "gaan with ik" }, huis: { huizen: "plural of huis" } } };
const library = { sentences: { "path-nl/s1": { nl: "Morgen ga ik.", en: "Tomorrow I'm going." }, "path-nl/s2": { nl: "Dit is nu anders.", en: "This is different now." }, "path-nl/s3": { nl: "Ik zie huizen.", en: "I see houses.", words: ["ik", "zien", "huis"] }, "gedeeld/s1": { nl: "Morgen ga ik.", en: "Tomorrow I'm going." }, "van-weg/s1": { nl: "Morgen ga ik.", en: "Tomorrow I'm going." } }, language: "nl", languageName: "Dutch", version: 1, evidenceAt: 0 };
const catalogueNow = { packs: { nl: [{ id: "path-nl", version: "aaaaaaaaaaaa", url: "/library/packs/path-nl/aaaaaaaaaaaa/pack.json", name: "Path", sentences: 3 }] }, notes: { "path-nl": { version: "bbbbbbbbbbbb", url: "/library/notes/path-nl/bbbbbbbbbbbb.json", sentences: 2 }, "van-weg": { version: "dddddddddddd", url: "/library/notes/van-weg/dddddddddddd.json", sentences: 1 } }, forms: { nl: { version: "cccccccccccc", url: "/library/forms/nl/cccccccccccc.json", lines: 2 } } };
await libraryEnv.LIBRARY.put("catalogue.json", JSON.stringify(catalogueNow));
await libraryEnv.LIBRARY.put("notes/path-nl/bbbbbbbbbbbb.json", JSON.stringify(NOTE));
await libraryEnv.LIBRARY.put("notes/van-weg/dddddddddddd.json", JSON.stringify({ ...NOTE, pack: "van-weg" }));
await libraryEnv.LIBRARY.put("forms/nl/cccccccccccc.json", JSON.stringify(FORMS));
const asyncTest = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n").slice(0, 6).join("\n        ")}`);
  }
};
await asyncTest("a sentence's notes: by its id, its words or its id in the pack, word by word, with what they're written on", async () => {
  for (const asked of ["path-nl/s1", "s1", "Morgen ga ik.", "morgen ga ik"]) {
    const got = await sentenceFromLibrary(libraryEnv, library, asked);
    assert.equal(got.found, true, asked);
    assert.equal(got.words?.[1]?.text, "ga", asked);
    assert.equal(got.words[1].concept, "v2");
    assert.equal(got.en, "Tomorrow I'm going.");
  }
});
await asyncTest("a sentence that has changed since its note was written shows no note, never a stale one", async () => {
  const got = await sentenceFromLibrary(libraryEnv, library, "path-nl/s2");
  assert.equal(got.found, true);
  assert.equal(got.words, null);
  assert.ok(!JSON.stringify(got).includes('"role"'), JSON.stringify(got));
});
await asyncTest("with no note, which form its words are, and saying it's yours to explain", async () => {
  const got = await sentenceFromLibrary(libraryEnv, library, "path-nl/s3");
  assert.equal(got.words, null);
  assert.deepEqual(got.forms, [{ text: "huizen.", form: "plural of huis" }]);
  assert.match(got.note, /yourself/);
});
await asyncTest("a pack someone shared has none, a pack the catalog no longer lists has none though its file's still there, and one that isn't theirs is said", async () => {
  assert.equal((await sentenceFromLibrary(libraryEnv, library, "gedeeld/s1")).words, null);
  assert.equal((await sentenceFromLibrary(libraryEnv, library, "van-weg/s1")).words, null);
  const none = await sentenceFromLibrary(libraryEnv, library, "Nooit gezien.");
  assert.equal(none.found, false);
  assert.match(none.note, /isn't one of the sentences/);
});
await asyncTest("a form by how it's written, and the library not answering leaves its part out", async () => {
  assert.deepEqual(await formFromLibrary(libraryEnv, "nl", "Huizen,"), [{ word: "huis", line: "plural of huis" }]);
  assert.deepEqual(await formFromLibrary(libraryEnv, "nl", "huis"), []);
  assert.deepEqual(await formFromLibrary(libraryEnv, "de", "huizen"), []);
  const broken = { ...libraryEnv, LIBRARY: { get: async () => { throw new Error("R2 is down"); } } };
  assert.deepEqual(await formFromLibrary(broken, "nl", "huizen2"), []);
  assert.deepEqual(await patternFromLibrary(broken, "nl", "v2"), {});
  assert.equal((await sentenceFromLibrary(broken, { ...library, sentences: { "other-pack/s9": { nl: "Iets.", en: "Something." } } }, "other-pack/s9")).words, null);
});
await asyncTest("a pattern, on Dutch's real files: its short name, its rule and its long part; nothing for one it doesn't know; the summary says where to go for a sentence", async () => {
  const seed = JSON.parse(readFileSync(join(LIBRARY_DIR, "catalogue-seed.json"), "utf8")).grammar.nl;
  await libraryEnv.LIBRARY.put("catalogue.json", JSON.stringify({ ...catalogueNow, grammar: { nl: seed } }));
  for (const url of [seed.url, seed.more.url]) await libraryEnv.LIBRARY.put(url.replace("/library/", ""), readFileSync(join(LIBRARY_DIR, url.replace("/library/", ""))));
  const got = await patternFromLibrary(libraryEnv, "nl", "v2");
  assert.equal(got.chip, "Verb second");
  assert.ok(got.short?.length > 10, JSON.stringify(got).slice(0, 200));
  assert.ok(got.more?.explain?.length > 10 && got.more.examples.length >= 3 && got.more.mistakes.length >= 1, JSON.stringify(got).slice(0, 300));
  const size = JSON.stringify(got).length;
  assert.ok(size < 4000, `the most a concept adds to study_concept: ${size} bytes`);
  const noMistakes = await patternFromLibrary(libraryEnv, "nl", "time-place");
  assert.deepEqual(noMistakes.more.mistakes, []);
  assert.deepEqual(Object.keys(await patternFromLibrary(libraryEnv, "nl", "nope")), []);
  assert.match(summaryOf(library, 1, []).forMore, /study_sentence/);
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
