// How you like to study, as each device reads it back (study/settings.js load): What does it say? showing its word-for-word line with the
// answer, on by default from version 2 (9 Nov 2026) and its hint still off. A device that saved its settings before then saved that line off
// with them, though no one chose it: it comes on once, the device's other settings and its hint as they were; one turned off from version 2
// on stays off, and through a reload. Each case a fresh read of a stored setting, localStorage stood in.
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

console.log(failed ? `${failed} FAILED` : "all passed");
process.exit(failed ? 1 : 0);
