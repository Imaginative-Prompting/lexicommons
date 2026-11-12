// Checks what the app knows about you, end to end in headless Chrome on a LOCAL server (it creates and deletes a test
// account, so never point it at the live site): the scheduler on a real device (evidence from past days → what's due,
// the quick session's retries and the games it picks for the strength that's due, the predictions kept on new rows);
// Today (the date, Translate either way and asking your AI when it finds nothing, the next step, your progress, keep
// going, this week); the Knowledge page's cards on that evidence (know/page.js: drawn in order; Everyday's share and the
// list's credit when the server's open library has the frequency list, its thousand with a word from your reading in ink;
// Over time's gain, read · by ear · say and the week ahead on its page; this week; the ideas; search; what's slipping; a
// word's and a pattern's page); sessions started there going back there; the fourth tab (Practice or Know); Settings → Study → Remembering;
// and what get_learner would send your AI. Fails on any console error. Chrome runs muted: nothing is heard.
//
// Local server: see AGENTS.md (wrangler dev with --local-upstream and its own --persist-to).
// Usage (headless Chrome, so through the channel's GPU queue, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "knowledge check" --kind stills -- \
//     node 08-lexicommons/app/scripts/knowledge-check.mjs http://localhost:<port> <outDir> [--list <frequency.nl.json>]

import { wordsPoint } from "./fixtures/words-point.mjs";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { fillChoice, ownText } from "./fixtures/step-text.mjs";
import { answerStep, nextStep } from "./fixtures/play-session.mjs";
import { goRouted } from "./fixtures/routed.mjs";

const argv = process.argv.slice(2);
const [BASE, OUT = "knowledge-check-out"] = argv.filter((arg, i) => !arg.startsWith("--") && argv[i - 1] !== "--list");
// --list <frequency.nl.json>: a server without Dutch's frequency list serves this one (as study-check does), so Everyday's stages run.
const LIST = argv.includes("--list") ? argv[argv.indexOf("--list") + 1] : null;
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("knowledge-check creates and deletes an account: give it a local server, e.g. http://localhost:8824");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });

const results = [];
const problems = [];
async function stage(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - started, detail });
    console.log(`ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ stage: name, ok: false, ms: Date.now() - started, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
if (LIST && !(await (await fetch(`${BASE}/library/catalogue.json`)).json().catch(() => ({}))).lists?.frequency?.nl) {
  await context.route("**/library/catalogue.json", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.lists = { ...(body.lists ?? {}), frequency: { ...(body.lists?.frequency ?? {}), nl: { url: "/__freq.nl.json" } } };
    await route.fulfill({ response, json: body });
  });
  await context.route("**/__freq.nl.json", (route) => route.fulfill({ contentType: "application/json", body: readFileSync(LIST) }));
}
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const SESSION = '[data-part="session"]:not([data-ghost])';
// Text nodes that are just "null" or "undefined" (an empty slot put in raw), collected at every screenshot.
const strayText = [];
const shot = async (name, options = {}) => {
  const found = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (/^\s*(null|undefined)\s*$|\[object \w+\]/.test(node.textContent)) hits.push(node.parentElement?.getAttribute("data-part") ?? node.parentElement?.tagName);
    return hits;
  });
  for (const where of found) strayText.push(`${name}: in ${where}`);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
  await page.screenshot({ path: join(OUT, "shots", `${name}.png`), ...options });
};
const DAY = 86_400_000;
// An element's screenshot, once every animation has ended (a session's exit fades out over the page).
const shotOf = async (locator, name) => {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
  await locator.screenshot({ path: join(OUT, "shots", `${name}.png`) });
};
// A link's hash changes a moment before the app renders the new page: wait for the page itself.
const pageSays = (text) => page.waitForFunction((t) => document.querySelector('[data-part="page"]')?.textContent.includes(t), text);
// A page of the Knowledge page's own, by its address and title (its card on the page before has the same words).
const opened = (hash, title) =>
  page.waitForFunction(([h, t]) => location.hash === h && document.querySelector('[data-part="page"] [data-part="page-title"]')?.textContent === t, [hash, title]);
const headerSays = (text) => page.waitForFunction((t) => document.querySelector('[data-part="app-header"]')?.textContent.includes(t), text);

// ---------- sessions, played by scripts/fixtures/play-session.mjs (each step by its kind, never its words) ----------

let CONTENT = null;
const content = () => page.evaluate(async () => {
  const c = await import("/js/study/content.js");
  return { items: c.ITEMS.map((i) => ({ ...i, sentence: c.sentence(i) })), words: c.WORDS };
});

// ---------- the run ----------

await stage("sign up with a passkey, land in the app", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Knowledge Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  CONTENT = await content();
  return `signed in; ${CONTENT.items.length} starter items`;
});

// Two weeks of studying, written as evidence on the device the way the games write it, then a fresh start of the app.
const NOW = Date.now();
await stage("evidence from past days: what's due, and a sentence missed yesterday comes back first", async () => {
  await page.evaluate(async (now) => {
    const { record } = await import("/js/study/progress.js");
    const { ITEMS, conceptsOf } = await import("/js/study/content.js");
    const step = (id, at, { activity, test, skill, outcome = "right", words = "met" }) => {
      const item = ITEMS.find((i) => i.id === id);
      record(conceptsOf(item).map((concept) => ({ concept, at, outcome: concept.startsWith("w:") ? words : outcome, test, skill, activity, item: id })));
    };
    const day = 86_400_000;
    // Typed two weeks ago: saying (and reading, carried) is due now.
    step("boek-gelezen", now - 14 * day, { activity: "type", test: "recall", skill: "say", words: "right" });
    // Heard and typed two weeks ago: hearing is due now.
    step("wil-lezen", now - 14 * day, { activity: "listen-type", test: "recall", skill: "hear", words: "right" });
    // Placed wrong yesterday: the same sentence, the same game, first.
    step("vader-thuis", now - day, { activity: "place", test: "build", skill: "read", outcome: "wrong" });
  }, NOW);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const plan = await page.evaluate(async () => {
    const { planSession, overview } = await import("/js/study/plan.js");
    const p = planSession("quick");
    return { overview: overview(), steps: p.steps.map((s) => ({ kind: s.kind, mode: s.mode, skill: s.skill, again: s.again, item: s.item?.id, meaning: s.meaning })) };
  });
  assert(plan.steps[0].again && plan.steps[0].item === "vader-thuis" && plan.steps[0].kind === "place", `first step ${JSON.stringify(plan.steps[0])}`);
  const boek = plan.steps.find((s) => s.item === "boek-gelezen");
  assert(boek && ["say", "read"].includes(boek.skill), `boek-gelezen ${JSON.stringify(boek)}`);
  const wil = plan.steps.find((s) => s.item === "wil-lezen");
  assert(wil && wil.kind === "listen" && wil.skill === "hear", `wil-lezen ${JSON.stringify(wil)}`);
  writeFileSync(join(OUT, "plan.json"), JSON.stringify(plan, null, 2));
  await page.locator('[data-part="tab"]', { hasText: "Study" }).first().click();
  await page.waitForSelector('[data-part="study-door"][data-door="practice"]');
  const meta = await page.locator('[data-part="study-door"][data-door="practice"]').textContent();
  const practice = await page.evaluate(async () => (await import("/js/study/plan.js")).studyOverview().practice);
  assert(practice && meta.includes("Practice") && meta.includes(`About ${practice.minutes} min`), `Study's door says: ${meta}`);
  // What's due is Practice's to ask (More ways' Reviews row is gone): the reviews session takes the same units.
  const reviews = await page.evaluate(async () => (await import("/js/study/plan.js")).planSession("reviews").steps.length);
  assert(reviews >= Math.min(plan.overview.due, 1), `the reviews session has ${reviews} steps for ${plan.overview.due} due`);
  await shot("01-study-due", { fullPage: true });
  return `${plan.overview.due} units due; ${plan.steps.map((s) => `${s.kind}${s.mode ? `/${s.mode}` : ""}${s.again ? " (again)" : ""}`).join(", ")}`;
});

await stage("Home: the date, Translate either way (what it finds, the way it goes, nothing about an AI when it's nothing), today's session, your progress, keep going", async () => {
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector('[data-part="next-step"]:not([inert])');
  // While the language's lessons are still on their way (packs.js lessonsComing), Home holds its card in the shape it most likely comes in
  // (today.js heldFirstLesson, heldPractice: its words held as skeletons); what it says is read once it's drawn.
  await page.waitForFunction(() => {
    const card = document.querySelector('[data-part="next-step"]:not([inert])');
    return Boolean(card) && !card.querySelector('[data-part="skeleton"]');
  }, null, { timeout: 20_000 });
  const tabs = await page.locator('[data-part="tab-bar"] [data-part="tab"]:visible').allTextContents();
  assert(tabs.join() === "Home,Study,Knowledge,Explore", `tabs: ${tabs}`);
  const date = await page.evaluate(() => [document.querySelector(".lx-today-date")?.textContent, new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })]);
  assert(date[0] === date[1], `the date: ${date}`);
  const practice = await page.evaluate(async () => (await import("/js/study/plan.js")).studyOverview().practice);
  const next = await page.locator('[data-part="next-step"]:not([inert])').textContent();
  // The same one thing as Study: Practice, and it starts the same run.
  assert(practice && next.includes("Practice") && next.includes(`about ${practice.minutes} min`), `the next step: ${next}`);
  assert((await page.locator('[data-part="next-step"]:not([inert])').getByRole("button", { name: "Start" }).count()) === 1, "it starts the day");
  // Your progress: the words you understand well, or before there are any the words you've started (as Knowledge's Your words card counts
  // them, home-numbers-check holding the two together), the words over time, the week.
  const numbers = await page.locator('[data-part="stat-tile"] .lx-tile-number').allTextContents();
  const words = await page.evaluate(async () => {
    const rows = (await import("/js/know/word-index.js")).startedWords();
    return rows.filter((row) => row.known).length || rows.length;
  });
  assert(numbers.length === 2 && numbers[0] === words.toLocaleString(), `the numbers: ${numbers} (words ${words})`);
  // Last 4 weeks waits until all four weeks have words (Home's cards, the bible): this learner's words are two weeks old, so it isn't shown.
  // ("shown, 28 days, once they are" is its own stage, at the end: older evidence planted here would move the Knowledge page's chart.)
  const firstDay = await page.evaluate(async () => (await import("/js/know/summary.js")).growth({ phrases: true })[0].n);
  assert(firstDay === 0, `four weeks ago this learner had ${firstDay} words`);
  assert((await page.locator('[data-part="know-link-card"][href="#know"]').count()) === 0, "Last 4 weeks shown with words from only the last two weeks");
  const days = await page.locator('[data-part="week-day"]').count();
  assert(days === 7, `${days} days in the week`);
  assert(await page.locator('[data-part="week-day"][aria-current="date"]').count() === 1, "today is marked");
  // The streak above the week (know/streak.js): a calm line on what today holds, never a warning.
  const streakNote = await page.locator('[data-part="streak-summary"] .lx-streak-note').textContent();
  assert(/^(Today counts|Finish one thing|Yesterday mends)/.test(streakNote) && !/lose|lost|last chance/i.test(streakNote), `the streak's line: ${streakNote}`);
  assert(!(await page.locator('[data-part="list-row"]', { hasText: "Practice with your AI" }).count()), "keep going offers no AI");
  assert(!(await page.locator(".lx-todo").count()), "Home still says To do");
  await shot("06-today", { fullPage: true });
  // Translate: English found either way, each language's flag on the way it goes.
  const field = page.locator('[data-part="translate-field"] textarea');
  const way = page.locator('[data-part="translate-direction"]');
  const flags = await way.locator('[data-part="language-flag"]').evaluateAll((fs) => fs.map((f) => f.getAttribute("src")));
  assert(flags.join() === "/flags/4x3/us.svg,/flags/4x3/nl.svg", `the way's flags: ${flags}`);
  await field.fill("grandma");
  await page.locator('[data-part="translate-result"]', { hasText: "oma" }).first().waitFor({ timeout: 15_000 });
  const sourced = await page.locator(".lx-tr-source").innerText();
  assert(/From /.test(sourced), `where it's from: ${sourced}`);
  // What your packs have with it is under the answer, in place ("In your packs": translate/page.js, no sheet).
  const packSheet = ".lx-today-translate .lx-tr-inline";
  const openPacks = async () => {
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.locator(packSheet).waitFor({ timeout: 5000 });
  };
  const closePacks = async () => {};
  await openPacks();
  const found = await page.locator(packSheet).innerText();
  assert(/grandma/.test(found), `found: ${found}`);
  await shot("06b-translate");
  await closePacks();
  // A long sentence (a book's) shows clipped around the word found, marked; a tap shows it whole.
  await field.fill("read");
  await page.locator('[data-part="translate-result"]', { hasText: "lezen" }).first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await openPacks();
  let clip = "no long sentence for “read” on this server";
  const clipped = page.locator(`${packSheet} [data-part="sentence-row"][data-clipped]`).first();
  if (await clipped.count()) {
    const shown = await clipped.locator(".lx-sentence-nl").innerText();
    assert(shown.length <= 64 && /…/.test(shown) && (await clipped.locator("mark").count()) === 1, `clipped: ${shown}`);
    await clipped.locator(".lx-tr-clip").click();
    const whole = await page.locator(`${packSheet} [data-part="sentence-row"]`).evaluateAll((rows) => rows.map((r) => r.querySelector(".lx-sentence-nl").textContent));
    assert(whole.some((t) => t.length > 80 && !t.includes("…")), `a tap shows it whole: ${whole}`);
    clip = `clipped to ${shown.length} characters, whole after a tap`;
  }
  const short = await page.locator(`${packSheet} [data-part="sentence-row"]:not([data-clipped]) .lx-sentence-nl`).allInnerTexts();
  assert(short.every((t) => !t.includes("…")), `short sentences stay whole: ${short}`);
  await closePacks();
  // The way: the bubble on one flag; a press on the other reads what you typed the other way, and back.
  const bubble = () => page.locator('.lx-way-tab[aria-pressed="true"]').evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute("aria-label") ?? tab.textContent).join());
  const labels = [await bubble()];
  for (let i = 0; i < 2; i++) {
    await page.locator('.lx-way-tab[aria-pressed="false"]').first().click();
    labels.push(await bubble());
  }
  assert(labels[0] && labels[1] && labels[0] !== labels[1] && labels[2] === labels[0], `the ways: ${labels}`);
  // Nothing found: says so, with nothing about an AI on it.
  await page.locator('[data-part="translate-field"] textarea').fill("xyzzyq");
  await page.locator(".lx-tr-none", { hasText: /Not in your packs|No translation/ }).waitFor({ timeout: 15_000 });
  assert(!/\bAI\b/.test(await page.locator(".lx-today-translate").innerText()), "Translate mentions an AI");
  await page.locator('[data-part="translate-field"] textarea').fill("");
  // Emptied, the page stays for the next word: Back is the way home.
  await page.locator('[data-part="app-back"]').click();
  await page.waitForFunction(() => /^#\/?today$/.test(location.hash) && !document.documentElement.hasAttribute("data-translate"));
  // Start goes into the session; leaving it comes back to Today.
  await page.locator('[data-part="next-step"]:not([inert]) [data-part="button"]', { hasText: "Start" }).click();
  await page.waitForSelector(SESSION);
  // (Its close button: the day may open on Type it, where Escape belongs to the field.)
  await page.locator(`${SESSION} [aria-label="End session"]`).click();
  await page.waitForFunction(() => location.hash === "#today" && !document.querySelector('[data-part="session"]:not([data-ghost])'));
  return `${next.replace(/\s+/g, " ").trim()} | ${numbers.join(" / ")}; translate found oma, ${clip}, one flag at a time, nothing about an AI`;
});

await stage("the quick session plays through; every new graded row keeps the scheduler's prediction", async () => {
  await page.goto(`${BASE}/app/#study/session/quick`);
  await page.waitForSelector(SESSION);
  const played = [];
  for (let i = 0; i < 20; i++) {
    if ((await nextStep(page, { session: SESSION })).kind === "summary") break;
    if (i === 0 || played.at(-1)?.kind === "listen") await shot(`02-step-${i}`);
    const step = await answerStep(page, { session: SESSION });
    played.push({ kind: step.kind, item: step.item?.id });
  }
  assert(await page.locator(`${SESSION} [data-part="session-summary"]`).count(), "the session should end in a summary");
  await shot("03-summary");
  const rows = await page.evaluate(async (now) => {
    const { allEvidence, gradeOf } = await import("/js/study/progress.js");
    return allEvidence().filter((r) => r.at > now).map((r) => ({ concept: r.concept, skill: r.skill, graded: Boolean(gradeOf(r)), p: r.p, item: r.item, activity: r.activity }));
  }, NOW);
  const withPrior = rows.filter((r) => r.graded && ["boek-gelezen", "wil-lezen", "vader-thuis"].includes(r.item) && r.concept.startsWith("p:"));
  assert(withPrior.length && withPrior.every((r) => typeof r.p === "number" && r.p > 0 && r.p < 1), `predictions: ${JSON.stringify(withPrior.slice(0, 4))}`);
  assert(rows.filter((r) => !r.graded).every((r) => r.p === undefined), "an ungraded row has a prediction");
  assert(played.some((s) => s.item === "wil-lezen" && s.kind.startsWith("listen")), `wil-lezen wasn't heard: ${JSON.stringify(played)}`);
  writeFileSync(join(OUT, "played.json"), JSON.stringify({ played, rows }, null, 2));
  return `${played.map((s) => s.kind).join(", ")}; ${withPrior.length} rows with p (e.g. ${withPrior[0].concept} ${withPrior[0].skill} ${withPrior[0].p})`;
});

await stage("after the session: the retry is done, what was due isn't now", async () => {
  const after = await page.evaluate(async () => {
    const { planSession, overview } = await import("/js/study/plan.js");
    const { conceptState } = await import("/js/study/progress.js");
    return { first: planSession("quick").steps[0], due: overview().dueUnits, v2: conceptState("p:v2"), perfect: conceptState("p:perfect") };
  });
  assert(!after.first?.again, `still a retry: ${JSON.stringify(after.first)}`);
  assert(!after.due.includes("p:perfect") && !after.perfect.due, `perfect still due: ${JSON.stringify(after.perfect)}`);
  return `due now: ${after.due.join(", ") || "nothing"}; perfect level ${after.perfect.level}`;
});

await stage("Knowledge, as its cards: Home's All of it opens it; the cards in order, drawn; Everyday's share with its credit; Over time's gain; read · by ear · say; a word's page and a pattern's", async () => {
  await page.goto(`${BASE}/app/#today`);
  await page.locator('.lx-today-progress [data-part="section-link"]', { hasText: "All of it" }).click();
  await page.waitForSelector('[data-part="know-card"]');
  // What you know is the Knowledge tab's own page: Home's All of it opens the tab, with no way back of its own.
  assert((await page.locator('[data-part="app-back"]').count()) === 0, "the Knowledge tab's page has no back");
  assert((await page.locator('[data-part="tab"][data-state="active"]').textContent()).includes("Knowledge"), "What you know lights Knowledge");
  // The board's cards come in a few at a time (know/page.js); it's marked drawn once every card is in its place.
  await page.waitForSelector(".lx-know-board[data-drawn]", { timeout: 30_000 });
  const cards = await page.locator(".lx-know-board > [data-card]").evaluateAll((cs) => cs.map((c) => c.dataset.card));
  const hasList = await page.evaluate(async () => Boolean((await (await fetch("/library/catalogue.json")).json()).lists?.frequency?.nl));
  // Everyday is the language's frequency list: a server without one has no such card.
  const order = hasList ? "words,week,ideas,everyday,time" : "words,week,ideas,time";
  assert(cards.join() === order, `the cards: ${cards} (expected ${order})`);
  // Your words, Everyday and Over time open their own pages, and This week's "and N more" opens Your words at this week; nothing else leads off.
  const doors = await page.locator('[data-part="page"] a[href^="#know/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const DOORS = ["#know/words", "#know/everyday/words", "#know/time/more", "#know/words/week"];
  assert(doors.includes("#know/words") && doors.every((href) => DOORS.includes(href)), `links to other Knowledge pages: ${doors}`);
  await shot("07-knowledge", { fullPage: true });
  let share = "no list on this server";
  if (hasList) {
    // Everyday's page leads with the share of everyday speech you'd follow; the list's credit is a row at its foot that opens a sheet.
    await page.locator('.lx-know-board [data-card="everyday"] [data-part="know-door"]').click();
    await page.waitForFunction(() => location.hash === "#know/everyday/words");
    const top = '[data-part="page"]:not([data-ghost]) .lx-everyday-top';
    await page.waitForSelector(`${top} .lx-know-n`, { timeout: 15_000 });
    const { number, expected } = await page.evaluate(async (top) => {
      const { everydayShare } = await import("/js/know/summary.js");
      const { percent } = await import("/js/know/ui.js");
      return { number: document.querySelector(`${top} .lx-know-n`).textContent, expected: percent(everydayShare({ lang: "nl" }).share) };
    }, top);
    assert(number === expected, `Everyday says ${number}, the share is ${expected}`);
    share = `${number} of everyday speech`;
    await page.locator('[data-part="page"]:not([data-ghost]) .lx-know-credit [data-part="list-row"]', { hasText: "Where the word list comes from" }).click();
    await page.waitForSelector(".lx-credit-sources a");
    const links = await page.locator(".lx-credit-sources a").evaluateAll((as) => as.map((a) => a.href));
    assert(links.includes("http://www.opensubtitles.org/"), `credit links: ${links}`);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".lx-credit-sources"));
    await page.goto(`${BASE}/app/#know`);
    await page.waitForSelector(".lx-know-board[data-drawn]", { timeout: 30_000 });
  }
  // Over time: the card's number is the last four weeks' gain in words and phrases you understand well. Four weeks ago is before this
  // account's first evidence, so it's every one you understand now.
  const time = await page.evaluate(async () => {
    const { overTime } = await import("/js/know/summary.js");
    const now = Date.now();
    const [then, today] = overTime({ lang: "nl", ats: [new Date(now - 27 * 86_400_000).setHours(23, 59, 59, 999), now] });
    return { then, today, shown: document.querySelector('.lx-know-board [data-card="time"] .lx-know-n')?.textContent ?? null };
  });
  assert(time.then.n === 0 && time.today.n > 0, `four weeks ago (before the first evidence) ${time.then.n}, today ${time.today.n}`);
  assert(time.shown === `+${time.today.n.toLocaleString()}`, `Over time says ${time.shown}, the gain is ${time.today.n}`);
  // Its page: read, by ear, say, each with how many you understand well that way now (all of it, the page's first range).
  await page.evaluate(() => localStorage.removeItem("lx.know.time-range.v1"));
  await page.locator('.lx-know-board [data-card="time"] [data-part="know-door"]').click();
  await page.waitForFunction(() => location.hash === "#know/time/more");
  await page.waitForSelector('[data-part="page"]:not([data-ghost]) .lx-tp-skill-n');
  const said = await page.locator('[data-part="page"]:not([data-ghost]) .lx-tp-skill-n').allTextContents();
  const sums = ["read", "hear", "say"].map((skill) => time.today[skill].toLocaleString());
  assert(JSON.stringify(said) === JSON.stringify(sums), `read · by ear · say ${said} vs ${JSON.stringify(sums)}`);
  const words = time.today.n;
  const first = time.then.n;
  // A word's own page (from search or a link), and a pattern's: how well by each strength, its history, Practice this.
  await page.goto(`${BASE}/app/#know/list/word/read`);
  await pageSays("Words you can read");
  await page.locator('[data-part="page"] a[data-part="list-row"]').first().click();
  await page.waitForFunction(() => location.hash.startsWith("#know/w%3A") || location.hash.startsWith("#know/w:"));
  await page.waitForSelector('[data-part="concept-head"]');
  const rows = await page.locator('[data-part="page"] [data-part="list-row"]').count();
  assert(rows >= 4, `strengths and history: ${rows} rows`);
  await shot("09-concept-word", { fullPage: true });
  await page.goto(`${BASE}/app/#know/${encodeURIComponent("p:perfect")}`);
  await page.waitForSelector('[data-part="concept-head"]');
  const head = await page.locator('[data-part="concept-head"]').textContent();
  assert(head.includes("Perfect tense") && head.includes("pattern"), `head: ${head}`);
  // Saying it: how well in the Knowledge page's words, and when it's asked again, from its strength now.
  const say = (await page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: /^Saying it$/ }) }).locator(".lx-row-sub").textContent()).trim();
  const strength = await page.evaluate(async () => {
    const s = (await import("/js/study/progress.js")).unitState("p:perfect").strengths.say;
    return s && { level: s.level, due: Boolean(s.due) };
  });
  const LEVELS = ["Just started", "Getting there", "Strong", "Solid"];
  const word = strength && (strength.due && strength.level >= 2 ? "Slipping" : LEVELS[Math.min(4, Math.max(1, strength.level)) - 1]);
  assert(strength && say.startsWith(`${word} · `) && (strength.due ? say.endsWith("due now") : /back (later today|tomorrow|in \d+ days)$/.test(say)), `Saying it: “${say}” for ${JSON.stringify(strength)}`);
  const history = await page.locator('section[data-part="section"] [data-part="list-row"]').count();
  assert(history >= 2, `${history} tests in the history`);
  await shot("10-concept-pattern", { fullPage: true });
  await page.locator('[data-part="button"]', { hasText: "Practice this" }).click();
  await page.waitForSelector(SESSION);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => location.hash === "#know" && !document.querySelector('[data-part="session"]:not([data-ghost])'));
  return `${cards.length} cards; ${share}; growth ${first} → ${words}; bars ${said.join("/")}; word page (${rows} rows), pattern page (${history} tests)`;
});

await stage("the ideas you've met: four on the card, every one on their page, each with its picture; Everyday's thousand, a word from your reading in ink; the next words", async () => {
  await page.goto(`${BASE}/app/#know`);
  await page.waitForSelector(".lx-know-board[data-drawn]", { timeout: 30_000 });
  // The card shows the four least known as cards (know/cards-more.js ideasCard); past four, See all opens every one on its own page.
  const started = await page.evaluate(async () => (await import("/js/know/summary.js")).grammarMap().filter((row) => row.state !== "new").length);
  const onCard = await page.locator('[data-card="ideas"] [data-part="idea-card"]').evaluateAll((ns) => ns.map((n) => n.dataset.state));
  assert(started > 0 && onCard.length === Math.min(4, started), `${onCard.length} ideas on the card for ${started} patterns started`);
  await shotOf(page.locator('[data-card="ideas"]'), "15-ideas");
  const seeAll = page.locator('[data-card="ideas"] button', { hasText: /^See all \d+ ideas$/ });
  assert((await seeAll.count()) === (started > 4 ? 1 : 0), `See all: ${await seeAll.count()} for ${started} ideas`);
  let tiles = onCard;
  if (started > 4) {
    await seeAll.click();
    await page.waitForFunction(() => location.hash === "#know/ideas");
    await page.waitForSelector('.lx-ideas-page [data-part="idea-card"]');
    tiles = await page.locator('.lx-ideas-page [data-part="idea-card"]').evaluateAll((ns) => ns.map((n) => n.dataset.state));
  }
  const where = started > 4 ? ".lx-ideas-page" : '[data-card="ideas"]';
  assert(tiles.length === started, `${tiles.length} ideas for ${started} patterns started`);
  assert(tiles.every((st) => ["strong", "learning", "slipping"].includes(st)), `states: ${tiles}`);
  assert((await page.locator(`${where} [data-part="idea-card"] .lx-idea-picture > *`).count()) === started, "an idea without its picture");
  const hasList = await page.evaluate(async () => Boolean((await (await fetch("/library/catalogue.json")).json()).lists?.frequency?.nl));
  if (!hasList) return `${started} ideas; no frequency list on this server, so no map`;
  // Everyday's page: the 1,000 commonest words in blocks of a hundred, yours in ink. A word you added in your reading (the word bank) is
  // yours: huis, which nothing in this run studies, inks in once it's added.
  const everyday = async () => {
    // Opened by its address unless it's open already (a goto to the address you're on replaces the entry, dropping the router's label), then
    // drawn again from the start.
    if ((await page.evaluate(() => location.hash)) !== "#know/everyday/words") await page.goto(`${BASE}/app/#know/everyday/words`);
    await page.reload();
    await page.waitForSelector("html[data-app-ready]");
    const here = '[data-part="page"]:not([data-ghost]) .lx-hundreds';
    await page.waitForFunction((here) => document.querySelectorAll(`${here} [data-part="hundred"]`).length === 10, here, { timeout: 15_000 });
    return page.evaluate((here) => {
      const words = [...document.querySelectorAll(`${here} .lx-common-word, ${here} .lx-common-gap`)];
      return { cells: words.length, yours: words.filter((w) => w.classList.contains("lx-common-word")).map((w) => w.textContent) };
    }, here);
  };
  const before = await everyday();
  assert(before.cells === 1000 && !before.yours.includes("huis"), `${before.cells} words, huis ${before.yours.includes("huis") ? "already yours" : "not yours"}`);
  await page.evaluate(async () => (await import("/js/read/bank.js")).addWord("nl", "huis"));
  const after = await everyday();
  assert(after.yours.includes("huis") && after.yours.length === before.yours.length + 1, `after adding huis: ${after.yours.length} yours (was ${before.yours.length}), huis ${after.yours.includes("huis") ? "in ink" : "blank"}`);
  await shot("16-everyday", { fullPage: true });
  // Learn the next common words, on the Knowledge page's Everyday card: a session, and back.
  await page.goto(`${BASE}/app/#know`);
  await page.waitForSelector(".lx-know-board[data-drawn]", { timeout: 30_000 });
  const next = page.locator('[data-card="everyday"] [data-part="button"]', { hasText: "Learn the next common words" });
  let session = "no new common words in the deck";
  if (await next.count()) {
    await next.click();
    await page.waitForSelector(SESSION);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => location.hash === "#know" && !document.querySelector('[data-part="session"]:not([data-ghost])'));
    session = "the next common words open a session and come back";
  }
  return `${started} ideas with pictures; everyday ${after.cells} words, ${after.yours.length} yours with huis from your reading; ${session}`;
});

await stage("this week and the week ahead: what it's made of, a glass a day, the next 7 days on Over time's page; and search", async () => {
  // Home's things done this week opens the page at this card: tapped, as a person goes there (an address typed in is a step back in
  // the app's history, which puts a page where it was left).
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector("html[data-app-ready]");
  await page.locator('[data-part="page"] a[href="#know/days"]:visible').first().click();
  await page.waitForSelector('[data-card="week"]');
  // The page this address drew, once it's shown (a deeper page is held unseen for its slide, the page it came from still showing, its own week card
  // wherever that page was scrolled); polled in the page, 3 s at most.
  const top = await page.evaluate(async () => {
    let last = null;
    for (let waited = 0; waited < 3000; waited += 100) {
      const card = [...document.querySelectorAll('[data-card="week"]')].find((node) => node.getClientRects().length && !node.closest("[data-waiting]"));
      last = card ? Math.round(card.getBoundingClientRect().top) : null;
      if (location.hash === "#know/days" && last !== null && last >= 0 && last < 240) return last;
      await new Promise((r) => setTimeout(r, 100));
    }
    return last;
  });
  if (!(top !== null && top >= 0 && top < 240)) {
    const why = await page.evaluate(() => {
      const pg = document.querySelector('[data-part="page"]');
      const cards = [...document.querySelectorAll('[data-card="week"]')].map((n) => `${n.getClientRects().length ? "shown" : "hidden"}@${Math.round(n.getBoundingClientRect().top)}`);
      return `scrollTop ${pg?.scrollTop} of ${pg?.scrollHeight} (${pg?.clientHeight} shown); week cards ${cards.join(", ")}; cards ${[...document.querySelectorAll('[data-part="know-card"]')].filter((n) => n.getClientRects().length).map((n) => `${n.dataset.card}:${Math.round(n.getBoundingClientRect().height)}`).join(" ")}`;
    });
    await shot("19-this-week-failed");
    throw new Error(`#know/days opens with this week at ${top} px: ${why}`);
  }
  // The card's number is the week's things done; under the glasses, what they're made of, each source in its own unit, the most first (with
  // one source, no such line). From the evidence itself: a thing is a moment in one source.
  const week = await page.evaluate(async () => {
    const [{ evidenceSince }, { dayOf, sourceOf }, { t }] = await Promise.all([import("/js/study/progress.js"), import("/js/know/summary.js"), import("/js/lx/i18n.js")]);
    const now = Date.now();
    const moments = { games: new Set(), listening: new Set(), reading: new Set(), talk: new Set() };
    const days = new Set();
    for (const row of evidenceSince(now - 7 * 86_400_000)) {
      moments[sourceOf(row.activity)].add(row.at);
      days.add(dayOf(row.at));
    }
    const parts = Object.entries(moments).filter(([, set]) => set.size).sort((x, y) => y[1].size - x[1].size);
    return {
      done: parts.reduce((sum, [, set]) => sum + set.size, 0),
      line: parts.length > 1 ? parts.map(([source, set]) => t(`know.week.count.${source}`, { count: set.size })).join(" · ") : null,
      days: days.size,
    };
  });
  const card = page.locator('[data-part="page"]:not([data-ghost]) [data-card="week"]');
  const done = (await card.locator(".lx-know-n").first().textContent()).trim();
  assert(done === week.done.toLocaleString(), `this week says ${done}, the evidence ${week.done}`);
  const lines = await card.locator(".lx-know-line").allTextContents();
  assert(week.line ? lines.includes(week.line) : !lines.some((line) => line.includes(" · ")), `made of: ${JSON.stringify(lines)} vs ${week.line}`);
  // A glass a day, today's last; each day with something done has its number once its glass has filled (about 2 s).
  const glasses = await card.locator(".lx-glass-col").evaluateAll((ns) => ns.map((n) => n.getAttribute("aria-current")));
  assert(glasses.length === 7 && glasses.at(-1) === "date" && glasses.filter(Boolean).length === 1, `glasses: ${JSON.stringify(glasses)}`);
  await page.waitForTimeout(2500);
  const filled = await card.locator(".lx-glass-n").evaluateAll((ns) => ns.filter((n) => n.textContent.trim()).length);
  assert(filled === week.days && week.days >= 2, `${filled} glasses with a number for ${week.days} days studied this week`);
  await shotOf(card, "19-this-week");
  // The week ahead, on Over time's page: each of the next 7 days, how many come back.
  await page.goto(`${BASE}/app/#know/time/more`);
  await page.waitForFunction(() => document.querySelectorAll('[data-part="page"]:not([data-ghost]) .lx-tp-days > .lx-tp-day').length === 7);
  const shown = (await page.locator('[data-part="page"]:not([data-ghost]) .lx-tp-days > .lx-tp-day .lx-tp-day-n').allTextContents()).map((text) => Number(text.match(/[\d,]+/)?.[0].replace(/,/g, "") ?? 0));
  const planned = await page.evaluate(async () => (await import("/js/know/summary.js")).forecast({ lang: "nl", days: 7 }).map((d) => d.count));
  assert(shown.join() === planned.join(), `the week ahead ${shown} vs ${planned}`);
  // Search, on the Knowledge page: a word by its English, then its page, with where it ranks when there's a list.
  const hasList = await page.evaluate(async () => Boolean((await (await fetch("/library/catalogue.json")).json()).lists?.frequency?.nl));
  await page.goto(`${BASE}/app/#know`);
  const field = page.locator('.lx-know-search input[type="search"]');
  await field.fill("grandma");
  await page.waitForSelector('.lx-know-search [data-part="list-row"]');
  const first = await page.locator('.lx-know-search [data-part="list-row"] .lx-row-title').first().textContent();
  assert(first === "oma", `searching "grandma" found ${first}`);
  await shotOf(page.locator(".lx-know-search"), "20-search");
  await page.locator('.lx-know-search [data-part="list-row"]').first().click();
  await page.waitForFunction(() => location.hash === "#know/w%3Aoma" && document.querySelector('[data-part="concept-head"]')?.textContent.includes("oma"));
  const head = await page.locator('[data-part="concept-head"]').textContent();
  if (hasList) assert(/The \d+(st|nd|rd|th) most common word in everyday Dutch/.test(head), `oma's page: ${head}`);
  else assert(!/most common/.test(head), `oma's page with no list: ${head}`);
  // Typing survives the page drawing again (the word list arriving): it's outside what's redrawn. A pattern's search
  // finds the language you're learning's own: Dutch's verb second (p:v2), never another language's (Icelandic's and
  // Afrikaans' are p:verb-second).
  await page.goto(`${BASE}/app/#know`);
  await page.locator('.lx-know-search input[type="search"]').fill("verb sec");
  await page.waitForFunction(() => document.querySelector('.lx-know-search [data-part="list-row"] .lx-row-title')?.textContent === "Verb second");
  const links = await page.locator('.lx-know-search [data-part="list-row"]').evaluateAll((rows) => rows.map((row) => row.getAttribute("href")));
  assert(links[0] === "#know/p%3Av2" && !links.some((href) => href.includes("verb-second")), `"verb sec" found ${links}`);
  return `this week at ${top} px: ${done} done${week.line ? ` (${week.line})` : ""}, ${filled} days; ahead ${shown.join(" ")}; search finds oma by "grandma" (${hasList ? "its rank on its page" : "no list, so no rank"}) and Dutch's Verb second by "verb sec" (${links.length} found)`;
});

await stage("what's slipping: Knowledge's Review what's slipping, its one way forward, opens a session on just that, and back", async () => {
  // A word learned weeks ago and not seen since slips: three right answers 60, 57 and 50 days back, on a word nothing
  // else in this run touches.
  const slipped = await page.evaluate(async () => {
    const { record, unitState } = await import("/js/study/progress.js");
    const { ITEMS, conceptsOf } = await import("/js/study/content.js");
    const item = ITEMS.find((i) => conceptsOf(i).every((c) => unitState(c).isNew));
    const unit = item && conceptsOf(item).find((c) => c.startsWith("w:"));
    if (!unit) return null;
    record([60, 57, 50].map((d) => ({ concept: unit, at: Date.now() - d * 86_400_000, outcome: "right", test: "recall", skill: "read", activity: "type", item: item.id })));
    return unit;
  });
  assert(slipped, "no word left untouched to let slip");
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const slipping = await page.evaluate(async () => (await import("/js/know/summary.js")).knowledge().slipping);
  assert(slipping.includes(slipped), `${slipped} isn't slipping: ${slipping}`);
  const planned = await page.evaluate(async () => (await import("/js/study/plan.js")).planSession("slipping").steps.length);
  assert(planned > 0, "no steps for what's slipping");
  // The Knowledge page has the one way forward: it opens the same session, back to Knowledge after. In a tab of its own, opened on the
  // Knowledge page as a person opens the app: this page's history is the check's own gotos and reloads by now, and the router's way back
  // steps through the history it recorded (shell/main.js startAfresh), which those don't keep in step.
  const tab = await context.newPage();
  tab.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
  tab.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  try {
    await tab.goto(`${BASE}/app/#know`);
    await tab.waitForSelector("html[data-app-ready]");
    const review = tab.locator('[data-part="button"][data-variant="go"]', { hasText: "Review what's slipping" });
    await review.waitFor();
    assert((await tab.locator('[data-part="page"]:not([data-ghost]) [data-part="button"][data-variant="go"]').count()) === 1, "one way forward");
    await review.click();
    await tab.waitForSelector(SESSION);
    await tab.keyboard.press("Escape");
    await tab
      .waitForFunction(() => location.hash === "#know" && !document.querySelector('[data-part="session"]:not([data-ghost])'), null, { timeout: 15_000 })
      .catch(async (error) => {
        await tab.screenshot({ path: join(OUT, "shots", "08-slipping-after.png") });
        const seen = await tab.evaluate(() => ({ hash: location.hash, session: Boolean(document.querySelector('[data-part="session"]:not([data-ghost])')), nav: globalThis.__lxNav?.(), entries: history.length }));
        throw new Error(`${error.message.split("\n")[0]}: ${JSON.stringify(seen)}`);
      });
  } finally {
    await tab.close();
  }
  return `${slipping.length} slipping (${slipping.slice(0, 4).join(", ")}); ${planned} steps; Review what's slipping opens them`;
});

await stage("with an AI connected: Home, Study, Knowledge and Explore, AI and Read rows on Home; the switch puts AI in the tab bar, Read still a row on Home; the AI tab holds Practice; every old address opens", async () => {
  await page.evaluate(() => fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "an AI, for this check" }) }));
  // Once the app has caught up with the stage before (v97: a step back from it landed after this address, and the reload opened Home).
  await goRouted(page, BASE, "#settings/appearance/layout");
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const row = page.locator('[data-part="list-row"]', { hasText: "AI in the tab bar" });
  await row.waitFor().catch(async (error) => {
    await shot("11-ai-row-missing");
    const seen = await page.evaluate(() => ({ hash: location.hash, rows: [...document.querySelectorAll('[data-part="list-row"]')].map((r) => r.innerText.split("\n")[0]).slice(0, 12), title: document.querySelector('[data-part="page-title"]')?.textContent }));
    throw new Error(`${error.message.split("\n")[0]}: ${JSON.stringify(seen)}`);
  });
  let tabs = await page.locator('[data-part="tab-bar"] [data-part="tab"]:visible').allTextContents();
  assert(tabs.join() === "Home,Study,Knowledge,Explore", `the tabs once connected: ${tabs}`);
  // AI with no tab: its card on Home, lit as Home, its way back there.
  await page.goto(`${BASE}/app/#today`);
  // On its words, never its middle as such: Tinta stands on the card, and a tap on him is a poke, his alone (fixtures/words-point.mjs).
  const aiCard = page.locator('[data-part="page"]:not([data-ghost]) [data-part="home-card"][data-variant="ai"]').first();
  await aiCard.scrollIntoViewIfNeeded();
  const aiAt = await aiCard.evaluate(wordsPoint);
  await page.mouse.click(aiAt.x, aiAt.y);
  await page.waitForSelector('[data-part="ai-practice"]');
  assert((await page.locator('[data-part="tab"][data-state="active"]').textContent()).includes("Home"), "AI without a tab lights Home");
  assert((await page.locator('[data-part="app-back"]').getAttribute("href")) === "#today", "AI without a tab goes back to Home");
  await shot("11-ai-on-home");
  // The switch: AI takes a tab at once, and Read is still the book card on Home.
  await page.goto(`${BASE}/app/#settings/appearance/layout`);
  await row.locator('[data-part="switch"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('[data-part="tab-bar"] [data-part="tab"]')].map((t) => t.textContent).join().includes("AI"));
  tabs = await page.locator('[data-part="tab-bar"] [data-part="tab"]:visible').allTextContents();
  assert(tabs.join() === "Home,Study,Knowledge,AI,Explore", `tabs with AI: ${tabs}`);
  await page.goto(`${BASE}/app/#today`);
  await page.locator('[data-part="page"]:not([data-ghost]) .lx-home-cards a[href="#read"]').first().click();
  await page.waitForFunction(() => location.hash === "#read");
  assert((await page.locator('[data-part="tab"][data-state="active"]').textContent()).includes("Home"), "Read without a tab lights Home");
  assert((await page.locator('[data-part="app-back"]').getAttribute("href")) === "#today", "Read without a tab goes back to Home");
  await page.locator('[data-part="tab"]', { hasText: "AI" }).first().click();
  await page.waitForSelector('[data-part="ai-practice"]');
  await page.waitForFunction(() => document.querySelector('[data-part="app-title"]')?.textContent.includes("AI"));
  assert(!(await page.locator('[data-part="app-back"]').count()), "AI as a tab has a back link");
  await shot("12-ai-tab");
  // Practice, from the AI tab: lit as AI, back to it, its kinds linking within #practice.
  await page.locator('[data-part="list-row"]', { hasText: "Past practices" }).click();
  await pageSays("Start a practice");
  assert((await page.locator('[data-part="tab"][data-state="active"]').textContent()).includes("AI"), "Practice lights the AI tab");
  assert((await page.locator('[data-part="app-back"]').getAttribute("href")) === "#ai", "Practice goes back to the AI tab");
  const start = await page.locator('[data-part="list-row"]', { hasText: "Conversation" }).first().getAttribute("href");
  assert(start === "#practice/new/conversation", `a kind links to ${start}`);
  await page.locator('[data-part="list-row"]', { hasText: "Conversation" }).first().click();
  await pageSays("How you'll answer");
  assert(await page.evaluate(() => location.hash === "#practice/new/conversation"), "the kind's address");
  assert((await page.locator('[data-part="app-back"]').getAttribute("href")) === "#practice", "a practice's page goes back to Practice");
  // The old addresses still open: #practise (before American spelling) and Study's own.
  await page.goto(`${BASE}/app/#practise`);
  await page.waitForFunction(() => location.hash === "#practice");
  await pageSays("Start a practice");
  await page.goto(`${BASE}/app/#study/practice`);
  await pageSays("Start a practice");
  await page.waitForSelector('[data-part="app-back"]');
  assert((await page.locator('[data-part="app-back"]').getAttribute("href")) === "#study", "in Study, back to Study");
  // A layout saved when Practice or Know had a fourth tab opens with today's: Read is a row on Home.
  await page.evaluate(() => localStorage.setItem("lx.shell.v1", JSON.stringify({ fourth: "practice" })));
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  tabs = await page.locator('[data-part="tab-bar"] [data-part="tab"]:visible').allTextContents();
  assert(tabs.join() === "Home,Study,Knowledge,Explore", `a saved fourth tab: ${tabs}`);
  return "AI a row on Home, then the tab with Read a row on Home; Practice under the AI tab; #practise, #practice and #study/practice open; an old saved layout opens with today's tabs";
});

await stage("a wide screen: Home and the Knowledge page", async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector('[data-part="stat-tiles"]');
  await shot("13-today-wide");
  await page.goto(`${BASE}/app/#know`);
  await page.waitForSelector('[data-part="know-card"]');
  await shot("14-know-wide", { fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  return "shot";
});

await stage("Settings → Study → Remembering: what you train and the target recall", async () => {
  await page.goto(`${BASE}/app/#settings/study`);
  await page.locator('[data-part="list-row"]', { hasText: "Remembering" }).click();
  await page.waitForFunction(() => location.hash === "#settings/study/memory");
  await shot("04-remembering");
  const dueWith = () => page.evaluate(async () => (await import("/js/study/plan.js")).overview(Date.now() + 30 * 86_400_000).due);
  const before = await dueWith();
  await page.locator('[data-part="list-row"]', { hasText: "Hearing" }).locator('[data-part="switch"]').click();
  const noHearing = await page.evaluate(async () => (await import("/js/study/settings.js")).getStudySettings().memory.train.hear);
  assert(noHearing === false, "hearing still trained");
  // At least one stays on.
  await page.locator('[data-part="list-row"]', { hasText: "Reading" }).locator('[data-part="switch"]').click();
  await page.locator('[data-part="list-row"]', { hasText: "Saying" }).locator('[data-part="switch"]').click();
  const still = await page.evaluate(async () => (await import("/js/study/settings.js")).getStudySettings().memory.train);
  assert(still.say === true && still.read === false, `the last one went off: ${JSON.stringify(still)}`);
  assert(await page.getByText("Train at least one of the three.").isVisible(), "no message");
  await page.locator('[data-part="segment"]', { hasText: "95%" }).click();
  const target = await page.evaluate(async () => (await import("/js/study/settings.js")).getStudySettings().memory.target);
  assert(target === 0.95, `target ${target}`);
  const after = await dueWith();
  await shot("05-remembering-changed");
  // Back to the defaults for what follows.
  await page.locator('[data-part="list-row"]', { hasText: "Reading" }).locator('[data-part="switch"]').click();
  await page.locator('[data-part="list-row"]', { hasText: "Hearing" }).locator('[data-part="switch"]').click();
  await page.locator('[data-part="segment"]', { hasText: "90%" }).click();
  await page.goto(`${BASE}/app/#settings/study`);
  const value = await page.locator('[data-part="list-row"]', { hasText: "Remembering" }).textContent();
  assert(value.includes("90%"), `the menu shows ${value}`);
  return `due in 30 days with all three: ${before}; saying only, 95%: ${after}`;
});

await stage("get_learner: per-strength recall, phrases, under the size limit", async () => {
  const snap = await page.evaluate(async () => {
    const { learnerSnapshot } = await import("/js/practice/learner.js");
    const s = learnerSnapshot();
    return { bytes: JSON.stringify(s).length, about: s.about, phrases: s.phrases, perfect: s.patterns.find((p) => p.id === "p:perfect"), patterns: s.patterns.length, words: s.words.length };
  });
  assert(snap.patterns >= 8 && snap.phrases.length >= 1 && snap.phrases[0].id === "c:hoe-gaat-het", `snapshot ${JSON.stringify(snap).slice(0, 300)}`);
  assert(snap.perfect.recall && typeof snap.perfect.recall.say === "number", `perfect ${JSON.stringify(snap.perfect)}`);
  assert(snap.bytes < 64_000, `${snap.bytes} bytes`);
  writeFileSync(join(OUT, "learner.json"), JSON.stringify(snap, null, 2));
  return `${snap.bytes} bytes; perfect: level ${snap.perfect.level}, recall ${JSON.stringify(snap.perfect.recall)}`;
});

let problemsBeforeDelete = 0;
await stage("Home's Last 4 weeks, once all four weeks have words: shown, a bar for each of 28 days", async () => {
  // A word learned on days 35 to 29 back, nothing else in this run touching it: four weeks ago it was already known.
  const planted = await page.evaluate(async () => {
    const { record, unitState } = await import("/js/study/progress.js");
    const { ITEMS, conceptsOf } = await import("/js/study/content.js");
    const item = ITEMS.find((i) => conceptsOf(i).every((c) => unitState(c).isNew));
    const unit = item && conceptsOf(item).find((c) => c.startsWith("w:"));
    if (!unit) return null;
    record([35, 33, 31, 29].map((d) => ({ concept: unit, at: Date.now() - d * 86_400_000, outcome: "right", test: "recall", skill: "read", activity: "type", item: item.id })));
    return unit;
  });
  assert(planted, "no word left untouched to plant four weeks back");
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const firstDay = await page.evaluate(async () => (await import("/js/know/summary.js")).growth({ phrases: true })[0].n);
  assert(firstDay > 0, `four weeks ago still no words (${planted})`);
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector('[data-part="next-step"]:not([inert])');
  const days = page.locator('[data-part="know-link-card"][href="#know"] [data-part="growth-day"]');
  await days.first().waitFor({ timeout: 10_000 });
  assert((await days.count()) === 28, `${await days.count()} days in Last 4 weeks`);
  await shot("06b-today-four-weeks", { fullPage: true });
  return `${planted}: ${firstDay} word${firstDay === 1 ? "" : "s"} four weeks ago, 28 days shown`;
});

await stage("delete the account", async () => {
  problemsBeforeDelete = problems.length;
  await page.goto(`${BASE}/app/#settings/account`);
  const row = (text) => page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${text}$`) }) }).first();
  await row("Delete my account").click();
  await row("Press again to delete it for good").click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  return "deleted";
});

await stage("no stray \"null\" or \"undefined\" text on any screen we visited", async () => {
  assert(!strayText.length, `stray text: ${strayText.slice(0, 5).join(" · ")}`);
  return "none";
});

await stage("no console errors", async () => {
  const after = problems.slice(problemsBeforeDelete).filter((p) => !/status of 401/.test(p));
  const real = [...problems.slice(0, problemsBeforeDelete), ...after];
  assert(real.length === 0, real.join(" | "));
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "knowledge-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
