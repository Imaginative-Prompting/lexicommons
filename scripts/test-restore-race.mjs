#!/usr/bin/env node
// A restore decides on the reports it read (src/moderation.ts modRestore, modRestoreShown; 6 Nov 2026, the Codex review's C14), on the real
// migrations with D1 as SQLite and another request let in between the restore's read and its write (worker-env.mjs faults.between):
//   - a pack hidden for spam, and an "illegal" report filed while an admin restores it: the restore writes nothing and says to look again,
//     the pack stays hidden, the new report stays as it was filed;
//   - the same for a hidden correction (modRestoreShown);
//   - a report acted on meanwhile (dismissed by another moderator) is also a change: look again;
//   - the controls: with nothing in between, the restore puts it back and dismisses the reports it read.
// `node scripts/test-restore-race.mjs` (exit 0 = pass).

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite, faults, reset } = workerEnv();
const moderation = await import("../src/moderation.ts");

const now = Date.now();
for (const id of ["owner", "reporter", "late-reporter", "admin-user"]) sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(id, id, now - 90 * 86_400_000);
sqlite.prepare("INSERT INTO user_roles (user_id, role, granted_at, granted_by) VALUES ('admin-user', 'admin', 0, 'd1')").run();
const ADMIN = { userId: "admin-user", via: "mcp" };
// The restore's read of what it restores, as the code before C14 made it and as it makes it now (with what it saw): the race goes in right
// after it either way, so the same test shows the code before failing.
const ITEM_READ = /^SELECT state\b[\s\S]* FROM items WHERE id = \?$/;
const CORRECTION_READ = /^SELECT shown\b[\s\S]* FROM corrections WHERE id = \?$/;
const columns = (table) => sqlite.prepare(`SELECT name, "notnull" AS required, dflt_value AS fallback FROM pragma_table_info('${table}')`).all();

/** A shared pack, hidden for spam: its row filled from the schema (every required column a plausible value), and its open report. */
function hiddenPack() {
  const id = `pack-${randomBytes(4).toString("hex")}`;
  const values = { id, owner_id: "owner", state: "hidden", state_reason: "spam", state_at: now - 60_000, created_at: now - 86_400_000, updated_at: now - 60_000 };
  for (const c of columns("items")) if (c.required && c.fallback === null && !(c.name in values)) values[c.name] = /_at$|count|likes|adds|size|bytes|sentences/.test(c.name) ? 0 : c.name === "kind" ? "pack" : c.name;
  const names = Object.keys(values);
  sqlite.prepare(`INSERT INTO items (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`).run(...names.map((n) => values[n]));
  return { id, spam: report("item", id, "spam", "open", "reporter") };
}
function hiddenCorrection() {
  const pack = hiddenPack();
  sqlite.prepare("UPDATE items SET state = 'live', state_reason = NULL WHERE id = ?").run(pack.id);
  const id = `cor-${randomBytes(4).toString("hex")}`;
  sqlite
    .prepare("INSERT INTO corrections (id, item_id, version, path, kind, note, author_id, shown, shown_reason, shown_at, created_at, updated_at) VALUES (?, ?, 'v1', 'words/thee', 'flag', 'x', 'owner', 'hidden', 'spam', ?, ?, ?)")
    .run(id, pack.id, now - 60_000, now - 3_600_000, now - 60_000);
  return { id, spam: report("correction", id, "spam", "open", "reporter") };
}
function report(kind, target, reason, state, reporter) {
  const id = `rep-${randomBytes(4).toString("hex")}`;
  sqlite.prepare("INSERT INTO reports (id, target_kind, target_id, reason, details, reporter_id, state, created_at) VALUES (?, ?, ?, ?, 'x', ?, ?, ?)").run(id, kind, target, reason, reporter, state, Date.now());
  return id;
}
const stateOf = (id) => sqlite.prepare("SELECT state FROM reports WHERE id = ?").get(id)?.state;
const itemState = (id) => sqlite.prepare("SELECT state FROM items WHERE id = ?").get(id)?.state;
const shownOf = (id) => sqlite.prepare("SELECT shown FROM corrections WHERE id = ?").get(id)?.shown;

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n").slice(0, 4).join("\n        ")}`);
  } finally {
    reset();
  }
}

await test("an illegal report filed while a pack is restored: the restore writes nothing, the pack stays hidden, the report stays", async () => {
  const pack = hiddenPack();
  let late;
  faults.between = { pattern: ITEM_READ, run: () => (late = report("item", pack.id, "illegal", "escalated", "late-reporter")) };
  await assert.rejects(() => moderation.modRestore(env, ADMIN, pack.id, "It isn't spam."), /look again/);
  assert.ok(late, "the report wasn't filed in between: the race wasn't made");
  assert.equal(itemState(pack.id), "hidden", "the pack was put back");
  assert.equal(stateOf(late), "escalated", "the report filed meanwhile was dismissed");
  assert.equal(stateOf(pack.spam), "open", "the report it read was dismissed though nothing was restored");
});

await test("a report acted on meanwhile (another moderator dismissed it) is a change too: look again", async () => {
  const pack = hiddenPack();
  const other = report("item", pack.id, "abuse", "open", "late-reporter");
  faults.between = { pattern: ITEM_READ, run: () => sqlite.prepare("UPDATE reports SET state = 'dismissed' WHERE id = ?").run(other) };
  await assert.rejects(() => moderation.modRestore(env, ADMIN, pack.id, "It isn't spam."), /look again/);
  assert.equal(itemState(pack.id), "hidden");
});

await test("the control: with nothing in between, the pack is restored and the reports it read are dismissed", async () => {
  const pack = hiddenPack();
  const result = await moderation.modRestore(env, ADMIN, pack.id, "It isn't spam.");
  assert.equal(result.state, "live");
  assert.equal(itemState(pack.id), "live");
  assert.equal(stateOf(pack.spam), "dismissed");
});

await test("a hidden correction: an illegal report filed while it's restored leaves it hidden and the report as filed", async () => {
  const c = hiddenCorrection();
  let late;
  faults.between = { pattern: CORRECTION_READ, run: () => (late = report("correction", c.id, "illegal", "escalated", "late-reporter")) };
  await assert.rejects(() => moderation.modRestoreCorrection(env, ADMIN, c.id, "It's a fair flag."), /look again/);
  assert.ok(late, "the report wasn't filed in between: the race wasn't made");
  assert.equal(shownOf(c.id), "hidden");
  assert.equal(stateOf(late), "escalated");
});

await test("the control: a hidden correction with nothing in between is shown again, its report dismissed", async () => {
  const c = hiddenCorrection();
  await moderation.modRestoreCorrection(env, ADMIN, c.id, "It's a fair flag.");
  assert.equal(shownOf(c.id), "visible");
  assert.equal(stateOf(c.spam), "dismissed");
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
