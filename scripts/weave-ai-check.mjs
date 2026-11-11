// Weaving a text of yours with your AI, end to end on a phone, the AI played over MCP with a personal token (src/texts.ts,
// mcp-texts.ts, mcp-requests.ts; the app's side is ai/client.js askToWeave and read/text-inbox.js):
// - the device asks for a weave of a text of its own: the text goes up, the request names it, and the AI sees what was asked
//   (the text, its title, the language) but never the copy's id; a language whose weaves the pipeline's judges haven't accepted
//   is refused when it's asked;
// - the AI takes it, reads the text (get_text with the request), the rules (get_weave_guide, with their date), and adds a weave:
//   a broken one refused with every problem said and the request still its own, then a clean one relayed and the request done,
//   its copy of the text gone at once;
// - the device takes the weave into the text it has, and the reader opens it woven (a word in the bank shown in Dutch);
// - a second request canceled in the app: its copy gone from the server at once (D1 read through wrangler);
// - no page error. LOCAL only, path-nl seeded.
// node scripts/weave-ai-check.mjs http://localhost:<port> <outDir> --persist-to <state dir>   (exit 0 = pass)

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST) {
  console.error("Usage: node scripts/weave-ai-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const { sentenceHash } = await import(join(APP, "public/js/read/book-format.js"));

const results = [];
const problems = [];
async function stage(name, fn) {
  try {
    const said = await fn();
    results.push({ name, ok: true, said });
    console.log(`ok    ${name}${said ? `: ${said}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.stack ?? error) });
    console.log(`FAIL  ${name}\n      ${String(error?.message ?? error).split("\n").slice(0, 8).join("\n      ")}`);
    await page.screenshot({ path: join(OUT, `fail-${results.length}.png`) }).catch(() => {});
  }
}
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
const d1 = (sql) => JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", sql], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString())[0].results;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block" });
const page = await context.newPage();
let expected = null;
page.on("console", (m) => m.type() === "error" && !expected?.test(m.text()) && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

let token = null;
async function mcp(method, params) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${method}: ${response.status} ${text.slice(0, 200)}`);
  const { result, error } = JSON.parse(line.slice(6));
  if (error) throw new Error(`${method}: ${error.message}`);
  return result;
}
async function tool(name, args = {}) {
  const result = await mcp("tools/call", { name, arguments: args });
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}
async function refusedTool(name, args) {
  const result = await mcp("tools/call", { name, arguments: args });
  assert(result.isError, `${name} should have been refused: ${result.content[0].text.slice(0, 200)}`);
  return result.content[0].text;
}
const weaveUploads = () => d1("SELECT purpose FROM uploads WHERE purpose LIKE 'weave-%'").map((r) => r.purpose);

/** The AI's weave of the text the device sent (as get_text gave it): Dutch for every word, one entry per token. */
async function weaveOf(book) {
  const NL = { The: ["De", "de"], cat: ["kat", "kat"], "sleeps.": ["slaapt.", "slapen"], dog: ["hond", "hond"], "barks.": ["blaft.", "blaffen"] };
  const sentences = [];
  for (const [s, e] of book.sentences) {
    const words = book.words.slice(s, e);
    const t = words.map((w) => NL[w]);
    if (t.some((x) => !x)) throw new Error(`a word the check can't weave: ${words.join(" ")}`);
    sentences.push({ s, e, h: await sentenceHash(book.words, s, e), t, text: t.map((x) => x[0]).join(" "), m: t.map((x, i) => [x[0], words[i], [i], null]) });
  }
  return { format: "lexicommons-weave", v: 1, kind: "weave", book: book.id, bookVersion: book.version, from: book.lang, to: "nl", sentences };
}

const TEXT_ID = "you-cat-and-dog";
let request = null;
let seat = null;
let sourceBook = null;

await stage("a new account, Dutch, a text of its own on the device and a personal token for its AI", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Weave Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  token = await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Weave check" }) })).json()).token);
  assert(token?.startsWith("lct_"), "no personal token");
  const kept = await page.evaluate(async (id) => {
    await (await import("/js/study/learning.js")).setLearning("nl");
    const { bookFromText } = await import("/js/read/import-text.js");
    const book = await bookFromText("The cat sleeps. The dog barks.", { title: "Cat and dog", lang: "en" });
    book.id = id;
    const store = await import("/js/read/store.js");
    await store.addBook(book);
    return (await store.getBook(id))?.text?.id ?? null;
  }, TEXT_ID);
  assert(kept === TEXT_ID, `the text wasn't kept on the device: ${kept}`);
  return "signed up; the text kept on the device";
});

await stage("a language the pipeline hasn't accepted weaves in is refused when it's asked, and nothing stays on the server", async () => {
  expected = /400/;
  const said = await page.evaluate(async (id) => {
    const store = await import("/js/read/store.js");
    try {
      await (await import("/js/ai/client.js")).askToWeave((await store.getBook(id)).text, "de");
      return null;
    } catch (error) {
      return error.message;
    }
  }, TEXT_ID);
  expected = null;
  assert(said && /isn't ready/.test(said), `asking for German: ${said}`);
  // The copy sent before the refusal is one no request named: it goes within the hour (the tidy); here it's still unnamed.
  assert(weaveUploads().every((p) => p.startsWith("weave-in:")), `a copy was tied to something: ${weaveUploads()}`);
  return said;
});

await stage("the device asks: its text goes up and the request names it; the AI sees the text, title and language, not the copy's id", async () => {
  request = await page.evaluate(async (id) => {
    const store = await import("/js/read/store.js");
    return (await import("/js/ai/client.js")).askToWeave((await store.getBook(id)).text, "nl");
  }, TEXT_ID);
  assert(request?.id && request.kind === "weave", `the request: ${JSON.stringify(request)}`);
  assert(weaveUploads().includes(`weave-for:${request.id}`), `the copy isn't tied to the request: ${weaveUploads()}`);
  const listed = await tool("list_requests");
  const mine = listed.waiting.find((r) => r.request_id === request.id);
  assert(mine, `list_requests: ${JSON.stringify(listed).slice(0, 300)}`);
  assert(mine.asked.book === TEXT_ID && mine.asked.language === "nl" && mine.asked.title === "Cat and dog", `asked: ${JSON.stringify(mine.asked)}`);
  assert(!("upload" in mine.asked), `the copy's id shows: ${JSON.stringify(mine.asked)}`);
  return `request ${request.id}`;
});

await stage("the AI takes it, reads the text (get_text with the request) and the rules (get_weave_guide, dated)", async () => {
  const taken = await tool("take_request", { request_id: request.id });
  seat = taken.seat;
  assert(seat && /weave/i.test(taken.how ?? ""), `take_request: ${JSON.stringify(taken).slice(0, 300)}`);
  const got = await tool("get_text", { request_id: request.id });
  sourceBook = got.book;
  assert(sourceBook?.id === TEXT_ID && got.language === "nl" && got.words === sourceBook.words.length, `get_text: ${JSON.stringify(got).slice(0, 300)}`);
  const guide = await tool("get_weave_guide", { language: "nl" });
  assert(guide.rules_as_of && guide.rules.length > 2000 && Array.isArray(guide.how), `the guide: ${JSON.stringify(guide).slice(0, 200)}`);
  assert(/isn't ready/.test(await refusedTool("get_weave_guide", { language: "de" })), "a guide for German");
  return `${got.words} words, the rules as of ${guide.rules_as_of}`;
});

await stage("a broken weave refused with its problems said, the request still the AI's; a clean one relayed, the request done, the copy gone", async () => {
  const weave = await weaveOf(sourceBook);
  const broken = structuredClone(weave);
  broken.sentences[0].t.pop();
  const said = await refusedTool("add_weave", { request_id: request.id, seat, weave: broken });
  assert(/doesn't pass yet/.test(said) && /Sentence 0/.test(said), `the refusal: ${said.slice(0, 300)}`);
  assert(/finish with couldnt|add_weave/.test(await refusedTool("finish_request", { request_id: request.id, seat, done: { said: "Wove it" } })), "finish_request took done for a weave");
  const added = await tool("add_weave", { request_id: request.id, seat, weave });
  assert(/^txc_/.test(added.change_id) && added.text_id === TEXT_ID && added.request?.state === "done", `add_weave: ${JSON.stringify(added).slice(0, 300)}`);
  assert(!weaveUploads().some((p) => p === `weave-for:${request.id}`), `the copy stayed: ${weaveUploads()}`);
  assert(/isn't here|done/.test(await refusedTool("get_text", { request_id: request.id })), "get_text still gave the text");
  return added.said;
});

await stage("the device takes the weave into its text, and the reader opens it woven", async () => {
  // The app's own poll takes it (read/text-inbox.js); a reload asks at once.
  let kept = null;
  for (let tries = 0; tries < 12 && !kept; tries++) {
    await page.reload();
    await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
    kept = await page.evaluate(async (id) => {
      const store = await import("/js/read/store.js");
      for (let waited = 0; waited < 5000; waited += 250) {
        const w = await store.getWeave(id, "nl");
        if (w) return { to: w.to, sentences: w.sentences.length };
        await new Promise((r) => setTimeout(r, 250));
      }
      return null;
    }, TEXT_ID);
  }
  assert(kept?.to === "nl" && kept.sentences === 2, `the weave on the device: ${JSON.stringify(kept)}`);
  await page.evaluate(async () => {
    const bank = await import("/js/read/bank.js");
    bank.addWord("nl", "kat");
    bank.addWord("nl", "hond");
  });
  await page.evaluate((id) => (location.hash = `#read/book/${encodeURIComponent(id)}`), TEXT_ID);
  await page.waitForSelector('[data-part="woven-word"]', { timeout: 20_000 });
  const woven = await page.evaluate(() => [...document.querySelectorAll('[data-part="woven-word"]')].map((n) => n.textContent.trim()));
  await page.screenshot({ path: join(OUT, "woven-390.png") });
  assert(woven.some((w) => /kat/.test(w)) && woven.some((w) => /hond/.test(w)), `woven words: ${JSON.stringify(woven)}`);
  return `woven: ${woven.join(", ")}`;
});

await stage("a second request canceled in the app: its copy gone from the server at once", async () => {
  await page.evaluate(() => (location.hash = "#today"));
  const second = await page.evaluate(async (id) => {
    const store = await import("/js/read/store.js");
    return (await import("/js/ai/client.js")).askToWeave((await store.getBook(id)).text, "nl");
  }, TEXT_ID);
  assert(weaveUploads().includes(`weave-for:${second.id}`), `no copy for the second request: ${weaveUploads()}`);
  const canceled = await page.evaluate(async (id) => (await import("/js/ai/client.js")).cancelRequest(id), second.id);
  assert(canceled?.state === "canceled", `cancel: ${JSON.stringify(canceled)}`);
  assert(!weaveUploads().includes(`weave-for:${second.id}`), `the copy stayed after the cancel: ${weaveUploads()}`);
  assert(/canceled|isn't here/.test(await refusedTool("get_text", { request_id: second.id })), "get_text gave a canceled request's text");
  return "canceled, its copy gone";
});

await stage("no page error", async () => {
  assert(!problems.length, problems.slice(0, 6).join(" | "));
});

writeFileSync(join(OUT, "weave-ai-check.json"), JSON.stringify({ results, problems }, null, 1));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\nweave ai check: ${failed} of ${results.length} stages FAILED` : `\nweave ai check: all ${results.length} stages passed`);
process.exit(failed ? 1 : 0);
