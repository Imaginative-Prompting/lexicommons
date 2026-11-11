// What a shared pack's versions keep (src/community.ts): a new version keeps the pack's languages, so Explore's listing, its followers and
// answered requests still mean the same pack (6 Nov 2026, Codex C11); a version's size, and the account's room, counted in the UTF-8 bytes
// its file takes in R2, never its UTF-16 length (Codex C12). On the real migrations, R2 in memory. Exit 0 = pass.
import assert from "node:assert/strict";
import { workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite } = workerEnv();
env.COMMUNITY_SHARING = "everyone";
const community = await import("../src/community.ts");
const OWNER = "user-owner";
sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(OWNER, OWNER, Date.now() - 90 * 86_400_000);
await community.acceptTerms(env, OWNER, community.SHARING_TERMS_VERSION);
const sentence = (id, text, lemmas, means) => {
  const words = text.replace(/[.?!]$/, "").split(" ").map((word) => [word, lemmas[word] ?? word.toLowerCase()]);
  return { id, concepts: ["v2"], text, means, words, punct: ".", literal: text.split(" ").map((w) => [w]), english: null, moved: [], wrong: [`${text} nee`], gap: { index: words.length - 1, options: [words.at(-1)[0], "iets"] } };
};
const MELK = sentence("melk", "Ik drink melk.", { Ik: "ik", drink: "drinken", melk: "melk" }, "I drink milk.");
const dutch = (id, about) => ({
  format: "lexicommons-pack", version: 2, id, name: `Café ${id}`, about, language: "nl", from: "en", topics: {}, chunks: {}, patterns: {},
  words: { ik: "I", drinken: "to drink", thee: "tea", koffie: "coffee — strong" },
  items: [sentence("thee", "Ik drink thee.", { Ik: "ik", drink: "drinken", thee: "thee" }, "I drink tea — always."), sentence("koffie", "Ik drink koffie.", { Ik: "ik", drink: "drinken", koffie: "koffie" }, "I drink coffee ✓.")],
});
let failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n").slice(0, 3).join("\n        ")}`);
  }
};
const share = async (pack) => {
  const shared = await community.sharePack(env, { userId: OWNER, via: "app" }, { pack, title: pack.name, about: pack.about, topics: [] });
  assert.ok(shared.id, JSON.stringify(shared).slice(0, 300));
  return shared.id;
};
await test("a version's size is its file's UTF-8 bytes in R2, and the account's room counts those", async () => {
  const id = await share(dutch("bytes-a", "Für Café-Gäste — überall ✓ ☕"));
  const row = sqlite.prepare("SELECT r2_key, bytes FROM item_versions WHERE item_id = ?").get(id);
  const stored = env.LIBRARY.objects.get(row.r2_key).bytes.byteLength;
  const text = new TextDecoder().decode(env.LIBRARY.objects.get(row.r2_key).bytes);
  assert.ok(stored > text.length, "the control: this pack's bytes are more than its length");
  assert.equal(row.bytes, stored);
});
await test("a new version in another language is refused, and Explore still lists the pack in its own", async () => {
  // Its own content (Explore refuses one it has): with milk.
  const base = dutch("lang-a", "Dutch, for a check.");
  base.items.push(MELK);
  base.words.melk = "milk";
  const id = await share(base);
  // A pack that's French in every way (its sentences under French's own "present" pattern), so only its language is wrong here.
  const fr = (id, text, lemmas, means) => ({ ...sentence(id, text, lemmas, means), concepts: ["present"] });
  const french = { ...dutch("lang-a", "Now French?"), language: "fr", words: { je: "I", boire: "to drink", "thé": "tea", "café": "coffee", lait: "milk" }, items: [fr("the", "Je bois thé.", { Je: "je", bois: "boire", "thé": "thé" }, "I drink tea."), fr("cafe", "Je bois café.", { Je: "je", bois: "boire", "café": "café" }, "I drink coffee."), fr("lait", "Je bois lait.", { Je: "je", bois: "boire", lait: "lait" }, "I drink milk.")] };
  const answer = await community.updateShared(env, { userId: OWNER, via: "app" }, id, { pack: french });
  assert.equal(answer.updated, false, JSON.stringify(answer).slice(0, 300));
  assert.match(answer.errors[0].message, /keeps the pack's languages/);
  assert.equal(sqlite.prepare("SELECT language FROM items WHERE id = ?").get(id).language, "nl");
  // The control: a new version in the same language goes.
  const next = await community.updateShared(env, { userId: OWNER, via: "app" }, id, { pack: { ...base, items: [...base.items, sentence("water", "Ik drink water.", { Ik: "ik", drink: "drinken", water: "water" }, "I drink water.")], words: { ...base.words, water: "water" } } });
  assert.equal(next.updated, true, JSON.stringify(next).slice(0, 300));
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
