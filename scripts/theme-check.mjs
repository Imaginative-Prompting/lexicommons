// Checks custom colors, CSS and images end to end in headless Chrome on a LOCAL server (it creates and deletes a
// test account, so never point it at the live site):
// - Settings → Appearance and its pages: colors (text and picker, transparency kept, meaning tints, readability
//   warnings), fonts and corners, custom CSS (the safety check, the parts reference, CSS that hides the app undone),
//   images (a big photo scaled down, fit, dim, blur, the logo, your own slots), recent looks, safe mode;
// - saved themes: a change to a built-in theme starts a theme of yours (Undo drops it), switching to a built-in theme
//   and back loses nothing, renaming, exporting a theme file and importing it as a new theme, duplicating, deleting
//   with Undo; your AI's list_themes, create_theme (a new look leaves your other themes alone), update_look on a
//   built-in theme, use_theme; a switch on one device followed by another; a theme changed and left while offline keeps
//   its change; an app from before saved themes still saves to the theme in use;
// - each section's own background: its Settings page (previewed behind it), the routes, MCP, a session falling back to
//   Study's, and the fade between sections (never in the way of a press; none with animations off);
// - images saved before they were stored by hash move over on load;
// - the look on the account: the device sends its changes, your AI changes it over MCP (with a personal token), the
//   app applies them within seconds with an Undo, reports back, and undoes a look that hides the app; a second
//   device follows, and two devices changing different things at once both keep their change;
// - every new page at phone width without sideways scrolling, and no console errors.
//
// Local server (its own D1 state, so other sessions' local data isn't touched):
//   npx wrangler d1 migrations apply lexicommons --local --persist-to <dir>
//   npx wrangler dev --port <port> --local-upstream localhost:<port> --persist-to <dir> --var GATE_ENABLED:false \
//     --var PUBLIC_ORIGIN:http://localhost:<port> --var RP_ID:localhost --var UPLOAD_SIGNING_SECRET:<any local value>
// Usage (headless Chrome, so through the channel's GPU queue, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lex-theming --label "theme check" --kind stills -- \
//     node 08-lexicommons/app/scripts/theme-check.mjs http://localhost:<port> <outDir>

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";
import { chromium } from "./quiet-browser.mjs";

const [BASE, OUT = "theme-check-out"] = process.argv.slice(2);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("theme-check creates and deletes an account: give it a local server, e.g. http://localhost:8821");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });

const results = [];
const problems = [];
const syncLog = [];
async function stage(name, fn) {
  syncLog.push(`${new Date().toISOString().slice(11, 23)} == ${name}`);
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
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

/** A PNG of one color, or of noise (which doesn't compress, so it's big). */
function png(width, height, rgb, { noise = false } = {}) {
  const row = Buffer.alloc(1 + width * 3);
  const rows = [];
  for (let y = 0; y < height; y++) {
    const line = noise ? Buffer.concat([Buffer.from([0]), randomBytes(width * 3)]) : Buffer.from(row);
    if (!noise) for (let x = 0; x < width; x++) line.set(rgb, 1 + x * 3);
    rows.push(line);
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(data.length + 12);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), data.length + 8);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 1 })), chunk("IEND", Buffer.alloc(0))]);
}

const files = {
  tile: join(OUT, "tile.png"),
  mark: join(OUT, "mark.png"),
  paper: join(OUT, "paper.png"),
  photo: join(OUT, "big-photo.png"),
  read: join(OUT, "read.png"),
  know: join(OUT, "know.png"),
  study: join(OUT, "study.png"),
  session: join(OUT, "session.png"),
};
writeFileSync(files.tile, png(64, 64, [40, 70, 130]));
writeFileSync(files.mark, png(32, 32, [230, 120, 40]));
writeFileSync(files.paper, png(16, 16, [210, 200, 170]));
writeFileSync(files.photo, png(3000, 2200, null, { noise: true }));
writeFileSync(files.read, png(48, 48, [190, 70, 50]));
writeFileSync(files.know, png(48, 48, [60, 150, 90]));
writeFileSync(files.study, png(48, 48, [120, 80, 170]));
writeFileSync(files.session, png(48, 48, [220, 200, 60]));

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
// While a stage takes device 2 offline on purpose, a request the app makes meanwhile (its own polls) fails as it must: not a problem.
let offlineOnPurpose = false;
const watch = (p, who) => {
  p.on("console", (m) => {
    if (m.type() === "debug" && m.text().startsWith("[look-sync]")) syncLog.push(`${new Date().toISOString().slice(11, 23)} ${who} ${m.text()}`);
    if (m.type() !== "error") return;
    const url = m.location()?.url ?? "";
    // Chrome asks every page without an icon link (robots.txt, here) for /favicon.ico.
    if (url.endsWith("/favicon.ico")) return;
    if (offlineOnPurpose && /net::ERR_INTERNET_DISCONNECTED/.test(m.text())) return;
    problems.push(`${who} console: ${m.text()}${url ? ` (${url})` : ""}`);
  });
  p.on("pageerror", (e) => problems.push(`${who} page error: ${e.message}`));
};
watch(page, "device 1");
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const shot = async (name, p = page) => {
  await p.waitForFunction(() => document.getAnimations().length === 0, null, { timeout: 5000 }).catch(() => {});
  await p.screenshot({ path: join(OUT, "shots", `${name}.png`) });
};
const css = (name, p = page) => p.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const look = (p = page) => p.evaluate(async () => (await import("/js/lx/theme.js")).getSettings().look);
/** The theme in use: { kind: "yours" | "built-in", id, name }. */
const inUse = (p = page) => p.evaluate(async () => (await import("/js/lx/theme.js")).themeInUse());
/** Your themes on this device, by name. */
const yourThemes = (p = page) => p.evaluate(async () => (await import("/js/lx/theme.js")).themes().map((t) => t.name));
const swatch = (id, p = page) => p.locator(`[data-part="theme-swatch"][data-theme-id="${id}"]`);
const yourSwatch = (name, p = page) => p.locator('[data-part="theme-swatch"][data-variant="yours"]', { has: p.locator(".lx-swatch-name", { hasText: new RegExp(`^${name}$`) }) });
const toastText = (p = page) => p.locator('.lx-toasts [data-part="toast"]').textContent({ timeout: 5000 }).catch(() => "");
const pageEl = (p = page) => p.locator('[data-part="page"]');
const row = (title, p = page) => pageEl(p).locator('[data-part="list-row"]', { has: p.locator(".lx-row-title", { hasText: new RegExp(`^${title}$`) }) }).first();
const status = (p = page) => p.locator(".ds-status").first();
const goto = async (hash, p = page) => {
  await p.goto(`${BASE}/app/${hash}`);
  await p.waitForSelector("html[data-app-ready]");
};
const noSidewaysScroll = (p = page) => p.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
// A wait that runs out says what it waited for, and where the page was.
const waitFor = (fn, arg, timeout = 15_000, p = page) =>
  p.waitForFunction(fn, arg, { timeout }).catch(async (error) => {
    const at = await p.evaluate(() => ({ hash: location.hash, section: document.documentElement.getAttribute("data-section") })).catch(() => null);
    throw new Error(`${error.message.split("\n")[0]} waiting for ${fn.toString().slice(0, 160)} (at ${JSON.stringify(at)})`);
  });
/** Like waitFor, for a check that's async in the page (waitForFunction takes a returned promise as true at once). */
async function until(fn, arg, timeout = 15_000, p = page) {
  const end = Date.now() + timeout;
  for (;;) {
    if (await p.evaluate(fn, arg)) return;
    if (Date.now() > end) throw new Error(`still not true after ${timeout / 1000} s: ${fn.toString().slice(0, 120)}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

let token = null;
async function mcp(name, args = {}) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${name}: ${response.status} ${text.slice(0, 200)}`);
  const { result, error } = JSON.parse(line.slice(6));
  if (error) throw new Error(`${name}: ${error.message}`);
  if (result.isError) throw new Error(`${name}: ${result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}

// ---------- the run ----------

await stage("images saved before they were stored by hash move over on load", async () => {
  // An appearance saved by the previous version (images keyed by slot), written from a page that doesn't open the
  // database itself; then the /design page loads it.
  const legacy = await context.newPage();
  watch(legacy, "legacy");
  await legacy.goto(`${BASE}/robots.txt`);
  await legacy.evaluate(async (bytes) => {
    await new Promise((resolve, reject) => {
      const del = indexedDB.deleteDatabase("lexicommons-appearance");
      del.onsuccess = resolve;
      del.onerror = () => reject(del.error);
      del.onblocked = resolve;
    });
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open("lexicommons-appearance", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("images");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("images", "readwrite");
      tx.objectStore("images").put(new Blob([new Uint8Array(bytes)], { type: "image/png" }), "background");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    localStorage.setItem("lx.appearance.v1", JSON.stringify({ version: 1, theme: "graphite", presets: {}, look: { name: "Old", tokens: { "--well": "#202020" }, css: "", images: { background: { type: "image/png", size: bytes.length, name: "old.png" } } } }));
  }, [...readFileSync(files.tile)]);
  await legacy.goto(`${BASE}/design/`);
  await legacy.waitForSelector("html[data-surface-check]");
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--image-background").startsWith('url("blob:'), null, 10_000, legacy);
  const migrated = await look(legacy);
  assert(/^[0-9a-f]{64}$/.test(migrated.images.background?.hash ?? ""), `the image is stored by hash now: ${JSON.stringify(migrated.images)}`);
  // A look from before saved themes, on a device that has never synced, is a theme of yours now.
  const kept = await inUse(legacy);
  assert(kept.kind === "yours" && kept.name === "Old" && (await yourThemes(legacy)).includes("Old"), `the old look is a theme of yours: ${JSON.stringify(kept)}`);
  // Leave nothing behind for the account made next.
  await legacy.evaluate(async () => {
    const theme = await import("/js/lx/theme.js");
    await theme.resetLook();
    await theme.clearHistory();
    localStorage.clear();
  });
  await legacy.close();
  return `background moved to ${migrated.images.background.hash.slice(0, 12)}…`;
});

await stage("sign up with a passkey, land in the app", async () => {
  // The sync's own trail (look-sync.js), kept in theme-check.json.
  await page.goto(`${BASE}/robots.txt`);
  await page.evaluate(() => localStorage.setItem("lx.debug.sync", "1"));
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Theme Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000, waitUntil: "commit" }).catch((error) => {
    throw new Error(`${error.message.split("\n")[0]} (at ${page.url()})`);
  });
  await page.waitForSelector("html[data-app-ready]", { timeout: 20_000 });
  return "signed in";
});

await stage("Appearance: the themes to pick from, and a page for each part; the old pages' addresses open theirs", async () => {
  await goto("#settings/appearance/customize");
  await waitFor(() => location.hash === "#settings/appearance" && document.querySelector('[data-part="page-title"]')?.textContent === "Appearance");
  const builtIn = await page.locator('[data-part="theme-swatch"]:not([data-variant])').evaluateAll((nodes) => nodes.map((n) => [n.dataset.themeId, n.getAttribute("aria-pressed")]));
  assert(builtIn.map(([id]) => id).join() === "graphite,paper,auto,contrast,sepia" && builtIn[0][1] === "true", `the built-in themes, Graphite in use: ${JSON.stringify(builtIn)}`);
  assert((await page.locator('[data-part="theme-swatch"][data-variant="yours"]').count()) === 0, "none of yours yet");
  const labels = await pageEl().locator('[data-part="group-label"]').allTextContents();
  assert(labels.includes("Theme"), `groups: ${labels}`);
  await shot("01-appearance");
  // Making it yours is a page of its own, with everything that changes the theme in use.
  await row("Make it yours").click();
  await waitFor(() => location.hash === "#settings/appearance/edit" && document.querySelector('[data-part="page-title"]')?.textContent === "Make it yours");
  const titles = await pageEl().locator(".lx-row-title").allTextContents();
  for (const t of ["Colors", "Custom CSS", "Images", "Your themes"]) assert(titles.includes(t), `row ${t}`);
  // The design system is an admin's (Settings → Admin, 6 Nov), not a learner's way to change the look.
  assert(!titles.includes("Design system"), `Make it yours still has Design system: ${titles}`);
  const visited = [];
  for (const [title, hash] of [["Colors", "colors"], ["Custom CSS", "css"], ["Images", "images"], ["Your themes", "themes"]]) {
    await row(title).click();
    await waitFor(([h, t]) => location.hash === `#settings/appearance/${h}` && document.querySelector('[data-part="page-title"]')?.textContent === t, [hash, title]);
    assert((await noSidewaysScroll()) <= 0, `${title} scrolls sideways at phone width`);
    const stray = await pageEl().evaluate((n) => /\b(null|undefined)\b/.test(n.innerText));
    assert(!stray, `${title} shows "null" or "undefined" text`);
    assert((await page.locator('[data-part="app-back"]').textContent()).includes("Make it yours"), `${title}'s back link`);
    await shot(`02-${hash}`);
    await page.locator('[data-part="app-back"]').click();
    await waitFor(() => location.hash === "#settings/appearance/edit");
    visited.push(title);
  }
  await goto("#settings/appearance/share");
  await waitFor(() => location.hash === "#settings/appearance/themes" && document.querySelector('[data-part="page-title"]')?.textContent === "Your themes");
  return `${visited.length} pages, each back to Make it yours, none wider than the phone; Share opens Your themes`;
});

await stage("colors: typed values, the picker (keeping transparency), meaning tints, reset", async () => {
  await goto("#settings/appearance/colors");
  const field = (label) => page.getByLabel(label, { exact: true });
  await field("Page background and header (--canvas)").fill("#0e1116");
  await field("Page background and header (--canvas)").press("Enter");
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim() === "#0e1116");
  // The picker on a see-through color: the new color keeps the theme's transparency.
  await page.getByLabel("Pick: Borders", { exact: true }).evaluate((input) => {
    input.value = "#ff8800";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const edge = (await look()).tokens["--edge"];
  assert(/^rgba\(255, 136, 0, 0\.1[34]\d*\)$/.test(edge), `the border keeps its transparency: ${edge}`);
  await field("Wrong (--m-wrong)").fill("#e07b00");
  await field("Wrong (--m-wrong)").press("Enter");
  const tokens = (await look()).tokens;
  assert(tokens["--m-wrong-bg"]?.includes("#e07b00") && tokens["--m-wrong-edge"]?.includes("#e07b00"), `wrong's tint and edge follow: ${JSON.stringify(tokens)}`);
  assert(await page.locator('.lx-colour-row[data-changed]').count() >= 3, "changed rows are marked");
  // Reset one row to the theme's own.
  await page.getByRole("button", { name: "Back to the theme's borders (--edge)" }).click();
  assert(!("--edge" in (await look()).tokens), "the border is the theme's again");
  await shot("03-colors-changed");
  return { canvas: await css("--canvas"), wrong: tokens["--m-wrong"], wrongBg: tokens["--m-wrong-bg"] };
});

await stage("colors: text that's hard to read is flagged", async () => {
  const field = page.getByLabel("Main text (--ink-1)", { exact: true });
  await field.fill("#1a1d22");
  await field.press("Enter");
  await waitFor(() => [...document.querySelectorAll('[data-part="feedback"]')].some((n) => n.textContent.includes("Main text on the page background")));
  const warning = await pageEl().locator('[data-part="feedback"]', { hasText: "Main text on the page background" }).first().textContent();
  await shot("04-colors-warning");
  await page.getByRole("button", { name: "Back to the theme's main text (--ink-1)" }).click();
  await waitFor(() => ![...document.querySelectorAll('[data-part="feedback"]')].some((n) => n.textContent.includes("Main text on the page background")));
  return warning.replace(/\s+/g, " ").trim();
});

await stage("fonts and corners: plain choices that set tokens", async () => {
  const choose = (title, option) => pageEl().locator(".lx-row-choice", { hasText: title }).getByRole("button", { name: option, exact: true }).click();
  await choose("Reading font", "Serif");
  await choose("Corners", "Round");
  assert((await css("--type-read")).includes("Iowan"), `reading font: ${await css("--type-read")}`);
  assert((await css("--radius-24")) === "32px", `corners: ${await css("--radius-24")}`);
  const pressed = await pageEl().locator(".lx-row-choice", { hasText: "Corners" }).locator('[aria-pressed="true"]').textContent();
  assert(pressed === "Round", `Round shows as chosen: ${pressed}`);
  await choose("Corners", "Default");
  assert((await css("--radius-24")) === "24px", "default corners back");
  return "serif reading font, round then default corners";
});

await stage("a change to a built-in theme starts a theme of yours; switching away and back loses nothing", async () => {
  const started = await inUse();
  assert(started.kind === "yours" && started.name === "Graphite, edited", `the colors went into a theme of yours: ${JSON.stringify(started)}`);
  await goto("#settings/appearance");
  assert(await yourSwatch("Graphite, edited").isVisible(), "it shows under Yours");
  // Graphite itself is as it comes.
  await swatch("graphite").click();
  await waitFor(() => document.querySelector('.lx-toasts [data-part="toast"]')?.textContent.includes("Now using Graphite"));
  assert((await css("--canvas")) !== "#0e1116" && Object.keys((await look()).tokens).length === 0, "Graphite has none of the changes");
  assert((await swatch("graphite").getAttribute("aria-pressed")) === "true", "Graphite shows as in use");
  await shot("03b-graphite-as-it-comes");
  // A change on Paper starts "Paper, edited"; Undo goes back to Paper and drops it.
  await swatch("paper").click();
  await waitFor(() => document.documentElement.dataset.theme === "paper");
  await goto("#settings/appearance/colors");
  const field = page.getByLabel("Page background and header (--canvas)", { exact: true });
  await field.fill("#f0e8d8");
  await field.press("Enter");
  await waitFor(() => document.querySelector('.lx-toasts [data-part="toast"]')?.textContent.includes("Saved as a new theme of yours, Paper, edited"));
  assert((await yourThemes()).includes("Paper, edited"), "Paper, edited is a theme of yours");
  await page.locator(".lx-toasts").getByRole("button", { name: "Undo" }).click();
  await until(async () => {
    const t = await import("/js/lx/theme.js");
    const now = t.themeInUse();
    return now.kind === "built-in" && now.id === "paper" && !t.themes().some((x) => x.name === "Paper, edited");
  });
  // Back to the theme of yours: every change is still there.
  await goto("#settings/appearance");
  await yourSwatch("Graphite, edited").click();
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim() === "#0e1116");
  const back = await look();
  assert(back.tokens["--m-wrong"] === "#e07b00", `the changes came back: ${JSON.stringify(back.tokens)}`);
  await shot("03c-yours-again");
  return { started: started.name, undoDrops: "Paper, edited", back: Object.keys(back.tokens).length + " tokens" };
});

await stage("custom CSS: wins over the app, outside links removed, the parts reference inserts selectors", async () => {
  await goto("#settings/appearance/css");
  const box = page.getByLabel("Custom CSS", { exact: true });
  await box.fill('[data-part="page-title"] { letter-spacing: 0.08em; }\nbody { background-image: url(https://evil.example/t.png); }');
  await pageEl().getByRole("button", { name: "Apply", exact: true }).click();
  await waitFor(() => document.querySelector(".ds-status")?.textContent.includes("Removed for safety"));
  const spacing = await page.locator('[data-part="page-title"]').evaluate((n) => getComputedStyle(n).letterSpacing);
  assert(spacing !== "normal" && parseFloat(spacing) > 1, `a plain selector wins: ${spacing}`);
  assert(!(await look()).css.includes("evil.example"), "outside link gone");
  await page.locator(".lx-parts > summary").click();
  await page.getByLabel("Filter parts").fill("tile");
  // Filtered: only the parts whose name or what it is says "tile" (Arrange's tile, a book's, the skill and stat tiles,
  // the topics…), far fewer than all of them.
  const shown = await page.locator(".lx-parts-list .lx-row-item:not([hidden])").evaluateAll((rows) => rows.map((r) => r.textContent.toLowerCase()));
  const visible = await page.locator(".lx-parts-list .lx-row-item:not([hidden]) .lx-row-title").allTextContents();
  const all = await page.locator(".lx-parts-list .lx-row-item").count();
  assert(visible.includes("tile") && shown.every((text) => text.includes("tile")) && visible.length < all / 4, `filtered: ${visible} of ${all}`);
  await page.locator(".lx-parts-list .lx-row-item:not([hidden])", { hasText: /^tile/ }).first().locator('[data-part="list-row"]').click();
  assert((await box.inputValue()).includes('[data-part="tile"] {'), "the selector went in");
  await shot("05-css");
  return (await status().textContent()).trim();
});

await stage("custom CSS that hides the app is undone at once", async () => {
  const box = page.getByLabel("Custom CSS", { exact: true });
  const before = (await look()).css;
  for (const [rule, reason] of [
    ['[data-part="app-header"] { display: none; }', "hid the header"],
    ['[data-part="page"] { opacity: 0; }', "hid the page"],
    ['textarea { visibility: hidden; }', "hid the CSS editor"],
  ]) {
    await box.fill(rule);
    await pageEl().getByRole("button", { name: "Apply", exact: true }).click();
    await waitFor((r) => document.querySelector(".ds-status")?.textContent.includes(r), reason);
    assert((await look()).css === before, `${reason}: the CSS stays as it was`);
    assert(await page.locator('[data-part="app-header"]').isVisible(), "the header still shows");
  }
  const toast = await page.locator('.lx-toasts [data-part="toast"]').textContent();
  assert(toast.includes("so it was undone"), `a toast says so: ${toast}`);
  await shot("06-css-undone");
  return toast.trim();
});

await stage("images: a big photo is scaled to fit; fit, dim and blur; the logo; your own slots", async () => {
  await goto("#settings/appearance/images");
  const backgroundRow = pageEl().locator(".lx-image-row").first();
  await backgroundRow.locator('input[type="file"]').setInputFiles(files.photo);
  await waitFor(() => document.querySelector(".ds-status")?.textContent.includes("Scaled down"), null, 30_000);
  const meta = (await look()).images.background;
  assert(meta && meta.size <= 4_000_000 && meta.type !== "image/png", `scaled and re-encoded: ${JSON.stringify(meta)}`);
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--image-background").startsWith('url("blob:'));
  const choose = (title, option) => pageEl().locator(".lx-row-choice", { hasText: title }).getByRole("button", { name: option, exact: true }).click();
  await choose("Fit", "Tile");
  await choose("Dim", "Strong");
  await choose("Blur", "Soft");
  const layer = await page.evaluate(() => {
    const s = getComputedStyle(document.body, "::before");
    // Two layers: the dimming veil, then the image.
    return { repeat: s.backgroundRepeat.split(",").map((v) => v.trim()), size: s.backgroundSize, filter: s.filter, image: s.backgroundImage.slice(0, 60) };
  });
  assert(layer.repeat[1] === "repeat" && layer.filter.includes("blur(6px)") && layer.image.includes("linear-gradient"), JSON.stringify(layer));
  assert((await css("--image-background-dim")) === "80%", "dim");
  // The logo.
  await pageEl().locator(".lx-image-row").nth(1).locator('input[type="file"]').setInputFiles(files.mark);
  await waitFor(() => document.documentElement.hasAttribute("data-has-mark"));
  // Your own image, named.
  await page.getByLabel("New image name").fill("paper");
  await pageEl().locator(".lx-image-add input[type=file]").setInputFiles(files.paper);
  await waitFor(() => [...document.querySelectorAll(".lx-image-row .lx-row-title")].some((n) => n.textContent === "--image-paper"));
  assert(!(await pageEl().evaluate((n) => /\b(null|undefined)\b/.test(n.innerText))), 'the Images page shows "null" or "undefined" text');
  assert((await css("--image-paper")).startsWith('url("blob:'), "--image-paper is set");
  await shot("07-images");
  await goto("#study");
  assert(await page.locator('[data-part="app-mark"]').isVisible(), "the logo shows in the header");
  await shot("08-study-with-background");
  return { background: `${meta.type}, ${Math.round(meta.size / 1000)} KB`, layer };
});

let exported = null;
let themeId = null;
await stage("your themes: rename, export a theme file, import it as a new theme, duplicate, delete with Undo, clear with Undo", async () => {
  await goto("#settings/appearance/themes");
  assert((await pageEl().locator(".lx-theme-list .lx-row-title").allTextContents()).join() === "Graphite, edited", "one theme so far");
  await pageEl().locator(".lx-theme-list [data-part=list-row]").first().click();
  await waitFor(() => /^#settings\/appearance\/themes\/[a-z0-9]+$/.test(location.hash));
  themeId = (await inUse()).id;
  await page.getByLabel("Theme name").fill("Theme check");
  await page.getByLabel("Theme name").press("Tab");
  await waitFor(() => document.querySelector('[data-part="page-title"]')?.textContent === "Theme check");
  assert((await inUse()).name === "Theme check", "renamed");
  await shot("09a-theme-page");
  const [download] = await Promise.all([page.waitForEvent("download"), row("Export a theme file").click()]);
  exported = join(OUT, download.suggestedFilename());
  await download.saveAs(exported);
  const file = JSON.parse(readFileSync(exported, "utf8"));
  assert(file.format === "lexicommons-theme" && file.name === "Theme check" && file.base === "graphite", `the file: ${file.name} on ${file.base}`);
  assert(file.images.background?.startsWith("data:image/") && file.images.paper && file.images.mark, "the images are in the file");
  // Importing it adds a new theme and puts it in use; the one it came from stays.
  await goto("#settings/appearance/themes");
  await pageEl().locator('input[type="file"][accept*="json"]').setInputFiles(exported);
  await pageEl().getByRole("button", { name: "Add and use it" }).click();
  await until(async () => (await import("/js/lx/theme.js")).themeInUse().name === "Theme check 2");
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--image-paper").startsWith('url("blob:'));
  const imported = await inUse();
  assert(imported.id !== themeId && (await yourThemes()).join() === "Theme check,Theme check 2", `two themes now: ${await yourThemes()}`);
  // Switching back from the swatch, with Undo on the toast.
  await goto("#settings/appearance");
  await yourSwatch("Theme check").click();
  await waitFor(() => document.querySelector('.lx-toasts [data-part="toast"]')?.textContent.includes("Now using Theme check"));
  assert((await inUse()).id === themeId, "back on Theme check");
  await shot("09b-yours-two");
  // Duplicate, then delete the copy: Undo brings it back; delete it again for good.
  await goto(`#settings/appearance/themes/${imported.id}`);
  await row("Duplicate").click();
  await waitFor(() => document.querySelector('[data-part="page-title"]')?.textContent === "Theme check 2 copy");
  const copyId = await page.evaluate(() => location.hash.split("/").pop());
  await row("Delete this theme").click();
  await row("Press again to delete it").click();
  await waitFor(() => location.hash === "#settings/appearance/themes" && document.querySelector('.lx-toasts [data-part="toast"]')?.textContent.includes("Deleted Theme check 2 copy"));
  assert(!(await yourThemes()).includes("Theme check 2 copy"), "deleted");
  await page.locator(".lx-toasts").getByRole("button", { name: "Undo" }).click();
  await until(async () => (await import("/js/lx/theme.js")).themes().some((t) => t.name === "Theme check 2 copy"));
  await goto(`#settings/appearance/themes/${(await page.evaluate(async () => (await import("/js/lx/theme.js")).themes().find((t) => t.name === "Theme check 2 copy").id))}`);
  await row("Delete this theme").click();
  await row("Press again to delete it").click();
  await waitFor(() => location.hash === "#settings/appearance/themes");
  // Clearing the theme in use: it stays a theme of yours, and Undo brings its changes back.
  await goto(`#settings/appearance/themes/${themeId}`);
  await row("Clear its colors, CSS and images").click();
  await row("Press again to clear them").click();
  await until(async () => {
    const t = await import("/js/lx/theme.js");
    const l = t.getSettings().look;
    return t.themeInUse().name === "Theme check" && !Object.keys(l.tokens).length && !Object.keys(l.images).length;
  });
  await page.locator(".lx-toasts").getByRole("button", { name: "Undo" }).click();
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--image-background").startsWith('url("blob:'));
  assert((await look()).tokens["--canvas"] === "#0e1116", "its colors are back");
  return { themes: await yourThemes(), file: `${download.suggestedFilename()}, ${Math.round(readFileSync(exported).length / 1000)} KB` };
});

await stage("recent looks: each replaced look is kept, switches too, and can be restored", async () => {
  await goto("#settings/appearance/themes");
  await waitFor(() => document.querySelectorAll(".lx-recent-looks .lx-row-title").length > 3, null, 5000);
  const titles = await page.locator(".lx-recent-looks .lx-row-title").allTextContents();
  assert(titles.some((t) => t === "Before switching to Theme check") && titles.some((t) => t === "Before importing Theme check 2"), `titles: ${titles}`);
  // The look before switching back to Theme check was Theme check 2: restoring it puts that theme in use.
  const index = titles.indexOf("Before switching to Theme check");
  await page.locator(".lx-recent-looks > li").nth(index).getByRole("button", { name: "Restore" }).click();
  await until(async () => (await import("/js/lx/theme.js")).themeInUse().name === "Theme check 2");
  await shot("09-recent-looks");
  // And back, from the top of the list.
  await page.locator(".lx-recent-looks > li").first().getByRole("button", { name: "Restore" }).click();
  await until(async () => (await import("/js/lx/theme.js")).themeInUse().name === "Theme check");
  await waitFor(() => document.documentElement.hasAttribute("data-has-mark"));
  return titles.slice(0, 6);
});

let synced = null;
await stage("the look goes to the account: the server has what this device shows", async () => {
  await until(async () => {
    const server = await (await fetch("/api/look")).json();
    const { sameLook } = await import("/js/lx/look-rules.js");
    const { currentLook } = await import("/js/lx/theme.js");
    return server.rev > 0 && sameLook(server.look, currentLook());
  }, null, 20_000).catch(async (error) => {
    const both = await page.evaluate(async () => ({ server: (await (await fetch("/api/look")).json()).look, here: (await import("/js/lx/theme.js")).currentLook() }));
    throw new Error(`the account's look isn't this device's: ${JSON.stringify(both).slice(0, 400)}`);
  });
  synced = await page.evaluate(async () => (await (await fetch("/api/look")).json()));
  const images = Object.keys(synced.look.images);
  if (!(images.includes("background") && images.includes("mark") && images.includes("paper"))) {
    const detail = await page.evaluate(async () => {
      const t = await import("/js/lx/theme.js");
      const s = await import("/js/lx/look-sync.js");
      return {
        device: Object.keys(t.getSettings().look.images),
        recent: (await t.getHistory()).map((e) => `${e.kind}[${Object.keys(e.look.images).join("+")}]`),
        sync: s.getSyncStatus(),
        synced: JSON.parse(localStorage.getItem("lx.look-sync.v1") ?? "null")?.rev,
      };
    });
    throw new Error(`images on the server: ${images}; ${JSON.stringify(detail)}`);
  }
  const served = await page.evaluate(async (hash) => {
    const r = await fetch(`/api/look/images/${hash}`);
    return { status: r.status, type: r.headers.get("content-type"), csp: r.headers.get("content-security-policy") };
  }, synced.look.images.background.hash);
  assert(served.status === 200 && served.csp.includes("sandbox"), JSON.stringify(served));
  // The themes are on the account too: the two of yours. The copy was deleted within a second of being made, so it
  // either never reached the account (a theme made and deleted between rounds is never sent) or is kept as deleted.
  const accountThemes = () => page.evaluate(async () => (await (await fetch("/api/themes")).json()).themes.map((t) => `${t.look.name}${t.deletedAt ? " (deleted)" : ""}`));
  await until(async () => {
    const { themes } = await (await fetch("/api/themes")).json();
    const live = themes.filter((t) => !t.deletedAt).map((t) => t.look.name).sort().join();
    return live === "Theme check,Theme check 2";
  }, null, 20_000).catch(async (error) => {
    throw new Error(`${error.message.split(":")[0]}; the account has ${JSON.stringify(await accountThemes())}`);
  });
  const library = await accountThemes();
  assert(synced.look.theme === themeId, `the account's look is Theme check: ${synced.look.theme}`);
  return { rev: synced.rev, images, served, library };
});

await stage("your AI changes the look over MCP: the app applies it within seconds, with Undo, and reports back", async () => {
  token = await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "theme check" }) })).json()).token);
  assert(token?.startsWith("lct_"), "a personal token");
  // As the AI section's page does on making one: the device learns it has an AI (shell/layout.js), which sets its polls' pace.
  for (const p of [page]) {
    await p.evaluate(async () => {
      const { whoAmI } = await import("/js/shell/api.js");
      const { setAiConnected } = await import("/js/shell/layout.js");
      setAiConnected((await whoAmI()).aiConnected);
    });
  }
  const guide = await mcp("get_theming_guide");
  assert(guide.parts.length > 70 && guide.tokens.find((t) => t.name === "--canvas")?.values.paper === "#fdfdfc", "the guide has parts and each theme's values");
  const before = await mcp("get_look");
  assert(before.rev === synced.rev || before.rev > 0, `get_look reads the device's look: rev ${before.rev}`);
  await goto("#study");
  const changed = await mcp("update_look", { tokens: { "--m-right": "#2f7fe0", "--well": "#161b22" }, css: `${before.look.css}\n[data-part="study-door"] { border-width: 3px; }`, expected_rev: before.rev });
  const started = Date.now();
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--m-right").trim() === "#2f7fe0", null, 15_000);
  const seconds = (Date.now() - started) / 1000;
  const toast = await page.locator('.lx-toasts [data-part="toast"]').textContent();
  assert(/changed your look/.test(toast), `toast: ${toast}`);
  await shot("10-ai-changed-look");
  // The device reports the revision it applied: this one, or a later one if it merged its own unsent changes in.
  let report = null;
  for (let i = 0; i < 20 && !report; i++) {
    const now = await mcp("get_look");
    if (typeof now.lastApplied === "object" && now.lastApplied.rev >= changed.rev) report = now.lastApplied;
    else await new Promise((r) => setTimeout(r, 500));
  }
  assert(report, "the device reported the revision");
  const after = await mcp("get_look");
  assert(after.look.tokens["--m-right"] === "#2f7fe0" && after.look.tokens["--well"] === "#161b22", "the AI's change is in the account's look");
  return { rev: changed.rev, appliedAfter: `${seconds.toFixed(1)} s`, toast: toast.trim(), report };
});

await stage("Undo on your AI's change puts the look back, here and on the account", async () => {
  await mcp("update_look", { tokens: { "--m-slipping": "#d4a017" } });
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--m-slipping").trim() === "#d4a017");
  await page.locator(".lx-toasts").getByRole("button", { name: "Undo" }).click();
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--m-slipping").trim() !== "#d4a017");
  let server = null;
  for (let i = 0; i < 30; i++) {
    server = await mcp("get_look");
    if (!server.look.tokens["--m-slipping"] && server.changedBy === "device") break;
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(!server.look.tokens["--m-slipping"] && server.changedBy === "device", `the account follows the undo: ${JSON.stringify(server.look.tokens)} by ${server.changedBy}`);
  return `rev ${server.rev}, changed by the device`;
});

await stage("an image from your AI lands in its slot and shows", async () => {
  const ticket = await mcp("request_look_image_upload", { slot: "mark", content_type: "image/png", filename: "ai-mark.png" });
  const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: readFileSync(files.tile) });
  const landed = await put.json();
  assert(put.ok && landed.slot === "mark" && landed.lookRev > 0, JSON.stringify(landed));
  await until(() => import("/js/lx/theme.js").then((t) => t.getSettings().look.images.mark?.name === "ai-mark.png"), null, 15_000);
  assert(await page.locator('[data-part="app-mark"]').isVisible(), "the new logo shows");
  const seen = await mcp("get_look");
  return { rev: landed.lookRev, mark: seen.look.images.mark };
});

await stage("a look from your AI that hides the app is undone on the device, and the AI is told why", async () => {
  const broken = await mcp("update_look", { css: '[data-part="tab-bar"] { display: none !important; }' });
  await waitFor(() => document.querySelector(".lx-toasts")?.textContent.includes("so it was undone"), null, 15_000);
  assert(await page.locator('[data-part="tab-bar"]').isVisible(), "the tabs still show");
  let report = null;
  for (let i = 0; i < 20 && !report; i++) {
    const now = await mcp("get_look");
    if (typeof now.lastApplied === "object" && now.lastApplied.rev === broken.rev && now.lastApplied.undone) report = now.lastApplied;
    else await new Promise((r) => setTimeout(r, 500));
  }
  assert(report?.undone.includes("hid the tabs"), `get_look says why: ${JSON.stringify(report)}`);
  await shot("11-ai-look-undone");
  // The AI puts it right by restoring the revision before.
  const history = await mcp("list_look_history", { limit: 3 });
  const restored = await mcp("restore_look", { rev: history[1].rev });
  await waitFor((css) => getComputedStyle(document.querySelector('[data-part="study-door"]')).borderTopWidth === "3px", null, 15_000);
  return { undone: report.undone, restoredAs: restored.rev };
});

let themeCheckOnServer = null;
await stage("your AI's themes: list them, a new look as a new theme (yours untouched), a change to a built-in theme, switch back", async () => {
  const listed = await mcp("list_themes");
  assert(listed.inUse.kind === "yours" && listed.inUse.name === "Theme check", `in use: ${JSON.stringify(listed.inUse)}`);
  assert(listed.yours.map((t) => t.name).sort().join() === "Theme check,Theme check 2" && listed.builtIn.length === 5, JSON.stringify(listed.yours.map((t) => t.name)));
  const before = await page.evaluate(async (id) => (await (await fetch("/api/themes")).json()).themes.find((t) => t.id === id), themeId);
  // A new look: create_theme, then build it. The app switches within seconds.
  await goto("#study");
  const made = await mcp("create_theme", { name: "Ocean", from: "blank", base: "graphite" });
  await mcp("update_look", { tokens: { "--canvas": "#0b2a3a", "--m-right": "#4fb3ff" } });
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim() === "#0b2a3a", null, 15_000);
  assert((await inUse()).name === "Ocean" && (await inUse()).id === made.id, "Ocean is in use here");
  await shot("11b-ai-new-theme");
  const after = await page.evaluate(async (id) => (await (await fetch("/api/themes")).json()).themes.find((t) => t.id === id), themeId);
  assert(JSON.stringify(after.look) === JSON.stringify(before.look) && after.rev === before.rev, "Theme check is exactly as it was");
  // On a built-in theme, a change starts a theme of theirs.
  await mcp("use_theme", { theme: "paper" });
  await waitFor(() => document.documentElement.dataset.theme === "paper" && getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim() !== "#0b2a3a", null, 15_000);
  const edited = await mcp("update_look", { tokens: { "--m-right": "#1166cc" } });
  assert(edited.startedTheme && edited.theme.name === "Paper, edited", JSON.stringify(edited.theme));
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--m-right").trim() === "#1166cc", null, 15_000);
  assert((await inUse()).name === "Paper, edited", "Paper, edited is in use here");
  // Back to Theme check by name, images and all.
  await mcp("use_theme", { theme: "Theme check" });
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim() === "#0e1116" && document.documentElement.hasAttribute("data-has-mark"), null, 15_000);
  const yours = (await mcp("list_themes")).yours.map((t) => t.name).sort();
  assert(yours.join() === "Ocean,Paper, edited,Theme check,Theme check 2", `four themes: ${yours}`);
  themeCheckOnServer = after;
  return { made: made.name, started: edited.theme.name, yours };
});

await stage("each section can have its own background: Settings, MCP, sessions, and a fade that never gets in the way", async () => {
  // What the page's background layer draws, and the blob: URL of an image slot.
  const layer = (p = page) => p.evaluate(() => {
    const s = getComputedStyle(document.body, "::before");
    return { image: s.backgroundImage, size: s.backgroundSize, repeat: s.backgroundRepeat };
  });
  const slotUrl = async (slot) => /url\("([^"]+)"\)/.exec(await css(`--image-${slot}`))?.[1] ?? null;
  const section = () => page.evaluate(() => document.documentElement.getAttribute("data-section"));

  // Settings → Images lists every section; Read's own page previews Read's background behind it.
  await goto("#settings/appearance/images");
  const sectionRows = pageEl().locator(".lx-section-row");
  assert((await sectionRows.count()) === 7, `7 sections listed, not ${await sectionRows.count()}`);
  assert((await sectionRows.first().locator(".lx-row-sub").textContent()) === "Same as the background", "a section without its own shows the background");
  await sectionRows.filter({ hasText: "Read" }).click();
  await waitFor(() => location.hash === "#settings/appearance/images/read" && document.documentElement.getAttribute("data-section") === "read");
  const placement = pageEl().locator(".lx-row-choice");
  assert((await placement.filter({ visible: true }).count()) === 0, "no fit or dim until it has an image");
  await pageEl().locator(".lx-image-row input[type=file]").setInputFiles(files.read);
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--image-background-read").startsWith('url("blob:'));
  const choose = (title, option) => pageEl().locator(".lx-row-choice", { hasText: title }).getByRole("button", { name: option, exact: true }).click();
  assert((await pageEl().locator(".lx-row-choice", { hasText: "Fit" }).getByRole("button", { name: "Same", exact: true }).getAttribute("aria-pressed")) === "true", "Same to start with");
  await choose("Fit", "Fill the screen");
  await choose("Dim", "Medium");
  let tokens = (await look()).tokens;
  assert(tokens["--image-background-read-size"] === "cover" && tokens["--image-background-read-repeat"] === "no-repeat" && tokens["--image-background-read-dim"] === "60%", JSON.stringify(tokens));
  const readUrl = await slotUrl("background-read");
  assert((await layer()).image.includes(readUrl), "the page behind Read's settings shows Read's background");
  await shot("12-section-read-settings");
  await page.getByRole("link", { name: "Images" }).first().click();
  await waitFor(() => document.documentElement.getAttribute("data-section") === "settings");
  assert((await sectionRows.filter({ hasText: "Read" }).locator(".lx-row-sub").textContent()).startsWith("Its own"), "Read's row says it has its own");

  // Each route shows its section's background.
  await goto("#read");
  assert((await section()) === "read", "data-section follows the route");
  let now = await layer();
  assert(now.image.includes(readUrl) && now.size.split(",")[1].trim() === "cover", `Read: ${JSON.stringify(now)}`);
  await shot("13-read-own-background");
  await goto("#today");
  const mainUrl = await slotUrl("background");
  now = await layer();
  assert(now.image.includes(mainUrl) && !now.image.includes(readUrl), "Today shows the main background");

  // Changing section fades the old background out: the pointer passes through it, and a press finishes it. Slowed
  // to 3 s (inline, so the look itself doesn't change) so the check can't miss it.
  await page.evaluate(async () => {
    document.documentElement.style.setProperty("--dur-320", "3000ms");
    (await import("/js/lx/theme.js")).setPreset("motion", "on");
  });
  await page.locator('[data-part="page"] a[href="#read"]').first().click(); // Home's Read row: Read has no tab
  await waitFor(() => document.documentElement.getAttribute("data-section") === "read");
  const fade = await page.evaluate(() => {
    const node = document.querySelector(".lx-backdrop-fade");
    if (!node) return null;
    node.setAttribute("data-check-first", "");
    const style = getComputedStyle(node);
    return { pointerEvents: style.pointerEvents, opacity: Number(style.opacity), image: style.backgroundImage.includes("blob:"), underThePage: document.elementFromPoint(innerWidth / 2, innerHeight / 2) !== node };
  });
  assert(fade && fade.pointerEvents === "none" && fade.underThePage && fade.image, `the old background lies over the new one, out of the pointer's way: ${JSON.stringify(fade)}`);
  // It fades (from its first frame, at full opacity).
  await waitFor(() => Number(getComputedStyle(document.querySelector("[data-check-first]") ?? document.body).opacity) < 0.95, null, 2500);
  await page.locator('[data-part="tab-bar"] a[href="#today"]').click();
  await waitFor(() => document.documentElement.getAttribute("data-section") === "today");
  assert(!(await page.evaluate(() => document.querySelector("[data-check-first]"))), "a press finishes the running fade");
  await page.mouse.click(5, 300);
  await waitFor(() => !document.querySelector(".lx-backdrop-fade"), null, 2000);
  await page.evaluate(async () => (await import("/js/lx/theme.js")).setPreset("motion", "off"));
  await page.locator('[data-part="page"] a[href="#read"]').first().click(); // Home's Read row: Read has no tab
  await waitFor(() => document.documentElement.getAttribute("data-section") === "read");
  assert((await page.evaluate(() => document.querySelectorAll(".lx-backdrop-fade").length)) === 0, "animations off: no fade");
  await page.evaluate(async () => {
    document.documentElement.style.removeProperty("--dur-320");
    (await import("/js/lx/theme.js")).setPreset("motion", "system");
  });

  // Your AI fills a section over MCP; a slot named like a setting is refused.
  const guide = await mcp("get_theming_guide");
  assert(guide.sections?.names?.know === "Know" && guide.imageSlots["background-session"], "the guide describes sections");
  let refused = null;
  try {
    await mcp("request_look_image_upload", { slot: "background-know-dim", content_type: "image/png", filename: "x.png" });
  } catch (error) {
    refused = error.message;
  }
  assert(refused, "a slot named like a setting token is refused");
  for (const [slot, file] of [["background-know", files.know], ["background-study", files.study]]) {
    const ticket = await mcp("request_look_image_upload", { slot, content_type: "image/png", filename: `${slot}.png` });
    const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: readFileSync(file) });
    assert(put.ok && (await put.json()).slot === slot, `${slot} uploaded`);
  }
  await until(() => import("/js/lx/theme.js").then((t) => Boolean(t.getSettings().look.images["background-know"] && t.getSettings().look.images["background-study"])), null, 15_000);
  await goto("#know");
  const knowUrl = await slotUrl("background-know");
  const knowLayer = (await layer()).image;
  assert(knowUrl && knowLayer.includes(knowUrl), `Know shows the image your AI put there: ${JSON.stringify({ hash: await page.evaluate(() => location.hash), section: await section(), url: knowUrl, layer: knowLayer.slice(0, 160) })}`);

  // A study session shows Study's background, until it has its own; Study's page stays Study's under it.
  const studyUrl = await slotUrl("background-study");
  const sessionLayer = () => page.evaluate(() => getComputedStyle(document.querySelector('[data-part="session"]'), "::before").backgroundImage);
  await goto("#study/session/quick");
  await page.waitForSelector('[data-part="session"]');
  assert((await sessionLayer()).includes(studyUrl), "a session without its own shows Study's");
  assert((await section()) === "study", "the page under a session is Study");
  await goto("#settings/appearance/images/session");
  assert((await section()) === "session", "the session's settings page previews it");
  await pageEl().locator(".lx-image-row input[type=file]").setInputFiles(files.session);
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--image-background-session").startsWith('url("blob:'));
  const sessionUrl = await slotUrl("background-session");
  assert((await layer()).image.includes(sessionUrl), "the preview shows the session's own");
  await goto("#study/session/quick");
  await page.waitForSelector('[data-part="session"]');
  assert((await sessionLayer()).includes(sessionUrl), "a session with its own shows it");
  await shot("14-session-own-background");
  assert((await layer()).image.includes(studyUrl), "Study under it keeps Study's");

  // The Appearance menu counts them; removing Read's image takes its settings with it.
  await goto("#settings/appearance/edit");
  const imagesValue = await row("Images").locator(".lx-row-value").textContent();
  assert(/4 sections/.test(imagesValue), `the Images row counts sections: ${imagesValue}`);
  await goto("#settings/appearance/images/read");
  await pageEl().getByRole("button", { name: "Remove Image" }).click();
  await waitFor(() => !getComputedStyle(document.documentElement).getPropertyValue("--image-background-read"));
  tokens = (await look()).tokens;
  assert(!Object.keys(tokens).some((name) => name.startsWith("--image-background-read-")), `Read's settings went with it: ${Object.keys(tokens)}`);
  assert((await noSidewaysScroll()) <= 0, "the section page fits a phone");
  return { slots: Object.keys((await look()).images), imagesRow: imagesValue, fade };
});

let page2 = null;
await stage("a second device takes the account's look, images included, and its changes come back", async () => {
  const context2 = await browser.newContext({ viewport: { width: 1280, height: 860 }, storageState: { cookies: await context.cookies(), origins: [] } });
  page2 = await context2.newPage();
  watch(page2, "device 2");
  await page2.goto(`${BASE}/app/#today`);
  await page2.waitForSelector("html[data-app-ready]");
  await waitFor(() => document.documentElement.hasAttribute("data-has-mark") && getComputedStyle(document.documentElement).getPropertyValue("--m-right").trim() === "#2f7fe0", null, 20_000, page2);
  assert((await css("--image-background", page2)).startsWith('url("blob:'), "device 2 has the background");
  await shot("12-second-device", page2);
  await page2.goto(`${BASE}/app/#settings/appearance/colors`);
  await page2.waitForSelector("html[data-app-ready]");
  const field = page2.getByLabel("Sheets, notices and the wide-screen sidebar (--chrome)", { exact: true });
  await field.fill("#1d2430");
  await field.press("Enter");
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--chrome").trim() === "#1d2430", null, 20_000);
  return "device 2 matched, and its change reached device 1";
});

await stage("two devices changing different things at once both keep their change", async () => {
  const set = (p, name, value) =>
    p.evaluate(async ([n, v]) => {
      const theme = await import("/js/lx/theme.js");
      theme.setToken(n, v);
    }, [name, value]);
  await Promise.all([set(page, "--fill", "#20262e"), set(page2, "--hair", "rgba(200, 210, 230, 0.12)")]);
  const both = () => getComputedStyle(document.documentElement).getPropertyValue("--fill").trim() === "#20262e" && getComputedStyle(document.documentElement).getPropertyValue("--hair").trim() === "rgba(200, 210, 230, 0.12)";
  await waitFor(both, null, 30_000);
  await waitFor(both, null, 30_000, page2);
  const server = await mcp("get_look");
  assert(server.look.tokens["--fill"] === "#20262e" && server.look.tokens["--hair"] === "rgba(200, 210, 230, 0.12)", "the account has both");
  return `both devices and the account have both changes (rev ${server.rev})`;
});

await stage("a switch on one device is followed on the other; a theme changed and left while offline keeps its change", async () => {
  // Device 2 switches to Ocean; device 1 follows.
  await page2.goto(`${BASE}/app/#settings/appearance`);
  await page2.waitForSelector("html[data-app-ready]");
  await waitFor(() => document.querySelector('[data-part="theme-swatch"][data-variant="yours"]'), null, 15_000, page2);
  await yourSwatch("Ocean", page2).click();
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim() === "#0b2a3a", null, 20_000);
  assert((await inUse()).name === "Ocean", "device 1 follows the switch");
  // Offline, device 2 changes Ocean and switches to Theme check; back online, both reach the account.
  offlineOnPurpose = true;
  await page2.context().setOffline(true);
  await page2.evaluate(async (id) => {
    const t = await import("/js/lx/theme.js");
    t.setToken("--ink-2", "#abcdef");
    await t.useTheme(id);
  }, themeId);
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim() === "#0e1116", null, 5000, page2);
  await page2.context().setOffline(false);
  offlineOnPurpose = false;
  await page2.evaluate(() => dispatchEvent(new Event("online")));
  let ocean = null;
  await until(async () => {
    const { themes } = await (await fetch("/api/themes")).json();
    const o = themes.find((t) => t.look.name === "Ocean");
    const look = await (await fetch("/api/look")).json();
    return o?.look.tokens["--ink-2"] === "#abcdef" && look.look.theme && look.look.name === "Theme check";
  }, null, 30_000);
  ocean = await page.evaluate(async () => (await (await fetch("/api/themes")).json()).themes.find((t) => t.look.name === "Ocean").look.tokens);
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim() === "#0e1116", null, 20_000);
  assert((await inUse()).name === "Theme check", "device 1 follows back to Theme check");
  // An app from before saved themes sends its whole look with no theme: it lands in the theme in use.
  const legacy = await page.evaluate(async () => {
    const now = await (await fetch("/api/look")).json();
    const { theme: _theme, ...old } = now.look;
    const sent = await fetch("/api/look", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseRev: now.rev, look: { ...old, tokens: { ...old.tokens, "--ink-4": "#778899" } } }) });
    const answer = await sent.json();
    const after = await (await fetch("/api/look")).json();
    const { themes } = await (await fetch("/api/themes")).json();
    return { result: answer.result, theme: after.look.theme, kept: now.look.theme, token: themes.find((t) => t.id === now.look.theme)?.look.tokens["--ink-4"] };
  });
  assert(legacy.result === "saved" && legacy.theme === legacy.kept && legacy.token === "#778899", JSON.stringify(legacy));
  await waitFor(() => getComputedStyle(document.documentElement).getPropertyValue("--ink-4").trim() === "#778899", null, 15_000);
  return { followed: "Ocean, then Theme check", oceanKeptOffline: ocean["--ink-2"], legacy };
});

await stage("safe mode: the look is off, with a way back", async () => {
  await page.goto(`${BASE}/app/?safe#study`);
  await page.waitForSelector("html[data-app-ready]");
  assert(await page.locator(".lx-safe-banner").isVisible(), "the banner");
  assert((await css("--m-right")) === "#5ab0f0", `the theme's own colors: ${await css("--m-right")}`);
  assert(!(await page.evaluate(() => document.documentElement.hasAttribute("data-has-mark"))), "no logo");
  await shot("13-safe-mode");
  await page.locator(".lx-safe-banner").getByRole("link", { name: "Leave safe mode" }).click();
  await page.waitForSelector("html[data-app-ready]");
  await waitFor(() => !location.search.includes("safe") && getComputedStyle(document.documentElement).getPropertyValue("--m-right").trim() === "#2f7fe0");
  return "banner, theme's colors, back with one press";
});

await stage("delete the account: its look goes with it", async () => {
  const before = await page.evaluate(async () => (await (await fetch("/api/look")).json()).rev);
  await goto("#settings/account");
  await row("Delete my account").click();
  await row("Press again to delete it for good").click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  const left = await page.evaluate(async () => {
    const theme = await import("/js/lx/theme.js");
    await theme.initTheme();
    return { history: (await theme.getHistory()).length, themes: theme.themes().length, keys: Object.keys(localStorage).filter((k) => k.startsWith("lx.")) };
  });
  assert(left.history === 0, `recent looks cleared: ${left.history}`);
  assert(left.themes === 0, `the themes on this device are gone: ${left.themes}`);
  return { revBefore: before, left };
});

await stage("no console errors", async () => {
  // After the delete, the second device's next check is a 401 by design.
  const real = problems.filter((p) => !/status of 401/.test(p));
  assert(real.length === 0, real.join(" | "));
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "theme-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems, syncLog }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
