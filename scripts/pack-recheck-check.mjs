#!/usr/bin/env node
// What a change to the pack check costs a returning learner (pack-format.js PACK_CHECKS, proofHolds), with every word band stored,
// on a phone's slowed processor: a start on proofs from before plain cards came in (the live rules, 3) trusts them all, as a start on today's does,
// and draws as soon; a pack with cards on such a proof is checked after all; and, for scale, what a start costs when every band has
// to be checked in full, which is what bumping PACK_CHECKS alone would have done. A start's hashing of the bands is a worker's
// (study/pack-hash-worker.js): every band hashed there, none on the page, and the start never waits on it. LOCAL only, its word bands seeded as
// default packs.
//   node scripts/pack-recheck-check.mjs http://localhost:<port> <outDir> --cpu <rate>
// Exit 0 = pass.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const CPU = argv.includes("--cpu") ? Number(argv[argv.indexOf("--cpu") + 1]) : 4;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/pack-recheck-check.mjs http://localhost:<port> <outDir> [--cpu <rate>]");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
const authn = await context.newCDPSession(page);
await authn.send("WebAuthn.enable");
await authn.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Recheck Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });

const until = async (test, what, ms = 180_000) => {
  const started = Date.now();
  for (;;) {
    const got = await test();
    if (got) return got;
    if (Date.now() - started > ms) throw new Error(`waited ${ms} ms for ${what}`);
    await page.waitForTimeout(250);
  }
};
const bands = () => page.evaluate(async () => (await import("/js/study/packs.js")).libraryPacks().filter((pack) => pack.kind === "default" && /^words-nl-/.test(pack.id)).length);
await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
const stored = await until(async () => {
  const n = await bands();
  return n >= 9 ? n : 0;
}, "all nine bands on the device");

// The stored proofs set to a number: what a device coming from an older version holds.
const setProofs = (checks) =>
  page.evaluate(async (value) => {
    const open = await new Promise((done, fail) => {
      const request = indexedDB.open("lexicommons-packs");
      request.onsuccess = () => done(request.result);
      request.onerror = () => fail(request.error);
    });
    const tx = open.transaction("packs", "readwrite");
    const store = tx.objectStore("packs");
    const all = await new Promise((done) => {
      const request = store.getAll();
      request.onsuccess = () => done(request.result);
    });
    let changed = 0;
    for (const record of all) {
      if (!record.id.startsWith("library:") || !record.checked) continue;
      store.put({ ...record, checked: { ...record.checked, checks: value } });
      changed++;
    }
    await new Promise((done) => (tx.oncomplete = done));
    open.close();
    return changed;
  }, checks);

// One start, slowed: the first paint with the app's frame, the app ready, the longest stretch the page stopped for, what the load did.
async function start(label) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await page.addInitScript(() => {
    window.__long = [];
    try {
      new PerformanceObserver((list) => list.getEntries().forEach((entry) => window.__long.push(Math.round(entry.duration)))).observe({ type: "longtask", buffered: true });
    } catch {}
  });
  const t = Date.now();
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 180_000 });
  const ready = Date.now() - t;
  const out = await page.evaluate(async () => {
    const { lastPackLoad } = await import("/js/study/packs.js");
    const paint = performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
    return { load: lastPackLoad(), firstPaint: Math.round(paint ?? -1), long: Math.max(0, ...window.__long), longTotal: window.__long.reduce((a, b) => a + b, 0) };
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const row = { label, ready, ...out };
  console.log(JSON.stringify(row));
  return row;
}

const rows = [];
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) failed++;
};
const version = await page.evaluate(async () => (await import("/js/study/pack-format.js")).PACK_CHECKS);
// A start settles first, then each kind of start twice, the first of a pair warming what's cached.
await start("warm-up");
const today = (await start("on today's proofs"), await start("on today's proofs"));
rows.push(today);
check(today.load.hashedAway >= stored && today.load.hashedHere === 0, `a start's bands are hashed in the worker, none on the page: ${JSON.stringify(today.load)}`);
check(Number.isFinite(today.load.hashWait) && today.load.hashWait < 250, `and the start barely waits for it: ${today.load.hashWait} ms (the worker answered in ${today.load.hashTook?.answered} ms)`);
await setProofs(3);
const older = await start("on proofs from live rules 3 (a returning learner)");
rows.push(older);
check(older.load.checked === 0 && older.load.trusted >= stored, `a returning learner's bands are all trusted: ${JSON.stringify(older.load)}`);
const margin = Math.max(today.ready * 1.5, today.ready + 1000);
check(older.ready <= margin, `and the app is ready as soon: ${older.ready} ms against ${today.ready} ms`);
await setProofs(version);
await setProofs(2);
const full = await start("every band checked in full (what bumping PACK_CHECKS alone would do)");
rows.push(full);
check(full.load.checked >= stored, `the control: every band really is checked in full: ${JSON.stringify(full.load)}`);
// A start writes its proofs just after it's ready, so one reload straight on can lose the last few (they're written then instead). Give them the time a person
// has, and fail if any pack is never given one: that one would be checked in full at every start.
const unproven = () =>
  page.evaluate(async () => {
    const { packVersion, proofHolds } = await import("/js/study/pack-format.js");
    const missing = [];
    for (const { name } of await indexedDB.databases()) {
      const open = await new Promise((done) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => done(request.result);
      });
      const has = open.objectStoreNames.contains("packs");
      const all = has ? await new Promise((done) => {
        const request = open.transaction("packs").objectStore("packs").getAll();
        request.onsuccess = () => done(request.result);
      }) : [];
      open.close();
      for (const record of all) {
        if (!record.id.startsWith("library:")) continue;
        if (!proofHolds(record.checked, record.pack, record.source.version) || (await packVersion(record.pack).catch(() => null)) !== record.source.version) missing.push(record.id);
      }
    }
    return missing;
  });
let left = await unproven();
for (let waited = 0; left.length && waited < 30_000; waited += 500) {
  await page.waitForTimeout(500);
  left = await unproven();
}
check(!left.length, `every pack checked in full gets its proof: ${left.length ? left.join(", ") : "all"}`);
const after = await start("the next start, on the proofs that just wrote");
rows.push(after);
check(after.load.checked === 0, `proofs written once: ${JSON.stringify(after.load)}`);
check(errors.length === 0, `no page errors: ${errors.slice(0, 2).join(" | ")}`);
writeFileSync(`${OUT}/results.json`, JSON.stringify({ cpu: CPU, stored, version, rows }, null, 2));
await browser.close();
process.exit(failed ? 1 : 0);
