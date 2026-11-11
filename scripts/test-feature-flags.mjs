#!/usr/bin/env node
// The site's switches (src/flags.ts, migration 0029) on the real migrations, D1 as SQLite (scripts/fixtures/worker-env.mjs). For every flag:
//   - a learner (and a moderator) can't read or set it; an admin can;
//   - the value in effect follows what the admin set, in the env every request runs on (withFlags), and so in what reads it (community.ts
//     sharingOpenFor, billing.ts planOffered, signin.ts's Apple), and back to the deploy's default on a reset;
//   - a switch that needs secrets refuses to turn on without them (nothing written, nothing logged), turns on with them, and a stored "on"
//     whose secrets went stays off;
//   - a wrong value or name refused; the value already in effect changing nothing and logging nothing;
//   - every change in the admin log: who, old → new, why.
// Then the isolate's copy: a write here is in effect at once; another isolate's write within FLAG_TTL; D1 failing keeps the last values for
// FLAG_STALE, then the deploy's (closed), asked once a FLAG_TTL; an admin's change on values D1 couldn't read fails, never "already that".
// `node scripts/test-feature-flags.mjs` (exit 0 = pass).

import assert from "node:assert/strict";
import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite, faults, rows } = workerEnv();
// The deploy as wrangler.jsonc has it at launch: sharing for admins, the plan and a key of your own off, no Stripe, no Apple.
Object.assign(env, { COMMUNITY_SHARING: "admins", SIGNUPS: "open", PLAN_ENABLED: "false", OWN_KEY_ENABLED: "false", PUBLIC_ORIGIN: "https://lexicommons.test" });
const flags = await import(join(APP, "src/flags.ts"));
const { sharingOpenFor } = await import(join(APP, "src/community.ts"));
const { planOffered } = await import(join(APP, "src/billing.ts"));
const STRIPE = { STRIPE_SECRET_KEY: "sk_test_FAKE", STRIPE_WEBHOOK_SECRET: "whsec_FAKE", STRIPE_PRICE_MONTHLY: "price_m", STRIPE_PRICE_YEARLY: "price_y" };
const APPLE = { APPLE_SERVICES_ID: "com.example.signin", APPLE_TEAM_ID: "TEAM123", APPLE_KEY_ID: "KEY123", APPLE_PRIVATE_KEY: "fake-p8-for-tests" };

let failed = 0;
async function test(name, fn) {
  try {
    const detail = await fn();
    console.log(`  ok    ${name}${detail ? ` (${detail})` : ""}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n").slice(0, 6).join("\n        ")}`);
  }
}
const now = Date.now();
function account(id, role = null) {
  sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(id, `Person ${id}`, now - 30 * 86_400_000);
  if (role) sqlite.prepare("INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (?, ?, ?, 'd1', 'test')").run(id, role, now);
  return id;
}
const ada = account("ada", "admin");
const lena = account("lena");
const mo = account("mo", "moderator");
const as = (userId) => ({ userId, via: "device" });
const log = () => rows("SELECT actor_id, action, target, before, after, note FROM admin_log WHERE action LIKE 'flag.%' ORDER BY created_at, rowid");
const stored = () => rows("SELECT name, value FROM feature_flags ORDER BY name");
const refuses = async (fn, pattern, status) =>
  assert.rejects(fn, (error) => {
    assert.ok(error instanceof flags.FlagError, `not a FlagError: ${error}`);
    assert.match(error.message, pattern);
    if (status) assert.equal(error.status, status);
    return true;
  });
/** The env a request runs on after a write in this isolate. */
const effective = () => flags.withFlags(env);
const viewOf = async (name) => (await flags.listFlags(env, ada)).find((f) => f.name === name);

await test("the switches, as an admin reads them: each with the deploy's default, nothing set, and what a switch needs", async () => {
  const list = await flags.listFlags(env, ada);
  assert.deepEqual(list.map((f) => f.name), ["COMMUNITY_SHARING", "PLAN_ENABLED", "OWN_KEY_ENABLED", "APPLE_SIGNIN", "SIGNUPS"]);
  const by = Object.fromEntries(list.map((f) => [f.name, f]));
  assert.deepEqual([by.SIGNUPS.value, by.SIGNUPS.default, by.SIGNUPS.values], ["open", "open", ["open", "paused"]]);
  assert.deepEqual([by.COMMUNITY_SHARING.value, by.COMMUNITY_SHARING.default, by.COMMUNITY_SHARING.values], ["admins", "admins", ["admins", "everyone"]]);
  assert.deepEqual([by.PLAN_ENABLED.value, by.OWN_KEY_ENABLED.value, by.APPLE_SIGNIN.value], [false, false, false]);
  assert.ok(list.every((f) => f.set === null), "something set already");
  // The page's line in plain words; the names and the doc apart, for its disclosure.
  assert.equal(by.PLAN_ENABLED.ready.missing, "Stripe's keys and prices aren't set");
  assert.equal(by.PLAN_ENABLED.ready.how, "Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY and STRIPE_PRICE_YEARLY (the prices as vars, the keys as the Worker's secrets), then deploy.");
  assert.equal(by.APPLE_SIGNIN.ready.missing, "Apple's ids and key aren't set");
  assert.equal(by.APPLE_SIGNIN.ready.how, "Set APPLE_SERVICES_ID, APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY from Apple's developer account (the key as the Worker's secret), then deploy.");
  assert.equal(by.OWN_KEY_ENABLED.ready, true);
  assert.equal(await effective(), env, "nothing stored, yet the env isn't the deploy's own");
});

await test("a learner and a moderator can neither read nor set any switch: refused in words, nothing written", async () => {
  for (const who of [lena, mo]) {
    await refuses(() => flags.listFlags(env, who), /Only an admin/, 403);
    for (const [name, value] of [["COMMUNITY_SHARING", "everyone"], ["PLAN_ENABLED", true], ["OWN_KEY_ENABLED", true], ["APPLE_SIGNIN", false], ["SIGNUPS", "paused"]]) {
      await refuses(() => flags.setFlag(env, as(who), name, value, "trying"), /Only an admin/, 403);
      await refuses(() => flags.resetFlag(env, as(who), name, "trying"), /Only an admin/, 403);
    }
  }
  assert.deepEqual(stored(), []);
  assert.deepEqual(log(), []);
});

await test("COMMUNITY_SHARING: an admin opens it to everyone and a learner may share at once; back to admins, and to the default", async () => {
  assert.equal(sharingOpenFor(await effective(), new Set()), false);
  const opened = await flags.setFlag(env, as(ada), "COMMUNITY_SHARING", "everyone", "launch week two");
  assert.equal(opened.value, "everyone");
  assert.equal(opened.set.value, "everyone");
  assert.ok(Math.abs(opened.set.at - Date.now()) < 5_000, "its set.at");
  const on = await effective();
  assert.equal(on.COMMUNITY_SHARING, "everyone");
  assert.equal(sharingOpenFor(on, new Set()), true, "a learner may share");
  assert.equal(on.DB, env.DB, "the bindings went with it");
  assert.equal(flags.deployEnv(on), env, "the deploy's env isn't kept under it");
  assert.equal((await flags.listFlags(on, ada)).find((f) => f.name === "COMMUNITY_SHARING").default, "admins", "the default read from the overlay, not the deploy");
  await flags.setFlag(env, as(ada), "COMMUNITY_SHARING", "admins", "too many at once");
  assert.equal(sharingOpenFor(await effective(), new Set()), false);
  assert.equal(sharingOpenFor(await effective(), new Set(["admin"])), true, "an admin still may");
  const back = await flags.resetFlag(env, as(ada), "COMMUNITY_SHARING", "the deploy decides again");
  assert.deepEqual([back.value, back.set], ["admins", null]);
  assert.deepEqual(stored(), []);
  assert.deepEqual(
    log().map((e) => [e.actor_id, e.action, e.target, e.before, e.after, e.note]),
    [
      [ada, "flag.set", "flag:COMMUNITY_SHARING", '"admins"', '"everyone"', "admins → everyone: launch week two"],
      [ada, "flag.set", "flag:COMMUNITY_SHARING", '"everyone"', '"admins"', "everyone → admins: too many at once"],
      [ada, "flag.reset", "flag:COMMUNITY_SHARING", '"admins"', '"admins"', "admins → admins (the site's default): the deploy decides again"],
    ],
  );
});

await test("PLAN_ENABLED: refused without Stripe's keys and prices (nothing written or logged), on with them, and a stored on stays off once they go", async () => {
  const before = log().length;
  await refuses(() => flags.setFlag(env, as(ada), "PLAN_ENABLED", true, "go"), /^The paid plan can't turn on: Stripe's keys and prices aren't set\. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY and STRIPE_PRICE_YEARLY \(the prices as vars/, 400);
  assert.deepEqual(stored(), []);
  assert.equal(log().length, before);
  assert.equal(planOffered(await effective()), false);
  Object.assign(env, STRIPE);
  try {
    assert.equal((await viewOf("PLAN_ENABLED")).ready, true);
    assert.equal(planOffered(await effective()), false, "on before anyone switched it");
    const on = await flags.setFlag(env, as(ada), "PLAN_ENABLED", true, "payments after launch");
    assert.equal(on.value, true);
    assert.equal(planOffered(await effective()), true, "planOffered doesn't follow the switch");
  } finally {
    for (const key of Object.keys(STRIPE)) delete env[key];
  }
  // The secrets gone (a copy without them, or a key taken away): what's stored is kept, but nothing turns on.
  const off = await viewOf("PLAN_ENABLED");
  assert.deepEqual([off.value, off.set?.value], [false, true]);
  assert.equal((await effective()).PLAN_ENABLED, "false");
  assert.equal(planOffered(await effective()), false);
  // Off while it's off for want of secrets is still a change: else the stored on would turn the plan on by itself once they're back.
  const offed = await flags.setFlag(env, as(ada), "PLAN_ENABLED", false, "not at launch after all");
  assert.equal(offed.set?.value, false);
  Object.assign(env, STRIPE);
  try {
    assert.equal(planOffered(await effective()), false, "the secrets back, and the plan on by itself");
  } finally {
    for (const key of Object.keys(STRIPE)) delete env[key];
  }
  await flags.resetFlag(env, as(ada), "PLAN_ENABLED", "test over");
});

await test("OWN_KEY_ENABLED: needs nothing; on and off for everyone, in the env every request reads", async () => {
  await flags.setFlag(env, as(ada), "OWN_KEY_ENABLED", true, "a learner asked");
  assert.equal((await effective()).OWN_KEY_ENABLED, "true");
  await flags.setFlag(env, as(ada), "OWN_KEY_ENABLED", false, "not yet");
  assert.equal((await effective()).OWN_KEY_ENABLED, "false");
  await flags.resetFlag(env, as(ada), "OWN_KEY_ENABLED", "test over");
  assert.equal((await effective()).OWN_KEY_ENABLED, "false");
});

await test("APPLE_SIGNIN: refused without Apple's ids and key; with them it's on by default, off takes its Services ID away, and back", async () => {
  await refuses(() => flags.setFlag(env, as(ada), "APPLE_SIGNIN", true, "go"), /^Sign in with Apple can't turn on: Apple's ids and key aren't set\. Set APPLE_SERVICES_ID, APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY from Apple's developer account/, 400);
  Object.assign(env, APPLE);
  try {
    const view = await viewOf("APPLE_SIGNIN");
    assert.deepEqual([view.value, view.default, view.ready], [true, true, true]);
    assert.equal((await effective()).APPLE_SERVICES_ID, APPLE.APPLE_SERVICES_ID);
    await flags.setFlag(env, as(ada), "APPLE_SIGNIN", false, "Apple's review pending");
    const off = await effective();
    assert.equal(off.APPLE_SERVICES_ID, "", "Apple still set up for sign-in");
    assert.equal(off.APPLE_PRIVATE_KEY, APPLE.APPLE_PRIVATE_KEY, "only its Services ID goes");
    await flags.setFlag(env, as(ada), "APPLE_SIGNIN", true, "approved");
    assert.equal((await effective()).APPLE_SERVICES_ID, APPLE.APPLE_SERVICES_ID);
    await flags.resetFlag(env, as(ada), "APPLE_SIGNIN", "test over");
  } finally {
    for (const key of Object.keys(APPLE)) delete env[key];
  }
});

await test("a wrong value or name is refused in words, and nothing is written", async () => {
  const before = [stored(), log().length];
  for (const [name, value, words] of [
    ["COMMUNITY_SHARING", "Everyone", /one of "admins", "everyone"/],
    ["SIGNUPS", "closed", /one of "open", "paused"/],
    ["SIGNUPS", true, /one of "open", "paused"/],
    ["COMMUNITY_SHARING", true, /one of "admins", "everyone"/],
    ["PLAN_ENABLED", "true", /a switch: true or false/],
    ["OWN_KEY_ENABLED", 1, /a switch: true or false/],
    ["OWN_KEY_ENABLED", null, /a switch: true or false/],
  ])
    await refuses(() => flags.setFlag(env, as(ada), name, value, "x"), words, 400);
  await refuses(() => flags.setFlag(env, as(ada), "GATE_ENABLED", false, "x"), /There's no switch "GATE_ENABLED"/, 404);
  await refuses(() => flags.resetFlag(env, as(ada), "constructor", "x"), /There's no switch/, 404);
  assert.deepEqual([stored(), log().length], before);
});

await test("the value already in effect changes nothing and logs nothing (a second tap); a reset with nothing set, the same", async () => {
  const before = log().length;
  const same = await flags.setFlag(env, as(ada), "COMMUNITY_SHARING", "admins", "tapped twice");
  assert.deepEqual([same.value, same.set], ["admins", null]);
  await flags.setFlag(env, as(ada), "OWN_KEY_ENABLED", true, "once");
  const twice = await flags.setFlag(env, as(ada), "OWN_KEY_ENABLED", true, "twice");
  assert.equal(twice.value, true);
  assert.equal(log().length, before + 1, "the second tap was logged");
  await flags.resetFlag(env, as(ada), "OWN_KEY_ENABLED", "test over");
  const nothing = await flags.resetFlag(env, as(ada), "OWN_KEY_ENABLED", "again");
  assert.equal(nothing.set, null);
  assert.equal(log().length, before + 2, "a reset of nothing was logged");
});

await test("another isolate's write reaches this one within FLAG_TTL; this isolate's own at once; D1 failing keeps the last values", async () => {
  const t0 = Date.now();
  assert.equal((await flags.withFlags(env, t0)).COMMUNITY_SHARING, "admins");
  // Another isolate's write: straight into D1, this isolate's copy untouched.
  sqlite.prepare("INSERT INTO feature_flags (name, value, updated_at) VALUES ('COMMUNITY_SHARING', '\"everyone\"', ?)").run(t0);
  assert.equal((await flags.withFlags(env, t0 + 1_000)).COMMUNITY_SHARING, "admins", "read again before its time");
  assert.equal((await flags.withFlags(env, t0 + flags.FLAG_TTL)).COMMUNITY_SHARING, "everyone", "not read again after FLAG_TTL");
  // D1 can't be read: the values last read stand (never the deploy's mid-change, never an error).
  faults.failing = /feature_flags/;
  try {
    assert.equal((await flags.withFlags(env, t0 + 3 * flags.FLAG_TTL)).COMMUNITY_SHARING, "everyone");
  } finally {
    faults.failing = null;
  }
  // A stored value no switch takes (a row from a later version, or written by hand) is ignored.
  sqlite.prepare("INSERT INTO feature_flags (name, value, updated_at) VALUES ('OWN_KEY_ENABLED', '\"yes\"', ?)").run(t0);
  flags.forgetFlags(env);
  assert.equal((await flags.withFlags(env)).OWN_KEY_ENABLED, "false");
  sqlite.prepare("DELETE FROM feature_flags").run();
  flags.forgetFlags(env);
  assert.equal(await flags.withFlags(env), env);
  return `FLAG_TTL ${flags.FLAG_TTL} ms`;
});

await test("an admin's change on switches D1 can't read fails, and says so: never \"already that\" with the stored value left as it was", async () => {
  // Sharing open, as the director might have it; D1's read of the switches failing (an overload) as it's closed (codex's F1, 7 Nov 2026).
  sqlite.prepare("INSERT INTO feature_flags (name, value, updated_at) VALUES ('COMMUNITY_SHARING', '\"everyone\"', ?)").run(Date.now());
  flags.forgetFlags(env);
  try {
    const before = log().length;
    faults.failing = /SELECT name, value, updated_at FROM feature_flags/;
    try {
      await assert.rejects(() => flags.setFlag(env, as(ada), "COMMUNITY_SHARING", "admins", "closing it"), "a change on values it couldn't read");
      await assert.rejects(() => flags.resetFlag(env, as(ada), "COMMUNITY_SHARING", "closing it"), "a reset on values it couldn't read");
      await assert.rejects(() => flags.listFlags(env, ada), "the list from values it couldn't read");
    } finally {
      faults.failing = null;
    }
    assert.equal(rows("SELECT value FROM feature_flags WHERE name = 'COMMUNITY_SHARING'")[0].value, '"everyone"', "still stored as it was");
    assert.equal(log().length, before, "nothing logged");
    // D1 back: the same change goes through, logged, and the answer is what was written.
    const closed = await flags.setFlag(env, as(ada), "COMMUNITY_SHARING", "admins", "closing it");
    assert.equal(closed.value, "admins");
    assert.equal(rows("SELECT value FROM feature_flags WHERE name = 'COMMUNITY_SHARING'")[0].value, '"admins"');
    assert.equal(log().length, before + 1);
  } finally {
    sqlite.prepare("DELETE FROM feature_flags").run();
    flags.forgetFlags(env);
  }
});

await test("an isolate whose reads of the switches fail keeps the last values FLAG_STALE at most, then the deploy's; D1 asked once a FLAG_TTL", async () => {
  let asked = 0;
  const db = new Proxy(env.DB, { get: (target, p) => (p === "prepare" ? (sql) => ((/FROM feature_flags/.test(sql) && asked++), target.prepare(sql)) : typeof target[p] === "function" ? target[p].bind(target) : target[p]) });
  const isolate = { ...env, DB: db };
  const t0 = Date.now();
  sqlite.prepare("INSERT INTO feature_flags (name, value, updated_at) VALUES ('COMMUNITY_SHARING', '\"everyone\"', ?)").run(t0);
  try {
    assert.equal((await flags.withFlags(isolate, t0)).COMMUNITY_SHARING, "everyone");
    faults.failing = /SELECT name, value, updated_at FROM feature_flags/;
    try {
      assert.equal((await flags.withFlags(isolate, t0 + flags.FLAG_TTL)).COMMUNITY_SHARING, "everyone", "the last values stand");
      const tried = asked;
      assert.equal((await flags.withFlags(isolate, t0 + flags.FLAG_TTL + 1_000)).COMMUNITY_SHARING, "everyone");
      assert.equal(asked, tried, "a failing D1 isn't asked again before FLAG_TTL");
      assert.equal((await flags.withFlags(isolate, t0 + flags.FLAG_STALE + 1)).COMMUNITY_SHARING, "admins", "past FLAG_STALE: the deploy's, closed");
    } finally {
      faults.failing = null;
    }
    assert.equal((await flags.withFlags(isolate, t0 + flags.FLAG_STALE + 1 + flags.FLAG_TTL)).COMMUNITY_SHARING, "everyone", "read again once D1 answers");
  } finally {
    sqlite.prepare("DELETE FROM feature_flags").run();
    flags.forgetFlags(isolate);
  }
  return `FLAG_STALE ${flags.FLAG_STALE} ms; ${asked} reads`;
});

// ---------- an admin's previews, on their own device ----------

const { planShown, planOffered: offered, previewing } = await import(join(APP, "src/offered.ts"));
const { sha256Hex } = await import(join(APP, "src/util.ts"));
/** A signed-in browser's request: its session cookie, and whatever lc_preview it carries. */
async function browser(userId) {
  const token = `tok-${userId}-${Math.random().toString(36).slice(2)}`;
  sqlite.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, 'test')").run(await sha256Hex(token), userId, now, now + 86_400_000);
  return (preview) => new Request("https://lexicommons.test/api/me", { headers: { Cookie: `lc_session=${token}${preview === undefined ? "" : `; lc_preview=${preview}`}` } });
}
const ALL = "COMMUNITY_SHARING,PLAN_ENABLED,OWN_KEY_ENABLED,APPLE_SIGNIN";

await test("a learner's preview cookie is ignored: their request runs on what everyone has, and so does one with no session at all", async () => {
  const lenaAt = await browser(lena);
  for (const request of [lenaAt(ALL), new Request("https://lexicommons.test/api/me", { headers: { Cookie: `lc_preview=${ALL}` } })]) {
    const base = await effective();
    const seen = await flags.withPreviews(base, request);
    assert.equal(seen, base, "the env changed for a learner");
    assert.deepEqual([seen.COMMUNITY_SHARING, seen.OWN_KEY_ENABLED, planShown(seen)], ["admins", "false", false]);
  }
});

await test("an admin's previews change their own request alone: sharing, the plan (shown, never offered), a key of their own; nothing stored or logged", async () => {
  const adaAt = await browser(ada);
  const before = [stored(), log().length];
  const base = await effective();
  const seen = await flags.withPreviews(base, adaAt(ALL));
  assert.deepEqual([seen.COMMUNITY_SHARING, seen.OWN_KEY_ENABLED], ["everyone", "true"]);
  assert.equal(planShown(seen), true, "the plan isn't shown to the admin previewing it");
  assert.equal(offered(seen), false, "the plan offered (Checkout open) without Stripe's keys");
  assert.equal(seen.APPLE_SERVICES_ID, base.APPLE_SERVICES_ID, "Apple previewed without its ids and key");
  assert.deepEqual([...previewing(seen)].sort(), ["COMMUNITY_SHARING", "OWN_KEY_ENABLED", "PLAN_ENABLED"], "previewing what can't be previewed here");
  assert.equal(seen.DB, env.DB, "the bindings went");
  assert.equal(flags.deployEnv(seen), env, "the deploy's env lost under it");
  // Everyone else, and the same admin without the cookie, the same moment: what everyone has.
  const lenaAt = await browser(lena);
  for (const request of [lenaAt(), adaAt(), adaAt("")]) {
    const other = await flags.withPreviews(await effective(), request);
    assert.deepEqual([other.COMMUNITY_SHARING, other.OWN_KEY_ENABLED, planShown(other)], ["admins", "false", false]);
  }
  assert.deepEqual([stored(), log().length], before, "a preview was stored or logged");
  // Only flags it knows, and an admin's session that has ended is no admin's.
  assert.equal(await flags.withPreviews(base, adaAt("GATE_ENABLED,constructor")), base);
  sqlite.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?").run(now - 1, ada);
  assert.equal(await flags.withPreviews(base, adaAt(ALL)), base, "an ended session's previews honored");
});

await test("Apple set up but off for everyone: an admin's preview brings it back for their own request, and only theirs", async () => {
  Object.assign(env, APPLE);
  try {
    await flags.setFlag(env, as(ada), "APPLE_SIGNIN", false, "not for everyone yet");
    const adaAt = await browser(ada);
    const lenaAt = await browser(lena);
    assert.equal((await effective()).APPLE_SERVICES_ID, "", "Apple on for everyone");
    const mine = await flags.withPreviews(await effective(), adaAt("APPLE_SIGNIN"));
    assert.equal(mine.APPLE_SERVICES_ID, APPLE.APPLE_SERVICES_ID, "the admin's preview didn't bring Apple back");
    assert.ok(previewing(mine).has("APPLE_SIGNIN"));
    assert.equal((await flags.withPreviews(await effective(), lenaAt("APPLE_SIGNIN"))).APPLE_SERVICES_ID, "", "a learner's cookie brought Apple back");
    await flags.resetFlag(env, as(ada), "APPLE_SIGNIN", "test over");
  } finally {
    for (const key of Object.keys(APPLE)) delete env[key];
  }
});

await test("the page's list and a preview's switch: an admin's only, plain words, nothing of the secrets' names or the docs", async () => {
  await refuses(() => flags.appFlags(env, lena, []), /Only an admin/, 403);
  await refuses(() => flags.setPreview(env, lena, "COMMUNITY_SHARING", true, []), /Only an admin/, 403);
  const list = await flags.appFlags(env, ada, ["PLAN_ENABLED"]);
  const by = Object.fromEntries(list.map((f) => [f.name, f]));
  assert.deepEqual(by.PLAN_ENABLED.preview, { on: true, can: true });
  assert.deepEqual(by.COMMUNITY_SHARING.preview, { on: false, can: true });
  assert.deepEqual(by.APPLE_SIGNIN.preview, { on: false, can: { missing: "Apple's ids and key aren't set" } });
  assert.equal(by.COMMUNITY_SHARING.value, "admins", "what everyone has");
  const text = JSON.stringify(list.map(({ name, ...rest }) => rest));
  assert.ok(!/STRIPE_|APPLE_SERVICES_ID|APPLE_PRIVATE_KEY|\.md|docs\//.test(text), `a secret's name or a doc on the page: ${text.match(/STRIPE_\w+|APPLE_\w+|[\w/.-]+\.md/)?.[0]}`);
  const on = await flags.setPreview(env, ada, "OWN_KEY_ENABLED", true, ["PLAN_ENABLED"]);
  assert.deepEqual(on.previews, ["PLAN_ENABLED", "OWN_KEY_ENABLED"]);
  assert.equal(on.flag.preview.on, true);
  const off = await flags.setPreview(env, ada, "PLAN_ENABLED", false, on.previews);
  assert.deepEqual(off.previews, ["OWN_KEY_ENABLED"]);
  await refuses(() => flags.setPreview(env, ada, "APPLE_SIGNIN", true, []), /^Sign in with Apple can't be previewed here: Apple's ids and key aren't set\.$/, 400);
  await refuses(() => flags.setPreview(env, ada, "OWN_KEY_ENABLED", "yes", []), /on is true or false/, 400);
  await refuses(() => flags.setPreview(env, ada, "GATE_ENABLED", true, []), /There's no switch/, 404);
  assert.deepEqual(stored(), [], "a preview stored");
});

// ---------- SIGNUPS: new accounts paused (launch day's SHED step 1) ----------

await test("SIGNUPS: an admin pauses new accounts and every request's env says so at once (signups.ts); open again, and back to the deploy's", async () => {
  const { signupsOpen } = await import(join(APP, "src/signups.ts"));
  assert.equal(signupsOpen(await effective()), true);
  await flags.setFlag(env, as(ada), "SIGNUPS", "paused", "D1 at SHED");
  assert.equal((await effective()).SIGNUPS, "paused");
  assert.equal(signupsOpen(await effective()), false, "paused, an account can still be made");
  await flags.setFlag(env, as(ada), "SIGNUPS", "open", "D1 calm");
  assert.equal(signupsOpen(await effective()), true);
  const back = await flags.resetFlag(env, as(ada), "SIGNUPS", "the deploy decides again");
  assert.equal(back.value, "open");
  assert.deepEqual(
    log().filter((r) => r.target === "flag:SIGNUPS").map((r) => r.note),
    ["open → paused: D1 at SHED", "paused → open: D1 calm", "open → open (the site's default): the deploy decides again"],
  );
  // The deploy's own value is the backstop: wrangler.jsonc's "paused" pauses with nothing stored.
  assert.equal(signupsOpen(await flags.withFlags({ ...env, SIGNUPS: "paused" })), false);
  // Not previewable (only someone signed out sees it): an admin's cookie asking for it changes nothing.
  const adaAt = await browser(ada);
  const base = await effective();
  assert.equal((await flags.withPreviews(base, adaAt("SIGNUPS"))).SIGNUPS, base.SIGNUPS);
});

await test("paused holds while D1 can't be read, past FLAG_STALE (holdWhileUnread); sharing beside it still falls back to the deploy's, and so does an open", async () => {
  const isolate = { ...env, DB: new Proxy(env.DB, { get: (target, p) => (typeof target[p] === "function" ? target[p].bind(target) : target[p]) }) };
  const t0 = Date.now();
  const put = (name, value) => sqlite.prepare("INSERT INTO feature_flags (name, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value").run(name, JSON.stringify(value), t0);
  put("SIGNUPS", "paused");
  put("COMMUNITY_SHARING", "everyone");
  try {
    const first = await flags.withFlags(isolate, t0);
    assert.deepEqual([first.SIGNUPS, first.COMMUNITY_SHARING], ["paused", "everyone"]);
    faults.failing = /SELECT name, value, updated_at FROM feature_flags/;
    try {
      const late = await flags.withFlags(isolate, t0 + flags.FLAG_STALE + flags.FLAG_TTL);
      assert.equal(late.COMMUNITY_SHARING, "admins", "the control: sharing past FLAG_STALE goes by the deploy's, closed");
      assert.equal(late.SIGNUPS, "paused", "paused fell back to open while D1 couldn't be read");
      const later = await flags.withFlags(isolate, t0 + 10 * flags.FLAG_STALE);
      assert.equal(later.SIGNUPS, "paused", "paused, still, much later");
    } finally {
      faults.failing = null;
    }
    flags.forgetFlags(isolate);
    put("SIGNUPS", "open");
    const t1 = t0 + 20 * flags.FLAG_STALE;
    assert.equal((await flags.withFlags(isolate, t1)).SIGNUPS, "open");
    faults.failing = /SELECT name, value, updated_at FROM feature_flags/;
    try {
      // An open stored falls back as every flag does: to the deploy's, here "paused" (the backstop set in wrangler.jsonc).
      const deployPaused = { ...isolate, SIGNUPS: "paused" };
      assert.equal((await flags.withFlags(deployPaused, t1)).SIGNUPS, "open");
      assert.equal((await flags.withFlags(deployPaused, t1 + flags.FLAG_STALE + flags.FLAG_TTL)).SIGNUPS, "paused", "an open stored outlived FLAG_STALE");
    } finally {
      faults.failing = null;
    }
  } finally {
    sqlite.prepare("DELETE FROM feature_flags").run();
    flags.forgetFlags(isolate);
  }
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
