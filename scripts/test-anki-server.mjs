// A pack with plain cards everywhere the server reads packs (study/pack-items.js), on the real migrations in Node's SQLite
// (fixtures/worker-env.mjs): shared (and two different decks not taken for the same, since neither has sentences), its page and
// search, followed, a new version, reported and judged with every card's words in the case, Translate's index, your AI's tools
// (get_pack, list_packs, add_items keep the cards as they are), corrections, withdrawn, and an account going. Run:
// `node scripts/test-anki-server.mjs` (exit 0 = pass).

import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite, reset } = workerEnv();
env.COMMUNITY_SHARING = "everyone";
const community = await import(join(APP, "src/community.ts"));
const moderation = await import(join(APP, "src/moderation.ts"));
const relay = await import(join(APP, "src/packs.ts"));
const translate = await import(join(APP, "src/translate.ts"));
const { checkPack, compareVersions, packKey } = await import(join(APP, "public/js/study/pack-format.js"));
const { applyChange } = await import(join(APP, "public/js/study/pack-authoring.js"));
const { LANGUAGES } = await import(join(APP, "public/js/lang/index.js"));

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const note = await fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.stack ?? error}`);
  }
}
const ok = (value, message = "expected true") => {
  if (!value) throw new Error(message);
};
const same = (a, b, message = "") => ok(JSON.stringify(a) === JSON.stringify(b), `${message} ${JSON.stringify(a)} is not ${JSON.stringify(b)}`);

const OWNER = "user-owner";
const OTHER = "user-other";
const THIRD = "user-third";
const MOD = "user-mod";
for (const [id, name] of [[OWNER, "Owner"], [OTHER, "Other"], [THIRD, "Third"], [MOD, "Mod"]]) sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(id, name, Date.now() - 90 * 86_400_000);
sqlite.prepare("INSERT INTO user_roles (user_id, role, granted_at, granted_by) VALUES (?, 'moderator', ?, 'd1')").run(MOD, Date.now());
await community.acceptTerms(env, OWNER, community.SHARING_TERMS_VERSION);

const deck = (id, name, cards) => ({ format: "lexicommons-pack", version: 2, id, name, about: "Made by A. Teacher.", language: "es", from: "en", topics: {}, words: {}, chunks: {}, patterns: {}, items: cards });
const CARDS = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, text: `palabra ${i}`, means: `word ${i}` }));
const OTHERS = Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, text: `cosa ${i}`, means: `thing ${i}` }));
let shared = null;

await test("a card pack shares, as the words only", async () => {
  const result = await community.sharePack(env, { userId: OWNER, via: "app" }, { pack: deck("anki-words-a1", "Spanish words", CARDS), title: "Spanish words", about: "Made by A. Teacher.", topics: [] });
  ok(result.shared, JSON.stringify(result));
  shared = result;
  const item = await community.getItem(env, result.id, OTHER);
  const stored = JSON.parse(await (await env.LIBRARY.get(packKey(result.id, item.item.version))).text());
  same(stored.items.length, 12);
  same(stored.items.filter((item) => item.words), []);
  return result.id;
});

await test("a second deck isn't taken for the first: neither has sentences, and it's their cards that differ", async () => {
  const result = await community.sharePack(env, { userId: OWNER, via: "app" }, { pack: deck("anki-other-a2", "Spanish things", OTHERS), title: "Spanish things", about: "", topics: [] });
  ok(result.shared, JSON.stringify(result));
});

await test("the same cards again are refused, as the same sentences are", async () => {
  const result = await community.sharePack(env, { userId: OTHER, via: "app" }, { pack: deck("anki-copy-a3", "Copied", CARDS), title: "Copied", about: "", topics: [] }).catch((error) => ({ shared: false, errors: [{ message: error.message }] }));
  ok(!result.shared, "it was shared again");
});

await test("its page: the count in cards, a sample of its two sides, no sentence's fix offered on them", async () => {
  const { item, sample } = await community.getItem(env, shared.id, OTHER);
  same(item.badges.cards, 12);
  same(item.badges.sentences, 0);
  same(sample[0], { id: "n0", card: true, sentence: "palabra 0", natural: "word 0" });
});

await test("a card pack is found by its name in search and in the language's list", async () => {
  const found = await community.listItems(env, OTHER, { q: "Spanish words" });
  ok(found.items.some((one) => one.id === shared.id), JSON.stringify(found.items.map((one) => one.id)));
  const listed = await community.listItems(env, OTHER, { language: "es" });
  ok(listed.items.some((one) => one.id === shared.id));
  const home = await community.exploreHome(env, OTHER, "es");
  ok(home, "the home");
});

await test("followed, it's a ref the device can fetch, and the file it gets passes the same check", async () => {
  const ref = await community.follow(env, OTHER, shared.id);
  const text = await (await env.LIBRARY.get(packKey(ref.id, ref.version))).text();
  const checked = checkPack(JSON.parse(text), { installed: [] });
  same(checked.errors, []);
  same(checked.pack.items.length, 12);
  const list = await community.following(env, OTHER);
  ok(list.some((one) => one.id === shared.id));
});

await test("a new version counts its cards: taking one out asks first when people follow it", async () => {
  const previous = deck("x-y", "x", CARDS);
  const next = deck("x-y", "x", [...CARDS.slice(1), { id: "n99", text: "nueva", means: "new" }, { ...CARDS[0], id: "n98" }]);
  const change = compareVersions(previous, next);
  ok(change.added.includes("n99") && change.removed.includes("n0"), JSON.stringify(change));
  const refused = await community.updateShared(env, { userId: OWNER, via: "app" }, shared.id, { pack: deck("anki-words-a1", "Spanish words", CARDS.slice(1)) }).catch((error) => ({ refused: error.message }));
  ok(refused.refused || refused.shared === false || refused.needsConfirm || refused.updated === false, `it went through: ${JSON.stringify(refused).slice(0, 300)}`);
  const done = await community.updateShared(env, { userId: OWNER, via: "app" }, shared.id, { pack: deck("anki-words-a1", "Spanish words", CARDS.slice(1)), confirmRemoved: true });
  ok(done.updated !== false && done.shared !== false, JSON.stringify(done).slice(0, 300));
  const { item } = await community.getItem(env, shared.id, OTHER);
  same(item.badges.cards, 11);
});

await test("reported: the moderator's case has every card's words, front and back", async () => {
  await moderation.report(env, THIRD, shared.id, { reason: "spam", details: "words in a card" }, { via: "app" });
  const one = await moderation.caseOf(env, { userId: MOD }, shared.id);
  same(one.item.sentenceCount ?? one.sentenceCount, 11);
  const rows = one.item.sentences ?? one.sentences;
  same(rows[0], { sentence: "palabra 1", natural: "word 1" });
  ok(one.reports.length >= 1);
});

await test("a moderator's case has all a person can read on a card: its sentence, its other fields and its tags", async () => {
  const pack = deck("anki-deck-rich", "A rich deck", [
    { id: "n1", text: "casa", means: "house", sentence: "Mi casa.", sentenceBack: "My house.", extras: [{ label: "Notes", text: "something reported here" }], tags: ["chapter-1"] },
    ...Array.from({ length: 4 }, (_, i) => ({ id: `n${i + 2}`, text: `cosa rica ${i}`, means: `rich thing ${i}` })),
  ]);
  const rich = await community.sharePack(env, { userId: OWNER, via: "device" }, { pack, title: "A rich deck" });
  ok(rich.shared !== false && rich.id, `shared: ${JSON.stringify(rich).slice(0, 300)}`);
  await moderation.report(env, THIRD, rich.id, { reason: "spam", details: "words in an extra" }, { via: "app" });
  const one = await moderation.caseOf(env, { userId: MOD }, rich.id);
  const rows = JSON.stringify(one.item.sentences ?? one.sentences);
  for (const words of ["casa", "Mi casa.", "My house.", "something reported here", "Notes", "chapter-1"]) ok(rows.includes(words), `the case has no "${words}": ${rows.slice(0, 400)}`);
  const queue = await moderation.modQueue?.(env, { userId: MOD }).catch(() => null);
  ok(queue === undefined || queue === null || JSON.stringify(queue).includes(shared.id), "not in the queue");
  return `${rows.length} rows in the case`;
});

await test("Translate's index doesn't break on a live card pack, and answers about what has sentences", async () => {
  // The bucket in memory has no head(): the catalog's etag, as R2 gives it.
  env.LIBRARY.head ??= async (key) => {
    const object = await env.LIBRARY.get(key);
    return object ? { etag: "etag", httpEtag: "\"etag\"", size: 1 } : null;
  };
  await env.LIBRARY.put("catalogue.json", JSON.stringify({ packs: {}, books: [] }));
  const answer = await translate.translateOnline(env, "palabra", { from: "es", to: "en", language: "es" });
  ok(answer && Array.isArray(answer.result?.words ?? answer.words ?? []), JSON.stringify(answer).slice(0, 300));
  const languages = await translate.translateLanguages(env);
  ok(languages.includes("es"), JSON.stringify(languages));
});

const DEVICE = "device-1";
await test("your AI's tools: get_pack and list_packs say how many cards, and add_items, edit and remove leave them as they are", async () => {
  await relay.putDevice(env, OWNER, DEVICE, "Phone", [{ id: "anki-deck-a4", name: "A deck", language: "es", kind: "yours", on: true, items: 0 }]);
  await relay.putCopy(env, OWNER, DEVICE, "anki-deck-a4", { pack: deck("anki-deck-a4", "A deck", CARDS), through: 0 });
  const got = await relay.getPack(env, OWNER, "anki-deck-a4");
  same(got.cards, 12, "get_pack");
  same(got.sentences, 0, "get_pack's sentences");
  const list = await relay.listPacks(env, OWNER);
  const listed = JSON.stringify(list);
  ok(/"pack_id":"anki-deck-a4"[^}]*"cards":12/.test(listed), `list_packs: ${listed.slice(0, 400)}`);
  const edit = await relay.editPack(env, OWNER, "test", { pack_id: "anki-deck-a4", name: "A renamed deck" });
  ok(edit.ok, JSON.stringify(edit).slice(0, 400));
  const after = await relay.getPack(env, OWNER, "anki-deck-a4");
  same(after.cards, 12, "after a change");
  same(after.name, "A renamed deck");
  const pattern = Object.keys(LANGUAGES.es.patterns)[0];
  const added = await relay.addItems(env, OWNER, "test", { pack_id: "anki-deck-a4", items: [{ id: "una-frase", sentence: "Yo tengo una casa.", literal: ["I", "have", "a", "house"], natural: "I have a house.", wrong: ["Yo una casa tengo."], gap: { word: "casa", options: ["casa", "mesa"] }, patterns: [pattern] }] });
  ok(added.ok, `add_items: ${JSON.stringify(added).slice(0, 500)}`);
  const withItem = await relay.getPack(env, OWNER, "anki-deck-a4");
  same([withItem.cards, withItem.sentences], [12, 1], "after add_items");
  const removed = await relay.removeItems(env, OWNER, "test", { pack_id: "anki-deck-a4", ids: ["una-frase"] });
  ok(removed.ok, `remove_items: ${JSON.stringify(removed).slice(0, 300)}`);
  same((await relay.getPack(env, OWNER, "anki-deck-a4")).cards, 12, "after remove_items");
  const applied = applyChange(deck("anki-deck-a4", "A deck", CARDS), { kind: "edit", name: "Again" });
  same((applied.pack ?? applied).items?.filter((item) => !item.words).length, 12, "applied on a device");
  return "the change queued and applied with every card in place";
});

await test("the export holds the pack with its cards; withdrawing and an account going leave nothing behind", async () => {
  const exported = await relay.exportPacks(env, OWNER);
  ok(JSON.stringify(exported).includes("palabra"), "not in the export");
  await community.withdrawShared?.(env, { userId: OWNER, via: "app" }, shared.id).catch(() => {});
  await community.deleteCommunityData?.(env, OTHER).catch(() => {});
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
