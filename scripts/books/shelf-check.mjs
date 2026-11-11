#!/usr/bin/env node
// The open-books shelf, end to end in Chrome against a server: the catalog from /library/, a book's row, opening it
// (the book and each layer fetched and validated in the page by book-format.js), what the shelf hands over, how much
// of it a learner would see at a few known words (a woven book) or which glosses they'd get (a book with help), and a
// picture book's pictures. It mounts public/js/read/shelf.js in a blank page of the
// server's own origin, so it needs no account (on the live site it passes the password gate with the Keychain
// password, like design-check). LOCAL or live; read-only.
//
//   node scripts/books/shelf-check.mjs <baseUrl> <outDir> [--book <id>] [--learning <lang>]
//
// --learning: the language the learner is learning (Dutch by default), so a book woven only for another language
// (Spanish, say) lists and opens for a learner of that one.
//
// Exit 0 = pass. Run through the channel's GPU queue (headless Chrome).

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "../quiet-browser.mjs";

const [base, out] = process.argv.slice(2);
const want = process.argv.includes("--book") ? process.argv[process.argv.indexOf("--book") + 1] : null;
const learningLang = process.argv.includes("--learning") ? process.argv[process.argv.indexOf("--learning") + 1] : "nl";
if (!base || !out) {
  console.error("Usage: shelf-check.mjs <baseUrl> <outDir> [--book <id>]");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const results = [];
const stage = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`  ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    const shelf = await page.evaluate(() => document.getElementById("shelf")?.textContent?.slice(0, 300) ?? "").catch(() => "");
    results.push({ name, ok: false, detail: error.message, shelf, errors: [...errors] });
    console.log(`  FAIL  ${name}: ${error.message.split("\n")[0]}\n        shelf: ${JSON.stringify(shelf)}\n        errors so far: ${JSON.stringify(errors.slice(0, 5))}`);
  }
};

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} (${m.location()?.url ?? ""})`));
page.on("pageerror", (e) => errors.push(String(e)));
page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${new URL(r.url()).pathname}`));

// The live site's password gate, once, with the Keychain password (a local server has none).
await page.goto(new URL("/design/", base).href);
if (page.url().includes("/_gate")) {
  const password = execFileSync("security", ["find-internet-password", "-s", "lexicommons.com", "-a", "site-gate", "-w"], { encoding: "utf8" }).trim();
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/design\/$/, { timeout: 15_000 });
}

// A blank page of the server's origin (robots.txt is always served), with the app's styles.
await page.goto(new URL("/robots.txt", base).href);
await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="/css/lx/tokens.css"><link rel="stylesheet" href="/css/lx/base.css"><link rel="stylesheet" href="/css/lx/components.css"></head><body><main id="shelf"></main></body></html>`, { waitUntil: "load" });

await stage("the catalog", async () => {
  const catalogue = await page.evaluate(async () => (await fetch("/library/catalogue.json")).json());
  if (catalogue.format !== "lexicommons-catalogue" || !catalogue.books?.length) throw new Error("no books in the catalog");
  return `${catalogue.books.length} book(s): ${catalogue.books.map((b) => b.id).join(", ")}`;
});

await stage("the shelf lists it", async () => {
  const name = await page.evaluate(async ([base, lang]) => {
    const { renderShelf } = await import(new URL("/js/read/shelf.js", base).href);
    const { LANGUAGES } = await import(new URL("/js/read/book-format.js", base).href);
    if (!LANGUAGES[lang]) throw new Error(`no language "${lang}"`);
    (await import(new URL("/js/study/learning.js", base).href)).setLearning(lang);
    window.__opened = null;
    // Words a Dutch learner knows, as a stand-in: Dutch's alone (a language with no words known says nothing of how much you'd follow).
    const dutch = new Set(["de", "het", "een", "en", "zij", "was", "zijn", "van", "op", "in"]);
    renderShelf(document.getElementById("shelf"), { open: (record) => (window.__opened = record), known: (known) => (known === "nl" ? dutch : new Set()) });
    return LANGUAGES[lang].name;
  }, [base, learningLang]);
  await page.waitForSelector("#shelf .lx-shelf-section [data-part='book-tile']", { timeout: 10000 });
  // The book this check opens next: its tile, or past the shelf's first covers (each kind's All goes to Find a book, which opens it).
  const catalogue = await page.evaluate(async () => (await fetch("/library/catalogue.json")).json());
  const id = want ?? catalogue.books[0].id;
  const tiled = await page.locator(`#shelf [data-part='book-tile'][data-book="${id}"]`).count();
  // How much you'd follow, said once a layer's looked at: only learning Dutch (the stand-in's words) with a Dutch help or weave book on
  // the shelf (a plain book, or another language's, says nothing of the kind).
  const followable = learningLang === "nl" && catalogue.books.some((b) => Object.entries(b.layers ?? {}).some(([to, layer]) => (layer.kind === "help" && b.lang === "nl") || (layer.kind === "weave" && to === "nl")));
  if (followable) await page.waitForFunction((name) => [...document.querySelectorAll("#shelf .lx-tile-sub")].some((sub) => sub.textContent.includes(`% in ${name} for you`) || /you know \d+%/.test(sub.textContent)), name, { timeout: 10000 });
  await page.screenshot({ path: join(out, "shelf.png"), fullPage: true });
  const tiles = await page.evaluate(() => [...document.querySelectorAll("#shelf [data-part='book-tile']")].map((r) => r.textContent.trim()).join(" | "));
  return `${id} ${tiled ? "on the shelf" : "past its first covers (Find a book opens it)"}${followable ? ", how much you'd follow said" : ""}: ${tiles}`;
});

await stage("opening a book hands over the checked book and its layers", async () => {
  const id = want ?? (await page.evaluate(async () => (await (await fetch("/library/catalogue.json")).json()).books[0].id));
  const entry = await page.evaluate(async (id) => (await (await fetch("/library/catalogue.json")).json()).books.find((b) => b.id === id) ?? null, id);
  if (!entry) throw new Error(`${id} isn't in the catalog`);
  const { title } = entry;
  // By its id (its tile's data-book), not its place or its title: the shelf's sections change the order, a book in two sections shows twice
  // (either tile opens it), and books in different languages share a title (Spanish's Castigo and Portuguese's, the first under Other languages).
  const row = page.locator(`#shelf [data-part='book-tile'][data-book="${id}"]`).first();
  // The shelf shows each kind's first covers, its All N going to Find a book: a book past them is opened from there,
  // searched by its title, as a learner would (its rows open through the same opener as the shelf's tiles).
  let via = "the shelf";
  if (await row.count()) await row.click();
  else {
    via = "Find a book";
    await page.evaluate(async ([base, title]) => {
      const { renderFind } = await import(new URL("/js/read/find.js", base).href);
      location.hash = `#read/find?${new URLSearchParams({ q: title })}`;
      const find = document.getElementById("find") ?? document.body.appendChild(Object.assign(document.createElement("main"), { id: "find" }));
      renderFind(find, { open: (record) => (window.__opened = record), known: () => new Set(["de", "het", "een", "en", "zij", "was", "zijn", "van", "op", "in"]) });
    }, [base, title]);
    await page.locator(`#find [data-book="${id}"]`).first().click({ timeout: 15_000 });
  }
  // Poll with evaluate (a returned Promise would count as true at once in waitForFunction).
  for (let i = 0; i < 100; i++) {
    if (await page.evaluate(() => Boolean(window.__opened))) break;
    await page.waitForTimeout(100);
  }
  const record = await page.evaluate(() => window.__opened && { meta: window.__opened.meta.id, version: window.__opened.book.version, words: window.__opened.book.words.length, layers: Object.fromEntries(Object.entries(window.__opened.weaves).map(([lang, w]) => [lang, { kind: w.kind, sentences: w.sentences.length, bookVersion: w.bookVersion }])) });
  if (!record) throw new Error("open() was never called");
  if (record.meta !== id) throw new Error(`opened ${record.meta}, not ${id}`);
  for (const [lang, layer] of Object.entries(record.layers)) if (layer.bookVersion !== record.version) throw new Error(`the ${lang} layer is for another version`);
  // The layers its catalog entry names, every one (none for a plain book: the open library publishes plain books too).
  const named = Object.keys(entry.layers ?? {}).sort().join(",");
  if (Object.keys(record.layers).sort().join(",") !== named) throw new Error(`its layers came as ${Object.keys(record.layers).join(", ") || "none"}; the catalog names ${named || "none"}`);
  return `${JSON.stringify(record)}, opened from ${via}`;
});

await stage("the reader's render, in the page, follows what you know", async () => {
  const counts = await page.evaluate(async (base) => {
    const { weaveAt, helpSentence, validateWeave, LANGUAGES } = await import(new URL("/js/read/book-format.js", base).href);
    const { book, weaves } = window.__opened;
    const weave = Object.values(weaves)[0];
    if (weave.kind === "parallel") {
      // A person's translation beside the book (reader.js besideParts): no words to know, so nothing follows a bank. What the reader shows
      // is each sentence's English where its page lines up, else the page's: every page with words has one or the other, never both.
      const problems = await validateWeave(weave, book);
      let bySentence = 0;
      let whole = 0;
      let missing = 0;
      book.pages.forEach((page, p) => {
        if (page.e <= page.s) return;
        const inside = book.sentences.map(([s, e], x) => (s >= page.s && e <= page.e ? x : -1)).filter((x) => x >= 0);
        const given = inside.filter((x) => typeof weave.sentences[x] === "string").length;
        if (given && given === inside.length) bySentence += given;
        else if (!given && weave.pages[p]) whole++;
        else missing++;
      });
      return { kind: "parallel", problems: problems.slice(0, 3), bySentence, whole, missing, lang: LANGUAGES[weave.to]?.name ?? weave.to };
    }
    const lemmas = [...new Set(weave.sentences.flatMap((s) => s.t.map(([, l]) => l).filter(Boolean)))];
    const bank = new Set(lemmas.slice(0, Math.ceil(lemmas.length / 2)));
    let shown = 0;
    let silent = 0;
    if (weave.kind === "help") {
      // A book in the language you're learning: every word reads as itself; one you don't know carries its gloss to
      // show on a tap, one you know carries none.
      let glossed = 0;
      let wrong = 0;
      weave.sentences.forEach((sentence) => helpSentence(sentence, book.words, bank).words.forEach((piece) => {
        if (!piece.lemma) return;
        if (piece.show !== "book" || (bank.has(piece.lemma) ? piece.help !== null : !piece.help)) wrong++;
        else if (piece.help) glossed++;
        else shown++;
      }));
      return { kind: "help", shown, glossed, wrong, bank: bank.size };
    }
    weaveAt(book, weave, bank).forEach((view, x) => view.words.forEach((piece, j) => {
      const lemma = weave.sentences[x].t[j][1];
      if (lemma && bank.has(lemma)) {
        if (piece.show === "target") shown++;
        else if (!view.idioms.some(({ k, len }) => j > k && j < k + len)) silent++;
      }
    }));
    return { kind: "weave", shown, silent, bank: bank.size, lang: LANGUAGES[weave.to]?.name ?? weave.to };
  }, base);
  if (counts.kind === "parallel") {
    if (counts.problems.length || counts.missing) throw new Error(`its ${counts.lang} translation: ${counts.missing} page(s) with neither their sentences' English nor their own; ${counts.problems.join("; ")}`);
    return `parallel: ${counts.bySentence} sentences with their ${counts.lang} under them, ${counts.whole} page(s) with theirs whole (nothing follows a bank)`;
  }
  if (counts.kind === "help") {
    if (counts.wrong) throw new Error(`${counts.wrong} word(s) carried a gloss though known, or none though unknown`);
    return `help: ${counts.shown} known words read plain, ${counts.glossed} unknown ones carry a gloss, at a bank of ${counts.bank} lemmas`;
  }
  if (counts.silent) throw new Error(`${counts.silent} known word(s) didn't show in ${counts.lang}`);
  return `${counts.shown} known words shown in ${counts.lang} at a bank of ${counts.bank} lemmas, 0 silent`;
});

await stage("a picture book's pictures load, each the size the book says", async () => {
  const report = await page.evaluate(async (base) => {
    const { picturePath } = await import(new URL("/js/read/book-format.js", base).href);
    const { book } = window.__opened;
    if (!book.pictures?.length) return null;
    const problems = [];
    for (const picture of book.pictures) {
      const response = await fetch(`/library/${picturePath(picture.file)}`);
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.startsWith("image/")) problems.push(`${picture.file}: ${response.status} ${type}`);
      else {
        const bitmap = await createImageBitmap(await response.blob());
        if (bitmap.width !== picture.w || bitmap.height !== picture.h) problems.push(`${picture.file}: ${bitmap.width}×${bitmap.height}, the book says ${picture.w}×${picture.h}`);
      }
    }
    // A cover-only book (a picture for its cover, no picture pages) has no pages.
    return { count: book.pictures.length, pages: book.pages?.length ?? 0, problems };
  }, base);
  if (!report) return "not a picture book";
  if (report.problems.length) throw new Error(report.problems.join("; "));
  return `${report.count} pictures on ${report.pages} pages, each an image of its stated size`;
});

await stage("definitions: every file on the shelf checks out against its layer (or its book), as the catalog says", async () => {
  const report = await page.evaluate(async (base) => {
    const { validateDefinitions } = await import(new URL("/js/read/book-format.js", base).href);
    const catalogue = await (await fetch("/library/catalogue.json")).json();
    const problems = [];
    let files = 0;
    for (const meta of catalogue.books) {
      const entries = [...Object.values(meta.layers ?? {}).filter((l) => l.definitions).map((l) => [l.definitions, l.url]), ...(meta.definitions ? [[meta.definitions, null]] : [])];
      if (!entries.length) continue;
      const book = await (await fetch(meta.book)).json();
      for (const [defs, layerUrl] of entries) {
        files++;
        const file = await (await fetch(defs.url)).json();
        // A layer file is named by its bytes' hash: that's the layer the definitions must be for.
        const options = layerUrl ? { layer: await (await fetch(layerUrl)).json(), layerSha: layerUrl.match(/\.([0-9a-f]{12})\.json$/)?.[1] } : {};
        const found = validateDefinitions(file, book, options);
        if (found.length) problems.push(`${meta.id} ${defs.url}: ${found.slice(0, 2).join("; ")}`);
        if (Object.keys(file.entries ?? {}).length !== defs.lemmas) problems.push(`${meta.id}: the catalog says ${defs.lemmas} lemmas, the file has ${Object.keys(file.entries ?? {}).length}`);
      }
    }
    return { files, problems };
  }, base);
  if (report.problems.length) throw new Error(report.problems.join(" | "));
  return report.files ? `${report.files} definitions file(s), each valid against its layer and as the catalog counts it` : "no definitions on the shelf";
});

await stage("learning a language with no open books: the shelf still draws, and says so", async () => {
  const lang = await page.evaluate(async (base) => {
    const { setLearning, learning } = await import(new URL("/js/study/learning.js", base).href);
    const { loadCatalog, renderShelf } = await import(new URL("/js/read/shelf.js", base).href);
    const catalog = await loadCatalog();
    const hasBooks = new Set((catalog.books ?? []).flatMap((book) => [book.lang, ...Object.keys(book.layers ?? {})]));
    const { LANGUAGES } = await import(new URL("/js/read/book-format.js", base).href);
    window.lxWasLearning = learning();
    let none = null;
    for (const code of Object.keys(LANGUAGES)) {
      if (code === "en" || hasBooks.has(code)) continue;
      try { setLearning(code); none = code; break; } catch {}
    }
    if (!none) throw new Error("every language has an open book");
    renderShelf(document.getElementById("shelf"), { open: () => {} });
    return none;
  }, base);
  await page.waitForFunction(() => document.querySelector("#shelf .lx-shelf-section") && /No books in .+ yet/.test(document.getElementById("shelf").textContent), null, { timeout: 8000 });
  await page.evaluate(async (base) => { const { setLearning } = await import(new URL("/js/study/learning.js", base).href); setLearning(window.lxWasLearning); }, base);
  return `${lang}: drawn, and says so`;
});

await stage("an unreachable catalog shows a line, not an error; with a copy kept from before, that copy, saying it's offline", async () => {
  const mount = () =>
    page.evaluate(async (base) => {
      const { renderShelf } = await import(new URL("/js/read/shelf.js", base).href);
      renderShelf(document.getElementById("shelf"), { open: () => {} });
    }, base);
  // Nothing kept on this device: the line.
  await page.evaluate(() => caches.delete("lx-read-catalog-v1"));
  await page.route("**/library/catalogue.json", (route) => route.abort());
  await mount();
  await page.waitForFunction(() => /can't be reached/.test(document.getElementById("shelf").textContent), null, { timeout: 5000 });
  // Online once (the shelf keeps the catalog), then unreachable: the kept books, and the shelf saying it's offline.
  await page.unroute("**/library/catalogue.json");
  await mount();
  await page.waitForFunction(() => document.querySelectorAll("#shelf [data-part='book-tile']").length > 0, null, { timeout: 15_000 });
  const online = await page.evaluate(() => document.querySelectorAll("#shelf [data-part='book-tile']").length);
  const keptOnce = await page.evaluate(async () => {
    for (let t = 0; t < 50; t++) {
      if (await (await caches.open("lx-read-catalog-v1")).match("/library/catalogue.json")) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  });
  if (!keptOnce) throw new Error("the catalog wasn't kept after an online start");
  await page.route("**/library/catalogue.json", (route) => route.abort());
  await mount();
  await page.waitForFunction(() => document.querySelector("#shelf [data-offline]") && document.querySelectorAll("#shelf [data-part='book-tile']").length > 0, null, { timeout: 5000 });
  const kept = await page.evaluate(() => document.querySelectorAll("#shelf [data-part='book-tile']").length);
  await page.unroute("**/library/catalogue.json");
  if (kept !== online) throw new Error(`kept shelf: ${kept} books, online ${online}`);
  return `the line with nothing kept; the kept ${kept} books and Offline: with a copy`;
});

await stage("no console errors", async () => {
  // The aborted catalog request logs a network error by design; anything else is a real error.
  // The blank harness page has no icon link, so Chrome asks for /favicon.ico (the app's own pages link favicon.png).
  const real = errors.filter((e) => !/catalogue\.json|ERR_FAILED|favicon\.ico/.test(e));
  if (real.length) throw new Error(real.slice(0, 3).join(" | "));
  return "none";
});

await browser.close();
writeFileSync(join(out, "shelf-check.json"), JSON.stringify({ base, at: new Date().toISOString(), results }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`shelf check: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
