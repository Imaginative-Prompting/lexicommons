// The walk: everything a person can reach, played on a real page while frame-watch.mjs records every frame, on a phone, by real
// touch at a person's pace and at speed, including presses in the middle of a move. Each scene ends with what's on the screen at
// rest. Writes every candidate with the frames around it; a person looks at each one (frame-watch.mjs says why).
//
// Usage (headless, through gpu.py's parallel lane, from the channel repo root):
//   node 08-lexicommons/app/scripts/frame-check.mjs http://localhost:<port> <outDir> [--only sessions,tabs,sheets,…] [--games a,b]
//     [--vw 390 --vh 844] [--motion off] [--theme <id>] [--rtl] [--engine webkit] [--slow <ms>] [--expect <file>]
// --plant runs the planted glitches first: each must be caught, or the walk proves nothing and it exits 3.
// --only text (asked for by name; it takes a while): every route, every control and what it opens, each field; as a new account, as someone who has
//   studied, offline, with the server failing; and the pages outside the app. Finds the words only code prints (frame-watch's strays): every other group
//   finds them too, in the scenes it goes through. [--crawl-minutes n] a ceiling on the presses per pass (every route is always reached; 0: none), [--routes '#a,#b'] only those.
// --swap <path under public>=<file> serves one file as it was, to see a check fail on the line that broke.
// --expect <file>: the classes a fix closed ({ "<scene or *>": { "<kind>": 0 } }); any over its count fails. Exit 0 = nothing over.
// LOCAL only: it signs up a test account. The server needs the Dutch lessons and word packs seeded.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "./quiet-browser.mjs";
import * as fw from "./frame-watch.mjs";
import { knowWords } from "./fixtures/know-words.mjs";
import { fillChoice } from "./fixtures/step-text.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const [BASE, outArg] = argv;
const OUT = outArg && resolve(outArg);
const opt = (name, fallback = null) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
const has = (name) => argv.includes(`--${name}`);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/frame-check.mjs http://localhost:<port> <outDir> [--only groups] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const only = opt("only")?.split(",") ?? null;
const wanted = (group) => !only || only.includes(group);
const VW = Number(opt("vw", 390));
const VH = Number(opt("vh", 844));
const ENGINE = opt("engine", "chromium");
const SLOW = Number(opt("slow", 450));
const GAMES = opt("games")?.split(",") ?? ["choose", "arrange", "place", "fill", "type", "listen", "meaning", "say", "repeat", "match"];
const SESSION = '[data-part="session"]:not([data-ghost])';
const THEME = opt("theme");
const LANG = opt("lang"); // a language whose starter this device takes, right to left or otherwise
const SLOW_NET = Number(opt("slow-net", 0));
const CRAWL_MINUTES = Number(opt("crawl-minutes", 25)); // --only text: a ceiling for each pass through the app
const ROUTES = opt("routes")?.split(",") ?? null; // --only text --routes '#a,#b': only these, once, as a new account

const browser = await (ENGINE === "webkit" ? webkit : chromium).launch({ headless: true });
const contextOptions = { viewport: { width: VW, height: VH }, deviceScaleFactor: 2, hasTouch: true, isMobile: ENGINE !== "webkit", serviceWorkers: "block" };
let context = await browser.newContext(contextOptions);
let page = await context.newPage();
let cdp = ENGINE === "webkit" ? null : await context.newCDPSession(page);
const pageErrors = [];
const watchErrors = (p) => {
  p.on("pageerror", (e) => pageErrors.push(String(e)));
  p.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource/.test(m.text()) && pageErrors.push(`console: ${m.text()}`));
};
watchErrors(page);
await fw.install(page);
// --swap js/shell/x.js=/some/old.js: the app with one file as it was, to see a check fail on the line that broke.
for (let i = argv.indexOf("--swap"); i >= 0; i = argv.indexOf("--swap", i + 1)) {
  const [path, file] = argv[i + 1].split("=");
  await context.route(`**/${path}*`, (route) => route.fulfill({ path: file, contentType: "text/javascript" }));
  console.log(`swapped ${path} for ${file}`);
}

// ---------- recording a scene ----------

const all = [];
const scenes = [];
const stageErrors = [];

function startCast() {
  if (!cdp) return () => [];
  const shots = [];
  const onFrame = (event) => {
    shots.push({ wall: event.metadata.timestamp * 1000, data: event.data });
    cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {});
  };
  cdp.on("Page.screencastFrame", onFrame);
  cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1, maxWidth: VW * 2, maxHeight: VH * 2 }).catch(() => {});
  return async () => {
    cdp.off("Page.screencastFrame", onFrame);
    await cdp.send("Page.stopScreencast").catch(() => {});
    return shots;
  };
}

const safe = (name) => name.replace(/[^a-z0-9._-]+/gi, "-");
const strayRows = (rows, label) => rows.map((row) => ({ kind: "stray-text", label, part: row.part, what: `"${row.text}" (${row.how}) in ${row.part} at ${row.hash}: ${row.around}` }));

/** Plays `act` while recording; what it found, and the screen at rest after it, go on the list. */
async function scene(name, act, { settle = 700, rest = true, scrolled = false } = {}) {
  const stopCast = startCast();
  await fw.start(page);
  let error = null;
  try {
    await act();
  } catch (e) {
    error = e;
    stageErrors.push(`${name}: ${e.message?.split("\n")[0]}`);
    console.log(`  (scene ${name} stopped: ${e.message?.split("\n")[0]})`);
  }
  if (settle) await page.waitForTimeout(settle);
  const run = await fw.stop(page).catch(() => null);
  const shots = await stopCast();
  if (!run) return [];
  const found = fw.analyze(run, { label: name, scrolled });
  const atRest = rest && !error ? await fw.settled(page, { label: name }).catch(() => []) : [];
  const list = [...found, ...atRest, ...strayRows(await fw.strays(page).catch(() => []), name)];
  for (const row of list) row.scene = name;
  all.push(...list);
  scenes.push({ name, frames: run.frames.length, found: found.length, atRest: atRest.length });
  // The picture of each candidate's moment, to look at frame by frame, and the rectangles.
  if (found.length && shots.length) {
    const dir = join(OUT, "frames", safe(name));
    mkdirSync(dir, { recursive: true });
    const moments = found.filter((c) => c.wall).map((c) => c.wall);
    let n = 0;
    for (const shot of shots) {
      if (!moments.some((at) => shot.wall >= at - 120 && shot.wall <= at + 500)) continue;
      writeFileSync(join(dir, `${String(++n).padStart(3, "0")}-${Math.round(shot.wall - moments[0])}ms.jpg`), Buffer.from(shot.data, "base64"));
    }
    writeFileSync(join(dir, "run.json"), JSON.stringify(run));
  }
  console.log(`  ${name}: ${run.frames.length} frames, ${found.length} moving, ${atRest.length} at rest`);
  return list;
}

// ---------- pressing, as a finger ----------

const centerOf = (selectorOrLocator) => (typeof selectorOrLocator === "string" ? page.locator(selectorOrLocator).first() : selectorOrLocator);
async function press(target) {
  const locator = centerOf(target);
  await locator.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  const box = await locator.boundingBox({ timeout: 3000 });
  if (!box) throw new Error(`nothing to press: ${target}`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}
/** A press where it is this very instant, no waiting for anything to settle. */
async function pressNow(selector) {
  const point = await page.evaluate((selector) => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);
  if (!point) return false;
  await page.touchscreen.tap(point.x, point.y);
  return true;
}
const barButton = (name) => page.locator(`${SESSION} [data-part="answer-bar"] button`, { hasText: name }).first();
const hasBarButton = async (name) => (await barButton(name).count()) > 0;
const pause = (ms = SLOW) => page.waitForTimeout(ms);

// ---------- sessions ----------

const stepInfo = () =>
  page.evaluate(async (SESSION) => {
    const root = document.querySelector(SESSION);
    if (!root) return null;
    const { itemById, sentence, WORDS, CHUNKS } = await import("/js/study/content.js");
    const { shortMeaning } = await import("/js/study/new-words.js");
    const chunkEn = Object.fromEntries(Object.values(CHUNKS).map((chunk) => [chunk.text, chunk.en]));
    const lxStep = root.lxStep;
    // The gloss a Match item really shows, of those it could be (a session's game and a lesson's differ).
    const shownEn = new Set([...root.querySelectorAll('[data-part="match-item"][data-side="en"]')].map((n) => n.textContent.trim()));
    const matchEn = (word) => [chunkEn[word], shortMeaning(word), WORDS[word]].find((en) => en && shownEn.has(en.trim())) ?? WORDS[word] ?? null;
    void lxStep;
    const id = root.getAttribute("data-item");
    const item = id ? itemById.get(id) : null;
    const target = root.getAttribute("data-target");
    return {
      kind: root.getAttribute("data-step"),
      summary: Boolean(root.querySelector('[data-part="session-summary"]')),
      item: item ? { ...item, sentence: sentence(item) } : null,
      target,
      gloss: target ? WORDS[target] : null,
      words: Object.fromEntries([...root.querySelectorAll('[data-part="match-item"][data-side="nl"]')].map((n) => [n.dataset.word, matchEn(n.dataset.word)])),
      tileLang: root.querySelector('[data-part="arrange-bank"] [data-part="tile"]')?.getAttribute("lang") ?? null,
      prompt: root.querySelector('[data-part="activity-prompt"] > span')?.textContent ?? "",
    };
  }, SESSION);

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exact = (text) => new RegExp(`^\\s*${escapeRe(text)}\\s*$`);
const placeIndex = (item) => Math.max(...item.moved.map((w) => item.words.findIndex(([t]) => t === w)).filter((i) => i >= 0), -1);

/** Answers the step on screen, right or wrong, by real touch. wait: between a game's own presses. */
async function answer(info, { wrong = false, wait = 0 } = {}) {
  const session = page.locator(SESSION);
  const { kind, item } = info;
  const breathe = () => (wait ? page.waitForTimeout(wait) : Promise.resolve());
  if (kind === "match") {
    const pairs = Object.entries(info.words);
    for (const [nl, en] of pairs) {
      await press(session.locator(`[data-part="match-item"][data-side="nl"][data-word="${nl}"]`));
      await breathe();
      if (en) await press(session.locator(`[data-part="match-item"][data-side="en"]`).filter({ hasText: exact(en) }).first());
      else {
        // A word the walk has no gloss for (a phrase's): each left in turn, until it's the one.
        const left = session.locator('[data-part="match-item"][data-side="en"]:not([data-state="matched"])');
        for (let i = 0; i < (await left.count()); i++) {
          await press(left.nth(i));
          await page.waitForTimeout(500); // past a wrong one's shake, so it isn't pressed mid-answer
          if ((await session.locator(`[data-part="match-item"][data-side="nl"][data-word="${nl}"][data-state="matched"]`).count()) > 0) break;
          await press(session.locator(`[data-part="match-item"][data-side="nl"][data-word="${nl}"]`));
          await breathe();
        }
      }
      await breathe();
    }
    return;
  }
  if (await session.locator('[data-part="type-answer"] input, [data-part="write-sentence"] input, [data-part="write-sentence"] textarea, input[type="text"], textarea').count()) {
    const field = session.locator('input[type="text"], textarea').first();
    await press(field);
    await breathe();
    await field.pressSequentially(wrong ? "xyz" : item.sentence, { delay: wait ? 25 : 2 });
    await breathe();
    if (await hasBarButton("Check")) await press(barButton("Check"));
    else await field.press("Enter");
    return;
  }
  const tiles = session.locator('[data-part="arrange-bank"] [data-part="tile"]');
  if (await tiles.count()) {
    const inEnglish = info.tileLang === "en";
    const order = inEnglish ? item.literal.map(([t]) => t) : item.words.map(([t]) => t);
    for (const word of wrong ? [...order].reverse() : order) {
      await press(session.locator('[data-part="arrange-bank"] [data-part="tile"]:not([data-state="used"])', { hasText: exact(word) }).first());
      await breathe();
    }
    await press(barButton("Check"));
    return;
  }
  const gaps = session.locator('[data-part="place-gap"]');
  if (await gaps.count()) {
    const at = placeIndex(item);
    await press(gaps.nth(wrong ? (at === 0 ? 1 : 0) : at));
    return;
  }
  if (await session.locator('[data-part="fill-sentence"]').count()) {
    const right = fillChoice(item.words[item.gap.index][0]);
    const options = item.gap.options.map((o) => fillChoice(typeof o === "string" ? o : o.text));
    const pick = wrong ? options.find((o) => o !== right) : right;
    await press(session.locator(".lx-game button", { hasText: exact(pick) }).first());
    return;
  }
  const choices = session.locator('[data-part="choice"]');
  if (await choices.count()) {
    const wanted = kind === "meaning" ? info.gloss : kind === "listen" ? item.means : item.sentence;
    const list = await choices.allTextContents();
    const at = list.findIndex((text) => text.trim() === wanted || text.includes(wanted));
    await press(choices.nth(wrong ? (at === 0 ? 1 : 0) : Math.max(0, at)));
    return;
  }
  throw new Error(`no way to answer a ${kind} step (${info.prompt})`);
}

async function openGame(game) {
  await page.goto(`${BASE}/app/#today`);
  await page.waitForFunction((s) => !document.querySelector(s), SESSION, { timeout: 8000 }).catch(() => {});
  await knowWords(page);
  await page.goto(`${BASE}/app/#study/session/game/${game}`);
  await page.waitForSelector(`${SESSION} [data-part="activity-prompt"]`, { timeout: 10000 });
  await page.evaluate(() => document.fonts.ready);
}

async function sessionWalk(game) {
  // A step entering, at a person's pace.
  await page.goto(`${BASE}/app/#today`);
  await page.waitForFunction((s) => !document.querySelector(s), SESSION, { timeout: 8000 }).catch(() => {});
  await knowWords(page);
  await page.waitForTimeout(300);
  await scene(`${game}/start`, async () => {
    await page.evaluate((game) => (location.hash = `#study/session/game/${game}`), game);
    await page.waitForSelector(`${SESSION} [data-part="activity-prompt"]`, { timeout: 10000 });
  }, { settle: 900 });

  // Right, then Continue: the result bar coming and going, the next step coming in.
  let info = await stepInfo();
  if (info?.summary || !info?.kind) return;
  if (info.kind === "card" || info.kind === "meet") {
    await scene(`${game}/card`, async () => {
      if (await hasBarButton("Show meaning")) await press(barButton("Show meaning"));
    });
  } else if (game === "say" || game === "repeat") {
    await scene(`${game}/mic`, async () => {
      const mic = page.locator(`${SESSION} [data-part="mic-button"]`).first();
      if (await mic.count()) await press(mic);
      await pause(800);
    }, { settle: 900 });
    await scene(`${game}/idk`, async () => press(barButton("I don't know")));
    await scene(`${game}/continue`, async () => press(barButton("Continue")), { settle: 900 });
    info = await stepInfo();
    if (info && !info.summary) {
      await scene(`${game}/cant-speak`, async () => {
        if (await hasBarButton("Can't speak")) await press(barButton("Can't speak"));
      }, { settle: 900 });
    }
    return;
  } else {
    await scene(`${game}/answer-right`, () => answer(info, { wait: SLOW / 2 }));
  }
  const next = async (name) => {
    const button = page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first();
    if (await button.count()) await scene(name, () => press(button), { settle: 900 });
  };
  await next(`${game}/continue-after-right`);

  // Wrong.
  info = await stepInfo();
  if (info && !info.summary && !["card", "meet"].includes(info.kind) && game !== "match") {
    await scene(`${game}/answer-wrong`, () => answer(info, { wrong: true, wait: SLOW / 2 }));
    await next(`${game}/continue-after-wrong`);
  } else if (info && !info.summary && game === "match") {
    // A wrong pair: its shake and its fading, and a press during it.
    await scene("match/wrong-pair", async () => {
      const [nl] = Object.keys(info.words);
      const en = Object.values(info.words)[1];
      await press(page.locator(`${SESSION} [data-part="match-item"][data-side="nl"][data-word="${nl}"]`));
      await pause(200);
      await press(page.locator(`${SESSION} [data-part="match-item"][data-side="en"][data-word="${en}"]`));
      await pause(1000);
    });
    await scene("match/answer-right-after-miss", () => answer(info, { wait: SLOW / 2 }));
    await next("match/continue-after-miss");
  }

  // I don't know.
  info = await stepInfo();
  if (info && !info.summary && !["match", "card", "meet"].includes(info.kind) && (await hasBarButton("I don't know"))) {
    await scene(`${game}/idk`, () => press(barButton("I don't know")));
    await next(`${game}/continue-after-idk`);
  }

  // The hint, the Words sheet, a word's meaning, the literal line's order switch.
  info = await stepInfo();
  if (info && !info.summary) {
    if (await hasBarButton("Hint")) await scene(`${game}/hint`, () => press(barButton("Hint")), { settle: 1500 });
    if (await hasBarButton("Words")) {
      await scene(`${game}/words-open`, () => press(barButton("Words")), { settle: 800 });
      const shade = page.locator('[data-part="sheet-shade"], [data-part="sheet-layer"] > :first-child').first();
      await scene(`${game}/words-close`, async () => {
        if (await shade.count()) await page.touchscreen.tap(VW / 2, 40);
      }, { settle: 800 });
    }
    // Answer and press Continue straight away, on speed.
    await scene(`${game}/fast-through`, async () => {
      for (let i = 0; i < 12; i++) {
        const now = await stepInfo();
        if (!now || now.summary) break;
        if (now.kind === "say" || now.kind === "repeat") await press(barButton("I don't know"));
        else if (now.kind === "card" || now.kind === "meet") {
          if (await hasBarButton("Show meaning")) await press(barButton("Show meaning"));
        } else await answer(now, { wrong: i % 2 === 1 }).catch(() => {});
        const button = page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first();
        if (await button.count()) await pressNow(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`);
      }
    }, { settle: 1200 });
  }
  // What's left: the summary, if it got there.
  info = await stepInfo();
  if (info?.summary) {
    const leave = page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first();
    await scene(`${game}/summary-leave`, () => press(leave), { settle: 900 });
  }
}

// ---------- the rule: an animation never stops a press ----------

// A press in the middle of the last one's move, at several points through it, must take effect at once. Each case: `first`
// presses something, then after `at` ms `second` presses the next; `took` (run in the page, at the next frame) says whether the second
// took effect. A failure is a press that was dropped, queued for later, or left showing a highlight.
const interruptions = [];
const DELAYS = [0, 16, 50, 120, 250];
const nextFrame = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));

async function tapAt(selector, { sloppy = 0 } = {}) {
  const point = await page.evaluate((selector) => {
    const node = document.querySelector(selector);
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, selector);
  if (!point) return false;
  if (sloppy && cdp) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: point.x + sloppy, y: point.y + sloppy / 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else await page.touchscreen.tap(point.x, point.y);
  return true;
}

async function interruptCase(name, { open, first, second, took, at = DELAYS }) {
  for (const delay of at) {
    let result = "not run";
    let detail = null;
    try {
      await open();
      await page.waitForTimeout(500);
      await first();
      if (delay) await page.waitForTimeout(delay);
      const pressed = await second();
      await nextFrame();
      detail = pressed === false ? "nothing to press" : await took();
      result = detail === true ? "took" : "DROPPED";
      if (result !== "took") {
        await page.waitForTimeout(700);
        const later = pressed === false ? false : await took();
        if (later === true) result = "LATE";
      }
    } catch (e) {
      result = "ERROR";
      detail = e.message?.split("\n")[0];
    }
    const row = { name, delay, result, detail: detail === true ? null : detail };
    interruptions.push(row);
    console.log(`  ${result.padEnd(7)} ${name} +${delay} ms${row.detail ? `: ${JSON.stringify(row.detail).slice(0, 110)}` : ""}`);
    if (result !== "took") all.push({ kind: "press-dropped", scene: `interrupt/${name}`, label: name, part: name.split(" ")[0], what: `the second press, ${delay} ms into the first's move: ${result}${row.detail ? ` (${JSON.stringify(row.detail).slice(0, 90)})` : ""}` });
  }
}

const inSession = (rest) => `${SESSION} ${rest}`;
const bankTile = (i) => inSession(`[data-part="arrange-bank"] [data-part="tile"]:nth-child(${i + 1})`);
async function interruptWalk() {
  const arrangeTook = () =>
    page.evaluate((SESSION) => {
      const placed = [...document.querySelectorAll(`${SESSION} [data-part="arrange-answer"] [data-part="tile"]:not([data-drop])`)];
      const bank = [...document.querySelectorAll(`${SESSION} [data-part="arrange-bank"] [data-part="tile"]`)];
      const second = bank[1];
      return placed.length === 2 && second?.getAttribute("data-state") === "used" ? true : { placed: placed.map((n) => n.textContent), second: second?.getAttribute("data-state") ?? null, active: document.querySelector(":active")?.getAttribute?.("data-part") ?? null };
    }, SESSION);
  await interruptCase("arrange: a second tile during the first's flight", { open: () => openGame("arrange"), first: () => tapAt(bankTile(0)), second: () => tapAt(bankTile(1)), took: arrangeTook });
  await interruptCase("arrange: a sloppy second tap (7 px of finger)", { open: () => openGame("arrange"), first: () => tapAt(bankTile(0)), second: () => tapAt(bankTile(1), { sloppy: 7 }), took: arrangeTook, at: [50] });
  await interruptCase("arrange: a sloppy second tap (10 px of finger)", { open: () => openGame("arrange"), first: () => tapAt(bankTile(0)), second: () => tapAt(bankTile(1), { sloppy: 10 }), took: arrangeTook, at: [50] });
  await interruptCase("arrange: a placed tile sent back during its flight", {
    open: () => openGame("arrange"),
    first: () => tapAt(bankTile(0)),
    second: () => tapAt(inSession('[data-part="arrange-answer"] [data-part="tile"]:not([data-drop])')),
    took: () => page.evaluate((SESSION) => (document.querySelectorAll(`${SESSION} [data-part="arrange-answer"] [data-part="tile"]:not([data-drop])`).length === 0 ? true : "still placed"), SESSION),
  });
  const continued = (before) => () =>
    page.evaluate(({ SESSION, before }) => {
      const root = document.querySelector(SESSION);
      return !root || root.getAttribute("data-item") !== before || root.querySelector('[data-part="session-summary"]') ? true : "still on the step";
    }, { SESSION, before });
  const continueButton = inSession('[data-part="answer-bar"] [data-variant="white"]');
  // Continue pressed during the result bar's arrival, in each kind of game.
  for (const game of ["choose", "fill", "place", "meaning"]) {
    let before = null;
    await interruptCase(`${game}: Continue during the result's arrival`, {
      open: () => openGame(game),
      first: async () => {
        before = await page.evaluate((SESSION) => document.querySelector(SESSION).getAttribute("data-item"), SESSION);
        await answer(await stepInfo());
      },
      second: () => tapAt(continueButton),
      took: () => continued(before)(),
    });
  }
  // Check straight after the last tile, and Continue straight after Check.
  await interruptCase("arrange: Check during the tile's flight", {
    open: () => openGame("arrange"),
    first: () => tapAt(bankTile(0)),
    second: async () => press(barButton("Check")),
    took: () => page.evaluate((SESSION) => (document.querySelector(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`)?.textContent.includes("Continue") ? true : "no result yet"), SESSION),
  });
  // Match: the second of a pair during the first's press; a new pick during a wrong pair's shake; a pair during a right pair's pop.
  const matchWords = () => page.evaluate(async (SESSION) => {
    const { WORDS } = await import("/js/study/content.js");
    return [...document.querySelectorAll(`${SESSION} [data-part="match-item"][data-side="nl"]`)].map((n) => [n.dataset.word, WORDS[n.dataset.word]]);
  }, SESSION);
  const item = (side, word) => inSession(`[data-part="match-item"][data-side="${side}"][data-word="${word}"]`);
  let pairs = [];
  await interruptCase("match: a new pick during a right pair's pop", {
    open: async () => { await openGame("match"); pairs = await matchWords(); },
    first: async () => { await tapAt(item("nl", pairs[0][0])); await page.waitForTimeout(60); await tapAt(item("en", pairs[0][1])); },
    second: () => tapAt(item("nl", pairs[1][0])),
    took: () => page.evaluate((selector) => (document.querySelector(selector)?.getAttribute("data-state") === "selected" ? true : document.querySelector(selector)?.getAttribute("data-state") ?? "no state"), item("nl", pairs[1][0])),
  });
  await interruptCase("match: a new pick during a wrong pair's shake", {
    open: async () => { await openGame("match"); pairs = await matchWords(); },
    first: async () => { await tapAt(item("nl", pairs[0][0])); await page.waitForTimeout(60); await tapAt(item("en", pairs[1][1])); },
    second: () => tapAt(item("nl", pairs[1][0])),
    took: () => page.evaluate((selector) => (document.querySelector(selector)?.getAttribute("data-state") === "selected" ? true : document.querySelector(selector)?.getAttribute("data-state") ?? "no state"), item("nl", pairs[1][0])),
  });
  // A step's own: the Hint, then the Words sheet during its move; the sheet closed during its opening.
  await interruptCase("choose: Words during the Hint's move", {
    open: () => openGame("choose"),
    first: async () => {
      if (await hasBarButton("Hint")) await press(barButton("Hint"));
    },
    second: () => tapAt(inSession('[data-part="answer-bar"] button:has(.lx-icon)') /* the next quiet action */),
    took: async () => true,
    at: [50],
  });
  // Tabs and pages: another tab during the last tab's change; back during a page's slide.
  const onHash = (hash) => () => page.evaluate((hash) => (location.hash.startsWith(hash) ? true : location.hash), hash);
  await interruptCase("tabs: another tab straight after a tab", {
    open: async () => { await page.goto(`${BASE}/app/#today`); await page.waitForSelector('[data-part="tab-bar"]'); },
    first: () => tapAt('[data-part="tab-bar"] a[data-part="tab"]:nth-of-type(2)'),
    second: () => tapAt('[data-part="tab-bar"] a[data-part="tab"]:nth-of-type(3)'),
    took: onHash("#read"),
  });
  await interruptCase("pages: a row during a page's slide", {
    open: async () => { await page.goto(`${BASE}/app/#settings`); await page.waitForSelector('[data-part="list-row"], [data-part="page"] a[href]'); },
    first: () => tapAt('[data-part="page"] a[href^="#settings/"]'),
    second: () => page.evaluate(() => { history.back(); return true; }),
    took: async () => page.evaluate(() => (location.hash === "#settings" ? true : location.hash)),
  });
}

// ---------- a ghost is the thing it stands for ----------

// A copy on the ghost layer has lost every rule that depends on where it stood. It keeps what its parts computed, so while it's drawn and
// when it lands it looks the same: each part in the same place, at the same size, within a pixel.
async function ghostRule() {
  const fails = [];
  const compare = (selector, label) =>
    page.evaluate(async ({ selector, label }) => {
      const motion = await import("/js/lx/motion.js");
      const node = document.querySelector(selector);
      if (!node) return [`${label}: nothing to copy`];
      const rect = node.getBoundingClientRect();
      const ghost = motion.ghostOf(node, rect);
      const walk = (a, b, path, out) => {
        for (let i = 0; i < a.children.length; i++) {
          const x = a.children[i];
          const y = b.children[i];
          if (!y || x.closest("svg, lx-tinta, [data-part='character']") || !x.getClientRects().length) continue;
          const rx = x.getBoundingClientRect();
          const ry = y.getBoundingClientRect();
          const name = `${path} > ${x.getAttribute("data-part") ?? x.className ?? x.tagName}`;
          const off = Math.max(Math.abs(rx.left - ry.left), Math.abs(rx.top - ry.top), Math.abs(rx.width - ry.width), Math.abs(rx.height - ry.height));
          if (off > 1.5) out.push(`${name} "${(x.textContent ?? "").trim().slice(0, 20)}": real ${Math.round(rx.left)},${Math.round(rx.top)} ${Math.round(rx.width)}×${Math.round(rx.height)}, ghost ${Math.round(ry.left)},${Math.round(ry.top)} ${Math.round(ry.width)}×${Math.round(ry.height)}`);
          walk(x, y, name, out);
        }
        return out;
      };
      const out = walk(node, ghost, label, []);
      ghost.remove();
      return out;
    }, { selector, label });
  for (const game of ["choose", "arrange", "fill", "type", "match", "meaning"]) {
    await openGame(game);
    await page.waitForTimeout(500);
    const notes = [...(await compare(`${SESSION} [data-part="answer-bar"]`, `${game} bar`)), ...(await compare(`${SESSION} .lx-step`, `${game} step`))];
    if (await hasBarButton("I don't know")) {
      await press(barButton("I don't know"));
      // (After the literal line's morph, whose words are drawn elsewhere for a moment on purpose.)
      await page.waitForTimeout(1600);
      notes.push(...(await compare(`${SESSION} [data-part="answer-bar"]`, `${game} result bar`)));
    }
    console.log(`  ${notes.length ? "FAIL" : "ok  "} ${game}: ${notes.length ? notes.slice(0, 5).join(" | ") : "every part where it is"}`);
    if (notes.length) fails.push(`${game}: ${notes[0]}`);
  }
  return fails;
}

// ---------- a press always lands: the click iOS leaves out ----------

// iOS sends no click for a tap within a few hundred ms of the last one, or overlapping another finger. Neither Chrome nor WebKit here does
// that, so it's played: pointer events and no click (the real thing: ../scratch/polish/tools/ios-arrange.mjs on an iPhone Simulator).
async function pressRule() {
  const fails = [];
  const expect = (ok, what) => {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`);
    if (!ok) fails.push(what);
  };
  const touch = (selector, { id = 40, type = "pointerup", travel = 0 } = {}) =>
    page.evaluate(({ selector, id, type, travel }) => {
      const node = document.querySelector(selector);
      const r = node.getBoundingClientRect();
      const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: id, pointerType: "touch", bubbles: true, cancelable: true, isPrimary: id === 40, button: 0 };
      node.dispatchEvent(new PointerEvent("pointerdown", at));
      if (travel) node.dispatchEvent(new PointerEvent("pointermove", { ...at, clientX: at.clientX + travel }));
      node.dispatchEvent(new PointerEvent(type, { ...at, clientX: at.clientX + travel }));
    }, { selector, id, type, travel });
  const placedCount = () => page.evaluate((s) => document.querySelectorAll(`${s} [data-part="arrange-answer"] [data-part="tile"]:not([data-drop])`).length, SESSION);
  await openGame("arrange");
  await page.waitForTimeout(600);
  await touch(bankTile(0));
  await page.waitForTimeout(130);
  expect((await placedCount()) === 1, "a tap whose click never comes takes effect by itself");
  await touch(bankTile(1));
  expect((await placedCount()) === 2, "the next tap, too soon for a click: at once, in the press");
  await page.waitForTimeout(700);
  await touch(bankTile(2), { travel: 9 });
  await page.waitForTimeout(130);
  expect((await placedCount()) === 3, "a press whose finger rolls 9 px");
  await page.waitForTimeout(700);
  await touch(bankTile(3), { travel: 30 });
  await page.waitForTimeout(130);
  expect((await placedCount()) === 3, "a drag isn't a press");
  await page.waitForTimeout(700);
  await touch(bankTile(3), { type: "pointercancel" });
  await page.waitForTimeout(130);
  expect((await placedCount()) === 3, "a touch the phone took for a scroll isn't a press");
  // Two fingers overlapping: the second down before the first is up.
  await openGame("arrange");
  await page.waitForTimeout(600);
  await page.evaluate((selectors) => {
    const events = selectors.map((selector, i) => {
      const node = document.querySelector(selector);
      const r = node.getBoundingClientRect();
      return { node, at: { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 50 + i, pointerType: "touch", bubbles: true, cancelable: true, isPrimary: i === 0, button: 0 } };
    });
    events[0].node.dispatchEvent(new PointerEvent("pointerdown", events[0].at));
    events[1].node.dispatchEvent(new PointerEvent("pointerdown", events[1].at));
    events[0].node.dispatchEvent(new PointerEvent("pointerup", events[0].at));
    events[1].node.dispatchEvent(new PointerEvent("pointerup", events[1].at));
  }, [bankTile(0), bankTile(1)]);
  await page.waitForTimeout(160);
  expect((await placedCount()) === 2, "two fingers overlapping: both tiles");
  // The browser's click arriving too must not press twice.
  await openGame("arrange");
  await page.waitForTimeout(600);
  const rect = await page.evaluate((s) => document.querySelector(s).getBoundingClientRect().toJSON(), bankTile(0));
  await page.touchscreen.tap(rect.left + rect.width / 2, rect.top + rect.height / 2);
  await page.waitForTimeout(300);
  const after = await placedCount();
  expect(after === 1, `a real tap with its own click places one tile (${after})`);
  const answerTile = await page.evaluate((s) => document.querySelector(`${s} [data-part="arrange-answer"] [data-part="tile"]`).getBoundingClientRect().toJSON(), SESSION);
  await page.touchscreen.tap(answerTile.left + answerTile.width / 2, answerTile.top + answerTile.height / 2);
  await page.waitForTimeout(300);
  expect((await placedCount()) === 0, "tapped again, it goes back, once");
  // I don't know, then Continue where it was: a bounce is one press, a second press is a second press.
  await openGame("choose");
  await page.waitForTimeout(500);
  const idkAt = await page.evaluate((s) => [...document.querySelectorAll(`${s} [data-part="answer-bar"] button`)].find((b) => b.textContent.includes("I don't know")).getBoundingClientRect().toJSON(), SESSION);
  const idkItem = (await stepInfo()).item?.id;
  await page.touchscreen.tap(idkAt.left + idkAt.width / 2, idkAt.top + idkAt.height / 2);
  await page.waitForTimeout(260);
  const contAt = await page.evaluate((s) => document.querySelector(`${s} [data-part="answer-bar"] [data-variant="white"]`)?.getBoundingClientRect().toJSON(), SESSION);
  await page.touchscreen.tap(contAt.left + contAt.width / 2, contAt.top + contAt.height / 2);
  await page.waitForTimeout(200);
  expect((await stepInfo()).item?.id !== idkItem, "Continue 260 ms after the press before it, on the same spot, goes on");
  // A double tap on Continue: one press. The second doesn't land on the next step's button in its place.
  await openGame("choose");
  await page.waitForTimeout(500);
  await press(barButton("I don't know"));
  await page.waitForTimeout(500);
  const continueAt = await page.evaluate((s) => document.querySelector(`${s} [data-part="answer-bar"] [data-variant="white"]`).getBoundingClientRect().toJSON(), SESSION);
  const itemBefore = (await stepInfo()).item?.id;
  await page.touchscreen.tap(continueAt.left + continueAt.width / 2, continueAt.top + continueAt.height / 2);
  await page.touchscreen.tap(continueAt.left + continueAt.width / 2, continueAt.top + continueAt.height / 2);
  await page.waitForTimeout(300);
  const after2 = await page.evaluate((s) => ({ item: document.querySelector(s).getAttribute("data-item"), count: document.querySelector(`${s} [data-part="session-bar"]`).textContent.trim(), result: Boolean(document.querySelector(`${s} [data-part="answer-bar"][data-meaning]`)) }), SESSION);
  expect(after2.item !== itemBefore && !after2.result, `a double tap on Continue goes on one step and answers nothing (${after2.count}, result showing: ${after2.result})`);
  return fails;
}

// ---------- word order: a toggle or a hint only where there's something to show ----------

async function orderRule() {
  const fails = [];
  const seen = { hint: 0, noHint: 0, toggle: 0, noToggle: 0 };
  const fail = (what) => {
    console.log(`  FAIL ${what}`);
    fails.push(what);
  };
  // A pack of both kinds, the only one on, so a game has to bring up both: each step against the sentence's own words.
  const words = JSON.parse(readFileSync(join(here, "../packs/words-nl-01.json"), "utf8"));
  const { orderDiffers, flipsOrder } = await import("../public/js/lx/literal-case.js");
  const usable = words.items.filter((item) => item.wrong?.length && item.gap);
  const same = usable.filter((item) => !orderDiffers(item) && Array.isArray(item.english)).slice(0, 4);
  const flipping = usable.filter((item) => flipsOrder(item.english)).slice(0, 4);
  const saved = await page.evaluate(async (pack) => {
    const packs = await import("/js/study/packs.js");
    const result = await packs.savePack(pack);
    if (result.ok) for (const other of packs.allPacks()) if (other.language === pack.language && other.id !== pack.id) packs.setPackOn(other.id, false);
    return { ok: result.ok, errors: (result.errors ?? []).slice(0, 3).map((e) => `${e.at}: ${e.message}`) };
  }, { ...words, id: "check-order", name: "Check: word order", items: [...same, ...flipping] });
  if (!saved.ok) fail(`the check's pack wasn't saved: ${saved.errors.join(" | ")}`);
  for (const game of ["choose"]) {
    await openGame(game);
    await page.waitForTimeout(400);
    for (let i = 0; i < 8; i++) {
      const info = await stepInfo();
      if (!info?.item || info.summary || ["card", "meet"].includes(info.kind)) break;
      const expected = await page.evaluate(async (item) => {
        const { orderDiffers, flipsOrder } = await import("/js/lx/literal-case.js");
        return { differs: orderDiffers(item), flips: flipsOrder(item.english) };
      }, info.item);
      const hint = await hasBarButton("Hint");
      if (hint !== expected.differs) fail(`${info.item.id}: Hint ${hint ? "offered" : "not offered"}, its order ${expected.differs ? "differs" : "doesn't"}`);
      seen[hint ? "hint" : "noHint"]++;
      if (!(await hasBarButton("I don't know"))) break;
      await press(barButton("I don't know"));
      await page.waitForTimeout(450);
      const toggle = (await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="order-toggle"]`).count()) > 0;
      if (toggle !== expected.flips) fail(`${info.item.id}: order toggle ${toggle ? "there" : "not there"}, its chunks ${expected.flips ? "flip" : "don't"}`);
      seen[toggle ? "toggle" : "noToggle"]++;
      await press(page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first());
      await page.waitForTimeout(400);
    }
  }
  await page.evaluate(async () => {
    const packs = await import("/js/study/packs.js");
    for (const other of packs.allPacks()) packs.setPackOn(other.id, other.id !== "check-order");
  });
  console.log(`  seen: ${JSON.stringify(seen)}`);
  if (!seen.hint || !seen.noHint || !seen.toggle || !seen.noToggle) fail(`the games didn't bring up both kinds, so this checked nothing: ${JSON.stringify(seen)}`);
  return fails;
}

// ---------- a lesson and a practice, as a learner meets them ----------

async function answerAny(wrong = false) {
  const step = await page.evaluate((SESSION) => {
    const s = document.querySelector(SESSION)?.lxStep;
    return s ? { kind: s.kind, correct: s.correct, answer: s.answer, nl: s.nl, punct: s.punct, optionCount: s.options?.length ?? 0 } : null;
  }, SESSION);
  if (!step) return null;
  const session = page.locator(SESSION);
  const other = (i, n) => (i + 1) % n;
  if (step.kind === "meet") return { step, needsNoAnswer: true };
  if (step.kind === "see") await press(session.locator('[data-part="picture-choice"]').nth(wrong ? other(step.correct, step.optionCount) : step.correct));
  else if (step.kind === "word") await press(session.locator('[data-part="choice"]').nth(wrong ? other(step.correct, step.optionCount) : step.correct));
  else if (step.kind === "translate" && !wrong) {
    for (const word of step.answer) await press(session.locator('[data-part="arrange-bank"] [data-part="tile"]:not([data-state="used"])').and(page.locator(`[data-word=${JSON.stringify(word)}]`)).first());
    await press(barButton("Check"));
  } else {
    const info = await stepInfo();
    if (info.kind === "match") await answer(info, { wait: 90 });
    else if (info.kind === "say" || info.kind === "repeat" || wrong) await press(barButton("I don't know"));
    else await answer(info, { wrong }).catch(async () => {
      if (await hasBarButton("I don't know")) await press(barButton("I don't know"));
    });
  }
  return { step };
}

async function learnerWalk(mode) {
  await goHash("#today");
  await page.waitForFunction((s) => !document.querySelector(s), SESSION, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  await scene(`${mode}/start`, () => goHash(`#study/session/${mode}`), { settle: 900 });
  const seen = new Map();
  for (let i = 0; i < 26; i++) {
    const kind = await page.evaluate((SESSION) => {
      const root = document.querySelector(SESSION);
      if (!root) return null;
      return root.querySelector('[data-part="session-summary"]') ? "summary" : root.lxStep?.kind ?? "none";
    }, SESSION);
    if (!kind || kind === "summary" || kind === "none") break;
    const nth = (seen.get(kind) ?? 0) + 1;
    seen.set(kind, nth);
    const label = `${mode}/${kind}-${nth}`;
    await scene(`${label}/answer`, () => answerAny(nth % 3 === 0), { settle: 900 });
    const button = page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first();
    if (await button.count()) await scene(`${label}/next`, () => press(button), { settle: 800 });
  }
  await page.waitForTimeout(1500);
  const leave = page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first();
  if (await leave.count()) await scene(`${mode}/leave`, () => press(leave), { settle: 900 });
  console.log(`  ${mode}: ${[...seen].map(([k, n]) => `${k} ×${n}`).join(", ")}`);
}

// ---------- everything around the games ----------

const PAGES = ["#today", "#study", "#study/path", "#read", "#read/paste", "#read/find", "#read/library", "#know", "#know/skills", "#know/grammar", "#know/common", "#know/week", "#know/days", "#ai", "#ai/connect", "#practice", "#explore", "#today/translate",
  "#settings", "#settings/about", "#settings/account", "#settings/appearance", "#settings/appearance/themes", "#settings/appearance/colors", "#settings/appearance/customize", "#settings/appearance/images", "#settings/appearance/css", "#settings/appearance/share", "#settings/data", "#settings/install", "#settings/language", "#settings/voice", "#settings/study/games", "#settings/appearance/edit", "#settings/appearance/layout", "#settings/reminders", "#settings/storage", "#settings/streak", "#settings/study", "#settings/study/day", "#settings/study/memory", "#study/packs", "#settings/study/quick", "#settings/study/speaking", "#settings/study/voices"];

async function goHash(hash) {
  await page.evaluate((hash) => (location.hash = hash), hash);
}

async function pagesWalk() {
  // Every page: arriving (from the last one, as a link goes), scrolled to its end and back, then at rest.
  for (const hash of PAGES) {
    await scene(`page/${hash.slice(1)}/arrive`, () => goHash(hash), { settle: 700 });
    await scene(`page/${hash.slice(1)}/scroll`, async () => {
      await page.evaluate(async () => {
        const scroller = document.querySelector('[data-part="page"]');
        if (!scroller) return;
        const end = scroller.scrollHeight - scroller.clientHeight;
        for (let i = 1; i <= 12; i++) {
          scroller.scrollTop = (end * i) / 12;
          await new Promise((r) => requestAnimationFrame(r));
        }
      });
    }, { settle: 200, scrolled: true });
    await page.evaluate(() => { const scroller = document.querySelector('[data-part="page"]'); if (scroller) scroller.scrollTop = 0; });
  }
  // Tabs by the finger, as fast as one can go, and slowly.
  await goHash("#today");
  await page.waitForTimeout(500);
  const tabs = page.locator('[data-part="tab-bar"] [data-part="tab"]:visible');
  const count = await tabs.count();
  for (let i = 0; i < count; i++) await scene(`tabs/slow-${i}`, () => press(tabs.nth(i)), { settle: 600 });
  await scene("tabs/fast", async () => {
    for (let i = 0; i < count * 2; i++) await press(tabs.nth(i % count));
  }, { settle: 700 });
  // Pages: a row going deeper and back, by the finger, and pressed during the slide.
  await goHash("#settings");
  await page.waitForTimeout(500);
  const rows = page.locator('[data-part="page"] a[href^="#settings/"]');
  const many = Math.min(await rows.count(), 6);
  for (let i = 0; i < many; i++) {
    await scene(`pages/deeper-${i}`, () => press(rows.nth(i)), { settle: 600 });
    const back = page.locator('[data-part="app-header"] a, [data-part="app-header"] button').first();
    if (await back.count()) await scene(`pages/back-${i}`, () => press(back), { settle: 600 });
    await page.waitForTimeout(200);
  }
}

// ---------- every screen's words ----------
// Every route that can be reached, every control on it, what each of them opens, each field with a word in it and with nonsense; then again as someone
// who has studied, with no network, and with a server that fails. Pressed by click(): it's the states that matter here, and the fingers have their own walk.
// Only a throwaway account on a local server takes this: controls that end the walk (signing out, deleting the account) are passed by.
const LEAVES_THE_WALK = /sign out|log out|log in|delete (?:my|your)|delete account|start over|sign in with|google|github/i;
const PASS_CONTROLS = 'button, summary, [role="button"], [role="tab"], [role="switch"], [role="radio"], input[type="checkbox"], input[type="radio"], select';
const NOT_A_CONTROL = '[data-ghost], [data-motion-layer] *, [data-part="tab-bar"] *, [data-part="tab-bar"]';

const controlsHere = () =>
  page.evaluate(({ controls, not }) => {
    const seen = (n) => {
      const box = n.getBoundingClientRect();
      if (box.width < 2 || box.height < 2 || n.closest("[inert]") || n.matches(not) || n.closest("[data-motion-hidden]")) return false;
      const s = getComputedStyle(n);
      return s.visibility !== "hidden" && s.display !== "none";
    };
    return [...document.querySelectorAll(controls)].filter(seen).map((n) => `${n.tagName}|${n.getAttribute("data-part") ?? ""}|${(n.getAttribute("aria-label") ?? n.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50)}`);
  }, { controls: PASS_CONTROLS, not: NOT_A_CONTROL });
const pressKey = (key) =>
  page.evaluate(({ key, controls, not }) => {
    const found = [...document.querySelectorAll(controls)].find((n) => !n.matches(not) && `${n.tagName}|${n.getAttribute("data-part") ?? ""}|${(n.getAttribute("aria-label") ?? n.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 50)}` === key);
    if (!found) return false;
    if (found.tagName === "SELECT") {
      found.selectedIndex = (found.selectedIndex + 1) % Math.max(1, found.options.length);
      found.dispatchEvent(new Event("change", { bubbles: true }));
    } else found.click();
    return true;
  }, { key, controls: PASS_CONTROLS, not: NOT_A_CONTROL });

async function crawl(label, { presses = true, extra = [], minutes = CRAWL_MINUTES } = {}) {
  const started = Date.now();
  const routes = ROUTES ?? [...new Set([...PAGES, ...extra])];
  const queued = new Set(routes);
  const perPrefix = new Map();
  const blocked = /^#(study\/session|study\/practice\/|practice\/)/; // a session's own walks hold those
  let pressed = 0;
  let visited = 0;
  const found = [];
  // A press can reload the page (a language changed, a file imported) or leave the app: the walk waits it out, looks, and comes back.
  const ready = async () => {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    if (!page.url().includes("/app/")) {
      await page.goto(`${BASE}/app/`, { waitUntil: "domcontentloaded" }).catch(() => {});
      if (!page.url().includes("/app/")) throw new Error(`signed out of the walk, at ${page.url()}`);
    }
    await page.waitForSelector("html[data-app-ready]", { timeout: 30_000 });
  };
  const look = async (where) => {
    let rows = [];
    for (let tries = 0; tries < 3; tries++) {
      try {
        await fw.quiet(page);
        rows = await fw.strays(page);
        break;
      } catch {
        await page.waitForTimeout(500);
      }
    }
    for (const row of strayRows(rows, `${label}/${where}`)) {
      row.scene = `text/${label}/${where}`;
      all.push(row);
      found.push(row);
      console.log(`  STRAY ${row.what} (after ${where})`);
    }
  };
  const home = await page.evaluate(() => JSON.stringify(localStorage));
  const open = async (route) => {
    await ready();
    await goHash("#today");
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    await goHash(route);
    await fw.quiet(page);
  };
  const settle = async () => {
    if (!presses) return; // nothing's been pressed, and offline a reload would land on the browser's error page
    // Each route from the same settings: a press may have changed the language or the theme, which is fine for its own moment.
    const changed = await page.evaluate((home) => {
      if (JSON.stringify(localStorage) === home) return false;
      localStorage.clear();
      for (const [key, value] of Object.entries(JSON.parse(home))) localStorage.setItem(key, value);
      return true;
    }, home).catch(() => false);
    if (changed) await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  };
  // First every screen there is, as what's there on arriving: that much is quick, and nothing's left out by the ceiling.
  const reached = [];
  while (routes.length) {
    const route = routes.shift();
    visited++;
    reached.push(route);
    await settle();
    await open(route).catch((e) => console.log(`  (${route}: ${e.message?.split("\n")[0]})`));
    await look(route);
    // Where this page goes: each of those is a screen too.
    const links = ROUTES ? [] : await page.evaluate(() => [...document.querySelectorAll('a[href^="#"]')].map((a) => a.getAttribute("href"))).catch(() => []);
    for (const link of links) {
      const bare = link.split("?")[0];
      if (queued.has(bare) || blocked.test(bare)) continue;
      const prefix = bare.split("/").slice(0, 3).join("/");
      const many = perPrefix.get(prefix) ?? 0;
      if (many >= 12 || queued.size >= 400) continue; // one kind of page, many ids: a dozen says it
      perPrefix.set(prefix, many + 1);
      queued.add(bare);
      routes.push(bare);
    }
  }
  console.log(`  ${label}: ${visited} routes reached in ${Math.round((Date.now() - started) / 1000)} s`);
  // Then fields and controls, for as long as the ceiling says from here: the first two of each kind of page (a dozen of a kind have the same controls).
  const pressingFrom = Date.now();
  const over = () => Date.now() - pressingFrom > minutes * 60_000;
  const kinds = new Map();
  const toPress = reached.filter((route) => {
    const kind = route.split("/").slice(0, 3).join("/");
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    return kinds.get(kind) <= 2;
  });
  let pressesDone = 0;
  for (const route of presses && minutes > 0 ? toPress : []) {
    if (over()) break;
    try {
      await settle();
      console.log(`  ${label} ${++pressesDone}/${toPress.length}: ${route} (${pressed} presses)`);
      await open(route);
      // Fields: a word, then nonsense.
      const fields = await page.locator('input:not([type]):visible, input[type="text"]:visible, input[type="search"]:visible, textarea:visible').all().catch(() => []);
      for (const field of fields.slice(0, 4)) {
        for (const word of ["hond", "qqqq", ""]) {
          await field.fill(word, { timeout: 800 }).catch(() => {});
          await page.waitForTimeout(word ? 350 : 80);
          await look(`${route} typed ${word || "nothing"}`);
        }
      }
      await open(route);
      // Every control, each from a fresh arrival; then what it opened, once each.
      const here = (await controlsHere().catch(() => [])).filter((key) => !LEAVES_THE_WALK.test(key));
      for (const key of [...new Set(here)].slice(0, 25)) {
        if (over()) break;
        await open(route).catch(() => {});
        if (!(await pressKey(key).catch(() => false))) continue;
        pressed++;
        await look(`${route} pressed ${key}`);
        const after = (await controlsHere().catch(() => [])).filter((k) => !LEAVES_THE_WALK.test(k) && !here.includes(k));
        for (const next of [...new Set(after)].slice(0, 8)) {
          if (over()) break;
          await open(route).catch(() => {});
          if (!(await pressKey(key).catch(() => false))) break;
          await fw.quiet(page).catch(() => {});
          if (!(await pressKey(next).catch(() => false))) continue;
          pressed++;
          await look(`${route} pressed ${key} → ${next}`);
        }
      }
    } catch (e) {
      console.log(`  (${route} stopped: ${e.message?.split("\n")[0]})`); // a press that navigated away; the next route comes back
    }
  }
  console.log(`${label}: ${visited} routes, ${pressed} presses in ${Math.round((Date.now() - started) / 60_000)} min, controls of ${presses && minutes > 0 ? toPress.length - pressesDone : "no"} routes not reached, ${found.length} stray words`);
  return { visited, pressed, controlsLeft: presses && minutes > 0 ? toPress.length - pressesDone : null, found: found.length };
}

async function textWalk() {
  const passes = [];
  passes.push(["new account", await crawl("new")]);
  if (ROUTES) return passes;
  // As someone who has studied: progress, a streak, a summary behind them.
  await learnerWalk("practice").catch((e) => console.log(`  (studying stopped: ${e.message?.split("\n")[0]})`));
  passes.push(["has studied", await crawl("studied")]);
  // No network, and a server that fails: errors are written by code.
  await goHash("#today");
  await context.setOffline(true);
  passes.push(["offline", await crawl("offline", { presses: false })]);
  console.log(`  still the app after offline: ${await page.evaluate(() => Boolean(document.querySelector('[data-part="tab-bar"]'))).catch(() => false)}`);
  await context.setOffline(false);
  await page.goto(`${BASE}/app/`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForSelector("html[data-app-ready]", { timeout: 30_000 }).catch(() => {});
  const failing = (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "nope" }) });
  await context.route(/\/api\//, failing);
  passes.push(["server failing", await crawl("failing", { presses: false })]);
  console.log(`  still the app with the server failing: ${await page.evaluate(() => Boolean(document.querySelector('[data-part="tab-bar"]'))).catch(() => false)}`);
  await context.unroute(/\/api\//, failing);
  // The pages outside the app.
  const pagesOutside = new Set(["/", "/design", "/login"]);
  for (const path of pagesOutside) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await fw.quiet(page, 300, 4000).catch(() => {});
    if (path === "/") for (const href of await page.evaluate(() => [...document.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute("href").split(/[?#]/)[0])).catch(() => [])) if (!href.startsWith("/app")) pagesOutside.add(href);
    for (const row of strayRows(await fw.strays(page).catch(() => []), `outside ${path}`)) {
      row.scene = `text/outside/${path}`;
      all.push(row);
      console.log(`  STRAY ${row.what}`);
    }
  }
  console.log(`outside the app: ${[...pagesOutside].join(" ")}`);
  await page.goto(`${BASE}/app/`).catch(() => {});
  return passes;
}

async function sheetsWalk() {
  // The Study page's Choose the games; Read's Add a book; closing by the shade, during the opening too.
  await goHash("#study");
  await page.waitForTimeout(600);
  const games = page.locator('[data-part="page"] button, [data-part="page"] a', { hasText: /games/i }).first();
  if (await games.count()) {
    // In view before the recording starts: press() scrolls to it otherwise, and the page's own scroll reads as everything on it jumping.
    await games.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
    await scene("sheets/games-open", () => press(games), { settle: 800 });
    await scene("sheets/games-close", () => page.touchscreen.tap(VW / 2, 30), { settle: 800 });
    await scene("sheets/games-open-close-at-once", async () => {
      await press(games);
      await page.waitForTimeout(60);
      await page.touchscreen.tap(VW / 2, 30);
    }, { settle: 800 });
  }
  await goHash("#read");
  await page.waitForTimeout(700);
  const add = page.locator('[data-part="page"] [data-read-add]').first();
  if (await add.count()) {
    await add.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
    await scene("sheets/read-add-open", () => press(add), { settle: 800 });
    await scene("sheets/read-add-close", () => page.touchscreen.tap(VW / 2, 30), { settle: 800 });
  }
  await goHash("#today");
  await page.waitForTimeout(500);
}

async function sessionAround() {
  // A session opening from the Study tab's own button, closing midway (its X, Escape), and coming back.
  await goHash("#study");
  await page.waitForTimeout(600);
  await knowWords(page);
  await scene("around/start-from-button", async () => {
    const start = page.locator('[data-part="page"] button, [data-part="page"] a', { hasText: /Start|Continue|Practice/ }).first();
    if (await start.count()) await press(start);
    else await goHash("#study/session/quick");
  }, { settle: 900 });
  if (await page.locator(SESSION).count()) {
    await scene("around/close-midway", () => press(`${SESSION} [data-part="session-bar"] button`), { settle: 900 });
    await scene("around/come-back", () => goHash("#study/session/quick"), { settle: 900 });
    await scene("around/escape-midway", () => page.keyboard.press("Escape"), { settle: 900 });
  }
  // A whole quick session through to its summary and celebration, and leaving it.
  await goHash("#study/session/quick");
  await page.waitForSelector(`${SESSION} [data-part="activity-prompt"]`, { timeout: 8000 }).catch(() => {});
  for (let i = 0; i < 24; i++) {
    const now = await stepInfo();
    if (!now || now.summary) break;
    try {
      if (now.kind === "say" || now.kind === "repeat") await press(barButton("I don't know"));
      else if (now.kind === "card" || now.kind === "meet") {
        if (await hasBarButton("Show meaning")) await press(barButton("Show meaning"));
      } else await answer(now, { wrong: false });
    } catch {
      if (await hasBarButton("I don't know")) await press(barButton("I don't know"));
    }
    await page.waitForTimeout(60);
    const button = page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first();
    if (!(await button.count())) break;
    const last = /See how it went/.test(await button.textContent());
    if (last) await scene("around/summary-arrives", () => press(button), { settle: 2200 });
    else await press(button);
    await page.waitForTimeout(60);
  }
  const done = page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`).first();
  if (await done.count()) await scene("around/summary-leaves", () => press(done), { settle: 1000 });
}

// ---------- planted glitches: a pass means nothing until these are caught ----------

async function plants() {
  await openGame("match");
  await page.waitForTimeout(800);
  const expect = [
    ["left-behind", "one tile of a grid moving 35 px, 12 frames after the rest of its row", async () => {
      await page.evaluate(() => {
        const items = [...document.querySelectorAll('[data-part="match-item"]')];
        requestAnimationFrame(() => requestAnimationFrame(() => {
          for (const item of items.slice(1)) item.style.transform = "translateY(-35px)";
          let n = 0;
          const later = () => (++n === 12 ? (items[0].style.transform = "translateY(-35px)") : requestAnimationFrame(later));
          requestAnimationFrame(later);
        }));
      });
      await page.waitForTimeout(500);
      await page.evaluate(() => document.querySelectorAll('[data-part="match-item"]').forEach((n) => (n.style.transform = "")));
    }],
    ["teleport", "a tile jumping 20 px in one frame", async () => {
      await page.evaluate(() => { document.querySelector('[data-part="match-item"]').style.transform = "translateX(20px)"; });
      await page.waitForTimeout(200);
      await page.evaluate(() => { document.querySelector('[data-part="match-item"]').style.transform = ""; });
    }],
    ["disappear", "a tile unseen for 3 frames", async () => {
      await page.evaluate(() => new Promise((resolve) => {
        const item = document.querySelector('[data-part="match-item"]');
        item.style.opacity = "0";
        let n = 0;
        const later = () => { if (++n === 3) { item.style.opacity = ""; resolve(); } else requestAnimationFrame(later); };
        requestAnimationFrame(later);
      }));
    }],
    ["flash-empty", "a tile's words gone for 3 frames", async () => {
      await page.evaluate(() => new Promise((resolve) => {
        const item = document.querySelector('[data-part="match-item"]');
        const words = item.textContent;
        item.textContent = "";
        let n = 0;
        const later = () => { if (++n === 3) { item.textContent = words; resolve(); } else requestAnimationFrame(later); };
        requestAnimationFrame(later);
      }));
    }],
    ["reflow", "a tile's font changing size in a frame", async () => {
      await page.evaluate(() => { document.querySelector('[data-part="match-item"]').style.fontSize = "24px"; });
      await page.waitForTimeout(150);
      await page.evaluate(() => { document.querySelector('[data-part="match-item"]').style.fontSize = ""; });
    }],
    ["press-blocked", "something over a tile for 4 frames", async () => {
      await page.evaluate(() => new Promise((resolve) => {
        const cover = document.createElement("div");
        cover.setAttribute("data-part", "plant-cover");
        cover.style.cssText = "position:fixed;inset:0;z-index:999";
        document.body.append(cover);
        let n = 0;
        const later = () => { if (++n === 4) { cover.remove(); resolve(); } else requestAnimationFrame(later); };
        requestAnimationFrame(later);
      }));
    }],
    ["state-flicker", "a tile's state flipping and back", async () => {
      await page.evaluate(() => new Promise((resolve) => {
        const item = document.querySelector('[data-part="match-item"]');
        item.setAttribute("data-state", "selected");
        requestAnimationFrame(() => requestAnimationFrame(() => { item.removeAttribute("data-state"); resolve(); }));
      }));
    }],
    ["blank-flash", "the whole session's words hidden for 2 frames", async () => {
      await page.evaluate(() => new Promise((resolve) => {
        const root = document.querySelector('[data-part="session"]');
        root.style.visibility = "hidden";
        for (const n of root.querySelectorAll("*")) n.style.visibility = "hidden";
        requestAnimationFrame(() => requestAnimationFrame(() => {
          root.style.visibility = "";
          for (const n of root.querySelectorAll("*")) n.style.visibility = "";
          resolve();
        }));
      }));
    }],
  ];
  let missed = 0;
  for (const [kind, what, act] of expect) {
    await fw.start(page);
    await page.waitForTimeout(100);
    await act();
    await page.waitForTimeout(300);
    const run = await fw.stop(page);
    const found = fw.analyze(run, { label: "plant" });
    const caught = found.filter((c) => c.kind === kind);
    if (!caught.length) missed++;
    console.log(`plant ${caught.length ? "caught" : "MISSED"}: ${kind}: ${what}${caught.length ? ` → ${caught[0].what}` : ""}`);
  }
  // At rest: off the screen, covered.
  await page.evaluate(() => {
    const item = document.querySelector('[data-part="match-item"]');
    item.style.position = "fixed";
    item.style.left = `${innerWidth - 20}px`;
    const other = document.querySelector('[data-part="match-item"][data-side="en"]');
    const cover = document.createElement("div");
    cover.setAttribute("data-part", "plant-cover");
    const r = other.getBoundingClientRect();
    cover.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:999`;
    document.body.append(cover);
  });
  const rest = await fw.settled(page, { label: "plant" });
  for (const kind of ["off-screen", "covered"]) {
    const caught = rest.filter((c) => c.kind === kind);
    if (!caught.length) missed++;
    console.log(`plant ${caught.length ? "caught" : "MISSED"}: ${kind}${caught.length ? ` → ${caught[0].what}` : ""}`);
  }
  await page.evaluate(() => {
    document.querySelector('[data-part="plant-cover"]')?.remove();
    const item = document.querySelector('[data-part="match-item"]');
    item.style.position = "";
    item.style.left = "";
  });
  // Words only code prints: each of these is caught, and a real word isn't. With them what the interface's words show when one is missing
  // (lx/i18n.js's own t(): a key its English doesn't have, a value not given) and a key written where its words should be; and what t() logged.
  await fw.strays(page);
  const planted = await page.evaluate(async () => {
    const { t } = await import("/js/lx/i18n.js");
    const box = document.createElement("div");
    box.id = "plant-words";
    const line = (text, attrs = {}) => {
      const p = document.createElement("p");
      for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v);
      p.textContent = text;
      box.append(p);
    };
    const printed = document.createElement("p");
    printed.replaceChildren(null, "Pause your streak"); // the very line that showed it
    box.append(printed);
    line("undefined cards");
    line("Reviewed NaN%");
    line("[object Object]");
    line("Invalid Date");
    line("Press here", { "aria-label": "undefined" });
    line("undefined", { "data-part": "word-meaning" }); // a gloss that's missing
    line(t("core.nothing")); // a key the English doesn't have: ⟦core.nothing⟧
    line(t("core.place.ask")); // a value not given: Where does {word} go?
    line("Tap core.retry to go on"); // a key where its words should be
    document.body.append(box);
    return box.children.length;
  });
  await page.waitForTimeout(100);
  const printed = await fw.strays(page);
  const texts = new Set(printed.map((row) => `${row.text}|${row.how}`));
  for (const want of ["null|text", "undefined cards|text", "Reviewed NaN%|text", "[object Object]|text", "Invalid Date|text", "undefined|aria-label", "undefined|text", "⟦core.nothing⟧|text", "Where does {word} go?|text", "Tap core.retry to go on|text", "no English for core.nothing|t()", "core.place.ask: no value for {word}|t()"]) {
    if (!texts.has(want)) missed++;
    console.log(`plant ${texts.has(want) ? "caught" : "MISSED"}: stray-text: ${want}`);
  }
  await page.evaluate(() => {
    const box = document.getElementById("plant-words");
    box.replaceChildren();
    const line = (text, attrs = {}) => {
      const p = document.createElement("p");
      for (const [k, v] of Object.entries(attrs)) p.setAttribute(k, v);
      p.textContent = text;
      box.append(p);
    };
    line("null", { lang: "de" }); // German's zero, in a tile
    line("null and void", { "data-part": "word-meaning" });
    line("false", { "data-part": "match-item" });
    line("To annul, nullify; a nan; Min Nan; 12 of 20");
    line("You're welcome. Core values; language. Next");
  });
  await page.waitForTimeout(100);
  const real = await fw.strays(page);
  if (real.length) missed++;
  console.log(`plant ${real.length ? "MISSED" : "caught"}: real words left alone${real.length ? `: flagged ${real.map((row) => row.text).join(", ")}` : ""}`);
  await page.evaluate(() => document.getElementById("plant-words")?.remove());
  return missed;
}

// ---------- the run ----------

async function signUp() {
  if (ENGINE === "webkit") {
    // A passkey can't be made in WebKit here: the account comes from Chrome for Testing, its cookie carried over.
    const helper = await chromium.launch({ headless: true });
    const desk = await helper.newContext();
    const signup = await desk.newPage();
    const d = await desk.newCDPSession(signup);
    await d.send("WebAuthn.enable");
    await d.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    await signup.goto(`${BASE}/app/`);
    await signup.waitForURL(/\/login\?next=/);
    await signup.click("summary");
    await signup.fill('input[name="name"]', "Frame Check");
    await signup.click('#register button[type="submit"]');
    await signup.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
    await context.addCookies(await desk.cookies());
    await helper.close();
    await page.goto(`${BASE}/app/`);
    await page.waitForSelector("html[data-app-ready]");
    return page.evaluate(async () => {
      const { syncLibraryPacks, libraryPacks } = await import("/js/study/packs.js");
      await syncLibraryPacks();
      return libraryPacks().filter((p) => p.language === "nl").map((p) => p.id);
    });
  }
  const c = await context.newCDPSession(page);
  await c.send("WebAuthn.enable");
  await c.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Frame Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 30_000 });
  await page.waitForSelector("html[data-app-ready]");
  return page.evaluate(async () => {
    const { syncLibraryPacks, libraryPacks } = await import("/js/study/packs.js");
    await syncLibraryPacks();
    return libraryPacks().filter((p) => p.language === "nl").map((p) => p.id);
  });
}

console.log(`device packs: ${(await signUp()).join(", ")}; ${VW}×${VH} ${ENGINE}${has("motion") ? ` motion ${opt("motion")}` : ""}`);
if (THEME || has("custom") || opt("motion") === "off") {
  // Saved as Settings saves it, so a start and every page keep it. --custom: a look of one's own, its colors changed.
  await page.evaluate(({ theme, motion, custom }) => {
    const saved = JSON.parse(localStorage.getItem("lx.appearance.v1") || "{}");
    saved.version = 1;
    if (theme) saved.theme = theme;
    if (motion) saved.presets = { ...(saved.presets ?? {}), motion };
    if (custom) saved.look = { name: "Check", tokens: { "--canvas": "#16203a", "--chrome": "#1f2c4e", "--fill": "#28375f", "--ink-1": "#fff4d6", "--radius-12": "2px" } };
    localStorage.setItem("lx.appearance.v1", JSON.stringify(saved));
  }, { theme: THEME, motion: opt("motion"), custom: has("custom") });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  console.log(`appearance: data-theme ${await page.evaluate(() => document.documentElement.getAttribute("data-theme"))}, data-motion ${await page.evaluate(() => document.documentElement.getAttribute("data-motion"))}`);
}
if (LANG) {
  const starter = JSON.parse(readFileSync(join(here, `../packs/starter-${LANG}.json`), "utf8"));
  const saved = await page.evaluate(async ({ lang, pack }) => {
    localStorage.setItem("lx.learning.v1", JSON.stringify({ lang, from: "en" }));
    const packs = await import("/js/study/packs.js");
    await packs.loadPacks();
    return (await packs.savePack(pack)).ok;
  }, { lang: LANG, pack: { ...starter, id: `check-frame-${LANG}` } });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  console.log(`language ${LANG}: pack saved ${saved}, dir ${await page.evaluate(() => getComputedStyle(document.querySelector('[data-part="app"]')).direction)}`);
}
if (SLOW_NET) {
  await context.route(/\/(api|library)\//, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_NET));
    await route.continue().catch(() => {});
  });
  console.log(`every server call held ${SLOW_NET} ms`);
}

if (has("plant")) {
  const missed = await plants();
  if (missed) {
    console.log(`${missed} planted glitch(es) missed: the walk proves nothing.`);
    await browser.close();
    process.exit(3);
  }
  console.log("every planted glitch caught");
}

if (wanted("sessions")) {
  for (const game of GAMES) {
    console.log(`game: ${game}`);
    try {
      await sessionWalk(game);
    } catch (e) {
      stageErrors.push(`${game}: ${e.message?.split("\n")[0]}`);
      console.log(`  (${game} stopped: ${e.message?.split("\n")[0]})`);
    }
  }
}

const ruleFails = [];
if (wanted("ghost")) {
  console.log("a ghost is the thing it stands for");
  ruleFails.push(...(await ghostRule()));
}
if (wanted("press")) {
  console.log("a press always lands");
  ruleFails.push(...(await pressRule()));
}
if (wanted("order")) {
  console.log("word order");
  ruleFails.push(...(await orderRule()));
}
if (wanted("lesson")) {
  console.log("a lesson, then a practice");
  await learnerWalk("lesson");
  await learnerWalk("practice");
  await learnerWalk("lesson");
}
if (only?.includes("text")) {
  console.log("every screen's words");
  for (const [name, pass] of await textWalk()) console.log(`  ${name}: ${JSON.stringify(pass)}`);
}
if (wanted("around")) {
  console.log("around the games");
  await sessionAround();
}
if (wanted("pages")) {
  console.log("every page");
  await pagesWalk();
}
if (wanted("sheets")) {
  console.log("sheets");
  await sheetsWalk();
}
if (wanted("interrupt")) {
  console.log("interrupting");
  await interruptWalk();
  writeFileSync(join(OUT, "interruptions.json"), JSON.stringify(interruptions, null, 1));
}

// ---------- what came of it ----------

// One row per kind of thing: scene, kind and the part it happened to.
const signature = (c) => `${c.kind} | ${c.scene.split("/").slice(1).join("/") || c.scene} | ${c.part ?? (c.what ?? "").replace(/".*?"/g, '""').replace(/[-\d.]+/g, "#").slice(0, 60)}`;
const groups = new Map();
for (const c of all) {
  const key = signature(c);
  if (!groups.has(key)) groups.set(key, { key, count: 0, scenes: new Set(), example: c });
  const g = groups.get(key);
  g.count++;
  g.scenes.add(c.scene);
}
const rows = [...groups.values()].sort((a, b) => b.count - a.count);
writeFileSync(join(OUT, "candidates.json"), JSON.stringify(all, null, 1));
const byKind = {};
for (const c of all) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
const lines = [`# Frame check ${VW}×${VH} ${ENGINE}`, "", `${scenes.length} scenes, ${all.length} candidates, ${rows.length} kinds.`, "", `By kind: ${Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ")}`, "", `Page errors: ${pageErrors.length ? pageErrors.slice(0, 10).join(" | ") : "none"}`, `Scene errors: ${stageErrors.length ? stageErrors.join(" | ") : "none"}`, ""];
for (const g of rows) lines.push(`- **${g.count}×** ${g.key}: ${g.example.what} (${[...g.scenes].slice(0, 6).join(", ")})`);
writeFileSync(join(OUT, "report.md"), `${lines.join("\n")}\n`);
console.log(lines.slice(2, 8).join("\n"));
console.log(`report: ${join(OUT, "report.md")}`);

let over = ruleFails.length;
if (opt("expect")) {
  const expectation = JSON.parse(readFileSync(resolve(opt("expect")), "utf8"));
  for (const [where, kinds] of Object.entries(expectation)) {
    for (const [kind, most] of Object.entries(kinds)) {
      const count = all.filter((c) => (where === "*" || c.scene === where || c.scene.startsWith(`${where}/`)) && c.kind === kind).length;
      if (count > most) {
        over++;
        console.log(`FAIL ${where} ${kind}: ${count} (at most ${most})`);
      } else console.log(`ok   ${where} ${kind}: ${count} (at most ${most})`);
    }
  }
}
await browser.close();
void here;
process.exit(over ? 1 : 0);
