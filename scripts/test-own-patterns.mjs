// A pack's own patterns among many authors (../docs/design/grammar-as-data/README.md, phase 3): your AI's new ones kept
// as "<pack id>.<id>" (pack-authoring.js ownPatternIds: a create, an add, an update and an edit; items and after
// following; the shared grammar's ids and a pack's bare ids from before left as they are; one taken out by its bare
// name), the pack format taking them (and a copy keeping them), practice cards naming them; then `same`: a pack's own
// pattern that's the shared grammar's (checked against it), its sentences counting for the shared one in the view, and
// its evidence and the shared one's one unit (progress.js aliases), split again when the alias goes. Runs in Node:
// `node scripts/test-own-patterns.mjs` (exit 0 = pass).

import { clearProgress, record, setUnitAliases, studiedUnits, unitEvidence, unitState, canonicalUnit } from "../public/js/study/progress.js";
import { buildView, checkPack, isPatternId } from "../public/js/study/pack-format.js";
import { ownPatternIds } from "../public/js/study/pack-authoring.js";
import { checkCard } from "../public/js/practice/protocol.js";
import { LANGUAGES } from "../public/js/lang/index.js";
import { BUILT_IN } from "../public/js/packs/index.js";

let failed = 0;
let passed = 0;
async function test(name, fn) {
  await clearProgress();
  try {
    await fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};
const eq = (a, b, what = "") => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what ? `${what}: ` : ""}expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
const catalogue = LANGUAGES.nl.patterns;
const starter = BUILT_IN[0];
const T0 = Date.UTC(2026, 10, 2, 9);
const row = (concept, at, extra = {}) => ({ concept, at, lang: "nl", outcome: "right", test: "recall", skill: "read", activity: "test", item: "t", ...extra });
// A pack of the starter's first sentence, an example of the pattern given, with patterns of its own.
const packWith = (id, pattern, patterns) => ({ ...structuredClone(starter), id, name: `Check ${id}`, patterns, items: [{ ...structuredClone(starter.items[0]), concepts: [pattern] }] });

await test("your AI's new pattern is the pack's: <pack>.<id>, on a create, with its items and what builds on it following", () => {
  const change = ownPatternIds(
    { kind: "create", pack: { id: "travel", patterns: { nadruk: { name: "n", about: "a", after: ["v2"] }, meer: { name: "m", about: "a", after: ["nadruk"] }, perfect: { name: "p", about: "x" } }, items: [{ id: "a", concepts: ["nadruk", "v2"] }] } },
    null,
    catalogue,
  );
  eq(Object.keys(change.pack.patterns), ["travel.nadruk", "travel.meer", "perfect"]);
  eq(change.pack.patterns["travel.meer"].after, ["travel.nadruk"]);
  eq(change.pack.patterns["travel.nadruk"].after, ["v2"]);
  eq(change.pack.items[0].concepts, ["travel.nadruk", "v2"]);
});

await test("on an add, an update and an edit: the pack's own by their bare names, its bare ones from before as they are", () => {
  const pack = { id: "travel", patterns: { "travel.nadruk": { name: "n", about: "a", after: [] }, oud: { name: "o", about: "a", after: [] } }, items: [] };
  const add = ownPatternIds({ kind: "add", items: [{ id: "b", concepts: ["nadruk", "oud", "v2", "nieuw"] }], dictionaries: { patterns: { nieuw: { name: "n", about: "a", after: ["nadruk", "oud"] } } } }, pack, catalogue);
  eq(add.items[0].concepts, ["travel.nadruk", "oud", "v2", "travel.nieuw"]);
  eq(add.dictionaries.patterns, { "travel.nieuw": { name: "n", about: "a", after: ["travel.nadruk", "oud"] } });
  const update = ownPatternIds({ kind: "update", items: [{ id: "c", concepts: ["nadruk"] }] }, pack, catalogue);
  eq(update.items[0].concepts, ["travel.nadruk"]);
  eq(ownPatternIds({ kind: "edit", dictionaries: { patterns: { nadruk: null } } }, pack, catalogue).dictionaries.patterns, { "travel.nadruk": null });
  eq(ownPatternIds({ kind: "edit", dictionaries: { patterns: { oud: null } } }, pack, catalogue).dictionaries.patterns, { oud: null });
  const remove = { kind: "remove", ids: ["a"] };
  eq(ownPatternIds(remove, pack, catalogue), remove);
});

await test("the pack format takes a pack's own <pack>.<id>, a copy keeps its ids, and a malformed one is refused", () => {
  ok(isPatternId("travel.nadruk") && isPatternId("v2") && !isPatternId("travel.") && !isPatternId(".x") && !isPatternId("a.b.c") && !isPatternId("Travel.x"), "isPatternId");
  const own = checkPack(packWith("travel", "travel.nadruk", { "travel.nadruk": { name: "Nadruk", about: "zelf after a word." } }));
  ok(own.pack && !own.warnings.length, JSON.stringify([own.errors, own.warnings]));
  // A copy (another id) keeps the ids it was made with, so its evidence and the original's are one.
  const copy = checkPack(packWith("travel-copy", "travel.nadruk", { "travel.nadruk": { name: "Nadruk", about: "zelf after a word." } }));
  ok(copy.pack, JSON.stringify(copy.errors));
  const bad = checkPack(packWith("travel", "travel..x", { "travel..x": { name: "x", about: "y" } }));
  ok(!bad.pack && bad.errors.some((e) => e.message.includes("isn't a pattern id")), JSON.stringify(bad.errors));
});

await test("a practice card may name a pack's own pattern; a malformed one is refused", () => {
  const card = { game: "match", patterns: ["travel.nadruk", "p:v2"], pairs: [["huis", "house"], ["boom", "tree"], ["kat", "cat"]] };
  eq(checkCard(card, "c1", "nl").item.concepts, ["travel.nadruk", "v2"]);
  let refused = null;
  try {
    checkCard({ ...card, patterns: ["Travel.x"] }, "c2", "nl");
  } catch (error) {
    refused = error.message;
  }
  ok(refused?.includes("isn't a pattern id"), String(refused));
});

await test("your AI's grade, and a question to it, may name a pack's own pattern", async () => {
  const { conceptId } = await import("../public/js/practice/protocol.js");
  eq(conceptId("p:travel.nadruk"), "p:travel.nadruk");
  let refused = null;
  try {
    conceptId("p:travel..x");
  } catch (error) {
    refused = error.message;
  }
  ok(refused?.includes("isn't a concept id"), String(refused));
  const { checkAbout } = await import("../public/js/ai/requests.js");
  eq(checkAbout({ language: "nl", unit: "p:travel.nadruk" }).unit, { id: "p:travel.nadruk", kind: "pattern" });
  eq(checkAbout({ language: "nl", unit: "p:v2" }).unit.name, "Verb second");
  let unknown = null;
  try {
    checkAbout({ language: "nl", unit: "p:nope" });
  } catch (error) {
    unknown = error.message;
  }
  ok(unknown?.includes('has no pattern "nope"'), String(unknown));
});

await test("same: a pack's own pattern that's the shared grammar's, checked against it", () => {
  const good = checkPack(packWith("travel", "travel.nadruk", { "travel.nadruk": { name: "Nadruk", about: "zelf after a word.", same: "perfect" } }));
  eq(good.pack?.patterns["travel.nadruk"].same, "perfect");
  const bad = checkPack(packWith("travel", "travel.nadruk", { "travel.nadruk": { name: "Nadruk", about: "zelf after a word.", same: "nope" } }));
  ok(!bad.pack && bad.errors.some((e) => e.message.includes('"nope" isn\'t a pattern of the language\'s shared grammar')), JSON.stringify(bad.errors));
});

await test("in the view: its sentences count for the shared one, it isn't offered beside it, and the aliases say so", () => {
  const { pack } = checkPack(packWith("travel", "travel.nadruk", { "travel.nadruk": { name: "Nadruk", about: "zelf after a word.", same: "perfect" } }));
  const view = buildView([{ ...starter, builtIn: true }, pack], "nl");
  const item = view.items.find((i) => i.pack === "travel");
  eq(item.concepts, ["perfect"]);
  ok(!("travel.nadruk" in view.patterns) && "perfect" in view.patterns, Object.keys(view.patterns).join(","));
  eq(view.aliases, { "travel.nadruk": "perfect" });
  // Without same, it's its own.
  const plain = buildView([{ ...starter, builtIn: true }, checkPack(packWith("travel", "travel.nadruk", { "travel.nadruk": { name: "Nadruk", about: "x" } })).pack], "nl");
  eq(plain.items.find((i) => i.pack === "travel").concepts, ["travel.nadruk"]);
  eq(plain.aliases, {});
});

await test("the evidence: a pack's own pattern and the shared one it's the same as are one unit, and split again when the alias goes", () => {
  record([row("p:travel.nadruk", T0), row("p:travel.nadruk", T0 + 3 * 86_400_000), row("p:perfect", T0 + 10 * 86_400_000)]);
  eq(unitState("p:perfect", { lang: "nl", now: T0 + 11 * 86_400_000 }).reviews, 1, "before");
  ok(setUnitAliases("nl", { "p:travel.nadruk": "p:perfect" }), "set");
  ok(!setUnitAliases("nl", { "p:travel.nadruk": "p:perfect" }), "the same aliases again changed something");
  eq(canonicalUnit("p:travel.nadruk", "nl"), "p:perfect");
  eq(unitState("p:perfect", { lang: "nl", now: T0 + 11 * 86_400_000 }).reviews, 3, "one unit");
  eq(unitEvidence("p:travel.nadruk", "nl").length, 3, "read by either name");
  ok(!studiedUnits("nl").includes("p:travel.nadruk") && studiedUnits("nl").includes("p:perfect"), studiedUnits("nl").join(","));
  // The rows keep what they were recorded as: the alias gone, they're two units again.
  setUnitAliases("nl", {});
  eq(unitState("p:perfect", { lang: "nl", now: T0 + 11 * 86_400_000 }).reviews, 1, "after");
  eq(unitState("p:travel.nadruk", { lang: "nl", now: T0 + 11 * 86_400_000 }).reviews, 2, "its own again");
  // Another language's aliases are its own.
  setUnitAliases("de", { "p:travel.nadruk": "p:perfect" });
  eq(canonicalUnit("p:travel.nadruk", "nl"), "p:travel.nadruk");
  setUnitAliases("de", {});
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
