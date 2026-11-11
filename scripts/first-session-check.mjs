// A brand-new learner's first sessions, on a phone: new words one at a time, never a sentence full of words nobody has
// taught, and every word's meaning free. It presses what a learner presses. First a fresh account's first session:
// - the first press on Study brings the most common words, each on a card about that one word, boxed; no other word is
//   marked, and the plan's whole-sentence steps have at most one new word in them;
// - a tap on another word shows what it means ("ben (zijn): to be; his, its" for a form), and records nothing against it;
// - revealing shows the card's own word with its dictionary form; first sight has no grade;
// - Match holds only words you've met; What does it mean? asks about the word in another sentence, and only that word is graded;
// - after the session, only the words the session taught have graded rows.
// Then a learner with some words: a due word comes back in a sentence they haven't had, whole-sentence games appear on what
// they can read, a tap on Fill's sentence and on an answer's line is free, the Words action lists what's on the screen in an
// order that gives nothing away. Then a long run: no flagged sentence (lang/not-first.<code>.js) is ever a new word's
// card or question, with an override proving the check can fail. LOCAL only: it signs up a test account, deleted at the
// end, and the local library must have the Dutch word packs (scripts/packs/seed-local.mjs --default), else exit 2.
// Usage: node scripts/first-session-check.mjs http://localhost:<port> <outDir> [--list <frequency.nl.json>]   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { ownText } from "./fixtures/step-text.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const LIST = argv.includes("--list") ? resolve(argv[argv.indexOf("--list") + 1]) : null;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/first-session-check.mjs http://localhost:<port> <outDir> [--list <frequency.nl.json>] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const catalogue = await (await fetch(`${BASE}/library/catalogue.json`)).json().catch(() => ({}));
if (!(catalogue.packs?.nl ?? []).some((pack) => pack.id === "words-nl-01")) {
  console.error("first-session-check: the local library doesn't list words-nl-01; seed the Dutch word packs first.");
  process.exit(2);
}

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true });
// The live library lists a frequency list; a local one may not: give this one the same.
if (LIST && !catalogue.lists?.frequency?.nl) {
  await context.route("**/library/catalogue.json", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.lists = { ...(body.lists ?? {}), frequency: { ...(body.lists?.frequency ?? {}), nl: { url: "/__freq.nl.json" } } };
    await route.fulfill({ response, json: body });
  });
  await context.route("**/__freq.nl.json", (route) => route.fulfill({ contentType: "application/json", body: readFileSync(LIST) }));
}
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
let failed = 0;
const results = {};
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
const SESSION = '[data-part="session"]';
const session = page.locator(SESSION);
const settle = (ms = 350) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "First Session Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
await page.waitForSelector("html[data-app-ready]");
const device = await page.evaluate(async () => {
  const packs = await import("/js/study/packs.js");
  await packs.syncLibraryPacks();
  const freq = await import("/js/study/frequency.js");
  await freq.loadFrequency("nl");
  return { packs: packs.libraryPacks().filter((p) => p.language === "nl").map((p) => p.id), ik: freq.rankOf("ik", "nl"), zijn: freq.rankOf("zijn", "nl") };
});
console.log("device:", JSON.stringify(device));

// The plan as data, with what's new in each step at the moment it runs (what earlier steps have taught counts).
const planNow = () =>
  page.evaluate(async () => {
    const { planSession } = await import("/js/study/plan.js");
    const { sentence, WORDS } = await import("/js/study/content.js");
    const { unitState } = await import("/js/study/progress.js");
    const plan = planSession("quick");
    const taught = new Set();
    return plan.steps.map((step) => {
      if (!step.item) {
        for (const word of step.words ?? []) taught.add(word);
        return { kind: step.kind, words: step.words };
      }
      const lemmas = [...new Set(step.item.words.map(([, lemma]) => lemma).filter(Boolean))];
      const unknown = lemmas.filter((lemma) => !taught.has(lemma) && unitState(`w:${lemma}`).isNew);
      const out = { kind: step.kind, mode: step.mode, target: step.target, first: step.first, meaning: step.meaning, id: step.item.id, sentence: sentence(step.item), unknown, gloss: step.target ? WORDS[step.target] : null };
      if (step.target) taught.add(step.target);
      return out;
    });
  });
const rowsNow = () => page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().map((row) => ({ concept: row.concept, outcome: row.outcome, activity: row.activity, item: row.item })));

let first = [];
await stage("Study's first session: new words, one at a time, most common first", async () => {
  await page.locator('[data-part="tab-bar"] [data-part="tab"]', { hasText: "Study" }).first().click();
  await settle(900);
  await shot("01-study");
  first = await planNow();
  writeFileSync(`${OUT}/first-plan.json`, JSON.stringify(first, null, 1));
  const cards = first.filter((step) => step.kind === "card");
  assert(cards.length >= 1, `no cards: ${first.map((s) => s.kind)}`);
  assert(cards.every((step) => step.target && step.first), `a card about no word, or graded on first sight: ${JSON.stringify(cards.map((c) => [c.target, c.first]))}`);
  if (device.ik === 1) assert(cards.slice(0, 3).map((c) => c.target).join() === "ik,zijn,jij", `first words: ${cards.map((c) => c.target)}`);
  return first.map((s) => `${s.kind}${s.target ? `:${s.target}` : ""}`).join(" ");
});

await stage("no step quizzes a sentence with more than one new word", async () => {
  const whole = first.filter((step) => step.item !== undefined || step.id).filter((step) => !["card", "meaning"].includes(step.kind));
  const bad = whole.filter((step) => step.unknown.length > 1);
  assert(!bad.length, bad.map((s) => `${s.kind} "${s.sentence}" has ${s.unknown.length} new`).join("; "));
  return `${whole.length} whole-sentence steps, every one readable`;
});

await stage("the first card is about one word: boxed, the rest plain, a tap away", async () => {
  await page.evaluate(() => (location.hash = "#study/session/quick"));
  await page.waitForSelector(SESSION);
  await settle();
  await shot("02-card-first-sight");
  const states = await page.locator(`${SESSION} [data-part="target-word"]`).evaluateAll((nodes) => nodes.map((n) => n.dataset.state ?? null));
  assert(states.filter((s) => s === "target").length === 1, `words marked ${JSON.stringify(states)}: expected exactly one boxed`);
  assert(states.filter(Boolean).length === 1, `other words carry a state: ${JSON.stringify(states)}`);
  const before = (await rowsNow()).length;
  const other = page.locator(`${SESSION} [data-part="target-word"]:not([data-state="target"])`).first();
  const text = (await other.getAttribute("data-word")) ?? "";
  await other.click();
  await settle(200);
  const pop = page.locator(`${SESSION} [data-part="word-popover"]`);
  assert(await pop.count(), `a tap on "${text}" showed no meaning`);
  const said = (await pop.textContent()).trim();
  assert(/: .+/.test(said), `the meaning: "${said}"`);
  await shot("03-tap-other-word");
  assert((await other.getAttribute("data-state")) === null, `a tapped word changed state: ${await other.getAttribute("data-state")}`);
  assert((await rowsNow()).length === before, "a tap recorded something");
  return `"${text}" → "${said}"`;
});

await stage("a press anywhere closes the meaning and still does what it presses", async () => {
  const pop = page.locator(`${SESSION} [data-part="word-popover"]`);
  assert(await pop.count(), "the meaning has gone already");
  const pressable = await pop.evaluate((node) => getComputedStyle(node).pointerEvents);
  assert(pressable === "none", `it takes presses: pointer-events ${pressable}`);
  await session.getByRole("button", { name: "Show meaning" }).click();
  await settle();
  assert(!(await pop.count()), "the meaning stayed after a press elsewhere");
  return "closed, and Show meaning ran";
});

await stage("revealed: the word with its dictionary form, no grade on first sight", async () => {
  await shot("04-card-revealed");
  const line = (await page.locator(`${SESSION} [data-part="word-meaning"]`).first().textContent()).trim();
  const step = first[0];
  const shownGloss = await page.evaluate(async ([said, id]) => {
    const { itemById } = await import("/js/study/content.js");
    const { meaningOfWord } = await import("/js/study/new-words.js");
    return meaningOfWord(said, itemById.get(id)).gloss;
  }, [(await page.locator(`${SESSION} [data-part="target-word"][data-state="target"]`).getAttribute("data-word")), await session.getAttribute("data-item")]);
  assert(line.includes(shownGloss), `"${line}" hasn't its gloss "${shownGloss}"`);
  const said = await page.locator(`${SESSION} [data-part="target-word"][data-state="target"]`).getAttribute("data-word");
  const bare = said.replace(/[^\p{L}\p{M}\p{N}'’-]+$/u, "");
  if (bare.toLowerCase() !== step.target) assert(line.startsWith(`${bare} (${step.target})`), `a form without its word: "${line}" for ${bare} (${step.target})`);
  assert(!(await session.getByRole("button", { name: "Not yet" }).count()), "a grade on a word they've never seen");
  await session.getByRole("button", { name: "Continue" }).click();
  await settle();
  const rows = await rowsNow();
  assert(rows.length && rows.every((row) => row.outcome === "met"), `first sight graded something: ${JSON.stringify(rows.filter((r) => r.outcome !== "met").slice(0, 3))}`);
  return `"${line}"; ${rows.length} rows, all met`;
});

// Plays out the session from wherever it is: every step answered as a learner would, right unless told otherwise.
async function playOut({ wrong = false, shots = null } = {}) {
  const asked = [];
  for (let i = 0; i < 40; i++) {
    if (!(await session.count())) break;
    const summary = await page.locator(`${SESSION} [data-part="session-summary"]`).count();
    if (summary) break;
    await settle(250);
    const label = ((await page.locator(`${SESSION} [data-part="activity-prompt"] > span`).first().evaluate(ownText).catch(() => "")) ?? "").trim();
    const target = await session.getAttribute("data-target").catch(() => null);
    const item = await session.getAttribute("data-item").catch(() => null);
    const buttons = async () => page.locator(`${SESSION} button:visible`).evaluateAll((nodes) => nodes.map((n) => n.textContent.trim()));
    asked.push({ label, target, item });
    if (shots) await shot(`${shots}-${String(i + 1).padStart(2, "0")}`);
    const names = await buttons();
    if (names.includes("Show meaning")) {
      await session.getByRole("button", { name: "Show meaning" }).click();
      await settle(200);
      if (shots) await shot(`${shots}-${String(i + 1).padStart(2, "0")}-b`);
      const after = await buttons();
      if (after.includes("Continue")) await session.getByRole("button", { name: "Continue" }).click();
      else await session.getByRole("button", { name: wrong ? "Not yet" : "I knew it" }).click();
      continue;
    }
    if (label === "Match the pairs") {
      const pairs = await page.evaluate((S) => document.querySelector(S).lxStep.answers, SESSION);
      const tiles = await page.locator(`${SESSION} [data-part="match-item"]`).evaluateAll((nodes) => nodes.map((n) => (n.dataset.word ?? n.textContent).trim()));
      for (const text of tiles) {
        if (!pairs[text]) continue;
        await page.locator(`${SESSION} [data-part="match-item"]`, { hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).first().click();
        // Its English by the whole text: a part of it would find another tile ("I" is in "ik", case aside).
        await page.locator(`${SESSION} [data-part="match-item"]`, { hasText: new RegExp(`^${pairs[text].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).first().click();
        await settle(150);
      }
    } else if (label === "What does it mean?") {
      const gloss = await page.evaluate(async ([lemma, id]) => {
        const { itemById } = await import("/js/study/content.js");
        const { meaningChoices } = await import("/js/study/new-words.js");
        const choices = meaningChoices(lemma, itemById.get(id));
        return choices.options[choices.correct];
      }, [target, item]);
      if (wrong) await page.locator(`${SESSION} [data-part="choice"]`).filter({ hasNotText: gloss }).first().click();
      else await page.locator(`${SESSION} [data-part="choice"]`).filter({ hasText: gloss }).first().click();
    } else if (names.some((n) => /I don.t know/.test(n))) {
      await session.getByRole("button", { name: "I don't know" }).click();
    }
    await settle(800);
    if (shots) await shot(`${shots}-${String(i + 1).padStart(2, "0")}-b`);
    const after = await buttons();
    const go = after.find((n) => /^(Continue|See how it went)$/.test(n));
    if (go) await session.getByRole("button", { name: go }).click();
    else if (!after.length) break;
  }
  return asked;
}

let played = [];
await stage("the rest of the first session: words met, matched, then asked about in another sentence", async () => {
  played = await playOut({ shots: "05-step" });
  await settle(500);
  await shot("06-summary");
  const asks = first.filter((step) => step.kind === "meaning");
  assert(asks.length, `no What does it mean?: ${first.map((s) => s.kind)}`);
  for (const ask of asks) {
    const met = first.find((step) => step.kind === "card" && step.target === ask.target);
    if (met) assert(met.id !== ask.id, `${ask.target} is asked about in the sentence it was met in: ${ask.sentence}`);
  }
  const match = first.find((step) => step.kind === "match");
  if (match) {
    const taught = new Set(first.filter((step) => step.target).map((step) => step.target));
    const stray = match.words.filter((word) => !taught.has(word));
    assert(!stray.length, `Match holds words nobody has met: ${stray}`);
  }
  return played.map((s) => `${s.label}${s.target ? `:${s.target}` : ""}`).join(" · ");
});

await stage("only the words it taught have grades", async () => {
  const rows = await rowsNow();
  const graded = rows.filter((row) => row.outcome !== "met");
  const taught = new Set(first.filter((step) => step.target).map((step) => `w:${step.target}`));
  const stray = [...new Set(graded.map((row) => row.concept))].filter((concept) => !taught.has(concept));
  assert(graded.length, "nothing graded");
  assert(!stray.length, `graded though never taught: ${stray.slice(0, 8)}`);
  return `${graded.length} graded rows, on ${[...new Set(graded.map((r) => r.concept))].join(", ")}`;
});

await stage("the summary names the words it taught", async () => {
  const text = await page.locator(`${SESSION} [data-part="session-summary"]`).textContent().catch(() => "");
  for (const step of first.filter((s) => s.kind === "card").slice(0, 3)) assert(text.includes(step.target), `the summary doesn't name ${step.target}: ${text.slice(0, 200)}`);
  assert(!/Verb second/.test(text), "the summary claims a pattern it never tested");
  await page.locator(`${SESSION} button`, { hasText: /^Done$/ }).click();
  await settle();
  return text.replace(/\s+/g, " ").slice(0, 160);
});

await stage("with words known: whole-sentence games on what they can read, and a due word in a sentence they haven't had", async () => {
  // A learner who has the top 150 words: evidence written the way a game writes it, two days back.
  const result = await page.evaluate(async () => {
    const { record, allEvidence } = await import("/js/study/progress.js");
    const { wordsInOrder, lemmasOf } = await import("/js/study/new-words.js");
    const { planSession } = await import("/js/study/plan.js");
    const { unitState } = await import("/js/study/progress.js");
    const words = wordsInOrder().slice(0, 150);
    // Most of them answered just now, so they aren't due; a few 12 days back, so they are.
    record(words.map((word, i) => ({ concept: `w:${word}`, at: Date.now() - (i % 30 === 0 ? 12 * 86_400_000 : 60_000), outcome: "right", test: "pick", skill: "read", activity: "meaning", item: "first-session-check" })));
    const plan = planSession("quick");
    const steps = plan.steps.filter((s) => s.item).map((s) => ({ kind: s.kind, target: s.target, id: s.item.id, unknown: lemmasOf(s.item).filter((l) => unitState(`w:${l}`).isNew).length, seen: allEvidence().some((row) => row.item === s.item.id) }));
    return { steps, known: words.length };
  });
  writeFileSync(`${OUT}/known-150-plan.json`, JSON.stringify(result.steps, null, 1));
  const reviews = result.steps.filter((s) => s.target && !s.seen);
  assert(reviews.length, `no word came back in a sentence they haven't had: ${JSON.stringify(result.steps)}`);
  const whole = result.steps.filter((s) => !["card", "meaning", "fill"].includes(s.kind));
  const bad = whole.filter((s) => s.unknown > 1);
  assert(!bad.length, `quizzed on unknown words: ${JSON.stringify(bad)}`);
  assert(whole.length, `no whole-sentence game with 150 words known: ${JSON.stringify(result.steps.map((s) => s.kind))}`);
  return `${result.steps.length} steps; ${reviews.length} in sentences not had yet; ${whole.length} whole-sentence`;
});

await stage("a tap is free in Fill's sentence and on an answer's line; Words lists what's on the screen, in no giveaway order", async () => {
  await page.evaluate(() => (location.hash = "#study/session/game/fill"));
  await page.waitForSelector(SESSION);
  await settle(500);
  const label = (await page.locator(`${SESSION} [data-part="activity-prompt"] > span`).first().evaluate(ownText));
  assert(label === "Fill the gap", `the game opened as "${label}"`);
  const before = (await rowsNow()).length;
  const word = page.locator(`${SESSION} [data-part="fill-sentence"] [data-word]`).first();
  await word.click();
  await settle(200);
  assert(await page.locator(`${SESSION} [data-part="word-popover"]`).count(), "no meaning on Fill's sentence");
  await shot("07-fill-tap");
  assert((await rowsNow()).length === before, "a tap in Fill recorded something");
  await session.getByRole("button", { name: "Words" }).click();
  await settle(700);
  const sheet = page.locator('[data-part="sheet"] [data-part="word-meaning"]');
  assert(await sheet.count(), "the Words sheet lists nothing");
  await shot("08-words-sheet");
  const listed = await sheet.evaluateAll((nodes) => nodes.map((n) => n.textContent.trim()));
  const sorted = [...listed].sort((a, b) => a.localeCompare(b, "nl"));
  assert(listed.join("|") === sorted.join("|"), `not alphabetical: ${listed}`);
  await page.keyboard.press("Escape");
  await settle(700);
  assert(await session.count(), "Escape in the sheet ended the session");
  assert((await rowsNow()).length === before, "the Words sheet recorded something");
  // Answer it, then tap a word of the answer's line.
  await session.getByRole("button", { name: "I don't know" }).click();
  await settle(300);
  const after = (await rowsNow()).length;
  await page.locator(`${SESSION} [data-part="spoken-word"]`).first().click();
  await settle(200);
  assert(await page.locator(`${SESSION} [data-part="word-popover"]`).count(), "no meaning on the answer's line");
  await shot("09-answer-line-tap");
  assert((await rowsNow()).length === after, "a tap on the answer's line recorded something");
  await session.getByRole("button", { name: "Close" }).first().click().catch(() => {});
  await page.keyboard.press("Escape");
  await settle(400);
  return listed.slice(0, 4).join(" · ");
});

await stage("flagged sentences are never a new word's card or question, and the check can fail", async () => {
  const out = await page.evaluate(async () => {
    const { planSession } = await import("/js/study/plan.js");
    const { record, clearProgress } = await import("/js/study/progress.js");
    const { isNotFirst, sentenceForWord, wordsInOrder } = await import("/js/study/new-words.js");
    const { sentence } = await import("/js/study/content.js");
    await clearProgress();
    let at = Date.now() - 400 * 86_400_000;
    const steps = [];
    for (let s = 0; s < 120; s++) {
      const plan = planSession("quick", undefined, at);
      const fresh = plan.steps.filter((step) => step.meaning === "new" && step.target);
      for (const step of fresh) if (step.first || step.kind === "meaning") steps.push({ target: step.target, flagged: isNotFirst(step.item), text: sentence(step.item) });
      const words = [...new Set(fresh.map((step) => step.target))];
      if (!words.length) break;
      record(words.map((word) => ({ concept: `w:${word}`, at, outcome: "right", test: "recall", skill: "read", activity: "meaning", item: "first-session-check" })));
      at += 60_000;
    }
    // The control: with the flags ignored, the same selector does pick flagged sentences, so a clean run means something.
    let would = 0;
    for (const word of wordsInOrder().slice(0, 1500)) {
      const pick = sentenceForWord(word, { known: () => true, seen: () => true });
      if (pick && isNotFirst(pick)) would++;
    }
    return { count: steps.length, flagged: steps.filter((s) => s.flagged), would, last: steps.slice(-3) };
  });
  assert(out.count > 50, `only ${out.count} new-word steps`);
  assert(!out.flagged.length, `flagged: ${JSON.stringify(out.flagged.slice(0, 5))}`);
  assert(out.would > 0, "the control found nothing flagged: the list isn't being read");
  return `${out.count} new-word steps, none flagged; with the flags ignored the selector picks ${out.would} of the first 1,500 words' sentences among them`;
});

await stage("no page errors", async () => {
  assert(!errors.length, errors.slice(0, 3).join(" | "));
  return "none";
});

await page.evaluate(async () => {
  try {
    await fetch("/api/me", { method: "DELETE" });
  } catch {}
}).catch(() => {});
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
console.log(`\n${Object.keys(results).length - failed}/${Object.keys(results).length} passed`);
await browser.close();
process.exit(failed ? 1 : 0);
