// The service worker, end to end in headless Chrome on a LOCAL server (it creates and deletes a test account, so never
// point it at the live site): it installs, activates and takes the page, its cache holds every file in sw.js's SHELL,
// with the network off (after an open under it, which keeps what the page asks for beyond SHELL: the language's flag)
// the page and every file it asks for come from that copy, and back online they come from the network through it
// (network first). Then the app itself: a first open on another device, then a cold start there with the network off,
// starts from that device (who you are from the last answer kept, api.js whoAmI; every file from the worker, those the
// first open loaded before it took over handed to it) on Today, then Study and a session's first step, never "couldn't
// start"; signed out on the server (a 401) it goes to sign-in and forgets who it was, and Sign out does too. A
// recording offline: the app's own as a 206 from the worker, or (on a server whose open library has the starter's
// recordings, as the live one does) the library's, kept after the packs sync and played from the device's copy.
// From v41 to v57 it never installed (sixteen files listed twice in SHELL, which Cache.addAll refuses) and nothing
// noticed: scripts/test-sw-shell.mjs reads the list; this proves the worker itself. Fails on any console error while
// online. Chrome runs muted: nothing is heard.
//
// Local server: see AGENTS.md (wrangler dev with --local-upstream and its own --persist-to).
// Usage (headless Chrome, so through the channel's GPU queue's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "sw check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/sw-check.mjs http://localhost:<port> <outDir>

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const [BASE, outArg = "sw-check-out"] = process.argv.slice(2);
const OUT = resolve(outArg);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("sw-check creates and deletes an account: give it a local server, e.g. http://localhost:8824");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });

const results = [];
const problems = [];
async function stage(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - started, detail });
    console.log(`ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ stage: name, ok: false, ms: Date.now() - started, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
// Console errors count only while online: offline, the app's own requests fail, as they should. A stage that answers
// a request with an error on purpose names what it expects.
let offline = false;
let expecting = null;
page.on("console", (m) => m.type() === "error" && !offline && !expecting?.test(m.text()) && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});
const shot = (name) => page.screenshot({ path: join(OUT, "shots", `${name}.png`) });
const ready = () => page.waitForSelector('html[data-app-ready] [data-part="tab-bar"] [data-part="tab"]', { timeout: 15_000 });

// What sw.js names: its cache and its shell list, as the server serves it.
const shell = async () =>
  page.evaluate(async () => {
    const text = await (await fetch("/sw.js", { cache: "no-store" })).text();
    const start = text.indexOf("const SHELL = [");
    const list = [...text.slice(start, text.indexOf("];", start)).matchAll(/^\s*"([^"]+)",?/gm)].map((m) => m[1]);
    return { version: text.match(/const VERSION = "([^"]+)"/)?.[1], list };
  });

await stage("sign up with a passkey, land in the app", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Worker Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await ready();
  return "signed in";
});

await stage("the worker installs, activates and takes the page", async () => {
  const state = await page.evaluate(async () => {
    const registration = await Promise.race([navigator.serviceWorker.ready, new Promise((done) => setTimeout(() => done(null), 30_000))]);
    if (!registration) {
      const r = await navigator.serviceWorker.getRegistration();
      return { ready: false, installing: r?.installing?.state ?? null, waiting: r?.waiting?.state ?? null, active: r?.active?.state ?? null };
    }
    // ready resolves once there's an active worker, which may still be activating (deleting older copies, then
    // clients.claim()): wait for activated, and for the page to be taken.
    const worker = registration.active;
    const wait = (until, event, target) => (until() ? null : Promise.race([new Promise((done) => target.addEventListener(event, function check() { if (until()) { target.removeEventListener(event, check); done(); } })), new Promise((done) => setTimeout(done, 10_000))]));
    await wait(() => worker.state === "activated", "statechange", worker);
    await wait(() => Boolean(navigator.serviceWorker.controller), "controllerchange", navigator.serviceWorker);
    return { ready: true, active: worker.state, controller: Boolean(navigator.serviceWorker.controller), script: worker.scriptURL };
  });
  assert(state.ready, `no active worker after 30 s: ${JSON.stringify(state)}`);
  assert(state.active === "activated" && state.controller, JSON.stringify(state));
  return `${new URL(state.script).pathname} activated, controlling the page`;
});

let shellInfo = null;
await stage("its cache holds every file in SHELL", async () => {
  shellInfo = await shell();
  const kept = await page.evaluate(async (version) => {
    if (!(await caches.has(version))) return null;
    const keys = await (await caches.open(version)).keys();
    return keys.map((request) => {
      const url = new URL(request.url);
      return url.pathname + url.search;
    });
  }, shellInfo.version);
  assert(kept, `no cache named ${shellInfo.version}`);
  const missing = shellInfo.list.filter((url) => !kept.includes(url));
  assert(missing.length === 0, `${missing.length} of ${shellInfo.list.length} not cached: ${missing.slice(0, 5).join(", ")}`);
  return `${shellInfo.version}: ${shellInfo.list.length} of ${shellInfo.list.length} (${kept.length} kept)`;
});

// Same-origin requests a load makes, as answered (an API's included: the worker leaves those to the network). A blob: address
// is the page's own bytes in memory (a flag kept decoded, ui.js keepFlag), never a request: no worker sees one, and its origin
// reads as this site's, so it's left out here (8 Nov 2026: v438's kept flags counted as two files "not from the worker's copy").
const loadOf = async (go) => {
  const seen = [];
  const answered = (response) => {
    const url = new URL(response.url());
    if (url.protocol === "blob:") return;
    if (url.origin === new URL(BASE).origin) seen.push({ path: url.pathname + url.search, sw: response.fromServiceWorker(), status: response.status() });
  };
  const failed = (request) => {
    const url = new URL(request.url());
    if (url.protocol === "blob:") return;
    if (url.origin === new URL(BASE).origin) seen.push({ path: url.pathname + url.search, failed: request.failure()?.errorText ?? "failed" });
  };
  page.on("response", answered);
  page.on("requestfailed", failed);
  const response = await go();
  // What the page asks for as it starts (its modules load in waves).
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  page.off("response", answered);
  page.off("requestfailed", failed);
  // The app's own files: not the API, /models/ or /pictures/ (the worker leaves those to the network; both keep their own
  // cache, and picture-check proves pictures offline), nor the open library's (data, which a fresh local state may not have).
  const own = (r) => !/^\/(api|models|pictures|library)\//.test(r.path) && new URL(r.path, BASE).pathname !== "/app/";
  return { response, seen, files: seen.filter(own) };
};

await stage("the network off: the page and every file it asks for come from the worker's copy", async () => {
  // An open under the worker first: what the page asks for beyond SHELL (the language's flag) is kept as it comes.
  await page.reload();
  await ready();
  offline = true;
  await context.setOffline(true);
  const load = await loadOf(() => page.reload());
  assert(load.response?.fromServiceWorker() && load.response.status() === 200, `the page: ${load.response?.status()} from the worker: ${load.response?.fromServiceWorker()}`);
  const missed = load.files.filter((r) => r.failed || !r.sw || r.status !== 200);
  assert(load.files.length > 20 && missed.length === 0, `${missed.length} of ${load.files.length} files not from the worker's copy: ${JSON.stringify(missed.slice(0, 4))}`);
  const api = load.seen.filter((r) => r.path.startsWith("/api/"));
  const started = await page.evaluate(() => document.documentElement.hasAttribute("data-app-ready"));
  await shot("01-offline");
  return `the page and ${load.files.length} files from its copy, all 200; the app's start ${started ? "drew" : `didn't draw (it asks ${api.map((r) => r.path).join(", ") || "nothing"} first)`}`;
});

await stage("the network off: a sentence's recording plays from this device's copy; one that can't play is read by the device's voice", async () => {
  // Where the starter's recordings come from: the app's own (public/audio/, kept whole at install by the worker and
  // played offline as a 206 it builds) or, on a server whose open library has the starter with its recordings (the live
  // one, since v51), the library's (/library/audio/), kept after the packs sync (study/keep-clips.js) and played from
  // Cache Storage offline. Each is checked as it is; a fresh local server has no library.
  const fromLibrary = await page.evaluate(async () => {
    try {
      const { PACK } = await import("/js/study/content.js");
      const catalogue = await (await fetch("/library/catalogue.json")).json();
      return Boolean(Object.values(catalogue.packs ?? {}).flat().find((p) => p?.id === PACK.id)?.audio);
    } catch {
      return false;
    }
  });
  return fromLibrary ? libraryRecordings() : appRecordings();
});

// The library's recordings of the starter: every clip of both voices kept after the sync, with nothing played; offline
// one plays from that copy and one with no copy is read by the device's voice; a device asking to save data keeps none
// (and without it, every one again). Every gap is collected before it fails, so a run on code without the keeping says
// each one, and whether the device's voice still reads a sentence whose clip can't play.
async function libraryRecordings() {
  const gaps = [];
  const said = [];
  // A start with the network on (the stage before ends offline): the packs sync, and their recordings are kept a little
  // after, with nothing played.
  await context.setOffline(false);
  offline = false;
  await page.reload();
  await ready();
  const keep = await page.evaluate(async () => {
    const { packAudio } = await import("/js/study/packs.js");
    const { PACK } = await import("/js/study/content.js");
    const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
    let audio = null;
    for (let i = 0; i < 100 && !(audio = packAudio(PACK.id)); i++) await sleep(200);
    if (!audio) return { urls: [], kept: 0 };
    const urls = [...new Set(Object.values(audio.voices).flatMap((v) => [...Object.values(v.items ?? {}), ...Object.values(v.words ?? {})].map((e) => new URL(e.url, location.href).pathname)))];
    const cache = await caches.open("lx-audio-v1");
    let kept = 0;
    for (let i = 0; i < 150; i++) {
      kept = 0;
      for (const url of urls) if (await cache.match(url)) kept++;
      if (kept === urls.length) break;
      await sleep(200);
    }
    return { urls, kept };
  });
  if (!keep.urls.length) gaps.push("the library's starter never arrived with its recordings");
  else if (keep.kept !== keep.urls.length) gaps.push(`kept after the sync: ${keep.kept} of ${keep.urls.length} clips`);
  else said.push(`all ${keep.urls.length} clips kept after the sync`);

  offline = true;
  await context.setOffline(true);
  try {
    const heard = await page.evaluate(async () => {
      const voice = await import("/js/study/voice.js");
      const { ITEMS, PACK } = await import("/js/study/content.js");
      const { packAudio } = await import("/js/study/packs.js");
      const wait = async (until) => {
        for (let i = 0; i < 60; i++) {
          const state = voice.playbackState();
          if (until(state)) return state;
          await new Promise((done) => setTimeout(done, 100));
        }
        return voice.playbackState();
      };
      const recorded = ITEMS.find((item) => item.id === "boek-gelezen");
      const other = ITEMS.find((item) => item.id === "morgen-oma");
      // The second sentence's clips gone from the device's copy, as if never kept.
      const gone = Object.values(packAudio(PACK.id)?.voices ?? {}).map((v) => v.items?.["morgen-oma"]?.url).filter(Boolean).map((url) => new URL(url, location.href).pathname);
      const cache = await caches.open("lx-audio-v1");
      for (const url of gone) await cache.delete(url);
      let sound = voice.speakItem(recorded);
      // It plays from the device's copy or, with none, the device's voice reads it instead (seen as it starts: a short
      // sentence is over well inside the wait).
      const played = await wait((s) => (!s.paused && s.time > 0.1) || s.device);
      const instead = played.device;
      sound?.stop();
      sound = voice.speakItem(other);
      const read = await wait((s) => s.device);
      sound?.stop();
      const src = played.src.startsWith("blob:") ? "blob:" : played.src && new URL(played.src).pathname;
      return { played: { src, paused: played.paused, time: played.time, readInstead: instead }, read: read.device, gone, deviceVoice: voice.currentDeviceVoiceId() };
    });
    if (heard.played.src === "blob:" && !heard.played.paused && heard.played.time > 0.1) said.push(`boek-gelezen played offline from the device's copy (at ${heard.played.time.toFixed(2)} s)`);
    else gaps.push(`boek-gelezen offline: ${JSON.stringify(heard.played)}`);
    if (!heard.deviceVoice) gaps.push("no device voice here to read one with no copy");
    else if (heard.gone.length && heard.read) said.push(`morgen-oma with no copy read by ${heard.deviceVoice}`);
    else gaps.push(`morgen-oma with no copy: ${JSON.stringify({ gone: heard.gone, read: heard.read })}`);
  } finally {
    await context.setOffline(false);
    offline = false;
  }

  // A device asking to save data keeps none in the background; without it, every one again (morgen-oma's too).
  const saving = await page.evaluate(async (urls) => {
    const packs = await import("/js/study/packs.js");
    if (typeof packs.keepRecordingsForOffline !== "function") return null;
    const cache = await caches.open("lx-audio-v1");
    const count = async () => {
      let n = 0;
      for (const url of urls) if (await cache.match(url)) n++;
      return n;
    };
    for (const url of urls) await cache.delete(url);
    const connection = navigator.connection;
    if (!connection) return { noConnection: true };
    Object.defineProperty(connection, "saveData", { configurable: true, get: () => true });
    const withSaving = await packs.keepRecordingsForOffline();
    const keptSaving = await count();
    delete connection.saveData;
    const without = await packs.keepRecordingsForOffline();
    return { withSaving: withSaving.stoppedBy, keptSaving, without: without.stoppedBy, keptAfter: await count() };
  }, keep.urls);
  if (!saving) gaps.push("no background keeping (packs.js keepRecordingsForOffline)");
  else if (saving.noConnection) gaps.push("no navigator.connection here to ask to save data");
  else if (saving.withSaving !== "save-data" || saving.keptSaving !== 0) gaps.push(`saving data: ${JSON.stringify(saving)}`);
  else if (saving.without !== null || saving.keptAfter !== keep.urls.length) gaps.push(`after saving data: ${JSON.stringify(saving)}`);
  else said.push(`saving data kept none, then all ${saving.keptAfter} again`);
  assert(gaps.length === 0, gaps.join("; "));
  return said.join("; ");
}

// The app's own recordings of the starter (a server without the library): one plays offline from the worker's copy,
// the part asked for as a 206; one with no copy anywhere is read by the device's voice.
async function appRecordings() {
  offline = true;
  await context.setOffline(true);
  const parts = [];
  const seen = (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/audio/") && url.pathname.endsWith(".mp3")) parts.push({ path: url.pathname, status: response.status(), sw: response.fromServiceWorker() });
  };
  page.on("response", seen);
  try {
    const heard = await page.evaluate(async () => {
      const voice = await import("/js/study/voice.js");
      const { ITEMS } = await import("/js/study/content.js");
      const wait = async (until) => {
        for (let i = 0; i < 60; i++) {
          const state = voice.playbackState();
          if (until(state)) return state;
          await new Promise((done) => setTimeout(done, 100));
        }
        return voice.playbackState();
      };
      const recorded = ITEMS.find((item) => item.id === "boek-gelezen");
      const other = ITEMS.find((item) => item.id === "morgen-oma");
      // The second sentence's recordings gone from every cache, as if never kept.
      const gone = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) if (request.url.endsWith("/morgen-oma.mp3")) gone.push(new URL(request.url).pathname), await cache.delete(request);
      }
      let sound = voice.speakItem(recorded);
      const played = await wait((s) => !s.paused && s.time > 0.1);
      sound?.stop();
      sound = voice.speakItem(other);
      const read = await wait((s) => s.device);
      sound?.stop();
      return { played: { src: played.src && new URL(played.src).pathname, paused: played.paused, time: played.time }, read: read.device, gone: [...new Set(gone)], deviceVoice: voice.currentDeviceVoiceId() };
    });
    const part = parts.find((r) => r.path === heard.played.src);
    assert(heard.played.src?.endsWith("/boek-gelezen.mp3") && !heard.played.paused && heard.played.time > 0.1, `the recording offline: ${JSON.stringify(heard.played)}`);
    assert(part?.sw && part.status === 206, `its answer: ${JSON.stringify(part ?? parts.slice(0, 3))}`);
    assert(heard.deviceVoice, "no device voice here to read it");
    assert(heard.gone.length > 0 && heard.read, `one that can't play: ${JSON.stringify({ gone: heard.gone, read: heard.read })}`);
    return `${heard.played.src} played offline (${part.status} from the worker, at ${heard.played.time.toFixed(2)} s); morgen-oma with no copy was read by ${heard.deviceVoice}`;
  } finally {
    page.off("response", seen);
    await context.setOffline(false);
    offline = false;
    // Its recordings back in the worker's copy.
    await page.evaluate(async () => {
      const name = (await caches.keys()).find((key) => key.startsWith("shell-"));
      const cache = await caches.open(name);
      for (const voice of ["emma", "ido"]) await cache.add(`/audio/starter-word-order/${voice}/morgen-oma.mp3`).catch(() => {});
    });
  }
}

await stage("back online: the page and its files come from the network, through the worker", async () => {
  await context.setOffline(false);
  offline = false;
  const load = await loadOf(() => page.goto(`${BASE}/app/?online#today`));
  await ready();
  // Network first: the worker answered each, and fetched it (the navigation's timing shows the worker started it).
  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    return { workerStart: nav.workerStart, controller: Boolean(navigator.serviceWorker.controller) };
  });
  assert(load.response?.fromServiceWorker() && load.response.status() === 200, `the page: ${load.response?.status()} from the worker: ${load.response?.fromServiceWorker()}`);
  assert(timing.controller && timing.workerStart > 0, JSON.stringify(timing));
  const missed = load.files.filter((r) => r.failed || !r.sw || r.status !== 200);
  assert(load.files.length > 20 && missed.length === 0, `${missed.length} of ${load.files.length} files not through the worker: ${JSON.stringify(missed.slice(0, 4))}`);
  await page.waitForSelector('[data-part="page"] [data-part="streak-summary"]', { timeout: 10_000 });
  await shot("02-online-today");
  return `the page and ${load.files.length} files through the worker, all 200; Today drew`;
});

const kept = (where = page) => where.evaluate(() => JSON.parse(localStorage.getItem("lx.me.v1") ?? "null")?.me?.user?.name ?? null);

await stage("a first open, then a cold start with the network off: Today, Study and a session's first step, every file from the worker; it never says it couldn't start", async () => {
  // Another device of this account (its cookie, nothing else): opened once, then started again with no network.
  const { cookies } = await context.storageState();
  const device = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: { cookies, origins: [] } });
  const gaps = [];
  try {
    const first = await device.newPage();
    first.on("pageerror", (e) => problems.push(`page error (a first open): ${e.message}`));
    await first.goto(`${BASE}/app/`);
    await first.waitForSelector('html[data-app-ready] [data-part="tab-bar"] [data-part="tab"]', { timeout: 15_000 });
    // The worker takes it, and keeps what it loaded before (shell/main.js → sw.js): every file of the page's own that
    // answered 200 (not the API's or the speech models', which the worker leaves to the network).
    const handed = await first.evaluate(async () => {
      const own = () =>
        performance
          .getEntriesByType("resource")
          .filter((e) => !e.responseStatus || e.responseStatus === 200)
          .map((e) => new URL(e.name))
          .filter((u) => u.protocol === location.protocol && u.origin === location.origin && !/^\/(api|models|library\/audio)\//.test(u.pathname));
      let missing = [];
      for (let i = 0; i < 80; i++) {
        missing = [];
        if (navigator.serviceWorker.controller) for (const u of own()) if (!(await caches.match(u.href))) missing.push(u.pathname + u.search);
        if (navigator.serviceWorker.controller && !missing.length) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      return { controlled: Boolean(navigator.serviceWorker.controller), files: own().length, missing };
    });
    if (!handed.controlled || handed.missing.length) gaps.push(`the first open's files not kept: ${handed.missing.slice(0, 6).join(", ")} (${handed.missing.length} of ${handed.files})`);
    const keptAll = handed.files;
    await first.close();

    offline = true;
    await device.setOffline(true);
    const cold = await device.newPage();
    const failures = [];
    const missed = [];
    cold.on("console", (m) => m.type() === "error" && /start failed/.test(m.text()) && failures.push(m.text()));
    cold.on("pageerror", (e) => problems.push(`page error (a cold start offline): ${e.message}`));
    cold.on("requestfailed", (request) => {
      const url = new URL(request.url());
      if (url.origin !== new URL(BASE).origin || /^\/(api|models|pictures)\//.test(url.pathname)) return;
      missed.push(url.pathname);
    });
    const response = await cold.goto(`${BASE}/app/`);
    assert(response?.fromServiceWorker() && response.status() === 200, "the page didn't come from the worker");
    await cold.waitForSelector('html[data-app-ready] [data-part="tab-bar"] [data-part="tab"]', { timeout: 15_000 }).catch(() => {});
    const error = await cold.locator(".lx-start-error").textContent({ timeout: 500 }).catch(() => null);
    if (error || failures.length) {
      gaps.push(`the start: ${error ?? failures[0]}`);
      throw new Error(gaps.join(" · "));
    }
    const today = await cold.locator('[data-part="page"] [data-part="streak-summary"]').textContent({ timeout: 10_000 });
    await cold.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    await cold.screenshot({ path: join(OUT, "shots", "03-cold-offline-today.png") });
    await cold.locator('[data-part="tab-bar"] [data-part="tab"][href="#study"]').click();
    await cold.waitForFunction(() => location.hash.startsWith("#study") && document.querySelector('[data-part="page"] [data-part="study-door"]'), null, { timeout: 10_000 });
    const study = (await cold.locator('[data-part="page"] [data-part="study-door"]').first().textContent()).replace(/\s+/g, " ").trim().slice(0, 60);
    await cold.screenshot({ path: join(OUT, "shots", "04-cold-offline-study.png") });
    await cold.evaluate(() => (location.hash = "#study/session/quick"));
    await cold.waitForSelector('[data-part="session"]:not([data-ghost]) [data-part="activity-prompt"]', { timeout: 10_000 });
    await cold.screenshot({ path: join(OUT, "shots", "05-cold-offline-session.png") });
    if (missed.length) gaps.push(`files the worker didn't have: ${[...new Set(missed)].slice(0, 6).join(", ")}`);
    assert(!gaps.length, gaps.join(" · "));
    return `first open kept ${keptAll} files; offline: Today (its streak: "${today.trim()}"), Study (its quick start: "${study}…"), a quick session's first step, as ${await kept(cold)}, no file missing`;
  } finally {
    await device.close();
    offline = false;
  }
});

await stage("signed out on the server (a 401): the app goes to sign-in and forgets who it was; signed in, it keeps it again", async () => {
  const before = await kept();
  assert(before === "Worker Check", `kept before: ${before}`);
  // The server says signed out; its sign-in page is played too (with the cookie still good, the real one sends the
  // page straight back to the app).
  expecting = /status of 401/;
  await page.route("**/api/me", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "Sign in first." }) }));
  await page.route("**/login?next=*", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Sign in</title><p>Sign in</p>" }));
  try {
    await page.goto(`${BASE}/app/?signedout#today`);
    await page.waitForURL(/\/login\?next=/, { timeout: 15_000 });
  } finally {
    await page.unroute("**/api/me");
    await page.unroute("**/login?next=*");
    expecting = null;
  }
  const after = await kept();
  assert(after === null, `still kept after a 401: ${after}`);
  // The cookie is still good: back in the app, it's kept again.
  await page.goto(`${BASE}/app/`);
  await ready();
  const again = await kept();
  assert(again === "Worker Check", `kept again: ${again}`);
  return `kept "${before}"; a 401 went to sign-in and forgot it; back in, kept again`;
});

await stage("Sign out forgets who it was; signing in again with the passkey keeps it again", async () => {
  await page.goto(`${BASE}/app/#settings/account`);
  const row = (text) => page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${text}$`) }) }).first();
  // A poll in flight as the session ends (the pack inbox's) gets a 401, as it should.
  expecting = /status of 401/;
  await row("Sign out").click();
  await page.waitForURL(/\/login\?signedout=1/, { timeout: 15_000 });
  expecting = null;
  const after = await kept();
  assert(after === null, `still kept after Sign out: ${after}`);
  await page.click("#signin");
  await page.waitForURL(new RegExp(`^${BASE}/app/`), { timeout: 20_000 });
  await ready();
  const again = await kept();
  assert(again === "Worker Check", `kept after signing in: ${again}`);
  return "forgotten at Sign out; kept again after signing in";
});

let problemsBeforeDelete = 0;
await stage("delete the account", async () => {
  problemsBeforeDelete = problems.length;
  await page.goto(`${BASE}/app/#settings/account`);
  const row = (text) => page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${text}$`) }) }).first();
  await row("Delete my account").click();
  await row("Press again to delete it for good").click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  const left = await kept();
  assert(left === null, `still kept after deleting the account: ${left}`);
  return "deleted, and who it was forgotten";
});

await stage("no console errors while online", async () => {
  const after = problems.slice(problemsBeforeDelete).filter((p) => !/status of 401/.test(p));
  const real = [...problems.slice(0, problemsBeforeDelete), ...after];
  assert(real.length === 0, real.join(" | "));
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "sw-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), shell: shellInfo && { version: shellInfo.version, files: shellInfo.list.length }, results, problems }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
