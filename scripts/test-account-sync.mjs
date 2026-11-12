// The account's own copy of a learner's progress and own packs (src/account-sync.ts) on the real migrations, R2 in memory: the files sync
// writes, kept for the account's own devices. Listing, reading and writing by name; a write over the version the device last saw, a clash
// when another got there first (nothing kept of the loser); only the kinds of progress and packs (a file per pack), never a recording's or a
// book's file; every refusal writing
// nothing (a name that isn't sync's, another account's tag is still only a name, too big, empty, too many files, the account's room);
// another account never sees or writes a file; the export with each file's text; deleting an account taking its rows and bytes and no
// one else's; the kinds here the ones the app syncs with it (public/js/sync.js ACCOUNT_KINDS). `node scripts/test-account-sync.mjs` (exit 0 = pass).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { workerEnv } from "./fixtures/worker-env.mjs";

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "cloudflare:workers") return { url: "data:text/javascript,export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }", shortCircuit: true };
    return next(specifier, context);
  },
});

const store = await import("../src/account-sync.ts");
const { deleteAccount } = await import("../src/accounts.ts");
const { LibraryError } = await import("../src/library.ts");
const { OverLimit } = await import("../src/moderation.ts");

let failed = 0;
let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.stack ?? error).split("\n").slice(0, 6).join("\n        ")}`);
  }
};

function fresh() {
  const world = workerEnv();
  const { env } = world;
  env.OAUTH_PROVIDER = { listUserGrants: async () => ({ items: [], cursor: undefined }) };
  env.PRACTICE = { getByName: () => ({ wipe: async () => {} }) };
  for (const id of ["u1", "u2"]) world.sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, 0)").run(id, `Person ${id}`);
  return world;
}
const name = (kind, shard = "", device = "0a0a0a0a", tag = "1b2c3d4e") => `lexicommons-${kind}${shard ? `.${shard}` : ""}.${tag}.${device}.json`;
const file = (records) => JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "progress", account: "1b2c3d4e", records });
const keysOf = (world) => [...world.env.UPLOADS.objects.keys()].filter((key) => key.startsWith("account-sync/"));
const rowsOf = (world, user) => world.sqlite.prepare("SELECT name, size, version FROM account_sync WHERE user_id = ? ORDER BY name").all(user);

await test("a file written, listed and read back: its name, its size, a version; one row, one object", async () => {
  const world = fresh();
  const text = file({ "2026-11-11T10:00:00.000Z#a": { at: 1, value: { concept: "w:koffie" } } });
  const first = await store.writeAccountSync(world.env, "u1", name("progress", "2026-11"), text, null);
  assert.match(first.version, /^[A-Za-z0-9_-]{8,}$/);
  assert.deepEqual(await store.listAccountSync(world.env, "u1"), [{ name: name("progress", "2026-11"), version: first.version, size: Buffer.byteLength(text) }]);
  assert.equal(await store.readAccountSync(world.env, "u1", name("progress", "2026-11")), text);
  assert.equal(keysOf(world).length, 1);
});

await test("written over the version last seen: the new text read back, the old bytes gone", async () => {
  const world = fresh();
  const n = name("streak");
  const first = await store.writeAccountSync(world.env, "u1", n, file({ a: { at: 1, value: 1 } }), null);
  const second = await store.writeAccountSync(world.env, "u1", n, file({ a: { at: 2, value: 2 } }), first.version);
  assert.notEqual(second.version, first.version);
  assert.match(await store.readAccountSync(world.env, "u1", n), /"value":2/);
  assert.equal(keysOf(world).length, 1, "the old version's bytes are still kept");
});

await test("a clash: a write that saw an older version, or none, is refused and keeps nothing; the one that got there first stands", async () => {
  const world = fresh();
  const n = name("path");
  const first = await store.writeAccountSync(world.env, "u1", n, file({ a: { at: 1, value: "first" } }), null);
  await assert.rejects(store.writeAccountSync(world.env, "u1", n, file({ a: { at: 2, value: "late" } }), null), store.SyncClash, "a write that saw no file");
  await assert.rejects(store.writeAccountSync(world.env, "u1", n, file({ a: { at: 2, value: "late" } }), "0000000000000000"), store.SyncClash, "a write that saw another version");
  assert.match(await store.readAccountSync(world.env, "u1", n), /first/);
  assert.equal(keysOf(world).length, 1, "a refused write's bytes were kept");
  assert.equal(rowsOf(world, "u1")[0].version, first.version);
  // The control: seeing the version that's there, it goes through.
  await store.writeAccountSync(world.env, "u1", n, file({ a: { at: 3, value: "third" } }), first.version);
  assert.match(await store.readAccountSync(world.env, "u1", n), /third/);
});

await test("progress and packs: each kind the app syncs here is taken, a pack's file by its id; a recording's, a book's and anything else's is refused with nothing written", async () => {
  const world = fresh();
  for (const kind of store.ACCOUNT_SYNC_KINDS) await store.writeAccountSync(world.env, "u1", name(kind), file({}), null);
  await store.writeAccountSync(world.env, "u1", name("packs", "trip-utrecht"), file({}), null);
  assert.equal(rowsOf(world, "u1").length, store.ACCOUNT_SYNC_KINDS.length + 1);
  // The app's own list (sync.js ACCOUNT_KINDS) is this one.
  const app = /export const ACCOUNT_KINDS = (\[[^\]]*\])/.exec(readFileSync(new URL("../public/js/sync.js", import.meta.url), "utf8"))?.[1];
  assert.deepEqual(JSON.parse(app ?? "null"), [...store.ACCOUNT_SYNC_KINDS], "the app syncs the kinds the server keeps");
  const before = keysOf(world).length;
  for (const bad of [name("pack-audio"), name("clip"), "lexicommons-clip.1b2c3d4e.0123456789abcdef.mp3", name("books"), name("texts"), "lexicommons-progress.json", "progress.1b2c3d4e.0a0a0a0a.json", "lexicommons-progress.1b2c3d4e.0a0a0a0a.json.exe", "../lexicommons-progress.1b2c3d4e.0a0a0a0a.json", name("progress", "", "ZZZZZZZZ"), `lexicommons-progress.${"a".repeat(200)}.1b2c3d4e.0a0a0a0a.json`, ""]) {
    await assert.rejects(store.writeAccountSync(world.env, "u1", bad, file({}), null), LibraryError, `kept: ${bad}`);
    assert.equal(await store.readAccountSync(world.env, "u1", bad), null, `read: ${bad}`);
  }
  assert.equal(keysOf(world).length, before, "a refused name left bytes behind");
});

await test("too big, empty: refused, nothing written", async () => {
  const world = fresh();
  await assert.rejects(store.writeAccountSync(world.env, "u1", name("progress"), "x".repeat(store.ACCOUNT_SYNC_LIMITS.fileBytes + 1), null), LibraryError);
  await assert.rejects(store.writeAccountSync(world.env, "u1", name("progress"), "", null), LibraryError);
  assert.equal(keysOf(world).length, 0);
  assert.equal(rowsOf(world, "u1").length, 0);
  // The control: at the limit, it's kept.
  await store.writeAccountSync(world.env, "u1", name("progress"), "x".repeat(store.ACCOUNT_SYNC_LIMITS.fileBytes), null);
  assert.equal(rowsOf(world, "u1").length, 1);
});

await test("an account's room: its files' count and their bytes together; past either, refused in words, nothing written, and a file it has can still be written", async () => {
  const world = fresh();
  const insert = world.sqlite.prepare("INSERT INTO account_sync (user_id, name, size, version, updated_at) VALUES (?, ?, ?, ?, 0)");
  for (let i = 0; i < store.ACCOUNT_SYNC_LIMITS.files; i++) insert.run("u1", name("progress", `2026-${String(i).padStart(3, "0")}`), 10, "v");
  await assert.rejects(store.writeAccountSync(world.env, "u1", name("streak"), file({}), null), OverLimit, "one file past the count");
  await store.writeAccountSync(world.env, "u1", name("progress", "2026-000"), file({}), "v");
  // Bytes: an account whose files are at their room.
  const full = fresh();
  full.sqlite.prepare("INSERT INTO account_sync (user_id, name, size, version, updated_at) VALUES ('u1', ?, ?, 'v', 0)").run(name("progress", "2025-01"), store.ACCOUNT_SYNC_LIMITS.bytes - 10);
  await assert.rejects(store.writeAccountSync(full.env, "u1", name("streak"), "x".repeat(11), null), OverLimit, "eleven bytes past the room");
  assert.equal(keysOf(full).length, 0, "a refused write's bytes were kept");
  await store.writeAccountSync(full.env, "u1", name("streak"), "x".repeat(10), null);
  // Another account's files don't count against this one.
  await store.writeAccountSync(full.env, "u2", name("streak"), "x".repeat(1000), null);
});

await test("another account never sees, reads or writes a file: the same name is each account's own", async () => {
  const world = fresh();
  const n = name("word-bank");
  const mine = await store.writeAccountSync(world.env, "u1", n, file({ koffie: { at: 1, value: {} } }), null);
  assert.deepEqual(await store.listAccountSync(world.env, "u2"), []);
  assert.equal(await store.readAccountSync(world.env, "u2", n), null);
  // u2 writing the same name writes its own: u1's stands, and u1's version means nothing to u2.
  await assert.rejects(store.writeAccountSync(world.env, "u2", n, file({ thee: { at: 1, value: {} } }), mine.version), store.SyncClash);
  await store.writeAccountSync(world.env, "u2", n, file({ thee: { at: 1, value: {} } }), null);
  assert.match(await store.readAccountSync(world.env, "u1", n), /koffie/);
  assert.match(await store.readAccountSync(world.env, "u2", n), /thee/);
});

await test("the export: every file of the account with its text, its packs' too, and no one else's", async () => {
  const world = fresh();
  await store.writeAccountSync(world.env, "u1", name("progress", "2026-11"), file({ a: { at: 1, value: 1 } }), null, 1234);
  await store.writeAccountSync(world.env, "u1", name("packs", "trip-utrecht"), file({ "trip-utrecht": { at: 1, value: { name: "Trip to Utrecht" } } }), null, 1235);
  await store.writeAccountSync(world.env, "u2", name("streak"), file({}), null);
  const out = await store.exportAccountSync(world.env, "u1");
  assert.deepEqual(out.map((f) => [f.name, f.updatedAt]), [[name("packs", "trip-utrecht"), 1235], [name("progress", "2026-11"), 1234]]);
  assert.match(out[0].text, /Trip to Utrecht/);
  assert.match(out[1].text, /"records"/);
});

await test("deleting the account takes its rows and its bytes at once, its packs' with them, and leaves another account's", async () => {
  const world = fresh();
  for (const kind of ["progress", "streak", "path"]) await store.writeAccountSync(world.env, "u1", name(kind), file({}), null);
  await store.writeAccountSync(world.env, "u1", name("packs", "trip-utrecht"), file({}), null);
  await store.writeAccountSync(world.env, "u2", name("streak"), file({}), null);
  await deleteAccount(world.env, "u1");
  assert.equal(rowsOf(world, "u1").length, 0);
  assert.deepEqual(keysOf(world).filter((key) => key.startsWith("account-sync/u1/")), []);
  assert.equal(rowsOf(world, "u2").length, 1);
  assert.equal(keysOf(world).length, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
