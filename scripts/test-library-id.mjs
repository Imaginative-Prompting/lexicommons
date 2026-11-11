// A library pack's id is its own (src/library-admin.ts, community.ts): an admin publishing a default pack under an id a learner's shared pack
// already has is refused, so the learner never ends up owning the library's entry in Explore (6 Nov 2026, Codex C5); a free id goes (the
// control). On the real migrations, the library's bucket in memory. `node scripts/test-library-id.mjs` (exit 0 = pass).
import assert from "node:assert/strict";
import { workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite } = workerEnv();
Object.assign(env, { COMMUNITY_SHARING: "everyone", UPLOAD_SIGNING_SECRET: "local-check-only", PUBLIC_ORIGIN: "http://localhost:8787" });
for (const bucket of [env.LIBRARY, env.UPLOADS]) bucket.head ??= async (key) => (bucket.objects.has(key) ? { key } : null);
const community = await import("../src/community.ts");
const admin = await import("../src/library-admin.ts");
for (const id of ["learner", "admin-user"]) sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(id, id, Date.now() - 90 * 86_400_000);
sqlite.prepare("INSERT INTO user_roles (user_id, role, granted_at, granted_by) VALUES ('admin-user', 'admin', 0, 'd1')").run();
await community.acceptTerms(env, "learner", community.SHARING_TERMS_VERSION);
const sentence = (id, text, lemmas, means) => {
  const words = text.replace(/[.?!]$/, "").split(" ").map((word) => [word, lemmas[word] ?? word.toLowerCase()]);
  return { id, concepts: ["v2"], text, means, words, punct: ".", literal: text.split(" ").map((w) => [w]), english: null, moved: [], wrong: [`${text} nee`], gap: { index: words.length - 1, options: [words.at(-1)[0], "iets"] } };
};
const pack = (id, drink, en) => ({
  format: "lexicommons-pack", version: 2, id, name: `Drinks ${id}`, about: "For a check.", language: "nl", from: "en", topics: {}, chunks: {}, patterns: {},
  words: { ik: "I", drinken: "to drink", thee: "tea", [drink]: en },
  items: [sentence("thee", "Ik drink thee.", { Ik: "ik", drink: "drinken", thee: "thee" }, "I drink tea."), sentence(drink, `Ik drink ${drink}.`, { Ik: "ik", drink: "drinken", [drink]: drink }, `I drink ${en}.`)],
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
const said = (result) => result.problems.map((p) => p.message ?? p).join(" | ");
await test("a default pack under a learner's shared pack's id is refused", async () => {
  const shared = await community.sharePack(env, { userId: "learner", via: "app" }, { pack: pack("drinks-a", "melk", "milk"), title: "Drinks", about: "For a check.", topics: [] });
  assert.equal(shared.id, "drinks-a", JSON.stringify(shared).slice(0, 200));
  const check = await admin.checkPublish(env, "admin-user", { packValue: pack("drinks-a", "sap", "juice") });
  assert.match(said(check), /a learner's shared pack in Explore/);
});
await test("a default pack under an id of its own isn't refused for its id (the control)", async () => {
  const check = await admin.checkPublish(env, "admin-user", { packValue: pack("drinks-library", "water", "water") });
  assert.doesNotMatch(said(check), /a learner's shared pack/);
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
