#!/usr/bin/env node
// Signed uploads and the site gate's form against bodies that lie about their size, end to end against a LOCAL server
// with the gate on: a body sent without a Content-Length (chunked) is read only up to its limit and nothing of it is
// kept; the same upload link sent twice at once stores one file; every stored file is served so it can't run as a page;
// deleting an account takes its files' and its look images' bytes with it. Accounts are written straight into the server's D1 state.
//
//   node scripts/upload-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir> --gate-password <it>
//
// The server: as for admin-check (app/AGENTS.md), with --var GATE_ENABLED:true --var GATE_PASSWORD:<any>
// --var GATE_SESSION_SECRET:<any>. Sandbox off (wrangler). Exit 0 = every stage passed.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { localR2 } from "./fixtures/local-r2.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
// Absolute, whatever folder it's run from (app/AGENTS.md: every check resolves its outDir first).
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : null);
const PERSIST = opt("persist-to");
const GATE_PASSWORD = opt("gate-password");
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
// The buckets through one local R2 in this process (scripts/fixtures/local-r2.mjs), not a wrangler launch per object.
const r2 = PERSIST ? localR2(APP, PERSIST) : null;
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !OUT || !PERSIST || !GATE_PASSWORD) {
  console.error("Usage: upload-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> --gate-password <it> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const results = [];
async function stage(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").join("\n        ")}`);
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const eq = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), `${message}\n  got:  ${JSON.stringify(a)}\n  want: ${JSON.stringify(b)}`);

// (An object read back through --pipe can be a few MB: room for it.)
const wrangler = (args) => execFileSync("npx", ["wrangler", ...args], { cwd: APP, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
const sql = (command) => {
  const out = wrangler(["d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command]).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
/** Whether the uploads bucket has an object at key. */
async function inBucket(key) {
  return (await r2.get("lexicommons-uploads", key)) !== null;
}
function account(name) {
  const id = `up${randomBytes(6).toString("hex")}`;
  const cookie = randomBytes(24).toString("base64url");
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  const now = Date.now();
  sql(
    [
      `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now})`,
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'upload-check')`,
      `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(id)}, 'upload check', ${q(sha256(token))}, ${q(token.slice(0, 10))}, ${now})`,
    ].join("; "),
  );
  return { id, name, cookie, token };
}
/** A body of `megabytes` MB with no Content-Length (Node sends a stream chunked). */
const chunkedBody = (megabytes) =>
  new ReadableStream({
    start(controller) {
      for (let i = 0; i < megabytes; i++) controller.enqueue(new Uint8Array(1024 * 1024).fill(97));
      controller.close();
    },
  });
/** A PUT or POST of a chunked body: its status, or "closed" when the server stopped reading and the stream broke first. */
const sendChunked = (url, init) => fetch(url, { ...init, body: chunkedBody(64), duplex: "half" }).then((r) => r.status, () => "closed");

let gateCookie = null;
const rest = async (who, method, path, body) => {
  const response = await fetch(`${BASE}/api/v1${path}`, { method, headers: { Authorization: `Bearer ${who.token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
};
const app = async (who, method, path, body) => {
  const response = await fetch(`${BASE}${path}`, { method, headers: { Cookie: `lc_session=${who.cookie}; ${gateCookie}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
};

console.log(`upload check: ${BASE}`);

await stage("the gate's form: a chunked body past its limit is cut off, and the password still opens it", async () => {
  const flood = await sendChunked(`${BASE}/_gate`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  assert(flood === 401 || flood === 413 || flood === "closed", `a 64 MB form: ${flood}`);
  const ok = await fetch(`${BASE}/_gate`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ password: GATE_PASSWORD, next: "/app/" }) });
  eq(ok.status, 303, "the right password");
  gateCookie = ok.headers.get("set-cookie").split(";")[0];
  assert(/^lc_gate=/.test(gateCookie), "the gate's cookie");
  return { flood };
});

const owner = account("Upload check");

await stage("a file: a chunked body past 10 MB keeps nothing; the real file stores; the link can't be used again", async () => {
  const ticket = (await rest(owner, "POST", "/uploads", { filename: "note.txt", contentType: "text/plain" })).body;
  const flood = await sendChunked(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": "text/plain" } });
  assert(flood === 413 || flood === "closed", `a 64 MB chunked body: ${flood}`);
  eq(sql(`SELECT status, r2_key FROM uploads WHERE id = ${q(ticket.id)}`)[0], { status: "pending", r2_key: null }, "nothing stored for it");
  assert(!(await inBucket(`users/${owner.id}/uploads/${ticket.id}`)), "no bytes in the bucket");
  const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": "text/plain" }, body: "hallo" });
  eq(put.status, 200, "the real file");
  eq((await put.json()).sha256, sha256("hallo"), "its sha256");
  eq((await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": "text/plain" }, body: "again" })).status, 409, "the link used again");
});

await stage("the same link sent twice at once, with different bytes: one is stored, the other refused, and they agree", async () => {
  const ticket = (await rest(owner, "POST", "/uploads", { filename: "twice.txt", contentType: "text/plain" })).body;
  const send = (text) => fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": "text/plain" }, body: text }).then(async (r) => ({ status: r.status, body: await r.json() }));
  // A few MB each, so both are past the link's pending check and still arriving when either is stored.
  const [a, b] = await Promise.all([send("first ".repeat(500_000)), send("second ".repeat(450_000))]);
  const won = [a, b].filter((r) => r.status === 200);
  eq(won.length, 1, `one stored (statuses ${a.status}, ${b.status})`);
  eq([a, b].find((r) => r.status !== 200).status, 409, "the other refused");
  const row = sql(`SELECT sha256 FROM uploads WHERE id = ${q(ticket.id)}`)[0];
  eq(row.sha256, won[0].body.sha256, "the row records the bytes that were stored");
  const file = await fetch(`${BASE}/api/uploads/${ticket.id}/file`, { headers: { Cookie: `lc_session=${owner.cookie}; ${gateCookie}` } });
  eq(sha256(Buffer.from(await file.arrayBuffer())), won[0].body.sha256, "the stored file is those bytes");
});

await stage("a look image: a chunked body past 4 MB keeps nothing", async () => {
  const ticket = (await rest(owner, "POST", "/look/images", { slot: "background", filename: "bg.png", contentType: "image/png" })).body;
  const flood = await sendChunked(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" } });
  assert(flood === 413 || flood === "closed", `a 64 MB chunked image: ${flood}`);
  eq(sql(`SELECT status FROM uploads WHERE id = ${q(ticket.id)}`)[0].status, "pending", "nothing stored for it");
  eq(sql(`SELECT COUNT(*) AS n FROM look_images WHERE user_id = ${q(owner.id)}`)[0].n, 0, "no image in the look");
});

await stage("every stored file is served so it can't run as a page: a sandbox CSP and nosniff, anything but audio or a raster image a download", async () => {
  const who = account("Serve check");
  const cookie = { Cookie: `lc_session=${who.cookie}; ${gateCookie}` };
  const headersOf = (r) => ({ status: r.status, csp: r.headers.get("content-security-policy"), sniff: r.headers.get("x-content-type-options"), disposition: r.headers.get("content-disposition") });
  const upload = async (filename, contentType, body) => {
    const ticket = (await rest(who, "POST", "/uploads", { filename, contentType })).body;
    eq((await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body })).status, 200, filename);
    return headersOf(await fetch(`${BASE}/api/uploads/${ticket.id}/file`, { headers: cookie }));
  };
  const look = async (filename, contentType, body) => {
    const ticket = (await rest(who, "POST", "/look/images", { slot: "mark", filename, contentType })).body;
    eq((await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body })).status, 200, filename);
    return headersOf(await fetch(`${BASE}/api/look/images/${sha256(body)}`, { headers: cookie }));
  };
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
  const served = {
    text: await upload("note.txt", "text/plain", "hallo"),
    audio: await upload("clip.mp3", "audio/mpeg", Buffer.from("fffb90640000000000000000", "hex")),
    svg: await look("mark.svg", "image/svg+xml", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script></svg>')),
    png: await look("mark.png", "image/png", png),
    library: headersOf(await fetch(`${BASE}/library/catalogue.json`, { headers: cookie })),
  };
  for (const [name, h] of Object.entries(served)) assert(h.status === 200 && h.csp === "default-src 'none'; sandbox" && h.sniff === "nosniff", `${name}: ${JSON.stringify(h)}`);
  eq([served.text.disposition, served.svg.disposition], ["attachment", "attachment"], "text and an SVG are downloads");
  eq([served.audio.disposition, served.png.disposition, served.library.disposition], [null, null, null], "audio, a PNG and the library's JSON show as they are");
  eq((await app(who, "DELETE", "/api/me", { confirm: "delete my account" })).status, 200, "that account deleted");
  return Object.fromEntries(Object.entries(served).map(([name, h]) => [name, h.disposition ?? "inline"]));
});

await stage("deleting the account takes its files' and look images' bytes, and a link handed out before keeps nothing", async () => {
  // A stored file (from above), and a look image stored through its link.
  const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
  const image = (await rest(owner, "POST", "/look/images", { slot: "mark", filename: "mark.png", contentType: "image/png" })).body;
  eq((await fetch(image.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: png })).status, 200, "the look image");
  const late = (await rest(owner, "POST", "/uploads", { filename: "late.txt", contentType: "text/plain" })).body;
  const files = sql(`SELECT r2_key FROM uploads WHERE user_id = ${q(owner.id)} AND r2_key IS NOT NULL`).map((r) => r.r2_key);
  const imageKey = `users/${owner.id}/look/${sha256(png)}`;
  assert(files.length === 2 && (await Promise.all(files.map(inBucket))).every(Boolean) && (await inBucket(imageKey)), "before: two files and an image in the bucket");
  const deleted = await app(owner, "DELETE", "/api/me", { confirm: "delete my account" });
  eq(deleted.status, 200, "account deleted");
  eq(deleted.body.files, 3, "it counts the files that had arrived (two files and the image), not the pending link");
  assert(!(await Promise.all(files.map(inBucket))).some(Boolean) && !(await inBucket(imageKey)), "after: none of their bytes are left");
  const arrived = await fetch(late.uploadUrl, { method: "PUT", headers: { "Content-Type": "text/plain" }, body: "too late" });
  assert([404, 410].includes(arrived.status), `the link handed out before: ${arrived.status}`);
  assert(!(await inBucket(`users/${owner.id}/uploads/${late.id}`)), "nothing kept for it");
});

const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "upload-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2) + "\n");
console.log(`upload check: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
