// Ask anything (public/js/ai/ask.js), end to end in Chrome: the "…" on Study's result, a concept's page, a word in the
// reader and Translate's sentences. Each opens its menu (on screen, the keys moving in it, Escape and a press outside
// closing it); Explain this sends a question carrying what it's about, with Undo; the sheet shows what it's about and
// sends your own; Copy the question copies it; no key reaches the session under the menu or the sheet; a word's
// meaning, grown by the line about it, never covers its word. The reader's stage needs the live library copied into
// the local state (skipped without it). LOCAL only: it signs up a test account.
// Usage: node scripts/ask-check.mjs http://localhost:<port> <outDir>   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { knowWords } from "./fixtures/know-words.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/ask-check.mjs http://localhost:<port> <outDir> (a local server only: it signs up a test account)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
// The "…" is off unless it's been turned on (ai/ask.js): this check is of what it does when it's on.
await context.addInitScript(() => localStorage.setItem("lx.ai.ask-anywhere.v1", "on"));
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const results = {};
let failed = 0;
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
async function stage(name, fn) {
  try {
    results[name] = { ok: true, note: (await fn()) ?? "" };
    console.log(`PASS ${name}: ${results[name].note}`);
  } catch (error) {
    failed++;
    results[name] = { ok: false, note: String(error.stack ?? error) };
    console.log(`FAIL ${name}: ${error.message}`);
    await page.screenshot({ path: `${OUT}/fail-${Object.keys(results).length}.png` }).catch(() => {});
  }
}
// Stills once what's moving has settled.
const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
};
const requests = () => page.evaluate(async () => (await (await fetch("/api/ai/requests")).json()).requests);
const newest = async () => (await requests())[0];
const MENU = '.lx-menu-layer[data-part="menu"]';
const item = (title) => page.locator(`${MENU} [data-part="menu-item"]`, { hasText: title });
// The menu is on screen, side to side and top to bottom.
async function onScreen() {
  const box = await page.locator(MENU).boundingBox();
  assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, `menu on screen: ${JSON.stringify(box)}`);
  return box;
}

const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Ask Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
await page.waitForSelector("html[data-app-ready]");
// The "…" needs an AI to answer it, as well as the switch (a token will do).
await page.evaluate(() => fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "an AI, for this check" }) }));
await page.reload();
await page.waitForSelector("html[data-app-ready]");

const BAR = '[data-part="session"] [data-part="answer-bar"]';
const MORE = `${BAR} [aria-haspopup="menu"]`;
const STATUS = `${BAR} [data-part="ask-status"]`;

await stage("Study: the … on a result opens its menu; the keys move in it, Escape closes it, the session stays", async () => {
  await knowWords(page);
  await page.goto(`${BASE}/app/#study/session/game/choose`);
  await page.locator('[data-part="session"] [data-part="choice"]').first().waitFor();
  const before = await page.locator('[data-part="session"] [data-part="answer-bar"] [aria-haspopup="menu"]').count();
  assert(before === 0, "no … before an answer");
  const picked = (await page.locator('[data-part="session"] [data-part="choice"]').first().innerText()).trim();
  await page.locator('[data-part="session"] [data-part="choice"]').first().click();
  await page.locator(MORE).waitFor();
  await page.locator(MORE).click();
  await page.locator(MENU).waitFor();
  const box = await onScreen();
  const focused = () => page.evaluate(() => document.activeElement?.closest('[data-part="menu-item"]')?.textContent ?? document.activeElement?.getAttribute("aria-label"));
  assert(/^Explain this/.test(await focused()), `first item focused: ${await focused()}`);
  await page.keyboard.press("ArrowDown");
  assert(/^Ask your AI about this/.test(await focused()), `down: ${await focused()}`);
  await page.keyboard.press("End");
  assert(/^Copy the question/.test(await focused()), `end: ${await focused()}`);
  await page.keyboard.press("ArrowDown");
  assert(/^Explain this/.test(await focused()), `wraps: ${await focused()}`);
  await shot("01-study-menu");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".lx-menu-layer"));
  assert(await page.locator('[data-part="session"]').count(), "Escape closed the menu, not the session");
  assert((await focused()) === "More about this sentence", `focus back on the …: ${await focused()}`);
  // A press outside closes it too.
  await page.locator(MORE).click();
  await page.locator(MENU).waitFor();
  await page.mouse.click(30, 120);
  await page.waitForFunction(() => !document.querySelector(".lx-menu-layer"));
  return `menu at ${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}; picked “${picked}”`;
});

await stage("Study: Explain this sends a question carrying the sentence, the game and your answer; Undo cancels it", async () => {
  await page.locator(MORE).click();
  await item("Explain this").click();
  await page.locator(STATUS, { hasText: "Sent to your AI" }).waitFor();
  const r = await newest();
  assert(r.kind === "ask" && r.state === "waiting" && /^Explain this sentence/.test(r.what), `request: ${JSON.stringify(r)}`);
  const a = r.about;
  assert(a.where === "study" && a.language === "nl" && a.sentence?.text && a.sentence.natural && a.game === "Choose" && typeof a.right === "boolean" && a.answer && a.unit?.id, `about: ${JSON.stringify(a)}`);
  await shot("02-study-sent");
  await page.locator(STATUS).locator('[data-part="button"]', { hasText: "Undo" }).click();
  await page.locator(STATUS, { hasText: "Canceled" }).waitFor();
  const after = (await requests()).find((x) => x.id === r.id);
  assert(after.state === "canceled", `canceled: ${after.state}`);
  return `about ${JSON.stringify(a)}`;
});

await stage("Study: the sheet shows what it's about; Enter and Escape never reach the session; your question goes", async () => {
  const steps = await page.locator('[data-part="session"]').getAttribute("aria-label");
  const count = await page.locator('[data-part="session-bar"]').innerText().catch(() => "");
  await page.locator(MORE).click();
  await item("Ask your AI about this").click();
  const SHEET = '.lx-sheet-layer:not([hidden]) [data-part="sheet"]';
  await page.locator(SHEET).waitFor();
  const about = (await page.locator(`${SHEET} [data-part="ask-about"]`).innerText()).replace(/\s+/g, " ");
  const note = await page.locator(`${SHEET} .lx-muted`).first().innerText();
  assert(/Choose · your answer was (right|wrong)/.test(about), `about card: ${about}`);
  assert(/the sentence, the game, your answer and the pattern/.test(note) && /its Dutch marked/.test(note), `note: ${note}`);
  assert(await page.evaluate(() => document.activeElement?.tagName === "TEXTAREA"), "the field has focus");
  // Send with nothing written: it asks for the question. Enter on the button never continues the session.
  await page.locator(`${SHEET} [data-part="button"]`, { hasText: "Send to your AI" }).focus();
  await page.keyboard.press("Enter");
  await page.locator(`${SHEET} [data-part="ask-status"]`, { hasText: "Write your question first." }).waitFor();
  assert((await page.locator('[data-part="session-bar"]').innerText().catch(() => "")) === count, "the session didn't go on");
  await shot("03-study-sheet");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".lx-sheet-layer:not([hidden])"));
  assert(await page.locator('[data-part="session"]').count(), "Escape closed the sheet, not the session");
  // Again, with a question.
  await page.locator(MORE).click();
  await item("Ask your AI about this").click();
  await page.locator(SHEET).waitFor();
  await page.locator(`${SHEET} textarea`).fill("Why does gelezen go to the end?");
  await page.locator(`${SHEET} [data-part="button"]`, { hasText: "Send to your AI" }).click();
  await page.waitForFunction(() => !document.querySelector(".lx-sheet-layer"));
  await page.locator(STATUS, { hasText: "Sent to your AI" }).waitFor();
  const r = await newest();
  assert(r.what === "Why does gelezen go to the end?" && r.about?.where === "study", `request: ${JSON.stringify(r)}`);
  return `session ${steps}; sent “${r.what}”`;
});

await stage("Study: Copy the question copies it with what it's about", async () => {
  await page.locator(MORE).click();
  await item("Copy the question").click();
  await page.locator(STATUS, { hasText: "Copied" }).waitFor();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  assert(/^I'm learning Dutch with Lexicommons\. Explain this sentence/.test(text) && /The sentence: "/.test(text) && /\(Choose\)/.test(text), `copied: ${text}`);
  return text.replace(/\n+/g, " ⏎ ").slice(0, 200);
});

await stage("A concept's page: the … by its name, Explain this carries the pattern and its example", async () => {
  await page.keyboard.press("Escape").catch(() => {});
  await page.goto(`${BASE}/app/#know/p%3Av2`);
  await page.reload();
  const more = page.locator('[data-part="concept-head"] [aria-haspopup="menu"]');
  await more.waitFor();
  await more.click();
  await onScreen();
  await shot("04-concept-menu");
  await item("Explain this").click();
  await page.locator('[data-part="concept-head"] [data-part="ask-status"]', { hasText: "Sent to your AI" }).waitFor();
  const r = await newest();
  assert(/^Explain the pattern “Verb second”/.test(r.what) && r.about.where === "concept" && r.about.unit?.id === "p:v2" && r.about.unit.name === "Verb second", `request: ${JSON.stringify(r)}`);
  await shot("05-concept-sent");
  return `${r.what} · sentence: ${r.about.sentence?.text ?? "none"}`;
});

await stage("The reader: a word's meaning has a …; its menu opens below the popover; Explain this carries the word, its sentence and the book", async () => {
  const catalogue = await fetch(`${BASE}/library/catalogue.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const meta = catalogue?.books?.find((b) => b.layers?.nl?.kind === "weave");
  if (!meta) return "no woven book on this server (skipped)";
  await page.goto(`${BASE}/app/#read`);
  await page.waitForSelector("html[data-app-ready]");
  await page.locator('[data-part="page"] :is(.lx-read-shelf, .lx-continue-top) [data-part="book-tile"]', { hasText: meta.title.slice(0, 20) }).first().click();
  await page.waitForURL(/#read\/book\//);
  const READER = '[data-part="reader"]:not([data-ghost])';
  await page.waitForSelector(`${READER}[data-ready]`);
  // Know some words, so some show in Dutch.
  await page.evaluate(async (id) => {
    const store = await import("/js/read/store.js");
    const weave = await store.getWeave(id, "nl");
    const { knownForShare } = await import("/js/read/woven-text.js");
    const bank = await import("/js/read/bank.js");
    for (const lemma of knownForShare(weave, 0.35)) bank.addWord("nl", lemma);
  }, meta.id);
  await page.reload();
  await page.waitForSelector(`${READER}[data-ready]`);
  const word = await page.evaluateHandle((sel) => [...document.querySelectorAll(`${sel} [data-part="reader-text"] [data-part="woven-word"]`)].find((n) => {
    const r = n.getBoundingClientRect();
    return r.width && r.top > innerHeight * 0.35 && r.bottom < innerHeight - 120 && r.left > 8 && r.right < innerWidth - 8;
  }), READER);
  assert(await word.evaluate((n) => Boolean(n)), "a woven word on screen");
  await word.asElement().click();
  const pop = page.locator(`${READER} [data-part="word-popover"]`);
  await pop.waitFor();
  const said = await pop.locator("strong").innerText();
  await pop.locator('[aria-haspopup="menu"]').click();
  await page.locator(MENU).waitFor();
  const box = await onScreen();
  const popBox = await pop.boundingBox();
  assert(box.y >= popBox.y + popBox.height - 1 || box.y + box.height <= popBox.y + 1, `the menu keeps the popover in sight: menu ${JSON.stringify(box)}, popover ${JSON.stringify(popBox)}`);
  await shot("06-reader-menu");
  await item("Explain this").click();
  await pop.locator('[data-part="ask-status"]', { hasText: "Sent to your AI" }).waitFor();
  assert(await pop.isVisible(), "the meaning stays open");
  // Grown by the line, it's placed again: it never covers its word.
  await page.waitForTimeout(700);
  const grown = await pop.boundingBox();
  const at = await word.asElement().boundingBox();
  assert(grown.height > popBox.height && (grown.y + grown.height <= at.y + 1 || grown.y >= at.y + at.height - 1), `the meaning clear of its word: popover ${JSON.stringify(grown)}, word ${JSON.stringify(at)}`);
  const r = await newest();
  const a = r.about;
  assert(a.where === "reader" && a.word?.text === said && a.book?.id === meta.id && Number.isInteger(a.book.at) && a.sentence?.text, `about: ${JSON.stringify(a)}`);
  await shot("07-reader-sent");
  await page.keyboard.press("Escape");
  return `“${said}”: ${JSON.stringify(a).slice(0, 220)}`;
});

await stage("Translate: no ask menu on it, its sentences or its best guess (nothing on it needs an AI)", async () => {
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]");
  await page.locator('[data-part="translate-field"] textarea').fill("read");
  await page.locator('[data-part="translate-result"]').first().waitFor({ timeout: 15_000 });
  const menus = await page.locator('.lx-today-translate [aria-haspopup="menu"]').count();
  assert(!menus, `${menus} ask menus on Translate`);
  assert(!/\bAI\b/.test(await page.locator(".lx-today-translate").innerText()), "Translate mentions an AI");
  // Its sentences are under the answer, in place ("In your packs").
  await page.evaluate(() => { document.activeElement?.blur?.(); window.lxKeyboard?.(0); });
  const inline = page.locator(".lx-today-translate .lx-tr-inline");
  await inline.waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => document.querySelector(".lx-today-translate .lx-tr-inline")?.innerText.trim().length > 40, null, { timeout: 15_000 });
  const inSentences = await inline.locator('[aria-haspopup="menu"]').count();
  assert(!inSentences, `${inSentences} ask menus in its sentences`);
  assert(!/\bAI\b/.test(await inline.innerText()), "its sentences mention an AI");
  return "no menus, on the page or in its sentences";
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.join("\n"));
});

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log(`${Object.keys(results).length - failed}/${Object.keys(results).length} stages passed`);
await browser.close();
process.exit(failed ? 1 : 0);
