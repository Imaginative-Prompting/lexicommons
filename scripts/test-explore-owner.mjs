// Who may change a shared pack in Explore (src/community.ts ownedItem): its owner; and another account's only for an admin acting with
// admin access (a person in the app, an MCP sign-in, or a personal token made with admin access). An admin's personal token made WITHOUT
// admin access is the account's ordinary self, and changes nobody else's (6 Nov 2026, the Codex review S6). On the real migrations.
// `node scripts/test-explore-owner.mjs` (exit 0 = pass).
import assert from "node:assert/strict";
import { workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite } = workerEnv();
env.COMMUNITY_SHARING = "everyone";
const community = await import("../src/community.ts");
const { connectionReachesRoles } = await import("../src/roles.ts");

const OWNER = "user-owner";
const ADMIN = "user-admin";
const OTHER = "user-other";
const OWNER2 = "user-owner-2";
for (const id of [OWNER, ADMIN, OTHER, OWNER2]) sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(id, id, Date.now() - 90 * 86_400_000);
sqlite.prepare("INSERT INTO user_roles (user_id, role, granted_at, granted_by) VALUES (?, 'admin', 0, 'd1')").run(ADMIN);
// Everyone here has accepted the sharing terms, so what's refused is refused for whose pack it is, not for the terms.
for (const id of [OWNER, ADMIN, OTHER, OWNER2]) await community.acceptTerms(env, id, community.SHARING_TERMS_VERSION);

const sentence = (id, text, lemmas, means) => {
  const words = text.replace(/[.?!]$/, "").split(" ").map((word) => [word, lemmas[word] ?? word.toLowerCase()]);
  return { id, concepts: ["v2"], text, means, words, punct: ".", literal: text.split(" ").map((w) => [w]), english: null, moved: [], wrong: [`${text} nee`], gap: { index: words.length - 1, options: [words.at(-1)[0], "iets"] } };
};
// Each pack its own drink, so no two are the same content (Explore refuses a pack it already has).
const DRINKS = { "owner-pack-a": ["water", "water"], "owner-pack-b": ["melk", "milk"], "owner-pack-c": ["sap", "juice"], "owner-pack-d": ["bier", "beer"] };
const pack = (id) => {
  const [nl, en] = DRINKS[id];
  return {
    format: "lexicommons-pack", version: 2, id, name: `Pack ${id}`, about: "For a check.", language: "nl", from: "en", topics: {}, chunks: {}, patterns: {},
    words: { ik: "I", drinken: "to drink", thee: "tea", [nl]: en },
    items: [sentence("thee", "Ik drink thee.", { Ik: "ik", drink: "drinken", thee: "thee" }, "I drink tea."), sentence(nl, `Ik drink ${nl}.`, { Ik: "ik", drink: "drinken", [nl]: nl }, `I drink ${en}.`)],
  };
};
// An account shares a few a day at first (moderation.ts), so the packs here come from two owners.
const share = async (id, owner = OWNER) => {
  const shared = await community.sharePack(env, { userId: owner, via: "app" }, { pack: pack(id), title: `Pack ${id}`, about: "For a check.", topics: [] });
  assert.ok(shared.id, `shared: ${JSON.stringify(shared).slice(0, 300)}`);
  return shared.id;
};
const state = (id) => ({ ...sqlite.prepare("SELECT state, level FROM items WHERE id = ?").get(id) });

let failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n").slice(0, 4).join("\n        ")}`);
  }
};

// The connections as mcp-community.ts reads them (roles.ts connectionReachesRoles).
const plainToken = { userId: ADMIN, name: ADMIN, via: "pat", tokenName: "for an AI app", tokenAdmin: false };
const adminToken = { ...plainToken, tokenAdmin: true };
const signIn = { userId: ADMIN, name: ADMIN, via: "oauth" };

await test("an admin's token made without admin access can't withdraw or update another account's pack", async () => {
  const id = await share("owner-pack-a");
  assert.equal(connectionReachesRoles(plainToken), false);
  await assert.rejects(() => community.withdrawShared(env, { userId: ADMIN, adminAccess: connectionReachesRoles(plainToken) }, id), /isn't yours to change/);
  await assert.rejects(() => community.updateShared(env, { userId: ADMIN, via: "pat:for an AI app", adminAccess: connectionReachesRoles(plainToken) }, id, { level: "B2" }), /isn't yours to change/);
  assert.deepEqual(state(id), { state: "live", level: null });
  // Nor does leaving it out: no adminAccess is no override.
  await assert.rejects(() => community.withdrawShared(env, { userId: ADMIN }, id), /isn't yours to change/);
});
await test("with admin access (a token made with it, an MCP sign-in, the app itself) the admin can (the control)", async () => {
  const a = await share("owner-pack-b");
  await community.updateShared(env, { userId: ADMIN, via: "pat:admin", adminAccess: connectionReachesRoles(adminToken) }, a, { level: "B2" });
  assert.equal(state(a).level, "B2");
  await community.withdrawShared(env, { userId: ADMIN, adminAccess: connectionReachesRoles(signIn) }, a);
  assert.equal(state(a).state, "withdrawn");
  const b = await share("owner-pack-c", OWNER2);
  await community.withdrawShared(env, { userId: ADMIN, adminAccess: true }, b); // a person in the app (app.ts)
  assert.equal(state(b).state, "withdrawn");
});
await test("another account that isn't an admin can't, with admin access or without; the owner always can", async () => {
  const id = await share("owner-pack-d", OWNER2);
  await assert.rejects(() => community.withdrawShared(env, { userId: OTHER, adminAccess: true }, id), /isn't yours to change/);
  await community.withdrawShared(env, { userId: OWNER2 }, id);
  assert.equal(state(id).state, "withdrawn");
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
