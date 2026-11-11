#!/usr/bin/env node
// A starter's lesson saying it's only a start, with its press reaching that lesson's sentences and a flag sent from one; then
// Where a language's lessons run out, in Chrome on a phone, from a brand-new account, in a language with few lessons and in one
// that reads right to left: every lesson finished, the row on Study and the row on the last lesson's summary and the path's foot,
// the page they lead to (no AI anywhere on it); asking for more through the real sheet, with the words already written; the next
// person who asks joins that request instead of posting another; Practice still there; every third practice saying what's next;
// Explore's home inviting anyone to ask or share; Yours offering what you've made.
//
// LOCAL only, a fresh state, with Swahili's and Arabic's starters in its library before the server starts, and sharing open:
//   npx wrangler d1 migrations apply lexicommons --local --persist-to <state>
//   node scripts/packs/seed-local.mjs packs/starter-sw.json --persist-to <state> --default
//   node scripts/packs/seed-local.mjs packs/starter-ar.json --persist-to <state> --default
//   node scripts/packs/seed-local.mjs packs/path-nl.json --persist-to <state> --default   (its units, on its page in Explore)
//   npx wrangler dev --local --persist-to <state> --port <port> --var COMMUNITY_SHARING:everyone   (plus the vars any local check takes: AGENTS.md)
//   node scripts/lessons-end-check.mjs http://localhost:<port> <outDir> --persist-to <state>
// Exit 0 = pass, 1 = a stage failed, 2 = not set up: it says what's missing.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
// The app folder: wrangler finds its config there, wherever this is run from.
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const [BASE, outArg] = process.argv.slice(2);
const persistAt = process.argv.indexOf("--persist-to");
const PERSIST = persistAt > 0 ? resolve(process.argv[persistAt + 1]) : null;
const OUT = outArg && resolve(outArg);
if (!BASE || !OUT || !/^http:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) {
  console.error("Usage: node scripts/lessons-end-check.mjs http://localhost:<port> <outDir> --persist-to <state> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
// Without those two starters no lesson ever arrives, and every stage would fail for that one reason.
const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((response) => (response.ok ? response.json() : {})).catch(() => ({}));
const listed = JSON.stringify(catalogue);
const missing = ["starter-sw", "starter-ar", "path-nl"].filter((id) => !listed.includes(`"${id}"`));
if (missing.length) {
  console.error(`Not set up: ${missing.join(" and ")} aren't in this server's library. Seed them into its state before it starts:`);
  for (const id of missing) console.error(`  node scripts/packs/seed-local.mjs packs/${id}.json --persist-to <state> --default`);
  process.exit(2);
}
// Seeding puts a pack on the catalog; what lists it in Explore is an admin's next look at the catalog, which a publish does on the real site.
if (!PERSIST) {
  console.error("Not set up: this needs --persist-to <state>, the server's state, to list the starters in Explore as a publish would.");
  process.exit(2);
}
{
  const sha = (text) => createHash("sha256").update(text).digest("hex");
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  const id = `end${randomBytes(6).toString("hex")}`;
  const now = Date.now();
  execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--command", [
    `INSERT INTO users (id, name, created_at) VALUES ('${id}', 'Lessons end admin', ${now})`,
    `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES ('${id}', '${id}', 'check', '${sha(token)}', '${token.slice(0, 10)}', ${now}, 1)`,
    `INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES ('${id}', 'admin', ${now}, 'd1', 'lessons-end-check')`,
  ].join("; ")], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
  const looked = await fetch(`${BASE}/api/v1/admin/library`, { headers: { Authorization: `Bearer ${token}` } });
  if (!looked.ok) {
    console.error(`Not set up: the catalog's admin look answered ${looked.status}, so the starters aren't listed in Explore.`);
    process.exit(2);
  }
}
setTimeout(() => {
  console.error("FAIL ceiling: 9 minutes");
  process.exit(1);
}, 9 * 60_000).unref();

let passed = 0;
let failed = 0;
let page;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
async function stage(name, fn) {
  try {
    const note = await fn();
    passed++;
    console.log(`PASS ${name}${note ? `: ${JSON.stringify(note)}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}\n     ${error.message}`);
    await page?.screenshot({ path: `${OUT}/fail-${failed}.png` }).catch(() => {});
  }
}

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });

async function person(name, lang) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const tab = await context.newPage();
  const seen = { errors: [] };
  tab.on("pageerror", (error) => seen.errors.push(String(error)));
  const authn = await context.newCDPSession(tab);
  await authn.send("WebAuthn.enable");
  await authn.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await tab.goto(`${BASE}/app/`);
  await tab.waitForURL(/\/login\?next=/);
  await tab.click("summary");
  await tab.fill('input[name="name"]', name);
  await tab.click('#register button[type="submit"]');
  await tab.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
  await tab.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await tab.evaluate(async (code) => {
    const { setLearning, learning } = await import("/js/study/learning.js");
    if (learning() !== code) setLearning(code);
    await (await import("/js/study/packs.js")).syncLibraryPacks();
  }, lang);
  await tab.reload();
  await tab.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  return { context, tab, seen };
}
const go = async (hash) => {
  await page.evaluate((to) => (location.hash = to), hash);
  await page.waitForTimeout(250);
};
// The page on screen, once it's stopped moving: the shell keeps other tabs' pages under it, and a new page slides in.
const words = async () => {
  await page.waitForTimeout(700);
  return page.locator('[data-part="page"]:visible').last().innerText();
};
const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
};
// Every lesson of the language but the last finished, as a learner who's come that far: what each taught recorded, then the finish.
const finishAllBut = (keep) =>
  page.evaluate(async (keep) => {
    const { pathLessons } = await import("/js/study/path.js");
    // A language's starter arrives from the library after the app's ready: wait for it, as long as a slow phone might.
    for (let i = 0; i < 300 && !pathLessons().length; i++) await new Promise((done) => setTimeout(done, 100));
    const { record } = await import("/js/study/progress.js");
    const { finishedLesson } = await import("/js/study/done.js");
    const lessons = pathLessons();
    let at = Date.now() - 20 * 86400000;
    lessons.slice(0, lessons.length - keep).forEach((lesson) => {
      at += 60_000;
      record(lesson.things.flatMap((thing) => [0, 1, 2].map((i) => ({ concept: thing.unit, at: at + i, outcome: "right", test: "pick", skill: "read", activity: "meaning", item: lesson.items[0] ?? "x" }))));
      finishedLesson(lesson.id, at + 10);
    });
    return { lessons: lessons.length, last: lessons.at(-1)?.title };
  }, keep);
const overview = () => page.evaluate(async () => {
  const { studyOverview } = await import("/js/study/plan.js");
  const one = studyOverview();
  return { atEnd: one.atEnd, lesson: one.lesson?.title ?? null, practice: Boolean(one.practice), suggest: one.suggest };
});

for (const [lang, name] of [["sw", "Swahili"], ["ar", "Arabic"]]) {
  const one = await person(`End ${lang}`, lang);
  page = one.tab;
  let made;
  await stage(`${name}: a starter's lesson says it's a start, and Tell us reaches that lesson's sentences, each with a fix and a flag`, async () => {
    const lesson = await page.evaluate(async () => {
      const { pathLessons } = await import("/js/study/path.js");
      for (let i = 0; i < 300 && !pathLessons().length; i++) await new Promise((done) => setTimeout(done, 100));
      const { ITEMS } = await import("/js/study/content.js");
      const { starterNote } = await import("/js/study/starter-note.js");
      const lessons = pathLessons();
      const second = lessons[1];
      const full = lessons.find((one) => one.full);
      return {
        id: second.id,
        natural: second.items.map((id) => ITEMS.find((item) => item.id === id)?.means).filter(Boolean),
        // Only a language's First steps: never Dutch's own units, nor the lessons worked out after it. A whole unit has no sentences of its own to open.
        dutch: starterNote({ id: "path-nl/coffee-and-keys", title: "Coffee and keys" }),
        worked: starterNote({ id: "words/1", title: "More words 1" }),
        fullHref: full ? starterNote(full.unit, full)?.querySelector("a").getAttribute("href") : null,
      };
    });
    assert(lesson.natural.length >= 2, `a lesson with too few sentences to tell: ${lesson.natural.length}`);
    assert(lesson.dutch === null && lesson.worked === null, "the line shows outside a starter's First steps");
    assert(lesson.fullHref && !lesson.fullHref.includes("?"), `a whole unit's link: ${lesson.fullHref}`);
    // The lesson's bubble on the path, then its words: the lesson's own line is in that sheet (the unit's own is under its name on the path).
    await go(`#study/path/${encodeURIComponent(lesson.id)}`);
    const bubble = page.locator(".lx-path .lx-path-bubble");
    await bubble.waitFor({ timeout: 15_000 });
    await bubble.getByRole("button", { name: "Its words" }).click();
    const note = page.locator(".lx-lesson-words-sheet .lx-path-note");
    await note.waitFor({ timeout: 15_000 });
    const said = (await note.innerText()).trim();
    assert(said === "These lessons are a start, and they can be wrong. See something off? Tell us.", said);
    await shot(`${lang}-starter-note`);
    await note.getByRole("link", { name: "Tell us" }).click();
    await page.waitForFunction(() => location.hash.startsWith("#explore/item/"));
    const more = page.getByRole("button", { name: "More about this sentence" });
    await page.waitForFunction((count) => [...document.querySelectorAll('button[aria-label="More about this sentence"]')].filter((one) => one.offsetParent).length === count, lesson.natural.length, { timeout: 20_000 });
    const text = await words();
    for (const line of lesson.natural) assert(text.includes(line), `"${line}" isn't on the page`);
    await shot(`${lang}-starter-sentences`);
    assert(!(await page.getByRole("button", { name: "Add pack" }).count()), "offered a pack they're already studying");
    await more.first().click();
    await page.getByText("Suggest a fix", { exact: true }).waitFor();
    await page.getByText("Flag it", { exact: true }).click();
    await page.getByLabel("What's wrong").fill("This one reads oddly to me.");
    await page.getByRole("button", { name: "Send flag" }).click();
    const terms = page.getByRole("button", { name: "I agree" });
    await terms.or(page.getByText("Thanks: your flag is with its author.")).first().waitFor({ timeout: 20_000 });
    if (await terms.count()) await terms.first().click();
    await page.getByText("Thanks: your flag is with its author.").waitFor({ timeout: 20_000 });
    await page.locator(`a[href="#study/path/${encodeURIComponent(lesson.id)}"]`).first().click();
    await page.waitForFunction((id) => location.hash === `#study/path/${encodeURIComponent(id)}`, lesson.id);
    return { sentences: lesson.natural.length };
  });
  await stage(`${name}: its starter's page in Explore lists its lessons by unit, each saying what it teaches and opening its sentences, back to the pack`, async () => {
    const id = `starter-${lang}`;
    await go(`#explore/item/${id}`);
    const lessonsMore = page.locator('[data-part="page"]:visible [data-more="lessons"]').last();
    await lessonsMore.waitFor({ timeout: 20_000 });
    await lessonsMore.locator("summary").click();
    const group = lessonsMore.locator(".lx-group").first();
    const unit = (await group.locator('[data-part="group-label"]').innerText()).trim();
    assert(unit === "First steps", `its unit: ${unit}`);
    const rows = lessonsMore.locator('[data-part="list-row"]');
    const count = await rows.count();
    const look = await rows.evaluateAll((nodes) => nodes.map((n) => ({ h: n.getBoundingClientRect().height, sub: n.querySelector(".lx-row-sub, [data-part='row-sub']")?.textContent ?? n.innerText.split("\n")[1] ?? "", opacity: getComputedStyle(n).opacity })));
    assert(count >= 10, `${count} lessons`);
    assert(look.every((one) => one.h >= 44), `a row under 44 px: ${look.map((one) => Math.round(one.h))}`);
    assert(look.every((one) => /^(New words|A new idea)/.test(one.sub.trim())), `a lesson that doesn't say what it teaches: ${look.map((one) => one.sub).join(" | ")}`);
    assert(look.every((one) => one.opacity === "1"), "a row made quiet by opacity");
    assert((await page.locator('[data-part="page"]:visible button[data-variant="go"], [data-part="page"]:visible a[data-variant="go"]').count()) <= 1, "more than one go button");
    for (const [theme, width] of [["graphite", 390], ["paper", 320], ["contrast", 390]]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      await lessonsMore.scrollIntoViewIfNeeded();
      await shot(`${lang}-explore-lessons-${theme}-${width}`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert(wide <= 0, `${theme} at ${width}: ${wide} px too wide`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => (document.documentElement.dataset.theme = "graphite"));
    const second = rows.nth(1);
    const title = (await second.locator(".lx-row-title").innerText()).trim();
    await second.click();
    await page.waitForFunction(() => /[?&]lesson=/.test(location.hash) && /from=explore/.test(location.hash));
    await page.locator('[data-part="page"]:visible [data-from-lesson]').last().waitFor({ timeout: 15_000 });
    const hint = await page.locator('[data-part="page"]:visible [data-from-lesson]').last().innerText();
    assert(hint.includes(title), `the lesson's sentences: ${hint}`);
    assert(await page.getByRole("button", { name: /^(Add pack|Added)$/ }).count(), "Add is gone from the pack's own lesson view");
    await page.locator(`a[href="#explore/item/${id}"]`).first().click();
    await page.waitForFunction((want) => location.hash === want, `#explore/item/${id}`);
    return { unit, lessons: count, opened: title };
  });
  await stage(`${name}: a pack with many units (Dutch's lessons) on its page: the first open (it isn't started here), every other a closed row saying what it teaches in brief, and short; a press opens another in place`, async () => {
    if (lang !== "sw") return "once is enough";
    await go("#explore/item/path-nl");
    const section = page.locator('[data-part="page"]:visible [data-more="lessons"]').last();
    await section.waitFor({ timeout: 20_000 });
    await section.locator("summary").click();
    await page.waitForTimeout(400);
    const units = section.locator('.lx-explore-units > .lx-row-item > [data-part="list-row"]');
    const count = await units.count();
    const height = Math.round((await section.boundingBox()).height);
    // Each unit's lessons showing: only the first unit's (explore-pack-check holds which one opens, for a learner partway too).
    const showing = await section.locator(".lx-explore-units > .lx-row-item").evaluateAll((items) => items.map((item) => (item.querySelector(":scope > .lx-explore-unit-lessons:not([hidden])") ? item.querySelectorAll(':scope > .lx-explore-unit-lessons [data-part="list-row"]').length : 0)));
    const briefs = await units.evaluateAll((rows) => rows.map((row) => row.querySelector(".lx-row-sub")?.textContent ?? ""));
    assert(count >= 12, `${count} unit rows`);
    assert(showing[0] >= 8 && showing.slice(1).every((n) => n === 0), `lessons showing per unit: ${showing.join(", ")}`);
    assert(briefs.every((one) => /^\d+\slessons?(\s·\s[\d,]+\snew\swords?)?(\s·\s\d+\sideas?)?$/.test(one)), `a unit's brief: ${briefs.find((one) => !/^\d+\slessons?/.test(one))}`);
    assert(height <= count * 90 + showing[0] * 90 + 160, `the opened section is ${height} px for ${count} units and ${showing[0]} lessons`);
    await shot(`nl-explore-units`);
    await units.nth(1).click();
    const second = await section.locator('.lx-explore-units > .lx-row-item:nth-child(2) > .lx-explore-unit-lessons:not([hidden]) [data-part="list-row"]').count();
    assert(second >= 8 && (await units.nth(1).getAttribute("aria-expanded")) === "true", `the second unit opened ${second} lessons`);
    await shot(`nl-explore-unit-open`);
    await units.nth(1).click();
    assert((await units.nth(1).getAttribute("aria-expanded")) === "false", "it didn't close again");
    return { units: count, height, firstUnitLessons: showing[0], secondUnitLessons: second };
  });
  await stage(`${name}: a language with few lessons reaches its end, and Study says so plainly`, async () => {
    made = await finishAllBut(0);
    await go("#study");
    assert(made.lessons > 0, "no lessons at all");
    const state = await overview();
    assert(state.atEnd && state.practice, JSON.stringify(state));
    await page.locator('[data-part="list-row"]', { hasText: "Learn something new" }).waitFor({ timeout: 10_000 });
    const text = await words();
    assert(text.includes(`You've done every ${name} lesson here`), text.slice(0, 300));
    assert(/Practice/.test(text), "Practice is gone");
    await shot(`${lang}-study`);
    return made;
  });
  await stage(`${name}: the page says what's next, with no AI anywhere on it`, async () => {
    await page.locator('[data-part="list-row"]', { hasText: "Learn something new" }).click();
    await page.getByRole("heading", { name: `You've done every ${name} lesson here` }).waitFor({ timeout: 10_000 });
    const text = await words();
    for (const row of ["Ask for more", "See what people have shared", "Share what you've made"]) assert(text.includes(row), `no ${row}`);
    assert(!/\b(AI|Claude|ChatGPT|MCP|model)\b/.test(text), `an AI on the page: ${text}`);
    assert(await page.getByRole("button", { name: "Practice" }).first().isVisible(), "no way to keep practicing");
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(wide <= 0, `wider than the phone by ${wide}`);
    await shot(`${lang}-what-next`);
  });
  await stage(`${name}: asking for more opens the sheet with the words written, and posting puts it on the board`, async () => {
    await page.locator('[data-part="list-row"]', { hasText: "Ask for more" }).click();
    const field = page.locator('input[aria-label="What should it be about?"]');
    await field.waitFor({ timeout: 20_000 });
    assert((await field.inputValue()) === `More lessons in ${name}`, await field.inputValue());
    await shot(`${lang}-ask`);
    await page.getByRole("button", { name: "Ask for it" }).click();
    const agree = page.getByRole("button", { name: "I agree" });
    if (await agree.waitFor({ timeout: 4000 }).then(() => true, () => false)) await agree.click();
    await page.waitForURL(/#explore\/request\//, { timeout: 20_000 });
    await page.getByText(`More lessons in ${name}`).first().waitFor({ timeout: 20_000 });
    one.requestAt = page.url();
    await shot(`${lang}-asked`);
  });
  await stage(`${name}: the next person to ask joins that request instead of posting another`, async () => {
    assert(one.requestAt, "nothing was posted to join");
    const two = await person(`Next ${lang}`, lang);
    const mine = page;
    page = two.tab;
    try {
      await go(`#explore/requests?lang=${lang}&ask=lessons`);
      await page.waitForURL(/#explore\/request\//, { timeout: 20_000 });
      assert(page.url().split("#")[1] === one.requestAt.split("#")[1], `${page.url()} is not ${one.requestAt}`);
      assert((await page.locator('input[aria-label="What should it be about?"]').count()) === 0, "a sheet opened as well");
      await shot(`${lang}-joined`);
    } finally {
      await two.context.close();
      page = mine;
    }
  });
  await stage(`${name}: Explore invites anyone to ask or share, and Yours offers a way in`, async () => {
    await go(`#explore?lang=${lang}`);
    await page.locator('[data-part="list-row"]', { hasText: "Ask for it" }).waitFor({ timeout: 20_000 });
    const row = page.locator('[data-part="list-row"]', { hasText: "Share what you've made" });
    await row.scrollIntoViewIfNeeded();
    await shot(`${lang}-explore`);
    await row.click();
    await page.getByRole("heading", { name: "Ready to share" }).waitFor({ timeout: 20_000 });
    await page.getByRole("heading", { name: "Your requests" }).waitFor({ timeout: 20_000 });
    const text = await words();
    assert(text.includes("Add an Anki deck"), text.slice(0, 300));
    assert(text.includes(`More lessons in ${name}`), "their request isn't under Yours");
    assert(!/\b(AI|Claude|ChatGPT|MCP)\b/.test(text), `an AI on Yours: ${text}`);
    await shot(`${lang}-yours`);
  });
  await stage(`${name}: what's yours shows ready to share, and moves once it's shared`, async () => {
    const id = `end-check-${lang}`;
    const saved = await page.evaluate(async ({ id, lang }) => {
      const { savePack } = await import("/js/study/packs.js");
      return savePack({ format: "lexicommons-pack", version: 2, id, name: "A pack of mine", language: lang, from: "en", topics: {}, words: {}, items: [{ id: "c1", text: "one thing", means: "another thing" }, { id: "c2", text: "a third thing", means: "a fourth thing" }, { id: "c3", text: "a fifth thing", means: "a sixth thing" }] }, { by: "the check" });
    }, { id, lang });
    assert(saved.ok !== false, JSON.stringify(saved));
    await go("#explore");
    await go("#explore/yours");
    const ready = page.locator(".lx-group", { has: page.getByRole("heading", { name: "Ready to share" }) });
    await ready.locator('[data-part="list-row"]', { hasText: "A pack of mine" }).waitFor({ timeout: 20_000 });
    assert(/2 cards|3 cards/.test(await ready.innerText()), await ready.innerText());
    await shot(`${lang}-ready`);
    await ready.locator('[data-part="list-row"]', { hasText: "A pack of mine" }).click();
    await page.getByRole("button", { name: "Share", exact: true }).waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: "Share", exact: true }).click();
    await page.waitForURL((url) => url.hash.startsWith("#explore/item") || url.hash.startsWith("#explore/pack") || !url.hash.includes("yours"), { timeout: 20_000 });
    await go("#explore");
    await go("#explore/yours");
    await page.getByRole("heading", { name: "Shared", exact: true }).waitFor({ timeout: 20_000 });
    assert(!(await ready.innerText()).includes("A pack of mine"), "still offered once it's shared");
  });
  await stage(`${name}: the path's foot leads to the same page, and Practice's every third says what's next`, async () => {
    await go("#study/path");
    // A starter's line, under First steps' name: once, on that unit, leading to the pack, and clear of its name and its stops.
    await page.waitForSelector(".lx-pu .lx-path-note", { timeout: 10_000 });
    const placed = await page.evaluate(() => {
      const note = document.querySelector(".lx-pu .lx-path-note");
      const r = note.getBoundingClientRect();
      const overlaps = [...document.querySelectorAll(".lx-pu-title, .lx-ps, .lx-here")].filter((n) => {
        const b = n.getBoundingClientRect();
        return b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top;
      }).map((n) => n.className);
      return { count: document.querySelectorAll(".lx-pu .lx-path-note").length, first: note.parentElement === document.querySelector(".lx-pu"), overlaps, href: note.querySelector("a").getAttribute("href") };
    });
    assert(placed.count === 1 && placed.first && !placed.overlaps.length && placed.href === `#explore/item/starter-${lang}`, `the line on the path: ${JSON.stringify(placed)}`);
    await page.evaluate(() => (document.querySelector('[data-part="page"]:not([data-ghost])').scrollTop = 0));
    await page.waitForTimeout(250);
    await shot(`${lang}-path-note`);
    const foot = page.locator('[data-part="list-row"]', { hasText: "Want more lessons?" });
    await foot.waitFor({ timeout: 10_000 });
    await foot.scrollIntoViewIfNeeded();
    await shot(`${lang}-path-foot`);
    // Its page, opened from the path, goes back to the path, where it was.
    const left = await page.evaluate(() => document.querySelector('[data-part="page"]:not([data-ghost])').scrollTop);
    await foot.click();
    // The address changes with the click; the page and its header come with the router's hashchange, a moment later (read before it, the
    // header was still the path's own, whose back is Study).
    await page.waitForFunction(() => location.hash.startsWith("#study/more-lessons") && globalThis.__lxNav?.().routes.at(globalThis.__lxNav().i) === "#study/more-lessons");
    const back = page.locator('[data-part="app-back"]');
    await back.waitFor();
    const says = (await back.innerText()).trim() || (await back.getAttribute("aria-label")) || "";
    assert(/Where you are/.test(says), `its back says "${says}", not the path`);
    await back.click();
    await page.waitForFunction(() => location.hash === "#study/path");
    await page.waitForTimeout(600);
    const at = await page.evaluate(() => document.querySelector('[data-part="page"]:not([data-ghost])').scrollTop);
    assert(Math.abs(at - left) <= 24, `back on the path at ${at}, left at ${left}`);
    const shown = await page.evaluate(async () => {
      const { finishedPractice, practicesSinceLesson } = await import("/js/study/done.js");
      const { studyOverview } = await import("/js/study/plan.js");
      const answers = [];
      const start = Date.now();
      for (let i = 0; i < 6; i++) {
        finishedPractice(start + i * 1000);
        answers.push(studyOverview(start + i * 1000).suggest);
      }
      return { answers, since: practicesSinceLesson() };
    });
    const ok = shown.answers.filter(Boolean).length === 2 && shown.since === 6;
    assert(ok, JSON.stringify(shown));
    return shown;
  });
  await stage(`${name}: no page errors`, async () => {
    assert(!one.seen.errors.length, one.seen.errors.join("; "));
  });
  await one.context.close();
}

await browser.close();
console.log(failed ? `${failed} of ${passed + failed} stages FAILED` : `${passed}/${passed + failed} stages passed`);
process.exit(failed ? 1 : 0);
