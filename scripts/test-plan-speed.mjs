// Home's plan on a learner a year in (the sample learner's year, on the real path and word packs), in Node: what it reads is what it read
// before it read the word index, and it reads it fast. Each unit's state as the plan has it (plan.js planView, from know/word-index.js)
// equal to unitState's in everything a plan reads; what's due, in the order a plan meets it, equal to working it out from unitState over
// every sentence's units in their order; the overview a start draws the same; and the time it takes (CPU, the least of 5): a plan read
// again after an answer, and a first one after the study material changes, each under a bound the plan before the index went over (6 Nov
// 2026: 184 and 434 ms; a phone slowed 4× takes four times that). node scripts/test-plan-speed.mjs --list <frequency.nl.json> (exit 0 = pass)

// Dutch's grammar as the library has it, first: packs/path-nl.json uses its later patterns (scripts/fixtures/library-grammar.mjs).
import "./fixtures/library-grammar.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const listAt = process.argv.indexOf("--list");
if (listAt < 0) {
  console.error("Usage: node scripts/test-plan-speed.mjs --list <frequency.nl.json>");
  process.exit(2);
}
const { record, clearProgress, unitState } = await import("../public/js/study/progress.js");
const plan = await import("../public/js/study/plan.js");
const content = await import("../public/js/study/content.js");
const { savePack, setPackOn } = await import("../public/js/study/packs.js");
const { useFrequency, rankOf } = await import("../public/js/study/frequency.js");
const { pathLessons } = await import("../public/js/study/path.js");
const { targetOf } = await import("../public/js/study/new-words.js");
const S = await import("../public/js/study/sample-learner.js");
const index = await import("../public/js/know/word-index.js");

for (const name of readdirSync(join(APP, "packs")).filter((n) => /^(path-nl|words-nl-\d+)\.json$/.test(n)).sort()) await savePack(JSON.parse(readFileSync(join(APP, "packs", name), "utf8")));
useFrequency(JSON.parse(readFileSync(process.argv[listAt + 1], "utf8")));
const course = S.courseOf({ lang: "nl", lessons: pathLessons(), items: content.ITEMS, sentenceUnits: content.sentenceUnits, conceptsOf: content.conceptsOf, targetOf });
const NOW = new Date(2026, 10, 6, 15, 0).getTime();
const L = S.sampleLearner("year", course, { now: NOW });
await clearProgress();
for (let i = 0; i < L.evidence.length; i += 20_000) record(L.evidence.slice(i, i + 20_000).map(({ uid: _uid, ...row }) => row));
index.counts({ lang: "nl", now: NOW });

let failed = 0;
let passed = 0;
async function test(name, fn) {
  try {
    const note = await fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};

const view = plan.planView(NOW);
const units = [...new Set(content.ITEMS.flatMap(content.conceptsOf))];

await test("each unit's state as the plan reads it (from the word index) is unitState's: new, level, due and when, slipping, last answer, reviews, each strength's due, level, known and recall", () => {
  let checked = 0;
  for (const unit of units) {
    const a = view.st(unit);
    const b = unitState(unit, { lang: "nl", now: NOW });
    const same = (what, x, y) => ok(x === y || (typeof x === "number" && Math.abs(x - y) < 1e-9), `${unit} ${what}: ${x} (plan) vs ${y} (unitState)`);
    for (const key of ["isNew", "level", "due", "dueAt", "slipping", "lastAt"]) same(key, a[key], b[key]);
    same("trained", a.trained.join(), b.trained.join());
    for (const skill of ["read", "hear", "say"]) {
      same(`${skill} started`, Boolean(a.strengths[skill]), Boolean(b.strengths[skill]));
      if (b.strengths[skill]) for (const key of ["due", "level", "known", "recall", "dueAt"]) same(`${skill}.${key}`, a.strengths[skill][key], b.strengths[skill][key]);
    }
    if (!b.isNew && checked % 50 === 0) same("reviews", a.reviews, b.reviews);
    checked++;
  }
  return `${checked.toLocaleString()} units`;
});

await test("what's due, in the order a plan meets it, is what unitState says of every sentence's units in their order", () => {
  // The rule as it was written over every sentence: each unit of each sentence once, the due ones, by recall and then rank, ties in that order.
  const want = [];
  for (const unit of units) {
    const s = unitState(unit, { lang: "nl", now: NOW });
    if (s.due) want.push(unit);
  }
  const got = view.due.map((due) => due.unit);
  ok(new Set(got).size === got.length, "a unit twice");
  ok(got.length === want.length && got.every((unit) => want.includes(unit)), `due: ${got.length} (plan) vs ${want.length}`);
  const recall = new Map(view.due.map((due) => [due.unit, due.recall]));
  for (let i = 1; i < got.length; i++) ok(recall.get(got[i - 1]) <= recall.get(got[i]), `out of order at ${i}: ${got[i - 1]} before ${got[i]}`);
  return `${got.length.toLocaleString()} due`;
});

const cpu = (fn) => {
  const t = process.cpuUsage();
  fn();
  const d = process.cpuUsage(t);
  return (d.user + d.system) / 1000;
};
const least = (fn, before) => {
  let best = Infinity;
  for (let i = 0; i < 5; i++) {
    before();
    best = Math.min(best, cpu(fn));
  }
  return best;
};

await test("after an answer, Home's plan is read again in under 60 ms (it was 184)", () => {
  plan.studyOverview(NOW);
  const ms = least(() => plan.studyOverview(NOW), () => record([{ concept: "w:huis", outcome: "met", activity: "test" }]));
  ok(ms < 60, `${ms.toFixed(1)} ms`);
  return `${ms.toFixed(1)} ms`;
});

await test("a first plan after the study material changes (a start) in under 250 ms (it was 434)", () => {
  const ms = least(() => plan.studyOverview(NOW), () => {
    setPackOn("words-nl-07", false);
    setPackOn("words-nl-07", true);
  });
  ok(ms < 250, `${ms.toFixed(1)} ms`);
  return `${ms.toFixed(1)} ms`;
});

// ---------- after the study material changes: Home's plan a piece at a time (plan.js warmPlan) ----------

const wall = (fn) => {
  const t = performance.now();
  fn();
  return performance.now() - t;
};
// A pack change as a device sees one: nothing kept for this set of packs is read back.
const changed = async () => {
  const keptMod = await import("../public/js/study/plan-kept.js");
  setPackOn("words-nl-07", false);
  setPackOn("words-nl-07", true);
  keptMod.usePlanKept([]);
};

await test("after a pack change Home's plan is worked out a piece at a time: every piece under 12 ms, then Home's draw under 8 ms, the same as worked out at once (it was one task of 207 ms)", async () => {
  await changed();
  const whole = JSON.stringify([plan.comebackNow(NOW), plan.studyOverview(NOW)]);
  // Each piece's least of 5 rounds (a collection now and then lands in any piece), and each round's draw once warm.
  const pieces = [];
  const draws = [];
  for (let round = 0; round < 5; round++) {
    await changed();
    const steps = plan.warmPlan(NOW);
    for (let i = 0; ; i++) {
      let done = false;
      const ms = wall(() => (done = steps.next().done));
      pieces[i] = Math.min(pieces[i] ?? Infinity, ms);
      if (done) break;
    }
    ok(plan.planWarm(NOW), `not warm after round ${round}`);
    let drawn;
    draws.push(wall(() => (drawn = JSON.stringify([plan.comebackNow(NOW), plan.studyOverview(NOW)]))));
    ok(drawn === whole, `round ${round}: Home's plan isn't what it is worked out at once`);
  }
  const longest = Math.max(...pieces);
  const draw = Math.min(...draws);
  ok(longest < 12, `a piece took ${longest.toFixed(1)} ms (piece ${pieces.indexOf(longest)} of ${pieces.length})`);
  ok(draw < 8, `Home's draw once warm: ${draw.toFixed(1)} ms`);
  return `${pieces.length} pieces, the longest ${longest.toFixed(1)} ms; Home's draw then ${draw.toFixed(1)} ms`;
});

await test("why Home's plan would be worked out again (plan.js planStale): a pack change is content, an answer is evidence, a minute on is time, warm is nothing", async () => {
  await changed();
  ok(plan.planStale(NOW) === "content", `after a pack change: ${plan.planStale(NOW)}`);
  for (const _ of plan.warmPlan(NOW));
  ok(plan.planStale(NOW) === null, `after warmPlan: ${plan.planStale(NOW)}`);
  ok(plan.planStale(NOW + 61_000) === "time", `a minute on: ${plan.planStale(NOW + 61_000)}`);
  record([{ concept: "w:huis", outcome: "met", activity: "test" }]);
  ok(plan.planStale(NOW) === "evidence", `after an answer: ${plan.planStale(NOW)}`);
});

await test("coming back is read from the recent days alone: Home's comebackNow in under 3 ms on a year's answers (it read every one: 106 ms)", () => {
  plan.comebackNow(NOW);
  const ms = least(() => plan.comebackNow(NOW), () => record([{ concept: "w:huis", outcome: "met", activity: "test" }]));
  ok(ms < 3, `${ms.toFixed(1)} ms`);
  return `${ms.toFixed(2)} ms`;
});

await test("which day back it is (plan.js comebackDays, Tinta's wave on Home) builds nothing of the plan: right after a pack change the plan is still to be worked out, it says what comebackNow does without the share, under 3 ms (comebackNow there worked out the whole view in Home's return: 184 ms on a phone slowed 4×)", async () => {
  const said = [];
  for (const at of [NOW, NOW + 10 * 86_400_000]) {
    await changed();
    const days = plan.comebackDays(at);
    ok(plan.planStale(at) === "content", `comebackDays worked out the plan: planStale says ${plan.planStale(at)}`);
    const ms = least(() => plan.comebackDays(at), () => {});
    ok(ms < 3, `${ms.toFixed(1)} ms`);
    const whole = plan.comebackNow(at);
    const without = whole ? { away: whole.away, day: whole.day, days: whole.days } : whole;
    ok(JSON.stringify(days) === JSON.stringify(without), `${JSON.stringify(days)} where comebackNow says ${JSON.stringify(whole)}`);
    said.push(`${new Date(at).toDateString()}: ${JSON.stringify(days)} in ${ms.toFixed(2)} ms`);
  }
  return said.join("; ");
});

await test("what Your progress reads (summary.js knowledge) worked out a piece at a time (warmKnowledge, for Home's return a minute on): every piece under 12 ms, the same as worked out at once, and knowledge() then has it at once (at once it was a 57 ms task on a phone slowed 4×)", async () => {
  const { knowledge, warmKnowledge } = await import("../public/js/know/summary.js");
  const pieces = [];
  let kept = Infinity;
  for (let round = 0; round < 3; round++) {
    // Each round its own minute (summary.js keeps one minute's): worked out at once, then another minute's in its place, then the first warmed.
    const at = NOW + (round + 2) * 60_000;
    const whole = JSON.stringify(knowledge({ now: at }));
    knowledge({ now: at + 30 * 60_000 });
    const steps = warmKnowledge({ now: at });
    for (let i = 0; ; i++) {
      let done = false;
      const ms = wall(() => (done = steps.next().done));
      pieces[i] = Math.min(pieces[i] ?? Infinity, ms);
      if (done) break;
    }
    let after;
    kept = Math.min(kept, wall(() => (after = JSON.stringify(knowledge({ now: at })))));
    ok(after === whole, `round ${round}: warmed, what you know isn't what it is worked out at once`);
  }
  const longest = Math.max(...pieces);
  ok(pieces.length > 2, `${pieces.length} pieces: not worked out a piece at a time`);
  ok(longest < 12, `a piece took ${longest.toFixed(1)} ms (piece ${pieces.indexOf(longest)} of ${pieces.length})`);
  ok(kept < 1, `knowledge() after it took ${kept.toFixed(2)} ms: not kept`);
  return `${pieces.length} pieces, the longest ${longest.toFixed(1)} ms; then knowledge() ${kept.toFixed(2)} ms`;
});

await test("the words a session keeps from its start for the words milestone (summary.js wordsKnownNow, celebration-ui.js wordsKnown) are knowledge()'s words known, from a minute to months on, training every strength and reading alone, with a control (what's trained ignored) that differs; and they take a fraction of knowledge()", async () => {
  const { knowledge, wordsKnownNow } = await import("../public/js/know/summary.js");
  const { getStudySettings, setStudySetting } = await import("../public/js/study/settings.js");
  const { SKILLS } = await import("../public/js/study/scheduler.js");
  const ignoringTrained = (now) => index.statesNow({ lang: "nl", now }).filter((s) => s.kind === "word" && !s.isNew && SKILLS.some((skill) => s.strengths[skill]?.known)).length;
  const was = getStudySettings().memory.train;
  const H = 3_600_000;
  const said = [];
  let controlDiffers = 0;
  let fastest = Infinity;
  let wholeFastest = Infinity;
  try {
    for (const train of [{ read: true, hear: true, say: true }, { read: true, hear: false, say: false }]) {
      setStudySetting("memory.train", train);
      const counts = [];
      // Each moment its own minute (knowledge() keeps one minute's, and wordsKnownNow reads it when it's kept): worked out first, then compared.
      for (const at of [NOW + 61_000, NOW + 5 * H, NOW + 72 * H, NOW + 720 * H, NOW + 2880 * H]) {
        let fast;
        fastest = Math.min(fastest, wall(() => (fast = wordsKnownNow({ lang: "nl", now: at }))));
        let whole;
        wholeFastest = Math.min(wholeFastest, wall(() => (whole = knowledge({ lang: "nl", now: at }).kinds.word.known)));
        ok(fast === whole, `training ${Object.keys(train).filter((k) => train[k]).join(", ")}, ${new Date(at).toISOString()}: ${fast} words, where knowledge() says ${whole}`);
        if (ignoringTrained(at) !== whole) controlDiffers++;
        counts.push(whole);
      }
      said.push(`training ${Object.keys(train).filter((k) => train[k]).join(", ")}: ${counts.join(", ")}`);
    }
  } finally {
    setStudySetting("memory.train", was);
  }
  ok(controlDiffers > 0, "the control (what's trained ignored) never differed: this comparison couldn't fail");
  ok(fastest < wholeFastest / 3, `wordsKnownNow took ${fastest.toFixed(2)} ms, knowledge() ${wholeFastest.toFixed(2)} ms`);
  return `${said.join("; ")}; the control differs ${controlDiffers} times; ${fastest.toFixed(2)} ms against knowledge()'s ${wholeFastest.toFixed(2)} ms`;
});

await test("the words in order (new-words.js, sorted on one number each) are the order the comparisons give: by rank, then where each is first taught or used, then as they came", async () => {
  const { ITEMS, WORDS } = content;
  const first = new Map();
  const taughtAt = new Map();
  ITEMS.forEach((item, i) => {
    for (const [, lemma] of item.words) if (lemma && !first.has(lemma)) first.set(lemma, i);
    const target = item.gap ? item.words[item.gap.index]?.[1] : null;
    if (target && !taughtAt.has(target)) taughtAt.set(target, i);
  });
  const place = (lemma) => taughtAt.get(lemma) ?? ITEMS.length + first.get(lemma);
  const expected = [...first.keys()].filter((lemma) => WORDS[lemma]).sort((a, b) => rankOf(a, "nl") - rankOf(b, "nl") || place(a) - place(b));
  const got = (await import("../public/js/study/new-words.js")).wordsInOrder();
  const at = got.findIndex((lemma, i) => lemma !== expected[i]);
  ok(got.length === expected.length && at < 0, `${got.length} words against ${expected.length}; first difference at ${at}: ${got[at]} for ${expected[at]}`);
  return `${got.length.toLocaleString()} words`;
});

// ---------- kept on the device (study/plan-kept.js) ----------

const kept = await import("../public/js/study/plan-kept.js");
const nw = await import("../public/js/study/new-words.js");
const cold = () => {
  setPackOn("words-nl-07", false);
  setPackOn("words-nl-07", true);
};
// The path and the words as a start would read them, in full: every lesson's place, names, words and things.
const pathNow = () =>
  pathLessons().map((lesson) => [lesson.id, lesson.n, lesson.title, lesson.unit?.id, lesson.unit?.title, lesson.pack ?? null, (lesson.words ?? []).map((word) => word.lemma).join(), lesson.things.map((thing) => `${thing.unit}=${thing.text}/${thing.means}`).join("|"), lesson.kind, JSON.stringify(lesson.teaches)].join("\t"));
const wordsNow = () => [nw.wordsInOrder().join(), ...["ik", "huis", "fiets", "gezellig", "zwemmen"].map((lemma) => [nw.firstSentenceOf(lemma), nw.isHeavy(lemma)].join())].join("\n");

await test("what's kept equals a fresh build: a start that reads it back has the same path, lesson by lesson, and the same words in the same order", () => {
  cold();
  kept.usePlanKept([]);
  const fresh = { path: pathNow(), words: wordsNow(), overview: JSON.stringify(plan.studyOverview(NOW)) };
  const records = kept.planKeptSnapshot();
  ok(records.length === 1 && records[0].parts.words?.value.ranked && records[0].parts.path?.value.length, `kept: ${JSON.stringify(records.map((r) => Object.keys(r.parts ?? {})))}`);
  cold();
  kept.usePlanKept(records);
  const before = kept.planKeptStats();
  const again = { path: pathNow(), words: wordsNow(), overview: JSON.stringify(plan.studyOverview(NOW)) };
  const after = kept.planKeptStats();
  ok(after.read - before.read >= 2, `nothing read back: ${JSON.stringify([before, after])}`);
  ok(again.words === fresh.words, "the words differ");
  ok(again.path.length === fresh.path.length, `${again.path.length} lessons, fresh ${fresh.path.length}`);
  const at = again.path.findIndex((line, i) => line !== fresh.path[i]);
  ok(at < 0, `lesson ${at}: ${again.path[at]?.slice(0, 160)} vs ${fresh.path[at]?.slice(0, 160)}`);
  ok(again.overview === fresh.overview, "Home's overview differs");
  return `${fresh.path.length.toLocaleString()} lessons, ${nw.wordsInOrder().length.toLocaleString()} words`;
});

await test("what was kept for other packs, another list or another app is never read back", () => {
  cold();
  kept.usePlanKept([]);
  plan.studyOverview(NOW);
  const records = kept.planKeptSnapshot();
  // Another band off: its key isn't the one kept.
  setPackOn("words-nl-06", false);
  kept.usePlanKept(records);
  const before = kept.planKeptStats();
  const lessons = pathNow();
  const after = kept.planKeptStats();
  ok(after.read === before.read && after.missed > before.missed, `read back for another set of packs: ${JSON.stringify([before, after])}`);
  kept.usePlanKept([]);
  cold();
  setPackOn("words-nl-06", false);
  const fresh = pathNow();
  ok(lessons.join("\n") === fresh.join("\n"), "with words-nl-06 off, not what a fresh build lays out");
  setPackOn("words-nl-06", true);
  // A record with the right key but another schema or app.
  const stale = records.map((record) => ({ ...record, parts: Object.fromEntries(Object.entries(record.parts).map(([part, one]) => [part, { ...one, key: one.key.replace(/^\[1,/, "[0,") }])) }));
  kept.usePlanKept(stale);
  cold();
  const b2 = kept.planKeptStats();
  pathNow();
  ok(kept.planKeptStats().read === b2.read, "a record under another schema read back");
});

await test("a start with what's kept: Home's first plan in under 120 ms (a fresh build's cost without it)", () => {
  cold();
  kept.usePlanKept([]);
  plan.studyOverview(NOW);
  const records = kept.planKeptSnapshot();
  const withKept = least(() => plan.studyOverview(NOW), () => {
    cold();
    kept.usePlanKept(records);
  });
  const without = least(() => plan.studyOverview(NOW), () => {
    cold();
    kept.usePlanKept([]);
  });
  ok(withKept < 120 && withKept < without, `${withKept.toFixed(1)} ms with it, ${without.toFixed(1)} without`);
  return `${withKept.toFixed(1)} ms with it, ${without.toFixed(1)} without`;
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
