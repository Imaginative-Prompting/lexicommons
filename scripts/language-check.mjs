// Settings → Language in Chrome on a phone (shell/interface-language.js, shell/settings-packs.js languageSettings): I speak, App language, Grow.
// With only English shipped: I speak from the phone's languages, a language the app hasn't got kept and said plainly, App language offering
// nothing else, Grow saying it isn't ready. Then with Dutch planted as a shipped locale, as a real one arrives (lx/locales.js reads the list
// from /js/i18n/shipped.js and the words from /i18n/nl.json; the plant is built here from this copy's English, with one entry stale as a
// control): App language offering Dutch, the app's words and <html lang> in it at once and after a reload, back to the same as I speak;
// Grow off until it's turned on, a message turning Dutch once you know every word of it and one with a word you don't staying English,
// learning a word growing its message on the next draw, Grow off again, and no Grow beside an App language.
// LOCAL only (it signs up accounts), path-nl seeded (the words' forms come from it). node scripts/language-check.mjs http://localhost:<port> <outDir>
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import("./quiet-browser.mjs");

const [BASE, outArg] = process.argv.slice(2);
if (!BASE || !outArg || !/^http:\/\/localhost/.test(BASE)) {
  console.error("Usage: language-check.mjs http://localhost:<port> <outDir> (LOCAL only: it signs up accounts)");
  process.exit(2);
}
const OUT = resolve(outArg);
mkdirSync(join(OUT, "shots"), { recursive: true });
const APP = resolve(new URL("..", import.meta.url).pathname);
let failed = 0;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
const stage = async (name, run) => {
  try {
    const said = await run();
    console.log(`ok    ${name}${said ? `: ${said}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${String(error.message ?? error).slice(0, 400)}`);
  }
};

// ---------- the plant: Dutch, shipped ----------
const { englishEntries, textHash } = await import(pathToFileURL(join(APP, "public/js/lx/i18n.js")).href);
const english = new Map(englishEntries().map(({ key, text }) => [key, text]));
const DUTCH = {
  "settings.language.iSpeak": "Ik spreek",
  "settings.language.sameAsISpeak": "Hetzelfde als ik spreek",
  "settings.language.appLanguage": "Taal van de app",
};
// Translated from English that has since changed: the app must show the English (readStrings leaves it out).
const STALE = { "settings.language.learning": "Leren" };
for (const key of [...Object.keys(DUTCH), ...Object.keys(STALE)]) if (!english.has(key)) throw new Error(`this copy has no English for ${key}: the plant would prove nothing`);
const plantFile = {
  format: "lexicommons-strings",
  version: 1,
  locale: "nl",
  strings: {
    ...Object.fromEntries(Object.entries(DUTCH).map(([key, text]) => [key, { text, from: textHash(english.get(key)) }])),
    ...Object.fromEntries(Object.entries(STALE).map(([key, text]) => [key, { text, from: textHash(`${english.get(key)} (as it once was)`) }])),
  },
};

const browser = await chromium.launch({ headless: true, channel: "chrome" });
async function newAccount(name, { plant = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark", locale: "en-US" });
  if (plant) {
    await context.route(/\/js\/i18n\/shipped\.js(\?|$)/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: 'export const SHIPPED = ["en", "nl"];\n' }));
    await context.route(/\/i18n\/nl\.json(\?|$)/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(plantFile) }));
  }
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log(`  pageerror: ${error.message}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', name);
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]");
  return { context, page };
}
const openLanguage = async (page) => {
  await page.evaluate(() => (location.hash = "#settings/language"));
  await page.locator('[data-part="page-title"]', { hasText: "Language" }).first().waitFor();
  await page.waitForTimeout(400);
};
// A row on the page by its title (its words now), and what it says.
const row = (page, title) => page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: title }) }).first();
const rowText = async (page, title) => (await row(page, title).innerText()).replace(/\s+/g, " ").trim();
const kept = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("lx.interface.v1") ?? "null"));
const htmlLang = (page) => page.evaluate(() => document.documentElement.lang);
const pageText = (page) => page.locator("#root").innerText();
const sheetUp = (page) => page.locator('[role="dialog"]').last().waitFor();
const sheetGone = (page) => page.waitForFunction(() => !document.querySelector(".lx-sheet-layer, [data-sheet-open]"), null, { timeout: 5_000 }).catch(() => {});

// ---------- only English shipped ----------
const plain = await newAccount("Language Plain");
await stage("Settings → Language with only English: one quiet line in place of I speak, App language and Grow (the app is in English alone for now)", async () => {
  const { page } = plain;
  await openLanguage(page);
  const text = await pageText(page);
  assert(/English\. More languages are coming\./.test(text), `the page doesn't say so: ${text.slice(0, 300)}`);
  for (const gone of ["I speak", "App language", "Grow into Dutch"]) assert(!(await page.locator('[data-part="page"]:not([hidden]) .lx-row-title', { hasText: gone }).count()), `a ${gone} row with only English`);
  assert((await htmlLang(page)) === "en", `<html lang> is ${await htmlLang(page)}`);
  await page.screenshot({ path: join(OUT, "shots", "01-only-english.png") });
});
await plain.context.close();

// ---------- Dutch shipped (planted) ----------
const nl = await newAccount("Language Dutch", { plant: true });
await stage("with Dutch shipped, App language offers the same as I speak and Dutch", async () => {
  const { page } = nl;
  await openLanguage(page);
  await row(page, "App language").click();
  await sheetUp(page);
  const options = await page.locator('[role="dialog"] input[name="app-language"]').evaluateAll((inputs) => inputs.map((i) => i.value));
  assert(options.join() === ",nl", `offered: ${JSON.stringify(options)}`);
  await page.screenshot({ path: join(OUT, "shots", "03-app-language-sheet.png") });
});
await stage("Dutch picked: the app's words in Dutch at once, <html lang> with them, and a stale entry in English", async () => {
  const { page } = nl;
  await page.locator('[role="dialog"] label:has(input[name="app-language"][value="nl"])').click();
  await sheetGone(page);
  await page.waitForFunction(() => document.documentElement.lang === "nl", null, { timeout: 5_000 });
  await page.waitForTimeout(400);
  const text = await pageText(page);
  for (const words of Object.values(DUTCH).filter((w) => w !== DUTCH["settings.language.sameAsISpeak"])) assert(text.includes(words), `"${words}" isn't on the page`);
  assert(text.includes(english.get("settings.language.learning")) && !text.includes(STALE["settings.language.learning"]), "the stale entry shows its old Dutch");
  assert((await kept(page))?.app === "nl", `kept: ${JSON.stringify(await kept(page))}`);
  assert(!(await page.locator('[role="switch"]').count()), "Grow is offered beside an App language");
  await page.screenshot({ path: join(OUT, "shots", "04-app-in-dutch.png") });
  return `${Object.keys(DUTCH).length - 1} planted entries on the page, the stale one English`;
});
await stage("a reload starts in Dutch", async () => {
  const { page } = nl;
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  assert((await htmlLang(page)) === "nl", `<html lang> is ${await htmlLang(page)} at the start`);
  await openLanguage(page);
  assert((await pageText(page)).includes(DUTCH["settings.language.iSpeak"]), "the page isn't in Dutch after a reload");
});
await stage("back to the same as I speak: English again", async () => {
  const { page } = nl;
  await row(page, DUTCH["settings.language.appLanguage"]).click();
  await sheetUp(page);
  await page.locator('[role="dialog"] label:has(input[name="app-language"][value=""])').click();
  await sheetGone(page);
  await page.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 5_000 });
  await page.waitForTimeout(400);
  assert(/I speak/.test(await pageText(page)), "the page isn't English again");
  assert((await kept(page))?.app === null, `kept: ${JSON.stringify(await kept(page))}`);
});
await stage("Grow: a switch, off until it's turned on", async () => {
  const { page } = nl;
  const sw = row(page, "Grow into Dutch").locator('[role="switch"]');
  assert((await sw.count()) === 1, "no switch");
  assert(!(await sw.isChecked()), "on before it was turned on");
  assert((await kept(page))?.grow === false, `kept: ${JSON.stringify(await kept(page))}`);
});

// Words made known as a learner comes to know them: right answers spread over three weeks (the scheduler calls a word known from its evidence).
const knowWords = (page, lemmas) =>
  page.evaluate(async (lemmas) => {
    const { record, knows } = await import("/js/study/progress.js");
    const DAY = 86_400_000;
    const now = Date.now();
    record(lemmas.flatMap((lemma, i) => [21, 14, 7, 3, 1, 0].map((daysAgo, k) => ({ concept: `w:${lemma}`, at: now - daysAgo * DAY - 3_600_000 - i * 1000 - k * 10, outcome: "right", test: "recall", skill: "read", activity: "choose" }))));
    return lemmas.filter((lemma) => !knows(`w:${lemma}`, { lang: "nl" }));
  }, lemmas);
// The dictionary forms of written words, once the packs are in (new-words.js lemmaOfForm, as Grow reads them); polled in the page.
const lemmasOf = (page, forms) =>
  page.evaluate(async (forms) => {
    const { lemmaOfForm } = await import("/js/study/new-words.js");
    for (let waited = 0; waited < 60_000; waited += 300) {
      const found = forms.map((form) => lemmaOfForm(form));
      if (found.every(Boolean)) return found;
      await new Promise((r) => setTimeout(r, 300));
    }
    return forms.map((form) => lemmaOfForm(form) ?? null);
  }, forms);

await stage("Grow on: a message whose every word you know turns Dutch; one with a word you don't stays English", async () => {
  const { page } = nl;
  const [ik, spreek] = await lemmasOf(page, ["ik", "spreek"]);
  assert(ik && spreek, `the packs have no dictionary form for ${[!ik && "ik", !spreek && "spreek"].filter(Boolean).join(", ")}: seed path-nl`);
  const unknown = await knowWords(page, [ik, spreek]);
  assert(!unknown.length, `not known after three weeks right: ${unknown.join(", ")}`);
  await row(page, "Grow into Dutch").locator('[role="switch"]').click();
  await page.waitForFunction((words) => document.getElementById("root")?.innerText.includes(words), DUTCH["settings.language.iSpeak"], { timeout: 5_000 });
  const text = await pageText(page);
  assert(text.includes(english.get("settings.language.sameAsISpeak")), "Same as I speak grew with hetzelfde and als unknown");
  assert(text.includes(english.get("settings.language.appLanguage")), "App language grew with taal unknown");
  assert((await htmlLang(page)) === "en", `<html lang> is ${await htmlLang(page)}: the app is English with words grown`);
  assert((await kept(page))?.grow === true, `kept: ${JSON.stringify(await kept(page))}`);
  await page.screenshot({ path: join(OUT, "shots", "05-grow-ik-spreek.png") });
  return `"${DUTCH["settings.language.iSpeak"]}" grown (${ik}, ${spreek} known)`;
});
await stage("a word learned grows its message: the next draw shows it", async () => {
  const { page } = nl;
  const [hetzelfde, als] = await lemmasOf(page, ["hetzelfde", "als"]);
  assert(hetzelfde && als, `the packs have no dictionary form for ${[!hetzelfde && "hetzelfde", !als && "als"].filter(Boolean).join(", ")}`);
  const unknown = await knowWords(page, [hetzelfde, als]);
  assert(!unknown.length, `not known: ${unknown.join(", ")}`);
  // Grown a second after the last answer, and shown on the next draw.
  await page.waitForTimeout(1600);
  await page.evaluate(() => (location.hash = "#today"));
  await page.waitForTimeout(600);
  await openLanguage(page);
  const text = await pageText(page);
  assert(text.includes(DUTCH["settings.language.sameAsISpeak"]), "Same as I speak didn't grow once every word of it was known");
  await page.screenshot({ path: join(OUT, "shots", "06-grow-hetzelfde.png") });
});
await stage("Grow off: every word English again", async () => {
  const { page } = nl;
  await row(page, "Grow into Dutch").locator('[role="switch"]').click();
  await page.waitForFunction((words) => !document.getElementById("root")?.innerText.includes(words), DUTCH["settings.language.iSpeak"], { timeout: 5_000 });
  assert((await kept(page))?.grow === false, `kept: ${JSON.stringify(await kept(page))}`);
});
await nl.context.close();

await browser.close();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
