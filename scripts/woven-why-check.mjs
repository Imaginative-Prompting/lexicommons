// A woven text says why it reads in English, on a phone in headless Chrome on a LOCAL server (it signs up an account): read/reader.js
// whyEnglish, read/library.js (Alice's row, a woven text's card), read/shelf.js wovenShare. A brand-new learner of Dutch:
//   - Read: the woven story's row says "Woven · 0% in Dutch for you" under its line.
//   - Opening it: the page is woven and has no Dutch word, and one card at the reader's foot says why ("Woven into Dutch" · "It reads in
//     English until you know its words: …"); never two cards; the text itself isn't covered (the card sits at the foot).
//   - Its cross puts it away, for good on that text: none after reopening.
//   - Another new learner who knows a tenth of it or more never sees it (words put in the word bank first), and it's then put away for good.
//   - A planted control first: the check's own reading of the card finds one planted with another state, so it can fail.
// Usage (from the channel repo root, sandbox off):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "woven why check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/woven-why-check.mjs http://localhost:<port> <outDir>     (exit 0 = pass, 2 = no woven story on this server)
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const [BASE, outArg] = process.argv.slice(2);
if (!BASE || !outArg || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("usage: woven-why-check.mjs http://localhost:<port> <outDir> (LOCAL only: it signs up accounts)");
  process.exit(2);
}
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
setTimeout(() => (console.log("FAIL  timed out"), process.exit(3)), 8 * 60_000).unref();

let failed = 0;
let passed = 0;
const results = [];
async function stage(name, fn) {
  try {
    const note = await fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
    results.push({ name, ok: true, note });
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
    results.push({ name, ok: false, error: error.message });
  }
}
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};

const browser = await chromium.launch({ headless: true });
const errors = [];
const READER = '[data-part="reader"]:not([data-ghost])';
const PAGE = '[data-part="page"]:not([data-ghost])';

/** A new learner of Dutch on a phone: { page, context }. */
async function learner(name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block", colorScheme: "dark", locale: "en-US" });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', name);
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]");
  return { page, context };
}
const until = async (page, fn, arg, timeout = 20_000) => {
  const end = Date.now() + timeout;
  for (;;) {
    if (await page.evaluate(fn, arg)) return;
    if (Date.now() > end) throw new Error(`still not true after ${timeout / 1000} s: ${fn.toString().slice(0, 140)}`);
    await new Promise((done) => setTimeout(done, 200));
  }
};
const toRead = async (page) => {
  await page.evaluate(() => (location.hash = "#today"));
  await page.waitForTimeout(400);
  await page.evaluate(() => (location.hash = "#read"));
  await page.waitForSelector(`${PAGE} .lx-weave-own-story, ${PAGE} [data-part="own-copy-note"]`, { timeout: 30_000 });
  await page.waitForTimeout(600);
};
// The cards at the reader's foot, as they stand.
const cards = (page) =>
  page.evaluate((R) =>
    [...document.querySelectorAll(`${R} [data-part="reader-offer"]`)].map((one) => ({
      state: one.getAttribute("data-state"),
      title: one.querySelector("strong")?.textContent ?? "",
      line: one.querySelector(".lx-offer-text span")?.textContent ?? "",
      buttons: [...one.querySelectorAll(':scope > [data-part="button"]')].map((b) => b.textContent.trim()),
      seen: getComputedStyle(one).visibility !== "hidden",
      top: Math.round(one.getBoundingClientRect().top),
    })), READER);
const pageNow = (page) =>
  page.evaluate((R) => {
    const reader = document.querySelector(R);
    return { woven: Boolean(reader?.hasAttribute("data-woven")), dutch: reader?.querySelectorAll('[data-part="woven-word"]').length ?? 0, whole: reader?.querySelectorAll('[data-part="reader-sentence"]').length ?? 0 };
  }, READER);
const openStory = async (page) => {
  await page.locator(`${PAGE} .lx-weave-own-see`).click();
  await page.waitForSelector(`${READER}[data-ready]`, { timeout: 40_000 });
  await page.waitForTimeout(1500);
};
const closeReader = async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForFunction((R) => !document.querySelector(R), READER, { timeout: 10_000 }).catch(() => {});
};

const first = await learner("Woven why check");
const { page } = first;
let story = null;

await stage("Read, a new learner: the woven story's row says how much of it shows for them, 0% included", async () => {
  await toRead(page);
  if (!(await page.locator(`${PAGE} .lx-weave-own-story`).count())) {
    console.log("no woven story for Dutch on this server's shelf: nothing to check");
    process.exit(2);
  }
  await until(page, (P) => Boolean(document.querySelector(`${P} .lx-weave-own-share`)?.textContent), PAGE);
  story = await page.evaluate((P) => ({ line: document.querySelector(`${P} .lx-weave-own-see-text`)?.firstChild?.textContent ?? "", share: document.querySelector(`${P} .lx-weave-own-share`)?.textContent ?? "" }), PAGE);
  assert(story.share === "Woven · 0% in Dutch for you", `the row's share: ${JSON.stringify(story)}`);
  assert(/^See how it reads: .+, woven$/.test(story.line), `the row's line: ${story.line}`);
  await page.screenshot({ path: join(OUT, "1-read-row-0-percent.png") });
  return `${story.line} · ${story.share}`;
});

await stage("opened by a new learner: woven with no Dutch on the page, and one card at the foot saying why", async () => {
  await openStory(page);
  await until(page, (R) => document.querySelector(`${R} [data-part="reader-offer"]`)?.getAttribute("data-state") === "why", READER);
  const now = await pageNow(page);
  assert(now.woven && now.dutch === 0, `the page: ${JSON.stringify(now)}`);
  const shown = await cards(page);
  assert(shown.length === 1 && shown[0].seen, `the cards: ${JSON.stringify(shown)}`);
  assert(shown[0].title === "Woven into Dutch" && shown[0].line === "It reads in English until you know its words: each Dutch word you learn shows here in its place.", `its words: ${JSON.stringify(shown[0])}`);
  assert(shown[0].top > 844 * 0.6, `the card isn't at the foot: its top is at ${shown[0].top} px`);
  // Never over the text: no word of the page that's seen (not behind the page's own cover) reaches under the card. First the card taken
  // out of the way of the look (it would be what's found at every point under it).
  const under = await page.evaluate((R) => {
    const card = document.querySelector(`${R} [data-part="reader-offer"]`);
    const top = card.getBoundingClientRect().top;
    card.style.pointerEvents = "none";
    return [...document.querySelectorAll(`${R} [data-part="reader-text"] .lx-w`)].filter((word) => { const box = word.getBoundingClientRect(); if (!(box.width > 0 && box.left >= 0 && box.right <= innerWidth && box.top < innerHeight && box.bottom > top + 1)) return false; const at = document.elementFromPoint(box.left + box.width / 2, Math.min(box.bottom - 2, innerHeight - 1)); return Boolean(at) && (word.contains(at) || at.contains(word)) && !at.classList.contains("lx-reader-cover"); }).map((word) => word.textContent.trim()).slice(0, 5);
  }, READER);
  await page.evaluate((R) => (document.querySelector(`${R} [data-part="reader-offer"]`).style.pointerEvents = ""), READER);
  assert(!under.length, `words of the page under the card: ${under.join(" ")}`);
  // The foot's own controls stay free under it: the settings gear can be pressed.
  const gear = await page.evaluate((R) => {
    const card = document.querySelector(`${R} [data-part="reader-offer"]`).getBoundingClientRect();
    const buttons = [...document.querySelectorAll(`${R} > button, ${R} > [data-part="icon-button"]`)].filter((b) => { const box = b.getBoundingClientRect(); return box.width > 0 && box.top > innerHeight * 0.7; });
    return buttons.map((b) => { const box = b.getBoundingClientRect(); const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2); return { label: b.getAttribute("aria-label"), free: Boolean(at) && (b.contains(at) || at.contains(b)), underCard: box.top < card.bottom && box.bottom > card.top }; });
  }, READER);
  assert(gear.length >= 1 && gear.every((one) => one.free && !one.underCard), `the foot's controls with the card up: ${JSON.stringify(gear)}`);
  await page.screenshot({ path: join(OUT, "2-reader-why.png") });
  // The check's reading of the cards can fail: a second card planted is counted.
  await page.evaluate((R) => { const p = document.createElement("div"); p.setAttribute("data-part", "reader-offer"); p.setAttribute("data-planted", ""); document.querySelector(R).append(p); }, READER);
  assert((await cards(page)).length === 2, "PLANT: a second card planted in the reader wasn't counted");
  await page.evaluate(() => document.querySelectorAll("[data-planted]").forEach((p) => p.remove()));
  return `${shown[0].title}: ${shown[0].line}`;
});

await stage("its cross puts it away, for good on that text", async () => {
  await page.locator(`${READER} [data-part="reader-offer"] [aria-label="Got it"]`).click();
  assert((await cards(page)).length === 0, "the card stays after its cross");
  await closeReader(page);
  await toRead(page);
  // (The only book on this device: the story just opened.)
  const id = await page.evaluate(async () => (await (await import("/js/read/store.js")).listBooks())[0]?.id);
  assert(id, "the story isn't on this device after it was opened");
  await page.evaluate((book) => (location.hash = `#read/book/${encodeURIComponent(book)}`), id);
  await page.waitForSelector(`${READER}[data-ready]`, { timeout: 40_000 });
  await page.waitForTimeout(2500);
  assert((await cards(page)).length === 0, `the card back after it was put away: ${JSON.stringify(await cards(page))}`);
  await closeReader(page);
});

await stage("a learner who knows a tenth of it or more never sees it, and Read's row says their share", async () => {
  const second = await learner("Woven why check 2");
  const p2 = second.page;
  await toRead(p2);
  // The text's commonest words into the word bank, until a tenth of it and more is theirs (worked out from the layer the shelf serves).
  const put = await p2.evaluate(async () => {
    const { loadCatalog, wovenStory } = await import("/js/read/shelf.js");
    const { coverageOf } = await import("/js/read/book-format.js");
    const bank = await import("/js/read/bank.js");
    const meta = wovenStory(await loadCatalog());
    const weave = await (await fetch(meta.layers.nl.url)).json();
    const counts = new Map();
    for (const sentence of weave.sentences) for (const [, lemma] of sentence.t) if (lemma) counts.set(lemma, (counts.get(lemma) ?? 0) + 1);
    const order = [...counts].sort((a, b) => b[1] - a[1]).map(([lemma]) => lemma);
    const mine = new Set();
    for (const lemma of order) {
      mine.add(lemma);
      bank.addWord("nl", lemma, { quiet: true });
      if (coverageOf(weave, mine).share >= 0.2) break;
    }
    return { words: mine.size, percent: Math.round(coverageOf(weave, bank.knownSet("nl")).share * 100) };
  });
  assert(put.percent >= 10, `their share: ${JSON.stringify(put)}`);
  await toRead(p2);
  await until(p2, (P) => /^Woven · \d+% in Dutch for you$/.test(document.querySelector(`${P} .lx-weave-own-share`)?.textContent ?? ""), PAGE);
  const share = await p2.evaluate((P) => document.querySelector(`${P} .lx-weave-own-share`).textContent, PAGE);
  assert(share === `Woven · ${put.percent}% in Dutch for you`, `the row's share: ${share} (theirs: ${put.percent}%)`);
  await openStory(p2);
  await p2.waitForTimeout(2500);
  const now = await pageNow(p2);
  assert(now.woven && now.dutch > 0, `their page: ${JSON.stringify(now)}`);
  assert((await cards(p2)).length === 0, `a card for someone who knows ${put.percent}% of it: ${JSON.stringify(await cards(p2))}`);
  await p2.screenshot({ path: join(OUT, "3-reader-a-fifth-known.png") });
  await p2.evaluate(() => fetch("/account/delete", { method: "POST" }).catch(() => {}));
  await second.context.close();
  return `${put.words} words, ${put.percent}% of it: ${now.dutch} Dutch words on the page, no card`;
});

// PREVIEW-STAGES (the second landing puts its stages here)

await stage("no page errors", async () => {
  assert(!errors.length, errors.slice(0, 3).join(" | "));
});

await page.evaluate(() => fetch("/account/delete", { method: "POST" }).catch(() => {})).catch(() => {});
await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
