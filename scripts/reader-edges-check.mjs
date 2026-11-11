// The reader's edge cases from a review of reader.js and pages.js (6 Nov 2026), on a phone in Chrome, each a stage that failed
// before its fix:
//   a note being written kept when you leave by the browser's Back; a page drag's listeners gone with the reader; a place in a
//   flipped sentence opened in scroll at that sentence; a flipped sentence taller than a page read whole across pages; text
//   before a book's first chapter reachable; a picture-only page drawn; a picture page opened (and laid out again) on itself;
//   More opening the word you tapped in a flipped sentence; a highlight inside a flipped sentence painted, with its ✦.
// The crafted books are the design page's demo text (read/demo-sample.js) mounted in the page with openReader, nothing saved;
// the note is a real text in a new account's library. LOCAL only (it signs up and deletes the account).
// Usage: node scripts/reader-edges-check.mjs http://localhost:<port> <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const [BASE, OUT = "reader-edges-out"] = process.argv.slice(2);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("usage: node scripts/reader-edges-check.mjs http://localhost:<port> <outDir> (a local server: it signs up and deletes an account)");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });
setTimeout(() => {
  console.error("ceiling: 8 minutes");
  process.exit(3);
}, 8 * 60_000).unref();

const results = [];
async function stage(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${String(error?.message ?? error).split("\n")[0]}`);
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
// The window's pointer listeners, by type, so a stage can see which a press left behind.
await context.addInitScript(() => {
  const live = new Map();
  const add = window.addEventListener.bind(window);
  const remove = window.removeEventListener.bind(window);
  const key = (type) => (/^pointer(move|up|cancel)$/.test(type) ? type : null);
  window.addEventListener = function (type, fn, options) {
    if (key(type)) (live.get(type) ?? live.set(type, new Set()).get(type)).add(fn);
    return add(type, fn, options);
  };
  window.removeEventListener = function (type, fn, options) {
    if (key(type)) live.get(type)?.delete(fn);
    return remove(type, fn, options);
  };
  window.__pointerListeners = () => [...live.entries()].flatMap(([type, set]) => [...set].map((fn) => ({ type, fn })));
  let tag = 0;
  window.__tagPointerListeners = () => {
    tag++;
    for (const { fn } of window.__pointerListeners()) fn.__tag ??= tag;
    return tag;
  };
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const shot = (name) => page.screenshot({ path: join(OUT, "shots", `${name}.png`) });
const READER = '[data-part="reader"]:not([data-ghost])';

await stage("sign up with a passkey, land in the app", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Edge Reader");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]");
  return "signed in";
});

/**
 * The demo text mounted in the page with openReader (nothing saved): in Dutch, every word known (each sentence flipped) when
 * knowAll; chapters, pages and pictures in place of the book's own when given; opened at `word` in `mode`.
 */
async function mount({ knowAll = false, weave = true, mode = "scroll", word = 0, highlights = [], chapters = null, pages = null, pictures = null } = {}) {
  await page.evaluate(
    async (o) => {
      const { openReader } = await import("/js/read/reader.js");
      const { demoChecked } = await import("/js/read/demo-sample.js");
      const { book, weave } = await demoChecked("nl");
      if (o.chapters) book.chapters = o.chapters;
      if (o.pages) Object.assign(book, { pages: o.pages, pictures: o.pictures });
      document.querySelector('[data-part="reader"]:not([data-ghost])')?.lxReader?.end();
      let host = document.getElementById("edges-host");
      if (!host) {
        host = document.createElement("div");
        host.id = "edges-host";
        document.body.append(host);
      }
      const lemmas = new Set();
      for (const s of weave.sentences) {
        for (const t of s.t) if (t[1]) lemmas.add(t[1]);
        for (const m of s.m) if (m[3]) lemmas.add(m[3]);
      }
      openReader(host, { book, weave: o.weave ? weave : null, know: new Set(o.knowAll ? lemmas : []), mode: o.mode, word: o.word, highlights: o.highlights });
    },
    { knowAll, weave, mode, word, highlights, chapters, pages, pictures },
  );
  await page.waitForSelector(`${READER} [data-part="reader-text"] .lx-w`, { timeout: 15_000 });
  await page.waitForTimeout(700);
}
const demo = () =>
  page.evaluate(async () => {
    const { demoChecked } = await import("/js/read/demo-sample.js");
    const { book, weave } = await demoChecked("nl");
    return { words: book.words, paras: book.paras, sentences: book.sentences, weave: weave.sentences.map(({ s, e, t, m, text }) => ({ s, e, t, m, text })) };
  });
const endReader = () => page.evaluate(() => document.querySelector('[data-part="reader"]:not([data-ghost])')?.lxReader?.end());

await stage("a note being written is kept when you leave by the browser's Back (end() keeps it, as closing its sheet does)", async () => {
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]");
  const id = await page.evaluate(async () => {
    const { bookFromText } = await import("/js/read/import-text.js");
    const store = await import("/js/read/store.js");
    const { newHighlight, saveHighlight } = await import("/js/read/highlights.js");
    const text = await bookFromText("The first line of a short text.\n\nIts second paragraph says a little more, so there is something to read.", { title: "Notes kept", lang: "en" });
    await store.addBook(text);
    await saveHighlight(newHighlight({ book: text.id, version: text.version, start: 1, end: 2, quote: "first line", note: "as it was" }));
    return text.id;
  });
  await page.evaluate((id) => (location.hash = `#read/book/${encodeURIComponent(id)}`), id);
  await page.waitForSelector(`${READER}[data-ready]`, { timeout: 30_000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.showSheet("note"));
  const field = page.locator(`${READER} [data-part="reader-note"] textarea`);
  await field.waitFor({ timeout: 5000 });
  await field.fill("written, then Back");
  await shot("01-note-written");
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('[data-part="reader"]:not([data-ghost])'), null, { timeout: 10_000 });
  let note = null;
  for (let t = 0; t < 30 && note !== "written, then Back"; t++) {
    note = await page.evaluate(async (id) => (await (await import("/js/read/highlights.js")).highlightsOf(id))[0]?.note ?? null, id);
    if (note !== "written, then Back") await page.waitForTimeout(100);
  }
  assert(note === "written, then Back", `the note after Back: "${note}"`);
  return `kept: "${note}"`;
});

await stage("a page drag's window listeners go with the reader (a press held as Back closes it leaves none behind)", async () => {
  const id = await page.evaluate(async () => (await (await import("/js/read/store.js")).listBooks()).find((b) => b.title === "Notes kept")?.id);
  await page.evaluate((id) => (location.hash = `#read/book/${encodeURIComponent(id)}`), id);
  await page.waitForSelector(`${READER}[data-ready]`, { timeout: 30_000 });
  await page.waitForTimeout(600);
  const mode = await page.evaluate(() => document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.mode);
  const before = await page.evaluate(() => window.__tagPointerListeners());
  const box = await page.locator(`${READER} [data-part="reader-text"]`).boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await page.mouse.down();
  const held = await page.evaluate((before) => window.__pointerListeners().filter(({ fn }) => fn.__tag === undefined || fn.__tag > before).length, before);
  await page.goBack();
  await page.waitForFunction(() => !document.querySelector('[data-part="reader"]:not([data-ghost])'), null, { timeout: 10_000 });
  const left = await page.evaluate(() => window.__pointerListeners().filter(({ fn }) => fn.__tag === undefined).map(({ type }) => type));
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 4 });
  await page.mouse.up();
  assert(mode === "pages", `the reader in pages: ${mode}`);
  assert(held > 0, `the press took the window's pointer (${held} listeners), so the stage tests something`);
  assert(left.length === 0, `listeners left behind with the reader gone: ${left.join(", ")}`);
  return `${held} while held, none after Back`;
});

await stage("opened in scroll at a word inside a flipped sentence: that sentence on the reading line, not the chapter's top", async () => {
  await page.setViewportSize({ width: 390, height: 360 });
  const { sentences } = await demo();
  const [s, e] = sentences[sentences.length - 1];
  const word = s + Math.floor((e - s) / 2);
  await mount({ knowAll: true, mode: "scroll", word });
  const seen = await page.evaluate((s) => {
    const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
    const text = root.querySelector('[data-part="reader-text"]');
    const carrier = text.querySelector(`[data-part="reader-sentence"][data-i="${s}"]`);
    const box = text.getBoundingClientRect();
    const r = carrier?.getBoundingClientRect();
    return { flipped: carrier?.getAttribute("data-state"), top: r ? Math.round(r.top - box.top) : null, bottom: r ? Math.round(r.bottom - box.top) : null, height: Math.round(box.height), scrolled: Math.round(text.scrollTop) };
  }, s);
  await shot("03-scroll-flipped");
  await endReader();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(seen.flipped === "flipped", `the last sentence flipped: ${JSON.stringify(seen)}`);
  assert(seen.scrolled > 0 && seen.top < seen.height && seen.bottom > 0, `the sentence in view: ${JSON.stringify(seen)}`);
  return `scrolled ${seen.scrolled}px, the sentence at ${seen.top}–${seen.bottom} of ${seen.height}`;
});

await stage("in Pages a flipped sentence taller than the page is read whole: each of its lines shown on some page", async () => {
  // A small phone held sideways's height, so the longest sentence with its line under it is taller than a page.
  await page.setViewportSize({ width: 320, height: 220 });
  const { sentences } = await demo();
  const [s] = sentences[sentences.length - 1];
  await mount({ knowAll: true, mode: "pages", word: 0 });
  const count = await page.evaluate(() => document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.pages);
  // Each page: the carrier's line boxes wholly inside the page's window (between the covers, inside the text's box).
  const linesOn = () =>
    page.evaluate((s) => {
      const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
      const text = root.querySelector('[data-part="reader-text"]');
      const carrier = text.querySelector(`[data-part="reader-sentence"][data-i="${s}"]`);
      if (!carrier) return { lines: [], shown: [] };
      const tb = text.getBoundingClientRect();
      const style = getComputedStyle(text);
      let top = tb.top + parseFloat(style.paddingTop);
      let bottom = tb.bottom - parseFloat(style.paddingBottom);
      for (const cover of text.querySelectorAll(".lx-reader-cover")) {
        const r = cover.getBoundingClientRect();
        if (!r.height || getComputedStyle(cover).display === "none") continue;
        if (r.bottom <= (top + bottom) / 2) top = Math.max(top, r.bottom);
        else bottom = Math.min(bottom, r.top);
      }
      const range = document.createRange();
      range.selectNodeContents(carrier);
      const flow = text.querySelector(".lx-reader-flow").getBoundingClientRect();
      const rows = [];
      for (const r of range.getClientRects()) {
        if (!r.width || !r.height) continue;
        const row = rows.find((x) => Math.abs(x.top - r.top) <= 3);
        if (row) row.bottom = Math.max(row.bottom, r.bottom);
        else rows.push({ top: r.top, bottom: r.bottom });
      }
      return { lines: rows.map((r) => Math.round(r.top - flow.top)), shown: rows.filter((r) => r.top >= top - 1 && r.bottom <= bottom + 1).map((r) => Math.round(r.top - flow.top)) };
    }, s);
  const all = new Set();
  const shown = new Set();
  let height = 0;
  for (let n = 0; n < count; n++) {
    if (n) {
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => !document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.turning, null, { timeout: 5000 });
      await page.waitForTimeout(120);
    }
    const seen = await linesOn();
    for (const y of seen.lines) all.add(y);
    for (const y of seen.shown) shown.add(y);
    if (n === 0) height = await page.evaluate((s) => Math.round(document.querySelector(`[data-part="reader-sentence"][data-i="${s}"]`)?.getBoundingClientRect().height ?? 0), s);
  }
  const pageH = await page.evaluate(() => Math.round(document.querySelector('[data-part="reader"]:not([data-ghost]) [data-part="reader-text"]').clientHeight));
  await shot("04-pages-tall-sentence");
  await endReader();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(height > pageH * 0.9, `the sentence (${height}px) taller than the page (${pageH}px), so the stage tests something`);
  const missed = [...all].filter((y) => !shown.has(y));
  assert(all.size > 2 && !missed.length, `lines never wholly on a page: ${missed.length} of ${all.size} (at ${missed.join(", ")})`);
  return `${all.size} lines of a ${height}px sentence on ${count} pages of ${pageH}px, every one shown whole`;
});

await stage("text before a book's first chapter can be read: it opens there, and Contents lists it", async () => {
  const { words, paras } = await demo();
  await mount({ weave: false, mode: "scroll", word: 0, chapters: [{ title: "The second paragraph", para: 1 }] });
  const seen = await page.evaluate((first) => {
    const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
    const flow = root.querySelector(".lx-reader-flow").textContent.replace(/\s+/g, " ");
    return { first: flow.includes(first), chapter: root.lxReader.chapter };
  }, words.slice(paras[0].s, paras[0].s + 3).join(" "));
  const contents = await page.evaluate(() => {
    const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
    root.lxReader.showSheet("contents");
    return [...root.querySelectorAll('[data-part="sheet"][aria-label="Contents"] [data-part="list-row"] .lx-row-title')].map((n) => n.textContent);
  });
  await shot("05-before-first-chapter");
  await endReader();
  assert(seen.first, `the first paragraph on the page: ${JSON.stringify(seen)}`);
  assert(contents.length === 2 && contents[1] === "The second paragraph", `Contents: ${contents.join(" | ")}`);
  return `the opening, then "${contents[1]}"`;
});

// A picture from the open library (a picture book's), for the picture pages.
const picture = await page.evaluate(async () => {
  const catalog = await (await fetch("/library/catalogue.json")).json();
  for (const entry of catalog.books ?? []) {
    if (!(entry.pictures > 0) || typeof entry.book !== "string") continue;
    const text = await (await fetch(entry.book)).json().catch(() => null);
    const found = text?.pictures?.find((p) => p.file && p.w && p.h);
    if (found) return { file: found.file, alt: found.alt ?? "A picture", w: found.w, h: found.h };
  }
  return null;
});
const picturePages = async () => {
  const { words, paras } = await demo();
  return { pages: [{ s: 0, e: 0, picture: 0 }, { s: 0, e: paras[0].e, picture: null }, { s: paras[1].s, e: words.length, picture: null }], pictures: [picture] };
};

await stage("a picture-only page (s = e) is drawn, before the text page that starts at the same word", async () => {
  assert(picture, "no picture in this server's open library");
  await mount({ weave: false, mode: "scroll", word: 0, ...(await picturePages()) });
  const figures = await page.locator(`${READER} [data-part="reader-text"] [data-part="reader-picture"]`).count();
  await shot("06-picture-only-page");
  await endReader();
  assert(figures === 1, `pictures drawn: ${figures}`);
  return "its picture drawn";
});

await stage("a picture page opens on itself, and stays on itself when laid out again (its text page too)", async () => {
  assert(picture, "no picture in this server's open library");
  await mount({ weave: false, mode: "pages", word: 0, ...(await picturePages()) });
  const state = () =>
    page.evaluate(() => {
      const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
      return { page: root.lxReader.page, ranges: root.lxReader.pageRanges.map(([a, b]) => [a, b]) };
    });
  const opened = await state();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-part="reader"]:not([data-ghost]) [data-part="reader-picture"] img')].every((i) => i.complete), null, { timeout: 10_000 }).catch(() => {});
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(500);
  const resized = await state();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() => !document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.turning, null, { timeout: 5000 });
  const turned = await state();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  const back = await state();
  await shot("07-picture-page");
  await endReader();
  assert(opened.ranges.length >= 2 && opened.ranges[0][1] < opened.ranges[0][0] && opened.ranges[1][0] === opened.ranges[0][0], `the picture's page, then its text's from the same word: ${JSON.stringify(opened.ranges)}`);
  assert(opened.page === 0, `opened at word 0 on page ${opened.page}, not the picture's (0)`);
  assert(resized.page === 0, `laid out again on the picture's page: page ${resized.page}`);
  assert(turned.page === 1 && back.page === 1, `the text page stays itself when laid out again: ${turned.page} → ${back.page}`);
  return `opened on the picture (0 of ${opened.ranges.length}), kept through a resize; the text page (1) kept too`;
});

await stage("More opens the word you tapped in a flipped sentence (fijnst, fijn), not its English word's whole entry", async () => {
  const { weave } = await demo();
  const target = weave.find((x) => x.m.some((m) => m[0] === "fijnst."));
  await mount({ knowAll: true, mode: "scroll", word: target.s });
  const word = page.locator(`${READER} [data-part="reader-sentence"][data-i="${target.s}"] [data-lemma="fijn"]`).first();
  await word.scrollIntoViewIfNeeded();
  await word.click();
  const popover = page.locator('[data-part="word-popover"]');
  await popover.waitFor({ timeout: 5000 });
  await popover.getByRole("button", { name: "More", exact: true }).click();
  const card = page.locator(`${READER} [data-part="word-card"]`);
  await card.waitFor({ timeout: 5000 });
  const head = (await card.locator(".lx-card-head strong").first().textContent()).trim();
  const lemma = (await card.locator(".lx-card-lemma").first().textContent().catch(() => "")).trim();
  await shot("08-more-flipped");
  await endReader();
  assert(head === "fijnst" && lemma === "fijn", `the card: "${head}" / "${lemma}"`);
  return `"${head}" / "${lemma}"`;
});

await stage("a highlight inside a flipped sentence is painted on the sentence that shows it, with its ✦", async () => {
  const { weave } = await demo();
  const target = weave.find((x) => x.m.some((m) => m[0] === "fijnst."));
  const inside = target.s + 2;
  await mount({ knowAll: true, mode: "scroll", word: target.s, highlights: [{ start: inside, end: inside, note: "inside a flipped sentence" }] });
  const seen = await page.evaluate((s) => {
    const root = document.querySelector('[data-part="reader"]:not([data-ghost])');
    const carrier = root.querySelector(`[data-part="reader-sentence"][data-i="${s}"]`);
    const painted = [...root.querySelectorAll("[data-highlight]")].filter((n) => n.getClientRects().length && !n.hidden);
    const mark = root.querySelector('[data-part="reader-note-mark"]');
    return { flipped: carrier?.getAttribute("data-state"), painted: painted.length, onCarrier: painted.some((n) => carrier?.contains(n)), mark: Boolean(mark), markShown: mark ? !mark.hidden && mark.getClientRects().length > 0 : false };
  }, target.s);
  await shot("09-highlight-flipped");
  await endReader();
  assert(seen.flipped === "flipped", `the sentence flipped: ${JSON.stringify(seen)}`);
  assert(seen.painted > 0 && seen.onCarrier, `the highlight painted on the sentence: ${JSON.stringify(seen)}`);
  assert(seen.mark && seen.markShown, `its ✦ shown: ${JSON.stringify(seen)}`);
  return `painted on the sentence, ✦ shown`;
});

await stage("delete the account", async () => {
  await page.goto(`${BASE}/app/#settings/account`);
  await page.waitForSelector('[data-part="page-title"]');
  await page.getByText("Delete my account").click();
  await page.getByText("Press again to delete it for good").click();
  await page.waitForURL(/\/login/, { timeout: 30_000 });
  return "deleted";
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.join(" | "));
});

writeFileSync(join(OUT, "reader-edges-check.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
