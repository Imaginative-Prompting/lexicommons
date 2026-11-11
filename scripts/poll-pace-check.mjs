// The pace of the app's two polls (lx/look-sync.js, study/pack-inbox.js), on a phone in Chrome, a new account on a local server:
// - with no AI connected, each asks once a minute while the app is in use (the count of GET /api/look and /api/packs/inbox in 75 s);
// - a look changed on another device of the account arrives within a minute, and at once when the app comes back into view (the
//   change made while it was hidden isn't there before that: only coming into view brings it);
// - your AI's new pack on a device that hasn't heard of the AI yet (a token made behind the app's back): within a minute, and at once
//   on coming into view;
// - two apps of the account started at the same moment, once a minute: each wait 54–66 s (lx/retry.js jittered), so their polls drift apart
//   and never stay in lockstep (the app from before waits a minute exactly: each of one app's waits matches the other's);
// - told of the AI as the AI section's page tells it (ai/connection.js: whoAmI, then setAiConnected), both go back to the AI's pace
//   (every 4 and 5 s): the control, which the quiet count above would fail.
// Coming into view is played by the page's own visibility (document.hidden and visibilityState stood in, then visibilitychange), as
// headless Chrome never hides a page. LOCAL only: it makes an account and deletes it.
//   node scripts/poll-pace-check.mjs http://localhost:<port> <outDir>   (through gpu.py's parallel lane; exit 0 = pass)

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "./quiet-browser.mjs";

const [BASE, OUT = "poll-pace-check-out"] = process.argv.slice(2);
if (!BASE || !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("poll-pace-check makes and deletes an account: give it a local server, e.g. http://localhost:8825");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
let other = null;

// Every poll each page makes, with when.
const polls = new Map();
function watch(p, who) {
  polls.set(p, []);
  p.on("request", (r) => {
    if (r.method() !== "GET") return;
    const path = new URL(r.url()).pathname;
    if (path === "/api/look" || path === "/api/packs/inbox") polls.get(p).push({ path, at: Date.now() });
  });
  p.on("console", (m) => m.type() === "error" && problems.push(`${who} console: ${m.text()}`));
  p.on("pageerror", (e) => problems.push(`${who} page error: ${e.message}`));
}
watch(page, "A");
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

/** The app in use for ms: a press every 5 s (the polls' idle clock counts presses). Returns each poll's count in that time. */
async function inUse(p, ms) {
  const from = Date.now();
  while (Date.now() - from < ms) {
    await p.evaluate(() => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    await sleep(Math.min(5000, ms - (Date.now() - from)));
  }
  const seen = polls.get(p).filter((x) => x.at >= from);
  return { look: seen.filter((x) => x.path === "/api/look").length, inbox: seen.filter((x) => x.path === "/api/packs/inbox").length };
}
/** The page hidden (true) or back in view (false), as a phone's app switcher would. */
const setHidden = (p, hidden) =>
  p.evaluate((hidden) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
const token = (p, name) => p.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), name);
/** Polls the page every 250 ms until test() holds; the ms it took, or throws past limit. */
async function within(limit, test, what) {
  const from = Date.now();
  while (Date.now() - from < limit) {
    if (await test()) return Date.now() - from;
    await sleep(250);
  }
  throw new Error(`${what}: not within ${limit / 1000} s`);
}

let aiToken = null;
async function tool(name, args = {}) {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${aiToken}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const text = await response.text();
  const line = text.split("\n").find((l) => l.startsWith("data: "));
  if (!line) throw new Error(`${name}: ${response.status} ${text.slice(0, 200)}`);
  const { result, error } = JSON.parse(line.slice(6));
  if (error || result.isError) throw new Error(`${name}: ${error?.message ?? result.content[0].text}`);
  return JSON.parse(result.content[0].text);
}
const packHere = (p, id) => p.evaluate(async (id) => Boolean((await import("/js/study/packs.js")).yourPack(id)), id);

await stage("sign up and land in the app, with no AI", async () => {
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Pace Check");
  await page.click('#register button[type="submit"]');
  await page.waitForURL(`${BASE}/app/`, { timeout: 20_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  const connected = await page.evaluate(async () => (await import("/js/shell/layout.js")).aiConnected());
  assert(connected === false, "a new account has no AI");
  // A start's own rounds (the first sync's packs each nudge the inbox) settle first.
  await sleep(15_000);
});

await stage("no AI connected: each poll once a minute while the app is in use", async () => {
  const counts = await inUse(page, 75_000);
  // A minute's pace makes 1 or 2 in 75 s; the AI's pace made ~18 and ~15.
  assert(counts.look >= 1 && counts.look <= 2 && counts.inbox >= 1 && counts.inbox <= 2, `in 75 s: ${JSON.stringify(counts)}`);
  return `in 75 s in use: look ${counts.look}, inbox ${counts.inbox}`;
});

await stage("two apps started together, once a minute: each wait 54–66 s, so their polls drift apart, never in lockstep", async () => {
  // A second device of the account (its own inbox and look state), started at the same moment as this one's reload.
  const state = await context.storageState();
  state.origins = state.origins.map((o) => ({ ...o, localStorage: o.localStorage.filter((e) => !["lx.pack-inbox.v1", "lx.text-inbox.v1", "lx.look-sync.v1"].includes(e.name)) }));
  const twinContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: state });
  const twin = await twinContext.newPage();
  watch(twin, "twin");
  try {
    await Promise.all([page.reload(), twin.goto(`${BASE}/app/`)]);
    await Promise.all([page, twin].map((p) => p.waitForSelector("html[data-app-ready]", { timeout: 60_000 })));
    // A start's own rounds (the first sync's packs each nudge the inbox) settle first.
    const settled = Date.now() + 20_000;
    const rounds = (p, path) => polls.get(p).filter((x) => x.path === path && x.at >= settled).map((x) => x.at);
    const limit = Date.now() + 7 * 60_000;
    while (Date.now() < limit && Math.min(rounds(page, "/api/look").length, rounds(twin, "/api/look").length) < 5) await sleep(1000);
    const waits = (list) => list.slice(1).map((at, i) => at - list[i]);
    const shown = (list) => list.map((ms) => `${(ms / 1000).toFixed(1)}`).join(", ");
    const a = waits(rounds(page, "/api/look")).slice(0, 4);
    const b = waits(rounds(twin, "/api/look")).slice(0, 4);
    assert(a.length === 4 && b.length === 4, `look rounds in 7 min: ${a.length + 1} and ${b.length + 1}`);
    // Each a wait of 54–66 s plus the round's own time.
    assert([...a, ...b].every((ms) => ms >= 53_500 && ms <= 69_000), `a look wait outside 54–66 s: ${shown(a)} | ${shown(b)}`);
    // In lockstep each of one app's waits matches the other's to a round's time (tens of ms). Jittered, all four within 1 s of each
    // other is about once in 1,500 runs.
    const apart = a.map((ms, i) => Math.abs(ms - b[i]));
    assert(Math.max(...apart) > 1000, `in lockstep (s): ${shown(a)} | ${shown(b)}`);
    const ia = waits(rounds(page, "/api/packs/inbox")).slice(0, 4);
    const ib = waits(rounds(twin, "/api/packs/inbox")).slice(0, 4);
    return `look waits ${shown(a)} s and ${shown(b)} s (apart by up to ${(Math.max(...apart) / 1000).toFixed(1)} s); inbox ${shown(ia)} s and ${shown(ib)} s`;
  } finally {
    await twinContext.close();
    polls.delete(twin);
  }
});

await stage("a look changed on another device arrives within a minute", async () => {
  const state = await context.storageState();
  state.origins = state.origins.map((o) => ({ ...o, localStorage: o.localStorage.filter((e) => !["lx.pack-inbox.v1", "lx.text-inbox.v1", "lx.look-sync.v1"].includes(e.name)) }));
  const second = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: state });
  other = await second.newPage();
  watch(other, "B");
  await other.goto(`${BASE}/app/`);
  await other.waitForSelector("html[data-app-ready]", { timeout: 60_000 });
  await sleep(3000);
  assert((await token(page, "--m-right")) !== "#2f7fe0", "the color isn't there already");
  await other.evaluate(async () => (await import("/js/lx/theme.js")).setToken("--m-right", "#2f7fe0"));
  const ms = await within(70_000, async () => (await token(page, "--m-right")) === "#2f7fe0", "the other device's look");
  return `arrived in ${(ms / 1000).toFixed(1)} s`;
});

await stage("a look changed while the app is hidden arrives at once when it comes back into view", async () => {
  await setHidden(page, true);
  await other.evaluate(async () => (await import("/js/lx/theme.js")).setToken("--m-right", "#1166cc"));
  // Long enough for the other device to send it and for any poll that wasn't stopped to fetch it.
  await sleep(6000);
  assert((await token(page, "--m-right")) === "#2f7fe0", "hidden, the app took it anyway (a poll ran while hidden)");
  await setHidden(page, false);
  const ms = await within(5000, async () => (await token(page, "--m-right")) === "#1166cc", "on coming into view");
  return `${(ms / 1000).toFixed(1)} s after coming into view`;
});

await stage("your AI's new pack, on a device that hasn't heard of the AI: within a minute, and at once on coming into view", async () => {
  aiToken = await page.evaluate(async () => (await (await fetch("/api/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Pace check" }) })).json()).token);
  assert(aiToken?.startsWith("lct_"), "a token for the AI");
  assert((await page.evaluate(async () => (await import("/js/shell/layout.js")).aiConnected())) === false, "the device wasn't told");
  const first = await tool("create_pack", { name: "Pace one", language: "nl" });
  const ms = await within(70_000, () => packHere(page, first.pack_id), "the AI's first pack");
  await setHidden(page, true);
  const second = await tool("create_pack", { name: "Pace two", language: "nl" });
  await sleep(6000);
  assert(!(await packHere(page, second.pack_id)), "hidden, the app took the second pack anyway");
  await setHidden(page, false);
  const back = await within(5000, () => packHere(page, second.pack_id), "the second pack on coming into view");
  return `first in ${(ms / 1000).toFixed(1)} s; the second ${(back / 1000).toFixed(1)} s after coming into view`;
});

await stage("told of the AI (as the AI section's page does), both polls go back to the AI's pace: the control", async () => {
  await page.evaluate(async () => {
    const { whoAmI } = await import("/js/shell/api.js");
    const { setAiConnected } = await import("/js/shell/layout.js");
    // Not heard of yet (coming back into view may have asked /api/me in the stage before, leaving the polls at the idle pace), then told.
    setAiConnected(false);
    setAiConnected((await whoAmI()).aiConnected);
  });
  assert(await page.evaluate(async () => (await import("/js/shell/layout.js")).aiConnected()), "the device knows of its AI");
  const counts = await inUse(page, 30_000);
  // Every 4 and 5 s, each round's own time added: about 7 and 6 in 30 s.
  assert(counts.look >= 5 && counts.inbox >= 4, `in 30 s: ${JSON.stringify(counts)}`);
  return `in 30 s in use: look ${counts.look}, inbox ${counts.inbox}`;
});

await stage("the account deleted", async () => {
  const r = await page.evaluate(async () => (await fetch("/api/me", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "delete my account" }) })).status);
  assert(r === 200, `delete: ${r}`);
});

await browser.close();
const failed = results.filter((r) => !r.ok);
writeFileSync(join(OUT, "poll-pace-check.json"), JSON.stringify({ results, problems }, null, 2));
// A deleted account's last polls answer 401 in the console: not a problem.
const real = problems.filter((p) => !/401/.test(p));
if (real.length) console.log(`problems:\n  ${real.join("\n  ")}`);
console.log(failed.length || real.length ? `FAILED: ${failed.length} stage(s), ${real.length} problem(s)` : `all ${results.length} stages passed`);
process.exit(failed.length || real.length ? 1 : 0);
