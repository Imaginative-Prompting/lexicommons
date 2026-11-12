// Find your level (study/placement.js, session.js's placement) in the real app on a phone, by real presses, at 390 × 844 and 320 × 568, in dark
// (Graphite) and light (Paper): the first run's second question for a full course (No, I'm new to it opening nothing; an answer starting the
// check at its unit); a learner who knows units 1 to 7 placed at unit 8 (each step its unit's, its count "Finding your level", no Hint, Words
// or Can't listen now, no meaning on a tapped word, nothing scrolling; its bar never going back and full at its result; only right answers
// kept; nothing asked of the server but the account's own copy, the library and error reports); its result (Start at unit 8, the units
// behind with a check and 8 next) and Start unit 8 opening unit 8's first lesson, the path saying Placed; stopping partway (Stop here?, Keep
// going, then Start at unit N); knowing nothing (Start from the beginning, no box, Start lesson 1 opening lesson 1); Study's row offered to a
// new learner and gone once it's taken; Settings → Study's place on the path, Start from the beginning and its Undo. Pictures of each screen.
// node scripts/placement-check.mjs http://localhost:<port> <outDir> [--only <regex>] [--sizes 390x844,320x568] [--schemes dark,light]
//   LOCAL only (it signs up accounts); a copy with Dutch's lessons (npm run local); through gpu.py's parallel lane (exit 0 = pass)
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { SESSION, answerStep, nextStep } from "./fixtures/play-session.mjs";

// The first run is this check's to see (quiet-browser.mjs skips it for every other check).
process.env.LX_FIRST_RUN = "1";
const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
if (!/^http:\/\/localhost:\d+$/.test(BASE ?? "") || !outArg) {
  console.error("Usage: node scripts/placement-check.mjs http://localhost:<port> <outDir> [--only <regex>] [--sizes 390x844,320x568] [--schemes dark,light] (LOCAL only)");
  process.exit(2);
}
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const ONLY = argv.includes("--only") ? new RegExp(opt("only"), "i") : null;
const SIZES = opt("sizes", "390x844,320x568").split(",").map((s) => s.split("x").map(Number));
const SCHEMES = opt("schemes", "dark,light").split(",");
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
const KNOWS = 7; // the scripted learner knows units 1 to 7

const browser = await chromium.launch({ headless: true });
let failed = 0;
let passed = 0;
const report = [];
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};

async function phone([width, height], scheme) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: "block", reducedMotion: "reduce", colorScheme: scheme, locale: "en-US" });
  // Paper for the light pictures from the very first frame (the first run comes before any setting): the look's own key, as Settings → Appearance keeps it.
  if (scheme === "light") await context.addInitScript(() => {
    try {
      if (!localStorage.getItem("lx.appearance.v1")) localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, theme: "paper" }));
    } catch {}
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const asked = [];
  page.on("request", (r) => asked.push(new URL(r.url()).pathname));
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  return { context, page, errors, asked };
}
const ready = (page) => page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
async function signUp(page) {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Placement Check");
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await ready(page);
}
// The first run's two questions: Dutch, then the answer given.
async function firstRun(page, answer) {
  const nl = page.locator('.lx-welcome [data-language="nl"]');
  await nl.waitFor({ timeout: 30_000 });
  await nl.click();
  const row = page.locator(`.lx-welcome [data-start="${answer}"]`);
  await row.waitFor({ timeout: 10_000 });
  return row;
}
// Dutch's lessons on the device (a placement waits for them; a check reads the units from them).
const lessonsIn = (page) =>
  page.evaluate(async () => {
    const { placementUnits } = await import("/js/study/placement.js");
    for (let waited = 0; waited < 120_000; waited += 500) {
      const units = placementUnits();
      if (units.length >= 16) return units.map((unit) => ({ n: unit.n, title: unit.title, first: unit.first.id }));
      await new Promise((r) => setTimeout(r, 500));
    }
    return [];
  });
const shot = (page, dir, name) => page.screenshot({ path: join(dir, `${name}.png`) });
// What the session shows now: its step's unit, its count's words, its bar, what's in its bar of actions, and whether anything scrolls.
const look = (page) =>
  page.evaluate((S) => {
    const root = document.querySelector(S);
    if (!root) return null;
    const bar = root.querySelector('[data-part="session-progress"]');
    const activity = root.querySelector('[data-part="activity"]');
    return {
      unit: root.lxStep?.placement?.unit ?? null,
      kind: root.lxStep?.kind ?? null,
      count: root.querySelector(".lx-session-count")?.textContent ?? "",
      filled: Number(bar?.getAttribute("aria-valuenow") ?? 0),
      of: Number(bar?.getAttribute("aria-valuemax") ?? 0),
      actions: [...root.querySelectorAll('[data-part="answer-bar"] [data-part="button"]')].map((b) => b.textContent.trim()),
      scrolls: activity ? activity.scrollHeight > activity.clientHeight + 1 : false,
      fit: activity ? `${activity.scrollHeight} in ${activity.clientHeight}, data-fit ${root.getAttribute("data-fit") ?? "none"}, order-fit ${root.hasAttribute("data-order-fit")}, step ${root.getAttribute("data-step")}` : "",
      summary: Boolean(root.querySelector('[data-part="session-summary"][data-kind="placement"]')),
    };
  }, SESSION);

async function stage(name, run) {
  if (ONLY && !ONLY.test(name)) return;
  try {
    const note = await run();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
    report.push({ name, ok: true, note });
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${String(error.message ?? error).split("\n").slice(0, 2).join(" | ")}`);
    report.push({ name, ok: false, note: String(error.message ?? error) });
  }
}

/** Plays a placement to its result as a learner who knows units 1..knows (right there, wrong past it), every step looked at. */
async function playAs(page, dir, knows, { pictures = false } = {}) {
  const seen = [];
  let last = 0;
  let wordShot = false;
  let sentenceShot = false;
  for (let i = 0; i < 50; i++) {
    const step = await nextStep(page);
    if (!step || step.kind === "summary") break;
    const now = await look(page);
    ok(now.unit, `step ${i + 1} (${now.kind}) carries no unit`);
    ok(now.count === "Finding your level", `its count says "${now.count}"`);
    ok(!now.actions.some((a) => /Hint|Words|Can't listen/.test(a)), `its actions: ${now.actions.join(", ")}`);
    if (now.scrolls) {
      await shot(page, dir, `scrolls-step-${i + 1}`);
      ok(false, `step ${i + 1} (${now.kind}, unit ${now.unit}) scrolls: ${now.fit}`);
    }
    const share = now.of ? now.filled / now.of : 0;
    ok(share + 1e-9 >= last, `its bar went back: ${last.toFixed(2)} → ${share.toFixed(2)}`);
    ok(share < 1, "its bar full before the result");
    last = share;
    if (pictures && !wordShot && now.kind === "word") {
      await shot(page, dir, "2-word-question");
      wordShot = true;
    }
    if (pictures && !sentenceShot && now.kind === "translate") {
      // A word tapped in the sentence: no meaning comes up.
      const word = page.locator(`${SESSION} [data-part="spoken-word"]`).first();
      if (await word.count()) {
        await word.click();
        await page.waitForTimeout(300);
        ok(!(await page.locator('[data-part="word-popover"]').count()), "a tapped word's meaning came up");
      }
      await shot(page, dir, "3-sentence-question");
      sentenceShot = true;
    }
    seen.push(`${now.unit}${now.kind[0]}`);
    await answerStep(page, { wrong: now.unit > knows, next: false });
  }
  await page.locator(`${SESSION} [data-part="session-summary"][data-kind="placement"]`).waitFor({ timeout: 10_000 });
  const end = await look(page);
  ok(end.filled === end.of && end.of > 0, `its bar at the result: ${end.filled} of ${end.of}`);
  return { seen, questions: seen.length };
}

for (const scheme of SCHEMES) {
  for (const size of SIZES) {
    const tag = `${size[0]}x${size[1]} ${scheme}`;
    const dir = join(OUT, `${scheme}-${size[0]}`);
    mkdirSync(dir, { recursive: true });

    await stage(`${tag}: the first run asks a full course's learner whether they know some already; an answer starts the check at its unit; a learner of units 1–7 is placed at unit 8, by real presses, only right answers kept`, async () => {
      const { context, page, errors, asked } = await phone(size, scheme);
      await signUp(page);
      const few = await firstRun(page, "few");
      const words = await page.locator(".lx-welcome").innerText();
      ok(/Do you know some Dutch already\?/.test(words) && /about 20 questions/.test(words) && /No, I'm new to it/.test(words), `the question: ${words.replace(/\s+/g, " ").slice(0, 200)}`);
      await page.waitForTimeout(600);
      await shot(page, dir, "1-first-run");
      const startedAt = Date.now();
      const from = asked.length;
      await few.click();
      const units = await lessonsIn(page);
      ok(units.length === 16, `Dutch's units: ${units.length}`);
      await page.waitForSelector(`${SESSION}[data-placement]`, { timeout: 60_000 });
      const first = await look(page);
      ok(first.unit === 2, `A few words starts at unit ${first.unit}`);
      const played = await playAs(page, dir, KNOWS, { pictures: true });
      // Its result.
      const result = (await page.locator(`${SESSION} [data-part="session-summary"]`).innerText()).replace(/\s+/g, " ");
      ok(/Start at unit 8/.test(result) && /Unit 8 · Plans for tomorrow is next/.test(result) && /Units 1 to 7 are behind you/.test(result), `its result: ${result.slice(0, 220)}`);
      const checks = await page.locator(`${SESSION} .lx-placement-row[data-done] .lx-placement-done`).count();
      ok(checks === 7, `units behind with a check: ${checks}`);
      // Its tally's labels each on one line, as a summary's are (two words, units tried, broke at 320 out of line with the rest).
      const lines = await page.locator(`${SESSION} [data-part="session-summary"] .lx-stat > span`).evaluateAll((spans) =>
        spans.map((span) => {
          const range = document.createRange();
          range.selectNodeContents(span);
          return [span.textContent, new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size];
        }),
      );
      ok(lines.length === 3 && lines.every(([, n]) => n === 1), `its tally's labels: ${JSON.stringify(lines)}`);
      await page.waitForTimeout(500);
      await shot(page, dir, "4-placed");
      // Only right answers kept.
      const rows = await page.evaluate(async (t0) => (await import("/js/study/progress.js")).allEvidence().filter((row) => row.at >= t0).map((row) => row.outcome), startedAt);
      ok(rows.length > 0 && rows.every((o) => o === "right"), `kept: ${[...new Set(rows)].join(", ")} (${rows.length})`);
      // Nothing asked of the server meanwhile but what the app syncs anyway (the account's copy, your packs' relay), error reports and the library:
      // a placement sends nothing of its own.
      const outside = asked.slice(from).filter((path) => path.startsWith("/api/") && !/^\/api\/(account\/sync|packs\/(device|inbox)|errors|me)\b/.test(path));
      ok(!outside.length, `asked: ${[...new Set(outside)].join(", ")}`);
      // Start unit 8: its first lesson, the path placed.
      await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`, { hasText: "Start unit 8" }).click();
      await page.waitForSelector(`${SESSION}[data-lesson="${units[7].first}"]`, { timeout: 30_000 });
      const placed = await page.evaluate(async () => (await import("/js/study/path-place.js")).placementOn("nl")?.placed);
      ok(placed?.n === 8 && placed.lessons.length > 80, `the placement kept: ${JSON.stringify(placed && { n: placed.n, lessons: placed.lessons.length })}`);
      ok(!errors.length, errors.slice(0, 3).join(" | "));
      await context.close();
      return `${played.questions} questions (${played.seen.join(" ")}), ${rows.length} right answers kept`;
    });

    await stage(`${tag}: No, I'm new to it opens nothing and takes nothing; Study offers Find your level to a new learner`, async () => {
      const { context, page, errors } = await phone(size, scheme);
      await signUp(page);
      const row = await firstRun(page, "new");
      await row.click();
      await page.waitForTimeout(800);
      ok(!(await page.locator(SESSION).count()), "a session opened");
      const taken = await page.evaluate(async () => (await import("/js/study/path-place.js")).placementOn("nl"));
      ok(!taken, `noted: ${JSON.stringify(taken)}`);
      await lessonsIn(page);
      await page.evaluate(() => (location.hash = "#study"));
      const offer = page.locator('[data-part="page"]:not([data-ghost]) [data-part="list-row"]', { hasText: "Know some Dutch already?" });
      await offer.waitFor({ timeout: 20_000 });
      await page.waitForTimeout(800);
      await shot(page, dir, "7-study-row");
      ok(!errors.length, errors.slice(0, 3).join(" | "));
      await context.close();
    });

    await stage(`${tag}: stopping partway asks Stop here?; Keep going goes on; Start at unit 6 (unit 5 shown) opens unit 6's first lesson; and Study's row is gone once it's been taken`, async () => {
      const { context, page, errors } = await phone(size, scheme);
      await signUp(page);
      await (await firstRun(page, "by")).click();
      const units = await lessonsIn(page);
      await page.waitForSelector(`${SESSION}[data-placement]`, { timeout: 60_000 });
      for (let i = 0; i < 5; i++) await answerStep(page, { next: false });
      await nextStep(page);
      await page.locator(`${SESSION} [data-part="session-bar"] [data-part="icon-button"]`).first().click();
      const sheet = page.locator("[data-placement-stop]");
      await sheet.waitFor({ timeout: 10_000 });
      const words = (await sheet.innerText()).replace(/\s+/g, " ");
      ok(/Stop here\?/.test(words) && /shown units 1 to 5/.test(words) && /Start at unit 6/.test(words) && /Keep going/.test(words), `the sheet: ${words}`);
      await page.waitForTimeout(500);
      await shot(page, dir, "5-stop");
      const before = (await look(page)).unit;
      await sheet.getByRole("button", { name: "Keep going" }).click();
      await page.waitForTimeout(500);
      ok((await look(page))?.unit === before, "Keep going didn't leave the check where it was");
      await page.locator(`${SESSION} [data-part="session-bar"] [data-part="icon-button"]`).first().click();
      await page.locator("[data-placement-stop]").getByRole("button", { name: "Start at unit 6" }).click();
      await page.waitForSelector(`${SESSION}[data-lesson="${units[5].first}"]`, { timeout: 30_000 });
      await page.keyboard.press("Escape");
      await page.evaluate(() => (location.hash = "#study"));
      await page.waitForTimeout(1500);
      const offered = await page.locator('[data-part="page"]:not([data-ghost]) [data-part="list-row"]', { hasText: "Know some Dutch already?" }).count();
      ok(offered === 0, "Study still offers it once it's been taken");
      ok(!errors.length, errors.slice(0, 3).join(" | "));
      await context.close();
    });

    await stage(`${tag}: knowing nothing: Start from the beginning (Tinta, no box), Start lesson 1 opening lesson 1, nothing placed`, async () => {
      const { context, page, errors } = await phone(size, scheme);
      await signUp(page);
      await (await firstRun(page, "few")).click();
      const units = await lessonsIn(page);
      await page.waitForSelector(`${SESSION}[data-placement]`, { timeout: 60_000 });
      await playAs(page, dir, 0);
      const result = (await page.locator(`${SESSION} [data-part="session-summary"]`).innerText()).replace(/\s+/g, " ");
      ok(/Start from the beginning/.test(result) && /Lesson 1 is the place to start/.test(result), `its result: ${result}`);
      ok(!(await page.locator(`${SESSION} [data-part="session-summary"] [data-part="empty-state"]`).count()), "an empty state's box on it");
      ok(await page.locator(`${SESSION} .lx-placement-tinta lx-tinta, ${SESSION} .lx-placement-tinta [data-part="character"]`).count(), "no Tinta on it");
      await page.waitForTimeout(800);
      await shot(page, dir, "6-beginning");
      await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`, { hasText: "Start lesson 1" }).click();
      await page.waitForSelector(`${SESSION}[data-lesson="${units[0].first}"]`, { timeout: 30_000 });
      const placement = await page.evaluate(async () => (await import("/js/study/path-place.js")).placementOn("nl"));
      ok(placement && !placement.placed && placement.taken > 0, `noted: ${JSON.stringify(placement)}`);
      ok(!errors.length, errors.slice(0, 3).join(" | "));
      await context.close();
    });

    await stage(`${tag}: Settings → Study: Find your level (last placed at unit 8), Start from the beginning and its Undo`, async () => {
      const { context, page, errors } = await phone(size, scheme);
      await signUp(page);
      await (await firstRun(page, "few")).click();
      await lessonsIn(page);
      await page.waitForSelector(`${SESSION}[data-placement]`, { timeout: 60_000 });
      await playAs(page, dir, KNOWS);
      await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`, { hasText: "Start unit 8" }).click();
      await page.waitForTimeout(1500);
      await page.evaluate(() => (location.hash = "#settings/study"));
      const find = page.locator('[data-part="page"]:not([data-ghost]) [data-part="list-row"]', { hasText: "Find your level" });
      await find.waitFor({ timeout: 20_000 });
      ok(/Last placed at unit 8/.test(await find.innerText()), `its row: ${await find.innerText()}`);
      await page.waitForTimeout(600);
      await shot(page, dir, "8-settings");
      await page.locator('[data-part="page"]:not([data-ghost]) [data-part="list-row"]', { hasText: "Start from the beginning" }).click();
      await page.waitForTimeout(500);
      const cleared = await page.evaluate(async () => (await import("/js/study/path-place.js")).placementOn("nl")?.placed ?? null);
      ok(cleared === null, "still placed after Start from the beginning");
      await shot(page, dir, "9-settings-undo");
      // Its Undo where it can be pressed as it shows, nothing scrolled: in view, and nothing over it (at the page's end, a 320 × 568 phone's
      // tab bar was).
      const undo = page.locator(".lx-settings-message").getByRole("button", { name: "Undo" });
      const reach = await undo.evaluate((button) => {
        const box = button.getBoundingClientRect();
        const at = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return { top: Math.round(box.top), bottom: Math.round(box.bottom), height: innerHeight, pressable: Boolean(at && button.contains(at)) };
      });
      ok(reach.pressable && reach.top >= 0 && reach.bottom <= reach.height, `its Undo can't be pressed where it shows: ${JSON.stringify(reach)}`);
      await undo.click();
      await page.waitForTimeout(500);
      const back = await page.evaluate(async () => (await import("/js/study/path-place.js")).placementOn("nl")?.placed?.n ?? null);
      ok(back === 8, `after Undo: placed at ${back}`);
      ok(!errors.length, errors.slice(0, 3).join(" | "));
      await context.close();
    });
  }
}

writeFileSync(join(OUT, "results.json"), JSON.stringify(report, null, 1));
await browser.close();
console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`);
process.exit(failed ? 1 : 0);
