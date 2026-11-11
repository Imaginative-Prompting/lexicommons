// A card's drawn outline (lx/edge.js: Study's ticket and notch, Translate's hinge, a card's clipped corner) is on it in every frame the card is
// seen, pictures of a page included. Study's doors are drawn again as Study comes back up to date, and the router slides the arriving page in
// as a picture (shell/page-slide.js copyOf, a copy in a closed shadow root) taken in that same task, before the outlines' observers have drawn
// them: on 6 Nov the new lesson's ticket showed with no border for the whole slide after the header's Back from the path, and not after a swipe
// (whose picture was taken when you left). copyOf now has edge.js draw them first (drawOutlines).
// As a learner on a touch phone (390 × 844), in Chromium and WebKit (WebKit signs in with the account Chromium made: a cookie handed across):
//   - Study → the path (Where you are), the lesson Study names finished there as a session finishes it (an answer for each of its words, then
//     its mark), held until Study names another: Study comes back with a new door, and its Practice card for the first time → the header's
//     Back: every painted frame for 1.5 s, every outline on the screen, on the page (unless it's held unseen) and on any picture of a page (its
//     closed shadow root opened for this check only), has its line; a door that doesn't change fails as a stage not reached;
//   - the same by the app's swipe back, from the left edge (WebKit: the phone's back, history.back, as it can't be swiped here);
//   - no page errors.
// --swap <served path>=<file> serves an older file in its place: edge.js and page-slide.js from before fail the header's stages (23 and 19
// frames with a picture's notch bare), the swipe passing as it did. LOCAL only (exit 0 = pass)
//   node scripts/outline-check.mjs http://localhost:<port> <outDir> [--engines chromium,webkit] [--swap /js/lx/edge.js=<old> --swap /js/shell/page-slide.js=<old>]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, webkit } from "./quiet-browser.mjs";

const argv = process.argv.slice(2);
const [BASE, OUT] = argv;
const opt = (name, fallback) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : fallback);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE ?? "") || !OUT) {
  console.error("Usage: node scripts/outline-check.mjs http://localhost:<port> <outDir> [--engines chromium,webkit] [--swap <path>=<file>]");
  process.exit(2);
}
const ENGINES = opt("engines", "chromium,webkit").split(",");
const SWAPS = argv.flatMap((a, i) => (a === "--swap" ? [argv[i + 1].split("=")] : []));
mkdirSync(OUT, { recursive: true });
let failed = 0;
const results = [];
const report = (ok, what, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}${detail ? `: ${detail}` : ""}`);
  results.push({ ok, what, detail });
  if (!ok) failed++;
};

// A virtual passkey's account (Chromium), its cookies for WebKit.
let cookies = null;
async function signedIn(engine) {
  const browser = await (engine === "webkit" ? webkit : chromium).launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, ...(engine === "chromium" ? { isMobile: true } : {}) });
  for (const [path, file] of SWAPS) {
    const body = readFileSync(file, "utf8");
    await context.route((url) => url.pathname === path, (route) => route.fulfill({ status: 200, contentType: path.endsWith(".css") ? "text/css" : "text/javascript", body }));
  }
  // The pictures' closed shadow roots, opened for this check only (it looks into them; the app never does).
  // The app's own swipe back, as the installed app has it (shell/main.js: a check turns it on).
  await context.addInitScript(() => {
    try {
      localStorage.setItem("check.swipe-back", "1");
    } catch {}
  });
  await context.addInitScript(() => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (init) {
      const root = attach.call(this, { ...init, mode: "open" });
      (window.__checkRoots ??= []).push(root);
      return root;
    };
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`${engine}: ${e.message}`));
  if (cookies) await context.addCookies(cookies);
  else {
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    await page.goto(`${BASE}/app/`);
    await page.waitForURL(/\/login\?next=/);
    await page.click("summary");
    await page.fill('input[name="name"]', "Outline Check");
    await page.click('#register button[type="submit"]');
    await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
    cookies = await context.cookies();
  }
  await page.goto(`${BASE}/app/#study`);
  await page.waitForSelector("html[data-app-ready]", { state: "attached", timeout: 60_000 });
  await page.waitForSelector('[data-part="page"] [data-door="lesson"] svg.lx-edge path.lx-edge-line', { state: "attached", timeout: 30_000 });
  await page.waitForTimeout(1200);
  return { browser, context, page, errors };
}

// Every painted frame for `ms`: each outline on the screen, on the page (unless held unseen) and on any picture of a page, and whether it has its line.
const watch = (page, ms) =>
  page.evaluate(
    (ms) =>
      new Promise((done) => {
        const t0 = performance.now();
        const frames = [];
        const onScreen = (node) => {
          const r = node.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
        };
        const look = () => setTimeout(painted, 0);
        const painted = () => {
          const outlines = [];
          for (const svg of document.querySelectorAll('[data-part="page"] svg.lx-edge')) {
            if (svg.closest("[data-motion-hidden], [data-waiting]") || !onScreen(svg)) continue;
            outlines.push({ where: "page", kind: svg.dataset.edge, line: Boolean(svg.querySelector("path.lx-edge-line")) });
          }
          for (const root of window.__checkRoots ?? []) {
            if (!root.host?.isConnected || !root.host.hasAttribute("data-page-picture")) continue;
            for (const svg of root.querySelectorAll("svg.lx-edge")) {
              if (!onScreen(svg)) continue;
              outlines.push({ where: "picture", kind: svg.dataset.edge, line: Boolean(svg.querySelector("path.lx-edge-line")) });
            }
          }
          frames.push({ t: Math.round(performance.now() - t0), hash: location.hash, outlines });
          if (performance.now() - t0 < ms) requestAnimationFrame(look);
          else done(frames);
        };
        requestAnimationFrame(look);
      }),
    ms,
  );

async function back(engine, how) {
  const { browser, context, page, errors } = await signedIn(engine);
  try {
    const touch = async (points) => {
      const cdp = engine === "chromium" ? await context.newCDPSession(page) : null;
      for (const [type, x, y] of points) {
        if (cdp) await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
        await page.waitForTimeout(type === "touchMove" ? 16 : 40);
      }
    };
    const tapOn = async (locator) => {
      const box = await locator.boundingBox();
      if (engine === "chromium") await touch([["touchStart", box.x + box.width / 2, box.y + box.height / 2], ["touchEnd"]]);
      else await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    };
    // Study → the path, by its Where you are strip; there, the first lesson finished (as finishing it would), so Study comes back with the
    // next lesson's ticket: a new door, drawn again as it comes back up to date.
    const doorWords = () => page.evaluate(() => document.querySelector('[data-part="page"] [data-door="lesson"]')?.textContent.replace(/\s+/g, " ").trim() ?? "");
    const before = await doorWords();
    // On its words (Where you are): Tinta stands at the learner's place along the strip, and a tap on him is his alone (a poke), so a tap at
    // the strip's middle could poke him and never open the path (7 Nov).
    await tapOn(page.locator('[data-part="page"] [data-part="path-strip"] .lx-path-strip-title').first());
    await page.waitForFunction(() => location.hash !== "#study", null, { timeout: 10_000 });
    await page.waitForTimeout(1500);
    // The lesson Study's door names (plan.js studyOverview, the same module the app runs), finished as a session finishes it: an answer for
    // each of its own words, then its mark (plan.js lessonDone takes a mark only once one of its words isn't new). Then held until the
    // overview names the next lesson, so the door Study draws on coming back is a new one every run.
    const door = await page.evaluate(async () => {
      const { finishedLesson } = await import("/js/study/done.js");
      const { studyOverview } = await import("/js/study/plan.js");
      const { pathLessons } = await import("/js/study/path.js");
      const { record } = await import("/js/study/progress.js");
      const before = studyOverview().lesson?.id ?? null;
      if (!before) return { before, after: null };
      const lesson = pathLessons().find((one) => one.id === before);
      const units = [...new Set((lesson?.things ?? []).filter((thing) => !thing.formOnly).map((thing) => thing.unit))];
      if (units.length) record(units.map((concept) => ({ concept, outcome: "right", test: "recall", skill: "read", activity: "type", item: "outline-check" })));
      finishedLesson(before);
      let after = studyOverview().lesson?.id ?? null;
      for (let waited = 0; after === before && waited < 10_000; waited += 100) {
        await new Promise((r) => setTimeout(r, 100));
        after = studyOverview().lesson?.id ?? null;
      }
      return { before, after };
    });
    if (!door.before || door.after === door.before) {
      report(false, `${engine}: ${how}: the next lesson`, `Study's overview still names ${door.before ?? "no lesson"} after it was finished: the stage wasn't reached`);
      return errors;
    }
    await page.waitForTimeout(800);
    const watching = watch(page, 1500);
    if (how === "header") await tapOn(page.locator(".lx-back").first());
    else if (engine === "chromium") {
      const moves = [["touchStart", 4, 420]];
      for (let x = 20; x <= 330; x += 30) moves.push(["touchMove", x, 420]);
      moves.push(["touchEnd"]);
      await touch(moves);
    } else {
      // WebKit has no touch events to send by CDP: its swipe isn't driven here (the header's Back is the case that failed).
      await page.evaluate(() => history.back());
    }
    const frames = await watching;
    await page.waitForTimeout(300);
    const after = await doorWords();
    const seen = frames.filter((f) => f.outlines.length);
    const bare = frames.filter((f) => f.outlines.some((o) => !o.line));
    const arrived = frames.at(-1)?.hash === "#study";
    writeFileSync(join(OUT, `${engine}-${how}.json`), JSON.stringify(frames, null, 1));
    report(
      arrived && seen.length > 0 && bare.length === 0 && after !== before,
      `${engine}: Study → the path → a lesson finished → ${how === "header" ? "the header's Back" : engine === "chromium" ? "the app's swipe back" : "back (history)"}: the next lesson's ticket, and every outline on the screen has its line, pictures of the page included`,
      `the door "${before.slice(0, 40)}" → "${after.slice(0, 40)}"; ${frames.length} frames, ${seen.length} with outlines${frames.some((f) => f.outlines.some((o) => o.where === "picture")) ? " (a picture among them)" : ""}, ${bare.length} with one bare${bare[0] ? `, the first at ${bare[0].t} ms: ${JSON.stringify(bare[0].outlines.filter((o) => !o.line))}` : ""}${arrived ? "" : `; ended at ${frames.at(-1)?.hash}`}`,
    );
    return errors;
  } finally {
    await browser.close();
  }
}

const errors = [];
for (const engine of ENGINES) for (const how of ["header", "swipe"]) errors.push(...(await back(engine, how)));
report(errors.length === 0, "no page errors", errors.slice(0, 3).join(" | "));
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
