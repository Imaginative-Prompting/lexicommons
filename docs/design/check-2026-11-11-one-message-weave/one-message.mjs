// lx-app (scratch, recorded with P2(b)): one message weaves a text, end to end on a local copy. A phone signs up and makes a personal token
// (as an AI's connection has one); then, over MCP as an AI calls it: get_weave_guide, request_text_upload and the PUT, add_text, get_text by
// its text_id, add_weave with text_id and language. Nothing is pressed in the app for the weave. The phone takes the text and its weave
// through the relay; stills of Read's card ("Woven into Dutch") and the reader; every call's answer, as the steps a learner sees.
// node one-message.mjs <app dir> http://localhost:<port> <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [APP, BASE, outArg] = process.argv.slice(2);
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
const { chromium } = await import(pathToFileURL(join(resolve(APP), "scripts/quiet-browser.mjs")).href);
// The Worker's TypeScript loads as the app's own Node checks load it (worker-env.mjs sets up its imports).
await import(pathToFileURL(join(resolve(APP), "scripts/fixtures/worker-env.mjs")).href);
const { WEAVE_EXAMPLE } = await import(pathToFileURL(join(resolve(APP), "src/weave-guide.ts")).href);
const steps = [];
const say = (what, detail) => {
  steps.push({ what, ...(detail ? { detail } : {}) });
  console.log(`  ${what}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 300)}` : ""}`);
};
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
try {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "One message");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  const token = await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Your AI" }) })).json()).token);
  assert(token, "no token");
  say("a phone, signed up, learning Dutch; a personal token for the AI's connection");

  const mcp = async (method, params) => {
    const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const text = await response.text();
    const line = text.split("\n").find((l) => l.startsWith("data: "));
    if (!line) throw new Error(`${method}: ${response.status} ${text.slice(0, 200)}`);
    const { result, error } = JSON.parse(line.slice(6));
    if (error) throw new Error(`${method}: ${error.message}`);
    return result;
  };
  const tool = async (name, args = {}) => {
    const result = await mcp("tools/call", { name, arguments: args });
    if (result.isError) throw new Error(`${name}: ${result.content[0].text.slice(0, 400)}`);
    return JSON.parse(result.content[0].text);
  };

  // The person's one message: "Weave this into Dutch for me in Lexicommons:" and the text. The AI, from there:
  const guide = await tool("get_weave_guide", { language: "nl" });
  assert(guide.guide.includes("## Their one message"), "the guide doesn't open with the one message");
  say("1. get_weave_guide { language: nl }", `${guide.guide.length.toLocaleString("en")} characters; it opens: ${guide.guide.split("\n").slice(2, 5).join(" ").slice(0, 200)}`);
  const ticket = await tool("request_text_upload", { format: "text", filename: "alice.txt" });
  const put = await fetch(new URL(ticket.upload_url, BASE), { method: ticket.method, headers: { "Content-Type": ticket.content_type }, body: WEAVE_EXAMPLE.text });
  assert(put.ok, `the PUT: ${put.status}`);
  say("2. request_text_upload { format: text } and the PUT", { upload_id: ticket.upload_id, status: put.status });
  const added = await tool("add_text", { upload_id: ticket.upload_id, language: "en", title: "Alice: down the rabbit-hole" });
  say("3. add_text { upload_id, language: en, title }", { text_id: added.text_id, words: added.words, next: added.next });
  const got = await tool("get_text", { text_id: added.text_id });
  assert(Array.isArray(got.to_weave) && got.to_weave.length === WEAVE_EXAMPLE.to_weave.length, `get_text's to_weave: ${JSON.stringify(got).slice(0, 300)}`);
  say("4. get_text { text_id }", { sentences: got.to_weave.length, first: got.to_weave[0] });
  const woven = await tool("add_weave", { text_id: added.text_id, language: "nl", weave: WEAVE_EXAMPLE.weave });
  say("5. add_weave { text_id, language: nl, weave }", { change_id: woven.change_id, said: woven.said, next: woven.next });

  // The phone: the text and its weave come through the relay. Read's card says so.
  await page.evaluate(() => (location.hash = "#read"));
  let tile = null;
  for (const start = Date.now(); Date.now() - start < 60_000; await page.waitForTimeout(2000)) {
    await page.reload();
    await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
    const found = await page.evaluate(async (id) => {
      const store = await import("/js/read/store.js");
      const books = await store.listBooks();
      const woven = await store.weaveLanguages();
      return { here: books.some((b) => b.id === id), woven: woven.get(id) ?? [] };
    }, added.text_id);
    if (found.here && found.woven.includes("nl")) {
      tile = found;
      break;
    }
  }
  assert(tile, "the text and its weave didn't reach the phone within a minute");
  await page.evaluate(() => (location.hash = "#read"));
  await page.waitForTimeout(2500);
  const card = page.locator(`[data-part="book-tile"][data-id="${added.text_id}"], [data-part="book-tile"]:has-text("Alice: down the rabbit-hole")`).first();
  await card.waitFor({ timeout: 10_000 });
  await card.scrollIntoViewIfNeeded();
  const cardText = (await card.textContent()).replace(/\s+/g, " ").trim();
  assert(/Woven into Dutch/.test(cardText), `Read's card: ${cardText}`);
  await page.screenshot({ path: join(OUT, "read-card-woven-390.png") });
  say("the phone: in Read, its card", cardText);
  await card.click();
  await page.waitForSelector('[data-part="reader"]:not([data-ghost])[data-ready]', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, "reader-woven-390.png") });
  const contents = await page.evaluate(() => document.querySelector('[data-part="reader"]:not([data-ghost])').textContent.replace(/\s+/g, " ").slice(0, 200));
  say("the phone: the text open in the reader (in English at first: no Dutch words known yet)", contents);
  assert(!errors.length, `page errors: ${errors}`);
  writeFileSync(join(OUT, "one-message.json"), JSON.stringify({ ok: true, steps }, null, 1));
  console.log("one message: done");
} catch (error) {
  await page.screenshot({ path: join(OUT, "fail.png") }).catch(() => {});
  writeFileSync(join(OUT, "one-message.json"), JSON.stringify({ ok: false, error: String(error.stack ?? error), steps }, null, 1));
  console.log(`one message: FAILED\n  ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
