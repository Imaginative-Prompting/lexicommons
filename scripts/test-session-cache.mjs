// The session cache (src/sessions.ts sessionOf { cached }, forgetSession, forgetUser; app.ts CACHED_SESSION_ROUTES), on the real migrations.
// Translate's routes, which read only public packs, may answer from a session this isolate's D1 lookup found in the last SESSION_CACHE_MS:
// no D1 statement, no SESSION_LIMITER count, no slide. Every other route reads D1 every time. An entry ends at SESSION_CACHE_MS or when its
// session does; a cookie that found nothing is never kept; sign-out and account deletion drop theirs; the cache holds SESSION_CACHE_MAX at
// most, the oldest out first. Each rule refuses a planted wrong one first. Exit 0 = pass.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite } = workerEnv();
const real = await import("../src/sessions.ts");
const { SESSION_COOKIE, SESSION_CACHE_MS, SESSION_CACHE_MAX, sessionCacheSize } = real;
const { sha256Hex } = await import("../src/util.ts");
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const DAY = 86_400_000;
const NOW = Date.now();
sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES ('u1', 'Someone', 0), ('u2', 'Someone else', 0)").run();
let n = 0;
/** A new session in D1 (its own cookie, so tests never share an entry) and a request carrying it. */
const session = async (user = "u1", daysLeft = 80) => {
  const token = `tok-${++n}-${Math.random().toString(36).slice(2)}`;
  sqlite.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, 'test')").run(await sha256Hex(token), user, NOW - DAY, NOW + daysLeft * DAY);
  return { token, request: () => new Request("http://localhost/api/translate", { method: "POST", headers: { Cookie: `${SESSION_COOKIE}=${token}` } }) };
};
const endSession = async (token) => sqlite.prepare("DELETE FROM sessions WHERE token_hash = ?").run(await sha256Hex(token));
/** An env whose D1 counts the statements that touch sessions, and whose SESSION_LIMITER counts its calls. */
const counting = () => {
  const tally = { sessions: 0, limiter: 0 };
  const DB = new Proxy(env.DB, { get: (t, p) => (p === "prepare" ? (sql) => (/\bsessions\b/.test(sql) && tally.sessions++, t.prepare(sql)) : typeof t[p] === "function" ? t[p].bind(t) : t[p]) });
  return { tally, env: { ...env, DB, SESSION_LIMITER: { limit: async () => (tally.limiter++, { success: true }) } } };
};

let failed = 0;
const test = async (name, fn) => {
  try {
    const detail = await fn();
    console.log(`  ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n").slice(0, 4).join("\n        ")}`);
  }
};
const refuses = async (rule, plant, what) => {
  let threw = false;
  try {
    await rule(plant);
  } catch {
    threw = true;
  }
  assert(threw, `the rule passed a planted ${what}`);
};

// Each rule takes the module's three calls, so a planted one can stand in.
const hitRule = async (m) => {
  const s = await session();
  const c = counting();
  const first = await m.sessionOf(s.request(), c.env, { extend: true, now: NOW });
  assert.equal(first?.user.id, "u1");
  assert.deepEqual(c.tally, { sessions: 1, limiter: 1 }, `the first lookup: ${JSON.stringify(c.tally)}`);
  for (let i = 1; i <= 5; i++) {
    const again = await m.sessionOf(s.request(), c.env, { extend: true, now: NOW + i * 300, cached: true });
    assert.equal(again?.user.id, "u1");
    assert.equal(again.renew, null, "a cached answer slid the session");
  }
  assert.deepEqual(c.tally, { sessions: 1, limiter: 1 }, `five cached lookups cost ${JSON.stringify(c.tally)}`);
};
const everyOtherRule = async (m) => {
  const s = await session();
  const c = counting();
  for (let i = 0; i < 4; i++) assert.equal((await m.sessionOf(s.request(), c.env, { extend: true, now: NOW + i * 300 }))?.user.id, "u1");
  assert.equal(c.tally.sessions, 4, `four lookups without cached read D1 ${c.tally.sessions} times`);
};
const expiryRule = async (m) => {
  const s = await session();
  const c = counting();
  await m.sessionOf(s.request(), c.env, { extend: true, now: NOW });
  await m.sessionOf(s.request(), c.env, { extend: true, now: NOW + SESSION_CACHE_MS - 1, cached: true });
  assert.equal(c.tally.sessions, 1, "inside SESSION_CACHE_MS it read D1");
  await m.sessionOf(s.request(), c.env, { extend: true, now: NOW + SESSION_CACHE_MS, cached: true });
  assert.equal(c.tally.sessions, 2, "at SESSION_CACHE_MS it didn't read D1 again");
  // And a session that ended in D1 meanwhile is no one once its entry is that old.
  await endSession(s.token);
  assert.equal(await m.sessionOf(s.request(), c.env, { extend: true, now: NOW + 2 * SESSION_CACHE_MS + 1, cached: true }), null);
};
const signOutRule = async (m) => {
  const s = await session();
  const c = counting();
  await m.sessionOf(s.request(), c.env, { extend: true, now: NOW });
  await endSession(s.token);
  await m.forgetSession(s.token);
  assert.equal(await m.sessionOf(s.request(), c.env, { extend: true, now: NOW + 1, cached: true }), null, "a signed-out cookie was answered from the cache");
};

await test("a session D1 found answers Translate's lookups from the cache: no statement, no SESSION_LIMITER count, never slid", async () => {
  await refuses(hitRule, { ...real, sessionOf: (r, e, o) => real.sessionOf(r, e, { ...o, cached: false }) }, "lookup that never uses the cache");
  await hitRule(real);
  return "1 statement for 6 lookups";
});
await test("every lookup without cached (every other route: writes, sign-in, the account) reads D1, even just after", async () => {
  await refuses(everyOtherRule, { ...real, sessionOf: (r, e, o) => real.sessionOf(r, e, { ...o, cached: true }) }, "lookup that always uses the cache");
  await everyOtherRule(real);
});
await test(`an entry is used for SESSION_CACHE_MS (${SESSION_CACHE_MS} ms) at most, then D1 is read again`, async () => {
  await refuses(expiryRule, { ...real, sessionOf: (r, e, o) => real.sessionOf(r, e, { ...o, now: o.cached ? NOW : o.now }) }, "cache that compares against the time it was filled");
  await expiryRule(real);
});
const endRule = async (m) => {
  // A session that ends 10 s after the lookup that keeps it: 15 s on, well inside SESSION_CACHE_MS, the cache isn't used and D1 says no one.
  const token = `tok-end-${++n}`;
  sqlite.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, 'u1', ?, ?, 'test')").run(await sha256Hex(token), NOW - DAY, NOW + 10_000);
  const request = () => new Request("http://localhost/api/translate", { method: "POST", headers: { Cookie: `${SESSION_COOKIE}=${token}` } });
  const c = counting();
  assert.equal((await m.sessionOf(request(), c.env, { extend: false, now: NOW }))?.user.id, "u1");
  assert.equal(await m.sessionOf(request(), c.env, { extend: true, now: NOW + 15_000, cached: true }), null, "an ended session answered from the cache");
  assert.equal(c.tally.sessions, 2);
};
await test("an entry is never used past its session's end, however new", async () => {
  assert(15_000 < SESSION_CACHE_MS, "the case needs SESSION_CACHE_MS past 15 s");
  // The plant: a cache that forgets the session's own end (the entry looked up as if its end were far off).
  await refuses(endRule, { ...real, sessionOf: (r, e, o) => real.sessionOf(r, e, { ...o, now: o.cached ? NOW + 1 : o.now }) }, "cache that ignores the session's end");
  await endRule(real);
});
await test("a cookie that found no session is never kept: each lookup reads D1, and a session made since is found at once", async () => {
  const c = counting();
  const made = new Request("http://localhost/api/translate", { method: "POST", headers: { Cookie: `${SESSION_COOKIE}=made-up-${Math.random()}` } });
  for (let i = 0; i < 3; i++) assert.equal(await real.sessionOf(made, c.env, { extend: true, now: NOW, cached: true }), null);
  assert.equal(c.tally.sessions, 3, "a made-up cookie's answer was kept");
  const token = made.headers.get("Cookie").split("=")[1];
  sqlite.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, 'u2', ?, ?, 'test')").run(await sha256Hex(token), NOW, NOW + 80 * DAY);
  assert.equal((await real.sessionOf(made, c.env, { extend: true, now: NOW + 1, cached: true }))?.user.id, "u2", "a new sign-in waited for a kept no");
});
await test("signing out drops the session's entry in this isolate: its cookie is no one at once", async () => {
  await refuses(signOutRule, { ...real, forgetSession: async () => {} }, "sign-out that keeps the entry");
  await signOutRule(real);
});
await test("deleting an account drops every entry of its sessions, and no one else's", async () => {
  const a = await session("u2"), b = await session("u2"), other = await session("u1");
  const c = counting();
  for (const s of [a, b, other]) await real.sessionOf(s.request(), c.env, { extend: true, now: NOW });
  real.forgetUser("u2");
  const before = c.tally.sessions;
  await real.sessionOf(a.request(), c.env, { extend: true, now: NOW + 1, cached: true });
  await real.sessionOf(b.request(), c.env, { extend: true, now: NOW + 1, cached: true });
  assert.equal(c.tally.sessions, before + 2, "a deleted account's session was answered from the cache");
  await real.sessionOf(other.request(), c.env, { extend: true, now: NOW + 1, cached: true });
  assert.equal(c.tally.sessions, before + 2, "someone else's entry went too");
});
await test(`the cache holds SESSION_CACHE_MAX (${SESSION_CACHE_MAX}) at most, the oldest out first`, async () => {
  const c = counting();
  const first = await session();
  await real.sessionOf(first.request(), c.env, { extend: false, now: NOW });
  let last;
  for (let i = 0; i < SESSION_CACHE_MAX + 5; i++) {
    last = await session();
    await real.sessionOf(last.request(), c.env, { extend: false, now: NOW });
  }
  assert.equal(sessionCacheSize(), SESSION_CACHE_MAX);
  const before = c.tally.sessions;
  await real.sessionOf(last.request(), c.env, { extend: true, now: NOW + 1, cached: true });
  assert.equal(c.tally.sessions, before, "the newest was gone");
  await real.sessionOf(first.request(), c.env, { extend: true, now: NOW + 1, cached: true });
  assert.equal(c.tally.sessions, before + 1, "the oldest was still kept");
});
await test("keyed by the cookie's sha256: nothing of the cookie itself is kept", () => {
  const source = readFileSync(join(APP, "src/sessions.ts"), "utf8");
  const sets = [...source.matchAll(/recent\.set\(([^,]+),/g)].map((m) => m[1].trim());
  assert.deepEqual(sets, ["hash"], `what keys the cache: ${sets}`);
  assert.match(source, /const hash = await sha256Hex\(token\);/);
});
// Which routes may answer from it: exactly Translate's, and the /api/* middleware is the one caller that asks.
const routesRule = (src) => {
  const list = /CACHED_SESSION_ROUTES = new Set\(\[([^\]]*)\]\)/.exec(src)?.[1];
  assert(list, "app.ts has no CACHED_SESSION_ROUTES");
  const routes = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(routes, ["GET /api/translate/languages", "POST /api/translate", "POST /api/translate/find"], `the list: ${routes}`);
  assert.match(src, /const cached = CACHED_SESSION_ROUTES\.has\(`\$\{c\.req\.method\} \$\{c\.req\.path\}`\);/);
  assert.equal((src.match(/sessionOf\([^)]*\bcached\b/g) ?? []).length, 1, "something else in app.ts asks sessionOf for the cache");
};
await test("only Translate's three routes may answer from it (app.ts CACHED_SESSION_ROUTES, by method and exact path)", async () => {
  const app = readFileSync(join(APP, "src/app.ts"), "utf8");
  await refuses(routesRule, app.replace('"POST /api/translate"]', '"POST /api/translate", "PUT /api/packs/device"]'), "list with a write route");
  await refuses(routesRule, app.replace("CACHED_SESSION_ROUTES.has(`${c.req.method} ${c.req.path}`)", "c.req.path.startsWith(\"/api/translate\")"), "match by path prefix");
  routesRule(app);
  for (const file of ["accounts.ts", "index.ts", "sessions.ts", "signin.ts", "gate.ts"]) {
    const src = readFileSync(join(APP, "src", file), "utf8");
    assert(!/sessionOf\([^)]*cached:\s*true/.test(src), `${file} asks for the cache`);
  }
});
await test("sign-out (both routes) and account deletion call the forgets", () => {
  const accounts = readFileSync(join(APP, "src/accounts.ts"), "utf8");
  const app = readFileSync(join(APP, "src/app.ts"), "utf8");
  const after = (src, what) => src.split(what).slice(1).map((rest) => rest.slice(0, 300));
  for (const [file, src] of [["accounts.ts", accounts], ["app.ts", app]]) {
    const deletes = after(src, 'DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();');
    assert(deletes.length >= 1 && deletes.every((rest) => /^\s*await forgetSession\(token\);/.test(rest)), `${file}: a sign-out without forgetSession`);
  }
  assert.match(accounts, /DELETE FROM users WHERE id = \?"\)\.bind\(userId\)\),\n\s*\),\n\s*\);\n\s*\/\/[^\n]*\n\s*forgetUser\(userId\);/);
  const sessionDeletes = [...readFileSync(join(APP, "src/accounts.ts"), "utf8").matchAll(/DELETE FROM sessions/g)].length + [...app.matchAll(/DELETE FROM sessions/g)].length;
  assert.equal(sessionDeletes, 2, "a new place deletes sessions: give it its forget");
});

console.log(failed ? `session cache: ${failed} FAILED` : "session cache: all passed");
process.exit(failed ? 1 : 0);
