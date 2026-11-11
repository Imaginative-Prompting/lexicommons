// A lesson's idea and its English, on a phone in Chrome (study/session.js, study/after-answer.js conceptView, study/reword.js), as a new learner.
// An idea lesson's "One idea" step is the idea's card: its picture drawn on the sentence. Before it, no Idea button; after it, one on every
// step the planner marks (step.idea), opening that card over the step, with nothing graded and the step as it was; Escape closes it. A
// sentence whose English rewords it says so on its card (Not word for word) and its answer shows the word-for-word line, and why when its
// notes say; one that doesn't rewords shows neither; a translate step's answer gives its English. Until the planner marks steps itself,
// the check marks them as it will (every step after the idea's meet; it says which it used).
// LOCAL only, path-nl seeded. node scripts/concept-lesson-check.mjs http://localhost:<port> <outDir> [--theme paper]
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
const { chromium } = await import("./quiet-browser.mjs");

const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
if (!BASE || !outArg || !/^http:\/\/localhost/.test(BASE)) {
  console.error("Usage: concept-lesson-check.mjs http://localhost:<port> <outDir> [--theme paper] (LOCAL only: it signs up accounts)");
  process.exit(2);
}
const THEME = argv.includes("--theme") ? argv[argv.indexOf("--theme") + 1] : "graphite";
const OUT = resolve(outArg);
mkdirSync(join(OUT, "shots"), { recursive: true });
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

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: THEME === "paper" ? "light" : "dark" });
// The planner's step.idea, as it will set it: every step after the idea's meet, unless the planner has set it already.
let planted = 0;
await context.route(/\/js\/study\/lesson\.js(\?|$)/, async (route) => {
  const response = await route.fetch();
  let text = await response.text();
  if (!text.includes("export function lessonSteps(")) return route.fulfill({ response, body: text });
  planted++;
  text = text.replace("export function lessonSteps(", "function lessonStepsPlanned(");
  // And step.also on a reworded sentence's translate step, as the planner will set it: the word-for-word English in its order, its words
  // among the tiles. (The planner sets it only where that English is acceptable; here every reworded one, to see the game take it.)
  text = `import { rewordingOf as __rewording } from "./reword.js";\n` + text;
  text += `
export function lessonSteps(lesson, ...rest) {
  const steps = lessonStepsPlanned(lesson, ...rest);
  if (!steps.some((step) => step.idea)) {
    const at = steps.findIndex((step) => step.kind === "meet" && step.concept);
    if (at >= 0) for (const step of steps.slice(at + 1)) step.idea = { pattern: steps[at].concept.pattern, name: steps[at].concept.name, line: steps[at].concept.line, item: steps[at].item?.id, planted: true };
  }
  if (!steps.some((step) => step.also)) {
    for (const step of steps) {
      if (step.kind !== "translate" || !step.item || !Array.isArray(step.tiles)) continue;
      const reworded = __rewording(step.item);
      if (!reworded) continue;
      const also = reworded.line.flatMap(([text]) => String(text).split(/\\s+/)).filter(Boolean);
      const tiles = [...step.tiles];
      for (const word of also) if (tiles.filter((one) => one === word).length < also.filter((one) => one === word).length) tiles.push(word);
      step.also = also;
      step.tiles = tiles;
      step.alsoPlanted = true;
    }
  }
  return steps;
}
`;
  return route.fulfill({ response, body: text, headers: { ...response.headers(), "content-type": "text/javascript" } });
});
const page = await context.newPage();
page.on("pageerror", (error) => console.log(`  pageerror: ${error.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
await page.goto(`${BASE}/app/`);
await page.waitForURL(/\/login\?next=/);
await page.click("summary");
await page.fill('input[name="name"]', "Concept Lessons");
await page.click('#register button[type="submit"]');
await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
await page.waitForSelector("html[data-app-ready]");
if (THEME !== "graphite") await page.evaluate((t) => (document.documentElement.dataset.theme = t), THEME);
const ready = await page.evaluate(async () => {
  const content = await import("/js/study/content.js");
  for (let waited = 0; waited < 90_000; waited += 400) {
    if (content.ITEMS.some((item) => item.pack === "path-nl")) break;
    await new Promise((r) => setTimeout(r, 400));
  }
  const notes = await import("/js/study/notes.js");
  await notes.notesReady([...new Set(content.ITEMS.map((item) => item.pack))]).catch(() => {});
  return content.ITEMS.some((item) => item.pack === "path-nl");
});
if (!ready) {
  console.log("FAIL  path-nl never came: seed it (scripts/packs/seed-local.mjs --default)");
  process.exit(2);
}

// The step up now: { kind, item, idea, reworded (study/reword.js on its sentence), means }.
const stepNow = () =>
  page.evaluate(async () => {
    // The live session, never a picture of a page (page-slide.js's data-ghost copy has no step).
    const root = document.querySelector('[data-part="session"]:not([data-ghost])');
    const step = root?.lxStep;
    if (!step) return null;
    const { rewordingOf } = await import("/js/study/reword.js");
    const { notesNow } = await import("/js/study/notes.js");
    const reworded = step.item?.literal && step.item.means ? rewordingOf(step.item, notesNow(step.item)) : null;
    return { kind: step.kind, item: step.item?.id ?? null, means: step.item?.means ?? null, idea: step.idea ?? null, reworded: reworded ? { line: reworded.line.map(([t]) => t).join(" "), note: reworded.note } : null };
  });
const button = async (name) => {
  const b = page.getByRole("button", { name, exact: false }).last();
  return (await b.count()) && (await b.isVisible()) ? b : null;
};
// On to the next step: I don't know, then Continue. Returns the answer bar's text in between.
async function skipStep({ shot = null } = {}) {
  let answer = null;
  const skip = await button("I don't know");
  if (skip) {
    await skip.click();
    await page.waitForTimeout(500);
    answer = await page.locator('[data-part="answer-bar"]').innerText();
    if (shot) {
      await page.waitForTimeout(500);
      await page.screenshot({ path: shot });
    }
  }
  const go = (await button("Continue")) ?? (await button("See how it went"));
  if (!go) return { answer, moved: false };
  await go.click();
  await page.waitForTimeout(700);
  return { answer, moved: true };
}
const openLesson = async (id) => {
  await page.evaluate((id) => (location.hash = `#study/session/lesson/${encodeURIComponent(id)}`), id);
  await page.waitForSelector('[data-part="session"][data-step]', { timeout: 30_000 });
  await page.waitForTimeout(900);
};
const ideaButton = () => page.locator('[data-part="session-idea"]');
const evidenceCount = () => page.evaluate(async () => (await import("/js/study/progress.js")).allEvidence().length);

// ---------- an idea lesson ----------
await openLesson("path-nl/idea-possessive");
let meetAt = null;
await stage("before the idea's met, no Idea button", async () => {
  for (let n = 0; n < 6; n++) {
    const now = await stepNow();
    if (now.kind === "meet") {
      meetAt = n;
      return `the idea comes at step ${n + 1}`;
    }
    assert(await ideaButton().isHidden(), `the Idea button shows on step ${n + 1} (${now.kind}), before the idea`);
    await skipStep();
  }
  throw new Error("no meet step in the first 6");
});
await stage("the idea, met, is its card: its picture drawn on the sentence it's met on", async () => {
  assert(meetAt !== null, "never reached the idea");
  const card = page.locator('[data-part="session"] .lx-idea-card');
  await card.waitFor({ timeout: 5_000 });
  assert(await card.locator(".lx-rule .lx-rule-line").count(), "no picture on the idea's card");
  const name = await card.locator(".lx-concept-name").innerText();
  assert(name.length > 3, `its name: "${name}"`);
  assert(!(await card.locator(".lx-concept-level").count()), "How you're doing on a first meeting");
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUT, "shots", "01-one-idea.png") });
  await skipStep();
  return name;
});
let ideaName = null;
await stage("after it, the Idea button on every step", async () => {
  const seen = [];
  for (let n = 0; n < 4; n++) {
    const now = await stepNow();
    if (!now || now.kind === "meet") break;
    assert(now.idea, `step ${n + 1} after the idea (${now.kind}) has no idea marked`);
    assert(await ideaButton().isVisible(), `no Idea button on ${now.kind}`);
    const label = await ideaButton().getAttribute("aria-label");
    assert(label === `See the idea again: ${now.idea.name}`, `its label: ${label}`);
    ideaName = now.idea.name;
    seen.push(now.kind);
    if (n < 3) await skipStep();
  }
  const box = await ideaButton().evaluate((node) => {
    const own = node.getBoundingClientRect();
    const reach = getComputedStyle(node, "::before");
    const inset = parseFloat(reach.top);
    return { w: own.width - 2 * Math.min(0, parseFloat(reach.left)), h: own.height - 2 * Math.min(0, inset) };
  });
  assert(box.w >= 44 && box.h >= 44, `its reach is ${box.w}×${box.h}`);
  await page.screenshot({ path: join(OUT, "shots", "02-idea-button.png") });
  const from = (await stepNow()).idea.planted ? "planted by this check (the planner doesn't mark steps yet)" : "the planner's";
  return `${seen.join(", ")}; step.idea ${from}`;
});
await stage("a press opens the idea's card over the step; nothing graded, Escape closes it, the step as it was", async () => {
  const before = { step: await stepNow(), evidence: await evidenceCount(), index: await page.locator('[data-part="session"]').getAttribute("data-item") };
  await ideaButton().click();
  const sheet = page.locator('[role="dialog"][data-part="sheet"]').last();
  await sheet.waitFor({ timeout: 5_000 });
  await page.waitForTimeout(900);
  const label = await sheet.getAttribute("aria-label");
  assert(label && label.length > 2, "the sheet has no name");
  // The lesson's own words for the idea (the parts met so far), never the catalog's.
  if (before.step.idea?.name) assert(label === before.step.idea.name, `the sheet is "${label}", the step's idea "${before.step.idea.name}"`);
  if (before.step.idea?.line) assert((await sheet.innerText()).includes(before.step.idea.line), `the sheet doesn't say the step's line: "${before.step.idea.line}"`);
  assert(await sheet.locator(".lx-rule .lx-rule-line").count(), "no picture in the sheet");
  // Its shape draws in after its words, about 1.4 s after the sheet comes up: the still waits for it to finish.
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(OUT, "shots", "03-idea-again.png") });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".lx-sheet-layer:not([hidden])"), null, { timeout: 5_000 });
  const after = { step: await stepNow(), evidence: await evidenceCount(), index: await page.locator('[data-part="session"]').getAttribute("data-item") };
  assert(after.evidence === before.evidence, `the press recorded ${after.evidence - before.evidence} answers`);
  assert(after.index === before.index && after.step.kind === before.step.kind, "the step changed under the sheet");
  assert(await page.locator('[data-part="session"]').count(), "the session ended");
  return `"${label}"`;
});
await stage("the control: a lesson with no idea has no Idea button", async () => {
  await page.evaluate(() => document.querySelector('[data-part="session"] [data-part="icon-button"]')?.click());
  await page.waitForTimeout(800);
  await openLesson("path-nl/l002");
  for (let n = 0; n < 5; n++) {
    assert(await ideaButton().isHidden(), `an Idea button on lesson 2's step ${n + 1}`);
    await skipStep();
  }
});

// ---------- the English, and Not word for word ----------
await stage("a reworded sentence says so on its card; its word-for-word English is right too; its answer gives word for word and why before any idea; one that isn't reworded, none of it", async () => {
  let reworded = 0;
  let plain = 0;
  let alsoRight = null;
  for (let n = 0; n < 18 && (reworded < 1 || plain < 2 || alsoRight === null); n++) {
    const now = await stepNow();
    if (!now) break;
    if (now.kind !== "translate" || !now.item) {
      await skipStep();
      continue;
    }
    const tag = await page.locator('[data-part="step-tag"][data-variant="reword"]').count();
    assert(Boolean(tag) === Boolean(now.reworded), `${now.item} ("${now.means}") ${now.reworded ? "rewords it, with no tag" : "has the tag, and doesn't reword it"}`);
    const also = await page.evaluate(() => document.querySelector('[data-part="session"]')?.lxStep?.also ?? null);
    if (now.reworded && also?.length && alsoRight === null) {
      await page.screenshot({ path: join(OUT, "shots", "04-not-word-for-word.png") });
      // The word-for-word order, tile by tile from the bank: right, not "Not quite".
      for (const word of also) {
        await page.locator(`[data-part="session"] [data-part="arrange"] > :not([data-part="arrange-key"]) [data-part="tile"][data-word="${word}"]:not([data-state="used"])`).last().click();
        await page.waitForTimeout(120);
      }
      await (await button("Check")).click();
      await page.waitForTimeout(800);
      const bar = (await page.locator('[data-part="answer-bar"]').innerText()).replace(/\s+/g, " ");
      assert(/\bRight\b/.test(bar) && !/Not quite/.test(bar), `"${also.join(" ")}" for ${now.item} wasn't right: ${bar.slice(0, 160)}`);
      assert(bar.includes(`Word for word: ${now.reworded.line}`), `the answer doesn't give "Word for word: ${now.reworded.line}"`);
      const order = await page.evaluate(() => {
        const bar = document.querySelector('[data-part="answer-bar"]');
        const reword = bar?.querySelector('[data-part="reword"]');
        const idea = bar?.querySelector('[data-part="concept-row"]');
        return reword && idea ? Boolean(reword.compareDocumentPosition(idea) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
      });
      assert(order !== false, "the idea's row comes before what the sentence shows");
      await page.screenshot({ path: join(OUT, "shots", "05-word-for-word-right.png") });
      const planted = await page.evaluate(() => document.querySelector('[data-part="session"]')?.lxStep?.alsoPlanted);
      alsoRight = `"${also.join(" ")}" right for ${now.item} (${planted ? "step.also planted by this check" : "the planner's step.also"})${order === null ? ", no idea row on it" : ", word for word before the idea's row"}`;
      reworded++;
      const go = (await button("Continue")) ?? (await button("See how it went"));
      await go.click();
      await page.waitForTimeout(700);
      continue;
    }
    const { answer } = await skipStep({ shot: now.reworded && !reworded ? join(OUT, "shots", "05-reworded-answer.png") : null });
    assert(answer, `no answer for ${now.item}`);
    assert(answer.includes(now.means), `the answer to ${now.item} doesn't give its English, "${now.means}": ${answer.replace(/\s+/g, " ").slice(0, 160)}`);
    if (now.reworded) {
      assert(answer.includes(`Word for word: ${now.reworded.line}`), `the answer to ${now.item} doesn't give "Word for word: ${now.reworded.line}"`);
      if (now.reworded.note) assert(answer.includes(now.reworded.note), `the answer doesn't give why: "${now.reworded.note}"`);
      reworded++;
    } else {
      assert(!/Word for word/.test(answer), `${now.item} isn't reworded, and its answer says word for word`);
      plain++;
    }
  }
  assert(reworded >= 1 && plain >= 1, `met ${reworded} reworded and ${plain} plain translate steps`);
  assert(alsoRight, "no reworded translate step with a word-for-word order to build");
  return `${reworded} reworded, ${plain} plain; ${alsoRight}`;
});

// Study cards say it too, as every other game does (session.js cardStep): a reworded sentence's card carries Not word for word, one that
// isn't none; with the card's English off (Settings → Study cards), none, as there's no English on it to reword.
// Study cards' own session (quick-play.js: #study/session/cards), opened fresh as app-check's goFresh opens a game.
const studyCards = async () => {
  await page.goto(`${BASE}/app/#study`);
  await page.waitForFunction(() => location.hash === "#study" && !document.querySelector('[data-part="session"]:not([data-ghost])'), null, { timeout: 15_000 });
  await page.goto(`${BASE}/app/#study/session/cards`);
  await page.waitForFunction(() => document.querySelector('[data-part="session"]:not([data-ghost])')?.lxStep?.kind === "card", null, { timeout: 15_000 });
  await page.waitForTimeout(400);
};
const nextCard = async () => {
  await (await button("Show meaning"))?.click();
  await page.waitForTimeout(250);
  const go = (await button("I knew it")) ?? (await button("Continue")) ?? (await button("See how it went"));
  if (!go) return false;
  await go.click();
  await page.waitForTimeout(600);
  return true;
};
await stage("Study cards say it too: a reworded sentence's card has Not word for word on it, one that isn't none; with the card's English off, none", async () => {
  await studyCards();
  let reworded = 0;
  let plain = 0;
  for (let n = 0; n < 14 && (reworded < 1 || plain < 1); n++) {
    const now = await stepNow();
    if (!now || now.kind !== "card") break;
    const tag = await page.locator('[data-part="session"]:not([data-ghost]) [data-part="study-card"] [data-part="step-tag"][data-variant="reword"]').count();
    assert(Boolean(tag) === Boolean(now.reworded), `the card of ${now.item} ("${now.means}") ${now.reworded ? "rewords it, with no tag" : "has the tag, and doesn't reword it"}`);
    if (now.reworded && !reworded) await page.screenshot({ path: join(OUT, "shots", "06-study-card-reworded.png") });
    if (now.reworded) reworded++;
    else plain++;
    if (!(await nextCard())) break;
  }
  assert(reworded >= 1 && plain >= 1, `met ${reworded} reworded and ${plain} plain cards`);
  // The card's English off: its sentence's English isn't shown, so nothing says it rewords.
  await page.evaluate(async () => (await import("/js/study/settings.js")).setStudySetting("cards.natural", false));
  await studyCards();
  let checked = 0;
  for (let n = 0; n < 14 && checked < 4; n++) {
    const now = await stepNow();
    if (!now || now.kind !== "card") break;
    const tag = await page.locator('[data-part="session"]:not([data-ghost]) [data-part="step-tag"][data-variant="reword"]').count();
    assert(!tag, `with the card's English off, ${now.item}'s card still says Not word for word`);
    checked++;
    if (!(await nextCard())) break;
  }
  await page.evaluate(async () => (await import("/js/study/settings.js")).setStudySetting("cards.natural", true));
  assert(checked >= 1, "no card met with the English off");
  return `${reworded} reworded and ${plain} plain cards, each as it should be; ${checked} with the English off, no tag`;
});

console.log(`  (lesson.js routed ${planted} time${planted === 1 ? "" : "s"})`);
await page.evaluate(() => fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).catch(() => {});
await browser.close();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
