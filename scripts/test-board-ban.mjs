// A request's author opening it again puts it back on Explore's board (src/board.ts closeRequest), so only someone who may post there now
// can (6 Nov 2026, Codex C13): a community-banned author can't, though closing or marking done stays open to them; an author with no ban
// can (the control). On the real migrations. `node scripts/test-board-ban.mjs` (exit 0 = pass).
import assert from "node:assert/strict";
import { workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite } = workerEnv();
env.COMMUNITY_SHARING = "everyone";
const community = await import("../src/community.ts");
const board = await import("../src/board.ts");
for (const id of ["author-ok", "author-banned"]) {
  sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(id, id, Date.now() - 90 * 86_400_000);
  await community.acceptTerms(env, id, community.SHARING_TERMS_VERSION);
}
const actor = (userId) => ({ userId, via: "app", adminAccess: false });
let failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
};
const state = (id) => sqlite.prepare("SELECT state FROM requests WHERE id = ?").get(id).state;
await test("a banned author can't open a closed request again; it stays closed", async () => {
  const posted = await board.postRequest(env, actor("author-banned"), { kind: "pack", language: "nl", title: "Words for cooking" });
  const id = posted.id ?? posted.request;
  assert.ok(id, JSON.stringify(posted));
  await board.closeRequest(env, actor("author-banned"), id, { state: "closed" });
  sqlite.prepare("INSERT INTO user_bans (id, user_id, scope, reason, by, created_at, until) VALUES ('ban1', 'author-banned', 'community', 'Spam.', 'mod', ?, NULL)").run(Date.now());
  await assert.rejects(() => board.closeRequest(env, actor("author-banned"), id, { state: "open" }), /can't (take part|share) in Explore/);
  assert.equal(state(id), "closed");
});
await test("an author with no ban opens theirs again (the control)", async () => {
  const posted = await board.postRequest(env, actor("author-ok"), { kind: "pack", language: "nl", title: "Words for travel" });
  const id = posted.id ?? posted.request;
  await board.closeRequest(env, actor("author-ok"), id, { state: "closed" });
  await board.closeRequest(env, actor("author-ok"), id, { state: "open" });
  assert.equal(state(id), "open");
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
