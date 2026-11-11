// Say it on a pack's plain card (study/pack-items.js gamesOf's `says`; study/deck.js saidAloud, saidNoun, setSpeechHearing, the deck's plan), in Node.
// A card is asked aloud only when its text is the side in the pack's language, short enough to say, and something here can listen: never a
// cloze, a script's letter, an English prompt, a deck whose sides are the other way round, or a language whose script can't be told. Its answer
// is graded by speech/match.js as a word's is (a noun right without its article; a reading matched), and scheduled on the card's own unit.
// Usage: node scripts/test-card-say.mjs [<app dir>]   (another copy's dir to see it fail on one from before; exit 0 = pass)
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const APP = process.argv[2] ? resolve(process.argv[2]) : join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (path) => import(pathToFileURL(join(APP, "public/js", path)).href);
// progress.js first, as every study module's test loads them.
const { clearProgress, record, unitState, TESTS } = await load("study/progress.js");
const { ITEM_LIMITS, gamesOf } = await load("study/pack-items.js");
const deck = await load("study/deck.js");
const { savePack, setPackOn } = await load("study/packs.js");
const { setLearning } = await load("study/learning.js");
const { resetStudySettings, setStudySetting } = await load("study/settings.js");
const { match } = await load("speech/match.js");
const { wordOutcomes } = await load("study/attribute.js");

let failed = 0;
let passed = 0;
async function test(name, fn) {
  try {
    const note = await fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};
const eq = (actual, expected, what = "") => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what ? `${what}: ` : ""}${a} ≠ ${e}`);
};
const others = { means: 5, answers: 0 };
const packOf = (language, from = "en", more = {}) => ({ id: `p-${language}`, language, from, ...more });

await test("the rule in gamesOf: only with `says`, a meaning, letters, and a text short enough", () => {
  const card = { id: "a", text: "het huis", means: "the house" };
  ok(!gamesOf(card, { others }).includes("say"), "without says, no Say it (the app from before)");
  eq(gamesOf(card, { others, says: true }), ["card", "type", "match", "choose", "say"]);
  eq(gamesOf({ id: "c", text: "Het water is koud.", cloze: { at: 4, answer: "water" } }, { others, says: true }), ["fill"], "a cloze");
  const long = { id: "l", text: "a".repeat(ITEM_LIMITS.said + 1), means: "long" };
  ok(!gamesOf(long, { others, says: true }).includes("say"), "a front past the limit");
  ok(gamesOf({ id: "m", text: "a".repeat(ITEM_LIMITS.said), means: "at the limit" }, { others, says: true }).includes("say"), "a front at the limit");
  ok(!gamesOf({ id: "n", text: "1 + 1", means: "two" }, { others, says: true }).includes("say"), "nothing to say in it");
  return `limit ${ITEM_LIMITS.said} characters`;
});

await test("which side is said: the text, when it's in the pack's language", () => {
  const nl = packOf("nl");
  ok(deck.saidAloud({ text: "het huis", means: "the house" }, nl), "Dutch from English, a noun");
  ok(deck.saidAloud({ text: "huis", means: "house" }, nl), "a card that shows neither way is taken as the pack says");
  ok(deck.saidAloud({ text: "Ik heb een hond.", means: "I have a dog." }, nl), "a Dutch sentence");
  ok(!deck.saidAloud({ text: "the house", means: "het huis" }, nl), "a reversed card: its text reads as English, its meaning doesn't");
  ok(!deck.saidAloud({ text: "What is your name?", means: "Hoe heet je?" }, nl), "an English prompt");
  ok(deck.saidAloud({ text: "water", means: "water" }, nl), "the same both ways: nothing against it");
  ok(!deck.saidAloud({ text: "Het water is koud.", means: "cold", cloze: { at: 4, answer: "water" } }, nl), "a cloze");
  ok(!deck.saidAloud({ text: "huis" }, nl), "no meaning to ask it from");
});

await test("by script: Japanese, Chinese, Russian, Arabic, Korean from English", () => {
  const ja = packOf("ja");
  ok(deck.saidAloud({ text: "食べます", means: "to eat", reading: "たべます" }, ja), "kanji and kana");
  ok(deck.saidAloud({ text: "コーヒー", means: "coffee" }, ja), "katakana");
  ok(!deck.saidAloud({ text: "to eat", means: "食べます" }, ja), "a reversed Japanese card");
  ok(!deck.saidAloud({ text: "JR 東日本", means: "JR East" }, ja), "a text with letters of another script isn't asked");
  ok(deck.saidAloud({ text: "我们", means: "we", reading: "wǒ men" }, packOf("zh")), "Chinese");
  ok(!deck.saidAloud({ text: "we", means: "我们" }, packOf("zh")), "reversed Chinese");
  ok(deck.saidAloud({ text: "молоко", means: "milk" }, packOf("ru")) && !deck.saidAloud({ text: "milk", means: "молоко" }, packOf("ru")), "Russian");
  ok(deck.saidAloud({ text: "كتاب", means: "book" }, packOf("ar")) && !deck.saidAloud({ text: "book", means: "كتاب" }, packOf("ar")), "Arabic");
  ok(deck.saidAloud({ text: "학교", means: "school" }, packOf("ko")) && !deck.saidAloud({ text: "school", means: "학교" }, packOf("ko")), "Korean");
  ok(!deck.saidAloud({ text: "あ", means: "a" }, packOf("ja", "en", { teaches: "script" })), "a script's letter is read, never said from a meaning");
  ok(!deck.saidAloud({ text: "huis", means: "house" }, packOf("xx-nothing")) , "a language whose script can't be told is never asked aloud");
});

await test("a noun's own word: said without its article, right", () => {
  // The article is known by the packs' own glossary: with none loaded, nothing's guessed.
  eq(deck.saidNoun({ text: "het huis", means: "the house" }), null, "no glossary, no guess");
});

// The deck's plan, on packs saved as the app saves them.
async function plainPack(id, items, more = {}) {
  const saved = await savePack({ format: "lexicommons-pack", version: 2, id, name: id, language: "nl", from: "en", topics: {}, words: {}, chunks: {}, patterns: {}, items, ...more });
  if (!saved.ok) throw new Error(`${id}: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
  setPackOn(id, true);
  return saved.pack ?? { id };
}
setLearning("nl");
resetStudySettings();
await clearProgress();
const WORDS_NL = ["huis", "boom", "fiets", "stoel", "tafel", "raam"];
await plainPack("say-deck", [
  ...WORDS_NL.map((word, i) => ({ id: `w${i}`, text: i === 0 ? "het huis" : word, means: ["the house", "tree", "bike", "chair", "table", "window"][i] })),
  { id: "rev", text: "the dog", means: "de hond" },
  { id: "long", text: "Dit is een heel erg lange zin die niemand in een keer hardop zou willen zeggen.", means: "A very long sentence." },
  { id: "gap", text: "Het water is koud.", means: "The water is cold.", cloze: { at: 4, answer: "water" } },
], { words: { het: "the (with het-words); it", huis: "house" } });
const { allPacks } = await load("study/packs.js");
const pack = allPacks().find((one) => one.id === "say-deck");

await test("a deck's cards: Say it on the ones that can, where something listens", () => {
  deck.setSpeechHearing(true);
  const games = Object.fromEntries(deck.cardsOf(pack).map((entry) => [entry.card.id, entry.games]));
  ok(games.w0.includes("say") && games.w1.includes("say"), `the Dutch cards: ${games.w0}`);
  ok(!games.rev.includes("say"), "the reversed card");
  ok(!games.long.includes("say"), "the too-long front");
  eq(games.gap, ["fill"], "the cloze");
  deck.setSpeechHearing(false);
  ok(deck.cardsOf(pack).every((entry) => !entry.games.includes("say")), "a language nobody here can hear: none");
  deck.setSpeechHearing(true);
  eq(deck.saidNoun({ text: "het huis", means: "the house" }), "huis", "the pack's glossary knows het: the noun is the answer");
  eq(deck.saidNoun({ text: "een huis", means: "a house" }), null, "not the word for the");
  eq(deck.saidNoun({ text: "goede morgen", means: "good morning" }), null, "a phrase is said whole");
});

await test("graded as a word is: right, a noun without its article, wrong; a reading matched", () => {
  const words = [["het", null], ["huis", "huis"]];
  const said = (heard) => wordOutcomes(words, match("het huis", heard, { lang: "nl" }), { spoken: true }).huis === "right";
  ok(said("het huis"), "said whole");
  ok(said("huis"), "without its article");
  ok(!said("het hout") && !said("boom"), "another word");
  ok(match("fiets", "fiets", { lang: "nl" }).ok && !match("fiets", "feest", { lang: "nl" }).ok, "a plain card: the whole text");
  ok(match(["食べます"], "たべます", { lang: "ja", readings: [["食べます", "たべます"]] }).ok, "said in kana, matched by the card's reading");
  ok(!match(["食べます"], "のみます", { lang: "ja", readings: [["食べます", "たべます"]] }).ok, "another word in kana");
});

await test("in the deck's session: asked once saying is due, recorded on the card's own unit, another game when speaking is off", async () => {
  const unit = deck.deckUnit("say-deck", "w1");
  const T0 = new Date(2026, 9, 1, 9).getTime();
  const DAY = 86_400_000;
  const row = (at, activity, outcome = "right") => ({ concept: unit, at, outcome, activity, ...TESTS[activity], item: unit.slice(2) });
  // Read twice, then its saying started by typing (review 2), so the next saying (reviews odd) is aloud.
  await record([row(T0, "choose"), row(T0 + DAY, "choose"), row(T0 + 3 * DAY, "type")]);
  let now = T0 + 3 * DAY;
  let step = null;
  for (let day = 4; day < 400 && !step; day++) {
    now = T0 + day * DAY;
    step = deck.deckSession("say-deck", now).steps.find((one) => one.unit === unit && one.game === "say") ?? null;
    if (!step && unitState(unit, { lang: "nl", now }).strengths.say?.due) break;
  }
  const state = unitState(unit, { lang: "nl", now });
  ok(step, `asked aloud when its saying came due (reviews ${state.reviews}, say due ${Boolean(state.strengths.say?.due)})`);
  eq(step.skill, "say", "its strength");
  eq(TESTS.say, { test: "recall", skill: "say" }, "the evidence a said card records");
  const rows = deck.cardRows(step.card, { concept: step.unit, outcome: "right", activity: "say", ...TESTS.say, item: step.unit.slice(2) });
  eq(rows[0].concept, unit, "its own unit");
  const before = unitState(unit, { lang: "nl", now }).strengths.say?.recall ?? 0;
  await record(rows.map((one) => ({ ...one, at: now })));
  const after = unitState(unit, { lang: "nl", now: now + 1000 });
  ok(after.strengths.say && !after.strengths.say.due && after.strengths.say.recall >= before, "said right, its saying is scheduled on");
  // Can't speak now: the same card another way, never Say it.
  const instead = deck.deckInstead(step, new Set(["say"]));
  ok(instead && instead.game !== "say" && instead.unit === unit, `another game on the same card: ${instead?.game}`);
  // Say it turned off in Choose the games: never planned.
  setStudySetting("quick.include.say", false);
  ok(!deck.deckSession("say-deck", now - DAY).steps.some((one) => one.game === "say"), "turned off in Choose the games, it isn't asked");
  setStudySetting("quick.include.say", true);
  deck.setSpeechHearing(false);
  ok(!deck.deckSession("say-deck", now - DAY).steps.some((one) => one.game === "say"), "nobody listening, it isn't asked");
  deck.setSpeechHearing(true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
