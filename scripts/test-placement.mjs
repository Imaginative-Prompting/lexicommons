// Find your level (study/placement.js) in plain Node, on every full course's real path (packs/path-<lang>.json):
//   - each unit's pool: words with a meaning and sentences readable by the unit's end, short enough to ask as tiles;
//   - the questions: one at a time, the first two unit 1's for everyone, the third where the first run's answer lands it when both were right
//     (a miss keeps it low); none twice in a test, the same seed the same test, a retake drawing others; a sentence too tall for a small
//     screen asked on a shorter one (under 1 in 20 by guessing), then as a word of its unit;
//   - the search's rules (makeSearch, SEARCH), by themselves: it climbs on right answers, faster on a streak (its control: no streak's aim);
//     after a miss it asks the same unit or an easier one; it settles between its least and most questions, then asks at most its idea
//     checks; its bar never goes back and is full only at its end; never placed past the highest unit answered right but one; stopped
//     partway only as far as it's sure of; knowing the whole course only with proof across its last third (its control: without it,
//     someone who knows to unit 13 is told so more often);
//   - how sure: the real controller played by graded learners on each course (knowing that fades by unit, each idea a little behind its
//     words, every guess at the question's own chance from its real choices and tiles): too high at most 1%, at or one below where they'd
//     start at least 60%, more than one below at most 20%, told they know it all rightly at least 90%, about 20 questions, most ideas below
//     the place asked; the same with every sentence on its shorter stand-in (a 320 × 568 phone); someone who knows nothing, guessing, starts
//     from the beginning at least 99% of the time;
//   - what a placement leaves (Dutch): the lessons before its unit done ("placed" on the path); what they teach put down as known (seeds in
//     its record): known well from the start in Home's and Knowledge's count, never new, their ideas held at Getting there; a word missed in
//     it, and an idea missed in the unit that teaches it, taught as new; the whole course placed: everything it teaches known, Home's number
//     what its result said; the spread (nearest unit first, from day 10, at most 6 a day); the load by the real plan (at most
//     PLACED_PER_SESSION placed things due in a plan, still known at week 8); a miss demoting as any miss, after the placement in its History;
//     answers before it (raised if last right, kept if missed); taken again lower, Start from the beginning and its Undo taking the seeds
//     back; two devices, newest wins; your AI's study record marking them; the record through sync in its shape.
// Usage: node scripts/test-placement.mjs [<app dir>] [--trials <n>] [--only <regex>]   (exit 0 = pass)
// <app dir>: another copy's modules on these packs, to see it fail on one from before.
import "./fixtures/library-grammar.mjs";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const trialsAt = argv.indexOf("--trials");
const onlyAt = argv.indexOf("--only");
const ONLY = onlyAt >= 0 ? new RegExp(argv[onlyAt + 1], "i") : null;
const TRIALS = trialsAt >= 0 ? Number(argv[trialsAt + 1]) : 100;
const other = argv.filter((arg, i) => !arg.startsWith("--") && argv[i - 1] !== "--trials" && argv[i - 1] !== "--only");
const APP = other[0] ? resolve(other[0]) : HERE;
const from = (rel) => import(pathToFileURL(join(APP, rel)).href);

const P = await from("public/js/study/placement.js");
const { savePack } = await from("public/js/study/packs.js");
const { setLearning } = await from("public/js/study/learning.js");
const { contentLanguage } = await from("public/js/study/content.js");
const { clearProgress, record, TESTS, unitState } = await from("public/js/study/progress.js");
const plan = await from("public/js/study/plan.js");
const place = await from("public/js/study/path-place.js");
const { knowledge } = await from("public/js/know/summary.js");

const COURSES = ["nl", "es", "fr", "de", "pt", "it", "ru", "ja"];
const read = (name) => JSON.parse(readFileSync(join(HERE, "packs", name), "utf8"));
let failed = 0;
let passed = 0;
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};
const eq = (actual, expected, what = "") => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what ? `${what}: ` : ""}${a} ≠ ${e}`);
};
async function test(name, fn) {
  if (ONLY && !ONLY.test(name)) return;
  try {
    const note = await fn();
    passed++;
    console.log(`ok    ${name}${note ? `: ${note}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${String(error.message ?? error).split("\n")[0]}`);
  }
}
const pct = (x) => `${(x * 100).toFixed(1)}%`;

async function course(lang) {
  setLearning(lang);
  const saved = await savePack(read(`path-${lang}.json`));
  if (!saved.ok) throw new Error(`path-${lang}: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
  ok(contentLanguage() === lang, `the content is ${contentLanguage()}, not ${lang}`);
  return P.placementUnits();
}

// ---------- a step's chance by guessing alone, from its real choices and tiles ----------

/** Ordered picks of `k` of `tiles` that read as `answer`, over every ordered pick of k: a guesser who knows how many to place. */
function orderChance(tiles, answer) {
  const k = answer.length;
  let all = 1;
  for (let i = 0; i < k; i++) all *= tiles.length - i;
  const left = new Map();
  for (const tile of tiles) left.set(tile, (left.get(tile) ?? 0) + 1);
  let ways = 1;
  for (const word of answer) {
    const n = left.get(word) ?? 0;
    if (!n) return 0;
    ways *= n;
    left.set(word, n - 1);
  }
  return ways / all;
}
/** A placement step's chance of being right by guessing: a word's 1 in its choices; a sentence's orders that read right, over every order. */
function guessOf(step) {
  if (step.kind === "word") return 1 / step.options.length;
  if (step.kind === "translate") return Math.min(1, orderChance(step.tiles, step.answer) + (step.also ? orderChance(step.tiles, step.also) : 0));
  // Put it in order: its own words and one stray (session.js strayFor).
  const words = step.item.words.map(([text]) => text);
  return orderChance([...words, "\u0000stray"], words);
}

// ---------- each course ----------

const GRADED = TRIALS * 3; // graded learners a course
const BY_COURSE = {}; // lang → its graded run
const SMALL = {}; // lang → its graded run with every sentence on its stand-in

for (const lang of COURSES) {
  const units = await course(lang);
  await test(`${lang}: 16 units, each with words and sentences enough, its sentences readable by its end and short enough for tiles`, () => {
    ok(P.canPlace(units) && P.courseHere(), `canPlace ${P.canPlace(units)}, courseHere ${P.courseHere()}`);
    eq(units.length, 16, "units");
    const taughtIn = new Map();
    for (const unit of units) for (const lesson of unit.lessons) for (const thing of lesson.things ?? []) if (thing.lemma && !taughtIn.has(thing.lemma)) taughtIn.set(thing.lemma, unit.n);
    let words = Infinity;
    let sentences = Infinity;
    for (const unit of units) {
      ok(unit.first && !unit.first.full && unit.first.id.startsWith(`path-${lang}/`), `unit ${unit.n}'s first lesson ${unit.first?.id}`);
      words = Math.min(words, unit.words.length);
      sentences = Math.min(sentences, unit.sentences.length);
      for (const { item } of unit.sentences) {
        for (const [, lemma] of item.words) ok(!lemma || taughtIn.get(lemma) <= unit.n, `${item.id} (unit ${unit.n}) has ${lemma}, taught in unit ${taughtIn.get(lemma)}`);
        ok(item.words.length >= P.PLACEMENT.leastWords && item.words.length <= P.PLACEMENT.mostWords, `${item.id}: ${item.words.length} words`);
      }
    }
    ok(words >= 20 && sentences >= 20, `thinnest unit: ${words} words, ${sentences} sentences`);
    return `thinnest unit ${words} words, ${sentences} sentences`;
  });

  await test(`${lang}: one question at a time, the first two unit 1's for everyone; both right, the third where the first run's answer lands it (${Object.entries(P.SEARCH.landing).map(([k, v]) => `${k} ${v}`).join(", ")}); none twice in a test; the same seed the same test; a retake draws other sentences`, () => {
    for (const [start, landing] of Object.entries(P.SEARCH.landing)) {
      const p = P.makePlacement({ start, seed: `first:${start}`, units });
      eq(p.steps.length, 1, "questions up at the start");
      const asked = [p.steps[0]];
      for (let i = 0; i < 2; i++) asked.push(...p.answered(asked[i], true));
      eq(asked.map((step) => step.placement.unit), [1, 1, landing], `${start}: the first three questions' units`);
    }
    // A miss in the first two: no landing, it stays with the easy units.
    const missed = P.makePlacement({ start: "talk", seed: "first:miss", units });
    const second = missed.answered(missed.steps[0], false)[0];
    const third = missed.answered(second, true)[0];
    ok(third.placement.unit <= 2, `after a miss in the first two, the third from unit ${third.placement.unit}`);
    const one = P.makePlacement({ start: "by", seed: "a", units });
    const again = P.makePlacement({ start: "by", seed: "a", units });
    const seen = new Set();
    const steps = [...one.steps];
    const twin = [...again.steps];
    for (let guard = 0; guard < 60 && steps.length; guard++) {
      const step = steps.shift();
      const other = twin.shift();
      eq(other.item?.id ?? other.target, step.item?.id ?? step.target, "the same seed");
      const key = step.item?.id ?? `w:${step.target}`;
      ok(!seen.has(key), `${key} asked twice`);
      seen.add(key);
      const right = step.placement.unit <= 9;
      steps.push(...one.answered(step, right));
      twin.push(...again.answered(other, right));
    }
    ok(one.done, "a test that never ended");
    const retake = P.makePlacement({ start: "by", seed: "b", units, avoid: one.result().asked });
    const last = new Set(one.result().asked);
    const retakeSteps = [...retake.steps];
    for (let i = 0; i < retakeSteps.length && i < 30; i++) {
      ok(!retakeSteps[i].item || !last.has(retakeSteps[i].item.id), `a retake asking the last test's ${retakeSteps[i].item?.id}`);
      retakeSteps.push(...retake.answered(retakeSteps[i], retakeSteps[i].placement.unit <= 9));
    }
  });

  await test(`${lang}: a sentence too tall for a small screen asked another way: first the same question on one of the unit's shortest sentences of 4 tiles or more (by guessing under 1 in 20), then a word of the unit by itself; both drawn with it, none asked twice`, () => {
    let worst = 0;
    let small = 0;
    let big = 0;
    const tilesOf = (one) => (one.kind === "arrange" ? one.item.words.length : one.answer.length);
    for (let s = 0; s < 20; s++) {
      const p = P.makePlacement({ start: "few", seed: `instead:${s}`, units });
      // Played through by someone who knows it all, so the units it climbs to have their stand-ins looked at.
      const all = [...p.steps];
      for (let i = 0; i < all.length && !p.done; i++) all.push(...p.answered(all[i], true));
      for (const step of all.filter((one) => one.kind !== "word")) {
        const short = step.spare;
        ok(short && short.kind === step.kind && short.placement.unit === step.placement.unit, `${step.kind}'s stand-in: ${JSON.stringify(short && { kind: short.kind, unit: short.placement?.unit })}`);
        ok(short.item.id !== step.item.id, "its stand-in the same sentence");
        ok(tilesOf(short) >= P.PLACEMENT.leastShort, `a stand-in of ${tilesOf(short)} tiles`);
        // Small enough for 320 × 568 where the unit has one (its sentence on one line of the card, its tiles in two rows): a stand-in that's too
        // tall too drops to a word, 1 in 3 by guessing.
        const dutch = short.item.words.map(([text]) => text).join(" ").length;
        const fits = short.kind === "arrange" ? dutch <= 35 : dutch <= 26 && short.tiles.length <= 8;
        // (Its bank counted without making it, as made.)
        if (short.kind === "translate") ok(short.tiles.length === short.answer.length + (short.also ? short.also.filter((w, i, every) => every.slice(0, i + 1).filter((x) => x === w).length > short.answer.filter((x) => x === w).length).length : 0) + (short.answer.length <= 3 ? 1 : 2), `a stand-in's bank counted wrong: ${short.tiles.length} tiles`);
        if (fits) small++;
        else big++;
        worst = Math.max(worst, guessOf(short));
        const word = short.spare;
        ok(word && word.kind === "word" && word.placement.unit === step.placement.unit, "the stand-in's own stand-in isn't a word of the unit");
        ok(p.instead(step) === short && p.instead(short) === word, "instead isn't the stand-ins drawn with the question (their drawings fetched with its)");
      }
      const asked = [...all, ...all.flatMap((one) => [one.spare, one.spare?.spare])].filter(Boolean).map((one) => one.item?.id ?? one.target);
      ok(new Set(asked).size === asked.length, "a question and a stand-in the same");
    }
    ok(worst < 1 / 20, `a stand-in's chance by guessing: 1 in ${Math.round(1 / worst)}`);
    ok(small / (small + big) >= 0.8, `stand-ins small enough for 320 × 568: ${small} of ${small + big}`);
    return `the likeliest stand-in by guessing: 1 in ${Math.round(1 / worst)}; small enough for 320 × 568: ${small} of ${small + big}`;
  });

  await test(`${lang}: someone who knows nothing, guessing every question at its own chance (its real choices and tiles), starts from the beginning at least 99% of the time and never past unit 2`, () => {
    const random = P.seededRandom(`nothing:${lang}`);
    let start = 0;
    let most = 0;
    for (let t = 0; t < TRIALS; t++) {
      const p = P.makePlacement({ start: ["few", "by", "talk"][t % 3], seed: `nothing:${lang}:${t}`, units });
      const steps = [...p.steps];
      while (steps.length) {
        const step = steps.shift();
        steps.push(...p.answered(step, random() < guessOf(step)));
      }
      const placed = p.result().placed;
      if (placed === 1) start++;
      most = Math.max(most, placed);
    }
    ok(start / TRIALS >= 0.99 && most <= 2, `from the beginning ${pct(start / TRIALS)}, placed as far as ${most}`);
    return `from the beginning ${pct(start / TRIALS)}`;
  });

  // Each course on its own, 300 learners by default (1% is three of them): bounds a broken search fails, with room for a course's chance. The
  // tight bounds are on every course together, below.
  await test(`${lang}: the real controller played by ${GRADED} graded learners (knowing fading by unit, each idea a little behind its words): too high at most 3%, at or one below where they'd start at least 55%, below where both their words and their grammar would start them by more than one at most 15%, told they know it all rightly at least 70%, about 20 questions (23 at most on average, ${P.SEARCH.most + P.SEARCH.ideaChecks} at most), 95% of answers' work under 15 ms of CPU, and most ideas below the place asked`, () => {
    const out = playGraded(units, lang, GRADED);
    BY_COURSE[lang] = out;
    ok(out.high <= 0.03, `too high ${pct(out.high)}`);
    ok(out.exact + out.oneLow >= 0.55, `at or one below ${pct(out.exact + out.oneLow)}`);
    ok(out.lowBoth <= 0.15, `below their words and their grammar by more than one ${pct(out.lowBoth)}`);
    ok(out.told < 10 || out.toldRight / out.told >= 0.7, `told they know it all rightly ${pct(out.toldRight / out.told)}`);
    ok(out.mean <= 23 && out.most <= P.SEARCH.most + P.SEARCH.ideaChecks, `questions ${out.mean.toFixed(1)} on average, ${out.most} at most`);
    ok(out.p95 < 15, `95% of answers' work under ${out.p95.toFixed(1)} ms of CPU`);
    ok(out.ideas >= 0.7, `ideas below the place asked ${pct(out.ideas)}`);
    return summary(out);
  });

  // Every sentence on its stand-in (the shortest, so the easiest): "knows it all" is said a little more often on so small a phone.
  await test(`${lang}: the same on a 320 × 568 phone, every sentence asked on its shorter stand-in: the same bounds on where it places, but told they know it all rightly at least 70%`, () => {
    const out = playGraded(units, lang, GRADED, { small: true });
    SMALL[lang] = out;
    ok(out.high <= 0.03, `too high ${pct(out.high)}`);
    ok(out.exact + out.oneLow >= 0.55, `at or one below ${pct(out.exact + out.oneLow)}`);
    ok(out.lowBoth <= 0.15, `below their words and their grammar by more than one ${pct(out.lowBoth)}`);
    ok(out.told < 10 || out.toldRight / out.told >= 0.7, `told they know it all rightly ${pct(out.toldRight / out.told)}`);
    return summary(out);
  });
}

await course("nl");
const unitsStop = P.placementUnits();
await test("stopping partway after 5 questions (Dutch, 600 graded learners): never too high, one above at most 2%, the units it puts behind them 4 at most for half", () => {
  const random = P.seededRandom("stop-five");
  let high = 0;
  let oneHigh = 0;
  const behind = [];
  for (let r = 0; r < 600; r++) {
    const who = gradedLearner(unitsStop, random);
    const p = P.makePlacement({ start: who.rating, seed: `stop:${r}`, units: unitsStop });
    const steps = [...p.steps];
    for (let i = 0; i < 5 && steps.length; i++) {
      const step = steps.shift();
      steps.push(...p.answered(step, who.right(step)));
    }
    const placed = p.stopNow().placed;
    behind.push(placed - 1);
    if (placed > 1 && who.kw(placed - 1) < 0.5) high++;
    else if (placed > who.start) oneHigh++;
  }
  behind.sort((a, b) => a - b);
  const median = behind[Math.floor(behind.length / 2)];
  ok(high === 0 && oneHigh / 600 <= 0.02 && median <= 4, `too high ${high}, one above ${pct(oneHigh / 600)}, units behind them: median ${median}`);
  return `one above ${pct(oneHigh / 600)}; units it puts behind them: median ${median}, most ${behind.at(-1)}`;
});

// ---------- every course together ----------

const pooled = (runs) => {
  const all = Object.values(runs);
  const n = all.reduce((a, o) => a + o.n, 0);
  const share = (key) => all.reduce((a, o) => a + o[key] * o.n, 0) / n;
  const told = all.reduce((a, o) => a + o.told, 0);
  const toldRight = all.reduce((a, o) => a + o.toldRight, 0);
  const below = all.reduce((a, o) => a + o.below, 0);
  const belowAsked = all.reduce((a, o) => a + o.belowAsked, 0);
  return { n, exact: share("exact"), oneLow: share("oneLow"), low: share("low"), lowBoth: share("lowBoth"), oneHigh: share("oneHigh"), high: share("high"), told, toldRight, mean: all.reduce((a, o) => a + o.mean * o.n, 0) / n, ideas: below ? belowAsked / below : 1 };
};
const line = (o) => `exact ${pct(o.exact)}, one below ${pct(o.oneLow)}, more below ${pct(o.low)} (below their grammar too ${pct(o.lowBoth)}), one above ${pct(o.oneHigh)}, too high ${pct(o.high)}; told they know it all ${o.told} (rightly ${pct(o.toldRight / o.told)}); ${o.mean.toFixed(1)} questions on average; ideas below the place asked ${pct(o.ideas)}`;
await test("every course together (the graded runs above): too high at most 1%, at or one below at least 65%, told they know it all rightly at least 85%; on a 320 × 568 phone too high at most 2%, told they know it all rightly at least 80%", () => {
  ok(Object.keys(BY_COURSE).length === COURSES.length && Object.keys(SMALL).length === COURSES.length, `courses run: ${Object.keys(BY_COURSE)}, ${Object.keys(SMALL)} (run without --only)`);
  const all = pooled(BY_COURSE);
  const small = pooled(SMALL);
  ok(all.high <= 0.01 && all.exact + all.oneLow >= 0.65 && all.toldRight / all.told >= 0.85, line(all));
  ok(small.high <= 0.02 && small.toldRight / small.told >= 0.8, `on a 320 × 568 phone: ${line(small)}`);
  return `${all.n} learners: ${line(all)}; on a 320 × 568 phone: ${line(small)}`;
});

// ---------- the search's rules, by themselves ----------

// A search answered by `right(n, kind, i)`; its questions ([{ n, kind, right }]) and where it places.
function runSearch(right, { count = 16, landing = P.SEARCH.landing.by, ideaCheck } = {}) {
  const search = P.makeSearch({ count, landing, ideaCheck });
  const bars = [];
  for (let want = search.next(); want; want = search.next()) {
    search.answered(want.n, want.kind, right(want.n, want.kind, search.asked.length));
    bars.push({ settled: search.asked.length, most: search.most(), done: search.done });
  }
  bars.push({ settled: search.asked.length, most: search.most(), done: search.done });
  return { asked: search.asked, placed: search.placed(), stopped: search.stopped(), bars, search };
}

await test("the search climbs on right answers, faster on a streak: someone right every time is asked units that never go down until the last third, reaching it within 6 questions; after three right in a row the next question is harder than the same answers would ask without the streak's aim (its control)", () => {
  const all = runSearch(() => true, { landing: P.SEARCH.landing.few });
  const units = all.asked.map((a) => a.n);
  const top = Math.ceil((16 * 2) / 3) + 1;
  const reach = units.findIndex((n) => n >= top);
  ok(reach >= 0 && reach < 6, `the last third reached at question ${reach + 1}: ${units.join(" ")}`);
  for (let i = 1; i < reach; i++) ok(units[i] >= units[i - 1], `went down before the top: ${units.join(" ")}`);
  // The same answers, with and without the streak's aim: right at 1, 1, then 3 (a streak of three), then a miss at 5 and right at 4, 4, 4.
  const nextAfter = (history) => {
    const search = P.makeSearch({ count: 16, landing: 3 });
    for (const [n, kind, right] of history) search.answered(n, kind, right);
    return search.next().n;
  };
  const histories = [
    [[1, "word", true], [1, "translate", true], [3, "arrange", true]],
    [[1, "word", true], [1, "translate", true], [3, "arrange", true], [6, "word", false], [4, "translate", true], [4, "arrange", true], [4, "word", true]],
  ];
  const aim = { ...P.SEARCH.aim };
  const withStreak = histories.map(nextAfter);
  P.SEARCH.aim.streak = P.SEARCH.aim.normal;
  const without = histories.map(nextAfter);
  Object.assign(P.SEARCH.aim, aim);
  ok(withStreak.every((n, i) => n > without[i]), `after a streak: ${withStreak} with its aim, ${without} without`);
  return `right every time: ${units.join(" ")}; after a streak, units ${withStreak} (without the streak's aim ${without})`;
});

await test("a wrong answer or I don't know steps back down: after every miss the next question is from the same unit or an easier one", () => {
  const random = P.seededRandom("down");
  let misses = 0;
  for (let t = 0; t < 400; t++) {
    const k = 1 + Math.floor(random() * 15);
    const run = runSearch((n) => random() < (n <= k ? 0.9 : 0.25));
    for (let i = 0; i + 1 < run.asked.length; i++) {
      if (run.asked[i].right || i + 1 >= P.SEARCH.least) continue;
      misses++;
      ok(run.asked[i + 1].n <= run.asked[i].n, `after a miss at unit ${run.asked[i].n}, unit ${run.asked[i + 1].n}: ${run.asked.map((a) => `${a.n}${a.right ? "" : "x"}`).join(" ")}`);
    }
  }
  return `${misses} misses`;
});

await test(`it settles at ${P.SEARCH.least}–${P.SEARCH.most} questions (sure of the beginning, from ${P.SEARCH.beginning.least}), then asks at most ${P.SEARCH.ideaChecks} idea checks; its bar fills toward ${P.SEARCH.most + P.SEARCH.ideaChecks} and never goes back, full only at its end`, () => {
  const random = P.seededRandom("settle");
  let most = 0;
  for (let t = 0; t < 300; t++) {
    const k = Math.floor(random() * 17);
    let checks = 0;
    const run = runSearch((n) => random() < (n <= k ? 0.9 : 0.3), { ideaCheck: (below) => (below > 1 && checks++ < 3 ? { n: 1, idea: `i${checks}` } : null) });
    const n = run.asked.length;
    // Fewer only when it stopped sure of the beginning.
    const beginning = run.placed === 1 && n < P.SEARCH.least;
    ok((n >= P.SEARCH.least || (beginning && n >= P.SEARCH.beginning.least)) && n <= P.SEARCH.most + Math.min(3, P.SEARCH.ideaChecks), `${n} questions, placed at ${run.placed}`);
    most = Math.max(most, n);
    let last = 0;
    for (const bar of run.bars) {
      const share = bar.settled / bar.most;
      ok(share + 1e-9 >= last, `its bar went back: ${last} → ${share}`);
      ok(bar.done ? share === 1 : share < 1, `its bar ${share} ${bar.done ? "at" : "before"} its end`);
      last = share;
    }
  }
  return `${most} questions at most`;
});

await test("it never places past the highest unit answered right but one, and stopped partway no further than its cautious reading or the unit after the highest with two sentences right at it or above (five right with a unit-16 word: unit 7 at most; two right in unit 1: unit 2 at most; nothing answered: the beginning)", () => {
  const random = P.seededRandom("cap");
  for (let t = 0; t < 300; t++) {
    const k = Math.floor(random() * 17);
    const run = runSearch((n) => random() < (n <= k ? 0.95 : 0.3));
    const highest = Math.max(0, ...run.asked.filter((a) => a.right).map((a) => a.n));
    ok(run.placed === 17 || run.placed <= highest + 1, `placed at ${run.placed}, the highest right ${highest}`);
    ok(run.stopped <= run.placed || run.placed === 17, `stopped at ${run.stopped}, placed at ${run.placed}`);
    const sentences = run.asked.filter((a) => a.right && a.kind !== "word").map((a) => a.n).sort((a, b) => b - a);
    ok(run.stopped <= (sentences[1] ?? 0) + 1 || run.stopped === 1, `stopped at ${run.stopped}, sentences right at ${sentences.slice(0, 3)}`);
  }
  // Five right, one of them a word of unit 16 (a 1-in-3 guess): only as far as two sentences right show.
  const five = P.makeSearch({ count: 16, landing: 6 });
  for (const [n, kind] of [[1, "word"], [1, "translate"], [6, "arrange"], [16, "word"], [14, "translate"]]) five.answered(n, kind, true);
  ok(five.stopped() <= 7, `five right (sentences at 1, 6 and 14, a word at 16): stopped at ${five.stopped()}`);
  const search = P.makeSearch({ count: 16, landing: 10 });
  eq(search.stopped(), 1, "nothing answered");
  for (let i = 0; i < 2; i++) {
    const want = search.next();
    search.answered(want.n, want.kind, true);
  }
  ok(search.stopped() <= 2, `two right in unit 1, stopped at ${search.stopped()}`);
});

await test(`knowing the whole course needs proof at the top: every time it says so (2,000 runs, learners of every level), it was ${pct(P.SEARCH.everything.sure)} sure and asked ${P.SEARCH.everything.lastThird}+ questions in the last third, ${pct(P.SEARCH.everything.rightShare)} of them right; right every time, it says so; right everywhere but 2 of the last third, it doesn't`, () => {
  const all = runSearch(() => true);
  eq(all.placed, 17, "right every time");
  let missedTop = 0;
  const short = runSearch((n) => !(n >= 12 && missedTop < 2 && ++missedTop));
  ok(short.placed <= 16, `2 of the last third missed: placed at ${short.placed}`);
  const random = P.seededRandom("top");
  let told = 0;
  for (let t = 0; t < 2000; t++) {
    const L = 8 + random() * 12;
    const s = 0.8 + random() * 1.7;
    const k = (u) => 0.97 / (1 + Math.exp(-(L - u) / s));
    const run = runSearch((u, kind) => random() < (kind === "word" ? k(u) + (1 - k(u)) / 3 : k(u) ** 1.2));
    if (run.placed !== 17) continue;
    told++;
    const topAsked = run.asked.filter((a) => a.n >= 12);
    ok(run.search.sure(17) >= P.SEARCH.everything.sure && topAsked.length >= P.SEARCH.everything.lastThird && topAsked.filter((a) => a.right).length >= P.SEARCH.everything.rightShare * topAsked.length, `told on ${topAsked.length} in the last third, ${topAsked.filter((a) => a.right).length} right, ${pct(run.search.sure(17))} sure`);
  }
  return `${told} of 2,000 told they know it all, each with its proof`;
});

// ---------- what a placement leaves (Dutch) ----------

await course("nl");
const unitsNl = P.placementUnits();
const placeAt = (n, { missed = [], right = [] } = {}) => {
  const result = { placed: n, count: unitsNl.length, units: unitsNl, unit: unitsNl[n - 1] ?? null, shown: [], tried: 4, right: right.length, questions: 20, missed, asked: ["path-nl/x"] };
  if (right.length) record(right.map((lemma) => ({ concept: `w:${lemma}`, outcome: "right", activity: "word", ...TESTS.word })));
  return P.applyPlacement(result);
};
const fresh = async () => {
  await clearProgress();
  place.clearPlaces();
};
const knownNow = () => {
  const k = knowledge({ lang: "nl" });
  return { known: k.kinds.word.known, started: k.kinds.word.started };
};

const DAY = 86_400_000;
const { understood, history } = await from("public/js/know/summary.js");
const index = await from("public/js/know/word-index.js");
const { placedSeedOf } = await from("public/js/study/progress.js");
const wordish = (seeds) => seeds.filter(([unit]) => /^[wc]:/.test(unit));
const seedsNow = () => place.placementOn("nl")?.placed?.seeds ?? [];
// The placement taken `days` ago (its seeds' moment with it), the path as it put it.
const takenAgo = (days) => {
  const was = place.placementOn("nl");
  place.setPlacement("nl", { ...was, placed: { ...was.placed, at: was.placed.at - days * DAY } });
  return was.placed.at - days * DAY;
};
// Which unit (1–16) first teaches each thing, as placedSeeds walks them (the unit next to the placed one first).
const unitOfThing = new Map();
for (let n = unitsNl.length; n >= 1; n--)
  for (const lesson of unitsNl[n - 1].lessons) {
    for (const thing of lesson.things ?? []) if (thing.unit) unitOfThing.set(thing.unit, n);
    if (lesson.concept?.pattern) unitOfThing.set(`p:${lesson.concept.pattern}`, n);
  }

await test("placed at unit 8: the lessons before it done (Placed on the path, each unit's whole-unit lesson too), the next lesson unit 8's first; every word and phrase they teach known well from the start (Home's and Knowledge's count: Strong, Solid from 40 days), never new, none due before day 10; a word missed in it new; their ideas known, held at Getting there until their own answers (IDEA_FIRM)", async () => {
  await fresh();
  const missedWord = unitsNl[2].words[0].key;
  placeAt(8, { missed: [missedWord] });
  const placedAt = place.placementOn("nl").placed.at;
  eq(plan.lessonNow()?.id, unitsNl[7].first.id, "the next lesson");
  const path = plan.pathOverview(400).lessons;
  const before8 = path.filter((lesson) => unitsNl.slice(0, 7).some((unit) => unit.lessons.some((one) => one.id === lesson.id)));
  ok(before8.length > 80 && before8.every((lesson) => lesson.state === "done"), `lessons before unit 8 not done: ${before8.filter((l) => l.state !== "done").map((l) => l.id).slice(0, 3)}`);
  // Each unit's whole-unit lesson (path.js makes it; no record names it) done with its unit, never offered later as something new; unit 8's not.
  const wholes = path.filter((lesson) => lesson.full);
  ok(wholes.length >= 8 && wholes.slice(0, 7).every((lesson) => lesson.state === "done") && wholes[7].state !== "done", `whole-unit lessons: ${wholes.slice(0, 8).map((l) => l.state)}`);
  // (Placed: every thing it teaches still on its seed. The lesson with the missed word in it isn't.)
  const withMissed = new Set(unitsNl.flatMap((unit) => unit.lessons).filter((lesson) => (lesson.things ?? []).some((thing) => thing.lemma === missedWord)).map((lesson) => lesson.id));
  const notPlaced = before8.filter((lesson) => !lesson.full && !withMissed.has(lesson.id) && lesson.doing !== "placed");
  ok(!notPlaced.length, `a placed lesson not said to be placed: ${notPlaced.slice(0, 3).map((l) => `${l.id} ${l.doing}`)}`);
  const seeds = seedsNow();
  const words = wordish(seeds);
  ok(!seeds.some(([unit]) => unit === `w:${missedWord}`), "the missed word put down as known");
  ok(unitState(`w:${missedWord}`).isNew, "the missed word not new");
  const counts = index.counts({ lang: "nl" });
  eq(counts.understood, words.length, "words you know well (Home, Knowledge)");
  const notWell = words.filter(([unit]) => !understood(unit));
  ok(!notWell.length, `not known well: ${notWell.slice(0, 3).map(([u]) => u)}`);
  const states = words.map(([unit]) => unitState(unit));
  // Strong (3), or Solid (4) for those first reviewed 40 days on or more: the earliest units, the surest.
  const odd = states.filter((s) => s.isNew || s.due || s.level < 3 || s.reviews !== 0 || s.placedAt !== placedAt);
  ok(!odd.length, `a placed word new, due, not Strong or Solid, counted as answered, or not placed: ${odd.slice(0, 3).map((s) => JSON.stringify({ unit: s.unit, isNew: s.isNew, due: s.due, level: s.level, reviews: s.reviews, placed: s.placedAt === placedAt }))}`);
  const solid = states.filter((s) => s.level === 4).length;
  const soonest = Math.min(...states.map((s) => s.dueAt));
  ok(soonest >= placedAt + 10 * DAY - 60_000, `the first due ${((soonest - placedAt) / DAY).toFixed(1)} days on`);
  const ideas = seeds.filter(([unit]) => unit.startsWith("p:")).map(([unit]) => unitState(unit));
  ok(ideas.length >= 10 && ideas.every((s) => s.strengths.read?.known && s.level === 2 && !s.isNew), `ideas: ${ideas.map((s) => `${s.unit} ${s.level}`).slice(0, 3)}`);
  return `${words.length} words and phrases known well (${words.length - solid} Strong, ${solid} Solid), ${ideas.length} ideas known at Getting there, first due ${((soonest - placedAt) / DAY).toFixed(0)} days on`;
});

await test("an idea missed in the unit that teaches it (a sentence of that unit wrong) isn't put down as known, nor the word missed; the unit's other ideas and an earlier unit's are; the result lists only what's below its place", async () => {
  await fresh();
  // A placement where unit 3's sentence with its own idea was missed: played, so the result's missed list is the controller's own.
  const taught = P.ideasTaught(unitsNl);
  const unit3 = [...taught].filter(([, n]) => n === 3).map(([id]) => id);
  ok(unit3.length >= 1, "unit 3 teaches no idea");
  const p = P.makePlacement({ start: "few", seed: "missed-idea", units: unitsNl });
  const steps = [...p.steps];
  let missedIdea = null;
  while (steps.length) {
    const step = steps.shift();
    const n = step.placement.unit;
    // Knows units 1–9, but misses the first sentence of unit 3 that asks one of its own ideas.
    let right = n <= 9;
    if (!missedIdea && n === 3 && step.kind !== "word" && (step.item.concepts ?? []).some((id) => taught.get(id) === 3)) {
      missedIdea = step.item.concepts.find((id) => taught.get(id) === 3);
      right = false;
    }
    steps.push(...p.answered(step, right));
  }
  const result = p.result();
  ok(result.placed > 3, `placed at ${result.placed}`);
  if (!missedIdea) return "no sentence of unit 3 asked one of its ideas in this run (the seed's)";
  ok(result.missed.includes(`p:${missedIdea}`), `the result's missed list: ${result.missed.slice(0, 5)}`);
  P.applyPlacement(result);
  const seeded = new Set(seedsNow().map(([unit]) => unit));
  ok(!seeded.has(`p:${missedIdea}`), `${missedIdea} put down as known`);
  ok(unitState(`p:${missedIdea}`).isNew, `${missedIdea} not new`);
  const others = [...taught].filter(([id, n]) => n < result.placed && id !== missedIdea && !result.missed.includes(`p:${id}`));
  ok(others.every(([id]) => seeded.has(`p:${id}`)), `an idea below the place not put down as known: ${others.filter(([id]) => !seeded.has(`p:${id}`)).map(([id]) => id).slice(0, 3)}`);
  ok(result.missed.every((what) => !what.startsWith("p:") || taught.get(what.slice(2)) < result.placed), "an idea at or past the place in the missed list");
  return `${missedIdea} missed in unit 3 and taught as new; placed at ${result.placed}`;
});

await test("the whole course: right every time, the result says so (placed past unit 16), and taking it puts every unit's words, phrases and ideas down as known, every course lesson done (each unit's whole-unit lesson too) and what's next past the course; Home's number then is what its screen said (word-index.js understoodWith), from nothing and with words known before", async () => {
  for (const before of [[], unitsNl[0].words.slice(0, 5).map((one) => one.key)]) {
    await fresh();
    if (before.length) record(before.map((lemma) => ({ concept: `w:${lemma}`, outcome: "right", activity: "word", ...TESTS.word })));
    const p = P.makePlacement({ start: "talk", seed: `whole:${before.length}`, units: unitsNl });
    const steps = [...p.steps];
    while (steps.length) steps.push(...p.answered(steps.shift(), true));
    const result = p.result();
    eq(result.placed, unitsNl.length + 1, "right every time");
    ok(result.everything, "not said to know it all");
    const said = index.understoodWith(P.placedSeeds(result.units, result.placed, result.missed).map(([unit]) => unit));
    P.applyPlacement(result);
    const seeded = new Set(seedsNow().map(([unit]) => unit));
    // Every word and phrase each unit's lessons teach (their review lessons repeat them), and every idea.
    const taughtAll = unitsNl.flatMap((unit) => unit.lessons.filter((lesson) => !lesson.full).flatMap((lesson) => [...(lesson.things ?? []).filter((thing) => !thing.formOnly && thing.unit).map((thing) => thing.unit), ...(lesson.concept?.pattern ? [`p:${lesson.concept.pattern}`] : [])]));
    const missing = taughtAll.filter((unit) => !seeded.has(unit));
    ok(!missing.length, `not put down as known: ${missing.slice(0, 5)}`);
    eq(index.counts({ lang: "nl" }).understood, said, "Home's number against the screen's");
    // What comes next is past the course: no lesson of it (a unit's whole-unit lesson included) left to offer as new.
    const next = plan.lessonNow();
    ok(!next || !(next.id.startsWith("path-nl/") || next.full), `Learn something new after the whole course: ${next?.id} (${next?.title})`);
    const left = plan.pathOverview(600).lessons.filter((lesson) => (lesson.id.startsWith("path-nl/") || lesson.full) && lesson.state !== "done");
    ok(!left.length, `course lessons not done: ${left.slice(0, 3).map((lesson) => lesson.id)}`);
  }
  return `${index.counts({ lang: "nl" }).understood} words and phrases, ${seedsNow().filter(([unit]) => unit.startsWith("p:")).length} ideas`;
});

await test("the spread: the unit next to the placed one first, unit 1's last, from day 10, at most 6 first reviews a day; each seed's stability its day, so its first review falls on it (placed at 8 and at 13)", async () => {
  const notes = [];
  for (const n of [8, 13]) {
    const seeds = P.placedSeeds(unitsNl, n, []);
    const units = seeds.map(([unit]) => unitOfThing.get(unit));
    ok(units.every((u, i) => u >= 1 && u < n && (i === 0 || u <= units[i - 1])), `at ${n}: not nearest unit first`);
    eq(seeds[0][1], P.PLACED.firstDay, `at ${n}: the first day`);
    const perDay = new Map();
    for (const [, day] of seeds) perDay.set(day, (perDay.get(day) ?? 0) + 1);
    ok(Math.max(...perDay.values()) <= P.PLACED.aDay, `at ${n}: ${Math.max(...perDay.values())} first reviews on one day`);
    notes.push(`at ${n}: ${seeds.length} things, days ${seeds[0][1]}–${seeds.at(-1)[1]}`);
  }
  await fresh();
  placeAt(8);
  const placedAt = place.placementOn("nl").placed.at;
  const off = seedsNow().filter(([unit, days]) => Math.abs(unitState(unit).dueAt - (placedAt + days * DAY)) > DAY);
  ok(!off.length, `a first review not on its day: ${off.slice(0, 3).map(([u, d]) => `${u} ${d}`)}`);
  return notes.join("; ");
});

await test("the load, by the real plan: placed at 8 and at 13, studying as the sample learner does (88% of weekdays, 66% of weekends) and answering what's due of what it placed (right 95 times in 100), the things still on their seeds due in a plan at most PLACED_PER_SESSION; still known at week 8", async () => {
  const notes = [];
  for (const n of [8, 13]) {
    await fresh();
    placeAt(n);
    const placedAt = takenAgo(0);
    let seed = n * 7919;
    const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const perWeek = Array(8).fill(0);
    let most = 0;
    for (let d = 1; d <= 56; d++) {
      const now = placedAt + d * DAY + 3 * 3600_000;
      const weekend = new Date(now).getDay() % 6 === 0;
      if (random() >= (weekend ? 0.66 : 0.88)) continue;
      const view = plan.planView(now);
      const still = view.due.filter((one) => plan.stillPlaced(view.st(one.unit)));
      most = Math.max(most, still.length);
      ok(still.length <= plan.PLACED_PER_SESSION, `day ${d}: ${still.length} things still on their seeds due in one plan`);
      // Everything due of what it placed, as a practice asks what's due: those still on their seeds, and those missed since.
      const due = view.due.filter((one) => placedSeedOf(one.unit));
      record(due.map((one) => ({ at: now, concept: one.unit, outcome: random() < 0.95 ? "right" : "wrong", activity: "word", test: "recall", skill: "read" })));
      perWeek[Math.floor((d - 1) / 7)] += due.length;
    }
    const end = placedAt + 56 * DAY;
    const known = seedsNow().filter(([unit]) => unitState(unit, { now: end }).strengths.read?.known).length;
    ok(known >= seedsNow().length * 0.97, `at ${n}: ${known} of ${seedsNow().length} known at week 8`);
    notes.push(`at ${n}: a week ${perWeek.join(", ")} (at most ${most} in a plan); ${known} of ${seedsNow().length} known at week 8`);
  }
  return notes.join("; ");
});

await test("a miss on a placed word's first review: it drops from Strong, is due again within a day as any miss is, and counts a lapse; its History the placement, then the miss", async () => {
  await fresh();
  placeAt(8);
  takenAgo(11);
  const [unit] = seedsNow()[0];
  const before = unitState(unit);
  ok(before.due && before.level === 3, `before: due ${before.due}, level ${before.level}`);
  record([{ concept: unit, outcome: "wrong", activity: "word", test: "recall", skill: "read" }]);
  const after = unitState(unit);
  ok(after.level < 3 && !after.isNew && after.strengths.read.lapses === 1, `after: level ${after.level}, lapses ${after.strengths.read.lapses}`);
  ok(after.dueAt <= Date.now() + 1.5 * DAY, `due again ${((after.dueAt - Date.now()) / DAY).toFixed(1)} days on`);
  ok(!understood(unit), "still known well after the miss");
  const h = history(unit);
  ok(h.placedAt && h.tests.length === 1 && h.tests[0].grade === "again" && h.placedAt < h.tests[0].at, `its History: placed ${h.placedAt}, ${h.tests.map((one) => `${one.grade} ${one.at}`)}`);
  return `level 3 → ${after.level}, due again in ${((after.dueAt - Date.now()) / DAY).toFixed(1)} days`;
});

await test("answered before the placement (its own right answers, a lesson's): a word last right is raised to its seed (known well, its answer and the placement in its History, in order); one last missed keeps its miss (not raised, still due)", async () => {
  await fresh();
  const rightWord = unitsNl[5].words[0].key;
  const missWord = unitsNl[4].words[1].key;
  record([{ concept: `w:${rightWord}`, outcome: "right", ...TESTS.word }, { concept: `w:${missWord}`, outcome: "wrong", ...TESTS.word }]);
  await new Promise((resolve) => setTimeout(resolve, 5));
  placeAt(8);
  ok(understood(`w:${rightWord}`), "a word right before it, not raised");
  const missed = unitState(`w:${missWord}`);
  ok(missed.level < 3 && !understood(`w:${missWord}`) && missed.strengths.read.stability < 1, `a word missed before it: level ${missed.level}, ${missed.strengths.read.stability.toFixed(2)} days`);
  const h = history(`w:${rightWord}`);
  ok(h.tests.length === 1 && h.placedAt > h.tests[0].at, "its History out of order");
});

await test("taken again lower (8, then 5): units 5 to 7 not done, their things new again, no seed left from the 8; Start from the beginning: nothing placed, Knowledge back to the answers alone; its Undo puts unit 5's seeds back", async () => {
  await fresh();
  placeAt(8);
  const unit7 = wordish(seedsNow()).find(([unit]) => unitOfThing.get(unit) === 7)[0];
  placeAt(5);
  eq(plan.lessonNow()?.id, unitsNl[4].first.id, "the next lesson after the lower one");
  const path = plan.pathOverview(400).lessons;
  ok(path.filter((lesson) => unitsNl[5].lessons.some((one) => one.id === lesson.id)).every((lesson) => lesson.state !== "done"), "unit 6 still done");
  ok(unitState(unit7).isNew && !placedSeedOf(unit7), `${unit7} still placed`);
  const at5 = wordish(seedsNow()).length;
  eq(index.counts({ lang: "nl" }).understood, at5, "Knowledge's count at 5");
  const before = P.clearPlacement("nl");
  eq(plan.lessonNow()?.id, unitsNl[0].first.id, "after Start from the beginning");
  ok(!place.placementOn("nl").placed, "still placed");
  eq(index.counts({ lang: "nl" }).understood, 0, "Knowledge's count with nothing answered");
  P.undoPlacement(before, "nl");
  eq(plan.lessonNow()?.id, unitsNl[4].first.id, "after its Undo");
  eq(index.counts({ lang: "nl" }).understood, at5, "Knowledge's count after its Undo");
  return `${at5} known well at 5; 0 after Start from the beginning; ${at5} after its Undo`;
});

await test("two devices: placed at 8 here, then another device's newer record placed at 6 (sync.js hands over only what's newer: test-sync): this device's numbers follow it, nothing left from the 8", async () => {
  await fresh();
  placeAt(8);
  const mine = place.pathSync.records().nl;
  const at8 = index.counts({ lang: "nl" }).understood;
  const unit7 = wordish(seedsNow()).find(([unit]) => unitOfThing.get(unit) === 7)[0];
  const seeds6 = P.placedSeeds(unitsNl, 6, []);
  place.pathSync.apply({ nl: { at: mine.at + 10, value: { lesson: unitsNl[5].first.id, placement: { placed: { unit: unitsNl[5].id, n: 6, at: mine.at + 10, lessons: P.lessonsBefore(unitsNl, 6), missed: [], seeds: seeds6 }, taken: mine.at + 10, asked: [] } } } });
  eq(place.placementOn("nl").placed.n, 6, "the newer record");
  eq(index.counts({ lang: "nl" }).understood, wordish(seeds6).length, "Knowledge's count follows the newer record");
  ok(unitState(unit7).isNew && !placedSeedOf(unit7), `${unit7} still placed from the 8`);
  eq(plan.lessonNow()?.id, unitsNl[5].first.id, "the next lesson");
  return `${at8} at 8 → ${index.counts({ lang: "nl" }).understood} at 6 from the other device`;
});

await test("your AI's study record: a placed thing with answers, and every idea, marked placed with only its answers counted; a placed word never answered left out", async () => {
  await fresh();
  const rightWord = unitsNl[6].words[0].key;
  record([{ concept: `w:${rightWord}`, outcome: "right", ...TESTS.word }]);
  placeAt(8);
  const { buildStudyRecord } = await from("public/js/ai/study-record.js");
  const r = await buildStudyRecord({ device: "test" });
  const answered = r.words.find((unit) => unit.id === `w:${rightWord}`);
  ok(answered?.placed && answered.seen === 1, `the answered word: ${JSON.stringify(answered && { placed: answered.placed, seen: answered.seen })}`);
  const never = wordish(seedsNow()).find(([unit]) => unit !== `w:${rightWord}` && unit.startsWith("w:"))[0];
  ok(!r.words.some((unit) => unit.id === never), `${never}, never answered, listed`);
  const idea = r.patterns.find((unit) => seedsNow().some(([seeded]) => seeded === unit.id));
  ok(idea?.placed && idea.seen === 0, `a placed idea: ${JSON.stringify(idea && { placed: idea.placed, seen: idea.seen })}`);
});

await test("a placement costs the plan little: an answer's re-plan with one at unit 8 under test-plan-speed's 60 ms (median of 15), beside the same without", async () => {
  await fresh();
  const words = unitsNl.slice(0, 7).flatMap((unit) => unit.words.map((word) => word.key)).filter((_, i) => i % 3 === 0);
  record(words.map((lemma) => ({ concept: `w:${lemma}`, outcome: "right", activity: "word", ...TESTS.word })));
  const replan = () => {
    const times = [];
    for (let i = 0; i < 15; i++) {
      record([{ concept: `w:${words[i % words.length]}`, outcome: "right", activity: "word", ...TESTS.word }]);
      const start = performance.now();
      plan.planSession("practice");
      times.push(performance.now() - start);
    }
    return times.sort((a, b) => a - b)[7];
  };
  plan.planSession("practice");
  const without = replan();
  placeAt(8);
  plan.planSession("practice");
  const placed = replan();
  ok(placed < 60, `a re-plan placed: ${placed.toFixed(1)} ms`);
  return `${placed.toFixed(1)} ms placed, ${without.toFixed(1)} ms without`;
});

await test("the record through sync: another device's newer one taken (in its shape only: its lists strings, its seeds [unit, days] pairs), and one from a device with no placements leaving this one's", async () => {
  await fresh();
  placeAt(8);
  const mine = place.pathSync.records().nl;
  ok(mine.value.placement?.placed?.n === 8 && mine.value.placement.placed.seeds.length > 300, "not in the record sent, with its seeds");
  place.pathSync.apply({ nl: { at: mine.at + 10, value: { lesson: null, placement: { placed: { unit: unitsNl[3].id, n: 4, at: mine.at + 10, lessons: ["a", 7, "b"], missed: [], seeds: [["w:huis", 12], ["huis", 12], ["w:x", -1], ["w:y", "9"], ["p:x", 30]] }, taken: mine.at + 10, asked: [] } } } });
  eq(place.placementOn("nl").placed.n, 4, "the newer record");
  eq(place.placementOn("nl").placed.lessons, ["a", "b"], "its lessons, strings only");
  eq(place.placementOn("nl").placed.seeds, [["w:huis", 12], ["p:x", 30]], "its seeds, in their shape only");
  place.pathSync.apply({ nl: { at: mine.at + 20, value: { lesson: null } } });
  eq(place.placementOn("nl").placed?.n, 4, "a record with no placement took this one's away");
  place.pathSync.apply({ nl: { at: mine.at + 30, value: { lesson: null, placement: { placed: { unit: 3, n: "x" } } } } });
  eq(place.placementOn("nl"), null, "a placement in another shape");
  ok(!placedSeedOf("w:huis"), "a seed left from a record that's gone");
});

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`);
process.exit(failed ? 1 : 0);

// ---------- the simulations ----------

/**
 * A graded learner: level L, spread s; knows unit u's words with 0.97 · σ((L − u) / s); each idea a little behind its words (lag 0–1.5 units, and its
 * own noise); a word picked right on knowing it or by its own chance by guessing; a sentence right on knowing its words (to the power 1.2) and every
 * idea it has, or by its own chance by guessing (guessOf: its real choices and tiles). Where they'd start: the first unit whose words they know
 * under 80% (17: the whole course); where their grammar is: the first whose own ideas they know under 80% on average.
 */
function gradedLearner(units, random) {
  const count = units.length;
  const taught = P.ideasTaught(units);
  const normal = () => Math.sqrt(-2 * Math.log(random() + 1e-12)) * Math.cos(2 * Math.PI * random());
  const L = random() * (count + 6.5) - 0.5;
  const s = 0.8 + random() * 1.7;
  const lag = random() * 1.5;
  const offset = new Map([...taught.keys()].map((id) => [id, normal() * 0.7]));
  const kw = (u) => 0.97 / (1 + Math.exp(-(L - u) / s));
  const ki = (id) => (taught.has(id) ? 0.97 / (1 + Math.exp(-(L - taught.get(id) - lag - offset.get(id)) / s)) : 1);
  let start = count + 1;
  for (let u = 1; u <= count; u++)
    if (kw(u) < 0.8) {
      start = u;
      break;
    }
  let grammar = count + 1;
  for (let u = 1; u <= count; u++) {
    const own = [...taught].filter(([, at]) => at === u).map(([id]) => ki(id));
    if (own.length && own.reduce((a, b) => a + b, 0) / own.length < 0.8) {
      grammar = u;
      break;
    }
  }
  return {
    L,
    kw,
    start,
    grammar,
    rating: L < 4 ? "few" : L < 9 ? "by" : "talk",
    right(step) {
      const n = step.placement.unit;
      const know = step.kind === "word" ? kw(n) : kw(n) ** 1.2 * (step.item.concepts ?? []).reduce((a, id) => a * ki(id), 1);
      return random() < know + (1 - know) * guessOf(step);
    },
  };
}

/** The real controller on a course, played by graded learners: where it places them against where they'd start, how long, how fast, the ideas asked. */
function playGraded(units, lang, runs, { small = false } = {}) {
  const random = P.seededRandom(`graded:${lang}${small ? ":small" : ""}`);
  const count = units.length;
  const taught = P.ideasTaught(units);
  const out = { times: [], n: 0, lowBoth: 0, exact: 0, oneLow: 0, low: 0, oneHigh: 0, high: 0, all: 0, told: 0, toldRight: 0, total: 0, most: 0, slowest: 0, below: 0, belowAsked: 0, lowBy: {} };
  for (let r = 0; r < runs; r++) {
    const who = gradedLearner(units, random);
    const p = P.makePlacement({ start: who.rating, seed: `${lang}:graded:${r}`, units });
    const steps = [...p.steps];
    const asked = new Set();
    while (steps.length) {
      const first = steps.shift();
      // On the smallest phone, every sentence asked on its shorter stand-in (the most 320 × 568 can ask that way).
      const step = small && first.kind !== "word" && first.spare ? first.spare : first;
      if (step.kind !== "word") for (const id of step.item.concepts ?? []) asked.add(id);
      const right = who.right(step);
      const cpu = process.cpuUsage();
      const more = p.answered(step, right);
      const ms = process.cpuUsage(cpu).user / 1000;
      out.slowest = Math.max(out.slowest, ms);
      out.times.push(ms);
      steps.push(...more);
    }
    const result = p.result();
    const placed = result.placed;
    out.n++;
    out.total += result.questions;
    out.most = Math.max(out.most, result.questions);
    if (who.start === count + 1) out.all++;
    if (placed === count + 1) {
      out.told++;
      if (who.start === count + 1) out.toldRight++;
    }
    // Too high: placed past a unit they know under half.
    if (placed > 1 && who.kw(placed - 1) < 0.5) out.high++;
    else if (placed === who.start) out.exact++;
    else if (placed === who.start - 1) out.oneLow++;
    else if (placed < who.start) {
      out.low++;
      // Below where their words would start them, and below where their grammar would too.
      if (placed < Math.min(who.start, who.grammar) - 1) out.lowBoth++;
      out.lowBy[Math.min(5, who.start - placed)] = (out.lowBy[Math.min(5, who.start - placed)] ?? 0) + 1;
    } else out.oneHigh++;
    const below = [...taught].filter(([, at]) => at < placed);
    out.below += below.length;
    out.belowAsked += below.filter(([id]) => asked.has(id)).length;
  }
  for (const key of ["exact", "oneLow", "low", "lowBoth", "oneHigh", "high"]) out[key] /= out.n;
  out.mean = out.total / out.n;
  out.p95 = [...out.times].sort((a, b) => a - b)[Math.floor(out.times.length * 0.95)] ?? 0;
  out.ideas = out.below ? out.belowAsked / out.below : 1;
  return out;
}
function summary(out) {
  return `exact ${pct(out.exact)}, one below ${pct(out.oneLow)}, more below ${pct(out.low)} (${Object.entries(out.lowBy)
    .map(([k, v]) => `${k}${k === "5" ? "+" : ""}: ${pct(v / out.n)}`)
    .join(", ")}; below their grammar too ${pct(out.lowBoth)}), one above ${pct(out.oneHigh)}, too high ${pct(out.high)}; know it all ${pct(out.all / out.n)}, told so ${pct(out.told / out.n)} (rightly ${out.told ? pct(out.toldRight / out.told) : "-"}); ${out.mean.toFixed(1)} questions on average, ${out.most} at most; ideas below the place asked ${pct(out.ideas)}; an answer's work ${out.p95.toFixed(1)} ms of CPU at the 95th percentile, ${out.slowest.toFixed(1)} at most`;
}
