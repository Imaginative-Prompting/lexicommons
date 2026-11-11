// The word index (know/word-index.js), in Node, on the sample learner's year (study/sample-learner.js, from the real Dutch path and word packs):
//   - what it says equals what the evidence says worked out from scratch (unitState at each moment, the rule as it was in summary.js before
//     the index, and strengthsOver for Over time), now, days and months on (words lapse), after answers, after a sync's rows from before,
//     after a clear and its Undo, and from a kept snapshot; every comparison is shown first to have something to find (the truth changes
//     between them), and a stretch planted a millisecond off is caught;
//   - an answer works out again only the units it touched, a snapshot is used only while the evidence is the same, and a stale one never;
//   - scheduler.js knownUntil is the exact millisecond strengthAt's known turns false, on every card of the year;
//   - its cost: a year-in learner's reads under 5 ms, an answer's update under 2 ms (each the quickest of 20, with the median), against what
//     it replaces.
// node scripts/test-word-index.mjs --list <frequency.nl.json>   (exit 0 = pass)

// Dutch's grammar as the library has it, first: packs/path-nl.json uses its later patterns (scripts/fixtures/library-grammar.mjs).
import "./fixtures/library-grammar.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const DAY = 86_400_000;
const listAt = process.argv.indexOf("--list");
if (listAt < 0) {
  console.error("Usage: node scripts/test-word-index.mjs --list <frequency.nl.json>");
  process.exit(2);
}

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

const P = await import("../public/js/study/progress.js");
await import("../public/js/study/plan.js");
const content = await import("../public/js/study/content.js");
const { savePack } = await import("../public/js/study/packs.js");
const { useFrequency } = await import("../public/js/study/frequency.js");
const { pathLessons } = await import("../public/js/study/path.js");
const { targetOf } = await import("../public/js/study/new-words.js");
const { setLearning } = await import("../public/js/study/learning.js");
const S = await import("../public/js/study/sample-learner.js");
const { KNOWN_AT, kindOf, knownUntil, recallAt, replay } = await import("../public/js/study/scheduler.js");
const { addWord, inBank } = await import("../public/js/read/bank.js");
const W = await import("../public/js/know/word-index.js");
const summary = await import("../public/js/know/summary.js");

for (const name of readdirSync(join(APP, "packs")).filter((n) => /^(path-nl|words-nl-\d+)\.json$/.test(n)).sort()) {
  const saved = await savePack(JSON.parse(readFileSync(join(APP, "packs", name), "utf8")));
  if (!saved.ok) throw new Error(`${name}: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
}
useFrequency(JSON.parse(readFileSync(process.argv[listAt + 1], "utf8")));
await setLearning?.("nl");
const LANG = "nl";
const course = S.courseOf({ lang: LANG, lessons: pathLessons(), items: content.ITEMS, sentenceUnits: content.sentenceUnits, conceptsOf: content.conceptsOf, targetOf });
const NOW = new Date(2026, 10, 6, 15, 0).getTime();
const year = S.sampleLearner("year", course, { now: NOW });
P.record(year.evidence);
// A few words said known in the reader: one studied, one never.
const studiedWord = P.studiedUnits(LANG).find((unit) => unit.startsWith("w:"));
addWord(LANG, studiedWord.slice(2), { at: NOW - 30 * DAY, quiet: true });
addWord(LANG, "zzbankwoord", { at: NOW - 10 * DAY, quiet: true });

// ---------- the truth, worked out from scratch each time (the rule as summary.js had it before the index) ----------

const INDEXED = /^[wc]:/;
const truthUnderstood = (unit, now) => {
  if (unit.startsWith("w:") && inBank(LANG, unit.slice(2))) return true;
  const read = P.unitState(unit, { lang: LANG, now }).strengths.read;
  return Boolean(read?.known && read.level >= W.UNDERSTOOD_LEVEL);
};
function truthStarted(now) {
  const rows = [];
  for (const unit of P.studiedUnits(LANG)) {
    if (!INDEXED.test(unit)) continue;
    const s = P.unitState(unit, { lang: LANG, now });
    if (s.isNew) continue;
    rows.push({ unit, first: P.unitEvidence(unit, LANG)[0]?.at ?? now, known: truthUnderstood(unit, now) });
  }
  return rows.sort((a, b) => a.first - b.first || (a.unit < b.unit ? -1 : 1));
}
/** Everything the index says at `now`, against the truth: returns how many it understood, or throws on the first difference. */
function same(now, label) {
  const truth = truthStarted(now);
  const index = W.startedWords({ lang: LANG, now });
  ok(index.length === truth.length, `${label}: ${index.length} started, the evidence says ${truth.length}`);
  for (let i = 0; i < truth.length; i++) {
    const a = index[i];
    const b = truth[i];
    ok(a.unit === b.unit && a.first === b.first && a.known === b.known, `${label}: row ${i} ${JSON.stringify(a)}, the evidence says ${JSON.stringify(b)}`);
  }
  for (const unit of P.studiedUnits(LANG)) if (INDEXED.test(unit)) ok(W.isUnderstood(unit, { lang: LANG, now }) === truthUnderstood(unit, now), `${label}: ${unit}`);
  const words = W.knownWords({ lang: LANG, now });
  for (const unit of P.studiedUnits(LANG)) if (unit.startsWith("w:")) ok(words.has(unit.slice(2)) === truthUnderstood(unit, now), `${label}: ${unit} in knownWords`);
  ok(words.has("zzbankwoord"), `${label}: a word bank word you never studied isn't in knownWords`);
  const c = W.counts({ lang: LANG, now });
  const understood = truth.filter((row) => row.known).length;
  ok(c.understood === understood && c.started === truth.length && c.words === words.size, `${label}: counts ${JSON.stringify(c)}, the evidence says ${understood} of ${truth.length}`);
  return understood;
}

// ---------- 1. the scheduler's moment ----------

await test("knownUntil is the exact millisecond a strength stops being known, on every card of the year (each strength after its last answer)", () => {
  let cards = 0;
  let never = 0;
  for (const unit of P.studiedUnits(LANG)) {
    const kind = kindOf(unit);
    if (!kind) continue;
    const reviews = P.unitEvidence(unit, LANG)
      .filter((row) => P.gradeOf(row))
      .map((row) => ({ at: row.at, skill: row.skill, grade: P.gradeOf(row), spoken: row.how === "spoken" || row.activity === "say" }));
    for (const memory of Object.values(replay(unit, reviews).strengths)) {
      const until = knownUntil(kind, memory.card);
      cards++;
      if (!until) {
        never++;
        ok(!(memory.card.stability >= 1) || recallAt(kind, memory.card, +memory.card.last_review) < KNOWN_AT, `${unit}: never known, but it is`);
        continue;
      }
      ok(recallAt(kind, memory.card, until - 1) >= KNOWN_AT && recallAt(kind, memory.card, until) < KNOWN_AT, `${unit}: ${until} isn't where its recall crosses ${KNOWN_AT}`);
    }
  }
  return `${cards.toLocaleString()} cards, ${never} never known`;
});

// ---------- 2. the index against the evidence ----------

const started = P.studiedUnits(LANG).filter((unit) => INDEXED.test(unit)).length;
await test("the year in: the index says what the evidence says, now", () => {
  const n = same(NOW, "now");
  return `${year.evidence.length.toLocaleString()} rows, ${started.toLocaleString()} words and phrases met, ${n.toLocaleString()} understood well`;
});

let lapsed = 0;
await test("days and months on, with no answers: what lapsed has lapsed, and nothing was worked out again", () => {
  const built = W.wordIndexStats();
  const counts = [NOW, NOW + 2 * DAY, NOW + 30 * DAY, NOW + 120 * DAY, NOW + 800 * DAY].map((at, i) => same(at, `+${["0", "2 d", "30 d", "120 d", "800 d"][i]}`));
  ok(counts[0] > counts[2] && counts[2] > counts[3] && counts[3] > counts[4], `nothing lapsed over time, so the comparison found nothing to find: ${counts}`);
  const after = W.wordIndexStats();
  ok(after.built === built.built && after.updated === built.updated, `it worked something out again: ${JSON.stringify([built, after])}`);
  lapsed = counts[0] - counts[3];
  return `understood ${counts.join(" → ")}`;
});

await test("Over time's stretches equal strengthsOver at every point, exact moments and a millisecond either side included; one planted a millisecond late is caught", () => {
  const words = P.studiedUnits(LANG).filter((unit) => INDEXED.test(unit));
  const moments = [...new Set(P.allEvidence().filter((row) => INDEXED.test(row.concept) && P.gradeOf(row)).map((row) => row.at))];
  const pick = [];
  for (let i = 0; i < 60; i++) {
    const m = moments[Math.floor((i * 7919) % moments.length)];
    pick.push(m - 1, m, m + 1, m + 2);
  }
  for (let d = 0; d <= 400; d += 13) pick.push(NOW - 365 * DAY + d * DAY);
  const ats = [...new Set(pick)].sort((a, b) => a - b);
  const truth = P.strengthsOver(words, ats, { lang: LANG, level: W.UNDERSTOOD_LEVEL });
  const index = W.wellOver(ats, { lang: LANG });
  let differ = 0;
  for (let i = 0; i < ats.length; i++) {
    const a = index.read[i];
    const b = truth.read[i];
    ok(a.size === b.size && [...b].every((u) => a.has(u)), `read at ${ats[i]}: ${a.size}, the evidence says ${b.size}`);
    ok(index.hear[i] === truth.hear[i].size && index.say[i] === truth.say[i].size, `hear or say at ${ats[i]}: ${index.hear[i]}, ${index.say[i]} against ${truth.hear[i].size}, ${truth.say[i].size}`);
    if (i && b.size !== truth.read[i - 1].size) differ++;
  }
  ok(differ > 10, `the points hardly differ, so the comparison found little to find: ${differ}`);
  // The plant: every stretch a millisecond late. At the exact moments a word became known well, the counts differ.
  const entries = words.map((unit) => W.wordEntry(unit, { lang: LANG })).filter(Boolean);
  const late = ats.map(() => 0);
  for (const e of entries) for (const [from, to] of e.read?.well ?? []) ats.forEach((at, i) => at >= from + 1 && at < to + 1 && late[i]++);
  ok(late.some((n, i) => n !== truth.read[i].size), "a stretch a millisecond late wasn't caught");
  return `${ats.length} points, ${differ} changes along them; the planted one caught`;
});

await test("Home's chart (recalledOver: a strength you train known, any level) from the kept stretches equals progress.js's, words and with phrases", () => {
  const moments = [...new Set(P.allEvidence().filter((row) => INDEXED.test(row.concept) && P.gradeOf(row)).map((row) => row.at))];
  const pick = [];
  for (let i = 0; i < 40; i++) {
    const m = moments[Math.floor((i * 6151) % moments.length)];
    pick.push(m - 1, m, m + 1);
  }
  for (let d = 0; d <= 400; d += 17) pick.push(NOW - 365 * DAY + d * DAY);
  const ats = [...new Set(pick)].sort((a, b) => a - b);
  for (const phrases of [false, true]) {
    const units = P.studiedUnits(LANG).filter((unit) => unit.startsWith("w:") || (phrases && unit.startsWith("c:")));
    const truth = P.recalledOver(units, ats, { lang: LANG });
    const index = W.recalledOver(ats, { lang: LANG, phrases });
    ats.forEach((at, i) => ok(index[i] === truth[i], `${phrases ? "with phrases" : "words"} at ${at}: ${index[i]}, the evidence says ${truth[i]}`));
  }
  return `${ats.length} points, words and with phrases`;
});

await test("every unit's state (words, phrases and ideas), now and a month on, is unitState's: known, level, due and when, slipping, by strength", () => {
  const units = P.studiedUnits(LANG).filter((unit) => /^[wcp]:/.test(unit));
  let slipping = 0;
  let due = 0;
  for (const now of [NOW, NOW + 30 * DAY]) {
    for (const unit of units) {
      const a = W.stateOf(unit, { lang: LANG, now });
      const b = P.unitState(unit, { lang: LANG, now });
      const pick = (s) => JSON.stringify({ isNew: s.isNew, level: s.level, due: s.due, dueAt: s.dueAt, slipping: s.slipping, kind: s.kind, firstAt: s.firstAt, lastAt: s.lastAt, strengths: Object.fromEntries(Object.entries(s.strengths).map(([k, v]) => [k, v && { known: v.known, level: v.level, due: v.due, dueAt: v.dueAt }])) });
      ok(pick(a) === pick(b), `${unit} at +${(now - NOW) / DAY} d: ${pick(a)}, the evidence says ${pick(b)}`);
      if (b.slipping) slipping++;
      if (b.due) due++;
    }
  }
  ok(slipping > 50 && due > slipping, `little slipping or due, so the comparison found little to find: ${slipping}, ${due}`);
  return `${units.length.toLocaleString()} units (${units.filter((u) => u.startsWith("p:")).length} ideas) twice; ${slipping} slipping, ${due} due`;
});

await test("each unit's level, now and from the evidence before any moment, is unitState's (This week's \"got stronger\")", () => {
  const units = P.studiedUnits(LANG).filter((unit) => INDEXED.test(unit));
  let checked = 0;
  let differ = 0;
  for (let i = 0; i < units.length; i += 7) {
    const unit = units[i];
    ok(W.levelOf(unit, { lang: LANG }) === P.unitState(unit, { lang: LANG, now: NOW }).level, `${unit} now`);
    const rows = P.unitEvidence(unit, LANG).filter((row) => P.gradeOf(row));
    for (const t of [NOW - 7 * DAY, NOW - 90 * DAY, ...rows.slice(0, 4).flatMap((row) => [row.at, row.at + 1])]) {
      const want = P.unitState(unit, { lang: LANG, now: t, until: t }).level;
      ok(W.levelOf(unit, { lang: LANG, before: t }) === want, `${unit} before ${t}: ${W.levelOf(unit, { lang: LANG, before: t })}, the evidence says ${want}`);
      checked++;
      if (want !== W.levelOf(unit, { lang: LANG })) differ++;
    }
  }
  ok(differ > 100, `a unit's level then and now hardly differ, so the comparison found little to find: ${differ}`);
  return `${checked.toLocaleString()} moments, ${differ.toLocaleString()} of them another level than now`;
});

// ---------- 3. kept up to date ----------

const pickUnits = (n, seed) => {
  const all = P.studiedUnits(LANG).filter((unit) => INDEXED.test(unit));
  return Array.from({ length: n }, (_, i) => all[(seed * 7907 + i * 104729) % all.length]);
};
await test("answers: each works out again only the units it touched, and the index still says what the evidence says", () => {
  let at = NOW + 5 * 60_000;
  let touched = 0;
  let moved = 0;
  for (let round = 0; round < 30; round++) {
    const units = [...new Set(pickUnits(1 + (round % 5), round))];
    if (round % 7 === 3) units.push(`w:zzvers${round}`); // a word met for the first time
    const before = W.wordIndexStats();
    const was = units.map((unit) => W.isUnderstood(unit, { lang: LANG, now: at + 1000 }));
    at += 60_000 + round * 1000;
    P.record(units.map((concept, i) => ({ concept, at, lang: LANG, skill: "read", test: "recall", outcome: (round + i) % 4 === 0 ? "wrong" : "right", activity: "practice" })));
    const now = at + 1000;
    for (const unit of units) ok(W.isUnderstood(unit, { lang: LANG, now }) === truthUnderstood(unit, now), `after round ${round}: ${unit}`);
    W.counts({ lang: LANG, now }); // a word in the word bank is answered without the index: this reads it
    const after = W.wordIndexStats();
    ok(after.built === before.built && after.updated - before.updated === units.length, `round ${round}: ${after.updated - before.updated} worked out again for ${units.length} units, ${after.built - before.built} rebuilds`);
    touched += units.length;
    moved += units.filter((unit, i) => W.isUnderstood(unit, { lang: LANG, now }) !== was[i]).length;
  }
  ok(moved > 0, "no answer changed whether a word was understood, so the comparison found nothing to find");
  same(at + 1000, "after the answers");
  return `${touched} units in 30 answers, ${moved} of them changed; everything else as it was`;
});

await test("a sync's rows from before (not at the end): only the units they're for are worked out again, and it says what the evidence says", () => {
  const before = W.wordIndexStats();
  const units = [...new Set(pickUnits(8, 99))];
  const was = same(NOW + 2 * DAY, "before the sync");
  const mid = W.wordIndexStats();
  P.record(units.map((concept, i) => ({ concept, at: NOW - 200 * DAY + i * 3_600_000, lang: LANG, skill: "read", test: "recall", outcome: "right", activity: "practice" })));
  const now = NOW + 2 * DAY;
  const after = same(now, "after the sync");
  const end = W.wordIndexStats();
  ok(end.built === before.built && end.updated - mid.updated === units.length, `${end.updated - mid.updated} worked out again for ${units.length} units, ${end.built - before.built} rebuilds`);
  return `${units.length} units worked out again, nothing else (${was} → ${after} understood)`;
});

await test("an idea a pack makes the same as the shared grammar's (setUnitAliases): the language is worked out again, and every idea's state is unitState's", () => {
  const ideas = P.studiedUnits(LANG).filter((unit) => unit.startsWith("p:"));
  ok(ideas.length >= 2, `${ideas.length} ideas`);
  const [own, shared] = ideas;
  const before = W.wordIndexStats();
  P.setUnitAliases(LANG, { [own]: shared });
  const pick = (s) => s && JSON.stringify({ isNew: s.isNew, level: s.level, due: s.due, slipping: s.slipping, read: s.strengths.read?.known });
  try {
    for (const unit of [own, shared, ...ideas.slice(2, 8)]) ok(pick(W.stateOf(unit, { lang: LANG, now: NOW })) === pick(P.unitState(unit, { lang: LANG, now: NOW })), `${unit} with the alias`);
    ok(W.wordIndexStats().built === before.built + 1, "it wasn't worked out again");
    ok(P.unitEvidence(shared, LANG).length > P.unitEvidence(ideas[1], LANG).length - 1, "the alias changed nothing");
  } finally {
    P.setUnitAliases(LANG, {});
  }
  for (const unit of [own, shared]) ok(pick(W.stateOf(unit, { lang: LANG, now: NOW })) === pick(P.unitState(unit, { lang: LANG, now: NOW })), `${unit} apart again`);
  return `${own} as ${shared}, then apart`;
});

await test("a clear everywhere, then its Undo (the account's two routes played in memory): nothing, then everything back", async () => {
  const now = NOW + 2 * DAY;
  const made = new Map();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (path, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    let answer = null;
    if (path === "/api/progress/clears" && body) made.set(body.id, (answer = { id: body.id, before: body.before, at: body.before, undone: false }));
    const undo = /^\/api\/progress\/clears\/([0-9a-f]{16})\/undo$/.exec(path);
    if (undo && made.has(undo[1])) answer = { ...made.get(undo[1]), at: made.get(undo[1]).at + 1, undone: true };
    return { ok: Boolean(answer), status: answer ? 200 : 404, json: async () => answer };
  };
  try {
    const before = same(now, "before the clear");
    await P.clearProgress({ everywhere: true });
    const cleared = same(now, "after the clear");
    ok(cleared <= 1, `after a clear, ${cleared} understood (only the word bank's studied word may be)`);
    const [last] = P.clearedProgress(now);
    ok(last?.id, "no clear to undo");
    await P.undoClear(last.id);
    const back = same(now, "after the Undo");
    ok(back === before, `the Undo gave ${back}, ${before} before`);
    return `${before} → ${cleared} → ${back}`;
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ---------- 4. kept on the device ----------

let snapshot = null;
await test("a snapshot: plain data, the same for the same evidence, used on a fresh start with nothing worked out; a stale one never used", () => {
  const a = JSON.stringify(W.wordIndexSnapshot(LANG));
  W.resetWordIndex();
  W.useStoredIndex([]);
  const b = JSON.stringify(W.wordIndexSnapshot(LANG));
  ok(a === b, "two snapshots of the same evidence differ");
  snapshot = JSON.parse(a);
  W.resetWordIndex();
  W.useStoredIndex([JSON.parse(a)]);
  const before = W.wordIndexStats();
  same(NOW + 3 * DAY, "from the snapshot");
  const after = W.wordIndexStats();
  ok(after.adopted === before.adopted + 1 && after.built === before.built, `it wasn't used: ${JSON.stringify([before, after])}`);
  // Stale: one more answer, then the same snapshot on a fresh start.
  P.record([{ concept: pickUnits(1, 5)[0], at: NOW + 3 * DAY, lang: LANG, skill: "read", test: "recall", outcome: "wrong", activity: "practice" }]);
  W.resetWordIndex();
  W.useStoredIndex([JSON.parse(a)]);
  const stale = W.wordIndexStats();
  same(NOW + 3 * DAY + 1000, "a stale snapshot");
  const end = W.wordIndexStats();
  ok(end.adopted === stale.adopted && end.built === stale.built + 1, `a stale snapshot was used: ${JSON.stringify([stale, end])}`);
  // Another model of forgetting: not used either.
  W.resetWordIndex();
  W.useStoredIndex([{ ...W.wordIndexSnapshot(LANG), model: "another" }]);
  const other = W.wordIndexStats();
  W.counts({ lang: LANG });
  ok(W.wordIndexStats().adopted === other.adopted, "a snapshot of another model was used");
  return `${(a.length / 1024).toFixed(0)} KB, ${snapshot.entries.length.toLocaleString()} entries`;
});

// ---------- 5. its cost ----------

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
// The bar is on the quickest of 20 (what it costs, with nothing else running); the median says what a busy machine made of it.
await test("its cost on a year in: reads under 5 ms, an answer's update under 2 ms (the quickest of 20; the median too), against what it replaces", () => {
  W.resetWordIndex();
  W.useStoredIndex([]);
  let t = performance.now();
  W.counts({ lang: LANG });
  const build = performance.now() - t;
  const reads = [];
  for (let i = 0; i < 20; i++) {
    t = performance.now();
    W.counts({ lang: LANG, now: NOW + i });
    W.knownWords({ lang: LANG, now: NOW + i });
    W.startedWords({ lang: LANG, now: NOW + i });
    reads.push(performance.now() - t);
  }
  const updates = [];
  for (let i = 0; i < 20; i++) {
    const units = pickUnits(3, 300 + i);
    P.record(units.map((concept) => ({ concept, at: NOW + 4 * DAY + i * 60_000, lang: LANG, skill: "read", test: "recall", outcome: "right", activity: "practice" })));
    t = performance.now();
    W.isUnderstood(units[0], { lang: LANG });
    updates.push(performance.now() - t);
  }
  // What it replaces: the pile's rows worked out from unitState, and Over time's 90 points from strengthsOver.
  const words = P.studiedUnits(LANG).filter((unit) => INDEXED.test(unit));
  t = performance.now();
  truthStarted(NOW + 4 * DAY + DAY);
  const pileBefore = performance.now() - t;
  const ats = Array.from({ length: 90 }, (_, i) => NOW - 360 * DAY + i * 4 * DAY);
  t = performance.now();
  P.strengthsOver(words, ats, { lang: LANG, level: W.UNDERSTOOD_LEVEL });
  const overBefore = performance.now() - t;
  t = performance.now();
  W.wellOver(ats, { lang: LANG });
  const overNow = performance.now() - t;
  const snap = W.wordIndexSnapshot(LANG);
  W.resetWordIndex();
  W.useStoredIndex([snap]);
  t = performance.now();
  W.counts({ lang: LANG });
  const adopt = performance.now() - t;
  ok(Math.min(...reads) < 5, `reads took ${Math.min(...reads).toFixed(2)} ms at the quickest`);
  ok(Math.min(...updates) < 2, `an answer's update took ${Math.min(...updates).toFixed(2)} ms at the quickest`);
  ok(overNow < overBefore, `Over time from the index (${overNow.toFixed(1)} ms) isn't quicker than before (${overBefore.toFixed(1)} ms)`);
  return `reads ${Math.min(...reads).toFixed(2)} ms (median ${median(reads).toFixed(2)}), an answer's update ${Math.min(...updates).toFixed(2)} ms (median ${median(updates).toFixed(2)}); worked out whole ${build.toFixed(0)} ms, from a snapshot ${adopt.toFixed(0)} ms; the pile before ${pileBefore.toFixed(0)} ms; Over time's 90 points ${overBefore.toFixed(0)} ms before, ${overNow.toFixed(1)} ms now`;
});

console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
