// desk-check's stages for the frame every page shares (lx-app, the desktop lead): hover, keys, targets, the tablet, reading lines, the
// wide column and its buttons, Settings' split, and the phones stage that compares the lanes' screens pixel for pixel. A lane's own
// stages and screens are in its own file (study.mjs, know.mjs, read.mjs); scripts/desk-check.mjs runs them all in order.

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
  drawingsOf,
  drawn,
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
  withDrawing,
  writeFileSync,
} from "./common.mjs";

export const stages = [
  // With a mouse, everything you can press shows it before you press: on the four tabs, every link and button on the page, scrolled to, looks
  // different with the mouse on it, itself or anything in it (a pack's cover, a topic's drawing, a drawn edge), Tinta left out (he breathes).
  // Before 8 Nov, 29 of 64 didn't (the audit's "hardly anything answers the mouse").
  {
    order: 40,
    run: () =>
      stage("hover: on Home, Study, Explore and Knowledge at 1280 and 1440 by mouse (the narrower in Study's, Explore's and Knowledge's wide column too), everything you can press changes its look with the mouse on it", async () => {
        const said = [];
        for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
          const { context, page, errors } = await device(size);
          try {
            await weeksIn(page);
            const none = [];
            let tried = 0;
            for (const route of MAIN_TABS) {
              await go(page, route);
              await page.waitForTimeout(1200);
              const targets = await page.evaluate(() =>
                [...document.querySelectorAll('[data-part="page"] :is(a[href], button, [role="button"])')]
                  .filter((node) => {
                    const r = node.getBoundingClientRect();
                    return r.width > 0 && r.height > 0 && node.checkVisibility() && !node.closest("[inert]");
                  })
                  .map((node, i) => {
                    node.dataset.hoverCheck = String(i);
                    return { i, part: node.dataset.part ?? null, text: (node.getAttribute("aria-label") ?? node.textContent).trim().replace(/\s+/g, " ").slice(0, 30) };
                  }),
              );
              for (const t of targets) {
                tried++;
                const el = page.locator(`[data-hover-check="${t.i}"]`);
                // Drawn again since it was marked (Knowledge draws its cards as they come into view): the same kind of thing with the same words.
                if (!(await el.count()))
                  await page.evaluate(({ i, part, text }) => {
                    const again = [...document.querySelectorAll(part ? `[data-part="${part}"]` : '[data-part="page"] :is(a[href], button)')].find(
                      (node) => (node.getAttribute("aria-label") ?? node.textContent).trim().replace(/\s+/g, " ").slice(0, 30) === text,
                    );
                    if (again) again.dataset.hoverCheck = String(i);
                  }, t);
                const look = (node) =>
                  [node, ...[...node.querySelectorAll("*")].filter((part) => !part.closest('[data-part="character"]')).slice(0, 300)]
                    .map((part) => {
                      const s = getComputedStyle(part);
                      return [s.backgroundColor, s.color, s.borderColor, s.boxShadow, s.transform, s.translate, s.filter, s.textDecorationLine, s.opacity, s.outlineStyle, s.fill, s.stroke].join("|");
                    })
                    .join("\n");
                try {
                  await el.evaluate((node) => node.scrollIntoView({ block: "center" }), null, { timeout: 2000 });
                  await page.waitForTimeout(150);
                  await page.mouse.move(2, size.height - 2);
                  await page.waitForTimeout(250);
                  const before = await el.evaluate(look, null, { timeout: 2000 });
                  // The mouse on the thing's middle, or, where Tinta stands there (Study's path strip: your place is its middle stop, and a strip
                  // leaves the mouse on him to him, untinted, so a press there is his), on its first corner, clear of him.
                  const clear = await el.evaluate((node) => {
                    const box = node.getBoundingClientRect();
                    const x = box.left + box.width / 2, y = box.top + box.height / 2;
                    return [...node.querySelectorAll('[data-part="character"]')].some((tinta) => {
                      const t = tinta.getBoundingClientRect();
                      return x >= t.left - 4 && x <= t.right + 4 && y >= t.top - 4 && y <= t.bottom + 4;
                    });
                  }, null, { timeout: 2000 });
                  await el.hover({ force: true, timeout: 2000, ...(clear ? { position: { x: 12, y: 12 } } : {}) });
                  await page.waitForTimeout(300);
                  if (before === (await el.evaluate(look, null, { timeout: 2000 }))) none.push(`${route} ${t.part ?? "link"} "${t.text}"`);
                } catch {
                  none.push(`${route} ${t.part ?? "link"} "${t.text}" (gone before the mouse reached it)`);
                }
              }
            }
            assert(tried >= 40, `${size.width}: only ${tried} things to press on the four tabs: the learner didn't come`);
            assert(!none.length, `${size.width}: ${none.length} of ${tried} don't change with the mouse on them:\n${none.join("\n")}`);
            assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
            said.push(`${size.width}: ${tried}`);
          } finally {
            await context.close();
          }
        }
        return `things on the four tabs, each changing with the mouse on it: ${said.join(", ")}`;
      }),
  },
  // Tab from a page's start: where the tabs are a sidebar (1024 and 1440) its tabs come first, Settings among them, then the header's, then the
  // page's in the order they're seen (each at or below the one before, by the page's own scroll, a row read left to right); at 820 (the tabs at
  // the foot, as on a phone) the page comes first and the tab bar last. Before 8 Nov the sidebar came last, after the whole page.
  {
    order: 50,
    run: () =>
      stage("keys: Tab from a page's start reaches the sidebar first, then the page in the order it's seen; at 820 the tab bar last", async () => {
        const lines = [];
        for (const size of [
          { width: 1024, height: 768, sidebar: true },
          { width: 1440, height: 900, sidebar: true },
          { width: 820, height: 1180, sidebar: false },
        ]) {
          const { context, page, errors } = await device(size);
          try {
            await weeksIn(page);
            for (const route of MAIN_TABS) {
              // A fresh page each time: the browser remembers where focus last was and would start from there.
              await page.goto(`${BASE_URL}/app/${route}`);
              await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
              await page.waitForTimeout(1500);
              const stops = [];
              for (let n = 0; n < 60; n++) {
                await page.keyboard.press("Tab");
                const stop = await page.evaluate(() => {
                  const el = document.activeElement;
                  if (!el || el === document.body) return null;
                  const r = el.getBoundingClientRect();
                  const where = el.closest('[data-part="tab-bar"]') ? "tabs" : el.closest('[data-part="app-header"]') ? "header" : el.closest('[data-part="page"]') ? "page" : "other";
                  const host = el.closest('[data-part="page"]');
                  const y = host ? r.top - host.getBoundingClientRect().top + host.scrollTop : r.top + scrollY;
                  return { where, x: Math.round(r.left), r: Math.round(r.right), y: Math.round(y), b: Math.round(y + r.height), text: (el.getAttribute("aria-label") ?? el.textContent).trim().replace(/\s+/g, " ").slice(0, 24) };
                });
                if (!stop) break;
                if (stops.length && stop.where === stops[0].where && stop.text === stops[0].text && stop.x === stops[0].x && stop.y === stops[0].y) break;
                stops.push(stop);
              }
              const order = stops.map((s) => s.where).filter((where, i, all) => where !== all[i - 1]).join(" → ");
              const want = size.sidebar ? /^tabs → (header → )?page$/ : /^(header → )?page → tabs$/;
              assert(want.test(order), `${size.width} ${route}: Tab goes ${order} (want ${size.sidebar ? "tabs → header → page" : "header → page → tabs"})`);
              const tabs = stops.filter((s) => s.where === "tabs");
              assert(tabs.length >= 4, `${size.width} ${route}: only ${tabs.length} of the tabs reached by Tab`);
              const page_ = stops.filter((s) => s.where === "page");
              // Back up the page: a stop that starts over the one before it. Not two on one row (their boxes share some height) where the second
              // comes after the first along the row, whichever starts higher: a card's button, then what stands beside the card (Explore's
              // lessons and the pack to add next, whose cover is taller than the button).
              const alongRow = (first, second) => first.y < second.b && second.y < first.b && second.x > first.x;
              // Into a column to the right of the one before (Home's Your progress beside the rest, from 1280): it starts at that column's top.
              // Up and to the left still goes back.
              const nextColumn = (first, second) => second.x >= first.r - 1;
              const back = page_.find((s, i) => i && s.y < page_[i - 1].y - 8 && !alongRow(page_[i - 1], s) && !nextColumn(page_[i - 1], s));
              assert(!back, `${size.width} ${route}: Tab goes back up the page, from "${page_[page_.indexOf(back) - 1]?.text}" (y ${page_[page_.indexOf(back) - 1]?.y}) to "${back?.text}" (y ${back?.y})`);
              lines.push(`${size.width} ${route} ${order} (${page_.length} on the page)`);
            }
            assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
          } finally {
            await context.close();
          }
        }
        return lines.join("; ");
      }),
  },
  {
    order: 60,
    run: () =>
      stage("targets: on a tablet by touch, every control on the sign-in page, a learner's Home, Study and Knowledge, every game and the reader reaches 44 × 44", async () => {
        const lines = [];
        const faults = [];
        for (const size of [
          { width: 744, height: 1133 },
          { width: 820, height: 1180 },
          { width: 1180, height: 820 },
        ]) {
          const measured = [];
          const look = async (page, name) => {
            await page.waitForTimeout(700);
            const small = await page.evaluate(SMALL_TARGETS, 44);
            measured.push(name);
            for (const one of small) faults.push(`${size.width} ${name}: ${one}`);
          };
          // Signed out: the sign-in page, as it opens and with an account being made.
          const out = await browser.newContext({ viewport: size, deviceScaleFactor: 2, hasTouch: true, userAgent: IPAD, serviceWorkers: "block", colorScheme: "dark" });
          if (FROM) await serveFiles(out, FROM);
          try {
            const page = await out.newPage();
            await page.goto(`${BASE_URL}/app/`);
            await page.waitForURL(/\/login\?next=/);
            await look(page, "sign-in");
            await page.click("summary");
            await look(page, "sign-in, an account being made");
          } finally {
            await out.close();
          }
          const { context, page, errors } = await device({ ...size, touch: true });
          try {
            await weeksIn(page);
            for (const route of ["#today", "#study", "#know"]) {
              await go(page, route);
              await page.waitForTimeout(800);
              await look(page, route);
            }
            for (const route of [...TARGET_GAMES.map((game) => `#study/session/game/${game}`), "#study/session/cards"]) {
              const name = route.replace("#study/session/", "");
              await go(page, route);
              await page.waitForSelector(SESSION, { timeout: 20_000 });
              await page.waitForTimeout(900);
              await look(page, `${name}'s question`);
              await answerStep(page, { next: false });
              await look(page, `${name}'s result`);
              await endSession(page);
            }
            // A book from Read's shelf, in the reader, and with its controls up (a tap in the page's middle shows them).
            await go(page, "#read");
            await page.waitForTimeout(1200);
            const tile = page.locator('[data-part="page"]:not([data-ghost]) .lx-read-shelf [data-part="book-tile"]').first();
            assert(await tile.count(), `${size.width}: Read has no book on its shelf to open`);
            await tile.scrollIntoViewIfNeeded();
            await tile.tap();
            await page.waitForSelector('[data-part="reader"]', { timeout: 30_000 });
            await page.waitForTimeout(2000);
            await look(page, "a book in the reader");
            await page.touchscreen.tap(size.width / 2, size.height / 2);
            await look(page, "the reader, its controls up");
            assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
          } finally {
            await context.close();
          }
          lines.push(`${size.width}×${size.height}: ${measured.length} screens`);
        }
        assert(!faults.length, `${faults.length} controls reach under 44 × 44:\n${faults.join("\n")}`);
        return lines.join("; ");
      }),
  },
  // ---------- a tablet (C): Translate's box, Your words, the reader's page ----------
  // On an iPad portrait by touch, a learner weeks in: Translate with a line typed has a box as tall as its text (a phone's split left ~300 px of
  // it empty at 820) and its answer above the floating bar; Your words puts a word whose name (to 18 letters) and meaning (to 44) fit a cell in
  // one place, so a shelf holds three (the phone's rule, 9 and 22, made two a shelf there); the reader's single page sets its text at most
  // 640 px wide, centered, its picture the page's whole width (the text ran edge to edge between 22 px gutters).
  {
    order: 70,
    run: () =>
      stage("tablet: on an iPad portrait by touch, Translate's box as tall as its text, Your words three to a shelf, the reader's text at most 640 px with its picture wider", async () => {
        const lines = [];
        // Every fault of the three, at both sizes, said together (the app from before fails each).
        const faults = [];
        const want = (ok, what) => void (ok || faults.push(what));
        for (const size of [
          { width: 744, height: 1133, name: "744" },
          { width: 820, height: 1180, name: "820" },
        ]) {
          const { context, page, errors } = await device({ ...size, touch: true });
          try {
            await weeksIn(page);
            // Translate, a line typed.
            await openTranslate(page, true, TYPED);
            const now = await translateNow(page);
            await page.screenshot({ path: join(OUT, `tablet-translate-${size.name}.png`) });
            const at = `${size.name}: ${JSON.stringify(now)}`;
            const twoLines = 2 * now.textarea.line + 8 + 2;
            want(now.textarea.h <= Math.max(twoLines, now.textarea.scroll + 2), `${size.name}: one line typed, the box's text area is ${now.textarea.h} px for ${now.textarea.scroll} px of text (two lines: ${twoLines})`);
            want(now.field.h < now.view.h * 0.3, `${size.name}: the box is ${now.field.h} px of a ${now.view.h} px screen for one line`);
            want(now.best && now.best.b <= (now.bar ? now.bar.y : now.view.h), `${size.name}: the answer isn't in view above the bar\n${at}`);
            await page.locator('[data-part="app-back"]').first().tap();
            await page.waitForFunction(() => !document.documentElement.hasAttribute("data-translate"), null, { timeout: 10_000 });
            // Your words.
            await go(page, "#know/words");
            await page.waitForTimeout(1500);
            // Every shelf's words (a shelf this week may hold one or two: after midnight on a Sunday it did, 9 Nov 2026), each against its own grid.
            const words = await page.evaluate(() => {
              const grids = [...document.querySelectorAll(".lx-shelf-tiles")].filter((g) => g.getClientRects().length);
              if (!grids.length) return null;
              const cell = grids[0].getBoundingClientRect().width / 3;
              const tiles = grids.flatMap((grid, g) => [...grid.querySelectorAll('[data-part="word-tile"]')].map((t) => ({
                name: t.querySelector(".lx-tile-face")?.textContent.trim() ?? "",
                means: t.querySelector(".lx-tile-means")?.textContent.trim() ?? "",
                places: Math.round(t.getBoundingClientRect().width / (grid.getBoundingClientRect().width / 3)),
                top: `${g}:${Math.round(t.getBoundingClientRect().top)}`,
              })));
              return { cell: Math.round(cell), tiles };
            });
            await page.screenshot({ path: join(OUT, `tablet-words-${size.name}.png`) });
            assert(words && words.tiles.length >= 3, `${size.name}: Your words has no shelf of words (${JSON.stringify(words)})`);
            const doubled = words.tiles.filter((t) => t.places > 1 && t.name.length <= 18 && t.means.length <= 44);
            want(!doubled.length, `${size.name}: ${doubled.length} words that fit a ${words.cell} px cell take two places: ${doubled.slice(0, 6).map((t) => `${t.name} (${t.means})`).join("; ")}`);
            const rows = [...Object.values(Object.groupBy(words.tiles, (t) => t.top))].map((row) => row.reduce((n, t) => n + t.places, 0));
            // The reader: Read's first book, its second page.
            await go(page, "#read");
            await page.waitForTimeout(1200);
            const tile = page.locator('[data-part="page"]:not([data-ghost]) .lx-read-shelf [data-part="book-tile"]').first();
            assert(await tile.count(), `${size.name}: Read has no book on its shelf to open`);
            await tile.scrollIntoViewIfNeeded();
            await tile.tap();
            await page.waitForSelector('[data-part="reader"]', { timeout: 30_000 });
            await page.waitForTimeout(2000);
            await page.keyboard.press("ArrowRight");
            await page.waitForTimeout(1500);
            const reader = await page.evaluate(() => {
              const flow = document.querySelector('[data-part="reader"] .lx-reader-flow');
              const seen = (n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
              const p = [...(flow?.querySelectorAll(":scope > p") ?? [])].find(seen);
              const img = [...(flow?.querySelectorAll('[data-part="reader-picture"] img') ?? [])].find(seen);
              const b = p?.getBoundingClientRect();
              return { variant: document.querySelector('[data-part="reader"]')?.dataset.variant ?? null, vw: innerWidth, text: b ? { x: Math.round(b.left), w: Math.round(b.width) } : null, picture: img ? Math.round(img.getBoundingClientRect().width) : null };
            });
            await page.screenshot({ path: join(OUT, `tablet-reader-${size.name}.png`) });
            assert(reader.variant !== "spread", `${size.name}: the reader shows a spread in portrait`);
            assert(reader.text, `${size.name}: no paragraph on the reader's page (${JSON.stringify(reader)})`);
            want(reader.text.w <= 641, `${size.name}: the reader's text is ${reader.text.w} px wide (at most 640)`);
            want(Math.abs(reader.text.x - (reader.vw - reader.text.w) / 2) <= 2, `${size.name}: the reader's text isn't centered (${reader.text.x} px from the left, ${reader.text.w} wide on ${reader.vw})`);
            want(reader.picture === null || reader.picture > reader.text.w, `${size.name}: the page's picture (${reader.picture} px) isn't wider than its text (${reader.text.w})`);
            assert(!errors.length, `${size.name}: page errors: ${errors.join(" | ")}`);
            lines.push(`${size.name}: box ${now.field.h} px for ${now.textarea.scroll} px of text; words ${words.tiles.length} on rows of ${rows.join("/")} places (cell ${words.cell} px); reader text ${reader.text.w} px, picture ${reader.picture ?? "none on that page"}`);
          } finally {
            await context.close();
          }
        }
        assert(!faults.length, faults.join("\n"));
        return lines.join("; ");
      }),
  },
  {
    order: 80,
    run: () =>
      stage("measure: at 1024, 1280 and 1440 by mouse, no line of reading text over 72 characters on the pages the walk found long (Study's packs, a pack's page, an Explore item, Everyday's words, Translate's sources, Terms, Privacy) nor, in the wide column, on Study, Explore, Knowledge, Your words and the topics; a page's line under its title where its column starts", async () => {
        const lines = [];
        const faults = [];
        for (const size of [
          { width: 1024, height: 768, name: "1024" },
          { width: 1280, height: 800, name: "1280" },
          { width: 1440, height: 900, name: "1440" },
        ]) {
          const { context, page, errors } = await device(size);
          try {
            await weeksIn(page);
            const seen = [];
            const look = async (name) => {
              await page.waitForTimeout(1000);
              const got = await page.evaluate(READING_LINES);
              if (got.longest && got.longest.chars > 72) faults.push(`${size.name} ${name}: a line of ${got.longest.chars} characters ("${got.longest.text}…")`);
              for (const intro of got.intros) if (intro.off !== null && Math.abs(intro.off) > 1) faults.push(`${size.name} ${name}: "${intro.text}…" starts ${intro.off} px from its column`);
              seen.push(`${name} ${got.longest?.chars ?? "-"}`);
            };
            const follow = async (selector) => {
              const link = page.locator(selector).first();
              assert(await link.count(), `${size.name}: nothing to follow (${selector})`);
              await link.scrollIntoViewIfNeeded();
              await link.click();
              await page.waitForTimeout(1500);
            };
            // The wide column's pages (1280 and up: shell.css), whose text has the most room.
            if (size.width >= 1280) for (const [route, name] of WIDE_GRIDS) {
              await go(page, route);
              await look(name);
            }
            await go(page, "#study/packs");
            await look("Study's packs");
            await follow('[data-part="page"]:not([data-ghost]) a[href^="#study/packs/"], [data-part="page"]:not([data-ghost]) a[href*="pack"]');
            await look("a pack's page");
            await go(page, "#explore");
            await follow('[data-part="page"]:not([data-ghost]) a[href^="#explore/"][href*="/"]:not([href="#explore/yours"])');
            await look("an Explore item");
            // A pack's page with its Lessons open: each lesson's line of what it teaches (desk-know, 11 Nov 2026).
            await go(page, "#explore/item/path-nl");
            await page.evaluate(() => {
              for (const more of document.querySelectorAll('[data-part="page"]:not([data-ghost]) .lx-quiet-more')) if (more.querySelector(".lx-explore-lessons")) more.open = true;
            });
            await look("a pack's lessons");
            await go(page, "#know/everyday/words");
            await look("Everyday's words");
            await openTranslate(page, false, "lopen");
            await look("Translate's sources");
            await page.evaluate(() => (location.hash = "#today"));
            for (const path of ["/terms", "/privacy"]) {
              await page.goto(`${BASE_URL}${path}`);
              await look(path.slice(1));
            }
            assert(!errors.length, `${size.name}: page errors: ${errors.join(" | ")}`);
            lines.push(`${size.name}: ${seen.join(", ")}`);
          } finally {
            await context.close();
          }
        }
        assert(!faults.length, faults.join("\n"));
        return `the longest line of reading text, in characters: ${lines.join("; ")}`;
      }),
  },
  // The wide column (1280 and up: shell.css, the director's option 2, 9 Nov 2026): the grid pages at 960, so their grids use the room, and their
  // lists and forms at 720 (a list's switches sat 900 px from their names at 960). No button grows past its width in the 720 column
  // (components.css, its end: Explore's Continue was 924 wide at 960): each measured with the column at 960, then with the app's data-column
  // taken off for a frame (the 720), then put back. Rows and lists span the column as its fields and cards do: one straight in it (no box between
  // with an inset of its own) ends at its right edge (the director, 9 Nov: capped too, Explore's All packs and its language row stopped short
  // of the search field and the topics above them). Before 9 Nov every page was 720 wide at every size.
  {
    order: 90,
    run: () =>
      stage("wide: at 1280 and 1440 by mouse, the grid pages (Study's, Explore's, Knowledge's, Your words, the topics) in a 960 column with Study's games 4 a row, Explore's topics 6 and Your words 4 a shelf; their lists and forms and Home at 720; on a grid page no button wider than with the column at 720, every row and list straight in the column to its right edge", async () => {
        const faults = [];
        const said = [];
        for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
          const { context, page, errors } = await device(size);
          try {
            await weeksIn(page);
            let rowsSeen = 0;
            const titles = [];
            const column = () => page.evaluate(() => Math.round(document.querySelector('[data-part="page"] > .lx-view:not([data-waiting])')?.getBoundingClientRect().width ?? -1));
            for (const [route, name] of WIDE_GRIDS) {
              await go(page, route);
              await page.waitForTimeout(600);
              const width = await column();
              if (width !== 960) faults.push(`${size.width} ${name}: its column ${width} wide, not 960`);
              for (const one of await page.evaluate(BUTTON_RULE)) faults.push(`${size.width} ${name}: ${one}`);
              titles.push([name, await page.evaluate(TITLE_X)]);
              const spans = await page.evaluate(() => {
                const view = document.querySelector('[data-part="page"] > .lx-view:not([data-waiting])');
                const right = view.getBoundingClientRect().right;
                // Inside a box with an inset of its own (a card's padding or border) that ends short of the column: that box's to fill, not this.
                const inset = (node) => {
                  for (let at = node.parentElement; at && at !== view; at = at.parentElement) {
                    const s = getComputedStyle(at);
                    if (at.getBoundingClientRect().right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth) < right - 1) return true;
                  }
                  return false;
                };
                // One of a row of several (Study's rows two a row: a grid of columns that itself ends at the column's edge): its row's to place.
                const celled = (node) => {
                  for (let at = node.parentElement; at && at !== view; at = at.parentElement) {
                    const s = getComputedStyle(at);
                    if (s.display === "grid" && s.gridTemplateColumns.trim().split(/\s+/).length > 1) return at.getBoundingClientRect().right >= right - 1;
                  }
                  return false;
                };
                const rows = [...view.querySelectorAll('[data-part="list"], [data-part="list-row"]')].filter((node) => node.checkVisibility() && node.getBoundingClientRect().width > 0 && !inset(node) && !celled(node));
                return {
                  rows: rows.length,
                  short: rows
                    .filter((node) => node.getBoundingClientRect().right < right - 1)
                    .map((node) => `${node.dataset.part} "${node.textContent.trim().replace(/\s+/g, " ").slice(0, 28)}" ends ${Math.round(right - node.getBoundingClientRect().right)} px short of the column`),
                };
              });
              rowsSeen += spans.rows;
              for (const one of spans.short) faults.push(`${size.width} ${name}: ${one}`);
            }
            const rows = {};
            await go(page, "#study");
            rows.games = await page.evaluate(IN_A_ROW, '[data-part="way-tiles"]');
            // Study's doors side by side, and its rows two a row (the two under the games; Study a topic beside Your packs), each row of two
            // from the column's start to its end.
            const pairs = await page.evaluate(() => {
              const view = document.querySelector('[data-part="page"] > .lx-view:not([data-waiting])').getBoundingClientRect();
              const row = (selector) => {
                const host = [...document.querySelectorAll(`[data-part="page"] ${selector}`)].find((node) => node.checkVisibility());
                const items = host ? [...host.children].filter((node) => node.getBoundingClientRect().height > 0) : [];
                const boxes = items.map((node) => node.getBoundingClientRect());
                return { n: boxes.filter((b) => Math.abs(b.top - boxes[0].top) < 2).length, from: Math.round(Math.min(...boxes.map((b) => b.left)) - view.left), to: Math.round(view.right - Math.max(...boxes.map((b) => b.right))) };
              };
              return { doors: row(".lx-study-doors"), choose: row(".lx-quick-play > .lx-study-rows"), foot: row(".lx-study-foot") };
            });
            for (const [name, pair] of Object.entries(pairs))
              if (pair.n !== 2 || Math.abs(pair.from) > 1 || Math.abs(pair.to) > 1) faults.push(`${size.width}: Study's ${name} ${pair.n} a row (from ${pair.from} px after the column's start to ${pair.to} px before its end), not two a row across it`);
            await go(page, "#explore");
            rows.topics = await page.evaluate(IN_A_ROW, ".lx-topics");
            await go(page, "#know/words");
            rows.words = await page.evaluate(IN_A_ROW, ".lx-shelf-tiles");
            if (rows.games !== 4) faults.push(`${size.width}: Study's games ${rows.games} a row, not 4`);
            if (rows.topics !== 6) faults.push(`${size.width}: Explore's topics ${rows.topics} a row, not 6`);
            if (rows.words !== 4) faults.push(`${size.width}: Your words ${rows.words} a shelf, not 4`);
            for (const [route, name] of NARROW) {
              await go(page, route);
              await page.waitForTimeout(600);
              const width = await column();
              if (width !== 720) faults.push(`${size.width} ${name}: its column ${width} wide, not 720`);
              for (const one of await page.evaluate(BUTTON_RULE)) faults.push(`${size.width} ${name}: ${one}`);
              // (The path is one block centered as a whole, its title with it: main.js CENTER_PAGES.)
              if (route !== "#study/path") titles.push([name, await page.evaluate(TITLE_X)]);
            }
            // One frame: every page's title starts at the same place, a grid page's and a list's alike (shell.css --lx-frame).
            const xs = new Set(titles.filter(([, x]) => x !== null).map(([, x]) => x));
            if (xs.size !== 1) faults.push(`${size.width}: the title moves between pages: ${titles.map(([n, x]) => `${n} ${x}`).join(", ")}`);
            assert(rowsSeen >= 2, `${size.width}: only ${rowsSeen} rows straight in a grid page's column: Explore's All packs and its language row missing`);
            assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
            said.push(`${size.width}: games ${rows.games}, topics ${rows.topics}, words ${rows.words} a row, ${rowsSeen} rows to the column's edge`);
          } finally {
            await context.close();
          }
        }
        assert(!faults.length, faults.join("\n"));
        return `the grid pages 960, the rest 720 at the frame's start, every title at one place, every block button 240–360 at its box's start or centered, the rows the column's width; ${said.join("; ")}`;
      }),
  },
  // Settings on a wide screen (1280 and up: shell/main.js SPLIT, shell.css data-split): its menu in a pane of its own beside the page it opened, as a
  // computer's settings are. Settings itself opens its first page, Account; the pane's row for the page in view lit (aria-current); a first page has
  // no back pill (the pane is its way back), a page further in its own; the pane the same node from page to page, its title level with the page's,
  // never under it; the page the 720 column at 1440 (narrower at 1280); leaving for a tab takes the pane away; at 1024 none, the menu alone.
  // Before 9 Nov the menu was a page of its own at every size.
  {
    order: 12,
    run: () =>
      stage("language page: while the app is in English alone, Settings → Language's line on what you speak is a group of its own under I speak, titled as Learning is, never under the Add a language button", async () => {
        const faults = [];
        for (const size of [{ width: 390, height: 844, touch: true }, { width: 1280, height: 800 }]) {
          const { context, page, errors } = await device(size);
          try {
            await go(page, "#settings/language");
            await page.waitForTimeout(800);
            const at = await page.evaluate(() => {
              const view = document.querySelector('[data-part="page"] > .lx-view:not([data-waiting])');
              const note = [...(view?.querySelectorAll('[data-part="group-note"], p') ?? [])].find((node) => /More languages are coming/.test(node.textContent));
              const group = note?.closest("section");
              const title = group?.querySelector(":scope > .lx-choice-title")?.textContent.trim() ?? null;
              const learning = [...(view?.querySelectorAll(".lx-choice-title") ?? [])].find((node) => node.textContent.trim() === "Learning");
              const add = [...(view?.querySelectorAll("button, [data-part='button'], [data-part='list-row']") ?? [])].find((node) => /Add a language/.test(node.textContent));
              const style = (node) => node && (({ fontSize, fontWeight, color }) => ({ fontSize, fontWeight, color }))(getComputedStyle(node));
              return {
                found: Boolean(note),
                title,
                sameAsLearning: JSON.stringify(style(group?.querySelector(":scope > .lx-choice-title"))) === JSON.stringify(style(learning)),
                withAdd: Boolean(add && group && group.contains(add)),
              };
            });
            if (!at.found) faults.push(`${size.width}: no line on what you speak`);
            else {
              if (at.title !== "I speak") faults.push(`${size.width}: the line's group is titled ${JSON.stringify(at.title)}, not "I speak"`);
              if (!at.sameAsLearning) faults.push(`${size.width}: "I speak" isn't titled as Learning is`);
              if (at.withAdd) faults.push(`${size.width}: the line sits in the group with Add a language`);
            }
            if (errors.length) faults.push(`${size.width}: ${errors.join("; ")}`);
          } finally {
            await context.close();
          }
        }
        assert(faults.length === 0, faults.join("\n"));
        return "I speak, a group of its own, at 390 and 1280";
      }),
  },
  {
    order: 92,
    run: () =>
      stage("asides: at 1280, 1440 and 1600 by mouse a tab's page with an aside (WIDE_ASIDES) splits the frame's column in two: below 1600 its main column and a 320 aside 32 apart, from 1600 a 720 main column, 32, and the rest; the aside level with the main column's first block, nothing of the main column past its edge and its widest block at it (frame.md §1)", async () => {
        const faults = [];
        const said = [];
        assert(WIDE_ASIDES.length > 0, "no page in WIDE_ASIDES");
        for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }, { width: 1600, height: 1000 }]) {
          const { context, page, errors } = await device(size);
          try {
            await weeksIn(page);
            for (const entry of WIDE_ASIDES) {
              if (entry.ready) await entry.ready(page);
              await go(page, entry.route);
              const live = '[data-part="page"] > .lx-view:not([data-waiting])';
              await page.waitForSelector(`${live}${entry.grid === ":scope" ? "" : ` ${entry.grid}`} > ${entry.aside}`, { timeout: 20_000 }).catch(() => {});
              await page.waitForTimeout(700);
              const at = await page.evaluate(({ live, grid, aside }) => {
                const view = document.querySelector(live);
                // (":scope": the view itself, as Home's two columns are. querySelector never returns the element it's called on.)
                const box = grid === ":scope" ? view : view?.querySelector(grid);
                const side = box && [...box.children].find((node) => node.matches(aside));
                if (!view || !box || !side || !side.checkVisibility()) return { missing: !view ? "the page" : !box ? grid : aside };
                const r = (node) => node.getBoundingClientRect();
                const main = [...box.children].filter((node) => node !== side && node.checkVisibility() && r(node).height > 0);
                return {
                  view: { left: Math.round(r(view).left), right: Math.round(r(view).right) },
                  grid: { left: Math.round(r(box).left), right: Math.round(r(box).right) },
                  aside: { left: Math.round(r(side).left), right: Math.round(r(side).right), top: Math.round(r(side).top) },
                  main: { top: Math.round(Math.min(...main.map((node) => r(node).top))), right: Math.round(Math.max(...main.map((node) => r(node).right))), n: main.length },
                };
              }, { live, grid: entry.grid, aside: entry.aside });
              const where = `${size.width} ${entry.name}`;
              if (at.missing) {
                faults.push(`${where}: no ${at.missing}`);
                continue;
              }
              const frame = size.width >= 1600 ? 1120 : 960;
              const width = at.view.right - at.view.left;
              if (width !== frame) faults.push(`${where}: its column ${width} wide, not ${frame}`);
              if (Math.abs(at.grid.left - at.view.left) > 1 || Math.abs(at.grid.right - at.view.right) > 1) faults.push(`${where}: its two columns run ${at.grid.left}–${at.grid.right}, not the column's ${at.view.left}–${at.view.right}`);
              const mainEnd = size.width >= 1600 ? at.grid.left + 720 : at.grid.right - 320 - 32;
              const asideStart = mainEnd + 32;
              if (Math.abs(at.aside.left - asideStart) > 1 || Math.abs(at.aside.right - at.grid.right) > 1) faults.push(`${where}: the aside runs ${at.aside.left}–${at.aside.right}, not ${asideStart}–${at.grid.right}`);
              if (at.main.right > mainEnd + 1) faults.push(`${where}: the main column reaches ${at.main.right}, past its edge at ${mainEnd}`);
              else if (at.main.right < mainEnd - 1) faults.push(`${where}: the main column's widest block ends at ${at.main.right}, short of its edge at ${mainEnd}`);
              if (Math.abs(at.aside.top - at.main.top) > 2) faults.push(`${where}: the aside's top at ${at.aside.top}, the main column's first block at ${at.main.top}`);
              said.push(`${where} ${mainEnd - at.grid.left}+32+${at.grid.right - asideStart}`);
            }
            if (errors.length) faults.push(`${size.width}: ${errors.join("; ")}`);
          } finally {
            await context.close();
          }
        }
        assert(faults.length === 0, faults.join("\n"));
        return said.join("; ");
      }),
  },
  {
    order: 96,
    run: () =>
      stage("bar title: at 1280 and 1440 by mouse a page's title in the bar, once its large title has gone under the header, is over the middle of the page's own column (a pack's page: its 720; Your words: the frame's 960) and clear of the way back and the header's end; Translate's way back keeps its label", async () => {
        const faults = [];
        const said = [];
        for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
          const { context, page, errors } = await device(size);
          try {
            await weeksIn(page);
            for (const [route, name] of [["#explore/item/path-nl", "a pack's page"], ["#know/words", "Your words"]]) {
              await go(page, route);
              await page.waitForTimeout(800);
              await page.evaluate(() => {
                const scroller = document.querySelector('[data-part="app"] > [data-part="page"]');
                scroller.scrollTop = 600;
              });
              await page.waitForTimeout(900);
              const at = await page.evaluate(() => {
                const header = document.querySelector('[data-part="app"] > [data-part="app-header"]');
                const bar = header?.querySelector(':scope > [data-part="bar-title"]');
                const words = bar?.firstElementChild;
                const view = document.querySelector('[data-part="page"] > .lx-view:not([data-waiting])');
                const pill = header?.querySelector(':scope > [data-part="app-back"]');
                const end = header?.querySelector(":scope > .lx-header-end");
                if (!bar || !view) return null;
                const r = (node) => node.getBoundingClientRect();
                const v = r(view);
                const w = r(words);
                return {
                  shown: Number(getComputedStyle(bar).opacity),
                  title: Math.round(r(bar).left + r(bar).width / 2),
                  column: Math.round(v.left + v.width / 2),
                  left: Math.round(w.left), right: Math.round(w.right),
                  pill: pill ? Math.round(r(pill).right) : null,
                  end: end && end.childElementCount ? Math.round(r(end).left) : null,
                };
              });
              const where = `${size.width} ${name}`;
              if (!at) {
                faults.push(`${where}: no bar title`);
                continue;
              }
              if (at.shown < 0.99) faults.push(`${where}: scrolled 600 px, the bar's title isn't shown (${at.shown})`);
              if (Math.abs(at.title - at.column) > 1) faults.push(`${where}: the bar's title centered at ${at.title}, the page's column at ${at.column}`);
              if (at.pill !== null && at.left < at.pill + 7) faults.push(`${where}: the title starts at ${at.left}, under the way back (to ${at.pill})`);
              if (at.end !== null && at.right > at.end - 7) faults.push(`${where}: the title ends at ${at.right}, under the header's end (from ${at.end})`);
              said.push(`${where} ${at.title}/${at.column}`);
            }
            // Translate's title is its heading, on a row of its own: its way back keeps its label (v702 left it a bare chevron).
            await openTranslate(page, false, "lopen");
            const back = await page.evaluate(() => {
              const header = document.querySelector('[data-part="app"] > [data-part="app-header"]');
              const label = header?.querySelector(':scope > [data-part="app-back"] > span');
              return { chevron: header?.dataset.pill === "chevron", label: label && label.checkVisibility() ? label.textContent.trim() : null };
            });
            if (back.chevron || back.label !== "Home") faults.push(`${size.width} Translate: its way back is ${back.chevron ? "a bare chevron" : `"${back.label}"`}, not "< Home"`);
            if (errors.length) faults.push(`${size.width}: ${errors.join("; ")}`);
          } finally {
            await context.close();
          }
        }
        assert(faults.length === 0, faults.join("\n"));
        return said.join("; ");
      }),
  },
  {
    order: 95,
    run: () =>
      stage("toasts: at 1280 and 1440 by mouse a toast's middle is the page's beside the sidebar, and the window's while a session covers it (it kept the sidebar's offset there, 124 px right of the middle)", async () => {
        const faults = [];
        const said = [];
        // A theme switch says so in a toast ("Now using …"): switched to the other built-in each time, so there's always one.
        const toastAt = async (page) => {
          await page.evaluate(async () => {
            const { useTheme } = await import("/js/lx/theme.js");
            useTheme(document.documentElement.dataset.theme === "paper" ? "graphite" : "paper");
          });
          await page.waitForTimeout(900);
          return page.evaluate(() => {
            const toast = [...document.querySelectorAll('.lx-toasts [data-part="toast"]')].pop();
            const shown = document.querySelector('[data-part="app"] > [data-part="page"]');
            if (!toast) return null;
            const b = toast.getBoundingClientRect();
            const p = shown.getBoundingClientRect();
            return { toast: Math.round(b.left + b.width / 2), page: Math.round(p.left + p.width / 2), window: Math.round(innerWidth / 2) };
          });
        };
        for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
          const { context, page, errors } = await device(size);
          try {
            await go(page, "#today");
            const home = await toastAt(page);
            if (!home) faults.push(`${size.width}: no toast on Home`);
            else if (Math.abs(home.toast - home.page) > 1) faults.push(`${size.width}: on Home the toast's middle at ${home.toast}, the page's at ${home.page}`);
            await knowWords(page);
            await go(page, "#study/session/game/choose");
            await page.waitForSelector(SESSION, { timeout: 20_000 });
            await page.waitForTimeout(700);
            const session = await toastAt(page);
            if (!session) faults.push(`${size.width}: no toast in a session`);
            else if (Math.abs(session.toast - session.window) > 1) faults.push(`${size.width}: in a session the toast's middle at ${session.toast}, the window's at ${session.window}`);
            await endSession(page);
            said.push(`${size.width} Home ${home?.toast}/${home?.page}, session ${session?.toast}/${session?.window}`);
            if (errors.length) faults.push(`${size.width}: ${errors.join("; ")}`);
          } finally {
            await context.close();
          }
        }
        assert(faults.length === 0, faults.join("\n"));
        return said.join("; ");
      }),
  },
  {
    order: 100,
    run: () =>
      stage("split: at 1280 and 1440 by mouse, Settings' menu in a pane beside its page (Settings itself opening Account), the page's row lit, no way back on a first page and its own further in, the pane kept from page to page and level with the page; none at 1024", async () => {
        const faults = [];
        const said = [];
        const PANE = '[data-part="page"] > .lx-settings-aside';
        const now = (page) =>
          page.evaluate((PANE) => {
            const pane = document.querySelector(PANE);
            const view = document.querySelector('[data-part="page"] > .lx-view:not([data-waiting])');
            const r = (node) => node && node.getBoundingClientRect();
            const title = (root) => r(root?.querySelector('[data-part="page-title"], h1'));
            return {
              hash: location.hash,
              // The pane's content box (its rows' rounded outset sits in its padding, shell.css: their text is where the pane's is).
              pane: pane && pane.checkVisibility() ? (() => {
                const s = getComputedStyle(pane);
                const left = r(pane).left + parseFloat(s.paddingLeft);
                const right = r(pane).right - parseFloat(s.paddingRight);
                return { left: Math.round(left), right: Math.round(right), width: Math.round(right - left), title: Math.round(title(pane)?.top ?? -1) };
              })() : null,
              view: view ? { left: Math.round(r(view).left), width: Math.round(r(view).width), title: Math.round(title(view)?.top ?? -1) } : null,
              lit: pane ? [...pane.querySelectorAll('[aria-current="page"]')].map((node) => node.getAttribute("href")) : [],
            };
          }, PANE);
        for (const size of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
          const { context, page, errors } = await device(size);
          try {
            await go(page, "#study");
            await page.locator(`${SIDEBAR} [data-part="tab"][data-variant="settings"]`).click();
            await page.waitForFunction(() => location.hash === "#settings/account", null, { timeout: 10_000 }).catch(() => {});
            await page.waitForTimeout(700);
            let at = await now(page);
            if (at.hash !== "#settings/account") faults.push(`${size.width}: Settings from the sidebar opened ${at.hash}, not Account`);
            if (!at.pane) {
              faults.push(`${size.width}: no menu beside Settings' page`);
              continue;
            }
            const widths = { pane: at.pane.width, page: at.view.width };
            if (at.pane.width !== 320) faults.push(`${size.width}: the menu's pane ${at.pane.width} wide, not 320`);
            if (at.view.left < at.pane.right + 24) faults.push(`${size.width}: the page starts ${at.view.left - at.pane.right} px after the pane`);
            if (Math.abs(at.view.title - at.pane.title) > 2) faults.push(`${size.width}: the page's title at ${at.view.title}, the pane's at ${at.pane.title}`);
            const want = size.width >= 1440 ? 720 : 640;
            if (size.width >= 1440 ? at.view.width !== want : at.view.width < want) faults.push(`${size.width}: the page ${at.view.width} wide (${size.width >= 1440 ? "not 720" : "under 640"})`);
            if (at.lit.join() !== "#settings/account") faults.push(`${size.width}: lit in the pane: ${at.lit.join() || "nothing"}, not Account`);
            // Lit as the sidebar lights the tab you're on, the avatar on it ringed.
            const looks = await page.evaluate((PANE) => {
              const row = document.querySelector(`${PANE} [aria-current="page"]`);
              const tab = document.querySelector('[data-part="app"] > [data-part="tab-bar"] [data-part="tab"][data-state="active"]');
              return { row: row && getComputedStyle(row).backgroundColor, tab: tab && getComputedStyle(tab).backgroundColor, ring: getComputedStyle(row?.querySelector('[data-part="avatar"]') ?? document.body).boxShadow };
            }, PANE);
            if (!looks.row || looks.row !== looks.tab) faults.push(`${size.width}: the lit row ${looks.row}, the sidebar's lit tab ${looks.tab}`);
            if (!/inset/.test(looks.ring ?? "")) faults.push(`${size.width}: the lit Account row's avatar has no ring (${looks.ring})`);
            if (await box(page, PILL)) faults.push(`${size.width}: Account beside the menu has a way back ("${await pillText(page)}")`);
            await page.screenshot({ path: join(OUT, `split-${size.width}-account.png`) });
            // A press in the pane: its page beside it, the pane the same node, that row lit.
            await page.evaluate((PANE) => (window.lxPane = document.querySelector(PANE)), PANE);
            await page.locator(`${PANE} a[href="#settings/appearance"]`).click();
            await page.waitForFunction(() => location.hash === "#settings/appearance", null, { timeout: 10_000 });
            await page.waitForTimeout(600);
            at = await now(page);
            if (!(await page.evaluate((PANE) => window.lxPane === document.querySelector(PANE), PANE))) faults.push(`${size.width}: the pane was drawn again for Appearance`);
            if (at.lit.join() !== "#settings/appearance") faults.push(`${size.width}: lit for Appearance: ${at.lit.join() || "nothing"}`);
            if (await box(page, PILL)) faults.push(`${size.width}: Appearance beside the menu has a way back ("${await pillText(page)}")`);
            // Further in: its own way back; the pane still lit at Appearance.
            await page.locator('[data-part="page"] > .lx-view:not([data-waiting]) a[href="#settings/appearance/edit"]').first().click();
            await page.waitForFunction(() => location.hash === "#settings/appearance/edit", null, { timeout: 10_000 });
            await page.waitForTimeout(600);
            at = await now(page);
            if (at.lit.join() !== "#settings/appearance") faults.push(`${size.width}: lit for Make it yours: ${at.lit.join() || "nothing"}`);
            if (!(await box(page, PILL)) || !/Appearance/.test(await pillText(page))) faults.push(`${size.width}: Make it yours has no way back to Appearance (${await pillText(page)})`);
            await page.screenshot({ path: join(OUT, `split-${size.width}-make-it-yours.png`) });
            // Back a step at a time, as on a phone: Appearance, Account (Settings' own place, its first page took it), then out of Settings, the
            // pane gone with it.
            const backs = [];
            for (let i = 0; i < 3; i++) {
              await page.goBack();
              await page.waitForTimeout(600);
              at = await now(page);
              backs.push(`${at.hash}${at.pane ? "+pane" : ""}`);
            }
            // (The last, the app's first entry: Home, by whatever address it was opened at.)
            const out = !backs[2].startsWith("#settings") && !backs[2].endsWith("+pane");
            if (backs.slice(0, 2).join() !== "#settings/appearance+pane,#settings/account+pane" || !out) faults.push(`${size.width}: back three times from Make it yours: ${backs.map((b) => b || "(the first page)").join(", ")}`);
            // A tab: the pane goes.
            await page.locator(`${SIDEBAR} [data-part="tab"][data-variant="settings"]`).click();
            await page.waitForFunction(() => location.hash === "#settings/account", null, { timeout: 10_000 }).catch(() => {});
            await page.waitForTimeout(600);
            await page.locator(`${SIDEBAR} [data-part="tab"]`).first().click();
            await page.waitForTimeout(700);
            if ((await now(page)).pane) faults.push(`${size.width}: the menu's pane stayed on ${await page.evaluate(() => location.hash)}`);
            assert(!errors.length, `${size.width}: page errors: ${errors.join(" | ")}`);
            said.push(`${size.width}: pane ${widths.pane}, page ${widths.page}`);
          } finally {
            await context.close();
          }
        }
        // 1920 (from 1600 the frame is wider than the split's own 1072): the pane and the page are the frame exactly, as Study's column is.
        {
          const { context, page } = await device({ width: 1920, height: 1080 });
          try {
            await go(page, "#study");
            await page.waitForTimeout(700);
            const frame = await page.evaluate(() => {
              const view = document.querySelector('[data-part="page"] > .lx-view:not([data-waiting])').getBoundingClientRect();
              return { left: Math.round(view.left), right: Math.round(view.right) };
            });
            await go(page, "#settings/account");
            await page.waitForTimeout(900);
            const at = await now(page);
            const right = at.view ? at.view.left + at.view.width : null;
            if (!at.pane || Math.abs(at.pane.left - frame.left) > 1 || Math.abs(right - frame.right) > 1)
              faults.push(`1920: Settings runs ${at.pane?.left}–${right}, Study's frame ${frame.left}–${frame.right}`);
            said.push(`1920: ${at.pane?.left}–${right}, the frame ${frame.left}–${frame.right}`);
          } finally {
            await context.close();
          }
        }
        // 1024: the menu alone, as before.
        const { context, page } = await device({ width: 1024, height: 768 });
        try {
          await go(page, "#settings");
          await page.waitForTimeout(700);
          const at = await now(page);
          if (at.hash !== "#settings" || at.pane) faults.push(`1024: ${at.hash}${at.pane ? " with a pane" : ""}, not the menu alone`);
        } finally {
          await context.close();
        }
        assert(!faults.length, faults.join("\n"));
        return `the menu beside its page, Settings opening Account, the page's row lit, a first page's way back the pane, Make it yours back to Appearance; ${said.join("; ")}; 1024 the menu alone`;
      }),
  },
  {
    order: 130,
    run: () =>
      stage("phones: Home, Settings, Translate, two games (question and result), Your words, Study's packs, Everyday's words, Read and a book in the reader at 390 and 320, pixel for pixel as the app was (--base)", async () => {
        const faults = [];
        const shots = [];
        const controls = [];
        const drawnControls = []; // the screens whose drawings were held by place (DRAWN_SCREENS), with both controls caught
        const screens = phoneScreens();
        for (const [width, height] of [
          [390, 844],
          [320, 568],
        ]) {
          const now = await device({ width, height, touch: true, still: true, files: FROM ?? HERE });
          const before = await device({ width, height, touch: true, still: true, files: BEFORE });
          try {
            for (const [name, act] of screens) {
              if (SCREENS && !SCREENS.test(name)) continue;
              await act(now.page);
              await act(before.page);
              let fault = null;
              let shot = null;
              let other = null;
              for (let attempt = 0; attempt < 4; attempt++) {
                if (attempt) await new Promise((r) => setTimeout(r, 1000));
                // A page that can be opened again (Home, Settings, Translate) is, once, on both sides: a word placed a fraction of a pixel apart
                // when a page was laid out stays that way for that drawing of it (8 Nov: "Graphite" on Settings' Appearance row, one run in three).
                if (attempt === 3) {
                  if (!AGAIN.has(name)) break;
                  for (const side of [now, before]) {
                    await side.page.reload();
                    await side.page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
                    await side.page.addStyleTag({ content: STILL });
                    if (name !== "home") await go(side.page, "#today");
                    await act(side.page);
                  }
                }
                shot = await steady(now.page);
                other = await steady(before.page);
                // A book's photos by their place and size (photosOf), the rest of the screen pixel for pixel.
                const pictured = PHOTO_SCREENS[name];
                const photos = pictured ? [await photosOf(now.page, pictured.photos), await photosOf(before.page, pictured.photos)] : null;
                // A screen's drawings by their place and size (drawingsOf), their own pixels each within a drawing's allowance, the rest as ever.
                const within = DRAWN_SCREENS[name];
                const drawings = within ? [await drawingsOf(now.page, within), await drawingsOf(before.page, within)] : null;
                fault =
                  photos && (placed(photos[0]) !== placed(photos[1]) || photos[0].some((photo) => !photo.loaded))
                    ? `phone-${width}-${name}: the book's photos aren't as they were (loaded, the file's size, left/top/width/height): ${placed(photos[1])} → ${placed(photos[0])}`
                    : drawings && drawn(drawings[0]) !== drawn(drawings[1])
                      ? `phone-${width}-${name}: the screen's drawings aren't where they were (left/top/width/height of each): ${drawn(drawings[1])} → ${drawn(drawings[0])}`
                      : await samePixels(shot, other, `phone-${width}-${name}`, photos ? photos[0].map((photo) => photo.skip) : [], drawings ? drawings[0].map((drawing) => drawing.box) : []);
                if (!fault) break;
              }
              // A screen's drawings can still fail both ways: one moved one pixel is caught by its place, and its lines moved one pixel inside its
              // box by its pixels (past the allowance it has to itself).
              const within = DRAWN_SCREENS[name];
              if (within && !fault) {
                const here = await drawingsOf(now.page, within);
                const places = here.map((drawing) => drawing.box);
                // (A screen with no drawing 16 px wide has none to move: null, and nothing to prove.)
                const moved = await withDrawing(now.page, within, "moved", async () => drawn(await drawingsOf(now.page, within)) !== drawn(here));
                assert(moved !== false, `phone-${width}-${name}: a drawing moved one pixel, and the drawings' places still read the same: the comparison can't fail`);
                const redrawn = await withDrawing(now.page, within, "lines", async () => (await samePixels(await now.page.screenshot(), other, `phone-${width}-${name}-control-lines`, [], places)) ?? false);
                assert(redrawn !== false, `phone-${width}-${name}: a drawing's lines moved one pixel inside its box, and the screens still compare the same: the comparison can't fail`);
                if (moved && redrawn) drawnControls.push(`${width} ${name}: ${here.length}`);
              }
              // That comparison can still fail: a word of the page moved one pixel is caught with the photos left out, and a photo moved one pixel
              // is caught by its place.
              if (PHOTO_SCREENS[name] && !fault) {
                const pictured = PHOTO_SCREENS[name];
                const skip = (await photosOf(now.page, pictured.photos)).map((photo) => photo.skip);
                const inside = await apartInside(shot, other, skip);
                const word = await now.page.evaluate((selector) => {
                  const shown = [...document.querySelectorAll(selector)].find((node) => {
                    const b = node.getBoundingClientRect();
                    const at = b.width > 4 && b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight ? document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) : null;
                    return Boolean(at) && (node.contains(at) || at.contains(node));
                  });
                  if (!shown) return null;
                  shown.setAttribute("data-desk-check-moved", "");
                  shown.style.position = "relative";
                  shown.style.left = "1px";
                  const word = shown.cloneNode(true);
                  for (const gloss of word.querySelectorAll("rt")) gloss.remove();
                  return word.textContent.trim().slice(0, 20);
                }, pictured.word);
                assert(word, `phone-${width}-${name}: no word of its own on the screen to move for the control`);
                await now.page.waitForTimeout(300);
                const moved = await samePixels(await now.page.screenshot(), other, `phone-${width}-${name}-control-word`, skip);
                await now.page.evaluate(() => {
                  const node = document.querySelector("[data-desk-check-moved]");
                  node.style.removeProperty("position");
                  node.style.removeProperty("left");
                  node.removeAttribute("data-desk-check-moved");
                });
                assert(moved, `phone-${width}-${name}: "${word}" moved one pixel, and the screens still compare the same: the comparison can't fail`);
                if (skip.length) {
                  await now.page.evaluate((selector) => {
                    const img = [...document.querySelectorAll(selector)].find((node) => {
                      const b = node.getBoundingClientRect();
                      const at = b.width && b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight ? document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) : null;
                      return Boolean(at) && (node.closest('[data-part="reader-picture"], [data-part="book-cover"]') ?? node).contains(at);
                    });
                    img.setAttribute("data-desk-check-moved", "");
                    img.style.position = "relative";
                    img.style.left = "1px";
                  }, pictured.photos);
                  const there = placed(await photosOf(now.page, pictured.photos)) !== placed(await photosOf(before.page, pictured.photos));
                  await now.page.evaluate(() => {
                    const node = document.querySelector("[data-desk-check-moved]");
                    node.style.removeProperty("position");
                    node.style.removeProperty("left");
                    node.removeAttribute("data-desk-check-moved");
                  });
                  assert(there, `phone-${width}-${name}: a photo moved one pixel, and its place still reads the same: the comparison can't fail`);
                }
                controls.push(`${width} ${name}: ${skip.length} photo${skip.length === 1 ? "" : "s"} by place and size (${inside} of its own pixels drawn apart this run, left out), "${word}" and a photo each caught one pixel off`);
              }
              writeFileSync(join(OUT, `phone-${width}-${name}.png`), shot);
              if (fault) writeFileSync(join(OUT, `phone-${width}-${name}-before.png`), other);
              if (fault) faults.push(fault);
              else shots.push(`${width} ${name}`);
            }
            assert(!now.errors.length && !before.errors.length, `${width}: page errors: ${[...now.errors, ...before.errors].join(" | ")}`);
          } finally {
            await now.context.close();
            await before.context.close();
          }
        }
        assert(!faults.length, faults.join("\n"));
        assert(shots.length, `no screen compared${SCREENS ? ` (--screens ${SCREENS.source} names none of ${screens.map(([name]) => name).join(", ")})` : ""}`);
        return `the same: ${shots.join(", ")}${SCREENS ? ` (only --screens ${SCREENS.source})` : ""}; a book's photos: ${controls.join("; ") || "no screen with one"}; the games', Study's and the path's drawings by place, a drawing and its lines each caught one pixel off: ${drawnControls.join("; ") || "no screen with them"}${noise.length ? ` (edges drawn apart, let pass: ${noise.join("; ")})` : ""}`;
      }),
  },
];

