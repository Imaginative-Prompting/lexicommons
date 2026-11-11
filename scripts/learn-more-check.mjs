// Something to learn after every answer (study/learn-more.js), on a phone: the "?" on every result, right and wrong, in every game, and the
// drawer it opens over the question.
//   - every game (each of plan.js's GAMES, alone, and Study cards once shown): one "?" on a right result and on a wrong one (I don't know
//     where nobody speaks), 44 px, on the screen, clear of the result's words, named for what it opens;
//   - the drawer from each: a word (Tap the picture, Pick the word, Type the word, the speaking twins; What does it mean?'s word; a Study
//     card's) as a dictionary has it, its meaning from the packs; a sentence with its words in order and its ideas; Match's round with its
//     misses marked first; opening it, reading it and going inside it records nothing, and Escape closes it, not the session;
//   - inside: a sentence's word opening that word's page and the floating back returning; an idea opening its sheet;
//   - what a word's page says is the data's own: each form's line the language's forms or a pack's note, the rank the word list's with its
//     credit linked, its sentences ones the word is in;
//   - a deck's card (a pack of your own, its cards with fields and tags): the "?" on each game's result and on a shown card, its drawer
//     carrying the card's fields and tags, and none of them on a card with none;
//   - a lesson: the "?" on a right answer too, and its idea in the lesson's own words;
//   - a word's drawing from the lesson that first taught it beside that lesson's own sentence, and none beside a word pack's card that uses
//     another sense (halen, stuk, band, kaart on the real Dutch packs; learn-senses.js pictureFits); alone, its drawing;
//   - 320 × 568 in the light theme: the drawer no wider than the screen, the "?" clear of the result's words; pictures of each.
// Fails on the app from before (no "?" anywhere): --from <copy> serves another copy's /js and /css in place of the server's, to show it.
// LOCAL only: it signs up accounts with a virtual passkey; the local library must have path-nl and Dutch's word packs (npm run local), else exit 2.
// Usage: node scripts/learn-more-check.mjs http://localhost:<port> <outDir> [--only <regex>] [--from <copy dir>]   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { knowWords } from "./fixtures/know-words.mjs";
import { answerStep, nextStep, SESSION } from "./fixtures/play-session.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
const ONLY = opt("only") ? new RegExp(opt("only")) : null;
const FROM = opt("from") ? resolve(opt("from")) : null;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/learn-more-check.mjs http://localhost:<port> <outDir> [--only <regex>] [--from <copy dir>] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const catalogue = await (await fetch(`${BASE}/library/catalogue.json`)).json().catch(() => ({}));
if (!(catalogue.packs?.nl ?? []).some((pack) => pack.id === "path-nl") || !(catalogue.packs?.nl ?? []).some((pack) => pack.id === "words-nl-01")) {
  console.error("learn-more-check: the local library doesn't list path-nl and words-nl-01; seed them first (npm run local).");
  process.exit(2);
}
setTimeout(() => {
  console.error("learn-more-check: ceiling of 25 minutes");
  process.exit(3);
}, 25 * 60_000).unref();

const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const results = [];
const assert = (cond, what) => {
  if (!cond) throw new Error(what);
};
const same = (got, want, what) => assert(JSON.stringify(got) === JSON.stringify(want), `${what}\n  got  ${JSON.stringify(got)?.slice(0, 400)}\n  want ${JSON.stringify(want)?.slice(0, 400)}`);
const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function stage(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail, ms: Date.now() - started });
    console.log(`  ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error.stack ?? error), ms: Date.now() - started });
    console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split("\n").slice(0, 12).join("\n        ")}`);
  }
}

/** A phone with a new account (a virtual passkey) that knows its words. */
async function phone({ width = 390, height = 844, theme = "graphite", know = true } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: theme === "paper" ? "light" : "dark" });
  await context.addInitScript((theme) => {
    try {
      if (!localStorage.getItem("lx.appearance.v1")) localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, theme, presets: {} }));
    } catch {}
  }, theme);
  if (FROM) {
    // Another copy's own files in place of the server's: the control, the app from before.
    await context.route(/\/(js|css)\/.*\.(js|css)(\?.*)?$/, async (route) => {
      const path = new URL(route.request().url()).pathname;
      const file = join(FROM, "public", path);
      if (!existsSync(file)) return route.fulfill({ status: 404, body: "" });
      await route.fulfill({ status: 200, contentType: path.endsWith(".css") ? "text/css" : "text/javascript", body: readFileSync(file) });
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Learn More Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  if (know) await knowWords(page);
  return { context, page, errors };
}

const go = async (page, hash) => {
  await page.evaluate((hash) => (location.hash = hash), hash);
  await page.waitForSelector(SESSION, { timeout: 20_000 });
  await page.waitForTimeout(400);
};
const evidence = (page) => page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().length);
const stepId = (page) => page.evaluate((S) => {
  const step = document.querySelector(S)?.lxStep;
  return step ? `${step.kind}|${step.unit ?? ""}|${step.item?.id ?? ""}|${step.card?.id ?? ""}` : null;
}, SESSION);
const cont = async (page) => {
  await page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first().click();
  await page.waitForTimeout(250);
};

/** The "?" now: how many, its box and name, the result's words' boxes, the screen. */
const learnNow = (page) =>
  page.evaluate((S) => {
    const root = document.querySelector(S);
    const bar = root?.querySelector('[data-part="answer-bar"]');
    const all = bar ? [...bar.querySelectorAll('[data-part="learn-more"]')] : [];
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom };
    };
    const one = all[0] ?? null;
    return {
      count: all.length,
      box: box(one),
      label: one?.getAttribute("aria-label") ?? null,
      title: box(bar?.querySelector('[data-part="feedback-title"]')),
      text: box(bar?.querySelector('[data-part="feedback-text"]')),
      screen: { w: innerWidth, h: innerHeight },
    };
  }, SESSION);
const overlaps = (a, b) => Boolean(a && b) && a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5;
/** The "?" holds its rules: one, 44 px, on the screen, clear of the result's words, named. */
function learnHolds(now, where) {
  assert(now.count === 1, `${where}: ${now.count} "?" on the result (want 1)`);
  assert(now.box.w >= 44 && now.box.h >= 44, `${where}: the "?" is ${now.box.w} × ${now.box.h} (under 44)`);
  assert(now.box.x >= 0 && now.box.r <= now.screen.w + 0.5 && now.box.y >= 0 && now.box.b <= now.screen.h + 0.5, `${where}: the "?" is off the screen ${JSON.stringify(now.box)}`);
  // Its drawing, not its press area, must stay clear: the press area reaches 8 px past it each way.
  const drawn = { x: now.box.x + 8, y: now.box.y + 8, r: now.box.r - 8, b: now.box.b - 8 };
  assert(!overlaps(drawn, now.title) && !overlaps(drawn, now.text), `${where}: the "?" is over the result's words ${JSON.stringify({ drawn, title: now.title, text: now.text })}`);
  assert(/^Learn more/.test(now.label ?? ""), `${where}: the "?" is named ${JSON.stringify(now.label)}`);
}

/** What the drawer should open on for the step on the screen, from the app's own data: { page, title?, gloss?, sentence?, words?, ideas?, pairs? }. */
const expectedFor = (page) =>
  page.evaluate(async (S) => {
    const step = document.querySelector(S).lxStep;
    const content = await import("/js/study/content.js");
    const { pathThing } = await import("/js/study/path.js");
    const { articled } = await import("/js/study/lesson.js");
    const { meaningOfWord } = await import("/js/study/new-words.js");
    const word = (unit) => {
      if (unit.startsWith("c:")) return { page: "phrase", title: content.CHUNKS[unit.slice(2)].text, gloss: content.CHUNKS[unit.slice(2)].en };
      const lemma = unit.slice(2);
      const thing = pathThing(unit);
      const name = content.writtenName(unit);
      return { page: "word", title: thing?.article ? articled(thing.article, name) : name, gloss: content.WORDS[lemma] ?? thing?.means ?? "" };
    };
    const kind = step.kind;
    if (["see", "word", "type-word", "say-word", "repeat-word"].includes(kind)) return { kind, ...word(step.unit) };
    if (kind === "meaning") return { kind, ...word(`w:${step.target}`), sentence: content.sentence(step.item) };
    if (kind === "card") {
      const lemma = step.target ?? null;
      return lemma && content.WORDS[lemma] !== undefined ? { kind, ...word(`w:${lemma}`), sentence: content.sentence(step.item) } : { kind, page: "sentence", sentence: content.sentence(step.item) };
    }
    if (kind === "match") return { kind, page: "round", pairs: (step.words?.length ?? 0) + (step.phrases?.length ?? 0) + (step.items?.length ?? 0) };
    if (kind === "deck") return { kind, page: "card", title: step.card.text };
    const item = step.item;
    const { lemmaOfForm, glossOfForm } = await import("/js/study/new-words.js");
    const { writtenOf } = await import("/js/study/written.js");
    const lang = content.contentLanguage();
    const bare = (text) => text.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "");
    // As the language writes each word: the sentence's start gives its first word no capital of its own (written.js decides).
    const lemmaAt = (text, at) => item.words[at][1] ?? (meaningOfWord(text, item, at) ? lemmaOfForm(text) ?? null : null);
    const written = (text, at) => {
      const word = bare(text);
      const lemma = lemmaAt(text, at);
      if (at !== 0 || !lemma) return word;
      const as = writtenOf(lang, lemma) ?? lemma;
      return as[0] === as[0].toLocaleLowerCase(lang) ? word[0].toLocaleLowerCase(lang) + word.slice(1) : word;
    };
    const seen = new Set();
    const rows = item.words
      .map(([text], at) => ({ text: written(text, at), gloss: meaningOfWord(text, item, at)?.gloss ?? "", senses: lemmaAt(text, at) ? String(glossOfForm(lemmaAt(text, at), bare(text)) ?? "").split(";").map((one) => one.trim()).filter(Boolean) : [] }))
      .filter((one) => (seen.has(`${one.text.toLowerCase()}|${one.gloss}`) ? false : seen.add(`${one.text.toLowerCase()}|${one.gloss}`)));
    const words = rows.map((one) => one.text);
    const senses = rows.map((one) => one.senses);
    const idea = step.idea ?? null;
    const ideas = content.sentenceUnits(item).filter((unit) => unit.startsWith("p:") || unit.startsWith("c:")).map((unit) => (idea && unit === `p:${idea.pattern}` ? idea.name : content.describe(unit).name));
    return { kind, page: "sentence", sentence: content.sentence(item), words, senses, ideas, literal: (item.literal ?? []).map(([text]) => text).join(" ") };
  }, SESSION);

/** The drawer as it is: which page, its name, its gloss, its sentence line(s), its rows. */
const drawerNow = (page) =>
  page.evaluate(() => {
    const sheet = document.querySelector('[data-part="learn-sheet"]');
    if (!sheet) return null;
    const text = (node) => node?.textContent.replace(/\s+/g, " ").trim() ?? null;
    const body = sheet.closest(".lx-sheet-body");
    return {
      page: sheet.dataset.page,
      title: text(sheet.querySelector(".lx-learn-name > .lx-concept-name, :scope > [data-part='concept-sheet'] > .lx-concept-name, .lx-concept-top > .lx-concept-name")),
      gloss: text(sheet.querySelector(".lx-learn-gloss")),
      lines: [...sheet.querySelectorAll(".lx-concept-line")].map(text),
      words: [...sheet.querySelectorAll(".lx-learn-word-text")].map((node) => text(node.firstChild)),
      // Each word's meaning here as the row says it (its note aside).
      means: [...sheet.querySelectorAll(".lx-learn-word-means")].map((node) => text(node.firstChild)),
      missed: sheet.querySelectorAll(".lx-learn-missed").length,
      ideas: [...sheet.querySelectorAll(".lx-learn-idea-name")].map(text),
      back: Boolean(sheet.querySelector(".lx-learn-back .lx-back")),
      practice: [...sheet.querySelectorAll("button")].some((b) => b.textContent.trim() === "Practice this"),
      wide: body ? body.scrollWidth - body.clientWidth : 0,
      pageWide: document.documentElement.scrollWidth - innerWidth,
    };
  });
const openDrawer = async (page, open = () => page.locator(`${SESSION} [data-part="learn-more"]`).first().click()) => {
  await open();
  await page.waitForSelector('[data-part="learn-sheet"]', { timeout: 5_000 });
  await page.waitForTimeout(350);
  return drawerNow(page);
};
const closeDrawer = async (page) => {
  await page.keyboard.press("Escape");
  await page.locator(".lx-sheet-layer").waitFor({ state: "detached", timeout: 5_000 });
};
/** The drawer matches what the data says it should be. */
function drawerIs(drawer, want, where) {
  assert(drawer, `${where}: no drawer`);
  same(drawer.page, want.page, `${where}: the drawer's page`);
  if (want.title) same(drawer.title, want.title, `${where}: its name`);
  if (want.gloss !== undefined && (want.page === "word" || want.page === "phrase")) same(drawer.gloss ?? "", want.gloss, `${where}: its meaning`);
  if (want.page === "word" || want.page === "phrase") assert(drawer.practice, `${where}: no Practice this`);
  if (want.sentence) assert(drawer.lines.includes(want.sentence), `${where}: the sentence "${want.sentence}" isn't in it: ${JSON.stringify(drawer.lines)}`);
  if (want.words) same(drawer.words, want.words, `${where}: its words, in order`);
  if (want.senses) {
    // A word of several senses says only those it has here (each its own, each in the word-for-word line), or how many it has: never its
    // whole entry, whose other senses mislead.
    want.senses.forEach((own, i) => {
      if (own.length < 2) return;
      const said = drawer.means[i] ?? "";
      assert(said !== own.join("; "), `${where}: ${want.words[i]} shows its whole entry ("${said}")`);
      if (/^\d+ meanings$/.test(said)) return;
      for (const sense of said.split("; ")) assert(own.includes(sense), `${where}: ${want.words[i]}'s "${sense}" isn't one of its senses (${own.join(" | ")})`);
    });
  }
  if (want.ideas) same(drawer.ideas, want.ideas, `${where}: its ideas`);
  if (want.pairs !== undefined) same(drawer.words.length, want.pairs, `${where}: the round's words`);
  assert(drawer.wide <= 1 && drawer.pageWide <= 1, `${where}: wider than the screen by ${Math.max(drawer.wide, drawer.pageWide)} px`);
}

/** A wrong answer in Match: one tile given another's English, then every pair. */
async function missMatch(page) {
  const step = await nextStep(page);
  assert(step.kind === "match", `not a Match round: ${step.kind}`);
  await page.evaluate((S) => (globalThis.__lxPlayed = document.querySelector(S)?.lxStep ?? null), SESSION);
  const side = (s) => page.locator(`${SESSION} [data-part="match-item"][data-side="${s}"]`);
  const whole = (text) => new RegExp(`^${esc(text)}$`);
  const nls = await side("nl").allTextContents();
  await side("nl").filter({ hasText: whole(nls[0]) }).first().click();
  await side("en").filter({ hasText: whole(step.answers[nls[1]]) }).first().click();
  await page.waitForTimeout(300);
  for (const nl of nls) {
    await side("nl").filter({ hasText: whole(nl) }).first().click();
    await side("en").filter({ hasText: whole(step.answers[nl]) }).first().click();
    await page.waitForTimeout(120);
  }
  await page.waitForSelector(`${SESSION} [data-part="answer-bar"] [data-part="feedback"]`, { timeout: 8_000 });
  return step;
}

/** One result: the "?" holds, its drawer is the data's, nothing is recorded, Escape closes only it. */
async function result(page, where, { drawer = true } = {}) {
  const now = await learnNow(page);
  learnHolds(now, where);
  if (!drawer) return null;
  const want = await expectedFor(page);
  const before = await evidence(page);
  const step = await stepId(page);
  const got = await openDrawer(page);
  drawerIs(got, want, where);
  await closeDrawer(page);
  same(await evidence(page), before, `${where}: opening the drawer recorded something`);
  same(await stepId(page), step, `${where}: the step changed under the drawer`);
  assert((await learnNow(page)).count === 1, `${where}: the result went with the drawer (Escape ended more than the drawer)`);
  return { want, got };
}

const GAMES = await (async () => {
  const { page, context } = await phone({ know: false });
  const games = await page.evaluate(async () => (await import("/js/study/game-modes.js")).QUICK_GAMES);
  await context.close();
  return games;
})();

await stage("every game: one \"?\" on a right result and on a wrong one, 44 px, on the screen, clear of the result's words, its drawer the data's own, nothing recorded, Escape closing only it", async () => {
  const { page, context, errors } = await phone();
  const seen = [];
  try {
    for (const game of GAMES) {
      await go(page, `#study/session/game/${game}`);
      const first = await nextStep(page);
      assert(first.kind === game, `#study/session/game/${game} began with a ${first.kind} step`);
      const speaking = ["say", "repeat", "say-word", "repeat-word"].includes(game);
      if (!speaking && game !== "match") {
        await answerStep(page, { next: false });
        await result(page, `${game}, right`);
        await cont(page);
      } else if (game === "match") {
        await answerStep(page, { next: false });
        await result(page, "match, right");
        await cont(page);
      }
      if (game === "match") {
        const step = await missMatch(page);
        const { got } = await result(page, "match, with a miss");
        assert(got.missed >= 1, `match: no word marked missed (${JSON.stringify(got)})`);
        seen.push(game);
        continue;
      }
      const wrong = await answerStep(page, { wrong: true, next: false });
      await result(page, `${game}, ${wrong.missed ? "I don't know" : "wrong"}`);
      seen.push(game);
    }
    // Study cards: the "?" leads the grades once the card is shown, and opens the word it's about.
    await go(page, "#study/session/cards");
    await page.locator(`${SESSION} button`, { hasText: /^Show meaning$/ }).first().click();
    await page.waitForTimeout(300);
    const card = await learnNow(page);
    assert(card.count === 1 && card.box.w >= 44, `a shown card: ${JSON.stringify(card)}`);
    const want = await expectedFor(page);
    const before = await evidence(page);
    drawerIs(await openDrawer(page), want, "a Study card");
    await closeDrawer(page);
    same(await evidence(page), before, "a Study card: opening the drawer recorded something");
    seen.push("card");
    assert(!errors.length, `page errors: ${errors.join(" | ")}`);
    return `${seen.length}: ${seen.join(", ")}`;
  } finally {
    await page.screenshot({ path: join(OUT, "every-game-last.png") }).catch(() => {});
    await context.close();
  }
});

await stage("inside the drawer: a sentence's word opens its page and the floating back returns; an idea opens its sheet; nothing recorded", async () => {
  const { page, context, errors } = await phone();
  try {
    await go(page, "#study/session/game/fill");
    // A sentence with an idea, wrong.
    let found = null;
    for (let i = 0; i < 6 && !found; i++) {
      const step = await answerStep(page, { wrong: true, next: false });
      const want = await expectedFor(page);
      if (want.ideas?.length) found = { step, want };
      else await cont(page);
    }
    assert(found, "no sentence with an idea in six steps");
    const before = await evidence(page);
    const sentence = await openDrawer(page);
    drawerIs(sentence, found.want, "the sentence");
    await page.screenshot({ path: join(OUT, "inside-sentence.png") });
    // Its second word with a page of its own.
    const rows = page.locator('[data-part="learn-sheet"] button.lx-learn-word-row');
    assert((await rows.count()) >= 1, "no word in the sentence opens a page");
    const row = rows.nth(Math.min(1, (await rows.count()) - 1));
    const unit = await row.getAttribute("data-unit");
    const wantWord = await page.evaluate(async (unit) => {
      const content = await import("/js/study/content.js");
      const { pathThing } = await import("/js/study/path.js");
      const { articled } = await import("/js/study/lesson.js");
      if (unit.startsWith("c:")) return { page: "phrase", title: content.CHUNKS[unit.slice(2)].text };
      const thing = pathThing(unit);
      const name = content.writtenName(unit);
      return { page: "word", title: thing?.article ? articled(thing.article, name) : name, gloss: content.WORDS[unit.slice(2)] ?? "" };
    }, unit);
    await row.click();
    await page.waitForTimeout(300);
    const word = await drawerNow(page);
    drawerIs(word, wantWord, `the sentence's word ${unit}`);
    assert(word.back, "no way back to the sentence");
    await page.screenshot({ path: join(OUT, "inside-word.png") });
    await page.locator('[data-part="learn-sheet"] .lx-learn-back .lx-back').click();
    await page.waitForTimeout(300);
    same((await drawerNow(page)).page, "sentence", "back from the word");
    // Its idea: today's idea sheet, in the drawer.
    await page.locator('[data-part="learn-sheet"] .lx-learn-idea-row').first().click();
    await page.waitForTimeout(500);
    const idea = await drawerNow(page);
    same(idea.page, "idea", "the idea's page");
    same(idea.title, found.want.ideas[0], "the idea's name");
    assert(idea.back, "no way back from the idea");
    await page.screenshot({ path: join(OUT, "inside-idea.png") });
    await closeDrawer(page);
    same(await evidence(page), before, "going inside the drawer recorded something");
    assert(!errors.length, `page errors: ${errors.join(" | ")}`);
    return `${found.want.sentence}: ${unit}, ${found.want.ideas[0]}`;
  } finally {
    await context.close();
  }
});

await stage("a word's page says only the data's: each form's line the language's forms or a pack's note, its sentences ones it's in, its rank the word list's with its credit linked", async () => {
  const { page, context, errors } = await phone();
  try {
    await go(page, "#study/session/game/word");
    let checked = 0;
    const said = [];
    for (let i = 0; i < 4; i++) {
      const step = await answerStep(page, { wrong: true, next: false });
      if (!step.unit?.startsWith("w:")) {
        await cont(page);
        continue;
      }
      await openDrawer(page);
      const lemma = step.unit.slice(2);
      const facts = await page.evaluate(async (lemma) => {
        const sheet = document.querySelector('[data-part="learn-sheet"]');
        const { contentLanguage } = await import("/js/study/content.js");
        const { formNow, notesNow } = await import("/js/study/notes.js");
        const { sentencesWith } = await import("/js/study/new-words.js");
        const { rankOf, frequencyCredit } = await import("/js/study/frequency.js");
        const { pathThing } = await import("/js/study/path.js");
        const lang = contentLanguage();
        const bare = (text) => text.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, "").toLocaleLowerCase(lang);
        const items = sentencesWith(lemma);
        // Every form the packs write it in, and every line the data has for each.
        const forms = new Map();
        for (const item of items) item.words.forEach(([text, word], at) => {
          if (word !== lemma) return;
          const lines = forms.get(bare(text)) ?? new Set();
          const one = formNow(lang, lemma, text.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, ""));
          if (one) lines.add(one);
          const note = notesNow(item)?.words?.[at]?.form;
          if (note) lines.add(note);
          forms.set(bare(text), lines);
        });
        for (const form of pathThing(`w:${lemma}`)?.forms ?? []) if (!forms.has(bare(form))) forms.set(bare(form), new Set([formNow(lang, lemma, form)].filter(Boolean)));
        const shownForms = [...sheet.querySelectorAll(".lx-learn-forms dt")].map((dt) => ({ form: dt.textContent, line: dt.nextElementSibling?.textContent ?? "" }));
        const alsoForms = (sheet.querySelector(".lx-learn-also")?.textContent ?? "").split(", ").filter(Boolean);
        const wrongForm = [...shownForms.map((one) => one.form), ...alsoForms].filter((form) => !forms.has(form));
        const wrongLine = shownForms.filter((one) => !forms.get(one.form)?.has(one.line));
        // Its sentences: each one of the packs' with the word in it.
        const texts = new Set(items.map((item) => item.words.map(([text], i) => (i === item.words.length - 1 ? text + (item.punct ?? "") : text)).join(" ")));
        const lines = [...sheet.querySelectorAll(".lx-learn-used .lx-concept-line")].map((node) => node.textContent.replace(/\s+/g, " ").trim());
        const strayLines = lines.filter((line) => !texts.has(line));
        const rank = rankOf(lemma, lang);
        const rankText = [...sheet.querySelectorAll(".lx-learn-section .lx-learn-text")].map((node) => node.textContent).find((text) => /most common/.test(text)) ?? null;
        const credit = frequencyCredit(lang);
        const links = [...sheet.querySelectorAll(".lx-learn-credit a")].map((a) => a.href);
        return { shownForms: shownForms.length + alsoForms.length, wrongForm, wrongLine, lines: lines.length, strayLines, rank: Number.isFinite(rank) ? rank : null, rankText, creditUrls: credit?.attribution.map((one) => one.url) ?? [], links };
      }, lemma);
      same(facts.wrongForm, [], `${lemma}: forms no pack writes`);
      same(facts.wrongLine, [], `${lemma}: a form's line that isn't the data's`);
      same(facts.strayLines, [], `${lemma}: sentences that aren't the packs'`);
      assert(facts.lines >= 1, `${lemma}: no sentence`);
      if (facts.rank) {
        assert(facts.rankText?.includes(String(facts.rank)), `${lemma}: the rank says ${JSON.stringify(facts.rankText)}, the list ${facts.rank}`);
        for (const url of facts.creditUrls) assert(facts.links.some((link) => link.startsWith(url.replace(/\/$/, ""))), `${lemma}: no link to ${url} by its rank`);
        assert(facts.links.some((link) => /opensubtitles\.org/.test(link)), `${lemma}: no link to OpenSubtitles`);
      } else assert(!facts.rankText, `${lemma}: a rank with none on the list`);
      said.push(`${lemma}: ${facts.shownForms} forms, ${facts.lines} sentences${facts.rank ? `, #${facts.rank}` : ""}`);
      checked++;
      await closeDrawer(page);
      await cont(page);
    }
    assert(checked >= 2, `only ${checked} words looked at`);
    assert(!errors.length, `page errors: ${errors.join(" | ")}`);
    return said.join("; ");
  } finally {
    await context.close();
  }
});

await stage("a deck's card: the \"?\" on every game's result and on a shown card, its drawer carrying the card's fields and tags, none on a card with none", async () => {
  const { page, context, errors } = await phone({ know: false });
  try {
    await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
    const DECK = {
      format: "lexicommons-pack",
      version: 2,
      id: "anki-learn-more-deck",
      name: "Learn more deck",
      language: "nl",
      from: "en",
      topics: {},
      words: {},
      chunks: {},
      patterns: {},
      items: [
        // Every field a card can bring filled (and only the plain fields on the rest).
        ["het huis", "the house", [{ label: "Notes", text: "a home too" }, { label: "Part of speech", text: "noun" }], ["chapter-1", "noun::place"], { sentence: "Het huis is groot.", sentenceBack: "The house is big." }],
        ["de vos", "the fox", [{ label: "Notes", text: "a red animal" }, { label: "Part of speech", text: "noun" }], ["animals"], { sentence: "De vos is snel.", sentenceBack: "The fox is fast." }],
        ["de das", "the badger"],
        ["de egel", "the hedgehog"],
        ["de otter", "the otter"],
        ["de wezel", "the weasel"],
      ].map(([text, means, extras, tags, more], i) => ({ id: `c${i}`, text, means, ...(extras ? { extras } : {}), ...(tags ? { tags } : {}), ...(more ?? {}) })),
    };
    const saved = await page.evaluate(async (pack) => (await import("/js/study/packs.js")).savePack(pack), DECK);
    assert(saved.ok, `the deck wasn't saved: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
    await go(page, `#study/session/deck/${DECK.id}`);
    const games = new Set();
    let withFields = 0;
    let without = 0;
    for (let i = 0; i < 30; i++) {
      const now = await page.evaluate((S) => {
        const root = document.querySelector(S);
        if (!root || root.querySelector('[data-part="session-summary"]')) return null;
        const step = root.lxStep;
        return step ? { kind: step.kind, game: step.game, card: step.card ? { text: step.card.text, means: step.card.means ?? null, sentence: step.card.sentence ?? null, sentenceBack: step.card.sentenceBack ?? null, extras: step.card.extras ?? null, tags: step.card.tags ?? null } : null, entries: step.entries?.map((one) => ({ text: one.card.text, means: one.card.means })) ?? null } : null;
      }, SESSION);
      if (!now) break;
      if (now.kind !== "deck") {
        await answerStep(page, {});
        continue;
      }
      games.add(now.game);
      const where = `the deck's ${now.game} on ${now.card?.text}`;
      if (now.game === "card") {
        await page.getByRole("button", { name: "Show the other side" }).click();
        await page.waitForTimeout(250);
        const shown = await page.locator(`${SESSION} [data-part="learn-more"]`).count();
        same(shown, 1, `${where}: the "?" once shown`);
      } else if (now.game === "match") {
        const items = page.locator(`${SESSION} [data-part="match-item"]`);
        const whole = (text) => new RegExp(`^${esc(text)}$`);
        for (const entry of now.entries) {
          await items.filter({ hasText: whole(entry.text) }).first().click();
          await items.filter({ hasText: whole(entry.means) }).first().click();
        }
        await page.waitForSelector(`${SESSION} [data-part="answer-bar"] [data-part="feedback"]`, { timeout: 8_000 });
        learnHolds(await learnNow(page), where);
        // The round's drawer: its cards, each opening as the card it is.
        const before = await evidence(page);
        const round = await openDrawer(page);
        same(round.page, "round", `${where}: the drawer`);
        same(round.words.length, now.entries.length, `${where}: the round's cards`);
        await page.locator('[data-part="learn-sheet"] button.lx-learn-word-row').first().click();
        await page.waitForTimeout(300);
        const card = await drawerNow(page);
        same(card.page, "card", `${where}: a card of the round`);
        assert(now.entries.some((entry) => entry.text === card.title), `${where}: the card opened is ${card.title}`);
        await closeDrawer(page);
        same(await evidence(page), before, `${where}: opening the round's drawer recorded something`);
        games.add("match");
        await cont(page);
        continue;
      } else {
        await page.getByRole("button", { name: "I don't know" }).click();
        await page.waitForTimeout(250);
        learnHolds(await learnNow(page), where);
      }
      const before = await evidence(page);
      const drawer = await openDrawer(page);
      same(drawer.page, "card", `${where}: the drawer`);
      same(drawer.title, now.card.text, `${where}: its name`);
      const text = (await page.locator('[data-part="learn-sheet"]').innerText()).replace(/\s+/g, " ");
      if (now.card.extras) {
        // Everything "More on this card" showed (each field and the tags), and the card's own sides and sentence.
        for (const extra of now.card.extras) assert(text.includes(extra.label) && text.includes(extra.text), `${where}: its field ${extra.label} isn't in the drawer: ${text.slice(0, 300)}`);
        assert(text.includes((now.card.tags ?? []).join(", ")), `${where}: its tags ${now.card.tags} aren't in the drawer`);
        for (const value of [now.card.means, now.card.sentence, now.card.sentenceBack]) assert(value && text.includes(value), `${where}: "${value}" isn't in the drawer: ${text.slice(0, 300)}`);
        assert(!/script|alert|onerror/i.test(text), `${where}: markup in the drawer`);
        if (!withFields) await page.screenshot({ path: join(OUT, "deck-card-drawer.png") });
        withFields++;
      } else {
        same(await page.locator('[data-part="learn-sheet"] [data-card-tags]').count(), 0, `${where}: tags on a card with none`);
        assert(!/Notes/.test(text), `${where}: fields on a card with none: ${text.slice(0, 200)}`);
        without++;
      }
      await closeDrawer(page);
      same(await evidence(page), before, `${where}: opening the drawer recorded something`);
      if (now.game === "card") await page.getByRole("button", { name: /^(Continue|I knew it)$/ }).click();
      else await cont(page);
      await page.waitForTimeout(200);
    }
    assert(withFields >= 1 && without >= 1, `cards looked at: ${withFields} with fields, ${without} without`);
    assert(!errors.length, `page errors: ${errors.join(" | ")}`);
    return `${[...games].join(", ")}; ${withFields} with fields, ${without} without`;
  } finally {
    await context.close();
  }
});

await stage("a lesson: the \"?\" on a right answer too, and the drawer saying the lesson's own line for its idea", async () => {
  const { page, context, errors } = await phone({ know: false });
  try {
    // The first lesson of the path with an idea.
    const lesson = await page.evaluate(async () => {
      await (await import("/js/study/packs.js")).syncLibraryPacks();
      const { pathLessons } = await import("/js/study/path.js");
      for (let i = 0; i < 300 && !pathLessons().some((lesson) => lesson.concept); i++) await new Promise((done) => setTimeout(done, 100));
      const one = pathLessons().find((lesson) => lesson.concept);
      return one ? one.id : null;
    });
    assert(lesson, "no lesson of the path has an idea");
    await go(page, `#study/session/lesson/${encodeURIComponent(lesson)}`);
    let rightResults = 0;
    let idea = null;
    for (let i = 0; i < 30 && !idea; i++) {
      const step = await nextStep(page);
      if (step.kind === "summary") break;
      if (step.kind === "meet") {
        await page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first().click();
        continue;
      }
      if (step.kind === "card") {
        await answerStep(page);
        continue;
      }
      const answered = await answerStep(page, { next: false });
      if (!answered.missed) {
        learnHolds(await learnNow(page), `the lesson's ${answered.kind}, right`);
        rightResults++;
        const lessonIdea = await page.evaluate((S) => document.querySelector(S).lxStep.idea ?? null, SESSION);
        if (lessonIdea && answered.item) {
          const want = await expectedFor(page);
          if (want.page === "sentence" && want.ideas.includes(lessonIdea.name)) {
            const drawer = await openDrawer(page);
            const line = await page.evaluate((name) => {
              const row = [...document.querySelectorAll('[data-part="learn-sheet"] .lx-learn-idea-row')].find((one) => one.querySelector(".lx-learn-idea-name")?.textContent === name);
              return row?.querySelector(".lx-learn-idea-line")?.textContent ?? null;
            }, lessonIdea.name);
            same(line, lessonIdea.line, "the idea's line in the drawer (the lesson's own)");
            assert(drawer.ideas.includes(lessonIdea.name), `the lesson's idea isn't named: ${JSON.stringify(drawer.ideas)}`);
            await page.screenshot({ path: join(OUT, "lesson-idea.png") });
            await closeDrawer(page);
            idea = lessonIdea.name;
          }
        }
      }
      await cont(page);
    }
    assert(rightResults >= 1, "no right answer in the lesson");
    assert(idea, `no step after the lesson's idea showed it (lesson ${lesson})`);
    assert(!errors.length, `page errors: ${errors.join(" | ")}`);
    return `${lesson}: ${rightResults} right results with the "?"; ${idea}`;
  } finally {
    await context.close();
  }
});

await stage("a sentence with the other gender's form (a pack item's otherGender): its drawer names it in one line, A woman says, A man says, To a woman or To a man, the sentence in its own language; none on a sentence without", async () => {
  const { page, context, errors } = await phone({ know: false });
  try {
    const teacher = (word) => [["Ik", "ik"], ["ben", "zijn"], [word, "leraar"]];
    const asked = (word) => [["Ben", "zijn"], ["jij", "jij"], ["de", "de"], ["nieuwe", "nieuw"], [word, "leraar"]];
    const CASES = [
      { text: "Ik ben leraar.", means: "I'm a teacher.", words: teacher("leraar"), punct: ".", other: { text: "Ik ben lerares.", gender: "f", who: "speaker" }, line: "A woman says: Ik ben lerares." },
      { text: "Ik ben lerares.", means: "I'm a teacher.", words: teacher("lerares"), punct: ".", other: { text: "Ik ben leraar.", gender: "m", who: "speaker" }, line: "A man says: Ik ben leraar." },
      { text: "Ben jij de nieuwe leraar?", means: "Are you the new teacher?", words: asked("leraar"), punct: "?", other: { text: "Ben jij de nieuwe lerares?", gender: "f", who: "listener" }, line: "To a woman: Ben jij de nieuwe lerares?" },
      { text: "Ben jij de nieuwe lerares?", means: "Are you the new teacher?", words: asked("lerares"), punct: "?", other: { text: "Ben jij de nieuwe leraar?", gender: "m", who: "listener" }, line: "To a man: Ben jij de nieuwe leraar?" },
      { text: "Ik ben leraar.", means: "I'm a teacher.", words: teacher("leraar"), punct: ".", other: null, line: null },
    ];
    const seen = [];
    for (const [i, one] of CASES.entries()) {
      await page.evaluate(async ({ one, i }) => {
        const { openLearn, sentencePage } = await import("/js/study/learn-more.js");
        const item = { id: `check/other-gender-${i}`, text: one.text, means: one.means, words: one.words, punct: one.punct, concepts: [], ...(one.other ? { otherGender: one.other } : {}) };
        openLearn(sentencePage(item));
      }, { one, i });
      await page.waitForSelector('[data-part="learn-sheet"]', { timeout: 5_000 });
      await page.waitForTimeout(350);
      const found = await page.evaluate(() => {
        const nodes = document.querySelectorAll('[data-part="learn-sheet"] [data-part="other-gender"]');
        return nodes.length ? { count: nodes.length, text: nodes[0].textContent.replace(/\s+/g, " ").trim(), lang: nodes[0].querySelector("[lang]")?.getAttribute("lang") ?? null } : null;
      });
      const where = `"${one.text}"${one.other ? ` with ${one.other.who} ${one.other.gender}` : " with none"}`;
      if (one.line) {
        assert(found, `${where}: no other gender's line in its drawer`);
        same(found.count, 1, `${where}: its lines`);
        same(found.text, one.line, `${where}: the line`);
        same(found.lang, "nl", `${where}: the sentence's language on the line`);
      } else assert(!found, `${where}: a line on a sentence without otherGender: ${JSON.stringify(found)}`);
      if (i === 0) await page.screenshot({ path: join(OUT, "other-gender-drawer.png") });
      // Outside a session the page keeps a sheet layer of its own: this drawer is closed when its sheet is gone.
      await page.keyboard.press("Escape");
      await page.waitForSelector('[data-part="learn-sheet"]', { state: "detached", timeout: 5_000 });
      seen.push(one.line ?? "none on a sentence without");
    }
    assert(!errors.length, `page errors: ${errors.join(" | ")}`);
    return seen.join(" · ");
  } finally {
    await context.close();
  }
});

// A word's drawing from the lesson that first taught it (path.js pathThing, its picture field) only beside a sentence that uses the sense that
// lesson teaches (learn-senses.js pictureFits, as the drawer reads a sentence's senses), on the real Dutch packs: each word's page opened from its
// lesson's own sentence has the lesson's drawing, from a word pack's card of another sense none, and alone (from Knowledge) its drawing. Before
// 9 Nov 2026 halen's dog fetching a stick sat over "we caught the train", stuk's broken plate over "een stuk beter", band's tire over a music
// band and kaart's greeting card over a map.
const PICTURE_CASES = [
  { lemma: "halen", picture: "fetch", lesson: "Ik ga snel water halen voor iedereen", other: "Vandaag haalden we de trein op het nippertje" },
  { lemma: "stuk", picture: "broken", lesson: "Als hij valt, is hij stuk", other: "Vandaag is mijn humeur een stuk beter" },
  { lemma: "band", picture: "tire", lesson: "Er zit een gat in de band", other: "Mijn zus repeteert elke week met haar band" },
  { lemma: "kaart", picture: "card", lesson: "Deze kaart is rood", other: "We moeten deze kaart goed bestuderen" },
];
await stage("a word's drawing: its lesson's beside that lesson's own sentence, none beside a word pack's card of another sense (halen, stuk, band, kaart), its drawing alone", async () => {
  const { page, context, errors } = await phone();
  try {
    const ready = await page.evaluate(async () => {
      const { pathLessons } = await import("/js/study/path.js");
      const { ITEMS } = await import("/js/study/content.js");
      for (let i = 0; i < 300 && (pathLessons().length < 200 || !ITEMS.some((item) => item.words?.some(([, lemma]) => lemma === "nippertje"))); i++) await new Promise((r) => setTimeout(r, 100));
      return pathLessons().length;
    });
    assert(ready >= 200, `the path has ${ready} lessons: path-nl isn't in the local library`);
    const seen = [];
    for (const one of PICTURE_CASES) {
      // The card first: the code before showed the lesson's drawing there (its tile named no picture: "a drawing").
      for (const [which, text] of [["card", one.other], ["lesson", one.lesson], ["alone", null]]) {
        const opened = await page.evaluate(async ({ lemma, text }) => {
          const { ITEMS } = await import("/js/study/content.js");
          const { openLearn, wordPage } = await import("/js/study/learn-more.js");
          const item = text ? ITEMS.find((one) => one.words?.map(([word]) => word).join(" ") === text) : null;
          if (text && !item) return false;
          openLearn(wordPage(`w:${lemma}`, item ? { item } : {}));
          return true;
        }, { lemma: one.lemma, text });
        assert(opened, `${one.lemma}: no sentence "${text}" in the local library's packs`);
        await page.waitForSelector('[data-part="learn-sheet"]', { timeout: 5_000 });
        await page.waitForTimeout(350);
        const shown = await page.evaluate(() => {
          const tile = document.querySelector('[data-part="learn-sheet"] [data-part="word-picture"]');
          return tile ? (tile.dataset.picture ?? "a drawing") : null;
        });
        const want = which === "card" ? null : one.picture;
        same(shown, want, `${one.lemma} ${which === "alone" ? "alone" : `beside "${text}"`}: its drawing`);
        if (one.lemma === "halen" && which !== "alone") {
          // The drawing in, then a picture of the drawer each way.
          if (want) await page.waitForFunction(() => document.querySelector('[data-part="learn-sheet"] [data-part="word-picture"] svg'), null, { timeout: 10_000 });
          await page.screenshot({ path: join(OUT, `word-picture-halen-${which}.png`) });
        }
        await page.keyboard.press("Escape");
        await page.waitForSelector('[data-part="learn-sheet"]', { state: "detached", timeout: 5_000 });
      }
      seen.push(`${one.lemma}: ${one.picture} beside its lesson's, none beside "${one.other}"`);
    }
    assert(!errors.length, `page errors: ${errors.join(" | ")}`);
    return seen.join(" · ");
  } finally {
    await context.close();
  }
});

await stage("320 × 568 in the light theme: the \"?\" clear of the result's words, the drawers no wider than the screen; pictures of each", async () => {
  const { page, context, errors } = await phone({ width: 320, height: 568, theme: "paper" });
  try {
    for (const game of ["see", "fill", "translate", "type-word"]) {
      await go(page, `#study/session/game/${game}`);
      await answerStep(page, { wrong: true, next: false });
      await result(page, `${game} at 320`);
      await page.screenshot({ path: join(OUT, `320-${game}-result.png`) });
      await openDrawer(page);
      await page.screenshot({ path: join(OUT, `320-${game}-drawer.png`) });
      await closeDrawer(page);
    }
    assert(!errors.length, `page errors: ${errors.join(" | ")}`);
    return "see, fill, translate, type-word";
  } finally {
    await context.close();
  }
});

await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((one) => !one.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
