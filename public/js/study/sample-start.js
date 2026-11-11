// Turning the sample learner on and off on this device (Settings → About, for an admin; study/sample-mode.js says what it is). On: a learner
// made from this device's Dutch course (sample-learner.js), written into the sample's own stores, then a reload, so every part of the app
// starts on them. Off: the switch and the sample's stores go, then a reload onto yours, which nothing touched.

import { ITEMS, conceptsOf, contentLanguage, sentenceUnits } from "./content.js";
import { loadFrequency } from "./frequency.js";
import { pathLessons } from "./path.js";
import { targetOf } from "./new-words.js";
import { seedSampleEvidence } from "./progress.js";
import { DONE_KEYS } from "./done.js";
import { SAMPLE_FLAG, SAMPLE_PREFIX, readSample, sampleKey, turnSampleOff } from "./sample-mode.js";
import { courseOf, presetById, sampleLearner } from "./sample-learner.js";

const LANG = "nl";

/** The sample learner that's on now, as its preset ({ id, name, about, … }), or null. */
export const sampleNow = () => presetById(readSample()?.preset ?? "");

/** Whether this device has what a sample learner is made from: Dutch's lessons and words. Resolves to null, or why not, in words. */
export async function sampleReady() {
  if (contentLanguage() !== LANG) return "The sample learner is made from Dutch's lessons. Pick Dutch in Settings → Language first.";
  await loadFrequency(LANG).catch(() => {});
  if (!ITEMS.some((item) => item.pack === "path-nl") || pathLessons().length < 20) return "Dutch's lessons aren't on this device yet. Try again once they've come.";
  return null;
}

/**
 * Makes the preset's learner and puts it on this device in the sample's own stores, then reloads onto it. The switch goes on first, so
 * nothing goes out from any tab from here on; if writing fails, it goes off again and nothing of the sample is left.
 */
export async function startSample(presetId, { now = Date.now(), reload = true } = {}) {
  if (!presetById(presetId)) throw new Error("There's no such sample learner.");
  const why = await sampleReady();
  if (why) throw new Error(why);
  const course = courseOf({ lang: LANG, lessons: pathLessons(), items: ITEMS.filter((item) => (item.lang ?? LANG) === LANG), sentenceUnits, conceptsOf, targetOf });
  const learner = sampleLearner(presetId, course, { now });
  // Where the packs added to the path sit (path-place.js anchors: the layout, nothing learned), as this page has them: the sample's path is
  // laid out as the one it was made from, and its lessons come in the order it did them.
  let anchors = {};
  try {
    anchors = JSON.parse(localStorage.getItem(sampleKey("lx.path.v1")) ?? "null")?.[LANG]?.anchors ?? {};
  } catch {}
  try {
    localStorage.setItem(SAMPLE_FLAG, JSON.stringify({ preset: presetId, at: now }));
    // A sample from before goes (its keys; its evidence is replaced below, in its own database).
    for (const key of Object.keys(localStorage)) if (key.startsWith(SAMPLE_PREFIX)) localStorage.removeItem(key);
    await seedSampleEvidence(learner.evidence);
    localStorage.setItem(`${SAMPLE_PREFIX}${DONE_KEYS.log}`, JSON.stringify(learner.done));
    localStorage.setItem(`${SAMPLE_PREFIX}${DONE_KEYS.since}`, String(learner.since));
    localStorage.setItem(`${SAMPLE_PREFIX}lx.learning.v1`, JSON.stringify({ lang: LANG, from: "en" }));
    localStorage.setItem(`${SAMPLE_PREFIX}lx.path.v1`, JSON.stringify({ [LANG]: { lesson: null, at: now, marked: [], anchors } }));
  } catch (error) {
    await turnSampleOff();
    throw new Error(`The sample learner couldn't be kept on this device (${error?.message ?? error}). Your own progress is as it was.`);
  }
  if (reload) location.reload();
  return learner.counts;
}

/** Turns it off and reloads onto your own progress. */
export async function stopSample({ reload = true } = {}) {
  await turnSampleOff();
  if (reload) location.reload();
}
