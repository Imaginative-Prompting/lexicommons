#!/usr/bin/env node
// Corrections to a pack (public/js/study/pack-corrections.js): paths, a piece's value, a fix applied and checked (a fix
// that breaks the pack is refused with checkPack's reason), several at once, what a newer version supersedes, and the
// community overlay (the most-liked fix per piece, only while the pack stays good). Never changes the pack it's given.
//
//   node scripts/test-pack-corrections.mjs        (exit 0 = pass)

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkPack } from "../public/js/study/pack-format.js";
import { BUILT_IN } from "../public/js/packs/index.js";
import { canonicalPath, changedPieces, checkFix, communityOverlay, itemPath, parsePath, pieceOf, withFix, withFixes, wordPath } from "../public/js/study/pack-corrections.js";

const APP = join(dirname(new URL(import.meta.url).pathname), "..");
let passed = 0;
let failed = 0;
const check = (cond, name, detail) => {
  if (cond) passed++;
  else {
    failed++;
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`);
  }
};
const installed = BUILT_IN.filter((p) => p.language === "nl").map((p) => ({ ...p, builtIn: true }));
const pack = checkPack(JSON.parse(readFileSync(join(APP, "scripts/fixtures/packs/check-nl.json"), "utf8")), { installed }).pack;
const before = JSON.stringify(pack);
const item = (p, id) => p.items.find((i) => i.id === id);
const errorsOf = (r) => r.errors.map((e) => e.message).join(" | ");

// Paths.
check(JSON.stringify(parsePath("items/eet-smakelijk/means")) === JSON.stringify({ kind: "item", id: "eet-smakelijk", field: "means" }), "an item's field");
check(JSON.stringify(parsePath("items/eet-smakelijk/natural")) === JSON.stringify(parsePath("items/eet-smakelijk/means")) && JSON.stringify(parsePath("items/eet-smakelijk/nl")) === JSON.stringify(parsePath("items/eet-smakelijk/words")), "the names from before version 2, from an older copy of the app");
check(parsePath(wordPath("één ding"))?.lemma === "één ding", "a word's path round-trips its lemma (accents, a space)");
check(itemPath("x", "gap") === "items/x/gap", "itemPath");
for (const bad of ["items/x/id", "items/x", "words/", "other/x", "items/x/means/more", 5, null, `words/${"%".repeat(3)}`, `items/${"x".repeat(300)}/natural`]) check(parsePath(bad) === null, `not a piece: ${JSON.stringify(bad).slice(0, 40)}`);

// One spelling per piece.
check(canonicalPath("words/%6Fma") === "words/oma" && canonicalPath("words/oma") === "words/oma", "an encoded lemma is the same piece");
check(canonicalPath("items/x/means") === "items/x/means" && canonicalPath("items/x/id") === null, "an item's field as it is; not a piece: null");

// A piece's value.
check(pieceOf(pack, "items/eet-smakelijk/means") === "Enjoy your meal!", "a natural line");
check(JSON.stringify(pieceOf(pack, "items/eet-smakelijk/literal")) === JSON.stringify({ literal: [["Eat"], ["tastily"]], english: null }), "a literal line with its order");
check(pieceOf(pack, wordPath("oma")) === pack.words.oma, "a word's gloss");
check(pieceOf(pack, "items/nope/means") === undefined && pieceOf(pack, wordPath("nope")) === undefined, "no such piece");

// A fix that keeps the pack good.
const natural = checkFix(pack, "items/eet-smakelijk/means", "Bon appetit!", { installed });
check(natural.pack && item(natural.pack, "eet-smakelijk").means === "Bon appetit!", "a natural line fixed", natural.errors);
check(natural.pack && JSON.stringify(item(natural.pack, "balletje")) === JSON.stringify(item(pack, "balletje")), "the other sentences untouched");
check(natural.pack && natural.pack.items.map((i) => i.id).join() === pack.items.map((i) => i.id).join(), "every item keeps its id");
const gloss = checkFix(pack, wordPath("oma"), "grandma", { installed });
check(gloss.pack?.words.oma === "grandma", "a word's gloss fixed", gloss.errors);
const wrong = checkFix(pack, "items/eet-smakelijk/wrong", ["Smakelijk eet!", "Eet smakelijke!"], { installed });
check(wrong.pack && item(wrong.pack, "eet-smakelijk").wrong.length === 2, "the wrong versions fixed", wrong.errors);
const literal = checkFix(pack, "items/eet-smakelijk/literal", { literal: [["Eat"], ["deliciously"]], english: [0, 1] }, { installed });
check(literal.pack && item(literal.pack, "eet-smakelijk").literal[1][0] === "deliciously", "a literal line fixed", literal.errors);
const sentence = checkFix(pack, "items/eet-smakelijk/words", { words: [["Eet", "eten"], ["smakelijk", "smakelijk"]], punct: "." }, { installed });
check(sentence.pack && item(sentence.pack, "eet-smakelijk").punct === ".", "a sentence fixed (its punctuation)", sentence.errors);

// A fix that would break the pack: refused, with checkPack's reason.
check(!checkFix(pack, "items/eet-smakelijk/means", "", { installed }).pack, "an empty natural line");
const self = checkFix(pack, "items/eet-smakelijk/wrong", ["Eet smakelijk!"], { installed });
check(!self.pack && /the sentence itself/.test(errorsOf(self)), "a wrong version that's the sentence", self.errors);
const gap = checkFix(pack, "items/eet-smakelijk/gap", { index: 9, options: ["a", "b"] }, { installed });
check(!gap.pack && /gap.index/.test(errorsOf(gap)), "a gap past the sentence's end", gap.errors);
// A choice with a reading is the right shape; whether the language shows readings is checkPack's to say.
const read = checkFix(pack, "items/eet-smakelijk/gap", { index: 1, options: [{ text: "smakelijk", reading: "smakelijk" }, "lekker"] }, { installed });
check(!read.pack && /Dutch words don't carry a reading/.test(errorsOf(read)), "a reading on a Dutch choice", read.errors);
const order = checkFix(pack, "items/eet-smakelijk/literal", { literal: [["Eat"], ["tastily"]], english: [0, 0] }, { installed });
check(!order.pack && /english must list each/.test(errorsOf(order)), "a literal order that repeats a chunk", order.errors);
const moved = checkFix(pack, "items/eet-smakelijk/words", { words: [["Eet", "eten"], ["lekker"]], moved: ["smakelijk"] }, { installed });
check(!moved.pack, "a sentence whose moved word is gone", moved.errors);

// A fix of the wrong shape, or for a piece that isn't there: refused, never thrown.
for (const [path, value, why] of [
  ["items/eet-smakelijk/means", { toString: null }, "an object for a natural line"],
  ["items/eet-smakelijk/wrong", "one string", "a string for the wrong versions"],
  ["items/eet-smakelijk/gap", [1, 2], "a list for a gap"],
  ["items/eet-smakelijk/gap", { index: 1, options: [{ reading: "x" }, "lekker"] }, "a choice with no text"],
  ["items/eet-smakelijk/literal", { literal: "x", english: null }, "a string for a literal line"],
  ["items/eet-smakelijk/words", null, "nothing for a sentence"],
  ["items/nope/means", "x", "a sentence the pack doesn't have"],
  [wordPath("nope"), "x", "a word the pack doesn't have"],
  ["items/eet-smakelijk/id", "x", "a field that isn't a piece"],
]) {
  let result;
  try {
    result = checkFix(pack, path, value, { installed });
  } catch (error) {
    result = { pack: "threw", errors: [{ message: String(error) }] };
  }
  check(result.pack === null && result.errors.length === 1, `refused: ${why}`, result.errors);
}

// A sentence's optional fields of the wrong kind: refused, never thrown.
for (const [value, why] of [
  [{ words: [["Eet", "eten"], ["smakelijk", "smakelijk"]], punct: { toString: null } }, "punct that's an object"],
  [{ words: [["Eet", "eten"], ["smakelijk"]], moved: [{ toString: null }] }, "moved that holds an object"],
  [{ words: [["Eet", { toString: null }]] }, "a word that's an object"],
]) {
  let result;
  try {
    result = checkFix(pack, "items/eet-smakelijk/words", value, { installed });
  } catch (error) {
    result = { pack: "threw", errors: [{ message: String(error) }] };
  }
  check(result.pack === null && result.errors.length === 1, `refused: ${why}`, result.errors);
}

// Several at once.
const both = withFixes(pack, [{ path: "items/eet-smakelijk/means", value: "Bon appetit!" }, { path: wordPath("oma"), value: "grandma" }], { installed });
check(both.pack && item(both.pack, "eet-smakelijk").means === "Bon appetit!" && both.pack.words.oma === "grandma", "two pieces in one version", both.errors);
const twice = withFixes(pack, [{ path: "items/eet-smakelijk/means", value: "A" }, { path: "items/eet-smakelijk/means", value: "B" }], { installed });
check(!twice.pack && /Two fixes/.test(errorsOf(twice)), "two fixes for one piece are refused");
const aliased = withFixes(pack, [{ path: wordPath("oma"), value: "grandma" }, { path: "words/%6Fma", value: "granny" }], { installed });
check(!aliased.pack && /Two fixes for words\/oma/.test(errorsOf(aliased)), "two spellings of one piece are one piece", aliased.errors);
const current = item(pack, "eet-smakelijk");
const overlapping = withFixes(
  pack,
  [
    { path: "items/eet-smakelijk/words", value: { words: current.words, punct: current.punct, gap: { index: 0, options: ["Eet", "Drink"] } } },
    { path: "items/eet-smakelijk/gap", value: { index: 1, options: ["smakelijk", "lekker"] } },
  ],
  { installed },
);
check(!overlapping.pack && /doesn't come through alongside the others/.test(errorsOf(overlapping)), "a sentence's fix and a gap fix that undoes part of it", overlapping.errors);

// What a newer version supersedes.
const changed = changedPieces(pack, both.pack);
check(changed.has("items/eet-smakelijk/means") && changed.has(wordPath("oma")) && changed.size === 2, "the two pieces that changed, and no others", [...changed]);
const dropped = structuredClone(pack);
dropped.items = dropped.items.filter((i) => i.id !== "oma-gebeld");
check(changedPieces(pack, dropped).has("items/oma-gebeld/means"), "a sentence gone supersedes its pieces");

// The community overlay.
const fixes = [
  { id: "a", path: "items/eet-smakelijk/means", value: "Enjoy!", likes: 2, at: "2026-10-27T10:00:00Z" },
  { id: "b", path: "items/eet-smakelijk/means", value: "Bon appetit!", likes: 5, at: "2026-10-27T11:00:00Z" },
  { id: "c", path: wordPath("oma"), value: "grandma", likes: 1, at: "2026-10-27T09:00:00Z" },
  { id: "d", path: "items/balletje/wrong", value: [], likes: 9, at: "2026-10-27T09:00:00Z" },
];
const overlay = communityOverlay(pack, fixes, { installed });
check(item(overlay.pack, "eet-smakelijk").means === "Bon appetit!", "the most-liked fix for a piece");
check(overlay.pack.words.oma === "grandma", "every piece's best fix");
check(overlay.applied.sort().join() === "b,c", "a fix that would break the pack is left out", overlay.applied);
const tie = communityOverlay(pack, [{ ...fixes[0], likes: 5 }, fixes[1]], { installed });
check(item(tie.pack, "eet-smakelijk").means === "Enjoy!", "the oldest of equally liked fixes");

// Pure.
check(JSON.stringify(pack) === before, "the pack given is never changed");
check(withFix(pack, "items/eet-smakelijk/means", "x").pack !== pack, "a fix is a new pack");

console.log(`pack corrections: ${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
