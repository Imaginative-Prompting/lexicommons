#!/usr/bin/env node
// A cookie session's change comes only from this site (app.ts, util.ts crossSite), over HTTP against a LOCAL server, as a signed-in
// browser's requests would arrive: another site's (its Origin, a neighbor on another localhost port, Fetch Metadata saying cross-site,
// a text/plain form posting JSON) refused with nothing written; getting back in (/api/recover/confirm) refused from another site before
// it reads the code; this site's own and a request with neither header (not a browser's) go on (the control). 6 Nov 2026, Codex S5/S4.
//   node scripts/origin-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [BASE_ARG, OUT_ARG] = process.argv.slice(2);
const PERSIST = process.argv[process.argv.indexOf("--persist-to") + 1];
if (!BASE_ARG || !OUT_ARG || !process.argv.includes("--persist-to") || !/^http:\/\/(localhost|127\.0\.0\.1):\d+\/?$/.test(BASE_ARG)) {
  console.error("usage: origin-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> (LOCAL only: it writes an account into D1)");
  process.exit(2);
}
const BASE = BASE_ARG.replace(/\/$/, "");
const OUT = resolve(OUT_ARG);
mkdirSync(OUT, { recursive: true });
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const user = `org${randomBytes(5).toString("hex")}`;
const cookie = randomBytes(24).toString("base64url");
const now = Date.now();
sql(`INSERT INTO users (id, name, created_at) VALUES (${q(user)}, 'Origin check', ${now}); INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(user)}, ${now}, ${now + 86400_000}, 'origin-check')`);
const notes = () => sql(`SELECT COUNT(*) AS n FROM notes WHERE user_id = ${q(user)}`)[0].n;

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
// A signed-in browser's POST, with the headers it would carry (a cross-site form posts text/plain).
const post = (path, headers, body = JSON.stringify({ text: "origin check" })) => fetch(`${BASE}${path}`, { method: "POST", headers: { Cookie: `lc_session=${cookie}`, "Content-Type": "text/plain", ...headers }, body });

await stage("another site's request is refused, and writes nothing", async () => {
  const before = notes();
  const seen = [];
  for (const headers of [{ Origin: "https://evil.example" }, { Origin: "http://localhost:9999", "Sec-Fetch-Site": "same-site" }, { "Sec-Fetch-Site": "cross-site" }, { Origin: "null" }]) {
    const r = await post("/api/notes", headers);
    seen.push(`${JSON.stringify(headers)} ${r.status}`);
    assert(r.status === 403, `${JSON.stringify(headers)}: ${r.status} ${(await r.text()).slice(0, 120)}`);
  }
  assert(notes() === before, `a note was written: ${before} → ${notes()}`);
  return `${seen.length} refused`;
});
await stage("getting back in is refused from another site before any code is read", async () => {
  const r = await fetch(`${BASE}/api/recover/confirm`, { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "text/plain" }, body: JSON.stringify({ id: "x", code: "000000", padding: "=" }) });
  assert(r.status === 403, `${r.status} ${(await r.text()).slice(0, 120)}`);
  return "403";
});
await stage("this site's own request and one with neither header go on (the control)", async () => {
  const before = notes();
  const own = await post("/api/notes", { Origin: BASE, "Sec-Fetch-Site": "same-origin" });
  assert(own.ok, `this site: ${own.status} ${(await own.text()).slice(0, 120)}`);
  const plain = await post("/api/notes", {});
  assert(plain.ok, `no browser headers: ${plain.status}`);
  assert(notes() === before + 2, `notes ${before} → ${notes()}`);
  return "both written";
});

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `origin check: ${failed} of ${results.length} stages FAILED` : `origin check: all ${results.length} stages passed`);
process.exit(failed ? 1 : 0);
