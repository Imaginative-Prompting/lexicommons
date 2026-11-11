// A new version with nothing on screen about it (shell/new-version.js, 11 Nov 2026), in Chrome on a phone with the app's real service
// worker: this check deploys one itself, by changing the VERSION of the sw.js its server serves (the copy it runs from), and puts the file
// back after. Each stage has its control: the measure that would catch the fault shown catching it, or the blocked reload shown happening once
// what blocked it is gone.
// - A first open and a look with nothing new: nothing on screen, nothing ready; Settings → About the version alone.
// - A version arriving mid-session: found and taken, nothing on screen and nothing in the page changing, the session going on; leaving it,
//   nothing either.
// - Settings → About says it, and nowhere else: "A new version is ready" with Reload under the Version row (coming in while About is open),
//   the Settings menu as it was (no badge, no dot); Reload there takes it, the page and its history kept. Stills of the row both ways at 390.
// - A fresh open takes it: a new tab after the version runs it with nothing ready there, while the tab left open still has it ready; that
//   tab's next fresh open (its address loaded again) takes it too.
// - Back after 30 minutes away with a version ready: reloaded into it as it comes back, the page and its history kept; after 29, not.
// - A page in view is never reloaded, however long it's been open.
// - Not in a session; not with words typed and not sent (Translate's box); not while a book from the shelf is downloading; not offline.
//   Each, once what blocked it is gone: reloaded.
// - The reader keeps its place to the word across it: the same chapter, page and first word.
// LOCAL only (it writes the served copy's public/sw.js), one at a time on a copy with the open library seeded (npm run local). ONLY=<regex>
// runs just the stages whose names match.
// Usage: node scripts/update-check.mjs http://localhost:<port> <outDir>
import { chromium } from "./quiet-browser.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/update-check.mjs http://localhost:<port> <outDir> (a local server serving this copy)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const APP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SW = join(APP, "public/sw.js");
const original = readFileSync(SW, "utf8");
const versionOf = (text) => text.match(/const VERSION = "([^"]+)"/)[1];
const run = randomBytes(3).toString("hex");
let deployed = 0;
/**
 * Deploys a new version: the same worker under a new VERSION, done once the server gives it to a browser asking whether its copy is still
 * current. wrangler dev serves a changed file's bytes at once but answers that question (If-None-Match, the old ETag) with a 304 until it has
 * reloaded, and a look before then is a look with nothing new. Returns its cache's name.
 */
async function deploy() {
  const etag = (await fetch(`${BASE}/sw.js`, { cache: "no-store" })).headers.get("etag");
  const version = `${versionOf(original)}-check-${run}-${++deployed}`;
  writeFileSync(SW, original.replace(/const VERSION = "[^"]+"/, `const VERSION = "${version}"`));
  for (const start = Date.now(); Date.now() - start < 30_000; await new Promise((r) => setTimeout(r, 250))) {
    const response = await fetch(`${BASE}/sw.js`, { cache: "no-store", headers: etag ? { "if-none-match": etag } : {} }).catch(() => null);
    if (response?.status === 200 && (await response.text()).includes(`const VERSION = "${version}"`)) return version;
  }
  throw new Error(`the server still answers for the old sw.js 30 s after ${version} was written`);
}
const putBack = () => writeFileSync(SW, original);
process.on("exit", putBack);

const results = [];
const opened = [];
// ONLY=<words of a stage's name>: just those stages.
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null;
async function stage(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  try {
    const detail = await fn();
    results.push({ name, ok: true, ...(detail ? { detail } : {}) });
    console.log(`  ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    const page = opened.at(-1)?.pages()[0];
    if (page && !page.isClosed()) await page.screenshot({ path: join(OUT, `fail-${results.length + 1}.png`) }).catch(() => {});
    results.push({ name, ok: false, error: String(error.stack ?? error) });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").slice(0, 8).join("\n        ")}`);
  } finally {
    for (const context of opened.splice(0)) await context.close().catch(() => {});
  }
}
const assert = (cond, message) => {
  if (!cond) throw new Error(message);
};

// A book's files come through the app's service worker, and only a context's routes see a worker's requests (Playwright's switch for
// them, read at launch): the download stage holds them there.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";
const browser = await chromium.launch();
/** A phone with a new account, the app open and its worker in charge from the page's start (opened twice). */
async function phone({ theme = "graphite" } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  opened.push(context);
  // The worker's own fetches (a first open's files being kept, the shell installing), to know when it has nothing in progress.
  const worker = { requests: 0, last: Date.now(), open: new Map() };
  context.on("request", (request) => {
    worker.open.set(request, Date.now());
    if (!request.serviceWorker()) return;
    worker.requests++;
    worker.last = Date.now();
  });
  // Requests still open (a new worker waits for the old one's to end): named when a new version doesn't take the page.
  for (const done of ["requestfinished", "requestfailed"]) context.on(done, (request) => worker.open.delete(request));
  await context.addInitScript((theme) => {
    try {
      if (!localStorage.getItem("lx.appearance.v1")) localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, theme, presets: {} }));
    } catch {}
  }, theme);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const authn = await context.newCDPSession(page);
  await authn.send("WebAuthn.enable");
  await authn.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', `Update ${run}`);
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  // The first open: the worker installs and takes the page, which had none. That's no new version.
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const firstOpen = { shown: await shown(page), ready: await isReady(page) };
  // Opened again: in the worker's hands from the start, as every later open is.
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  assert(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), "the worker doesn't have the page from its start");
  await logWorker(page);
  // A deploy comes long after a first open, never while its files are still being kept: Chrome holds a new worker until the old one has
  // nothing in progress, and on a busy machine the keeping goes on for many seconds. So wait for the worker to be quiet (3 s with no fetch).
  for (const start = Date.now(); Date.now() - worker.last < 3000; await page.waitForTimeout(250)) {
    if (Date.now() - start > 90_000) throw new Error(`the worker was still fetching 90 s after the app opened (${worker.requests} fetches)`);
  }
  page.lxWorker = worker;
  return { context, page, errors, firstOpen };
}
// The worker's own timeline from here on, for the checks below and for saying where a failure stopped.
const logWorker = (page) =>
  page.evaluate(async () => {
    const t0 = performance.now();
    const log = (window.lxWorkerLog = []);
    const at = (what) => log.push(`${Math.round(performance.now() - t0)} ms ${what}`);
    const registration = await navigator.serviceWorker.getRegistration();
    registration.addEventListener("updatefound", () => {
      at("found");
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => at(worker.state));
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => at("took the page"));
  });
const cacheNames = (page) => page.evaluate(() => caches.keys());
const isReady = (page) => page.evaluate(() => document.documentElement.getAttribute("data-new-version") === "ready");
// Which version the worker that has this page is (sw.js answers on a port).
const controllerVersion = (page) =>
  page.evaluate(
    () =>
      new Promise((done) => {
        const worker = navigator.serviceWorker.controller;
        if (!worker) return done(null);
        const channel = new MessageChannel();
        setTimeout(() => done(null), 3000);
        channel.port1.onmessage = (event) => done(event.data?.version ?? null);
        worker.postMessage({ ask: "version" }, [channel.port2]);
      }),
  );
/**
 * Anything on screen about a version: a toast, a banner, an alert, a status or a live region whose words name a version, an update or a
 * reload, and (but on Settings → About) any words on screen naming a new version. Empty: nothing.
 */
const shown = (page) =>
  page.evaluate(() => {
    const seen = [];
    const visible = (node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden" && Number(getComputedStyle(node).opacity) > 0 && !node.closest("[data-ghost]");
    for (const node of document.querySelectorAll('[data-part="toast"], [role="alert"], [role="status"], [aria-live], .lx-toasts > *, dialog[open], [popover]:popover-open'))
      if (visible(node) && /version|update|reload/i.test(node.textContent ?? "")) seen.push(node.textContent.trim().slice(0, 80));
    if (!location.hash.startsWith("#settings/about")) {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode;
        if (/new version|update available/i.test(text.textContent) && text.parentElement && visible(text.parentElement)) seen.push(text.textContent.trim().slice(0, 80));
      }
    }
    return [...new Set(seen)];
  });
// The page's own top level (a toast's host, a banner, an overlay is a new child of the body).
const bodyKids = (page) => page.evaluate(() => [...document.body.children].map((node) => `${node.tagName}.${node.className}`).join(" "));
// The app coming back into view (the Home Screen app brought back from memory), with no time away.
const backIntoView = (page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
/**
 * Out of view, then back after `minutes` (the page's wall clock moved on for the coming back only: the app reads how long it was away from
 * Date.now, as a phone's suspended app does). The page's own visibilityChange handlers (the reader saving its place) run as they would.
 */
async function awayAndBack(page, minutes) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(400);
  await page.evaluate((ms) => {
    delete document.visibilityState;
    const real = Date.now;
    Date.now = () => real() + ms;
    try {
      document.dispatchEvent(new Event("visibilitychange"));
    } finally {
      Date.now = real;
    }
  }, minutes * 60_000);
}
/** Marks this start of the page, so a reload shows as a new one. */
const markStart = (page) => page.evaluate(() => (window.lxSameStart = true));
const sameStart = (page) => page.evaluate(() => window.lxSameStart === true).catch(() => false);
/** Whether the page reloaded within `ms` (its load event), and then the app ready again. */
async function reloadsWithin(page, ms) {
  const loaded = await page.waitForEvent("load", { timeout: ms }).then(
    () => true,
    () => false,
  );
  if (loaded) await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  return loaded && !(await sameStart(page));
}
const history = (page) => page.evaluate(() => ({ length: history.length, i: history.state?.lx?.i ?? null, hash: location.hash }));
const go = async (page, hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(700);
};
/**
 * A new version found by the app (its look for one when it comes back into view), then the new worker taking the page and the app marking it
 * ready. Finding it is the app's job, within seconds. Taking over is Chrome's: it holds a new worker until the old one has nothing in progress,
 * so that's given longer. A failure says where the worker stopped.
 */
async function newVersion(page) {
  // A deploy comes when the worker has nothing in progress (3 s with no fetch of its own): Chrome holds a new worker until then.
  const worker = page.lxWorker;
  for (const start = Date.now(); worker && Date.now() - worker.last < 3000; await page.waitForTimeout(250)) {
    if (Date.now() - start > 90_000) throw new Error(`the worker was still fetching 90 s on (${worker.requests} fetches)`);
  }
  const version = await deploy();
  await backIntoView(page);
  const where = async () =>
    JSON.stringify(
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return { installing: registration?.installing?.state, waiting: registration?.waiting?.state, active: registration?.active?.state, log: window.lxWorkerLog };
      }),
    );
  await page.waitForFunction(() => (window.lxWorkerLog ?? []).some((line) => line.endsWith(" found")), null, { timeout: 15_000 }).catch(async () => {
    throw new Error(`the app didn't find the new version within 15 s of coming back into view: ${await where()}`);
  });
  await page.waitForFunction(() => (window.lxWorkerLog ?? []).some((line) => line.endsWith(" took the page")), null, { timeout: Number(process.env.TAKEOVER_MS ?? 75_000) }).catch(async () => {
    const open = [...(page.lxWorker?.open ?? new Map())].map(([r, at]) => `${r.serviceWorker() ? "worker " : ""}${r.method()} ${new URL(r.url()).pathname} (${Math.round((Date.now() - at) / 1000)} s)`);
    throw new Error(`the new version was found but didn't take the page within ${Number(process.env.TAKEOVER_MS ?? 75_000) / 1000} s: ${await where()}; still open: ${open.slice(0, 12).join(", ") || "none"}`);
  });
  await page.waitForFunction(() => document.documentElement.getAttribute("data-new-version") === "ready", null, { timeout: 5000 }).catch(async () => {
    throw new Error(`the new version took the page, and the app didn't mark it ready (html[data-new-version]): ${await where()}`);
  });
  return version;
}
/** What Settings → About lists, row by row, and whether a Reload is there. */
async function about(page) {
  await go(page, "#settings/about");
  await page.waitForSelector('[data-part="page"]:not([data-ghost]) [data-part="list-row"]', { timeout: 10_000 });
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-part="page"]:not([data-ghost]) [data-part="list-row"]')].map((row) => row.textContent.replace(/\s+/g, " ").trim());
    return { rows, reload: Boolean([...document.querySelectorAll('[data-part="page"]:not([data-ghost]) button')].some((b) => b.textContent.trim() === "Reload")) };
  });
}
/** The Settings menu as it reads: its rows' words, and any badge or dot on it. */
async function settingsMenu(page) {
  await go(page, "#settings");
  await page.waitForSelector('[data-part="page"]:not([data-ghost]) [data-part="list-row"]', { timeout: 10_000 });
  return page.evaluate(() => {
    const root = document.querySelector('[data-part="page"]:not([data-ghost])');
    const marks = root.querySelectorAll('[data-part="badge"], [data-part="dot"], [data-dot], .lx-dot, .lx-badge').length;
    return { rows: [...root.querySelectorAll('[data-part="list-row"]')].map((row) => row.textContent.replace(/\s+/g, " ").trim()).join(" | "), marks };
  });
}
const READER = '[data-part="reader"]:not([data-ghost])';
/** Where the reader is: its chapter, its page and that page's first word (book word index). */
const readerPlace = (page) =>
  page.evaluate((sel) => {
    const r = document.querySelector(sel)?.lxReader;
    if (!r) return null;
    const range = r.pageRanges?.[r.page];
    return { chapter: r.chapter, page: r.page, first: range ? range[0] : null, word: r.word, mode: r.mode };
  }, READER);
/** Opens the first book on Read's shelf; `hold`: its files held back until the returned release is called. */
async function openShelfBook(page, { hold = false } = {}) {
  await go(page, "#read");
  const tile = page.locator('.lx-read-shelf [data-part="book-tile"]').first();
  await tile.waitFor({ timeout: 15_000 });
  let release = () => {};
  if (hold) {
    const gate = new Promise((r) => (release = r));
    await page.context().route("**/library/{books,weaves,layers,definitions}/**", async (route) => {
      await gate;
      await route.continue();
    });
  }
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  return release;
}

try {
  await stage("a first open, and a look with nothing new: nothing on screen and nothing ready; Settings → About the version alone", async () => {
    const { page, firstOpen } = await phone();
    assert(!firstOpen.shown.length && !firstOpen.ready, `the first open showed a new version: ${JSON.stringify(firstOpen)}`);
    await backIntoView(page);
    await page.waitForTimeout(5000);
    assert(!(await shown(page)).length && !(await isReady(page)), `nothing new, and a new version shown: ${await shown(page)}`);
    const rows = await about(page);
    assert(rows.rows.some((r) => /^Version\s*v?\S+/.test(r)) && !rows.rows.some((r) => /new version/i.test(r)) && !rows.reload, `About: ${JSON.stringify(rows)}`);
    // Control: a toast planted on Home is what this looks for, and it's found.
    await go(page, "#today");
    await page.evaluate(() => document.body.append(Object.assign(document.createElement("div"), { className: "lx-toasts", innerHTML: '<div data-part="toast">A new version is ready</div>' })));
    const planted = await shown(page);
    assert(planted.length, "the planted toast wasn't found: this measure can't fail");
    return `nothing shown; About: ${rows.rows.join(" · ")}; a planted toast found (${planted[0]})`;
  });

  await stage("a version arriving mid-session: found and taken, nothing on screen and nothing in the page changing, the session going on; leaving it, nothing either", async () => {
    const { page, errors } = await phone();
    await go(page, "#study/session/lesson");
    await page.waitForSelector('[data-part="session"]:not([data-ghost])', { timeout: 20_000 });
    await markStart(page);
    const stepOf = () =>
      page.evaluate(() => {
        const session = document.querySelector('[data-part="session"]:not([data-ghost])');
        if (!session) return null;
        const bar = session.querySelector('[role="progressbar"]');
        return `${session.querySelector('[data-part="activity-prompt"]')?.textContent.trim() ?? ""} @ ${bar?.getAttribute("aria-valuenow") ?? "?"}/${bar?.getAttribute("aria-valuemax") ?? "?"}`;
      });
    const step = await stepOf();
    assert(step && !/^ @/.test(step), `no step to follow in the session: ${step}`);
    const kids = await bodyKids(page);
    const version = await newVersion(page);
    await page.waitForTimeout(1500);
    const during = { shown: await shown(page), kids: await bodyKids(page) };
    assert(!during.shown.length, `shown in the middle of a session: ${during.shown}`);
    assert(during.kids === kids, `the page's top level changed in the session: ${kids} → ${during.kids}`);
    const still = await stepOf();
    assert((await sameStart(page)) && still === step, `the session didn't go on: ${JSON.stringify({ step, still })}`);
    assert((await cacheNames(page)).includes(version), `the new version's cache isn't there: ${await cacheNames(page)}`);
    await go(page, "#study");
    await page.waitForTimeout(1500);
    const after = await shown(page);
    assert(!after.length && (await sameStart(page)), `leaving the session: ${after}`);
    // Control: a new child of the body is what the top-level measure sees.
    await page.evaluate(() => document.body.append(document.createElement("aside")));
    assert((await bodyKids(page)) !== kids, "a planted top-level node wasn't seen: this measure can't fail");
    assert(!errors.length, `page errors: ${errors}`);
    return `the step (${step}) went on; nothing on Study after`;
  });

  await stage("Settings → About says it and nothing else does: the row coming in while About is open, with Reload; the Settings menu as it was, no badge or dot; Reload takes it, the page and its history kept", async () => {
    const { page, errors } = await phone();
    const menuBefore = await settingsMenu(page);
    const before = await about(page);
    assert(!before.rows.some((r) => /new version/i.test(r)) && !before.reload, `About before: ${JSON.stringify(before)}`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(OUT, "about-current-390.png") });
    await markStart(page);
    const version = await newVersion(page);
    await page.waitForTimeout(800);
    // Still on About: the row came in place.
    const ready = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-part="page"]:not([data-ghost]) [data-part="list-row"]')].map((row) => row.textContent.replace(/\s+/g, " ").trim());
      return { rows, hash: location.hash };
    });
    const at = ready.rows.findIndex((r) => /^Version/.test(r));
    assert(ready.hash === "#settings/about" && at >= 0 && /^A new version is ready\s*Reload$/.test(ready.rows[at + 1] ?? ""), `About once ready: ${JSON.stringify(ready)}`);
    await page.screenshot({ path: join(OUT, "about-ready-390.png") });
    const menuAfter = await settingsMenu(page);
    assert(menuAfter.rows === menuBefore.rows && menuAfter.marks === menuBefore.marks && !menuAfter.marks, `the Settings menu changed: ${JSON.stringify({ menuBefore, menuAfter })}`);
    for (const hash of ["#today", "#study", "#know"]) {
      await go(page, hash);
      assert(!(await shown(page)).length, `shown at ${hash}: ${await shown(page)}`);
    }
    // Reload there: this page reloads, its history and place kept, the new version's cache alone, nothing ready after.
    await about(page);
    const place = await history(page);
    await Promise.all([page.waitForEvent("load", { timeout: 30_000 }), page.locator('[data-part="page"]:not([data-ghost]) button', { hasText: "Reload" }).click()]);
    await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
    const after = await history(page);
    assert(!(await sameStart(page)), "Reload didn't reload");
    assert(after.length === place.length && after.i === place.i && after.hash === place.hash, `the history or its place changed: ${JSON.stringify({ place, after })}`);
    const names = await cacheNames(page);
    assert(names.includes(version) && !names.some((n) => n.startsWith("shell-") && n !== version), `caches after: ${names}`);
    assert(!(await isReady(page)) && !(await about(page)).reload, "still ready after Reload");
    assert(!errors.length, `page errors: ${errors}`);
    return { before: before.rows, ready: ready.rows.slice(at, at + 2), history: after };
  });

  await stage("a fresh open takes it: a new tab after it runs it, nothing ready there, while the tab left open has it ready (two tabs); that tab's next fresh open takes it too", async () => {
    const { context, page } = await phone();
    await go(page, "#study");
    const version = await newVersion(page);
    const second = await context.newPage();
    await second.goto(`${BASE}/app/#study`);
    await second.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
    await second.waitForTimeout(1500);
    const fresh = { version: await controllerVersion(second), ready: await isReady(second), about: await about(second) };
    assert(fresh.version === version && !fresh.ready && !fresh.about.reload, `the new tab: ${JSON.stringify(fresh)}`);
    // Control: the tab left open differs: still its old start, ready.
    assert((await isReady(page)) && (await about(page)).reload, "the tab left open isn't ready: the two tabs can't be told apart");
    await page.reload();
    await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
    await page.waitForTimeout(1500);
    const reopened = { version: await controllerVersion(page), ready: await isReady(page) };
    assert(reopened.version === version && !reopened.ready, `the tab opened again: ${JSON.stringify(reopened)}`);
    return { version, fresh: fresh.ready, reopened: reopened.ready };
  });

  await stage("back after 30 minutes away with a version ready: reloaded into it as it comes back, the page and its history kept; after 29 minutes, not", async () => {
    const { page, errors } = await phone();
    await go(page, "#know");
    await go(page, "#study");
    const version = await newVersion(page);
    await markStart(page);
    await awayAndBack(page, 29);
    assert(!(await reloadsWithin(page, 6000)), "reloaded after 29 minutes away");
    const place = await history(page);
    await awayAndBack(page, 31);
    assert(await reloadsWithin(page, 15_000), "not reloaded after 31 minutes away with a version ready");
    const after = await history(page);
    assert(after.length === place.length && after.i === place.i && after.hash === place.hash, `the history or its place changed: ${JSON.stringify({ place, after })}`);
    assert((await controllerVersion(page)) === version && !(await isReady(page)), "the reload didn't take the new version");
    assert(!(await shown(page)).length, `shown after: ${await shown(page)}`);
    assert(!errors.length, `page errors: ${errors}`);
    return { history: after };
  });

  await stage("a page in view is never reloaded, however long it's been open; out of view 30 minutes, it is (the control)", async () => {
    const { page } = await phone();
    await go(page, "#today");
    await newVersion(page);
    await markStart(page);
    // In view all along: hours on the clock, the app told it's in view (no time away), and seconds of waiting.
    await page.evaluate(() => {
      const real = Date.now;
      Date.now = () => real() + 6 * 3_600_000;
      try {
        document.dispatchEvent(new Event("visibilitychange"));
      } finally {
        Date.now = real;
      }
    });
    assert(!(await reloadsWithin(page, 12_000)), "a page in view reloaded");
    await awayAndBack(page, 31);
    assert(await reloadsWithin(page, 15_000), "not reloaded after 31 minutes away: the control");
    return "in view: not reloaded in 12 s with 6 hours on the clock; away 31 minutes: reloaded";
  });

  await stage("not in a session; once it's left, it is", async () => {
    const { page } = await phone();
    await go(page, "#study/session/lesson");
    await page.waitForSelector('[data-part="session"]:not([data-ghost])', { timeout: 20_000 });
    await newVersion(page);
    await markStart(page);
    await awayAndBack(page, 31);
    assert(!(await reloadsWithin(page, 8000)), "reloaded in the middle of a session");
    assert(await page.locator('[data-part="session"]:not([data-ghost])').count(), "the session's gone");
    await go(page, "#study");
    await page.waitForFunction(() => !document.querySelector('[data-part="session"]:not([data-ghost])'), null, { timeout: 10_000 });
    await awayAndBack(page, 31);
    assert(await reloadsWithin(page, 15_000), "not reloaded once the session was left");
    return "kept in the session; reloaded after it";
  });

  await stage("not with words typed and not sent (Translate's box); cleared, it is", async () => {
    const { page } = await phone();
    await go(page, "#today");
    const field = page.locator('[data-part="translate-field"] textarea').first();
    await field.click();
    await page.keyboard.type("koffie", { delay: 20 });
    await page.waitForTimeout(800);
    await newVersion(page);
    await markStart(page);
    await awayAndBack(page, 31);
    assert(!(await reloadsWithin(page, 8000)), "reloaded over words typed in Translate's box");
    assert((await page.locator('[data-part="translate-field"] textarea').first().inputValue()) === "koffie", "the typed words are gone");
    await page.locator('[data-part="translate-field"] textarea').first().fill("");
    await page.waitForTimeout(500);
    await awayAndBack(page, 31);
    assert(await reloadsWithin(page, 15_000), "not reloaded once the box was empty");
    return "kept with koffie typed; reloaded once it was empty";
  });

  await stage("not while a book from the shelf is downloading; once it's in, it is (in the reader)", async () => {
    const { page } = await phone();
    // Somewhere first, as a person would be (a deploy straight after a new account's first open waits on the old worker's work for it).
    await go(page, "#study");
    await newVersion(page);
    const release = await openShelfBook(page, { hold: true });
    const BAR = '.lx-read-shelf [data-part="book-tile"] [data-part="book-cover"] > [data-part="download-bar"]';
    assert(await page.waitForSelector(BAR, { timeout: 5000 }).then(() => true, () => false), "no download under way");
    await page.waitForTimeout(2000);
    assert(await page.locator(BAR).count() && !(await page.locator(`${READER}[data-ready]`).count()), "the book came while it was held: the download isn't under way");
    await markStart(page);
    await awayAndBack(page, 31);
    assert(!(await reloadsWithin(page, 8000)), "reloaded while a book was downloading");
    release();
    await page.waitForSelector(`${READER}[data-ready]`, { timeout: 30_000 });
    await page.waitForTimeout(800);
    await awayAndBack(page, 31);
    assert(await reloadsWithin(page, 15_000), "not reloaded once the book was in");
    return "kept while it came; reloaded in the reader after";
  });

  await stage("the reader keeps its place to the word across it: the same chapter, page and first word", async () => {
    const { page } = await phone();
    await openShelfBook(page);
    await page.waitForSelector(`${READER}[data-ready]`, { timeout: 30_000 });
    for (let i = 0; i < 2; i++) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(900);
    }
    const before = await readerPlace(page);
    assert(before && before.first != null, `no place in the reader: ${JSON.stringify(before)}`);
    await newVersion(page);
    await markStart(page);
    await awayAndBack(page, 31);
    assert(await reloadsWithin(page, 15_000), "not reloaded in the reader");
    await page.waitForSelector(`${READER}[data-ready]`, { timeout: 30_000 });
    await page.waitForTimeout(1200);
    const after = await readerPlace(page);
    assert(after && after.chapter === before.chapter && after.page === before.page && after.first === before.first, `the place moved: ${JSON.stringify({ before, after })}`);
    // Control: a page turned is a place that differs.
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(900);
    const turned = await readerPlace(page);
    assert(turned.first !== after.first, `a page turned reads as the same place: this measure can't fail (${JSON.stringify(turned)})`);
    return { before, after };
  });

  await stage("not offline; back online, it is", async () => {
    const { context, page } = await phone();
    await go(page, "#study");
    await newVersion(page);
    await markStart(page);
    await context.setOffline(true);
    await awayAndBack(page, 31);
    assert(!(await reloadsWithin(page, 8000)), "reloaded offline");
    await context.setOffline(false);
    await page.waitForTimeout(500);
    await awayAndBack(page, 31);
    assert(await reloadsWithin(page, 15_000), "not reloaded once back online");
    return "kept offline; reloaded online";
  });
} finally {
  putBack();
}

await browser.close().catch(() => {});
writeFileSync(join(OUT, "update-check.json"), JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.ok).length;
console.log(`update check: ${failed ? `${failed} of ${results.length} stages FAILED` : `all ${results.length} stages passed`}`);
process.exit(failed ? 1 : 0);
