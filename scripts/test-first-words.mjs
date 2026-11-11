// How a new word is met (study/new-words.js, plan.js), on the real Dutch word packs and the frequency list, in Node:
// the commonest words first; every whole-sentence step readable at the moment it runs, over sessions of a learner growing;
// no flagged sentence (lang/not-first.nl.js) ever a new word's card or question, with a control that shows the check can
// fail; a word's meaning for a form; the wrong choices; a due word back in a sentence you haven't had; a missed card
// retried on its own word; the data file against the packs; the plan's time.
// Usage: node scripts/test-first-words.mjs --list <frequency.nl.json>   (exit 0 = pass; 2 = no list given)
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearProgress, record, unitState, allEvidence } from "../public/js/study/progress.js";
import { planSession } from "../public/js/study/plan.js";
import { resetStudySettings } from "../public/js/study/settings.js";
import { ITEMS, WORDS, contentLanguage, sentence } from "../public/js/study/content.js";
import { savePack } from "../public/js/study/packs.js";
import { rankOf, useFrequency } from "../public/js/study/frequency.js";
import { firstSentenceOf, isNotFirst, lemmasOf, meaningChoices, meaningOfWord, meaningsOfWord, sentenceForWord, sentencesWith, targetOf, wordsInOrder } from "../public/js/study/new-words.js";
import notFirst from "../public/js/lang/not-first.nl.js";

const listAt = process.argv.indexOf("--list");
if (listAt < 0) {
  console.error("Usage: node scripts/test-first-words.mjs --list <frequency.nl.json>");
  process.exit(2);
}
const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKS = readdirSync(join(APP, "packs"))
  .filter((name) => /^words-nl-\d+\.json$/.test(name))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(APP, "packs", name), "utf8")));
for (const pack of PACKS) {
  const saved = await savePack(pack);
  if (!saved.ok) throw new Error(`${pack.id}: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
}
useFrequency(JSON.parse(readFileSync(process.argv[listAt + 1], "utf8")));

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1, 9);
let failed = 0;
let passed = 0;
async function test(name, fn) {
  await clearProgress();
  resetStudySettings();
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
const eq = (actual, expected, what = "") => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what ? `${what}: ` : ""}${a} ≠ ${e}`);
};
const WHOLE = new Set(["choose", "arrange", "place", "type", "listen", "say", "repeat"]);

// Plays one plan the way session.js records it: every word step right, every whole-sentence step right on its units.
function play(plan, at) {
  for (const step of plan.steps) {
    if (step.kind === "match") {
      record(step.words.map((word) => ({ concept: `w:${word}`, at, outcome: "right", test: "pick", skill: "read", activity: "match" })));
    } else if (step.first) {
      record(lemmasOf(step.item).map((word) => ({ concept: `w:${word}`, at, outcome: "met", test: "self", skill: "read", activity: "card", item: step.item.id })));
    } else if (step.target && !WHOLE.has(step.kind)) {
      record([
        { concept: `w:${step.target}`, at, outcome: "right", test: "pick", skill: "read", activity: step.kind === "card" ? "card" : "meaning", item: step.item.id },
        ...lemmasOf(step.item).filter((word) => word !== step.target).map((word) => ({ concept: `w:${word}`, at, outcome: "met", test: "pick", skill: "read", activity: "meaning", item: step.item.id })),
      ]);
    } else if (step.item) {
      record([
        ...step.item.concepts.map((id) => ({ concept: `p:${id}`, at, outcome: "right", test: "build", skill: "read", activity: step.kind, item: step.item.id })),
        ...lemmasOf(step.item).map((word) => ({ concept: `w:${word}`, at, outcome: "met", test: "build", skill: "read", activity: step.kind, item: step.item.id })),
      ]);
    }
  }
}

await test("the first session: the commonest words, in sentences you can follow", () => {
  const plan = planSession("quick", undefined, T0);
  const cards = plan.steps.filter((s) => s.kind === "card");
  eq(cards.map((s) => s.target), ["ik", "zijn", "jij"]);
  eq(new Set(plan.steps.filter((s) => s.item).map((s) => s.item.id)).size, plan.steps.filter((s) => s.item).length, "a sentence used twice");
  return plan.steps.map((s) => `${s.kind}${s.target ? `:${s.target}` : ""}${s.item ? ` "${sentence(s.item)}"` : ""}`).join(" · ");
});

await test("a learner growing over 60 sessions: every whole-sentence step readable when it runs; words come back in other sentences", () => {
  let at = T0;
  let whole = 0;
  const others = [];
  const metIn = new Map();
  const backIn = new Map();
  for (let s = 0; s < 60; s++) {
    const plan = planSession("quick", undefined, at);
    const taught = new Set();
    for (const step of plan.steps) {
      if (step.kind === "match") {
        for (const word of step.words) taught.add(word);
        continue;
      }
      if (WHOLE.has(step.kind)) {
        whole++;
        const played = allEvidence().some((row) => row.item === step.item.id && row.outcome !== "met");
        const unknown = lemmasOf(step.item).filter((word) => !taught.has(word) && unitState(`w:${word}`, { now: at }).isNew);
        ok(unknown.length <= 1 || played, `session ${s + 1}: ${step.kind} "${sentence(step.item)}" has ${unknown.length} new: ${unknown}`);
      }
      if (step.target) {
        taught.add(step.target);
        if (!metIn.has(step.target)) metIn.set(step.target, step.item.id);
        else if (metIn.get(step.target) !== step.item.id) backIn.set(step.target, (backIn.get(step.target) ?? 0) + 1);
        others.push(step);
      }
    }
    play(plan, at);
    at += DAY;
  }
  const words = metIn.size;
  ok(words >= 60, `only ${words} words met`);
  ok(backIn.size >= words * 0.6, `${backIn.size} of ${words} words came back in another sentence`);
  ok(whole > 0, "no whole-sentence step in 60 sessions: the games never open up");
  return `${words} words met, ${backIn.size} back in another sentence, ${whole} whole-sentence steps`;
});

await test("no flagged sentence is ever a new word's card or question, over the first 900 new words; the check can fail", () => {
  let at = T0;
  let steps = 0;
  const seenWords = new Set();
  for (let s = 0; s < 400 && seenWords.size < 900; s++) {
    const plan = planSession("quick", undefined, at);
    for (const step of plan.steps) {
      if (step.meaning === "new" && step.target) {
        steps++;
        seenWords.add(step.target);
        ok(!isNotFirst(step.item), `${step.target}: "${sentence(step.item)}" is flagged`);
      }
    }
    // Only the new words are answered, minutes apart, so nothing comes due and the next session brings the next ones.
    record([...new Set(plan.steps.filter((p) => p.meaning === "new" && p.target).map((p) => p.target))].map((word) => ({ concept: `w:${word}`, at, outcome: "right", test: "recall", skill: "read", activity: "meaning", item: "t" })));
    at += 60_000;
  }
  ok(seenWords.size >= 300, `only ${seenWords.size} new words`);
  // Control: the same selector with flags out of the way picks flagged sentences, so the clean run above means something.
  let would = 0;
  for (const word of wordsInOrder().slice(0, 2000)) {
    const first = sentenceForWord(word, { known: () => true, seen: () => true });
    if (first && isNotFirst(first)) would++;
  }
  ok(would > 20, `with the flags ignored only ${would} would be picked: the list isn't being read`);
  return `${steps} steps over ${seenWords.size} words, none flagged; ignoring the flags, ${would} of the top 2,000 words' sentences would be`;
});

await test("a word with only flagged sentences isn't offered: nothing to start it on", () => {
  const known = () => true;
  const held = wordsInOrder().filter((word) => !sentenceForWord(word, { known }));
  ok(held.includes("verkrachten"), "verkrachten is offered");
  const plan = planSession("frequent", undefined, T0);
  ok(!plan.steps.some((step) => step.target && held.includes(step.target)), "a held-back word was offered");
  return `${held.length} words held back; commonest: ${held.slice(0, 6).join(", ")}`;
});

await test("from 2,000 known words a flagged sentence may start a word, one a session; at 1,999 it may not", () => {
  const clean = wordsInOrder().filter((word) => sentenceForWord(word, { known: () => true }));
  const held = wordsInOrder().filter((word) => !sentenceForWord(word, { known: () => true }));
  record(clean.slice(0, 1999).map((word) => ({ concept: `w:${word}`, at: T0, outcome: "right", test: "recall", skill: "read", activity: "meaning", item: "t" })));
  const before = planSession("frequent", undefined, T0 + 60_000).steps.filter((s) => s.first);
  ok(before.length && !before.some((s) => isNotFirst(s.item)), `at 1,999: ${before.map((s) => `${s.target}: ${sentence(s.item)}`)}`);
  ok(!before.some((s) => held.includes(s.target)), `a held word at 1,999: ${before.map((s) => s.target)}`);
  record([{ concept: `w:${clean[1999]}`, at: T0, outcome: "right", test: "recall", skill: "read", activity: "meaning", item: "t" }]);
  const after = planSession("frequent", undefined, T0 + 60_000).steps.filter((s) => s.first);
  ok(after.some((s) => held.includes(s.target)), `no held word at 2,000: ${after.map((s) => s.target)}`);
  eq(after.filter((s) => isNotFirst(s.item)).length, 1, `one a session: ${after.map((s) => s.target)}`);
  ok(after.some((s) => !isNotFirst(s.item)), `every word this session is a held one: ${after.map((s) => s.target)}`);
  return after.map((s) => `${s.target}: "${sentence(s.item)}"`).join(" · ");
});

await test("a form's meaning says which word it is; a word as its own form doesn't repeat", () => {
  const item = ITEMS.find((it) => it.id === "words-nl-01/ik");
  eq(meaningOfWord("ben", item), { said: "ben", lemma: "zijn", gloss: "to be", reading: undefined });
  eq(meaningOfWord("zijn", item).gloss, WORDS.zijn, "a form that can be either keeps both");
  eq(meaningOfWord("Ik", item), { said: "Ik", lemma: null, gloss: "I", reading: undefined });
  eq(meaningOfWord("thuis.", item).said, "thuis", "punctuation");
  eq(meaningOfWord("bent", item).lemma, "zijn", "a form from another sentence");
  eq(meaningOfWord("xyzzy", item), null, "nothing knows it");
});

await test("a tap knows which word you pressed: one written word can be two words in a sentence", () => {
  const item = { id: "x", words: [["Woon", "wonen"], ["je", "jij"], ["hier", "hier"], ["met", "met"], ["je", "je"], ["moeder", "moeder"]], punct: "?" };
  ok(meaningOfWord("je", item, 1).gloss === WORDS.jij, `je at 1: ${meaningOfWord("je", item, 1).gloss}`);
  ok(meaningOfWord("je", item, 4).gloss === WORDS.je, `je at 4: ${meaningOfWord("je", item, 4).gloss}`);
  ok(WORDS.jij !== WORDS.je, "the check can't fail: the two glosses are the same");
  eq(meaningOfWord("je", item, 4).lemma, null, "je, as itself");
  eq(meaningOfWord("je", item, 1).lemma, "jij", "je, a form of jij");
  eq(meaningsOfWord("je", item).map((row) => row.gloss), [WORDS.jij, WORDS.je], "both in the Words sheet");
  eq(meaningOfWord("hier", item, 1).gloss, WORDS.hier, "a stale index falls back on the word");
});

await test("What does it mean?'s choices: its meaning, others of its kind, none from the sentence or flagged, the same each time", () => {
  const item = ITEMS.find((it) => it.id === "words-nl-01/ik");
  const choices = meaningChoices("zijn", item);
  eq(choices.options[choices.correct], "to be", "ben's own sense");
  ok(choices.options.length === 4, `${choices.options.length} choices`);
  eq(meaningChoices("zijn", item), choices, "shuffled the same");
  ok(choices.options.every((option) => option.startsWith("to ")), `a verb with non-verbs: ${choices.options}`);
  const inSentence = lemmasOf(item).map((word) => WORDS[word]);
  ok(!choices.options.some((option) => option !== "to be" && inSentence.includes(option)), "a choice from the sentence");
  const noun = meaningChoices("thuis", item);
  ok(noun.options.filter((option) => option !== WORDS.thuis).every((option) => !option.startsWith("to ")), `a non-verb with verbs: ${noun.options}`);
  // No choice names something Study won't start on: scan a good many.
  for (const word of wordsInOrder().slice(0, 200)) {
    const pick = sentenceForWord(word, { known: () => true });
    const c = pick && meaningChoices(word, pick);
    if (c) ok(!c.options.some((option) => option !== WORDS[word] && /murder|kill|rape|suicide|corpse|sexual/.test(option)), `${word}: ${c.options}`);
  }
  return choices.options.join(" / ");
});

await test("a due word comes back in a sentence you haven't had; with none, one you have", () => {
  const met = ITEMS.find((it) => it.id === "words-nl-01/ik");
  record([{ concept: "w:thuis", at: T0, outcome: "right", test: "pick", skill: "read", activity: "meaning", item: met.id }]);
  record(wordsInOrder().slice(0, 300).filter((word) => word !== "thuis").map((word) => ({ concept: `w:${word}`, at: T0, outcome: "right", test: "recall", skill: "read", activity: "meaning", item: "t" })));
  const plan = planSession("reviews", undefined, T0 + 30 * DAY);
  const step = plan.steps.find((s) => s.target === "thuis");
  ok(step, `thuis isn't back: ${plan.steps.map((s) => s.target)}`);
  ok(step.item.id !== met.id, `the same sentence: "${sentence(step.item)}"`);
  return `"${sentence(step.item)}"`;
});

await test("a card you missed is retried, on its word; only that word took the miss", () => {
  const item = ITEMS.find((it) => it.id === "words-nl-01/ik");
  record([
    { concept: "w:thuis", at: T0, outcome: "wrong", test: "self", skill: "read", activity: "card", item: item.id },
    ...lemmasOf(item).filter((word) => word !== "thuis").map((word) => ({ concept: `w:${word}`, at: T0, outcome: "met", test: "self", skill: "read", activity: "card", item: item.id })),
  ]);
  const plan = planSession("quick", undefined, T0 + 3_600_000);
  const again = plan.steps.find((s) => s.again);
  ok(again, "no retry");
  eq([again.kind, again.item.id, again.target], ["card", item.id, "thuis"]);
  ok(unitState("w:zijn", { now: T0 }).isNew, "another word took a grade");
});

await test("Study cards: first sight, then a graded card on the same word in another sentence", () => {
  const plan = planSession("cards", undefined, T0);
  const firsts = plan.steps.filter((s) => s.first);
  ok(firsts.length >= 1, "no new word");
  for (const first of firsts) {
    const later = plan.steps.find((s) => s.target === first.target && !s.first);
    ok(later, `${first.target} never graded`);
    ok(later.item.id !== first.item.id, `${first.target}: the same sentence`);
  }
});

await test("each session of one game runs only where it can", () => {
  for (const game of ["choose", "arrange", "place", "fill", "type", "listen", "say", "repeat", "match", "meaning"]) {
    const plan = planSession("game", game, T0);
    ok(plan.steps.length, `${game}: nothing`);
    ok(plan.steps.every((s) => s.kind === "card" || s.kind === "meaning" || !s.item), `${game}: brand new and quizzed: ${plan.steps.map((s) => s.kind)}`);
  }
});

await test("the data: every Dutch words pack judged, its sentences unchanged since, every id in its pack", () => {
  const textOf = (item) => item.words.map(([text]) => text).join(" ") + (item.punct ?? "");
  for (const pack of PACKS) {
    const entry = notFirst[pack.id];
    ok(entry, `${pack.id} has no list: run pipelines/words/not-first.ts on it`);
    const hash = createHash("sha256").update(pack.items.map((item) => `${item.id}\t${textOf(item)}\t${item.means}`).join("\n")).digest("hex").slice(0, 16);
    eq(entry.judged, hash, `${pack.id}'s sentences changed since they were judged: run pipelines/words/not-first.ts --previous on it`);
    const ids = new Set(pack.items.map((item) => item.id));
    const stray = entry.ids.filter((id) => !ids.has(id));
    ok(!stray.length, `${pack.id}: ids that aren't there: ${stray.slice(0, 5)}`);
  }
  return `${PACKS.length} packs, ${Object.values(notFirst).reduce((n, entry) => n + entry.ids.length, 0)} sentences`;
});

await test("how far a learner gets in 30 days: 1, 2 and 3 sessions a day", async () => {
  const out = [];
  for (const perDay of [1, 2, 3]) {
    await clearProgress();
    let at = T0;
    const met = new Set();
    let reviewOnly = 0;
    for (let day = 0; day < 30; day++) {
      let anyNew = false;
      for (let n = 0; n < perDay; n++) {
        const plan = planSession("quick", undefined, at + n * 3_600_000);
        for (const step of plan.steps) {
          if (step.first) {
            met.add(step.target);
            anyNew = true;
          }
        }
        play(plan, at + n * 3_600_000);
      }
      if (!anyNew) reviewOnly++;
      at += DAY;
    }
    out.push(`${perDay}/day: ${met.size} words, ${reviewOnly} days with nothing new`);
  }
  return out.join("; ");
});

await test("a quick session over every band is planned in under a second, on this Mac", () => {
  planSession("quick", undefined, T0);
  const t = performance.now();
  planSession("quick", undefined, T0);
  const ms = performance.now() - t;
  ok(ms < 1000, `${Math.round(ms)} ms`);
  return `${ITEMS.length} sentences, ${Math.round(ms)} ms`;
});

await test("a copy (copyOf) of a flagged sentence is flagged too: the list is its source pack's", () => {
  const id = notFirst["words-nl-01"].ids[0];
  ok(isNotFirst({ id: `words-nl-01/${id}`, pack: "words-nl-01" }), "the band's own");
  ok(isNotFirst({ id: `words-nl-01/${id}`, pack: "nl-health-1", copyOf: "words-nl-01" }), "a copy of it in a category pack");
  ok(!isNotFirst({ id: `nl-health-1/${id}`, pack: "nl-health-1" }), "an item of the category pack's own with that id isn't");
});

// The pick as a plain rule: every sentence's key worked out whole, the lowest first, as sentenceForWord was written before it read arrays and
// stopped counting a sentence that can't win (7 Nov 2026). The same pass also picks with ties going to the later sentence: the control, which
// must differ somewhere.
const taughtAt = new Map();
ITEMS.forEach((item, i) => {
  const target = targetOf(item);
  if (target && !taughtAt.has(target)) taughtAt.set(target, i);
});
const placeOf = (lemma) => taughtAt.get(lemma) ?? (firstSentenceOf(lemma) === undefined ? undefined : ITEMS.length + firstSentenceOf(lemma));
const compareKeys = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};
const wordsOfItem = new Map();
function plainPicks(lemma, { known, used = new Set(), seen = null, pastFirst = false }) {
  const rank = (word) => rankOf(word, contentLanguage());
  const ceiling = Number.isFinite(rank(lemma)) ? Math.max(1000, rank(lemma) + 500) : Infinity;
  let best = null;
  let bestKey = null;
  let later = null;
  let laterKey = null;
  for (const item of sentencesWith(lemma)) {
    if (used.has(item.id)) continue;
    const had = Boolean(seen?.(item));
    if (!had && !pastFirst && isNotFirst(item)) continue;
    if (!wordsOfItem.has(item)) wordsOfItem.set(item, lemmasOf(item));
    const others = wordsOfItem.get(item).filter((other) => other !== lemma && !known(other));
    let top = 0;
    for (const other of others) top = Math.max(top, Number.isFinite(rank(other)) ? rank(other) : (placeOf(other) ?? ITEMS.length * 2));
    // [not first and flagged, past the ceiling, others past one, had, others, not its own, top, length]; then where it comes, the tie-break.
    const key = [!had && isNotFirst(item) ? 1 : 0, top > ceiling ? 1 : 0, others.length > 1 ? others.length : 0, had ? 1 : 0, others.length, targetOf(item) === lemma ? 0 : 1, top, item.words.length];
    if (!best || compareKeys(key, bestKey) < 0) [best, bestKey] = [item, key];
    if (!later || compareKeys(key, laterKey) <= 0) [later, laterKey] = [item, key];
  }
  return { pick: best?.id ?? null, later: later?.id ?? null };
}

await test("the pick (sentenceForWord) is the plain rule's (every sentence's key worked out whole, the lowest first) for the 300 commonest words under six known sets, sentences had and not, past the first 2,000 and not, alone and with the last pick used; the rule with ties to the later sentence (the control) differs", () => {
  const ranked = wordsInOrder();
  const sets = { "nothing": new Set(), "the first 50": new Set(ranked.slice(0, 50)), "the first 500": new Set(ranked.slice(0, 500)), "the first 2,000": new Set(ranked.slice(0, 2000)), "every other of the first 1,000": new Set(ranked.slice(0, 1000).filter((_, i) => i % 2)) };
  const knowns = { ...Object.fromEntries(Object.entries(sets).map(([name, set]) => [name, (lemma) => set.has(lemma)])), "only what has no meaning": (lemma) => !WORDS[lemma] };
  const had = (item) => [...item.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 3 === 0;
  let cases = 0;
  let controlDiffers = 0;
  for (const [name, known] of Object.entries(knowns)) {
    for (const pastFirst of [false, true]) {
      for (const seen of [null, had]) {
        let previous = null;
        for (const lemma of ranked.slice(0, 300)) {
          for (const used of [new Set(), new Set([previous].filter(Boolean))]) {
            const opts = { known, used, seen, pastFirst };
            const pick = sentenceForWord(lemma, opts)?.id ?? null;
            const plain = plainPicks(lemma, opts);
            ok(pick === plain.pick, `${lemma}, knowing ${name}${pastFirst ? ", past the first" : ""}${seen ? ", some had" : ""}${used.size ? `, ${previous} used` : ""}: ${pick} where the plain rule picks ${plain.pick}`);
            if (plain.later !== plain.pick) controlDiffers++;
            cases++;
            if (!used.size) previous = pick ?? previous;
          }
        }
      }
    }
  }
  ok(controlDiffers > 0, "ties to the later sentence never changed a pick: these cases can't tell");
  return `${cases.toLocaleString()} cases the same; ties to the later sentence differ in ${controlDiffers.toLocaleString()}`;
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
