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
  ok(without?.includes('language "und-x-testish" isn\'t one Lexicommons knows') && without.includes("language_def"), `without a definition: ${without}`);
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
  await refused({ language_def: undefined }, "language_def", "carries language_def");
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

// Worked cases (the director, 12 Nov 2026). Burmese: an ISO 639 code we don't list, Myanmar script, written without spaces, ။ its full stop.
// Toki Pona: a small language written with spaces, made as an AI that has read only get_pack_guide would make it.
const WANTING = { want: { name: "Wanting", about: "What you want to do: the thing, the verb, then ချင် (want) and တယ် (it is so)." } };
const BURMESE = { name: "Burmese", written: "unspaced", case: "any", ends: ["။"] };
const itself = (words) => Object.fromEntries(words.map((word) => [word, word]));
const my = (id, words, literal, natural, wrong, gap, pattern, sentence = `${words.join("")}။`) => ({ id, sentence, words, lemmas: itself(words), literal, english: null, natural, wrong: [wrong], gap, patterns: [pattern] });
// ကြည့် (look) as some keyboards type it: the asat (U+103A) before the dot below (U+1037), the other way round from Unicode's order.
const LOOK_TYPED = "ကြည့်";
const LOOK = "ကြည့်";
const burmese = (over = {}) => ({
  name: "Burmese first words",
  language: "my",
  language_def: BURMESE,
  items: [
    my("hello", ["မင်္ဂလာ", "ပါ"], ["Blessings", "(polite)"], "Hello.", "ပါမင်္ဂလာ။", { word: "မင်္ဂလာ", options: ["မင်္ဂလာ", "ကျေးဇူး", "ကောင်း"] }, "greeting"),
    my("water", ["ရေ", "သောက်", "ချင်", "တယ်"], ["Water", "drink", "want", "(it is so)"], "I want to drink water.", "သောက်ရေချင်တယ်။", { word: "ရေ", options: ["ရေ", "ကော်ဖီ", "လက်ဖက်ရည်"] }, "want"),
    // The sentence typed with ကြည့်'s marks out of order, its words in Unicode's: both kept in one order, the sentence still its words joined.
    my("look", [LOOK, "ချင်", "တယ်"], ["Look", "want", "(it is so)"], "I want to look.", "ချင်ကြည့်တယ်။", { word: "ချင်", options: ["ချင်", "တယ်", "ပါ"] }, "want", `${LOOK_TYPED}ချင်တယ်။`),
  ],
  words: { မင်္ဂလာ: "blessings", ပါ: "(polite)", ရေ: "water", သောက်: "drink", ချင်: "want", တယ်: "(it is so)", [LOOK]: "look" },
  patterns: { ...PATTERNS, ...WANTING },
  ...over,
});
const TOKI_PONA = { name: "Toki Pona", case: "any" };
const tok = (id, text, literal, natural, wrong, gap) => ({ id, sentence: text, lemmas: itself(text.replace(/[.!?]$/, "").split(" ")), literal, english: null, natural, wrong: [wrong], gap, patterns: ["greeting"] });
const tokiPona = (over = {}) => ({
  name: "Toki Pona first words",
  language: "tok",
  language_def: TOKI_PONA,
  items: [
    // As Toki Pona writes them: small letters from the start, a person's name with its capital.
    tok("sina", "sina pona.", ["You", "good"], "You're good.", "pona sina.", { word: "pona", options: ["pona", "ike", "suli"] }),
    tok("telo", "mi wile e telo.", ["I", "want", "(the thing:)", "water"], "I want water.", "telo e wile mi.", { word: "telo", options: ["telo", "moku", "pona"] }),
    tok("sonja", "jan Sonja li pona.", ["Person", "Sonja", "(is)", "good"], "Sonja is good.", "pona li Sonja jan.", { word: "pona", options: ["pona", "ike", "suli"] }),
  ],
  words: { sina: "you", pona: "good", mi: "I; me", wile: "want", e: "(the thing:)", telo: "water", jan: "person", Sonja: "Sonja (a name)", li: "(is)" },
  patterns: PATTERNS,
  ...over,
});

await test("Burmese (my, an ISO 639 code we don't list), in Myanmar script without spaces: its definition with case left to its default refused at each word saying \"case\": \"any\" (the script has no small letters), then made; each sentence its words joined with nothing and ။ its end, a stacked consonant (မင်္ဂလာ's kinzi) kept as written, a word typed with its marks out of order kept in Unicode's order in the sentence and its words, and every Intl API takes its code", async () => {
  // As the guide's smallest definition would have it, case left to its default (lower): every word refused, each saying the fix.
  const n = changes();
  const first = await createPack(env, OWNER, "oauth:Claude", burmese({ language_def: { name: "Burmese", written: "unspaced", ends: ["။"] } }));
  const lemmaErrors = first.ok ? [] : first.errors.filter((e) => e.message.includes("isn't a dictionary form"));
  ok(!first.ok && lemmaErrors.length >= 5 && lemmaErrors.every((e) => e.message.includes('language_def "case": "any"')), `case left to its default: ${JSON.stringify(first.errors).slice(0, 400)}`);
  eq(changes(), n);
  const made = await createPack(env, OWNER, "oauth:Claude", burmese());
  ok(made.ok, JSON.stringify(made.errors));
  const pack = queuedPack(made.packId);
  eq(pack.language, "my");
  eq(pack.languageDef, { name: "Burmese", direction: "ltr", written: "unspaced", case: "any", ends: ["။"] });
  const hello = pack.items.find((item) => item.id === "hello");
  eq(hello.words.map(([word]) => word), ["မင်္ဂလာ", "ပါ"]);
  eq([hello.text, hello.punct], ["မင်္ဂလာပါ။", "။"]);
  const look = pack.items.find((item) => item.id === "look");
  eq(look.words.map(([word]) => word), [LOOK, "ချင်", "တယ်"]);
  eq(look.text, `${LOOK}ချင်တယ်။`);
  ok(!JSON.stringify(pack).includes(LOOK_TYPED), "the marks' typed order is still in the pack");
  // Every Intl API the app hands a learning language's code to.
  new Intl.Segmenter("my", { granularity: "word" });
  new Intl.Collator("my").compare("ရေ", "ကော်ဖီ");
  new Intl.PluralRules("my").select(2);
  "ရေ".toLocaleLowerCase("my");
  eq(Intl.getCanonicalLocales("my"), ["my"]);
  return `${made.packId}: ${pack.items.map((item) => item.text).join(" ")}`;
});

await test("Toki Pona (tok), as an AI that has read only the guide would make it: its name as the language refused naming the code forms; tok with no definition refused naming language_def; with its name alone, a person's name (Sonja) refused saying \"case\": \"any\" (and one of ours never told so); then made, its sentences in small letters from the start as Toki Pona writes them, Sonja with its capital", async () => {
  const n = changes();
  const asName = await createPack(env, OWNER, "oauth:Claude", tokiPona({ language: "toki pona", language_def: undefined }));
  ok(!asName.ok && asName.errors.some((e) => e.at === "language" && e.message.includes("isn't a language code") && e.message.includes("ISO 639")), `as its name: ${JSON.stringify(asName.errors)}`);
  const bare = await createPack(env, OWNER, "oauth:Claude", tokiPona({ language_def: undefined }));
  ok(!bare.ok && bare.errors.some((e) => e.at === "language_def" && e.message.includes("carries language_def")), `with no definition: ${JSON.stringify(bare.errors)}`);
  // Its name alone: Sonja, a name written with its capital, isn't a dictionary form in small letters; the refusal says what to change.
  const nameOnly = await createPack(env, OWNER, "oauth:Claude", tokiPona({ language_def: { name: "Toki Pona" } }));
  ok(!nameOnly.ok && nameOnly.errors.some((e) => e.at.includes("Sonja") && e.message.includes('language_def "case": "any"')), `its name alone: ${JSON.stringify(nameOnly.errors).slice(0, 400)}`);
  ok(nameOnly.errors.every((e) => e.at.includes("Sonja")), `its name alone, besides Sonja: ${JSON.stringify(nameOnly.errors.filter((e) => !e.at.includes("Sonja")))}`);
  // One of ours is never told to change a definition it doesn't have.
  const dutch = await createPack(env, OWNER, "oauth:Claude", { ...tokiPona(), name: "Dutch names", language: "nl", language_def: undefined, items: [{ id: "anna", sentence: "Anna is goed.", lemmas: { Anna: "Anna", is: "zijn", goed: "goed" }, literal: ["Anna", "is", "good"], english: null, natural: "Anna is good.", wrong: ["Goed is Anna."], gap: { word: "goed", options: ["goed", "slecht", "groot"] }, patterns: ["greeting"] }], words: { Anna: "Anna (a name)", zijn: "to be", goed: "good" } });
  const dutchLemma = dutch.ok ? null : dutch.errors.find((e) => e.message.includes("isn't a dictionary form"));
  ok(dutchLemma && !dutchLemma.message.includes("language_def"), `Dutch's capitalized word: ${JSON.stringify(dutchLemma)}`);
  eq(changes(), n);
  const made = await createPack(env, OWNER, "oauth:Claude", tokiPona());
  ok(made.ok, JSON.stringify(made.errors));
  const pack = queuedPack(made.packId);
  eq(pack.languageDef, { name: "Toki Pona", direction: "ltr", written: "spaces", case: "any", ends: [] });
  eq(pack.items.map((item) => item.text), ["sina pona.", "mi wile e telo.", "jan Sonja li pona."]);
  eq(Intl.getCanonicalLocales("tok"), ["tok"]);
  return `${made.packId}: ${pack.items.map((item) => item.text).join(" ")}`;
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
