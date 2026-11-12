#!/usr/bin/env node
// What public/privacy.html and public/terms.html say, against what the app does, on a local server:
//
//   - every table that holds an account's rows: in the account's export, or said here why not. A new table fails until it's decided.
//   - deleting an account: nothing of it left but what the policy says stays, without the account on it.
//   - a copyright notice: its pack's owner is told the work it names, never who sent it; a moderator sees the work, and only an admin the rest.
//   - Translate: what's typed goes in a request's body, never in a URL, and not into the server's log (in Chrome, and --server-log).
//   - no pictures in what's shared: packs carrying pictures, by every field that could, and markup that would draw one (in Chrome). A lesson's word
//     may name one of our own drawings by its concept id, and nothing else: no file, address, markup or drawing.
//   - a signed-in walk through the tabs loads nothing from another site.
//   - with the plan off (a server with no PLAN_ENABLED), what a site without it never says (scripts/fixtures/plan-words.mjs: payments, a
//     plan, prices, Stripe, a trial, receipts, the in-app AI) on no screen of the app, as a learner with an AI and as an admin, and nowhere
//     over MCP (its instructions, every tool, every guide); --plan, on a server that offers it: Settings → Email names receipts, the control.
//
//   node scripts/privacy-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--server-log <file>] [--plan]
//
// LOCAL only: it writes accounts into the server's D1. A fresh state, --var COMMUNITY_SHARING:everyone. Exit 0 = every stage passed.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Agent, fetch as undiciFetch } from "undici";
import { chromium } from "./quiet-browser.mjs";
import { bookFromText } from "../public/js/read/import-text.js";
import { planWordsIn } from "./fixtures/plan-words.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const PERSIST = opt("persist-to") && resolve(opt("persist-to"));
const SERVER_LOG = opt("server-log") && resolve(opt("server-log"));
const PLAN = argv.includes("--plan");
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST) {
  console.error("Usage: node scripts/privacy-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--server-log <file>] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

// A fresh connection every time: a kept-alive socket the local server closed while wrangler ran beside it fails the next request.
const fresh = new Agent({ pipelining: 0 });
const fetch = (url, init = {}) => undiciFetch(url, { ...init, dispatcher: fresh });
const results = [];
async function stage(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").join("\n        ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const q = (value) => (value === null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const sql = (command) => {
  let out;
  try {
    out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).toString();
  } catch (error) {
    throw new Error(`SQL: ${command.slice(0, 160)}\n${String(error.stdout ?? "").slice(0, 400)}${String(error.stderr ?? "").slice(0, 400)}`);
  }
  return JSON.parse(out.slice(out.indexOf("["))).at(-1).results;
};
const run = randomBytes(3).toString("hex");
const now = Date.now();
function account(name, { role = null, ageDays = 30 } = {}) {
  const id = `pc${run}${randomBytes(5).toString("hex")}`;
  const cookie = randomBytes(24).toString("base64url");
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  sql([
    `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now - ageDays * 86400_000})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'privacy-check')`,
    `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, 'check', ${q(sha256(token))}, ${q(token.slice(0, 8))}, ${now}, ${role ? 1 : 0})`,
    ...(role ? [`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, ${q(role)}, ${now}, 'd1', 'privacy-check')`] : []),
  ].join("; "));
  return { id, name, cookie, token };
}
async function as(who, method, path, body) {
  const response = await fetch(`${BASE}${path}`, { method, redirect: "manual", headers: { Cookie: `lc_session=${who.cookie}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: response.status, json, text };
}
async function tool(who, name, args = {}) {
  const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${who.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${name}: ${response.status} ${text.slice(0, 200)}`);
  const { result, error } = JSON.parse(line.slice(6));
  if (error) return { error: error.message };
  if (result.isError) return { error: result.content[0].text };
  return JSON.parse(result.content[0].text);
}
const fixture = (file, id, tail) => {
  const pack = JSON.parse(readFileSync(join(APP, `scripts/fixtures/packs/${file}.json`), "utf8"));
  pack.id = id;
  pack.items[0].means += ` (${tail})`;
  return pack;
};
const mark = (what) => `privacy-${what}-${run}`;

// ---------- the account, a row of it in every table ----------

const who = account(mark("name"));
const reporter = account(`Reporter ${run}`);
const moderator = account(`Moderator ${run}`, { role: "moderator" });
const admin = account(`Admin ${run}`, { role: "admin" });
const ids = {};

/** Where each table's row shows in the export. A table with an account's column that isn't here or on NOT_EXPORTED fails. */
const EXPORTED = {
  users: (e) => e.account?.name === who.name,
  sessions: (e) => e.sessions.some((s) => s.user_agent === "privacy-check"),
  api_tokens: (e) => e.tokens.some((t) => t.name === "check"),
  passkeys: (e) => e.passkeys.some((p) => p.id === mark("passkey")),
  account_emails: (e) => e.email?.email === mark("email"),
  identities: (e) => JSON.stringify(e.signins).includes(mark("subject")),
  notes: (e) => JSON.stringify(e.notes).includes(mark("note")),
  uploads: (e) => e.uploads.some((u) => u.filename === `${mark("upload")}.m4a`),
  looks: (e) => JSON.stringify(e.look).includes(mark("look2")),
  look_history: (e) => JSON.stringify(e.lookHistory).includes(mark("look")),
  look_images: (e) => e.lookImages.some((i) => i.hash === "a".repeat(64)),
  themes: (e) => e.themes.some((t) => t.id === `pc${run}`),
  theme_library: (e) => Array.isArray(e.themes),
  pack_devices: (e) => e.packs.devices.some((d) => d.label === mark("device") && JSON.stringify(d.texts).includes(mark("text"))),
  pack_copies: (e) => JSON.stringify(e.packs.copies).includes(mark("copy")),
  pack_changes: (e) => e.packs.changes.some((c) => c.said === mark("change")),
  pack_audio: (e) => JSON.stringify(e.packs.copies).includes(mark("clip")),
  text_changes: (e) => e.texts.some((t) => t.said === mark("textchange")),
  // The account's copy: its progress, its own packs and its texts (from 12 Nov 2026), each in the export.
  account_sync: (e) => ["progress", "packs", "texts"].every((kind) => e.progressCopy.some((file) => file.name === `lexicommons-${kind}.${mark("copy")}.json`)),
  progress_clears: (e) => e.progressClears.clears?.some?.((c) => c.id === mark("clear")) ?? JSON.stringify(e.progressClears).includes(mark("clear")),
  user_roles: (e) => e.roles.some((r) => r.note === mark("role")),
  staged_files: (e) => e.stagedFiles.some((s) => s.name === mark("staged")),
  admin_log: (e) => e.adminActions.some((a) => a.note === mark("log")),
  corrections: (e) => e.corrections.some((c) => c.note === mark("correction")),
  requests: (e) => e.requests.some((r) => r.title === mark("request")),
  items: (e) => e.community.shared.some((i) => i.id === ids.mine),
  shared_books: (e) => e.community.sharedBooks.some((b) => b.id === ids.myBook) && e.community.bookVersions.some((v) => v.book_id === ids.myBook),
  book_follows: (e) => e.community.bookFollows.some((f) => f.book_id === ids.theirBook),
  follows: (e) => e.community.follows.some((f) => f.item_id === ids.other),
  likes: (e) => e.community.likes.some((l) => l.target_id === ids.other) && e.community.likes.some((l) => l.target_kind === "book" && l.target_id === ids.theirBook),
  sharing_terms: (e) => e.community.terms.length === 1,
  reports: (e) => e.community.reports.some((r) => r.details === mark("report")),
  counter_notices: (e) => e.community.counterNotices.some((c) => c.statement.includes(mark("counter"))),
  user_bans: (e) => e.community.bans.some((b) => b.reason === mark("ban")),
  grammar_suggestions: (e) => e.community.grammarSuggestions.some((g) => g.note === mark("grammar")),
  request_answers: (e) => e.community.answers.some((a) => a.item_id === ids.mine),
  reminders: (e) => JSON.stringify(e.reminders.settings).includes("07:15") && JSON.stringify(e.reminders.state).includes("Europe/Amsterdam"),
  push_subscriptions: (e) => e.reminders.devices.some((d) => d.endpoint.includes(mark("push"))),
  push_queue: (e) => e.reminders.waiting.some((w) => w.title === mark("queued")),
  billing_customers: (e) => e.billing?.customer?.customer === mark("cus"),
  billing_subscriptions: (e) => e.billing?.subscriptions?.some((s) => s.id === mark("sub")),
  ai_meter: (e) => e.billing?.aiMonths?.some((m) => m.month === "2026-11"),
  ai_usage: (e) => e.billing?.aiUse?.some((u) => u.feature === mark("aiuse")),
  bug_reports: (e) => e.bugReports?.some((b) => b.text === mark("bug") && b.screenshot?.url?.endsWith("/screenshot")),
};
/** A column naming an account, on a table that isn't this account's data: why it isn't in the export. */
const NOT_EXPORTED = {
  find_entries: "a shared pack's sentences and words, for finding a pack: public, the pack's own, not the person's; cleared when the pack goes (src/find.ts)",
  find_terms: "the words that lead to those: the same",
  challenges: "a sign-in's few minutes, never read back",
  email_codes: "a code on its way to an address: only its hash, for 15 minutes, gone once used and within the hour after (src/account-email.ts)",
  email_sends: "that a code was sent, for the hourly limits: the address only as a hash, gone after an hour; an account deleted loses its link at once (src/account-email.ts)",
  refresh_once: "an AI app's token exchange for 10 minutes, sealed",
  pack_deliveries: "which device took which change; the change is in the export",
  text_deliveries: "which device took which change; the change is in the export",
  explore_sections: "an admin's, the shelf's curation",
  library_revisions: "an admin's: the catalog's history (the actions are in admin_log)",
  moderation_policy: "an admin's: the rules' history",
};
const USER_COLUMNS = new Set(["user_id", "owner_id", "author_id", "by_id", "reporter_id", "actor_id", "by", "updated_by", "granted_by"]);
const STAFF_COLUMNS = new Set(["handled_by", "decided_by", "answered_by", "made_by"]);

await stage("a row of the account in every table", async () => {
  const note = await as(who, "POST", "/api/notes", { text: mark("note") });
  assert(note.status === 200, `note: ${note.status}`);
  const look = await as(who, "PUT", "/api/look", { baseRev: 0, look: { name: mark("look") } });
  assert(look.status === 200, `look: ${look.status} ${look.text.slice(0, 200)}`);
  const look2 = await as(who, "PUT", "/api/look", { baseRev: look.json.rev, look: { name: mark("look2") } });
  assert(look2.status === 200, `look 2: ${look2.status} ${look2.text.slice(0, 200)}`);
  const up = await fetch(`${BASE}/api/v1/uploads`, { method: "POST", headers: { Authorization: `Bearer ${who.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ filename: `${mark("upload")}.m4a`, contentType: "audio/mp4" }) });
  assert(up.status === 200, `upload: ${up.status}`);
  const device = await as(who, "PUT", "/api/packs/device", { device: `dev${run}`, label: mark("device"), packs: [{ id: "x", name: "x", language: "nl", kind: "default", on: true, items: 1 }], texts: [{ id: "t1", title: mark("text"), language: "nl", words: 1, by: "ai", addedAt: now }] });
  assert(device.status === 200, `device: ${device.status} ${device.text.slice(0, 200)}`);
  const terms = await as(who, "GET", "/api/community/terms");
  assert((await as(who, "POST", "/api/community/terms", { version: terms.json.version })).status === 200, "terms");
  assert((await as(reporter, "POST", "/api/community/terms", { version: terms.json.version })).status === 200, "reporter's terms");
  const mine = await as(who, "POST", "/api/community/share", { pack: fixture("check-nl", `mine-${run}`, run), level: "A1", topics: [] });
  assert(mine.status === 200, `share: ${mine.status} ${mine.text.slice(0, 300)}`);
  ids.mine = mine.json.id;
  ids.mineVersion = mine.json.version;
  const other = await as(reporter, "POST", "/api/community/share", { pack: fixture("check-de", `other-${run}`, run), level: "A1", topics: [] });
  assert(other.status === 200, `other's share: ${other.status} ${other.text.slice(0, 300)}`);
  ids.other = other.json.id;
  assert((await as(who, "POST", `/api/community/items/${ids.other}/follow`, {})).status === 200, "follow");
  // A book it shared, and one it added to its reading library from Explore (community-books.ts), each a public-domain text.
  const book = async (title) => Object.assign(await bookFromText(`${title}. The cat sleeps on the mat.\n\nThe dog barks. It is late.`, { title, lang: "en" }), { id: `pc-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, rights: { us: true, eu: true, basis: "written for the check" }, source: { kind: "gutenberg", url: "https://www.gutenberg.org/ebooks/1" } });
  const myBook = await as(who, "POST", "/api/community/books/share", { book: await book(`Mine ${run}`) });
  assert(myBook.status === 200 && myBook.json.shared, `share a book: ${myBook.status} ${myBook.text.slice(0, 300)}`);
  ids.myBook = myBook.json.id;
  const theirBook = await as(reporter, "POST", "/api/community/books/share", { book: await book(`Theirs ${run}`) });
  assert(theirBook.status === 200 && theirBook.json.shared, `their book: ${theirBook.status} ${theirBook.text.slice(0, 300)}`);
  ids.theirBook = theirBook.json.id;
  assert((await as(who, "POST", `/api/community/books/${ids.theirBook}/follow`, {})).status === 200, "add a book");
  assert((await as(who, "POST", `/api/community/books/${ids.theirBook}/like`, {})).status === 200, "like a book");
  assert((await as(who, "POST", `/api/community/items/${ids.other}/like`, {})).status === 200, "like");
  const reported = await as(who, "POST", `/api/community/items/${ids.other}/report`, { reason: "spam", details: mark("report") });
  assert(reported.status === 200, `report: ${reported.status} ${reported.text.slice(0, 200)}`);
  // A bug report (src/bug-reports.ts) as Settings → Report a bug sends it: a form, with a screenshot (a 1 × 1 PNG).
  const bug = new FormData();
  bug.set("text", mark("bug"));
  bug.set("context", JSON.stringify({ screen: "/app/#today", version: "check", device: "phone", installed: false, learning: "nl", speaks: "en" }));
  bug.set("screenshot", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")], { type: "image/png" }), "screenshot.png");
  // Written out by the platform's own Response, so the form's bytes and boundary are a browser's, whichever fetch sends them.
  const bugForm = new Response(bug);
  const bugSent = await fetch(`${BASE}/api/bug-reports`, { method: "POST", headers: { Cookie: `lc_session=${who.cookie}`, "Content-Type": bugForm.headers.get("Content-Type") }, body: Buffer.from(await bugForm.arrayBuffer()) });
  assert(bugSent.status === 200, `bug report: ${bugSent.status} ${(await bugSent.text()).slice(0, 200)}`);
  const copy = JSON.stringify(fixture("check-nl", `copy-${run}`, mark("copy")));
  const statements = [
    `INSERT INTO passkeys (id, user_id, public_key, created_at) VALUES (${q(mark("passkey"))}, ${q(who.id)}, 'x', ${now})`,
    `INSERT INTO account_emails (user_id, email, verified_at, created_at) VALUES (${q(who.id)}, ${q(mark("email"))}, ${now}, ${now})`,
    `INSERT INTO email_codes (id, user_id, email, purpose, code_hash, expires_at, created_at) VALUES (${q(mark("code"))}, ${q(who.id)}, ${q(mark("email"))}, 'confirm', 'x', ${now + 900_000}, ${now})`,
    `INSERT INTO identities (provider, subject, user_id, label, created_at) VALUES ('github', ${q(mark("subject"))}, ${q(who.id)}, 'label', ${now})`,
    `INSERT INTO challenges (id, challenge, kind, user_id, expires_at) VALUES (${q(mark("chal"))}, 'x', 'login', ${q(who.id)}, ${now + 60_000})`,
    `INSERT INTO refresh_once (id, kind, user_id, body, expires_at) VALUES (${q(mark("once"))}, 'lock', ${q(who.id)}, 'x', ${now + 60_000})`,
    `INSERT INTO look_images (user_id, hash, content_type, size, created_at) VALUES (${q(who.id)}, ${q("a".repeat(64))}, 'image/png', 1, ${now})`,
    `INSERT INTO themes (user_id, id, rev, look, created_by, source, created_at, updated_at) VALUES (${q(who.id)}, ${q(`pc${run}`)}, 1, '{}', 'me', 'app', ${now}, ${now})`,
    `INSERT OR IGNORE INTO theme_library (user_id, rev) VALUES (${q(who.id)}, 1)`,
    `INSERT INTO pack_copies (user_id, pack_id, language, pack, through, device_id, updated_at) VALUES (${q(who.id)}, ${q(`copy-${run}`)}, 'nl', ${q(copy)}, 0, ${q(`dev${run}`)}, ${now})`,
    `INSERT INTO pack_changes (id, user_id, pack_id, kind, said, source, created_at, expires_at) VALUES (${q(mark("pchange"))}, ${q(who.id)}, ${q(`copy-${run}`)}, 'add', ${q(mark("change"))}, 'check', ${now}, ${now + 86400_000})`,
    `INSERT INTO pack_audio (user_id, pack_id, manifest, through, updated_at) VALUES (${q(who.id)}, ${q(`copy-${run}`)}, ${q(JSON.stringify({ clip: mark("clip") }))}, 0, ${now})`,
    `INSERT INTO text_changes (id, user_id, text_id, kind, said, source, created_at, expires_at) VALUES (${q(mark("tchange"))}, ${q(who.id)}, 't1', 'add', ${q(mark("textchange"))}, 'check', ${now}, ${now + 86400_000})`,
    `INSERT INTO progress_clears (user_id, id, before_at, at) VALUES (${q(who.id)}, ${q(mark("clear"))}, ${now}, ${now})`,
    `INSERT INTO account_sync (user_id, name, size, version, updated_at) VALUES (${q(who.id)}, ${q(`lexicommons-progress.${mark("copy")}.json`)}, 2, 'v1', ${now})`,
    `INSERT INTO account_sync (user_id, name, size, version, updated_at) VALUES (${q(who.id)}, ${q(`lexicommons-packs.${mark("copy")}.json`)}, 2, 'v1', ${now})`,
    `INSERT INTO account_sync (user_id, name, size, version, updated_at) VALUES (${q(who.id)}, ${q(`lexicommons-texts.${mark("copy")}.json`)}, 2, 'v1', ${now})`,
    // The paid plan's rows (src/billing.ts), as the webhook and the in-app AI would write them.
    `INSERT INTO billing_customers (user_id, customer, trial_used, created_at) VALUES (${q(who.id)}, ${q(mark("cus"))}, 1, ${now})`,
    `INSERT INTO billing_subscriptions (id, user_id, customer, status, updated_at) VALUES (${q(mark("sub"))}, ${q(who.id)}, ${q(mark("cus"))}, 'canceled', ${now})`,
    `INSERT INTO ai_meter (user_id, month, allowance, spent, reserved) VALUES (${q(who.id)}, '2026-11', 1, 0, 0)`,
    `INSERT INTO ai_usage (user_id, at, feature, model, cost_micro) VALUES (${q(who.id)}, ${now}, ${q(mark("aiuse"))}, 'check', 1)`,
    `INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(who.id)}, 'moderator', ${now}, 'd1', ${q(mark("role"))})`,
    `INSERT INTO staged_files (id, user_id, name, content_type, size, sha256, status, source, created_at, link_expires_at, expires_at) VALUES (${q(mark("stagedid"))}, ${q(who.id)}, ${q(mark("staged"))}, 'application/json', 1, ${q("b".repeat(64))}, 'pending', 'check', ${now}, ${now + 1000}, ${now + 1000})`,
    `INSERT INTO admin_log (id, actor_id, via, action, note, created_at) VALUES (${q(mark("logid"))}, ${q(who.id)}, 'check', 'check.action', ${q(mark("log"))}, ${now})`,
    `INSERT INTO corrections (id, item_id, version, path, kind, value, note, author_id, created_at, updated_at) VALUES (${q(mark("correctionid"))}, ${q(ids.other)}, 'v', 'items.0', 'flag', NULL, ${q(mark("correction"))}, ${q(who.id)}, ${now}, ${now})`,
    `INSERT INTO requests (id, kind, language, title, author_id, created_at, updated_at) VALUES (${q(mark("requestid"))}, 'pack', 'nl', ${q(mark("request"))}, ${q(who.id)}, ${now}, ${now})`,
    `INSERT INTO requests (id, kind, language, title, author_id, created_at, updated_at) VALUES (${q(mark("theirrequest"))}, 'pack', 'nl', 'Theirs', ${q(reporter.id)}, ${now}, ${now})`,
    `INSERT INTO request_answers (request_id, item_id, by_id, created_at) VALUES (${q(mark("theirrequest"))}, ${q(ids.mine)}, ${q(who.id)}, ${now})`,
    `INSERT INTO reports (id, target_kind, target_id, reason, details, notice, reporter_id, state, created_at) VALUES (${q(mark("holding"))}, 'item', ${q(ids.mine)}, 'spam', 'x', NULL, ${q(reporter.id)}, 'upheld', ${now})`,
    `INSERT INTO counter_notices (id, report_id, item_id, owner_id, statement, contact, created_at) VALUES (${q(mark("counterid"))}, ${q(mark("holding"))}, ${q(ids.mine)}, ${q(who.id)}, ${q(`It's mine. ${mark("counter")}`)}, ${q(JSON.stringify({ name: mark("countername"), email: mark("counteremail") }))}, ${now})`,
    `INSERT INTO grammar_suggestions (id, language, kind, pattern, change, note, knows, via, author_id, against, created_at, updated_at) VALUES (${q(mark("grammarid"))}, 'nl', 'fix', 'x', '{}', ${q(mark("grammar"))}, 'learning', 'app', ${q(who.id)}, 'v', ${now}, ${now})`,
    `INSERT INTO user_bans (id, user_id, scope, reason, by, created_at) VALUES (${q(mark("banid"))}, ${q(who.id)}, 'share', ${q(mark("ban"))}, ${q(admin.id)}, ${now})`,
    `INSERT INTO reminders (user_id, settings, state, next_at, updated_at) VALUES (${q(who.id)}, ${q(JSON.stringify({ time: "07:15" }))}, ${q(JSON.stringify({ tz: "Europe/Amsterdam" }))}, ${now + 86400_000}, ${now})`,
    `INSERT INTO push_subscriptions (endpoint, user_id, device, p256dh, auth, created_at, used_at) VALUES (${q(`https://fcm.googleapis.com/fcm/send/${mark("push")}`)}, ${q(who.id)}, ${q(`dev${run}`)}, ${q(mark("pushkey"))}, ${q(mark("pushauth"))}, ${now}, ${now})`,
    `INSERT INTO push_queue (id, user_id, kind, title, body, url, at) VALUES (${q(mark("queueid"))}, ${q(who.id)}, 'community', ${q(mark("queued"))}, 'b', '/app/', ${now})`,
  ];
  for (const statement of statements) sql(statement);
  return `${statements.length} rows by SQL, the rest through the app`;
});

let exported = null;
await stage("the export holds every table's row, or this check says why not; a new table fails here", async () => {
  const response = await as(who, "GET", "/api/me/export");
  assert(response.status === 200, `export: ${response.status} ${response.text.slice(0, 300)}`);
  exported = response.json;
  writeFileSync(join(OUT, "export.json"), JSON.stringify(exported, null, 1));
  const tables = sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%'").map((r) => r.name);
  const missing = [];
  let held = 0;
  for (const table of tables) {
    const columns = sql(`SELECT name FROM pragma_table_info('${table}')`).map((r) => r.name);
    if (!columns.some((c) => USER_COLUMNS.has(c)) && table !== "users") continue;
    if (table in NOT_EXPORTED) continue;
    const holds = EXPORTED[table];
    if (!holds) {
      missing.push(`${table}: holds an account's rows, and this check doesn't know where they go in the export`);
      continue;
    }
    let ok = false;
    try {
      ok = holds(exported);
    } catch (error) {
      missing.push(`${table}: ${error.message}`);
      continue;
    }
    if (ok) held++;
    else missing.push(`${table}: its row isn't in the export`);
  }
  assert(!missing.length, missing.join("\n"));
  // Security values stay out.
  const text = JSON.stringify(exported);
  for (const secret of [mark("pushkey"), mark("pushauth"), sha256(who.cookie), sha256(who.token), who.token, who.cookie]) assert(!text.includes(secret), "a security value is in the export");
  return `${held} tables' rows in it; ${Object.keys(NOT_EXPORTED).length} tables out, each with its reason`;
});

await stage("a copyright notice: its pack's owner is told the work it names, a moderator sees the work, only an admin who sent it", async () => {
  const work = mark("work");
  const [sender, contact] = [mark("sendername"), mark("sendercontact")];
  // A fresh pack of someone's, so its first report is this notice.
  const shared = await as(reporter, "POST", "/api/community/share", { pack: fixture("check-nl", `noticed-${run}`, `${run} noticed`), level: "A1", topics: [] });
  assert(shared.status === 200, `share: ${shared.status} ${shared.text.slice(0, 200)}`);
  const id = shared.json.id;
  ids.noticed = id;
  const filed = await as(admin, "POST", `/api/community/items/${id}/report`, { reason: "copyright", details: "x", notice: { name: sender, contact, work, statement: true } });
  assert(filed.status === 200 && filed.json.hidden === true, `the notice: ${filed.status} ${filed.text.slice(0, 200)}`);
  const page = await as(reporter, "GET", `/api/community/items/${id}`);
  assert(page.status === 200 && page.json.item.work === work, `the owner's page: ${page.status}, work ${page.json?.item?.work}`);
  const cases = await as(reporter, "GET", "/api/community/mine/cases");
  assert(cases.json.some((c) => c.id === id && c.work === work), "Yours' case names the work");
  for (const [where, text] of [["the owner's page", page.text], ["the owner's cases", cases.text]]) {
    assert(!text.includes(sender) && !text.includes(contact), `${where} shows who sent it`);
  }
  const stranger = await as(who, "GET", `/api/community/items/${id}`);
  assert(stranger.status === 404, `someone else, on a hidden pack: ${stranger.status}`);
  const asModerator = JSON.stringify(await tool(moderator, "mod_get", { id }));
  assert(asModerator.includes(work) && !asModerator.includes(sender) && !asModerator.includes(contact), "a moderator sees the work and no more");
  const asAdmin = JSON.stringify(await tool(admin, "mod_get", { id }));
  assert(asAdmin.includes(sender) && asAdmin.includes(contact), "an admin sees who sent it");
});

await stage("deleting the account: what's left is what the policy says, without the account on it", async () => {
  const del = await as(who, "DELETE", "/api/me", { confirm: "delete my account" });
  assert(del.status === 200, `delete: ${del.status} ${del.text.slice(0, 300)}`);
  const tables = sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' AND name NOT LIKE '_cf_%'").map((r) => r.name);
  const left = [];
  for (const table of tables) {
    const columns = sql(`SELECT name FROM pragma_table_info('${table}')`).map((r) => r.name).filter((c) => USER_COLUMNS.has(c) || STAFF_COLUMNS.has(c) || c === "id");
    for (const column of columns) {
      if (column === "id" && table !== "users") continue;
      const n = sql(`SELECT COUNT(*) AS n FROM ${table} WHERE "${column}" = ${q(who.id)}`)[0].n;
      if (n) left.push(`${table}.${column}: ${n}`);
    }
  }
  // Its own acts as staff stay, as the log of what moderators did (the policy says so).
  const allowed = new Set(["admin_log.actor_id: 1"]);
  const wrong = left.filter((l) => !allowed.has(l));
  assert(!wrong.length, `still naming the account:\n${wrong.join("\n")}`);
  // What stays, by what the policy says: shared things, reports and notices, none with the account on it.
  const pack = sql(`SELECT owner_id FROM items WHERE id = ${q(ids.mine)}`)[0];
  assert(pack && pack.owner_id === null, "what it shared stays, with no owner");
  const sharedBook = sql(`SELECT owner_id, search FROM shared_books WHERE id = ${q(ids.myBook)}`)[0];
  assert(sharedBook && sharedBook.owner_id === null && !sharedBook.search.includes(mark("name").toLowerCase()), "the book it shared stays, with no owner and its name out of the search text");
  const bookPage = await as(reporter, "GET", `/api/community/books/${ids.myBook}`);
  assert(bookPage.status === 200 && bookPage.json.book.by === "a former member" && !bookPage.text.includes(who.name), `the book's page: ${bookPage.status} ${bookPage.text.slice(0, 200)}`);
  const theirs = sql(`SELECT follows, likes FROM shared_books WHERE id = ${q(ids.theirBook)}`)[0];
  assert(theirs.follows === 0 && theirs.likes === 0, `the book it added still counts it: ${JSON.stringify(theirs)}`);
  const page = await as(reporter, "GET", `/api/community/items/${ids.other}`);
  assert(page.status === 200, "a pack it followed is still there");
  const stays = sql(`SELECT details, reporter_id FROM reports WHERE details = ${q(mark("report"))}`);
  assert(stays.length === 1 && stays[0].reporter_id === null, "a report stays, with no reporter");
  const counter = sql(`SELECT owner_id, contact FROM counter_notices WHERE id = ${q(mark("counterid"))}`)[0];
  assert(counter && counter.owner_id === null && counter.contact.includes(mark("counteremail")), "a counter-notice stays, with the contact written in it");
  assert(!sql(`SELECT 1 FROM requests WHERE id = ${q(mark("requestid"))}`).length, "its requests go");
  assert(!sql(`SELECT 1 FROM grammar_suggestions WHERE id = ${q(mark("grammarid"))}`).length, "its grammar suggestions go");
  const answer = sql(`SELECT by_id FROM request_answers WHERE item_id = ${q(ids.mine)}`)[0];
  assert(answer && answer.by_id === null, "an answer it gave stays, with no one on it");
  const correction = sql(`SELECT author_id FROM corrections WHERE id = ${q(mark("correctionid"))}`)[0];
  assert(correction && correction.author_id === null, "a correction stays, with no author");
  for (const table of ["notes", "pack_devices", "push_subscriptions", "reminders", "push_queue", "looks", "look_history", "themes", "follows", "book_follows", "likes", "sharing_terms", "user_bans"]) {
    const column = "user_id";
    assert(!sql(`SELECT 1 FROM ${table} WHERE ${column} = ${q(who.id)}`).length, `${table} still has its row`);
  }
  const shown = await as(reporter, "GET", `/library/packs/${ids.mine}/${ids.mineVersion}/pack.json`);
  assert(!shown.text.includes(who.name), "its name is in what it shared");
  const listed = await as(reporter, "GET", `/api/community/items?lang=nl&q=${encodeURIComponent(mark("name"))}`);
  assert(!listed.text.includes(who.name), "its name still finds what it shared");
  return `left: ${left.join(", ") || "nothing naming it"}`;
});

await stage("no pictures in what's shared: a pack can't carry one by any field, and what's stored holds none", async () => {
  const sharer = account(`Sharer ${run}`);
  const terms = await as(sharer, "GET", "/api/community/terms");
  await as(sharer, "POST", "/api/community/terms", { version: terms.json.version });
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const attempts = {};
  // A cover is refused by name.
  let n = 0;
  const attempt = async (name, change) => {
    const pack = fixture("check-nl", `pic-${run}-${++n}`, `${run} ${name}`);
    change(pack);
    const r = await as(sharer, "POST", "/api/community/share", { pack, level: "A1", topics: [] });
    const out = { status: r.status };
    if (r.status === 200) {
      const file = await fetch(`${BASE}/library/packs/${r.json.id}/${r.json.version}/pack.json`);
      const stored = await file.text();
      out.stored = file.status;
      out.fileType = file.headers.get("content-type");
      out.dataUrl = stored.includes("data:image");
      out.imageField = /"(image|picture|pictures|cover|photo|audio|clips)"\s*:/.test(stored);
      out.named = [...stored.matchAll(/"picture"\s*:\s*("[^"]*"|[^\s,}]+)/g)].map((m) => m[1]);
      out.otherField = /"(image|pictures|cover|photo|audio|clips)"\s*:/.test(stored);
      out.remote = stored.includes("evil.example");
    } else out.error = (r.json?.errors?.[0]?.message ?? r.json?.error ?? r.text).slice(0, 120);
    attempts[name] = out;
    return out;
  };
  const cover = await attempt("a cover", (p) => (p.cover = '<svg xmlns="http://www.w3.org/2000/svg"/>'));
  assert(cover.status !== 200, "a pack with a cover was shared");
  for (const [name, change] of Object.entries({
    "picture fields on the pack": (p) => Object.assign(p, { image: PNG, picture: PNG, pictures: [PNG], photo: PNG }),
    "picture fields on a sentence": (p) => Object.assign(p.items[0], { image: PNG, picture: PNG, pictures: [PNG] }),
    "recordings on the pack": (p) => Object.assign(p, { audio: { clips: { a: PNG } } }),
  })) {
    const r = await attempt(name, change);
    assert(r.status !== 200 || (!r.dataUrl && !r.imageField), `${name}: stored with it: ${JSON.stringify(r)}`);
  }
  // A lesson's word may point at our own drawing, by its concept id: that's a name, never a picture. Anything else in that field is refused.
  const lessonWith = (picture) => (p) => {
    p.lessons = [{ id: "one", title: "One", words: [{ lemma: "koffie", forms: ["koffie"], means: "coffee", picture }], phrases: [], items: [p.items[0].id] }];
  };
  const named = await attempt("a lesson word naming one of our drawings", lessonWith("coffee"));
  assert(named.status === 200, `a concept id was refused: ${JSON.stringify(named)}`);
  assert(JSON.stringify(named.named) === JSON.stringify(['"coffee"']) && !named.dataUrl && !named.otherField && !named.remote, `stored as: ${JSON.stringify(named)}`);
  for (const [name, picture] of Object.entries({
    "a data: picture": PNG,
    "an address": "https://evil.example/a.png",
    "a path of ours": "/pictures/coffee.svg",
    "a file name": "coffee.svg",
    "a way out": "../coffee",
    "markup": '<svg xmlns="http://www.w3.org/2000/svg"/>',
    "capitals": "Coffee",
    "too long a name": "x".repeat(49),
    "a list": ["coffee"],
    "an object": { src: PNG },
  })) {
    const r = await attempt(`a lesson word's picture as ${name}`, lessonWith(picture));
    assert(r.status !== 200, `${name} was shared: ${JSON.stringify(r)}`);
  }
  writeFileSync(join(OUT, "no-pictures.json"), JSON.stringify(attempts, null, 1));
  // Nothing but a pack can be shared at all, and the database says so.
  const kinds = sql("SELECT sql FROM sqlite_master WHERE name = 'items'")[0].sql;
  assert(/kind TEXT NOT NULL CHECK \(kind IN \('pack'\)\)/.test(kinds), `items.kind: ${kinds.slice(0, 200)}`);
  // A non-pack upload shared over MCP.
  return attempts;
});

const hosts = new Set();
await stage("in Chrome: markup in what's shared shows as text and draws nothing; the tabs load nothing from another site; Translate's words stay out of every URL", async () => {
  const viewer = account(`Viewer ${run}`);
  const sharer = account(`Marked ${run}`);
  const terms = await as(sharer, "GET", "/api/community/terms");
  await as(sharer, "POST", "/api/community/terms", { version: terms.json.version });
  const IMG = `<img src="https://evil.example/${run}.png" onerror="window.__drew=1">`;
  const pack = fixture("check-nl", `marked-${run}`, `${run} marked`);
  pack.name = `Marked pack ${run}`;
  pack.about = `A pack about ![a picture](https://evil.example/${run}.png) and ${IMG}`;
  pack.items[0].means = `The girl plays ${IMG} with a ball.`;
  const shared = await as(sharer, "POST", "/api/community/share", { pack, level: "A1", topics: [] });
  assert(shared.status === 200, `share with markup: ${shared.status} ${shared.text.slice(0, 300)}`);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addCookies([{ name: "lc_session", value: viewer.cookie, url: BASE, httpOnly: true, secure: false, sameSite: "Lax" }]);
    const page = await context.newPage();
    const requests = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol.startsWith("http")) {
        hosts.add(url.host);
        requests.push({ url: request.url(), method: request.method(), body: request.postData() });
      }
    });
    const problems = [];
    page.on("pageerror", (e) => problems.push(e.message));
    const open = async (hash, settle = 600) => {
      await page.goto(`${BASE}/app/#${hash}`);
      await page.waitForFunction(() => document.querySelector('[data-part="page"]') || document.querySelector("main"), null, { timeout: 15_000 });
      await page.waitForTimeout(settle);
    };
    await open(`explore/item/${shared.json.id}`, 1500);
    const body = await page.evaluate(() => document.body.innerText);
    assert(body.includes(`Marked pack ${run}`), `the shared pack's page didn't show: ${body.slice(0, 200)}`);
    // What it's about is a press away on the pack's page: open it, as a reader would, so its markup is on the screen.
    await page.locator('.lx-quiet-more[data-more="about"] > summary').click();
    await page.locator(".lx-explore-about").waitFor({ timeout: 10_000 });
    await page.waitForTimeout(500);
    const about = await page.locator(".lx-explore-about").innerText();
    assert(about.includes("![a picture]"), `the markdown isn't shown as words: ${about}`);
    assert(about.includes("<img"), `the tag isn't shown as words: ${about}`);
    const drew = await page.evaluate(() => ({ flag: window.__drew === 1, images: [...document.querySelectorAll("img")].filter((i) => /evil\.example/.test(i.src)).length }));
    assert(!drew.flag && !drew.images, `it drew a picture: ${JSON.stringify(drew)}`);
    assert(!requests.some((r) => r.url.includes("evil.example")), "it asked for the picture");
    await page.screenshot({ path: join(OUT, "shared-markup-as-text.png") });
    for (const hash of ["today", "study", "read", "know", "explore", "settings", "settings/data", "settings/about", "settings/account", "settings/reminders"]) await open(hash);
    const typed = `geheimwoord${run}`;
    await open("today/translate");
    const field = page.locator('input[type="search"], input[type="text"], textarea').first();
    await field.waitFor({ timeout: 10_000 });
    await field.fill(typed);
    const asked = await page.waitForResponse((r) => new URL(r.url()).pathname === "/api/translate", { timeout: 15_000 });
    assert(asked.request().method() === "POST", `Translate asked with ${asked.request().method()}`);
    assert((asked.request().postData() ?? "").includes(typed), "what's typed isn't in the body");
    assert(!requests.some((r) => r.url.includes(typed)), `what's typed is in a URL: ${requests.find((r) => r.url.includes(typed))?.url}`);
    await page.waitForTimeout(500);
    const server = SERVER_LOG && existsSync(SERVER_LOG) ? readFileSync(SERVER_LOG, "utf8") : null;
    assert(server === null || (server.includes("/api/translate") && !server.includes(typed)), "what's typed is in the server's log");
    const origin = new URL(BASE).host;
    assert(hosts.size === 1 && hosts.has(origin), `loaded from elsewhere: ${[...hosts].join(", ")}`);
    assert(!problems.length, problems.slice(0, 3).join(" | "));
    return `${requests.length} requests, one host; Translate POSTed what was typed${server ? ", and the server's log hasn't got it" : ""}`;
  } finally {
    await browser.close();
  }
});

await stage("a pack made on a device is kept with the account's copy (and so in the export) and nowhere else on the server with no AI; once it's shared, or an AI is connected, a copy for it goes up too", async () => {
  const who = account(`Deck owner ${run}`);
  // An account with a personal token counts as having an AI connected: this one has no AI.
  sql(`DELETE FROM api_tokens WHERE user_id = ${q(who.id)}`);
  const copies = () => sql(`SELECT pack_id FROM pack_copies WHERE user_id = ${q(who.id)} AND pack IS NOT NULL`).map((row) => row.pack_id);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addCookies([{ name: "lc_session", value: who.cookie, url: BASE, httpOnly: true, secure: false, sameSite: "Lax" }]);
    const page = await context.newPage();
    const puts = [];
    page.on("request", (request) => {
      if (request.method() === "PUT" && new URL(request.url()).pathname.startsWith("/api/packs/copies/")) puts.push(new URL(request.url()).pathname);
    });
    await page.goto(`${BASE}/app/`);
    await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
    const made = (id) => ({ format: "lexicommons-pack", version: 2, id, name: `Deck ${id}`, language: "nl", from: "en", topics: {}, words: {}, chunks: {}, patterns: {}, items: [{ id: "n1", text: `${mark("front")} ${id}`, means: "the house" }, { id: "n2", text: "de hond", means: "the dog" }] });
    const save = (pack) => page.evaluate(async (value) => {
      const { savePack } = await import("/js/study/packs.js");
      const { checkPackInbox } = await import("/js/study/pack-inbox.js");
      const saved = await savePack(value, { by: "An Anki deck" });
      await checkPackInbox();
      return saved.ok;
    }, pack);
    const round = () => page.evaluate(async () => (await import("/js/study/pack-inbox.js")).checkPackInbox());
    const firstId = `deck-${run}-a`.toLowerCase();
    const secondId = `deck-${run}-b`.toLowerCase();
    assert(await save(made(firstId)), "the deck wasn't saved");
    await round();
    assert(puts.length === 0, `a copy went up with no AI: ${puts}`);
    assert(copies().length === 0, `the server holds a copy: ${copies()}`);
    // Edited, it still stays: a change to a pack that isn't on the account is the device's alone.
    const edited = await page.evaluate(async (id) => {
      const { yourPack } = await import("/js/study/packs.js");
      const { changePack, checkPackInbox } = await import("/js/study/pack-inbox.js");
      const item = yourPack(id).pack.items[0];
      const result = await changePack(id, { kind: "update", items: [{ ...item, means: `${item.means} edited` }] }, "changed it");
      await checkPackInbox();
      return result.ok;
    }, firstId);
    assert(edited, "the edit wasn't saved");
    assert(puts.length === 0, `an edit sent a copy up with no AI: ${puts}`);
    assert(copies().length === 0, `after an edit, the server holds a copy: ${copies()}`);
    // Kept with the account's own copy, so it reaches the learner's other devices (12 Nov 2026; privacy.html "Your progress and your
    // packs"): its words in the export there, a file of its own, and nowhere else the server keeps.
    await page.evaluate(async () => (await import("/js/sync.js")).syncNow());
    const exported = await as(who, "GET", "/api/me/export");
    const { progressCopy = [], ...rest } = exported.json ?? {};
    assert(progressCopy.some((file) => file.name.startsWith(`lexicommons-packs.${firstId}.`) && file.text?.includes(mark("front"))), `its words aren't in the account's copy: ${progressCopy.map((file) => file.name).join(", ")}`);
    assert(!JSON.stringify(rest).includes(mark("front")), "its words are on the server outside the account's copy");
    // Shared: it's public anyway, and a fix the author accepts needs the copy to reach them.
    await page.evaluate(async (id) => (await import("/js/study/packs.js")).yourPack(id) && true, firstId);
    const pack = await page.evaluate(async (id) => (await import("/js/study/packs.js")).yourPack(id).pack, firstId);
    const shared = await page.evaluate(async (value) => {
      const terms = await fetch("/api/community/terms").then((response) => response.json());
      await fetch("/api/community/terms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: terms.version }) });
      const response = await fetch("/api/community/share", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pack: value, level: "A1", topics: [] }) });
      return { status: response.status, body: await response.json() };
    }, pack);
    assert(shared.status === 200 && shared.body.shared, `the share: ${JSON.stringify(shared).slice(0, 300)}`);
    await page.evaluate(async (id) => (await import("/js/study/pack-inbox.js")).sharedFromHere(id), firstId);
    assert(copies().includes(firstId), `no copy once it's shared: ${copies()}`);
    // A second one stays until an AI is connected, and then it goes.
    assert(await save(made(secondId)), "the second wasn't saved");
    assert(!copies().includes(secondId), "the second went up with no AI");
    await page.evaluate(async () => {
      const { setAiConnected } = await import("/js/shell/layout.js");
      setAiConnected(true);
      await (await import("/js/study/pack-inbox.js")).checkPackInbox();
    });
    assert(copies().includes(secondId), `no copy once an AI is connected: ${copies()}`);
    // The server said it was shared: a device that didn't do the sharing learns that from its register, not this device's memory.
    assert(puts.length >= 2, `${puts.length} copies sent`);
    return "with no AI, only in the account's copy (its own file, in the export); the shared one's copy once shared; the other's once an AI is connected";
  } finally {
    await browser.close();
  }
});

await stage(PLAN ? "the plan offered: Settings → Email names receipts (the control for the stage that holds a site without it)" : "the plan off: no screen of the app, and nothing over MCP, says payments, a plan, prices, Stripe, a trial, receipts or the in-app AI", async () => {
  const learner = account(`Plain ${run}`);
  const admin = account(`Plain admin ${run}`, { role: "admin" });
  const me = await as(learner, "GET", "/api/me");
  assert(me.status === 200 && me.json.features.plan === PLAN && me.json.plan === (PLAN ? me.json.plan : null), `/api/me: features ${JSON.stringify(me.json?.features)}, plan ${JSON.stringify(me.json?.plan)}`);
  assert(me.json.features.ownKey === false && me.json.features.hostedAi === false, `the in-app AI offered: ${JSON.stringify(me.json.features)}`);
  const ROUTES = ["today", "today/translate", "study", "read", "know", "explore", "ai", "settings", "settings/account", "settings/account/email", "settings/appearance", "settings/appearance/ai", "settings/appearance/themes", "settings/appearance/layout", "settings/study", "settings/study/games", "settings/study/packs", "settings/voice", "settings/language", "settings/translate", "settings/downloads", "settings/storage", "settings/reminders", "settings/streak", "settings/install", "settings/data", "settings/about", "settings/admin", "settings/admin/flags"];
  // An admin's own switches (shell/settings-flags.js) name the plan, rightly: there alone, and only for an admin. A learner opening the same
  // route sees none of it.
  const ADMINS_SWITCHES = "settings/admin/flags";
  const found = [];
  const browser = await chromium.launch();
  let email = "";
  try {
    for (const who of [learner, admin]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await context.addCookies([{ name: "lc_session", value: who.cookie, url: BASE, httpOnly: true, secure: false, sameSite: "Lax" }]);
      const page = await context.newPage();
      // A first open signs in and keeps /api/me on the device (what Settings → Email reads), then each screen in turn.
      await page.goto(`${BASE}/app/#today`);
      await page.waitForFunction(() => localStorage.getItem("lx.me.v1") !== null, null, { timeout: 15_000 });
      for (const hash of ROUTES) {
        await page.goto(`${BASE}/app/#${hash}`);
        await page.waitForFunction(() => document.querySelector('[data-part="page"]') || document.querySelector("main"), null, { timeout: 15_000 });
        await page.waitForTimeout(700);
        const words = await page.evaluate(() => document.body.innerText);
        if (hash === "settings/account/email" && who === learner) email = words;
        if (who === admin && hash === ADMINS_SWITCHES) continue;
        for (const w of planWordsIn(words)) found.push(`${who === admin ? "admin" : "learner"} #${hash}: "${w.word}" in …${w.around}…`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  assert(/For getting back in if you lose your passkey/.test(email), `Settings → Email didn't show: ${email.slice(0, 200)}`);
  if (PLAN) {
    assert(/and for receipts/.test(email), `with the plan offered, Settings → Email doesn't name receipts: ${email.slice(0, 300)}`);
    return "Settings → Email names receipts";
  }
  // MCP, as a learner's AI and an admin's: the server's instructions, every tool and prompt as listed, and every guide a tool hands over.
  for (const who of [learner, admin]) {
    const call = async (method, params) => {
      const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${who.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const text = await response.text();
      const line = text.split("\n").find((l) => l.startsWith("data: "));
      assert(line, `${method}: ${response.status} ${text.slice(0, 200)}`);
      return JSON.parse(line.slice(6));
    };
    const where = who === admin ? "an admin's AI" : "a learner's AI";
    const init = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "privacy-check", version: "1" } });
    for (const w of planWordsIn(init.result?.instructions ?? "")) found.push(`${where}, the instructions: "${w.word}" in …${w.around}…`);
    const tools = (await call("tools/list", {})).result.tools;
    for (const t of tools) for (const w of planWordsIn(JSON.stringify({ title: t.title, description: t.description, input: t.inputSchema }))) found.push(`${where}, ${t.name}: "${w.word}" in …${w.around}…`);
    const prompts = (await call("prompts/list", {})).result?.prompts ?? [];
    for (const pr of prompts) for (const w of planWordsIn(`${pr.title ?? ""} ${pr.description ?? ""}`)) found.push(`${where}, prompt ${pr.name}: "${w.word}" in …${w.around}…`);
    for (const guide of tools.map((t) => t.name).filter((n) => /_guide$|^moderation_policy$/.test(n))) {
      const answer = await call("tools/call", { name: guide, arguments: {} });
      const text = (answer.result?.content ?? []).map((c) => c.text ?? "").join("\n");
      assert(text.length > 100, `${guide}: ${JSON.stringify(answer).slice(0, 200)}`);
      for (const w of planWordsIn(text)) found.push(`${where}, ${guide}: "${w.word}" in …${w.around}…`);
    }
  }
  assert(!found.length, found.slice(0, 12).join("\n"));
  return `${ROUTES.length} screens each as a learner and an admin, and MCP's instructions, tools, prompts and guides: none`;
});

await stage("a GET with the words in its URL is no way to Translate", async () => {
  const viewer = account(`Asker ${run}`);
  const got = await as(viewer, "GET", "/api/translate?q=boek&language=nl");
  assert(got.status !== 200 && !got.text.includes('"words"'), `GET /api/translate: ${got.status}`);
  const posted = await as(viewer, "POST", "/api/translate", { q: "boek", language: "nl" });
  assert(posted.status === 200 && posted.json && "words" in posted.json, `POST /api/translate: ${posted.status} ${posted.text.slice(0, 200)}`);
  assert((posted.status === 200 ? (await as(viewer, "POST", "/api/translate", { q: { toString: null }, language: "nl" })).status : 0) === 400, "something that isn't text");
  return `GET ${got.status}, POST ${posted.status}`;
});

writeFileSync(join(OUT, "privacy-check.json"), JSON.stringify({ results }, null, 1));
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `privacy check: ${failed.length} of ${results.length} stages FAILED` : `privacy check: all ${results.length} stages passed`);
process.exit(failed.length ? 1 : 0);
