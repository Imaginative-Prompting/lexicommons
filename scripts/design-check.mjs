// Checks the design system end to end on the real /design page in headless Chrome: the theming-surface check, every
// built-in theme and preset, custom CSS (that it wins over the app's CSS, and that outside links and @import are
// stripped and never requested), the token editor, image slots, export → reset → import round trip, no theme flash
// on reload, the game interactions, Tinta (the character), and the phone layout. Fails on any console error or CSP
// violation.
//
// Usage (headless Chrome, so through the channel's GPU queue, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "design check" --kind stills -- \
//     node 08-lexicommons/app/scripts/design-check.mjs <baseUrl> <outDir>
// baseUrl: https://lexicommons.com (passes the site gate with the Keychain password) or a local `wrangler dev`.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { chromium } from "./quiet-browser.mjs";

const [BASE = "https://lexicommons.com", OUT = "design-check-out"] = process.argv.slice(2);
mkdirSync(join(OUT, "sections"), { recursive: true });

const results = [];
const problems = [];
const outside = []; // requests to anywhere but the site itself
async function stage(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - started, detail });
    console.log(`ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  } catch (error) {
    results.push({ stage: name, ok: false, ms: Date.now() - started, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// A small solid PNG, made here so the check needs no fixture files.
function png(width, height, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3).map((_, i) => [r, g, b][i % 3])]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const origin = new URL(BASE).origin;
page.on("console", (message) => {
  if (message.type() === "error") problems.push(`console: ${message.text()}`);
});
page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
page.on("request", (request) => {
  const url = request.url();
  if (!url.startsWith(origin) && !url.startsWith("data:") && !url.startsWith("blob:")) outside.push(url);
});

const css = (name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const panel = (text) => page.locator("#appearance").getByRole("button", { name: text, exact: true });
// Theme buttons carry a description too ("Graphite or Paper, following…"), so match the name itself.
const themeButton = (name) =>
  page.locator("#appearance .ds-themes button").filter({ has: page.locator("strong", { hasText: new RegExp(`^${name}$`) }) });
/** Switches to a built-in theme from the panel, and waits until it's applied (switching stores a recent look first). */
const useBuiltIn = async (name, id) => {
  await themeButton(name).click();
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t && !window.lxDesign.theme.getSettings().look.theme, id, { timeout: 5000 });
};
const open = async () => {
  await page.goto(`${BASE}/design/`);
  if (page.url().includes("/_gate")) {
    const password = execFileSync("security", ["find-internet-password", "-s", "lexicommons.com", "-a", "site-gate", "-w"], { encoding: "utf8" }).trim();
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/design\/$/, { timeout: 15_000 });
  }
  await page.waitForSelector("html[data-surface-check]", { timeout: 15_000 });
};

await stage("page loads and passes its theming-surface check", async () => {
  await open();
  const check = await page.evaluate(() => window.lxDesign.check);
  assert(check.ok, `notShown: ${check.notShown.join(", ")}; notListed: ${check.notListed.join(", ")}; listed twice: ${(check.twice ?? []).join(", ")}`);
  await page.screenshot({ path: join(OUT, "01-graphite-desktop.png"), fullPage: true });
  return `${check.listed} parts listed, ${check.shown} shown`;
});

await stage("every built-in theme applies", async () => {
  const seen = {};
  for (const [name, id] of [["Paper", "paper"], ["High contrast", "contrast"], ["Sepia", "sepia"], ["Match device", "auto"], ["Graphite", "graphite"]]) {
    await useBuiltIn(name, id);
    assert((await page.getAttribute("html", "data-theme")) === id, `data-theme should be ${id}`);
    seen[id] = [await css("--canvas"), await css("--well"), await css("--ink-1"), await css("--m-right")].join(" ");
    await page.locator("#meaning").screenshot({ path: join(OUT, `02-theme-${id}.png`) });
  }
  // Match device follows the (light, headless) device setting, so it equals Paper; the other four all differ.
  assert(new Set(Object.values(seen)).size === 4 && seen.auto === seen.paper, `themes should differ: ${JSON.stringify(seen)}`);
  return seen;
});

await stage("layout presets (text size, flat cards, reader pages) and a card's order switch", async () => {
  await panel("XL").click();
  assert((await css("--size-target")) === "36px", "text XL should make --size-target 36px");
  const card = page.locator('#study-card [data-part="study-card"]').first();
  const line = card.locator('[data-part="literal-line"]');
  const dutch = await line.locator('[data-part="literal-chunk"]').allTextContents();
  // The toggle flips with a press anywhere on it; the same spot flips it back.
  const toggle = card.locator('[data-part="order-toggle"]');
  await toggle.click({ position: { x: 10, y: 10 } });
  const english = await line.locator('[data-part="literal-chunk"]').allTextContents();
  const order = await line.getAttribute("data-order");
  await toggle.click({ position: { x: 10, y: 10 } });
  const back = await line.locator('[data-part="literal-chunk"]').allTextContents();
  assert(order === "english" && english.join() === "I have,read,a book,yesterday" && back.join() === dutch.join(), `order switch: ${dutch} / ${english} / ${back}`);
  await panel("Flat").click();
  const bg = await card.evaluate((node) => getComputedStyle(node).backgroundColor);
  assert(bg === "rgba(0, 0, 0, 0)", `flat cards should be transparent, got ${bg}`);
  // The reader lays out its own pages (js/read/reader.js): the preset only tells it which way texts open. Pages is
  // the default.
  const before = await page.evaluate(() => document.documentElement.getAttribute("data-reader"));
  await panel("Scroll").click();
  const reader = await page.evaluate(() => document.documentElement.getAttribute("data-reader"));
  assert(before === "pages" && reader === "scroll", `the Reader preset should start at pages and reach the reader as data-reader, got ${before} then ${reader}`);
  await page.locator("#study-card").screenshot({ path: join(OUT, "03-presets-xl-flat.png") });
  for (const name of ["M", "Filled", "Pages"]) await panel(name).click();
  return `presets applied and reset; order switch: ${english.join(" ")} ⇄ ${back.join(" ")}`;
});

await stage("custom CSS wins over the app's CSS, and outside links are stripped and never requested", async () => {
  const evil = [
    ":root { --m-right: rgb(255, 0, 255); }",
    '[data-part="study-card"] { border-radius: 3px; }',
    "@import url(https://evil.example/a.css);",
    "body { background-image: url(https://evil.example/t.png); }",
    '[data-part="card"] { background-image: u\\72l("https://evil.example/escaped.png"); }',
    '[data-part="sheet"] { background-image: image-set("https://evil.example/set.png" 1x); }',
    '[data-part="tile"] { background-image: url("data:image/png;base64,iVBORw0KGgo="); }',
  ].join("\n");
  await page.fill(".ds-css", evil);
  await panel("Apply").click();
  await page.waitForTimeout(300);
  assert((await css("--m-right")) === "rgb(255, 0, 255)", `--m-right should be magenta, got ${await css("--m-right")}`);
  const radius = await page.locator('[data-part="study-card"]').first().evaluate((node) => getComputedStyle(node).borderTopLeftRadius);
  assert(radius === "3px", `a plain selector should beat the components layer, got ${radius}`);
  const saved = await page.inputValue(".ds-css");
  assert(!saved.includes("evil.example"), `outside links should be gone: ${saved}`);
  assert(saved.includes("data:image/png"), "data: images should stay");
  const status = await page.locator(".ds-status").textContent();
  assert(/@import/.test(status) && /outside links/.test(status), `the status should list what was removed: ${status}`);
  assert(!outside.some((url) => url.includes("evil.example")), `requested: ${outside.join(", ")}`);
  return status.trim();
});

await stage("token editor: a meaning color also tints its background", async () => {
  const input = page.getByLabel("Wrong (--m-wrong)", { exact: true });
  await input.fill("#00a0a0");
  await input.press("Enter");
  await page.waitForTimeout(200);
  const settings = await page.evaluate(() => window.lxDesign.theme.getSettings().look.tokens);
  assert(settings["--m-wrong"] === "#00a0a0" && settings["--m-wrong-bg"]?.includes("color-mix"), JSON.stringify(settings));
  const bg = await page.locator('#feedback [data-part="feedback"][data-meaning="wrong"]').evaluate((node) => getComputedStyle(node).backgroundColor);
  return `wrong background is now ${bg}`;
});

await stage("an image saved on the device fills --image-background", async () => {
  const file = join(mkdtempSync(join(tmpdir(), "lx-design-")), "bg.png");
  writeFileSync(file, png(64, 64, [40, 70, 110]));
  await page.locator("#appearance .ds-image-row").first().locator('input[type="file"]').setInputFiles(file);
  // The token, not body's background: the custom CSS from the stage above sets body's background-image itself (and
  // a person's CSS rightly wins over the app's).
  const imageToken = () => getComputedStyle(document.documentElement).getPropertyValue("--image-background").startsWith('url("blob:');
  await page.waitForFunction(imageToken, null, { timeout: 5000 });
  const thumb = await page.locator("#appearance .ds-image-row").first().locator("img.ds-thumb").evaluate((img) => img.complete && img.naturalWidth);
  assert(thumb === 64, `the thumbnail should load the 64px image, got ${thumb}`);
  return `--image-background is a blob: URL; thumbnail ${thumb}px`;
});

let exported = null;
await stage("export the look as a theme file", async () => {
  await page.fill("#appearance input[aria-label='Theme name']", "Design check");
  await page.press("#appearance input[aria-label='Theme name']", "Tab");
  const [download] = await Promise.all([page.waitForEvent("download"), panel("Export").click()]);
  exported = join(OUT, download.suggestedFilename());
  await download.saveAs(exported);
  const file = JSON.parse(readFileSync(exported, "utf8"));
  assert(file.format === "lexicommons-theme" && file.version === 1, "format and version");
  assert(file.images.background?.startsWith("data:image/png;base64,"), "the image should be embedded");
  assert(file.tokens["--m-wrong"] === "#00a0a0", "tokens should be in the file");
  assert(!JSON.stringify(file).includes("evil.example"), "no outside links in the file");
  assert(!("presets" in file), "presets should never be in a theme file");
  return `${download.suggestedFilename()}, ${readFileSync(exported).length} bytes`;
});

await stage("reset clears the look", async () => {
  await panel("Reset look").click();
  await page.locator("#appearance").getByRole("button", { name: "Tap again to reset" }).click();
  await page.waitForTimeout(300);
  const look = await page.evaluate(() => window.lxDesign.theme.getSettings().look);
  assert(!look.css && !Object.keys(look.tokens).length && !Object.keys(look.images).length, JSON.stringify(look));
  assert((await css("--m-right")) === "#5ab0f0", `right should be back to the theme's blue, got ${await css("--m-right")}`);
  assert((await page.evaluate(() => getComputedStyle(document.body).backgroundImage)) === "none", "background image should be gone");
  return "tokens, CSS and images cleared";
});

await stage("import the exported file brings the whole look back", async () => {
  await page.locator('#appearance input[type="file"][accept*="json"]').setInputFiles(exported);
  await page.locator("#appearance").getByRole("button", { name: "Add and use it" }).click();
  await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--image-background").startsWith('url("blob:'), null, { timeout: 5000 });
  assert((await css("--m-right")) === "rgb(255, 0, 255)", "custom CSS should be back");
  assert((await css("--m-wrong")) === "#00a0a0", "tokens should be back");
  return "CSS, tokens and image restored";
});

await stage("a reload paints the saved look before the page's modules run (no flash)", async () => {
  // The imported theme, starting from Paper now.
  await page.locator("#appearance [aria-label='Starts from']").getByRole("button", { name: "Paper", exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === "paper", null, { timeout: 5000 });
  // Hold the page's module back, so only theme-boot.js can have applied anything when we look.
  await page.route("**/js/design.js*", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await route.continue().catch(() => {});
  });
  await page.reload({ waitUntil: "commit" });
  await page.waitForSelector("body");
  const early = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    right: getComputedStyle(document.documentElement).getPropertyValue("--m-right").trim(),
    moduleRan: Boolean(window.lxDesign),
  }));
  await page.waitForSelector("html[data-surface-check]", { timeout: 15_000 });
  await page.unroute("**/js/design.js*");
  assert(!early.moduleRan, "the module should still be held back");
  assert(early.theme === "paper", `boot should set the theme, got ${early.theme}`);
  assert(early.right === "rgb(255, 0, 255)", `boot should apply custom CSS, got ${early.right}`);
  await page.waitForSelector("html[data-surface-check]", { timeout: 15_000 });
  await page.screenshot({ path: join(OUT, "04-imported-look-on-paper.png"), fullPage: false });
  return early;
});

await stage("games and cards respond", async () => {
  await panel("Reset look").click();
  await page.locator("#appearance").getByRole("button", { name: "Tap again to reset" }).click();
  await useBuiltIn("Graphite", "graphite");
  const word = page.locator('#study-card [data-part="target-word"]', { hasText: "boek" }).first();
  await word.click();
  assert((await word.getAttribute("data-state")) === "missed", "tapping a word should mark it missed");
  await page.locator('#games [data-part="choice-list"] [data-part="choice"]').nth(0).click();
  const choiceStates = await page.locator('#games [data-part="choice-list"] [data-part="choice"]').evaluateAll((nodes) => nodes.map((n) => n.dataset.state));
  assert(choiceStates.join() === "wrong,right,dimmed", choiceStates.join());
  for (const tile of ["Ik", "weet", "dat", "hij", "komt", "morgen"]) {
    await page.locator('#games [data-part="arrange-bank"] [data-part="tile"]', { hasText: new RegExp(`^${tile}$`) }).click();
  }
  await page.locator("#games").getByRole("button", { name: "Check" }).first().click();
  const tiles = await page.locator('#games [data-part="arrange-answer"] [data-part="tile"]').evaluateAll((nodes) => nodes.map((n) => n.dataset.state));
  assert(tiles.join() === "right,right,right,right,wrong,wrong", tiles.join());
  // The one-word Type it demo (the last type-answer on the page; the whole-sentence demo comes first).
  const typed = page.locator('#games [data-part="type-answer"]').last();
  await typed.locator("input").fill("hoe gaat het met je?");
  await typed.locator("input").press("Enter");
  assert((await typed.getAttribute("data-state")) === "right", "typed answer should be right");
  await page.locator('#games [data-part="match-item"]', { hasText: /^oma$/ }).click();
  await page.locator('#games [data-part="match-item"]', { hasText: /^grandma$/ }).click();
  assert((await page.locator('#games [data-part="match-item"]', { hasText: /^oma$/ }).getAttribute("data-state")) === "matched", "match should pair");
  await page.locator('#reader [data-part="reader-text"] [data-part="woven-word"]', { hasText: "het raam" }).click();
  assert((await page.locator('#reader [data-part="word-popover"] strong').textContent()) === "het raam", "tapping a woven word should show it");
  // The reader's frames: the phone-sized ones show one page, the wide one two side by side; one is pinched in, 2×.
  const frames = await page.evaluate(() =>
    [...document.querySelectorAll('#reader .ds-reader-frame > [data-part="reader"][data-mode="pages"]')].map((r) => [r.getAttribute("data-variant"), r.lxReader.pages, r.lxReader.zoom.s]),
  );
  const spreads = frames.filter(([variant]) => variant === "spread");
  const zoomed = frames.filter(([, , s]) => s > 1);
  assert(frames.length >= 2 && spreads.length === 1 && frames.every(([variant, n]) => (variant === null || variant === "spread") && n > 1), `pages and a spread: ${JSON.stringify(frames)}`);
  assert(zoomed.length === 1 && Math.abs(zoomed[0][2] - 2) < 0.01 && zoomed[0][0] === null, `the pinched frame, 2×: ${JSON.stringify(frames)}`);
  // The sheet: its handle drags it closed, slowly past a quarter (it slides the rest of the way), and it opens again.
  const sheetFrame = page.locator(".ds-sheet-frame");
  await sheetFrame.scrollIntoViewIfNeeded();
  const demoSheet = sheetFrame.locator('[data-part="sheet"]');
  const sheetHeight = await demoSheet.evaluate((node) => node.offsetHeight);
  const grip = await sheetFrame.locator('[data-part="sheet-handle"]').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) {
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + (sheetHeight * 0.5 * k) / 8);
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
  const closed = await demoSheet.waitFor({ state: "hidden", timeout: 3000 }).then(() => true, () => false);
  await sheetFrame.getByRole("button", { name: "Open the sheet" }).click();
  assert(closed && (await demoSheet.isVisible()), `the sheet's handle drags it closed (${closed}) and it opens again`);
  await page.locator("#games").screenshot({ path: join(OUT, "05-games-after-play.png") });
  await page.locator("#reader .ds-reader-frame-wide").screenshot({ path: join(OUT, "05b-reader-spread.png") });
  return `card word, choice, arrange, type, match, reader lookup; reader frames ${frames.map(([v, n]) => `${v ?? "page"} ×${n}`).join(", ")}`;
});

await stage("press where it's going: a 3-second flight never blocks the press", async () => {
  const tile = page.locator('#motion .ds-slot [data-part="tile"]');
  await tile.scrollIntoViewIfNeeded();
  await tile.click();
  // The real tile is already at its destination (unseen while its drawing travels); press it there at once.
  const box = await tile.boundingBox();
  const ghosts = await page.evaluate(() => document.querySelectorAll("[data-motion-layer] > *").length);
  const started = Date.now();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const text = await page.locator("#motion").getByText(/Pressed \d+ times?/).textContent();
  const ms = Date.now() - started;
  assert(ghosts === 1, `the flight should be drawn by one ghost, saw ${ghosts}`);
  assert(text === "Pressed 2 times" && ms < 1000, `got "${text}" after ${ms} ms`);
  // Control, so this check can fail: the naive way (moving the real tile with a transform) must miss the same press.
  const control = await page.evaluate(() => {
    const tile = document.querySelector('#motion .ds-slot [data-part="tile"]');
    const slots = [...document.querySelectorAll("#motion .ds-slot")];
    const from = tile.getBoundingClientRect();
    (tile.parentElement === slots[0] ? slots[1] : slots[0]).append(tile);
    const to = tile.getBoundingClientRect();
    const naive = tile.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: "none" }], { duration: 3000 });
    const hit = document.elementFromPoint(to.left + to.width / 2, to.top + to.height / 2);
    naive.cancel();
    return hit === tile || tile.contains(hit);
  });
  assert(!control, "control: a transform on the real tile should miss the press, or this check proves nothing");
  return `second press landed ${ms} ms into a 3000 ms flight; the naive transform version misses it (control)`;
});

await stage("press during an animation that draws its own frames: it's finished at once, as a ghost is", async () => {
  // A 3-second animation driven by requestAnimationFrame (as the character and the splash are), registered with
  // motion.js; a press 3 ms in must jump it to its end state and stop its frames.
  const started = await page.evaluate(() => import("/js/lx/motion.js").then((motion) => {
    if (typeof motion.registerTicker !== "function") return { missing: true };
    const node = document.createElement("div");
    node.setAttribute("data-check-ticker", "");
    const pad = Object.assign(document.createElement("div"), { className: "check-press-pad" });
    Object.assign(pad.style, { position: "fixed", right: "0", bottom: "0", width: "40px", height: "40px", zIndex: "2147483647" }); // CSSOM, not a style attribute (CSP)
    document.body.append(node, pad);
    let frames = 0, raf = 0;
    const t0 = performance.now();
    const draw = (now) => {
      frames++;
      const u = Math.min(1, (now - t0) / 3000);
      node.dataset.progress = String(u);
      if (u < 1) raf = requestAnimationFrame(draw);
      else ticker?.end();
    };
    const ticker = motion.registerTicker(() => {
      cancelAnimationFrame(raf);
      node.dataset.progress = "1";
    });
    raf = requestAnimationFrame(draw);
    window.lxCheckTicker = { frames: () => frames, before: motion.runningCount(), t0 };
    return { registered: ticker !== null, running: motion.runningCount() };
  }));
  assert(!started.missing, "motion.js has no registerTicker: nothing lets a press finish an animation that draws its own frames");
  assert(started.registered && started.running >= 1, `the animation should be registered and running: ${JSON.stringify(started)}`);
  await page.waitForTimeout(3);
  const pressedMs = await page.evaluate(() => performance.now() - window.lxCheckTicker.t0);
  await page.mouse.click(1440 - 20, 1000 - 20);
  const after = await page.evaluate(async () => {
    const motion = await import("/js/lx/motion.js");
    const node = document.querySelector("[data-check-ticker]");
    const progress = node.dataset.progress, frames = window.lxCheckTicker.frames(), running = motion.runningCount();
    await new Promise((r) => setTimeout(r, 150));
    return { progress, running, before: window.lxCheckTicker.before, framesAfter: window.lxCheckTicker.frames() - frames };
  });
  assert(pressedMs < 1500, `the press should come early in the animation (it came ${pressedMs.toFixed(0)} ms in)`);
  assert(after.progress === "1", `the press should finish it (its end state), it was at ${after.progress}`);
  assert(after.running === 0, `a press finishes everything running, this one included: ${after.before} running before, ${after.running} after`);
  assert(after.framesAfter === 0, `its frames should stop, ${after.framesAfter} more were drawn`);
  // Animations Off: nothing plays. registerTicker finishes it at once and hands back nothing to run.
  const off = await page.evaluate(() => import("/js/lx/motion.js").then((motion) => {
    const root = document.documentElement, was = root.getAttribute("data-motion");
    root.setAttribute("data-motion", "off");
    let finished = false;
    const ticker = motion.registerTicker(() => { finished = true; });
    if (was === null) root.removeAttribute("data-motion"); else root.setAttribute("data-motion", was);
    document.querySelector("[data-check-ticker]")?.remove();
    document.querySelector(".check-press-pad")?.remove();
    return { ticker, finished };
  }));
  assert(off.ticker === null && off.finished, `with Animations Off it should finish at once and not run: ${JSON.stringify(off)}`);
  return `pressed ${pressedMs.toFixed(0)} ms into 3000: finished, out of the running set, no frames after; Animations Off: finished at once, not run`;
});

await stage("Tinta: every state draws, a press finishes a reaction, stills hold, it takes no presses", async () => {
  const section = page.locator("#character");
  await section.scrollIntoViewIfNeeded();
  // Every Tinta on the page draws (each one draws once as it's connected, on screen or not).
  const drawn = await page.evaluate(async () => {
    const all = () => [...document.querySelectorAll('[data-part="character"]')];
    const until = performance.now() + 8000;
    while (performance.now() < until && !(all().length && all().every((n) => n.querySelector("svg path")))) await new Promise((r) => setTimeout(r, 50));
    return { count: all().length, empty: all().filter((n) => !n.querySelector("svg path")).length };
  });
  assert(drawn.count >= 12 && drawn.empty === 0, `every Tinta should draw (12 in its section): ${JSON.stringify(drawn)}`);
  // One off screen redraws for a new theme when it's next seen (earlier stages change themes): let that happen first.
  await page.waitForTimeout(300);
  // The idle one is alive (its drawing changes, or, on the compositor, its breath plays as a transform: character.js startMotion); the
  // stills hold.
  const moving = await page.evaluate(async () => {
    const idle = document.querySelector('#character [data-part="character"]:not([data-still])');
    const stills = [...document.querySelectorAll('#character [data-part="character"][data-still]')];
    const a = idle.querySelector("svg").innerHTML, s0 = stills.map((n) => n.querySelector("svg").innerHTML);
    await new Promise((r) => setTimeout(r, 400));
    const changed = stills.map((n, i) => [n, i]).filter(([n, i]) => n.querySelector("svg").innerHTML !== s0[i])
      .map(([n, i]) => `${n.getAttribute("data-state")}${n.querySelector("svg").innerHTML.replace(/b\d+/g, "") === s0[i].replace(/b\d+/g, "") ? " (ids only)" : ""}`);
    const breathing = idle.querySelector("svg").getAnimations().some((x) => x.playState === "running");
    return { idleMoved: idle.querySelector("svg").innerHTML !== a || breathing, stillsHeld: changed.length === 0, stills: stills.length, changed };
  });
  assert(moving.idleMoved, "the idle Tinta should be moving");
  // A still for every state the rig has (its own five and the ones drafted on it), each holding.
  const stateCount = await page.evaluate(async () => {
    const { tinta } = await import("/js/character/rig/inkdrop/tinta.js");
    const rig = tinta({ size: 72 });
    return Object.keys(rig).filter((k) => typeof rig[k]?.frame === "function" && (rig[k].loop === true || Number.isFinite(rig[k].dur))).length;
  });
  assert(stateCount >= 5 && moving.stills === stateCount && moving.stillsHeld, `a still for each of its ${stateCount} states, holding: ${JSON.stringify(moving)}`);
  // Through Right's hop its puddle stays on the ground, only its body jumps: drawn every
  // frame, at one height.
  const stage = section.locator('.ds-character-stage [data-part="character"]');
  await section.getByRole("button", { name: "Right", exact: true }).click();
  const puddle = await page.evaluate(async () => {
    const svg = document.querySelector('.ds-character-stage [data-part="character"] svg');
    const seen = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 1300) {
      // The puddle is its widest ellipse (the splat's droplets, drawn before it once it lands, are small ones).
      const e = [...svg.querySelectorAll("ellipse")].sort((a, b) => Number(b.getAttribute("rx")) - Number(a.getAttribute("rx")))[0];
      seen.push(e && Number(e.getAttribute("rx")) > 10 ? Number(e.getAttribute("cy")) : null);
      await new Promise((r) => requestAnimationFrame(r));
    }
    return seen;
  });
  const heights = puddle.filter((v) => v !== null);
  assert(puddle.length > 20 && heights.length === puddle.length && Math.max(...heights) - Math.min(...heights) < 0.05,
    `through its hop its puddle should stay on the ground, drawn every frame: ${puddle.length} frames, ${puddle.length - heights.length} without it, heights ${Math.min(...heights)}…${Math.max(...heights)}`);
  // A reaction plays once; a press finishes it at once, and nothing is left running.
  await section.getByRole("button", { name: "Right", exact: true }).click();
  const during = await stage.getAttribute("data-state");
  await page.evaluate(() => {
    const pad = Object.assign(document.createElement("div"), { className: "check-press-pad" });
    Object.assign(pad.style, { position: "fixed", right: "0", bottom: "0", width: "40px", height: "40px", zIndex: "2147483647" });
    document.body.append(pad);
  });
  await page.waitForTimeout(120);
  await page.mouse.click(1440 - 20, 1000 - 20);
  const after = await page.evaluate(async () => {
    const motion = await import("/js/lx/motion.js");
    document.querySelector(".check-press-pad")?.remove();
    return { state: document.querySelector('.ds-character-stage [data-part="character"]').getAttribute("data-state"), running: motion.runningCount() };
  });
  assert(during === "right", `pressing Right should start its reaction (data-state was ${during})`);
  assert(after.state === "idle" && after.running === 0, `a press should finish it: ${JSON.stringify(after)}`);
  // It takes no presses: what's under its middle is never Tinta.
  const box = await stage.boundingBox();
  const hit = await page.evaluate(([x, y]) => { const n = document.elementFromPoint(x, y); return n?.closest('[data-part="character"]') ? "Tinta" : n?.tagName; }, [box.x + box.width / 2, box.y + box.height / 2]);
  assert(hit !== "Tinta", "a press on Tinta should go to what's under it");
  // Its ink follows the theme: the light one on paper.
  await useBuiltIn("Paper", "paper");
  const paper = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 300));
    return document.querySelector('#character [data-part="character"]:not([data-still]) svg').innerHTML.includes("#9370F0");
  });
  await useBuiltIn("Graphite", "graphite");
  assert(paper, "on paper Tinta should draw in the light ink (#9370F0)");
  // Animations off: every Tinta holds still, and a reaction shows its still at once.
  const off = await page.evaluate(async () => {
    const motion = await import("/js/lx/motion.js");
    const root = document.documentElement, was = root.getAttribute("data-motion");
    root.setAttribute("data-motion", "off");
    await new Promise((r) => setTimeout(r, 200));
    const all = [...document.querySelectorAll('#character [data-part="character"]')];
    const s0 = all.map((n) => n.querySelector("svg").innerHTML);
    const stage = document.querySelector('.ds-character-stage [data-part="character"]');
    stage.play("heart");
    const state = stage.getAttribute("data-state"), running = motion.runningCount();
    await new Promise((r) => setTimeout(r, 400));
    const held = all.filter((n) => n !== stage).every((n, i) => n.querySelector("svg").innerHTML === s0[all.indexOf(n)]);
    const stageHeld = stage.querySelector("svg").innerHTML;
    await new Promise((r) => setTimeout(r, 300));
    const stageStill = stage.querySelector("svg").innerHTML === stageHeld;
    if (was === null) root.removeAttribute("data-motion"); else root.setAttribute("data-motion", was);
    stage.state = "idle";
    return { held, state, running, stageStill };
  });
  assert(off.held && off.stageStill, `with animations off nothing should move: ${JSON.stringify(off)}`);
  assert(off.state === "heart" && off.running === 0, `with animations off a reaction is its still, nothing running: ${JSON.stringify(off)}`);
  // What a frame costs here (the 72 px one at 30 frames a second).
  const cost = await page.evaluate(async () => {
    // On screen (one off screen draws nothing), its frames counted from here.
    const n = [...document.querySelectorAll('#character [data-part="character"]')].find((x) => x.getAttribute("data-size") === "72" && !x.hasAttribute("data-still"));
    n.scrollIntoView({ block: "center" });
    await new Promise((r) => setTimeout(r, 200));
    n.stats = { frames: 0, ms: 0 };
    await new Promise((r) => setTimeout(r, 1500));
    // A held state on the compositor (character.js startMotion) breathes as a transform and draws only for its beats.
    const breathing = n.hasAttribute("data-breathing") && n.querySelector("svg").getAnimations().some((a) => a.playState === "running");
    return { frames: n.stats.frames, ms: n.stats.ms / Math.max(1, n.stats.frames), breathing, state: n.getAttribute("data-state") };
  });
  assert(cost.frames > 10 || cost.breathing, `the 72 px Tinta should keep moving (drawing every frame, or breathing on the compositor): ${JSON.stringify(cost)}`);
  return `${drawn.count} drawn; idle moving, stills holding; its puddle on the ground through Right's hop (${puddle.length} frames); a press 120 ms into Right put it back to idle, nothing running; presses pass through; light ink on paper; animations off holds all; a 72 px Tinta ${cost.breathing ? `(${cost.state}) breathing on the compositor, ${cost.frames} frames drawn in 1.5 s` : `frame ${cost.ms.toFixed(2)} ms (${cost.frames} frames)`}`;
});

await stage("Tinta's eyes follow what you touch (watch), then go back to its own", async () => {
  const watcher = page.locator(".ds-character-watcher");
  await watcher.scrollIntoViewIfNeeded();
  const tiles = page.locator(".ds-character-tiles [data-part='tile']");
  // Where its eyes are after `ms` (the rig's gaze: look [x, y] in -1..1 with y up, and its weight over its own glances).
  const lookAfter = (ms) =>
    page.evaluate(async (ms) => {
      const node = document.querySelector(".ds-character-watcher");
      const t0 = performance.now();
      while (performance.now() - t0 < ms) await new Promise((r) => requestAnimationFrame(r));
      return node.looking ? { look: [...node.looking.look], weight: node.looking.weight } : null;
    }, ms);
  const before = await lookAfter(100);
  await tiles.nth(0).click();
  const top = await lookAfter(400);
  await tiles.nth(2).click();
  const bottom = await lookAfter(400);
  // A drag: the finger goes down on the middle tile and moves far to the left; its eyes follow the finger.
  const box = await tiles.nth(1).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 320, box.y + box.height / 2, { steps: 8 });
  const dragged = await lookAfter(300);
  await page.mouse.up();
  // 2.5 s after the finger's last move, then its own glances take the eyes back over about a second.
  const after = await lookAfter(4000);
  const f = (g) => (g ? `[${g.look.map((v) => v.toFixed(2)).join(", ")}] ×${g.weight.toFixed(2)}` : "its own");
  assert(before === null, `before any touch its eyes should be its own: ${f(before)}`);
  assert(top?.weight > 0.8 && bottom?.weight > 0.8, `a press should take its eyes: ${f(top)}, ${f(bottom)}`);
  assert(top.look[0] > 0.2 && bottom.look[0] > 0.2, `the tiles are to its right: ${f(top)}, ${f(bottom)}`);
  assert(top.look[1] > bottom.look[1] + 0.2, `the top tile then the bottom one: its eyes up, then down: ${f(top)}, ${f(bottom)}`);
  assert(dragged?.look[0] < -0.3, `dragging far left, its eyes should follow the finger: ${f(dragged)}`);
  assert(after === null, `2.5 s after the last touch its eyes should be its own again: ${f(after)}`);
  return `top tile ${f(top)}, bottom ${f(bottom)}, the finger dragged left ${f(dragged)}, then its own again`;
});

await stage("Tinta's hooks: perform() plays an act on its targets; the states drafted on the rig loop, play and hold", async () => {
  const section = page.locator("#character");
  await section.scrollIntoViewIfNeeded();
  // A press pad in the corner, clear of everything (a press anywhere finishes every move).
  await page.evaluate(() => {
    const pad = Object.assign(document.createElement("div"), { className: "check-press-pad" });
    Object.assign(pad.style, { position: "fixed", right: "0", bottom: "0", width: "40px", height: "40px", zIndex: "2147483647" });
    document.body.append(pad);
  });
  // The act: a test act handed in as lex-mascots' are, recording every call it gets.
  const act1 = await page.evaluate(async () => {
    const motion = await import("/js/lx/motion.js");
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const node = document.querySelector('.ds-character-stage [data-part="character"]');
    node.scrollIntoView({ block: "center" });
    await sleep(150);
    const target = Object.assign(document.createElement("div"), { className: "check-act-target" });
    Object.assign(target.style, { position: "fixed", left: "40px", top: "60px", width: "200px", height: "24px" });
    document.body.append(target);
    const calls = [], seen = [];
    const make = ({ palette, size }) => {
      calls.push({ palette, size });
      return {
        name: "check-act", dur: Infinity, exit: 0.3,
        frame(t, T, ctx) {
          seen.push({ t, rects: ctx.rects, data: ctx.data, endedAt: ctx.endedAt, palette });
          return `<circle data-check-act="${palette}" r="${(10 + t).toFixed(3)}"/>`;
        },
      };
    };
    window.lxCheckAct = { node, target, calls, seen, make };
    const running0 = motion.runningCount();
    const handle = node.perform(make, [target]);
    window.lxCheckAct.handle = handle;
    // Its first frame, at once (before any frame of the page's).
    const sync = { state: node.getAttribute("data-state"), drawn: Boolean(node.querySelector("svg [data-check-act]")), frames: seen.length, calls: calls.length, running: motion.runningCount() - running0, handle: typeof handle?.set === "function" && typeof handle?.end === "function" };
    // The target's box in its drawing's units (VIEW [-64, -124, 128, 130]: its origin the middle of its ground), worked
    // out here from the two boxes, apart from character.js's own sums.
    const box = () => { const b = node.getBoundingClientRect(), r = target.getBoundingClientRect(), k = 130 / b.height, ox = b.left + (64 / 128) * b.width, oy = b.top + (124 / 130) * b.height; return [(r.left - ox) * k, (r.top - oy) * k, (r.right - ox) * k, (r.bottom - oy) * k]; };
    const off = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
    const first = off(seen[0].rects[0], box());
    await sleep(300);
    const drawing = { frames: seen.length, rising: seen.at(-1).t > seen[0].t, endedAt: seen.at(-1).endedAt };
    handle.set({ progress: 0.5 });
    await sleep(120);
    const data = seen.at(-1).data;
    // The target moves: the rects follow it, measured each frame.
    target.style.left = "140px";
    await sleep(120);
    const followed = off(seen.at(-1).rects[0], box());
    // Moved on the page (out and back in the same task), it carries on.
    const parent = node.parentNode, next = node.nextSibling;
    node.remove();
    parent.insertBefore(node, next);
    const movedAt = seen.length;
    await sleep(150);
    const moved = { state: node.getAttribute("data-state"), drew: seen.length > movedAt };
    // The target leaves the page: null in its place.
    target.remove();
    await sleep(120);
    const gone = seen.at(-1).rects[0];
    return { sync, first, drawing, data, followed, moved, gone };
  });
  assert(act1.sync.handle && act1.sync.state === "check-act" && act1.sync.drawn && act1.sync.frames === 1 && act1.sync.calls === 1 && act1.sync.running === 1,
    `perform() should hand back { set, end }, mark data-state with the act's name and draw its first frame at once, registered: ${JSON.stringify(act1.sync)}`);
  assert(act1.first < 0.05, `the target's box should reach frame() in its drawing's units (off by ${act1.first})`);
  assert(act1.drawing.frames > 5 && act1.drawing.rising && act1.drawing.endedAt === null, `it should keep drawing the act, t rising, not ended: ${JSON.stringify(act1.drawing)}`);
  assert(act1.data?.progress === 0.5, `set() should hand the act its data: ${JSON.stringify(act1.data)}`);
  assert(act1.followed < 0.05, `the box should follow the target as it moves (off by ${act1.followed})`);
  assert(act1.moved.state === "check-act" && act1.moved.drew, `moved on the page it should carry on: ${JSON.stringify(act1.moved)}`);
  assert(act1.gone === null, `a target that has left the page should be null: ${JSON.stringify(act1.gone)}`);
  // A new theme: the act is made again in the other ink, and carries on. The theme changes here without a press (a
  // press would finish the act): Paper's attribute on the page, as the theme engine sets it, then Graphite's again.
  const inked = await page.evaluate(async () => {
    const root = document.documentElement, was = root.dataset.theme;
    root.dataset.theme = "paper";
    await new Promise((r) => setTimeout(r, 300));
    const { calls, seen, node } = window.lxCheckAct;
    // make() gets the ink as a palette object (character/ink.js readInk): the rig's own, by name, with no theme ink set.
    const { PALETTES } = await import("/js/character/rig/inkdrop/inkdrop.js");
    const named = (p) => Object.keys(PALETTES).find((k) => PALETTES[k] === p) ?? (p && typeof p === "object" ? `ink:${p.scheme}:${p.body}` : String(p));
    const out = { was, scheme: getComputedStyle(root).colorScheme, calls: calls.map((c) => named(c.palette)), last: named(seen.at(-1).palette), state: node.getAttribute("data-state"), size: calls.at(-1).size };
    root.dataset.theme = was;
    await new Promise((r) => setTimeout(r, 150));
    return out;
  });
  assert(inked.calls.length === 2 && inked.calls[0] === "dark" && inked.calls[1] === "light" && inked.last === "light" && inked.state === "check-act" && inked.size === 120,
    `a new theme should make the act again in its ink, at its size: ${JSON.stringify(inked)}`);
  // end(): its exit plays (endedAt reaches frame), then it settles at endedAt + exit, back to its loop; the handle is spent.
  const ended = await page.evaluate(async () => {
    const motion = await import("/js/lx/motion.js");
    const { node, seen, handle } = window.lxCheckAct;
    const t0 = performance.now();
    handle.end();
    handle.end();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const endedAt = seen.at(-1).endedAt;
    while (node.getAttribute("data-state") === "check-act" && performance.now() - t0 < 3000) await new Promise((r) => requestAnimationFrame(r));
    const settled = performance.now() - t0, frames = seen.length;
    handle.set({ progress: 1 });
    await new Promise((r) => setTimeout(r, 200));
    return { endedAt, settled, state: node.getAttribute("data-state"), after: seen.length - frames, running: motion.runningCount(), idle: !node.querySelector("svg [data-check-act]") };
  });
  assert(typeof ended.endedAt === "number" && ended.endedAt > 0.5, `end() should reach frame() as endedAt (the act's time): ${JSON.stringify(ended)}`);
  assert(ended.settled > 250 && ended.settled < 700 && ended.state === "idle" && ended.idle, `it should settle back to idle at endedAt + exit (0.3 s): ${JSON.stringify(ended)}`);
  assert(ended.after === 0 && ended.running === 0, `once settled the handle does nothing and nothing is running: ${JSON.stringify(ended)}`);
  // A press 120 ms into an act finishes it at once.
  await page.evaluate(() => {
    const { node, make } = window.lxCheckAct;
    window.lxCheckAct.pressed = node.perform(make, []);
  });
  await page.waitForTimeout(120);
  await page.mouse.click(1440 - 20, 1000 - 20);
  const pressed = await page.evaluate(async () => {
    const motion = await import("/js/lx/motion.js");
    return { state: window.lxCheckAct.node.getAttribute("data-state"), running: motion.runningCount() };
  });
  assert(pressed.state === "idle" && pressed.running === 0, `a press should finish an act at once: ${JSON.stringify(pressed)}`);
  // Taken off the page for good: it lets go of its act (after the task), and drawn again it's itself.
  const removed = await page.evaluate(async () => {
    const motion = await import("/js/lx/motion.js");
    const { node, make } = window.lxCheckAct;
    node.perform(make, []);
    const during = motion.runningCount();
    const parent = node.parentNode, next = node.nextSibling;
    node.remove();
    const sameTask = motion.runningCount();
    await new Promise((r) => setTimeout(r, 50));
    const out = { during, sameTask, after: motion.runningCount(), state: node.getAttribute("data-state") };
    parent.insertBefore(node, next);
    await new Promise((r) => setTimeout(r, 100));
    out.back = node.getAttribute("data-state");
    out.drawn = Boolean(node.querySelector("svg path")) && !node.querySelector("svg [data-check-act]");
    return out;
  });
  assert(removed.during === 1 && removed.sameTask === 1 && removed.after === 0 && removed.state === "idle" && removed.back === "idle" && removed.drawn,
    `off the page for good it should let its act go after the task, and come back as itself: ${JSON.stringify(removed)}`);
  // Animations off: nothing plays, the act is never made, and the handle does nothing.
  const off = await page.evaluate(async () => {
    const motion = await import("/js/lx/motion.js");
    const root = document.documentElement, was = root.getAttribute("data-motion");
    root.setAttribute("data-motion", "off");
    const { node } = window.lxCheckAct;
    let made = 0;
    const handle = node.perform(() => { made++; return { name: "check-off", dur: 1, frame: () => "<g/>" }; }, []);
    handle.set({ progress: 0.5 });
    handle.end();
    const out = { made, state: node.getAttribute("data-state"), running: motion.runningCount(), handle: typeof handle.set === "function" && typeof handle.end === "function" };
    if (was === null) root.removeAttribute("data-motion"); else root.setAttribute("data-motion", was);
    await new Promise((r) => setTimeout(r, 100));
    return out;
  });
  assert(off.handle && off.made === 0 && off.state === "idle" && off.running === 0, `with animations off nothing should play: ${JSON.stringify(off)}`);
  // ui.performCharacter: the handle at once; data set before the act starts reaches it; an act ended before it could
  // start never plays.
  const viaUi = await page.evaluate(async () => {
    const ui = await import("/js/lx/ui.js");
    const { node } = window.lxCheckAct;
    node.scrollIntoView({ block: "center" });
    await new Promise((r) => setTimeout(r, 150));
    let early = 0;
    const gone = ui.performCharacter(node, () => { early++; return { name: "check-early", dur: 1, frame: () => "<g/>" }; }, []);
    gone.end();
    const seen = [];
    const handle = ui.performCharacter(node, () => ({ name: "check-ui", dur: Infinity, exit: 0, frame: (t, T, ctx) => { seen.push(ctx.data); return "<g/>"; } }), []);
    handle.set({ progress: 0.25 });
    const sync = typeof handle.set === "function" && typeof handle.end === "function";
    await new Promise((r) => setTimeout(r, 150));
    const out = { sync, early, state: node.getAttribute("data-state"), data: seen.at(-1) };
    handle.end();
    await new Promise((r) => setTimeout(r, 150));
    out.after = node.getAttribute("data-state");
    return out;
  });
  assert(viaUi.sync && viaUi.early === 0 && viaUi.state === "check-ui" && viaUi.data?.progress === 0.25 && viaUi.after === "idle",
    `ui.performCharacter should hand back its handle at once, pass on data set early, and never start an act ended early: ${JSON.stringify(viaUi)}`);
  // An act that goes wrong is reported, and that Tinta goes back to its loop while every other Tinta draws on.
  const broken = await page.evaluate(async () => {
    const { node } = window.lxCheckAct;
    // One that draws every frame (a held state other than idle, which rests on the compositor between its blinks: character.js held()).
    const other = [...document.querySelectorAll('#character [data-part="character"]:not([data-still])')].find((n) => n !== node && n.visible && n.getAttribute("data-state") !== "idle");
    node.perform(() => ({ name: "check-broken", dur: 2, frame: (t) => { if (t > 0.05) throw new Error("check-broken-act"); return "<g/>"; } }), []);
    await new Promise((r) => setTimeout(r, 200));
    const frames = other?.stats.frames ?? 0;
    await new Promise((r) => setTimeout(r, 300));
    return { state: node.getAttribute("data-state"), others: (other?.stats.frames ?? 0) - frames, other: Boolean(other) };
  });
  const reported = problems.filter((p) => p.includes("check-broken-act"));
  for (const p of reported) problems.splice(problems.indexOf(p), 1);
  assert(reported.length >= 1, `the broken act should be reported: ${JSON.stringify(reported)}`);
  assert(broken.state === "idle" && broken.other && broken.others > 3, `after a broken act it should be back to idle and the others drawing on: ${JSON.stringify(broken)}`);
  // The states drafted on the rig: every held one loops (its drawing changes) and isn't idle's; a reaction drafted there
  // plays once and back; a name that isn't a state is ignored.
  const drafted = await page.evaluate(async () => {
    const { tinta, STATES } = await import("/js/character/rig/inkdrop/tinta.js");
    const rig = tinta({ size: 72 });
    const names = Object.keys(rig).filter((k) => typeof rig[k]?.frame === "function");
    const held = names.filter((k) => rig[k].loop === true), once = names.filter((k) => !rig[k].loop && Number.isFinite(rig[k].dur));
    const extraHeld = held.filter((k) => !STATES.includes(k)), extraOnce = once.filter((k) => !STATES.includes(k));
    // The theming surface names every state the rig has (an AI styling the app reads it from parts.js).
    const { PARTS } = await import("/js/lx/parts.js");
    const listed = PARTS.find((part) => part.name === "character")?.states ?? [];
    const unlisted = [...held, ...once].filter((k) => !listed.includes(k));
    const live = (name) => document.querySelector(`#character [data-part="character"][data-state="${name}"]:not([data-still])`);
    const looping = [];
    for (const name of held) {
      const node = live(name);
      if (!node) { looping.push(`${name}: no demo`); continue; }
      node.scrollIntoView({ block: "center" });
      await new Promise((r) => setTimeout(r, 150));
      const a = node.querySelector("svg").innerHTML;
      await new Promise((r) => setTimeout(r, 500));
      // Looping: its drawing changing, or (on the compositor, character.js startMotion) its breath playing as a transform on it.
      const breathing = node.querySelector("svg").getAnimations().some((x) => x.playState === "running");
      if (node.querySelector("svg").innerHTML === a && !breathing) looping.push(`${name}: static`);
    }
    const stage = document.querySelector('.ds-character-stage [data-part="character"]');
    stage.scrollIntoView({ block: "center" });
    const played = [];
    for (const name of extraOnce) {
      stage.play(name);
      const during = stage.getAttribute("data-state");
      const t0 = performance.now();
      while (stage.getAttribute("data-state") === name && performance.now() - t0 < rig[name].dur * 1000 + 1500) await new Promise((r) => requestAnimationFrame(r));
      played.push({ name, during, back: stage.getAttribute("data-state"), s: (performance.now() - t0) / 1000, dur: rig[name].dur });
    }
    // Not states: the rig's own functions, and names on every object.
    for (const name of ["say", "pointing", "constructor", "toString", "__proto__", "nothing"]) {
      stage.state = name;
      stage.play(name);
    }
    const ignored = stage.getAttribute("data-state") === "idle" && stage.state === "idle";
    // A held state set on a Tinta, then back.
    stage.state = extraHeld[0];
    const set = stage.getAttribute("data-state");
    stage.state = "idle";
    return { held, once, extraHeld, extraOnce, looping, played, ignored, set, unlisted };
  });
  assert(drafted.unlisted.length === 0, `every state should be listed in parts.js (the theming surface): ${drafted.unlisted.join(", ")}`);
  assert(drafted.extraHeld.length > 0, `the rig should have states drafted on it: ${JSON.stringify(drafted)}`);
  assert(drafted.looping.length === 0, `every held state should loop in its demo: ${drafted.looping.join(", ")}`);
  assert(drafted.played.every((p) => p.during === p.name && p.back === "idle" && Math.abs(p.s - p.dur) < 0.4), `each drafted reaction should play once and back: ${JSON.stringify(drafted.played)}`);
  assert(drafted.ignored && drafted.set === drafted.extraHeld[0], `a name that isn't a state should be ignored, a held one set: ${JSON.stringify(drafted)}`);
  await page.evaluate(() => document.querySelector(".check-press-pad")?.remove());
  return `an act: first frame at once, its target's box in its units each frame (following it, null once gone), its data, made again in the light ink, carried on through a move, ended at endedAt + exit (${Math.round(ended.settled)} ms), a press finishing it, let go off the page, nothing with animations off; ui.performCharacter's early data and early end; a broken act reported, the others drawing on; drafted states: ${drafted.extraHeld.join(", ")} looping, ${drafted.extraOnce.join(", ") || "no reactions"} played once`;
});

// ui.arrive (11 Nov 2026): a kept page drawn off the screen gets what it held (the rule before left its place held for good); one removed doesn't.
await stage("held places arrive: on the page in the holder's place (a height off marked), in a page kept off the screen too (nothing measured or faded), never into one removed for good", async () => {
  const got = await page.evaluate(async () => {
    const ui = await import("/js/lx/ui.js");
    const box = (h) => {
      const n = document.createElement("div");
      n.style.height = `${h}px`;
      return n;
    };
    const host = document.createElement("div");
    document.body.prepend(host);
    const shown = ui.held({ height: 40 }, "check");
    host.append(shown);
    const a = box(40);
    ui.arrive(shown, a);
    const onPage = { placed: a.parentNode === host && !shown.parentNode, mismatch: a.dataset.holdsMismatch ?? null };
    const off = ui.held({ height: 40 }, "check");
    host.append(off);
    const b = box(52);
    const warn = console.warn;
    console.warn = () => {};
    ui.arrive(off, b);
    console.warn = warn;
    const marked = b.dataset.holdsMismatch ?? null;
    host.remove();
    // A page kept off the screen: detached, as a kept tab's page is while another is shown.
    const kept = document.createElement("div");
    const waiting = ui.held({ height: 40 }, "check");
    kept.append(waiting);
    const c = box(52);
    const back = ui.arrive(waiting, c);
    const inKept = { placed: c.parentNode === kept && !waiting.parentNode, returned: back === c, mismatch: c.dataset.holdsMismatch ?? null, fading: c.getAnimations().length };
    // Removed for good: placed nowhere.
    const gone = ui.held({ height: 40 }, "check");
    const d = box(40);
    const removed = { returned: ui.arrive(gone, d) === d, placed: Boolean(d.parentNode) };
    // The rule from before, planted: a holder not on the page got nothing, so a kept page's place stayed held.
    const before = (holder, node) => {
      if (!holder?.isConnected || !node) return node;
      holder.replaceWith(node);
      return node;
    };
    const kept2 = document.createElement("div");
    const waiting2 = ui.held({ height: 40 }, "check");
    kept2.append(waiting2);
    const e = box(40);
    before(waiting2, e);
    return { onPage, marked, inKept, removed, planted: { placed: e.parentNode === kept2 } };
  });
  assert(!got.planted.placed, `the planted rule from before should leave the kept page's place held: ${JSON.stringify(got.planted)}`);
  assert(got.onPage.placed && got.onPage.mismatch === null, `on the page the node should take the holder's place, unmarked: ${JSON.stringify(got.onPage)}`);
  assert(got.marked === "40→52", `a height 12 px off should be marked 40→52: ${got.marked}`);
  assert(got.inKept.placed && got.inKept.returned && got.inKept.mismatch === null && got.inKept.fading === 0, `in a kept page the node should take the place, unmeasured and unfaded: ${JSON.stringify(got.inKept)}`);
  assert(got.removed.returned && !got.removed.placed, `a holder removed for good should get nothing: ${JSON.stringify(got.removed)}`);
  return "on the page placed and a height off marked 40→52; in a kept page placed, nothing measured or faded; removed for good, placed nowhere; the rule from before (planted) caught leaving the kept page's place held";
});

await stage("phone width: no sideways scroll, Appearance opens as a sheet", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForSelector("html[data-surface-check]");
  const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
  assert(overflow <= 0, `page scrolls sideways by ${overflow}px`);
  await page.screenshot({ path: join(OUT, "06-phone.png"), fullPage: true });
  await page.click("#panel-open");
  await page.waitForTimeout(500);
  assert(await page.locator("#panel").isVisible(), "the Appearance sheet should open");
  await page.screenshot({ path: join(OUT, "07-phone-appearance.png") });
  return "390px wide, no overflow";
});

await stage("screenshots of every section, dark and light", async () => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await page.waitForSelector("html[data-surface-check]");
  const ids = await page.locator("#sections > section").evaluateAll((nodes) => nodes.map((n) => n.id));
  for (const [name, id] of [["Graphite", "graphite"], ["Paper", "paper"]]) {
    await useBuiltIn(name, id);
    for (const section of ids) await page.locator(`#${section}`).screenshot({ path: join(OUT, `sections/${id}-${section}.png`) });
  }
  await page.screenshot({ path: join(OUT, "08-paper-desktop.png") });
  await useBuiltIn("Graphite", "graphite");
  return `${ids.length} sections × 2 themes`;
});

await stage("no console errors, CSP violations or outside requests", async () => {
  assert(problems.length === 0, problems.join(" | "));
  assert(outside.length === 0, `outside requests: ${outside.join(", ")}`);
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "design-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems, outside }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
