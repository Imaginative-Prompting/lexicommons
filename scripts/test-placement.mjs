// Find your level (study/placement.js) in plain Node, on every full course's real path (packs/path-<lang>.json):
//   - each unit's pool: words with a meaning and sentences readable by the unit's end, short enough to ask as tiles; a unit's block five
//     questions from that unit alone (two words, two sentences built in English, one put in order), none twice in a test, the same seed the
//     same test, and a retake drawing other sentences;
//   - the search: a unit shown with 4 of its 5, or 3 then both of 2 more; up 4 units at a time, then halving; at most 6 units; placed at the
//     first unit not shown; its bar (progress: settled of the most it could still try) never going back and full only at its end;
//   - how sure: the real controller played by simulated learners on each course (know units 1..k, right 9 times in 10 there, past it guessing
//     at each step's own chance, worked out from its real choices and tiles), and the same rules on a larger model run: placed exactly at k+1
//     at least 90% of the time, too high at most 1%, never two or more too high, knowing nothing at the beginning at least 99%; guessing alone
//     showing a unit under 1 time in 1,000; a planted 3-of-5 rule failing the too-high bound (its control);
//   - what a placement leaves (Dutch): the lessons before its unit done ("placed" on the path), the next lesson its unit's first, that unit's
//     sentences readable with the words before it assumed, those words never counted (Knowledge, Home's tiles) nor due, Practice asking at most
//     3 of them by themselves and never as a card, a word missed in it new; taken again lower, the units above it back; Start from the
//     beginning and its Undo; the record through sync, newest wins, and a record from a device with no placements leaving this one's.
// Usage: node scripts/test-placement.mjs [<app dir>] [--trials <n>]   (exit 0 = pass)
// <app dir>: another copy's modules on these packs, to see it fail on one from before.
import "./fixtures/library-grammar.mjs";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const trialsAt = argv.indexOf("--trials");
const TRIALS = trialsAt >= 0 ? Number(argv[trialsAt + 1]) : 100;
const other = argv.filter((arg, i) => !arg.startsWith("--") && argv[i - 1] !== "--trials");
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

const MODEL = {}; // lang → { word, translate, arrange } mean chances, for the model run

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

  await test(`${lang}: a unit's block is five questions from that unit alone, in turn (word, translate, arrange, translate, word), none twice in a test; the same seed the same test; a retake draws other sentences`, () => {
    const one = P.makePlacement({ start: "by", seed: "a", units });
    const again = P.makePlacement({ start: "by", seed: "a", units });
    const kinds = one.steps.map((step) => step.kind);
    eq(kinds, P.PLACEMENT.block, "the first block");
    ok(one.steps.every((step) => step.placement.unit === P.STARTS.by), "a step from another unit");
    eq(again.steps.map((step) => step.item?.id ?? step.target), one.steps.map((step) => step.item?.id ?? step.target), "the same seed");
    // A whole test: every question once.
    const seen = new Set();
    let steps = [...one.steps];
    for (let guard = 0; guard < 60 && steps.length; guard++) {
      const step = steps.shift();
      const key = step.item?.id ?? `w:${step.target}`;
      ok(!seen.has(key), `${key} asked twice`);
      seen.add(key);
      steps.push(...one.answered(step, true));
    }
    ok(one.done, "a test that never ended");
    const retake = P.makePlacement({ start: "by", seed: "b", units, avoid: one.result().asked });
    const firstSentences = new Set(one.result().asked);
    const overlap = retake.steps.filter((step) => step.item && firstSentences.has(step.item.id)).length;
    eq(overlap, 0, "a retake's first block asking the last test's sentences");
  });

  await test(`${lang}: a sentence too tall for a small screen asked another way: first the same question on one of the unit's shortest sentences of 4 tiles or more (by guessing under 1 in 20), then a word of the unit by itself; all drawn with the block, none asked twice`, () => {
    let worst = 0;
    let small = 0;
    let big = 0;
    const tilesOf = (one) => (one.kind === "arrange" ? one.item.words.length : one.answer.length);
    const lengthOf = (one) => (one.kind === "arrange" ? one.item.words.map(([text]) => text).join(" ") : one.item.means).length;
    for (let s = 0; s < 20; s++) {
      const p = P.makePlacement({ start: "few", seed: `instead:${s}`, units });
      // Played through by someone who knows it all, so every unit it climbs to has its stand-ins looked at.
      const all = [...p.steps];
      for (let i = 0; i < all.length && !p.done; i++) all.push(...p.answered(all[i], true));
      p.steps.splice(0, p.steps.length, ...all);
      for (const step of p.steps.filter((one) => one.kind !== "word")) {
        const short = step.spare;
        ok(short && short.kind === step.kind && short.placement.unit === step.placement.unit, `${step.kind}'s stand-in: ${JSON.stringify(short && { kind: short.kind, unit: short.placement?.unit })}`);
        ok(short.item.id !== step.item.id, "its stand-in the same sentence");
        ok(tilesOf(short) >= P.PLACEMENT.leastShort, `a stand-in of ${tilesOf(short)} tiles`);
        // Small enough for 320 × 568 where the unit has one (its sentence on one line of the card, its tiles in two rows): a stand-in that's too
        // tall too drops to a word, 1 in 3 by guessing.
        const dutch = short.item.words.map(([text]) => text).join(" ").length;
        const fits = short.kind === "arrange" ? dutch <= 35 : dutch <= 26 && short.tiles.length <= 8;
        // (Its bank counted without making it, as made.)
        if (short.kind === "translate") ok(short.tiles.length === short.answer.length + (short.also ? short.also.filter((w, i, all) => all.slice(0, i + 1).filter((x) => x === w).length > short.answer.filter((x) => x === w).length).length : 0) + (short.answer.length <= 3 ? 1 : 2), `a stand-in's bank counted wrong: ${short.tiles.length} tiles`);
        if (fits) small++;
        else big++;
        worst = Math.max(worst, guessOf(short));
        const word = short.spare;
        ok(word && word.kind === "word" && word.placement.unit === step.placement.unit, "the stand-in's own stand-in isn't a word of the unit");
        ok(p.instead(step) === short && p.instead(short) === word, "instead isn't the stand-ins drawn with the block (their drawings fetched with the block's)");
      }
      const asked = [...p.steps, ...p.steps.flatMap((one) => [one.spare, one.spare?.spare])].filter(Boolean).map((one) => one.item?.id ?? one.target);
      ok(new Set(asked).size === asked.length, "a question and a stand-in the same");
    }
    ok(worst < 1 / 20, `a stand-in's chance by guessing: 1 in ${Math.round(1 / worst)}`);
    ok(small / (small + big) >= 0.8, `stand-ins small enough for 320 × 568: ${small} of ${small + big}`);
    return `the likeliest stand-in by guessing: 1 in ${Math.round(1 / worst)}; small enough for 320 × 568: ${small} of ${small + big}`;
  });

  // Each kind's chance by guessing, from many real draws.
  const chances = { word: [], translate: [], arrange: [] };
  for (let s = 0; s < 40; s++) for (const unit of units) for (const step of P.unitSteps(unit, P.PLACEMENT.block, P.seededRandom(`${lang}:${s}:${unit.n}`))) chances[step.kind].push(guessOf(step));
  const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  MODEL[lang] = { word: mean(chances.word), translate: mean(chances.translate), arrange: mean(chances.arrange), worst: { translate: Math.max(...chances.translate), arrange: Math.max(...chances.arrange) } };

  await test(`${lang}: guessing alone shows a unit under 1 time in 1,000 (from the real choices: words ${pct(MODEL[lang].word)}, What does it say? ${pct(MODEL[lang].translate)}, Put it in order ${pct(MODEL[lang].arrange)})`, () => {
    const p = { word: MODEL[lang].word, translate: MODEL[lang].translate, arrange: MODEL[lang].arrange };
    const shown = blockChance(P.PLACEMENT.block.map((kind) => p[kind]), P.PLACEMENT.extra.map((kind) => p[kind]));
    ok(shown < 0.001, `shown by guessing ${(shown * 100).toFixed(3)}%`);
    return `about 1 in ${Math.round(1 / shown).toLocaleString()}`;
  });

  await test(`${lang}: the real controller, played by simulated learners (${TRIALS} a level): exactly k+1 at least 90%, too high at most 1%, never two too high, knowing nothing at the beginning`, () => {
    const out = playLearners(units, lang, TRIALS);
    ok(out.exact >= 0.9, `exact ${pct(out.exact)}`);
    ok(out.high <= 0.01 && out.high2 === 0, `too high ${pct(out.high)}, two or more ${pct(out.high2)}`);
    ok(out.none >= 0.99, `knowing nothing: from the beginning ${pct(out.none)}`);
    // At most 6 units, each 5 questions and 2 more on a close call.
    ok(out.most <= P.PLACEMENT.mostTried && out.questions <= P.PLACEMENT.mostTried * (P.PLACEMENT.block.length + P.PLACEMENT.extra.length), `units ${out.most}, questions ${out.questions} at most`);
    return `exact ${pct(out.exact)}, one low ${pct(out.low)}, too high ${pct(out.high)}, knowing nothing ${pct(out.none)}, all of it ${pct(out.all)}; ${out.mean.toFixed(1)} questions on average, ${out.questions} at most`;
  });

  await test(`${lang}: the same on a 320 × 568 phone, every sentence asked on its shorter stand-in: the same bounds`, () => {
    const out = playLearners(units, lang, TRIALS, { small: true });
    ok(out.exact >= 0.9, `exact ${pct(out.exact)}`);
    ok(out.high <= 0.01 && out.high2 === 0, `too high ${pct(out.high)}, two or more ${pct(out.high2)}`);
    ok(out.none >= 0.99, `knowing nothing: from the beginning ${pct(out.none)}`);
    return `exact ${pct(out.exact)}, one low ${pct(out.low)}, too high ${pct(out.high)}, knowing nothing ${pct(out.none)}, all of it ${pct(out.all)}`;
  });
}

// ---------- the search's rules, by themselves ----------

await test("a unit's verdict: 4 of 5 shown, 3 asks 2 more (both right shows it), 2 or fewer not", () => {
  const T = true;
  const F = false;
  eq(P.verdictOf([T, T, T, T]), null, "four answers");
  eq(P.verdictOf([T, T, T, T, F]), "shown");
  eq(P.verdictOf([T, F, T, F, T]), "more");
  eq(P.verdictOf([T, F, T, F, T, T]), "more", "one of the two more in");
  eq(P.verdictOf([T, F, T, F, T, F]), "not", "the first of the two more missed");
  eq(P.verdictOf([T, F, T, F, T, T, T]), "shown");
  eq(P.verdictOf([T, F, T, F, T, T, F]), "not");
  eq(P.verdictOf([T, F, F, F, T]), "not");
});

await test("the search: up 4 while shown, then halving; at most 6 units; placed at the first not shown; a unit not shown below one shown wins", () => {
  let s = P.searchStart(16, 2);
  s = P.settle(s, 2, true);
  eq(s.at, 6);
  s = P.settle(s, 6, true);
  eq(s.at, 10);
  s = P.settle(s, 10, false);
  eq(s.at, 8);
  s = P.settle(s, 8, true);
  eq(s.at, 9);
  s = P.settle(s, 9, false);
  ok(s.done, "not done when 8 shown and 9 not");
  eq(P.placedAt(s), 9);
  let none = P.settle(P.searchStart(16, 2), 2, false);
  none = P.settle(none, 1, false);
  ok(none.done && P.placedAt(none) === 1, `knowing nothing: ${P.placedAt(none)}`);
  let all = P.searchStart(16, 9);
  for (let i = 0; i < 6 && !all.done; i++) all = P.settle(all, all.at, true);
  ok(all.done && P.placedAt(all) === 17, `all of it: ${P.placedAt(all)} (${JSON.stringify(all.tried)})`);
});

await test("its bar never goes back and is full only at its end, whatever the answers (every way through from every start)", () => {
  let ways = 0;
  const walk = (state, last) => {
    const settled = state.tried.length;
    const most = settled + P.mostLeft(state);
    const share = settled / most;
    ok(share + 1e-9 >= last, `went back: ${last} → ${share} at ${JSON.stringify(state.tried)}`);
    if (state.done) {
      ways++;
      ok(share === 1, `ended at ${share}`);
      return;
    }
    ok(share < 1, `full before its end at ${JSON.stringify(state.tried)}`);
    ok(state.tried.length < P.PLACEMENT.mostTried, "past the most units");
    walk(P.settle(state, state.at, true), share);
    walk(P.settle(state, state.at, false), share);
  };
  for (const start of Object.values(P.STARTS)) walk(P.searchStart(16, start), 0);
  return `${ways} ways through`;
});

// ---------- how sure, on a larger run of the same rules ----------

const MODEL_RUNS = 20000;
await test(`the same rules on ${MODEL_RUNS.toLocaleString()} simulated learners a level, with each course's own chances by guessing: exactly k+1 at least 90%, too high at most 1%`, () => {
  const lines = [];
  for (const lang of COURSES) {
    const out = modelRun(MODEL[lang], { runs: MODEL_RUNS, need: P.PLACEMENT.need });
    ok(out.exact >= 0.9 && out.high <= 0.01 && out.high2 === 0 && out.none >= 0.99, `${lang}: ${JSON.stringify(out)}`);
    lines.push(`${lang} ${pct(out.exact)} exact, ${pct(out.high)} high`);
  }
  // A ragged edge (half of unit k+1 known): what Practice's checks are for, said, not bounded.
  const ragged = modelRun(MODEL.nl, { runs: MODEL_RUNS, need: P.PLACEMENT.need, edge: 0.5 });
  return `${lines.join("; ")}; Dutch with half the next unit known: past it ${pct(ragged.high)}`;
});

await test("its control: the same run with a unit shown on 2 of 5 (its two words by luck, 1 time in 9) places too many too high", () => {
  const out = modelRun(MODEL.nl, { runs: MODEL_RUNS, need: 2 });
  ok(out.high > 0.01, `too high only ${pct(out.high)} with 2 of 5`);
  return `too high ${pct(out.high)}`;
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

await test("placed at unit 8: the lessons before it done (placed on the path), the next lesson unit 8's first, nothing counted, nothing due", async () => {
  await fresh();
  const before = knownNow();
  placeAt(8);
  eq(plan.lessonNow()?.id, unitsNl[7].first.id, "the next lesson");
  const path = plan.pathOverview(400).lessons;
  const before8 = path.filter((lesson) => unitsNl.slice(0, 7).some((unit) => unit.lessons.some((one) => one.id === lesson.id)));
  ok(before8.length > 80 && before8.every((lesson) => lesson.state === "done"), `lessons before unit 8 not done: ${before8.filter((l) => l.state !== "done").map((l) => l.id).slice(0, 3)}`);
  ok(before8.filter((lesson) => !lesson.full).every((lesson) => lesson.doing === "placed"), "a placed lesson not said to be placed");
  eq(knownNow(), before, "Knowledge's words after a placement with no answers");
  const unit1 = unitsNl[0].lessons[0].things.find((thing) => thing.lemma);
  ok(unitState(unit1.unit).isNew && !unitState(unit1.unit).due, `${unit1.lemma} isn't new, or is due`);
});

await test("its unit's lessons play whole (unit 8's first asks sentences); and Practice asks the units it placed you past in sentences, which it can't with nothing assumed (the control: the same right answers, the placement taken back)", async () => {
  await fresh();
  const right = [unitsNl[5].words[0].key, unitsNl[6].words[1].key, unitsNl[6].words[2].key];
  placeAt(8, { right });
  const lesson = plan.planSession("lesson", unitsNl[7].first.id);
  const sentencesIn = (p) => p.steps.filter((step) => step.item).length;
  ok(sentencesIn(lesson) >= 6, `unit 8's first lesson: ${sentencesIn(lesson)} sentence steps in ${lesson.steps.length}`);
  const placed = plan.planSession("practice");
  P.clearPlacement("nl");
  const control = plan.planSession("practice");
  ok(sentencesIn(placed) >= 6, `placed, Practice asks ${sentencesIn(placed)} sentences in ${placed.steps.length} steps`);
  ok(sentencesIn(control) < sentencesIn(placed), `with nothing assumed Practice asks ${sentencesIn(control)} sentences, placed ${sentencesIn(placed)}`);
  return `unit 8's lesson ${sentencesIn(lesson)} sentence steps; Practice ${sentencesIn(placed)} sentences placed, ${sentencesIn(control)} with nothing assumed`;
});

await test("right answers in it count as any first answer (never 'well'); Practice asks at most 3 assumed words, by themselves and never as a card; a word missed in it is new, not assumed", async () => {
  await fresh();
  const missedWord = unitsNl[2].words[0].key;
  const rightWords = [unitsNl[5].words[0].key, unitsNl[6].words[1].key];
  placeAt(8, { missed: [missedWord], right: rightWords });
  const k = knowledge({ lang: "nl" });
  ok(k.kinds.word.started === rightWords.length, `started ${k.kinds.word.started}`);
  const { understood } = await from("public/js/know/summary.js");
  ok(!rightWords.some((lemma) => understood(`w:${lemma}`)), "a word right once in it is 'known well'");
  const practice = plan.planSession("practice");
  const assumedAsked = practice.steps.filter((step) => step.unit && ["word", "see"].includes(step.kind) && unitState(step.unit).isNew && !rightWords.includes(step.target));
  ok(assumedAsked.length >= 1 && assumedAsked.length <= plan.ASSUMED_CHECKS, `assumed words asked: ${assumedAsked.length}`);
  ok(!practice.steps.some((step) => step.kind === "card" && step.target && unitState(`w:${step.target}`).isNew), "an assumed word as a card");
  ok(!practice.steps.some((step) => step.target === missedWord), "the missed word asked as if known");
  return `${practice.steps.length} steps, ${assumedAsked.length} of them assumed words`;
});

await test("taken again lower (8, then 5): units 5 to 7 back, not done; Start from the beginning: lesson 1 next and nothing placed; its Undo puts unit 5 back", async () => {
  await fresh();
  placeAt(8);
  placeAt(5);
  eq(plan.lessonNow()?.id, unitsNl[4].first.id, "the next lesson after the lower one");
  const path = plan.pathOverview(400).lessons;
  const unit6 = path.filter((lesson) => unitsNl[5].lessons.some((one) => one.id === lesson.id));
  ok(unit6.every((lesson) => lesson.state !== "done"), "unit 6 still done");
  const before = P.clearPlacement("nl");
  eq(plan.lessonNow()?.id, unitsNl[0].first.id, "after Start from the beginning");
  ok(!place.placementOn("nl").placed, "still placed");
  P.undoPlacement(before, "nl");
  eq(plan.lessonNow()?.id, unitsNl[4].first.id, "after its Undo");
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

await test("the record through sync: another device's newer one taken (in its shape only), and one from a device with no placements leaving this one's", async () => {
  await fresh();
  placeAt(8);
  const mine = place.pathSync.records().nl;
  ok(mine.value.placement?.placed?.n === 8, "not in the record sent");
  place.pathSync.apply({ nl: { at: mine.at + 10, value: { lesson: null, placement: { placed: { unit: unitsNl[3].id, n: 4, at: mine.at + 10, lessons: ["a", 7, "b"], missed: [] }, taken: mine.at + 10, asked: [] } } } });
  eq(place.placementOn("nl").placed.n, 4, "the newer record");
  eq(place.placementOn("nl").placed.lessons, ["a", "b"], "its lessons, strings only");
  place.pathSync.apply({ nl: { at: mine.at + 20, value: { lesson: null } } });
  eq(place.placementOn("nl").placed?.n, 4, "a record with no placement took this one's away");
  place.pathSync.apply({ nl: { at: mine.at + 30, value: { lesson: null, placement: { placed: { unit: 3, n: "x" } } } } });
  eq(place.placementOn("nl"), null, "a placement in another shape");
});

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`);
process.exit(failed ? 1 : 0);

// ---------- the simulations ----------

/** A block's chance of showing a unit: P(at least need of the block) plus P(exactly close, then every extra). */
function blockChance(block, extra, need = P.PLACEMENT.need, close = P.PLACEMENT.close) {
  let atLeast = 0;
  let exactly = 0;
  const n = block.length;
  for (let mask = 0; mask < 1 << n; mask++) {
    let p = 1;
    let right = 0;
    for (let i = 0; i < n; i++) {
      const r = (mask >> i) & 1;
      right += r;
      p *= r ? block[i] : 1 - block[i];
    }
    if (right >= need) atLeast += p;
    else if (right === close) exactly += p;
  }
  return atLeast + exactly * extra.reduce((a, b) => a * b, 1);
}

/** The real controller on a course, played by simulated learners at each level. */
function playLearners(units, lang, trials, { small = false } = {}) {
  const random = P.seededRandom(`learners:${lang}${small ? ":small" : ""}`);
  let exact = 0;
  let low = 0;
  let high = 0;
  let high2 = 0;
  let none = 0;
  let all = 0;
  let questions = 0;
  let total = 0;
  let count = 0;
  let most = 0;
  for (let k = 0; k <= units.length; k++) {
    const start = k <= 3 ? "few" : k <= 8 ? "by" : "talk";
    for (let t = 0; t < trials; t++) {
      const p = P.makePlacement({ start, seed: `${lang}:${k}:${t}`, units });
      let steps = [...p.steps];
      let asked = 0;
      while (steps.length) {
        const asked1 = steps.shift();
        // On the smallest phone, every sentence asked on its shorter stand-in (the most 320 × 568 can ask that way).
        const step = small && asked1.kind !== "word" && asked1.spare ? asked1.spare : asked1;
        const right = random() < (step.placement.unit <= k ? 0.9 : guessOf(step));
        asked++;
        steps.push(...p.answered(step, right));
      }
      const r = p.result();
      const d = r.placed - (k + 1);
      questions = Math.max(questions, asked);
      most = Math.max(most, r.tried);
      total += asked;
      count++;
      if (k === 0) none += d === 0 ? 1 : 0;
      else if (k === units.length) all += d === 0 ? 1 : 0;
      else {
        if (d === 0) exact++;
        if (d < 0) low++;
        if (d > 0) high++;
        if (d > 1) high2++;
      }
    }
  }
  const mid = trials * (units.length - 1);
  return { exact: exact / mid, low: low / mid, high: high / mid, high2: high2 / mid, none: none / trials, all: all / trials, mean: total / count, questions, most };
}

/** The search's own rules (P.settle, P.verdictOf) on learners whose answers are drawn by a kind's chance: a larger run than the real controller's. */
function modelRun(chance, { runs, need, edge = null }) {
  const random = P.seededRandom(`model:${need}:${edge}`);
  const verdict = (answers) => {
    const right = answers.slice(0, 5).filter(Boolean).length;
    if (right >= need) return "shown";
    if (right !== need - 1) return "not";
    return answers.length < 7 ? "more" : answers.slice(5).every(Boolean) ? "shown" : "not";
  };
  const block = P.PLACEMENT.block;
  const extra = P.PLACEMENT.extra;
  let exact = 0;
  let high = 0;
  let high2 = 0;
  let none = 0;
  let mid = 0;
  for (let k = 0; k <= 16; k++) {
    const start = k <= 3 ? P.STARTS.few : k <= 8 ? P.STARTS.by : P.STARTS.talk;
    const per = Math.max(1, Math.round(runs / 17));
    for (let t = 0; t < per; t++) {
      let s = P.searchStart(16, start);
      while (!s.done) {
        const u = s.at;
        const answer = (kind) => random() < (u <= k ? 0.9 : edge !== null && u === k + 1 ? edge : chance[kind]);
        const answers = block.map(answer);
        let v = verdict(answers);
        if (v === "more") {
          answers.push(...extra.map(answer));
          v = verdict(answers);
        }
        s = P.settle(s, u, v === "shown");
      }
      const d = P.placedAt(s) - (k + 1);
      if (k === 0) none += d === 0 ? 1 : 0;
      else if (k < 16) {
        mid++;
        if (d === 0) exact++;
        if (d > 0) high++;
        if (d > 1) high2++;
      }
    }
  }
  return { exact: exact / mid, high: high / mid, high2: high2 / mid, none: none / Math.max(1, Math.round(runs / 17)) };
}
