// A word picture's reaction in the real game, on a phone screen, in Chrome and WebKit: from a new account, the first lesson's real question. The tile you tap plays its story from the
// still, after the card's own pop or shake, and stays on its last pose until the next question; a wrong tap's right tile goes happy too. Continue works in the middle of it and leaves
// nothing running; any press finishes it; animations off, no story file, or a still redrawn since its story: only the still; no pictures at all: nothing breaks. Its frames fill the tile
// at whatever size the tile is, and no two tiles' ids collide. A story with one mood (coffee planted with its sad alone): answered right, only the card's pop on
// its still, nothing left running; a wrong tap beside it, no happy on it; tapped wrongly, its sad. Lesson 7 has the key. Controls: the same watch on the runs that must show nothing, and a sampler that must see a story when there is one.
// LOCAL only: it signs up test accounts; path-nl must be seeded (scripts/packs/seed-local.mjs --default), else exit 2.
// Usage (through gpu.py's parallel lane): node scripts/reaction-check.mjs http://localhost:<port> <outDir> [chromium|webkit]   (exit 0 = pass)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, webkit } from "./quiet-browser.mjs";

const [BASE, outArg, engine = "chromium"] = process.argv.slice(2);
const OUT = outArg && resolve(outArg);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT || !["chromium", "webkit"].includes(engine)) {
  console.error("Usage: node scripts/reaction-check.mjs http://localhost:<port> <outDir> [chromium|webkit] (a local server only)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const catalogue = await (await fetch(`${BASE}/library/catalogue.json`)).json().catch(() => ({}));
if (!(catalogue.packs?.nl ?? []).some((pack) => pack.id === "path-nl")) {
  console.error("reaction-check: the local library doesn't list path-nl; seed it first.");
  process.exit(2);
}

const results = [];
let failed = 0;
const assert = (cond, what) => {
  if (!cond) throw new Error(what);
};
const SESSION = '[data-part="session"]';
// The lessons the check plays, by id. "Find your key" teaches the key; "Order a coffee" is only played so that the first lesson is done.
const KEY_LESSON = "path-nl/l007";
const AFTER_FIRST = "path-nl/l002";

// One account, signed up in Chrome with a virtual passkey; its cookie takes each browser and context in.
async function signUp() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Reaction Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 60_000 });
  const cookies = await context.cookies(BASE);
  await browser.close();
  return cookies;
}
const cookies = await signUp();
const launcher = engine === "webkit" ? webkit : chromium;
const browser = await launcher.launch({ headless: true });

/** A phone with a fresh device, signed in, in a lesson (by id: lessons keep their ids when the path changes, not their places), with every lesson before it
 * on the path done. `prepare` routes what this run needs before the app starts. */
async function phone({ width = 390, height = 844, prepare = null, lesson = "path-nl/l000", reduced = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: engine === "chromium", reducedMotion: reduced ? "reduce" : "no-preference" });
  await context.addCookies(cookies);
  if (prepare) await prepare(context);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`${BASE}/app/`);
  await page.waitForSelector("html[data-app-ready]");
  const missing = await page.evaluate(async (id) => {
    const packs = await import("/js/study/packs.js");
    await packs.syncLibraryPacks();
    await (await import("/js/study/pictures.js")).pictureList();
    const { pathLessons } = await import("/js/study/path.js");
    const lessons = pathLessons();
    const index = lessons.findIndex((one) => one.id === id);
    if (index < 0) return `no lesson ${id} on the path`;
    if (index) {
      const { markLessonsDone } = await import("/js/study/plan.js");
      markLessonsDone(lessons.slice(0, index));
    }
    location.hash = `#study/session/lesson/${encodeURIComponent(id)}`;
    return null;
  }, lesson);
  if (missing) throw new Error(missing);
  await page.waitForSelector(SESSION, { timeout: 15_000 });
  return { page, context, errors };
}
const stepOf = (page) =>
  page.evaluate((S) => {
    const step = document.querySelector(S)?.lxStep;
    if (!step) return null;
    return { kind: step.kind, correct: step.correct, ids: step.options?.map((option) => option?.picture ?? null) ?? [] };
  }, SESSION);
const next = (page) => page.locator(`${SESSION} [data-part="answer-bar"] [data-variant="white"]`);
/** The session's cover in place and still: its slide in (up from the foot, or in from the right after another session; held off the screen until its
 *  first step's pictures are drawn) is over. A tap before then lands off the screen: a stage's tap finds its tile outside the viewport, and a forced tap
 *  answers nothing, so Continue never comes. */
const settle = (page) =>
  page.waitForFunction(
    (S) => {
      const root = document.querySelector(S);
      if (!root) return false;
      const moving = root.getAnimations().some((a) => a.playState === "running" || a.playState === "pending");
      return !moving && !root.style.transform && getComputedStyle(root).transform === "none";
    },
    SESSION,
    { polling: "raf", timeout: 15_000 },
  );
/** Plays on, answering rightly, until a question passes `wanted`. */
async function untilQuestion(page, wanted, limit = 60) {
  for (let i = 0; i < limit; i++) {
    // The lesson ran out before the question came (a word that's never a wrong picture in its own lesson): a finished session keeps its last step, so the
    // summary is what says so. The picture game asks from everything taught so far, so the walk goes on there, a fresh round each time one ends.
    if (await page.locator(`${SESSION} [data-part="session-summary"]`).count()) {
      await page.evaluate(() => { location.hash = "#study"; });
      await page.waitForTimeout(300);
      await page.evaluate(() => { location.hash = "#study/session/game/see"; });
      await page.waitForFunction((S) => document.querySelector(S)?.lxStep && !document.querySelector(`${S} [data-part="session-summary"]`), SESSION);
    }
    await page.waitForFunction((S) => document.querySelector(S)?.lxStep, SESSION);
    await settle(page);
    const step = await stepOf(page);
    if (step.kind === "see") {
      // Its drawings arrive just after the step: a question isn't judged until they have.
      await page.locator(`${SESSION} [data-part="picture-choice"]`).first().waitFor();
      await page.locator(`${SESSION} [data-part="picture-choice"] [data-part="picture"] svg`).first().waitFor({ timeout: 3000 }).catch(() => {});
      // (the cover may have been held until these drew: in place and still before a stage taps)
      if ((await page.locator(`${SESSION} [data-part="picture"] svg`).count()) && wanted(step)) {
        await settle(page);
        await page.waitForFunction((S) => !document.querySelector(`${S} [data-motion-hidden]`), SESSION, { timeout: 6000 }).catch(() => {});
        return step;
      }
      await page.waitForFunction((S) => !document.querySelector(`${S} [data-motion-hidden]`), SESSION, { timeout: 6000 }).catch(() => {});
      await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(step.correct).click({ force: true });
    } else if (step.kind === "meet") {
      await next(page).click();
      await page.waitForTimeout(100);
      continue;
    } else if (step.kind === "match") {
      // A Match question has no "I don't know": the walk plays it, pair by pair, from what the step says is right.
      const pairs = await page.evaluate((S) => document.querySelector(S).lxStep.answers, SESSION);
      for (const text of await page.locator(`${SESSION} [data-part="match-item"][data-side="nl"]`).evaluateAll((nodes) => nodes.map((n) => n.dataset.word))) {
        await page.locator(`${SESSION} [data-part="match-item"][data-side="nl"][data-word="${text}"]`).click();
        await page.locator(`${SESSION} [data-part="match-item"][data-side="en"][data-word="${pairs[text]}"]`).click();
      }
    } else {
      // Anything else a lesson asks: "I don't know" passes it where there is one, and it comes back later, as a miss does. A question without one (choosing
      // the word for a picture, placing a word, building a sentence from tiles) is simply answered: rightly where the step says what's right, else any
      // way at all, since all the walk needs is the next question. Its controls draw just after the step, so the walk waits for them first.
      const skip = page.getByRole("button", { name: /don.t know/i }).first();
      const choice = page.locator(`${SESSION} [data-part="choice"]`), gap = page.locator(`${SESSION} [data-part="place-gap"]`);
      const tile = page.locator(`${SESSION} [data-part="arrange-bank"] [data-part="tile"]:not([data-state="used"])`);
      await Promise.any([skip, choice.first(), gap.first(), tile.first()].map((l) => l.waitFor({ timeout: 4000 }))).catch(() => {});
      await page.waitForTimeout(250);
      if (await skip.count()) await skip.click();
      else if (await choice.count()) await choice.nth(Number.isInteger(step.correct) && step.correct < (await choice.count()) ? step.correct : 0).click();
      else if (await gap.count()) await gap.first().click();
      else if (await tile.count()) {
        for (let n = 0; n < 24 && (await tile.count()); n++) await tile.first().click();
        await page.getByRole("button", { name: "Check" }).click();
      } else throw new Error(`the walk met a ${step.kind} question it can't answer`);
    }
    await next(page).click();
    await page.waitForTimeout(100);
  }
  throw new Error("never reached that question");
}
/** Watches every tile, each frame, from now: what it holds, its box, and the page's ids. */
const startWatch = (page) =>
  page.evaluate((S) => {
    const tiles = [...document.querySelectorAll(`${S} [data-part="picture-choice"] [data-part="picture"] > svg`)];
    const watch = (window.__watch = { tiles: tiles.map((svg) => ({ svg, frames: [], last: null })), t0: performance.now(), dupes: 0, on: true, rects: [] });
    const look = () => {
      if (!watch.on) return;
      const now = performance.now() - watch.t0;
      for (const tile of watch.tiles) {
        const text = tile.svg.innerHTML;
        if (text !== tile.last) {
          tile.frames.push({ at: now, text });
          tile.last = text;
        }
      }
      const ids = [...document.querySelectorAll(`${S} [id]`)].map((node) => node.id).filter((id) => /^r\d+-/.test(id));
      if (new Set(ids).size !== ids.length) watch.dupes++;
      // The game may narrow its grid as the result bar comes up (ui.js lxReserve). Whatever size a tile is, the drawing fills it, in every frame.
      for (const tile of watch.tiles) {
        if (!tile.svg.isConnected) continue;
        const box = tile.svg.getBoundingClientRect(), holder = tile.svg.parentElement.getBoundingClientRect();
        if (Math.abs(box.width - holder.width) > 1 || Math.abs(box.height - holder.height) > 1) watch.unfit = `svg ${box.width}x${box.height} in a ${holder.width}x${holder.height} tile`;
      }
      const box = watch.tiles[0].svg.getBoundingClientRect();
      watch.rects.push(`${Math.round(box.width)}x${Math.round(box.height)}`);
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  }, SESSION);
const readWatch = (page) =>
  page.evaluate(() => {
    const watch = window.__watch;
    watch.on = false;
    return { unfit: watch.unfit ?? null, tiles: watch.tiles.map((tile) => ({ count: tile.frames.length, first: tile.frames[0]?.at ?? null, second: tile.frames[1]?.at ?? null, lastAt: tile.frames.at(-1)?.at ?? null, last: tile.last, connected: tile.svg.isConnected })), dupes: watch.dupes, sizes: [...new Set(watch.rects)] };
  });
/** A story's last pose, as the tile holds it: ids named apart. */
const bare = (text) => text.replace(/\bid="r\d+-/g, 'id="').replace(/url\(#r\d+-/g, "url(#").replace(/\s+/g, " ").trim();
const endOf = (page, id, mood) =>
  page.evaluate(
    async ([id, mood]) => {
      const story = await import(`/js/study/reactions/${id}.js`);
      const text = story.frame(mood, story.REACTIONS[mood].dur);
      const holder = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      holder.innerHTML = text.slice(text.indexOf(">") + 1, text.lastIndexOf("</svg>"));
      return { text: holder.innerHTML, dur: story.REACTIONS[mood].dur };
    },
    [id, mood],
  );
// A wrong tap plays the right answer's happy story too, beside the tapped one's sad (reactions.js), and it may be the longer one: so before
// asking that nothing still runs, wait (as long as the longest story among the question's pictures can still take, and a little) for the
// player to finish. A story that never ends still fails.
async function settled(page, ids, dur) {
  const longest = await page.evaluate(async (ids) => {
    let most = 0;
    for (const id of ids) if (id) try { const story = await import(`/js/study/reactions/${id}.js`); for (const mood of ["happy", "sad"]) if (story.REACTIONS[mood]) most = Math.max(most, story.REACTIONS[mood].dur); } catch {}
    return most;
  }, ids);
  const until = Date.now() + Math.max(0, longest - dur) * 1000 + 600;
  while (Date.now() < until && (await page.evaluate(async () => (await import("/js/study/reactions.js")).reactionsRunning()))) await page.waitForTimeout(100);
}
const shotOf = (page, index, name) => page.locator(`${SESSION} [data-part="picture-choice"]`).nth(index).screenshot({ path: `${OUT}/${engine}-${name}.png` }).catch(() => {});

async function stage(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    console.log(`PASS ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    results.push({ name, ok: false, note: String(error.stack ?? error) });
    console.log(`FAIL ${name}: ${error.message}`);
  }
}

// ---------- the real thing
await stage("coffee, right: the still through the card's pop, then its happy story, ending and staying on its last pose, filling the tile", async () => {
  const { page, context, errors } = await phone();
  const step = await untilQuestion(page, (s) => s.ids[s.correct] === "coffee");
  const index = step.correct;
  await shotOf(page, index, "coffee-still");
  await startWatch(page);
  await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(index).click();
  const { dur, text: end } = await endOf(page, "coffee", "happy");
  await page.waitForTimeout(500);
  await shotOf(page, index, "coffee-happy-mid");
  await page.waitForTimeout((dur + 0.5) * 1000 - 500 + 400);
  await shotOf(page, index, "coffee-happy-end");
  const seen = await readWatch(page);
  const tile = seen.tiles[index];
  assert(tile.count > 40, `only ${tile.count} frames drew`);
  // (Its first record is what the tile held when the watch began; the story's first frame is the second.)
  assert(tile.second > 250, `it moved ${Math.round(tile.second)} ms in, under the card's ghost`);
  assert(tile.lastAt - tile.second > (dur - 0.25) * 1000, `it ran ${Math.round(tile.lastAt - tile.second)} ms of ${dur * 1000}`);
  assert(bare(tile.last) === bare(end), "it didn't stay on its last pose");
  for (const [i, other] of seen.tiles.entries()) if (i !== index) assert(other.count <= 1, `tile ${i} moved`);
  assert(!seen.unfit, seen.unfit);
  await page.waitForTimeout(400);
  const held = await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(index).locator('[data-part="picture"] > svg').innerHTML();
  assert(bare(held) === bare(end), "its end didn't hold");
  const running = await page.evaluate(async () => (await import("/js/study/reactions.js")).reactionsRunning());
  assert(running === 0, `${running} still running`);
  assert(!errors.length, errors.join("; "));
  await context.close();
  return `${tile.count} frames, ${seen.sizes[0]} to ${seen.sizes.at(-1)} tile, first move ${Math.round(tile.second)} ms in, ${Math.round(tile.lastAt - tile.second)} ms long`;
});

await stage("coffee, wrong: tapped when it isn't the answer, its sad story, and it stays broken until the next question", async () => {
  const { page, context, errors } = await phone();
  const step = await untilQuestion(page, (s) => s.ids.includes("coffee") && s.ids[s.correct] !== "coffee");
  const index = step.ids.indexOf("coffee");
  await startWatch(page);
  await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(index).click();
  const { dur, text: end } = await endOf(page, "coffee", "sad");
  await page.waitForTimeout(1200);
  await shotOf(page, index, "coffee-sad-mid");
  await page.waitForTimeout((dur + 0.5) * 1000 - 1200 + 400);
  await shotOf(page, index, "coffee-sad-end");
  const seen = await readWatch(page);
  assert(seen.tiles[index].count > 40, `only ${seen.tiles[index].count} frames`);
  assert(bare(seen.tiles[index].last) === bare(end), "it didn't stay broken");
  assert(!errors.length, errors.join("; "));
  await context.close();
  return `${seen.tiles[index].count} frames`;
});

await stage("Continue in the middle of a story: the next question at once, the old tile gone, nothing left running", async () => {
  const { page, context, errors } = await phone();
  const step = await untilQuestion(page, (s) => s.ids[s.correct] === "coffee");
  await page.evaluate((S) => (window.__old = [...document.querySelectorAll(`${S} [data-part="picture-choice"]`)]), SESSION);
  await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(step.correct).click();
  await page.waitForTimeout(600);
  const before = await page.evaluate(() => performance.now());
  await next(page).click();
  const after = await page.evaluate(() => performance.now());
  await page.waitForTimeout(120);
  const state = await page.evaluate(async (S) => {
    const { reactionsRunning } = await import("/js/study/reactions.js");
    return { running: reactionsRunning(), gone: window.__old.every((card) => !card.isConnected), step: document.querySelector(S)?.lxStep?.kind ?? null };
  }, SESSION);
  assert(state.gone, "the old grid is still there");
  assert(state.step, "no next question");
  assert(state.running === 0, `${state.running} left running`);
  assert(!errors.length, errors.join("; "));
  await context.close();
  return `pressed and moved on in ${Math.round(after - before)} ms`;
});

await stage("a press anywhere finishes it: on its last pose at once, in that press", async () => {
  const { page, context, errors } = await phone();
  const step = await untilQuestion(page, (s) => s.ids[s.correct] === "coffee");
  await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(step.correct).click();
  await page.waitForTimeout(600);
  const { text: end } = await endOf(page, "coffee", "happy");
  const svg = page.locator(`${SESSION} [data-part="picture-choice"]`).nth(step.correct).locator('[data-part="picture"] > svg');
  const mid = await svg.innerHTML();
  assert(bare(mid) !== bare(end), "it had already ended: this proves nothing");
  await page.mouse.move(5, 5);
  await page.evaluate(() => {
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  });
  assert(bare(await svg.innerHTML()) === bare(end), "a press didn't finish it");
  assert(!errors.length, errors.join("; "));
  await context.close();
});

await stage("a press before the story has begun: the same, never a frame left half-drawn", async () => {
  const { page, context, errors } = await phone();
  const step = await untilQuestion(page, (s) => s.ids[s.correct] === "coffee");
  const card = page.locator(`${SESSION} [data-part="picture-choice"]`).nth(step.correct);
  await card.click();
  await page.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  const { text: end } = await endOf(page, "coffee", "happy");
  await page.waitForTimeout(150);
  const running = await page.evaluate(async () => (await import("/js/study/reactions.js")).reactionsRunning());
  assert(running === 0, `${running} running after the press`);
  assert(bare(await card.locator('[data-part="picture"] > svg').innerHTML()) === bare(end), "not on its last pose");
  assert(!errors.length, errors.join("; "));
  await context.close();
});

// ---------- only the still
const stillOnly = async (run, name) => {
  const { page, context, errors } = run;
  const step = await untilQuestion(page, (s) => s.ids[s.correct] === "coffee");
  const card = page.locator(`${SESSION} [data-part="picture-choice"]`).nth(step.correct);
  const svg = card.locator('[data-part="picture"] > svg');
  const still = await svg.innerHTML();
  assert(still.length > 100, "no drawing");
  await startWatch(page);
  await card.click();
  await page.waitForTimeout(1500);
  const seen = await readWatch(page);
  assert(seen.tiles[step.correct].count <= 1, `${name}: it moved, ${seen.tiles[step.correct].count} frames`);
  assert((await svg.innerHTML()) === still, `${name}: the still changed`);
  assert(await next(page).isVisible(), `${name}: no Continue`);
  assert(!errors.length, errors.join("; "));
  await context.close();
};
await stage("Animations Off: only the still", async () => {
  const run = await phone({
    prepare: (context) => context.addInitScript(() => addEventListener("DOMContentLoaded", () => document.documentElement.setAttribute("data-motion", "off"), { once: true })),
  });
  await run.page.evaluate(() => document.documentElement.setAttribute("data-motion", "off"));
  await stillOnly(run, "Animations Off");
});
await stage("a device asking for reduced motion: only the still", async () => stillOnly(await phone({ reduced: true }), "reduced motion"));
await stage("no story file: only the still, and nothing breaks", async () =>
  stillOnly(await phone({ prepare: (context) => context.route("**/js/study/reactions/coffee.js*", (route) => route.fulfill({ status: 404, body: "" })) }), "no file"),
);
await stage("a still redrawn since its story: only the still", async () =>
  stillOnly(
    await phone({
      prepare: (context) =>
        context.route("**/pictures/manifest.json", async (route) => {
          const response = await route.fetch();
          const body = await response.json();
          body.pictures.coffee.h = "0000000000";
          await route.fulfill({ response, json: body });
        }),
    }),
    "a redrawn still",
  ),
);
await stage("a question with no pictures: the call does nothing, and the game goes on", async () => {
  const { page, context, errors } = await phone({ prepare: (context) => context.route("**/pictures/manifest.json", (route) => route.fulfill({ status: 404, body: "" })) });
  await page.waitForFunction((S) => document.querySelector(S)?.lxStep, SESSION);
  const words = await page.evaluate(async () => {
    const { pictureChoices } = await import("/js/lx/ui.js");
    const { reactToAnswer, prepareReactions, reactionsRunning } = await import("/js/study/reactions.js");
    const grid = pictureChoices([{ label: "one" }, { label: "two" }, { label: "three" }], 0, {});
    document.body.append(grid);
    prepareReactions([null, null, null]);
    reactToAnswer(grid, [null, null, null], 0, 1);
    const running = reactionsRunning();
    grid.remove();
    return running;
  });
  assert(words === 0, `${words} running`);
  assert(!errors.length, errors.join("; "));
  await context.close();
});

// ---------- the size of the tile
for (const id of ["water", "tea", "milk"]) {
  await stage(`the first lesson's other pictures: ${id}, right and wrong, each on its own story`, async () => {
    const notes = [];
    for (const [mood, wanted] of [["happy", (s) => s.ids[s.correct] === id], ["sad", (s) => s.ids.includes(id) && s.ids[s.correct] !== id]]) {
      // The first lesson opens with three pictures and teaches its fourth through a sentence, so milk as the answer comes after it: in Practice, and in this game of pictures.
      const afterLesson = id === "milk" && mood === "happy";
      const { page, context, errors } = await phone(afterLesson ? { lesson: AFTER_FIRST } : {});
      if (afterLesson) {
        await page.evaluate(() => { location.hash = "#study/session/game/see"; });
        await page.waitForFunction((S) => document.querySelector(S)?.lxStep?.kind === "see", SESSION);
      }
      const step = await untilQuestion(page, wanted);
      const index = mood === "happy" ? step.correct : step.ids.indexOf(id);
      // the story is loaded before the tap, as the app's preload has it: a story arriving late is the late stages' to check
      await page.evaluate((one) => import(`/js/study/reactions/${one}.js`), id);
      await startWatch(page);
      await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(index).click();
      const { dur, text: end } = await endOf(page, id, mood);
      await page.waitForTimeout(500);
      await shotOf(page, index, `${id}-${mood}-mid`);
      await page.waitForTimeout((dur + 0.5) * 1000 - 500 + 400);
      await shotOf(page, index, `${id}-${mood}-end`);
      const seen = await readWatch(page), tile = seen.tiles[index];
      assert(tile.count > 40, `${mood}: only ${tile.count} frames drew`);
      assert(bare(tile.last) === bare(end), `${mood}: it didn't stay on its last pose`);
      assert(!seen.unfit, seen.unfit);
      await settled(page, step.ids, dur);
      const running = await page.evaluate(async () => (await import("/js/study/reactions.js")).reactionsRunning());
      assert(running === 0, `${mood}: ${running} still running`);
      assert(!errors.length, errors.join("; "));
      await context.close();
      notes.push(`${mood} ${tile.count} frames`);
    }
    return notes.join(", ");
  });
}

// The path's next pictures, each in the lesson that teaches it: a new word's first question is its picture, and it's a choice after that.
for (const [id, lesson] of [["book", "path-nl/l004"], ["phone", "path-nl/l005"], ["sofa", "path-nl/l005"], ["car", "path-nl/l006"], ["pocket", "path-nl/l007"], ["house", "path-nl/l010"]]) {
  await stage(`the path's next pictures: ${id}, right and wrong, each on its own story`, async () => {
    const notes = [];
    for (const [mood, wanted] of [["happy", (s) => s.ids[s.correct] === id], ["sad", (s) => s.ids.includes(id) && s.ids[s.correct] !== id]]) {
      const { page, context, errors } = await phone({ lesson });
      const step = await untilQuestion(page, wanted);
      const index = mood === "happy" ? step.correct : step.ids.indexOf(id);
      await startWatch(page);
      await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(index).click();
      const { dur, text: end } = await endOf(page, id, mood);
      await page.waitForTimeout(500);
      await shotOf(page, index, `${id}-${mood}-mid`);
      await page.waitForTimeout((dur + 0.5) * 1000 - 500 + 400);
      await shotOf(page, index, `${id}-${mood}-end`);
      const seen = await readWatch(page), tile = seen.tiles[index];
      assert(tile.count > 40, `${mood}: only ${tile.count} frames drew`);
      assert(bare(tile.last) === bare(end), `${mood}: it didn't stay on its last pose`);
      assert(!seen.unfit, seen.unfit);
      await settled(page, step.ids, dur);
      const running = await page.evaluate(async () => (await import("/js/study/reactions.js")).reactionsRunning());
      assert(running === 0, `${mood}: ${running} still running`);
      assert(!errors.length, errors.join("; "));
      await context.close();
      notes.push(`${mood} ${tile.count} frames`);
    }
    return notes.join(", ");
  });
}


// The path's pictures after those, each in the lesson that teaches it: a new word's first question is its picture, and it's a choice after that.
for (const id of ["door", "money", "city", "cup", "film", "office"]) {
  await stage(`the path's pictures after those: ${id}, right and wrong, each on its own story`, async () => {
    const notes = [];
    const where = await lessonsFor(id);
    for (const [mood, wanted, lesson] of [["happy", (s) => s.ids[s.correct] === id, where.teach], ["sad", (s) => s.ids.includes(id) && s.ids[s.correct] !== id, where.wrong]]) {
      const { page, context, errors } = await phone({ lesson });
      const step = await untilQuestion(page, wanted);
      const index = mood === "happy" ? step.correct : step.ids.indexOf(id);
      await startWatch(page);
      await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(index).click();
      const { dur, text: end } = await endOf(page, id, mood);
      await page.waitForTimeout(500);
      await shotOf(page, index, `${id}-${mood}-mid`);
      await page.waitForTimeout((dur + 0.5) * 1000 - 500 + 400);
      await shotOf(page, index, `${id}-${mood}-end`);
      const seen = await readWatch(page), tile = seen.tiles[index];
      assert(tile.count > 40, `${mood}: only ${tile.count} frames drew`);
      assert(bare(tile.last) === bare(end), `${mood}: it didn't stay on its last pose`);
      assert(!seen.unfit, seen.unfit);
      await settled(page, step.ids, dur);
      const running = await page.evaluate(async () => (await import("/js/study/reactions.js")).reactionsRunning());
      assert(running === 0, `${mood}: ${running} still running`);
      assert(!errors.length, errors.join("; "));
      await context.close();
      notes.push(`${mood} ${tile.count} frames (${lesson})`);
    }
    return notes.join(", ");
  });
}

/** Where the walk meets a path picture. Right: the lesson that teaches it. Wrong: the lessons from there whose picture question offers it as a wrong choice,
 * first few in order. A question's choices are fixed by its word, so a lesson (or the game after it) that never offers it never will: the app's own poolOf
 * and seeStep say which does. A lesson asks only some of its questions, so the walk tries these in turn. */
async function lessonsFor(id) {
  const { page, context } = await phone();
  const found = await page.evaluate(async (id) => {
    const { pathLessons } = await import("/js/study/path.js");
    const { poolOf, seeStep } = await import("/js/study/lesson.js");
    const lessons = pathLessons();
    const teach = lessons.findIndex((one) => one.things.some((thing) => !thing.formOnly && thing.picture === id));
    if (teach < 0) return { error: `no lesson on the path teaches ${id}` };
    const offers = (lesson, i) => {
      const units = new Set(lessons.slice(0, i).flatMap((one) => one.things.map((thing) => thing.unit)));
      const lemmas = new Set(lessons.slice(0, i).flatMap((one) => one.things.map((thing) => thing.lemma).filter(Boolean)));
      const pool = poolOf(lesson, lessons, { known: (lemma) => lemmas.has(lemma), st: (unit) => ({ isNew: !units.has(unit) }) });
      return lesson.things.some((thing) => {
        if (thing.formOnly || !thing.picture || thing.picture === id) return false;
        const entry = pool.find((one) => one.key === (thing.lemma ?? thing.phrase));
        return Boolean(entry && seeStep(entry, pool)?.options.some((option) => option.picture === id));
      });
    };
    // Plain lessons first: a whole unit's lesson asks only some of its questions.
    const plain = [], full = [];
    // The whole path from there: a picture can go a long way before a question happens to offer it.
    for (let i = teach; i < lessons.length && plain.length < 6; i++) if (offers(lessons[i], i)) (lessons[i].full ? full : plain).push(lessons[i].id);
    const wrongs = [...plain.slice(0, 6), ...full.slice(0, 2)];
    return { teach: lessons[teach].id, wrong: wrongs[0] ?? null, wrongs };
  }, id);
  await context.close();
  if (found.error) throw new Error(found.error);
  return found;
}

// The path's third pictures, each in the lesson that teaches it: a new word's first question is its picture, and it's a choice after that.
for (const id of ["bed", "room", "photo", "school", "week", "police"]) {
  await stage(`the path's third pictures: ${id}, right and wrong, each on its own story`, async () => {
    const notes = [];
    const where = await lessonsFor(id);
    for (const [mood, wanted, tries] of [["happy", (s) => s.ids[s.correct] === id, [where.teach]], ["sad", (s) => s.ids.includes(id) && s.ids[s.correct] !== id, where.wrongs]]) {
      let page, context, errors, step, lesson;
      for (const one of tries) {
        ({ page, context, errors } = await phone({ lesson: one }));
        // a whole unit's lesson, and the picture game after it, can take a long walk before the question comes
        try { step = await untilQuestion(page, wanted, mood === "sad" ? 150 : 60); lesson = one; break; } catch (error) { await context.close(); if (!/never reached/.test(String(error))) throw error; }
      }
      let straight = false;
      if (!step && mood === "sad") {
        // The path never offers it as a wrong picture where a walk can reach it (a lesson's choices are fixed by its word). So its sad story is played by the
        // app's own player, on its own tile, at the question that teaches it, as if it had been picked there wrongly; and the report says so.
        ({ page, context, errors } = await phone({ lesson: where.teach }));
        step = await untilQuestion(page, (s) => s.ids[s.correct] === id);
        lesson = `${where.teach}, played straight: no lesson offers it as a wrong picture (tried ${tries.join(", ") || "none"})`;
        straight = true;
      }
      if (!step) throw new Error(`${mood}: never met ${id} ${mood === "happy" ? "as the answer" : "as a wrong picture"} in ${tries.join(", ")}`);
      const index = mood === "happy" ? step.correct : step.ids.indexOf(id);
      await startWatch(page);
      if (straight) await page.evaluate(async ({ S, index }) => {
        const ids = document.querySelector(S).lxStep.options.map((option) => option?.picture ?? null), other = ids.findIndex((_, i) => i !== index);
        (await import("/js/study/reactions.js")).reactToAnswer(document.querySelector(`${S} [data-part="picture-choices"]`), ids, other, index);
      }, { S: SESSION, index });
      else {
        await page.waitForFunction((S) => !document.querySelector(`${S} [data-motion-hidden]`), SESSION, { timeout: 6000 }).catch(() => {});
        await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(index).click({ force: true });
      }
      const { dur, text: end } = await endOf(page, id, mood);
      await page.waitForTimeout(500);
      await shotOf(page, index, `${id}-${mood}-mid`);
      await page.waitForTimeout((dur + 0.5) * 1000 - 500 + 400);
      await shotOf(page, index, `${id}-${mood}-end`);
      const seen = await readWatch(page), tile = seen.tiles[index];
      assert(tile.count > 40, `${mood}: only ${tile.count} frames drew`);
      assert(bare(tile.last) === bare(end), `${mood}: it didn't stay on its last pose`);
      assert(!seen.unfit, seen.unfit);
      await settled(page, step.ids, dur);
      const running = await page.evaluate(async () => (await import("/js/study/reactions.js")).reactionsRunning());
      assert(running === 0, `${mood}: ${running} still running`);
      assert(!errors.length, errors.join("; "));
      await context.close();
      notes.push(`${mood} ${tile.count} frames (${lesson})`);
    }
    return notes.join(", ");
  });
}

// The path's last pictures, each in the lesson that teaches it: a new word's first question is its picture, and it's a choice after that.
for (const id of ["party", "evening", "night", "light", "heart"]) {
  await stage(`the path's last pictures: ${id}, right and wrong, each on its own story`, async () => {
    const notes = [];
    const where = await lessonsFor(id);
    for (const [mood, wanted, tries] of [["happy", (s) => s.ids[s.correct] === id, [where.teach]], ["sad", (s) => s.ids.includes(id) && s.ids[s.correct] !== id, where.wrongs]]) {
      let page, context, errors, step, lesson;
      for (const one of tries) {
        ({ page, context, errors } = await phone({ lesson: one }));
        // a whole unit's lesson, and the picture game after it, can take a long walk before the question comes
        try { step = await untilQuestion(page, wanted, mood === "sad" ? 150 : 60); lesson = one; break; } catch (error) { await context.close(); if (!/never reached/.test(String(error))) throw error; }
      }
      let straight = false;
      if (!step && mood === "sad") {
        // The path never offers it as a wrong picture where a walk can reach it (a lesson's choices are fixed by its word). So its sad story is played by the
        // app's own player, on its own tile, at the question that teaches it, as if it had been picked there wrongly; and the report says so.
        ({ page, context, errors } = await phone({ lesson: where.teach }));
        step = await untilQuestion(page, (s) => s.ids[s.correct] === id);
        lesson = `${where.teach}, played straight: no lesson offers it as a wrong picture (tried ${tries.join(", ") || "none"})`;
        straight = true;
      }
      if (!step) throw new Error(`${mood}: never met ${id} ${mood === "happy" ? "as the answer" : "as a wrong picture"} in ${tries.join(", ")}`);
      const index = mood === "happy" ? step.correct : step.ids.indexOf(id);
      await startWatch(page);
      if (straight) await page.evaluate(async ({ S, index }) => {
        const ids = document.querySelector(S).lxStep.options.map((option) => option?.picture ?? null), other = ids.findIndex((_, i) => i !== index);
        (await import("/js/study/reactions.js")).reactToAnswer(document.querySelector(`${S} [data-part="picture-choices"]`), ids, other, index);
      }, { S: SESSION, index });
      else {
        await page.waitForFunction((S) => !document.querySelector(`${S} [data-motion-hidden]`), SESSION, { timeout: 6000 }).catch(() => {});
        await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(index).click({ force: true });
      }
      const { dur, text: end } = await endOf(page, id, mood);
      await page.waitForTimeout(500);
      await shotOf(page, index, `${id}-${mood}-mid`);
      await page.waitForTimeout((dur + 0.5) * 1000 - 500 + 400);
      await shotOf(page, index, `${id}-${mood}-end`);
      const seen = await readWatch(page), tile = seen.tiles[index];
      assert(tile.count > 40, `${mood}: only ${tile.count} frames drew`);
      assert(bare(tile.last) === bare(end), `${mood}: it didn't stay on its last pose`);
      assert(!seen.unfit, seen.unfit);
      await settled(page, step.ids, dur);
      const running = await page.evaluate(async () => (await import("/js/study/reactions.js")).reactionsRunning());
      assert(running === 0, `${mood}: ${running} still running`);
      assert(!errors.length, errors.join("; "));
      await context.close();
      notes.push(`${mood} ${tile.count} frames (${lesson})`);
    }
    return notes.join(", ");
  });
}

// ---------- a story that lands late (a slow phone, a first visit, a quick tap): coffee's story is held on the network and let go at a chosen moment.
const heldBack = () => {
  let release;
  const gate = new Promise((done) => (release = done));
  return { release, prepare: (context) => context.route("**/js/study/reactions/coffee.js", async (route) => { await gate; await route.continue(); }) };
};
const tapCoffee = async (page) => {
  const step = await untilQuestion(page, (s) => s.ids[s.correct] === "coffee");
  const card = page.locator(`${SESSION} [data-part="picture-choice"]`).nth(step.correct);
  await page.waitForFunction((S) => !document.querySelector(`${S} [data-motion-hidden]`), SESSION, { timeout: 6000 }).catch(() => {});
  const still = await card.locator('[data-part="picture"] > svg').innerHTML();
  await card.click({ force: true });
  return { step, card, still };
};
await stage("a story that lands late, pressed at once: its last pose the moment it lands", async () => {
  const held = heldBack();
  const { page, context, errors } = await phone({ prepare: held.prepare });
  const { card } = await tapCoffee(page);
  await page.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  await page.waitForTimeout(350);
  held.release();
  const { text: end } = await endOf(page, "coffee", "happy");
  await page.waitForTimeout(200);
  assert(bare(await card.locator('[data-part="picture"] > svg').innerHTML()) === bare(end), "it landed 350 ms after the tap, and a press had asked for its end: not on its last pose");
  const running = await page.evaluate(async () => (await import("/js/study/reactions.js")).reactionsRunning());
  assert(running === 0, `${running} running after it landed`);
  assert(!errors.length, errors.join("; "));
  await context.close();
});

await stage("a story that lands late, no press: it plays from its first frame, never partway in", async () => {
  const held = heldBack();
  const { page, context, errors } = await phone({ prepare: held.prepare });
  const { step, still } = await tapCoffee(page);
  await startWatch(page);
  // Its moment to start was 320 ms after the tap: it lands well after that.
  await page.waitForTimeout(600);
  held.release();
  const { dur, text: end } = await endOf(page, "coffee", "happy");
  await page.waitForTimeout((dur + 0.6) * 1000);
  const frames = await page.evaluate((i) => window.__watch.tiles[i].frames.map((f) => ({ at: f.at, text: f.text })), step.correct);
  await readWatch(page);
  const moving = frames.filter((f) => bare(f.text) !== bare(still));
  assert(moving.length > 40, `only ${moving.length} frames drew`);
  // From its first moving frame to its last pose takes the whole story, less a frame or two: started partway in, it would take that much less.
  const span = (moving.at(-1).at - moving[0].at) / 1000;
  assert(span >= dur - 0.12, `it took ${span.toFixed(2)} s of its ${dur.toFixed(2)} s: it started partway in`);
  assert(bare(moving.at(-1).text) === bare(end), "it didn't end on its last pose");
  assert(!errors.length, errors.join("; "));
  await context.close();
});

await stage("a story that lands too late (past 1 s after the tap): the still stays, nothing pops in", async () => {
  const held = heldBack();
  const { page, context, errors } = await phone({ prepare: held.prepare });
  const { card, still } = await tapCoffee(page);
  await page.waitForTimeout(1300);
  held.release();
  await endOf(page, "coffee", "happy");
  await page.waitForTimeout(700);
  assert(bare(await card.locator('[data-part="picture"] > svg').innerHTML()) === bare(still), "it landed 1.3 s after the tap and moved anyway: a picture moving that long after the answer reads as a glitch");
  const running = await page.evaluate(async () => (await import("/js/study/reactions.js")).reactionsRunning());
  assert(running === 0, `${running} still running`);
  assert(!errors.length, errors.join("; "));
  await context.close();
});

await stage("a small phone: the frames fit whatever size the tile is", async () => {
  const { page, context, errors } = await phone({ width: 320, height: 568 });
  const step = await untilQuestion(page, (s) => s.ids[s.correct] === "coffee");
  const card = page.locator(`${SESSION} [data-part="picture-choice"]`).nth(step.correct);
  await startWatch(page);
  await card.click();
  await page.waitForTimeout(900);
  const seen = await readWatch(page);
  assert(!seen.unfit, seen.unfit);
  assert(seen.tiles[step.correct].count > 10, `only ${seen.tiles[step.correct].count} frames drew`);
  const size = await card.locator('[data-part="picture"]').boundingBox();
  await shotOf(page, step.correct, "coffee-small-phone");
  assert(!errors.length, errors.join("; "));
  await context.close();
  return `${Math.round(size.width)} px tile`;
});

// ---------- the key
await stage("key: tapped wrongly, its sad story; and when two tiles react at once, no ids collide", async () => {
  const { page, context, errors } = await phone({ lesson: KEY_LESSON });
  let step;
  try {
    step = await untilQuestion(page, (s) => s.ids.includes("key") && s.ids[s.correct] !== "key", 40);
  } catch {
    throw new Error("no question had the key as a wrong choice");
  }
  const index = step.ids.indexOf("key");
  await startWatch(page);
  await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(index).click();
  const { dur, text: end } = await endOf(page, "key", "sad");
  await page.waitForTimeout(1600);
  await shotOf(page, index, "key-sad-mid");
  await page.waitForTimeout((dur + 0.5) * 1000 - 1600 + 400);
  await shotOf(page, index, "key-sad-end");
  const seen = await readWatch(page);
  assert(seen.tiles[index].count > 40, `only ${seen.tiles[index].count} frames`);
  assert(bare(seen.tiles[index].last) === bare(end), "it didn't stay on its last pose");
  assert(seen.dupes === 0, `${seen.dupes} frames with the same id twice`);
  const other = step.ids[step.correct];
  assert(!errors.length, errors.join("; "));
  await context.close();
  return `${seen.tiles[index].count} frames; the right one is ${other ?? "words"}`;
});
await stage("key, right: the lock opens", async () => {
  const { page, context, errors } = await phone({ lesson: KEY_LESSON });
  const step = await untilQuestion(page, (s) => s.ids[s.correct] === "key", 40);
  await startWatch(page);
  await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(step.correct).click();
  const { dur, text: end } = await endOf(page, "key", "happy");
  await page.waitForTimeout(1000);
  await shotOf(page, step.correct, "key-happy-mid");
  await page.waitForTimeout((dur + 0.5) * 1000 - 1000 + 400);
  await shotOf(page, step.correct, "key-happy-end");
  const seen = await readWatch(page);
  assert(seen.tiles[step.correct].count > 40, `only ${seen.tiles[step.correct].count} frames`);
  assert(bare(seen.tiles[step.correct].last) === bare(end), "it didn't end open");
  assert(!errors.length, errors.join("; "));
  await context.close();
  return `${seen.tiles[step.correct].count} frames`;
});

// ---------- two stories at once: a wrong tap's sad one and its right tile's happy one, on a question where both tiles have a story
const STORY_IDS = new Set([...readFileSync(new URL("../public/js/study/reactions.js", import.meta.url), "utf8").matchAll(/^\s*([a-z-]+): \(\) => import\("\.\/reactions\//gm)].map((m) => m[1]));
await stage("two tiles react at once (a wrong tap and its right tile): both play, and no ids collide", async () => {
  const { page, context, errors } = await phone({ lesson: KEY_LESSON });
  const both = (s) => STORY_IDS.has(s.ids[s.correct]) && s.ids.some((id, i) => i !== s.correct && STORY_IDS.has(id));
  const step = await untilQuestion(page, both, 60);
  const wrong = step.ids.findIndex((id, i) => i !== step.correct && STORY_IDS.has(id));
  await startWatch(page);
  await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(wrong).click();
  const sad = await endOf(page, step.ids[wrong], "sad"), happy = await endOf(page, step.ids[step.correct], "happy");
  await page.waitForTimeout((Math.max(sad.dur, happy.dur) + 0.5) * 1000 + 400);
  const seen = await readWatch(page);
  assert(seen.tiles[wrong].count > 40, `the wrong tile drew ${seen.tiles[wrong].count} frames`);
  assert(seen.tiles[step.correct].count > 40, `the right tile drew ${seen.tiles[step.correct].count} frames`);
  assert(bare(seen.tiles[wrong].last) === bare(sad.text), "the wrong tile didn't stay on its last pose");
  assert(bare(seen.tiles[step.correct].last) === bare(happy.text), "the right tile didn't stay on its last pose");
  assert(seen.dupes === 0, `${seen.dupes} frames with the same id twice`);
  assert(!errors.length, errors.join("; "));
  await context.close();
  return `${step.ids[wrong]} sad and ${step.ids[step.correct]} happy at once: ${seen.tiles[wrong].count} and ${seen.tiles[step.correct].count} frames`;
});
await stage("wrong on a question with the coffee right: the right tile goes happy too", async () => {
  const { page, context, errors } = await phone();
  const step = await untilQuestion(page, (s) => s.ids[s.correct] === "coffee");
  const wrong = (step.correct + 1) % step.ids.length;
  await startWatch(page);
  await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(wrong).click();
  const { dur, text: end } = await endOf(page, "coffee", "happy");
  await page.waitForTimeout((dur + 0.5) * 1000 + 300);
  const seen = await readWatch(page);
  assert(seen.tiles[step.correct].count > 40, `the right tile drew ${seen.tiles[step.correct].count} frames`);
  assert(bare(seen.tiles[step.correct].last) === bare(end), "the right tile didn't end happy");
  assert(!errors.length, errors.join("; "));
  await context.close();
  return `tapped ${step.ids[wrong]}, ${seen.tiles[step.correct].count} frames on the coffee`;
});

// ---------- a story with one mood: coffee planted with its sad alone, through the page's own request for its module (the rest of it from the real file)
const sadOnly = (context) =>
  context.route("**/js/study/reactions/coffee.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: 'import * as whole from "./coffee.js?whole";\nexport const { STILL, STILL_HASH, frame } = whole;\nexport const REACTIONS = { sad: whole.REACTIONS.sad };\n' }),
  );
const moodsOf = (page, id) => page.evaluate(async (id) => Object.keys((await import(`/js/study/reactions/${id}.js`)).REACTIONS).join(","), id);
/** Whether the card's own pop or shake ran on a tile (its ghost hides the real tile, or a part of it, until it lands): watched from before the tap. */
const watchPop = (page, index) =>
  page.evaluate(([S, index]) => {
    const card = document.querySelectorAll(`${S} [data-part="picture-choice"]`)[index];
    window.__popped = false;
    new MutationObserver((records) => {
      for (const r of records) if (r.target.hasAttribute("data-motion-hidden") && (r.target === card || card.contains(r.target) || r.target.contains(card))) window.__popped = true;
    }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["data-motion-hidden"] });
  }, [SESSION, index]);
await stage("a story with its sad alone, answered right: the card's pop on its still, no story, nothing left running", async () => {
  const { page, context, errors } = await phone({ prepare: sadOnly });
  const moods = await moodsOf(page, "coffee");
  assert(moods === "sad", `the planted story has ${moods}`);
  const step = await untilQuestion(page, (s) => s.ids[s.correct] === "coffee");
  const card = page.locator(`${SESSION} [data-part="picture-choice"]`).nth(step.correct);
  const svg = card.locator('[data-part="picture"] > svg');
  const still = await svg.innerHTML();
  await watchPop(page, step.correct);
  await startWatch(page);
  await card.click();
  await page.waitForTimeout(1500);
  const seen = await readWatch(page);
  assert(await page.evaluate(() => window.__popped), "the card's own pop never ran");
  for (const [i, tile] of seen.tiles.entries()) assert(tile.count <= 1, `tile ${i} moved, ${tile.count} frames`);
  assert((await svg.innerHTML()) === still, "the still changed");
  const running = await page.evaluate(async () => (await import("/js/study/reactions.js")).reactionsRunning());
  assert(running === 0, `${running} still running`);
  assert(await next(page).isVisible(), "no Continue");
  assert(!errors.length, errors.join("; "));
  await context.close();
  return "the pop, then its still held; nothing running";
});
await stage("a wrong tap whose right tile has its sad alone: no happy beside it, its still holds, the tapped tile's own sad plays", async () => {
  const { page, context, errors } = await phone({ prepare: sadOnly });
  const step = await untilQuestion(page, (s) => s.ids[s.correct] === "coffee" && s.ids.some((id, i) => i !== s.correct && STORY_IDS.has(id)));
  const wrong = step.ids.findIndex((id, i) => i !== step.correct && STORY_IDS.has(id));
  const right = page.locator(`${SESSION} [data-part="picture-choice"]`).nth(step.correct).locator('[data-part="picture"] > svg');
  const still = await right.innerHTML();
  await startWatch(page);
  await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(wrong).click();
  const sad = await endOf(page, step.ids[wrong], "sad");
  await page.waitForTimeout((sad.dur + 0.5) * 1000 + 400);
  const seen = await readWatch(page);
  assert(seen.tiles[step.correct].count <= 1, `the right tile moved, ${seen.tiles[step.correct].count} frames`);
  assert((await right.innerHTML()) === still, "the right tile's still changed");
  assert(seen.tiles[wrong].count > 40, `the tapped tile drew ${seen.tiles[wrong].count} frames`);
  assert(bare(seen.tiles[wrong].last) === bare(sad.text), "the tapped tile didn't stay on its sad's last pose");
  await settled(page, step.ids, sad.dur);
  const running = await page.evaluate(async () => (await import("/js/study/reactions.js")).reactionsRunning());
  assert(running === 0, `${running} still running`);
  assert(!errors.length, errors.join("; "));
  await context.close();
  return `tapped ${step.ids[wrong]}: its sad, ${seen.tiles[wrong].count} frames; the coffee still`;
});
await stage("a story with its sad alone, tapped wrongly: its sad plays and holds", async () => {
  const { page, context, errors } = await phone({ prepare: sadOnly });
  const step = await untilQuestion(page, (s) => s.ids.includes("coffee") && s.ids[s.correct] !== "coffee");
  const index = step.ids.indexOf("coffee");
  await startWatch(page);
  await page.locator(`${SESSION} [data-part="picture-choice"]`).nth(index).click();
  const { dur, text: end } = await endOf(page, "coffee", "sad");
  await page.waitForTimeout((dur + 0.5) * 1000 + 400);
  const seen = await readWatch(page);
  assert(seen.tiles[index].count > 40, `only ${seen.tiles[index].count} frames`);
  assert(bare(seen.tiles[index].last) === bare(end), "it didn't stay on its sad's last pose");
  await settled(page, step.ids, dur);
  const running = await page.evaluate(async () => (await import("/js/study/reactions.js")).reactionsRunning());
  assert(running === 0, `${running} still running`);
  assert(!errors.length, errors.join("; "));
  await context.close();
  return `${seen.tiles[index].count} frames`;
});

await browser.close();
writeFileSync(`${OUT}/${engine}-results.json`, JSON.stringify(results, null, 1));
console.log(failed ? `${failed} of ${results.length} failed` : `all ${results.length} passed`);
process.exit(failed ? 1 : 0);
