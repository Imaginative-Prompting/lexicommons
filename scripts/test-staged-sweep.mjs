// The cron's sweep of staged files past their day (src/library-admin.ts sweepExpiredStaged), every account's, not only the one staging next
// (6 Nov 2026, Codex C8): their rows and R2 bytes go; a file still within its day stays (the control); a run takes at most its limit,
// oldest first. On the real migrations, R2 in memory. `node scripts/test-staged-sweep.mjs` (exit 0 = pass).
import assert from "node:assert/strict";
import { workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite } = workerEnv();
const admin = await import("../src/library-admin.ts");
const NOW = Date.now();
for (const id of ["gone-quiet", "active"]) sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, 0)").run(id, id);
const stage = async (id, user, expiresAt) => {
  const key = `staged/${user}/${id}`;
  await env.UPLOADS.put(key, `bytes of ${id}`);
  sqlite.prepare("INSERT INTO staged_files (id, user_id, name, content_type, size, sha256, status, r2_key, source, created_at, link_expires_at, expires_at) VALUES (?, ?, 'f', 'image/png', 9, ?, 'stored', ?, 'test', 0, 0, ?)").run(id, user, "b".repeat(64), key, expiresAt);
  return key;
};
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
await test("an account that never stages again: its expired files go, rows and bytes; one within its day stays", async () => {
  const old = await stage("s-old", "gone-quiet", NOW - 1000);
  const fresh = await stage("s-fresh", "active", NOW + 3_600_000);
  assert.equal(await admin.sweepExpiredStaged(env, NOW), 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM staged_files WHERE id = 's-old'").get().n, 0);
  assert.equal(env.UPLOADS.objects.has(old), false, "its bytes are still in R2");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM staged_files WHERE id = 's-fresh'").get().n, 1);
  assert.equal(env.UPLOADS.objects.has(fresh), true);
});
await test("a run takes at most its limit, oldest first, and the next takes the rest", async () => {
  for (let i = 0; i < 5; i++) await stage(`batch-${i}`, "gone-quiet", NOW - 10_000 + i);
  assert.equal(await admin.sweepExpiredStaged(env, NOW, 3), 3);
  assert.deepEqual(sqlite.prepare("SELECT id FROM staged_files WHERE id LIKE 'batch-%' ORDER BY id").all().map((r) => r.id), ["batch-3", "batch-4"]);
  assert.equal(await admin.sweepExpiredStaged(env, NOW, 3), 2);
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
