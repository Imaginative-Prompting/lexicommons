// desk-check's stages and phone screens for desk-read's pages (Read, the reader, Translate, Settings' pages, the AI section): a stage is
// { order, run }, a screen list is PHONE_SCREENS.push({ order, screens }); order places it among every lane's (today's are tens apart).
// Its grid pages and list pages are WIDE_GRIDS.push(…) and NARROW.push(…). Only this lane edits this file.

import {
  AGAIN,
  BASE_URL,
  BEFORE,
  BUTTON_RULE,
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
import { pastKnowSome } from "../fixtures/first-run.mjs";

// Reading text against the measure itself (frame.md §6: "Running text at most --measure, on the text itself"): each element of prose, its
// widest line in px against its own --measure (min(31em, 640px) in its own font size), with a command to copy left out (code and pre are
// one line that scrolls, not reading text). A list row's li isn't prose: its title and its value share a line across the row. Characters
// are reported too, as the measure stage counts them (narrow letters can count past 72 within the measure).
const PROSE_LINES = () => {
  const ctx = document.createElement("canvas").getContext("2d");
  let longest = null;
  const over = [];
  for (const node of document.querySelectorAll('p, dd, .lx-row-title, .lx-row-sub, li:not(.lx-row-item):not(:has([data-part="list-row"]))')) {
    if (!node.getClientRects().length || node.closest('[hidden], [inert], [data-ghost], [aria-hidden="true"], [data-part="common-page"]')) continue;
    const texts = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) if (t.textContent.trim() && !t.parentElement.closest("code, pre")) texts.push(t);
    const text = texts.map((t) => t.textContent).join(" ").trim().replace(/\s+/g, " ");
    if (text.length < 60) continue;
    const range = document.createRange();
    const lines = new Map();
    for (const t of texts) {
      range.selectNodeContents(t);
      for (const r of range.getClientRects()) {
        if (r.width < 1) continue;
        const key = Math.round(r.top / 4);
        const line = lines.get(key) ?? { left: Infinity, right: -Infinity };
        line.left = Math.min(line.left, r.left);
        line.right = Math.max(line.right, r.right);
        lines.set(key, line);
      }
    }
    const style = getComputedStyle(node);
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const avg = ctx.measureText(text).width / text.length;
    const widest = Math.max(0, ...[...lines.values()].map((l) => l.right - l.left));
    const measure = Math.min(31 * parseFloat(style.fontSize), 640);
    const chars = Math.round(widest / avg);
    if (!longest || chars > longest.chars) longest = { chars, text: text.slice(0, 40) };
    if (widest > measure + 2) over.push(`${Math.round(widest)} px for a measure of ${Math.round(measure)} ("${text.slice(0, 40)}…", ${chars} characters)`);
  }
  return { longest, over };
};

export const stages = [
  {
    order: 10,
    run: () =>
      stage("settings: from the sidebar no way back (the sidebar has every tab), a page inside it back to Settings (at 1280 and up, with the menu beside it, a page further in back to its own), and at 820 the menu's way back to the tab", async () => {
        const seen = [];
        for (const size of WIDE) {
          const { context, page, errors } = await device(size);
          try {
            await go(page, "#study");
            const tab = page.locator(`${SIDEBAR} [data-part="tab"][data-variant="settings"]`);
            assert(await tab.isVisible(), `${size.name}: the sidebar's Settings isn't on the screen`);
            await (size.touch ? tab.tap() : tab.click());
            // (1280 and up: Settings opens its first page beside its menu, shell/main.js SPLIT.)
            const split = size.width >= 1280;
            await page.waitForFunction((split) => location.hash === (split ? "#settings/account" : "#settings"), split, { timeout: 10_000 });
            await page.waitForTimeout(700);
            const pill = await box(page, PILL);
            await page.screenshot({ path: join(OUT, `settings-${size.name}.png`) });
            assert(!pill, `${size.name}: Settings from the sidebar has a way back ("${await pillText(page)}" at ${JSON.stringify(pill)})`);
            // Tab from the top never stops on it.
            await page.evaluate(() => document.activeElement?.blur());
            for (let i = 0; i < 3; i++) {
              await page.keyboard.press("Tab");
              const on = await page.evaluate(() => document.activeElement?.dataset.part ?? document.activeElement?.tagName);
              assert(on !== "app-back", `${size.name}: Tab stops on a hidden way back`);
            }
            // A page inside Settings keeps its way back to Settings; beside the menu (1280 and up) the menu is its way back, and a page further in
            // keeps its own.
            await go(page, "#settings/study");
            const inner = await box(page, PILL);
            if (split) {
              assert(!inner, `${size.name}: Settings → Study beside the menu has a way back ("${await pillText(page)}")`);
              await go(page, "#settings/appearance/edit");
              assert((await box(page, PILL)) && /Appearance/.test(await pillText(page)), `${size.name}: Make it yours has no way back to Appearance (${await pillText(page)})`);
            } else assert(inner && /Settings/.test(await pillText(page)), `${size.name}: Settings → Study has no way back to Settings (${await pillText(page)})`);
            assert(!errors.length, `${size.name}: page errors: ${errors.join(" | ")}`);
            seen.push(size.name);
          } finally {
            await context.close();
          }
        }
        // No sidebar: the menu still goes back to the tab you came from.
        const { context, page } = await device({ width: 820, height: 1180, touch: true });
        try {
          await go(page, "#study");
          await page.locator('[data-part="settings-button"]').first().tap();
          await page.waitForFunction(() => location.hash === "#settings", null, { timeout: 10_000 });
          await page.waitForTimeout(700);
          const pill = await box(page, PILL);
          assert(pill && /Study/.test(await pillText(page)), `820: Settings from Study has no way back to Study (${await pillText(page)})`);
          await page.screenshot({ path: join(OUT, "settings-820.png") });
        } finally {
          await context.close();
        }
        return `${seen.join(", ")}: none; Settings → Study: back to Settings (1440: none beside the menu, Make it yours back to Appearance); 820: back to Study`;
      }),
  },
  {
    order: 20,
    run: () =>
      stage("translate: the sidebar and the page's column kept, the box as tall as its text, the language bar right under the box where its text starts with the answer under it, flat, the swap in it between the two languages by eye and by keys and the box a plain box, a tab leaving it", async () => {
        const seen = [];
        for (const size of WIDE) {
          const { context, page, errors } = await device(size);
          try {
            await go(page, "#today");
            const column = await box(page, '[data-part="app"] > [data-part="page"] .lx-view');
            await openTranslate(page, size.touch, TYPED);
            const now = await translateNow(page);
            await page.screenshot({ path: join(OUT, `translate-${size.name}.png`) });
            const at = `${size.name}: ${JSON.stringify(now)}`;
            assert(now.translate, `${size.name}: Translate didn't open`);
            assert(now.sidebar && now.sidebar.x <= 0 && now.sidebar.w >= 200, `${size.name}: the sidebar is gone in Translate\n${at}`);
            // Translate keeps the page's 720 column at Home's start (frame.md v7), whatever Home's own view is (two columns from 1280, desk-study).
            const pageWidth = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-part="app"] > [data-part="page"]')).getPropertyValue("--page-width")) || 720);
            const want = column && { x: column.x, r: column.x + Math.min(column.r - column.x, pageWidth) };
            assert(want && Math.abs(now.section.x - want.x) <= 2 && Math.abs(now.section.r - want.r) <= 2, `${size.name}: Translate's column (${now.section.x}–${now.section.r}) isn't the page's 720 column at Home's start (${want?.x}–${want?.r})`);
            // One line typed: the box's text area two lines at most (with its own spacing), however tall the screen.
            const twoLines = 2 * now.textarea.line + 8 + 2;
            assert(now.textarea.h <= Math.max(twoLines, now.textarea.scroll + 2), `${size.name}: one line typed, the box's text area is ${now.textarea.h} px for ${now.textarea.scroll} px of text (two lines: ${Math.round(twoLines)})\n${at}`);
            assert(now.field.h < now.view.h * 0.35, `${size.name}: the box is ${now.field.h} px of a ${now.view.h} px screen for one line\n${at}`);
            assert(now.bar && now.bar.b <= now.view.h && now.bar.y >= 0, `${size.name}: the language bar isn't on the screen\n${at}`);
            // The bar is the box's own on a computer (11 Nov 2026): right under it, where its text starts, a toolbar's size, the answer under it.
            // Under the answers it was a phone's pill at the window's foot, the answers scrolling over it.
            const underBox = (state) => state.bar.y >= state.field.b - 1 && state.bar.y - state.field.b <= 28 && Math.abs(state.bar.x - state.field.x) <= 2 && state.bar.h <= 56 && state.bar.w <= 360;
            assert(underBox(now), `${size.name}: the language bar (${JSON.stringify(now.bar)}) isn't right under the box (${JSON.stringify(now.field)}), where it starts, a toolbar's size\n${at}`);
            assert(now.scroll && now.scroll.y >= now.bar.b - 1, `${size.name}: the answer's area (from ${now.scroll?.y}) isn't under the language bar (to ${now.bar.b})\n${at}`);
            assert(now.best && now.best.y >= now.bar.b && now.best.b <= now.view.h, `${size.name}: the answer isn't in view under the bar\n${at}`);
            // A long text: the box grows with it, to about half the screen, then scrolls inside.
            await page.keyboard.type(` ${LONG} ${LONG}`, { delay: 0 });
            assert(await answered(page), `${size.name}: no answer for the long text`);
            await page.waitForTimeout(500);
            const long = await translateNow(page);
            await page.screenshot({ path: join(OUT, `translate-${size.name}-long.png`) });
            assert(long.textarea.h > now.textarea.h + now.textarea.line, `${size.name}: the box didn't grow with a long text (${now.textarea.h} → ${long.textarea.h})`);
            assert(long.textarea.h <= Math.ceil(long.view.h * 0.4) + 1, `${size.name}: the box's text area is ${long.textarea.h} px, over 40% of a ${long.view.h} px screen`);
            assert(long.textarea.scroll > long.textarea.client || long.textarea.h < long.view.h * 0.4 - 2, `${size.name}: at its tallest the box doesn't scroll its text`);
            assert(underBox(long) && long.scroll.y >= long.bar.b - 1 && long.bar.b <= long.view.h, `${size.name}: with a long text the bar isn't right under the box, on the screen, the answer's area under it\n${JSON.stringify(long)}`);
            // The bar is the whole of the two languages in one row (the director's pick, 11 Nov 2026): language, swap, language, speak, the
            // swap seated in it by page.js so the keys reach them in that order; flat, its lit pill inside it; the box a plain box with an edge
            // of its own and no bite. The swap hung in a bite at the box's middle before, over nothing, the bar at the column's start.
            const row = () =>
              page.evaluate(() => {
                const bar = document.querySelector(".lx-today-translate[data-open] > .lx-way-bar");
                const field = document.querySelector('.lx-today-translate[data-open] > [data-part="translate-field"]');
                const buttons = [...bar.children].filter((node) => node.matches("button") && node.checkVisibility());
                const inside = (inner, outer) => inner.width > 0 && inner.left >= outer.left - 1 && inner.right <= outer.right + 1 && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1;
                const swap = bar.querySelector(":scope > .lx-tr-swap")?.getBoundingClientRect();
                const pill = bar.querySelector(".lx-way-bubble").getBoundingClientRect();
                const style = getComputedStyle(bar);
                return {
                  order: buttons.map((node) => (node.matches(".lx-way-tab") ? "language" : node.matches(".lx-tr-swap") ? "swap" : node.dataset.part === "mic-button" ? "speak" : node.className)).join(" "),
                  across: buttons.map((node) => Math.round(node.getBoundingClientRect().left)),
                  swapInBox: !!field.querySelector(".lx-tr-swap"),
                  bite: !!field.querySelector('svg.lx-edge[data-edge="hinge"]')?.checkVisibility(),
                  edge: getComputedStyle(field).borderTopWidth,
                  flat: style.boxShadow === "none" && (style.backdropFilter || "none") === "none",
                  pillInside: inside(pill, bar.getBoundingClientRect()),
                  swapInside: !!swap && inside(swap, bar.getBoundingClientRect()),
                  // The lit language's pill and the swap: apart, unless the pill is over both languages (it could be either).
                  room: swap ? (pill.left <= swap.left && pill.right >= swap.right ? null : Math.round(Math.min(Math.abs(pill.left - swap.right), Math.abs(swap.left - pill.right)))) : null,
                  from: bar.getAttribute("data-from"),
                  typed: field.querySelector("textarea").value,
                };
              });
            const one = await row();
            assert(one.order === "language swap language speak" && one.across.every((x, i) => !i || x > one.across[i - 1]), `${size.name}: the bar's row isn't language, swap, language, speak, left to right: ${one.order} at ${one.across}`);
            assert(!one.swapInBox && !one.bite && one.edge === "1px", `${size.name}: the box isn't a plain box (the swap in it: ${one.swapInBox}; its bite drawn: ${one.bite}; its edge ${one.edge})`);
            assert(one.flat && one.pillInside && one.swapInside, `${size.name}: the bar isn't flat with its lit pill and the swap inside it: ${JSON.stringify(one)}`);
            assert(one.room === null || one.room >= 6, `${size.name}: the swap is ${one.room} px from the lit language's pill (6 or more)`);
            if (!size.touch) {
              // By keys, in the order it reads.
              await page.locator(".lx-today-translate[data-open] > .lx-way-bar > .lx-way-tab").first().focus();
              const reached = [];
              for (let press = 0; press < 3; press++) {
                await page.keyboard.press("Tab");
                reached.push(await page.evaluate(() => (document.activeElement.matches(".lx-way-tab") ? "language" : document.activeElement.matches(".lx-tr-swap") ? "swap" : document.activeElement.dataset.part === "mic-button" ? "speak" : document.activeElement.tagName)));
              }
              assert(reached.join(" ") === "swap language speak", `${size.name}: Tab from the first language reaches ${reached.join(", ")}, not the swap, the other language, speak`);
            }
            // The swap still swaps from there: the answer goes up into the box and the other language is the one typed.
            const swapIn = page.locator(".lx-today-translate[data-open] > .lx-way-bar > .lx-tr-swap");
            await (size.touch ? swapIn.tap() : swapIn.click());
            await page.waitForFunction((was) => document.querySelector(".lx-today-translate[data-open] textarea").value !== was, one.typed, { timeout: 15_000 });
            assert(await answered(page), `${size.name}: no answer after the swap within 60 s`);
            const two = await row();
            assert(two.from !== one.from && two.typed && two.typed !== one.typed, `${size.name}: the swap didn't swap: from ${one.from} to ${two.from}, the box "${one.typed}" then "${two.typed}"`);
            // The sidebar leaves Translate for another tab.
            const study = page.locator(`${SIDEBAR} [data-part="tab"]`).nth(1);
            await (size.touch ? study.tap() : study.click());
            await page.waitForFunction(() => location.hash.startsWith("#study") && !document.documentElement.hasAttribute("data-translate"), null, { timeout: 10_000 });
            assert(!errors.length, `${size.name}: page errors: ${errors.join(" | ")}`);
            seen.push(`${size.name} box ${now.field.h}→${long.field.h}`);
          } finally {
            await context.close();
          }
        }
        return seen.join("; ");
      }),
  },
  // Both versions side by side, a screen at a time: what each did to get there, then a picture of each once settled. A screen that differs is
  // pictured again on both sides, up to three times, a second apart: a moment caught differently (a face, a flag, a sound) clears, a change
  // of the code's stays.
  // ---------- Settings' pages, the AI section and the mouse on a computer ----------
  // From 1024 px (settings-wide.css): Report a bug's "sent along" is a small table, each value beside its name (they were the column's width
  // apart); Appearance's themes are five to a row (three drew each 235 px wide with a lonely last row); an AI request's choices have their marks
  // before their words, as a form's do (at the row's far end they were 700 px from them). And with a mouse the parts of these pages that are
  // their own answer it (translate.css, read.css, settings-wide.css: a hover beside each press rule): Translate's language buttons, its swap, its
  // speakers and its bar; Read's See how it reads and Add a book or text; a theme's tile.
  {
    order: 103,
    run: () =>
      stage("settings and AI: at 1280 and 1440 by mouse Report a bug's values sit beside their names, Appearance's themes are five to a row, an AI request's choices have their marks before their words, and Translate's, Read's and Appearance's own controls change with the mouse on them", async () => {
        const seen = [];
        const look = (node) =>
          [node, ...[...node.querySelectorAll("*")].slice(0, 200)]
            .map((part) => {
              const s = getComputedStyle(part);
              return [s.backgroundColor, s.color, s.borderColor, s.boxShadow, s.transform, s.filter, s.opacity].join("|");
            })
            .join("\n");
        for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
          const { context, page, errors } = await device(size);
          try {
            // An AI connected (a token will do), so a request's form is there to fill.
            await page.evaluate(() => fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Your AI" }) }));
            await page.reload();
            await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
            const live = '[data-part="page"]:not([data-ghost])';
            // Report a bug.
            await go(page, "#settings/report");
            await page.waitForSelector(`${live} .lx-report-summary [data-part="list-row"]`, { timeout: 20_000 });
            const report = await page.evaluate((live) =>
              [...document.querySelectorAll(`${live} .lx-report-summary [data-part="list-row"]`)].map((row) => {
                const title = row.querySelector(".lx-row-title").getBoundingClientRect();
                const value = row.querySelector(".lx-row-value").getBoundingClientRect();
                return { name: row.querySelector(".lx-row-title").textContent.trim(), gap: Math.round(value.left - title.left), after: value.left >= title.right - 1 };
              }), live);
            assert(report.length >= 3 && report.every((row) => row.after && row.gap <= 220), `${size.width}: Report a bug's values aren't beside their names (within 220 px): ${JSON.stringify(report)}`);
            // Appearance's themes.
            await go(page, "#settings/appearance");
            await page.waitForSelector(`${live} .lx-swatches [data-part="theme-swatch"]`, { timeout: 20_000 });
            await page.waitForTimeout(600);
            const themes = { row: await page.evaluate(IN_A_ROW, ".lx-swatches"), widest: await page.evaluate((live) => Math.round(Math.max(...[...document.querySelectorAll(`${live} .lx-swatches [data-part="theme-swatch"]`)].map((n) => n.getBoundingClientRect().width))), live) };
            assert(themes.row === 5 && themes.widest <= 170, `${size.width}: Appearance's themes are ${themes.row} to a row, ${themes.widest} px wide at most (five, 170)`);
            const hovered = [];
            const answers = async (selector, what) => {
              const target = page.locator(selector).first();
              assert(await target.count(), `${size.width}: no ${what} on the page (${selector})`);
              await target.evaluate((node) => node.scrollIntoView({ block: "center" }));
              await page.mouse.move(2, size.height - 2);
              await page.waitForTimeout(250);
              const before = await target.evaluate(look);
              await target.hover({ force: true });
              await page.waitForTimeout(300);
              assert(before !== (await target.evaluate(look)), `${size.width}: ${what} doesn't change with the mouse on it`);
              await page.mouse.move(2, size.height - 2);
              hovered.push(what);
            };
            await answers(`${live} .lx-swatches [data-part="theme-swatch"][aria-pressed="false"]`, "a theme's tile");
            // An AI request's choices.
            await go(page, "#ai/new/practice");
            await page.waitForSelector(`${live} .lx-ai-form .lx-row-control [data-part="radio"]`, { timeout: 20_000 });
            const marks = await page.evaluate((live) =>
              [...document.querySelectorAll(`${live} .lx-ai-form .lx-row-control`)].filter((row) => row.querySelector('[data-part="radio"]')).map((row) => {
                const mark = row.querySelector('[data-part="radio"]').getBoundingClientRect();
                const words = row.querySelector(".lx-row-title").getBoundingClientRect();
                return Math.round(words.left - mark.right);
              }), live);
            assert(marks.length >= 3 && marks.every((gap) => gap >= 0 && gap <= 32), `${size.width}: an AI request's choices don't have their marks right before their words: gaps ${marks.join(", ")}`);
            // Read's own.
            await go(page, "#read");
            await page.waitForSelector(`${live} [data-read-add]`, { timeout: 30_000 });
            await page.waitForTimeout(1200);
            await answers(`${live} [data-read-add]`, "Read's Add a book or text");
            if (await page.locator(`${live} .lx-weave-own-see`).count()) await answers(`${live} .lx-weave-own-see`, "Read's See how it reads");
            // Translate's own, with an answer on the page.
            await openTranslate(page, false, TYPED);
            await answers('.lx-today-translate[data-open] .lx-tr-lang', "Translate's language button");
            await answers(".lx-today-translate[data-open] > .lx-way-bar > .lx-tr-swap", "Translate's swap");
            await answers('.lx-today-translate[data-open] > .lx-way-bar .lx-way-tab:not([aria-pressed="true"], [aria-selected="true"])', "the language bar's other language");
            await answers('.lx-today-translate[data-open] > .lx-way-bar [data-part="mic-button"]', "the language bar's microphone");
            await answers('.lx-today-translate [data-part="translate-result"] [data-part="speak-button"]', "an answer's speaker");
            assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
            seen.push(`${size.width}: ${report.length} values ${Math.max(...report.map((row) => row.gap))} px from their names at most; themes ${themes.row} a row (${themes.widest} px); ${marks.length} choices' marks ${Math.max(...marks)} px before their words; ${hovered.length} parts change with the mouse on them`);
          } finally {
            await context.close();
          }
        }
        return seen.join("; ");
      }),
  },
  // ---------- the AI section's own page on a computer ----------
  // From 1280 the page fills the frame (shell/main.js WIDE_PAGES) in two columns (settings-wide.css): Practice and what to ask for, and an
  // aside of its own that ai/tab.js builds there only: the connection as a card (which AI, when it was last here) and your newest three
  // requests, the unfinished first. Your requests and Connection leave the foot's rows then, the aside being their place. Narrower, nothing is
  // built and they're rows at the foot, as on a phone. An AI not connected keeps the page's 720 at the frame's start. At 720 the page left a
  // 240 px band empty beside a phone's list (the director's walk, 11 Nov 2026). It isn't in WIDE_GRIDS: that list's rows reach the column's
  // edge, and here they reach their own column's.
  {
    order: 104,
    run: () =>
      stage("the AI section: at 1280, 1440 and 1920 by mouse its own page is the frame's width in two columns, Practice and what to ask for beside an aside with the connection and the newest three requests, the unfinished first; at 1024 one column with those as rows at its foot; narrowed, the aside goes and comes back; not connected, the page's 720", async () => {
        const seen = [];
        const live = '[data-part="page"]:not([data-ghost])';
        const measure = (live) => {
          const rect = (node) => {
            if (!node || !node.checkVisibility()) return null;
            const r = node.getBoundingClientRect();
            return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), r: Math.round(r.right) };
          };
          const one = (selector) => rect(document.querySelector(`${live} ${selector}`));
          return {
            view: rect(document.querySelector('[data-part="page"] > .lx-view:not([data-waiting])')),
            title: one('[data-part="page-title"]'),
            body: one(".lx-ai-body"),
            practice: one('[data-part="ai-practice"]'),
            ask: one(".lx-ai-body > .lx-group"),
            aside: one(".lx-ai-aside"),
            card: one(".lx-ai-aside-card"),
            who: document.querySelector(`${live} .lx-ai-aside-who`)?.textContent.trim() ?? null,
            when: document.querySelector(`${live} .lx-ai-aside-when`)?.textContent.trim() ?? null,
            rows: [...document.querySelectorAll(`${live} .lx-ai-aside [data-part="request-row"]`)].map((row) => [row.dataset.state, row.querySelector(".lx-request-title").textContent.trim()]),
            cancels: document.querySelectorAll(`${live} .lx-ai-aside [data-part="request-row"] [data-part="button"]`).length,
            foot: ["#ai/requests", "#ai/connect", "#practice"].map((href) => !!document.querySelector(`${live} .lx-ai-body > :not(.lx-ai-aside) [data-part="list-row"][href="${href}"]`)?.checkVisibility()),
            count: document.querySelector(`${live} [data-part="list-row"][href="#ai/requests"] .lx-row-value`)?.textContent.trim() ?? null,
            sideways: document.scrollingElement.scrollWidth - innerWidth,
          };
        };
        for (const size of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
          const { context, page, errors } = await device(size);
          try {
            const frame = size.width >= 1600 ? 1120 : 960;
            // No AI connected yet: the page's 720 at the frame's start, no aside at any width.
            await go(page, "#ai");
            await page.waitForSelector(`${live} .lx-ai-body`, { timeout: 20_000 });
            await page.waitForTimeout(700);
            const none = await page.evaluate(measure, live);
            assert(none.body && none.body.w <= 720 && !none.aside, `${size.width}: with no AI connected the page isn't the page's 720 with no aside: ${JSON.stringify(none)}`);
            assert(!none.title || Math.abs(none.title.x - none.body.x) <= 1, `${size.width}: with no AI connected the title (${none.title?.x}) and the page (${none.body.x}) don't start together`);
            // An AI connects and checks in over MCP; four requests: three still to do, and one answered that's newer than the first of them.
            const token = await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Desk check" }) })).json()).token);
            const mcp = async (method, params) => {
              const response = await fetch(`${BASE_URL}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
              const text = await response.text();
              const line = text.split("\n").find((l) => l.startsWith("data: "));
              assert(line, `${size.width}: MCP ${method}: ${response.status} ${text.slice(0, 160)}`);
              const { result, error } = JSON.parse(line.slice(6));
              assert(!error, `${size.width}: MCP ${method}: ${error?.message}`);
              return result;
            };
            const tool = async (name, args = {}) => {
              const result = await mcp("tools/call", { name, arguments: args });
              assert(!result.isError, `${size.width}: MCP ${name}: ${result.content?.[0]?.text}`);
              return JSON.parse(result.content[0].text);
            };
            await page.reload();
            await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
            const create = (input) => page.evaluate(async (input) => (await (await import("/js/ai/client.js")).createRequest(input)).id, input);
            await create({ kind: "text_new", what: "A short story about a market", language: "nl" });
            const asked = await create({ kind: "ask", what: "Why does gisteren come before een boek?" });
            await create({ kind: "pack_new", what: "A weekend in Utrecht", language: "nl" });
            await create({ kind: "look", what: "Warmer colors", fresh: true });
            await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "desk-check", version: "1" } });
            await tool("list_requests");
            const taken = await tool("take_request", { request_id: asked });
            await tool("finish_request", { request_id: asked, seat: taken.seat, answer: "Dutch puts the time before the thing." });
            await go(page, "#today");
            await go(page, "#ai");
            await page.waitForSelector(`${live} .lx-ai-body [data-part="ai-practice"]`, { timeout: 20_000 });
            await page.waitForFunction((live) => document.querySelector(`${live} [data-part="list-row"][href="#ai/requests"] .lx-row-value`)?.textContent.trim() === "4", live, { timeout: 30_000 });
            await page.waitForTimeout(700);
            const at = await page.evaluate(measure, live);
            const said = JSON.stringify(at);
            assert(at.sideways <= 0, `${size.width}: the page scrolls sideways by ${at.sideways} px`);
            if (size.width < 1280) {
              assert(!at.aside && at.foot.every(Boolean) && at.body.w === 720, `${size.width}: under 1280 the page isn't one 720 column with Your requests, Connection and Past practices as rows at its foot and no aside\n${said}`);
              seen.push(`${size.width}: one 720 column, three rows at its foot (Your requests 4), no aside`);
              assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
              continue;
            }
            assert(at.view?.w === frame && at.body?.w === frame, `${size.width}: the page (${at.view?.w}) or its body (${at.body?.w}) isn't the frame's ${frame}\n${said}`);
            assert(at.aside && at.practice && at.ask, `${size.width}: no aside, Practice card or list of what to ask for\n${said}`);
            const main = size.width >= 1600 ? 720 : frame - 32 - 320;
            assert(Math.abs(at.practice.w - main) <= 1 && Math.abs(at.ask.w - main) <= 1 && at.practice.x === at.body.x, `${size.width}: the main column isn't ${main} wide from the page's start (Practice ${at.practice.w} at ${at.practice.x}, what to ask for ${at.ask.w})\n${said}`);
            assert(at.aside.x - at.practice.r >= 31 && at.aside.x - at.practice.r <= 33 && Math.abs(at.aside.r - at.body.r) <= 1 && at.aside.w >= 320, `${size.width}: the aside isn't 32 px beside the main column to the frame's end, 320 wide or more\n${said}`);
            assert(Math.abs(at.aside.y - at.practice.y) <= 1, `${size.width}: the aside (${at.aside.y}) and the Practice card (${at.practice.y}) don't start level`);
            assert(!at.title || Math.abs(at.title.x - at.body.x) <= 1, `${size.width}: the title (${at.title?.x}) and the page (${at.body.x}) don't start together`);
            assert(at.card && at.who === "Desk check" && at.when, `${size.width}: the connection card doesn't name the AI and when it was last here: ${at.who} / ${at.when}`);
            assert(at.rows.length === 3 && at.rows.every(([state]) => state === "waiting") && at.cancels === 0, `${size.width}: the aside's requests aren't the three still to do, with no buttons of their own: ${JSON.stringify(at.rows)}, ${at.cancels} buttons`);
            assert(at.rows.map(([, title]) => title.split(":")[0]).join(" | ") === "Change my look | Make a new pack | Add a text", `${size.width}: the aside's requests aren't newest first: ${JSON.stringify(at.rows)}`);
            assert(!at.foot[0] && !at.foot[1] && at.foot[2], `${size.width}: with the aside, Your requests and Connection should leave the foot's rows and Past practices stay: ${at.foot}`);
            // The card is the way to the connection; See all to every request.
            await page.locator(`${live} .lx-ai-aside .lx-ai-aside-card`).click();
            await page.waitForFunction(() => location.hash === "#ai/connect", null, { timeout: 10_000 });
            await go(page, "#ai");
            await page.locator(`${live} .lx-ai-aside [data-part="section-link"]`).click();
            await page.waitForFunction((live) => location.hash === "#ai/requests" && document.querySelector(`${live} [data-part="page-title"]`)?.textContent.trim() === "Your requests", live, { timeout: 10_000 });
            await page.waitForTimeout(900);
            const all = await page.evaluate((live) => ({ w: Math.round(document.querySelector('[data-part="page"] > .lx-view:not([data-waiting])').getBoundingClientRect().width), rows: document.querySelectorAll(`${live} .lx-requests > [data-part="request-row"]`).length }), live);
            assert(all.w === 720 && all.rows === 4, `${size.width}: Your requests' own page isn't the page's 720 with all four: ${JSON.stringify(all)}`);
            await go(page, "#ai");
            if (size.width === 1280) {
              // The window narrowed and widened again: the aside goes, the foot's rows come back; then the aside is back.
              await page.setViewportSize({ width: 1100, height: size.height });
              await page.waitForTimeout(700);
              const narrow = await page.evaluate(measure, live);
              assert(!narrow.aside && narrow.foot.every(Boolean), `1280 narrowed to 1100: the aside should go and the foot's three rows show\n${JSON.stringify(narrow)}`);
              await page.setViewportSize(size);
              await page.waitForTimeout(700);
              const back = await page.evaluate(measure, live);
              assert(back.aside && back.rows.length === 3 && !back.foot[0], `1280 again: the aside should be back with its three requests\n${JSON.stringify(back)}`);
            }
            assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
            seen.push(`${size.width}: main ${at.practice.w} + 32 + aside ${at.aside.w} in ${frame}; ${at.who}, ${at.when}; 3 of 4 requests, the unfinished`);
          } finally {
            await context.close();
          }
        }
        return seen.join("; ");
      }),
  },
  // ---------- reading lines on Settings' pages and the AI section ----------
  // From 1024 a note under a setting, a row's second line and an empty list's line keep the measure (settings-wide.css; connection.js names
  // its page, so Your AI keeps it in Settings and in the AI section alike). They ran the column's width: 95 to 110 characters on Your AI, a
  // request's page and Appearance → CSS (lx-audit's review of v681 found Your AI's). Every part of a page is opened first: Your AI keeps
  // most of its words in parts that open. A command to copy (code) is one line that scrolls, not reading text.
  {
    order: 107,
    run: () =>
      stage("reading lines: at 1024, 1280 and 1440 by mouse, on Your AI (in Settings and in the AI section, every part opened), a request's page and Appearance → CSS, no line of reading text wider than its measure", async () => {
        const seen = [];
        for (const size of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
          const { context, page, errors } = await device(size);
          try {
            // An AI connected, so the AI section's pages are there.
            await page.evaluate(() => fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Desk check" }) }));
            await page.reload();
            await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
            const got = [];
            for (const [route, name] of [
              ["#settings/ai", "Settings' Your AI"],
              ["#ai/connect", "the AI section's Your AI"],
              ["#ai/new/pack_new", "a request's page"],
              ["#settings/appearance/css", "Appearance → CSS"],
            ]) {
              await go(page, route);
              await page.waitForSelector('[data-part="page"]:not([data-ghost]) .lx-view:not([data-waiting]) [data-part="page-title"]', { timeout: 20_000 });
              await page.evaluate(() => document.querySelectorAll('[data-part="page"]:not([data-ghost]) details').forEach((part) => (part.open = true)));
              await page.waitForTimeout(500);
              const lines = await page.evaluate(PROSE_LINES);
              assert(!lines.over.length, `${size.width} ${name}: reading text wider than its measure: ${lines.over.slice(0, 3).join("; ")}`);
              got.push(`${name} ${lines.longest?.chars ?? "-"}`);
            }
            assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
            seen.push(`${size.width}: ${got.join(", ")}`);
          } finally {
            await context.close();
          }
        }
        return seen.join("; ");
      }),
  },
  // ---------- the first run on a computer ----------
  // From 1024 px (settings-wide.css) What do you want to learn? is a page of the frame's width, not a phone's 480 px column down the window's
  // middle (75 languages in one long scroll beside two empty thirds): the full courses and the first lessons each in four columns, read down
  // then across, their headings across all four; the search a field's width; First lessons' heading in the window's first view. (A check's
  // browser skips the first run, quiet-browser.mjs; #welcome opens it to look at, as here.)
  {
    order: 105,
    run: () =>
      stage("first run: at 1024, 1280 and 1440 by mouse What do you want to learn? is a page of the frame's width, its full courses and its first lessons each in four columns under headings across all four, the search a field's width, a search narrowing it and a click picking a language", async () => {
        const seen = [];
        for (const size of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
          const { context, page, errors } = await device(size);
          try {
            // (A new address on the same page loads nothing: the app opens the first run at its start, so it's started again there.)
            await page.evaluate(() => (location.hash = "#welcome"));
            await page.reload();
            await page.waitForSelector(".lx-welcome", { timeout: 30_000 });
            await page.waitForTimeout(1500);
            const now = () =>
              page.evaluate(() => {
                const r = (node) => {
                  const b = node.getBoundingClientRect();
                  return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) };
                };
                const welcome = document.querySelector(".lx-welcome");
                const list = welcome.querySelector(".lx-language-list > [data-part='list']");
                const rows = [...list.querySelectorAll("li:not([hidden]) [data-language]")].map((node) => ({ code: node.dataset.language, ...r(node) }));
                const heads = [...list.querySelectorAll(".lx-language-head:not([hidden])")].map((node) => ({ group: node.dataset.group, ...r(node) }));
                return { list: r(list), title: r(welcome.querySelector('[data-part="page-title"]')), find: r(welcome.querySelector('input[type="search"]')), rows, heads, view: { w: innerWidth, h: innerHeight }, wide: document.documentElement.scrollWidth };
              });
            const up = await now();
            await page.screenshot({ path: join(OUT, `first-run-${size.width}.png`) });
            const at = `${size.width}: list ${JSON.stringify(up.list)}, heads ${JSON.stringify(up.heads)}, ${up.rows.length} rows`;
            assert(up.rows.length >= 20 && up.heads.length === 2, `${size.width}: the first run's list isn't whole (a server with every language's starters: npm run local)\n${at}`);
            assert(up.wide <= up.view.w, `${size.width}: the page is ${up.wide} px wide in a ${up.view.w} px window`);
            assert(up.list.w >= Math.min(960, up.view.w) - 2 * 24 - 2 && up.list.w <= 960, `${size.width}: the list is ${up.list.w} px wide, not the frame's (960 less its padding)\n${at}`);
            assert(Math.abs(up.title.x - up.list.x) <= 1 && Math.abs(up.find.x - up.list.x) <= 1 && up.find.w <= 360, `${size.width}: the title (${up.title.x}) and the search (${up.find.x}, ${up.find.w} wide) don't start where the list does (${up.list.x}), the search a field's width`);
            for (const head of up.heads) assert(Math.abs(head.x - up.list.x) <= 1 && Math.abs(head.w - up.list.w) <= 1, `${size.width}: the ${head.group} heading isn't across all four columns: ${JSON.stringify(head)}\n${at}`);
            // Each group's rows, under its own heading: four columns, read down then across (a column's rows one under another, no column longer
            // than the one before it by more than a row's worth of balancing).
            const [full, rest] = up.heads;
            for (const [name, rows] of [["full courses", up.rows.filter((row) => row.y >= full.b - 1 && row.y < rest.y)], ["first lessons", up.rows.filter((row) => row.y >= rest.b - 1)]]) {
              const columns = [...new Set(rows.map((row) => row.x))].sort((a, b) => a - b);
              assert(rows.length < 4 || columns.length === 4, `${size.width}: the ${name} are in ${columns.length} columns, not 4 (${rows.length} rows at x ${columns.join(", ")})`);
              const counts = columns.map((x) => rows.filter((row) => row.x === x).length);
              assert(Math.max(...counts) - Math.min(...counts) <= 2, `${size.width}: the ${name}' columns aren't balanced: ${counts.join(", ")}`);
              assert(rows.every((row) => row.h <= 64 && row.r <= up.list.r + 13), `${size.width}: a row of the ${name} is taller than 64 px or past the list's edge`);
            }
            assert(rest.y < up.view.h - 40, `${size.width}: First lessons' heading (${rest.y}) isn't in the window's first view (${up.view.h})`);
            // A search narrows it to what matches, and a click picks.
            await page.locator('.lx-welcome input[type="search"]').fill("dutc");
            await page.waitForTimeout(500);
            const found = await now();
            assert(found.rows.length === 1 && found.rows[0].code === "nl" && Math.abs(found.rows[0].x - up.list.x) <= 13, `${size.width}: "dutc" typed shows ${found.rows.map((row) => row.code).join(", ")}, not Dutch alone where the list starts`);
            await page.locator('.lx-welcome [data-language="nl"]').click();
            // Dutch is a full course: its question whether you know some already, answered No, I'm new to it, and the first run gone.
            await pastKnowSome(page);
            assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
            seen.push(`${size.width}: ${up.rows.length} languages in four columns across ${up.list.w} px, First lessons at ${rest.y} of ${up.view.h}, the search ${up.find.w} wide`);
          } finally {
            await context.close();
          }
        }
        return seen.join("; ");
      }),
  },
  // ---------- Read on a computer ----------
  // From 1024 px (read.css, "on a computer"): the book up front sits beside its name and its way in at a book's size (it was a phone's page
  // across the column: a 720 × 343 picture over the button, the window's whole first view), so Weave your own is in the first view; the lead
  // shelf is a shelf, its covers one height, none wider than a wide page; Your library's books are six to a row. From 1280, where Read's own
  // page fills the frame (WIDE_GRIDS), two things lead it side by side: the book up front, its picture across its column (at most 1.5 × a
  // phone's) with its name and way in under it, and Weave your own as a card beside it; the shelf runs the frame's width under them.
  {
    order: 110,
    run: () =>
      stage("read: at 1024 by mouse the book up front sits beside its name and its way in at a book's size; at 1280 and 1440, in the frame, it and Weave your own lead the page side by side; Weave your own in the first view, the lead shelf's covers one height, Your library's covers one height (160) on Read's row and on its own page, a picture book's beside a title cover", async () => {
        const seen = [];
        for (const size of [{ width: 1024, height: 768 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
          const { context, page, errors } = await device(size);
          try {
            await go(page, "#read");
            await page.waitForSelector('[data-part="page"]:not([data-ghost]) [data-part="continue-card"]', { timeout: 30_000 });
            await page.waitForSelector('[data-part="page"]:not([data-ghost]) [data-part="weave-your-own"] > *', { timeout: 30_000 });
            await page.waitForTimeout(1800);
            const now = await page.evaluate(() => {
              const r = (node) => {
                if (!node || !node.checkVisibility({ visibilityProperty: true })) return null;
                const b = node.getBoundingClientRect();
                return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) };
              };
              const live = document.querySelector('[data-part="page"]:not([data-ghost])');
              const card = live.querySelector('[data-part="continue-card"]');
              const cover = card.querySelector(".lx-continue-top > :first-child");
              return {
                column: r(live.querySelector(".lx-library")),
                card: r(card),
                cover: r(cover.querySelector('[data-part="book-cover"]') ?? cover),
                text: r(card.querySelector(".lx-continue-text")),
                button: r(card.querySelector(':scope > [data-part="button"]')),
                weave: r(live.querySelector('[data-part="weave-your-own"]')),
                find: r(live.querySelector(".lx-read-shelf")),
                shelf: [...live.querySelectorAll('.lx-shelf-grid > [data-part="book-tile"]')].map((tile) => r(tile.querySelector('[data-part="book-cover"]'))).filter(Boolean),
                view: innerHeight,
              };
            });
            const at = `${size.width}: ${JSON.stringify(now)}`;
            await page.screenshot({ path: join(OUT, `read-${size.width}.png`) });
            assert(now.cover && now.text && now.button && now.weave, `${size.width}: Read has no book up front, or no Weave your own\n${at}`);
            assert(Math.abs(now.button.x - now.text.x) <= 2 && now.button.y >= now.text.b && now.button.w <= 360, `${size.width}: its way in (${now.button.x}, ${now.button.w} wide) isn't under its name (${now.text.x}), a button's width\n${at}`);
            if (size.width < 1280) {
              assert(now.column.w === 720, `${size.width}: Read's column is ${now.column.w} wide, not 720`);
              assert(now.cover.h <= 240 && now.cover.w <= 380, `${size.width}: the book up front is ${now.cover.w} × ${now.cover.h}, larger than a book (380 × 240 at most)\n${at}`);
              assert(now.text.x >= now.cover.r && now.text.y < now.cover.b && now.text.b > now.cover.y, `${size.width}: its name (${now.text.x}, ${now.text.y}–${now.text.b}) isn't beside its cover (to ${now.cover.r}, ${now.cover.y}–${now.cover.b})\n${at}`);
              assert(now.card.h <= 260, `${size.width}: the book up front takes ${now.card.h} px of the page\n${at}`);
              assert(now.weave.y >= now.card.b && now.weave.y < now.view - 80, `${size.width}: Weave your own (${now.weave.y}) isn't under the book, in the window's first view (${now.view})\n${at}`);
            } else {
              assert(now.column.w === 960, `${size.width}: Read's column is ${now.column.w} wide, not the frame's 960`);
              assert(now.cover.w <= 560 && now.cover.h <= 300, `${size.width}: the book up front is ${now.cover.w} × ${now.cover.h}, past 1.5 × a phone's page (560 × 300 at most)\n${at}`);
              assert(now.text.y >= now.cover.b && Math.abs(now.text.x - now.cover.x) <= 2, `${size.width}: its name (${now.text.x}, ${now.text.y}) isn't under its cover (${now.cover.x}, to ${now.cover.b})\n${at}`);
              assert(now.weave.x >= now.card.r + 16 && Math.abs(now.weave.y - now.card.y) <= 2 && now.weave.w >= 360 && now.weave.w <= 400 && Math.abs(now.weave.r - now.column.r) <= 1, `${size.width}: Weave your own (${now.weave.x}–${now.weave.r}, from ${now.weave.y}) isn't a card beside the book (to ${now.card.r}, from ${now.card.y}), 360 to 400 wide, to the frame's edge (${now.column.r})\n${at}`);
              assert(now.weave.b < now.view && now.card.b < now.view, `${size.width}: the book (to ${now.card.b}) and Weave your own (to ${now.weave.b}) aren't whole in the window's first view (${now.view})\n${at}`);
              assert(now.find && now.find.y >= Math.max(now.card.b, now.weave.b) && Math.abs(now.find.w - now.column.w) <= 1, `${size.width}: Find a book (${JSON.stringify(now.find)}) isn't under both, the frame's width\n${at}`);
            }
            assert(now.shelf.length >= 1 && now.shelf.every((cover) => Math.abs(cover.h - now.shelf[0].h) <= 1 && cover.h <= 140 && cover.w <= 300 && cover.r <= now.column.r + 1), `${size.width}: the lead shelf's covers aren't one height (140 at most), 300 wide at most, in the column: ${JSON.stringify(now.shelf)}`);
            // Your library, with the book just opened in it.
            await page.locator('[data-part="page"]:not([data-ghost]) [data-part="continue-card"] > [data-part="button"]').click();
            await page.waitForSelector('[data-part="reader"]', { timeout: 30_000 });
            await page.waitForTimeout(1500);
            // And a text of your own (a title cover), so Your library mixes shapes. Its covers are one height, 160 px, on Read's row and on its
            // own page, each at its own shape: a title cover 107 wide with its whole title on it, a picture book's page as wide as its picture
            // gives (360 at most). With only the picture at the shelves' 132, its page sat beside title covers 186 px tall; on the page, six to
            // a row, a picture book was 110 tall beside them (11 Nov 2026).
            // Two of them: the one opened last is up front, so Read's row holds the other beside the picture book.
            for (const text of ["Het is een mooie dag. De kat zit op de mat en kijkt naar de vogels in de tuin. Morgen gaan we naar de markt om brood, kaas en appels te kopen.", "Vandaag regent het. We blijven thuis en lezen een boek bij het raam, en de hond slaapt naast de kachel tot de zon weer schijnt."]) {
              await go(page, "#read/paste");
              await page.locator('[data-part="page"]:not([data-ghost]) textarea').first().fill(text);
              await page.locator('[data-part="page"]:not([data-ghost]) button').filter({ hasText: /^Add and read/ }).first().click();
              await page.waitForSelector('[data-part="reader"]', { timeout: 30_000 });
              await page.waitForTimeout(1500);
            }
            const shelf = (selector) =>
              page.evaluate((selector) => {
                const list = document.querySelector(`[data-part="page"]:not([data-ghost]) ${selector}`);
                if (!list) return null;
                const covers = [...list.querySelectorAll('[data-part="book-cover"]')].filter((cover) => cover.getClientRects().length).map((cover) => {
                  const b = cover.getBoundingClientRect();
                  const title = cover.querySelector(".lx-cover-title");
                  // Its title whole: not past its line clamp, and no word broken across two lines (at 88 wide "Wonderland:" broke in two).
                  const broken = (() => {
                    if (!title) return [];
                    const out = [];
                    const range = document.createRange();
                    const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
                    for (let t = walker.nextNode(); t; t = walker.nextNode())
                      for (const match of t.textContent.matchAll(/\S+/g)) {
                        range.setStart(t, match.index);
                        range.setEnd(t, match.index + match[0].length);
                        if (new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size > 1) out.push(match[0]);
                      }
                    return out;
                  })();
                  return { kind: cover.dataset.variant, w: Math.round(b.width), h: Math.round(b.height), b: Math.round(b.bottom), titleWhole: !title || (title.scrollHeight <= title.clientHeight + 1 && !broken.length), broken };
                });
                return { covers, kinds: [...new Set(covers.map((cover) => cover.kind))] };
              }, selector);
            const level = (got, where) => {
              assert(got && got.covers.length >= 2 && got.kinds.includes("picture") && got.kinds.some((kind) => kind !== "picture"), `${size.width}: ${where} doesn't have a picture book and a title cover to compare: ${JSON.stringify(got)}`);
              assert(got.covers.every((cover) => cover.h === 160 && Math.abs(cover.b - got.covers[0].b) <= 1), `${size.width}: ${where}'s covers aren't one height (160) with their bottoms level: ${JSON.stringify(got.covers)}`);
              assert(got.covers.every((cover) => (cover.kind === "picture" ? cover.w <= 360 : cover.w === 107) && cover.titleWhole), `${size.width}: ${where}'s covers aren't a book's size (107 wide, a picture's page 360 at most) with their titles whole: ${JSON.stringify(got.covers)}`);
            };
            await go(page, "#read");
            await page.waitForSelector('[data-part="page"]:not([data-ghost]) .lx-read-texts [data-part="book-tile"]', { timeout: 20_000 });
            await page.evaluate(() => document.querySelector('[data-part="page"]:not([data-ghost]) .lx-read-texts')?.scrollIntoView({ block: "center" }));
            await page.waitForTimeout(800);
            const row = await shelf(".lx-read-texts");
            level(row, "Read's Your library");
            await go(page, "#read/library");
            await page.waitForSelector('[data-part="page"]:not([data-ghost]) .lx-read-library-all [data-part="book-tile"]', { timeout: 20_000 });
            await page.waitForTimeout(800);
            const library = await shelf(".lx-read-library-all");
            await page.screenshot({ path: join(OUT, `read-${size.width}-library.png`) });
            level(library, "Your library's page");
            assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
            seen.push(`${size.width}: the book up front ${now.cover.w} × ${now.cover.h}, its name at ${now.text.x},${now.text.y}, its way in ${now.button.w} wide, Your library's covers ${row.covers.map((c) => `${c.w}×${c.h}`).join()}, Weave your own at ${now.weave.x},${now.weave.y} (${now.weave.w} wide) of a ${now.view} px window; shelf covers ${now.shelf[0].h} tall; its own page's covers ${library.covers.map((c) => `${c.w}×${c.h}`).join()}`);
          } finally {
            await context.close();
          }
        }
        return seen.join("; ");
      }),
  },
  // ---------- the reader on a computer ----------
  // From 1024 px the book's own things keep to the book (reader.css, "on a computer"). A text's two pages start under the top bar: until 11 Nov 2026
  // the bar lay over both pages' first lines (a chapter's heading, the opening of a text of your own) until it was put away, and putting it away
  // still moves no word. The bar's buttons, the page number and the gear sit at the book's edges, not the window's corners (400 px from the page
  // at 1920). Its sheets are panels at its end edge with no handle to drag: reading settings over the gear, Contents under its own button.
  {
    order: 120,
    run: () =>
      stage("reader: at 1280, 1440 and 1920 by mouse a text's two pages start under the top bar and stay put when it's put away, the bar's buttons, the page number and the gear keep to the book's edges, its sheets are panels at its end edge (settings over the gear, Contents under its button), an arrow either side turns the page, and a picture book is up to 1400 across from 1600", async () => {
        const seen = [];
        for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
          const { context, page, errors } = await device(size);
          try {
            await go(page, "#read");
            await page.waitForTimeout(1200);
            const tile = page.locator('[data-part="page"]:not([data-ghost]) [data-part="book-tile"]', { hasText: /Alice/ }).first();
            assert(await tile.count(), `${size.width}: no text book on Read's shelf (a copy with the shelf's books: npm run local)`);
            await tile.scrollIntoViewIfNeeded();
            await tile.click();
            await page.waitForSelector('[data-part="reader"][data-variant="spread"]', { timeout: 30_000 });
            await page.waitForTimeout(2500);
            const now = () =>
              page.evaluate(() => {
                const r = (node) => {
                  if (!node || !node.checkVisibility({ visibilityProperty: true })) return null;
                  const b = node.getBoundingClientRect();
                  return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), b: Math.round(b.bottom) };
                };
                const reader = document.querySelector('[data-part="reader"]');
                const text = reader.querySelector(':scope > [data-part="reader-text"]');
                const book = text.getBoundingClientRect();
                const gutter = parseFloat(getComputedStyle(text).paddingLeft);
                // The words of the two pages in view (the next spread's columns lie outside the text's box, which clips them).
                const words = [...text.querySelectorAll('.lx-w, [data-part="woven-word"], [data-part="reader-heading"]')]
                  .map((node) => node.getBoundingClientRect())
                  .filter((b) => b.width > 0 && b.left >= book.left - 1 && b.right <= book.right + 1 && b.bottom > 0 && b.top < innerHeight);
                const sheet = reader.querySelector(':scope > [data-part="sheet"]:not([hidden])');
                return {
                  bar: r(reader.querySelector('[data-part="reader-bar"]')),
                  back: r(reader.querySelector('[data-part="reader-bar"] .lx-back')),
                  collapse: r(reader.querySelector('[data-part="reader-collapse"]')),
                  status: r(reader.querySelector('[data-part="reader-status"]')),
                  gear: r(reader.querySelector('[data-part="reader-settings-button"]')),
                  words: words.length,
                  first: words.length ? Math.round(Math.min(...words.map((b) => b.top))) : null,
                  heading: r(text.querySelector('[data-part="reader-heading"]')),
                  page: { x: Math.round(book.left + gutter), r: Math.round(book.right - gutter) },
                  sheet: sheet && { ...r(sheet), handle: Boolean(sheet.querySelector('[data-part="sheet-handle"]')?.checkVisibility()), label: sheet.getAttribute("aria-label") },
                  zen: reader.getAttribute("data-state") === "zen",
                };
              });
            const up = await now();
            const at = `${size.width}: ${JSON.stringify(up)}`;
            await page.screenshot({ path: join(OUT, `reader-${size.width}.png`) });
            assert(up.words > 40 && up.heading, `${size.width}: the chapter's first two pages aren't on the screen\n${at}`);
            assert(up.first >= up.bar.b - 1, `${size.width}: the pages' first line (${up.first}) is under the top bar (to ${up.bar.b})\n${at}`);
            assert(up.heading.y >= up.bar.b - 1, `${size.width}: the chapter's heading (${up.heading.y}) is under the top bar (to ${up.bar.b})`);
            // The book's edges: where its pages' text starts and ends.
            assert(up.back.x >= up.page.x - 24 && up.back.x <= up.page.x + 8, `${size.width}: the way back (${up.back.x}) isn't at the page's start (${up.page.x})\n${at}`);
            assert(up.collapse.r <= up.page.r + 24 && up.collapse.r >= up.page.r - 8, `${size.width}: the chevron (to ${up.collapse.r}) isn't at the page's end (${up.page.r})\n${at}`);
            assert(up.status && Math.abs(up.status.x - up.page.x) <= 2, `${size.width}: the page number (${up.status?.x}) isn't under the page's first letter (${up.page.x})\n${at}`);
            assert(up.gear.x >= up.page.r && up.gear.x - up.page.r <= 48, `${size.width}: the gear (${up.gear.x}) isn't beside the last page (text to ${up.page.r})\n${at}`);
            // Reading settings: a panel over the gear.
            await page.locator('[data-part="reader-settings-button"]').click();
            await page.waitForTimeout(900);
            const set = (await now()).sheet;
            await page.screenshot({ path: join(OUT, `reader-${size.width}-settings.png`) });
            assert(set, `${size.width}: the gear opened nothing`);
            assert(set.w <= 400 && Math.abs(set.r - up.gear.r) <= 2 && set.b <= up.gear.y && set.y >= up.bar.b - 1 && !set.handle, `${size.width}: reading settings isn't a panel over the gear, at most 400 wide, under the bar, with no handle: ${JSON.stringify(set)} (the gear ${JSON.stringify(up.gear)})`);
            await page.keyboard.press("Escape");
            await page.waitForTimeout(700);
            assert(!(await now()).sheet, `${size.width}: Escape left reading settings open`);
            // Contents: under its own button.
            const contents = page.locator('[data-part="reader-bar"] button', { hasText: "Contents" }).first();
            const button = await contents.boundingBox();
            await contents.click();
            await page.waitForTimeout(900);
            const list = (await now()).sheet;
            await page.screenshot({ path: join(OUT, `reader-${size.width}-contents.png`) });
            assert(list && list.w <= 400 && list.y >= button.y + button.height - 1 && list.y <= button.y + button.height + 16 && Math.abs(list.r - up.collapse.r) <= 2 && !list.handle, `${size.width}: Contents isn't a panel under its button, to the bar's end: ${JSON.stringify(list)} (its button to ${Math.round(button.y + button.height)}, the chevron to ${up.collapse.r})`);
            // A press on the page puts it away, and turns nothing.
            await page.mouse.click(up.page.x + 40, size.height - 200);
            await page.waitForTimeout(700);
            assert(!(await now()).sheet, `${size.width}: a press on the page left Contents open`);
            // A page's turn by mouse: an arrow in the margin either side of the book, the one back dimmed on the first page; a press on one turns
            // the page and nothing else (the bars stay).
            const arrows = () =>
              page.evaluate(() =>
                ["back", "on"].map((which) => {
                  const node = document.querySelector(`[data-part="reader"] > [data-part="reader-turn-button"][data-variant="${which}"]`);
                  if (!node || !node.checkVisibility()) return null;
                  const b = node.getBoundingClientRect();
                  return { x: Math.round(b.left), r: Math.round(b.right), y: Math.round(b.top + b.height / 2), off: node.disabled };
                }),
              );
            const number = () => page.evaluate(() => document.querySelector('[data-part="reader-status"]').textContent.trim());
            const [back, on] = await arrows();
            const first = await number();
            assert(back && on && back.r <= up.page.x && on.x >= up.page.r && Math.abs(back.y - size.height / 2) <= 2 && Math.abs(on.y - size.height / 2) <= 2, `${size.width}: no arrow either side of the book, in its margins at the window's middle: ${JSON.stringify([back, on])} (text ${up.page.x}–${up.page.r})`);
            assert(first.startsWith("1/") && back.off && !on.off, `${size.width}: on the first page (${first}) the arrow back isn't dimmed, or the one on is: ${JSON.stringify([back, on])}`);
            await page.locator('[data-part="reader-turn-button"][data-variant="on"]').click();
            await page.waitForFunction(() => document.querySelector('[data-part="reader-status"]').textContent.trim().startsWith("2/"), null, { timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(900);
            const second = await now();
            assert((await number()).startsWith("2/") && !second.zen && !(await arrows())[0].off, `${size.width}: the arrow on didn't turn to page 2 alone (${await number()}, the bars away: ${second.zen})`);
            await page.locator('[data-part="reader-turn-button"][data-variant="back"]').click();
            await page.waitForFunction(() => document.querySelector('[data-part="reader-status"]').textContent.trim().startsWith("1/"), null, { timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(900);
            assert((await number()) === first, `${size.width}: the arrow back didn't turn back to the first page (${await number()})`);
            // The bar put away: no word moves.
            await page.locator('[data-part="reader-collapse"]').click();
            await page.waitForTimeout(900);
            const away = await now();
            assert(away.zen && away.first === up.first && away.heading.y === up.heading.y, `${size.width}: putting the bar away moved the page (first line ${up.first} → ${away.first}, zen ${away.zen})`);
            // A picture book: its book up to 1400 px wide from 1600 (its pages' pictures were two small panels in a big window's top half), 1100 under it.
            await go(page, "#read");
            const pictured = page.locator('[data-part="page"]:not([data-ghost]) .lx-read-shelf [data-part="book-tile"]:has([data-part="book-cover"][data-variant="picture"])').first();
            await pictured.waitFor({ timeout: 20_000 });
            await page.waitForTimeout(800);
            await pictured.scrollIntoViewIfNeeded();
            await pictured.click();
            await page.waitForSelector('[data-part="reader"][data-pictures][data-variant="spread"]', { timeout: 30_000 });
            await page.waitForTimeout(2000);
            const picture = await page.evaluate(() => Math.round(document.querySelector('[data-part="reader"] > [data-part="reader-text"]').getBoundingClientRect().width));
            const most = size.width >= 1600 ? 1400 : 1100;
            assert(picture === Math.min(most, size.width), `${size.width}: a picture book's two pages are ${picture} px across, not ${Math.min(most, size.width)}`);
            assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
            seen.push(`${size.width}: first line ${up.first} under the bar's ${up.bar.b}; back ${up.back.x}, number ${up.status.x}, text ${up.page.x}–${up.page.r}, gear ${up.gear.x}, arrows ${back.x} and ${on.x}; settings ${set.w} wide over the gear, Contents ${list.y} under its button; a picture book ${picture} across`);
          } finally {
            await context.close();
          }
        }
        return seen.join("; ");
      }),
  },
];

// (Settings' way in, for the phones stage's settings screen.)
const settings = async (page) => {
  await page.locator('[data-part="settings-button"]').first().tap();
  await page.waitForFunction(() => location.hash === "#settings", null, { timeout: 10_000 });
  await page.waitForTimeout(1200);
};

PHONE_SCREENS.push({
  order: 20,
  screens: [
      ["settings", settings],
    ],
});
PHONE_SCREENS.push({
  order: 30,
  screens: [
      ["translate", async (page) => (await openTranslate(page, true, TYPED), await page.waitForTimeout(800))],
    ],
});
PHONE_SCREENS.push({
  order: 100,
  screens: [
      // Read, its top as a new learner has it: the book up front, Weave your own, the shelf's first covers (decoded before it's pictured).
      ["read", async (page) => {
        await go(page, "#read");
        await page.waitForSelector('[data-part="page"]:not([data-ghost]) [data-part="continue-card"]', { timeout: 30_000 });
        await page.waitForTimeout(1500);
        await page.evaluate(async () => {
          await Promise.all([...document.querySelectorAll('[data-part="page"]:not([data-ghost]) [data-part="book-cover"] img')].filter((img) => img.getBoundingClientRect().top < innerHeight).map((img) => img.decode().catch(() => {})));
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        });
      }],
    ],
});
PHONE_SCREENS.push({
  order: 110,
  screens: [
      ["reader", async (page) => {
        await go(page, "#read");
        await page.waitForTimeout(1200);
        const tile = page.locator('[data-part="page"]:not([data-ghost]) .lx-read-shelf [data-part="book-tile"]').first();
        await tile.scrollIntoViewIfNeeded();
        await tile.tap();
        await page.waitForSelector('[data-part="reader"]', { timeout: 30_000 });
        await page.waitForTimeout(2500);
        // Its pictures decoded whole before it's pictured. (A book's photo has still come out a few hundred pixels apart, inside the photo only and
        // the layout the same, with the very same files on both sides: so its own pixels are left out, and it's compared by its place and size, photosOf.)
        await page.evaluate(async () => {
          await Promise.all([...document.querySelectorAll('[data-part="reader"] img')].map((img) => img.decode().catch(() => {})));
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        });
      }],
    ],
});
WIDE_GRIDS.push(["#read", "Read"]);
// The AI section's aside shows once an AI is connected: a token, MCP's initialize with it and list_requests (what makes "Connection · just
// now" show), then a reload; it needs no requests ("Nothing asked yet").
const connectAnAi = async (page) => {
  const token = await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Desk check" }) })).json()).token);
  const mcp = async (method, params) => {
    const response = await fetch(`${BASE_URL}/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    const text = await response.text();
    assert(text.includes("data: "), `the AI's MCP ${method}: ${response.status} ${text.slice(0, 160)}`);
  };
  await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "desk-check", version: "1" } });
  await mcp("tools/call", { name: "list_requests", arguments: {} });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
};
WIDE_ASIDES.push({ route: "#ai", name: "the AI section", grid: ".lx-ai-home", aside: ".lx-ai-aside", ready: connectAnAi });
