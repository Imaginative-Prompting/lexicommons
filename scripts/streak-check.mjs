// The streak on Today, end to end in headless Chrome on a LOCAL server (it creates and deletes a test account, so
// never point it at the live site): a fresh account's "start a streak", six days of sessions (study/done.js) showing as
// six days with today open, a real quick session played to its summary making today count (and earning a rest day on
// the seventh), the week strip marking the same days, a missed day with no rest day left asking two things today to
// mend it (never a warning), a pause (Paused until …, its days marked), days from before the log counting,
// Settings → Streak (opened from Today's streak): pausing for a week, ending it, picked days, a backwards pause
// refused, and coming back after days away (Welcome back, with today's share of the pile); the session's summary
// celebrating (the seventh day's milestone with its sound, asked for through lx/sound.js while muted, and its share card shared or
// saved; Day 1 with Sound effects off; the session's end sound on a second session the same day), with Tinta above the
// number (hidden, no presses): a heart at the milestone, a hop on day 1, nothing on the second session.
// Screenshots of each in <outDir>/shots. Fails on any console error. Chrome runs muted: nothing is heard.
//
// Local server: see AGENTS.md (wrangler dev with --local-upstream and its own --persist-to).
// Usage (headless Chrome, so through the channel's GPU queue's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "streak check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/streak-check.mjs http://localhost:<port> <outDir>

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { pastReminderAsk, playToSummary } from "./fixtures/play-session.mjs";

const [BASE, outArg = "streak-check-out"] = process.argv.slice(2);
const OUT = resolve(outArg);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("streak-check creates and deletes an account: give it a local server, e.g. http://localhost:8824");
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
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
// The celebration's Tinta's reactions (ui.playCharacter → the part's play), counted as they're asked for. Only that
// one: the Tinta on each question reacts to every answer too (study/session.js).
await context.addInitScript(() => {
  window.lxTintaPlays = [];
  window.lxGreetPlays = []; // the first day back's hello: Tinta at Home's streak spot (lex-retention's wave)
  customElements.whenDefined("lx-tinta").then(() => {
    const part = customElements.get("lx-tinta").prototype;
    const play = part.play;
    part.play = function (name) {
      if (this.closest?.(".lx-moment-character")) window.lxTintaPlays.push(name);
      if (this.closest?.('[data-part="streak-spot"]')) window.lxGreetPlays.push(name);
      return play.call(this, name);
    };
  });
});
// The summary's sound (lx/sound.js), as the app asks for it: every "lx-sound" it tells, played or not (quiet-browser.mjs
// plays every one at zero volume).
await context.addInitScript(() => {
  window.lxSounds = [];
  addEventListener("lx-sound", (event) => window.lxSounds.push(event.detail));
});
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const SESSION = '[data-part="session"]:not([data-ghost])';
const settle = () => page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
const shot = async (name) => {
  await settle();
  await page.screenshot({ path: join(OUT, "shots", `${name}.png`) });
};
const shotOf = async (selector, name) => {
  await settle();
  await page.locator(selector).first().screenshot({ path: join(OUT, "shots", `${name}.png`) });
};
const DAY = 86_400_000;
// The streak and the week strip under it, scrolled to the middle of the screen, as one picture.
const shotStreak = async (name) => {
  await page.locator('[data-part="page"] [data-part="streak-summary"]').evaluate((n) => n.scrollIntoView({ block: "center" }));
  await settle();
  const box = await page.evaluate(() => {
    const a = document.querySelector('[data-part="page"] [data-part="streak-summary"]').getBoundingClientRect();
    const b = document.querySelector('[data-part="page"] [data-part="week-strip"]').getBoundingClientRect();
    return { x: 0, y: Math.max(0, Math.min(a.top, b.top) - 16), width: innerWidth, height: Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top) + 32 };
  });
  await page.screenshot({ path: join(OUT, "shots", `${name}.png`), clip: box });
};

// ---------- sessions, played by scripts/fixtures/play-session.mjs (each step by its kind, never its words) ----------

let CONTENT = null;
const content = () => page.evaluate(async () => {
  const c = await import("/js/study/content.js");
  return { items: c.ITEMS.map((i) => ({ ...i, sentence: c.sentence(i) })), words: c.WORDS };
});

// A quick session played to its summary (it stays there: Done is the caller's). Its sounds are counted from the session's
// start.
const toSummary = async () => {
  await page.goto(`${BASE}/app/#study/session/quick`);
  await page.waitForSelector(SESSION);
  await page.evaluate(() => (window.lxSounds = []));
  try {
    return await playToSummary(page, { session: SESSION });
  } catch (error) {
    await page.screenshot({ path: join(OUT, "shots", "no-summary.png") }).catch(() => {});
    throw new Error(`the session should end in a summary: ${error.message} (shots/no-summary.png)`);
  }
};
const summaryDone = async () => {
  await page.locator(`${SESSION} [data-part="answer-bar"] [data-part="button"]`, { hasText: "Done" }).click();
  await pastReminderAsk(page, { session: SESSION });
};
// The summary's moment as drawn (know/celebration-ui.js), or null when there's none: read once its animations have
// ended (motion.countUp runs on animation frames; motion.runningCount says when it's done), with the first value seen.
const momentDrawn = () =>
  page.evaluate(async (session) => {
    const m = document.querySelector(`${session} [data-part="celebration"]`);
    if (!m) return null;
    const text = (selector) => m.querySelector(selector)?.textContent ?? null;
    // Read once every animation has ended (motion.js runningCount: the roll and Tinta's reaction are both tracked), up
    // to 5 s. A number that holds isn't the end: the roll shows the old one for its first ~130 ms, later under load.
    const { runningCount } = await import("/js/lx/motion.js");
    const first = text(".lx-moment-count");
    for (let i = 0; i < 100 && runningCount() > 0; i++) await new Promise((done) => setTimeout(done, 50));
    const last = text(".lx-moment-count");
    // Tinta above the number: hidden from screen readers, and no presses (what's at its middle is never it).
    const tinta = m.querySelector('.lx-moment-character [data-part="character"]');
    let character = null;
    if (tinta) {
      tinta.scrollIntoView({ block: "center" });
      const box = tinta.getBoundingClientRect();
      const there = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      character = { size: tinta.getAttribute("data-size"), ariaHidden: tinta.getAttribute("aria-hidden"), shown: !tinta.closest("[hidden]") && box.height > 0, pressable: Boolean(there && (there === tinta || tinta.contains(there))) };
    }
    return { state: m.getAttribute("data-state"), count: last, rolledFrom: first, unit: text(".lx-moment-unit"), title: text(".lx-moment-title"), line: text(".lx-moment-line"), share: Boolean(m.querySelector('[data-part="button"]')), character, label: m.getAttribute("aria-label") };
  }, SESSION);
// Tinta's reactions since the last read: once one has come (or after 2 s when none should).
const tintaPlays = (want = true) =>
  page.evaluate(async (want) => {
    for (let i = 0; i < 40 && (want ? !window.lxTintaPlays.length : true); i++) await new Promise((done) => setTimeout(done, 50));
    return window.lxTintaPlays.splice(0);
  }, want);
const tintaOk = (m) => m.character?.shown && m.character.size === "72" && m.character.ariaHidden === "true" && !m.character.pressable;
// The summary's sounds that played: once `want` has (a celebration waits for a sentence still being said, up to 3 s), or
// after 3.5 s when none should. The games' own sounds (right, wrong, tiles, Match) are left out.
const SUMMARY_SOUNDS = new Set(["session-done", "day-counted", "unit-done"]);
const summarySounds = (want = null) =>
  page.evaluate(
    async ({ want, roles }) => {
      const played = () => window.lxSounds.filter((d) => d.played && roles.includes(d.role)).map((d) => d.role);
      for (let i = 0; i < 70 && (want ? !played().includes(want) : true); i++) await new Promise((done) => setTimeout(done, 50));
      return played();
    },
    { want, roles: [...SUMMARY_SOUNDS] },
  );
// A PNG's size, from its header.
const pngSize = (bytes) => ({ png: bytes.subarray(1, 4).toString() === "PNG", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });

// ---------- the run ----------

// Today's streak as drawn: { state, count, note, days: [week-day states], studiedCount }.
const todayStreak = () =>
  page.evaluate(() => {
    const s = document.querySelector('[data-part="page"] [data-part="streak-summary"]');
    const strip = document.querySelector('[data-part="page"] [data-part="week-strip"]');
    return {
      state: s?.getAttribute("data-state") ?? null,
      count: s?.querySelector('[data-part="streak"]')?.textContent ?? null,
      note: s?.querySelector(".lx-streak-note")?.textContent ?? null,
      // What a screen reader is told: the link's name, the whole streak's on Home (a[data-part="streak-spot"]), the summary's elsewhere.
      label: s?.closest("a")?.getAttribute("aria-label") ?? null,
      days: [...(strip?.querySelectorAll('[data-part="week-day"]') ?? [])].map((d) => (d.getAttribute("aria-current") === "date" ? "*" : "") + (d.getAttribute("data-state") ?? "-")),
      // The square Tinta's calm pose is about (know/today-pose.js), by the same days.
      poses: [...(strip?.querySelectorAll('[data-part="week-day"]') ?? [])].map((d) => d.getAttribute("data-tinta-pose") ?? "-"),
      count7: strip?.querySelector(".lx-week-count")?.textContent ?? null,
      oldNote: document.querySelector('[data-part="page"]')?.textContent.includes("no streak to lose") ?? false,
    };
  });
// Today's calm pose at the streak (know/today-pose.js) from the real streak, and yesterday's key.
const calmPose = async () => {
  const { todayPose } = await import("/js/know/today-pose.js");
  const { streakNow } = await import("/js/study/done.js");
  const { addDays, dayKey } = await import("/js/know/streak.js");
  return { ...todayPose(streakNow(), dayKey()), yesterday: addDays(dayKey(), -1) };
};
const toToday = async () => {
  await page.goto(`${BASE}/app/#today`);
  await page.waitForSelector('[data-part="page"] [data-part="streak-summary"]', { timeout: 10_000 });
};
// The log, written as a device would have: sessions finished on past days (days back from today, at noon).
const sessionsOn = (back) =>
  page.evaluate(async (back) => {
    const { finishedSession } = await import("/js/study/done.js");
    const { dayKey } = await import("/js/know/streak.js");
    const noon = new Date(`${dayKey()}T12:00:00`).getTime();
    for (const n of back) finishedSession(noon - n * 86_400_000);
  }, back);
// The log starts empty again: gone from storage, then the app started fresh (its copy in memory would write it back).
const clearLog = async () => {
  await page.evaluate(() => localStorage.removeItem("lx.streak.v1"));
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
};

await stage("sign up with a passkey, land in the app", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Streak Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  CONTENT = await content();
  return `signed in; ${CONTENT.items.length} starter items`;
});

await stage("a fresh account: Home says how to start a streak, and nothing warns", async () => {
  await toToday();
  const t = await todayStreak();
  assert(t.state === "none" && t.count === "0 days" && t.note === "Finish one thing to start a streak", JSON.stringify(t));
  assert(!t.oldNote, "the old note is still there");
  assert(t.days.length === 7 && !t.days.some((d) => d.includes("studied")), `week: ${t.days}`);
  await shotStreak("01-fresh");
  return t.note;
});

await stage("six days of sessions before today: six days, today open", async () => {
  await sessionsOn([1, 2, 3, 4, 5, 6]);
  await page.reload();
  await toToday();
  const t = await todayStreak();
  assert(t.state === "open" && t.count === "6 days" && t.note === "Today counts once you finish one thing", JSON.stringify(t));
  await shotStreak("02-six-days-open");
  return `${t.count}: ${t.note}; week ${t.days.join(" ")}`;
});

let played = [];
await stage("a real quick session played to its summary celebrates the seventh day: 7 days in a row, the gold stop's sound", async () => {
  played = await toSummary();
  const m = await momentDrawn();
  assert(m, "no moment on the summary");
  assert(m.state === "milestone" && m.count === "7" && m.unit === "days in a row" && m.title === null && m.line === "Every day counted." && m.share, JSON.stringify(m));
  assert(tintaOk(m), `Tinta above the number (72 px, hidden from screen readers, no presses): ${JSON.stringify(m.character)}`);
  const reacted = await tintaPlays();
  assert(reacted.join() === "heart", `Tinta at a milestone: ${reacted.join() || "nothing"} (a heart expected)`);
  assert(m.label === "7 days in a row. Every day counted.", `its label: ${m.label}`);
  assert(m.rolledFrom === "6", `the number rolls from yesterday's: first ${m.rolledFrom}`);
  const made = await summarySounds("unit-done");
  assert(made.join() === "unit-done", `the milestone's sound: ${made.join() || "none"} (unit-done expected, once)`);
  await page.locator(`${SESSION} [data-part="celebration"]`).scrollIntoViewIfNeeded();
  await shot("11-summary-seven-days");
  return `${played.length} steps; ${m.rolledFrom} → ${m.count} ${m.unit}, ${m.line}; Tinta: ${reacted.join()}; sound: ${made.join()}, muted`;
});

await stage("its share card: through the system's share sheet, or saved where there's none; 1080 × 1350; Tinta above the number, the words under it (centered when there's no Tinta)", async () => {
  const share = page.locator(`${SESSION} [data-part="celebration"] [data-part="button"]`, { hasText: "Share" });
  // A device with a share sheet: what it's handed, and where the card's ink is.
  await page.evaluate(() => {
    window.lxShared = null;
    // Inside the card's frame (its line is 46–50 px in from each edge): the rows with ink, the words' first and last,
    // and the first of lexicommons.com, the last unbroken run of rows (its l spans the whole line).
    window.lxInkOf = (bitmap, from = 52) => {
      const c = Object.assign(document.createElement("canvas"), { width: bitmap.width, height: bitmap.height });
      const g = c.getContext("2d");
      g.drawImage(bitmap, 0, 0);
      const { data } = g.getImageData(0, 0, c.width, c.height);
      const inked = (y) => {
        for (let x = 60; x < c.width - 60; x++) {
          const i = (y * c.width + x) * 4;
          if (Math.max(data[i], data[i + 1], data[i + 2]) > 70) return true;
        }
        return false;
      };
      const rows = [];
      for (let y = from; y < c.height - 52; y++) if (inked(y)) rows.push(y);
      let i = rows.length - 1;
      while (i > 0 && rows[i - 1] === rows[i] - 1) i--;
      const words = { top: rows[0], bottom: rows[i - 1] + 1 };
      return { words, footTop: rows[i], above: words.top - 50, below: rows[i] - words.bottom };
    };
    Object.defineProperty(navigator, "canShare", { configurable: true, value: (data) => Boolean(data?.files?.length) });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        const file = data.files[0];
        const bitmap = await createImageBitmap(file);
        // Tinta's middle (the box's, a little low: the drop's body, not its tip) and the ink under the box.
        const c = Object.assign(document.createElement("canvas"), { width: bitmap.width, height: bitmap.height });
        c.getContext("2d").drawImage(bitmap, 0, 0);
        const middle = [...c.getContext("2d").getImageData(540, 400, 1, 1).data.slice(0, 3)];
        window.lxShared = { count: data.files.length, name: file.name, type: file.type, width: bitmap.width, height: bitmap.height, text: data.text, middle, ink: window.lxInkOf(bitmap, 572) };
      },
    });
  });
  await share.click();
  await page.waitForFunction(() => window.lxShared, null, { timeout: 10_000 });
  const shared = await page.evaluate(() => window.lxShared);
  assert(shared.count === 1 && shared.name === "lexicommons-days-7.png" && shared.type === "image/png" && shared.width === 1080 && shared.height === 1350, JSON.stringify(shared));
  // Tinta above the number, in its own purple (the card's ink and canvas are greys), and the words under it.
  const [r, g, b] = shared.middle;
  assert(b > r + 60 && b > g + 60, `Tinta in the card's box: ${shared.middle} (its purple expected)`);
  assert(shared.ink.words.top > 610 && shared.ink.words.bottom < shared.ink.footTop, `the words under Tinta: ${JSON.stringify(shared.ink)}`);
  // None: it's saved.
  await page.evaluate(() => Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false }));
  const [download] = await Promise.all([page.waitForEvent("download", { timeout: 10_000 }), share.click()]);
  const path = join(OUT, "shots", "12-share-card-seven-days.png");
  await download.saveAs(path);
  const saved = pngSize(readFileSync(path));
  assert(download.suggestedFilename() === "lexicommons-days-7.png" && saved.png && saved.width === 1080 && saved.height === 1350, JSON.stringify({ name: download.suggestedFilename(), ...saved }));
  // When Tinta's still can't be had: no character, and the words centered between the frame and lexicommons.com (as
  // much room above as below), never low under an empty half.
  const without = await page.evaluate(async () => {
    const { drawShareCard } = await import("/js/know/share-card.js");
    const blob = await drawShareCard({ big: "7", title: "days in a row", line: "Learning Dutch on Lexicommons" });
    const url = await new Promise((done) => Object.assign(new FileReader(), { onload: (e) => done(e.target.result) }).readAsDataURL(blob));
    return { ink: window.lxInkOf(await createImageBitmap(blob)), url };
  });
  writeFileSync(join(OUT, "shots", "14-share-card-without-tinta.png"), Buffer.from(without.url.split(",")[1], "base64"));
  assert(Math.abs(without.ink.above - without.ink.below) <= 6, `with no Tinta the words aren't centered: ${without.ink.above} px above them, ${without.ink.below} below`);
  return `shared: ${shared.name} ${shared.width}×${shared.height}, Tinta (${shared.middle}) above the words (from ${shared.ink.words.top} px); saved: ${download.suggestedFilename()} ${saved.width}×${saved.height}; with no Tinta, the words centered (${without.ink.above} px above, ${without.ink.below} below)`;
});

await stage("Done: Today counts, seven days, a rest day earned", async () => {
  await summaryDone();
  await toToday();
  const t = await todayStreak();
  // One line on the screen; the rest day is said to a screen reader and on the page it opens.
  assert(t.state === "done" && t.count === "7 days" && t.note === "Today counts" && t.label.includes("1 rest day kept"), JSON.stringify(t));
  assert(t.days.some((d) => d === "*studied"), `today marked: ${t.days}`);
  await shotStreak("03-seven-days-done");
  return `${t.count}: ${t.note}; week ${t.days.join(" ")}`;
});

await stage("a missed day with a rest day kept: rested, the streak holds", async () => {
  await clearLog();
  // Seven days studied (a rest day earned), then yesterday missed, nothing yet today.
  await sessionsOn([2, 3, 4, 5, 6, 7, 8]);
  await page.reload();
  await toToday();
  const t = await todayStreak();
  assert(t.state === "open" && t.count === "7 days" && !/rest day/.test(t.note), JSON.stringify(t));
  // Yesterday is a rest day on the strip (when it's in this week: not on a Monday).
  const monday = await page.evaluate(async () => (await import("/js/know/summary.js")).week().days[0].today);
  assert(monday || t.days.at(t.days.findIndex((d) => d.startsWith("*")) - 1) === "rested", `yesterday: ${t.days}`);
  // Tinta's calm pose at the streak: the umbrella, about yesterday (know/today-pose.js on the real streak), whatever the
  // day of the week; its square ringed on the strip when yesterday is in this week (not on a Monday), no other square.
  const calm = await page.evaluate(calmPose);
  assert(calm.pose === "rest" && calm.day === calm.yesterday, `Today's calm pose: ${JSON.stringify(calm)}`);
  const yesterday = t.days.findIndex((d) => d.startsWith("*")) - 1;
  assert(monday || (t.poses[yesterday] === "rest" && t.poses.filter((p) => p !== "-").length === 1), `the rest day's mark: ${t.poses}`);
  await shotStreak("03b-rested");
  return `${t.count}: ${t.note}; week ${t.days.join(" ")}`;
});

await stage("a missed day with no rest day left: two finished things today mend it, one more after the first", async () => {
  await clearLog();
  await sessionsOn([2, 3, 4]);
  await page.reload();
  await toToday();
  let t = await todayStreak();
  assert(t.state === "mend" && t.count === "3 days" && t.note === "Yesterday mends with two finished things today", JSON.stringify(t));
  assert(!/lose|lost|last chance|break/i.test(t.note), "a warning");
  await shotStreak("04-mend-two");
  await sessionsOn([0]);
  await page.reload();
  await toToday();
  t = await todayStreak();
  assert(t.state === "mend" && t.note === "Yesterday mends with one more finished thing today", JSON.stringify(t));
  await sessionsOn([0]);
  await page.reload();
  await toToday();
  t = await todayStreak();
  assert(t.state === "done" && t.count === "4 days", JSON.stringify(t));
  // Mended: Tinta's patch, about yesterday, whatever the day; its square ringed when it's in this week.
  const calm = await page.evaluate(calmPose);
  assert(calm.pose === "mended" && calm.day === calm.yesterday, `Today's calm pose: ${JSON.stringify(calm)}`);
  const mondayNow = await page.evaluate(async () => (await import("/js/know/summary.js")).week().days[0].today);
  assert(mondayNow || t.poses[t.days.findIndex((d) => d.startsWith("*")) - 1] === "mended", `the mended day's mark: ${t.poses}`);
  return "two needed, then one, then mended: 4 days, its square ringed";
});

await stage("a pause: Paused until its last day, its days marked, the streak held", async () => {
  await clearLog();
  await sessionsOn([1, 2, 3, 4, 5]);
  const until = await page.evaluate(async () => {
    const { addPause } = await import("/js/study/done.js");
    const { dayKey, addDays } = await import("/js/know/streak.js");
    const today = dayKey();
    addPause(today, addDays(today, 6));
    return new Date(`${addDays(today, 6)}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
  });
  await page.reload();
  await toToday();
  const t = await todayStreak();
  assert(t.state === "paused" && t.count === "5 days" && t.note === `Paused until ${until}`, JSON.stringify(t));
  assert(t.days.includes("*paused"), `today marked paused: ${t.days}`);
  await shotStreak("05-paused");
  return `${t.count}: ${t.note}`;
});

await stage("days from before the log count, from the evidence", async () => {
  await clearLog();
  await page.evaluate(async () => {
    localStorage.setItem("lx.streak.since", String(Date.now()));
    const { record } = await import("/js/study/progress.js");
    const { dayKey } = await import("/js/know/streak.js");
    const noon = new Date(`${dayKey()}T12:00:00`).getTime();
    for (const n of [1, 2, 3]) record([{ concept: "w:huis", at: noon - n * 86_400_000, outcome: "right", test: "recall", skill: "read", activity: "type", item: "t" }]);
  });
  await page.reload();
  await toToday();
  const t = await todayStreak();
  assert(t.state === "open" && /^[34] days$/.test(t.count), JSON.stringify(t));
  return `${t.count} from the evidence`;
});

await stage("Today's streak opens Settings → Streak, whose Back goes to Today; Settings → Study has no row for it (Home's streak is its way in)", async () => {
  await clearLog();
  await sessionsOn([1, 2, 3]);
  await page.reload();
  await toToday();
  // All of Home's streak is the link now (the number, the flame and the week row): press its number.
  await page.locator('[data-part="page"] a[data-part="streak-spot"] [data-part="streak"] strong').click();
  await page.waitForFunction(() => location.hash.startsWith("#settings/streak") && document.querySelector('[data-part="page"] [data-part="page-title"]')?.textContent === "Streak");
  const back = await page.locator('[data-part="app-back"]').getAttribute("href");
  assert(back === "#today", `back: ${back}`);
  await shot("07-settings-streak");
  // How it counts is a row and a sheet: every rule still said, and it closes.
  await page.locator('[data-part="page"] [data-part="list-row"]', { hasText: "How your streak counts" }).click();
  await page.waitForSelector(".lx-sheet-layer .lx-sheet-title");
  const words = await page.locator(".lx-sheet-layer").textContent();
  assert(words.includes("How your streak counts") && words.includes("earn a rest day") && words.includes("4 am"), "how it counts");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".lx-sheet-layer"));
  await page.locator('[data-part="app-back"]').click();
  await page.waitForFunction(() => location.hash === "#today");
  await page.goto(`${BASE}/app/#settings/study`);
  // The 6 Nov audit took Streak's row out of Settings → Study: the page opens from Home's streak alone.
  await page.waitForSelector('[data-part="page"] [data-part="list-row"]');
  const rows = await page.locator('[data-part="page"] [data-part="list-row"]').count();
  const row = await page.locator('[data-part="list-row"][href="#settings/streak"]').count();
  assert(rows > 0 && row === 0, `Settings → Study: ${rows} rows, ${row} for the streak`);
  return `back to ${back}; Settings → Study's ${rows} rows, none the streak's`;
});

const openPause = async () => {
  await page.locator('[data-part="page"] [data-part="list-row"]', { hasText: "Pause your streak" }).click();
  await page.waitForSelector('.lx-sheet-layer [data-part="list-row"]');
};
await stage("pausing from Settings → Streak: For a week, then End it; picked days, then Remove", async () => {
  await page.goto(`${BASE}/app/#settings/streak`);
  await page.waitForFunction(() => document.querySelector('[data-part="page"] [data-part="page-title"]')?.textContent === "Streak");
  await openPause();
  await page.locator('.lx-sheet-layer [data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: /^For a week$/ }) }).click();
  await page.waitForFunction(() => document.querySelector('[data-part="page"]')?.textContent.includes("Paused until"));
  let s = await page.evaluate(async () => {
    const { streakNow, pauses } = await import("/js/study/done.js");
    return { state: streakNow().state, pauses: pauses() };
  });
  assert(s.state === "paused" && s.pauses.length === 1, JSON.stringify(s));
  await shot("08-settings-paused");
  await toToday();
  let t = await todayStreak();
  assert(t.state === "paused" && t.count === "3 days" && /^Paused until /.test(t.note), JSON.stringify(t));
  await page.goto(`${BASE}/app/#settings/streak`);
  await page.getByRole("button", { name: "End it" }).click();
  await page.waitForFunction(() => document.querySelector('[data-part="page"] [role="status"]')?.textContent.includes("Pause ended"));
  s = await page.evaluate(async () => (await import("/js/study/done.js")).streakNow().state);
  assert(s === "open", `after ending: ${s}`);
  // Picked days, starting tomorrow: the form's fields at 16px (an iPhone zooms in on smaller), then Remove.
  await openPause();
  await page.locator('.lx-sheet-layer [data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: /^Pick the days$/ }) }).click();
  const from = page.locator('input[aria-label="First day of the pause"]');
  const sizes = await page.locator('.lx-pause-dates input').evaluateAll((inputs) => inputs.map((i) => getComputedStyle(i).fontSize));
  assert(sizes.length === 2 && sizes.every((f) => parseFloat(f) >= 16), `field sizes: ${sizes}`);
  const days = await page.evaluate(async () => {
    const { dayKey, addDays } = await import("/js/know/streak.js");
    return [addDays(dayKey(), 1), addDays(dayKey(), 3)];
  });
  await from.fill(days[0]);
  await page.locator('input[aria-label="Last day of the pause"]').fill(days[1]);
  await shot("09-settings-pick-days");
  await page.getByRole("button", { name: "Pause these days" }).click();
  await page.waitForFunction(() => document.querySelector('[data-part="page"]')?.textContent.includes("Pause from"));
  s = await page.evaluate(async () => (await import("/js/study/done.js")).pauses());
  assert(s.length === 1 && s[0].from === days[0] && s[0].to === days[1], JSON.stringify(s));
  await page.getByRole("button", { name: "Remove" }).click();
  await page.waitForFunction(() => document.querySelector('[data-part="page"] [role="status"]')?.textContent.includes("Pause removed"));
  s = await page.evaluate(async () => (await import("/js/study/done.js")).pauses());
  assert(s.length === 0, JSON.stringify(s));
  // A pause that ends before it starts is refused, in words.
  await openPause();
  await page.locator('.lx-sheet-layer [data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: /^Pick the days$/ }) }).click();
  await from.fill(days[1]);
  await page.locator('input[aria-label="Last day of the pause"]').fill(days[0]);
  await page.getByRole("button", { name: "Pause these days" }).click();
  await page.waitForFunction(() => /a later one/.test(document.querySelector('.lx-sheet-layer [role="status"]')?.textContent ?? ""));
  return "a week paused and ended; picked days paused and removed; a backwards pause refused";
});

await stage("back after days away: Home says Welcome back, with today's share of the pile, never the days missed", async () => {
  await clearLog();
  // Ten sentences typed twelve days ago, nothing since (the earlier stages' studying cleared): most of it is due now.
  await page.evaluate(async () => {
    const { clearProgress, record } = await import("/js/study/progress.js");
    await clearProgress();
    const { ITEMS, conceptsOf } = await import("/js/study/content.js");
    const at = Date.now() - 12 * 86_400_000;
    for (const item of ITEMS.slice(0, 10)) record(conceptsOf(item).map((concept) => ({ concept, at, outcome: "right", test: "recall", skill: "say", activity: "type", item: item.id })));
  });
  await page.reload();
  await toToday();
  const o = await page.evaluate(async () => {
    const { overview } = await import("/js/study/plan.js");
    const v = overview();
    return { due: v.due, all: v.dueAll, comeback: v.comeback };
  });
  assert(o.comeback && o.comeback.days === 7 && o.due === Math.ceil(o.all / 7), JSON.stringify(o));
  const card = page.locator('[data-part="page"] [data-part="next-step"]');
  const text = await card.textContent();
  assert(text.includes("Welcome back") && text.includes("What you know, mixed"), text);
  assert(!/missed|days away|\b12\b|lost/i.test(text), `counts what was missed: ${text}`);
  // Home's one Tinta, at the streak spot, waves once as it comes into view (lex-retention's wave); the card has none; nothing about the gap.
  await page.locator('[data-part="page"] [data-part="streak-spot"]').scrollIntoViewIfNeeded();
  const greet = await page.evaluate(async () => {
    const t = document.querySelector('[data-part="page"] [data-part="streak-spot"] [data-part="character"]');
    for (let i = 0; i < 60 && !window.lxGreetPlays.length; i++) await new Promise((done) => setTimeout(done, 50));
    await new Promise((done) => setTimeout(done, 400));
    const onCard = document.querySelector('[data-part="page"] [data-part="next-step"] [data-part="character"]');
    return t ? { size: t.getAttribute("data-size"), hidden: t.getAttribute("aria-hidden"), plays: [...window.lxGreetPlays], onCard: Boolean(onCard) } : null;
  });
  assert(greet?.size === "64" && greet.hidden === "true" && greet.plays.join() === "wave" && !greet.onCard, `the first day back's hello: ${JSON.stringify(greet)}`);
  // Once that day: back on Home, no second wave.
  await page.evaluate(() => (window.lxGreetPlays.length = 0, (location.hash = "#study")));
  await page.waitForTimeout(800);
  await page.evaluate(() => (location.hash = "#today"));
  await page.waitForTimeout(1500);
  const again = await page.evaluate(() => [...window.lxGreetPlays]);
  assert(!again.length, `waved again the same day: ${again.join()}`);
  await page.locator('[data-part="page"] [data-part="next-step"]').scrollIntoViewIfNeeded();
  await shot("10-welcome-back");
  return text.replace(/\s+/g, " ").slice(0, 140);
});

await stage("Settings → Sound and speech: Sound effects, off; a first day's session says Day 1, without a sound", async () => {
  await clearLog();
  await page.goto(`${BASE}/app/#settings/voice`);
  const row = page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: /^Sound effects$/ }) });
  const toggle = row.locator('[data-part="switch"]');
  assert(await toggle.isChecked(), "the sound should be on by default");
  await row.click();
  assert(!(await toggle.isChecked()), "the switch didn't turn off");
  const saved = await page.evaluate(async () => (await import("/js/study/settings.js")).getStudySettings().sound);
  assert(saved?.effects === false && saved.at > 0, `the setting: ${JSON.stringify(saved)}`);
  await toSummary();
  const m = await momentDrawn();
  assert(m && m.state === "day" && m.count === "1" && m.unit === "day" && m.title === null && m.line === "Today counts." && !m.share && m.label === "Day 1. Today counts.", JSON.stringify(m));
  assert(tintaOk(m), `Tinta above the number: ${JSON.stringify(m.character)}`);
  const reacted = await tintaPlays();
  assert(reacted.join() === "right", `Tinta on day 1: ${reacted.join() || "nothing"} (right expected)`);
  const made = await summarySounds();
  const asked = await page.evaluate(() => window.lxSounds.filter((d) => ["session-done", "day-counted", "unit-done"].includes(d.role)).map((d) => `${d.role}:${d.played ? "played" : d.why}`));
  assert(made.length === 0, `the summary's sound with Sound effects off: ${made.join()}`);
  assert(asked.join() === "day-counted:off", `what the summary asked for: ${asked.join() || "nothing"} (day-counted, off)`);
  await page.locator(`${SESSION} [data-part="celebration"]`).scrollIntoViewIfNeeded();
  await shot("13-summary-day-one");
  await summaryDone();
  return `${m.count} ${m.unit}, ${m.line}; Tinta: ${reacted.join()}; asked for day-counted, nothing played`;
});

await stage("a second session the same day: nothing new to celebrate, so no moment, and the session's end sounds (the sound on again)", async () => {
  await page.goto(`${BASE}/app/#settings/voice`);
  const row = page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: /^Sound effects$/ }) });
  await row.click();
  assert(await row.locator('[data-part="switch"]').isChecked(), "the switch didn't turn back on");
  await toSummary();
  const m = await momentDrawn();
  assert(m === null, `a moment on a second session: ${JSON.stringify(m)}`);
  const reacted = await tintaPlays(false);
  assert(reacted.length === 0, `Tinta reacted with nothing to celebrate: ${reacted.join()}`);
  // The kit may leave the session's end silent on purpose (no files): then it's asked for and told as "none".
  const silent = await page.evaluate(async () => !(await import("/js/lx/sound-kit.js")).ROLES["session-done"].files.length);
  const made = await summarySounds(silent ? null : "session-done");
  const asked = await page.evaluate(() => window.lxSounds.filter((d) => d.role === "session-done").map((d) => (d.played ? "played" : d.why)));
  if (silent) assert(made.length === 0 && asked.join() === "none", `the session's end, silent in this kit: played ${made.join() || "nothing"}, told ${asked.join() || "nothing"} ("none" expected)`);
  else assert(made.join() === "session-done", `the summary's sound with nothing to celebrate: ${made.join() || "none"} (session-done expected, once)`);
  await summaryDone();
  return `no moment; session-done ${silent ? "asked for, silent in this kit" : "played"}`;
});

await stage("the whole of Today with the streak, as a phone shows it", async () => {
  await clearLog();
  await sessionsOn([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  await page.reload();
  await toToday();
  await page.locator('[data-part="page"] [data-part="streak-summary"]').scrollIntoViewIfNeeded();
  await shot("06-today-phone");
  return (await todayStreak()).note;
});

let problemsBeforeDelete = 0;
await stage("delete the account", async () => {
  problemsBeforeDelete = problems.length;
  await page.goto(`${BASE}/app/#settings/account`);
  const row = (text) => page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${text}$`) }) }).first();
  await row("Delete my account").click();
  await row("Press again to delete it for good").click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  const left = await page.evaluate(() => localStorage.getItem("lx.streak.v1"));
  assert(left === null, "the streak's log is still on the device");
  return "deleted, with the log";
});

await stage("no console errors", async () => {
  const after = problems.slice(problemsBeforeDelete).filter((p) => !/status of 401/.test(p));
  const real = [...problems.slice(0, problemsBeforeDelete), ...after];
  assert(real.length === 0, real.join(" | "));
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "streak-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
