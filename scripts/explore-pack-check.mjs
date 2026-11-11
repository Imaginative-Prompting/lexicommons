#!/usr/bin/env node
// A pack's page in Explore, in Chrome on a phone. Its sentences (ui.sentenceRow): none shows the same English twice, a word-for-word line
// showing only when it says something the translation doesn't. Its units (explore.js lessonsOf), from a new account learning Dutch, on Dutch's lessons
// (path-nl, many units): its Lessons section opened, one unit is open and every other is a closed row saying how many lessons, how far you've
// got and what they teach in brief; a press opens a unit in place, under its row (no page, no page chevron), and closes it again. A pack you
// haven't started opens its first unit; a learner partway (unit 1 done, two lessons into unit 2, marked through the app's own path) opens
// the unit they're on, and each row counts what's done. What it expects comes from the pack's own file and the device's records, never the page's
// code. It fails if every unit is drawn open, or none, or the section runs to the length of all of them; and on a sentence whose two
// English lines say the same, in the sample or among all of the pack's sentences.
// LOCAL only, a server with path-nl seeded as a default pack (it lists it in Explore with an admin's look at the catalog, as a publish would):
//   node scripts/packs/seed-local.mjs packs/path-nl.json --persist-to <state> --default
//   node scripts/explore-pack-check.mjs http://localhost:<port> <outDir> --persist-to <state>
// Exit 0 = pass, 1 = a stage failed, 2 = not set up.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [BASE, outArg] = process.argv.slice(2);
const persistAt = process.argv.indexOf("--persist-to");
const PERSIST = persistAt > 0 ? resolve(process.argv[persistAt + 1]) : null;
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST) {
  console.error("Usage: node scripts/explore-pack-check.mjs http://localhost:<port> <outDir> --persist-to <state> (a local server only: it signs up a test account)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

// ---------- set up: path-nl in the library, and in Explore's index ----------
const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
const entry = Object.values(catalogue.packs ?? {}).flat().find((p) => p?.id === "path-nl");
if (!entry) {
  console.error("Not set up: path-nl isn't in this server's library. Seed it before the server starts:\n  node scripts/packs/seed-local.mjs packs/path-nl.json --persist-to <state> --default");
  process.exit(2);
}
{
  const sha = (text) => createHash("sha256").update(text).digest("hex");
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  const id = `units${randomBytes(6).toString("hex")}`;
  const now = Date.now();
  const sql = (command) => execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
  sql([
    `INSERT INTO users (id, name, created_at) VALUES ('${id}', 'Units check admin', ${now})`,
    `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES ('${id}', '${id}', 'check', '${sha(token)}', '${token.slice(0, 10)}', ${now}, 1)`,
    `INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES ('${id}', 'admin', ${now}, 'd1', 'explore-pack-check')`,
  ].join("; "));
  const looked = await fetch(`${BASE}/api/v1/admin/library`, { headers: { Authorization: `Bearer ${token}` } });
  sql([`DELETE FROM user_roles WHERE user_id = '${id}'`, `DELETE FROM api_tokens WHERE user_id = '${id}'`, `DELETE FROM users WHERE id = '${id}'`].join("; "));
  if (!looked.ok) {
    console.error(`Not set up: the admin's look at the catalog answered ${looked.status}.`);
    process.exit(2);
  }
}

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true });
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
    console.log(`PASS ${name}: ${JSON.stringify(results[name].note)}`);
  } catch (error) {
    failed++;
    results[name] = { ok: false, note: String(error.stack ?? error) };
    console.log(`FAIL ${name}: ${error.message}`);
    await page.screenshot({ path: `${OUT}/fail-${Object.keys(results).length}.png` }).catch(() => {});
  }
}
const shot = async (name) => {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}.png` });
};

const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Explore Units Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
await page.waitForSelector("html[data-app-ready]");
const learning = await page.evaluate(async () => (await import("/js/study/learning.js")).learning());
if (learning !== "nl") {
  console.error(`explore-pack-check needs Dutch as a new account's language (it has ${learning}).`);
  process.exit(2);
}

// ---------- what it expects, from the pack's own file ----------
const pack = await page.evaluate(async (url) => (await fetch(url)).json(), entry.url ?? `/library/packs/path-nl/${entry.version}/pack.json`);
const units = pack.units ?? [];
const lessonsIn = (unit) => pack.lessons.filter((lesson) => lesson.unit === unit.id);
if (units.length < 3) {
  console.error(`explore-pack-check needs a pack with three units or more: path-nl has ${units.length}.`);
  process.exit(2);
}
const plural = (n, one) => `${n.toLocaleString("en")} ${n === 1 ? one : `${one}s`}`;
// A unit's brief: its lessons (or how many of them are done), its new words, its ideas.
const briefOf = (unit, done = 0) => {
  const lessons = lessonsIn(unit);
  const words = new Set(lessons.flatMap((lesson) => [...(lesson.words ?? []).map((w) => w.lemma), ...(lesson.phrases ?? [])])).size;
  const ideas = lessons.filter((lesson) => lesson.concept).length;
  const count = !done ? plural(lessons.length, "lesson") : done === lessons.length && done > 1 ? `All ${plural(lessons.length, "lesson")} done` : `${done} of ${plural(lessons.length, "lesson")} done`;
  // Each piece kept whole on its line (no-break spaces), the dot with the piece before it.
  return [count, words ? plural(words, "new word") : null, ideas ? plural(ideas, "idea") : null].filter(Boolean).map((piece) => piece.replaceAll(" ", "\u00a0")).join("\u00a0· ");
};
// The packs have arrived on the device, so where you are is known when the page draws.
for (let i = 0; i < 60; i++) {
  const left = await page.evaluate(async () => (await import("/js/study/packs.js")).packDownloads());
  if (!left) break;
  await page.waitForTimeout(1000);
}

// ---------- getting there, and what it shows ----------
const SECTION = '[data-part="page"]:visible [data-more="lessons"]';
async function openLessons() {
  await page.evaluate(() => (location.hash = "#today"));
  await page.waitForTimeout(300);
  await page.evaluate(() => (location.hash = "#explore/item/path-nl"));
  const section = page.locator(SECTION).last();
  await section.waitFor({ timeout: 20_000 });
  if ((await section.getAttribute("open")) === null) await section.locator("summary").click();
  await section.locator(".lx-explore-units").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(300);
  return section;
}
// Each unit row: its title, its brief, whether it says it's open, what it ends in, and the lessons showing under it.
async function shown(section) {
  return section.evaluate((root) =>
    [...root.querySelectorAll(".lx-explore-units > .lx-row-item")].map((li) => {
      const row = li.querySelector(':scope > [data-part="list-row"]');
      const list = li.querySelector(":scope > .lx-explore-unit-lessons");
      const visible = (node) => Boolean(node) && !node.closest("[hidden]") && node.getBoundingClientRect().height > 0;
      return {
        title: row.querySelector(".lx-row-title")?.textContent ?? "",
        brief: row.querySelector(".lx-row-sub")?.textContent ?? "",
        expanded: row.getAttribute("aria-expanded"),
        tag: row.tagName.toLowerCase(),
        end: row.lastElementChild?.matches(".lx-unit-mark") ? "mark" : row.lastElementChild?.tagName.toLowerCase() ?? "none",
        chevron: Boolean(row.querySelector(":scope > svg")),
        lessons: visible(list) ? [...list.querySelectorAll('[data-part="list-row"] .lx-row-title')].filter(visible).map((n) => n.textContent) : [],
        // What each lesson showing says at its end ("Done", or nothing).
        marks: visible(list) ? [...list.querySelectorAll('[data-part="list-row"]')].filter(visible).map((r) => r.querySelector(".lx-row-value")?.textContent ?? "") : [],
        rowBottom: row.getBoundingClientRect().bottom,
        listTop: list && visible(list) ? list.getBoundingClientRect().top : null,
      };
    }),
  );
}
// One unit open, the one wanted, showing its own lessons in order; every other closed, showing none.
function oneOpen(rows, at) {
  const open = rows.map((row, i) => (row.lessons.length ? i : -1)).filter((i) => i >= 0);
  assert(open.length !== rows.length, `every unit is drawn open (${rows.length} of them)`);
  assert(open.length > 0, "no unit is open");
  same(open, [at], "the units showing their lessons");
  same(rows.map((row) => row.expanded), rows.map((_, i) => String(i === at)), "each row's aria-expanded");
  same(rows[at].lessons, lessonsIn(units[at]).map((lesson) => lesson.title), `${units[at].title}'s lessons, in order`);
}

await stage("a pack you haven't started: its first unit open, every other a closed row with its brief, ending in the mark that opens in place", async () => {
  const section = await openLessons();
  const rows = await shown(section);
  same(rows.map((row) => row.title), units.map((unit) => unit.title), "the unit rows");
  oneOpen(rows, 0);
  same(rows.map((row) => row.brief), units.map((unit) => briefOf(unit)), "each unit's brief");
  assert(rows[0].marks.every((mark) => mark === ""), `a lesson says it's done before any is: ${rows[0].marks.join(", ")}`);
  assert(rows.every((row) => row.tag === "button" && row.end === "mark" && !row.chevron), `a unit row that isn't a button ending in the in-place mark: ${JSON.stringify(rows.find((row) => row.tag !== "button" || row.end !== "mark" || row.chevron))}`);
  // Short: a row a unit, and the one unit's lessons. Every unit open would be all the pack's lessons.
  const height = Math.round((await section.boundingBox()).height);
  const allOpen = pack.lessons.length * 60;
  const want = units.length * 90 + lessonsIn(units[0]).length * 90 + 160;
  assert(height <= want && height < allOpen, `the opened section is ${height} px for ${units.length} units (at most ${want}; all open would be over ${allOpen})`);
  await section.locator("summary").scrollIntoViewIfNeeded();
  await shot("not-started");
  return { units: units.length, open: units[0].title, height };
});

await stage("a press opens another unit in place, right under its row, without leaving the page; a second press closes it", async () => {
  const section = page.locator(SECTION).last();
  const hash = await page.evaluate(() => location.hash);
  const rowAt = (i) => section.locator('.lx-explore-units > .lx-row-item > [data-part="list-row"]').nth(i);
  const pick = 2;
  await rowAt(pick).scrollIntoViewIfNeeded();
  await rowAt(pick).click();
  await page.waitForTimeout(200);
  let rows = await shown(section);
  same(await page.evaluate(() => location.hash), hash, "the address");
  same(rows[pick].expanded, "true", `${units[pick].title}'s aria-expanded`);
  same(rows[pick].lessons, lessonsIn(units[pick]).map((lesson) => lesson.title), `${units[pick].title}'s lessons`);
  assert(rows[pick].listTop !== null && Math.abs(rows[pick].listTop - rows[pick].rowBottom) <= 24, `its lessons start ${rows[pick].listTop - rows[pick].rowBottom} px under its row`);
  assert(rows[0].lessons.length > 0, "opening one closed the first");
  await shot("opened-in-place");
  await rowAt(pick).click();
  await page.waitForTimeout(200);
  rows = await shown(section);
  same([rows[pick].expanded, rows[pick].lessons.length], ["false", 0], `${units[pick].title} after a second press`);
  return { opened: units[pick].title, lessons: lessonsIn(units[pick]).length };
});

await stage("a learner partway: the unit they're on opens, and each row counts what's done", async () => {
  // Unit 1 done (with its whole-unit lesson) and the first two of unit 2, marked as the path's "I know these" does.
  const marked = await page.evaluate(async ([first, second]) => {
    const { pathLessons } = await import("/js/study/path.js");
    const { markLessonsDone, lessonNow } = await import("/js/study/plan.js");
    const all = pathLessons();
    const ofUnit = (unit) => all.filter((lesson) => lesson.unit?.id === `path-nl/${unit}`);
    const two = ofUnit(second).filter((lesson) => !lesson.full).slice(0, 2);
    markLessonsDone([...ofUnit(first), ...two]);
    return { marked: [...ofUnit(first), ...two].map((lesson) => lesson.id), now: lessonNow()?.id ?? null };
  }, [units[0].id, units[1].id]);
  const second = lessonsIn(units[1]);
  same(marked.now, `path-nl/${second[2].id}`, "the lesson you're on, by the app's own path");
  const section = await openLessons();
  const rows = await shown(section);
  oneOpen(rows, 1);
  same(rows.map((row) => row.brief), units.map((unit, i) => briefOf(unit, i === 0 ? lessonsIn(unit).length : i === 1 ? 2 : 0)), "each unit's brief, with what's done");
  same(rows[1].marks, second.map((_, i) => (i < 2 ? "Done" : "")), `what ${units[1].title}'s lessons say at their end`);
  await section.locator('.lx-explore-units > .lx-row-item > [data-part="list-row"]').nth(1).scrollIntoViewIfNeeded();
  await shot("partway");
  return { on: units[1].title, briefs: rows.slice(0, 3).map((row) => row.brief) };
});

await stage("where you are moves under the open page: finishing the unit you're on opens the next, unless you've opened or closed one yourself", async () => {
  const section = page.locator(SECTION).last();
  // Every lesson of unit 2 done (its whole-unit lesson too): you're on unit 3. The page is open the whole time.
  await page.evaluate(async (unit) => {
    const { pathLessons } = await import("/js/study/path.js");
    const { markLessonsDone } = await import("/js/study/plan.js");
    markLessonsDone(pathLessons().filter((lesson) => lesson.unit?.id === `path-nl/${unit}`));
  }, units[1].id);
  await page.waitForTimeout(300);
  let rows = await shown(section);
  oneOpen(rows, 2);
  same(rows[1].brief, briefOf(units[1], lessonsIn(units[1]).length), `${units[1].title}'s brief`);
  // Now opened by hand: a later change leaves what you opened as it is.
  await section.locator('.lx-explore-units > .lx-row-item > [data-part="list-row"]').nth(0).click();
  await page.evaluate(async (unit) => {
    const { pathLessons } = await import("/js/study/path.js");
    const { markLessonsDone } = await import("/js/study/plan.js");
    markLessonsDone(pathLessons().filter((lesson) => lesson.unit?.id === `path-nl/${unit}`));
  }, units[2].id);
  await page.waitForTimeout(300);
  rows = await shown(section);
  same(rows.map((row) => row.lessons.length > 0), units.map((_, i) => i === 0 || i === 2), "the units open after you opened one yourself");
  same(rows[2].brief, briefOf(units[2], lessonsIn(units[2]).length), `${units[2].title}'s brief`);
  return { then: units[2].title, kept: [units[0].title, units[2].title] };
});

await stage("its sentences: none shows the same English twice, and a word-for-word line shows wherever it says something the translation doesn't", async () => {
  // Words alone: case, marks and spacing aside.
  const plain = (text) => String(text ?? "").normalize("NFKC").toLocaleLowerCase("en").replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
  const literalOf = (item) => item.literal.map((chunk) => (Array.isArray(chunk) ? chunk[0] : chunk.text)).join(" ");
  const sentences = pack.items.filter((item) => typeof item.text === "string" && Array.isArray(item.words));
  const repeats = sentences.filter((item) => Array.isArray(item.literal) && plain(literalOf(item)) === plain(item.means));
  const adds = sentences.filter((item) => Array.isArray(item.literal) && plain(literalOf(item)) !== plain(item.means));
  assert(repeats.length > 0, "path-nl has no sentence whose word-for-word line is its translation, so this would prove nothing");
  // Every sentence row on the page as shown: its word-for-word line (its chunks) and its translation.
  const rowsShown = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.lx-explore-sentences [data-part="sentence-row"]')]
        .filter((row) => row.getClientRects().length > 0)
        .map((row) => {
          const line = row.querySelector('[data-part="literal-line"]');
          return { text: row.querySelector(".lx-sentence-nl")?.textContent ?? "", literal: line ? [...line.querySelectorAll('[data-part="literal-chunk"]')].map((chunk) => chunk.textContent).join(" ") : null, en: row.querySelector(".lx-sentence-en")?.textContent ?? null };
        }),
    );
  const twice = (rows) => rows.filter((row) => row.literal !== null && row.en !== null && plain(row.literal) === plain(row.en));
  await openLessons();
  const sample = await rowsShown();
  assert(sample.length > 0, "no sentences on the pack's page");
  same(twice(sample), [], "sample sentences showing the same English twice");
  await page.getByRole("button", { name: /^See all [\d,]+ sentences$/ }).click();
  let all = [];
  for (let i = 0; i < 40 && all.length < sentences.length; i++) {
    await page.waitForTimeout(250);
    all = await rowsShown();
  }
  same(all.length, sentences.length, "sentence rows after See all");
  const shownTwice = twice(all);
  assert(!shownTwice.length, `${shownTwice.length} sentences show the same English twice, as ${JSON.stringify(shownTwice[0])}`);
  same(all.filter((row) => row.literal !== null).length, adds.length, "sentences with their word-for-word line (the ones that add something)");
  const drink = all.find((row) => /^Ik drink melk/.test(row.text));
  if (drink) await page.locator(".lx-explore-sentences .lx-sentence-nl", { hasText: /^Ik drink melk/ }).first().scrollIntoViewIfNeeded();
  await shot("sentences");
  return { sentences: all.length, oneEnglishLine: repeats.length, withWordForWord: adds.length };
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.join("\n"));
  return "none";
});

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
await browser.close();
console.log(failed ? `${failed} stage(s) failed` : "all stages passed");
process.exit(failed ? 1 : 0);
