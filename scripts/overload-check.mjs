// The app when the server is overloaded (lx/retry.js), on a phone in Chrome, a new account, through a server in front of a local copy that
// answers as the live site answers a D1 overload (scripts/fixtures/overload-server.mjs: 503, Retry-After: 1, code "overloaded"):
// - a sign-up and its first start with every request to /api/ and /library/packs/ refused once: each tried again after its Retry-After and
//   answered, nothing on the screen about it;
// - a return start (a reload) the same;
// - the app in use for 90 s at the AI's pace (the polls every 4 and 5 s), the tabs pressed, 40% of those requests refused at random (never
//   four in a row for one route, so three tries again always reach an answer): every one answered, each wait at least its Retry-After and
//   within its window, never more than three tries again, the polls keeping their pace, nothing on the screen;
// - a write the server doesn't say was left unapplied is sent once (the caller gets the server's words); one it says was is sent again;
// - back online after the network goes: the polls come back spread over 0–30 s, not at once (four returns).
// The app from before (no retry, the polls at once on `online`) fails all five: its sign-up stops at the server's words, its return start's
// look never agrees, an error with Retry comes up in use, a write said unapplied isn't sent again, and both polls come back at 0.0 s.
// Each of the page's calls is tagged (an init script around fetch, keyed by the call's own init, which every try of a call shares) so the
// server's log tells a call's tries from another call. Service workers blocked: every request reaches the server.
//   node scripts/overload-check.mjs http://localhost:<port> <outDir> --upstream <the copy's port>
// The copy runs behind it: wrangler dev --port <upstream> --var PUBLIC_ORIGIN:http://localhost:<port> --local-upstream localhost:<port>
// (its origin is this server's). Through gpu.py's parallel lane; LOCAL only, it makes an account (exit 0 = pass).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "./quiet-browser.mjs";
import { startOverloadServer } from "./fixtures/overload-server.mjs";

const argv = process.argv.slice(2);
const [BASE, OUT = "overload-check-out"] = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--upstream");
const UPSTREAM = Number(argv[argv.indexOf("--upstream") + 1]);
const port = Number(/^http:\/\/localhost:(\d+)$/.exec(BASE ?? "")?.[1]);
if (!port || !UPSTREAM || argv.indexOf("--upstream") < 0) {
  console.error("Usage: overload-check.mjs http://localhost:<port> <outDir> --upstream <the copy's port> (a local copy whose origin is http://localhost:<port>)");
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });
const server = await startOverloadServer({ port, upstream: UPSTREAM, log: join(OUT, "requests.jsonl") });

const results = [];
const problems = [];
async function stage(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ stage: name, ok: true, ms: Date.now() - started, detail });
    console.log(`ok    ${name}${detail ? `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
    return true;
  } catch (error) {
    results.push({ stage: name, ok: false, ms: Date.now() - started, error: String(error?.message ?? error) });
    console.log(`FAIL  ${name}: ${error?.message ?? error}`);
    return false;
  }
}
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REFUSED = { match: /^\/api\/|^\/library\/packs\// };
// What retry.js waits: the Retry-After (1 s) plus up to its window (0.5, 1, 2 s); the slack is the time a request takes to come back.
const WINDOWS = [500, 1000, 2000];
const SLACK = 1500;
// The writes that do the same done twice (retry.js's callers say so): tried again with nothing said about them.
const IDEMPOTENT = [/^PUT \/api\/packs\/device$/, /^PUT \/api\/look\/images\//];
const READ = /^(GET|HEAD) /;

const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--mute-audio"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: "block", colorScheme: "dark" });
// Every call the page makes tagged, the same on each of its tries (fetchRetrying hands fetch the same init object every time).
await context.addInitScript(() => {
  const real = window.fetch;
  const ids = new WeakMap();
  const page = Math.random().toString(36).slice(2, 8);
  let n = 0;
  window.fetch = function (input, init) {
    let id = init && typeof init === "object" ? ids.get(init) : undefined;
    if (id === undefined) {
      id = `${page}-${++n}`;
      if (init && typeof init === "object") ids.set(init, id);
    }
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set("x-check-call", id);
    return real.call(this, input, { ...init, headers });
  };
});
const page = await context.newPage();
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

/** What a person would read as something gone wrong, on the screen now. */
const TROUBLE = /try again|couldn.t be reached|went wrong|very busy|problem on its side|\bretry\b/i;
async function trouble(p) {
  return p.evaluate((source) => {
    const re = new RegExp(source, "i");
    const seen = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const box = node.parentElement?.getBoundingClientRect();
      const style = node.parentElement && getComputedStyle(node.parentElement);
      if (!box || !box.width || style.visibility === "hidden" || style.display === "none" || box.bottom < 0 || box.top > innerHeight) continue;
      if (re.test(node.textContent)) seen.push(node.textContent.trim().slice(0, 120));
    }
    return seen;
  }, TROUBLE.source);
}

/** Polls inside the page until it holds (the packs here, or the look agreed with the account); the ms it took, or throws past limit. */
async function until(p, what, limit) {
  const ms = await p.evaluate(
    async ({ what, limit }) => {
      const holds = async () => {
        // (Read through the module each time: content.js's tables are replaced on every build.)
        if (what === "the packs") return (await import("/js/study/content.js")).PACKS.length > 0;
        const status = (await import("/js/lx/look-sync.js")).getSyncStatus();
        return status.ok && status.at > 0;
      };
      const from = Date.now();
      while (Date.now() - from < limit) {
        if (await holds()) return Date.now() - from;
        await new Promise((r) => setTimeout(r, 200));
      }
      return -1;
    },
    { what, limit },
  );
  assert(ms >= 0, `${what}: not within ${limit / 1000} s`);
  return ms;
}
const lookAgreed = async () => {
  const status = (await import("/js/lx/look-sync.js")).getSyncStatus();
  return status.ok && status.at > 0;
};

/** Every call in the server's log since `from`, its tries in order. */
function callsSince(from) {
  const calls = new Map();
  for (const entry of server.requests.slice(from)) {
    if (!entry.call || !REFUSED.match.test(entry.path)) continue;
    if (!calls.has(entry.call)) calls.set(entry.call, []);
    calls.get(entry.call).push(entry);
  }
  return [...calls.values()];
}
/** What retrying should have made of the calls since `from`: each refused one answered in its tries, each wait in its window. */
function judge(from) {
  const calls = callsSince(from);
  const faults = [];
  let refused = 0;
  let waits = [];
  const routes = new Set();
  for (const tries of calls) {
    const key = `${tries[0].method} ${tries[0].path}`;
    const again = READ.test(key) || IDEMPOTENT.some((r) => r.test(key));
    if (!tries.some((t) => t.refused)) continue;
    refused++;
    routes.add(key.replace(/\/[0-9a-f]{12}\//, "/:v/"));
    if (tries.length > 4) faults.push(`${key}: ${tries.length} tries`);
    for (let i = 1; i < tries.length; i++) {
      const wait = tries[i].at - tries[i - 1].at;
      waits.push(wait);
      if (wait < 1000) faults.push(`${key}: tried again ${wait} ms after a refusal asking for 1 s`);
      if (wait > 1000 + WINDOWS[i - 1] + SLACK) faults.push(`${key}: try ${i + 1} ${wait} ms after the one before (its window ends at ${1000 + WINDOWS[i - 1]})`);
    }
    const last = tries[tries.length - 1];
    if (last.refused && (again || last.applied === false)) faults.push(`${key}: still refused after ${tries.length} ${tries.length === 1 ? "try" : "tries"}`);
    if (!again && tries.some((t, i) => t.refused && t.applied !== false && i < tries.length - 1)) faults.push(`${key}: a write not said unapplied was sent again`);
  }
  waits = waits.sort((a, b) => a - b);
  return { calls: calls.length, refused, faults, routes: [...routes].sort(), waits: waits.length ? `${waits[0]}–${waits[waits.length - 1]} ms` : "none" };
}
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) }).catch(() => {});
/** Waits (15 s at most) until no call refused since `from` is still inside its retry's wait, so a stage is judged on what the app did, not
 *  on a retry due a moment after the stage ends (and then ended by the next stage's reload). */
async function retriesDone(from) {
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    const waiting = callsSince(from).filter((tries) => {
      const last = tries[tries.length - 1];
      return last.refused && tries.length <= WINDOWS.length && server.now() - last.at < 1000 + WINDOWS[tries.length - 1] + SLACK;
    });
    if (!waiting.length) return;
    await sleep(200);
  }
}

// ---------- starts ----------
let signedUp = false;
await stage("a sign-up and its first start, every request to /api/ and /library/packs/ refused once: each answered, nothing on the screen", async () => {
  const from = server.requests.length;
  server.setRule({ mode: "every-first", ...REFUSED });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Overload Check");
  await page.click('#register button[type="submit"]');
  try {
    await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 20_000 });
  } catch {
    const seen = await trouble(page);
    await shot("sign-up-refused");
    throw new Error(`the sign-up didn't go through${seen.length ? `; on the screen: ${seen.join(" | ")}` : ""}`);
  }
  signedUp = true;
  await page.waitForSelector("html[data-app-ready]", { timeout: 30_000 });
  await until(page, "the packs", 45_000);
  await until(page, "the look agreed", 30_000);
  await sleep(6000);
  await shot("first-start");
  const seen = await trouble(page);
  await retriesDone(from);
  const verdict = judge(from);
  assert(!seen.length, `on the screen: ${seen.join(" | ")}`);
  assert(verdict.refused >= 6, `only ${verdict.refused} calls refused (the rule didn't reach the start)`);
  assert(!verdict.faults.length, verdict.faults.slice(0, 6).join("; "));
  return `${verdict.refused} calls refused once, each answered (waits ${verdict.waits}): ${verdict.routes.join(", ")}`;
});
if (!signedUp) {
  // The app from before stops at its sign-up: sign up with nothing refused, so the stages after it still run.
  server.setRule({ mode: "pass" });
  await page.goto(`${BASE}/app/`);
  await page.waitForURL(/\/login\?next=/);
  await page.click("summary");
  await page.fill('input[name="name"]', "Overload Check");
  await page.click('#register button[type="submit"]');
  await page.waitForFunction(() => location.pathname === "/app/", null, { timeout: 60_000 });
  await page.waitForSelector("html[data-app-ready]", { timeout: 30_000 });
  await until(page, "the packs", 45_000);
}

await stage("a return start (a reload), every request refused once: each answered, nothing on the screen", async () => {
  const from = server.requests.length;
  server.setRule({ mode: "every-first", ...REFUSED });
  await page.reload();
  await page.waitForSelector("html[data-app-ready]", { timeout: 30_000 });
  await until(page, "the packs", 30_000);
  await until(page, "the look agreed", 30_000);
  await sleep(6000);
  await shot("return-start");
  const seen = await trouble(page);
  await retriesDone(from);
  const verdict = judge(from);
  assert(!seen.length, `on the screen: ${seen.join(" | ")}`);
  assert(verdict.refused >= 4, `only ${verdict.refused} calls refused`);
  assert(!verdict.faults.length, verdict.faults.slice(0, 6).join("; "));
  return `${verdict.refused} calls refused once, each answered (waits ${verdict.waits}): ${verdict.routes.join(", ")}`;
});

// ---------- in use ----------
await stage("90 s in use at the AI's pace, the tabs pressed, 40% refused at random (never 4 in a row): every call answered, the polls on pace", async () => {
  server.setRule({ mode: "pass" });
  // The polls at the AI's pace (every 4 and 5 s while in use), as a device that knows of its AI: many rounds in 90 s.
  await page.evaluate(async () => (await import("/js/shell/layout.js")).setAiConnected(true));
  await sleep(1000);
  const from = server.requests.length;
  server.setRule({ mode: "share", share: 0.4, inARow: 3, seed: 7, ...REFUSED });
  const tabs = ['a[href="#study"]', 'a[href="#know"]', 'a[href="#explore"]', 'a[href="#today"]'];
  const start = Date.now();
  let pressed = 0;
  const seenAll = new Set();
  while (Date.now() - start < 90_000) {
    const tab = page.locator(tabs[pressed++ % tabs.length]).first();
    if (await tab.count()) await tab.tap().catch(() => {});
    for (let i = 0; i < 4; i++) {
      await sleep(2500);
      for (const words of await trouble(page)) seenAll.add(words);
    }
  }
  server.setRule({ mode: "pass" });
  await sleep(8000);
  await shot("in-use");
  for (const words of await trouble(page)) seenAll.add(words);
  await retriesDone(from);
  const verdict = judge(from);
  const polls = server.requests.slice(from).filter((r) => r.method === "GET" && (r.path === "/api/look" || r.path === "/api/packs/inbox"));
  const looks = new Set(polls.filter((r) => r.path === "/api/look").map((r) => r.call)).size;
  const inbox = new Set(polls.filter((r) => r.path === "/api/packs/inbox").map((r) => r.call)).size;
  assert(!seenAll.size, `on the screen: ${[...seenAll].join(" | ")}`);
  assert(!verdict.faults.length, verdict.faults.slice(0, 6).join("; "));
  // At 4 and 5 s a round, each round's own time and retries added: well over 8 of each in 90 s.
  assert(looks >= 8 && inbox >= 8, `the polls fell behind: ${looks} looks and ${inbox} inbox rounds in 90 s`);
  assert(await page.evaluate(lookAgreed), "the look's last round failed");
  return `${verdict.calls} calls, ${verdict.refused} met a refusal, each answered (waits ${verdict.waits}); ${looks} look rounds, ${inbox} inbox rounds; ${pressed} tab presses`;
});

// ---------- writes ----------
await stage("a write the server doesn't say was left unapplied is sent once, its caller given the server's words; one it says was is sent again", async () => {
  server.setRule({ mode: "every-first", match: /^\/api\/notes$/, applied: false });
  let from = server.requests.length;
  const first = await page.evaluate(async () => {
    const { post } = await import("/js/shell/api.js");
    try {
      await post("/api/notes", { text: "overload check: not applied unknown" });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message, code: error.code };
    }
  });
  await sleep(4000);
  const sent = server.requests.slice(from).filter((r) => r.method === "POST" && r.path === "/api/notes");
  assert(sent.length === 1, `sent ${sent.length} times`);
  assert(!first.ok && first.code === "overloaded" && /very busy/.test(first.message), `the caller got: ${JSON.stringify(first)}`);
  server.setRule({ mode: "every-first", match: /^\/api\/notes$/, applied: true });
  from = server.requests.length;
  const second = await page.evaluate(async () => {
    const { post } = await import("/js/shell/api.js");
    try {
      await post("/api/notes", { text: "overload check: said not applied" });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: error.message };
    }
  });
  const again = server.requests.slice(from).filter((r) => r.method === "POST" && r.path === "/api/notes");
  server.setRule({ mode: "pass" });
  assert(second.ok && again.length === 2 && again[0].status === 503 && again[1].status === 200, `said unapplied: ${JSON.stringify(second)}, ${again.map((r) => r.status)}`);
  return `once with nothing said ("${first.message}"); twice when said unapplied, ${again[1].at - again[0].at} ms apart`;
});

// ---------- back online ----------
await stage("back online: the polls come back spread over 0–30 s, not at once (four returns)", async () => {
  server.setRule({ mode: "pass" });
  // Each poll back to once a minute, so its own next round rarely lands in a return's 30 s. A return is over when both polls have
  // asked (they wait together, retry.js onReconnect); the app from before asks at once.
  await page.evaluate(async () => (await import("/js/shell/layout.js")).setAiConnected(false));
  const delays = [];
  for (let i = 0; i < 4; i++) {
    await context.setOffline(true);
    await sleep(3000);
    const from = server.requests.length;
    await context.setOffline(false);
    const back = server.now();
    const firstOf = (path) => server.requests.slice(from).find((r) => r.method === "GET" && r.path === path);
    const limit = Date.now() + 40_000;
    while (Date.now() < limit && !(firstOf("/api/look") && firstOf("/api/packs/inbox"))) await sleep(100);
    const look = firstOf("/api/look");
    const inbox = firstOf("/api/packs/inbox");
    assert(look && inbox, `return ${i + 1}: ${look ? "" : "no look poll "}${inbox ? "" : "no inbox poll "}within 40 s`);
    delays.push(Math.max(look.at, inbox.at) - back);
  }
  const shown = delays.map((d) => `${(d / 1000).toFixed(1)} s`).join(", ");
  // A draw from 0–30 s falls under 1 s one time in thirty: two of four would be once in about 150 runs.
  assert(delays.filter((d) => d < 1000).length <= 1, `at once: ${shown}`);
  assert(delays.every((d) => d <= 30_000 + SLACK), `past 30 s: ${shown}`);
  assert(await page.evaluate(lookAgreed), "the look's last round failed");
  return `both polls back after ${shown}`;
});

await browser.close();
await server.close();
writeFileSync(join(OUT, "results.json"), JSON.stringify({ results, problems }, null, 2));
if (problems.length) console.log(`problems:\n  ${problems.slice(0, 20).join("\n  ")}`);
const failed = results.filter((r) => !r.ok).length + (problems.length ? 1 : 0);
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
