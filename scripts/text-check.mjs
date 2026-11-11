// Checks texts your AI adds to your reading library, end to end on a LOCAL server (it creates and deletes a test
// account, so never point it at the live site), with two devices (two browser contexts on one account) and your AI
// played over MCP with a personal token:
// - the tools, the prompt and the guide;
// - a plain text with a cover your AI drew reaching both devices (the cover cleaned, its script left out), the change's
//   files gone once both have it, a toast with Undo;
// - a real EPUB made into a book on each device (its own title kept unless your AI gives one; a spine naming one
//   chapter over and over read once); a broken EPUB failing on each with why (on the device's own list and in
//   get_text); a lexicommons-book; refusals in words (a book carrying a cover, a cover with a DOCTYPE, an upload not
//   sent yet, a language there isn't);
// - remove_text and undo_text_change from your AI, Remove and Undo in the app, on both devices; a text you added
//   yourself staying out of the relay; another account on the same browser neither seeing them nor, deleting its own
//   texts, taking them; list_texts; the "Add a text" request; the export; deleting the account taking the change
//   files' rows.
// Fails on any console error. Chrome runs muted: nothing is heard.
// Usage (headless Chrome, through the channel's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "text check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/text-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";
import { makeEpub, zip } from "./fixtures/make-epub.mjs";
import { COVER_FILE } from "../public/js/read/cover-svg.js";

const [BASE, OUT = "text-check-out"] = process.argv.slice(2);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("text-check creates and deletes an account: give it a local server, e.g. http://localhost:8825");
  process.exit(2);
}
const PERSIST = process.argv.includes("--persist-to") ? resolve(process.argv[process.argv.indexOf("--persist-to") + 1]) : null;
if (!PERSIST) {
  console.error("text-check reads the server's D1 after deleting the account: give --persist-to <its wrangler state dir>.");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");

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

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true });
const watch = (p, name) => {
  p.on("console", (m) => m.type() === "error" && problems.push(`${name} console: ${m.text()}`));
  p.on("pageerror", (e) => problems.push(`${name} page error: ${e.message}`));
};
const pageA = await context.newPage();
watch(pageA, "A");
const cdp = await context.newCDPSession(pageA);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});
let pageB = null;

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
/** Uploads bytes through a request_text_upload link; resolves to the upload id. */
async function upload(format, filename, bytes, contentType) {
  const ticket = await tool("request_text_upload", { format, filename });
  const put = await fetch(ticket.upload_url, { method: "PUT", headers: { "Content-Type": contentType ?? ticket.content_type }, body: bytes });
  assert(put.ok, `PUT ${filename}: ${put.status} ${await put.text()}`);
  return ticket.upload_id;
}
const takeNow = (page) => page.evaluate(async () => (await import("/js/study/pack-inbox.js")).checkPackInbox());
const bookOn = (page, id) =>
  page.evaluate(async (id) => {
    const store = await import("/js/read/store.js");
    const kept = await store.getBook(id);
    if (!kept) return null;
    const cover = kept.book.cover ? await store.getPicture(kept.book.cover.file) : null;
    return { title: kept.book.title, lang: kept.book.lang, words: kept.book.words, source: kept.book.source, authors: kept.book.authors.map((a) => a.name), cover: kept.book.cover ?? null, coverType: cover?.type ?? null, coverText: cover ? await cover.text() : null, chapters: kept.text.chapters.length, position: (await store.getPosition(id))?.word ?? null };
  }, id);
const failedOn = (page) => page.evaluate(async () => (await import("/js/read/text-inbox.js")).failedTexts());
const toast = (page, text) => page.locator('[data-part="toast"]', { hasText: text }).first().waitFor({ timeout: 10_000 });
const both = async () => {
  await takeNow(pageA);
  await takeNow(pageB);
};
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};

const STORY = "De rode jas\n\nOma heeft een rode jas. De jas hangt aan de deur.\n\nMorgen gaan wij naar de markt. Oma neemt haar jas mee.";
const COVER = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 200 300"><rect width="200" height="300" fill="#7a1f1f"/><circle cx="100" cy="110" r="40" fill="#f1c40f"/><text x="100" y="230" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="white">De rode jas</text><script>alert(1)</script></svg>';
const ids = {};

// ---------- two devices ----------

await stage("sign up on one device, open a second on the same account; the AI's token", async () => {
  await pageA.goto(`${BASE}/app/`);
  await pageA.waitForURL(/\/login\?next=/);
  await pageA.click("summary");
  await pageA.fill('input[name="name"]', "Text Check");
  await pageA.click('#register button[type="submit"]');
  await pageA.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await pageA.waitForSelector("html[data-app-ready]");
  token = await pageA.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Text check" }) })).json()).token);
  assert(token?.startsWith("lct_"), "a token");
  // As the AI section's page does on making one: the device learns it has an AI (shell/layout.js), which sets its polls' pace.
  for (const p of [pageA]) {
    await p.evaluate(async () => {
      const { whoAmI } = await import("/js/shell/api.js");
      const { setAiConnected } = await import("/js/shell/layout.js");
      setAiConnected((await whoAmI()).aiConnected);
    });
  }
  const state = await context.storageState();
  state.origins = state.origins.map((o) => ({ ...o, localStorage: o.localStorage.filter((e) => e.name !== "lx.pack-inbox.v1" && e.name !== "lx.text-inbox.v1") }));
  const second = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: state });
  pageB = await second.newPage();
  watch(pageB, "B");
  await pageB.goto(`${BASE}/app/`);
  await pageB.waitForSelector("html[data-app-ready]");
  await both();
  const listed = await tool("list_texts");
  assert(listed.devices.length === 2 && listed.texts.length === 0, JSON.stringify(listed));
  return "two devices, no texts yet";
});

await stage("your AI's side: the text tools, the add_text prompt, a guide that matches the limits", async () => {
  const tools = (await mcp("tools/list", {})).tools.map((t) => t.name);
  for (const name of ["get_text_guide", "request_text_upload", "add_text", "list_texts", "get_text", "remove_text", "undo_text_change"]) assert(tools.includes(name), `no ${name}`);
  const prompts = (await mcp("prompts/list", {})).prompts.map((p) => p.name);
  assert(prompts.includes("add_text"), JSON.stringify(prompts));
  const { guide } = await tool("get_text_guide");
  assert(/8 MB/.test(guide) && /10\.5 MB|10 MB/.test(guide) && /64 KB/.test(guide) && /viewBox/.test(guide), guide.slice(0, 300));
  const init = await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "text-check", version: "1" } });
  assert(/get_text_guide/.test(init.instructions), "the instructions name it");
  return `${tools.length} tools`;
});

// ---------- adding ----------

await stage("a plain text with a cover reaches both devices: the cover cleaned (its script left out), a toast with Undo, the files gone after", async () => {
  const text = await upload("text", "jas.txt", STORY);
  const cover = await upload("cover", "jas.svg", COVER);
  const added = await tool("add_text", { upload_id: text, cover_upload_id: cover, language: "nl", title: "De rode jas", authors: [] });
  assert(added.text_id && added.change_id && added.devices.length === 2 && added.words > 10, JSON.stringify(added));
  assert(added.cover_left_out?.some((d) => d.includes("script")), JSON.stringify(added.cover_left_out));
  ids.jas = added.text_id;
  ids.jasChange = added.change_id;
  await both();
  for (const page of [pageA, pageB]) {
    const kept = await bookOn(page, ids.jas);
    assert(kept && kept.title === "De rode jas" && kept.lang === "nl" && kept.source.kind === "ai", JSON.stringify(kept));
    assert(COVER_FILE.test(kept.cover?.file ?? "") && kept.coverType === "image/svg+xml" && !/script|alert|xlink/.test(kept.coverText), JSON.stringify({ cover: kept.cover, text: kept.coverText?.slice(0, 200) }));
  }
  await toast(pageA, "added “De rode jas”");
  const where = await tool("get_text", { text_id: ids.jas });
  assert(where.on.length === 2 && where.changes[0].devices.every((d) => d.state === "applied") && !where.changes[0].on_its_way, JSON.stringify(where));
  const gone = await pageA.request.get(`${BASE}/api/texts/files/${ids.jasChange}?part=text`);
  assert(gone.status() === 404, `the file after both devices have it: ${gone.status()}`);
  assert(sql(`SELECT COUNT(*) AS n FROM uploads WHERE purpose = 'text-in:${ids.jasChange}'`)[0].n === 0, "no upload rows left for the change");
  await pageA.screenshot({ path: join(OUT, "shots", "01-added-toast.png") });
  return `${added.words} words, cover ${(await bookOn(pageA, ids.jas)).cover.file}`;
});

await stage("a change's file is served as a download that can't run, and only to the account", async () => {
  const text = await upload("text", "kort.txt", "Kort\n\nIk lees een boek.");
  const added = await tool("add_text", { upload_id: text, language: "nl" });
  const response = await pageA.request.get(`${BASE}/api/texts/files/${added.change_id}?part=text`);
  const headers = response.headers();
  assert(response.status() === 200 && headers["content-type"] === "application/octet-stream" && /attachment/.test(headers["content-disposition"] ?? "") && /sandbox/.test(headers["content-security-policy"] ?? "") && headers["x-content-type-options"] === "nosniff", JSON.stringify(headers));
  const stranger = await fetch(`${BASE}/api/texts/files/${added.change_id}?part=text`);
  assert(stranger.status === 401, `signed out: ${stranger.status}`);
  await both();
  ids.kort = added.text_id;
  return headers["content-disposition"];
});

await stage("a real EPUB is made into a book on each device, under the title your AI gave", async () => {
  const epub = makeEpub({ title: "Twee hoofdstukken", chapters: [{ title: "Een", paragraphs: ["Oma heeft een rode jas.", "De jas hangt aan de deur."] }, { title: "Twee", paragraphs: ["Morgen gaan wij naar de markt."] }] });
  const id = await upload("epub", "twee.epub", epub);
  const added = await tool("add_text", { upload_id: id, language: "nl", title: "Twee hoofdstukken", authors: ["Een Schrijver"] });
  ids.epub = added.text_id;
  await both();
  for (const page of [pageA, pageB]) {
    const kept = await bookOn(page, ids.epub);
    assert(kept && kept.title === "Twee hoofdstukken" && kept.words > 10 && kept.chapters >= 2 && kept.source.kind === "ai" && JSON.stringify(kept.authors) === '["Een Schrijver"]', JSON.stringify(kept));
  }
  // An EPUB in another language than your AI said fails on each device, saying so.
  const english = await upload("epub", "english.epub", makeEpub({ title: "English", lang: "en", chapters: [{ title: "One", paragraphs: ["Grandma has a red coat."] }] }));
  const wrong = await tool("add_text", { upload_id: english, language: "nl", title: "Engels" });
  await both();
  const failedWhy = (await tool("get_text", { text_id: wrong.text_id })).changes[0].devices.map((d) => d.error);
  assert(failedWhy.length === 2 && failedWhy.every((e) => /in en, not nl/.test(e ?? "")), JSON.stringify(failedWhy));
  for (const page of [pageA, pageB]) await page.evaluate(async (change) => (await import("/js/read/text-inbox.js")).dismissFailedText(change), wrong.change_id);
  const where = await tool("get_text", { text_id: ids.epub });
  assert(where.changes[0].devices.length === 2 && where.changes[0].devices.every((d) => d.state === "applied"), JSON.stringify(where.changes[0]));
  // Codex's second review: without a title from your AI, the EPUB keeps its own; a spine naming one chapter 200 times
  // is read once (else a small EPUB makes a book 200 times its size).
  const own = await tool("add_text", { upload_id: await upload("epub", "eigen.epub", makeEpub({ title: "Het eigen boek", chapters: [{ title: "Een", paragraphs: ["Oma heeft een rode jas."] }] })), language: "nl" });
  const repeated = await tool("add_text", { upload_id: await upload("epub", "herhaald.epub", makeEpub({ title: "Herhaald", chapters: [{ title: "Een", paragraphs: ["Oma heeft een rode jas."] }], spine: Array(200).fill(0) })), language: "nl" });
  await both();
  for (const page of [pageA, pageB]) {
    const [ownKept, repeatedKept] = [await bookOn(page, own.text_id), await bookOn(page, repeated.text_id)];
    assert(ownKept?.title === "Het eigen boek", `its own title: ${JSON.stringify(ownKept)}`);
    assert(repeatedKept && repeatedKept.words < 20 && repeatedKept.chapters === 1, `read once: ${JSON.stringify(repeatedKept)}`);
  }
  for (const added of [own, repeated]) await tool("remove_text", { text_id: added.text_id });
  await both();
  return `${(await bookOn(pageA, ids.epub)).words} words, both devices; an untitled EPUB keeps its title; a spine of 200 repeats read once`;
});

await stage("a broken EPUB fails on each device, saying why there and in get_text", async () => {
  const broken = zip({ mimetype: "application/epub+zip", "META-INF/container.xml": "<container><rootfiles><rootfile full-path='nowhere.opf'/></rootfiles></container>" });
  const id = await upload("epub", "broken.epub", broken);
  const added = await tool("add_text", { upload_id: id, language: "nl", title: "Kapot" });
  await both();
  for (const page of [pageA, pageB]) {
    const failed = await failedOn(page);
    assert(failed.some((f) => f.textId === added.text_id && f.title === "Kapot" && /EPUB couldn't be read/.test(f.why)), JSON.stringify(failed));
    assert(!(await bookOn(page, added.text_id)), "no book");
  }
  await toast(pageA, "couldn't be read here");
  const where = await tool("get_text", { text_id: added.text_id });
  assert(where.changes[0].devices.length === 2 && where.changes[0].devices.every((d) => d.state === "failed" && /EPUB couldn't be read/.test(d.error)), JSON.stringify(where.changes[0]));
  await pageA.evaluate(async (change) => (await import("/js/read/text-inbox.js")).dismissFailedText(change), added.change_id);
  assert(!(await failedOn(pageA)).some((f) => f.changeId === added.change_id), "dismissed");
  return where.changes[0].devices[0].error;
});

await stage("a lexicommons-book is taken as it is; refusals in words for a cover on a book, a bad cover, a file not sent, a language there isn't", async () => {
  const made = await pageA.evaluate(async () => (await import("/js/read/import-text.js")).bookFromText("Het boek\n\nIk heb gisteren een boek gelezen.", { lang: "nl" }));
  const id = await upload("book", "boek.json", JSON.stringify(made));
  const added = await tool("add_text", { upload_id: id, language: "nl" });
  ids.book = added.text_id;
  assert(added.title === made.title, JSON.stringify(added));
  const withCover = await upload("book", "cover.json", JSON.stringify({ ...made, cover: { file: "0123456789abcdef.svg" } }));
  assert(/carries no cover/.test(await refusedTool("add_text", { upload_id: withCover, language: "nl" })), "a book with a cover");
  const text = await upload("text", "x.txt", "Hallo daar.");
  const badCover = await upload("cover", "bad.svg", '<!DOCTYPE svg [<!ENTITY a "aa">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>');
  assert(/cover can't be used: .*DOCTYPE/.test(await refusedTool("add_text", { upload_id: text, cover_upload_id: badCover, language: "nl" })), "a cover with a DOCTYPE");
  const once = await upload("text", "once.txt", "Eén keer\n\nDit gaat in één tekst.");
  const twice = await Promise.all([1, 2].map(() => mcp("tools/call", { name: "add_text", arguments: { upload_id: once, language: "nl" } })));
  const taken = twice.filter((r) => !r.isError);
  assert(taken.length === 1 && /going into another text|waiting for a text/.test(twice.find((r) => r.isError)?.content[0].text ?? ""), JSON.stringify(twice.map((r) => r.content[0].text.slice(0, 120))));
  const notSent = await tool("request_text_upload", { format: "text", filename: "later.txt" });
  assert(/hasn't arrived yet/.test(await refusedTool("add_text", { upload_id: notSent.upload_id, language: "nl" })), "not sent yet");
  assert(/language/.test(await refusedTool("add_text", { upload_id: text, language: "xx" })), "a language there isn't");
  await both();
  return `book "${added.title}" added; 4 refused; one upload into one text, sent twice at once`;
});

// ---------- removing and undo ----------

await stage("remove_text takes it from both devices; undo_text_change brings it back, cover and all, where you were too", async () => {
  await pageA.evaluate(async (id) => {
    const store = await import("/js/read/store.js");
    const { book } = await store.getBook(id);
    await store.setPosition(id, 7, book.version);
  }, ids.jas);
  const removed = await tool("remove_text", { text_id: ids.jas });
  assert(/removed already/.test(await refusedTool("remove_text", { text_id: ids.jas })), "a second remove of the same text");
  await both();
  assert(!(await bookOn(pageA, ids.jas)) && !(await bookOn(pageB, ids.jas)), "gone from both");
  await toast(pageA, "removed “De rode jas”");
  await tool("undo_text_change", { change_id: removed.change_id });
  await both();
  for (const page of [pageA, pageB]) {
    const back = await bookOn(page, ids.jas);
    assert(back && back.cover && back.coverType === "image/svg+xml", JSON.stringify(back));
  }
  assert((await bookOn(pageA, ids.jas)).position === 7, "where you were, kept through the remove and the undo");
  assert(/undone already|later change/.test(await refusedTool("undo_text_change", { change_id: removed.change_id })), "undone twice");
  return "removed, then back on both";
});

await stage("Remove in the app takes a text your AI added from every device; Undo in the app brings it back", async () => {
  const result = await pageA.evaluate(async (id) => (await import("/js/read/text-inbox.js")).removeText(id), ids.epub);
  assert(result.everywhere === true, JSON.stringify(result));
  await takeNow(pageB);
  assert(!(await bookOn(pageB, ids.epub)), "gone from the other device too");
  const where = await tool("get_text", { text_id: ids.epub });
  const change = where.changes[0];
  assert(change.kind === "remove" && change.devices.length === 2 && change.devices.every((d) => d.state === "applied"), JSON.stringify(change));
  const undone = await pageA.evaluate(async (id) => (await import("/js/read/text-inbox.js")).undoTextChange(id), change.change_id);
  assert(undone.ok, JSON.stringify(undone));
  await takeNow(pageB);
  assert((await bookOn(pageA, ids.epub)) && (await bookOn(pageB, ids.epub)), "back on both");
  return "removed from both and back";
});

await stage("a text you add yourself stays out of the relay: on this device only, removed here only", async () => {
  const mine = await pageA.evaluate(async () => {
    const book = await (await import("/js/read/import-text.js")).bookFromText("Mijn tekst\n\nDit is van mij.", { lang: "nl" });
    await (await import("/js/read/store.js")).addBook(book);
    return book.id;
  });
  await both();
  const listed = await tool("list_texts");
  assert(!listed.texts.some((t) => t.text_id === mine), "a text you added yourself is never reported");
  assert(listed.texts.find((t) => t.text_id === ids.jas)?.by === "your AI", "your AI's are");
  assert(/No text your AI added has that id/.test(await refusedTool("remove_text", { text_id: mine })), "your AI can't remove yours");
  const removed = await pageA.evaluate(async (id) => (await import("/js/read/text-inbox.js")).removeText(id), mine);
  assert(removed.everywhere === false && !(await bookOn(pageA, mine)), JSON.stringify(removed));
  assert(sql(`SELECT COUNT(*) AS n FROM text_changes WHERE text_id = '${mine}'`)[0].n === 0, "no change in the relay for it");
  return `${listed.texts.length} texts listed, none of them yours`;
});

await stage("another account signed in on this browser sees none of this account's texts from its AI, reports none, and deleting its own texts leaves them", async () => {
  const seen = await pageA.evaluate(async () => {
    const store = await import("/js/read/store.js");
    const inbox = await import("/js/read/text-inbox.js");
    const ownAccount = (await (await fetch("/api/me")).json()).user.id;
    const asOurs = { listed: (await store.listBooks()).filter((b) => b.source?.kind === "ai").length, reported: (await inbox.textsHere()).length };
    store.setReadAccount("someone-else");
    const asOther = { listed: (await store.listBooks()).filter((b) => b.source?.kind === "ai").length };
    store.setReadAccount(ownAccount);
    // Codex's second review: the other account deleting its texts (Settings) leaves this account's texts from its AI,
    // and the removed ones this device keeps for its Undo.
    const keptForUndo = () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open("lexicommons-texts", 1);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const keys = open.result.transaction("removed").objectStore("removed").getAllKeys();
          keys.onsuccess = () => resolve(keys.result.filter((k) => k.startsWith(`${ownAccount}:`)).length);
        };
      });
    const { checkPackInbox } = await import("/js/study/pack-inbox.js");
    const before = { listed: asOurs.listed, kept: await keptForUndo() };
    inbox.startTexts({ account: "someone-else", check: checkPackInbox });
    await store.clearReading();
    await inbox.clearRemovedTexts();
    inbox.startTexts({ account: ownAccount, check: checkPackInbox });
    const after = { listed: (await store.listBooks()).filter((b) => b.source?.kind === "ai").length, kept: await keptForUndo() };
    return { asOurs, asOther, before, after };
  });
  assert(seen.asOurs.listed > 0 && seen.asOurs.reported === seen.asOurs.listed && seen.asOther.listed === 0, JSON.stringify(seen));
  assert(seen.before.kept >= 2 && JSON.stringify(seen.after) === JSON.stringify(seen.before), `after the other account deleted its texts: ${JSON.stringify(seen)}`);
  return `${seen.asOurs.listed} listed for this account, none for another; ${seen.after.listed} texts and ${seen.after.kept} kept for Undo stay when it deletes its own`;
});

await stage("an \"Add a text\" request: your AI takes it, adds a text, and the request links to it", async () => {
  const request = await pageA.evaluate(async () => (await import("/js/ai/client.js")).createRequest({ kind: "text_new", what: "A short story about the market", language: "nl" }));
  const taken = await tool("take_request", { request_id: request.id });
  assert(/add_text/.test(taken.how), taken.how);
  const id = await upload("text", "markt.txt", "Op de markt\n\nOp de markt koopt oma brood en kaas.");
  const added = await tool("add_text", { upload_id: id, language: "nl", title: "Op de markt" });
  await tool("finish_request", { request_id: request.id, seat: taken.seat, done: { said: "Added a short story about the market", links: { text: added.text_id } } });
  const links = await pageA.evaluate(async (id) => {
    const c = await import("/js/ai/client.js");
    const requests = await c.listRequests();
    return c.requestLinks(requests.find((r) => r.id === id));
  }, request.id);
  assert(JSON.stringify(links) === JSON.stringify([{ kind: "text", id: added.text_id, label: "Open the text" }]), JSON.stringify(links));
  await both();
  return "linked to the text";
});

await stage("the account's export has the text changes; deleting the account takes the change files' rows", async () => {
  const exported = await pageA.evaluate(async () => (await fetch("/api/me/export")).json());
  assert(Array.isArray(exported.texts) && exported.texts.some((c) => c.textId === ids.jas && c.kind === "add"), JSON.stringify(exported.texts).slice(0, 300));
  // One change still on its way, so it has files to take: the second device is closed, so it never reports.
  await pageB.context().close();
  const late = await upload("text", "laat.txt", "Laat\n\nTe laat.");
  const pending = await tool("add_text", { upload_id: late, language: "nl" });
  const user = sql(`SELECT user_id FROM text_changes WHERE id = '${pending.change_id}'`)[0].user_id;
  assert(sql(`SELECT COUNT(*) AS n FROM uploads WHERE purpose = 'text-in:${pending.change_id}'`)[0].n === 1, "its file before");
  const deleted = await pageA.request.fetch(`${BASE}/api/me`, { method: "DELETE", headers: { "Content-Type": "application/json" }, data: JSON.stringify({ confirm: "delete my account" }) });
  assert(deleted.status() === 200, `delete: ${deleted.status()}`);
  const left = sql(`SELECT (SELECT COUNT(*) FROM uploads WHERE user_id = '${user}') AS uploads, (SELECT COUNT(*) FROM text_changes WHERE user_id = '${user}') AS changes, (SELECT COUNT(*) FROM text_deliveries WHERE user_id = '${user}') AS deliveries`)[0];
  assert(left.uploads === 0 && left.changes === 0 && left.deliveries === 0, JSON.stringify(left));
  return `${exported.texts.length} changes exported; nothing left after the delete`;
});

await stage("no console errors on either device", async () => {
  assert(!problems.length, problems.slice(0, 5).join(" · "));
  return "none";
});

await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} stages passed`);
process.exit(failed ? 1 : 0);
