#!/usr/bin/env node
// AUTH_LIMITER on a passkey ceremony, over HTTP against a LOCAL server (src/accounts.ts limited, wrangler.jsonc): only the options call
// counts, 60 a minute per connection, so 60 people behind one address (a school, an office) can sign up in a minute:
// - a flood from one connection: the first 429 no sooner than the 61st start (the app from before refused the 31st: its control), and
//   refused in words ("Too many attempts. Wait a minute.");
// - while the starts are refused, verify still isn't counted: a verify with no start of its own is refused for that (400, "expired"),
//   never as too many (before, every verify spent one more of the 30);
// - signing in shares the count: a sign-in's start refused too;
// - verify has a count of its own, the same 60 a minute: a flood of made-up verifies (each a write to D1 with a challenge cookie) is refused
//   past it, in words, and every one before it is turned away as expired (no real sign-up meets it: each verify follows its own start).
// The limiter counts per fixed minute, so a minute's turn mid-flood can let up to another 60 through; the first refusal is looked for in
// 125 starts. Every start writes a challenge row that expires in minutes. LOCAL only.
//   node scripts/auth-limit-check.mjs http://localhost:<port> <outDir>   (exit 0 = pass)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [BASE, OUT = "auth-limit-check-out"] = process.argv.slice(2);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("auth-limit-check floods a server's sign-up: give it a local one, e.g. http://localhost:8825");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
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
async function post(path, body, headers = {}) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, error: json?.error ?? null };
}

let statuses = [];
await stage("a flood of sign-up starts from one connection: none refused before the 61st, then refused in words", async () => {
  let refused = null;
  for (let i = 0; i < 125 && !refused; i++) {
    const r = await post("/api/auth/register/options", { name: `Limit ${i}` });
    statuses.push(r.status);
    if (r.status === 429) refused = r;
    else assert(r.status === 200, `start ${i + 1}: ${r.status} ${r.error}`);
  }
  writeFileSync(join(OUT, "starts.json"), JSON.stringify(statuses));
  assert(refused, `125 starts, none refused: the flood went through`);
  const first = statuses.indexOf(429) + 1;
  assert(first >= 61, `refused at start ${first}: the limit is under 60 (or verify still counts)`);
  assert(refused.error === "Too many attempts. Wait a minute.", `refused with: ${refused.error}`);
  return `${first - 1} starts went through, then a refusal`;
});

await stage("verify isn't counted: with the starts refused, a verify is turned away for having no start, never as too many", async () => {
  const sign = await post("/api/auth/register/verify", {});
  const login = await post("/api/auth/login/verify", { id: "nope" });
  assert(sign.status === 400 && /expired/.test(sign.error ?? ""), `sign-up verify: ${sign.status} ${sign.error}`);
  assert(login.status === 400 && /expired/.test(login.error ?? ""), `sign-in verify: ${login.status} ${login.error}`);
  return `sign-up's ${sign.status} "${sign.error}", sign-in's ${login.status} "${login.error}"`;
});

await stage("signing in shares the count: a sign-in's start refused too", async () => {
  const r = await post("/api/auth/login/options", {});
  assert(r.status === 429, `a sign-in start: ${r.status} ${r.error}`);
  return `${r.status}`;
});

await stage("made-up verifies from one connection: a count of their own, 60 a minute, refused past it in words", async () => {
  // Two verifies went in the stage before (this count's own), so the refusal comes no sooner than this flood's 59th.
  const seen = [];
  let refused = null;
  for (let i = 0; i < 125 && !refused; i++) {
    const r = await post(i % 2 ? "/api/auth/login/verify" : "/api/auth/register/verify", { id: "nope" }, { Cookie: `lc_chal=madeup${i}` });
    seen.push(r.status);
    if (r.status === 429) refused = r;
    else assert(r.status === 400 && /expired/.test(r.error ?? ""), `verify ${i + 1}: ${r.status} ${r.error}`);
  }
  writeFileSync(join(OUT, "verifies.json"), JSON.stringify(seen));
  assert(refused, "125 made-up verifies, none refused: the flood went through");
  const first = seen.indexOf(429) + 1;
  assert(first >= 59, `refused at verify ${first}: the limit is under 60`);
  assert(refused.error === "Too many attempts. Wait a minute.", `refused with: ${refused.error}`);
  return `${first - 1} made-up verifies turned away as expired, then refused as too many`;
});

writeFileSync(join(OUT, "auth-limit-check.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `FAILED: ${failed} stage(s)` : `all ${results.length} stages passed`);
process.exit(failed ? 1 : 0);
