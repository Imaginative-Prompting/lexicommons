// A new version while the app is open (shell/update-prompt.js), in Chrome on a phone with the app's real service worker: this check deploys one
// itself, by changing the VERSION of the sw.js its server serves (the copy it runs from), and puts the file back after.
// - A first open (the worker taking a page that had none) and a look with nothing new show nothing.
// - A new version deployed while a session is in progress: when the app comes back into view it's found and taken, nothing shows and the session
//   goes on; leaving the session, the quiet prompt; Reload, and the app is the new version, with the history and its place kept.
// - Shown, then a session starts: gone for the whole session, back once you leave it (v99 kept it over a session and its summary).
// - A page left open from its first open (the worker took it then) is offered the next version too.
// - Later hides it, and it stays hidden while you move around.
// LOCAL only (it writes the served copy's public/sw.js), one at a time on a copy. Usage: node scripts/update-check.mjs http://localhost:<port> <outDir>
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
async function stage(name, fn) {
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

const PROMPT = '[data-update][part="toast"], [data-part="toast"][data-update]';
const browser = await chromium.launch();
/** A phone with a new account, the app open and its worker in charge from the page's start (opened twice). */
async function phone({ theme = "graphite", firstOpenOnly = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  opened.push(context);
  // The worker's own fetches (a first open's files being kept, the shell installing), to know when it has nothing in progress.
  const worker = { requests: 0, last: Date.now() };
  context.on("request", (request) => {
    if (!request.serviceWorker()) return;
    worker.requests++;
    worker.last = Date.now();
  });
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
  const firstOpen = { prompt: await page.locator(PROMPT).count(), ready: await page.evaluate(() => document.documentElement.getAttribute("data-update")) };
  // Opened again: in the worker's hands from the start, as every later open is. firstOpenOnly: the page from the first open, left open.
  if (!firstOpenOnly) {
    await page.reload();
    await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
    assert(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), "the worker doesn't have the page from its start");
  }
  // The worker's own timeline from here on, for the checks below and for saying where a failure stopped.
  await page.evaluate(async () => {
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
  // A deploy comes long after a first open, never while its files are still being kept: Chrome holds a new worker until the old one has
  // nothing in progress, and on a busy machine the keeping goes on for many seconds. So wait for the worker to be quiet (3 s with no fetch).
  for (const start = Date.now(); Date.now() - worker.last < 3000; await page.waitForTimeout(250)) {
    if (Date.now() - start > 90_000) throw new Error(`the worker was still fetching 90 s after the app opened (${worker.requests} fetches)`);
  }
  console.log(`        the worker quiet after ${worker.requests} fetches of its own`);
  return { context, page, errors, firstOpen };
}
const cacheNames = (page) => page.evaluate(() => caches.keys());
// The app coming back into view (the Home Screen app brought back from memory).
const backIntoView = (page) => page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
/**
 * A new version found by the app (its look for one when it comes back into view), then the new worker taking the page. Finding it is the app's
 * job, within seconds. Taking over is Chrome's: it holds a new worker until the old one has nothing in progress (a first open's files still
 * being kept, on a busy machine), so that's given longer. A failure says where the worker stopped.
 */
async function waitForNewWorker(page) {
  const where = async () => {
    const state = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return { installing: registration?.installing?.state, waiting: registration?.waiting?.state, active: registration?.active?.state, log: window.lxWorkerLog };
    });
    return JSON.stringify(state);
  };
  await page.waitForFunction(() => (window.lxWorkerLog ?? []).some((line) => line.endsWith(" found")), null, { timeout: 15_000 }).catch(async () => {
    throw new Error(`the app didn't find the new version within 15 s of coming back into view: ${await where()}`);
  });
  await page.waitForFunction(() => (window.lxWorkerLog ?? []).some((line) => line.endsWith(" took the page")), null, { timeout: 45_000 }).catch(async () => {
    throw new Error(`the new version was found but didn't take the page within 45 s: ${await where()}`);
  });
  await page.waitForFunction(() => document.documentElement.getAttribute("data-update") === "ready", null, { timeout: 5000 }).catch(async () => {
    throw new Error(`the new version took the page, and the app didn't mark it ready (html[data-update]): ${await where()}`);
  });
}

try {
  await stage("a first open and a look with nothing new show nothing", async () => {
    const { page, firstOpen } = await phone();
    assert(!firstOpen.prompt && !firstOpen.ready, `the first open showed a new version: ${JSON.stringify(firstOpen)}`);
    await backIntoView(page);
    await page.waitForTimeout(5000);
    assert(!(await page.locator(PROMPT).count()) && !(await page.evaluate(() => document.documentElement.getAttribute("data-update"))), "nothing new, and a new version shown");
    return "nothing shown";
  });

  await stage("a new version during a session: found when the app comes back into view, nothing shown and the session going on; leaving it, the prompt; Reload into the new version, the history and its place kept", async () => {
    const { page, errors } = await phone();
    await page.evaluate(() => (location.hash = "#study/session/lesson"));
    await page.waitForSelector('[data-part="session"]:not([data-ghost])', { timeout: 20_000 });
    await page.evaluate(() => (window.lxSameStart = true));
    const step = await page.evaluate(() => document.querySelector('[data-part="session"]:not([data-ghost])').getAttribute("data-item"));
    const version = await deploy();
    await backIntoView(page);
    await waitForNewWorker(page);
    await page.waitForTimeout(800);
    assert(!(await page.locator(PROMPT).count()), "the prompt showed in the middle of a session");
    const still = await page.evaluate(() => ({ same: window.lxSameStart === true, session: Boolean(document.querySelector('[data-part="session"]:not([data-ghost])')), item: document.querySelector('[data-part="session"]:not([data-ghost])')?.getAttribute("data-item") }));
    assert(still.same && still.session && still.item === step, `the session didn't go on: ${JSON.stringify(still)}`);
    assert((await cacheNames(page)).includes(version), `the new version's cache isn't there: ${await cacheNames(page)}`);
    // Leaving the session: the prompt.
    await page.evaluate(() => (location.hash = "#study"));
    const prompt = page.locator(PROMPT);
    await prompt.waitFor({ state: "visible", timeout: 5000 });
    assert(/A new version is ready/.test(await prompt.innerText()), await prompt.innerText());
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, "update-graphite-390.png") });
    // Reload: a reload of this page (never another address), the history and its place kept.
    const before = await page.evaluate(() => ({ length: history.length, i: history.state?.lx?.i ?? null, hash: location.hash }));
    await Promise.all([page.waitForEvent("load", { timeout: 30_000 }), prompt.getByRole("button", { name: "Reload" }).click()]);
    await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
    const after = await page.evaluate(() => ({ length: history.length, i: history.state?.lx?.i ?? null, hash: location.hash, same: window.lxSameStart === true }));
    assert(!after.same, "Reload didn't reload");
    assert(after.length === before.length && after.i === before.i && after.hash === before.hash, `the history or its place changed: ${JSON.stringify({ before, after })}`);
    const names = await cacheNames(page);
    assert(names.includes(version) && !names.some((n) => n.startsWith("shell-") && n !== version), `caches after: ${names}`);
    assert(!(await page.locator(PROMPT).count()), "the prompt is back after the reload");
    assert(!errors.length, `page errors: ${errors}`);
    return { version, history: after };
  });

  await stage("shown, then a session starts: gone for the whole session, back once you leave it", async () => {
    const { page } = await phone();
    await page.evaluate(() => (location.hash = "#study"));
    await deploy();
    await backIntoView(page);
    await waitForNewWorker(page);
    const prompt = page.locator(PROMPT);
    await prompt.waitFor({ state: "visible", timeout: 5000 });
    await page.evaluate(() => (location.hash = "#study/session/lesson"));
    await page.waitForSelector('[data-part="session"]:not([data-ghost])', { timeout: 20_000 });
    // Past its leaving (a ghost fading, 200 ms), and again a while into the session.
    for (const wait of [600, 2000]) {
      await page.waitForTimeout(wait);
      assert(!(await prompt.count()), `the prompt is over the session ${wait} ms after it started`);
    }
    await page.screenshot({ path: join(OUT, "session-no-prompt-390.png") });
    await page.evaluate(() => (location.hash = "#study"));
    await prompt.waitFor({ state: "visible", timeout: 5000 });
    return "gone in the session, back on Study";
  });

  await stage("a page left open from its first open is offered the next version too", async () => {
    const { page, firstOpen } = await phone({ firstOpenOnly: true });
    assert(!firstOpen.prompt && !firstOpen.ready, `the first open showed a new version: ${JSON.stringify(firstOpen)}`);
    await page.evaluate(() => (location.hash = "#study"));
    await deploy();
    await backIntoView(page);
    await waitForNewWorker(page);
    await page.locator(PROMPT).waitFor({ state: "visible", timeout: 5000 });
    return "offered";
  });

  await stage("Later hides it, and it stays hidden while you move around", async () => {
    const { page } = await phone({ theme: "paper" });
    await deploy();
    await backIntoView(page);
    await waitForNewWorker(page);
    const prompt = page.locator(PROMPT);
    await prompt.waitFor({ state: "visible", timeout: 5000 });
    await page.screenshot({ path: join(OUT, "update-paper-390.png") });
    await prompt.getByRole("button", { name: "Later" }).click();
    await page.waitForTimeout(400);
    for (const hash of ["#know", "#today", "#study"]) {
      await page.evaluate((h) => (location.hash = h), hash);
      await page.waitForTimeout(500);
      assert(!(await page.locator(PROMPT).count()), `the prompt came back at ${hash}`);
    }
    return "hidden for this start";
  });
} finally {
  putBack();
}

await browser.close().catch(() => {});
writeFileSync(join(OUT, "update-check.json"), JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.ok).length;
console.log(`update check: ${failed ? `${failed} of ${results.length} stages FAILED` : `all ${results.length} stages passed`}`);
process.exit(failed ? 1 : 0);
