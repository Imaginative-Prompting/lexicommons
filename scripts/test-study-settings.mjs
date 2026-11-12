// How you like to study, as each device reads it back (study/settings.js load): What does it say? showing its word-for-word line with the
// answer, on by default from version 2 (9 Nov 2026) and its hint still off. A device that saved its settings before then saved that line off
// with them, though no one chose it: it comes on once, the device's other settings and its hint as they were; one turned off from version 2
// on stays off, and through a reload. And on your other devices (12 Nov 2026, sync kind "study-settings"): each setting you choose a record
// dated when you chose it, what belongs to the device (Say it's recognizer and model, its voice, sound effects' own kind) never; what was
// chosen before, carried at the dawn of time and written only with the first change; another device's setting taken only when it's one of
// these and what it may be; Reset reaching every device, clearing the device forgetting them here alone. Each case a fresh read of a stored
// setting, localStorage stood in.
// `node scripts/test-study-settings.mjs [<app dir>]`: another copy's dir to see it fail on one from before (exit 0 = pass).
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const APP = resolve(process.argv[2] ?? new URL("..", import.meta.url).pathname);
const KEY = "lx.study.v1";
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => void store.set(key, String(value)),
  removeItem: (key) => void store.delete(key),
};
let reads = 0;
/** The settings module read afresh with `saved` stored (null: nothing stored), as a device starting the app. */
async function startWith(saved) {
  store.clear();
  if (saved !== null) store.set(KEY, JSON.stringify(saved));
  return import(`${pathToFileURL(`${APP}/public/js/study/settings.js`).href}?start=${++reads}`);
}

let failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
};

// A device's settings as one saved before version 2 had them: the whole object, the old defaults with it (setStudySetting saves it all).
const before = (change = {}) => ({
  version: 1,
  practice: { minutes: 5, suggestEvery: 3 },
  translate: { hint: false, literal: false },
  see: { hint: false, literal: false },
  word: { hint: false, literal: false },
  right: { literal: true },
  arrange: { hint: true, literal: true, tiles: "mix", stray: true },
  ...change,
});

await test("a new device: What does it say? shows its word-for-word line with the answer, and offers no hint", async () => {
  const { getStudySettings } = await startWith(null);
  const s = getStudySettings();
  assert.deepEqual(s.translate, { hint: false, literal: true });
  assert.equal(s.right.literal, true, "the line on right answers");
});

await test("saved before version 2, the line off as every save had it: on once", async () => {
  const { getStudySettings } = await startWith(before());
  assert.equal(getStudySettings().translate.literal, true);
});

await test("the rest as the device had them: another game's choice and What does it say?'s hint, off or on", async () => {
  let s = (await startWith(before({ arrange: { hint: true, literal: true, tiles: "dutch", stray: false } }))).getStudySettings();
  assert.equal(s.arrange.tiles, "dutch");
  assert.equal(s.arrange.stray, false);
  assert.equal(s.translate.hint, false);
  s = (await startWith(before({ translate: { hint: true, literal: false } }))).getStudySettings();
  assert.deepEqual(s.translate, { hint: true, literal: true }, "a hint someone turned on is theirs");
});

await test("saved with no version at all (the oldest saves), the line off: on", async () => {
  const saved = before();
  delete saved.version;
  assert.equal((await startWith(saved)).getStudySettings().translate.literal, true);
});

await test("turned off from version 2 on: stays off, and through a reload", async () => {
  const first = await startWith(before());
  first.setStudySetting("translate.literal", false);
  const kept = JSON.parse(store.get(KEY));
  assert.equal(kept.version, 2, "the save says version 2");
  assert.equal(kept.translate.literal, false);
  // The same device starting again, from what it saved.
  assert.equal((await startWith(kept)).getStudySettings().translate.literal, false);
  // And a save that says version 2 with it off, from another of the person's devices.
  assert.equal((await startWith({ ...before(), version: 2 })).getStudySettings().translate.literal, false);
});

await test("on before version 2 (someone turned it on): still on", async () => {
  assert.equal((await startWith(before({ translate: { hint: false, literal: true } }))).getStudySettings().translate.literal, true);
});

// ---------- on your other devices ----------

const TIMES = "lx.study.times.v1";
const shown = (records) => Object.fromEntries(Object.entries(records).map(([path, r]) => [path, [r.at > 1e12 ? "now" : r.at, r.value]]));

await test("a setting you choose goes to your other devices, dated when you chose it; what belongs to this device stays on it", async () => {
  const S = await startWith(null);
  assert.deepEqual(S.studySettingsSync.records(), {}, "a new device's defaults go nowhere");
  let told = 0;
  S.studySettingsSync.onChange(() => told++);
  const t = Date.now();
  S.setStudySetting("cards.reveal", "dutch");
  S.setStudySetting("quick.include.match", false);
  S.setStudySetting("listening.pins.account-cafe", "anna");
  for (const [path, value] of [["say.engine", "whisper"], ["say.model", "whisper-small"], ["listening.device", "Xander"], ["sound.effects", false], ["sound.at", 5]]) S.setStudySetting(path, value);
  const records = S.studySettingsSync.records();
  assert.deepEqual(shown(records), { "cards.reveal": ["now", "dutch"], "quick.include.match": ["now", false], "listening.pins.account-cafe": ["now", "anna"] });
  assert.ok(Object.values(records).every((r) => r.at >= t), "dated when chosen");
  assert.equal(told, 3, "a sync asked for each of the three, none for the device's own");
});

await test("chosen before they went to other devices: carried as set at the dawn of time (1), nothing written on start, written with the first change", async () => {
  const S = await startWith({ version: 2, practice: { minutes: 10, suggestEvery: 3 }, say: { engine: "whisper" }, listening: { device: "Xander", pins: { "account-cafe": "anna" } }, cards: { reveal: "dutch" }, arrange: { tiles: "mix" } });
  assert.deepEqual(shown(S.studySettingsSync.records()), { "practice.minutes": [1, 10], "cards.reveal": [1, "dutch"], "listening.pins.account-cafe": [1, "anna"] }, "only what differs from the defaults, and none of the device's own");
  assert.equal(store.has(TIMES), false, "opening a page writes nothing");
  S.setStudySetting("match.pairs", 6);
  assert.deepEqual(Object.keys(JSON.parse(store.get(TIMES))).sort(), ["cards.reveal", "listening.pins.account-cafe", "match.pairs", "practice.minutes"]);
  // Read back on the next start, the same.
  const again = await import(`${pathToFileURL(`${APP}/public/js/study/settings.js`).href}?start=${++reads}`);
  assert.deepEqual(shown(again.studySettingsSync.records()), { "practice.minutes": [1, 10], "cards.reveal": [1, "dutch"], "listening.pins.account-cafe": [1, "anna"], "match.pairs": ["now", 6] });
});

await test("another device's settings: taken only when each is one of these settings and what it may be (crafted ones turned down), and taking them asks for no sync", async () => {
  const S = await startWith(null);
  const k = S.studySettingsSync;
  const fine = [["cards.reveal", "english"], ["quick.include.say", false], ["practice.minutes", 10], ["memory.target", 0.95], ["match.pairs", 6], ["listening.speed", "slower"], ["listening.pins.trip-utrecht", "anna"], ["listening.pins.trip-utrecht", null]];
  for (const [path, value] of fine) assert.equal(k.check({ at: 5, value }, path), true, `${path} = ${JSON.stringify(value)}`);
  const crafted = [
    ["__proto__.polluted", true], ["constructor.prototype.x", true], ["practice", { minutes: 1 }], ["practice.minutes", "5"], ["practice.minutes", 1e9], ["practice.minutes", Number.NaN],
    ["memory.target", 2], ["cards.reveal", "sideways"], ["quick.include.made-up", true], ["quick.include", {}], ["listening.pins.__proto__", "anna"], ["listening.pins.trip-utrecht", "Anna Smith"],
    ["listening.pins.trip-utrecht", 7], ["say.engine", "whisper"], ["say.model", "x"], ["listening.device", "x"], ["sound.effects", false], ["version", 3], ["cards.flip", "yes"], ["x".repeat(200), true],
  ];
  for (const [path, value] of crafted) assert.equal(k.check({ at: 5, value }, path), false, `turned down: ${path} = ${JSON.stringify(value)}`);
  assert.equal(k.check({ at: 5, gone: true }, "cards.reveal"), false, "a setting is never deleted, only set");
  let told = 0;
  let heard = null;
  k.onChange(() => told++);
  S.onStudySettingsChange((s) => (heard = s));
  k.apply({ "cards.reveal": { at: 5, value: "english" }, "listening.pins.trip-utrecht": { at: 6, value: "anna" } });
  assert.equal(S.getStudySettings().cards.reveal, "english");
  assert.equal(S.getStudySettings().listening.pins["trip-utrecht"], "anna");
  assert.equal(heard?.cards.reveal, "english", "the screens told");
  assert.equal(told, 0, "no sync asked for what a sync brought");
  assert.deepEqual(shown(k.records()), { "cards.reveal": [5, "english"], "listening.pins.trip-utrecht": [6, "anna"] }, "kept with the time it was set elsewhere");
  assert.equal(JSON.parse(store.get(KEY)).cards.reveal, "english", "saved here");
  assert.equal({}.polluted, undefined);
});

await test("Reset in Settings → Study reaches every device (each chosen setting back to its default, dated now); clearing this device forgets them here alone", async () => {
  let S = await startWith(null);
  S.setStudySetting("cards.reveal", "dutch");
  S.setStudySetting("listening.pins.trip-utrecht", "anna");
  S.setStudySetting("say.engine", "whisper");
  let told = 0;
  S.studySettingsSync.onChange(() => told++);
  const t = Date.now();
  S.resetStudySettings({ everywhere: true });
  const records = S.studySettingsSync.records();
  assert.deepEqual(shown(records), { "cards.reveal": ["now", "slide"], "listening.pins.trip-utrecht": ["now", null] });
  assert.ok(Object.values(records).every((r) => r.at >= t));
  assert.equal(told, 1, "a sync asked for");
  assert.equal(S.getStudySettings().say.engine, "browser", "this device's own back to its default too");
  S = await startWith(null);
  S.setStudySetting("cards.reveal", "dutch");
  S.resetStudySettings();
  assert.deepEqual(S.studySettingsSync.records(), {}, "nothing for other devices");
  assert.equal(store.has(KEY) || store.has(TIMES), false, "nothing kept here");
});

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
