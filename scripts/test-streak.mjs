// The streak, case by case (know/streak.js): days starting at 4 am, rest days earned and used, a missed day mended by
// two finished things, pauses, days from before the log, and the records it syncs; then the log on this device
// (study/done.js): a finished session, 5 minutes of reading, a conversation with your AI, pauses, another device's
// records, and Today's week strip reading the same days. Pure, so it runs in Node: `node scripts/test-streak.mjs`
// (exit 0 = pass). It runs in New York's time zone, which leaves summer time on 1 Nov 2026.

process.env.TZ = "America/New_York";

const { addDays, checkRecord, dayKey, isDayKey, streakOf, REST_EVERY } = await import("../public/js/know/streak.js");
const { clearProgress, record } = await import("../public/js/study/progress.js");
const done = await import("../public/js/study/done.js");
const { week } = await import("../public/js/know/summary.js");

let failed = 0;
let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const eq = (actual, expected, what = "") => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what ? `${what}: ` : ""}${a} ≠ ${e}`);
};
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};

// Days from a start: "2026-10-01" + n. things(…) builds { day: n } from a pattern: one character a day from `start`,
// a digit for how many finished things ("0" none), "p" for a paused day (none finished).
const START = "2026-10-01";
function plan(pattern, start = START) {
  const things = {};
  const pauses = [];
  [...pattern].forEach((c, i) => {
    const key = addDays(start, i);
    if (c === "p") pauses.push({ from: key, to: key });
    else if (Number(c) > 0) things[key] = Number(c);
  });
  return { things, pauses, today: addDays(start, pattern.length - 1) };
}
const run = (pattern, extra = {}) => streakOf({ ...plan(pattern), ...extra });

// ---------- the rules ----------

await test("a day starts at 4 am, local time, and the keys are real dates", () => {
  eq(dayKey(new Date(2026, 9, 14, 3, 59).getTime()), "2026-10-13", "3:59 am is the day before");
  eq(dayKey(new Date(2026, 9, 14, 4, 0).getTime()), "2026-10-14", "4:00 am is a new day");
  eq(dayKey(new Date(2026, 9, 14, 23, 59).getTime()), "2026-10-14");
  // 1 Nov 2026: clocks go back at 2 am. 1:30 am (twice) is still 31 Oct; 4 am is 1 Nov.
  eq(dayKey(new Date(2026, 10, 1, 1, 30).getTime()), "2026-10-31");
  eq(dayKey(new Date(2026, 10, 1, 4, 0).getTime()), "2026-11-01");
  eq(dayKey(Date.UTC(2026, 10, 1, 9, 0)), "2026-11-01", "4 am New York time is 9:00 UTC after the change");
  eq(addDays("2026-10-31", 1), "2026-11-01");
  eq(addDays("2026-03-07", 1), "2026-03-08");
  eq(addDays("2026-03-08", 1), "2026-03-09", "the spring change too");
  ok(isDayKey("2026-02-28") && !isDayKey("2026-02-30") && !isDayKey("2026-2-3") && !isDayKey(20261101) && !isDayKey("1999-01-01"), "isDayKey");
});

await test("days in a row: today counts once it holds a finished thing; nothing yet today is open, never lost", () => {
  let s = run("111");
  eq([s.days, s.longest, s.state, s.need, s.done], [3, 3, "done", 0, 1]);
  s = run("110");
  eq([s.days, s.state, s.need], [2, "open", 1], "nothing yet today");
  s = run("0");
  eq([s.days, s.state, s.need], [0, "none", 1], "no streak yet");
  s = streakOf({ today: "2026-10-01" });
  eq([s.days, s.state], [0, "none"], "nothing at all");
});

await test(`every ${REST_EVERY} days studied earns a rest day, 2 kept at most, and a missed day uses one by itself`, () => {
  let s = run("111111");
  eq([s.rest, s.nextRestIn], [0, 1], "six days: one more to go");
  s = run("1111111");
  eq([s.rest, s.nextRestIn], [1, REST_EVERY], "seven days: a rest day");
  s = run("11111110");
  eq([s.days, s.rest, s.state], [7, 1, "open"], "today missing is just open, the rest day untouched");
  s = run("111111101");
  eq([s.days, s.rest, s.state, s.statuses["2026-10-08"]], [8, 0, "done", "rested"], "a missed day rested");
  s = run("1".repeat(21));
  eq([s.rest, s.nextRestIn], [2, null], "21 days: 2 kept, no more earned");
  s = run("1".repeat(21) + "001");
  eq([s.days, s.rest, s.statuses["2026-10-22"], s.statuses["2026-10-23"]], [22, 0, "rested", "rested"], "two misses, two rest days");
});

await test("with no rest day left, a missed day mends when the next day holds two finished things", () => {
  // A mended day holds the run without adding to it, like a rest day.
  let s = run("11102");
  eq([s.days, s.state, s.statuses["2026-10-04"]], [4, "done", "mended"], "mended today");
  s = run("111021");
  eq([s.days, s.longest, s.statuses["2026-10-04"]], [5, 5, "mended"], "mended, and the run goes on");
  s = run("1110");
  eq([s.days, s.state], [3, "open"], "yesterday... is today: nothing to mend yet");
  s = run("11100");
  eq([s.days, s.state, s.need], [3, "mend", 2], "today needs two");
  s = run("11101");
  eq([s.days, s.state, s.need], [3, "mend", 1], "one more does it");
});

await test("a missed day not mended, or two in a row, ends the run: day 1 again, the longest kept", () => {
  let s = run("111011");
  eq([s.days, s.longest, s.statuses["2026-10-04"]], [2, 3, "missed"], "one thing the day after isn't enough");
  s = run("1110011");
  eq([s.days, s.longest], [2, 3], "two misses in a row");
  s = run("1110001");
  eq([s.days, s.longest, s.rest], [1, 3, 0]);
  s = run("11100" + "0");
  eq([s.days, s.state], [0, "none"], "two misses, nothing today");
});

await test("a pause holds the streak: its days neither count nor break it, and a missed day before it can still mend", () => {
  let s = run("111ppp1");
  eq([s.days, s.state, s.statuses["2026-10-05"]], [4, "done", "paused"]);
  s = run("111ppp");
  eq([s.days, s.state, s.pausedUntil], [3, "paused", "2026-10-06"], "paused today");
  s = run("1110ppp2");
  eq([s.days, s.statuses["2026-10-04"]], [4, "mended"], "the mending waits out the pause");
  s = run("11pp1p1");
  eq(s.days, 4, "studying on a paused day counts");
  // A pause running past today names its last day.
  s = streakOf({ things: { "2026-10-01": 1 }, pauses: [{ from: "2026-10-02", to: "2026-10-20" }], today: "2026-10-05" });
  eq([s.days, s.state, s.pausedUntil], [1, "paused", "2026-10-20"]);
  // A pause that isn't a real span is ignored.
  s = streakOf({ things: { "2026-10-01": 1 }, pauses: [{ from: "2026-10-03", to: "2026-10-02" }, { from: "x", to: "2026-10-09" }], today: "2026-10-02" });
  eq([s.days, s.state, s.statuses["2026-10-02"]], [1, "open", undefined]);
  s = streakOf({ things: { "2026-10-01": 1 }, pauses: [{ from: "2026-10-03", to: "2026-10-02" }], today: "2026-10-03" });
  eq([s.days, s.state, s.statuses["2026-10-02"]], [1, "mend", "missed"], "no pause stood: the day was missed");
});

await test("days from before the log count one thing each: they keep a streak, never mend one", () => {
  let s = streakOf({ before: ["2026-10-01", "2026-10-02", "2026-10-03"], things: { "2026-10-04": 1 }, today: "2026-10-04" });
  eq([s.days, s.state], [4, "done"]);
  s = streakOf({ before: ["2026-10-01", "2026-10-02"], today: "2026-10-04" });
  eq([s.days, s.state, s.need], [2, "mend", 2], "a gap yesterday: today mends it");
  s = streakOf({ before: ["2026-10-01", "2026-10-03"], today: "2026-10-04" });
  eq([s.days, s.state, s.statuses["2026-10-02"]], [1, "open", "missed"], "a gap a day from before couldn't mend: a new run");
  s = streakOf({ before: ["2026-10-01", "2026-10-03"], things: {}, today: "2026-10-03" });
  eq([s.days, s.statuses["2026-10-02"]], [1, "missed"], "a day from before can't mend");
  s = streakOf({ things: { "2026-10-09": 1 }, today: "2026-10-05" });
  eq([s.days, s.state], [0, "none"], "a day after today counts for nothing yet");
});

await test("the records it syncs: what may be taken from another device", () => {
  const thing = (day) => ({ at: 1_790_000_000_000, value: { day } });
  ok(checkRecord(thing("2026-11-01"), "session:0123456789abcdef"), "a session");
  ok(checkRecord(thing("2026-11-01"), "read:2026-11-01#2"), "reading");
  ok(checkRecord(thing("2026-11-01"), "talk:p_123-abc"), "talk");
  ok(checkRecord(thing("2026-11-01"), "game:0123456789abcdef"), "a game played by itself");
  ok(checkRecord({ at: 5, value: { from: "2026-11-01", to: "2026-11-09" } }, "pause:0123456789abcdef"), "a pause");
  ok(checkRecord({ at: 5, gone: true }, "pause:0123456789abcdef"), "a pause taken back");
  const refused = [
    [thing("2026-11-02"), "read:2026-11-01#2", "reading on another day than its key"],
    [{ at: 5, gone: true }, "session:0123456789abcdef", "a thing deleted"],
    [{ at: 5, value: { day: "2026-11-01", extra: 1 } }, "session:0123456789abcdef", "an extra field"],
    [{ at: 5, value: { day: "2026-11-01" }, more: 1 }, "session:0123456789abcdef", "an extra field outside"],
    [thing("2026-13-01"), "session:0123456789abcdef", "not a date"],
    [thing("2026-11-01"), "session:xyz", "a bad id"],
    [thing("2026-11-01"), "__proto__", "a crafted key"],
    [thing("2026-11-01"), "quiz:0123456789abcdef", "a kind we don't keep"],
    [{ at: -1, value: { day: "2026-11-01" } }, "session:0123456789abcdef", "a bad time"],
    [{ at: 5, value: { from: "2026-11-09", to: "2026-11-01" } }, "pause:0123456789abcdef", "a pause ending before it starts"],
    [{ at: 5, value: { from: "2026-01-01", to: "2027-06-01" } }, "pause:0123456789abcdef", "a pause over a year"],
    [{ at: 5, gone: "yes" }, "pause:0123456789abcdef", "a deletion that isn't one"],
    [null, "pause:0123456789abcdef", "nothing"],
    [[1, 2], "session:0123456789abcdef", "an array"],
  ];
  for (const [rec, key, what] of refused) ok(!checkRecord(rec, key), `taken: ${what}`);
});

// ---------- the log on this device ----------

const today = dayKey();
// Noon of the streak's today: whatever the clock says, a moment that counts for today.
const noon = new Date(`${today}T12:00:00`).getTime();
const reader = (at, word) => ({ concept: `w:${word}`, at, outcome: "met", skill: "read", activity: "reader", item: "b@1#1" });
const practiceRow = (at, practice, n) => ({ concept: `w:turn${n}`, at, outcome: "right", test: "free", skill: "say", activity: "practice:conversation", practice, source: "ai" });

await test("a finished session counts for today; Today's week strip marks the same day", async () => {
  await clearProgress();
  eq(done.streakNow().state, "none");
  ok(done.finishedSession(noon), "recorded");
  const s = done.streakNow({ now: noon });
  eq([s.days, s.state, done.thingsPerDay()[today]], [1, "done", 1]);
  const w = week({ now: noon });
  const day = w.days.find((d) => d.today);
  ok(day.studied && w.studied >= 1 && w.streak.days === 1, `week: ${JSON.stringify(day)}`);
});

// A game played by itself is its own kind (Home's This week names games apart): it must still be a thing the log keeps and the streak counts.
// The streak's kinds once lacked it, and a finished game recorded nothing at all, not even for the streak.
await test("a game played by itself counts for today as its own kind, kept as a game", async () => {
  await clearProgress();
  done.clearFinished();
  ok(done.finishedGame(noon), "recorded");
  const s = done.streakNow({ now: noon });
  eq([s.days, s.state, done.thingsPerDay()[today]], [1, "done", 1]);
  const kinds = done.finishedBetween(noon - 1, noon + 1).map((thing) => thing.kind);
  eq(kinds, ["game"], "its kind");
  ok(Object.keys(done.streakExport().things).some((key) => /^game:[0-9a-f]{16}$/.test(key)), "its key in what syncs");
});

// Days of only games are studied days, on Home's streak and the streak page's year alike (both read streakNow's statuses: Home's streak and
// shell/settings-streak.js through know/streak-days.js streakMonths).
await test("days of only games are studied days: Home's streak and the streak page's year agree", async () => {
  await clearProgress();
  done.clearFinished();
  const yesterday = addDays(today, -1);
  ok(done.finishedGame(noon - 86_400_000) && done.finishedGame(noon - 86_400_000 + 60_000), "two games yesterday, nothing else");
  ok(done.finishedGame(noon), "a game today, nothing else");
  const s = done.streakNow({ now: noon });
  eq([s.days, s.state, s.statuses[yesterday], s.statuses[today]], [2, "done", "studied", "studied"], "Home's streak: two days");
  const { streakMonths } = await import("../public/js/know/streak-days.js");
  const shown = Object.fromEntries(streakMonths(s.statuses, today).flatMap((m) => m.days).map((d) => [d.key, d.state]));
  eq([shown[yesterday], shown[today]], ["studied", "studied"], "the streak page: both days studied");
});

await test("reading: each 5 minutes of a day's page turns is a finished thing (gaps count 3 minutes at most)", async () => {
  await clearProgress();
  const before = done.thingsPerDay()[today] ?? 0;
  // A page a minute for 4 minutes: not yet.
  record([0, 1, 2, 3, 4].map((m) => reader(noon + 60 * 60_000 + m * 60_000, `r${m}`)));
  eq((done.thingsPerDay()[today] ?? 0) - before, 0, "4 minutes");
  // A 20-minute gap counts 3, then a minute more: 4 + 3 + 1 = 8 minutes, one block.
  record([reader(noon + 60 * 60_000 + 24 * 60_000, "r5"), reader(noon + 60 * 60_000 + 25 * 60_000, "r6")]);
  eq((done.thingsPerDay()[today] ?? 0) - before, 1, "8 minutes");
  // Recorded again (a sync bringing the same rows), nothing new.
  record([reader(noon + 60 * 60_000 + 25 * 60_000, "r6")]);
  eq((done.thingsPerDay()[today] ?? 0) - before, 1, "the same moment again");
  record([6, 7, 8].map((m) => reader(noon + 60 * 60_000 + (25 + m - 5) * 60_000, `s${m}`)));
  eq((done.thingsPerDay()[today] ?? 0) - before, 2, "11 minutes: two blocks");
  const keys = Object.keys(done.streakExport().things).filter((k) => k.startsWith("read:"));
  ok(keys.includes(`read:${today}#1`) && keys.includes(`read:${today}#2`), `keys: ${keys}`);
});

await test("talk: a conversation with your AI counts once it holds 3 of your turns", async () => {
  await clearProgress();
  const before = done.thingsPerDay()[today] ?? 0;
  record([practiceRow(noon + 2 * 3600_000, "p1", 1), practiceRow(noon + 2 * 3600_000, "p1", 2)]);
  record([practiceRow(noon + 2 * 3600_000 + 60_000, "p1", 3)]);
  eq((done.thingsPerDay()[today] ?? 0) - before, 0, "two turns (rows of one moment are one turn)");
  record([practiceRow(noon + 2 * 3600_000 + 120_000, "p1", 4)]);
  eq((done.thingsPerDay()[today] ?? 0) - before, 1, "three turns");
  record([practiceRow(noon + 2 * 3600_000 + 180_000, "p1", 5)]);
  eq((done.thingsPerDay()[today] ?? 0) - before, 1, "a fourth turn: still one conversation");
  ok(done.streakExport().things["talk:p1"]?.day === today, "keyed by the practice");
});

await test("pauses: set ahead, ended early, refused when not a span", () => {
  const tomorrow = addDays(today, 1);
  const id = done.addPause(tomorrow, addDays(today, 5), noon);
  eq(done.pauses().map((p) => [p.from, p.to]), [[tomorrow, addDays(today, 5)]]);
  eq(done.streakNow({ now: noon + 86_400_000 }).state, "paused", "tomorrow is paused");
  done.endPause(id, noon);
  eq(done.pauses(), [], "a pause that hadn't started goes");
  const now = done.addPause(addDays(today, -2), addDays(today, 3), noon);
  done.endPause(now, noon);
  eq(done.pauses().map((p) => p.to), [addDays(today, -1)], "one under way ends yesterday");
  let threw = false;
  try {
    done.addPause(tomorrow, today, noon);
  } catch {
    threw = true;
  }
  ok(threw, "a pause ending before it starts");
});

await test("another device's records arrive through the sync (kind \"streak\"); crafted ones are turned down", async () => {
  const sync = await import("../public/js/sync.js");
  const files = new Map();
  let n = 0;
  const store = {
    async list() {
      return [...files].map(([name, f]) => ({ name, version: f.version, size: f.text.length }));
    },
    async read(name) {
      return files.get(name).text;
    },
    async write(name, text) {
      files.set(name, { text, version: `v${++n}` });
      return { version: `v${n}` };
    },
  };
  const TAG = "0acc0001";
  // This device writes its own file, and every record in it passes the kind's check (as another device would read it).
  let report = await sync.syncWith(store, TAG, "aaaaaaaa", {});
  const own = files.get(`lexicommons-streak.${TAG}.aaaaaaaa.json`);
  ok(own, `this device's file: ${[...files.keys()]}`);
  const mine = JSON.parse(own.text).records;
  ok(Object.keys(mine).length >= 3, `records: ${Object.keys(mine)}`);
  for (const [key, rec] of Object.entries(mine)) ok(checkRecord(rec, key), `own record refused: ${key}`);
  // Another device's: a session three days ago, a pause, and crafted records.
  const other = addDays(today, -3);
  const theirs = {
    "session:00000000000000aa": { at: noon - 3 * 86_400_000, value: { day: other } },
    "pause:00000000000000bb": { at: noon, value: { from: addDays(today, 10), to: addDays(today, 12) } },
    "session:00000000000000cc": { at: noon, value: { day: other, run: "alert(1)" } },
    "read:2026-01-01#1": { at: noon, value: { day: other } },
    PROTO: { at: noon, value: { day: other } },
  };
  // "__proto__" as a key in the file itself (an object literal would set the prototype instead).
  const text = JSON.stringify({ format: "lexicommons-sync", version: 1, kind: "streak", account: TAG, records: theirs }).replace('"PROTO"', '"__proto__"');
  files.set(`lexicommons-streak.${TAG}.bbbbbbbb.json`, { version: "v0", text });
  report = await sync.syncWith(store, TAG, "aaaaaaaa", {});
  eq([report.streak.took, report.streak.refused + report.streak.dropped], [2, 3], `two taken, three turned down: ${JSON.stringify(report.streak)}`);
  eq(done.thingsPerDay()[other], 1, "another device's session counts here");
  ok(done.pauses().some((p) => p.from === addDays(today, 10)), "its pause too");
  ok(!Object.hasOwn(done.streakExport().things, "session:00000000000000cc"), "the crafted one isn't kept");
});

const { momentOf, momentWords, DAY_MILESTONES } = await import("../public/js/know/celebrate.js");

await test("a finished session's moment: today counting, day 1, mending, a rest day earned; nothing when it changed nothing", () => {
  const s = (pattern) => run(pattern);
  // Before: six days, today open; after: today counts (7 days, a rest day earned at the seventh).
  let m = momentOf({ before: s("1111110"), after: s("1111111") });
  eq([m.counted, m.days, m.from, m.restEarned, m.firstDay, m.mended, m.milestone], [true, 7, 6, true, false, false, { kind: "days", n: 7 }]);
  eq(momentWords(m).title, "7 days in a row");
  m = momentOf({ before: s("0"), after: s("1") });
  eq([m.counted, m.firstDay, momentWords(m).title], [true, true, "Day 1"]);
  m = momentOf({ before: s("11101"), after: s("11102") });
  eq([m.counted, m.mended, momentWords(m).line], [true, true, "Yesterday mended too."]);
  // A second session the same day: nothing new about the streak.
  m = momentOf({ before: s("111"), after: s("112") });
  eq([m.counted, momentWords(m)], [false, null]);
});

await test("milestones: the days crossed today (7, 30, 100, 365), else words you'd recall (100, 500, 1,000…); the biggest one", () => {
  const days = (n) => run("1".repeat(n));
  const open = (n) => run("1".repeat(n - 1) + "0");
  for (const n of DAY_MILESTONES) eq(momentOf({ before: open(n), after: days(n) }).milestone, { kind: "days", n }, `day ${n}`);
  eq(momentOf({ before: open(8), after: days(8) }).milestone, null, "day 8");
  eq(momentOf({ before: run("1111110"), after: run("1111111"), wordsBefore: 90, wordsAfter: 120 }).milestone, { kind: "days", n: 7 }, "days first");
  const w = momentOf({ before: run("112"), after: run("113"), wordsBefore: 480, wordsAfter: 1010 });
  eq([w.counted, w.milestone], [false, { kind: "words", n: 1000 }], "the biggest crossed");
  eq(momentWords(w, "Dutch"), { title: "1,000 words", line: "Dutch words you'd recall now." });
  ok(!/lose|lost|break|miss/i.test(JSON.stringify([1, 7, 30, 100].map((n) => momentWords(momentOf({ before: open(n), after: days(n) }))))), "a loss word");
});

await test("Today's calm pose by the streak (know/today-pose.js): a rest day used until today counts, a day mended, else none", async () => {
  const { todayPose } = await import("../public/js/know/today-pose.js");
  const pose = (pattern) => todayPose(run(pattern), addDays("2026-10-01", pattern.length - 1));
  eq(pose("111111100"), { pose: "rest", day: "2026-10-08" }, "yesterday rested, nothing yet today");
  eq(pose("111111101"), { pose: null, day: null }, "rested, and today counts");
  eq(pose("11102"), { pose: "mended", day: "2026-10-04" }, "yesterday mended today");
  eq(pose("1110"), { pose: null, day: null }, "nothing to be calm about");
  eq(pose("1111"), { pose: null, day: null }, "studied every day");
  eq(todayPose(null, "2026-10-04"), { pose: null, day: null }, "no streak");
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
