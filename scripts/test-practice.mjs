// The practice protocol (public/js/practice/protocol.js), case by case: what a reply, a card, a grade, a turn of yours,
// a logged conversation and a summary must look like, and what gets refused with a message the AI can act on. Plus how
// grades become evidence (store.js evidenceRows). Pure, so it runs in Node: `node scripts/test-practice.mjs` (exit 0 =
// pass).

import {
  checkCard,
  checkGrade,
  checkLearnerTurn,
  checkLogTurns,
  checkReply,
  checkSettings,
  checkSummary,
  bare,
  conceptId,
  literalChunks,
  PracticeError,
  splitSentence,
  text,
} from "../public/js/practice/protocol.js";
import { evidenceRows, tally } from "../public/js/practice/store.js";
import { LANGUAGES } from "../public/js/lang/index.js";

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
const eq = (a, b, what = "") => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what} ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
};
const refuses = (fn, pattern) => {
  try {
    fn();
  } catch (error) {
    if (!(error instanceof PracticeError)) throw new Error(`threw ${error.name}: ${error.message}`);
    if (pattern && !pattern.test(error.message)) throw new Error(`message “${error.message}” doesn't match ${pattern}`);
    return;
  }
  throw new Error("wasn't refused");
};

// ---------- small pieces ----------

test("text: trimmed, spaces collapsed, control characters dropped, too long refused", () => {
  eq(text("  Hoi \u0007 daar  ", 20, "x"), "Hoi daar");
  eq(text("", 5, "x"), undefined);
  refuses(() => text("x".repeat(6), 5, "say.nl"), /6 characters; keep it to 5/);
  refuses(() => text(42, 5, "say.nl"), /must be text/);
  refuses(() => text("", 5, "nl", { required: true }), /missing/);
});
test("concept ids: p:<pattern>, w:<lemma> (lower case); anything else refused", () => {
  eq(conceptId("p:v2"), "p:v2");
  eq(conceptId("w:Winkel"), "w:winkel");
  eq(conceptId("p:om-te"), "p:om-te");
  refuses(() => conceptId("winkel"), /p:<pattern id>, w:<lemma> or c:<phrase>/);
  refuses(() => conceptId("w:"), /concept id/);
  refuses(() => conceptId("x:foo"));
  // A Hindi lemma's vowel signs are combining marks, part of the word: w:होना is a concept, and का, के, की stay three.
  eq(conceptId("w:होना"), "w:होना");
  eq(conceptId("w:خانه\u200Cدار"), "w:خانه\u200Cدار");
  eq(["का", "के", "की", "को", "हूँ।"].map((w) => bare(w)), ["का", "के", "की", "को", "हूँ"]);
});
test("a sentence splits into words and its end punctuation", () => {
  eq(splitSentence("Ik heb gisteren een boek gelezen."), { words: ["Ik", "heb", "gisteren", "een", "boek", "gelezen"], punct: "." });
  eq(splitSentence("Wat eet je vanavond?"), { words: ["Wat", "eet", "je", "vanavond"], punct: "?" });
  eq(splitSentence("Ja, dat is goed"), { words: ["Ja,", "dat", "is", "goed"], punct: "" });
});
test("a sentence in a language with endings of its own (Greek's ;, Hindi's ।) splits them off; other languages don't", () => {
  LANGUAGES.xg = { name: "Endings test", locale: "xg-XG", segmenter: "spaces", separator: " ", lemmaCase: "lower", abbreviations: [], ends: [";", "।"], patterns: {} };
  try {
    eq(splitSentence("Τι κάνεις;", "xg"), { words: ["Τι", "κάνεις"], punct: ";" });
    eq(splitSentence("मैं घर जा रहा हूँ।", "xg"), { words: ["मैं", "घर", "जा", "रहा", "हूँ"], punct: "।" });
    eq(splitSentence("Wat eet je vanavond?", "xg"), { words: ["Wat", "eet", "je", "vanavond"], punct: "?" });
    eq(splitSentence("Τι κάνεις;", "nl"), { words: ["Τι", "κάνεις;"], punct: "" });
  } finally {
    delete LANGUAGES.xg;
  }
});
test("the literal line: moved chunks between asterisks, or objects", () => {
  eq(literalChunks(["I have", "*yesterday*", "a book", "*read*"]), [
    { text: "I have", moved: false },
    { text: "yesterday", moved: true },
    { text: "a book", moved: false },
    { text: "read", moved: true },
  ]);
  eq(literalChunks([{ text: "go", moved: true }]), [{ text: "go", moved: true }]);
  // As a real AI wrote them (26 Oct, claude.ai): punctuation outside the stars, or a starred word inside a chunk.
  eq(literalChunks(["What", "*go*", "you", "today", "*do*?"]).map((c) => `${c.text}:${c.moved}`), ["What:false", "go:true", "you:false", "today:false", "do?:true"]);
  eq(literalChunks(["to *eat*", "Hi!"]).map((c) => `${c.text}:${c.moved}`), ["to eat:true", "Hi!:false"]);
  eq(literalChunks([]), undefined);
});

// ---------- replies ----------

test("a reply needs something in it", () => {
  refuses(() => checkReply({}), /empty/);
  refuses(() => checkReply({ expect: "speak" }), /empty/);
});
test("say: a string, a line, or a list of up to 6; english order kept only when it maps one to one", () => {
  const one = checkReply({ say: "Hoi!" });
  eq(one.say[0].nl, "Hoi!");
  eq(one.expect, "either");
  const line = checkReply({ say: { nl: "Ik heb gisteren een boek gelezen.", literal: ["I have", "*yesterday*", "a book", "*read*"], english: [0, 3, 2, 1], en: "I read a book yesterday.", words: { Gelezen: "lezen" } } }).say[0];
  eq(line.english, [0, 3, 2, 1]);
  eq(line.words, { gelezen: "lezen" });
  eq(checkReply({ say: { nl: "x y", literal: ["a", "b"], english: [0, 0] } }).say[0].english, undefined, "a repeated index");
  refuses(() => checkReply({ say: Array(7).fill("Hoi") }), /7 lines; keep it to 6/);
});
test("expect: card needs a card; defaults to card when one is dealt", () => {
  refuses(() => checkReply({ say: "Hoi", expect: "card" }), /needs a card/);
  refuses(() => checkReply({ say: "Hoi", expect: "sing" }), /expect must be one of/);
  eq(checkReply({ card: { game: "arrange", nl: "Ik ga naar huis.", en: "I'm going home." } }).expect, "card");
});
test("grades: verdict required, marks and concepts checked; grade and grades both work", () => {
  refuses(() => checkGrade({}), /verdict must be one of/);
  refuses(() => checkGrade({ verdict: "fixed", concepts: [{ concept: "p:v2", outcome: "great" }] }), /outcome must be one of/);
  refuses(() => checkGrade({ verdict: "fixed", concepts: [{ concept: "p:v2", outcome: "right", skill: "dancing" }] }), /skill must be one of/);
  const g = checkGrade({ verdict: "fixed", better: "Gisteren ben ik gegaan.", marks: [{ said: "ik ben", fix: "ben ik" }], concepts: [{ concept: "p:V2", outcome: "wrong" }, { concept: "w:Gaan", outcome: "avoided" }] });
  eq(g.concepts.map((c) => c.concept), ["p:V2", "w:gaan"]);
  eq(checkReply({ grades: [{ verdict: "right" }, { verdict: "none" }] }).grades.length, 2);
  eq(checkReply({ grade: { verdict: "right", turn: 4 } }).grades[0].turn, 4);
});
test("a scene needs a title", () => {
  refuses(() => checkReply({ scene: { goal: "buy bread" } }), /scene.title is missing/);
  eq(checkReply({ scene: { title: "The bakery", goal: "Buy bread" } }).scene.title, "The bakery");
});

// ---------- cards ----------

const base = { nl: "Ik heb gisteren een boek gelezen.", en: "I read a book yesterday.", literal: ["I have", "*yesterday*", "a book", "*read*"], english: [0, 3, 2, 1], patterns: ["perfect"], words: { gisteren: "gisteren", boek: "boek", gelezen: "lezen" } };
test("a card's item takes the starter deck's shape", () => {
  const { item } = checkCard({ ...base, game: "arrange", moved: ["gisteren", "gelezen"] }, "practice:p1:5");
  eq(item.id, "practice:p1:5");
  eq(item.words, [["Ik"], ["heb"], ["gisteren", "gisteren"], ["een"], ["boek", "boek"], ["gelezen", "lezen"]]);
  eq(item.punct, ".");
  eq(item.literal, [["I have", false], ["yesterday", true], ["a book", false], ["read", true]]);
  eq(item.english, [0, 3, 2, 1]);
  eq(item.means, "I read a book yesterday.");
  eq(item.concepts, ["perfect"]);
});
test("every sentence game needs en (its prompt); say doesn't", () => {
  refuses(() => checkCard({ game: "arrange", nl: "Ik ga naar huis." }, "c"), /needs en/);
  eq(checkCard({ game: "say", nl: "Ik ga naar huis." }, "c").item.from, "dutch");
  refuses(() => checkCard({ game: "say", nl: "Ik ga naar huis.", from: "english" }, "c"), /from English needs en/);
});
test("choose: 1 to 3 wrong versions, each different", () => {
  refuses(() => checkCard({ ...base, game: "choose" }, "c"), /needs wrong/);
  refuses(() => checkCard({ ...base, game: "choose", wrong: [base.nl] }, "c"), /differ/);
  eq(checkCard({ ...base, game: "choose", wrong: ["Ik heb gelezen gisteren een boek."] }, "c").item.wrong.length, 1);
});
test("fill and type: the gap word is one of the sentence's words; fill's options include it", () => {
  refuses(() => checkCard({ ...base, game: "fill", gap: { word: "gelezen", options: ["gelezen"] } }, "c"), /2 to 5 words/);
  refuses(() => checkCard({ ...base, game: "fill", gap: { word: "gelezen", options: ["lezen", "leest"] } }, "c"), /must include the word/);
  refuses(() => checkCard({ ...base, game: "fill", gap: { word: "gekocht", options: ["gekocht", "kopen"] } }, "c"), /isn't one of the sentence's words/);
  eq(checkCard({ ...base, game: "fill", gap: { word: "gelezen", options: ["lezen", "gelezen", "leest"] } }, "c").item.gap, { index: 5, options: ["lezen", "gelezen", "leest"] });
  eq(checkCard({ ...base, game: "type", gap: { word: "Gelezen" } }, "c").item.gap, { index: 5, options: ["gelezen"] });
});
test("place: the word to put back is in the sentence", () => {
  eq(checkCard({ ...base, game: "place", place: { word: "gisteren" } }, "c").item.place, { index: 2 });
  refuses(() => checkCard({ ...base, game: "place" }, "c"), /needs place/);
});
test("match: 3 to 6 pairs, all different", () => {
  refuses(() => checkCard({ game: "match", pairs: [["a", "b"], ["c", "d"]] }, "c"), /3 to 6 pairs/);
  refuses(() => checkCard({ game: "match", pairs: [["a", "b"], ["a", "d"], ["e", "f"]] }, "c"), /must be different/);
  const { item } = checkCard({ game: "match", pairs: [["de trein", "the train"], ["het brood", "the bread"], ["de winkel", "the shop"]], words: { "de trein": "trein" } }, "c");
  eq(item.words, ["trein", "het brood", "de winkel"]);
});
test("a card's sentence is 2 to 16 words; patterns are ids", () => {
  refuses(() => checkCard({ game: "arrange", nl: "Hoi.", en: "Hi." }, "c"), /2 to 16/);
  refuses(() => checkCard({ ...base, game: "arrange", patterns: ["Verb Second!"] }, "c"), /isn't a pattern id/);
  eq(checkCard({ ...base, game: "arrange", patterns: ["p:perfect"] }, "c").item.concepts, ["perfect"]);
  refuses(() => checkCard({ ...base, game: "juggle" }, "c"), /card.game must be one of/);
});

// ---------- your turns, logs, summaries, settings ----------

test("your turns: said (typed or spoken), card, hint", () => {
  eq(checkLearnerTurn({ type: "said", text: "Ik ben moe", how: "spoken", engine: "whisper", unsure: ["moe"], key: "k" }), { type: "said", key: "k", text: "Ik ben moe", how: "spoken", engine: "whisper", unsure: ["moe"] });
  eq(checkLearnerTurn({ type: "said", text: "Ik ben moe", unsure: ["moe"] }).unsure, [], "typed turns have no unsure words");
  eq(checkLearnerTurn({ type: "card", card: 7, game: "fill", correct: true, answer: "komt" }).card, 7);
  refuses(() => checkLearnerTurn({ type: "card", card: "x", game: "fill" }), /seq of the reply/);
  eq(checkLearnerTurn({ type: "hint" }).type, "hint");
  refuses(() => checkLearnerTurn({ type: "shout" }), /said, card or hint/);
  refuses(() => checkLearnerTurn({ type: "said", text: "   " }), /empty/);
});
test("a log: your grade becomes a reply right after your turn", () => {
  const turns = checkLogTurns([
    { who: "ai", nl: "Hoe gaat het?", en: "How are you?" },
    { who: "you", text: "Goed", grade: { verdict: "right", concepts: [{ concept: "w:goed", outcome: "right" }] } },
  ]);
  eq(turns.map((t) => `${t.who}:${t.type}`), ["ai:reply", "you:said", "ai:reply"]);
  eq(turns[1].how, "spoken", "a log defaults to spoken");
  eq(turns[2].gradesPrevious, true);
  refuses(() => checkLogTurns([{ who: "ai" }]), /needs nl/);
  refuses(() => checkLogTurns([{ who: "teacher", text: "x" }]), /who must be/);
  refuses(() => checkLogTurns([]), /empty/);
});
test("summary: text required; the lists checked", () => {
  refuses(() => checkSummary({}), /summary.text is missing/);
  const s = checkSummary({ text: "Goed gedaan.", went_well: ["perfect"], new_words: [{ nl: "de winkel", en: "the shop" }], concepts: [{ concept: "p:v2", outcome: "avoided" }] });
  eq([s.wentWell, s.workOn, s.newWords[0].nl, s.concepts[0].outcome], [["perfect"], [], "de winkel", "avoided"]);
});
test("settings: a kind; answer and minutes from their lists; the language (Dutch when it isn't said)", () => {
  eq(checkSettings({ kind: "story" }), { kind: "story", answer: "both", minutes: 10, topic: undefined, language: "nl", from: "en" });
  // Their own language, which the summary is written in: kept as given, refused when it isn't a language.
  eq(checkSettings({ kind: "story", language: "nl", from: "es" }).from, "es");
  refuses(() => checkSettings({ kind: "story", from: "xx" }), /from must be one of/);
  eq(checkSettings({ kind: "story", language: "de" }).language, "de");
  refuses(() => checkSettings({ kind: "story", language: "xx" }), /language must be one of/);
  refuses(() => checkSettings({ kind: "story", language: "constructor" }), /language must be one of/);
  refuses(() => checkSettings({ kind: "karaoke" }), /kind must be one of/);
  refuses(() => checkSettings({ kind: "story", minutes: 7 }), /minutes must be one of/);
  refuses(() => checkSettings({ kind: "story", answer: "sing" }), /answer must be one of/);
});

// ---------- grades → evidence ----------

const practice = {
  id: "p1",
  settings: { kind: "conversation" },
  client: "Claude Code",
  recorded: [],
  turns: [
    { seq: 1, at: 1000, who: "app", type: "joined" },
    { seq: 2, at: 2000, who: "you", type: "said", text: "Gisteren ik ben gegaan", how: "spoken" },
    { seq: 3, at: 3000, who: "ai", type: "reply", say: [], grades: [{ turn: 2, verdict: "fixed", marks: [], concepts: [{ concept: "p:v2", outcome: "wrong" }, { concept: "p:separable", outcome: "avoided" }, { concept: "w:gaan", outcome: "right", skill: "listening" }] }] },
    { seq: 4, at: 4000, who: "you", type: "said", text: "Ik heb gegeten", how: "typed" },
    { seq: 5, at: 5000, who: "ai", type: "reply", say: [], grades: [{ turn: 4, verdict: "right", marks: [], concepts: [{ concept: "p:perfect", outcome: "hint" }] }] },
    { seq: 6, at: 6000, who: "you", type: "card", card: 5, game: "choose", correct: true },
    { seq: 7, at: 7000, who: "ai", type: "summary", text: "Nice.", concepts: [{ concept: "w:eten", outcome: "right" }] },
  ],
};
test("in German, a word's concept keeps its capital (lemmaCase any): grades, cards, summaries and logs", () => {
  eq(conceptId("w:Buch", "concept", "de"), "w:Buch");
  eq(conceptId("w:Buch"), "w:buch", "Dutch lowercases");
  eq(conceptId("c:Wie-Geht-Es", "concept", "de"), "c:wie-geht-es", "phrases are lowercase ids in every language");
  const de = { language: "de" };
  eq(checkReply({ grade: { verdict: "right", concepts: [{ concept: "w:Buch", outcome: "right" }] } }, de).grades[0].concepts[0].concept, "w:Buch");
  const card = checkCard({ game: "arrange", nl: "Ich habe gestern ein Buch gelesen.", en: "I read a book yesterday.", words: { Buch: "Buch", gelesen: "lesen" } }, "c", "de");
  eq(card.item.words.filter((w) => w[1]), [["Buch", "Buch"], ["gelesen", "lesen"]]);
  eq(checkCard({ game: "match", pairs: [["das Buch", "the book"], ["der Zug", "the train"], ["gestern", "yesterday"]], words: { "das Buch": "Buch" } }, "c", "de").item.words, ["Buch", "der Zug", "gestern"]);
  eq(checkSummary({ text: "Gut.", concepts: [{ concept: "w:Zug", outcome: "right" }] }, de).concepts[0].concept, "w:Zug");
  eq(checkLogTurns([{ who: "you", text: "Ich lese ein Buch", grade: { verdict: "right", concepts: [{ concept: "w:Buch", outcome: "right" }] } }], de)[1].grades[0].concepts[0].concept, "w:Buch");
});
test("concept ids: patterns, words and fixed phrases", () => {
  eq(conceptId("c:Hoe-gaat-het"), "c:hoe-gaat-het");
  eq(conceptId("w:Gaan"), "w:gaan");
  eq(conceptId("p:v2"), "p:v2");
  let refused = false;
  try {
    conceptId("x:thing");
  } catch (error) {
    refused = error instanceof PracticeError;
  }
  eq(refused, true);
});
test("grades become evidence: skill from how you answered, avoided left out, the summary's concepts too", () => {
  const rows = evidenceRows(practice);
  // concept:outcome:skill:test:help, plus marked on a wrong (progress.js's format)
  eq(rows.map((r) => `${r.concept}:${r.outcome}:${r.skill}:${r.test}:${r.help}`), ["p:v2:wrong:say:free:none", "w:gaan:right:hear:free:none", "p:perfect:right:say:free:nudge", "w:eten:right:say:judged:none"]);
  eq(rows[0].marked, false); // the grade had no marks: an unmarked wrong counts for less
  eq(rows[0].activity, "practice:conversation");
  eq([rows[0].item, rows[0].at, rows[0].source, rows[0].client, rows[0].said], ["practice:p1:2", 3000, "ai", "Claude Code", "Gisteren ik ben gegaan"]);
});
test("evidence is in the practice's language: its settings', else Dutch (a practice from before they had one)", () => {
  eq([...new Set(evidenceRows(practice).map((r) => r.lang))], ["nl"]);
  const german = { ...practice, settings: { kind: "conversation", language: "de" } };
  eq([...new Set(evidenceRows(german).map((r) => r.lang))], ["de"]);
});
test("evidence is recorded once: keys already recorded are skipped", () => {
  const keys = evidenceRows(practice).map((r) => r.key);
  eq(evidenceRows({ ...practice, recorded: keys }).length, 0);
  eq(evidenceRows({ ...practice, recorded: keys.slice(0, 2) }).length, 2);
});
test("the tally: verdicts, cards and concepts", () => {
  const t = tally(practice);
  eq([t.right, t.fixed, t.wrong], [2, 1, 0]);
  eq(t.concepts.find((c) => c.concept === "p:separable").avoided, 1);
});

test("a practice in a language of their own (12 Nov 2026): kept with its definition as a pack's is; without one, with a wrong one, one of ours given one, or from it, refused in words", () => {
  const BURMESE = { name: "Burmese", written: "unspaced", case: "any", ends: ["။"] };
  eq(checkSettings({ kind: "conversation", answer: "type", minutes: 10, language: "my", languageDef: BURMESE, from: "en" }), { kind: "conversation", answer: "type", minutes: 10, topic: undefined, language: "my", languageDef: { name: "Burmese", direction: "ltr", written: "unspaced", case: "any", ends: ["။"] }, from: "en" });
  refuses(() => checkSettings({ kind: "conversation", language: "my" }), /a language of their own with its languageDef/);
  refuses(() => checkSettings({ kind: "conversation", language: "my", languageDef: { name: "Burmese", direction: "down" } }), /"ltr" or "rtl"/);
  refuses(() => checkSettings({ kind: "conversation", language: "nl", languageDef: { name: "Dutch" } }), /leave languageDef out/);
  refuses(() => checkSettings({ kind: "conversation", language: "Burmese", languageDef: BURMESE }), /isn't a language code/);
  refuses(() => checkSettings({ kind: "conversation", language: "my", languageDef: BURMESE, from: "my" }), /from must be one of/);
  if (Object.hasOwn(LANGUAGES, "my")) throw new Error("checking left Burmese in the registry");
});

test("any field of any input, set to an object whose toString is null, is refused in words or read, never thrown on", () => {
  const trap = JSON.parse('{"toString": null}');
  // Every path into a value (the value itself included), and the value with the trap put at one path.
  const paths = (value, at = []) => [at, ...(value && typeof value === "object" ? Object.keys(value).flatMap((key) => paths(value[key], [...at, key])) : [])];
  const planted = (value, path) => {
    if (!path.length) return trap;
    const copy = structuredClone(value);
    let node = copy;
    for (const key of path.slice(0, -1)) node = node[key];
    node[path.at(-1)] = trap;
    return copy;
  };
  const sentence = { nl: "Ik heb gisteren een boek gelezen.", en: "I read a book yesterday.", literal: ["I have", "*yesterday*", "a book", "*read*"], english: [0, 3, 2, 1], patterns: ["perfect"], words: { gisteren: "gisteren", boek: "boek", gelezen: "lezen" } };
  const grade = { verdict: "fixed", turn: 4, better: "Gisteren ben ik gegaan.", marks: [{ said: "ik ben", fix: "ben ik" }], concepts: [{ concept: "p:v2", outcome: "wrong", note: "the verb second", skill: "speaking" }] };
  const cases = [
    ["settings", checkSettings, { kind: "conversation", answer: "both", minutes: 10, topic: "food", language: "nl" }],
    ["a said turn", checkLearnerTurn, { type: "said", text: "Ik ben moe", how: "spoken", engine: "whisper", unsure: ["moe"], key: "k" }],
    ["a card turn", checkLearnerTurn, { type: "card", card: 7, game: "fill", correct: true, answer: "komt", hint: false, tries: 2, key: "k" }],
    ["a reply", (v) => checkReply(v), { say: [{ nl: sentence.nl, literal: sentence.literal, english: sentence.english, en: sentence.en, words: { Gelezen: "lezen" } }, "Hoi!"], explain: "Why", translate: "Hello", scene: { title: "The bakery", goal: "Buy bread" }, grades: [grade], card: { ...sentence, game: "fill", gap: { word: "gelezen", options: ["lezen", "gelezen", "leest"] } }, expect: "card" }],
    ["an arrange card", (v) => checkCard(v, "c"), { ...sentence, game: "arrange", moved: ["gisteren", "gelezen"] }],
    ["a choose card", (v) => checkCard(v, "c"), { ...sentence, game: "choose", wrong: ["Ik heb gelezen gisteren een boek."] }],
    ["a place card", (v) => checkCard(v, "c"), { ...sentence, game: "place", place: { word: "gisteren" } }],
    ["a type card", (v) => checkCard(v, "c"), { ...sentence, game: "type", gap: { word: "Gelezen" } }],
    ["a match card", (v) => checkCard(v, "c"), { game: "match", pairs: [["de trein", "the train"], ["het brood", "the bread"], ["de winkel", "the shop"]], words: { "de trein": "trein" } }],
    ["a grade", (v) => checkGrade(v), grade],
    ["a summary", (v) => checkSummary(v), { text: "Goed gedaan.", went_well: ["perfect"], work_on: ["v2"], new_words: [{ nl: "de winkel", en: "the shop" }], concepts: [{ concept: "p:v2", outcome: "avoided" }] }],
    ["a log", (v) => checkLogTurns(v), [{ who: "ai", nl: "Hoe gaat het?", en: "How are you?", literal: ["How", "goes", "it?"], words: { gaat: "gaan" } }, { who: "you", text: "Goed", how: "typed", grade: { verdict: "right", concepts: [{ concept: "w:goed", outcome: "right" }] } }]],
    ["a concept id", (v) => conceptId(v), "p:v2"],
  ];
  const thrown = [];
  for (const [name, check, valid] of cases) {
    check(structuredClone(valid));
    for (const path of paths(valid)) {
      try {
        check(planted(valid, path));
      } catch (error) {
        if (!(error instanceof PracticeError)) thrown.push(`${name} at ${path.join(".") || "(itself)"}: ${error.message}`);
      }
    }
  }
  if (thrown.length) throw new Error(`${thrown.length} threw: ${thrown.slice(0, 6).join(" · ")}`);
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
