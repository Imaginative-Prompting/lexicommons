// Fill for a learner who knows many words (lex-character, 7 Nov 2026: Fill's first frame froze for 12 s for a learner who knows the ten word
// bands): planSession("game", "fill") asked fits of all 20,000 sentences before it ordered them, and each fits gathered and shuffled every form
// of every word you know for its gap's wrong choices (new-words.js fillChoices). Now a game's test is asked only of the sentences in the
// running, in order (plan.js firstFresh), and the forms are walked in a seeded order until two will do. On the real path and word bands, in Node:
//   node scripts/test-fill-speed.mjs --list <frequency.nl.json> [<app dir>]   (exit 0 = pass; 2 = no list given)
// <app dir>: another copy's modules on these packs, to see it fail on one from before (its Fill plan takes about 40 s here).
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const listAt = process.argv.indexOf("--list");
if (listAt < 0) {
  console.error("Usage: node scripts/test-fill-speed.mjs --list <frequency.nl.json> [<app dir>]");
  process.exit(2);
}
const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const other = process.argv.slice(2).filter((arg, i, all) => arg !== "--list" && all[i - 1] !== "--list");
const APP = other[0] ? resolve(other[0]) : HERE;
const from = (rel) => import(pathToFileURL(join(APP, rel)).href);

await from("scripts/fixtures/library-grammar.mjs");
const { record, clearProgress } = await from("public/js/study/progress.js");
const { planSession } = await from("public/js/study/plan.js");
// (Read through the module: content.js replaces its arrays each time the packs change.)
const content = await from("public/js/study/content.js");
const { savePack } = await from("public/js/study/packs.js");
const { useFrequency } = await from("public/js/study/frequency.js");
const { fillChoices, isHeavy, lemmaOfForm, isNotFirst } = await from("public/js/study/new-words.js");

for (const name of readdirSync(join(HERE, "packs")).filter((n) => /^(path-nl|words-nl-\d+)\.json$/.test(n)).sort()) {
  const saved = await savePack(JSON.parse(readFileSync(join(HERE, "packs", name), "utf8")));
  if (!saved.ok) throw new Error(`${name}: ${JSON.stringify(saved.errors?.slice(0, 2))}`);
}
useFrequency(JSON.parse(readFileSync(process.argv[listAt + 1], "utf8")));
const { ITEMS, WORDS, CHUNKS } = content;

let failed = 0;
let passed = 0;
const ok = (cond, what) => {
  if (!cond) throw new Error(what);
};
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
const cpu = (fn) => {
  const t0 = process.cpuUsage();
  const out = fn();
  const t = process.cpuUsage(t0);
  return [(t.user + t.system) / 1000, out];
};
// The least CPU of `times` runs, stopping once a run is past `ceiling` ms (the plan from before takes about 40 s a run).
const leastOf = (times, ceiling, fn) => {
  let best = Infinity;
  let out;
  for (let i = 0; i < times; i++) {
    const [ms, value] = cpu(() => fn(i));
    best = Math.min(best, ms);
    out = value;
    if (ms > ceiling) break;
  }
  return [best, out];
};
const text = (option) => (typeof option === "string" ? option : option.text);
const bare = (word) => String(word).toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "");

// Every word and phrase known, as knowWords (scripts/fixtures/know-words.mjs) records it for a check of a game.
const NOW = new Date(2026, 10, 7, 15, 0).getTime();
await clearProgress();
record([...Object.keys(WORDS).map((w) => `w:${w}`), ...Object.keys(CHUNKS).map((id) => `c:${id}`)].map((concept) => ({ concept, at: NOW - 3_600_000, outcome: "right", test: "recall", skill: "read", activity: "meaning", item: "check" })));
const gapped = ITEMS.filter((item) => item.gap && !isNotFirst(item));

// 1,000 ms: the plan before took ~40,000 here, today's ~250 (another game's ~200); the bound beside another game's is for a slower machine.
const BOUND = 1000;
await test(`Fill's plan for a learner who knows every word (${ITEMS.length.toLocaleString()} sentences) takes under ${BOUND} ms of CPU and under twice another game's (Choose's, the control)`, () => {
  const [choose] = leastOf(3, 10 * BOUND, (i) => planSession("game", "choose", NOW + i));
  const [fill, plan] = leastOf(3, 10 * BOUND, (i) => planSession("game", "fill", NOW + i));
  ok(plan.steps.length === 6 && plan.steps.every((step) => step.kind === "fill"), `not six Fill steps: ${plan.steps.map((step) => step.kind).join(", ")}`);
  ok(fill < BOUND, `${Math.round(fill)} ms (Choose ${Math.round(choose)})`);
  ok(fill < 2 * choose + 100, `${Math.round(fill)} ms, Choose ${Math.round(choose)}`);
  return `${Math.round(fill)} ms (Choose ${Math.round(choose)}): ${plan.steps.map((step) => step.item.id).join(", ")}`;
});

// The way it was (every form gathered and shuffled at each call), here as the control: the walk must be far quicker than it, on the same items.
// (Its forms worked out once, as the app keeps them.)
const FORMS = new Map();
for (const one of ITEMS) for (const [t, lemma] of one.words) if (lemma && !FORMS.has(bare(t))) FORMS.set(bare(t), lemma);
function gathered(item, known) {
  const right = item.words[item.gap.index];
  const forms = FORMS;
  const list = [...forms].filter(([, lemma]) => lemma !== right[1] && !isHeavy(lemma) && known(lemma)).map(([form]) => form);
  let h = 2166136261;
  for (let i = list.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    const j = h % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, 2);
}
// A gap with none of its own choices: its two wrong ones are forms of words you know.
const bareGap = (item) => ({ ...item, gap: { ...item.gap, options: [] } });
const sample = gapped.filter((_, i) => i % Math.max(1, Math.floor(gapped.length / 200)) === 0).slice(0, 200).map(bareGap);

await test("a gap's wrong choices from the words you know: two, each a form of a known word, never the answer's word or a heavy one, the same each time, and far quicker than gathering every form (the control)", () => {
  const knownSet = new Set(Object.keys(WORDS));
  const known = (lemma) => knownSet.has(lemma);
  const [walked, outs] = cpu(() => sample.map((item) => fillChoices(item, { known })));
  const [gather] = cpu(() => sample.slice(0, 20).map((item) => gathered(item, known)));
  const each = walked / sample.length;
  const old = gather / 20;
  outs.forEach((out, i) => {
    const item = sample[i];
    ok(out && out.length === 3, `${item.id}: ${JSON.stringify(out)}`);
    const right = item.words[item.gap.index];
    ok(text(out[0]) === right[0], `${item.id}: the right one first, got ${text(out[0])}`);
    for (const option of out.slice(1)) {
      const lemma = lemmaOfForm(text(option));
      ok(lemma && lemma !== right[1] && !isHeavy(lemma) && known(lemma), `${item.id}: ${text(option)} (${lemma})`);
    }
  });
  const again = sample.map((item) => fillChoices(item, { known }));
  ok(JSON.stringify(again) === JSON.stringify(outs), "not the same choices the second time");
  ok(each * 10 < old, `${each.toFixed(2)} ms a call, the gathering ${old.toFixed(2)}`);
  ok(each < 1, `${each.toFixed(2)} ms a call`);
  return `${sample.length} gaps, ${each.toFixed(3)} ms a call (gathering every form: ${old.toFixed(1)} ms)`;
});

await test("only forms you've seen where seen is given, and none at all (null, the game gives way) when fewer than two will do: known words, then seen forms, as the controls", () => {
  const knownSet = new Set(Object.keys(WORDS));
  const known = (lemma) => knownSet.has(lemma);
  const seenForms = new Set(["huis", "boek", "water", "fiets", "lezen", "eten", "hond", "kat"]);
  for (const item of sample.slice(0, 50)) {
    const out = fillChoices(item, { known, seen: (form) => seenForms.has(form) });
    if (!out) continue;
    for (const option of out.slice(1)) ok(seenForms.has(bare(text(option))), `${item.id}: ${text(option)} isn't a form seen`);
  }
  const none = sample.slice(0, 50).filter((item) => fillChoices(item, { known: () => false }) !== null);
  ok(!none.length, `knowing nothing, still choices for ${none.map((item) => item.id).join(", ")}`);
  const one = sample.slice(0, 50).filter((item) => fillChoices(item, { known, seen: (form) => form === "huis" }) !== null);
  ok(!one.length, `one seen form, still two choices for ${one.map((item) => item.id).join(", ")}`);
  return "50 gaps each way";
});

console.log(`${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
