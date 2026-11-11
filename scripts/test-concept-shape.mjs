// What a rule's picture shows (public/js/study/concept-shape.js), on real sentences from path-nl with the roles its notes give each word:
// order's brackets only for real frames (heb … gedronken, dat … kunnen eten, om … te kiezen), a word's place only where it's first,
// second or last in its own clause, counted as Dutch counts the verb's seat; agreement's and an article's pairs; a verb's ending set
// apart by the word's own spelling and linked to who; and nothing guessed where the roles don't say. In Node: `node
// scripts/test-concept-shape.mjs` (exit 0 = pass). docs/design-bible.md, A rule's picture.
// Dutch's grammar as the library has it, first: packs/path-nl.json uses its later patterns (scripts/fixtures/library-grammar.mjs).
import "./fixtures/library-grammar.mjs";
import assert from "node:assert/strict";
import { endingOf, layoutOf, literalChunks, marksOf, ruleShape, saidOfMarks } from "../public/js/study/concept-shape.js";

let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n").join("\n     ")}`);
  }
};

// [text, roles, lemmas], as path-nl's notes and items have them (5 Nov 2026).
const S = {
  perfect: ["Ik heb met iemand koffie gedronken.", ["who does it", "helping verb", "introduces the other person", "who joined the drinking", "what was drunk", "main verb"], ["ik", "hebben", "met", "iemand", "koffie", "drinken"]],
  bank: ["Op de bank ligt een boek.", ["introduces the place", "the word for the", "where it lies", "the verb", "introduces a noun", "what lies there"], ["op", "de", "bank", "liggen", "een", "boek"]],
  dat: ["Ik denk dat we hier kunnen eten.", ["who does it", "the verb", "introduces the thought", "who does it", "place word", "helping verb", "main verb"], ["ik", "denken", "dat", "wij", "hier", "kunnen", "eten"]],
  kun: ["Kun je eens naar dit ding kijken?", ["helping verb", "who does it", "softens the request", "links kijken and ding", "points to ding", "what to look at", "main verb"], ["kunnen", "jij", "eens", "naar", "dit", "ding", "kijken"]],
  als: ["Als hij valt, is hij stuk.", ["starts the condition", "what does it", "the verb", "the verb", "what is described", "describes hij"], ["als", "hij", "vallen", "zijn", "hij", "stuk"]],
  want: ["Ik bel niet, want je moet slapen.", ["who does it", "the verb", "says not", "joins the reason", "who does it", "helping verb", "main verb"], ["ik", "bellen", "niet", "want", "jij", "moeten", "slapen"]],
  ja: ["Ja, dat boek heb ik.", ["shows agreement", "points to boek", "what I have", "the verb", "who does it"], ["", "dat", "boek", "hebben", "ik"]],
  bent: ["Je bent niet klaar.", ["who isn't ready", "the verb", "says it isn't so", "describes je"], ["jij", "zijn", "niet", "klaar"]],
  baan: ["Ze is gelukkig met haar nieuwe baan.", ["who is happy", "the verb", "describing word", "links happiness to baan", "whose job", "describing word", "what happiness concerns"], ["zij", "zijn", "gelukkig", "met", "haar", "nieuw", "baan"]],
  meisje: ["Het meisje heeft het boek al gelezen.", ["the word for the", "who does it", "helping verb", "the word for the", "what's being read", "time word", "main verb"], ["het", "meisje", "hebben", "het", "boek", "al", "lezen"]],
  moeder: ["Mijn moeder drinkt graag koffie.", ["shows whose mother", "who does it", "the verb", "describes the drinking", "what's being drunk"], ["mijn", "moeder", "drinken", "graag", "koffie"]],
  meen: ["Ik meen het, doe niet zo stom.", ["who does it", "the verb", "what's meant", "the verb", "says not", "how stupid", "describes your behavior"], ["ik", "menen", "het", "doen", "niet", "zo", "stom"]],
  week: ["Volgende week heb ik een avond vrij.", ["which week", "time word", "the verb", "who does it", "introduces an evening", "what ik has free", "describes the evening"], ["volgend", "week", "hebben", "ik", "een", "avond", "vrij"]],
  recht: ["Ieder mens heeft het recht om te kiezen.", ["describes mens", "who does it", "the verb", "the word for the", "what each person has", "links recht to kiezen", "links to kiezen", "second verb"], ["ieder", "mens", "hebben", "het", "recht", "om", "te", "kiezen"]],
  vergeet: ["Ik vergeef je, maar ik vergeet het niet.", ["who does it", "the verb", "who is forgiven", "joins contrasting statements", "who does it", "the verb", "what isn't forgotten", "says not"], ["ik", "vergeven", "jij", "maar", "ik", "vergeten", "het", "niet"]],
  bang: ["Ik heb die film gezien en nu ben ik bang.", ["who does it", "helping verb", "points to film", "what was watched", "main verb", "joins two parts", "time word", "the verb", "who feels scared", "describes ik"], ["ik", "hebben", "die", "film", "zien", "en", "nu", "zijn", "ik", "bang"]],
  er: ["Is er al koffie?", ["the verb", "introduces what's there", "time word", "what might be there"], ["zijn", "er", "al", "koffie"]],
  waarom: ["Waarom is dat bed zo hoog?", ["asks the reason", "the verb", "which bed", "what is described", "how high", "describes the bed"], ["waarom", "zijn", "dat", "bed", "zo", "hoog"]],
};
const shape = (key, kind, marks, { roles = true } = {}) => {
  const [text, r, lemmas] = S[key];
  return ruleShape({ kind, words: text.split(" "), marks, roles: roles ? r : [], lemmas: roles ? lemmas : [] });
};
const lines = (result) => result.said.map(({ line, parts }) => `${line} ${JSON.stringify(parts)}`);

check("perfect: a bracket from the helping verb to the past form (heb … gedronken), said in words", () => {
  const r = shape("perfect", "order", [5]);
  assert.deepEqual(r.pairs, [[1, 5]]);
  assert.equal(r.seats, null);
  assert.deepEqual(r.said.map((one) => one.line), ["closes"]);
});
check("dat: a bracket from dat to the verbs that end its clause (dat … kunnen eten)", () => {
  assert.deepEqual(shape("dat", "order", [5]).pairs, [[2, 6]]);
});
check("om … te: om with the te-verb at the end of its clause", () => {
  assert.deepEqual(shape("recht", "order", [5]).pairs, [[5, 7]]);
});
check("v2: the verb comes second, with everything before it one part (Op de bank | ligt | een boek)", () => {
  const r = shape("bank", "order", [3]);
  assert.deepEqual(r.pairs, []);
  assert.deepEqual(r.seats, [[0, 2], [3, 3], [4, 5]]);
  assert.equal(r.litSeat, 1);
  assert.deepEqual(lines(r), ['placeRole {"word":"ligt","role":"the verb","place":"second"}']);
});
check("v2: a first part of several words the roles don't join is still one part (Volgende week heb ik)", () => {
  assert.equal(shape("week", "order", [2]).said.at(-1)?.parts.place, "second");
});
check("v2: a clause like 'Als hij valt,' is the first part", () => {
  const r = shape("als", "order", [3]);
  assert.deepEqual(r.seats[0], [0, 2]);
  assert.equal(r.said.at(-1)?.parts.place, "second");
});
check("v2: a word set off by a comma (Ja,) stands outside the count", () => {
  const r = shape("ja", "order", [3]);
  assert.deepEqual(r.seats, [[1, 2], [3, 3], [4, 4]]);
  assert.equal(r.said.at(-1)?.parts.place, "second");
});
check("v2: counted in its own clause, after en (… en nu ben ik bang)", () => {
  assert.equal(shape("bang", "order", [7]).said.at(-1)?.parts.place, "second");
});
check("question: a lone helping verb is about its place, not a bracket (Kun je … ? comes first)", () => {
  const r = shape("kun", "order", [0]);
  assert.deepEqual(r.pairs, []);
  assert.equal(r.said.at(-1)?.parts.place, "first");
});
check("question with a question word: the verb comes second (Waarom is …)", () => {
  assert.equal(shape("waarom", "order", [1]).said.at(-1)?.parts.place, "second");
});
check("modal: the main verb with its helping verb (Kun … kijken)", () => {
  assert.deepEqual(shape("kun", "order", [6]).pairs, [[0, 6]]);
});
check("niet last in its own clause, after maar", () => {
  assert.equal(shape("vergeet", "order", [7]).said.at(-1)?.parts.place, "last");
});
check("want: a joining word is never counted, nor bracketed", () => {
  const r = shape("want", "order", [3]);
  assert.deepEqual(r.pairs, []);
  assert.equal(r.seats, null);
  assert.deepEqual(r.said, []);
});
check("a verb straight after a comma the notes don't explain: not counted (Ik meen het, doe …)", () => {
  const r = shape("meen", "order", [3]);
  assert.equal(r.seats, null);
  assert.deepEqual(r.said, []);
});
check("an example with no roles: marks side by side are lit, nothing more (Morgen ga ik)", () => {
  const r = ruleShape({ kind: "order", words: "Morgen ga ik naar huis.".split(" "), marks: [0, 1, 2] });
  assert.deepEqual(r.pairs, []);
  assert.equal(r.seats, null);
  assert.deepEqual(r.said, []);
});
check("an order example with no roles and one mark: lit only, never counted", () => {
  const r = shape("bank", "order", [3], { roles: false });
  assert.equal(r.seats, null);
  assert.deepEqual(r.said, []);
});
check("agreement: the verb with who does it, said marked word first (bent goes with je)", () => {
  const r = shape("bent", "agreement", [1]);
  assert.deepEqual(r.pairs, [[0, 1]]);
  assert.deepEqual(lines(r), ['goesWith {"word":"bent","other":"je"}']);
});
check("agreement: a whose word with its noun, past a describing word (haar … baan)", () => {
  assert.deepEqual(shape("baan", "agreement", [4]).pairs, [[4, 6]]);
});
check("agreement: nothing the roles say, no guess (er in 'Is er al koffie?')", () => {
  const r = shape("er", "agreement", [1]);
  assert.deepEqual(r.pairs, []);
  assert.deepEqual(r.said, []);
});
check("article: the noun, never past it (\"Het boek is goed.\": het goes with boek, its role \"what's being described\", not is)", () => {
  const r = ruleShape({ kind: "article", words: "Het boek is goed.".split(" "), marks: [0], roles: ["the word for the", "what's being described", "the verb", "describes the book"] });
  assert.deepEqual(r.pairs, [[0, 1]]);
});
check("article: past a describing word to its noun (de open deur)", () => {
  const r = ruleShape({ kind: "article", words: "Ik loop naar de open deur.".split(" "), marks: [3], roles: ["who does it", "the verb", "points to destination", "the word for the", "describes the door", "where walking leads"] });
  assert.deepEqual(r.pairs, [[3, 5]]);
});
check("article: each de or het with its own noun", () => {
  const r = shape("meisje", "article", [0, 3]);
  assert.deepEqual(r.pairs, [[0, 1], [3, 4]]);
  assert.deepEqual(lines(r), ['goesWith {"word":"het","other":"meisje"}', 'goesWith {"word":"het","other":"boek"}']);
});
check("ending: drinkt is drink + t, for mijn moeder (the whole part)", () => {
  const r = shape("moeder", "ending", [2]);
  assert.deepEqual(r.pairs, [[1, 2]]);
  assert.deepEqual(lines(r), ['endingFor {"dictionary":"drinken","word":{"text":"drinkt","spans":[[5,6]]},"who":"mijn moeder"}']);
});
check("ending: two verbs, each with its own who, no ending where the ik form has none", () => {
  const r = shape("vergeet", "ending", [1, 5]);
  assert.deepEqual(r.pairs, [[0, 1], [4, 5]]);
  assert.deepEqual(lines(r), ['endingFor {"dictionary":"vergeven","word":{"text":"vergeef","spans":[]},"who":"ik"}', 'endingFor {"dictionary":"vergeten","word":{"text":"vergeet","spans":[]},"who":"ik"}']);
});
check("a frame is never counted, a place never bracketed (when the concept says which)", () => {
  assert.equal(shape("bank", "frame", [3]).seats, null);
  assert.deepEqual(shape("perfect", "place", [5]).pairs, []);
  assert.deepEqual(shape("perfect", "frame", [5]).pairs, [[1, 5]]);
  assert.equal(shape("kun", "place", [0]).said.at(-1)?.parts.place, "first");
});
// Marks: Dutch's findings as the same marks a pack can write, and what any list of marks draws and says.
check("Dutch as marks: a frame, a link to an ending's letters with its affix, boxes, numbered places", () => {
  const words = (key) => S[key][0].split(" ");
  const as = (key, kind, marks) => marksOf({ kind, words: words(key), marks, roles: S[key][1], lemmas: S[key][2] }).marks;
  assert.deepEqual(as("perfect", "frame", [5]), [{ shape: "lit", words: [5] }, { shape: "frame", from: 1, to: 5 }]);
  assert.deepEqual(as("moeder", "ending", [2]), [{ shape: "lit", words: [2] }, { shape: "affix", word: 2, chars: [[5, 6]] }, { shape: "link", from: 1, to: 2, toChars: [5, 6] }]);
  assert.deepEqual(as("meisje", "article", [0, 3]), [{ shape: "lit", words: [0, 3] }, { shape: "box", from: 0, to: 1 }, { shape: "box", from: 3, to: 4 }]);
  assert.deepEqual(as("bank", "place", [3]).at(-1), { shape: "places", parts: [[0, 2], [3, 3], [4, 5]], mark: 1, place: "second" });
});
check("layout: lit words, the outlined ends of frames and links, affixes gathered per word, runs that stay on one line", () => {
  const l = layoutOf([
    { shape: "lit", words: [2] },
    { shape: "frame", from: 0, to: 2 },
    { shape: "link", from: 3, to: 4 },
    { shape: "affix", word: 2, chars: [[0, 1]] },
    { shape: "affix", word: 2, chars: [[4, 6]] },
    { shape: "box", from: 5, to: 6 },
    { shape: "tag", word: 1, text: "topic" },
  ]);
  assert.deepEqual([...l.lit], [2]);
  assert.deepEqual([...l.pieces].sort(), [0, 3, 4]);
  assert.deepEqual(l.affixes.get(2), [[0, 1], [4, 6]]);
  assert.deepEqual(l.together, [[5, 6], [3, 4]]);
  assert.deepEqual(l.tags, [{ shape: "tag", word: 1, text: "topic" }]);
});
check("an item's own marks say only what they give grounds for: a place, an affix from its dictionary form, each note", () => {
  const words = ["Yo", "hablo", "español."];
  const said = saidOfMarks([{ shape: "affix", word: 1, chars: [[4, 5]] }, { shape: "link", from: 0, to: 1, note: "The -o says it's me." }], words, ["yo", "hablar", "español"]);
  assert.deepEqual(said, [{ line: "ending", parts: { dictionary: "hablar", word: { text: "hablo", spans: [[4, 5]] } } }, { note: "The -o says it's me." }]);
  assert.deepEqual(saidOfMarks([{ shape: "affix", word: 1, chars: [[4, 5]] }], words, []), [], "no dictionary form, no line");
  assert.deepEqual(saidOfMarks([{ shape: "places", parts: [[0, 0], [1, 1]], mark: 1, place: "second" }], words), [{ line: "place", parts: { word: "hablo", place: "second" } }]);
});
check("marks out of range or not whole numbers are left out", () => {
  assert.deepEqual([...ruleShape({ kind: "order", words: ["Ik", "werk."], marks: [5, -1, 1.5, 1] }).lit], [1]);
});

// The ending's letters, by the word's own spelling: [word, dictionary form, stem|ending].
const ENDINGS = [
  ["drinkt", "drinken", "drink|t"], ["lees", "lezen", "lees|"], ["raakt", "raken", "raak|t"], ["heeft", "hebben", "heef|t"], ["gaat", "gaan", "gaa|t"],
  ["staat", "staan", "staa|t"], ["spreek", "spreken", "spreek|"], ["beloof", "beloven", "beloof|"], ["loop", "lopen", "loop|"], ["verhalen", "verhaal", "verhal|en"],
  ["groter", "groot", "grot|er"], ["spullen", "spul", "spull|en"], ["witte", "wit", "witt|e"], ["mooie", "mooi", "mooi|e"], ["foto's", "foto", "foto|'s"],
  ["boekje", "boek", "boek|je"], ["kopje", "kop", "kop|je"], ["voelde", "voelen", "voel|de"], ["voelden", "voelen", "voel|den"], ["woont", "wonen", "woon|t"],
  ["zit", "zitten", "zit|"], ["kleiner", "klein", "klein|er"], ["gevoelens", "gevoel", "gevoel|ens"], ["doet", "doen", "doe|t"], ["wordt", "worden", "word|t"],
  ["komt.", "komen", "kom|t"], ["Werkt", "werken", "Werk|t"],
];
check("endings split by the word's own spelling (a doubled or undoubled letter stays in the stem's part)", () => {
  const wrong = ENDINGS.map(([word, lemma, want]) => [word, lemma, want, endingOf(word, lemma)]).filter(([, , want, got]) => (got ? `${got.stem}|${got.ending}` : "null") !== want);
  assert.deepEqual(wrong.map(([w, l, want, got]) => `${l} → ${w}: ${got ? `${got.stem}|${got.ending}` : "null"} (want ${want})`), []);
});
check("a literal line's chunks are their text, never the moved flag (5 Nov: 90 of 106 lines read \"That true read I true gladly\")", () => {
  assert.deepEqual(literalChunks([["That", true], ["read"], ["I", true], ["gladly"]]), ["That", "read", "I", "gladly"]);
  assert.deepEqual(literalChunks("I have yesterday worked."), ["I", "have", "yesterday", "worked."]);
  assert.deepEqual(literalChunks(undefined), []);
});
check("no ending where the word is its dictionary form, or shares no start with it", () => {
  assert.equal(endingOf("kunnen", "kunnen"), null);
  assert.equal(endingOf("was", "zijn"), null);
  assert.equal(endingOf("is", "zijn"), null);
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
