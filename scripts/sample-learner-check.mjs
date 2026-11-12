// The sample learner in the real app (study/sample-mode.js), on a phone in Chrome, as an admin with some studying of their own: Settings →
// Admin's row and its sheet; each preset made by a real tap, timed, and then Home, the Knowledge page's cards, Study and the path at 390
// as pictures (and Home's top at 320); its mark on every header, Off a tap away; a reload keeping it; studying while it's on going to the
// sample's stores; no request while it's on to the study record, reminders, error reports, the practice room, the account's clears or a
// storage; Off putting the person's own stores back exactly (every IndexedDB database and the progress keys hashed before On and after Off,
// nothing of the sample left); and Sign out turning it off. LOCAL only, on a copy whose library has Dutch's lessons, word packs and frequency
// list (npm run local).
// node scripts/sample-learner-check.mjs http://localhost:<port> <outDir> [--admin-command "node scripts/local.mjs admin"] [--only <regex>]
//   (exit 0 = pass)

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
const { chromium } = await import("./quiet-browser.mjs");

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
if (!BASE || !outArg || !/^http:\/\/localhost/.test(BASE)) {
  console.error("Usage: sample-learner-check.mjs http://localhost:<port> <outDir> [--admin-command <cmd>] (LOCAL only: it signs up an account and makes it an admin)");
  process.exit(2);
}
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN = argv.includes("--admin-command") ? argv[argv.indexOf("--admin-command") + 1] : "node scripts/local.mjs admin";
const ONLY = argv.includes("--only") ? new RegExp(argv[argv.indexOf("--only") + 1], "i") : null;
const OUT = resolve(outArg);
mkdirSync(join(OUT, "shots"), { recursive: true });
let failed = 0;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
const stage = async (name, run) => {
  if (ONLY && !ONLY.test(name)) return;
  try {
    const said = await run();
    console.log(`ok    ${name}${said ? `: ${said}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${String(error.message ?? error).slice(0, 600)}`);
  }
};
const report = {};

// What must never leave while the sample learner is on.
const OUTBOUND = [
  [/\/api\/ai\/record/, "the study record for an AI"],
  [/\/api\/reminders/, "the reminders report"],
  [/\/api\/errors/, "an error report"],
  [/\/api\/practice\b/, "the practice room"],
  [/\/api\/progress\/clears/, "the account's clears"],
  [/dropbox|googleapis|graph\.microsoft|\/api\/storage/, "a storage"],
  [/\/api\/account\/sync/, "the account's own copy of your progress"],
];
// The person's progress, by the names the sample has its own of: these must come back byte for byte.
const PROGRESS_DBS = ["lexicommons-study", "lexicommons-practice", "lexicommons-highlights", "lexicommons-read"];
const PROGRESS_KEYS = /^(lx\.streak\.|lx\.path\.v1|lx\.learning\.v1|lx\.study\.|lx\.reader\.|lx\.today\.thrown|lx\.know\.pile\.|lx\.ai\.record\.v1|lx\.sync\.)/;

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors = [];
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark" });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(String(error.message ?? error)));
const requests = [];
page.on("request", (request) => requests.push({ url: request.url(), method: request.method(), at: Date.now() }));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

const ready = () => page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
const go = async (hash, wait = 1500) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(wait);
};
const shot = (name) => page.screenshot({ path: join(OUT, "shots", `${name}.png`) });
const row = (text) => page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${text}$`) }) }).first();
const mark = () => page.locator('[data-part="app-header"] [data-part="sample-mark"]');

/** Every IndexedDB database but the sample's, each store's keys and values, and every localStorage key but the sample's: a hash each. */
const hashStores = () =>
  page.evaluate(async () => {
    const sha = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join("");
    const text = (value) => JSON.stringify(value, (_k, v) => (v instanceof Blob ? `blob:${v.size}:${v.type}` : v instanceof ArrayBuffer ? `bytes:${v.byteLength}` : ArrayBuffer.isView(v) ? `bytes:${v.byteLength}` : v));
    const out = {};
    const names = (await indexedDB.databases()).map((d) => d.name).filter((n) => !n.endsWith(".sample")).sort();
    for (const name of names) {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(name);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const parts = [];
      for (const store of [...db.objectStoreNames].sort()) {
        parts.push(
          await new Promise((resolve, reject) => {
            const tx = db.transaction(store, "readonly");
            const keys = tx.objectStore(store).getAllKeys();
            const values = tx.objectStore(store).getAll();
            tx.oncomplete = () => resolve([store, keys.result, values.result]);
            tx.onerror = () => reject(tx.error);
          }),
        );
      }
      db.close();
      out[`db:${name}`] = { hash: await sha(text(parts)), rows: parts.reduce((n, [, keys]) => n + keys.length, 0) };
    }
    for (const key of Object.keys(localStorage).sort()) if (!key.startsWith("lx.sample")) out[`ls:${key}`] = { hash: await sha(localStorage.getItem(key)) };
    return out;
  });
const differences = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k]?.hash !== b[k]?.hash);
const isProgress = (key) => (key.startsWith("db:") ? PROGRESS_DBS.includes(key.slice(3)) : PROGRESS_KEYS.test(key.slice(3)));
const sampleLeft = () =>
  page.evaluate(async () => ({
    keys: Object.keys(localStorage).filter((k) => k.startsWith("lx.sample")),
    dbs: (await indexedDB.databases()).map((d) => d.name).filter((n) => n.endsWith(".sample")),
  }));
// What the app's own sums say now (the screens show these).
const sums = () =>
  page.evaluate(async () => {
    const S = await import("/js/know/summary.js");
    const { allEvidence } = await import("/js/study/progress.js");
    const { streakNow } = await import("/js/study/done.js");
    const k = S.knowledge({ lang: "nl" });
    return { rows: allEvidence().length, known: k.kinds.word.known, started: k.kinds.word.started, slipping: k.kinds.word.slipping, ideas: S.grammarMap({ lang: "nl" }).filter((r) => r.state !== "new").length, streak: streakNow().days };
  });

// ---------- an admin with some studying of their own ----------
let me = null;
await stage("an admin's account, with some studying of their own on this device", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Sample Check");
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await ready();
  me = await page.evaluate(async () => (await (await fetch("/api/me", { credentials: "same-origin" })).json()).user);
  execSync(`${ADMIN} --user ${me.id}`, { cwd: APP, stdio: "pipe" });
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  // Dutch's lessons and words on the device, as a learner's are.
  const came = await page.evaluate(async () => {
    const content = await import("/js/study/content.js");
    const { pathLessons } = await import("/js/study/path.js");
    for (let waited = 0; waited < 180_000; waited += 500) {
      if (content.ITEMS.some((item) => item.pack === "path-nl") && content.ITEMS.length > 5000 && pathLessons().length > 100) return { items: content.ITEMS.length, lessons: pathLessons().length };
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  });
  assert(came, "Dutch's lessons and word packs never came: the copy's library needs them (npm run local)");
  // Their own: a few answers, a finished session, a word from reading, a place on the path.
  await page.evaluate(async () => {
    const { record } = await import("/js/study/progress.js");
    const { finishedSession } = await import("/js/study/done.js");
    const { addWord } = await import("/js/read/bank.js");
    const { setPlace } = await import("/js/study/path-place.js");
    record([
      { concept: "w:huis", outcome: "right", test: "recall", skill: "read", activity: "type", item: "x1" },
      { concept: "w:fiets", outcome: "wrong", test: "pick", skill: "read", activity: "fill", item: "x2" },
    ]);
    finishedSession();
    addWord("nl", "boek");
    setPlace("nl", null);
  });
  await page.waitForTimeout(1500);
  return `${me.id}, ${came.items.toLocaleString()} sentences, ${came.lessons.toLocaleString()} lessons`;
});

// Their stores are hashed the moment before the first preset is tapped (below): what the app does on its own before that (Tinta's
// throw on Home writing today's mark, say) is theirs, not the sample's.
let before = null;
await stage("their studying is in their own stores", async () => {
  const start = await hashStores();
  assert(start["db:lexicommons-study"]?.rows >= 2, `their evidence isn't stored: ${JSON.stringify(start["db:lexicommons-study"])}`);
  report.start = start;
  return `${Object.keys(start).length} stores, ${Object.keys(start).filter(isProgress).length} of them progress`;
});

await stage("Settings → Admin has Sample learner for an admin, Off; its sheet lists Off and the three", async () => {
  await page.reload();
  await ready();
  await go("#settings/admin", 2500);
  await row("Sample learner").waitFor({ timeout: 10_000 });
  const value = (await row("Sample learner").locator(".lx-row-value").textContent())?.trim();
  assert(value === "Off", `its value: ${value}`);
  await shot("00-about");
  await row("Sample learner").click();
  await page.waitForTimeout(900);
  const sheet = page.locator('.lx-sheet-layer:not([hidden]) [role="dialog"]').last();
  const titles = await sheet.locator(".lx-row-title").allTextContents();
  assert(titles.join("|") === "Off|3 weeks in|4 months in|A year in", `its choices: ${titles.join(", ")}`);
  await shot("01-sheet");
  return titles.join(", ");
});

// ---------- each preset ----------
const PRESETS = [
  ["weeks", "3 weeks in", 150],
  ["months", "4 months in", 900],
  ["year", "A year in", 2500],
];
for (const [id, name, words] of PRESETS) {
  await stage(`${name}: made by a tap, the app reloading onto it, its mark on the header, about ${words.toLocaleString()} words`, async () => {
    const sheetOpen = await page.locator('.lx-sheet-layer:not([hidden]) [role="dialog"]').count();
    if (!sheetOpen) {
      await go("#settings/admin", 2000);
      await row("Sample learner").click();
      await page.waitForTimeout(900);
    }
    if (!before) {
      before = await hashStores();
      report.before = before;
    }
    const t0 = Date.now();
    const sheet = page.locator('.lx-sheet-layer:not([hidden]) [role="dialog"]').last();
    await Promise.all([page.waitForEvent("load", { timeout: 180_000 }), sheet.locator('[data-part="list-row"]', { hasText: name }).click()]);
    await ready();
    const took = Date.now() - t0;
    await mark().waitFor({ timeout: 10_000 });
    const s = await sums();
    report[id] = { ...s, took };
    assert(Math.abs(s.known - words) / words < 0.2, `words known: ${s.known}`);
    assert(s.slipping > 0 && s.slipping / s.started < 0.25, `slipping: ${s.slipping} of ${s.started}`);
    return `${(took / 1000).toFixed(1)} s from the tap to the app; ${s.rows.toLocaleString()} rows, ${s.known} words known, ${s.slipping} of ${s.started} slipping, ${s.ideas} ideas met, a ${s.streak}-day streak`;
  });

  await stage(`${name}: nothing goes out while it's on, on Home, Knowledge, Study and the path`, async () => {
    const from = Date.now();
    await go("#today", 3000);
    await shot(`${id}-1-home`);
    // Home's top tile says the words the sample knows.
    const tiles = await page.evaluate(() => [...document.querySelectorAll('[data-part="stat-tile"] .lx-tile-number')].map((n) => n.textContent.trim()));
    await go("#know", 6000);
    // The cards: your words (know-card), then This week, Everyday, the ideas and Over time (know-section).
    const cards = await page.locator('[data-part="page"] .lx-know-board [data-card]').evaluateAll((nodes) => nodes.map((n) => n.dataset.card));
    assert(cards.length >= 4, `the Knowledge page's cards: ${cards.join(", ")}`);
    for (const card of cards) {
      await page.evaluate((c) => document.querySelector(`[data-part="page"] .lx-know-board [data-card="${c}"]`)?.scrollIntoView({ block: "start" }), card);
      await page.waitForTimeout(card === "words" ? 5000 : 1200);
      await shot(`${id}-2-know-${card}`);
    }
    await go("#study", 2500);
    await shot(`${id}-3-study`);
    await go("#study/path", 3000);
    await shot(`${id}-4-path`);
    // A study session's writes, while it's on: the sample's stores.
    await page.evaluate(async () => {
      const { record } = await import("/js/study/progress.js");
      const { finishedSession } = await import("/js/study/done.js");
      record([{ concept: "w:huis", outcome: "right", test: "recall", skill: "read", activity: "type", item: "x3" }]);
      finishedSession();
    });
    await page.waitForTimeout(1500);
    await page.evaluate(async () => (await import("/js/sync.js")).syncNow());
    await page.waitForTimeout(800);
    const out = requests.filter((r) => r.at >= from).flatMap((r) => OUTBOUND.filter(([re]) => re.test(r.url)).map(([, what]) => `${what}: ${r.method} ${r.url}`));
    assert(!out.length, out.join("; "));
    const mine = await page.evaluate(() => ({ evidenceDb: "lexicommons-study.sample", done: Boolean(localStorage.getItem("lx.sample:lx.streak.v1")) }));
    assert(mine.done, "the done log isn't the sample's");
    return `${requests.filter((r) => r.at >= from).length} requests, none out; Home's tiles ${tiles.join(" · ")}; cards ${cards.join(", ")}`;
  });
}

await stage("its mark: on every header (a tab, a page inside one) with Off a tap away, beside the language, whole at 320", async () => {
  for (const hash of ["#today", "#settings/admin", "#know"]) {
    await go(hash, 1500);
    const box = await page.evaluate(() => {
      const m = document.querySelector('[data-part="app-header"] [data-part="sample-mark"]');
      const off = m?.querySelector(".lx-sample-off");
      const lang = document.querySelector('[data-part="app-header"] [data-part="header-language"]');
      const r = (n) => n?.getBoundingClientRect();
      const a = r(m);
      const b = r(lang);
      return { mark: a && { x: a.x, w: a.width, h: a.height, top: a.top }, off: off && { w: r(off).width, h: r(off).height, label: off.getAttribute("aria-label") }, overlaps: Boolean(a && b && a.right > b.left && a.left < b.right), inScreen: a ? a.left >= 0 && a.right <= innerWidth : false };
    });
    assert(box.mark && box.off, `${hash}: no mark`);
    assert(!box.overlaps && box.inScreen, `${hash}: the mark ${box.overlaps ? "lies over the language" : "runs off the screen"}`);
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await go("#today", 1500);
  // On a narrow phone the mark takes the language's place, and the title stays whole.
  const narrow = await page.evaluate(() => {
    const header = document.querySelector('[data-part="app-header"]');
    const title = header.querySelector('[data-part="app-title"] > span:last-child');
    const lang = header.querySelector('[data-part="header-language"]');
    return { fits: [...header.querySelectorAll("*")].every((n) => n.getBoundingClientRect().right <= innerWidth + 0.5), whole: title.scrollWidth <= title.clientWidth, title: title.textContent, language: lang ? getComputedStyle(lang).display : "none" };
  });
  await shot("mark-320");
  await page.setViewportSize({ width: 390, height: 844 });
  await go("#today", 1500);
  const wide = await page.evaluate(() => getComputedStyle(document.querySelector('[data-part="app-header"] [data-part="header-language"]')).display);
  assert(narrow.fits, "at 320 something in the header runs off the screen");
  assert(narrow.whole && narrow.language === "none", `at 320: the title "${narrow.title}" ${narrow.whole ? "whole" : "cut off"}, the language ${narrow.language}`);
  assert(wide !== "none", "at 390 the language is hidden");
  await go("#settings/admin", 1500);
  await shot("mark-about");
});

await stage("a reload keeps it", async () => {
  await page.reload();
  await ready();
  await mark().waitFor({ timeout: 10_000 });
  const flag = await page.evaluate(() => JSON.parse(localStorage.getItem("lx.sample.v1") ?? "null")?.preset);
  assert(flag === "year", `after a reload: ${flag}`);
});

let after = null;
await stage("Off on the mark puts their own stores back exactly, and nothing of the sample is left", async () => {
  await go("#today", 1500);
  await Promise.all([page.waitForEvent("load", { timeout: 60_000 }), mark().locator(".lx-sample-off").click()]);
  await ready();
  await page.waitForTimeout(2500);
  assert((await mark().count()) === 0, "the mark is still there");
  after = await hashStores();
  report.after = after;
  const changed = differences(before, after);
  const progress = changed.filter(isProgress);
  assert(!progress.length, `their progress changed: ${progress.join(", ")}`);
  const left = await sampleLeft();
  assert(!left.keys.length && !left.dbs.length, `the sample left ${[...left.keys, ...left.dbs].join(", ")}`);
  const s = await sums();
  report.own = s;
  assert(s.rows === 2, `their evidence: ${s.rows} rows`);
  await shot("off-home");
  return `${Object.keys(after).filter(isProgress).length} progress stores identical${changed.length ? `; other keys that moved on their own: ${changed.join(", ")}` : ""}; their own ${s.rows} rows back`;
});

await stage("Sign out turns it off: the switch and the sample's stores gone, and the next start is theirs", async () => {
  await go("#settings/admin", 2000);
  await row("Sample learner").click();
  await page.waitForTimeout(900);
  const sheet = page.locator('.lx-sheet-layer:not([hidden]) [role="dialog"]').last();
  await Promise.all([page.waitForEvent("load", { timeout: 120_000 }), sheet.locator('[data-part="list-row"]', { hasText: "3 weeks in" }).click()]);
  await ready();
  await mark().waitFor({ timeout: 10_000 });
  await go("#settings/account", 1500);
  await row("Sign out").click();
  await page.waitForURL(/\/login\?signedout=1/, { timeout: 15_000 });
  const flag = await page.evaluate(() => localStorage.getItem("lx.sample.v1"));
  assert(flag === null, "the switch is still on after Sign out");
  await page.click("#signin");
  await page.waitForURL(new RegExp(`^${BASE}/app/`), { timeout: 20_000 });
  await ready();
  await page.waitForTimeout(2500);
  assert((await mark().count()) === 0, "the mark is back after signing in");
  const left = await sampleLeft();
  assert(!left.keys.length && !left.dbs.length, `the sample left ${[...left.keys, ...left.dbs].join(", ")}`);
  const changed = differences(before, await hashStores()).filter(isProgress);
  assert(!changed.length, `their progress changed: ${changed.join(", ")}`);
});

await stage("no error on any page", async () => {
  assert(!errors.length, errors.slice(0, 5).join(" | "));
});

writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1));
await browser.close();
console.log(failed ? `\n${failed} stage(s) failed` : "\nall stages passed");
process.exit(failed ? 1 : 0);
