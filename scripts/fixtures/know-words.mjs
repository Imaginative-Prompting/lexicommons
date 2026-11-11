// Every word of what's being studied, known: evidence as a game writes it. A session of one game runs on whole sentences only
// when at most one word in them is new (study/plan.js), so a check of a game itself starts here. It waits for the words of the
// language being learned (a start's packs can come in after the app is ready, and words read before them were none, or another
// language's), and returns once the rows are saved on the device, not only in the page (untilSaved). Returns how many units it
// recorded, for a check to hold above 0.
export const knowWords = async (page, except = [], { timeout = 30_000 } = {}) => {
  await page.waitForSelector("html[data-app-ready]");
  const deadline = Date.now() + timeout;
  const ready = () =>
    page.evaluate(async () => {
      const [{ learning }, { contentLanguage, ITEMS }] = await Promise.all([import("/js/study/learning.js"), import("/js/study/content.js")]);
      // Its items in (a language of only your own items has no word list, and that's still the language's content).
      return contentLanguage() === learning() && ITEMS.length > 0;
    });
  while (!(await ready())) {
    if (Date.now() > deadline) throw new Error(`the words of the language being learned never came (${timeout / 1000} s)`);
    await page.waitForTimeout(100);
  }
  const { last, count } = await page.evaluate(async (except) => {
    const { record } = await import("/js/study/progress.js");
    const { CHUNKS, WORDS } = await import("/js/study/content.js");
    const units = [...Object.keys(WORDS).filter((word) => !except.includes(word)).map((word) => `w:${word}`), ...Object.keys(CHUNKS).map((id) => `c:${id}`)];
    return { last: record(units.map((concept) => ({ concept, outcome: "right", test: "recall", skill: "read", activity: "meaning", item: "check" }))).at(-1)?.uid ?? null, count: units.length };
  }, except);
  await untilSaved(page, last);
  return count;
};

// Whether the evidence row with this uid is saved in the device's storage (study/progress.js's IndexedDB). A read made after a
// write that's still going waits for it, so this answers once that write has finished.
const savedOnDevice = (uid) =>
  new Promise((resolve) => {
    const open = indexedDB.open("lexicommons-study");
    open.onerror = () => resolve(false);
    open.onsuccess = () => {
      const database = open.result;
      try {
        const get = database.transaction("evidence", "readonly").objectStore("evidence").index("uid").getKey(uid);
        get.onsuccess = () => {
          database.close();
          resolve(get.result !== undefined);
        };
        get.onerror = () => {
          database.close();
          resolve(false);
        };
      } catch {
        database.close();
        resolve(false);
      }
    };
  });

/**
 * Waits until the evidence row with this uid (the last one a record() call returned) is saved on the device. record() writes
 * its rows in one transaction and returns before it's done, and the more there is, the longer it takes: every word of Dutch's
 * eleven default packs took longer than the 150 ms checks once waited, so a reload right after lost them all (v93, 5 Nov).
 */
export async function untilSaved(page, uid, { timeout = 30_000 } = {}) {
  if (!uid) return;
  const deadline = Date.now() + timeout;
  while (!(await page.evaluate(savedOnDevice, uid))) {
    if (Date.now() > deadline) throw new Error(`the evidence written (${uid}) still isn't saved on the device after ${timeout / 1000} s`);
    await page.waitForTimeout(50);
  }
}
