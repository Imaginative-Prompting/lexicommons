// Checks the Read tab and the reader end to end in headless Chrome on a LOCAL server (it creates and deletes a test
// account, so never point it at the live site): adding a text by pasting and from a plain-text file, the reading
// screen (one chapter at a time, every word its index), the bars and the tap grammar, the motion rule (the bars' real
// buttons are pressable while their ghosts still slide), the settings and contents sheets (an outside tap only closes
// them), the text size keeping your word in place, the position kept across a reload, chapters, removing a text, a
// wide screen, highlights and notes, search in the text, pinch zoom (Chrome's touch and WebKit's gesture events), Your data (export, delete), animations off,
// a learner's own text (rights null, pictures null or none) read with a weave (About this book only for a layer that says who made it; the
// reader from 7 Nov's p67 fails it), and no console errors. Chrome runs muted.
//
// Local server: see app/AGENTS.md (wrangler dev with --local-upstream, GATE_ENABLED:false, RP_ID:localhost).
// Usage (headless Chrome and WebKit, so through the channel's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lex-reader --label "reader check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/reader-check.mjs http://localhost:<port> <outDir> [<book.txt> [<book.json> [<book.epub>]]]
// <book.txt>: a plain-text book to open as a file (a Project Gutenberg .txt); without it, a small one is made.
// <book.json>: a long lexicommons-book from the library's pipeline, to page through (verse, headings).
// <book.epub>: an EPUB to import (Gutenberg's Alice: gutenberg.org/ebooks/11.epub3.images); small ones (DRM, font
// obfuscation, an EPUB 2 table of contents) are made here.
// One stage reads a picture book in WebKit (iPhone's engine): it needs Playwright's WebKit (npx playwright install webkit).
// --only <regex>: the first stage (the sign-up) and the stages whose names match it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { crc32 } from "node:zlib";
import { chromium, webkit } from "./quiet-browser.mjs";
import { readableFor } from "../public/js/read/readable.js";

const ARGS = process.argv.slice(2);
const ONLY = ARGS.includes("--only") ? new RegExp(ARGS[ARGS.indexOf("--only") + 1], "i") : null;
const [BASE, OUT = "reader-check-out", BOOK_FILE, LONG_BOOK, BOOK_EPUB] = ARGS.filter((arg, i) => arg !== "--only" && ARGS[i - 1] !== "--only");
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("reader-check creates and deletes an account: give it a local server, e.g. http://localhost:8821");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });

const results = [];
const problems = [];
let stagesSeen = 0;
async function stage(name, fn) {
  if (ONLY && stagesSeen++ > 0 && !ONLY.test(name)) return;
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - started, detail });
    console.log(`ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ stage: name, ok: false, ms: Date.now() - started, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
    // What the page looked like when it failed.
    await page.screenshot({ path: join(OUT, "shots", `fail-${results.length}.png`) }).catch(() => {});
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

// A text of our own, long enough to scroll: two chapters (a heading and a title line each), a scene break, italics.
const PARAGRAPHS = [
  "Every morning before the sun was up, Mila unlocked the bakery on the corner and switched on the ovens. The street was quiet. Only the cat from number nine watched her through the window, as it always did.",
  "She liked this hour best. The bread did not need her yet, the radio played old songs, and for a while the whole town seemed to belong to her.",
  "By seven the first customers came in, stamping the cold from their shoes. \"The usual?\" she asked, and Mr. Visser nodded, as he had nodded every morning for _eleven years_.",
  "He always paid in coins, counted out slowly on the counter, and he always left one more than the bread cost. When she tried to give it back he only shook his head and said the bread was worth it.",
  "At nine the school children came past in a noisy line, and the smallest of them pressed his nose to the glass until his teacher called him on. Mila waved. He waved back with both hands.",
  "The afternoons were slower. She swept the floor, wrote the next day's list on the board behind the counter, and sometimes sat for ten whole minutes with a cup of tea, doing nothing at all.",
  "Her grandmother had owned the bakery before her, and her grandmother's mother before that. The ovens were new, but the long wooden table where the dough was shaped was older than anyone in the street.",
  "There were marks in the wood from a hundred years of knives and elbows, and one small burn in the shape of a moon that her grandmother said had been there when she was a girl.",
];
const SAMPLE = [
  "Chapter 1",
  "The Bakery on the Corner",
  ...PARAGRAPHS.slice(0, 3),
  "* * *",
  ...PARAGRAPHS.slice(3),
  "Chapter 2",
  "A Letter",
  "The letter came on a Tuesday, in a blue envelope with a stamp she had never seen before. Mila read it twice—standing up—then once more sitting down.",
  ...PARAGRAPHS.slice(4).map((p) => p.replace("Mila", "She")),
].join("\n\n");

// Muted: nothing is ever heard.
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: false });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()} ${m.location()?.url ?? ""}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

// The real reader, never a ghost copy of it.
const READER = '[data-part="reader"]:not([data-ghost])';
const shot = async (name) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.screenshot({ path: join(OUT, "shots", `${name}.png`) });
};
const slowMotion = (on) =>
  page.evaluate((slow) => {
    for (const name of ["--dur-150", "--dur-200", "--dur-320", "--dur-640", "--dur-sheet"]) {
      if (slow) document.documentElement.style.setProperty(name, "3000ms");
      else document.documentElement.style.removeProperty(name);
    }
  }, on);
const ghosts = () => page.evaluate(() => document.querySelectorAll("[data-motion-layer] > *").length);
const zen = () => page.locator(READER).evaluate((r) => r.getAttribute("data-state") === "zen");
// A tap on the page at a fraction of the reader's height, in the middle of its width (on the text or between lines).
async function tapAt(frac, x = 0.5) {
  const box = await page.locator(READER).boundingBox();
  await page.mouse.click(box.x + box.width * x, box.y + box.height * frac);
}
/** A tap on the page clear of the hold toolbar (it sits over or under the held words, wherever the layout puts them). */
async function tapClear() {
  const box = await page.locator(READER).boundingBox();
  const bar = await page.locator(`${READER} [data-part="reader-hold"]:not([hidden])`).boundingBox({ timeout: 1000 }).catch(() => null);
  for (const frac of [0.5, 0.25, 0.75, 0.15, 0.85]) {
    const y = box.y + box.height * frac;
    if (!bar || y < bar.y - 12 || y > bar.y + bar.height + 12) return page.mouse.click(box.x + box.width / 2, y);
  }
  throw new Error("no place clear of the hold toolbar to tap");
}
// Where you are, as the reader sees it, and where that word sits on screen.
const readerState = () =>
  page.evaluate(() => {
    const text = document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"]');
    const words = [...text.querySelectorAll(".lx-w")];
    const r = text.getBoundingClientRect();
    const y = r.top + text.clientHeight * 0.4;
    // The reader's own way: the word at the middle of the reading line, else the first on or below it.
    const hit = document.elementFromPoint(r.left + text.clientWidth / 2, y)?.closest(".lx-w");
    const at = hit ?? words.find((w) => w.getBoundingClientRect().bottom >= y);
    return {
      first: Number(words[0]?.dataset.i),
      last: Number(words.at(-1)?.dataset.i),
      count: words.length,
      anchor: at ? Number(at.dataset.i) : null,
      anchorTop: at ? at.getBoundingClientRect().top - r.top : null,
      scrollTop: text.scrollTop,
      fontSize: parseFloat(getComputedStyle(text).fontSize),
      lineHeight: parseFloat(getComputedStyle(text).lineHeight),
    };
  });
const wordTop = (i) =>
  page.evaluate((index) => {
    const text = document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"]');
    const node = text.querySelector(`.lx-w[data-i="${index}"]`);
    return node ? node.getBoundingClientRect().top - text.getBoundingClientRect().top : null;
  }, i);
const bookIdFromHash = () => page.evaluate(() => decodeURIComponent(location.hash.split("/")[2] ?? ""));

// ---------- the run ----------

await stage("sign up with a passkey, land in the app", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Reader Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  return "signed in";
});

// A sheet slides up when it opens (ui.sheet's lxShow): what's in it is measured once it's still.
// (A sheet coming up waits a frame at its start, below the screen, before its slide: held there counts as moving.)
const sheetStill = () => page.waitForFunction(() => ![...document.querySelectorAll('[data-part="sheet"]')].some((s) => s.getAnimations().length || s.style.transform === "translateY(100%)"), null, { timeout: 3000 }).catch(() => {});
// A sheet that's closing slides away (ui.sheet's lxHide) and is hidden after: wait until none is still going.
const sheetsSettled = () => page.waitForFunction(() => !document.querySelector('[data-part="sheet"][data-state="closing"]'), null, { timeout: 3000 }).catch(() => {});

// The reading settings keep what's changed less under More settings: open it (it stays open once opened).
const openMore = async () => {
  const more = page.locator(`${READER} [data-part="sheet"]:not([hidden]) details.lx-reader-more`).first();
  await more.waitFor({ timeout: 5000 });
  if (!(await more.evaluate((n) => n.open))) await more.locator("summary").click();
};
// Read's first view: the book you're reading up front with Continue, the others in Your library.
const openFromRead = async (title = null) => {
  const card = page.locator('[data-part="page"] [data-part="continue-card"]', { hasText: "Continue reading" });
  const inCard = title ? card.filter({ hasText: title }) : card;
  const tiles = page.locator('[data-part="page"] .lx-read-texts [data-part="book-tile"]');
  const tile = title ? tiles.filter({ hasText: title }) : tiles;
  await inCard.or(tile).first().waitFor({ timeout: 15000 });
  if (await inCard.count()) await inCard.first().getByRole("button", { name: "Continue" }).click();
  else await tile.first().click();
};
// An open book by its title: on the leading shelf, offered up front as a first book, or up front because you're reading it; else behind
// its shelf's row, found by its title in Find a book (Read's other shelves are rows to their pages, the bible's one shelf leading).
const openShelfBook = async (p, title) => {
  const tile = p.locator(':is(.lx-read-shelf, .lx-continue-top) [data-part="book-tile"]', { hasText: title });
  const card = p.locator('[data-part="page"] [data-part="continue-card"]', { hasText: "Continue reading" }).filter({ hasText: title });
  const drawn = p.locator('.lx-read-shelf :is(.lx-shelf-section[data-lead] [data-part="book-tile"], [data-part="empty-state"])');
  let seen = 0;
  for (let i = 0; i < 60; i++) {
    if (await card.count()) return card.first().getByRole("button", { name: "Continue" }).click();
    // Twice in a row: the tile of the book you're reading leaves the shelf once the library has drawn.
    seen = (await tile.count()) ? seen + 1 : 0;
    if (seen >= 2) return tile.first().click();
    // The shelf drawn for a few seconds and the book not on it: Find a book.
    if (i >= 6 && (await drawn.count())) {
      await p.evaluate((q) => (location.hash = `#read/find?${new URLSearchParams({ q })}`), title);
      const row = p.locator('[data-part="page"]:not([data-ghost]) [data-book] [data-part="list-row"]', { hasText: title }).first();
      await row.waitFor({ timeout: 20_000 }).catch(() => {
        throw new Error(`no open book "${title}" on Read or in Find a book`);
      });
      return row.click();
    }
    await p.waitForTimeout(500);
  }
  throw new Error(`no open book "${title}" on Read`);
};
const yourBooks = async () => {
  await page.locator('[data-part="page"] [data-part="continue-card"]', { hasText: "Continue reading" }).or(page.locator('[data-part="page"] .lx-read-texts [data-part="book-tile"]')).first().waitFor({ timeout: 15000 });
  return [...(await page.locator('[data-part="page"] [data-part="continue-card"]', { hasText: "Continue reading" }).allTextContents()), ...(await page.locator('[data-part="page"] .lx-read-texts [data-part="book-tile"]').allTextContents())];
};

// The ways to add a text are in a sheet: "Add a book or text" opens it.
const openAdd = async () => {
  await page.locator('[data-part="page"] [data-read-add]').click();
  await page.locator('.lx-sheet-layer:not([hidden]) [data-part="sheet"]').waitFor();
};

await stage("Read: nothing of yours yet, the ways to add a text, where texts are kept", async () => {
  // Read has no tab for now: it's Home's book card, or its Reading heading's All books.
  await page.locator('[data-part="tab"]', { hasText: "Home" }).first().click();
  await page.locator('[data-part="page"]:not([data-ghost]) .lx-home-cards a[href="#read"]').first().click();
  // Today's page has an empty state too: wait for Read's own title first. Read is a page you went into, so its title is on the page and the
  // header holds only the way back (the bible's one title form).
  await page.locator('[data-part="page"]:not([data-ghost]) [data-part="page-title"]', { hasText: "Read" }).waitFor({ timeout: 15_000 });
  await page.waitForSelector('[data-part="page"] [data-read-add]');
  // Nothing of yours: nothing to continue and nothing in your library. With open books here, the first is offered up front.
  const said = await page.locator('[data-part="page"]').innerText();
  assert(!/Continue reading/.test(said), "nothing to continue yet");
  assert((await page.locator('[data-part="page"] .lx-read-texts [data-part="book-tile"]').count()) === 0, "nothing in your library yet");
  const hasBooks = await page.evaluate(async () => { try { const r = await fetch("/library/catalogue.json"); return r.ok && ((await r.json()).books ?? []).length > 0; } catch { return false; } });
  if (hasBooks) {
    const first = page.locator('[data-part="page"] [data-part="continue-card"]');
    await first.waitFor({ timeout: 15000 });
    assert(/A good first book/.test(await first.textContent()), "a first book up front");
  }
  assert((await page.evaluate(() => document.documentElement.getAttribute("data-section"))) === "read", "the Read section's background");
  await shot("01-read-empty");
  await openAdd();
  // Where texts are kept is in the sheet: its words fill in once the device has said.
  // Kept with your account and on this device where the account keeps a copy (12 Nov 2026: read/store.js's texts kind), else on this device.
  await page.waitForFunction(() => /kept with your account|kept on this device|can't keep/.test(document.querySelector('.lx-sheet-layer:not([hidden]) [data-part="sheet"]')?.textContent ?? ""), null, { timeout: 10000 });
  const note = (await page.locator('.lx-sheet-layer:not([hidden]) [data-part="sheet"]').textContent()).match(/Your texts are kept[^.]*\.|This window can't keep texts[^.]*\./)?.[0] ?? "";
  assert(note, "the sheet says where texts are kept");
  assert(await page.getByText("Paste a text", { exact: true }).isVisible(), "Paste a text");
  assert(await page.getByText("Open a file", { exact: true }).isVisible(), "Open a file");
  assert(!(await page.locator('[data-part="ask-ai"]').count()), "the sheet offers an AI");
  await shot("01b-read-add");
  await page.keyboard.press("Escape");
  // The page scrolls again at once; the sheet slides away, then it's gone.
  assert(!(await page.evaluate(() => document.documentElement.hasAttribute("data-scroll-lock"))), "the page scrolls again");
  const gone = await page.locator('[data-part="sheet"][aria-label="Add a book or text"]').waitFor({ state: "hidden", timeout: 3000 }).then(() => true, () => false);
  assert(gone, "Escape closes the sheet");
  return note.trim();
});

let pastedId = null;
let CH2 = 0;
await stage("paste a text: it's kept and opens in the reader at its start", async () => {
  await openAdd();
  await page.getByText("Paste a text", { exact: true }).click();
  await page.waitForSelector("textarea[name=text]");
  assert(await page.locator('[data-part="app-back"]').isVisible(), "a back link to Read");
  await page.getByRole("button", { name: "Add and read" }).click();
  assert(await page.getByText("Paste a text first.").isVisible(), "an empty paste is refused, saying why");
  // Its language is one row and a wheel, so Add and read is near, not under a list of every language.
  const langRow = page.locator('[data-part="page"] [data-part="list-row"]', { hasText: "Its language" });
  assert(/English/.test(await langRow.textContent()), "English to start");
  const depth = await page.evaluate(() => { const p = document.querySelector('[data-part="page"]'); return p.scrollHeight - p.clientHeight; });
  assert(depth < 600, `Add and read is near: the page scrolls ${depth} px`);
  await langRow.click();
  const wheel = page.locator('[data-part="language-picker"]');
  await wheel.waitFor();
  const wheelRows = await wheel.locator(".lx-pick-row").allTextContents();
  assert(wheelRows.length > 50 && wheelRows[0] === "Dutch" && wheelRows[1] === "English", `the likely ones first, then every language: ${wheelRows.slice(0, 3)} of ${wheelRows.length}`);
  await wheel.locator(".lx-pick-row", { hasText: /^Dutch$/ }).click();
  await wheel.getByRole("button", { name: "Done" }).click();
  await wheel.waitFor({ state: "detached" });
  assert(/Dutch/.test(await langRow.textContent()), "the wheel's choice shows on the row");
  await langRow.click();
  await wheel.waitFor();
  await wheel.locator(".lx-pick-row", { hasText: /^English$/ }).click();
  await wheel.getByRole("button", { name: "Done" }).click();
  await wheel.waitFor({ state: "detached" });
  assert(/English/.test(await langRow.textContent()), "and back");
  await page.fill("input[name=title]", "The Bakery");
  await page.fill("textarea[name=text]", SAMPLE);
  await shot("02-paste");
  await page.getByRole("button", { name: "Add and read" }).click();
  await page.waitForURL(/#read\/book\//);
  await page.waitForSelector(`${READER}[data-ready]`);
  pastedId = await bookIdFromHash();
  const state = await readerState();
  const info = await page.evaluate(async (id) => {
    const store = await import("/js/read/store.js");
    const { text } = await store.getBook(id);
    const { validateBook } = await import("/js/read/book-format.js");
    return { problems: await validateBook(text), chapters: text.chapters.map((c) => c.title), ch2: text.paras[text.chapters[1].para].s, words: text.words.length, italic: text.italic.map(([s, e]) => text.words.slice(s, e).join(" ")) };
  }, pastedId);
  CH2 = info.ch2;
  assert(info.problems.length === 0, `the stored book is valid: ${info.problems[0]}`);
  assert(info.chapters.join("|") === "The Bakery on the Corner|A Letter", `chapters: ${info.chapters}`);
  assert(info.italic.join() === "eleven years.", `italic: ${info.italic}`);
  assert(state.first === 0 && state.last === CH2 - 1 && state.count === CH2, `chapter 1 only, every word its index: ${JSON.stringify(state)}`);
  assert((await page.locator(`${READER} [data-part="reader-title"]`).textContent()) === "The Bakery", "the title in the bar");
  assert((await page.locator(`${READER} [data-part="reader-heading"]`).count()) === 2, "the heading and its title line");
  assert((await page.locator(`${READER} [data-part="reader-heading"][data-variant="title"]`).textContent()).trim() === "The Bakery on the Corner", "the title line");
  assert((await page.locator(`${READER} [data-part="reader-scene"]`).count()) === 1, "the scene break");
  assert((await page.locator(`${READER} [data-part="reader-chapter-nav"][data-variant="next"]`).count()) === 1, "the way to chapter 2");
  assert((await page.locator(`${READER} .lx-it`).count()) === 2, "the italic words");
  assert(await page.evaluate(() => document.documentElement.hasAttribute("data-scroll-lock")), "nothing behind the reader scrolls");
  await shot("03-reader-bars-up");
  return `${info.words} words, ${state.count} in the page (chapter 1)`;
});

await stage("pages by default (one page on a phone held upright); scroll in the reader's settings", async () => {
  const opened = await page.evaluate(() => ({
    preset: document.documentElement.getAttribute("data-reader"),
    mode: document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.mode,
    pages: document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.pages,
    variant: document.querySelector('[data-part="reader"]:not([data-ghost])').getAttribute("data-variant"),
  }));
  assert(opened.preset === "pages" && opened.mode === "pages" && opened.pages > 1, `a new device opens texts in pages: ${JSON.stringify(opened)}`);
  assert(opened.variant === null, `upright, one page at a time: ${opened.variant}`);
  // A device that saved its appearance while scroll was the default: that "scroll" wasn't a choice, so it moves to
  // pages, once.
  const readSaved = () => page.evaluate(() => ({
    preset: document.documentElement.getAttribute("data-reader"),
    mode: document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.mode,
    saved: JSON.parse(localStorage.getItem("lx.appearance.v1") ?? "null"),
  }));
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("lx.appearance.v1") ?? "null") ?? { version: 1, theme: "graphite", presets: {}, look: { theme: null, name: "", tokens: {}, css: "", images: {} } };
    saved.presets = { ...saved.presets, reader: "scroll" };
    delete saved.moves;
    localStorage.setItem("lx.appearance.v1", JSON.stringify(saved));
  });
  await page.reload();
  await page.waitForSelector(`${READER}[data-ready]`);
  const moved = await readSaved();
  assert(moved.preset === "pages" && moved.mode === "pages" && moved.saved.presets.reader === "pages" && moved.saved.moves?.includes("reader-pages"), `an old saved "scroll" opens in pages, marked as moved: ${JSON.stringify({ ...moved, saved: { presets: moved.saved.presets, moves: moved.saved.moves } })}`);
  // Scroll chosen after that sticks (and the scroll stages come next).
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: "Scroll" }).click();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.waitForSelector(`${READER}[data-ready]`);
  const kept = await readSaved();
  assert(kept.preset === "scroll" && kept.mode === "scroll" && kept.saved.presets.reader === "scroll", `scroll chosen after the move stays: ${kept.preset}, ${kept.mode}`);
  return `opened in pages (${opened.pages} of them); an old saved scroll moved to pages once; scroll chosen after it kept`;
});

await stage("the bars: a tap puts them away, the top or bottom sixth brings them back, the chevron does both", async () => {
  assert(!(await zen()), "the bars start up");
  await tapAt(0.5);
  assert(await zen(), "a tap in the middle puts them away");
  assert(!(await page.locator(`${READER} [data-part="reader-bar"]`).isVisible()), "the top bar is gone");
  assert(!(await page.locator(`${READER} [data-part="reader-settings-button"]`).isVisible()), "the settings button is gone");
  assert((await page.locator(`${READER} [data-part="reader-collapse"]`).getAttribute("aria-pressed")) === "true", "the chevron says so");
  await tapAt(0.5);
  assert(await zen(), "a middle tap in zen leaves them away (scroll mode)");
  await shot("04-reader-zen");
  await tapAt(0.08);
  assert(!(await zen()), "a tap in the top sixth brings them back");
  await tapAt(0.5);
  await tapAt(0.92, 0.3);
  assert(!(await zen()), "a tap in the bottom sixth brings them back");
  await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  assert(await zen(), "the chevron puts them away");
  await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  assert(!(await zen()), "and brings them back");
  return "tap grammar holds";
});

await stage("never blocks: the bars' real buttons are pressable while their ghosts still slide in", async () => {
  await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await slowMotion(true);
  // Bring the bars back by script (a press would finish the slide), then press the settings button at once.
  await page.evaluate(() => document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-collapse"]').dispatchEvent(new MouseEvent("click", { bubbles: true })));
  const moving = await ghosts();
  assert(moving >= 2, `the bars' ghosts are sliding (${moving})`);
  const box = await page.locator(`${READER} [data-part="reader-settings-button"]`).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  assert((await page.locator(`${READER} [data-part="reader-settings-button"]`).getAttribute("aria-expanded")) === "true", "the press opened the settings mid-slide");
  assert((await ghosts()) === 0, "and finished every animation");
  await slowMotion(false);
  await page.keyboard.press("Escape");
  // A sheet slides away (ui.sheet's lxHide) before it's hidden: wait for the slide.
  await sheetsSettled();
  assert((await page.locator(`${READER} [data-part="sheet"]:not([hidden])`).count()) === 0, "Escape closes the settings");
  return `${moving} ghosts sliding; the press landed`;
});

await stage("settings: rise from their button, a tap outside only closes them", async () => {
  const gear = page.locator(`${READER} [data-part="reader-settings-button"]`);
  await gear.click();
  const sheet = page.locator(`${READER} [data-part="sheet"][aria-label="Reading settings"]`);
  assert(await sheet.isVisible(), "the settings are open");
  assert(await sheet.locator('[data-part="reader-size"] input[type=range]').isVisible(), "the text size slider");
  assert(await sheet.getByText("Remove it from every device").isVisible(), "removing it");
  await shot("05-reader-settings");
  const before = await zen();
  await tapAt(0.3);
  await sheetsSettled();
  assert(!(await sheet.isVisible()), "an outside tap closed them");
  assert((await zen()) === before, "and did nothing else (the bars didn't change)");
  await gear.click();
  await gear.click();
  await sheetsSettled();
  assert(!(await sheet.isVisible()), "the button toggles them");
  return "ok";
});

await stage("drawers: a handle drags them closed (pulled up they give and spring back), no border at the bottom, the button opens and closes them, by mouse and by touch", async () => {
  const gear = page.locator(`${READER} [data-part="reader-settings-button"]`);
  const sheet = page.locator(`${READER} [data-part="sheet"][aria-label="Reading settings"]`);
  const grip = sheet.locator('[data-part="sheet-handle"]');
  if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  const open = async () => {
    await sheetsSettled();
    if (!(await sheet.isVisible())) await gear.click();
    await sheet.waitFor();
    await page.waitForFunction(() => document.getAnimations().length === 0 && ![...document.querySelectorAll('[data-part="sheet"]')].some((x) => x.style.transform === "translateY(100%)"), null, { timeout: 3000 }).catch(() => {});
  };
  const top = () => sheet.evaluate((node) => node.getBoundingClientRect().top);
  // Open, and not on its way out (a closing sheet slides away before it's hidden).
  const openNow = () => sheet.evaluate((node) => !node.hidden && node.getAttribute("data-state") !== "closing");
  // Nothing moving: a sheet springs back by itself (ui.sheet's slide), not by a ghost. (A sheet coming up waits a frame at its start, below the
  // screen, before its slide begins: settled is no animation and no sheet held there.)
  const still = () => page.waitForFunction(() => document.getAnimations().length === 0 && ![...document.querySelectorAll('[data-part="sheet"]')].some((x) => x.style.transform === "translateY(100%)"), null, { timeout: 3000 }).catch(() => {});
  // A finger moving at a reading pace (Playwright's own steps land at once, which is a flick).
  const slowly = async (x, y0, y1, n = 8) => {
    for (let k = 1; k <= n; k++) {
      await page.mouse.move(x, y0 + ((y1 - y0) * k) / n);
      await page.waitForTimeout(30);
    }
  };
  const gripAt = async () => {
    const box = await grip.boundingBox();
    return [box.x + box.width / 2, box.y + box.height / 2];
  };
  await open();
  // It runs off the bottom: no border there, its foot at the screen's, its background carried on below it.
  const edge = await sheet.evaluate((node) => {
    const style = getComputedStyle(node);
    const after = getComputedStyle(node, "::after");
    return { border: style.borderBottomWidth, bottom: Math.round(node.getBoundingClientRect().bottom), screen: innerHeight, below: after.content !== "none" && parseFloat(after.height) >= innerHeight && after.backgroundColor === style.backgroundColor };
  });
  assert(edge.border === "0px" && Math.abs(edge.bottom - edge.screen) <= 1 && edge.below, `off the bottom edge: ${JSON.stringify(edge)}`);
  const rest = await top();
  let [cx, cy] = await gripAt();
  // Down a little: exactly under the finger; let go, and it's back and still open.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await slowly(cx, cy, cy + 60);
  const followed = (await top()) - rest;
  await page.waitForTimeout(150);
  await page.mouse.up();
  const stayed = await openNow();
  await still();
  const back = await top();
  assert(Math.abs(followed - 60) < 1.5 && stayed && Math.abs(back - rest) < 1, `down 60: followed ${followed}; let go, open ${stayed}, back at ${back - rest}`);
  // Up: it gives, less than the finger, and springs back.
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await slowly(cx, cy, cy - 200, 10);
  const gave = rest - (await top());
  const gap = await page.evaluate(() => {
    // Nothing of the page shows under it: the point just below the sheet's foot is still the sheet (its backing).
    const node = document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="sheet"]:not([hidden])');
    const r = node.getBoundingClientRect();
    return document.elementFromPoint(r.left + 20, Math.min(innerHeight - 2, r.bottom + 10))?.closest('[data-part="sheet"]') === node;
  });
  await shot("05b-sheet-pulled-up");
  await page.mouse.up();
  await still();
  assert(gave > 10 && gave < 140 && gap && Math.abs((await top()) - rest) < 1 && (await sheet.isVisible()), `pulled up 200: gave ${gave.toFixed(0)}, no gap ${gap}, then back and open`);
  // Past a third, slowly: closed.
  const height = await sheet.evaluate((node) => node.offsetHeight);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) {
    await page.mouse.move(cx, cy + (height * 0.45 * k) / 10);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  assert(!(await openNow()) && (await gear.getAttribute("aria-expanded")) === "false", "dragged past a quarter: closed");
  // A flick: short and fast closes it too.
  await open();
  [cx, cy] = await gripAt();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 40, { steps: 1 });
  await page.mouse.move(cx, cy + 80, { steps: 1 });
  await page.mouse.up();
  assert(!(await openNow()), "a flick closed it");
  // A tap on the handle closes it.
  await open();
  await grip.click();
  assert(!(await openNow()), "a tap on the handle closed it");
  // Never blocks: while a spring back is still sliding (slowed down), the settings take a press at once, and the press
  // finishes the slide.
  await open();
  [cx, cy] = await gripAt();
  await slowMotion(true);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await slowly(cx, cy, cy + 80);
  await page.waitForTimeout(400);
  await page.mouse.up();
  const drawing = await sheet.evaluate((node) => node.getAnimations().length);
  const modeBefore = await page.evaluate(() => document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.mode);
  const other = modeBefore === "pages" ? /^Scroll$/ : /^Pages$/;
  await sheet.locator('[data-part="segment"]', { hasText: other }).click();
  const modeAfter = await page.evaluate(() => document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.mode);
  await sheet.locator('[data-part="segment"]', { hasText: modeBefore === "pages" ? /^Pages$/ : /^Scroll$/ }).click();
  await slowMotion(false);
  assert(drawing > 0 && modeAfter !== modeBefore, `pressed mid-spring (${drawing} slide running): ${modeBefore} → ${modeAfter}`);
  // Animations off: it just closes, or snaps back, with nothing drawn.
  await page.evaluate(() => document.documentElement.setAttribute("data-motion", "off"));
  [cx, cy] = await gripAt();
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await slowly(cx, cy, cy + 50);
  await page.waitForTimeout(150);
  await page.mouse.up();
  const snapped = { ghosts: await ghosts(), at: (await top()) - rest, open: await sheet.isVisible() };
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(cx, cy + (height * 0.5 * k) / 8);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  const shut = { ghosts: await ghosts(), open: await sheet.isVisible() };
  await page.evaluate(() => document.documentElement.removeAttribute("data-motion"));
  assert(snapped.open && snapped.ghosts === 0 && Math.abs(snapped.at) < 1 && shut.ghosts === 0 && !shut.open, `animations off: ${JSON.stringify({ snapped, shut })}`);
  // The button, six times: open, closed, open… And with Contents open, it closes Contents (it never swaps one drawer
  // for the other); Contents' own button does the same for the settings.
  const states = [];
  for (let k = 0; k < 6; k++) {
    await gear.click();
    states.push(await openNow());
  }
  assert(states.join() === "true,false,true,false,true,false", `the button toggles: ${states}`);
  const anyOpen = () => page.locator(`${READER} [data-part="sheet"]:not([hidden]):not([data-state="closing"])`).count();
  await page.locator(`${READER} button[aria-label="Contents"]`).click();
  await gear.click();
  const afterGear = await anyOpen();
  await gear.click();
  await page.locator(`${READER} button[aria-label="Contents"]`).click();
  const afterContents = await anyOpen();
  assert(afterGear === 0 && afterContents === 0, `either button closes the open drawer: ${afterGear}, ${afterContents}`);
  // By touch: taps on the button, and the handle dragged by a finger.
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const touch = async (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  const tapOn = async (locator) => {
    const box = await locator.boundingBox();
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    await touch("touchStart", x, y);
    await touch("touchEnd", x, y);
    await page.waitForTimeout(80);
  };
  const tapped = [];
  for (let k = 0; k < 6; k++) {
    await tapOn(gear);
    tapped.push(await openNow());
  }
  await tapOn(gear);
  await page.waitForFunction(() => document.getAnimations().length === 0 && ![...document.querySelectorAll('[data-part="sheet"]')].some((x) => x.style.transform === "translateY(100%)"), null, { timeout: 3000 }).catch(() => {});
  [cx, cy] = await gripAt();
  await touch("touchStart", cx, cy);
  for (let k = 1; k <= 10; k++) {
    await touch("touchMove", cx, cy + (height * 0.45 * k) / 10);
    await page.waitForTimeout(25);
  }
  await touch("touchEnd", cx, cy);
  const touchClosed = !(await openNow());
  // A press straight after a drag is its own (only the drag's own click, if any, is ignored).
  await tapOn(gear);
  const reopened = await openNow();
  await tapOn(gear);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  assert(tapped.join() === "true,false,true,false,true,false" && touchClosed && reopened, `by touch: taps ${tapped}, dragged closed ${touchClosed}, a tap right after opened it ${reopened}`);
  return `followed 1:1, gave ${gave.toFixed(0)} of 200 up, closed past a quarter, by a flick, by a tap; a press mid-spring landed; instant with animations off; the button and touch toggle six times`;
});

await stage("text size: the slider resizes live and keeps the word you're reading in place; it's kept", async () => {
  // Read into the chapter first.
  await page.locator(`${READER} [data-part="reader-text"]`).evaluate((t) => (t.scrollTop = t.scrollHeight * 0.35));
  await page.waitForTimeout(100);
  const before = await readerState();
  const anchorTopBefore = await wordTop(before.anchor);
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  const slider = page.locator(`${READER} [data-part="reader-size"] input`);
  // The settings slide up: measure the slider once they're still.
  await page.waitForFunction(() => document.getAnimations().length === 0 && ![...document.querySelectorAll('[data-part="sheet"]')].some((x) => x.style.transform === "translateY(100%)"), null, { timeout: 3000 }).catch(() => {});
  const box = await slider.boundingBox();
  // Drag the thumb from the middle to near the right end, as a finger would.
  await page.mouse.move(box.x + box.width * ((before.fontSize - 14) / 12), box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * (0.42 + i * 0.05), box.y + box.height / 2);
  await page.mouse.up();
  await page.waitForTimeout(150);
  const after = await readerState();
  const anchorTopAfter = await wordTop(before.anchor);
  assert(after.fontSize > before.fontSize + 3, `the text grew: ${before.fontSize} → ${after.fontSize}`);
  assert(Math.abs(anchorTopAfter - anchorTopBefore) < before.lineHeight, `word ${before.anchor} stayed in place: ${anchorTopBefore.toFixed(1)} → ${anchorTopAfter.toFixed(1)}`);
  // (handle() is declared further down: this stage runs before it.)
  const sizeLang = await page.evaluate(() => document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.sizeLang);
  const saved = await page.evaluate((l) => JSON.parse(localStorage.getItem("lx.reader.v1")).sizes?.[l], sizeLang);
  assert(Math.abs(saved - after.fontSize) < 0.01, `the size is kept, for its language (${sizeLang}): ${saved}`);
  await page.keyboard.press("Escape");
  return `${before.fontSize}px → ${after.fontSize}px; word ${before.anchor} moved ${(anchorTopAfter - anchorTopBefore).toFixed(1)}px`;
});

await stage("where you are: kept as you read, and a reload opens there", async () => {
  await page.locator(`${READER} [data-part="reader-text"]`).evaluate((t) => (t.scrollTop = t.scrollHeight * 0.5));
  await page.waitForTimeout(700);
  const before = await readerState();
  const saved = await page.evaluate(async (id) => (await (await import("/js/read/store.js")).getPosition(id)), pastedId);
  assert(saved?.word === before.anchor, `saved word ${saved?.word} is the one being read (${before.anchor})`);
  await page.reload();
  await page.waitForSelector(`${READER}[data-ready]`);
  const after = await readerState();
  const top = await wordTop(before.anchor);
  const want = before.anchorTop;
  assert(top !== null && Math.abs(top - want) <= after.lineHeight, `word ${before.anchor} is back on the reading line: ${top?.toFixed(1)} vs ${want.toFixed(1)}`);
  assert(after.fontSize === before.fontSize, "the text size too");
  return `word ${before.anchor} at ${top.toFixed(0)}px`;
});

await stage("chapters: the next chapter's row, and Contents with where you are", async () => {
  await page.locator(`${READER} [data-part="reader-chapter-nav"][data-variant="next"]`).click();
  let state = await readerState();
  assert(state.first === CH2 && state.scrollTop === 0, `chapter 2 from its top: ${JSON.stringify(state)}`);
  assert((await page.locator(`${READER} [data-part="reader-chapter-nav"][data-variant="prev"]`).count()) === 1, "the way back to chapter 1");
  // Two words written together ("twice—standing", split by tokenize()) are shown together: no space after the dash,
  // as the book has it; the words around them keep theirs.
  const joined = await page.evaluate((reader) => {
    const spans = [...document.querySelectorAll(`${reader} .lx-w[data-i]`)].filter((s) => !s.hidden);
    const text = spans.map((s) => s.textContent).join("");
    const at = spans.findIndex((s) => s.textContent.startsWith("twice—"));
    return { text: text.slice(text.indexOf("Mila read"), text.indexOf("sitting") + 7), dash: spans[at]?.textContent, before: spans[at - 1]?.textContent };
  }, READER);
  assert(joined.dash === "twice—" && joined.before === "it ", `a dash joins two words with no space: ${JSON.stringify(joined)}`);
  assert(joined.text === "Mila read it twice—standing up—then once more sitting", `the line reads as written: ${JSON.stringify(joined.text)}`);
  if (await zen()) await tapAt(0.08);
  await page.locator(`${READER} button[aria-label="Contents"]`).click();
  const contents = page.locator(`${READER} [data-part="sheet"][aria-label="Contents"]`);
  assert(await contents.isVisible(), "Contents is open");
  const rows = await contents.locator('[data-part="list-row"]').allTextContents();
  assert(rows.length === 2, `two chapters: ${rows}`);
  assert((await contents.locator('[data-part="list-row"][data-state="current"]').textContent()).includes("A Letter"), "chapter 2 is where you are");
  await shot("06-reader-contents");
  await contents.locator('[data-part="list-row"]').first().click();
  state = await readerState();
  assert(state.first === 0 && !(await contents.isVisible()), "chapter 1, and Contents closed");
  return rows.map((r) => r.trim()).join(" · ");
});

let fileId = null;
await stage("open a file: a plain-text book comes in with its chapters, one chapter in the page", async () => {
  await page.locator(`${READER} button[aria-label="Back to your texts"]`).click();
  await page.waitForURL(/#read$/);
  const listed = await yourBooks();
  // Up front now, and only there: drawn as Home's card draws it (its title on the cover, in its paint), where you are on one line, no bar.
  const up = page.locator('[data-part="page"] [data-part="continue-card"]', { hasText: "The Bakery" });
  assert(listed.length === 1 && /The Bakery/.test(listed[0]) && /Continue reading/.test(listed[0]) && (await up.locator('[data-part="book-progress"]').count()) === 0, `the list: ${listed}`);
  const cover = await up.locator(".lx-hb-tile[data-paint] .lx-hb-cover-title").first().textContent().catch(() => null);
  assert(cover === "The Bakery", `a pasted text drawn as Home's book, its title on the cover: ${cover}`);
  const text = BOOK_FILE ? readFileSync(BOOK_FILE) : Buffer.from(`Title: A Small Book\nAuthor: Reader Check\n\n*** START OF THE PROJECT GUTENBERG EBOOK A SMALL BOOK ***\n\n${SAMPLE.replace(/\n\n/g, "\n\n")}\n\n*** END OF THE PROJECT GUTENBERG EBOOK A SMALL BOOK ***\nThe license.`);
  const name = BOOK_FILE ? basename(BOOK_FILE) : "small-book.txt";
  await openAdd();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByText("Open a file", { exact: true }).click()]);
  await chooser.setFiles({ name, mimeType: "text/plain", buffer: text });
  await page.waitForURL(/#read\/book\//);
  await page.waitForSelector(`${READER}[data-ready]`);
  fileId = await bookIdFromHash();
  const info = await page.evaluate(async (id) => {
    const { text } = await (await import("/js/read/store.js")).getBook(id);
    const { validateBook } = await import("/js/read/book-format.js");
    return { problems: await validateBook(text), title: text.title, authors: text.authors.map((a) => a.name), chapters: text.chapters.length, words: text.words.length, last: text.words.slice(-3).join(" ") };
  }, fileId);
  const state = await readerState();
  assert(info.problems.length === 0, `valid: ${info.problems[0]}`);
  assert(!/licen[cs]e|PROJECT GUTENBERG/i.test(info.last), `the Gutenberg license is left out: …${info.last}`);
  assert(state.count < info.words || info.chapters === 1, `one chapter in the page: ${state.count} of ${info.words}`);
  await page.locator(`${READER} button[aria-label="Contents"]`).click();
  const rows = await page.locator(`${READER} [data-part="sheet"][aria-label="Contents"] [data-part="list-row"]`).count();
  assert(rows === info.chapters, `Contents lists ${rows} of ${info.chapters} chapters`);
  await shot("07-file-contents");
  await page.keyboard.press("Escape");
  await page.locator(`${READER} [data-part="reader-chapter-nav"][data-variant="next"]`).click().catch(() => {});
  await shot("08-file-reading");
  return `"${info.title}" by ${info.authors.join(", ") || "?"}: ${info.chapters} chapters, ${info.words} words, ${state.count} in the page`;
});

await stage("a wide screen: the reader covers the sidebar, the text keeps a reading measure", async () => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(200);
  const box = await page.locator(READER).boundingBox();
  const flow = await page.locator(`${READER} .lx-reader-flow`).boundingBox();
  const { fontSize } = await readerState();
  assert(box.x === 0 && box.width === 1280, `the whole window: ${JSON.stringify(box)}`);
  assert(flow.width <= 36 * fontSize + 1 && Math.abs(flow.x + flow.width / 2 - 640) < 2, `a centered measure of 36em: ${JSON.stringify(flow)}`);
  await shot("09-wide");
  await page.setViewportSize({ width: 390, height: 844 });
  return `measure ${Math.round(flow.width)}px`;
});

// ---------- pages (piece 3) ----------

const handle = (expr) => page.evaluate((e) => {
  const r = document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader;
  return new Function("r", `return (${e});`)(r);
}, expr);
const waitTurn = (p = page) => p.waitForFunction(() => !document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.turning, null, { timeout: 5000 });
// Opens chapter k from Contents.
async function toChapter(k) {
  // The bars back by the chevron (a tap at the top could land on a word in a woven or picture book).
  if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await page.locator(`${READER} button[aria-label="Contents"]`).click();
  await page.locator(`${READER} [data-part="sheet"][aria-label="Contents"] [data-part="list-row"]`).nth(k).click();
}
// Makes sure n pages can still be turned forward (a short book may be on its last page): else back to its start.
async function roomForward(n) {
  const at = await handle("({ page: r.page, pages: r.pages, chapter: r.chapter })");
  const chapters = await page.locator(`${READER} [data-part="sheet"][aria-label="Contents"] [data-part="list-row"]`).count();
  if (at.pages - 1 - at.page >= n || (chapters && at.chapter < chapters - 1)) return;
  await toChapter(0);
}
// The page showing: every word of it inside its band, every other word outside it (and so under a cover), the
// pages tiling the chapter.
// Where the picture of the book page starting at word a sits on the shown page: { inside, first (px below its top) }.
const pictureOnPage = (p, a) =>
  p.evaluate((a) => {
    const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
    const text = root.querySelector('[data-part="reader-text"]');
    const top = text.getBoundingClientRect().top + parseFloat(getComputedStyle(text).paddingTop);
    const [, , h] = root.lxReader.pageRanges[root.lxReader.page];
    for (const figure of text.querySelectorAll('[data-part="reader-picture"]')) {
      const first = figure.nextElementSibling?.querySelector(".lx-w");
      if (+first?.dataset.i === a) {
        const r = figure.getBoundingClientRect();
        return { inside: r.top >= top - 1 && r.bottom <= top + h + 1, first: Math.round(r.top - top) };
      }
    }
    return null;
  }, a);
const pageCheck = (p = page) =>
  p.evaluate(() => {
    const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
    const r = root.lxReader;
    const text = root.querySelector('[data-part="reader-text"]');
    const box = text.getBoundingClientRect();
    const bandTop = box.top + parseFloat(getComputedStyle(text).paddingTop);
    const [a, b, h] = r.pageRanges[r.page];
    const bad = [];
    const leaks = [];
    for (const w of text.querySelectorAll(".lx-w")) {
      const i = Number(w.dataset.i);
      const q = w.getBoundingClientRect();
      if (!q.height) continue;
      const inside = q.top >= bandTop - 1 && q.bottom <= bandTop + h + 1;
      const outside = q.bottom <= bandTop + 1 || q.top >= bandTop + h - 1;
      if (i >= a && i <= b ? !inside : !outside) bad.push(i);
      // A word of another page that's within the screen must be under a cover.
      else if ((i < a || i > b) && q.top < box.bottom && q.bottom > box.top) {
        const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
        if (hit && hit.closest(".lx-w") === w) leaks.push(i);
      }
    }
    const ranges = r.pageRanges;
    const tiled = ranges.every((x, k) => k === 0 || x[0] === ranges[k - 1][1] + 1);
    // A page that's only a heading (a heading split from its own title line, or from the text under it).
    const onPage = [...text.querySelectorAll(".lx-w")].filter((w) => +w.dataset.i >= a && +w.dataset.i <= b);
    const headingOnly = onPage.length > 0 && onPage.every((w) => w.parentElement.getAttribute("data-part") === "reader-heading") && b < ranges.at(-1)[1];
    return { page: r.page, pages: r.pages, chapter: r.chapter, a, b, bad, leaks, tiled, headingOnly, status: root.querySelector('[data-part="reader-status"]').textContent, mode: r.mode, zen: r.zen };
  });

await stage("pages: whole lines only, nothing from the next page shows, the pages tile the chapter, the page number", async () => {
  if (await zen()) await tapAt(0.08);
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: /^Pages$/ }).click();
  await page.keyboard.press("Escape");
  assert((await page.evaluate(() => document.documentElement.getAttribute("data-reader"))) === "pages", "the Reader preset follows");
  // From the book's start, so there are pages to turn whatever its length.
  await toChapter(0);
  let state = await pageCheck();
  assert(state.mode === "pages" && state.pages > 1, `pages: ${JSON.stringify(state)}`);
  await shot("12-pages");
  const seen = [];
  for (let k = 0; k < 6; k++) {
    state = await pageCheck();
    assert(state.tiled, "the pages tile the chapter");
    assert(!state.bad.length && !state.leaks.length, `page ${state.page + 1}: cut or showing words ${state.bad.concat(state.leaks).slice(0, 5)}`);
    assert(!state.headingOnly, `page ${state.page + 1} is only a heading`);
    assert(state.status === `${state.page + 1}/${state.pages}`, `the page number: ${state.status}`);
    seen.push(`${state.chapter + 1}.${state.page + 1}:${state.a}-${state.b}`);
    const last = await handle("r.chapter === document.querySelectorAll('[data-part=\"reader\"]:not([data-ghost]) [data-part=\"sheet\"][aria-label=\"Contents\"] [data-part=\"list-row\"]').length - 1 && r.page === r.pages - 1");
    if (last) break;
    await page.keyboard.press("ArrowRight");
    await waitTurn();
  }
  return `checked ${seen.join(" ")} (chapter.page:words)`;
});

await stage("pages: with the bars away, a tap on the right goes on and on the left third goes back", async () => {
  await roomForward(1);
  if (!(await zen())) await tapAt(0.5);
  const before = await handle("r.page");
  await tapAt(0.5, 0.8);
  await waitTurn();
  const forward = await handle("r.page");
  await tapAt(0.5, 0.2);
  await waitTurn();
  const back = await handle("r.page");
  assert(forward === before + 1 && back === before, `pages ${before} → ${forward} → ${back}`);
  return `${before + 1} → ${forward + 1} → ${back + 1}`;
});

await stage("pages: a drag curls the page under the finger; past the middle it turns, short of it it springs back, a flick turns", async () => {
  await roomForward(2);
  if (await zen()) await tapAt(0.08);
  assert(!(await zen()), "the bars are up");
  const box = await page.locator(READER).boundingBox();
  const at = (fx, fy = 0.6) => [box.x + box.width * fx, box.y + box.height * fy];
  let start = await handle("r.page");
  await page.mouse.move(...at(0.85));
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(...at(0.85 - k * 0.03, 0.6 - k * 0.01));
  const mid = await page.evaluate(() => {
    const layer = document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-turn"]');
    return { shown: !layer.hidden, clip: layer.querySelector(".lx-turn-front")?.style.clipPath ?? "" };
  });
  assert(mid.shown && mid.clip.startsWith("polygon"), `the sheet curls during the drag: ${JSON.stringify(mid)}`);
  await shot("13-curl");
  for (let k = 1; k <= 8; k++) await page.mouse.move(...at(0.61 - k * 0.05));
  await page.mouse.up();
  await waitTurn();
  assert((await handle("r.page")) === start + 1, "past the middle: it turned");
  assert(await zen(), "the first page turned by hand put the bars away");
  start = await handle("r.page");
  await page.mouse.move(...at(0.9));
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) {
    await page.mouse.move(...at(0.9 - k * 0.012));
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  await waitTurn();
  assert((await handle("r.page")) === start, "short of the middle, slowly: it springs back");
  await page.mouse.move(...at(0.9));
  await page.mouse.down();
  await page.mouse.move(...at(0.9 - 0.12), { steps: 2 });
  await page.mouse.move(...at(0.9 - 0.24), { steps: 2 });
  await page.mouse.up();
  await waitTurn();
  assert((await handle("r.page")) === start + 1, "a flick with travel: it turned");
  return "drag, spring back, flick";
});

await stage("never blocks: a press while a turn settles finishes it at once", async () => {
  await roomForward(2);
  const start = await handle("r.page");
  await page.keyboard.press("ArrowRight");
  const settling = await handle("r.turning");
  const box = await page.locator(READER).boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await page.mouse.down();
  const after = await handle("({ turning: r.turning, page: r.page })");
  await page.mouse.up();
  await waitTurn();
  assert(settling, "the turn was still settling when pressed");
  assert(!after.turning && after.page === start + 1, `the press finished it: ${JSON.stringify(after)}`);
  // The press's own tap turned one more.
  await page.keyboard.press("ArrowLeft");
  await waitTurn();
  return `page ${start + 1} → ${after.page + 1} at the press`;
});

await stage("pages: across a chapter's edge, forward onto its first page and back onto the last", async () => {
  const chapters = await page.locator(`${READER} [data-part="sheet"][aria-label="Contents"] [data-part="list-row"]`).count();
  if ((await handle("r.chapter")) >= chapters - 1) await toChapter(0);
  const chapter = await handle("r.chapter");
  for (let k = 0; k < 400 && (await handle("r.chapter")) === chapter; k++) {
    await page.keyboard.press("ArrowRight");
    await waitTurn();
  }
  const next = await handle("({ chapter: r.chapter, page: r.page })");
  assert(next.chapter === chapter + 1 && next.page === 0, `onto the next chapter's first page: ${JSON.stringify(next)}`);
  const state = await pageCheck();
  assert(!state.bad.length && !state.leaks.length && !state.headingOnly, `its first page is whole, heading and text together: ${JSON.stringify(state)}`);
  assert(await page.locator(`${READER} [data-part="reader-heading"]`).first().isVisible(), "it opens with its heading");
  await shot("14-chapter-start");
  await page.keyboard.press("ArrowLeft");
  await waitTurn();
  const back = await handle("({ chapter: r.chapter, page: r.page, pages: r.pages })");
  assert(back.chapter === chapter && back.page === back.pages - 1, `back onto the last page: ${JSON.stringify(back)}`);
  return `chapter ${chapter + 1}'s last page ⇄ chapter ${chapter + 2}'s first`;
});

await stage("pages: the text size keeps the page's first word on the page; the trackpad turns one page a swipe", async () => {
  await roomForward(2);
  await page.keyboard.press("ArrowRight");
  await waitTurn();
  const first = (await pageCheck()).a;
  if (await zen()) await tapAt(0.08);
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  const slider = page.locator(`${READER} [data-part="reader-size"] input`);
  const sbox = await slider.boundingBox();
  await page.mouse.click(sbox.x + sbox.width * 0.2, sbox.y + sbox.height / 2);
  await page.keyboard.press("Escape");
  const smaller = await pageCheck();
  assert(first >= smaller.a && first <= smaller.b && !smaller.bad.length && !smaller.leaks.length, `word ${first} is still on the page (${smaller.a}–${smaller.b})`);
  await roomForward(1);
  const before = await handle("r.page");
  const box = await page.locator(READER).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(100);
  assert((await handle("r.page")) === before, "an up-and-down wheel does nothing");
  await page.mouse.wheel(120, 0);
  await waitTurn();
  await page.mouse.wheel(60, 0);
  await waitTurn();
  assert((await handle("r.page")) === before + 1, "one swipe, one page");
  return `word ${first} kept on page ${smaller.page + 1} at the smaller size; swipe → ${before + 2}`;
});

// A spread: every word of it inside the text's box and the page's band, every word of another spread outside the
// box and never seen (the box clips it, on a big screen too), the spreads tiling the chapter.
const spreadCheck = () =>
  page.evaluate(() => {
    const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
    const r = root.lxReader;
    const text = root.querySelector('[data-part="reader-text"]');
    const box = text.getBoundingClientRect();
    const style = getComputedStyle(text);
    const bandTop = box.top + parseFloat(style.paddingTop);
    const inLeft = box.left + parseFloat(style.paddingLeft);
    const inRight = box.right - parseFloat(style.paddingRight);
    const mid = (inLeft + inRight) / 2;
    const [a, b, h] = r.pageRanges[r.page];
    const bad = [];
    const leaks = [];
    const misheard = [];
    const sides = { left: 0, right: 0 };
    for (const w of text.querySelectorAll(".lx-w")) {
      const i = Number(w.dataset.i);
      const q = w.getBoundingClientRect();
      if (!q.height) continue;
      if (i >= a && i <= b) {
        if (q.left < inLeft - 1 || q.right > inRight + 1 || q.top < bandTop - 1 || q.bottom > bandTop + h + 1) bad.push(i);
        if (q.right <= mid) sides.left++;
        else if (q.left >= mid) sides.right++;
        else bad.push(i);
        // A finger on a word lands on that word: hit-testing agrees with where it's drawn (the flow is moved by a
        // transform, and its columns past the first two overflow it).
        const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2)?.closest(".lx-w");
        if (hit && hit !== w) misheard.push(`${i}→${hit.dataset.i}`);
      } else {
        if (q.right > box.left && q.left < box.right) bad.push(i);
        const x = q.left + q.width / 2;
        const y = q.top + q.height / 2;
        if (x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && document.elementFromPoint(x, y)?.closest(".lx-w") === w) leaks.push(i);
      }
    }
    const ranges = r.pageRanges;
    const tiled = ranges.every((x, k) => k === 0 || x[0] === ranges[k - 1][1] + 1);
    return {
      variant: root.getAttribute("data-variant"), page: r.page, pages: r.pages, chapter: r.chapter, a, b, bad: bad.slice(0, 5), leaks: leaks.slice(0, 5), misheard: misheard.slice(0, 5), ...sides, tiled,
      status: root.querySelector('[data-part="reader-status"]').textContent, box: { left: Math.round(box.left), width: Math.round(box.width) }, columns: getComputedStyle(text.querySelector(".lx-reader-flow")).columnCount,
    };
  });

// The stage turns the screen and back; whatever happens in it, the stages after it get the phone upright again.
async function upright(fn) {
  try {
    return await fn();
  } finally {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(200);
  }
}

await stage("a landscape or wide screen: two pages side by side, turned together; held words; back upright keeps your place", () => upright(async () => {
  await roomForward(3);
  const first = (await pageCheck()).a;
  // A phone turned on its side.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => document.querySelector('[data-part="reader"]:not([data-ghost])').getAttribute("data-variant") === "spread", null, { timeout: 3000 });
  let state = await spreadCheck();
  assert(state.columns === "2" && state.tiled && !state.bad.length && !state.leaks.length && !state.misheard.length, `a whole spread, nothing else showing: ${JSON.stringify(state)}`);
  assert(first >= state.a && first <= state.b, `the page's first word (${first}) is on the spread (${state.a}–${state.b})`);
  const firstSide = await page.evaluate((i) => {
    const text = document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"]');
    const box = text.getBoundingClientRect();
    return text.querySelector(`.lx-w[data-i="${i}"]`).getBoundingClientRect().right <= box.left + box.width / 2 ? "left" : "right";
  }, first);
  assert(firstSide === "left", `turned on its side, the page you were on starts the spread's left page: ${firstSide}`);
  assert(state.status === `${state.page + 1}/${state.pages}`, `the spread number: ${state.status}`);
  if (!(await zen())) await tapAt(0.5);
  await shot("33-spread-landscape");
  // Turned by a key, then by a drag past the middle (the whole spread curls).
  const seen = [`${state.a}-${state.b}`];
  await roomForward(2);
  const before = await spreadCheck();
  await page.keyboard.press("ArrowRight");
  await waitTurn();
  state = await spreadCheck();
  assert(state.page === before.page + 1 || state.chapter === before.chapter + 1, `a key turns the spread: ${before.page} → ${state.page}`);
  assert(state.chapter !== before.chapter || state.a === before.b + 1, `the next spread starts after the last one's last word: ${before.b} → ${state.a}`);
  assert(state.tiled && !state.bad.length && !state.leaks.length && !state.misheard.length && state.left > 0, `the next spread whole: ${JSON.stringify(state)}`);
  seen.push(`${state.a}-${state.b}`);
  await roomForward(1);
  const box = await page.locator(READER).boundingBox();
  const at = (fx, fy = 0.6) => [box.x + box.width * fx, box.y + box.height * fy];
  const start = await handle("({ page: r.page, chapter: r.chapter })");
  await page.mouse.move(...at(0.85));
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(...at(0.85 - k * 0.04, 0.6 - k * 0.01));
  const curl = await page.evaluate(() => {
    const layer = document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-turn"]');
    const copy = layer.querySelector(".lx-turn-front .lx-reader-flow");
    return { shown: !layer.hidden, clip: layer.querySelector(".lx-turn-front")?.style.clipPath ?? "", columns: copy ? getComputedStyle(copy).columnCount : null };
  });
  assert(curl.shown && curl.clip.startsWith("polygon") && curl.columns === "2", `the spread curls, its copy in the same two columns: ${JSON.stringify(curl)}`);
  await shot("34-spread-curl");
  for (let k = 1; k <= 6; k++) await page.mouse.move(...at(0.53 - k * 0.07));
  await page.mouse.up();
  await waitTurn();
  const end = await handle("({ page: r.page, chapter: r.chapter })");
  assert(end.page === start.page + 1 || end.chapter === start.chapter + 1, `past the middle: it turned (${JSON.stringify(start)} → ${JSON.stringify(end)})`);
  state = await spreadCheck();
  assert(state.tiled && !state.bad.length && !state.leaks.length && !state.misheard.length, `after the curl, a whole spread: ${JSON.stringify(state)}`);
  seen.push(`${state.a}-${state.b}`);
  // A word held on the right-hand page: painted where it is, a handle at each end, the toolbar on screen.
  const right = await page.evaluate(([a, b]) => {
    const text = document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"]');
    const box = text.getBoundingClientRect();
    const mid = box.left + box.width / 2;
    for (let i = Math.floor((a + b) / 2); i <= b; i++) {
      const q = text.querySelector(`.lx-w[data-i="${i}"]:not([hidden])`)?.getBoundingClientRect();
      if (q && q.left > mid + 20 && q.width > 20) return { i, x: q.left + q.width / 2, y: q.top + q.height / 2 };
    }
    return null;
  }, [state.a, state.b]);
  assert(right !== null, `a word on the right-hand page (${state.a}–${state.b})`);
  // Aimed by where the page draws it (Playwright's own boxes put a word on a later spread a column off).
  const under = await page.evaluate(({ x, y }) => document.elementsFromPoint(x, y).slice(0, 3).map((n) => `${n.tagName.toLowerCase()}[${n.getAttribute("data-i") ?? n.getAttribute("data-part") ?? n.className}]`), right);
  await page.mouse.move(right.x, right.y);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  await shot("35-spread-hold");
  const held = await page.evaluate((i) => {
    const reader = document.querySelector('[data-part="reader"]:not([data-ghost])');
    const word = reader.querySelector(`[data-part="reader-text"] .lx-w[data-i="${i}"]`);
    const q = word.getBoundingClientRect();
    const start = reader.querySelector('[data-part="reader-handle"][data-variant="start"]:not([data-state])')?.getBoundingClientRect();
    const end = reader.querySelector('[data-part="reader-handle"][data-variant="end"]:not([data-state])')?.getBoundingClientRect();
    const bar = reader.querySelector('[data-part="reader-hold"]:not([hidden])')?.getBoundingClientRect();
    return {
      selected: word.hasAttribute("data-selected"),
      handles: Boolean(start && end) && Math.abs(start.left + 22 - q.left) < 2 && Math.abs(end.left + 22 - q.right) < 2,
      bar: Boolean(bar) && bar.left >= 0 && bar.right <= innerWidth && bar.top >= 0 && bar.bottom <= innerHeight,
      page: reader.lxReader.page,
      painted: [...reader.querySelectorAll("[data-selected]")].map((n) => n.getAttribute("data-i")),
    };
  }, right.i);
  assert(held.selected && held.handles && held.bar && held.page === state.page, `held on the right-hand page (word ${right.i}, under the finger ${under}): ${JSON.stringify(held)}`);
  await page.keyboard.press("Escape");
  await tapAt(0.5, 0.5);
  assert((await handle("r.page")) === state.page, "a tap away from the held word ends it and keeps the spread");
  // A big screen: the spread keeps to a book's width, and the next spread's columns never show in the margins.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  state = await spreadCheck();
  assert(state.variant === "spread" && state.box.width <= 1100 && Math.abs(state.box.left + state.box.width / 2 - 720) < 2, `a centered spread a book wide: ${JSON.stringify(state.box)}`);
  // Both pages hold words, unless this spread is the chapter's last and it ends on the left (a short chapter).
  const lastSpread = state.page === state.pages - 1;
  assert(state.tiled && !state.bad.length && !state.leaks.length && !state.misheard.length && state.left > 0 && (state.right > 0 || lastSpread), `a whole spread on a big screen: ${JSON.stringify(state)}`);
  await shot("36-spread-desktop");
  // Upright again: the spread's first word is on the page.
  const spreadFirst = state.a;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => !document.querySelector('[data-part="reader"]:not([data-ghost])').hasAttribute("data-variant"), null, { timeout: 3000 });
  const back = await pageCheck();
  assert(spreadFirst >= back.a && spreadFirst <= back.b && !back.bad.length && !back.leaks.length && back.tiled, `upright again, word ${spreadFirst} on the page (${back.a}–${back.b}): ${JSON.stringify(back)}`);
  return `spreads ${seen.join(", ")}; held word ${right.i} on the right; ${state.box.width}px wide at 1440; upright on page ${back.page + 1}`;
}));

await stage("pages: back to scroll keeps your place", async () => {
  const first = (await pageCheck()).a;
  if (await zen()) await tapAt(0.08);
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: "Scroll" }).click();
  await page.keyboard.press("Escape");
  const top = await wordTop(first);
  const state = await readerState();
  const height = await page.locator(`${READER} [data-part="reader-text"]`).evaluate((t) => t.clientHeight);
  // On the reading line, unless it's so near the chapter's top or end that the page can't scroll that far.
  const scrollMax = await page.locator(`${READER} [data-part="reader-text"]`).evaluate((t) => t.scrollHeight - t.clientHeight);
  const onLine = top !== null && Math.abs(top - state.anchorTop) <= state.lineHeight * 1.5;
  const nearTop = state.scrollTop === 0 && top !== null && top >= 0 && top < height * 0.4;
  const nearEnd = state.scrollTop >= scrollMax - 1 && top !== null && top >= height * 0.4 - state.lineHeight && top < height;
  assert(onLine || nearTop || nearEnd, `word ${first} is on the reading line: ${top} vs ${state.anchorTop} (scrolled ${state.scrollTop} of ${scrollMax})`);
  return `word ${first} at ${top?.toFixed(0)}px`;
});

if (LONG_BOOK) {
  await stage("a long book from the library: every page of three chapters whole, verse and headings included", async () => {
    const book = JSON.parse(readFileSync(LONG_BOOK, "utf8"));
    // Its pictures (a classic's cover) come from beside its file (the books pipeline keeps them in pictures/), served as
    // the library serves them, for every page from here on: a local library that hasn't got them doesn't 404.
    for (const picture of book.pictures ?? []) {
      const file = join(dirname(LONG_BOOK), "pictures", picture.file);
      if (existsSync(file)) await context.route(`**/library/pictures/${picture.file}`, (route) => route.fulfill({ path: file }));
    }
    await page.evaluate(async (b) => {
      const store = await import("/js/read/store.js");
      await store.addBook(b);
      location.hash = `#read/book/${encodeURIComponent(b.id)}`;
    }, book);
    await page.waitForSelector(`${READER}[data-ready]`);
    if (await zen()) await tapAt(0.08);
    await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
    await sheetStill();
    await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: /^Pages$/ }).click();
    await page.keyboard.press("Escape");
    // Turning a few hundred pages: no animation needed for that.
    await page.evaluate(() => document.documentElement.setAttribute("data-motion", "off"));
    const verseChapter = book.chapters.findIndex((c, ci) => {
      const end = book.chapters[ci + 1]?.para ?? book.paras.length;
      return book.paras.slice(c.para, end).some((p) => p.k === "v");
    });
    let checked = 0;
    let verse = 0;
    for (const target of [0, verseChapter, book.chapters.length - 1]) {
      if (await zen()) await tapAt(0.08);
      await page.locator(`${READER} button[aria-label="Contents"]`).click();
      await page.locator(`${READER} [data-part="sheet"][aria-label="Contents"] [data-part="list-row"]`).nth(target).click();
      for (;;) {
        const state = await pageCheck();
        assert(state.chapter === target, `chapter ${target}`);
        assert(state.tiled && !state.bad.length && !state.leaks.length && !state.headingOnly, `chapter ${target + 1}, page ${state.page + 1}: ${JSON.stringify(state)}`);
        verse += await page.evaluate(([a, b]) => [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-verse"] .lx-w')].filter((w) => +w.dataset.i >= a && +w.dataset.i <= b).length > 0 ? 1 : 0, [state.a, state.b]);
        checked++;
        if (state.page === state.pages - 1) break;
        await page.keyboard.press("ArrowRight");
      }
      if (target === verseChapter) await shot("15-long-book-verse");
    }
    await page.evaluate(() => document.documentElement.removeAttribute("data-motion"));
    assert(verse > 0, "some pages hold verse");
    await page.goBack();
    return `"${book.title}": ${checked} pages checked across chapters 1, ${verseChapter + 1} and ${book.chapters.length}; ${verse} with verse`;
  });
}

await stage("remove a text: two presses, back to the list without it", async () => {
  if (await zen()) await tapAt(0.08);
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  // From every device you're signed in on (12 Nov 2026: your texts go to your other devices, and so does taking one out).
  const row = page.locator(`${READER} [data-part="sheet"]`).getByText("Remove it from every device");
  await row.click();
  assert(await page.locator(`${READER} [data-part="sheet"]`).getByText("Press again to remove it everywhere").isVisible(), "the first press arms it");
  await page.locator(`${READER} [data-part="sheet"]`).getByText("Press again to remove it everywhere").click();
  await page.waitForURL(/#read$/);
  const listed = await yourBooks();
  const removed = await page.evaluate(async (id) => (await (await import("/js/read/store.js")).getBook(id)) === null, fileId);
  assert(removed && listed.some((t) => /The Bakery/.test(t)) && listed.length === (LONG_BOOK ? 2 : 1), `the file's text is gone, the rest stay: ${listed}`);
  assert(!(await page.evaluate(() => document.documentElement.hasAttribute("data-scroll-lock"))), "the page scrolls again");
  await shot("10-read-list");
  return listed.map((t) => t.trim()).join(" · ");
});

// The woven-text try-out (#read/listen) is gone (5 Nov 2026): an old link to it lands on Read.
await stage("an old link to the woven try-out lands on Read", async () => {
  // In a page of its own, so the reader's page stays where the next stages expect it.
  const old = await context.newPage();
  try {
    old.on("pageerror", (e) => problems.push(`page error (old link): ${e.message}`));
    await old.goto(`${BASE}/app/#read/listen`);
    await old.waitForSelector('[data-part="page"] .lx-library-add', { timeout: 15_000 });
    assert(!(await old.getByText("Hear a woven text").count()), "the try-out is still offered");
    return "#read/listen shows Read";
  } finally {
    await old.close();
  }
});

await stage("animations off: the bars come and go with no ghosts", async () => {
  await page.evaluate(() => document.documentElement.setAttribute("data-motion", "off"));
  await openFromRead();
  await page.waitForSelector(`${READER}[data-ready]`);
  await tapAt(0.5);
  const away = await ghosts();
  await tapAt(0.08);
  const back = await ghosts();
  await page.evaluate(() => document.documentElement.removeAttribute("data-motion"));
  assert(away === 0 && back === 0, `ghosts: ${away}, ${back}`);
  await page.goBack();
  await page.waitForURL(/#read$/);
  return "none";
});

await stage("highlights and notes: Highlight and Note when you hold words, a wash and a ✦ in the margin, a note kept however its sheet closes, the list in the bar, after a reload, the ✦ and Remove, the setting, a turning page, a spread", async () => {
  await page.goto(`${BASE}/app/#read`);
  await openFromRead("The Bakery");
  await page.waitForSelector(`${READER}[data-ready]`);
  const bookId = decodeURIComponent(new URL(page.url()).hash.split("/").pop());
  if ((await handle("r.mode")) !== "pages") {
    if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
    await sheetStill();
    await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: /^Pages$/ }).click();
    await page.keyboard.press("Escape");
  }
  await toChapter(0);
  if (!(await zen())) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  const bar = page.locator(`${READER} [data-part="reader-hold"]:not([hidden])`);
  const wordBox = (i) =>
    page.evaluate((i) => {
      const r = document.querySelector(`[data-part="reader"]:not([data-ghost]) [data-part="reader-text"] [data-i="${i}"]`).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    }, i);
  const holdOn = async (i) => {
    const box = await wordBox(i);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await bar.waitFor();
  };
  const dragEndTo = async (i) => {
    const end = await page.locator(`${READER} [data-part="reader-handle"][data-variant="end"]:not([data-state])`).boundingBox();
    const onto = await wordBox(i);
    const from = { x: end.x + end.width / 2, y: end.y + end.height / 2 };
    const to = { x: onto.x + onto.width / 2, y: onto.y + onto.height / 2 };
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(from.x + ((to.x - from.x) * k) / 8, from.y + ((to.y - from.y) * k) / 8);
    await page.mouse.up();
    await bar.waitFor();
  };
  const painted = () =>
    page.evaluate(() => {
      const flow = document.querySelector('[data-part="reader"]:not([data-ghost]) .lx-reader-flow');
      const words = [...flow.querySelectorAll(".lx-w[data-highlight]")].map((w) => [+w.dataset.i, w.getAttribute("data-highlight")]);
      const marks = [...flow.querySelectorAll('[data-part="reader-note-mark"]')].map((m) => {
        const r = m.getBoundingClientRect();
        return { id: m.getAttribute("data-highlight-id"), hidden: m.hidden, state: m.getAttribute("data-state"), left: r.left, cy: r.top + r.height / 2 };
      });
      return { words, marks, flowRight: flow.getBoundingClientRect().right };
    });
  const stored = () => page.evaluate(async (id) => (await import("/js/read/highlights.js")).highlightsOf(id), bookId);
  // Words on the page, clear of the bars' places: the first to hold, and two more a few words on.
  const [a, b] = await handle("r.pageRanges[r.page]");
  const clear = await page.evaluate(([a, b]) => {
    const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
    const box = root.getBoundingClientRect();
    const out = [];
    for (let i = a; i <= b; i++) {
      const w = root.querySelector(`[data-part="reader-text"] [data-i="${i}"]`);
      const r = w?.getBoundingClientRect();
      if (r && r.height && !w.hidden && r.top > box.top + 110 && r.bottom < box.bottom - 120) out.push(i);
    }
    return out;
  }, [a, b]);
  assert(clear.length >= 14, `words to hold on the page: ${clear.length}`);
  const w1 = clear[2];
  const w2 = clear[10];
  assert(clear.includes(w1 + 3) && clear.includes(w2 + 1), "the ranges are on the page");

  // Hold, widen, Highlight: a wash over exactly those words, a faint ✦ in the margin by the last one, kept.
  await holdOn(w1);
  const offered = await bar.locator("button").allTextContents();
  assert(offered.includes("Highlight") && offered.includes("Note"), `Highlight and Note in the toolbar: ${offered}`);
  await dragEndTo(w1 + 3);
  await bar.getByRole("button", { name: "Highlight", exact: true }).click();
  let now = await painted();
  const lastBox = await wordBox(w1 + 3);
  assert(JSON.stringify(now.words) === JSON.stringify([0, 1, 2, 3].map((k) => [w1 + k, ""])), `the wash over exactly words ${w1}–${w1 + 3}: ${JSON.stringify(now.words)}`);
  assert(now.marks.length === 1 && !now.marks[0].hidden && now.marks[0].state === null, `one faint ✦: ${JSON.stringify(now.marks)}`);
  assert(Math.abs(now.marks[0].left - (now.flowRight - 6)) < 2 && now.marks[0].cy >= lastBox.top && now.marks[0].cy <= lastBox.bottom, `the ✦ in the margin by the last word: ${JSON.stringify({ mark: now.marks[0], flowRight: now.flowRight, lastBox })}`);
  let rows = await stored();
  assert(rows.length === 1 && rows[0].start === w1 && rows[0].end === w1 + 3 && rows[0].quote.length > 3 && rows[0].note === "", `kept: ${JSON.stringify(rows)}`);
  const first = rows[0];
  await shot("45-highlight");

  // Note: its sheet, the field ready to type; Escape closes it and the note is kept; its words and ✦ say so.
  await holdOn(w2);
  await dragEndTo(w2 + 1);
  await bar.getByRole("button", { name: "Note", exact: true }).click();
  const note = page.locator(`${READER} [data-part="reader-note"]`);
  await note.waitFor();
  assert(await page.evaluate(() => document.activeElement?.getAttribute("name") === "note"), "the note's field is ready to type in");
  await page.keyboard.type("Read this again");
  await shot("46-note");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-note"]')?.checkVisibility());
  rows = await stored();
  const noted = rows.find((h) => h.start === w2);
  assert(rows.length === 2 && noted?.end === w2 + 1 && noted.note === "Read this again", `the note kept when its sheet closed: ${JSON.stringify(rows)}`);
  now = await painted();
  assert(now.words.filter(([i, state]) => i >= w2 && i <= w2 + 1 && state === "noted").length === 2 && now.marks.find((m) => m.id === noted.id)?.state === "noted", `noted: ${JSON.stringify(now)}`);

  // The list in the bar: both, the note under its words; a row opens the text where its highlight is.
  await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  const listButton = page.locator(`${READER} button[aria-label="Highlights and notes"]`);
  await listButton.click();
  const list = page.locator(`${READER} [data-part="sheet"][aria-label="Highlights and notes"]`);
  const listed = await list.locator('[data-part="list-row"]').allTextContents();
  assert(listed.length === 2 && listed[0].includes(first.quote.slice(0, 12)) && listed[1].includes("Read this again"), `the list: ${JSON.stringify(listed)}`);
  await shot("47-highlights-list");
  await page.keyboard.press("Escape");
  const pages = await handle("r.pages");
  if (pages > 1) {
    await page.keyboard.press("ArrowRight");
    await waitTurn();
  }
  if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await listButton.click();
  await list.locator('[data-part="list-row"]').first().click();
  const [pa, pb] = await handle("r.pageRanges[r.page]");
  assert(first.start >= pa && first.start <= pb, `the row opened its page: words ${pa}–${pb}, the highlight at ${first.start}`);

  // After a reload (once that page is kept as where you are): both painted again, with their ✦.
  const placeKept = () => page.evaluate(async ([id, word]) => (await (await import("/js/read/store.js")).getPosition(id))?.word === word, [bookId, pa]);
  for (let tries = 0; tries < 50 && !(await placeKept()); tries++) await page.waitForTimeout(50);
  await page.reload();
  await page.waitForSelector(`${READER}[data-ready]`);
  now = await painted();
  assert(now.words.length === 6 && now.marks.length === 2 && now.marks.every((m) => !m.hidden), `back after a reload: ${JSON.stringify(now)}`);

  // The ✦ opens the note (as written, not to type in); Remove highlight takes it out.
  if (!(await zen())) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await page.locator(`${READER} [data-part="reader-note-mark"][data-highlight-id="${noted.id}"]`).click();
  await note.waitFor();
  const shown = await page.evaluate(() => ({ value: document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-note"] textarea').value, typing: document.activeElement?.tagName === "TEXTAREA" }));
  assert(shown.value === "Read this again" && !shown.typing, `the ✦ opens its note: ${JSON.stringify(shown)}`);
  await note.getByRole("button", { name: "Remove highlight" }).click();
  rows = await stored();
  now = await painted();
  assert(rows.length === 1 && rows[0].id === first.id && now.words.length === 4 && now.marks.length === 1, `removed: ${JSON.stringify({ rows: rows.length, now })}`);

  // Holding exactly a highlight's words again: its Note and Remove highlight, no second Highlight.
  await page.evaluate(([a, b]) => document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.select(a, b), [first.start, first.end]);
  await bar.waitFor();
  const again = await bar.locator("button").allTextContents();
  assert(again.includes("Remove highlight") && !again.includes("Highlight"), `the same words again: ${again}`);
  await bar.getByRole("button", { name: "Remove highlight" }).click();
  assert((await stored()).length === 0 && (await painted()).words.length === 0, "taken out from the toolbar");

  // Turned off in the reading settings: holding words offers neither.
  await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  await openMore();
  await page.locator(`${READER} [data-part="sheet"] [data-part="list-row"]`, { hasText: "Highlight and note" }).click();
  await page.keyboard.press("Escape");
  await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await holdOn(w1);
  const off = await bar.locator("button").allTextContents();
  assert(!off.includes("Highlight") && !off.includes("Note"), `off: ${off}`);
  await tapAt(0.5, 0.5);
  await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  await openMore();
  await page.locator(`${READER} [data-part="sheet"] [data-part="list-row"]`, { hasText: "Highlight and note" }).click();
  await page.keyboard.press("Escape");
  await page.locator(`${READER} [data-part="reader-collapse"]`).click();

  // A turning page carries its ✦ (the page's copy has it); a note kept for the export.
  await holdOn(w1);
  await bar.getByRole("button", { name: "Note", exact: true }).click();
  await note.waitFor();
  await page.keyboard.type("For the export");
  await note.getByRole("button", { name: "Save" }).click();
  const box = await page.locator(READER).boundingBox();
  const at = (fx, fy = 0.6) => [box.x + box.width * fx, box.y + box.height * fy];
  let turning = 0;
  if ((await handle("r.page")) < (await handle("r.pages")) - 1) {
    await page.mouse.move(...at(0.85));
    await page.mouse.down();
    for (let k = 1; k <= 6; k++) await page.mouse.move(...at(0.85 - k * 0.03, 0.6 - k * 0.01));
    turning = await page.locator(`${READER} [data-part="reader-turn"] [data-part="reader-note-mark"]`).count();
    for (let k = 1; k <= 6; k++) {
      await page.mouse.move(...at(0.67 + k * 0.03));
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await waitTurn();
    assert(turning > 0, "the turning page shows the ✦");
  }

  // A spread: the ✦ in its own column's margin.
  const spread = await upright(async () => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => document.querySelector('[data-part="reader"]:not([data-ghost])').getAttribute("data-variant") === "spread", null, { timeout: 3000 });
    await toChapter(0);
    if (!(await zen())) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    // The last two words drawn on the spread (in its right page, when the chapter reaches it), and that column's edge.
    const pick = await page.evaluate(() => {
      const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
      const text = root.querySelector('[data-part="reader-text"]');
      const box = text.getBoundingClientRect();
      const seen = [...text.querySelectorAll(".lx-w")].filter((w) => {
        const r = w.getBoundingClientRect();
        return !w.hidden && r.height && r.left >= box.left && r.right <= box.right && r.top >= box.top + 60 && r.bottom <= box.bottom - 60;
      });
      const last = seen.at(-1);
      const right = last.getBoundingClientRect().left > box.left + box.width / 2;
      const column = seen.filter((w) => (w.getBoundingClientRect().left > box.left + box.width / 2) === right);
      return { i: +last.dataset.i, right, edge: Math.max(...column.map((w) => w.getBoundingClientRect().right)) };
    });
    await page.evaluate(([a, b]) => document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.select(a, b), [pick.i - 1, pick.i]);
    await bar.waitFor();
    await bar.getByRole("button", { name: "Highlight", exact: true }).click();
    const marked = await painted();
    const made = (await stored()).find((h) => h.end === pick.i);
    const mark = marked.marks.find((m) => m.id === made?.id);
    await shot("48-highlight-spread");
    await page.evaluate(([a, b]) => document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.select(a, b), [pick.i - 1, pick.i]);
    await bar.waitFor();
    await bar.getByRole("button", { name: "Remove highlight" }).click();
    return { pick, mark };
  });
  assert(spread.mark && !spread.mark.hidden && spread.mark.left >= spread.pick.edge - 12 && spread.mark.left <= spread.pick.edge + 30, `on a spread, the ✦ by its own column (${spread.pick.right ? "right" : "left"}): ${JSON.stringify(spread)}`);
  return `highlighted ${w1}–${w1 + 3}, noted ${w2}–${w2 + 1}; the list opened its page; back after a reload; removed by its ✦ and from the toolbar; off in the settings; the turning page's copy has ${turning} ✦; on a spread, by the ${spread.pick.right ? "right" : "left"} column`;
});

await stage("search in the text: Contents' field finds every place (case aside, across words), each with its words marked and its chapter; a tap opens the text there and lights them up for a moment; Enter, and a word that isn't there", async () => {
  await page.goto(`${BASE}/app/#read`);
  await openFromRead("The Bakery");
  await page.waitForSelector(`${READER}[data-ready]`);
  const bookId = decodeURIComponent(new URL(page.url()).hash.split("/").pop());
  await toChapter(0);
  const openContents = async () => {
    if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    await page.locator(`${READER} button[aria-label="Contents"]`).click();
  };
  const sheet = page.locator(`${READER} [data-part="sheet"][aria-label="Contents"]`);
  const field = sheet.locator('[data-part="search-field"] input');
  const results = () =>
    sheet.evaluate((s) =>
      [...s.querySelectorAll('[data-part="list-row"]')].map((row) => ({ hit: row.querySelector('[data-part="reader-search-hit"]')?.textContent ?? null, sub: row.querySelector(".lx-row-sub")?.textContent ?? "", text: row.textContent })),
    );
  const mila = await page.evaluate(async (id) => {
    const { text } = await (await import("/js/read/store.js")).getBook(id);
    return text.words.flatMap((w, i) => (/mila/i.test(w) ? [i] : []));
  }, bookId);
  await openContents();
  await field.fill("MILA");
  await page.waitForFunction((n) => document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="sheet"][aria-label="Contents"] [data-part="reader-search-hit"]').length === n, mila.length, { timeout: 3000 });
  const found = await results();
  const chapters = [...new Set(found.map((r) => r.sub))];
  assert(found.length === mila.length && found.every((r) => /^mila/i.test(r.hit)) && chapters.length === 2, `every "Mila", marked, with its chapter: ${JSON.stringify(found)}`);
  await shot("49-search");
  // One in the other chapter: the text opens there, the word lit up, then back as it was.
  const k = found.findIndex((r) => r.sub !== found[0].sub);
  const target = mila[k];
  await sheet.locator('[data-part="list-row"]').nth(k).click();
  const there = await page.evaluate((i) => {
    const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
    const r = root.lxReader;
    const word = root.querySelector(`[data-part="reader-text"] [data-i="${i}"]`);
    const q = word.getBoundingClientRect();
    const box = root.querySelector('[data-part="reader-text"]').getBoundingClientRect();
    return { chapter: r.chapter, mode: r.mode, range: r.pageRanges[r.page] ?? null, found: word.getAttribute("data-found"), seen: q.top >= box.top && q.bottom <= box.bottom && document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2)?.closest("[data-i]") === word };
  }, target);
  assert(there.chapter === 1 && there.found === "" && there.seen && (there.mode !== "pages" || (target >= there.range[0] && target <= there.range[1])), `opened at the word, lit up: ${JSON.stringify(there)}`);
  await shot("50-search-opened");
  await page.waitForFunction((i) => !document.querySelector(`[data-part="reader"]:not([data-ghost]) [data-part="reader-text"] [data-i="${i}"]`).hasAttribute("data-found"), target, { timeout: 4000 });
  // Opened again, Contents starts with an empty field and its chapters; across words; Enter; not there.
  await openContents();
  assert((await field.inputValue()) === "" && (await sheet.locator('[data-part="reader-search-hit"]').count()) === 0, "Contents again: an empty field, its chapters");
  await field.fill("mila READ");
  await page.waitForFunction(() => document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="sheet"][aria-label="Contents"] [data-part="reader-search-hit"]').length === 1, null, { timeout: 3000 });
  const across = await results();
  assert(across.length === 1 && across[0].hit === "Mila read", `across two words: ${JSON.stringify(across)}`);
  await field.fill("zebra");
  await field.press("Enter");
  await sheet.getByText("“zebra” isn't in this text.").waitFor({ timeout: 3000 });
  assert(await page.evaluate(() => document.activeElement?.type !== "search"), "Enter put the keyboard away");
  await page.keyboard.press("Escape");
  return `${found.length} places of "Mila" over ${chapters.length} chapters; opened chapter 2 at word ${target}, lit and faded; "mila read" once; "zebra" nowhere`;
});

await stage("pinch zoom: two fingers zoom the page about them and it stays when they lift; one finger moves it; no turn, hold or tap while zoomed; pinching back ends it; the browser itself never zooms; iPhone's gesture events (WebKit) do the same", async () => {
  await page.goto(`${BASE}/app/#read`);
  await openFromRead("The Bakery");
  await page.waitForSelector(`${READER}[data-ready]`);
  if ((await handle("r.mode")) !== "pages") {
    if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
    await sheetStill();
    await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: /^Pages$/ }).click();
    await page.keyboard.press("Escape");
  }
  await toChapter(0);
  if (!(await zen())) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
  try {
    const box = await page.locator(READER).boundingBox();
    const cx = Math.round(box.x + box.width * 0.4);
    const cy = Math.round(box.y + box.height * 0.45);
    const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    const pinchApart = async (from, to) => {
      const at = (d) => [{ x: cx - d, y: cy, id: 0 }, { x: cx + d, y: cy, id: 1 }];
      await touch("touchStart", at(from));
      for (let k = 1; k <= 8; k++) {
        await touch("touchMove", at(from + ((to - from) * k) / 8));
        await page.waitForTimeout(16);
      }
      await touch("touchEnd", []);
      await page.waitForTimeout(100);
    };
    const drag = async (x0, y0, x1, y1) => {
      await touch("touchStart", [{ x: x0, y: y0, id: 0 }]);
      for (let k = 1; k <= 8; k++) {
        await touch("touchMove", [{ x: x0 + ((x1 - x0) * k) / 8, y: y0 + ((y1 - y0) * k) / 8, id: 0 }]);
        await page.waitForTimeout(16);
      }
      await touch("touchEnd", []);
      await page.waitForTimeout(100);
    };
    const state = () =>
      page.evaluate(() => {
        const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
        const r = root.lxReader;
        return { zoom: r.zoom, zoomed: root.hasAttribute("data-zoomed"), page: r.page, zen: r.zen, held: Boolean(root.querySelector('[data-part="reader-hold"]:not([hidden])')), browser: visualViewport.scale };
      });
    const under = (x, y) => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-i]")?.getAttribute("data-i") ?? null, [x, y]);
    const start = await state();
    const word = await under(cx, cy);
    // Two fingers apart: twice the size, about them; it stays when they lift.
    await pinchApart(40, 80);
    const pinched = await state();
    assert(Math.abs(pinched.zoom.s - 2) < 0.05 && pinched.zoomed && pinched.browser === 1, `zoomed 2× by the page, not the browser: ${JSON.stringify(pinched)}`);
    assert(word && (await under(cx, cy)) === word, `the word under the fingers is still under them: ${word}`);
    await shot("51-pinched");
    // One finger moves it.
    await drag(cx, cy, cx + 60, cy + 40);
    const moved = await state();
    assert(Math.abs(moved.zoom.x - pinched.zoom.x - 60) < 2 && Math.abs(moved.zoom.y - pinched.zoom.y - 40) < 2 && moved.page === start.page && !moved.held, `one finger moved it, nothing turned: ${JSON.stringify({ pinched: pinched.zoom, moved })}`);
    // A tap on the page's right side, the arrow key, a long press on a word: nothing turns, nothing's held.
    await touch("touchStart", [{ x: box.x + box.width * 0.85, y: cy, id: 0 }]);
    await touch("touchEnd", []);
    await page.keyboard.press("ArrowRight");
    const [wx, wy] = await page.evaluate(() => {
      const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
      const box = root.getBoundingClientRect();
      const w = [...root.querySelectorAll('[data-part="reader-text"] .lx-w')].find((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 20 && r.left > box.left + 20 && r.right < box.right - 20 && r.top > box.top + 140 && r.bottom < box.bottom - 140;
      });
      const r = w.getBoundingClientRect();
      return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)];
    });
    await touch("touchStart", [{ x: wx, y: wy, id: 0 }]);
    await page.waitForTimeout(650);
    await touch("touchEnd", []);
    await page.waitForTimeout(100);
    const still = await state();
    assert(still.page === start.page && !still.held && still.zoomed && still.zen === start.zen, `zoomed: no turn, no hold, no bars: ${JSON.stringify(still)}`);
    // Pinching back past 1×: the page as it was, and turning again.
    await pinchApart(80, 30);
    const back = await state();
    assert(back.zoom.s === 1 && !back.zoomed && (await page.locator(`${READER} [data-part="reader-text"]`).evaluate((t) => t.style.transform)) === "", `pinched back: ${JSON.stringify(back)}`);
    if ((await handle("r.pages")) > 1) {
      await page.keyboard.press("ArrowRight");
      await waitTurn();
      assert((await handle("r.page")) === start.page + 1, "it turns again");
      await page.keyboard.press("ArrowLeft");
      await waitTurn();
    }
  } finally {
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  }

  // WebKit: iPhone's gesture events (a pinch arrives as gesturestart/change/end with its scale), on a book from the
  // shelf (this check's own texts are in Chrome's storage).
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const meta = (catalogue?.books ?? []).find((b) => b.layers?.en?.kind === "help") ?? catalogue?.books?.[0];
  if (!meta) return "Chrome: 2×, moved, nothing turned or held, back to 1×; no library book for WebKit (skipped)";
  const engine = await webkit.launch({ headless: true });
  try {
    const { cookies } = await context.storageState();
    const phone = await engine.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, storageState: { cookies, origins: [] } });
    const wk = await phone.newPage();
    wk.on("pageerror", (e) => problems.push(`page error (WebKit): ${e.message}`));
    await wk.goto(`${BASE}/app/#read`);
    await wk.waitForSelector("html[data-app-ready]", { timeout: 20_000 });
    await openShelfBook(wk, meta.title);
    await wk.waitForSelector(`${READER}[data-ready]`, { timeout: 20_000 });
    const gestures = await wk.evaluate(async () => {
      const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
      const text = root.querySelector('[data-part="reader-text"]');
      const fire = (type, scale) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.assign(event, {});
        Object.defineProperties(event, { scale: { value: scale }, clientX: { value: 150 }, clientY: { value: 400 } });
        text.dispatchEvent(event);
        return event.defaultPrevented;
      };
      const has = "GestureEvent" in window;
      const refused = fire("gesturestart", 1);
      fire("gesturechange", 1.5);
      fire("gesturechange", 2.5);
      fire("gestureend", 2.5);
      const zoomed = { ...root.lxReader.zoom, on: root.hasAttribute("data-zoomed") };
      fire("gesturestart", 1);
      fire("gesturechange", 0.3);
      fire("gestureend", 0.3);
      return { has, refused, zoomed, after: { ...root.lxReader.zoom, on: root.hasAttribute("data-zoomed") }, browser: visualViewport.scale };
    });
    assert(gestures.has && gestures.refused && Math.abs(gestures.zoomed.s - 2.5) < 0.05 && gestures.zoomed.on && gestures.after.s === 1 && !gestures.after.on && gestures.browser === 1, `WebKit's gesture events: ${JSON.stringify(gestures)}`);
    return `Chrome: 2× about the fingers (the word under them kept), moved by one finger, no turn, hold or bars while zoomed, back to 1× and turning; WebKit's gesture events: 2.5× and back; the browser's own zoom stayed at 1`;
  } finally {
    await engine.close();
  }
});

await stage("Contents: in pages, how long each chapter is (the open one exactly, the others about); none in scroll", async () => {
  await page.goto(`${BASE}/app/#read`);
  await page.reload();
  await openFromRead("The Bakery");
  await page.waitForSelector(`${READER}[data-ready]`);
  const setMode = async (name) => {
    if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
    await sheetStill();
    await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: new RegExp(`^${name}$`) }).click();
    await page.keyboard.press("Escape");
  };
  const lengths = async () => {
    if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    await page.locator(`${READER} button[aria-label="Contents"]`).click();
    const rows = await page.locator(`${READER} [data-part="sheet"][aria-label="Contents"] [data-part="list-row"]`).evaluateAll((items) =>
      items.filter((row) => !row.textContent.includes("About this book")).map((row) => ({ current: row.getAttribute("data-state") === "current", value: row.querySelector(".lx-row-value")?.textContent ?? null })),
    );
    await page.keyboard.press("Escape");
    return rows;
  };
  if ((await handle("r.mode")) !== "pages") await setMode("Pages");
  const pages = await handle("r.pages");
  const paged = await lengths();
  const open = paged.find((row) => row.current);
  const others = paged.filter((row) => !row.current);
  assert(open?.value === `${pages} ${pages === 1 ? "page" : "pages"}` && others.length && others.every((row) => /^about \d+ pages?$/.test(row.value)), `pages: ${JSON.stringify({ pages, paged })}`);
  await setMode("Scroll");
  const scrolled = await lengths();
  await setMode("Pages");
  assert(scrolled.every((row) => row.value === null), `none in scroll: ${JSON.stringify(scrolled)}`);
  return `the open chapter ${open.value}; ${others.map((row) => row.value).join(", ")}; none in scroll`;
});

await stage("full screen, on a computer: a faint button bottom right only while the bars are away; it goes full screen and back; none on a touch screen", async () => {
  await page.goto(`${BASE}/app/#read`);
  await page.reload();
  await openFromRead("The Bakery");
  await page.waitForSelector(`${READER}[data-ready]`);
  const button = page.locator(`${READER} [data-part="reader-fullscreen"]`);
  const looks = () => button.evaluate((b) => ({ opacity: Number(getComputedStyle(b).opacity), events: getComputedStyle(b).pointerEvents, pressed: b.getAttribute("aria-pressed"), label: b.getAttribute("aria-label"), on: Boolean(document.fullscreenElement) }));
  if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await page.waitForTimeout(400);
  const barsUp = await looks();
  assert(barsUp.opacity === 0 && barsUp.events === "none", `with the bars up, it's away: ${JSON.stringify(barsUp)}`);
  await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await page.waitForTimeout(400);
  const away = await looks();
  assert(away.opacity > 0.2 && away.opacity < 0.5 && away.events === "auto", `bars away, it's there, faint: ${JSON.stringify(away)}`);
  await button.click();
  await page.waitForFunction(() => document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-fullscreen"]')?.getAttribute("aria-pressed") === "true", null, { timeout: 3000 }).catch(() => {});
  const full = await looks();
  assert(full.on && full.pressed === "true" && full.label === "Leave full screen" && (await page.locator(`${READER}[data-fullscreen]`).count()) === 1, `full screen: ${JSON.stringify(full)}`);
  await shot("56-full-screen");
  await button.click();
  await page.waitForFunction(() => document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-fullscreen"]')?.getAttribute("aria-pressed") === "false", null, { timeout: 3000 }).catch(() => {});
  const back = await looks();
  assert(!back.on && back.pressed === "false", `back: ${JSON.stringify(back)}`);
  // A phone (a touch screen, no fine pointer): no button.
  const { cookies } = await context.storageState();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: { cookies, origins: [] } });
  try {
    const touch = await phone.newPage();
    const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const meta = catalogue?.books?.[0];
    if (meta) {
      await touch.goto(`${BASE}/app/#read`);
      await touch.waitForSelector("html[data-app-ready]");
      await openShelfBook(touch, meta.title.slice(0, 20));
      await touch.waitForSelector(`${READER}[data-ready]`);
      assert((await touch.locator(`${READER} [data-part="reader-fullscreen"]`).count()) === 0, "no full screen button on a touch screen");
    }
  } finally {
    await phone.close();
  }
  return "away with the bars up, faint with them away; full screen and back; none on a phone";
});

await stage("Your data: the export lists your texts and their highlights; deleting them empties Read", async () => {
  await page.goto(`${BASE}/app/#settings/data`);
  await page.waitForSelector('[data-part="page-title"]');
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByText("Download everything", { exact: true }).click()]);
  const file = JSON.parse(readFileSync(await download.path(), "utf8"));
  const texts = file.device.texts;
  assert(Array.isArray(texts) && texts.length === (LONG_BOOK ? 2 : 1) && texts.some((t) => t.title === "The Bakery") && texts.every((t) => typeof t.position === "number"), `texts in the export: ${JSON.stringify(texts)}`);
  const marks = texts.find((t) => t.title === "The Bakery").highlights;
  assert(marks?.length === 1 && marks[0].note === "For the export" && marks[0].quote.length > 0, `its highlight in the export: ${JSON.stringify(marks)}`);
  // Everywhere, with a week to bring them back (12 Nov 2026): deleted, brought back, deleted again.
  const titles = async () => (await page.evaluate(async () => (await (await import("/js/read/store.js")).listBooks()).map((b) => b.title).sort()));
  const before = await titles();
  await page.getByText("Delete your texts everywhere").click();
  await page.getByText("Press again to delete them everywhere").click();
  await page.waitForFunction(() => document.body.textContent.includes("deleted everywhere"));
  assert((await titles()).length === 0, `texts left after deleting: ${await titles()}`);
  const back = page.locator('[data-part="list-row"]', { hasText: "Bring back deleted texts" });
  await back.waitFor();
  assert(/until /.test(await back.innerText()), `the row says until when: ${await back.innerText()}`);
  await shot("11-texts-deleted-bring-back");
  await back.getByRole("button", { name: "Bring back" }).click();
  for (let i = 0; i < 50 && (await titles()).length !== before.length; i++) await page.waitForTimeout(200);
  assert(JSON.stringify(await titles()) === JSON.stringify(before), `brought back: ${await titles()} (was ${before})`);
  await page.getByText("Delete your texts everywhere").click();
  await page.getByText("Press again to delete them everywhere").click();
  await page.waitForFunction(() => document.body.textContent.includes("deleted everywhere"));
  const left = await page.evaluate(async () => (await import("/js/read/highlights.js")).allHighlights());
  assert(left.length === 0, `highlights deleted with the texts: ${left.length}`);
  await page.goto(`${BASE}/app/#read`);
  // Read as for someone new: nothing to continue, nothing in your library.
  await page.waitForSelector('[data-part="page"] [data-read-add]');
  await page.waitForFunction(() => !document.querySelector('[data-part="page"] .lx-read-texts [data-part="book-tile"]') && !/Continue reading/.test(document.querySelector('[data-part="page"]').textContent), null, { timeout: 15000 });
  return `exported ${texts.length}; deleted`;
});

// ---------- small EPUBs made here ----------

/** A ZIP of stored (uncompressed) entries: [[name, string | Buffer]]. */
function zipOf(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** A two-part EPUB 2 book (its contents in an NCX whose labels aren't its headings), with any extra files. */
function smallEpub({ lang = "en", extra = [] } = {}) {
  const page = (body) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>x</title></head><body>${body}</body></html>`;
  return zipOf([
    ["mimetype", "application/epub+zip"],
    ["META-INF/container.xml", `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`],
    ["OPS/package.opf", `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>A Small Test Book</dc:title><dc:creator>Test Author</dc:creator><dc:language>${lang}</dc:language><dc:identifier id="id">test</dc:identifier></metadata><manifest><item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/><item id="c1" href="text/one.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/two.xhtml" media-type="application/xhtml+xml"/><item id="f" href="fonts/a.otf" media-type="font/otf"/></manifest><spine toc="ncx"><itemref idref="c1"/><itemref idref="c2"/></spine></package>`],
    ["OPS/toc.ncx", `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap><navPoint id="n1"><navLabel><text>Morning</text></navLabel><content src="text/one.xhtml"/></navPoint><navPoint id="n2"><navLabel><text>Noon</text></navLabel><content src="text/two.xhtml#start"/></navPoint></navMap></ncx>`],
    ["OPS/text/one.xhtml", page("<h1>The First Part</h1><p>It began on a <i>very</i> quiet morning. Nobody expected anything.</p><hr/><p>Then the bell rang.</p>")],
    ["OPS/text/two.xhtml", page("<div><h2 id='start'>The Second Part</h2><p>The answer came at noon.</p><p>Roses are red,<br/>Violets are blue.</p></div>")],
    ["OPS/fonts/a.otf", Buffer.alloc(64)],
    ...extra,
  ]);
}
const encryption = (algorithm, uri) =>
  `<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="${algorithm}"/><enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData></enc:EncryptedData></encryption>`;
const FIXTURES = {
  "drm-aes.epub": smallEpub({ extra: [["META-INF/encryption.xml", encryption("http://www.w3.org/2001/04/xmlenc#aes128-cbc", "OPS/text/one.xhtml")]] }),
  "drm-adobe.epub": smallEpub({ extra: [["META-INF/rights.xml", `<rights xmlns="http://ns.adobe.com/adept"/>`]] }),
  "font-obfuscated.epub": smallEpub({ extra: [["META-INF/encryption.xml", encryption("http://www.idpf.org/2008/embedding", "OPS/fonts/a.otf")]] }),
  "ncx-labels.epub": smallEpub(),
};

{
  const epub = (name) => ({ name: basename(name), mimeType: "application/epub+zip", buffer: FIXTURES[basename(name)] ?? readFileSync(name) });
  const openFile = async (file) => {
    await openAdd();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByText("Open a file", { exact: true }).click()]);
    await chooser.setFiles(file);
  };
  const toRead = async () => {
    await page.goto(`${BASE}/app/#read`);
    await page.waitForSelector("html[data-app-ready]");
    await page.waitForSelector('[data-part="page"] .lx-read-shelf');
  };

  await stage("EPUBs: a Gutenberg EPUB comes in with its chapters, verse and italics, the license left out", async () => {
    if (!BOOK_EPUB) return "no EPUB given (skipped)";
    await toRead();
    await openFile(epub(BOOK_EPUB));
    await page.waitForURL(/#read\/book\//);
    await page.waitForSelector(`${READER}[data-ready]`);
    const info = await page.evaluate(async (id) => {
      const { text } = await (await import("/js/read/store.js")).getBook(id);
      const { validateBook } = await import("/js/read/book-format.js");
      const kinds = {};
      for (const p of text.paras) kinds[p.k] = (kinds[p.k] ?? 0) + 1;
      return { problems: await validateBook(text), title: text.title, authors: text.authors.map((a) => a.name), chapters: text.chapters.map((c) => c.title), kinds, italic: text.italic.length, words: text.words.length, all: text.words.join(" ") };
    }, await bookIdFromHash());
    assert(info.problems.length === 0, `valid: ${info.problems[0]}`);
    assert(info.title === "Alice's Adventures in Wonderland" && info.authors.join() === "Lewis Carroll", `${info.title} by ${info.authors}`);
    assert(info.chapters.length === 13 && info.chapters[1] === "CHAPTER I. Down the Rabbit-Hole", `chapters: ${info.chapters.slice(0, 3)}`);
    assert(info.kinds.v > 100 && info.kinds.scene >= 1 && info.italic > 100, `verse, breaks and italics: ${JSON.stringify(info.kinds)}, ${info.italic} italic`);
    assert(!/PROJECT GUTENBERG|Gutenberg License/i.test(info.all), "the license is left out");
    await page.locator(`${READER} button[aria-label="Contents"]`).click();
    await shot("17-epub-contents");
    await page.keyboard.press("Escape");
    return `"${info.title}": ${info.words} words, ${info.chapters.length} chapters, ${JSON.stringify(info.kinds)}, ${info.italic} italic runs`;
  });

  await stage("EPUBs: a store's DRM is refused, saying why; font obfuscation isn't DRM, so that one opens", async () => {
    await toRead();
    const before = await page.evaluate(async () => (await (await import("/js/read/store.js")).listBooks()).length);
    const said = [];
    for (const name of ["fixtures/drm-aes.epub", "fixtures/drm-adobe.epub"]) {
      await openFile(epub(name));
      await page.waitForFunction(() => /locked to the store/.test(document.querySelector('[data-part="page"] .lx-read-message')?.textContent ?? ""));
      said.push(name);
    }
    const fits = await page.evaluate(() => {
      const msg = document.querySelector('[data-part="page"] .lx-read-message');
      const above = msg.previousElementSibling.getBoundingClientRect();
      const box = msg.getBoundingClientRect();
      return { clear: box.top >= above.bottom - 1, whole: msg.scrollHeight <= box.height + 1 };
    });
    assert(fits.clear && fits.whole, `the message sits below the rows, its lines all inside it: ${JSON.stringify(fits)}`);
    await page.locator('[data-part="page"] .lx-read-message').scrollIntoViewIfNeeded();
    await shot("18-epub-drm");
    const after = await page.evaluate(async () => (await (await import("/js/read/store.js")).listBooks()).length);
    assert(after === before, `nothing was kept: ${before} → ${after}`);
    await openFile(epub("fixtures/font-obfuscated.epub"));
    await page.waitForURL(/#read\/book\//);
    await page.waitForSelector(`${READER}[data-ready]`);
    assert((await page.locator(`${READER} [data-part="reader-title"]`).textContent()) === "A Small Test Book", "the font-obfuscated book opens");
    return `refused ${said.join(", ")}; the font-obfuscated one opened`;
  });

  await stage("EPUBs: dropped anywhere on the Read tab (here on the tab bar), it says so, and the book comes in", async () => {
    await toRead();
    const data = [...FIXTURES["ncx-labels.epub"]];
    const shown = await page.evaluate((bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(bytes)], "dropped.epub", { type: "application/epub+zip" }));
      // On the tab bar, outside the page: the window takes it, so the browser never opens the file instead.
      const target = document.querySelector('[data-part="tab-bar"]');
      target.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      const overlay = document.querySelector('[data-part="read-drop"]');
      const during = overlay && !overlay.hidden;
      window.__drop = () => target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }));
      return during;
    }, data);
    await shot("19-epub-drop");
    await page.evaluate(() => window.__drop());
    await page.waitForURL(/#read\/book\//);
    await page.waitForSelector(`${READER}[data-ready]`);
    const chapters = await page.evaluate(async (id) => (await (await import("/js/read/store.js")).getBook(id)).text.chapters.map((c) => c.title), await bookIdFromHash());
    assert(shown, "the page showed it could take the file");
    assert(chapters.join() === "Morning,Noon", `chapters from its NCX: ${chapters}`);
    return `dropped; chapters ${chapters.join(", ")} from its NCX`;
  });
}

await stage("open books: the library's woven pilot opens from the shelf, kept here with its Dutch layer", async () => {
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!catalogue?.books?.length) return "no library on this server (skipped)";
  const meta = catalogue.books.find((b) => b.layers?.nl?.kind === "weave") ?? catalogue.books[0];
  await page.goto(`${BASE}/app/#read`);
  await page.waitForSelector("html[data-app-ready]");
  await page.locator('[data-part="page"] .lx-read-shelf').waitFor();
  await shot("16-read-shelf");
  await openShelfBook(page, meta.title.slice(0, 20));
  await page.waitForURL(/#read\/book\//);
  await page.waitForSelector(`${READER}[data-ready]`);
  const kept = await page.evaluate(async (id) => {
    const store = await import("/js/read/store.js");
    const found = await store.getBook(id);
    return { title: found?.text.title, weave: Boolean(await store.getWeave(id, "nl")), words: found?.text.words.length };
  }, meta.id);
  assert(kept.title === meta.title && kept.weave, `kept with its layer: ${JSON.stringify(kept)}`);
  assert((await page.locator(`${READER} [data-part="reader-title"]`).textContent()) === meta.title, "it's open");
  await page.locator(`${READER} button[aria-label="Back to your texts"]`).click();
  await page.waitForURL(/#read$/);
  return `"${meta.title}": ${kept.words} words, with its nl weave`;
});

await stage("the weave: words you know in Dutch; a tap gives the meaning and counts once; a sentence you know turns whole", async () => {
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const meta = catalogue?.books?.find((b) => b.layers?.nl?.kind === "weave");
  if (!meta) return "no woven book on this server (skipped)";
  // Know the most common third of its words (the bank, as if you'd said you know them).
  const knownCount = await page.evaluate(async (id) => {
    const store = await import("/js/read/store.js");
    const weave = await store.getWeave(id, "nl");
    const { knownForShare } = await import("/js/read/woven-text.js");
    const bank = await import("/js/read/bank.js");
    const known = knownForShare(weave, 0.35);
    for (const lemma of known) bank.addWord("nl", lemma);
    // This device's reading settings as one from before 10 Nov 2026 kept them once any weave setting changed: all of them, the share at
    // 95, the old default the setting no longer offers. It reads as today's default (woven-text.js flipAtOf).
    const prefs = JSON.parse(localStorage.getItem("lx.reader.v1") ?? "{}") ?? {};
    prefs.weave = { ...prefs.weave, nl: { on: true, flipAt: 95, order: false, tint: true, underline: true, literal: "shown", suggest: 5, peekResets: true, helpOn: true, help: "over" } };
    localStorage.setItem("lx.reader.v1", JSON.stringify(prefs));
    return known.size;
  }, meta.id);
  await page.goto(`${BASE}/app/#read/book/${encodeURIComponent(meta.id)}`);
  await page.waitForSelector(`${READER}[data-ready]`);
  if ((await handle("r.mode")) !== "scroll") {
    if (await zen()) await tapAt(0.08);
    await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
    await sheetStill();
    await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: "Scroll" }).click();
    await page.keyboard.press("Escape");
  }
  const woven = page.locator(`${READER} [data-part="reader-text"] [data-part="woven-word"]`);
  const count = await woven.count();
  assert(count > 20, `words in Dutch: ${count}`);
  await shot("20-woven");
  // A tap: its meaning, by the word; one miss on it in your progress.
  const first = woven.first();
  const lemma = await first.getAttribute("data-lemma");
  const english = await first.getAttribute("data-en");
  await first.click();
  const pop = page.locator(`${READER} [data-part="word-popover"]`);
  await pop.waitFor();
  const popText = await pop.textContent();
  assert(popText.includes(english.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")), `the meaning shows: ${popText} (${english})`);
  assert((await first.getAttribute("data-state")) === "looked-up", "the word is marked looked up");
  await shot("21-woven-meaning");
  await page.keyboard.press("Escape");
  await first.click();
  await page.keyboard.press("Escape");
  const rows = await page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().filter((r) => r.activity === "reader"));
  assert(rows.length === 1 && rows[0].concept === `w:${lemma}` && rows[0].outcome === "wrong" && rows[0].skill === "read" && rows[0].item.startsWith(`${meta.id}@`), `one miss, on w:${lemma}: ${JSON.stringify(rows)}`);
  assert(!rows.some((r) => r.outcome === "met"), "nothing met yet: nothing's been read past");
  // A lower threshold: sentences you know most of turn whole, their Dutch-order line under them.
  if (await zen()) await tapAt(0.08);
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  await openMore();
  // Its choices, and the kept 95 shown as the default it now reads as: 90%.
  const shares = await page.locator(`${READER} [data-part="sheet"] [data-part="segmented"][aria-label^="A sentence turns all"] [data-part="segment"]`).evaluateAll((nodes) =>
    nodes.map((n) => ({ text: n.textContent.trim(), pressed: n.getAttribute("aria-pressed") === "true" })),
  );
  assert(JSON.stringify(shares.map((s) => s.text)) === JSON.stringify(["50%", "70%", "90%", "All", "Never"]), `the share's choices: ${JSON.stringify(shares)}`);
  assert(JSON.stringify(shares.filter((s) => s.pressed).map((s) => s.text)) === JSON.stringify(["90%"]), `a kept 95 reads as 90%: ${JSON.stringify(shares)}`);
  await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: "50%" }).click();
  await page.keyboard.press("Escape");
  const flipped = await page.locator(`${READER} [data-part="reader-sentence"][data-state="flipped"]`).count();
  const literals = await page.locator(`${READER} [data-part="reader-sentence"][data-state="flipped"] [data-part="reader-literal"] [data-part="literal-chunk"]`).count();
  assert(flipped >= 1 && literals > 0, `whole sentences: ${flipped}, with their line (${literals} chunks)`);
  await page.locator(`${READER} [data-part="reader-sentence"][data-state="flipped"]`).first().scrollIntoViewIfNeeded();
  await shot("22-woven-flipped");
  // The Dutch-order line on tap: a button at each whole sentence's end opens it by the sentence. Opening it counts the
  // sentence's patterns (the weave's c) as right with a nudge, so hard: once, however often it's opened.
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  await openMore();
  await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: "On tap" }).click();
  await page.keyboard.press("Escape");
  const onTap = await page.evaluate(() => {
    const reader = document.querySelector('[data-part="reader"]:not([data-ghost])');
    return {
      flipped: reader.querySelectorAll('[data-part="reader-sentence"][data-state="flipped"]').length,
      toggles: reader.querySelectorAll('[data-part="reader-sentence"][data-state="flipped"] [data-part="reader-literal-toggle"]').length,
      drawn: reader.querySelectorAll('[data-part="reader-sentence"] [data-part="reader-literal"]').length,
    };
  });
  assert(onTap.flipped >= 1 && onTap.toggles === onTap.flipped && onTap.drawn === 0, `on tap: a button per whole sentence, no line drawn: ${JSON.stringify(onTap)}`);
  const pick = await page.evaluate(async (id) => {
    const weave = await (await import("/js/read/store.js")).getWeave(id, "nl");
    const tags = new Map(weave.sentences.map((sentence) => [sentence.s, sentence.c ?? []]));
    const carriers = [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-sentence"][data-state="flipped"]')];
    const k = Math.max(0, carriers.findIndex((carrier) => tags.get(Number(carrier.dataset.i))?.length));
    return { k, c: tags.get(Number(carriers[k].dataset.i)) ?? [] };
  }, meta.id);
  const toggle = page.locator(`${READER} [data-part="reader-sentence"][data-state="flipped"]`).nth(pick.k).locator('[data-part="reader-literal-toggle"]');
  await toggle.scrollIntoViewIfNeeded();
  await toggle.click();
  await page.locator(`${READER} [data-part="word-popover"] [data-part="reader-literal"] [data-part="literal-chunk"]`).first().waitFor();
  assert((await toggle.getAttribute("aria-expanded")) === "true", "the button says the line is open");
  await shot("22b-woven-line-on-tap");
  await page.keyboard.press("Escape");
  assert((await toggle.getAttribute("aria-expanded")) === "false", "closed again");
  await toggle.click();
  await page.keyboard.press("Escape");
  const patternRows = await page.evaluate(async () => {
    const progress = await import("/js/study/progress.js");
    return progress.allEvidence().filter((r) => r.activity === "reader" && r.concept.startsWith("p:")).map((r) => ({ concept: r.concept, grade: progress.gradeOf(r), outcome: r.outcome, help: r.help, skill: r.skill }));
  });
  assert(
    patternRows.length === pick.c.length && pick.c.every((id) => patternRows.some((r) => r.concept === `p:${id}`)) && patternRows.every((r) => r.grade === "hard" && r.outcome === "right" && r.help === "nudge" && r.skill === "read"),
    `its patterns (${pick.c}) once each, hard: ${JSON.stringify(patternRows)}`,
  );
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  await openMore();
  await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: "Shown" }).click();
  await page.keyboard.press("Escape");
  // Dutch word order: the English in Dutch order, before the words change.
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  await openMore();
  await page.locator(`${READER} [data-part="sheet"] [data-part="list-row"]`, { hasText: "word order" }).click();
  await page.keyboard.press("Escape");
  const ordered = await page.locator(`${READER} [data-part="reader-sentence"][data-state="ordered"]`).count();
  assert(ordered >= 1, `sentences in Dutch order: ${ordered}`);
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  await openMore();
  await page.locator(`${READER} [data-part="sheet"] [data-part="list-row"]`, { hasText: "word order" }).click();
  await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: "90%" }).click();
  await page.keyboard.press("Escape");
  // "Show it in English again" takes a word out of the bank, and it's English everywhere at once.
  const banked = page.locator(`${READER} [data-part="reader-text"] [data-part="woven-word"][data-lemma="${lemma}"]`);
  const before = await banked.count();
  await banked.first().click();
  await pop.getByRole("button", { name: "Show it in English again" }).click();
  await page.waitForFunction((l) => !document.querySelector(`[data-part="reader"]:not([data-ghost]) [data-part="woven-word"][data-lemma="${l}"]`), lemma);
  // Woven pages stay whole.
  if (await zen()) await tapAt(0.08);
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: /^Pages$/ }).click();
  await page.keyboard.press("Escape");
  const pagesSeen = [];
  // The woven words on the first page, which turning on reads past.
  const [fa, fb] = await handle("r.pageRanges[r.page]");
  const firstPage = await page.evaluate(([a, b]) => {
    const words = document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"] [data-part="woven-word"][data-lemma]');
    return [...new Set([...words].filter((w) => +w.dataset.i >= a && +w.dataset.i <= b).map((w) => w.dataset.lemma.replace(/’/g, "'").toLowerCase()))];
  }, [fa, fb]);
  for (let k = 0; k < 4; k++) {
    const state = await pageCheck();
    assert(!state.bad.length && !state.leaks.length && state.tiled, `woven page ${state.page + 1}: ${JSON.stringify(state)}`);
    pagesSeen.push(state.page + 1);
    if (state.page === state.pages - 1) break;
    await page.keyboard.press("ArrowRight");
    await waitTurn();
  }
  await shot("23-woven-page");
  // Reading past: one met row per word per sitting, never a review, never for the word looked up.
  const met = await page.evaluate(async (words) => {
    const progress = await import("/js/study/progress.js");
    const rows = progress.allEvidence().filter((r) => r.activity === "reader" && r.outcome === "met");
    const per = new Map();
    for (const r of rows) per.set(r.concept, (per.get(r.concept) ?? 0) + 1);
    const state = words.length ? progress.conceptState(`w:${words[0]}`) : null;
    return {
      rows: rows.length,
      twice: [...per].filter(([, n]) => n > 1).map(([c]) => c),
      missing: words.filter((w) => !per.has(`w:${w}`)),
      skills: [...new Set(rows.map((r) => r.skill))],
      graded: rows.filter((r) => progress.gradeOf(r) !== null).length,
      first: state && { met: state.met, seen: state.seen, level: state.level },
    };
  }, firstPage);
  assert(pagesSeen.length > 1 && firstPage.length > 0, `pages turned (${pagesSeen}) past woven words (${firstPage.length})`);
  assert(!met.missing.length && !met.twice.length && met.skills.join() === "read" && met.graded === 0, `met once each, reading, never graded: ${JSON.stringify(met)}`);
  assert(met.first.met >= 1 && met.first.seen === 0 && met.first.level === 0, `met doesn't move strength: ${JSON.stringify(met.first)}`);
  assert(!(await page.evaluate(async (l) => (await import("/js/study/progress.js")).allEvidence().some((r) => r.outcome === "met" && r.concept === `w:${l}`), lemma)), `nothing met for "${lemma}", looked up this sitting`);
  return `knew ${knownCount} words: ${count} shown in Dutch; one miss on w:${lemma}; ${flipped} whole at 50%, its line on tap (${pick.c.join(" ") || "no patterns"}: hard once); ${ordered} in Dutch order; "${lemma}" back in English (${before} places); pages ${pagesSeen.join(", ")} whole; ${met.rows} words met, ${firstPage.length} of them on page ${pagesSeen[0]}`;
});

await stage("holding words: a toolbar with the other language; → Dutch adds a word, its English fading in; Sentence, Copy, ↩ English", async () => {
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const meta = catalogue?.books?.find((b) => b.layers?.nl?.kind === "weave");
  if (!meta) return "no woven book on this server (skipped)";
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  await page.goto(`${BASE}/app/#read/book/${encodeURIComponent(meta.id)}`);
  await page.waitForSelector(`${READER}[data-ready]`);
  if ((await handle("r.mode")) !== "scroll") {
    if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
    await sheetStill();
    await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: "Scroll" }).click();
    await page.keyboard.press("Escape");
  }
  // Zen by the chevron (a tap in the text can land on a Dutch word, which gives its meaning first).
  if (!(await zen())) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  // A word still in English, with a Dutch word to learn, on screen.
  const target = await page.evaluate(async (id) => {
    const weave = await (await import("/js/read/store.js")).getWeave(id, "nl");
    const bank = await import("/js/read/bank.js");
    const text = document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"]');
    const box = text.getBoundingClientRect();
    for (const span of text.querySelectorAll("p > .lx-w[data-i]:not([data-part])")) {
      const r = span.getBoundingClientRect();
      if (span.hidden || r.top < box.top + 120 || r.bottom > box.bottom - 120) continue;
      const i = Number(span.dataset.i);
      const sentence = weave.sentences.find((S) => i >= S.s && i < S.e);
      const [nl, lemma] = sentence?.t[i - sentence.s] ?? [];
      if (lemma && !bank.knownIn("nl")(lemma) && /^[a-z]+$/.test(lemma)) return { i, nl, lemma, en: span.textContent.trim() };
    }
    return null;
  }, meta.id);
  assert(target, "an English word to learn on screen");
  const holdOn = async (selector) => {
    const box = await page.locator(selector).first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
  };
  const bar = page.locator(`${READER} [data-part="reader-hold"]:not([hidden])`);
  await holdOn(`${READER} [data-part="reader-text"] [data-i="${target.i}"]`);
  await bar.waitFor();
  const preview = (await bar.locator('[data-part="reader-preview"]').textContent()).trim();
  assert(preview.includes(target.nl.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "")), `the Dutch for "${target.en}": ${preview}`);
  assert((await page.locator(`${READER} [data-part="reader-handle"]:not([hidden])`).count()) === 2, "a handle at each end");
  await shot("25-hold-english");
  // → Dutch: in your words now, in Dutch everywhere, its English over its next few times.
  await bar.getByRole("button", { name: /^→ / }).click();
  await page.waitForFunction((l) => document.querySelector(`[data-part="reader"]:not([data-ghost]) [data-part="woven-word"][data-lemma="${l}"]`), target.lemma);
  const glosses = await page.locator(`${READER} [data-part="woven-word"][data-lemma="${target.lemma}"] [data-part="reader-gloss"]`).count();
  const places = await page.locator(`${READER} [data-part="woven-word"][data-lemma="${target.lemma}"]`).count();
  assert(glosses >= 1 && glosses <= 6 && glosses <= places, `its English fades in: ${glosses} glosses over ${places} places`);
  await page.locator(`${READER} [data-part="reader-gloss"]`).first().scrollIntoViewIfNeeded();
  await shot("26-gloss");
  // Holding the Dutch word (the one added, by its place): its English, ↩ English, and a miss on it (a peek is a lookup).
  // Misses only: scrolling just now can still be noting what was read past (met).
  const added = `${READER} [data-part="reader-text"] [data-part="woven-word"][data-i="${target.i}"]`;
  const before = await page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().filter((r) => r.activity === "reader" && r.outcome === "wrong").length);
  await holdOn(added);
  await bar.waitFor();
  assert((await bar.locator('[data-part="reader-preview"]').textContent()).includes("English"), "its English");
  assert(await bar.getByRole("button", { name: "↩ English" }).isVisible(), "↩ English");
  const after = await page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().filter((r) => r.activity === "reader" && r.outcome === "wrong").length);
  assert(after === before + 1, `a peek is a miss: ${before} → ${after}`);
  // Widen: the end handle dragged onto a word three on (the next line's, if that's where it is); then Sentence takes
  // the whole sentence.
  const endBox = await page.locator(`${READER} [data-part="reader-handle"][data-variant="end"]:not([data-state])`).boundingBox();
  const onto = await page.locator(`${READER} [data-part="reader-text"] [data-i="${target.i + 3}"]:not([hidden])`).first().boundingBox();
  assert(onto, "a word three on, drawn");
  const from = { x: endBox.x + endBox.width / 2, y: endBox.y + endBox.height / 2 };
  const to = { x: onto.x + onto.width / 2, y: onto.y + onto.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(from.x + ((to.x - from.x) * k) / 8, from.y + ((to.y - from.y) * k) / 8);
  await page.mouse.up();
  await bar.waitFor();
  const wide = await page.locator(`${READER} [data-selected]`).count();
  assert(wide > 1, `the selection widened: ${wide} words`);
  assert((await bar.locator('.lx-preview-label').textContent()).trim() === "Dutch", "more than one word: the sentence in Dutch");
  const sentenceButton = bar.getByRole("button", { name: "Sentence", exact: true });
  if (await sentenceButton.count()) await sentenceButton.click();
  const sentenceWords = await page.locator(`${READER} [data-selected]`).count();
  await shot("27-hold-sentence");
  // A tap elsewhere only ends it.
  const zenBefore = await zen();
  await tapClear();
  assert(!(await bar.count()) && (await zen()) === zenBefore, "a tap elsewhere ends the selection and nothing else");
  // Copy.
  await holdOn(added);
  await bar.getByRole("button", { name: "Copy", exact: true }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert(copied === target.en, `copied "${copied}"`);
  // ↩ English takes it out of your words.
  await holdOn(added);
  await bar.getByRole("button", { name: "↩ English" }).click();
  await page.waitForFunction((l) => !document.querySelector(`[data-part="reader"]:not([data-ghost]) [data-part="woven-word"][data-lemma="${l}"]`), target.lemma);
  // A sentence shown whole is held whole: a word inside it selects the sentence, its own line painted (never the
  // literal line under it), the end handle on its last line, and the toolbar gives what the page doesn't show.
  // One sentence on screen made whole: its words go into your words (no fade: where you added them isn't set).
  const whole = await page.evaluate(async (id) => {
    const weave = await (await import("/js/read/store.js")).getWeave(id, "nl");
    const bank = await import("/js/read/bank.js");
    const text = document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"]');
    const box = text.getBoundingClientRect();
    for (const sentence of weave.sentences) {
      const first = text.querySelector(`[data-i="${sentence.s}"]:not([hidden])`);
      const r = first?.getBoundingClientRect();
      if (!r || r.top < box.top + 80 || r.bottom > box.bottom - 200) continue;
      const lemmas = sentence.t.map(([, lemma]) => lemma).filter(Boolean);
      if (lemmas.length < 5 || sentence.e - sentence.s > 24) continue;
      for (const lemma of lemmas) bank.addWord("nl", lemma);
      return sentence.s;
    }
    return null;
  }, meta.id);
  assert(whole !== null, "a sentence on screen to make whole");
  const carrier = `${READER} [data-part="reader-sentence"][data-state="flipped"][data-i="${whole}"]`;
  await page.locator(carrier).waitFor({ timeout: 5000 });
  await page.locator(carrier).scrollIntoViewIfNeeded();
  await holdOn(`${carrier} .lx-sentence-line [data-part="woven-word"] >> nth=2`);
  await bar.waitFor();
  const held = await page.evaluate(() => {
    const reader = document.querySelector('[data-part="reader"]:not([data-ghost])');
    const selected = [...reader.querySelectorAll("[data-selected]")];
    const line = selected[0];
    const rects = line ? [...line.getClientRects()] : [];
    const last = rects[rects.length - 1];
    const end = reader.querySelector('[data-part="reader-handle"][data-variant="end"]:not([data-state])').getBoundingClientRect();
    const start = reader.querySelector('[data-part="reader-handle"][data-variant="start"]:not([data-state])').getBoundingClientRect();
    return {
      count: selected.length,
      isLine: Boolean(line?.classList.contains("lx-sentence-line")) && getComputedStyle(line).display === "inline",
      lines: rects.length,
      endOnLast: last ? Math.abs(end.left + 22 - last.right) < 2 && Math.abs(end.top + 8 - last.top) < 2 : false,
      startOnFirst: rects[0] ? Math.abs(start.left + 22 - rects[0].left) < 2 && Math.abs(start.top + 8 - rects[0].top) < 2 : false,
    };
  });
  assert(held.count === 1 && held.isLine, `the sentence's own line is painted, alone: ${JSON.stringify(held)}`);
  assert(held.startOnFirst && held.endOnLast, `the handles at its first line's start and its last line's end: ${JSON.stringify(held)}`);
  // Its literal line is drawn under it (the English in Dutch order), so the toolbar gives the book's own English.
  assert((await bar.locator(".lx-preview-label").textContent()).trim() === "English", "with its literal line drawn: the book's English");
  await shot("28-hold-whole-sentence");
  await tapClear();
  assert(!(await bar.count()), "a tap elsewhere ends it");
  // In pages, a hold never turns the page. (The bars come back by the chevron: a tap at the top can land on a Dutch
  // word now, which gives its meaning first.)
  if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: /^Pages$/ }).click();
  await page.keyboard.press("Escape");
  const pageBefore = await handle("r.page");
  // A word in the middle of the page showing (the chapter's other pages are in the DOM too, out of sight).
  const [pa, pb] = await handle("r.pageRanges[r.page]");
  const middle = await page.evaluate(([a, b]) => {
    const text = document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"]');
    for (let i = Math.floor((a + b) / 2); i <= b; i++) {
      const word = text.querySelector(`[data-i="${i}"]:not([hidden])`);
      if (word?.getClientRects().length) return i;
    }
    return null;
  }, [pa, pb]);
  assert(middle !== null, `a word drawn on page ${pageBefore} (${pa}–${pb})`);
  await holdOn(`${READER} [data-part="reader-text"] [data-i="${middle}"]:not([hidden])`);
  const pageAfter = await handle("r.page");
  assert(pageAfter === pageBefore, `held in pages: the same page (${pageBefore} → ${pageAfter})`);
  assert((await bar.count()) === 1, "held in pages: a selection");
  await shot("29-hold-pages");
  await tapAt(0.5, 0.5);
  return `"${target.en}" → "${target.nl}" (${target.lemma}): ${glosses} glosses; peek counted; widened to ${wide}, sentence ${sentenceWords}; copied; back to English; a whole sentence held whole (${held.lines} lines)`;
});

await stage("Translate (the weave off): the text as written, and holding words gives their Dutch (a word with its base form, more the sentence); no → Dutch, and nothing counted", async () => {
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const meta = catalogue?.books?.find((b) => b.layers?.nl?.kind === "weave");
  if (!meta) return "no woven book on this server (skipped)";
  // A fresh reader (a hash-only goto keeps whatever the last stage left open there).
  await page.goto(`${BASE}/app/#read/book/${encodeURIComponent(meta.id)}`);
  await page.reload();
  await page.waitForSelector(`${READER}[data-ready]`);
  // Whatever happens here, the weave is on again for the stages after.
  const weaveOnAgain = () =>
    page.evaluate(() => {
      const prefs = JSON.parse(localStorage.getItem("lx.reader.v1") || "{}");
      if (prefs.weave?.nl) prefs.weave.nl.on = true;
      localStorage.setItem("lx.reader.v1", JSON.stringify(prefs));
    });
  try {
    const weaveSwitch = async () => {
      if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
      await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
      await sheetStill();
      await page.locator(`${READER} [data-part="sheet"] [data-part="list-row"]`, { hasText: "woven in" }).click();
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="sheet"]:not([hidden])'));
    };
    await weaveSwitch();
    const woven = await page.locator(`${READER} [data-part="reader-text"] [data-part="woven-word"], ${READER} [data-part="reader-sentence"]`).count();
    assert(woven === 0, `the text as written: ${woven} woven words or whole sentences left`);
    // A word on screen whose Dutch the weave has.
    const target = await page.evaluate(async (id) => {
      const weave = await (await import("/js/read/store.js")).getWeave(id, "nl");
      const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
      const box = root.getBoundingClientRect();
      for (const span of root.querySelectorAll('[data-part="reader-text"] .lx-w')) {
        const r = span.getBoundingClientRect();
        if (span.hidden || !r.height || r.top < box.top + 120 || r.bottom > box.bottom - 120) continue;
        const i = Number(span.dataset.i);
        const sentence = weave.sentences.find((S) => i >= S.s && i < S.e);
        const [nl, lemma] = sentence?.t[i - sentence.s] ?? [];
        if (nl && /\p{L}{3}/u.test(nl)) return { i, nl: nl.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""), lemma, sentence: sentence.text, en: span.textContent.trim() };
      }
      return null;
    }, meta.id);
    assert(target, "a word on screen with its Dutch");
    const rows = () => page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().filter((r) => r.activity === "reader").length);
    const before = await rows();
    const bar = page.locator(`${READER} [data-part="reader-hold"]:not([hidden])`);
    const box = await page.evaluate((i) => {
      const r = document.querySelector(`[data-part="reader"]:not([data-ghost]) [data-part="reader-text"] [data-i="${i}"]`).getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, target.i);
    await page.mouse.move(box.x, box.y);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    await bar.waitFor();
    const word = await bar.evaluate((b) => ({ label: b.querySelector(".lx-preview-label")?.textContent, text: b.querySelector('[data-part="reader-preview"]')?.textContent, buttons: [...b.querySelectorAll("button")].map((x) => x.textContent || x.getAttribute("aria-label")) }));
    assert(word.label === "Dutch" && word.text.includes(target.nl) && !word.buttons.some((t) => /^→ /.test(t)), `"${target.en}" held: its Dutch, no → Dutch: ${JSON.stringify(word)}`);
    await shot("52-translate-word");
    const sentenceButton = bar.getByRole("button", { name: "Sentence", exact: true });
    if (await sentenceButton.count()) {
      await sentenceButton.click();
      await bar.waitFor();
      const whole = await bar.evaluate((b) => b.querySelector('[data-part="reader-preview"]')?.textContent);
      assert(whole.includes(target.sentence.slice(0, 20)), `the sentence in Dutch: ${whole}`);
    }
    await bar.getByRole("button", { name: "Close", exact: true }).click();
    assert((await rows()) === before, `nothing counted: ${before} → ${await rows()}`);
    // Back on: the weave as before.
    await weaveSwitch();
    const back = await page.locator(`${READER} [data-part="reader-text"] [data-part="woven-word"], ${READER} [data-part="reader-sentence"]`).count();
    assert(back > 0, "woven again");
    return `"${target.en}" → "${target.nl}"${target.lemma ? ` (${target.lemma})` : ""}; the sentence in Dutch; nothing counted; woven again (${back})`;
  } finally {
    await weaveOnAgain().catch(() => {});
  }
});

await stage("woven words' underline: on by default; off by its switch beside the tint (a word you looked up or just added keeps its mark), kept after a reload; on again", async () => {
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const meta = catalogue?.books?.find((b) => b.layers?.nl?.kind === "weave");
  if (!meta) return "no woven book on this server (skipped)";
  const open = async () => {
    await page.goto(`${BASE}/app/#read/book/${encodeURIComponent(meta.id)}`);
    await page.reload();
    await page.waitForSelector(`${READER}[data-ready]`);
  };
  // The woven words on screen: how many are plain, how many of those are underlined, and whether a word's own marks
  // (looked up, just added) still are, tried on a plain one for a moment.
  const lines = () =>
    page.evaluate(() => {
      const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
      const underlined = (w) => getComputedStyle(w).textDecorationLine.includes("underline");
      const plain = [...root.querySelectorAll('[data-part="reader-text"] [data-part="woven-word"]:not([data-state])')].filter((w) => w.offsetHeight);
      const marks = {};
      if (plain[0]) {
        for (const state of ["looked-up", "new"]) {
          plain[0].setAttribute("data-state", state);
          marks[state] = underlined(plain[0]);
        }
        plain[0].removeAttribute("data-state");
      }
      return { attr: root.hasAttribute("data-underline"), tint: root.hasAttribute("data-tint"), plain: plain.length, underlined: plain.filter(underlined).length, marks };
    });
  const flip = async () => {
    if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
    await sheetStill();
    await openMore();
    const row = page.locator(`${READER} [data-part="sheet"] [data-part="list-row"]`, { hasText: "Underline the" });
    await row.click();
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="sheet"]:not([hidden])'));
  };
  const underlinePref = () => page.evaluate(() => JSON.parse(localStorage.getItem("lx.reader.v1") || "{}").weave?.nl?.underline ?? null);
  try {
    await open();
    const on = await lines();
    assert(on.attr && on.plain > 0 && on.underlined === on.plain && on.marks["looked-up"] && on.marks.new, `on by default, every woven word underlined: ${JSON.stringify(on)}`);
    await flip();
    const off = await lines();
    assert(!off.attr && off.tint && off.plain > 0 && off.underlined === 0 && off.marks["looked-up"] && off.marks.new, `off: no plain underline, the tint and a word's own marks stay: ${JSON.stringify(off)}`);
    await shot("60-woven-underline-off");
    assert((await underlinePref()) === false, "kept as off");
    await open();
    const reloaded = await lines();
    assert(!reloaded.attr && reloaded.underlined === 0, `still off after a reload: ${JSON.stringify(reloaded)}`);
    await flip();
    const back = await lines();
    assert(back.attr && back.underlined === back.plain && (await underlinePref()) === true, `on again: ${JSON.stringify(back)}`);
    return `${on.plain} woven words underlined; off, none (the tint stays; looked up and just added keep their marks); kept after a reload; on again`;
  } finally {
    // Whatever happened, the underline is on for the stages after.
    await page.evaluate(() => {
      const prefs = JSON.parse(localStorage.getItem("lx.reader.v1") || "{}");
      if (prefs.weave?.nl) delete prefs.weave.nl.underline;
      localStorage.setItem("lx.reader.v1", JSON.stringify(prefs));
    });
  }
});

await stage("a word's card and a sentence's card: the held word's preview opens its card (the word, its English here, how often, its sentence both ways, your words); More on a word's meaning; more than a word opens the sentence's card; a word in Your words opens its card", async () => {
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const meta = catalogue?.books?.find((b) => b.layers?.nl?.kind === "weave");
  if (!meta) return "no woven book on this server (skipped)";
  // A fresh reader (a hash-only goto keeps whatever the last stage left open there).
  await page.goto(`${BASE}/app/#read/book/${encodeURIComponent(meta.id)}`);
  await page.reload();
  await page.waitForSelector(`${READER}[data-ready]`);
  if (!(await zen())) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  // A Dutch word on screen (not inside a whole sentence), and what the weave says about it: the first page from the start with one (a
  // re-layout keeps your page, so earlier stages can leave the book on a page of whole Dutch sentences).
  const findTarget = () => page.evaluate(async (id) => {
    const weave = await (await import("/js/read/store.js")).getWeave(id, "nl");
    const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
    const box = root.getBoundingClientRect();
    for (const span of root.querySelectorAll('[data-part="reader-text"] [data-part="woven-word"]')) {
      if (span.closest('[data-part="reader-sentence"]')) continue;
      const r = span.getBoundingClientRect();
      if (!r.height || r.top < box.top + 140 || r.bottom > box.bottom - 140) continue;
      const i = Number(span.dataset.i);
      const sentence = weave.sentences.find((S) => i >= S.s && i < S.e);
      const [, lemma] = sentence.t[i - sentence.s];
      const count = weave.sentences.reduce((n, S) => n + S.t.filter(([, l]) => l === lemma).length, 0);
      return { i, nl: span.dataset.nl.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""), en: span.dataset.en.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""), lemma, count, sentence: sentence.text, s: sentence.s, e: sentence.e };
    }
    return null;
  }, meta.id);
  // From the book's first page (where earlier stages left it isn't this stage's to know), then page by page.
  await toChapter(0);
  await sheetsSettled();
  if (!(await zen())) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  let target = await findTarget();
  for (let turns = 0; !target && turns < 40 && (await handle("r.page < r.pages - 1")); turns++) {
    await page.keyboard.press("ArrowRight");
    await waitTurn();
    target = await findTarget();
  }
  assert(target, "a Dutch word on screen");
  const card = page.locator(`${READER} [data-part="sheet"][aria-label="Word"] [data-part="word-card"]`);
  const cardSays = () =>
    card.evaluate((c) => ({ word: c.querySelector(".lx-card-head strong")?.textContent, facts: [...c.querySelectorAll(".lx-card-facts dd")].map((d) => d.textContent), sentence: c.querySelector('[data-part="sentence-row"] .lx-sentence-nl')?.textContent, english: c.querySelector('[data-part="sentence-row"] .lx-sentence-en')?.textContent, buttons: [...c.querySelectorAll("button")].map((b) => b.textContent || b.getAttribute("aria-label")) }));
  // Held: the toolbar's preview opens the card.
  const box = await page.evaluate((i) => {
    const r = document.querySelector(`[data-part="reader"]:not([data-ghost]) [data-part="reader-text"] [data-part="woven-word"][data-i="${i}"]`).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, target.i);
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  const bar = page.locator(`${READER} [data-part="reader-hold"]:not([hidden])`);
  await bar.waitFor();
  await bar.locator('[data-part="reader-preview"][role="button"]').click();
  await card.waitFor();
  const said = await cardSays();
  assert(said.word === target.nl && said.facts[0] === target.en && said.facts[1]?.startsWith(target.count === 1 ? "Once" : `${target.count} times`) && said.sentence?.includes(target.sentence.slice(0, 16)) && said.english?.length > 0 && said.buttons.some((b) => /^↩ |^→ /.test(b)), `its card: ${JSON.stringify({ said, target })}`);
  await shot("53-word-card");
  await page.keyboard.press("Escape");
  // Holding a word you know is a peek, so its English fades in again and the page can be laid out anew: the word may
  // be a page on now. Back to wherever it is.
  const bringBack = async (i) => {
    if ((await handle("r.mode")) !== "pages") return page.locator(`${READER} [data-part="reader-text"] [data-i="${i}"]`).first().scrollIntoViewIfNeeded();
    for (let turns = 0; turns < 8; turns++) {
      const [a, b] = await handle("r.pageRanges[r.page]");
      if (i >= a && i <= b) return;
      await page.keyboard.press(i > b ? "ArrowRight" : "ArrowLeft");
      await waitTurn();
    }
  };
  await bringBack(target.i);
  // A tap for its meaning, then More: the same card.
  await page.locator(`${READER} [data-part="reader-text"] [data-part="woven-word"][data-i="${target.i}"]`).click();
  const popover = page.locator(`${READER} [data-part="word-popover"]`);
  await popover.getByRole("button", { name: "More", exact: true }).click();
  await card.waitFor();
  assert((await cardSays()).word === target.nl, "More opens its card");
  await page.keyboard.press("Escape");
  // More than one word: the sentence's card.
  await bringBack(target.s);
  await page.evaluate(([a, b]) => document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.select(a, b), [target.s, Math.min(target.s + 2, target.e - 1)]);
  await bar.waitFor();
  await bar.locator('[data-part="reader-preview"][role="button"]').click();
  const sentenceCard = page.locator(`${READER} [data-part="sheet"][aria-label="Sentence"] [data-part="sentence-card"]`);
  await sentenceCard.waitFor();
  const whole = await sentenceCard.evaluate((c) => ({ nl: c.querySelector(".lx-sentence-nl")?.textContent, en: c.querySelector(".lx-sentence-en")?.textContent, literal: Boolean(c.querySelector('[data-part="reader-literal"]')) }));
  assert(whole.nl?.includes(target.sentence.slice(0, 16)) && whole.en?.length > 0, `the sentence's card: ${JSON.stringify(whole)}`);
  await shot("54-sentence-card");
  await page.keyboard.press("Escape");
  // Your words: a word that's in this text opens its card.
  const mine = await page.evaluate(async () => (await import("/js/read/bank.js")).bankWords("nl"));
  if (mine.length) {
    if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
    await sheetStill();
    await page.locator(`${READER} [data-part="sheet"] [data-part="list-row"]`, { hasText: "Your words" }).first().click();
    const row = page.locator(`${READER} .lx-reader-word-row > button[data-part="list-row"]`).first();
    if (await row.count()) {
      const lemma = (await row.locator(".lx-row-title").textContent()).trim();
      await row.click();
      await card.waitFor();
      const fromList = await cardSays();
      assert(fromList.word && fromList.buttons.some((b) => /^↩ /.test(b)), `a word of yours opens its card: ${lemma} → ${JSON.stringify(fromList)}`);
      await page.keyboard.press("Escape");
    }
  }
  return `"${target.nl}" (${target.lemma}): "${target.en}" here, ${target.count} in the text, its sentence; More; the sentence's card${whole.literal ? " with its word-order line" : ""}; Your words`;
});

await stage("your words: the list in the reader's settings, taking one out, the words your studying knows; the shelf says how much you'd see", async () => {
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const meta = catalogue?.books?.find((b) => b.layers?.nl?.kind === "weave");
  if (!meta) return "no woven book on this server (skipped)";
  await page.goto(`${BASE}/app/#read/book/${encodeURIComponent(meta.id)}`);
  await page.waitForSelector(`${READER}[data-ready]`);
  const bankNow = () => page.evaluate(async () => (await import("/js/read/bank.js")).bankWords("nl"));
  // A word your studying knows by reading (the scheduler's rule), in this book and not in your words: four right
  // answers over five weeks.
  const studiedLemma = await page.evaluate(async (id) => {
    const weave = await (await import("/js/read/store.js")).getWeave(id, "nl");
    const bank = await import("/js/read/bank.js");
    const progress = await import("/js/study/progress.js");
    const counts = new Map();
    for (const sentence of weave.sentences) for (const [, lemma] of sentence.t) if (lemma && /^[a-z]+$/.test(lemma)) counts.set(lemma, (counts.get(lemma) ?? 0) + 1);
    const lemma = [...counts].sort((a, b) => b[1] - a[1]).map(([l]) => l).find((l) => !bank.knownIn("nl")(l));
    const day = 86_400_000;
    progress.record([35, 21, 9, 2].map((ago, k) => ({ at: Date.now() - ago * day, concept: `w:${lemma}`, skill: "read", outcome: "right", test: "recall", activity: "check", item: `check#${k}` })));
    // Saved in the background: wait until a fresh load finds it.
    for (let tries = 0; tries < 40 && !(await progress.loadProgress().then(() => progress.knows(`w:${lemma}`, { skill: "read" }))); tries++) await new Promise((r) => setTimeout(r, 50));
    return lemma;
  }, meta.id);
  await page.reload();
  await page.waitForSelector(`${READER}[data-ready]`);
  assert(await page.locator(`${READER} [data-part="woven-word"][data-lemma="${studiedLemma}"]`).count(), `"${studiedLemma}", strong in studying, shows in Dutch`);
  const before = await bankNow();
  assert(before.length >= 2, `words in your bank from the stages before: ${before.length}`);
  if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  const sheet = page.locator(`${READER} [data-part="sheet"]:not([hidden])`);
  const wordsRow = sheet.locator('[data-part="list-row"]', { hasText: "Your words" });
  assert((await wordsRow.locator(".lx-row-value").textContent()).trim() === String(before.length), "the row counts your words");
  await wordsRow.click();
  await sheet.getByText(`Your words (${before.length})`).waitFor();
  const rows = sheet.locator('.lx-group:first-of-type [data-part="list-row"]');
  assert((await rows.count()) === before.length, `a row per word: ${await rows.count()}`);
  const firstTitle = (await rows.first().locator(".lx-row-title").textContent()).trim();
  assert(firstTitle === before[0], `newest first: ${firstTitle}`);
  assert(/ in this text$|^Not in this text$/.test((await rows.first().locator(".lx-row-sub").textContent()).trim()), "what it stands for here");
  const studyGroup = sheet.locator(".lx-group", { hasText: "From your studying" });
  assert(await studyGroup.locator(".lx-row-title", { hasText: studiedLemma }).count(), `"${studiedLemma}" under From your studying`);
  const readLevel = await page.evaluate(async (l) => (await import("/js/study/progress.js")).conceptState(`w:${l}`, { skill: "read" }).level, studiedLemma);
  const meterLevel = await studyGroup.locator('[data-part="strength-meter"]').first().getAttribute("data-level");
  assert(readLevel >= 1 && meterLevel === String(readLevel), `with its reading strength: meter ${meterLevel}, scheduler ${readLevel}`);
  await shot("31-your-words");
  await studyGroup.scrollIntoViewIfNeeded();
  await shot("31b-your-words-studying");
  await sheet.locator(".lx-sheet-body").evaluate((node) => (node.scrollTop = 0));
  // Taking one out: it leaves the list and the text.
  const out = before[0];
  // The ✕ beside its row (the row itself opens the word's card).
  await sheet.getByRole("button", { name: `Take ${out} out of your words`, exact: true }).click();
  await sheet.getByText(`Your words (${before.length - 1})`).waitFor();
  assert(!(await bankNow()).includes(out), `"${out}" out of the bank`);
  // Out of the text, except inside a sentence still shown whole (you know enough of the rest of it).
  await page.waitForFunction(
    (l) => ![...document.querySelectorAll(`[data-part="reader"]:not([data-ghost]) [data-part="woven-word"][data-lemma="${l}"]`)].some((w) => !w.closest('[data-part="reader-sentence"]')),
    out,
    { timeout: 5000 },
  );
  await sheet.getByRole("button", { name: "Reading settings", exact: true }).click();
  assert((await sheet.locator('[data-part="list-row"]', { hasText: "Your words" }).locator(".lx-row-value").textContent()).trim() === String(before.length - 1), "back: the count follows");
  await page.keyboard.press("Escape");
  // The shelf: how much of the pilot you'd see in Dutch. While you're reading it, it's up front rather than on the shelf: open another first.
  await page.goto(`${BASE}/app/#read`);
  await page.locator('.lx-read-shelf [data-part="book-tile"]').filter({ hasNotText: meta.title }).first().click();
  await page.waitForSelector(`${READER}[data-ready]`);
  await page.goto(`${BASE}/app/#read`);
  // (It's in your library too, under the same title: the shelf's cover is the one that says how much.) On Read's leading shelf, or on
  // the page of the shelf it's on, through that shelf's row (a shelf's page draws every cover with how much you'd see).
  const coverage = async () => {
    for (let t = 0; t < 20; t++) {
      const sub = await page.evaluate(
        (title) => [...document.querySelectorAll('[data-part="page"]:not([data-ghost]) [data-part="book-tile"]')].find((r) => r.getAttribute("aria-label")?.startsWith(`${title}:`) || r.textContent.includes(title))?.querySelector(".lx-tile-sub")?.textContent.trim() ?? null,
        meta.title,
      );
      if (sub && /% in Dutch for you/.test(sub)) return sub;
      await page.waitForTimeout(500);
    }
    return null;
  };
  await page.locator(".lx-read-shelf .lx-shelf-section[data-lead] [data-part='book-tile']").first().waitFor({ timeout: 15_000 });
  let shelfSub = await coverage();
  // A shelf's own page, through its All (shelf.js renderShelf), for a book that isn't among the covers Read shows.
  const shelves = await page.locator(".lx-read-shelf .lx-shelf-section [data-part='section-link'][href^='#read/shelf/']").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  for (const href of shelves) {
    if (shelfSub) break;
    await page.goto(`${BASE}/app/${href}`);
    await page.waitForSelector("html[data-app-ready]");
    shelfSub = await coverage();
  }
  assert(shelfSub, `how much of ${meta.title} you'd see, on Read or a shelf's page (${shelves.join(", ") || "no shelf rows"})`);
  await shot("32-shelf-coverage");
  return `${before.length} words, newest "${before[0]}"; "${studiedLemma}" from studying at reading strength ${readLevel}; "${out}" taken out; shelf: ${shelfSub}`;
});

await stage("suggested words: the next words to learn light up after new pages, a tap offers one, a lookup puts them out; words you already know", async () => {
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const meta = catalogue?.books?.find((b) => b.layers?.nl?.kind === "weave");
  if (!meta) return "no woven book on this server (skipped)";
  await page.goto(`${BASE}/app/#read/book/${encodeURIComponent(meta.id)}`);
  await page.waitForSelector(`${READER}[data-ready]`);
  const sheet = page.locator(`${READER} [data-part="sheet"]:not([hidden])`);
  const openSettings = async () => {
    if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
    await sheetStill();
  };
  await openSettings();
  if ((await handle("r.mode")) !== "pages") await sheet.locator('[data-part="segment"]', { hasText: /^Pages$/ }).click();
  await openMore();
  await sheet.locator('[data-part="segment"]', { hasText: "3 pages" }).click();
  await page.keyboard.press("Escape");
  await toChapter(0);
  const lit = () =>
    page.evaluate(async (id) => {
      const weave = await (await import("/js/read/store.js")).getWeave(id, "nl");
      const { learningOrder } = await import("/js/read/woven-text.js");
      const bank = await import("/js/read/bank.js");
      const known = bank.knownIn("nl");
      const expected = learningOrder(weave).filter((l) => !known(l)).slice(0, 12).map(bank.lemmaKey);
      const lemmaAt = new Map();
      for (const s of weave.sentences) s.t.forEach(([, l], j) => l && lemmaAt.set(s.s + j, bank.lemmaKey(l)));
      const spans = [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-suggestion"]')];
      const lemmas = [...new Set(spans.map((s) => lemmaAt.get(Number(s.dataset.i))))];
      return { count: spans.length, lemmas, expected, outside: lemmas.filter((l) => !expected.includes(l)), clock: JSON.parse(localStorage.getItem("lx.reader.suggest.v1") ?? "{}")[id] };
    }, meta.id);
  // Two new pages already read: the next one read lights the words up (only once the turn has landed).
  await page.evaluate((id) => localStorage.setItem("lx.reader.suggest.v1", JSON.stringify({ [id]: { pages: 2, hw: -1 } })), meta.id);
  assert((await lit()).count === 0, "nothing lit up before the count");
  await page.keyboard.press("ArrowRight");
  await waitTurn();
  let state = await lit();
  assert(state.count > 0 && state.lemmas.length <= 12 && !state.outside.length && state.clock.pages === 3, `the next words to learn, lit up where they're English: ${JSON.stringify(state)}`);
  const firstLit = state.lemmas.length;
  await shot("37-suggested");
  // A tap on one on this page: what it would become, then a deliberate Add.
  const [pa, pb] = await handle("r.pageRanges[r.page]");
  const onPage = await page.evaluate(([a, b]) => {
    // One a finger can reach (not under the bars, which lie over the top line).
    const reachable = (node) => {
      const q = node.getBoundingClientRect();
      return q.width > 0 && document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2) === node;
    };
    const span = [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-suggestion"]')].find((s) => +s.dataset.i >= a && +s.dataset.i <= b && reachable(s));
    return span ? Number(span.dataset.i) : null;
  }, [pa, pb]);
  assert(onPage !== null, `a word lit up on page ${pa}–${pb}`);
  const target = await page.evaluate(async ([id, i]) => {
    const weave = await (await import("/js/read/store.js")).getWeave(id, "nl");
    const s = weave.sentences.find((x) => i >= x.s && i < x.e);
    return { dutch: s.t[i - s.s][0], lemma: s.t[i - s.s][1] };
  }, [meta.id, onPage]);
  await page.locator(`${READER} [data-part="reader-suggestion"][data-i="${onPage}"]`).click();
  const offer = page.locator(`${READER} [data-part="word-popover"]`);
  await offer.getByText("A word to learn next").waitFor();
  assert((await offer.locator("strong").textContent()).trim() === target.dutch.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""), `it says what it would become: ${await offer.locator("strong").textContent()} (${target.dutch})`);
  await shot("38-suggestion-offer");
  await offer.getByRole("button", { name: "Add to Dutch" }).click();
  await page.waitForFunction((l) => document.querySelector(`[data-part="reader"]:not([data-ghost]) [data-part="woven-word"][data-lemma="${l}"]`), target.lemma);
  state = await lit();
  const added = await page.evaluate(async (l) => (await import("/js/read/bank.js")).inBank("nl", l), target.lemma);
  assert(added && state.count === 0 && state.clock.pages === 0, `added; the lit-up words go and the count starts again: ${JSON.stringify({ added, count: state.count, clock: state.clock })}`);
  // Looking a word up starts the count again too: lit up again, then a tap on a Dutch word puts them out.
  await page.evaluate((id) => localStorage.setItem("lx.reader.suggest.v1", JSON.stringify({ [id]: { pages: 2, hw: -1 } })), meta.id);
  await roomForward(1);
  await page.keyboard.press("ArrowRight");
  await waitTurn();
  assert((await lit()).count > 0, "lit up again after a new page");
  const [qa, qb] = await handle("r.pageRanges[r.page]");
  const dutchOnPage = await page.evaluate(([a, b]) => {
    const reachable = (node) => {
      const q = node.getBoundingClientRect();
      return q.width > 0 && document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2)?.closest('[data-part="woven-word"]') === node;
    };
    const word = [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"] [data-part="woven-word"]')].find((w) => +w.dataset.i >= a && +w.dataset.i <= b && reachable(w));
    return word ? Number(word.dataset.i) : null;
  }, [qa, qb]);
  assert(dutchOnPage !== null, "a Dutch word on the page");
  await page.locator(`${READER} [data-part="reader-text"] [data-part="woven-word"][data-i="${dutchOnPage}"]`).first().click();
  state = await lit();
  assert(state.count === 0 && state.clock.pages === 0, `a lookup puts them out: ${JSON.stringify({ count: state.count, clock: state.clock })}`);
  await page.keyboard.press("Escape");
  // Words you already know: the next words in the order, a tap for the ones you know, × to pass one over.
  await openSettings();
  await sheet.locator('[data-part="list-row"]', { hasText: "Words you already know" }).click();
  const cells = sheet.locator('[data-part="known-word"]');
  await cells.first().waitFor();
  const grid = () => cells.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-lemma")));
  const firstGrid = await grid();
  const queue = await page.evaluate(async (id) => {
    const weave = await (await import("/js/read/store.js")).getWeave(id, "nl");
    const { learningOrder } = await import("/js/read/woven-text.js");
    const bank = await import("/js/read/bank.js");
    const known = bank.knownIn("nl");
    const passed = new Set(bank.notYet("nl"));
    return learningOrder(weave).map(bank.lemmaKey).filter((l) => !known(l) && !passed.has(l)).slice(0, 13);
  }, meta.id);
  assert(firstGrid.length === 12 && firstGrid.join() === queue.slice(0, 12).join(), `the next 12 in the order: ${firstGrid} vs ${queue}`);
  // The order is the language's: the frequency list is loaded, and the grid goes from more used words to less.
  const ranks = await page.evaluate(async (words) => {
    const frequency = await import("/js/study/frequency.js");
    return { loaded: Boolean(frequency.frequencyList("nl")), ranks: words.map((w) => frequency.rankOf(w, "nl")) };
  }, firstGrid);
  assert(ranks.loaded && ranks.ranks.every((r, k) => k === 0 || r >= ranks.ranks[k - 1]) && Number.isFinite(ranks.ranks[0]), `by the Dutch frequency list: ${JSON.stringify(ranks)}`);
  const knownWord = firstGrid[0];
  await cells.first().locator(".lx-known-yes").click();
  const afterKnow = await grid();
  const banked = await page.evaluate(async (l) => (await import("/js/read/bank.js")).inBank("nl", l), knownWord);
  assert(banked && afterKnow.length === 12 && afterKnow[0] === queue[12] && !afterKnow.includes(knownWord), `"${knownWord}" known; its place takes the next word: ${afterKnow}`);
  await shot("39-known-grid");
  const passedWord = afterKnow[1];
  await cells.nth(1).locator(".lx-known-no").click();
  const afterPass = await grid();
  const passed = await page.evaluate(async () => (await import("/js/read/bank.js")).notYet("nl"));
  assert(passed.includes(passedWord) && !afterPass.includes(passedWord) && afterPass.length === 12, `"${passedWord}" passed over: ${afterPass}`);
  await sheet.getByRole("button", { name: "Show others" }).click();
  const others = await grid();
  const passedNow = await page.evaluate(async () => (await import("/js/read/bank.js")).notYet("nl"));
  assert(others.length > 0 && !others.some((l) => afterPass.includes(l)) && afterPass.every((l) => passedNow.includes(l)), `others: ${others}`);
  // Leaving the grid lays the text out once: the word you know is in Dutch.
  await sheet.getByRole("button", { name: "Reading settings", exact: true }).click();
  await page.waitForFunction((l) => document.querySelector(`[data-part="reader"]:not([data-ghost]) [data-part="woven-word"][data-lemma="${l}"]`), knownWord, { timeout: 5000 });
  await page.keyboard.press("Escape");
  return `${firstLit} words lit up after a new page; "${target.lemma}" added from its offer; a lookup put them out; grid: "${knownWord}" known, "${passedWord}" passed over, ${others.length} others`;
});

await stage("Keep going: continueReading gives Today the text you're reading, its chapter, how far in, how much you'd follow", async () => {
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const meta = catalogue?.books?.find((b) => b.layers?.nl?.kind === "weave");
  if (!meta) return "no woven book on this server (skipped)";
  // The pilot was the last text opened (the stages before), part way in.
  const got = await page.evaluate(async () => (await import("/js/read/library.js")).continueReading());
  const expected = await page.evaluate(async (id) => {
    const store = await import("/js/read/store.js");
    const bank = await import("/js/read/bank.js");
    const { coverageOf } = await import("/js/read/book-format.js");
    const { book, text } = await store.getBook(id);
    const position = await store.getPosition(id);
    return {
      title: book.title,
      chapters: text.chapters.length,
      read: (position?.word ?? 0) / (book.words - 1),
      follow: coverageOf(await store.getWeave(id, "nl"), bank.knownSet("nl")).share,
    };
  }, meta.id);
  assert(
    got && got.id === meta.id && got.title === expected.title && got.chapter.n === 1 && got.chapter.of === expected.chapters && got.chapter.title && Math.abs(got.read - expected.read) < 1e-9 && Math.abs(got.follow - expected.follow) < 1e-9,
    `the pilot, where you are, what you'd follow: ${JSON.stringify({ got, expected })}`,
  );
  // Finished (at its end): it's skipped for the next text you opened.
  const next = await page.evaluate(async (id) => {
    const store = await import("/js/read/store.js");
    const { book } = await store.getBook(id);
    const before = await store.getPosition(id);
    await store.setPosition(id, book.words - 1, book.version);
    const after = await (await import("/js/read/library.js")).continueReading();
    await store.setPosition(id, before?.word ?? 0, book.version);
    return after;
  }, meta.id);
  assert(next?.id !== meta.id, `a finished text isn't offered: ${JSON.stringify(next)}`);
  return `"${got.title}", chapter ${got.chapter.n} of ${got.chapter.of} (${got.chapter.title}), ${Math.round(got.read * 100)}% in, you'd follow ${Math.round(got.follow * 100)}%; finished, the next is ${next ? `"${next.title}" (follow ${next.follow === null ? "none" : Math.round(next.follow * 100) + "%"})` : "none"}`;
});

await stage("a picture book with English help: each page its picture over its text, help over the words you don't know, its line breaks, offline, About this book", async () => {
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const helped = (catalogue?.books ?? []).filter((b) => b.layers?.en?.kind === "help");
  // The one with line breaks inside its paragraphs, if there is one.
  let meta = null;
  for (const candidate of helped) {
    const book = await fetch(`${BASE}${candidate.book}`).then((r) => r.json());
    if (book.pages?.length && (!meta || book.breaks?.length)) meta = { ...candidate, breaks: book.breaks?.length ?? 0 };
  }
  if (!meta) return "no picture book on this server (skipped)";
  // From the shelf, as you'd open it.
  await page.goto(`${BASE}/app/#read`);
  await openShelfBook(page, meta.title);
  await page.waitForSelector(`${READER}[data-ready]`, { timeout: 20_000 });
  if ((await handle("r.mode")) !== "pages") {
    if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
    await sheetStill();
    await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: /^Pages$/ }).click();
    await page.keyboard.press("Escape");
  }
  const book = await page.evaluate(async (id) => (await (await import("/js/read/store.js")).getBook(id)).text, meta.id);
  // Its pictures arrive, and are kept on the device.
  await page.waitForFunction(() => [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-picture"] img')].every((img) => img.complete && img.naturalWidth > 0), null, { timeout: 15_000 });
  const pictures = await page.evaluate(async (files) => {
    const store = await import("/js/read/store.js");
    for (let tries = 0; tries < 50; tries++) {
      const kept = await Promise.all(files.map((file) => store.getPicture(file)));
      if (kept.every(Boolean)) return { kept: kept.length, types: [...new Set(kept.map((blob) => blob.type))] };
      await new Promise((r) => setTimeout(r, 100));
    }
    return { kept: 0 };
  }, book.pictures.map((p) => p.file));
  assert(pictures.kept === book.pictures.length, `its ${book.pictures.length} pictures kept on the device: ${JSON.stringify(pictures)}`);
  // One chapter, named after the book; its line breaks.
  const shape = await page.evaluate(() => {
    const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
    return { chapter: root.lxReader.chapter, breaks: root.querySelectorAll('[data-part="reader-text"] br').length, figures: root.querySelectorAll('[data-part="reader-text"] [data-part="reader-picture"]').length };
  });
  assert(shape.chapter === 0 && shape.breaks === meta.breaks && shape.figures === book.pictures.length, `one chapter, ${meta.breaks} line breaks, ${book.pictures.length} pictures: ${JSON.stringify(shape)}`);
  // Every page of it: whole, and each book page starting a page with its picture on it (the bars away, as you'd read).
  await toChapter(0);
  if (!(await zen())) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  const startsAt = book.pages.map((p) => p.s);
  const seen = [];
  for (;;) {
    const state = await pageCheck();
    assert(state.tiled && !state.bad.length && !state.leaks.length, `page ${state.page + 1}: ${JSON.stringify(state)}`);
    seen.push({ a: state.a, picture: await pictureOnPage(page, state.a) });
    if (state.page === 0) await shot("40-picture-book-page");
    if (state.page === state.pages - 1) break;
    await page.keyboard.press("ArrowRight");
    await waitTurn();
  }
  const missing = startsAt.filter((s) => !seen.some((p) => p.a === s));
  // A book page's picture at the top of the page it starts (one with a page to itself: that page).
  const badPictures = startsAt.filter((s) => !seen.some((p) => p.a === s && p.picture?.inside && p.picture.first < 12));
  assert(!missing.length && !badPictures.length, `each book page starts a page, its picture at the top of it: missing ${missing}, ${JSON.stringify(badPictures)}`);
  // About this book: the last page, with the license's link; and from Contents.
  const credits = await page.evaluate((url) => {
    const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
    const section = root.querySelector('[data-part="reader-text"] [data-part="reader-credits"]');
    const h2 = section?.querySelector("h2");
    const box = root.querySelector('[data-part="reader-text"]').getBoundingClientRect();
    const r = h2?.getBoundingClientRect();
    return { shown: Boolean(r && r.top >= box.top && r.bottom <= box.bottom && document.elementFromPoint(r.left + 5, r.top + r.height / 2)?.closest("h2") === h2), link: section?.querySelector(`a[href="${url}"]`)?.textContent ?? null, text: section?.textContent.length ?? 0 };
  }, book.rights.licenceUrl);
  assert(credits.shown && credits.link && credits.text > 200, `About this book on the last page: ${JSON.stringify(credits)}`);
  await shot("43-about-this-book");
  if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await page.locator(`${READER} button[aria-label="Contents"]`).click();
  const contentsSheet = page.locator(`${READER} [data-part="sheet"][aria-label="Contents"]`);
  await contentsSheet.locator('[data-part="list-row"]', { hasText: "About this book" }).click();
  assert(await contentsSheet.getByText(book.rights.attributionText.slice(0, 40)).isVisible(), "About this book from Contents");
  await page.keyboard.press("Escape");
  // The help, over the words you don't know: a word has its English over it exactly when you don't know it.
  await toChapter(0);
  const gloss = await page.evaluate(async () => {
    const bank = await import("/js/read/bank.js");
    const knows = bank.knownIn("nl");
    const words = [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-word"]')];
    const wrong = words.filter((w) => Boolean(w.querySelector("rt")) === knows(w.dataset.lemma)).map((w) => w.dataset.lemma);
    return { words: words.length, glossed: words.filter((w) => w.querySelector("rt")).length, wrong: wrong.slice(0, 5) };
  });
  assert(gloss.words > 20 && gloss.glossed > 0 && !gloss.wrong.length, `English over exactly the words you don't know: ${JSON.stringify(gloss)}`);
  // A tap on a word you don't know: its meaning, no evidence. Hold one, "I know it": its English goes; then a tap on
  // it is a miss.
  const misses = () => page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().filter((r) => r.activity === "reader" && r.outcome === "wrong").length);
  const [qa, qb] = await handle("r.pageRanges[r.page]");
  const unknown = await page.evaluate(([a, b]) => {
    const words = [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-word"]')];
    const w = words.find((node) => {
      if (+node.dataset.i < a || +node.dataset.i > b || !node.querySelector("rt")) return false;
      const q = node.getBoundingClientRect();
      return document.elementFromPoint(q.left + q.width / 2, q.top + q.height * 0.7)?.closest('[data-part="reader-word"]') === node;
    });
    return w ? { i: +w.dataset.i, lemma: w.dataset.lemma, en: w.dataset.en } : null;
  }, [qa, qb]);
  assert(unknown, "a word you don't know on the page");
  const before = await misses();
  await page.locator(`${READER} [data-part="reader-word"][data-i="${unknown.i}"]`).click();
  const pop = page.locator(`${READER} [data-part="word-popover"]`);
  await pop.waitFor();
  const popText = await pop.textContent();
  await page.keyboard.press("Escape");
  assert(popText.includes(unknown.en.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")) && (await misses()) === before, `its English, and no miss: ${popText}`);
  const box = await page.locator(`${READER} [data-part="reader-word"][data-i="${unknown.i}"]`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  const bar = page.locator(`${READER} [data-part="reader-hold"]:not([hidden])`);
  await bar.waitFor();
  await bar.getByRole("button", { name: "I know it" }).click();
  await page.waitForFunction((i) => !document.querySelector(`[data-part="reader"]:not([data-ghost]) [data-part="reader-word"][data-i="${i}"] rt`), unknown.i);
  await page.locator(`${READER} [data-part="reader-word"][data-i="${unknown.i}"]`).click();
  await pop.waitFor();
  await page.keyboard.press("Escape");
  assert((await misses()) === before + 1, `"${unknown.lemma}" known now: its English gone, and a tap on it is a miss`);
  // In place: your words in Dutch, the rest in English in Dutch order.
  if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  await openMore();
  await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: "In place" }).click();
  await page.keyboard.press("Escape");
  const inPlace = await page.evaluate((lemma) => {
    const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
    return { help: root.querySelectorAll('[data-part="reader-help"][lang="en"]').length, rt: root.querySelectorAll('[data-part="reader-text"] rt').length, knownStays: root.querySelectorAll(`[data-part="reader-word"][data-lemma="${lemma}"]`).length };
  }, unknown.lemma);
  assert(inPlace.help > 0 && inPlace.rt === 0 && inPlace.knownStays > 0, `in place: ${JSON.stringify(inPlace)}`);
  await shot("41-picture-book-in-place");
  await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
  await sheetStill();
  await openMore();
  await page.locator(`${READER} [data-part="sheet"] [data-part="segment"]`, { hasText: "Over the words" }).click();
  await page.keyboard.press("Escape");
  // On its side (a short screen, its text too long to share a page with its picture): each picture on the left, its
  // text facing it on the right. On a computer: two book pages side by side, their pictures at one height.
  const faces = () =>
    page.evaluate(() => {
      const text = document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"]');
      const box = text.getBoundingClientRect();
      const mid = box.left + box.width / 2;
      return [...text.querySelectorAll('[data-part="reader-picture"]')]
        .map((f) => ({ f, r: f.querySelector("img").getBoundingClientRect() }))
        .filter(({ r }) => r.width && r.left >= box.left - 1 && r.right <= box.right + 1)
        .map(({ f, r }) => {
          let next = f.nextElementSibling;
          while (next && !next.querySelector?.(".lx-w")) next = next.nextElementSibling;
          const w = next?.querySelector(".lx-w").getBoundingClientRect();
          return { side: r.right <= mid ? "left" : "right", fit: f.getAttribute("data-fit"), top: Math.round(r.top), text: w && w.left >= box.left && w.right <= box.right ? (w.left >= mid ? "right" : "left") : null };
        });
    });
  const spread = await upright(async () => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => document.querySelector('[data-part="reader"]:not([data-ghost])').getAttribute("data-variant") === "spread", null, { timeout: 3000 });
    await toChapter(0);
    await page.keyboard.press("ArrowRight");
    await waitTurn();
    const side = { state: await spreadCheck(), faces: await faces() };
    await shot("42-picture-book-spread");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForFunction(() => document.querySelector('[data-part="reader"]:not([data-ghost])').getAttribute("data-variant") === "spread", null, { timeout: 3000 });
    await toChapter(0);
    await page.keyboard.press("ArrowRight");
    await waitTurn();
    const wide = { state: await spreadCheck(), faces: await faces() };
    await shot("42b-picture-book-spread-computer");
    return { side, wide };
  });
  const { side, wide } = spread;
  assert(side.state.tiled && !side.state.bad.length && !side.state.leaks.length && side.faces.length === 1 && side.faces[0].side === "left" && side.faces[0].fit === "alone" && side.faces[0].text === "right", `on its side, the picture on the left facing its text: ${JSON.stringify(side)}`);
  assert(wide.state.tiled && !wide.state.bad.length && !wide.state.leaks.length && wide.faces.length === 2 && wide.faces.every((f) => f.fit === "with-text" && f.text === f.side) && wide.faces[0].side !== wide.faces[1].side && Math.abs(wide.faces[0].top - wide.faces[1].top) < 2, `on a computer, two book pages side by side, their pictures at one height: ${JSON.stringify(wide)}`);
  // Keep going: it, with how many of its words you know.
  const going = await page.evaluate(async () => (await import("/js/read/library.js")).continueReading());
  const share = await page.evaluate(async (id) => {
    const store = await import("/js/read/store.js");
    const bank = await import("/js/read/bank.js");
    const { coverageOf } = await import("/js/read/book-format.js");
    return coverageOf(await store.getWeave(id, "en"), bank.knownSet("nl")).share;
  }, meta.id);
  assert(going?.id === meta.id && going.chapter.of === 1 && going.chapter.title === book.title && Math.abs(going.follow - share) < 1e-9, `continueReading: ${JSON.stringify(going)}`);
  return `"${book.title}": ${book.pages.length} pages, ${book.pictures.length} pictures (kept, ${pictures.types}), ${meta.breaks} line breaks, ${gloss.glossed} of ${gloss.words} words with English over them; "${unknown.lemma}" known after "I know it"; in place ${inPlace.help} English words; on its side each picture facing its text, on a computer two book pages with their pictures at one height; you know ${Math.round(share * 100)}% of its words`;
});

let problemsBeforeDelete = 0;
await stage("a picture book in WebKit (iPhone's engine), its pictures slow to arrive: every page whole, each picture at the top of its own page", async () => {
  // Safari sizes a picture that hasn't arrived by its alt text, not its width and height, so pages cut before it
  // landed were wrong after (a page showing the end of the one before, its picture half off the top); a rotation
  // re-cut them. Chrome sizes it either way, so this needs WebKit.
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  let meta = null;
  let book = null;
  for (const candidate of (catalogue?.books ?? []).filter((b) => b.layers?.en?.kind === "help")) {
    const found = await fetch(`${BASE}${candidate.book}`).then((r) => r.json());
    if (found.pages?.length && found.pictures?.length) [meta, book] = [candidate, found];
  }
  if (!meta) return "no picture book on this server (skipped)";
  const engine = await webkit.launch({ headless: true });
  try {
    const { cookies } = await context.storageState();
    const phone = await engine.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, storageState: { cookies, origins: [] } });
    const wk = await phone.newPage();
    wk.on("pageerror", (e) => problems.push(`page error (WebKit): ${e.message}`));
    await wk.route("**/library/pictures/**", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await wk.goto(`${BASE}/app/#read`);
    await wk.waitForSelector("html[data-app-ready]", { timeout: 20_000 });
    await openShelfBook(wk, meta.title);
    await wk.waitForSelector(`${READER}[data-ready]`, { timeout: 20_000 });
    const mode = await wk.evaluate(() => document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.mode);
    assert(mode === "pages", `it opens in pages: ${mode}`);
    // The pages are cut before the pictures arrive; read them once they have.
    const before = await wk.evaluate(() => [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-picture"] img')].filter((img) => img.complete && img.naturalWidth > 0).length);
    await wk.waitForFunction(() => [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-picture"] img')].every((img) => img.complete && img.naturalWidth > 0), null, { timeout: 20_000 });
    await wk.waitForTimeout(300);
    const startsAt = book.pages.map((p) => p.s);
    const seen = [];
    const wrong = [];
    for (;;) {
      const state = await pageCheck(wk);
      if (!state.tiled || state.bad.length || state.leaks.length) wrong.push({ page: state.page + 1, bad: state.bad.slice(0, 6), leaks: state.leaks.slice(0, 6) });
      seen.push({ a: state.a, picture: await pictureOnPage(wk, state.a) });
      if (state.page === 2) await wk.screenshot({ path: join(OUT, "shots", "44-picture-book-webkit-page-3.png") });
      if (state.page === state.pages - 1) break;
      await wk.keyboard.press("ArrowRight");
      await waitTurn(wk);
    }
    const missing = startsAt.filter((s) => !seen.some((p) => p.a === s));
    // A book page's picture at the top of the page it starts (one with a page to itself: that page).
  const badPictures = startsAt.filter((s) => !seen.some((p) => p.a === s && p.picture?.inside && p.picture.first < 12));
    assert(!wrong.length, `every page whole, nothing of another showing: ${JSON.stringify(wrong)}`);
    assert(!missing.length && !badPictures.length, `each book page starts a page, its picture at the top of it: missing ${missing}, ${JSON.stringify(badPictures)}`);
    return `"${book.title}" in WebKit: ${before} of ${book.pictures.length} pictures there when its pages were cut; ${seen.length} pages, each whole, each picture at the top of its page`;
  } finally {
    await engine.close();
  }
});

// A picture book's page as laid out: its picture (data-fit, its box, its column's width), its words, the room above
// and below them in the page's band, the top bar's foot, the text's size and padding.
const pictureLayout = (p = page) =>
  p.evaluate(() => {
    const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
    const r = root.lxReader;
    const text = root.querySelector('[data-part="reader-text"]');
    const box = text.getBoundingClientRect();
    const cs = getComputedStyle(text);
    const top = box.top + parseFloat(cs.paddingTop);
    const bottom = box.bottom - parseFloat(cs.paddingBottom);
    const [a, b] = r.pageRanges[r.page];
    const inBand = (q) => q.height > 0 && q.top >= top - 1 && q.bottom <= bottom + 1 && q.left >= box.left - 1 && q.right <= box.right + 1;
    const words = [...text.querySelectorAll(".lx-w")].filter((w) => +w.dataset.i >= a && +w.dataset.i <= b && w.offsetHeight);
    // (Not one under a cover: a short page's next picture lies just below it, hidden.)
    const covers = [...root.querySelectorAll(".lx-reader-cover")].map((c) => c.getBoundingClientRect());
    const covered = (q) => covers.some((c) => q.top + q.height / 2 > c.top && q.top + q.height / 2 < c.bottom);
    const figure = [...text.querySelectorAll('[data-part="reader-picture"]')].find((f) => inBand(f.querySelector("img").getBoundingClientRect()) && !covered(f.querySelector("img").getBoundingClientRect()));
    const img = figure?.querySelector("img").getBoundingClientRect();
    const boxes = [...(img ? [img] : []), ...words.map((w) => w.getBoundingClientRect())];
    const first = boxes.length ? Math.min(...boxes.map((q) => q.top)) : null;
    const last = boxes.length ? Math.max(...boxes.map((q) => q.bottom)) : null;
    return {
      page: r.page, pages: r.pages, a, b, words: words.length,
      fit: figure?.getAttribute("data-fit") ?? null,
      img: img ? { w: Math.round(img.width), h: Math.round(img.height), top: Math.round(img.top) } : null,
      column: figure?.clientWidth ?? null,
      textStart: Boolean(words[0]?.parentElement.hasAttribute("data-fit-break")),
      above: first == null ? null : Math.round(first - top),
      below: last == null ? null : Math.round(bottom - last),
      barFoot: Math.round(root.querySelector('[data-part="reader-bar"]').getBoundingClientRect().bottom),
      font: parseFloat(cs.fontSize),
      padTop: parseFloat(cs.paddingTop),
      pictures: root.hasAttribute("data-pictures"),
    };
  });

await stage("a picture book's page: below the top bar, its picture at the top as large as fits with its text under it, its text a size up (the slider still showing your size), its lines the book's where they fit whole and flowing on from one that doesn't; a long page's picture keeps the first whole paragraphs that fit under it (72 px at least), the rest at the top of the next page; a book without pictures keeps the bars over its first line", async () => {
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  // A picture book the learner here can read (Read and Find a book offer only those; another language's sits under Other languages).
  const learner = await page.evaluate(() => JSON.parse(localStorage.getItem("lx.learning.v1") || "null")?.lang ?? "nl");
  let meta = null;
  for (const candidate of (catalogue?.books ?? []).filter((b) => b.pictures > 1 && readableFor(b, learner))) {
    const found = await fetch(`${BASE}${candidate.book}`).then((r) => r.json());
    if (found.pages?.some((bp) => bp.picture != null)) meta = { ...candidate, pages: found.pages };
  }
  const plain = (catalogue?.books ?? []).find((b) => !(b.pictures > 1));
  if (!meta || !plain) return "no picture book, or no book without pictures, on this server (skipped)";
  // Your sizes (per language) before, put back at the end; this book's is read once it's open.
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("lx.reader.v1") || "{}").sizes ?? null);
  let yours = 19;
  const open = async (title) => {
    await page.goto(`${BASE}/app/#read`);
    await page.reload();
    await page.waitForSelector("html[data-app-ready]");
    await openShelfBook(page, title);
    await page.waitForSelector(`${READER}[data-ready]`, { timeout: 20_000 });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-picture"] img')].every((img) => img.complete && img.naturalWidth > 0), null, { timeout: 15_000 });
  };
  // Every page from the first, the bars away, as you'd read it.
  const readAll = async () => {
    await toChapter(0);
    if (!(await zen())) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    const seen = [];
    for (;;) {
      const state = await pageCheck();
      assert(state.tiled && !state.bad.length && !state.leaks.length, `page ${state.page + 1} whole: ${JSON.stringify(state)}`);
      seen.push(await pictureLayout());
      if (state.page === state.pages - 1) return seen;
      await page.keyboard.press("ArrowRight");
      await waitTurn();
    }
  };
  const settings = async () => {
    if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
    await sheetStill();
    return page.locator(`${READER} [data-part="reader-size"] input`);
  };
  try {
    await open(meta.title);
    assert((await handle("r.mode")) === "pages", "in pages");
    yours = (before ?? {})[await handle("r.sizeLang")] ?? 19;
    // Its text a size up; the slider shows your size as set.
    const slider = Number(await (await settings()).inputValue());
    await page.keyboard.press("Escape");
    const phone = await readAll();
    assert(phone.every((p) => p.pictures && Math.abs(p.font - yours * 1.2) < 0.05) && slider === yours, `the text a size up (×1.2 of ${yours}px), the slider at ${yours}: ${phone[0].font}px, slider ${slider}`);
    // Each book page on one page with its picture over its text, at the top: as large as fits (the column's width, or
    // the page full).
    const split = meta.pages.filter((bp) => !phone.some((p) => p.a === bp.s && p.b === bp.e - 1 && (bp.picture == null || p.fit === "with-text")));
    assert(!split.length, `each book page whole on a page with its picture: ${JSON.stringify(split.map((bp) => bp.s))} ${JSON.stringify(phone)}`);
    const shared = phone.filter((p) => p.fit === "with-text" && p.words);
    const low = shared.filter((p) => p.above > 12);
    const small = shared.filter((p) => p.img.w < p.column - 2 && p.below > 60);
    assert(shared.length && !low.length && !small.length, `each picture at the top, as large as fits: ${JSON.stringify({ low, small })}`);
    // Its lines: a break the book makes is kept only after a line that fits whole; some here flow on.
    const lines = await page.evaluate(() => {
      const text = document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"]');
      let kept = 0;
      let flowed = 0;
      const wrappedKept = [];
      for (const p of text.querySelectorAll("p")) {
        const half = parseFloat(getComputedStyle(p).lineHeight) / 2;
        let top = null;
        let wrapped = false;
        for (const node of p.children) {
          if (node.tagName === "BR") {
            if (node.hasAttribute("data-flow")) flowed++;
            else {
              kept++;
              if (wrapped) wrappedKept.push(node.previousElementSibling?.textContent);
              top = null;
              wrapped = false;
            }
          } else if (node.offsetHeight && node.matches('.lx-w, [data-part="woven-word"]')) {
            if (top == null) top = node.offsetTop;
            else if (Math.abs(node.offsetTop - top) > half) wrapped = true;
          }
        }
      }
      return { kept, flowed, wrappedKept };
    });
    assert(lines.flowed && !lines.wrappedKept.length, `the book's breaks kept only after lines that fit whole: ${JSON.stringify(lines)}`);
    // With the bars up the page starts below the bar.
    await toChapter(0);
    if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    const up = await pictureLayout();
    assert(up.img && up.img.top >= up.barFoot && up.padTop >= up.barFoot - 1, `with the bars up, the picture below the bar: ${JSON.stringify(up)}`);
    await shot("57-picture-book-below-the-bar");
    // A long page: a short phone, the largest text. Its picture keeps the first whole paragraphs that fit under it, shrinking down to 72 px to
    // share its page (reader.js fitPictures), and the rest start the next page at its top; a page of its own only when not even its first
    // paragraph fits, its text then the next page's.
    await page.setViewportSize({ width: 390, height: 700 });
    await page.waitForTimeout(300);
    await (await settings()).focus();
    await page.keyboard.press("End");
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape");
    const long = await readAll();
    const pairs = long.map((p, k) => ({ p, next: long[k + 1], k }));
    const goesOn = pairs.filter(({ p, next }) => p.fit === "with-text" && p.words && next?.textStart && next.a === p.b + 1);
    const alone = pairs.filter(({ p }) => p.fit === "alone");
    const parted = alone.filter(({ p, next }) => p.words || !next?.textStart || next.a !== p.a);
    const lowPicture = long.filter((p) => p.fit && p.above > 12);
    const tiny = long.filter((p) => p.fit === "with-text" && p.img && p.img.h < 72 - 1);
    const lowText = long.filter((p) => p.textStart && p.above > p.font * 1.75);
    assert(goesOn.length + alone.length && !parted.length && !lowPicture.length && !tiny.length && !lowText.length, `a long page's picture with its first paragraphs (${goesOn.length}) or alone (${alone.length}), its text going on at the top of the next page, each picture at its page's top, none under 72 px: ${JSON.stringify({ parted, lowPicture, tiny, lowText, fits: long.map((p) => p.fit) })}`);
    const at = (goesOn[0] ?? alone[0]).k;
    await toChapter(0);
    if (!(await zen())) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    for (let k = 0; k < at; k++) {
      await page.keyboard.press("ArrowRight");
      await waitTurn();
    }
    await shot("58-picture-book-long-page-picture");
    await page.keyboard.press("ArrowRight");
    await waitTurn();
    await shot("59-picture-book-long-page-text");
    // A book without pictures: your size as set, the bars over its first line (readersound's).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate((sizes) => {
      const prefs = JSON.parse(localStorage.getItem("lx.reader.v1") || "{}");
      if (sizes == null) delete prefs.sizes;
      else prefs.sizes = sizes;
      localStorage.setItem("lx.reader.v1", JSON.stringify(prefs));
    }, before);
    await open(plain.title);
    const words = await pictureLayout();
    assert(!words.pictures && Math.abs(words.font - yours) < 0.05 && words.padTop === 14, `"${plain.title}": ${yours}px, its page starting under the bar's place: ${JSON.stringify(words)}`);
    return `"${meta.title}": ${phone.length} pages on a phone, each book page whole, its picture at the top as large as fits, below the bar with it up; text ${phone[0].font}px for your ${yours}px; ${lines.kept} of the book's breaks kept, ${lines.flowed} flowing on; at the largest size on a short phone ${goesOn.length} pictures keeping their first paragraphs, the rest going on, ${alone.length} alone; "${plain.title}" ${words.font}px, the bars over its first line`;
  } finally {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate((sizes) => {
      const prefs = JSON.parse(localStorage.getItem("lx.reader.v1") || "{}");
      if (sizes == null) delete prefs.sizes;
      else prefs.sizes = sizes;
      localStorage.setItem("lx.reader.v1", JSON.stringify(prefs));
    }, before);
  }
});

await stage("definitions: kept with the book's layer; a word's meaning shows its first sense, its card every sense with an example; Define in the toolbar; About this book credits them; ones that came after the book are fetched on opening", async () => {
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const meta = (catalogue?.books ?? []).find((b) => Object.values(b.layers ?? {}).some((layer) => layer.definitions));
  if (!meta) return "no book with definitions on this server (skipped)";
  const [to, layerEntry] = Object.entries(meta.layers).find(([, layer]) => layer.definitions);
  const file = await fetch(`${BASE}${layerEntry.definitions.url}`).then((r) => r.json());
  // Opened from the shelf: its definitions kept with its layer.
  await page.goto(`${BASE}/app/#read`);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await openShelfBook(page, meta.title);
  await page.waitForSelector(`${READER}[data-ready]`);
  const kept = () => page.evaluate(async ([id, to]) => (await (await import("/js/read/store.js")).getDefinitions(id, to))?.url ?? null, [meta.id, to]);
  assert((await kept()) === layerEntry.definitions.url, `kept with its layer: ${await kept()}`);
  if (!(await zen())) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  // A word on the page that has definitions (one you don't know, so a tap is just its meaning).
  const target = await page.evaluate((lemmas) => {
    const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
    const box = root.getBoundingClientRect();
    for (const word of root.querySelectorAll('[data-part="reader-text"] [data-part="reader-word"]')) {
      const r = word.getBoundingClientRect();
      if (!r.height || r.top < box.top + 120 || r.bottom > box.bottom - 120 || !word.querySelector("rt")) continue;
      if (lemmas.includes(word.dataset.lemma) && document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.7)?.closest('[data-part="reader-word"]') === word) return { i: Number(word.dataset.i), lemma: word.dataset.lemma, x: r.left + r.width / 2, y: r.top + r.height * 0.7 };
    }
    return null;
  }, Object.keys(file.entries));
  assert(target, "a word with definitions on the page");
  const senses = file.entries[target.lemma].senses;
  await page.mouse.click(target.x, target.y);
  const popover = page.locator(`${READER} [data-part="word-popover"]`);
  await popover.waitFor();
  const first = await popover.locator(".lx-popover-sense").textContent();
  assert(first === `${senses[0].pos} · ${senses[0].def}`, `its meaning shows its first sense: ${first}`);
  // More: every sense, with its example.
  await popover.getByRole("button", { name: "More", exact: true }).click();
  const card = page.locator(`${READER} [data-part="sheet"][aria-label="Word"] [data-part="word-card"]`);
  await card.waitFor();
  const listed = await card.locator('[data-part="word-senses"] > li').evaluateAll((items) => items.map((li) => li.textContent));
  assert(listed.length === senses.length && senses.every((sense, k) => listed[k].includes(sense.def) && listed[k].includes(sense.pos) && (!sense.example || listed[k].includes(sense.example[0]))), `every sense in its card: ${JSON.stringify(listed)}`);
  await shot("55-definitions");
  await page.keyboard.press("Escape");
  // Held: Define opens it too.
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  const bar = page.locator(`${READER} [data-part="reader-hold"]:not([hidden])`);
  await bar.waitFor();
  await bar.getByRole("button", { name: "Define", exact: true }).click();
  await card.waitFor();
  assert((await card.locator('[data-part="word-senses"] > li').count()) === senses.length, "Define opens its card");
  await page.keyboard.press("Escape");
  // About this book credits them, with their license.
  if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
  await page.locator(`${READER} button[aria-label="Contents"]`).click();
  await page.locator(`${READER} [data-part="sheet"][aria-label="Contents"] [data-part="list-row"]`, { hasText: "About this book" }).click();
  const about = page.locator(`${READER} [data-part="sheet"][aria-label="Contents"] [data-part="reader-credits"]`);
  const credited = await about.evaluate((node) => ({ text: node.textContent, links: [...node.querySelectorAll("a")].map((a) => a.href) }));
  assert(credited.text.includes(`Definitions of its`) && credited.text.includes(file.credit) && (!/^CC-BY-SA-4\.0$/.test(file.licence) || credited.links.includes("https://creativecommons.org/licenses/by-sa/4.0/")), `About this book credits them: ${JSON.stringify(credited)}`);
  await page.keyboard.press("Escape");
  // Definitions that came after the book (dropped here): fetched again on opening, and kept.
  await page.evaluate(async ([id, to]) => (await import("/js/read/store.js")).keepDefinitions(id, to, null), [meta.id, to]);
  await page.reload();
  await page.waitForSelector(`${READER}[data-ready]`);
  let again = null;
  for (let tries = 0; tries < 50 && again !== layerEntry.definitions.url; tries++) {
    await page.waitForTimeout(100);
    again = await kept();
  }
  assert(again === layerEntry.definitions.url, `fetched again on opening: ${again}`);
  return `"${meta.title}": ${Object.keys(file.entries).length} lemmas defined; "${target.lemma}" with ${senses.length} sense${senses.length === 1 ? "" : "s"}; Define; credited; fetched again`;
});

await stage("a classic with only its cover as a picture (its `cover`): its tile shows that picture, About this book credits it", async () => {
  const catalog = await page.evaluate(async () => (await (await fetch("/library/catalogue.json")).json()).books.map((b) => b.id));
  if (!catalog.includes("carroll-alice-wonderland-opening") || !catalog.includes("storyweaver-1471-het-is-de-schuld-van-de-kat")) return "the classic or a picture book isn't in this server's library";
  const setup = await page.evaluate(async () => {
    const { fetchOpenBook } = await import("/js/read/shelf.js");
    const store = await import("/js/read/store.js");
    const { picturePath } = await import("/js/read/book-format.js");
    const books = (await (await fetch("/library/catalogue.json")).json()).books;
    const kat = await fetchOpenBook(books.find((b) => b.id === "storyweaver-1471-het-is-de-schuld-van-de-kat"));
    const alice = await fetchOpenBook(books.find((b) => b.id === "carroll-alice-wonderland-opening"));
    // Alice with one picture, its cover only, credited (as the classics get their old illustrations).
    const picture = { ...kat.book.pictures[3], credit: "John Tenniel (1865)", alt: "Alice and the White Rabbit" };
    const entry = await store.addBook({ ...alice.book, pictures: [picture], cover: 0 }, alice.weaves);
    return { id: alice.book.id, file: picture.file, path: picturePath(picture.file), coverFile: entry.coverFile };
  });
  assert(setup.coverFile === setup.file, `the cover's file is kept: ${JSON.stringify(setup)}`);
  await page.goto(`${BASE}/app/#read`);
  await page.reload();
  // Its tile in Your library (the shelf has Alice too, as the catalog has it: its own drawing).
  await page.waitForSelector('.lx-read-texts [data-part="book-tile"]');
  // The cover's picture (the tile's flag, the language it teaches, is an image too).
  const src = await page
    .locator('.lx-read-texts [data-part="book-tile"]', { hasText: "Alice" })
    .first()
    .locator('[data-part="book-cover"] > img:not([data-part="language-flag"])')
    .getAttribute("src", { timeout: 15_000 })
    .catch(async () => {
      const tiles = await page.evaluate(() => [...document.querySelectorAll('.lx-read-texts [data-part="book-tile"]')].map((t) => `${t.textContent.trim().slice(0, 30)} [${[...t.querySelectorAll("img")].map((i) => i.getAttribute("data-part") ?? "img").join(",")}]`));
      const kept = await page.evaluate(async (id) => JSON.stringify((await (await import("/js/read/store.js")).getEntry(id)) ?? null).slice(0, 300), setup.id);
      throw new Error(`no cover picture on Alice's tile; the tiles: ${tiles.join(" | ")}; Alice's entry: ${kept}`);
    });
  assert(src && (src.endsWith(setup.path) || src.startsWith("blob:")), `the tile shows the cover: ${src}`);
  await page.goto(`${BASE}/app/#read/book/${encodeURIComponent(setup.id)}`);
  await page.waitForSelector(`${READER}[data-ready]`, { timeout: 20_000 });
  await page.locator(`${READER} button[aria-label="Contents"]`).click();
  await page.locator('[data-part="sheet"] .lx-row-title', { hasText: "About this book" }).click();
  const about = (await page.locator('[data-part="reader-credits"]').last().innerText()).replace(/\s+/g, " ");
  assert(/The cover: John Tenniel \(1865\)/.test(about) && /License:/.test(about), `About this book: ${about}`);
  await shot("30-cover-credit");
  await page.keyboard.press("Escape");
  return about;
});

// A learner's own text has rights null (import-text.js, import-epub.js) and pictures null or none at all. Read with a weave, the reader once
// drew About this book for it and read null.attribution: "the reader couldn't open that text" (7 Nov 2026, p67; fixed in p69). The reader
// from p67 fails this stage, both texts.
await stage("a learner's own text (rights null, pictures null or none) read with a weave opens; About this book only for a layer that says who made it", async () => {
  const catalog = await page.evaluate(async () => (await (await fetch("/library/catalogue.json")).json()).books.map((b) => b.id));
  if (!catalog.includes("carroll-alice-wonderland-opening")) return "the woven classic isn't in this server's library";
  const made = await page.evaluate(async () => {
    const { fetchOpenBook } = await import("/js/read/shelf.js");
    const store = await import("/js/read/store.js");
    const { MADE_WITH_AI } = await import("/js/read/book-format.js");
    const books = (await (await fetch("/library/catalogue.json")).json()).books;
    const alice = await fetchOpenBook(books.find((b) => b.id === "carroll-alice-wonderland-opening"));
    const weave = alice.weaves?.nl;
    if (!weave) return null;
    // The classic's words as a learner's own text: no rights, no cover; one with pictures null, one with no pictures field at all.
    const { cover: _cover, pictures: _pictures, ...words } = alice.book;
    const credited = { ...words, id: `text-${crypto.randomUUID()}`, title: "Own text, its weave credited", source: { kind: "paste" }, rights: null, pictures: null };
    const bare = { ...words, id: `text-${crypto.randomUUID()}`, title: "Own text, its weave uncredited", source: { kind: "paste" }, rights: null };
    // The library's weave (its file names the pipeline and the model), and one whose maker gave no credit (a learner's own AI may give none).
    const { credit: _credit, made: _made, ...uncredited } = weave;
    await store.addBook(credited, { nl: { ...weave, book: credited.id } });
    await store.addBook(bare, { nl: { ...uncredited, book: bare.id } });
    return { credited: credited.id, bare: bare.id, line: `Its Dutch, woven in: ${MADE_WITH_AI}${weave.licence ? `, ${weave.licence}` : ""}.` };
  });
  assert(made, "the woven classic has no Dutch weave on this server");
  const seen = [];
  for (const [which, id] of [["credited", made.credited], ["bare", made.bare]]) {
    const before = problems.length;
    await page.goto(`${BASE}/app/#read/book/${encodeURIComponent(id)}`);
    await page.waitForSelector(`${READER}[data-ready]`, { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(800);
    const now = await page.evaluate((reader) => {
      const root = document.querySelector(reader);
      return {
        ready: Boolean(root?.hasAttribute("data-ready")),
        words: root?.querySelectorAll('[data-part="reader-text"] .lx-w').length ?? 0,
        about: [...(root?.querySelectorAll('[data-part="reader-credits"] p') ?? [])].map((p) => p.textContent.replace(/\s+/g, " ").trim()),
        madeUp: /made for Lexicommons(?! with)/i.test(root?.textContent ?? ""),
      };
    }, READER);
    const broke = problems.slice(before).filter((p) => /couldn't open that text|attribution|reading '/.test(p));
    assert(!broke.length, `${which}: ${broke.join(" | ").slice(0, 300)}`);
    assert(now.ready && now.words > 100, `${which}: the reader didn't open it: ${JSON.stringify(now).slice(0, 200)}`);
    assert(!now.madeUp, `${which}: a credit made up for its layer`);
    // Contents offers About this book exactly when the reader drew one.
    if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    await page.locator(`${READER} button[aria-label="Contents"]`).click();
    const sheet = page.locator(`${READER} [data-part="sheet"][aria-label="Contents"]`);
    await sheet.waitFor({ timeout: 10_000 });
    const row = await sheet.locator('[data-part="list-row"]', { hasText: "About this book" }).count();
    await page.keyboard.press("Escape");
    if (which === "credited") {
      assert(now.about.length === 1 && now.about[0] === made.line, `credited: About this book should be its layer's line alone: ${JSON.stringify(now.about)}`);
      assert(row === 1, "credited: no About this book in Contents");
      await shot("31-own-text-credited-layer");
    } else {
      assert(now.about.length === 0 && row === 0, `bare: About this book with nothing to say: ${JSON.stringify(now.about)}, ${row} row(s)`);
    }
    seen.push(`${which}: ${now.words} words, About ${now.about.length ? `"${now.about[0]}"` : "none"}`);
  }
  await page.evaluate(async (ids) => {
    const store = await import("/js/read/store.js");
    for (const id of ids) await store.removeBook(id);
  }, [made.credited, made.bare]);
  return seen.join("; ");
});

await stage("French typography: a narrow no-break space before ? ! ; and a no-break space before :, as France sets them", async () => {
  // A short French text, its marks typed with a plain space before them and once without ("vraiment?").
  const id = await page.evaluate(async () => {
    const { bookFromText } = await import("/js/read/import-text.js");
    const store = await import("/js/read/store.js");
    const book = await bookFromText("Tu viens ? Oui : à demain ! Et toi ; vraiment?", { title: "Un mot", lang: "fr" });
    await store.addBook(book);
    return book.id;
  });
  await page.goto(`${BASE}/app/#read/book/${encodeURIComponent(id)}`);
  // This text's own reader, not the one a stage before left open.
  await page.locator(`${READER} [data-part="reader-title"]`, { hasText: /^Un mot$/ }).waitFor();
  await page.waitForSelector(`${READER}[data-ready]`);
  const shown = await page.evaluate((reader) => [...document.querySelectorAll(`${reader} .lx-w[data-i]`)].filter((s) => !s.hidden).map((s) => s.textContent).join("").trim(), READER);
  const want = "Tu viens\u202F? Oui\u00A0: à demain\u202F! Et toi\u202F; vraiment\u202F?";
  assert(shown === want, `as France sets it: ${JSON.stringify(shown)}`);
  await page.evaluate(async (id) => (await import("/js/read/store.js")).removeBook(id), id);
  return JSON.stringify(shown);
});

await stage("the text size per language: a size kept from before stays for the languages you'd read; a Japanese book starts at its own and keeps the size you give it, while a Dutch one keeps its own", async () => {
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const dutch = (catalogue?.books ?? []).find((b) => b.layers?.nl?.kind === "weave" && !(b.pictures > 1));
  if (!dutch) return "no book woven into Dutch on this server (skipped)";
  const prefsNow = () => page.evaluate(() => JSON.parse(localStorage.getItem("lx.reader.v1") || "{}"));
  const learn = (lang) => page.evaluate((l) => localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: l, from: "en" })), lang);
  const font = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"]')).fontSize));
  const openAt = async (hash) => {
    await page.goto(`${BASE}/app/${hash}`);
    await page.reload();
    await page.waitForSelector(`${READER}[data-ready]`, { timeout: 20_000 });
  };
  const keep = await prefsNow();
  const learning = await page.evaluate(() => localStorage.getItem("lx.learning.v1"));
  let bakery = null;
  try {
    // One size for every book, as it was kept before sizes were per language.
    await page.evaluate(() => {
      const prefs = JSON.parse(localStorage.getItem("lx.reader.v1") || "{}");
      delete prefs.sizes;
      prefs.size = 21;
      localStorage.setItem("lx.reader.v1", JSON.stringify(prefs));
    });
    await learn("nl");
    await openAt(`#read/book/${encodeURIComponent(dutch.id)}`);
    const nl = { lang: await handle("r.sizeLang"), font: await font(), prefs: await prefsNow() };
    assert(nl.lang === "nl" && Math.abs(nl.font - 21) < 0.05 && nl.prefs.sizes?.nl === 21 && nl.prefs.size == null, `the size from before stays for Dutch: ${JSON.stringify(nl)}`);
    // A Japanese book (the Bakery woven into Japanese): a language you hadn't read starts at its own size.
    await learn("ja");
    bakery = await page.evaluate(async () => {
      const store = await import("/js/read/store.js");
      const { demoChecked } = await import("/js/read/demo-sample.js");
      const { book, weave } = await demoChecked("ja");
      await store.addBook(book, { ja: weave });
      return book.id;
    });
    await openAt(`#read/book/${encodeURIComponent(bakery)}`);
    const ja = { lang: await handle("r.sizeLang"), font: await font() };
    assert(ja.lang === "ja" && Math.abs(ja.font - 21) > 0.5, `Japanese starts at its own size, not the one from before: ${JSON.stringify(ja)}`);
    // 22 there, by the slider.
    if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
    await sheetStill();
    const slider = page.locator(`${READER} [data-part="reader-size"] input`);
    assert(Math.abs(Number(await slider.inputValue()) - ja.font) < 0.5, `the slider shows Japanese's size: ${await slider.inputValue()}`);
    await slider.fill("22");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => Math.abs(parseFloat(getComputedStyle(document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"]')).fontSize) - 22) < 0.05);
    // The Dutch book keeps its own; the Japanese one, reopened, is at 22.
    await learn("nl");
    await openAt(`#read/book/${encodeURIComponent(dutch.id)}`);
    const nlAgain = await font();
    await learn("ja");
    await openAt(`#read/book/${encodeURIComponent(bakery)}`);
    const jaAgain = await font();
    const sizes = (await prefsNow()).sizes;
    assert(Math.abs(nlAgain - 21) < 0.05 && Math.abs(jaAgain - 22) < 0.05 && sizes.nl === 21 && sizes.ja === 22, `Dutch ${nlAgain}, Japanese ${jaAgain}: ${JSON.stringify(sizes)}`);
    await shot("61-size-per-language");
    return `21 from before, kept for Dutch; Japanese started at ${ja.font}px; 22 set there; Dutch still 21, Japanese 22`;
  } finally {
    await page.evaluate(
      async ([prefs, learning, bakery]) => {
        localStorage.setItem("lx.reader.v1", JSON.stringify(prefs));
        if (learning == null) localStorage.removeItem("lx.learning.v1");
        else localStorage.setItem("lx.learning.v1", learning);
        if (bakery) await (await import("/js/read/store.js")).removeBook(bakery);
      },
      [keep, learning, bakery],
    );
    // The page took the language you learn when it loaded: load it again, so the next stage finds it as this one did.
    await page.goto(`${BASE}/app/#read`);
    await page.reload();
    await page.waitForSelector("html[data-app-ready]");
  }
});

// Your words on the study's rule (content.js shownName): a word with its reading while it's new, as written once you
// know it, the reading from the book's layer. Readers mounted over the app on hand-made layers, in Japanese and Chinese
// and in test Latin and Hebrew registered in the page only (as b4-check's).
const WORD_LANGS = {
  xl: { name: "Latin test", locale: "xl-XL", segmenter: "spaces", separator: " ", lemmaCase: "lower", abbreviations: [], readings: "vowels", patterns: {} },
  xh: { name: "Hebrew test", locale: "xh-XH", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", readings: "vowels", patterns: {} },
  xy: { name: "Yiddish test", locale: "xy-XY", segmenter: "spaces", separator: " ", lemmaCase: "any", abbreviations: [], direction: "rtl", readings: "roman", patterns: {} },
};
await stage("your words with their readings: a word shows its reading while it's new and as written once you know it, the book's layer giving it (kana and pinyin over it at 24px, 12px; Hebrew's points and Latin's macrons on it)", async () => {
  // The language you learn decides whether your studying's readings come in (content.js READINGS are that language's
  // only): Dutch first, which has none, so each reading here is the book's; Japanese at the end, for your studying's.
  const learningBefore = await page.evaluate(() => localStorage.getItem("lx.learning.v1"));
  const learnNow = async (lang) => {
    await page.evaluate((l) => localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: l, from: "en" })), lang);
    await page.goto(`${BASE}/app/#read`);
    await page.reload();
    await page.waitForSelector("html[data-app-ready]");
  };
  await learnNow("nl");
  const added = {};
  // Mounts a reader on a book and its layer with `words` in your words (`known` known by reading), opens Your words,
  // and reads each of your words' rows: the word as shown, the reading over it, their sizes, its direction.
  const yourWords = async (spec) => {
    added[spec.lang] ??= new Set();
    for (const word of spec.words) added[spec.lang].add(word);
    await page.evaluate(
      async ({ spec, langs }) => {
        const { LANGUAGES } = await import("/js/lang/index.js");
        Object.assign(LANGUAGES, langs);
        const { parseText } = await import("/js/read/import-text.js");
        const { openReader } = await import("/js/read/reader.js");
        const { addWord } = await import("/js/read/bank.js");
        const { record } = await import("/js/study/progress.js");
        const { el } = await import("/js/lx/ui.js");
        const day = 86_400_000;
        for (const lemma of spec.known) for (const ago of [30, 14, 6, 2]) record([{ concept: `w:${lemma}`, at: Date.now() - ago * day, lang: spec.lang, skill: "read", test: "recall", outcome: "right", activity: "type", item: "reader-check" }]);
        for (const lemma of spec.words) addWord(spec.lang, lemma, { quiet: true });
        document.getElementById("rc-words")?.remove();
        const host = el("div", { id: "rc-words" });
        document.body.append(host);
        const book = parseText(spec.text, { title: "Your words", lang: spec.bookLang ?? "en" });
        const weave = { format: "lexicommons-weave", kind: spec.kind ?? "weave", from: spec.from ?? "en", to: spec.to ?? spec.lang, sentences: spec.sentences.map((t, x) => ({ s: spec.cuts[x], e: spec.cuts[x + 1], t, text: "x", m: [] })) };
        openReader(host, { book, word: 0, mode: "scroll", weave }).showSheet("settings");
      },
      { spec, langs: WORD_LANGS },
    );
    await page.locator('#rc-words [data-part="sheet"] [data-part="list-row"]', { hasText: /^Your words/ }).first().click();
    await page.locator("#rc-words").getByText(/^Your words \(\d+\)$/).waitFor();
    return page.evaluate(() => {
      const tail = " out of your words";
      // What shows of a title: its text outside the readings over it, in what's laid out (marks or the word as written).
      const shown = (title) => {
        let out = "";
        const walk = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) if (!n.parentElement.closest("rt") && n.parentElement.getClientRects().length) out += n.textContent;
        return out.trim();
      };
      return [...document.querySelectorAll(`#rc-words button[aria-label^="Take "][aria-label$="${tail}"]`)].map((button) => {
        const title = button.closest("li").querySelector(".lx-row-title");
        const rts = [...title.querySelectorAll('rt[data-part="reading"]')];
        const word = title.querySelector(".lx-word");
        return {
          lemma: button.getAttribute("aria-label").slice(5, -tail.length),
          shown: shown(title),
          reading: rts.map((rt) => rt.textContent.replace(/⁠/g, "")).join(""),
          wordPx: word ? getComputedStyle(word).fontSize : null,
          readingPx: rts[0] ? getComputedStyle(rts[0]).fontSize : null,
          rtl: Boolean(title.querySelector("bdi")?.matches(":dir(rtl)")),
        };
      });
    });
  };
  const row = (rows, lemma) => {
    const found = rows.find((r) => r.lemma === lemma);
    assert(found, `no row for ${lemma}: ${JSON.stringify(rows)}`);
    return found;
  };
  try {
    // Latin: sol stands as itself with its macron (sōl) while new; orior and amo only in other forms (ōrta, amāvit),
    // urbs as urbem (no macron to show), puella with none: as written.
    const BOOK = "The sun rose over the city. The girl loved the city.";
    const latin = {
      lang: "xl", text: BOOK, cuts: [0, 6, 11], known: [], words: ["sol", "orior", "urbs", "amo", "puella"],
      sentences: [
        [["The", null], ["sol", "sol", "sōl"], ["orta", "orior", "ōrta"], ["over", null], ["the", null], ["urbem.", "urbs", "urbem"]],
        [["The", null], ["puella", "puella"], ["amavit", "amo", "amāvit"], ["the", null], ["urbem.", "urbs"]],
      ],
    };
    let rows = await yourWords(latin);
    const sol = row(rows, "sol");
    assert(sol.shown === "sōl" && !sol.reading, `sol, new: its macron on it: ${JSON.stringify(sol)}`);
    for (const lemma of ["orior", "urbs", "amo", "puella"]) assert(row(rows, lemma).shown === lemma, `${lemma}: as written (no reading of its own here): ${JSON.stringify(row(rows, lemma))}`);
    // Known by reading: as written.
    rows = await yourWords({ ...latin, known: ["sol"] });
    assert(row(rows, "sol").shown === "sol", `sol, known: as written: ${JSON.stringify(row(rows, "sol"))}`);
    // A Latin book with English help: Roma stands as itself (capitalized: the list's roma takes rōma).
    rows = await yourWords({
      lang: "xl", bookLang: "xl", kind: "help", from: "xl", to: "en", text: "Roma magna est. Puella Romam amat.", cuts: [0, 3, 6], known: [], words: ["roma"],
      sentences: [
        [["Rome", "roma", "Rōma"], ["great", "magnus"], ["is.", "sum"]],
        [["the girl", "puella"], ["to Rome", "roma", "Rōmam"], ["loves.", "amo"]],
      ],
    });
    assert(row(rows, "roma").shown === "rōma", `roma in a book with help: ${JSON.stringify(row(rows, "roma"))}`);
    // Hebrew: points on the word while it's new, right to left; עלה only as עלתה; שלום where the text writes it with
    // its shin's dot (שׁלום), its own form still.
    rows = await yourWords({
      lang: "xh", text: BOOK, cuts: [0, 6, 11], known: [], words: ["שמש", "עיר", "עלה", "שלום"],
      sentences: [
        [["The", null], ["שמש", "שמש", "שֶׁמֶשׁ"], ["עלתה", "עלה", "עָלְתָה"], ["over", null], ["the", null], ["עיר.", "עיר", "עִיר"]],
        [["The", null], ["ילדה", "ילדה", "יַלְדָּה"], ["אהבה", "אהב", "אָהֲבָה"], ["שׁלום", "שלום", "שָׁלוֹם"], ["עיר.", "עיר", "עִיר"]],
      ],
    });
    const sun = row(rows, "שמש");
    const city = row(rows, "עיר");
    assert(sun.shown === "שֶׁמֶשׁ" && sun.rtl && city.shown === "עִיר" && city.rtl, `שֶׁמֶשׁ and עִיר, right to left: ${JSON.stringify([sun, city])}`);
    assert(row(rows, "עלה").shown === "עלה", `עלה: as written: ${JSON.stringify(row(rows, "עלה"))}`);
    assert(row(rows, "שלום").shown === "שָׁלוֹם", `שלום, written שׁלום here: ${JSON.stringify(row(rows, "שלום"))}`);
    await shot("62-your-words-hebrew");
    // Japanese: kana over the kanji while new, the word at 24px and its reading at 12px; 私 known: as written; 食べる
    // only as 食べた here: as written.
    const japanese = {
      lang: "ja", text: "The village is quiet. I ate bread.", cuts: [0, 4, 7], known: ["私"], words: ["村", "静か", "私", "食べる"],
      sentences: [
        [["The", null], ["村", "村", "むら"], ["is", null], ["静か.", "静か", "しずか"]],
        [["私", "私", "わたし"], ["食べた", "食べる", "たべた"], ["bread.", null]],
      ],
    };
    rows = await yourWords(japanese);
    const village = row(rows, "村");
    const quiet = row(rows, "静か");
    assert(village.shown === "村" && village.reading === "むら" && village.wordPx === "24px" && village.readingPx === "12px", `村 with むら over it, 24px and 12px: ${JSON.stringify(village)}`);
    assert(quiet.shown === "静か" && quiet.reading === "しず", `静か with しず over 静: ${JSON.stringify(quiet)}`);
    for (const lemma of ["私", "食べる"]) assert(row(rows, lemma).shown === lemma && !row(rows, lemma).reading, `${lemma}: as written: ${JSON.stringify(row(rows, lemma))}`);
    await shot("63-your-words-japanese");
    // Chinese: pinyin over the character.
    rows = await yourWords({
      lang: "zh", text: "I read a book.", cuts: [0, 4], known: [], words: ["书"],
      sentences: [[["我", "我", "wǒ"], ["read", null], ["a", null], ["书.", "书", "shū"]]],
    });
    const book = row(rows, "书");
    assert(book.reading === "shū" && book.wordPx === "24px" && book.readingPx === "12px", `书 with shū over it: ${JSON.stringify(book)}`);
    // Yiddish (lang/readings.js "roman"): a Hebrew-origin word carries its romanization (שבת, shabes) over it, in the
    // text and in Your words while it's new; a word spelled as it's said (גייט) carries none.
    rows = await yourWords({
      lang: "xy", text: "On sabbath he goes.", cuts: [0, 4], known: [], words: ["שבת", "גיין"],
      sentences: [[["On", "אויף"], ["שבת", "שבת", "shabes"], ["he", "ער"], ["גייט.", "גיין"]]],
    });
    const sabbath = row(rows, "שבת");
    assert(sabbath.shown === "שבת" && sabbath.reading === "shabes" && sabbath.wordPx === "24px" && sabbath.readingPx === "12px", `שבת with shabes over it in Your words: ${JSON.stringify(sabbath)}`);
    assert(row(rows, "גיין").shown === "גיין" && !row(rows, "גיין").reading, `גיין: as written: ${JSON.stringify(row(rows, "גיין"))}`);
    const inText = await page.evaluate(() => {
      const word = document.querySelector('#rc-words [data-part="woven-word"][data-lemma="שבת"]');
      return { reading: word?.querySelector('rt[data-part="reading"]:not([data-state="hidden"])')?.textContent ?? null, goes: document.querySelector('#rc-words [data-part="woven-word"][data-lemma="גיין"] rt[data-part="reading"]') ? "a reading" : "none" };
    });
    assert(inText.reading === "shabes" && inText.goes === "none", `שבת in the text, shabes over it; גייט none: ${JSON.stringify(inText)}`);
    // Learning Japanese, your studying's reading comes in where the book has none: 食べる from the Japanese starter
    // (たべる: た over 食), when this server's library has it.
    await learnNow("ja");
    const study = await page.evaluate(async () => {
      const content = await import("/js/study/content.js");
      for (let t = 0; t < 50 && !(content.contentLanguage() === "ja" && content.READINGS["食べる"]); t++) await new Promise((r) => setTimeout(r, 100));
      return content.contentLanguage() === "ja" ? content.READINGS["食べる"] ?? null : null;
    });
    let studied = "no Japanese pack on this server, so your studying's reading is unchecked";
    if (study) {
      rows = await yourWords(japanese);
      const eat = row(rows, "食べる");
      assert(eat.shown === "食べる" && eat.reading === "た" && eat.wordPx === "24px", `食べる, learning Japanese: た over 食 from your studying (${study}): ${JSON.stringify(eat)}`);
      studied = `learning Japanese, 食べる with た from your studying`;
    }
    return `sōl new, sol known; rōma (help); שֶׁמֶשׁ עִיר שָׁלוֹם right to left; 村 むら and 静か しず at 24/12px, 私 known; 书 shū; שבת shabes (Yiddish) in the list and the text; forms elsewhere as written (learning Dutch); ${studied}`;
  } finally {
    await page.evaluate(
      async ({ added, codes }) => {
        document.getElementById("rc-words")?.remove();
        const { removeWord } = await import("/js/read/bank.js");
        for (const [lang, words] of Object.entries(added)) for (const word of words) removeWord(lang, word);
        const { LANGUAGES } = await import("/js/lang/index.js");
        for (const code of codes) delete LANGUAGES[code];
      },
      { added: Object.fromEntries(Object.entries(added).map(([lang, words]) => [lang, [...words]])), codes: Object.keys(WORD_LANGS) },
    );
    await page.evaluate((before) => (before == null ? localStorage.removeItem("lx.learning.v1") : localStorage.setItem("lx.learning.v1", before)), learningBefore);
    await page.goto(`${BASE}/app/#read`);
    await page.reload();
    await page.waitForSelector("html[data-app-ready]");
  }
});

// The literal line ends as its sentence does: Armenian ends every sentence with ։, a question too (its ՞ on the word
// asked about), so the English line under it ends with ? or a full stop (lang/index.js englishEnd, given the sentence);
// a closing quote after the mark stays after it; Hindi's । written as a word of its own is the line's end too.
await stage("the literal line ends as its sentence does: an Armenian question's ։ is ?, a statement's a full stop, a quote's closer kept, Hindi's own ।, and no own mark left in the English", async () => {
  await page.goto(`${BASE}/app/#read`);
  await page.waitForSelector("html[data-app-ready]");
  // Mounts a reader on an English book woven into `to`, every word known (each sentence whole, its line under it), and
  // reads each line: its chunks and its end.
  const linesOf = (spec) =>
    page.evaluate(async (spec) => {
      const { parseText } = await import("/js/read/import-text.js");
      const { openReader } = await import("/js/read/reader.js");
      const { el } = await import("/js/lx/ui.js");
      document.getElementById("rc-literal")?.remove();
      const host = el("div", { id: "rc-literal" });
      document.body.append(host);
      const book = parseText(spec.text, { title: "Literal", lang: "en" });
      const weave = { format: "lexicommons-weave", kind: "weave", from: "en", to: spec.to, sentences: spec.sentences };
      openReader(host, { book, word: 0, mode: "scroll", weave, know: new Set(spec.know) }).setZen(true);
      await new Promise((resolve) => setTimeout(resolve, 600));
      return [...host.querySelectorAll('[data-part="reader-literal"]')].map((line) => ({
        chunks: [...line.querySelectorAll('[data-part="literal-chunk"]')].map((chunk) => chunk.textContent),
        end: line.querySelector(".lx-punct")?.textContent ?? null,
      }));
    }, spec);
  try {
    const lines = await linesOf({
      to: "hy", text: "Where are you going? I am going. Go.", know: ["ուր", "եմ", "գնալ", "ես"],
      sentences: [
        { s: 0, e: 4, text: "Ո՞ւր ես գնում։", t: [["Ո՞ւր", "ուր"], ["ես", "եմ"], ["ես", "եմ"], ["գնում։", "գնալ"]], m: [["Ո՞ւր", "Where", [0], "ուր"], ["ես", "are you", [1, 2], "եմ"], ["գնում։", "going", [3], "գնալ"]] },
        { s: 4, e: 7, text: "Ես գնում եմ։", t: [["Ես", "ես"], ["եմ", "եմ"], ["գնում։", "գնալ"]], m: [["Ես", "I", [0], "ես"], ["գնում", "going", [2], "գնալ"], ["եմ։", "am", [1], "եմ"]] },
        { s: 7, e: 8, text: "«Գնա։»", t: [["«Գնա։»", "գնալ"]], m: [["«Գնա։»", "Go", [0], "գնալ"]] },
      ],
    });
    assert(lines.length === 3, `each sentence whole, each with its line: ${JSON.stringify(lines)}`);
    assert(lines[0].end === "?" && lines[1].end === "." && lines[2].end === ".»", `the question's line ends with ?, the statement's with a full stop, the quote's with .»: ${JSON.stringify(lines)}`);
    assert(lines.every((line) => line.chunks.every((chunk) => !/[։.?]/u.test(chunk))), `no end mark left on a chunk: ${JSON.stringify(lines)}`);
    await shot("64-literal-armenian");
    // Hindi: its । written as a word of its own ("चल ।"), a chunk of the line until now.
    const hindi = await linesOf({
      to: "hi", text: "Go.", know: ["चलना"],
      sentences: [{ s: 0, e: 1, text: "चल ।", t: [["चल", "चलना"]], m: [["चल", "Go", [0], "चलना"], ["।", "।", [0], null]] }],
    });
    assert(hindi.length === 1 && hindi[0].end === "." && hindi[0].chunks.join("|") === "Go", `Hindi's own । as the line's end: ${JSON.stringify(hindi)}`);
    return [...lines, ...hindi].map((line) => `${line.chunks.join(" ")}${line.end}`).join(" | ");
  } finally {
    await page.evaluate(() => document.getElementById("rc-literal")?.remove());
  }
});

// Han characters in each language's own forms (reader.css): Simplified Chinese's faces for zh, Taiwan's for zh-Hant
// (which :lang(zh) matches too), no Mandarin faces for Cantonese (the system draws yue in Hong Kong's); a woven word in
// any of them, or in Japanese, never breaks across lines.
await stage("Chinese in its own forms: zh-Hant in Taiwan's faces, not Simplified's; Cantonese's woven words kept whole, as Chinese's and Japanese's are", async () => {
  await page.goto(`${BASE}/app/#read`);
  await page.waitForSelector("html[data-app-ready]");
  const codes = ["zh", "zh-Hant", "yue", "ja"];
  try {
    const looks = await page.evaluate(async (codes) => {
      const { parseText } = await import("/js/read/import-text.js");
      const { openReader } = await import("/js/read/reader.js");
      const { el } = await import("/js/lx/ui.js");
      document.getElementById("rc-han")?.remove();
      const host = el("div", { id: "rc-han" });
      document.body.append(host);
      openReader(host, { book: parseText("A short text to read.", { title: "Han", lang: "en" }), word: 0, mode: "scroll" }).setZen(true);
      await new Promise((resolve) => setTimeout(resolve, 600));
      const text = host.querySelector('[data-part="reader-text"]');
      const look = {};
      for (const code of codes) {
        const word = el("span", { part: "woven-word", lang: code }, "學生");
        text.append(word);
        const style = getComputedStyle(word);
        look[code] = { font: style.fontFamily, wrap: style.whiteSpace };
      }
      return look;
    }, codes);
    assert(/PingFang SC/.test(looks.zh.font) && !/PingFang TC/.test(looks.zh.font), `zh in Simplified's faces: ${looks.zh.font}`);
    assert(/PingFang TC/.test(looks["zh-Hant"].font) && !/PingFang SC/.test(looks["zh-Hant"].font), `zh-Hant in Taiwan's faces: ${looks["zh-Hant"].font}`);
    assert(!/PingFang/.test(looks.yue.font), `Cantonese with no Mandarin faces: ${looks.yue.font}`);
    assert(codes.every((code) => looks[code].wrap === "nowrap"), `woven words kept whole: ${JSON.stringify(looks)}`);
    const face = (font) => font.match(/"?PingFang [A-Z]+"?/)?.[0].replaceAll('"', "") ?? "none of Mandarin's";
    return `zh: ${face(looks.zh.font)}; zh-Hant: ${face(looks["zh-Hant"].font)}; yue: ${face(looks.yue.font)}; all four nowrap`;
  } finally {
    await page.evaluate(() => document.getElementById("rc-han")?.remove());
  }
});

// Read's shelf keeps its promise (shelf.js): in its curated sections and its kinds' shelves, only the books with a layer
// for the language you learn; every other book last, under "Other languages"; with none for it, the lede says so. The shelf is mounted on a catalog of its own (books for Dutch,
// Japanese and Chinese), learning each language in turn.
await stage("the shelf keeps its promise: only books for the language you learn under it, the rest under Other languages; none, and it says so", async () => {
  const learningBefore = await page.evaluate(() => localStorage.getItem("lx.learning.v1"));
  const learnNow = async (lang) => {
    await page.evaluate((l) => localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: l, from: "en" })), lang);
    await page.goto(`${BASE}/app/#read`);
    await page.reload();
    await page.waitForSelector("html[data-app-ready]");
  };
  const catalog = {
    shelf: [{ id: "start", title: "Start here", books: ["rc-nl", "rc-ja"] }],
    books: [
      { id: "rc-nl", title: "A Dutch story", lang: "nl", words: 120, authors: [{ name: "A. Writer" }], layers: { en: { kind: "help", url: "/library/none-a.json" } } },
      { id: "rc-ja", title: "An English story", lang: "en", words: 140, authors: [{ name: "B. Writer" }], layers: { ja: { kind: "weave", url: "/library/none-b.json" } } },
      { id: "rc-zh", title: "Another story", lang: "en", words: 90, authors: [{ name: "C. Writer" }], layers: { zh: { kind: "weave", url: "/library/none-c.json" } } },
    ],
  };
  const shelfAs = async (lang) => {
    await learnNow(lang);
    return page.evaluate(async (catalog) => {
      const { renderShelf } = await import("/js/read/shelf.js");
      const { el } = await import("/js/lx/ui.js");
      document.getElementById("rc-shelf")?.remove();
      const host = el("div", { id: "rc-shelf" });
      document.body.append(host);
      renderShelf(host, { catalog });
      for (let t = 0; t < 50 && !host.querySelector(".lx-shelf-section"); t++) await new Promise((resolve) => setTimeout(resolve, 100));
      // Each shelf, the leading one first: its name and its books by their covers.
      return {
        // What it says first: none for your language, as an empty state with Tinta (a box).
        lede: host.querySelector(".lx-shelf-sections > .lx-read-none-yet")?.textContent.trim() ?? "",
        tinta: Boolean(host.querySelector(".lx-shelf-sections > .lx-read-none-yet [data-part='character'][data-state='box']")),
        groups: [...host.querySelectorAll(".lx-shelf-section")].map((group) => ({
          title: group.querySelector("[data-part='section-title']")?.textContent ?? null,
          books: [...group.querySelectorAll(".lx-tile-title")].map((title) => title.textContent),
        })),
      };
    }, catalog);
  };
  const same = (got, want, what) => assert(JSON.stringify(got) === JSON.stringify(want), `${what}: ${JSON.stringify(got)}`);
  try {
    const ja = await shelfAs("ja");
    assert(ja.lede === "", `learning Japanese, there are books for it, so nothing to say: ${ja.lede}`);
    same(ja.groups, [{ title: "Start here", books: ["An English story"] }, { title: "Other languages", books: ["A Dutch story", "Another story"] }], "learning Japanese, the sections");
    await shot("65-shelf-promise-japanese");
    const sv = await shelfAs("sv");
    assert(/^No books in Swedish yet\. These are free to read in other languages\.$/.test(sv.lede) && sv.tinta, `learning Swedish (none for it), it says so, Tinta with a box: ${JSON.stringify([sv.lede, sv.tinta])}`);
    same(sv.groups, [{ title: "Other languages", books: ["A Dutch story", "An English story", "Another story"] }], "learning Swedish, the sections");
    const nl = await shelfAs("nl");
    same(nl.groups, [{ title: "Start here", books: ["A Dutch story"] }, { title: "Other languages", books: ["An English story", "Another story"] }], "learning Dutch, the sections");
    await page.evaluate(() => document.getElementById("rc-shelf")?.remove());
    return `Japanese: Start here (its own book), the other two under Other languages; Swedish: none, said, all three under Other languages; Dutch: its own, then the rest under Other languages`;
  } finally {
    await page.evaluate((before) => {
      document.getElementById("rc-shelf")?.remove();
      if (before == null) localStorage.removeItem("lx.learning.v1");
      else localStorage.setItem("lx.learning.v1", before);
    }, learningBefore);
    await page.goto(`${BASE}/app/#read`);
    await page.reload();
    await page.waitForSelector("html[data-app-ready]");
  }
});

await stage("a translation beside the book (a parallel layer): the book as written, each sentence's English under it where its page lines up and the page's under its last line where it doesn't, no line cut by a page's edge, behind the English translation switch (on as English help is, no help or weave controls), switching it mid-book keeping your place both ways, About crediting it, a tap on the English opening nothing", async () => {
  const learningBefore = await page.evaluate(() => localStorage.getItem("lx.learning.v1"));
  const prefsBefore = await page.evaluate(() => localStorage.getItem("lx.reader.v1"));
  let id = null;
  try {
    // A made-up book whose pages fit a reader's page at 390 × 844 as written and run onto a second with their English in: its title, six
    // pages of eight sentences each with its English, and a last page whose English goes whole.
    const made = await page.evaluate(async () => {
      const f = await import("/js/read/book-format.js");
      const lang = "es";
      const animals = [["perro", "dog"], ["gato", "cat"], ["pájaro", "bird"], ["caballo", "horse"], ["conejo", "rabbit"], ["zorro", "fox"], ["ratón", "mouse"]];
      const story = ([es, en]) => [
        [`El ${es} sale de la casa muy temprano y camina despacio hacia el río grande.`, `The ${en} leaves the house very early and walks slowly toward the big river.`],
        ["Allí encuentra a sus amigos, que juegan con una pelota roja junto al agua.", "There it finds its friends, who are playing with a red ball by the water."],
        ["Durante toda la mañana corren, saltan y se ríen sin pensar en la hora.", "All morning they run, jump and laugh without thinking about the time."],
        [`Cuando el sol está alto, el ${es} tiene hambre y vuelve a su casa.`, `When the sun is high, the ${en} is hungry and goes back home.`],
        ["Su madre le da pan, queso y fruta, y después duerme un rato largo.", "Its mother gives it bread, cheese and fruit, and then it sleeps for a long while."],
        ["Por la tarde vuelve al río con su hermano mayor para buscar piedras bonitas.", "In the afternoon it goes back to the river with its older brother to look for pretty stones."],
        ["Encuentran una piedra azul, otra verde y una más grande que parece un huevo.", "They find a blue stone, a green one and a bigger one that looks like an egg."],
        ["Al llegar la noche, cuentan las piedras junto al fuego y se van a dormir.", "When night comes, they count the stones by the fire and go to sleep."],
      ];
      const pages = [[["El río grande", "The big river"]], ...animals.map(story)];
      const words = [];
      const paras = [];
      pages.forEach((sentences, k) => {
        const these = f.tokenize(sentences.map(([es]) => es).join(" "), lang);
        paras.push({ k: k ? "p" : "h", s: words.length, e: words.length + these.length });
        words.push(...these);
      });
      const book = {
        format: "lexicommons-book", v: 1, id: "check-parallel-book", version: "", title: "El río grande", authors: [], lang,
        source: { kind: "paste" }, rights: { us: false, eu: false, basis: "made for the check", licence: "CC0-1.0" },
        words, italic: [], paras, chapters: [], sentences: f.segmentSentences(words, paras, lang),
        pages: paras.map(({ s, e }) => ({ s, e, picture: null })),
      };
      book.version = await f.bookVersion(book);
      const whole = pages.length - 1; // the last page's sentences don't line up: its English goes whole
      const english = pages.flatMap((sentences, k) => (k === whole ? [null] : sentences.map(([, en]) => en)));
      const layer = {
        format: "lexicommons-weave", v: 1, kind: "parallel", book: book.id, bookVersion: book.version, from: lang, to: "en",
        licence: "CC BY 4.0", spdx: "CC-BY-4.0", credit: "The big river, written for the check",
        source: { ref: "https://example.org/stories/en/big-river", title: "The big river" },
        made: { pipeline: "reader-check", sha256: "0".repeat(64), at: "2026-11-07T18:00" },
        pages: pages.map((sentences) => sentences.map(([, en]) => en).join(" ")),
        sentences: book.sentences.map(([s], x) => (s >= book.pages[whole].s ? null : english[x])),
      };
      const problems = [...(await f.validateBook(book)), ...(await f.validateWeave(layer, book))];
      if (!problems.length) await (await import("/js/read/store.js")).addBook(book, { en: layer });
      // Each line in order, and the word it follows: its sentence's last, or the whole page's last.
      const lines = [];
      book.sentences.forEach(([, e], x) => typeof layer.sentences[x] === "string" && lines.push({ text: layer.sentences[x], after: e - 1 }));
      lines.push({ text: layer.pages[whole], after: book.pages[whole].e - 1 });
      return { id: book.id, words: words.length, sentences: book.sentences.length, problems, lines, starts: book.pages.map((p) => p.s) };
    });
    assert(!made.problems.length && made.sentences === 57, `the made-up book and its layer check out: ${JSON.stringify({ ...made, lines: made.lines.length })}`);
    id = made.id;
    // Spanish learned, nothing kept for its English (the switch's own default, a help layer's English help's).
    await page.evaluate(() => {
      localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "es", from: "en" }));
      const prefs = JSON.parse(localStorage.getItem("lx.reader.v1") || "{}");
      if (prefs.weave) delete prefs.weave.es;
      localStorage.setItem("lx.reader.v1", JSON.stringify(prefs));
    });
    await page.goto(`${BASE}/app/#read/book/${encodeURIComponent(id)}`);
    await page.reload();
    await page.waitForSelector(`${READER}[data-ready]`, { timeout: 20_000 });
    assert((await handle("r.mode")) === "pages", "in pages");
    const lines = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"] [data-part="reader-parallel"]')].map((line) => ({
          text: line.textContent,
          lang: line.lang,
          after: Number([...(line.previousElementSibling?.querySelectorAll(".lx-w") ?? [])].at(-1)?.dataset.i ?? -1),
          under: line.previousElementSibling?.getAttribute("data-part") ?? line.previousElementSibling?.tagName.toLowerCase(),
        })),
      );
    let shown = await lines();
    assert(JSON.stringify(shown.map(({ text, after }) => ({ text, after }))) === JSON.stringify(made.lines), `the English lines in order, each after its sentence's or page's last word: ${JSON.stringify(shown.slice(0, 3))}…, want ${JSON.stringify(made.lines.slice(0, 3))}…`);
    assert(shown.every((l) => l.lang === "en") && shown[0].under === "reader-heading", `in English, the title's under its heading: ${JSON.stringify(shown[0])}`);
    // The book's own words are all there, each once (a paragraph split where a line goes in, never a word lost or doubled).
    const words = await page.evaluate(() => [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"] .lx-w')].map((w) => Number(w.dataset.i)));
    assert(words.length === new Set(words).size && words.length === made.words, `every word once: ${words.length} of ${made.words}`);
    // On as a help layer's English is (the same switch's default), and the settings have nothing of a help layer's or a weave's.
    if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
    await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
    await sheetStill();
    const sheetWords = (await page.locator(`${READER} [data-part="sheet"]:not([hidden])`).first().innerText()).replace(/\s+/g, " ");
    assert(/English translation/.test(sheetWords) && !/English help|woven in|Your words|Words you already know|You know \d+/.test(sheetWords), `the settings: ${sheetWords}`);
    const toggle = page.getByRole("switch", { name: "English translation" });
    assert(await toggle.isChecked(), "on with nothing kept, as English help is");
    await page.keyboard.press("Escape");
    await sheetStill();
    // Every page with the English in, from the first to the last: no line of it cut by the page's edge.
    const cut = () =>
      page.evaluate(() => {
        const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
        const text = root.querySelector('[data-part="reader-text"]');
        const top = text.getBoundingClientRect().top + parseFloat(getComputedStyle(text).paddingTop);
        const h = root.lxReader.pageRanges[root.lxReader.page][2];
        return [...text.querySelectorAll('[data-part="reader-parallel"]')]
          .map((line) => line.getBoundingClientRect())
          .filter((q) => q.height && q.top < top + h - 1 && q.bottom > top + 1 && (q.top < top - 1 || q.bottom > top + h + 1))
          .map((q) => [Math.round(q.top), Math.round(q.bottom)]);
      });
    const pagesOn = await handle("r.pages");
    for (let k = 0; ; k++) {
      const straddling = await cut();
      assert(!straddling.length, `page ${k + 1}: an English line cut by its edge ${JSON.stringify(straddling)}`);
      if ((await handle("r.page")) >= pagesOn - 1) break;
      await page.keyboard.press("ArrowRight");
      await waitTurn();
    }
    await shot("66-parallel-lines");
    // Mid-book, on a page that goes on from the one before (its book page's second, with the English in), switched off and on again from
    // the settings: the first word on it stays on the page, both ways.
    const ranges = await handle("r.pageRanges");
    const goesOn = ranges.map(([a], k) => (made.starts.includes(a) ? null : k)).filter((k) => k !== null);
    assert(goesOn.length, `the made-up book's pages run onto a second with their English in: ${JSON.stringify(ranges.map(([a, b]) => [a, b]))}`);
    const target = goesOn.reduce((best, k) => (Math.abs(k - pagesOn / 2) < Math.abs(best - pagesOn / 2) ? k : best));
    while ((await handle("r.page")) > target) {
      await page.keyboard.press("ArrowLeft");
      await waitTurn();
    }
    const [mark] = await handle("r.pageRanges[r.page]");
    const flip = async () => {
      if (await zen()) await page.locator(`${READER} [data-part="reader-collapse"]`).click();
      await page.locator(`${READER} [data-part="reader-settings-button"]`).click();
      await sheetStill();
      await toggle.click();
      await page.waitForTimeout(400);
      await page.keyboard.press("Escape");
      await sheetStill();
      return handle("({ pages: r.pages, range: r.pageRanges[r.page] })");
    };
    const off = await flip();
    shown = await lines();
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("lx.reader.v1") || "{}").weave?.es?.helpOn);
    assert(!shown.length && kept === false, `off: ${shown.length} lines, helpOn ${kept}`);
    assert(off.pages < pagesOn && off.range[0] <= mark && mark <= off.range[1], `off, word ${mark} still on the page: ${JSON.stringify(off)} (${pagesOn} pages on)`);
    const on = await flip();
    assert((await lines()).length === made.lines.length, "on again: every line");
    assert(on.pages === pagesOn && on.range[0] <= mark && mark <= on.range[1], `on again, word ${mark} still on the page: ${JSON.stringify(on)}`);
    // A tap on an English line opens nothing (it isn't the book's words).
    const visible = await page.evaluate(() => {
      const box = [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"] [data-part="reader-parallel"]')]
        .map((l) => l.getBoundingClientRect())
        .find((q) => q.height && q.top > 120 && q.bottom < innerHeight - 80);
      return box ? { x: box.left + Math.min(40, box.width / 2), y: box.top + box.height / 2 } : null;
    });
    assert(visible, "an English line on this page to tap");
    await page.mouse.click(visible.x, visible.y);
    await page.waitForTimeout(500);
    assert(!(await page.locator(`${READER} [data-part="word-popover"]`).count()), "a tap on the English opened a word's card");
    // About this book: the translation's own credit and license.
    const about = await page.evaluate(() => [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-credits"] p')].map((p) => p.textContent));
    assert(about.includes("Its English translation: The big river, written for the check, CC BY 4.0."), `About: ${JSON.stringify(about)}`);
    return `${made.lines.length} lines (${made.lines.length - 1} by sentence, 1 a page whole), every word once, none cut over ${pagesOn} pages; off at word ${mark}: ${off.pages} pages, still on the page; on: ${on.pages}, still on it`;
  } finally {
    await page.evaluate(
      async ([learning, prefs, book]) => {
        if (learning == null) localStorage.removeItem("lx.learning.v1");
        else localStorage.setItem("lx.learning.v1", learning);
        if (prefs == null) localStorage.removeItem("lx.reader.v1");
        else localStorage.setItem("lx.reader.v1", prefs);
        if (book) await (await import("/js/read/store.js")).removeBook(book);
      },
      [learningBefore, prefsBefore, id],
    );
    await page.goto(`${BASE}/app/#read`);
    await page.reload();
    await page.waitForSelector("html[data-app-ready]");
  }
});

// A picture book on a short phone (7 Nov: on Safari's iPhone SE, "De rode regenjas" ran to 16 pages, four of them a picture alone): in WebKit
// at 375 × 548 (the SE's Safari with its bars), every picture shares its page with words (reader.js fitPictures: down to 40% of its room alone,
// 72 px at least), and where its words don't all fit, its first whole paragraphs stay with it and the rest go on. Then a picture book with its
// English beside (a parallel layer, made here from that book's own pictures, pages of 3 to 6 long sentences): never a sentence parted from its
// English by a turn (a break only after an English block), the one picture alone the page whose English goes whole after its last line.
await stage("a picture book on Safari's iPhone SE (375 × 548, WebKit): every picture shares its page with words, 72 px at least, its words going on where they don't all fit; with its English beside, no sentence parted from its English by a turn", async () => {
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const meta = (catalogue?.books ?? []).find((b) => /regenjas/i.test(b.title ?? "")) ?? (catalogue?.books ?? []).find((b) => b.pictures);
  if (!meta) return "no picture book in the library (skipped)";
  const engine = await webkit.launch({ headless: true });
  let step = "opening";
  try {
    const { cookies } = await context.storageState();
    const phone = await engine.newContext({ viewport: { width: 375, height: 548 }, deviceScaleFactor: 2, hasTouch: true, storageState: { cookies, origins: [] } });
    const wk = await phone.newPage();
    // While the check itself reloads the page, WebKit reports each of the app's own fetches it cuts short as an access-control error
    // (and the stopped page's "Context is stopped"); nothing a person meets, and Chromium reports none. Every other error counts.
    wk.on("pageerror", (e) => {
      if (step === "reloading" && /due to access control checks|Context is stopped/.test(e.message)) return;
      problems.push(`page error (WebKit, SE, ${step}): ${e.message}`);
    });
    await wk.goto(`${BASE}/app/#read`);
    await wk.waitForSelector("html[data-app-ready]", { timeout: 20_000 });
    await wk.evaluate((lang) => localStorage.setItem("lx.learning.v1", JSON.stringify({ lang, from: "en" })), meta.lang ?? "nl");
    step = "reloading";
    await wk.reload();
    await wk.waitForSelector("html[data-app-ready]", { timeout: 20_000 });
    step = "opening the book";
    await openShelfBook(wk, meta.title);
    await wk.waitForSelector(`${READER}[data-ready]`, { timeout: 30_000 });
    await wk.waitForFunction(() => [...document.querySelectorAll('[data-part="reader-picture"] img')].every((img) => img.complete), null, { timeout: 20_000 }).catch(() => {});
    await wk.waitForTimeout(800);
    // Every page in turn: a picture with no words on it, an English block on another page than the sentence it follows, each picture's height.
    const walk = async () => {
      // From the first page.
      for (let i = 0; i < 80 && (await wk.evaluate(() => document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.page)) > 0; i++) {
        await wk.keyboard.press("ArrowLeft");
        await waitTurn(wk);
      }
      const total = await wk.evaluate(() => document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.pages);
      const lone = [];
      const parted = [];
      const small = new Set();
      for (let n = 0; n < total; n++) {
        const seen = await wk.evaluate(() => {
          const text = document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"]');
          const box = text.getBoundingClientRect();
          const covers = [...document.querySelectorAll(".lx-reader-cover")].map((c) => c.getBoundingClientRect());
          const on = (node) => {
            const r = node.getBoundingClientRect();
            const mid = r.top + r.height / 2;
            return r.height > 0 && r.bottom > box.top + 2 && r.top < box.bottom - 2 && !covers.some((c) => mid > c.top && mid < c.bottom);
          };
          const figures = [...text.querySelectorAll('[data-part="reader-picture"]')];
          const shown = figures.filter(on);
          // A sentence and its English: its last word on the page, its English whole on it (inside the band, under no cover), and an English
          // block seen at all only with that word on the page. (A block cut by the page's edge is parted too: its middle alone can be on.)
          const whole = (node) => {
            const r = node.getBoundingClientRect();
            return r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1 && !covers.some((c) => r.bottom > c.top + 1 && r.top < c.bottom - 1);
          };
          const seen = (node) => {
            const r = node.getBoundingClientRect();
            return r.height > 0 && r.bottom > box.top + 1 && r.top < box.bottom - 1 && !covers.some((c) => r.top >= c.top - 1 && r.bottom <= c.bottom + 1);
          };
          const parted = [];
          for (const line of text.querySelectorAll('[data-part="reader-parallel"]')) {
            const last = line.previousElementSibling ? [...line.previousElementSibling.querySelectorAll(".lx-w")].pop() : null;
            if (last && ((on(last) && !whole(line)) || (seen(line) && !on(last)))) parted.push(line.textContent.trim().slice(0, 30));
          }
          return {
            alone: shown.length && ![...text.querySelectorAll(".lx-w")].some(on) ? shown.map((f) => figures.indexOf(f)) : [],
            small: shown.filter((f) => f.getAttribute("data-fit") === "with-text" && f.querySelector("img").getBoundingClientRect().height < 72 - 0.5).map((f) => figures.indexOf(f)),
            parted,
          };
        });
        lone.push(...seen.alone);
        if (seen.parted.length) parted.push(`page ${n + 1}: ${seen.parted.join(" | ")}`);
        for (const k of seen.small) small.add(k);
        if (n < total - 1) {
          await wk.keyboard.press("ArrowRight");
          await waitTurn(wk);
        }
      }
      return { total, lone, parted, small: [...small] };
    };
    step = "reading it";
    const book = await walk();
    await wk.screenshot({ path: join(OUT, "shots", "70-se-picture-book-last.png") });
    assert(!book.lone.length && !book.small.length, `${meta.title} at 375 × 548: ${book.total} pages, a picture alone (picture ${book.lone.map((k) => k + 1).join(", ") || "none"}), under 72 px: ${book.small.map((k) => k + 1).join(", ") || "none"}`);
    // The same pictures in a picture book with its English beside.
    step = "making the English one";
    const made = await wk.evaluate(async () => {
      const store = await import("/js/read/store.js");
      const f = await import("/js/read/book-format.js");
      const books = await store.listBooks();
      const source = books.find((b) => /regenjas/i.test(b.title ?? "")) ?? books[0];
      const got = source ? await store.getBook(source.id) : null;
      const pictures = got?.text?.pictures ?? [];
      const counts = [3, 6, 5, 6, 4, 6, 5, 6, 3].slice(0, pictures.length);
      if (counts.length < 3) return { problems: [`only ${pictures.length} pictures to reuse`] };
      const lang = "es";
      const S = [
        ["El niño se despierta temprano y mira por la ventana de su cuarto.", "The boy wakes up early in the morning, before anyone else in the house, and looks out of the small window of his bedroom at the quiet street below."],
        ["El cielo está gris y unas nubes grandes cubren las montañas.", "The sky is grey and big clouds cover the mountains."],
        ["Su madre prepara el desayuno en la cocina mientras canta una canción.", "Downstairs his mother is making breakfast in the kitchen, and while she cuts the bread and warms the milk she sings an old song she learned as a girl."],
        ["Él quiere salir a jugar con su abrigo rojo nuevo.", "He wants to go out and play in his new red coat."],
        ["Pero la madre dice que todavía no llueve y que debe esperar.", "But his mother laughs and tells him that it isn't raining yet, so the new coat must wait in the hall until the first drops really start to fall."],
        ["El niño espera junto a la puerta, con el abrigo en las manos.", "The boy waits by the door, with the coat in his hands."],
      ];
      const pages = [[["El abrigo rojo", "The red coat"]], ...counts.map((n, k) => Array.from({ length: n }, (_, i) => S[(i + k) % S.length]))];
      const words = [];
      const paras = [];
      const bookPages = [];
      pages.forEach((sentences, k) => {
        const first = paras.length;
        for (const [es] of sentences) {
          const these = f.tokenize(es, lang);
          paras.push({ k: k ? "p" : "h", s: words.length, e: words.length + these.length });
          words.push(...these);
        }
        bookPages.push({ s: paras[first].s, e: paras[paras.length - 1].e, picture: k ? k - 1 : null });
      });
      const text = {
        format: "lexicommons-book", v: 1, id: "check-parallel-pictures", version: "", title: "El abrigo rojo", authors: [], lang,
        source: { kind: "paste" }, rights: { us: false, eu: false, basis: "made for the check", licence: "CC0-1.0" },
        words, italic: [], paras, chapters: [], sentences: f.segmentSentences(words, paras, lang), pages: bookPages, pictures: pictures.slice(0, counts.length),
      };
      text.version = await f.bookVersion(text);
      const whole = 6; // this page's English doesn't line up: it goes whole after its last line
      const english = pages.flatMap((sentences, k) => sentences.map(([, en]) => (k === whole ? null : en)));
      const layer = {
        format: "lexicommons-weave", v: 1, kind: "parallel", book: text.id, bookVersion: text.version, from: lang, to: "en",
        licence: "CC BY 4.0", spdx: "CC-BY-4.0", credit: "The red coat, written for the check",
        source: { ref: "https://example.org/stories/en/red-coat", title: "The red coat" },
        made: { pipeline: "reader-check", sha256: "0".repeat(64), at: "2026-11-07T23:00" },
        pages: pages.map((sentences) => sentences.map(([, en]) => en).join(" ")),
        sentences: text.sentences.map((_, x) => english[x] ?? null),
      };
      const problems = [...(await f.validateBook(text)), ...(await f.validateWeave(layer, text))];
      if (!problems.length) await store.addBook(text, { en: layer });
      return { id: text.id, problems, whole: whole - 1 };
    });
    assert(!made.problems?.length, `the made-up picture book and its English: ${(made.problems ?? []).join(" | ")}`);
    try {
      await wk.evaluate(() => {
        localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: "es", from: "en" }));
        const prefs = JSON.parse(localStorage.getItem("lx.reader.v1") || "{}");
        if (prefs.weave) delete prefs.weave.es;
        localStorage.setItem("lx.reader.v1", JSON.stringify(prefs));
      });
      step = "reloading";
      await wk.goto(`${BASE}/app/#read/book/${encodeURIComponent(made.id)}`);
      await wk.reload();
      await wk.waitForSelector(`${READER}[data-ready]`, { timeout: 30_000 });
      step = "opening the English one";
      await wk.waitForFunction(() => [...document.querySelectorAll('[data-part="reader-picture"] img')].every((img) => img.complete), null, { timeout: 20_000 }).catch(() => {});
      await wk.waitForTimeout(800);
      step = "reading the English one";
      const lines = await wk.evaluate(() => document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-parallel"]').length);
      const beside = await walk();
      await wk.screenshot({ path: join(OUT, "shots", "71-se-picture-book-beside-last.png") });
      assert(lines > 0, "the English beside the book is shown");
      assert(!beside.parted.length, `a sentence parted from its English by a turn: ${beside.parted.join(" ; ")}`);
      assert(beside.lone.every((k) => k === made.whole), `a picture alone other than the page whose English goes whole: picture ${beside.lone.map((k) => k + 1).join(", ")}`);
      assert(!beside.small.length, `a picture under 72 px: ${beside.small.map((k) => k + 1).join(", ")}`);
      // PLANT: a band too short for a sentence and its English to share a page (375 × 250: a band of about 119 px, the longest pair about 148):
      // pages.js has to part them, and the walk must say so.
      await wk.setViewportSize({ width: 375, height: 250 });
      await wk.waitForTimeout(900);
      const planted = await walk();
      await wk.setViewportSize({ width: 375, height: 548 });
      assert(planted.parted.length, `PLANT: at 375 × 250 no sentence was seen parted from its English, so the check can't see one (${planted.total} pages)`);
      return `${meta.title}: ${book.total} pages, every picture with words, none under 72 px; with its English beside (${lines} English blocks): ${beside.total} pages, no sentence parted from its English, alone only the page whose English goes whole; PLANT at 375 × 250 caught (${planted.parted.length} pages part one)`;
    } finally {
      await wk.evaluate(async (id) => (await import("/js/read/store.js")).removeBook(id), made.id).catch(() => {});
    }
  } finally {
    step = "closing";
    await engine.close();
  }
});

await stage("delete the test account: the device's texts go too", async () => {
  // A text, so there's something to delete.
  await page.evaluate(async () => {
    const { bookFromText } = await import("/js/read/import-text.js");
    const store = await import("/js/read/store.js");
    await store.addBook(await bookFromText("One more text.", { title: "Left behind" }));
  });
  problemsBeforeDelete = problems.length;
  await page.goto(`${BASE}/app/#settings/account`);
  await page.waitForSelector('[data-part="page-title"]');
  await page.getByText("Delete my account").click();
  await page.getByText("Press again to delete it for good").click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  const left = await page.evaluate(async () => (await (await import("/js/read/store.js")).listBooks()).length);
  assert(left === 0, `${left} texts left`);
  return "signed out, no texts left";
});

await stage("no console errors", async () => {
  const after = problems.slice(problemsBeforeDelete).filter((p) => !/status of 401/.test(p));
  const real = [...problems.slice(0, problemsBeforeDelete), ...after];
  assert(real.length === 0, real.join(" | "));
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "reader-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
