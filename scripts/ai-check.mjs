// Checks requests for your AI and Translate on a real device, in headless Chrome on a LOCAL server (it creates and
// deletes a test account, so never point it at the live site). Requests: each kind left from the app's own module
// (js/ai/client.js) and refused with words a person can read when it's wrong; your AI (played by this script over MCP
// with a personal token) lists them, takes each (the app shows who's on it), answers a question, makes a pack over the
// relay that the device takes, can't do a look and says why, can't take one canceled in the app, and waits for a
// practice the app asks for, which starts at once; the account's export has them. Translate (js/translate/translate.js):
// nothing typed, the starter both ways, a German pack and a Dutch picture book that only the library has (online, each
// credited), offline with only what's on the device, and that book kept on the device searched offline too. Fails on
// any console error. Chrome runs muted: nothing is heard.
//
// The library stages put a German default pack (scripts/fixtures/packs/check-de.json, through
// scripts/packs/seed-local.mjs) and a two-sentence Dutch book with an English help layer into the local server's
// library, and put its catalog back exactly as they found it at the end.
// Usage (headless Chrome, through the channel's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "ai check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/ai-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";
import { localR2 } from "./fixtures/local-r2.mjs";
import { bookVersion, segmentSentences, sentenceHash, tokenize, validateBook, validateWeave } from "../public/js/read/book-format.js";
import { bookPrefix, emptyCatalogue, layerEntry, layerKey, withBook } from "../public/js/read/catalogue.js";
import { LANGUAGES } from "../public/js/lang/index.js";
import { REQUEST_KINDS } from "../public/js/ai/requests.js";

const [BASE, OUT = "ai-check-out"] = process.argv.slice(2);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("ai-check creates and deletes an account: give it a local server, e.g. http://localhost:8825");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");
const PERSIST = process.argv.includes("--persist-to") ? resolve(process.argv[process.argv.indexOf("--persist-to") + 1]) : null;
if (!PERSIST) {
  console.error("ai-check puts a pack and a book into the local server's library: give --persist-to <its wrangler state dir>.");
  process.exit(2);
}

const results = [];
const problems = [];
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
const same = (actual, expected, what) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${what}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);

// What the console may say while a stage means it: a refusal's 400, a fetch while the device is offline.
let expected = null;
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (expected?.test(m.text())) return;
  problems.push(`console: ${m.text()}`);
});
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

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
async function until(fn, arg, timeout = 15_000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() > end) throw new Error(`still not true after ${timeout / 1000} s: ${fn.toString().slice(0, 160)}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

// The app's own modules, from the page.
const create = (input) =>
  page.evaluate(async (input) => {
    try {
      return { request: await (await import("/js/ai/client.js")).createRequest(input) };
    } catch (error) {
      return { error: error.message };
    }
  }, input);
const latest = () => page.evaluate(() => window.__ai.at(-1) ?? null);
const statusOf = (id) =>
  page.evaluate(async (id) => {
    const c = await import("/js/ai/client.js");
    const request = window.__ai.at(-1)?.requests.find((r) => r.id === id);
    return request ? { state: request.state, ...c.requestStatus(request), links: c.requestLinks(request), result: request.result ?? null } : null;
  }, id);
const waitFor = (id, state) => until(([id, state]) => window.__ai.at(-1)?.requests.some((r) => r.id === id && r.state === state), [id, state]);
const translate = (text, options) => page.evaluate(async ([text, options]) => (await import("/js/translate/translate.js")).translate(text, options), [text, options]);
const languages = () => page.evaluate(async () => (await import("/js/translate/translate.js")).translateLanguages());
const startWatch = () =>
  page.evaluate(async () => {
    window.__ai = [];
    window.__stopAi = (await import("/js/ai/client.js")).watchRequests((update) => window.__ai.push(update));
  });

// ---------- the local library ----------

// The library's bucket through one local R2 in this process (scripts/fixtures/local-r2.mjs), not a wrangler launch per object.
const r2 = localR2(APP, PERSIST);
const libraryGet = (key) => r2.getText("lexicommons-library", key);
const libraryPut = (key, text) => r2.put("lexicommons-library", key, text, "application/json");
const seed = (file, ...flags) => execFileSync("node", [join(APP, "scripts/packs/seed-local.mjs"), file, "--persist-to", PERSIST, ...flags], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
const originalCatalogue = await libraryGet("catalogue.json");

// A two-sentence Dutch picture-book text with its English help layer, as the books pipeline makes them.
async function checkBook() {
  const text = "Oma heeft een rode jas. De jas hangt aan de deur.";
  const words = tokenize(text, "nl");
  const paras = [{ k: "p", s: 0, e: words.length }];
  const book = {
    format: "lexicommons-book",
    v: 1,
    id: "ai-check-jas",
    version: "",
    title: "De rode jas",
    authors: [{ name: "Check Writer", role: "author" }],
    lang: "nl",
    source: { kind: "paste" },
    rights: { us: false, eu: false, spdx: "CC-BY-4.0", licence: "CC BY 4.0", licenceUrl: "https://creativecommons.org/licenses/by/4.0/", basis: "made for the check", attribution: [{ role: "author", name: "Check Writer" }], attributionText: "De rode jas, by Check Writer, CC BY 4.0" },
    words,
    italic: [],
    paras,
    chapters: [{ title: "One", para: 0 }],
    sentences: segmentSentences(words, paras, "nl"),
  };
  book.version = await bookVersion(book);
  const glosses = [
    { t: [["Grandma", "oma"], ["has", "hebben"], ["a", "een"], ["red", "rood"], ["coat.", "jas"]], text: "Grandma has a red coat.", m: [["Grandma", "Oma", [0], null], ["has", "heeft", [1], null], ["a", "een", [2], null], ["red", "rode", [3], null], ["coat.", "jas", [4], null]] },
    { t: [["The", "de"], ["coat", "jas"], ["hangs", "hangen"], ["on", "aan"], ["the", "de"], ["door.", "deur"]], text: "The coat hangs on the door.", m: [["The", "De", [0], null], ["coat", "jas", [1], null], ["hangs", "hangt", [2], null], ["on", "aan", [3], null], ["the", "de", [4], null], ["door.", "deur", [5], null]] },
  ];
  const sentences = [];
  for (const [x, [s, e]] of book.sentences.entries()) sentences.push({ s, e, h: await sentenceHash(words, s, e), ...glosses[x] });
  const layer = { format: "lexicommons-weave", v: 1, kind: "help", book: book.id, bookVersion: book.version, from: "nl", to: "en", licence: "CC BY-SA 4.0", credit: "Translated for the check", made: { pipeline: "ai-check", at: new Date().toISOString() }, sentences };
  const bookProblems = await validateBook(book);
  const layerProblems = await validateWeave(layer, book);
  if (bookProblems.length || layerProblems.length) throw new Error(`the check's book doesn't pass: ${[...bookProblems, ...layerProblems].slice(0, 4).join(" · ")}`);
  return { book, layer };
}

// ---------- signing up ----------

await stage("sign up and land in the app", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "AI Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  token = await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "AI check" }) })).json()).token);
  assert(token?.startsWith("lct_"), "a token for the AI");
  // As the AI section's page does on making one: the device learns it has an AI (shell/layout.js), which sets its polls' pace.
  for (const p of [page]) {
    await p.evaluate(async () => {
      const { whoAmI } = await import("/js/shell/api.js");
      const { setAiConnected } = await import("/js/shell/layout.js");
      setAiConnected((await whoAmI()).aiConnected);
    });
  }
  return "signed up, with a personal token for the AI";
});

// ---------- requests ----------

await stage("your AI's side: the request tools, the prompt, and the instructions tell it to look first", async () => {
  const init = await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "ai-check", version: "1" } });
  assert(/call list_requests/.test(init.instructions ?? ""), `instructions: ${String(init.instructions).slice(0, 200)}`);
  const tools = (await mcp("tools/list", {})).tools.map((t) => t.name);
  for (const name of ["list_requests", "take_request", "finish_request", "wait_for_request"]) assert(tools.includes(name), `no ${name}`);
  const prompts = (await mcp("prompts/list", {})).prompts.map((p) => p.name);
  assert(prompts.includes("do_my_requests"), JSON.stringify(prompts));
  return `${tools.length} tools, prompt do_my_requests`;
});

const ids = {};
await stage("leaving requests in the app: each kind checked, refused in words a person can read", async () => {
  await startWatch();
  await until(() => window.__ai.length > 0);
  same(await latest(), { requests: [], ai: null }, "nothing yet");
  expected = /status of 400/;
  const refusals = [
    [{ kind: "nope" }, new RegExp(`kind must be one of ${Object.keys(REQUEST_KINDS).join(", ")}\\.`)],
    [{ kind: "pack_new", language: "nl" }, /what is missing/],
    [{ kind: "pack_add", pack: "Not An Id", what: "x" }, /pack must be one of your packs' ids/],
    [{ kind: "ask", what: "Why?", about: { unit: "p:made-up" } }, /Dutch has no pattern "made-up"/],
    [{ kind: "practice", practice: { kind: "karaoke" } }, /kind must be one of/],
  ];
  for (const [input, message] of refusals) {
    const { error } = await create(input);
    assert(message.test(error ?? ""), `${JSON.stringify(input)}: ${error}`);
  }
  expected = null;
  const about = { where: "study", sentence: { id: "boek-gelezen", text: "Ik heb gisteren een boek gelezen.", literal: "I have yesterday a book read.", natural: "I read a book yesterday." }, game: "arrange", answer: "Ik heb een boek gisteren gelezen.", right: false, unit: "p:v2" };
  ids.ask = (await create({ kind: "ask", what: "Why does gisteren come before een boek?", about })).request.id;
  ids.pack = (await create({ kind: "pack_new", what: "A weekend in Utrecht", language: "nl" })).request.id;
  ids.look = (await create({ kind: "look", what: "Warmer colors and a serif font", fresh: true })).request.id;
  ids.later = (await create({ kind: "pack_add", pack: "ai-check-later", packName: "Later", what: "More about trains", due: true })).request.id;
  await until((n) => window.__ai.at(-1)?.requests.length === n, 4);
  const now = await latest();
  same(now.requests.map((r) => r.kind), ["pack_add", "look", "pack_new", "ask"], "newest first");
  const status = await statusOf(ids.ask);
  assert(status.mark === "waiting" && status.text === "Waiting for your AI · sent just now", JSON.stringify(status));
  const asked = now.requests.find((r) => r.id === ids.ask);
  same([asked.about.language, asked.about.unit.kind], ["nl", "pattern"], "the question's context, its language filled in");
  const copy = await page.evaluate(async (about) => (await import("/js/ai/client.js")).describeAsk({ what: "Why?", about }), about);
  assert(copy.startsWith("I'm learning Dutch with Lexicommons. Why?") && copy.includes("which was wrong (arrange)"), copy);
  return `5 refused, 4 waiting; "${status.text}"`;
});

await stage("your AI lists them, oldest first, with what was asked; the app sees it checked in", async () => {
  const list = await tool("list_requests");
  same(list.waiting.map((r) => r.kind), ["ask", "pack_new", "look", "pack_add"], "oldest first");
  const ask = list.waiting[0];
  assert(ask.kindName === "Ask a question" && ask.asked.what.startsWith("Why does") && ask.asked.about.sentence.literal === "I have yesterday a book read.", JSON.stringify(ask).slice(0, 300));
  await until(() => window.__ai.at(-1)?.ai?.client === "AI check");
  return `waiting: ${list.waiting.length}; checked in as "${(await latest()).ai.client}"`;
});

await stage("a question: taken (the app says who's on it), answered, the answer in parts for the screen", async () => {
  const taken = await tool("take_request", { request_id: ids.ask });
  assert(taken.seat && /\[\[ and \]\]/.test(taken.how) && taken.state === "taken", JSON.stringify(taken).slice(0, 300));
  await waitFor(ids.ask, "taken");
  const working = await statusOf(ids.ask);
  same([working.mark, working.text], ["working", "AI check is on it"], "while it works");
  assert(/isn't the seat take_request gave you/.test(await refusedTool("finish_request", { request_id: ids.ask, seat: "wrongseat", answer: "x" })), "a wrong seat is refused");
  // Taken: by its seat it comes back to whoever took it; without one, not even to an AI of the same name.
  same((await tool("take_request", { request_id: ids.ask, seat: taken.seat })).seat, taken.seat, "taken again with its seat");
  assert(/AI check has taken it/.test(await refusedTool("take_request", { request_id: ids.ask })), "taken again without a seat");
  const answer = "In a main clause the verb comes second: [[Ik heb]]. Time comes before the object: [[gisteren een boek]] (yesterday a book).";
  await tool("finish_request", { request_id: ids.ask, seat: taken.seat, answer });
  await waitFor(ids.ask, "done");
  const done = await statusOf(ids.ask);
  assert(done.mark === "done" && done.result.answer === answer, JSON.stringify(done));
  const parts = await page.evaluate(async (text) => (await import("/js/ai/client.js")).answerParts(text), done.result.answer);
  same(parts.filter((p) => p.language).map((p) => p.text), ["Ik heb", "gisteren een boek"], "the language's words");
  assert(/That request is done/.test(await refusedTool("take_request", { request_id: ids.ask })), "taken twice");
  return `"${done.text}"`;
});

await stage("a new pack: your AI makes it over the relay, this device takes it, and the request links to it", async () => {
  const taken = await tool("take_request", { request_id: ids.pack });
  assert(/create_pack/.test(taken.how), taken.how);
  assert(/answer is for a question/.test(await refusedTool("finish_request", { request_id: ids.pack, seat: taken.seat, answer: "x" })), "an answer to a pack request");
  const item = (sentence, lemmas, literal, english, natural, wrong, gap, patterns, extra = {}) => ({ sentence, lemmas, literal, english, natural, wrong, gap, topic: "travel", patterns, ...extra });
  const made = await tool("create_pack", {
    name: "Weekend in Utrecht",
    about: "Getting around Utrecht",
    language: "nl",
    topics: { travel: "Travel" },
    words: { waar: "where", station: "station", nemen: "to take", trein: "train" },
    items: [
      item("Waar is het station?", { waar: "waar", station: "station" }, ["Where", "is", "the station?"], [0, 1, 2], "Where is the station?", ["Waar het station is?", "Is waar het station?"], { word: "is", options: ["is", "zijn", "ben"] }, ["question"]),
      item("Morgen neem ik de trein.", { morgen: "morgen", neem: "nemen", trein: "trein" }, ["Tomorrow", "*take*", "I", "the train"], [0, 2, 1, 3], "Tomorrow I'm taking the train.", ["Morgen ik neem de trein.", "Ik morgen neem de trein."], { word: "neem", options: ["neem", "neemt", "nemen"] }, ["v2"], { moved: ["neem"] }),
    ],
  });
  assert(made.pack_id === "weekend-in-utrecht" && made.change_id, JSON.stringify(made));
  await page.evaluate(async () => (await import("/js/study/pack-inbox.js")).checkPackInbox());
  await until(async () => Boolean((await import("/js/study/packs.js")).yourPack("weekend-in-utrecht")), undefined, 20_000);
  const said = "Made Weekend in Utrecht: 2 sentences about getting around";
  await tool("finish_request", { request_id: ids.pack, seat: taken.seat, done: { said, links: { pack: made.pack_id, changes: [made.change_id] } } });
  await waitFor(ids.pack, "done");
  const done = await statusOf(ids.pack);
  same(done.links, [{ kind: "pack", id: "weekend-in-utrecht", label: "Open the pack" }], "its link");
  assert(done.text.endsWith(` · ${said}`) && done.text.startsWith("Done "), done.text);
  return `"${done.text}"`;
});

await stage("a look your AI couldn't do: it says why", async () => {
  const taken = await tool("take_request", { request_id: ids.look });
  assert(/done.links.changes/.test(await refusedTool("finish_request", { request_id: ids.look, seat: taken.seat, done: { said: "x", links: { changes: ["nope"] } } })), "a change id that isn't one");
  await tool("finish_request", { request_id: ids.look, seat: taken.seat, couldnt: "Your theme limit is reached; delete one and ask again." });
  await waitFor(ids.look, "couldnt");
  const status = await statusOf(ids.look);
  same([status.mark, status.text], ["failed", "Couldn't: Your theme limit is reached; delete one and ask again."], "the app's words");
  return status.text;
});

await stage("canceled in the app: no AI can take it, and it can't be canceled twice", async () => {
  const canceled = await page.evaluate(async (id) => (await import("/js/ai/client.js")).cancelRequest(id), ids.later);
  assert(canceled.state === "canceled", JSON.stringify(canceled));
  await waitFor(ids.later, "canceled");
  assert(/That request is canceled/.test(await refusedTool("take_request", { request_id: ids.later })), "an AI can't take it");
  expected = /status of 400/;
  const again = await page.evaluate(async (id) => (await import("/js/ai/client.js")).cancelRequest(id).then(() => "canceled", (e) => e.message), ids.later);
  expected = null;
  assert(again === "That request has finished.", again);
  return (await statusOf(ids.later)).text;
});

await stage("a practice: your AI waits, the app asks, and the practice starts the moment it's taken", async () => {
  const waiting = tool("wait_for_request", { wait_seconds: 20 });
  await new Promise((r) => setTimeout(r, 1500));
  const started = Date.now();
  ids.practice = (await create({ kind: "practice", practice: { kind: "conversation", topic: "the weekend" } })).request.id;
  const woke = await waiting;
  assert(woke.status === "request" && woke.request_id === ids.practice && woke.asked.practice.language === "nl", JSON.stringify(woke).slice(0, 300));
  const ms = Date.now() - started;
  const taken = await tool("take_request", { request_id: ids.practice });
  assert(taken.state === "done" && taken.practice?.practice_id && taken.practice.language === "nl" && /practice_wait with its practice_id/.test(taken.how), JSON.stringify(taken).slice(-400));
  const practices = await tool("list_practices");
  assert(JSON.stringify(practices).includes(taken.practice.practice_id), "the practice is the account's");
  await waitFor(ids.practice, "done");
  const status = await statusOf(ids.practice);
  same(status.links, [{ kind: "practice", id: taken.practice.practice_id, label: "Open the practice" }], "its link");
  const none = await tool("wait_for_request", { wait_seconds: 5 });
  assert(none.status === "none" && /wait_for_request again/.test(none.next), JSON.stringify(none));
  // Another practice asked for while that one is open: never cut off, it waits.
  const second = (await create({ kind: "practice", practice: { kind: "roleplay" } })).request.id;
  assert(/A practice is going on in their app right now/.test(await refusedTool("take_request", { request_id: second })), "a second practice while one is open");
  const first = (await tool("list_practices")).find((p) => p.practice_id === taken.practice.practice_id);
  assert(first && first.state !== "ended", `the first practice is still open: ${JSON.stringify(first)}`);
  await waitFor(second, "waiting");
  await page.evaluate(async (id) => (await import("/js/ai/client.js")).cancelRequest(id), second);
  return `woke ${ms} ms after the app asked; "${status.text}"; a second waits while it's open`;
});

await stage("the account's export has the requests and when your AI last checked in", async () => {
  const exported = await page.evaluate(async () => (await fetch("/api/me/export")).json());
  const requests = exported.practice.requests;
  same(requests.map((r) => [r.kind, r.state]), [["ask", "done"], ["pack_new", "done"], ["look", "couldnt"], ["pack_add", "canceled"], ["practice", "done"], ["practice", "canceled"]], "the requests");
  assert(exported.practice.aiCheckedIn?.client === "AI check", JSON.stringify(exported.practice.aiCheckedIn));
  await page.evaluate(() => window.__stopAi());
  return `${requests.length} requests`;
});

// ---------- the AI tab ----------

await stage("the AI tab: Practice with me the one card (the bubbles sentences you know, each on one line), the kinds as rows, your AI and when it was here at the foot, your requests on their own page with where each is, an answer's page, a new pack sent and canceled", async () => {
  // AI is a row on Home until the switch puts it in the tab bar.
  await page.evaluate(() => localStorage.setItem("lx.shell.v1", JSON.stringify({ third: "ai" })));
  await page.goto(`${BASE}/app/#ai`);
  await page.reload();
  await page.waitForSelector('[data-part="ai-practice"]');
  const tabs = await page.locator('[data-part="tab-bar"] [data-part="tab"]:visible').allTextContents();
  same(tabs, ["Home", "Study", "Knowledge", "AI", "Explore"], "the tabs"); // the bar with Knowledge, and AI once the switch puts it there
  // The card: its bubbles the learner's own sentences, each on one line; Start the page's one solid, opening Practice.
  const card = await page.evaluate(async () => {
    const { ITEMS, sentence } = await import("/js/study/content.js");
    const known = new Set(ITEMS.map((item) => sentence(item)));
    const lines = (node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return new Set([...range.getClientRects()].filter((r) => r.width).map((r) => Math.round(r.top))).size;
    };
    const words = [...document.querySelectorAll('[data-part="ai-practice"] .lx-hc-words')];
    return { said: words.map((w) => w.textContent), ours: words.every((w) => known.has(w.textContent)), oneLine: words.every((w) => lines(w) === 1), solids: document.querySelectorAll('[data-part="page"]:not([data-ghost]) [data-part="button"][data-variant="go"]').length };
  });
  assert(card.said.length === 2 && card.ours && card.oneLine, `the card's bubbles: ${JSON.stringify(card)}`);
  same(card.solids, 1, "one solid on the page");
  // Your AI and when it was here: the Connection row's value, quiet at the foot.
  await until(() => /^AI check · /.test(document.querySelector('[data-part="list-row"][href="#ai/connect"] .lx-row-value')?.textContent ?? ""));
  const who = (await page.locator('[data-part="list-row"][href="#ai/connect"] .lx-row-value').textContent()).trim();
  // What you can ask for: a row for every kind but Practice (the card), a free question and one asked from elsewhere (a weave, from the reader).
  const kinds = await page.locator('[data-part="list-row"][href^="#ai/new/"]').evaluateAll((ks) => ks.map((k) => k.getAttribute("href")));
  const expected = await page.evaluate(async () => Object.entries((await import("/js/ai/client.js")).REQUEST_KINDS).filter(([k, kind]) => k !== "practice" && k !== "ask" && !kind.from).map(([k]) => k).map((k) => `#ai/new/${k}`));
  same([...kinds].sort(), [...expected].sort(), "a row for every kind");
  await page.screenshot({ path: join(OUT, "shots", "ai-tab.png") });
  // Every request, with where it is (an icon and words for each state), on their own page.
  await page.locator('[data-part="list-row"][href="#ai/requests"]').click();
  await page.waitForFunction(() => location.hash === "#ai/requests");
  await page.locator('[data-part="request-row"]').first().waitFor();
  const rows = await page.locator('[data-part="request-row"]').evaluateAll((rs) => rs.map((r) => [r.getAttribute("data-state"), r.querySelector(".lx-request-status").textContent]));
  for (const mark of ["done", "failed", "canceled"]) assert(rows.some(([state]) => state === mark), `a ${mark} row: ${JSON.stringify(rows)}`);
  assert(rows.every(([, text]) => text.trim().length > 0), "every row says where it is");
  await page.screenshot({ path: join(OUT, "shots", "ai-requests.png") });
  // The answered question opens on its own page, the language's words marked and put in as text.
  await page.locator(`[data-part="request-row"] a[href="#ai/request/${ids.ask}"]`).click();
  await page.waitForSelector(".lx-ai-answer");
  const said = await page.locator(".lx-ai-answer .lx-ai-said").evaluateAll((spans) => spans.map((s) => [s.textContent, s.getAttribute("lang")]));
  same(said, [["Ik heb", "nl"], ["gisteren een boek", "nl"]], "the answer's Dutch");
  assert((await page.locator('[data-part="app-back"]').getAttribute("href")) === "#ai", "back to the AI tab");
  await page.screenshot({ path: join(OUT, "shots", "ai-answer.png") });
  // A kind's own page from its row: a new pack, its language picked by name and flag, sent, waiting on your requests, and canceled there.
  await page.goto(`${BASE}/app/#ai`);
  await page.locator('[data-part="list-row"][href="#ai/new/pack_new"]').click();
  await page.locator('[data-part="page-title"]', { hasText: "Make a new pack" }).waitFor();
  assert(await page.locator('[data-part="radio-row"] [data-part="language-flag"], [data-part="list-row"] [data-part="language-flag"], label [data-part="language-flag"]').count(), "the languages carry their flags");
  await page.locator('textarea[aria-label="What it\'s for"]').fill("A day at the market");
  await page.locator('[data-part="pinned-actions"] [data-part="button"]', { hasText: "Send to your AI" }).click();
  await page.waitForFunction(() => location.hash === "#ai");
  await page.goto(`${BASE}/app/#ai/requests`);
  const waiting = page.locator('[data-part="request-row"][data-state="waiting"]', { hasText: "A day at the market" });
  await waiting.waitFor();
  await waiting.locator('[data-part="button"]', { hasText: "Cancel" }).click();
  await page.locator('[data-part="request-row"][data-state="canceled"]', { hasText: "A day at the market" }).waitFor();
  // Practice lives in the tab now: its page lights AI and goes back to it; the old address opens it too.
  await page.goto(`${BASE}/app/#ai`);
  await page.locator('[data-part="list-row"]', { hasText: "Past practices" }).click();
  await page.waitForFunction(() => location.hash === "#practice");
  await page.waitForFunction(() => document.querySelector('[data-part="tab"][data-state="active"]')?.textContent.includes("AI"));
  assert((await page.locator('[data-part="app-back"]').getAttribute("href")) === "#ai", "Practice goes back to the AI tab");
  await page.goto(`${BASE}/app/#practise`);
  await page.waitForFunction(() => location.hash === "#practice");
  return `"${card.said.join('" / "')}"; ${who}; ${kinds.length} kinds; ${rows.length} requests (${[...new Set(rows.map(([state]) => state))].join(", ")}); the answer's page; a new pack sent and canceled; Practice under AI`;
});

// ---------- Translate ----------

/** Dutch first and on this device, German online only; on a state with a copy of the open library, its other
 *  languages follow, online only too. */
function languagesAre(langs, what) {
  const pairs = langs.map((l) => [l.code, l.offline]);
  assert(JSON.stringify(pairs[0]) === '["nl",true]' && pairs.some(([code, offline]) => code === "de" && offline === false), `${what}: ${JSON.stringify(pairs)}`);
  assert(pairs.slice(1).every(([code, offline]) => offline === false && Object.hasOwn(LANGUAGES, code)), `${what}: ${JSON.stringify(pairs)}`);
}

await stage("Translate on this device: nothing typed is null, the starter both ways, the direction guessed", async () => {
  same([await translate(""), await translate("   ")], [null, null], "nothing typed");
  const boek = await translate("boek", { from: "nl", to: "en" });
  same(boek.words.map((w) => [w.text, w.en, w.source]), [["boek", "book", "pack:starter-word-order"]], "boek");
  same(boek.sources.find((source) => source.id === "pack:starter-word-order"), { id: "pack:starter-word-order", kind: "pack", name: "Starter: Dutch word order", credit: "Lexicommons" }, "credited");
  // On a state with a copy of the open library, its books with an English layer say "boek" too, and so do the library's
  // own Dutch packs (path-nl, the word bands): each credited. A pack the catalog doesn't list as Lexicommons' own, or a
  // book with no credit or license, isn't.
  const own = new Set((originalCatalogue ? JSON.parse(originalCatalogue).packs?.nl ?? [] : []).map((entry) => `pack:${entry.id}`));
  const credited = (source, ours = own) =>
    source.id === "pack:starter-word-order" ||
    (source.kind === "pack" && ours.has(source.id) && source.credit === "Lexicommons") ||
    (source.kind === "book" && Boolean(source.credit) && Boolean(source.license));
  // The rule refuses what it should first: a pack not in the catalog, one in it credited to someone else, a book with no license.
  same(
    [
      credited({ id: "pack:not-in-the-catalog", kind: "pack", name: "Not ours", credit: "Lexicommons" }, new Set()),
      credited({ id: "pack:shared-one", kind: "pack", name: "Someone's", credit: "Shared in Explore (CC BY-SA 4.0)" }, new Set(["pack:shared-one"])),
      credited({ id: "book:x:nl", kind: "book", name: "No license", credit: "Someone" }),
      credited({ id: "pack:path-nl", kind: "pack", name: "Dutch lessons", credit: "Lexicommons" }, new Set(["pack:path-nl"])),
    ],
    [false, false, false, true],
    "the credit rule on planted sources",
  );
  assert(boek.sources.every((source) => credited(source)), `every other source the library's own pack or book, credited: ${JSON.stringify(boek.sources)}`);
  assert(boek.online === true && boek.sentences.length > 0, JSON.stringify(boek).slice(0, 300));
  const back = await translate("I read a book yesterday.", { from: "en", to: "nl" });
  assert(back.whole?.text === "Ik heb gisteren een boek gelezen." && back.from === "en" && back.to === "nl", JSON.stringify(back.whole));
  const guessed = await translate("gelezen");
  same([guessed.from, guessed.to, guessed.words[0]?.lemma], ["nl", "en", "lezen"], "guessed");
  return `boek → book; "${back.whole.translation}" → "${back.whole.text}"`;
});

let book = null;
let layer = null;
await stage("online: a German pack and a Dutch picture book only the library has, each credited", async () => {
  ({ book, layer } = await checkBook());
  await libraryPut(`${bookPrefix(book)}/book.json`, JSON.stringify(book));
  const layerText = JSON.stringify(layer);
  const key = layerKey(book, layer, createHash("sha256").update(layerText).digest("hex"));
  await libraryPut(key, layerText);
  const base = originalCatalogue === null ? emptyCatalogue() : JSON.parse(originalCatalogue);
  const shelved = withBook(base, book, { en: layerEntry(layer, key) }, new Date().toISOString());
  assert(shelved.catalogue, shelved.problems.join(" · "));
  await libraryPut("catalogue.json", JSON.stringify(shelved.catalogue, null, 2));
  seed(join(HERE, "fixtures/packs/check-de.json"));
  // The server rebuilds an index once it sees the catalog changed, which it checks at most every 30 s.
  const started = Date.now();
  let jas = await translate("jas", { from: "nl", to: "en" });
  while (!jas.words.length && Date.now() - started < 45_000) {
    await new Promise((r) => setTimeout(r, 2000));
    jas = await translate("jas", { from: "nl", to: "en" });
  }
  const waited = Math.round((Date.now() - started) / 1000);
  same(jas.words.map((w) => [w.text, w.en, w.source]), [["jas", "coat", "book:ai-check-jas:nl"]], "jas");
  same(jas.sources, [{ id: "book:ai-check-jas:nl", kind: "book", name: "De rode jas", credit: "De rode jas, by Check Writer, CC BY 4.0 · English: Translated for the check (CC BY-SA 4.0)", license: "CC BY 4.0" }], "the book and its layer credited");
  assert(jas.online && jas.sentences.length === 2, JSON.stringify(jas.sentences));
  // Nothing typed says which way, and this device knows neither word: the server, which does, picks the direction.
  const guessed = await translate("jas");
  same([guessed.from, guessed.to, guessed.words[0]?.en], ["nl", "en", "coat"], "the direction from the server");
  const whole = await translate("The coat hangs on the door.", { from: "en", to: "nl" });
  same(whole.whole?.text, "De jas hangt aan de deur.", "the whole sentence back");
  const buch = await translate("Buch", { from: "de", to: "en" });
  assert(buch.words.length && buch.words.every((w) => w.source === "pack:check-de") && buch.sources[0].credit === "Lexicommons", JSON.stringify(buch).slice(0, 300));
  const langs = await languages();
  languagesAre(langs, "languages: yours first, German online only");
  const wrong = await page.request.post(`${BASE}/api/translate`, { data: { q: "x", from: "nl", to: "de" } });
  assert(wrong.status() === 400 && /between English and one language/.test((await wrong.json()).error), `nl → de: ${wrong.status()}`);
  return `jas → coat (${jas.sources[0].name}, found after ${waited} s); Buch → ${buch.words[0].en}; languages ${langs.map((l) => l.code).join(", ")}`;
});

await stage("offline: only what's on this device; what only the library has isn't found", async () => {
  expected = /ERR_INTERNET_DISCONNECTED|Failed to fetch/;
  await context.setOffline(true);
  try {
    const boek = await translate("boek", { from: "nl", to: "en" });
    assert(boek.online === false && boek.words[0]?.en === "book", JSON.stringify(boek).slice(0, 200));
    const jas = await translate("jas", { from: "nl", to: "en" });
    same([jas.online, jas.words.length, jas.unknown], [false, 0, ["jas"]], "jas offline");
    const buch = await translate("Buch", { from: "de", to: "en" });
    same([buch.words.length, buch.unknown, buch.sources], [0, ["buch"], []], "German offline");
  } finally {
    await context.setOffline(false);
    expected = null;
  }
  return "boek found; jas and Buch not, offline";
});

await stage("a book kept on this device is searched offline too, with its credit", async () => {
  await page.evaluate(async ([book, layer]) => (await import("/js/read/store.js")).addBook(book, { en: layer }), [book, layer]);
  expected = /ERR_INTERNET_DISCONNECTED|Failed to fetch/;
  await context.setOffline(true);
  try {
    const jas = await translate("jas", { from: "nl", to: "en" });
    assert(jas.online === false && jas.words[0]?.en === "coat" && jas.sources[0]?.credit.startsWith("De rode jas, by Check Writer"), JSON.stringify(jas).slice(0, 300));
    const whole = await translate("De jas hangt aan de deur.", { from: "nl", to: "en" });
    same([whole.whole?.translation, whole.words.map((w) => w.text).join(" ")], ["The coat hangs on the door.", "de jas hangt aan de deur"], "the sentence and its words");
    languagesAre(await languages(), "languages offline");
  } finally {
    await context.setOffline(false);
    expected = null;
  }
  await page.evaluate(async (id) => (await import("/js/read/store.js")).removeBook(id), book.id);
  return "jas → coat offline, from the kept book";
});

await stage("the local library is put back as it was found", async () => {
  seed("--remove", "check-de", "--language", "de");
  if (originalCatalogue === null) await r2.remove("lexicommons-library", "catalogue.json");
  else await libraryPut("catalogue.json", originalCatalogue);
  assert((await libraryGet("catalogue.json")) === originalCatalogue, "the catalog differs from the one found");
  return originalCatalogue === null ? "no catalog, as before" : "the catalog as found";
});

await stage("deleting the account", async () => {
  await page.goto(`${BASE}/app/#settings/account`);
  await page.waitForSelector('[data-part="list-row"]');
  await page.screenshot({ path: join(OUT, "shots", "settings-data.png") });
  await page.locator('[data-part="list-row"]', { hasText: "Delete my account" }).click();
  await page.locator('[data-part="list-row"]', { hasText: "Press again to delete it for good" }).click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  const after = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  assert(after.status === 401, `the token after the delete: ${after.status}`);
  return "signed out; the token no longer works";
});

await stage("no console errors", async () => {
  assert(!problems.length, problems.slice(0, 5).join(" · "));
  return "none";
});

await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} stages passed`);
process.exit(failed ? 1 : 0);
