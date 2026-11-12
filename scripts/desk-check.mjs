// Tablets and computers: the app at the sizes a phone never has, each part as it lands (docs/design-system.md, "Tablets and computers").
//   - settings: Settings opened from the sidebar (1024 × 768 and 1440 × 900 by mouse, 1180 × 820 an iPad on its side by touch) has no way
//     back, as the sidebar holds every tab and Settings itself; a page inside it keeps its way back to Settings; at 820 × 1180 (no sidebar)
//     the menu keeps its way back to the tab you came from.
//   - translate: Translate at those three sizes keeps the sidebar and the page's own column; its box as tall as its text (two lines at
//     least, about half the screen at most, then scrolling inside); the language bar on the screen, under the answer and clear of it; a tab
//     in the sidebar leaving it.
//   - games: 744, 820 and 1180 by touch, 1024, 1440 and 1920 by mouse, six games: the step and its bar one block in the screen's middle,
//     the game right under its question, Continue right under the game, the step still as the result comes, numbers on the choices with a
//     mouse (never by touch).
//   - hover: Home, Study, Explore and Knowledge at 1280 and 1440 by mouse, a learner weeks in: every link and button on the page, scrolled to,
//     looks different with the mouse on it (itself or anything in it; Tinta left out).
//   - keys: Tab from each tab's start at 1024 and 1440 reaches the sidebar first, then the header, then the page in the order it's seen; at
//     820 (the tabs at the foot) the page first and the tab bar last.
//   - targets: 744, 820 and 1180 by touch (an iPad's agent): every control on the sign-in page, a learner weeks in (Home, Study, Knowledge), every
//     game's question and result, Study cards and a book in the reader reaches 44 × 44 (component-check's measure; running text exempt).
//   - tablet: 744 and 820 portrait by touch, a learner weeks in: Translate with a line typed has a box as tall as its text and its answer
//     above the floating bar; Your words puts a word whose name and meaning fit a cell (18 letters, 44 characters) in one place, three to a
//     shelf; the reader's single page sets its text at most 640 px wide, centered, its picture wider.
//   - measure: 1024, 1280 and 1440 by mouse, a learner weeks in: Study's packs, a pack's page, an Explore item, Everyday's words, Translate's
//     sources, Terms and Privacy, and (at 1280 and 1440, in the wide column) Study, Explore, Knowledge, Your words and the topics have no line
//     of reading text over 72 characters (counted as read: each text node's line boxes over its own font's average character), a page's line
//     under its title starting where its column does.
//   - wide: 1280 and 1440 by mouse, a learner weeks in: the grid pages (Study's, Explore's and Knowledge's own, Your words, the topics) in a
//     960 column, Study's games 4 a row, Explore's topics 6, Your words 4 a shelf; their lists and forms (Study's packs, the path, a topic, a
//     pack's page, Browse, Add your own) and Home in the 720 one; on a grid page no button wider than it is with the column at 720,
//     and every row and list straight in the column reaching its right edge.
//   - split: 1280 and 1440 by mouse: Settings' menu in a 320 px pane beside the page it opened (Settings itself opening Account), that page's
//     row lit, no way back on a first page and its own further in, the pane kept from page to page with its title level with the page's, the
//     page 720 at 1440; leaving for a tab takes the pane away; at 1024 the menu alone.
//   - phones: 390 × 844 and 320 × 568 by touch, Home, Settings, Translate with a sentence typed, two games asked and answered, Your words,
//     Study's packs, Everyday's words and a book in the reader, each the
//     same picture pixel for pixel with this copy's files and with --base's (the app as it was): animations off, the caret and Tinta hidden,
//     the clock and Math.random fixed, on both sides; a pixel counts as changed past raster rounding (8 of 255 in a channel; two runs of the
//     same files differ by 2 at most). A screen that differs is pictured again on both sides up to three times, a second apart (Home,
//     Settings and Translate opened again for the last), and only then judged: KEEP THIS RULE AS IT IS. Never loosen the thresholds, skip
//     a screen or raise the tries to make a run pass; a difference that stays is the code's, so find it.
// --from <copy> serves another copy's /js and /css for everything but the phones' --base side (the app from before fails settings and
// translate). LOCAL only: it signs up accounts with a virtual passkey.
// Usage: node scripts/desk-check.mjs http://localhost:<port> <outDir> --base <copy dir> [--only <regex>] [--from <copy dir>] [--screens <regex>]   (exit 0 = pass)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUT, results, browser } from "./desk/common.mjs";
// Each lane's file, and the frame's: their stages run in their order numbers, after every file has added its screens and pages.
const lanes = await Promise.all(["frame", "study", "know", "read"].map((lane) => import(`./desk/${lane}.mjs`)));
for (const { run } of lanes.flatMap((lane) => lane.stages ?? []).sort((a, b) => a.order - b.order)) await run();

await browser.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((one) => !one.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
