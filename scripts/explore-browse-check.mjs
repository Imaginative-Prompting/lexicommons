#!/usr/bin/env node
// Explore found by browsing, by a word, and sharing into it, in Chrome on a phone from a new account learning Dutch (explore.js):
//   - the home: the search, then the language's lessons as the main card (though they're on the device: Start or Continue, never Add), then
//     the one pack to add next face-out, then the first six topics as cards, each its drawing large (the card itself, with its hard edge),
//     its name whole at a reading size and how many packs are about it (the server's count), "All N" to the rest;
//   - a topic's page, started the way Home is: only what's about it (no general pack), its first pack's card led by its first sentence with
//     the page's one solid Add pack, its second its own card ("After <first>", its Add the quiet one), each with how much of it you know
//     ("N% known" beside a short bar), learners' packs as rows; Add adding in place; a whole card opening its pack, whose Back goes one
//     step, to the topic;
//   - a pack already on the device never offers Add: the lessons' own page (opened by its whole card on the home) Start or Continue;
//   - search finds the packs that teach a word (koffie), its sentence with the word marked, and a topic by its name (food);
//   - sharing a pack of yours is a page of its own, not a sheet: the terms first, four plain lines, Back one step to the pack; then the
//     form (the level a row, its topics chips, its cover one of their drawings, kept), and Done becoming the shared pack's page, whose
//     Back goes one step, to the pack you shared from;
//   - the pack to start is the topic pack published to be suggested that this person hasn't added whose words are the commonest (the
//     lowest mean place on the language's frequency list of each item's own word, its gap's), never a learner's; learners' packs have
//     covers in the app's art, none twice on a shelf.
// What it expects comes from the server's answers and the pack files, never the page's code. Every stage fails on Explore as it was
// before (topics as small tiles or as books, a topic's page a grid of covers, Share's pills and boxed terms, a learner's pack as the pick).
// LOCAL only, a server with path-nl seeded as a default pack and at least one opt-in pack about one topic, suggested:
//   node scripts/packs/seed-local.mjs packs/path-nl.json --persist-to <state> --default
//   node scripts/packs/seed-local.mjs <a pack about one topic> --persist-to <state> --opt-in --suggest
//   node scripts/explore-browse-check.mjs http://localhost:<port> <outDir> --persist-to <state>
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
  console.error("Usage: node scripts/explore-browse-check.mjs http://localhost:<port> <outDir> --persist-to <state> (a local server only: it signs up a test account)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

// ---------- set up: the library in Explore's index (an admin's look at the catalog, as a publish would) ----------
const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
const dutch = catalogue.packs?.nl ?? [];
const topical = dutch.filter((p) => p.optIn && p.suggest);
if (!dutch.some((p) => p.id === "path-nl") || !topical.length) {
  console.error("Not set up: this needs path-nl as a default pack and an opt-in pack about one topic, suggested (seed-local.mjs --opt-in --suggest).");
  process.exit(2);
}
{
  const sha = (text) => createHash("sha256").update(text).digest("hex");
  const token = `lct_${randomBytes(24).toString("base64url")}`;
  const id = `browse${randomBytes(6).toString("hex")}`;
  const now = Date.now();
  const sql = (command) => execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
  sql([
    `INSERT INTO users (id, name, created_at) VALUES ('${id}', 'Browse check admin', ${now})`,
    `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES ('${id}', '${id}', 'check', '${sha(token)}', '${token.slice(0, 10)}', ${now}, 1)`,
    `INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES ('${id}', 'admin', ${now}, 'd1', 'explore-browse-check')`,
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
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
};
const hash = () => page.evaluate(() => location.hash);
const waitHash = async (test, what, ms = 15_000) => {
  for (let i = 0; i < ms / 100; i++) {
    const h = await hash();
    if (test(h)) return h;
    await page.waitForTimeout(100);
  }
  throw new Error(`${what}: the address stayed ${await hash()}`);
};
const PAGE = '[data-part="page"]:visible';
const back = () => page.locator("header .lx-back:visible").first();
// A new page slides in over the last, whose header (and its Back) shows until the slide ends: wait until one Back shows, then read it.
const backReads = async (want, what, ms = 8_000) => {
  let seen = [];
  for (let i = 0; i < ms / 100; i++) {
    seen = (await page.locator("header .lx-back:visible").allTextContents()).map((text) => text.trim());
    if (seen.length === 1 && seen[0] === want) return;
    await page.waitForTimeout(100);
  }
  same(seen, [want], what);
};
const json = (path, init) => page.evaluate(async ([path, init]) => (await fetch(path, { credentials: "same-origin", ...init })).json(), [path, init]);
const plural = (n, one, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Explore Browse Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
await page.waitForSelector("html[data-app-ready]");
if ((await page.evaluate(async () => (await import("/js/study/learning.js")).learning())) !== "nl") {
  console.error("explore-browse-check needs Dutch as a new account's language.");
  process.exit(2);
}

// ---------- what the server says ----------
const home = await json("/api/community/explore?lang=nl");
const topics = Array.isArray(home.topics) ? home.topics : [];
// A topic with a pack about it alone, and that topic's list as the server orders it.
let topic = null;
let listed = [];
for (const candidate of topics) {
  const list = (await json(`/api/community/items?lang=nl&topic=${encodeURIComponent(candidate.id)}`)).items ?? [];
  if (list.some((item) => item.curated && item.topics.length === 1)) {
    topic = candidate;
    listed = list;
    break;
  }
}

await stage("the home: the search, the lessons as the main card with Start or Continue, the one pack to add next, then the first six topics as cards, each its drawing large with its hard edge, its name whole at a reading size and how many packs are about it, All N to the rest", async () => {
  assert(topics.length > 0, "the server counts no topics in Dutch (its home has no topics)");
  await page.evaluate(() => (location.hash = "#explore"));
  const nav = page.locator(`${PAGE} nav.lx-topics`);
  await nav.locator(".lx-topic").first().waitFor({ timeout: 20_000 });
  const shown = topics.slice(0, 6);
  const cards = await nav.locator(".lx-topic").evaluateAll((all) => all.map((a) => ({ name: a.querySelector(".lx-topic-name")?.textContent, count: a.querySelector(".lx-topic-count")?.textContent, href: a.getAttribute("href") })));
  same(cards, shown.map((t) => ({ name: t.name, count: plural(t.packs, "pack"), href: `#explore/topic/${encodeURIComponent(t.id)}?lang=nl` })), "the topics' cards");
  if (topics.length > 6) {
    const all = page.locator(`${PAGE} .lx-explore-topics a`, { hasText: `All ${topics.length}` });
    same(await all.getAttribute("href"), "#explore/topics?lang=nl", "All N's way to the rest");
  }
  // Each card's drawing has drawn, large (a third of the row), with a hard edge under it in its own deep tone (a box-shadow with no blur);
  // each name whole at 16 px or more in the full ink, the count at 14 px.
  for (let i = 0; i < 50; i++) {
    if ((await nav.locator('.lx-topic .lx-topic-art > [data-part="picture"]').count()) === shown.length) break;
    await page.waitForTimeout(200);
  }
  same(await nav.locator('.lx-topic .lx-topic-art > [data-part="picture"]').count(), shown.length, "cards with their drawings");
  const sized = await nav.locator(".lx-topic").evaluateAll((all) =>
    all.map((a) => {
      const art = a.querySelector(".lx-topic-art"), name = a.querySelector(".lx-topic-name"), count = a.querySelector(".lx-topic-count");
      const shadow = getComputedStyle(art).boxShadow;
      return { art: Math.round(art.getBoundingClientRect().width), edge: /\b0px 4px 0px\b/.test(shadow), paint: art.dataset.paint ?? null, name: parseFloat(getComputedStyle(name).fontSize), cut: name.scrollWidth > name.clientWidth + 1, count: parseFloat(getComputedStyle(count).fontSize) };
    }),
  );
  assert(sized.every((c) => c.art >= 96 && c.edge && c.paint && c.name >= 16 && !c.cut && c.count >= 14), `each card's drawing 96 px or more with its edge in its ground's deep tone, its name whole at 16 px, its count at 14: ${JSON.stringify(sized)}`);
  // The lessons, front and center: path-nl's name, its art, and the one solid way forward, Start or Continue (never Add: they're on the device).
  const path = await fetch(`${BASE}${dutch.find((p) => p.id === "path-nl").url}`).then((r) => r.json());
  const lessons = page.locator(`${PAGE} [data-part="next-step"].lx-lessons-card`);
  await lessons.waitFor({ timeout: 15_000 });
  same((await lessons.locator("h2").textContent()).trim(), path.name, "the lessons card's title");
  const go = (await lessons.locator('button[data-variant="go"]').allTextContents()).map((text) => text.trim());
  assert(go.length === 1 && ["Start", "Continue"].includes(go[0]), `the lessons card's one way forward: ${JSON.stringify(go)}`);
  same(await lessons.getByRole("button", { name: /^Add/ }).count(), 0, "Add on the lessons");
  // Down the page: the search, the lessons, the pack to add next, then the topics.
  const tops = await page.evaluate((P) => {
    const top = (sel) => document.querySelector(`${P} ${sel}`)?.getBoundingClientRect().top ?? null;
    return { search: top('[data-part="search-field"]'), lessons: top(".lx-lessons-card"), pick: top(".lx-pick .lx-face"), topics: top("nav.lx-topics") };
  }, '[data-part="page"]:not([hidden])');
  assert(tops.search < tops.lessons && tops.lessons < tops.pick && tops.pick < tops.topics, `the order down the home: ${JSON.stringify(tops)}`);
  same(await page.locator(`${PAGE} .lx-book, ${PAGE} .lx-plank`).count(), 0, "books or planks on the home");
  await shot("home");
  return { lessons: `${path.name}: ${go[0]}`, topics: cards.map((c) => `${c.name} (${c.count})`) };
});

await stage("a topic's page starts the way Home does: what's about it alone, its first pack's card led by its first sentence with the one solid Add; its second its own card after it, its Add the quiet one; how much of each you know; learners' packs as rows; a whole card opens its pack", async () => {
  assert(topic, "no topic in Dutch has a pack about it alone");
  // What the server lists for the topic: never a general pack (Lexicommons' own on many topics), and the count is what's listed.
  assert(listed.every((item) => !item.curated || item.topics.length === 1), `a general pack on the topic: ${JSON.stringify(listed.filter((i) => i.curated && i.topics.length > 1).map((i) => i.id))}`);
  same(listed.length, topic.packs, "the topic's count, of what's listed on it");
  const own = listed.filter((item) => item.curated);
  const theirs = listed.filter((item) => !item.curated);
  const first = own[0];
  const sample = (await json(`/api/community/items/${encodeURIComponent(first.id)}`)).sample?.[0];
  // The topic from the home's cards, or All N's page when it isn't among the first six.
  await page.evaluate(() => (location.hash = "#explore"));
  await page.locator(`${PAGE} nav.lx-topics .lx-topic`).first().waitFor({ timeout: 20_000 });
  if (!(await page.locator(`${PAGE} .lx-topic[data-topic="${topic.id}"]`).count())) {
    await page.locator(`${PAGE} .lx-explore-topics a`, { hasText: /^All \d+$/ }).click();
    await waitHash((h) => h.startsWith("#explore/topics"), "the topics' page");
  }
  await page.locator(`${PAGE} .lx-topic[data-topic="${topic.id}"]`).click();
  const here = await waitHash((h) => h.startsWith(`#explore/topic/${encodeURIComponent(topic.id)}`), "the topic's page");
  await page.locator(`${PAGE} [data-part="page-title"]`, { hasText: topic.name }).waitFor({ timeout: 15_000 });
  const cards = page.locator(`${PAGE} [data-part="next-step"].lx-topic-card`);
  const card = cards.first();
  await card.waitFor({ timeout: 15_000 });
  same(await page.locator(`${PAGE} .lx-page-head p`).first().textContent(), plural(topic.packs, "pack"), "its count");
  same(await cards.count(), Math.min(own.length, 2), "the topic's own packs, each its own card");
  same(await page.locator(`${PAGE} .lx-next-other`).count(), 0, "a stub under a card");
  same((await card.locator(".lx-next-kicker").textContent()).trim(), `To start · ${plural(first.badges.sentences, "sentence")}`, "the card's line over it");
  const said = (await card.locator("h2").textContent()).trim();
  assert(sample?.sentence && said.startsWith(sample.sentence.replace(/[.!?…]$/, "")), `the card led by its first sentence: ${JSON.stringify({ said, sample: sample?.sentence })}`);
  // One solid button on the page, the first card's; the sequel's Add is the quiet one.
  same(await page.locator(`${PAGE} button[data-variant="go"]`).count(), first.following ? 0 : 1, "solid buttons on the page");
  if (!first.following) same((await card.locator('button[data-variant="go"]').textContent()).trim(), "Add pack", "the first card's solid Add");
  const sequel = own[1] ? cards.nth(1) : null;
  if (sequel) {
    same((await sequel.locator(".lx-next-kicker").textContent()).trim(), `After ${first.title} · ${plural(own[1].badges.sentences, "sentence")}`, "the second card's line over it: after the first");
    const second = (await json(`/api/community/items/${encodeURIComponent(own[1].id)}`)).sample?.[0];
    const saidSecond = (await sequel.locator("h2").textContent()).trim();
    assert(second?.sentence && saidSecond.startsWith(second.sentence.replace(/[.!?…]$/, "")), `the second card led by its own first sentence: ${JSON.stringify({ saidSecond, sample: second?.sentence })}`);
    if (!own[1].following) same(await sequel.locator('button[data-variant="gray"]', { hasText: "Add pack" }).count(), 1, "the second card's quiet Add");
  }
  // How much of each you know: a short bar with its share beside it in words, the same size on both.
  for (let i = 0; i < 75 && (await page.locator(`${PAGE} .lx-topic-card .lx-known:not([data-state])`).count()) < (await cards.count()); i++) await page.waitForTimeout(200);
  const known = await page.locator(`${PAGE} .lx-topic-card .lx-known`).evaluateAll((all) => all.map((bar) => ({ waiting: bar.dataset.state ?? null, said: bar.querySelector(".lx-known-label")?.textContent, track: Math.round(bar.querySelector(".lx-known-track")?.getBoundingClientRect().width ?? 0) })));
  same(known.length, await cards.count(), "a known line on each card");
  assert(known.every((k) => !k.waiting && /^\d{1,3}% known$/.test(k.said ?? "") && k.track === known[0].track && k.track > 0 && k.track <= 80), `each card's known line, short, its share beside it: ${JSON.stringify(known)}`);
  const rows = await page.locator(`${PAGE} [data-part="list"] .lx-row-title`).allTextContents();
  same(rows, theirs.map((item) => item.title), "learners' packs on it, as rows");
  await shot("topic");
  // Add pack adds it here, at once: nothing opens, the server has it followed, and the button says so.
  if (!first.following) {
    await card.getByRole("button", { name: "Add pack" }).click();
    await card.getByRole("button", { name: "Added" }).waitFor({ timeout: 15_000 });
    same(await page.evaluate(() => location.hash), here, "where Add pack leaves you: the topic's page");
    assert((await json(`/api/community/items/${encodeURIComponent(first.id)}`)).item.following, "added: the server has it followed");
  }
  // The whole second card opens its pack (a press on its art, nowhere near its title or button); that pack's Back goes one step, to the topic.
  if (sequel) {
    const art = await sequel.locator(".lx-next-art").boundingBox();
    await page.touchscreen.tap(art.x + art.width / 2, art.y + art.height / 2);
    await waitHash((h) => h.startsWith(`#explore/item/${encodeURIComponent(own[1].id)}`), "the second pack's page");
    await page.locator(`${PAGE} [data-part="page-title"]`, { hasText: own[1].title }).waitFor({ timeout: 15_000 });
    await backReads(topic.name, "the pack's Back, naming the topic");
    await back().click();
    same(await waitHash((h) => !h.startsWith("#explore/item/"), "Back from the pack"), here, "Back from the pack: the topic, one step");
  }
  return { topic: topic.name, packs: listed.length, first: first.title, said };
});

await stage("a pack already on the device never offers Add: the whole lessons card on the home opens the lessons' own page, with Start or Continue", async () => {
  await page.evaluate(() => (location.hash = "#explore"));
  const lessons = page.locator(`${PAGE} [data-part="next-step"].lx-lessons-card`);
  await lessons.waitFor({ timeout: 15_000 });
  const home = await page.evaluate(() => location.hash);
  // A press on its art (not its button) opens its page; its button would start the lesson.
  const art = await lessons.locator(".lx-next-art").boundingBox();
  await page.touchscreen.tap(art.x + art.width / 2, art.y + art.height / 2);
  await waitHash((h) => h.startsWith(`#explore/item/path-nl`), "the lessons' own page");
  await page.locator(`${PAGE} [data-part="page-title"]`).first().waitFor({ timeout: 15_000 });
  for (let i = 0; i < 50 && !(await page.locator(`${PAGE} button[data-variant="go"]`).count()); i++) await page.waitForTimeout(200);
  same(await page.locator(PAGE).getByRole("button", { name: /^Add pack$/ }).count(), 0, "Add pack on the lessons' page");
  const go = (await page.locator(`${PAGE} button[data-variant="go"]`).allTextContents()).map((text) => text.trim());
  assert(go.length === 1 && ["Start", "Continue"].includes(go[0]), `the lessons' page's one way forward: ${JSON.stringify(go)}`);
  await shot("lessons-page");
  await back().click();
  same(await waitHash((h) => !h.startsWith("#explore/item/"), "Back from the lessons' page"), home, "Back from the lessons' page: the home, one step");
  return { forward: go[0] };
});

await stage("search finds the packs that teach a word, then those that only say it, each with its sentence and the word marked, and a topic by its name, first", async () => {
  // From the files of the Dutch packs here (default and suggested): which teach a word (an item written for it: a sentence's own word or its
  // dictionary form, or a plain item that says it), and which only say it (in a sentence written for another word).
  const files = [];
  for (const ref of dutch.filter((p) => !p.optIn || p.suggest)) files.push(await fetch(`${BASE}${ref.url}`).then((r) => r.json()));
  const library = files.map((pack) => pack.name);
  const fold = (text) => String(text ?? "").toLowerCase().replace(/[^\p{L}]/gu, "");
  const inText = (text, w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, "iu").test(text ?? "");
  const own = (item) => item.words?.[item.gap?.index] ?? [];
  const teachesIt = (pack, w) => (pack.items ?? []).some((item) => (item.words ? fold(own(item)[0]) === w || fold(own(item)[1]) === w : inText(item.text, w)));
  const saysIt = (pack, w) => (pack.items ?? []).some((item) => inText(item.text, w) || (item.words ?? []).some(([written, lemma]) => fold(written) === w || fold(lemma) === w));
  // The server reads new packs into its index as it's searched: until it says it's done, what it finds can be short.
  const ask = (q) => json("/api/translate/find", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q, language: "nl" }) });
  for (let i = 0; i < 60; i++) {
    if ((await ask("koffie")).indexing === false) break;
    await page.waitForTimeout(1000);
  }
  // The word: koffie if one pack here is written for it and another only says it, else the first word written for in these files that is,
  // so both headings show. What the server answers must agree with the files, and show the word in each pack's first line.
  const candidates = [...new Set(["koffie", ...files.flatMap((pack) => (pack.items ?? []).map((item) => fold(own(item)[0])))])].filter((w) => w.length > 3).slice(0, 80);
  let searched = null;
  for (const w of candidates) {
    const found = (await ask(w)).packs.filter((pack) => library.includes(pack.name));
    const shows = found.every((pack) => inText(pack.sentences?.[0]?.text, w) || fold(pack.words?.[0]?.lemma) === w);
    if (found.some((pack) => pack.teaches === true) && found.some((pack) => pack.teaches === false) && shows) {
      searched = w;
      break;
    }
  }
  assert(searched, `no word here that one pack is written for and another only says, among ${candidates.length}`);
  const teachers = files.filter((pack) => teachesIt(pack, searched)).map((pack) => pack.name);
  const sayers = files.filter((pack) => !teachesIt(pack, searched) && saysIt(pack, searched)).map((pack) => pack.name);
  await page.evaluate(() => (location.hash = "#explore"));
  const field = page.locator(`${PAGE} [data-part="search-field"] input`);
  await field.waitFor({ timeout: 15_000 });
  await field.fill(searched);
  await field.press("Enter");
  // The search fills Explore's own page in place (its address stays), the home giving way to what it finds.
  const teach = page.locator(`${PAGE} .lx-explore-results:not([hidden]) .lx-search-teach`);
  await teach.locator('[data-part="list-row"]').first().waitFor({ timeout: 20_000 });
  const read = (which) =>
    teach.locator(`ul[data-found="${which}"] [data-part="list-row"]`).evaluateAll((all) => all.map((row) => ({ name: row.querySelector(".lx-row-title")?.textContent, sub: row.querySelector(".lx-row-sub")?.textContent ?? "", marked: [...row.querySelectorAll(".lx-row-sub b")].map((b) => b.textContent.toLowerCase()) })));
  const taught = await read("teaches");
  const said = await read("says");
  const rows = [...taught, ...said].filter((row) => library.includes(row.name));
  // Each of the library's shows why it's there: the word marked in one of its sentences, or named as one of its words ("koffie: coffee").
  assert(rows.length > 0 && rows.every((row) => row.marked.includes(searched) || row.sub.toLowerCase().startsWith(`${searched}:`)), `each with ${searched} shown: ${JSON.stringify(rows)}`);
  // The library's packs written for it are under "teach", those that only say it under "in a sentence", and none under the other (shared packs
  // may be found too: their files aren't read here).
  assert(taught.some((row) => teachers.includes(row.name)) && said.some((row) => sayers.includes(row.name)), `both headings, each with one of the library's: ${JSON.stringify({ taught: taught.map((r) => r.name), said: said.map((r) => r.name), teachers, sayers })}`);
  const misfiled = [...taught.filter((row) => library.includes(row.name) && !teachers.includes(row.name)), ...said.filter((row) => library.includes(row.name) && !sayers.includes(row.name))];
  assert(!misfiled.length, `under the wrong heading: ${JSON.stringify({ misfiled: misfiled.map((r) => r.name), teachers, sayers })}`);
  // "Teach" first, its heading saying so; "in a sentence" after.
  const heads = await teach.locator('[data-part="section-head"]').allTextContents();
  same(heads.map((h) => h.trim()), [`Packs that teach “${searched}”`, `Packs with “${searched}” in a sentence`], "the headings, in order");
  await shot("search-word");
  same(await page.evaluate(() => location.hash), "#explore", "the address while searching in place");
  // Clearing the field brings the home back, in place.
  await field.fill("");
  await page.locator(`${PAGE} .lx-face`).waitFor({ timeout: 10_000 });
  same(await page.locator(`${PAGE} .lx-explore-results:not([hidden])`).count(), 0, "results left once the field is cleared");
  // A topic by its name: what's typed is in a topic's name, and that topic comes before the packs.
  const named = topics.find((t) => t.name.toLowerCase().includes("food")) ?? topics[0];
  const word = named.name.toLowerCase().includes("food") ? "food" : named.name.split(/\s+/)[0].toLowerCase();
  await page.evaluate((q) => (location.hash = `#explore/search?${new URLSearchParams({ q, lang: "nl" })}`), word);
  const tile = page.locator(`${PAGE} .lx-topic[data-topic="${named.id}"]`);
  await tile.waitFor({ timeout: 20_000 });
  const order = await page.evaluate((P) => {
    const tile = document.querySelector(`${P} .lx-topic`);
    const row = document.querySelector(`${P} .lx-search-teach [data-part="list-row"]`);
    return { tile: tile?.getBoundingClientRect().top ?? null, firstPack: row?.getBoundingClientRect().top ?? null };
  }, '[data-part="page"]:not([hidden])');
  assert(order.firstPack === null || order.tile < order.firstPack, `the topic before the packs: ${JSON.stringify(order)}`);
  await shot("search-topic");
  return { word: { searched, teaches: taught.map((r) => r.name), says: said.map((r) => r.name) }, topic: { typed: word, found: named.name } };
});

await stage("sharing a pack of yours is a page: the terms as four plain lines, Back one step to the pack; then the form (the level a row, its topics chips, its cover one of their drawings), and Done becomes the shared pack, whose Back goes one step to the pack", async () => {
  // A pack of its own each run, its content its own too (Explore refuses the same content twice).
  const id = `browse-check-${randomBytes(4).toString("hex")}`;
  const saved = await page.evaluate(async (id) => {
    const cat = await (await fetch("/library/catalogue.json")).json();
    const path = await (await fetch(cat.packs.nl.find((p) => p.id === "path-nl").url)).json();
    const items = path.items.filter((i) => /koffie|thee|melk/.test(i.text)).slice(0, 12).map((i) => ({ ...i, means: `${i.means} (at the café, ${id})` }));
    const mine = { ...path, id, name: "Café Dutch, the check's", about: "What I say at the café.", items };
    delete mine.lessons;
    delete mine.units;
    delete mine.topics;
    const result = await (await import("/js/study/packs.js")).savePack(mine, { by: "the check" });
    return { ok: result.ok, errors: (result.errors ?? []).slice(0, 3) };
  }, id);
  assert(saved.ok, `saved: ${JSON.stringify(saved.errors)}`);
  const packPage = `#settings/study/packs/${id}`;
  await page.evaluate((h) => (location.hash = h), packPage);
  const row = page.locator(`${PAGE} .lx-row-title`, { hasText: /^Share in Explore$/ });
  await row.waitFor({ timeout: 15_000 });
  await row.click();
  await waitHash((h) => h.startsWith(`#explore/share/${id}`), "sharing's page (not a sheet)");
  assert(!(await page.locator('[data-part="sheet"]:visible').count()), "a sheet came up");
  await page.locator(`${PAGE} [data-part="page-title"]`, { hasText: "Share “Café Dutch, the check's”" }).waitFor({ timeout: 15_000 });
  // The terms: four lines, each in bold and explained, nothing boxed and no symbols.
  const terms = await page.locator(`${PAGE} ol.lx-terms > li`).evaluateAll((all) => all.map((li) => ({ head: li.querySelector("b")?.textContent, symbols: li.querySelectorAll("svg").length })));
  assert(terms.length === 4 && terms.every((t) => t.head && !t.symbols), `the terms: ${JSON.stringify(terms)}`);
  await shot("share-terms");
  await back().click();
  same(await waitHash((h) => !h.startsWith("#explore/share/"), "Back from the terms"), packPage, "Back from the terms: the pack, one step");
  await page.locator(`${PAGE} .lx-row-title`, { hasText: /^Share in Explore$/ }).click();
  await waitHash((h) => h.startsWith(`#explore/share/${id}`), "sharing's page again");
  await page.getByRole("button", { name: "I agree" }).click();
  await page.locator(`${PAGE} [data-part="page-title"]`, { hasText: "Share in Explore" }).waitFor({ timeout: 15_000 });
  same(await page.locator(`${PAGE} label[data-part="field"] input`).first().inputValue(), "Café Dutch, the check's", "its name, filled in");
  await page.locator(`${PAGE} .lx-level[data-value="A1"]`).click();
  await page.locator(`${PAGE} button.lx-chip[data-topic="food"]`).click();
  same(await page.locator(`${PAGE} .lx-level[aria-pressed="true"]`).evaluateAll((all) => all.map((p) => p.dataset.value)), ["A1"], "the level pressed");
  same(await page.locator(`${PAGE} button.lx-chip[aria-pressed="true"]`).evaluateAll((all) => all.map((b) => b.dataset.topic)), ["food"], "the topic chosen");
  same(await page.locator(`${PAGE} button.lx-chip[aria-pressed="true"] .lx-icon`).count(), 1, "the chosen topic's check");
  // Its cover: the drawings Food offers (pack-format.js coverChoices), the one picked for it by its id already chosen; another pressed.
  const { choices, auto } = await page.evaluate(async (id) => {
    const pf = await import("/js/study/pack-format.js");
    return { choices: pf.coverChoices(["food"]), auto: pf.coverByIdOf(id, ["food"]) };
  }, id);
  const picks = page.locator(`${PAGE} .lx-cover-pick`);
  await picks.first().waitFor({ timeout: 10_000 });
  same(await picks.evaluateAll((all) => all.map((b) => b.getAttribute("aria-label"))), choices, "the drawings to pick from");
  same(await page.locator(`${PAGE} .lx-cover-pick[aria-pressed="true"]`).getAttribute("aria-label"), auto, "the one picked for it");
  const chosen = choices.find((one) => one !== auto);
  await page.locator(`${PAGE} .lx-cover-pick[aria-label="${chosen}"]`).click();
  same(await page.locator(`${PAGE} .lx-cover-pick[aria-pressed="true"]`).getAttribute("aria-label"), chosen, "another picked");
  same(await page.locator(`${PAGE} .lx-share-cover [data-part="pack-cover"]`).getAttribute("data-drawing"), chosen, "the cover beside its name, that drawing");
  await shot("share-form");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const item = await waitHash((h) => h.startsWith("#explore/item/"), "Done");
  await page.locator(`${PAGE} [data-part="page-title"]`, { hasText: "Café Dutch, the check's" }).waitFor({ timeout: 15_000 });
  const shared = (await json("/api/community/mine")).find((i) => i.sourceId === id);
  assert(shared && shared.level === "A1" && shared.topics.map((t) => t.id).join() === "food" && item.startsWith(`#explore/item/${encodeURIComponent(shared.id)}`), `shared: ${JSON.stringify(shared)}`);
  same((await json(`/api/community/items/${encodeURIComponent(shared.id)}`)).item.cover, chosen, "its cover, kept");
  await backReads("Café Dutch, the check's", "the shared pack's Back, naming the pack it came from");
  await shot("shared");
  await back().click();
  same(await waitHash((h) => !h.startsWith("#explore/item/"), "Back from the shared pack"), packPage, "Back from the shared pack: the pack, one step (the form is gone from the history)");
  return { shared: shared.id };
});

await stage("the pack to start is the topic pack published to be suggested that this person hasn't added whose words are the commonest, never a learner's; learners' packs in the app's art, no drawing twice on a shelf", async () => {
  // Explore twice before the shelf is read. Its page is kept: coming back, it asks the server again, and the answer (now with the pack just shared)
  // comes while the page is on the screen, so it's held for the page's next visit and drawn before that visit's first frame, never into the page
  // under the eye (explore.js renderHome: update, refresh). That's the app's rule, kept on purpose: the first visit gets the answer, the second
  // shows it, as a person sees a pack they shared the next time they come. Don't make the app draw it in to pass this.
  const answered = page.waitForResponse((r) => r.url().includes("/api/community/explore?"), { timeout: 15_000 }).catch(() => null);
  await page.evaluate(() => (location.hash = "#today"));
  await page.waitForTimeout(300);
  await page.evaluate(() => (location.hash = "#explore"));
  await answered;
  await page.waitForTimeout(500);
  await page.evaluate(() => (location.hash = "#today"));
  await page.waitForTimeout(300);
  await page.evaluate(() => (location.hash = "#explore"));
  await page.locator(`${PAGE} .lx-face`).waitFor({ timeout: 15_000 });
  const pickId = decodeURIComponent((await page.locator(`${PAGE} .lx-face`).getAttribute("href")).replace(/^#explore\/item\/([^?]+).*$/, "$1"));
  const added = new Set((await json("/api/community/following")).map?.((f) => f.id ?? f) ?? []);
  assert(topical.some((p) => p.id === pickId) && !added.has(pickId), `the pack to start: ${pickId} (suggested: ${topical.map((p) => p.id).slice(0, 5).join(", ")}…; added: ${[...added].join(", ")})`);
  // The commonest, worked out here from the files: the language's frequency list (a lemma's place, one past the end when it's not on it)
  // and each suggested pack's items, each item's own word being its gap's; the lowest mean wins, the catalog's order breaking a tie.
  const listUrl = catalogue.lists?.frequency?.nl?.url;
  assert(listUrl, "the catalog has no Dutch frequency list, so which pack is commonest can't be told");
  const list = await fetch(`${BASE}${listUrl}`).then((r) => r.json());
  const place = new Map(list.lemmas.map(([lemma], i) => [lemma, i + 1]));
  const meanOf = (pack) => {
    const own = pack.items.flatMap((item) => (typeof item.gap?.index === "number" && item.words?.[item.gap.index]?.[1] ? [item.words[item.gap.index][1]] : []));
    return own.length ? own.reduce((sum, lemma) => sum + (place.get(lemma) ?? place.get(lemma.toLowerCase()) ?? place.size + 1), 0) / own.length : Infinity;
  };
  const ranked = [];
  for (const [n, ref] of topical.entries()) if (!added.has(ref.id)) ranked.push({ id: ref.id, n, mean: Math.round(meanOf(await fetch(`${BASE}${ref.url}`).then((r) => r.json()))) });
  ranked.sort((a, b) => a.mean - b.mean || a.n - b.n);
  assert(ranked.length > 1 && ranked[0].mean !== ranked.at(-1).mean, `two suggested packs whose words differ, to tell the commonest: ${JSON.stringify(ranked)}`);
  same(pickId, ranked[0].id, `the commonest suggested pack (by mean place: ${ranked.slice(0, 4).map((r) => `${r.id} ${r.mean}`).join(", ")}…; the catalog's first: ${topical[0].id})`);
  const learners = await page.locator(`${PAGE} .lx-cover-card`).evaluateAll((all) =>
    all.map((a) => ({ id: decodeURIComponent(a.getAttribute("href").replace(/^#explore\/item\/([^?]+).*$/, "$1")), art: a.querySelector('[data-part="pack-cover"]')?.hasAttribute("data-generic"), drawing: a.querySelector('[data-part="pack-cover"]')?.getAttribute("data-drawing") })),
  );
  assert(learners.length > 0 && learners.every((c) => c.art), `learners' packs, each its cover in the app's art: ${JSON.stringify(learners)}`);
  // A drawing the app chose never twice on a shelf; one its author picked (the item's cover, as the server has it) may be anyone's pick too.
  const picked = new Set(((await json("/api/community/explore?lang=nl")).new ?? []).filter((item) => item.cover).map((item) => item.id));
  const drawings = learners.filter((c) => !picked.has(c.id)).map((c) => c.drawing).filter(Boolean);
  assert(new Set(drawings).size === drawings.length, `a drawing the app chose twice on the shelf: ${JSON.stringify(drawings)} (picked by their authors: ${[...picked].join(", ") || "none"})`);
  same(await page.locator(`${PAGE} [data-part="book-cover"]`).count(), 0, "flat designed covers on the home");
  await shot("home-after");
  return { pick: pickId, mean: ranked[0].mean, next: ranked[1], learners: learners.length };
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.join("\n"));
  return "none";
});

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
await browser.close();
console.log(failed ? `${failed} stage(s) failed` : "all stages passed");
process.exit(failed ? 1 : 0);
