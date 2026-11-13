// Read evidence kept per script (study/script.js; progress.js record, reviewsOf, unitState, unitLasting, evidenceStamp; plan-kept.js planKey;
// study/settings.js writing.<lang>), 12 Nov 2026: Chinese studied in pinyin (Cantonese in jyutping) instead of its characters must never count
// as reading the characters. In plain Node, localStorage stood in: answers recorded in characters, the language switched to pinyin and back,
// each strength and count read at each step.
//   - A read answer in pinyin is kept with script "pinyin"; one in characters, and every hear, say or sound answer, with none.
//   - A unit's read strength, and whether it's new, met or answered, come from its current script's read answers alone; hearing and saying
//     from all of them. So a word read only in characters is new to read in pinyin, and back in characters it's exactly as it was left.
//   - Only a language whose readings are the romanization can be studied in it (pinyin for zh and zh-Hant, jyutping for yue): Dutch,
//     Japanese and a wrong one stay in their characters, their rows plain.
//   - What's kept from the evidence changes with the script (the word index's stamp, the kept plan's key); a row's script is one of the two
//     names (the sync's row check); the setting goes to other devices only as one of the three values (the study settings' kind).
//   node scripts/test-script-evidence.mjs [<app dir>]   (another copy's dir to see it fail on one from before; exit 0 = pass)
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const APP = resolve(process.argv[2] ?? new URL("..", import.meta.url).pathname);
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => void store.set(key, String(value)),
  removeItem: (key) => void store.delete(key),
};
const load = (file) => import(pathToFileURL(`${APP}/public/js/${file}`).href);
let failed = 0;
let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}\n        ${error.message}`);
  }
};
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};

const progress = await load("study/progress.js");
const settings = await load("study/settings.js");
const script = await load("study/script.js").catch(() => null);
const { record, unitState, unitLasting, evidenceStamp, cleanRow } = progress;
const DAY = 86_400_000;
const now = Date.now();
// A word's answers on three days, 4 days apart: a read recall (characters) each time, and a hear on the first.
const days = [now - 9 * DAY, now - 5 * DAY, now - DAY];
const readRows = (unit, lang, extra = {}) => days.map((at) => ({ at, lang, concept: unit, outcome: "right", skill: "read", test: "recall", activity: "type", ...extra }));
const strengthOf = (unit, lang, skill = "read") => {
  const s = unitState(unit, { lang }).strengths[skill];
  return s ? { level: s.level, stability: Math.round((s.stability ?? 0) * 1000) / 1000 } : null;
};

await test("the module that says a language's script is there (study/script.js)", () => {
  assert(script && typeof script.scriptOf === "function", "no study/script.js scriptOf");
});

let before = null;
await test("in characters: read answers kept with no script; the word's read strength from them", () => {
  const rows = record([...readRows("w:水", "zh"), { at: days[0], lang: "zh", concept: "w:茶", outcome: "right", skill: "hear", test: "recall", activity: "listen-meaning" }]);
  assert(rows.every((row) => !("script" in row)), `a row carries a script: ${JSON.stringify(rows.find((row) => "script" in row))}`);
  before = { read: strengthOf("w:水", "zh"), state: unitState("w:水", { lang: "zh" }), lasting: unitLasting("w:水", "zh") };
  assert(before.read && before.read.level > 0, `no read strength: ${JSON.stringify(before.read)}`);
  assert(!before.state.isNew && before.state.reviews === 3, `its counts: ${JSON.stringify({ isNew: before.state.isNew, reviews: before.state.reviews })}`);
});

const stampCharacters = evidenceStamp("zh");
await test("Chinese switched to pinyin: the characters' read answers don't count; a word read only in characters is new to read here, a heard word isn't", () => {
  settings.setStudySetting("writing.zh", "pinyin");
  assert(script.scriptOf("zh") === "pinyin", `scriptOf zh: ${script.scriptOf("zh")}`);
  const water = unitState("w:水", { lang: "zh" });
  assert(water.strengths.read === null, `read strength in pinyin from the characters' answers: ${JSON.stringify(water.strengths.read)}`);
  assert(water.isNew && water.reviews === 0 && !water.due, `its counts: ${JSON.stringify({ isNew: water.isNew, reviews: water.reviews, due: water.due })}`);
  assert(unitLasting("w:水", "zh").firstAt === 0, "the word index would say it's started");
  const tea = unitState("w:茶", { lang: "zh" });
  assert(tea.strengths.hear && !tea.isNew, `a heard word: ${JSON.stringify({ hear: tea.strengths.hear, isNew: tea.isNew })}`);
});

await test("in pinyin: a read answer kept with script \"pinyin\", a heard one with none; the word's read strength from the pinyin answers", () => {
  const rows = record([...readRows("w:水", "zh").slice(0, 2), { at: days[1], lang: "zh", concept: "w:水", outcome: "right", skill: "hear", test: "recall", activity: "listen-meaning" }]);
  assert(rows[0].script === "pinyin" && rows[1].script === "pinyin" && !("script" in rows[2]), `rows: ${JSON.stringify(rows.map((row) => [row.skill, row.script]))}`);
  const read = strengthOf("w:水", "zh");
  assert(read && read.level > 0, `no pinyin read strength: ${JSON.stringify(read)}`);
  assert(unitState("w:水", { lang: "zh" }).reviews === 3, "two pinyin reads and a hear");
});

await test("the index's stamp changes with the script", () => {
  assert(evidenceStamp("zh") !== stampCharacters && evidenceStamp("zh").endsWith(" pinyin"), `${stampCharacters} → ${evidenceStamp("zh")}`);
});

await test("back in characters: the read strength exactly as it was left (the pinyin answers counted nowhere), the hear answer counting", () => {
  settings.setStudySetting("writing.zh", "characters");
  assert(script.scriptOf("zh") === "characters", "scriptOf zh");
  assert(JSON.stringify(strengthOf("w:水", "zh")) === JSON.stringify(before.read), `${JSON.stringify(strengthOf("w:水", "zh"))} ≠ ${JSON.stringify(before.read)}`);
  const state = unitState("w:水", { lang: "zh" });
  assert(state.reviews === 4 && state.strengths.hear, `its counts: ${JSON.stringify({ reviews: state.reviews, hear: Boolean(state.strengths.hear) })}`);
  assert(unitLasting("w:水", "zh").firstAt === before.lasting.firstAt, "first answered moved");
  assert(evidenceStamp("zh").endsWith(" characters"), evidenceStamp("zh"));
});

await test("a word read only in pinyin is new to read in characters: no read strength, new, never due", () => {
  settings.setStudySetting("writing.zh", "pinyin");
  record(readRows("w:咖啡", "zh"));
  assert(strengthOf("w:咖啡", "zh")?.level > 0, "learned in pinyin");
  settings.setStudySetting("writing.zh", "characters");
  const state = unitState("w:咖啡", { lang: "zh" });
  assert(state.strengths.read === null && state.isNew && !state.due && state.level === 0, `in characters: ${JSON.stringify({ read: state.strengths.read, isNew: state.isNew, due: state.due, level: state.level })}`);
  assert(unitLasting("w:咖啡", "zh").firstAt === 0 && unitLasting("w:咖啡", "zh").metAt === 0, "the word index would say it's started");
});

await test("only a language whose readings are the romanization: Traditional Chinese in pinyin, Cantonese in jyutping; Dutch, Japanese and a wrong one in their characters, their rows plain", () => {
  settings.setStudySetting("writing.zh-Hant", "pinyin");
  settings.setStudySetting("writing.yue", "jyutping");
  settings.setStudySetting("writing.nl", "pinyin");
  settings.setStudySetting("writing.ja", "pinyin");
  assert(script.scriptOf("zh-Hant") === "pinyin" && script.scriptOf("yue") === "jyutping", `${script.scriptOf("zh-Hant")} ${script.scriptOf("yue")}`);
  assert(script.scriptOf("nl") === "characters" && script.scriptOf("ja") === "characters", `${script.scriptOf("nl")} ${script.scriptOf("ja")}`);
  const rows = record([
    { lang: "yue", concept: "w:你好", outcome: "right", skill: "read", test: "pick", activity: "choose" },
    { lang: "nl", concept: "w:water", outcome: "right", skill: "read", test: "pick", activity: "choose" },
    { lang: "ja", concept: "w:水", outcome: "right", skill: "read", test: "pick", activity: "choose" },
  ]);
  assert(rows[0].script === "jyutping" && !("script" in rows[1]) && !("script" in rows[2]), `rows: ${JSON.stringify(rows.map((row) => row.script ?? null))}`);
  settings.setStudySetting("writing.yue", "pinyin");
  assert(script.scriptOf("yue") === "characters", "Cantonese in pinyin isn't a script");
});

await test("a row's script as another device sends it: pinyin or jyutping kept, anything else turned down", () => {
  const row = { at: now - DAY, v: 2, lang: "zh", concept: "w:水", outcome: "right", skill: "read", test: "pick", help: "none", uid: "0123456789abcdef" };
  assert(cleanRow({ ...row, script: "pinyin" })?.script === "pinyin" && cleanRow({ ...row, script: "jyutping" })?.script === "jyutping", "a romanization's row refused");
  for (const bad of ["romaji", "characters", "", 1, null]) assert(cleanRow({ ...row, script: bad }) === null, `kept: script ${JSON.stringify(bad)}`);
});

await test("the setting goes to your other devices only as one of the three values, under a language's code", () => {
  const kind = settings.studySettingsSync;
  for (const [path, value] of [["writing.zh", "pinyin"], ["writing.zh-Hant", "characters"], ["writing.yue", "jyutping"]]) assert(kind.check({ at: 5, value }, path), `refused: ${path} = ${value}`);
  for (const [path, value] of [["writing.zh", "romaji"], ["writing.zh", 1], ["writing.__proto__", "pinyin"], ["writing.zh.x", "pinyin"], ["writing", "pinyin"]]) assert(!kind.check({ at: 5, value }, path), `kept: ${path} = ${JSON.stringify(value)}`);
  const records = kind.records();
  assert(records["writing.zh"]?.value === "characters" && records["writing.yue"]?.value === "pinyin", `what goes: ${JSON.stringify(Object.keys(records))}`);
});

await test("the kept plan is kept per script (plan-kept.js planKey)", async () => {
  const { planKey } = await load("study/plan-kept.js");
  settings.setStudySetting("writing.zh", "pinyin");
  const inPinyin = planKey("zh");
  settings.setStudySetting("writing.zh", "characters");
  const inCharacters = planKey("zh");
  assert(inPinyin !== inCharacters && JSON.parse(inPinyin).at(-1) === "pinyin" && JSON.parse(inCharacters).at(-1) === "characters", `${inPinyin} / ${inCharacters}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
