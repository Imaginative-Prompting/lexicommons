// Every activity a session records has a name in a word's History (know/activity-names.js), never its raw id (9 Nov 2026: What does it
// say?, What does it mean?, Tap the picture and Pick the word showed as translate, meaning, see and word). What a session can record: each
// kind study/progress.js TESTS lists (session.js, deck-steps.js and practice cards look the activity up there as they record it, so it's
// one of them), the reader's, and a talk with your AI (practice:<kind>); and, read from the code, every string an `activity:` is given
// anywhere under public/js. A game's name is plan.js GAMES' own, so Study and History say the same. Controls: the names from before fail on
// the four and more, a kind added to TESTS with no name fails, and a planted `activity: "…"` no one named is caught.
// `node scripts/test-activity-names.mjs` (exit 0 = pass).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
const { activityName } = await import("../public/js/know/activity-names.js");
const { GAMES } = await import("../public/js/study/plan.js");
const { TESTS } = await import("../public/js/study/progress.js");
const { KINDS: PRACTICE_KINDS } = await import("../public/js/practice/protocol.js");

let failed = 0;
const test = async (name, fn) => {
  try {
    const detail = await fn();
    console.log(`  ok    ${name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
};

/** The kinds `nameOf` leaves without a name: none, an empty one, or the id itself. */
const unnamed = (nameOf, kinds) =>
  kinds.filter((kind) => {
    const name = nameOf(kind);
    return typeof name !== "string" || !name.trim() || name === kind;
  });

const recorded = [...Object.keys(TESTS), "reader", ...Object.keys(PRACTICE_KINDS).map((kind) => `practice:${kind}`)];

// Every string an `activity:` key is given in the code (a literal, or each one in a ternary), where it sits as an object's key.
function activityStrings(files) {
  const found = [];
  for (const [file, text] of files) {
    for (const m of text.matchAll(/(?:^|[{,(]\s*)activity:\s*((?:"[^"\n]*"|'[^'\n]*'|`[^`\n]*`|[^,}"'`\n])*)/gm)) {
      for (const s of m[1].matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`/g)) {
        const value = s[1] ?? s[2] ?? s[3];
        found.push({ file, line: text.slice(0, m.index).split("\n").length + 1 - (m[0].startsWith("\n") ? 0 : 1), value, template: s[3] !== undefined });
      }
    }
  }
  return found;
}
function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (name.endsWith(".js")) out.push([relative(APP, path), readFileSync(path, "utf8")]);
  }
  return out;
}
/** The strings found with no name: a template only as practice:${…} (its kinds are checked above), anything else by activityName. */
const nameless = (strings, nameOf) =>
  strings.filter(({ value, template }) => (template ? !/^practice:\$\{\w+\}$/.test(value) : unnamed(nameOf, [value]).length > 0));

await test("every kind a session records (TESTS', the reader's, each talk with your AI) has a name, never its id", async () => {
  const missing = unnamed(activityName, recorded);
  assert.deepEqual(missing, [], `no name: ${missing.join(", ")}`);
  return `${recorded.length} kinds`;
});

await test("a game's name is GAMES' own, every one of them, so Study and History say the same", async () => {
  const off = Object.keys(GAMES).filter((key) => activityName(key) !== GAMES[key].name);
  assert.deepEqual(off, [], off.map((key) => `${key}: ${activityName(key)} ≠ ${GAMES[key].name}`).join("; "));
  return `${Object.keys(GAMES).length} games`;
});

await test("the ones History showed as ids, and the rest it lacked, by their names", async () => {
  const expected = {
    translate: "What does it say?",
    meaning: "What does it mean?",
    see: "Tap the picture",
    word: "Pick the word",
    repeat: "Repeat after",
    "read-aloud": "Read it aloud",
    "type-sound": "Type how it's said",
    marked: "Marked as done",
    meet: "Met in a lesson",
    "listen-order": GAMES.listen.name,
    write: GAMES.type.name,
  };
  for (const [kind, name] of Object.entries(expected)) assert.equal(activityName(kind), name, kind);
  assert.equal(activityName("practice:conversation"), `Talk: ${PRACTICE_KINDS.conversation.name}`);
  assert.equal(activityName("brand-new-game"), null, "one nothing knows is null, for History's fallback");
});

await test("every string an `activity:` is given in public/js is named", async () => {
  const strings = activityStrings(sources(join(APP, "public/js")));
  const missing = nameless(strings, activityName);
  assert.deepEqual(missing, [], missing.map((s) => `${s.file}:${s.line} "${s.value}"`).join(", "));
  assert.ok(strings.length >= 25, `only ${strings.length} found: the reading of the code is broken`);
  return `${strings.length} strings in ${new Set(strings.map((s) => s.file)).size} files`;
});

// ---------- controls ----------

await test("the control: History's names from before leave the four, and more, as ids", async () => {
  // know/concept.js's ACTIVITY and activityName as they were (v593), verbatim.
  const ACTIVITY = {
    card: "Study card",
    choose: "Choose",
    arrange: "Put it in Dutch order",
    "arrange-english": "English tiles",
    place: "Where does it go?",
    fill: "Fill the gap",
    type: "Type it",
    write: "Type it",
    "type-heard": "Type what you hear",
    "type-word": "Type the word",
    "type-gap": "Type in the gap",
    "hear-gap": "Type what it says",
    "say-word": "Say the word",
    "repeat-word": "Repeat the word",
    "listen-type": "Listening",
    "listen-meaning": "Listening",
    "listen-order": "Listening",
    match: "Match",
    say: "Say it",
    reader: "Reading",
  };
  const before = (activity = "") => ACTIVITY[activity] ?? (activity.startsWith("practice:") ? `Talk: ${PRACTICE_KINDS[activity.slice(9)]?.name ?? "with your AI"}` : activity);
  const missing = unnamed(before, recorded);
  for (const kind of ["translate", "meaning", "see", "word", "repeat", "read-aloud"]) assert.ok(missing.includes(kind), `${kind} not caught`);
  return `caught ${missing.join(", ")}`;
});

await test("the control: a kind added to TESTS with no name is caught", async () => {
  assert.deepEqual(unnamed(activityName, [...recorded, "spin-the-wheel"]), ["spin-the-wheel"]);
});

await test("the control: a planted `activity: \"…\"` no one named is caught, in a ternary too", async () => {
  const planted = [["planted.js", 'record([{ concept, outcome: "right", activity: "spin-the-wheel", ...TESTS.see }]);\nconst row = { activity: fast ? "see" : "tumble" };']];
  const missing = nameless(activityStrings(planted), activityName).map((s) => s.value);
  assert.deepEqual(missing, ["spin-the-wheel", "tumble"]);
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
