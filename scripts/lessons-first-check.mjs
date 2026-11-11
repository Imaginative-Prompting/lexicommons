// A brand-new learner's first lesson is the path's lesson 1, never the starter's (study/packs.js lessonsComing and the sync's order, the path
// page's hold, study/session.js's start), on a phone in Chromium and WebKit, with path-nl's file held HOLD ms (5 s) on its way. Each round a
// new account (its passkey made in Chromium, as WebKit can't) on a new device of the engine's, through the real first run (English, then Dutch):
//   home   Home's Start tapped 1.0 s after Dutch is picked (or, while Home holds its card, the address its Start opens): the session that opens is
//          path-nl's lesson 1, started only once path-nl is here; the tap itself came while it was still held, so the wait is what's proven
//   study  the same from Study's lesson door, 1.4 s after
//   path   the path page while it's held: no stop to tap (no lesson of the starter's on offer); once it's here, path-nl's lessons, lesson 1 first
//   slow   a first run that takes DWELL ms (20 s) over its questions, then Home's Start at 1.0 s and Study's door at 1.4 s: path-nl's lesson 1
//          all the same (packs.js: the wait counts from the language's sync, never from a look while the questions are on screen)
//   game   Study's Tap the picture pressed 1.4 s after picking Dutch, after a quick first run and after a slow one: the game opens once path-nl is
//          here, its first word one of lesson 1's (study/session.js waits for a newcomer's game as for the next lesson), never a word band's
// and in every round: path-nl asked for before any word band, and no page error. Pictures of each moment in <outDir>/shots. LOCAL only, path-nl
// and the Dutch word bands seeded (exit 0 = pass)
//   node scripts/lessons-first-check.mjs http://localhost:<port> <outDir> [--engines chromium,webkit] [--hold 5000] [--rounds 3] [--dwell 20000]
process.env.LX_FIRST_RUN = "1";
const { chromium, webkit } = await import("./quiet-browser.mjs");
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [BASE, outArg] = process.argv.slice(2);
const opt = (name, fallback) => (process.argv.includes(`--${name}`) ? process.argv[process.argv.indexOf(`--${name}`) + 1] : fallback);
if (!BASE || !outArg || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("usage: lessons-first-check.mjs http://localhost:<port> <outDir> [--engines chromium,webkit] [--hold 5000] [--rounds 3] (LOCAL only: it signs up accounts)");
  process.exit(2);
}
const ENGINES = opt("engines", "chromium,webkit").split(",");
const HOLD = Number(opt("hold", "5000"));
const DWELL = Number(opt("dwell", "20000"));
const ROUNDS = Number(opt("rounds", "3"));
const OUT = resolve(outArg);
mkdirSync(join(OUT, "shots"), { recursive: true });
const HERE = dirname(fileURLToPath(import.meta.url));
// path-nl's first lesson, as the library has it (packs/path-nl.json), and how studying names it.
const PATH = JSON.parse(readFileSync(join(HERE, "../packs/path-nl.json"), "utf8"));
const FIRST = `path-nl/${PATH.lessons[0].id}`;
const FIRST_TITLE = PATH.lessons[0].title;
const SESSION = '[data-part="session"]:not([data-ghost])';

let failed = 0;
const results = [];
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
const stage = async (name, run) => {
  try {
    const said = await run();
    console.log(`ok    ${name}${said ? `: ${said}` : ""}`);
    results.push({ name, ok: true, said });
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${String(error.message ?? error).slice(0, 600)}`);
    results.push({ name, ok: false, error: String(error.message ?? error) });
  }
};

// ---------- a new account, a new device ----------
const signer = await chromium.launch({ headless: true });
let accounts = 0;
async function newAccountCookies() {
  const context = await signer.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', `Lessons first ${++accounts}`);
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  const cookies = await context.cookies();
  await context.close();
  return cookies;
}

const browsers = {};
// A device of the engine's for a new account, path-nl's file held HOLD ms; the moments it was asked for and arrived, on the page's clock.
async function newDevice(engine) {
  browsers[engine] ??= await (engine === "webkit" ? webkit : chromium).launch({ headless: true });
  const cookies = await newAccountCookies();
  const context = await browsers[engine].newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, ...(engine === "chromium" ? { isMobile: true } : {}), colorScheme: "dark" });
  await context.addCookies(cookies);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const packsAsked = [];
  page.on("request", (request) => {
    const m = new URL(request.url()).pathname.match(/^\/library\/packs\/([^/]+)\//);
    if (m) packsAsked.push(m[1]);
  });
  const path = { askedAt: null, arrivedAt: null };
  await context.route(/\/library\/packs\/path-nl\//, async (route) => {
    path.askedAt = Date.now();
    await new Promise((done) => setTimeout(done, HOLD));
    path.arrivedAt = Date.now();
    await route.continue();
  });
  return { context, page, errors, packsAsked, path };
}

// The first run: English, then Dutch, dwell ms on the second question first. Returns when Dutch was picked (Date.now()).
async function firstRun(page, { dwell = 0 } = {}) {
  await page.goto(`${BASE}/app/`);
  await page.waitForSelector(".lx-welcome [data-language]", { timeout: 60_000 });
  await page.locator('.lx-welcome [data-language="en"]').click();
  await page.waitForFunction(() => document.querySelector('.lx-welcome [data-part="page-title"]')?.textContent === "What do you want to learn?", null, { timeout: 10_000 });
  if (dwell) await page.waitForTimeout(dwell);
  const picked = Date.now();
  await page.locator('.lx-welcome [data-language="nl"]').click();
  return picked;
}

const comingNow = (page) => page.evaluate(async () => (await import("/js/study/packs.js")).lessonsComing?.() ?? null);
const shot = (page, name) => page.screenshot({ path: join(OUT, "shots", `${name}.png`) }).catch(() => {});

// The session that opened: its lesson (data-lesson; an app from before has none, so its title, the session's label, says which), and when it
// was first on the page (polled every 50 ms, in the page).
async function sessionThatOpens(page) {
  const found = await page.evaluate(
    ([S, ms]) =>
      new Promise((done) => {
        const end = performance.now() + ms;
        const look = () => {
          const root = document.querySelector(S);
          if (root?.dataset.lesson || (root && /session\/lesson/.test(location.hash))) return done({ lesson: root.dataset.lesson ?? null, title: root.getAttribute("aria-label"), at: Date.now() });
          if (performance.now() > end) return done(null);
          setTimeout(look, 50);
        };
        look();
      }),
    [SESSION, HOLD + 30_000],
  );
  assert(found, "no lesson session opened");
  return found;
}

// A tap that opens the next lesson (the card's or door's link, or, while it's held, the address that link opens), then the session it opens.
async function startFrom(page, link, address) {
  const tapped = (await link.count()) > 0;
  const coming = await comingNow(page);
  const tapAt = Date.now();
  if (tapped) await link.first().tap();
  else await page.evaluate((hash) => (location.hash = hash), address);
  return { tapAt, coming, tapped };
}

for (const engine of ENGINES) {
  for (let round = 1; round <= ROUNDS; round++) {
    await stage(`${engine}, round ${round}: Home's Start 1.0 s after picking Dutch, path-nl held ${HOLD / 1000} s: the lesson that opens is path-nl's lesson 1`, async () => {
      const { context, page, errors, packsAsked, path } = await newDevice(engine);
      try {
        const picked = await firstRun(page);
        await page.waitForSelector('[data-part="page"] .lx-today-next', { timeout: 30_000 });
        await page.waitForTimeout(Math.max(0, 1000 - (Date.now() - picked)));
        const card = (await page.locator('[data-part="page"] .lx-today-next').textContent().catch(() => "")).trim().replace(/\s+/g, " ").slice(0, 80);
        await shot(page, `${engine}-${round}-home-at-tap`);
        const tap = await startFrom(page, page.locator('[data-part="page"] .lx-today-next').getByRole("button", { name: "Start", exact: true }), "#study/session/lesson?from=today");
        const opened = await sessionThatOpens(page);
        await shot(page, `${engine}-${round}-session`);
        assert(packsAsked[0] === "path-nl", `the first pack asked for was ${packsAsked[0]} (${packsAsked.slice(0, 4).join(", ")})`);
        assert(path.arrivedAt && tap.tapAt < path.arrivedAt, `the tap came after path-nl had arrived (tap ${tap.tapAt - picked} ms, path-nl ${path.arrivedAt ? path.arrivedAt - picked : "never"} ms after picking): the wait wasn't tested`);
        assert(tap.coming === true, `lessonsComing at the tap: ${tap.coming}`);
        assert(opened.lesson === FIRST && opened.title === FIRST_TITLE, `the lesson that opened is "${opened.title}" (${opened.lesson ?? "no id"}), not path-nl's lesson 1 "${FIRST_TITLE}" (${FIRST})`);
        assert(opened.at >= path.arrivedAt, `the session opened ${path.arrivedAt - opened.at} ms before path-nl arrived`);
        assert(!errors.length, `page errors: ${errors.slice(0, 2).join(" | ")}`);
        return `card at the tap "${card}" (${tap.tapped ? "its Start tapped" : "held: its address opened"} at ${tap.tapAt - picked} ms); path-nl in at ${path.arrivedAt - picked} ms; ${opened.lesson} opened at ${opened.at - picked} ms; packs asked: ${packsAsked.slice(0, 3).join(", ")}…`;
      } finally {
        await context.close();
      }
    });
  }

  await stage(`${engine}: Study's lesson door 1.4 s after picking Dutch, then the path page while path-nl is held: no stop on offer, then path-nl's lessons`, async () => {
    const { context, page, errors, packsAsked, path } = await newDevice(engine);
    try {
      const picked = await firstRun(page);
      await page.waitForSelector('[data-part="page"] .lx-today-next', { timeout: 30_000 });
      // The path page first, while it's held: nothing to tap.
      await page.evaluate(() => (location.hash = "#study/path"));
      await page.waitForFunction(() => location.hash === "#study/path" && document.querySelector('[data-part="page"] .lx-path-page'), null, { timeout: 15_000 });
      await page.waitForTimeout(300);
      const heldStops = await page.locator('[data-part="page"] .lx-path-page .lx-ps').count();
      const comingThen = await comingNow(page);
      await shot(page, `${engine}-path-held`);
      assert(comingThen === true && !path.arrivedAt, `the path page wasn't seen while path-nl was held (coming ${comingThen}, path-nl in ${path.arrivedAt ? path.arrivedAt - picked : "not yet"})`);
      assert(heldStops === 0, `${heldStops} stops on offer while the lessons were coming`);
      // Then Study's door, at 1.4 s if there's still time.
      await page.evaluate(() => (location.hash = "#study"));
      await page.waitForFunction(() => location.hash === "#study", null, { timeout: 10_000 });
      await page.waitForTimeout(Math.max(0, 1400 - (Date.now() - picked)));
      await shot(page, `${engine}-study-at-tap`);
      // While the lessons come the door is held (shell/study.js heldDoor: its name in place, no link, no press), so the door's address is opened
      // as Home's held card's is; one that isn't held is tapped.
      const held = await page.locator('[data-part="page"] [data-door="lesson"][data-held]').count();
      if (held) assert(!(await page.locator('[data-part="page"] [data-door="lesson"][data-held] a[href], [data-part="page"] a[data-door="lesson"][data-held][href]').count()), "the held door has a link");
      const tap = await startFrom(page, page.locator('[data-part="page"] [data-door="lesson"]:not([data-held])'), "#study/session/lesson");
      const opened = await sessionThatOpens(page);
      assert(tap.tapAt < path.arrivedAt && tap.coming === true, `the tap wasn't while path-nl was held (tap ${tap.tapAt - picked} ms, coming ${tap.coming})`);
      assert(opened.lesson === FIRST && opened.title === FIRST_TITLE && opened.at >= path.arrivedAt, `the lesson that opened is "${opened.title}" (${opened.lesson ?? "no id"}) at ${opened.at - picked} ms (path-nl in at ${path.arrivedAt ? path.arrivedAt - picked : "not yet"} ms)`);
      // The path page once it's here: path-nl's lessons, lesson 1 first.
      await page.evaluate(() => (location.hash = "#study/path"));
      await page.waitForFunction(() => location.hash === "#study/path", null, { timeout: 10_000 });
      const first = await page.evaluate(async () => (await import("/js/study/plan.js")).pathOverview(5).lessons[0]?.id ?? null);
      await page.waitForTimeout(600);
      const stops = await page.locator('[data-part="page"] .lx-path-page .lx-ps').count();
      await shot(page, `${engine}-path-after`);
      assert(first === FIRST && stops > 0, `the path after: its first lesson ${first}, ${stops} stops drawn`);
      assert(packsAsked[0] === "path-nl", `the first pack asked for was ${packsAsked[0]}`);
      assert(!errors.length, `page errors: ${errors.slice(0, 2).join(" | ")}`);
      return `the path page held with no stop while path-nl was on its way; Study's door ${tap.tapped ? "tapped" : "held: its address opened"} at ${tap.tapAt - picked} ms; ${opened.lesson} opened at ${opened.at - picked} ms (path-nl in at ${path.arrivedAt - picked} ms); the path then ${stops} stops, ${first} first`;
    } finally {
      await context.close();
    }
  });

  // A first run that takes its time over the questions (Home is drawn under them and asks whether the lessons are coming).
  await stage(`${engine}: a first run of ${DWELL / 1000} s, then Home's Start 1.0 s after picking Dutch, path-nl held ${HOLD / 1000} s: path-nl's lesson 1 all the same`, async () => {
    const { context, page, errors, path } = await newDevice(engine);
    try {
      const picked = await firstRun(page, { dwell: DWELL });
      await page.waitForSelector('[data-part="page"] .lx-today-next', { timeout: 30_000 });
      await page.waitForTimeout(Math.max(0, 1000 - (Date.now() - picked)));
      const card = (await page.locator('[data-part="page"] .lx-today-next').textContent().catch(() => "")).trim().replace(/\s+/g, " ").slice(0, 120);
      await shot(page, `${engine}-slow-home-at-tap`);
      const tap = await startFrom(page, page.locator('[data-part="page"] .lx-today-next').getByRole("button", { name: "Start", exact: true }), "#study/session/lesson?from=today");
      const opened = await sessionThatOpens(page);
      await shot(page, `${engine}-slow-home-session`);
      assert(tap.coming === true, `lessonsComing at the tap after a ${DWELL / 1000} s first run: ${tap.coming} (Home's card "${card}")`);
      assert(!path.arrivedAt || tap.tapAt < path.arrivedAt, "the tap came after path-nl had arrived: the wait wasn't tested");
      assert(opened.lesson === FIRST && opened.title === FIRST_TITLE, `the lesson that opened is "${opened.title}" (${opened.lesson ?? "no id"}), not path-nl's lesson 1 "${FIRST_TITLE}" (${FIRST})`);
      assert(path.arrivedAt && opened.at >= path.arrivedAt, `the session opened ${path.arrivedAt ? `${path.arrivedAt - opened.at} ms before path-nl arrived` : "while path-nl was still held"}`);
      assert(!errors.length, `page errors: ${errors.slice(0, 2).join(" | ")}`);
      return `card at the tap "${card}"; ${tap.tapped ? "its Start tapped" : "held: its address opened"} at ${tap.tapAt - picked} ms; path-nl in at ${path.arrivedAt - picked} ms; ${opened.lesson} opened at ${opened.at - picked} ms`;
    } finally {
      await context.close();
    }
  });

  await stage(`${engine}: a first run of ${DWELL / 1000} s, then Study's lesson door 1.4 s after picking Dutch, path-nl held: path-nl's lesson 1 all the same`, async () => {
    const { context, page, errors, path } = await newDevice(engine);
    try {
      const picked = await firstRun(page, { dwell: DWELL });
      await page.waitForSelector('[data-part="page"] .lx-today-next', { timeout: 30_000 });
      await page.evaluate(() => (location.hash = "#study"));
      await page.waitForFunction(() => location.hash === "#study" && document.querySelector('[data-part="page"] [data-door="lesson"]'), null, { timeout: 10_000 });
      await page.waitForTimeout(Math.max(0, 1400 - (Date.now() - picked)));
      const door = (await page.locator('[data-part="page"] [data-door="lesson"]').first().textContent().catch(() => "")).trim().replace(/\s+/g, " ").slice(0, 120);
      await shot(page, `${engine}-slow-study-at-tap`);
      const tap = await startFrom(page, page.locator('[data-part="page"] [data-door="lesson"]:not([data-held])'), "#study/session/lesson");
      const opened = await sessionThatOpens(page);
      assert(tap.coming === true && (!path.arrivedAt || tap.tapAt < path.arrivedAt), `the tap wasn't while path-nl was coming (coming ${tap.coming}; the door said "${door}")`);
      assert(opened.lesson === FIRST && opened.title === FIRST_TITLE && path.arrivedAt && opened.at >= path.arrivedAt, `the lesson that opened is "${opened.title}" (${opened.lesson ?? "no id"}) at ${opened.at - picked} ms (path-nl in at ${path.arrivedAt ? path.arrivedAt - picked : "not yet"} ms)`);
      assert(!errors.length, `page errors: ${errors.slice(0, 2).join(" | ")}`);
      return `the door said "${door}"; ${tap.tapped ? "tapped" : "held: its address opened"} at ${tap.tapAt - picked} ms; ${opened.lesson} opened at ${opened.at - picked} ms (path-nl in at ${path.arrivedAt - picked} ms)`;
    } finally {
      await context.close();
    }
  });

  // A newcomer's game from Study, pressed while path-nl is held: after a quick first run and after a slow one.
  for (const dwell of [0, DWELL]) {
    await stage(`${engine}: ${dwell ? `a first run of ${dwell / 1000} s, then ` : ""}Study's Tap the picture pressed 1.4 s after picking Dutch, path-nl held: the game waits for it and its first word is lesson 1's, never a word band's`, async () => {
      const { context, page, errors, path } = await newDevice(engine);
      try {
        const picked = await firstRun(page, { dwell });
        await page.waitForSelector('[data-part="page"] .lx-today-next', { timeout: 30_000 });
        await page.evaluate(() => (location.hash = "#study"));
        const TILE = '[data-part="page"] [data-part="way-tile"][data-game="see"]';
        await page.waitForSelector(TILE, { timeout: 15_000 });
        await page.waitForTimeout(Math.max(0, 1400 - (Date.now() - picked)));
        const coming = await comingNow(page);
        const tapAt = Date.now();
        await page.locator(TILE).tap();
        // The game's first step, and when it was first on the page (polled every 50 ms, in the page).
        const opened = await page.evaluate(
          ([S, ms]) =>
            new Promise((done) => {
              const end = performance.now() + ms;
              const look = () => {
                const step = document.querySelector(S)?.lxStep;
                if (step) return done({ kind: step.kind, unit: step.unit ?? null, text: step.text ?? null, at: Date.now() });
                if (performance.now() > end) return done(null);
                setTimeout(look, 50);
              };
              look();
            }),
          [SESSION, HOLD + 30_000],
        );
        await shot(page, `${engine}-${dwell ? "slow-" : ""}game-first-step`);
        assert(opened, "no game opened");
        const lessonOne = await page.evaluate(async () => (await import("/js/study/path.js")).pathLessons()[0]?.things.map((thing) => thing.unit) ?? []);
        // The press came while path-nl was held (it may still be held when the game opened: that's the fault this stage is for).
        assert(coming === true && (!path.arrivedAt || tapAt < path.arrivedAt), `the press wasn't while path-nl was held (pressed ${tapAt - picked} ms, coming ${coming})`);
        assert(path.arrivedAt && opened.at >= path.arrivedAt, `the game opened at ${opened.at - picked} ms on ${opened.text ?? opened.unit}, ${path.arrivedAt ? `${path.arrivedAt - opened.at} ms before path-nl arrived` : "while path-nl was still held"}`);
        assert(opened.kind === "see" && lessonOne.includes(opened.unit), `its first step is ${opened.kind} on ${opened.unit} (${opened.text}), not one of lesson 1's: ${lessonOne.join(", ")}`);
        assert(!errors.length, `page errors: ${errors.slice(0, 2).join(" | ")}`);
        return `pressed at ${tapAt - picked} ms (lessons coming); path-nl in at ${path.arrivedAt - picked} ms; the game opened at ${opened.at - picked} ms on ${opened.text ?? opened.unit}`;
      } finally {
        await context.close();
      }
    });
  }
}

await signer.close();
for (const browser of Object.values(browsers)) await browser.close();
writeFileSync(join(OUT, "lessons-first-check.json"), JSON.stringify({ at: new Date().toISOString(), base: BASE, hold: HOLD, first: FIRST, results }, null, 1));
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
