#!/usr/bin/env node
// What one connection can make D1 do with no account, over HTTP against a LOCAL server (src/sessions.ts SESSION_LIMITER, app.ts
// ERRORS_LIMITER, wrangler.jsonc; the launch's security pass, 7 Nov 2026):
// - a school's class behind one address (120 real sessions, each a start's calls and two polls, 960 requests) is never refused;
// - a flood of made-up session cookies from one connection is refused past the limit, 429 with Retry-After and in words, code
//   "rate_limited" (never "overloaded": the app's retry leaves it alone), and every one after that too;
// - an admin's preview cookie with a made-up session on a static file: the file is still served;
// - error reports from one connection: past their own limit they're dropped (still answered 204), so fewer are written than sent.
// Where the server marks each answer with the SQL D1 ran for it (x-d1-sql, a lever copy's: scratch/lex-selfhost/levers), it also shows a
// refused request never looked its session up, and a let-through one did. The limiter counts per minute per connection; locally every
// request is the same connection, and wrangler's limiter (miniflare's RateLimiterObject, kept in the state) counts by the wall clock's
// minute, so the class starts at the top of one and the window that refuses must have let exactly 1,200 through. Nothing else may talk to
// the server meanwhile. On a server without the limiter (the code before it) the flood and the reports stages fail: the control.
//   node scripts/session-limit-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--db lexicommons]   (exit 0 = pass)
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const opt = (name, dflt) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : dflt);
const PERSIST = opt("persist-to") && resolve(opt("persist-to"));
const DB = opt("db", "lexicommons");
const OUT = resolve(outArg ?? "session-limit-check-out");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !PERSIST) {
  console.error("Usage: node scripts/session-limit-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--db <name>] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
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
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", DB, "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out.slice(out.indexOf("["))).at(-1).results;
};
// Whether D1 looked a session cookie up for this answer (sessions.ts sessionOf's SELECT), or null where the server doesn't say.
const lookedUp = (headers) => {
  const sql = headers.get("x-d1-sql");
  if (!sql) return null;
  return JSON.parse(Buffer.from(sql, "base64").toString("utf8")).some((line) => /FROM sessions s JOIN users/.test(line));
};
async function send(path, { method = "GET", cookie, body, headers = {} } = {}) {
  const r = await fetch(`${BASE}${path}`, { method, headers: { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: r.status, json, retryAfter: r.headers.get("Retry-After"), contentType: r.headers.get("Content-Type") ?? "", looked: lookedUp(r.headers) };
}
const run = randomBytes(3).toString("hex");
const MINUTE = 60_000;
const LIMIT = 1200; // wrangler.jsonc SESSION_LIMITER
const cookied = []; // every request carrying a session cookie: when it was sent, and whether it was let through

await stage("a school's class behind one address: 120 real sessions, each a start's calls and two polls, never refused", async () => {
  const now = Date.now();
  const learners = Array.from({ length: 120 }, (_, i) => ({ id: `sl${run}${i}`, cookie: randomBytes(24).toString("base64url") }));
  const statements = learners.flatMap((l) => [
    `INSERT INTO users (id, name, created_at) VALUES (${q(l.id)}, 'Class ${q(l.id).slice(1, -1)}', ${now})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(createHash("sha256").update(l.cookie).digest("hex"))}, ${q(l.id)}, ${now}, ${now + 86_400_000}, 'session-limit-check')`,
  ]);
  for (let i = 0; i < statements.length; i += 80) sql(statements.slice(i, i + 80).join("; "));
  // The top of the next minute, so this window holds the check's requests alone (whatever this address sent before is in the last one).
  await new Promise((done) => setTimeout(done, MINUTE - (Date.now() % MINUTE) + 250));
  const t0 = Date.now();
  const statuses = {};
  let sent = 0;
  for (const l of learners) {
    const cookie = `lc_session=${l.cookie}`;
    const device = randomBytes(16).toString("hex");
    // The start's calls as the app makes them (scratch/lex-selfhost/load/drive.mjs), then a poll of each.
    const calls = [["GET", "/api/me"], ["GET", "/api/practice"], ["GET", "/api/look"], ["PUT", "/api/packs/device", { device, label: "Class", packs: [], texts: [] }],
      ["GET", `/api/packs/inbox?device=${device}`], ["GET", "/api/community/following"], ["GET", "/api/look?since=0&lib=0"], ["GET", `/api/packs/inbox?device=${device}`]];
    for (const [method, path, body] of calls) {
      const at = Date.now();
      const r = await send(path, { method, cookie, body });
      cookied.push({ at, through: r.status !== 429 });
      statuses[r.status] = (statuses[r.status] ?? 0) + 1;
      sent++;
    }
  }
  writeFileSync(join(OUT, "school.json"), JSON.stringify(statuses));
  assert(!statuses[429], `refused ${statuses[429]} of ${sent}: ${JSON.stringify(statuses)}`);
  assert(!statuses[401] && !statuses[500], `answered ${JSON.stringify(statuses)}`);
  const seconds = (Date.now() - t0) / 1000;
  return `${sent} requests from 120 learners in ${seconds.toFixed(1)} s (${Math.floor(Date.now() / MINUTE) === Math.floor(t0 / MINUTE) ? "one minute" : "across a minute's turn"}): ${JSON.stringify(statuses)}`;
});

let floodRefusedAt = null;
await stage("made-up session cookies from one connection: refused past the limit with 429, Retry-After and words, none looked up in D1", async () => {
  const seen = [];
  let refused = null;
  for (let i = 0; i < 2600 && !refused; i++) {
    const at = Date.now();
    const r = await send("/api/me", { cookie: `lc_session=madeup${run}${i}` });
    cookied.push({ at, through: r.status !== 429 });
    seen.push({ status: r.status, looked: r.looked });
    if (r.status === 429) refused = { ...r, at };
    if (r.status !== 429) assert(r.status === 401, `made-up ${i + 1}: ${r.status} ${JSON.stringify(r.json)}`);
  }
  assert(refused, "2,600 made-up sessions, none refused: no limit on what they cost D1");
  floodRefusedAt = seen.length;
  // The class above spent up to 960 of this minute's 1,200 (none of it if the minute turned meanwhile): the refusal comes no sooner than the 241st.
  assert(floodRefusedAt >= 241, `refused at the ${floodRefusedAt}th: the limit is under 1,200`);
  // The refusing minute let exactly the limit through: the class's and the flood's requests in it (a request sent within a few ms of the
  // minute's turn may be counted on the other side of it).
  const window = Math.floor(refused.at / MINUTE);
  const through = cookied.filter((x) => x.through && Math.floor(x.at / MINUTE) === window).length;
  assert(Math.abs(through - LIMIT) <= 3, `the refusing minute let ${through} through, not ${LIMIT}`);
  const before = seen.slice(0, -1).filter((s) => s.looked !== null);
  if (before.length) assert(before.every((s) => s.looked), `a made-up session let through but not looked up: the server doesn't say what it reads`);
  assert(refused.json?.code === "rate_limited" && /Too many requests/.test(refused.json?.error ?? "") && refused.retryAfter === "60", `refused with ${JSON.stringify(refused.json)}, Retry-After ${refused.retryAfter}`);
  // And the next ones too, on the API and on a page (in words there too, as text), none looked up in D1.
  const after = [];
  for (let i = 0; i < 20; i++) after.push(await send(i % 2 ? "/app/" : "/api/me", { cookie: `lc_session=after${run}${i}` }));
  assert(after.every((r) => r.status === 429), `after the first refusal: ${after.map((r) => r.status)}`);
  const page = after.find((r, i) => i % 2);
  assert(page.contentType.startsWith("text/plain") && page.retryAfter === "60", `a page refused as ${page.contentType}, Retry-After ${page.retryAfter}`);
  const told = [refused, ...after].filter((r) => r.looked !== null);
  if (told.length) assert(told.every((r) => !r.looked), `a refused one looked up in D1`);
  writeFileSync(join(OUT, "flood.json"), JSON.stringify(seen));
  return `${floodRefusedAt - 1} made-up sessions answered 401, then refused, its minute having let ${through} through${told.length ? `; D1 looked up every one let through (${before.length} told) and none of the ${told.length} refused` : " (this server doesn't say what D1 read)"}`;
});

await stage("an admin's preview cookie with a made-up session on a public file: the file still served, the session not looked up past the limit", async () => {
  const r = await send("/robots.txt", { cookie: `lc_session=preview${run}; lc_preview=PLAN_ENABLED` });
  assert(r.status === 200, `robots.txt: ${r.status}`);
  if (r.looked !== null) assert(!r.looked, "its session looked up in D1");
  return `${r.status}${r.looked !== null ? ", not looked up" : ""}`;
});

await stage("error reports from one connection: past their own limit dropped, still answered 204", async () => {
  const before = sql("SELECT COALESCE(SUM(count), 0) AS n FROM error_hours WHERE source = 'client'")[0].n;
  const origin = opt("origin", BASE);
  const statuses = new Set();
  for (let i = 0; i < 45; i++) {
    const r = await fetch(`${BASE}/api/errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin, "User-Agent": "Mozilla/5.0 (Macintosh) Chrome/142.0.0.0 Safari/537.36" },
      body: JSON.stringify({ kind: "error", name: "TypeError", message: `limit check ${i}`, stack: "    at f (https://lexicommons.com/js/a.js:1:1)", place: "/app/#today", version: "1" }),
    });
    statuses.add(r.status);
  }
  const written = sql("SELECT COALESCE(SUM(count), 0) AS n FROM error_hours WHERE source = 'client'")[0].n - before;
  assert(statuses.size === 1 && statuses.has(204), `answered ${[...statuses]}`);
  assert(written >= 1, "none written: the reports didn't reach the server (its PUBLIC_ORIGIN? pass --origin)");
  assert(written < 45, `all 45 written: no limit on what one connection writes`);
  return `45 sent, ${written} written`;
});

writeFileSync(join(OUT, "session-limit-check.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `FAILED: ${failed} stage(s)` : `all ${results.length} stages passed`);
process.exit(failed ? 1 : 0);
