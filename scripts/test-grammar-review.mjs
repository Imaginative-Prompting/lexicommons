#!/usr/bin/env node
// An admin's review of grammar suggestions against what happens while it publishes (src/grammar-suggestions.ts reviewSuggestions; 6 Nov
// 2026, the Codex review's C15), on the real migrations with D1 as SQLite, the library's bucket in memory (etags and versions, as R2's) and
// another request let in at the moment that matters (worker-env.mjs faults.between):
//   - a suggestion hidden (a report came in) after the review claimed it and before the catalog is written: nothing is published, the
//     grammar stays as it was, and the suggestion is left open and hidden;
//   - a fix to the same pattern made against the new revision, in the moment after it's written: it stays open, never superseded;
//   - the controls: with nothing in between the review publishes the next revision, and an older open fix to the pattern is superseded.
// `node scripts/test-grammar-review.mjs` (exit 0 = pass).

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite, faults, reset } = workerEnv();
env.COMMUNITY_SHARING = "everyone";
const { reviewSuggestions, suggestPattern } = await import(join(APP, "src/grammar-suggestions.ts"));

const now = Date.now();
const WEEK = 8 * 86_400_000;
function account(id, { admin = false } = {}) {
  sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(id, `Person ${id}`, now - WEEK);
  sqlite.prepare("INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (?, 1, ?)").run(id, now);
  if (admin) sqlite.prepare("INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (?, 'admin', ?, 'd1', 'test')").run(id, now);
  return id;
}
const bo = account("bo");
const admin = account("admin-1", { admin: true });
const app = (userId) => ({ userId, via: "device", ai: false });
const ADMIN = { userId: admin, via: "mcp", caller: { userId: admin, via: "oauth", tokenAdmin: false } };

// A fix to "want" from an account of its own (one open suggestion per account and pattern), its explanation new each time, so every one
// changes the pattern.
let n = 0;
const fix = async () => {
  n++;
  const who = account(`suggester-${n}`);
  const made = await suggestPattern(env, app(who), { language: "nl", kind: "fix", pattern: "want", about: `Willen says you want something, take ${n}: ik wil thee (I want tea).`, knows: "native" });
  assert.ok(made.suggested, JSON.stringify(made).slice(0, 300));
  return made.suggestion;
};
const catalogue = async () => JSON.parse((await (await env.LIBRARY.get("catalogue.json"))?.text()) ?? "{}");
const grammarRevision = async () => (await catalogue()).grammar?.nl?.revision ?? 1;
const suggestion = (id) => sqlite.prepare("SELECT state, shown, claim, against FROM grammar_suggestions WHERE id = ?").get(id);
// What a hide does to a suggestion a review has claimed (moderation.ts modHideShown with GRAMMAR_LETS_GO), as another request would.
const hide = (id) =>
  sqlite
    .prepare(
      "UPDATE grammar_suggestions SET shown = 'hidden', shown_reason = 'A report came in.', shown_at = ?, state = CASE WHEN state = 'accepting' THEN 'open' ELSE state END, claim = CASE WHEN state = 'accepting' THEN NULL ELSE claim END, claimed_at = CASE WHEN state = 'accepting' THEN NULL ELSE claimed_at END, revision = CASE WHEN state = 'accepting' THEN NULL ELSE revision END WHERE id = ?",
    )
    .run(Date.now(), id);
// A fix made in the moment between the new revision's write and the review's last batch: a row as suggestPattern writes one, against it.
function freshFix(against) {
  const id = `gs-${randomBytes(4).toString("hex")}`;
  const values = { id, language: "nl", kind: "fix", pattern: "want", change: JSON.stringify({ about: "Willen, just made: ik wil water (I want water)." }), author_id: bo, against, state: "open", shown: "visible", knows: "native", via: "app", created_at: Date.now(), updated_at: Date.now() };
  for (const c of sqlite.prepare("SELECT name, \"notnull\" AS required, dflt_value AS fallback FROM pragma_table_info('grammar_suggestions')").all()) {
    if (c.required && c.fallback === null && !(c.name in values)) values[c.name] = /_at$|likes|count/.test(c.name) ? 0 : "x";
  }
  const names = Object.keys(values);
  sqlite.prepare(`INSERT INTO grammar_suggestions (${names.join(", ")}) VALUES (${names.map(() => "?").join(", ")})`).run(...names.map((k) => values[k]));
  return id;
}

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

await test("the control: with nothing in between, the review publishes the next revision and supersedes an older fix to the pattern", async () => {
  const before = await grammarRevision();
  const mine = await fix();
  const older = await fix();
  const done = await reviewSuggestions(env, ADMIN, { language: "nl", accept: [mine.id] });
  assert.equal(done.published !== false, true, `not published: ${JSON.stringify(done.problems ?? done).slice(0, 300)}`);
  assert.equal(await grammarRevision(), before + 1, "no new revision on the catalog");
  assert.deepEqual(done.accepted, [mine.id]);
  assert.equal(suggestion(older.id).state, "superseded", "an older fix to the pattern stayed open");
});

await test("a suggestion hidden after it was claimed and before the catalog is written: nothing published, left open and hidden", async () => {
  const before = await grammarRevision();
  const mine = await fix();
  faults.between = { pattern: /SET state = 'accepting'/, run: () => hide(mine.id) };
  const done = await reviewSuggestions(env, ADMIN, { language: "nl", accept: [mine.id] });
  assert.equal(faults.between, null, "the hide never came in between: the race wasn't made");
  assert.equal(await grammarRevision(), before, "the hidden suggestion's revision was published");
  assert.equal(done.published, false, `the review says it published: ${JSON.stringify(done).slice(0, 300)}`);
  assert.match((done.problems ?? []).join(" "), /hidden while this was being published/);
  const row = suggestion(mine.id);
  assert.equal(row.shown, "hidden");
  assert.equal(row.state, "open", `its state: ${row.state}`);
  assert.equal(row.claim, null);
});

await test("a fix made against the new revision in the moment after it's written stays open, never superseded", async () => {
  const before = await grammarRevision();
  const mine = await fix();
  let fresh;
  faults.between = { pattern: /INSERT INTO library_revisions/, run: () => (fresh = freshFix(before + 1)) };
  const done = await reviewSuggestions(env, ADMIN, { language: "nl", accept: [mine.id] });
  assert.ok(fresh, "the fresh fix never came in between: the race wasn't made");
  assert.equal(await grammarRevision(), before + 1, `not published: ${JSON.stringify(done.problems ?? done).slice(0, 300)}`);
  assert.equal(suggestion(fresh).state, "open", "a fix made against the new revision was superseded");
  assert.ok(!done.superseded.includes(fresh), "it's listed as superseded");
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
