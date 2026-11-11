// The cookie session (src/sessions.ts): it slides forward while it's used, and the cookie goes with it, so someone who uses the app every
// day is never signed out at day 90 (6 Nov 2026, Codex C1: the end moved in D1 but the cookie kept its first 90 days). A plain lookup changes
// nothing; only sessionOf with extend does, past half its life, handing back the renewed cookie. SESSION_LIMITER spends one of a connection's
// per request before D1 reads a cookie (made-up ones refused past it). On the real migrations. Exit 0 = pass.
import assert from "node:assert/strict";
import { workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite } = workerEnv();
const { sessionOf, getSessionUser, SESSION_COOKIE, SessionsLimited } = await import("../src/sessions.ts");
const { sha256Hex } = await import("../src/util.ts");
const DAY = 86_400_000;
const NOW = Date.now();
sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES ('u1', 'Someone', 0)").run();
const session = async (token, daysLeft) => {
  sqlite.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, 'u1', ?, ?, 'test')").run(await sha256Hex(token), NOW - DAY, NOW + daysLeft * DAY);
  return new Request("http://localhost/api/me", { headers: { Cookie: `${SESSION_COOKIE}=${token}` } });
};
const endOf = async (token) => sqlite.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?").get(await sha256Hex(token)).expires_at;
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
await test("past half its life, a session in use slides to 90 days, and the cookie that carries it is renewed as long", async () => {
  const request = await session("tok-a", 40);
  const got = await sessionOf(request, env, { extend: true, now: NOW });
  assert.equal(got.user.id, "u1");
  assert.ok(got.renew && got.renew.startsWith(`${SESSION_COOKIE}=tok-a;`) && /Max-Age=7776000/.test(got.renew), String(got.renew));
  assert.equal(await endOf("tok-a"), NOW + 90 * DAY);
});
await test("a plain lookup never moves the session (it couldn't send a cookie), and neither does one with most of its life left", async () => {
  const request = await session("tok-b", 40);
  const before = await endOf("tok-b");
  assert.equal((await getSessionUser(request, env)).id, "u1");
  assert.equal((await sessionOf(request, env, { now: NOW })).renew, null);
  assert.equal(await endOf("tok-b"), before, "a lookup moved it without its cookie");
  const fresh = await session("tok-c", 80);
  assert.equal((await sessionOf(fresh, env, { extend: true, now: NOW })).renew, null);
});
await test("an expired session, or none, is no one", async () => {
  assert.equal(await sessionOf(await session("tok-d", -1), env, { extend: true, now: NOW }), null);
  assert.equal(await sessionOf(new Request("http://localhost/"), env, { extend: true }), null);
});
// SESSION_LIMITER (wrangler.jsonc): every lookup of a session cookie spends one of the connection's, before D1 reads anything (the launch's
// security pass, 7 Nov 2026: made-up cookies were a D1 read each, with no limit).
const limited = (allow) => {
  const calls = [];
  return { calls, limiter: { limit: async ({ key }) => (calls.push(key), { success: calls.length <= allow }) } };
};
const reading = () => {
  let reads = 0;
  const DB = new Proxy(env.DB, { get: (t, p) => (p === "prepare" ? (sql) => (/FROM sessions/.test(sql) && reads++, t.prepare(sql)) : typeof t[p] === "function" ? t[p].bind(t) : t[p]) });
  return { DB, reads: () => reads };
};
await test("made-up cookies from one connection: past SESSION_LIMITER refused before D1 reads them, and counted by connection", async () => {
  const { calls, limiter } = limited(2);
  const db = reading();
  const limitedEnv = { ...env, DB: db.DB, SESSION_LIMITER: limiter };
  const madeUp = (n) => new Request("http://localhost/api/me", { headers: { Cookie: `${SESSION_COOKIE}=madeup${n}`, "CF-Connecting-IP": "203.0.113.9" } });
  assert.equal(await sessionOf(madeUp(1), limitedEnv), null);
  assert.equal(await sessionOf(madeUp(2), limitedEnv), null);
  assert.equal(db.reads(), 2);
  await assert.rejects(() => sessionOf(madeUp(3), limitedEnv), SessionsLimited);
  await assert.rejects(() => getSessionUser(madeUp(4), limitedEnv), SessionsLimited);
  assert.equal(db.reads(), 2, "D1 read nothing past the limit");
  assert.deepEqual([...new Set(calls)], ["session:203.0.113.9"]);
});
await test("a request is counted once however often its session is looked up; one with no cookie isn't counted; no limiter, no limit", async () => {
  const { calls, limiter } = limited(5);
  const limitedEnv = { ...env, SESSION_LIMITER: limiter };
  const request = await session("tok-e", 60);
  assert.equal((await getSessionUser(request, limitedEnv)).id, "u1");
  assert.equal((await sessionOf(request, limitedEnv, { extend: true, now: NOW })).user.id, "u1");
  assert.equal(calls.length, 1, "the preview overlay and the middleware's lookups of one request are one");
  assert.equal(await sessionOf(new Request("http://localhost/api/me"), limitedEnv), null);
  assert.equal(calls.length, 1, "no cookie: nothing to look up, nothing counted");
  // A test's environment, or a config from before the binding: every lookup goes on.
  for (let i = 0; i < 10; i++) assert.equal((await getSessionUser(await session(`tok-f${i}`, 60), env)).id, "u1");
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
