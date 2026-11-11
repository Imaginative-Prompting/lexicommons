// Weaving a text of yours with your AI, on a phone in headless Chrome on a LOCAL server (it creates a test account; never
// the live site): read/reader.js offerWeave, ai/client.js askToWeave, ai/requests.js "weave", read/text-inbox.js's "weave" change.
// A learner a few weeks into Dutch has a text of their own in English: the shelf's Alice, copied in as theirs (its version is
// its content's, so the shelf's own weave fits it with only its book id changed, and validateWeave is the real check).
//   - No AI connected: no offer, nothing in Contents (a control for the rest).
//   - An AI connected (a personal token): the offer once, at the reader's foot, saying the text goes to the AI; Contents' row; none
//     for a shelf book or a text already in Dutch. Not now kept for that text, Contents still offering it.
//   - The press: the text goes up (POST /api/ai/weave-texts, the book as this device keeps it, passing validateBook), then a
//     "weave" request naming it; "Sent to your AI"; Contents waiting, then (the AI takes it over MCP) working, live.
//   - Back woven: the change through the relay, checked again here and kept; Contents' Read it woven opens it woven at the
//     same word; Read's tile says it's woven; the request done, linked to the text on Your requests.
//   - A change for a text this device hasn't got reports "missing" with no row and no toast; a weave that fails the check here
//     reports failed with why, never as a text it couldn't add; an AI that couldn't: Contents says why, with Ask again.
// Until the server side lands (lex-retention: the upload, add_weave, the relay's "weave" change), --standin plays it with
// routes: the upload answered, the AI's done through finish_request, the relay's change and file served, the reports kept.
// Without --standin it runs on the real server: add_weave over MCP, and the relay's own change.
// Usage (from the channel repo root, sandbox off):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "weave check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/weave-check.mjs http://localhost:<port> <outDir> [--standin]

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { sentenceHash, validateBook } from "../public/js/read/book-format.js";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const STANDIN = argv.includes("--standin");
if (!BASE || !outArg) {
  console.error("usage: node scripts/weave-check.mjs http://localhost:<port> <outDir> [--standin]");
  process.exit(2);
}
if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(BASE)) {
  console.error("weave-check creates a test account: LOCAL servers only.");
  process.exit(2);
}
const OUT = resolve(outArg);
mkdirSync(join(OUT, "shots"), { recursive: true });
setTimeout(() => (console.error("ceiling: 8 minutes"), process.exit(3)), 8 * 60_000).unref();

const results = [];
const problems = [];
async function stage(name, fn) {
  try {
    const said = await fn();
    results.push({ name, ok: true, said });
    console.log(`ok    ${name}${said ? `: ${said}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block" });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
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
async function until(fn, arg, timeout = 15_000) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() > end) throw new Error(`still not true after ${timeout / 1000} s: ${fn.toString().slice(0, 160)}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}
const shot = (name) => page.screenshot({ path: join(OUT, "shots", `${name}.png`) });
const goto = async (hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(300);
};
// The reader on one of the texts, ready.
async function openText(id) {
  await goto("#read");
  await goto(`#read/book/${encodeURIComponent(id)}`);
  await page.waitForSelector('[data-part="reader"][data-ready]', { timeout: 30_000 });
  await page.waitForTimeout(1200);
}
async function closeReader() {
  await page.keyboard.press("Escape");
  await goto("#read");
  await page.waitForTimeout(400);
}
const contentsRow = async () => {
  await page.getByRole("button", { name: "Contents" }).click();
  await page.waitForTimeout(700);
  const row = await page.evaluate(() => {
    const group = document.querySelector('[data-part="reader"] .lx-reader-weave');
    return group ? { title: group.querySelector(".lx-row-title")?.textContent ?? "", sub: group.querySelector(".lx-row-sub")?.textContent ?? "", button: group.querySelector('[data-part="button"]')?.textContent ?? "" } : null;
  });
  return row;
};
const closeSheet = async () => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
};

// ---------- the texts ----------

const MINE = "paste-weave-check";
const SECOND = "paste-weave-check-2";
let book = null;
let weave = null;

/**
 * On the real server, add_weave holds a weave to the books pipeline's rules too (the shelf's Alice was woven before them, and is
 * refused), so the text woven there is a short one woven word for word, as an AI following the guide would: Dutch for every word.
 */
const SHORT = "The cat sleeps. The dog barks.";
async function weaveOfShort(text) {
  const NL = { The: ["De", "de"], cat: ["kat", "kat"], "sleeps.": ["slaapt.", "slapen"], dog: ["hond", "hond"], "barks.": ["blaft.", "blaffen"] };
  const sentences = [];
  for (const [s, e] of text.sentences) {
    const words = text.words.slice(s, e);
    const t = words.map((w) => NL[w]);
    sentences.push({ s, e, h: await sentenceHash(text.words, s, e), t, text: t.map((x) => x[0]).join(" "), m: t.map((x, i) => [x[0], words[i], [i], null]) });
  }
  return { format: "lexicommons-weave", v: 1, kind: "weave", book: text.id, bookVersion: text.version, from: text.lang, to: "nl", sentences };
}

await stage("sign up, learning Dutch a few weeks in, with two texts of its own in English (the shelf's Alice copied in; on the real server, the one woven a short text woven word for word)", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Weave Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  // A learner 20 lessons in, so the woven text has Dutch in it.
  await page.evaluate(async () => {
    await (await import("/js/study/packs.js")).syncLibraryPacks();
    const { pathLessons } = await import("/js/study/path.js");
    const { record } = await import("/js/study/progress.js");
    for (let i = 0; i < 300 && !pathLessons().length; i++) await new Promise((done) => setTimeout(done, 100));
    pathLessons()
      .slice(0, 20)
      .forEach((lesson, i) => {
        const at = Date.now() - (24 - i) * 86_400_000;
        record(lesson.things.filter((one) => !one.formOnly).flatMap((thing) => [0, 1, 2].map((n) => ({ concept: thing.unit, at: at + n * 1000, outcome: "right", test: "recall", skill: "read" }))));
      });
  });
  const catalog = await (await fetch(`${BASE}/library/catalogue.json`)).json();
  const alice = catalog.books.find((b) => b.layers?.nl?.kind === "weave" && b.lang === "en");
  assert(alice, "the local library has a book woven into Dutch (npm run local seeds Alice)");
  book = await (await fetch(`${BASE}${alice.book}`)).json();
  weave = await (await fetch(`${BASE}${alice.layers.nl.url}`)).json();
  // On the real server the text woven is the short one (weaveOfShort), under the same id and title.
  if (!STANDIN) {
    const short = await page.evaluate(async (raw) => (await import("/js/read/import-text.js")).bookFromText(raw, { title: "Alice, pasted", lang: "en" }), SHORT);
    book = { ...short, id: MINE };
    weave = await weaveOfShort(book);
    await page.evaluate(async () => {
      const bank = await import("/js/read/bank.js");
      bank.addWord("nl", "kat");
      bank.addWord("nl", "hond");
    });
  }
  const texts = [
    { ...book, id: MINE, title: "Alice, pasted", source: { kind: "paste" } },
    { ...(STANDIN ? book : await (await fetch(`${BASE}${alice.book}`)).json()), id: SECOND, title: "Alice, again", source: { kind: "paste" } },
  ];
  for (const text of texts) assert(!(await validateBook(text)).length, `${text.id} passes the book check`);
  await page.evaluate(async (texts) => {
    const store = await import("/js/read/store.js");
    for (const text of texts) await store.addBook(text);
    // A text of its own already in Dutch: nothing to weave into the language it's in.
    const { bookFromText } = await import("/js/read/import-text.js");
    const dutch = await bookFromText("Ik lees een boek. Het is mooi.", { title: "In het Nederlands", lang: "nl" });
    await store.addBook({ ...dutch, id: "paste-weave-check-nl", source: { kind: "paste" } });
  }, texts);
  return `${book.words.length} words, ${book.sentences.length} sentences; the weave ${weave.sentences.length} sentences`;
});

// ---------- no AI ----------

await stage("no AI connected: no offer and nothing in Contents", async () => {
  await openText(MINE);
  await page.waitForTimeout(1500);
  assert(!(await page.locator('[data-part="reader-offer"]').count()), "an offer with no AI");
  assert((await contentsRow()) === null, "a weave row in Contents with no AI");
  await shot("1-no-ai");
  await closeSheet();
  await closeReader();
  return "none";
});

// ---------- an AI connected ----------

await stage("an AI connected: the offer once, at the reader's foot, out of a sheet's way; Contents' row; none for a shelf book or a Dutch text", async () => {
  token = await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Weave check" }) })).json()).token);
  assert(token?.startsWith("lct_"), "a token for the AI");
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await openText(MINE);
  const offer = page.locator('[data-part="reader-offer"]');
  await offer.waitFor({ timeout: 10_000 });
  const words = await offer.textContent();
  assert(/Weave it into Dutch\?/.test(words), `the offer: ${words}`);
  assert(/The text goes to it through your account/.test(words), "the offer says the text goes to the AI");
  // It sits over the reader's foot, inside the screen, with the page count put away under it.
  const box = await offer.boundingBox();
  assert(box && box.y + box.height <= 844 && box.x >= 0 && box.x + box.width <= 390, `the offer's box: ${JSON.stringify(box)}`);
  assert(await page.evaluate(() => getComputedStyle(document.querySelector('[data-part="reader-status"]')).visibility === "hidden"), "the page count under the offer");
  await shot("2-offer");
  const row = await contentsRow();
  assert(row?.title === "Weave it into Dutch" && row.button === "Weave it", `Contents: ${JSON.stringify(row)}`);
  // A sheet up while the offer is (Contents here; a highlight's note, Highlights, Settings and a word's card the same): the offer steps
  // aside, so what's at the sheet's foot can be pressed where the offer was (it sat over it: "Remove highlight" couldn't be pressed); it's
  // back once the sheet goes.
  const under = await page.evaluate(({ x, y, width, height }) => {
    const at = document.elementFromPoint(x + width / 2, y + height / 2);
    return {
      inSheet: Boolean(at?.closest('[data-part="reader"] > [data-part="sheet"]:not([hidden])')),
      offerShown: getComputedStyle(document.querySelector('[data-part="reader-offer"]')).visibility !== "hidden",
      at: at?.closest("[data-part]")?.getAttribute("data-part") ?? at?.tagName ?? null,
    };
  }, box);
  assert(under.inSheet && !under.offerShown, `with Contents up, where the offer was: ${JSON.stringify(under)}`);
  await closeSheet();
  // Back once the sheet has slid away, faded in.
  const back = await page
    .waitForFunction(() => {
      const style = getComputedStyle(document.querySelector('[data-part="reader-offer"]'));
      return style.visibility !== "hidden" && Number(style.opacity) > 0.99;
    }, null, { timeout: 3000 })
    .then(() => true, () => false);
  assert(back, "the offer didn't come back once the sheet went");
  await closeReader();
  for (const [what, open] of [
    ["a text in Dutch", () => openText("paste-weave-check-nl")],
    ["a shelf book", async () => {
      await goto("#read/find");
      await page.waitForTimeout(1200);
      await page.locator('[data-part="page"]:not([data-ghost]) a, [data-part="page"]:not([data-ghost]) button', { hasText: "Alice’s Adventures" }).first().click();
      await page.waitForSelector('[data-part="reader"][data-ready]', { timeout: 60_000 });
      await page.waitForTimeout(1500);
    }],
  ]) {
    await open();
    assert(!(await page.locator('[data-part="reader-offer"]').count()), `an offer on ${what}`);
    assert((await contentsRow()) === null, `a weave row on ${what}`);
    await closeSheet();
    await closeReader();
  }
  return words.replace(/\s+/g, " ").trim();
});

await stage("Not now: kept for that text, Contents still offering it", async () => {
  await openText(SECOND);
  await page.locator('[data-part="reader-offer"] [aria-label="Not now"]').click();
  assert(!(await page.locator('[data-part="reader-offer"]').count()), "the offer stays after Not now");
  await closeReader();
  await openText(SECOND);
  await page.waitForTimeout(1500);
  assert(!(await page.locator('[data-part="reader-offer"]').count()), "the offer back after Not now");
  const row = await contentsRow();
  assert(row?.button === "Weave it", `Contents after Not now: ${JSON.stringify(row)}`);
  await closeSheet();
  await closeReader();
  return "put away for that text only";
});

// ---------- the press ----------

// The server's side, played until it lands (--standin): the upload, the relay's change, its file, the reports.
const uploads = [];
const reports = [];
const relay = { texts: [] };
if (STANDIN) {
  await page.route("**/api/ai/weave-texts", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "null");
    uploads.push(body);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ upload: `upl_weavecheck${String(uploads.length).padStart(2, "0")}`, expiresAt: Date.now() + 3_600_000 }) });
  });
  await page.route("**/api/packs/inbox*", async (route) => {
    const response = await route.fetch();
    const answer = response.status() === 204 ? { changes: [], texts: [] } : await response.json();
    const texts = relay.texts.splice(0);
    if (!texts.length && response.status() === 204) return route.fulfill({ response });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...answer, texts: [...(answer.texts ?? []), ...texts] }) });
  });
  await page.route("**/api/texts/files/**", async (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop());
    const change = relay.files?.[id];
    if (!change) return route.continue();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(change) });
  });
  await page.route("**/api/texts/changes/*/report", async (route) => {
    const id = decodeURIComponent(new URL(route.request().url()).pathname.split("/").slice(-2)[0]);
    if (!id.startsWith("txc_weavecheck")) return route.continue();
    reports.push({ id, ...JSON.parse(route.request().postData() ?? "{}") });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
}
// The server's copy of the requests, from the app's side.
const requests = () => page.evaluate(async () => (await (await fetch("/api/ai/requests", { cache: "no-store" })).json()).requests);
let request = null;
let seat = null;

await stage("the press: the text goes up as this device keeps it, then a weave request naming it; Sent; Contents waiting", async () => {
  await openText(MINE);
  await page.getByRole("button", { name: "Weave it with your AI" }).click();
  await until(() => document.querySelector('[data-part="reader-offer"]')?.textContent.includes("Sent to your AI"));
  await shot("3-sent");
  if (STANDIN) {
    assert(uploads.length === 1, `uploads: ${uploads.length}`);
    const sent = uploads[0].book;
    assert(sent?.id === MINE && sent.version === book.version && sent.words.length === book.words.length, "the upload is the text as this device keeps it");
    const why = await validateBook(sent);
    assert(!why.length, `the upload fails the book check: ${why[0]}`);
  }
  request = (await requests()).find((r) => r.kind === "weave" && r.book === MINE);
  assert(request, "a weave request on the server");
  assert(request.title === "Alice, pasted" && request.language === "nl" && request.state === "waiting", `the request: ${JSON.stringify(request)}`);
  await page.locator('[data-part="reader-offer"] [aria-label="Not now"]').click();
  const row = await contentsRow();
  assert(row?.title === "Waiting for your AI", `Contents: ${JSON.stringify(row)}`);
  await shot("4-waiting");
  return `${request.id}: ${request.what}`;
});

await stage("your AI takes it over MCP: Contents says it's on it, live", async () => {
  const listed = await tool("list_requests");
  const mine = listed.waiting?.find((r) => r.request_id === request.id);
  assert(mine, `list_requests has it waiting: ${JSON.stringify(listed).slice(0, 300)}`);
  assert(mine.kindName === "Weave a text", `its kind's name: ${mine.kindName}`);
  assert(mine.asked.book === MINE && mine.asked.language === "nl", `asked: ${JSON.stringify(mine.asked)}`);
  if (!STANDIN) assert(!("upload" in mine.asked), "the upload's id shown to the AI");
  seat = (await tool("take_request", { request_id: request.id })).seat;
  assert(seat, "take_request gave a seat");
  await until(() => document.querySelector('[data-part="reader"] .lx-reader-weave .lx-row-title')?.textContent === "Your AI is weaving it", null, 40_000);
  await shot("5-working");
  await closeSheet();
  return JSON.stringify(mine.asked);
});

// ---------- back woven ----------

const relayed = (id, textId, title = "Alice, pasted") => ({
  id,
  textId,
  kind: "weave",
  body: { title, to: "nl", bookVersion: book.version, request: request.id },
  source: "pat:Weave check",
  said: `wove “${title}” into Dutch`,
});
const deliver = async (change, file) => {
  relay.texts.push(change);
  relay.files = { ...(relay.files ?? {}), [change.id]: file };
  await page.evaluate(async () => (await import("/js/study/pack-inbox.js")).checkPackInbox());
};

await stage("back woven: the change checked again here and kept; Read it woven opens it woven at the same word", async () => {
  const before = await page.evaluate(async (id) => (await import("/js/read/store.js")).getWeave(id, "nl"), MINE);
  assert(!before, "a weave kept before the AI sent one");
  if (STANDIN) {
    await tool("finish_request", { request_id: request.id, seat, done: { said: "Wove it into Dutch", links: { text: MINE } } });
    await deliver(relayed("txc_weavecheck01", MINE), { ...weave, book: MINE });
    assert(reports.find((r) => r.id === "txc_weavecheck01")?.state === "applied", `the report: ${JSON.stringify(reports)}`);
  } else {
    await tool("get_text", { request_id: request.id });
    await tool("add_weave", { request_id: request.id, seat, weave: { ...weave, book: MINE } });
    await page.evaluate(async () => (await import("/js/study/pack-inbox.js")).checkPackInbox());
  }
  const kept = await page.evaluate(async (id) => (await import("/js/read/store.js")).getWeave(id, "nl"), MINE);
  assert(kept?.book === MINE && kept.bookVersion === book.version, "the weave kept beside the text");
  const where = await page.evaluate(() => document.querySelector('[data-part="reader-status"]')?.textContent ?? "");
  const row = await contentsRow();
  assert(row?.title === "Woven into Dutch" && row.button === "Read it woven", `Contents: ${JSON.stringify(row)}`);
  await shot("6-read-it-woven");
  await page.getByRole("button", { name: "Read it woven" }).click();
  await until(() => document.querySelector('[data-part="reader"]')?.hasAttribute("data-woven"));
  await page.waitForTimeout(1200);
  const dutch = await page.evaluate(() => document.querySelectorAll('[data-part="reader"] [data-part="woven-word"]').length);
  assert(dutch > 0, "no woven words on the page");
  const whereAfter = await page.evaluate(() => document.querySelector('[data-part="reader-status"]')?.textContent ?? "");
  assert(where === whereAfter, `where you were: ${where} → ${whereAfter}`);
  await shot("7-woven");
  const after = await contentsRow();
  assert(after?.title === "Woven into Dutch" && !after.button, `Contents once woven: ${JSON.stringify(after)}`);
  await closeSheet();
  await closeReader();
  return `${dutch} woven words; ${where}`;
});

await stage("Read's Continue card says how much of it is in Dutch for you; Your requests has it done, with its symbol, linked to the text", async () => {
  await goto("#read");
  await page.waitForTimeout(2000);
  const card = page.locator('[data-part="page"]:not([data-ghost]) [data-part="continue-card"]');
  const tile = await card.textContent();
  assert(tile.includes("Alice, pasted") && /of it in Dutch for you/.test(tile), `the Continue card: ${tile}`);
  await goto("#ai/requests");
  await page.waitForTimeout(2000);
  const row = page.locator('[data-part="request-row"]', { hasText: "Alice, pasted" }).first();
  assert(await row.count(), "the request on Your requests");
  assert(await row.locator('svg[data-symbol="translate-q"]').count(), "the weave's symbol on its row");
  assert((await row.getAttribute("data-state")) === "done", `its state: ${await row.getAttribute("data-state")}`);
  assert((await row.locator("a").first().getAttribute("href")) === `#read/book/${MINE}`, "linked to the text");
  await shot("8-requests");
  return tile.replace(/\s+/g, " ").trim();
});

// ---------- what can go wrong ----------

if (STANDIN) {
  await stage("a change for a text this device hasn't got: missing, with no row and no toast", async () => {
    const failedBefore = await page.evaluate(async () => (await import("/js/read/text-inbox.js")).failedTexts().length);
    await deliver(relayed("txc_weavecheck02", "paste-not-on-this-device", "A text not here"), { ...weave, book: "paste-not-on-this-device" });
    assert(reports.find((r) => r.id === "txc_weavecheck02")?.state === "missing", `the report: ${JSON.stringify(reports.at(-1))}`);
    const failedAfter = await page.evaluate(async () => (await import("/js/read/text-inbox.js")).failedTexts().length);
    assert(failedAfter === failedBefore, "a row for a text not here");
    await page.waitForTimeout(500);
    assert(!(await page.locator('[data-part="toast"]', { hasText: "A text not here" }).count()), "a toast for a text not here");
    return "missing";
  });

  await stage("a weave that fails the check here: failed with why, never listed as a text it couldn't add", async () => {
    const broken = { ...weave, book: SECOND, sentences: weave.sentences.slice(1) };
    await deliver(relayed("txc_weavecheck03", SECOND, "Alice, again"), broken);
    const report = reports.find((r) => r.id === "txc_weavecheck03");
    assert(report?.state === "failed" && /doesn't pass the check here/.test(report.error ?? ""), `the report: ${JSON.stringify(report)}`);
    assert(!(await page.evaluate(async () => (await import("/js/read/text-inbox.js")).failedTexts().length)), "a failed weave listed as a text it couldn't add");
    assert(!(await page.evaluate(async (id) => (await import("/js/read/store.js")).getWeave(id, "nl"), SECOND)), "a broken weave kept");
    return report.error;
  });
}

await stage("an AI that couldn't: Contents says why, with Ask again", async () => {
  await openText(SECOND);
  const row = await contentsRow();
  assert(row?.button === "Weave it", `Contents: ${JSON.stringify(row)}`);
  await page.locator('[data-part="reader"] .lx-reader-weave [data-part="button"]').click();
  await until(() => document.querySelector('[data-part="reader"] .lx-reader-weave .lx-row-title')?.textContent === "Waiting for your AI");
  const second = (await requests()).find((r) => r.kind === "weave" && r.book === SECOND);
  assert(second, "the second request");
  const taken = await tool("take_request", { request_id: second.id });
  await tool("finish_request", { request_id: second.id, seat: taken.seat, couldnt: "It's longer than I can weave in one go." });
  await until(() => document.querySelector('[data-part="reader"] .lx-reader-weave .lx-row-title')?.textContent === "Your AI couldn't weave it", null, 40_000);
  const after = await page.evaluate(() => {
    const group = document.querySelector('[data-part="reader"] .lx-reader-weave');
    return { sub: group.querySelector(".lx-row-sub")?.textContent, button: group.querySelector('[data-part="button"]')?.textContent };
  });
  assert(after.sub === "It's longer than I can weave in one go." && after.button === "Ask again", `Contents: ${JSON.stringify(after)}`);
  await shot("9-couldnt");
  await closeSheet();
  await closeReader();
  return after.sub;
});

await stage("no console errors", async () => {
  assert(!problems.length, problems.slice(0, 5).join(" · "));
  return "none";
});

await stage("deleting the account", async () => {
  await page.goto(`${BASE}/app/#settings/account`);
  await page.waitForSelector('[data-part="list-row"]');
  await page.locator('[data-part="list-row"]', { hasText: "Delete my account" }).click();
  await page.locator('[data-part="list-row"]', { hasText: "Press again to delete it for good" }).click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  return "deleted";
});
await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify({ standin: STANDIN, results, problems }, null, 1));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} stages passed`);
process.exit(failed ? 1 : 0);
