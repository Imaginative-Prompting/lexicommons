// desk-check's stages and phone screens for desk-study's pages (Home, Study, the path, a session): a stage is { order, run }, a screen
// list is PHONE_SCREENS.push({ order, screens }); order places it among every lane's (today's are tens apart: 10, 20, …). Its grid
// pages and list pages are WIDE_GRIDS.push(…) and NARROW.push(…). Only this lane edits this file.

import {
  AGAIN,
  BASE_URL,
  BEFORE,
  BUTTON_RULE,
  DRAWN_SCREENS,
  EXPLORE_PAGE,
  FIXED,
  FROM,
  HERE,
  IN_A_ROW,
  IPAD,
  KEYED,
  KNOW_BOARD,
  LONG,
  MAIN_TABS,
  NARROW,
  NOISE_MOST,
  NOISE_PIXELS,
  NO_PILE,
  ONLY,
  OUT,
  PHONE_GAMES,
  PHONE_SCREENS,
  PHOTO_SCREENS,
  PILL,
  PIXEL_NOISE,
  READING_LINES,
  SCREENS,
  SESSION,
  SIDEBAR,
  SMALL_TARGETS,
  STAGE,
  STAGE_GAMES,
  STILL,
  TARGET_GAMES,
  TITLE_X,
  TYPED,
  WIDE,
  WIDE_ASIDES,
  WIDE_GRIDS,
  answerStep,
  answered,
  apartInside,
  argv,
  assert,
  box,
  browser,
  chromium,
  device,
  endSession,
  existsSync,
  fileURLToPath,
  go,
  join,
  knowWords,
  mkdirSync,
  noise,
  openTranslate,
  opt,
  outArg,
  phoneScreens,
  photosOf,
  pillText,
  placed,
  readFileSync,
  resolve,
  results,
  samePixels,
  serveFiles,
  sharp,
  shownNumber,
  stage,
  stageNow,
  steady,
  toKnowCard,
  translateNow,
  weeksIn,
  writeFileSync,
} from "./common.mjs";

export const stages = [
  {
    order: 32,
    run: () =>
      stage("picture question: by mouse (and an iPad by touch), a new learner's lesson 1 opening on Which one is it?: its tiles keep their size as the result comes (the result's room held from the question); on a computer the line, the word's card and the tiles one block of 400 at most in the middle, the tiles centered in it, and the result's bar its width, centered under them", async () => {
        const said = [];
        for (const size of [
          { width: 1024, height: 768, name: "1024x768" },
          { width: 1280, height: 800, name: "1280x800" },
          { width: 1440, height: 900, name: "1440x900" },
          { width: 1920, height: 1080, name: "1920x1080" },
          { width: 1180, height: 820, touch: true, name: "1180-ipad" },
        ]) {
          const { context, page, errors } = await device(size);
          try {
            await go(page, "#study/session/lesson?from=today");
            await page.waitForSelector(SESSION, { timeout: 30_000 });
            await page.waitForSelector(`${SESSION} [data-part="picture-choices"][data-kind="pictures"]`, { timeout: 20_000 });
            await page.waitForTimeout(1200);
            const sides = () =>
              page.evaluate((S) => {
                const root = document.querySelector(S);
                const r = (node) => {
                  const b = node?.getBoundingClientRect();
                  return b && b.width ? { left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width), height: Math.round(b.height) } : null;
                };
                return { step: r(root.querySelector(".lx-step")), tiles: r(root.querySelector('[data-part="picture-choices"][data-kind="pictures"]')), bar: r(root.querySelector('[data-part="answer-bar"]')) };
              }, SESSION);
            const before = await sides();
            await page.screenshot({ path: join(OUT, `picture-${size.name}.png`) });
            assert(before.tiles, `${size.name}: lesson 1 didn't open on a picture question`);
            await answerStep(page, { next: false });
            await page.waitForTimeout(900);
            const after = await sides();
            await page.screenshot({ path: join(OUT, `picture-${size.name}-result.png`) });
            const at = `${size.name}: ${JSON.stringify({ before, after })}`;
            assert(Math.abs(after.tiles.width - before.tiles.width) <= 1 && Math.abs(after.tiles.height - before.tiles.height) <= 1, `${size.name}: the tiles went from ${before.tiles.width} × ${before.tiles.height} to ${after.tiles.width} × ${after.tiles.height} as the result came\n${at}`);
            if (!size.touch) {
              const middle = (box) => (box.left + box.right) / 2;
              // One block: 400 at most, the tiles in its middle (narrower where a short window draws them smaller), the bar its width under it.
              assert(before.step.width <= 401 && before.tiles.width <= before.step.width + 1 && Math.abs(middle(before.step) - middle(before.tiles)) <= 1, `${size.name}: the step is ${before.step.width} px wide, its tiles ${before.tiles.width} px and ${middle(before.tiles) - middle(before.step)} px off its middle: not one block of 400 at most around them\n${at}`);
              assert(Math.abs(after.bar.width - after.step.width) <= 1 && Math.abs(middle(after.bar) - middle(after.tiles)) <= 1, `${size.name}: the result's bar is ${after.bar.width} px wide, its middle ${middle(after.bar) - middle(after.tiles)} px off the tiles', under a ${after.step.width} px block\n${at}`);
            }
            assert(!errors.length, `${size.name}: page errors: ${errors.join(" | ")}`);
            said.push(`${size.name} tiles ${before.tiles.width} → ${after.tiles.width}, block ${before.step.width}, bar ${after.bar.width}`);
          } finally {
            await context.close();
          }
        }
        return said.join("; ");
      }),
  },
  {
    order: 97,
    run: () =>
      stage("path theme: at 1280 by mouse, a learner weeks in on the path, the theme changed under it (a look, then Match device's switch): the header's ground and the shell's are read again, the new theme's, never the old", async () => {
        const { context, page, errors } = await device({ width: 1280, height: 800 });
        const said = [];
        try {
          await weeksIn(page);
          await go(page, "#study/path");
          await page.waitForTimeout(2500);
          // The grounds as the theme has them now (the path's --paper-N), and what the header and :root were given.
          const grounds = () =>
            page.evaluate(() => {
              const wrap = document.querySelector('[data-part="page"]:not([data-ghost]) .lx-path-page');
              const style = wrap ? getComputedStyle(wrap) : null;
              const header = document.querySelector('[data-part="app"] > [data-part="app-header"]');
              return {
                fresh: [0, 1, 2].map((i) => style?.getPropertyValue(`--paper-${i}`).trim() ?? ""),
                header: header?.style.getPropertyValue("--header-ground").trim() ?? "",
                page: document.documentElement.style.getPropertyValue("--page-ground").trim(),
              };
            });
          // Made of the fresh grounds alone: one of them, or two mixed over a unit's band.
          const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const ofFresh = (value, fresh) => fresh.includes(value) || fresh.some((a) => fresh.some((b) => new RegExp(`^color-mix\\(in oklab, ${esc(a)} \\d+%, ${esc(b)}\\)$`).test(value)));
          const first = await grounds();
          assert(first.fresh.every(Boolean) && first.header && first.page, `the path has no grounds to read: ${JSON.stringify(first)}`);
          for (const [how, act] of [
            ["a look (Paper)", () => page.evaluate(async () => (await import("/js/lx/theme.js")).useTheme("paper"))],
            ["Match device's switch (light to dark)", () => page.evaluate(() => document.documentElement.setAttribute("data-theme", document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark"))],
          ]) {
            const was = await grounds();
            await act();
            await page.waitForTimeout(600);
            const now = await grounds();
            const changed = now.fresh.join("|") !== was.fresh.join("|");
            if (!changed) {
              said.push(`${how}: the grounds didn't change`);
              continue;
            }
            assert(now.fresh.includes(now.page), `after ${how}, :root's --page-ground is ${now.page}, not one of the theme's grounds (${now.fresh.join(" · ")}); before: ${was.page}`);
            assert(ofFresh(now.header, now.fresh), `after ${how}, the header's ground is ${now.header}, not made of the theme's grounds (${now.fresh.join(" · ")}); before: ${was.header}`);
            said.push(`${how}: both read again`);
          }
          assert(said.some((line) => line.endsWith("read again")), `no theme change changed the path's grounds: ${said.join("; ")}`);
          assert(!errors.length, `page errors: ${errors.join(" | ")}`);
        } finally {
          await context.close();
        }
        return said.join("; ");
      }),
  },
  {
    order: 95,
    run: () =>
      stage("home: by mouse, a learner weeks in, Home fills the frame from 1280 in two columns (what's next 608 from the frame's start, Your progress 320 at its end, level with its top, its tiles one over the other; from 1600 720 and the rest), one 720 column at 1024 with the week's days held together and while Translate is open; the streak's line clear of Tinta, the words tile's row ending on a whole word, the book card's title where the column starts, and its book open when it's all in the first screen", async () => {
        const faults = [];
        const said = [];
        for (const size of [
          { width: 1024, height: 768 },
          { width: 1280, height: 800 },
          { width: 1440, height: 900 },
          { width: 1600, height: 1000 },
        ]) {
          const { context, page, errors } = await device(size);
          try {
            await weeksIn(page);
            await go(page, "#today");
            await page.waitForTimeout(1200);
            const home = await page.evaluate(() => {
              const r = (node) => {
                if (!node) return null;
                const b = node.getBoundingClientRect();
                return { left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom), width: Math.round(b.width) };
              };
              const view = document.querySelector('[data-part="page"] > .lx-view:not([data-waiting])');
              const slot = view?.querySelector(".lx-today-progress-slot");
              const note = slot?.querySelector(".lx-streak-note");
              const range = document.createRange();
              if (note) range.selectNodeContents(note);
              const lines = note ? [...range.getClientRects()].map((b) => Math.round(b.width)) : [];
              const tinta = slot?.querySelector('[data-part="character"]');
              const words = slot?.querySelector(".lx-tile-words");
              const wordsBox = words?.getBoundingClientRect();
              const cut = words ? [...words.children].filter((w) => { const b = w.getBoundingClientRect(); return b.top < wordsBox.bottom - 2 && b.bottom > wordsBox.top + 2 && b.right > wordsBox.right + 0.5; }).map((w) => w.textContent) : [];
              const days = [...(slot?.querySelectorAll('[data-part="week-day"] .lx-week-mark') ?? [])].map((m) => m.getBoundingClientRect());
              const title = view?.querySelector('[data-part="home-card"][data-variant="book"] .lx-hc-title');
              const book = view?.querySelector('[data-part="home-card"][data-variant="book"] .lx-hb-book');
              const scroller = view?.closest('[data-part="page"]');
              return {
                view: r(view),
                slot: r(slot),
                next: r(view?.querySelector(".lx-today-next")),
                tiles: [...(slot?.querySelectorAll('[data-part="stat-tile"]') ?? [])].map(r),
                lines,
                noteRight: note ? Math.round(Math.max(...[...range.getClientRects()].map((b) => b.right))) : null,
                tinta: r(tinta),
                cut,
                daysSpan: days.length > 1 ? Math.round(days.at(-1).right - days[0].left) : null,
                title: r(title),
                // The book with the page at its top: wholly in the first screen, and how open it is.
                book: book ? { bottom: Math.round(book.getBoundingClientRect().bottom + (scroller?.scrollTop ?? 0)), open: book.style.getPropertyValue("--open") || "0", view: innerHeight } : null,
              };
            });
            const at = `${size.width}: ${JSON.stringify(home)}`;
            if (size.width === 1024) {
              if (home.view?.width !== 720) faults.push(`1024: Home's view ${home.view?.width} wide, not the page's 720\n${at}`);
              if (!(home.daysSpan <= 420)) faults.push(`1024: the week's days span ${home.daysSpan} px, not held to 420\n${at}`);
            } else {
              const wide = size.width >= 1600;
              const frame = wide ? 1120 : 960;
              const main = wide ? 720 : 608;
              if (home.view?.width !== frame) faults.push(`${size.width}: Home's view ${home.view?.width} wide, not the frame's ${frame}\n${at}`);
              if (!home.next || Math.abs(home.next.left - home.view.left) > 1 || Math.abs(home.next.width - main) > 1) faults.push(`${size.width}: what's next isn't ${main} wide from the frame's start\n${at}`);
              if (!home.slot || Math.abs(home.slot.right - home.view.right) > 1 || Math.abs(home.slot.top - home.view.top) > 1 || Math.abs(home.slot.width - (frame - main - 32)) > 1) faults.push(`${size.width}: Your progress isn't ${frame - main - 32} wide at the frame's end, level with its top\n${at}`);
              if (home.tiles.length < 2 || home.tiles[1].top < home.tiles[0].bottom - 1) faults.push(`${size.width}: Your progress's tiles aren't one over the other\n${at}`);
              if (home.tinta && home.noteRight !== null && home.tinta.left - home.noteRight < 16) faults.push(`${size.width}: the streak's line comes within ${home.tinta.left - home.noteRight} px of Tinta\n${at}`);
              if (home.lines.length > 1 && Math.min(...home.lines) < 0.5 * Math.max(...home.lines)) faults.push(`${size.width}: the streak's line breaks unevenly (${home.lines.join(", ")} px)\n${at}`);
              if (home.cut.length) faults.push(`${size.width}: the words tile cuts ${home.cut.join(", ")} at its edge\n${at}`);
              // While Translate is open, its page is the column's: one 720 column.
              await page.evaluate(() => document.documentElement.setAttribute("data-translate", ""));
              await page.waitForTimeout(300);
              const open = await page.evaluate(() => Math.round(document.querySelector('[data-part="page"] > .lx-view:not([data-waiting])').getBoundingClientRect().width));
              await page.evaluate(() => document.documentElement.removeAttribute("data-translate"));
              if (open !== 720) faults.push(`${size.width}: with Translate open Home's view is ${open} wide, not 720`);
            }
            // A book wholly in the first screen rests open, never part-turned with its pages squeezed (it opened only with a scroll).
            if (home.book && home.book.bottom <= home.book.view - 24 && home.book.open !== "1") faults.push(`${size.width}: the book is all in the first screen and rests ${home.book.open} open, not open\n${at}`);
            if (home.title && Math.abs(home.title.left - home.view.left) > 1) faults.push(`${size.width}: the book card's title starts ${home.title.left - home.view.left} px after the column\n${at}`);
            said.push(`${size.width} ${home.next?.width ?? "?"}+${home.slot?.width ?? "-"}`);
            assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
          } finally {
            await context.close();
          }
        }
        assert(!faults.length, faults.join("\n"));
        return `what's next + Your progress: ${said.join(", ")}`;
      }),
  },
  {
    order: 30,
    run: () =>
      stage("games: the step and its bar one block in the screen's middle, the game right under its question, Continue right under the game and the step still as the result comes; numbers on the choices with a mouse", async () => {
        const seen = [];
        for (const size of STAGE) {
          const { context, page, errors } = await device(size);
          try {
            await knowWords(page);
            for (const game of STAGE_GAMES) {
              await endSession(page);
              // (Study cards are a session of their own: #study/session/cards.)
              await go(page, game === "card" ? "#study/session/cards" : `#study/session/game/${game}`);
              await page.waitForSelector(SESSION, { timeout: 20_000 });
              await page.waitForTimeout(700);
              const empty = page.locator(`${SESSION} [data-part="empty-state"]`);
              if (await empty.count()) throw new Error(`${size.name} ${game}: the session has nothing to ask (${(await empty.first().innerText()).trim()})`);
              const before = await stageNow(page);
              await page.screenshot({ path: join(OUT, `game-${size.name}-${game}.png`) });
              const at = `${size.name} ${game}: ${JSON.stringify(before)}`;
              // (A card is the step itself: no game under a question.)
              assert(before.step && (before.game || game === "card"), `${size.name} ${game}: no step or game on the screen\n${at}`);
              // The game right under its question (the step's own spacing), not centered in the room under it.
              if (before.lead && before.game) assert(before.game.top - before.lead.bottom <= 64, `${size.name} ${game}: ${before.game.top - before.lead.bottom} px between what's asked and the game\n${at}`);
              // The bar right under the step, and the block in the middle: as much room over it as under it.
              assert(before.bar.top - before.step.bottom <= 48, `${size.name} ${game}: ${before.bar.top - before.step.bottom} px between the step and its bar\n${at}`);
              const over = before.step.top - before.head;
              const under = before.foot - before.bar.bottom;
              if (over + under > 120) assert(Math.abs(over - under) <= 72, `${size.name} ${game}: ${over} px over the block and ${under} under it\n${at}`);
              if (!size.touch && KEYED.has(game)) {
                assert(before.numbers.length >= 2 && before.numbers.every(shownNumber), `${size.name} ${game}: the choices show no number (${before.numbers.join(", ")})`);
                assert(!before.covering, `${size.name} ${game}: ${before.covering} choice(s) have their number over their words: ${JSON.stringify(before.coveringWhy)}`);
              }
              if (size.touch && KEYED.has(game)) assert(!before.numbers.some(shownNumber), `${size.name} ${game}: numbers shown on a touch screen (${before.numbers.join(", ")})`);
              // Answered: the result in the bar right under the game, Continue on the screen, the step where it was.
              await answerStep(page, { next: false });
              await page.waitForTimeout(700);
              const after = await stageNow(page);
              await page.screenshot({ path: join(OUT, `game-${size.name}-${game}-result.png`) });
              const then = `${size.name} ${game} answered: ${JSON.stringify(after)}`;
              assert(after.forward && after.forward <= after.view, `${size.name} ${game}: Continue isn't on the screen\n${then}`);
              assert(after.bar.top - after.step.bottom <= 48, `${size.name} ${game}: ${after.bar.top - after.step.bottom} px between the answered step and its result\n${then}`);
              // The step stays where it is; only a result taller than the room under the block moves it, up, as one, by what it needs (the
              // result then reaching the screen's foot), never the game away from its question.
              const moved = after.step.top - before.step.top;
              if (game !== "match" && game !== "card" && Math.abs(moved) > 1) {
                assert(moved < 0 && after.bar.bottom >= after.foot - 24, `${size.name} ${game}: the step moved ${moved} px as the result came, with room to spare under it (to ${after.bar.bottom} of ${after.foot})\n${then}`);
              }
              if (before.lead && before.game && after.lead && after.game) {
                const grew = after.game.top - after.lead.bottom - (before.game.top - before.lead.bottom);
                assert(Math.abs(grew) <= 2, `${size.name} ${game}: the game moved ${grew} px away from its question as the result came\n${then}`);
              }
              if (KEYED.has(game)) assert(!after.numbers.some(shownNumber), `${size.name} ${game}: numbers still shown after the answer`);
            }
            assert(!errors.length, `${size.name}: page errors: ${errors.join(" | ")}`);
            seen.push(size.name);
          } finally {
            await context.close();
          }
        }
        return `${STAGE_GAMES.join(", ")} at ${seen.join(", ")}`;
      }),
  },
];

PHONE_SCREENS.push({
  order: 10,
  screens: [
      ["home", async (page) => (await go(page, "#today"), await page.waitForTimeout(1500))],
    ],
});
PHONE_SCREENS.push({
  order: 40,
  screens: // A game's question and its result, on the words known (the plan and its choices the same both sides: the clock and Math.random fixed).
    PHONE_GAMES.flatMap((game) => [
      [game, async (page) => {
        if (game === PHONE_GAMES[0]) await knowWords(page);
        await endSession(page);
        await go(page, `#study/session/game/${game}`);
        await page.waitForSelector(SESSION, { timeout: 20_000 });
      }],
      [`${game}-result`, async (page) => void (await answerStep(page, { next: false }))],
    ]),
});
PHONE_SCREENS.push({
  order: 60,
  screens: [
      ["packs", async (page) => (await go(page, "#study/packs"), await page.waitForTimeout(1500))],
    ],
});
PHONE_SCREENS.push({
  order: 70,
  screens: [
      // Study's own page and Where you are (the path): their computer rules sit beside the phone's in study-screens.css and path-page.css.
      ["study", async (page) => (await go(page, "#study"), await page.waitForTimeout(1500))],
    ],
});
PHONE_SCREENS.push({
  order: 80,
  screens: [
      ["path", async (page) => (await go(page, "#study/path"), await page.waitForTimeout(2000))],
    ],
});
// The screens whose drawings the phones stage holds by place (common.mjs drawingsOf): a game's word pictures and icons, under the session;
// Study's path strip and its games' art, and the path's stops, under the page.
for (const game of PHONE_GAMES) DRAWN_SCREENS[game] = DRAWN_SCREENS[`${game}-result`] = '[data-part="session"]:not([data-ghost])';
DRAWN_SCREENS.study = DRAWN_SCREENS.path = '[data-part="page"]:not([data-ghost])';
WIDE_GRIDS.push(["#study", "Study"]);
NARROW.push(["#study/packs", "Study's packs"], ["#study/path", "the path"]);
// Home in two columns from 1280 (know.css): what's next and the rest, Your progress beside them. Its two columns are the page's view itself.
WIDE_ASIDES.push({ route: "#today", name: "Home", grid: ":scope", aside: ".lx-today-progress-slot" });
