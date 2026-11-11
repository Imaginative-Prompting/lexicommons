// The one way a check plays a session (study/session.js) step by step: each step answered by its kind as the session records it
// (root.lxStep: one of plan.js's GAMES, or card, meet and deck), never by its instruction's words, which change with the language and
// whenever a game is renamed. A kind with no handler here fails by name at once, rather than a check pressing on until the session runs
// out of steps ("the session should end in a summary": five checks did, quietly, the day the typing games came). A new game gets its
// handler in the same landing; scripts/test-play-session.mjs fails until it has one.
//
//   import { answerStep, playToSummary, stepNow, SESSION } from "./fixtures/play-session.mjs";
//   const step = await answerStep(page);                 // right, then Continue; returns what the step was (kind, item, …)
//   await answerStep(page, { wrong: true });             // a wrong answer where the game has one, else "I don't know"
//   const played = await playToSummary(page);            // every step to the summary (at most 40), each step's kind in order
//   await pastReminderAsk(page);                         // after a summary's Done: on past "Want a reminder?" if it came (Not now)
//
// Options: session (the session's selector), wrong, press (how a control is pressed: a check that records frames passes its real
// touch), speaking ("dont-know": I don't know, as nobody speaks; "cant-speak": Can't speak now, which swaps the step for one that
// needs no microphone, then that one is answered), next (false: answer and leave the result up, no Continue).

import { fillChoice } from "./step-text.mjs";

export const SESSION = '[data-part="session"]:not([data-ghost])';
const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactly = (text) => new RegExp(`^${esc(text)}$`);

/** The step on screen as the session records it, as plain data: null with no session; { kind: "summary" } at its end. */
export async function stepNow(page, { session = SESSION } = {}) {
  return page.evaluate(async (S) => {
    const root = document.querySelector(S);
    if (!root) return null;
    if (root.querySelector('[data-part="session-summary"]')) return { kind: "summary" };
    // After a summary's Done, once: the reminder ask, a step of its own with nothing to answer (pastReminderAsk goes on past it).
    if (root.querySelector('[data-part="reminder-step"]')) return { kind: "reminder-ask" };
    const step = root.lxStep;
    if (!step) return null;
    const item = step.item ?? null;
    let sentence = null;
    let gloss = null;
    if (item) {
      const content = await import("/js/study/content.js");
      sentence = content.sentence(item);
      if (step.kind === "meaning") {
        // The meaning as the form shows it ("ik" is "I", where the word's whole gloss is "I; me"): new-words.js glossOfForm.
        const { glossOfForm } = await import("/js/study/new-words.js");
        gloss = glossOfForm(step.target, item.words.find(([, word]) => word === step.target)?.[0] ?? step.target);
      }
    }
    const gap = item?.gap ? item.words[item.gap.index] : null;
    return {
      kind: step.kind,
      game: step.game ?? null,
      isNew: Boolean(step.isNew),
      target: step.target ?? null,
      unit: step.unit ?? null,
      // What a typing game wants typed: Type the word's own text, else the gap's word without the punctuation written after it.
      text: step.text ?? (gap ? gap[0].replace(/[.,;:!?…»”"')\]]+$/u, "") : null),
      means: step.means ?? null,
      correct: typeof step.correct === "number" ? step.correct : null,
      optionCount: Array.isArray(step.options) ? step.options.length : 0,
      answer: Array.isArray(step.answer) ? step.answer : null,
      answers: step.answers && typeof step.answers === "object" ? step.answers : null,
      item: item && {
        id: item.id,
        words: item.words.map(([text]) => text),
        lemmas: item.words.map(([, lemma]) => lemma ?? null),
        punct: item.punct ?? "",
        means: item.means ?? null,
        literal: item.literal?.map(([text]) => text) ?? null,
        moved: item.moved ?? [],
        wrong: item.wrong ?? [],
        gap: item.gap ? { index: item.gap.index, options: item.gap.options ?? [] } : null,
      },
      sentence,
      gloss,
      card: step.card ? { id: step.card.id } : null,
    };
  }, session);
}

// ---------- each kind ----------
// A handler answers the step (right, or wrong when asked and the game has a wrong answer) and returns { continued: true } when the
// answer itself moved the session on (a card's I knew it), { missed: true } when it could only give up (I don't know).

const other = (i, n) => (n > 1 ? (i + 1) % n : i);
const dontKnow = async ({ session, press }) => {
  await press(session.getByRole("button", { name: "I don't know" }));
  return { missed: true };
};
const check = ({ session, press }) => press(session.getByRole("button", { name: "Check", exact: true }));
const tiles = (session) => session.locator('[data-part="arrange-bank"] [data-part="tile"]:not([data-state="used"])');
async function placeTiles(ctx, words) {
  // By the word each tile names (data-word): while a word is new its tile shows its reading too (furigana, vowel marks), so its text is
  // more than the word. A tile that names none is found by its text.
  for (const word of words) {
    const named = tiles(ctx.session).and(ctx.page.locator(`[data-word=${JSON.stringify(word)}]`));
    await ctx.press((await named.count()) ? named.first() : tiles(ctx.session).filter({ hasText: exactly(word) }).first());
  }
  await check(ctx);
}
async function typeInto(ctx, field, text) {
  await ctx.press(field);
  await ctx.page.keyboard.type(text);
  await ctx.page.keyboard.press("Enter");
}
const wrongly = (text) => `${text.slice(0, -1)}${text.at(-1) === "x" ? "q" : "x"}`;
const needItem = (step) => {
  if (!step.item) throw new Error(`a ${step.kind} step with no sentence`);
  return step.item;
};
// Where does it go? asks about the moved word furthest along the sentence.
const placeIndex = (item) => Math.max(...item.moved.map((w) => item.words.findIndex((t) => t === w)).filter((i) => i >= 0), -1);
// Put it in order: the Dutch words, or the English chunks in Dutch order when its tiles are English.
const arrangeWords = async (ctx, item) => ((await tiles(ctx.session).first().getAttribute("lang")) === "en" ? item.literal : item.words);
// Each element's words as written: a new word shows its reading with it (furigana over it, vowel marks in its place), left out here.
const writtenTexts = (locator) =>
  locator.evaluateAll((nodes) =>
    nodes.map((node) => {
      const copy = node.cloneNode(true);
      for (const reading of copy.querySelectorAll('[data-part="reading"]')) reading.remove();
      return copy.textContent.replace(/\s+/g, " ").trim();
    }),
  );
// The first of these that says exactly this, its readings aside.
async function saying(locator, text) {
  const at = (await writtenTexts(locator)).indexOf(text);
  return at >= 0 ? locator.nth(at) : locator.filter({ hasText: exactly(text) }).first();
}
// A choice by its words exactly (the choice's own span, as a choice may carry more: a picture, a mark).
const choiceSaying = (session, text) => session.locator('[data-part="choice"]').filter({ has: session.page().locator("span", { hasText: exactly(text) }) }).first();
const choiceNotSaying = (session, text) => session.locator('[data-part="choice"]').filter({ hasNot: session.page().locator("span", { hasText: exactly(text) }) }).first();

async function speaking(ctx) {
  if (ctx.speaking === "cant-speak") {
    const cant = ctx.session.getByRole("button", { name: "Can't speak now" });
    if (await cant.count()) {
      await ctx.press(cant);
      await ctx.page.waitForTimeout(150);
      return { swapped: true }; // the same step asked another way: answerStep answers that
    }
  }
  return dontKnow(ctx);
}

export const HANDLERS = {
  // Study cards and a deck's card: the meaning shown (a deck's other side; a script's letter, how it's said), then I knew it (Not yet when
  // wrong), which moves on.
  async card(ctx) {
    await ctx.press(ctx.session.getByRole("button", { name: /^(Show meaning|Show the other side|Show how it's said)$/ }));
    await ctx.press(ctx.session.getByRole("button", { name: ctx.wrong ? /^(Not yet|Continue)$/ : /^(I knew it|Continue)$/ }));
    return { continued: true };
  },
  // A new word or idea met: nothing to answer, the bar's Continue.
  async meet() {
    return {};
  },
  async choose(ctx) {
    needItem(ctx.step);
    const right = ctx.step.sentence;
    await ctx.press(ctx.wrong ? choiceNotSaying(ctx.session, right) : ctx.session.locator('[data-part="choice"]', { hasText: right }).first());
    return {};
  },
  async arrange(ctx) {
    const words = await arrangeWords(ctx, needItem(ctx.step));
    await placeTiles(ctx, ctx.wrong ? [...words].reverse() : words);
    return {};
  },
  async place(ctx) {
    const at = placeIndex(needItem(ctx.step));
    await ctx.press(ctx.session.locator('[data-part="place-gap"]').nth(ctx.wrong ? (at === 0 ? 1 : 0) : at));
    return {};
  },
  async fill(ctx) {
    const item = needItem(ctx.step);
    const right = item.words[item.gap.index];
    const answer = fillChoice(ctx.wrong ? item.gap.options.find((o) => fillChoice(o, right) !== fillChoice(right)) ?? right : right, right);
    await ctx.press(await saying(ctx.session.locator(".lx-game button"), answer));
    return {};
  },
  async meaning(ctx) {
    await ctx.press(ctx.wrong ? choiceNotSaying(ctx.session, ctx.step.gloss) : choiceSaying(ctx.session, ctx.step.gloss));
    return {};
  },
  // Match: every pair, as the step itself says which meaning goes with each tile (a tile shows the form a lesson taught). No wrong one.
  async match(ctx) {
    const side = (s) => ctx.session.locator(`[data-part="match-item"][data-side="${s}"]`);
    for (const nl of await writtenTexts(side("nl"))) {
      await ctx.press(await saying(side("nl"), nl));
      await ctx.press(side("en").filter({ hasText: exactly(ctx.step.answers[nl]) }).first());
    }
    return {};
  },
  // Type it (from the English, or what you hear): the whole sentence.
  async type(ctx) {
    const field = ctx.session.locator('[data-part="type-answer"] input');
    await field.fill(ctx.wrong ? "xyz" : ctx.step.sentence);
    await field.press("Enter");
    return {};
  },
  // The typing games: one word, on its own or in the sentence's gap.
  async "type-word"(ctx) {
    await typeInto(ctx, ctx.session.locator('[data-part="gap-field"], [data-part="type-answer"] [data-part="text-field"]').first(), ctx.wrong ? wrongly(ctx.step.text) : ctx.step.text);
    return {};
  },
  async "type-gap"(ctx) {
    return HANDLERS["type-word"](ctx);
  },
  async "hear-gap"(ctx) {
    return HANDLERS["type-word"](ctx);
  },
  // Tap the picture, Pick the word: the option the step marks right.
  async see(ctx) {
    await ctx.press(ctx.session.locator('[data-part="picture-choice"]').nth(ctx.wrong ? other(ctx.step.correct, ctx.step.optionCount) : ctx.step.correct));
    return {};
  },
  async word(ctx) {
    await ctx.press(ctx.session.locator('[data-part="choice"]').nth(ctx.wrong ? other(ctx.step.correct, ctx.step.optionCount) : ctx.step.correct));
    return {};
  },
  // What does it say?: the English built from its tiles (each tile names its word).
  async translate(ctx) {
    const words = ctx.wrong ? [...ctx.step.answer].reverse() : ctx.step.answer;
    for (const word of words) await ctx.press(tiles(ctx.session).and(ctx.page.locator(`[data-word=${JSON.stringify(word)}]`)).first());
    await check(ctx);
    return {};
  },
  // Listening: the session picks its form as it draws it (what you heard, the order you heard, or typed), so it's read off the screen.
  async listen(ctx) {
    const item = needItem(ctx.step);
    if (await ctx.session.locator('[data-part="type-answer"] input').count()) return HANDLERS.type(ctx);
    if (await ctx.session.locator('[data-part="arrange-bank"]').count()) {
      await placeTiles(ctx, ctx.wrong ? [...item.words].reverse() : item.words);
      return {};
    }
    await ctx.press(ctx.wrong ? ctx.session.locator('[data-part="choice"]', { hasNotText: item.means }).first() : ctx.session.locator('[data-part="choice"]', { hasText: item.means }).first());
    return {};
  },
  // The speaking games: nobody speaks in a check (a check that does says so itself), so I don't know, or Can't speak now.
  say: speaking,
  repeat: speaking,
  "say-word": speaking,
  "repeat-word": speaking,
  // A deck's card (an imported deck): its own games (study/deck-steps.js). A card plays as Study cards do; the others are given up.
  async deck(ctx) {
    if (ctx.step.game === "card") return HANDLERS.card(ctx);
    if (!DECK_GAMES.includes(ctx.step.game)) throw new Error(`a deck's step this player can't play: "${ctx.step.game}"; give it a handler in scripts/fixtures/play-session.mjs`);
    return dontKnow(ctx);
  },
};
/** The games a deck's card can be played as (study/deck-steps.js deckStep), each handled above. */
export const DECK_GAMES = ["card", "choose", "type", "fill", "listen", "arrange", "say"];

/**
 * Answers the step on screen and presses on: right unless `wrong`. Waits first for a step this hasn't answered (the session draws the
 * next one as Continue is pressed). Returns what the step was (stepNow's data, with swapped: the speaking step it swapped first).
 */
/** The step to answer next (stepNow's data), once one this hasn't answered is up, or { kind: "summary" } at the end. */
export async function nextStep(page, { session = SESSION } = {}) {
  await page.waitForFunction(
    (S) => {
      const root = document.querySelector(S);
      return Boolean(root && (root.querySelector('[data-part="session-summary"]') || (root.lxStep && root.lxStep !== globalThis.__lxPlayed)));
    },
    session,
    { timeout: 15_000 },
  );
  return stepNow(page, { session });
}

export async function answerStep(page, { session = SESSION, wrong = false, press = (locator) => locator.click(), speaking = "dont-know", next = true } = {}) {
  const step = await nextStep(page, { session });
  if (!step) throw new Error("no session on screen");
  if (step.kind === "summary") throw new Error("the session is at its summary: no step to answer");
  const handler = HANDLERS[step.kind];
  if (!handler) throw new Error(`a step this player can't play: "${step.kind}"; give it a handler in scripts/fixtures/play-session.mjs`);
  const ctx = { page, session: page.locator(session), step, wrong, press, speaking };
  // This step is the one answered from here on, noted before any press: a card's I knew it moves the session on by itself, and noted after,
  // it was the next step's that got noted, which the next answer then waited for in vain.
  await page.evaluate((S) => (globalThis.__lxPlayed = document.querySelector(S)?.lxStep ?? null), session);
  const done = await handler(ctx);
  if (done?.swapped) {
    // Can't speak now asked the same step another way: nothing was answered yet.
    await page.evaluate(() => (globalThis.__lxPlayed = null));
    return { ...(await answerStep(page, { session, wrong, press, speaking, next })), swapped: step.kind };
  }
  if (next && !done?.continued) await press(ctx.session.locator('[data-part="answer-bar"] [data-variant="white"]').first());
  return { ...step, missed: Boolean(done?.missed) };
}

/** What's on screen now if it's not the step last answered: its kind, "summary" at the end, else null (Continue brought nothing up yet). */
export const shownAfter = (page, { session = SESSION } = {}) =>
  page.evaluate((S) => {
    const root = document.querySelector(S);
    if (!root) return null;
    if (root.querySelector('[data-part="session-summary"]')) return "summary";
    return root.lxStep && root.lxStep !== globalThis.__lxPlayed ? root.lxStep.kind : null;
  }, session);

/** Plays every step to the session's summary (at most `limit`), right unless wrongAt(i, step) says; the steps played, in order. */
export async function playToSummary(page, { session = SESSION, limit = 40, wrongAt = () => false, ...options } = {}) {
  const played = [];
  for (let i = 0; i < limit; i++) {
    const now = await nextStep(page, { session });
    if (now?.kind === "summary") return played;
    played.push(await answerStep(page, { session, wrong: Boolean(wrongAt(i, now)), ...options }));
  }
  if ((await nextStep(page, { session }).catch(() => null))?.kind === "summary") return played;
  throw new Error(`no summary after ${limit} steps: ${played.map((step) => step.kind).join(", ")}`);
}

/**
 * Just after a summary's Done (or Enter there): the first time an account finishes a session, Done brings "Want a reminder?" as a step
 * of its own (shell/settings-reminders.js reminderStep, study/session.js finish), shown once; this presses its Not now, which goes on
 * as Done does. Every other time the session is already on its way out, and this returns at once. Whether the ask came.
 */
export async function pastReminderAsk(page, { session = SESSION, press = (locator) => locator.click() } = {}) {
  const after = await page.waitForFunction(
    (S) => {
      const root = document.querySelector(S);
      if (!root) return "gone";
      return root.querySelector('[data-part="reminder-step"]') ? "ask" : null;
    },
    session,
    { timeout: 15_000 },
  );
  if ((await after.jsonValue()) !== "ask") return false;
  await press(page.locator(`${session} [data-part="answer-bar"] [data-part="button"]`, { hasText: exactly("Not now") }));
  await page.waitForFunction((S) => !document.querySelector(S), session, { timeout: 15_000 });
  return true;
}
