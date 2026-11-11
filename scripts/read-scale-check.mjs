// Read at scale, in Chrome on a phone screen, from a new account: Find a book (read/find.js) on the server's own catalog
// and on 960 books (the server's, then made-up ones from scripts/fixtures/read-catalog.mjs, served in its place):
// the counts, the first 40 and every next 40 to the end in title order, searching titles and people past case and
// accents (the field and its address), the Level and Kind sheets by real presses, alone and together and back to any,
// nothing found and the way back; covers (a book's own picture, its own drawing, else its title cover; no picture on two
// books, with a control showing that can fail); Read's kind shelves' All going to Find a book for the kind; a book
// opened from Find a book kept in your library and listed first. Your library (read/library.js): nothing yet said, then
// 31 books: Read's row with its All, the page's search as you type and its Recent, Title and Progress orders. Offline:
// the catalog this device kept, said on Read and on Find a book; a book in your library opens; any other says it needs a
// connection in words, from Find a book and from Read's shelf; with nothing kept, it says the first time needs one.
// What it expects is worked out here from the catalog and the device's own records, never from the page's code.
// LOCAL only: it signs up a test account.
// Usage: node scripts/read-scale-check.mjs http://localhost:<port> <outDir>   (exit 0 = pass)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";
import { scaledCatalog } from "./fixtures/read-catalog.mjs";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/read-scale-check.mjs http://localhost:<port> <outDir> [--swap <path under public>=<file>] (a local server only: it signs up a test account)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DRAWINGS = new Set(Object.keys(JSON.parse(readFileSync(join(APP, "public/pictures/manifest.json"), "utf8")).pictures));

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
// No service worker: offline here is the network gone under a page that's already open, as on a phone with the app up.
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true });
// The catalog: the server's own (served = null), or one served in its place.
let served = null;
await context.route("**/library/catalogue.json", (route) => (served ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(served) }) : route.continue()));
// --swap <path under public>=<file>: the app with files as they were, to see a stage fail on them.
for (let i = process.argv.indexOf("--swap"); i >= 0; i = process.argv.indexOf("--swap", i + 1)) {
  const [path, file] = process.argv[i + 1].split("=");
  await context.route(`**/${path}*`, (route) => route.fulfill({ path: file, contentType: path.endsWith(".css") ? "text/css" : "text/javascript" }));
}
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const results = {};
let failed = 0;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
const same = (got, want, what) => assert(JSON.stringify(got) === JSON.stringify(want), `${what}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);
async function stage(name, fn) {
  try {
    results[name] = { ok: true, note: (await fn()) ?? "" };
    console.log(`PASS ${name}: ${results[name].note}`);
  } catch (error) {
    failed++;
    results[name] = { ok: false, note: String(error.stack ?? error) };
    console.log(`FAIL ${name}: ${error.message}`);
    await page.screenshot({ path: `${OUT}/fail-${Object.keys(results).length}.png` }).catch(() => {});
  }
}
const shot = async (name) => {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Read Scale Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
await page.waitForSelector("html[data-app-ready]");
const real = await page.evaluate(async () => (await fetch("/library/catalogue.json", { cache: "no-store" })).json());
const learning = await page.evaluate(async () => (await import("/js/study/learning.js")).learning());
if (learning !== "nl" || (real.books ?? []).length < 2) {
  console.error(`read-scale-check needs Dutch as the new account's language and a catalog with at least two books (it has ${real.books?.length ?? 0}).`);
  process.exit(2);
}

// ---------- what it expects, from the catalog alone ----------
const plain = (text) => String(text ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const byTitle = (a, b) => (a.title < b.title ? -1 : 1);
// A Dutch learner's books (read/readable.js): a book in Dutch, with help or plain, or one woven into Dutch.
const forDutch = (m) => m.lang === "nl" || Object.entries(m.layers ?? {}).some(([lang, layer]) => layer.kind === "weave" && lang === "nl");
const helped = (m) => m.lang === "nl" && Object.values(m.layers ?? {}).some((layer) => layer.kind === "help");
const pictured = (m) => (Array.isArray(m.pictures) ? m.pictures.length : Number(m.pictures) || 0) > 0;
// (Non-fiction before a picture book: a book that says it's non-fiction is that, pictures or not; shelf.js bookKinds.)
const kindOf = (m) => (!forDutch(m) ? "other" : m.kind === "nonfiction" ? "nonfiction" : pictured(m) ? "picture" : m.layers?.nl?.kind === "weave" ? "woven" : helped(m) ? "help" : "plain");
const KIND_NAMES = { picture: "Picture books", nonfiction: "Non-fiction", woven: "Woven into Dutch", help: "In Dutch, with help", plain: "In Dutch", other: "Other languages" };
// What Find a book finds: among the books a Dutch learner can read (read/readable.js, as Home and Read count them), the other languages'
// only when that kind is asked for.
const found = (books, { q = "", level = "", kind = "", mine = new Set() } = {}) =>
  books
    .filter((m) => (kind ? kindOf(m) === kind : forDutch(m)) && (!q || plain(m.title).includes(plain(q)) || (m.authors ?? []).some((a) => plain(a.name).includes(plain(q)))) && (!level || String(m.level) === level))
    .sort((a, b) => Number(mine.has(b.id)) - Number(mine.has(a.id)) || byTitle(a, b));
const countLine = (n, shown) => (n ? `${n.toLocaleString("en")} ${n === 1 ? "book" : "books"}${n > shown ? `, the first ${shown.toLocaleString("en")} here` : ""}` : null);
// A cover's picture: its own (an img), its own drawing (data-picture), or none (its title cover).
const pictureOf = (m) => (m.cover ? `img:${new URL(m.cover, BASE).href}` : DRAWINGS.has(`book-${m.id}`) ? `drawing:book-${m.id}` : null);
// The pictures a set of covers shows more than once (the control below shows this finds one).
const repeated = (pictures) => [...new Set(pictures.filter((p, i) => p && pictures.indexOf(p) !== i))];

// ---------- getting around ----------
async function go(hash) {
  if ((await page.evaluate(() => location.hash)) === hash) await page.evaluate(() => (location.hash = "#today"));
  await page.evaluate((h) => (location.hash = h), hash);
}
const findAt = (hash) => `.lx-read-findpage[data-for="${hash}"][data-ready]`;
async function openFind(hash) {
  await go(hash);
  await page.waitForSelector(findAt(hash), { timeout: 20_000 });
  await page.waitForTimeout(400); // the page's slide in
  return findAt(hash);
}
// What Find a book shows: its count, its rows (title, line, picture), its filters and its press for more.
async function findShows(F) {
  return page.evaluate((F) => {
    const root = document.querySelector(F);
    return {
      count: root.querySelector(".lx-read-count")?.textContent ?? "",
      note: root.querySelector(".lx-read-note")?.textContent ?? "",
      rows: [...root.querySelectorAll("li[data-book]")].map((li) => {
        const face = li.querySelector('[data-part="book-cover"]');
        const img = face?.querySelector("img");
        return { id: li.dataset.book, title: li.querySelector(".lx-row-title")?.textContent, sub: li.querySelector(".lx-row-sub")?.textContent ?? "", picture: img ? `img:${img.src}` : face?.dataset.picture ? `drawing:${face.dataset.picture}` : null, type: face?.dataset.variant };
      }),
      filters: [...root.querySelectorAll(".lx-read-filters [data-part='button']")].map((b) => b.getAttribute("aria-label")),
      more: root.querySelector(".lx-read-more [data-part='button']")?.textContent.trim() ?? null,
    };
  }, F);
}
// Drawings arrive after the rows: wait for each row that should have one.
async function drawingsIn(F, books) {
  const want = books.filter((m) => !m.cover && DRAWINGS.has(`book-${m.id}`)).map((m) => m.id);
  for (const id of want) await page.waitForSelector(`${F} li[data-book="${id}"] [data-part="book-cover"][data-picture]`, { timeout: 10_000 });
}
const press = async (locator) => {
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
};
const sheetRow = (title) => page.locator('.lx-sheet-layer:not([hidden]) [data-part="sheet"] label[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }) });
const sheetOptions = () => page.locator('.lx-sheet-layer:not([hidden]) [data-part="sheet"] label[data-part="list-row"] .lx-row-title').allTextContents();
const store = (fn, arg) => page.evaluate(async ([body, arg]) => new Function("store", "arg", `return (${body})(store, arg)`)(await import("/js/read/store.js"), arg), [fn.toString(), arg]);
const myIds = async () => new Set((await store((s) => s.listBooks())).map((b) => b.id));

// ---------- nothing yet ----------
await stage("nothing yet: Read has no Your library, only Add a book or text at its foot; Your library's page offers Find a book", async () => {
  await go("#read");
  // Drawn: the shelf's covers and the way to add your own. Your library isn't there until it holds something: no heading, no line, no room.
  await page.waitForFunction(() => document.querySelector(".lx-read-shelf [data-part='book-tile']") && document.querySelector("[data-read-add]")?.getClientRects().length, null, { timeout: 15_000 });
  const yours = await page.evaluate(() => {
    const section = document.querySelector(".lx-read-texts");
    return { children: section?.childElementCount ?? -1, height: Math.round(section?.getBoundingClientRect().height ?? -1) };
  });
  assert(yours.children === 0 && yours.height === 0, `Your library with nothing in it: ${JSON.stringify(yours)}`);
  await shot("01-read-nothing-yet");
  await go("#read/library");
  const L = '.lx-read-library-page[data-for="#read/library"][data-ready]';
  await page.waitForSelector(L, { timeout: 15_000 });
  assert(!(await page.locator(`${L} [data-part="search-field"]`).count()), "a search with nothing to search");
  assert(!(await page.locator(`${L} [data-part="segmented"]`).count()), "a sort with nothing to sort");
  assert(/Nothing here yet/.test(await page.locator(`${L} [data-part="empty-state"]`).textContent()), "its empty state");
  await shot("02-library-nothing-yet");
  await press(page.locator(`${L} [data-part="button"]`, { hasText: "Find a book" }));
  await page.waitForFunction(() => location.hash === "#read/find");
  return "Read: no Your library, Add a book or text at its foot; the page: no search or sort, Find a book goes there";
});

// ---------- the book up front, from the catalog ----------
// How long Read's place up front stays held (a skeleton of its last height) after it's on the page, and what it settles to.
const upFront = () =>
  page.evaluate(async () => {
    // Up to 30 s for the page to start (a busy machine), then timed from the moment the place is on the page.
    let appeared = null;
    const until = performance.now() + 30_000;
    while (performance.now() < until) {
      const box = document.querySelector(".lx-library-continue");
      if (box) {
        appeared ??= performance.now();
        if (!box.querySelector('[data-part="skeleton"]')) return { after: Math.round(performance.now() - appeared), card: box.querySelector('[data-part="continue-card"]')?.getAttribute("aria-label") ?? null, empty: !box.children.length };
        if (performance.now() - appeared > 8000) break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    return appeared ? { after: Math.round(performance.now() - appeared), card: null, empty: false, held: true } : null;
  });
const startAt = async (lang) => {
  await page.evaluate((l) => localStorage.setItem("lx.learning.v1", JSON.stringify({ lang: l, from: "en" })), lang);
  // A start in that language (a hash alone would keep the page): measured from its first frames.
  await page.evaluate(() => history.replaceState(history.state, "", "#read"));
  await page.reload({ waitUntil: "commit" });
  return upFront();
};
await stage("the book up front comes with the shelf; with none for the language it's gone at once, never held empty", async () => {
  served = null;
  const first = real.books.filter(forDutch);
  const dutch = await startAt("nl");
  assert(dutch?.card?.startsWith("A good first book:") && dutch.after < 1000, `Dutch: ${JSON.stringify(dutch)}`);
  // Each start without a book follows one with it, so the place is held (a skeleton of the box's height) when it starts.
  // Swedish: no open book for it (other languages' only), so nothing up front, at once.
  const swedish = await startAt("sv");
  await startAt("nl");
  // Its card drawn, so its height is kept for the next start.
  await page.waitForSelector(".lx-library-continue [data-part='continue-card']", { timeout: 15_000 });
  await page.waitForTimeout(300);
  assert(swedish && !swedish.card && swedish.empty && swedish.after < 1000, `Swedish: ${JSON.stringify(swedish)}`);
  // No open books at all (a server without the open library, so a device that never kept a catalog with books from it: Read draws its first
  // frame from the catalog the device kept, shelf.js keptCatalog, its cache lx-read-catalog-v1): nothing up front, at once. It held an empty
  // box 4 s before.
  served = { ...real, books: [], shelf: [] };
  const held = await page.evaluate(() => Boolean(JSON.parse(localStorage.getItem("lx.shapes.v1") ?? "{}")["read.continue"]));
  await page.evaluate(() => caches.delete("lx-read-catalog-v1"));
  const none = await startAt("nl");
  served = null;
  assert(none && !none.card && none.empty && none.after < 1000, `no books at all: ${JSON.stringify(none)}`);
  assert(held, "the place up front wasn't held for the start without books (nothing to time)");
  // A device that kept the catalog with its books, on a server that now has none: the kept book is up front in the first frame (what the
  // device has), and goes as soon as the fresh catalog says there are none.
  await startAt("nl");
  await page.waitForSelector(".lx-library-continue [data-part='continue-card']", { timeout: 15_000 });
  served = { ...real, books: [], shelf: [] };
  await startAt("nl");
  const gone = await page
    .waitForFunction(() => {
      const box = document.querySelector(".lx-library-continue");
      return Boolean(box) && !box.children.length;
    }, null, { timeout: 5000 })
    .then(() => true, () => false);
  served = null;
  assert(gone, "kept with its books, on a server now with none: the book up front stayed");
  await startAt("nl");
  await page.waitForSelector("html[data-app-ready]");
  return `Dutch: "${dutch.card.replace("A good first book: ", "")}" after ${dutch.after} ms (of ${first.length} for Dutch); Swedish: nothing, after ${swedish.after} ms; no books: nothing, after ${none.after} ms`;
});

// ---------- Find a book on the server's own catalog ----------
await stage("none for your language (Swedish): Read and Find a book say so with Tinta on a box, Find a book offers the other languages' books (its search their count, its levels theirs, no Kind) and Home's card says none yet; for Dutch, the first book offered is the easiest (a curator's own first, then by level and length)", async () => {
  served = null;
  const NONE = "No books in Swedish yet. These are free to read in other languages.";
  const searchSays = (n) => `Search ${n.toLocaleString("en")} ${n === 1 ? "book" : "books"}`;
  await startAt("sv");
  await page.waitForSelector(".lx-read-none-yet", { timeout: 15_000 });
  const read = await page.evaluate(() => {
    const none = document.querySelector('[data-part="page"]:not([data-ghost]) .lx-read-none-yet');
    return { words: none?.textContent.trim(), tinta: Boolean(none?.querySelector("[data-part='character'][data-state='box']")), search: document.querySelector('[data-part="page"]:not([data-ghost]) .lx-read-find input')?.placeholder };
  });
  same(read, { words: NONE, tinta: true, search: searchSays(real.books.length) }, "Read, learning Swedish");
  const F = await openFind("#read/find");
  const find = await page.evaluate((F) => {
    const root = document.querySelector(F);
    const none = root.querySelector(".lx-read-none-yet");
    return { words: none?.hidden ? null : none?.textContent.trim(), tinta: Boolean(none?.querySelector("[data-part='character'][data-state='box']")), search: root.querySelector("input")?.placeholder };
  }, F);
  same(find, { words: NONE, tinta: true, search: searchSays(real.books.length) }, "Find a book, learning Swedish");
  const shows = await findShows(F);
  const all = [...real.books].sort((a, b) => (a.title < b.title ? -1 : 1));
  same(shows.count, countLine(all.length, Math.min(40, all.length)), "Find a book's count: the other languages' books");
  same(shows.rows.map((r) => r.id), all.slice(0, 40).map((m) => m.id), "Find a book's books: the other languages', by title");
  const levels = [...new Set(real.books.map((m) => m.level).filter(Number.isFinite))].sort((a, b) => a - b);
  same(shows.filters, levels.length ? ["Level: Any"] : [], "its filters: Level (their levels), no Kind");
  if (levels.length) {
    await press(page.locator(`${F} .lx-read-filters [data-part='button'][aria-label="Level: Any"]`));
    same(await sheetOptions(), ["Any", ...levels.map((n) => `Level ${n}`)], "the Level sheet: the levels of the books it offers");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
  }
  // Home's card, with nothing to read in Swedish yet.
  await go("#today");
  const card = page.locator('[data-part="page"]:not([data-ghost]) [data-part="home-card"][data-variant="book"]');
  await card.waitFor({ timeout: 15_000 });
  // The card says what the catalog says once it's in (before, it names the language's books in general).
  await page.waitForFunction(() => /No books in/.test(document.querySelector('[data-part="page"]:not([data-ghost]) [data-part="home-card"][data-variant="book"] .lx-hb-page')?.textContent ?? ""), null, { timeout: 15_000 }).catch(() => {});
  // Each of the page's parts (its heading, then its line), joined by a space as they're read.
  const page2 = await card.locator(".lx-hb-page").evaluate((p) => [...p.children].map((c) => c.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).join(" "));
  assert(page2 === "No books in Swedish yet Add a text of your own, or read in another language.", `Home's card, learning Swedish: ${page2}`);
  // Dutch: the first book offered and Home's To start with, the easiest first (a curator's own ahead of them).
  const forNl = real.books.filter(forDutch);
  const curated = [...new Set((real.shelf ?? []).flatMap((section) => section.books ?? []))].map((id) => forNl.find((m) => m.id === id)).filter(Boolean);
  const level = (m) => (Number.isFinite(m.level) ? m.level : Infinity);
  const easiest = [...curated, ...forNl.filter((m) => !curated.includes(m)).sort((a, b) => level(a) - level(b) || (a.words ?? 0) - (b.words ?? 0) || (a.title < b.title ? -1 : 1))];
  // Coming from a language with none, Read's place up front isn't held: the card is drawn once the shelf is.
  await startAt("nl");
  const firstCard = page.locator(".lx-library-continue [data-part='continue-card']");
  await firstCard.waitFor({ timeout: 15_000 });
  same(await firstCard.getAttribute("aria-label"), `A good first book: ${easiest[0].title}`, "Dutch: the first book offered");
  await go("#today");
  await card.locator(".lx-hb-list li").first().waitFor({ timeout: 15_000 });
  const start = await card.locator(".lx-hb-list li:not([hidden])").allTextContents();
  same(start, easiest.slice(0, start.length).map((m) => m.title), "Dutch: Home's To start with, the easiest first");
  assert(start.length >= 1, "Dutch: Home's To start with has a book");
  return `Swedish: said on Read and Find a book with Tinta, ${all.length} books in other languages offered (levels ${levels.join(", ") || "none"}), Home's card says none yet; Dutch: "${easiest[0].title}" first, then ${start.slice(1).join(", ")}`;
});

await stage("Home's To start with: only whole titles, as many as fit, never one cut at the page's foot (French titles run to two lines, a planted one longer still), at 390 and 320", async () => {
  const like = real.books.find((m) => m.cover) ?? real.books[0];
  // Five French books in the order Home offers them (level 1, shortest first): the planted long title third, so among the first four.
  const titles = ["Compter les animaux", "J’aime lire", "Une histoire bien trop longue pour tenir sur les deux lignes que lui laisse la page du livre", "La poule et le millepatte", "Le crocodile qui voulait manger le soleil"];
  const french = titles.map((title, k) => ({ ...like, id: `fr-start-${k}`, title, lang: "fr", layers: {}, level: 1, words: 10 + k }));
  served = { ...real, shelf: [], books: [...real.books, ...french] };
  const notes = [];
  try {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await startAt("fr");
      await go("#today");
      const card = page.locator('[data-part="page"]:not([data-ghost]) [data-part="home-card"][data-variant="book"]');
      await card.locator(".lx-hb-list li").first().waitFor({ timeout: 15_000 });
      await page.evaluate(() => document.querySelector('[data-part="page"]:not([data-ghost]) [data-part="home-card"][data-variant="book"]').scrollIntoView({ block: "center" }));
      await page.waitForTimeout(1200);
      const fit = await card.evaluate((c) => {
        const box = c.querySelector(".lx-hb-page");
        return {
          room: box.clientHeight,
          items: [...box.querySelectorAll(".lx-hb-list li")].map((li) => ({ text: li.textContent.trim(), shown: !li.hidden && li.offsetHeight > 0, foot: li.offsetTop + li.offsetHeight })),
        };
      });
      const shown = fit.items.filter((item) => item.shown);
      assert(shown.length >= 1, `${width}: no title shown at all: ${JSON.stringify(fit)}`);
      assert(shown.every((item) => item.foot <= fit.room + 0.5), `${width}: a title cut at the page's foot (room ${fit.room}): ${JSON.stringify(shown.map((item) => [item.text.slice(0, 24), item.foot]))}`);
      const gap = fit.items.findIndex((item) => !item.shown);
      assert(gap === -1 || fit.items.slice(gap).every((item) => !item.shown), `${width}: the titles shown are the first ones, in order: ${JSON.stringify(fit.items.map((item) => item.shown))}`);
      await shot(`07-start-with-${width}`);
      notes.push(`${width}: ${shown.length} of ${fit.items.length} whole`);
    }
  } finally {
    served = null;
    await page.setViewportSize({ width: 390, height: 844 });
    await startAt("nl");
  }
  return notes.join("; ");
});

await stage(`Find a book on the server's catalog: ${real.books.length} books, their lines, covers and kinds`, async () => {
  served = null;
  const F = await openFind("#read/find");
  await drawingsIn(F, real.books);
  const shows = await findShows(F);
  const want = found(real.books);
  same(shows.count, countLine(want.length, want.length), "the count");
  same(shows.rows.map((r) => r.id), want.map((m) => m.id), "the books, in title order");
  same(shows.rows.map((r) => r.picture), want.map(pictureOf), "each cover: its own picture, its own drawing, or its title cover");
  for (const [i, m] of want.entries()) {
    const sub = shows.rows[i].sub.replace(/\s/g, " "); // a level and a length are kept together by no-break spaces
    if (m.level) assert(sub.includes(`Level ${m.level}`), `${m.title}: no level in "${sub}"`);
    if (m.words) assert(sub.includes(`${m.words.toLocaleString("en")} words`), `${m.title}: no length in "${sub}"`);
  }
  same(shows.more, null, "no press for more when they're all here");
  await shot("03-find-server");
  // The Kind sheet offers the kinds there are, and only those.
  await press(page.locator(`${F} .lx-read-filters [data-part='button'][aria-label="Kind: Any"]`));
  const kinds = Object.keys(KIND_NAMES).filter((k) => real.books.some((m) => kindOf(m) === k));
  same(await sheetOptions(), ["Any", ...kinds.map((k) => KIND_NAMES[k])], "the Kind sheet's choices");
  await page.keyboard.press("Escape");
  return `${shows.count}; kinds ${kinds.join(", ")}`;
});

// ---------- 960 books ----------
const big = scaledCatalog(real, 960);
await stage("960 books: the ones a Dutch learner can read, the first 40, then 40 more at a time to the end, in title order", async () => {
  served = big;
  const F = await openFind("#read/find");
  const want = found(big.books);
  assert(want.length < big.books.length, "the 960 hold books in other languages, so the two counts differ");
  let shows = await findShows(F);
  same(shows.count, countLine(want.length, 40), "the count");
  same(shows.rows.map((r) => r.id), want.slice(0, 40).map((m) => m.id), "the first 40");
  same(shows.more, "Show 40 more", "the press for more");
  await shot("04-find-960");
  let presses = 0;
  while (shows.more) {
    await press(page.locator(`${F} .lx-read-more [data-part='button']`));
    presses++;
    const shown = Math.min(want.length, 40 * (presses + 1));
    await page.waitForFunction(([F, n]) => document.querySelectorAll(`${F} li[data-book]`).length === n, [F, shown]);
    shows = await findShows(F);
    same(shows.count, countLine(want.length, shown), `the count after ${presses} presses`);
    assert(presses < 30, "more presses than 960 books need");
  }
  same(presses, Math.ceil(want.length / 40) - 1, `presses to see all ${want.length}`);
  same(shows.rows.map((r) => r.id), want.map((m) => m.id), `all ${want.length}, each once, in title order`);
  return `${presses} presses of Show 40 more, then all 960 and no press`;
});

await stage("covers at 960: a book's own picture, its own drawing, else its title cover; no picture on two books", async () => {
  const F = findAt("#read/find");
  await drawingsIn(F, big.books);
  const shows = await findShows(F);
  const byId = new Map(big.books.map((m) => [m.id, m]));
  same(shows.rows.map((r) => r.picture), shows.rows.map((r) => pictureOf(byId.get(r.id))), "each row's picture");
  same(repeated(shows.rows.map((r) => r.picture)), [], "pictures on more than one book");
  const titled = shows.rows.filter((r) => r.type === "type").length;
  // Read's shelves at 960: every cover's picture once.
  await go("#read");
  await page.waitForFunction(() => document.querySelector(".lx-read-shelf .lx-shelf-section[data-lead] [data-part='book-cover']") && document.querySelector(".lx-read-shelf .lx-shelf-section:not([data-lead]) [data-part='book-cover']"), null, { timeout: 20_000 });
  await page.waitForTimeout(1500);
  const shelf = await page.evaluate(() =>
    [...document.querySelectorAll(".lx-read-shelf .lx-shelf-section [data-part='book-cover']")].map((face) => {
      const img = face.querySelector("img:not([data-part='language-flag'])");
      return img ? `img:${img.src}` : face.dataset.picture ? `drawing:${face.dataset.picture}` : null;
    }),
  );
  // A book in a curated section and in no kind's shelf shows once; one in two curated sections, twice (shelf-sections-check).
  const twice = (real.shelf ?? []).flatMap((s) => s.books).filter((id, i, all) => all.indexOf(id) !== i);
  same(repeated(shelf).filter((p) => !twice.some((id) => p === pictureOf(byId.get(id)))), [], "pictures on Read's shelves more than once");
  return `${shows.rows.length} rows, ${titled} title covers, ${shows.rows.length - titled} with a picture, none twice; Read's ${shelf.length} covers, none twice`;
});

await stage("control: the same picture on two books is caught", async () => {
  // Two books Find a book shows a Dutch learner (another language's aren't there to repeat a picture).
  const [a, b] = real.books.filter(forDutch);
  const pic = real.books.find((m) => m.cover)?.cover ?? "/library/pictures/control.jpg";
  served = { ...real, books: [{ ...a, cover: pic }, { ...b, cover: pic }, ...real.books.filter((m) => m !== a && m !== b)] };
  const F = await openFind("#read/find");
  const shows = await findShows(F);
  const twice = repeated(shows.rows.map((r) => r.picture));
  same(twice, [`img:${new URL(pic, BASE).href}`], "what the control finds");
  served = big;
  return `caught ${twice[0].replace(BASE, "")}`;
});

await stage("search: case and accents, titles and people, from the field and its address", async () => {
  served = big;
  const notes = [];
  for (const q of ["CAFE", "molen", "carroll", "één", "xyzzy"]) {
    const hash = `#read/find?${new URLSearchParams({ q })}`;
    const F = await openFind(hash);
    const shows = await findShows(F);
    const want = found(big.books, { q });
    same(shows.count, countLine(want.length, Math.min(40, want.length)) ?? "No book here has that.", `"${q}": the count`);
    same(shows.rows.map((r) => r.id), want.slice(0, 40).map((m) => m.id), `"${q}": the books`);
    assert(want.length || shows.more === "Show every book", `"${q}": nothing found, and no way back`);
    notes.push(`${q} ${want.length}`);
  }
  assert(found(big.books, { q: "cafe" }).length >= 2 && found(big.books, { q: "carroll" }).length >= 2, "the fixture has accented titles and Carroll's books");
  // Nothing found: Show every book.
  await press(page.locator(`${findAt("#read/find?q=xyzzy")} .lx-read-more [data-part='button']`, { hasText: "Show every book" }));
  await page.waitForFunction(() => location.hash === "#read/find");
  // Typed in Read's field, sent with the keyboard's search key: Find a book with it, and Read's field empty again.
  await go("#read");
  const readField = page.locator(".lx-read-find [data-part='search-field'] input");
  await readField.waitFor({ timeout: 15_000 });
  await readField.fill("molen");
  await readField.press("Enter");
  await page.waitForSelector(findAt("#read/find?q=molen"), { timeout: 15_000 });
  await page.waitForTimeout(800);
  await go("#read");
  await readField.waitFor({ timeout: 15_000 });
  same(await readField.inputValue(), "", "Read's field, back on Read after its search");
  // Typed in Find a book's own field: in place.
  const F = await openFind("#read/find");
  const field = page.locator(`${F} [data-part="search-field"] input`);
  await field.fill("Kat");
  await field.press("Enter");
  await page.waitForSelector(findAt("#read/find?q=Kat"), { timeout: 15_000 });
  await page.waitForTimeout(400);
  same((await findShows(findAt("#read/find?q=Kat"))).rows.map((r) => r.id), found(big.books, { q: "Kat" }).slice(0, 40).map((m) => m.id), "typed Kat");
  await shot("05-find-search");
  // A link to this page's own first address while it's here (the shell keeps it as this page): followed in place.
  await page.evaluate(() => (location.hash = "#read/find"));
  await page.waitForSelector(findAt("#read/find"), { timeout: 15_000 });
  same((await findShows(findAt("#read/find"))).count, countLine(found(big.books).length, 40), "back at its first address, from a link");
  return notes.join(", ") + "; typed Kat";
});

await stage("Level and Kind sheets, by real presses: alone, together, and back to any; in place, with no new page or history", async () => {
  served = big;
  let F = await openFind("#read/find");
  // The page as it is now, marked: a filter changes its list and its address, never the page, and adds nothing to Back.
  await page.evaluate((F) => (document.querySelector(F).dataset.mark = "kept"), F);
  const entries = await page.evaluate(() => history.length);
  await press(page.locator(`${F} .lx-read-filters [data-part='button'][aria-label="Level: Any"]`));
  const levels = [...new Set(big.books.map((m) => m.level).filter(Number.isFinite))].sort((a, b) => a - b);
  same(await sheetOptions(), ["Any", ...levels.map((n) => `Level ${n}`)], "the Level sheet's choices");
  await shot("06-level-sheet");
  await press(sheetRow("Level 2"));
  F = findAt("#read/find?level=2");
  await page.waitForSelector(F, { timeout: 15_000 });
  await page.waitForTimeout(400);
  let shows = await findShows(F);
  let want = found(big.books, { level: "2" });
  same(shows.count, countLine(want.length, 40), "Level 2: the count");
  same(shows.rows.map((r) => r.id), want.slice(0, 40).map((m) => m.id), "Level 2: the books");
  same(shows.filters, ["Level: Level 2", "Kind: Any"], "Level 2: the filters");
  same(await page.locator(`${F} .lx-read-filters [data-part='button']`).first().innerText(), "Level 2", "the Level button says its value");
  await press(page.locator(`${F} .lx-read-filters [data-part='button'][aria-label="Kind: Any"]`));
  await press(sheetRow("In Dutch, with help"));
  F = findAt("#read/find?level=2&kind=help");
  await page.waitForSelector(F, { timeout: 15_000 });
  await page.waitForTimeout(400);
  shows = await findShows(F);
  want = found(big.books, { level: "2", kind: "help" });
  same(shows.count, countLine(want.length, 40), "Level 2, with help: the count");
  same(shows.rows.map((r) => r.id), want.slice(0, 40).map((m) => m.id), "Level 2, with help: the books");
  await shot("07-level-and-kind");
  await press(page.locator(`${F} .lx-read-filters [data-part='button'][aria-label="Level: Level 2"]`));
  await press(sheetRow("Any"));
  F = findAt("#read/find?kind=help");
  await page.waitForSelector(F, { timeout: 15_000 });
  shows = await findShows(F);
  want = found(big.books, { kind: "help" });
  same(shows.count, countLine(want.length, 40), "back to any level: the count");
  same(shows.filters, ["Level: Any", "Kind: In Dutch, with help"], "back to any level: the filters");
  same(await page.evaluate(() => [document.querySelectorAll(".lx-read-findpage").length, document.querySelector(".lx-read-findpage")?.dataset.mark, history.length]), [1, "kept", entries], "one page, the same one, and no new history");
  return `Level 2: ${found(big.books, { level: "2" }).length}; with help too: ${found(big.books, { level: "2", kind: "help" }).length}; any level, with help: ${want.length}`;
});

await stage("Read's shelves at 960: the leading one's All N is the whole kind, going to Find a book for it; every other shelf its covers in a row, and its All N when it has more", async () => {
  served = big;
  await go("#read");
  const section = page.locator(".lx-read-shelf .lx-shelf-section", { has: page.locator("[data-part='section-title']", { hasText: /^Picture books$/ }) });
  await section.waitFor({ timeout: 20_000 });
  const total = big.books.filter((m) => kindOf(m) === "picture").length;
  const all = section.locator("[data-part='section-head'] a");
  same((await all.innerText()).trim(), `All ${total.toLocaleString("en")}`, "Picture books' All");
  await press(all);
  const F = findAt("#read/find?kind=picture");
  await page.waitForSelector(F, { timeout: 15_000 });
  await page.waitForTimeout(400);
  const shows = await findShows(F);
  same(shows.count, countLine(total, 40), "Find a book for picture books");
  same(shows.filters, ["Level: Any", "Kind: Picture books"], "its filters");
  // Every other shelf under the leading one, its covers in a row, and its All with its whole count and its page when it has more than the row
  // shows (no pills cut at the screen's edge): the curated shelves first (one named as a kind is that kind's, counting the whole kind and going
  // to Find a book for it), then each kind with books in no curated shelf (Other languages always).
  await go("#read");
  await page.waitForSelector(".lx-read-shelf .lx-shelf-section:not([data-lead]) [data-part='book-cover']");
  const kindNamed = (title) => Object.keys(KIND_NAMES).find((k) => KIND_NAMES[k].toLowerCase() === title.trim().toLowerCase());
  const curated = (big.shelf ?? []).map((one) => ({ ...one, books: (one.books ?? []).filter((id) => big.books.some((m) => m.id === id && forDutch(m))) })).filter((one) => one.title && one.books.length);
  const placed = new Set(curated.flatMap((one) => one.books));
  const kindTotal = (k) => big.books.filter((m) => kindOf(m) === k).length;
  const shelves = [
    ...curated.map((one) => (kindNamed(one.title) ? [one.title, kindTotal(kindNamed(one.title)), `#read/find?kind=${kindNamed(one.title)}`] : [one.title, one.books.length, `#read/shelf/${encodeURIComponent(one.id)}`])),
    ...Object.keys(KIND_NAMES)
      .filter((k) => !curated.some((one) => kindNamed(one.title) === k) && big.books.some((m) => kindOf(m) === k && (k === "other" || !placed.has(m.id))))
      .map((k) => [KIND_NAMES[k], kindTotal(k), `#read/find?kind=${k}`]),
  ].map(([title, n, href]) => [title, n.toLocaleString("en"), href]);
  same(shelves[0]?.[0], "Picture books", "the leading shelf, as the catalog orders them");
  const drawn = await page.evaluate(() =>
    [...document.querySelectorAll(".lx-read-shelf .lx-shelf-section:not([data-lead])")].map((s) => ({
      title: s.querySelector("[data-part='section-title']")?.textContent,
      covers: s.querySelectorAll("[data-part='book-list'][data-variant='row'] > [data-part='book-tile']").length,
      all: s.querySelector("[data-part='section-link']")?.textContent.trim() ?? null,
      href: s.querySelector("[data-part='section-link']")?.getAttribute("href") ?? null,
    })),
  );
  same(
    drawn.map((s) => [s.title, s.covers > 0, s.all, s.href]),
    shelves.slice(1).map(([title, n, href], i) => {
      const more = Number(n.replace(/,/g, "")) > (drawn[i]?.covers ?? 0);
      return [title, true, more ? `All ${n}` : null, more ? href : null];
    }),
    "every other shelf: its covers in a row, and its All when it has more",
  );
  same(await page.locator(".lx-read-kinds .lx-read-kind").count(), 0, "no pills");
  return `All ${total} → ${shows.count}`;
});

// ---------- a book from Find a book, and Your library at scale ----------
const opened = real.books.filter(forDutch).sort(byTitle)[0];
await stage(`a book opened from Find a book (${opened.title}) is kept in your library and listed first`, async () => {
  served = big;
  const F = await openFind(`#read/find?${new URLSearchParams({ q: opened.title })}`);
  await press(page.locator(`${F} li[data-book="${opened.id}"] [data-part="list-row"]`));
  await page.waitForFunction((id) => location.hash.startsWith(`#read/book/${encodeURIComponent(id)}`), opened.id, { timeout: 60_000 });
  assert((await myIds()).has(opened.id), "it isn't in your library");
  const G = await openFind("#read/find");
  const shows = await findShows(G);
  same(shows.rows[0]?.id, opened.id, "the first row");
  assert(shows.rows[0].sub.startsWith("In your library"), `its line: ${shows.rows[0].sub}`);
  same(shows.rows.map((r) => r.id), found(big.books, { mine: new Set([opened.id]) }).slice(0, 40).map((m) => m.id), "the rest in title order");
  return `opened, kept, first with "In your library"`;
});

const titles = ["Notities les 4", "Een recept voor stamppot", "Brief van de gemeente", "Artikel over de dijken", "Café aan de gracht", "Mail van Sanne", "De krant van zaterdag", "Woorden van de week"];
await stage("Your library with 31 books: Read's row and its All; the page's search as you type and its orders", async () => {
  await page.evaluate(async (titles) => {
    const { bookFromText } = await import("/js/read/import-text.js");
    const store = await import("/js/read/store.js");
    const body = "Het regent vandaag in de stad. Ik fiets naar de markt en koop brood. De bakker zegt dat het morgen weer zon wordt. ";
    for (let i = 0; i < 30; i++) {
      const title = titles[i] ?? `Tekst ${i + 1}`;
      const book = await bookFromText(body.repeat(2 + (i % 4)), { title, lang: "nl" });
      await store.addBook(book);
      await new Promise((r) => setTimeout(r, 3));
      if (i % 4 === 1) {
        const words = book.words.length;
        await store.setPosition(book.id, Math.floor(((words - 1) * ((i % 9) + 1)) / 10), book.version);
        await store.touchBook(book.id);
      }
    }
  }, titles);
  const books = await store((s) => s.listBooks());
  same(books.length, 31, "books in the library");
  // Read: the one up front, then a row of the others, newest first, and All 31.
  await go("#read");
  await page.waitForFunction(() => document.querySelectorAll(".lx-read-texts [data-part='book-tile']").length > 0, null, { timeout: 15_000 });
  const up = (await page.locator(".lx-library-continue [data-part='continue-card']").first().getAttribute("aria-label"))?.replace(/^Continue reading: /, "");
  const recent = (a, b) => (b.openedAt ?? b.addedAt ?? 0) - (a.openedAt ?? a.addedAt ?? 0);
  const others = books.filter((b) => b.title !== up).sort(recent);
  same(await page.locator(".lx-read-texts .lx-tile-title").allTextContents(), others.slice(0, 12).map((b) => b.title), "Read's row");
  const all = page.locator(".lx-read-texts [data-part='section-head'] a");
  same((await all.innerText()).trim(), "All 31", "Your library's All");
  await shot("08-read-in-use");
  await press(all);
  const L = '.lx-read-library-page[data-for="#read/library"][data-ready]';
  await page.waitForSelector(L, { timeout: 15_000 });
  await page.waitForTimeout(400);
  const tiles = () => page.locator(`${L} .lx-tile-title`).allTextContents();
  same(await tiles(), [...books].sort(recent).map((b) => b.title), "Recent");
  // Search as you type: no key to send it.
  await page.locator(`${L} [data-part="search-field"] input`).pressSequentially("cafe", { delay: 30 });
  await page.waitForTimeout(200);
  same(await tiles(), books.filter((b) => plain(b.title).includes("cafe")).sort(recent).map((b) => b.title), "searched cafe as it's typed");
  await page.locator(`${L} [data-part="search-field"] input`).fill("tekst 1");
  await page.waitForTimeout(200);
  const tekst1 = books.filter((b) => plain(b.title).includes("tekst 1"));
  same(await tiles(), [...tekst1].sort(recent).map((b) => b.title), "searched tekst 1");
  await page.locator(`${L} [data-part="search-field"] input`).fill("");
  await press(page.locator(`${L} [data-part="segment"]`, { hasText: "Title" }));
  same(await tiles(), [...books].sort((a, b) => (plain(a.title) < plain(b.title) ? -1 : 1)).map((b) => b.title), "Title");
  // Progress: how far in, from the device's own places.
  const places = await store(async (s) => Object.fromEntries([...(await s.getPositions())].map(([id, p]) => [id, p.word])));
  const share = (b) => (b.words > 1 ? Math.round(((places[b.id] ?? 0) / (b.words - 1)) * 100) : 0);
  await press(page.locator(`${L} [data-part="segment"]`, { hasText: "Progress" }));
  const byProgress = [...books].sort(recent).sort((a, b) => share(b) - share(a));
  same(await tiles(), byProgress.map((b) => b.title), "Progress");
  assert(share(byProgress[0]) > share(byProgress.at(-1)), "the seeded places differ");
  await shot("09-library-progress");
  return `Read: ${up} up front, 12 in the row, All 31; the page: Recent, cafe ${books.filter((b) => plain(b.title).includes("cafe")).length}, tekst 1 ${tekst1.length}, Title, Progress`;
});

await stage("one page number: a picture book two pages in, Home's card and Read's Continue reading say its page as the reader counts it (its own pages, About's too)", async () => {
  served = null;
  // Not De rode regenjas: the offline stages below need it never opened here.
  const title = "Het is de schuld van de kat";
  if (!real.books.some((m) => m.title === title && m.pictures > 0)) return `no picture book "${title}" on this server (skipped)`;
  await startAt("nl");
  await go(`#read/find?${new URLSearchParams({ q: title })}`);
  const row = page.locator('[data-part="page"]:not([data-ghost]) [data-book] [data-part="list-row"]', { hasText: title }).first();
  await row.waitFor({ timeout: 20_000 });
  await row.click();
  const READER = '[data-part="reader"]:not([data-ghost])';
  await page.waitForSelector(`${READER}[data-ready]`, { timeout: 30_000 });
  await page.waitForTimeout(800);
  for (let k = 0; k < 2; k++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(() => !document.querySelector('[data-part="reader"]:not([data-ghost])').lxReader.turning, null, { timeout: 5000 });
  }
  await page.waitForTimeout(800);
  const status = (await page.locator(`${READER} [data-part="reader-status"]`).textContent()).trim();
  const [n, of] = status.split("/").map(Number);
  assert(n >= 2 && of > n, `the reader's count, two pages in: ${status}`);
  const said = `Page ${n} of ${of}`;
  await go("#today");
  const card = '[data-part="page"]:not([data-ghost]) [data-part="home-card"][data-variant="book"]';
  await page.waitForFunction(([c, t]) => (document.querySelector(c)?.textContent ?? "").includes(t), [card, title], { timeout: 15_000 });
  const home = (await page.locator(card).textContent()).replace(/\s+/g, " ");
  assert(home.includes(said), `Home's card at the reader's ${status}: ${home}`);
  await go("#read");
  const cont = '[data-part="page"]:not([data-ghost]) [data-part="continue-card"]';
  await page.waitForFunction(([c, t]) => (document.querySelector(c)?.textContent ?? "").includes(t), [cont, title], { timeout: 15_000 });
  const read = (await page.locator(cont).first().textContent()).replace(/\s+/g, " ");
  assert(read.includes(said), `Read's card at the reader's ${status}: ${read}`);
  return `the reader ${status}; Home's card and Read's both "${said}"`;
});

await stage("title covers: their words at 4.5:1 on both tones of the split, in color and in monochrome, each paint its own step of the ink; a right-to-left title sits at the right", async () => {
  // A text in Arabic, for its title cover.
  await page.evaluate(async () => {
    const { bookFromText } = await import("/js/read/import-text.js");
    const store = await import("/js/read/store.js");
    await store.addBook(await bookFromText("هذا نص قصير للتجربة. فيه جملتان.", { title: "الحديقة الصغيرة", lang: "ar" }));
  });
  const L = '.lx-read-library-page[data-for="#read/library"][data-ready]';
  // Each title cover's background, the split's deep tone and its words, as pixels (any CSS color, color-mix too), and the words' contrast on
  // each tone (they cross the split), the author's line with its opacity counted.
  const covers = () =>
    page.evaluate((L) => {
      const ctx = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
      const rgb = (color) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      };
      const lum = (c) => c.map((v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
      const ratio = (p, q) => {
        const [a, b] = [lum(p), lum(q)].sort((x, y) => y - x);
        return (a + 0.05) / (b + 0.05);
      };
      const on = (node, ground) => {
        const style = getComputedStyle(node);
        const opacity = Number(style.opacity);
        return ratio(rgb(style.color).map((v, i) => v * opacity + ground[i] * (1 - opacity)), ground);
      };
      return [...document.querySelectorAll(`${L} [data-part="book-cover"][data-variant="type"]`)].map((face) => {
        const bg = rgb(getComputedStyle(face).backgroundColor);
        const split = face.querySelector(".lx-cover-split path");
        const deep = split ? rgb(getComputedStyle(split).fill) : bg;
        const words = [face.querySelector(".lx-cover-title"), face.querySelector(".lx-cover-by")].filter(Boolean);
        return { paint: face.dataset.paint, bg: bg.join(","), deep: deep.join(","), spread: Math.max(...bg) - Math.min(...bg), contrast: Math.min(...words.flatMap((node) => [on(node, bg), on(node, deep)])) };
      });
    }, L);
  await go("#read/library");
  await page.waitForSelector(L, { timeout: 15_000 });
  const colored = await covers();
  assert(colored.some((c) => c.spread > 40), "control: title covers in color without monochrome");
  same(colored.filter((c) => c.contrast < 4.5).map((c) => `${c.paint} ${c.bg}/${c.deep} ${c.contrast.toFixed(2)}`), [], "title covers in color whose words are under 4.5:1 on either tone");
  same([...new Set(colored.map((c) => c.paint))].sort(), ["clay", "sun", "violet"], "the paints among the title covers");
  await page.evaluate(() => (document.documentElement.dataset.art = "theme"));
  try {
    const mono = await covers();
    same(mono.filter((c) => c.spread > 8).map((c) => c.bg), [], "title covers with a color in monochrome");
    same(mono.filter((c) => c.contrast < 4.5).map((c) => `${c.paint} ${c.bg}/${c.deep} ${c.contrast.toFixed(2)}`), [], "title covers in monochrome whose words are under 4.5:1 on either tone");
    // Side by side differing: each paint its own step of the ink, the same for every book in it.
    const steps = Object.fromEntries(["violet", "clay", "sun"].map((paint) => [paint, [...new Set(mono.filter((c) => c.paint === paint).map((c) => c.bg))]]));
    assert(Object.values(steps).every((bgs) => bgs.length === 1) && new Set(Object.values(steps).flat()).size === 3, `the paints' steps in monochrome: ${JSON.stringify(steps)}`);
    await shot("13-library-monochrome");
    // The Arabic title: its block runs right to left, the title and its rule at the cover's right.
    // Where a cover's title words and its rule sit: their distance from the head's right edge (the words' own extent, by a Range).
    const place = (word) =>
      page.evaluate(
        ([L, word]) => {
          const tile = [...document.querySelectorAll(`${L} [data-part="book-tile"]`)].find((t) => t.textContent.includes(word));
          const head = tile?.querySelector(".lx-cover-head");
          if (!head) return null;
          const range = document.createRange();
          range.selectNodeContents(head.querySelector(".lx-cover-title"));
          const right = head.getBoundingClientRect().right;
          return { dir: getComputedStyle(head).direction, title: Math.round(right - range.getBoundingClientRect().right) <= 2, rule: Math.round(right - head.querySelector(".lx-cover-rule").getBoundingClientRect().right) <= 2 };
        },
        [L, word],
      );
    same(await place("الحديقة"), { dir: "rtl", title: true, rule: true }, "the Arabic title cover");
    same(await place("Mail van Sanne"), { dir: "ltr", title: false, rule: false }, "control: a Dutch title cover");
    return `${colored.length} title covers: in color, then in ${new Set(mono.map((c) => c.bg)).size} steps of the ink, each at least ${Math.min(...mono.map((c) => c.contrast)).toFixed(1)}:1; Arabic at the right`;
  } finally {
    await page.evaluate(() => delete document.documentElement.dataset.art);
  }
});

// ---------- offline ----------
await stage("offline: the kept catalog said on Read and Find a book; a book in your library opens; any other says why, in words", async () => {
  served = null;
  // Online once on the server's own, so that's what this device keeps; then on Read as the connection goes.
  await openFind("#read/find");
  await go("#read");
  await page.waitForSelector(".lx-read-shelf .lx-shelf-section", { timeout: 15_000 });
  assert(!(await page.locator(".lx-read-find [data-offline]").count()), "Offline: said while online");
  await context.setOffline(true);
  try {
    // Said where you are, with no going anywhere.
    await page.waitForSelector(".lx-read-find [data-offline]", { timeout: 15_000 });
    await go("#read");
    await page.waitForSelector(".lx-read-find [data-offline]", { timeout: 15_000 });
    const readSays = await page.locator(".lx-read-find [data-offline]").textContent();
    assert(/^Offline:.*needs a connection\.$/.test(readSays), `Read says: ${readSays}`);
    await shot("10-read-offline");
    // Read's shelf: a book not in your library.
    const mine = await myIds();
    const other = real.books.filter(forDutch).find((m) => !mine.has(m.id));
    if (other) {
      await press(page.locator(`.lx-read-shelf [data-part='book-tile'][aria-label^="${other.title.replace(/"/g, '\\"')}:"]`).first());
      const toast = page.locator(".lx-toasts [data-part='toast']");
      await toast.waitFor({ timeout: 15_000 });
      const said = await toast.textContent();
      assert(/needs a connection/.test(said) && !/fetch|Failed|\/library\//.test(said), `Read's shelf says: ${said}`);
    }
    const F = await openFind("#read/find");
    const shows = await findShows(F);
    assert(/^Offline:/.test(shows.note), `Find a book says: ${shows.note}`);
    same(shows.rows.map((r) => r.id), found(real.books, { mine }).map((m) => m.id), "the kept books, yours first");
    if (other) {
      await page.evaluate(() => document.querySelector(".lx-toasts")?.replaceChildren());
      await press(page.locator(`${F} li[data-book="${other.id}"] [data-part="list-row"]`));
      const toast = page.locator(".lx-toasts [data-part='toast']");
      await toast.waitFor({ timeout: 5_000 });
      assert(/needs a connection/.test(await toast.textContent()), `Find a book says: ${await toast.textContent()}`);
      same(await page.evaluate(() => location.hash), "#read/find", "where it stays");
      await shot("11-find-offline-press");
    }
    // A book in your library opens from the device.
    await press(page.locator(`${F} li[data-book="${opened.id}"] [data-part="list-row"]`));
    await page.waitForFunction((id) => location.hash.startsWith(`#read/book/${encodeURIComponent(id)}`), opened.id, { timeout: 15_000 });
    await page.waitForSelector('[data-part="reader"]', { timeout: 20_000 });
    return `Read and Find a book say Offline:; ${other ? `${other.title} says it needs a connection from both; ` : ""}${opened.title} opens`;
  } finally {
    await context.setOffline(false);
  }
});

await stage("back online on Read: the line goes and the shelf is the live one again", async () => {
  await context.setOffline(true);
  await go("#read");
  await page.waitForSelector(".lx-read-find [data-offline]", { timeout: 15_000 });
  await context.setOffline(false);
  await page.waitForFunction(() => !document.querySelector(".lx-read-find [data-offline]") && document.querySelector(".lx-read-shelf .lx-shelf-section"), null, { timeout: 15_000 });
  return "gone, with no going anywhere";
});

await stage("offline with nothing kept: Find a book says the first time needs a connection", async () => {
  await page.evaluate(() => caches.delete("lx-read-catalog-v1"));
  await context.setOffline(true);
  try {
    const F = await openFind("#read/find");
    const shows = await findShows(F);
    assert(/needs a connection the first time/.test(shows.count), `it says: ${shows.count}`);
    same(shows.rows.length, 0, "rows");
    await shot("12-find-nothing-kept");
    return shows.count;
  } finally {
    await context.setOffline(false);
  }
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.join("\n"));
});

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`${Object.keys(results).length - failed}/${Object.keys(results).length} stages passed`);
await browser.close();
process.exit(failed ? 1 : 0);
