#!/usr/bin/env node
// The shelf's sections (the catalog's optional `shelf`, curated through MCP: read/catalogue.js withShelf), in Chrome:
// public/js/read/shelf.js mounted in a blank page of the server's origin, like shelf-check.mjs. The server's own
// catalog first, then variants of it served in its place (read-only: nothing on the server changes):
//   - no shelf: a shelf for each kind of book, by title (Picture books, Non-fiction, Woven into Dutch, In Dutch with help, In Dutch,
//     Other languages), under "Find a book"; a book that says it's non-fiction under Non-fiction, pictures or not;
//   - sections: their titles in order, each with its books in the order given, then the kinds' shelves for the rest;
//   - each holds only the books for the language being learned (Dutch, this blank page's default), and every other book
//     sits last, under "Other languages" (a picture book for another language too);
//   - a book in two sections shows in both; a section whose books are all gone isn't shown; every book placed means
//     no kind's shelf but Other languages;
//   - at 960 books (scripts/fixtures/read-catalog.mjs), each kind's count is that whole kind, curated ones too, and its row
//     goes to Find a book for the kind; the search counts them all;
//     a curated section named as a kind is that kind's one shelf, its own books first;
//   - the first shelf leads, a grid of its covers (each still opening its book; up to 7 drawn, 6 shown), and every other shelf
//     follows with its name and its covers in a row (up to 10); each one's "All N", when it holds more than it shows, says how
//     many (a kind's whole count, as Find a book shows it) and goes where it goes (Find a book for a kind, the section's page
//     for a curated one); where the books come from is behind the info button on "Find a book".
//
//   node scripts/books/shelf-sections-check.mjs <baseUrl> <outDir>      (the catalog needs at least two books)
//
// Exit 0 = pass. Run through the channel's GPU queue (headless Chrome). LOCAL or live; read-only.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "../quiet-browser.mjs";
import { scaledCatalog } from "../fixtures/read-catalog.mjs";

const [base, out] = process.argv.slice(2);
if (!base || !out) {
  console.error("Usage: shelf-sections-check.mjs <baseUrl> <outDir>");
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const results = [];
const stage = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`  ok    ${name}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error.message, errors: [...errors] });
    console.log(`  FAIL  ${name}: ${error.message}\n        errors so far: ${JSON.stringify(errors.slice(0, 5))}`);
  }
};
const eq = (a, b, what) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}\n  got:  ${JSON.stringify(a)}\n  want: ${JSON.stringify(b)}`);
};

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`${m.text()} (${m.location()?.url ?? ""})`));
page.on("pageerror", (e) => errors.push(String(e)));
// The blank page this mounts the shelf in asks for /favicon.ico, which the app doesn't have: not the shelf's.
const harness = (url) => new URL(url).pathname === "/favicon.ico";
page.on("console", (m) => m.type() === "error" && harness(m.location()?.url ?? "http://x/") && errors.pop());
page.on("response", (r) => r.status() >= 400 && !harness(r.url()) && errors.push(`${r.status()} ${new URL(r.url()).pathname}`));

await page.goto(new URL("/robots.txt", base).href);
const real = await page.evaluate(async () => (await fetch("/library/catalogue.json")).json());
if ((real.books ?? []).length < 2) {
  console.error("shelf-sections-check needs a catalog with at least two books.");
  process.exit(2);
}
// The books for the language being learned (Dutch here: a book in it, with help or plain, or a layer woven into it), and the
// rest, which the shelf puts last under "Other languages".
const forDutch = (m) => m.lang === "nl" || Object.entries(m.layers ?? {}).some(([lang, layer]) => layer.kind === "weave" && lang === "nl");
const helped = (m) => m.lang === "nl" && Object.values(m.layers ?? {}).some((layer) => layer.kind === "help");
const byTitle = (x, y) => (x.title < y.title ? -1 : 1);
const mine = real.books.filter(forDutch).sort(byTitle);
// A book's kind, worked out here on its own: for another language; non-fiction (its catalog entry says so, pictures or not); a picture
// book (the catalog counts its pictures); woven into Dutch; in Dutch with help; else in Dutch, plain.
const pictured = (m) => (Array.isArray(m.pictures) ? m.pictures.length : Number(m.pictures) || 0) > 0;
const kindOf = (m) => (!forDutch(m) ? "other" : m.kind === "nonfiction" ? "nonfiction" : pictured(m) ? "picture" : m.layers?.nl?.kind === "weave" ? "woven" : helped(m) ? "help" : "plain");
const KINDS = [["picture", "Picture books"], ["nonfiction", "Non-fiction"], ["woven", "Woven into Dutch"], ["help", "In Dutch, with help"], ["plain", "In Dutch"], ["other", "Other languages"]];
const ROW = 10; // a shelf's row shows its first 10
const GRID = 6; // the leading shelf's grid shows 6 (shelf.js GRID_SHOWN), with one more drawn for when the first moves up front
// The kinds' shelves for what no curated section holds (Other languages: every book for another language).
const kindGroups = (books, placed = new Set()) =>
  KINDS.map(([kind, title]) => ({ title, books: books.filter((m) => kindOf(m) === kind && (kind === "other" || !placed.has(m.id))).sort(byTitle).map((m) => m.title).slice(0, ROW) })).filter((g) => g.books.length);
const otherGroup = kindGroups(real.books).filter((g) => g.title === "Other languages");
// Every shelf the shelf should show, in order, worked out here on its own: the curated sections (only the books for Dutch; one whose
// books are all gone left out), then a shelf for each kind of what none holds (Other languages: every book for another language), a
// curated section named as a kind being that kind's one shelf, its own books first. Each with its first books, its count and its way.
function shelvesOf(cat) {
  const books = cat.books ?? [];
  const byId = new Map(books.filter(forDutch).map((m) => [m.id, m]));
  const out = (Array.isArray(cat.shelf) ? cat.shelf : []).map((s) => ({ id: s.id, title: s.title, books: (s.books ?? []).map((id) => byId.get(id)).filter(Boolean) })).filter((s) => s.title && s.books.length);
  const placed = new Set(out.flatMap((s) => s.books.map((m) => m.id)));
  for (const [kind, title] of KINDS) {
    const these = books.filter((m) => kindOf(m) === kind && (kind === "other" || !placed.has(m.id))).sort(byTitle);
    const total = books.filter((m) => kindOf(m) === kind).length;
    const named = out.find((s) => !s.kind && s.title.trim().toLowerCase() === title.toLowerCase());
    if (named) Object.assign(named, { books: [...named.books, ...these.filter((m) => !named.books.includes(m))], kind, total });
    else if (these.length) out.push({ id: kind, title, books: these, kind, total });
  }
  return out.map((s) => ({ title: s.title, books: s.books.map((m) => m.title).slice(0, ROW), count: (s.kind ? s.total : s.books.length).toLocaleString("en"), href: s.kind ? `#read/find?kind=${s.kind}` : `#read/shelf/${encodeURIComponent(s.id)}` }));
}
// What the shelf shows against what it should: the first shelf leading with its books in a grid, every other one with its books in a
// row; each one's All, its whole count and its page, when it holds more than it shows.
const allOf = (count, shown, href) => (Number(count.replace(/,/g, "")) > shown ? { all: `All ${count}`, href } : { all: null, href: null });
const sameShelves = (shown, want) => {
  const [lead, ...rest] = want;
  eq(shown.lead, { title: lead.title, books: lead.books.slice(0, GRID + 1), ...allOf(lead.count, GRID, lead.href) }, "the leading shelf");
  eq(shown.rows, rest.map(({ title, books, count, href }) => ({ title, books, ...allOf(count, books.length, href) })), "the other shelves, their covers in a row");
};
if (mine.length < 2) {
  console.error("shelf-sections-check needs a catalog with at least two books for Dutch.");
  process.exit(2);
}
const [a, b] = mine;

// Serves `catalogue` as /library/catalogue.json (null: the server's own), mounts the shelf, and reads what it shows: its
// sections, each a heading and a row of covers.
async function mount(catalogue, shot) {
  await page.unroute("**/library/catalogue.json");
  if (catalogue) await page.route("**/library/catalogue.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalogue) }));
  await page.goto(new URL("/robots.txt", base).href);
  await page.setContent(`<!doctype html><html><head><link rel="stylesheet" href="/css/lx/tokens.css"><link rel="stylesheet" href="/css/lx/base.css"><link rel="stylesheet" href="/css/lx/components.css"></head><body><main id="shelf"></main></body></html>`, { waitUntil: "load" });
  await page.evaluate(async () => {
    const { renderShelf } = await import("/js/read/shelf.js");
    window.opened = [];
    renderShelf(document.getElementById("shelf"), { open: (record) => window.opened.push(record.meta.id) });
  });
  await page.waitForFunction(() => document.querySelector("#shelf .lx-shelf-section, #shelf [data-part='empty-state']:not(:empty)") && !/Loading/.test(document.querySelector("#shelf").textContent));
  // Each shelf's heading, its books and its All (the leading one first, then every other); credits: where the books come from, behind
  // the info button.
  const groups = await page.evaluate(() => {
    const read = (section) => {
      const link = section.querySelector("[data-part='section-head'] [data-part='section-link']");
      return {
        title: section.querySelector("[data-part='section-title']")?.textContent ?? null,
        books: [...section.querySelectorAll(".lx-tile-title")].map((t) => t.textContent),
        all: link?.textContent.trim() ?? null,
        href: link?.getAttribute("href") ?? null,
      };
    };
    const lead = document.querySelector("#shelf .lx-shelf-section[data-lead]");
    return {
      lead: lead ? read(lead) : null,
      rows: [...document.querySelectorAll("#shelf .lx-shelf-section:not([data-lead])")].map(read),
      sections: document.querySelectorAll("#shelf .lx-shelf-section").length,
    };
  });
  if (groups.rows.some((row) => !row.books.length)) throw new Error(`a shelf with no covers: ${JSON.stringify(groups.rows)}`);
  const credits = await page.evaluate(() => Boolean(document.querySelector("#shelf [data-part='section-head'] [data-part='icon-button'][aria-label='Where these books come from']")));
  if (!credits) throw new Error("no way to where the books come from");
  if (shot) await page.screenshot({ path: join(out, `${shot}.png`), fullPage: true });
  return groups;
}

await stage("the server's own catalog, as the admin tools left it", async () => {
  const groups = await mount(null, "shelf-server");
  sameShelves(groups, shelvesOf(real));
  return { lead: `${groups.lead.title}: ${groups.lead.books.length}${groups.lead.all ? ` (${groups.lead.all})` : ""}`, rows: groups.rows.map((r) => `${r.title}: ${r.all ?? r.books.length}`) };
});

await stage("no shelf: a shelf for each kind, by title, under Find a book", async () => {
  const { shelf, ...plain } = real;
  const groups = await mount(plain, "shelf-no-sections");
  sameShelves(groups, shelvesOf(plain));
  eq(await page.evaluate(() => document.querySelector("#shelf [data-part='section-title']")?.textContent), "Find a book", "the shelf's heading");
});

await stage("sections in order, a book in two of them, an emptied section hidden, then the rest", async () => {
  const groups = await mount(
    { ...real, shelf: [{ id: "second", title: "Second first", books: [b.id, a.id] }, { id: "gone", title: "All gone", books: ["no-longer-here"] }, { id: "again", title: "Again", books: [b.id] }] },
    "shelf-sections",
  );
  const cat = { ...real, shelf: [{ id: "second", title: "Second first", books: [b.id, a.id] }, { id: "gone", title: "All gone", books: ["no-longer-here"] }, { id: "again", title: "Again", books: [b.id] }] };
  eq(groups.lead, { title: "Second first", books: [b.title, a.title], all: null, href: null }, "the leading shelf");
  eq(groups.rows[0], { title: "Again", books: [b.title], all: null, href: null }, "the next, its one cover (no All: it shows all it holds)");
  sameShelves(groups, shelvesOf(cat));
});

await stage("every book placed: no kind's shelf but Other languages", async () => {
  const groups = await mount({ ...real, shelf: [{ id: "all", title: "Everything", books: real.books.map((m) => m.id) }] }, null);
  eq([groups.lead.title, ...groups.rows.map((r) => r.title)], ["Everything", ...otherGroup.map((g) => g.title)], "the shelves");
});

await stage("960 books: each kind's All counts the whole kind and goes to Find a book; the search counts the ones a Dutch learner can read", async () => {
  const big = scaledCatalog(real, 960);
  // A curated section holding some of each kind, so a kind's own shelf has fewer than its count says.
  const curated = KINDS.flatMap(([kind]) => big.books.filter((m) => kindOf(m) === kind).slice(0, 3).map((m) => m.id));
  const cat = { ...big, shelf: [{ id: "some", title: "Some of each", books: curated }] };
  const groups = await mount(cat, "shelf-960");
  sameShelves(groups, shelvesOf(cat));
  for (const row of groups.rows) {
    const kind = KINDS.find(([, title]) => title === row.title)?.[0];
    if (!kind) continue;
    // Its All is the whole kind as the catalog has it, never the covers its row shows, and it opens that kind's page.
    eq(row.all, `All ${big.books.filter((m) => kindOf(m) === kind).length.toLocaleString("en")}`, `${row.title}: the whole kind`);
    eq(row.href, `#read/find?kind=${kind}`, `${row.title}: its page`);
  }
  // The search counts the books a Dutch learner can read (read/readable.js), as Home does: not the 960, some of them other languages'.
  const readable = big.books.filter(forDutch).length;
  if (readable === big.books.length) throw new Error("the 960 need books in other languages, so the two counts differ");
  eq(await page.evaluate(() => document.querySelector("#shelf .lx-read-find input")?.placeholder), `Search ${readable.toLocaleString("en")} books`, "the search");
  return { rows: groups.rows.map((r) => `${r.title}: ${r.all ?? r.books.length}`) };
});

await stage("a curated section named as a kind is that kind's shelf: its books first, then the rest, one shelf", async () => {
  const big = scaledCatalog(real, 960);
  const pictures = big.books.filter((m) => kindOf(m) === "picture");
  const chosen = [pictures.at(-1), pictures[5]];
  const groups = await mount({ ...big, shelf: [{ id: "pb", title: "Picture books", books: chosen.map((m) => m.id) }] }, null);
  eq([groups.lead.title, ...groups.rows.map((r) => r.title)].filter((t) => t === "Picture books").length, 1, "shelves named Picture books");
  const rest = pictures.filter((m) => !chosen.includes(m)).sort(byTitle);
  eq(groups.lead.books, [...chosen, ...rest].map((m) => m.title).slice(0, GRID + 1), "its books");
  eq(groups.lead.title, "Picture books", "in the curated section's place");
  const all = await page.evaluate(() => document.querySelector("#shelf .lx-shelf-section [data-part='section-head'] a")?.getAttribute("href"));
  eq(all, "#read/find?kind=picture", "its way to all of them");
});

await stage("a picture book for another language goes under Other languages", async () => {
  const pic = real.books.find((m) => forDutch(m) && pictured(m));
  if (!pic) return "no picture book in this catalog";
  const elsewhere = { ...pic, id: `${pic.id}-elsewhere`, title: "Aa a picture book in German", lang: "de", layers: { en: { kind: "help" } } };
  const cat = { ...real, books: [...real.books, elsewhere] };
  const groups = await mount(cat, null);
  sameShelves(groups, shelvesOf(cat));
  const other = groups.rows.find((r) => r.title === "Other languages");
  if (!(other ?? (groups.lead.title === "Other languages" ? groups.lead : null))?.books.includes(elsewhere.title)) throw new Error(`it isn't under Other languages: ${JSON.stringify(groups)}`);
  if (groups.lead.title === "Picture books" && groups.lead.books.includes(elsewhere.title)) throw new Error("it's under Picture books");
});

await stage("a plain book in Dutch is In Dutch, never with help; a plain one in another language is under Other languages", async () => {
  const text = real.books.find((m) => !pictured(m));
  if (!text) return "no book without pictures in this catalog";
  // Titles that sort first, so each is in its shelf's first row however many books the shelf has.
  const nl = { ...text, id: `${text.id}-plain-nl`, title: "Aa a plain book in Dutch", lang: "nl", layers: {} };
  const de = { ...text, id: `${text.id}-plain-de`, title: "Aa a plain book in German", lang: "de", layers: {} };
  const cat = { ...real, books: [...real.books, nl, de] };
  const groups = await mount(cat, null);
  sameShelves(groups, shelvesOf(cat));
  const shelf = (title) => [groups.lead, ...groups.rows].find((g) => g?.title === title);
  if (!shelf("In Dutch")?.books.includes(nl.title)) throw new Error(`it isn't under In Dutch: ${JSON.stringify(groups)}`);
  if (shelf("In Dutch, with help")?.books.includes(nl.title)) throw new Error("it's under In Dutch, with help");
  if (!shelf("Other languages")?.books.includes(de.title)) throw new Error(`the German one isn't under Other languages: ${JSON.stringify(groups)}`);
  return "In Dutch; Other languages";
});

await stage("a book that says it's non-fiction is under Non-fiction, a picture book that says so too; one in another language under Other languages", async () => {
  const text = real.books.find((m) => !pictured(m));
  const picture = real.books.find((m) => pictured(m) && forDutch(m));
  if (!text || !picture) return "no book with pictures and one without in this catalog";
  // Titles that sort first, so each is in its shelf's first row however many books the shelf has.
  const plainNf = { ...text, id: `${text.id}-nf-nl`, title: "Aa non-fiction in Dutch", lang: "nl", layers: {}, kind: "nonfiction" };
  const pictureNf = { ...picture, id: `${picture.id}-nf-pictures`, title: "Ab non-fiction with pictures", kind: "nonfiction" };
  const otherNf = { ...text, id: `${text.id}-nf-de`, title: "Aa non-fiction in German", lang: "de", layers: {}, kind: "nonfiction" };
  const cat = { ...real, books: [...real.books, plainNf, pictureNf, otherNf] };
  const groups = await mount(cat, null);
  sameShelves(groups, shelvesOf(cat));
  const shelf = (title) => [groups.lead, ...groups.rows].find((g) => g?.title === title);
  const nf = shelf("Non-fiction")?.books ?? [];
  if (!nf.includes(plainNf.title) || !nf.includes(pictureNf.title)) throw new Error(`not both under Non-fiction: ${JSON.stringify(groups)}`);
  if (shelf("Picture books")?.books.includes(pictureNf.title)) throw new Error("the illustrated one is under Picture books too");
  if (shelf("In Dutch")?.books.includes(plainNf.title)) throw new Error("the plain one is under In Dutch too");
  if (nf.includes(otherNf.title) || !shelf("Other languages")?.books.includes(otherNf.title)) throw new Error(`the German one isn't under Other languages alone: ${JSON.stringify(groups)}`);
  // With none (this server's own catalog, when it has none), no Non-fiction shelf at all.
  const without = { ...real, books: real.books.filter((m) => m.kind !== "nonfiction") };
  const before = await mount(without, null);
  if ([before.lead, ...before.rows].some((g) => g?.title === "Non-fiction")) throw new Error("a Non-fiction shelf on a catalog with no non-fiction");
  return "Non-fiction (2, one illustrated); Other languages (the German one); none on a catalog without any";
});

await stage("a cover in a section opens its book (fetched and checked by the shelf)", async () => {
  await mount({ ...real, shelf: [{ id: "one", title: "One", books: [a.id] }] }, null);
  await page.locator("#shelf .lx-shelf-section").first().locator("[data-part='book-tile']").first().click();
  await page.waitForFunction(() => window.opened.length > 0, null, { timeout: 30_000 });
  eq(await page.evaluate(() => window.opened), [a.id], "what opened");
});

await stage("no console errors", async () => {
  if (errors.length) throw new Error(errors.slice(0, 10).join("\n"));
});

await browser.close();
const failed = results.filter((r) => !r.ok);
writeFileSync(join(out, "shelf-sections-check.json"), JSON.stringify({ base, at: new Date().toISOString(), results }, null, 2) + "\n");
console.log(`shelf sections check: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
