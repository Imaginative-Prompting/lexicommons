// Checks that every route reading a body refuses a crafted one in words (a 400, or a 413 for an image), never a 500,
// on a LOCAL server (it creates and deletes a test account, so never point it at the live site): the account, notes,
// tokens, the look and saved themes (and a look image past its size), the app's report on a look, REST for scripts,
// practice, requests for your AI, the pack relay and the text relay. Each gets an object whose toString is null in its fields, a body
// that isn't JSON, and one past its limit. And the biggest look the rules allow still saves, as the look and as a
// theme. Signing up needs a browser (a passkey); the rest goes over HTTP.
// Usage (headless Chrome, through the channel's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "body check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/body-check.mjs http://localhost:<port> <outDir>

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { LOOK_LIMITS } from "../public/js/lx/look-rules.js";
import { PACK_LIMITS } from "../public/js/study/pack-format.js";
import { AUDIO_LIMITS } from "../public/js/study/pack-audio.js";

const [BASE, OUT = "body-check-out"] = process.argv.slice(2);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("body-check creates and deletes an account: give it a local server, e.g. http://localhost:8825");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const results = [];
async function stage(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - started, detail });
    console.log(`ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ stage: name, ok: false, ms: Date.now() - started, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const TRAP = '{"toString": null}';
const padded = (bytes) => JSON.stringify({ pad: "x".repeat(bytes) });
let token = null;

/** Sends each [method, path, body, expected status] (cookie session, or the token for /api/v1) and checks the answers. */
async function sendAll(sends) {
  const got = [];
  for (const [method, path, body, want = 400, contentType = "application/json"] of sends) {
    const rest = path.startsWith("/api/v1/");
    const response = rest
      ? await fetch(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType }, body })
      : await page.request.fetch(`${BASE}${path}`, { method, headers: { "Content-Type": contentType }, data: body });
    const status = typeof response.status === "function" ? response.status() : response.status;
    const answer = await response.json().catch(() => ({}));
    got.push(`${method} ${path} → ${status}`);
    assert(status === want && (status < 400 || (typeof answer.error === "string" && answer.error !== "internal_error")), `${method} ${path} with ${String(body).slice(0, 80)}: ${status} ${JSON.stringify(answer).slice(0, 160)}`);
  }
  return got;
}

await stage("sign up, and a personal token for the REST routes", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Body Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  token = await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Body check" }) })).json()).token);
  assert(token?.startsWith("lct_"), "a token");
  return "signed up";
});

await stage("the account, notes and tokens", async () => {
  const got = await sendAll([
    ["POST", "/api/me", `{"name": ${TRAP}}`],
    ["POST", "/api/me", "{not json"],
    ["POST", "/api/me", padded(5_000)],
    ["DELETE", "/api/me", `{"confirm": ${TRAP}}`],
    ["POST", "/api/notes", `{"text": ${TRAP}}`],
    ["POST", "/api/notes", padded(20_000)],
    ["POST", "/api/tokens", `{"name": ${TRAP}, "admin": ${TRAP}}`],
    ["POST", "/api/tokens", "[1, 2"],
  ]);
  return `${got.length} sent, each a 400`;
});

await stage("the look, saved themes, a look image past its size, the app's report", async () => {
  const got = await sendAll([
    ["PUT", "/api/look", `{"look": ${TRAP}, "baseRev": ${TRAP}}`],
    ["PUT", "/api/look", padded(LOOK_LIMITS.cssBytes * 20)],
    ["POST", "/api/look/use", `{"theme": ${TRAP}}`],
    ["PUT", "/api/themes/abcdefgh12", `{"look": ${TRAP}, "baseRev": ${TRAP}, "undelete": ${TRAP}}`],
    ["PUT", "/api/themes/abcdefgh12", "not json at all"],
    ["POST", "/api/look/applied", `{"rev": ${TRAP}, "device": ${TRAP}, "notes": [${TRAP}], "undone": ${TRAP}}`],
    ["PUT", `/api/look/images/${"a".repeat(64)}`, Buffer.alloc(LOOK_LIMITS.imageBytes + 1024), 413, "image/png"],
  ]);
  // A look whose every field is the trap is checked like any other: what isn't a look is left out, and it saves.
  const junk = await page.request.fetch(`${BASE}/api/look`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    data: `{"baseRev": 0, "look": {"base": ${TRAP}, "name": ${TRAP}, "css": ${TRAP}, "tokens": {"--accent": ${TRAP}}, "images": {"background": {"hash": ${TRAP}, "size": ${TRAP}, "name": ${TRAP}}}}}`,
  });
  const saved = await junk.json();
  assert(junk.status() === 200 && saved.result === "saved", `a look of traps: ${junk.status()} ${JSON.stringify(saved).slice(0, 200)}`);
  return `${got.length} refused; a look of traps saved with them left out (rev ${saved.rev})`;
});

await stage("REST for scripts: notes, uploads, themes, the look, an image's upload link", async () => {
  const got = await sendAll([
    ["POST", "/api/v1/notes", `{"text": ${TRAP}}`],
    ["POST", "/api/v1/notes", "{"],
    ["POST", "/api/v1/uploads", `{"filename": ${TRAP}, "contentType": ${TRAP}}`],
    ["POST", "/api/v1/themes", `{"name": ${TRAP}, "from": ${TRAP}, "base": ${TRAP}, "use": ${TRAP}}`],
    ["POST", "/api/v1/look/use", `{"theme": ${TRAP}}`],
    ["PATCH", "/api/v1/look", padded(LOOK_LIMITS.cssBytes * 20)],
    ["POST", "/api/v1/look/images", `{"slot": ${TRAP}, "filename": ${TRAP}}`],
  ]);
  // A change whose every field is the trap: checked like any change, what isn't one left out.
  const response = await fetch(`${BASE}/api/v1/look`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: `{"base": ${TRAP}, "name": ${TRAP}, "css": ${TRAP}, "tokens": {"--accent": ${TRAP}, "--m-right": ${TRAP}}, "removeImages": [${TRAP}], "setImages": {"x": ${TRAP}}, "expectedRev": ${TRAP}}`,
  });
  assert(response.status === 200, `a change of traps: ${response.status} ${(await response.text()).slice(0, 200)}`);
  return `${got.length} refused; a change of traps applied with them left out`;
});

await stage("Translate: what's typed comes in the body, and a crafted one is refused", async () => {
  const got = await sendAll([
    ["POST", "/api/translate", `{"q": ${TRAP}, "from": ${TRAP}, "to": ${TRAP}, "language": ${TRAP}}`],
    ["POST", "/api/translate", "{not json"],
    ["POST", "/api/translate", padded(20_000)],
  ]);
  const asked = await page.request.get(`${BASE}/api/translate?q=boek&language=nl`);
  assert(asked.status() !== 200 && !(await asked.text()).includes("boek"), `a GET with the words in its URL answered ${asked.status()}`);
  return `${got.length} refused; a GET with the words in its URL answers ${asked.status()}`;
});

await stage("your study record, with an AI connected: a crafted one is refused", async () => {
  const got = await sendAll([
    ["PUT", "/api/ai/record", `{"version": ${TRAP}, "language": ${TRAP}, "evidenceAt": ${TRAP}}`],
    ["PUT", "/api/ai/record", `{"version": 1, "language": "nl", "evidenceAt": 1, "misses": ${TRAP}}`],
    ["PUT", "/api/ai/record", "{not json"],
    ["PUT", "/api/ai/record", padded(500_000)],
  ]);
  return `${got.length} refused`;
});

await stage("practice, requests for your AI, the pack relay, the text relay, clears of study progress", async () => {
  const big = JSON.stringify({ kind: "conversation", snapshot: { pad: "x".repeat(200_000) } });
  const got = await sendAll([
    ["POST", "/api/practice", `{"kind": ${TRAP}, "minutes": ${TRAP}}`],
    ["POST", "/api/practice", "{not json"],
    ["POST", "/api/practice", big],
    ["PUT", "/api/practice/learner", big],
    ["POST", "/api/practice/nopractice/turns", `{"type": "card", "card": ${TRAP}, "game": ${TRAP}}`],
    ["POST", "/api/ai/requests", `{"kind": ${TRAP}}`],
    ["POST", "/api/ai/requests", `{"kind": "practice", "practice": {"kind": ${TRAP}}}`],
    ["POST", "/api/ai/requests", JSON.stringify({ kind: "ask", what: "x".repeat(20_000) })],
    ["PUT", "/api/packs/device", `{"device": ${TRAP}, "label": ${TRAP}, "packs": [{"id": ${TRAP}, "items": ${TRAP}}]}`],
    ["POST", "/api/packs/changes", `{"kind": "undo", "change": ${TRAP}, "label": ${TRAP}}`],
    ["POST", "/api/packs/changes/chg_nothing1/report", `{"device": ${TRAP}, "state": ${TRAP}, "through": ${TRAP}}`],
    // The account's copy of a pack of yours, with its recordings: crafted fields, and past a pack and a manifest together.
    ["PUT", "/api/packs/copies/check-nl", `{"device": ${TRAP}, "through": ${TRAP}, "pack": {"id": "check-nl", "language": ${TRAP}}, "audio": ${TRAP}}`],
    ["PUT", "/api/packs/copies/check-nl", padded(PACK_LIMITS.bytes + 64 * 1024 + AUDIO_LIMITS.bytes + 10)],
    ["POST", "/api/texts/changes", `{"kind": ${TRAP}, "label": ${TRAP}}`],
    ["POST", "/api/texts/changes", `{"kind": "remove", "textId": ${TRAP}, "title": ${TRAP}}`],
    ["POST", "/api/texts/changes", `{"kind": "undo", "change": ${TRAP}}`],
    ["POST", "/api/texts/changes/txc_nothing123/report", `{"device": ${TRAP}, "state": ${TRAP}, "error": ${TRAP}, "words": ${TRAP}}`],
    ["POST", "/api/texts/changes", padded(20_000)],
    ["POST", "/api/progress/clears", `{"id": ${TRAP}, "before": ${TRAP}}`],
    ["POST", "/api/progress/clears", `{"id": "0123456789abcdef", "before": 9e99}`],
    ["POST", "/api/progress/clears", padded(20_000)],
    ["POST", "/api/progress/clears/nothing/undo", "{}"],
  ]);
  return `${got.length} sent, each a 400`;
});

await stage("the biggest look the rules allow still saves, as the look and as a theme", async () => {
  const rule = '[data-part="card"] { border-radius: 12px; }\n';
  const css = rule.repeat(Math.floor((LOOK_LIMITS.cssBytes - 1000) / rule.length));
  const tokens = Object.fromEntries(Array.from({ length: LOOK_LIMITS.tokenCount }, (_, i) => [`--t-${String(i).padStart(3, "0")}-${"a".repeat(40)}`, `"${"b".repeat(LOOK_LIMITS.tokenValueLength - 3)}"`]));
  const look = { base: "paper", name: "x".repeat(LOOK_LIMITS.nameLength), css, tokens };
  const body = JSON.stringify({ look, baseRev: (await (await page.request.get(`${BASE}/api/look`)).json()).rev });
  const response = await page.request.fetch(`${BASE}/api/look`, { method: "PUT", headers: { "Content-Type": "application/json" }, data: body });
  const saved = await response.json();
  assert(response.status() === 200 && saved.result === "saved", `the look: ${response.status()} ${JSON.stringify(saved).slice(0, 200)}`);
  assert(saved.look && Object.keys(saved.look.tokens).length === LOOK_LIMITS.tokenCount && saved.look.css.length > LOOK_LIMITS.cssBytes - 2000, `kept whole: ${Object.keys(saved.look?.tokens ?? {}).length} tokens, ${saved.look?.css?.length} characters of CSS`);
  const theme = await page.request.fetch(`${BASE}/api/themes/bigcheck1234`, { method: "PUT", headers: { "Content-Type": "application/json" }, data: JSON.stringify({ look, baseRev: 0 }) });
  const asTheme = await theme.json();
  assert(theme.status() === 200 && asTheme.result === "saved", `the theme: ${theme.status()} ${JSON.stringify(asTheme).slice(0, 200)}`);
  return `${Math.round(body.length / 1024)} KB saved, as the look and as a theme`;
});

await stage("deleting the account (the route's own confirmation)", async () => {
  const response = await page.request.fetch(`${BASE}/api/me`, { method: "DELETE", headers: { "Content-Type": "application/json" }, data: JSON.stringify({ confirm: "delete my account" }) });
  assert(response.status() === 200, `delete: ${response.status()}`);
  const after = await fetch(`${BASE}/api/v1/notes`, { headers: { Authorization: `Bearer ${token}` } });
  assert(after.status === 401, `the token after the delete: ${after.status}`);
  return "deleted; the token no longer works";
});

await stage("no page errors", async () => {
  assert(!problems.length, problems.slice(0, 5).join(" · "));
  return "none";
});

await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} stages passed`);
process.exit(failed ? 1 : 0);
