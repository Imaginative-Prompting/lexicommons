// A learner's own languages on a phone (12 Nov 2026: packs in a language Lexicommons doesn't list), end to end on a local server: their AI makes
// two packs over MCP, one in a made-up language with spaces (Testish) and one written right to left without them (Rtlish); the device keeps
// both languages (registered and stored), and the learning list shows each by its name with its mark, never its code. Learning Testish: Home's
// first lesson is its pack's, the header's chip its mark alone, no book card, a lesson played to its summary, Knowledge with its words. What's
// off for it says why where it would have been: the speaking games, Say it's reason, Read's empty shelf, the AI section's Practice. Rtlish: its
// sentence joined with nothing and laid out right to left, a lesson to its summary. A reload keeps it from the first line; a second device
// signed in to the account gets the packs, the languages and the progress. No console error on any page.
// Worked cases (the director, 12 Nov 2026): Burmese (my), Myanmar script we serve no font for, written without spaces, at 320 wide: the phone's
// own font draws it, its lines wrap inside the screen with nothing clipped, a tapped word shows its meaning. Toki Pona (tok), made over MCP as
// an AI that has read only the guide makes it (its first try refused saying what to change); its sentences as it writes them, never capitalized.
// Every sentence here is written for this check. 3b: Practice with your AI and the asks are offered in a language of your own (a text for Read
// isn't); a practice in Burmese, with the check as the AI over MCP: it joins seeing Burmese by name and how it's written, its line in Burmese,
// a typed answer graded on a Burmese word, End and its summary; Make a new pack asked in Burmese carries its definition to the AI.
// Usage: node scripts/own-language-check.mjs http://localhost:<port> <outDir> (LOCAL only; through gpu.py's parallel lane) (exit 0 = pass).

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { chromium } from "./quiet-browser.mjs";
import { SESSION, answerStep, nextStep, pastReminderAsk, playToSummary } from "./fixtures/play-session.mjs";

const [BASE, outArg] = process.argv.slice(2);
if (!BASE || !outArg) {
  console.error("Usage: node scripts/own-language-check.mjs http://localhost:<port> <outDir>");
  process.exit(2);
}
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("own-language-check runs against a local server only (it makes accounts and packs).");
  process.exit(2);
}
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });

const results = [];
async function stage(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - started, detail });
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const word = (id, text, literal, natural, lemmas, wrong, gap) => ({ id, sentence: text, lemmas, literal, english: null, natural, wrong, gap, patterns: ["greeting"] });
const PATTERNS = { greeting: { name: "Greetings", about: "How people greet, thank and part." } };
const TESTISH = {
  name: "Testish first words",
  language: "und-x-testish",
  language_def: { name: "Testish" },
  items: [
    word("suilad", "Suilad mellon.", ["Greetings", "friend"], "Greetings, friend.", { mellon: "mellon" }, ["Mellon suilad."], { word: "mellon", options: ["mellon", "mellyn", "meleth"] }),
    word("mae", "Mae govannen.", ["Well", "met"], "Well met.", { govannen: "govannen" }, ["Govannen mae."], { word: "govannen", options: ["govannen", "govanen", "govannon"] }),
    word("hannon", "Hannon le.", ["Thanks", "to you"], "Thank you.", { hannon: "hannon" }, ["Le hannon."], { word: "le", options: ["le", "lin", "len"] }),
    word("navaer", "Navaer mellon.", ["Farewell", "friend"], "Farewell, friend.", { navaer: "navaer", mellon: "mellon" }, ["Mellon navaer."], { word: "mellon", options: ["mellon", "mellyn", "meleth"] }),
  ],
  words: { mellon: "friend", govannen: "met", hannon: "thanks", navaer: "farewell" },
  patterns: PATTERNS,
};
const unspaced = (id, words, literal, natural, wrong, gap, lemmas) => ({ id, sentence: `${words.join("")}።`, words, lemmas, literal, english: null, natural, wrong: [wrong], gap, patterns: ["greeting"] });
const RTLISH = {
  name: "Rtlish first words",
  language: "und-x-rtlish",
  language_def: { name: "Rtlish", direction: "rtl", written: "unspaced", case: "any", ends: ["።"] },
  items: [
    unspaced("selam", ["ሰላም", "ነህ"], ["Peace", "are you"], "Are you well?", "ነህሰላም።", { word: "ነህ", options: ["ነህ", "ነሽ", "ናችሁ"] }, { ሰላም: "ሰላም" }),
    unspaced("dehna", ["ደህና", "ነኝ"], ["Fine", "I am"], "I'm fine.", "ነኝደህና።", { word: "ነኝ", options: ["ነኝ", "ነህ", "ነሽ"] }, { ደህና: "ደህና" }),
    unspaced("wuha", ["ውሃ", "እፈልጋለሁ"], ["Water", "I want"], "I want water.", "እፈልጋለሁውሃ።", { word: "ውሃ", options: ["ውሃ", "ቡና", "ሻይ"] }, { ውሃ: "ውሃ" }),
    unspaced("buna", ["ቡና", "እፈልጋለሁ"], ["Coffee", "I want"], "I want coffee.", "እፈልጋለሁቡና።", { word: "ቡና", options: ["ቡና", "ውሃ", "ሻይ"] }, { ቡና: "ቡና" }),
  ],
  words: { ሰላም: "peace", ደህና: "fine", ውሃ: "water", ቡና: "coffee" },
  patterns: PATTERNS,
};

const itself = (words) => Object.fromEntries(words.map((word) => [word, word]));
const my = (id, words, literal, natural, wrong, gap, pattern) => ({ id, sentence: `${words.join("")}။`, words, lemmas: itself(words), literal, english: null, natural, wrong: [wrong], gap, patterns: [pattern] });
const BURMESE = {
  name: "Burmese first words",
  language: "my",
  language_def: { name: "Burmese", written: "unspaced", case: "any", ends: ["။"] },
  items: [
    my("hello", ["မင်္ဂလာ", "ပါ"], ["Blessings", "(polite)"], "Hello.", "ပါမင်္ဂလာ။", { word: "မင်္ဂလာ", options: ["မင်္ဂလာ", "ကျေးဇူး", "ကောင်း"] }, "greeting"),
    my("well", ["နေ", "ကောင်း", "လား"], ["Stay", "well", "(asking)"], "Are you well?", "ကောင်းနေလား။", { word: "ကောင်း", options: ["ကောင်း", "သောက်", "ချင်"] }, "greeting"),
    my("water", ["ရေ", "သောက်", "ချင်", "တယ်"], ["Water", "drink", "want", "(it is so)"], "I want to drink water.", "သောက်ရေချင်တယ်။", { word: "ရေ", options: ["ရေ", "ကော်ဖီ", "လက်ဖက်ရည်"] }, "want"),
    my("coffee", ["ကော်ဖီ", "သောက်", "ချင်", "တယ်"], ["Coffee", "drink", "want", "(it is so)"], "I want to drink coffee.", "သောက်ကော်ဖီချင်တယ်။", { word: "ကော်ဖီ", options: ["ကော်ဖီ", "ရေ", "လက်ဖက်ရည်"] }, "want"),
    my("morning", ["မနက်", "တိုင်း", "လက်ဖက်ရည်", "သောက်", "ချင်", "တယ်"], ["Morning", "every", "tea", "drink", "want", "(it is so)"], "Every morning I want to drink tea.", "လက်ဖက်ရည်မနက်တိုင်းသောက်ချင်တယ်။", { word: "လက်ဖက်ရည်", options: ["လက်ဖက်ရည်", "ရေ", "ကော်ဖီ"] }, "want"),
  ],
  words: { မင်္ဂလာ: "blessings", ပါ: "(polite)", နေ: "stay", ကောင်း: "good", လား: "(asking)", ရေ: "water", သောက်: "drink", ချင်: "want", တယ်: "(it is so)", ကော်ဖီ: "coffee", မနက်: "morning", တိုင်း: "every", လက်ဖက်ရည်: "tea" },
  patterns: { ...PATTERNS, want: { name: "Wanting", about: "What you want to do: the thing, the verb, then ချင် (want) and တယ် (it is so)." } },
};
const tok = (id, text, literal, natural, wrong, gap) => ({ id, sentence: text, lemmas: itself(text.replace(/[.!?]$/, "").split(" ")), literal, english: null, natural, wrong: [wrong], gap, patterns: ["greeting"] });
const TOKI_PONA = {
  name: "Toki Pona first words",
  language: "tok",
  language_def: { name: "Toki Pona", case: "any" },
  items: [
    tok("sina", "sina pona.", ["You", "good"], "You're good.", "pona sina.", { word: "pona", options: ["pona", "ike", "suli"] }),
    tok("telo", "mi wile e telo.", ["I", "want", "(the thing:)", "water"], "I want water.", "telo e wile mi.", { word: "telo", options: ["telo", "moku", "pona"] }),
    tok("sonja", "jan Sonja li pona.", ["Person", "Sonja", "(is)", "good"], "Sonja is good.", "pona li Sonja jan.", { word: "pona", options: ["pona", "ike", "suli"] }),
    tok("moku", "mi wile moku.", ["I", "want", "eat"], "I want to eat.", "moku wile mi.", { word: "moku", options: ["moku", "lape", "toki"] }),
  ],
  words: { sina: "you", pona: "good", mi: "I; me", wile: "want", e: "(the thing:)", telo: "water", jan: "person", Sonja: "Sonja (a name)", li: "(is)", moku: "eat; food" },
  patterns: PATTERNS,
};
const OWN = ["my", "tok", "und-x-rtlish", "und-x-testish"];

const browser = await chromium.launch();
const errors = [];
const phone = async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light", hasTouch: true, isMobile: true, serviceWorkers: "block" });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${page.url()}: ${m.text().slice(0, 200)}`));
  page.on("response", (r) => r.status() >= 400 && errors.push(`${page.url()}: ${r.status()} for ${r.url()}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  return { context, page, cdp, authenticatorId };
};
const ready = (page) => page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
const go = async (page, hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(1200);
};
const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) });
const text = (page) => page.evaluate(() => document.querySelector('[data-part="app"]')?.innerText ?? "");
const learningNow = (page) => page.evaluate(async () => (await import("/js/study/learning.js")).learning());
const choose = async (page, code) => {
  await go(page, "#settings/language");
  await page.locator(`input[name="learning"][value="${code}"]`).first().check({ force: true });
  await page.waitForTimeout(1200);
  assert((await learningNow(page)) === code, `learning ${await learningNow(page)} after choosing ${code}`);
};
const playLesson = async (page) => {
  await go(page, "#today");
  await page.locator('[data-part="page"] [data-part="button"]', { hasText: "Start" }).first().click();
  await page.waitForSelector(SESSION, { timeout: 20_000 });
  const played = await playToSummary(page);
  await page.locator(`${SESSION} [data-part="button"]`, { hasText: "Done" }).first().click();
  await pastReminderAsk(page);
  await page.waitForFunction((S) => !document.querySelector(S), SESSION, { timeout: 20_000 });
  return played.length;
};

const first = await phone();
const { page } = first;
let token = "";
// One of the AI's tools over MCP, as the check's own AI calls it: its answer, or an Error with its words.
const tool = async (name, args) => {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const body = await response.text();
  const line = body.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${name}: ${response.status} ${body.slice(0, 200)}`);
  const { result, error } = JSON.parse(line.slice(6));
  if (error) throw new Error(`${name}: ${error.message}`);
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
};
const ROOM = ".lx-practice-room:not([data-ghost])";
try {
  await stage("their AI makes four packs in languages Lexicommons doesn't list, over MCP: Testish (spaces), Rtlish (right to left, unspaced), Burmese (Myanmar script, unspaced) and Toki Pona, the last two as an AI that has read only the guide sends them first (its definition's case left to its default), refused saying what to change, then made", async () => {
    await page.goto(`${BASE}/login?new=1`);
    await page.fill('input[name="name"]', "Own languages");
    await page.click('#register button[type="submit"]');
    await page.waitForURL(`${BASE}/app/**`, { timeout: 90_000 });
    await ready(page);
    await page.evaluate(async () => (await import("/js/lx/theme.js")).useTheme("paper"));
    token = await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Own language check" }) })).json()).token);
    const mcp = async (method, params) => {
      const response = await fetch(`${BASE}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      const line = (await response.text()).split("\n").find((l) => l.startsWith("data: "));
      return JSON.parse(line.slice(6));
    };
    await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "own-language-check", version: "1" } });
    const made = [];
    for (const pack of [TESTISH, RTLISH]) {
      const result = await mcp("tools/call", { name: "create_pack", arguments: pack });
      const said = JSON.parse(result.result.content[0].text);
      assert(!result.result.isError && said.sentences === pack.items.length, `${pack.name}: ${result.result.content[0].text.slice(0, 300)}`);
      made.push(`${said.pack_id} (${said.sentences})`);
    }
    for (const [pack, firstTry] of [[BURMESE, { name: "Burmese", written: "unspaced", ends: ["။"] }], [TOKI_PONA, { name: "Toki Pona" }]]) {
      const refused = await mcp("tools/call", { name: "create_pack", arguments: { ...pack, language_def: firstTry } });
      const told = refused.result.content[0].text;
      assert(refused.result.isError && told.includes('language_def \\"case\\": \\"any\\"'), `${pack.name}, a cold AI's first try: ${told.slice(0, 400)}`);
      const result = await mcp("tools/call", { name: "create_pack", arguments: pack });
      const said = JSON.parse(result.result.content[0].text);
      assert(!result.result.isError && said.sentences === pack.items.length, `${pack.name}: ${result.result.content[0].text.slice(0, 300)}`);
      made.push(`${said.pack_id} (${said.sentences}, after one refusal)`);
    }
    return made.join(", ");
  });

  await stage("the device takes all four: each language kept (in the registry and stored), and the learning list shows each by its name with its mark, never its code", async () => {
    await page.reload();
    await ready(page);
    let has = false;
    for (let i = 0; i < 60 && !has; i++) {
      await page.waitForTimeout(500);
      has = await page.evaluate(async (OWN) => {
        const languages = new Set((await import("/js/study/packs.js")).allPacks().map((p) => p.language));
        return OWN.every((code) => languages.has(code));
      }, OWN);
    }
    assert(has, "the device didn't take all four packs within 30 s");
    const kept = await page.evaluate(async () => {
      const { LANGUAGES } = await import("/js/lang/index.js");
      return { testish: LANGUAGES["und-x-testish"]?.own === true, rtlish: LANGUAGES["und-x-rtlish"]?.direction, burmese: LANGUAGES.my?.own === true, tokiPona: LANGUAGES.tok?.own === true, stored: Object.keys(JSON.parse(localStorage.getItem("lx.ownLanguages.v1") ?? "{}")).sort() };
    });
    assert(kept.testish && kept.rtlish === "rtl" && kept.burmese && kept.tokiPona && kept.stored.join() === OWN.join(), JSON.stringify(kept));
    await go(page, "#settings/language");
    const list = await page.evaluate(() =>
      ["und-x-testish", "und-x-rtlish", "my", "tok"].map((code) => {
        const row = document.querySelector(`input[name="learning"][value="${code}"]`)?.closest("label, [data-part='list-row'], li");
        return row ? { text: row.innerText.trim(), mark: Boolean(row.querySelector('[data-part="language-mark"]')) } : null;
      }),
    );
    await shot(page, "1-learning-list");
    assert(list.every(Boolean), `not in the learning list: ${JSON.stringify(list)}`);
    assert(list[0].text.includes("Testish") && list[1].text.includes("Rtlish") && list[2].text.includes("Burmese") && list[3].text.includes("Toki Pona") && list.every((row) => row.mark), JSON.stringify(list));
    assert(!/UND-X|und-x/.test(await text(page)), "a language's code shows on the page");
    return list.map((row) => row.text.replace(/\s+/g, " ")).join(" · ");
  });

  await stage("learning Testish: Home's first lesson is its pack's, the header's chip its mark alone, no book card; a lesson played to its summary; Knowledge has its words", async () => {
    await choose(page, "und-x-testish");
    await go(page, "#today");
    const home = await page.evaluate(() => ({
      card: document.querySelector('[data-part="page"]')?.innerText.includes("Testish first words") ?? false,
      chip: (() => {
        const chip = document.querySelector('[data-part="header-language"]');
        return chip ? { mark: Boolean(chip.querySelector('[data-part="language-mark"]')), text: chip.innerText.trim() } : null;
      })(),
      book: document.querySelector('[data-part="page"]')?.innerText.includes("Open a book") ?? false,
      // A section shown with nothing in it is a rule alone across the page.
      empty: [...document.querySelectorAll('[data-part="page"] [data-part="section"]')].filter((section) => section.checkVisibility() && section.getBoundingClientRect().height < 30).length,
    }));
    await shot(page, "2-home-testish");
    assert(home.card, "Home's first lesson isn't Testish's pack");
    assert(home.chip?.mark && !/UND|X-/.test(home.chip.text.replace(/^Te\s*/, "")), `the header's chip: ${JSON.stringify(home.chip)}`);
    assert(!home.book, "Home offers a book in a language of your own");
    assert(!home.empty, `${home.empty} section(s) shown with nothing in them`);
    const steps = await playLesson(page);
    await go(page, "#know/words");
    const words = await text(page);
    await shot(page, "3-knowledge-testish");
    assert(/mellon|govannen/.test(words), "Knowledge has none of Testish's words");
    return `${steps} steps to the summary`;
  });

  await stage("what's off for it says why where it would have been: the speaking games and Say it's reason, Read's empty shelf; the AI section offers Practice (typed, where nothing listens for it) and the asks it can have, never a text for Read", async () => {
    await go(page, "#study");
    const speaking = await page.evaluate(() =>
      [...document.querySelectorAll('[data-part="page"] [data-part="way-tile"], [data-part="page"] .lx-quick-play [data-part="button"]')]
        .filter((node) => /^(Say it|Say the word|Repeat after|Repeat the word)/.test(node.textContent.trim()))
        .map((node) => ({ name: node.textContent.trim(), off: node.getAttribute("aria-disabled") === "true" || node.dataset.state === "unavailable" || node.hasAttribute("data-unavailable") })),
    );
    assert(speaking.length >= 2 && speaking.every((game) => game.off), `the speaking games: ${JSON.stringify(speaking)}`);
    await page.locator('[data-part="page"] [data-part="way-tile"], [data-part="page"] .lx-quick-play [data-part="button"]', { hasText: "Say it" }).first().click();
    await page.waitForTimeout(900);
    await shot(page, "4-say-it-why");
    const why = await page.evaluate(() => document.body.innerText);
    assert(why.includes("Nothing on this device listens for Testish"), "Say it doesn't say why");
    await go(page, "#read");
    assert((await text(page)).includes("a language of your own"), "Read's empty shelf doesn't say why");
    await shot(page, "5-read");
    // The AI section (3b): Practice with your AI, and the asks a language of your own can have (a pack, your look), never a text for Read.
    await go(page, "#ai");
    const ai = await page.evaluate(() => ({
      start: [...document.querySelectorAll('[data-part="ai-practice"] [data-part="button"]')].some((button) => button.textContent.trim() === "Start"),
      asks: [...document.querySelectorAll('[data-part="page"] [data-part="list-row"] .lx-row-title')].map((node) => node.textContent.trim()),
    }));
    await shot(page, "6-ai");
    assert(ai.start, "the AI section doesn't offer Practice in Testish");
    for (const ask of ["Add to my pack", "Make a new pack", "Change my look"]) assert(ai.asks.includes(ask), `the AI section doesn't offer ${ask}: ${ai.asks.join(", ")}`);
    assert(!ai.asks.includes("Add a text"), "the AI section offers a text for Read in Testish");
    // How you'll answer, where nothing could listen for it (und-x-): typed, and said so.
    await go(page, "#practice/new/conversation");
    const setup = await text(page);
    await shot(page, "6b-practice-setup-testish");
    assert(setup.includes("How you'll answer") && setup.includes("Nothing listens for Testish"), `How you'll answer in Testish: ${setup.slice(0, 300)}`);
    return `${speaking.map((game) => game.name.replace(/\s+/g, " ")).join(", ")} off; Say it and Read say why; Practice offered, typed; asks: ${ai.asks.filter((row) => ["Add to my pack", "Make a new pack", "Change my look"].includes(row)).join(", ")}`;
  });

  await stage("Rtlish: right to left and written without spaces, its sentence its words joined with nothing; a lesson played to its summary", async () => {
    await choose(page, "und-x-rtlish");
    await go(page, "#today");
    await shot(page, "7-home-rtlish");
    await page.locator('[data-part="page"] [data-part="button"]', { hasText: "Start" }).first().click();
    await page.waitForSelector(SESSION, { timeout: 20_000 });
    await page.waitForTimeout(900);
    const seen = await page.evaluate((S) => {
      const target = [...document.querySelectorAll(`${S} [lang="und-x-rtlish"]`)].find((node) => node.checkVisibility() && node.textContent.trim());
      return target ? { text: target.textContent.trim(), dir: getComputedStyle(target).direction } : null;
    }, SESSION);
    await shot(page, "8-rtlish-step");
    assert(seen && seen.dir === "rtl", `Rtlish's words aren't laid out right to left: ${JSON.stringify(seen)}`);
    assert(!/[ሀ-ፚ]\s+[ሀ-ፚ]/.test(seen.text), `Rtlish's words are spaced: "${seen.text}"`);
    const played = await playToSummary(page);
    await page.locator(`${SESSION} [data-part="button"]`, { hasText: "Done" }).first().click();
    await pastReminderAsk(page);
    return `"${seen.text}" rtl; ${played.length} steps to the summary`;
  });

  await stage("a reload keeps it: the language learned and its rules known from the first line", async () => {
    // (Once the summary's way out has finished moving the page.)
    await page.waitForTimeout(1500);
    await page.reload().catch(async (error) => {
      if (!/ERR_ABORTED/.test(error.message)) throw error;
      await page.waitForTimeout(1500);
      await page.reload();
    });
    await ready(page);
    const now = await page.evaluate(async () => ({ learning: (await import("/js/study/learning.js")).learning(), direction: (await import("/js/lang/index.js")).directionOf("und-x-rtlish") }));
    assert(now.learning === "und-x-rtlish" && now.direction === "rtl", JSON.stringify(now));
  });

  // Burmese at 320 wide. Every Myanmar word on screen: drawn by a font of the phone's (CDP's platform fonts for the node: none of ours, never
  // the missing-glyph font), inside the screen, and never clipped above or below by a box that hides its overflow (Myanmar's stacked marks
  // reach far above and below the line). A word of a line tapped (not the question's): its meaning by it.
  const myanmarOnScreen = async (where, faults, seen) => {
    await page.evaluate(() => document.fonts.ready);
    const found = await page.evaluate(() => {
      const MYANMAR = /[က-႟]/u;
      const ONLY = /^[က-႟]+$/u;
      const out = { nodes: 0, marked: 0, sideways: document.scrollingElement.scrollWidth - innerWidth, outside: [], clipped: [], split: [], rows: 0 };
      for (const node of document.querySelectorAll('[data-part="app"] *')) {
        const own = [...node.childNodes].filter((child) => child.nodeType === 3).map((child) => child.textContent).join("");
        if (!MYANMAR.test(own) || !node.checkVisibility()) continue;
        out.nodes++;
        const label = node.textContent.trim().slice(0, 24);
        if (ONLY.test(node.textContent) && out.marked < 40) node.setAttribute("data-lx-mm", String(out.marked++));
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (!r.width) continue;
          if (r.left < -1 || r.right > innerWidth + 1) out.outside.push(`"${label}" ${Math.round(r.left)}–${Math.round(r.right)}`);
          for (let box = node; box && box !== document.body; box = box.parentElement) {
            const style = getComputedStyle(box);
            if (!/hidden|clip/.test(style.overflowY)) continue;
            const b = box.getBoundingClientRect();
            if (r.top < b.top - 1 || r.bottom > b.bottom + 1) out.clipped.push(`"${label}" (${Math.round(r.top)}–${Math.round(r.bottom)}) in ${box.dataset.part ?? box.className} (${Math.round(b.top)}–${Math.round(b.bottom)})`);
          }
        }
      }
      // A sentence's line (spoken, tapped or said): in how many rows its words sit, and any word split across two.
      for (const line of document.querySelectorAll('[data-part="target-line"], [data-part="spoken-line"], [data-part="said-line"]')) {
        if (!line.checkVisibility() || !MYANMAR.test(line.textContent)) continue;
        const words = [...line.querySelectorAll('[data-part="target-word"], [data-part="spoken-word"], [data-word]')];
        const tops = new Set();
        for (const word of words) {
          const rows = new Set([...word.getClientRects()].filter((r) => r.width).map((r) => Math.round(r.top)));
          rows.forEach((top) => tops.add(top));
          if (rows.size > 1) out.split.push(`"${word.textContent.trim()}" across ${rows.size} rows`);
        }
        out.rows = Math.max(out.rows, tops.size);
      }
      return out;
    });
    if (found.sideways > 1) faults.push(`${where}: the page scrolls sideways by ${found.sideways}px`);
    for (const line of found.outside) faults.push(`${where}: off the screen: ${line}`);
    for (const line of found.clipped) faults.push(`${where}: clipped: ${line}`);
    for (const line of found.split) faults.push(`${where}: a word split across lines: ${line}`);
    seen.rows = Math.max(seen.rows, found.rows);
    seen.nodes += found.nodes;
    await first.cdp.send("DOM.enable");
    await first.cdp.send("CSS.enable");
    const { root } = await first.cdp.send("DOM.getDocument", { depth: 0 });
    for (let i = 0; i < found.marked; i++) {
      const { nodeId } = await first.cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: `[data-lx-mm="${i}"]` });
      if (!nodeId) continue;
      const { fonts } = await first.cdp.send("CSS.getPlatformFontsForNode", { nodeId });
      for (const font of fonts) {
        seen.fonts.add(font.familyName);
        if (font.isCustomFont) faults.push(`${where}: a font of ours (${font.familyName}) draws Myanmar`);
        if (/LastResort/i.test(font.familyName) || /LastResort/i.test(font.postScriptName ?? "")) faults.push(`${where}: missing-glyph boxes (${font.familyName})`);
      }
      if (!fonts.length) faults.push(`${where}: no font drew a Myanmar word`);
    }
    await page.evaluate(() => document.querySelectorAll("[data-lx-mm]").forEach((node) => node.removeAttribute("data-lx-mm")));
  };
  // The line under a marked Myanmar word (the step's question, a new word), measured on the picture: the columns of the word with the
  // line's color below its middle, and the gap from its lowest row to a word-for-word line's top under it. 12 Nov 2026: skipping ink left
  // ရည် of လက်ဖက်ရည် unmarked (75%), so the word marked read as လက်ဖက်, itself a word.
  const markedLine = async (where, faults, seen) => {
    const marked = await page.evaluate((S) => {
      const node = [...document.querySelectorAll(`${S} [data-part="target-word"]:is([data-state="target"], [data-state="new"])`)].find((n) => n.checkVisibility() && /[က-႟]/u.test(n.textContent));
      if (!node) return null;
      const r = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const literal = [...(node.closest('[data-part="study-card"], .lx-stimulus')?.querySelectorAll('[data-part="literal-line"]') ?? [])].find((n) => n.checkVisibility());
      const range = literal ? document.createRange() : null;
      range?.selectNodeContents(literal);
      return { word: node.textContent.trim(), state: node.dataset.state, x: r.left, y: r.top, width: r.width, height: r.height, color: style.textDecorationColor.match(/[\d.]+/g).slice(0, 3).map(Number), literalTop: range ? range.getBoundingClientRect().top : null };
    }, SESSION);
    if (!marked || seen.lines.has(`${marked.state}:${marked.word}`)) return;
    seen.lines.add(`${marked.state}:${marked.word}`);
    const below = marked.height / 2;
    const reach = marked.literalTop === null ? 24 : Math.max(8, marked.literalTop - (marked.y + below));
    const picture = await page.screenshot({ clip: { x: marked.x, y: marked.y + below, width: marked.width, height: reach } });
    const { data, info } = await sharp(picture).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const near = (i) => Math.abs(data[i] - marked.color[0]) + Math.abs(data[i + 1] - marked.color[1]) + Math.abs(data[i + 2] - marked.color[2]) < 70;
    const ink = (i) => data[i] + data[i + 1] + data[i + 2] < 300;
    // The line's rows: where its color runs across at least a third of the word.
    const band = [];
    for (let y = 0; y < info.height; y++) {
      let n = 0;
      for (let x = 0; x < info.width; x++) if (near((y * info.width + x) * 3)) n++;
      if (n >= info.width / 3) band.push(y);
    }
    const lowest = band.length ? band[band.length - 1] : -1;
    let columns = 0;
    for (let x = 0; x < info.width; x++) if (band.some((y) => near((y * info.width + x) * 3) || ink((y * info.width + x) * 3))) columns++;
    const cover = Math.round((columns / info.width) * 100);
    const scale = info.width / marked.width;
    const clear = marked.literalTop === null || lowest < 0 ? null : Math.round((reach - (lowest + 1) / scale) * 10) / 10;
    seen.covers.push(`${marked.word} ${cover}%${clear === null ? "" : `, ${clear}px over the word for word`}`);
    if (marked.state === "target" && cover < 90) {
      writeFileSync(join(OUT, `line-under-${seen.lines.size}.png`), picture);
      faults.push(`${where}: the line under "${marked.word}" runs under ${cover}% of it (line-under-${seen.lines.size}.png)`);
    }
    if (clear !== null && clear < 2) faults.push(`${where}: the line under "${marked.word}" comes within ${clear}px of the word-for-word line`);
  };
  // Your words' tiles, each face inside its own tile's box (12 Nov 2026: the tea tile's face, never squeezed, hung 6 px past each side of its
  // tile, 8 px past the shelf when last in its row), and inside its shelf.
  const tilesInside = async (where, faults) => {
    const out = await page.evaluate(() => {
      const found = [];
      let faces = 0;
      for (const grid of document.querySelectorAll(".lx-shelf-tiles")) {
        if (!grid.checkVisibility()) continue;
        const shelf = grid.getBoundingClientRect();
        for (const tile of grid.querySelectorAll(':scope > [data-part="word-tile"]')) {
          const face = tile.querySelector(".lx-tile-face");
          if (!face?.checkVisibility()) continue;
          faces++;
          const f = face.getBoundingClientRect();
          const t = tile.getBoundingClientRect();
          const past = Math.max(t.left - f.left, f.right - t.right, shelf.left - f.left, f.right - shelf.right);
          if (past > 0.5) found.push(`"${face.textContent.trim()}" ${Math.round(past * 10) / 10} px past its ${f.right > shelf.right + 0.5 || f.left < shelf.left - 0.5 ? "shelf" : "tile"}`);
        }
      }
      return { faces, found };
    });
    if (!out.faces) faults.push(`${where}: no tile on screen`);
    for (const line of out.found) faults.push(`${where}: a tile hangs over: ${line}`);
  };
  // A word of the line on screen tapped (not the step's question, not a tile): what shows by it.
  const tapAWord = async (taps, shotName) => {
    const word = await page.evaluate((S) => {
      const node = [...document.querySelectorAll(`${S} [data-part="target-word"], ${S} [data-part="spoken-word"]`)].find((n) => n.checkVisibility() && n.dataset.state !== "target");
      node?.setAttribute("data-lx-tap", "");
      return node?.dataset.word ?? null;
    }, SESSION);
    if (!word || taps.some((tap) => tap.word === word)) {
      await page.evaluate(() => document.querySelector("[data-lx-tap]")?.removeAttribute("data-lx-tap"));
      return;
    }
    await page.locator("[data-lx-tap]").click();
    await page.waitForTimeout(500);
    const shown = await page.evaluate(() => document.querySelector('[data-part="word-popover"]')?.innerText.trim() ?? null);
    if (shotName) await shot(page, shotName);
    taps.push({ word, shown });
    await page.evaluate(async () => {
      (await import("/js/lx/ui.js")).closeWordPopover();
      document.querySelector("[data-lx-tap]")?.removeAttribute("data-lx-tap");
    });
  };

  await stage("Burmese at 320 wide, in Myanmar script we serve no font for: the phone's own font draws every word (none of ours, no missing-glyph boxes); on Home, a lesson, the sentence games (what it means, the order, the gap) and Knowledge (every tile inside its shelf, at 320 and 390), nothing off the screen or clipped above or below, a sentence's line wraps between words; a marked word's line runs under ≥ 90% of it, clear of the word for word; a tapped word shows its meaning", async () => {
    await page.setViewportSize({ width: 320, height: 700 });
    try {
      await choose(page, "my");
      const faults = [];
      const seen = { fonts: new Set(), rows: 0, nodes: 0, lines: new Set(), covers: [] };
      const taps = [];
      await go(page, "#today");
      await myanmarOnScreen("Home", faults, seen);
      await shot(page, "10-home-burmese-320");
      await page.locator('[data-part="page"] [data-part="button"]', { hasText: "Start" }).first().click();
      await page.waitForSelector(SESSION, { timeout: 20_000 });
      let steps = 0;
      for (; steps < 40; steps++) {
        const now = await nextStep(page);
        if (now?.kind === "summary") break;
        await page.waitForTimeout(450);
        await myanmarOnScreen(`the lesson's step ${steps + 1} (${now.kind})`, faults, seen);
        await answerStep(page);
      }
      await myanmarOnScreen("the lesson's summary", faults, seen);
      await page.locator(`${SESSION} [data-part="button"]`, { hasText: "Done" }).first().click();
      await pastReminderAsk(page);
      await page.waitForFunction((S) => !document.querySelector(S), SESSION, { timeout: 20_000 });
      // A first lesson teaches its words alone; its sentences come in the games: what it means, putting it in order, the gap.
      const games = [];
      for (const game of ["meaning", "arrange", "fill"]) {
        await go(page, `#study/session/game/${game}`);
        await page.waitForSelector(SESSION, { timeout: 20_000 });
        let played = 0;
        for (; played < 12; played++) {
          const now = await nextStep(page);
          if (now?.kind === "summary") break;
          await page.waitForTimeout(450);
          const rowsBefore = seen.rows;
          const where = `${game}'s step ${played + 1} (${now.kind})`;
          await myanmarOnScreen(where, faults, seen);
          await markedLine(where, faults, seen);
          if (seen.rows > 1 && rowsBefore <= 1) await shot(page, "11-burmese-wrapped-320");
          await tapAWord(taps, taps.length ? null : "12-burmese-tap-320");
          await answerStep(page);
        }
        games.push(`${game} ${played}`);
        await myanmarOnScreen(`${game}'s summary`, faults, seen);
        await page.locator(`${SESSION} [data-part="button"]`, { hasText: "Done" }).first().click();
        await pastReminderAsk(page);
        await page.waitForFunction((S) => !document.querySelector(S), SESSION, { timeout: 20_000 });
      }
      await go(page, "#know/words");
      await myanmarOnScreen("Knowledge at 320", faults, seen);
      await tilesInside("Knowledge at 320", faults);
      await shot(page, "13-knowledge-burmese-320");
      await page.setViewportSize({ width: 390, height: 844 });
      await go(page, "#know/words");
      await myanmarOnScreen("Knowledge at 390", faults, seen);
      await tilesInside("Knowledge at 390", faults);
      await shot(page, "13-knowledge-burmese-390");
      assert(seen.nodes > 0, "no Myanmar word was on screen");
      assert(!faults.length, faults.slice(0, 10).join("\n"));
      assert(seen.rows >= 2, `no Burmese sentence's line wrapped at 320 (at most ${seen.rows} row)`);
      assert(seen.covers.length > 0, "no marked Burmese word was on screen to measure its line");
      assert(taps.length > 0, "no word of a line was there to tap");
      const bare = (word) => word.replace(/[။၊.!?]+$/u, "");
      const wrongTaps = taps.filter((tap) => !tap.shown || !tap.shown.includes(bare(tap.word)) || !BURMESE.words[bare(tap.word)] || !tap.shown.includes(BURMESE.words[bare(tap.word)]));
      assert(!wrongTaps.length, `a tapped word's meaning: ${JSON.stringify(wrongTaps)}`);
      return `a lesson of ${steps} steps, then ${games.join(", ")}; drawn by ${[...seen.fonts].join(", ")}; a sentence's line in at most ${seen.rows} rows, no word split; marked words' lines: ${seen.covers.join("; ")}; tapped ${taps.map((tap) => `"${tap.shown}"`).join(", ")}`;
    } finally {
      await page.setViewportSize({ width: 390, height: 844 });
    }
  });

  await stage("Practice with your AI in Burmese, the check as the AI over MCP: started from the AI section, typed; it joins seeing Burmese by name and how it's written; its line in Burmese, a typed answer graded on a Burmese word, End and its summary, kept on this device as Burmese evidence; Make a new pack asked in Burmese carries its definition to the AI", async () => {
    await choose(page, "my");
    await go(page, "#ai");
    await shot(page, "16-ai-burmese");
    const waiting = tool("practice_wait", { wait_seconds: 40 });
    await page.locator('[data-part="ai-practice"] [data-part="button"]', { hasText: "Start" }).click();
    await page.waitForFunction(() => location.hash === "#practice");
    await page.locator('[data-part="list-row"]', { hasText: "Conversation" }).first().click();
    await page.waitForFunction(() => location.hash === "#practice/new/conversation");
    await page.locator('[data-part="segment"]', { hasText: /^Type$/ }).click();
    await shot(page, "17-practice-setup-burmese");
    await page.getByRole("button", { name: "Start" }).click();
    await page.locator(ROOM).waitFor({ timeout: 20_000 });
    const joined = await waiting;
    const seen = joined.practice ?? {};
    assert(joined.status === "joined" && seen.language === "my" && seen.languageName === "Burmese" && seen.languageDef?.written === "unspaced" && seen.answer === "type", `the AI joined seeing: ${JSON.stringify({ status: joined.status, ...seen }).slice(0, 400)}`);
    assert(joined.learner?.languageDef?.written === "unspaced", `the learner the AI was given: ${JSON.stringify(joined.learner ?? null).slice(0, 200)}`);
    const ai = { id: seen.id, seat: joined.seat, after: joined.after };
    const aiWait = async () => {
      for (;;) {
        const r = await tool("practice_wait", { practice_id: ai.id, seat: ai.seat, after: ai.after, wait_seconds: 20 });
        if (r.status === "waiting") continue;
        if (r.after !== undefined) ai.after = r.after;
        return r;
      }
    };
    await tool("practice_reply", { practice_id: ai.id, seat: ai.seat, say: { nl: "မင်္ဂလာပါ။ ဘာသောက်ချင်လဲ။", en: "Hello. What would you like to drink?" } });
    const line = page.locator(`${ROOM} [data-part="chat-line"][data-variant="ai"]`).first();
    await line.waitFor({ timeout: 20_000 });
    const shown = await line.evaluate((node) => {
      const nl = node.querySelector(".lx-chat-nl");
      return { text: nl?.textContent.trim() ?? null, lang: nl?.closest("[lang]")?.getAttribute("lang") ?? null };
    });
    assert(shown.text?.includes("ဘာသောက်ချင်လဲ") && shown.lang === "my", `its line: ${JSON.stringify(shown)}`);
    // Its speaker only where something here says Burmese (a device voice for "my"), never one that says nothing.
    const speaking = await page.evaluate(async (R) => {
      const voices = (await import("/js/study/voice.js")).voicesFor("my").length;
      const line = document.querySelector(`${R} [data-part="chat-line"][data-variant="ai"]`);
      return { voices, speaker: Boolean(line?.querySelector('[data-part="speak-button"], button[aria-label="Read it aloud"]')), toggle: Boolean(document.querySelector(`${R} [aria-label="Read your AI's lines aloud"]`)?.checkVisibility()) };
    }, ROOM);
    assert(speaking.speaker === speaking.voices > 0 && speaking.toggle === speaking.voices > 0, `Burmese read aloud: ${JSON.stringify(speaking)}`);
    const input = page.locator(`${ROOM} [data-part="composer"] input`);
    const placeholder = await input.getAttribute("placeholder");
    assert(placeholder === "Type in Burmese…", `the field says ${JSON.stringify(placeholder)}`);
    const heard = aiWait();
    await input.fill("ရေသောက်ချင်တယ်။");
    await input.press("Enter");
    const turn = await heard;
    assert(turn.status === "your_move" && turn.turns?.[0]?.text === "ရေသောက်ချင်တယ်။", `the AI heard: ${JSON.stringify(turn).slice(0, 300)}`);
    await tool("practice_reply", { practice_id: ai.id, seat: ai.seat, grade: { turn: turn.turns[0].seq, verdict: "right", concepts: [{ concept: "w:ရေ", outcome: "right" }] }, say: { nl: "ကောင်းတယ်။", en: "Good." } });
    await page.locator(`${ROOM} [data-part="chat-line"][data-variant="ai"]`, { hasText: "ကောင်းတယ်" }).waitFor({ timeout: 20_000 });
    await page.waitForTimeout(600);
    await shot(page, "18-practice-room-burmese");
    const ending = aiWait();
    await page.locator(ROOM).getByRole("button", { name: "End", exact: true }).click();
    const ended = await ending;
    assert(ended.status === "ended", `End reached the AI as: ${JSON.stringify(ended).slice(0, 200)}`);
    await tool("practice_end", { practice_id: ai.id, seat: ai.seat, summary: { text: "Good: ရေသောက်ချင်တယ်။ was right, word for word.", went_well: ["ရေသောက်ချင်တယ်။"] } });
    await page.locator(`${ROOM} [data-part="session-summary"]`).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await shot(page, "19-practice-summary-burmese");
    let kept = 0;
    for (let i = 0; i < 20 && !kept; i++) {
      await page.waitForTimeout(500);
      kept = await page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().filter((row) => row.lang === "my" && row.concept === "w:ရေ" && String(row.item ?? "").startsWith("practice:")).length);
    }
    assert(kept > 0, "the grade on ရေ isn't Burmese evidence on this device");
    // Make a new pack, asked in Burmese: the request carries its definition, for create_pack's language_def.
    await go(page, "#ai/new/pack_new");
    await page.locator('[aria-label^="What it"]').first().fill("Ordering tea and coffee");
    const asked = await text(page);
    await shot(page, "20-ask-pack-burmese");
    assert(asked.includes("Burmese") && asked.includes("its lessons on Home"), `Make a new pack's page: ${asked.slice(0, 300)}`);
    await page.getByRole("button", { name: "Send to your AI" }).click();
    await page.waitForFunction(() => location.hash === "#ai", null, { timeout: 15_000 });
    const requests = await tool("list_requests", {});
    const list = [...(requests.waiting ?? []), ...(requests.taken ?? []), ...(requests.recent ?? [])];
    const pack = list.find((request) => request.kind === "pack_new" && /Ordering tea/.test(JSON.stringify(request)));
    const asks = pack?.asked ?? {};
    assert(asks.language === "my" && asks.languageDef?.written === "unspaced", `the request the AI sees: ${JSON.stringify(pack ?? list).slice(0, 400)}`);
    return `joined as Burmese (${seen.languageDef.written}); 2 lines and a typed answer graded on ရေ; summary kept; ${kept} evidence row(s); Make a new pack carries its definition`;
  });

  await stage("Toki Pona: its sentences as it writes them, in small letters from the start and Sonja with its capital, on every step of a lesson and the sentence games (never capitalized by the app); a tapped word shows its meaning", async () => {
    await choose(page, "tok");
    await go(page, "#today");
    await shot(page, "14-home-toki-pona");
    await page.locator('[data-part="page"] [data-part="button"]', { hasText: "Start" }).first().click();
    await page.waitForSelector(SESSION, { timeout: 20_000 });
    const faults = [];
    const taps = [];
    const sentences = new Set();
    // Every Toki Pona text on the step: none capitalized by the app, Sonja always with its capital.
    const asWritten = async (where) => {
      const shown = await page.evaluate((S) => [...document.querySelectorAll(`${S} [lang="tok"]`)].filter((node) => node.checkVisibility()).map((node) => node.innerText.trim()), SESSION);
      for (const line of shown) {
        if (/(^|[\s.!?])(Mi|Sina|Jan|Telo|Pona|Wile|Moku|Li|E)\b/u.test(line)) faults.push(`${where}: capitalized: "${line}"`);
        if (/\bsonja\b/u.test(line)) faults.push(`${where}: Sonja without its capital: "${line}"`);
        if (/\s/.test(line)) sentences.add(line.replace(/\s+/g, " "));
      }
    };
    const leave = async () => {
      await page.locator(`${SESSION} [data-part="button"]`, { hasText: "Done" }).first().click();
      await pastReminderAsk(page);
      await page.waitForFunction((S) => !document.querySelector(S), SESSION, { timeout: 20_000 });
    };
    let steps = 0;
    for (; steps < 40; steps++) {
      const now = await nextStep(page);
      if (now?.kind === "summary") break;
      await page.waitForTimeout(450);
      await asWritten(`the lesson's step ${steps + 1} (${now.kind})`);
      await answerStep(page);
    }
    await leave();
    // Its sentences come in the games: what it means (a tap on a word of its line), putting it in order.
    const games = [];
    for (const game of ["meaning", "arrange"]) {
      await go(page, `#study/session/game/${game}`);
      await page.waitForSelector(SESSION, { timeout: 20_000 });
      let played = 0;
      for (; played < 12; played++) {
        const now = await nextStep(page);
        if (now?.kind === "summary") break;
        await page.waitForTimeout(450);
        await asWritten(`${game}'s step ${played + 1} (${now.kind})`);
        await tapAWord(taps, taps.length ? null : "15-toki-pona-tap");
        await answerStep(page);
      }
      games.push(`${game} ${played}`);
      await leave();
    }
    assert(!faults.length, faults.slice(0, 8).join("\n"));
    assert(sentences.size > 0, "no Toki Pona sentence was on screen");
    assert(taps.length > 0, "no word of a line was there to tap");
    const meaningOf = (word) => TOKI_PONA.words[word] ?? TOKI_PONA.words[word.replace(/[.!?]$/, "")];
    const wrongTaps = taps.filter((tap) => !tap.shown || !meaningOf(tap.word) || !tap.shown.includes(meaningOf(tap.word)));
    assert(!wrongTaps.length, `a tapped word's meaning: ${JSON.stringify(wrongTaps)}`);
    return `a lesson of ${steps} steps, then ${games.join(", ")}; as written: ${[...sentences].slice(0, 4).map((line) => `"${line}"`).join(", ")}; tapped ${taps.map((tap) => `"${tap.shown}"`).join(", ")}`;
  });

  // The account's copy holds their own packs and their progress (src/account-sync.ts, v728): a phone signed in later takes the packs through
  // packs.js applySynced, keeping each pack's language first, and studies the language last studied.
  await stage("a second device signed in to the account: all four packs, their languages and the progress come, and it's learning the language last studied", async () => {
    const { credentials } = await first.cdp.send("WebAuthn.getCredentials", { authenticatorId: first.authenticatorId });
    const sent = await page.evaluate(async () => (await (await import("/js/sync.js")).syncNow()).error ?? null);
    assert(!sent, `the first phone's sync: ${sent}`);
    // A phone with nothing on it, as a learner's would be: no first run skipped for it (quiet-browser.mjs skips it for checks unless LX_FIRST_RUN).
    process.env.LX_FIRST_RUN = "1";
    const second = await phone();
    delete process.env.LX_FIRST_RUN;
    for (const credential of credentials) await second.cdp.send("WebAuthn.addCredential", { authenticatorId: second.authenticatorId, credential });
    try {
      await second.page.goto(`${BASE}/login`);
      await second.page.click("#signin");
      await second.page.waitForURL(`${BASE}/app/**`, { timeout: 60_000 });
      const signedIn = Date.now();
      const firstAt = {};
      await ready(second.page);
      let got = null;
      for (let i = 0; i < 60; i++) {
        await second.page.waitForTimeout(500);
        got = await second.page.evaluate(async (OWN) => {
          const { allPacks } = await import("/js/study/packs.js");
          const { LANGUAGES } = await import("/js/lang/index.js");
          const { allEvidence } = await import("/js/study/progress.js");
          const langs = new Set(allPacks().map((p) => p.language));
          return {
            packs: OWN.every((code) => langs.has(code)),
            languages: OWN.every((code) => LANGUAGES[code]?.own === true),
            evidence: [...new Set(allEvidence().map((row) => row.lang))].filter((lang) => OWN.includes(lang)).sort(),
            learning: (await import("/js/study/learning.js")).learning(),
          };
        }, OWN);
        for (const [key, value] of [["evidence", got.evidence.length > 0], ["packs", got.packs], ["languages", got.languages], ["learning own", OWN.includes(got.learning)]])
          if (value && firstAt[key] === undefined) firstAt[key] = Date.now() - signedIn;
        if (got.packs && got.languages && got.evidence.length === OWN.length && got.learning === "tok") break;
      }
      await second.page.screenshot({ path: join(OUT, "9-second-device.png") });
      assert(got?.packs && got.languages && got.evidence.join() === OWN.join() && got.learning === "tok", `${JSON.stringify(got)}; first seen (ms after signing in): ${JSON.stringify(firstAt)}`);
      return "packs, languages and progress there, learning Toki Pona";
    } finally {
      await second.context.close();
    }
  });

  await stage("no console error or page error on any page", async () => {
    assert(!errors.length, errors.slice(0, 8).join(" | "));
  });
} finally {
  await browser.close();
  writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
