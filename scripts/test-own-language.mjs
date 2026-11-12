// A pack in a language Lexicommons doesn't list (12 Nov 2026), on the server (src/packs.ts) with the real migrations in SQLite
// (scripts/fixtures/worker-env.mjs): made with its definition (create_pack's side), in a language with spaces and in one written right to left
// without them; checked as a new pack's would be (check_items); a device's copy of it kept; sentences added to it; refused in words when its
// definition is missing or wrong, when one of ours is given one, and when a second pack of theirs in the same language says another. The
// language is known for one synchronous step at a time: every D1 statement runs with no learner's language in the registry, and the registry
// is as it was after every call. A study record in it is taken (src/coach.ts). Runs in Node: `node scripts/test-own-language.mjs` (exit 0 = pass).

import { join } from "node:path";
import { APP, workerEnv } from "./fixtures/worker-env.mjs";

const { env, sqlite, row } = workerEnv();
const { LANGUAGES } = await import(join(APP, "public/js/lang/index.js"));
const { createPack, addItems, checkItems, putCopy } = await import(join(APP, "src/packs.ts"));
const { checkRecord } = await import(join(APP, "src/coach.ts"));
const { applyChange } = await import(join(APP, "public/js/study/pack-authoring.js"));
const { checkPack } = await import(join(APP, "public/js/study/pack-format.js"));

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    const detail = await fn();
    passed++;
    console.log(`ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message}`);
  }
}
const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};
const eq = (actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${a} ≠ ${e}`);
};

// Every D1 statement, with whether a learner's own language was in the registry when it ran (an await between: it never may be).
const ownNow = () => Object.keys(LANGUAGES).filter((code) => LANGUAGES[code].own);
const duringStatements = [];
const prepare = env.DB.prepare.bind(env.DB);
env.DB.prepare = (sql) => {
  duringStatements.push(ownNow().join());
  return prepare(sql);
};
const registry = () => Object.keys(LANGUAGES).join();
const before = registry();

const OWNER = "user-own";
const DEVICE = "device-own-1";
sqlite.prepare("INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)").run(OWNER, "Learner", Date.now());
sqlite.prepare("INSERT INTO pack_devices (user_id, device_id, label, packs, added_at, seen_at) VALUES (?, ?, 'Phone', '[]', ?, ?)").run(OWNER, DEVICE, Date.now(), Date.now());
const changes = () => row("SELECT COUNT(*) AS n FROM pack_changes WHERE user_id = ?", OWNER).n;
const queuedPack = (packId) => JSON.parse(row("SELECT body FROM pack_changes WHERE user_id = ? AND pack_id = ? ORDER BY seq LIMIT 1", OWNER, packId).body).pack;

const TESTISH = { name: "Testish" };
const sentence = (id, text, literal, natural, lemmas, wrong, gap) => ({ id, sentence: text, lemmas, literal, english: null, natural, wrong, gap, patterns: ["greeting"] });
// A language of its own has no shared grammar: what its sentences are examples of is the pack's own.
const PATTERNS = { greeting: { name: "Greetings", about: "How people greet each other." } };
const testish = (over = {}) => ({
  name: "Testish greetings",
  language: "und-x-testish",
  language_def: TESTISH,
  items: [
    sentence("suilad", "Suilad mellon.", ["Greetings", "friend"], "Greetings, friend.", { mellon: "mellon" }, ["Mellon suilad."], { word: "mellon", options: ["mellon", "mellyn", "meleth"] }),
    sentence("mae", "Mae govannen.", ["Well", "met"], "Well met.", { govannen: "govannen" }, ["Govannen mae."], { word: "govannen", options: ["govannen", "govanen", "govannon"] }),
  ],
  words: { mellon: "friend", govannen: "met" },
  patterns: PATTERNS,
  ...over,
});
const RTLISH = { name: "Rtlish", direction: "rtl", written: "unspaced", case: "any", ends: ["።"] };
const rtlish = () => ({
  name: "Rtlish greetings",
  language: "und-x-rtlish",
  language_def: RTLISH,
  items: [{ id: "selam", sentence: "ሰላምነህ።", words: ["ሰላም", "ነህ"], lemmas: { ሰላም: "ሰላም" }, literal: ["Peace", "are you"], english: null, natural: "Are you well?", wrong: ["ነህሰላም።"], gap: { word: "ነህ", options: ["ነህ", "ነሽ", "ናችሁ"] }, patterns: ["greeting"] }],
  words: { ሰላም: "peace" },
  patterns: PATTERNS,
});

await test("a pack in a made-up language with spaces is made with its definition, kept with every default said, and queued for their devices", async () => {
  const made = await createPack(env, OWNER, "oauth:Claude", testish());
  ok(made.ok, JSON.stringify(made.errors));
  const pack = queuedPack(made.packId);
  eq(pack.language, "und-x-testish");
  eq(pack.languageDef, { name: "Testish", direction: "ltr", written: "spaces", case: "lower", ends: [] });
  eq(pack.items.map((item) => item.text), ["Suilad mellon.", "Mae govannen."]);
  return `${made.packId}, ${pack.items.length} sentences`;
});

await test("a pack in a made-up language written right to left without spaces: its sentence is its words joined with nothing, its own end mark", async () => {
  const made = await createPack(env, OWNER, "oauth:Claude", rtlish());
  ok(made.ok, JSON.stringify(made.errors));
  const pack = queuedPack(made.packId);
  eq(pack.languageDef, { name: "Rtlish", direction: "rtl", written: "unspaced", case: "any", ends: ["።"] });
  eq(pack.items[0].words.map(([word]) => word), ["ሰላም", "ነህ"]);
  eq([pack.items[0].text, pack.items[0].punct], ["ሰላምነህ።", "።"]);
});

await test("check_items for a new pack in a made-up language checks it as create_pack would, and keeps nothing", async () => {
  const n = changes();
  const checked = await checkItems(env, OWNER, { language: "und-x-testish", language_def: TESTISH, items: testish().items, words: testish().words, patterns: PATTERNS });
  ok(checked.ok && checked.new === 2, JSON.stringify(checked));
  eq(changes(), n);
  const without = await checkItems(env, OWNER, { language: "und-x-testish", items: testish().items }).then(() => null, (error) => error.message);
  ok(without?.includes('language "und-x-testish" isn\'t one Lexicommons knows') && without.includes("languageDef"), `without a definition: ${without}`);
});

await test("a device's copy of it is kept, and sentences added to it keep its language and definition", async () => {
  const id = (await createPack(env, OWNER, "oauth:Claude", testish({ name: "Testish more" }))).packId;
  const created = queuedPack(id);
  const copied = await putCopy(env, OWNER, DEVICE, id, { pack: created, through: 0 });
  ok(copied !== undefined, "no answer to the copy");
  const added = await addItems(env, OWNER, "oauth:Claude", { pack_id: id, items: [sentence("hannon", "Hannon le.", ["Thanks", "to you"], "Thank you.", { hannon: "hannon" }, ["Le hannon."], { word: "le", options: ["le", "lin", "len"] })], words: { hannon: "thanks" } });
  ok(added.ok, JSON.stringify(added.errors));
  const last = JSON.parse(row("SELECT body FROM pack_changes WHERE user_id = ? AND pack_id = ? ORDER BY seq DESC LIMIT 1", OWNER, id).body);
  eq(last.kind, "add");
  eq(last.items.map((item) => item.text), ["Hannon le."]);
  // As a device applies it: the pack as it will be, checked with its language (checkPack knows it for that check).
  const after = checkPack(applyChange(created, last).pack, { installed: [] });
  eq(after.errors, []);
  eq(after.pack.languageDef, created.languageDef);
  return `${after.pack.items.length} sentences`;
});

await test("refused in words, with nothing queued: no definition, a wrong one, one of ours given one, a region tag, and a second pack saying another definition of a language they have", async () => {
  const n = changes();
  const refused = async (over, at, words) => {
    const made = await createPack(env, OWNER, "oauth:Claude", testish(over));
    ok(!made.ok && made.errors.some((e) => e.at === at && e.message.includes(words)), `${JSON.stringify(over)}: ${JSON.stringify(made.errors)}`);
  };
  await refused({ language_def: undefined }, "language_def", "carries languageDef");
  await refused({ language_def: { name: "Testish", direction: "down" } }, "language_def.direction", '"ltr" or "rtl"');
  await refused({ language: "nl", language_def: { name: "Dutch" } }, "language_def", "leave language_def out");
  await refused({ language: "de-CH", language_def: { name: "Swiss German" } }, "language", "names a region");
  // Their device has a pack in Testish as it was defined; a new one saying it's written right to left is refused.
  const theirs = (await createPack(env, OWNER, "oauth:Claude", testish({ name: "Testish kept" }))).packId;
  await putCopy(env, OWNER, DEVICE, theirs, { pack: queuedPack(theirs), through: 0 });
  const n2 = changes();
  await refused({ name: "Testish backwards", language_def: { name: "Testish", direction: "rtl" } }, "language_def", "a pack in the same language says the same");
  eq(changes(), n2);
  ok(n2 === n + 1, `${n2 - n} changes queued by refusals`);
});

await test("a study record in a language of its own is taken by its shape (its name comes with it from the device)", () => {
  const said = (language) => {
    try {
      checkRecord({ version: 1, language });
      return "";
    } catch (error) {
      return error.message;
    }
  };
  for (const language of ["und-x-testish", "kw", "nl-x-gronings", "und-x-my-family-dialect", "nl", "zh-Hant"]) ok(!said(language).includes("names its language"), `${language} refused: ${said(language)}`);
  for (const language of ["X-Testish", "x-", "../nl", "und-x-abcdefghijklm"]) ok(said(language).includes("names its language"), `${language} taken`);
});

await test("no learner's language is in the registry while any D1 statement runs, and none is left after", () => {
  ok(duringStatements.length > 20, `only ${duringStatements.length} statements seen`);
  const during = duringStatements.filter(Boolean);
  ok(during.length === 0, `a learner's language was in the registry during ${during.length} statements: ${[...new Set(during)].join(" ")}`);
  eq(registry(), before);
  return `${duringStatements.length} statements`;
});

console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
