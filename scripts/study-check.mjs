// Study on a phone, from a brand-new account, pressing what a learner presses. With nothing taught, a first lesson is the one thing; after it, Practice is the card and
// Learn something new a row under it. A lesson asks from its first question, a new thing at a time, with nothing to read first; a miss comes back before the end; leaving
// loses nothing. Practice draws only on what's been taught, and every few it suggests the next lesson, which blocks nothing. Where you are lists the path; Start from here
// moves you and marks nothing as learned. Pictures load lazily, and with no drawings, or no voice, no question shows a blank or says so. LOCAL only: it signs up a test
// account, deleted at the end; the local library must have path-nl and the Dutch word packs (scripts/packs/seed-local.mjs --default), else exit 2.
// Usage: node scripts/study-check.mjs http://localhost:<port> <outDir> [--list <frequency.nl.json>] [--only <regex>]   (exit 0 = pass)
// --only: the stages whose names match, after the first (the path pack on the device), which every stage needs.
import { wordsPoint } from "./fixtures/words-point.mjs";
import { answerStep as playStep, nextStep, pastReminderAsk } from "./fixtures/play-session.mjs";
import { chromium } from "./quiet-browser.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const LIST = argv.includes("--list") ? resolve(argv[argv.indexOf("--list") + 1]) : null;
const ONLY = argv.includes("--only") ? new RegExp(argv[argv.indexOf("--only") + 1], "i") : null;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/study-check.mjs http://localhost:<port> <outDir> [--list <frequency.nl.json>] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const catalogue = await (await fetch(`${BASE}/library/catalogue.json`)).json().catch(() => ({}));
if (!(catalogue.packs?.nl ?? []).some((pack) => pack.id === "path-nl")) {
  console.error("study-check: the local library doesn't list path-nl; seed it first.");
  process.exit(2);
}
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true };
// A device's word list: --list's, served where the server has none.
const withList = async (ctx) => {
  if (!LIST || catalogue.lists?.frequency?.nl) return;
  await ctx.route("**/library/catalogue.json", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.lists = { ...(body.lists ?? {}), frequency: { ...(body.lists?.frequency ?? {}), nl: { url: "/__freq.nl.json" } } };
    await route.fulfill({ response, json: body });
  });
  await ctx.route("**/__freq.nl.json", (route) => route.fulfill({ contentType: "application/json", body: readFileSync(LIST) }));
};
const context = await browser.newContext(PHONE);
await withList(context);
// The page the helpers below work on: the check's device, or for a stage, another (no voice).
let page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
const results = {};
const assert = (cond, what) => {
  if (!cond) throw new Error(what);
};
async function stage(name, fn) {
  if (ONLY && Object.keys(results).length && !ONLY.test(name)) return;
  try {
    const note = await fn();
    results[name] = { ok: true, note };
    console.log(`PASS ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    results[name] = { ok: false, note: String(error.stack ?? error) };
    console.log(`FAIL ${name}: ${error.message}`);
    await page.screenshot({ path: `${OUT}/fail-${Object.keys(results).length}.png` }).catch(() => {});
    if (await page.locator('[data-part="session"]').count()) await page.locator('[data-part="session"] [aria-label="End session"]').click().catch(() => {});
  }
}
const SESSION = '[data-part="session"]';
// The session on whichever page is the check's now.
const session = new Proxy({}, { get: (_, key) => { const locator = page.locator(SESSION); const value = locator[key]; return typeof value === "function" ? value.bind(locator) : value; } });
const PAGE = '[data-part="page"]';
const settle = (ms = 300) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const clean = (text) => text.replace(/\s+/g, " ").trim();

async function signUp(ctx, p, name) {
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await p.goto(`${BASE}/app/`);
  await p.waitForURL(/\/login\?next=/);
  await p.click("summary");
  await p.fill('input[name="name"]', name);
  await p.click('#register button[type="submit"]');
  await p.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
  await p.waitForSelector("html[data-app-ready]");
}
await signUp(context, page, "Study Check");
const device = await page.evaluate(async () => {
  const packs = await import("/js/study/packs.js");
  await packs.syncLibraryPacks();
  const freq = await import("/js/study/frequency.js");
  await freq.loadFrequency("nl");
  await (await import("/js/study/pictures.js")).pictureList();
  const content = await import("/js/study/content.js");
  return { packs: packs.libraryPacks().filter((p) => p.language === "nl").map((p) => p.id), lessons: content.LESSONS?.length ?? 0 };
});
console.log("device:", JSON.stringify(device));
const rowsNow = () => page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().map((row) => ({ concept: row.concept, outcome: row.outcome, activity: row.activity, item: row.item, said: row.said })));
const goStudy = async () => {
  await page.evaluate(() => (location.hash = "#today"));
  await page.waitForSelector('[data-part="next-step"]');
  await page.evaluate(() => (location.hash = "#study"));
  await page.waitForSelector(`${PAGE} [data-part="study-door"]`);
  await settle(300);
};
const cardText = async () => clean(await page.locator(`${PAGE} [data-part="study-door"]`).first().innerText());
const lessonDoor = () => page.locator(`${PAGE} [data-part="study-door"][data-door="lesson"]`);
const stepNow = () =>
  page.evaluate((S) => {
    const step = document.querySelector(S)?.lxStep;
    if (!step) return null;
    return { kind: step.kind, text: step.text, means: step.means, options: step.options?.map((o) => (typeof o === "string" ? o : o.label ?? o.text)), pictured: step.options?.filter((o) => o?.picture).length ?? 0, correct: step.correct, answer: step.answer, tiles: step.tiles, isNew: Boolean(step.isNew), again: Boolean(step.again), mode: step.mode, unit: step.unit, nl: step.item?.words.map(([t]) => t), id: step.item?.id, natural: step.item?.means, gapIndex: step.item?.gap?.index, punct: step.item?.punct };
  }, SESSION);
const summary = () => page.locator(`${SESSION} [data-part="session-summary"]`);
// The strip opened as a person does, by its words: its middle can be Tinta standing on your place, and a tap on him is a poke, his alone (7 Nov).
const stripTap = () => page.locator(`${PAGE} [data-part="path-strip"] .lx-path-strip-title`).click();
// A stop on the path, where Tinta stands on your place: tapped on its own words or face, never on him (fixtures/words-point.mjs).
async function tapWords(locator) {
  await locator.scrollIntoViewIfNeeded();
  const at = await locator.evaluate(wordsPoint);
  await page.mouse.click(at.x, at.y);
}
/** Answers the step on screen, right unless told, and presses on (scripts/fixtures/play-session.mjs: by its kind, never its words; a speaking
 * step by Can't speak now, as a learner with no microphone would). Returns what it was, as stepNow reads it. */
async function answerStep({ wrong = false } = {}) {
  await nextStep(page, { session: SESSION });
  const step = await stepNow();
  await playStep(page, { session: SESSION, wrong, speaking: "cant-speak" });
  return step;
}
async function playToEnd({ wrongAt = null, seen = [], options = null } = {}) {
  for (let i = 0; i < 45; i++) {
    if (await summary().count()) break;
    await settle(110);
    const before = await stepNow();
    if (options && before) options(before, await session.locator('[data-part="choice"]').allInnerTexts().catch(() => []));
    seen.push(await answerStep({ wrong: wrongAt === i }));
  }
  await settle(300);
  return seen;
}
const startFromCard = async () => {
  await page.locator(`${PAGE} [data-part="study-door"]`).first().click();
  await page.waitForSelector(SESSION);
  await settle(300);
};
const leaveSummary = async () => {
  await session.getByRole("button", { name: "Done", exact: true }).click();
  await pastReminderAsk(page);
  await page.waitForFunction(() => !document.querySelector('[data-part="session"]'));
};

let lessons = [];
// Leaving a session, wherever it's got to, for the next stage.
const leave = async () => {
  await page.locator(`${SESSION} [aria-label="End session"]`).click();
  await page.waitForFunction(() => !document.querySelector('[data-part="session"]'), null, { timeout: 5000 }).catch(() => {});
  await settle(200);
};
// Through to the end of a session, answering, noting each question's kind.
async function kindsToTheEnd() {
  const kinds = [];
  for (let guard = 0; guard < 60; guard++) {
    if (await summary().isVisible().catch(() => false)) return kinds;
    const kind = await page.locator(SESSION).getAttribute("data-step");
    kinds.push(kind);
    await answerStep();
    await settle(150);
  }
  throw new Error(`it never ended: ${kinds}`);
}
const quietButton = (name) => page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="fade"]`, { hasText: name });

await stage("the path pack is on the device, with its lessons", async () => {
  lessons = await page.evaluate(async () => (await import("/js/study/path.js")).pathLessons().slice(0, 25).map((lesson) => ({ id: lesson.id, title: lesson.title, items: lesson.items, things: lesson.things.map((thing) => ({ unit: thing.unit, lemma: thing.lemma })), worked: Boolean(lesson.worked) })));
  assert(lessons.filter((lesson) => !lesson.worked).length >= 20, "too few written lessons");
  return `${device.packs.length} Dutch packs`;
});

await stage("a start has the word list before its first draw, so Home plans once: the frequency list came before the app was ready; and what the plan worked out is kept, and read back on the next start", async () => {
  // What the first start worked out is written a moment after (study/plan-kept.js).
  await page.evaluate(async () => {
    for (let waited = 0; waited < 10_000 && !(await indexedDB.databases()).some((db) => db.name === "lexicommons-plan"); waited += 250) await new Promise((r) => setTimeout(r, 250));
  });
  await settle(2600);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const marks = await page.evaluate(() => ({ list: performance.getEntriesByName("lx-frequency-nl")[0]?.startTime ?? null, ready: performance.getEntriesByName("lx-app-ready")[0]?.startTime ?? null }));
  assert(marks.list !== null && marks.ready !== null && marks.list < marks.ready, `the list at ${marks.list} ms, the app ready at ${marks.ready} ms`);
  await settle(500);
  const stats = await page.evaluate(async () => (await import("/js/study/plan-kept.js")).planKeptStats());
  assert(stats.read >= 2, `the start read back ${stats.read} kept parts (missed ${stats.missed})`);
  return `the list at ${Math.round(marks.list)} ms, ready at ${Math.round(marks.ready)} ms; ${stats.read} parts read back`;
});

await stage("a brand-new learner: Today and Study say the same one thing, the first lesson, with no grammar and no count of lessons", async () => {
  await page.evaluate(() => (location.hash = "#today"));
  await page.waitForSelector('[data-part="next-step"]');
  await settle(400);
  await shot("00-today-first");
  const today = clean(await page.locator('[data-part="next-step"]').first().innerText());
  assert(today.includes(lessons[0].title), `Today's card: ${today}`);
  await page.locator('[data-part="tab-bar"] [data-part="tab"]', { hasText: "Study" }).first().click();
  await page.waitForSelector(`${PAGE} [data-part="study-door"]`);
  await settle(500);
  await shot("01-study-first");
  const text = await cardText();
  assert(text.includes(lessons[0].title) && text.includes("Your first lesson"), `the door: ${text}`);
  assert((await page.locator(`${PAGE} [data-part="study-door"]`).count()) === 1, "with nothing taught, the first lesson is the only door");
  const strip = clean(await page.locator(`${PAGE} [data-part="path-strip"]`).innerText());
  assert(strip.includes("Where you are") && strip.includes("Lesson 1"), `where you are: ${strip}`);
  const rows = (await page.locator(`${PAGE} .lx-study-rows [data-part="list-row"]`).allInnerTexts()).map(clean);
  assert(rows.includes("Choose the games") && !rows.includes("More ways to study") && !rows.some((row) => /Learn something new/.test(row)), `the rows: ${JSON.stringify(rows)}`);
  const words = await page.locator(PAGE).innerText();
  assert(!/\bof [\d,]+\b|lessons? left|\bnull\b|\bundefined\b/i.test(words), `the page says: ${words}`);
  assert((await overflow()) <= 0, "the page scrolls sideways");
  return `${text} | ${rows.join(" | ")}`;
});

await stage("Start asks at once: no screen to read first, the new word shown with its article and said, its choices the lesson's, nothing recorded yet", async () => {
  await startFromCard();
  await shot("02-first-question");
  assert(!(await page.locator(`${SESSION} [data-part="meet-card"]`).count()), "a teaching screen first");
  const step = await stepNow();
  assert(step.kind === "see" && step.isNew, `the first step: ${step.kind}`);
  assert(/^(de|het) /.test(step.text), `no article: ${step.text}`);
  assert(await page.locator(`${SESSION} [data-part="step-tag"]`, { hasText: "New word" }).count(), "no New word tag");
  // Its tag takes no room: the title, the card and the answers stand exactly where they do without it, and it covers nothing.
  const room = await page.evaluate((S) => {
    const s = document.querySelector(S);
    const tag = s.querySelector('[data-part="step-tag"]');
    const top = (q) => Math.round((s.querySelector(q)?.getBoundingClientRect().top ?? NaN) * 2) / 2;
    const at = () => ({ title: top('[data-part="activity-prompt"] > span'), card: top('[data-part="see-word"]'), reach: top(".lx-reach") });
    const t = tag.getBoundingClientRect();
    const hit = [...s.querySelectorAll('[data-part="activity-prompt"] > span, [data-part="activity-prompt"] > [data-part="character"], [data-part="see-word"] button, [data-part="session-bar"]')]
      .filter((n) => !n.contains(tag))
      .filter((n) => { const b = n.getBoundingClientRect(); return b.left < t.right && b.right > t.left && b.top < t.bottom && b.bottom > t.top; })
      .map((n) => n.getAttribute("data-part") ?? n.tagName);
    const withTag = at();
    const holder = tag.parentNode, next = tag.nextSibling;
    tag.remove();
    const without = at();
    holder.insertBefore(tag, next);
    return { withTag, without, hit, on: tag.dataset.on ?? "row", shown: t.top >= 0 && t.height > 0 };
  }, SESSION);
  assert(room.shown && JSON.stringify(room.withTag) === JSON.stringify(room.without), `the New word tag moves the question: ${JSON.stringify(room)}`);
  assert(!room.hit.length, `the New word tag covers ${room.hit.join(", ")}`);
  assert(await page.locator(`${SESSION} [data-part="see-word"]`, { hasText: step.text }).count(), "the word isn't shown");
  assert((await page.locator(`${SESSION} [data-part="picture-choice"]`).count()) === step.options.length && step.options.length >= 3, "the choices");
  const own = await page.evaluate(async (first) => (await import("/js/study/path.js")).pathLessons()[0].things.map((thing) => thing.means), step);
  for (const option of step.options) assert(own.some((means) => means === option || means.includes(option)), `"${option}" isn't this lesson's`);
  assert(!(await rowsNow()).length, "recorded before an answer");
  return `${step.text}: ${step.options.join(", ")}${step.pictured ? `, ${step.pictured} pictures` : ""}`;
});

await stage("a drawing is a real drawing on its tile, its words beside it, clipped to its card, in place", async () => {
  const pictures = await page.locator(`${SESSION} [data-part="picture-choice"]`).evaluateAll((nodes) => nodes.map((node) => ({ shapes: node.querySelectorAll('[data-part="picture"] svg *').length, images: node.querySelectorAll("img").length, label: node.querySelector('[data-part="picture-choice-label"]').textContent, named: node.querySelector('[data-part="picture"]').getAttribute("aria-label") })));
  assert(pictures.length >= 3, `${pictures.length} pictures`);
  assert(pictures.every((one) => one.shapes > 0 && !one.images && one.label && !one.named), JSON.stringify(pictures));
  const clipped = await page.locator(`${SESSION} [data-part="picture-choice"]`).first().evaluate((node) => getComputedStyle(node).overflow);
  assert(clipped === "hidden", `overflow ${clipped}`);
  return pictures.map((one) => one.label).join(", ");
});

let missed = null;
let firstLesson = [];
await stage("a whole lesson: 15 questions, a sentence by the fifth, one word back and forth with others, a miss coming back at the end without the count growing", async () => {
  const seen = [];
  let counts = [];
  for (let i = 0; i < 30; i++) {
    if (await summary().count()) break;
    await settle(110);
    const count = await page.locator(`${SESSION} [data-part="session-bar"]`).innerText().catch(() => "");
    counts.push(count.match(/\d+\/\d+/)?.[0]);
    const before = await stepNow();
    const wrong = before.kind === "translate" && !missed && seen.length >= 3 && !before.isNew;
    if (wrong) missed = before;
    if (seen.length === 3) await shot("03-sentence");
    seen.push(await answerStep({ wrong }));
  }
  firstLesson = seen;
  const kinds = seen.map((step) => step.kind);
  assert(missed, "nothing missed");
  const firstSentence = seen.findIndex((step) => step.nl);
  assert(firstSentence >= 0 && firstSentence < 5, `the first sentence at ${firstSentence + 1}`);
  const again = seen.findLast((step) => step.again);
  assert(again && again.id === missed.id, `the miss didn't come back: ${kinds}`);
  assert(seen.findIndex((step) => step.again) >= 14, `it came back too soon: ${kinds}`);
  assert(new Set(counts.map((count) => count?.split("/")[1])).size === 1, `the count grew: ${counts}`);
  const said = (await rowsNow()).filter((row) => row.outcome === "wrong" && row.said);
  assert(said.length >= 1, "what they put wasn't kept");
  await settle(500);
  await shot("04-lesson-done");
  return kinds.join(" ");
});

await stage("the end of a lesson: Lesson done, what it taught in short names, and no grammar or pressure", async () => {
  assert(await summary().count(), "no summary");
  const text = clean(await summary().innerText());
  assert(/Lesson done/.test(text) && /What you learned/.test(text), `the summary: ${text}`);
  const names = (await page.locator(`${SESSION} .lx-moved-row > div:first-child`).allInnerTexts()).map(clean);
  assert(names.length >= 5, `${names.length} rows`);
  assert(!names.some((name) => name.includes(";") || name.length > 32), `a dictionary entry: ${JSON.stringify(names)}`);
  assert(!names.some((name) => /Present|Verb|second/.test(name)), `grammar in it: ${JSON.stringify(names)}`);
  for (const pressure of ["lose", "streak will", "come back", "don't forget", "tomorrow"]) assert(!text.toLowerCase().includes(pressure), `pressure: "${pressure}" in ${text}`);
  await leaveSummary();
  return names.join(" | ");
});

await stage("after it: Practice is the card on Study and on Home, from the first frame, Learn something new is a row, and Home counts what the lesson taught", async () => {
  await settle(300);
  // From the first frame: Home's card as painted, read just after each of the first ten frames that show it (a frame's rAF, then a message,
  // which runs after that frame's paint). A Home kept from before the lesson showing its old card for even one frame fails (a read after
  // waitForSelector came a few frames late and passed it).
  const painted = await page.evaluate(async () => {
    const afterPaint = () => new Promise((done) => requestAnimationFrame(() => { const channel = new MessageChannel(); channel.port1.onmessage = () => done(); channel.port2.postMessage(0); }));
    const shown = () => [...document.querySelectorAll('[data-part="page"]:not([data-ghost]):not([hidden]) [data-part="next-step"]')].filter((n) => n.getClientRects().length && !n.closest("[data-waiting]")).map((n) => n.innerText.replace(/\s+/g, " ").trim());
    location.hash = "#today";
    const frames = [];
    const start = performance.now();
    while (frames.length < 10 && performance.now() - start < 1500) {
      await afterPaint();
      const cards = shown();
      if (cards.length) frames.push({ ms: Math.round(performance.now() - start), card: cards[0] });
    }
    return frames;
  });
  assert(painted.length > 0, "Home's card never painted");
  // Asserted at the stage's end, so the rest of it (and the stages after, which start where it leaves off) still run.
  const notPractice = painted.filter((frame) => !/Practice/.test(frame.card));
  const firstFrames = `Home's card from the first frame: ${painted.map((frame) => `${frame.ms} ms ${frame.card.slice(0, 30)}`).join(" → ")}`;
  const first = clean(await page.locator('[data-part="next-step"]').first().innerText());
  await shot("05-today-after-lesson");
  assert(/Practice/.test(first), `Home's card: ${first}`);
  assert(/Learn something new/.test(first), `no way on to a lesson: ${first}`);
  await settle(300);
  const tile = clean(await page.locator('[data-part="stat-tile"]').first().innerText());
  // The words you know well (summary.js understood): after a first lesson that may be none yet, and then the tile counts the words started
  // (know/today.js), as the Knowledge page's pile does: every word started, as outlines until they're known well.
  const sums = await page.evaluate(async () => {
    const { pileUnits } = await import("/js/know/cards.js");
    const { learning } = await import("/js/study/learning.js");
    const rows = pileUnits(learning(), Date.now());
    return { known: rows.filter((row) => row.known).length, started: rows.length };
  });
  const n = Number(tile.match(/\d+/)?.[0]);
  if (sums.known) assert(/words you know well/.test(tile) && n === sums.known && n <= lessons[0].things.length, `the tile: ${tile}, the sums say ${sums.known} known well`);
  else assert(/words? started/.test(tile) && n === sums.started, `the tile: ${tile}, the sums say none known well yet and ${sums.started} started`);
  assert(sums.started >= 5, `the pile would have ${sums.started} words after a first lesson`);
  await goStudy();
  await shot("06-study-after-lesson");
  const text = await cardText();
  assert(/^Practice/.test(text) && /About \d+ min/.test(text), `the door: ${text}`);
  const door = clean(await lessonDoor().innerText());
  assert(door.startsWith("A new lesson") && door.includes(lessons[1].title), `the lesson's door: ${door}`);
  assert(!notPractice.length, firstFrames);
  return `${first} | ${tile} | ${door}`;
});

await stage("the first practice: only what the lesson taught, no sentence twice, and its choices only from there", async () => {
  const taught = new Set(lessons[0].things.map((thing) => thing.lemma));
  await startFromCard();
  const options = [];
  const seen = await playToEnd({ options: (step, shown) => step.kind === "listen" && shown.length && options.push(shown.map((text) => text.trim())) });
  const naturals = await page.evaluate(async (ids) => {
    const { itemById } = await import("/js/study/content.js");
    return ids.map((id) => itemById.get(id)?.means);
  }, lessons[0].items);
  for (const list of options) for (const text of list) assert(naturals.includes(text), `What did you hear? offers "${text}"`);
  const ids = seen.filter((step) => step.id && !step.again).map((step) => step.id);
  assert(new Set(ids).size === ids.length, `a sentence twice: ${ids}`);
  for (const id of ids) {
    const words = await page.evaluate(async (id) => {
      const { itemById } = await import("/js/study/content.js");
      const { lemmasOf } = await import("/js/study/new-words.js");
      return lemmasOf(itemById.get(id));
    }, id);
    for (const word of words) assert(taught.has(word), `"${word}" hasn't been taught`);
  }
  const kinds = new Set(seen.map((step) => step.kind));
  assert(seen.length >= 5 && kinds.size >= 4, `${seen.length} steps: ${[...kinds]}`);
  await settle(300);
  await shot("07-practice-done");
  const text = clean(await summary().innerText());
  assert(/Practice done/.test(text), text);
  assert(!/Ready for something new/.test(text), "suggested after one practice");
  await leaveSummary();
  return seen.map((step) => step.kind).join(" ");
});

await stage("every third practice suggests the next lesson, and only then: it opens the lesson, and leaving it blocks nothing", async () => {
  for (let i = 0; i < 2; i++) {
    await goStudy();
    await startFromCard();
    await playToEnd();
    const text = clean(await summary().innerText());
    if (i === 0) {
      assert(!/Ready for something new/.test(text), "suggested after two");
      await leaveSummary();
    }
  }
  await shot("08-suggestion");
  const row = page.locator(`${SESSION} [data-part="list-row"]`, { hasText: "Ready for something new?" });
  assert(await row.count(), "no suggestion after three");
  assert((await row.innerText()).includes(lessons[1].title), await row.innerText());
  await row.click();
  // The lesson's own session (data-lesson), read by itself: while it comes in, a picture of the practice's page (data-ghost, its last step
  // with it) is the page's first session, and was read as the lesson's first step (7 Nov: "see", not new).
  const LESSON = '[data-part="session"][data-lesson]:not([data-ghost])';
  await page.waitForFunction((L) => document.querySelector(L)?.lxStep?.kind, LESSON);
  const live = await page.evaluate(() => [...document.querySelectorAll('[data-part="session"]:not([data-ghost])')].map((s) => `${s.dataset.lesson ? "the lesson" : "another"}: ${s.lxStep?.kind ?? "none"}`));
  await settle(300);
  await shot("09-lesson-2");
  const step = await page.evaluate((L) => {
    const s = document.querySelector(L)?.lxStep;
    return s ? { kind: s.kind, text: s.text, isNew: Boolean(s.isNew) } : null;
  }, LESSON);
  // What the page's first session is at this moment (the read before 7 Nov took it): said when it isn't the lesson's.
  const first = await page.evaluate((L) => {
    const one = document.querySelector('[data-part="session"]');
    return one === document.querySelector(L) ? null : { ghost: one?.hasAttribute("data-ghost") ?? null, lesson: one?.dataset.lesson ?? null, kind: one?.lxStep?.kind ?? null, isNew: Boolean(one?.lxStep?.isNew), sessions: document.querySelectorAll('[data-part="session"]').length };
  }, LESSON);
  if (first) console.log(`  (the page's first session then wasn't the lesson's: ${JSON.stringify(first)})`);
  assert(step?.isNew, `${step?.kind} ${step?.text ?? ""} isn't new (sessions on the page as it opened: ${live.join("; ")})`);
  if (live.length > 1) console.log(`  (as the lesson opened, ${live.length} sessions were on the page: ${live.join("; ")})`);
  // The lesson's own End session: the picture of the practice's page has one too while it's on the page.
  await page.locator(`${LESSON} [aria-label="End session"]`).click();
  await page.waitForFunction(() => !document.querySelector('[data-part="session"]'));
  return `${step.kind} ${step.text ?? ""}`;
});

await stage("leaving a lesson loses nothing: what it asked is kept, and Start picks up with what's left of it", async () => {
  await goStudy();
  const before = (await rowsNow()).length;
  const row = lessonDoor();
  assert(await row.count(), "no way on to the lesson");
  const text = clean(await row.innerText());
  assert(text.includes(lessons[1].title), `the lesson changed: ${text}`);
  await row.click();
  await page.waitForFunction((S) => document.querySelector(S)?.lxStep?.kind, SESSION);
  await settle(200);
  const first = await stepNow();
  await answerStep();
  await settle(200);
  assert((await rowsNow()).length > before, "nothing recorded");
  await page.locator(`${SESSION} [aria-label="End session"]`).click();
  await page.waitForFunction(() => !document.querySelector('[data-part="session"]'));
  const again = await page.evaluate(async () => (await import("/js/study/plan.js")).planSession("lesson").steps[0]);
  assert(again.text !== first.text || !again.isNew, `"${first.text}" is new again`);
  return `${first.text} kept; next ${again.text ?? again.kind}`;
});

await stage("Where you are lays out the path by unit, a full lesson ending each, with no total; a lesson opens a bubble in the page, and its words show with their articles and plain meanings", async () => {
  await goStudy();
  await stripTap();
  await page.waitForFunction(() => location.hash === "#study/path");
  await page.waitForSelector(`${PAGE} .lx-pu-title`);
  await settle(500);
  await shot("10-path");
  assert(!/\bof [\d,]+\b/.test(await page.locator(PAGE).innerText()), "a total on the path");
  assert(!(await page.locator(`${PAGE} .lx-path-note`).count()), "a starter's line on Dutch's own path");
  assert((await overflow()) <= 0, "wider than the phone");
  const units = (await page.locator(`${PAGE} .lx-pu-title`).evaluateAll((names) => names.map((name) => name.getAttribute("aria-label")))).map(clean);
  assert(units[0].toLowerCase() === "coffee and keys" && units.length >= 12, units.join(", "));
  const firstUnit = page.locator(`${PAGE} .lx-pu`).first();
  const stops = await firstUnit.locator(".lx-ps").count();
  const whole = await firstUnit.locator(".lx-full").getAttribute("aria-label");
  // Its lessons, of words and of one idea, then the whole of it.
  const inFirst = await page.evaluate(async () => {
    const lessons = (await import("/js/study/path.js")).pathLessons();
    return lessons.filter((lesson) => lesson.unit?.id === lessons[0].unit.id && !lesson.full).length;
  });
  assert(stops === inFirst && /Whole unit: Coffee and keys/.test(whole), `${stops} stops (${inFirst} lessons), then ${whole}`);
  const target = lessons[3];
  await page.evaluate((id) => (location.hash = `#study/path/${encodeURIComponent(id)}`), target.id);
  const bubble = page.locator(".lx-path .lx-path-bubble");
  await bubble.waitFor();
  assert(clean(await bubble.innerText()).includes(target.title), `the bubble isn't the lesson's: ${clean(await bubble.innerText())}`);
  assert(await bubble.getByRole("button", { name: "Start" }).isVisible(), "no Start in the lesson's bubble");
  await settle(300);
  await shot("11-lesson-bubble");
  await bubble.getByRole("button", { name: "Its words" }).click();
  const sheet = page.locator(".lx-lesson-words-sheet");
  await sheet.waitFor();
  await settle(300);
  await shot("11-lesson-words");
  const words = await sheet.innerText();
  assert(/\b(de|het) \w+/.test(words), `no article in the lesson's words: ${words.slice(0, 200)}`);
  assert(!/ = /.test(words), `working notes in the lesson's words: ${words.slice(0, 200)}`);
  await page.keyboard.press("Escape");
  await settle(300);
  return `${units.length} units`;
});

await stage("A lesson's bubble stays up through a scroll the app makes (a page put back where it was, a button brought into view) and goes on your own: a wheel, a finger's drag", async () => {
  const target = lessons[5];
  const bubble = page.locator(".lx-path .lx-path-bubble");
  const up = () => page.evaluate(() => Boolean(document.querySelector(".lx-path .lx-path-bubble")));
  const open = async () => {
    await goStudy();
    await page.evaluate((id) => (location.hash = `#study/path/${encodeURIComponent(id)}`), target.id);
    await bubble.waitFor();
    await settle(1000); // its own scroll onto the screen is over
  };
  await open();
  await page.evaluate(() => (document.querySelector('[data-part="page"]:not([data-ghost])').scrollTop -= 200));
  await settle(400);
  assert(await up(), "a scroll the app made closed it");
  await bubble.getByRole("button", { name: "Start" }).waitFor({ state: "visible", timeout: 3000 });
  await page.mouse.move(195, 500);
  await page.mouse.wheel(0, 160);
  await settle(600);
  assert(!(await up()), "a wheel's scroll left it up");
  await open();
  const touch = await context.newCDPSession(page);
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 640 }] });
  for (let y = 630; y >= 420; y -= 15) {
    await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y }] });
    await settle(16);
  }
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await settle(800);
  const moved = await page.evaluate(() => Math.round(document.querySelector('[data-part="page"]:not([data-ghost])').scrollTop));
  assert(!(await up()), `a finger's drag left it up (the page at ${moved})`);
  return "up through the app's scroll; gone on a wheel and on a finger's drag";
});

await stage("Choose the games changes how, not what: with only Choose on, a lesson and a practice still run, nothing blank; the last one can't go", async () => {
  await goStudy();
  await page.locator(`${PAGE} .lx-study-rows [data-part="list-row"]`, { hasText: "Choose the games" }).click();
  await page.waitForSelector('.lx-sheet-layer [data-part="game-toggle"]');
  await settle(300);
  await shot("12-choose-games");
  // Each game a small copy of its button on Study, pressed to turn it on or off (aria-pressed).
  const switches = page.locator('.lx-sheet-layer [data-part="game-toggle"]');
  const names = (await page.locator('.lx-sheet-layer [data-part="game-toggle"] .lx-toggle-name').allInnerTexts()).map((name) => name.trim());
  for (const need of ["Tap the picture", "Pick the word"]) assert(names.some((name) => name.startsWith(need)), `no ${need}: ${names}`);
  const chooseAt = names.findIndex((name) => /^Choose\b/.test(name));
  for (let i = 0; i < names.length; i++) if (i !== chooseAt) await switches.nth(i).click();
  await settle(150);
  await switches.nth(chooseAt).click();
  await settle(150);
  assert((await switches.nth(chooseAt).getAttribute("aria-pressed")) === "true", "the last game went off");
  const plans = await page.evaluate(async () => {
    const { planSession } = await import("/js/study/plan.js");
    const kinds = (plan) => [...new Set(plan.steps.map((step) => step.kind))];
    return { lesson: kinds(planSession("lesson")), practice: kinds(planSession("practice")) };
  });
  assert(plans.practice.every((kind) => kind === "choose"), `practice: ${plans.practice}`);
  await page.evaluate(async () => {
    const { WAYS, setStudySetting } = await import("/js/study/settings.js");
    for (const way of Object.keys(WAYS)) setStudySetting(`quick.include.${way}`, true);
  });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  return JSON.stringify(plans);
});

await stage("Study has every game with Tap the picture, Study cards among them; no More ways, and its old address is Study", async () => {
  await page.evaluate(() => (location.hash = "#study"));
  await page.waitForSelector(`${PAGE} [data-part="way-tile"]`);
  const games = (await page.locator(`${PAGE} [data-part="way-tile"]`).allInnerTexts()).map((text) => text.trim());
  for (const need of ["Tap the picture", "Pick the word", "Match", "Fill the gap", "Study cards"]) assert(games.includes(need), `no ${need} on Study: ${games}`);
  const text = await page.locator(PAGE).innerText();
  assert(text.includes("Your packs") && !text.includes("More ways"), "Your packs, and no More ways");
  await page.evaluate(() => (location.hash = "#study/more"));
  await page.waitForFunction(() => location.hash === "#study/more");
  await settle(400);
  await page.waitForSelector(`${PAGE} [data-part="way-tile"]`);
  await shot("13-old-more-ways");
  assert((await page.locator(`${PAGE} [data-part="way-tile"]`).count()) === games.length, "the old address isn't Study");
  assert(!/\bAI\b/.test(text), "an AI line on it");
  assert((await overflow()) <= 0, "it scrolls sideways");
  await page.evaluate(() => (location.hash = "#study"));
});

// Study a topic (shell/study.js openTopics): a row under the games opening a sheet. With no topic pack added, Tinta says so above the way to
// Explore's topics; with one (Food and drink, nl-food-1, added as Explore's Add pack adds it), its row says how far its lessons are,
// and a press starts it by itself (#study/session/pack/<id>, plan.js "pack"), the sheet gone. The second part needs the library to offer
// nl-food-1 as packs/ has it (seed-local.mjs packs/nl-food-1.json --opt-in); without it, it says so and checks the first part alone.
await stage("Study a topic: a sheet of your topic packs, each started by itself; with none, the way to Explore's", async () => {
  await page.evaluate(() => (location.hash = "#study"));
  const row = page.locator(`${PAGE} .lx-study-topics [data-part="list-row"]`);
  await row.waitFor({ timeout: 15_000 });
  assert((await row.getAttribute("aria-haspopup")) === "dialog" && !(await row.locator(".lx-icon").count()), "Study a topic should open a sheet, with no page arrow");
  const sheet = page.locator(".lx-sheet-layer:not([hidden])");
  const open = async () => {
    await row.click();
    await sheet.waitFor({ timeout: 5_000 });
    await settle(500);
  };
  const topicRows = () => sheet.locator('a[href^="#study/session/pack/"]');
  const before = await page.evaluate(async () => (await import("/js/study/content.js")).WORD_PACKS.filter((pack) => !pack.builtIn).map((pack) => pack.id));
  await open();
  const empty = await sheet.locator('[data-part="empty-state"]').count();
  const explore = await sheet.locator('a[href^="#explore"]').count();
  assert(explore === 1, "the sheet has no way to Explore's topics");
  assert(before.length || (empty === 1 && (await topicRows().count()) === 0), `with no topic pack: ${empty} empty states, ${await topicRows().count()} topics`);
  await shot("14-topics-none");
  await page.keyboard.press("Escape");
  await settle(500);
  // A topic pack the library offers, added as Explore adds one.
  const ref = await page.evaluate(async () => {
    const catalogue = await (await fetch("/library/catalogue.json", { cache: "no-store" })).json();
    // Food and drink as packs/nl-food-1.json has it (its sentences copies of the word packs', so the path teaches it as lessons).
    const offered = (catalogue.packs?.nl ?? []).find((pack) => pack.optIn && pack.id === "nl-food-1");
    if (!offered) return null;
    await fetch(`/api/community/items/${encodeURIComponent(offered.id)}/follow`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
    const result = await (await import("/js/study/packs.js")).followPack({ id: offered.id, version: offered.version, url: offered.url });
    return result.ok ? { id: offered.id, name: offered.name } : null;
  });
  if (!ref) return `none added: ${empty} empty state and the way to Explore; this library doesn't offer nl-food-1, so the rest wasn't checked`;
  for (let i = 0; i < 40 && !(await page.evaluate(async (id) => (await import("/js/study/content.js")).WORD_PACKS.some((pack) => pack.id === id), ref.id)); i++) await settle(250);
  await open();
  const listed = topicRows().filter({ hasText: ref.name });
  assert((await listed.count()) === 1, `${ref.name} isn't in the sheet`);
  const sub = clean(await listed.locator(".lx-row-sub").innerText());
  assert(/^0 of \d+ lessons$/.test(sub), `its line says "${sub}", not how far its lessons are`);
  assert((await sheet.locator('[data-part="empty-state"]').count()) === 0, "Tinta's empty state with a topic listed");
  await shot("15-topics-one");
  await listed.click();
  await page.waitForFunction((id) => location.hash === `#study/session/pack/${id}`, ref.id, { timeout: 10_000 });
  await session.waitFor({ timeout: 15_000 });
  await settle(800);
  assert(!(await page.locator(".lx-sheet-layer:not([hidden])").count()), "the sheet is still up over the session");
  assert(!(await session.locator('[data-part="empty-state"]').count()), "the topic's session opened on nothing");
  await shot("16-topic-session");
  await session.locator('[aria-label="End session"]').click().catch(() => {});
  await settle(600);
  // The path as the stages after this expect it: the topic pack unfollowed and off this device. Its lessons go right after the unit you're
  // in, so left on they moved every later stage's lessons (7 Nov, on an `npm run local` library, which offers it: the jump's 21st lesson
  // was the topic's, and the end of the written lessons wasn't the end).
  await page.evaluate(async (id) => {
    await fetch(`/api/community/items/${encodeURIComponent(id)}/follow`, { method: "DELETE", credentials: "same-origin" });
    await (await import("/js/study/packs.js")).unfollowPack(id);
  }, ref.id);
  for (let i = 0; i < 40 && (await page.evaluate(async (id) => (await import("/js/study/content.js")).WORD_PACKS.some((pack) => pack.id === id), ref.id)); i++) await settle(250);
  assert(!(await page.evaluate(async (id) => (await import("/js/study/content.js")).WORD_PACKS.some((pack) => pack.id === id), ref.id)), `${ref.name} is still on this device after unfollowing it`);
  return `none: the empty state and the way to Explore; ${ref.name}: "${sub}", pressed into its session, then unfollowed`;
});

await stage("with no drawings, the same question in words: no blank, nothing said about it", async () => {
  await page.route("**/pictures/manifest.json", (route) => route.fulfill({ status: 404, body: "" }));
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const step = await page.evaluate(async () => {
    const { clearProgress } = await import("/js/study/progress.js");
    await clearProgress();
    const { planSession } = await import("/js/study/plan.js");
    return planSession("lesson").steps[0];
  });
  assert(step.kind === "see" && step.options.every((option) => !option.picture), JSON.stringify(step).slice(0, 200));
  await page.evaluate(() => (location.hash = "#study/session/lesson"));
  await page.waitForSelector(`${SESSION} [data-part="picture-choice"]`);
  await settle(300);
  await shot("14-no-drawings");
  assert(!(await page.locator(`${SESSION} [data-part="picture-choice-art"]`).count()), "a picture with no drawing");
  const labels = (await page.locator(`${SESSION} [data-part="picture-choice-label"]`).allInnerTexts()).map(clean);
  assert(labels.length >= 2 && labels.every(Boolean), `the labels: ${labels}`);
  await page.locator(`${SESSION} [aria-label="End session"]`).click();
  await page.unroute("**/pictures/manifest.json");
  return labels.join(", ");
});

await stage("a drawing that can't be had (the list is in, the file isn't): that question is in words, whole, and takes a press", async () => {
  await page.route("**/pictures/*.svg*", (route) => route.fulfill({ status: 500, body: "" }));
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const planned = await page.evaluate(async () => {
    await (await import("/js/study/pictures.js")).pictureList();
    await caches.delete("lx-pictures-v1");
    const { clearProgress } = await import("/js/study/progress.js");
    await clearProgress();
    return (await import("/js/study/plan.js")).planSession("lesson").steps[0];
  });
  assert(planned.kind === "see" && planned.options.some((option) => option.picture), `the plan asked for no drawings: ${JSON.stringify(planned).slice(0, 200)}`);
  await page.evaluate(() => (location.hash = "#study/session/lesson"));
  await page.waitForSelector(`${SESSION} [data-part="picture-choice"]`, { timeout: 8000 });
  assert(!(await page.locator(`${SESSION} [data-part="picture"]`).count()), "an empty tile");
  await page.locator(`${SESSION} [data-part="picture-choice"]`).first().click();
  await page.waitForSelector(`${SESSION} [data-part="picture-choice"][data-state]`, { timeout: 2000 });
  await page.locator(`${SESSION} [aria-label="End session"]`).click();
  await page.unroute("**/pictures/*.svg*");
  // That press counted: back to a first lesson for the next stage.
  await page.evaluate(async () => {
    await (await import("/js/study/progress.js")).clearProgress();
    (await import("/js/study/done.js")).clearFinished();
  });
});

await stage("on a light theme and a custom one, with Animations off, a picture question reads, its drawing whole, and takes a press at once", async () => {
  await page.evaluate(async () => {
    const theme = await import("/js/lx/theme.js");
    theme.setPreset("motion", "off");
    await theme.setBase("paper");
  });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(async () => (await import("/js/study/pictures.js")).pictureList());
  await page.evaluate(() => (location.hash = "#study/session/lesson"));
  await page.waitForSelector(`${SESSION} [data-part="picture-choice-art"] svg`);
  await settle(500);
  await shot("15-light-theme");
  // Nothing moves when Animations are off, and a drawing fills its card edge to edge.
  const fills = await page.locator(`${SESSION} [data-part="picture-choice-art"]`).first().evaluate((node) => Math.abs(node.getBoundingClientRect().width - node.parentElement.clientWidth));
  assert(fills <= 1, `a drawing ${fills}px short of its card`);
  const read = () =>
    page.evaluate(() => {
      const label = getComputedStyle(document.querySelector('[data-part="picture-choice-label"]')).color;
      const card = getComputedStyle(document.querySelector('[data-part="picture-choice"]'));
      const page = getComputedStyle(document.body).backgroundColor;
      const luminance = (color) => {
        const [r, g, b] = color.match(/[\d.]+/g).map(Number);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      return { label, labelLum: luminance(label), page, pageLum: luminance(page), radius: card.borderRadius };
    });
  const light = await read();
  assert(light.labelLum < 110, `the words on a light theme: ${JSON.stringify(light)}`);
  await page.evaluate(async () => (await import("/js/lx/theme.js")).setTokens({ "--fill": "#f0e4c0", "--ink-1": "#2a1a05", "--edge": "#a07820" }));
  await settle(300);
  await shot("15b-custom-theme");
  const custom = await read();
  assert(custom.label === "rgb(42, 26, 5)", `a custom look's ink isn't on the words: ${custom.label}`);
  await page.locator(`${SESSION} [data-part="picture-choice"]`).first().click();
  assert(await page.locator(`${SESSION} [data-part="picture-choice"][data-state]`).count(), "a press did nothing");
  await settle(100);
  await shot("15c-answered-custom");
  await page.locator(`${SESSION} [aria-label="End session"]`).click();
  await page.waitForFunction(() => !document.querySelector('[data-part="session"]'));
  await page.evaluate(async () => {
    const theme = await import("/js/lx/theme.js");
    await theme.resetLook();
    theme.setPreset("motion", "system");
  });
  return `light ${light.label} on ${light.page}; custom ${custom.label}`;
});

await stage("Can't listen now, on Listening: at once another game on the same sentence, nothing counted; no game needing sound comes again in this session, and nothing plays by itself", async () => {
  await page.addInitScript(() => {
    window.lxSpoken = 0;
    const real = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = (utterance) => {
      window.lxSpoken++;
      return real(utterance);
    };
  });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  // Something to listen to: a first lesson's sentences, known.
  await page.evaluate(() => (location.hash = "#study/session/lesson"));
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  await kindsToTheEnd();
  await page.locator(`${SESSION} [data-variant="white"]`, { hasText: "Done" }).click();
  await pastReminderAsk(page);
  await settle(300);
  await page.evaluate(() => (location.hash = "#study/session/game/listen"));
  await page.waitForSelector(`${SESSION}[data-step="listen"]`, { timeout: 8000 });
  await settle(500);
  const played = await page.evaluate(() => window.lxSpoken);
  assert(played > 0, "Listening played nothing, so this proves nothing");
  const before = { item: await page.locator(SESSION).getAttribute("data-item"), rows: (await rowsNow()).length };
  await shot("16-cant-listen");
  const started = Date.now();
  await quietButton("Can't listen now").click();
  await page.waitForFunction(() => document.querySelector('[data-part="session"]')?.getAttribute("data-step") !== "listen", null, { timeout: 1000 });
  const took = Date.now() - started;
  await settle(400);
  await shot("17-cant-listen-swapped");
  const after = { item: await page.locator(SESSION).getAttribute("data-item"), step: await page.locator(SESSION).getAttribute("data-step"), rows: (await rowsNow()).length };
  assert(after.item === before.item, `another sentence: ${after.item}, was ${before.item}`);
  assert(after.rows === before.rows, `the swap counted: ${before.rows} rows, then ${after.rows}`);
  assert(!(await quietButton("Can't listen now").count()), "still offered, with nothing left to stop");
  const kinds = await kindsToTheEnd();
  assert(!kinds.some((kind) => kind === "listen" || kind === "repeat"), `a sound game came back: ${kinds}`);
  const later = await page.evaluate(() => window.lxSpoken);
  assert(later === played, `something played by itself after it: ${played} → ${later}`);
  await page.locator(`${SESSION} [data-part="session-summary"]`).waitFor();
  await page.locator(`${SESSION} [data-variant="white"]`, { hasText: "Done" }).click();
  await pastReminderAsk(page);
  await settle(300);
  return `${took} ms, ${before.item} became ${after.step}: then ${kinds}`;
});

await stage("Can't listen now, where the sound only goes with the question (a lesson's first): the question stays as it is, the button goes, and the next doesn't play", async () => {
  await page.evaluate(async () => {
    const { clearProgress } = await import("/js/study/progress.js");
    await clearProgress();
    (await import("/js/study/done.js")).clearFinished();
    window.lxSpoken = 0;
  });
  await page.evaluate(() => (location.hash = "#study/session/lesson"));
  await page.waitForSelector(`${SESSION}[data-step="see"]`, { timeout: 8000 });
  await settle(500);
  const played = await page.evaluate(() => window.lxSpoken);
  assert(played > 0, "the question played nothing, so this proves nothing");
  const choices = await page.locator(`${SESSION} [data-part="picture-choice"]`).count();
  await quietButton("Can't listen now").click();
  await settle(300);
  assert((await page.locator(SESSION).getAttribute("data-step")) === "see" && (await page.locator(`${SESSION} [data-part="picture-choice"]`).count()) === choices, "the question changed");
  assert(!(await quietButton("Can't listen now").count()), "still offered");
  await answerStep();
  await settle(500);
  assert((await page.evaluate(() => window.lxSpoken)) === played, "the next played");
  assert(!(await quietButton("Can't listen now").count()), "offered on the next");
  await leave();
});

await stage("Can't speak now: at once another game on the same sentence, nothing counted; no speaking comes again in this session", async () => {
  // Something to say: a first lesson's sentences, known.
  await page.evaluate(() => (location.hash = "#study/session/lesson"));
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  await kindsToTheEnd();
  await page.locator(`${SESSION} [data-variant="white"]`, { hasText: "Done" }).click();
  await pastReminderAsk(page);
  await settle(300);
  await page.evaluate(() => (location.hash = "#study/session/game/say"));
  await page.waitForSelector(`${SESSION}[data-step="say"]`, { timeout: 8000 });
  await settle(400);
  const before = { item: await page.locator(SESSION).getAttribute("data-item"), rows: (await rowsNow()).length };
  await quietButton("Can't speak now").click();
  await page.waitForFunction(() => document.querySelector('[data-part="session"]')?.getAttribute("data-step") !== "say", null, { timeout: 1000 });
  await settle(300);
  const after = { item: await page.locator(SESSION).getAttribute("data-item"), step: await page.locator(SESSION).getAttribute("data-step"), rows: (await rowsNow()).length };
  assert(after.item === before.item && after.rows === before.rows, JSON.stringify({ before, after }));
  const kinds = await kindsToTheEnd();
  assert(!kinds.some((kind) => kind === "say" || kind === "repeat"), `speaking came back: ${kinds}`);
  await page.locator(`${SESSION} [data-variant="white"]`, { hasText: "Done" }).click();
  await pastReminderAsk(page);
  await settle(300);
  return `${after.step}: then ${kinds}`;
});

await stage("Repeat after holds both, and on a small phone its actions fit on the bar", async () => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => (location.hash = "#study/session/game/repeat"));
  await page.waitForSelector(`${SESSION}[data-step="repeat"]`, { timeout: 8000 });
  await settle(500);
  await shot("18-repeat-small");
  for (const name of ["Can't speak now", "Can't listen now", "I don't know"]) assert(await quietButton(name).isVisible(), `no ${name}`);
  const wide = await page.locator(`${SESSION} .lx-answer-actions`).last().evaluate((node) => {
    const box = node.getBoundingClientRect();
    return [...node.children].some((child) => child.getBoundingClientRect().right > innerWidth || child.getBoundingClientRect().left < 0) ? box.width : 0;
  });
  assert(!wide, "an action off the screen");
  assert((await overflow()) <= 0, "the page is wider than the phone");
  await quietButton("Can't listen now").click();
  await page.waitForFunction(() => document.querySelector('[data-part="session"]')?.getAttribute("data-step") === "say", null, { timeout: 1000 });
  await leave();
  await page.setViewportSize({ width: 390, height: 844 });
});

await stage("Choose the games from inside a session: this question comes first; off, it becomes another on the same words, at once, and doesn't come back", async () => {
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(() => (location.hash = "#study/session/lesson"));
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  await kindsToTheEnd();
  await page.locator(`${SESSION} [data-variant="white"]`, { hasText: "Done" }).click();
  await pastReminderAsk(page);
  await settle(300);
  await page.evaluate(() => (location.hash = "#study/session/practice"));
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  await settle(400);
  // On a question about a sentence, where there's a whole game to swap.
  for (let guard = 0; guard < 20 && !(await page.locator(SESSION).getAttribute("data-item")); guard++) {
    await answerStep();
    await settle(150);
  }
  const before = { item: await page.locator(SESSION).getAttribute("data-item"), step: await page.locator(SESSION).getAttribute("data-step") };
  assert(before.item, "no question about a sentence");
  await page.locator(`${SESSION} [aria-label="Choose the games"]`).click();
  await page.waitForSelector('.lx-sheet-layer [data-part="game-toggle"]');
  await settle(400);
  await shot("19-games-in-session");
  const first = clean(await page.locator('.lx-sheet-layer [data-part="game-toggle"]').first().innerText());
  assert(/This question/.test(first), `the first game: ${first}`);
  await page.locator('.lx-sheet-layer [data-part="game-toggle"]').first().click();
  await page.keyboard.press("Escape");
  await page.waitForFunction((kind) => document.querySelector('[data-part="session"]')?.getAttribute("data-step") !== kind, before.step, { timeout: 1500 });
  await settle(300);
  const after = { item: await page.locator(SESSION).getAttribute("data-item"), step: await page.locator(SESSION).getAttribute("data-step") };
  assert(after.item === before.item, JSON.stringify({ before, after }));
  const kinds = await kindsToTheEnd();
  assert(!kinds.includes(before.step), `${before.step} came back: ${kinds}`);
  await page.locator(`${SESSION} [data-variant="white"]`, { hasText: "Done" }).click();
  await pastReminderAsk(page);
  await settle(300);
  return `${before.step} became ${after.step}: then ${kinds}`;
});

await stage("Just a few, and the floor said plainly: with the games that first show a word off, the sheet says so, and a lesson still shows every new thing", async () => {
  await goStudy();
  await page.locator(`${PAGE} .lx-study-rows [data-part="list-row"]`, { hasText: "Choose the games" }).click();
  await page.waitForSelector('.lx-sheet-layer [data-part="game-toggle"]');
  await settle(300);
  await page.locator(".lx-sheet-layer").getByRole("button", { name: "Just a few" }).click();
  await settle(150);
  const switches = page.locator('.lx-sheet-layer [data-part="game-toggle"]');
  const on = await switches.evaluateAll((nodes) => nodes.filter((node) => node.getAttribute("aria-pressed") === "true").length);
  assert(on === 1, `${on} on after Just a few`);
  const say = await page.locator('.lx-sheet-layer [role="status"]').innerText();
  assert(/turn on the ones you like/i.test(say), `it says: ${say}`);
  const names = (await page.locator('.lx-sheet-layer [data-part="game-toggle"] .lx-toggle-name').allInnerTexts()).map(clean);
  await switches.nth(names.findIndex((name) => name.startsWith("Fill the gap"))).click();
  await settle(100);
  await switches.nth(names.findIndex((name) => name.startsWith("Study cards"))).click();
  await settle(100);
  await shot("20-floor-note");
  const floor = await page.locator('.lx-sheet-layer [role="status"]').innerText();
  const wasOn = await switches.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-pressed") === "true"));
  const seeOn = wasOn[names.findIndex((name) => name.startsWith("Tap the picture"))];
  if (!seeOn) assert(/New words still come first/.test(floor), `the floor isn't said: ${floor}`);
  const plan = await page.evaluate(async () => {
    const { WAYS, setStudySetting, getStudySettings } = await import("/js/study/settings.js");
    const include = getStudySettings().quick.include;
    setStudySetting("quick.include.see", false);
    setStudySetting("quick.include.translate", false);
    const { planSession } = await import("/js/study/plan.js");
    const planned = planSession("lesson");
    const steps = planned.steps.map((step) => ({ kind: step.kind, isNew: Boolean(step.isNew) }));
    for (const way of Object.keys(WAYS)) setStudySetting(`quick.include.${way}`, true);
    return { steps, on: Object.keys(include).filter((way) => include[way]) };
  });
  assert(plan.steps.some((step) => step.kind === "see" && step.isNew), `no first showing: ${JSON.stringify(plan.steps)}`);
  assert(plan.steps.every((step) => (step.kind === "see" ? step.isNew : true)), "Tap the picture beyond the first showing");
  await page.keyboard.press("Escape");
  await settle(300);
  return `${plan.on}: ${plan.steps.map((step) => step.kind)}`;
});

await stage("Match shows a word as it was taught, not the dictionary's form", async () => {
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(async () => {
    await (await import("/js/study/progress.js")).clearProgress();
    (await import("/js/study/done.js")).clearFinished();
    (await import("/js/study/path-place.js")).clearPlaces();
  });
  // Lesson 5 teaches liggen as ligt.
  await page.evaluate(async () => {
    const { pathLessons } = await import("/js/study/path.js");
    location.hash = `#study/session/lesson/${encodeURIComponent(pathLessons()[4].id)}`;
  });
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  let tiles = null;
  for (let guard = 0; guard < 40 && !tiles; guard++) {
    if ((await page.locator(SESSION).getAttribute("data-step")) === "match") tiles = await page.locator(`${SESSION} [data-part="match-item"][data-side="nl"]`).allTextContents();
    await answerStep();
    await settle(150);
  }
  assert(tiles, "no Match in the first lesson");
  assert(tiles.includes("ligt") && !tiles.includes("liggen"), `a form nobody's seen: ${tiles}`);
  await leave();
  return tiles.join(", ");
});

await stage("Jumping ahead, saying no: the lesson's bubble asks, saying how many; nothing's added but what you do; the words from lessons you skipped are marked, met and not learned; Practice leaves them out; your place leads back to what you skipped", async () => {
  const setup = await page.evaluate(async () => {
    const progress = await import("/js/study/progress.js");
    await progress.clearProgress();
    (await import("/js/study/done.js")).clearFinished();
    (await import("/js/study/path-place.js")).clearPlaces();
    const { pathLessons } = await import("/js/study/path.js");
    const { lessonsSkippedBy } = await import("/js/study/plan.js");
    // The eleventh lesson of words: a lesson of one idea is never skipped, so jumping past them doesn't count them.
    const lessons = pathLessons();
    const target = lessons.filter((lesson) => lesson.kind !== "idea" && !lesson.full)[10];
    return { target: target.id, title: target.title, at: lessons.indexOf(target), skipped: lessonsSkippedBy(target.id).length, kinds: lessons.map((lesson) => lesson.kind) };
  });
  await page.evaluate((id) => (location.hash = `#study/path/${encodeURIComponent(id)}`), setup.target);
  const asking = page.locator(".lx-path .lx-path-bubble");
  await asking.getByRole("button", { name: "Start" }).click();
  await asking.getByRole("button", { name: "No, just this lesson" }).waitFor({ timeout: 5000 });
  await settle(400);
  await shot("21-jump-question");
  const asks = clean(await asking.innerText());
  assert(new RegExp(`Mark the ${setup.skipped} lessons you skipped as done\\?`).test(asks) && setup.skipped >= 8, `${setup.skipped}: ${asks}`);
  const before = (await rowsNow()).length;
  await asking.getByRole("button", { name: "No, just this lesson" }).click();
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  assert((await rowsNow()).length === before, "saying no recorded something");
  await settle(500);
  await shot("22-jumped-lesson");
  const planned = await page.evaluate(async (id) => {
    const { planSession } = await import("/js/study/plan.js");
    const plan = planSession("lesson", id);
    return { borrowed: [...new Set(plan.steps.flatMap((step) => step.borrowed ?? []))], own: plan.lesson.units };
  }, setup.target);
  assert(planned.borrowed.length, "none of its sentences needed a word you skipped");
  const kinds = await kindsToTheEnd();
  await page.locator(`${SESSION} [data-variant="white"]`, { hasText: "Done" }).click();
  await pastReminderAsk(page);
  await settle(400);
  const after = await page.evaluate(async ({ borrowed, own }) => {
    const { conceptState } = await import("/js/study/progress.js");
    const { pathOverview, planSession, studyOverview } = await import("/js/study/plan.js");
    const { sentenceUnits } = await import("/js/study/content.js");
    const { conceptsOf } = await import("/js/study/content.js");
    const path = pathOverview(30);
    const practice = planSession("practice");
    const unknown = new Set(borrowed);
    return {
      stillNew: borrowed.filter((unit) => conceptState(unit).isNew).length,
      ownLearned: own.filter((unit) => !conceptState(unit).isNew).length,
      states: path.lessons.slice(0, 30).map((lesson) => lesson.state),
      practiceHas: practice.steps.filter((step) => step.item && [...conceptsOf(step.item), ...sentenceUnits(step.item)].some((unit) => unknown.has(unit))).length,
      next: studyOverview().lesson?.title,
    };
  }, planned);
  assert(after.stillNew === planned.borrowed.length, `${planned.borrowed.length - after.stillNew} of ${planned.borrowed.length} words you skipped went in what you know`);
  assert(after.ownLearned === planned.own.length, `${after.ownLearned} of ${planned.own.length} of its own learned`);
  // Behind it: skipped, or open for a lesson of one idea; it's done; what's next comes after it.
  const behindIt = after.states.slice(0, setup.at);
  assert(after.states[setup.at] === "done" && behindIt.every((state, i) => state === (setup.kinds[i] === "idea" ? "open" : "skipped")) && after.states.indexOf("here") > setup.at, after.states.join(","));
  assert(after.practiceHas === 0, `Practice asks ${after.practiceHas} sentences with words you skipped`);
  await page.evaluate(() => (location.hash = "#study/path"));
  await page.waitForSelector(`${PAGE} .lx-pu-title`);
  await settle(500);
  await shot("23-path-gap");
  // Your place's bubble leads back to the first lesson you skipped.
  await tapWords(page.locator(`${PAGE} .lx-ps[data-state="here"]`));
  const back = page.locator(".lx-path .lx-path-bubble .lx-here-skip");
  await back.waitFor({ timeout: 5000 });
  assert(/Go back to what you skipped/.test(clean(await back.innerText())), clean(await back.innerText()));
  await settle(300);
  await shot("23b-way-back");
  await page.keyboard.press("Escape");
  return `${planned.borrowed.length} words met, not learned; next: ${after.next}; asked: ${kinds}`;
});

await stage("Jumping ahead, saying yes: what they teach goes in what you know, Practice asks about it, the path lights them as they come into view (a press lighting all that's waiting), and no lesson's counted as finished", async () => {
  // path-nl's own 21st lesson (a pack's lessons put in ahead of it are skipped and marked like any other), and every lesson up to it.
  const setup = await page.evaluate(async () => {
    const { pathLessons } = await import("/js/study/path.js");
    const lessons = pathLessons();
    const target = lessons.filter((lesson) => lesson.id.startsWith("path-nl/") && !lesson.full)[20];
    return { target: target.id, at: lessons.indexOf(target), kinds: lessons.map((lesson) => lesson.kind) };
  });
  await page.evaluate((id) => (location.hash = `#study/path/${encodeURIComponent(id)}`), setup.target);
  await page.locator(".lx-path .lx-path-bubble").getByRole("button", { name: "Start" }).click();
  const yes = page.locator(".lx-path .lx-path-bubble").getByRole("button", { name: "Yes, mark them done" });
  await yes.waitFor({ timeout: 5000 });
  await yes.click();
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  await leave();
  const after = await page.evaluate(async () => {
    const { conceptState } = await import("/js/study/progress.js");
    const { pathLessons } = await import("/js/study/path.js");
    const { lessonsFinished } = await import("/js/study/done.js");
    const { pathOverview, planSession } = await import("/js/study/plan.js");
    const lessons = pathLessons();
    return {
      states: pathOverview(60).lessons.map((lesson) => lesson.state),
      known: lessons[4].things.filter((thing) => !thing.formOnly).every((thing) => !conceptState(thing.unit).isNew),
      finished: lessonsFinished().size,
      practice: planSession("practice").steps.filter((step) => step.item).length,
    };
  });
  // Every lesson of words behind it marked done; a lesson of one idea stays open, never marked.
  assert(after.states.slice(0, setup.at).every((state, i) => state === (setup.kinds[i] === "idea" ? "open" : "done")), after.states.slice(0, setup.at + 2).join(","));
  assert(after.known, "a marked lesson's words aren't known");
  assert(after.finished === 1, `${after.finished} lessons finished`);
  assert(after.practice > 3, `${after.practice} sentences in Practice`);
  // What's finished lights up as it comes into view, one after another; a press lights all that's waiting at once. (On a fresh open: from Study.)
  await goStudy();
  await stripTap();
  await page.waitForFunction(() => location.hash === "#study/path");
  await page.waitForSelector(`${PAGE} .lx-pu-title`);
  await settle(1200);
  const unlitNear = (top) => page.evaluate(async (top) => {
    const scroller = document.querySelector('[data-part="page"]:not([data-ghost])');
    const frames = (n) => new Promise((done) => { const f = () => (n-- <= 0 ? done() : requestAnimationFrame(f)); f(); });
    const firstUnseen = top === null ? null : scroller.querySelectorAll('.lx-ps[data-state="done"]')[0]?.classList.contains("lx-unlit");
    if (top === "unit1") scroller.scrollTop = 0;
    if (top === "unit2") { const head = scroller.querySelectorAll(".lx-pu")[1]; scroller.scrollTop += head.getBoundingClientRect().top - scroller.getBoundingClientRect().top; }
    await frames(3);
    const box = scroller.getBoundingClientRect();
    const shown = [...scroller.querySelectorAll('.lx-ps[data-state="done"]')].filter((n) => { const r = n.getBoundingClientRect(); return r.top >= box.top + 60 && r.bottom <= box.bottom - 110; });
    return { firstUnseen, unlit: shown.map((n) => n.classList.contains("lx-unlit")) };
  }, top);
  const opening = await unlitNear("unit1");
  assert(opening.firstUnseen, "unit 1's first lesson, never seen, was already lit");
  assert(opening.unlit.length >= 3 && opening.unlit.some(Boolean), `nothing waiting its turn at the top: ${opening.unlit}`);
  await settle(1800);
  const lit = await unlitNear(null);
  assert(lit.unlit.length >= 3 && !lit.unlit.some(Boolean), `still unlit after they'd all had their turn: ${lit.unlit}`);
  // Then unit 2, unseen, and a press while its lessons wait their turn (the page marks them: data-lighting), counted and pressed in one go.
  const press = await page.evaluate(async () => {
    const scroller = document.querySelector('[data-part="page"]:not([data-ghost])');
    const frames = (n) => new Promise((done) => { const f = () => (n-- <= 0 ? done() : requestAnimationFrame(f)); f(); });
    const head = scroller.querySelectorAll(".lx-pu")[1];
    scroller.scrollTop += head.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    const waitingNow = () => [...scroller.querySelectorAll(".lx-ps[data-lighting]")];
    for (let i = 0; i < 90 && waitingNow().length < 2; i++) await frames(1);
    const waiting = waitingNow();
    document.elementFromPoint(6, 420)?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    await frames(2);
    return { waiting: waiting.length, stillUnlit: waiting.filter((one) => one.classList.contains("lx-unlit")).length, stillMarked: waitingNow().length };
  });
  assert(press.waiting >= 2, `too few waiting their turn to show a press lighting them: ${press.waiting}`);
  assert(press.stillUnlit === 0, `a press didn't light what was waiting: ${press.stillUnlit} of ${press.waiting} still unlit`);
  return after.states.join(",");
});

await stage("Back to the path from a lesson: where you left it from its first frame, nothing held unseen; a fresh open goes to your place", async () => {
  // A fresh open: at your place.
  await goStudy();
  await stripTap();
  await page.waitForFunction(() => location.hash === "#study/path");
  await page.waitForSelector(`${PAGE} .lx-pu-title`);
  await settle(700);
  const opened = await page.evaluate(() => {
    const scroller = document.querySelector('[data-part="page"]:not([data-ghost])');
    const here = scroller.querySelector('.lx-ps[data-state="here"]');
    const r = here.getBoundingClientRect(), box = scroller.getBoundingClientRect();
    return { top: scroller.scrollTop, inView: r.top >= box.top && r.bottom <= box.bottom };
  });
  assert(opened.top > 200 && opened.inView, `a fresh open isn't at your place: ${JSON.stringify(opened)}`);
  // Up to the top, a lesson from its bubble, and back: every frame from the moment it leaves, watched.
  await page.evaluate(() => (document.querySelector('[data-part="page"]:not([data-ghost])').scrollTop = 0));
  await settle(500);
  await tapWords(page.locator(`${PAGE} .lx-ps`).first());
  const bubble = page.locator(".lx-path .lx-path-bubble");
  await bubble.waitFor();
  await bubble.locator('[data-part="button"][data-variant="go"]').first().click();
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  await settle(400);
  await page.evaluate(() => {
    // The path under the session: the same page when it's over, never built again (built again, it showed nothing until drawn).
    window.lxPathHost = [...document.querySelector('[data-part="page"]:not([data-ghost])').children].find((one) => one.querySelector?.(".lx-path"));
    window.lxBack = [];
    const t0 = performance.now();
    const tick = () => {
      const scroller = document.querySelector('[data-part="page"]:not([data-ghost])');
      const host = [...(scroller?.children ?? [])].find((one) => one.querySelector?.(".lx-path"));
      // (A session leaving is a picture on the ghost layer, sliding off over the path: the path is shown under it.)
      const shown = Boolean(host && !host.hasAttribute("data-waiting") && getComputedStyle(host).visibility !== "hidden" && !document.querySelector('[data-part="session"]:not([data-ghost])'));
      window.lxBack.push({ t: Math.round(performance.now() - t0), path: location.hash === "#study/path", shown, top: scroller?.scrollTop ?? null });
      if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await leave();
  await settle(2600);
  const frames = await page.evaluate(() => window.lxBack);
  const samePage = await page.evaluate(() => Boolean(window.lxPathHost?.isConnected) && [...document.querySelector('[data-part="page"]:not([data-ghost])').children].find((one) => one.querySelector?.(".lx-path")) === window.lxPathHost);
  assert(samePage, "the path was built again under the session instead of staying");
  const back = frames.findIndex((one) => one.path);
  assert(back >= 0, "never came back to the path");
  const firstShown = frames.findIndex((one, i) => i >= back && one.shown);
  const unseen = firstShown < 0 ? Infinity : frames[firstShown].t - frames[back].t;
  assert(unseen <= 60, `the path held unseen for ${unseen} ms on the way back`);
  const tops = frames.slice(firstShown).filter((one) => one.shown).map((one) => one.top);
  assert(tops.length && tops.every((top) => top <= 20), `it didn't come back where it was left (the top): ${[...new Set(tops)].slice(0, 6)}`);
  return `fresh open at ${opened.top}; back: shown after ${unseen} ms, at ${tops[0]} for ${tops.length} frames`;
});

await stage("When the written lessons are done, Study says so, What's next carries on with the next pack's words under its name, and that carries on", async () => {
  await page.evaluate(async () => {
    const { pathLessons } = await import("/js/study/path.js");
    const { markLessonsDone } = await import("/js/study/plan.js");
    markLessonsDone(pathLessons().filter((lesson) => !lesson.worked));
  });
  await goStudy();
  const row = page.locator(`${PAGE} .lx-study-rows [data-part="list-row"]`, { hasText: "Learn something new" });
  await row.waitFor({ timeout: 5000 });
  assert(/You've done every Dutch lesson here/.test(clean(await row.innerText())), clean(await row.innerText()));
  await row.click();
  await page.getByRole("heading", { name: "You've done every Dutch lesson here" }).waitFor({ timeout: 5000 });
  await settle(400);
  await shot("25-whats-next");
  // The words carry on under the name of the pack they're from (here a word band), "more words" only for the list's own.
  const next = await page.evaluate(async () => (await import("/js/study/plan.js")).studyOverview().lesson);
  assert(next?.worked && next.wordsFrom, `what comes next isn't a pack's worked-out lesson: ${JSON.stringify(next)}`);
  const carryOn = page.locator(`${PAGE} [data-part="list-row"]`, { hasText: `Carry on with ${next.wordsFrom}` });
  assert((await carryOn.count()) === 1, `no row "Carry on with ${next.wordsFrom}": ${clean(await page.locator(PAGE).last().innerText())}`);
  await carryOn.click();
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  await leave();
  await page.evaluate(async () => {
    await (await import("/js/study/progress.js")).clearProgress();
    (await import("/js/study/done.js")).clearFinished();
    (await import("/js/study/path-place.js")).clearPlaces();
  });
});

await stage("Practice this, in a concept's sheet mid-session: a few questions on it go in right after this one, the sheet closes and says how many, and the session carries on", async () => {
  await page.evaluate(async () => {
    await (await import("/js/study/progress.js")).clearProgress();
    (await import("/js/study/done.js")).clearFinished();
    (await import("/js/study/path-place.js")).clearPlaces();
  });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(() => (location.hash = "#study/session/lesson"));
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  await kindsToTheEnd();
  await page.locator(`${SESSION} [data-variant="white"]`, { hasText: "Done" }).click();
  await pastReminderAsk(page);
  await settle(300);
  await page.evaluate(() => (location.hash = "#study/session/practice"));
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  // On a question whose sentence shows a pattern: answered, its way in to the pattern under it.
  const chip = page.locator(`${SESSION} [data-part="concept-chip"][data-concept^="p:"]`).first();
  for (let guard = 0; guard < 14; guard++) {
    await settle(200);
    const shows = await page.evaluate(async (S) => {
      const step = document.querySelector(S)?.lxStep;
      if (!step?.item) return false;
      const { sentenceUnits } = await import("/js/study/content.js");
      return sentenceUnits(step.item).some((unit) => unit.startsWith("p:"));
    }, SESSION);
    if (shows && (await page.locator(SESSION).getByRole("button", { name: "I don't know" }).count())) {
      await page.locator(SESSION).getByRole("button", { name: "I don't know" }).click();
      if (await chip.waitFor({ timeout: 3000 }).then(() => true, () => false)) break;
      await page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).click();
    } else await answerStep();
  }
  const unit = await chip.getAttribute("data-concept");
  const total = async () => Number((await page.locator(`${SESSION} .lx-session-count`).innerText()).split("/")[1]);
  const before = await total();
  const at = Number((await page.locator(`${SESSION} .lx-session-count`).innerText()).split("/")[0]);
  await chip.click();
  const practice = page.locator('[data-part="concept-practice"] button');
  await practice.waitFor({ timeout: 5000 });
  assert(!(await page.locator('[data-part="concept-sheet"]').innerText()).match(/\bAI\b|Ask your/), "AI words in the sheet");
  await shot("50-concept-practice");
  await practice.click();
  const toast = page.locator(`${SESSION} .lx-session-toasts [data-part="toast"]`);
  if (!(await toast.waitFor({ timeout: 3000 }).then(() => true, () => false))) {
    await shot("50-concept-practice-after");
    const said = await page.locator('[data-part="concept-practice"] [role="status"]').innerText().catch(() => "(no sheet)");
    const there = await page.locator(`${SESSION} .lx-session-toasts`).count();
    throw new Error(`no toast for ${unit}: the sheet says "${said}"; a toast host ${there ? "is" : "isn't"} there`);
  }
  const said = (await toast.innerText()).trim();
  const k = Number(said.match(/^(\d+) more on this, coming up$/)?.[1]);
  assert(k >= 1 && k <= 3, `the toast: "${said}"`);
  await settle(450);
  assert(!(await page.locator('[data-part="concept-sheet"]').count()) || !(await page.locator('[data-part="concept-sheet"]').isVisible()), "the sheet stayed open");
  // New questions add to the count; ones the session had coming later are only brought forward.
  const after = await total();
  assert(after >= before && after <= before + k, `${before} questions became ${after}, with ${k} slipped in`);
  await shot("51-slipped-in");
  // Continue: the next k questions are on it, slipped in; then the session goes on, not over.
  await page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).click();
  const pattern = unit.slice(2);
  for (let i = 0; i < k; i++) {
    await page.waitForFunction((S) => document.querySelector(S)?.lxStep, SESSION);
    const step = await page.evaluate((S) => { const st = document.querySelector(S).lxStep; return { slipped: st.slipped ?? null, concepts: st.item?.concepts ?? [], count: document.querySelector(`${S} .lx-session-count`).textContent }; }, SESSION);
    assert(step.slipped === unit && step.concepts.includes(pattern), `question ${i + 1} after it isn't on ${unit}: ${JSON.stringify(step)}`);
    assert(Number(step.count.split("/")[0]) === at + 1 + i, `it came at ${step.count}, not right after ${at}`);
    await answerStep();
  }
  assert(!(await summary().count()) || at + k >= before + k, "the session ended instead of carrying on");
  return `${unit}: ${k} slipped in after question ${at}, ${before} → ${after} questions`;
});

await stage("no voice for the language on this device: no question needs one, none has a dead speak button, nothing says so, and a lesson still ends", async () => {
  // A device with nothing to hear: no voice of its own, and no recording ever (the app's own and the library's packs', refused from its first
  // load). This check's device can't be made one: a library pack's recordings, where the server has them, are kept on it and play.
  const main = page;
  const silent = await browser.newContext(PHONE);
  await withList(silent);
  await silent.addInitScript(() => {
    window.speechSynthesis.getVoices = () => [];
  });
  await silent.route(/\/audio\/[^/]+\/manifest\.json(\?|$)|\/library\/packs\/[^/]+\/[^/]+\/audio\.[0-9a-f]{12}\.json(\?|$)/, (route) => route.abort());
  page = await silent.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  try {
    await signUp(silent, page, "Study Check No Voice");
    await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
    assert((await page.evaluate(() => window.speechSynthesis.getVoices().length)) === 0, "the voices are still there");
    assert(!(await page.evaluate(async () => (await import("/js/study/voice.js")).hearsAnything())), "something to hear on a device with no voice and no recordings");
    await page.evaluate(() => (location.hash = "#study/session/lesson"));
    await page.waitForSelector(SESSION);
    await settle(300);
    await page.waitForFunction((S) => document.querySelector(S)?.lxStep?.kind, SESSION);
    const said = [];
    const seen = [];
    for (let i = 0; i < 30; i++) {
      if (await summary().count()) break;
      await settle(110);
      said.push(await session.innerText());
      assert(!(await page.locator(`${SESSION} [data-part="activity"] [data-part="speak-button"]`).count()), `a speak button on ${(await stepNow()).kind}`);
      seen.push((await answerStep()).kind);
    }
    await shot("16-no-voice");
    for (const gone of ["listen", "repeat"]) assert(!seen.includes(gone), `${gone} with no voice: ${seen}`);
    assert(await summary().count(), "the lesson has no end");
    assert(!/\bvoice|\bsound|\baudio|can't hear/i.test(said.join(" ")), "it says so");
    await leaveSummary();
    // On Study the games that need a voice are there, quieter, and a press says why instead of starting.
    await page.evaluate(() => (location.hash = "#study"));
    await page.waitForSelector(`${PAGE} [data-part="way-tile"]`);
    await settle(300);
    const off = await page.locator(`${PAGE} [data-part="way-tile"][data-state="unavailable"]`).allInnerTexts();
    assert(off.some((text) => text.trim() === "Listening") && off.some((text) => /^Repeat/.test(text.trim())), `the games that can't play: ${off}`);
    await page.locator(`${PAGE} [data-part="way-tile"]`, { hasText: "Listening" }).click();
    await page.locator('[data-part="sheet"]', { hasText: "no Dutch voice" }).waitFor({ timeout: 5000 });
    assert(!/#study\/session/.test(await page.evaluate(() => location.hash)), "it started a session that can't play");
    await page.keyboard.press("Escape");
    return seen.join(" ");
  } finally {
    page = main;
    await silent.close();
  }
});

await stage("an account with old progress lands somewhere sensible: Practice, with the next lesson past what it knows", async () => {
  await page.evaluate(async () => {
    const { clearProgress, record } = await import("/js/study/progress.js");
    await clearProgress();
    const { wordsInOrder } = await import("/js/study/new-words.js");
    const at = Date.now() - 30 * 86_400_000;
    record(wordsInOrder().slice(0, 1500).map((word, i) => ({ concept: `w:${word}`, at: at + i * 1000, outcome: "right", test: "pick", skill: "read", activity: "meaning", item: "study-check" })));
  });
  await goStudy();
  await shot("17-old-account");
  const text = await cardText();
  assert(/^Practice/.test(text), `the card: ${text}`);
  const row = clean(await lessonDoor().innerText());
  assert(/A new lesson/.test(row) && !row.includes(lessons[0].title), `the lesson's door: ${row}`);
  return `${text} | ${row}`;
});

await stage("Fill's choices are words: a gap whose word is written with punctuation (\"koffie,\") shows its choices bare and the punctuation after the gap", async () => {
  // Lesson 2 with only Fill to ask with (and the first showings Study always keeps): "Hallo, een koffie, graag." has its gap at "koffie,".
  await page.evaluate(async () => {
    const { WAYS, setStudySetting } = await import("/js/study/settings.js");
    for (const way of Object.keys(WAYS)) setStudySetting(`quick.include.${way}`, way === "fill");
    await (await import("/js/study/progress.js")).clearProgress();
    (await import("/js/study/done.js")).clearFinished();
    (await import("/js/study/path-place.js")).clearPlaces();
    const { pathLessons } = await import("/js/study/path.js");
    const lessons = pathLessons();
    const at = lessons.findIndex((one) => /\/l002$/.test(one.id));
    if (at > 0) (await import("/js/study/plan.js")).markLessonsDone(lessons.slice(0, at));
    location.hash = `#study/session/lesson/${encodeURIComponent(lessons[at].id)}`;
  });
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  const seen = [];
  try {
    for (let guard = 0; guard < 40 && !(await summary().count()); guard++) {
      const step = await stepNow();
      if (step?.kind === "fill") {
        const asWritten = step.nl[step.gapIndex];
        const tail = /[.,;:!?…»”")\]]+$/u.exec(asWritten)?.[0] ?? "";
        const choices = (await session.locator(".lx-game button").allInnerTexts()).map((text) => text.trim()).filter(Boolean);
        // What's on the screen: the gap's word for a screen reader (visually hidden) left out.
        const sentence = clean(await session.locator('[data-part="fill-sentence"]').evaluate((n) => {
          const copy = n.cloneNode(true);
          for (const hidden of copy.querySelectorAll(".lx-visually-hidden")) hidden.remove();
          return copy.textContent;
        }));
        seen.push({ id: step.id, asWritten, choices, sentence });
        if (tail) {
          const glued = choices.filter((text) => /[.,;:!?…»”")\]]$/u.test(text));
          assert(!glued.length, `${step.id}: choices with punctuation glued on: ${JSON.stringify(choices)}`);
          assert(sentence.includes(`____${tail}`), `${step.id}: the "${tail}" isn't right after the gap: ${sentence}`);
        }
      }
      await answerStep();
      await settle(150);
    }
  } finally {
    await page.evaluate(async () => {
      const { WAYS, setStudySetting } = await import("/js/study/settings.js");
      for (const way of Object.keys(WAYS)) setStudySetting(`quick.include.${way}`, true);
    });
  }
  const punctuated = seen.filter((one) => /[.,;:!?…»”")\]]$/u.test(one.asWritten));
  assert(punctuated.length, `no Fill on a gap written with punctuation was reached: ${JSON.stringify(seen.map((one) => one.id))}`);
  await page.keyboard.press("Escape").catch(() => {});
  return punctuated.map((one) => `${one.id}: ${one.choices.join(" / ")} in "${one.sentence}"`).join("; ");
});

await stage("the place on the path and what you finish are among the things that sync", async () => {
  const has = await page.evaluate(async () => (await import("/js/sync.js")).syncStatus().kinds.map((kind) => kind.id));
  assert(has.includes("path") && has.includes("streak"), `the kinds: ${has}`);
  return has.join(", ");
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.slice(0, 3).join(" | "));
});

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
await page.evaluate(async () => {
  await fetch("/account/delete", { method: "POST" }).catch(() => {});
}).catch(() => {});
await browser.close();
const failed = Object.values(results).filter((result) => !result.ok).length;
console.log(`${Object.keys(results).length - failed}/${Object.keys(results).length} passed`);
process.exit(failed ? 1 : 0);
