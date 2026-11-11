// Home after a pack change, on a phone slowed 4×: neither the plan Home draws from (study/plan.js, path.js, new-words.js), sync.js's count of every
// record after a change, Home drawing everything at once on its return (today.js drawAll), nor Your progress (what you know worked out again a
// minute on: summary.js) is what makes a task long, and its card is never blank.
// A learner months in (the sample learner's months preset, recorded as this account's own evidence) and on its first day back after four away
// (Welcome back, and Tinta's wave asking which day back it is), on Study; a word band switched off there
// (packs.js setPackOn, as its switch does; that change's own task is content.js's and is reported, not held to it), then Home tapped: just
// after, and again once the plan's shared view has lapsed (a minute on), so its return works out the view as well. Every long task from the
// change's own task's end until 3 s after the tap is found (PerformanceObserver "longtask": 50 ms and more) and read against Chrome's CPU profile
// of the same time: the plan's, sync's, Home's whole redraw's and Your progress's work in each (the samples with a frame of theirs) under 10 ms, and what else made it long reported by its
// biggest function (sync, Tinta, the shell's are other owners'). Every frame of the return has Home's card with its words. A planted 150 ms task
// is caught first. LOCAL only (it signs up an account), path-nl and the word bands seeded.
//   node scripts/home-recompute-check.mjs http://localhost:<port> <outDir> [--only <regex>]   (exit 0 = pass)
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const [BASE, outArg] = process.argv.slice(2);
const PROFILE = process.argv.includes("--profile");
const ONLY = process.argv.includes("--only") ? new RegExp(process.argv[process.argv.indexOf("--only") + 1], "i") : null;
if (!BASE || !outArg || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("usage: home-recompute-check.mjs http://localhost:<port> <outDir> [--only <regex>] (LOCAL only: it signs up an account)");
  process.exit(2);
}
const OUT = resolve(outArg);
mkdirSync(OUT, { recursive: true });
setTimeout(() => (console.log("FAIL  timed out"), process.exit(3)), 12 * 60_000).unref();

let failed = 0;
let passed = 0;
const results = [];
let first = true;
async function stage(name, fn) {
  const setup = first;
  first = false;
  if (ONLY && !setup && !ONLY.test(name)) return;
  try {
    const note = await fn();
    passed++;
    console.log(`PASS ${name}${note ? `: ${note}` : ""}`);
    results.push({ name, ok: true, note });
  } catch (error) {
    failed++;
    console.log(`FAIL ${name}: ${error.message}`);
    results.push({ name, ok: false, error: error.message });
  }
}
const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: "block", hasTouch: true, isMobile: true, colorScheme: "dark" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
const slow = (rate) => cdp.send("Emulation.setCPUThrottlingRate", { rate });
const tab = (name) => page.locator('[data-part="tab-bar"] [data-part="tab"]', { hasText: name }).first();
const onTab = (name) => page.waitForFunction((n) => document.querySelector('[data-part="app-title"]')?.textContent.includes(n), name, { timeout: 30_000 });

// Every long task from here on, and every frame's look at Home's card (while Home is the page: its card there, with words).
const watch = () =>
  page.evaluate(() => {
    const w = (globalThis.__homeWatch = { long: [], frames: 0, blank: [], stop: false });
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.long.push({ at: Math.round(e.startTime), ms: Math.round(e.duration) });
    }).observe({ type: "longtask" });
    const frame = () => {
      if (w.stop) return;
      if (document.querySelector('[data-part="app-title"]')?.textContent.includes("Home")) {
        w.frames++;
        const card = document.querySelector('[data-part="page"] .lx-today-next');
        const words = card?.querySelector("h2, h3, [data-part='next-step'], .lx-next-title")?.textContent.trim() || card?.textContent.trim() || "";
        if (!card || !card.getClientRects().length || !words) w.blank.push(Math.round(performance.now()));
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
const watched = () => page.evaluate(() => ((globalThis.__homeWatch.stop = true), globalThis.__homeWatch));
// Chrome's CPU profile started, and the page's clock marked in it: a function of a known name runs a few ms at a known page time, so a moment
// on the page's clock (a long task's start) is found in the profile by where that function's first sample is. (A profile's own start isn't
// when it begins sampling: the first time on a slowed page, its first sample came 836 ms after it.)
async function startProfile() {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 250 });
  await cdp.send("Profiler.start");
  // A sample or two first, so the mark lands in a profile that's sampling.
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const at = performance.now();
    (function profileClockMark() {
      const until = performance.now() + 12;
      while (performance.now() < until);
    })();
    return at;
  });
}
// The profile stopped, with a second mark just before it: by then it's surely sampling (the first mark can come before it begins).
async function stopProfile() {
  const endAt = await page.evaluate(() => {
    const at = performance.now();
    (function profileClockMarkEnd() {
      const until = performance.now() + 12;
      while (performance.now() < until);
    })();
    return at;
  });
  const { profile } = await cdp.send("Profiler.stop");
  return { profile, endAt };
}
// The page's time of a profile's moment t is t + the returned offset: from a clock mark's first sample (the last mark's, else the first's).
function profileOffset(profile, markAt, endAt) {
  try {
    return markOffset(profile, "profileClockMarkEnd", endAt);
  } catch {
    return markOffset(profile, "profileClockMark", markAt);
  }
}
function markOffset(profile, name, markAt) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  let t = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    t += profile.timeDeltas[i] / 1000;
    for (let id = profile.samples[i]; id !== undefined; id = parent.get(id)) if (nodes.get(id).callFrame.functionName === name) return markAt - t;
  }
  throw new Error(`the clock mark ${name} isn't in the profile`);
}

// In a CPU profile, from `from` ms after it began for `ms`: how long the plan's files were on the stack (study/plan.js, path.js, new-words.js),
// and the function that was on it longest apart from the profiler's own idle, program and the page's root (what the task mostly was).
function whatRan(profile, from, ms) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  // Whose work a sample is, by a frame on its stack: the plan's files; sync.js (its count of every record after a change); Home drawing
  // everything at once (today.js drawAll); Your progress (today.js's progressOf, drawProgress and progressNode, and what you know: summary.js).
  const SHARES = {
    plan: (frame) => /\/js\/study\/(plan|path|new-words)\.js/.test(frame.url),
    sync: (frame) => /\/js\/sync\.js/.test(frame.url),
    redraw: (frame) => frame.functionName === "drawAll" && /\/js\/know\/today\.js/.test(frame.url),
    progress: (frame) => (/^(progressOf|drawProgress|progressNode)$/.test(frame.functionName) && /\/js\/know\/today\.js/.test(frame.url)) || /\/js\/know\/summary\.js/.test(frame.url),
  };
  const SKIP = new Set(["(root)", "(program)", "(idle)", "(garbage collector)"]);
  const named = (node) => `${node.callFrame.functionName || "(anon)"} ${node.callFrame.url.split("/").pop().split("?")[0]}:${node.callFrame.lineNumber + 1}`;
  let t = 0;
  const shares = Object.fromEntries(Object.keys(SHARES).map((name) => [name, 0]));
  const totals = new Map();
  profile.samples.forEach((sample, i) => {
    const dt = profile.timeDeltas[i] / 1000;
    t += dt;
    if (t < from || t >= from + ms) return;
    const whose = new Set();
    const seen = new Set();
    for (let id = sample; id !== undefined; id = parent.get(id)) {
      const node = nodes.get(id);
      for (const [name, is] of Object.entries(SHARES)) if (is(node.callFrame)) whose.add(name);
      const name = named(node);
      if (SKIP.has(node.callFrame.functionName) || seen.has(name)) continue;
      seen.add(name);
      totals.set(name, (totals.get(name) ?? 0) + dt);
    }
    for (const name of whose) shares[name] += dt;
  });
  // The deepest function that held most of it: of those on the stack the longest, the last called.
  const top = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, time]) => `${name} ${Math.round(time)}`).join(", ");
  return { plan: Math.round(shares.plan), sync: Math.round(shares.sync), redraw: Math.round(shares.redraw), progress: Math.round(shares.progress), top: top || "nothing sampled" };
}
const cardText = () => page.evaluate(() => document.querySelector('[data-part="page"] .lx-today-next')?.textContent.trim().replace(/\s+/g, " ").slice(0, 80) ?? null);

await stage("a learner months in: a new account, the sample learner's months as its own evidence, then a start into Home", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Home recompute check");
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(async () => (await import("/js/study/packs.js")).syncLibraryPacks());
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const made = await page.evaluate(async () => {
    const { pathLessons } = await import("/js/study/path.js");
    for (let i = 0; i < 300 && !pathLessons().length; i++) await new Promise((done) => setTimeout(done, 100));
    const S = await import("/js/study/sample-learner.js");
    const content = await import("/js/study/content.js");
    const { targetOf } = await import("/js/study/new-words.js");
    const { record } = await import("/js/study/progress.js");
    const course = S.courseOf({ lang: "nl", lessons: pathLessons(), items: content.ITEMS, sentenceUnits: content.sentenceUnits, conceptsOf: content.conceptsOf, targetOf });
    // Its months ending four days ago (plan.js AWAY_DAYS is 3), so today is the first day of coming back, whatever day and hour the check runs:
    // Home's card is Welcome back, and Tinta's wave asks which day back it is. That's the return that reads the most of the plan (a learner
    // who studied yesterday reads a part of it), and a learner left to the calendar was coming back on some runs and not on others (7 Nov).
    const L = S.sampleLearner("months", course, { now: Date.now() - 4 * 86_400_000 });
    for (let i = 0; i < L.evidence.length; i += 5000) {
      record(L.evidence.slice(i, i + 5000).map(({ uid: _uid, ...row }) => row));
      await new Promise((done) => setTimeout(done, 0));
    }
    return { rows: L.evidence.length, sentences: content.ITEMS.length, lessons: pathLessons().length };
  });
  assert(made.rows > 1000, `the learner: ${JSON.stringify(made)}`);
  // Saved, then a start, as a learner coming back to the app has it. Every row in the device's store first (progress.js saves in the
  // background): a fixed 3 s once reloaded with the last weeks' rows unsaved, and that learner was "40 days away" (7 Nov).
  const stored = await page.evaluate(async (want) => {
    const count = () =>
      new Promise((done) => {
        const open = indexedDB.open("lexicommons-study");
        open.onerror = () => done(-1);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("evidence")) return db.close(), done(0);
          const request = db.transaction("evidence").objectStore("evidence").count();
          request.onsuccess = () => (db.close(), done(request.result));
          request.onerror = () => (db.close(), done(-1));
        };
      });
    let n = 0;
    for (let i = 0; i < 240 && (n = await count()) < want; i++) await new Promise((done) => setTimeout(done, 250));
    return n;
  }, made.rows);
  assert(stored >= made.rows, `only ${stored} of the learner's ${made.rows} rows saved after a minute`);
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  await page.evaluate(() => (location.hash = "#today"));
  await onTab("Home");
  await page.waitForTimeout(4000);
  const text = await cardText();
  assert(text, "Home has no card");
  const back = await page.evaluate(async () => (await import("/js/study/plan.js")).comebackNow());
  assert(back?.day === 0, `the learner isn't on its first day back: ${JSON.stringify(back)}`);
  return `${made.rows.toLocaleString()} answers, ${made.sentences.toLocaleString()} sentences, ${made.lessons.toLocaleString()} lessons; coming back (${back.away} days away, today's share ${back.share}); Home: "${text}"`;
});

await stage("PLANT: a 150 ms task on the page, slowed 4×, is caught as a long task, and the profile lined up with it names the function it was", async () => {
  await watch();
  await slow(4);
  const markAt = await startProfile();
  // A task of the page's own (a timer's): what the check evaluates through the debugger isn't one the page counts.
  await page.evaluate(() =>
    setTimeout(function plantedLongTask() {
      const until = performance.now() + 150;
      while (performance.now() < until);
    }, 0),
  );
  await page.waitForTimeout(500);
  const { profile, endAt } = await stopProfile();
  await slow(1);
  const w = await watched();
  // (Starting the profiler on a slowed page can be a long task of its own: the planted one comes after it.)
  const task = w.long.find((one) => one.at >= markAt && one.ms >= 150);
  assert(task, `not caught after the mark: ${JSON.stringify(w.long)}`);
  const ran = whatRan(profile, task.at - profileOffset(profile, markAt, endAt), task.ms);
  const planted = Number(/plantedLongTask \S+ (\d+)/.exec(ran.top)?.[1] ?? 0);
  const span = profile.timeDeltas.reduce((sum, d) => sum + d, 0) / 1000;
  assert(planted >= 100, `the profile, lined up with the task, doesn't see it: ${ran.top} (a profile of ${Math.round(span)} ms, ${profile.samples.length} samples)`);
  return `${task.ms} ms, ${planted} ms of it plantedLongTask in the profile`;
});

for (const [when, waitMs] of [["just after", 4000], ["a minute on (the shared view lapsed)", 62_000]]) {
  await stage(`a word band switched off on Study, then Home tapped ${when}: no task of 50 ms or more after the change's own, the card there in every frame`, async () => {
    await tab("Study").click();
    await onTab("Study");
    await page.waitForTimeout(1500);
    const before = await page.evaluate(async () => (await import("/js/study/packs.js")).isPackOn("words-nl-07"));
    await watch();
    await slow(4);
    // Chrome's CPU profile from here, its clock lined up with the page's (startProfile).
    const markAt = await startProfile();
    // The switch: its own task (content.js taking the packs again) is the pack change's, so it's measured apart.
    const change = await page.evaluate(async (on) => {
      const { setPackOn } = await import("/js/study/packs.js");
      const at = performance.now();
      setPackOn("words-nl-07", on);
      return { at: Math.round(at), done: Math.round(performance.now()) };
    }, !before);
    await page.waitForTimeout(waitMs);
    const tapAt = await page.evaluate(() => performance.now());
    await tab("Home").click();
    await onTab("Home");
    await page.waitForTimeout(3000);
    const { profile, endAt } = await stopProfile();
    if (PROFILE) writeFileSync(join(OUT, `${when.split(" ")[0]}.cpuprofile`), JSON.stringify(profile));
    await slow(1);
    const w = await watched();
    // (Long tasks before the switch are the profiler starting on a slowed page: neither the switch's nor Home's.)
    const ownTask = w.long.filter((task) => task.at >= change.at - 5 && task.at < change.done).map((task) => task.ms);
    const offset = profileOffset(profile, markAt, endAt);
    const after = w.long.filter((task) => task.at >= change.done).map((task) => ({ ...task, from: task.at - Math.round(tapAt), ...whatRan(profile, task.at - offset, task.ms) }));
    const text = await cardText();
    writeFileSync(join(OUT, `${when.split(" ")[0]}.json`), JSON.stringify({ change, tapAt, offset, ...w, after }, null, 1));
    const said = (task) => `${task.ms} ms at ${task.from} ms from the tap (the plan ${task.plan} ms, sync ${task.sync}, Home's whole redraw ${task.redraw}, Your progress ${task.progress}; mostly ${task.top})`;
    // None of them the plan's, sync's count's, Home's whole redraw's or Your progress's: each under 10 ms of any long task.
    for (const [part, name] of [["plan", "the plan's work"], ["sync", "sync.js (its count after a change)"], ["redraw", "Home's whole redraw (today.js drawAll)"], ["progress", "Your progress (today.js progressOf, summary.js)"]]) {
      const long = after.filter((task) => task[part] >= 10);
      assert(!long.length, `${name} in a long task: ${long.map(said).join("; ")}`);
    }
    assert(w.frames > 30 && !w.blank.length, `Home's card blank in ${w.blank.length} of ${w.frames} frames`);
    assert(text, "no card at the end");
    return `the change's own task ${ownTask.join(", ") || "under 50"} ms; after it ${after.length ? `long tasks none of those: ${after.map(said).join("; ")}` : "no long task"}; ${w.frames} frames of Home, the card in each: "${text}"`;
  });
}

await stage("no page errors", async () => {
  assert(!errors.length, errors.slice(0, 3).join(" | "));
});

await page.evaluate(async () => { await fetch("/account/delete", { method: "POST" }).catch(() => {}); }).catch(() => {});
await context.close();
await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 1));
console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
