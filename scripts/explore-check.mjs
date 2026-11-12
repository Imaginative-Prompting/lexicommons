#!/usr/bin/env node
// Run it on a fresh state, migrations only, sharing open (below: "Its server"). On npm run local's copy at the launch setting, 13 of its
// stages failed for the copy, not the app, and an hour went into the wrong fixes (8 Nov).
// Explore in Chrome, against a LOCAL server and its own state: the home (search, the languages with their flags and
// counts, the pack to start with and its sentence, topics, shelves showing each pack once), a shelf's See all and a
// filter changing the list, search, an item's page (who, its language's flag, level, topics, its sentences with their
// literal lines and patterns, versions, Add pack pinned low), Add pack and Like (and what the server then holds), Make
// my own copy (a pack of yours, with where it came from), another language's home, the sharing terms, at phone width,
// with no console errors. It seeds Explore over HTTP first: an admin
// (written straight into D1) accepts the terms and shares two packs, and sets a section.
//
//   node scripts/explore-check.mjs http://localhost:<port> <outDir> --persist-to <the server's state dir>
//
// Its server: a fresh state with the migrations and nothing else (npx wrangler d1 migrations apply lexicommons --local --persist-to <dir>;
// not npm run local's copy, whose library is already in Explore), started with --var COMMUNITY_SHARING:everyone (its stages share, ask and
// suggest as learners do once sharing is open; the last one turns sharing off for a learner itself). Either missing is exit 2, said.
//
// Run through gpu.py's parallel lane (headless Chrome), sandbox off. Exit 0 = pass.

import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { localR2 } from "./fixtures/local-r2.mjs";
import { playToSummary } from "./fixtures/play-session.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
// Absolute, so files written here are found by commands run from the app's folder (wrangler, below).
const OUT = outArg && resolve(outArg);
// Resolved where it was typed: wrangler runs from the app's folder, where a relative path would make a state inside app/.
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
// The library's bucket through one local R2 in this process (scripts/fixtures/local-r2.mjs), not a wrangler launch per object.
const r2 = PERSIST ? localR2(APP, PERSIST) : null;
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) || !OUT || !PERSIST) {
  console.error("Usage: explore-check.mjs http://localhost:<port> <outDir> --persist-to <state dir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const sql = (command) => {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--json", "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
  return JSON.parse(out.slice(out.indexOf("[")))[0]?.results ?? [];
};
function account(name, { admin = false } = {}) {
  const id = `ex${randomBytes(6).toString("hex")}`;
  const cookie = randomBytes(24).toString("base64url");
  const now = Date.now();
  sql(
    [
      `INSERT INTO users (id, name, created_at) VALUES (${q(id)}, ${q(name)}, ${now - 30 * 86400_000})`,
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (${q(sha256(cookie))}, ${q(id)}, ${now}, ${now + 86400_000}, 'explore-check')`,
      ...(admin ? [`INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(id)}, 'admin', ${now}, 'd1', 'explore-check')`] : []),
    ].join("; "),
  );
  return { id, name, cookie };
}
// A connection dropped before any answer (a kept-alive socket the local server had closed: undici's "fetch failed" with no response, and
// nothing in the server's log) is tried once more; anything that got an answer, or fails twice, is the check's to report, with its cause.
const http = async (who, method, path, body) => {
  const send = () => fetch(`${BASE}${path}`, { method, headers: { Cookie: `lc_session=${who.cookie}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let response;
  try {
    response = await send();
  } catch (first) {
    try {
      response = await send();
    } catch (again) {
      throw new Error(`${method} ${path}: ${again.message} (${again.cause?.code ?? again.cause?.message ?? "no cause"}; first: ${first.cause?.code ?? first.cause?.message ?? first.message})`);
    }
    console.log(`  note  ${method} ${path}: the connection dropped before an answer (${first.cause?.code ?? first.cause?.message ?? first.message}); sent again`);
  }
  return { status: response.status, body: await response.json().catch(() => null) };
};

const results = [];
/** Every sheet still up on `p` closed (Escape, as a person closes one): a stage that failed with one open never hides the stages after it. */
async function closeSheets(p) {
  for (let k = 0; k < 4; k++) {
    const open = await p?.evaluate(() => Boolean(document.querySelector('.lx-sheet-layer:not([hidden]), [data-part="sheet"]:not([hidden]):not([data-state="closing"])'))).catch(() => false);
    if (!open) return;
    await p.keyboard.press("Escape").catch(() => {});
    await p.waitForTimeout(500);
  }
}
const stage = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`  ok    ${name}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    console.log(`  FAIL  ${name}: ${error.message.split("\n")[0]}`);
    await page?.screenshot({ path: join(OUT, `fail-${results.length}.png`), fullPage: true }).catch(() => {});
    // (A failure with a sheet up once left it open, and every stage after it typed into its field and timed out behind it: 8 Nov.)
    await closeSheets(page);
  }
};
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};
const eq = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), `${message}\n  got:  ${JSON.stringify(a)?.slice(0, 300)}\n  want: ${JSON.stringify(b)?.slice(0, 300)}`);

// ---------- seeding ----------

const NL = JSON.parse(readFileSync(join(APP, "scripts/fixtures/packs/check-nl.json"), "utf8"));
const DE = JSON.parse(readFileSync(join(APP, "scripts/fixtures/packs/check-de.json"), "utf8"));
const curator = account("Explore Curator", { admin: true });
const learner = account("Explore Learner");
await http(curator, "POST", "/api/community/terms", { version: 1 });
// What it needs of its server, said rather than failed through stage by stage (8 Nov: run on npm run local's copy at the launch setting, 13
// stages failed for the copy, not the app).
{
  const me = (await http(learner, "GET", "/api/me")).body;
  const listed = await fetch(`${BASE}/library/catalogue.json`, { headers: { Cookie: `lc_session=${learner.cookie}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const packsThere = Object.values(listed?.packs ?? {}).flat().length;
  if (me?.mayShare !== true) {
    console.error("NOT REACHED: a learner can't share on this server: start it with --var COMMUNITY_SHARING:everyone");
    process.exit(2);
  }
  if (packsThere) {
    console.error(`NOT REACHED: this state has a library already (${packsThere} packs in its catalog): run on a fresh state, the migrations only`);
    process.exit(2);
  }
}
const sharedNl = await http(curator, "POST", "/api/community/share", { pack: NL, level: "A1", topics: ["food"] });
const second = structuredClone(NL);
second.id = "check-nl-travel";
second.name = "Dutch on the move";
second.about = "A second Dutch check pack, at A2.";
second.items = second.items.map((item) => ({ ...item, means: `${item.means} (on the move)` }));
const sharedSecond = await http(curator, "POST", "/api/community/share", { pack: second, level: "A2", topics: ["travel"] });
const sharedDe = await http(curator, "POST", "/api/community/share", { pack: DE, level: "A1", topics: ["everyday"] });
if (![sharedNl, sharedSecond, sharedDe].every((r) => r.status === 200)) {
  console.error(`explore-check couldn't seed Explore: ${JSON.stringify([sharedNl, sharedSecond, sharedDe].map((r) => r.body)).slice(0, 600)}`);
  process.exit(2);
}
sql(`INSERT INTO explore_sections (id, title, rank, items, updated_by, updated_at) VALUES ('start-here', 'Start here', 0, ${q(JSON.stringify([second.id]))}, ${q(curator.id)}, ${Date.now()})`);

// ---------- the browser ----------

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await context.addCookies([{ name: "lc_session", value: learner.cookie, url: BASE }]);
const page = await context.newPage();
const errors = [];
// The one 404 a stage asks for (an item that isn't there) is the point of that stage, not an error.
page.on("console", (m) => m.type() === "error" && !(m.location()?.url ?? "").endsWith("/api/community/items/no-such-pack") && errors.push(`${m.text()} (${m.location()?.url ?? ""})`));
page.on("pageerror", (e) => errors.push(String(e)));
const text = () => page.locator('[data-part="page"]').innerText();
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });

// A flag that drew: an image of its language's flag, beside its name.
// Flags load on demand, so wait for this one to arrive (or fail) before reading it.
const flagOk = (locator) =>
  locator.evaluate(
    (img) =>
      new Promise((resolve) => {
        const ok = () => resolve(img.naturalWidth > 0 && img.getAttribute("alt") === "" && img.getAttribute("src"));
        if (img.complete) return ok();
        img.addEventListener("load", ok, { once: true });
        img.addEventListener("error", () => resolve(false), { once: true });
        setTimeout(ok, 10_000);
      }),
  );

/** Lesson 1 done on this device, as a learner a day in has it: Explore's "Add next" waits for it (explore.js, 11 Nov 2026). */
async function lessonOneDone(p) {
  for (const start = Date.now(); ; await p.waitForTimeout(250)) {
    const done = await p.evaluate(async () => {
      const { lessonsComing } = await import("/js/study/packs.js");
      const { pathLessons } = await import("/js/study/path.js");
      const lessons = pathLessons();
      // The path's own lessons, never the stand-in a first sync lays out while they're on their way (a word band's starter lessons, while
      // packs.js lessonsComing): marking that one left the real lesson 1 undone after a reload. With no library, the starter's own path.
      if (lessonsComing() || !lessons.length) return false;
      const { lessonFinished, markLessonsDone } = await import("/js/study/plan.js");
      if (!lessonFinished(lessons[0])) markLessonsDone(lessons.slice(0, 1));
      return lessonFinished(lessons[0]);
    });
    if (done) return;
    if (Date.now() - start > 30_000) throw new Error("the path's lessons never came, to mark lesson 1 done");
  }
}

/** A pack's page keeps its corrections, versions and about a press away (the item's stage presses them): everywhere after it, they're open, so what's in them can be read and pressed. */
const openQuiet = async (p) => {
  const run = () => new MutationObserver(() => document.querySelectorAll(".lx-quiet-more:not([open])").forEach((more) => (more.open = true))).observe(document, { childList: true, subtree: true });
  await p.addInitScript(run);
  await p.evaluate(run);
};

await stage("the home: search, the topics as books with the pack to start face-out (once lesson 1 is done; before it, none), what learners shared, each pack once, in the language being learned; the other languages with their flags a row away", async () => {
  // A brand-new learner: the home with its topics, and no pack to add next before lesson 1.
  await page.goto(`${BASE}/app/#explore`);
  await page.locator('[data-part="page"]:not([data-ghost]) .lx-explore-topics').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  const face = () => page.locator('[data-part="page"]:not([data-ghost]) .lx-face').count();
  assert(!(await face()), `a pack to add next before lesson 1: ${await page.locator(".lx-pick").first().innerText().catch(() => "")}`);
  // Lesson 1 done with Explore on the screen: not drawn into it under the eye; back on it (kept, no reload), it's there.
  await page.evaluate(() => (globalThis.__sameLoad = true));
  await lessonOneDone(page);
  await page.waitForTimeout(1200);
  assert(!(await face()), "the pack to add next was drawn into Explore under the eye as lesson 1 was done");
  await page.goto(`${BASE}/app/#today`);
  await page.waitForFunction(() => location.hash === "#today");
  await page.goto(`${BASE}/app/#explore`);
  await page.locator('[data-part="page"]:not([data-ghost]) .lx-face').waitFor({ timeout: 15_000 });
  assert(await page.evaluate(() => globalThis.__sameLoad === true), "Explore was reloaded to show the pack to add next");
  const featured = await page.locator('.lx-pick[data-pick]').innerText();
  assert(featured.includes("Add next") && featured.includes("Dutch on the move") && featured.includes("3 sentences"), `the pack to start with (the curated one): ${featured}`);
  assert(await page.locator('.lx-face [data-part="pack-cover"]').count() === 1, "its cover");
  // Every language, Dutch first (learning, its flag), each with how many packs it has, from a row at the foot.
  await page.locator('[data-part="list-row"]', { hasText: /^Change target language/ }).click();
  try {
    const languages = page.locator('[data-part="sheet"]').last();
    const first = languages.locator('[data-part="list-row"]').first();
    await first.waitFor();
    assert((await first.innerText()).replace(/\s+/g, " ").startsWith("Dutch") && /Learning/.test(await first.innerText()) && (await first.locator('[data-part="language-flag"]').getAttribute("src")) === "/flags/4x3/nl.svg", `Dutch first: ${await first.innerText()}`);
    assert(await flagOk(first.locator('[data-part="language-flag"]')), "the flag drew");
    await languages.locator('input[aria-label="Find a language"]').fill("germ");
    const german = languages.locator('[data-part="list-row"]', { hasText: "German" });
    await german.waitFor();
    // How many, as the server counts German's packs (on a state with the library in it, German's own lessons and starter count too).
    const germanPacks = (await http(learner, "GET", "/api/community/languages")).body.find?.((row) => row.lang === "de")?.packs;
    assert(typeof germanPacks === "number" && germanPacks > 0, `the server's count of German's packs: ${germanPacks}`);
    const said = germanPacks === 1 ? "1 pack" : `${germanPacks} packs`;
    assert((await german.innerText()).includes(said) && (await german.locator('[data-part="language-flag"]').getAttribute("src")) === "/flags/4x3/de.svg", `German: ${await german.innerText()} (want ${said})`);
  } finally {
    await closeSheets(page);
  }
  // The topics as books (those with packs in Dutch, as the server counts them), then what learners shared: the pack to start isn't there again.
  const titles = await page.locator('[data-part="page"] [data-part="section-title"]').allInnerTexts();
  assert(titles.includes("Shared by learners") && !titles.includes("Start here"), `the sections: ${titles.join(", ")}`);
  const counted = (await http(learner, "GET", "/api/community/explore?lang=nl")).body.topics ?? [];
  const shownTopics = await page.locator('[data-part="page"] nav.lx-topics .lx-topic .lx-topic-name').allInnerTexts();
  assert(counted.length > 0 && JSON.stringify(shownTopics) === JSON.stringify(counted.slice(0, 6).map((t) => t.name)), `the topic cards: ${JSON.stringify({ shownTopics, counted })}`);
  const cards = await page.locator(".lx-cover-card").evaluateAll((cs) => cs.map((c) => c.innerText.replace(/\s+/g, " ").trim()));
  assert(cards.length === 1 && /A check pack \(Dutch\)/.test(cards[0]) && /by Explore Curator/.test(cards[0]), `the shelves: ${JSON.stringify(cards)}`);
  assert(await page.locator('.lx-cover-card [data-part="pack-cover"][data-generic]').count() === 1 && !(await page.locator('[data-part="page"] [data-part="book-cover"]').count()), "a learner's pack's cover in the app's art, no flat designed cover");
  const body = await text();
  assert(!body.includes("A check pack (German)"), "the German one doesn't (Dutch is the language being learned)");
  await shot("01-home");
});

// A cover as drawn: its drawing in it, no held place left (explore.js drawnWhole stands a held place in until the drawing has loaded).
const coverState = (cover) => ({ held: cover.hasAttribute("data-held"), holds: cover.querySelectorAll('[data-part="skeleton"]').length, art: Boolean(cover.querySelector('svg, [data-part="picture"], .lx-generic-book')) });
const coverDrawn = (state) => Boolean(state) && !state.held && !state.holds && state.art;
/** The pack to add next's cover on the page shown, once it's drawn or `ms` have gone. */
async function pickCover(p, ms = 6000) {
  const read = () => p.locator('[data-part="page"]:not([data-ghost]) .lx-pick[data-pick] [data-part="pack-cover"]').first().evaluate(coverState).catch(() => null);
  let state = await read();
  for (const start = Date.now(); !coverDrawn(state) && Date.now() - start < ms; state = await read()) await p.waitForTimeout(200);
  return state;
}

await stage("the pack to add next's cover is drawn, not a held place: for the learner above, and for one whose lesson 1 is done while Explore is a kept tab (the home drawn again off the screen); a planted held cover caught first", async () => {
  // The reader can fail: a cover as explore.js holds it while its drawing loads, planted, isn't drawn; with a drawing in it, it is.
  await page.evaluate(() => {
    const part = (tag, attrs, ...kids) => {
      const node = document.createElement(tag);
      for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
      node.append(...kids);
      return node;
    };
    const box = part("div", { id: "lx-check-plant", hidden: "" });
    box.append(
      part("span", { id: "lx-plant-held", "data-part": "pack-cover", "data-held": "" }, part("div", { "data-part": "skeleton", "data-holds": "picture" })),
      part("span", { id: "lx-plant-drawn", "data-part": "pack-cover" }, part("span", { class: "lx-generic-art" }, part("span", { "data-part": "picture" }, document.createElementNS("http://www.w3.org/2000/svg", "svg")))),
    );
    document.body.append(box);
  });
  const planted = { held: await page.locator("#lx-plant-held").evaluate(coverState), drawn: await page.locator("#lx-plant-drawn").evaluate(coverState) };
  await page.evaluate(() => document.getElementById("lx-check-plant")?.remove());
  assert(!coverDrawn(planted.held) && coverDrawn(planted.drawn), `the cover's reader: ${JSON.stringify(planted)}`);
  // The learner above: lesson 1 done with Explore on the screen, the pick drawn when the page next came.
  await page.goto(`${BASE}/app/#explore`);
  await page.locator('[data-part="page"]:not([data-ghost]) .lx-face').waitFor({ timeout: 15_000 });
  const onReturn = await pickCover(page);
  assert(coverDrawn(onReturn), `the pack to add next's cover, drawn when the page came back: ${JSON.stringify(onReturn)}`);
  // Another new learner: Explore opened, then another tab (Explore kept, off the page), lesson 1 done there, then Explore again with no reload.
  // The kept home is drawn again with its pick while it's off the page; its cover's drawing loads then, and must still be in it when the page
  // comes back (11 Nov 2026: ui.arrive leaves a place off the page alone, and the cover stayed a blank held place until a reload).
  // Its home as the live one is: the pack to add next is the server's featured pack, one of Lexicommons' own, and stands on no shelf before
  // lesson 1, so its cover's drawing is first asked for when the home is drawn again. (This check's own pick heads a curated shelf, shown
  // before lesson 1, and its drawing was in memory by then: the stage passed on the fault.)
  const kept = account("Explore Kept Tab");
  const c = await context.browser().newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.route((u) => u.pathname === "/api/community/explore", async (route) => {
    const r = await route.fetch();
    const body = await r.json();
    const first = body.sections?.find((section) => section.items?.length);
    if (!first) return route.fulfill({ response: r, json: body });
    const pick = { ...first.items[0], curated: true };
    const own = (items) => (items ?? []).map((item) => (item.id === pick.id ? { ...item, curated: true } : item));
    await route.fulfill({ response: r, json: { ...body, sections: [], feature: { item: pick, why: null }, popular: own(body.popular), new: own(body.new) } });
  });
  await c.addCookies([{ name: "lc_session", value: kept.cookie, url: BASE }]);
  const p = await c.newPage();
  let where = null;
  try {
    await p.goto(`${BASE}/app/#explore`);
    await p.locator('[data-part="page"]:not([data-ghost]) .lx-explore-topics').first().waitFor({ timeout: 15_000 });
    await p.waitForTimeout(1500);
    assert(!(await p.locator('[data-part="page"]:not([data-ghost]) .lx-face').count()), "a pack to add next before lesson 1 (the kept tab's learner)");
    assert(!(await p.locator('[data-part="page"]:not([data-ghost])').innerText()).includes("Dutch on the move"), "the pack to add next stands on a shelf before lesson 1: its drawing is in memory, and this stage can't see the fault");
    // Explore's own host, kept by the router while another page shows: read below for where the pick was drawn.
    await p.evaluate(() => {
      globalThis.__sameLoad = true;
      globalThis.__exploreHost = document.querySelector('[data-part="page"]:not([data-ghost]) .lx-explore-topics').closest(".lx-view");
    });
    // Lesson 1 as a learner does it: a real session from the path, played to its summary (its answers and its end are the changes
    // explore.js pickCheck hears; marking the lesson done by hand drew the pick only when the page came back, on the page).
    await p.goto(`${BASE}/app/#study/session/lesson`);
    await p.locator('[data-part="session"]').waitFor({ timeout: 30_000 });
    await playToSummary(p, { session: '[data-part="session"]' });
    // pickCheck draws a beat (300 ms) after the last change; the cover's drawing loads after that.
    await p.waitForTimeout(2500);
    where = await p.evaluate(() => ({ hostOnPage: Boolean(globalThis.__exploreHost?.isConnected), pickDrawn: Boolean(globalThis.__exploreHost?.querySelector(".lx-pick[data-pick]")) }));
    await p.goto(`${BASE}/app/#explore`);
    await p.locator('[data-part="page"]:not([data-ghost]) .lx-face').waitFor({ timeout: 15_000 });
    assert(await p.evaluate(() => globalThis.__sameLoad === true), "Explore was reloaded to show the pack to add next (the kept tab's learner)");
    const offScreen = await pickCover(p);
    await p.screenshot({ path: join(OUT, "01-home-kept-tab.png"), fullPage: true });
    assert(coverDrawn(offScreen), `the pack to add next's cover after lesson 1 was done with Explore a kept tab: ${JSON.stringify(offScreen)} (a held place with no drawing: blank until a reload); the pick drawn off the page: ${JSON.stringify(where)}`);
  } finally {
    await c.close();
  }
  return `the kept tab's pick drawn off the page: ${where?.pickDrawn && !where?.hostOnPage}`;
});

await stage("every pack in Dutch, then a filter: Level → A1 changes the list (and the address, so Back undoes it)", async () => {
  await page.locator('[data-part="list-row"]', { hasText: /^All packs$/ }).click();
  await page.waitForFunction(() => location.hash.startsWith("#explore/browse") && location.hash.includes("sort=popular"));
  await page.getByRole("button", { name: /^Level: Any$/ }).click();
  await page.locator('[data-part="sheet"] label', { hasText: /^A1$/ }).click();
  await page.waitForFunction(() => location.hash.startsWith("#explore/browse") && location.hash.includes("level=A1"));
  // The address changes before the page is drawn: wait for the browse page's own filter, then its rows.
  await page.getByRole("button", { name: /^Level: A1$/ }).waitFor();
  await page.locator('[data-part="page"] [data-part="list"] .lx-row-title').first().waitFor();
  const titles = await page.locator('[data-part="page"] [data-part="list"] .lx-row-title').allInnerTexts();
  assert(titles.length === 1 && titles[0] === "A check pack (Dutch)", `A1 in Dutch: ${titles.join(", ")}`);
  await shot("02-level-a1");
  await page.goBack();
  await page.waitForFunction(() => location.hash.startsWith("#explore/browse") && !location.hash.includes("level=A1"));
  await page.goto(`${BASE}/app/#explore`);
  await page.locator(".lx-face").waitFor();
});

await stage("search: words from the title, any case, in the language being learned, under Packs named (explore-browse-check holds a word's packs and a topic)", async () => {
  // Search filters Explore's own page in place (G2): the field there, Enter, and the packs named so under it, nothing else of the home.
  const field = page.locator('[data-part="page"]:not([hidden]) [data-part="search-field"] input[type="search"]');
  await field.fill("MOVE");
  await field.press("Enter");
  await page.locator('[data-part="page"]:not([hidden]) [data-part="section-title"]', { hasText: "Packs named “MOVE”" }).waitFor();
  await page.locator('[data-part="page"]:not([hidden]) .lx-row-title', { hasText: "Dutch on the move" }).waitFor();
  const titles = await page.locator('[data-part="page"]:not([hidden]) .lx-explore-body > :not([hidden]) [data-part="list"] .lx-row-title').allInnerTexts();
  assert(titles.length === 1, `one result: ${titles.join(", ")}`);
  await shot("03-search");
});

await stage("an item's page: who, level, topics, counts, the sample with its literal line, its versions, the license", async () => {
  await page.locator('[data-part="page"] .lx-row-title', { hasText: "Dutch on the move" }).click();
  await page.waitForFunction(() => location.hash.startsWith("#explore/item/"));
  await page.locator('[data-part="page-title"]', { hasText: "Dutch on the move" }).waitFor();
  // Its cover, its name and who made it first; the rest a press away, and it stays open through a redraw.
  assert(await page.locator('.lx-pack-head [data-part="pack-cover"]').count() === 1, "its cover");
  for (const more of await page.locator(".lx-quiet-more > summary").all()) await more.click();
  const body = await text();
  assert(/Dutch · Level A2 · 3 sentences · by Explore Curator/.test(body) && /Travel/.test(body), "language, level, size, who; its topic");
  assert(/3 sentences/.test(body) && /with the literal line/.test(body), "its counts");
  assert(body.includes("Het meisje speelt met een balletje"), "the sample's first sentence");
  assert(/Version 1/.test(body) && /the first/.test(body), "its version");
  assert(/CC BY-SA 4\.0: anyone may use, change and share it, crediting Explore Curator/.test(body), "the license, with the credit");
  assert(await flagOk(page.locator('.lx-explore-facts [data-part="language-flag"]')), "its language's flag, beside its name");
  // What's in it: its sentences, and the patterns they use once the pack's own file has come.
  await page.locator('[data-part="page"] .lx-qs-focus [data-part="concept-tag"]').first().waitFor();
  const rows = await page.locator('[data-part="page"] [data-part="sentence-row"]').count();
  assert(rows === 3, `${rows} sentences`);
  // Add pack, in reach: pinned low, clear of the floating bar, and still there scrolled to the end. Nothing presses through it.
  const pinned = page.locator('[data-part="pinned-actions"]');
  assert((await pinned.innerText()).includes("Add pack"), "Add pack, pinned");
  const tabs = await page.locator('[data-part="tab-bar"]').boundingBox();
  const buttons = await pinned.locator(".lx-pinned-buttons").boundingBox();
  assert(buttons && tabs && buttons.y + buttons.height <= tabs.y - 4, `its buttons clear of the bar: ${JSON.stringify({ buttons, tabs })}`);
  const through = await pinned.evaluate((node) => {
    const button = node.querySelector('[data-part="button"]').getBoundingClientRect();
    const at = document.elementFromPoint(button.left + button.width / 2, button.top + button.height / 2);
    return Boolean(at?.closest('[data-part="pinned-actions"]'));
  });
  assert(through, "a press on Add pack should land on it, not on what's under it");
  await page.evaluate(() => (document.querySelector('[data-part="page"]').scrollTop = 1e6));
  const end = await pinned.boundingBox();
  assert(end && end.y + end.height <= tabs.y + 1 && end.y > 0, `at the end, in view: ${JSON.stringify({ end, tabs })}`);
  await page.evaluate(() => (document.querySelector('[data-part="page"]').scrollTop = 0));
  await shot("04-item");
});

await stage("Add pack: the button says Added, the account follows it (the ref a device loads), and it counts", async () => {
  await openQuiet(page);
  await page.getByRole("button", { name: /^Add pack$/ }).click();
  await page.getByRole("button", { name: /^Added$/ }).waitFor();
  await page.locator(".lx-settings-message", { hasText: "Added: it's in your studying now." }).waitFor();
  const following = (await http(learner, "GET", "/api/community/following")).body;
  assert(following.length === 1 && following[0].id === second.id && /^[0-9a-f]{12}$/.test(following[0].version), `the account's follows: ${JSON.stringify(following)}`);
  assert(/added by 1 person/.test(await text()), "added by one person");
  // On this device at once (study/packs.js followPack), not only at the next sync.
  const onDevice = () => page.evaluate(async () => (await import("/js/study/packs.js")).libraryPacks().map((p) => (p.pack ?? p).id));
  assert((await onDevice()).includes(second.id), `on the device: ${JSON.stringify(await onDevice())}`);
  await page.getByRole("button", { name: /^Added$/ }).click();
  await page.getByRole("button", { name: /^Add pack$/ }).waitFor();
  assert((await http(learner, "GET", "/api/community/following")).body.length === 0, "unfollowed");
  assert(!(await onDevice()).includes(second.id), "and off the device");
  await page.getByRole("button", { name: /^Add pack$/ }).click();
  await page.getByRole("button", { name: /^Added$/ }).waitFor();
});

await stage("community corrections on a follow: the device plays the open fix, keeps it through a reload, and the pack as published once it's off", async () => {
  const fixer = account("Explore Fixer", { admin: true });
  sql(`INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (${q(fixer.id)}, 1, ${Date.now()})`);
  const item = second.items[0];
  const fix = await http(fixer, "POST", `/api/community/items/${second.id}/corrections`, { path: `items/${item.id}/means`, kind: "fix", value: `${item.means} (corrected)` });
  assert(fix.status === 200, `a fix: ${JSON.stringify(fix.body)}`);
  const view = () =>
    page.evaluate(async ([id, itemId]) => {
      const pack = (await import("/js/study/packs.js")).allPacks().find((p) => p.id === id);
      return { natural: pack?.items.find((i) => i.id === itemId)?.means, applied: pack?.origin?.corrections ?? null };
    }, [second.id, item.id]);
  const follow = async (corrections) => {
    const ref = (await http(learner, "POST", `/api/community/items/${second.id}/follow`, { corrections })).body;
    return page.evaluate(async (r) => (await import("/js/study/packs.js")).followPack(r), ref);
  };
  assert((await follow("community")).ok, "followed with community corrections");
  const on = await view();
  assert(on.natural === `${item.means} (corrected)` && on.applied?.includes(fix.body.id), `the fix in what studying sees: ${JSON.stringify(on)}`);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  let again = null;
  for (let i = 0; i < 40; i++) {
    again = await view();
    if (again.natural === `${item.means} (corrected)`) break;
    await page.waitForTimeout(250);
  }
  eq(again.natural, `${item.means} (corrected)`, "through a reload (the fixes kept beside the copy)");
  // The device's own sync, run to its end (it's what applies the account's follows and their fixes): waited on as a
  // state, so a sync still under way from the reload can't land on top of what's checked next, under load too.
  const synced = () => page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  await synced();
  // A kept fix that makes working them in throw: loading goes on, with the pack as published (and every other pack).
  const stored = () =>
    page.evaluate(async () => {
      const request = (r) => new Promise((ok, no) => ((r.onsuccess = () => ok(r.result)), (r.onerror = () => no(r.error))));
      const db = await request(indexedDB.open("lexicommons-packs"));
      const keys = await request(db.transaction("packs").objectStore("packs").getAllKeys());
      db.close();
      return keys;
    });
  const before = { stored: await stored(), library: await page.evaluate(async () => (await import("/js/study/packs.js")).libraryPacks().map((p) => p.id)) };
  await page.evaluate(async (key) => {
    const request = (r) => new Promise((ok, no) => ((r.onsuccess = () => ok(r.result)), (r.onerror = () => no(r.error))));
    const db = await request(indexedDB.open("lexicommons-packs"));
    const record = await request(db.transaction("packs").objectStore("packs").get(key));
    record.fixes = { version: record.source.version, fixes: [null] };
    await request(db.transaction("packs", "readwrite").objectStore("packs").put(record));
    db.close();
  }, `library:${second.id}`);
  const loaded = await page.evaluate(async (id) => {
    const packs = await import("/js/study/packs.js");
    const count = await packs.loadPacks();
    const pack = packs.allPacks().find((p) => p.id === id);
    return { count, ids: packs.allPacks().map((p) => p.id), refused: packs.packProblems().map((r) => r.id) };
  }, second.id);
  // Every pack stored loaded again (none refused), this one among them, and the starter beside it.
  assert(loaded.count === before.stored.length && loaded.ids.includes(second.id) && loaded.ids.includes("starter-word-order") && !loaded.refused.length, `loaded on: ${JSON.stringify({ loaded, before, after: await stored() })}`);
  eq(await view(), { natural: item.means, applied: null }, "a fix that throws: the pack as published");
  assert((await follow("published")).ok, "back to the pack as published");
  // Two syncs in a row: the second starts after the follow, so it reads the account's follow as published.
  await synced();
  await synced();
  eq(await view(), { natural: item.means, applied: null }, "the pack as published");
});

await stage("corrections on a pack's page: a sentence's … suggests a fix or flags it, the section lists them with their menus, one liked and one reported, its author accepts the fix and declines the flag, community corrections switched on in More", async () => {
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const as = async (who) => {
    const c = await context.browser().newContext(phone);
    await c.addCookies([{ name: "lc_session", value: who.cookie, url: BASE }]);
    const p = await c.newPage();
    p.on("console", (m) => m.type() === "error" && errors.push(`${who.name}: ${m.text()}`));
    await p.addInitScript(() => new MutationObserver(() => document.querySelectorAll(".lx-quiet-more:not([open])").forEach((more) => (more.open = true))).observe(document, { childList: true, subtree: true }));
    return { c, p };
  };
  const said = (p, re) => p.locator(".lx-settings-message", { hasText: re }).waitFor();
  const url = `${BASE}/app/#explore/item/${second.id}`;
  const section = (p) => p.locator(".lx-explore-corrections");
  const fixed = `${second.items[1].means} (from the page)`;
  // Someone who isn't its author (sharing is open to admins here) suggests a fix to a sentence's natural line, and flags another.
  const suggester = account("Explore Suggester", { admin: true });
  sql(`INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (${q(suggester.id)}, 1, ${Date.now()})`);
  const { c: sc, p: sp } = await as(suggester);
  await sp.goto(url);
  await section(sp).getByText(/None yet|Suggested by/).waitFor();
  await sp.getByRole("button", { name: "More about this sentence" }).nth(1).click();
  await sp.getByRole("button", { name: /^Suggest a fix/ }).click();
  await sp.locator('textarea[aria-label="The natural line"]').fill(fixed);
  await sp.waitForTimeout(700); // the sheet settled, for the picture
  await sp.screenshot({ path: join(OUT, "13a-suggest-a-fix.png") });
  // Pressed twice: one fix (the button is off while it's out).
  await sp.getByRole("button", { name: "Send fix" }).dblclick();
  await said(sp, /your fix is with its author/);
  await section(sp).getByText(`“${fixed}”`).waitFor();
  eq(sql(`SELECT COUNT(*) AS n FROM corrections WHERE item_id = ${q(second.id)} AND value LIKE ${q("%(from the page)%")}`)[0].n, 1, "one fix for a double press");
  await sp.getByRole("button", { name: "More about this sentence" }).nth(2).click();
  await sp.getByRole("button", { name: /^Flag it/ }).click();
  await sp.locator('textarea[aria-label="What\'s wrong"]').fill("The literal line skips a word.");
  await sp.getByRole("button", { name: "Send flag" }).click();
  await said(sp, /your flag is with its author/);
  await section(sp).getByText("Flag: The literal line skips a word.").waitFor();
  await section(sp).evaluate((node) => node.scrollIntoView({ block: "start" }));
  await sp.waitForTimeout(300);
  await sp.screenshot({ path: join(OUT, "13-corrections-suggested.png") });
  await sc.close();
  // The learner sees both: likes the fix, reports the flag (a correction's own menu). (The page is on this pack's
  // address already, so it's reloaded: going to the same address wouldn't draw it again.)
  await page.goto(url);
  await page.reload();
  await section(page).getByText(`“${fixed}”`).waitFor();
  await section(page).getByRole("button", { name: new RegExp(fixed.replace(/[()]/g, "\\$&")) }).click();
  await page.getByRole("button", { name: /^Like it/ }).waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, "13b-a-correction-s-menu.png") });
  await page.getByRole("button", { name: /^Like it/ }).click();
  await said(page, /^Liked\./);
  await section(page).getByText("1 like").waitFor();
  await section(page).getByRole("button", { name: /Flag: The literal line skips a word\./ }).click();
  await page.getByRole("button", { name: /^Report it/ }).click();
  await page.getByText("Spam, or not what it says").click();
  await page.getByRole("button", { name: "Send report" }).click();
  await said(page, /It's with the moderators/);
  // Its author: accepts the fix (a new version) and declines the flag, saying why.
  const { c: oc, p: op } = await as(curator);
  // The page's first load still fetching its file when the accept loads the page again: that file is held until after,
  // and the page it arrives on must stay the new version's.
  let release;
  const held = new Promise((resolve) => (release = resolve));
  let heldUrl = null;
  // The page says when it has read a file whole (Response.json resolved), so the check waits on that, not on headers.
  await op.addInitScript(() => {
    const json = Response.prototype.json;
    window.__readWhole = [];
    Response.prototype.json = async function () {
      const value = await json.call(this);
      window.__readWhole.push(this.url);
      return value;
    };
  });
  await op.route(`**/library/packs/${second.id}/*/pack.json`, async (route) => {
    if (heldUrl === null) {
      heldUrl = route.request().url();
      await held;
    }
    await route.continue();
  });
  await op.goto(url);
  await section(op).getByText(/Suggested for your pack/).waitFor();
  await section(op).getByRole("button", { name: new RegExp(fixed.replace(/[()]/g, "\\$&")) }).click();
  await op.getByRole("button", { name: /^Accept it/ }).click();
  await said(op, /Accepted: it's in the new version/);
  await op.getByText(/^Version 2/).first().waitFor();
  await op.locator(".lx-explore-sentences").getByText(fixed, { exact: true }).waitFor();
  assert(heldUrl, "the first load's file was held");
  release();
  // Read whole by the page, then its loader's turn (a task, two frames): an older version would be drawn by then.
  await op.waitForFunction((u) => window.__readWhole.includes(u), heldUrl);
  await op.evaluate(() => new Promise((resolve) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 0)));
  assert((await op.getByText(/^Version 2/).count()) > 0 && (await op.locator(".lx-explore-sentences").getByText(fixed, { exact: true }).count()) === 1, "the held first file arrived after the accept: still the new version");
  await section(op).getByRole("button", { name: /Flag: The literal line skips a word\./ }).click();
  await op.getByRole("button", { name: /^Decline it/ }).click();
  await op.locator('textarea[aria-label="Why"]').fill("The literal line follows the Dutch word for word.");
  await op.getByRole("button", { name: /^Decline$/ }).click();
  await said(op, /Declined, with your reason/);
  await section(op).evaluate((node) => node.scrollIntoView({ block: "start" }));
  await op.waitForTimeout(300);
  await op.screenshot({ path: join(OUT, "14-corrections-answered.png") });
  await oc.close();
  const states = sql(`SELECT kind, state FROM corrections WHERE item_id = ${q(second.id)} AND (value LIKE ${q("%(from the page)%")} OR note = ${q("The literal line skips a word.")}) ORDER BY kind`);
  eq(states.map((r) => `${r.kind}:${r.state}`).sort(), ["fix:accepted", "flag:declined"], "accepted and declined");
  // More, on an added pack: community corrections on, and still on after a reload.
  await page.reload();
  await page.getByRole("button", { name: /^More$/ }).click();
  const toggle = page.getByRole("switch", { name: /Use community corrections/ });
  assert(!(await toggle.isChecked()), "off to begin with (as published)");
  await toggle.click();
  await said(page, /Community corrections on/);
  await page.reload();
  await page.getByRole("button", { name: /^More$/ }).click();
  assert(await page.getByRole("switch", { name: /Use community corrections/ }).isChecked(), "still on after a reload");
  await page.waitForTimeout(700);
  await shot("15-community-corrections-on");
  // What studying sees of the sentence the earlier stage's open fix is on, once it's what's wanted (a draw settles).
  const studied = async (want) => {
    let natural;
    for (let i = 0; i < 40; i++) {
      natural = await page.evaluate(async ([id, itemId]) => (await import("/js/study/packs.js")).allPacks().find((p) => p.id === id)?.items.find((i) => i.id === itemId)?.means, [second.id, second.items[0].id]);
      if (natural === want) break;
      await page.waitForTimeout(250);
    }
    return natural;
  };
  eq(await studied(`${second.items[0].means} (corrected)`), `${second.items[0].means} (corrected)`, "on: studying plays the open fix");
  await page.getByRole("switch", { name: /Use community corrections/ }).click();
  await said(page, /Community corrections off/);
  eq(await studied(second.items[0].means), second.items[0].means, "off: the pack as published");
  await page.getByRole("switch", { name: /Use community corrections/ }).click();
  await said(page, /Community corrections on/);
  // Taken out and added again (no reload): a new follow is as published, and the switch says so.
  await page.reload();
  await page.getByRole("button", { name: /^Added$/ }).click();
  await page.getByRole("button", { name: /^Add pack$/ }).click();
  await page.getByRole("button", { name: /^Added$/ }).waitFor();
  await page.getByRole("button", { name: "More", exact: true }).click();
  assert(!(await page.getByRole("switch", { name: /Use community corrections/ }).isChecked()), "added again: off");
  eq((await http(learner, "GET", "/api/community/following")).body.find((f) => f.id === second.id)?.corrections, "published", "the account's follow: as published");
  await page.reload();
});

await stage("requests: the home's way in, the board, asking for a pack and for a book not on the shelf, \"me too\", answering with a pack of yours, new answers in Yours, done", async () => {
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const as = async (who) => {
    const c = await context.browser().newContext(phone);
    await c.addCookies([{ name: "lc_session", value: who.cookie, url: BASE }]);
    const p = await c.newPage();
    p.on("console", (m) => m.type() === "error" && errors.push(`${who.name}: ${m.text()}`));
    return { c, p };
  };
  const said = (p, re) => p.locator(".lx-settings-message", { hasText: re }).waitFor();
  const sheet = (p) => p.locator('[data-part="sheet"]').last();
  // Asking is sharing (its words are CC BY-SA too): sharing is open to admins here, and the terms are accepted.
  const asker = account("Explore Asker", { admin: true });
  sql(`INSERT INTO sharing_terms (user_id, terms_version, accepted_at) VALUES (${q(asker.id)}, 1, ${Date.now()})`);
  const { c: ac, p: ap } = await as(asker);
  await ap.goto(`${BASE}/app/#explore`);
  await ap.locator('[data-part="list-row"]', { hasText: "Ask for it" }).click();
  await ap.getByText(/Nobody has asked for anything in Dutch yet|What people are asking for in Dutch/).first().waitFor();
  // Asking for a pack (G9): the board's row opens a sheet with one question, what it should be about; a level if you like.
  await ap.locator('[data-part="list-row"]', { hasText: /^Ask for a pack/ }).click();
  await sheet(ap).locator('input[aria-label="What should it be about?"]').fill("Dutch for my train trip");
  await sheet(ap).locator('textarea[aria-label="Anything more (optional)"]').fill("Tickets, platforms, delays.");
  await sheet(ap).getByRole("button", { name: "A1", exact: true }).click();
  await ap.waitForTimeout(500);
  await ap.screenshot({ path: join(OUT, "16a-ask-for-a-pack.png") });
  await sheet(ap).getByRole("button", { name: /^Ask for it$/ }).click();
  await ap.locator("h1", { hasText: "Dutch for my train trip" }).waitFor();
  const asked = sql(`SELECT id, level, state FROM requests WHERE author_id = ${q(asker.id)} AND title = 'Dutch for my train trip'`)[0];
  assert(asked?.level === "A1" && asked.state === "open", `posted: ${JSON.stringify(asked)}`);
  // Asking for a book is choosing it (G9): a shelf book not in Dutch yet is a choice in the sheet itself, picked in place, and asking names the
  // request after it. Before, the books were a list inside the sheet behind a row, and picking one didn't take. The local shelf gets one book,
  // in English with a German layer only, and is put back after.
  const shelfWas = await (await fetch(`${BASE}/library/catalogue.json`, { headers: { Cookie: `lc_session=${asker.cookie}` } })).text();
  const shelf = (() => {
    try {
      return JSON.parse(shelfWas);
    } catch {
      return { format: "lexicommons-catalogue", v: 1, books: [], lists: {}, packs: {} };
    }
  })();
  const putShelf = (text) => r2.put("lexicommons-library", "catalogue.json", text, "application/json");
  const shelfBook = { id: "g9-check-book", version: "v1", title: "A Check Shelf Book", authors: ["A. Writer"], lang: "en", layers: { de: { kind: "weave", url: "/library/weaves/g9-check-book.de.json" } } };
  await putShelf(JSON.stringify({ ...shelf, books: [...(Array.isArray(shelf.books) ? shelf.books : []).filter((b) => b?.id !== shelfBook.id), shelfBook] }));
  try {
    await ap.goto(`${BASE}/app/#explore/requests?lang=nl`);
    await ap.locator('[data-part="list-row"]', { hasText: /^Ask for a book/ }).click();
    const choice = sheet(ap).locator("label.lx-row-control", { hasText: "A Check Shelf Book" });
    await choice.waitFor({ timeout: 15_000 });
    assert(!(await sheet(ap).locator(".lx-back").count()), "the books are behind a Back in the sheet");
    await choice.click();
    assert(await choice.locator('input[type="radio"]').isChecked(), "the shelf book didn't take when pressed");
    await ap.waitForTimeout(400);
    await ap.screenshot({ path: join(OUT, "16b-ask-for-a-book.png") });
    await sheet(ap).getByRole("button", { name: /^Ask for it$/ }).click();
    await ap.locator("h1", { hasText: "A Check Shelf Book" }).waitFor({ timeout: 15_000 });
    const book = sql(`SELECT kind, book_id, state FROM requests WHERE author_id = ${q(asker.id)} AND title = 'A Check Shelf Book'`)[0];
    assert(book?.kind === "book" && book.book_id === shelfBook.id && book.state === "open", `the shelf book's request: ${JSON.stringify(book)}`);
    // A book that isn't on the shelf: chosen last, named, it waits for an admin, and says so.
    await ap.goto(`${BASE}/app/#explore/requests?lang=nl`);
    await ap.locator('[data-part="list-row"]', { hasText: /^Ask for a book/ }).click();
    await sheet(ap).locator("label.lx-row-control", { hasText: "One that isn't on the shelf" }).click();
    await sheet(ap).locator('input[aria-label="The book\'s title"]').fill("A Little Old Book");
    await sheet(ap).getByRole("button", { name: /^Ask for it$/ }).click();
    await ap.getByText(/Waiting for an admin/).first().waitFor();
  } finally {
    await putShelf(shelfWas || JSON.stringify(shelf));
  }
  // Someone else (with a Dutch pack shared): the board, "me too", and an answer with a pack of theirs.
  const { c: oc, p: op } = await as(curator);
  await op.goto(`${BASE}/app/#explore/requests?lang=nl`);
  await op.locator('[data-part="list-row"]', { hasText: "Dutch for my train trip" }).waitFor();
  assert(!(await op.locator('[data-part="list-row"]', { hasText: "A Little Old Book" }).count()), "a book waiting for an admin isn't on the board");
  await op.waitForTimeout(400);
  await op.screenshot({ path: join(OUT, "16-requests-board.png") });
  await op.locator('[data-part="list-row"]', { hasText: "Dutch for my train trip" }).click();
  await op.getByRole("button", { name: /^Me too$/ }).click();
  await said(op, /Me too: it's counted/);
  await op.getByRole("button", { name: /^Me too · 1$/ }).waitFor();
  await op.getByRole("button", { name: /^Answer$/ }).click();
  await sheet(op).locator('[data-part="list-row"]', { hasText: "Dutch on the move" }).click();
  await said(op, /Answered: “Dutch on the move” is under the request now/);
  await op.locator('[data-part="list-row"]', { hasText: "Dutch on the move" }).waitFor();
  eq(sql(`SELECT answers, likes FROM requests WHERE id = ${q(asked.id)}`)[0], { answers: 1, likes: 1 }, "an answer and a \"me too\"");
  await oc.close();
  // Its author: Yours says there's a new answer; the request shows it as new; marked done.
  await ap.goto(`${BASE}/app/#explore/yours`);
  await ap.locator('[data-part="list-row"]', { hasText: /Dutch for my train trip.*1 answer, 1 new/ }).first().waitFor();
  await ap.waitForTimeout(300);
  await ap.screenshot({ path: join(OUT, "16c-yours-requests.png") });
  await ap.locator('[data-part="list-row"]', { hasText: "Dutch for my train trip" }).click();
  await ap.locator('[data-part="list-row"]', { hasText: /New · by Explore Curator/ }).waitFor();
  await ap.waitForTimeout(300);
  await ap.screenshot({ path: join(OUT, "16b-a-request-answered.png") });
  await ap.getByRole("button", { name: /^Mark done$/ }).click();
  await said(ap, /Marked done/);
  await ap.getByText(/^Done\./).waitFor();
  eq(sql(`SELECT state FROM requests WHERE id = ${q(asked.id)}`)[0].state, "done", "done");
  await ac.close();
  // Reported for something that hides it at once: the page says so, and nothing of it stays to press.
  const toReport = (await http(asker, "POST", "/api/community/requests", { kind: "pack", language: "nl", title: "A request to report" })).body.id;
  const { c: rc, p: rp } = await as(curator);
  await rp.goto(`${BASE}/app/#explore/request/${toReport}`);
  await rp.getByRole("button", { name: /^More$/ }).click();
  await sheet(rp).locator('[data-part="list-row"]', { hasText: /^Report/ }).click();
  await sheet(rp).getByText("It involves a child").click();
  await sheet(rp).getByRole("button", { name: /^Send report$/ }).click();
  await rp.getByText("Thanks. It's hidden while it's looked at.").waitFor();
  eq(await rp.getByRole("button", { name: /^(Me too|Answer|More)/ }).count(), 0, "nothing of it left to press");
  eq(sql(`SELECT shown FROM requests WHERE id = ${q(toReport)}`)[0].shown, "hidden", "hidden at once");
  await rc.close();
});

await stage("preview sentences show their readings (Hebrew's vowel marks, Japanese kana over the kanji), on a pack's page and its home's featured card; a version summarized before readings gets them from its pack", async () => {
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const shareAs = async (code) => {
    const pack = JSON.parse(readFileSync(join(APP, `packs/starter-${code}.json`), "utf8"));
    // Its own content (Explore refuses a pack that's the same as one already there, as the starter is on a state with the library in it: its
    // meanings marked), the same words and readings the stage reads.
    const items = pack.items.map((item) => ({ ...item, means: `${item.means} (readings check)` }));
    const shared = await http(curator, "POST", "/api/community/share", { pack: { ...pack, items, id: `explore-${code}-readings`, name: `${pack.name} (readings check)` } });
    assert(shared.status === 200, `shared ${code}: ${JSON.stringify(shared.body)}`);
    return { id: shared.body.id, first: pack.items[0] };
  };
  const he = await shareAs("he");
  const ja = await shareAs("ja");
  // The server's sample: each word with its reading.
  const sample = (await http(learner, "GET", `/api/community/items/${he.id}`)).body.sample[0];
  eq(sample.words, he.first.words.map(([text, lemma, reading]) => [text, lemma ?? null, reading ?? null]), "the sample's words, with their readings");
  // A version summarized before readings: its sample has none, and no form; read once, it's made again from the pack.
  sql(`UPDATE item_versions SET summary = json_remove(summary, '$.samples', '$.sample[0].words') WHERE item_id = ${q(he.id)}`);
  const again = (await http(learner, "GET", `/api/community/items/${he.id}`)).body.sample[0];
  assert(Array.isArray(again.words) && again.words[0][2] === he.first.words[0][2], `filled in from the pack: ${JSON.stringify(again)}`);
  eq(sql(`SELECT json_extract(summary, '$.samples') AS f FROM item_versions WHERE item_id = ${q(he.id)}`)[0].f, 2, "and kept");
  // On the page, for someone learning Dutch (so every reading shows): Hebrew with its vowels, Japanese with kana over it.
  const c = await context.browser().newContext(phone);
  await c.addCookies([{ name: "lc_session", value: learner.cookie, url: BASE }]);
  const p = await c.newPage();
  p.on("console", (m) => m.type() === "error" && errors.push(`readings: ${m.text()}`));
  await p.goto(`${BASE}/app/#explore/item/${he.id}`);
  const heLine = p.locator(".lx-explore-sentences .lx-sentence-nl").first();
  await heLine.waitFor();
  const heText = await heLine.innerText();
  assert(heText.includes(he.first.words[0][2]) && heText.includes(he.first.words[2][2]), `Hebrew with its vowel marks: ${heText}`);
  await heLine.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(OUT, "17-readings-hebrew.png") });
  await p.goto(`${BASE}/app/#explore/item/${ja.id}`);
  await p.reload();
  const rt = p.locator(".lx-explore-sentences .lx-sentence-nl").first().locator("rt");
  await rt.first().waitFor();
  // (The ruby's readings as drawn, without the word joiners that keep them to their words.)
  const readings = (await rt.allInnerTexts()).map((r) => r.replace(/[\u2060\s]/g, ""));
  // Read as it's drawn, each ruby by its reading (kana over the kanji alone: 飲みます has の over 飲): the sentence's readings, in full.
  assert(readings.length > 0 && ja.first.words.some((word) => word[2]), `Japanese readings over the words: ${readings}`);
  const aloud = await p.locator(".lx-explore-sentences .lx-sentence-nl").first().evaluate((line) => {
    const walk = (n) => (n.nodeType === 3 ? n.textContent : n.tagName === "RUBY" ? [...n.querySelectorAll("rt")].map((rt) => rt.textContent).join("") : [...n.childNodes].map(walk).join(""));
    return walk(line).replace(/[\u2060\s]/g, "");
  });
  const wanted = ja.first.words.map(([text, , reading]) => reading ?? text).join("");
  assert(aloud.startsWith(wanted), `Japanese readings over the words: reads ${aloud}, its sentence is ${wanted}`);
  await p.waitForTimeout(800); // the page drawn again once its pack's file is here
  await p.locator(".lx-explore-sentences .lx-sentence-nl rt").first().evaluate((node) => node.scrollIntoView({ block: "center" }));
  await p.waitForTimeout(400);
  await p.screenshot({ path: join(OUT, "17a-readings-japanese.png") });
  // A Hebrew pack's page draws its first sentence with its marks.
  await p.goto(`${BASE}/app/#explore/item/${he.id}`);
  const feature = p.locator(".lx-explore-sentences .lx-sentence-nl").first();
  await feature.waitFor();
  assert((await feature.innerText()).includes(he.first.words[0][2]), `a Hebrew pack's sentence: ${await feature.innerText()}`);
  // The home again after a restart, the server slow: the featured card comes from the device whole, before the server
  // answers, and nothing moves when it does.
  await p.addInitScript(() => {
    window.__shift = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__shift += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  // When this device last kept a language's home (home-data.js: written once fetchHome has the server's answer whole).
  const keptAt = (code) =>
    p.evaluate((code) => {
      try {
        const all = JSON.parse(localStorage.getItem("lx.explore-home.v1") ?? "null");
        return Math.max(0, ...Object.values(all?.accounts ?? {}).map((a) => a?.homes?.[code]?.at ?? 0));
      } catch {
        return 0;
      }
    }, code);
  const slow = async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue().catch(() => {});
  };
  for (const [code, reading] of [["he", he.first.words[0][2]], ["ja", ja.first.words[0][2]]]) {
    await p.goto(`${BASE}/app/#explore?lang=${code}`);
    await p.locator(".lx-face").waitFor();
    await p.waitForTimeout(500); // kept on the device
    const before = await keptAt(code);
    await p.route("**/api/community/explore**", slow);
    // The server's answers, waited on before the shift is read: the home, then its featured pack, then the home kept
    // again (home-data.js fetchHome has it whole).
    const answered = p.waitForResponse((r) => r.url().includes("/api/community/explore") && r.status() === 200, { timeout: 15000 }).then(() => p.waitForResponse((r) => r.url().includes("/api/community/items/") && r.status() === 200, { timeout: 15000 }));
    await p.reload();
    const cached = p.locator(".lx-face-words b");
    await cached.waitFor({ timeout: 2500 });
    assert((await cached.innerText()).length > 0, `${code}: the pack to start from the device, before the server answers`);
    await answered;
    for (let i = 0; i < 60 && (await keptAt(code)) <= before; i++) await p.waitForTimeout(250);
    assert((await keptAt(code)) > before, `${code}: the server's home arrived and was kept`);
    await p.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 300)))));
    const shift = await p.evaluate(() => window.__shift);
    assert(shift < 0.01, `${code}: nothing moved when the server answered (layout shift ${shift})`);
    await p.unroute("**/api/community/explore**", slow);
  }
  // Known (Study's rule): learning Hebrew, with its first word known from weeks of right answers (written as the games
  // write them), that word is drawn as written and the others keep their marks. Moved to in the app, not reloaded, so
  // the evidence is the app's own.
  const [, lemma0] = he.first.words[0];
  const known = await p.evaluate(
    async ({ lemma, item, now }) => {
      (await import("/js/study/learning.js")).setLearning("he");
      const { record, knows } = await import("/js/study/progress.js");
      for (const days of [120, 80, 45, 21, 7]) record([{ concept: `w:${lemma}`, at: now - days * 86_400_000, outcome: "right", test: "recall", skill: "read", activity: "type", item }]);
      return knows(`w:${lemma}`);
    },
    { lemma: lemma0, item: he.first.id, now: Date.now() },
  );
  assert(known, `the word is known now (knows w:${lemma0})`);
  await p.evaluate((href) => (location.hash = href), `#explore/item/${he.id}`);
  const knownLine = p.locator(".lx-explore-sentences .lx-sentence-nl").first();
  await knownLine.waitFor();
  const knownText = await knownLine.innerText();
  // A word sharing that lemma is known too, written plain; every other keeps its marks.
  const bare = (word) => word?.replace(/[,،]$/, "");
  for (const [text, lemma, reading] of he.first.words) {
    const right = lemma === lemma0 ? knownText.includes(bare(text)) && !knownText.includes(bare(reading)) : knownText.includes(bare(reading));
    assert(right, `known words as written, the new ones with their marks (${text}): ${knownText}`);
  }
  await c.close();
  for (const id of [he.id, ja.id]) await http(curator, "POST", `/api/community/items/${id}/withdraw`, {});
});

await stage("Like: one press, counted; a second takes it back", async () => {
  await page.getByRole("button", { name: /^Like$/ }).click();
  await page.getByRole("button", { name: /^Liked · 1$/ }).waitFor();
  await page.getByRole("button", { name: /^Liked · 1$/ }).click();
  await page.getByRole("button", { name: /^Like$/ }).waitFor();
  await page.getByRole("button", { name: /^Like$/ }).click();
  await page.getByRole("button", { name: /^Liked · 1$/ }).waitFor();
  await shot("05-following-liked");
});

await stage("Make my own copy: for anyone, a pack of yours saying where it came from, and studying moves to it", async () => {
  await page.reload();
  const item = (await http(learner, "GET", `/api/community/items/${second.id}`)).body.item;
  const file = await fetch(`${BASE}/library/packs/${item.id}/${item.version}/pack.json`, { headers: { Cookie: `lc_session=${learner.cookie}` } });
  if (file.status === 404) return "waiting on lex-packs' P1b (the /library/packs/ route): not run";
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.locator('[data-part="sheet"] .lx-row-title', { hasText: "Make my own copy" }).click();
  await page.waitForFunction(() => /\/edit$/.test(location.hash), null, { timeout: 30_000 });
  const copied = await page.evaluate(async () => (await import("/js/study/packs.js")).yourPacks().map((r) => ({ id: r.pack.id, name: r.pack.name, copiedFrom: r.pack.copiedFrom })));
  assert(copied.some((p) => p.name === "Dutch on the move (your copy)" && p.copiedFrom?.id === second.id), `the copy: ${JSON.stringify(copied)}`);
  await page.goBack();
  await page.goBack().catch(() => {});
  await page.goto(`${BASE}/app/#explore/item/${second.id}`);
  await page.getByRole("button", { name: "More", exact: true }).waitFor({ timeout: 15_000 });
});

await stage("another language: its own home with its flag, its pack to start with, and what adding one there does", async () => {
  await page.goto(`${BASE}/app/#explore`);
  await page.locator('[data-part="list-row"]', { hasText: /^Change target language/ }).click();
  await page.locator('[data-part="sheet"]').last().locator('[data-part="list-row"]', { hasText: "German" }).click();
  await page.waitForFunction(() => location.hash === "#explore?lang=de");
  await page.locator(".lx-pick[data-pick]", { hasText: "A check pack (German)" }).waitFor();
  const body = await text();
  assert(body.includes("In German") && /Packs you add in German wait on this device/.test(body) && !body.includes("Dutch on the move"), "German's own home, and what adding there does");
  assert(await page.locator('[data-part="page"] a[href="#settings/language"]').count() === 1, "the way to change the language");
  await shot("05b-german");
  // Every language: a sheet with a search.
  await page.locator('[data-part="list-row"]', { hasText: /^Change target language/ }).click();
  try {
    const sheet = page.locator('[data-part="sheet"]').last();
    await sheet.locator('input[aria-label="Find a language"]').fill("germ");
    const found = await sheet.locator(".lx-row-title").allInnerTexts();
    assert(found.length === 1 && found[0].includes("German"), `found: ${found}`);
  } finally {
    await closeSheets(page);
  }
  return "All languages searched";
});

await stage("the sharing terms: what sharing means, accepted here (and remembered)", async () => {
  await page.goto(`${BASE}/app/#explore/terms`);
  await page.getByRole("button", { name: "I agree" }).waitFor();
  const body = await text();
  assert(/It's under CC BY-SA 4\.0/.test(body) && !/\bAI\b/.test(body.replace(/^\s*AI\s*$/gm, "")), "the terms");
  await shot("06-terms");
  await page.getByRole("button", { name: "I agree" }).click();
  await page.getByRole("button", { name: "Accepted" }).waitFor();
  assert((await http(learner, "GET", "/api/community/terms")).body.accepted === true, "accepted on the account");
  await page.reload();
  await page.getByRole("button", { name: "Accepted" }).waitFor();
});

await stage("Report: the sheet's reasons, a copyright notice's own fields, and a report that lands in the queue", async () => {
  await page.goto(`${BASE}/app/#explore/item/${DE.id}`);
  await page.locator('[data-part="page-title"]', { hasText: "A check pack (German)" }).waitFor();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.locator('[data-part="sheet"] .lx-row-title', { hasText: /^Report$/ }).click();
  const sheet = page.locator('[data-part="sheet"]').last();
  await sheet.locator(".lx-row-title", { hasText: "It's my copyrighted work" }).waitFor();
  assert(!(await sheet.locator('input[aria-label="Your full name"]').isVisible()), "the notice's fields stay hidden until copyright is picked");
  await sheet.locator("label", { hasText: "It's my copyrighted work" }).click();
  await sheet.locator('input[aria-label="Your full name"]').waitFor({ state: "visible" });
  await shot("07-report-copyright");
  await sheet.locator("label", { hasText: "Spam, or not what it says" }).click();
  assert(!(await sheet.locator('input[aria-label="Your full name"]').isVisible()), "and hidden again for another reason");
  await sheet.locator('textarea[aria-label="Details"]').fill("not German at all");
  await sheet.getByRole("button", { name: "Send report" }).click();
  await page.locator(".lx-settings-message", { hasText: /It's with the moderators/ }).waitFor();
  const open = sql(`SELECT reason, details FROM reports WHERE target_id = ${q(DE.id)}`);
  assert(open.length === 1 && open[0].reason === "spam" && open[0].details === "not German at all", `the report: ${JSON.stringify(open)}`);
});

await stage("an owner's hidden pack: why it's down, the counter-notice form; and Yours lists it", async () => {
  sql(`UPDATE items SET state = 'hidden', state_reason = 'Hidden after a copyright notice.', state_at = ${Date.now()} WHERE id = ${q(NL.id)}`);
  sql(`INSERT INTO reports (id, target_kind, target_id, reason, notice, reporter_id, action, created_at) VALUES ('rep${randomBytes(4).toString("hex")}', 'item', ${q(NL.id)}, 'copyright', '{"work":"A check course book","name":"A Sender","contact":"sender@example.org"}', ${q(learner.id)}, 'hidden', ${Date.now()})`);
  const owner = await context.browser().newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await owner.addCookies([{ name: "lc_session", value: curator.cookie, url: BASE }]);
  const op = await owner.newPage();
  op.on("console", (m) => m.type() === "error" && errors.push(`owner: ${m.text()}`));
  await op.goto(`${BASE}/app/#explore/item/${NL.id}`);
  await op.locator('[data-part="section-title"]', { hasText: /^Hidden$/ }).waitFor();
  assert((await op.locator('[data-part="page"]').innerText()).includes("Hidden after a copyright notice."), "why it's down");
  const hiddenPage = await op.locator('[data-part="page"]').innerText();
  assert(hiddenPage.includes("The notice says it copies: A check course book"), "the work the notice names");
  assert(!hiddenPage.includes("A Sender") && !hiddenPage.includes("sender@example.org"), "who sent the notice");
  await op.locator('textarea[aria-label="Why it should come back"]').fill("These are my own sentences, written for the check.");
  await op.locator('input[aria-label="Your full name"]').fill("Explore Curator");
  await op.locator('input[aria-label="An email to reach you"]').fill("curator@example.org");
  await op.getByRole("button", { name: "Send a counter-notice" }).click();
  await op.locator(".lx-settings-message", { hasText: /The moderators will look at it/ }).waitFor();
  await op.screenshot({ path: join(OUT, "08-hidden-counter-notice.png"), fullPage: true });
  assert(sql(`SELECT COUNT(*) AS n FROM counter_notices WHERE item_id = ${q(NL.id)}`)[0].n === 1, "the counter-notice is in");
  await op.goto(`${BASE}/app/#explore/yours`);
  await op.locator('[data-part="page-title"]', { hasText: /^Share$/ }).waitFor();
  // The title draws at once, the list when it's arrived.
  await op.locator('[data-part="page"] .lx-row-title', { hasText: "A check pack (Dutch)" }).waitFor();
  const yours = await op.locator('[data-part="page"]').innerText();
  assert(yours.includes("A check pack (Dutch)") && yours.includes("Hidden after a report") && yours.includes("Dutch on the move"), "Yours: what was shared, and what's down");
  await op.screenshot({ path: join(OUT, "09-yours.png"), fullPage: true });
  await owner.close();
  assert((await http(learner, "GET", `/api/community/items/${NL.id}`)).status === 404, "the hidden pack isn't anyone else's to open");
  // A follower: the pack they follow hidden, off their device at the next sync, and Explore's home saying why.
  sql(`UPDATE items SET state = 'hidden', state_reason = 'Hidden after reports, while they''re looked at.', state_at = ${Date.now()} WHERE id = ${q(second.id)}`);
  await page.goto(`${BASE}/app/#explore`);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.locator('[data-part="group-label"]', { hasText: /^Off your devices$/ }).waitFor();
  const home = await page.locator('[data-part="page"]').innerText();
  assert(home.includes(second.name) && home.includes("Hidden while a report is looked at"), "the pack, and why in general words");
  let onDevice = null;
  for (let i = 0; i < 40; i++) {
    onDevice = await page.evaluate(async () => (await import("/js/study/packs.js")).libraryPacks().map((p) => (p.pack ?? p).id));
    if (!onDevice.includes(second.id)) break;
    await page.waitForTimeout(250);
  }
  assert(!onDevice.includes(second.id), `off the device: ${JSON.stringify(onDevice)}`);
  await page.screenshot({ path: join(OUT, "09b-off-your-devices.png"), fullPage: true });
  sql(`UPDATE items SET state = 'live', state_reason = NULL, state_at = ${Date.now()} WHERE id = ${q(second.id)}`);
});

await stage("Share from a pack's own page: its page (not a sheet), into Explore; then Share this update makes a new version", async () => {
  const cc = await context.browser().newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await cc.addCookies([{ name: "lc_session", value: curator.cookie, url: BASE }]);
  const cp = await cc.newPage();
  cp.on("console", (m) => m.type() === "error" && errors.push(`curator: ${m.text()}`));
  cp.on("pageerror", (e) => errors.push(`curator: ${e}`));
  await cp.addInitScript(() => new MutationObserver(() => document.querySelectorAll(".lx-quiet-more:not([open])").forEach((more) => (more.open = true))).observe(document, { childList: true, subtree: true }));
  await cp.goto(`${BASE}/app/#study`);
  await cp.waitForSelector("html[data-app-ready]");
  const mine = structuredClone(DE);
  mine.id = "curator-own-de";
  mine.name = "My German on the side";
  mine.items = mine.items.map((item) => ({ ...item, means: `${item.means} (mine)` }));
  const saved = await cp.evaluate(async (pack) => (await import("/js/study/packs.js")).savePack(pack, { by: "the check" }), mine);
  assert(saved.ok, `saved: ${JSON.stringify(saved.errors)}`);
  await cp.goto(`${BASE}/app/#settings/study/packs/${mine.id}`);
  await cp.locator(".lx-row-title", { hasText: /^Share in Explore$/ }).click();
  await cp.waitForFunction(() => location.hash.startsWith("#explore/share/"));
  const form = cp.locator('[data-part="page"]:visible');
  const title = form.locator('label[data-part="field"]', { hasText: "Its name in Explore" }).locator("input");
  await title.waitFor();
  assert((await title.inputValue()) === "My German on the side", "the title, prefilled");
  await form.locator('.lx-level[data-value="A2"]').click();
  await form.locator('button.lx-chip[data-topic="travel"]').click();
  await cp.screenshot({ path: join(OUT, "10-share-page.png"), fullPage: true });
  await cp.getByRole("button", { name: "Share", exact: true }).click();
  await cp.waitForFunction(() => location.hash.startsWith("#explore/item/"));
  await cp.locator('[data-part="page-title"]', { hasText: "My German on the side" }).waitFor();
  const shared = (await http(curator, "GET", "/api/community/mine")).body.find((i) => i.sourceId === mine.id);
  assert(shared && shared.level === "A2" && shared.topics.map((t) => t.id).join() === "travel", `shared: ${JSON.stringify(shared)}`);
  // A change to the pack, then the same row again: an update now.
  mine.items[0].means = `${mine.items[0].means} (fixed)`;
  await cp.evaluate(async (pack) => (await import("/js/study/packs.js")).savePack(pack, { by: "the check" }), mine);
  await cp.goto(`${BASE}/app/#settings/study/packs/${mine.id}`);
  await cp.locator(".lx-row-title", { hasText: /^Share in Explore$/ }).click();
  await cp.waitForFunction(() => location.hash.startsWith("#explore/share/"));
  await cp.getByRole("button", { name: "Share this update", exact: true }).click();
  await cp.waitForFunction(() => location.hash.startsWith("#explore/item/"));
  await cp.locator(".lx-row-title", { hasText: /^Version 2/ }).waitFor();
  await cp.screenshot({ path: join(OUT, "11-shared-update.png"), fullPage: true });
  await cc.close();
});

await stage("a library pack's recordings: its page says recorded, and credits each voice with its license", async () => {
  // One of the library's own packs with recordings, as library_publish leaves it (admin-check publishes one through the
  // tools): its file, its audio manifest, the catalog naming both, and its Explore row.
  const format = await import(join(APP, "public/js/study/pack-format.js"));
  const audioFormat = await import(join(APP, "public/js/study/pack-audio.js"));
  const { BUILT_IN } = await import(join(APP, "public/js/packs/index.js"));
  const installed = BUILT_IN.filter((b) => b.language === NL.language).map((b) => ({ ...b, builtIn: true }));
  const pack = format.checkPack({ ...NL, id: "library-recorded", name: "A recorded library pack" }, { installed }).pack;
  const version = await format.packVersion(pack);
  const manifest = { format: "lexicommons-audio", version: 2, pack: pack.id, language: pack.language, voices: { emma: { name: "Emma", locale: "nl-NL", license: "CC BY 4.0", credit: "Emma, a synthetic voice made with ElevenLabs for Lexicommons", items: {}, words: {} } } };
  const audio = audioFormat.audioUrl(pack.id, version, await audioFormat.audioVersion(manifest));
  const put = (key, text) => r2.put("lexicommons-library", key, text, "application/json");
  await put(format.packKey(pack.id, version), format.packText(pack));
  await put(audio.replace(/^\/library\//, ""), audioFormat.audioText(manifest));
  await put("catalogue.json", JSON.stringify({ format: "lexicommons-catalogue", v: 1, books: [], lists: {}, packs: { nl: [format.catalogueEntry(pack, version, { audio })] } }));
  const now = Date.now();
  sql(
    `INSERT INTO items (id, kind, owner_id, curated, title, language, from_lang, badges, licence, head_version, content_hash, search, created_at, updated_at) VALUES ('library-recorded', 'pack', NULL, 1, 'A recorded library pack', 'nl', 'en', '{"sentences":3,"audio":true}', 'CC BY-SA 4.0', ${q(version)}, 'explore-check-library-recorded', 'a recorded library pack lexicommons', ${now}, ${now}); ` +
      `INSERT INTO item_versions (item_id, version, seq, r2_key, bytes, summary, licence, made_by, created_at) VALUES ('library-recorded', ${q(version)}, 1, ${q(format.packKey(pack.id, version))}, 10, '{}', 'CC BY-SA 4.0', 'library', ${now})`,
  );
  await page.goto(`${BASE}/app/#explore/item/library-recorded`);
  await page.locator('[data-part="group-note"]', { hasText: /^Recordings:/ }).waitFor();
  const text = await page.locator('[data-part="page"]').innerText();
  assert(text.includes("Recordings: Emma, a synthetic voice made with ElevenLabs for Lexicommons (CC BY 4.0).") && /recorded/.test(text), "recorded, and the voice credited");
  await page.screenshot({ path: join(OUT, "12-recorded-library-pack.png"), fullPage: true });
  // Lexicommons' own pack is studied as published: a follow asking for community corrections is kept as published,
  // and its More has no switch.
  eq((await http(learner, "POST", "/api/community/items/library-recorded/follow", { corrections: "community" })).body.corrections, "published", "a library pack's follow: as published");
  await page.reload();
  await page.getByRole("button", { name: /^Added$/ }).waitFor();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.locator('[data-part="sheet"] .lx-row-title', { hasText: "Make my own copy" }).waitFor();
  eq(await page.getByRole("switch", { name: /Use community corrections/ }).count(), 0, "no community corrections switch");
  await http(learner, "DELETE", "/api/community/items/library-recorded/follow");
  await page.reload();
});

await stage("an opt-in pack is never suggested, however many add it; what's featured instead says honestly why; it's still findable", async () => {
  // As the catalog has them: a starter first, a bigger one, and an opt-in one, the newest and the most added.
  const format = await import(join(APP, "public/js/study/pack-format.js"));
  const { BUILT_IN } = await import(join(APP, "public/js/packs/index.js"));
  const installed = BUILT_IN.filter((b) => b.language === NL.language).map((b) => ({ ...b, builtIn: true }));
  const put = (key, text) => r2.put("lexicommons-library", key, text, "application/json");
  const catalogWas = await (await fetch(`${BASE}/library/catalogue.json`, { headers: { Cookie: `lc_session=${learner.cookie}` } })).text();
  const entries = [];
  const now = Date.now();
  for (const [n, [id, title, optIn]] of [["own-starter", "Starter: Dutch", false], ["own-words", "Dutch words 1–2,000", false], ["own-strong", "Strong language", true]].entries()) {
    const pack = format.checkPack({ ...NL, id, name: title, about: `About ${title}.` }, { installed }).pack;
    const version = await format.packVersion(pack);
    await put(format.packKey(pack.id, version), format.packText(pack));
    entries.push(format.catalogueEntry(pack, version, optIn ? { optIn: true } : {}));
    sql(
      `INSERT INTO items (id, kind, owner_id, curated, title, about, language, from_lang, badges, licence, head_version, content_hash, search, created_at, updated_at) VALUES (${q(id)}, 'pack', NULL, 1, ${q(title)}, ${q(`About ${title}.`)}, 'nl', 'en', '{"sentences":3}', 'CC BY-SA 4.0', ${q(version)}, ${q(`own-${id}`)}, ${q(title.toLowerCase())}, ${now + n}, ${now + n}); ` +
        `INSERT INTO item_versions (item_id, version, seq, r2_key, bytes, summary, licence, made_by, created_at) VALUES (${q(id)}, ${q(version)}, 1, ${q(format.packKey(pack.id, version))}, 10, '{}', 'CC BY-SA 4.0', 'library', ${now})`,
    );
  }
  await put("catalogue.json", JSON.stringify({ format: "lexicommons-catalogue", v: 1, books: [], lists: {}, packs: { nl: entries } }));
  sql(`UPDATE items SET follows = 50, popular = 50 WHERE id = 'own-strong'`);
  // Curated sections would feature their first pack, so this looks at the home without them, then with the opt-in pack in one.
  const sectionsWere = sql("SELECT id, title, rank, items, updated_by, updated_at FROM explore_sections");
  sql("DELETE FROM explore_sections");
  const home = async () => (await http(learner, "GET", "/api/community/explore?lang=nl")).body;
  const ids = (list) => list.map((item) => item.id);
  // Explore twice each time. Its page is kept: coming back, it asks the server again, and the answer (the catalog just changed) comes while the
  // page is on the screen, so it's held for the page's next visit and drawn before that visit's first frame, never into the page under the eye
  // (explore.js renderHome: update, refresh). That's the app's rule, kept on purpose: the first visit gets the answer, the second shows it.
  // Don't make the app draw it in to pass this.
  const open = async () => {
    for (let visit = 0; visit < 2; visit++) {
      const answered = visit === 0 ? page.waitForResponse((r) => r.url().includes("/api/community/explore?"), { timeout: 15_000 }).catch(() => null) : null;
      await page.evaluate(() => (location.hash = "#today"));
      await page.waitForTimeout(300);
      await page.evaluate(() => (location.hash = "#explore?lang=nl"));
      await page.waitForFunction(() => location.hash === "#explore?lang=nl");
      if (answered) {
        await answered;
        await page.waitForTimeout(500);
      }
    }
    return page.locator(".lx-pick[data-pick]");
  };
  const card = await open();
  await card.waitFor({ timeout: 15_000 });
  await card.filter({ hasText: "Starter: Dutch" }).waitFor({ timeout: 8000 });
  const featured = await card.innerText();
  assert(featured.includes("Starter: Dutch") && !/Strong language|Most added/.test(featured), `the featured pack: ${featured}`);
  await page.screenshot({ path: join(OUT, "13-featured-opt-in-skipped.png") });
  const body = await text();
  assert(!body.includes("Strong language"), "the opt-in pack on the home");
  const answer = await home();
  eq(answer.feature.item.id, "own-starter", "the server's choice");
  eq(answer.feature.why, "start", "and why");
  assert(!ids(answer.popular).includes("own-strong") && !ids(answer.new).includes("own-strong"), "the opt-in pack on a shelf");
  // In a curated section, it's left out there too.
  sql(`INSERT INTO explore_sections (id, title, rank, items, updated_by, updated_at) VALUES ('mine', 'Handpicked', 0, ${q(JSON.stringify(["own-strong"]))}, ${q(learner.id)}, ${now})`);
  const curated = await home();
  assert(!curated.sections.some((section) => ids(section.items).includes("own-strong")), "the opt-in pack in a curated section");
  sql("DELETE FROM explore_sections");
  // Enough adds on another pack: it's the most added, and the shelf is Popular.
  sql(`UPDATE items SET follows = 12, popular = 12 WHERE id = 'own-words'`);
  const most = await open();
  await most.filter({ hasText: "Dutch words 1–2,000" }).waitFor({ timeout: 8000 });
  eq((await home()).feature.why, "most-added", "the most added, and why");
  // Too few: not the most added of anything.
  sql(`UPDATE items SET follows = 9, popular = 9 WHERE id = 'own-words'`);
  eq((await home()).feature.why, "start", "nine adds aren't most added");
  sql(`UPDATE items SET follows = 0, popular = 0 WHERE id = 'own-words'`);
  // Still findable: by search, and in the pack list, after the others; its page has its plain name and about line.
  const search = (await http(learner, "GET", "/api/community/items?lang=nl&q=strong")).body.items;
  assert(ids(search).includes("own-strong"), `search: ${ids(search)}`);
  const list = ids((await http(learner, "GET", "/api/community/items?lang=nl&sort=popular")).body.items);
  assert(list.at(-1) === "own-strong", `the pack list has it last: ${list}`);
  await page.goto(`${BASE}/app/#explore/item/own-strong`);
  await page.locator('[data-part="page-title"]', { hasText: "Strong language" }).waitFor();
  await page.getByText("About Strong language.").waitFor();
  // As it was, for what follows.
  sql("DELETE FROM follows WHERE item_id LIKE 'own-%'; DELETE FROM item_versions WHERE item_id LIKE 'own-%'; DELETE FROM items WHERE id LIKE 'own-%'");
  for (const section of sectionsWere) sql(`INSERT INTO explore_sections (id, title, rank, items, updated_by, updated_at) VALUES (${q(section.id)}, ${q(section.title)}, ${section.rank}, ${q(section.items)}, ${q(section.updated_by)}, ${section.updated_at})`);
  await put("catalogue.json", catalogWas);
  await page.goto(`${BASE}/app/#today`);
  // Home reached from another tab starts its history afresh (shell/main.js, "back: one rule"), a step back through the history that
  // lands a moment later: wait for it, or the next stage's address can be lost under it.
  await page.waitForFunction(() => location.hash === "#today" && globalThis.__lxNav?.().afresh === false);
  return "skipped at 50 adds; Most added from 10 adds; findable by search and last in the list";
});

// Sharing off (for launch: COMMUNITY_SHARING "admins", /api/me's mayShare false for a learner): every way to publish is left out of the
// screens, never shown and refused. /api/me is answered with mayShare false here, so this holds whatever the server's setting. Fails on Explore
// from before (the rows, the buttons and the menus all there).
await stage("sharing off for a learner: no way to publish anywhere in Explore, Study's end of the lessons or a pack's page; reading and adding stay", async () => {
  const learner = account("Explore Learner");
  const c = await context.browser().newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await c.route((u) => u.pathname === "/api/me", async (route) => {
    const r = await route.fetch();
    await route.fulfill({ response: r, json: { ...(await r.json()), mayShare: false } });
  });
  await c.addCookies([{ name: "lc_session", value: learner.cookie, url: BASE }]);
  const p = await c.newPage();
  const shown = (re) => p.locator('[data-part="page"]:not([hidden]) :is(a, button, [data-part="list-row"])', { hasText: re }).count();
  const found = {};
  try {
    await p.goto(`${BASE}/app/#explore`);
    await lessonOneDone(p);
    await p.goto(`${BASE}/app/#today`);
    await p.goto(`${BASE}/app/#explore`);
    await p.locator(".lx-face").waitFor({ timeout: 20_000 });
    await p.waitForTimeout(800);
    found.home = { ask: await shown(/^Ask for it$/), share: await shown(/Share what you've made/), own: await shown(/^Add your own pack$/), allPacks: await shown(/^All packs$/) };
    // A pack's page: its sentences' menus offer nothing to send.
    await p.goto(`${BASE}/app/#explore/item/${encodeURIComponent(second.id)}`);
    await p.locator('[data-part="page-title"]', { hasText: "Dutch on the move" }).waitFor();
    const more = p.getByRole("button", { name: "More about this sentence" });
    found.menu = (await more.count()) ? (await more.nth(1).click(), await p.waitForTimeout(500), { fix: await p.getByRole("button", { name: /^Suggest a fix/ }).count(), flag: await p.getByRole("button", { name: /^Flag it/ }).count() }) : { fix: 0, flag: 0 };
    await p.keyboard.press("Escape");
    // An empty search: no Ask for one.
    await p.goto(`${BASE}/app/#explore?lang=nl&q=zxqvw`);
    await p.waitForTimeout(2000);
    found.search = await p.getByRole("button", { name: /^Ask for one$/ }).count();
    // The board by an old link: no asks.
    await p.goto(`${BASE}/app/#explore/requests?lang=nl`);
    await p.waitForTimeout(1500);
    found.board = { pack: await shown(/^Ask for a pack/), book: await shown(/^Ask for a book/) };
    // Sharing a pack by an old link opens the pack instead.
    await p.goto(`${BASE}/app/#explore/share/${encodeURIComponent(second.id)}`);
    await p.waitForTimeout(1500);
    found.shareRoute = await p.evaluate(() => location.hash);
    // The end of the lessons: no Ask for more, no Share.
    await p.goto(`${BASE}/app/#study/more-lessons`);
    await p.waitForTimeout(1500);
    found.end = { ask: await shown(/^Ask for more/), share: await shown(/Share what you've made/) };
    await p.screenshot({ path: join(OUT, "18-sharing-off-end-of-lessons.png") });
  } finally {
    await c.close();
  }
  assert(!found.home.ask && !found.home.share, `Explore's home offers to publish: ${JSON.stringify(found.home)}`);
  // What stays for everyone: every pack, and a pack of your own (explore/own.js), which shares nothing.
  assert(found.home.own && found.home.allPacks, `reading or a pack of your own went with it: ${JSON.stringify(found.home)}`);
  assert(!found.menu.fix && !found.menu.flag, `a sentence's menu offers a fix or a flag: ${JSON.stringify(found.menu)}`);
  assert(!found.search, "an empty search offers Ask for one");
  assert(!found.board.pack && !found.board.book, `the board offers asks: ${JSON.stringify(found.board)}`);
  assert(found.shareRoute.startsWith("#settings/study/packs/"), `sharing's old address went to ${found.shareRoute}`);
  assert(!found.end.ask && !found.end.share, `the end of the lessons offers to publish: ${JSON.stringify(found.end)}`);
  return JSON.stringify(found);
});

await stage("an item that isn't there says so; nothing on the page overflows at phone width", async () => {
  await page.goto(`${BASE}/app/#explore/item/no-such-pack`);
  await page.locator('[data-part="empty-state"]', { hasText: /no such pack/i }).waitFor();
  await page.goto(`${BASE}/app/#explore`);
  await page.locator("nav.lx-topics .lx-topic").first().waitFor();
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  assert(!wide, "the page is wider than the phone");
});

await stage("no console errors", async () => {
  if (errors.length) throw new Error(errors.slice(0, 10).join("\n"));
});

await browser.close();
for (const who of [learner, curator]) await http(who, "DELETE", "/api/me", { confirm: "delete my account" });
const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "explore-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 2) + "\n");
console.log(`explore check: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
