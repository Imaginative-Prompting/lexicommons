// Translate's page on a phone, in Chrome: the first thing typed in Today's box turns it into a page of its own with the
// same field (never a blur), every way back; a best guess that's honest about what it is; the next best guesses behind
// one tap; the main words with the sentences of your packs, studied ones first; speed under a slowed processor; Tinta only
// while there's a wait; never a false "Not in Lexicommons yet"; the voice asked for the right words in the right language,
// without a sound. What it expects is read from the pack files. LOCAL only: it signs up a test account (deleted at the end),
// and the local library must have the Dutch words packs as defaults (scripts/packs/seed-local.mjs --default).
// Usage: node scripts/translate-check.mjs http://localhost:<port> <outDir> --pack packs/words-nl-01.json [--pack …]
//        [--only <name,name>] [--dictation]   (exit 0 = pass; 2 = the local library hasn't got them). --dictation adds real
//        Whisper through Chrome's fake microphone, which needs the copy's public/models and macOS's say for its English clip
import { chromium } from "./quiet-browser.mjs";
import { CHECK_BOOK, seedCheckBook } from "./books/seed-check-book.mjs";
import { judgeFrames, readTrace, TRACE_CATEGORIES } from "./fixtures/trace-cpu.mjs";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { BUILT_IN } from "../public/js/packs/index.js";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const PACKS = argv.flatMap((arg, i) => (argv[i - 1] === "--pack" ? [JSON.parse(readFileSync(resolve(arg), "utf8"))] : []));
const OPT_IN = argv.includes("--opt-in") ? JSON.parse(readFileSync(resolve(argv[argv.indexOf("--opt-in") + 1]), "utf8")) : null;
const PERSIST = argv.includes("--persist-to") ? resolve(argv[argv.indexOf("--persist-to") + 1]) : null;
const ONLY = argv.includes("--only") ? new Set(argv[argv.indexOf("--only") + 1].split(",")) : null;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !PACKS.length) {
  console.error("Usage: node scripts/translate-check.mjs http://localhost:<port> <outDir> --pack <packs/words-nl-01.json> [--pack …] (a local server only: it signs up a test account)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const catalogue = await (await fetch(`${BASE}/library/catalogue.json`)).json().catch(() => ({}));
const listed = new Set((catalogue.packs?.nl ?? []).map((p) => p.id));
const absent = PACKS.filter((p) => !listed.has(p.id)).map((p) => p.id);
if (absent.length) {
  console.error(`translate-check: the local library doesn't list ${absent.join(", ")}; seed them with scripts/packs/seed-local.mjs first.`);
  process.exit(2);
}

// What the packs say.
const sentenceOf = (item) => item.words.map(([t]) => t).join(" ") + (item.punct ?? "");
// (The starter is on every device too.)
const ON_DEVICE = [...PACKS, BUILT_IN[0]];
const SENTENCES = ON_DEVICE.flatMap((pack) => pack.items.map((item) => ({ item, pack: pack.id, text: sentenceOf(item) })));
const GLOSS = new Map();
for (const pack of ON_DEVICE) for (const [lemma, gloss] of Object.entries(pack.words)) if (!GLOSS.has(lemma)) GLOSS.set(lemma, gloss);
// The server's other default Dutch packs (path-nl, when the local library has it): on the device too, so a sentence Translate shows from
// one of them is known here. Only for whether a sentence uses a word and a word's meaning: the stages' own picks stay on --pack's.
const OTHERS = [];
for (const entry of catalogue.packs?.nl ?? []) {
  if (entry.optIn || !entry.url || PACKS.some((p) => p.id === entry.id)) continue;
  const response = await fetch(`${BASE}${entry.url}`).catch(() => null);
  if (response?.ok) OTHERS.push(await response.json());
}
const KNOWN = [...SENTENCES, ...OTHERS.flatMap((pack) => pack.items.filter((item) => item.words).map((item) => ({ item, pack: pack.id, text: sentenceOf(item) })))];
for (const pack of OTHERS) for (const [lemma, gloss] of Object.entries(pack.words ?? {})) if (!GLOSS.has(lemma)) GLOSS.set(lemma, gloss);
const usesLemma = (text, lemma) => KNOWN.some((s) => s.text === text && s.item.words.some(([, l]) => l === lemma));
// A sentence only one way round, so "whole" is unambiguous.
const countOf = (list, key) => list.reduce((map, s) => map.set(key(s), (map.get(key(s)) ?? 0) + 1), new Map());
const byNatural = countOf(SENTENCES, (s) => s.item.means);
const byText = countOf(SENTENCES, (s) => s.text);
const PLAIN = SENTENCES.find((s) => byNatural.get(s.item.means) === 1 && byText.get(s.text) === 1 && s.item.words.length >= 4 && !/[()]/.test(s.text));
const SAME_SPELLING = JSON.parse(readFileSync(new URL("./fixtures/translate-same-spelling.json", import.meta.url), "utf8"));
// (Two different sentences: a sentence in two packs is only one.)
const REPEATED = [...byNatural].find(([natural, n]) => n > 1 && natural.length > 12 && new Set(SENTENCES.filter((s) => s.item.means === natural).map((s) => s.text)).size > 1)?.[0];

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const desk = await browser.newContext();
const signup = await desk.newPage();
const authn = await desk.newCDPSession(signup);
await authn.send("WebAuthn.enable");
await authn.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await signup.goto(`${BASE}/app/`);
await signup.waitForURL(/\/login\?next=/);
await signup.click("summary");
await signup.fill('input[name="name"]', "Translate Check");
await signup.click('#register button[type="submit"]');
await signup.waitForURL(`${BASE}/app/`, { timeout: 90_000 });
const COOKIES = await desk.cookies();
const keyboardOf = (height) => Math.round(height * 0.4); // an iPhone's: 336 on an 844 screen

/** A phone: touch, its stand-in keyboard (window.lxKeyboard, as keyboard-check's), a spy on what's asked to be said. */
async function phone({ width = 390, height = 844, reducedMotion, init } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion });
  await context.addCookies(COOKIES);
  await context.addInitScript(() => {
    const vv = new EventTarget();
    let kb = 0;
    Object.defineProperties(vv, {
      height: { get: () => innerHeight - kb },
      width: { get: () => innerWidth },
      offsetTop: { get: () => 0 },
      offsetLeft: { get: () => 0 },
      pageTop: { get: () => 0 },
      pageLeft: { get: () => 0 },
      scale: { get: () => 1 },
    });
    Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
    window.lxKeyboard = (px) => {
      kb = px;
      vv.dispatchEvent(new Event("resize"));
    };
    // What's asked to be said, after quiet-browser's silence: nothing reaches a speaker either way.
    window.lxSaid = [];
    const synth = window.speechSynthesis;
    if (synth) {
      const speak = synth.speak.bind(synth);
      synth.speak = (u) => {
        window.lxSaid.push({ text: u.text, lang: u.lang, voice: u.voice?.lang ?? null });
        speak(u);
      };
    }
  });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  // --cpu <rate>: a slow phone, or a machine with a lot else running (what the stages must hold up under).
  if (argv.includes("--cpu")) await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: Number(argv[argv.indexOf("--cpu") + 1]) });
  return { context, page };
}
const errors = [];
const results = {};
let failed = 0;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
// A stage that couldn't judge (the speed stage on a machine measured too busy): not a pass, not a fail. The check exits 2 and says so last.
class NotReached extends Error {}
let notReached = 0;
let shot = 0;
async function stage(name, fn) {
  if (ONLY && !ONLY.has(name.split(":")[0])) return;
  const opened = [];
  try {
    results[name] = { ok: true, note: (await fn(opened)) ?? "" };
    console.log(`PASS ${name}: ${results[name].note}`);
  } catch (error) {
    if (error instanceof NotReached) {
      notReached++;
      results[name] = { ok: false, notReached: true, note: error.message };
      console.log(`NOT REACHED ${name}: ${error.message}`);
    } else {
      failed++;
      results[name] = { ok: false, note: String(error.stack ?? error) };
      console.log(`FAIL ${name}: ${error.message}`);
    }
    for (const { page } of opened) await page.screenshot({ path: `${OUT}/fail-${++shot}.png` }).catch(() => {});
  } finally {
    for (const { context } of opened) await context.close().catch(() => {});
  }
}

const FIELD = '[data-part="translate-field"] :is(textarea, input)';
// The page's own results (what your packs have, under the answer, holds groups of its own with the same class).
const RESULTS = '.lx-tr-results[aria-live="polite"]';
const ready = (page) => page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
/** Today on a phone, with the word packs on the device and its index not yet asked for. */
async function today(opened, options) {
  const one = await phone(options);
  opened.push(one);
  const { page } = one;
  await page.goto(`${BASE}/app/#today`);
  await ready(page);
  await page.waitForSelector(FIELD, { timeout: 30_000 });
  // The packs on this device: asked of the app itself (all but one held back: options.except).
  const want = PACKS.filter((pack) => pack.id !== options?.except).length;
  let here = 0;
  for (let waited = 0; waited < 60_000; waited += 200) {
    here = await page.evaluate(async (except) => (await import("/js/study/packs.js")).libraryPacks().filter((p) => p.id.startsWith("words-nl-") && p.id !== except).length, options?.except ?? null);
    if (here >= want) break;
    await page.waitForTimeout(200);
  }
  // Said, never carried on without: a held pack the sync fetches first (the lessons pack, since a newcomer's lessons come first) holds every
  // band behind it, and the speed stage once typed for weeks on a device with none, timing only the keys the server happened to answer.
  assert(here >= want, `only ${here} of ${want} word bands on the device after 60 s${options?.except ? ` (${options.except} held)` : ""}`);
  return page;
}
/** The last of Lexicommons' own Dutch packs a sync fetches, to hold back: the catalog's last default pack that carries no lessons (a pack
 * with lessons is fetched first: packs.js lessonPacks, the sync's order). */
const lastFetched = (catalogue) => {
  const defaults = (catalogue.packs?.nl ?? []).filter((entry) => !entry.optIn);
  const lessons = defaults.some((entry) => "lessons" in entry) ? defaults.filter((entry) => entry.lessons > 0) : defaults.filter((entry) => entry.id === "path-nl");
  return defaults.filter((entry) => !lessons.includes(entry)).at(-1);
};
/** Taps the box and types as a person does (real keys). */
async function typeIn(page, text, { delay = 0 } = {}) {
  await page.locator(FIELD).tap({ position: { x: 24, y: 20 } });
  await page.evaluate((kb) => window.lxKeyboard(kb), keyboardOf(page.viewportSize().height));
  if (text) await page.keyboard.type(text, { delay });
}
/** Waits until what's drawn for the query has settled (no change for quiet ms, the server having answered). */
const settled = (page, quiet = 700) =>
  page.evaluate(async (quiet) => {
    let last = "";
    let since = performance.now();
    const t0 = performance.now();
    while (performance.now() - since < quiet && performance.now() - t0 < 20_000) {
      const now = document.querySelector(".lx-today-translate")?.innerText ?? "";
      // Still looking isn't settled: on a busy machine "Looking it up…" alone outlasts the quiet, and a stage then read a page with no answer yet.
      // Nor is the server's answer standing in while this device's index is made (data-indexing): the device's own are still to come.
      const looking = Boolean(document.querySelector('.lx-today-translate [data-part="looking-up"], .lx-today-translate[data-indexing]'));
      // Nor is an answer to the query before, still up while this one's found (page.js answerFor: the results' data-query).
      const want = document.querySelector('[data-part="translate-field"] :is(textarea, input)')?.value.trim() ?? "";
      const got = document.querySelector('.lx-tr-results[aria-live="polite"]')?.dataset.query;
      const stale = want !== "" && got !== undefined && got !== want && !(want.startsWith(got) && got.length >= 100);
      if (now !== last || looking || stale) {
        last = now;
        since = performance.now();
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    return last;
  }, quiet);
/**
 * The answer for what's typed is up: the results' data-query is the field's text (a long phrase's first 100 characters and on, as settled reads
 * it), its best guess drawn and nothing still looking. Up to ms, then false: a real fault to fail on. (settled() stops waiting at 20 s, and on a
 * busy machine a 400-character phrase's answer came after that: layout judged a page still waiting, at 375, twice on code that was fine.)
 */
const answered = (page, ms = 60_000) =>
  page
    .waitForFunction(
      (best) => {
        const want = document.querySelector('[data-part="translate-field"] :is(textarea, input)')?.value.trim() ?? "";
        const got = document.querySelector('.lx-tr-results[aria-live="polite"]')?.dataset.query;
        const forThis = want !== "" && got !== undefined && (got === want || (want.startsWith(got) && got.length >= 100));
        return forThis && Boolean(document.querySelector(best)) && !document.querySelector('.lx-today-translate [data-part="looking-up"]');
      },
      best,
      { timeout: ms, polling: 100 },
    )
    .then(
      () => true,
      () => false,
    );
const visible = (page, selector) => page.evaluate((s) => [...document.querySelectorAll(s)].some((n) => n.checkVisibility() && n.getBoundingClientRect().height > 0), selector);
/** A picture of the page as it is with the keyboard put away (the stand-in's), and the keyboard back. */
async function sheet(page, name) {
  await page.evaluate(() => window.lxKeyboard(0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/sheet-${name}.png` });
  await page.evaluate((kb) => window.lxKeyboard(kb), keyboardOf(page.viewportSize().height));
}
const best = '[data-part="translate-result"][data-state="best"]';
const bestText = (page) => page.locator(best).innerText();
const wide = '[data-part="translate-more"]';
const sourceOf = (page) => page.evaluate(() => { const n = document.querySelector(".lx-tr-source"); return n && !n.hidden ? n.textContent : null; });
const none = (page) => page.locator(`${RESULTS} .lx-tr-none`);
// What your packs have with what's typed: under the answer, in place ("In your packs", translate/page.js .lx-tr-inline).
const INLINE = ".lx-today-translate .lx-tr-inline";
const openPacks = async (page) => {
  await page.evaluate(() => { document.activeElement?.blur?.(); window.lxKeyboard?.(0); });
  await page.locator(INLINE).waitFor({ timeout: 3000 });
  // With the keys up, what's under the answer steps away: read it once it's back, more than its title.
  await page.waitForFunction((s) => (document.querySelector(s)?.innerText ?? "").trim().split("\n").filter(Boolean).length > 1, INLINE, { timeout: 3000 });
};
const closePacks = async () => {};
/** Opens the one wide button's sheet (Find a pack, when your packs have nothing); closeSheet puts it away again. */
const openSheet = async (page) => {
  // With the keys up there's no room for it: it's back once they're down.
  await page.evaluate(() => { document.activeElement?.blur?.(); window.lxKeyboard?.(0); });
  await page.locator(wide).tap();
  await page.locator('[data-part="sheet"]:not([hidden]) .lx-sheet-title').waitFor({ timeout: 3000 });
};
const closeSheet = async (page) => {
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => ![...document.querySelectorAll('[data-part="sheet"]')].some((n) => !n.hidden && n.getClientRects().length && n.getAttribute("data-state") !== "closing"), null, { timeout: 3000 });
};
/** A person with no AI never meets one here: no word about it, no ask menu. */
async function noAi(page, where) {
  const seen = await page.evaluate(() => ({ text: document.querySelector(".lx-today-translate")?.innerText ?? "", menus: document.querySelectorAll('.lx-today-translate [aria-haspopup="menu"]').length }));
  assert(!/\b(AI|your agent|Claude|ChatGPT)\b/.test(seen.text) && !seen.menus, `${where}: an AI on Translate: ${JSON.stringify(seen).slice(0, 300)}`);
}

await stage("swap: a cleared field stays empty when Swap is pressed", async (opened) => {
  const page = await today(opened);
  await typeIn(page, "book");
  await settled(page);
  assert(/boek/i.test(await bestText(page)), "book wasn't answered with boek");
  await page.locator('[data-part="translate-clear"]').tap();
  await settled(page);
  assert((await page.locator(RESULTS).innerText()).trim() === "", "clearing left results behind");
  await page.locator('[data-part="translate-field"] .lx-tr-swap').tap();
  await settled(page);
  // Before the fix, run() left book's answer for Swap, and boek returned to the empty field.
  assert((await page.locator(FIELD).inputValue()) === "", `Swap brought back ${JSON.stringify(await page.locator(FIELD).inputValue())}`);
  assert((await page.locator(RESULTS).innerText()).trim() === "", "Swap answered the cleared query");
});

await stage("swap: a new query before its answer never takes the earlier query's answer, and its own answer swaps back", async (opened) => {
  const page = await today(opened);
  await typeIn(page, "book");
  await settled(page);
  assert(/boek/i.test(await bestText(page)), "book wasn't answered with boek");
  // No worker reply or promise can arrive between the input event and this press. Before the fix, boek replaced lezen.
  const pending = await page.evaluate(([field, swap]) => {
    const input = document.querySelector(field);
    input.value = "lezen";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(swap).click();
    return input.value;
  }, [FIELD, '[data-part="translate-field"] .lx-tr-swap']);
  assert(pending === "lezen", `before the new answer, Swap put ${JSON.stringify(pending)} in the field`);
  await settled(page);
  assert(/to read/i.test(await bestText(page)), `lezen's answer: ${await bestText(page)}`);
  await page.locator('[data-part="translate-field"] .lx-tr-swap').tap();
  // Swap takes a word's first sense: "read" for "to read".
  assert(/^(to )?read$/.test(await page.locator(FIELD).inputValue()), `its own answer didn't swap: ${await page.locator(FIELD).inputValue()}`);
  await settled(page);
  assert(/lezen/i.test(await bestText(page)), `the answer back: ${await bestText(page)}`);
});

await stage("dispose: rebuilding Home for another learning language releases Translate's resize listeners and observers", async (opened) => {
  const page = await today(opened, { init: () => {
    const live = { window: new Map(), viewport: new Map(), keyboard: new Set(), field: new Map() };
    const capture = (options) => typeof options === "boolean" ? options : Boolean(options?.capture);
    const countListener = (listeners, listener, options, adding) => {
      if (!listener) return;
      const key = capture(options);
      if (adding) {
        if (!listeners.has(listener)) listeners.set(listener, new Set());
        listeners.get(listener).add(key);
      } else {
        listeners.get(listener)?.delete(key);
        if (!listeners.get(listener)?.size) listeners.delete(listener);
      }
    };
    for (const method of ["addEventListener", "removeEventListener"]) {
      const realWindow = window[method];
      window[method] = function (type, listener, options) {
        const result = realWindow.call(this, type, listener, options);
        if (type === "resize") countListener(live.window, listener, options, method === "addEventListener");
        return result;
      };
      // The phone's visualViewport is an EventTarget made by another init script. Follow it whichever script runs first.
      const realTarget = EventTarget.prototype[method];
      EventTarget.prototype[method] = function (type, listener, options) {
        const result = realTarget.call(this, type, listener, options);
        if (this === window.visualViewport && type === "resize") countListener(live.viewport, listener, options, method === "addEventListener");
        return result;
      };
    }
    const RealMutation = window.MutationObserver;
    window.MutationObserver = class extends RealMutation {
      observe(target, options) {
        super.observe(target, options);
        if (target === document.documentElement) live.keyboard.add(this);
      }
      disconnect() {
        super.disconnect();
        live.keyboard.delete(this);
      }
    };
    const RealResize = window.ResizeObserver;
    window.ResizeObserver = class extends RealResize {
      observe(target, options) {
        super.observe(target, options);
        // Other components watch their own sizes too. Count the Translate field, even after it leaves the document.
        if (target.matches('[data-part="translate-field"]')) live.field.set(this, target);
      }
      unobserve(target) {
        super.unobserve(target);
        if (target.matches('[data-part="translate-field"]')) live.field.delete(this);
      }
      disconnect() {
        super.disconnect();
        live.field.delete(this);
      }
    };
    // An observer on a field that's left the page holds nothing: the field's count is of those still on the page.
    window.lxTranslateLive = () => ({
      window: [...live.window.values()].reduce((sum, captures) => sum + captures.size, 0),
      viewport: [...live.viewport.values()].reduce((sum, captures) => sum + captures.size, 0),
      keyboard: live.keyboard.size,
      field: [...live.field.values()].filter((target) => target.isConnected).length,
    });
  } });
  await typeIn(page, "");
  await page.waitForTimeout(600);
  const baseline = await page.evaluate(() => window.lxTranslateLive());
  assert(Object.values(baseline).every((count) => count > 0), `the counters missed Translate: ${JSON.stringify(baseline)}`);
  const counts = [];
  for (const lang of ["fr", "nl", "de", "nl", "es", "nl"]) {
    await page.evaluate(() => { document.activeElement?.blur?.(); window.lxKeyboard(0); location.hash = "#today"; });
    await page.waitForFunction(() => location.hash === "#today" && !document.querySelector('.lx-today-translate[data-open]'));
    await page.evaluate(async (lang) => {
      window.lxOldTranslateField = document.querySelector('[data-part="translate-field"]');
      const { setLearning } = await import("/js/study/learning.js");
      setLearning(lang);
    }, lang);
    await page.waitForFunction(() => !window.lxOldTranslateField.isConnected && Boolean(document.querySelector('[data-part="translate-field"]')));
    await page.waitForSelector(FIELD);
    await typeIn(page, "");
    await page.waitForTimeout(600);
    // Compare the same language and screen each time, after the page move has finished.
    if (lang === "nl") counts.push(await page.evaluate(() => window.lxTranslateLive()));
  }
  // Before the fix each rebuilt Translate added two listeners and two observers without releasing the previous ones.
  assert(counts.every((now) => Object.keys(baseline).every((key) => now[key] <= baseline[key])), `live counts grew: ${JSON.stringify({ baseline, counts })}`);
  return JSON.stringify({ baseline, counts });
});

await stage("page: a tap in Today's box opens the page in that frame, empty, the same field keeping its focus and the keys up; the box one size with the keys up or down, what your packs have under the answer", async (opened) => {
  const page = await today(opened);
  const before = await page.evaluate(() => ({ date: Boolean(document.querySelector(".lx-today-date")?.checkVisibility()), url: location.hash }));
  assert(before.date, "Today's date isn't showing to begin with");
  await page.locator('.lx-today-next [data-part="next-step"]').waitFor({ timeout: 10_000 });
  await page.screenshot({ path: `${OUT}/01-today.png` });
  // In the focus's own frame: what's visible, whether it blurred, and whether it's the same element.
  await page.evaluate(() => {
    const field = document.querySelector('[data-part="translate-field"] :is(textarea, input)');
    window.lxField = field;
    window.lxBlurs = 0;
    field.addEventListener("blur", () => window.lxBlurs++);
    window.lxFrame = new Promise((done) => {
      field.addEventListener("focus", () => requestAnimationFrame(() => {
        const shows = (s) => [...document.querySelectorAll(s)].filter((n) => n.checkVisibility() && n.getBoundingClientRect().height > 0).length;
        done({ date: shows(".lx-today-date"), next: shows(".lx-today-next"), progress: shows(".lx-today-progress-slot"), tabs: shows('[data-part="tab-bar"]'), language: shows('[data-part="header-language"]'), settings: shows('[data-part="header-settings"]'), back: shows('[data-part="app-back"]'), value: field.value });
      }), { once: true });
    });
  });
  await typeIn(page, "");
  const frame = await page.evaluate(() => window.lxFrame);
  const away = ["date", "next", "progress", "tabs", "language", "settings"].filter((k) => frame[k]);
  assert(!away.length, `still showing in the tap's frame: ${away.join(", ")}`);
  assert(frame.back && frame.value === "", `no way back, or something typed, in the tap's frame: ${JSON.stringify(frame)}`);
  const after = await page.evaluate(() => ({ hash: location.hash, same: document.querySelector('[data-part="translate-field"] :is(textarea, input)') === window.lxField, focused: document.activeElement === window.lxField, blurs: window.lxBlurs }));
  assert(after.same && after.focused && !after.blurs, `the field didn't keep its focus: ${JSON.stringify(after)}`);
  assert(/^#\/?today\/translate/.test(after.hash), `its address: ${after.hash}`);
  await page.screenshot({ path: `${OUT}/01b-page-empty.png` });
  // Nothing past the screen's edge, and the field under the header.
  const box = await page.evaluate(() => {
    const r = document.querySelector('[data-part="translate-field"]').getBoundingClientRect();
    const h = document.querySelector('[data-part="app-header"]').getBoundingClientRect();
    return { top: r.top, headerBottom: h.bottom, wide: document.documentElement.scrollWidth - innerWidth };
  });
  assert(box.top >= box.headerBottom - 1 && box.top < box.headerBottom + 24, `the field isn't right under the header: ${JSON.stringify(box)}`);
  assert(box.wide <= 0, `wider than the screen by ${box.wide} px`);
  await page.keyboard.type("hi");
  await settled(page);
  await page.screenshot({ path: `${OUT}/02-page-word.png` });
  // One size, keys up or down: the box and the answer where they are with the keys up; with them down, what your packs have under the answer.
  const geometry = () => page.evaluate(() => {
    const at = (s) => document.querySelector(s)?.getBoundingClientRect();
    const field = at('[data-part="translate-field"]');
    return { top: Math.round(field.top), height: Math.round(field.height), answer: Math.round(at('[data-part="translate-result"]')?.top ?? -1), packs: Math.round(at(".lx-today-translate .lx-tr-inline")?.top ?? -1), bar: Math.round(at('.lx-way-bar')?.top ?? -1) };
  });
  const up = await geometry();
  await page.evaluate(() => { document.activeElement?.blur?.(); window.lxKeyboard(0); });
  await page.waitForTimeout(600);
  const down = await geometry();
  assert(Math.abs(up.top - down.top) <= 1 && Math.abs(up.height - down.height) <= 1, `the box changed size with the keys: up ${JSON.stringify(up)}, down ${JSON.stringify(down)}`);
  assert(Math.abs(up.answer - down.answer) <= 1, `the answer moved with the keys: up ${up.answer}, down ${down.answer}`);
  assert(down.packs > down.answer, `what your packs have isn't under the answer: ${JSON.stringify(down)}`);
  await page.screenshot({ path: `${OUT}/02b-page-keys-down.png` });
  return `frame ${JSON.stringify(frame)}; ${after.hash}; box ${up.height} px keys up and down`;
});

await stage("back: Back and the phone's back return to Today as it was, its cards where they were; Clear and deleting all keep the page, empty; a reload keeps it; an empty cold open is Today; a page it opened comes back to it", async (opened) => {
  const page = await today(opened);
  const boxHeight = () => page.evaluate(() => Math.round(document.querySelector('[data-part="translate-field"]').getBoundingClientRect().height));
  await page.waitForTimeout(300);
  const onlyALine = await boxHeight(); // Today's box, one line: the page's taller box never comes back with it
  const nextTop = () => page.evaluate(() => Math.round(document.querySelector(".lx-today-next")?.getBoundingClientRect().top ?? -1) + document.querySelector('[data-part="page"]').scrollTop);
  const cardAt = await nextTop(); // the first lesson's card: nothing pushes it down when Translate's page goes
  const isToday = async (what) => {
    assert((await boxHeight()) === onlyALine, `${what}: Today's box should be its one line again, ${onlyALine} px: ${await boxHeight()} px`);
    assert(Math.abs((await nextTop()) - cardAt) <= 1, `${what}: Today's first card moved, from ${cardAt} to ${await nextTop()}`);
    const s = await page.evaluate(() => ({ date: document.querySelector(".lx-today-date")?.checkVisibility(), tabs: document.querySelector('[data-part="tab-bar"]')?.checkVisibility(), hash: location.hash, value: document.querySelector('[data-part="translate-field"] :is(textarea, input)')?.value, scroll: document.querySelector('[data-part="page"]').scrollTop, focused: document.activeElement?.matches?.('[data-part="translate-field"] :is(textarea, input)') }));
    // (The tabs step aside while the keyboard's up, on any page.)
    assert(s.date && (s.tabs || s.focused) && s.value === "" && /^#\/?today$/.test(s.hash), `${what}: not Today as it was: ${JSON.stringify(s)}`);
    return s;
  };
  // Scrolled a little, as it might be.
  await page.setViewportSize({ width: 390, height: 600 }); // short enough for Home to really scroll
  const scrolled = await page.evaluate(() => { const scroller = document.querySelector('[data-part="page"]'); scroller.scrollTop = 24; return scroller.scrollTop; });
  assert(scrolled === 24, `Home should scroll here, and stops at ${scrolled}`);
  await typeIn(page, "boek");
  await settled(page);
  await page.locator('[data-part="app-back"]').tap();
  await page.waitForFunction(() => /^#\/?today$/.test(location.hash));
  const backed = await isToday("Back");
  assert(backed.scroll === scrolled, `Back: Today's scroll was ${scrolled}, now ${backed.scroll}`);
  assert(!backed.focused, "Back should put the keyboard away");
  await page.setViewportSize({ width: 390, height: 844 });
  await typeIn(page, "boek");
  await settled(page);
  await page.goBack();
  await page.waitForFunction(() => /^#\/?today$/.test(location.hash));
  await isToday("the phone's back");
  // The clear button: the page stays, empty, the keyboard up for the next word.
  const stillHere = async (what) => {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => ({ hash: location.hash, value: document.querySelector('[data-part="translate-field"] :is(textarea, input)')?.value, focused: document.activeElement?.matches?.('[data-part="translate-field"] :is(textarea, input)'), date: document.querySelector(".lx-today-date")?.checkVisibility() }));
    assert(/today\/translate/.test(s.hash) && s.value === "" && s.focused && !s.date, `${what}: the page should stay, empty, the keys up: ${JSON.stringify(s)}`);
  };
  await typeIn(page, "boek");
  await settled(page);
  await page.locator('[data-part="translate-clear"]').tap();
  await stillHere("Clear");
  // Deleting everything: the same.
  await page.keyboard.type("hoi");
  await settled(page);
  for (let i = 0; i < 3; i++) await page.keyboard.press("Backspace");
  await stillHere("deleting all");
  // And Back from the empty page: Today as it was.
  await page.locator('[data-part="app-back"]').tap();
  await page.waitForFunction(() => /^#\/?today$/.test(location.hash));
  await isToday("Back from the empty page");
  // A reload on the page: what was typed, and its answer.
  await typeIn(page, "boek");
  await settled(page);
  await page.reload();
  await ready(page);
  await page.waitForSelector(best, { timeout: 15_000 });
  assert((await page.locator(FIELD).inputValue()) === "boek", "a reload lost what was typed");
  assert(await page.evaluate(() => !document.querySelector(".lx-today-date")?.checkVisibility()), "a reload on the page shows Today's parts");
  await page.locator('[data-part="translate-clear"]').tap();
  await page.locator('[data-part="app-back"]').tap();
  await page.waitForFunction(() => /^#\/?today$/.test(location.hash));
  // An empty cold open is Today.
  await page.goto(`${BASE}/app/#today/translate`);
  await ready(page);
  await page.waitForFunction(() => /^#\/?today$/.test(location.hash), null, { timeout: 5000 });
  await isToday("an empty cold open");
  // A word only a pack this device hasn't got has: Find a pack, on a press, lists it, and adding it changes the button.
  await page.waitForSelector(FIELD);
  let packNote = "no opt-in pack given";
  if (OPT_IN) {
    const word = OPT_IN.items.map((item) => item.words[item.gap.index]?.[1]).find((l) => l && /^[a-z]+$/.test(l));
    await typeIn(page, word);
    await settled(page);
    await page.evaluate(() => { document.activeElement?.blur?.(); window.lxKeyboard?.(0); }); // with the keys up there's no room for it
    const button = page.locator(wide, { hasText: "Find a pack" });
    await button.waitFor({ timeout: 15_000 });
    await sheet(page, "13-find-a-pack");
    await openSheet(page);
    const row = page.locator('[data-part="translate-pack"]', { hasText: OPT_IN.name });
    // Right after a publish the server may still be going through the packs: it says so, and a press looks again.
    for (let i = 0; i < 20 && !(await row.count()); i++) {
      await page.waitForTimeout(1500);
      const again = page.locator(".lx-tr-found button", { hasText: "Look again" });
      if (await again.count()) await again.tap();
    }
    await row.waitFor({ timeout: 15_000 });
    await row.locator('[data-part="button"]').tap();
    await page.locator(INLINE).waitFor({ state: "attached", timeout: 30_000 });
    await closeSheet(page);
    assert((await page.locator(FIELD).inputValue()) === word, "adding a pack lost what was typed");
    packNote = `${word}: Find a pack, added`;
  }
  return `Back, the phone's back, Clear and deleting all staying, reload, empty cold open; ${packNote}`;
});

await stage("flags: a change of language never makes a flag anew (a new one draws blank while it loads, a flicker): the names' and the way's flags are the same elements, there and back", async (opened) => {
  const page = await today(opened);
  await typeIn(page, "hoi");
  await settled(page);
  await page.evaluate(() => { document.activeElement?.blur?.(); window.lxKeyboard(0); });
  const flags = () => page.evaluate(() => [...document.querySelectorAll('.lx-today-translate :is(.lx-tr-lang, [data-part="translate-direction"]) img')]);
  // Each flag element seen, kept by the page; one that comes back must be the one it saw before.
  await page.evaluate(() => {
    window.lxFlags = new Map();
    window.lxFresh = 0;
    const look = () => {
      for (const img of document.querySelectorAll('.lx-today-translate :is(.lx-tr-lang, [data-part="translate-direction"]) img')) {
        const key = `${img.closest(".lx-tr-lang-to") ? "to" : img.closest('[data-part="translate-direction"]') ? "way" : "from"}:${img.getAttribute("src")}`;
        if (!window.lxFlags.has(key)) window.lxFlags.set(key, img);
        else if (window.lxFlags.get(key) !== img) window.lxFresh++;
      }
    };
    look();
    new MutationObserver(look).observe(document.querySelector(".lx-today-translate"), { childList: true, subtree: true });
  });
  const press = async () => {
    await page.locator('.lx-way-tab[aria-pressed="false"]').first().tap();
    await settled(page);
  };
  for (let i = 0; i < 4; i++) await press();
  const seen = await page.evaluate(() => ({ fresh: window.lxFresh, kinds: [...window.lxFlags.keys()] }));
  assert(seen.kinds.length >= 2, `no flags to watch: ${JSON.stringify(seen)}`);
  assert(seen.fresh === 0, `a flag made anew on a change of language, ${seen.fresh} times: ${JSON.stringify(seen.kinds)}`);
  return `${seen.kinds.length} flags watched over 4 changes, none made anew`;
});

await stage("motion: the move never blocks a press, and with animations off nothing moves", async (opened) => {
  const page = await today(opened);
  await typeIn(page, "");
  // 3 ms into the move, what's at the Back link and the field is the real thing, and a press lands.
  await page.evaluate(() => {
    const field = document.querySelector('[data-part="translate-field"] :is(textarea, input)');
    field.value = "boek";
    field.dispatchEvent(new InputEvent("input", { bubbles: true }));
  });
  await page.waitForTimeout(3);
  const during = await page.evaluate(() => {
    const at = (n) => {
      const r = n.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    };
    const back = document.querySelector('[data-part="app-back"]');
    return { ghost: Boolean(document.querySelector("[data-ghost]")), hitsBack: Boolean(at(back)?.closest('[data-part="app-back"]')) };
  });
  assert(during.hitsBack, `3 ms in, Back isn't what's under a press: ${JSON.stringify(during)}`);
  await page.locator('[data-part="app-back"]').tap();
  await page.waitForFunction(() => /^#\/?today$/.test(location.hash), null, { timeout: 2000 });
  // Device asking for less motion: no ghost at all.
  const calm = await today(opened, { reducedMotion: "reduce" });
  await calm.locator(FIELD).tap({ position: { x: 24, y: 20 } });
  const none = await calm.evaluate(async () => {
    const field = document.querySelector('[data-part="translate-field"] :is(textarea, input)');
    field.value = "boek";
    field.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(r));
    return { ghost: Boolean(document.querySelector("[data-ghost]")), hidden: Boolean(field.closest("[data-motion-hidden]")) };
  });
  assert(!none.ghost && !none.hidden, `with reduced motion something moved: ${JSON.stringify(none)}`);
  return JSON.stringify(during);
});

await stage("best: a pack's own sentence wins both ways; one word its top reading; several, the word-by-word line, labeled, with what wasn't found marked; nothing, said quietly", async (opened) => {
  const page = await today(opened);
  await typeIn(page, PLAIN.text);
  await settled(page);
  const dutch = await bestText(page);
  assert(dutch.includes(PLAIN.item.means) && !/Rough guess/.test(dutch), `"${PLAIN.text}" should give "${PLAIN.item.means}": ${dutch}`);
  await noAi(page, "a sentence");
  await page.screenshot({ path: `${OUT}/03-page-sentence.png` });
  await sheet(page, "03-sentence");
  await page.locator(FIELD).fill(PLAIN.item.means);
  await settled(page);
  const english = await bestText(page);
  assert(english.includes(PLAIN.text) && !/Rough guess/.test(english), `"${PLAIN.item.means}" should give "${PLAIN.text}": ${english}`);
  // Without its capital or its end mark it's the same sentence.
  await page.locator(FIELD).fill(PLAIN.text.toLowerCase().replace(/[.?!…]+$/, ""));
  await settled(page);
  assert((await bestText(page)).includes(PLAIN.item.means), "a whole sentence typed without its capital and end mark wasn't found");
  await page.locator(FIELD).fill("snowball");
  await settled(page);
  assert((await bestText(page)).includes("sneeuwbal"), `snowball: ${await bestText(page)}`);
  await page.locator(FIELD).fill("ik wil graag een biertje");
  await settled(page);
  const line = await bestText(page);
  assert((await sourceOf(page)) === "Word by word", `no label on a phrase: ${await sourceOf(page)}`);
  assert(/\bI want gladly a beer\b/.test(line), `the word-by-word line: ${line}`);
  await noAi(page, "a phrase");
  await page.screenshot({ path: `${OUT}/04-page-phrase.png` });
  await sheet(page, "04-phrase");
  await page.screenshot({ path: `${OUT}/04-page-phrase-keyboard.png`, clip: { x: 0, y: 0, width: 390, height: 844 - keyboardOf(844) } });
  await page.locator(FIELD).fill("de hond loopt naar huis");
  await settled(page);
  const walks = await bestText(page);
  assert(/\bwalk\b/.test(walks) && !/\bend\b/.test(walks), `loopt should read as lopen: ${walks}`);
  await page.locator(FIELD).fill("ik wil xyzzyq");
  await settled(page);
  const partly = await page.evaluate((best) => ({ marked: [...document.querySelectorAll(`${best} .lx-tr-miss`)].map((n) => n.textContent) }), best);
  assert(partly.marked.includes("xyzzyq"), `what wasn't found isn't marked: ${JSON.stringify(partly)}`);
  await page.locator(FIELD).fill("xyzzyq");
  await none(page).filter({ hasText: "Not in your packs" }).waitFor({ timeout: 15_000 });
  await noAi(page, "nothing found");
  assert(/Find a pack/.test(await page.locator(wide).innerText()), "nothing found should offer to look for a pack, on a press");
  await page.screenshot({ path: `${OUT}/05-page-nothing.png` });
  await sheet(page, "05-nothing");
  return `"${PLAIN.text}" ⇄ "${PLAIN.item.means}"; ${line.split("\n")[0]}`;
});

// A word the language always capitalizes (study/written.js: Engels) shown as it writes it wherever Translate's engine hands back its key; and
// when the decision changes with nothing typed (a book on the device writing it lowercase mid-sentence vetoes the capital: onWritten), the
// answer on the screen follows, and comes back once the book is gone.
await stage("written: a word the language always capitalizes is shown as written (Engels), never as its key: the best guess from English, everything shown for the word typed as its key, and the word-by-word line; a changed decision followed on the screen with no key, both ways; the page before this shows the key, and keeps what it drew", async (opened) => {
  const W = await import(new URL("../public/js/study/written.js", import.meta.url));
  // From the pack files: the words they capitalize in every place mid-sentence, each with a plain English gloss in a pack's glossary.
  const tally = W.writingTally("nl");
  for (const pack of PACKS) for (const item of pack.items ?? []) if (Array.isArray(item.words)) tally.add(item.words);
  const forms = W.writtenForms([tally.done()], "nl");
  const glossOf = (lemma) => PACKS.map((pack) => pack.words?.[lemma]).find((gloss) => typeof gloss === "string");
  const english = (lemma) => glossOf(lemma)?.split(/[;,(]/)[0].trim();
  const usable = (lemma) => forms.get(lemma) && forms.get(lemma) !== lemma && /^[A-Za-z]+$/.test(english(lemma) ?? "");
  const picked = ["engels", "nederlands", "duits", "frans"].filter(usable);
  assert(picked.length >= 2, `the packs have too few words they always capitalize with a plain English gloss: ${picked.join(", ")}`);
  const [one, two] = picked;
  const page = await today(opened);
  // The device decides the same from its packs, and it isn't the key (else nothing here could fail). Its decision comes once content.js has
  // built its view from the packs (setPackWriting), a little after they're stored: waited for, 60 s at most.
  const device = await page.evaluate(async ([lemmas, want]) => {
    const w = await import("/js/study/written.js");
    let got = lemmas.map((l) => w.writtenOf("nl", l));
    for (const t0 = performance.now(); got.join() !== want.join() && performance.now() - t0 < 60_000; got = lemmas.map((l) => w.writtenOf("nl", l))) await new Promise((r) => setTimeout(r, 200));
    return got;
  }, [[one, two], [forms.get(one), forms.get(two)]]);
  assert(device[0] === forms.get(one) && device[1] === forms.get(two) && device[0] !== one, `the device writes ${one}, ${two} as ${device.join(", ")}; the packs say ${forms.get(one)}, ${forms.get(two)}`);
  const shows = (text, lemma) => new RegExp(`(^|[^\\p{L}])${forms.get(lemma)}([^\\p{L}]|$)`, "u").test(text) && !new RegExp(`(^|[^\\p{L}])${lemma}([^\\p{L}]|$)`, "u").test(text);
  // English to the word: one word, its top reading.
  await typeIn(page, english(one));
  await answered(page);
  await settled(page);
  const fromEnglish = await bestText(page);
  assert(shows(fromEnglish, one), `"${english(one)}" should show ${forms.get(one)}, not ${one}: ${JSON.stringify(fromEnglish)}`);
  // The word typed as its key: the best guess says what it means, and nothing Translate shows has the key (a word the packs always
  // capitalize is never written so: lowercase there, it's the key leaking), while the word itself is there as written.
  await page.locator(FIELD).fill(one);
  await answered(page);
  await settled(page);
  const typedKey = await page.evaluate(() => [...document.querySelectorAll(".lx-today-translate [data-part=translate-result], .lx-today-translate .lx-tr-results")].map((n) => n.innerText).join("\n"));
  assert(shows(typedKey, one), `"${one}" typed: what Translate shows should have ${forms.get(one)} and never ${one}: ${JSON.stringify(typedKey.slice(0, 600))}`);
  // Two of them from English: the word-by-word line, each as written.
  await page.locator(FIELD).fill(`${english(one)} ${english(two)}`);
  await answered(page);
  await settled(page);
  const line = await bestText(page);
  assert((await sourceOf(page)) === "Word by word" && shows(line, one) && shows(line, two), `"${english(one)} ${english(two)}" word by word should show ${forms.get(one)} ${forms.get(two)} (${await sourceOf(page)}): ${JSON.stringify(line)}`);
  await page.screenshot({ path: `${OUT}/written-line.png` });
  // The decision changed with nothing typed: a book noted on the device with the word lowercase mid-sentence (written.js noteBook) vetoes the
  // packs' capital, and the answer up follows within a moment; the book forgotten, the capital comes back. Read from the best answer each
  // 100 ms, 3 s at most, the field untouched throughout.
  const key = (lemma) => new RegExp(`(^|[^\\p{L}])${lemma}([^\\p{L}]|$)`, "u");
  const asKey = (text, lemma) => key(lemma).test(text) && !new RegExp(`(^|[^\\p{L}])${forms.get(lemma)}([^\\p{L}]|$)`, "u").test(text);
  await page.locator(FIELD).fill(english(one));
  await answered(page);
  await settled(page);
  assert(shows(await bestText(page), one), `"${english(one)}" again should show ${forms.get(one)}: ${JSON.stringify(await bestText(page))}`);
  const typed = await page.locator(FIELD).inputValue();
  const follows = async (want) => {
    const t0 = Date.now();
    while (Date.now() - t0 < 3_000) {
      if (want(await bestText(page))) return Date.now() - t0;
      await page.waitForTimeout(100);
    }
    return null;
  };
  await page.evaluate((lemma) => import("/js/study/written.js").then((w) => w.noteBook("nl", "check-veto", [[["Hij", "hij"], ["leert", "leren"], [lemma, lemma], ["op", "op"], ["school.", "school"]]])), one);
  const vetoed = await follows((text) => asKey(text, one));
  assert(vetoed !== null, `a book with "${one}" lowercase noted, and the answer up still says ${JSON.stringify(await bestText(page))} after 3 s (it should follow the decision: ${one})`);
  await page.evaluate(() => import("/js/study/written.js").then((w) => w.forgetBook("nl", "check-veto")));
  const back = await follows((text) => shows(text, one));
  assert(back !== null, `the book forgotten, and the answer up still says ${JSON.stringify(await bestText(page))} after 3 s (it should say ${forms.get(one)} again)`);
  assert((await page.locator(FIELD).inputValue()) === typed, "the field changed while the decision did");
  return `${english(one)} → ${fromEnglish.split("\n")[0]}; ${one} → ${typedKey.split("\n")[0]}; ${line.split("\n")[0]}; a book writing ${one} lowercase: the answer up as ${one} in ${vetoed} ms, ${forms.get(one)} again ${back} ms after it's gone, nothing typed`;
});

await stage("spelled: a word on both sides never leads with what was typed: a commoner word, or one word said so, or one reading with the other a press away", async (opened) => {
  const page = await today(opened);
  await typeIn(page, "");
  const out = [];
  for (const row of SAME_SPELLING) {
    await page.locator(FIELD).fill(row.word);
    await settled(page, 500);
    const seen = await page.locator(best).evaluate((node) => ({ variant: node.getAttribute("data-variant"), text: node.innerText, big: node.querySelector(".lx-tr-big")?.innerText.trim() ?? "", said: node.querySelector(".lx-tr-said")?.textContent.trim() ?? "" }));
    out.push(`${row.word}: ${seen.text.replace(/\s+/g, " ").slice(0, 70)}`);
    const big = seen.big.toLowerCase();
    if (row.lead) {
      assert(row.lead.includes(big), `"${row.word}" should lead with ${row.lead.join(" or ")}, and leads with "${seen.big}"`);
      assert(big !== row.word, `"${row.word}" leads with what was typed`);
    } else if (row.same) {
      assert((await sourceOf(page)) === "The same word in both", `"${row.word}" should say it's the same word: ${await sourceOf(page)}, ${seen.text}`);
    } else {
      // One reading, the bubble on one flag; the other reading under the button.
      assert(seen.variant !== "two", `"${row.word}" shows two readings: ${seen.text}`);
      assert((await page.locator('.lx-way-tab[aria-pressed="true"]').count()) === 1, `"${row.word}": the bubble should be on one flag`);
      assert(row.two.some((part) => seen.text.toLowerCase().includes(part)), `"${row.word}" should say one of ${row.two}: ${seen.text}`);
      await openPacks(page);
      const inSheet = (await page.locator(INLINE).innerText()).toLowerCase();
      await closePacks(page);
      assert(row.two.every((part) => inSheet.includes(part) || seen.text.toLowerCase().includes(part)), `"${row.word}": the other reading isn't under the answer: ${inSheet.slice(0, 200)}`);
    }
    // The other words: what the table says comes first, and no separated verb for a word typed alone.
    if (row.firstGuess || row.guess || row.noGuess) {
      const has = (await page.locator(INLINE).count()) > 0;
      assert(has || !(row.firstGuess || row.guess), `"${row.word}" has nothing under the answer`);
      let said = [];
      if (has) {
        await openPacks(page);
        // (The other language's reading of the same letters says "As …", and stands apart from these.)
        said = await page.locator(`${INLINE} [data-part="translate-result"]`).evaluateAll((rows) => rows.filter((row) => !/^As /.test(row.textContent)).map((row) => row.querySelector(".lx-tr-said")?.textContent ?? ""));
        await closePacks(page);
      }
      if (!row.same && said[0]?.toLowerCase() === big) said.shift(); // the answer itself, listed first
      if (row.firstGuess) assert(said[0] === row.firstGuess, `"${row.word}": ${row.firstGuess} should come first among its other words: ${said}`);
      if (row.guess) assert(said.includes(row.guess), `"${row.word}" should list ${row.guess}: ${said}`);
      for (const not of row.noGuess ?? []) assert(!said.includes(not), `"${row.word}" typed alone lists ${not}: ${said}`);
    }
    await noAi(page, row.word);
  }
  await page.locator(FIELD).fill("hi");
  await settled(page, 500);
  await sheet(page, "02-word");
  await page.locator(FIELD).fill("room");
  await settled(page, 500);
  await sheet(page, "14-two-words");
  await page.locator(FIELD).fill("water");
  await settled(page, 500);
  await sheet(page, "15-same-word");
  return `${SAME_SPELLING.length} words; ${out.slice(0, 3).join("; ")}`;
});

await stage("packs: what your packs have, under the answer in place (no button, no sheet): the sentences, today's other matches, the other words; kept while it says the same", async (opened) => {
  const page = await today(opened);
  await typeIn(page, "hi");
  await settled(page);
  assert(!(await page.locator(wide).count()), `a wide button beside what's under the answer: ${await page.locator(wide).allInnerTexts()}`);
  await openPacks(page);
  const title = await page.locator(`${INLINE} .lx-tr-inline-title`).innerText();
  assert(title === "In your packs", `its title: ${title}`);
  const width = await page.evaluate(() => [document.querySelector(".lx-today-translate .lx-tr-inline").getBoundingClientRect().width, document.querySelector(".lx-tr-results").getBoundingClientRect().width]);
  assert(Math.abs(width[0] - width[1]) < 2, `not the full width: ${width}`);
  const answerBottom = await page.evaluate(() => document.querySelector('[data-part="translate-result"][data-state="best"]')?.getBoundingClientRect().bottom ?? -1);
  const sectionTop = await page.evaluate(() => document.querySelector(".lx-today-translate .lx-tr-inline").getBoundingClientRect().top);
  assert(sectionTop >= answerBottom, `not under the answer: answer ends ${answerBottom}, it starts ${sectionTop}`);
  const rows = page.locator(`${INLINE} [data-part="translate-result"]`);
  await rows.first().waitFor({ timeout: 500 });
  const sentences = await page.locator(`${INLINE} [data-part="sentence-row"]`).count();
  assert(sentences >= 1 && sentences <= 6, `${sentences} sentences under hi's answer`);
  const said = await rows.locator(".lx-tr-said").allInnerTexts();
  assert(said.includes("hallo") || said.includes("hoi"), `neither hallo nor hoi is among hi's other words: ${said}`);
  // The credits a tap away, folded.
  const fold = page.locator(`${INLINE} .lx-tr-credits`);
  assert((await fold.count()) === 1 && !(await fold.evaluate((n) => n.open)), "the credits aren't folded under the sentences");
  await noAi(page, "what your packs have");
  await page.screenshot({ path: `${OUT}/06-page-packs.png` });
  await sheet(page, "06-packs");
  // Kept while it says the same: a key that changes nothing it shows (a space after hi) draws none of it again.
  await page.evaluate(() => (globalThis.__packsNode = document.querySelector(".lx-today-translate .lx-tr-inline")));
  await page.locator(FIELD).focus();
  await page.keyboard.type(" ");
  await settled(page);
  const kept = await page.evaluate(() => globalThis.__packsNode === document.querySelector(".lx-today-translate .lx-tr-inline") && globalThis.__packsNode.isConnected);
  assert(kept, "a key that changed nothing under the answer drew it again");
  // A phrase: the other readings of its words, each saying which word.
  await page.locator(FIELD).fill("de hond loopt naar huis");
  await settled(page);
  await openPacks(page);
  const phrase = await page.locator(INLINE).innerText();
  await closePacks(page);
  assert(/aflopen/.test(phrase) && /loopt/.test(phrase), `loopt's other reading isn't there: ${phrase.slice(0, 300)}`);
  // Sentences that say the same: the other one is there too.
  if (REPEATED) {
    await page.locator(FIELD).fill(REPEATED);
    await settled(page);
    const others = SENTENCES.filter((s) => s.item.means === REPEATED).map((s) => s.text);
    await openPacks(page);
    const inside = await page.locator(INLINE).innerText();
    await closePacks(page);
    assert(others.filter((t) => inside.includes(t)).length >= 1, `"${REPEATED}": another sentence isn't there: ${inside.slice(0, 300)}`);
  }
  return `hi: ${said.join(", ")}; repeated: ${REPEATED ?? "none in these packs"}`;
});

await stage("words: the main words, little ones left out, each with its meaning and sentences that really use it, what you've studied first", async (opened) => {
  const page = await today(opened);
  await typeIn(page, "ik wil graag een biertje");
  await settled(page);
  // Scrolling what's found puts the keyboard away, to read it.
  const box = await page.locator(".lx-tr-scroll").boundingBox();
  const touch = await page.context().newCDPSession(page);
  const at = { x: box.x + box.width / 2, y: box.y + Math.min(box.height - 10, 120) };
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: at.x, y: at.y - 40 }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert(await page.evaluate(() => !document.activeElement?.matches?.('[data-part="translate-field"] :is(textarea, input)')), "scrolling what's found kept the keyboard up");
  await openPacks(page);
  const read = () => page.evaluate(() => [...document.querySelectorAll('[data-part="translate-word"]')].map((n) => ({ name: n.querySelector(".lx-tr-word-name")?.textContent, meaning: n.querySelector(".lx-tr-word-meaning")?.textContent, sentences: [...n.querySelectorAll(".lx-sentence-nl")].map((s) => s.textContent), studied: [...n.querySelectorAll(".lx-tr-studied")].length, more: n.querySelector(".lx-tr-word-more")?.textContent ?? null })));
  const words = await read();
  const names = words.map((w) => w.name);
  assert(names.includes("biertje") && names.includes("graag"), `main words: ${names}`);
  assert(!names.includes("ik") && !names.includes("een"), `little words among them: ${names}`);
  for (const w of words) {
    assert(w.meaning === GLOSS.get(w.name), `${w.name}'s meaning: "${w.meaning}", the packs say "${GLOSS.get(w.name)}"`);
    assert(w.sentences.length > 0 && w.sentences.length <= 2, `${w.name}: ${w.sentences.length} sentences at first`);
    for (const text of w.sentences) assert(usesLemma(text, w.name), `"${text}" doesn't use ${w.name}`);
  }
  await noAi(page, "the main words");
  await page.screenshot({ path: `${OUT}/07-page-words.png`, fullPage: false });
  await sheet(page, "07-main-words");
  const withMore = words.find((w) => w.more);
  assert(withMore, "no word has more sentences to show");
  const moreOf = page.locator('[data-part="translate-word"]', { has: page.locator(".lx-tr-word-name", { hasText: new RegExp(`^${withMore.name}$`) }) });
  await moreOf.locator(".lx-tr-word-more").tap();
  assert((await moreOf.locator(".lx-sentence-nl").count()) > 2, "More showed nothing more");
  // Studied: a sentence you've met comes first, and says so.
  const target = SENTENCES.filter((s) => s.item.words.some(([, l]) => l === "graag") && s.item.words[s.item.gap?.index]?.[1] !== "graag").at(-1);
  await page.evaluate(async ({ pack, id }) => {
    const progress = await import("/js/study/progress.js");
    const content = await import("/js/study/content.js");
    const item = content.itemById.get(`${pack}/${id}`) ?? content.itemById.get(id);
    progress.record([{ concept: "w:graag", outcome: "right", test: "recall", skill: "read", activity: "arrange", item: item.id }]);
  }, { pack: target.pack, id: target.item.id });
  await closePacks(page);
  await page.locator(FIELD).fill("");
  await page.locator(FIELD).fill("ik wil graag een biertje");
  await settled(page);
  await openPacks(page);
  const again = (await read()).find((w) => w.name === "graag");
  assert(again.sentences[0] === target.text, `the studied sentence isn't first: "${again.sentences[0]}", wanted "${target.text}"`);
  assert(again.studied === 1, "it doesn't say it's been studied");
  await page.screenshot({ path: `${OUT}/08-page-studied.png` });
  await page.locator('[data-part="translate-word"]', { has: page.locator(".lx-tr-studied") }).first().evaluate((n) => n.scrollIntoView({ block: "center" }));
  await sheet(page, "08-studied");
  // One word: its sentences together, up to 6, its own first.
  await closePacks(page);
  await page.locator(FIELD).fill("biertje");
  await settled(page);
  await openPacks(page);
  const flat = await page.locator(`${INLINE} .lx-sentence-nl`).allInnerTexts();
  await closePacks(page);
  assert(flat.length >= 1 && flat.length <= 6 && flat.every((text) => usesLemma(text, "biertje")), `biertje's sentences: ${flat}`);
  return `${names.join(", ")}; studied first: "${target.text}"`;
});

// A start of the app with the word packs already on the device: its first query mustn't wait for this device's index (every
// pack copied into the worker and indexed: 23.7 s once on an Android phone) when the server can answer. The worker's script
// held 15 s stands in for an index that slow; once it's let go, the device's own come in and the answer stays.
await stage("cold: the first query after a start, while this device's index is still being made, answered by the server; then the device's own", async (opened) => {
  const page = await today(opened);
  let release = () => {};
  const held = new Promise((done) => (release = done));
  await page.context().route("**/js/translate/worker.js*", async (route) => {
    await held;
    await route.continue();
  });
  try {
    await page.reload();
    await ready(page);
    await page.waitForSelector(FIELD, { timeout: 30_000 });
    const at = Date.now();
    await typeIn(page, "tea");
    let first = null;
    while (Date.now() - at < 15_000) {
      if (/\bthee\b/i.test(await page.locator(RESULTS).innerText().catch(() => ""))) {
        first = Date.now() - at;
        break;
      }
      await page.waitForTimeout(100);
    }
    assert(first !== null && first < 6_000, `nothing for "tea" ${first === null ? "in 15 s" : `until ${first} ms`}, while this device's index was being made`);
    release();
    // The index, once the worker's here: this device knows the word, and the page still says it.
    const known = await page.evaluate(async () => (await import("/js/translate/translate.js")).knownShare("thee", "nl"));
    assert(known > 0, "this device's index never came");
    await settled(page);
    assert(/\bthee\b/i.test(await page.locator(RESULTS).innerText()), "the answer went once the device's own came in");
    return `"tea" answered in ${first} ms with the worker held; then the device's index`;
  } finally {
    release();
  }
});

// Translate's index workers, watched from the page: each one's messages both ways with their times, and when it was stopped.
const watchIndexWorkers = `(() => {
  const Real = window.Worker;
  window.lxIndexWorkers = [];
  window.Worker = class extends Real {
    constructor(url, options) {
      super(url, options);
      if (!String(url).includes("/js/translate/worker.js")) return;
      const one = { at: performance.now(), posts: [], said: [], ended: null };
      window.lxIndexWorkers.push(one);
      this.addEventListener("message", ({ data }) => one.said.push({ type: data?.type, t: performance.now(), languages: data && "languages" in data ? data.languages : undefined }));
      const post = this.postMessage.bind(this);
      this.postMessage = (data, ...rest) => (one.posts.push({ type: data?.type, t: performance.now() }), post(data, ...rest));
      const terminate = this.terminate.bind(this);
      this.terminate = () => ((one.ended = performance.now()), terminate());
    }
  };
})();`;
/** The key of the index kept on this device, once there is one (never opening the database before the worker has made it). */
const keptIndexKey = (page) =>
  page.evaluate(async () => {
    for (let i = 0; i < 300; i++) {
      if ((await indexedDB.databases()).some((d) => d.name === "lexicommons-translate-index")) {
        const key = await new Promise((resolve) => {
          const request = indexedDB.open("lexicommons-translate-index");
          request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("index")) return db.close(), resolve(null);
            const get = db.transaction("index").objectStore("index").get("key");
            get.onsuccess = () => (db.close(), resolve(get.result ?? null));
            get.onerror = () => (db.close(), resolve(null));
          };
          request.onerror = () => resolve(null);
        });
        if (key) return key;
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  });

await stage("kept: Translate left, its index's worker goes a minute on; opened again, the index kept on this device is read back (no pack sent across) and answers as before; at 4×, the reopen timed against the first build", async (opened) => {
  const page = await today(opened, { init: watchIndexWorkers });
  await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: 4 });
  // Opened: the index made from the packs, then kept.
  const firstAt = await page.evaluate(() => performance.now());
  await typeIn(page, "tea");
  await page.waitForFunction(() => window.lxIndexWorkers[0]?.said.some((m) => m.type === "built"), null, { timeout: 120_000, polling: 250 });
  await settled(page);
  const before = await page.locator(RESULTS).innerText();
  assert(/\bthee\b/i.test(before), `"tea" never found "thee": ${before.slice(0, 200)}`);
  const key = await keptIndexKey(page);
  assert(key, "no index kept on this device after it was built");
  const first = await page.evaluate(() => window.lxIndexWorkers[0]);
  const firstBuilt = Math.round(first.said.find((m) => m.type === "built").t - firstAt);
  // Left.
  await page.locator('[data-part="app-back"]').tap();
  await page.waitForFunction(() => /^#\/?today$/.test(location.hash));
  const leftAt = await page.evaluate(() => performance.now());
  await page.waitForFunction(() => window.lxIndexWorkers[0].ended !== null, null, { timeout: 120_000, polling: 1000 });
  const gone = Math.round((await page.evaluate(() => window.lxIndexWorkers[0].ended)) - leftAt);
  assert(gone >= 55_000 && gone <= 75_000, `the worker went ${gone} ms after Translate was left, not about a minute`);
  await page.waitForTimeout(500);
  const alive = page.workers().filter((w) => w.url().includes("/js/translate/worker.js")).length;
  assert(alive === 0, `${alive} index worker still running after it was let go`);
  assert((await page.evaluate(() => window.lxIndexWorkers.length)) === 1, "another index worker started while Translate was closed");
  // Opened again: read back, nothing sent.
  const againAt = await page.evaluate(() => performance.now());
  await typeIn(page, "tea");
  await page.waitForFunction(() => window.lxIndexWorkers[1]?.said.some((m) => m.type === "loaded" || m.type === "built"), null, { timeout: 120_000, polling: 100 });
  await settled(page);
  const after = await page.locator(RESULTS).innerText();
  const again = await page.evaluate(() => window.lxIndexWorkers[1]);
  const posted = [...new Set(again.posts.map((m) => m.type))];
  const loaded = again.said.find((m) => m.type === "loaded");
  assert(loaded && Array.isArray(loaded.languages) && loaded.languages.includes("nl"), `the kept index wasn't read back: ${JSON.stringify(again.said.slice(0, 3))}`);
  assert(!posted.some((type) => ["begin", "source", "more", "end"].includes(type)), `a pack was sent across again: ${posted.join(", ")}`);
  assert(/\bthee\b/i.test(after), `"tea" read back never found "thee": ${after.slice(0, 200)}`);
  const known = await page.evaluate(async () => (await import("/js/translate/translate.js")).knownShare("thee", "nl"));
  assert(known > 0, "the index read back doesn't know thee");
  const reopened = Math.round(loaded.t - againAt);
  return `at 4×: first open's index ${firstBuilt} ms from the tap; the worker gone ${(gone / 1000).toFixed(1)} s after Translate was left; reopened, read back in ${reopened} ms from the tap (${posted.join(", ")} sent), the same answer`;
});

await stage("read: a book open in the reader holds Translate's index for its word lookups (still there past the minute while you read); closed and left for Study, its worker goes a minute on; the book opened again, a word looked up answers from the index read back, no pack sent across", async (opened) => {
  const page = await today(opened, { init: watchIndexWorkers });
  // A text of the learner's own in Dutch: a tap on a word looks it up as Translate does (reader.js lookUpOwn).
  const id = await page.evaluate(async () => {
    const { bookFromText } = await import("/js/read/import-text.js");
    const store = await import("/js/read/store.js");
    const book = await bookFromText("Het huis is groot. De hond loopt naar huis. Ik wil graag een boek lezen.", { title: "Translate check", lang: "nl" });
    await store.addBook(book);
    return book.id;
  });
  const READER = '[data-part="reader"]';
  const SAID = `${READER} [data-part="word-popover"] [role="status"]`;
  const lookUp = async (word) => {
    if (!(await page.evaluate((r) => location.hash === r, `#read/book/${id}`))) await page.evaluate((r) => (location.hash = r), `#read/book/${id}`);
    const span = page.locator(`${READER} .lx-w`, { hasText: new RegExp(`^\\s*${word}[.,]?\\s*$`) }).first();
    await span.waitFor({ timeout: 30_000 });
    await span.tap();
    await page.locator(SAID).waitFor({ timeout: 5000 });
    await page.waitForFunction((s) => !/Looking it up/.test(document.querySelector(s)?.textContent ?? "Looking it up"), SAID, { timeout: 60_000, polling: 200 });
    return page.locator(SAID).innerText();
  };
  const workers = () => page.evaluate(() => window.lxIndexWorkers.map((w) => ({ posts: [...new Set(w.posts.map((m) => m.type))], said: w.said.map((m) => ({ type: m.type, languages: m.languages })), ended: w.ended })));
  const house = await lookUp("huis");
  assert(/house|home/i.test(house), `"huis" in the reader: ${house}`);
  await page.waitForFunction(() => window.lxIndexWorkers[0]?.said.some((m) => m.type === "built" || m.type === "loaded"), null, { timeout: 60_000, polling: 250 });
  // Reading on, past the minute: the book holds it.
  await page.waitForTimeout(70_000);
  assert((await workers())[0].ended === null, "the index's worker went while the book was open");
  // Closed and left for Study.
  await page.evaluate(() => (location.hash = "#study"));
  await page.waitForFunction(() => !document.querySelector('[data-part="reader"]'), null, { timeout: 10_000 });
  const leftAt = await page.evaluate(() => performance.now());
  await page.waitForFunction(() => window.lxIndexWorkers[0].ended !== null, null, { timeout: 120_000, polling: 1000 });
  const gone = Math.round((await page.evaluate(() => window.lxIndexWorkers[0].ended)) - leftAt);
  assert(gone >= 50_000 && gone <= 75_000, `the worker went ${gone} ms after Read was left, not about a minute`);
  assert((await workers()).length === 1, "another index worker started while Read was left");
  // The book again: a word looked up from the index kept on this device.
  const dog = await lookUp("hond");
  assert(/dog/i.test(dog), `"hond" in the reader after a return: ${dog}`);
  const again = (await workers())[1];
  assert(again, "no index worker for the lookup after the return");
  const loaded = again.said.find((m) => m.type === "loaded");
  assert(loaded && Array.isArray(loaded.languages) && loaded.languages.includes("nl"), `the kept index wasn't read back: ${JSON.stringify(again.said.slice(0, 3))}`);
  assert(!again.posts.some((type) => ["begin", "source", "more", "end"].includes(type)), `a pack was sent across again: ${again.posts.join(", ")}`);
  return `"huis": ${house}; held past the minute while the book was open; gone ${(gone / 1000).toFixed(1)} s after Read was left; back in the book, "hond": ${dog} (${again.posts.join(", ")} sent)`;
});

let burstDuring = null;
await stage("burst: packs arriving in a burst while Translate's index is up (an AI's four packs, then a 3,000-card deck) make one new index once they're quiet, not one each, keys typed while it's made answered before it (the server's way, online), and it answers as an index made fresh", async (opened) => {
  const page = await today(opened, { init: watchIndexWorkers });
  await typeIn(page, "tea");
  await page.waitForFunction(() => window.lxIndexWorkers[0]?.said.some((m) => m.type === "built"), null, { timeout: 120_000, polling: 250 });
  await settled(page);
  const builds = () => page.evaluate(() => window.lxIndexWorkers.reduce((n, w) => n + w.said.filter((m) => m.type === "built").length, 0));
  const before = await builds();
  // The box emptied and quiet first (a look puts the new index off until typing pauses: translate.js TYPING_QUIET), and every key from here
  // on recorded with when its result came (the results' data-query), for the keys typed while the new index is made, below.
  await page.locator(FIELD).fill("");
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    window.lxBurstKeys = [];
    window.lxBurstSaved = performance.now();
    const field = document.querySelector('[data-part="translate-field"] :is(textarea, input)');
    const results = document.querySelector(".lx-today-translate .lx-tr-results");
    field.addEventListener("input", () => window.lxBurstKeys.push({ query: field.value.trim(), t: performance.now(), answered: null }), true);
    new MutationObserver(() => {
      for (const key of window.lxBurstKeys) if (key.answered === null && results.dataset.query === key.query) key.answered = performance.now();
    }).observe(results, { attributes: true, attributeFilter: ["data-query"], childList: true, subtree: true });
  });
  // As mem-share.mjs saves them (G10's measure): each a pack arriving (packs.savePack), one after another. The first carries a word no other
  // pack has in its glossary, which the new index must have: the AI's packs say the starter's sentences, which it has already, and the engine
  // never reads a deck's plain cards (engine.js buildIndex).
  await page.evaluate(async () => {
    const packs = await import("/js/study/packs.js");
    const { BUILT_IN } = await import("/js/packs/index.js");
    const { newPack, simpleItem } = await import("/js/study/pack-authoring.js");
    for (let n = 0; n < 4; n++) {
      const pack = structuredClone(BUILT_IN.find((p) => p.language === "nl") ?? BUILT_IN[0]);
      pack.id = `burst-pack-${n}`;
      pack.name = `Burst pack ${n + 1}`;
      delete pack.builtIn;
      if (n === 0) pack.words = { ...pack.words, burstwoordje: "burst word" };
      await packs.savePack(pack, { by: "Claude" });
    }
    const deck = newPack({ id: "burst-deck", name: "Burst deck", language: "nl", from: "en" });
    const taken = new Set();
    for (let n = 0; n < 3000; n++) {
      const { item } = simpleItem({ text: `woord${n} zin nummer ${n}`, means: `word ${n} sentence number ${n}` }, { language: "nl", taken });
      if (item) (taken.add(item.id), deck.items.push(item));
    }
    await packs.savePack(deck, { by: "An Anki deck" });
  });
  // Keys typed while the new index is made (from the worker's "end", the old index let go first: G10): online, they go the server's way
  // meanwhile (translate.js rebuilding), so one is answered before the new index is built; waiting for it, a key took the build's whole
  // time (~125 ms of a slowed phone's worker, more for this burst, 9 Nov 2026).
  await page.waitForFunction(() => window.lxIndexWorkers.some((w) => w.posts.some((p) => p.type === "end" && p.t > window.lxBurstSaved)), null, { timeout: 120_000, polling: 20 });
  await page.keyboard.type("de hond", { delay: 60 });
  // Quiet: the one new index, made once (translate.js QUIET), then nothing more.
  await page.waitForFunction((n) => window.lxIndexWorkers.reduce((k, w) => k + w.said.filter((m) => m.type === "built").length, 0) > n, before, { timeout: 120_000, polling: 250 });
  await page.waitForTimeout(1500);
  const during = await page.evaluate(() => {
    const ended = Math.min(...window.lxIndexWorkers.flatMap((w) => w.posts.filter((p) => p.type === "end" && p.t > window.lxBurstSaved).map((p) => p.t)));
    const built = Math.min(...window.lxIndexWorkers.flatMap((w) => w.said.filter((m) => m.type === "built" && m.t > ended).map((m) => m.t)));
    const keys = window.lxBurstKeys.filter((k) => k.query && k.t >= ended && k.t < built);
    return { building: Math.round(built - ended), keys: keys.length, before: keys.filter((k) => k.answered !== null && k.answered < built).length, waits: keys.map((k) => (k.answered === null ? null : Math.round(k.answered - k.t))) };
  });
  assert(during.keys >= 1, `no key typed while the new index was made (it took ${during.building} ms): nothing to judge`);
  assert(during.before >= 1, `none of the ${during.keys} keys typed while the new index was made (${during.building} ms) was answered before it was built: each waited for it (${during.waits.map((w) => w ?? "never").join(", ")} ms)`);
  await page.waitForTimeout(6000);
  const made = (await builds()) - before;
  assert(made === 1, `the burst made ${made} new indexes, not one`);
  burstDuring = during;
  const QUERIES = ["huis", "tea", "burstwoordje", "ik wil graag een biertje"];
  const answers = async () => {
    const out = [];
    // This device's own answer (onLocal), whole: what the index says, nothing from the server.
    for (const q of QUERIES)
      out.push(
        await page.evaluate(async (q) => {
          let local = null;
          await (await import("/js/translate/translate.js")).translate(q, { from: "nl", to: "en" }, { onLocal: (r) => (local = r) }).catch(() => {});
          return JSON.stringify(local, (_, v) => (v instanceof Set ? [...v].sort() : v instanceof Map ? [...v] : v));
        }, q),
      );
    return out;
  };
  const afterBurst = await answers();
  assert(/burst word/.test(afterBurst[2] ?? ""), `the burst's packs aren't in the index after it: ${afterBurst[2]}`);
  // The same answers from an index made fresh (the page again, every pack stored).
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await typeIn(page, "tea");
  await page.waitForFunction(() => window.lxIndexWorkers.at(-1)?.said.some((m) => m.type === "built" || m.type === "loaded"), null, { timeout: 120_000, polling: 250 });
  const fresh = await answers();
  assert(JSON.stringify(afterBurst) === JSON.stringify(fresh), `answers after the burst differ from a fresh index's:\n${afterBurst.join("\n")}\n---\n${fresh.join("\n")}`);
  // Translate left by taking another tab while it's open (Home's page kept off the screen with Translate up: held by no page in view), its worker
  // waiting out its minute: a pack arriving makes no index for no one; Translate used again makes it, once. (The kept stage leaves by Back.)
  await settled(page);
  const leftAt = await builds();
  await page.evaluate(() => (location.hash = "#study"));
  await page.waitForTimeout(1000);
  await page.evaluate(async () => {
    const packs = await import("/js/study/packs.js");
    const { BUILT_IN } = await import("/js/packs/index.js");
    const late = structuredClone(BUILT_IN.find((p) => p.language === "nl") ?? BUILT_IN[0]);
    Object.assign(late, { id: "burst-late", name: "Late pack", words: { ...late.words, laatwoordje: "late word" } });
    delete late.builtIn;
    await packs.savePack(late, { by: "Claude" });
  });
  await page.waitForTimeout(6000); // past QUIET and the keep's wait
  const whileLeft = (await builds()) - leftAt;
  assert(whileLeft === 0, `a pack arriving while Translate was left made ${whileLeft} new index(es) for no one`);
  const late = await page.evaluate(async () => {
    let local = null;
    await (await import("/js/translate/translate.js")).translate("laatwoordje", { from: "nl", to: "en" }, { onLocal: (r) => (local = r) }).catch(() => {});
    return JSON.stringify(local);
  });
  assert(/late word/.test(late ?? ""), `used again, the new pack isn't in the index: ${late}`);
  const onUse = (await builds()) - leftAt;
  assert(onUse === 1, `used again, it made ${onUse} new indexes, not one`);
  return `the burst (4 packs and a deck of 3,000) made 1 new index; while it was made (${burstDuring.building} ms) ${burstDuring.before} of the ${burstDuring.keys} keys typed were answered before it, each in ${burstDuring.waits.map((w) => w ?? "never").join(", ")} ms; ${QUERIES.length} answers the same as a fresh index's; Translate left, a pack arriving made none, and the next use made 1 that has it`;
});

// A rebuild never takes away what's on the screen (the director, 7 Nov 2026): an answer showing when packs arrive stays as it is, frame by
// frame, through the new index's "built" and the look again after it; only a new look waits for an index. The control, in the same run: a
// rebuild that empties the results for a moment (planted on the page) is what the frames catch.
await stage("hold: an answer on the screen stays put through a rebuild: a burst of packs arrives, the new index is made, and the shown answer's text and box are the same in every frame through \"built\" and the look again; a rebuild that resets the view (planted) is caught", async (opened) => {
  const page = await today(opened, { init: watchIndexWorkers });
  await typeIn(page, "huis");
  await page.waitForFunction(() => window.lxIndexWorkers[0]?.said.some((m) => m.type === "built"), null, { timeout: 120_000, polling: 250 });
  await settled(page);
  const builds = () => page.evaluate(() => window.lxIndexWorkers.reduce((n, w) => n + w.said.filter((m) => m.type === "built").length, 0));
  // Every frame: the best answer's text and box.
  const record = () =>
    page.evaluate((best) => {
      window.lxHoldFrames = [];
      window.lxHoldOn = true;
      // One recording at a time: a loop from before stops at its next frame.
      const gen = (window.lxHoldGen = (window.lxHoldGen ?? 0) + 1);
      const one = () => {
        if (!window.lxHoldOn || window.lxHoldGen !== gen) return;
        const b = document.querySelector(best);
        const r = b?.getBoundingClientRect();
        window.lxHoldFrames.push(b ? { t: performance.now(), text: b.innerText, seen: b.checkVisibility({ opacityProperty: true, visibilityProperty: true }), x: r.x, y: r.y, w: r.width, h: r.height } : { t: performance.now(), text: null });
        requestAnimationFrame(one);
      };
      requestAnimationFrame(one);
    }, best);
  const stop = () => page.evaluate(() => ((window.lxHoldOn = false), window.lxHoldFrames));
  const moved = (frames) => frames.filter((f) => f.text !== frames[0].text || f.seen !== frames[0].seen || ["x", "y", "w", "h"].some((k) => Math.abs((f[k] ?? -1) - (frames[0][k] ?? -1)) > 0.5));
  const burst = (tag) =>
    page.evaluate(async (tag) => {
      const packs = await import("/js/study/packs.js");
      const { BUILT_IN } = await import("/js/packs/index.js");
      const { newPack, simpleItem } = await import("/js/study/pack-authoring.js");
      for (let n = 0; n < 4; n++) {
        const pack = structuredClone(BUILT_IN.find((p) => p.language === "nl") ?? BUILT_IN[0]);
        pack.id = `${tag}-pack-${n}`;
        pack.name = `${tag} pack ${n + 1}`;
        delete pack.builtIn;
        await packs.savePack(pack, { by: "Claude" });
      }
      const deck = newPack({ id: `${tag}-deck`, name: `${tag} deck`, language: "nl", from: "en" });
      const taken = new Set();
      for (let n = 0; n < 3000; n++) {
        const { item } = simpleItem({ text: `woord${n} zin nummer ${n}`, means: `word ${n} sentence number ${n}` }, { language: "nl", taken });
        if (item) (taken.add(item.id), deck.items.push(item));
      }
      await packs.savePack(deck, { by: "An Anki deck" });
    }, tag);
  const shown = await bestText(page);
  // The burst, the new index made once they're quiet, and the look again after it.
  await record();
  const before = await builds();
  await burst("hold");
  await page.waitForFunction((n) => window.lxIndexWorkers.reduce((k, w) => k + w.said.filter((m) => m.type === "built").length, 0) > n, before, { timeout: 120_000, polling: 250 });
  await page.waitForTimeout(1500);
  const frames = await stop();
  const changed = moved(frames);
  // The control: the same frames see a rebuild that empties the results for two frames when the next index is built.
  await page.evaluate(async (best) => {
    const { onTranslateIndex } = await import("/js/translate/translate.js");
    window.lxPlanted = "waiting";
    const off = onTranslateIndex(() => {
      off();
      // The answer gone from view for three frames, as a rebuild that dropped back to getting ready would leave it (emptying the results is
      // no plant: the page's own look again draws what it keeps back within the frame).
      const results = document.querySelector(best).closest(".lx-tr-results");
      results.style.opacity = "0";
      window.lxPlantedAt = performance.now();
      window.lxPlanted = "fired";
      requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => (results.style.opacity = ""))));
    });
  }, best);
  await record();
  const before2 = await builds();
  await burst("reset");
  await page.waitForFunction((n) => window.lxIndexWorkers.reduce((k, w) => k + w.said.filter((m) => m.type === "built").length, 0) > n, before2, { timeout: 120_000, polling: 250 });
  await page.waitForTimeout(1500);
  const plantedFrames = await stop();
  const planted = moved(plantedFrames);
  const plantAt = await page.evaluate(() => window.lxPlantedAt ?? null);
  const around = plantAt == null ? [] : plantedFrames.filter((f) => Math.abs(f.t - plantAt) < 80).map((f) => `${Math.round(f.t - plantAt)}:${f.text === null ? "none" : "shown"}`);
  const plantState = `${await page.evaluate(() => window.lxPlanted)}; frames ${Math.round(plantedFrames[0]?.t - plantAt)} … ${Math.round(plantedFrames.at(-1)?.t - plantAt)} ms from it; around it ${around.join(" ")}`;
  assert(frames.length > 60, `only ${frames.length} frames recorded`);
  assert(!changed.length, `the answer on the screen changed through the rebuild (${changed.length} of ${frames.length} frames): first ${JSON.stringify(frames[0])}, then ${JSON.stringify(changed[0])}`);
  assert(planted.length > 0, `the control: a rebuild that resets the view went unseen by the frames (the planted reset ${plantState}; ${plantedFrames.length} frames)`);
  return `"${shown}" the same in all ${frames.length} frames through "built" and the look again; the planted reset seen in ${planted.length} frames`;
});

// A pack's file held back by the page's own fetch (the app's sync asks through it, whatever the service worker does) until lxRelease().
const holdPack = (id) => `(() => {
  const fetch_ = window.fetch.bind(window);
  let release;
  const held = new Promise((resolve) => (release = resolve));
  window.lxRelease = () => release();
  window.fetch = (url, options) => (String(url?.url ?? url).includes("/library/packs/${id}/") ? held.then(() => fetch_(url, options)) : fetch_(url, options));
})();`;

// This device's index slow to come, as on a phone whose index takes seconds after a start (23.7 s once on an Android): every message the
// index's worker (translate/worker.js) sends the page waits until window.lxReleaseIndex(), then each arrives in order. The page's translate.js
// hears nothing from it meanwhile, as from a worker still working.
const HOLD_INDEX = `(() => {
  const Real = window.Worker;
  let held = true;
  const queued = [];
  window.lxReleaseIndex = () => {
    held = false;
    for (const [fn, event] of queued.splice(0)) fn(event);
  };
  window.Worker = class extends Real {
    constructor(url, options) {
      super(url, options);
      if (!String(url).includes("/js/translate/worker.js")) return;
      let handler = null;
      super.onmessage = (event) => {
        if (!handler) return;
        if (held) queued.push([handler, event]);
        else handler(event);
      };
      Object.defineProperty(this, "onmessage", { get: () => handler, set: (fn) => (handler = fn), configurable: true });
    }
  };
})();`;

// The speed stage's probe of the machine: a worker of this origin (served by the check) doing a fixed piece of work and answering. A round
// trip's time against the CPU its threads spent on it says how long the machine kept it waiting.
const PROBE_WORKER = `onmessage = (e) => { let x = 0; for (let i = 0; i < e.data; i++) x = (x * 31 + i) % 1000003; postMessage(x); };`;
const PROBE_N = 2_000_000;
// A probe's time over its CPU past this (and 5 ms of waiting) is a busy machine: what a key waited then isn't the app's to answer for.
const STRETCHED = 1.5;
// The stage's control: a task of the app's own (a script of this origin, served by the check) working ~80 ms of CPU at 4× on the next key.
const PLANT = `export function spin(n) { let x = 0; for (let i = 0; i < n; i++) x = (x * 31 + i) % 1000003; return x; }
export function arm(field, n) {
  field.addEventListener("input", function plantedTask() {
    field.removeEventListener("input", plantedTask, true);
    spin(n);
  }, true);
}`;
const PLANT_MS = 80;
// Translate's open: the tap that focuses its field on Home opens it, in that focus (translate/page.js onFocus: on an iPhone the frame right
// after it is the last before the keyboard's ~200 ms). The app's own handling of the tap at 4× (the CPU of the tap's events' handlers, from the
// start of the task its focus runs in to the first animation frame after the focus, or that task's end) under this: the opened page laid out
// and placed in its frame, never forced inside a handler (8 Nov 2026: three layouts forced in the focus, its handlers 58–83 ms; the keyboard's
// focusin forced one more, 21). Reported beside it: the tap's whole input work, which on a Chrome tap still holds the opened page's layout
// (it hit-tests the click that follows the focus in the same task: 47–48 ms, from today's 57–99), and the tap to the opened page's commit.
const OPEN_HANDLERS = 35;
// And the style and layout forced inside those handlers under this: none of the opened page's (today's code forced its 81 elements' style and
// 66 objects' layout there each time, 16–60 ms of CPU, even on a Home light enough to pass the handlers' 35; the read before any write leaves
// one element, under 1 ms).
const OPEN_FORCED = 5;

/** Translate's open in the speed stage's trace: the main thread's first focus after the mark; the tap's handlers (the CPU of the events
 * dispatched from the start of the task the focus runs in to the first animation frame after the focus, or that task's end), its whole input
 * work over that window, the focus's own, and the tap to the opened page's paint (from the same start to the first commit after openedAt, the
 * page time it had data-open). */
function openingCost(events, { mark, markAt, read, openedAt }) {
  const marked = events.find((e) => e.name === mark && /user_timing/.test(e.cat ?? ""));
  if (!marked) return null;
  const main = events.filter((e) => e.pid === marked.pid && e.tid === marked.tid && e.ph === "X" && typeof e.ts === "number" && e.ts > marked.ts).sort((a, b) => a.ts - b.ts);
  const focus = main.find((e) => e.name === "EventDispatch" && e.args?.data?.type === "focus");
  if (!focus) return null;
  const task = main.filter((e) => /RunTask/.test(e.name) && e.ts <= focus.ts && e.ts + e.dur >= focus.ts + focus.dur).sort((a, b) => b.dur - a.dur)[0] ?? focus;
  const animation = main.find((e) => e.name === "FireAnimationFrame" && e.ts >= focus.ts + focus.dur);
  const inputEnd = Math.min(task.ts + task.dur, animation?.ts ?? Infinity);
  const page = (ts) => (ts - marked.ts) / 1000 + markAt;
  const opened = Number.isFinite(openedAt) ? (openedAt - markAt) * 1000 + marked.ts : null;
  const commit = opened === null ? null : main.find((e) => e.name === "Commit" && e.ts >= opened);
  const cpu = (e) => (typeof e.tdur === "number" ? e.tdur : e.dur) / 1000;
  // The tap's events in that window, the outermost of each (an event inside another's handler counted in it).
  const dispatched = main.filter((e) => e.name === "EventDispatch" && e.ts >= task.ts && e.ts + e.dur <= inputEnd);
  const handlers = dispatched.filter((e) => !dispatched.some((o) => o !== e && o.ts <= e.ts && o.ts + o.dur >= e.ts + e.dur && o.dur > e.dur));
  // Style and layout a handler forced (nested in one of them).
  const forced = main.filter((e) => (e.name === "UpdateLayoutTree" || e.name === "Layout") && e.ts >= task.ts && e.ts < inputEnd && handlers.some((h) => h.ts <= e.ts && h.ts + h.dur >= e.ts + e.dur));
  return {
    handlers: handlers.reduce((sum, e) => sum + cpu(e), 0),
    forced: forced.reduce((sum, e) => sum + cpu(e), 0),
    forcedElements: forced.reduce((sum, e) => sum + (e.args?.elementCount ?? 0), 0),
    events: handlers.map((e) => `${e.args?.data?.type} ${Math.round(cpu(e))}`).join(", "),
    input: read.cpuBetween(read.main, page(task.ts), page(inputEnd)),
    clock: (inputEnd - task.ts) / 1000,
    focus: cpu(focus),
    frame: commit ? read.cpuBetween(read.main, page(task.ts), page(commit.ts + commit.dur)) : null,
    frameClock: commit ? (commit.ts + commit.dur - task.ts) / 1000 : null,
  };
}

await stage("speed: with the processor slowed 4×, a key to its result in under 100 ms, and no task of the app's own over 50 ms while typing, as a start's last pack arrives and its view and this device's index are made; judged on the CPU Chrome's trace gives each task (its thread time: the 4× counts in it, a busy machine hardly does), a planted 80 ms task of the app's own caught as the control; Translate's open (the app's handling of the tap) under 35 ms of CPU, with under 5 of style and layout forced in it: the opened page laid out and placed in its frame; a key slow only by waiting while a probe measured the machine busy is set aside, and the stage NOT REACHED (exit 2: run it again)", async (opened) => {
  // The last pack a sync fetches held until Translate is open (lastFetched: the catalog's last band): it lands while you type, checked and
  // worked into what you study, as a new version of a pack does on every device that has the one before.
  const catalogue = await (await fetch(`${BASE}/library/catalogue.json`)).json();
  const held = lastFetched(catalogue);
  assert(held, "the local library has no default Dutch pack to hold back");
  const page = await today(opened, { init: `${holdPack(held.id)}\n${watchIndexWorkers}`, except: held.id });
  // The probe's worker and the plant, scripts of this origin (context.route: the service worker's own fetches too).
  const serve = (path, body) => page.context().route((url) => url.pathname === path, (route) => route.fulfill({ contentType: "text/javascript", body }));
  await serve("/js/__speed-probe.js", PROBE_WORKER);
  await serve("/js/__speed-plant.js", PLANT);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const origin = new URL(BASE).origin;
  const supported = await page.evaluate((origin) => {
    // What each long frame ran (the Long Animation Frames API): every script by file, function and what started it, each with its window in
    // page time, and the frame's style and layout. The trace gives each window's CPU.
    window.lxFrames = [];
    if (!PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame")) return false;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const end = e.startTime + e.duration;
        window.lxFrames.push({
          at: e.startTime,
          ms: e.duration,
          blocking: e.blockingDuration,
          layoutAt: e.styleAndLayoutStart || end,
          layout: e.styleAndLayoutStart ? end - e.styleAndLayoutStart : 0,
          scripts: e.scripts.map((x) => ({ ours: x.sourceURL.startsWith(origin), src: x.sourceURL.replace(/^.*\/js\//, "").replace(/\?.*$/, ""), fn: x.sourceFunctionName, invoker: x.invoker, at: x.startTime, ms: x.duration, layout: x.forcedStyleAndLayoutDuration })),
        });
      }
    }).observe({ type: "long-animation-frame" });
    window.lxTimes = [];
    // When Translate's page opened (its data-open), for the open's frame.
    const box = document.querySelector(".lx-today-translate");
    new MutationObserver(() => {
      if (box.hasAttribute("data-open")) window.lxOpenedAt ??= performance.now();
    }).observe(box, { attributes: true, attributeFilter: ["data-open"] });
    const field = document.querySelector('[data-part="translate-field"] :is(textarea, input)');
    let at = 0;
    let query = "";
    // A key's result: the results answering what's typed (their data-query), not any change there (a status line changed too, and the
    // speed counted it: 7 Nov 2026, a phrase typed while a pack came showed nothing for 3 s while every key "took" 8 ms). A key not answered
    // before the next one took at least that long, and counts so (unanswered): leaving it out hid the keys a stale index left with nothing,
    // timing only those that came in time. A key that leaves what's typed the same (a space) is answered by what's up already.
    const results = document.querySelector(".lx-today-translate .lx-tr-results");
    const seen = () => {
      if (at && results.dataset.query === query.trim()) {
        window.lxTimes.push({ query, at, ms: performance.now() - at });
        at = 0;
      }
    };
    field.addEventListener("input", () => {
      const now = performance.now();
      if (at) window.lxTimes.push({ query, at, ms: now - at, unanswered: true });
      at = now;
      query = field.value;
      seen();
    }, true);
    new MutationObserver(seen).observe(results, { attributes: true, attributeFilter: ["data-query"], childList: true, subtree: true, characterData: true });
    // The last key, still unanswered when they're read, too.
    window.lxTyped = () => (at ? [...window.lxTimes, { query, at, ms: performance.now() - at, unanswered: true }] : window.lxTimes.slice());
    window.lxProbes = [];
    window.lxProbe = async (label, n, times) => {
      const worker = (window.lxProbeWorker ??= new Worker("/js/__speed-probe.js"));
      const once = () => new Promise((resolve) => {
        worker.onmessage = resolve;
        worker.postMessage(n);
      });
      if (!window.lxProbeWarm) {
        await once();
        window.lxProbeWarm = true;
      }
      for (let i = 0; i < times; i++) {
        await new Promise((resolve) => setTimeout(resolve, 40));
        const at = performance.now();
        await once();
        window.lxProbes.push({ label, at, ms: performance.now() - at });
      }
    };
    return true;
  }, origin);
  assert(supported, "this browser has no Long Animation Frames: nothing could say what a long frame ran");
  const builds = () => page.evaluate(async () => (await import("/js/study/content.js")).contentBuilds?.() ?? null);
  const before = await builds();
  if (process.env.LX_PROFILE) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
  }
  // Chrome's trace of all of it: each task's thread time, on the page's main thread and its workers' (LX_TRACE keeps it, with the stacks
  // that forced each style and layout).
  const traced = [];
  cdp.on("Tracing.dataCollected", ({ value }) => traced.push(...value));
  await cdp.send("Tracing.start", { categories: TRACE_CATEGORIES + (process.env.LX_TRACE ? ",disabled-by-default-devtools.timeline.stack" : ""), transferMode: "ReportEvents" });
  const zero = await page.evaluate(() => performance.mark("lx-speed-zero").startTime);
  const now = () => page.evaluate(() => performance.now());
  const probe = (label) => page.evaluate(({ label, n }) => window.lxProbe(label, n, 5), { label, n: PROBE_N });
  await typeIn(page, "");
  await probe("before");
  const typing = await now();
  await page.evaluate(() => window.lxRelease());
  await page.keyboard.type("de hond loopt naar huis", { delay: 120 });
  await settled(page);
  const middle = await now();
  await probe("between");
  await page.locator(FIELD).fill("");
  await page.waitForTimeout(600);
  await page.keyboard.type("ik wil graag een biertje", { delay: 120 });
  await settled(page);
  const typed = await now();
  await probe("after");
  // The control: a task of the app's own of ~80 ms of CPU at 4× on the next key (sized on this machine now, by the quickest of three
  // short runs); the same rule must name it.
  await page.locator(FIELD).fill("");
  await page.waitForTimeout(600);
  const plantN = await page.evaluate(async (target) => {
    const plant = await import("/js/__speed-plant.js");
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      plant.spin(500_000);
      best = Math.min(best, performance.now() - t);
    }
    const n = Math.round((500_000 * target) / best);
    plant.arm(document.querySelector('[data-part="translate-field"] :is(textarea, input)'), n);
    return n;
  }, PLANT_MS);
  const planted = await now();
  await page.keyboard.type("kat", { delay: 120 });
  await settled(page);
  const plantedEnd = await now();
  const data = await page.evaluate(() => ({ times: window.lxTyped(), frames: window.lxFrames.slice(), probes: window.lxProbes.slice(), openedAt: window.lxOpenedAt ?? null }));
  // When this device first had an index of its own: its worker's first "built", or a "loaded" that read one back (a "loaded" with no
  // languages found none kept, and counting it called the first build's keys this device's). Keys before it are the server's to answer, a
  // fresh one at most every 300 ms (translate.js coldAsk: the phrase stages judge that window); from it on, each key is this device's.
  const indexAt = await page.evaluate(() => Math.min(...window.lxIndexWorkers.flatMap((w) => w.said.filter((m) => m.type === "built" || (m.type === "loaded" && Array.isArray(m.languages))).map((m) => m.t)), Infinity));
  // A key left unanswered once there is an index, of which this device knows nothing (a single letter): the page says nothing new for it
  // until NOTHING_WAIT, as it should. Asked of this device's index after the typing (translate.js knownShare).
  const knows = await page.evaluate(async (queries) => {
    const t = await import("/js/translate/translate.js");
    return Object.fromEntries(await Promise.all(queries.map(async (q) => [q, await t.knownShare(q, "nl")])));
  }, [...new Set(data.times.filter((k) => k.unanswered).map((k) => k.query.trim()))]);
  const landed = await page.evaluate(async (id) => (await import("/js/study/packs.js")).libraryPacks().some((p) => p.id === id), held.id);
  const during = await builds();
  // Home, shown again as Translate closes: what it pays to catch up with the pack that came while it was hidden (reported, not judged here).
  const closing = await now();
  await page.locator('[data-part="app-back"]').first().tap();
  await page.waitForTimeout(1500);
  const homeFrames = await page.evaluate((closing) => window.lxFrames.filter((e) => e.at > closing), closing);
  if (process.env.LX_PROFILE) writeFileSync(`${OUT}/speed.cpuprofile`, JSON.stringify((await cdp.send("Profiler.stop")).profile));
  const complete = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
  await cdp.send("Tracing.end");
  await complete;
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  if (process.env.LX_TRACE) writeFileSync(`${OUT}/speed.trace.json`, JSON.stringify({ traceEvents: traced, zero }));

  const read = readTrace(traced, { mark: "lx-speed-zero", markAt: zero });
  assert(read, "Chrome's trace has no lx-speed-zero mark: the page's CPU can't be read");
  const timed = read.main.tasks.filter((t) => t.threadTime).length;
  assert(timed > read.main.tasks.length / 2, `the trace has thread time for ${timed} of the page's ${read.main.tasks.length} tasks: their CPU can't be read`);
  const indexWorker = read.workers.find((w) => w.url.includes("/js/translate/worker.js"));
  const probeWorker = read.workers.find((w) => w.url.includes("/js/__speed-probe.js"));
  assert(probeWorker, "the probe's worker isn't in the trace: the machine's load can't be read");
  const round = (x) => Math.round(x);
  // The app's own long work while typing, and the control's.
  const tasks = judgeFrames(data.frames.filter((f) => f.at >= typing && f.at < typed), read);
  const control = judgeFrames(data.frames.filter((f) => f.at >= planted && f.at < plantedEnd), read);
  const plantSeen = [...control.own, ...control.machine].find((x) => x.said.startsWith("__speed-plant.js"));
  // Each key's time against the CPU the app spent in it (the page's main thread and the index's worker); the rest it waited.
  const typedKeys = data.times
    .filter((k) => k.at >= typing && k.at < typed)
    .map((k) => {
      const main = read.cpuBetween(read.main, k.at, k.at + k.ms);
      const index = indexWorker ? read.cpuBetween(indexWorker, k.at, k.at + k.ms) : 0;
      return { ...k, main, index, cpu: main + index, near: k.at < middle ? ["before", "between"] : ["between", "after"] };
    });
  const beforeIndex = typedKeys.filter((k) => k.at < indexAt);
  const knowsNothing = typedKeys.filter((k) => k.at >= indexAt && k.unanswered && !(knows[k.query.trim()] > 0));
  const keys = typedKeys.filter((k) => k.at >= indexAt && !knowsNothing.includes(k));
  // The machine: each probe's time over the CPU its threads spent in it (the probe's worker and the page's main thread, so the page's own work
  // in the way counts as the app's, not the machine's).
  const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const probes = data.probes.map((p) => {
    const cpu = read.cpuBetween(probeWorker, p.at, p.at + p.ms) + read.cpuBetween(read.main, p.at, p.at + p.ms);
    return { ...p, cpu, stretch: p.ms / Math.max(cpu, 0.5) };
  });
  const machine = Object.fromEntries(
    ["before", "between", "after"].map((label) => {
      const mine = probes.filter((p) => p.label === label);
      const stretch = median(mine.map((p) => p.stretch));
      const waited = median(mine.map((p) => p.ms - p.cpu));
      return [label, { stretch, waited, busy: stretch > STRETCHED && waited > 5 }];
    }),
  );
  const home = homeFrames.flatMap((f) => f.scripts.filter((x) => x.ours)).map((x) => ({ ...x, cpu: read.cpuBetween(read.main, x.at, x.at + x.ms) }));
  writeFileSync(
    `${OUT}/speed.json`,
    JSON.stringify({ keys, own: tasks.own.map((x) => x.said), machineFrames: tasks.machine.map((x) => x.said), probes, machine, control: { plantN, seen: plantSeen?.said ?? null }, frames: data.frames, held: held.id, landed, builds: { before, during }, home }, null, 1),
  );

  const machineLine = `the machine (a probe's time over its CPU): ${["before", "between", "after"].map((l) => `${l} ${machine[l].stretch.toFixed(2)}×${machine[l].busy ? " BUSY" : ""}`).join(", ")}`;
  const longLine = tasks.machine.length ? `; long by the clock but not on CPU (the machine's): ${tasks.machine.map((x) => x.said).join("; ")}` : "";
  const homeLine = home.length ? `; Home caught up on Translate closing: ${home.sort((a, b) => b.cpu - a.cpu).slice(0, 2).map((x) => `${x.src} ${x.fn || x.invoker} ${round(x.cpu)} ms of CPU`).join(", ")}` : "";
  assert(plantSeen && control.own.includes(plantSeen), `the control: a planted task of the app's own wasn't caught (${plantSeen?.said ?? "not seen at all"}): the rule can't fail`);
  const plantCpu = plantSeen.cpu;
  assert(plantCpu >= 60, `the control: the planted task came out at ${round(plantCpu)} ms of CPU, too little to show the rule can fail (sized ${plantN} steps)`);
  const opening = openingCost(traced, { mark: "lx-speed-zero", markAt: zero, read, openedAt: data.openedAt });
  assert(opening, "the trace has no focus of Translate's field: its open can't be read");
  assert(opening.frame !== null, `Translate's page never had data-open after the tap, or no frame was committed after it (opened at ${data.openedAt})`);
  const openLine = `Translate's open: the tap's handlers ${round(opening.handlers)} ms of CPU (${opening.events}; style and layout forced in them ${opening.forced.toFixed(1)}, ${opening.forcedElements} elements restyled), its whole input work ${round(opening.input)} (${round(opening.clock)} by the clock), the tap to the opened page's commit ${round(opening.frame)} ms of CPU (${round(opening.frameClock)} by the clock)`;
  assert(opening.forced < OPEN_FORCED, `${openLine}: ${opening.forced.toFixed(1)} ms of style and layout forced in the tap's handlers (under ${OPEN_FORCED} at 4×: the opened page laid out there)`);
  assert(opening.handlers < OPEN_HANDLERS, `${openLine}: the handlers over ${OPEN_HANDLERS} ms of CPU at 4×`);
  assert(!tasks.own.length, `the app's own long tasks while typing: ${tasks.own.map((x) => x.said).join("; ")}${longLine}`);
  assert(landed && during?.prepared > before?.prepared, `${held.id} came while typing and its view was worked out in slices (landed: ${landed}; ${JSON.stringify(before)} → ${JSON.stringify(during)})`);
  assert(keys.length >= 20, `only ${keys.length} keys measured`);
  const p95 = (list) => {
    const sorted = list.map((k) => k.ms).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)];
  };
  const p50 = round(median(keys.map((k) => k.ms)));
  const split = (k) => `"${k.query}" ${k.unanswered ? `unanswered before the next key, ${round(k.ms)} ms on` : `${round(k.ms)} ms`}: ${round(k.cpu)} of the app's CPU (the page ${round(k.main)}, the index ${round(k.index)}), ${round(k.ms - k.cpu)} waited`;
  const slow = keys.filter((k) => k.ms >= 100);
  // A key over 100 ms whose CPU was under it, while a probe beside it measured the machine busy: its time isn't the app's to answer for.
  const setAside = slow.filter((k) => k.cpu < 100 && k.near.some((label) => machine[label].busy));
  const counted = keys.filter((k) => !setAside.includes(k));
  assert(p95(counted) < 100, `a key to its result: p50 ${p50} ms, p95 ${round(p95(counted))} ms; over 100: ${slow.filter((k) => !setAside.includes(k)).map(split).join("; ")}; ${machineLine}`);
  if (p95(keys) >= 100) {
    throw new NotReached(`a key to its result: p95 ${round(p95(keys))} ms by the clock, over 100 only by waiting while the machine was measured busy (${setAside.map(split).join("; ")}); ${machineLine}. The app's own CPU was under 100 ms on each`);
  }
  const slowLine = slow.length ? ` (over 100: ${slow.map(split).join("; ")})` : "";
  const asideLine = `${beforeIndex.length ? `; ${beforeIndex.length} keys before this device's first index (${round(indexAt - typing)} ms in), the server's` : ""}${knowsNothing.length ? `; ${knowsNothing.length} it knows nothing of, rightly unanswered (${knowsNothing.map((k) => JSON.stringify(k.query)).join(", ")})` : ""}`;
  return `${keys.length} keys: p50 ${p50} ms, p95 ${round(p95(keys))} ms${slowLine}${asideLine}; no task of the app's own over 50 ms of CPU while ${held.id} came and was worked in (CPU ×4)${longLine}; ${machineLine}; the control's planted task caught at ${round(plantCpu)} ms of CPU; ${openLine}${homeLine}`;
});

// A phrase typed while this device can't answer for itself yet (the director, 7 Nov 2026: "de hond loopt naar huis" showed nothing for
// 3.2 s, every key "never": a pause before asking the server that every key reset). In that window the server is asked at once on the first
// key, then for the latest text as each answer comes back, one at a time, at most once in COLD_EVERY (at once after an answer that found
// nothing: translate.js coldAsk). Typed with the processor slowed 4×, every frame and every request to /api/translate recorded (a round trip
// of roundTrip ms more where a stage asks, the page's fetch held that long, a press of the app's stopping it). Three ways in:
//   - index: right after a start, this device's index held until the typing's answer is up (HOLD_INDEX, a phone whose index is slow), then let
//     go; the last pack a sync fetches held until Translate is open, as the speed stage holds it (lastFetched), so a pack comes in while it's typed;
//   - newcomer: a device with no packs yet, every pack's file held until the typing's answer is up (HOLD_PACKS), then let go.
const PHRASE = "de hond loopt naar huis";
const COLD_EVERY = 300;
// Every message from the index's worker, and every pack file, held: what's let go once the phrase's answer is up.
const HOLD_PACKS = `(() => {
  const fetch_ = window.fetch.bind(window);
  let release;
  const held = new Promise((resolve) => (release = resolve));
  window.lxReleasePacks = () => release();
  window.fetch = (url, options) => (String(url?.url ?? url).includes("/library/packs/") ? held.then(() => fetch_(url, options)) : fetch_(url, options));
})();`;

async function phraseRun(opened, { way, roundTrip = 0, lateBy = 0 }) {
  let page;
  if (way === "index") {
    const catalogue = await (await fetch(`${BASE}/library/catalogue.json`)).json();
    const held = lastFetched(catalogue);
    assert(held, "the local library has no default Dutch pack to hold back");
    page = await today(opened, { init: `${holdPack(held.id)}\n${HOLD_INDEX}`, except: held.id });
  } else {
    // A device with nothing yet: the app opened as a newcomer's first time here, its packs on their way.
    const one = await phone({ init: HOLD_PACKS });
    opened.push(one);
    page = one.page;
    await page.goto(`${BASE}/app/#today`);
    await ready(page);
    await page.waitForSelector(FIELD, { timeout: 30_000 });
    let coming = null;
    for (let waited = 0; waited < 30_000 && !coming; waited += 200) {
      coming = await page.evaluate(async () => (await import("/js/study/packs.js")).packDownloads());
      if (!coming) await page.waitForTimeout(200);
    }
    assert(coming?.language === "nl", `no Dutch packs downloading on a new device (${JSON.stringify(coming)})`);
    const here = await page.evaluate(async () => (await import("/js/study/packs.js")).libraryPacks().filter((p) => p.id.startsWith("words-nl-")).length);
    assert(here === 0, `a new device already had ${here} word bands`);
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  try {
    await typeIn(page, "");
    if (way === "index") await page.evaluate(() => window.lxRelease());
    // Every frame: which query the results answer, the best answer's words and box, whether it's the server's while the index is made; every
    // key: when and what; every request to /api/translate: when it went, what for, when it came back (or was stopped), whether it found
    // anything and the server's timing.
    await page.evaluate(({ roundTrip, lateBy }) => {
      window.lxPhraseFrames = [];
      window.lxPhraseKeys = [];
      window.lxPhraseAsks = [];
      window.lxPhraseOn = true;
      const real = window.fetch;
      window.fetch = function (input, init) {
        const url = String(input?.url ?? input);
        if (!window.lxPhraseOn || !/\/api\/translate$/.test(new URL(url, location.href).pathname)) return real.apply(this, arguments);
        const ask = { t: performance.now(), q: (() => { try { return JSON.parse(init?.body ?? "{}").q; } catch { return null; } })() };
        window.lxPhraseAsks.push(ask);
        const go = () =>
          real.call(this, input, init).then(
            (response) => {
              ask.back = performance.now();
              ask.timing = response.headers.get("Server-Timing");
              // Its body in (ask.done): the reply has come once the page can read it, which on a busy server is well after its headers.
              response.clone().json().then(
                (answer) => {
                  ask.done = performance.now();
                  ask.found = Boolean(answer?.whole) || (answer?.words?.length ?? 0) > 0;
                },
                () => (ask.done = performance.now()),
              );
              return response;
            },
            (error) => ((ask.stopped = performance.now()), Promise.reject(error)),
          );
        if (!roundTrip) return go();
        // A slower link: the request held roundTrip ms first, the app's own stop honored meanwhile.
        return new Promise((resolve, reject) => {
          const signal = init?.signal;
          const stop = () => (clearTimeout(timer), (ask.stopped = performance.now()), reject(signal.reason ?? new DOMException("Aborted", "AbortError")));
          if (signal?.aborted) return stop();
          const timer = setTimeout(() => go().then(resolve, reject), roundTrip);
          signal?.addEventListener("abort", stop, { once: true });
        });
      };
      // The control (lateBy): a page that waits before it sends each request, so each goes out late by its own doing.
      if (lateBy) {
        const recorded = window.fetch;
        window.fetch = function (input, init) {
          const url = String(input?.url ?? input);
          if (!window.lxPhraseOn || !/\/api\/translate$/.test(new URL(url, location.href).pathname)) return recorded.apply(this, arguments);
          return new Promise((resolve) => setTimeout(resolve, lateBy)).then(() => recorded.call(this, input, init));
        };
      }
      const field = document.querySelector('[data-part="translate-field"] :is(textarea, input)');
      field.addEventListener("input", () => window.lxPhraseKeys.push({ t: performance.now(), query: field.value.trim() }), true);
      const one = () => {
        if (!window.lxPhraseOn) return;
        // The open Translate's own results (the page has others), and its first answer whatever it is (a word-by-word line, a sentence).
        const box = document.querySelector(".lx-today-translate[data-open]");
        const results = box?.querySelector(".lx-tr-results");
        const b = results?.querySelector('[data-part="translate-result"]');
        const r = b?.getBoundingClientRect();
        window.lxPhraseFrames.push({ t: performance.now(), query: results?.dataset.query ?? null, indexing: Boolean(box?.closest("[data-indexing]") ?? box?.querySelector("[data-indexing]")), text: b?.innerText ?? null, top: r?.top ?? null });
        requestAnimationFrame(one);
      };
      requestAnimationFrame(one);
    }, { roundTrip, lateBy });
    await page.keyboard.type(PHRASE, { delay: 120 });
    // The answer to the whole phrase up, and a moment more (settled() waits out data-indexing, which lasts as long as a hold).
    for (let waited = 0; waited < 15_000; waited += 100) {
      if (await page.evaluate((phrase) => window.lxPhraseFrames.at(-1)?.query === phrase, PHRASE)) break;
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(1000);
    // Let go: this device's index made now (or its packs coming in and indexed), and its own answer merged in, once typing is quiet.
    const releasedAt = await page.evaluate((way) => (way === "index" ? window.lxReleaseIndex() : window.lxReleasePacks(), performance.now()), way);
    // How long until this device answers for itself: its index's answer on the screen, or (a newcomer) every pack in and the index knowing the phrase's words.
    const letGo = Date.now();
    let ownWait = null;
    for (let waited = 0; waited < 60_000; waited += 250) {
      const done = await page.evaluate(async (way) => {
        const last = window.lxPhraseFrames.at(-1);
        if (way === "index") return last?.indexing === false && last?.query != null;
        const packs = await import("/js/study/packs.js");
        return !packs.packDownloads() && last?.indexing === false && (await (await import("/js/translate/translate.js")).knownShare("hond", "nl")) > 0;
      }, way);
      if (done) {
        ownWait = Date.now() - letGo;
        break;
      }
      await page.waitForTimeout(250);
    }
    await settled(page, 1500);
    await page.waitForTimeout(1000);
    const { frames, keys, asks } = await page.evaluate(() => ((window.lxPhraseOn = false), { frames: window.lxPhraseFrames, keys: window.lxPhraseKeys, asks: window.lxPhraseAsks }));
    writeFileSync(`${OUT}/phrase-${way}${roundTrip ? `-${roundTrip}` : ""}.json`, JSON.stringify({ keys, frames, asks, releasedAt }, null, 1));
    assert(keys.length >= 20, `only ${keys.length} keys`);
    return { ...phraseFigures({ keys, frames, asks, releasedAt }), ownWait };
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
}

/** What a phraseRun's record says: the first answer, how far the screen fell behind, the requests and their pace, what moved. */
function phraseFigures({ keys, frames, asks, releasedAt }) {
  const k0 = keys[0].t;
  const typedEnd = keys.at(-1).t;
  // An answer on the screen: a best answer for the start of the phrase. How far behind the typing it is: 0 while its text is what's typed,
  // else the time since the key that made what's typed something else.
  const answering = (f) => f.text != null && f.query != null && PHRASE.startsWith(f.query);
  const behind = (f) => {
    const now = keys.filter((k) => k.t <= f.t).at(-1);
    if (!now || now.query === f.query) return 0;
    const lastOf = keys.findLastIndex((k) => k.t <= f.t && k.query === f.query);
    const moved = keys.slice(lastOf + 1).find((k) => k.query !== f.query);
    return lastOf < 0 || !moved ? Infinity : f.t - moved.t;
  };
  const first = frames.find((f) => f.t >= k0 && answering(f)) ?? null;
  let emptyRun = 0;
  let runStart = null;
  for (const f of frames.filter((f) => f.t >= k0)) {
    if (answering(f)) runStart = null;
    else emptyRun = Math.max(emptyRun, f.t - (runStart ??= f.t));
  }
  const during = first ? frames.filter((f) => f.t >= first.t && f.t <= typedEnd) : [];
  // The answers drawn while typing: each time what's shown answers a newer start of the phrase.
  const drawn = [];
  for (const f of frames.filter((f) => f.t <= typedEnd && answering(f))) if (drawn.at(-1)?.query !== f.query) drawn.push({ t: f.t, query: f.query });
  const stuck = drawn.slice(1).reduce((m, d, i) => Math.max(m, d.t - drawn[i].t), 0);
  // The requests made while this device couldn't answer for itself (until its hold was let go), one at a time and paced.
  const cold = asks.filter((a) => a.t >= k0 - 50 && a.t < releasedAt);
  const overlaps = cold.slice(1).filter((a, i) => a.t < (cold[i].back ?? cold[i].stopped ?? Infinity) - 1).length;
  const paced = cold.slice(1).map((a, i) => ({ gap: a.t - cold[i].t, after: cold[i] }));
  const tooSoon = paced.filter(({ gap, after }) => gap < COLD_EVERY - 15 && after.found !== false);
  // The page's own share. Each request against when it was due: the first at the first key; each after it once the one before is back, once
  // there's text newer than it asked for, and (after one that found something) COLD_EVERY after it went. Each reply that found something
  // against its drawing: the first frame showing what it answered. The server's share: each reply's round trip (one never back, unstopped,
  // as long as the whole record). A reply has come when its body is in (done), not its headers (back): on 8 Nov a body came 110 ms after its
  // headers while every frame ran, and the next request, rightly waiting for it, read as the page's 118 ms.
  const recordEnd = Math.max(...frames.map((f) => f.t));
  const late = cold.map((a, i) => {
    const before = cold[i - 1];
    if (!before) return a.t - k0;
    const newer = keys.find((k) => k.t > before.t && k.query !== before.q)?.t ?? Infinity;
    return a.t - Math.max(before.done ?? before.back ?? before.stopped ?? Infinity, before.found === false ? -Infinity : before.t + COLD_EVERY, newer);
  });
  const drawLags = cold
    .filter((a) => a.back && a.found)
    .flatMap((a) => {
      const came = a.done ?? a.back;
      const shown = frames.find((f) => f.t >= came && f.query === a.q && f.text != null);
      return shown ? [shown.t - came] : [];
    });
  const trips = cold.filter((a) => !a.stopped).map((a) => (a.done ?? a.back ?? recordEnd) - a.t);
  const last = keys.at(-1).query;
  const answered = frames.filter((f) => f.query === last && f.text != null);
  const median = (list) => (list.length ? Math.round([...list].sort((a, b) => a - b)[Math.floor(list.length / 2)]) : null);
  return {
    keys: keys.length,
    typedMs: Math.round(typedEnd - k0),
    firstMs: first ? Math.round(first.t - k0) : null,
    emptyRun: Math.round(emptyRun),
    gaps: during.filter((f) => !answering(f)).length,
    worst: Math.round(Math.max(0, ...during.filter(answering).map(behind))),
    drawn: drawn.length,
    stuck: Math.round(stuck),
    requests: asks.length,
    coldRequests: cold.length,
    whileTyping: asks.filter((a) => a.t >= k0 - 50 && a.t <= typedEnd).length,
    latest: Math.round(Math.max(0, ...late.filter(Number.isFinite))),
    drawLag: Math.round(Math.max(0, ...drawLags)),
    slowest: Math.round(Math.max(0, ...trips)),
    overlaps,
    tooSoon: tooSoon.map(({ gap }) => Math.round(gap)),
    closest: Math.round(Math.min(Infinity, ...paced.map((p) => p.gap))),
    stopped: asks.filter((a) => a.stopped).length,
    perKey: keys.map((k, i) => asks.filter((a) => a.t >= k.t && a.t < (keys[i + 1]?.t ?? Infinity)).length).join(""),
    roundTrip: median(asks.filter((a) => a.back).map((a) => a.back - a.t)),
    served: Object.entries(Object.groupBy(asks.filter((a) => a.timing), (a) => /index;desc="([^"]*)"/.exec(a.timing)?.[1] ?? "?")).map(([kind, list]) => `${list.length} ${kind}`).join(", "),
    ownAt: (() => {
      const own = frames.find((f) => f.t >= releasedAt && f.query != null && !f.indexing);
      return own ? Math.round(own.t - releasedAt) : null;
    })(),
    before: frames.some((f) => f.t >= k0 && f.t < releasedAt && f.query != null && !f.indexing && f.text != null),
    last,
    texts: [...new Set(answered.map((f) => f.text))],
    tops: [...new Set(answered.map((f) => Math.round(f.top)))],
  };
}

const phraseLine = (r) =>
  `${r.keys} keys over ${r.typedMs} ms: the first answer ${r.firstMs} ms after the first key, ${r.drawn} answers drawn while typing (a new one at least every ${r.stuck} ms), at most ${r.worst} ms behind; ${r.requests} requests (${r.whileTyping} while typing, ${r.coldRequests} before the hold was let go; one at a time${r.overlaps ? ` but ${r.overlaps} overlapping` : ""}; closest ${r.closest} ms; per key ${r.perKey}; ${r.stopped} stopped), round trip median ${r.roundTrip} ms, the server's index ${r.served || "not said"}; this device answering for itself ${r.ownWait} ms after the hold was let go; "${r.last}": ${r.texts.map((t) => JSON.stringify(t.split("\n")[0].slice(0, 40))).join(" → ")}, its top at ${r.tops.join(", ")}`;

// The page's own share of a phrase typed while this device can't answer, at 4×: a request out within OWN_GO of when it was due, a reply drawn
// within OWN_DRAW of coming (8 Nov 2026, today's app: at most 26 and 65); failing it fails the stage, whatever the server did. Then what the
// screen showed, against the stage's limits: a miss there with a server reply slower than SERVER_REPLY is the server's (NOT REACHED, exit 2:
// run it again), never a pass, as the speed stage sets aside a key slow only while the machine was busy; a miss with every reply in time is
// the page's (FAIL). SERVER_REPLY is what the screen's limits leave a reply: COLD_EVERY + a reply + its drawing under KEEP_UP (500), and two
// replies with a key between under FIRST_ANSWER (400). On a machine with other local servers, single replies of 210–1120 ms were what failed
// these stages (8 Nov: every request out within 26 ms of due, every reply drawn within 65 ms).
const OWN_GO = 100;
const OWN_DRAW = 150;
const SERVER_REPLY = 120;
function phraseJudge(r, { firstAnswer, keepUp }) {
  assert(r.latest <= OWN_GO, `a request went ${r.latest} ms after it was due (at most ${OWN_GO}: at the first key, then once the one before was back, there was newer text and its ${COLD_EVERY} ms were up)`);
  assert(r.drawLag <= OWN_DRAW, `a reply drawn ${r.drawLag} ms after it came (at most ${OWN_DRAW})`);
  phrasePaced(r);
  const misses = [
    !(r.firstMs !== null && r.firstMs <= firstAnswer) && `nothing answering the phrase on the screen within ${firstAnswer} ms of the first key: ${r.firstMs ?? "never"} ms; the longest stretch with nothing, ${r.emptyRun} ms`,
    r.gaps && `${r.gaps} frames with nothing answering the phrase after its first answer`,
    r.worst > keepUp && `the screen fell ${r.worst} ms behind the typing (at most ${keepUp})`,
  ].filter(Boolean);
  if (!misses.length) return;
  if (r.slowest > SERVER_REPLY) {
    throw new NotReached(`${misses.join("; ")}, with the server answering in ${r.slowest} ms (this stage's budget ${SERVER_REPLY}): run it again. The page's own share held: requests at most ${r.latest} ms after they were due, replies drawn within ${r.drawLag} ms`);
  }
  throw new Error(`${misses.join("; ")}, with every server reply within ${SERVER_REPLY} ms (the slowest ${r.slowest}): the page's`);
}

// What every way in must hold: one request at a time, paced (sooner only after an answer that found nothing); the last answer's box unmoved.
function phrasePaced(r) {
  assert(!r.overlaps, `${r.overlaps} requests sent while another was out (one at a time)`);
  assert(!r.tooSoon.length, `requests ${r.tooSoon.join(", ")} ms after one that had found something (at most one in ${COLD_EVERY})`);
  assert(r.tops.length <= 1, `the last answer's box moved as it changed (${r.texts.map((t) => JSON.stringify(t.slice(0, 40))).join(" → ")}; tops ${r.tops.join(", ")})`);
}

// Right after a start, this device's index slow to come: an answer to the phrase's start within FIRST_ANSWER of the first key, in every frame
// after it, never KEEP_UP behind the typing; this device's own only once its index is let go, its box unmoved.
await stage("phrase: typed the moment Translate opens, slowed 4×, this device's index held: an answer to its start within 400 ms of the first key and in every frame after it, never 500 ms behind the typing; the server asked one at a time, at most once in 300 ms (sooner only after an answer that found nothing); this device's own answer once its index is let go, the box unmoved; every frame and request recorded; judged on the page's own share (a request out within 100 ms of due, a reply drawn within 150), a miss on the screen with a server reply over 120 ms NOT REACHED (exit 2: run it again), a page 600 ms late with each request failed as the control", async (opened) => {
  const FIRST_ANSWER = 400;
  const KEEP_UP = 500;
  // The control: the same page waiting 600 ms before each request must fail on its own share, whatever the server does.
  const control = await phraseRun(opened, { way: "index", lateBy: 600 });
  let caught = null;
  try {
    phraseJudge(control, { firstAnswer: FIRST_ANSWER, keepUp: KEEP_UP });
  } catch (error) {
    caught = error;
  }
  assert(caught && !(caught instanceof NotReached) && /went \d+ ms after it was due/.test(caught.message), `the control: a page waiting 600 ms before each request wasn't failed for it (${caught?.message ?? "it passed"}): the rule can't fail`);
  const r = await phraseRun(opened, { way: "index" });
  assert(!r.before, "this device answered before its index was let go: the hold held nothing");
  phraseJudge(r, { firstAnswer: FIRST_ANSWER, keepUp: KEEP_UP });
  assert(r.ownWait !== null && r.ownAt !== null, "this device's own answer never came once its index was let go");
  return `${phraseLine(r)}; the page's own share: requests at most ${r.latest} ms after they were due, replies drawn within ${r.drawLag} ms, the slowest reply ${r.slowest} ms; the control (600 ms late) failed: ${caught.message.slice(0, 80)}`;
});

// The same on a link with a 500 ms round trip (a phone on a mobile network): answers keep coming while typing, one each round trip (a
// request cut off for newer text would never come back: the control).
await stage("phrase-slow: the same over a 500 ms round trip: answers keep arriving while it's typed, a new one at least every two round trips, the first within two round trips and a bit of the first key; one request at a time", async (opened) => {
  const ROUND_TRIP = 500;
  const r = await phraseRun(opened, { way: "index", roundTrip: ROUND_TRIP });
  assert(r.firstMs !== null && r.firstMs <= 2 * ROUND_TRIP + 200, `the first answer ${r.firstMs ?? "never"} ms after the first key (at most two round trips and 200 ms); the longest stretch with nothing, ${r.emptyRun} ms`);
  assert(r.drawn >= 3, `only ${r.drawn} answers drawn while typing ${r.typedMs} ms over a ${ROUND_TRIP} ms round trip (${r.whileTyping} requests, ${r.stopped} stopped)`);
  assert(r.stuck <= 2 * ROUND_TRIP, `the same answer up ${r.stuck} ms while the typing went on (at most two round trips)`);
  assert(!r.gaps, `${r.gaps} frames with nothing answering the phrase after its first answer`);
  phrasePaced(r);
  return phraseLine(r);
});

// A newcomer: a device with no packs, every one on its way (held), typing at once. This device's index is there (made from what it has,
// nothing yet) but can't answer; the server does, as above, and once the packs are in, this device's own answer merges in, the box unmoved.
await stage("phrase-new: a new device typing the moment Translate opens, its packs all still coming, slowed 4×: an answer to the phrase's start within 400 ms of the first key and in every frame after it, never 500 ms behind the typing; the server asked one at a time, at most once in 300 ms; this device's own once the packs are in, the box unmoved; judged on the page's own share, a miss with a server reply over 120 ms NOT REACHED, as phrase", async (opened) => {
  const FIRST_ANSWER = 400;
  const KEEP_UP = 500;
  const r = await phraseRun(opened, { way: "newcomer" });
  phraseJudge(r, { firstAnswer: FIRST_ANSWER, keepUp: KEEP_UP });
  assert(r.ownWait !== null, "this device never answered for itself once its packs were in (every pack here and its index knowing hond, in 60 s)");
  return `${phraseLine(r)}; the page's own share: requests at most ${r.latest} ms after they were due, replies drawn within ${r.drawLag} ms, the slowest reply ${r.slowest} ms`;
});

await stage("working: Tinta only while there's nothing to show: none for a quick answer, none with the server out behind an answer, large with nothing yet; taking no presses and clear of every word", async (opened) => {
  const page = await today(opened);
  const status = '[data-part="looking-up"]';
  // A quick server and a word on the device: Tinta never appears.
  await page.evaluate((status) => {
    window.lxStatusSeen = 0;
    new MutationObserver(() => {
      if ([...document.querySelectorAll(status)].some((n) => n.checkVisibility())) window.lxStatusSeen++;
    }).observe(document.body, { childList: true, subtree: true });
  }, status);
  await page.context().route((url) => url.pathname === "/api/translate", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ query: "x", from: "nl", to: "en", whole: null, words: [], sentences: [], unknown: [], sources: [], found: 0, tokens: [], alternatives: [], main: [] }) }));
  // Its index is got ready as the box gets focus: a quick answer is one from then on. Waited for, not timed (with path-nl's lessons
  // too, on a busy machine, 2 s wasn't always enough: the query went the cold way and was rightly slow).
  await typeIn(page, "");
  await page.evaluate(async () => (await import("/js/translate/translate.js")).translate("boek", { from: "nl", to: "en" }));
  await page.keyboard.type("boek");
  await settled(page);
  assert(!(await page.evaluate(() => window.lxStatusSeen)), "Tinta flashed for a quick answer");
  // The server slow, a word on the device: its results at once, no Tinta, and nothing moves.
  await page.context().unroute((url) => url.pathname === "/api/translate");
  let release;
  const held = new Promise((r) => (release = r));
  await page.context().route((url) => url.pathname === "/api/translate", async (route) => {
    await held;
    await route.continue().catch(() => {});
  });
  await page.evaluate(() => (window.lxStatusSeen = 0));
  await page.locator(FIELD).fill("lezen");
  await page.locator(best).filter({ hasText: "to read" }).waitFor({ timeout: 2000 });
  await page.waitForTimeout(800);
  assert(!(await page.evaluate(() => window.lxStatusSeen)), "Tinta's looking with an answer already there");
  await page.screenshot({ path: `${OUT}/09-page-server-out.png` });
  // Nothing on the device: large Tinta within a moment, in the results' place, clear of the field.
  await page.locator(FIELD).fill("xyzzyqq");
  await page.locator(`.lx-tr-top ${status}`).waitFor({ timeout: 2000 });
  const big = await page.evaluate((status) => {
    const s = document.querySelector(`.lx-tr-top ${status}`);
    const r = s.querySelector('[data-part="character"]').getBoundingClientRect();
    const f = document.querySelector('[data-part="translate-field"]').getBoundingClientRect();
    return { clear: r.top >= f.bottom, words: s.textContent.trim(), height: r.height };
  }, status);
  assert(big.clear && /Looking it up/.test(big.words) && big.height >= 32, `with nothing to show: ${JSON.stringify(big)}`);
  await page.screenshot({ path: `${OUT}/10-page-looking.png` });
  await sheet(page, "10-looking");
  release();
  await none(page).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500); // its way out (page.js sayWorking: 180 ms)
  assert(!(await visible(page, status)), "Tinta's still writing once it's answered");
  return `large: "${big.words}"`;
});

// An answer that comes while Tinta looks: the server slow and this device's index not ready (its first, or one made again as a pack comes),
// on a slowed phone. Tinta's box is read before the answer's writes (page.js draw → sayWorking), so the answer's task lays nothing out, and a
// new "In your packs" is made after the frame the answer is drawn in, in a task of its own. On the code before (9 Nov 2026), Tinta's box was
// read after the answer's writes, a forced layout of the whole answer, and its rows were built in the same task: together a 66 ms task at 4×
// (the speed stage's limit is 50).
const DRAW_FORCED = 5;
// This device's index held from the start (its worker's "built" and "loaded" kept back until lxReleaseIndex()): with none, a key goes the
// server's way (translate.js making), and a server held as well leaves nothing to show, so Tinta looks.
const holdIndex = `(() => {
  const Real = window.Worker;
  window.lxIndexHeld = [];
  window.lxHoldIndex = true;
  window.lxReleaseIndex = () => {
    window.lxHoldIndex = false;
    for (const go of window.lxIndexHeld.splice(0)) go();
  };
  window.Worker = class extends Real {
    constructor(url, options) {
      super(url, options);
      this.lxIndex = String(url).includes("/js/translate/worker.js");
    }
    get onmessage() {
      return super.onmessage;
    }
    set onmessage(handle) {
      const held = (event) => {
        if (window.lxHoldIndex && (event.data?.type === "built" || event.data?.type === "loaded")) return void window.lxIndexHeld.push(() => handle.call(this, event));
        return handle.call(this, event);
      };
      super.onmessage = this.lxIndex && typeof handle === "function" ? held : handle;
    }
  };
})();`;
/** The answer's task and "In your packs"'s in a trace of the draw stage, found by the marks the page made as each was drawn (a mark's own
 * time in the trace is inside the task that made it; a page time read there fell at the next task's start at a task's end): each task's CPU,
 * the style and layout run inside it (any is forced: a frame's own run in a task of their own), and whether a frame was drawn between the two. */
function drawCost(events, { answered, inline: inlineMark }) {
  const markOf = (name) => events.find((e) => e.name === name && /user_timing/.test(e.cat ?? ""));
  const marked = markOf(answered);
  if (!marked) return null;
  const main = events.filter((e) => e.pid === marked.pid && e.tid === marked.tid && e.ph === "X" && typeof e.ts === "number");
  const cpu = (e) => (typeof e.tdur === "number" ? e.tdur : e.dur ?? 0) / 1000;
  const taskAt = (mark) => (mark ? main.filter((e) => /RunTask/.test(e.name) && e.ts <= mark.ts && e.ts + (e.dur ?? 0) >= mark.ts).sort((a, b) => b.dur - a.dur)[0] ?? null : null);
  const within = (task, names) => main.filter((e) => names.includes(e.name) && e.ts >= task.ts && e.ts + (e.dur ?? 0) <= task.ts + task.dur);
  const of = (task) =>
    task && {
      cpu: cpu(task),
      clock: task.dur / 1000,
      forced: within(task, ["UpdateLayoutTree", "Layout"]).reduce((sum, e) => sum + cpu(e), 0),
      elements: within(task, ["UpdateLayoutTree"]).reduce((sum, e) => sum + (e.args?.elementCount ?? 0), 0),
      // A frame's own work in it: then it's no task of the answer's own to judge.
      frame: within(task, ["FireAnimationFrame", "Paint", "Commit"]).length > 0,
    };
  const answer = taskAt(marked);
  const inline = taskAt(markOf(inlineMark));
  const between = answer && inline && inline !== answer ? main.some((e) => e.name === "Commit" && e.ts >= answer.ts + answer.dur && e.ts + (e.dur ?? 0) <= inline.ts) : false;
  return { answer: of(answer), inline: inline === answer ? "the answer's" : of(inline), between };
}

await stage(`draw: an answer that comes while Tinta looks (the server slow, this device's index not ready), at 4×: its task forces under ${DRAW_FORCED} ms of style and layout (Tinta's box read before the answer's writes), and what your packs have with it is made after the answer's frame, in a task of its own`, async (opened) => {
  const word = "lezen";
  const page = await today(opened, { init: holdIndex });
  let release;
  const held = new Promise((r) => (release = r));
  await page.context().route((url) => url.pathname === "/api/translate", async (route) => {
    await held;
    await route.continue().catch(() => {});
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate((word) => {
    const results = document.querySelector(".lx-tr-results");
    const draw = (window.lxDraw = { answeredAt: null, inlineAt: null, frame: 0, answeredFrame: null, inlineFrame: null, leaving: false });
    const tick = () => {
      draw.frame++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // A MutationObserver's callback runs as its mutations' task ends: its time is inside that task.
    new MutationObserver((records) => {
      if (draw.answeredAt === null && results.dataset.query === word) {
        draw.answeredAt = performance.now();
        performance.mark("lx-draw-answered");
        draw.answeredFrame = draw.frame;
        draw.leaving = Boolean(document.querySelector(".lx-tr-scroll > [data-leaving]"));
      }
      if (draw.answeredAt !== null && draw.inlineAt === null && records.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1 && n.matches(".lx-tr-inline")))) {
        draw.inlineAt = performance.now();
        performance.mark("lx-draw-inline");
        draw.inlineFrame = draw.frame;
      }
    }).observe(results, { attributes: true, attributeFilter: ["data-query"], childList: true });
  }, word);
  // The word in at once (one key's worth: a word typed letter by letter has the server's answer to its first letter drawn first).
  await typeIn(page, "");
  await page.locator(FIELD).fill(word);
  // Tinta looking, large, in the results' place: nothing to show.
  await page.locator('.lx-tr-top [data-part="looking-up"]').waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  const traced = [];
  cdp.on("Tracing.dataCollected", ({ value }) => traced.push(...value));
  await cdp.send("Tracing.start", { categories: TRACE_CATEGORIES, transferMode: "ReportEvents" });
  release();
  const drawn = await page
    .waitForFunction(() => window.lxDraw.answeredAt !== null && window.lxDraw.inlineAt !== null, null, { timeout: 15_000, polling: 50 })
    .then(() => true, () => false);
  await page.waitForTimeout(300);
  const complete = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
  await cdp.send("Tracing.end");
  await complete;
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const seen = await page.evaluate(() => window.lxDraw);
  await page.evaluate(() => window.lxReleaseIndex());
  assert(seen.answeredAt !== null, `the server's answer to ${word} was never drawn`);
  assert(drawn, `nothing your packs have came under ${word}'s answer (drawn at ${Math.round(seen.answeredAt)} ms, frame ${seen.answeredFrame})`);
  assert(seen.leaving, "Tinta wasn't on its way out as the answer came: what this stage times didn't happen");
  const cost = drawCost(traced, { answered: "lx-draw-answered", inline: "lx-draw-inline" });
  if (process.env.LX_TRACE) writeFileSync(`${OUT}/draw.json`, JSON.stringify({ seen, cost, traceEvents: traced }));
  assert(cost?.answer, "the trace has no task around the answer's drawing (its mark, lx-draw-answered): its CPU can't be read");
  assert(!cost.answer.frame, `the answer was drawn inside a frame's own task: ${JSON.stringify(cost.answer)}`);
  const r = (x) => (typeof x === "number" ? x.toFixed(1) : x);
  const said = `the answer's task ${r(cost.answer.cpu)} ms of CPU (${r(cost.answer.clock)} by the clock), ${r(cost.answer.forced)} of it style and layout forced (${cost.answer.elements} elements); what your packs have ${cost.inline === "the answer's" ? "built in that same task" : `in a task of its own, ${r(cost.inline?.cpu)} ms of CPU, ${seen.inlineFrame - seen.answeredFrame} frame(s) after${cost.between ? ", a frame committed between" : ""}`}`;
  assert(cost.answer.forced < DRAW_FORCED, `${said}: ${r(cost.answer.forced)} ms forced (under ${DRAW_FORCED} at 4×)`);
  assert(cost.inline !== "the answer's" && seen.inlineFrame > seen.answeredFrame && cost.between, `${said}: what your packs have wasn't made after the answer's frame`);
  return said;
});

await stage("truth: a server that's down, or too slow, never makes a false no: the page says only what's on this device; offline, no Find a pack; Find a pack's Retry asks again", async (opened) => {
  const page = await today(opened);
  let mode = "down";
  const route = async (route) => {
    if (mode === "down") return route.abort().catch(() => {});
    await route.continue().catch(() => {});
  };
  await page.context().route((url) => url.pathname === "/api/translate" || url.pathname === "/api/translate/find", route);
  await typeIn(page, "xyzzyq");
  await none(page).waitFor({ timeout: 15_000 });
  await none(page).filter({ hasText: "Not in your packs" }).waitFor({ timeout: 15_000 });
  let said = await page.locator(".lx-today-translate").innerText();
  assert(!/Not in Lexicommons/.test(said), `the server down: ${said}`);
  await noAi(page, "no answer");
  await page.screenshot({ path: `${OUT}/11-page-no-answer.png` });
  await sheet(page, "11-no-answer");
  // Looking for a pack with the server down: it says so, and Retry asks again.
  await openSheet(page);
  await page.locator('.lx-sheet-body [data-part="retry-line"] button').waitFor({ timeout: 15_000 });
  mode = "up";
  await page.locator('.lx-sheet-body [data-part="retry-line"] button').tap();
  await page.locator('.lx-sheet-body [data-part="empty-state"]').waitFor({ timeout: 15_000 });
  await closeSheet(page);
  // A word on the device with the server down: it's shown, from your packs, with nothing about the server.
  mode = "down";
  await page.locator(FIELD).fill("boek");
  await page.locator(best).waitFor({ timeout: 5000 });
  await page.waitForTimeout(800);
  assert((await sourceOf(page)) === "From your packs", `boek: ${await sourceOf(page)}`);
  // Offline: what's on the device; nothing found says your packs, and there's nothing to press for a pack.
  await page.context().setOffline(true);
  await page.locator(FIELD).fill("lezen");
  await page.locator(best).filter({ hasText: "to read" }).waitFor({ timeout: 5000 });
  await page.locator(FIELD).fill("xyzzyq");
  await none(page).filter({ hasText: "Not in your packs" }).waitFor({ timeout: 5000 });
  said = await page.locator(".lx-today-translate").innerText();
  assert(!/Not in Lexicommons/.test(said) && !(await page.locator(wide).count()), `offline: ${said}`);
  await page.context().setOffline(false);
  // The online search says how its index came (to measure a first search on live).
  mode = "up";
  const timing = await page.evaluate(async () => (await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: "boek", language: "nl" }) })).headers.get("Server-Timing"));
  assert(/isolate;desc="\w+", index;desc="(built|kept|waited)"/.test(timing ?? ""), `Server-Timing: ${timing}`);
  return `down, retried, a device word with the server down, offline; ${timing}`;
});

await stage("voice: the speaker asks for the translation in its own language, both ways, and no voice for it says so; never a sound", async (opened) => {
  const VOICES = () => {
    // A device with Dutch and English voices (headless Chrome may have none), asked for and never heard.
    const voices = [{ voiceURI: "nl", name: "Dutch", lang: "nl-NL", localService: true, default: false }, { voiceURI: "en", name: "English", lang: "en-US", localService: true, default: true }];
    const synth = window.speechSynthesis;
    synth.getVoices = () => voices;
    const Real = window.SpeechSynthesisUtterance;
    window.SpeechSynthesisUtterance = function (text) {
      const u = new Real(text);
      let voice = null;
      Object.defineProperty(u, "voice", { get: () => voice, set: (v) => (voice = v) });
      return u;
    };
  };
  const page = await today(opened, { init: VOICES });
  await typeIn(page, "ik wil graag een biertje");
  await settled(page);
  await page.locator(`${best} [data-part="speak-button"]`).first().tap();
  await page.waitForTimeout(100);
  let said = await page.evaluate(() => window.lxSaid.slice());
  assert(said.at(-1)?.text === "I want gladly a beer" && /^en/.test(said.at(-1)?.lang ?? said.at(-1)?.voice ?? ""), `Dutch typed should say the English: ${JSON.stringify(said)}`);
  await page.locator(FIELD).fill("I want a beer");
  await settled(page);
  await page.locator(`${best} [data-part="speak-button"]`).first().tap();
  await page.waitForTimeout(100);
  said = await page.evaluate(() => window.lxSaid.slice());
  assert(/bier/.test(said.at(-1)?.text ?? "") && /^nl/.test(said.at(-1)?.lang ?? said.at(-1)?.voice ?? ""), `English typed should say the Dutch: ${JSON.stringify(said)}`);
  // A sentence Dutch typed: both sides have a speaker, each in its own language: the answer's, and the small one in the box.
  await page.locator(FIELD).fill(PLAIN.text);
  await settled(page);
  const answerSpeaker = page.locator(`${best} [data-part="speak-button"]`);
  const boxSpeaker = page.locator('.lx-tr-box-speak [data-part="speak-button"]');
  assert((await answerSpeaker.count()) === 1 && (await boxSpeaker.count()) === 1, `a sentence typed in Dutch should have a speaker on each side: ${await answerSpeaker.count()}, ${await boxSpeaker.count()}`);
  await answerSpeaker.tap();
  await page.waitForTimeout(100);
  said = await page.evaluate(() => window.lxSaid.slice());
  assert(said.at(-1)?.text === PLAIN.item.means, `the answer's speaker: ${JSON.stringify(said.at(-1))}`);
  await answerSpeaker.tap(); // pressed again, it stops
  await boxSpeaker.tap();
  await page.waitForTimeout(100);
  said = await page.evaluate(() => window.lxSaid.slice());
  assert(said.at(-1)?.text.replace(/\s+/g, " ").startsWith(PLAIN.text.slice(0, 8)), `the box's speaker: ${JSON.stringify(said.at(-1))}`);
  // No voice for the language: it says so.
  const none = await today(opened, { init: () => (window.speechSynthesis.getVoices = () => []) });
  await typeIn(none, "snowball");
  await settled(none);
  await none.locator(`${best} [data-part="speak-button"]`).first().tap();
  await none.locator(".lx-today-translate [role=status]", { hasText: "voice on this device" }).waitFor({ timeout: 2000 });
  return `said ${said.length} things, each in its language`;
});

await stage("layout: 320 to 390 wide, a long phrase grows the field and leaves the answer in reach; every control a thumb's size; the worker's absence changes nothing", async (opened) => {
  const LONG = "ik wil graag een biertje en ik wil ook graag een boek lezen want ik heb vandaag heel veel tijd en de hond loopt naar huis ".repeat(3).slice(0, 400).trim();
  for (const [width, height] of [[320, 568], [375, 667], [390, 844]]) {
    const page = await today(opened, { width, height });
    await typeIn(page, "");
    await page.locator(FIELD).fill(LONG);
    // Judged once the answer for what's typed is up, never a page still waiting for it.
    assert(await answered(page), `${width}: no answer for the 400-character phrase in 60 s`);
    await settled(page);
    const box = await page.evaluate((best) => {
      const f = document.querySelector('[data-part="translate-field"]').getBoundingClientRect();
      const b = document.querySelector(best)?.getBoundingClientRect();
      const area = document.querySelector('[data-part="translate-field"] :is(textarea, input)');
      const h = document.querySelector('[data-part="app-header"]').getBoundingClientRect();
      const scroller = document.querySelector(".lx-tr-scroll").getBoundingClientRect();
      return { wide: document.documentElement.scrollWidth - innerWidth, fieldTop: f.top, headerBottom: h.bottom, fieldH: f.height, fieldBottom: f.bottom, bestTop: b?.top, room: scroller.height, visible: visualViewport.height, areaFont: parseFloat(getComputedStyle(area).fontSize), pageScroll: document.querySelector('[data-part="page"]').scrollTop };
    }, best);
    assert(box.wide <= 0, `${width}: wider than the screen by ${box.wide}`);
    assert(box.fieldTop >= box.headerBottom - 1 && !box.pageScroll, `${width}: the field runs under the header: ${JSON.stringify(box)}`);
    assert(box.bestTop !== undefined, `${width}: no best guess on the page: ${JSON.stringify(box)}`);
    assert(box.room >= 60 && box.bestTop < box.visible, `${width}: the field leaves no room above the keys: ${JSON.stringify(box)}`);
    assert(box.areaFont >= 16, `${width}: the field's text is ${box.areaFont}px`);
    const small = await page.evaluate(() => {
      const out = [];
      for (const n of document.querySelectorAll('.lx-today-translate button, .lx-today-translate a, [data-part="app-back"]')) {
        if (!n.checkVisibility()) continue;
        const r = n.getBoundingClientRect();
        // Its reach counts (a ::before past its edges): by what answers at 22 px from its center.
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const answers = [[cx - 21, cy], [cx + 21, cy], [cx, cy - 21], [cx, cy + 21]].every(([x, y]) => {
          const hit = document.elementFromPoint(x, y);
          return !hit || hit === n || n.contains(hit) || y < 0 || y > innerHeight || hit.closest("[data-part=translate-field]") === null && hit.closest("button, a") === null;
        });
        if (!answers && (r.width < 44 || r.height < 44)) out.push(`${n.getAttribute("aria-label") ?? n.textContent.trim().slice(0, 20)} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
      return out;
    });
    assert(!small.length, `${width}: controls under 44 px: ${small.join("; ")}`);
    if (width === 320) {
      await page.screenshot({ path: `${OUT}/12-page-320-long.png` });
      await sheet(page, "12-320-long");
    }
  }
  const noWorker = await today(opened, { init: () => { delete window.Worker; window.Worker = undefined; } });
  await typeIn(noWorker, "ik wil graag een biertje");
  await settled(noWorker);
  assert(/I want gladly a beer/.test(await bestText(noWorker)), "without a worker there's no answer");
  return "320, 375, 390; no worker";
});

await stage("box: Home's box is Translate's field: a real tap anywhere across it but its way chip and mic opens Translate, the box's middle too; the way chip, a control of its own at least 44 px and clear of the middle, flips the way and opens nothing; at 390 and 320, and with the processor slowed 4×", async (opened) => {
  const BOX = '.lx-today-translate:not([data-open]) [data-part="translate-field"]';
  const CHIP = `${BOX} [data-part="translate-direction"]`;
  const out = [];
  for (const [width, height] of [[390, 844], [320, 568]]) {
    for (const cpu of [1, 4]) {
      const label = `${width} px${cpu > 1 ? `, ${cpu}×` : ""}`;
      const page = await today(opened, { width, height });
      if (cpu > 1) await (await page.context().newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: cpu });
      // Each tap on Home loaded again (about:blank first: a goto that only changes the hash loads nothing).
      const home = async () => {
        await page.goto("about:blank");
        await page.goto(`${BASE}/app/#today`);
        await ready(page);
        await page.locator(CHIP).waitFor({ state: "visible", timeout: 30_000 });
        await page.waitForTimeout(cpu > 1 ? 1200 : 400);
      };
      await home();
      const r = await page.evaluate(({ BOX, CHIP }) => {
        const rect = (node) => {
          const b = node.getBoundingClientRect();
          return { left: b.left, right: b.right, top: b.top, width: b.width, height: b.height };
        };
        const mic = document.querySelector(`${BOX} [data-part="mic-button"]`);
        return { box: rect(document.querySelector(BOX)), chip: rect(document.querySelector(CHIP)), mic: mic ? rect(mic) : null };
      }, { BOX, CHIP });
      const middle = Math.round(r.box.left + r.box.width / 2);
      assert(r.chip.width >= 44 && r.chip.height >= 44, `${label}: the way chip is ${Math.round(r.chip.width)} × ${Math.round(r.chip.height)} px`);
      assert(r.chip.left - middle >= 16, `${label}: the way chip starts ${Math.round(r.chip.left - middle)} px right of the box's middle (16 at least)`);
      // Across the box at its middle height, the chip's own middle and the box's among them; the mic isn't tapped (it would listen).
      const y = Math.round(r.box.top + r.box.height / 2);
      const xs = [...new Set([...Array.from({ length: Math.floor((r.box.width - 8) / 24) + 1 }, (_, k) => Math.round(r.box.left + 4 + k * 24)), middle, Math.round(r.chip.left + r.chip.width / 2)])]
        .filter((x) => x <= r.box.right - 4 && !(r.mic && x >= r.mic.left && x <= r.mic.right))
        .sort((a, b) => a - b);
      const did = [];
      for (const [k, x] of xs.entries()) {
        if (k) await home();
        const wayBefore = await page.locator(CHIP).getAttribute("aria-label");
        await page.touchscreen.tap(x, y);
        await page.waitForTimeout(cpu > 1 ? 1500 : 600);
        const open = await page.evaluate(() => Boolean(document.querySelector(".lx-today-translate[data-open]")));
        const wayAfter = await page.locator('[data-part="translate-direction"]').first().getAttribute("aria-label");
        did.push({ x, what: open ? (wayAfter === wayBefore ? "opened" : "opened and flipped") : wayAfter !== wayBefore ? "flipped" : "nothing" });
      }
      // A tap on the chip's very edge could go either way; every other one has one right answer.
      const onChip = (x) => x > r.chip.left + 1 && x < r.chip.right - 1;
      const onEdge = (x) => Math.abs(x - r.chip.left) <= 1 || Math.abs(x - r.chip.right) <= 1;
      const wrong = did.filter((d) => !onEdge(d.x) && (onChip(d.x) ? d.what !== "flipped" : d.what !== "opened"));
      assert(!wrong.length, `${label}: ${wrong.map((d) => `x ${d.x}: ${d.what}`).join(", ")} (the chip ${Math.round(r.chip.left)}–${Math.round(r.chip.right)}, the middle ${middle})`);
      assert(did.some((d) => d.x === middle && d.what === "opened"), `${label}: a tap at the box's middle didn't open Translate`);
      out.push(`${label}: ${did.length} taps right, the chip ${Math.round(r.chip.width)} × ${Math.round(r.chip.height)} px from ${Math.round(r.chip.left - middle)} px right of the middle`);
    }
  }
  return out.join("; ");
});

// ---------- dictation: real Whisper through Chrome's fake microphone, never out loud ----------

if (argv.includes("--dictation")) {
  const APP = resolve(dirname(new URL(import.meta.url).pathname), "..");
  // A WAV for the fake microphone: 48 kHz mono, quiet before the speech and after it, as a person leaves. It loops.
  const wavOf = (name, make) => {
    const wav = resolve(OUT, `${name}.wav`);
    const from = make();
    execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", from, "-af", "adelay=600:all=1,apad=pad_dur=2.5", "-ar", "48000", "-ac", "1", wav]);
    return wav;
  };
  const ENGLISH_SAID = "I read a book yesterday.";
  const DUTCH_SAID = "Ik heb gisteren een boek gelezen.";
  // say -o writes a file and makes no sound.
  const english = wavOf("english", () => {
    const aiff = resolve(OUT, "english.aiff");
    execFileSync("say", ["-v", "Samantha", "-o", aiff, ENGLISH_SAID]);
    return aiff;
  });
  const dutch = wavOf("dutch", () => resolve(APP, "public/audio/starter-word-order/emma/boek-gelezen.mp3"));
  const silence = resolve(OUT, "silence.wav");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "4", silence]);
  const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
  const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
  const COMPUTER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  const PROFILE = resolve(OUT, "profile");
  rmSync(PROFILE, { recursive: true, force: true });
  // whisper: chosen in Settings, which is the only way a phone gets it (speaking.js chooseDictation). computer: no touch.
  async function micPhone({ wav, init, fresh = false, refuse = false, userAgent = ANDROID, whisper = false, computer = false } = {}) {
    const dir = fresh ? `${PROFILE}-${Math.random().toString(36).slice(2, 8)}` : PROFILE;
    const flags = ["--enable-unsafe-webgpu", "--use-fake-device-for-media-stream", ...(refuse ? ["--deny-permission-prompts"] : ["--use-fake-ui-for-media-stream"]), ...(wav ? [`--use-file-for-fake-audio-capture=${wav}`] : [])];
    const context = await chromium.launchPersistentContext(dir, { headless: true, channel: "chrome", args: flags, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: !computer, hasTouch: !computer, userAgent });
    await context.addCookies(COOKIES);
    if (!refuse) await context.grantPermissions(["microphone"], { origin: new URL(BASE).origin });
    if (init) await context.addInitScript(init);
    const page = context.pages()[0] ?? (await context.newPage());
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${BASE}/app/#today`);
    await ready(page);
    await page.waitForSelector(FIELD, { timeout: 30_000 });
    if (whisper) await page.evaluate(async () => (await import("/js/study/settings.js")).setStudySetting("say.engine", "whisper"));
    // The speech module ahead of the press, as on the page after a moment.
    await page.waitForTimeout(1800);
    return { context, page };
  }
  const NO_RECOGNIZER = () => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
    Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
  };
  const MIC = '.lx-today-translate [data-part="mic-button"]'; // in the box on Home, in the bar on the page

  await stage("dictation-offer: a computer with no recognizer: the first press offers Whisper in place, with its size; Not now leaves typing as it was; Download brings it", async (opened) => {
    const one = await micPhone({ init: NO_RECOGNIZER, computer: true, userAgent: COMPUTER });
    opened.push(one);
    const { page } = one;
    // Smaller, as a phone's would be: this profile's model is what the stages below hear with.
    await page.evaluate(async () => (await import("/js/study/settings.js")).setStudySetting("say.model", "whisper-small"));
    await page.locator(MIC).click();
    const offer = page.locator(".lx-tr-offer");
    await offer.locator("p", { hasText: "It downloads once" }).waitFor({ timeout: 15_000 });
    const said = await offer.innerText();
    assert(/\d+ MB/.test(said), `the offer has no size: ${said}`);
    assert(await page.evaluate(() => !document.querySelector(".lx-today-date")?.checkVisibility()), "the mic didn't open the page");
    await page.screenshot({ path: `${OUT}/sheet-20-offer.png` });
    await noAi(page, "the offer");
    await offer.getByRole("button", { name: "Not now" }).click();
    assert(!(await offer.locator("p").count()), "Not now left the offer");
    await page.locator(FIELD).click({ position: { x: 24, y: 20 } });
    await page.keyboard.type("boek");
    await page.locator(best).waitFor({ timeout: 15_000 });
    await page.locator(MIC).click();
    await offer.getByRole("button", { name: "Download" }).click();
    await page.locator('[data-part="download-bar"]').waitFor({ timeout: 10_000 });
    await page.screenshot({ path: `${OUT}/sheet-21-downloading.png` });
    await offer.locator("p", { hasText: "Press the microphone" }).waitFor({ timeout: 300_000 });
    return said;
  });

  await stage("dictation-english: said in English: it's written down, the way set to English to Dutch, and translated", async (opened) => {
    const one = await micPhone({ wav: english, whisper: true });
    opened.push(one);
    const { page } = one;
    await page.locator(MIC).tap();
    await page.screenshot({ path: `${OUT}/sheet-22-listening.png` });
    await page.waitForFunction(() => document.querySelector('[data-part="translate-field"] textarea')?.value.length > 3, null, { timeout: 90_000 });
    await settled(page);
    const value = await page.locator(FIELD).inputValue();
    const way = await page.locator('[data-part="translate-direction"]').getAttribute("aria-label");
    assert(/book/i.test(value), `heard: ${value}`);
    assert(/^English to Dutch/.test(way), `the way: ${way}`);
    assert((await bestText(page)).includes("boek"), `the answer: ${await bestText(page)}`);
    await page.screenshot({ path: `${OUT}/sheet-23-heard.png` });
    return `"${value}"; ${way}`;
  });

  await stage("dictation-dutch: said in Dutch: the way set to Dutch to English, and the other language's reading one tap away", async (opened) => {
    const one = await micPhone({ wav: dutch, whisper: true });
    opened.push(one);
    const { page } = one;
    await page.locator(MIC).tap();
    await page.waitForFunction(() => document.querySelector('[data-part="translate-field"] textarea')?.value.length > 3, null, { timeout: 90_000 });
    await settled(page);
    const value = await page.locator(FIELD).inputValue();
    const way = await page.locator('[data-part="translate-direction"]').getAttribute("aria-label");
    assert(/boek/i.test(value), `heard: ${value}`);
    assert(/^Dutch to English/.test(way), `the way: ${way}`);
    const other = page.locator(".lx-tr-voice button", { hasText: "Or in English" });
    let note = "no other reading";
    if (await other.count()) {
      await other.tap();
      await settled(page);
      assert(/^English to Dutch/.test(await page.locator('[data-part="translate-direction"]').getAttribute("aria-label")), "the other reading didn't change the way");
      note = `other reading: ${await page.locator(FIELD).inputValue()}`;
    }
    return `"${value}"; ${way}; ${note}`;
  });

  await stage("dictation-quiet: nothing said: it says so, and pressing while it listens stops it", async (opened) => {
    const one = await micPhone({ wav: silence, whisper: true });
    opened.push(one);
    const { page } = one;
    await page.locator(MIC).tap();
    await page.locator(".lx-today-translate [role=status]", { hasText: /Heard nothing/ }).waitFor({ timeout: 40_000 });
    await page.locator(MIC).tap();
    await page.locator(`${MIC}[data-state="listening"], ${MIC}[data-state="hearing"]`).waitFor({ timeout: 30_000 });
    await page.locator(MIC).tap();
    await page.waitForFunction((mic) => !document.querySelector(mic)?.hasAttribute("data-state"), MIC, { timeout: 30_000 });
    return "heard nothing; stopped";
  });

  await stage("dictation-refused: the microphone refused: it says so, and typing still works", async (opened) => {
    const one = await micPhone({ refuse: true, whisper: true });
    opened.push(one);
    const { page } = one;
    await page.locator(MIC).tap();
    await page.locator(".lx-tr-scroll .lx-settings-message", { hasText: /./ }).waitFor({ timeout: 30_000 });
    const said = await page.locator(".lx-tr-scroll .lx-settings-message").innerText();
    await page.locator(FIELD).tap({ position: { x: 24, y: 20 } });
    await page.keyboard.type("boek");
    await page.locator(best).waitFor({ timeout: 15_000 });
    return said;
  });

  const STAND_IN = () => {
    window.lxHeardIn = [];
    class Recognizer extends EventTarget {
      start() {
        window.lxHeardIn.push(this.lang);
        window.lxSayIt = null;
        const lang = this.lang;
        this.timer = setTimeout(() => {
          this.onstart?.();
          this.onaudiostart?.();
          this.onspeechstart?.();
          const transcript = lang.startsWith("en") ? "the book" : "het boek";
          const alternative = { transcript, confidence: 0.9 };
          const result = Object.assign([alternative], { isFinal: true });
          // Held until the check says, so it can press the switch while it listens.
          window.lxSayIt = () => {
            this.onresult?.({ resultIndex: 0, results: Object.assign([result], { length: 1 }) });
            this.onend?.();
          };
        }, 50);
      }
      stop() {
        this.onend?.();
      }
      abort() {
        clearTimeout(this.timer);
        this.onerror?.({ error: "aborted" });
        this.onend?.();
      }
    }
    Object.defineProperty(window, "webkitSpeechRecognition", { value: Recognizer, configurable: true, writable: true });
    Object.defineProperty(window, "SpeechRecognition", { value: Recognizer, configurable: true, writable: true });
  };

  await stage("dictation-browser: no Whisper here: the browser's recognizer in one language, a press to switch, and what it heard sets the way", async (opened) => {
    const one = await micPhone({ init: STAND_IN, fresh: true });
    opened.push(one);
    const { page } = one;
    await page.locator(MIC).tap();
    // The bubble says which language it's listening in; a press on the other flag changes it.
    await page.locator('.lx-way-tab[data-code="nl"][aria-pressed="true"]').waitFor({ timeout: 20_000 });
    assert((await page.evaluate(() => window.lxHeardIn.at(-1))).startsWith("nl"), "it should start in the language you're learning");
    await page.screenshot({ path: `${OUT}/sheet-24-browser.png` });
    await page.locator('.lx-way-tab[data-code="en"]').tap();
    await page.waitForFunction(() => window.lxHeardIn.at(-1)?.startsWith("en"), null, { timeout: 15_000 });
    await page.waitForFunction(() => typeof window.lxSayIt === "function", null, { timeout: 15_000 });
    await page.evaluate(() => window.lxSayIt());
    await page.waitForFunction(() => document.querySelector('[data-part="translate-field"] textarea')?.value === "the book", null, { timeout: 15_000 });
    const way = await page.locator('[data-part="translate-direction"]').getAttribute("aria-label");
    assert(/^English to Dutch/.test(way), `the way: ${way}`);
    return way;
  });

  await stage("dictation-iphone: an iPhone's Home Screen app whose recognizer really fails: it tried, it says so, and Whisper's never offered", async (opened) => {
    const one = await micPhone({
      fresh: true,
      userAgent: IPHONE,
      init: () => {
        Object.defineProperty(navigator, "standalone", { value: true });
        // Safari's: only the prefixed name, and no available().
        const Fails = class {
          start() {
            window.lxBrowserUsed = true;
            this.onerror?.({ error: "service-not-allowed" });
            this.onend?.();
          }
          stop() {}
          abort() {}
        };
        Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true, writable: true });
        Object.defineProperty(window, "webkitSpeechRecognition", { value: Fails, configurable: true, writable: true });
      },
    });
    opened.push(one);
    const { page } = one;
    await page.locator(MIC).tap();
    const line = page.locator(".lx-tr-scroll .lx-settings-message", { hasText: /wouldn't start/ });
    await line.waitFor({ timeout: 20_000 });
    assert(await page.evaluate(() => window.lxBrowserUsed), "it never tried the recognizer");
    assert(!(await page.locator(".lx-tr-offer p").count()), "it offered Whisper on a phone");
    return await line.innerText();
  });
}

// Last: it changes the local catalog, which makes the server read its library again.
if (PERSIST) {
  await stage("book: a book's sentences online: a long one clipped around the word, a tap shows it whole, credited, no Find the pack; one typed whole both ways, the long one whole", async (opened) => {
    const restore = await seedCheckBook(PERSIST);
    try {
      const page = await today(opened);
      // The server looks for a new catalog at most every 30 s.
      const started = Date.now();
      const asked = () => page.evaluate(async () => (await import("/js/translate/translate.js")).translate("kaarsvetvlek", { from: "nl", to: "en" }));
      let found = await asked();
      while (!found.words?.length && Date.now() - started < 60_000) {
        await page.waitForTimeout(2000);
        found = await asked();
      }
      assert(found.words?.length, "the server never found the book's word");
      const [short, long, third] = [CHECK_BOOK.sentences[1], CHECK_BOOK.sentences[0], CHECK_BOOK.sentences[2]];
      await typeIn(page, "kaarsvetvlek");
      await settled(page);
      assert((await bestText(page)).includes("candle wax stain"), `kaarsvetvlek: ${await bestText(page)}`);
      const text = () => page.locator(".lx-today-translate").innerText();
      assert((await text()).includes(CHECK_BOOK.credit), `the book's credit isn't there: ${(await text()).slice(0, 400)}`);
      assert(!(await text()).includes("Find the pack"), "a book's word offers a pack");
      await noAi(page, "a book's word");
      // Its sentences are under the answer, in place, the credits folded a tap away.
      await openPacks(page);
      const inSheet = () => page.locator(INLINE).innerText();
      await page.locator(`${INLINE} .lx-tr-credits > summary`).tap();
      assert((await inSheet()).includes(CHECK_BOOK.credit), `the credit, opened: ${(await inSheet()).slice(-300)}`);
      const clip = page.locator(".lx-tr-clip");
      assert((await clip.count()) === 1, `the long sentence should show clipped, once: ${await clip.count()}`);
      const shownClipped = await clip.innerText();
      assert(shownClipped.includes("kaarsvetvlek") && shownClipped.includes("…") && shownClipped.length < third.nl.length, `clipped: ${shownClipped}`);
      await page.screenshot({ path: `${OUT}/book-clipped.png` });
      await sheet(page, "book-clipped");
      await clip.tap();
      assert((await clip.count()) === 0 && (await inSheet()).includes(third.nl), "a tap should show the whole sentence");
      assert(!(await page.locator("[data-clipped]").count()), "still marked clipped after the tap");
      await page.screenshot({ path: `${OUT}/book-whole.png` });
      await closePacks(page);
      // One typed whole, both ways.
      await page.locator(FIELD).fill(short.nl);
      await settled(page);
      assert((await bestText(page)).includes(short.en) && !/Rough guess/.test(await bestText(page)), `the book's sentence: ${await bestText(page)}`);
      await page.locator(FIELD).fill(short.en);
      await settled(page);
      assert((await bestText(page)).includes(short.nl) && !/Rough guess/.test(await bestText(page)), `its English: ${await bestText(page)}`);
      // The long one as the answer: never clipped there.
      await page.locator(FIELD).fill(long.nl);
      await settled(page);
      assert((await bestText(page)).includes(long.en), `the long one: ${await bestText(page)}`);
      await sheet(page, "book-long");
      return `clipped to "${shownClipped}", whole on a tap, credited; "${short.nl}" both ways; waited ${Math.round((Date.now() - started) / 1000)} s in all`;
    } finally {
      restore();
    }
  });
} else console.log("SKIP book: needs --persist-to <the server's state>, to put a book in its library");

// Tinta and an answer only the server has (a book's word; the device has nothing for it): Tinta never comes in for a quick answer,
// and for a slow one the answer shows the frame it arrives while Tinta leaves over several frames, the answer staying where it is.
// Today's 150 ms delay fails the first (a quick answer came at about 400 ms and Tinta flashed); a page holding the answer back for
// Tinta's sake fails the second.
if (PERSIST) {
  await stage("tinta: none for an answer the server gives quickly; for a slow one, the answer the frame it arrives, Tinta leaving over frames (never one), the answer staying put", async (opened) => {
    const restore = await seedCheckBook(PERSIST);
    try {
      const page = await today(opened);
      // Words only the book has: in no pack this device knows.
      const forms = new Set(KNOWN.flatMap((s) => s.item.words.map(([w]) => w.toLowerCase().replace(/[^\p{L}]/gu, ""))));
      const only = [...new Set(CHECK_BOOK.sentences.flatMap((s) => s.nl.toLowerCase().match(/\p{L}+/gu)))].filter((w) => w.length >= 7 && !forms.has(w));
      const ask = (word) => page.evaluate(async (word) => (await import("/js/translate/translate.js")).translate(word, { from: "nl", to: "en" }), word);
      const words = [];
      const started = Date.now();
      for (const word of only) {
        if (words.length === 2) break;
        let found = await ask(word);
        // The server looks for a new catalog at most every 30 s.
        while (!found.words?.length && !found.sentences?.length && Date.now() - started < 60_000) {
          await page.waitForTimeout(2000);
          found = await ask(word);
        }
        if (found.words?.length || found.sentences?.length) words.push(word);
      }
      assert(words.length === 2, `two words only the book has, found by the server: ${words} of ${only}`);
      // What each frame shows, and when an answer came from the server.
      await page.evaluate(() => {
        window.__arrived = [];
        const fetched = window.fetch;
        window.fetch = async (...args) => {
          const response = await fetched(...args);
          // Translate's own answers only (not /api/translate/find or /languages).
          if (new URL(String(args[0]?.url ?? args[0]), location.href).pathname === "/api/translate") window.__arrived.push(performance.now());
          return response;
        };
        document.addEventListener("input", () => (window.__lastKey = performance.now()), true);
        window.__frames = [];
        const tick = () => {
          const look = document.querySelector('.lx-today-translate [data-part="looking-up"]');
          const answer = document.querySelector('.lx-tr-results [data-part="translate-result"][data-state="best"]');
          window.__frames.push({ t: performance.now(), tinta: look?.checkVisibility() ? Number(getComputedStyle(look).opacity) : 0, leaving: Boolean(look?.hasAttribute("data-leaving")), answer: Boolean(answer), top: answer ? Math.round(answer.getBoundingClientRect().top) : null });
          if (window.__framing) requestAnimationFrame(tick);
        };
        window.__framing = true;
        requestAnimationFrame(tick);
      });
      const watch = async (word) => {
        await page.evaluate(() => { window.__frames.length = 0; window.__arrived.length = 0; });
        await page.locator(FIELD).fill(word);
        await settled(page);
        await page.waitForTimeout(600);
        return page.evaluate(() => {
          const key = window.__lastKey;
          const arrived = window.__arrived.find((t) => t >= key) ?? null;
          return { key, arrived, frames: window.__frames.filter((f) => f.t >= key) };
        });
      };
      await typeIn(page, "");
      // A quick answer: the server as it is.
      const quick = await watch(words[0]);
      const quickMs = quick.arrived === null ? null : Math.round(quick.arrived - quick.key);
      const quickTinta = quick.frames.filter((f) => f.tinta > 0).length;
      assert(quickMs !== null && quick.frames.some((f) => f.answer), `no answer from the server for ${words[0]}`);
      assert(quickMs < 550, `the server took ${quickMs} ms: too slow here to be the quick case (the machine is busy?)`);
      assert(quickTinta === 0, `Tinta came in for a quick answer: ${quickTinta} frames (the answer came ${quickMs} ms after the last key)`);
      // A slow answer: the server held 1.5 s.
      await page.locator(FIELD).fill("");
      await page.context().route((url) => url.pathname === "/api/translate", async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue().catch(() => {});
      });
      const slow = await watch(words[1]);
      await page.context().unroute((url) => url.pathname === "/api/translate");
      const shownAt = slow.frames.find((f) => f.answer)?.t ?? null;
      assert(slow.arrived !== null && shownAt !== null, `no answer from the held server for ${words[1]}`);
      const before = slow.frames.filter((f) => f.t < slow.arrived && f.tinta > 0 && !f.leaving).length;
      const late = Math.round(shownAt - slow.arrived);
      const after = slow.frames.filter((f) => f.t >= shownAt && f.tinta > 0);
      const lingering = slow.frames.filter((f) => f.t > shownAt + 450 && f.tinta > 0).length;
      const tops = new Set(slow.frames.filter((f) => f.t >= shownAt && f.top !== null).map((f) => f.top));
      assert(before > 0, "Tinta never came in while the server was held 1.5 s");
      assert(late <= 80, `the answer was drawn ${late} ms after it arrived: held back`);
      assert(after.length >= 3, `Tinta left in ${after.length} frame(s) once the answer was there: a vanish, not a way out`);
      assert(after.every((f, i) => i === 0 || f.tinta <= after[i - 1].tinta + 0.01), `Tinta's way out didn't fade: ${after.map((f) => f.tinta.toFixed(2))}`);
      assert(lingering === 0, `Tinta still there ${lingering} frames past 450 ms after the answer`);
      assert(tops.size === 1, `the answer moved while Tinta left: tops ${[...tops]}`);
      await page.evaluate(() => (window.__framing = false));
      return `quick: the answer at ${quickMs} ms, no Tinta; slow: Tinta in ${before} frames, the answer ${late} ms after it arrived, Tinta out over ${after.length} frames, the answer still`;
    } finally {
      restore();
    }
  });
} else console.log("SKIP tinta: needs --persist-to <the server's state>, to put a book in its library");

for (const name of Object.keys(results)) if (!results[name].ok) console.log(`\n${name}\n${results[name].note}`);
if (errors.length) {
  failed++;
  console.log(`page errors:\n${errors.join("\n")}`);
}
// The test account goes.
const deleted = await signup.evaluate(async () => (await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).status).catch(() => null);
writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, errors, deleted }, null, 1));
await browser.close();
const unreached = Object.keys(results).filter((name) => results[name].notReached).map((name) => name.split(":")[0]);
console.log(
  `\n${Object.values(results).filter((r) => r.ok).length}/${Object.keys(results).length} stages passed` +
    (unreached.length ? `; NOT REACHED: ${unreached.join(", ")} (the machine was measured too busy to judge it). RUN IT AGAIN: a Translate landing doesn't count until it passes` : ""),
);
process.exit(failed ? 1 : notReached ? 2 : 0);
