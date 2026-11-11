#!/usr/bin/env node
// A device's default packs stay in the catalog's order, however and whenever a version arrived (study/packs.js): a band republished in a
// local library, synced, and the order, what a learner is taught and what Translate leads with and credits all stay as they were; a device
// already in the wrong order put right by a sync, and by its ids until one; the catalog's order winning over the ids; the lists a
// person reads (Settings → Packs, Study → Your packs) with the language's lessons first, the device's own order untouched. LOCAL only:
// it signs up a test account (deleted at the end) and writes the local catalog.
//   node scripts/pack-order-check.mjs http://localhost:<port> <outDir> --persist-to <dir> --pack <packs/words-nl-01.json> --pack <…> [--list <frequency.nl.json>]
// The packs must be seeded as default packs first (scripts/packs/seed-local.mjs --default). With --list, the frequency list goes in the
// local library, as on the live site, so the plan runs as it does there. Exit 0 = pass.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./quiet-browser.mjs";
import { localR2 } from "./fixtures/local-r2.mjs";
import { listEntry, listKey, withList } from "../public/js/read/catalogue.js";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const LIST = argv.includes("--list") ? resolve(argv[argv.indexOf("--list") + 1]) : null;
const PACK_FILES = argv.flatMap((arg, i) => (argv[i - 1] === "--pack" ? [resolve(arg)] : []));
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PERSIST || PACK_FILES.length < 3) {
  console.error("Usage: node scripts/pack-order-check.mjs http://localhost:<port> <outDir> --persist-to <dir> --pack <pack> --pack <pack> --pack <pack> [--list <frequency.json>] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scratch = mkdtempSync(join(tmpdir(), "pack-order-"));
const PACKS = PACK_FILES.map((file) => JSON.parse(readFileSync(file, "utf8")));
const wrangler = (args) => execFileSync("npx", ["wrangler", ...args, "--local", "--persist-to", PERSIST], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
const seed = (...args) => execFileSync("node", [join(APP, "scripts/packs/seed-local.mjs"), ...args, "--persist-to", PERSIST], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] }).toString();
const results = {};
let failed = 0;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
const same = (a, b, what) => assert(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)?.slice(0, 500)} ≠ ${JSON.stringify(b)?.slice(0, 500)}`);
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

// The frequency list, as the live library has it.
if (LIST) {
  const text = readFileSync(LIST, "utf8");
  const list = JSON.parse(text);
  const sha = createHash("sha256").update(text).digest("hex");
  const key = listKey(list, sha);
  // Through one local R2 in this process (scripts/fixtures/local-r2.mjs), not a wrangler launch per object.
  const r2 = localR2(APP, PERSIST);
  await r2.put("lexicommons-library", key, readFileSync(LIST), "application/json");
  const found = await r2.getText("lexicommons-library", "catalogue.json");
  if (found === null) throw new Error("The specified key does not exist: lexicommons-library/catalogue.json");
  const shelved = withList(JSON.parse(found), list, listEntry(list, key, new Date().toISOString()));
  assert(shelved.catalogue, `the list wasn't taken: ${shelved.problems?.join(" · ")}`);
  await r2.put("lexicommons-library", "catalogue.json", JSON.stringify(shelved.catalogue), "application/json");
  await r2.close();
}

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
const authn = await context.newCDPSession(page);
await authn.send("WebAuthn.enable");
await authn.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Pack Order Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });

// Asked from the page: the local server can drop a connection from outside it while wrangler writes to the same state.
const catalogOrder = () => page.evaluate(async () => (await (await fetch("/library/catalogue.json", { cache: "no-store" })).json()).packs.nl.filter((p) => !p.optIn).map((p) => p.id));
/** The default packs as this device has them, everywhere they're read. */
const device = () =>
  page.evaluate(async () => {
    const { allPacks, libraryPacks } = await import("/js/study/packs.js");
    const { ITEMS, PACKS: VIEW } = await import("/js/study/content.js");
    const defaults = allPacks().filter((p) => p.builtIn);
    const packOfItems = [];
    for (const item of ITEMS) if (packOfItems.at(-1) !== item.pack) packOfItems.push(item.pack);
    return { all: defaults.map((p) => p.id), library: libraryPacks().filter((p) => p.kind === "default").map((p) => p.id), items: packOfItems, study: VIEW.filter((p) => p.builtIn).map((p) => p.id), versions: Object.fromEntries(libraryPacks().map((p) => [p.id, p.version])) };
  });
const sync = () => page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
const until = async (test, what, ms = 60_000) => {
  const started = Date.now();
  for (;;) {
    const got = await test();
    if (got) return got;
    if (Date.now() - started > ms) throw new Error(`waited ${ms} ms for ${what}`);
    await page.waitForTimeout(200);
  }
};
const reload = async () => {
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
};
/** What the order could change: the first lesson, the sentences words are met in, what Translate leads with and credits. */
const taught = () =>
  page.evaluate(async (words) => {
    const { planSession } = await import("/js/study/plan.js");
    const { wordsInOrder, sentenceForWord } = await import("/js/study/new-words.js");
    const steps = (plan) => (plan.steps ?? []).map((step) => [step.kind ?? step.type ?? "", step.item?.id ?? step.items?.map((i) => i.id).join("+") ?? "", step.word ?? step.lemma ?? ""].join(":"));
    const ranked = wordsInOrder();
    const sentences = ranked.slice(0, 400).map((lemma) => [lemma, sentenceForWord(lemma, { known: () => false })?.id ?? null]);
    const { translate } = await import("/js/translate/translate.js");
    const said = [];
    for (const q of words) {
      const r = await translate(q.text, { from: q.from, to: q.to }, { stale: false });
      said.push([q.text, r?.words?.[0]?.lemma ?? r?.words?.[0]?.text ?? null, r?.words?.[0]?.source ?? null]);
    }
    return { quick: steps(planSession("quick")), frequent: steps(planSession("frequent")), ranked: ranked.slice(0, 400), sentences, said };
  }, SAMPLE);
const ownWords = PACKS[0].items.slice(0, 20).map((item) => item.words[item.gap?.index ?? -1]?.[1]).filter(Boolean).slice(0, 12).map((text) => ({ text, from: "nl", to: "en" }));
const SAMPLE = [...ownWords, ...["kill", "end", "test", "cover", "sign", "serve", "hurt", "force"].map((text) => ({ text, from: "en", to: "nl" }))];
const differences = (a, b) => ({ quick: a.quick.filter((x, i) => x !== b.quick[i]).length, frequent: a.frequent.filter((x, i) => x !== b.frequent[i]).length, ranked: a.ranked.filter((x, i) => x !== b.ranked[i]).length, sentences: a.sentences.filter((x, i) => JSON.stringify(x) !== JSON.stringify(b.sentences[i])).length, said: a.said.filter((x, i) => JSON.stringify(x) !== JSON.stringify(b.said[i])) });
// Every default pack the catalog lists here and studied from, not only this check's own: with a library like the live one
// (twelve packs) the rest were still arriving when the first stage looked, and the next sync moved what it had read.
const allHere = () => until(async () => {
  const d = await device();
  const want = [...new Set([...PACKS.map((p) => p.id), ...order.filter((id) => !BUNDLED.includes(id))])];
  return want.every((id) => d.versions[id] && d.items.includes(id)) && d;
}, "the packs to arrive and be studied from");

const first = PACKS[0].id;
const order = await catalogOrder();
// The app's own packs (packs/index.js BUILT_IN): with no catalog order kept, a device puts them first, then the rest by id.
const BUNDLED = await page.evaluate(async () => (await import("/js/packs/index.js")).BUILT_IN.map((p) => p.id));
const byIds = (ids) => [...ids].sort((a, b) => (BUNDLED.includes(b) - BUNDLED.includes(a)) || a.localeCompare(b, "en", { numeric: true }));
let before = null;
await stage("a first open: the device's default packs in the catalog's order", async () => {
  const d = await allHere();
  const listed = order.filter((id) => d.all.includes(id));
  same(d.all.filter((id) => listed.includes(id)), listed, "allPacks");
  same(d.library, listed, "libraryPacks");
  same(d.items.filter((id) => listed.includes(id)), listed, "study's items");
  before = await taught();
  return `${d.all.join(", ")}; ${before.ranked.length} words ranked`;
});

await stage(`${first} republished and synced: its place, what's taught and what Translate says all stay`, async () => {
  const was = await device();
  const next = join(scratch, `${first}.next.json`);
  writeFileSync(next, JSON.stringify({ ...PACKS[0], about: `${PACKS[0].about ?? ""} (republished)`.trim() }));
  seed(next, "--default");
  same(await catalogOrder(), order, "the catalog's own order after a republish");
  await sync();
  const d = await until(async () => {
    await sync();
    const now = await device();
    return now.versions[first] !== was.versions[first] && now;
  }, `${first}'s new version`);
  same(d.all, was.all, "allPacks, just after the sync");
  same(d.items, was.items, "study's items, just after the sync");
  same(d.study, was.study, "Study's list of your packs, just after the sync");
  const after = await taught();
  const changed = differences(before, after);
  console.log(`  after the republish: ${JSON.stringify(changed).slice(0, 800)}`);
  same(changed, { quick: 0, frequent: 0, ranked: 0, sentences: 0, said: [] }, "what changed");
  await reload();
  const again = await allHere();
  same(again.all, was.all, "allPacks, after a reload");
  await page.goto(`${BASE}/app/#study`);
  await page.screenshot({ path: `${OUT}/study-after-republish.png` });
  return `${again.all.join(", ")}`;
});

await stage("a device already in the wrong order: its ids put it right at a start with no network, and a sync with the catalog's order", async () => {
  // As v76 left one: the band that was republished is the newest, and nothing's kept of the catalog's order. No sync may
  // write the order back before the start: one still running is let finish, and the catalog is out of reach from here on.
  await sync();
  // On the context, not the page: the app's service worker fetches the catalog itself, and a page's route never sees its requests (the
  // device took the catalog's order all the same, and the stage only passed where the catalog's order was the ids' own).
  await context.route("**/library/catalogue.json", (route) => route.abort());
  await page.evaluate(async (first) => {
    localStorage.removeItem("lx.packs.order.v1");
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open("lexicommons-packs");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const store = db.objectStoreNames[0];
    const record = await new Promise((resolve) => {
      const get = db.transaction(store).objectStore(store).get(`library:${first}`);
      get.onsuccess = () => resolve(get.result);
    });
    record.addedAt = Date.now();
    await new Promise((resolve) => {
      const tx = db.transaction(store, "readwrite");
      tx.objectStore(store).put(record);
      tx.oncomplete = resolve;
    });
    db.close();
  }, first);
  await reload();
  const started = await allHere();
  const listed = order.filter((id) => started.all.includes(id));
  // With no catalog and nothing kept, the app's own packs first, then the ids (packs.js inCatalogOrder): the newest band
  // back in its place. That's the catalog's order wherever ids sort like it; a lesson pack (path-nl) sorts before the bands.
  same(started.all.filter((id) => listed.includes(id)), byIds(listed), "with no catalog");
  await context.unroute("**/library/catalogue.json");
  await sync();
  await page.waitForTimeout(1000);
  same((await device()).all.filter((id) => listed.includes(id)), listed, "after a sync");
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("lx.packs.order.v1") ?? "null")?.nl);
  same(kept, order, "the order kept");
  return kept.join(", ");
});

await stage("the catalog's order wins over the ids: a pack whose id sorts first, published last, comes last", async () => {
  const extra = join(scratch, "a-order-check.json");
  writeFileSync(extra, JSON.stringify({ ...PACKS[0], id: "a-order-check", name: "Order check", about: "A pack for this check.", items: PACKS[0].items.slice(0, 12) }));
  seed(extra, "--default");
  const d = await until(async () => {
    await sync();
    const now = await device();
    return now.versions["a-order-check"] && now;
  }, "the extra pack");
  assert(d.all.at(-1) === "a-order-check", `order: ${d.all}`);
  await reload();
  const again = await allHere();
  assert(again.all.at(-1) === "a-order-check", `after a reload: ${again.all}`);
  seed("--remove", "a-order-check", "--language", "nl");
  await until(async () => {
    await sync();
    return !(await device()).versions["a-order-check"];
  }, "the extra pack to go");
  return again.all.join(", ");
});

// The lists a person reads (Settings → Packs, Study → Your packs) put the language's lessons first, as Explore does, while the
// device's own order stays the catalog's: on 5 Nov 2026 bands 09 and 10 went on after path-nl, and the lessons showed between
// bands 08 and 09. With no lessons behind other packs in the catalog, this publishes path-nl last, and takes it off again after.
await stage("the lists show the lessons first, and the device's own order stays the catalog's", async () => {
  const LESSONS = "path-nl";
  const added = !(await catalogOrder()).includes(LESSONS);
  if (added) seed(join(APP, "packs/path-nl.json"), "--default");
  const cat = await catalogOrder();
  assert(cat.indexOf(LESSONS) > 0, `the lessons are first in the catalog already (${cat}): there's nothing for a list to put first`);
  const d = await until(async () => {
    await sync();
    const now = await device();
    return now.versions[LESSONS] && now.study.includes(LESSONS) && now;
  }, "the lessons on this device");
  const own = cat.filter((id) => d.all.includes(id));
  same(d.all.filter((id) => own.includes(id)), own, "the device's own order");
  const shown = [LESSONS, ...own.filter((id) => id !== LESSONS)];
  same(d.study.filter((id) => shown.includes(id)), shown, "the list content.js gives the screens");
  for (const [name, route] of [["Study → Your packs", "#study/packs"]]) {
    await page.goto(`${BASE}/app/${route}`);
    const rows = await until(async () => {
      const ids = await page.evaluate(() =>
        [...document.querySelectorAll('a[href^="#settings/study/packs/"]')]
          .filter((a) => a.getClientRects().length)
          .map((a) => decodeURIComponent(a.getAttribute("href").slice("#settings/study/packs/".length))),
      );
      return ids.length >= shown.length && ids;
    }, `${name}'s rows`);
    same(rows.filter((id) => shown.includes(id)), shown, `${name}'s rows`);
    await page.screenshot({ path: `${OUT}/lists${route.replace(/\W+/g, "-")}.png` });
  }
  if (added) {
    seed("--remove", LESSONS, "--language", "nl");
    await until(async () => {
      await sync();
      return !(await device()).versions[LESSONS];
    }, "the lessons to go");
  }
  return shown.join(", ");
});

await stage("no page errors", async () => same(errors, [], "errors"));
await page.evaluate(async () => (await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).status).catch(() => {});
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
await browser.close();
console.log(failed ? `${failed} FAILED` : `all ${Object.keys(results).length} passed`);
process.exit(failed ? 1 : 0);
