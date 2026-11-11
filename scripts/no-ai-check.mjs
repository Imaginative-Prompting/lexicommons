// Lexicommons with no AI connected, as a fresh account on a phone: outside the AI section (the AI tab's pages, Practice,
// Settings → Your AI) nothing offers an AI. It follows every link in the app, plays the flows behind buttons (a session's
// result and its word, Read's sheet, the reader, Explore with no pack, every pack off) and fails on any line, button,
// field or label that names an AI, and on an AI tab; then with an AI connected (a personal token) the tab comes, and with
// it the AI section's own page. The app may report what an AI already did, but a fresh account has none of that.
// Screens where a mention was found are shot with it outlined. LOCAL only: it signs up a test account (deleted at the end).
// Usage: node scripts/no-ai-check.mjs http://localhost:<port> <outDir>   (exit 0 = pass)
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { knowWords } from "./fixtures/know-words.mjs";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/no-ai-check.mjs http://localhost:<port> <outDir> (a local server only: it signs up a test account)");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });

// The AI section: the one place an AI may be offered.
const IN_SECTION = (hash) => /^#(ai|practice)(\/|$|\?)/.test(hash) || /^#settings\/ai(\/|$)/.test(hash) || /^#settings\/appearance\/ai$/.test(hash);

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio", "--enable-unsafe-webgpu", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36" });
await context.grantPermissions(["microphone"], { origin: new URL(BASE).origin });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const results = [];
let failed = 0;
async function stage(name, fn) {
  try {
    const note = (await fn()) ?? "";
    results.push({ name, ok: true, note });
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    results.push({ name, ok: false, note: String(error.message ?? error) });
    console.log(`FAIL  ${name}: ${error.message}`);
    await page.screenshot({ path: join(OUT, "shots", `fail-${results.length}.png`) }).catch(() => {});
  }
}
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};

// Every visible mention of an AI on the screen now (in the page, the links it offers too).
const READ = () => {
  const RE = /\bAIs?\b|\bMCP\b|Claude|ChatGPT|Codex/;
  // How a book's layer was made is its credit, said in About this book in the format's own words (book-format.js MADE_WITH_AI): what a
  // person is owed, and no offer of an AI. Only that line, whole, and only there: any other mention in the credits is still found, and
  // so are those words anywhere else (the stage's planted lines hold both).
  const CREDIT = /^Its [\p{L} ]+: Made for Lexicommons with an AI model and checked sentence by sentence(?:, [^,]+)?\.$/u;
  // Read's Weave your own (read/weave-own.js): the reader's main use needs an AI of your own, so that one part says so to everyone, with its
  // one press to connect. Only its own lines, each whole, and only inside that part: another line there, or these words anywhere else, is still
  // found (the Read stage's planted lines hold both).
  const WEAVE_OWN = [
    /^Read what you'd read anyway, an article or a chapter, with [\p{L} ]+ woven in as far as you know it: first the words you've learned, each in its place, then whole sentences\. Your own AI does the weaving\.$/u,
    /^It's as good as your AI: expect the odd mistake, and tap any word to check it\. It isn't quick, and a long text takes a lot of your AI's usage, so start with a page or two\. It needs an AI of your own, connected to Lexicommons\.$/,
    /^Connect your AI$/,
  ];
  const out = [];
  const seen = new Set();
  const add = (text, node, how) => {
    const line = text.replace(/\s+/g, " ").trim();
    const key = `${how}|${line}`;
    if (!RE.test(line) || seen.has(key)) return;
    if (how === "text" && CREDIT.test(line) && node.closest('[data-part="reader-credits"]')) return;
    if (how === "text" && node.closest('[data-part="weave-your-own"]') && WEAVE_OWN.some((own) => own.test(line))) return;
    seen.add(key);
    out.push({ text: line.slice(0, 300), how, tab: Boolean(node.closest('[data-part="tab-bar"]')) });
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (!RE.test(n.textContent)) continue;
    const el = n.parentElement;
    if (!el?.checkVisibility?.() || el.closest("script,style")) continue;
    // A session and a book sit over the page they were opened from, which stays in the document.
    const over = document.querySelector('[data-part="session"], [data-part="reader"]:not([data-ghost])');
    if (over && !over.contains(el) && !el.closest('[data-part="sheet"], [data-part="menu"]')) continue;
    add((el.closest("button, a[href], p, li, h1, h2, h3, label, summary, [role=menuitem]") ?? el).textContent, el, "text");
  }
  for (const el of document.querySelectorAll("[aria-label], [placeholder], [title]")) {
    if (!el.checkVisibility?.()) continue;
    for (const attr of ["aria-label", "placeholder", "title"]) if (el.hasAttribute(attr)) add(el.getAttribute(attr), el, attr);
  }
  const links = [...document.querySelectorAll('a[href^="#"]')].filter((a) => a.checkVisibility?.()).map((a) => a.getAttribute("href"));
  return { mentions: out, links: [...new Set(links)], hash: location.hash };
};
const settle = async () => {
  await page.waitForTimeout(300);
  await page.evaluate(async () => {
    for (let waited = 0; waited < 1500; waited += 50) {
      if (document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState !== "running")) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }).catch(() => {});
};
const found = new Map(); // "screen|words" → { screen, text, how, tab, shot }
let screens = 0;
let shots = 0;
async function look(name, { outside = null } = {}) {
  await settle();
  const read = await page.evaluate(READ);
  screens++;
  const inSection = outside === null ? IN_SECTION(read.hash) : !outside;
  // Settings' own row into the section, one word and nothing more, is the way in (held below: "no AI row in Settings"). It only ever got past this because its old subtitle ran
  // into its title as "AIOptional". Any other word on that page, or that word anywhere else, is still found.
  const here = (inSection ? read.mentions.filter((m) => m.tab) : read.mentions).filter((m) => !(read.hash === "#settings" && m.how === "text" && m.text === "AI"));
  if (here.some((m) => !m.tab)) {
    shots++;
    const shot = `${String(shots).padStart(3, "0")}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60)}.png`;
    await page.evaluate(() => {
      const RE = /\bAIs?\b|\bMCP\b|Claude|ChatGPT|Codex/;
      const list = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const el = walker.currentNode.parentElement;
        if (RE.test(walker.currentNode.textContent) && el?.checkVisibility?.() && !el.closest('script,style,[data-part="tab-bar"]')) list.push(el.closest("button, a[href], p, li, h1, h2, h3, label, summary, [role=menuitem]") ?? el);
      }
      for (const el of list) (el.style.outline = "2px solid #ffb000"), (el.style.outlineOffset = "1px");
      list[0]?.scrollIntoView({ block: "center" });
    });
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(OUT, "shots", shot) });
    await page.evaluate(() => document.querySelectorAll("[style*='outline']").forEach((el) => ((el.style.outline = ""), (el.style.outlineOffset = ""))));
    for (const m of here) {
      const key = `${name}|${m.text}`;
      if (!found.has(key)) found.set(key, { screen: name, text: m.text, how: m.how, tab: m.tab, shot });
    }
  } else for (const m of here) if (m.tab) found.set("tab bar|AI", { screen: "tab bar", text: m.text, how: m.how, tab: true, shot: null });
  return read;
}
const go = async (hash) => {
  await page.evaluate((h) => (location.hash = h), hash);
  await page.waitForTimeout(200);
};
const report = (from) => {
  const fresh = [...found.values()].filter((m) => !from.has(`${m.screen}|${m.text}`));
  assert(!fresh.length, `${fresh.length} mention(s) of an AI: ${fresh.slice(0, 8).map((m) => `[${m.screen}] ${m.text.slice(0, 70)}`).join(" · ")}${fresh.length > 8 ? " …" : ""}`);
};
const snapshot = () => new Set(found.keys());

const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Fresh Person");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
await page.waitForSelector("html[data-app-ready]");
await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());

/** A picture for people to look at, once what's moving has finished. */
async function settledShot(name) {
  await page.evaluate(async () => {
    for (let waited = 0; waited < 1500; waited += 50) {
      if (document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState !== "running")) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }).catch(() => {});
  await page.screenshot({ path: join(OUT, "shots", `${name}.png`) });
}

await stage("no AI tab: the tab bar has Home, Study, Knowledge and Explore", async () => {
  await go("#today");
  await settle();
  const tabs = await page.locator('[data-part="tab-bar"] [data-part="tab"]:visible').allTextContents();
  const words = tabs.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
  assert(!words.includes("AI"), `the tabs: ${words.join(", ")}`);
  assert(words.join() === "Home,Study,Knowledge,Explore", `the tabs: ${words.join(", ")}`);
  return words.join(", ");
});

// Pages that differ only by an id or a language: a few of each.
const CAPS = [[/^#settings\/study\/packs\/.+/, 3], [/^#explore\/item\/.+/, 3], [/^#explore\/requests\/.+/, 2], [/^#know\/.+/, 5], [/^#read\/book\/.+/, 0], [/^#study\/session.*/, 0], [/^#settings\/appearance\/themes\/.+/, 1], [/^#explore\?lang=.+/, 3], [/^#explore\/requests\?lang=.+/, 2], [/^#explore\/topics\?lang=.+/, 1], [/^#explore\/browse\?.+/, 3], [/^#explore\/grammar.*/, 3], [/^#explore\/pattern\/.+/, 2]];
const counted = new Map();
await stage("what a new account sees first: Today and Study", async () => {
  await go("#today");
  await settledShot("today");
  await go("#study");
  await page.waitForSelector('[data-part="study-door"]');
  await settledShot("study");
  await go("#today");
});

await stage("every link outside the AI section, walked: none names an AI", async () => {
  const before = snapshot();
  const visited = new Set();
  const queue = ["#today", "#study", "#read", "#read/paste", "#read/find", "#read/library", "#know", "#explore?lang=nl", "#explore?lang=it", "#explore/requests?lang=nl", "#explore/yours", "#explore/terms", "#settings"];
  let n = 0;
  while (queue.length && n < 240) {
    const hash = queue.shift();
    if (visited.has(hash) || IN_SECTION(hash)) continue;
    const cap = CAPS.find(([re]) => re.test(hash));
    if (cap) {
      const c = counted.get(cap[0]) ?? 0;
      if (c >= cap[1]) continue;
      counted.set(cap[0], c + 1);
    }
    visited.add(hash);
    n++;
    await go(hash);
    const read = await look(hash);
    for (const link of read.links) if (!visited.has(link)) queue.push(link);
  }
  report(before);
  return `${n} pages`;
});

await stage("a session: a result names no AI, and has no ask menu", async () => {
  const before = snapshot();
  await knowWords(page);
  await go("#study/session/game/choose");
  const choice = page.locator('[data-part="session"] [data-part="choice"]').first();
  await choice.waitFor({ timeout: 10_000 });
  await choice.click();
  await page.locator('[data-part="session"] [data-part="answer-bar"]').getByRole("button", { name: /Continue|See how it went/ }).first().waitFor({ timeout: 5000 });
  await look("a session's result", { outside: true });
  await settledShot("session-result");
  const more = page.locator('[data-part="session"] [data-part="answer-bar"] [aria-haspopup="menu"]');
  if (await more.count()) {
    await more.click();
    await page.waitForTimeout(300);
    await look("a session's … menu", { outside: true });
    await page.keyboard.press("Escape");
  }
  const menus = await more.count();
  await go("#today");
  report(before);
  assert(!menus, "a … on the result");
});

await stage("a whole quick session and its summary", async () => {
  const before = snapshot();
  await go("#study/session/quick?from=today");
  await page.waitForTimeout(600);
  for (let i = 0; i < 60; i++) {
    let pressed = null;
    for (const name of ["See how it went", "Continue", "I don't know", "Can't speak now", "Got it"]) {
      const b = page.locator('[data-part="session"]').getByRole("button", { name }).first();
      if ((await b.count()) && (await b.isVisible())) {
        await b.click({ timeout: 2000 }).catch(() => {});
        pressed = name;
        break;
      }
    }
    await page.waitForTimeout(200);
    if (pressed === "See how it went") break;
    if (!pressed) {
      const choice = page.locator('[data-part="session"] [data-part="choice"]').first();
      if (await choice.count()) await choice.click({ timeout: 1000 }).catch(() => {});
    }
  }
  await page.waitForTimeout(800);
  await look("a session's summary", { outside: true });
  await go("#today");
  await look("Today after a session", { outside: true });
  await go("#know");
  const k = await look("Know after a session", { outside: true });
  for (const link of k.links.filter((l) => l.startsWith("#know/")).slice(0, 3)) {
    await go(link);
    await look(`a word's page (${link})`, { outside: true });
    const menu = page.locator('[data-part="page"] [aria-haspopup="menu"]').first();
    if (await menu.count()) {
      await menu.click();
      await page.waitForTimeout(300);
      await look("a word page's … menu", { outside: true });
      await page.keyboard.press("Escape");
    }
  }
  report(before);
});

await stage("Read: Add a book or text offers what works, and a book's word names no AI", async () => {
  const before = snapshot();
  await go("#read");
  await settle();
  // Weave your own's allowance can fail: another line naming an AI planted inside it, and its own button's words planted outside it, are both found;
  // its own lines, where they are, aren't.
  const WEAVE_LINES = ["Ask your AI about this book.", "Connect your AI"];
  const weave = await page.evaluate((lines) => {
    const part = document.querySelector('[data-part="page"]:not([data-ghost]) [data-part="weave-your-own"]');
    const own = part ? part.innerText.replace(/\s+/g, " ") : "";
    const made = lines.map((line) => Object.assign(document.createElement("p"), { textContent: line }));
    for (const p of made) p.setAttribute("data-planted", "");
    if (part?.firstChild) part.append(made[0]);
    (part?.parentElement ?? document.querySelector('[data-part="page"]:not([data-ghost])')).append(made[1]);
    return { shown: Boolean(part?.firstChild), own };
  }, WEAVE_LINES);
  const seenWeave = (await page.evaluate(READ)).mentions.map((m) => m.text);
  await page.evaluate(() => document.querySelectorAll("[data-planted]").forEach((p) => p.remove()));
  assert(!weave.shown || seenWeave.includes(WEAVE_LINES[0]), "a line offering an AI, planted inside Weave your own, wasn't found");
  assert(seenWeave.includes(WEAVE_LINES[1]), "Weave your own's button's words, planted outside it, weren't found");
  if (weave.shown) assert(/Your own AI does the weaving/.test(weave.own) && /Connect your AI/.test(weave.own) && !/Weave it with your AI|Add a text/.test(weave.own), `Weave your own with no AI connected: ${weave.own}`);
  await page.getByRole("button", { name: "Add a book or text" }).first().click();
  await page.waitForTimeout(400);
  await look("Read's Add a book or text", { outside: true });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await go("#today");
  await go("#read");
  await page.waitForTimeout(500);
  const tile = page.locator('[data-part="page"] .lx-read-shelf [data-part="book-tile"]').first();
  let note = "no book on this server's shelf";
  if (await tile.count()) {
    await tile.click();
    await page.waitForURL(/#read\/book\//, { timeout: 15_000 });
    const READER = '[data-part="reader"]:not([data-ghost])';
    await page.waitForSelector(`${READER}[data-ready]`, { timeout: 20_000 });
    await look("the reader", { outside: true });
    // The credit's allowance can fail: a line offering an AI planted in the credits, and the credit's own words planted outside them, are both found.
    const LINES = ["Ask your AI about this book.", "Its English help: Made for Lexicommons with an AI model and checked sentence by sentence, CC BY-SA 4.0."];
    const hasCredits = await page.evaluate(
      ([sel, lines]) => {
        const reader = document.querySelector(sel);
        const credits = reader.querySelector('[data-part="reader-credits"]');
        const made = lines.map((line) => Object.assign(document.createElement("p"), { textContent: line }));
        for (const p of made) (p.style.cssText = "position:fixed;left:8px;top:120px;z-index:9"), p.setAttribute("data-planted", "");
        credits?.append(made[0]);
        reader.querySelector('[data-part="reader-text"]').prepend(made[1]);
        return Boolean(credits);
      },
      [READER, LINES],
    );
    const seenPlanted = (await page.evaluate(READ)).mentions.map((m) => m.text);
    await page.evaluate(() => document.querySelectorAll("[data-planted]").forEach((p) => p.remove()));
    const planted = { credits: hasCredits, inCredits: seenPlanted.includes(LINES[0]), outside: seenPlanted.includes(LINES[1]) };
    assert(!planted.credits || planted.inCredits, "a line offering an AI, planted in a book's credits, wasn't found");
    assert(planted.outside, "the layer credit's words, planted outside a book's credits, weren't found");
    // A word a tap reaches: on this page, with nothing over it (in pages a word of the next page can stand inside the screen's box, under the page's cover).
    const word = await page.evaluateHandle((sel) => [...document.querySelectorAll(`${sel} [data-part="reader-text"] :is([data-part="woven-word"], [data-part="reader-word"], [data-part="reader-help"])`)].find((n) => {
      const r = n.getBoundingClientRect();
      if (!(r.width && r.top > innerHeight * 0.15 && r.bottom < innerHeight - 120 && r.left > 8 && r.right < innerWidth - 8)) return false;
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return Boolean(at) && (n.contains(at) || at.contains(n)) && !at.classList.contains("lx-reader-cover");
    }), READER);
    if (await word.evaluate((n) => Boolean(n))) {
      await word.asElement().click();
      await page.waitForTimeout(500);
      await look("the reader, a word's meaning", { outside: true });
      const menu = page.locator(`${READER} [data-part="word-popover"] [aria-haspopup="menu"]`);
      if (await menu.count()) {
        await menu.click();
        await page.waitForTimeout(300);
        await look("the reader, a word's … menu", { outside: true });
        await page.keyboard.press("Escape");
      }
      note = "a book and a word's meaning";
    } else note = "a book, no word on screen";
    await go("#today");
  }
  report(before);
  return note;
});

await stage("Read: a pasted text opens with its first line clear of the top bar", async () => {
  await go("#read/paste");
  await settle();
  await page.locator('[data-part="page"] textarea').first().fill("Morgen gaan we naar oma. Ze woont in een klein huis bij de zee. Ik neem een boek mee, want ze houdt van lezen.");
  await page.locator('[data-part="page"]').getByRole("button", { name: "Add and read" }).click();
  const READER = '[data-part="reader"]:not([data-ghost])';
  await page.waitForSelector(`${READER}[data-ready]`, { timeout: 15_000 });
  await page.waitForTimeout(800);
  const at = await page.evaluate((sel) => {
    const first = document.querySelector(`${sel} [data-part="reader-text"] .lx-w`);
    const bar = document.querySelector(`${sel} [data-part="reader-bar"]`);
    return { word: first?.textContent, top: first ? Math.round(first.getBoundingClientRect().top) : null, bar: bar ? Math.round(bar.getBoundingClientRect().bottom) : null };
  }, READER);
  await page.screenshot({ path: join(OUT, "shots", "pasted-text.png") });
  assert(at.top !== null && at.bar !== null && at.top >= at.bar, `the first word "${at.word}" at ${at.top} px, the top bar ends at ${at.bar}`);
  await go("#read");
  await page.waitForTimeout(300);
  await go("#today");
  return `the first word at ${at.top} px, the bar ends at ${at.bar}`;
});

await stage("your own text: pasted in the language you're learning, it says so; a tap on a word looks it up, and says when it can't", async () => {
  const READER = '[data-part="reader"]:not([data-ghost])';
  await go("#read/paste");
  await settle();
  const pasteBox = page.locator('[data-part="page"] textarea').first();
  await pasteBox.fill("Morgen gaan we naar oma met het boek. Ze woont in een klein huis bij de zee, en blorpje zegt ze niet.");
  await page.getByText("It looks like Dutch").waitFor({ timeout: 15_000 });
  const itsLanguage = () => page.locator('[data-part="list-row"]', { hasText: "Its language" }).locator(".lx-row-value").textContent();
  const guessedIt = await itsLanguage();
  assert(guessedIt.trim() === "Dutch", `its language: ${guessedIt}`);
  await page.locator('[data-part="page"]').getByRole("button", { name: "Add and read" }).click();
  await page.waitForSelector(`${READER}[data-ready]`, { timeout: 15_000 });
  await page.waitForTimeout(800);
  const pageNow = () => page.evaluate((sel) => document.querySelector(sel)?.lxReader?.page ?? null, READER);
  const before = await pageNow();
  const tapWord = async (word) => {
    await page.locator(`${READER} .lx-w`, { hasText: new RegExp(`^${word}\\b`) }).first().click();
    const popover = page.locator(`${READER} ~ [data-part="word-popover"], ${READER} [data-part="word-popover"]`);
    await popover.waitFor({ timeout: 5000 });
    await page.waitForFunction((sel) => !(document.querySelector(`${sel} [data-part="word-popover"] [role="status"]`)?.textContent ?? "").includes("Looking it up"), READER, { timeout: 15_000 });
    return popover.innerText();
  };
  const oma = await tapWord("oma");
  assert(/grandma/i.test(oma) && !/grandma.*grandma/is.test(oma), `oma, each meaning once: ${oma}`);
  assert(/From /.test(oma), `oma's source: ${oma}`);
  await settle();
  await page.screenshot({ path: join(OUT, "shots", "own-text-word.png") });
  // A tap outside closes it (the word may be under it), as it does for a person.
  await page.mouse.click(195, 700);
  await page.waitForTimeout(300);
  const unknown = await tapWord("blorpje");
  assert(/Not in Lexicommons yet/.test(unknown) && !/grandma/i.test(unknown), `blorpje: ${unknown}`);
  await page.screenshot({ path: join(OUT, "shots", "own-text-word-unknown.png") });
  assert((await pageNow()) === before, `a tap on a word turned the page: ${before} → ${await pageNow()}`);
  assert(!/\bAI\b/.test(oma + unknown), `the look-up names an AI: ${oma} ${unknown}`);
  await go("#read");
  await page.waitForTimeout(300);
  // Text in your own language stays as it is, and a tap on it does what a tap on a page does.
  await go("#read/paste");
  await settle();
  await page.locator('[data-part="page"] textarea').first().fill("Tomorrow we are going to see my grandmother, who lives in a small house by the sea with her old dog.");
  await page.waitForTimeout(1500);
  assert(!(await page.getByText("It looks like").count()), "English taken for Dutch");
  // Another language it can't tell stays unguessed: nothing's better than wrong.
  await page.locator('[data-part="page"] textarea').first().fill("Morgen fahren wir zu meiner Großmutter. Sie wohnt in einem kleinen Haus am Meer und hat einen alten Hund.");
  await page.waitForTimeout(1500);
  assert(!(await page.getByText("It looks like").count()), "German taken for Dutch");
  await page.locator('[data-part="page"] textarea').first().fill("Tomorrow we are going to see my grandmother, who lives in a small house by the sea with her old dog.");
  await page.waitForTimeout(800);
  const stayed = await itsLanguage();
  assert(stayed.trim() === "English", `its language: ${stayed}`);
  await page.locator('[data-part="page"]').getByRole("button", { name: "Add and read" }).click();
  await page.waitForSelector(`${READER}[data-ready]`, { timeout: 15_000 });
  await page.waitForTimeout(800);
  await page.locator(`${READER} .lx-w`, { hasText: /^grandmother/ }).first().click();
  await page.waitForTimeout(600);
  assert(!(await page.locator('[data-part="word-popover"]').count()), "a word of your own language looked up");
  await go("#read");
  await page.waitForTimeout(300);
  await go("#today");
  return `oma: ${oma.replace(/\s+/g, " ").trim()}`;
});

await stage("every pack off: Study and Today say what to do without an AI", async () => {
  const before = snapshot();
  await page.evaluate(async () => {
    const packs = await import("/js/study/packs.js");
    for (const p of packs.allPacks()) packs.setPackOn(p.id, false);
  });
  await go("#today");
  await go("#study");
  await look("Study with every pack off", { outside: true });
  await go("#today");
  await look("Today with every pack off", { outside: true });
  await page.evaluate(async () => {
    const packs = await import("/js/study/packs.js");
    for (const p of packs.allPacks()) packs.setPackOn(p.id, true);
  });
  report(before);
});

await stage("the AI section, nothing connected: says it's optional, one thing to press, nothing that only waits", async () => {
  await go("#settings");
  await settle();
  const row = page.locator('[data-part="page"] [data-part="list-row"]', { hasText: /^AI/ }).first();
  assert(await row.count(), "no AI row in Settings");
  await row.click();
  await page.waitForFunction(() => location.hash === "#ai");
  await settle();
  await page.screenshot({ path: join(OUT, "shots", "ai-section-not-connected.png") });
  const words = await page.locator('[data-part="page"]').first().innerText();
  assert(/optional/i.test(words) && /works without it/.test(words), `what it says: ${words.slice(0, 200)}`);
  const fields = await page.locator('[data-part="page"] input, [data-part="page"] textarea, [data-part="request-kind"]').count();
  assert(!fields, `${fields} fields or tiles that only wait`);
  const buttons = await page.locator('[data-part="page"] button').filter({ visible: true }).allTextContents();
  assert(buttons.some((b) => /Connect/.test(b)), `its buttons: ${buttons.join(", ")}`);
  await page.getByRole("button", { name: /Connect/ }).first().click();
  await page.waitForFunction(() => location.hash === "#ai/connect");
  return `its buttons: ${buttons.map((b) => b.trim()).join(", ")}`;
});

await stage("an AI connected, on the Connection page: the tab comes at once with no reload, the token stays on screen, and the section is the whole page", async () => {
  // The calm page was seen just before this, so it's the kept one: connecting has to replace it.
  await go("#ai/connect");
  await page.locator(".lx-quiet-more > summary", { hasText: "Personal tokens" }).click();
  await page.locator('input[aria-label="New personal token\'s name"]').fill("no-ai-check");
  await page.getByRole("button", { name: "Create token" }).click();
  await page.waitForSelector(".lx-secret");
  const tabsNow = () => page.locator('[data-part="tab-bar"] [data-part="tab"]:visible').allTextContents().then((all) => all.map((t) => t.replace(/\s+/g, " ").trim()));
  // Connecting doesn't draw the page again: a token is shown only once. No tab for AI until the switch puts it there; AI is a row on Home, as Read is.
  await page.waitForTimeout(800);
  assert(await page.locator(".lx-secret").isVisible(), "the token it has just made went from the screen");
  const tabs = await tabsNow();
  assert(tabs.join() === "Home,Study,Knowledge,Explore", `the tabs once connected: ${tabs.join(", ")}`);
  await go("#today");
  const aiRow = page.locator('[data-part="page"]:not([data-ghost]) [data-part="home-card"][data-variant="ai"]').first();
  await aiRow.waitFor({ timeout: 8000 });
  await aiRow.click();
  await page.locator('[data-part="page"]:not([data-ghost]) [data-part="ai-practice"]:not([data-variant])').first().waitFor({ timeout: 5000 });
  await settle();
  assert(!(await page.locator('[data-part="page"]:not([data-ghost]) [data-part="ai-practice"][data-variant="connect"]').count()), "the calm page stayed after connecting");
  assert((await page.locator('[data-part="app-back"]').getAttribute("href")) === "#today", "AI, opened from Home, goes back to Home");
  await page.screenshot({ path: join(OUT, "shots", "ai-section-connected.png") });
  // And still no prompts elsewhere: connected or not, they're gone (Study's, say).
  await go("#study");
  await settle();
  assert(!(await page.getByRole("button", { name: "Ask your AI" }).count()), "Study offers Ask your AI to someone connected");
  return `the tabs: ${tabs.join(", ")}`;
});

await stage("the section, connected: Practice with me, then what you can ask for, then past practices, your requests and the connection", async () => {
  await go("#ai");
  await page.locator('[data-part="page"]:not([data-ghost]) [data-part="ai-practice"]').first().waitFor({ timeout: 5000 });
  await settle();
  const words = await page.locator('[data-part="page"]:not([data-ghost])').first().innerText();
  let at = -1;
  for (const heading of ["Practice with me", "Ask your AI for something", "Past practices", "Your requests", "Connection"]) {
    const here = words.indexOf(heading);
    assert(here > at, `"${heading}" isn't in its place: ${words.slice(0, 300)}`);
    at = here;
  }
  assert(!/Ask from anywhere|Ask your AI anything|Start a session/.test(words), `what moved or went is still here: ${words.slice(0, 300)}`);
  const sessions = await page.locator('[data-part="page"]:not([data-ghost]) [data-part="list-row"][href^="#ai/new/"]').count();
  assert(sessions >= 4, `${sessions} kinds to ask for`);
  await page.screenshot({ path: join(OUT, "shots", "ai-section-home.png"), fullPage: true });
  // The connection is here now, and its old address opens it; Settings keeps one row, into the section.
  await page.locator('[data-part="list-row"]', { hasText: "Connection" }).click();
  await page.waitForFunction(() => location.hash === "#ai/connect");
  await page.getByText("How to connect").waitFor({ timeout: 5000 });
  await settle();
  assert((await page.locator('[data-part="app-back"]').getAttribute("href")) === "#ai", "the connection goes back to the section");
  await page.screenshot({ path: join(OUT, "shots", "ai-section-connection.png") });
  await go("#settings/ai");
  await page.waitForFunction(() => location.hash === "#ai/connect");
  await go("#settings");
  await settle();
  const rows = await page.locator('[data-part="page"] .lx-row-title').allTextContents();
  assert(rows.includes("AI") && !rows.includes("Your AI"), `Settings' rows: ${rows.join(", ")}`);
  return `${sessions} kinds to ask for; the order holds; the old address opens it`;
});

// A session's result, and whether it has a "…".
const resultHasAsk = async () => {
  await go("#study/session/game/choose");
  const choice = page.locator('[data-part="session"] [data-part="choice"]').first();
  await choice.waitFor({ timeout: 10_000 });
  await choice.click();
  await page.locator('[data-part="session"] [data-part="answer-bar"]').getByRole("button", { name: /Continue|See how it went/ }).first().waitFor({ timeout: 5000 });
  const count = await page.locator('[data-part="session"] [data-part="answer-bar"] [aria-haspopup="menu"]').count();
  await go("#today");
  await settle();
  return count > 0;
};
const askSwitch = () => page.getByRole("switch", { name: /Ask from anywhere/ });

await stage("Ask from anywhere, in Settings → Appearance → Layout once an AI is connected: off by default; the switch brings the … back, and takes it away", async () => {
  assert(!(await resultHasAsk()), "a … with the switch off");
  await go("#settings/appearance/layout");
  await askSwitch().waitFor({ timeout: 5000 });
  assert(!(await askSwitch().isChecked()), "the switch starts on");
  await askSwitch().click();
  assert(await resultHasAsk(), "no … with the switch on");
  await go("#settings/appearance/layout");
  await askSwitch().click();
  assert(!(await resultHasAsk()), "a … after turning it off");
  await go("#settings/appearance/layout");
  await askSwitch().click();
  assert(await resultHasAsk(), "no … with it on again");
});

await stage("AI in the tab bar: the switch puts it there, with no way back on its page; Read stays a row on Home", async () => {
  await go("#settings/appearance/layout");
  const row = page.locator('[data-part="list-row"]', { hasText: "AI in the tab bar" });
  await row.locator('[data-part="switch"]').click();
  await page.locator('[data-part="tab"]', { hasText: "AI" }).first().click();
  await page.locator('[data-part="page"]:not([data-ghost]) [data-part="ai-practice"]').first().waitFor({ timeout: 5000 });
  await settle();
  assert(!(await page.locator('[data-part="app-back"]').count()), "a kept page kept its way back to Settings");
});

await stage("the AI let go, on the Connection page: the tab goes at once, the section is calm again, and the … goes with it", async () => {
  await go("#ai/connect");
  await page.locator(".lx-quiet-more > summary", { hasText: "Personal tokens" }).click();
  await page.getByRole("button", { name: "Revoke" }).first().click();
  await page.waitForFunction(() => ![...document.querySelectorAll('[data-part="tab-bar"] [data-part="tab"]')].some((t) => t.textContent.trim() === "AI"), null, { timeout: 8000 });
  await go("#ai");
  await page.locator('[data-part="page"]:not([data-ghost]) [data-part="ai-practice"][data-variant="connect"]').waitFor({ timeout: 5000 });
  await page.locator('[data-part="page-title"]', { hasText: /^AI$/ }).waitFor({ timeout: 3000 });
  // The switch was left on: with no AI to answer, there's no "…".
  assert(!(await resultHasAsk()), "a … with no AI connected");
});

await stage("Speaking's settings say plainly that a slip in word order can still pass in Say it, naming the games that catch it", async () => {
  await go("#settings/study/speaking");
  await page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: /^About recognizers$/ }) }).click();
  const note = page.locator('[data-part="sheet"] p', { hasText: "a slip in word order can still pass in Say it" });
  await note.waitFor({ timeout: 8000 });
  const words = await note.innerText();
  assert(/Type it/.test(words) && /Put it in Dutch order/.test(words), `what it says: ${words}`);
  assert(!/\bAI\b/.test(words), `it names an AI: ${words}`);
  await page.screenshot({ path: join(OUT, "shots", "speaking-settings.png") });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[data-part="sheet"]'));
  await go("#today");
});

await stage("the public pages: what it's for says nothing about needing an AI; an AI comes up only as optional", async () => {
  const text = async (path) => {
    const response = await fetch(`${BASE}${path}`, { redirect: "manual" });
    assert(response.status === 200, `${path}: ${response.status}`);
    return response.text();
  };
  const words = (html) => html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<(?!meta|title)[^>]+>/g, " ");
  const OLD = /your own AI makes|with your own AI|AI makes the lessons|Your AI acts for you|the AI you bring|Settings → Your AI/i;
  // The home page's line about talking with an AI (its key site.talk.text) may say "With your own AI": it's the one place the page says what
  // an AI is for, and it must say in the same breath that everything else works without it. That element alone is set aside, by its key;
  // the same words under any other key, or anywhere else on a page, are still found (the two planted pages below).
  const TALK = /<([a-z0-9]+)\b[^>]*\bdata-t="site\.talk\.text"[^>]*>([^<]*)<\/\1>/;
  const oldWords = (path, html) => {
    let rest = html;
    if (path === "/") {
      const talk = html.match(TALK);
      if (talk && /everything else works without it\./.test(talk[2])) rest = html.replace(talk[0], " ");
    }
    const said = words(rest);
    return OLD.test(said) ? `${path}: ${said.match(new RegExp(`.{0,40}${OLD.source}.{0,40}`, "i"))?.[0].trim()}` : null;
  };
  const found = [];
  let homeHtml = "";
  for (const path of ["/", "/terms", "/privacy", "/manifest.webmanifest", "/login"]) {
    const html = await text(path);
    if (path === "/") homeHtml = html;
    const old = oldWords(path, html);
    if (old) found.push(old);
  }
  assert(!found.length, found.join(" · "));
  assert(TALK.test(homeHtml), "the home page's talk line (site.talk.text) isn't on the page");
  assert(oldWords("/", homeHtml.replace("</main>", "<p>Practice with your own AI every day.</p></main>")), "a planted line elsewhere on the home page wasn't found");
  assert(oldWords("/", homeHtml.replace('data-t="site.talk.text"', 'data-t="site.other.text"')), "the talk line's words under another key weren't found");
  assert(oldWords("/", homeHtml.replace("and everything else works without it.", "every day.")), "the talk line without its optional half wasn't found");
  assert(oldWords("/terms", homeHtml), "the talk line on another page wasn't found");
  const home = words(await text("/"));
  assert(/Learn a language for free\./.test(home), "the home page's headline");
  assert(/It['’]s optional, and everything else works without it\./.test(home), "the home page: AI as optional");
  // The AI's fact comes after what the app is: its three screens and the other facts.
  const ai = home.indexOf("Your own AI, if you want one");
  const before = ["Learn words with pictures", "What you miss comes back", "Read real books", "Free, with no ads", "Open source", "Your progress is yours"];
  assert(ai >= 0 && before.every((w) => home.indexOf(w) >= 0 && home.indexOf(w) < ai), `the home page: AI comes last (${JSON.stringify(before.filter((w) => !(home.indexOf(w) >= 0 && home.indexOf(w) < ai)))} not before it)`);
  assert(/works without an AI/.test(words(await text("/terms"))), "the terms: works without one");
  // Open source is what it is from launch: the home page's fact and Settings → About say so in the same words.
  assert(/<h3[^>]*>Open source<\/h3>/.test(homeHtml), "the home page on open source");
  await go("#settings/about");
  await page.getByText("Free and open source.").waitFor({ timeout: 5000 });
  return "/, /terms, /privacy, /manifest.webmanifest, /login";
});

await stage("no page errors", () => assert(!errors.length, errors.slice(0, 3).join(" | ")));

await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
await browser.close();
const list = [...found.values()];
writeFileSync(join(OUT, "no-ai-check.json"), JSON.stringify({ screens, mentions: list, results }, null, 1));
const outsideLines = new Set(list.filter((m) => !m.tab).map((m) => `${m.how === "text" ? "" : `${m.how}: `}${m.text}`));
console.log(`\n${screens} screens; ${outsideLines.size} different mention(s) of an AI outside the AI section, on ${new Set(list.filter((m) => !m.tab).map((m) => m.screen)).size} screens${list.some((m) => m.tab) ? "; the AI tab" : ""}`);
for (const line of outsideLines) console.log(`  ${line.slice(0, 150)}`);
console.log(failed ? `${failed} FAILED` : "all passed");
await new Promise((r) => setTimeout(r, 100));
process.exit(failed ? 1 : 0);
