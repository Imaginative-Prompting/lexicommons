// One kind of item (study/pack-format.js, study/pack-items.js): the smallest item and the fullest, what each is read as, and everything
// kept from before version 2 reading as version 2 without being checked again. Pure, so it runs in Node:
// `node scripts/test-items.mjs` (exit 0 = pass).

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildView, checkedProof, checkPack, compareVersions, itemSentence, PACK_VERSION, packVersion, proofHolds, upgradeChange, upgradePack } from "../public/js/study/pack-format.js";
import { gamesOf, isSentence, itemOthers, orderedItem, plainItems, sentencesOf, upgradeItem } from "../public/js/study/pack-items.js";
import { applyChange, sentenceProblems, storedItem } from "../public/js/study/pack-authoring.js";
import { parsePath, pieceOf, withFix } from "../public/js/study/pack-corrections.js";
import { BUILT_IN } from "../public/js/packs/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
let passed = 0;
let failed = 0;
const test = async (name, run) => {
  try {
    await run();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
};
const ok = (value, why) => {
  if (!value) throw new Error(why ?? "not so");
};
const eq = (got, want, why) => {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a !== b) throw new Error(`${why ? `${why}: ` : ""}${a} ≠ ${b}`);
};

const shell = (items, more = {}) => ({ format: "lexicommons-pack", version: PACK_VERSION, id: "bare", name: "Bare", language: "nl", from: "en", topics: {}, words: {}, chunks: {}, patterns: {}, items, ...more });
const SENTENCE = {
  id: "ga-je",
  concepts: ["v2"],
  words: [["Ga", "gaan"], ["je", "jij"], ["naar", "naar"], ["huis", "huis"]],
  punct: "?",
  literal: [["Go"], ["you"], ["home"]],
  english: null,
  moved: [],
  means: "Are you going home?",
  wrong: ["Je ga naar huis?"],
  gap: { index: 3, options: ["huis", "boom"] },
};
// As version 1 wrote the same sentence.
const OLD_SENTENCE = { id: "ga-je", patterns: ["v2"], nl: SENTENCE.words, punct: "?", literal: SENTENCE.literal, english: null, moved: [], natural: SENTENCE.means, wrong: SENTENCE.wrong, gap: SENTENCE.gap };
const oldPack = (more = {}) => ({ format: "lexicommons-pack", version: 1, id: "old", name: "Old", language: "nl", from: "en", topics: {}, words: { gaan: "to go", jij: "you", naar: "to", huis: "house" }, chunks: {}, patterns: {}, items: [OLD_SENTENCE], ...more });

await test("the smallest item: a text and what it means, with nothing else", () => {
  const { pack, errors, warnings } = checkPack(shell([{ id: "huis", text: "huis", means: "house" }]));
  eq(errors, []);
  eq(warnings, []);
  eq(pack.items, [{ id: "huis", text: "huis", means: "house" }]);
});

await test("only id, text and means are required, and only a cloze may skip means", () => {
  const refused = (item, part) => {
    const { pack, errors } = checkPack(shell([item]));
    ok(!pack && errors.some((e) => e.at.includes(part)), `${JSON.stringify(item)}: ${JSON.stringify(errors)}`);
  };
  refused({ text: "huis", means: "house" }, "id");
  refused({ id: "a", means: "house" }, "text");
  refused({ id: "a", text: "huis" }, "means");
  refused({ id: "a", text: "  ", means: "house" }, "text");
  eq(checkPack(shell([{ id: "c", text: "Het water is koud.", cloze: { at: 4, answer: "water" } }])).errors, []);
});

await test("a sentence's text is its words: given or not, it's kept, and one that says otherwise is refused", () => {
  const { pack, errors } = checkPack(shell([SENTENCE], { words: { gaan: "to go", jij: "you", naar: "to", huis: "house" } }));
  eq(errors, []);
  eq(pack.items[0].text, "Ga je naar huis?");
  eq(checkPack(pack).pack, pack, "checked again, the same");
  const stale = checkPack(shell([{ ...SENTENCE, text: "Ga je naar school?" }]));
  ok(!stale.pack && stale.errors.some((e) => e.at === "items[0].text"), JSON.stringify(stale.errors));
  const joined = checkPack({ ...shell([{ ...SENTENCE, id: "ja", concepts: [], chunks: undefined, words: [["私"], ["は"]], punct: "。", wrong: ["は私。"], gap: { index: 1, options: ["は", "が"] }, moved: [] }]), language: "ja" });
  eq(joined.pack?.items[0].text ?? joined.errors, "私は。", "joined as its language joins them");
});

await test("the fields a sentence's check still looks after, when they're there", () => {
  const without = (changes) => checkPack(shell([{ id: "a", text: "huis", means: "house", ...changes }]));
  ok(!without({ gap: { index: 0, options: ["a", "b"] } }).pack, "a gap with no words to be in");
  ok(!without({ punct: "." }).pack, "punct with no words to end");
  ok(!without({ english: [0] }).pack, "english with no literal line");
  ok(!without({ moved: ["huis"] }).pack, "moved with no words");
  ok(!without({ wrong: ["huis"] }).pack, "a wrong version that's the text");
  ok(without({ wrong: ["huizen"] }).pack, "a wrong version");
  ok(!without({ concepts: ["made-up"] }).pack, "a concept nobody has");
  ok(without({ concepts: ["v2"] }).pack, "a concept");
  ok(!without({ sentence: "Een huis." }).pack, "a sentence with no meaning");
});

await test("isSentence: all of what Study's games need, or it's a plain item", () => {
  const full = checkPack(shell([SENTENCE])).pack.items[0];
  ok(isSentence(full), "the whole sentence");
  for (const field of ["words", "means", "literal", "wrong", "gap"]) {
    const { [field]: _gone, ...rest } = full;
    ok(!isSentence(rest), `without ${field}`);
  }
  ok(!isSentence({ ...full, concepts: [] }), "with nothing it's an example of");
  ok(isSentence({ ...full, concepts: [], chunks: ["x"] }), "a phrase is something it's an example of");
  ok(!isSentence({ ...full, words: [["Hallo"]] }), "one word");
  ok(!isSentence({ id: "a", text: "huis", means: "house" }), "a bare word");
});

await test("the view: Study reads only sentences, and a pack's page knows how many of each", () => {
  const mixed = checkPack(shell([SENTENCE, { id: "huis", text: "huis", means: "house" }, { id: "boom", text: "boom", means: "tree" }])).pack;
  const view = buildView([mixed], "nl");
  eq(view.items.map((item) => item.id), ["bare/ga-je"]);
  eq([view.packs[0].items, view.packs[0].cards], [1, 2]);
  eq(sentencesOf(mixed).map((item) => item.id), ["ga-je"]);
  eq(plainItems(mixed).map((item) => item.id), ["huis", "boom"]);
  eq(buildView([checkPack(shell([SENTENCE])).pack], "nl").packs[0].cards, undefined, "no cards to speak of");
});

await test("a plain item plays only what it carries", () => {
  const items = ["a", "b", "c", "d"].map((id) => ({ id, text: `woord ${id}`, means: `word ${id}` }));
  const others = itemOthers(items);
  eq(gamesOf(items[0], { others: others(items[0]) }), ["card", "type", "match", "choose"]);
  eq(gamesOf({ id: "c", text: "Het water is koud.", cloze: { at: 4, answer: "water" } }, {}), ["fill"]);
});

await test("every pack here is at version 2, says its text, and reads back as itself", () => {
  const dir = join(HERE, "../packs");
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".json"))) {
    const pack = JSON.parse(readFileSync(join(dir, name), "utf8"));
    eq(pack.version, PACK_VERSION, name);
    ok(!("cards" in pack), `${name} has cards`);
    for (const item of pack.items) {
      // A pack that teaches a script (kana-ja) has only cards of a letter and how it's said; every other pack here, sentences.
      if (pack.teaches === "script") {
        ok(!isSentence(item) && typeof item.text === "string" && typeof item.means === "string", `${name}: ${item.id} isn't a letter's card`);
        for (const old of ["nl", "natural", "patterns"]) ok(!(old in item), `${name}: ${item.id} has ${old}`);
        continue;
      }
      ok(isSentence(item), `${name}: ${item.id} isn't a sentence`);
      eq(item.text, itemSentence({ words: item.words, punct: item.punct }, pack.language), `${name}: ${item.id}`);
      for (const old of ["nl", "natural", "patterns"]) ok(!(old in item), `${name}: ${item.id} has ${old}`);
    }
  }
  for (const pack of BUILT_IN) eq(pack.version, PACK_VERSION, pack.id);
});

await test("a pack from before: upgraded mechanically, and the check gives back exactly that", () => {
  const raw = oldPack();
  const upgraded = upgradePack(raw);
  eq(upgraded.version, PACK_VERSION);
  eq(upgraded.items[0].text, "Ga je naar huis?");
  eq(upgraded.items[0].means, SENTENCE.means);
  eq(upgraded.items[0].concepts, ["v2"]);
  eq(upgraded.items[0].words, SENTENCE.words);
  ok(!("nl" in upgraded.items[0]) && !("natural" in upgraded.items[0]) && !("patterns" in upgraded.items[0]), "the old names");
  const { pack, errors } = checkPack(raw);
  eq(errors, []);
  eq(pack, upgraded, "checked, the same");
  eq(upgradePack(pack), pack, "at version 2, left as it is");
  eq(upgradePack(null), null);
  eq(upgradePack("nothing"), "nothing");
  eq(upgradeItem(null, " "), null);
});

await test("an imported deck from before: its cards are items, with the ids their evidence points to", () => {
  const raw = oldPack({ items: [], cards: [{ id: "n1", front: "het huis", back: "the house", reading: "huis" }, { id: "n2", front: "Het water is koud.", cloze: { at: 4, answer: "water" } }] });
  const { pack, errors } = checkPack(raw);
  eq(errors, []);
  eq(pack.items, [{ id: "n1", text: "het huis", means: "the house", reading: "huis" }, { id: "n2", text: "Het water is koud.", cloze: { at: 4, answer: "water" } }]);
  ok(!("cards" in pack), "cards is gone");
  eq(plainItems(pack).length, 2);
  // A card and a sentence could share an id then; the sentence keeps it.
  const both = checkPack(oldPack({ cards: [{ id: "ga-je", front: "gaan", back: "to go" }] }));
  eq(both.errors, []);
  eq(both.pack.items.map((item) => item.id), ["ga-je", "card-ga-je"]);
});

await test("a stored pack from before keeps its proof: its version is the hash of what's stored, and it isn't checked again", async () => {
  const raw = checkPack(oldPack()).pack && oldPack();
  const version = await packVersion(raw);
  const proof = { checks: 6, rules: checkedProof(raw, version).rules, version };
  ok(proofHolds(proof, raw, version), "the proof holds on the bytes as they're stored");
  eq(await packVersion(raw), version);
  ok((await packVersion(upgradePack(raw))) !== version, "upgraded, it's other bytes: which is why they're the ones kept");
  ok(!proofHolds({ ...proof, checks: 2 }, raw, version), "an older proof doesn't");
});

await test("a version from before and the same version now aren't taken for a change", () => {
  const before = checkPack(oldPack()).pack;
  const now = upgradePack(oldPack());
  eq(compareVersions(before, now), { added: [], removed: [], changed: [], kept: ["ga-je"] });
  const fields = ["id", "concepts", "text", "means", "words", "punct", "literal", "english", "moved", "wrong", "gap"];
  eq(Object.keys(before.items[0]), fields, "one order");
  eq(Object.keys(orderedItem({ gap: 1, id: "a", text: "b" })), ["id", "text", "gap"]);
});

await test("a change queued before version 2 applies to a pack now", () => {
  const change = upgradeChange({ kind: "update", items: [OLD_SENTENCE] });
  eq(change.items[0].words, SENTENCE.words);
  ok(!("nl" in change.items[0]), "the old name");
  const { pack, problems } = applyChange(upgradePack(oldPack()), change);
  eq(problems, []);
  eq(checkPack(pack).errors, []);
  eq(checkPack(pack).pack.items[0].text, "Ga je naar huis?", "its text worked out by the check");
  const made = upgradeChange({ kind: "create", pack: oldPack() });
  eq(made.pack.version, PACK_VERSION);
  eq(upgradeChange({ kind: "remove", ids: ["a"] }), { kind: "remove", ids: ["a"] });
  eq(upgradeChange(null), null);
});

await test("your AI's form still writes whole sentences, says what's missing in its own words, and stores them as version 2", () => {
  const input = { sentence: "Ga je naar huis?", lemmas: { Ga: "gaan", je: "jij", naar: "naar", huis: "huis" }, literal: ["Go", "you", "home"], natural: SENTENCE.means, wrong: SENTENCE.wrong, gap: { word: "huis", options: ["huis", "boom"] }, patterns: ["v2"] };
  const { item, problems } = storedItem(input, { language: "nl" });
  eq(problems, []);
  eq(item.text, "Ga je naar huis?");
  eq(item.concepts, ["v2"]);
  eq(item.means, SENTENCE.means);
  ok(!("natural" in item) && !("patterns" in item), "the AI's names, stored");
  eq(sentenceProblems(input), []);
  eq(sentenceProblems({ sentence: "Ga je?" }).map((p) => p.at), ["literal", "natural", "wrong", "gap", "patterns"]);
});

await test("corrections: new names, the old ones still read, and a sentence's fix says its text again", () => {
  const pack = checkPack(shell([SENTENCE], { words: { gaan: "to go", jij: "you", naar: "to", huis: "house" } })).pack;
  eq(pieceOf(pack, "items/ga-je/means"), SENTENCE.means);
  eq(pieceOf(pack, "items/ga-je/natural"), SENTENCE.means, "as an older copy of the app names it");
  eq(pieceOf(pack, "items/ga-je/words").words, SENTENCE.words);
  eq(parsePath("items/ga-je/nl").field, "words");
  for (const value of [{ words: [["Ga", "gaan"], ["je", "jij"], ["maar", "naar"], ["huis", "huis"]] }, { nl: [["Ga", "gaan"], ["je", "jij"], ["maar", "naar"], ["huis", "huis"]] }]) {
    const fixed = withFix(pack, "items/ga-je/words", value);
    eq(fixed.error, null);
    const { pack: after, errors } = checkPack(fixed.pack);
    eq(errors, []);
    eq(after.items[0].text, "Ga je maar huis?");
  }
});

await test("a plain item's extras and tags: kept as text, in one order, every refusal in words; a sentence has its fields and no more", () => {
  const good = { id: "huis", text: "huis", means: "house", tags: ["noun", "place"], extras: [{ label: "Part of speech", text: "noun" }] };
  const { pack, errors } = checkPack(shell([good]));
  eq(errors, []);
  eq(Object.keys(pack.items[0]), ["id", "text", "means", "extras", "tags"]);
  eq(pack.items[0].extras[0].text, "noun");
  const at = (item) => checkPack(shell([{ id: "huis", text: "huis", means: "house", ...item }])).errors.map((e) => e.at);
  eq(at({ extras: "x" }), ["items[0].extras"]);
  eq(at({ extras: ["x"] }), ["items[0].extras[0]"]);
  eq(at({ extras: [{ label: "", text: "x" }] }), ["items[0].extras[0].label"]);
  eq(at({ extras: [{ label: "x" }] }), ["items[0].extras[0].text"]);
  eq(at({ extras: [{ label: "x", text: { toString: null } }] }).length, 1, "an object for text isn't coerced");
  eq(at({ extras: Array.from({ length: 13 }, () => ({ label: "x", text: "y" })) }), ["items[0].extras"]);
  eq(at({ tags: "x" }), ["items[0].tags"]);
  eq(at({ tags: [""] }), ["items[0].tags[0]"]);
  eq(at({ tags: ["x".repeat(41)] }), ["items[0].tags[0]"]);
  eq(at({ tags: Array.from({ length: 13 }, (_, i) => `t${i}`) }), ["items[0].tags"]);
  // None at all is as it was.
  eq(Object.keys(checkPack(shell([{ id: "huis", text: "huis", means: "house", extras: [], tags: [] }])).pack.items[0]), ["id", "text", "means"]);
});

console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
