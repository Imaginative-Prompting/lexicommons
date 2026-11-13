// Reading Anki files (public/js/anki/, public/js/study/pack-items.js), in Node, on files fixtures/anki-decks.mjs writes: each
// generation of the format, cloze, sound, which side is which, the games each card gets, and the pack check. The hostile ones
// too: script and markup in every field, a zip bomb, a zstd bomb, a frame asking for 2 GB, a damaged database, a view that
// never ends, a huge deck. With --decks <dir>, real decks too (every .apkg there, kept out of the repo). (exit 0 = pass)

import { readFileSync, readdirSync, openAsBlob, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LANGUAGES } from "../public/js/lang/index.js";
import { CAPS, DeckError, budget, readEntry, readZip, unzstd } from "../public/js/anki/zip.js";
import { allowUnicase, mediaMap } from "../public/js/anki/collection.js";
import { clozeParts, furigana, plainField, stripMarkup, templateFields } from "../public/js/anki/text.js";
import { DETECTABLE, codeOfLocale, detectLanguage, languageOfSample, languagesNamed } from "../public/js/anki/language.js";
import { gamesReport, leftOutLines, packIdOf, packOf, rolesOf } from "../public/js/anki/deck.js";
import { guessDefinition, suggestCode } from "../public/js/anki/own-language.js";
import { politeError, readDeck, soundOf } from "../public/js/anki/read.js";
import { ITEM_LIMITS, gamesOf, itemOthers, orderOf, orderWords } from "../public/js/study/pack-items.js";
import { checkPack, packText } from "../public/js/study/pack-format.js";
import * as decks from "./fixtures/anki-decks.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const decksDir = args.includes("--decks") ? args[args.indexOf("--decks") + 1] : null;
const passed = [];
const failed = [];
async function test(name, fn) {
  try {
    await fn();
    passed.push(name);
    console.log(`ok    ${name}`);
  } catch (error) {
    failed.push(name);
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const ok = (value, message = "expected true") => {
  if (!value) throw new Error(message);
};
const same = (a, b, message = "") => ok(JSON.stringify(a) === JSON.stringify(b), `${message} ${JSON.stringify(a)} is not ${JSON.stringify(b)}`);

const SQL = await decks.sqlJs();
const open = (bytes) => new SQL.Database(bytes);
const dir = mkdtempSync(join(tmpdir(), "anki-test-"));
let n = 0;
const asBlob = async (buffer) => {
  const path = join(dir, `f${n++}.apkg`);
  writeFileSync(path, buffer);
  return openAsBlob(path);
};
const read = async (buffer, options = {}) => (await readDeck(await asBlob(buffer), open, { fileName: "deck.apkg", ...options }));
const refusal = async (fn) => {
  try {
    await fn();
  } catch (error) {
    return politeError(error);
  }
  return null;
};

const MP3 = readFileSync(join(HERE, "../public/audio/starter-word-order/ido/trein-gemist.mp3"));
const SPEC = {
  deck: "Dutch basics",
  description: "<p>Made by <b>A. Teacher</b> &amp; friends.</p>",
  types: [decks.BASIC, decks.CLOZE],
  notes: [
    { fields: ["het huis [sound:huis.mp3]", "the house"] },
    { fields: ["de hond", "the dog"] },
    { fields: ["Ik heb gisteren een boek gelezen.", "I read a book yesterday."] },
    { fields: ["de kat", "the cat"] },
    { type: decks.CLOZE.id, fields: ["Het {{c1::water}} is {{c2::koud::temperature}}.", "The water is cold."] },
  ],
  media: { "huis.mp3": MP3, "pic.webp": Buffer.from("RIFF....WEBP") },
};

await test("each generation of the format reads the same: collection.anki2, .anki21, zstd .anki21b, .colpkg", async () => {
  const files = {
    anki2: decks.oldApkg(SQL, SPEC),
    anki21: decks.oldApkg(SQL, SPEC, { name: "collection.anki21" }),
    anki21b: decks.newApkg(SQL, SPEC),
    colpkg: decks.newColpkg(SQL, SPEC),
  };
  for (const [name, bytes] of Object.entries(files)) {
    const { deck, media } = await read(bytes);
    same(deck.name, "Dutch basics", name);
    same(deck.description, "Made by A. Teacher & friends.", name);
    same(deck.cards.map((c) => c.front), ["het huis", "de hond", "Ik heb gisteren een boek gelezen.", "de kat", "Het water is koud.", "Het water is koud."], name);
    same(deck.cards[0].back, "the house", name);
    same(deck.cards[0].sounds, ["huis.mp3"], name);
    same(deck.soundsHere, 1, name);
    ok(media.has("huis.mp3"), `${name}: the media list`);
  }
});

await test("a new file's stub collection.anki2 is never what's read", async () => {
  const { deck } = await read(decks.newApkg(SQL, SPEC));
  ok(!deck.cards.some((c) => /update to the latest/.test(c.front)));
});

await test("a sound unpacks to its real bytes, from an old file and from a new one's zstd", async () => {
  for (const bytes of [decks.oldApkg(SQL, SPEC), decks.newApkg(SQL, SPEC)]) {
    const blob = await asBlob(bytes);
    const { entries, media, spending } = await readDeck(blob, open);
    const sound = await soundOf(blob, entries, media, ["huis.mp3"], spending);
    ok(sound && sound.kind === "mp3" && Buffer.compare(Buffer.from(sound.bytes), MP3) === 0, "the bytes differ");
    same(await soundOf(blob, entries, media, ["pic.webp", "nope.mp3"], spending), null, "a picture or a missing file is no sound");
  }
});

await test("cloze: one card per gap, the gap where it says, its hint kept, others shown", async () => {
  const { deck } = await read(decks.oldApkg(SQL, SPEC));
  const clozes = deck.cards.filter((c) => c.cloze);
  same(clozes.length, 2);
  same(clozes[0].cloze, { at: 4, answer: "water" });
  same(clozes[1].cloze, { at: 13, answer: "koud", hint: "temperature" });
  ok(clozes.every((c) => c.front.slice(c.cloze.at, c.cloze.at + c.cloze.answer.length) === c.cloze.answer));
  same(clozes[0].back, "The water is cold.");
  same(clozeParts("a {{c1::b {{c2::c}} d}} e"), null, "a gap inside a gap");
});

await test("which field is which: a rich note type's word, meaning, reading, sentence and sound", async () => {
  const type = { id: 1, name: "Vocab", fields: ["Word", "Word Reading", "Word Meaning", "Word Furigana", "Word Audio", "Sentence", "Sentence Meaning", "Sentence Audio", "Notes", "Picture"], templates: [{ q: "{{Word}}", a: "{{FrontSide}}{{Word Reading}}{{Word Meaning}}{{Sentence}}{{Sentence Meaning}}{{Word Audio}}{{Notes}}" }] };
  const r = rolesOf(type);
  same([r.front, r.back, r.reading, r.sentence, r.sentenceBack, r.audio, r.sentenceAudio], [0, 2, 1, 5, 6, 4, 7]);
  const spec = { deck: "日本語", types: [type], notes: [{ fields: ["私", "わたし", "I", "私[わたし]", "[sound:a.mp3]", "<b>私</b>はアンです。", "I am Ann.", "[sound:b.mp3]", "polite", "<img src=x.webp>"] }], media: { "a.mp3": MP3, "b.mp3": MP3 } };
  const { deck } = await read(decks.newApkg(SQL, spec));
  same(deck.cards[0], { id: deck.cards[0].id, front: "私", back: "I", reading: "わたし", sentence: "私はアンです。", sentenceBack: "I am Ann.", extras: [{ label: "Notes", text: "polite" }], sounds: ["a.mp3", "b.mp3"] });
  same(deck.language.language, "ja");
  same(deck.language.sure, true);
});

await test("a template's tts names the language, and a filter on a field's name isn't taken for the field", async () => {
  same(templateFields("{{tts nl_NL voices=Apple_Ellen:Front}} {{#Back}}{{furigana:Back}}{{/Back}} {{FrontSide}} {{type:Back}}").map((f) => [f.field, f.tts, f.filters]), [["Front", "nl_NL", ["tts"]], ["Back", "", ["furigana", "type"]]]);
  same(templateFields("[anki:tts lang=de_DE]{{Wort}}[/anki:tts]").map((f) => [f.field, f.tts]), [["Wort", "de_DE"]]);
  same([codeOfLocale("nl_NL"), codeOfLocale("zh-TW"), codeOfLocale("no_NO"), codeOfLocale("xx")], ["nl", "zh-Hant", "nb", null]);
});

await test("the sides: English fronts change places, a deck says its language by name, an unsure one asks", async () => {
  const fronts = ["the house", "the dog", "a book", "to read", "the cat", "in the morning", "and then", "for you", "it is", "of the", "this is", "with you", "you are", "on the", "that is", "to be", "at the", "from the", "they are", "we have"];
  const backs = ["het huis", "de hond", "een boek", "lezen", "de kat", "in de morgen", "en dan", "voor jou", "het is", "van de", "dit is", "met jou", "je bent", "op de", "dat is", "zijn", "bij de", "van de man", "ze zijn", "wij hebben"];
  const flipped = detectLanguage({ fronts, backs });
  same([flipped.language, flipped.from, flipped.swap], ["nl", "en", true]);
  const straight = detectLanguage({ fronts: backs, backs: fronts });
  same([straight.language, straight.from, straight.swap, straight.sure], ["nl", "en", false, true]);
  const named = detectLanguage({ fronts: ["casa", "perro"], backs: ["house", "dog"] }, { deckNames: languagesNamed("Spanish vocabulary") });
  same([named.language, named.sure], ["es", true]);
  const nouns = detectLanguage({ fronts: ["casa", "perro"], backs: ["huis", "hond"] });
  same(nouns.sure, false, "a few nouns and no name");
  const blind = detectLanguage({ fronts: ["xqz"], backs: ["vvv"] });
  same(blind.sure, false);
  same(languageOfSample(["안녕하세요"]).code, "ko");
  same(languageOfSample(["これは本です"]).code, "ja");
  same(languageOfSample(["这个学习话语", "他们说"]).code, "zh");
  same(languageOfSample(["這個學習話語", "他們說"]).code, "zh-Hant");
  same(languagesNamed("Learn German from Spanish"), ["de", "es"]);
  same(languagesNamed("Germany trip"), [], "a word that only starts like a language's name");
});

await test("every language it can name is one Lexicommons knows", () => {
  const unknown = DETECTABLE.filter((code) => !Object.hasOwn(LANGUAGES, code));
  same(unknown, []);
});

await test("the games follow what's in a card, and never one it can't carry", () => {
  const others = { means: 5, answers: 5 };
  const plain = { id: "a", text: "het huis", means: "the house" };
  same(gamesOf(plain, { others }), ["card", "type", "match", "choose"]);
  same(gamesOf(plain, { others, sound: true }), ["card", "type", "match", "choose", "listen"]);
  same(gamesOf(plain, { others: { means: 2, answers: 0 } }), ["card", "type", "match"], "Choose needs other backs");
  same(gamesOf(plain, { others: { means: 0, answers: 0 }, sound: true }), ["card", "type", "match"], "Listening needs other backs");
  const long = { id: "b", text: "x".repeat(ITEM_LIMITS.typed + 1), means: "y" };
  ok(!gamesOf(long, { others }).includes("type") && !gamesOf(long, { others }).includes("match"), "too long to type or match");
  const sentence = { id: "c", text: "Ik heb een boek gelezen.", means: "I read a book." };
  ok(gamesOf(sentence, { others }).includes("arrange"), "a sentence plays Word order");
  same(orderOf(sentence).words, ["Ik", "heb", "een", "boek", "gelezen."]);
  ok(!gamesOf(sentence, { others, separator: "" }).includes("arrange"), "not where words have no spaces");
  ok(!gamesOf({ id: "d", text: "de grote hond", means: "the big dog" }, { others }).includes("arrange"), "a short phrase isn't a sentence");
  ok(gamesOf({ id: "e", text: "huis", means: "house", sentence: "Dat is mijn huis.", sentenceBack: "That is my house." }, { others }).includes("arrange"), "its own sentence plays it");
  same(gamesOf({ id: "f", text: "Het water is koud.", cloze: { at: 4, answer: "water" } }, { others }), ["fill"], "cloze: fill the gap");
  same(orderWords("one ... two"), null, "a tile with no letters");
  same(orderWords("a b"), null, "too few");
});

const reporter = () => {
  const errors = [];
  return {
    errors,
    warnings: [],
    error: (at, message) => errors.push({ at, message }),
    warn() {},
    text(value, at, max, { required = false } = {}) {
      if (value === undefined || value === null || value === "") {
        if (required) errors.push({ at, message: `${at} is missing` });
        return undefined;
      }
      if (typeof value !== "string") return void errors.push({ at, message: `${at} must be text` });
      const out = value.replace(/\s+/g, " ").trim();
      if (!out) {
        if (required) errors.push({ at, message: `${at} is empty` });
        return undefined;
      }
      if (out.length > max) return void errors.push({ at, message: `${at} too long` });
      return out;
    },
    list: (value, at, max) => (Array.isArray(value) ? (value.length > max ? (errors.push({ at, message: "too many" }), []) : value) : value === undefined ? [] : (errors.push({ at, message: "not a list" }), [])),
    ignoreOthers() {},
  };
};

await test("the pack check refuses every bad card", () => {
  const refused = (cards, why) => {
    const { errors } = checkPack({ format: "lexicommons-pack", version: 2, id: "check-cards", name: "Cards", language: "nl", from: "en", topics: {}, words: {}, chunks: {}, patterns: {}, items: cards }, { installed: [] });
    ok(errors.length > 0, `not refused: ${why}`);
  };
  refused([null], "not an object");
  refused([{ id: "Bad Id", text: "a", means: "b" }], "an id");
  refused([{ id: "a", text: "", means: "b" }], "no text");
  refused([{ id: "a", text: "a" }], "no means, and no cloze");
  refused([{ id: "a", text: { toString: null }, means: "b" }], "a text that isn't text");
  refused([{ id: "a", text: "x".repeat(ITEM_LIMITS.side + 1), means: "b" }], "too long");
  refused([{ id: "a", text: "a", means: "b" }, { id: "a", text: "c", means: "d" }], "two the same id");
  refused([{ id: "a", text: "a", means: "b", sentence: "s" }], "a sentence with no meaning");
  refused([{ id: "a", text: "abc", cloze: { at: 1, answer: "x" } }], "a cloze answer not there");
  refused([{ id: "a", text: "abc", cloze: { at: -1, answer: "a" } }], "a cloze at nowhere");
  refused([{ id: "a", text: "abc", cloze: "a" }], "a cloze that isn't one");
  refused(Array.from({ length: ITEM_LIMITS.items + 1 }, (_, i) => ({ id: `c${i}`, text: "a", means: "b" })), "too many");
});

await test("a deck's pack passes checkPack as it is, in the pack's own language rules, and id stays the same", async () => {
  const { deck } = await read(decks.newApkg(SQL, SPEC));
  const { pack } = packOf(deck, { language: "nl", from: "en", swap: false });
  same(pack.id, packIdOf("Dutch basics"));
  const checked = checkPack(pack, { installed: [] });
  same(checked.errors, []);
  same(checked.pack.items.length, 6);
  same(checked.warnings, []);
  ok(!packText(checked.pack).includes("huis.mp3"), "a sound's file name isn't in what could be shared");
  const swapped = packOf(deck, { language: "en", from: "nl", swap: true }).pack;
  same(swapped.items[0].text, "the house");
  same(swapped.items[0].means, "het huis");
  same(swapped.items.at(-1).text, "Het water is koud.", "a cloze card's sides stay");
  same(checkPack(swapped, { installed: [] }).errors, []);
});

// ---------- hostile ----------

await test("script and markup in every field and template come out as plain text, or not at all", async () => {
  const { deck } = await read(decks.newApkg(SQL, decks.HOSTILE));
  const text = JSON.stringify(deck);
  for (const banned of ["<script", "window.__ran='front'", "window.__ran='back'", "onerror=\"", "<svg", "<iframe", "onload", "<style", "onclick", "onmouseover", "javascript:window.__ran='iframe'"]) ok(!text.includes(banned), `found ${banned}`);
  same(deck.cards.map((c) => c.front).slice(0, 4), ["het huis", "de <img src=x onerror=window.__ran='entity'> hond", "de kat", "de boom"]);
  same(deck.cards[0].back, "the house");
  ok(!deck.description.includes("alert"), deck.description);
  same(deck.description, "Made by someone");
});

await test("the markup walk: unclosed tags, comments, lone brackets, entities that decode to markup stay text", () => {
  same(plainField("a < b and c > d").text, "a < b and c > d");
  same(plainField("<b>bold</b><br>next").text, "bold next");
  same(plainField("x<!-- <script>y</script> -->z").text, "xz");
  same(plainField("before<script>never").text, "before");
  same(plainField("before<img src='a>b' onerror='x'>after").text, "beforeafter");
  ok(plainField("<img src=a>").picture);
  same(plainField("&lt;script&gt;x&lt;/script&gt;").text, "<script>x</script>", "shown as the text it says, never read as markup");
  same(plainField("caf&eacute; &#233; &#xe9; &nosuch;").text, "café é é &nosuch;");
  same(plainField("[sound:a.mp3] word [sound:b&amp;c.mp3]").sounds, ["a.mp3", "b&c.mp3"]);
  ok(plainField("[latex]x^2[/latex]").math);
  ok(plainField("\\(x^2\\)").math);
  same(furigana("日本語[にほんご]は 難[むずか]しい"), { written: "日本語は難しい", said: "にほんごはむずかしい" });
});

await test("a crafted field can't stall the walk: linear on the worst it can hold", () => {
  const big = CAPS.fieldChars;
  for (const crafted of ["<".repeat(big), "<a ".repeat(big / 3), "<!--".repeat(big / 4), "<script>".repeat(big / 8), "&".repeat(big), "[sound:".repeat(big / 7), "{{c1::".repeat(big / 6), "<a b='".repeat(big / 6)]) {
    const start = performance.now();
    plainField(crafted);
    clozeParts(crafted);
    furigana(crafted);
    const took = performance.now() - start;
    ok(took < 500, `${crafted.slice(0, 12)}… took ${Math.round(took)} ms`);
  }
});

await test("a zip bomb stops at its cap, whatever its directory claims", async () => {
  const before = process.memoryUsage().rss;
  const refused = await refusal(() => read(decks.deflateBomb()));
  same(refused?.code, "too-big");
  ok(process.memoryUsage().rss - before < 800_000_000, "it held too much");
});

await test("a zstd bomb stops at its cap, and a frame asking for 2 GB is refused before anything's set aside", async () => {
  same((await refusal(() => read(decks.zstdBomb())))?.code, "too-big");
  same((await refusal(() => read(decks.zstdHugeWindow())))?.code, "too-big");
});

await test("the budget for one file counts everything unpacked from it", async () => {
  const spending = budget(10);
  spending.spend(10);
  const threw = await refusal(() => spending.spend(1));
  same(threw?.code, "too-big");
});

await test("a damaged file says so: not a database, cut off, not a zip, empty, no collection in it", async () => {
  for (const [name, bytes, code] of [
    ["not a database", decks.brokenDatabase(), "broken"],
    ["cut off", decks.truncatedDatabase(SQL, SPEC), "broken"],
    ["not a zip", Buffer.from("hello there, this is plainly not a zip file at all, not even close."), "not-anki"],
    ["empty", Buffer.alloc(0), "not-anki"],
    ["no collection", decks.zip([{ name: "readme.txt", bytes: Buffer.from("hi") }]), "not-anki"],
  ]) {
    const refused = await refusal(() => read(bytes));
    same(refused?.code, code, name);
    ok(!/undefined|sql|sqlite|stack/i.test(refused.message), `${name}: "${refused.message}"`);
  }
});

await test("notes as a view that never ends is refused without reading it", async () => {
  const start = performance.now();
  same((await refusal(() => read(decks.viewDatabase(SQL))))?.code, "not-anki");
  ok(performance.now() - start < 2000, "it took too long");
});

await test("a big deck keeps its first 5,000 cards and says so; a far bigger one is refused in words", async () => {
  const { deck } = await read(decks.manyNotes(SQL, 6000));
  same(deck.cards.length, 5000);
  same(deck.leftOver, 1000);
  same(deck.cards[0].front, "woord1", "in the deck's order");
  ok(leftOutLines(deck)[0].includes("first 5,000"), leftOutLines(deck)[0]);
  same(checkPack(packOf(deck, { language: "nl", from: "en" }).pack, { installed: [] }).errors, []);
  const refused = await refusal(() => read(decks.manyNotes(SQL, CAPS.notes + 1)));
  same(refused?.code, "too-big");
  ok(/notes/.test(refused.message), refused.message);
});

await test("a deck that would pass a pack's size keeps what fits and says so, and what it keeps passes the check", async () => {
  const long = "woord ".repeat(60).trim();
  const spec = { deck: "Wordy deck", types: [decks.BASIC], notes: Array.from({ length: 5000 }, (_, i) => ({ fields: [`${i} ${long}`, `${i} ${"word ".repeat(70).trim()}`] })) };
  const { deck } = await read(decks.oldApkg(SQL, spec));
  ok(deck.cards.length < 5000 && deck.leftOver > 0, `${deck.cards.length} kept, ${deck.leftOver} left out`);
  ok(leftOutLines(deck)[0].includes("first"), leftOutLines(deck)[0]);
  same(checkPack(packOf(deck, { language: "nl", from: "en" }).pack, { installed: [] }).errors.slice(0, 2), []);
  return `${deck.cards.length} cards`;
});

await test("a sound in a format that can't be kept is counted and said, and its card plays no Listening", async () => {
  const spec = { deck: "Oggs", types: [decks.BASIC], notes: [{ fields: ["het huis [sound:huis.ogg]", "the house"] }, { fields: ["de hond [sound:hond.mp3]", "the dog"] }, { fields: ["de kat [sound:missing.mp3]", "the cat"] }], media: { "huis.ogg": Buffer.from("OggS"), "hond.mp3": MP3 } };
  const { deck } = await read(decks.oldApkg(SQL, spec));
  same([deck.soundsHere, deck.soundsOther], [1, 1]);
  same(deck.cards.map((card) => card.sounds), [[], ["hond.mp3"], []]);
  ok(leftOutLines(deck).some((line) => /format that can't be kept/.test(line)), JSON.stringify(leftOutLines(deck)));
});

await test("a file too big to try says its size, before reading a byte", async () => {
  const big = { size: CAPS.fileBytes + 1, slice() { throw new Error("read"); } };
  const refused = await refusal(() => readZip(big));
  same(refused?.code, "file-too-big");
});

await test("left out says why: pictures alone, math, nothing on a side, too long, the same twice", async () => {
  const spec = {
    deck: "Mixed",
    types: [decks.BASIC, { id: 1003, name: "Image Occlusion", fields: ["Image", "Mask"], templates: [{ q: "{{Image}}", a: "{{Mask}}" }] }],
    notes: [
      { fields: ["<img src=a.png>", "a picture's answer"] },
      { fields: ["[latex]x[/latex]", "math"] },
      { fields: ["only a front", ""] },
      { fields: ["x".repeat(ITEM_LIMITS.side + 1), "too long"] },
      { fields: ["twice", "the same"] },
      { fields: ["twice", "the same"] },
      { type: 1003, fields: ["<img src=b.png>", "<img src=c.png>"] },
      { fields: ["kept", "this one"] },
    ],
  };
  const { deck } = await read(decks.oldApkg(SQL, spec));
  same(deck.cards.map((c) => c.front), ["twice", "kept"]);
  same([deck.tally.pictureOnly, deck.tally.math, deck.tally.noBack, deck.tally.tooLong, deck.tally.duplicate, deck.tally.occlusion], [1, 1, 1, 1, 1, 1]);
  same(leftOutLines(deck).length, 6);
});

await test("unicase is swapped only in a schema: a note that says it stays as written", () => {
  const bytes = new TextEncoder().encode("name text COLLATE unicase, and a note about unicase");
  same(new TextDecoder().decode(allowUnicase(bytes)), "name text COLLATE nocase , and a note about unicase");
});

await test("a media list in a new file names each entry by its place", async () => {
  const blob = await asBlob(decks.newApkg(SQL, SPEC));
  const entries = await readZip(blob);
  const files = await mediaMap(blob, entries, budget());
  same(files.get("huis.mp3"), "0");
  same(files.get("pic.webp"), "1");
});

await test("a deck's other fields and tags come across as plain text, with their labels; study markers don't; they never cost a card", async () => {
  const RICH = { id: 7001, name: "Rich", fields: ["Word", "Meaning", "Notes", "Part of speech", "Example", "Picture", "Audio", "Math"], templates: [{ name: "Card 1", qfmt: "{{Word}}", afmt: "{{Meaning}}<br>{{Notes}}" }] };
  const spec = {
    deck: "Rich words",
    types: [RICH],
    notes: [
      { fields: ["het huis", "the house", "a <b>home</b> too<script>alert(1)</script>", "noun", "Ik heb een huis.", '<img src="x.png">', "[sound:x.mp3]", ""], tags: "chapter-1 leech marked noun::place" },
      { fields: ["de kat", "the cat", "", "", "", "", "", ""] },
      { fields: ["het huis2", "the house", "het huis2", "the house", "x".repeat(ITEM_LIMITS.side + 5), "", "", ""] },
    ],
  };
  const { deck } = await read(decks.oldApkg(SQL, spec));
  const [first, second, third] = deck.cards;
  same(first.extras.map((extra) => extra.label), ["Notes", "Part of speech", "Example"], "the fields with text, in order; no picture, no sound");
  same(first.extras[0].text, "a home too", "plain: no markup, no script");
  same(first.tags, ["chapter-1", "noun::place"], "study markers out");
  same(second.extras, undefined, "nothing else on it");
  same(second.tags, undefined);
  same(third.extras, undefined, "repeating a side is nothing to add");
  ok(leftOutLines(deck).some((line) => /too long to keep/.test(line)), `said: ${leftOutLines(deck)}`);
  // Through the pack: kept as an item's, and passing the check.
  const { pack } = packOf(deck, { language: "nl", from: "en" });
  const checked = checkPack(pack, { installed: [] });
  same(checked.errors, [], "the pack's check");
  same(checked.pack.items[0].extras[1], { label: "Part of speech", text: "noun" });
  same(checked.pack.items[0].tags, ["chapter-1", "noun::place"]);
  // Swapping sides leaves them where they are.
  const swapped = packOf(deck, { language: "nl", from: "en", swap: true }).pack;
  same(swapped.items[0].extras.length, 3);
});

await test("a deck whose extras don't fit keeps every card, and says so", async () => {
  const LONG = { id: 7002, name: "Long", fields: ["Word", "Meaning", "Notes"], templates: [{ name: "Card 1", qfmt: "{{Word}}", afmt: "{{Meaning}}" }] };
  const notes = Array.from({ length: 5200 }, (_, i) => ({ fields: [`woord${i}`, `word ${i}`, `${"n".repeat(380)}${i}`] }));
  const { deck } = await read(decks.oldApkg(SQL, { deck: "Long extras", types: [LONG], notes }));
  same(deck.cards.length, ITEM_LIMITS.items, "every card a pack can hold");
  ok(deck.cards.at(-1).extras === undefined, "the last ones gave up their extras");
  ok(deck.cards[0].extras?.length === 1, "the first kept theirs");
  ok(leftOutLines(deck).some((line) => /too long to keep/.test(line)), "said");
  const { pack } = packOf(deck, { language: "nl", from: "en" });
  ok(JSON.stringify(pack).length < 2_000_000, `${JSON.stringify(pack).length} bytes`);
  same(checkPack(pack, { installed: [] }).errors.slice(0, 2), [], "it still passes");
});

await test("the report counts each game once per card that has it", async () => {
  const { deck } = await read(decks.newApkg(SQL, SPEC));
  const { pack } = packOf(deck, { language: "nl", from: "en" });
  same(gamesReport(pack.items, { sounded: new Set([pack.items[0].id]) }), { card: 4, type: 4, match: 3, choose: 4, fill: 2, listen: 1, arrange: 1, say: 0 });
  same(itemOthers(pack.items)(pack.items[0]).means, 4);
});

// A deck in a language Lexicommons doesn't list (12 Nov 2026, packs in any language, part 4).
const BURMESE_DECK = { deck: "Burmese words", types: [decks.BASIC], notes: [["ရေ", "water"], ["ကော်ဖီ", "coffee"], ["မင်္ဂလာပါ", "hello"], ["ရေသောက်ချင်တယ်။", "I want to drink water."], ["ကော်ဖီသောက်ချင်တယ်။", "I want to drink coffee."], ["နေကောင်းလား။", "Are you well?"]].map((fields) => ({ fields })) };

await test("a deck in a language Lexicommons doesn't list: how its cards suggest it's written, each guess its own", () => {
  same(guessDefinition(["ရေ", "မင်္ဂလာပါ", "ရေသောက်ချင်တယ်။", "ကော်ဖီသောက်ချင်တယ်။", "နေကောင်းလား။"]), { direction: "ltr", written: "unspaced", case: "any", ends: ["။"] }, "Burmese");
  same(guessDefinition(["מים", "אני שותה מים", "שלום", "בית"]), { direction: "rtl", written: "spaces", case: "any", ends: [] }, "Hebrew");
  same(guessDefinition(["ماء", "أشرب الماء", "مرحبا"]).direction, "rtl", "Arabic");
  same(guessDefinition(["dydh da", "fatla genes?", "meur ras.", "yeghes da!"]), { direction: "ltr", written: "spaces", case: "lower", ends: [] }, "Cornish");
  same(guessDefinition(["das Haus", "der Hund", "Ich trinke Wasser", "Wir sehen den Baum", "Die Katze schläft", "Das Kind spielt im Garten"]).case, "any", "German's nouns");
  same(guessDefinition(["ilovelongwordswithoutanyspace", "anotherverylongwordwithoutspace", "andathirdlongwordwithnospacesatall", "short"]).written, "unspaced", "long cards with no space");
  same(guessDefinition(["ሰላም ነህ።", "ደህና ነኝ።", "ውሃ እፈልጋለሁ።"]).ends, ["።"], "Amharic's full stop");
  same(guessDefinition([]), { direction: "ltr", written: "spaces", case: "lower", ends: [] }, "nothing to go on");
});

await test("a code made from its name: und-x- and up to three of its words, 8 letters each, accents gone; none from a name with no such letters", () => {
  same(suggestCode("Toki Pona"), "und-x-toki-pona");
  same(suggestCode("Kölsch"), "und-x-kolsch");
  same(suggestCode("Tolkiens Quenya of the First Age"), "und-x-tolkiens-quenya-of");
  same(suggestCode("日本語"), "");
  same(suggestCode(""), "");
});

await test("a Burmese deck's pack carries its definition through the pack check, and the check leaves the registry as it was", async () => {
  const { deck } = await read(decks.oldApkg(SQL, BURMESE_DECK));
  ok(!deck.language.language || deck.language.unsureAbout || !deck.language.sure, `the deck was taken for ${deck.language.language}, sure`);
  const languageDef = { name: "Burmese", direction: "ltr", written: "unspaced", case: "any", ends: ["။"] };
  const { pack } = packOf(deck, { language: "my", from: "en", swap: false, languageDef });
  same([pack.language, pack.languageDef], ["my", languageDef]);
  const checked = checkPack(pack, { installed: [] });
  same(checked.errors, []);
  same(checked.pack.items.map((item) => item.text), ["ရေ", "ကော်ဖီ", "မင်္ဂလာပါ", "ရေသောက်ချင်တယ်။", "ကော်ဖီသောက်ချင်တယ်။", "နေကောင်းလား။"]);
  ok(!Object.hasOwn(LANGUAGES, "my"), "the check left Burmese in the registry");
  // Without its definition, a code Lexicommons doesn't list is refused in words.
  const bare = checkPack(packOf(deck, { language: "my", from: "en", swap: false }).pack, { installed: [] });
  ok(bare.errors.length && /languageDef/.test(bare.errors[0].message), `without its definition: ${JSON.stringify(bare.errors)}`);
});

if (decksDir) {
  for (const name of readdirSync(decksDir).filter((file) => /\.(apkg|colpkg)$/.test(file))) {
    await test(`a real deck: ${name}`, async () => {
      const { deck } = await readDeck(await openAsBlob(join(decksDir, name)), open, { fileName: name });
      ok(deck.cards.length > 0, "no cards");
      const { language, from, swap } = deck.language;
      const { pack } = packOf(deck, { language: language ?? "nl", from: from ?? "en", swap });
      same(checkPack(pack, { installed: [] }).errors.slice(0, 3), []);
      ok(!/<script|onerror=/.test(JSON.stringify(pack)), "markup came through");
      console.log(`      ${deck.name}: ${deck.cards.length} cards, ${deck.language.language} from ${deck.language.from}, sure ${deck.language.sure}, sound ${deck.soundsHere}`);
    });
  }
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed.length}/${passed.length + failed.length} passed`);
process.exit(failed.length ? 1 : 0);
