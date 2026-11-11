// A pack's plain items in daily study, on a phone, from a brand-new account (study/deck.js plainOfDay, plan.js, session.js): a pack of your own waits for the first lesson, then its new
// items are met and asked in Practice, a miss coming back, and the end of it names them; an imported deck's new cards stay out, and what you've played comes back when it's due, in
// Practice and Reviews, with Home counting it; Choose the games from inside a session swaps a plain card's game; a round of Match takes one; nothing's left with no way forward.
// LOCAL only: it signs up a real account, deleted at the end; the local library must have path-nl (scripts/packs/seed-local.mjs --default), else exit 2.
// Usage: node scripts/plain-day-check.mjs http://localhost:<port> <outDir>   (exit 0 = pass)
import { chromium } from "./quiet-browser.mjs";
import { pastReminderAsk } from "./fixtures/play-session.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [BASE, outArg] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/plain-day-check.mjs http://localhost:<port> <outDir> (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const catalogue = await (await fetch(`${BASE}/library/catalogue.json`)).json().catch(() => ({}));
if (!(catalogue.packs?.nl ?? []).some((pack) => pack.id === "path-nl")) {
  console.error("plain-day-check: the local library doesn't list path-nl; seed it first.");
  process.exit(2);
}
const browser = await chromium.launch({ headless: true, args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
const results = {};
const assert = (cond, what) => {
  if (!cond) throw new Error(what);
};
// A stage this server can't hold (say why, never pass quietly): throw new Skip(why).
class Skip extends Error {}
async function stage(name, fn) {
  try {
    const note = await fn();
    results[name] = { ok: true, note };
    console.log(`PASS ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    if (error instanceof Skip) {
      results[name] = { ok: true, skipped: true, note: error.message };
      console.log(`SKIP ${name}: ${error.message}`);
      return;
    }
    results[name] = { ok: false, note: String(error.stack ?? error) };
    console.log(`FAIL ${name}: ${error.message}`);
    await page.screenshot({ path: `${OUT}/fail-${Object.keys(results).length}.png` }).catch(() => {});
    if (await page.locator('[data-part="session"]').count()) await page.locator('[data-part="session"] [aria-label="End session"]').click().catch(() => {});
  }
}
const SESSION = '[data-part="session"]';
const session = page.locator(SESSION);
const settle = (ms = 300) => page.waitForTimeout(ms);
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clean = (text) => text.replace(/\s+/g, " ").trim();
const summary = () => page.locator(`${SESSION} [data-part="session-summary"]`);
const go = async (hash) => {
  await page.evaluate((to) => (location.hash = to), hash);
  await settle(350);
};
const bar = () => page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`);

const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Plain Day Check");
await page.click('#register button[type="submit"]');
await page.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
await page.waitForSelector("html[data-app-ready]");
await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());

const items = (words) => words.map(([text, means], i) => ({ id: `c${i}`, text, means }));
const packOf = (id, name, words, more = {}) => ({ format: "lexicommons-pack", version: 2, id, name, language: "nl", from: "en", topics: {}, words: {}, chunks: {}, patterns: {}, items: items(words), ...more });
const MINE = packOf("mijn-kaarten", "Mijn kaarten", [["de zolder", "the attic"], ["de kelder", "the cellar"], ["het dak", "the roof"], ["de schoorsteen", "the chimney"], ["de vliering", "the loft"], ["de dakgoot", "the gutter"]]);
const DECK = packOf("anki-check-deck-abc", "Check deck", [["de vos", "the fox"], ["de das", "the badger"], ["de egel", "the hedgehog"], ["de otter", "the otter"], ["de wezel", "the weasel"], ["het hert", "the deer"], ["de haas", "the hare"], ["de bever", "the beaver"], ["de marter", "the marten"], ["de mol", "the mole"], ["de muis", "the mouse"], ["de rat", "the rat"], ["de uil", "the owl"], ["de arend", "the eagle"], ["de valk", "the falcon"], ["de reiger", "the heron"]]);
const save = (pack) => page.evaluate(async (value) => {
  const saved = await (await import("/js/study/packs.js")).savePack(value);
  if (!saved.ok) throw new Error(JSON.stringify(saved.errors?.slice(0, 2)));
  return true;
}, pack);
const setOn = (id, on) => page.evaluate(async ([one, value]) => (await import("/js/study/packs.js")).setPackOn(one, value), [id, on]);
const stateOf = (unit) => page.evaluate(async (one) => {
  const s = (await import("/js/study/progress.js")).unitState(one);
  return { reviews: s.reviews, met: s.met, isNew: s.isNew, due: s.due };
}, unit);

/** What's on the session now. */
const stepNow = () => page.evaluate((S) => {
  const step = document.querySelector(S)?.lxStep;
  return step ? { kind: step.kind, game: step.game, first: step.first, again: step.again, unit: step.unit, text: step.card?.text, means: step.card?.means, items: step.items, answers: step.answers, nl: step.item?.words?.map(([word]) => word), punct: step.item?.punct, natural: step.item?.means, answer: step.answer, correct: step.correct, gapIndex: step.gapIndex, entries: step.entries?.map((entry) => ({ text: entry.card.text, means: entry.card.means, unit: entry.unit })) } : null;
}, SESSION);

async function playDeck(step, { wrong = false } = {}) {
  const choice = session.locator('[data-part="choice"]');
  if (step.game === "card") {
    await page.getByRole("button", { name: "Show the other side" }).click();
    if (wrong && (await page.getByRole("button", { name: "Not yet" }).count())) await page.getByRole("button", { name: "Not yet" }).click();
    else await page.getByRole("button", { name: /^(Continue|I knew it)$/ }).click();
    return;
  }
  if (step.game === "choose" || step.game === "listen") {
    const texts = (await choice.allInnerTexts()).map((text) => text.trim());
    const right = texts.indexOf(step.means);
    assert(right >= 0, `${step.game}: ${step.means} isn't among ${texts}`);
    await choice.nth(wrong ? (right + 1) % texts.length : right).click();
  } else if (step.game === "type") {
    await session.locator('[data-part="text-field"]').fill(wrong ? "zzz" : step.text);
    await page.getByRole("button", { name: "Check", exact: true }).click();
  } else if (step.game === "arrange") {
    const order = step.text.trim().split(/\s+/);
    for (const word of wrong ? [...order].reverse() : order) await session.locator('[data-part="arrange-bank"] [data-part="tile"]:not([data-state="used"])', { hasText: new RegExp(`^${esc(word)}$`) }).first().click();
    await page.getByRole("button", { name: "Check", exact: true }).click();
  } else if (step.game === "match") {
    // Pairs from its own entries, each side by its whole text.
    const items = session.locator('[data-part="match-item"]');
    const whole = (text) => new RegExp(`^${esc(text)}$`);
    for (const entry of step.entries) {
      await items.filter({ hasText: whole(entry.text) }).first().click();
      await items.filter({ hasText: whole(entry.means) }).first().click();
    }
  } else throw new Error(`a plain step with no game: ${step.game}`);
  await bar().click();
}
// Anything else Practice asks: the plainest way through, right or wrong doesn't matter here.
async function playOther(step) {
  if (step.kind === "match") {
    for (const nl of await session.locator('[data-part="match-item"][data-side="nl"]').allTextContents()) {
      await session.locator('[data-part="match-item"][data-side="nl"]', { hasText: new RegExp(`^${esc(nl)}$`) }).click();
      await session.locator('[data-part="match-item"][data-side="en"]', { hasText: new RegExp(`^${esc(step.answers[nl])}$`) }).first().click();
    }
    await bar().click();
    return;
  }
  if (step.kind === "meet") return bar().click();
  const dontKnow = session.getByRole("button", { name: "I don't know" });
  if (await dontKnow.count()) await dontKnow.click();
  else if (await session.getByRole("button", { name: "Can't speak now" }).count()) {
    await session.getByRole("button", { name: "Can't speak now" }).click();
    await settle(150);
    return playOther(await stepNow());
  } else await session.locator('[data-part="choice"], [data-part="picture-choice"]').first().click();
  await bar().click();
}
/** Plays a session to its end. onStep sees each step; it returns { wrong } for a plain one. Returns what was asked. */
async function playToEnd(onStep = () => ({})) {
  const seen = [];
  for (let guard = 0; guard < 70; guard++) {
    if (await summary().count()) return seen;
    await settle(130);
    const step = await stepNow();
    if (!step) continue;
    seen.push(step);
    const told = (await onStep(step, seen)) ?? {};
    if (told.skip) continue;
    if (step.kind === "deck") await playDeck(step, told);
    else await playOther(step);
  }
  throw new Error(`it never ended: ${seen.map((step) => step.game ?? step.kind)}`);
}
const leaveSummary = async () => {
  await session.getByRole("button", { name: "Done", exact: true }).click();
  await pastReminderAsk(page);
  await page.waitForFunction(() => !document.querySelector('[data-part="session"]'));
  await settle(200);
};

await stage("a brand-new learner with a pack of their own: the first lesson is still the one thing", async () => {
  await save(MINE);
  await go("#study");
  await page.waitForSelector('[data-part="study-door"]');
  const doors = await page.locator('[data-part="study-door"]').evaluateAll((all) => all.map((door) => door.getAttribute("data-door")));
  assert(doors.join() === "lesson", `doors: ${doors}`);
  const study = await page.evaluate(async () => (await import("/js/study/plan.js")).studyOverview());
  assert(study.firstTime && !study.practice, JSON.stringify(study));
  return doors.join();
});

await stage("after a lesson, Practice meets two of its new items, each on a card that says so, then asks them further on; a miss comes back; the end names them", async () => {
  await go("#study/session/lesson");
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  await playToEnd();
  await leaveSummary();
  await go("#study");
  const doors = await page.locator('[data-part="study-door"]').evaluateAll((all) => all.map((door) => door.getAttribute("data-door")));
  assert(doors[0] === "practice", `doors: ${doors}`);
  await page.locator('[data-part="study-door"]').first().click();
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  let missed = null;
  let shownNew = 0;
  const seen = await playToEnd(async (step) => {
    if (step.kind !== "deck") return {};
    if (step.first) {
      const words = clean(await session.innerText());
      assert(words.includes(step.text), `the card doesn't show ${step.text}: ${words.slice(0, 200)}`);
      if (words.includes("New card")) shownNew++;
      if (!shownNew) await shot("plain-first-card");
    }
    if (!step.first && !missed && step.game !== "card") {
      missed = step.unit;
      return { wrong: true };
    }
    return {};
  });
  const plain = seen.filter((step) => step.kind === "deck");
  const units = [...new Set(plain.map((step) => step.unit))];
  assert(units.length === 2 && units.every((unit) => unit.startsWith("k:mijn-kaarten/")), `units: ${units}`);
  for (const unit of units) {
    const steps = plain.filter((step) => step.unit === unit);
    assert(steps[0].game === "card" && steps[0].first === true, `${unit} wasn't met first: ${JSON.stringify(steps.map((step) => step.game))}`);
    assert(steps.length >= 2, `${unit} wasn't asked`);
  }
  assert(shownNew === 2, `New card shown ${shownNew} times`);
  assert(missed, "nothing was missed, so a retry proves nothing");
  const again = plain.filter((step) => step.unit === missed);
  assert(again.length >= 3 && again.at(-1).again, `the miss didn't come back: ${JSON.stringify(again.map((step) => [step.game, step.again]))}`);
  await settle(400);
  await shot("plain-summary");
  const end = clean(await summary().innerText());
  assert(/Practice done/.test(end), end.slice(0, 200));
  const names = plain.map((step) => step.text);
  assert(names.some((text) => end.includes(text)), `the end doesn't name ${[...new Set(names)]}: ${end.slice(0, 400)}`);
  await leaveSummary();
  const after = await stateOf(units[0]);
  assert(after.reviews >= 1, JSON.stringify(after));
  return `${plain.length} plain steps of ${seen.length}: ${plain.map((step) => step.game)}`;
});

await stage("an imported deck: none of its new cards in Practice, though its own session has them", async () => {
  await setOn(MINE.id, false);
  await save(DECK);
  await go("#study/session/practice");
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  const seen = await playToEnd();
  assert(!seen.some((step) => step.kind === "deck"), `a new card from the deck: ${seen.filter((step) => step.kind === "deck").map((step) => step.unit)}`);
  await leaveSummary();
  await go(`#study/session/deck/${DECK.id}`);
  await page.waitForSelector(`${SESSION}[data-game]`, { timeout: 8000 });
  assert((await session.getAttribute("data-game")) === "card", "its own session starts somewhere else");
  await page.locator(`${SESSION} [aria-label="End session"]`).click();
  await settle(300);
  return `${seen.length} steps, none of the deck's`;
});

await stage("what you played of it, due: in Practice, Reviews, Home's count, and off, gone from all of it", async () => {
  const before = await page.evaluate(async () => (await import("/js/study/plan.js")).overview().dueAll);
  await page.evaluate(async (id) => {
    const { record } = await import("/js/study/progress.js");
    const at = Date.now() - 60 * 86_400_000;
    record(Array.from({ length: 16 }, (_, i) => ({ concept: `k:${id}/c${i}`, at: at + i, outcome: "right", test: "pick", skill: "read", activity: "choose", item: `${id}/c${i}` })));
  }, DECK.id);
  const info = await page.evaluate(async () => (await import("/js/study/plan.js")).overview());
  assert(info.dueAll === before + 16, `${before} then ${info.dueAll}`);
  // Off: gone from the count and from Practice. On again: back in it (Reviews and Practice below ask them). Each read once the switch has
  // reached what studying draws on, up to 4 s (read at once, the count was sometimes still the one before the switch: 7 Nov).
  const dueAll = () => page.evaluate(async () => (await import("/js/study/plan.js")).overview().dueAll);
  const settles = async (want) => {
    let now = await dueAll();
    for (let i = 0; i < 40 && now !== want; i++) {
      await settle(100);
      now = await dueAll();
    }
    return now;
  };
  await setOn(DECK.id, false);
  const off = await settles(before);
  assert(off === before, `off: ${off}, and it was ${before} before`);
  await setOn(DECK.id, true);
  const back = await settles(before + 16);
  assert(back === before + 16, `on again: ${back}, and it was ${before + 16} with it on`);
  await go("#study/session/reviews");
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  const reviews = await playToEnd();
  assert(reviews.some((step) => step.kind === "deck"), `Reviews has none: ${reviews.map((step) => step.kind)}`);
  await leaveSummary();
  await go("#study/session/practice");
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  const practice = await playToEnd();
  const plain = practice.filter((step) => step.kind === "deck");
  assert(plain.length >= 2, `Practice has ${plain.length}`);
  assert(plain.length <= Math.ceil((practice.length + 1) / 2) + 1, `${plain.length} of ${practice.length}: more than its share`);
  const round = practice.find((step) => step.kind === "match");
  await leaveSummary();
  return `${plain.length} of ${practice.length} in Practice; Match ${round ? `with ${round.items?.length ?? 0} of them` : "not in this one"}; the count ${before} → ${info.dueAll} → off ${off} → on ${back}`;
});

const MANY = packOf("anki-check-many-xyz", "Many cards", Array.from({ length: 60 }, (_, i) => [`woordje${i}`, `small word ${i}`]));
await stage("a round of Match with plain items in it: played, it counts for each of them, and a miss among them is named", async () => {
  // Plenty due, so some aren't asked by themselves.
  await save(MANY);
  await setOn(DECK.id, false);
  await page.evaluate(async (id) => {
    const { record } = await import("/js/study/progress.js");
    const at = Date.now() - 60 * 86_400_000;
    record(Array.from({ length: 60 }, (_, i) => ({ concept: `k:${id}/c${i}`, at: at + i, outcome: "right", test: "pick", skill: "read", activity: "choose", item: `${id}/c${i}` })));
  }, MANY.id);
  await go("#study/session/practice");
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  let missed = null;
  let others = [];
  let named = "";
  const seen = await playToEnd(async (step) => {
    if (step.kind !== "match") return {};
    assert(step.items?.length, `a round with none: ${JSON.stringify(step.items)}`);
    const nlSide = (text) => session.locator('[data-part="match-item"][data-side="nl"]', { hasText: new RegExp(`^${esc(text)}$`) });
    const enSide = (text) => session.locator('[data-part="match-item"][data-side="en"]', { hasText: new RegExp(`^${esc(text)}$`) }).first();
    const shown = (await session.locator('[data-part="match-item"][data-side="nl"]').allTextContents()).map((text) => text.trim());
    for (const item of step.items) assert(shown.includes(item.text), `${item.text} isn't on the grid: ${shown}`);
    [missed, ...others] = step.items;
    await shot("plain-in-match");
    // The plain one against a meaning that isn't its own, then the round played through.
    const wrong = Object.values(step.answers).find((means) => means !== missed.means);
    await nlSide(missed.text).click();
    await enSide(wrong).click();
    await settle(250);
    for (const nl of shown) {
      await nlSide(nl).click();
      await enSide(step.answers[nl]).click();
    }
    await settle(250);
    named = clean(await session.innerText());
    await bar().click();
    return { skip: true };
  });
  assert(missed, `no round of Match: ${seen.map((step) => step.game ?? step.kind)}`);
  assert(named.includes(missed.text) && named.includes(missed.means), `the miss isn't named: ${named.slice(0, 300)}`);
  const rows = await page.evaluate(async (units) => (await import("/js/study/progress.js")).allEvidence().filter((row) => units.includes(row.concept) && row.activity === "match").map((row) => [row.concept, row.outcome]), [missed.unit, ...others.map((item) => item.unit)]);
  assert(rows.some(([unit, outcome]) => unit === missed.unit && outcome === "wrong"), `the miss wasn't counted: ${JSON.stringify(rows)}`);
  assert(others.every((item) => rows.some(([unit, outcome]) => unit === item.unit && outcome === "right")), `the others: ${JSON.stringify(rows)}`);
  await leaveSummary();
  return `${1 + others.length} plain items in a round of ${seen.find((step) => step.kind === "match")?.answers ? Object.keys(seen.find((step) => step.kind === "match").answers).length : "?"}`;
});

await stage("Choose the games from inside a session: on a plain card, this question comes first; off, the same card by another game, and it doesn't come back", async () => {
  // A card with one review is asked by its card; with two, by a game there's something to swap for.
  await page.evaluate(async (id) => {
    const { record } = await import("/js/study/progress.js");
    const at = Date.now() - 59 * 86_400_000;
    record(Array.from({ length: 60 }, (_, i) => ({ concept: `k:${id}/c${i}`, at: at + i, outcome: "right", test: "pick", skill: "read", activity: "choose", item: `${id}/c${i}` })));
  }, MANY.id);
  await go("#study/session/practice");
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  let turnedOff = null;
  let after = null;
  const seen = await playToEnd(async (step) => {
    if (turnedOff || step.kind !== "deck" || step.first || step.game === "card") return {};
    await page.locator(`${SESSION} [aria-label="Choose the games"]`).click();
    await page.waitForSelector('.lx-sheet-layer [data-part="game-toggle"]');
    await settle(400);
    const first = clean(await page.locator('.lx-sheet-layer [data-part="game-toggle"]').first().innerText());
    assert(/This question/.test(first), `the first game: ${first}`);
    await page.locator('.lx-sheet-layer [data-part="game-toggle"]').first().click();
    await page.keyboard.press("Escape");
    await page.waitForFunction(([S, game]) => document.querySelector(S)?.getAttribute("data-game") !== game, [SESSION, step.game], { timeout: 1500 });
    await settle(300);
    const now = await stepNow();
    assert(now.unit === step.unit, `another card: ${step.unit} then ${now.unit}`);
    turnedOff = step.game;
    after = now.game;
    await playDeck(now);
    return { skip: true };
  });
  assert(turnedOff, `no plain question to swap: ${seen.map((step) => step.game ?? step.kind)}`);
  const at = seen.findIndex((step) => step.kind === "deck" && step.game === turnedOff);
  assert(!seen.slice(at + 1).some((step) => step.kind === "deck" && step.game === turnedOff), `${turnedOff} came back: ${seen.map((step) => step.game ?? step.kind)}`);
  await leaveSummary();
  return `${turnedOff} became ${after}`;
});

await stage("a language with only your own items: Practice, and no talk of lessons running out", async () => {
  // A language the server's library has no pack for (Finnish when it's free): `npm run local` seeds every starter in packs/, and Finnish's
  // has lessons, so on that server Finnish isn't "only your own items" and its first lesson is rightly what Study offers (6 Nov 2026).
  const lang = await page.evaluate(async () => {
    const catalogue = await (await fetch("/library/catalogue.json")).json();
    const { allPacks } = await import("/js/study/packs.js");
    const taken = new Set([...Object.keys(catalogue?.packs ?? {}).filter((code) => catalogue.packs[code]?.length), ...allPacks().map((pack) => pack.language)]);
    return ["fi", "et", "hu", "lt", "lv", "sk", "sl", "is", "ga", "eu", "mt", "sq", "ro", "hr", "az", "ms", "eo"].find((code) => !taken.has(code)) ?? null;
  });
  // `npm run local` seeds every starter, so its library has no such language: said, not passed (this stage needs a copy seeded pack by pack).
  if (!lang) throw new Skip("every language this stage can use has a pack in this library or on this device (npm run local seeds every starter): run it on a copy seeded pack by pack with seed-local.mjs");
  await page.evaluate(async (lang) => {
    (await import("/js/study/settings.js")).resetStudySettings();
    const { savePack } = await import("/js/study/packs.js");
    await savePack({ format: "lexicommons-pack", version: 2, id: "my-own-words", name: "My own words", language: lang, from: "en", topics: {}, words: {}, chunks: {}, patterns: {}, items: [["talo", "house"], ["koira", "dog"], ["kissa", "cat"], ["vesi", "water"], ["kirja", "book"]].map(([text, means], i) => ({ id: `c${i}`, text, means })) });
    (await import("/js/study/learning.js")).setLearning(lang);
  }, lang);
  await settle(400);
  const lesson = await page.evaluate(async () => (await import("/js/study/plan.js")).studyOverview().lesson);
  assert(!lesson, `${lang} has a lesson to offer: ${JSON.stringify(lesson)}`);
  await go("#study");
  await page.waitForSelector('[data-part="study-door"]', { timeout: 8000 });
  const words = clean(await page.locator('[data-part="page"]').last().innerText());
  assert(!/done every/i.test(words), words.slice(0, 300));
  await shot("plain-only-language");
  await page.locator('[data-part="study-door"]').first().click();
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  const seen = await playToEnd();
  assert(seen.filter((step) => step.kind === "deck").length >= 4, seen.map((step) => step.kind).join());
  await leaveSummary();
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  return `${lang}: ${seen.length} steps`;
});

await stage("a card that exactly is a word counts toward that word, played on screen; one with another meaning doesn't; a round of Match counts it too", async () => {
  const before = await stateOf("w:koffie");
  const WORD = packOf("mijn-woord", "Mijn woord", [["koffie", "coffee"], ["water", "lava"], ["de zolderkamer", "the attic room"], ["melk", "milk"]]);
  await page.evaluate(async () => (await import("/js/study/learning.js")).setLearning("nl"));
  await settle(300);
  await save(WORD);
  await go(`#study/session/deck/${WORD.id}`);
  await page.waitForSelector(`${SESSION}[data-game]`, { timeout: 8000 });
  const seen = await playToEnd();
  await settle(200);
  const rows = await page.evaluate(async (id) => (await import("/js/study/progress.js")).allEvidence().filter((row) => String(row.item ?? "").startsWith(`${id}/`)).map((row) => [row.concept, row.outcome, row.activity]), WORD.id);
  const units = new Set(rows.map(([unit]) => unit));
  assert(units.has(`k:${WORD.id}/c0`) && units.has("w:koffie"), `koffie: ${[...units]}`);
  assert(!units.has("w:water"), `water means lava here: ${[...units]}`);
  assert(units.has(`k:${WORD.id}/c1`), `its own unit: ${[...units]}`);
  const after = await stateOf("w:koffie");
  assert(after.met + after.reviews > before.met + before.reviews, `koffie's state: ${JSON.stringify([before, after])}`);
  // The deck's own round of Match, when this session had one with it in.
  const round = seen.find((step) => step.game === "match" && step.entries?.some((entry) => entry.text === "koffie"));
  if (round) assert(rows.some(([unit, , activity]) => unit === "w:koffie" && activity === "match"), `Match didn't count: ${JSON.stringify(rows)}`);
  if (await summary().count()) await leaveSummary();
  return `${[...units].join(", ")} from ${seen.length} steps${round ? ", a round of Match among them" : ", no round of Match this time"}`;
});

await stage("a word-order slip on screen: Word order got wrong marks what's about the order, and leaves what's about a form alone; a coach still sees the miss", async () => {
  await page.evaluate(async () => {
    (await import("/js/study/settings.js")).resetStudySettings();
    (await import("/js/study/settings.js")).setStudySetting("arrange.tiles", "dutch");
    (await import("/js/study/settings.js")).setStudySetting("arrange.stray", false);
  });
  await go("#study/session/game/arrange");
  await page.waitForSelector(`${SESSION}[data-step]`, { timeout: 8000 });
  // Whatever Word order it serves first: every tile, in reverse, then Check.
  const served = await page.evaluate((S) => {
    const step = document.querySelector(S).lxStep;
    return { id: step.item?.id, concepts: step.item?.concepts, words: step.item?.words?.map(([text]) => text) };
  }, SESSION);
  for (const word of [...served.words].reverse()) await session.locator('[data-part="arrange-bank"] [data-part="tile"]:not([data-state="used"])', { hasText: new RegExp(`^${esc(word)}$`) }).first().click();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await settle(300);
  const rows = await page.evaluate(async (id) => (await import("/js/study/progress.js")).allEvidence().filter((row) => row.item === id && row.activity === "arrange" && row.concept.startsWith("p:")).map((row) => [row.concept.slice(2), row.outcome, row.slip === true]), served.id);
  const isForm = await page.evaluate(async (ids) => {
    const { conceptKind } = await import("/js/lang/form-concepts.js");
    return Object.fromEntries(ids.map((id) => [id, conceptKind("nl", id) === "form"]));
  }, served.concepts);
  for (const [id, outcome] of rows) if (isForm[id]) assert(outcome === "met", `${id} is about a form, and it's ${outcome}: ${JSON.stringify(rows)}`);
  const about = rows.filter(([id]) => !isForm[id]);
  if (about.length) assert(about.every(([, outcome]) => outcome === "wrong"), `what's about the order: ${JSON.stringify(rows)}`);
  else assert(rows[0]?.[2] === true, `a slip blaming nothing is marked, so a coach still sees it: ${JSON.stringify(rows)}`);
  await page.evaluate(async () => (await import("/js/study/settings.js")).resetStudySettings());
  await page.locator(`${SESSION} [aria-label="End session"]`).click().catch(() => {});
  await settle(300);
  return JSON.stringify(rows);
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
