#!/usr/bin/env node
// Registering an AI app (dynamic client registration, src/index.ts), over HTTP against a LOCAL server: a real client's registration
// works (the control); one past 16 KB is refused and kept nowhere; a burst from one connection meets AUTH_LIMITER's limit (a 429 with
// Retry-After) instead of filling OAUTH_KV with clients (6 Nov 2026, the Codex review S9).
//   node scripts/register-check.mjs http://localhost:<port> <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [BASE_ARG, OUT_ARG] = process.argv.slice(2);
if (!BASE_ARG || !OUT_ARG || !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(BASE_ARG)) {
  console.error("usage: register-check.mjs http://localhost:<port> <outDir> (a LOCAL server: it registers apps there)");
  process.exit(2);
}
const BASE = BASE_ARG.replace(/\/$/, "");
const OUT = resolve(OUT_ARG);
mkdirSync(OUT, { recursive: true });
const results = [];
async function stage(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error.message ?? error) });
    console.log(`FAIL  ${name}\n      ${String(error.message ?? error)}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const client = (name, extra = {}) => ({ client_name: name, redirect_uris: ["http://127.0.0.1:9/callback"], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], ...extra });
const register = async (body) => {
  const response = await fetch(`${BASE}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { status: response.status, retryAfter: response.headers.get("Retry-After"), body: await response.json().catch(() => ({})) };
};

await stage("a real client's registration works (the control)", async () => {
  const r = await register(client("Register check"));
  assert(r.status === 201 && r.body.client_id, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return `201, ${r.body.client_id.slice(0, 8)}…`;
});
await stage("one past 16 KB is refused, as invalid_client_metadata", async () => {
  const r = await register(client("x".repeat(20 * 1024)));
  assert(r.status === 400 && r.body.error === "invalid_client_metadata", `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return `${r.status} ${r.body.error}`;
});
await stage("a burst from one connection meets the limit: a 429 with Retry-After before 80", async () => {
  const statuses = [];
  for (let i = 0; i < 80; i++) {
    const r = await register(client(`Burst ${i}`));
    statuses.push(r.status);
    if (r.status === 429) {
      assert(r.retryAfter === "60" && r.body.error === "slow_down", `429: ${r.retryAfter} ${JSON.stringify(r.body)}`);
      break;
    }
  }
  writeFileSync(join(OUT, "burst.json"), JSON.stringify(statuses));
  assert(statuses.at(-1) === 429, `80 registrations, none refused: ${statuses.join(",")}`);
  assert(statuses.slice(0, -1).every((s) => s === 201), `before the limit: ${statuses.join(",")}`);
  return `${statuses.length - 1} registered, then 429`;
});

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `register check: ${failed} of ${results.length} stages FAILED` : `register check: all ${results.length} stages passed`);
process.exit(failed ? 1 : 0);
