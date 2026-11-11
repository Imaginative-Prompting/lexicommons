#!/usr/bin/env node
// Admin and the open library through MCP, end to end, against a LOCAL server and its own state: the admin role (set
// only in D1), who sees the admin tools, the checks on every call, staged uploads, publishing a picture book with its
// help layer and pictures, a woven book, a frequency list, adding a layer to a book already in the library, what's
// refused and why, the shelf's sections, unpublish, history and restore, a catalog changed outside the tools, the
// REST mirror, and an account's staged files going with it. Every file published is a real one from the books
// pipeline (its work folder), and the Worker's catalog entries are compared with the books pipeline's own publish.
//
//   node scripts/admin-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
//        [--work <the books pipeline's work folder>]   (default ../pipelines/books/work; its publish.ts is the one
//        beside it, so a frozen copy of the app checks against the real pipeline when given --work)
//
// The server: npx wrangler dev --port <port> --local-upstream localhost:<port> --persist-to <dir> --var
// GATE_ENABLED:false --var PUBLIC_ORIGIN:http://localhost:<port> --var RP_ID:localhost --var
// UPLOAD_SIGNING_SECRET:<any local value>, after npx wrangler d1 migrations apply lexicommons --local --persist-to <dir>.
// It writes test accounts straight into that state's D1 (and deletes one through the API), so it refuses any
// non-local URL. Sandbox off (wrangler). Exit 0 = every stage passed.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { bookVersion } from "../public/js/read/book-format.js";
import { BUILT_IN } from "../public/js/packs/index.js";
import { localR2 } from "./fixtures/local-r2.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
// Absolute, so files written here are found by commands run from the app's folder (audio-v2.mjs, the books pipeline).
const OUT = outArg && resolve(outArg);
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
const PERSIST = opt("persist-to");
// The buckets through one local R2 in this process (scripts/fixtures/local-r2.mjs), not a wrangler launch per object.
const r2 = PERSIST ? localR2(APP, PERSIST) : null;
const WORK = resolve(opt("work", join(APP, "../pipelines/books/work")));
// The books pipeline's publish step, beside its work folder (not beside this app folder, which may be a frozen copy).
const PUBLISH = join(WORK, "../publish.ts");
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !OUT || !PERSIST) {
  console.error("Usage: admin-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> [--work <books work dir>]\n(it writes test accounts into that state, so only a local server)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const results = [];
const log = [];
async function stage(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - started, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").join("\n        ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const eq = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), `${message}\n  got:  ${JSON.stringify(a)?.slice(0, 600)}\n  want: ${JSON.stringify(b)?.slice(0, 600)}`);

// ---------- the local state: accounts written straight into D1 ----------

const wrangler = (args) => execFileSync("npx", ["wrangler", ...args], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
const sql = (command) => {
  const out = wrangler(["d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command]);
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const q = (value) => (value === null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const run = randomBytes(3).toString("hex");
function account(name, { admin = false } = {}) {
  const id = `chk${run}${randomBytes(5).toString("hex")}`;
  const now = Date.now();
  const cookie = randomBytes(24).toString("base64url");
  const statements = [
    `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now})`,
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'admin-check')`,
  ];
  const tokens = {};
  for (const [label, tokenAdmin] of [["plain", 0], ...(admin ? [["admin", 1]] : [])]) {
    const token = `lct_${randomBytes(24).toString("base64url")}`;
    tokens[label] = token;
    statements.push(`INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, ${q(`check ${label}`)}, ${q(sha256(token))}, ${q(token.slice(0, 10))}, ${now}, ${tokenAdmin})`);
  }
  if (admin) statements.push(`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, 'admin', ${now}, 'd1', 'admin-check')`);
  sql(statements.join("; "));
  return { id, name, cookie, tokens };
}

// ---------- calling the server ----------

async function rpc(token, method, params) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status} ${text.slice(0, 300)}`);
  return JSON.parse(line.slice(6));
}
const toolNames = async (token) => (await rpc(token, "tools/list", {})).result.tools.map((t) => t.name);
/** A tool call: its parsed JSON, or { error } with the message when it failed (as a tool error or a protocol one). */
async function tool(token, name, args = {}) {
  const { result, error } = await rpc(token, "tools/call", { name, arguments: args });
  const entry = { tool: name, args, ...(error ? { error: error.message } : result.isError ? { error: result.content[0].text } : {}) };
  log.push(entry);
  if (error) return { error: error.message };
  if (result.isError) return { error: result.content[0].text };
  const text = result.content[0].text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
async function must(token, name, args) {
  const value = await tool(token, name, args);
  if (value?.error) throw new Error(`${name}: ${value.error}`);
  return value;
}
async function rest(token, method, path, body) {
  const response = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}
async function app(who, method, path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: `lc_session=${who.cookie}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}
const catalogue = async () => (await fetch(`${BASE}/library/catalogue.json`, { cache: "no-store" })).json();
const libraryStatus = async (url) => (await fetch(`${BASE}${url}`)).status;

// ---------- the files, from the books pipeline's work folder ----------

const RODE = join(WORK, "storyweaver-137265-de-rode-regenjas");
const RODE_BOOK = join(RODE, "book", readdirSync(join(RODE, "book")).find((f) => f.endsWith(".json")));
const RODE_LAYER = join(RODE, "runs/help-en-2-settled", readdirSync(join(RODE, "runs/help-en-2-settled")).find((f) => /^weave\.en\.[0-9a-f]{12}\.json$/.test(f)));
const RODE_GLOSSARY = join(RODE, "glossary.en.json");
const ALICE = join(WORK, "carroll-alice-wonderland");
const ALICE_BOOK = join(ALICE, "book/carroll-alice-wonderland-opening.d6dba2b5a24f054f.json");
const ALICE_LAYER = join(ALICE, "runs/pilot-nl-5/settled/weave.nl.eadf6e578bf6.json");
const ALICE_GLOSSARY = join(ALICE, "glossary.nl.json");
const FIXTURE = join(WORK, "fixture-regenmiddag");
const FIXTURE_BOOK = join(FIXTURE, "book", readdirSync(join(FIXTURE, "book")).find((f) => f.endsWith(".json")));
const LIST = join(WORK, "frequency", readdirSync(join(WORK, "frequency")).find((f) => /^frequency\.nl\.[0-9a-f]{12}\.json$/.test(f)));

const TYPES = { json: "application/json", jpg: "image/jpeg", png: "image/png", webp: "image/webp", mp3: "audio/mpeg", m4a: "audio/mp4" };
/** A file as library_upload takes it, under the name it gets in the folder the script runs in. */
const declare = (path, name) => {
  const bytes = readFileSync(path);
  return { path, name, type: TYPES[path.split(".").pop()], size: bytes.length, sha256: sha256(bytes) };
};
const json = (path) => JSON.parse(readFileSync(path, "utf8"));

/** Stages files through library_upload and runs the script it gives, from a folder holding them under their names. */
async function stageAll(token, files) {
  const staged = await must(token, "library_upload", { files: files.map(({ name, type, size, sha256 }) => ({ name, type, size, sha256 })) });
  if (staged.script) {
    const dir = mkdtempSync(join(tmpdir(), "admin-check-"));
    for (const f of files) {
      mkdirSync(dirname(join(dir, f.name)), { recursive: true });
      cpSync(f.path, join(dir, f.name));
    }
    writeFileSync(join(dir, "send.sh"), staged.script);
    const output = execFileSync("sh", ["send.sh"], { cwd: dir }).toString();
    rmSync(dir, { recursive: true, force: true });
    const answers = output.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line.replace(/^[^{]*/, "")));
    assert(answers.length === staged.toSend && answers.every((a) => a.ok), `the upload script's answers: ${output.slice(0, 400)}`);
  }
  return staged;
}

const ADMIN_TOOLS = ["admin_guide", "library_get", "library_upload", "library_check", "library_publish", "library_unpublish", "library_history", "library_restore", "library_shelf", "admin_log"];

// ---------- the run ----------

console.log(`admin check: ${BASE}`);
const admin = account("Check admin", { admin: true });
const learner = account("Check learner");
const start = await catalogue();
if (start.books.length || Object.keys(start.lists ?? {}).length) {
  console.error("admin check publishes into the library: start from a fresh state (an empty catalog).");
  process.exit(2);
}

await stage("who sees the admin tools: an admin over an admin-access token; not a learner, not an admin's ordinary token", async () => {
  const [a, plain, l] = await Promise.all([toolNames(admin.tokens.admin), toolNames(admin.tokens.plain), toolNames(learner.tokens.plain)]);
  for (const name of ADMIN_TOOLS) assert(a.includes(name), `the admin's tool list lacks ${name}`);
  for (const name of ADMIN_TOOLS) assert(!plain.includes(name) && !l.includes(name), `${name} is listed for a connection that isn't an admin's`);
  eq((await must(admin.tokens.admin, "whoami")).roles, ["admin"], "whoami's roles over the admin token");
  eq((await must(admin.tokens.plain, "whoami")).roles, [], "whoami's roles over the ordinary token");
  eq((await must(learner.tokens.plain, "whoami")).roles, [], "the learner's roles");
  const instructions = (await rpc(admin.tokens.admin, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "admin-check", version: "1" } })).result.instructions;
  assert(/admin_guide/.test(instructions), "the server's instructions to an admin point at admin_guide");
  const learnerInstructions = (await rpc(learner.tokens.plain, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "admin-check", version: "1" } })).result.instructions;
  assert(!/admin_guide/.test(learnerInstructions), "a learner's instructions don't mention admin tools");
  return { adminTools: a.filter((n) => ADMIN_TOOLS.includes(n)).length, learnerTools: l.length };
});

await stage("a forced call is refused: the tools aren't there for a learner, and the REST mirror answers 403", async () => {
  for (const token of [learner.tokens.plain, admin.tokens.plain]) {
    const forced = await tool(token, "library_get", {});
    assert(forced.error, "library_get worked for a connection that isn't an admin's");
  }
  eq((await rest(learner.tokens.plain, "GET", "/admin/library")).status, 403, "REST for a learner");
  const plain = await rest(admin.tokens.plain, "GET", "/admin/library");
  eq(plain.status, 403, "REST for an admin's token without admin access");
  assert(/without admin access/.test(plain.body.error), `the refusal says why: ${plain.body.error}`);
  eq((await rest(admin.tokens.admin, "GET", "/admin/library")).status, 200, "REST for the admin token");
  eq((await rest(learner.tokens.plain, "POST", "/admin/library/upload", { files: [] })).status, 403, "a learner can't stage");
});

await stage("admin access on a token: offered to an admin (Settings reads roles), refused to anyone else", async () => {
  eq((await app(admin, "GET", "/api/me")).body.roles, ["admin"], "the admin's /api/me");
  eq((await app(learner, "GET", "/api/me")).body.roles, [], "the learner's /api/me");
  const refused = await app(learner, "POST", "/api/tokens", { name: "sneaky", admin: true });
  eq(refused.status, 400, "a learner asking for admin access");
  const made = await app(admin, "POST", "/api/tokens", { name: "my publishing script", admin: true });
  eq(made.status, 200, "the admin making an admin-access token");
  assert(made.body.summary.admin === true, "the token is marked admin");
  assert((await toolNames(made.body.token)).includes("library_publish"), "the new token reaches the admin tools");
  const listed = (await app(admin, "GET", "/api/tokens")).body;
  assert(listed.find((t) => t.name === "my publishing script")?.admin === true && listed.find((t) => t.name === "check plain")?.admin === false, "the token list shows which tokens have admin access");
});

await stage("admin_guide and library_get answer, with the catalog's revision", async () => {
  const guide = await must(admin.tokens.admin, "admin_guide");
  assert(/library_upload/.test(guide) && /rightsProblems/.test(guide) && /library_restore/.test(guide), "the guide covers staging, the checks and undo");
  const got = await must(admin.tokens.admin, "library_get", {});
  assert(Number.isInteger(got.rev) && Array.isArray(got.books), "library_get has rev and books");
  eq(got.books.length, start.books.length, "library_get shows what the catalog holds");
});

const rode = { book: declare(RODE_BOOK, "book.json"), layer: declare(RODE_LAYER, "help.en.json"), glossary: declare(RODE_GLOSSARY, "glossary.en.json") };
const rodePictures = json(RODE_BOOK).pictures.map((p) => declare(join(RODE, "book/pictures", p.file), `pictures/${p.file}`));
let revAfterRode = 0;

await stage("staging checks what arrives: wrong bytes, a wrong size and a bad signature are refused", async () => {
  const staged = await must(admin.tokens.admin, "library_upload", { files: [{ name: "x.json", type: "application/json", size: 7, sha256: sha256("{\"a\":1}") }] });
  const link = staged.files[0].url;
  const put = (url, body, type = "application/json") => fetch(url, { method: "PUT", headers: { "Content-Type": type }, body });
  eq((await put(link, "{\"a\":2}")).status, 400, "other bytes of the same size");
  eq((await put(link, "{\"a\":10}")).status, 413, "more bytes than declared");
  eq((await put(link, "{}")).status, 400, "fewer bytes than declared");
  eq((await put(link, "{\"a\":1}", "text/plain")).status, 415, "the wrong type");
  eq((await put(link.replace(/sig=[0-9a-f]+/, "sig=" + "0".repeat(64)), "{\"a\":1}")).status, 403, "a forged signature");
  eq((await put(link, "{\"a\":1}")).status, 200, "the declared bytes");
  eq((await put(link, "{\"a\":1}")).status, 409, "a link used twice");
  // A chunked body (no Content-Length) past its declared size is cut off as it streams in.
  const big = await must(admin.tokens.admin, "library_upload", { files: [{ name: "big.json", type: "application/json", size: 4, sha256: sha256("[1,2]".slice(0, 4)) }] });
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < 64; i++) controller.enqueue(new Uint8Array(1024 * 1024).fill(32));
      controller.close();
    },
  });
  // The server stops reading at the declared size and answers 413; a client still streaming may see the connection
  // close first instead. Either way nothing may be stored: the row stays pending, with no bytes.
  const chunked = await fetch(big.files[0].url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: stream, duplex: "half" }).then(
    (r) => r.status,
    () => "closed",
  );
  assert(chunked === 413 || chunked === "closed", `a chunked body past its declared size: ${chunked}`);
  eq(sql(`SELECT status, r2_key FROM staged_files WHERE id = ${q(big.files[0].id)}`)[0], { status: "pending", r2_key: null }, "nothing was stored for it");
  const bad = await tool(admin.tokens.admin, "library_upload", { files: [{ name: "../../etc/passwd", type: "application/json", size: 5, sha256: "a".repeat(64) }] });
  assert(bad.error && /letters, digits/.test(bad.error), `a name that climbs out of the folder is refused: ${bad.error}`);
});

await stage("a picture book with its help layer and 10 pictures: staged, checked, published", async () => {
  const files = [rode.book, rode.layer, rode.glossary, ...rodePictures];
  const staged = await stageAll(admin.tokens.admin, files);
  eq(staged.toSend, files.length, "every file needs sending the first time");
  const input = { book: rode.book.sha256, layers: [{ layer: rode.layer.sha256, glossary: rode.glossary.sha256 }] };
  const checked = await must(admin.tokens.admin, "library_check", input);
  assert(checked.ok, `library_check: ${JSON.stringify(checked.problems)}`);
  eq(checked.files.length, 12, "the book, its layer and 10 pictures would be published");
  assert(checked.audits.en?.ok === true, "the help layer's audit holds");
  const before = await catalogue();
  eq(before.books.length, start.books.length, "checking publishes nothing");
  const published = await must(admin.tokens.admin, "library_publish", { ...input, expected_rev: checked.catalogueRev, note: "admin-check: the first picture book" });
  assert(published.published, `library_publish: ${JSON.stringify(published.problems)}`);
  eq(published.files, { written: 12, alreadyThere: 0 }, "files written");
  revAfterRode = published.rev;
  const after = await catalogue();
  const entry = after.books.find((b) => b.id === json(RODE_BOOK).id);
  assert(entry && entry.layers.en?.kind === "help", "the book is on the catalog with its help layer");
  for (const url of [entry.book, entry.layers.en.url, entry.cover]) eq(await libraryStatus(url), 200, `GET ${url}`);
  for (const p of rodePictures) eq(await libraryStatus(`/library/pictures/${p.name.split("/")[1]}`), 200, `picture ${p.name}`);
  return { rev: published.rev, entry: { id: entry.id, version: entry.version, layers: Object.keys(entry.layers), pictures: entry.pictures } };
});

await stage("the Worker's catalog entry is exactly the books pipeline's (publish.ts into its own local state)", async () => {
  const theirs = mkdtempSync(join(tmpdir(), "admin-check-publish-"));
  execFileSync("node", [PUBLISH, "--book", RODE_BOOK, "--pictures", join(RODE, "book/pictures"), "--layer", RODE_LAYER, "--glossary", RODE_GLOSSARY, "--local", "--persist-to", theirs], { cwd: resolve(WORK, "../../.."), stdio: ["ignore", "pipe", "pipe"] });
  const pipelineState = localR2(APP, theirs);
  const pipelineCatalogue = await pipelineState.getText("lexicommons-library", "catalogue.json");
  await pipelineState.close();
  if (pipelineCatalogue === null) throw new Error("The specified key does not exist: lexicommons-library/catalogue.json in the pipeline's state");
  const pipeline = JSON.parse(pipelineCatalogue).books.find((b) => b.id === json(RODE_BOOK).id);
  const worker = (await catalogue()).books.find((b) => b.id === json(RODE_BOOK).id);
  const strip = (entry) => ({ ...entry, publishedAt: undefined });
  eq(strip(worker), strip(pipeline), "the two entries (publishedAt aside)");
  rmSync(theirs, { recursive: true, force: true });
  return { fields: Object.keys(worker).length };
});

await stage("staging the same files again sends nothing: the library has them", async () => {
  const again = await must(admin.tokens.admin, "library_upload", { files: [rode.book, rode.layer, ...rodePictures].map(({ name, type, size, sha256 }) => ({ name, type, size, sha256 })) });
  eq(again.toSend, 0, "files to send");
  eq([...new Set(again.files.map((f) => f.status))], ["in-library"], "every published file is the library's now");
  eq(sql(`SELECT COUNT(*) AS n FROM staged_files WHERE user_id = ${q(admin.id)} AND sha256 IN (${[rode.book, rode.layer, ...rodePictures].map((f) => q(f.sha256)).join(", ")})`)[0].n, 0, "their staged copies are gone");
  eq(sql(`SELECT COUNT(*) AS n FROM staged_files WHERE user_id = ${q(admin.id)} AND sha256 = ${q(rode.glossary.sha256)}`)[0].n, 1, "the glossary (not published) stays staged");
});

const alice = { book: declare(ALICE_BOOK, "alice.json"), layer: declare(ALICE_LAYER, "weave.nl.json"), glossary: declare(ALICE_GLOSSARY, "glossary.nl.json") };

await stage("a woven book in two steps: the book alone, then its Dutch layer added by <id>@<version>", async () => {
  await stageAll(admin.tokens.admin, [alice.book, alice.layer, alice.glossary]);
  const first = await must(admin.tokens.admin, "library_publish", { book: alice.book.sha256 });
  assert(first.published, `the book alone: ${JSON.stringify(first.problems)}`);
  const book = json(ALICE_BOOK);
  eq(Object.keys((await catalogue()).books.find((b) => b.id === book.id).layers), [], "no layers yet");
  const second = await must(admin.tokens.admin, "library_publish", { book: `${book.id}@${book.version}`, layers: [{ layer: alice.layer.sha256, glossary: alice.glossary.sha256 }] });
  assert(second.published, `the layer: ${JSON.stringify(second.problems)}`);
  eq(second.files, { written: 1, alreadyThere: 0 }, "only the layer is written (the book is already there)");
  const entry = (await catalogue()).books.find((b) => b.id === book.id);
  eq(entry.layers.nl?.sentences, json(ALICE_LAYER).sentences.length, "the nl layer's sentences");
  eq(await libraryStatus(entry.layers.nl.url), 200, "the layer is served");
});

await stage("refused, each with its reason: rights, a broken layer, a missing picture, a stale revision, two kinds at once", async () => {
  const fixture = declare(FIXTURE_BOOK, "fixture.json");
  await stageAll(admin.tokens.admin, [fixture]);
  const rights = await must(admin.tokens.admin, "library_check", { book: fixture.sha256 });
  assert(!rights.ok && rights.problems.some((p) => p.at === "book.rights" && /public domain/.test(p.message)), `rights: ${JSON.stringify(rights.problems)}`);
  const broken = json(ALICE_LAYER);
  broken.sentences[2].t.pop();
  const brokenPath = join(OUT, "broken-layer.json");
  writeFileSync(brokenPath, JSON.stringify(broken));
  const brokenFile = declare(brokenPath, "broken.json");
  await stageAll(admin.tokens.admin, [brokenFile]);
  const book = json(ALICE_BOOK);
  const layer = await must(admin.tokens.admin, "library_check", { book: `${book.id}@${book.version}`, layers: [{ layer: brokenFile.sha256, glossary: alice.glossary.sha256 }] });
  assert(!layer.ok && layer.problems.some((p) => /exactly one \[target, lemma\] per word/.test(p.message)), `a broken layer: ${JSON.stringify(layer.problems)}`);
  // A picture book whose pictures were never staged (a copy of the book naming a picture nobody has).
  const lonely = json(RODE_BOOK);
  lonely.pictures[0] = { ...lonely.pictures[0], file: "0123456789abcdef.jpg" };
  lonely.version = await bookVersion(lonely);
  const lonelyPath = join(OUT, "lonely-book.json");
  writeFileSync(lonelyPath, JSON.stringify(lonely));
  const lonelyFile = declare(lonelyPath, "lonely.json");
  await stageAll(admin.tokens.admin, [lonelyFile]);
  const missing = await must(admin.tokens.admin, "library_check", { book: lonelyFile.sha256 });
  assert(!missing.ok && missing.problems.length === 1 && missing.problems[0].at === "book.pictures[0]" && /0123456789abcdef\.jpg isn't staged or in the library/.test(missing.problems[0].message), `a book with a picture nobody has: ${JSON.stringify(missing.problems)}`);
  // The picture book with only its title changed: the same version (a version hashes words and structure), so the
  // same key, which already holds the published bytes.
  const retitled = json(RODE_BOOK);
  retitled.title = "De rode regenjas (a new title)";
  const retitledPath = join(OUT, "retitled-book.json");
  writeFileSync(retitledPath, JSON.stringify(retitled));
  const retitledFile = declare(retitledPath, "retitled.json");
  await stageAll(admin.tokens.admin, [retitledFile]);
  const changed = await must(admin.tokens.admin, "library_check", { book: retitledFile.sha256 });
  assert(!changed.ok && /already in the library with different bytes, and a published file is never changed\. A book's version/.test(changed.problems[0]?.message), `a book changed only in its title: ${JSON.stringify(changed.problems)}`);
  const refusedPublish = await must(admin.tokens.admin, "library_publish", { book: retitledFile.sha256 });
  assert(!refusedPublish.published, "and library_publish refuses it too");
  eq((await catalogue()).books.find((b) => b.id === retitled.id).title, json(RODE_BOOK).title, "the shelf keeps the published title");
  const stale = await tool(admin.tokens.admin, "library_publish", { book: alice.book.sha256, expected_rev: 1 });
  assert(stale.error && /revision/.test(stale.error), `a stale expected_rev: ${stale.error}`);
  const both = await must(admin.tokens.admin, "library_check", { book: alice.book.sha256, list: alice.book.sha256 });
  assert(!both.ok && /one thing at a time/.test(both.problems[0].message), "a book and a list at once");
  // An older version of a library book (its files are there) can't replace the one on the shelf by reference.
  // (A version hashes the words and structure, so it differs in one word.)
  const older = { ...json(ALICE_BOOK), words: [...json(ALICE_BOOK).words] };
  const at = older.words.findIndex((w) => /^[a-z]+$/.test(w));
  older.words[at] = `${older.words[at]}s`;
  older.version = await bookVersion(older);
  assert(older.version !== json(ALICE_BOOK).version, "the older cut has its own version");
  const olderPath = join(OUT, "older-book.json");
  writeFileSync(olderPath, JSON.stringify(older));
  await r2.put("lexicommons-library", `books/${older.id}/${older.version}/book.json`, readFileSync(olderPath), "application/json");
  const byRef = await must(admin.tokens.admin, "library_check", { book: `${older.id}@${older.version}` });
  assert(!byRef.ok && /is at version .* on the shelf, not/.test(byRef.problems[0]?.message), `an older version by reference: ${JSON.stringify(byRef.problems)}`);
  const unstaged = await must(admin.tokens.admin, "library_check", { book: "f".repeat(64) });
  assert(!unstaged.ok && /no staged file/.test(unstaged.problems[0].message), "a sha256 nobody staged");
  return { rights: rights.problems[0].message, missingPicture: missing.problems[0].message };
});

await stage("a frequency list: published, and a smaller one refused", async () => {
  const list = declare(LIST, "frequency.nl.json");
  await stageAll(admin.tokens.admin, [list]);
  const published = await must(admin.tokens.admin, "library_publish", { list: list.sha256 });
  assert(published.published, `the list: ${JSON.stringify(published.problems)}`);
  const entry = (await catalogue()).lists.frequency.nl;
  eq(entry.lemmas, json(LIST).lemmas.length, "the list's lemmas on the catalog");
  eq(await libraryStatus(entry.url), 200, "the list is served");
  const small = json(LIST);
  small.lemmas = small.lemmas.slice(0, 100);
  const smallPath = join(OUT, "small-list.json");
  writeFileSync(smallPath, JSON.stringify(small));
  const smallFile = declare(smallPath, "small.json");
  await stageAll(admin.tokens.admin, [smallFile]);
  const refused = await must(admin.tokens.admin, "library_check", { list: smallFile.sha256 });
  assert(!refused.ok, "a list with fewer lemmas than the live one");
  return { refused: refused.problems.map((p) => p.message) };
});

await stage("a default pack (the built-in starter): published, its file its version, listed in Explore as the library's; the same again refused", async () => {
  const starter = BUILT_IN[0];
  const path = join(OUT, "starter.json");
  writeFileSync(path, JSON.stringify(starter));
  const file = declare(path, "starter.json");
  await stageAll(admin.tokens.admin, [file]);
  const checked = await must(admin.tokens.admin, "library_check", { pack: file.sha256 });
  assert(checked.ok, `library_check: ${JSON.stringify(checked.problems)}`);
  const published = await must(admin.tokens.admin, "library_publish", { pack: file.sha256, note: "admin-check: the starter, from the library" });
  assert(published.published, `library_publish: ${JSON.stringify(published.problems)}`);
  const ref = (await catalogue()).packs?.[starter.language]?.find((p) => p.id === starter.id);
  assert(ref && /^[0-9a-f]{12}$/.test(ref.version) && ref.url === `/library/packs/${starter.id}/${ref.version}/pack.json`, `the catalog's entry: ${JSON.stringify(ref)}`);
  const text = await (await fetch(`${BASE}${ref.url}`)).text();
  eq(sha256(text).slice(0, 12), ref.version, "the file served hashes to its version (the device refuses one that doesn't)");
  const listed = (await app(admin, "GET", `/api/community/items?lang=${starter.language}`)).body.items.find((i) => i.id === starter.id);
  assert(listed && listed.by === "Lexicommons" && listed.curated && listed.version === ref.version, `Explore lists it as the library's: ${JSON.stringify(listed)}`);
  await stageAll(admin.tokens.admin, [file]);
  const again = await must(admin.tokens.admin, "library_check", { pack: file.sha256 });
  assert(!again.ok && /already the default/.test(again.problems[0].message), `the same version again: ${JSON.stringify(again.problems)}`);
  return { pack: `${starter.id}@${ref.version}`, sentences: starter.items.length };
});

await stage("a default pack's new version that drops a sentence needs confirm_removed; Explore follows it; unpublish and restore it", async () => {
  const starter = structuredClone(BUILT_IN[0]);
  const dropped = starter.items.pop().id;
  const path = join(OUT, "starter-fewer.json");
  writeFileSync(path, JSON.stringify(starter));
  const file = declare(path, "starter-fewer.json");
  await stageAll(admin.tokens.admin, [file]);
  const refused = await must(admin.tokens.admin, "library_check", { pack: file.sha256 });
  assert(!refused.ok && refused.problems.some((p) => p.message.includes(dropped) && /confirm_removed/.test(p.message)), `without confirm_removed: ${JSON.stringify(refused.problems)}`);
  const published = await must(admin.tokens.admin, "library_publish", { pack: file.sha256, confirm_removed: true });
  assert(published.published && published.what.changes.removed.includes(dropped), `with it: ${JSON.stringify(published).slice(0, 300)}`);
  const page = (await app(admin, "GET", `/api/community/items/${starter.id}`)).body;
  eq(page.versions.length, 2, "Explore has both versions");
  eq(page.item.version, (await catalogue()).packs[starter.language].find((p) => p.id === starter.id).version, "and shows the catalog's");
  const off = await must(admin.tokens.admin, "library_unpublish", { pack: starter.id, lang: starter.language });
  assert(!(await catalogue()).packs[starter.language].some((p) => p.id === starter.id), "off the catalog");
  assert(!(await app(admin, "GET", `/api/community/items?lang=${starter.language}`)).body.items.some((i) => i.id === starter.id), "and out of Explore's lists");
  await must(admin.tokens.admin, "library_restore", { rev: off.restoreWith.rev });
  assert((await app(admin, "GET", `/api/community/items?lang=${starter.language}`)).body.items.some((i) => i.id === starter.id), "a restore puts it back in Explore too");
});

// ---------- a default pack's recorded audio (study/pack-audio.js) ----------

// The starter's recordings as the library takes them (scripts/packs/audio-v2.mjs), with their license and credit, and
// once without (refused). The catalog's starter is the full one again first: its audio reads every sentence.
const AUDIO_TERMS = ["--license", "CC BY 4.0", "--credit", "{name}, a synthetic voice made with ElevenLabs for Lexicommons"];
// Each set under its own folder name, as library_upload's script sends them from one folder.
function audioFiles(name, terms) {
  const dir = join(OUT, name);
  execFileSync("node", ["scripts/packs/audio-v2.mjs", "public/audio/starter-word-order", "--pack", "public/js/packs/starter-word-order.js", "--out", dir, ...terms], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
  return { manifest: declare(join(dir, "manifest.json"), `${name}/manifest.json`), clips: readdirSync(join(dir, "clips")).map((clip) => declare(join(dir, "clips", clip), `${name}/clips/${clip}`)) };
}
let audioRef;
await stage("a default pack's recordings: refused without each voice's license and credit, with clips missing, or with a clip that isn't audio; then published", async () => {
  const starter = BUILT_IN[0];
  const full = join(OUT, "starter-again.json");
  writeFileSync(full, JSON.stringify(starter));
  const fullFile = declare(full, "starter-again.json");
  await stageAll(admin.tokens.admin, [fullFile]);
  assert((await must(admin.tokens.admin, "library_publish", { pack: fullFile.sha256 })).published, "the full starter on the catalog again");
  const bare = audioFiles("audio-unlicensed", []);
  const licensed = audioFiles("audio", AUDIO_TERMS);
  await stageAll(admin.tokens.admin, [bare.manifest, licensed.manifest]);
  const unlicensed = await must(admin.tokens.admin, "library_check", { audio: { pack: starter.id, manifest: bare.manifest.sha256 } });
  assert(!unlicensed.ok && unlicensed.problems.some((p) => /license/.test(p.message)) && unlicensed.problems.some((p) => /credit/.test(p.message)), `without license and credit: ${JSON.stringify(unlicensed.problems).slice(0, 400)}`);
  const noClips = await must(admin.tokens.admin, "library_check", { audio: { pack: starter.id, manifest: licensed.manifest.sha256 } });
  assert(!noClips.ok && noClips.problems.some((p) => /82 clips aren't staged or in the library/.test(p.message)), `its clips not staged: ${JSON.stringify(noClips.problems).slice(0, 400)}`);
  // A "recording" that isn't one, though it starts like one (an ID3 tag): refused when it arrives.
  const fake = join(OUT, "not-a-recording.mp3");
  writeFileSync(fake, "ID3 and then plain text, not an MP3.");
  const fakeFile = declare(fake, "not-a-recording.mp3");
  const link = await must(admin.tokens.admin, "library_upload", { files: [{ name: fakeFile.name, type: fakeFile.type, size: fakeFile.size, sha256: fakeFile.sha256 }] });
  const url = link.files[0].url;
  const sent = await fetch(url, { method: "PUT", headers: { "Content-Type": "audio/mpeg" }, body: readFileSync(fake) });
  assert(sent.status === 415 && /aren't an MP3/.test(await sent.text()), `text sent as an MP3: ${sent.status}`);
  // A manifest with an object where a voice's locale belongs: a problem, not an error.
  const odd = JSON.parse(readFileSync(licensed.manifest.path, "utf8"));
  odd.voices.emma.locale = { toString: null };
  const oddPath = join(OUT, "audio-odd-manifest.json");
  writeFileSync(oddPath, JSON.stringify(odd));
  const oddFile = declare(oddPath, "audio-odd-manifest.json");
  await stageAll(admin.tokens.admin, [oddFile]);
  const oddCheck = await rest(admin.tokens.admin, "POST", "/admin/library/check", { audio: { pack: starter.id, manifest: oddFile.sha256 } });
  assert(oddCheck.status === 200 && oddCheck.body.ok === false && oddCheck.body.problems.length, `a malformed manifest over REST: ${oddCheck.status} ${JSON.stringify(oddCheck.body).slice(0, 300)}`);
  await stageAll(admin.tokens.admin, licensed.clips);
  const ok = await must(admin.tokens.admin, "library_check", { audio: { pack: starter.id, manifest: licensed.manifest.sha256 } });
  assert(ok.ok, `with its clips: ${JSON.stringify(ok.problems).slice(0, 400)}`);
  const published = await must(admin.tokens.admin, "library_publish", { audio: { pack: starter.id, manifest: licensed.manifest.sha256 }, note: "admin-check: the starter's recordings" });
  assert(published.published && published.what.clips === 82 && published.files.written === 83, `published: ${JSON.stringify(published).slice(0, 400)}`);
  eq(Object.values(published.what.voices).map((v) => [v.name, v.license, v.credit]), [["Emma", "CC BY 4.0", "Emma, a synthetic voice made with ElevenLabs for Lexicommons"], ["Ido", "CC BY 4.0", "Ido, a synthetic voice made with ElevenLabs for Lexicommons"]], "each voice with its terms");
  audioRef = (await catalogue()).packs[starter.language].find((p) => p.id === starter.id);
  assert(/^\/library\/packs\/[a-z0-9-]+\/[0-9a-f]{12}\/audio\.[0-9a-f]{12}\.json$/.test(audioRef.audio ?? ""), `the entry names it: ${JSON.stringify(audioRef)}`);
  return { audio: audioRef.audio, clips: 82 };
});

await stage("the recordings published: served (a clip in byte ranges), Explore says recorded and credits each voice, a follow carries them, the same again changes nothing", async () => {
  const starter = BUILT_IN[0];
  const manifest = await fetch(`${BASE}${audioRef.audio}`);
  eq([manifest.status, (await manifest.json()).format], [200, "lexicommons-audio"], "the manifest");
  const clip = Object.values(JSON.parse(readFileSync(join(OUT, "audio/manifest.json"), "utf8")).voices.emma.items)[0].clip;
  const whole = await fetch(`${BASE}/library/audio/${clip}`);
  eq([whole.status, whole.headers.get("content-type")], [200, "audio/mpeg"], "a clip");
  eq((await fetch(`${BASE}/library/audio/${clip}`, { headers: { Range: "bytes=0-99" } })).status, 206, "in a byte range");
  const page = (await app(admin, "GET", `/api/community/items/${starter.id}`)).body;
  assert(page.item.badges.audio === true, `Explore's badge: ${JSON.stringify(page.item.badges)}`);
  eq(page.item.recordings, [
    { name: "Emma", credit: "Emma, a synthetic voice made with ElevenLabs for Lexicommons", license: "CC BY 4.0" },
    { name: "Ido", credit: "Ido, a synthetic voice made with ElevenLabs for Lexicommons", license: "CC BY 4.0" },
  ], "each voice credited on the pack's page");
  const ref = (await app(learner, "POST", `/api/community/items/${starter.id}/follow`)).body;
  eq(ref.audio, audioRef.audio, "a follow's ref carries the recordings");
  eq((await app(learner, "GET", "/api/community/following")).body.find((r) => r.id === starter.id)?.audio, audioRef.audio, "and the following list");
  // Its staged manifest went with the publish; staged again, the same manifest has nothing to publish.
  const manifestAgain = declare(join(OUT, "audio/manifest.json"), "audio/manifest.json");
  await stageAll(admin.tokens.admin, [manifestAgain]);
  const again = await must(admin.tokens.admin, "library_check", { audio: { pack: starter.id, manifest: manifestAgain.sha256 } });
  assert(!again.ok && again.problems.some((p) => /already has this audio/.test(p.message)), `the same again: ${JSON.stringify(again.problems)}`);
  const clips = readdirSync(join(OUT, "audio/clips")).map((name) => declare(join(OUT, "audio/clips", name), `audio/clips/${name}`));
  const restage = await must(admin.tokens.admin, "library_upload", { files: clips.map(({ name, type, size, sha256 }) => ({ name, type, size, sha256 })) });
  eq([restage.toSend, restage.files.every((f) => f.status === "in-library")], [0, true], "staging its clips again sends nothing: the library has them");
});

await stage("the recordings off and back: unpublish takes them off the entry (the pack stays, the files stay), restore puts them back; a new version goes out with the recordings of every sentence it keeps word for word, in the same change, and the check names the one it dropped", async () => {
  const starter = BUILT_IN[0];
  const inherited = await rest(admin.tokens.admin, "POST", "/admin/library/unpublish", { audio: starter.id, lang: "__proto__" });
  eq(inherited.status, 400, `a language the catalog doesn't have (an inherited name) is refused, not an error: ${JSON.stringify(inherited.body)}`);
  // A code with a script (zh-Hant: lang/index.js LANGUAGE_CODE) is taken and reaches the catalog, which has nothing of it.
  const hant = await tool(admin.tokens.admin, "library_unpublish", { audio: "starter-zh-hant", lang: "zh-Hant" });
  assert(/There's no default zh-Hant pack "starter-zh-hant" on the catalog/.test(hant.error ?? ""), `zh-Hant taken, nothing of it on the catalog: ${JSON.stringify(hant)}`);
  const off = await must(admin.tokens.admin, "library_unpublish", { audio: starter.id, lang: starter.language });
  const entry = (await catalogue()).packs[starter.language].find((p) => p.id === starter.id);
  assert(entry && !("audio" in entry) && entry.version === audioRef.version, `the pack stays, without recordings: ${JSON.stringify(entry)}`);
  eq((await fetch(`${BASE}${audioRef.audio}`)).status, 200, "the manifest is still served (devices that have it keep it)");
  assert(!(await app(admin, "GET", `/api/community/items/${starter.id}`)).body.item.badges.audio, "Explore no longer says recorded");
  await must(admin.tokens.admin, "library_restore", { rev: off.restoreWith.rev });
  eq((await catalogue()).packs[starter.language].find((p) => p.id === starter.id).audio, audioRef.audio, "restored");
  assert((await app(admin, "GET", `/api/community/items/${starter.id}`)).body.item.badges.audio === true, "and Explore says so again");
  const fewer = declare(join(OUT, "starter-fewer.json"), "starter-fewer.json");
  await stageAll(admin.tokens.admin, [fewer]);
  const dropped = starter.items.at(-1).id;
  const said = await must(admin.tokens.admin, "library_check", { pack: fewer.sha256, confirm_removed: true });
  assert(said.notes.some((n) => /^Warning, audio: 1 recorded sentence changed or went/.test(n) && n.includes(dropped)), `the check names the recorded sentence that goes: ${JSON.stringify(said.notes)}`);
  const next = await must(admin.tokens.admin, "library_publish", { pack: fewer.sha256, confirm_removed: true });
  const kept = starter.items.length - 1;
  assert(next.published && next.notes.some((n) => n.includes(`recordings go out with this version for the ${kept} of its ${starter.items.length} recorded sentences`)), `a new version: ${JSON.stringify(next.notes)}`);
  const nextEntry = (await catalogue()).packs[starter.language].find((p) => p.id === starter.id);
  assert(nextEntry.version !== audioRef.version && nextEntry.audio?.startsWith(`/library/packs/${starter.id}/${nextEntry.version}/audio.`), `its recordings, at its own version, in the same change: ${JSON.stringify(nextEntry)}`);
  const carried = await (await fetch(`${BASE}${nextEntry.audio}`)).json();
  for (const [slug, voice] of Object.entries(carried.voices)) {
    eq(Object.keys(voice.items).length, kept, `${slug}'s sentences`);
    assert(!(dropped in voice.items), `${slug} still reads the sentence that went`);
  }
  const back = await must(admin.tokens.admin, "library_restore", { rev: next.rev - 1 });
  eq((await catalogue()).packs[starter.language].find((p) => p.id === starter.id).audio, audioRef.audio, `the version with recordings back (rev ${back.rev})`);
});

await stage("an opt-in pack (opt_in): listed with optIn, a new version keeps it, Explore lists it as the library's and a learner adds it; REST makes it a default again, and the same version opt-in again; unpublished", async () => {
  const pack = { ...JSON.parse(readFileSync(join(APP, "scripts/fixtures/packs/check-nl.json"), "utf8")), id: "optin-check-nl", name: "An opt-in check pack" };
  const path = join(OUT, "optin.json");
  writeFileSync(path, JSON.stringify(pack));
  const file = declare(path, "optin.json");
  await stageAll(admin.tokens.admin, [file]);
  const checked = await must(admin.tokens.admin, "library_check", { pack: file.sha256, opt_in: true });
  assert(checked.ok && checked.wouldPublish?.optIn === true, `library_check says opt-in: ${JSON.stringify(checked).slice(0, 300)}`);
  const published = await must(admin.tokens.admin, "library_publish", { pack: file.sha256, opt_in: true, note: "admin-check: an opt-in pack" });
  assert(published.published, `library_publish: ${JSON.stringify(published.problems)}`);
  const entry = () => catalogue().then((c) => c.packs.nl.find((p) => p.id === pack.id));
  const first = await entry();
  eq(first.optIn, true, "the catalog's entry is opt-in");
  // A new version, published without opt_in, stays opt-in.
  const fewer = { ...pack, items: pack.items.slice(0, -1) };
  const fewerPath = join(OUT, "optin-fewer.json");
  writeFileSync(fewerPath, JSON.stringify(fewer));
  const fewerFile = declare(fewerPath, "optin-fewer.json");
  await stageAll(admin.tokens.admin, [fewerFile]);
  const next = await must(admin.tokens.admin, "library_publish", { pack: fewerFile.sha256, confirm_removed: true });
  assert(next.published, `the new version: ${JSON.stringify(next.problems)}`);
  const second = await entry();
  assert(second.optIn === true && second.version !== first.version, `still opt-in at its new version: ${JSON.stringify(second)}`);
  const listed = (await app(admin, "GET", `/api/community/items?lang=nl`)).body.items.find((i) => i.id === pack.id);
  assert(listed && listed.by === "Lexicommons" && listed.curated, `Explore lists it as the library's: ${JSON.stringify(listed)}`);
  const ref = (await app(learner, "POST", `/api/community/items/${pack.id}/follow`)).body;
  eq([ref.id, ref.version], [pack.id, second.version], "a learner adds it (a follow, at the catalog's version)");
  await app(learner, "DELETE", `/api/community/items/${pack.id}/follow`);
  // REST: optIn false makes it a default (a new version, the first item back).
  const back = await rest(admin.tokens.admin, "POST", "/admin/library/publish", { pack: file.sha256, optIn: false });
  assert(back.status === 200 && back.body.published, `REST publish with optIn false: ${JSON.stringify(back.body).slice(0, 300)}`);
  const asDefault = await entry();
  assert(!("optIn" in asDefault), `a default now: ${JSON.stringify(asDefault)}`);
  // The same version switched back to opt-in: only the catalog's entry changes; the same again is nothing to publish.
  const flipped = await must(admin.tokens.admin, "library_publish", { pack: file.sha256, opt_in: true });
  assert(flipped.published, `opt-in again at the same version: ${JSON.stringify(flipped.problems)}`);
  eq([(await entry()).version, (await entry()).optIn], [asDefault.version, true], "the same version, opt-in");
  const again = await must(admin.tokens.admin, "library_check", { pack: file.sha256, opt_in: true });
  assert(!again.ok && /already an opt-in/.test(again.problems[0]?.message ?? ""), `the same again: ${JSON.stringify(again.problems)}`);
  await must(admin.tokens.admin, "library_unpublish", { pack: pack.id, lang: "nl" });
  assert(!(await catalogue()).packs.nl.some((p) => p.id === pack.id), "unpublished");
  return { first: published.what?.pack, second: second.version };
});

const RODE_ID = json(RODE_BOOK).id;
const ALICE_ID = json(ALICE_BOOK).id;

await stage("the shelf's sections: set, checked, and shown in the catalog", async () => {
  const unknown = await tool(admin.tokens.admin, "library_shelf", { sections: [{ title: "Nope", books: ["no-such-book"] }] });
  assert(unknown.error && /isn't a book/.test(unknown.error), `a book that isn't there: ${unknown.error}`);
  const set = await must(admin.tokens.admin, "library_shelf", { sections: [{ title: "Start here", books: [RODE_ID, ALICE_ID] }, { title: "Picture books", books: [RODE_ID] }] });
  eq(set.sections.map((s) => s.id), ["start-here", "picture-books"], "section ids from their titles");
  eq((await catalogue()).shelf, [{ id: "start-here", title: "Start here", books: [RODE_ID, ALICE_ID] }, { id: "picture-books", title: "Picture books", books: [RODE_ID] }], "the catalog's shelf");
});

await stage("unpublish a layer, then the whole book; files stay served; history lists each; restore brings each back", async () => {
  const beforeLayer = (await catalogue()).books.find((b) => b.id === ALICE_ID);
  const layerUrl = beforeLayer.layers.nl.url;
  const offLayer = await must(admin.tokens.admin, "library_unpublish", { book: ALICE_ID, layer: "nl", note: "admin-check: a layer off" });
  assert(!(await catalogue()).books.find((b) => b.id === ALICE_ID).layers.nl, "the nl layer is off the catalog");
  eq(await libraryStatus(layerUrl), 200, "its file is still served");
  const offBook = await must(admin.tokens.admin, "library_unpublish", { book: RODE_ID });
  const c = await catalogue();
  assert(!c.books.find((b) => b.id === RODE_ID), "the picture book is off the catalog");
  eq(c.shelf.map((s) => s.books), [[ALICE_ID], []], "and off the shelf's sections");
  const history = await must(admin.tokens.admin, "library_history", { limit: 5 });
  eq(history.slice(0, 2).map((h) => h.action), ["unpublish", "unpublish"], "the newest revisions");
  assert(history[0].by === admin.name, `history names who did it: ${history[0].by}`);
  const restored = await must(admin.tokens.admin, "library_restore", { rev: offLayer.restoreWith.rev });
  const back = await catalogue();
  assert(back.books.find((b) => b.id === RODE_ID) && back.books.find((b) => b.id === ALICE_ID).layers.nl, "both are back");
  eq(back.shelf[0].books, [RODE_ID, ALICE_ID], "the shelf as it was");
  const undone = await must(admin.tokens.admin, "library_restore", { rev: restored.undoWith.rev });
  assert(!(await catalogue()).books.find((b) => b.id === RODE_ID), "a restore can be undone too");
  const again = await must(admin.tokens.admin, "library_restore", { rev: undone.undoWith.rev });
  // Three restores back and forth, the last to the very catalog the first made: three revisions, each its own.
  const recent = await must(admin.tokens.admin, "library_history", { limit: 3 });
  eq(recent.map((h) => h.rev), [again.rev, undone.rev, restored.rev], "the three restores, newest first, each a revision");
  assert(recent.every((h) => h.action === "restore" && h.by === admin.name), "each one the admin's restore");
  eq(recent[0].holds, recent[2].holds, "the last holds what the first did");
  const raw = await catalogue();
  assert(typeof raw.writeId === "string" && raw.writeId.length > 0, "the catalog carries the write's id");
  return { offBook: offBook.unpublished, restored: restored.restored };
});

await stage("a catalog changed outside the tools is recorded as its own revision before the next change", async () => {
  const current = await catalogue();
  const edited = { ...current, books: current.books.filter((b) => b.id !== ALICE_ID) };
  const file = join(OUT, "outside-catalogue.json");
  writeFileSync(file, JSON.stringify(edited, null, 2) + "\n");
  await r2.put("lexicommons-library", "catalogue.json", readFileSync(file), "application/json");
  // Five readers at once: one revision for the change, no clash.
  const reads = await Promise.all(Array.from({ length: 5 }, () => tool(admin.tokens.admin, "library_get", {})));
  assert(reads.every((r) => !r.error), `every read answers: ${reads.map((r) => r.error).filter(Boolean).join("; ")}`);
  eq(new Set(reads.map((r) => r.rev)).size, 1, "all five see one revision");
  const got = reads[0];
  const history = await must(admin.tokens.admin, "library_history", { limit: 3 });
  eq(history[0].action, "outside", "the newest revision");
  eq(history[0].rev, got.rev, "library_get's revision is that one");
  assert(history[1].action !== "outside", "recorded once, not once per reader");
  await must(admin.tokens.admin, "library_restore", { rev: history[1].rev });
  assert((await catalogue()).books.find((b) => b.id === ALICE_ID), "the change outside can be undone like any other");
});

await stage("the REST mirror: the same calls with an admin-access token", async () => {
  const token = admin.tokens.admin;
  const got = await rest(token, "GET", "/admin/library");
  eq(got.status, 200, "GET /admin/library");
  const checked = await rest(token, "POST", "/admin/library/check", { book: `${ALICE_ID}@${json(ALICE_BOOK).version}` });
  assert(checked.status === 200 && checked.body.ok, `POST /admin/library/check: ${JSON.stringify(checked.body).slice(0, 300)}`);
  const shelf = await rest(token, "PUT", "/admin/library/shelf", { sections: [{ title: "Start here", books: [ALICE_ID, RODE_ID] }], expectedRev: got.body.rev });
  eq(shelf.status, 200, "PUT /admin/library/shelf");
  const stale = await rest(token, "PUT", "/admin/library/shelf", { sections: [], expectedRev: got.body.rev });
  eq(stale.status, 400, "a stale expectedRev");
  const history = await rest(token, "GET", "/admin/library/history?limit=1");
  eq(history.body[0].action, "shelf", "the REST change is in the history");
  const logged = await rest(token, "GET", "/admin/log?limit=50");
  assert(logged.body.some((e) => e.via === "rest:check admin" && e.action === "library.shelf"), "the admin log has the REST call, with its token");
});

await stage("admin_log records every action, with the connection it came through", async () => {
  const entries = await must(admin.tokens.admin, "admin_log", { action: "library" });
  const actions = entries.filter((e) => e.actorId === admin.id).map((e) => e.action);
  for (const action of ["library.publish", "library.unpublish", "library.restore", "library.shelf"]) assert(actions.includes(action), `the log has ${action}`);
  assert(entries.every((e) => e.actorName === admin.name || e.actorId !== admin.id), "the log names the admin");
  assert(entries.some((e) => e.via === "pat:check admin"), "MCP calls are logged with their token");
  return { entries: entries.length };
});

await stage("the account's export has its role, its staged files and what it did as admin", async () => {
  const exported = (await app(admin, "GET", "/api/me/export")).body;
  eq(exported.roles.map((r) => r.role), ["admin"], "roles");
  assert(exported.stagedFiles.some((f) => f.sha256 === rode.glossary.sha256), "the glossary still staged is listed");
  assert(exported.adminActions.some((a) => a.action === "library.publish") && exported.adminActions.some((a) => a.action === "library.shelf"), "its admin actions");
  assert(!/lct_[A-Za-z0-9_-]{20,}/.test(JSON.stringify(exported)), "no token secrets in the export");
  return { adminActions: exported.adminActions.length, stagedFiles: exported.stagedFiles.length };
});

await stage("a role taken away stops working at the next call; given back, it works again", async () => {
  sql(`DELETE FROM user_roles WHERE user_id = ${q(admin.id)}`);
  const names = await toolNames(admin.tokens.admin);
  assert(!names.includes("library_publish"), "the admin tools are gone from the list");
  const call = await tool(admin.tokens.admin, "library_get", {});
  assert(call.error, "library_get refused");
  const viaRest = await rest(admin.tokens.admin, "GET", "/admin/library");
  eq(viaRest.status, 403, "REST refused");
  assert(/isn't an admin/.test(viaRest.body.error), `REST says why: ${viaRest.body.error}`);
  sql(`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(admin.id)}, 'admin', ${Date.now()}, 'd1', 'admin-check')`);
  assert((await toolNames(admin.tokens.admin)).includes("library_publish"), "back");
});

await stage("an account's staged files go with it", async () => {
  const leaving = account("Check leaver", { admin: true });
  const file = declare(ALICE_GLOSSARY, "glossary.json");
  await stageAll(leaving.tokens.admin, [file]);
  const pending = await must(leaving.tokens.admin, "library_upload", { files: [{ name: "late.json", type: "application/json", size: 2, sha256: sha256("{}") }] });
  leaving.pendingId = pending.files[0].id;
  leaving.pendingUrl = pending.files[0].url;
  const rows = sql(`SELECT r2_key FROM staged_files WHERE user_id = ${q(leaving.id)} AND status = 'stored'`);
  eq(rows.length, 1, "one staged file (and one still pending)");
  const deleted = await app(leaving, "DELETE", "/api/me", { confirm: "delete my account" });
  eq(deleted.status, 200, "account deleted");
  eq(sql(`SELECT COUNT(*) AS n FROM staged_files WHERE user_id = ${q(leaving.id)}`)[0].n, 0, "staged rows");
  eq(sql(`SELECT COUNT(*) AS n FROM user_roles WHERE user_id = ${q(leaving.id)}`)[0].n, 0, "roles");
  // A link handed out before the delete, used after it: nothing is kept.
  const late = { id: leaving.pendingId, url: leaving.pendingUrl };
  const arrived = await fetch(late.url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert([404, 410].includes(arrived.status), `a file for a deleted account: ${arrived.status}`);
  const lateGone = (await r2.get("lexicommons-uploads", `staging/${leaving.id}/${late.id}`)) === null;
  assert(lateGone, "nothing was kept for it");
  // R2 answers "not found" for the staged bytes now: the get fails.
  const gone = (await r2.get("lexicommons-uploads", rows[0].r2_key)) === null;
  assert(gone, "the staged bytes are still in the uploads bucket");
});

// The test accounts: deleted through the API (their rows, roles and staged files go with them).
for (const who of [admin, learner]) await app(who, "DELETE", "/api/me", { confirm: "delete my account" });

const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "admin-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), passed: results.length - failed.length, total: results.length, results, calls: log }, null, 2) + "\n");
console.log(`admin check: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
