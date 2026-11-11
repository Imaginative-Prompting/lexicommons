// A passkey challenge is used once (src/challenges.ts takeChallenge), even by two requests at once with the same cookie: one gets it,
// the other nothing (6 Nov 2026, Codex C4: read, then deleted, it let one assertion make two sessions). Only its own kind; an
// expired one answers nothing and is gone. On the real migrations. `node scripts/test-challenge-once.mjs` (exit 0 = pass).
import assert from "node:assert/strict";
import { workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite } = workerEnv();
const { takeChallenge } = await import("../src/challenges.ts");
const put = (id, kind, expires) => sqlite.prepare("INSERT INTO challenges (id, challenge, kind, user_id, user_name, expires_at) VALUES (?, 'c-' || ?, ?, NULL, NULL, ?)").run(id, id, kind, expires);
const browser = (id) => new Request("http://localhost/api/auth/login/verify", { method: "POST", headers: { Cookie: `lc_chal=${id}` } });
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
await test("two requests at once with one challenge: exactly one has it", async () => {
  for (let round = 0; round < 20; round++) {
    put(`r${round}`, "login", Date.now() + 60_000);
    const got = await Promise.all([takeChallenge(env, browser(`r${round}`), "login"), takeChallenge(env, browser(`r${round}`), "login")]);
    assert.equal(got.filter(Boolean).length, 1, `round ${round}: ${JSON.stringify(got)}`);
  }
});
await test("its own kind only, once; an expired one answers nothing; no cookie, nothing", async () => {
  put("k1", "register", Date.now() + 60_000);
  assert.equal(await takeChallenge(env, browser("k1"), "login"), null, "another kind");
  assert.equal((await takeChallenge(env, browser("k1"), "register"))?.challenge, "c-k1");
  assert.equal(await takeChallenge(env, browser("k1"), "register"), null, "used once");
  put("old", "login", Date.now() - 1);
  assert.equal(await takeChallenge(env, browser("old"), "login"), null);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM challenges WHERE id = 'old'").get().n, 0, "and it's gone");
  assert.equal(await takeChallenge(env, new Request("http://localhost/"), "login"), null);
});
console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
