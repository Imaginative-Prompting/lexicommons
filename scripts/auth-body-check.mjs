// A passkey ceremony's answer that isn't one (src/accounts.ts ceremonyAnswer), over HTTP on a LOCAL server: each verify route (a sign-up's, a
// sign-in's, a signed-in account's new passkey) given a fresh challenge and then a body that's no browser's: not JSON, empty, an array,
// null, a number, a string, and for a sign-in an id that isn't text. Each is a 400 in words, and nothing reaches the error reports
// (error_groups and error_hours unchanged): a script's junk is no error of the server's. The app before (7 Nov 2026) answered them 500 and
// recorded each as one; it fails here.
//   node scripts/auth-body-check.mjs http://localhost:<port> <outDir> --persist-to <dir>   (exit 0 = pass)
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !PERSIST) {
  console.error("Usage: node scripts/auth-body-check.mjs http://localhost:<port> <outDir> --persist-to <dir> (LOCAL only)");
  process.exit(2);
}
const OUT = resolve(outArg ?? "auth-body-check-out");
mkdirSync(OUT, { recursive: true });
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const WORDS = "The passkey's answer didn't come through whole. Try again.";
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(out.slice(out.indexOf("["))).at(-1).results;
};
const reported = () => sql("SELECT (SELECT COUNT(*) FROM error_groups) AS groups, (SELECT COALESCE(SUM(count), 0) FROM error_hours) AS counted")[0];

const results = [];
async function stage(name, fn) {
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, detail });
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    results.push({ stage: name, ok: false, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// A signed-in account, for adding a passkey.
const cookie = randomBytes(24).toString("hex");
{
  const now = Date.now();
  const id = `body-${randomBytes(4).toString("hex")}`;
  sql(
    `INSERT INTO users (id, name, created_at) VALUES ('${id}', 'Body check', ${now}); INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES ('${createHash("sha256").update(cookie).digest("hex")}', '${id}', ${now}, ${now + 90 * 86_400_000}, 'auth-body-check')`,
  );
}
async function post(path, body, cookies = []) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: BASE, ...(cookies.length ? { Cookie: cookies.join("; ") } : {}) }, body });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, text, challenge: /lc_chal=([^;]+)/.exec(r.headers.get("set-cookie") ?? "")?.[1] ?? null };
}

const JUNK = { "not JSON": "not json", empty: "", "an array": "[]", null: "null", "a number": "123", "a string": '"text"' };
const ROUTES = [
  { name: "a sign-up's verify", options: ["/api/auth/register/options", JSON.stringify({ name: "Body check" })], verify: "/api/auth/register/verify", junk: JUNK },
  { name: "a sign-in's verify", options: ["/api/auth/login/options", "{}"], verify: "/api/auth/login/verify", junk: { ...JUNK, "an id that's an object": '{"id":{"x":1}}', "an id that's a number": '{"id":5}' } },
  { name: "a new passkey's verify (signed in)", options: ["/api/auth/passkeys/options", "{}"], verify: "/api/auth/passkeys/verify", session: true, junk: JUNK },
];

for (const route of ROUTES) {
  await stage(`${route.name}: every body that's no browser's is a 400 in words, and nothing is reported`, async () => {
    const before = reported();
    const seen = [];
    for (const [what, body] of Object.entries(route.junk)) {
      const session = route.session ? [`lc_session=${cookie}`] : [];
      const options = await post(route.options[0], route.options[1], session);
      assert(options.status === 200 && options.challenge, `${route.options[0]}: ${options.status} ${options.text.slice(0, 120)}`);
      const answer = await post(route.verify, body, [...session, `lc_chal=${options.challenge}`]);
      seen.push(`${what} ${answer.status}`);
      assert(answer.status === 400 && answer.json?.error === WORDS, `${what}: ${answer.status} ${answer.text.slice(0, 120)}`);
    }
    const after = reported();
    assert(after.groups === before.groups && after.counted === before.counted, `reported: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
    return seen.join(", ");
  });
}

writeFileSync(join(OUT, "auth-body-check.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `auth body check: ${failed} FAILED of ${results.length}` : `auth body check: all ${results.length} stages passed`);
process.exit(failed ? 1 : 0);
