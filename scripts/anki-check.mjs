#!/usr/bin/env node
// Adding an Anki deck, through the real page on a phone (public/js/anki/, study/deck.js): the parser nowhere until someone
// asks for it; each generation of the file; a plain report of what it got; a session played with its evidence on the card's own
// unit; only the games a card can carry; its sound kept on the device and played with none heard; hostile decks that run
// nothing and fail in words, with the page answering throughout; a big deck's cap; sharing one through the existing sheet, what
// goes up (no sound, nothing that names one), someone else adding and studying it, reporting it; deleting it. LOCAL only: it
// signs up test accounts and deletes them.
//   node scripts/anki-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--deck <real.apkg>]…
// Real decks stay out of the repo: each --deck goes through the page and its first steps. Exit 0 = pass.
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "./quiet-browser.mjs";
import * as decks from "./fixtures/anki-decks.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const REAL = argv.flatMap((arg, i) => (argv[i - 1] === "--deck" ? [resolve(arg)] : []));
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST) {
  console.error("Usage: node scripts/anki-check.mjs http://localhost:<port> <outDir> --persist-to <dir> [--deck <real.apkg>]…");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const HERE = dirname(fileURLToPath(import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "anki-check-"));
const SQL = await decks.sqlJs();
const MP3 = readFileSync(join(HERE, "../public/audio/starter-word-order/ido/trein-gemist.mp3"));

const SPEC = {
  deck: "Dutch basics",
  description: "<p>Made by <b>A. Teacher</b>.</p>",
  types: [decks.BASIC, decks.CLOZE],
  notes: [
    { fields: ["het huis [sound:huis.mp3]", "the house"] },
    { fields: ["de hond", "the dog"] },
    { fields: ["Ik heb gisteren een boek gelezen.", "I read a book yesterday."] },
    { fields: ["de kat", "the cat"] },
    { fields: ["de boom", "the tree"] },
    { fields: ["het water", "the water"] },
    { type: decks.CLOZE.id, fields: ["De {{c1::zon}} schijnt vandaag.", "The sun shines today."] },
    { type: decks.CLOZE.id, fields: ["Ik drink {{c1::koffie}} in de morgen.", "I drink coffee in the morning."] },
    { type: decks.CLOZE.id, fields: ["Wij wonen in {{c1::Amsterdam}} nu.", "We live in Amsterdam now."] },
  ],
  media: { "huis.mp3": MP3 },
};
const file = (name, bytes) => {
  const path = join(scratch, name);
  writeFileSync(path, bytes);
  return path;
};
const FILES = {
  latest: file("Dutch basics.apkg", decks.newApkg(SQL, SPEC)),
  old: file("Old spanish.apkg", decks.oldApkg(SQL, { deck: "Spanish words", types: [decks.BASIC], notes: [{ fields: ["la casa", "the house"] }, { fields: ["el perro", "the dog"] }, { fields: ["el gato", "the cat"] }, { fields: ["el árbol", "the tree"] }] })),
  anki21: file("german.apkg", decks.oldApkg(SQL, { deck: "German words", types: [decks.BASIC], notes: [{ fields: ["das Haus", "the house"] }, { fields: ["der Hund", "the dog"] }] }, { name: "collection.anki21" })),
  colpkg: file("collection.colpkg", decks.newColpkg(SQL, { deck: "French words", types: [decks.BASIC], notes: [{ fields: ["la maison", "the house"] }, { fields: ["le chien", "the dog"] }] })),
  rich: file("rich.apkg", decks.oldApkg(SQL, { deck: "Dutch rich words", types: [{ id: 7001, name: "Rich", fields: ["Word", "Meaning", "Notes", "Part of speech", "Picture"], templates: [{ name: "Card 1", qfmt: "{{Word}}", afmt: "{{Meaning}}<br>{{Notes}}" }] }], notes: [
    { fields: ["het huis", "the house", 'a <b>home</b> too<script>window.lxHacked = 1</script><img src=x onerror="window.lxHacked = 1">', "noun", '<img src="x.png">'], tags: "chapter-1 leech marked noun::place" },
    { fields: ["de hond", "the dog", "", "", ""] },
    { fields: ["de kat", "the cat", "", "", ""] },
    { fields: ["de boom", "the tree", "", "", ""] },
    { fields: ["de vis", "the fish", "", "", ""] },
  ] })),
  unsure: file("mystery.apkg", decks.oldApkg(SQL, { deck: "My words", types: [decks.BASIC], notes: [{ fields: ["kaj", "and"] }, { fields: ["hundo", "dog"] }] })),
  flipped: file("flipped.apkg", decks.oldApkg(SQL, { deck: "Swedish the other way", types: [{ ...decks.BASIC, fields: ["English", "Swedish"], templates: [{ q: "{{English}}", a: "{{Swedish}}" }] }], notes: [{ fields: ["the house", "huset"] }, { fields: ["the dog", "hunden"] }, { fields: ["the cat", "katten"] }] })),
  hostile: file("hostile.apkg", decks.newApkg(SQL, decks.HOSTILE)),
  deflateBomb: file("bomb.apkg", decks.deflateBomb()),
  zstdBomb: file("zbomb.apkg", decks.zstdBomb()),
  hugeWindow: file("window.apkg", decks.zstdHugeWindow()),
  broken: file("broken.apkg", decks.brokenDatabase()),
  view: file("view.apkg", decks.viewDatabase(SQL)),
  notZip: file("holiday.jpg", Buffer.from("not a zip at all, this is a picture of a holiday, honest".repeat(4))),
  long: file("long.apkg", decks.oldApkg(SQL, { deck: "Dutch long cards", types: [decks.BASIC], notes: [
    { fields: [`${"een heel lang woord ".repeat(19)}einde`, `${"a very long answer here ".repeat(16)}end`] },
    { fields: ["onafhankelijkheidsverklaringsondertekeningsceremonievoorbereiding", "x".repeat(70)] },
    { fields: ["de hond", "the dog"] },
    { fields: ["de kat", "the cat"] },
    { fields: ["de boom", "the tree"] },
  ] })),
  // The offline stage's own deck: no other stage studies it, so the reviews it plants are due (7 Nov 2026: it used the long cards, which
  // their own stage had just studied, and nothing was due once that stage played through).
  offline: file("offline.apkg", decks.oldApkg(SQL, { deck: "Dutch offline cards", types: [decks.BASIC], notes: [{ fields: ["de fiets", "the bike"] }, { fields: ["de trein", "the train"] }, { fields: ["de bus", "the bus"] }] })),
  big: file("big.apkg", decks.manyNotes(SQL, 6000)),
  huge: file("huge.apkg", decks.manyNotes(SQL, 200_001)),
};

const results = {};
let failed = 0;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
const same = (a, b, what) => assert(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)?.slice(0, 500)} ≠ ${JSON.stringify(b)?.slice(0, 500)}`);
let page;
async function stage(name, fn) {
  try {
    results[name] = { ok: true, note: (await fn()) ?? "" };
    console.log(`PASS ${name}: ${results[name].note}`);
  } catch (error) {
    failed++;
    results[name] = { ok: false, note: String(error.stack ?? error) };
    console.log(`FAIL ${name}: ${error.message}`);
    await page.screenshot({ path: `${OUT}/fail-${failed}.png` }).catch(() => {});
  }
}

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });

async function person(name) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const tab = await context.newPage();
  const seen = { errors: [], requests: [], dialogs: 0 };
  tab.on("pageerror", (error) => seen.errors.push(String(error)));
  tab.on("dialog", (dialog) => {
    seen.dialogs++;
    dialog.dismiss().catch(() => {});
  });
  tab.on("request", (request) => seen.requests.push(new URL(request.url()).pathname));
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
  return { context, tab, seen };
}

const me = await person("Anki Check");
page = me.tab;
const go = async (hash) => {
  await page.evaluate((to) => (location.hash = to), hash);
  await page.waitForTimeout(150);
};
const pick = (path) => page.locator('input[type="file"]').setInputFiles(path);
const toImport = async () => {
  // From the page itself, a new start of it.
  await go("#today");
  await go("#study/import");
  await page.getByRole("button", { name: "Choose a file" }).waitFor({ timeout: 30_000 });
};
const words = () => page.locator('[data-part="page"]').first().innerText();
// The session at rest: it slides up as it opens and each step comes in moving, so what's measured waits for the session and what holds it to
// stop moving, and its answer bar to stay put for a frame (7 Nov 2026: measured mid-slide, a long card's Show the other side sat below a
// 568 px screen that, at rest, it fits with 16 px to spare).
const sessionAtRest = () =>
  page.waitForFunction(() => {
    const root = document.querySelector('[data-part="session"]:not([data-ghost])');
    if (!root) return false;
    const moving = document.getAnimations().some((a) => a.playState === "running" && a.effect?.target instanceof Element && a.effect.target.contains(root));
    const bar = root.querySelector('[data-part="answer-bar"]')?.getBoundingClientRect();
    const at = JSON.stringify([root.getBoundingClientRect().top, bar?.top ?? null, bar?.bottom ?? null]);
    const still = globalThis.__lxRestAt === at;
    globalThis.__lxRestAt = at;
    return !moving && still;
  }, null, { timeout: 5000, polling: "raf" });
const importAndReport = async (path) => {
  await toImport();
  await pick(path);
  await page.getByRole("button", { name: /^(Add to my packs|Replace my copy)$/ }).waitFor({ timeout: 120_000 });
};
const addIt = async () => {
  await page.getByRole("button", { name: /^(Add to my packs|Replace my copy)$/ }).click();
  await page.locator('[data-anki="added"]').waitFor({ timeout: 180_000 });
};
const packNamed = (name) => page.evaluate(async (wanted) => {
  const { allPacks, packSounds } = await import("/js/study/packs.js");
  const pack = allPacks().find((one) => one.name === wanted);
  return pack ? { ...pack, sounds: packSounds(pack.id) } : null;
}, name);
const refusedInWords = async (path, pattern, what) => {
  await toImport();
  // The page stays free while it reads: frames keep coming, however hard the file is.
  await page.evaluate(() => {
    window.__gaps = [];
    let last = performance.now();
    const tick = (now) => {
      window.__gaps.push(now - last);
      last = now;
      window.__ticking = requestAnimationFrame(tick);
    };
    window.__ticking = requestAnimationFrame(tick);
  });
  await pick(path);
  const message = page.locator('p[role="status"][data-tone="wrong"]');
  await message.waitFor({ timeout: 180_000 });
  const said = await message.innerText();
  assert(pattern.test(said), `${what}: "${said}"`);
  const worst = await page.evaluate(() => {
    cancelAnimationFrame(window.__ticking);
    return Math.round(Math.max(...window.__gaps));
  });
  assert(worst < 1500, `${what}: the page stopped for ${worst} ms`);
  assert(await page.getByRole("button", { name: "Choose a file" }).isVisible(), `${what}: you can't choose another`);
  return `"${said}" (longest frame ${worst} ms)`;
};

// ---------- what a session asks, played by what the pack says ----------

async function playOne(pack, { wrong = false } = {}) {
  const session = page.locator('[data-part="session"]');
  const game = await session.getAttribute("data-game");
  const id = await session.getAttribute("data-item");
  const card = pack.items.find((one) => one.id === id);
  if (game === "card") {
    await page.getByRole("button", { name: "Show the other side" }).click();
    const button = page.getByRole("button", { name: /^(Continue|I knew it)$/ });
    if (wrong && (await page.getByRole("button", { name: "Not yet" }).count())) await page.getByRole("button", { name: "Not yet" }).click();
    else await button.click();
    return { game, id, advanced: true };
  }
  if (game === "choose" || game === "listen") {
    const choice = session.locator('[data-part="choice"]');
    const texts = await choice.allInnerTexts();
    const right = texts.findIndex((text) => text.trim() === card.means);
    assert(right >= 0, `${game}: the right back isn't offered for ${card.text}: ${texts}`);
    await choice.nth(wrong ? (right + 1) % texts.length : right).click();
  } else if (game === "type") {
    await session.locator('[data-part="text-field"]').fill(wrong ? "zzz" : card.text);
    await page.getByRole("button", { name: "Check", exact: true }).click();
  } else if (game === "fill") {
    const options = session.locator('[data-part="fill-sentence"] ~ * button, .lx-row button');
    if (await options.count()) {
      const texts = (await options.allInnerTexts()).map((text) => text.trim());
      const right = texts.indexOf(card.cloze.answer);
      assert(right >= 0, `fill: ${card.cloze.answer} isn't among ${texts}`);
      await options.nth(wrong ? (right + 1) % texts.length : right).click();
    } else {
      await session.locator('[data-part="text-field"]').fill(wrong ? "zzz" : card.cloze.answer);
      await page.getByRole("button", { name: "Check", exact: true }).click();
    }
  } else if (game === "arrange") {
    const order = (card.sentence ?? card.text).trim().split(/\s+/);
    for (const word of order) await session.locator('[data-part="arrange-bank"] [data-part="tile"]:not([data-state="used"])', { hasText: new RegExp(`^${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).first().click();
    await page.getByRole("button", { name: "Check", exact: true }).click();
  } else if (game === "match") {
    const items = session.locator('[data-part="match-item"]');
    const total = await items.count();
    const whole = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
    const byText = new Map(pack.items.flatMap((one) => [[one.text, one.means]]));
    for (const [front, back] of byText) {
      const left = items.filter({ hasText: whole(front) });
      if (!(await left.count())) continue;
      await left.first().click();
      await items.filter({ hasText: whole(back) }).first().click();
    }
    assert(total > 0, "match: nothing to pair");
  } else throw new Error(`a step with no game: ${game}`);
  await page.getByRole("button", { name: /^(Continue|See how it went)$/ }).click();
  return { game, id };
}

async function playSession(pack, { most = 40, wrongFirst = false } = {}) {
  await go(`#study/session/deck/${encodeURIComponent(pack.id)}`);
  const session = page.locator('[data-part="session"]');
  await session.waitFor({ timeout: 30_000 });
  const played = [];
  for (let i = 0; i < most; i++) {
    if (await page.locator('[data-part="session-summary"]').count()) break;
    if (!(await session.getAttribute("data-game"))) break;
    played.push(await playOne(pack, { wrong: wrongFirst && i === 0 }));
    await page.waitForTimeout(60);
  }
  return played;
}
const leaveSession = async () => {
  const done = page.getByRole("button", { name: /^(Done|Back to Study)$/ });
  if (await done.count()) await done.first().click();
  await page.waitForTimeout(200);
};

// ---------- stages ----------

await stage("the parser isn't in the shell, and nothing loads it until it's asked for", async () => {
  const sw = await (await fetch(`${BASE}/sw.js`)).text();
  const start = sw.indexOf("const SHELL = [");
  const shell = sw.slice(start, sw.indexOf("];", start));
  assert(!/\/js\/anki\/|\/vendor\/anki\//.test(shell), "the shell lists it");
  await go("#study");
  await go("#study/packs");
  await go("#today");
  const loaded = me.seen.requests.filter((path) => /\/anki\//.test(path));
  same(loaded, [], "loaded without being asked");
  return "not in SHELL; no request for it across a first open, Study, Packs and Today";
});

await stage("where a pack is added: Your packs, and nothing about an AI", async () => {
  await go("#study/packs");
  await page.getByText("Add an Anki deck", { exact: false }).first().waitFor({ timeout: 10_000 });
  await go("#study/packs");
  await page.locator('[data-part="page"] a[href^="#study/import"]').first().waitFor({ timeout: 10_000 });
  await page.locator('[data-part="page"] a[href^="#study/import"]').first().click();
  await page.getByRole("button", { name: "Choose a file" }).waitFor({ timeout: 30_000 });
  const text = await words();
  assert(!/\bAI\b|Claude|ChatGPT|assistant/i.test(text), `names an AI: ${text}`);
  const box = await page.getByRole("button", { name: "Choose a file" }).boundingBox();
  assert(box.height >= 44 && box.width >= 44, `the button is ${box.width} × ${box.height}`);
  await page.screenshot({ path: `${OUT}/import-start.png` });
  return "Your packs opens the page; a file picker over 44 px";
});

let latest = null;
await stage("the newest file format, through the page: real progress, a plain report, then added", async () => {
  await toImport();
  await pick(FILES.latest);
  await page.getByRole("button", { name: "Add to my packs" }).waitFor({ timeout: 120_000 });
  const text = await words();
  for (const expected of [/Dutch basics/, /Made by A\. Teacher/, /Dutch/, /9 cards/, /1 card with sound/, /Study cards/, /Type it/, /Match/, /Choose/, /Fill the gap/, /Listening/, /Word order/]) assert(expected.test(text), `the report has no ${expected}: ${text}`);
  await page.screenshot({ path: `${OUT}/report.png`, fullPage: true });
  assert(!/We couldn't tell/.test(text), "it asked about a deck that says what it is");
  await addIt();
  latest = await packNamed("Dutch basics");
  assert(latest, "no pack");
  same(latest.items.length, 9, "its cards");
  same(latest.language, "nl", "its language");
  same(latest.from, "en", "its side");
  same(Object.keys(latest.sounds ?? {}).length, 1, "its sounds");
  const clip = Object.values(latest.sounds)[0];
  const kept = await page.evaluate(async (name) => Boolean(await (await caches.open("lx-audio-v1")).match(`/api/packs/audio/${name}`)), clip);
  assert(kept, `the sound ${clip} isn't kept`);
  assert(!JSON.stringify({ ...latest, sounds: undefined }).includes("huis.mp3"), "the file's name is in the pack");
  await page.screenshot({ path: `${OUT}/added.png` });
  return `9 cards, Dutch from English, 1 sound kept as ${clip}`;
});

await stage("it stays on the device: nothing about its words reaches the server, with no AI connected", async () => {
  await page.evaluate(async () => (await import("/js/study/pack-inbox.js")).checkPackInbox());
  const puts = me.seen.requests.filter((path) => path.startsWith("/api/packs/copies/"));
  same(puts, [], "a copy went up");
  const exported = await page.evaluate(async () => (await fetch("/api/me/export")).text());
  assert(!exported.includes("Ik heb gisteren een boek gelezen"), "its words are in what the server holds");
  return "no copy sent, and its words aren't in the account's export";
});

await stage("on a computer, a file dropped anywhere on the page comes in like a picked one", async () => {
  await toImport();
  const bytes = readFileSync(FILES.old).toString("base64");
  await page.evaluate((data) => {
    const file = new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], "dropped.apkg");
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    window.dispatchEvent(new DragEvent("drop", { dataTransfer, bubbles: true, cancelable: true }));
  }, bytes);
  await page.getByRole("button", { name: /^(Add to my packs|Replace my copy)$/ }).waitFor({ timeout: 60_000 });
  assert((await words()).includes("Spanish words"), "the wrong deck");
  return "read from a drop";
});

await stage("each generation: an old .apkg, .anki21, a .colpkg, its language from its name", async () => {
  const out = [];
  for (const [path, name, language] of [[FILES.old, "Spanish words", "es"], [FILES.anki21, "German words", "de"], [FILES.colpkg, "French words", "fr"]]) {
    await importAndReport(path);
    await addIt();
    const pack = await packNamed(name);
    assert(pack, `no pack ${name}`);
    same(pack.language, language, name);
    out.push(`${name}: ${pack.items.length} cards`);
  }
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  return out.join("; ");
});

await stage("which side is which: named fields turn a deck round, and an unsure one asks before it adds", async () => {
  await importAndReport(FILES.flipped);
  await addIt();
  const flipped = await packNamed("Swedish the other way");
  same([flipped.language, flipped.items[0].text, flipped.items[0].means], ["sv", "huset", "the house"], "its sides");
  await importAndReport(FILES.unsure);
  const text = await words();
  assert(/We couldn't tell/.test(text), `it didn't ask: ${text}`);
  await page.screenshot({ path: `${OUT}/asks.png`, fullPage: true });
  const add = page.getByRole("button", { name: "Add to my packs" });
  // A language chosen in place, from every language there is.
  await page.getByText("It teaches").click();
  await page.locator('[data-part="sheet"], [data-part="sheet-layer"], .lx-sheet').first().waitFor({ timeout: 10_000 }).catch(() => {});
  await page.getByRole("radio", { name: "Esperanto" }).evaluate((node) => node.click());
  await page.waitForTimeout(250);
  assert(await add.isVisible() || (await page.getByRole("button", { name: "Add to my packs" }).isVisible()), "nothing to add it with");
  await page.getByRole("button", { name: "Add to my packs" }).click();
  await page.locator('[data-anki="added"]').waitFor({ timeout: 60_000 });
  const pack = await packNamed("My words");
  same(pack.language, "eo", "what you chose");
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  return "Swedish turned round from its field names; an unsure one asked, then took what was chosen";
});

await stage("a session: the games its cards can carry, each answer one row on the card's unit, and it's scheduled", async () => {
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  const played = await playSession(latest);
  await page.locator('[data-part="session-summary"]').waitFor({ timeout: 10_000 });
  const text = await page.locator('[data-part="session-summary"]').innerText();
  await page.screenshot({ path: `${OUT}/summary.png` });
  await leaveSession();
  const rows = await page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().filter((row) => row.concept.startsWith("k:")).map((row) => ({ concept: row.concept, outcome: row.outcome, activity: row.activity, skill: row.skill, test: row.test, lang: row.lang })));
  assert(rows.length >= played.length - 1, `${rows.length} rows for ${played.length} steps`);
  assert(rows.every((row) => row.concept.startsWith(`k:${latest.id}/`) && row.lang === "nl"), JSON.stringify(rows[0]));
  assert(rows.every((row) => row.outcome !== "wrong"), "a right answer recorded wrong");
  assert(rows.some((row) => row.outcome === "right"), "nothing graded right");
  const games = [...new Set(played.map((one) => one.game))];
  const state = await page.evaluate(async (unit) => {
    const { unitState } = await import("/js/study/progress.js");
    const s = unitState(unit);
    return { kind: s.kind, isNew: s.isNew, read: s.strengths.read?.dueAt ?? null };
  }, rows.find((row) => row.outcome === "right").concept);
  same(state.kind, "card", "its kind");
  assert(!state.isNew && state.read > Date.now(), `it isn't scheduled: ${JSON.stringify(state)}`);
  const known = await page.evaluate(async () => {
    const { wordsKnown } = await import("/js/know/celebration-ui.js");
    return wordsKnown();
  });
  assert(Number.isFinite(known), "the summary's word count broke");
  assert(/What moved|Nicely done|Session done/.test(text), text);
  return `${played.length} steps: ${games.join(", ")}; ${rows.length} rows`;
});

await stage("what else a card carried: a press away, as text, in the drawer its \"?\" opens (study/learn-more.js), every field and the tags; nothing graded; a card with none has the \"?\" and no fields in it", async () => {
  await importAndReport(FILES.rich);
  await addIt();
  const pack = await packNamed("Dutch rich words");
  assert(pack, "no pack");
  const first = pack.items.find((one) => one.text === "het huis");
  same(first.extras.map((extra) => extra.label), ["Notes", "Part of speech"], "its fields");
  same(first.tags, ["chapter-1", "noun::place"], "its tags, no study markers");
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  await go(`#study/session/deck/${encodeURIComponent(pack.id)}`);
  const session = page.locator('[data-part="session"]');
  await session.waitFor({ timeout: 30_000 });
  // Shown, a card has its "?" whatever it carried; its drawer has the card's fields and tags when it has any.
  const more = session.locator('[data-part="learn-more"]');
  let opened = 0;
  let plain = 0;
  for (let i = 0; i < 40; i++) {
    if (await page.locator('[data-part="session-summary"]').count()) break;
    if (!(await session.getAttribute("data-game"))) break;
    const id = await session.getAttribute("data-item");
    const card = pack.items.find((one) => one.id === id);
    const game = await session.getAttribute("data-game");
    if (game === "card") {
      await page.getByRole("button", { name: "Show the other side" }).click();
      await more.waitFor({ timeout: 3000 });
      const box = await more.boundingBox();
      assert(box.height >= 44 && box.y + box.height <= 844, `the button: ${JSON.stringify(box)}`);
      if (card?.extras) {
        if (!opened) {
          const before = await page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().length);
          await more.click();
          const sheet = page.locator('.lx-sheet-layer [data-part="learn-sheet"] [data-part="concept-section"]');
          await sheet.first().waitFor({ timeout: 3000 });
          const text = (await page.locator(".lx-sheet-layer").innerText()).replace(/\s+/g, " ");
          for (const words of ["Notes", "a home too", "Part of speech", "noun", "Tags", "chapter-1, noun::place"]) assert(text.includes(words), `the sheet has no "${words}": ${text.slice(0, 300)}`);
          assert(!/script|alert|onerror/i.test(text), `markup on the sheet: ${text.slice(0, 300)}`);
          assert(!(await page.evaluate(() => window.lxHacked)), "something in a field ran");
          await page.screenshot({ path: `${OUT}/more-on-this-card.png` });
          await page.keyboard.press("Escape");
          await page.locator(".lx-sheet-layer").waitFor({ state: "detached", timeout: 3000 });
          assert(await session.isVisible(), "Escape ended the session");
          same(await page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().length), before, "opening it recorded something");
          opened++;
        }
      } else {
        await page.waitForTimeout(120);
        same(await more.count(), 1, `the "?" on ${card?.text}`);
        if (!plain) {
          await more.click();
          await page.locator('.lx-sheet-layer [data-part="learn-sheet"]').waitFor({ timeout: 3000 });
          same(await page.locator('.lx-sheet-layer [data-card-tags]').count(), 0, `tags in the drawer of ${card?.text}, which has none`);
          const text = (await page.locator(".lx-sheet-layer").innerText()).replace(/\s+/g, " ");
          assert(!/Notes|Part of speech/.test(text), `fields in the drawer of ${card?.text}, which has none: ${text.slice(0, 200)}`);
          await page.keyboard.press("Escape");
          await page.locator(".lx-sheet-layer").waitFor({ state: "detached", timeout: 3000 });
        }
        plain++;
      }
      await page.getByRole("button", { name: /^(Continue|I knew it)$/ }).click();
      await page.waitForTimeout(60);
      continue;
    }
    await playOne(pack);
    await page.waitForTimeout(60);
  }
  assert(opened === 1, "no card opened it");
  assert(plain >= 1, "no card with nothing more was seen");
  await leaveSession();
  // Its rows and pack aren't the next stages' business.
  await page.evaluate(async (id) => (await import("/js/study/packs.js")).deletePack(id), pack.id);
  return `opened on ${first.text}; ${plain} plain cards had the "?" with no fields in its drawer`;
});

await stage("a wrong answer says so and comes back as a miss; a due row shows in Study", async () => {
  await go("#study");
  await page.waitForTimeout(300);
  const study = await words();
  assert(study.includes("Dutch basics"), `no row: ${study}`);
  // Everything due now: an answer from long ago stands in.
  await page.evaluate(async ({ id, cards }) => {
    const { record } = await import("/js/study/progress.js");
    const at = Date.now() - 90 * 86_400_000;
    record(cards.map((card) => ({ at, concept: `k:${id}/${card.id}`, outcome: "right", test: "pick", skill: "read", activity: "choose", item: `${id}/${card.id}` })));
  }, { id: latest.id, cards: latest.items });
  await go("#today");
  await go("#study");
  await page.waitForTimeout(400);
  const again = await words();
  assert(/\d+ due/.test(again), `no due count: ${again}`);
  await page.screenshot({ path: `${OUT}/study-row.png`, fullPage: true });
  const played = await playSession(latest, { wrongFirst: true });
  await leaveSession();
  const miss = await page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().filter((row) => row.concept.startsWith("k:") && row.outcome === "wrong").length);
  assert(miss >= 1, `no miss recorded in ${JSON.stringify(played.slice(0, 3))}`);
  return `${played.length} due steps, first answered wrong: ${miss} miss recorded`;
});

await stage("Listening only for a card whose sound came through: played from this device, with none heard", async () => {
  const report = await page.evaluate(async (id) => {
    const { allPacks } = await import("/js/study/packs.js");
    const { cardsOf } = await import("/js/study/deck.js");
    const entries = cardsOf(allPacks().find((pack) => pack.id === id));
    return entries.map((entry) => ({ id: entry.card.id, listen: entry.games.includes("listen"), sound: Boolean(entry.sound), games: entry.games }));
  }, latest.id);
  same(report.filter((one) => one.listen).length, 1, "cards with Listening");
  assert(report.every((one) => one.listen === one.sound), "a card with Listening has no sound, or one with sound has none");
  const cloze = report.filter((one) => one.games.includes("fill"));
  same(cloze.length, 3, "cloze cards");
  assert(cloze.every((one) => same(one.games, ["fill"], "a cloze card's games") === undefined), "");
  const said = await page.evaluate(async (id) => {
    const { allPacks, packSounds } = await import("/js/study/packs.js");
    const voice = await import("/js/study/voice.js");
    const pack = allPacks().find((one) => one.id === id);
    const [card, clip] = Object.entries(packSounds(id))[0];
    const played = voice.speakCard({ text: pack.items.find((one) => one.id === card).text, clip, lang: "nl" }, {});
    const audio = [...document.querySelectorAll("audio")].concat(window.__lxAudio ?? []);
    await new Promise((done) => setTimeout(done, 300));
    played?.stop();
    return { asked: Boolean(played), elements: audio.length };
  }, latest.id);
  assert(said.asked, "nothing was played");
  const fetched = me.seen.requests.filter((path) => path.startsWith("/api/packs/audio/"));
  return `Listening on 1 of ${report.length}; the sound asked for from Cache Storage (${fetched.length} over the network), muted`;
});

await stage("hostile: script and markup in every field, template and name run nothing and show as text", async () => {
  me.seen.requests.length = 0;
  await importAndReport(FILES.hostile);
  await page.screenshot({ path: `${OUT}/hostile-report.png`, fullPage: true });
  await addIt();
  const pack = await packNamed("Dutch");
  assert(pack, "its name wasn't cleaned");
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  const played = await playSession(pack, { most: 12 }).catch((error) => {
    throw new Error(`playing it: ${error.message}`);
  });
  await page.screenshot({ path: `${OUT}/hostile-session.png` });
  await leaveSession();
  await go(`#settings/study/packs/${encodeURIComponent(pack.id)}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/hostile-pack.png`, fullPage: true });
  const dom = await page.evaluate(() => ({
    ran: window.__ran ?? null,
    pictures: [...document.querySelectorAll('img[src="x"], img[src="a.png"]')].length,
    frames: document.querySelectorAll("iframe, object, embed").length,
    scripts: [...document.querySelectorAll("script")].filter((node) => node.textContent.includes("__ran")).length,
    links: [...document.querySelectorAll('a[href^="javascript"]')].length,
    handlers: [...document.querySelectorAll("[onerror],[onclick],[onload],[onmouseover]")].length,
    hidden: getComputedStyle(document.body).display,
  }));
  same(dom, { ran: null, pictures: 0, frames: 0, scripts: 0, links: 0, handlers: 0, hidden: dom.hidden === "none" ? "not hidden" : dom.hidden }, "what got into the page");
  same(me.seen.dialogs, 0, "dialogs");
  same(me.seen.requests.filter((path) => path === "/x" || path.endsWith("/x")), [], "a request for its picture");
  assert(pack.items.some((card) => card.text.includes("<img src=x onerror=")), "a field's entity shown as the text it says");
  return `${pack.items.length} cards, ${played.length} steps played; nothing ran, no element came from a card`;
});

await stage("a deflate bomb stops at its cap, in words, with the page answering", () => refusedInWords(FILES.deflateBomb, /unpacks to more/, "the bomb"));
await stage("a zstd bomb too", () => refusedInWords(FILES.zstdBomb, /unpacks to more/, "the zstd bomb"));
await stage("a zstd frame asking for 2 GB is refused before anything's set aside", () => refusedInWords(FILES.hugeWindow, /unpacks to more/, "the window"));
await stage("a broken database", () => refusedInWords(FILES.broken, /damaged|not one/, "the database"));
await stage("a database whose notes are a view that never ends", () => refusedInWords(FILES.view, /doesn't look like an Anki file/, "the view"));
await stage("a file that isn't a deck at all", () => refusedInWords(FILES.notZip, /doesn't look like an Anki file/, "the picture"));
await stage("a deck too huge to go through is refused in words", () => refusedInWords(FILES.huge, /more than Lexicommons can go through/, "the huge deck"));

await stage("a big deck: real progress, its first 5,000 kept and said plainly, the page answering on a slowed phone", async () => {
  const cdp = await me.context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await toImport();
  await page.evaluate(() => {
    window.__gaps = [];
    let last = performance.now();
    const tick = (now) => {
      window.__gaps.push(now - last);
      last = now;
      window.__ticking = requestAnimationFrame(tick);
    };
    window.__ticking = requestAnimationFrame(tick);
  });
  const started = Date.now();
  await pick(FILES.big);
  await page.locator('[data-anki="reading"]').waitFor({ timeout: 10_000 });
  const progress = new Set();
  while (!(await page.getByRole("button", { name: "Add to my packs" }).count())) {
    const line = await page.locator('[data-anki="reading"] p').innerText().catch(() => "");
    if (line) progress.add(line);
    await page.waitForTimeout(50);
    assert(Date.now() - started < 120_000, "it never finished");
  }
  const took = Date.now() - started;
  const text = await words();
  assert(/first 5,000 cards/.test(text) && /1,000 more/.test(text), `not said: ${text}`);
  // It can't say what language woord1 is, and adding waits until you say.
  assert(/We couldn't tell/.test(text) && (await page.getByRole("button", { name: "Add to my packs" }).isDisabled()), "it would add a deck with no language");
  const worst = await page.evaluate(() => {
    cancelAnimationFrame(window.__ticking);
    return Math.round(Math.max(...window.__gaps));
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  assert(worst < 1500, `the page stopped for ${worst} ms`);
  await page.screenshot({ path: `${OUT}/big.png`, fullPage: true });
  return `${took} ms at CPU ×4, ${progress.size} progress lines (${[...progress].slice(-1)}), longest frame ${worst} ms`;
});

await stage("adding the big deck saves on the device, and Study still opens quickly", async () => {
  await page.getByText("It teaches").click();
  await page.getByRole("radio", { name: "Dutch" }).evaluate((node) => node.click());
  await page.getByRole("button", { name: "Add to my packs" }).waitFor();
  const started = Date.now();
  await addIt();
  const saved = Date.now() - started;
  const pack = await packNamed("Huge deck");
  same(pack.items.length, 5000, "cards");
  const opening = await page.evaluate(async () => {
    const { deckOverview, decksHere } = await import("/js/study/deck.js");
    const t = performance.now();
    decksHere().forEach((deck) => deckOverview(deck));
    return Math.round(performance.now() - t);
  });
  assert(opening < 500, `Study's rows took ${opening} ms`);
  return `saved in ${saved} ms; every deck's row in ${opening} ms`;
});

for (const path of REAL) {
  await stage(`a real deck: ${basename(path)}`, async () => {
    const started = Date.now();
    await importAndReport(path);
    const read = Date.now() - started;
    const text = await words();
    await page.screenshot({ path: `${OUT}/real-${basename(path)}.png`, fullPage: true });
    const addStart = Date.now();
    await addIt();
    const added = Date.now() - addStart;
    const name = await page.evaluate(() => document.querySelector('[data-part="page-title"] p, [data-part="page-title"] + p, h1 + p')?.textContent ?? "");
    const pack = await page.evaluate(async () => {
      const { allPacks, packSounds } = await import("/js/study/packs.js");
      const pack = allPacks().filter((one) => one.items?.length && one.origin?.kind === "yours").at(-1);
      return { ...pack, sounds: packSounds(pack.id) };
    });
    await page.evaluate(async (code) => (await import("/js/study/learning.js")).setLearning(code), pack.language);
    const played = await playSession(pack, { most: 8 });
    await page.screenshot({ path: `${OUT}/real-${basename(path)}-session.png` });
    await page.getByRole("button", { name: /Close|End/ }).first().click().catch(() => {});
    await leaveSession();
    await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
    return `${pack.name}: ${pack.items.length} cards, ${pack.language} from ${pack.from}, ${Object.keys(pack.sounds ?? {}).length} sounds; read ${read} ms, added ${added} ms; ${played.map((one) => one.game).join(", ")} (${name.slice(0, 40)}) ${/We couldn't tell/.test(text) ? "asked about its language" : ""}`;
  });
}

await stage("long cards fit a small phone: nothing wider than the screen, every control in reach", async () => {
  await importAndReport(FILES.long);
  await addIt();
  const pack = await packNamed("Dutch long cards");
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  await page.setViewportSize({ width: 320, height: 568 });
  await go(`#study/session/deck/${encodeURIComponent(pack.id)}`);
  const session = page.locator('[data-part="session"]');
  await session.waitFor({ timeout: 30_000 });
  const seen = [];
  for (let i = 0; i < 14; i++) {
    if (await page.locator('[data-part="session-summary"]').count()) break;
    await sessionAtRest();
    const fits = await page.evaluate(() => {
      const root = document.querySelector('[data-part="session"]:not([data-ghost])');
      const over = [...root.querySelectorAll("*")].filter((node) => node.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(node).position !== "fixed" && !node.closest("lx-tinta")).map((node) => node.tagName + (node.getAttribute("data-part") ?? ""));
      const bar = [...root.querySelectorAll('[data-part="answer-bar"] button')].map((button) => button.getBoundingClientRect());
      return { over: over.slice(0, 4), wide: document.documentElement.scrollWidth > innerWidth, offBottom: bar.some((box) => box.bottom > innerHeight + 1) };
    });
    same(fits, { over: [], wide: false, offBottom: false }, `step ${i} (${await session.getAttribute("data-game")})`);
    seen.push(await session.getAttribute("data-game"));
    await playOne(pack);
    await page.waitForTimeout(60);
  }
  await page.screenshot({ path: `${OUT}/long.png` });
  await leaveSession();
  await page.setViewportSize({ width: 390, height: 844 });
  return seen.join(", ");
});

await stage("Translate and Today carry on with a deck on this device", async () => {
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  await go("#today/translate");
  const field = page.locator('[data-part="translate-field"] textarea, textarea').first();
  await field.waitFor({ timeout: 15_000 });
  await field.fill("huis");
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/translate.png` });
  await go("#today");
  await page.waitForTimeout(300);
  await go("#know");
  await page.waitForTimeout(300);
  const know = await words();
  assert(!/k:|anki-/.test(know), `a card's unit shows raw in Know: ${know.slice(0, 200)}`);
  return "both drew, and no raw unit shows";
});

// ---------- sharing: the existing sheet and terms, what goes up, someone else studying it ----------

const q = (value) => (typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`);
const APP = resolve(HERE, "..");
const sql = (command) => execFileSync("npx", ["wrangler", "d1", "execute", "lexicommons", "--local", "--persist-to", PERSIST, "--command", command], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
const admin = { id: `an${randomBytes(6).toString("hex")}`, token: `lct_${randomBytes(24).toString("base64url")}` };
{
  const now = Date.now();
  sql([
    `INSERT INTO users (id, name, created_at) VALUES (${q(admin.id)}, 'Anki Check Admin', ${now - 8 * 86_400_000})`,
    `INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at, admin) VALUES (${q(randomBytes(6).toString("hex"))}, ${q(admin.id)}, 'anki-check', ${q(createHash("sha256").update(admin.token).digest("hex"))}, ${q(admin.token.slice(0, 10))}, ${now}, 1)`,
    `INSERT INTO user_roles (user_id, role, granted_at, granted_by, note) VALUES (${q(admin.id)}, 'admin', ${now}, 'd1', 'anki-check')`,
  ].join("; "));
}
async function tool(name, args = {}) {
  const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${admin.token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  const text = await response.text();
  const line = text.split("\n").find((one) => one.startsWith("data: "));
  if (!line) throw new Error(`${name}: ${response.status} ${text.slice(0, 300)}`);
  const { result, error } = JSON.parse(line.slice(6));
  if (error) throw new Error(`${name}: ${error.message}`);
  return JSON.stringify(result);
}

let sharedId = null;
let other = null;
const sheet = () => page.locator('[data-part="sheet"]').last();
await stage("sharing a deck through Share's page and the terms: it says what it means, and only the words go up", async () => {
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  await go(`#settings/study/packs/${encodeURIComponent(latest.id)}`);
  await page.locator(".lx-row-title", { hasText: /^Share in Explore$/ }).click();
  await page.waitForFunction(() => location.hash.startsWith("#explore/share/"), null, { timeout: 15_000 });
  await page.getByRole("button", { name: "I agree" }).click();
  // Its name's field, beside its cover (explore.js renderShare), by its place rather than its words (it was "Title", now "Its name in Explore").
  await page.locator('[data-part="page"]:visible .lx-share-head label[data-part="field"]').locator("input").waitFor();
  const note = await page.locator('[data-share="deck"]').innerText();
  assert(/your own work, or its maker lets others/.test(note) && /sounds stay on this device/.test(note), note);
  await page.screenshot({ path: `${OUT}/share-page.png` });
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.waitForFunction(() => location.hash.startsWith("#explore/item/"), null, { timeout: 20_000 });
  sharedId = decodeURIComponent(new URL(page.url()).hash.split("/").pop().split("?")[0]);
  await page.locator('[data-part="page-title"]', { hasText: "Dutch basics" }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/shared.png`, fullPage: true });
  const text = await words();
  assert(/9 cards/.test(text), `no count: ${text.slice(0, 300)}`);
  assert(!/0 sentences/.test(text), `it counts sentences it hasn't got: ${text.slice(0, 300)}`);
  assert(/het huis/.test(text) && /the house/.test(text), "no sample of its cards");
  assert(!/\bAI\b/.test(text), "names an AI");
  const stored = await page.evaluate(async (id) => {
    const item = await (await fetch(`/api/community/items/${encodeURIComponent(id)}`)).json();
    const version = item.item.version;
    return { version, text: await (await fetch(`/library/packs/${encodeURIComponent(id)}/${version}/pack.json`)).text() };
  }, sharedId);
  const pack = JSON.parse(stored.text);
  same(pack.items.length, 9, "the file's cards");
  const clip = Object.values(latest.sounds)[0];
  assert(!stored.text.includes("huis.mp3") && !stored.text.includes(clip) && !stored.text.includes("sounds"), "a sound's name went up");
  return `${sharedId} at ${stored.version}, ${stored.text.length} bytes, words only`;
});

await stage("someone else finds it, adds it and studies it, with no sound and no Listening", async () => {
  other = await person("Anki Follower");
  page = other.tab;
  await go(`#explore?lang=nl`);
  await page.waitForTimeout(500);
  await go(`#explore/item/${encodeURIComponent(sharedId)}`);
  await page.getByRole("button", { name: "Add pack" }).click();
  const pack = await (async () => {
    for (let i = 0; i < 100; i++) {
      const got = await page.evaluate(async (id) => {
        const { allPacks, syncLibraryPacks } = await import("/js/study/packs.js");
        await syncLibraryPacks();
        return allPacks().find((one) => one.id === id && one.items?.length) ?? null;
      }, sharedId);
      if (got) return got;
      await page.waitForTimeout(300);
    }
    throw new Error("it never arrived");
  })();
  same(pack.items.length, 9, "its cards");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/follower-item.png` });
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  const played = await playSession(pack);
  await leaveSession();
  assert(played.length > 0 && !played.some((one) => one.game === "listen"), `a game it can't carry: ${played.map((one) => one.game)}`);
  await go("#study/packs");
  await page.waitForTimeout(300);
  const text = await words();
  assert(/9 cards · Following/.test(text), `not listed: ${text.slice(0, 300)}`);
  same(other.seen.errors, [], "page errors");
  return `${played.length} steps: ${[...new Set(played.map((one) => one.game))].join(", ")}`;
});

await stage("Explore's tools and moderation: search, explore_get, follow; a report; the case holds every card's words", async () => {
  const found = await tool("explore_search", { q: "Dutch basics" });
  assert(found.includes(sharedId), `explore_search: ${found.slice(0, 300)}`);
  const got = await tool("explore_get", { id: sharedId });
  assert(got.includes("het huis") && /cards/.test(got), `explore_get: ${got.slice(0, 400)}`);
  const followed = await tool("follow", { id: sharedId });
  assert(!/error|isError":true/i.test(followed), `follow: ${followed.slice(0, 300)}`);
  const reported = await page.evaluate(async (id) => {
    const response = await fetch(`/api/community/items/${encodeURIComponent(id)}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "spam", details: "Reported by anki-check." }) });
    return { status: response.status, body: await response.text() };
  }, sharedId);
  same(reported.status, 200, `the report: ${reported.body}`);
  const queue = await tool("mod_queue");
  assert(queue.includes(sharedId), `mod_queue: ${queue.slice(0, 300)}`);
  const one = await tool("mod_get", { id: sharedId });
  for (const words of ["Reported by anki-check.", "het huis", "the house", "Amsterdam"]) assert(one.includes(words), `mod_get has no "${words}": ${one.slice(0, 400)}`);
  return "search, explore_get, follow; reported; the case names a front, a back and a cloze card";
});

await stage("deleting it: gone from Study, its sound goes at the next tidy, what you learned stays", async () => {
  page = me.tab;
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  const clip = Object.values(latest.sounds)[0];
  const rowsBefore = await page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().filter((row) => row.concept.startsWith("k:")).length);
  await go(`#settings/study/packs/${encodeURIComponent(latest.id)}`);
  await page.locator('[data-part="list-row"]', { hasText: "Delete this pack" }).click();
  await page.locator('[data-part="list-row"]', { hasText: "Press again to delete it" }).click();
  await page.waitForFunction(() => location.hash === "#study/packs", null, { timeout: 15_000 });
  await go("#study");
  await page.waitForTimeout(400);
  assert(!(await words()).includes("Dutch basics"), "still in Study");
  const after = await page.evaluate(async ({ name }) => {
    const packs = await import("/js/study/packs.js");
    await packs.pruneRecordings({ now: Date.now() + 2 * 3_600_000 });
    return {
      here: Boolean(await (await caches.open("lx-audio-v1")).match(`/api/packs/audio/${name}`)),
      rows: (await import("/js/study/progress.js")).allEvidence().filter((row) => row.concept.startsWith("k:")).length,
    };
  }, { name: clip });
  same(after, { here: false, rows: rowsBefore }, "after deleting");
  return `the sound's gone, ${after.rows} rows of evidence stay`;
});

await stage("offline: a deck studies, and reading another either works or says why", async () => {
  page = me.tab;
  await importAndReport(FILES.offline);
  await addIt();
  const pack = await packNamed("Dutch offline cards");
  const ready = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker?.getRegistration();
    return Boolean(registration?.active);
  });
  if (!ready) return "no service worker on this page yet: left to sw-check";
  await me.context.setOffline(true);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  await page.evaluate(async ({ id, cards }) => {
    const { record } = await import("/js/study/progress.js");
    record(cards.map((card) => ({ at: Date.now() - 90 * 86_400_000, concept: `k:${id}/${card.id}`, outcome: "right", test: "pick", skill: "read", activity: "choose", item: `${id}/${card.id}` })));
  }, { id: pack.id, cards: pack.items });
  const played = await playSession(pack, { most: 2 });
  assert(played.length > 0, "nothing to study offline");
  await page.locator('[data-part="session"]').locator("button").first().click().catch(() => {});
  await leaveSession();
  await toImport().catch(() => {});
  const shown = await words();
  await me.context.setOffline(false);
  assert(/Choose a file|needs a connection/.test(shown), `offline, the page says: ${shown.slice(0, 200)}`);
  return `${played.length} steps offline; the page: ${/Choose a file/.test(shown) ? "kept, from an earlier use" : "says it needs a connection"}`;
});

await stage("Safari's engine reads each generation in the parser's worker (an iPhone is what most people have)", async () => {
  let engine;
  try {
    engine = await webkit.launch({ headless: true });
  } catch (error) {
    return `skipped: WebKit isn't installed here (${String(error.message).split("\n")[0].slice(0, 80)})`;
  }
  try {
    const tab = await (await engine.newContext()).newPage();
    await tab.goto(`${BASE}/privacy`);
    const read = (path) =>
      tab.evaluate(async (data) => {
        const file = new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], "deck.apkg");
        const worker = new Worker("/js/anki/worker.js");
        const answer = await new Promise((resolve) => {
          worker.onmessage = ({ data: message }) => {
            if (message.deck) resolve({ name: message.deck.name, cards: message.deck.cards.length, sounds: message.deck.soundsHere });
            else if (message.error) resolve({ error: message.error.code });
          };
          worker.onerror = (event) => resolve({ crashed: event.message });
          worker.postMessage({ open: file });
          setTimeout(() => resolve({ timedOut: true }), 45_000);
        });
        worker.terminate();
        return answer;
      }, readFileSync(path).toString("base64"));
    same(await read(FILES.latest), { name: "Dutch basics", cards: 9, sounds: 1 }, "the newest format");
    same(await read(FILES.old), { name: "Spanish words", cards: 4, sounds: 0 }, "an old file");
    same(await read(FILES.deflateBomb), { error: "too-big" }, "a bomb");
    return "the newest format, an old file and a bomb, in WebKit";
  } finally {
    await engine.close();
  }
});

await stage("no errors on the page through all of it", async () => {
  page = me.tab;
  same(me.seen.errors, [], "page errors");
  same(me.seen.dialogs, 0, "dialogs");
});

writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
await browser.close();
rmSync(scratch, { recursive: true, force: true });
console.log(`\n${Object.values(results).filter((one) => one.ok).length}/${Object.keys(results).length} stages passed`);
process.exit(failed ? 1 : 0);
