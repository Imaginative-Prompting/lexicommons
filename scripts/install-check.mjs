// Add to Home Screen, end to end in headless Chrome on a LOCAL server (it creates and deletes a test account, so never
// point it at the live site), as each device and browser by their user agent (Chrome's override, with touch where the
// device has it): Today's row only on a phone that hasn't added it, once something's finished; Safari on iPhone's steps
// (Page Menu, Share, Open as Web App) and Back to Today; "Find your device's steps" (Samsung Internet's); Not now
// remembered; Android Chrome's steps; a computer with the browser's own install prompt (its button calls it, and Today
// shows no row); another app's browser; Settings → About's row; and the app already added (no row, says so).
// Screenshots of each in <outDir>/shots. Fails on any console error. Chrome runs muted: nothing is heard.
//
// Local server: see AGENTS.md (wrangler dev with --local-upstream and its own --persist-to).
// Usage (headless Chrome, so through the channel's GPU queue's parallel lane, from the channel repo root):
//   python3 pipelines/lyric-video/tools/gpu.py run --who lexicommons --label "install check" --kind parallel -- \
//     node 08-lexicommons/app/scripts/install-check.mjs http://localhost:<port> <outDir>

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { goRouted } from "./fixtures/routed.mjs";

const [BASE, outArg = "install-check-out"] = process.argv.slice(2);
const OUT = resolve(outArg);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("install-check creates and deletes an account: give it a local server, e.g. http://localhost:8824");
  process.exit(2);
}
mkdirSync(join(OUT, "shots"), { recursive: true });

const results = [];
const problems = [];
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
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

const settle = () => page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 }).catch(() => {});
const shot = async (name) => {
  await settle();
  await page.screenshot({ path: join(OUT, "shots", `${name}.png`) });
};

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  androidChrome: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 Instagram 400.0.0.27.79 (iPhone16,2; iOS 18_6; en_US; en; scale=3.00; 1290x2796; 812345678)",
  chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
};
// Becomes another device: its user agent, and touch where it has it; then the app starts again.
const become = async (ua, { touch }) => {
  await cdp.send("Emulation.setUserAgentOverride", { userAgent: ua });
  await cdp.send("Emulation.setTouchEmulationEnabled", touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
};
// Home from another tab's page starts the history afresh (shell/main.js), and an address set while it steps back could be taken back (v95:
// the next stage's page never opened). So Today is reached with goRouted, which waits until the router has settled there.
const keepGoing = async () => {
  await goRouted(page, BASE, "#today");
  await page.waitForSelector('[data-part="page"] [data-part="streak-summary"]');
  return page.locator('[data-part="page"] [data-part="home-card"][data-variant="install"]');
};
// Text nodes that are just "null" or "undefined" (an empty slot put in raw), on every page the check opens.
const strayText = [];
const stray = async (where) => {
  const found = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) if (/^\s*(null|undefined)\s*$/.test(node.textContent)) hits.push(node.parentElement?.getAttribute("data-part") ?? node.parentElement?.tagName);
    return hits;
  });
  for (const hit of found) strayText.push(`${where}: in ${hit}`);
};
const title = () => page.locator('[data-part="page"] [data-part="page-title"]').first().textContent();
const opened = async (hash, text) => {
  await page.waitForFunction(([h, t]) => location.hash.startsWith(h) && document.querySelector('[data-part="page"] [data-part="page-title"]')?.textContent === t, [hash, text]);
  await stray(hash);
};
const keys = () => page.locator('[data-part="page"] [data-part="install-key"]').allTextContents();

await stage("sign up with a passkey, land in the app", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Install Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]");
  return "signed in";
});

await stage("an iPhone in Safari, nothing finished yet: no row on Today", async () => {
  await become(UA.iphoneSafari, { touch: true });
  const row = await keepGoing();
  assert((await row.count()) === 0, "a row before anything's finished");
  return "none";
});

await stage("once something's finished, Today offers it; its steps are Safari's (Page Menu, Share, Open as Web App), Back to Today", async () => {
  await page.evaluate(async () => (await import("/js/study/done.js")).finishedSession());
  // Today draws its rows as it's shown: the app started again, as after a session.
  await page.reload();
  await page.waitForSelector("html[data-app-ready]");
  const row = await keepGoing();
  assert((await row.count()) === 1 && (await row.textContent()).includes("Add Lexicommons to your Home Screen"), `row: ${await row.textContent().catch(() => "none")}`);
  await row.scrollIntoViewIfNeeded();
  await shot("01-today-row-iphone");
  // The card is the way to the steps; its cross is Not now.
  await row.getByRole("link", { name: /Add Lexicommons to your Home Screen/ }).click();
  await opened("#settings/install", "Add to Home Screen");
  const label = await page.locator('[data-part="page"] [data-part="group-label"]').first().textContent();
  assert(label === "On iPhone or iPad, in Safari", `heading: ${label}`);
  const k = await keys();
  assert(k.includes("Page Menu") && k.includes("Share") && k.includes("Add to Home Screen"), `keys: ${k}`);
  assert((await page.locator('[data-part="page"]').textContent()).includes("Open as Web App"), "Open as Web App");
  assert((await page.locator('[data-part="app-back"]').getAttribute("href")) === "#today", "Back goes to Today");
  await shot("02-guide-iphone-safari");
  return `${label}: ${k.join(", ")}`;
});

await stage("Find your device's steps: Samsung Internet's, from the list", async () => {
  await page.locator('[data-part="page"] .lx-install-find > summary').click();
  const rows = await page.locator('[data-part="page"] .lx-install-find [data-part="list-row"]').allTextContents();
  assert(rows.length >= 10 && !rows.some((r) => r.startsWith("iPhone or iPad, Safari")), `rows: ${rows}`);
  await shot("03-find-your-device");
  await page.locator('[data-part="page"] .lx-install-find [data-part="list-row"]', { hasText: "Android, Samsung Internet" }).click();
  await opened("#settings/install/android-samsung", "On Android, in Samsung Internet");
  const steps = await page.locator('[data-part="page"] [data-part="install-step"]').allTextContents();
  assert(steps.some((s) => s.includes("Add page to")), `steps: ${steps}`);
  await shot("04-samsung-steps");
  return `${rows.length} devices listed; Samsung: ${steps.length} steps`;
});

await stage("Not now: the row goes, and stays gone after a restart", async () => {
  let row = await keepGoing();
  await row.getByRole("button", { name: "Not now" }).click();
  await page.waitForFunction(() => !document.querySelector('[data-part="page"] [data-part="home-card"][data-variant="install"]'));
  await page.reload();
  row = await keepGoing();
  assert((await row.count()) === 0, "back after a restart");
  await page.evaluate(() => localStorage.removeItem("lx.install.dismissed"));
  return "gone, and remembered";
});

await stage("Android, in Chrome without its own prompt: the menu's steps", async () => {
  await become(UA.androidChrome, { touch: true });
  const row = await keepGoing();
  assert((await row.count()) === 1, "no row on Android");
  await page.goto(`${BASE}/app/#settings/install`);
  await opened("#settings/install", "Add to Home Screen");
  const label = await page.locator('[data-part="page"] [data-part="group-label"]').first().textContent();
  const k = await keys();
  assert(label === "On Android, in Chrome" && k.includes("More") && k.includes("Install"), `${label}: ${k}`);
  await shot("05-guide-android-chrome");
  return `${label}: ${k.join(", ")}`;
});

await stage("another app's browser (Instagram): open it in the browser first", async () => {
  await become(UA.instagram, { touch: true });
  const row = await keepGoing();
  assert((await row.textContent()).includes("Open Lexicommons in your browser"), await row.textContent());
  await page.goto(`${BASE}/app/#settings/install`);
  await opened("#settings/install", "Add to Home Screen");
  const label = await page.locator('[data-part="page"] [data-part="group-label"]').first().textContent();
  assert(label === "In another app's browser", label);
  return label;
});

await stage("a computer with the browser's own install prompt: its button calls it; Today shows no row", async () => {
  await become(UA.chromeMac, { touch: false });
  const row = await keepGoing();
  assert((await row.count()) === 0, "a row on a computer");
  // Chrome's beforeinstallprompt, played: the app keeps the event (main.js) and the page's button calls its prompt().
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = () => (window.__prompted = true);
    event.userChoice = Promise.resolve({ outcome: "dismissed" });
    window.dispatchEvent(event);
  });
  await page.goto(`${BASE}/app/#settings/install`);
  await opened("#settings/install", "Add to Home Screen");
  await page.getByRole("button", { name: "Install Lexicommons" }).click();
  assert(await page.evaluate(() => window.__prompted === true), "the prompt wasn't called");
  const label = await page.locator('[data-part="page"] [data-part="group-label"]').first().textContent();
  assert(label === "Or by hand: on a computer, in Chrome", label);
  await shot("06-guide-desktop-prompt");
  return `button called the prompt; ${label}`;
});

await stage("Settings → About: Add to Home Screen opens the steps", async () => {
  await page.goto(`${BASE}/app/#settings/about`);
  await page.locator('[data-part="list-row"][href="#settings/install"]').click();
  await opened("#settings/install", "Add to Home Screen");
  assert((await page.locator('[data-part="app-back"]').getAttribute("href")) === "#settings/about", "Back goes to About");
  return "opened, Back to About";
});

await stage("already added (opened from the Home Screen): no row on Today, and the page says so", async () => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true }));
  await become(UA.iphoneSafari, { touch: true });
  const row = await keepGoing();
  assert((await row.count()) === 0, "a row in the installed app");
  await page.goto(`${BASE}/app/#settings/install`);
  await opened("#settings/install", "Add to Home Screen");
  assert((await page.locator('[data-part="page"] .lx-install-done').textContent()).includes("using Lexicommons as an app"), "says it's added");
  await page.goto(`${BASE}/app/#settings/about`);
  const value = await page.locator('[data-part="list-row"][href="#settings/install"] .lx-row-value').textContent();
  assert(value === "Added", value);
  return "no row; the page and About say it's added";
});

await stage("no stray \"null\" or \"undefined\" text on any page opened", async () => {
  assert(!strayText.length, strayText.slice(0, 5).join(" · "));
  return "none";
});

let problemsBeforeDelete = 0;
await stage("delete the account", async () => {
  problemsBeforeDelete = problems.length;
  await page.goto(`${BASE}/app/#settings/account`);
  const row = (text) => page.locator('[data-part="list-row"]', { has: page.locator(".lx-row-title", { hasText: new RegExp(`^${text}$`) }) }).first();
  await row("Delete my account").click();
  await row("Press again to delete it for good").click();
  await page.waitForURL(/\/login\?deleted=1/, { timeout: 15_000 });
  return "deleted";
});

await stage("no console errors", async () => {
  const after = problems.slice(problemsBeforeDelete).filter((p) => !/status of 401/.test(p));
  const real = [...problems.slice(0, problemsBeforeDelete), ...after];
  assert(real.length === 0, real.join(" | "));
  return "clean";
});

await browser.close();
writeFileSync(join(OUT, "install-check.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results, problems }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
