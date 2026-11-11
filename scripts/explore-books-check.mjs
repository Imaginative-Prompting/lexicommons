// Books in Explore in Chrome on a phone, against a LOCAL server and its own state (public/js/explore/books.js, docs/explore-books.md):
//   - with no book shared (the site at launch): Explore's home draws no Books shelf (no heading, no cover, no held place that then goes)
//     and nothing on it shifts, on a first visit and drawn again from what the device kept; Yours has no books groups;
//   - shared books (an AI-free share over HTTP: Alice's opening with its Dutch layer, and a Dutch text of the check's own): the home's
//     shelf, each cover's line; Books;
//   - a book's page: its first lines woven as the reader weaves them, with the words this learner knows (the bank), in violet, and with
//     the text's commonest words for a learner who knows none (said in the heading); About's source and license;
//   - Add to my library: followed on the account, on this device with its layer, then Read it;
//   - sharing a text of yours: whether it's free to share first, a link that isn't one, the terms, pending from an unknown source (its
//     page and Yours say so); the same text from another account refused as being looked at, in words;
//   - sharing closed to this person (/api/me's mayShare false, as COMMUNITY_SHARING "admins" gives a learner): no Share part, and the
//     share route goes to Yours;
//   - no page errors.
//
//   node scripts/explore-books-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
//
// The server: a fresh state with --var COMMUNITY_SHARING:everyone, no book shared yet (exit 2 if one is). Accounts are written straight
// into its D1. Run through gpu.py's parallel lane (headless Chrome), sandbox off. Exit 0 = every stage passed.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { bookFromText } from "../public/js/read/import-text.js";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
// Resolved where it was typed: wrangler runs from the app's folder, where a relative path would make a state inside app/.
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !OUT || !PERSIST) {
  console.error("Usage: explore-books-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const sql = (command) => execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
const run = randomBytes(3).toString("hex");
/** A learner's account, a month old, with its session cookie; `terms`: the sharing terms accepted already. */
function account(name, { terms = false } = {}) {
  const id = `eb${run}${randomBytes(5).toString("hex")}`;
  const cookie = randomBytes(24).toString("base64url");
  const now = Date.now();
  sql(
    [
      `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now - 30 * 86400_000})`,
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'explore-books-check')`,
      ...(terms ? [`INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (${q(id)}, 1, ${now})`] : []),
    ].join("; "),
  );
  return { id, name, cookie };
}
async function http(who, method, path, body) {
  const response = await fetch(`${BASE}${path}`, { method, headers: { Cookie: `lc_session=${who.cookie}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const results = [];
let page = null;
async function stage(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`  ok    ${name}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    console.log(`  FAIL  ${name}: ${error.message.split("\n")[0]}`);
    await page?.screenshot({ path: join(OUT, `fail-${results.length}.png`), fullPage: true }).catch(() => {});
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

// ---------- the browser ----------

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const errors = [];
/** A phone signed in as `who`, learning Dutch; every layout shift and every books part ever put on a page counted (window.__books). */
async function phoneFor(who, { closed = false, width = 390 } = {}) {
  const context = await browser.newContext({ ...phone, viewport: { width, height: 844 } });
  await context.addCookies([{ name: "lc_session", value: who.cookie, url: BASE }]);
  await context.addInitScript(() => {
    window.__shift = 0;
    window.__shifts = [];
    window.__books = 0;
    // Each shift, with what moved (its part, from where to where), for a failure to name.
    const named = (n) => (n?.nodeType === 1 ? `${n.tagName.toLowerCase()}${n.getAttribute("data-part") ? `[${n.getAttribute("data-part")}]` : ""}${n.className && typeof n.className === "string" ? `.${n.className.trim().split(/\s+/).join(".")}` : ""}` : String(n?.nodeName));
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__shift += e.value;
        window.__shifts.push({ at: Math.round(e.startTime), value: Number(e.value.toFixed(4)), hash: location.hash, moved: e.sources.map((s) => ({ part: named(s.node), from: [s.previousRect.y, s.previousRect.height].map(Math.round), to: [s.currentRect.y, s.currentRect.height].map(Math.round) })) });
      }
    }).observe({ type: "layout-shift", buffered: true });
    const BOOKS = '.lx-explore-books, [data-part="book-tile"], [data-books-held]';
    new MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && (n.matches(BOOKS) || n.querySelector(BOOKS))) window.__books++;
    }).observe(document, { childList: true, subtree: true });
  });
  // Sharing closed to this person, whatever the server's setting: /api/me answered as COMMUNITY_SHARING "admins" answers a learner.
  if (closed)
    await context.route("**/api/me", async (route) => {
      const r = await route.fetch();
      const me = await r.json();
      await route.fulfill({ response: r, json: { ...me, mayShare: false, features: { ...(me.features ?? {}), sharing: "admins" } } });
    });
  const p = await context.newPage();
  p.on("pageerror", (error) => errors.push(`${who.name}: ${error.message}`));
  await p.goto(`${BASE}/app/`);
  await p.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await p.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  return { context, p };
}
/** When this device last kept Dutch's Explore home (home-data.js writes it once the server's answer is whole). */
const keptAt = (p) =>
  p.evaluate(() => {
    try {
      const all = JSON.parse(localStorage.getItem("lx.explore-home.v1") ?? "null");
      return Math.max(0, ...Object.values(all?.accounts ?? {}).map((a) => a?.homes?.nl?.at ?? 0));
    } catch {
      return 0;
    }
  });
/** Explore's Dutch home, opened as a tap would (a hash change), waited for until the server's answer is kept and drawn. */
async function openHome(p, since) {
  await p.evaluate(() => ((window.__shift = 0), (window.__shifts = [])));
  await p.evaluate(() => (location.hash = "#explore?lang=nl"));
  for (let i = 0; i < 60 && (await keptAt(p)) <= since; i++) await p.waitForTimeout(250);
  await p.waitForTimeout(1200);
}
const textOf = (p, sel) => p.locator(sel).evaluateAll((nodes) => nodes.map((n) => n.innerText.trim()));

// ---------- no book shared: nothing of books on the screen ----------

const empty = await (await fetch(`${BASE}/api/community/books?learning=nl`, { headers: { Cookie: `lc_session=${account("Books Probe").cookie}` } })).json();
if (!Array.isArray(empty.books) || empty.books.length) {
  console.error(`explore-books-check needs a state with no shared book (it has ${empty.books?.length ?? "?"}): start the server on a fresh state.`);
  process.exit(2);
}
const learner = account("Books Learner");
const first = await phoneFor(learner);
page = first.p;

await stage("no book shared: Explore's home draws no Books shelf (no heading, no cover, no held place) and nothing on it shifts, first and from what's kept", async () => {
  const p = first.p;
  await openHome(p, 0);
  const firstVisit = await p.evaluate(() => ({ shift: window.__shift, books: window.__books, shifts: window.__shifts, lessonsHeld: document.querySelector(".lx-lessons-slot")?.offsetHeight }));
  const heads = await textOf(p, '[data-part="section-title"]');
  assert(!heads.includes("Books"), `a Books heading on the home: ${JSON.stringify(heads)}`);
  assert((await p.locator('.lx-explore-books, [data-part="book-tile"]').count()) === 0, "a books shelf or cover on the home");
  assert(firstVisit.books === 0, `books parts put on the page: ${firstVisit.books}`);
  assert(firstVisit.shift === 0, `the home shifted on its first visit: ${firstVisit.shift} ${JSON.stringify(firstVisit.shifts)}`);
  const kept = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem("lx.explore-home.v1")).accounts)[0].homes.nl.books);
  assert(Array.isArray(kept) && kept.length === 0, `the kept home's books: ${JSON.stringify(kept)}`);
  await p.screenshot({ path: join(OUT, "01-home-no-books.png") });
  // Again from what the device kept (a restart: a reload, then the tab), the server's same answer drawing nothing new.
  await p.reload();
  await p.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  const before = await keptAt(p);
  await openHome(p, before);
  const again = await p.evaluate(() => ({ shift: window.__shift, books: window.__books, shifts: window.__shifts }));
  assert(again.books === 0 && again.shift === 0, `drawn from what's kept: ${JSON.stringify(again)}`);
  assert((await p.locator('.lx-explore-books, [data-part="book-tile"]').count()) === 0, "a books shelf after the reload");
  // A new device at 320 wide, its lessons still downloading as it opens Explore: the lessons card's place held as tall as the card.
  const narrow = await phoneFor(account("Books Learner 320"), { width: 320 });
  await openHome(narrow.p, 0);
  const at320 = await narrow.p.evaluate(() => ({ shift: window.__shift, books: window.__books, shifts: window.__shifts }));
  await narrow.p.screenshot({ path: join(OUT, "01b-home-no-books-320.png") });
  await narrow.context.close();
  assert(at320.books === 0 && at320.shift === 0, `at 320: ${JSON.stringify(at320)}`);
  return { firstVisit: firstVisit.shift, again: again.shift, at320: at320.shift };
});

await stage("no book shared: Yours has no books groups and nothing shifts", async () => {
  const p = first.p;
  await p.evaluate(() => ((window.__shift = 0), (location.hash = "#explore/yours")));
  await p.waitForSelector(".lx-explore-yours [data-part='list-row']", { timeout: 15_000 });
  await p.waitForTimeout(1500);
  const heads = await textOf(p, '[data-part="section-title"]');
  assert(!heads.some((h) => /book/i.test(h)), `a books heading in Yours: ${JSON.stringify(heads)}`);
  const shift = await p.evaluate(() => window.__shift);
  assert(shift === 0, `Yours shifted: ${shift}`);
  await p.screenshot({ path: join(OUT, "02-yours-no-books.png") });
  return { heads };
});

// ---------- shared books ----------

const LIB = join(APP, "library/books/carroll-alice-wonderland-opening/d6dba2b5a24f054f");
const ALICE = JSON.parse(readFileSync(join(LIB, "book.json"), "utf8"));
const ALICE_NL = JSON.parse(readFileSync(join(LIB, "weave.nl.eadf6e578bf6.json"), "utf8"));
const STORY = "De kat zit op de mat. Het regent en de kat kijkt naar buiten.\n\nDan komt de zon. De kat gaat naar de tuin en slaapt in het gras.";
const story = Object.assign(await bookFromText(STORY, { title: `De kat en de zon ${run}`, lang: "nl" }), {
  authors: [{ name: "Een Schrijver", role: "author" }],
  rights: { us: true, eu: true, basis: "written for the check" },
  source: { kind: "web", url: "https://www.gutenberg.org/ebooks/0" },
});
const sanne = account(`Sanne ${run}`, { terms: true });
const alice = await http(sanne, "POST", "/api/community/books/share", { book: ALICE, layers: [ALICE_NL], about: "The first chapter, woven into Dutch.", level: "A2" });
const cat = await http(sanne, "POST", "/api/community/books/share", { book: story, level: "A1" });
if (alice.body?.state !== "live" || cat.body?.state !== "live") {
  console.error(`explore-books-check couldn't share its books: ${JSON.stringify([alice.body, cat.body]).slice(0, 600)}`);
  process.exit(2);
}
const ids = { alice: alice.body.id, cat: cat.body.id };

await stage("shared books: the home's shelf, each cover's line, and Books", async () => {
  const p = first.p;
  await openHome(p, await keptAt(p));
  const tiles = await p.locator(".lx-explore-books [data-part='book-tile']").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label") ?? n.innerText));
  assert(tiles.length === 2, `the shelf's covers: ${JSON.stringify(tiles)}`);
  assert(tiles.some((t) => /Alice/.test(t) && /A2 · Woven into Dutch/.test(t)) && tiles.some((t) => /De kat en de zon/.test(t) && /A1 · In Dutch/.test(t)), `their lines: ${JSON.stringify(tiles)}`);
  await p.locator(".lx-explore-books").scrollIntoViewIfNeeded();
  await p.screenshot({ path: join(OUT, "03-home-books.png") });
  await p.locator(".lx-explore-books [data-part='section-link']").click();
  await p.waitForSelector(".lx-explore-books, [data-part='book-list'][data-variant='grid'], [data-part='book-list']", { timeout: 10_000 });
  await p.waitForTimeout(800);
  assert(/^#explore\/books/.test(await p.evaluate(() => location.hash)), `See all went to ${await p.evaluate(() => location.hash)}`);
  const all = await p.locator("[data-part='book-tile']").count();
  assert(all === 2, `Books lists ${all}`);
  await p.screenshot({ path: join(OUT, "04-books.png") });
  return { tiles: tiles.length };
});

/** A book's page, and how its first lines read: the heading, and the woven pieces (in violet: .lx-book-woven). */
async function bookPage(p, id) {
  // From Explore's home, as a tap on its cover would: the same address twice draws nothing again.
  await p.evaluate(() => (location.hash = "#explore?lang=nl"));
  await p.waitForTimeout(600);
  await p.evaluate((id) => (location.hash = `#explore/book/${id}`), id);
  await p.waitForSelector(".lx-book-sample h2", { timeout: 15_000 });
  await p.waitForTimeout(500);
  return { heading: await p.locator(".lx-book-sample h2").innerText(), woven: await textOf(p, ".lx-book-woven"), lines: await textOf(p, ".lx-book-line") };
}

await stage("a book's page: its first lines woven with the commonest words for a learner who knows none, said so; no chapter marker", async () => {
  const shown = await bookPage(first.p, ids.alice);
  assert(/common Dutch words/.test(shown.heading), `the heading: ${shown.heading}`);
  assert(shown.woven.length > 0, "nothing woven");
  assert(!shown.lines.some((l) => /^[IVX]+$/.test(l)), `a chapter's marker among the lines: ${JSON.stringify(shown.lines)}`);
  return { woven: shown.woven.slice(0, 6) };
});

await stage("a book's page: woven with the words this learner knows (the reader's bank), in the reader's violet; About's source and license", async () => {
  const p = first.p;
  await p.evaluate(async () => {
    const bank = await import("/js/read/bank.js");
    for (const lemma of ["de", "het", "en", "haar", "zij", "van", "op"]) bank.addWord("nl", lemma, { quiet: true });
  });
  const shown = await bookPage(p, ids.alice);
  assert(/the Dutch you know/.test(shown.heading), `the heading: ${shown.heading}`);
  const allowed = new Set(["de", "het", "en", "haar", "ze", "zij", "van", "op"]);
  const strays = shown.woven.filter((w) => !allowed.has(w.toLowerCase().replace(/[^\p{L}]/gu, "")));
  assert(shown.woven.length >= 5 && !strays.length, `woven: ${JSON.stringify(shown.woven)}`);
  // The violet: the reader's woven tint, not the page's ink.
  const [woven, ink] = await p.evaluate(() => [getComputedStyle(document.querySelector(".lx-book-woven")).color, getComputedStyle(document.querySelector(".lx-book-line")).color]);
  assert(woven !== ink, `woven words in the line's own ink: ${woven}`);
  await p.locator("[data-more=about] summary").click();
  const about = await p.locator("[data-more=about]").innerText();
  assert(/In the public domain/.test(about) && /From Standard Ebooks/.test(about) && /CC BY-SA 4\.0/.test(about) && new RegExp(`Woven by Sanne ${run}`).test(about), `About: ${about}`);
  await p.screenshot({ path: join(OUT, "05-book-woven.png") });
  return { woven: shown.woven.length };
});

await stage("Add to my library: followed on the account, on this device with its Dutch layer, then Read it", async () => {
  const p = first.p;
  await bookPage(p, ids.alice);
  await p.getByRole("button", { name: "Add to my library" }).click();
  await p.getByRole("button", { name: "Read it" }).waitFor({ timeout: 20_000 });
  const here = await p.evaluate(async (id) => {
    const store = await import("/js/read/store.js");
    return { listed: (await store.listBooks()).some((b) => b.id === id), weave: Boolean(await store.getWeave(id, "nl")) };
  }, ids.alice);
  assert(here.listed && here.weave, `on this device: ${JSON.stringify(here)}`);
  const following = await http(learner, "GET", "/api/community/books/following");
  assert(following.body?.books?.some((b) => b.id === ids.alice), `following: ${JSON.stringify(following.body).slice(0, 300)}`);
  await p.screenshot({ path: join(OUT, "06-added.png") });
  // Its page again says Read it from its first draw.
  await p.evaluate(() => (location.hash = "#explore"));
  await p.waitForTimeout(500);
  await bookPage(p, ids.alice);
  assert((await p.getByRole("button", { name: "Read it" }).count()) === 1 && (await p.getByRole("button", { name: "Add to my library" }).count()) === 0, "Add again on a book this device has");
});

// ---------- sharing a text of yours ----------

const MINE = "Mijn oma woont in een klein huis bij de zee. Elke zondag fietsen wij naar haar toe.\n\nZij bakt dan een appeltaart en vertelt verhalen over vroeger.";
/** The share page of a text pasted into this phone's reading library (read/import-text.js, as Read's Paste does). */
async function shareMine(p) {
  const id = await p.evaluate(async (text) => {
    const { bookFromText } = await import("/js/read/import-text.js");
    const store = await import("/js/read/store.js");
    const book = await bookFromText(text, { title: "Bij oma", lang: "nl" });
    await store.addBook(book);
    return book.id;
  }, MINE);
  await p.evaluate(() => (location.hash = "#explore/yours"));
  await p.locator(`a[href*="share-book/${id}"]`).click({ timeout: 15_000 });
  await p.waitForSelector(".lx-share-book input[type=url]", { timeout: 15_000 });
  return id;
}
const status = (p) => p.locator(".lx-share-book [role=status]").last().innerText();
const press = (p) => p.locator(".lx-share-book [data-variant=go]").last().click();

await stage("sharing a text of yours: whether it's free first, a link that isn't one, then pending from an unknown source (its page and Yours say so)", async () => {
  const p = first.p;
  await shareMine(p);
  await p.screenshot({ path: join(OUT, "07-share.png") });
  await press(p);
  await p.waitForTimeout(300);
  assert((await status(p)) === "Say whether it's free to share first.", `with no answer: ${await status(p)}`);
  await p.locator("label:has(input[value=neither])").click();
  assert(await p.locator(".lx-share-book [data-variant=go]").last().isDisabled(), "Share pressable after Neither");
  await p.locator("label:has(input[value=pd])").click();
  await p.locator(".lx-share-book input[type=url]").fill("not a link");
  await press(p);
  await p.waitForTimeout(300);
  assert(/doesn't open a page/.test(await status(p)), `a link that isn't one: ${await status(p)}`);
  await p.locator(".lx-share-book input[type=url]").fill("example.org/bij-oma");
  await press(p);
  await p.getByRole("button", { name: "I agree" }).click({ timeout: 10_000 });
  await p.waitForSelector("[data-state=pending]", { timeout: 15_000 });
  assert(/^#explore\/book\//.test(await p.evaluate(() => location.hash)), `after sharing: ${await p.evaluate(() => location.hash)}`);
  await p.screenshot({ path: join(OUT, "08-pending.png") });
  await p.evaluate(() => (location.hash = "#explore/yours"));
  await p.waitForSelector("text=Books you've shared", { timeout: 15_000 });
  const yours = await p.locator(".lx-explore-yours").innerText();
  assert(/Bij oma/.test(yours) && /Waiting for an admin to look/.test(yours), `Yours: ${yours.slice(0, 300)}`);
  const mine = await http(learner, "GET", "/api/community/books/mine");
  const shared = mine.body.find((b) => b.title === "Bij oma");
  assert(shared?.state === "pending" && shared.source?.url === "https://example.org/bij-oma", `the share: ${JSON.stringify(shared).slice(0, 300)}`);
  await p.screenshot({ path: join(OUT, "09-yours-shared.png") });
});

const other = account(`Other ${run}`);
const second = await phoneFor(other);
page = second.p;
await stage("the same text from another account: refused as being looked at, in words (no id, no field's name)", async () => {
  const p = second.p;
  await shareMine(p);
  await p.locator("label:has(input[value=pd])").click();
  await p.locator(".lx-share-book input[type=url]").fill("https://example.org/bij-oma");
  await press(p);
  await p.getByRole("button", { name: "I agree" }).click({ timeout: 10_000 });
  await p.waitForFunction(() => /being looked at/.test([...document.querySelectorAll(".lx-share-book [role=status]")].map((n) => n.textContent).join(" ")), null, { timeout: 15_000 });
  const said = await status(p);
  assert(!/text-|\(|source\.|rights\./.test(said), `the refusal names code: ${said}`);
  await p.screenshot({ path: join(OUT, "10-same-text.png") });
  return { said };
});

const closedLearner = account(`Closed ${run}`);
const closed = await phoneFor(closedLearner, { closed: true });
page = closed.p;
await stage("sharing closed to this person: Yours has no texts to share, the share route goes to Yours; books still found, read and added", async () => {
  const p = closed.p;
  const id = await p.evaluate(async (text) => {
    const { bookFromText } = await import("/js/read/import-text.js");
    const store = await import("/js/read/store.js");
    const book = await bookFromText(text, { title: "Bij oma", lang: "nl" });
    await store.addBook(book);
    return book.id;
  }, MINE);
  await p.evaluate(() => (location.hash = "#explore/yours"));
  await p.waitForTimeout(2000);
  const yours = await p.locator("[data-part='page']").last().innerText();
  assert(!/Books of yours to share/.test(yours) && !/Bij oma/.test(yours), `Yours with sharing closed: ${yours.slice(0, 300)}`);
  await p.evaluate((id) => (location.hash = `#explore/share-book/${id}`), id);
  await p.waitForTimeout(1500);
  assert((await p.evaluate(() => location.hash)) === "#explore/yours", `the share route: ${await p.evaluate(() => location.hash)}`);
  const shown = await bookPage(p, ids.cat);
  assert(shown.lines.length > 0 && (await p.getByRole("button", { name: "Add to my library" }).count()) === 1, "a book's page with sharing closed");
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.join("\n"));
});

await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} FAILED` : `\nexplore-books-check: all ${results.length} stages passed`);
process.exit(failed.length ? 1 : 0);
