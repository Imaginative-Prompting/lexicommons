// desk-check's stages and phone screens for desk-know's pages (Knowledge, Your words, Explore and its packs): a stage is { order, run },
// a screen list is PHONE_SCREENS.push({ order, screens }); order places it among every lane's (today's are tens apart). Its grid pages
// and list pages are WIDE_GRIDS.push(…) and NARROW.push(…). Only this lane edits this file.

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
    order: 75,
    run: () =>
      stage("explore focus: at 1024 and 1440 by keyboard, Explore's lessons card shows the focus on its own outline, its outline and hard edge in the ring's color with the ring around them, measured on the card's pixels against it unfocused", async () => {
        const seen = [];
        for (const size of WIDE.filter((one) => !one.touch)) {
          const { context, page, errors } = await device(size);
          try {
            await weeksIn(page);
            await go(page, "#explore");
            const card = page.locator(`${EXPLORE_PAGE} .lx-lessons-card`).first();
            await card.waitFor({ timeout: 30_000 });
            await page.waitForTimeout(1200);
            // From the page's start, Tab until the card's link has the focus.
            await page.evaluate(() => document.activeElement?.blur());
            let stops = 0;
            for (; stops < 25; stops++) {
              await page.keyboard.press("Tab");
              if (await page.evaluate(() => Boolean(document.activeElement?.closest(".lx-lessons-card")))) break;
            }
            assert(stops < 25, `${size.name}: Tab never reached the lessons card`);
            await page.waitForTimeout(300);
            const look = () =>
              card.evaluate((node) => {
                const s = getComputedStyle(node);
                const probe = document.createElement("span");
                probe.style.color = "var(--ring)";
                node.append(probe);
                const ring = getComputedStyle(probe).color;
                probe.remove();
                return { ring, border: s.borderTopColor, shadow: s.boxShadow, outline: `${s.outlineStyle} ${s.outlineColor}` };
              });
            const on = await look();
            const focused = await card.screenshot();
            await page.evaluate(() => document.activeElement?.blur());
            await page.waitForTimeout(300);
            const off = await look();
            const blurred = await card.screenshot();
            const [a, b] = await Promise.all([sharp(focused).raw().toBuffer({ resolveWithObject: true }), sharp(blurred).raw().toBuffer({ resolveWithObject: true })]);
            let changed = 0;
            if (a.info.width === b.info.width && a.info.height === b.info.height)
              for (let i = 0; i < a.data.length; i += a.info.channels) if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 24) changed++;
            // The card's own outline is 2 px round it (at 2× the screenshot's 4 px): most of its perimeter's pixels must change.
            const perimeter = 2 * (a.info.width + a.info.height) * 4;
            assert(on.outline.startsWith("solid") && on.border === on.ring && on.shadow.includes(on.ring), `${size.name}: the focused card's outline ${on.border}, edge ${on.shadow}, ring ${on.outline} (the ring's color ${on.ring})`);
            assert(off.border !== off.ring, `${size.name}: the unfocused card wears the ring's color (${off.border})`);
            assert(changed > perimeter * 0.6, `${size.name}: focused and unfocused, ${changed} of the card's pixels differ (its outline alone is about ${perimeter})`);
            assert(!errors.length, `${size.name}: page errors: ${errors.join(" | ")}`);
            seen.push(`${size.name} after ${stops + 1} Tabs, ${changed} px`);
          } finally {
            await context.close();
          }
        }
        return seen.join("; ");
      }),
  },
];

// The pile's tiles hidden (every visit lays the pile out anew); the rest of the tab as drawn, the idea cards included (common.mjs NO_PILE hid
// them too while their pictures were sized by a race: fixed in v683, and they read the notes before they're drawn since v694).
const PILE_TILES = ".lx-pile-canvas { visibility: hidden !important; }";
const KNOW_SCREENS = [
  // (Drawn: every card placed, or, for a learner with nothing yet, as with --screens leaving the games out, the page's way to start.)
  ["know", async (page) => (await page.addStyleTag({ content: PILE_TILES }), await go(page, "#know"), await page.waitForSelector(`${KNOW_BOARD}[data-drawn], [data-part="page"]:not([data-ghost]) .lx-know-top [data-part="empty-state"]`, { timeout: 30_000 }), await page.waitForTimeout(1500))],
  ["know-week", (page) => toKnowCard(page, "week")],
  ["know-ideas", (page) => toKnowCard(page, "ideas")],
  ["ideas", async (page) => (await go(page, "#know/ideas"), await page.waitForTimeout(1500))],
  // Explore on a phone, where a computer lays each of these out its own way: its home (the lessons' card, the topics, the rows at its foot),
  // every topic, a pack's page (its head, and its way forward pinned low) and Add your own.
  ["explore", async (page) => (await go(page, "#explore"), await page.waitForSelector(`${EXPLORE_PAGE} .lx-topics .lx-topic`, { timeout: 30_000 }), await page.waitForTimeout(2500))],
  ["explore-topics", async (page) => (await go(page, "#explore/topics"), await page.waitForSelector(`${EXPLORE_PAGE} .lx-topics .lx-topic`, { timeout: 30_000 }), await page.waitForTimeout(2500))],
  ["explore-pack", async (page) => (await go(page, "#explore/item/path-nl"), await page.waitForSelector(`${EXPLORE_PAGE} .lx-explore-item .lx-pack-head:not([aria-busy])`, { timeout: 30_000 }), await page.waitForTimeout(2500))],
  ["explore-own", async (page) => (await go(page, "#explore/own"), await page.waitForTimeout(1500))],
];

PHONE_SCREENS.push({
  order: 50,
  screens: [
      ["words", async (page) => (await endSession(page), await go(page, "#know/words"), await page.waitForTimeout(1500))],
    ],
});
PHONE_SCREENS.push({
  order: 55,
  screens: KNOW_SCREENS,
});
PHONE_SCREENS.push({
  order: 90,
  screens: [
      ["everyday", async (page) => (await go(page, "#know/everyday/words"), await page.waitForTimeout(1500))],
    ],
});
WIDE_GRIDS.push(["#explore", "Explore"], ["#know", "Knowledge"], ["#know/words", "Your words"], ["#know/ideas", "the Ideas page"], ["#explore/topics", "the topics"]);
NARROW.push(["#explore/topic/everyday", "a topic"], ["#explore/item/path-nl", "a pack's page"], ["#explore/browse", "Browse"], ["#explore/own", "Add your own"]);
