// The first run (shell/welcome.js) as a check passes it, in one place: what to learn, then, for a full course, whether you know some of it
// already (Find your level, study/placement.js: "No, I'm new to it" unless a check asks for another answer), then the first run gone. A check
// that drives the first run uses these, so the next step the first run gets changes this file and no check. (Only a check that sets
// LX_FIRST_RUN sees a first run at all: quiet-browser.mjs marks it done for every other.)

/** The first run's overlay. */
export const WELCOME = ".lx-welcome";
/** The rows of its question whether you know some of the language already: data-start new · few · by · talk. */
export const KNOW_SOME = `${WELCOME} [data-start]`;

// A press as a person makes it; a check that presses by script (a row under the fold, a list still settling) passes its own.
const tap = (locator) => locator.click();

/**
 * After a language was pressed: the question whether you know some of it, when the first run asks it (a full course), answered `start`
 * ("new": No, I'm new to it; "few", "by", "talk": Find your level from there, the session it opens left to the check), and the first run
 * gone. Returns whether it was asked. A first run that closed at the press (a language with first lessons only) returns false at once.
 */
export async function pastKnowSome(page, { start = "new", press = tap, timeout = 15_000 } = {}) {
  await page.waitForFunction((rows) => !document.querySelector(".lx-welcome") || Boolean(document.querySelector(rows)), KNOW_SOME, { timeout });
  const row = page.locator(`${WELCOME} [data-start="${start}"]`);
  const asked = (await row.count()) > 0;
  if (asked) await press(row);
  await page.waitForSelector(WELCOME, { state: "detached", timeout });
  return asked;
}

/**
 * The first run's what to learn: `code` pressed in its list (waiting for the row), then pastKnowSome. Returns whether the second question
 * was asked.
 */
export async function chooseToLearn(page, code = "nl", { start = "new", press = tap, timeout = 30_000 } = {}) {
  const row = page.locator(`${WELCOME} [data-language="${code}"]`);
  await row.waitFor({ state: "attached", timeout });
  await press(row);
  return pastKnowSome(page, { start, press, timeout });
}

/** A press by script, for a check whose rows may be under the fold or moving: the row's own click(), with no scrolling or waiting for it. */
export const pressInPage = (locator) => locator.evaluate((node) => node.click());
