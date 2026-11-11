// A person's edits to a pack's items (study/pack-authoring.js editItem, simpleItem, inverseOf, withInverse), on real items and the pack's own check:
// everything but what they changed stays, a spelling fix carries through a sentence's detail, a rewrite says so and comes out a simple item, a plain card's
// fill-in follows its text, a new item is as small as a text and what it means, and a change puts back exactly. Exit 0 = pass.
//   node scripts/test-pack-edit.mjs
import { readFileSync } from "node:fs";
import { applyChange, editItem, inverseOf, simpleItem, withInverse } from "../public/js/study/pack-authoring.js";
import { checkPack, itemSentence } from "../public/js/study/pack-format.js";
import { isSentence, orderedItem } from "../public/js/study/pack-items.js";

let failed = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
};
const eq = (got, want, what = "") => {
  const [a, b] = [JSON.stringify(got), JSON.stringify(want)];
  if (a !== b) throw new Error(`${what}\n      got  ${a?.slice(0, 500)}\n      want ${b?.slice(0, 500)}`);
};
const ok = (value, what) => {
  if (!value) throw new Error(what);
};
const read = (name) => JSON.parse(readFileSync(new URL(`../packs/${name}.json`, import.meta.url), "utf8"));
const nl = read("words-nl-01");
const ja = read("starter-ja");
const item = (pack, id) => pack.items.find((one) => one.id === id);
const without = (value, ...keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
// A pack holding just this item and whatever it names, through the real check.
const passes = (pack, one) => {
  const small = { ...pack, id: `${pack.id}-edit`, items: [one], lessons: undefined, units: undefined };
  const { pack: checked, errors } = checkPack(small, { installed: [pack] });
  eq(errors.map((e) => e.message), [], "the pack's check");
  return checked.items[0];
};
const dat = item(nl, "dat");

test("nothing changed: the same item, byte for byte", () => {
  const { item: next, rewrite, problems } = editItem(dat, { text: dat.text, means: dat.means }, "nl");
  eq(JSON.stringify(next), JSON.stringify(dat));
  eq([rewrite, problems], [false, []]);
});
test("what it means: only that changes", () => {
  const { item: next } = editItem(dat, { means: "A good idea, that." }, "nl");
  eq(without(next, "means"), without(dat, "means"));
  eq(next.means, "A good idea, that.");
  ok(isSentence(passes(nl, next)), "still a sentence");
});
test("whatever else a card has stays, however it's edited", () => {
  const card = { id: "c", topic: "talk", concepts: ["zijn-hebben"], text: "De kat zit.", means: "The cat sits.", reading: "de kat", sentence: "De kat zit daar.", sentenceBack: "The cat sits there." };
  const { item: next } = editItem(card, { text: "De kat ligt.", means: "The cat lies." }, "nl");
  eq(next, orderedItem({ ...card, text: "De kat ligt.", means: "The cat lies." }));
});
test("a spelling fix in a sentence: its lemma and everything else stay, and the fix carries", () => {
  const { item: next, rewrite } = editItem(dat, { text: "Dat is een goet idee." }, "nl");
  eq(rewrite, false);
  eq(next.words[3], ["goet", "goed"]);
  eq(next.text, "Dat is een goet idee.");
  eq([next.literal, next.gap, next.concepts, next.id], [dat.literal, dat.gap, dat.concepts, dat.id]);
  eq(next.wrong, ["Dat zijn een goet idee.", "Dat ben een goet idee."], "a wrong version says it the same way");
  ok(isSentence(passes(nl, next)), "still a sentence");
});
test("the gap's word respelled: its choice follows", () => {
  const { item: next } = editItem(dat, { text: "Dad is een goed idee." }, "nl");
  eq(next.gap, { index: 0, options: ["Dad", "Dit", "Wat"] });
  passes(nl, next);
});
test("capitals, accents and the end mark are a fix", () => {
  const { item: next, rewrite } = editItem(dat, { text: "dat is een goed idee!" }, "nl");
  eq(rewrite, false);
  eq([next.punct, next.words[0][0], next.text], ["!", "dat", "dat is een goed idee!"]);
  passes(nl, next);
});
test("other words, or a different count of them, is a rewrite: said, and a simple item with no stale help", () => {
  for (const text of ["Ik wil graag een andere zin.", "Dat is een heel goed idee.", "Dit was geen slecht plan."]) {
    const { item: next, rewrite, sentenceBefore } = editItem(dat, { text }, "nl");
    eq([rewrite, sentenceBefore], [true, true], text);
    eq(Object.keys(next), ["id", "topic", "concepts", "text", "means"], text);
    eq(next.text, text);
    ok(!isSentence(passes(nl, next)), "a simple item");
  }
});
test("how many words can be respelled: one of five, two of six", () => {
  eq(editItem(dat, { text: "Dat is eem goet idee." }, "nl").rewrite, true, "two of five");
  const six = nl.items.find((one) => one.words?.length === 6 && one.words.every(([word]) => word.length >= 3));
  const [a, b] = [six.words[1][0], six.words[4][0]];
  const respelled = six.words.map(([word]) => (word === a ? `${a}x` : word === b ? `${b}x` : word)).join(" ") + (six.punct ?? "");
  eq(editItem(six, { text: respelled }, "nl").rewrite, false, `two of six: ${respelled}`);
});
test("written without spaces: a fix inside a word keeps it, its reading too; anything wider is a rewrite", () => {
  const sentence = ja.items.find((one) => one.words?.length >= 3 && one.words.some(([word]) => word.length >= 2) && isSentence(one));
  const was = itemSentence(sentence, "ja");
  const at = sentence.words.findIndex(([word]) => word.length >= 2);
  const before = sentence.words.slice(0, at).map(([word]) => word).join("").length;
  const fixed = `${was.slice(0, before)}ぁ${was.slice(before + 1)}`;
  const { item: next, rewrite } = editItem(sentence, { text: fixed }, "ja");
  eq(rewrite, false, was);
  eq(next.words.map(([word]) => word).join("") + (next.punct ?? ""), fixed);
  eq(next.words[at].slice(1), sentence.words[at].slice(1));
  const { rewrite: wider } = editItem(sentence, { text: "全然違う文章をここに書きます。" }, "ja");
  eq(wider, true);
});
test("a plain card: its text changes, and what it hides follows, nearest to where it was", () => {
  const card = { id: "c", text: "De kat zit op de mat.", cloze: { at: 3, answer: "kat" } };
  eq(editItem(card, { text: "Nu zit de kat op de mat." }, "nl").item.cloze, { at: 10, answer: "kat" });
  const twice = { id: "d", text: "kat en kat", cloze: { at: 7, answer: "kat" }, means: "m" };
  eq(editItem(twice, { text: "de kat en de kat" }, "nl").item.cloze.at, 13);
});
test("a plain card whose fill-in is gone from its text is refused in words", () => {
  const { problems } = editItem({ id: "c", text: "De kat zit.", cloze: { at: 3, answer: "kat" } }, { text: "De hond zit." }, "nl");
  ok(/hides “kat”/.test(problems[0]?.message), JSON.stringify(problems));
});
test("how it's said: changed, or cleared, only on a card that has it", () => {
  const card = { id: "c", text: "猫", means: "cat", reading: "ねこ" };
  eq(editItem(card, { reading: "にゃんこ" }, "ja").item.reading, "にゃんこ");
  ok(!("reading" in editItem(card, { reading: " " }, "ja").item), "cleared");
  eq(editItem(card, { text: "犬" }, "ja").rewrite, false, "a plain card has nothing to rewrite");
});
test("nothing written: refused in words", () => {
  ok(editItem(dat, { text: "  " }, "nl").problems.length, "no text");
  ok(editItem(dat, { means: " " }, "nl").problems.length, "no meaning");
  ok(!editItem({ id: "c", text: "x y", cloze: { at: 0, answer: "x" }, means: "m" }, { means: "" }, "nl").problems.length, "a cloze can do without");
});
test("a new item: a text and what it means, its id from the text, not one taken; written in any script", () => {
  const { item: one } = simpleItem({ text: " De hond. ", means: " The dog. " }, { language: "nl", taken: new Set(["de-hond"]) });
  eq(one, orderedItem({ id: "de-hond-2", text: "De hond.", means: "The dog." }));
  passes(nl, one);
  const { item: script } = simpleItem({ text: "猫", means: "cat" }, { language: "ja" });
  eq(script.id, "item");
  passes(ja, script);
  ok(simpleItem({ text: "x" }, { language: "nl" }).problems.length, "no meaning");
  ok(simpleItem({ means: "x" }, { language: "nl" }).problems.length, "no text");
});
test("what puts a change back holds only what it touched, and puts it back exactly, in its place", () => {
  const small = { ...nl, items: nl.items.slice(0, 5) };
  const [middle] = [small.items[2]];
  const changes = [
    { kind: "update", items: [{ ...middle, means: "Changed." }] },
    { kind: "remove", ids: [middle.id] },
    { kind: "add", items: [{ id: "new", text: "x", means: "y" }] },
  ];
  for (const change of changes) {
    const after = applyChange(small, change).pack;
    const inverse = inverseOf(small, change);
    ok(JSON.stringify(inverse).length < 2000, `${change.kind}: ${JSON.stringify(inverse).length} bytes`);
    eq(withInverse(after, inverse).items.map((one) => JSON.stringify(one)), small.items.map((one) => JSON.stringify(one)), change.kind);
  }
  eq(inverseOf(small, { kind: "update", items: [], dictionaries: {} }), null, "dictionaries change more than items");
  eq(inverseOf(small, { kind: "edit", name: "x" }), null);
  eq(inverseOf(null, { kind: "create", pack: small }), null);
});
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
